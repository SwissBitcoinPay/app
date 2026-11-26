import { File } from "expo-file-system";

import { cardDirectory } from "./card-files";
import { isWalletGeneration, sameCardWallet } from "./keys";
import {
  emptyPayeeBook,
  emptyPayeeBooks,
  isCardId,
  PAYEE_MODE_KEY,
  parsePayee,
  parsePayeeMode,
  payeeModeValue,
  payeeValue,
  type CardPayeeBooks,
  type PayeeBook,
  type PayeeEntry
} from "./payee-book";
import { NewerCardPayeesError, payeeStore } from "./payee-store";

/*
 * Whom each of the account's cards pays without asking (payee-book.ts), as this phone keeps it: in
 * its documents directory (with the wallet's own local data, in the device's backups), or the app
 * group's container where the iOS extension reads it too (card-files.ts), where a payment reads it
 * at once, without network. The account's relays hold it too (payees-sync.ts):
 * what the holder changes on the web, or on another phone, reaches this one when it reads them;
 * what this phone changes stays marked until a majority of the relays took it. Same API on the
 * web, in memory: payees.web.ts.
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

/** IRREVERSIBLE: the directory and file of the books. Never rename them. */
export const CARD_PAYEES_DIR_NAME = "card-payees";
const FILE_NAME = "payees.json";

/**
 * 3 (each card its own mode and merchants, each of its wallets
 * anew): one book per card, its latest wallet's (`walletGeneration`). 2 and 1, one book for every
 * card, are not read (as none: written as 3 at the first change). An app of before reads 3 as a
 * newer app's: it pays no card. Its entries keep their own format (payee-book.ts): an app of before
 * format 3 reads the entry of a merchant identified by its node as a newer app's, and pays no
 * card either.
 */
const FORMAT_VERSION = 3;

function bookFile(): File {
  return new File(cardDirectory(CARD_PAYEES_DIR_NAME, FILE_NAME), FILE_NAME);
}

/**
 * A card's book as the file keeps it, checked whole: its entries must name its card's wallet. Null
 * when out of shape; NewerCardPayeesError for an entry of a newer format.
 */
function parseBook(value: unknown): PayeeBook | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (
    !isCardId(v.cardId) ||
    !isWalletGeneration(v.walletGeneration) ||
    !Array.isArray(v.payees) ||
    !Array.isArray(v.unpublished)
  ) {
    return null;
  }
  const wallet = { cardId: v.cardId, walletGeneration: v.walletGeneration };
  const mode = parsePayeeMode(v.mode);
  if (mode === "newer") throw new NewerCardPayeesError("A newer app wrote a card's mode");
  const payees = new Map<string, PayeeEntry>();
  for (const item of v.payees) {
    const entry = parsePayee(item);
    if (entry === "newer") throw new NewerCardPayeesError("A newer app wrote a merchant");
    if (entry && sameCardWallet(entry, wallet) && !payees.has(entry.id)) {
      payees.set(entry.id, entry);
    }
  }
  const unpublished = new Set(
    v.unpublished.filter(
      (key): key is string => typeof key === "string" && (key === PAYEE_MODE_KEY || payees.has(key))
    )
  );
  return {
    ...wallet,
    // Out of shape: the default mode, as a card without a book.
    mode: mode && sameCardWallet(mode, wallet) ? mode : emptyPayeeBook(wallet).mode,
    payees,
    unpublished
  };
}

/**
 * `walletId`'s books: none, another wallet's, of before 3, or unreadable (written whole, then moved
 * over the old one: only a damaged storage gives that): none for any card, the default mode,
 * nobody approved (every payment then asks), until the relays are read. A newer format:
 * NewerCardPayeesError (staging gets OTA rollbacks).
 */
function readBooks(walletId: string): CardPayeeBooks {
  const file = bookFile();
  if (!file.exists) return emptyPayeeBooks();
  let value: unknown;
  try {
    value = JSON.parse(file.textSync());
  } catch {
    return emptyPayeeBooks();
  }
  if (value === null || typeof value !== "object") return emptyPayeeBooks();
  const v = value as Record<string, unknown>;
  if (typeof v.version === "number" && v.version > FORMAT_VERSION) {
    throw new NewerCardPayeesError("A newer app wrote the approved merchants");
  }
  if (
    typeof v.walletId !== "string" ||
    v.walletId.toLowerCase() !== walletId.toLowerCase() ||
    v.version !== FORMAT_VERSION ||
    !Array.isArray(v.books) ||
    typeof v.newerOnRelays !== "boolean"
  ) {
    return emptyPayeeBooks();
  }
  const books = new Map<string, PayeeBook>();
  for (const item of v.books) {
    const book = parseBook(item);
    if (book && !books.has(book.cardId)) books.set(book.cardId, book);
  }
  return { books, newerOnRelays: v.newerOnRelays };
}

function writeBooks(walletId: string, books: CardPayeeBooks): void {
  const directory = cardDirectory(CARD_PAYEES_DIR_NAME, FILE_NAME);
  directory.create({ intermediates: true, idempotent: true });
  const draft = new File(directory, `${FILE_NAME}.tmp`);
  draft.writeSync(
    JSON.stringify({
      version: FORMAT_VERSION,
      walletId,
      books: [...books.books.values()].map((book) => ({
        cardId: book.cardId,
        walletGeneration: book.walletGeneration,
        mode: payeeModeValue(book.mode),
        payees: [...book.payees.values()].map(payeeValue),
        unpublished: [...book.unpublished]
      })),
      newerOnRelays: books.newerOnRelays
    })
  );
  draft.moveSync(new File(directory, FILE_NAME), { overwrite: true });
}

const store = payeeStore({ read: readBooks, write: writeBooks });

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

/** Nothing in memory here: the file goes with the device's data (device-wipe.ts). */
export function forgetCardPayees(): void {}
