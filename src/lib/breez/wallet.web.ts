import type {
  BitcoinChainService,
  BitcoinNetwork,
  BreezSdk,
  Config,
  DepositInfo,
  InputType,
  LnurlPayRequestDetails,
  Payment,
  PrepareLnurlPayResponse,
  PrepareRecoverFundsResponse,
  PrepareSendPaymentResponse,
  RecoverFundsResponse,
  RecoveryMethod as SdkRecoveryMethod,
  SdkEvent,
  Seed,
  SendOnchainSpeedFeeQuote
} from "@breeztech/breez-sdk-spark/web";
import { bytesToHex } from "@noble/hashes/utils.js";

import { decodeBolt11 } from "@/lib/lightning/bolt11";
import { fetchAddressMetadata } from "@/lib/lightning/metadata";
import { logFailure } from "@/lib/log/log";
import { addressHrp, parseDepositAddress } from "@/lib/onchain/address";
import { parseSentAddress } from "@/lib/onchain/sent-address";

import { CARD_WALLETS_NAME, cardWalletPath } from "./card-wallet-names";
import { chainServiceUrls, firstAnswering } from "./chain-node";
import {
  MAX_DEPOSIT_CLAIM_FEE_SATS,
  getBreezNetwork,
  getWalletConfig,
  type BreezNetwork
} from "./config";
import { createWalletConnection } from "./connection";
import { readDeposit, readRefusedClaim } from "./deposits";
import {
  MAX_RECOVERY_FEE_RATE,
  fundingRefused,
  recoveryBuild,
  recoveryFeeRate,
  recoveryLeaf,
  recoveryLeaves,
  recoverySats,
  recoveryTransaction
} from "./recovery";
import { SendError, WalletError } from "./errors";
import { ensureLightningAddress, keepAddressDescription } from "./lightning-address";
import { createNetworkSync } from "./network-sync";
import {
  SEND_COMPLETION_TIMEOUT_SECS,
  checkDrain,
  checkFeesExcluded,
  checkFeesIncluded,
  checkNotExpired,
  checkQuotedAmount,
  invoiceSats,
  isCashtag,
  maxSendableSats,
  minSendableSats,
  normalizeSendInput,
  parseFailure
} from "./send-input";
import type {
  DrainQuote,
  LnurlPayRequest,
  OnchainSpeed,
  PendingDeposit,
  PreparedRecovery,
  PreparedSend,
  PreparedTransfer,
  RecoveryMethod,
  RecoveryTransaction,
  RecoveryWallet,
  SendDestination,
  SendQuote,
  SentPayment,
  TransferQuote,
  Wallet,
  WalletPayment,
  WalletPaymentsPage,
  WalletPaymentsQuery,
  WalletSeed
} from "./types";
import { loadBreezWeb, type BreezWeb } from "./web-sdk";

/**
 * Name under which the web SDK keeps its IndexedDB databases, one per network and wallet (same
 * name as the storage directory on native, storage.ts). Never rename it.
 */
const STORAGE_NAME = "breez-sdk-spark";

async function loadSdk(): Promise<BreezWeb["sdk"]> {
  if (typeof WebAssembly === "undefined") {
    throw new WalletError("unavailable", "This browser does not run WebAssembly");
  }
  try {
    return (await loadBreezWeb()).sdk;
  } catch (error) {
    throw new WalletError("connectFailed", "The Breez SDK web build could not be loaded", {
      cause: error
    });
  }
}

/** As in wallet.ts: the default config, the Breez API key and the deposit claim fee ceiling. */
function createConfig(
  sdk: BreezWeb["sdk"],
  { network, apiKey }: ReturnType<typeof getWalletConfig>
): Config {
  return {
    ...sdk.defaultConfig(network),
    apiKey: apiKey ?? undefined,
    // The web build takes sats as a `number`: 300, exact. No proportional part (wallet.ts).
    maxDepositClaimFee: {
      onchain: { type: "fixed", amount: Number(MAX_DEPOSIT_CLAIM_FEE_SATS) },
      proportionalPpm: undefined
    },
    // As in wallet.ts.
    watchtowerFeeLadderEnabled: true
  };
}

/** As in wallet.ts: `inner` without the watch of deposit addresses in the mempool. */
function withoutAddressWatch(inner: BitcoinChainService): BitcoinChainService {
  return {
    getAddressUtxos: async () => [],
    getAddressTxos: (address) => inner.getAddressTxos(address),
    getTransactionStatus: (txid) => inner.getTransactionStatus(txid),
    tipHeight: () => inner.tipHeight(),
    getTransactionHex: (txid) => inner.getTransactionHex(txid),
    getOutspend: (txid, vout) => inner.getOutspend(txid, vout),
    broadcastTransaction: (tx) => inner.broadcastTransaction(tx),
    recommendedFees: () => inner.recommendedFees()
  };
}

/**
 * As in wallet.ts: what `connect` does, with the wrapped chain service on mainnet, on the storage
 * named `storageName`. The web builder's methods take the builder and give a new one: each step
 * goes on from the returned one. The chain service is made first: the builder holds the seed, and
 * a failure between its steps would leave it to the garbage collector.
 */
async function buildSdk(
  sdk: BreezWeb["sdk"],
  network: BreezNetwork,
  config: Config,
  seed: Seed,
  storageName: string
): Promise<BreezSdk> {
  // As in wallet.ts: the merchant's own node first when the account names one (chain-node.ts).
  const services: BitcoinChainService[] = [];
  if (network === "mainnet") {
    for (const url of chainServiceUrls()) {
      services.push(
        withoutAddressWatch(await sdk.newRestChainService(url, "mainnet", "mempoolSpace"))
      );
    }
  }
  let builder = await sdk.SdkBuilder.new(config, seed).withDefaultStorage(storageName);
  if (services.length > 0) builder = builder.withChainService(firstAnswering(services));
  return builder.build();
}

/** Same as wallet.ts: before the passkey prompt, whether this build can connect a wallet. */
export function checkWalletConfig(): void {
  getWalletConfig();
}

/** The identity public key of `sdk`'s wallet. */
async function identityOf(sdk: BreezSdk): Promise<string> {
  try {
    // Without ensureSynced, the SDK answers from its local storage: no wait on the network.
    const { identityPubkey } = await sdk.getInfo({ ensureSynced: false });
    return identityPubkey;
  } catch (error) {
    throw new WalletError("requestFailed", "Could not read the wallet info", { cause: error });
  }
}

/**
 * Same API and rules as wallet.ts, on the web build of the SDK (WebAssembly, IndexedDB storage
 * named `storageName`): one connection per wallet (connection.ts), whose `free` frees the SDK's
 * Rust object at once, where the browser's FinalizationRegistry frees it at an unknown time, if
 * ever. Only once no call borrows it (connection.ts).
 */
function createWallet(storageName: string): Wallet {
  const wallet = createWalletConnection<BreezSdk>((sdk) => sdk.free());
  const networkSync = createNetworkSync(wallet);

  return {
    connect(seed) {
      return wallet.open(async () => {
        const sdk = await loadSdk();
        const walletConfig = getWalletConfig();
        const config = createConfig(sdk, walletConfig);
        let built: BreezSdk;
        try {
          // The web SDK seed, from passkey.web.ts or seed.web.ts (mnemonicSeed).
          built = await buildSdk(
            sdk,
            walletConfig.network,
            config,
            seed as unknown as Seed,
            storageName
          );
        } catch (error) {
          throw new WalletError("connectFailed", "Could not connect the wallet", { cause: error });
        }
        // At once, as wallet.ts.
        await networkSync.watch(built, (onSynced) =>
          built.addEventListener({
            onEvent: (event: SdkEvent) => {
              if (event.type === "synced") onSynced();
            }
          })
        );
        return built;
      });
    },

    waitNetworkSync: () => networkSync.wait(),

    isConnected: () => wallet.connected(),

    connectionId: () => wallet.connectionId(),

    subscribe: (listener) => wallet.subscribe(listener),

    getId: () => wallet.use(identityOf),

    keepAddressDescription(walletId, description, beforeChange) {
      return wallet.use(async (sdk) => {
        if ((await identityOf(sdk)).toLowerCase() !== walletId.toLowerCase()) {
          throw new WalletError("notConnected", "Another wallet is connected");
        }
        try {
          return await keepAddressDescription(
            sdk,
            description,
            (address) => fetchAddressMetadata(address),
            beforeChange
          );
        } catch (error) {
          throw new WalletError("requestFailed", "Could not update the Lightning address", {
            cause: error
          });
        }
      });
    },

    getLightningAddress(walletId, description) {
      return wallet.use(async (sdk, current) => {
        // Another wallet connected since `walletId` was read: its address must never be saved with
        // this wallet's profile, payments would go to the other account.
        if ((await identityOf(sdk)).toLowerCase() !== walletId.toLowerCase()) {
          throw new WalletError("notConnected", "Another wallet is connected");
        }
        let address: string;
        try {
          address = await ensureLightningAddress(sdk, walletId, description);
        } catch (error) {
          throw new WalletError("requestFailed", "Could not get the Lightning address", {
            cause: error
          });
        }
        // Disconnected, or being disconnected, meanwhile (another account signing in): its caller
        // would save this address as the device's point of sale, over the next account's.
        if (!current()) throw new WalletError("notConnected", "The wallet was disconnected");
        return address;
      });
    },

    // The web build gives the balance as a `number`: read as a bigint here.
    getBalance(ensureSynced) {
      return wallet.use(async (sdk, current) => {
        let balanceSats: number;
        try {
          ({ balanceSats } = await sdk.getInfo({ ensureSynced }));
        } catch (error) {
          throw new WalletError("requestFailed", "Could not read the balance", { cause: error });
        }
        if (!current()) throw new WalletError("notConnected", "The wallet was disconnected");
        return toBigInt(balanceSats, "balance");
      });
    },

    countUnclaimedDeposits() {
      return wallet.use(async (sdk, current) => {
        let deposits: unknown[];
        try {
          ({ deposits } = await sdk.listUnclaimedDeposits({}));
        } catch (error) {
          throw new WalletError("requestFailed", "Could not read the deposits", { cause: error });
        }
        if (!current()) throw new WalletError("notConnected", "The wallet was disconnected");
        return deposits.length;
      });
    },

    // On the web build's shapes (`type` unions, sats as a `number`).
    listPendingDeposits() {
      return wallet.use(async (sdk, current) => {
        let deposits: DepositInfo[];
        try {
          ({ deposits } = await sdk.listUnclaimedDeposits({}));
        } catch (error) {
          throw new WalletError("requestFailed", "Could not read the deposits", { cause: error });
        }
        if (!current()) throw new WalletError("notConnected", "The wallet was disconnected");
        return deposits.flatMap((deposit): PendingDeposit[] => {
          if (deposit.refundTxId !== undefined || deposit.refundTx !== undefined) return [];
          if (deposit.instantClaimStatus?.type === "claimed") return [];
          const read = readDeposit(
            deposit.txid,
            deposit.vout,
            deposit.amountSats,
            deposit.isMature
          );
          if (!read) return [];
          const error = deposit.claimError;
          // As in wallet.ts.
          let claim: Pick<PendingDeposit, "waitsForFees" | "claimFeeSats"> = {
            waitsForFees: false
          };
          if (read.mature && error?.type === "maxDepositClaimFeeExceeded") {
            claim = readRefusedClaim(error.requiredFeeSats, read.amountSats);
          } else if (read.mature && error?.type === "depositTooSmall") {
            claim = { waitsForFees: true };
          }
          return [{ ...read, ...claim }];
        });
      });
    },

    deleteLightningAddress(walletId) {
      return wallet.use(async (sdk, current) => {
        if ((await identityOf(sdk)).toLowerCase() !== walletId.toLowerCase()) {
          throw new WalletError("notConnected", "Another wallet is connected");
        }
        try {
          if (!(await sdk.getLightningAddress())) return false;
          await sdk.deleteLightningAddress();
        } catch (error) {
          throw new WalletError("requestFailed", "Could not delete the Lightning address", {
            cause: error
          });
        }
        if (!current()) throw new WalletError("notConnected", "The wallet was disconnected");
        return true;
      });
    },

    listPaymentsPage(query = {}) {
      return wallet.use(async (sdk, current) => {
        let payments: Payment[];
        try {
          ({ payments } = await sdk.listPayments({
            fromTimestamp: query.since,
            offset: query.offset,
            limit: query.limit,
            sortAscending: false
          }));
        } catch (error) {
          throw new WalletError("requestFailed", "Could not read the payments", { cause: error });
        }
        if (!current()) throw new WalletError("notConnected", "The wallet was disconnected");
        const read: WalletPayment[] = [];
        for (const payment of payments) {
          const shown = readPayment(payment);
          if (shown) read.push(shown);
        }
        return { payments: read, listed: payments.length };
      });
    },

    newDepositAddress(walletId) {
      return wallet.use(async (sdk, current) => {
        if ((await identityOf(sdk)).toLowerCase() !== walletId.toLowerCase()) {
          throw new WalletError("notConnected", "Another wallet is connected");
        }
        let paymentRequest: string;
        try {
          ({ paymentRequest } = await sdk.receivePayment({
            paymentMethod: { type: "bitcoinAddress", newAddress: true }
          }));
        } catch (error) {
          throw new WalletError("requestFailed", "Could not get a deposit address", {
            cause: error
          });
        }
        const address = parseDepositAddress(paymentRequest, getBreezNetwork());
        if (!address) throw new WalletError("requestFailed", "Unexpected deposit address");
        if (!current()) throw new WalletError("notConnected", "The wallet was disconnected");
        return address;
      });
    },

    parseSendInput(text) {
      return wallet.use(async (sdk, current) => {
        const input = normalizeSendInput(text);
        if (!input) throw new SendError("unrecognized", "Nothing to parse");
        // As in wallet.ts.
        if (isCashtag(input))
          throw new SendError("unrecognized", "A cashtag, not asked to cash.app");
        let parsed: InputType;
        try {
          parsed = await sdk.parse(input);
        } catch (error) {
          throw parseFailure(input, error);
        }
        if (!current()) throw new WalletError("notConnected", "The wallet was disconnected");
        return readDestination(parsed, input);
      });
    },

    prepareSend(destination, amountSats) {
      return wallet.use(async (sdk, current) => {
        let quote: SendQuote;
        try {
          if (destination.kind === "lightningAddress" || destination.kind === "lnurlPay") {
            if (amountSats === null) throw new Error("An LNURL payment needs an amount");
            const response = await sdk.prepareLnurlPay({
              amount: amountSats,
              // As `parse` read them (parseSendInput): the LNURL server is not asked again.
              payRequest: destination.payRequest as unknown as LnurlPayRequestDetails,
              validateSuccessActionUrl: true
            });
            checkFeesExcluded(response.feePolicy === "feesExcluded");
            const invoiceEnd = response.invoiceDetails.timestamp + response.invoiceDetails.expiry;
            quote = {
              kind: destination.kind,
              amountSats: toBigInt(response.amountSats, "amountSats"),
              fees: { onchain: false, feeSats: toBigInt(response.feeSats, "feeSats") },
              // The LNURL service's invoice: it cannot be paid past its expiry.
              expiresAt: Number.isSafeInteger(invoiceEnd) ? invoiceEnd : null,
              prepared: wrap({ kind: "lnurl", response })
            };
          } else {
            const invoiceAmount = destination.kind === "bolt11" ? destination.amountSats : null;
            if (invoiceAmount === null && amountSats === null) {
              throw new Error("The payment needs an amount");
            }
            const response = await sdk.prepareSendPayment({
              paymentRequest: { type: "input", input: destination.request },
              amount: invoiceAmount === null ? (amountSats ?? undefined) : undefined
            });
            checkFeesExcluded(response.feePolicy === "feesExcluded");
            const method = response.paymentMethod;
            let fees: SendQuote["fees"];
            let expiresAt: number | null = null;
            if (destination.kind === "bolt11" && method.type === "bolt11Invoice") {
              fees = {
                onchain: false,
                feeSats: toBigInt(method.lightningFeeSats, "lightningFeeSats")
              };
            } else if (
              destination.kind === "sparkAddress" &&
              method.type === "sparkAddress" &&
              method.tokenIdentifier === undefined &&
              response.tokenIdentifier === undefined
            ) {
              fees = { onchain: false, feeSats: sparkFee(method.fee) };
            } else if (destination.kind === "bitcoinAddress" && method.type === "bitcoinAddress") {
              const { speedFast, speedMedium, speedSlow, expiresAt: quoteEnd } = method.feeQuote;
              // Zero on an estimate, which no provider issued.
              expiresAt = quoteEnd > 0 && Number.isSafeInteger(quoteEnd) ? quoteEnd : null;
              const total = (speed: SendOnchainSpeedFeeQuote) =>
                toBigInt(speed.userFeeSat, "userFeeSat") +
                toBigInt(speed.l1BroadcastFeeSat, "l1BroadcastFeeSat");
              fees = {
                onchain: true,
                bySpeed: {
                  fast: total(speedFast),
                  medium: total(speedMedium),
                  slow: total(speedSlow)
                }
              };
            } else {
              throw new Error(`Unexpected payment method: ${method.type}`);
            }
            quote = {
              kind: destination.kind,
              amountSats: toBigInt(response.amount, "amount"),
              fees,
              expiresAt,
              prepared: wrap({ kind: "payment", response })
            };
          }
        } catch (error) {
          throw new WalletError("requestFailed", "Could not prepare the payment", { cause: error });
        }
        checkQuotedAmount(quote, destination, amountSats);
        if (!current()) throw new WalletError("notConnected", "The wallet was disconnected");
        return quote;
      });
    },

    prepareDrain(destination, totalSats) {
      return wallet.use(async (sdk, current) => {
        let quote: DrainQuote;
        try {
          if (destination.kind === "lightningAddress" || destination.kind === "lnurlPay") {
            // As wallet.ts: the service asked twice, the fee taken from the whole.
            const response = await sdk.prepareLnurlPay({
              amount: totalSats,
              payRequest: destination.payRequest as unknown as LnurlPayRequestDetails,
              validateSuccessActionUrl: true,
              feePolicy: "feesIncluded"
            });
            checkFeesIncluded(response.feePolicy === "feesIncluded");
            const { invoiceDetails } = response;
            if (invoiceDetails.amountMsat === undefined)
              throw new Error("An invoice without amount");
            const invoiceEnd = invoiceDetails.timestamp + invoiceDetails.expiry;
            quote = {
              kind: destination.kind,
              totalSats: toBigInt(response.amountSats, "amountSats"),
              fees: {
                onchain: false,
                feeSats: toBigInt(response.feeSats, "feeSats"),
                receivedSats: invoiceSats(toBigInt(invoiceDetails.amountMsat, "amountMsat"))
              },
              expiresAt: Number.isSafeInteger(invoiceEnd) ? invoiceEnd : null,
              prepared: wrap({ kind: "lnurl", response })
            };
          } else if (destination.kind === "bitcoinAddress") {
            // A BIP-21 URI naming its amount asks that amount, never the whole balance.
            if (destination.amountSats !== null) {
              throw new SendError(
                "unsupported",
                "A request of its own amount cannot take a balance"
              );
            }
            const response = await sdk.prepareSendPayment({
              paymentRequest: { type: "input", input: destination.request },
              amount: totalSats,
              feePolicy: "feesIncluded"
            });
            checkFeesIncluded(response.feePolicy === "feesIncluded");
            const method = response.paymentMethod;
            if (method.type !== "bitcoinAddress") {
              throw new Error(`Unexpected payment method: ${method.type}`);
            }
            const { speedFast, speedMedium, speedSlow, expiresAt: quoteEnd } = method.feeQuote;
            const total = (speed: SendOnchainSpeedFeeQuote) =>
              toBigInt(speed.userFeeSat, "userFeeSat") +
              toBigInt(speed.l1BroadcastFeeSat, "l1BroadcastFeeSat");
            quote = {
              kind: destination.kind,
              totalSats: toBigInt(response.amount, "amount"),
              fees: {
                onchain: true,
                bySpeed: {
                  fast: total(speedFast),
                  medium: total(speedMedium),
                  slow: total(speedSlow)
                }
              },
              expiresAt: quoteEnd > 0 && Number.isSafeInteger(quoteEnd) ? quoteEnd : null,
              prepared: wrap({ kind: "payment", response })
            };
          } else if (destination.kind === "sparkAddress") {
            const response = await sdk.prepareSendPayment({
              paymentRequest: { type: "input", input: destination.request },
              amount: totalSats,
              feePolicy: "feesIncluded"
            });
            checkFeesIncluded(response.feePolicy === "feesIncluded");
            const method = response.paymentMethod;
            if (
              method.type !== "sparkAddress" ||
              method.tokenIdentifier !== undefined ||
              response.tokenIdentifier !== undefined
            ) {
              throw new Error(`Unexpected payment method: ${method.type}`);
            }
            // As wallet.ts: only a free transfer spends exactly the balance.
            if (sparkFee(method.fee) !== 0n) throw new Error("A Spark transfer with a fee");
            const amount = toBigInt(response.amount, "amount");
            quote = {
              kind: destination.kind,
              totalSats: amount,
              fees: { onchain: false, feeSats: 0n, receivedSats: amount },
              expiresAt: null,
              prepared: wrap({ kind: "payment", response })
            };
          } else {
            throw new SendError("unsupported", "An invoice cannot take a whole balance");
          }
        } catch (error) {
          if (error instanceof SendError) throw error;
          throw new WalletError("requestFailed", "Could not prepare the drain", { cause: error });
        }
        checkDrain(quote, totalSats);
        if (!current()) throw new WalletError("notConnected", "The wallet was disconnected");
        return quote;
      });
    },

    sendPrepared(quote, options) {
      return wallet.use(async (sdk) => {
        const prepared = quote.prepared as unknown as Prepared;
        let payment: Payment;
        try {
          if (prepared.kind === "lnurl") {
            ({ payment } = await sdk.lnurlPay({
              prepareResponse: prepared.response,
              idempotencyKey: options.idempotencyKey
            }));
          } else {
            ({ payment } = await sdk.sendPayment({
              prepareResponse: prepared.response,
              options:
                quote.kind === "bitcoinAddress"
                  ? { type: "bitcoinAddress", confirmationSpeed: options.speed }
                  : quote.kind === "sparkAddress"
                    ? // A plain transfer, no HTLC (send/spark_address.rs, 0.28.4).
                      { type: "sparkAddress" }
                    : {
                        type: "bolt11Invoice",
                        preferSpark: false,
                        completionTimeoutSecs: options.untilSent
                          ? undefined
                          : SEND_COMPLETION_TIMEOUT_SECS
                      },
              idempotencyKey: options.idempotencyKey
            }));
          }
        } catch (error) {
          throw new WalletError("requestFailed", "Could not send the payment", { cause: error });
        }
        const read = readPayment(payment);
        return { id: payment.id, status: read?.status ?? "pending" };
      });
    },

    getPayment(id) {
      return wallet.use(async (sdk, current) => {
        let payment: Payment;
        try {
          ({ payment } = await sdk.getPayment({ paymentId: id }));
        } catch (error) {
          throw new WalletError("requestFailed", "Could not read the payment", { cause: error });
        }
        if (!current()) throw new WalletError("notConnected", "The wallet was disconnected");
        return readPayment(payment);
      });
    },

    getSparkAddress() {
      return wallet.use(async (sdk, current) => {
        let paymentRequest: string;
        try {
          ({ paymentRequest } = await sdk.receivePayment({
            paymentMethod: { type: "sparkAddress" }
          }));
        } catch (error) {
          throw new WalletError("requestFailed", "Could not get the Spark address", {
            cause: error
          });
        }
        if (!current()) throw new WalletError("notConnected", "The wallet was disconnected");
        return paymentRequest;
      });
    },

    // As in wallet.ts, on the web build's shapes (the fee of a Spark transfer as a `bigint`).
    prepareTransfer(address, walletId, amountSats) {
      return wallet.use(async (sdk, current) => {
        let quote: TransferQuote;
        try {
          if (amountSats <= 0n) throw new Error("Nothing to transfer");
          // The SDK reads the address: its owner must be the wallet meant, on this network.
          const parsed = await sdk.parse(address);
          if (parsed.type !== "sparkAddress") throw new Error("Not a Spark address");
          checkNetwork(parsed.network);
          if (parsed.identityPublicKey.toLowerCase() !== walletId.toLowerCase()) {
            throw new Error("The Spark address is another wallet's");
          }
          const response = await sdk.prepareSendPayment({
            paymentRequest: { type: "input", input: parsed.address },
            amount: amountSats
          });
          checkFeesExcluded(response.feePolicy === "feesExcluded");
          const method = response.paymentMethod;
          if (
            method.type !== "sparkAddress" ||
            method.tokenIdentifier !== undefined ||
            response.tokenIdentifier !== undefined
          ) {
            throw new Error(`Unexpected transfer method: ${method.type}`);
          }
          // What the destination receives: that very amount (feesExcluded), or nothing leaves.
          const amount = toBigInt(response.amount, "amount");
          if (amount !== amountSats)
            throw new Error(`Prepared for ${amount} sats, not ${amountSats}`);
          quote = {
            walletId: walletId.toLowerCase(),
            amountSats,
            feeSats: sparkFee(method.fee),
            prepared: response as unknown as PreparedTransfer
          };
        } catch (error) {
          throw new WalletError("requestFailed", "Could not prepare the transfer", {
            cause: error
          });
        }
        if (!current()) throw new WalletError("notConnected", "The wallet was disconnected");
        return quote;
      });
    },

    sendTransfer(quote, idempotencyKey) {
      return wallet.use(async (sdk) => {
        let payment: Payment;
        try {
          ({ payment } = await sdk.sendPayment({
            prepareResponse: quote.prepared as unknown as PrepareSendPaymentResponse,
            // A plain transfer, no HTLC (send/spark_address.rs, 0.28.4).
            options: { type: "sparkAddress" },
            idempotencyKey
          }));
        } catch (error) {
          throw new WalletError("requestFailed", "Could not send the transfer", { cause: error });
        }
        const read = readPayment(payment);
        return { id: payment.id, status: read?.status ?? "pending" };
      });
    },

    // As in wallet.ts; the web build takes the invoice's amount as a `number`, exact.
    receiveInvoice(amountSats, description, expirySecs) {
      return wallet.use(async (sdk, current) => {
        let paymentRequest: string;
        try {
          const amount = Number(amountSats);
          if (amountSats <= 0n || !Number.isSafeInteger(amount)) {
            throw new Error(`An invoice of ${amountSats} sats`);
          }
          ({ paymentRequest } = await sdk.receivePayment({
            paymentMethod: { type: "bolt11Invoice", description, amountSats: amount, expirySecs }
          }));
        } catch (error) {
          throw new WalletError("requestFailed", "Could not make the invoice", { cause: error });
        }
        checkReceivedInvoice(paymentRequest, amountSats, expirySecs);
        if (!current()) throw new WalletError("notConnected", "The wallet was disconnected");
        return paymentRequest;
      });
    },

    sync() {
      return wallet.use(async (sdk) => {
        try {
          await sdk.syncWallet({});
        } catch (error) {
          throw new WalletError("requestFailed", "Could not sync the wallet", { cause: error });
        }
      });
    },

    // As in wallet.ts, on the web build's shapes (sats and rates as numbers, `type` unions).
    getRecoverableFunds(ensureSynced) {
      return wallet.use(async (sdk, current) => {
        let recoverableFundsSats: number;
        try {
          ({ recoverableFundsSats } = await sdk.getInfo({ ensureSynced }));
        } catch (error) {
          throw new WalletError("requestFailed", "Could not read the funds to recover", {
            cause: error
          });
        }
        if (!current()) throw new WalletError("notConnected", "The wallet was disconnected");
        return recoverySats(recoverableFundsSats, "recoverable funds");
      });
    },

    getHourFeeRate() {
      return wallet.use(async (sdk) => {
        let hourFee: number;
        try {
          ({ hourFee } = await sdk.recommendedFees());
        } catch (error) {
          throw new WalletError("requestFailed", "Could not read the network's fee rates", {
            cause: error
          });
        }
        return recoveryFeeRate(hourFee);
      });
    },

    prepareRecovery(destination, feeRateSatPerVbyte, leafIds) {
      return wallet.use(async (sdk, current) => {
        // A rate the app asks is MAX_RECOVERY_FEE_RATE at most: exact as a number.
        if (feeRateSatPerVbyte < 0n || feeRateSatPerVbyte > MAX_RECOVERY_FEE_RATE) {
          throw new WalletError("requestFailed", `A fee rate of ${feeRateSatPerVbyte} sat/vB`);
        }
        let response: PrepareRecoverFundsResponse;
        try {
          response = await sdk.prepareRecoverFunds({
            feeRateSatPerVbyte: Number(feeRateSatPerVbyte),
            // As in wallet.ts: a kind only so that a quote that needs funding says so.
            fundingKind: { type: "p2tr" },
            destination,
            selection:
              leafIds === null
                ? { type: "recoverableOnly" }
                : { type: "specific", leafIds: [...leafIds] }
          });
        } catch (error) {
          throw new WalletError("requestFailed", "Could not prepare the recovery", {
            cause: error
          });
        }
        if (!current()) throw new WalletError("notConnected", "The wallet was disconnected");
        if (
          response.destination !== destination ||
          recoverySats(response.feeRateSatPerVbyte, "fee rate") !== feeRateSatPerVbyte
        ) {
          throw new WalletError("requestFailed", "A recovery quoted for another destination");
        }
        return {
          leaves: recoveryLeaves(
            response.leaves.map(({ leafId, valueSats, method }) =>
              recoveryLeaf(leafId, valueSats, recoveryMethodOf(method))
            )
          ),
          destination,
          feeRateSatPerVbyte,
          totalFeeSats: recoverySats(response.totalFeeSats, "total fee"),
          needsFunding: response.funding !== undefined,
          prepared: response as unknown as PreparedRecovery
        };
      });
    },

    buildRecovery(quote) {
      if (quote.needsFunding) return Promise.reject(fundingRefused());
      return wallet.use(async (sdk, current) => {
        let response: RecoverFundsResponse;
        try {
          response = await sdk.recoverFunds(
            {
              prepared: quote.prepared as unknown as PrepareRecoverFundsResponse,
              fundingInputs: []
            },
            null
          );
        } catch (error) {
          throw new WalletError("requestFailed", "Could not build the recovery", {
            cause: error
          });
        }
        if (!current()) throw new WalletError("notConnected", "The wallet was disconnected");
        return recoveryBuild(
          response.leaves.map(({ leafId, valueSats, method }) =>
            recoveryLeaf(leafId, valueSats, recoveryMethodOf(method))
          ),
          response.transactions.map((tx) =>
            recoveryTransaction({
              txid: tx.txid,
              hex: tx.txHex,
              kind: RECOVERY_KINDS.includes(tx.kind) ? tx.kind : null,
              nodeId: tx.nodeId,
              status: RECOVERY_STATUSES[tx.status.type] ?? null,
              childHex: tx.cpfpTxHex
            })
          ),
          response.failed.map(({ leafId }) => leafId)
        );
      });
    },

    watchChanges(onChange) {
      return wallet.use(async (sdk, current) => {
        let id: string;
        try {
          id = await sdk.addEventListener({
            onEvent: (event: SdkEvent) => {
              if (!CHANGES.has(event.type)) return;
              const succeeded =
                event.type === "paymentSucceeded" ? eventPayment(event.payment) : null;
              setTimeout(() => onChange(succeeded), 0);
            }
          });
        } catch (error) {
          throw new WalletError("requestFailed", "Could not listen to the wallet", {
            cause: error
          });
        }
        // Disconnected meanwhile: its listener went with it (as wallet.ts).
        if (!current()) throw new WalletError("notConnected", "The wallet was disconnected");
        return async () => {
          await wallet
            .use((connected) => connected.removeEventListener(id))
            .catch((error: unknown) => {
              // Disconnected meanwhile: removed with it.
              if (!(error instanceof WalletError && error.code === "notConnected")) {
                logFailure("Removing a wallet's listener failed", error);
              }
            });
        };
      });
    },

    disconnect: () => wallet.close()
  };
}

/** The payment an event carries, as `listPaymentsPage` reads it: null when out of shape. */
function eventPayment(payment: Payment): WalletPayment | null {
  try {
    return readPayment(payment);
  } catch {
    return null;
  }
}

/** The SDK's events after which the wallet is read again (watchChanges, as wallet.ts). */
const CHANGES: ReadonlySet<SdkEvent["type"]> = new Set<SdkEvent["type"]>([
  "synced",
  "paymentSucceeded",
  "paymentPending",
  "paymentFailed",
  "newDeposits",
  "claimedDeposits",
  "unclaimedDeposits"
]);

/**
 * As in wallet.ts: the invoice the wallet just made is this network's, for exactly that amount, and
 * payable for exactly `expirySecs` when asked.
 */
function checkReceivedInvoice(
  invoice: string,
  amountSats: bigint,
  expirySecs: number | undefined
): void {
  const decoded = decodeBolt11(invoice);
  if (
    !decoded ||
    decoded.network !== addressHrp(getBreezNetwork()) ||
    decoded.amountMsat !== amountSats * 1000n ||
    (expirySecs !== undefined && decoded.expirySeconds !== expirySecs)
  ) {
    throw new WalletError("requestFailed", "The wallet made an unexpected invoice");
  }
}

/** The account's wallet: the functions below. */
const account = createWallet(STORAGE_NAME);

/** As in wallet.ts: one wallet, so one connection, per card's wallet. */
const cardWallets = new Map<string, Wallet>();

/**
 * Same as wallet.ts: the wallet a card pays from, on its own IndexedDB storage
 * (`breez-sdk-spark-cards/<card id>/<generation>`, card-wallet-names.ts).
 */
export function cardWallet(cardId: string, generation: number): Wallet {
  const path = cardWalletPath(cardId, generation);
  let found = cardWallets.get(path);
  if (!found) {
    found = createWallet(`${CARD_WALLETS_NAME}/${path}`);
    cardWallets.set(path, found);
  }
  return found;
}

/**
 * Disconnects every card's wallet (connection.ts destroys their SDK objects, which hold their
 * keys): the account closes (till mode, "Log out"), and their keys derive from its seed.
 */
export async function disconnectCardWallets(): Promise<void> {
  await Promise.all([...cardWallets.values()].map((wallet) => wallet.disconnect()));
}

/** Same API and rules as wallet.ts: one wallet at a time. */
export function connectWallet(seed: WalletSeed): Promise<void> {
  return account.connect(seed);
}

/** Same as wallet.ts. */
export function isWalletConnected(): boolean {
  return account.isConnected();
}

/** Same as wallet.ts. */
export function getWalletConnectionId(): number | null {
  return account.connectionId();
}

/** Calls `listener` whenever isWalletConnected() changes; returns the unsubscribe function. */
export function subscribeWallet(listener: () => void): () => void {
  return account.subscribe(listener);
}

/** Same as wallet.ts: the identity public key of the connected wallet. */
export function getWalletId(): Promise<string> {
  return account.getId();
}

/** Same as wallet.ts: the id of the wallet of `seed`, without connecting it. */
export async function walletIdOf(seed: WalletSeed): Promise<string> {
  const web = seed as unknown as Seed;
  if (web.type !== "mnemonic") {
    throw new WalletError("requestFailed", "Only a seed of words gives its wallet's id");
  }
  const sdk = await loadSdk();
  let signers: ReturnType<BreezWeb["sdk"]["defaultExternalSigners"]>;
  try {
    signers = sdk.defaultExternalSigners(
      web.mnemonic,
      web.passphrase ?? null,
      getBreezNetwork(),
      null
    );
  } catch (error) {
    throw new WalletError("requestFailed", "Could not derive the wallet's keys", { cause: error });
  }
  // Each read of `sparkSigner` makes a handle of its own over the keys (wasm-bindgen): this one,
  // freed with the signers.
  let spark: ReturnType<BreezWeb["sdk"]["defaultExternalSigners"]>["sparkSigner"] | null = null;
  try {
    spark = signers.sparkSigner;
    const key = await spark.getIdentityPublicKey();
    const id = bytesToHex(Uint8Array.from(key.bytes));
    // As wallet.ts: lowercase hex (a compressed public key).
    if (!/^[0-9a-f]{2,130}$/.test(id)) {
      throw new WalletError("requestFailed", "Unexpected wallet id");
    }
    return id;
  } catch (error) {
    if (error instanceof WalletError) throw error;
    throw new WalletError("requestFailed", "Could not derive the wallet's id", { cause: error });
  } finally {
    // Its WebAssembly memory holds the wallet's keys: freed now.
    spark?.free();
    signers.free();
  }
}

/** Same as wallet.ts: the Lightning address's description brought to the business name. */
export function keepWalletAddressDescription(
  walletId: string,
  description: string,
  beforeChange: (formerMetadata: string) => Promise<void>
): Promise<"noAddress" | "upToDate" | "updated"> {
  return account.keepAddressDescription(walletId, description, beforeChange);
}

/** Same as wallet.ts: the connected wallet's Lightning address, registered when it has none. */
export function getWalletLightningAddress(walletId: string, description: string): Promise<string> {
  return account.getLightningAddress(walletId, description);
}

/** Same as wallet.ts. The web build gives the balance as a `number`: read as a bigint here. */
export function getWalletBalance(ensureSynced: boolean): Promise<bigint> {
  return account.getBalance(ensureSynced);
}

/** Same as wallet.ts. */
export function waitWalletNetworkSync(): Promise<void> {
  return account.waitNetworkSync();
}

/** Same as wallet.ts. */
export function countUnclaimedDeposits(): Promise<number> {
  return account.countUnclaimedDeposits();
}

/** Same as wallet.ts, on the web build's shapes (`type` unions, sats as a `number`). */
export function listPendingDeposits(): Promise<PendingDeposit[]> {
  return account.listPendingDeposits();
}

/** Same as wallet.ts. */
export function deleteWalletLightningAddress(walletId: string): Promise<boolean> {
  return account.deleteLightningAddress(walletId);
}

/** Same as wallet.ts. */
export async function listWalletPayments(
  query: WalletPaymentsQuery = {}
): Promise<WalletPayment[]> {
  return (await listWalletPaymentsPage(query)).payments;
}

/** Same as wallet.ts. */
export function listWalletPaymentsPage(
  query: WalletPaymentsQuery = {}
): Promise<WalletPaymentsPage> {
  return account.listPaymentsPage(query);
}

/** Same as wallet.ts: a payment as the app reads it, null for a token payment. */
function readPayment(payment: Payment): WalletPayment | null {
  const { details } = payment;
  if (payment.method === "token" || details?.type === "token") return null;
  const read: WalletPayment = {
    id: payment.id,
    direction: payment.paymentType === "send" ? "send" : "receive",
    status:
      payment.status === "completed"
        ? "completed"
        : payment.status === "failed"
          ? "failed"
          : "pending",
    amountSats: toBigInt(payment.amount, "amount"),
    feeSats: toBigInt(payment.fees, "fees"),
    timestamp: payment.timestamp,
    network:
      payment.method === "deposit" || payment.method === "withdraw"
        ? "bitcoin"
        : payment.method === "spark"
          ? "spark"
          : payment.method === "lightning"
            ? "lightning"
            : "unknown"
  };
  // As wallet.ts: nothing of an unknown transfer's details is proven.
  if (read.network === "unknown") return read;
  const lightning = details?.type === "lightning" ? details : undefined;
  // Lowercase, as every reader matches it (witnesses, payment links, the owner's copy).
  const txId =
    details?.type === "withdraw" || details?.type === "deposit"
      ? details.txId.toLowerCase()
      : undefined;
  const description =
    lightning?.description ??
    (details?.type === "spark" ? details.invoiceDetails?.description : undefined);
  // As sdk-read.ts: the address checked, else none.
  const destination: unknown =
    details?.type === "withdraw" ? details.destinationAddress : undefined;
  return {
    ...read,
    description: description || undefined,
    lightningAddress: lightning?.lnurlPayInfo?.lnAddress || undefined,
    senderComment: lightning?.lnurlReceiveMetadata?.senderComment || undefined,
    paymentHash: lightning?.htlcDetails.paymentHash,
    preimage: preimageOf(lightning?.htlcDetails.preimage),
    txId,
    destinationAddress:
      typeof destination === "string" ? (parseSentAddress(destination) ?? undefined) : undefined
  };
}

/** A preimage as the SDK gives it: 32 bytes in hex, lowercase; undefined otherwise. */
function preimageOf(value: string | undefined): string | undefined {
  return value !== undefined && /^[0-9a-f]{64}$/i.test(value) ? value.toLowerCase() : undefined;
}

/** The kinds of a recovery's transactions, as the web build names them (`RecoveryTxKind`). */
const RECOVERY_KINDS: readonly RecoveryTransaction["kind"][] = [
  "cooperative",
  "fanOut",
  "node",
  "refund",
  "sweep"
];

/** A recovery transaction's status, as the web build names them (`ExitTransactionStatus`). */
const RECOVERY_STATUSES: Record<string, RecoveryTransaction["status"]> = {
  confirmed: "confirmed",
  ready: "ready",
  waitingForDependencies: "waiting",
  waitingForTimelock: "waiting",
  unverified: "unverified"
};

/** A leaf's recovery method from the web build, null when another. */
function recoveryMethodOf(method: SdkRecoveryMethod): RecoveryMethod | null {
  return method === "cooperative" || method === "unilateral" ? method : null;
}

/**
 * Sats from the web build, a `bigint` or a `number` depending on the field (0.28.4 typings):
 * a `number` is taken only when it is an exact integer (hard rule 3).
 */
function toBigInt(value: bigint | number, field: string): bigint {
  if (typeof value === "bigint") return value;
  if (!Number.isSafeInteger(value)) {
    throw new WalletError("requestFailed", `Inexact ${field} from the wallet: ${value}`);
  }
  return BigInt(value);
}

/** Same as wallet.ts: a new on-chain deposit address of the connected wallet. */
export function newDepositAddress(walletId: string): Promise<string> {
  return account.newDepositAddress(walletId);
}

/** Same as wallet.ts: what `text` pays, read by the SDK's `parse`. */
export function parseSendInput(text: string): Promise<SendDestination> {
  return account.parseSendInput(text);
}

/** Same as wallet.ts, on the web build's shapes (millisats and times as numbers). */
function readDestination(parsed: InputType, input: string): SendDestination {
  switch (parsed.type) {
    case "lightningAddress":
      return {
        kind: "lightningAddress",
        request: input,
        address: parsed.address,
        minSats: minSendableSats(toBigInt(parsed.payRequest.minSendable, "minSendable")),
        maxSats: maxSendableSats(maxSendableMsat(parsed.payRequest.maxSendable)),
        payRequest: wrapPayRequest(parsed.payRequest)
      };
    case "lnurlPay":
      return {
        kind: "lnurlPay",
        request: input,
        domain: parsed.domain,
        minSats: minSendableSats(toBigInt(parsed.minSendable, "minSendable")),
        maxSats: maxSendableSats(maxSendableMsat(parsed.maxSendable)),
        payRequest: wrapPayRequest(parsed)
      };
    case "bolt11Invoice": {
      checkNetwork(parsed.network);
      const expiresAt = parsed.timestamp + parsed.expiry;
      if (!Number.isSafeInteger(expiresAt)) {
        throw new WalletError("requestFailed", "Invalid invoice expiry");
      }
      checkNotExpired(expiresAt);
      return {
        kind: "bolt11",
        request: parsed.invoice.bolt11,
        amountSats:
          parsed.amountMsat === undefined
            ? null
            : invoiceSats(toBigInt(parsed.amountMsat, "amountMsat")),
        description: parsed.description || undefined,
        expiresAt
      };
    }
    case "bitcoinAddress":
      checkNetwork(parsed.network);
      return {
        kind: "bitcoinAddress",
        request: parsed.address,
        address: parsed.address,
        amountSats: null
      };
    case "sparkAddress":
      checkNetwork(parsed.network);
      return { kind: "sparkAddress", request: parsed.address, address: parsed.address };
    case "bip21": {
      const invoice = parsed.paymentMethods.find((m) => m.type === "bolt11Invoice");
      if (invoice) return readDestination(invoice, input);
      const address = parsed.paymentMethods.find((m) => m.type === "bitcoinAddress");
      if (address) {
        const destination = readDestination(address, input);
        if (destination.kind === "bitcoinAddress" && parsed.amountSat !== undefined) {
          return { ...destination, amountSats: toBigInt(parsed.amountSat, "amountSat") };
        }
        return destination;
      }
      throw new SendError("unsupported", "A BIP-21 URI without an invoice nor an address");
    }
    default:
      throw new SendError("unsupported", `Unsupported destination: ${parsed.type}`);
  }
}

/**
 * An LNURL-pay maximum (msat) from the web build, a `number`: past Number's exact range (a service
 * that sets no real limit, a `u64` the bindings could not give exactly) it is clamped down, never
 * refused: a maximum only ever lowered stays a bound the service accepts, and no wallet holds
 * that much (2^53 msat is about 90 000 BTC).
 */
function maxSendableMsat(value: number): bigint {
  return value > Number.MAX_SAFE_INTEGER
    ? BigInt(Number.MAX_SAFE_INTEGER)
    : toBigInt(value, "maxSendable");
}

/** Same as wallet.ts: an LNURL's parameters, opaque outside this file. */
function wrapPayRequest(payRequest: LnurlPayRequestDetails): LnurlPayRequest {
  return payRequest as unknown as LnurlPayRequest;
}

/** A Spark transfer's fee: a `bigint` since the web build of 0.27.2 (a string before). */
function sparkFee(value: unknown): bigint {
  if (typeof value !== "bigint" || value < 0n) {
    throw new Error(`Unexpected transfer fee: ${String(value)}`);
  }
  return value;
}

/** Same as wallet.ts: `otherNetwork` when `network` is not this build's. */
function checkNetwork(network: BitcoinNetwork): void {
  const expected: BitcoinNetwork = getWalletConfig().network === "mainnet" ? "bitcoin" : "regtest";
  if (network !== expected) throw new SendError("otherNetwork", "Another Bitcoin network");
}

type Prepared =
  | { kind: "lnurl"; response: PrepareLnurlPayResponse }
  | { kind: "payment"; response: PrepareSendPaymentResponse };

/** Same as wallet.ts: prepares a payment to `destination`, fees on top. */
export function prepareSend(
  destination: SendDestination,
  amountSats: bigint | null
): Promise<SendQuote> {
  return account.prepareSend(destination, amountSats);
}

function wrap(prepared: Prepared): PreparedSend {
  return prepared as unknown as PreparedSend;
}

/** Same as wallet.ts. */
export function prepareWalletDrain(
  destination: SendDestination,
  totalSats: bigint
): Promise<DrainQuote> {
  return account.prepareDrain(destination, totalSats);
}

/** Same as wallet.ts: sends a prepared payment, at most once per `idempotencyKey`. */
export function sendPrepared(
  quote: SendQuote | DrainQuote,
  options: { speed: OnchainSpeed; idempotencyKey: string; untilSent?: boolean }
): Promise<SentPayment> {
  return account.sendPrepared(quote, options);
}

/** Same as wallet.ts: one payment of the connected wallet, by its SDK id. */
export function getWalletPayment(id: string): Promise<WalletPayment | null> {
  return account.getPayment(id);
}

/** Same as wallet.ts: the account's wallet's Spark address. */
export function getWalletSparkAddress(): Promise<string> {
  return account.getSparkAddress();
}

/** Same as wallet.ts: a Spark transfer from the account's wallet to a card's, prepared. */
export function prepareWalletTransfer(
  address: string,
  walletId: string,
  amountSats: bigint
): Promise<TransferQuote> {
  return account.prepareTransfer(address, walletId, amountSats);
}

/** Same as wallet.ts. */
export function sendWalletTransfer(
  quote: TransferQuote,
  idempotencyKey: string
): Promise<SentPayment> {
  return account.sendTransfer(quote, idempotencyKey);
}

/** Same as wallet.ts. */
export function syncWallet(): Promise<void> {
  return account.sync();
}

/** Same as wallet.ts. */
export function watchWalletChanges(
  onChange: (succeeded: WalletPayment | null) => void
): Promise<() => Promise<void>> {
  return account.watchChanges(onChange);
}

/** Same as wallet.ts. */
export const accountRecoveryWallet: RecoveryWallet = {
  getRecoverableFunds: (ensureSynced) => account.getRecoverableFunds(ensureSynced),
  getHourFeeRate: () => account.getHourFeeRate(),
  newDepositAddress: (walletId) => account.newDepositAddress(walletId),
  prepareRecovery: (destination, feeRateSatPerVbyte, leafIds) =>
    account.prepareRecovery(destination, feeRateSatPerVbyte, leafIds),
  buildRecovery: (quote) => account.buildRecovery(quote)
};

/** Same as wallet.ts. */
export function disconnectWallet(): Promise<void> {
  return account.disconnect();
}
