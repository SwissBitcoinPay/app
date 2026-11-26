import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";

import {
  CARD_ANSWER_LEGACY_MS,
  CARD_ANSWER_MARGIN_MS,
  CARD_ANSWER_MS,
  CARD_BALANCE_READ_MS,
  CARD_FRESH_READ_MS,
  CARD_FRESH_READ_SLACK_MS,
  MAX_CARD_PAYMENT_SATS
} from "@/config/card";
import { FOLLOW_FOR_MS, FOLLOW_INTERVAL_MS } from "@/config/wallet";
import type { getAccountWalletId } from "@/features/account/session";
import type { toUnlockFailure, UnlockFailure } from "@/features/account/usePasskeyAccount";
import type { confirmAccountPasskey } from "@/features/account/wallet-access";
import type { refuseOverduePaymentOf } from "@/features/recovery-check/overdue";
import { holdActivity } from "@/lib/activity";
import { getBreezNetwork } from "@/lib/breez/config";
import { SendError, WalletError } from "@/lib/breez/errors";
import type { SendQuote, WalletPayment, WalletSeed } from "@/lib/breez/types";
import { readCardInvoice, type CardInvoice, type CardInvoiceIssue } from "@/lib/card/card-invoice";
import { cardLimitBreach, type CardLimitBreach } from "@/lib/card/card-limits";
import { mergeCardStates, type CardState } from "@/lib/card/card-record";
import { sameCardWallet, type CardWalletOf } from "@/lib/card/keys";
import {
  decidePayee,
  decidePayeeAmong,
  type CardConfirmationCause,
  type CardPayeeView,
  type PayeeDecision
} from "@/lib/card/payee-decision";
import {
  checkPayee,
  type IdentifiedPayee,
  type PayeeCheck,
  type PayeeCheckOptions
} from "@/lib/card/payee-proof";
import { bookOf, payeesView, withPayeeCopies, type RemotePayees } from "@/lib/card/payee-book";
import { NewerCardPayeesError } from "@/lib/card/payee-store";
import type {
  approveCardPayee,
  loadCardPayees,
  loadPayeeBooks,
  noteCardPayee,
  CardPayees
} from "@/lib/card/payees";
import {
  NewerCardPaymentsError,
  type CardPaymentEntry,
  type CardPaymentOutcome,
  type CardPaymentPayee
} from "@/lib/card/payment-entry";
import type { loadCardPayments, logCardPayment } from "@/lib/card/payment-log";
import {
  RelaySessionError,
  openRelaySession,
  type CardDeclineReason,
  type CardInvoiceRequest,
  type RelaySession,
  type RelaySessionOptions
} from "@/lib/card/relay-session";
import { findPassTap, isPassOf, wipeCardPass, type CardPass } from "@/lib/card/card-pass";
import type { loadCardPasses } from "@/lib/card/card-pass-store";
import { identifyCardTap, type TapCheckedWith } from "@/lib/card/tap";
import type { CardWake } from "@/lib/card/wake-packet";
import { logFailure } from "@/lib/log/log";
import { NewerRecordError } from "@/lib/nostr/record";
import { addressHrp } from "@/lib/onchain/address";
import { randomUuid, secureRandomBytes } from "@/lib/random";
import { within } from "@/lib/within";

import type { syncCardPasses } from "./card-passes";
import type { CardWalletLease, leaseCardWallet } from "./card-wallet";
import { declineMessage } from "./decline-message";
import type { publishCardHistory } from "./history-sync";
import type { PayeesRefresh, refreshCardPayees } from "./payees-sync";
import { readOwnCopies } from "./own-copies";
import { NoAccountError, TapAlreadySeenError } from "./state-errors";
import type {
  CardAccess,
  CardStatesRefresh,
  cardStatesOnDevice,
  cardStatesOnDeviceOf,
  recordCardState,
  recordCardStateOnDevice,
  refreshCardStates,
  withCardAccess,
  withCardAccessOf
} from "./states";

/*
 * One tap of a card, from its wake packet to the payment's outcome (relay contract v2,
 * docs/card-relay.md): the relay's session opened, the point of sale's invoice read and shown,
 * its payee checked, then the invoice paid from the card's own wallet (card-wallet.ts, never the
 * account's), without asking or once the holder confirmed, as their mode says
 * (payee-decision.ts). The relay is told the outcome once: `{"ok": true}` once the payment has
 * left, `{"ok": false}` with a reason otherwise.
 *
 * What is checked before the wallet pays (anything from the relay is untrusted):
 * - the invoice: this network's, a whole amount of sats within the relay's bounds (1 sat to
 *   1 BTC), not expired, never paid before from this phone;
 * - the card's limits (card-limits.ts): not suspended, its ceiling per payment, over 24 sliding
 *   hours and per hour, counted from the phone's log of card payments (payment-log.ts), where each
 *   outcome is kept for the holder;
 * - the tap: `p` opens with the wallet's K1 into one of its active cards on this relay, `c` is that
 *   tap's MAC, its counter above the last one seen (tap.ts); its counter is then recorded, so that
 *   it is never good again (card-record.ts);
 * the payee (payee-proof.ts): from the invoice on, at once and beside the tap, the point of sale's
 * proof is checked, its verify URL asked directly from the phone (5 s at most). Its service saying
 * the invoice is another one, or paid already, refuses it. Without a proof that holds, the payee is
 * the node that signed the invoice;
 * - the point of sale still waits: the relay's socket open. The phone answers within a minute of
 *   the invoice (CARD_ANSWER_MS), never past what the relay says the point of sale still waits, a
 *   margin kept (cardAnswerMs): past it, nothing starts leaving, and a payment the holder did not
 *   confirm is refused with the reason of the mode.
 *
 * Paid without asking ("Automatic", an approved merchant in "Approved merchants"), the payment
 * needs the account open (the seed in memory: the tap is checked with it as the invoice comes, and
 * the card's wallet derives from it) and no passkey: the card's limits bound it, and its wallet
 * holds only what was put on it. The account closed (the app closed or locked), with the pass the
 * phone keeps of the card (card-passes.ts: Android, a mode other than "Always confirm", a merchant
 * approved; its K2 checks the tap, its own copies tell its pause, limits and merchants), the tap is
 * checked all the same, and only an identified merchant the holder approved is paid without asking.
 * Asked, the holder confirms with "Pay" and the passkey, once. The account open, its passkey
 * confirms the payment (confirmAccountPasskey). The app locked (till mode), the passkey's seed is
 * checked against this device's point of sale, gives the card's keys and connects the card's wallet
 * for this payment only: the app stays locked, the seed is dropped after. A card's wallet holding
 * less than the payment and its fee refuses it (`insufficientBalance`); one proven, before its
 * holder is asked, to hold less than the payment itself is refused without asking (provenShort).
 * Once paid, the card's hashes are deposited again on its relay when few are left, and the holder
 * gets a notice (paid-notice.ts).
 *
 * These rules run in the app (payment.ts) and, without React Native, in the iOS notification
 * service extension (docs/ios-card-payments.md): what differs between the two, storage, the card's
 * wallet, the texts, and the account and passkey the app only has, comes as ports
 * (CardPaymentPorts). Its imports reach none of them, nor React Native
 * (src/__tests__/card-payment-core.test.ts).
 */

export type CardPaymentFailure =
  /** The relay's session could not be opened: the relay is down, or the tap's session is over. */
  | "unreachable"
  /** The point of sale stopped waiting (the relay ended the session, or its wait passed). */
  | "ended"
  /** Not an invoice the wallet can pay: out of shape. */
  | "invalidInvoice"
  /** No amount, zero, or a fraction of a sat. */
  | "noAmount"
  /** Out of the relay's bounds: 1 sat to 1 BTC. */
  | "outOfBounds"
  | "otherNetwork"
  | "expired"
  /** A limit of the card (card-limits.ts). */
  | CardLimitBreach
  /** The tap is not one of this wallet's active cards', or its MAC is wrong. */
  | "notYourCard"
  /** A tap already seen. */
  | "replayed"
  /** The passkey did not confirm, or the wallet did not open (`unlock` says why). */
  | "unlock"
  /** The card's wallet holds less than the payment and its fee: nothing left, recharge it. */
  | "insufficientBalance"
  /** The wallet did not send the payment: nothing left. */
  | "sendFailed"
  /** The wallet's answer to the send was lost: the payment may have left (see "Wallet"). */
  | "uncertain"
  /** The merchant's service says the invoice it made is another one (payee-proof.ts). */
  | "otherInvoice"
  /** The merchant's service says the invoice is paid already. */
  | "settled"
  /** The holder did not confirm in time, asked for that reason (payee-decision.ts). */
  | CardConfirmationCause
  /** Nothing could leave within the time the point of sale is answered in. */
  | "late"
  /** The card's record (or the log, the approved merchants) was written by a newer app. */
  | "newerApp"
  | "failed";

/** The tapped card as the payment shows it (its name and face), once its tap is checked. */
export type PaidCard = Pick<CardState, "cardId" | "name" | "look" | "issuer">;

export type CardPaymentView =
  /** The relay's session opening, then waiting for the point of sale's invoice. */
  | { phase: "waiting" }
  /** The invoice read; its payee and the tap being checked. */
  | { phase: "checking"; invoice: CardInvoice }
  /**
   * The holder is asked (`cause`), until `deadline` (ms), `answerMs` after the invoice (its whole
   * time, cardAnswerMs): past it, the payment is refused. `approvable`: the holder may approve the
   * merchant as they pay ("Approved merchants"), their choice (never by paying alone).
   */
  | {
      phase: "ready";
      invoice: CardInvoice;
      payee: CardPayeeView;
      card: PaidCard | null;
      cause: CardConfirmationCause;
      approvable: boolean;
      deadline: number;
      answerMs: number;
    }
  /** The passkey's prompt. */
  | { phase: "confirming"; invoice: CardInvoice; payee: CardPayeeView; card: PaidCard | null }
  /** Confirmed, or paid without asking (`automatic`): the card's keys, the wallet, the payment. */
  | {
      phase: "paying";
      invoice: CardInvoice;
      payee: CardPayeeView;
      card: PaidCard | null;
      automatic: boolean;
    }
  /**
   * The payment left: its status, followed while pending (`following`: until it completes or
   * fails, or for FOLLOW_FOR_MS). `approved`: the merchant was approved by this confirmation.
   */
  | {
      phase: "sent";
      invoice: CardInvoice;
      payee: CardPayeeView;
      card: PaidCard | null;
      automatic: boolean;
      approved: boolean;
      status: WalletPayment["status"];
      following: boolean;
    }
  | { phase: "declined"; invoice: CardInvoice; payee: CardPayeeView; card: PaidCard | null }
  /**
   * The session handed over to the app its holder opens (handOver: the iOS extension's engine),
   * nothing answered nor paid: the point of sale still waits.
   */
  | { phase: "handedOver"; invoice: CardInvoice | null }
  | {
      phase: "failed";
      failure: CardPaymentFailure;
      invoice: CardInvoice | null;
      /** Who it would have paid, when known. */
      payee: CardPayeeView | null;
      /** The tapped card, once its tap was checked. */
      card: PaidCard | null;
      /** Why the passkey did not confirm or the wallet did not open, for `unlock`. */
      unlock: UnlockFailure | null;
      /** The time the holder had to answer, once the invoice came (what a late failure says). */
      answerMs: number | null;
    };

/** A payment that left (paid-notice.ts): the holder is told, whatever shows. */
export type CardPaid = {
  amountSats: bigint;
  payee: CardPayeeView;
  status: WalletPayment["status"];
};

/**
 * One payment at a time checks the card's limits against the log and logs itself as being sent
 * (send): two payments running at once cannot both fit in what the limits leave.
 */
let limitsTurn: Promise<unknown> = Promise.resolve();

function inLimitsTurn<T>(run: () => Promise<T>): Promise<T> {
  const turn = limitsTurn.then(run, run);
  limitsTurn = turn.catch(() => undefined);
  return turn;
}

/**
 * How long after the point of sale's invoice the phone answers (ms): a minute, less when the relay
 * says the point of sale waits less (`waitMs` of relay 2.1.0, a
 * phone that connected late), CARD_ANSWER_MARGIN_MS kept off it; without it, the time it had before
 * (CARD_ANSWER_LEGACY_MS, a relay that waited 30 s). Never below 0: then nothing leaves.
 */
export function cardAnswerMs(waitMs: number | null): number {
  if (waitMs === null) return CARD_ANSWER_LEGACY_MS;
  return Math.max(0, Math.min(CARD_ANSWER_MS, waitMs - CARD_ANSWER_MARGIN_MS));
}

/** The tap, as its wake packet gave it (payments.ts). */
export type CardTapRequest = CardWake & {
  /** When the phone received it (ms). */
  receivedAt: number;
};

/** What the device knows before any key: whose cards, and their lowest ceiling on that relay. */
export type CardTapContext = {
  walletId: string;
  maxPaymentSats: bigint;
  /**
   * The wallet's active cards on the tap's relay, each its current wallet, as this phone keeps
   * them; the relays read when the tap is checked may tell another (decideForTappedCard).
   */
  cards: readonly CardWalletOf[];
};

type TapVerdict =
  | { ok: true }
  | { ok: false; failure: "notYourCard" | "replayed" | CardLimitBreach | "newerApp" | "failed" };

/** The reason the phone's log keeps for each failure (relay-session.ts). */
function declineReason(failure: CardPaymentFailure): CardDeclineReason {
  switch (failure) {
    case "invalidInvoice":
    case "otherNetwork":
      return "invalid invoice";
    case "expired":
      return "invoice expired";
    case "noAmount":
      return "invoice without amount";
    case "outOfBounds":
      return "amount out of bounds";
    case "aboveLimit":
      return "amount above limit";
    case "suspended":
      return "card suspended";
    case "alreadyPaid":
    case "settled":
      return "invoice already paid";
    case "otherInvoice":
      return "invalid invoice";
    // Persisted log codes, read back by "History" (history-view.ts): never change them.
    case "newPayee":
      return "payee_not_approved";
    case "unidentifiedPayee":
      return "payee_unidentified";
    case "unconfirmed":
      return "payment_unconfirmed";
    case "dayLimit":
      return "daily limit reached";
    case "hourLimit":
      return "hourly limit reached";
    case "notYourCard":
    case "replayed":
      return "invalid tap";
    case "unlock":
      return "declined";
    case "insufficientBalance":
      return "insufficient_balance";
    case "sendFailed":
    case "uncertain":
      return "payment failed";
    default:
      return "unavailable";
  }
}

function invoiceFailure(issue: CardInvoiceIssue): CardPaymentFailure {
  return issue === "malformed" ? "invalidInvoice" : issue;
}

/** How the log keeps a failure (payment-log.ts). */
function loggedOutcome(failure: CardPaymentFailure): CardPaymentOutcome {
  if (failure === "uncertain") return "uncertain";
  if (failure === "sendFailed" || failure === "failed") return "failed";
  return "declined";
}

/**
 * What a card payment reads, writes and asks outside its own rules, given by where it runs: the
 * app (payment.ts, the app's modules) or the iOS notification service extension (its engine,
 * scripts/extension-engine.js), whose storage differs (one writer per file, docs/
 * ios-card-payments.md). Each member is called as the function its type names.
 */
export type CardPaymentPorts = {
  /** The texts in the holder's language: what the point of sale is told (decline-message.ts). */
  t: Parameters<typeof declineMessage>[1];
  /** The phone's log of card payments (payment-log.ts): the limits, and each outcome. */
  log: { load: typeof loadCardPayments; write: typeof logCardPayment };
  /** The holder's modes and approved merchants (payees.ts); `note`: an approved one's name. */
  payees: {
    load: typeof loadCardPayees;
    loadBooks: typeof loadPayeeBooks;
    note: typeof noteCardPayee;
  };
  /** The cards' passes this phone keeps (card-pass-store.ts). */
  passes: { load: typeof loadCardPasses };
  /** The cards' states this phone keeps, read and recorded without any key (states.ts). */
  states: {
    onDeviceOf: typeof cardStatesOnDeviceOf;
    recordOnDevice: typeof recordCardStateOnDevice;
  };
  /** The tapped card's wallet (card-wallet.ts). */
  leaseWallet: typeof leaseCardWallet;
  /** After a payment with a card's pass: its next taps' hashes deposited (relay-sync.ts). */
  refillWithPass(walletId: string, pass: CardPass, state: CardState): Promise<unknown>;
  /** Why the wallet did not open, when the holder is to be told (usePasskeyAccount.ts). */
  unlockFailure: typeof toUnlockFailure;
  /** What only the app does; null where it does not run (the extension). */
  account: CardAccountPort | null;
};

/**
 * The open account, the passkey and what they allow: the tap checked with the account's keys, the
 * holder asked, a merchant approved, the payment published. The app only.
 */
export type CardAccountPort = {
  /** The open account's wallet id (session.ts), null when none is open. */
  openWalletId: typeof getAccountWalletId;
  withCardAccess: typeof withCardAccess;
  withCardAccessOf: typeof withCardAccessOf;
  refreshStates: typeof refreshCardStates;
  refreshPayees: typeof refreshCardPayees;
  statesOnDevice: typeof cardStatesOnDevice;
  recordState: typeof recordCardState;
  approvePayee: typeof approveCardPayee;
  /** The passkey confirms a payment, the account open (wallet-access.ts). */
  confirmPasskey: typeof confirmAccountPasskey;
  /** Past the check of the 12 words, no payment (overdue.ts). */
  refuseOverduePayment: typeof refuseOverduePaymentOf;
  /** The app locked: the passkey this device saved for the card's account, else any. */
  signIn(walletId: string): Promise<{ seed: WalletSeed }>;
  /** Throws OtherAccountError unless `seed` is the account of `walletId` on this device. */
  checkSeed(seed: WalletSeed, walletId: string): Promise<void>;
  /** The card's next taps' hashes deposited with the account's keys (relay-sync.ts). */
  refillChannel(access: CardAccess, state: CardState): Promise<unknown>;
  publishHistory: typeof publishCardHistory;
  syncPasses: typeof syncCardPasses;
};

export type CardPaymentOptions = Pick<RelaySessionOptions, "createSocket"> & {
  /** How the payee's verify URL is asked (payee-proof.ts). */
  payeeCheck?: PayeeCheckOptions;
  /**
   * Whether a payment decided without asking may leave now (the iOS extension's engine: time
   * enough left before the system ends it). False: the holder is asked instead, as for any payment
   * not proven safe to send (the engine hands the session over then). Always, by default.
   */
  mayPayNow?: () => boolean;
  /** A payment left (payments.ts tells the holder). */
  onPaid?: (paid: CardPaid) => void;
};

export class CardPaymentCore {
  private view: CardPaymentView = { phase: "waiting" };
  private readonly listeners = new Set<() => void>();
  private relay: RelaySession | null = null;
  private invoice: CardInvoice | null = null;
  /**
   * This tap's entry in the phone's log (payment-log.ts), drawn here: never the relay's session.
   * The relay picks the session, and could give an earlier payment's again: keyed on it, that
   * payment would leave the limits' count (cardLimitBreach's `ignore`) and its entry be written
   * over.
   */
  private readonly entryId = bytesToHex(secureRandomBytes(16));
  /**
   * What checked the tap and recorded its counter: the open account's keys or the pass this phone
   * keeps of the card (card-passes.ts) as the invoice came, else the passkey's seed; null: not yet.
   */
  private checkedWith: TapCheckedWith | null = null;
  /**
   * The tapped card's state was read again on a majority of the relays in time (checkTap: the
   * account's records; checkTapWithPass: the card's own copies): only then is it paid without
   * asking. Otherwise a pause, or limits, set elsewhere (the web app, another phone) might not be
   * known yet: the holder is asked.
   */
  private stateReadInTime = false;
  /**
   * The holder's mode and approved merchants were read again on a majority of the relays in time,
   * as the card's state (stateReadInTime): only then is it paid without asking. Otherwise a
   * merchant removed, or a stricter mode chosen, elsewhere might not be known yet: the holder is
   * asked.
   */
  private payeesReadInTime = false;
  /**
   * The pass of the tapped card, the account closed (checkTapWithPass): its wallet and its hashes
   * come from it. Wiped once the payment is done.
   */
  private pass: CardPass | null = null;
  /**
   * What the own copies of the cards on the tap's relay told of their books (checkTapWithPass), by
   * `<card id>/<generation>`: merged into the phone's for the decision (cardPayees), never kept.
   */
  private readonly payeeCopies = new Map<string, RemotePayees | "newer">();
  /** The card the tap was checked against, as it was then (its limits, its wallet). */
  private card: CardState | null = null;
  /** When the point of sale's invoice came (ms): its log entry's date, the answer's start. */
  private invoiceAt = 0;
  /** The same instant on the monotonic clock (`performance.now()`, ms): answerDue. */
  private invoiceAtMonotonic = 0;
  /** The invoice expires before the point of sale stops waiting: its expiry is the deadline. */
  private expiresFirst = false;
  /** How long after `invoiceAt` the answer goes at the latest (cardAnswerMs), once it came. */
  private answerMs: number | null = null;
  /** The point of sale's proof of the payee, as received. */
  private proof: Pick<CardInvoiceRequest, "metadata" | "verify"> | null = null;
  /** The payee's check, and what the mode decided of it. */
  private check: PayeeCheck | null = null;
  private decision: PayeeDecision | null = null;
  /** The card's wallet whose book took the decision (payees()); null: none told yet. */
  private decidedFor: CardWalletOf | null = null;
  /** The session being handed over (handOver): the relay's end that follows is not a failure. */
  private handingOver = false;
  /** Confirmed and approved by this payment. */
  private approved = false;
  /** The holder chose to approve the merchant as they pay ("Approve this merchant"). */
  private approveChosen = false;
  /** Paid without asking. */
  private automatic = false;
  /** The wallet sends it: its outcome answers the point of sale, whatever the time. */
  private sending = false;
  /** Once paid: its preimage (hex), checked against the invoice's hash. */
  private preimage: string | null = null;
  /**
   * The tapped card's wallet, leased once the tap is identified (card-wallet.ts): shared with its
   * other users (another tap of the card, its panel), released once this payment is done with it.
   */
  private lease: Promise<CardWalletLease> | null = null;
  /** The wallet that sent the payment, while its outcome is followed. */
  private paidWith: CardWalletLease | null = null;
  /**
   * Settles once the holder's merchants were read again on the relays (checkTap), or
   * CARD_FRESH_READ_MS (and its slack) later: what the payee's decision waits for.
   */
  private payeesRead: Promise<unknown> = Promise.resolve();
  /** The point of sale no longer waits: nothing is paid from now on. */
  private over = false;
  private deadlineTimer: ReturnType<typeof setTimeout> | null = null;
  private followTimer: ReturnType<typeof setTimeout> | null = null;
  private releaseActivity: (() => void) | null = null;
  private closed = false;
  /** Runs of `run` and `pay` not ended yet (their refill included). */
  private running = 0;
  /** Releases of the card's wallet not ended yet (disconnect). */
  private releasing = 0;
  private finish: (() => void) | null = null;
  private readonly finished = new Promise<void>((resolve) => {
    this.finish = resolve;
  });

  constructor(
    readonly request: CardTapRequest,
    private readonly context: CardTapContext,
    private readonly ports: CardPaymentPorts,
    private readonly options: CardPaymentOptions = {}
  ) {}

  get session(): string {
    return this.request.session;
  }

  getView(): CardPaymentView {
    return this.view;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** What checked the tap (the card wakes' journal, background-wake.ts); null: not yet. */
  tapCheck(): TapCheckedWith | null {
    return this.checkedWith;
  }

  /** Whether the passkey or the payment runs: the panel cannot be closed, nor replaced. */
  isBusy(): boolean {
    return this.view.phase === "confirming" || this.view.phase === "paying";
  }

  /**
   * Settles once nothing of the payment runs any more: the point of sale answered (or the payment
   * closed), what follows a payment done (its refill, its status followed), the card's wallet
   * released. What a wake task waits for before it lets the app's JavaScript go
   * (background-wake.ts).
   */
  done(): Promise<void> {
    return this.finished;
  }

  private settleIfDone(): void {
    if (
      (this.answered() || this.closed) &&
      this.running === 0 &&
      this.releasing === 0 &&
      this.lease === null &&
      this.followTimer === null &&
      !this.isBusy()
    ) {
      // Nothing of the payment needs the card's pass any more.
      if (this.pass) wipeCardPass(this.pass);
      this.pass = null;
      this.finish?.();
      this.finish = null;
    }
  }

  /** `work`, counted as running until it settles (done). */
  private async counted<T>(work: () => Promise<T>): Promise<T> {
    this.running += 1;
    try {
      return await work();
    } finally {
      this.running -= 1;
      this.settleIfDone();
    }
  }

  private show(view: CardPaymentView): void {
    if (this.closed) return;
    this.view = view;
    for (const listener of [...this.listeners]) listener();
  }

  /** The point of sale was given its answer (or the session handed over): what runs only ends. */
  private answered(): boolean {
    const { phase } = this.view;
    return phase === "failed" || phase === "declined" || phase === "sent" || phase === "handedOver";
  }

  private fail(failure: CardPaymentFailure, unlock: UnlockFailure | null = null): void {
    if (!this.answered()) {
      if (failure !== "ended" || this.view.phase === "paying") {
        void this.log(loggedOutcome(failure), declineReason(failure));
      }
      this.relay?.answer({ ok: false, reason: declineMessage(failure, this.ports.t) });
      this.stopDeadline();
      this.show({
        phase: "failed",
        failure,
        invoice: this.invoice,
        payee: this.decision?.payee ?? null,
        card: this.paidCard(),
        unlock,
        answerMs: this.answerMs
      });
    }
    this.endActivity();
    void this.disconnect();
  }

  /**
   * Keeps the tap's outcome in the phone's log (payment-log.ts), once the card and the invoice are
   * known. Whether it was written: a payment is sent only once logged as being sent (send), the
   * other outcomes are the holder's history only.
   */
  private log(outcome: CardPaymentOutcome, reason: string | null): Promise<boolean> {
    const { invoice, card } = this;
    if (!card || !invoice) return Promise.resolve(false);
    return this.ports.log
      .write({
        id: this.entryId,
        cardId: card.cardId,
        walletGeneration: card.walletGeneration,
        at: this.invoiceAt,
        amountSats: invoice.amountSats,
        paymentHash: invoice.paymentHash,
        description: invoice.description,
        outcome,
        reason,
        pr: invoice.pr,
        payee: this.loggedPayee(),
        preimage: this.preimage,
        // Worked out once it left (history-value.ts); the log keeps it from then on.
        value: null
      })
      .then(
        () => true,
        (error: unknown) => {
          logFailure("Logging a card payment failed", error);
          return false;
        }
      );
  }

  /**
   * Who the payment pays and the proof of it, as the log keeps them (payment-log.ts): the point of
   * sale's proof as received, and the service's answer, whether they proved its address or not (a
   * payee identified by its node: the invoice's signature is its proof, the log keeps `pr`). The
   * record tells which by checking the proof again (payment-entry.ts, identifiedPayeeOf).
   */
  private loggedPayee(): CardPaymentPayee | null {
    const check = this.check;
    if (!check || !this.proof) return null;
    return {
      status: this.decision?.payee.status ?? "unidentified",
      name: this.decision?.payee.name ?? null,
      metadata: this.proof.metadata,
      verify: this.proof.verify,
      verifyAnswer: check.status === "identified" ? check.payee.verifyAnswer : check.verifyAnswer
    };
  }

  /**
   * The card's wallet whose book decides: the tapped card's once its tap is checked; before (after
   * the passkey), the only active card of the wallet on the tap's relay as this phone keeps them,
   * as the lowest ceiling bounds it (payments.ts). Null with several: none told yet.
   */
  private bookCard(): CardWalletOf | null {
    const { cards } = this.context;
    return this.card ?? (cards.length === 1 ? cards[0] : null);
  }

  /**
   * The holder's mode and approved merchants for the card's wallet `card` (bookCard), or the
   * failure that stops the payment without them. Books a newer app wrote pay no card; none of
   * another wallet of the card decides (payee-book.ts).
   */
  private payees(card: CardWalletOf): Promise<CardPayees | "newerApp" | "failed"> {
    return this.readPayees(() => this.cardPayees(card));
  }

  /**
   * The card's wallet's mode and merchants as the phone keeps them, with what the card's own copies
   * told (checkTapWithPass: changed on the web app or another phone), never kept: the account's
   * next sync brings them from its own records. NewerCardPayeesError.
   */
  private async cardPayees(card: CardWalletOf): Promise<CardPayees> {
    const copies = this.payeeCopies.get(`${card.cardId}/${card.walletGeneration}`);
    if (!copies) return this.ports.payees.load(this.context.walletId, card);
    if (copies === "newer") throw new NewerCardPayeesError("A newer app wrote the card's copies");
    const books = await this.ports.payees.loadBooks(this.context.walletId);
    if (books.newerOnRelays) {
      throw new NewerCardPayeesError("A newer app wrote approved merchants on the relays");
    }
    return payeesView(withPayeeCopies(bookOf(books, card), copies));
  }

  /**
   * Those of every card the tap can be (none told yet: several on its relay), for the decision
   * among them (payee-decision.ts, decidePayeeAmong); or the failure, as payees().
   */
  private candidatePayees(): Promise<CardPayees[] | "newerApp" | "failed"> {
    const { cards } = this.context;
    return this.readPayees(() => Promise.all(cards.map((card) => this.cardPayees(card))));
  }

  private async readPayees<T>(read: () => Promise<T>): Promise<T | "newerApp" | "failed"> {
    try {
      return await read();
    } catch (error) {
      logFailure("Reading the approved merchants failed", error);
      return error instanceof NewerCardPayeesError ? "newerApp" : "failed";
    }
  }

  /** The phone's log of card payments, or the failure that stops the payment without it. */
  private async payments(): Promise<CardPaymentEntry[] | "newerApp" | "failed"> {
    try {
      return await this.ports.log.load();
    } catch (error) {
      logFailure("Reading the card payments failed", error);
      return error instanceof NewerCardPaymentsError ? "newerApp" : "failed";
    }
  }

  /** Opens the relay's session and reads the invoice. */
  start(): void {
    void this.counted(() => this.run()).catch((error: unknown) => {
      logFailure("Card payment failed", error);
      this.fail("failed");
    });
  }

  private async run(): Promise<void> {
    const relay = openRelaySession(this.request, { createSocket: this.options.createSocket });
    this.relay = relay;
    relay.onEnd(() => this.relayEnded());
    let request: CardInvoiceRequest;
    try {
      request = await relay.invoice;
    } catch (error) {
      const code = error instanceof RelaySessionError ? error.code : null;
      this.fail(
        code === "unreachable" ? "unreachable" : code === "malformed" ? "invalidInvoice" : "ended"
      );
      return;
    }
    if (this.closed) return;
    // From the invoice on, the point of sale waits what the relay says: answered before.
    this.invoiceAt = Date.now();
    this.invoiceAtMonotonic = performance.now();
    let answerMs = cardAnswerMs(request.waitMs);
    this.answerMs = answerMs;
    this.deadlineTimer = setTimeout(() => this.deadlinePassed(), answerMs);
    const cap = this.context.maxPaymentSats;
    const read = readCardInvoice(request.pr, {
      network: addressHrp(getBreezNetwork()),
      maxSats: cap < MAX_CARD_PAYMENT_SATS ? cap : MAX_CARD_PAYMENT_SATS,
      nowSeconds: Math.floor(Date.now() / 1000)
    });
    if (!read.ok) {
      this.fail(invoiceFailure(read.issue));
      return;
    }
    const invoice = read.invoice;
    // An invoice that expires sooner (a till's, made near the end of its period): the holder has
    // until then only, when the wallet would refuse it (checkNotExpired, the same clock), and the
    // point of sale is told so then (never "Answer within 55 s" for an invoice that has 20 left).
    const untilExpiry = invoice.expiresAt * 1000 - this.invoiceAt;
    if (untilExpiry < answerMs) {
      answerMs = Math.max(0, untilExpiry);
      this.answerMs = answerMs;
      this.expiresFirst = true;
      this.stopDeadline();
      this.deadlineTimer = setTimeout(() => this.deadlinePassed(), answerMs);
    }
    this.invoice = invoice;
    this.proof = { metadata: request.metadata, verify: request.verify };
    // At once, while the invoice shows and the tap is checked: the payee.
    const checking = checkPayee(invoice, this.proof, this.options.payeeCheck);
    this.show({ phase: "checking", invoice });
    // The tap is checked now, and the card's wallet connects meanwhile: with the open account's
    // keys, else with the pass this phone keeps of the card (card-passes.ts). Neither: after the
    // passkey.
    let verdict: TapVerdict | null = null;
    let withPass = false;
    if (this.accountOpen()) {
      try {
        verdict = await this.checkTap((run) => this.account().withCardAccess(run));
      } catch (error) {
        // Closed meanwhile (till mode): checked after the passkey instead.
        if (!(error instanceof NoAccountError)) throw error;
      }
    } else {
      verdict = await this.checkTapWithPass(invoice);
      withPass = verdict !== null;
    }
    // Answered meanwhile (too late, the point of sale gone, the panel closed).
    if (this.closed || this.view.phase !== "checking") return;
    if (verdict && !verdict.ok) {
      this.fail(verdict.failure);
      return;
    }
    // "cardRoot": what the phone keeps to pay with the app closed, as the wakes' journal names it.
    if (verdict) this.checkedWith = withPass ? "cardRoot" : "account";
    // The holder's mode and merchants, as the relays told them in time (checkTap), else as kept.
    await this.payeesRead;
    const decidedFor = this.bookCard();
    const [check, payees] = await Promise.all([
      checking,
      decidedFor ? this.payees(decidedFor) : this.candidatePayees()
    ]);
    if (this.closed || this.view.phase !== "checking") return;
    this.check = check;
    if (typeof payees === "string") {
      this.fail(payees);
      return;
    }
    if (check.status === "refused") {
      this.fail(check.reason);
      return;
    }
    // The point of sale gave up meanwhile.
    if (this.over) {
      this.fail("ended");
      return;
    }
    const decision = Array.isArray(payees)
      ? decidePayeeAmong(payees, check)
      : decidePayee(payees, check);
    this.decision = decision;
    this.decidedFor = decidedFor;
    this.notePayee();
    // The card's state and the holder's merchants read in time only (stateReadInTime,
    // payeesReadInTime); the account closed, an approved merchant only (payee-decision.ts).
    const automatic =
      this.stateReadInTime &&
      this.payeesReadInTime &&
      (this.accountOpen()
        ? decision.automatic && this.checkedWith !== null
        : decision.automaticLocked && this.checkedWith === "cardRoot");
    if (automatic && (this.options.mayPayNow?.() ?? true)) {
      await this.payAutomatically(invoice, decision.payee);
      return;
    }
    // Never asked to pay what the card's wallet is proven not to hold: proven within
    // CARD_BALANCE_READ_MS, refused before the panel asks; proven later, refused as soon as it is,
    // while the panel still asks. Not proven: asked, `send` checks the balance again, fee included,
    // before anything leaves.
    const short = this.provenShort(invoice);
    if (short && (await within(short, CARD_BALANCE_READ_MS)) === true) {
      if (this.closed || this.view.phase !== "checking") return;
      this.fail("insufficientBalance");
      return;
    }
    if (this.closed || this.view.phase !== "checking") return;
    void short?.then((proven) => {
      // "Pay" pressed meanwhile: past the passkey, `send` refuses it before anything leaves.
      if (proven && !this.closed && this.view.phase === "ready") this.fail("insufficientBalance");
    });
    this.show({
      phase: "ready",
      invoice,
      payee: decision.payee,
      card: this.paidCard(),
      cause: decision.cause,
      approvable: decision.approveOnConfirm,
      deadline: this.invoiceAt + answerMs,
      answerMs
    });
  }

  /** The tapped card's name and face, once its tap is checked; null before. */
  private paidCard(): PaidCard | null {
    const card = this.card;
    if (!card) return null;
    return { cardId: card.cardId, name: card.name, look: card.look, issuer: card.issuer };
  }

  /**
   * An approved merchant's latest name, for the tapped card, whatever the mode: its approval
   * holds.
   */
  private notePayee(): void {
    const { card, check } = this;
    if (!card || check?.status !== "identified") return;
    this.ports.payees
      .note(this.context.walletId, card, check.payee, Date.now())
      .catch((error: unknown) => {
        logFailure("Keeping a merchant's name failed", error);
      });
  }

  /**
   * The tap checked after the passkey: its card told at last. A decision taken for another card
   * (none told: several on the tap's relay; or one this phone did not keep active yet, that the
   * relays told) is taken again with the tapped card's book, for what the payment shows and keeps
   * from now on. The holder confirmed what was shown: no merchant is approved then.
   */
  private async decideForTappedCard(): Promise<void> {
    const { card, check, decision } = this;
    if (!card || !check || check.status === "refused" || !decision) return;
    if (!this.decidedFor || !sameCardWallet(card, this.decidedFor)) {
      // As the relays told them in time (checkTap), else as kept.
      await this.payeesRead;
      const payees = await this.payees(card);
      // Unreadable now: what was shown stays.
      const taken = typeof payees === "string" ? decision : decidePayee(payees, check);
      this.decision = { ...taken, approveOnConfirm: false };
      this.decidedFor = card;
    }
    this.notePayee();
  }

  /**
   * Paid without asking: the tap checked, with the open account's keys or the card's pass this phone
   * keeps (the card's wallet connecting).
   */
  private async payAutomatically(invoice: CardInvoice, payee: CardPayeeView): Promise<void> {
    this.automatic = true;
    this.releaseActivity ??= holdActivity();
    this.show({ phase: "paying", invoice, payee, card: this.paidCard(), automatic: true });
    let lease: CardWalletLease;
    try {
      lease = await this.cardLease();
    } catch (error) {
      logFailure("The card's wallet did not open for a payment", error);
      const failure = this.ports.unlockFailure(error);
      if (failure) this.fail("unlock", failure);
      else this.fail("failed");
      return;
    }
    await this.send(invoice, lease);
    // `send` changed the view (TypeScript still holds it at "paying").
    if (this.getView().phase === "sent") await this.refill(null);
  }

  private accountOpen(): boolean {
    const open = this.ports.account?.openWalletId();
    return open?.toLowerCase() === this.context.walletId.toLowerCase();
  }

  /** What only the app does (CardAccountPort): NoAccountError where it does not run. */
  private account(): CardAccountPort {
    const account = this.ports.account;
    if (!account) throw new NoAccountError();
    return account;
  }

  /**
   * Checks the tap against the wallet's active cards on the tap's relay, then records its counter.
   * Resolves with the verdict once the counter is kept on the device; the record is published to
   * the relays before the card's keys are wiped (`withAccess` ends with it).
   *
   * The cards' states and the holder's merchants are read again on the relays first (a card
   * suspended or deleted on the web app, its limits or merchants changed there), each relay awaited
   * CARD_FRESH_READ_MS at most: past it, the phone's copy decides, and the card's state or the
   * holder's merchants not read on a majority of them pays nothing without asking
   * (stateReadInTime, payeesReadInTime). Both reads end within the access, its keys still there.
   */
  private checkTap(
    withAccess: (run: (access: CardAccess) => Promise<void>) => Promise<void>
  ): Promise<TapVerdict> {
    const invoice = this.invoice!;
    return new Promise<TapVerdict>((resolve, reject) => {
      withAccess(async (access) => {
        let told: (read: CardStatesRefresh) => void = () => undefined;
        const read = new Promise<CardStatesRefresh>((done) => {
          told = done;
        });
        const account = this.account();
        const states = account
          .refreshStates(access, {
            timeoutMs: CARD_FRESH_READ_MS,
            onRead: (cards) => told(cards)
          })
          .catch((error: unknown) => {
            logFailure("Reading the cards before a payment failed", error);
            return null;
          });
        let toldPayees: (read: PayeesRefresh) => void = () => undefined;
        const payeesKept = new Promise<PayeesRefresh>((done) => {
          toldPayees = done;
        });
        const payees = account
          .refreshPayees(access, {
            timeoutMs: CARD_FRESH_READ_MS,
            onRead: (books) => toldPayees(books)
          })
          .catch((error: unknown) => {
            logFailure("Reading the merchants before a payment failed", error);
            return null;
          });
        // As soon as read and kept, or failed: what is published after does not wait.
        this.payeesRead = within(
          Promise.race([payeesKept, payees]),
          CARD_FRESH_READ_MS + CARD_FRESH_READ_SLACK_MS
        ).then((books) => {
          this.payeesReadInTime = books?.conclusive === true;
        });
        try {
          // As soon as read and kept, or failed: what is published again after does not wait.
          const fresh = within(
            Promise.race([read, states]),
            CARD_FRESH_READ_MS + CARD_FRESH_READ_SLACK_MS
          );
          await this.recordTap(access, invoice, fresh, resolve);
        } finally {
          await Promise.all([states, payees]);
        }
      }).catch(reject);
    });
  }

  /**
   * The tap identified among the active cards (`fresh` states, else the device's), its counter
   * kept on the device: `resolve` gets the verdict then; resolves once its record is published.
   */
  private async recordTap(
    access: CardAccess,
    invoice: CardInvoice,
    fresh: Promise<CardStatesRefresh | null>,
    resolve: (verdict: TapVerdict) => void
  ): Promise<void> {
    // Without it, the limits cannot be counted: nothing is paid (the counter is not recorded).
    const log = await this.payments();
    if (typeof log === "string") {
      resolve({ ok: false, failure: log });
      return;
    }
    const read = await fresh;
    this.stateReadInTime = read?.conclusive === true;
    const cards = (read?.states ?? (await this.account().statesOnDevice(access))).filter(
      (state) => state.status === "active" && state.relayHost === this.request.relay
    );
    const found = identifyCardTap(access.root, cards, this.request.p, this.request.c);
    if (!found.ok) {
      resolve({ ok: false, failure: found.reason === "replayed" ? "replayed" : "notYourCard" });
      return;
    }
    const { updatedAt: _updatedAt, ...state } = found.card;
    this.card = found.card;
    const breach = cardLimitBreach(found.card, invoice, log, Date.now(), this.entryId);
    // The card's wallet connects meanwhile, while its keys are there: asked again when it pays.
    if (!breach) {
      this.leaseIn(access).catch((error: unknown) => {
        logFailure("Opening the card's wallet failed", error);
      });
    }
    try {
      await this.account().recordState(
        access,
        {
          ...state,
          lastCounter: found.counter,
          depositedThrough: Math.max(state.depositedThrough, found.counter)
        },
        undefined,
        {
          // Never paid before the device keeps the counter: the tap is then good only once (the
          // same tap sent again meanwhile, under another session: TapAlreadySeenError).
          tap: true,
          onSaved: () => resolve(breach ? { ok: false, failure: breach } : { ok: true })
        }
      );
    } catch (error) {
      if (error instanceof TapAlreadySeenError) {
        resolve({ ok: false, failure: "replayed" });
        return;
      }
      logFailure("Recording a card's counter failed", error);
      // Not kept on the device (when this comes first): nothing is paid.
      resolve({
        ok: false,
        failure: error instanceof NewerRecordError ? "newerApp" : "failed"
      });
    }
  }

  /**
   * The account closed: the tap checked with the pass this phone keeps of a card on the tap's relay
   * (card-passes.ts, src/lib/card/card-pass.ts: with the card's K2 and the wallet's K1), its
   * counter kept on the device before anything is paid, and the card's wallet connecting meanwhile.
   * The cards' own copies are read again on the relays first (own-copies.ts: a pause, limits, a
   * mode or a merchant changed on the web app or another phone), each relay CARD_FRESH_READ_MS at
   * most. What they tell decides this payment only: the account's next sync brings it from its own
   * records. Null when no pass gives the tap (none kept for the relay, or another card's on it), or
   * when its copies did not come from a majority of the relays in time (a pause made on the web app
   * might be missing; a refusal its known state gives stands): the tap is checked after the
   * passkey, the holder asked.
   */
  private async checkTapWithPass(invoice: CardInvoice): Promise<TapVerdict | null> {
    const { walletId } = this.context;
    const { passes } = await this.ports.passes.load(walletId);
    const candidates = passes.filter((pass) => pass.relayHost === this.request.relay);
    for (const pass of passes) if (!candidates.includes(pass)) wipeCardPass(pass);
    if (candidates.length === 0) return null;
    try {
      const read = within(
        Promise.all(candidates.map((pass) => readOwnCopies(pass, CARD_FRESH_READ_MS))),
        CARD_FRESH_READ_MS + CARD_FRESH_READ_SLACK_MS
      );
      // What the decision on the payee waits for (cardPayees).
      this.payeesRead = read.then((copies) => {
        candidates.forEach((pass, index) => {
          const copy = copies?.[index];
          if (!copy) return;
          this.payeeCopies.set(
            `${pass.cardId}/${pass.walletGeneration}`,
            copy.newer ? "newer" : copy.payees
          );
        });
      });
      // Without it, the limits cannot be counted: nothing is paid (the counter is not recorded).
      const log = await this.payments();
      if (typeof log === "string") return { ok: false, failure: log };
      const copies = await read;
      const onDevice = await this.ports.states.onDeviceOf(walletId);
      let replayed = false;
      for (const [index, pass] of candidates.entries()) {
        const local = onDevice.find((state) => state.cardId === pass.cardId);
        if (!local || !isPassOf(pass, local)) continue;
        const read = copies?.[index];
        const copy = read?.state;
        // A pause, limits changed elsewhere: the card as its own copy tells it, for this payment.
        const state = copy ? mergeCardStates(local, copy) : local;
        if (
          state.status !== "active" ||
          state.relayHost !== this.request.relay ||
          !isPassOf(pass, state) ||
          state.keyVersion !== pass.keyVersion ||
          state.uid !== pass.uid
        ) {
          continue;
        }
        const tap = findPassTap(pass, state, this.request.p, this.request.c);
        if (!tap.ok) {
          replayed ||= tap.reason === "replayed";
          continue;
        }
        const breach = cardLimitBreach(state, invoice, log, Date.now(), this.entryId);
        // Not told by a majority of the relays: maybe paused on the web app meanwhile. Asked, its
        // counter not kept here: checked again after the passkey, with the account's records.
        if (!breach && read?.conclusive !== true) return null;
        this.card = state;
        this.pass = pass;
        this.stateReadInTime = read?.conclusive === true;
        // Its mode and merchants came with its state, in the same read (cardOwnFilter).
        this.payeesReadInTime = read?.conclusive === true;
        // The card's wallet connects meanwhile.
        if (!breach) {
          this.leaseWithPass().catch((error: unknown) => {
            logFailure("Opening the card's wallet failed", error);
          });
        }
        try {
          // Its counter only, on the phone's own copy: never the settings the relays told.
          const { updatedAt: _updatedAt, ...kept } = local;
          // Refused when the same tap, sent again under another session, was recorded meanwhile.
          await this.ports.states.recordOnDevice(
            walletId,
            {
              ...kept,
              lastCounter: tap.counter,
              depositedThrough: Math.max(kept.depositedThrough, tap.counter)
            },
            undefined,
            { tap: true }
          );
        } catch (error) {
          if (error instanceof TapAlreadySeenError) return { ok: false, failure: "replayed" };
          logFailure("Recording a card's counter failed", error);
          // Not kept on the device: nothing is paid.
          return { ok: false, failure: error instanceof NewerRecordError ? "newerApp" : "failed" };
        }
        return breach ? { ok: false, failure: breach } : { ok: true };
      }
      // A tap of this card already seen: never good again. Any other: after the passkey.
      return replayed ? { ok: false, failure: "replayed" } : null;
    } finally {
      for (const pass of candidates) if (pass !== this.pass) wipeCardPass(pass);
    }
  }

  /** The tapped card's wallet, leased with its pass once (checkTapWithPass), shared as leaseIn. */
  private leaseWithPass(): Promise<CardWalletLease> {
    const { card, pass } = this;
    if (!card || !pass || !isPassOf(pass, card)) {
      return Promise.reject(new Error("No pass of the tapped card"));
    }
    if (!this.lease) {
      const lease = this.ports.leaseWallet(pass, card);
      this.lease = lease;
      lease.catch(() => {
        if (this.lease === lease) this.lease = null;
      });
    }
    return this.lease;
  }

  /**
   * The tapped card's wallet (card-wallet.ts), leased with `access`'s keys once and shared with the
   * other users of that wallet; leased again when that failed.
   */
  private leaseIn(access: CardAccess): Promise<CardWalletLease> {
    const card = this.card;
    if (!card) return Promise.reject(new Error("The card is not identified"));
    if (!this.lease) {
      const lease = this.ports.leaseWallet(access, card);
      this.lease = lease;
      lease.catch(() => {
        if (this.lease === lease) this.lease = null;
      });
    }
    return this.lease;
  }

  /**
   * The tapped card's wallet, leased if not yet with the open account's keys, else with the pass
   * this phone keeps of the card.
   */
  private cardLease(): Promise<CardWalletLease> {
    if (this.lease) return this.lease;
    return this.accountOpen()
      ? this.account().withCardAccess((access) => this.leaseIn(access))
      : this.leaseWithPass();
  }

  /**
   * "Pay": the passkey, the tap checked if not yet, then the payment. Confirmed in time with
   * `approve` ("Approve this merchant", offered when the view is `approvable`), an identified
   * merchant is approved from then on ("Approved merchants"), once the payment left
   * (approveChosenPayee); never without it.
   */
  pay({ approve = false }: { approve?: boolean } = {}): Promise<void> {
    if (this.view.phase === "ready") this.approveChosen = approve && this.view.approvable;
    return this.counted(() => this.payConfirmed());
  }

  private async payConfirmed(): Promise<void> {
    const asked = this.view;
    if (asked.phase !== "ready" || !this.invoice || !this.decision) return;
    // Without the app's account and passkey (CardAccountPort), nothing confirms a payment.
    const account = this.ports.account;
    if (!account) {
      this.fail("failed");
      return;
    }
    const invoice = this.invoice;
    const { payee } = asked;
    if (!this.waiting()) {
      this.fail("ended");
      return;
    }
    this.releaseActivity ??= holdActivity();
    this.show({ phase: "confirming", invoice, payee, card: this.paidCard() });
    // The app locked: the passkey's seed, for this payment and its refill only.
    let seed: WalletSeed | null = null;
    let lease: CardWalletLease;
    try {
      if (this.checkedWith !== null && this.accountOpen()) {
        // The card's wallet pays, not the account's: the passkey confirms the payment only.
        await account.confirmPasskey({ accountWallet: false });
        if (!this.confirmedInTime()) return;
        this.show({ phase: "paying", invoice, payee, card: this.paidCard(), automatic: false });
        lease = await this.cardLease();
      } else {
        // Past the 30 days of the check of the 12 words, no payment: refused before the prompt.
        await account.refuseOverduePayment(this.context.walletId);
        // The passkey this device saved for the card's account only (device-passkey.ts), else any:
        // unlockFor checks its seed is that account's all the same.
        ({ seed } = await account.signIn(this.context.walletId));
        if (!this.confirmedInTime()) return;
        this.show({ phase: "paying", invoice, payee, card: this.paidCard(), automatic: false });
        const verdict = await this.unlockFor(seed);
        if (!verdict.ok) {
          this.fail(verdict.failure);
          return;
        }
        const unlocked = seed;
        lease = await account.withCardAccessOf(unlocked, this.context.walletId, (access) =>
          this.leaseIn(access)
        );
      }
    } catch (error) {
      const failure = this.ports.unlockFailure(error);
      if (failure === null && this.view.phase === "confirming") {
        // The prompt dismissed: the holder is asked again, while the point of sale waits.
        this.endActivity();
        if (this.waiting()) this.show(asked);
        else this.fail("ended");
        return;
      }
      logFailure("The card payment's passkey failed", error);
      if (failure) this.fail("unlock", failure);
      else this.fail("failed");
      return;
    }
    if (!this.waiting()) {
      this.fail("ended");
      return;
    }
    await this.send(invoice, lease);
    // `send` changed the view (TypeScript still holds it at "ready").
    if (this.getView().phase === "sent") await this.refill(seed);
  }

  /**
   * After the passkey: whether the holder confirmed in time (the point of sale was not answered
   * meanwhile); the payment then goes on as confirmed. Otherwise it only ends.
   */
  private confirmedInTime(): boolean {
    if (this.view.phase !== "confirming" || !this.waiting()) {
      this.fail("ended");
      return false;
    }
    return true;
  }

  /**
   * "Approve this merchant", as the holder chose and as decided for the tapped card
   * (decideForTappedCard): the merchant is approved with the payment, so only once it left. A
   * payment refused before it leaves (the card's wallet short, its limits, the invoice) approves
   * nobody, and its panel says nothing was paid: the holder is asked again the next time.
   */
  private async approveChosenPayee(): Promise<void> {
    const identified: IdentifiedPayee | null =
      this.check?.status === "identified" ? this.check.payee : null;
    if (!this.approveChosen || !this.decision?.approveOnConfirm || !identified || !this.card) {
      return;
    }
    this.approved = await this.account()
      .approvePayee(this.context.walletId, this.card, identified, Date.now())
      .then(
        () => true,
        (error: unknown) => {
          // Asked again at its next payment.
          logFailure("Approving a merchant failed", error);
          return false;
        }
      );
  }

  /**
   * After the payment: the card's next taps' hashes deposited again when few are left on its relay
   * (relay-sync.ts), then the payment and the merchant it approved published on the account's
   * relays, for the web app and the account's other phones (history-sync.ts, payees-sync.ts), the
   * card's pass then kept or forgotten as the merchants now say (card-passes.ts); with the
   * account's keys, the seed the passkey gave (dropped after it), or the card's pass this phone
   * keeps (refillWithPass).
   */
  private async refill(seed: WalletSeed | null): Promise<void> {
    const cardId = this.card?.cardId;
    if (!cardId) return;
    const approved = this.approved;
    const run = async (access: CardAccess) => {
      const account = this.account();
      try {
        const state = (await account.statesOnDevice(access)).find(
          (card) => card.cardId === cardId && card.status === "active"
        );
        if (state) await account.refillChannel(access, state);
      } catch (error) {
        // The next app start deposits them.
        logFailure("Refilling a card's hashes failed", error);
      }
      // Each published at the next sync otherwise.
      await account.publishHistory(access).catch((error: unknown) => {
        logFailure("Publishing a card payment failed", error);
      });
      if (approved) {
        await account.refreshPayees(access).catch((error: unknown) => {
          logFailure("Publishing an approved merchant failed", error);
        });
        // A first merchant approved: the card's pass kept from now on, where it may be
        // (card-passes.ts).
        await account.syncPasses(access);
      }
    };
    try {
      if (seed) await this.account().withCardAccessOf(seed, this.context.walletId, run);
      else if (this.accountOpen()) await this.account().withCardAccess(run);
      else await this.refillWithPass(cardId);
    } catch (error) {
      // The account closed meanwhile, no pass of the card: the next app start does it all.
      logFailure("After a card payment", error);
    }
  }

  /**
   * After a payment with the app closed: the card's next taps' hashes deposited again with its pass
   * when few are left, the last one deposited kept on the device. The payment and its record wait
   * for the account's next sync (history-sync.ts, states.ts): the pass gives no key of the account.
   */
  private async refillWithPass(cardId: string): Promise<void> {
    const pass = this.pass;
    if (!pass || pass.cardId !== cardId) return;
    try {
      const state = (await this.ports.states.onDeviceOf(this.context.walletId)).find(
        (card) => card.cardId === cardId && card.status === "active"
      );
      if (state && isPassOf(pass, state)) {
        await this.ports.refillWithPass(this.context.walletId, pass, state);
      }
    } catch (error) {
      // The next app start deposits them.
      logFailure("Refilling a card's hashes failed", error);
    }
  }

  /**
   * The app locked: the passkey's seed must be this device's account's (its point of sale's, or a
   * card holder's device's); it gives the card's keys and checks the tap (the card's wallet is then
   * leased with them, pay()).
   */
  private async unlockFor(seed: WalletSeed): Promise<TapVerdict> {
    const walletId = this.context.walletId;
    const account = this.account();
    await account.checkSeed(seed, walletId);
    if (this.checkedWith === null) {
      const verdict = await this.checkTap((run) => account.withCardAccessOf(seed, walletId, run));
      if (!verdict.ok) return verdict;
      this.checkedWith = "passkey";
      await this.decideForTappedCard();
    }
    // Answered meanwhile (too late): no wallet to connect.
    if (this.answered()) return { ok: false, failure: "failed" };
    return { ok: true };
  }

  /** The payee, as decided (the views from "ready" on). */
  private payeeView(): CardPayeeView {
    const decision = this.decision;
    if (!decision) throw new Error("The card payment's payee is not checked");
    return decision.payee;
  }

  private async send(invoice: CardInvoice, lease: CardWalletLease): Promise<void> {
    if (!this.waiting()) {
      this.fail("ended");
      return;
    }
    const payee = this.payeeView();
    this.show({
      phase: "paying",
      invoice,
      payee,
      card: this.paidCard(),
      automatic: this.automatic
    });
    let quote: SendQuote;
    try {
      const destination = await lease.wallet.parseSendInput(invoice.pr);
      // The wallet reads the invoice as it was shown, or nothing is paid.
      if (destination.kind !== "bolt11" || destination.amountSats !== invoice.amountSats) {
        this.fail("invalidInvoice");
        return;
      }
      quote = await lease.wallet.prepareSend(destination, null);
    } catch (error) {
      logFailure("The card payment could not be prepared", error);
      if (error instanceof SendError) {
        this.fail(
          error.code === "expired"
            ? "expired"
            : error.code === "otherNetwork"
              ? "otherNetwork"
              : "invalidInvoice"
        );
      } else {
        // No route, too little in the wallet, the wallet's service down: nothing left.
        this.fail("sendFailed");
      }
      return;
    }
    if (!this.waiting()) {
      this.fail("ended");
      return;
    }
    // The card's wallet must hold the payment and its fee: otherwise nothing leaves, and the holder
    // is told to recharge the card. Unknown (not synced in time, not read), the wallet decides.
    const fee = quote.fees.onchain ? 0n : quote.fees.feeSats;
    const balance = await this.balanceOf(lease);
    if (balance !== null && balance < quote.amountSats + fee) {
      this.fail("insufficientBalance");
      return;
    }
    if (!this.waiting()) {
      this.fail("ended");
      return;
    }
    // Checked again just before it leaves, with the log as it is now (another card payment may
    // have left meanwhile), then logged as being sent: an interruption counts it as spent. A
    // payment the log cannot count is not sent. In turn with the other payments (paid without
    // asking, two may run at once): never both within what the limits leave.
    const card = this.card;
    const refusal = await inLimitsTurn(async (): Promise<CardPaymentFailure | null> => {
      const log = await this.payments();
      if (typeof log === "string") return log;
      if (!card) return "failed";
      const breach = cardLimitBreach(card, invoice, log, Date.now(), this.entryId);
      if (breach) return breach;
      return (await this.log("sending", null)) ? null : "failed";
    });
    if (refusal) {
      this.fail(refusal);
      return;
    }
    if (!this.waiting()) {
      this.fail("ended");
      return;
    }
    // From now on, the payment's outcome is the answer, whatever the time.
    this.sending = true;
    this.paidWith = lease;
    let sentId: string;
    let status: WalletPayment["status"];
    try {
      ({ id: sentId, status } = await lease.wallet.sendPrepared(quote, {
        speed: "medium",
        idempotencyKey: randomUuid(),
        untilSent: true
      }));
    } catch (error) {
      logFailure("The card payment failed", error);
      // The SDK's answer was lost: the payment may have left all the same.
      this.fail("uncertain");
      return;
    }
    // Left: the point of sale is told, then the payment followed while it is pending.
    if (status === "failed") {
      this.fail("sendFailed");
      return;
    }
    void this.log("sent", null);
    this.relay?.answer({ ok: true });
    this.stopDeadline();
    await this.approveChosenPayee();
    this.endActivity();
    this.show({
      phase: "sent",
      invoice,
      payee,
      card: this.paidCard(),
      automatic: this.automatic,
      approved: this.approved,
      status,
      following: status === "pending"
    });
    this.options.onPaid?.({ amountSats: invoice.amountSats, payee, status });
    if (status === "pending") this.follow(sentId, Date.now() + FOLLOW_FOR_MS);
    else void this.readPreimage(sentId).finally(() => void this.disconnect());
  }

  /** The payment's preimage, kept in the log as the proof it was paid, once the wallet has it. */
  private keepPreimage(payment: WalletPayment | null): void {
    const preimage = payment?.preimage;
    const invoice = this.invoice;
    if (!preimage || !invoice || this.preimage !== null) return;
    if (bytesToHex(sha256(hexToBytes(preimage))) !== invoice.paymentHash) return;
    this.preimage = preimage;
    void this.log("sent", null);
  }

  /** Paid at once: its preimage read once (the wallet keeps it anyway, under its hash). */
  private async readPreimage(id: string): Promise<void> {
    try {
      if (this.paidWith) this.keepPreimage(await this.paidWith.wallet.getPayment(id));
    } catch (error) {
      logFailure("Reading a card payment's preimage failed", error);
    }
  }

  private follow(id: string, until: number): void {
    this.followTimer = setTimeout(() => {
      this.followTimer = null;
      const wallet = this.paidWith?.wallet;
      if (this.closed) return;
      if (!wallet) {
        this.stopFollowing();
        return;
      }
      wallet.getPayment(id).then(
        (payment) => {
          if (this.closed || this.view.phase !== "sent") return;
          const status = payment?.status ?? "pending";
          if (status === "completed") this.keepPreimage(payment);
          if (status !== "pending") {
            this.show({ ...this.view, status, following: false });
            void this.disconnect();
          } else if (Date.now() < until) {
            this.follow(id, until);
          } else {
            this.stopFollowing();
          }
        },
        (error: unknown) => {
          if (this.closed) return;
          if (Date.now() < until) {
            this.follow(id, until);
          } else {
            // Once, as it gives up: each read failing in between is retried.
            logFailure("Following a card payment failed", error);
            this.stopFollowing();
          }
        }
      );
    }, FOLLOW_INTERVAL_MS);
  }

  /** No longer followed, still pending: the panel says it left (its state is in the list). */
  private stopFollowing(): void {
    if (this.view.phase === "sent" && this.view.following) {
      this.show({ ...this.view, following: false });
    }
    void this.disconnect();
  }

  /** "Decline": the point of sale is told at once. */
  decline(): void {
    if (this.view.phase !== "ready" || !this.invoice) return;
    void this.log("declined", "declined");
    this.relay?.answer({ ok: false, reason: declineMessage("refused", this.ports.t) });
    this.stopDeadline();
    this.show({
      phase: "declined",
      invoice: this.invoice,
      payee: this.view.payee,
      card: this.view.card
    });
    void this.disconnect();
  }

  /**
   * Hands the session over to the app its holder opens (RelaySession.handOver: a relay that
   * announces it), before anything is answered or leaves: waiting for the invoice, checking, or
   * asking. Nothing is logged: the app takes the tap as its own. False when it could not be (the
   * session ended, answered, paying): nothing changes then.
   */
  handOver(): boolean {
    const phase = this.view.phase;
    if (this.closed || (phase !== "waiting" && phase !== "checking" && phase !== "ready")) {
      return false;
    }
    if (!this.relay) return false;
    // The socket closes now: its end is the hand-over, not the point of sale gone (relayEnded).
    this.handingOver = true;
    if (!this.relay.handOver()) {
      this.handingOver = false;
      return false;
    }
    this.stopDeadline();
    this.show({ phase: "handedOver", invoice: this.invoice });
    this.endActivity();
    void this.disconnect();
    return true;
  }

  /** A newer tap replaces this one: its point of sale is told, nothing shows any more. */
  supersede(): void {
    if (this.isBusy()) return;
    this.relay?.answer({ ok: false, reason: declineMessage("superseded", this.ports.t) });
    this.close();
  }

  /** The panel closed: the session ends (declined if unanswered), the wallet disconnects. */
  close(): void {
    if (this.closed) return;
    if (this.view.phase === "checking" || this.view.phase === "ready") {
      this.relay?.answer({ ok: false, reason: declineMessage("closed", this.ports.t) });
    }
    this.closed = true;
    this.stopDeadline();
    if (this.followTimer) clearTimeout(this.followTimer);
    this.followTimer = null;
    this.relay?.close();
    this.endActivity();
    void this.disconnect();
    this.listeners.clear();
    this.settleIfDone();
  }

  /** The relay still waits for the answer, within the time to answer (answerDue). */
  private waiting(): boolean {
    // As the deadline's timer would have: once that time ran out, nothing more is paid.
    if (this.deadlineTimer !== null && !this.sending && this.answerDue()) {
      this.stopDeadline();
      this.deadlinePassed();
    }
    return !this.over && !this.closed && (this.relay?.isWaiting() ?? false);
  }

  /**
   * Whether the time to answer (`answerMs`) ran out, read on two clocks, the longer counting (as
   * src/lib/activity.ts). The deadline's timer alone does not tell: a phone asleep (Android's doze,
   * an app frozen) may not count that time, and once it wakes, the payment's next step may run
   * before the late timer or the relay's closed socket: it would pay after the point of sale gave
   * up, its customer asked to pay again.
   */
  private answerDue(): boolean {
    if (this.answerMs === null) return false;
    const elapsed = Math.max(
      Date.now() - this.invoiceAt,
      performance.now() - this.invoiceAtMonotonic
    );
    return elapsed >= this.answerMs;
  }

  private relayEnded(): void {
    this.over = true;
    if (this.handingOver) return;
    if (this.view.phase === "checking" || this.view.phase === "ready") this.fail("ended");
  }

  /**
   * The answer's time after the invoice (cardAnswerMs, or the invoice's expiry when sooner): unless
   * the payment is leaving, the point of sale is answered now. The invoice expired: so. Not
   * confirmed (asked, or in the passkey's prompt): refused with the reason the holder was asked
   * for. Anything else (checking, or paying but not leaving yet): too late. Whatever still runs
   * only ends (fail, answered()).
   */
  private deadlinePassed(): void {
    this.deadlineTimer = null;
    if (this.sending) return;
    this.over = true;
    const view = this.view;
    if (this.expiresFirst && view.phase !== "waiting") {
      this.fail("expired");
    } else if (view.phase === "ready" || view.phase === "confirming") {
      this.fail(this.decision?.cause ?? "unconfirmed");
    } else if (view.phase === "checking" || view.phase === "paying") {
      this.fail("late");
    }
  }

  private stopDeadline(): void {
    if (this.deadlineTimer) clearTimeout(this.deadlineTimer);
    this.deadlineTimer = null;
  }

  private endActivity(): void {
    this.releaseActivity?.();
    this.releaseActivity = null;
  }

  /**
   * Done with the card's wallet: its lease released (once), the wallet disconnected when no other
   * user holds it (card-wallet.ts), its keys gone then.
   */
  private async disconnect(): Promise<void> {
    if (this.followTimer !== null || this.isBusy()) return;
    const lease = this.lease;
    this.lease = null;
    this.paidWith = null;
    this.releasing += 1;
    try {
      // A lease that never came (the wallet did not connect) holds nothing.
      const held = await lease?.catch(() => null);
      await held?.release();
    } finally {
      this.releasing -= 1;
      this.settleIfDone();
    }
  }

  /**
   * Whether the tapped card's wallet, leased as its tap was checked, is proven to hold less than
   * the invoice's amount, before its holder is asked: its balance read once a sync of its reached
   * the network (Wallet.waitNetworkSync). The end of its first sync proves no read of the network
   * (Wallet.getBalance): its storage may miss a recharge made elsewhere, which would refuse a card
   * that can pay. Short of the amount alone, its fee unknown before the payment is prepared: never
   * an amount it could hold. False when nothing proves it (no sync of the network, the wallet
   * disconnected once the payment ended, a read that failed). Null without a wallet leased: the tap
   * not checked yet (the app locked, its keys come with the passkey), or its wallet did not connect.
   */
  private provenShort(invoice: CardInvoice): Promise<boolean> | null {
    const lease = this.lease;
    if (!lease) return null;
    return (async () => {
      let wallet: CardWalletLease["wallet"];
      try {
        ({ wallet } = await lease);
      } catch {
        // Logged where it was leased (leaseIn, leaseWithPass).
        return false;
      }
      try {
        await wallet.waitNetworkSync();
        return (await wallet.getBalance(false)) < invoice.amountSats;
      } catch (error) {
        // The payment ended meanwhile, its wallet with it: nothing to tell.
        if (!(error instanceof WalletError && error.code === "notConnected")) {
          logFailure("Reading a card's balance before asking failed", error);
        }
        return false;
      }
    })();
  }

  /**
   * The card's wallet's balance once its first sync has ended (Wallet.getBalance), within
   * CARD_BALANCE_READ_MS (it connected as the tap was checked), else as its storage holds it; null
   * when it cannot be read.
   */
  private async balanceOf(lease: CardWalletLease): Promise<bigint | null> {
    try {
      return (
        (await within(lease.wallet.getBalance(true), CARD_BALANCE_READ_MS)) ??
        (await lease.wallet.getBalance(false))
      );
    } catch (error) {
      logFailure("Reading a card's balance failed", error);
      return null;
    }
  }
}
