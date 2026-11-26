import type {
  BitcoinChainService,
  BreezSdk as SdkObject,
  BreezSdkInterface,
  Config,
  DepositInfo,
  ExternalSigners,
  InputType,
  LnurlPayRequestDetails,
  Payment,
  PrepareLnurlPayResponse,
  PrepareRecoverFundsResponse,
  PrepareSendPaymentResponse,
  RecoverFundsResponse,
  SdkEvent,
  Seed
} from "@breeztech/breez-sdk-spark-react-native";
import { bytesToHex } from "@noble/hashes/utils.js";

import { decodeBolt11 } from "@/lib/lightning/bolt11";
import { fetchAddressMetadata } from "@/lib/lightning/metadata";
import { logFailure } from "@/lib/log/log";
import { addressHrp, parseDepositAddress } from "@/lib/onchain/address";
import { parseSentAddress } from "@/lib/onchain/sent-address";

import { cardWalletPath } from "./card-wallet-names";
import { chainServiceUrls, firstAnswering } from "./chain-node";
import {
  MAX_DEPOSIT_CLAIM_FEE_SATS,
  getBreezNetwork,
  getWalletConfig,
  toSdkNetwork,
  type BreezNetwork
} from "./config";
import { createWalletConnection } from "./connection";
import { readDeposit, readRefusedClaim } from "./deposits";
import {
  fundingRefused,
  recoveryBuild,
  recoveryFeeRate,
  recoveryLeaf,
  recoveryLeaves,
  recoverySats,
  recoveryTransaction
} from "./recovery";
import { SendError, WalletError } from "./errors";
import {
  bolt11Destination,
  checkSdkNetwork,
  walletPaymentOf,
  type SdkBolt11View,
  type SdkPaymentView
} from "./sdk-read";
import { ensureLightningAddress, keepAddressDescription } from "./lightning-address";
import { createNetworkSync } from "./network-sync";
import {
  SEND_COMPLETION_TIMEOUT_SECS,
  checkDrain,
  checkFeesExcluded,
  checkFeesIncluded,
  checkQuotedAmount,
  invoiceSats,
  isCashtag,
  maxSendableSats,
  minSendableSats,
  normalizeSendInput,
  parseFailure
} from "./send-input";
import { getCardWalletStorageDir, getStorageDir } from "./storage";
import type {
  DrainQuote,
  LnurlPayRequest,
  OnchainSpeed,
  PendingDeposit,
  PreparedRecovery,
  PreparedSend,
  PreparedTransfer,
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

type BreezSdk = typeof import("@breeztech/breez-sdk-spark-react-native");
type WalletConfig = ReturnType<typeof getWalletConfig>;

/** Required lazily, like in status.ts: a missing native library must not crash at import time. */
function loadSdk(): BreezSdk {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy on purpose, see above
    return require("@breeztech/breez-sdk-spark-react-native") as BreezSdk;
  } catch (error) {
    throw new WalletError("unavailable", "The Breez SDK native library could not be loaded", {
      cause: error
    });
  }
}

/**
 * Default SDK config for the network of this build, with the Breez API key and the app's ceiling
 * on deposit claim fees (config.ts).
 */
function createConfig(sdk: BreezSdk, { network, apiKey }: WalletConfig): Config {
  return {
    ...sdk.defaultConfig(toSdkNetwork(sdk.Network, network)),
    apiKey: apiKey ?? undefined,
    // No proportional part (the SDK's default adds 1,000 ppm of the deposit, spark-sdk 0.28.4): the
    // ceiling is those sats whatever the deposit (config.ts).
    maxDepositClaimFee: sdk.MaxFee.create({
      onchain: new sdk.MaxOnchainFee.Fixed({ amount: MAX_DEPOSIT_CLAIM_FEE_SATS }),
      proportionalPpm: undefined
    }),
    // The watchtower's fee ladder (spark-sdk 0.28.4, the SDK's default, said here): the operators
    // defend the funds at the fee a spike needs, and a refund
    // received with it pays its own fee, through a child the SDK signs, so its recovery needs no
    // Bitcoin from outside the wallet (sent with that child, as a package: funds-recovery.ts).
    watchtowerFeeLadderEnabled: true
  };
}

/**
 * `inner` without the watch of deposit addresses in the mempool. The SDK polls each address it
 * hands out at every sync (60 s) for 24 hours, one
 * request per address, and `getAddressUtxos` serves only that watch (`deposit_chain_syncer.rs`,
 * spark-sdk 0.28.4): answering "nothing" stops it. Deposits are still found once confirmed, through
 * the Spark operators, and claimed as soon as the claim fits MAX_DEPOSIT_CLAIM_FEE_SATS (config.ts);
 * the point of sale watches its own addresses
 * (src/lib/onchain/). Fees, transactions and broadcasts go to `inner` as before.
 */
function withoutAddressWatch(inner: BitcoinChainService): BitcoinChainService {
  return {
    getAddressUtxos: async () => [],
    getAddressTxos: (address, options) => inner.getAddressTxos(address, options),
    getTransactionStatus: (txid, options) => inner.getTransactionStatus(txid, options),
    tipHeight: (options) => inner.tipHeight(options),
    getTransactionHex: (txid, options) => inner.getTransactionHex(txid, options),
    getOutspend: (txid, vout, options) => inner.getOutspend(txid, vout, options),
    broadcastTransaction: (tx, options) => inner.broadcastTransaction(tx, options),
    recommendedFees: (options) => inner.recommendedFees(options)
  };
}

/**
 * What `sdk.connect` does (`connect` in spark-sdk 0.28.4: the builder with the default storage),
 * with the wrapped chain service on mainnet, without the blockstream.info fallback the SDK's own
 * has since 0.27.2 (config.ts): mempool.space's, or the merchant's own node's then mempool.space's
 * when the owner allowed it (chain-node.ts). Regtest keeps the SDK's own: its hosted instance needs
 * credentials that only the SDK carries. The builder holds the seed in its Rust object: destroyed
 * once built (or failed), as the SDK object is once disconnected (connection.ts), not left to the
 * garbage collector.
 */
async function buildSdk(
  sdk: BreezSdk,
  network: BreezNetwork,
  config: Config,
  seed: Seed,
  storageDir: string
): Promise<BreezSdkInterface> {
  const builder = new sdk.SdkBuilder(config, seed);
  try {
    await builder.withDefaultStorage(storageDir);
    if (network === "mainnet") {
      // The merchant's own node first when the account names one (chain-node.ts), each service
      // of mempool's API.
      const services: BitcoinChainService[] = [];
      for (const url of chainServiceUrls()) {
        const service = await sdk.newRestChainService(
          url,
          sdk.Network.Mainnet,
          sdk.ChainApiType.MempoolSpace,
          undefined,
          { proxy: undefined }
        );
        services.push(withoutAddressWatch(service));
      }
      await builder.withChainService(firstAnswering(services));
    }
    return await builder.build();
  } finally {
    builder.uniffiDestroy();
  }
}

/**
 * Throws `notConfigured` when this build cannot connect a wallet (no API key on mainnet, invalid
 * network). Checked before the passkey prompt: a misconfigured build must not create a passkey
 * whose wallet it cannot open.
 */
export function checkWalletConfig(): void {
  getWalletConfig();
}

/** The identity public key of `sdk`'s wallet. */
async function identityOf(sdk: BreezSdkInterface): Promise<string> {
  try {
    // Without ensureSynced, the SDK answers from its local storage: no wait on the network.
    const { identityPubkey } = await sdk.getInfo({ ensureSynced: false });
    return identityPubkey;
  } catch (error) {
    throw new WalletError("requestFailed", "Could not read the wallet info", { cause: error });
  }
}

/**
 * A wallet of the app on an SDK instance and a storage of its own (`storageDir`): the account's
 * (the functions exported below) or a card's (cardWallet). Each has its own connection
 * (connection.ts): `connect` gives a `BreezSdk`, typed as its interface, whose `uniffiDestroy`
 * frees its Rust object at once, where the garbage collector frees it at an unknown time ("as late
 * as when the Runtime is shut down", uniffi-bindgen-react-native's RustArcPtr.h). Calls already
 * running keep their own reference.
 */
function createWallet(storageDir: () => string): Wallet {
  const wallet = createWalletConnection<BreezSdkInterface>((sdk) =>
    (sdk as SdkObject).uniffiDestroy()
  );
  const networkSync = createNetworkSync(wallet);

  return {
    connect(seed) {
      return wallet.open(async () => {
        const sdk = loadSdk();
        const walletConfig = getWalletConfig();
        const config = createConfig(sdk, walletConfig);
        const dir = storageDir();
        let built: BreezSdkInterface;
        try {
          // The native SDK seed, from passkey.ts or seed.ts (mnemonicSeed).
          built = await buildSdk(sdk, walletConfig.network, config, seed as unknown as Seed, dir);
        } catch (error) {
          throw new WalletError("connectFailed", "Could not connect the wallet", { cause: error });
        }
        // At once: its first sync may end as soon as it is built.
        const { SdkEvent_Tags } = sdk;
        await networkSync.watch(built, (onSynced) =>
          built.addEventListener({
            onEvent: async (event: SdkEvent) => {
              if (event.tag === SdkEvent_Tags.Synced) onSynced();
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

    getBalance(ensureSynced) {
      return wallet.use(async (sdk, current) => {
        let balanceSats: bigint;
        try {
          ({ balanceSats } = await sdk.getInfo({ ensureSynced }));
        } catch (error) {
          throw new WalletError("requestFailed", "Could not read the balance", { cause: error });
        }
        // Disconnected meanwhile: nothing of it is shown.
        if (!current()) throw new WalletError("notConnected", "The wallet was disconnected");
        return balanceSats;
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

    listPendingDeposits() {
      return wallet.use(async (sdk, current) => {
        const { DepositClaimError_Tags, InstantClaimStatus_Tags } = loadSdk();
        let deposits: DepositInfo[];
        try {
          ({ deposits } = await sdk.listUnclaimedDeposits({}));
        } catch (error) {
          throw new WalletError("requestFailed", "Could not read the deposits", { cause: error });
        }
        if (!current()) throw new WalletError("notConnected", "The wallet was disconnected");
        return deposits.flatMap((deposit): PendingDeposit[] => {
          if (deposit.refundTxId !== undefined || deposit.refundTx !== undefined) return [];
          if (deposit.instantClaimStatus?.tag === InstantClaimStatus_Tags.Claimed) return [];
          const read = readDeposit(
            deposit.txid,
            deposit.vout,
            deposit.amountSats,
            deposit.isMature
          );
          if (!read) return [];
          const error = deposit.claimError;
          // Refused for its price at maturity: it may wait for a lower one (readRefusedClaim).
          // Too small to claim at maturity at the current fees (`DepositTooSmall`, spark-sdk
          // 0.28.4: lower ones can make it claimable): it waits too, its price not told, never
          // shown as being credited. Before, only a claim ahead of maturity was refused: it falls
          // through to the claim at maturity, under the app's ceiling, and waits for no lower
          // price.
          let claim: Pick<PendingDeposit, "waitsForFees" | "claimFeeSats"> = {
            waitsForFees: false
          };
          if (read.mature && error?.tag === DepositClaimError_Tags.MaxDepositClaimFeeExceeded) {
            claim = readRefusedClaim(error.inner.requiredFeeSats, read.amountSats);
          } else if (read.mature && error?.tag === DepositClaimError_Tags.DepositTooSmall) {
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
            typeFilter: undefined,
            statusFilter: undefined,
            assetFilter: undefined,
            paymentDetailsFilter: undefined,
            fromTimestamp: query.since === undefined ? undefined : BigInt(query.since),
            toTimestamp: undefined,
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
        // As for the Lightning address: another wallet's address would take this wallet's payments.
        if ((await identityOf(sdk)).toLowerCase() !== walletId.toLowerCase()) {
          throw new WalletError("notConnected", "Another wallet is connected");
        }
        const { ReceivePaymentMethod } = loadSdk();
        let paymentRequest: string;
        try {
          ({ paymentRequest } = await sdk.receivePayment({
            paymentMethod: new ReceivePaymentMethod.BitcoinAddress({ newAddress: true })
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
        const { FeePolicy, PaymentRequest, SendPaymentMethod_Tags } = loadSdk();
        let quote: SendQuote;
        try {
          if (destination.kind === "lightningAddress" || destination.kind === "lnurlPay") {
            if (amountSats === null) throw new Error("An LNURL payment needs an amount");
            const response = await sdk.prepareLnurlPay({
              amount: amountSats,
              // As `parse` read them (parseSendInput): the LNURL server is not asked again.
              payRequest: destination.payRequest as unknown as LnurlPayRequestDetails,
              comment: undefined,
              validateSuccessActionUrl: true,
              tokenIdentifier: undefined,
              conversionOptions: undefined,
              feePolicy: undefined
            });
            checkFeesExcluded(response.feePolicy === FeePolicy.FeesExcluded);
            const { invoiceDetails } = response;
            quote = {
              kind: destination.kind,
              amountSats: response.amountSats,
              fees: { onchain: false, feeSats: response.feeSats },
              // The LNURL service's invoice: it cannot be paid past its expiry.
              expiresAt: quoteEnd(invoiceDetails.timestamp + invoiceDetails.expiry),
              prepared: wrap({ kind: "lnurl", response })
            };
          } else {
            const invoiceAmount = destination.kind === "bolt11" ? destination.amountSats : null;
            if (invoiceAmount === null && amountSats === null) {
              throw new Error("The payment needs an amount");
            }
            const response = await sdk.prepareSendPayment({
              paymentRequest: new PaymentRequest.Input({ input: destination.request }),
              // An invoice's own amount is never given again (the SDK refuses another one).
              amount: invoiceAmount === null ? (amountSats ?? undefined) : undefined,
              tokenIdentifier: undefined,
              conversionOptions: undefined,
              feePolicy: undefined
            });
            checkFeesExcluded(response.feePolicy === FeePolicy.FeesExcluded);
            const method = response.paymentMethod;
            let fees: SendQuote["fees"];
            let expiresAt: number | null = null;
            if (
              destination.kind === "bolt11" &&
              method.tag === SendPaymentMethod_Tags.Bolt11Invoice
            ) {
              // Sent over Lightning (preferSpark false in sendPrepared): its fee only.
              fees = { onchain: false, feeSats: method.inner.lightningFeeSats };
            } else if (
              destination.kind === "sparkAddress" &&
              method.tag === SendPaymentMethod_Tags.SparkAddress &&
              method.inner.tokenIdentifier === undefined &&
              response.tokenIdentifier === undefined
            ) {
              // A Spark transfer of sats (no token): its fee, 0 in spark-sdk 0.28.4.
              fees = { onchain: false, feeSats: method.inner.fee };
            } else if (
              destination.kind === "bitcoinAddress" &&
              method.tag === SendPaymentMethod_Tags.BitcoinAddress
            ) {
              const { speedFast, speedMedium, speedSlow } = method.inner.feeQuote;
              expiresAt = quoteEnd(method.inner.feeQuote.expiresAt);
              fees = {
                onchain: true,
                bySpeed: {
                  fast: speedFast.userFeeSat + speedFast.l1BroadcastFeeSat,
                  medium: speedMedium.userFeeSat + speedMedium.l1BroadcastFeeSat,
                  slow: speedSlow.userFeeSat + speedSlow.l1BroadcastFeeSat
                }
              };
            } else {
              throw new Error(`Unexpected payment method: ${String(method.tag)}`);
            }
            quote = {
              kind: destination.kind,
              amountSats: response.amount,
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
        const { FeePolicy, PaymentRequest, SendPaymentMethod_Tags } = loadSdk();
        let quote: DrainQuote;
        try {
          if (destination.kind === "lightningAddress" || destination.kind === "lnurlPay") {
            // spark-sdk 0.28.4 asks the service twice: an invoice of the whole, then one of the
            // whole less its fee, which the wallet pays, its fee on top (`prepare_fees_included`).
            const response = await sdk.prepareLnurlPay({
              amount: totalSats,
              payRequest: destination.payRequest as unknown as LnurlPayRequestDetails,
              comment: undefined,
              validateSuccessActionUrl: true,
              tokenIdentifier: undefined,
              conversionOptions: undefined,
              feePolicy: FeePolicy.FeesIncluded
            });
            checkFeesIncluded(response.feePolicy === FeePolicy.FeesIncluded);
            const { invoiceDetails } = response;
            if (invoiceDetails.amountMsat === undefined)
              throw new Error("An invoice without amount");
            quote = {
              kind: destination.kind,
              totalSats: response.amountSats,
              fees: {
                onchain: false,
                feeSats: response.feeSats,
                receivedSats: invoiceSats(invoiceDetails.amountMsat)
              },
              expiresAt: quoteEnd(invoiceDetails.timestamp + invoiceDetails.expiry),
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
              paymentRequest: new PaymentRequest.Input({ input: destination.request }),
              amount: totalSats,
              tokenIdentifier: undefined,
              conversionOptions: undefined,
              feePolicy: FeePolicy.FeesIncluded
            });
            checkFeesIncluded(response.feePolicy === FeePolicy.FeesIncluded);
            const method = response.paymentMethod;
            if (method.tag !== SendPaymentMethod_Tags.BitcoinAddress) {
              throw new Error(`Unexpected payment method: ${String(method.tag)}`);
            }
            const { speedFast, speedMedium, speedSlow } = method.inner.feeQuote;
            quote = {
              kind: destination.kind,
              totalSats: response.amount,
              fees: {
                onchain: true,
                bySpeed: {
                  fast: speedFast.userFeeSat + speedFast.l1BroadcastFeeSat,
                  medium: speedMedium.userFeeSat + speedMedium.l1BroadcastFeeSat,
                  slow: speedSlow.userFeeSat + speedSlow.l1BroadcastFeeSat
                }
              },
              expiresAt: quoteEnd(method.inner.feeQuote.expiresAt),
              prepared: wrap({ kind: "payment", response })
            };
          } else if (destination.kind === "sparkAddress") {
            const response = await sdk.prepareSendPayment({
              paymentRequest: new PaymentRequest.Input({ input: destination.request }),
              amount: totalSats,
              tokenIdentifier: undefined,
              conversionOptions: undefined,
              feePolicy: FeePolicy.FeesIncluded
            });
            checkFeesIncluded(response.feePolicy === FeePolicy.FeesIncluded);
            const method = response.paymentMethod;
            if (
              method.tag !== SendPaymentMethod_Tags.SparkAddress ||
              method.inner.tokenIdentifier !== undefined ||
              response.tokenIdentifier !== undefined
            ) {
              throw new Error(`Unexpected payment method: ${String(method.tag)}`);
            }
            // The transfer sends its whole amount (send/spark_address.rs, 0.28.4): only a free one
            // spends exactly the balance. A fee would come on top of it: refused.
            if (method.inner.fee !== 0n) throw new Error("A Spark transfer with a fee");
            quote = {
              kind: destination.kind,
              totalSats: response.amount,
              fees: { onchain: false, feeSats: 0n, receivedSats: response.amount },
              expiresAt: null,
              prepared: wrap({ kind: "payment", response })
            };
          } else {
            // An invoice: what its recipient gets cannot be told exactly (DrainQuote).
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
        const { OnchainConfirmationSpeed, SendPaymentOptions } = loadSdk();
        const prepared = quote.prepared as unknown as Prepared;
        let payment: Payment;
        try {
          if (prepared.kind === "lnurl") {
            ({ payment } = await sdk.lnurlPay({
              prepareResponse: prepared.response,
              idempotencyKey: options.idempotencyKey
            }));
          } else {
            const sendOptions =
              quote.kind === "bitcoinAddress"
                ? new SendPaymentOptions.BitcoinAddress({
                    confirmationSpeed:
                      options.speed === "fast"
                        ? OnchainConfirmationSpeed.Fast
                        : options.speed === "medium"
                          ? OnchainConfirmationSpeed.Medium
                          : OnchainConfirmationSpeed.Slow
                  })
                : quote.kind === "sparkAddress"
                  ? // A plain transfer, no HTLC (send/spark_address.rs, 0.28.4).
                    new SendPaymentOptions.SparkAddress({ htlcOptions: undefined })
                  : new SendPaymentOptions.Bolt11Invoice({
                      preferSpark: false,
                      completionTimeoutSecs: options.untilSent
                        ? undefined
                        : SEND_COMPLETION_TIMEOUT_SECS
                    });
            ({ payment } = await sdk.sendPayment({
              prepareResponse: prepared.response,
              options: sendOptions,
              idempotencyKey: options.idempotencyKey
            }));
          }
        } catch (error) {
          throw new WalletError("requestFailed", "Could not send the payment", { cause: error });
        }
        // Whatever happens to the connection now, the payment left: its outcome is reported.
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
        const { ReceivePaymentMethod } = loadSdk();
        let paymentRequest: string;
        try {
          ({ paymentRequest } = await sdk.receivePayment({
            paymentMethod: new ReceivePaymentMethod.SparkAddress()
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

    prepareTransfer(address, walletId, amountSats) {
      return wallet.use(async (sdk, current) => {
        const { FeePolicy, InputType_Tags, PaymentRequest, SendPaymentMethod_Tags } = loadSdk();
        let quote: TransferQuote;
        try {
          if (amountSats <= 0n) throw new Error("Nothing to transfer");
          // The SDK reads the address: its owner must be the wallet meant, on this network.
          const parsed = await sdk.parse(address);
          if (parsed.tag !== InputType_Tags.SparkAddress) throw new Error("Not a Spark address");
          const details = parsed.inner[0];
          checkNetwork(details.network);
          if (details.identityPublicKey.toLowerCase() !== walletId.toLowerCase()) {
            throw new Error("The Spark address is another wallet's");
          }
          const response = await sdk.prepareSendPayment({
            paymentRequest: new PaymentRequest.Input({ input: details.address }),
            amount: amountSats,
            tokenIdentifier: undefined,
            conversionOptions: undefined,
            feePolicy: undefined
          });
          checkFeesExcluded(response.feePolicy === FeePolicy.FeesExcluded);
          const method = response.paymentMethod;
          if (
            method.tag !== SendPaymentMethod_Tags.SparkAddress ||
            method.inner.tokenIdentifier !== undefined ||
            response.tokenIdentifier !== undefined
          ) {
            throw new Error(`Unexpected transfer method: ${String(method.tag)}`);
          }
          // What the destination receives: that very amount (FeesExcluded), or nothing leaves.
          if (response.amount !== amountSats) {
            throw new Error(`Prepared for ${response.amount} sats, not ${amountSats}`);
          }
          quote = {
            walletId: walletId.toLowerCase(),
            amountSats,
            feeSats: method.inner.fee,
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
        const { SendPaymentOptions } = loadSdk();
        let payment: Payment;
        try {
          ({ payment } = await sdk.sendPayment({
            prepareResponse: quote.prepared as unknown as PrepareSendPaymentResponse,
            // A plain transfer, no HTLC (send/spark_address.rs, 0.28.4).
            options: new SendPaymentOptions.SparkAddress({ htlcOptions: undefined }),
            idempotencyKey
          }));
        } catch (error) {
          throw new WalletError("requestFailed", "Could not send the transfer", { cause: error });
        }
        const read = readPayment(payment);
        return { id: payment.id, status: read?.status ?? "pending" };
      });
    },

    receiveInvoice(amountSats, description, expirySecs) {
      return wallet.use(async (sdk, current) => {
        const { ReceivePaymentMethod } = loadSdk();
        let paymentRequest: string;
        try {
          if (amountSats <= 0n) throw new Error("An invoice of nothing");
          ({ paymentRequest } = await sdk.receivePayment({
            paymentMethod: new ReceivePaymentMethod.Bolt11Invoice({
              description,
              amountSats,
              expirySecs,
              paymentHash: undefined,
              receiverIdentityPublicKey: undefined,
              // The SDK draws the preimage itself, as before 0.28.
              preimage: undefined
            })
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

    getRecoverableFunds(ensureSynced) {
      return wallet.use(async (sdk, current) => {
        let recoverableFundsSats: bigint;
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
        let hourFee: bigint;
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
        const { CpfpFundingKind, ExitLeafSelection, RecoveryMethod } = loadSdk();
        let response: PrepareRecoverFundsResponse;
        try {
          response = await sdk.prepareRecoverFunds({
            feeRateSatPerVbyte,
            // The app never funds a recovery: a kind of UTXO only so that a quote needing it says
            // so (`funding`, needsFunding), where without one the SDK refuses the whole selection
            // (spark-sdk 0.28.4, sdk/unilateral_exit.rs: "A funding kind is needed"). A leaf with
            // no CPFP child is quoted the same with or without it: its funding's weight only
            // counts in a CPFP chain (services/unilateral_exit.rs).
            fundingKind: new CpfpFundingKind.P2tr(),
            // Unset: the SDK's default, one UTXO per branch, as before it could be chosen
            // (spark-sdk 0.28.4, `recover_funds.rs`); only a funded exit depends on it.
            fundingStrategy: undefined,
            destination,
            selection:
              leafIds === null
                ? new ExitLeafSelection.RecoverableOnly()
                : new ExitLeafSelection.Specific({ leafIds: [...leafIds] })
          });
        } catch (error) {
          throw new WalletError("requestFailed", "Could not prepare the recovery", {
            cause: error
          });
        }
        if (!current()) throw new WalletError("notConnected", "The wallet was disconnected");
        if (
          response.destination !== destination ||
          response.feeRateSatPerVbyte !== feeRateSatPerVbyte
        ) {
          throw new WalletError("requestFailed", "A recovery quoted for another destination");
        }
        const leaves = recoveryLeaves(
          response.leaves.map(({ leafId, valueSats, method }) =>
            recoveryLeaf(
              leafId,
              valueSats,
              method === RecoveryMethod.Cooperative
                ? "cooperative"
                : method === RecoveryMethod.Unilateral
                  ? "unilateral"
                  : null
            )
          )
        );
        return {
          leaves,
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
        const { ExitTransactionStatus_Tags, RecoveryMethod, RecoveryTxKind } = loadSdk();
        let response: RecoverFundsResponse;
        try {
          response = await sdk.recoverFunds(
            {
              prepared: quote.prepared as unknown as PrepareRecoverFundsResponse,
              fundingInputs: []
            },
            // Nothing to sign but the wallet's own: no funding.
            undefined
          );
        } catch (error) {
          throw new WalletError("requestFailed", "Could not build the recovery", {
            cause: error
          });
        }
        if (!current()) throw new WalletError("notConnected", "The wallet was disconnected");
        const kinds: Record<number, RecoveryTransaction["kind"]> = {
          [RecoveryTxKind.Cooperative]: "cooperative",
          [RecoveryTxKind.FanOut]: "fanOut",
          [RecoveryTxKind.Node]: "node",
          [RecoveryTxKind.Refund]: "refund",
          [RecoveryTxKind.Sweep]: "sweep"
        };
        const statuses: Record<string, RecoveryTransaction["status"]> = {
          [ExitTransactionStatus_Tags.Confirmed]: "confirmed",
          [ExitTransactionStatus_Tags.Ready]: "ready",
          [ExitTransactionStatus_Tags.WaitingForDependencies]: "waiting",
          [ExitTransactionStatus_Tags.WaitingForTimelock]: "waiting",
          [ExitTransactionStatus_Tags.Unverified]: "unverified"
        };
        return recoveryBuild(
          response.leaves.map(({ leafId, valueSats, method }) =>
            recoveryLeaf(
              leafId,
              valueSats,
              method === RecoveryMethod.Cooperative
                ? "cooperative"
                : method === RecoveryMethod.Unilateral
                  ? "unilateral"
                  : null
            )
          ),
          response.transactions.map((tx) =>
            recoveryTransaction({
              txid: tx.txid,
              hex: tx.txHex,
              kind: kinds[tx.kind] ?? null,
              nodeId: tx.nodeId,
              status: statuses[tx.status.tag] ?? null,
              childHex: tx.cpfpTxHex
            })
          ),
          response.failed.map(({ leafId }) => leafId)
        );
      });
    },

    watchChanges(onChange) {
      return wallet.use(async (sdk, current) => {
        const { SdkEvent_Tags } = loadSdk();
        const changes = new Set<string>([
          SdkEvent_Tags.Synced,
          SdkEvent_Tags.PaymentSucceeded,
          SdkEvent_Tags.PaymentPending,
          SdkEvent_Tags.PaymentFailed,
          SdkEvent_Tags.NewDeposits,
          SdkEvent_Tags.ClaimedDeposits,
          SdkEvent_Tags.UnclaimedDeposits
        ]);
        let id: string;
        try {
          id = await sdk.addEventListener({
            onEvent: async (event: SdkEvent) => {
              if (!changes.has(event.tag)) return;
              const succeeded =
                event.tag === SdkEvent_Tags.PaymentSucceeded
                  ? eventPayment(event.inner.payment)
                  : null;
              setTimeout(() => onChange(succeeded), 0);
            }
          });
        } catch (error) {
          throw new WalletError("requestFailed", "Could not listen to the wallet", {
            cause: error
          });
        }
        // Disconnected meanwhile: its listener went with it (`disconnect` "also unregisters all
        // event listeners", 0.28.4).
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

/**
 * Throws unless `invoice`, which the wallet just made, is a BOLT11 invoice of this build's network
 * for exactly `amountSats` (hard rule 3): a payer pays what it shows; and, when asked, payable for
 * exactly `expirySecs` (the SDK only logs another expiry, spark-sdk 0.28.4: this check is the one
 * that refuses it): its holder is told until when.
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

/** The account's wallet: the functions below, as the app has always used them. */
const account = createWallet(getStorageDir);

/**
 * The card wallets made so far, by their path (card-wallet-names.ts): one wallet, so one
 * connection, per card's wallet, whoever asks for it.
 */
const cardWallets = new Map<string, Wallet>();

/**
 * The wallet a card pays from (src/lib/card/keys.ts, cardWalletPhrase): its own SDK instance and
 * storage (`breez-sdk-spark-cards/<card id>/<generation>`), connected with the seed of its words
 * (seed.ts, mnemonicSeed). Never the account's wallet.
 */
export function cardWallet(cardId: string, generation: number): Wallet {
  const path = cardWalletPath(cardId, generation);
  let found = cardWallets.get(path);
  if (!found) {
    found = createWallet(() => getCardWalletStorageDir(cardId, generation));
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

/**
 * Connects the wallet derived from `seed` (from the passkey, see passkey.ts). One wallet at a
 * time: two SDK instances must never share the same storage directory, so a second call rejects
 * with `alreadyConnected` until `disconnectWallet()` has completed.
 */
export function connectWallet(seed: WalletSeed): Promise<void> {
  return account.connect(seed);
}

/** Whether a wallet is connected (connection.ts): not while it connects or disconnects. */
export function isWalletConnected(): boolean {
  return account.isConnected();
}

/**
 * The id of the connection now connected (connection.ts), null when none: each connection has its
 * own, so that wallet-access.ts tells the one it made from any other.
 */
export function getWalletConnectionId(): number | null {
  return account.connectionId();
}

/** Calls `listener` whenever isWalletConnected() changes; returns the unsubscribe function. */
export function subscribeWallet(listener: () => void): () => void {
  return account.subscribe(listener);
}

/**
 * Identifier of the connected wallet: its Spark identity public key, which the SDK derives from
 * the seed (hex of the compressed secp256k1 key in SDK 0.28.4). Stable for a passkey, and public
 * (never the seed): it keys what the app stores on the device per wallet, so that another account
 * signed in on the same device never sees it.
 */
export function getWalletId(): Promise<string> {
  return account.getId();
}

/**
 * The id of the wallet of `seed` (getWalletId's), without connecting it: a card holder's account
 * never connects its own wallet (no main wallet for a 100 % card account), whose id still names
 * everything the device keeps of the account. The SDK's own
 * derivation (`defaultExternalSigners`, the keys of its seed-based connect, as
 * recovery-phrase-sdk.test.ts checks with the SDK itself), local: nothing goes to the network. A
 * seed of words only, as a passkey gives (recovery-phrase.ts). Every connection of the account's
 * wallet checks its id against this one (activate.ts, wallet-access.ts, background-wallet.ts).
 */
export async function walletIdOf(seed: WalletSeed): Promise<string> {
  const native = seed as unknown as Seed;
  if (native.tag !== "Mnemonic") {
    throw new WalletError("requestFailed", "Only a seed of words gives its wallet's id");
  }
  const sdk = loadSdk();
  let signers: ExternalSigners;
  try {
    signers = sdk.defaultExternalSigners(
      native.inner.mnemonic,
      native.inner.passphrase,
      toSdkNetwork(sdk.Network, getBreezNetwork()),
      undefined
    );
  } catch (error) {
    throw new WalletError("requestFailed", "Could not derive the wallet's keys", { cause: error });
  }
  try {
    const key = await signers.sparkSigner.getIdentityPublicKey();
    return checkedWalletId(bytesToHex(new Uint8Array(key.bytes)));
  } catch (error) {
    if (error instanceof WalletError) throw error;
    throw new WalletError("requestFailed", "Could not derive the wallet's id", { cause: error });
  } finally {
    // Their Rust objects hold the wallet's keys: freed now, not left to the garbage collector.
    for (const signer of [signers.sparkSigner, signers.breezSigner]) {
      (signer as Partial<UniffiObject>).uniffiDestroy?.();
    }
  }
}

/** An object of the bindings, whose Rust half `uniffiDestroy` frees at once. */
type UniffiObject = { uniffiDestroy(): void };

/** A wallet's id as getWalletId gives it: lowercase hex (a compressed public key). */
function checkedWalletId(id: string): string {
  if (!/^[0-9a-f]{2,130}$/.test(id)) {
    throw new WalletError("requestFailed", "Unexpected wallet id");
  }
  return id;
}

/**
 * Brings the description the LNURL server holds for the connected wallet's Lightning address to
 * `description`, the business name (lightning-address.ts, keepAddressDescription): what payers and
 * card holders see. `walletId` is getWalletId's; `beforeChange` keeps the metadata served until
 * then. Never registers an address the wallet has none of.
 */
export function keepWalletAddressDescription(
  walletId: string,
  description: string,
  beforeChange: (formerMetadata: string) => Promise<void>
): Promise<"noAddress" | "upToDate" | "updated"> {
  return account.keepAddressDescription(walletId, description, beforeChange);
}

/**
 * The connected wallet's Lightning address, registered on the SDK's LNURL domain when it has none
 * yet (lightning-address.ts). `walletId` is getWalletId's; `description` is what payers see: the
 * business name.
 */
export function getWalletLightningAddress(walletId: string, description: string): Promise<string> {
  return account.getLightningAddress(walletId, description);
}

/**
 * The connected wallet's balance, in sats. `ensureSynced`: wait for the end of the SDK's first sync
 * of this connection, which is no proof that the network was read (Wallet.getBalance), else answer
 * from its local storage at once.
 */
export function getWalletBalance(ensureSynced: boolean): Promise<bigint> {
  return account.getBalance(ensureSynced);
}

/** Resolves once the connected wallet's sync reached the network (Wallet.waitNetworkSync). */
export function waitWalletNetworkSync(): Promise<void> {
  return account.waitNetworkSync();
}

/**
 * How many on-chain deposits of the connected wallet are not claimed yet (`listUnclaimedDeposits`,
 * spark-sdk 0.28.4): waiting for their confirmations, whose claim failed, claimed but whose output
 * the provider has not spent yet, or being refunded (sdk-doc-spark, "Claiming on-chain
 * deposits"). Their sats are not in the balance, or not for good yet.
 */
export function countUnclaimedDeposits(): Promise<number> {
  return account.countUnclaimedDeposits();
}

/**
 * The on-chain deposits of the connected wallet not credited yet (PendingDeposit), from the SDK's
 * local storage (`listUnclaimedDeposits`, spark-sdk 0.28.4, which its syncs keep). Left out: those
 * being refunded, those an early claim credited already (`InstantClaimStatus::Claimed`: settled,
 * their payment comes through `listPayments`, sdk-doc-spark "Listing unclaimed deposits"), and
 * any out of shape.
 */
export function listPendingDeposits(): Promise<PendingDeposit[]> {
  return account.listPendingDeposits();
}

/**
 * Gives up the connected wallet's Lightning address (`deleteLightningAddress`, spark-sdk 0.28.4):
 * the Breez LNURL server no longer makes invoices for it, and holds the username for this wallet
 * only. Resolves with whether the wallet had one. `walletId` is getWalletId's: another wallet's
 * address is never deleted.
 */
export function deleteWalletLightningAddress(walletId: string): Promise<boolean> {
  return account.deleteLightningAddress(walletId);
}

/** The connected wallet's payments, the newest first, from the SDK's local storage. */
export async function listWalletPayments(
  query: WalletPaymentsQuery = {}
): Promise<WalletPayment[]> {
  return (await listWalletPaymentsPage(query)).payments;
}

/**
 * A page of the connected wallet's payments (listWalletPayments), with how many the SDK listed:
 * `offset` and `limit` page through the whole history (ListPaymentsRequest, spark-sdk 0.28.4).
 */
export function listWalletPaymentsPage(
  query: WalletPaymentsQuery = {}
): Promise<WalletPaymentsPage> {
  return account.listPaymentsPage(query);
}

/** A payment of the SDK as the app reads it, null for a token payment (left out). */
/** `payment` as the app reads it (sdk-read.ts); null for a token's. */
function readPayment(payment: Payment): WalletPayment | null {
  const { PaymentDetails_Tags, PaymentMethod, PaymentStatus, PaymentType } = loadSdk();
  const { details } = payment;
  const method: SdkPaymentView["method"] =
    payment.method === PaymentMethod.Lightning
      ? "lightning"
      : payment.method === PaymentMethod.Spark
        ? "spark"
        : payment.method === PaymentMethod.Token
          ? "token"
          : payment.method === PaymentMethod.Deposit
            ? "deposit"
            : payment.method === PaymentMethod.Withdraw
              ? "withdraw"
              : "unknown";
  let view: SdkPaymentView["details"];
  switch (details?.tag) {
    case undefined:
      view = undefined;
      break;
    case PaymentDetails_Tags.Lightning: {
      const lightning = details.inner;
      view = {
        tag: "lightning",
        description: lightning.description,
        lnAddress: lightning.lnurlPayInfo?.lnAddress,
        senderComment: lightning.lnurlReceiveMetadata?.senderComment,
        paymentHash: lightning.htlcDetails.paymentHash,
        preimage: lightning.htlcDetails.preimage
      };
      break;
    }
    case PaymentDetails_Tags.Spark:
      view = { tag: "spark", invoiceDescription: details.inner.invoiceDetails?.description };
      break;
    case PaymentDetails_Tags.Deposit:
      view = { tag: "deposit", txId: details.inner.txId };
      break;
    case PaymentDetails_Tags.Withdraw:
      view = { tag: "withdraw", txId: details.inner.txId };
      break;
    case PaymentDetails_Tags.Token:
      view = { tag: "token" };
      break;
    default:
      view = { tag: "other" };
  }
  const read = walletPaymentOf({
    id: payment.id,
    type: payment.paymentType === PaymentType.Send ? "send" : "receive",
    status:
      payment.status === PaymentStatus.Completed
        ? "completed"
        : payment.status === PaymentStatus.Failed
          ? "failed"
          : "pending",
    amount: payment.amount,
    fees: payment.fees,
    timestamp: payment.timestamp,
    method,
    details: view
  });
  // A withdrawal's address, checked (parseSentAddress), as wallet.web.ts reads it. Here rather
  // than in sdk-read.ts, which the iOS extension's engine bundles with @noble's packages only.
  // None given (a withdrawal stored before Breez 0.28, until a sync fills its details in): none.
  if (read?.network !== "bitcoin" || details?.tag !== PaymentDetails_Tags.Withdraw) return read;
  const given: unknown = details.inner.destinationAddress;
  const destinationAddress = typeof given === "string" ? parseSentAddress(given) : null;
  return destinationAddress === null ? read : { ...read, destinationAddress };
}

/**
 * A new on-chain deposit address of the connected wallet, never handed out before: the point of
 * sale shows one per invoice (src/features/terminal/onchain-pool.ts). Always `newAddress: true`:
 * without it the SDK gives its current address back, the last one handed out. Earlier addresses
 * stay valid (spark-sdk 0.28.4: "Previous ones remain valid"). `walletId` is getWalletId's.
 */
export function newDepositAddress(walletId: string): Promise<string> {
  return account.newDepositAddress(walletId);
}

/**
 * What `text` (typed, pasted or scanned in "Send") pays: a Lightning address, an LNURL-pay,
 * a Lightning invoice, a Bitcoin address or a Spark address, read by the SDK's `parse` (a BIP-21 URI gives its
 * Lightning invoice, else its address). Throws `SendError` for anything else, for another
 * network's address or invoice, and for an expired invoice; `WalletError` when not connected.
 */
export function parseSendInput(text: string): Promise<SendDestination> {
  return account.parseSendInput(text);
}

/** `parsed` as a destination of "Send" (see parseSendInput). */
function readDestination(parsed: InputType, input: string): SendDestination {
  const { InputType_Tags } = loadSdk();
  switch (parsed.tag) {
    case InputType_Tags.LightningAddress: {
      const { address, payRequest } = parsed.inner[0];
      return {
        kind: "lightningAddress",
        request: input,
        address,
        minSats: minSendableSats(payRequest.minSendable),
        maxSats: maxSendableSats(payRequest.maxSendable),
        payRequest: wrapPayRequest(payRequest)
      };
    }
    case InputType_Tags.LnurlPay: {
      const payRequest = parsed.inner[0];
      return {
        kind: "lnurlPay",
        request: input,
        domain: payRequest.domain,
        minSats: minSendableSats(payRequest.minSendable),
        maxSats: maxSendableSats(payRequest.maxSendable),
        payRequest: wrapPayRequest(payRequest)
      };
    }
    case InputType_Tags.Bolt11Invoice: {
      const details = parsed.inner[0];
      return bolt11Destination(
        {
          bolt11: details.invoice.bolt11,
          network: networkName(details.network),
          amountMsat: details.amountMsat,
          timestamp: details.timestamp,
          expiry: details.expiry,
          description: details.description
        },
        getWalletConfig().network
      );
    }
    case InputType_Tags.BitcoinAddress: {
      const details = parsed.inner[0];
      checkNetwork(details.network);
      return {
        kind: "bitcoinAddress",
        request: details.address,
        address: details.address,
        amountSats: null
      };
    }
    case InputType_Tags.SparkAddress: {
      const details = parsed.inner[0];
      checkNetwork(details.network);
      return { kind: "sparkAddress", request: details.address, address: details.address };
    }
    case InputType_Tags.Bip21: {
      const details = parsed.inner[0];
      // Lightning first, as the point of sale's codes are meant (bitcoin:…?lightning=…).
      const invoice = details.paymentMethods.find((m) => m.tag === InputType_Tags.Bolt11Invoice);
      if (invoice) return readDestination(invoice, input);
      const address = details.paymentMethods.find((m) => m.tag === InputType_Tags.BitcoinAddress);
      if (address) {
        const destination = readDestination(address, input);
        if (destination.kind === "bitcoinAddress" && details.amountSat !== undefined) {
          return { ...destination, amountSats: details.amountSat };
        }
        return destination;
      }
      throw new SendError("unsupported", "A BIP-21 URI without an invoice nor an address");
    }
    default:
      throw new SendError("unsupported", `Unsupported destination: ${String(parsed.tag)}`);
  }
}

/** An LNURL's parameters, wrapped for the app (LnurlPayRequest is opaque outside this file). */
function wrapPayRequest(payRequest: LnurlPayRequestDetails): LnurlPayRequest {
  return payRequest as unknown as LnurlPayRequest;
}

/**
 * Throws `otherNetwork` when `network` is not the one the wallet connected on (getWalletConfig:
 * this build's; mainnet is `Bitcoin`).
 */
/** The SDK's `BitcoinNetwork` as sdk-read.ts names it. */
function networkName(network: number): SdkBolt11View["network"] {
  const { BitcoinNetwork } = loadSdk();
  return network === BitcoinNetwork.Bitcoin
    ? "bitcoin"
    : network === BitcoinNetwork.Regtest
      ? "regtest"
      : "other";
}

/** Throws `otherNetwork` unless `network` (the SDK's) is this build's. */
function checkNetwork(network: number): void {
  checkSdkNetwork(networkName(network), getWalletConfig().network);
}

/** The SDK's prepared payment, wrapped for the app (PreparedSend is opaque outside this file). */
type Prepared =
  | { kind: "lnurl"; response: PrepareLnurlPayResponse }
  | { kind: "payment"; response: PrepareSendPaymentResponse };

/**
 * Prepares a payment to `destination` (parseSendInput's): the SDK checks it and gives its fees.
 * `amountSats` is what the recipient receives, fees on top; null for an invoice with its own
 * amount. The SDK must answer with that very amount, else nothing is prepared (hard rule 3).
 */
export function prepareSend(
  destination: SendDestination,
  amountSats: bigint | null
): Promise<SendQuote> {
  return account.prepareSend(destination, amountSats);
}

function wrap(prepared: Prepared): PreparedSend {
  return prepared as unknown as PreparedSend;
}

/**
 * A quote's end (SendQuote.expiresAt) from the SDK's Unix seconds: null for zero (an on-chain
 * estimate, which no provider issued) and for a time past Number's exact range (no real end).
 */
function quoteEnd(seconds: bigint): number | null {
  const end = Number(seconds);
  return seconds > 0n && Number.isSafeInteger(end) ? end : null;
}

/**
 * The connected wallet's whole balance `totalSats` to `destination`, its fees taken from it
 * (Wallet.prepareDrain, as a card's "Empty the card"): "Open with my 12 words" only
 * (src/features/rescue/), where the account's owner sends everything away. Never an invoice.
 */
export function prepareWalletDrain(
  destination: SendDestination,
  totalSats: bigint
): Promise<DrainQuote> {
  return account.prepareDrain(destination, totalSats);
}

/**
 * Sends a payment `prepareSend` prepared. `speed` is the on-chain one (ignored otherwise);
 * `idempotencyKey` (a UUID) makes a retry of the same quote pay at most once (the SDK returns the
 * payment already made). A Lightning invoice is waited for up to SEND_COMPLETION_TIMEOUT_SECS;
 * with `untilSent`, not at all: the SDK returns as soon as the payment has left (`completion_
 * timeout_secs` unset, 0.28.4), still pending (a card payment, whose point of sale waits for the
 * answer). Throws `requestFailed` when the SDK refuses or fails: the payment may still have left
 * when the error came from the network, hence the key.
 */
export function sendPrepared(
  quote: SendQuote | DrainQuote,
  options: { speed: OnchainSpeed; idempotencyKey: string; untilSent?: boolean }
): Promise<SentPayment> {
  return account.sendPrepared(quote, options);
}

/** One payment of the connected wallet, by its SDK id; null when it is a token payment. */
export function getWalletPayment(id: string): Promise<WalletPayment | null> {
  return account.getPayment(id);
}

/**
 * The account's wallet's Spark address (static): where a card's wallet sends its sats back
 * ("Withdraw to my main balance").
 */
export function getWalletSparkAddress(): Promise<string> {
  return account.getSparkAddress();
}

/**
 * Prepares a Spark transfer from the account's wallet to the wallet `walletId` (a card's) at its
 * Spark address `address` (Wallet.prepareTransfer).
 */
export function prepareWalletTransfer(
  address: string,
  walletId: string,
  amountSats: bigint
): Promise<TransferQuote> {
  return account.prepareTransfer(address, walletId, amountSats);
}

/** Sends a transfer prepareWalletTransfer prepared, at most once per `idempotencyKey`. */
export function sendWalletTransfer(
  quote: TransferQuote,
  idempotencyKey: string
): Promise<SentPayment> {
  return account.sendTransfer(quote, idempotencyKey);
}

/** Syncs the account's wallet now: a card's wallet's transfer is claimed. */
export function syncWallet(): Promise<void> {
  return account.sync();
}

/**
 * Calls `onChange` each time the connected wallet's SDK says its balance, payments or deposits may
 * have changed (Wallet.watchChanges); resolves, once listening, with what stops it. Its
 * disconnection stops it too.
 */
export function watchWalletChanges(
  onChange: (succeeded: WalletPayment | null) => void
): Promise<() => Promise<void>> {
  return account.watchChanges(onChange);
}

/**
 * The account's wallet as the recovery of its funds that left its balance uses it
 * (src/features/wallet/funds-recovery.ts): on its connection, as every function here.
 */
export const accountRecoveryWallet: RecoveryWallet = {
  getRecoverableFunds: (ensureSynced) => account.getRecoverableFunds(ensureSynced),
  getHourFeeRate: () => account.getHourFeeRate(),
  newDepositAddress: (walletId) => account.newDepositAddress(walletId),
  prepareRecovery: (destination, feeRateSatPerVbyte, leafIds) =>
    account.prepareRecovery(destination, feeRateSatPerVbyte, leafIds),
  buildRecovery: (quote) => account.buildRecovery(quote)
};

/**
 * Disconnects the wallet, after the connection in progress if any, then destroys its SDK object,
 * which holds the wallet's keys (connection.ts). No-op when none.
 */
export function disconnectWallet(): Promise<void> {
  return account.disconnect();
}
