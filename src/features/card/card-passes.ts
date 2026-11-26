import { Platform } from "react-native";

import { IOS_EXTENSION_PAYS_CARDS } from "@/config/card";
import { cardSharedContainer } from "@/lib/card/app-group";
import type { CardState } from "@/lib/card/card-record";
import { cardPassOf, wipeCardPass, type CardPass } from "@/lib/card/card-pass";
import { keepCardPasses } from "@/lib/card/card-pass-store";
import { bookOf, hasApprovedPayee, type CardPayeeBooks } from "@/lib/card/payee-book";
import { loadPayeeBooks } from "@/lib/card/payees";
import { loadPushMarks } from "@/lib/card/push-marks";
import { logFailure } from "@/lib/log/log";

import { syncOwnCopies } from "./own-copies";
import { cardSocketCovers } from "./socket";
import { cardStatesOnDevice, type CardAccess } from "./states";

/*
 * Which of the account's cards this phone keeps a pass of (src/lib/card/card-pass.ts: each card's
 * own secrets, never the root of every card's keys), which lets that card pay with the app closed
 * (an approved merchant only, from the card's own wallet). A card's pass is kept only while all of
 * these hold, forgotten as soon as
 * one does not:
 * - something wakes this phone for the card, the app closed, and pays there: on Android, the card
 *   socket, listening to the card's relay (socket.ts; Android has no push: with the socket off, or
 *   not listening to that relay, the phone is never woken); on an iPhone, the notification service
 *   extension (IOS_EXTENSION_PAYS_CARDS, docs/ios-card-payments.md), which the relay wakes only
 *   when the card's channel holds this phone's push token (push-marks.ts: notifications allowed,
 *   the token sealed at the channel's last sync). Elsewhere a pass would serve nothing;
 * - the card is active and pays some merchant without asking, the account closed: its mode is not
 * "Always confirm" and it has at least one approved merchant (payee-decision.ts, `automaticLocked`:
 * the account closed, only an approved merchant is paid without asking, whatever the mode; a card
 * that approves nobody keeps nothing),
 *   and the merchants' books are readable (ones a newer app wrote pay nothing).
 * Decided with the open account's keys: at each card sync (sync.ts), after each change of the
 * merchants' book on this phone (payees-sync.ts), after a merchant approved with a payment
 * (payment.ts), and after a card is paired, programmed again or deleted (pairing.ts, manage.ts):
 * a pass holds the card's keys at their version and its relay. Each sync also fills in the own
 * copies of the cards kept (own-copies.ts), which their passes read. The web app keeps nothing.
 */

/**
 * What this run of the app last decided, and did, for the passes of an account: whether any is
 * kept. Lets a screen tell whether the phone keeps some (modified-phone.ts) without reading them
 * out of the secure storage, which would bring their secrets into memory for nothing. Not known
 * before this run's first decision (the app's start sync decides it).
 */
let decided: { walletId: string; kept: boolean } | null = null;
const listeners = new Set<() => void>();

function decide(next: typeof decided): void {
  decided = next;
  for (const listener of listeners) listener();
}

/** Whether this phone keeps passes of `walletId`'s cards, as this run last decided; null: not yet. */
export function cardPassesKept(walletId: string): boolean | null {
  return decided !== null && decided.walletId.toLowerCase() === walletId.toLowerCase()
    ? decided.kept
    : null;
}

/** Calls `listener` at each decision; returns the unsubscribe function. */
export function subscribeCardPassesKept(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Whether something wakes this phone for a card and pays there, the app closed (see above). */
async function wakeCovers(): Promise<(state: CardState) => boolean> {
  if (Platform.OS === "ios") {
    if (!IOS_EXTENSION_PAYS_CARDS || !cardSharedContainer()) return () => false;
    const marks = await loadPushMarks();
    return (state) => typeof marks.get(state.cardId) === "string";
  }
  return (state) => cardSocketCovers([state]);
}

/** The cards of `states` this phone keeps a pass of, as `books` and `covers` say. */
function passedCards(
  states: readonly CardState[],
  books: CardPayeeBooks,
  covers: (state: CardState) => boolean
): CardState[] {
  if (books.newerOnRelays) return [];
  return states.filter((state) => {
    if (state.status !== "active") return false;
    if (!covers(state)) return false;
    const book = bookOf(books, state);
    return book.mode.mode !== "confirm" && hasApprovedPayee(book);
  });
}

/**
 * Keeps the passes of the cards that pay with the app closed, and only theirs, as the cards and
 * the holder's mode say; then (`ownCopies`: the card sync, sync.ts) fills in those cards' own
 * copies on the relays. Elsewhere (a pairing, a deletion, a book's change), each write of a state
 * or a book has written its own copy already: nothing more waits for the relays. Never rejects.
 */
export async function syncCardPasses(
  access: CardAccess,
  states?: readonly CardState[],
  { ownCopies = false }: { ownCopies?: boolean } = {}
): Promise<void> {
  let cards: CardState[] = [];
  let books: CardPayeeBooks | null = null;
  const passes: CardPass[] = [];
  try {
    books = await loadPayeeBooks(access.walletId);
    cards = passedCards(states ?? (await cardStatesOnDevice(access)), books, await wakeCovers());

    for (const state of cards) passes.push(cardPassOf(access.root, state));
  } catch (error) {
    // The cards or the books unreadable: no pass, a payment waits for the passkey.
    logFailure("Reading which cards keep a pass failed", error);
    cards = [];
    for (const pass of passes.splice(0)) wipeCardPass(pass);
  }
  try {
    const kept = await keepCardPasses(access.walletId, passes);
    decide(kept ? { walletId: access.walletId, kept: passes.length > 0 } : null);
  } catch (error) {
    logFailure("Keeping the cards' passes failed", error);
    // Not known what the secure storage holds now: nothing said of it.
    decide(null);
  } finally {
    for (const pass of passes) wipeCardPass(pass);
  }
  if (!ownCopies || !books) return;
  for (const state of cards) {
    // A write of its copies that failed: what the pass reads (never rejects).
    await syncOwnCopies(access, state, { state, book: bookOf(books, state) });
  }
}
