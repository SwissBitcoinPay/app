import { getBreezNetwork } from "@/lib/breez/config";
import { createWalletConnection } from "@/lib/breez/connection";
import { SendError, WalletError } from "@/lib/breez/errors";
import { createNetworkSync } from "@/lib/breez/network-sync";
import {
  bolt11Destination,
  walletPaymentOf,
  type SdkBolt11View,
  type SdkPaymentView
} from "@/lib/breez/sdk-read";
import {
  SEND_COMPLETION_TIMEOUT_SECS,
  checkFeesExcluded,
  checkQuotedAmount,
  normalizeSendInput
} from "@/lib/breez/send-input";
import type { PreparedSend, SendQuote, Wallet, WalletSeed } from "@/lib/breez/types";
import { decodeBolt11 } from "@/lib/lightning/bolt11";

import { engineBreez, type HostBreez } from "./host";

/*
 * A card's wallet in the iOS extension's engine: the Swift build of the Breez SDK, through the
 * host (HostBreez), behind the same `Wallet` as the app's (src/lib/breez/wallet.ts), so that the
 * card payment core (src/features/card/payment-core.ts) pays the same way in both. The connection
 * and the proof of a sync are the app's own (connection.ts, network-sync.ts), and so is the reading
 * of what the SDK gives (sdk-read.ts).
 *
 * Only what a card payment uses: its id and balance, a Lightning invoice read, prepared, paid, and
 * its payment read. Anything else is `unavailable` here. An input is given to the SDK's `parse`
 * only once read as a Lightning invoice (decodeBolt11): `parse` asks the server of a Lightning
 * address or an LNURL, which the extension never reaches.
 */

/**
 * What `connect` takes here: the words of a card's wallet (engineSeed), or the test wallet of the
 * extension's probe, whose seed the host keeps (engineProbeSeed).
 */
type EngineSeed = { readonly mnemonic: string } | { readonly probe: true };

/** The seed of the words `mnemonic`, for `connect` (no passphrase, as the app's mnemonicSeed). */
export function engineSeed(mnemonic: string): WalletSeed {
  return { mnemonic } as EngineSeed as unknown as WalletSeed;
}

/** The probe's test wallet (HostBreez `connectProbe`): its seed never reaches the engine. */
export function engineProbeSeed(): WalletSeed {
  return { probe: true } as EngineSeed as unknown as WalletSeed;
}

/** An SDK instance of the host: its id there. */
type Instance = { readonly id: number; disconnect(): Promise<void> };

/** What `PreparedSend` holds here: the host's quote and the instance that keeps it. */
type Prepared = { readonly instance: number; readonly quoteId: string };

const DECIMAL = /^(0|[1-9][0-9]{0,19})$/;

/** `value`, a whole number in decimal from the host, as a bigint; throws otherwise. */
function decimal(value: unknown, what: string): bigint {
  if (typeof value !== "string" || !DECIMAL.test(value)) {
    throw new WalletError("requestFailed", `Unexpected ${what} from the SDK`);
  }
  return BigInt(value);
}

function text(value: unknown, what: string): string {
  if (typeof value !== "string") throw new WalletError("requestFailed", `Unexpected ${what}`);
  return value;
}

/** An optional text: undefined for null. */
function optionalText(value: unknown, what: string): string | undefined {
  return value === null || value === undefined ? undefined : text(value, what);
}

function oneOf<T extends string>(value: unknown, values: readonly T[], what: string): T {
  if (!values.includes(value as T)) throw new WalletError("requestFailed", `Unexpected ${what}`);
  return value as T;
}

function record(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new WalletError("requestFailed", `Unexpected ${what}`);
  }
  return value as Record<string, unknown>;
}

/** A payment as the host gives it (HostPayment), checked, as sdk-read.ts reads it. */
export function readHostPayment(value: unknown): SdkPaymentView {
  const payment = record(value, "payment");
  const view: SdkPaymentView = {
    id: text(payment.id, "payment id"),
    type: oneOf(payment.type, ["send", "receive"], "payment type"),
    status: oneOf(payment.status, ["completed", "failed", "pending"], "payment status"),
    amount: decimal(payment.amount, "payment amount"),
    fees: decimal(payment.fees, "payment fees"),
    timestamp: decimal(payment.timestamp, "payment timestamp"),
    method: oneOf(
      payment.method,
      ["lightning", "spark", "token", "deposit", "withdraw", "unknown"],
      "payment method"
    )
  };
  if (payment.details === null || payment.details === undefined) return view;
  const details = record(payment.details, "payment details");
  switch (details.tag) {
    case "lightning":
      return {
        ...view,
        details: {
          tag: "lightning",
          description: optionalText(details.description, "description"),
          lnAddress: optionalText(details.lnAddress, "Lightning address"),
          senderComment: optionalText(details.senderComment, "comment"),
          paymentHash: text(details.paymentHash, "payment hash"),
          preimage: optionalText(details.preimage, "preimage")
        }
      };
    case "spark":
      return {
        ...view,
        details: {
          tag: "spark",
          invoiceDescription: optionalText(details.invoiceDescription, "description")
        }
      };
    case "deposit":
    case "withdraw":
      return { ...view, details: { tag: details.tag, txId: text(details.txId, "txid") } };
    case "token":
      return { ...view, details: { tag: "token" } };
    case "other":
      return { ...view, details: { tag: "other" } };
    default:
      throw new WalletError("requestFailed", "Unexpected payment details");
  }
}

/** A Lightning invoice as the host's `parse` gives it (HostParsed), checked; null for another. */
export function readHostParsed(value: unknown): SdkBolt11View | null {
  const parsed = record(value, "parsed input");
  if (parsed.tag === "other") return null;
  if (parsed.tag !== "bolt11") throw new WalletError("requestFailed", "Unexpected parsed input");
  return {
    bolt11: text(parsed.bolt11, "invoice"),
    network: oneOf(parsed.network, ["bitcoin", "regtest", "other"], "network"),
    amountMsat:
      parsed.amountMsat === null || parsed.amountMsat === undefined
        ? undefined
        : decimal(parsed.amountMsat, "invoice amount"),
    timestamp: decimal(parsed.timestamp, "invoice timestamp"),
    expiry: decimal(parsed.expiry, "invoice expiry"),
    description: optionalText(parsed.description, "description")
  };
}

/**
 * The host's call `call` as a promise: its `done` settles it, once; its error's message becomes a
 * rejection, as an error thrown at once does.
 */
function ask<T>(call: (done: (value: T | null, error: string | null) => void) => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    call((value, error) => {
      if (settled) return;
      settled = true;
      if (error === null && value !== null && value !== undefined) resolve(value);
      else reject(new Error(error ?? "The SDK gave no answer"));
    });
  });
}

function unavailable(): Promise<never> {
  return Promise.reject(
    new WalletError("unavailable", "Not done by the card's wallet in the extension")
  );
}

/** A card's wallet in the engine, its SDK storage at `storage` (the host's `connect`). */
export function engineWallet(storage: string, breez: () => HostBreez = engineBreez): Wallet {
  const wallet = createWalletConnection<Instance>((instance) => breez().release(instance.id));
  const networkSync = createNetworkSync(wallet);

  const readInfo = (instance: Instance, ensureSynced: boolean) =>
    ask<{ identityPubkey: unknown; balanceSats: unknown }>((done) =>
      breez().info(instance.id, ensureSynced, done)
    ).then(
      (info) => ({
        identityPubkey: text(record(info, "wallet info").identityPubkey, "wallet id"),
        balanceSats: decimal(info.balanceSats, "balance")
      }),
      (error: unknown) => {
        throw new WalletError("requestFailed", "Could not read the wallet info", { cause: error });
      }
    );

  const notConnected = () => new WalletError("notConnected", "The wallet was disconnected");

  return {
    connect(seed) {
      const given = seed as unknown as EngineSeed;
      return wallet.open(async () => {
        // A `Synced` the host tells before the instance is watched is kept for it.
        let syncedEarly = false;
        let told = () => {
          syncedEarly = true;
        };
        let id: number;
        try {
          const host = breez();
          id = await ask<number>((done) => {
            if ("mnemonic" in given)
              return host.connect(given.mnemonic, storage, () => told(), done);
            if (!host.connectProbe) throw new Error("No test wallet here");
            host.connectProbe(storage, () => told(), done);
          });
        } catch (error) {
          throw new WalletError("connectFailed", "Could not connect the wallet", { cause: error });
        }
        const instance: Instance = {
          id,
          disconnect: () =>
            ask<boolean>((done) => breez().disconnect(id, done)).then(() => undefined)
        };
        // Before anything else uses it: a `Synced` from now on is this connection's.
        await networkSync.watch(instance, async (onSynced) => {
          told = onSynced;
          if (syncedEarly) onSynced();
        });
        return instance;
      });
    },

    isConnected: () => wallet.connected(),
    connectionId: () => wallet.connectionId(),
    subscribe: (listener) => wallet.subscribe(listener),
    waitNetworkSync: () => networkSync.wait(),

    getId() {
      return wallet.use(async (instance) => {
        const { identityPubkey } = await readInfo(instance, false);
        if (!/^[0-9a-f]{2,130}$/i.test(identityPubkey)) {
          throw new WalletError("requestFailed", "Unexpected wallet id");
        }
        return identityPubkey;
      });
    },

    getBalance(ensureSynced) {
      return wallet.use(async (instance, current) => {
        const { balanceSats } = await readInfo(instance, ensureSynced);
        if (!current()) throw notConnected();
        return balanceSats;
      });
    },

    parseSendInput(input) {
      return wallet.use(async (instance, current) => {
        const request = normalizeSendInput(input);
        if (!request) throw new SendError("unrecognized", "Nothing to parse");
        if (decodeBolt11(request) === null) {
          throw new SendError("unsupported", "Only a Lightning invoice is paid here");
        }
        let parsed: SdkBolt11View | null;
        try {
          parsed = readHostParsed(
            await ask<unknown>((done) => breez().parse(instance.id, request, done))
          );
        } catch (error) {
          throw new SendError("unrecognized", "Not a destination the wallet can pay", {
            cause: error
          });
        }
        if (!parsed || parsed.bolt11.toLowerCase() !== request.toLowerCase()) {
          throw new SendError("unsupported", "Only a Lightning invoice is paid here");
        }
        if (!current()) throw notConnected();
        return bolt11Destination(parsed, getBreezNetwork());
      });
    },

    prepareSend(destination, amountSats) {
      return wallet.use(async (instance, current) => {
        if (destination.kind !== "bolt11" || destination.amountSats === null) {
          throw new WalletError("unavailable", "Only an invoice of its own amount is paid here");
        }
        let quote: SendQuote;
        try {
          const prepared = record(
            await ask<unknown>((done) =>
              breez().prepareBolt11(instance.id, destination.request, done)
            ),
            "quote"
          );
          checkFeesExcluded(prepared.feesExcluded === true);
          // Sent over Lightning (HostBreez `send`): its fee only.
          if (prepared.method !== "bolt11") throw new Error("Unexpected payment method");
          quote = {
            kind: "bolt11",
            amountSats: decimal(prepared.amountSats, "quoted amount"),
            fees: { onchain: false, feeSats: decimal(prepared.lightningFeeSats, "fee") },
            expiresAt: null,
            prepared: {
              instance: instance.id,
              quoteId: text(prepared.quoteId, "quote id")
            } satisfies Prepared as unknown as PreparedSend
          };
        } catch (error) {
          throw new WalletError("requestFailed", "Could not prepare the payment", { cause: error });
        }
        checkQuotedAmount(quote, destination, amountSats);
        if (!current()) throw notConnected();
        return quote;
      });
    },

    sendPrepared(quote, options) {
      return wallet.use(async (instance) => {
        const prepared = quote.prepared as unknown as Prepared;
        if (quote.kind !== "bolt11" || prepared.instance !== instance.id) {
          throw new WalletError("requestFailed", "A payment prepared elsewhere");
        }
        let payment: SdkPaymentView;
        try {
          payment = readHostPayment(
            await ask<unknown>((done) =>
              breez().send(
                instance.id,
                prepared.quoteId,
                options.idempotencyKey,
                options.untilSent === true,
                SEND_COMPLETION_TIMEOUT_SECS,
                done
              )
            )
          );
        } catch (error) {
          throw new WalletError("requestFailed", "Could not send the payment", { cause: error });
        }
        // Whatever happens to the connection now, the payment left: its outcome is reported.
        return { id: payment.id, status: walletPaymentOf(payment)?.status ?? "pending" };
      });
    },

    getPayment(id) {
      return wallet.use(async (instance, current) => {
        let payment: SdkPaymentView;
        try {
          payment = readHostPayment(
            await ask<unknown>((done) => breez().getPayment(instance.id, id, done))
          );
        } catch (error) {
          throw new WalletError("requestFailed", "Could not read the payment", { cause: error });
        }
        if (!current()) throw notConnected();
        return walletPaymentOf(payment);
      });
    },

    disconnect: () => wallet.close(),

    keepAddressDescription: unavailable,
    getLightningAddress: unavailable,
    countUnclaimedDeposits: unavailable,
    listPendingDeposits: unavailable,
    deleteLightningAddress: unavailable,
    listPaymentsPage: unavailable,
    newDepositAddress: unavailable,
    prepareDrain: unavailable,
    getSparkAddress: unavailable,
    prepareTransfer: unavailable,
    sendTransfer: unavailable,
    receiveInvoice: unavailable,
    sync: unavailable,
    getRecoverableFunds: unavailable,
    getHourFeeRate: unavailable,
    prepareRecovery: unavailable,
    buildRecovery: unavailable,
    watchChanges: unavailable
  };
}
