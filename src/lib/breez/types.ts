export type BreezStatus =
  | { available: true; network: string; apiKeyConfigured: boolean }
  | { available: false; reason: string };

declare const walletSeed: unique symbol;

/**
 * A wallet seed, derived from a passkey. Opaque to the app, which hands it from the passkey layer
 * to the wallet layer: the native and web SDKs have different seed types. Only seed.ts and
 * seed.web.ts read it: `walletSecret`, for the app's own keys, and `recoveryPhraseOf`, for
 * "Recovery phrase". In memory only.
 */
export type WalletSeed = { readonly [walletSeed]: true };

/**
 * A payment of the wallet, in sats (bigint, hard rule 3), the same on native and on the web: the
 * two SDK builds shape their `Payment` differently (numeric enums and `tag`, string unions and
 * `type`), wallet.ts and wallet.web.ts read theirs into this. Bitcoin only: token payments are
 * left out.
 */
export type WalletPayment = {
  /** The SDK's own id. */
  id: string;
  direction: "receive" | "send";
  status: "completed" | "pending" | "failed";
  /** What the payment moved, fees excluded (the SDK's `amount`). */
  amountSats: bigint;
  /** What the wallet paid on top (the SDK's `fees`): 0 on a receipt. */
  feeSats: bigint;
  /** When it was created, in Unix seconds (crates/breez-sdk/core/src/models/adaptors.rs). */
  timestamp: number;
  /**
   * How it went: Lightning, onchain (`bitcoin`: deposits and withdrawals), a Spark transfer
   * between Spark wallets, or `unknown`: a transfer of a type the SDK does not know
   * (`PaymentMethod::Unknown`). spark-sdk 0.26.1 reads such a type as its first one (prost's
   * getter: a Lightning or Spark payment); from 0.27.0 on, it stores it as an Unknown payment,
   * completed too (`decode_proto_enum`). What it moved, when, and where it stands are known, not
   * how: it carries none of the fields below, whatever its details say (a description, a hash, a
   * transaction), and is never a sale's, a recharge nor a return. Shown as "Deposit" received,
   * "Withdrawal" sent.
   */
  network: "lightning" | "bitcoin" | "spark" | "unknown";
  /** The invoice's description, when it has one. */
  description?: string;
  /** Sent to a Lightning address: that address. */
  lightningAddress?: string;
  /**
   * Received at the wallet's Lightning address: the comment its payer wrote (LUD-12), as the SDK
   * gives it (`lnurlReceiveMetadata.senderComment`, 0.28.4). The SDK reads it from the LNURL
   * server at a sync, maybe one after the payment's. The payer's text: untrusted.
   */
  senderComment?: string;
  /** Lightning: the payment hash. */
  paymentHash?: string;
  /**
   * Lightning: the preimage of `paymentHash` (lowercase hex) once the wallet released it, as the SDK
   * gives it (`htlcDetails.preimage`, 0.28.4): the proof of a payment received
   * (src/features/payment-link/owner-finals.ts). Absent when the SDK gives none, or one out of shape.
   */
  preimage?: string;
  /** Onchain: the transaction id, in lowercase (the SDK's, lowercased). */
  txId?: string;
  /**
   * A withdrawal: the Bitcoin address it paid (the SDK's `destinationAddress`), checked
   * (parseSentAddress, src/lib/onchain/sent-address.ts). Absent when the SDK gives none (a withdrawal
   * stored before Breez 0.28, until its next sync fills its details in again) or one out of shape.
   */
  destinationAddress?: string;
};

/**
 * An on-chain deposit the wallet holds but has not credited yet (`listPendingDeposits`,
 * `listUnclaimedDeposits` of spark-sdk 0.28.4): the SDK claims it as soon as the provider's fee fits
 * MAX_DEPOSIT_CLAIM_FEE_SATS, before its 3rd confirmation too, and tries again at each sync until
 * it does (src/lib/breez/config.ts). Until then its sats are not in the balance nor among the
 * payments. Deposits being refunded are left out: they never come to the wallet.
 */
export type PendingDeposit = {
  /** The transaction id, in lowercase (as a deposit's `txId`, WalletPayment). */
  txid: string;
  vout: number;
  /** What the transaction paid to the address, before the claim's fee. */
  amountSats: bigint;
  /**
   * 3 confirmations at least, as the Spark operators count them: the SDK claims it at its plain
   * price (before, only ahead of maturity, when that fits MAX_DEPOSIT_CLAIM_FEE_SATS too).
   */
  mature: boolean;
  /**
   * Mature, its last claim was refused at a price above MAX_DEPOSIT_CLAIM_FEE_SATS (the provider's
   * quote, not the network's fee rate, config.ts), or at a price out of shape, or as too small to
   * claim at the current fees (`DepositTooSmall`, spark-sdk 0.28.4: no price). It waits until the
   * provider asks less (never more, however long it takes). Not for a price
   * within it: refused under a lower ceiling of an older app, it is claimed at the next sync; nor
   * before maturity: a claim ahead of it refused, it is claimed at maturity (readRefusedClaim).
   */
  waitsForFees: boolean;
  /**
   * What the provider asked for that refused claim, in sats (`requiredFeeSats`, spark-sdk 0.28.4:
   * the deposit's value less the credit it quoted). The price of the last attempt, which the SDK
   * makes again at each sync. Absent unless `waitsForFees`, when out of shape (readRefusedClaim),
   * and in what useWalletData shows before the SDK's first sync (withoutStaleFees).
   */
  claimFeeSats?: bigint;
};

/**
 * How a leaf of a recovery comes back (spark-sdk 0.28.4, `RecoveryMethod`): `cooperative`, one
 * transaction the Spark operators co-sign, its fee taken from the leaf; `unilateral`, the leaf's
 * own pre-signed transactions, with timelock waits.
 */
export type RecoveryMethod = "cooperative" | "unilateral";

/** A leaf of the wallet that left its balance, as a recovery takes it. */
export type RecoveryLeaf = { leafId: string; valueSats: bigint; method: RecoveryMethod };

declare const preparedRecovery: unique symbol;

/** The SDK's quote of a recovery, opaque to the app: only the wallet layer reads it back. */
export type PreparedRecovery = { readonly [preparedRecovery]: true };

/**
 * A recovery of funds that left the wallet's balance (`prepareRecovery`, spark-sdk 0.28.4
 * `prepareRecoverFunds`): the leaves it takes, to `destination` at `feeRateSatPerVbyte`, and what
 * it costs in all (`totalFeeSats`: the fees the operators' transactions already took included).
 * `needsFunding`: a step has a CPFP child to pay from Bitcoin outside the wallet, which the app
 * never has (`buildRecovery` refuses it).
 */
export type RecoveryQuote = {
  leaves: RecoveryLeaf[];
  destination: string;
  feeRateSatPerVbyte: bigint;
  totalFeeSats: bigint;
  needsFunding: boolean;
  readonly prepared: PreparedRecovery;
};

/**
 * A transaction of a recovery (`buildRecovery`), in broadcast order. `status`: `ready` to send
 * now; `unverified` when the chain could not be read for it (sending it is harmless: the network
 * refuses it if it cannot go); `waiting` for a step before it or a timelock; `confirmed` done.
 * `childHex`: its child, signed, which pays its fee out of the leaf (the refund of a leaf received
 * with the watchtower's fee ladder, spark-sdk 0.28.4): the two go together, as a package, the
 * parent alone paying no fee. Null for a transaction that goes alone.
 */
export type RecoveryTransaction = {
  /** Lowercase hex. */
  txid: string;
  hex: string;
  kind: "cooperative" | "fanOut" | "node" | "refund" | "sweep";
  /** The leaf of a cooperative recovery or of a refund; null for the other kinds. */
  leafId: string | null;
  status: "confirmed" | "ready" | "waiting" | "unverified";
  /** Lowercase hex. */
  childHex: string | null;
};

/**
 * A recovery built and signed (`buildRecovery`, spark-sdk 0.28.4 `recoverFunds`), never
 * broadcast by the SDK: its leaves, its transactions, and the cooperative leaves the operators did
 * not co-sign (`failedLeafIds`: left out of the rest).
 */
export type RecoveryBuild = {
  leaves: RecoveryLeaf[];
  transactions: RecoveryTransaction[];
  failedLeafIds: string[];
};

/** What `listWalletPayments` reads (src/lib/breez/wallet.ts). */
export type WalletPaymentsQuery = {
  /** Only payments created at or after this time, in Unix seconds. */
  since?: number;
  /** At most this many, the newest first. */
  limit?: number;
  /** Skips this many first (of the newest first): the next page of `limit` payments. */
  offset?: number;
};

/**
 * A page of payments (`listWalletPaymentsPage`): those the app reads, and how many the SDK listed,
 * token payments included (left out of `payments`), so that a page shorter than its `limit` tells
 * that no older one is left.
 */
export type WalletPaymentsPage = { payments: WalletPayment[]; listed: number };

declare const lnurlPayRequest: unique symbol;

/**
 * The LNURL-pay parameters the SDK's `parse` read from the recipient's server (LUD-06), opaque to
 * the app: only the wallet layer reads them back (`prepareSend`), so that a quote asks that server
 * once (its callback), not `parse` again. A plain record of the SDK, no native object.
 */
export type LnurlPayRequest = { readonly [lnurlPayRequest]: true };

/**
 * Where "Send" sends, as read from what the merchant typed, pasted or scanned
 * (`parseSendInput`, src/lib/breez/wallet.ts): the same on native and on the web. Amounts in sats
 * (bigint, hard rule 3). `request` is what the wallet layer prepares the payment with again
 * (`prepareSend`): an address, an invoice or an LNURL, never an SDK object; an LNURL's parameters
 * are kept opaque (`payRequest`), like a quote's `prepared`.
 */
export type SendDestination =
  | {
      kind: "lightningAddress";
      request: string;
      /** user@domain. */
      address: string;
      /** What the recipient's LNURL-pay endpoint accepts, whole sats (LUD-06, in msat). */
      minSats: bigint;
      maxSats: bigint;
      readonly payRequest: LnurlPayRequest;
    }
  | {
      kind: "lnurlPay";
      request: string;
      /** The LNURL service's domain, to show (LUD-06). */
      domain: string;
      minSats: bigint;
      maxSats: bigint;
      readonly payRequest: LnurlPayRequest;
    }
  | {
      kind: "bolt11";
      request: string;
      /** The invoice's amount, null for an invoice without one (the merchant gives it). */
      amountSats: bigint | null;
      description?: string;
      /** When it expires, in Unix seconds. */
      expiresAt: number;
    }
  | {
      kind: "bitcoinAddress";
      request: string;
      address: string;
      /** From a BIP-21 URI, when it names one. */
      amountSats: bigint | null;
    }
  | {
      /**
       * Another Spark wallet's static address: a Spark transfer,
       * free in spark-sdk 0.28.4 (`prepare/spark_address.rs`), of the amount typed.
       */
      kind: "sparkAddress";
      request: string;
      address: string;
    };

export type SendDestinationKind = SendDestination["kind"];

/** How fast an on-chain withdrawal confirms (the SDK's `OnchainConfirmationSpeed`). */
export type OnchainSpeed = "fast" | "medium" | "slow";

declare const preparedSend: unique symbol;

/** The SDK's prepared payment, opaque to the app: only the wallet layer reads it back. */
export type PreparedSend = { readonly [preparedSend]: true };

/**
 * A payment prepared by `prepareSend`, ready for `sendPrepared`: what the recipient receives and
 * the fees the wallet pays on top (the SDK's `FeesExcluded`, its default), in sats. On-chain, one
 * fee per speed.
 */
export type SendQuote = {
  kind: SendDestinationKind;
  amountSats: bigint;
  fees:
    { onchain: false; feeSats: bigint } | { onchain: true; bySpeed: Record<OnchainSpeed, bigint> };
  /**
   * When the SDK stops honouring this quote, in Unix seconds: the on-chain fee quote's expiry, the
   * expiry of the invoice an LNURL service gave. Null when there is none (a Lightning invoice's
   * own expiry is the destination's `expiresAt`).
   */
  expiresAt: number | null;
  readonly prepared: PreparedSend;
};

/**
 * A payment of a wallet's whole balance (`prepareDrain`: "Empty the card" of a card holder's
 * card), its fees taken from it (the SDK's `FeesIncluded`): the
 * wallet spends exactly `totalSats`, and the recipient gets what is left once the fees are paid
 * (drainReceivedSats). Only to a Lightning address (an LNURL-pay service), a Bitcoin address or a
 * Spark address (its transfer free, all of it received):
 * what an invoice's recipient would get cannot be told exactly (spark-sdk 0.28.4, an amountless
 * invoice's overpaid fee goes to its recipient), and an invoice of its own amount is refused.
 */
export type DrainQuote = {
  kind: "lightningAddress" | "lnurlPay" | "bitcoinAddress" | "sparkAddress";
  totalSats: bigint;
  /**
   * Lightning: the fee the wallet pays, and what the LNURL service's invoice asks (exactly
   * `totalSats - feeSats`, checked); Spark: no fee, all of it. On-chain: the fee of each speed, taken from `totalSats`.
   */
  fees:
    | { onchain: false; feeSats: bigint; receivedSats: bigint }
    | { onchain: true; bySpeed: Record<OnchainSpeed, bigint> };
  /** As SendQuote's: when the SDK stops honouring this quote, null when there is none. */
  expiresAt: number | null;
  readonly prepared: PreparedSend;
};

/** What the recipient of `quote` gets, sent at `speed` (on-chain): null when the fee eats it all. */
export function drainReceivedSats(quote: DrainQuote, speed: OnchainSpeed): bigint | null {
  const received = quote.fees.onchain
    ? quote.totalSats - quote.fees.bySpeed[speed]
    : quote.fees.receivedSats;
  return received > 0n ? received : null;
}

/** What `sendPrepared` gives back: the payment's id and its state when the call returned. */
export type SentPayment = { id: string; status: WalletPayment["status"] };

declare const preparedTransfer: unique symbol;

/** The SDK's prepared Spark transfer, opaque to the app: only the wallet layer reads it back. */
export type PreparedTransfer = { readonly [preparedTransfer]: true };

/**
 * A Spark transfer to another wallet of the account (`prepareTransfer`), ready for `sendTransfer`:
 * what it receives, exactly, and the fee the source pays on top (0 in spark-sdk 0.28.4: a Spark
 * transfer is free, `prepare/spark_address.rs`). `walletId` is the destination's.
 */
export type TransferQuote = {
  walletId: string;
  amountSats: bigint;
  feeSats: bigint;
  readonly prepared: PreparedTransfer;
};

/**
 * One wallet of the app, on an SDK instance and a storage of its own (connection.ts): the account's
 * (the functions of wallet.ts and wallet.web.ts) or a card's (`cardWallet`). The same on native and
 * on the web. Every call goes through the wallet's connection: none outlives its instance.
 */
export type Wallet = {
  /** Connects the wallet of `seed`. One SDK instance at a time: `alreadyConnected` otherwise. */
  connect(seed: WalletSeed): Promise<void>;
  /** Connected: not while it connects or disconnects. */
  isConnected(): boolean;
  /** The id of the connection now connected, null when none (connection.ts). */
  connectionId(): number | null;
  /** Calls `listener` whenever isConnected() changes; returns the unsubscribe function. */
  subscribe(listener: () => void): () => void;
  /** Its Spark identity public key (hex): its id, public. */
  getId(): Promise<string>;
  keepAddressDescription(
    walletId: string,
    description: string,
    beforeChange: (formerMetadata: string) => Promise<void>
  ): Promise<"noAddress" | "upToDate" | "updated">;
  /**
   * Its Lightning address, registered when it has none. `description` is what payers see: the
   * server's own ("Pay to user@domain") when undefined.
   */
  getLightningAddress(walletId: string, description: string | undefined): Promise<string>;
  /**
   * Its balance, in sats, as the SDK's storage holds it. `ensureSynced`: once the SDK's first sync
   * of the connection has ended (getInfo `ensureSynced`), which is no proof that the network was
   * read: each part of a sync only logs its failure and the sync ends well all the same (sync.rs,
   * spark-sdk 0.28.4). Offline, the SDK ends it once its sync interval (60 s) has passed, or with a
   * `sync`, which then ends at once (wallet-sync-sdk.test.ts). Else at once.
   */
  getBalance(ensureSynced: boolean): Promise<bigint>;
  /**
   * Resolves once the SDK told, since this connection, that a sync of its reached the network: its
   * first `Synced`, told once a sync's wallet part (the Spark operators) succeeded and, with the
   * real-time sync of the default config, once its first pull came or failed (events.rs, spark-sdk
   * 0.28.4); never offline (wallet-sync-sdk.test.ts). What the storage holds then is what that
   * sync brought: its balance, its payments unless their own part failed. Not a proof in two cases
   * the SDK tells it with nothing read ("Synced recently, skipping", sync.rs): another instance on
   * the same storage synced less than a sync interval (60 s) before (two tabs of the web app,
   * allowed), or the device's clock went back. Rejects with
   * `notConnected` once the connection ends.
   */
  waitNetworkSync(): Promise<void>;
  countUnclaimedDeposits(): Promise<number>;
  listPendingDeposits(): Promise<PendingDeposit[]>;
  deleteLightningAddress(walletId: string): Promise<boolean>;
  listPaymentsPage(query?: WalletPaymentsQuery): Promise<WalletPaymentsPage>;
  newDepositAddress(walletId: string): Promise<string>;
  parseSendInput(text: string): Promise<SendDestination>;
  prepareSend(destination: SendDestination, amountSats: bigint | null): Promise<SendQuote>;
  /** The whole of `totalSats` (the wallet's balance) to `destination`, fees taken from it. */
  prepareDrain(destination: SendDestination, totalSats: bigint): Promise<DrainQuote>;
  sendPrepared(
    quote: SendQuote | DrainQuote,
    options: { speed: OnchainSpeed; idempotencyKey: string; untilSent?: boolean }
  ): Promise<SentPayment>;
  getPayment(id: string): Promise<WalletPayment | null>;
  /** Its Spark address: static, where another wallet of the account sends it a transfer. */
  getSparkAddress(): Promise<string>;
  /**
   * Prepares a Spark transfer of `amountSats` to `address`, which must be the Spark address of the
   * wallet `walletId` on this build's network (read by the SDK, its identity key compared).
   */
  prepareTransfer(address: string, walletId: string, amountSats: bigint): Promise<TransferQuote>;
  /** Sends a transfer `prepareTransfer` prepared; `idempotencyKey` (a UUID) sends it once. */
  sendTransfer(quote: TransferQuote, idempotencyKey: string): Promise<SentPayment>;
  /**
   * A Lightning invoice of `amountSats` to this wallet (BOLT11), checked: this network's, that very
   * amount, payable `expirySecs` when given (else the SDK's default: 30 days, 0.28.4). `description`
   * is the invoice's.
   */
  receiveInvoice(amountSats: bigint, description: string, expirySecs?: number): Promise<string>;
  /**
   * Syncs with the network now: what was sent to it meanwhile is claimed (`syncWallet`). Resolves
   * offline too, nothing claimed: no proof that the network was read (getBalance).
   */
  sync(): Promise<void>;
  /**
   * What left its balance for an on-chain output and waits to be recovered, in sats
   * (`recoverableFundsSats`, spark-sdk 0.28.4: a watchtower's defense, an exit). `ensureSynced`: as
   * getBalance's (the SDK reckons it at each sync).
   */
  getRecoverableFunds(ensureSynced: boolean): Promise<bigint>;
  /** The network's fee rate to confirm within the hour, in sat/vB (`recommendedFees`). */
  getHourFeeRate(): Promise<bigint>;
  /**
   * Quotes a recovery of the leaves `leafIds`, or of every leaf that left its balance and is worth
   * recovering at that rate (null), to `destination`, a deposit address of its own.
   */
  prepareRecovery(
    destination: string,
    feeRateSatPerVbyte: bigint,
    leafIds: readonly string[] | null
  ): Promise<RecoveryQuote>;
  /** Builds and signs the recovery `quote` quotes; refuses one that `needsFunding`. */
  buildRecovery(quote: RecoveryQuote): Promise<RecoveryBuild>;
  /**
   * Calls `onChange` each time the SDK says its balance, payments or deposits may have changed (its
   * events, `addEventListener` of spark-sdk 0.28.4: a sync, a payment pending, succeeded or failed,
   * deposits found, claimed or not): with the payment a `PaymentSucceeded` carries, read as
   * `listPaymentsPage` reads its own (null for any other event, or one out of shape). The SDK
   * stores the payment and its balance before it tells it (sdk-doc-spark, "Listening to events").
   * Resolves, once listening, with what stops it; its disconnection stops it too (the SDK's
   * `disconnect` removes its listeners, 0.28.4). Never calls `onChange` while the SDK's callback
   * runs: on a later turn.
   */
  watchChanges(onChange: (succeeded: WalletPayment | null) => void): Promise<() => Promise<void>>;
  /** Disconnects it, then destroys its SDK object, which holds its keys (connection.ts). */
  disconnect(): Promise<void>;
};

/**
 * What the recovery of a wallet's funds that left its balance uses of it
 * (src/features/wallet/funds-recovery.ts): the account's (accountRecoveryWallet) or a card's.
 */
export type RecoveryWallet = Pick<
  Wallet,
  | "getRecoverableFunds"
  | "getHourFeeRate"
  | "newDepositAddress"
  | "prepareRecovery"
  | "buildRecovery"
>;
