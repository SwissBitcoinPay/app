import type { CardWalletOf } from "./keys";
import {
  approvePayee,
  bookOf,
  choosePayeeMode,
  isLooserMode,
  payeesView,
  removePayee,
  renamePayee,
  seePayee,
  withBook,
  type CardPayeeBooks,
  type CardPayeeMode,
  type CardPayees,
  type PayeeBook
} from "./payee-book";

/*
 * The books of the account's cards (payee-book.ts) where a device keeps them: the phone in a file
 * (payees.ts), the web app in memory (payees.web.ts). One change at a time, in order, each on the
 * books as last written; then the relays (src/features/card/payees-sync.ts).
 */

/**
 * Thrown when a newer app wrote the books, or some of them on the relays (`newerOnRelays`): they
 * are never written over, no card pays from them, and the holder changes nothing of them.
 */
export class NewerCardPayeesError extends Error {}

/**
 * A mode that asks the holder less often than the card's (isLooserMode), chosen without the
 * holder's passkey (as raising a limit): never kept.
 */
export class LooserCardPayeeModeError extends Error {}

/**
 * A change to the book of a card's former wallet (a screen or a payment of before the card was
 * deleted and added again elsewhere): the books keep its next wallet's, never written over by it.
 */
export class FormerCardWalletError extends Error {}

export type PayeeStorage = {
  /**
   * `walletId`'s books (another wallet's, none, or unreadable: none for any card).
   * NewerCardPayeesError.
   */
  read(walletId: string): CardPayeeBooks;
  write(walletId: string, books: CardPayeeBooks): void;
};

export type PayeeStore = ReturnType<typeof payeeStore>;

/** The books, whole: ones with a newer app's records on the relays are not. */
function whole(books: CardPayeeBooks): CardPayeeBooks {
  if (books.newerOnRelays) {
    throw new NewerCardPayeesError("A newer app wrote approved merchants on the relays");
  }
  return books;
}

export function payeeStore(storage: PayeeStorage) {
  let last: Promise<unknown> = Promise.resolve();
  const inTurn = <T>(change: () => T): Promise<T> => {
    const run = last.then(change, change);
    last = run.catch(() => undefined);
    return run;
  };

  /**
   * Applies `change` to the books and writes them when they changed (`change` gives null, or the
   * books it was given). NewerCardPayeesError when a newer app wrote them.
   */
  const updatePayeeBooks = (
    walletId: string,
    change: (books: CardPayeeBooks) => CardPayeeBooks | null
  ): Promise<CardPayeeBooks> =>
    inTurn(() => {
      const current = storage.read(walletId);
      const next = change(current);
      if (next === null || next === current) return current;
      storage.write(walletId, next);
      return next;
    });

  /**
   * The holder's change of a card's wallet's book (or a payment's), on whole books only, as shown.
   * FormerCardWalletError for a wallet before the one the books keep for the card.
   */
  const viewed = (
    walletId: string,
    card: CardWalletOf,
    change: (book: PayeeBook) => PayeeBook | null
  ): Promise<CardPayees> =>
    updatePayeeBooks(walletId, (books) => {
      const kept = whole(books).books.get(card.cardId);
      if (kept && kept.walletGeneration > card.walletGeneration) {
        throw new FormerCardWalletError("The card was added again: its book is a later wallet's");
      }
      const next = change(bookOf(books, card));
      return next === null ? null : withBook(books, next);
    }).then((books) => payeesView(bookOf(books, card)));

  return {
    /**
     * The books of `walletId`'s cards, as kept: with what is not on the relays yet, and whether a
     * newer app wrote some of them there. NewerCardPayeesError when a newer app wrote them.
     */
    loadPayeeBooks: (walletId: string): Promise<CardPayeeBooks> =>
      inTurn(() => storage.read(walletId)),

    updatePayeeBooks,

    /**
     * The mode and the approved merchants of `walletId`'s card's wallet `card`: none of another
     * wallet's (the default mode, nobody approved). NewerCardPayeesError.
     */
    loadCardPayees: (walletId: string, card: CardWalletOf): Promise<CardPayees> =>
      inTurn(() => payeesView(bookOf(whole(storage.read(walletId)), card))),

    /**
     * The holder's mode for the card, chosen at `now` (ms). One looser than the card's, as kept
     * now (isLooserMode), only once the holder's passkey confirmed it (`passkeyConfirmed`,
     * src/features/card/payee-mode.ts): LooserCardPayeeModeError otherwise, nothing changed.
     */
    setCardPayeeMode: (
      walletId: string,
      card: CardWalletOf,
      mode: CardPayeeMode,
      {
        now = Date.now(),
        passkeyConfirmed = false
      }: { now?: number; passkeyConfirmed?: boolean } = {}
    ): Promise<CardPayees> =>
      viewed(walletId, card, (book) => {
        if (!passkeyConfirmed && isLooserMode(mode, book.mode.mode)) {
          throw new LooserCardPayeeModeError("A looser mode needs the holder's passkey");
        }
        return choosePayeeMode(book, mode, now);
      }),

    /**
     * The holder approved this identified merchant (its address or its node) for the card, from
     * `now` on (ms). An approved one keeps its approval and is only seen again.
     */
    approveCardPayee: (
      walletId: string,
      card: CardWalletOf,
      payee: { id: string; name: string | null },
      now: number
    ): Promise<CardPayees> => viewed(walletId, card, (book) => approvePayee(book, payee, now)),

    /**
     * A merchant approved for the card was identified again (ms): its latest name kept, its
     * approval unchanged. Nothing for a merchant not approved.
     */
    noteCardPayee: (
      walletId: string,
      card: CardWalletOf,
      payee: { id: string; name: string | null },
      now: number
    ): Promise<CardPayees> => viewed(walletId, card, (book) => seePayee(book, payee, now)),

    /** The holder's own name for an approved merchant; empty: its declared name again. */
    renameCardPayee: (
      walletId: string,
      card: CardWalletOf,
      id: string,
      localName: string,
      now: number = Date.now()
    ): Promise<CardPayees> =>
      viewed(walletId, card, (book) => renamePayee(book, id, localName, now)),

    /** No longer approved for the card: its next payment asks again ("Approved merchants"). */
    removeCardPayee: (
      walletId: string,
      card: CardWalletOf,
      id: string,
      now: number = Date.now()
    ): Promise<CardPayees> => viewed(walletId, card, (book) => removePayee(book, id, now))
  };
}
