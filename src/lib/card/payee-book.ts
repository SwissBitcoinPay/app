import { isNodeKey } from "@/lib/lightning/bolt11";
import { normalizeLightningAddress } from "@/lib/lightning/lnurl";

import { isWalletGeneration, sameCardWallet, type CardWalletOf } from "./keys";

/*
 * Whom each of the account's cards pays without asking (each card its own), and how it is kept in
 * step between the account's devices and the web app (the cards are managed on the web too, their
 * settings on Nostr): for each card, the holder's mode, and one entry per merchant ever approved
 * for it. Pure:
 * the phone keeps the books in a file (payees.ts), the web app in memory (payees.web.ts), the
 * relays one record per entry (payee-records.ts).
 *
 * A book is its card's wallet's (keys.ts, CardWalletOf): a card deleted then added again pays from
 * a new wallet, with a book of its own, the default mode and nobody approved ("Delete" erases all
 * its data). Nothing of an earlier wallet's book ever decides
 * one of its payments, wherever it is left (a relay that missed its erasure, a phone not told).
 *
 * Each part of an entry carries the time it was decided, and two copies merge part by part, the
 * later decision winning; on a tie, the cautious one (removed rather than approved, the stricter
 * mode). The merge is the same whatever the order of the copies: every device ends with the same
 * book. A removed merchant keeps its entry (approved: false), so that an older copy of its approval
 * never brings it back.
 *
 * A merchant is its Lightning address, when the point of sale proves it, else the node its invoices
 * pay (payee-proof.ts): an entry's `id` is either, told apart by
 * their shapes (an address always holds an "@", a node's key never).
 *
 * IRREVERSIBLE once released: the values' format (PAYEE_FORMAT_VERSION, NODE_PAYEE_FORMAT_VERSION),
 * which the records and the phone's file share; a change needs a new version and a migration from
 * the older ones. The next format of any of them is 4: an app reads a version it does not know as a
 * newer app's.
 */

/**
 * 2 (each card its own mode and merchants, each of its wallets
 * anew): each entry names its card (`cardId`) and its card's wallet (`walletGeneration`). 1, one
 * book for all the account's cards, is not read. An app of before reads the books' marker
 * (payee-records.ts, formatMarkerEvent) and each merchant's record of 2 as a newer app's: it pays
 * no card.
 */
export const PAYEE_FORMAT_VERSION = 2;

/**
 * 3: the entry of a merchant identified by its node (`node`, its
 * key, in place of `address`); the modes, the books' marker and the merchants identified by their
 * address stay in format 2, which every app of format 2 reads. An app of format 2 reads an entry of
 * 3 as a newer app's: it pays no card until updated, rather than miss a merchant removed.
 */
export const NODE_PAYEE_FORMAT_VERSION = 3;

export type CardPayeeMode =
  /** Every valid tap is paid within the card's limits: the payee is shown, never checked. */
  | "automatic"
  /** Paid without asking only to an identified, approved merchant; confirmed otherwise. */
  | "approved"
  /** Every payment is confirmed by the holder. */
  | "confirm";

export const CARD_PAYEE_MODES: readonly CardPayeeMode[] = ["automatic", "approved", "confirm"];
/** "Approved merchants" by default. */
export const DEFAULT_CARD_PAYEE_MODE: CardPayeeMode = "approved";
/**
 * Past this many approved for a card, the merchants seen the longest ago are removed (they ask
 * again).
 */
export const MAX_APPROVED_PAYEES = 500;
/** As breez.tips bounds a description (spark-sdk 0.28.4, `validate_description`). */
export const MAX_PAYEE_NAME_LENGTH = 255;
/** The holder's own name for a merchant, as a business name (merchant.ts). */
export const MAX_LOCAL_PAYEE_NAME_LENGTH = 60;
/** Lightning addresses longer than this are no merchant's (LUD-16 gives no bound: e-mail's). */
const MAX_ADDRESS_LENGTH = 320;

/**
 * The key of the mode among the book's entries: never a merchant's (an address always holds an
 * "@", a node's key is hex digits).
 */
export const PAYEE_MODE_KEY = "mode";

/** Whether a merchant's id is a node's public key (compressed, lowercase hex), not an address. */
function isNodeId(id: string): boolean {
  return isNodeKey(id);
}

/** How the merchant `id` was identified: by its Lightning address, or by its node. */
export function payeeIdKind(id: string): "address" | "node" {
  return isNodeId(id) ? "node" : "address";
}

/** Whether `id` is a merchant's: a node's key, or a normalized Lightning address within bounds. */
function isPayeeId(id: string): boolean {
  return isNodeId(id) || (id.length <= MAX_ADDRESS_LENGTH && normalizeLightningAddress(id) === id);
}

/** A card's id: 16 bytes, lowercase hex (keys.ts, cardIdOf). */
export function isCardId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{32}$/.test(value);
}

/** The holder's mode for a card's wallet, and when it was chosen. */
export type PayeeModeEntry = {
  cardId: string;
  walletGeneration: number;
  mode: CardPayeeMode;
  /** When it was chosen (ms); 0: never chosen, the default. */
  modeAt: number;
  /** When this copy was written (Unix seconds): its record's `created_at`. */
  updatedAt: number;
};

/** A merchant the holder approved once for a card's wallet (approved or removed since). */
export type PayeeEntry = {
  cardId: string;
  walletGeneration: number;
  /**
   * The key: its Lightning address (`text/identifier`, normalized, never shown), or the key of the
   * node its invoices pay (isNodeId).
   */
  id: string;
  approved: boolean;
  /** When it was last approved or removed (ms): the approval's clock. */
  approvalAt: number;
  /**
   * When it was last approved (ms), and the name it declared then (a node's: its alias, "" when
   * none was read): kept after a removal.
   */
  approvedAt: number;
  approvedName: string;
  /** The holder's own name for it, null for none; and when it was last set (ms, 0: never). */
  localName: string | null;
  localNameAt: number;
  /** The name it declared at its latest payment, and when (ms). */
  lastName: string;
  lastSeenAt: number;
  /** When this copy was written (Unix seconds): its record's `created_at`. */
  updatedAt: number;
};

/** An approved merchant, as the screens and the payments see it. */
export type ApprovedPayee = {
  /** Its address or its node's key (PayeeEntry). */
  id: string;
  /** How it is identified (payeeIdKind). */
  by: "address" | "node";
  /** When the holder approved it (ms). */
  approvedAt: number;
  /** The name it declared then (`text/plain`, as served). */
  approvedName: string;
  /** The name it declared at its latest payment. */
  lastName: string;
  /** When it was last identified (ms). */
  lastSeenAt: number;
  /** The holder's own name for it, null for none. */
  localName: string | null;
};

/** What decides a card's payment and what its "Approved merchants" shows. */
export type CardPayees = { mode: CardPayeeMode; approved: ApprovedPayee[] };

/** A card's wallet's book: its mode and the merchants ever approved for it. */
export type PayeeBook = {
  cardId: string;
  walletGeneration: number;
  mode: PayeeModeEntry;
  /** By id. */
  payees: ReadonlyMap<string, PayeeEntry>;
  /**
   * Entries (PAYEE_MODE_KEY or a merchant's id) whose latest copy no majority of the relays is
   * known to hold: left only once a majority took it (markPayeesPublished).
   */
  unpublished: ReadonlySet<string>;
};

/** The books of the account's cards. */
export type CardPayeeBooks = {
  /**
   * By card id, the book of the card's latest wallet known: a card's wallet without one has the
   * default mode, nobody approved (bookOf).
   */
  books: ReadonlyMap<string, PayeeBook>;
  /**
   * The relays hold a record of a newer format: a decision of a newer app, which this one cannot
   * read (a merchant removed, maybe), for a card it cannot tell. The books are not whole: no card
   * pays from them, and the holder changes nothing of them (NewerCardPayeesError), until a newer
   * app reads the relays.
   */
  newerOnRelays: boolean;
};

export function emptyPayeeBook({ cardId, walletGeneration }: CardWalletOf): PayeeBook {
  return {
    cardId,
    walletGeneration,
    mode: { cardId, walletGeneration, mode: DEFAULT_CARD_PAYEE_MODE, modeAt: 0, updatedAt: 0 },
    payees: new Map(),
    unpublished: new Set()
  };
}

export function emptyPayeeBooks(): CardPayeeBooks {
  return { books: new Map(), newerOnRelays: false };
}

/**
 * The book of the card's wallet `card`: the default mode, nobody approved, until one is kept for
 * that very wallet (one of another generation is not its book).
 */
export function bookOf(books: CardPayeeBooks, card: CardWalletOf): PayeeBook {
  const kept = books.books.get(card.cardId);
  return kept && sameCardWallet(kept, card) ? kept : emptyPayeeBook(card);
}

/** `books` with `book` in place of its card's (of whatever wallet). */
export function withBook(books: CardPayeeBooks, book: PayeeBook): CardPayeeBooks {
  return { ...books, books: new Map(books.books).set(book.cardId, book) };
}

function isTime(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isName(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length <= max;
}

export function isPayeeMode(value: unknown): value is CardPayeeMode {
  return CARD_PAYEE_MODES.includes(value as CardPayeeMode);
}

/** The value of a mode's copy (its record's, the phone's file's). */
export function payeeModeValue(entry: PayeeModeEntry): Record<string, unknown> {
  return { version: PAYEE_FORMAT_VERSION, ...entry };
}

/**
 * A mode's copy, checked whole; null when out of shape, or of version 1 (no card's). Of a newer
 * version: `newer`.
 */
export function parsePayeeMode(value: unknown): PayeeModeEntry | "newer" | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.version === "number" && v.version > PAYEE_FORMAT_VERSION) return "newer";
  if (
    v.version !== PAYEE_FORMAT_VERSION ||
    !isCardId(v.cardId) ||
    !isWalletGeneration(v.walletGeneration) ||
    !isPayeeMode(v.mode) ||
    !isTime(v.modeAt) ||
    !isTime(v.updatedAt)
  ) {
    return null;
  }
  return {
    cardId: v.cardId,
    walletGeneration: v.walletGeneration,
    mode: v.mode,
    modeAt: v.modeAt,
    updatedAt: v.updatedAt
  };
}

/**
 * The value of a merchant's copy (its record's, the phone's file's): of format 2 for an address, 3
 * for a node (NODE_PAYEE_FORMAT_VERSION).
 */
export function payeeValue(entry: PayeeEntry): Record<string, unknown> {
  const { id, cardId, walletGeneration, ...parts } = entry;
  return isNodeId(id)
    ? { version: NODE_PAYEE_FORMAT_VERSION, cardId, walletGeneration, node: id, ...parts }
    : { version: PAYEE_FORMAT_VERSION, cardId, walletGeneration, address: id, ...parts };
}

/**
 * A merchant's copy, checked whole: of format 2, a merchant's address; of 3, its node. Null when
 * out of shape, or of version 1 (no card's). Of a newer version: `newer`.
 */
export function parsePayee(value: unknown): PayeeEntry | "newer" | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.version === "number" && v.version > NODE_PAYEE_FORMAT_VERSION) return "newer";
  // Format 2 names the merchant by its address, 3 by its node: never both.
  const id =
    v.version === PAYEE_FORMAT_VERSION && !("node" in v)
      ? v.address
      : v.version === NODE_PAYEE_FORMAT_VERSION && !("address" in v)
        ? v.node
        : null;
  if (
    typeof id !== "string" ||
    !isPayeeId(id) ||
    payeeIdKind(id) !== (v.version === NODE_PAYEE_FORMAT_VERSION ? "node" : "address") ||
    !isCardId(v.cardId) ||
    !isWalletGeneration(v.walletGeneration) ||
    typeof v.approved !== "boolean" ||
    !isTime(v.approvalAt) ||
    !isTime(v.approvedAt) ||
    v.approvedAt > v.approvalAt ||
    !isName(v.approvedName, MAX_PAYEE_NAME_LENGTH) ||
    !(
      v.localName === null ||
      (isName(v.localName, MAX_LOCAL_PAYEE_NAME_LENGTH) && v.localName.trim() !== "")
    ) ||
    !isTime(v.localNameAt) ||
    !isName(v.lastName, MAX_PAYEE_NAME_LENGTH) ||
    !isTime(v.lastSeenAt) ||
    !isTime(v.updatedAt)
  ) {
    return null;
  }
  return {
    cardId: v.cardId,
    walletGeneration: v.walletGeneration,
    id,
    approved: v.approved,
    approvalAt: v.approvalAt,
    approvedAt: v.approvedAt,
    approvedName: v.approvedName,
    localName: v.localName as string | null,
    localNameAt: v.localNameAt,
    lastName: v.lastName,
    lastSeenAt: v.lastSeenAt,
    updatedAt: v.updatedAt
  };
}

/** For the same time: the stricter mode wins. */
const MODE_RANK: Record<CardPayeeMode, number> = { automatic: 0, approved: 1, confirm: 2 };

/**
 * Whether `next` asks the holder less often than `current` ("Automatic" rather than
 * "Approved merchants", either rather than "Always confirm"): chosen only with the
 * passkey (payee-store.ts).
 */
export function isLooserMode(next: CardPayeeMode, current: CardPayeeMode): boolean {
  return MODE_RANK[next] < MODE_RANK[current];
}

/**
 * Two copies of a card's wallet's mode merged, whatever their order: the later choice, else the
 * stricter.
 */
export function mergePayeeModes(a: PayeeModeEntry, b: PayeeModeEntry): PayeeModeEntry {
  if (!sameCardWallet(a, b)) throw new Error("Two different cards' wallets");
  const later =
    a.modeAt !== b.modeAt
      ? a.modeAt > b.modeAt
        ? a
        : b
      : MODE_RANK[a.mode] >= MODE_RANK[b.mode]
        ? a
        : b;
  return {
    cardId: a.cardId,
    walletGeneration: a.walletGeneration,
    mode: later.mode,
    modeAt: later.modeAt,
    updatedAt: Math.max(a.updatedAt, b.updatedAt)
  };
}

/** -1, 0 or 1 as `a` sorts before, with or after `b` (code units: the same on every device). */
function compareText(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return -1;
  if (b === null) return 1;
  return a < b ? -1 : 1;
}

/**
 * Two copies of a merchant's entry merged, whatever their order, part by part: the approval of
 * the later decision (on a tie, the removal), the holder's name set last, the latest name seen.
 * Every tie is broken by the values themselves, so that every device ends with the same entry.
 */
export function mergePayees(a: PayeeEntry, b: PayeeEntry): PayeeEntry {
  if (!sameCardWallet(a, b) || a.id !== b.id) throw new Error("Two different merchants");
  const approval = (() => {
    if (a.approvalAt !== b.approvalAt) return a.approvalAt > b.approvalAt ? a : b;
    if (a.approved !== b.approved) return a.approved ? b : a;
    if (a.approvedAt !== b.approvedAt) return a.approvedAt > b.approvedAt ? a : b;
    return compareText(a.approvedName, b.approvedName) <= 0 ? a : b;
  })();
  const named = (() => {
    if (a.localNameAt !== b.localNameAt) return a.localNameAt > b.localNameAt ? a : b;
    return compareText(a.localName, b.localName) <= 0 ? a : b;
  })();
  const seen = (() => {
    if (a.lastSeenAt !== b.lastSeenAt) return a.lastSeenAt > b.lastSeenAt ? a : b;
    return compareText(a.lastName, b.lastName) <= 0 ? a : b;
  })();
  return {
    cardId: a.cardId,
    walletGeneration: a.walletGeneration,
    id: a.id,
    approved: approval.approved,
    approvalAt: approval.approvalAt,
    approvedAt: approval.approvedAt,
    approvedName: approval.approvedName,
    localName: named.localName,
    localNameAt: named.localNameAt,
    lastName: seen.lastName,
    lastSeenAt: seen.lastSeenAt,
    updatedAt: Math.max(a.updatedAt, b.updatedAt)
  };
}

/** Whether `copy` decides anything `known` does not: it is worth publishing. */
function modeAdds(known: PayeeModeEntry, copy: PayeeModeEntry): boolean {
  const merged = mergePayeeModes(known, copy);
  return merged.mode !== known.mode || merged.modeAt !== known.modeAt;
}

function payeeAdds(known: PayeeEntry, copy: PayeeEntry): boolean {
  const merged = mergePayees(known, copy);
  return (
    merged.approved !== known.approved ||
    merged.approvalAt !== known.approvalAt ||
    merged.approvedAt !== known.approvedAt ||
    merged.approvedName !== known.approvedName ||
    merged.localName !== known.localName ||
    merged.localNameAt !== known.localNameAt ||
    merged.lastName !== known.lastName ||
    merged.lastSeenAt !== known.lastSeenAt
  );
}

/**
 * What the relays hold of a card's wallet's book (payee-records.ts): the merged copies they sent.
 */
export type RemotePayees = {
  mode: PayeeModeEntry | null;
  payees: ReadonlyMap<string, PayeeEntry>;
};

/**
 * A card's wallet's book with what the relays hold of it merged in (`remote`, of that very wallet).
 * Each entry the relays lack something of (a
 * decision only this book holds) is unpublished, dated after every copy they sent: a relay keeps
 * one copy per address, the latest, and of two copies of the same date the one of the lower id
 * (NIP-01), which could be theirs. An entry none of them sent is unpublished when they were a
 * majority (`conclusive`: any majority shares a relay with the one that took it); otherwise
 * nothing tells. What was unpublished stays so: a relay holding a copy does not tell that a
 * majority does.
 */
export function mergeRemotePayees(
  book: PayeeBook,
  remote: RemotePayees,
  { conclusive }: { conclusive: boolean }
): PayeeBook {
  // Never another wallet's copy in a book: an earlier wallet's would decide the card's payments.
  for (const copy of [...(remote.mode ? [remote.mode] : []), ...remote.payees.values()]) {
    if (!sameCardWallet(copy, book)) throw new Error("Another card's wallet's book");
  }
  const unpublished = new Set(book.unpublished);
  let mode = book.mode;
  if (remote.mode) {
    mode = mergePayeeModes(book.mode, remote.mode);
    if (modeAdds(remote.mode, book.mode)) {
      unpublished.add(PAYEE_MODE_KEY);
      mode = { ...mode, updatedAt: Math.max(mode.updatedAt, remote.mode.updatedAt + 1) };
    }
  } else if (book.mode.modeAt > 0 && conclusive) {
    unpublished.add(PAYEE_MODE_KEY);
  }
  const payees = new Map(remote.payees);
  for (const [id, mine] of book.payees) {
    const theirs = payees.get(id);
    if (!theirs) {
      if (conclusive) unpublished.add(id);
      payees.set(id, mine);
      continue;
    }
    const merged = mergePayees(theirs, mine);
    if (payeeAdds(theirs, mine)) {
      unpublished.add(id);
      payees.set(id, {
        ...merged,
        updatedAt: Math.max(merged.updatedAt, theirs.updatedAt + 1)
      });
    } else {
      payees.set(id, merged);
    }
  }
  return { ...book, mode, payees, unpublished };
}

/**
 * A card's wallet's book with what other copies of it tell merged in, part by part, as a decision
 * reads them (a card's own copies read with its pass: src/features/card/payment.ts); nothing marked
 * to publish, none of another wallet's taken.
 */
export function withPayeeCopies(book: PayeeBook, copies: RemotePayees): PayeeBook {
  const mode =
    copies.mode && sameCardWallet(copies.mode, book)
      ? mergePayeeModes(book.mode, copies.mode)
      : book.mode;
  const payees = new Map(book.payees);
  for (const [id, theirs] of copies.payees) {
    if (!sameCardWallet(theirs, book) || theirs.id !== id) continue;
    const mine = payees.get(id);
    payees.set(id, mine ? mergePayees(mine, theirs) : theirs);
  }
  return { ...book, mode, payees };
}

/** The book once the relays took these copies (by key, the `updatedAt` published). */
export function markPayeesPublished(
  book: PayeeBook,
  published: ReadonlyMap<string, number>
): PayeeBook {
  const unpublished = new Set(book.unpublished);
  for (const [key, updatedAt] of published) {
    const current = key === PAYEE_MODE_KEY ? book.mode : book.payees.get(key);
    // Written again meanwhile: the newer copy is still to publish.
    if (current && current.updatedAt === updatedAt) unpublished.delete(key);
  }
  return { ...book, unpublished };
}

/** Whether `book` approves some merchant (removed ones aside). */
export function hasApprovedPayee(book: PayeeBook): boolean {
  for (const entry of book.payees.values()) if (entry.approved) return true;
  return false;
}

/** What decides a payment and what the screens show. */
export function payeesView(book: PayeeBook): CardPayees {
  const approved = [...book.payees.values()]
    .filter((entry) => entry.approved)
    .sort((a, b) => a.approvedAt - b.approvedAt || compareText(a.id, b.id))
    .map(({ id, approvedAt, approvedName, lastName, lastSeenAt, localName }) => ({
      id,
      by: payeeIdKind(id),
      approvedAt,
      approvedName,
      lastName,
      lastSeenAt,
      localName
    }));
  return { mode: book.mode.mode, approved };
}

/** A copy's write time: now in seconds, after its previous copy's (relays keep the latest). */
function writtenAt(now: number, previous: { updatedAt: number } | undefined): number {
  return Math.max(Math.floor(now / 1000), (previous?.updatedAt ?? -1) + 1);
}

function withPayee(book: PayeeBook, entry: PayeeEntry): PayeeBook {
  return {
    ...book,
    payees: new Map(book.payees).set(entry.id, entry),
    unpublished: new Set(book.unpublished).add(entry.id)
  };
}

/** The name as kept: what was served, cut whole characters at the bound. */
export function keptPayeeName(name: string): string {
  let kept = "";
  for (const char of name) {
    if (kept.length + char.length > MAX_PAYEE_NAME_LENGTH) break;
    kept += char;
  }
  return kept;
}

/** The holder chose a mode at `now` (ms); null when it is the mode already. */
export function choosePayeeMode(
  book: PayeeBook,
  mode: CardPayeeMode,
  now: number
): PayeeBook | null {
  if (!isPayeeMode(mode)) throw new Error("Not a mode");
  if (book.mode.mode === mode) return null;
  return {
    ...book,
    mode: {
      cardId: book.cardId,
      walletGeneration: book.walletGeneration,
      mode,
      modeAt: Math.max(now, book.mode.modeAt + 1),
      updatedAt: writtenAt(now, book.mode)
    },
    unpublished: new Set(book.unpublished).add(PAYEE_MODE_KEY)
  };
}

/**
 * The holder approved this identified merchant (its address or its node, payee-proof.ts) for the
 * book's card's wallet at `now` (ms). One approved already is only seen again. Past
 * MAX_APPROVED_PAYEES, those seen the longest ago are removed. `name` null: a node whose alias was
 * not read (payee-proof.ts), approved under none, its last name known kept.
 */
export function approvePayee(
  book: PayeeBook,
  payee: { id: string; name: string | null },
  now: number
): PayeeBook {
  const { id } = payee;
  if (!isPayeeId(id)) throw new Error("Not a payee's address nor a node");
  const known = book.payees.get(id);
  const name = keptPayeeName(payee.name ?? "");
  if (known?.approved) return seePayee(book, payee, now) ?? book;
  const at = Math.max(now, (known?.approvalAt ?? -1) + 1);
  let next = withPayee(book, {
    cardId: book.cardId,
    walletGeneration: book.walletGeneration,
    id,
    approved: true,
    approvalAt: at,
    approvedAt: at,
    approvedName: name,
    localName: known?.localName ?? null,
    localNameAt: known?.localNameAt ?? 0,
    lastName: known && (known.lastSeenAt > now || payee.name === null) ? known.lastName : name,
    lastSeenAt: Math.max(known?.lastSeenAt ?? 0, now),
    updatedAt: writtenAt(now, known)
  });
  const approved = [...next.payees.values()].filter((entry) => entry.approved);
  const excess = approved.length - MAX_APPROVED_PAYEES;
  if (excess > 0) {
    // The merchants seen the longest ago go first, never the one just approved.
    const dropped = approved
      .filter((entry) => entry.id !== id)
      .sort((a, b) => a.lastSeenAt - b.lastSeenAt || compareText(a.id, b.id))
      .slice(0, excess);
    for (const entry of dropped) next = removed(next, entry, now);
  }
  return next;
}

/**
 * An approved merchant identified again at `now` (ms): its latest name kept, its approval unchanged
 * (the address, or the node, is the merchant, whatever its name). `name` null: a node whose alias
 * was not read, its last name known kept. Null for a merchant not approved, or nothing new.
 */
export function seePayee(
  book: PayeeBook,
  payee: { id: string; name: string | null },
  now: number
): PayeeBook | null {
  const known = book.payees.get(payee.id);
  if (!known?.approved || now < known.lastSeenAt) return null;
  const name = payee.name === null ? known.lastName : keptPayeeName(payee.name);
  if (now === known.lastSeenAt && name === known.lastName) return null;
  return withPayee(book, {
    ...known,
    lastName: name,
    lastSeenAt: now,
    updatedAt: writtenAt(now, known)
  });
}

/** The holder's own name for an approved merchant at `now` (ms); empty: its declared name again. */
export function renamePayee(
  book: PayeeBook,
  id: string,
  localName: string,
  now: number
): PayeeBook | null {
  const name = localName.trim();
  if (name.length > MAX_LOCAL_PAYEE_NAME_LENGTH) throw new Error("The name is too long");
  const known = book.payees.get(id);
  if (!known?.approved) return null;
  const kept = name === "" ? null : name;
  if (kept === known.localName) return null;
  return withPayee(book, {
    ...known,
    localName: kept,
    localNameAt: Math.max(now, known.localNameAt + 1),
    updatedAt: writtenAt(now, known)
  });
}

function removed(book: PayeeBook, known: PayeeEntry, now: number): PayeeBook {
  return withPayee(book, {
    ...known,
    approved: false,
    approvalAt: Math.max(now, known.approvalAt + 1),
    updatedAt: writtenAt(now, known)
  });
}

/** No longer approved from `now` (ms) on: its next payment asks again. Null when not approved. */
export function removePayee(book: PayeeBook, id: string, now: number): PayeeBook | null {
  const known = book.payees.get(id);
  return known?.approved ? removed(book, known, now) : null;
}
