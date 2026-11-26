/**
 * Fake of @breeztech/breez-sdk-spark-react-native for Jest (jest.setup.ts): the package is a
 * native (Rust/JSI) module. Only what the app uses, with the shapes of the 0.28.4 typings.
 *
 * `PasskeyClient` mimics the Rust flows the app relies on (checkAvailability, signIn on its fast
 * path), calling the host's PrfProvider like the SDK does, including what the SDK cannot take:
 * an error that is not a `PrfProviderError` (a panic, so an abort in release builds) and values
 * the bindings cannot lower (the call never settles). See src/lib/breez/prf-provider.ts.
 */

import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils.js";

export const Network = {
  0: "Mainnet",
  1: "Regtest",
  2: "Signet",
  Mainnet: 0,
  Regtest: 1,
  Signet: 2
};

export const defaultConfig = (network: number) => ({
  network,
  apiKey: undefined,
  syncIntervalSecs: 60
});

/**
 * Identity public key of the fake wallet: hex of a compressed secp256k1 key, as in 0.28.4. It is
 * the public key of the private key 2, a well-known test value.
 */
export const FAKE_IDENTITY_PUBKEY =
  "02c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5";

/** Lightning addresses registered on the fake LNURL server, by username. */
export const lightningAddresses = new Map<string, string>();

// The enums of the 0.28.4 bindings: TypeScript numeric enums, in their declaration order.
export enum PaymentType {
  Send,
  Receive
}
export enum PaymentStatus {
  Completed,
  Pending,
  Failed
}
export enum PaymentMethod {
  Lightning,
  Spark,
  Token,
  Deposit,
  Withdraw,
  Unknown
}
export enum PaymentDetails_Tags {
  Spark = "Spark",
  Token = "Token",
  Lightning = "Lightning",
  Withdraw = "Withdraw",
  Deposit = "Deposit"
}
/** A deposit's `claimError` (`DepositInfo`): `{ tag, inner }`, as the bindings give it. */
export enum DepositClaimError_Tags {
  MaxDepositClaimFeeExceeded = "MaxDepositClaimFeeExceeded",
  MissingUtxo = "MissingUtxo",
  DepositTooSmall = "DepositTooSmall",
  Generic = "Generic"
}
/** A deposit's `instantClaimStatus` (`DepositInfo`): `{ tag, inner }`. */
export enum InstantClaimStatus_Tags {
  Declined = "Declined",
  Submitted = "Submitted",
  Claimed = "Claimed"
}

/**
 * What the fake wallet holds: its balance and its payments (shaped as the bindings give them:
 * `Payment` with `bigint` amounts and timestamps, `details` with `tag` and `inner`), the newest
 * first. Tests set it; `resetFakeWallet()` empties it.
 */
export const fakeWallet: {
  balanceSats: bigint;
  payments: Record<string, unknown>[];
  /** On-chain deposits not claimed yet (`DepositInfo`, `listUnclaimedDeposits`). */
  unclaimedDeposits: Record<string, unknown>[];
  /**
   * When set, `connect` rejects with it for the account's wallet only, its card wallets'
   * connecting (a main balance unreachable while the cards' show).
   */
  connectError: Error | null;
  /** Its leaves that left the balance (spark-sdk 0.28.4, `recoverableFundsSats`): FakeRecovery. */
  recovery: FakeRecovery;
} = {
  balanceSats: BigInt(0),
  payments: [],
  unclaimedDeposits: [],
  connectError: null,
  recovery: emptyRecovery()
};

/**
 * A leaf of a fake wallet that left its balance for an on-chain output (spark-sdk 0.28.4): what the
 * SDK's recovery calls quote and build for it. `takenFeeSats`: the fee the operators' transaction
 * already took on-chain, counted at any rate. A unilateral leaf's `stage`: its refund waiting out
 * its timelock, its refund ready to send, or its refund confirmed and the sweep ready;
 * `needsFunding`: a step of its exit still has a CPFP child (funding the app never has);
 * `feeLadder`: received with the watchtower's fee ladder, its refund comes with a child the SDK
 * signed, which pays the fee out of the leaf (`cpfpTxHex`, no funding: sent as a package).
 * `operatorsFail`: a cooperative leaf the operators do not co-sign.
 */
export type FakeRecoveryLeaf = {
  leafId: string;
  valueSats: bigint;
  method: "cooperative" | "unilateral";
  takenFeeSats: bigint;
  stage?: "timelock" | "refund" | "sweep";
  needsFunding?: boolean;
  feeLadder?: boolean;
  operatorsFail?: boolean;
};

/**
 * The leaves of a fake wallet that left its balance, and those whose recovery the SDK saw in a
 * block (`recovered`: out of `recoverableFundsSats` and of every quote).
 */
export type FakeRecovery = { leaves: FakeRecoveryLeaf[]; recovered: Set<string> };

function emptyRecovery(): FakeRecovery {
  return { leaves: [], recovered: new Set() };
}

/**
 * The network's fee rates, as the SDK's chain service tells them (`recommendedFees`); set
 * `ratesError` to make it fail.
 */
export const fakeChainFees: { hourFee: bigint; ratesError: Error | null } = {
  hourFee: BigInt(2),
  ratesError: null
};

/** The virtual sizes the fake recovery prices, in vB: a cooperative recovery, a refund, a sweep. */
export const FAKE_RECOVERY_VBYTES = { cooperative: 111n, refund: 120n, sweep: 100n } as const;

/** Every recovery the fake SDK built (`recoverFunds`), in order: the wallet's state and response. */
export const fakeRecoveryBuilds: { state: object; response: Record<string, unknown> }[] = [];

/**
 * Resolves once the SDK's first sync has ended: what `getInfo({ ensureSynced: true })` waits for
 * (runtime/client.rs, spark-sdk 0.28.4). That end is no proof that the network was read: each part
 * of a sync only logs its failure, the sync ends well all the same (sync.rs), and offline the SDK
 * ends its first sync once its sync interval (60 s) has passed (wallet-sync-sdk.test.ts). This fake
 * keeps one copy of each wallet, the device's and the network's alike: a test models a first sync
 * that read nothing with the Spark operators unreachable (setSparkReachable). Done at once, unless
 * a test holds it (holdFirstSync).
 */
let firstSync: Promise<void> = Promise.resolve();
/** The holds of the first sync not released yet (holdFirstSync). */
const heldSyncs: (() => void)[] = [];
/** The latest hold of the first sync, `firstSync`'s: still held until released. */
let firstSyncHold = { released: true };

/**
 * Holds the first sync until the function returned is called: `getInfo({ ensureSynced: true })`
 * waits for it, then reads the wallet as it is then, whether the sync reached the network or not.
 * As in the SDK, a `syncWallet` meanwhile waits for it too (the SDK runs it after the sync
 * running), an instance disconnected meanwhile ends those waits with an error, and an instance
 * whose `syncWallet` ended no longer waits. Its listeners hear `Synced` as it ends, when it
 * reached the Spark operators (setSparkReachable).
 */
export function holdFirstSync(): () => void {
  const hold = { released: false };
  let release!: () => void;
  firstSync = new Promise<void>((resolve) => {
    release = () => {
      hold.released = true;
      resolve();
    };
  });
  firstSyncHold = hold;
  heldSyncs.push(release);
  return release;
}

/** The account's wallet's syncs, held by a test (holdAccountSync); its card wallets' never are. */
let accountSync: Promise<void> = Promise.resolve();
const heldAccountSyncs: (() => void)[] = [];
/** The latest hold of the account's syncs, `accountSync`'s: still held until released. */
let accountSyncHold = { released: true };

/**
 * Holds the syncs of the account's wallet only, its card wallets' going on: its
 * `getInfo({ ensureSynced: true })` waits until the function returned is called (a main balance
 * slow to read). Released by the next reset too.
 */
export function holdAccountSync(): () => void {
  const hold = { released: false };
  let release!: () => void;
  accountSync = new Promise<void>((resolve) => {
    release = () => {
      hold.released = true;
      resolve();
    };
  });
  accountSyncHold = hold;
  heldAccountSyncs.push(release);
  return release;
}

/** The reads of each wallet's balance held by a test (holdBalanceReads), by its state. */
const heldBalanceReads = new Map<object, Promise<void>>();
const balanceReadHolds: (() => void)[] = [];

/**
 * Holds the reads of the balance (`getInfo`) of the wallet whose state is `state` (`fakeWallet`,
 * or a card's: fakeCardWallet) until the function returned is called: its storage slow to answer,
 * after a sync that reached the network. Released by the next reset too.
 */
export function holdBalanceReads(state: object): () => void {
  let release!: () => void;
  heldBalanceReads.set(
    state,
    new Promise<void>((resolve) => {
      release = () => {
        heldBalanceReads.delete(state);
        resolve();
      };
    })
  );
  balanceReadHolds.push(release);
  return release;
}

/** The next deletions of a Lightning address, held by a test (holdAddressDeletion). */
let addressDeletion: Promise<"done" | "lost"> | null = null;
const heldAddressDeletions: (() => void)[] = [];

/**
 * Holds the next deletion of a Lightning address until the function returned is called: "done",
 * the server deletes it and says so; "lost", it deletes it but its answer is lost (the call fails).
 * The deletions after it go through at once.
 */
export function holdAddressDeletion(): (outcome?: "done" | "lost") => void {
  let release!: (outcome: "done" | "lost") => void;
  addressDeletion = new Promise((resolve) => {
    release = resolve;
  });
  heldAddressDeletions.push(() => release("done"));
  return (outcome = "done") => release(outcome);
}

/** The SDK's events the app listens to (`SdkEvent_Tags`, 0.28.4). */
export enum SdkEvent_Tags {
  Synced = "Synced",
  UnclaimedDeposits = "UnclaimedDeposits",
  ClaimedDeposits = "ClaimedDeposits",
  PaymentSucceeded = "PaymentSucceeded",
  PaymentPending = "PaymentPending",
  PaymentFailed = "PaymentFailed",
  PaymentMetadataUpdated = "PaymentMetadataUpdated",
  AutoOptimization = "AutoOptimization",
  LightningAddressChanged = "LightningAddressChanged",
  NewDeposits = "NewDeposits",
  UnilateralExitStateChanged = "UnilateralExitStateChanged"
}

type FakeEventListener = {
  onEvent(event: { tag: SdkEvent_Tags; inner?: { payment: unknown } }): Promise<void>;
};

/** The listeners of each SDK instance connected, by the state of its wallet. */
const eventListeners = new Map<object, Set<Map<string, FakeEventListener>>>();
/**
 * The first listener of each instance: the wallet layer's own, which it adds as it connects, before
 * anything else uses the instance (src/lib/breez/network-sync.ts).
 */
const ownListeners = new WeakMap<Map<string, FakeEventListener>, string>();
let listenersMade = 0;

/**
 * The SDK of the wallet whose state is `state` (`fakeWallet`, or a card's: fakeCardWallet) tells
 * its listeners the event `tag`, as the SDK does once it stored what the event says; `payment`:
 * the one a payment's event carries (`inner.payment`, as the bindings give it).
 */
export async function emitSdkEvent(
  state: object,
  tag: SdkEvent_Tags,
  payment?: unknown
): Promise<void> {
  const event = payment === undefined ? { tag } : { tag, inner: { payment } };
  for (const listeners of eventListeners.get(state) ?? []) {
    for (const listener of [...listeners.values()]) await listener.onEvent(event);
  }
}

/**
 * How many listeners the SDK instances of the wallet whose state is `state` hold now, besides the
 * one the wallet layer adds as each connects (ownListeners): the app's screens'.
 */
export function sdkListenerCount(state: object): number {
  let count = 0;
  for (const listeners of eventListeners.get(state) ?? []) {
    const own = ownListeners.get(listeners);
    count += listeners.size - (own !== undefined && listeners.has(own) ? 1 : 0);
  }
  return count;
}

/** Whether the Spark operators answer (setSparkReachable). */
let sparkReachable = true;

/**
 * Makes the Spark operators reachable or not, for every wallet, as the network would: unreachable,
 * a sync claims nothing and its listeners hear no `Synced`, yet it ends, and with it the first wait
 * of `getInfo({ ensureSynced: true })` (wallet-sync-sdk.test.ts). Reachable again at the next reset.
 */
export function setSparkReachable(reachable: boolean): void {
  sparkReachable = reachable;
}

export function resetFakeWallet(): void {
  eventListeners.clear();
  receiveFeeSats = BigInt(0);
  fakeWallet.balanceSats = BigInt(0);
  fakeWallet.payments = [];
  fakeWallet.unclaimedDeposits = [];
  fakeWallet.connectError = null;
  fakeWallet.recovery = emptyRecovery();
  fakeChainFees.hourFee = BigInt(2);
  fakeChainFees.ratesError = null;
  fakeRecoveryBuilds.splice(0);
  fakeCardWallets.clear();
  // The usernames registered (the server's): a card's wallet of the next test registers its own
  // again, its first choice free (lightning-address.ts tries three).
  lightningAddresses.clear();
  accountIncoming.splice(0);
  // The syncs a test held (and failed before releasing) end: their calls never outlive the test.
  for (const release of heldSyncs.splice(0)) release();
  firstSync = Promise.resolve();
  firstSyncHold = { released: true };
  for (const release of heldAccountSyncs.splice(0)) release();
  accountSync = Promise.resolve();
  accountSyncHold = { released: true };
  sparkReachable = true;
  for (const release of heldAddressDeletions.splice(0)) release();
  for (const release of balanceReadHolds.splice(0)) release();
  addressDeletion = null;
  sentByKey.clear();
  madeInvoices.clear();
  signersMade.count = 0;
  signersMade.destroyed = 0;
  accountConnections.count = 0;
}

export enum InputType_Tags {
  BitcoinAddress = "BitcoinAddress",
  Bolt11Invoice = "Bolt11Invoice",
  Bolt12Offer = "Bolt12Offer",
  LightningAddress = "LightningAddress",
  LnurlPay = "LnurlPay",
  Bip21 = "Bip21",
  SparkAddress = "SparkAddress"
}
export enum BitcoinNetwork {
  Bitcoin,
  Testnet3,
  Testnet4,
  Signet,
  Regtest
}
export enum SendPaymentMethod_Tags {
  BitcoinAddress = "BitcoinAddress",
  Bolt11Invoice = "Bolt11Invoice",
  SparkAddress = "SparkAddress"
}
export enum OnchainConfirmationSpeed {
  Fast,
  Medium,
  Slow
}
export enum FeePolicy {
  FeesExcluded,
  FeesIncluded
}

export const PaymentRequest = {
  Input: class {
    readonly tag = "Input";
    constructor(readonly inner: { input: string }) {}
  }
};

export const SendPaymentOptions = {
  BitcoinAddress: class {
    readonly tag = "BitcoinAddress";
    constructor(readonly inner: { confirmationSpeed: OnchainConfirmationSpeed }) {}
  },
  Bolt11Invoice: class {
    readonly tag = "Bolt11Invoice";
    constructor(readonly inner: { preferSpark: boolean; completionTimeoutSecs?: number }) {}
  },
  SparkAddress: class {
    readonly tag = "SparkAddress";
    constructor(readonly inner: { htlcOptions: unknown }) {}
  }
};

export enum Seed_Tags {
  Mnemonic = "Mnemonic",
  Entropy = "Entropy"
}

/** `Seed`, as the bindings build it (seed.ts, mnemonicSeed): `{ tag, inner }`. */
export const Seed = {
  Mnemonic: class {
    readonly tag = Seed_Tags.Mnemonic;
    constructor(readonly inner: { mnemonic: string; passphrase: string | undefined }) {}
  }
};

/**
 * The identity a wallet of the fake SDK gets from its words (a card's, seed.ts mnemonicSeed): any
 * other words, another identity. The account's wallet keeps FAKE_IDENTITY_PUBKEY, whatever its
 * seed.
 */
export function fakeIdentityOf(mnemonic: string): string {
  return `02${bytesToHex(sha256(utf8ToBytes(mnemonic)))}`;
}

/** The Spark address of the fake wallet of `identity`: `parse` reads it back. */
export function fakeSparkAddress(identity: string): string {
  return `spark1${identity}`;
}

/**
 * A card's wallet in the fake SDK (src/lib/breez/card-wallet-names.ts): its own balance, payments
 * and deposits, the identity of the words it was connected with (null before), its Lightning
 * address, the invoices it made, and the Spark transfers other wallets sent it, claimed at its next
 * sync or connection (as the SDK claims transfers when it syncs).
 */
export type FakeCardWallet = {
  balanceSats: bigint;
  payments: Record<string, unknown>[];
  unclaimedDeposits: Record<string, unknown>[];
  identity: string | null;
  username: string | null;
  invoices: string[];
  /** The expiry its invoices carry when none is asked, as the SDK's default (null: none). */
  invoiceExpirySecs: number | null;
  /**
   * How far behind this device's clock its invoices are dated: the issuer's clock, or this
   * device's set ahead (0: the same).
   */
  invoiceClockSkewSecs: number;
  incoming: bigint[];
  /** Set: listing its payments throws it (its storage unreadable). */
  listError: Error | null;
  /** As fakeWallet's. */
  recovery: FakeRecovery;
};

/** The card wallets of the fake SDK, by their path (`<card id>/<generation>`). */
export const fakeCardWallets = new Map<string, FakeCardWallet>();

/** The card's wallet of `cardId` at `generation`, made empty when the fake has none yet. */
export function fakeCardWallet(cardId: string, generation = 1): FakeCardWallet {
  return cardWalletAt(`${cardId}/${generation}`);
}

function cardWalletAt(path: string): FakeCardWallet {
  let found = fakeCardWallets.get(path);
  if (!found) {
    found = {
      balanceSats: BigInt(0),
      payments: [],
      unclaimedDeposits: [],
      identity: null,
      username: null,
      invoices: [],
      invoiceExpirySecs: null,
      invoiceClockSkewSecs: 0,
      incoming: [],
      listError: null,
      recovery: emptyRecovery()
    };
    fakeCardWallets.set(path, found);
  }
  return found;
}

/** The Spark transfers sent to the account's wallet, claimed at its next sync or connection. */
const accountIncoming: bigint[] = [];

/** The card's wallet whose storage is `storageDir`, null for the account's. */
function cardWalletOf(storageDir: string | undefined): FakeCardWallet | null {
  const marker = "/breez-sdk-spark-cards/";
  const at = storageDir?.indexOf(marker) ?? -1;
  return storageDir && at >= 0 ? cardWalletAt(storageDir.slice(at + marker.length)) : null;
}

/** The Lightning address usernames the card wallets hold: never the account's. */
function cardUsernames(): Set<string> {
  return new Set(
    [...fakeCardWallets.values()].flatMap(({ username }) => (username ? [username] : []))
  );
}

/** The account's Lightning address username: the first registered that no card wallet holds. */
function accountUsername(): string | undefined {
  const cards = cardUsernames();
  return [...lightningAddresses.keys()].find((username) => !cards.has(username));
}

/** Claims the Spark transfers `incoming` into `state`: each a payment received. */
function claimTransfers(
  state: { balanceSats: bigint; payments: Record<string, unknown>[] },
  incoming: bigint[]
): void {
  for (const amount of incoming.splice(0)) {
    state.balanceSats += amount;
    state.payments = [
      {
        id: `received-${state.payments.length + 1}`,
        paymentType: PaymentType.Receive,
        status: PaymentStatus.Completed,
        amount,
        fees: BigInt(0),
        timestamp: BigInt(Math.floor(Date.now() / 1000)),
        method: PaymentMethod.Spark,
        details: { tag: PaymentDetails_Tags.Spark, inner: { invoiceDetails: undefined } }
      },
      ...state.payments
    ];
  }
}

/** Where a Spark transfer to `identity` waits to be claimed. */
function incomingOf(identity: string): bigint[] | null {
  if (identity === FAKE_IDENTITY_PUBKEY) return accountIncoming;
  for (const card of fakeCardWallets.values()) {
    if (card.identity === identity) return card.incoming;
  }
  return null;
}

/**
 * What "Send" meets in the fake wallet: `inputs` is what the SDK's `parse` reads (an
 * `InputType` as the bindings give it, by the text parsed; anything else is refused, as the SDK
 * does), the fees it quotes, and the state of the payments it sends. Tests set it;
 * `resetFakeSend()` empties it.
 */
export const fakeSend: {
  inputs: Map<string, { tag: InputType_Tags; inner: unknown[] }>;
  lightningFeeSats: bigint;
  onchainFees: Record<
    "fast" | "medium" | "slow",
    { userFeeSat: bigint; l1BroadcastFeeSat: bigint }
  >;
  /** The state of a payment when `sendPayment` / `lnurlPay` returns. */
  sentStatus: PaymentStatus;
  /** Set: the prepare calls answer this amount instead of the one asked (an SDK bug). */
  quotedAmount: bigint | null;
  /** Set: the send calls throw it. */
  sendError: Error | null;
  /** The preimage a Lightning payment of an invoice releases, by payment hash (`htlcDetails`). */
  preimages: Map<string, string>;
  /** The fee a Spark transfer quotes: 0, as spark-sdk 0.28.4 does. */
  sparkFeeSats: bigint;
  /** The Lightning addresses `parse` asked cash.app for, from cashtags (cashAppAddress). */
  cashtagsAsked: string[];
} = {
  inputs: new Map(),
  lightningFeeSats: BigInt(3),
  onchainFees: {
    fast: { userFeeSat: BigInt(1500), l1BroadcastFeeSat: BigInt(340) },
    medium: { userFeeSat: BigInt(900), l1BroadcastFeeSat: BigInt(340) },
    slow: { userFeeSat: BigInt(400), l1BroadcastFeeSat: BigInt(340) }
  },
  sentStatus: PaymentStatus.Completed,
  quotedAmount: null,
  sendError: null,
  preimages: new Map(),
  sparkFeeSats: BigInt(0),
  cashtagsAsked: []
};

/** Set while a test holds the sends (holdSends): each send waits for it. */
let sendsHeld: Promise<void> | null = null;
const heldSends: (() => void)[] = [];

/**
 * Holds every `sendPayment` and `lnurlPay` until the function returned is called: a send that does
 * not come back (a network that hangs, a process Android froze). Released by the next reset too.
 */
export function holdSends(): () => void {
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = () => {
      if (sendsHeld === held) sendsHeld = null;
      resolve();
    };
  });
  sendsHeld = held;
  heldSends.push(release);
  return release;
}

/** Set while a test holds what is asked of the wallets (holdReceives): each request waits for it. */
let receivesHeld: Promise<void> | null = null;
const heldReceives: (() => void)[] = [];

/**
 * Holds every `receivePayment` (an invoice, an address asked of a wallet) until the function
 * returned is called: an answer that comes late. Released by the next reset too.
 */
export function holdReceives(): () => void {
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = () => {
      if (receivesHeld === held) receivesHeld = null;
      resolve();
    };
  });
  receivesHeld = held;
  heldReceives.push(release);
  return release;
}

export function resetFakeSend(): void {
  for (const release of heldSends.splice(0)) release();
  sendsHeld = null;
  for (const release of heldReceives.splice(0)) release();
  receivesHeld = null;
  fakeSend.inputs = new Map();
  fakeSend.lightningFeeSats = BigInt(3);
  fakeSend.sentStatus = PaymentStatus.Completed;
  fakeSend.quotedAmount = null;
  fakeSend.sendError = null;
  fakeSend.preimages = new Map();
  fakeSend.sparkFeeSats = BigInt(0);
  fakeSend.cashtagsAsked = [];
  invoicesMade.count = 1;
}

/** The invoices the fake wallets made: each its own payment hash (preimagePair). */
const invoicesMade = { count: 1 };

type MadeInvoice = {
  state: { balanceSats: bigint; payments: Record<string, unknown>[] };
  amountSats: bigint;
  paymentHash: string;
  preimage: string;
  description: string;
};

/** The invoices the fake wallets made, by their BOLT11, for settleReceivedInvoice. */
const madeInvoices = new Map<string, MadeInvoice>();

/** What a receipt settled by settleReceivedInvoice leaves out of the invoice's amount. */
let receiveFeeSats = BigInt(0);

/**
 * From now on (until the next test), a receipt settled by settleReceivedInvoice credits `sats` less
 * than its invoice asked, its payment saying what was credited: a wallet that pays to receive.
 */
export function chargeReceiveFee(sats: bigint): void {
  receiveFeeSats = sats;
}

/**
 * Settles an invoice a fake wallet made (receivePayment) as received: credits that wallet and adds
 * a completed Lightning receipt carrying the invoice's payment hash, as a payment from someone else
 * would (the v2 server paying a drained card's invoice, src/features/card/migration.ts). Returns
 * false when no fake wallet made this invoice.
 */
export function settleReceivedInvoice(invoice: string): boolean {
  const made = madeInvoices.get(invoice);
  if (!made) return false;
  const credited = made.amountSats - receiveFeeSats;
  made.state.balanceSats += credited;
  made.state.payments = [
    {
      id: `received-ln-${made.paymentHash.slice(0, 8)}`,
      paymentType: PaymentType.Receive,
      status: PaymentStatus.Completed,
      amount: credited,
      fees: BigInt(0),
      timestamp: BigInt(Math.floor(Date.now() / 1000)),
      method: PaymentMethod.Lightning,
      details: {
        tag: PaymentDetails_Tags.Lightning,
        inner: {
          description: made.description || undefined,
          invoice,
          htlcDetails: { paymentHash: made.paymentHash, preimage: made.preimage },
          lnurlPayInfo: undefined
        }
      }
    },
    ...made.state.payments
  ];
  return true;
}

/**
 * A payment as spark-sdk stores a transfer of a type it does not know, from 0.27.0 on
 * (`PaymentMethod::Unknown`, `decode_proto_enum`; 0.26.1 reads such a type as its first one): of
 * any status, completed too, with the details the provider's request tells
 * (`PaymentDetails::from_transfer`), by default a Lightning receipt's, its description, hash and
 * preimage included. `timestamp` in Unix seconds. Tests put it among a wallet's payments.
 */
export function unknownMethodPayment({
  id,
  send = false,
  status = PaymentStatus.Completed,
  amount,
  fees = BigInt(0),
  timestamp,
  details = {
    tag: PaymentDetails_Tags.Lightning,
    inner: {
      description: "Recharge",
      invoice: "lnbc1fake",
      destinationPubkey: "02ab",
      htlcDetails: { paymentHash: "e".repeat(64), preimage: "d".repeat(64) },
      lnurlPayInfo: undefined
    }
  }
}: {
  id: string;
  send?: boolean;
  status?: PaymentStatus;
  amount: bigint;
  fees?: bigint;
  timestamp: number;
  details?: Record<string, unknown>;
}): Record<string, unknown> {
  return {
    id,
    paymentType: send ? PaymentType.Send : PaymentType.Receive,
    status,
    amount,
    fees,
    timestamp: BigInt(timestamp),
    method: PaymentMethod.Unknown,
    details
  };
}

/** Payments already sent, by idempotency key: the same key never pays twice (as the SDK). */
const sentByKey = new Map<string, Record<string, unknown>>();

function parseInput(input: string) {
  // A Spark address of a fake wallet (fakeSparkAddress): its owner's identity, on mainnet.
  if (/^spark1(02|03)[0-9a-f]{64}$/.test(input)) {
    return {
      tag: InputType_Tags.SparkAddress,
      inner: [
        {
          address: input,
          identityPublicKey: input.slice("spark1".length),
          network: BitcoinNetwork.Bitcoin,
          source: { bip21Uri: undefined, bip353Address: undefined }
        }
      ]
    };
  }
  // A Cash App cashtag ($alice, $alice@cash.app), as spark-sdk 0.28.4 parses it: the Lightning
  // address alice@cash.app, asked of cash.app (`cash_app_lightning_address`).
  const cashtag = cashAppAddress(input);
  if (cashtag !== null) fakeSend.cashtagsAsked.push(cashtag);
  const parsed = fakeSend.inputs.get(cashtag ?? input);
  if (!parsed) throw new Error("InvalidInput: not a payment request");
  return parsed;
}

/** The Lightning address spark-sdk 0.28.4 reads in a cashtag (common/src/buy/cashapp.rs). */
function cashAppAddress(input: string): string | null {
  if (!input.startsWith("$")) return null;
  const tag = input.slice(1);
  const at = tag.indexOf("@");
  const user = at === -1 ? tag : tag.slice(0, at);
  if (at !== -1 && tag.slice(at + 1).toLowerCase() !== "cash.app") return null;
  return /^(?=.*[a-z])[a-z0-9]{1,20}$/i.test(user) ? `${user}@cash.app` : null;
}

/**
 * A payment sent by a wallet of the fake SDK (`state`: the account's, `fakeWallet`, unless a
 * card's): it leaves the balance and joins the list, the newest first. More than the balance:
 * refused, as the SDK does (`InsufficientFunds`).
 */
function sendFake(
  key: string | undefined,
  amount: bigint,
  fees: bigint,
  method: PaymentMethod,
  details: Record<string, unknown>,
  state: { balanceSats: bigint; payments: Record<string, unknown>[] } = fakeWallet
) {
  if (fakeSend.sendError) throw fakeSend.sendError;
  const already = key === undefined ? undefined : sentByKey.get(key);
  if (already) return already;
  // Only the card wallets: the account's tests set any balance they need, or none.
  if (state !== fakeWallet && state.balanceSats < amount + fees) {
    throw new Error("InsufficientFunds");
  }
  const payment = {
    // As spark-sdk 0.28.4: a payment sent with an idempotency key is known by it (its transfer id,
    // send/mod.rs `get_payment_by_id(idempotency_key)`, lightning_sender.rs).
    id: key ?? `sent-${state.payments.length + 1}`,
    paymentType: PaymentType.Send,
    status: fakeSend.sentStatus,
    amount,
    fees,
    timestamp: BigInt(Math.floor(Date.now() / 1000)),
    method,
    details
  };
  state.balanceSats -= amount + fees;
  state.payments = [payment, ...state.payments];
  if (key !== undefined) sentByKey.set(key, payment);
  return payment;
}

export enum ChainApiType {
  Esplora,
  MempoolSpace
}

// uniffi records: frozen plain objects, Rust's defaults under what is given (uniffiCreateRecord).
export const MaxFee = {
  create: (partial: { onchain: unknown; proportionalPpm?: number }) =>
    Object.freeze({ proportionalPpm: undefined, ...partial })
};

// uniffi enums: one class per variant, with `tag` and `inner`.
export const MaxOnchainFee = {
  Fixed: class {
    readonly tag = "Fixed";
    constructor(readonly inner: { amount: bigint }) {}
  },
  Rate: class {
    readonly tag = "Rate";
    constructor(readonly inner: { satPerVbyte: bigint }) {}
  },
  NetworkRecommended: class {
    readonly tag = "NetworkRecommended";
    constructor(readonly inner: { leewaySatPerVbyte: bigint }) {}
  }
};

// The recovery of funds that left the balance (spark-sdk 0.28.4), as the bindings shape it.
export const ExitLeafSelection = {
  All: class {
    readonly tag = "All";
  },
  RecoverableOnly: class {
    readonly tag = "RecoverableOnly";
  },
  Specific: class {
    readonly tag = "Specific";
    constructor(readonly inner: { leafIds: string[] }) {}
  }
};
export const CpfpFundingKind = {
  P2wpkh: class {
    readonly tag = "P2wpkh";
  },
  P2tr: class {
    readonly tag = "P2tr";
  }
};
export enum RecoveryMethod {
  Cooperative,
  Unilateral
}
export enum RecoveryTxKind {
  Cooperative,
  FanOut,
  Node,
  Refund,
  Sweep
}
export enum ExitTransactionStatus_Tags {
  Confirmed = "Confirmed",
  Ready = "Ready",
  WaitingForDependencies = "WaitingForDependencies",
  WaitingForTimelock = "WaitingForTimelock",
  Unverified = "Unverified"
}

/** The sats a fake wallet has to recover: its leaves out of the balance, not recovered yet. */
function recoverableSats(recovery: FakeRecovery): bigint {
  return recovery.leaves
    .filter(({ leafId }) => !recovery.recovered.has(leafId))
    .reduce((sum, { valueSats }) => sum + valueSats, BigInt(0));
}

/** What recovering `leaf` costs at `rate`: the fee already taken, and its own transaction's. */
function fakeLeafFeeSats(leaf: FakeRecoveryLeaf, rate: bigint): bigint {
  if (leaf.method === "cooperative") {
    return leaf.takenFeeSats + rate * FAKE_RECOVERY_VBYTES.cooperative;
  }
  // A refund confirmed already paid its fee: taken.
  return leaf.stage === "sweep"
    ? leaf.takenFeeSats
    : leaf.takenFeeSats + rate * FAKE_RECOVERY_VBYTES.refund;
}

/** A fake transaction id: the hash of what it is. */
function fakeRecoveryTxid(what: string): string {
  return bytesToHex(sha256(utf8ToBytes(what)));
}

/** A fake signed transaction (73 bytes): enough to look like one to the app's checks. */
function fakeRecoveryTxHex(txid: string): string {
  return `0200000001${txid}${txid}00000000`;
}

/** The totals of a recovery of `leaves` at `rate`, as the SDK's quote and response give them. */
function fakeRecoveryTotals(leaves: FakeRecoveryLeaf[], rate: bigint) {
  const cooperative = leaves.filter(({ method }) => method === "cooperative");
  const unilateral = leaves.filter(({ method }) => method === "unilateral");
  const sum = (list: FakeRecoveryLeaf[]) =>
    list.reduce((total, leaf) => total + fakeLeafFeeSats(leaf, rate), BigInt(0));
  const cooperativeFeeSats = sum(cooperative);
  const refundFeeSats = sum(unilateral);
  const sweepFeeSats = unilateral.length > 0 ? rate * FAKE_RECOVERY_VBYTES.sweep : BigInt(0);
  const cpfpFeeSats = unilateral.some(({ needsFunding }) => needsFunding)
    ? rate * BigInt(200)
    : BigInt(0);
  return {
    recoverableValueSats: leaves.reduce((total, { valueSats }) => total + valueSats, BigInt(0)),
    totalFeeSats: cooperativeFeeSats + refundFeeSats + sweepFeeSats + cpfpFeeSats,
    cooperativeFeeSats,
    cpfpFeeSats,
    fanoutFeeSats: BigInt(0),
    refundFeeSats,
    sweepFeeSats
  };
}

/** The bindings' record of a leaf of a recovery. */
function fakeRecoveryLeafRecord(leaf: FakeRecoveryLeaf) {
  return {
    leafId: leaf.leafId,
    valueSats: leaf.valueSats,
    method: leaf.method === "cooperative" ? RecoveryMethod.Cooperative : RecoveryMethod.Unilateral
  };
}

/**
 * `prepareRecoverFunds` of a fake wallet (spark-sdk 0.28.4): the leaves the selection names, or
 * those worth recovering at the rate (`RecoverableOnly`), with their fees. A step that needs
 * funding is quoted only with a funding kind: without one, the SDK refuses the whole selection
 * (sdk/unilateral_exit.rs, "A funding kind is needed").
 */
function prepareFakeRecovery(
  recovery: FakeRecovery,
  request: {
    feeRateSatPerVbyte: bigint;
    fundingKind?: unknown;
    destination: string;
    selection: { tag: string; inner?: { leafIds: string[] } };
  }
) {
  const rate = request.feeRateSatPerVbyte;
  const open = recovery.leaves.filter(({ leafId }) => !recovery.recovered.has(leafId));
  let leaves: FakeRecoveryLeaf[];
  const skipped: { leafId: string; valueSats: bigint; reason: { tag: string } }[] = [];
  if (request.selection.tag === "Specific") {
    const named = new Set(request.selection.inner?.leafIds ?? []);
    leaves = open.filter(({ leafId }) => named.has(leafId));
  } else {
    leaves = [];
    for (const leaf of open) {
      if (leaf.valueSats > fakeLeafFeeSats(leaf, rate)) leaves.push(leaf);
      else skipped.push({ ...leaf, reason: { tag: "FeeExceedsValue" } });
    }
  }
  const needsFunding = leaves.some(
    ({ method, needsFunding: funded }) => method === "unilateral" && funded
  );
  if (needsFunding && request.fundingKind === undefined) {
    throw new Error(
      "InvalidInput: A funding kind is needed: a transaction of a unilateral exit in the " +
        "selection has a CPFP child"
    );
  }
  return {
    leaves: leaves.map(fakeRecoveryLeafRecord),
    skipped: skipped.map(({ leafId, valueSats, reason }) => ({ leafId, valueSats, reason })),
    ...fakeRecoveryTotals(leaves, rate),
    funding: needsFunding ? { singleUtxoSats: BigInt(5000), perBranch: [] } : undefined,
    feeRateSatPerVbyte: rate,
    destination: request.destination,
    exitChainState: { nodes: [], refunds: [] }
  };
}

/**
 * `recoverFunds` of a fake wallet (spark-sdk 0.28.4) for the quote `prepared`: a cooperative
 * recovery per leaf the operators co-sign (one they do not is in `failed`), and for the unilateral
 * leaves their refunds, then one sweep, in broadcast order.
 */
function buildFakeRecovery(recovery: FakeRecovery, prepared: Record<string, unknown>) {
  if (prepared.funding !== undefined) throw new Error("InsufficientCpfpFunds: no funding given");
  const rate = prepared.feeRateSatPerVbyte as bigint;
  const destination = prepared.destination as string;
  const ids = (prepared.leaves as { leafId: string }[]).map(({ leafId }) => leafId);
  const quoted = recovery.leaves.filter(({ leafId }) => ids.includes(leafId));
  const failed = quoted
    .filter(({ method, operatorsFail }) => method === "cooperative" && operatorsFail)
    .map(({ leafId }) => ({
      leafId,
      outputTxid: fakeRecoveryTxid(`exit/${leafId}`),
      outputVout: 0,
      error: { tag: "OperatorsUnavailable", inner: { message: "Operators unreachable" } }
    }));
  const leaves = quoted.filter(({ leafId }) => !failed.some((entry) => entry.leafId === leafId));
  const transactions: Record<string, unknown>[] = [];
  for (const leaf of leaves.filter(({ method }) => method === "cooperative")) {
    const txid = fakeRecoveryTxid(`cooperative/${leaf.leafId}/${destination}/${rate}`);
    transactions.push({
      kind: RecoveryTxKind.Cooperative,
      nodeId: leaf.leafId,
      txid,
      txHex: fakeRecoveryTxHex(txid),
      cpfpTxHex: undefined,
      csvTimelockBlocks: undefined,
      dependsOn: [],
      status: { tag: ExitTransactionStatus_Tags.Ready }
    });
  }
  const unilateral = leaves.filter(({ method }) => method === "unilateral");
  const refunds: string[] = [];
  for (const leaf of unilateral) {
    const txid = fakeRecoveryTxid(`refund/${leaf.leafId}`);
    refunds.push(txid);
    transactions.push({
      kind: RecoveryTxKind.Refund,
      nodeId: leaf.leafId,
      txid,
      txHex: fakeRecoveryTxHex(txid),
      // A refund of a leaf received with the fee ladder: its child pays the fee, out of the leaf.
      cpfpTxHex:
        leaf.feeLadder && leaf.stage !== "sweep"
          ? fakeRecoveryTxHex(fakeRecoveryTxid(`child/${txid}`))
          : undefined,
      csvTimelockBlocks: 2000,
      dependsOn: [],
      status:
        leaf.stage === "timelock"
          ? {
              tag: ExitTransactionStatus_Tags.WaitingForTimelock,
              inner: { spendableAtHeight: 902_000 }
            }
          : leaf.stage === "sweep"
            ? { tag: ExitTransactionStatus_Tags.Confirmed, inner: { blockHeight: 899_000 } }
            : { tag: ExitTransactionStatus_Tags.Ready }
    });
  }
  if (unilateral.length > 0) {
    const txid = fakeRecoveryTxid(`sweep/${refunds.join(",")}/${destination}/${rate}`);
    transactions.push({
      kind: RecoveryTxKind.Sweep,
      nodeId: undefined,
      txid,
      txHex: fakeRecoveryTxHex(txid),
      cpfpTxHex: undefined,
      csvTimelockBlocks: undefined,
      dependsOn: refunds,
      status: unilateral.every(({ stage }) => stage === "sweep")
        ? { tag: ExitTransactionStatus_Tags.Ready }
        : { tag: ExitTransactionStatus_Tags.WaitingForDependencies }
    });
  }
  return {
    ...fakeRecoveryTotals(leaves, rate),
    leaves: leaves.map(fakeRecoveryLeafRecord),
    failed,
    transactions,
    fundingInputs: [],
    feeRateSatPerVbyte: rate,
    destination
  };
}

export const ReceivePaymentMethod = {
  BitcoinAddress: class {
    readonly tag = "BitcoinAddress";
    constructor(readonly inner: { newAddress: boolean | undefined }) {}
  },
  SparkAddress: class {
    readonly tag = "SparkAddress";
  },
  Bolt11Invoice: class {
    readonly tag = "Bolt11Invoice";
    constructor(
      readonly inner: {
        description: string;
        amountSats: bigint | undefined;
        expirySecs: number | undefined;
        paymentHash: string | undefined;
        receiverIdentityPublicKey: string | undefined;
      }
    ) {}
  }
};

/**
 * Deposit addresses of the fake wallet: `receivePayment` with `newAddress: true` hands out the
 * next taproot address of jest/bitcoin.ts (fills 1, 2, …), without it the last one again.
 */
export const depositAddresses = { handedOut: 0 };

function depositAddress(fill: number): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- the fake is loaded by jest.mock
  return (require("./bitcoin") as typeof import("./bitcoin")).taprootAddress(fill);
}

/** A chain service of the SDK (`newRestChainService`), every method a mock. */
export function fakeChainService() {
  return {
    getAddressUtxos: jest.fn(async (_address: string, _options?: unknown) => [
      { txid: "aa".repeat(32), vout: 0, value: BigInt(1000) }
    ]),
    getAddressTxos: jest.fn(async (_address: string, _options?: unknown) => [] as unknown[]),
    getTransactionStatus: jest.fn(async (_txid: string, _options?: unknown) => ({
      confirmed: false
    })),
    tipHeight: jest.fn(async (_options?: unknown) => 900_000),
    getTransactionHex: jest.fn(async (_txid: string, _options?: unknown) => "00"),
    getOutspend: jest.fn(async (_txid: string, _vout: number, _options?: unknown) => ({
      tag: "Unspent"
    })),
    broadcastTransaction: jest.fn(async (_tx: string, _options?: unknown) => undefined),
    recommendedFees: jest.fn(async (_options?: unknown) => ({ fastestFee: BigInt(2) }))
  };
}

export const newRestChainService = jest.fn(
  async (
    _url: string,
    _network: number,
    _apiType: ChainApiType,
    _credentials: unknown,
    _request: { proxy: unknown }
  ) => fakeChainService()
);

/**
 * The SDK's builder, as `connect` uses it (spark-sdk 0.28.4): `build` goes through the `connect`
 * mock below, so that tests driving `connect` drive the builder too. The last builder is kept in
 * `SdkBuilder.last`, with the storage and chain service it was given; `uniffiDestroy` frees its
 * Rust object, which holds the seed.
 */
export class SdkBuilder {
  static last: SdkBuilder | null = null;
  storageDir: string | undefined;
  chainService: unknown;
  uniffiDestroy = jest.fn();
  constructor(
    readonly config: unknown,
    readonly seed: unknown
  ) {
    SdkBuilder.last = this;
  }
  async withDefaultStorage(storageDir: string): Promise<void> {
    this.storageDir = storageDir;
  }
  async withChainService(chainService: unknown): Promise<void> {
    this.chainService = chainService;
  }
  build() {
    return connect({ config: this.config, seed: this.seed, storageDir: this.storageDir });
  }
}

/**
 * An SDK object as the bindings give it (uniffi-bindgen-react-native): each call takes its own
 * reference to the Rust object as it starts, so `uniffiDestroy()` may come while calls run; calls
 * made after it throw.
 */
function sdkObject(methods: Record<string, (...args: never[]) => Promise<unknown>>) {
  let destroyed = false;
  const object: Record<string, jest.Mock> = {
    uniffiDestroy: jest.fn(() => {
      destroyed = true;
    })
  };
  for (const [name, method] of Object.entries(methods)) {
    object[name] = jest.fn(async (...args: never[]) => {
      if (destroyed) throw new Error("UnexpectedNullPointer");
      return method(...args);
    });
  }
  return object;
}

/**
 * The seed's signers (`defaultExternalSigners`): the identity of the account's wallet, whatever the
 * words, as `getInfo` gives it once connected (wallet.ts walletIdOf). Their Rust objects are freed by
 * `uniffiDestroy`; `signersMade` counts them, for the tests that check none is left.
 */
export const signersMade: { count: number; destroyed: number } = { count: 0, destroyed: 0 };

/**
 * How many times the account's own wallet (any storage but a card's) was connected since the test
 * began: a card holder's account never connects it.
 */
export const accountConnections: { count: number } = { count: 0 };
export const defaultExternalSigners = jest.fn(
  (mnemonic: string, _passphrase: string | undefined, _network: number) => {
    if (typeof mnemonic !== "string" || mnemonic.trim() === "") throw new Error("No mnemonic");
    signersMade.count += 1;
    const signer = () => {
      let destroyed = false;
      return {
        getIdentityPublicKey: jest.fn(async () => {
          if (destroyed) throw new Error("UnexpectedNullPointer");
          return { bytes: hexToBytes(FAKE_IDENTITY_PUBKEY).buffer };
        }),
        uniffiDestroy: jest.fn(() => {
          if (!destroyed) signersMade.destroyed += 1;
          destroyed = true;
        })
      };
    };
    return { sparkSigner: signer(), breezSigner: signer() };
  }
);

export const connect = jest.fn(async (request?: unknown) => {
  // The SDK's `disconnect` stops its runtime loop, which holds the sender of its first-sync signal:
  // a `getInfo({ ensureSynced: true })` still waiting then fails (runtime/client.rs, 0.28.4).
  let disconnected!: () => void;
  const stopped = new Promise<false>((resolve) => {
    disconnected = () => resolve(false);
  });
  // Any Full sync of the instance ends its first wait, its `syncWallet` too, which ends well
  // offline (runtime/client.rs, 0.28.4), after the sync already running (sync_coordinator.rs): here
  // the one a test holds.
  let syncWalletEnded!: () => void;
  const syncedByCall = new Promise<true>((resolve) => {
    syncWalletEnded = () => resolve(true);
  });
  // The wallet of the storage connected: a card's (its identity from its words), else the
  // account's.
  const { seed, storageDir } = (request ?? {}) as {
    seed?: { inner?: { mnemonic?: unknown } };
    storageDir?: string;
  };
  const card = cardWalletOf(storageDir);
  // Every attempt counts, a refused one too.
  if (!card) accountConnections.count += 1;
  if (!card && fakeWallet.connectError) throw fakeWallet.connectError;
  if (card) {
    const mnemonic = seed?.inner?.mnemonic;
    if (typeof mnemonic !== "string") throw new Error("A card's wallet needs its words");
    card.identity = fakeIdentityOf(mnemonic);
  }
  const state = card ?? fakeWallet;
  const identity = card?.identity ?? FAKE_IDENTITY_PUBKEY;
  const incoming = card?.incoming ?? accountIncoming;
  // Its syncs held by a test (holdFirstSync, holdAccountSync): ended once this resolves.
  const heldSync = () => (card ? firstSync : firstSync.then(() => accountSync));
  const syncHeld = () => !firstSyncHold.released || (!card && !accountSyncHold.released);
  // Connecting syncs: what other wallets sent it meanwhile is claimed.
  if (sparkReachable) claimTransfers(state, incoming);
  // Its listeners, until removed or until it disconnects ("It also unregisters all event
  // listeners", 0.28.4).
  const listeners = new Map<string, FakeEventListener>();
  const instances = eventListeners.get(state) ?? new Set();
  instances.add(listeners);
  eventListeners.set(state, instances);
  let gone = false;
  // A sync that reached the Spark operators: its listeners hear `Synced` (events.rs, 0.28.4).
  const tellSynced = async () => {
    if (gone || !sparkReachable) return;
    for (const listener of [...listeners.values()]) {
      await listener.onEvent({ tag: SdkEvent_Tags.Synced });
    }
  };
  return sdkObject({
    disconnect: async () => {
      gone = true;
      listeners.clear();
      instances.delete(listeners);
      disconnected();
    },
    addEventListener: async (listener: FakeEventListener) => {
      const id = `listener-${++listenersMade}`;
      listeners.set(id, listener);
      // The first: the wallet layer's own. Its first sync ends then, or once released when held
      // (the SDK's, a few network round trips after it connected, past that listener).
      if (!ownListeners.has(listeners)) {
        ownListeners.set(listeners, id);
        // A promise's turn, never a test's fake timers' (they hold `queueMicrotask` too).
        if (syncHeld()) void heldSync().then(tellSynced);
        else void Promise.resolve().then(tellSynced);
      }
      return id;
    },
    removeEventListener: async (id: string) => listeners.delete(id),
    receivePayment: async ({
      paymentMethod
    }: {
      paymentMethod: { tag: string; inner?: Record<string, unknown> };
    }) => {
      if (receivesHeld) await receivesHeld;
      if (paymentMethod.tag === "SparkAddress") {
        return { paymentRequest: fakeSparkAddress(identity), fee: BigInt(0) };
      }
      if (paymentMethod.tag === "Bolt11Invoice") {
        const { amountSats, description, expirySecs } = paymentMethod.inner as {
          amountSats: bigint | undefined;
          description: string;
          expirySecs: number | undefined;
        };
        // eslint-disable-next-line @typescript-eslint/no-require-imports -- as depositAddress
        const lightning = require("./lightning") as typeof import("./lightning");
        const pair = lightning.preimagePair(invoicesMade.count++);
        const invoice = lightning.makeInvoice({
          amountMsat: amountSats === undefined ? undefined : amountSats * BigInt(1000),
          paymentHash: pair.paymentHash,
          description,
          expirySeconds: expirySecs ?? card?.invoiceExpirySecs ?? undefined,
          timestamp: Math.floor(Date.now() / 1000) - (card?.invoiceClockSkewSecs ?? 0)
        });
        card?.invoices.push(invoice);
        // Kept so a test can settle this invoice as received (settleReceivedInvoice), as a Lightning
        // payment of someone else would: the drain of a v2 card's balance waits for it.
        madeInvoices.set(invoice, {
          state,
          amountSats: amountSats ?? BigInt(0),
          paymentHash: pair.paymentHash,
          preimage: pair.preimage,
          description
        });
        return { paymentRequest: invoice, fee: BigInt(0) };
      }
      const { newAddress } = paymentMethod.inner as { newAddress: boolean | undefined };
      if (newAddress || depositAddresses.handedOut === 0) {
        depositAddresses.handedOut += 1;
      }
      return { paymentRequest: depositAddress(depositAddresses.handedOut), fee: BigInt(0) };
    },
    getLightningAddress: async () => {
      const username = card ? (card.username ?? undefined) : accountUsername();
      return username === undefined
        ? undefined
        : { lightningAddress: `${username}@breez.tips`, username, description: "" };
    },
    checkLightningAddressAvailable: async ({ username }: { username: string }) =>
      !lightningAddresses.has(username),
    // The server keeps the username for this wallet (0.28.4): here, it is free again.
    deleteLightningAddress: async () => {
      const held = addressDeletion;
      addressDeletion = null;
      const outcome = held ? await held : "done";
      const username = card ? (card.username ?? undefined) : accountUsername();
      if (username === undefined) throw new Error("No lightning address registered");
      lightningAddresses.delete(username);
      if (card) card.username = null;
      if (outcome === "lost") throw new Error("The server's answer was lost");
    },
    listUnclaimedDeposits: async (_request: Record<string, never>) => ({
      deposits: [...state.unclaimedDeposits]
    }),
    registerLightningAddress: async ({
      username,
      description
    }: {
      username: string;
      description: string | undefined;
    }) => {
      // Without a description, the server's own, which the SDK returns (spark-sdk 0.28.4:
      // lnurl/src/user.rs `shown_description`, core/src/sdk/lightning_address.rs).
      const shown = description ?? `Pay to ${username}@breez.tips`;
      lightningAddresses.set(username, shown);
      if (card) card.username = username;
      return {
        lightningAddress: `${username}@breez.tips`,
        username,
        description: shown
      };
    },
    getInfo: async (request: { ensureSynced: boolean | undefined }) => {
      if (request.ensureSynced) {
        const synced = await Promise.race([heldSync().then(() => true), syncedByCall, stopped]);
        if (!synced) throw new Error("Failed to receive initial synced signal");
      }
      await heldBalanceReads.get(state);
      return {
        identityPubkey: identity,
        balanceSats: state.balanceSats,
        tokenBalances: new Map(),
        // Since spark-sdk 0.27.2: what left the balance for an on-chain recovery.
        recoverableFundsSats: recoverableSats(state.recovery)
      };
    },
    recommendedFees: async () => {
      if (fakeChainFees.ratesError) throw fakeChainFees.ratesError;
      const { hourFee } = fakeChainFees;
      return {
        fastestFee: hourFee * BigInt(2),
        halfHourFee: hourFee + BigInt(1),
        hourFee,
        economyFee: hourFee,
        minimumFee: BigInt(1)
      };
    },
    prepareRecoverFunds: async (request: {
      feeRateSatPerVbyte: bigint;
      fundingKind: unknown;
      destination: string;
      selection: { tag: string; inner?: { leafIds: string[] } };
    }) => prepareFakeRecovery(state.recovery, request),
    recoverFunds: async (
      request: { prepared: Record<string, unknown>; fundingInputs: unknown[] },
      _signer: unknown
    ) => {
      const response = buildFakeRecovery(state.recovery, request.prepared);
      fakeRecoveryBuilds.push({ state, response });
      return response;
    },
    parse: async (input: string) => parseInput(input),
    // Claims what other wallets sent it by Spark and tells `Synced` when the Spark operators answer,
    // and ends the instance's first wait either way. Disconnected while it waits for a held sync,
    // it fails, as the SDK's: its runtime loop is gone (sync_coordinator.rs, 0.28.4).
    syncWallet: async (_request: Record<string, never>) => {
      if (!(await Promise.race([heldSync().then(() => true), stopped]))) {
        throw new Error("Failed to trigger sync: channel closed");
      }
      if (sparkReachable) {
        claimTransfers(state, incoming);
        await tellSynced();
      }
      syncWalletEnded();
      return {};
    },
    prepareLnurlPay: async ({
      amount,
      payRequest,
      feePolicy
    }: {
      amount: bigint;
      payRequest: unknown;
      feePolicy?: FeePolicy;
    }) => {
      // FeesIncluded (spark-sdk 0.28.4, `prepare_fees_included`): the whole is spent, the
      // service's invoice asks it less the fee, which must leave something.
      const included = feePolicy === FeePolicy.FeesIncluded;
      const fee = fakeSend.lightningFeeSats;
      if (included && amount <= fee) throw new Error("InvalidInput: Amount too small for fees");
      return {
        amountSats: fakeSend.quotedAmount ?? amount,
        comment: undefined,
        payRequest,
        feeSats: fee,
        // The LNURL service's invoice, valid 10 minutes.
        invoiceDetails: {
          timestamp: BigInt(Math.floor(Date.now() / 1000)),
          expiry: BigInt(600),
          amountMsat: included ? (amount - fee) * BigInt(1000) : undefined
        },
        successAction: undefined,
        conversionEstimate: undefined,
        feePolicy: included ? FeePolicy.FeesIncluded : FeePolicy.FeesExcluded
      };
    },
    lnurlPay: async ({
      prepareResponse,
      idempotencyKey
    }: {
      prepareResponse: {
        amountSats: bigint;
        feeSats: bigint;
        payRequest: { address?: string };
        feePolicy?: FeePolicy;
      };
      idempotencyKey: string | undefined;
    }) => {
      await sendsHeld;
      // FeesIncluded: what is sent is the whole less the fee (the wallet spends the whole).
      const included = prepareResponse.feePolicy === FeePolicy.FeesIncluded;
      return {
        payment: sendFake(
          idempotencyKey,
          included
            ? prepareResponse.amountSats - prepareResponse.feeSats
            : prepareResponse.amountSats,
          prepareResponse.feeSats,
          PaymentMethod.Lightning,
          {
            tag: PaymentDetails_Tags.Lightning,
            inner: {
              description: undefined,
              invoice: "lnbc-lnurl",
              destinationPubkey: "02ef",
              htlcDetails: { paymentHash: "1111" },
              lnurlPayInfo: { lnAddress: prepareResponse.payRequest.address }
            }
          },
          state
        ),
        successAction: undefined
      };
    },
    prepareSendPayment: async ({
      paymentRequest,
      amount,
      feePolicy
    }: {
      paymentRequest: { inner: { input: string } };
      amount: bigint | undefined;
      feePolicy?: FeePolicy;
    }) => {
      const parsed = parseInput(paymentRequest.inner.input);
      const included = feePolicy === FeePolicy.FeesIncluded;
      // As spark-sdk 0.28.4 (prepare/bolt11.rs): an invoice of its own amount takes no FeesIncluded.
      if (
        included &&
        parsed.tag === InputType_Tags.Bolt11Invoice &&
        (parsed.inner[0] as { amountMsat?: bigint }).amountMsat !== undefined
      ) {
        throw new Error(
          "InvalidInput: FeesIncluded is not supported for invoices with a fixed amount"
        );
      }
      if (parsed.tag === InputType_Tags.SparkAddress) {
        if (amount === undefined) throw new Error("InvalidInput: Amount is required");
        const [details] = parsed.inner as [{ address: string }];
        return {
          // As spark-sdk 0.28.4 (prepare/spark_address.rs): a Spark transfer, its fee 0 unless a
          // test sets another.
          paymentMethod: {
            tag: SendPaymentMethod_Tags.SparkAddress,
            inner: {
              address: details.address,
              fee: fakeSend.sparkFeeSats,
              tokenIdentifier: undefined
            }
          },
          amount: fakeSend.quotedAmount ?? amount,
          tokenIdentifier: undefined,
          conversionEstimate: undefined,
          // The policy asked (prepare/spark_address.rs): the fee is 0 either way.
          feePolicy: included ? FeePolicy.FeesIncluded : FeePolicy.FeesExcluded
        };
      }
      if (parsed.tag === InputType_Tags.Bolt11Invoice) {
        const details = parsed.inner[0] as { amountMsat: bigint | undefined };
        if (details.amountMsat !== undefined && amount !== undefined) {
          throw new Error("InvalidInput: the invoice has its own amount");
        }
        const invoiceAmount =
          details.amountMsat === undefined ? amount : details.amountMsat / BigInt(1000);
        if (invoiceAmount === undefined) throw new Error("InvalidInput: amount required");
        return {
          paymentMethod: {
            tag: SendPaymentMethod_Tags.Bolt11Invoice,
            inner: {
              invoiceDetails: details,
              sparkTransferFeeSats: undefined,
              lightningFeeSats: fakeSend.lightningFeeSats
            }
          },
          amount: fakeSend.quotedAmount ?? invoiceAmount,
          tokenIdentifier: undefined,
          conversionEstimate: undefined,
          feePolicy: FeePolicy.FeesExcluded
        };
      }
      if (parsed.tag === InputType_Tags.BitcoinAddress) {
        if (amount === undefined) throw new Error("InvalidInput: amount required");
        // FeesIncluded (prepare/bitcoin_address.rs): what is left after the slowest fee is no dust.
        const slow = fakeSend.onchainFees.slow;
        if (included && amount - slow.userFeeSat - slow.l1BroadcastFeeSat < BigInt(330)) {
          throw new Error("InvalidInput: Amount below dust after lowest fees");
        }
        return {
          paymentMethod: {
            tag: SendPaymentMethod_Tags.BitcoinAddress,
            inner: {
              address: parsed.inner[0],
              feeQuote: {
                id: "quote",
                expiresAt: BigInt(0),
                speedFast: fakeSend.onchainFees.fast,
                speedMedium: fakeSend.onchainFees.medium,
                speedSlow: fakeSend.onchainFees.slow,
                isEstimate: false
              }
            }
          },
          amount: fakeSend.quotedAmount ?? amount,
          tokenIdentifier: undefined,
          conversionEstimate: undefined,
          feePolicy: included ? FeePolicy.FeesIncluded : FeePolicy.FeesExcluded
        };
      }
      throw new Error("InvalidInput: unsupported payment request");
    },
    sendPayment: async ({
      prepareResponse,
      options,
      idempotencyKey
    }: {
      prepareResponse: {
        amount: bigint;
        feePolicy?: FeePolicy;
        paymentMethod: {
          tag: SendPaymentMethod_Tags;
          inner: {
            lightningFeeSats?: bigint;
            feeQuote?: Record<string, { userFeeSat: bigint; l1BroadcastFeeSat: bigint }>;
            invoiceDetails?: { description?: string; paymentHash?: string };
          };
        };
      };
      options: { tag: string; inner: { confirmationSpeed?: OnchainConfirmationSpeed } };
      idempotencyKey: string | undefined;
    }) => {
      await sendsHeld;
      const { paymentMethod, amount } = prepareResponse;
      if (paymentMethod.tag === SendPaymentMethod_Tags.SparkAddress) {
        const { address, fee } = paymentMethod.inner as { address: string; fee: bigint };
        const repeated = idempotencyKey !== undefined && sentByKey.has(idempotencyKey);
        const payment = sendFake(
          idempotencyKey,
          amount,
          fee,
          PaymentMethod.Spark,
          { tag: PaymentDetails_Tags.Spark, inner: { invoiceDetails: undefined } },
          state
        );
        // Delivered to the wallet of the address (once per key), claimed at its next sync.
        if (!repeated) incomingOf(address.slice("spark1".length))?.push(amount);
        return { payment };
      }
      if (paymentMethod.tag === SendPaymentMethod_Tags.BitcoinAddress) {
        const speed = options.inner.confirmationSpeed;
        const quote =
          paymentMethod.inner.feeQuote![
            speed === OnchainConfirmationSpeed.Fast
              ? "speedFast"
              : speed === OnchainConfirmationSpeed.Slow
                ? "speedSlow"
                : "speedMedium"
          ];
        const fee = quote.userFeeSat + quote.l1BroadcastFeeSat;
        // FeesIncluded (send/bitcoin_address.rs): the whole less this speed's fee is sent.
        const included = prepareResponse.feePolicy === FeePolicy.FeesIncluded;
        return {
          payment: sendFake(
            idempotencyKey,
            included ? amount - fee : amount,
            fee,
            PaymentMethod.Withdraw,
            // The address paid, as spark-sdk 0.28.4 records it (`destinationAddress`).
            {
              tag: PaymentDetails_Tags.Withdraw,
              inner: {
                txId: "ab".repeat(32),
                vout: 0,
                destinationAddress: (
                  paymentMethod.inner as unknown as { address: { address: string } }
                ).address.address
              }
            },
            state
          )
        };
      }
      return {
        payment: sendFake(
          idempotencyKey,
          amount,
          paymentMethod.inner.lightningFeeSats ?? BigInt(0),
          PaymentMethod.Lightning,
          {
            tag: PaymentDetails_Tags.Lightning,
            inner: {
              description: paymentMethod.inner.invoiceDetails?.description,
              invoice: "lnbc-invoice",
              destinationPubkey: "02ef",
              htlcDetails: {
                paymentHash: paymentMethod.inner.invoiceDetails?.paymentHash ?? "",
                preimage: fakeSend.preimages.get(
                  paymentMethod.inner.invoiceDetails?.paymentHash ?? ""
                )
              }
            }
          },
          state
        )
      };
    },
    getPayment: async ({ paymentId }: { paymentId: string }) => {
      const payment = state.payments.find((p) => p.id === paymentId);
      if (!payment) throw new Error("Payment not found");
      return { payment };
    },
    // Newest first, as the SDK's default order (crates/breez-sdk/core/src/persist/sqlite.rs).
    listPayments: async ({
      fromTimestamp,
      offset,
      limit
    }: {
      fromTimestamp: bigint | undefined;
      offset: number | undefined;
      limit: number | undefined;
    }) => {
      if (card?.listError) throw card.listError;
      const since = fromTimestamp;
      const payments = state.payments
        .filter((p) => since === undefined || (p.timestamp as bigint) >= since)
        .slice(offset ?? 0);
      return { payments: limit === undefined ? payments : payments.slice(0, limit) };
    }
  });
});

/** Salt of the passkey identity (crates/breez-sdk/core/src/passkey/derivation.rs). */
export const ACCOUNT_MASTER_SALT = "4e594f415354525453414f594e";

// uniffi marks its objects with a type name, which `instanceOf` checks.
const typeName = Symbol("uniffiTypeName");

class FakeUniffiError extends Error {
  readonly [typeName]: string;
  constructor(
    type: string,
    readonly tag: string,
    readonly inner?: unknown
  ) {
    super(`${type}.${tag}`);
    this[typeName] = type;
  }
}

export enum PrfProviderError_Tags {
  PrfNotSupported = "PrfNotSupported",
  UserCancelled = "UserCancelled",
  UserTimedOut = "UserTimedOut",
  CredentialNotFound = "CredentialNotFound",
  AuthenticationFailed = "AuthenticationFailed",
  PrfEvaluationFailed = "PrfEvaluationFailed",
  Configuration = "Configuration",
  CredentialAlreadyExists = "CredentialAlreadyExists",
  Generic = "Generic"
}

function prfVariant(tag: PrfProviderError_Tags) {
  return class extends FakeUniffiError {
    constructor(message?: string) {
      super("PrfProviderError", tag, message === undefined ? undefined : [message]);
    }
  };
}

export const PrfProviderError = {
  PrfNotSupported: prfVariant(PrfProviderError_Tags.PrfNotSupported),
  UserCancelled: prfVariant(PrfProviderError_Tags.UserCancelled),
  UserTimedOut: prfVariant(PrfProviderError_Tags.UserTimedOut),
  CredentialNotFound: prfVariant(PrfProviderError_Tags.CredentialNotFound),
  AuthenticationFailed: prfVariant(PrfProviderError_Tags.AuthenticationFailed),
  PrfEvaluationFailed: prfVariant(PrfProviderError_Tags.PrfEvaluationFailed),
  Configuration: prfVariant(PrfProviderError_Tags.Configuration),
  CredentialAlreadyExists: prfVariant(PrfProviderError_Tags.CredentialAlreadyExists),
  Generic: prfVariant(PrfProviderError_Tags.Generic),
  instanceOf: (value: unknown): value is FakeUniffiError =>
    value instanceof FakeUniffiError && value[typeName] === "PrfProviderError"
};

export enum PasskeyError_Tags {
  Prf = "Prf",
  Generic = "Generic"
}

export const PasskeyError = {
  Prf: class extends FakeUniffiError {
    constructor(inner: FakeUniffiError) {
      super("PasskeyError", PasskeyError_Tags.Prf, [inner]);
    }
  },
  Generic: class extends FakeUniffiError {
    constructor(message: string) {
      super("PasskeyError", PasskeyError_Tags.Generic, [message]);
    }
  },
  instanceOf: (value: unknown): value is FakeUniffiError =>
    value instanceof FakeUniffiError && value[typeName] === "PasskeyError"
};

export enum DomainAssociation_Tags {
  Associated = "Associated",
  NotAssociated = "NotAssociated",
  Skipped = "Skipped"
}

class FakeDomainAssociation {
  readonly [typeName] = "DomainAssociation";
  constructor(
    readonly tag: DomainAssociation_Tags,
    readonly inner?: { source?: string; reason: string }
  ) {}
}

export const DomainAssociation = {
  Associated: class extends FakeDomainAssociation {
    constructor() {
      super(DomainAssociation_Tags.Associated);
    }
  },
  NotAssociated: class extends FakeDomainAssociation {
    constructor(inner: { source: string; reason: string }) {
      super(DomainAssociation_Tags.NotAssociated, inner);
    }
  },
  Skipped: class extends FakeDomainAssociation {
    constructor(inner: { reason: string }) {
      super(DomainAssociation_Tags.Skipped, inner);
    }
  }
};

export enum PasskeyAvailability_Tags {
  Available = "Available",
  PrfUnsupported = "PrfUnsupported",
  NotAssociated = "NotAssociated",
  Skipped = "Skipped"
}

type HostPrfProvider = {
  deriveSeeds: (request: {
    salts: string[];
    allowCredentials: ArrayBuffer[];
    preferImmediatelyAvailableCredentials: boolean | undefined;
  }) => Promise<{ seeds: ArrayBuffer[]; credentialId: ArrayBuffer | undefined }>;
  isSupported: () => Promise<boolean>;
  checkDomainAssociation: () => Promise<unknown>;
};

/** What Rust does with an error thrown by the host provider. */
function fromProvider(error: unknown): never {
  if (!PrfProviderError.instanceOf(error)) {
    throw new Error(`Rust panic, the app aborts in release builds: ${String(error)}`);
  }
  throw new PasskeyError.Prf(error);
}

/** What the bindings can lower: `ArrayBuffer`, and `undefined` (never `null`) when absent. */
function lowerable(value: unknown, optional = false): boolean {
  return value instanceof ArrayBuffer || (optional && value === undefined);
}

function hex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export class PasskeyClient {
  static instances: PasskeyClient[] = [];

  readonly uniffiDestroy = jest.fn();

  constructor(
    readonly provider: HostPrfProvider,
    readonly breezApiKey: string | undefined,
    readonly config: unknown
  ) {
    PasskeyClient.instances.push(this);
  }

  async checkAvailability() {
    const supported = await this.provider.isSupported().catch(fromProvider);
    if (!supported) return { tag: PasskeyAvailability_Tags.PrfUnsupported };
    const association = await this.provider.checkDomainAssociation().catch(fromProvider);
    if (!(association instanceof FakeDomainAssociation)) {
      throw new Error("Cannot lower the domain association: the call would never settle");
    }
    switch (association.tag) {
      case DomainAssociation_Tags.Associated:
        return { tag: PasskeyAvailability_Tags.Available };
      case DomainAssociation_Tags.NotAssociated:
        return { tag: PasskeyAvailability_Tags.NotAssociated, inner: association.inner };
      default:
        return { tag: PasskeyAvailability_Tags.Skipped, inner: association.inner };
    }
  }

  /** The fast path (with a label): one derive of the identity and label salts, no label store. */
  async signIn(request: {
    label: string | undefined;
    allowCredentials: ArrayBuffer[] | undefined;
    preferImmediatelyAvailableCredentials: boolean | undefined;
  }) {
    if (request.label === undefined) throw new Error("The fake only models the fast path");
    const salts = [ACCOUNT_MASTER_SALT, request.label];
    const output = await this.provider
      .deriveSeeds({
        salts,
        allowCredentials: request.allowCredentials ?? [],
        preferImmediatelyAvailableCredentials: request.preferImmediatelyAvailableCredentials
      })
      .catch(fromProvider);
    if (!output.seeds.every((seed) => lowerable(seed)) || !lowerable(output.credentialId, true)) {
      throw new Error("Cannot lower the derive output: the call would never settle");
    }
    if (output.seeds.length !== salts.length) {
      throw new PasskeyError.Prf(new PrfProviderError.Generic("wrong number of outputs"));
    }
    return {
      // Stands for the mnemonic the SDK derives from the label's PRF output.
      wallet: {
        seed: { tag: "Mnemonic", inner: { mnemonic: `mnemonic of ${hex(output.seeds[1])}` } },
        label: request.label
      },
      labels: [],
      credential: output.credentialId && {
        credentialId: output.credentialId,
        userId: undefined,
        aaguid: undefined,
        backupEligible: undefined
      }
    };
  }
}
