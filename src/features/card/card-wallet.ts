import { CARD_INVOICE_EXPIRY_SECS } from "@/config/card";
import { getAccountWalletId } from "@/features/account/session";
import {
  confirmAccountPasskey,
  isAccountWalletOpen,
  openAccountWallet
} from "@/features/account/wallet-access";
import { releaseWallet } from "@/features/terminal/activate";
import type { SendSource } from "@/features/wallet/send/useSend";
import { WalletError } from "@/lib/breez/errors";
import { mnemonicSeed } from "@/lib/breez/seed";
import type {
  PendingDeposit,
  SentPayment,
  TransferQuote,
  Wallet,
  WalletPayment
} from "@/lib/breez/types";
import {
  cardWallet,
  getWalletBalance,
  getWalletConnectionId,
  getWalletSparkAddress,
  prepareWalletTransfer,
  sendWalletTransfer,
  syncWallet
} from "@/lib/breez/wallet";
import { isPassOf, type CardPass } from "@/lib/card/card-pass";
import { cardWalletPhrase, walletPhraseOf, type CardWalletOf } from "@/lib/card/keys";
import { decodeBolt11 } from "@/lib/lightning/bolt11";
import { logFailure } from "@/lib/log/log";
import { randomUuid } from "@/lib/random";
import { within } from "@/lib/within";

import type { CardAccess } from "./states";

/*
 * The wallet each card pays from: a separate wallet for each card, never the account's. Its words
 * derive from the card root and the card's id
 * (src/lib/card/keys.ts, cardWalletPhrase): the passkey gives it back on any device, the web app's
 * included. Its SDK instance and storage are its own (src/lib/breez/wallet.ts, cardWallet).
 *
 * Connected only while something needs it (a card's panel in "Cards", a card payment) and
 * shared by them: the last one done disconnects it, its SDK object, which holds its keys, destroyed
 * (connection.ts). The account closing disconnects them all (lockTerminal).
 *
 * Its sats come from the account's wallet ("From my main balance": a Spark transfer, with the
 * passkey, as any payment leaving it) or from anyone (its Lightning address, a Lightning invoice,
 * an on-chain address, no amount limited). They go back with "Withdraw to my main balance" (on each
 * card, with the passkey, on the web too). A Spark transfer is free (spark-sdk 0.28.4); the wallet
 * layer checks the identity
 * of the wallet it goes to before anything leaves.
 */

/**
 * Which wallet a card pays from: its id and its wallet's generation (card-record.ts), as its state
 * tells them. A card deleted then added again pays from a new one.
 */
export type { CardWalletOf };

/** A card's wallet, connected, for one use: `release()` once done (each lease once). */
export type CardWalletLease = {
  cardId: string;
  /** Its generation (CardWalletOf). */
  generation: number;
  wallet: Wallet;
  /** Its id: its Spark identity public key, lowercase. */
  walletId: string;
  release(): Promise<void>;
};

type Entry = {
  /** The leases not released yet. */
  users: number;
  /** Its connection in progress, null otherwise. */
  connecting: Promise<void> | null;
  /** Its disconnection by its last user, until it is done. */
  closing: Promise<void> | null;
};

/** By card's wallet: `<card id>/<generation>`. */
const entries = new Map<string, Entry>();

/**
 * The wallet `card` pays from, connected with the words `source` gives (the open account's card
 * keys, or that card's pass: a payment with the app closed, card-passes.ts), shared with its other
 * users. `source` is read at once (the lease outlives it: the access's keys are wiped when it ends,
 * the pass once its payment is done). Rejects, holding nothing, when the wallet does not connect,
 * or for a pass of another card's wallet.
 */
export async function leaseCardWallet(
  source: CardAccess | CardPass,
  card: CardWalletOf
): Promise<CardWalletLease> {
  if ("ownSecret" in source && !isPassOf(source, card)) {
    throw new Error("The pass of another card's wallet");
  }
  const { cardId, walletGeneration: generation } = card;
  const wallet = cardWallet(cardId, generation);
  const key = `${cardId}/${generation}`;
  let entry = entries.get(key);
  if (!entry) {
    entry = { users: 0, connecting: null, closing: null };
    entries.set(key, entry);
  }
  const held = entry;
  held.users += 1;
  // Not connected (never yet, released, or disconnected with the account) nor connecting: now.
  if (held.connecting === null && !wallet.isConnected()) {
    // Its words now: the root goes once the access ends, the pass once its payment is done. A
    // JavaScript string cannot be wiped: this one goes with the SDK's builder, as the account's
    // seed goes with its account.
    const seed = mnemonicSeed(
      "ownSecret" in source
        ? walletPhraseOf(source.walletEntropy)
        : cardWalletPhrase(source.root, cardId, generation)
    );
    const closing = held.closing;
    const connecting = (async () => {
      // Its last user's disconnection first: one SDK instance per storage (connection.ts).
      if (closing) await closing;
      await wallet.connect(seed);
    })();
    held.connecting = connecting;
    void connecting
      .catch(() => undefined)
      .finally(() => {
        if (held.connecting === connecting) held.connecting = null;
      });
  }
  let released = false;
  const release = async (): Promise<void> => {
    if (released) return;
    released = true;
    held.users -= 1;
    if (held.users > 0) return;
    const closing = wallet.disconnect().catch((error: unknown) => {
      // Destroyed anyway (connection.ts).
      logFailure("Disconnecting a card's wallet failed", error);
    });
    held.closing = closing;
    await closing;
    if (held.closing === closing) held.closing = null;
  };
  try {
    if (held.connecting) await held.connecting;
    if (!wallet.isConnected()) {
      throw new WalletError("notConnected", "The card's wallet was disconnected");
    }
    return { cardId, generation, wallet, walletId: (await wallet.getId()).toLowerCase(), release };
  } catch (error) {
    await release();
    throw error;
  }
}

/** What a card's panel shows of its wallet. */
export type CardWalletView = {
  /** Its balance once the SDK's first sync has ended (Wallet.getBalance's `ensureSynced`). */
  balanceSats: bigint;
  /** Its on-chain deposits not credited yet (an on-chain recharge). */
  pending: PendingDeposit[];
};

/**
 * The balance of a card's wallet, once synced, and its deposits not credited yet. `balanceRead`:
 * called once its balance is read, before its deposits (reads ordered as their balances came).
 */
export async function readCardWallet(
  lease: CardWalletLease,
  balanceRead?: () => void
): Promise<CardWalletView> {
  const balanceSats = await lease.wallet.getBalance(true);
  balanceRead?.();
  const pending = await lease.wallet.listPendingDeposits();
  return { balanceSats, pending };
}

/** Payments read per page of a card's wallet's history (its local storage). */
const PAYMENTS_PAGE_SIZE = 200;

/**
 * Every payment of a card's wallet, newest first, as its storage holds them (synced once connected:
 * readCardWallet): "History" tells its movements and its payments' fees from them.
 */
export async function listCardWalletPayments(lease: CardWalletLease): Promise<WalletPayment[]> {
  const payments: WalletPayment[] = [];
  for (let offset = 0; ; offset += PAYMENTS_PAGE_SIZE) {
    const page = await lease.wallet.listPaymentsPage({ offset, limit: PAYMENTS_PAGE_SIZE });
    for (const payment of page.payments) payments.push(payment);
    if (page.listed < PAYMENTS_PAGE_SIZE) break;
  }
  return payments;
}

/** What a card's wallet holds or waits for, once synced (readCardWalletContents). */
export type CardWalletContents = {
  balanceSats: bigint;
  /** Its payments not final yet: a card payment, a transfer, a payment it receives. */
  pendingPayments: number;
  /** Its on-chain deposits not claimed yet. */
  unclaimedDeposits: number;
  /**
   * Its funds out of its balance, on their way back to it (src/features/wallet/funds-recovery.ts):
   * the operators' watchtower defended them on-chain, or a leaf's exit started there.
   */
  recoveringSats: bigint;
};

/**
 * What the card's wallet holds or waits for, once a sync of its reached the network
 * (Wallet.waitNetworkSync) within `syncMs`: WalletError "requestFailed" past it. What takes a
 * card's wallet out of the app's sight needs it empty (a card reset, which "Cards" no longer shows;
 * an account deleted): nothing would show its sats again. Before such a sync the SDK answers from
 * this device's copy, which may miss them, and the end of its first sync proves no read of the
 * network (Wallet.getBalance): no deletion on it.
 */
export async function readCardWalletContents(
  lease: CardWalletLease,
  syncMs: number
): Promise<CardWalletContents> {
  // Bounded: the read ends then and its caller lets the lease go (the wait itself ends with the
  // connection).
  if ((await within(lease.wallet.waitNetworkSync(), syncMs)) === null) {
    throw new WalletError("requestFailed", "The card's wallet did not sync with the network");
  }
  const balanceSats = await lease.wallet.getBalance(false);
  let pendingPayments = 0;
  for (let offset = 0; ; offset += PAYMENTS_PAGE_SIZE) {
    const page = await lease.wallet.listPaymentsPage({ offset, limit: PAYMENTS_PAGE_SIZE });
    pendingPayments += page.payments.filter((payment) => payment.status === "pending").length;
    if (page.listed < PAYMENTS_PAGE_SIZE) break;
  }
  const unclaimedDeposits = await lease.wallet.countUnclaimedDeposits();
  // As of the sync above.
  const recoveringSats = await lease.wallet.getRecoverableFunds(false);
  return { balanceSats, pendingPayments, unclaimedDeposits, recoveringSats };
}

/** No sats, no payment pending, no deposit to claim, no funds on their way back. */
export function isEmptyCardWallet(contents: CardWalletContents): boolean {
  return (
    contents.balanceSats === 0n &&
    contents.pendingPayments === 0 &&
    contents.unclaimedDeposits === 0 &&
    contents.recoveringSats === 0n
  );
}

/**
 * A transfer between the account's wallet and a card's, prepared: what it moves (exactly what the
 * destination receives) and its fee (the source's, on top). `send()` asks the passkey, then sends
 * it once (one idempotency key per transfer: a retry never moves it twice); `cancel()` gives it up.
 * Either way the account's wallet disconnects again if the transfer connected it.
 */
export type CardTransfer = {
  quote: TransferQuote;
  /**
   * The card's wallet's balance once synced, read as the transfer was prepared: what "Card balance
   * after" is told from.
   */
  cardBalanceSats: bigint;
  send(): Promise<SentPayment>;
  cancel(): Promise<void>;
};

/** The account's wallet holds less than a top-up and its fee ("From my main balance"). */
export class InsufficientMainBalanceError extends Error {
  constructor(readonly balanceSats: bigint) {
    super("The account's wallet holds too little for this recharge");
    this.name = "InsufficientMainBalanceError";
  }
}

/** A card's wallet holds nothing to send back ("Withdraw to my main balance"). */
export class NothingToReturnError extends Error {
  constructor() {
    super("The card's wallet holds nothing");
    this.name = "NothingToReturnError";
  }
}

/** A card's wallet holds less than an amount to send back and its fee, once synced. */
export class InsufficientCardBalanceError extends Error {
  constructor(readonly balanceSats: bigint) {
    super("The card's wallet holds too little for this amount");
    this.name = "InsufficientCardBalanceError";
  }
}

/** The operations holding the account's wallet now. */
let holders = 0;
/**
 * The connection the holders made (the account's wallet was not open for a screen then), which the
 * last of them closes: never a screen's (useAccountWallet), and always theirs, even when the
 * screen's connection they found open closed under them ("Wallet" left) and a later holder
 * connected it again.
 */
let heldConnection: number | null = null;

/**
 * The account's wallet, connected for a transfer or a read if no screen had it (openAccountWallet,
 * without the passkey): `done()` disconnects it again then, once the last of the operations holding
 * it is done (a late read of the main balance never disconnects it under a top-up). "Cards" holds
 * it while it shows a card to top up, and "Top up" while it shows the main balance's
 * path: its read on opening, again, or a transfer then needs no connection anew (on a slow network,
 * each would otherwise outlast its wait).
 */
export async function holdAccountWallet(): Promise<() => Promise<void>> {
  holders += 1;
  let done = false;
  const release = async () => {
    if (done) return;
    done = true;
    holders -= 1;
    if (holders > 0) return;
    const opened = heldConnection;
    heldConnection = null;
    // Closed since (till mode, another screen): nothing of the holders' to disconnect.
    if (opened === null || getWalletConnectionId() !== opened) return;
    await releaseWallet();
  };
  const wasOpen = isAccountWalletOpen();
  try {
    await openAccountWallet();
  } catch (error) {
    await release();
    throw error;
  }
  if (!wasOpen) heldConnection = getWalletConnectionId();
  return release;
}

/** How long "Top up" waits for the main balance, once synced, before showing its other means. */
export const MAIN_BALANCE_READ_MS = 8_000;

/**
 * The account's wallet's balance once synced, by MAIN_BALANCE_READ_MS (null past it): "Top up"
 * opens on its keypad when it holds sats, else on the means of any other wallet. Read past that
 * wait all the same, its balance goes to `onLate`. The wallet is
 * connected for it if nothing held it, then disconnected again once the read ends, even late.
 * Rejects when it could not be read.
 */
export function readMainBalance(onLate?: (balanceSats: bigint) => void): Promise<bigint | null> {
  const read = (async () => {
    const done = await holdAccountWallet();
    try {
      return await getWalletBalance(true);
    } finally {
      await done();
    }
  })();
  return within(read, MAIN_BALANCE_READ_MS).then((balance) => {
    if (balance === null && onLate) {
      read.then(onLate, () => undefined);
    }
    return balance;
  });
}

/**
 * "From my main balance": `amountSats` from the account's wallet to the card's, by a
 * Spark transfer to the card's wallet's own address (its identity checked by the wallet layer).
 * InsufficientMainBalanceError when the account's wallet, once synced, holds less than that and the
 * fee: never offered, rather than failing once confirmed.
 */
export async function prepareRecharge(
  lease: CardWalletLease,
  amountSats: bigint
): Promise<CardTransfer> {
  const done = await holdAccountWallet();
  try {
    const quote = await prepareWalletTransfer(
      await lease.wallet.getSparkAddress(),
      lease.walletId,
      amountSats
    );
    const available = await getWalletBalance(true);
    if (available < quote.amountSats + quote.feeSats) {
      throw new InsufficientMainBalanceError(available);
    }
    const cardBalanceSats = await lease.wallet.getBalance(true);
    const key = randomUuid();
    return {
      quote,
      cardBalanceSats,
      async send() {
        // A payment leaving the account's wallet: the passkey first.
        await confirmAccountPasskey();
        const sent = await sendWalletTransfer(quote, key);
        // The card's wallet claims it at its next sync: now, for its balance to show it.
        await lease.wallet.sync().catch((error: unknown) => {
          logFailure("Syncing a card's wallet failed", error);
        });
        await done();
        return sent;
      },
      cancel: done
    };
  } catch (error) {
    await done();
    throw error;
  }
}

/**
 * "Withdraw to my main balance" (an amount, or "Empty the card"): `amountSats` of the card's
 * wallet, or everything it holds once synced
 * (`undefined`), to the account's wallet, by a Spark transfer to its own address (its id, the open
 * account's, checked). A fee, if the SDK ever quotes one, comes out of what is sent when it all
 * goes, on top of an amount: never more than the card holds. NothingToReturnError when it holds
 * nothing; InsufficientCardBalanceError when it holds less than the amount and its fee.
 */
export async function prepareReturn(
  lease: CardWalletLease,
  amountSats?: bigint
): Promise<CardTransfer> {
  const accountWalletId = getAccountWalletId();
  if (!accountWalletId) throw new WalletError("notConnected", "No account is open");
  if (amountSats !== undefined && amountSats <= 0n) {
    throw new WalletError("requestFailed", "A transfer of nothing");
  }
  const done = await holdAccountWallet();
  try {
    const balance = await lease.wallet.getBalance(true);
    if (balance <= 0n) throw new NothingToReturnError();
    if (amountSats !== undefined && amountSats > balance) {
      throw new InsufficientCardBalanceError(balance);
    }
    const address = await getWalletSparkAddress();
    let quote = await lease.wallet.prepareTransfer(address, accountWalletId, amountSats ?? balance);
    if (amountSats !== undefined) {
      if (quote.amountSats + quote.feeSats > balance) {
        throw new InsufficientCardBalanceError(balance);
      }
    } else if (quote.feeSats > 0n) {
      if (quote.feeSats >= balance) throw new NothingToReturnError();
      quote = await lease.wallet.prepareTransfer(address, accountWalletId, balance - quote.feeSats);
      if (quote.amountSats + quote.feeSats > balance) {
        throw new WalletError("requestFailed", "The transfer would spend more than the card holds");
      }
    }
    const key = randomUuid();
    return {
      quote,
      cardBalanceSats: balance,
      async send() {
        // As a top-up: the passkey first.
        await confirmAccountPasskey();
        const sent = await lease.wallet.sendTransfer(quote, key);
        await syncWallet().catch((error: unknown) => {
          logFailure("Syncing the account's wallet failed", error);
        });
        await done();
        return sent;
      },
      cancel: done
    };
  } catch (error) {
    await done();
    throw error;
  }
}

/**
 * "Send" of a card holder's card (no main balance to send its sats back to): a payment from the
 * card's wallet to anyone, as "Wallet"'s from the account's (useSend), the passkey asked first (its
 * account open, no wallet of its own needed).
 */
export function cardSendSource(lease: CardWalletLease): SendSource {
  return {
    parseSendInput: (text) => lease.wallet.parseSendInput(text),
    prepareSend: (destination, amountSats) => lease.wallet.prepareSend(destination, amountSats),
    prepareDrain: (destination, totalSats) => lease.wallet.prepareDrain(destination, totalSats),
    sendPrepared: (quote, options) => lease.wallet.sendPrepared(quote, options),
    getPayment: (id) => lease.wallet.getPayment(id),
    confirm: () => confirmAccountPasskey({ accountWallet: false })
  };
}

/**
 * The card's wallet's Lightning address, registered on the SDK's LNURL domain when it has none
 * (a prefix and the start of its identity, as the account's: lightningAddressUsernames), without a
 * description: payers see the server's own ("Pay to …"), nothing of the account nor the card.
 */
export function cardLightningAddress(lease: CardWalletLease): Promise<string> {
  return lease.wallet.getLightningAddress(lease.walletId, undefined);
}

/** A Lightning invoice to a card's wallet, as it says (its times in Unix seconds). */
export type CardInvoice = {
  invoice: string;
  amountSats: bigint;
  /** Lowercase hex: what its payment is known by (cardInvoicePayment). */
  paymentHash: string;
  createdAt: number;
  expiresAt: number;
  /**
   * When it expires by this device's clock (ms): its validity counted from when the wallet gave it,
   * whatever that clock's error (its own times are the issuer's).
   */
  deadline: number;
};

/**
 * A Lightning invoice of `amountSats` to the card's wallet, its description `description`, payable
 * CARD_INVOICE_EXPIRY_SECS (its amount, network and expiry checked by the wallet layer), as the
 * invoice itself says: its holder is told until when it can be paid.
 */
export async function cardInvoice(
  lease: CardWalletLease,
  amountSats: bigint,
  description: string
): Promise<CardInvoice> {
  const invoice = await lease.wallet.receiveInvoice(
    amountSats,
    description,
    CARD_INVOICE_EXPIRY_SECS
  );
  const decoded = decodeBolt11(invoice);
  if (!decoded) throw new WalletError("requestFailed", "The invoice cannot be read");
  return {
    invoice,
    amountSats,
    paymentHash: decoded.paymentHash,
    createdAt: decoded.timestamp,
    expiresAt: decoded.timestamp + decoded.expirySeconds,
    deadline: Date.now() + decoded.expirySeconds * 1000
  };
}

/** The card's wallet's payments read at a time, newest first, looking for an invoice's. */
const INVOICE_PAYMENTS_PAGE = 50;

/**
 * The payment that settled `invoice`, once the card's wallet received it (completed, of its payment
 * hash): its sats; null until then. Read from the wallet's storage, among the payments made since
 * the invoice (a minute before, for a clock set back), page by page. Never another payment that
 * came meanwhile: "Invoice paid" is said of that invoice only.
 */
export async function cardInvoicePayment(
  lease: CardWalletLease,
  invoice: Pick<CardInvoice, "paymentHash" | "createdAt">
): Promise<{ amountSats: bigint } | null> {
  for (let offset = 0; ; offset += INVOICE_PAYMENTS_PAGE) {
    const page = await lease.wallet.listPaymentsPage({
      since: invoice.createdAt - 60,
      offset,
      limit: INVOICE_PAYMENTS_PAGE
    });
    const paid = page.payments.find(
      (payment) =>
        payment.direction === "receive" &&
        payment.network === "lightning" &&
        payment.status === "completed" &&
        payment.paymentHash?.toLowerCase() === invoice.paymentHash
    );
    if (paid) return { amountSats: paid.amountSats };
    if (page.listed < INVOICE_PAYMENTS_PAGE) return null;
  }
}

/**
 * A new on-chain address of the card's wallet: a deposit is credited from its 1st confirmation to
 * its 3rd, its claim fee at most MAX_DEPOSIT_CLAIM_FEE_SATS (src/lib/breez/config.ts), as the
 * account's.
 */
export function cardDepositAddress(lease: CardWalletLease): Promise<string> {
  return lease.wallet.newDepositAddress(lease.walletId);
}
