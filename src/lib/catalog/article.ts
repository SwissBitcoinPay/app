import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

import { ARTICLE_DESCRIPTION_MAX_LENGTH, ARTICLE_NAME_MAX_LENGTH } from "@/config/catalog";
import { majority } from "@/config/registry";
import { parseOptionalImageRef, type ImageRef } from "@/lib/media/image";
import type { NostrEvent } from "@/lib/nostr/event";
import { publishToQuorum, queryRelaysPaged, type RelayCall } from "@/lib/nostr/pool";
import { NewerRecordError, RECORD_KIND, openRecord, sealRecord } from "@/lib/nostr/record";
import type { RelayFilter } from "@/lib/nostr/relay";
import { secureRandomBytes } from "@/lib/random";
import type { CatalogKeys, CatalogReader } from "@/lib/team/keys";

/*
 * The business's articles ("Items"): one sealed record each
 * (src/lib/nostr/record.ts), signed by the catalogue's author (deriveCatalogKeys), on the account's
 * relays. Listed by author: a reader asks for that author's events, then checks each `d` tag
 * against the article's id. Only the owner writes them; the points of sale read them with a
 * CatalogReader (an employee's from its channel, the owner's devices in till
 * mode from what the account left them).
 *
 * A price is exact (hard rule 3): integer minor units with the digits and the code of the currency
 * it was typed in (the account's display currency then), as a sale's fiat amount
 * (src/lib/team/member-records.ts). A change of the display currency never reinterprets it.
 *
 * Changing an article publishes its record again, dated later (relays keep the newest event of an
 * address); removing it publishes a removal at its address (`ArticleRemoval`), never a NIP-09
 * deletion, which no relay is bound to honour: the removal replaces the article on every relay
 * that takes it. Its photo stays on the relays, named by nothing.
 */

const RECORD_TYPE = "catalog-article";

/** Format of an article's value. */
const ARTICLE_VERSION = 1;

/** Plaintexts are padded to multiples of this: the size tells little of the description. */
const BLOCK = 512;

export type ArticlePrice = {
  /** Integer, in minor units of `currency` (cents). */
  minor: number;
  /** Decimal digits of the currency's minor unit (2 for CHF). */
  digits: number;
  /** ISO 4217. */
  currency: string;
};

export type Article = {
  version: typeof ARTICLE_VERSION;
  /** 32 hex digits, random: its `d` tag derives from it. */
  id: string;
  /** Trimmed, filled, at most ARTICLE_NAME_MAX_LENGTH characters. */
  name: string;
  /** Trimmed, at most ARTICLE_DESCRIPTION_MAX_LENGTH characters; empty without one. */
  description: string;
  price: ArticlePrice;
  /** Its photo (src/lib/media/image.ts), null for the name's initials. */
  image: ImageRef | null;
  /**
   * The EAN / UPC scanned for it (its name and photo read from Open Food Facts when it knows the
   * product), null when none was. The point of sale's scan finds the article by it (gtinKey).
   */
  barcode: string | null;
  /** Unix seconds: when it was added. */
  createdAt: number;
  /**
   * Unix seconds: its last change (`createdAt` until changed), strictly increasing: the record is
   * dated then, so that relays keep the newest version.
   */
  updatedAt: number;
};

/** An article removed: what its address holds from then on. */
export type ArticleRemoval = {
  version: typeof ARTICLE_VERSION;
  id: string;
  removed: true;
  /** Unix seconds: when it was removed, after its last change. The record is dated then. */
  updatedAt: number;
};

/** What an article's address holds: the article, or its removal. */
export type CatalogEntry = Article | ArticleRemoval;

export function isRemoval(entry: CatalogEntry): entry is ArticleRemoval {
  return "removed" in entry;
}

const ID = /^[0-9a-f]{32}$/;
const BARCODE = /^\d{8,14}$/;
const CURRENCY = /^[A-Z]{3}$/;

/** A new article's id: 16 random bytes, hex. */
export function newArticleId(): string {
  return bytesToHex(secureRandomBytes(16));
}

/** The opaque `d` tag of article `id`: a relay cannot tell an article from any other record. */
export function articleAddress(keys: Pick<CatalogReader, "addressKey">, id: string): string {
  return bytesToHex(hmac(sha256, keys.addressKey, utf8ToBytes(`article/${id}`)));
}

export function isArticlePrice(value: unknown): value is ArticlePrice {
  if (value === null || typeof value !== "object") return false;
  const p = value as Record<string, unknown>;
  return (
    typeof p.minor === "number" &&
    Number.isSafeInteger(p.minor) &&
    p.minor >= 0 &&
    typeof p.digits === "number" &&
    Number.isInteger(p.digits) &&
    p.digits >= 0 &&
    p.digits <= 4 &&
    typeof p.currency === "string" &&
    CURRENCY.test(p.currency)
  );
}

function isUnixSeconds(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/**
 * What an article's record holds, the article or its removal; null when invalid. Throws for a
 * newer version.
 */
export function parseCatalogEntry(value: unknown): CatalogEntry | null {
  if (value === null || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (typeof v.version === "number" && v.version > ARTICLE_VERSION) throw new NewerRecordError();
  if (v.removed === undefined) return parseArticle(value);
  if (
    v.version !== ARTICLE_VERSION ||
    v.removed !== true ||
    typeof v.id !== "string" ||
    !ID.test(v.id) ||
    !isUnixSeconds(v.updatedAt)
  ) {
    return null;
  }
  return { version: ARTICLE_VERSION, id: v.id, removed: true, updatedAt: v.updatedAt };
}

/** An article's value as a record holds it; null when invalid. Throws for a newer version. */
export function parseArticle(value: unknown): Article | null {
  if (value === null || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (typeof v.version === "number" && v.version > ARTICLE_VERSION) throw new NewerRecordError();
  if (
    v.version !== ARTICLE_VERSION ||
    typeof v.id !== "string" ||
    !ID.test(v.id) ||
    typeof v.name !== "string" ||
    v.name.trim() === "" ||
    v.name.length > ARTICLE_NAME_MAX_LENGTH ||
    typeof v.description !== "string" ||
    v.description.length > ARTICLE_DESCRIPTION_MAX_LENGTH ||
    !isArticlePrice(v.price) ||
    !(v.barcode === null || (typeof v.barcode === "string" && BARCODE.test(v.barcode))) ||
    !isUnixSeconds(v.createdAt) ||
    !isUnixSeconds(v.updatedAt) ||
    v.updatedAt < v.createdAt
  ) {
    return null;
  }
  const image = parseOptionalImageRef(v.image);
  if (image === undefined) return null;
  const { minor, digits, currency } = v.price;
  return {
    version: ARTICLE_VERSION,
    id: v.id,
    name: v.name,
    description: v.description,
    price: { minor, digits, currency },
    image,
    barcode: v.barcode,
    createdAt: v.createdAt,
    updatedAt: v.updatedAt
  };
}

/** The signed record of an article or of its removal, dated by its last change. */
export function articleEvent(keys: CatalogKeys, entry: CatalogEntry): NostrEvent {
  return sealRecord({
    type: RECORD_TYPE,
    value: entry,
    signer: keys.nostr.secretKey,
    encryptionKey: keys.encryptionKey,
    address: articleAddress(keys, entry.id),
    createdAt: entry.updatedAt,
    block: BLOCK
  });
}

/**
 * Publishes an article's record to the relays of `call` (its author's key authenticates).
 * Resolves once a majority of them took it, rejects as soon as they no longer can: an article (its
 * change, its removal) is saved once a majority of the relays took it, so
 * that any read answered by a majority sees it (any two majorities share a relay).
 */
export function publishArticle(event: NostrEvent, call: RelayCall): Promise<void> {
  return publishToQuorum(event, call, majority(call.relays.length));
}

export type CatalogRead = {
  /** The articles, the newest first (by when they were added); removed ones left out. */
  articles: Article[];
  /** How many relays answered (0: none, nothing can be told). */
  answered: number;
  /** Some record was of a newer format: a newer app of the owner's wrote it. */
  newerUnreadable: boolean;
};

/** What relays hold of the catalogue of `keys` (queryRelays, queryRelaysPaged). */
export function catalogFilter(keys: CatalogReader): RelayFilter {
  return { kinds: [RECORD_KIND], authors: [keys.nostr.publicKey] };
}

/**
 * Every article the relays of `call` hold, read page by page (one author, up to MAX_ARTICLES and
 * more), until a majority answered (every article is published to one, and copied to one at a
 * change of relays), as articlesOf reads them. Never rejects.
 */
export async function fetchArticles(keys: CatalogReader, call: RelayCall): Promise<CatalogRead> {
  const answers = await queryRelaysPaged(catalogFilter(keys), call, { quorum: "majority" });
  return { ...articlesOf(keys, [...answers.values()].flat()), answered: answers.size };
}

/** An entry of the catalogue as relays hold it: the newest copy of its address that opened. */
export type CatalogCopy = {
  event: NostrEvent;
  entry: CatalogEntry;
  /** Which of the reader's keys opened it: 0 its first (`encryptionKey`), then `otherKeys`. */
  keyIndex: number;
};

/**
 * The entries of the catalogue (articles and removals) among the events relays sent: each copy is
 * checked (openRecord: author, decryption with each of the reader's keys in turn, type, `d` tag
 * against its id, signature); of an entry on several relays, the newest copy. `newer`: the
 * addresses holding a record of a newer format, with the date of the newest there.
 */
export function catalogEntriesOf(
  keys: CatalogReader,
  events: readonly unknown[]
): { copies: Map<string, CatalogCopy>; newer: Map<string, number> } {
  const newest = new Map<string, CatalogCopy>();
  const newer = new Map<string, number>();
  // The same event from every relay: opened once, but only once valid (as copyEvents): a relay
  // that sent garbage under a real event's id must not hide the real one other relays sent.
  const checked = new Set<string>();
  const tried = [keys.encryptionKey, ...(keys.otherKeys ?? [])];
  for (const value of events) {
    const id = (value as { id?: unknown } | null)?.id;
    if (typeof id === "string" && checked.has(id)) continue;
    let opened: ReturnType<typeof openEntry> = null;
    let index = 0;
    for (; index < tried.length && !opened; index += 1) {
      opened = openEntry(keys, tried[index]!, value);
    }
    if (!opened) continue;
    checked.add(opened.event.id);
    if (opened.status === "newer") {
      const address = opened.event.tags.find(([name]) => name === "d")?.[1];
      if (address !== undefined) {
        newer.set(address, Math.max(newer.get(address) ?? 0, opened.event.created_at));
      }
      continue;
    }
    const known = newest.get(opened.value.id);
    if (
      !known ||
      opened.event.created_at > known.event.created_at ||
      (opened.event.created_at === known.event.created_at && opened.event.id < known.event.id)
    ) {
      // `index` is one past the key that opened it.
      newest.set(opened.value.id, {
        event: opened.event,
        entry: opened.value,
        keyIndex: index - 1
      });
    }
  }
  return { copies: newest, newer };
}

/** One record opened with `encryptionKey` (openRecord), null when it does not open with it. */
function openEntry(keys: CatalogReader, encryptionKey: Uint8Array, value: unknown) {
  return openRecord(value, {
    type: RECORD_TYPE,
    encryptionKey,
    address: () => true,
    author: keys.nostr.publicKey,
    parse: (payload, event) => {
      const entry = parseCatalogEntry(payload);
      const address = event.tags.find(([name]) => name === "d")?.[1];
      return entry && address === articleAddress(keys, entry.id) ? entry : null;
    }
  });
}

/**
 * The articles among the events relays sent (catalogEntriesOf), the newest first by when they were
 * added: removed ones left out, as an article a newer app changed since.
 */
export function articlesOf(
  keys: CatalogReader,
  events: readonly unknown[]
): Omit<CatalogRead, "answered"> {
  const { copies, newer } = catalogEntriesOf(keys, events);
  const articles = [...copies.values()]
    // An article a newer app changed since is not shown as it was: changed here, it would replace
    // what that app wrote.
    .filter(({ event, entry }) => {
      const newerAt = newer.get(articleAddress(keys, entry.id));
      return newerAt === undefined || newerAt < event.created_at;
    })
    .flatMap(({ entry }) => (isRemoval(entry) ? [] : [entry]))
    .sort(newestFirst);
  return { articles, newerUnreadable: newer.size > 0 };
}

/** The order of the catalogue: the newest first, by when they were added (then by id). */
function newestFirst(a: Article, b: Article): number {
  return b.createdAt - a.createdAt || (a.id < b.id ? -1 : 1);
}

/**
 * `articles` (in the catalogue's order, as articlesOf gives them) with `entry` applied, as relays
 * would keep it: an article added or changed in its place, a removed one left out; nothing changes
 * when they hold the same change of it or a later one already (`updatedAt`).
 */
export function withCatalogEntry(
  articles: readonly Article[],
  entry: CatalogEntry
): readonly Article[] {
  const known = articles.find(({ id }) => id === entry.id);
  if (known && known.updatedAt >= entry.updatedAt) return articles;
  const others = articles.filter(({ id }) => id !== entry.id);
  return isRemoval(entry) ? others : [...others, entry].sort(newestFirst);
}
