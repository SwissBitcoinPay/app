import { emptyPayeeBooks, type CardPayeeBooks } from "./payee-book";
import { payeeStore } from "./payee-store";

/*
 * Same API as payees.ts, in memory: the web app keeps the books of the open account's cards as the
 * relays hold them (src/features/card/payees-sync.ts), for "Cards" (the cards managed on the web
 * too). It pays no card: the phone does. Nothing is kept once the page
 * closes: a change no majority of the relays took is lost then ("Cards" says so).
 */

export type {
  ApprovedPayee,
  CardPayeeBooks,
  CardPayeeMode,
  CardPayees,
  PayeeBook
} from "./payee-book";
export {
  CARD_PAYEE_MODES,
  DEFAULT_CARD_PAYEE_MODE,
  MAX_APPROVED_PAYEES,
  MAX_LOCAL_PAYEE_NAME_LENGTH
} from "./payee-book";
export {
  FormerCardWalletError,
  LooserCardPayeeModeError,
  NewerCardPayeesError
} from "./payee-store";

export const CARD_PAYEES_DIR_NAME = "card-payees";

let kept: { walletId: string; books: CardPayeeBooks } | null = null;

const store = payeeStore({
  read: (walletId) =>
    kept !== null && kept.walletId.toLowerCase() === walletId.toLowerCase()
      ? kept.books
      : emptyPayeeBooks(),
  write: (walletId, books) => {
    kept = { walletId, books };
  }
});

export const {
  loadPayeeBooks,
  updatePayeeBooks,
  loadCardPayees,
  setCardPayeeMode,
  approveCardPayee,
  noteCardPayee,
  renameCardPayee,
  removeCardPayee
} = store;

/** Forgets the books ("Log out"; tests). */
export function forgetCardPayees(): void {
  kept = null;
}
