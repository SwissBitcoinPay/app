import { majority } from "@/config/registry";
import { getAccountWalletId } from "@/features/account/session";
import { erasedGenerations } from "@/lib/card/card-record";
import {
  bookOf,
  markPayeesPublished,
  mergeRemotePayees,
  PAYEE_MODE_KEY,
  type CardPayeeBooks,
  type PayeeBook
} from "@/lib/card/payee-book";
import {
  derivePayeeRecordKeys,
  formatMarkerEvent,
  payeeAddress,
  payeeEvent,
  payeeModeAddress,
  payeeModeEvent,
  payeesFilter,
  payeesOf,
  wipePayeeRecordKeys,
  type PayeeRecordKeys,
  type PayeesRead
} from "@/lib/card/payee-records";
import { updatePayeeBooks } from "@/lib/card/payees";
import type { NostrEvent } from "@/lib/nostr/event";
import { COPIES_AT_ONCE, publishAgain, queryRelaysPaged, type RelayCall } from "@/lib/nostr/pool";
import { currentRelays } from "@/lib/relays/current";

import { syncCardPasses } from "./card-passes";
import { syncOwnCopies } from "./own-copies";
import { CARD_RECORD_TIMEOUT_MS, knownCardStates, withCardAccess, type CardAccess } from "./states";

/*
 * Whom each of the account's cards pays without asking (src/lib/card/payee-book.ts), kept in step
 * with the account's relays (the cards are managed on the web too): their
 * records read whole (every page, src/lib/card/payee-records.ts), every card's at once, merged into
 * the device's books, then what the relays lack published, each to a majority. The phone's books
 * decide its payments at once, without network: the relays bring what the web app or another
 * phone changed. The web app's books are in memory: what the relays hold, and the changes made
 * since. Each card keeps the book of its latest wallet (a card deleted then added again starts
 * anew): an earlier wallet's, wherever it is left, is never merged into it, and the books of the
 * wallets this session knows erased (card-erasure.ts) are never brought back.
 *
 * Run when the phone syncs its cards (sync.ts), when "Cards" shows the book and after each
 * change of it, and after a card payment that approved a merchant (payment.ts). Each run also gives
 * the books' marker to the relays that lack it (payee-records.ts, formatMarkerEvent): an app of
 * format 1 then pays no card, rather than from a book no up-to-date app reads.
 */

export type PayeesRefresh = {
  /** The device's books, as kept now. */
  books: CardPayeeBooks;
  /**
   * A majority of the relays answered whole: the books hold every decision a majority took (any
   * two majorities share a relay).
   */
  conclusive: boolean;
};

function relayCall(keys: PayeeRecordKeys): RelayCall {
  return {
    relays: currentRelays(),
    channel: "account",
    timeoutMs: CARD_RECORD_TIMEOUT_MS,
    authKey: keys.nostr.secretKey
  };
}

/** The record of an entry of a card's book (PAYEE_MODE_KEY or an address), and its address. */
function recordOf(
  keys: PayeeRecordKeys,
  book: PayeeBook,
  key: string
): { address: string; event: NostrEvent; updatedAt: number } | null {
  if (key === PAYEE_MODE_KEY) {
    return {
      address: payeeModeAddress(keys, book),
      event: payeeModeEvent(keys, book.mode),
      updatedAt: book.mode.updatedAt
    };
  }
  const entry = book.payees.get(key);
  if (!entry) return null;
  return {
    address: payeeAddress(keys, entry, entry.id),
    event: payeeEvent(keys, entry),
    updatedAt: entry.updatedAt
  };
}

/**
 * Publishes the books' unpublished entries, COPIES_AT_ONCE at a time, but those whose address
 * holds a record of a newer format (never written over). Resolves with those a majority of the
 * relays took or holds newer (publishAgain: a copy of the same date is refused for the one there,
 * which the merge before made hold every decision of this one), by card and key, with the
 * `updatedAt` published.
 */
async function publishBooks(
  keys: PayeeRecordKeys,
  books: CardPayeeBooks,
  newer: ReadonlySet<string>,
  call: RelayCall
): Promise<Map<string, Map<string, number>>> {
  const quorum = majority(call.relays.length);
  const records = [...books.books.values()].flatMap((book) =>
    [...book.unpublished].flatMap((key) => {
      const record = recordOf(keys, book, key);
      return record && !newer.has(record.address) ? [{ cardId: book.cardId, key, ...record }] : [];
    })
  );
  const published = new Map<string, Map<string, number>>();
  for (let start = 0; start < records.length; start += COPIES_AT_ONCE) {
    const batch = records.slice(start, start + COPIES_AT_ONCE);
    const held = await Promise.all(
      batch.map(({ event }) => publishAgain(event, call, { quorum: "majority" }))
    );
    batch.forEach(({ cardId, key, updatedAt }, index) => {
      if (held[index].length < quorum) return;
      const card = published.get(cardId) ?? new Map<string, number>();
      published.set(cardId, card.set(key, updatedAt));
    });
  }
  return published;
}

/**
 * `books` with what the relays hold (`read`) merged into every card's (mergeRemotePayees): for each
 * card, the book of its latest wallet the device or the relays know, none of an earlier wallet's
 * merged into it, and none at all of a wallet `erased` says is erased (erasedGenerations).
 */
function mergedBooks(
  books: CardPayeeBooks,
  read: PayeesRead,
  conclusive: boolean,
  erased: ReadonlyMap<string, number>
): CardPayeeBooks {
  const merged = new Map<string, PayeeBook>();
  for (const cardId of new Set([...books.books.keys(), ...read.cards.keys()])) {
    const wallets = read.cards.get(cardId);
    const walletGeneration = Math.max(
      books.books.get(cardId)?.walletGeneration ?? 0,
      ...(wallets?.keys() ?? [])
    );
    if (walletGeneration <= (erased.get(cardId) ?? 0)) continue;
    const card = { cardId, walletGeneration };
    const remote = wallets?.get(walletGeneration) ?? { mode: null, payees: new Map() };
    merged.set(cardId, mergeRemotePayees(bookOf(books, card), remote, { conclusive }));
  }
  return {
    books: merged,
    newerOnRelays: read.newer.size > 0 || (books.newerOnRelays && !conclusive)
  };
}

/**
 * Reads the books' records on the account's relays, merges them into the device's books, then
 * publishes what the relays lack. A record of a newer format marks the books `newerOnRelays` (no
 * card pays from them, payee-store.ts); a majority's read without one clears it. Never rejects for
 * the relays (unreachable: the books as the device keeps them, not conclusive); rejects with
 * NewerCardPayeesError when a newer app wrote the device's books. `timeoutMs`: each relay's time
 * to answer the read (each of its pages). `onRead` hears the books as soon as they are read and
 * kept, before anything is published (a card payment decides with them, payment.ts).
 */
export async function refreshCardPayees(
  access: CardAccess,
  {
    timeoutMs = CARD_RECORD_TIMEOUT_MS,
    onRead
  }: { timeoutMs?: number; onRead?: (read: PayeesRefresh) => void } = {}
): Promise<PayeesRefresh> {
  const keys = derivePayeeRecordKeys(access.root);
  try {
    const call = relayCall(keys);
    const answers = await queryRelaysPaged(
      payeesFilter(keys),
      { ...call, timeoutMs },
      { whole: true, quorum: "majority" }
    );
    const read = payeesOf(keys, answers);
    const conclusive = read.answered >= majority(call.relays.length);
    // The wallets this session knows erased: a relay that missed their erasure brings none back.
    const erased = erasedGenerations(knownCardStates(access.walletId));
    const merged = await updatePayeeBooks(access.walletId, (books) =>
      mergedBooks(books, read, conclusive, erased)
    );
    onRead?.({ books: merged, conclusive });
    // Each card's own copy of its book first (own-copies.ts: what a phone keeping the card's pass
    // reads), then the account's records of the books whose copy holds it all: a write cut short
    // never leaves the account's ahead of the card's. Else both are written at the next refresh.
    const owned = new Map<string, PayeeBook>();
    for (const [cardId, book] of merged.books) {
      if (book.unpublished.size > 0 && (await syncOwnCopies(access, book, { book }))) {
        owned.set(cardId, book);
      }
    }
    const published = await publishBooks(keys, { ...merged, books: owned }, read.newer, call);
    if (read.former.lacking > 0 && !read.former.newer) {
      // Dated after any record of its address seen: the relays keep the newest.
      const at = Math.max(Math.floor(Date.now() / 1000), (read.former.newestAt ?? 0) + 1);
      await publishAgain(formatMarkerEvent(keys, at), call, { quorum: "majority" });
    }
    const books =
      published.size > 0
        ? await updatePayeeBooks(access.walletId, (current) => {
            const next = new Map(current.books);
            for (const [cardId, keysPublished] of published) {
              const book = current.books.get(cardId);
              if (book) next.set(cardId, markPayeesPublished(book, keysPublished));
            }
            return { ...current, books: next };
          })
        : merged;
    return { books, conclusive };
  } finally {
    wipePayeeRecordKeys(keys);
  }
}

/** A read of syncCardPayees, for the account it reads. */
type Sync = { walletId: string | null; read: Promise<PayeesRefresh> };

/** The read running; the one that starts once it ends (`fresh`), shared by those asked meanwhile. */
let running: Sync | null = null;
let queued: Sync | null = null;

function startSync(): Promise<PayeesRefresh> {
  let sync: Sync | null = null;
  const read = (async () => {
    try {
      return await withCardAccess(async (access) => {
        try {
          return await refreshCardPayees(access);
        } finally {
          await syncCardPasses(access);
        }
      });
    } finally {
      // Before its callers go on (withCardAccess always awaits first: `sync` is set by then): one
      // asking right after gets a read of its own.
      if (running === sync) running = null;
    }
  })();
  sync = { walletId: getAccountWalletId(), read };
  running = sync;
  return read;
}

/**
 * refreshCardPayees with the open account's card keys (NoAccountError when none is open), then the
 * cards' passes kept or forgotten as the books now say, the relays answering or not
 * (card-passes.ts).
 * One read at a time (each card's section of "Cards" asks for one): asked
 * while one runs, the same; `fresh`, one that starts after it, for a change just made, which the
 * read running may have missed.
 */
export function syncCardPayees({
  fresh = false
}: { fresh?: boolean } = {}): Promise<PayeesRefresh> {
  const walletId = getAccountWalletId();
  const current = running;
  if (!current || current.walletId !== walletId) return startSync();
  if (!fresh) return current.read;
  if (queued?.walletId === walletId) return queued.read;
  const read = current.read
    .catch(() => undefined)
    .then(() => {
      if (queued?.read === read) queued = null;
      return startSync();
    });
  queued = { walletId, read };
  return read;
}
