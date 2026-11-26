import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";

import type { HostBreez, HostParsed, HostPayment, HostQuote } from "../src/lib/engine/host";
import { decodeBolt11 } from "../src/lib/lightning/bolt11";

/**
 * A fake of the Breez SDK the iOS extension's host gives its engine (HostBreez)
 * for the engine's tests. As the SDK does: one instance per storage at a time, calls refused on an
 * instance disconnected, an invoice prepared then paid once per idempotency key, from the balance
 * of the wallet of its words, with the preimage of the invoice's hash. Every answer on a later
 * turn, as the host's queue gives them.
 */
export type FakeBreezWallet = {
  identityPubkey: string;
  balanceSats: bigint;
  /** The Lightning fee each payment quotes. */
  feeSats: bigint;
  payments: HostPayment[];
  /** Preimages known for the hashes of the invoices paid (else none: a payment left pending). */
  preimages: Map<string, string>;
};

type FakeInstance = {
  id: number;
  mnemonic: string;
  storage: string;
  synced: () => void;
  disconnected: boolean;
  released: boolean;
  quotes: Map<string, { bolt11: string; amountSats: bigint; feeSats: bigint }>;
};

export type FakeBreez = Omit<HostBreez, "connectProbe"> & {
  connectProbe: NonNullable<HostBreez["connectProbe"]>;
  /** The wallets, by their words. */
  wallets: Map<string, FakeBreezWallet>;
  instances: Map<number, FakeInstance>;
  /** An error's message the next call of that name answers with. */
  fail: Partial<Record<keyof HostBreez, string>>;
  /** Overrides what `parse` answers. */
  parsed: ((input: string) => HostParsed) | null;
  /** Overrides what `prepareBolt11` answers. */
  quoted: ((quote: HostQuote) => unknown) | null;
  /** Tells `Synced` on the instance `id`. */
  tellSynced(id: number): void;
  /** The instances neither disconnected nor released. */
  live(): FakeInstance[];
};

/**
 * The key of `wallets` of the probe's test wallet (`connectProbe`), whose seed the host keeps: no
 * BIP-39 words are ever this.
 */
export const PROBE_WALLET = "(the probe's test wallet)";

export function fakeBreezWallet(seed: number, balanceSats: bigint): FakeBreezWallet {
  return {
    identityPubkey: `02${seed.toString(16).padStart(2, "0").repeat(32)}`,
    balanceSats,
    feeSats: 2n,
    payments: [],
    preimages: new Map()
  };
}

/** The preimage and hash of `seed`, for an invoice the fake's wallet can settle. */
export function fakePreimage(seed: number): { preimage: string; paymentHash: string } {
  const preimage = new Uint8Array(32).fill(seed & 0xff);
  return { preimage: bytesToHex(preimage), paymentHash: bytesToHex(sha256(preimage)) };
}

export function fakeBreez(): FakeBreez {
  let next = 1;
  const later = (run: () => void) => setTimeout(run, 0);

  const fails = (name: keyof HostBreez, done: (value: null, error: string) => void): boolean => {
    const error = breez.fail[name];
    if (error === undefined) return false;
    delete breez.fail[name];
    later(() => done(null, error));
    return true;
  };

  const usable = (id: number): FakeInstance => {
    const instance = breez.instances.get(id);
    if (!instance || instance.disconnected || instance.released) throw new Error("disconnected");
    return instance;
  };

  const answer = <T>(done: (value: T | null, error: string | null) => void, run: () => T) =>
    later(() => {
      let value: T;
      try {
        value = run();
      } catch (error) {
        done(null, (error as Error).message);
        return;
      }
      done(value, null);
    });

  const walletOf = (instance: FakeInstance): FakeBreezWallet => {
    const wallet = breez.wallets.get(instance.mnemonic);
    if (!wallet) throw new Error("No such wallet");
    return wallet;
  };

  /** Connects the wallet of `mnemonic` on `storage`, as the host does. */
  const open = (
    mnemonic: string,
    storage: string,
    synced: () => void,
    done: (id: number | null, error: string | null) => void
  ) =>
    answer(done, () => {
      if (!breez.wallets.has(mnemonic)) throw new Error("No such wallet");
      if ([...breez.instances.values()].some((i) => i.storage === storage && !i.released)) {
        throw new Error("The storage is in use");
      }
      const id = next++;
      breez.instances.set(id, {
        id,
        mnemonic,
        storage,
        synced,
        disconnected: false,
        released: false,
        quotes: new Map()
      });
      return id;
    });

  const breez: FakeBreez = {
    wallets: new Map(),
    instances: new Map(),
    fail: {},
    parsed: null,
    quoted: null,

    tellSynced(id) {
      breez.instances.get(id)?.synced();
    },

    live: () => [...breez.instances.values()].filter((i) => !i.disconnected && !i.released),

    connect(mnemonic, storage, synced, done) {
      if (fails("connect", done)) return;
      open(mnemonic, storage, synced, done);
    },

    connectProbe(storage, synced, done) {
      if (fails("connectProbe", done)) return;
      open(PROBE_WALLET, storage, synced, done);
    },

    disconnect(id, done) {
      if (fails("disconnect", done)) return;
      answer(done, () => {
        usable(id).disconnected = true;
        return true;
      });
    },

    release(id) {
      const instance = breez.instances.get(id);
      if (!instance?.disconnected) throw new Error("Released before it disconnected");
      instance.released = true;
    },

    info(id, _ensureSynced, done) {
      if (fails("info", done)) return;
      answer(done, () => {
        const wallet = walletOf(usable(id));
        return { identityPubkey: wallet.identityPubkey, balanceSats: String(wallet.balanceSats) };
      });
    },

    parse(id, input, done) {
      if (fails("parse", done)) return;
      answer(done, () => {
        usable(id);
        if (breez.parsed) return breez.parsed(input);
        const invoice = decodeBolt11(input);
        if (!invoice) return { tag: "other" } satisfies HostParsed;
        return {
          tag: "bolt11",
          bolt11: input,
          network:
            invoice.network === "bc" ? "bitcoin" : invoice.network === "bcrt" ? "regtest" : "other",
          amountMsat: invoice.amountMsat === null ? null : String(invoice.amountMsat),
          timestamp: String(invoice.timestamp),
          expiry: String(invoice.expirySeconds),
          description: invoice.description ?? null
        } satisfies HostParsed;
      });
    },

    prepareBolt11(id, bolt11, done) {
      if (fails("prepareBolt11", done)) return;
      answer(done, () => {
        const instance = usable(id);
        const invoice = decodeBolt11(bolt11);
        if (!invoice?.amountMsat) throw new Error("An invoice of its own amount only");
        // Numbered per instance, as a host may: a quote of another instance can share its id.
        const quoteId = `quote-${instance.quotes.size + 1}`;
        const amountSats = invoice.amountMsat / 1000n;
        const { feeSats } = walletOf(instance);
        instance.quotes.set(quoteId, { bolt11, amountSats, feeSats });
        const quote: HostQuote = {
          quoteId,
          amountSats: String(amountSats),
          method: "bolt11",
          lightningFeeSats: String(feeSats),
          feesExcluded: true
        };
        return (breez.quoted ? breez.quoted(quote) : quote) as HostQuote;
      });
    },

    send(id, quoteId, idempotencyKey, _untilSent, _timeout, done) {
      if (fails("send", done)) return;
      answer(done, () => {
        const instance = usable(id);
        const quote = instance.quotes.get(quoteId);
        if (!quote) throw new Error("No such quote");
        const wallet = walletOf(instance);
        const paid = wallet.payments.find((payment) => payment.id === `pay-${idempotencyKey}`);
        if (paid) return paid;
        const total = quote.amountSats + quote.feeSats;
        if (wallet.balanceSats < total) throw new Error("Insufficient funds");
        const invoice = decodeBolt11(quote.bolt11);
        const paymentHash = invoice?.paymentHash ?? "";
        const preimage = wallet.preimages.get(paymentHash) ?? null;
        if (preimage !== null && bytesToHex(sha256(hexToBytes(preimage))) !== paymentHash) {
          throw new Error("A preimage of another hash");
        }
        wallet.balanceSats -= total;
        const payment: HostPayment = {
          id: `pay-${idempotencyKey}`,
          type: "send",
          status: preimage === null ? "pending" : "completed",
          amount: String(quote.amountSats),
          fees: String(quote.feeSats),
          timestamp: String(Math.floor(Date.now() / 1000)),
          method: "lightning",
          details: {
            tag: "lightning",
            description: invoice?.description ?? null,
            lnAddress: null,
            senderComment: null,
            paymentHash,
            preimage
          }
        };
        wallet.payments.push(payment);
        return payment;
      });
    },

    getPayment(id, paymentId, done) {
      if (fails("getPayment", done)) return;
      answer(done, () => {
        const payment = walletOf(usable(id)).payments.find((p) => p.id === paymentId);
        if (!payment) throw new Error("No such payment");
        return payment;
      });
    }
  };
  return breez;
}
