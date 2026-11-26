import { hmac } from "@noble/hashes/hmac.js";
import { epochSealFor } from "@/lib/nostr/epochs";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, concatBytes, hexToBytes, utf8ToBytes } from "@noble/hashes/utils.js";

import type { NostrEvent } from "@/lib/nostr/event";
import { queryRelaysPaged, type RelayCall } from "@/lib/nostr/pool";
import type { NostrKeys } from "@/lib/nostr/keys";
import {
  NewerRecordError,
  RECORD_KIND,
  openRecord,
  sealRecord,
  sealWithinRelays
} from "@/lib/nostr/record";
import { openLinkKey, sealLinkKey } from "@/lib/payment-link/sealed-key";
import { parseRelayList } from "@/lib/relays/list";
import { isMemberId, type ArchiveKeys } from "@/lib/team/keys";
import { isName } from "@/lib/team/shared";

/*
 * The owner's copy of a month's declarations and payment links, signed by
 * the owner alone. A declaration is signed
 * by its sale's key (registry.ts), which an employee's device, a payer's page or an integration's
 * server holds, never the owner alone: the owner reads it, it cannot sign it again. Relays refuse
 * old events (strfry: those over 3 years old) and keep nothing for sure, while "Wallet"
 * reads each payment's declaration for good. So, once a month of payments is over a year old, the
 * owner's device writes what "Wallet" made of its declarations, signed by the copy's own
 * author (deriveArchiveKeys), then signs it again each year: copies, dated the day they are made,
 * whose "By" stays the employee's or the integration's who took the sale.
 *
 * A month's copy holds every payment of the month that a declaration ties to a sale and that
 * someone the owner trusts vouches for (src/features/activity/archive.ts): its hash, its sale (the
 * declarations' author), the sale's fiat amount and note, and who took it, by the name the roster
 * gave. A payment of the month it does not hold is nobody's sale: the copy prevails over the
 * registry, whatever is declared there later (an employee or an integrator removed since, or a
 * payer, still holds the registry key).
 *
 * Since format 2, it holds the month's on-chain payments of the
 * integrations' orders too (`onchain`), by transaction: a deposit names no payment hash, its sale
 * is told by the integration's witnesses and the order's lease (src/features/activity/
 * onchain-sales.ts), which only their integration and its orders sign. And, in the same entries
 * (the format unchanged: its `by` was the owner's or an employee's already),
 * those of the point of sale's sales, told by their devices' declarations of the transactions
 * (onchain-payments.ts). A deposit of a month whose copy holds none is nobody's sale.
 *
 * It also holds the month's payment links: each link's author, its sale's
 * key, its relays and its own signing key, which its device sealed for the owner in its record
 * (src/lib/payment-link/sealed-key.ts). A payer opens a link years later, by its author: the
 * owner signs its final version again each year with that key, the same version at the same
 * address (src/features/activity/archive.ts), once the employee's records of it are over a year
 * old. Since format 4, that key is sealed in the copy for the owner's link key
 * reader (ArchiveKeys.linkKeyReader): an assistant's export grant opens the copies, never the keys
 * of their links. Formats 2 and 3 held it in clear (still read).
 *
 * The copy of a month is cut in parts, each one sealed record under 64 kB (what strfry takes by
 * default, `maxEventSize`), at an address of its month and its rank. Every part names how many there
 * are and the hashes of the whole month's payments and links (`set`, `linkSet`): a reader takes a
 * month as copied only once every part of one copy is there, so that a part lost, or two devices
 * writing at once, never make a payment look like nobody's. Each later copy of a month holds every
 * payment and link an earlier one held.
 *
 * Never change the record's type, its format, its addresses nor its keys once released: the copies
 * of every account are there.
 */

const RECORD_TYPE = "archive-month";

/**
 * Format of a part's value: 2 (`onchain`, `onchainSet`), which an older app
 * reads as newer and never writes over (a copy of a month it made again would lose the on-chain
 * payments). A part of format 1 (without them) is refused: no account keeps one.
 */
const ARCHIVE_VERSION = 2;

/**
 * Format 3: format 2, and a sale taken by
 * an assistant (`by.role` "assistant"). Written only for a part that holds one: the others stay in
 * format 2, which an app from before reads; such an app reads a part of format 3 as newer and
 * never writes over it.
 */
const ASSISTANT_ARCHIVE_VERSION = 3;

/**
 * Format 4: formats 2 and 3, each link's key sealed for the
 * owner's link key reader (`sealedKey`, sealLinkKey) instead of in clear (`key`): the copies'
 * NIP-44 key is in every assistant's export grant, the link key reader in none. Written only for a
 * part that holds a link's key, whoever took its sales: the others stay in format 2 or 3. An app
 * from before reads a part of format 4 as newer and never writes over it.
 */
const SEALED_KEYS_ARCHIVE_VERSION = 4;

/**
 * Length of a sealed link key (sealLinkKey: NIP-44 v2 of a 64-character text, base64), which a
 * part's size counts before it is sealed (monthParts). Checked by archive.test.ts.
 */
export const SEALED_LINK_KEY_LENGTH = 176;

/** The record of how far the wallet's history was gone through (ArchiveState). */
const STATE_TYPE = "archive-state";

/** Format of the state's value. */
const STATE_VERSION = 1;

/** Plaintexts are padded to multiples of this: the size tells little of the month. */
const BLOCK = 256;

/**
 * Largest plaintext of a part, in bytes (its JSON, before padding): sealed (NIP-44, base64), its
 * event stays under the 64 kB strfry takes by default (40 000 bytes of an image's record make about
 * 55 kB, src/lib/media/image.ts). Checked by archive.test.ts.
 */
export const MAX_PART_BYTES = 40_000;

/**
 * Largest entry a part holds, in bytes (its JSON): a sale whose note is longer (only a modified app
 * or server writes one) is left out of the copy, and so stays out of "Wallet"'s sales once
 * its month is copied.
 */
export const MAX_ENTRY_BYTES = 4_000;

/** More parts than a month of any business: anything above is refused rather than read. */
const MAX_PARTS = 10_000;

const HEX_32 = /^[0-9a-f]{64}$/;
const MONTH = /^([0-9]{4})-(0[1-9]|1[0-2])$/;

/**
 * Who took a sale, as the copy keeps it: the owner's devices ("You"), an employee, an
 * integration, an assistant (format 3).
 */
export type ArchiveBy =
  { role: "owner" } | { role: "employee" | "integration" | "assistant"; id: string; name: string };

/** A payment of the month and its sale, as the copy keeps it. */
export type ArchivedSale = {
  /** Hex: the payment's hash. */
  hash: string;
  /** Hex: the sale's registry identity, its declarations' author. */
  sale: string;
  /** The sale's amount, in minor units of `currency` with its `digits` (registry.ts). */
  fiat: { minor: number; digits: number; currency: string };
  note: string;
  by: ArchiveBy;
};

/** An on-chain payment of the month, its transaction, and the integration's sale it paid. */
export type ArchivedDeposit = {
  /** Hex: the transaction's id. */
  txid: string;
  /** Hex: the sale's registry identity, its lease's author. */
  sale: string;
  /** The sale's amount, as its lease declares it (registry.ts). */
  fiat: { minor: number; digits: number; currency: string };
  note: string;
  by: ArchiveBy;
};

/** A payment link of the month (made then), as the copy keeps it. */
export type ArchivedLink = {
  /** Hex: its author, which its URL names. */
  link: string;
  /** Hex: its sale's key, which its URL holds. */
  saleKey: string;
  /**
   * Hex: its own signing key, opened from its record (sealed-key.ts); null when it had none. Sealed
   * for the owner's link key reader in the copy (format 4), opened again on reading.
   */
  key: string | null;
  /** The relays its URL names. */
  relays: string[];
};

/** One part of a month's copy. */
export type MonthPart = {
  /** "YYYY-MM", in UTC: the month the wallet received its payments in. */
  month: string;
  /** Its rank, from 0. */
  part: number;
  /** How many parts the copy has. */
  parts: number;
  /** Hex: setDigest of every payment of the copy (all its parts). */
  set: string;
  /** Hex: setDigest of every link's author of the copy (all its parts). */
  linkSet: string;
  /** Its payments, by hash, ascending. */
  entries: ArchivedSale[];
  /** Its links, by author, ascending. */
  links: ArchivedLink[];
  /** Hex: setDigest of every on-chain payment's txid of the copy (all its parts). */
  onchainSet: string;
  /** Its on-chain payments, by txid, ascending (format 2). */
  onchain: ArchivedDeposit[];
};

/** Whether `value` is a month as the copies name it ("YYYY-MM", from 2009 on). */
export function isMonth(value: unknown): value is string {
  const match = typeof value === "string" ? MONTH.exec(value) : null;
  return match !== null && Number(match[1]) >= 2009;
}

/** The month (UTC) of `at` (Unix seconds). */
export function monthOf(at: number): string {
  const date = new Date(at * 1000);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** The first second (Unix) after `month`: the start of the next one, in UTC. */
export function monthEnd(month: string): number {
  const [year, number] = month.split("-").map(Number) as [number, number];
  return Date.UTC(year, number, 1) / 1000;
}

/** The month before `month`. */
export function previousMonth(month: string): string {
  return monthOf(monthStart(month) - 1);
}

/** The month after `month`. */
export function nextMonth(month: string): string {
  return monthOf(monthEnd(month));
}

/** The first second (Unix) of `month`, in UTC. */
export function monthStart(month: string): number {
  const [year, number] = month.split("-").map(Number) as [number, number];
  return Date.UTC(year, number - 1, 1) / 1000;
}

/** The opaque `d` tag of part `part` of `month`'s copy. */
export function partAddress(keys: ArchiveKeys, month: string, part: number): string {
  return bytesToHex(hmac(sha256, keys.addressKey, utf8ToBytes(`month/${month}/${part}`)));
}

/**
 * The hash of a copy's payments, or of its links' authors (hex, any order): SHA-256 of their bytes,
 * ascending.
 */
export function setDigest(hashes: Iterable<string>): string {
  const sorted = [...new Set(hashes)].sort();
  return bytesToHex(sha256(concatBytes(...sorted.map((hash) => hexToBytes(hash)))));
}

function byValue(by: ArchiveBy): Record<string, unknown> {
  return by.role === "owner" ? { role: "owner" } : { role: by.role, id: by.id, name: by.name };
}

function entryValue(entry: ArchivedSale): Record<string, unknown> {
  return {
    hash: entry.hash,
    sale: entry.sale,
    fiat: { minor: entry.fiat.minor, digits: entry.fiat.digits, currency: entry.fiat.currency },
    note: entry.note,
    by: byValue(entry.by)
  };
}

function depositValue(entry: ArchivedDeposit): Record<string, unknown> {
  return {
    txid: entry.txid,
    sale: entry.sale,
    fiat: { minor: entry.fiat.minor, digits: entry.fiat.digits, currency: entry.fiat.currency },
    note: entry.note,
    by: byValue(entry.by)
  };
}

/**
 * How a link's key is sealed in a part (format 4): `seal` gives it, from the key in hex. A part
 * without a link's key holds `key: null` (formats 2 and 3).
 */
type KeySeal = (key: string) => string;

function linkValue(link: ArchivedLink, seal: KeySeal | null): Record<string, unknown> {
  if (seal === null) {
    if (link.key !== null) throw new Error("A link's key is never copied in clear");
    return { link: link.link, saleKey: link.saleKey, key: null, relays: [...link.relays] };
  }
  return {
    link: link.link,
    saleKey: link.saleKey,
    sealedKey: link.key === null ? null : seal(link.key),
    relays: [...link.relays]
  };
}

/** What a part's size counts for a sealed key (monthParts): one as long, never opened. */
const sizeOnlySeal: KeySeal = () => "A".repeat(SEALED_LINK_KEY_LENGTH);

/** Whether `part` names an assistant: written in format 3 then (or 4). */
function namesAssistant(part: Pick<MonthPart, "entries" | "onchain">): boolean {
  return [...part.entries, ...part.onchain].some(({ by }) => by.role === "assistant");
}

/** Whether `part` holds a link's key: written in format 4 then. */
function holdsLinkKey(part: Pick<MonthPart, "links">): boolean {
  return part.links.some(({ key }) => key !== null);
}

/**
 * The value a part's record holds (format 2, 3 with an assistant, 4 with a link's key sealed by
 * `seal`), its fields in this order.
 */
function partValue(part: MonthPart, seal: KeySeal | null): Record<string, unknown> {
  const sealed = holdsLinkKey(part);
  if (sealed && seal === null) throw new Error("A link's key is never copied in clear");
  return {
    version: sealed
      ? SEALED_KEYS_ARCHIVE_VERSION
      : namesAssistant(part)
        ? ASSISTANT_ARCHIVE_VERSION
        : ARCHIVE_VERSION,
    month: part.month,
    part: part.part,
    parts: part.parts,
    set: part.set,
    linkSet: part.linkSet,
    onchainSet: part.onchainSet,
    entries: part.entries.map(entryValue),
    links: part.links.map((link) => linkValue(link, sealed ? seal : null)),
    onchain: part.onchain.map(depositValue)
  };
}

/** The bytes of `value`'s JSON. */
function jsonBytes(value: unknown): number {
  return utf8ToBytes(JSON.stringify(value)).length;
}

/** Whether `entry` fits in a part (MAX_ENTRY_BYTES): one that does not is left out of the copy. */
export function fitsArchive(entry: ArchivedSale): boolean {
  return jsonBytes(entryValue(entry)) <= MAX_ENTRY_BYTES;
}

/** fitsArchive, for an on-chain payment. */
function depositFits(entry: ArchivedDeposit): boolean {
  return jsonBytes(depositValue(entry)) <= MAX_ENTRY_BYTES;
}

/**
 * The parts of `month`'s copy holding `entries` (each payment once; those that do not fit,
 * fitsArchive, left out), `links` (each link once) and `deposits` (each transaction once, those
 * that do not fit left out): the payments by hash, the links by author, then the on-chain payments
 * by txid, ascending, each part filled up to MAX_PART_BYTES. A month without a sale nor a link to
 * keep has one part without entries: its payments are nobody's sales.
 */
export function monthParts(
  month: string,
  entries: Iterable<ArchivedSale>,
  links: Iterable<ArchivedLink> = [],
  deposits: Iterable<ArchivedDeposit> = [],
  /** Each part's plaintext at most: smaller for parts sealed at an epoch (EPOCH_PART_BYTES). */
  maxBytes: number = MAX_PART_BYTES
): MonthPart[] {
  if (!isMonth(month)) throw new Error(`Not a month: ${month}`);
  const byHash = new Map<string, ArchivedSale>();
  for (const entry of entries) if (fitsArchive(entry)) byHash.set(entry.hash, entry);
  const byAuthor = new Map<string, ArchivedLink>();
  for (const link of links) byAuthor.set(link.link, link);
  const byTxid = new Map<string, ArchivedDeposit>();
  for (const entry of deposits) if (depositFits(entry)) byTxid.set(entry.txid, entry);
  const sales = [...byHash.values()].sort((a, b) => (a.hash < b.hash ? -1 : 1));
  const kept = [...byAuthor.values()].sort((a, b) => (a.link < b.link ? -1 : 1));
  const onchain = [...byTxid.values()].sort((a, b) => (a.txid < b.txid ? -1 : 1));
  const set = setDigest(sales.map(({ hash }) => hash));
  const linkSet = setDigest(kept.map(({ link }) => link));
  const onchainSet = setDigest(onchain.map(({ txid }) => txid));
  // What a part holds besides its entries and links, its rank and count at their longest.
  const frame = jsonBytes({
    t: RECORD_TYPE,
    v: partValue(
      {
        month,
        part: MAX_PARTS,
        parts: MAX_PARTS,
        set,
        linkSet,
        onchainSet,
        entries: [],
        links: [],
        onchain: []
      },
      null
    )
  });
  type Group = { entries: ArchivedSale[]; links: ArchivedLink[]; onchain: ArchivedDeposit[] };
  const groups: Group[] = [{ entries: [], links: [], onchain: [] }];
  let size = frame;
  const add = (bytes: number, put: (group: Group) => void) => {
    const last = groups[groups.length - 1]!;
    // One more item: its JSON and the comma before it.
    if (
      size + bytes + 1 > maxBytes &&
      last.entries.length + last.links.length + last.onchain.length > 0
    ) {
      groups.push({ entries: [], links: [], onchain: [] });
      size = frame;
    }
    put(groups[groups.length - 1]!);
    size += bytes + 1;
  };
  for (const entry of sales)
    add(jsonBytes(entryValue(entry)), (group) => group.entries.push(entry));
  // Of a link with a key, the part is of format 4: its key sealed, as long as sizeOnlySeal's.
  for (const link of kept) {
    const bytes = jsonBytes(linkValue(link, link.key === null ? null : sizeOnlySeal));
    add(bytes, (group) => group.links.push(link));
  }
  for (const entry of onchain) {
    add(jsonBytes(depositValue(entry)), (group) => group.onchain.push(entry));
  }
  return groups.map((group, part) => ({
    month,
    part,
    parts: groups.length,
    set,
    linkSet,
    onchainSet,
    ...group
  }));
}

/**
 * The signed record of `part`, dated `createdAt`: its links' keys sealed for `keys.linkKeyReader`
 * (format 4). Throws for a link's key without it: never copied in clear.
 */
export function monthPartEvent(keys: ArchiveKeys, part: MonthPart, createdAt: number): NostrEvent {
  const reader = keys.linkKeyReader?.publicKey ?? null;
  const seal = reader === null ? null : (key: string) => sealLinkKey(hexToBytes(key), reader);
  return sealWithinRelays({
    type: RECORD_TYPE,
    value: partValue(part, seal),
    signer: keys.nostr.secretKey,
    encryptionKey: keys.encryptionKey,
    address: partAddress(keys, part.month, part.part),
    createdAt,
    block: BLOCK,
    epoch: epochSealFor(keys.encryptionKey)
  });
}

function parseFiat(value: unknown): ArchivedSale["fiat"] | null {
  if (value === null || typeof value !== "object") return null;
  const { minor, digits, currency } = value as Record<string, unknown>;
  // As a declaration holds it (registry.ts).
  if (typeof minor !== "number" || !Number.isSafeInteger(minor) || minor < 0) return null;
  if (typeof digits !== "number" || !Number.isInteger(digits) || digits < 0 || digits > 8) {
    return null;
  }
  if (typeof currency !== "string" || !/^[A-Z]{3}$/.test(currency)) return null;
  return { minor, digits, currency };
}

function parseBy(value: unknown): ArchiveBy | null {
  if (value === null || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (v.role === "owner") {
    return v.id === undefined && v.name === undefined ? { role: "owner" } : null;
  }
  if (
    (v.role !== "employee" && v.role !== "integration" && v.role !== "assistant") ||
    !isMemberId(v.id) ||
    !isName(v.name)
  ) {
    return null;
  }
  return { role: v.role, id: v.id, name: v.name };
}

/**
 * A link of a part: its key in clear (formats 2 and 3), or sealed (format 4) and opened with
 * `reader` (null when it does not open: as if it had none). `sealed` tells whether it holds one.
 */
function parseArchivedLink(
  value: unknown,
  format: "clear" | "sealed",
  reader: NostrKeys | null
): { link: ArchivedLink; sealed: boolean } | null {
  if (value === null || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const relays = parseRelayList(v.relays);
  if (
    typeof v.link !== "string" ||
    !HEX_32.test(v.link) ||
    typeof v.saleKey !== "string" ||
    !HEX_32.test(v.saleKey) ||
    !relays
  ) {
    return null;
  }
  const base = { link: v.link, saleKey: v.saleKey, relays };
  if (format === "clear") {
    if (!(v.key === null || (typeof v.key === "string" && HEX_32.test(v.key)))) return null;
    if (v.sealedKey !== undefined) return null;
    return { link: { ...base, key: v.key as string | null }, sealed: false };
  }
  if (v.key !== undefined) return null;
  if (v.sealedKey === null) return { link: { ...base, key: null }, sealed: false };
  if (typeof v.sealedKey !== "string" || v.sealedKey.length > 400) return null;
  const key = reader === null ? null : openLinkKey(v.sealedKey, reader, v.link);
  return { link: { ...base, key: key === null ? null : bytesToHex(key) }, sealed: true };
}

function parseEntry(value: unknown): ArchivedSale | null {
  if (value === null || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const fiat = parseFiat(v.fiat);
  const by = parseBy(v.by);
  if (
    typeof v.hash !== "string" ||
    !HEX_32.test(v.hash) ||
    typeof v.sale !== "string" ||
    !HEX_32.test(v.sale) ||
    typeof v.note !== "string" ||
    !fiat ||
    !by
  ) {
    return null;
  }
  return { hash: v.hash, sale: v.sale, fiat, note: v.note, by };
}

function parseDeposit(value: unknown): ArchivedDeposit | null {
  if (value === null || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const fiat = parseFiat(v.fiat);
  const by = parseBy(v.by);
  if (
    typeof v.txid !== "string" ||
    !HEX_32.test(v.txid) ||
    typeof v.sale !== "string" ||
    !HEX_32.test(v.sale) ||
    typeof v.note !== "string" ||
    !fiat ||
    !by
  ) {
    return null;
  }
  return { txid: v.txid, sale: v.sale, fiat, note: v.note, by };
}

/** The on-chain payments of a part's value, ascending, each once. Null when invalid. */
function parseOnchain(
  v: Record<string, unknown>
): Pick<MonthPart, "onchain" | "onchainSet"> | null {
  if (typeof v.onchainSet !== "string" || !HEX_32.test(v.onchainSet) || !Array.isArray(v.onchain)) {
    return null;
  }
  const onchain: ArchivedDeposit[] = [];
  for (const value of v.onchain as unknown[]) {
    const entry = parseDeposit(value);
    if (!entry || (onchain.length > 0 && onchain[onchain.length - 1]!.txid >= entry.txid)) {
      return null;
    }
    onchain.push(entry);
  }
  return { onchain, onchainSet: v.onchainSet };
}

/**
 * A part's value: null when invalid. Throws NewerRecordError for a newer version. Its links' keys
 * (format 4) opened with `reader` (the owner's link key reader); without it, or when one does not
 * open, read as none.
 */
export function parseMonthPart(value: unknown, reader: NostrKeys | null = null): MonthPart | null {
  if (value === null || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (typeof v.version === "number" && v.version > SEALED_KEYS_ARCHIVE_VERSION) {
    throw new NewerRecordError();
  }
  if (
    (v.version !== ARCHIVE_VERSION &&
      v.version !== ASSISTANT_ARCHIVE_VERSION &&
      v.version !== SEALED_KEYS_ARCHIVE_VERSION) ||
    !isMonth(v.month) ||
    !Number.isSafeInteger(v.parts) ||
    (v.parts as number) < 1 ||
    (v.parts as number) > MAX_PARTS ||
    !Number.isSafeInteger(v.part) ||
    (v.part as number) < 0 ||
    (v.part as number) >= (v.parts as number) ||
    typeof v.set !== "string" ||
    !HEX_32.test(v.set) ||
    typeof v.linkSet !== "string" ||
    !HEX_32.test(v.linkSet) ||
    !Array.isArray(v.entries) ||
    !Array.isArray(v.links)
  ) {
    return null;
  }
  const entries: ArchivedSale[] = [];
  for (const value of v.entries as unknown[]) {
    const entry = parseEntry(value);
    // Ascending, each payment once: as monthParts writes them.
    if (!entry || (entries.length > 0 && entries[entries.length - 1]!.hash >= entry.hash)) {
      return null;
    }
    entries.push(entry);
  }
  const sealedFormat = v.version === SEALED_KEYS_ARCHIVE_VERSION;
  const links: ArchivedLink[] = [];
  let sealedKeys = false;
  for (const value of v.links as unknown[]) {
    const read = parseArchivedLink(value, sealedFormat ? "sealed" : "clear", reader);
    // Ascending, each link once: as monthParts writes them.
    if (!read || (links.length > 0 && links[links.length - 1]!.link >= read.link.link)) {
      return null;
    }
    links.push(read.link);
    sealedKeys ||= read.sealed;
  }
  const onchain = parseOnchain(v);
  if (!onchain) return null;
  // Format 4 is a part's that holds a link's key, whoever took its sales; otherwise format 3 is a
  // part's that names an assistant, format 2 one's that does not: as partValue writes.
  if (sealedFormat !== sealedKeys) return null;
  if (
    !sealedFormat &&
    namesAssistant({ entries, ...onchain }) !== (v.version === ASSISTANT_ARCHIVE_VERSION)
  ) {
    return null;
  }
  return {
    month: v.month,
    part: v.part as number,
    parts: v.parts as number,
    set: v.set,
    linkSet: v.linkSet,
    entries,
    links,
    ...onchain
  };
}

/**
 * How far the owner's devices went through the wallet's history (one record per account): every
 * month up to `through` was looked at, and those of its months with payments that had sales to
 * keep are copied. A round reads the wallet only when a later month is old enough to be copied
 * (src/features/activity/archive.ts): the wallet is connected only while something needs it.
 */
export type ArchiveState = {
  /** "YYYY-MM": the latest month gone through. */
  through: string;
};

/** The opaque `d` tag of the account's state. */
export function stateAddress(keys: ArchiveKeys): string {
  return bytesToHex(hmac(sha256, keys.addressKey, utf8ToBytes("state")));
}

/** The signed record of `state`, dated `createdAt`. */
export function stateEvent(keys: ArchiveKeys, state: ArchiveState, createdAt: number): NostrEvent {
  return sealRecord({
    type: STATE_TYPE,
    value: { version: STATE_VERSION, through: state.through },
    signer: keys.nostr.secretKey,
    encryptionKey: keys.encryptionKey,
    address: stateAddress(keys),
    createdAt,
    block: BLOCK,
    epoch: epochSealFor(keys.encryptionKey)
  });
}

/** The state's value: null when invalid. Throws NewerRecordError for a newer version. */
export function parseArchiveState(value: unknown): ArchiveState | null {
  if (value === null || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (typeof v.version === "number" && v.version > STATE_VERSION) throw new NewerRecordError();
  return v.version === STATE_VERSION && isMonth(v.through) ? { through: v.through } : null;
}

/** What relays hold of the copies of `keys` (queryRelaysPaged). */
export function archiveFilter(keys: ArchiveKeys) {
  return { kinds: [RECORD_KIND], authors: [keys.nostr.publicKey] };
}

/**
 * A part's newest readable record. `clearKeys`: it holds a link's key in clear (formats 2 and 3,
 * written by older apps), which an assistant's export grant reads: signed again at once, sealed
 * (src/features/activity/archive.ts, refreshArchive).
 */
export type PartEntry = { part: MonthPart; event: NostrEvent; clearKeys?: true };

/** Whether a part's value (parseMonthPart's) holds a link's key in clear: formats 2 and 3. */
function holdsClearKey(value: unknown): boolean {
  const v = value as { version?: unknown; links?: unknown };
  return (
    v.version !== SEALED_KEYS_ARCHIVE_VERSION &&
    Array.isArray(v.links) &&
    v.links.some((link) => typeof (link as { key?: unknown } | null)?.key === "string")
  );
}

/** The state's newest readable record. */
export type StateEntry = { state: ArchiveState; event: NostrEvent };

/** What a read of the copies gave. */
export type ArchiveAnswers = {
  /** By address, each part's newest readable record. */
  parts: Map<string, PartEntry>;
  /** Addresses whose newest record is of a newer format: neither read nor written over. */
  newer: Set<string>;
  /** Per relay that answered, the date of the newest copy it holds of each address. */
  held: Map<string, Map<string, number>>;
  /** The newest copy of each address, as it is (of a newer format included). */
  events: Map<string, NostrEvent>;
  /** The state, when the newest record at its address is readable. */
  state: StateEntry | null;
};

type Opened =
  | { status: "ok"; event: NostrEvent; part: MonthPart; clearKeys: boolean }
  | { status: "state"; event: NostrEvent; state: ArchiveState }
  | { status: "newer"; event: NostrEvent };

function addressOf(event: NostrEvent): string | undefined {
  return event.tags.find(([name]) => name === "d")?.[1];
}

function newerThan(event: NostrEvent, other: NostrEvent | undefined): boolean {
  return (
    !other ||
    event.created_at > other.created_at ||
    (event.created_at === other.created_at && event.id < other.id)
  );
}

/**
 * The parts and the state among the events relays sent (queryRelaysPaged's answers): each copy
 * checked once (openRecord: author, decryption, type, `d` tag against its month and rank, or the
 * state's, signature); of an address on several relays, the newest copy (then the lowest id, as
 * relays keep).
 */
export function archiveOf(
  keys: ArchiveKeys,
  answers: ReadonlyMap<string, readonly unknown[]>
): ArchiveAnswers {
  // Each event once, but only once valid: a relay that sent garbage under a real event's id must
  // not hide the real one other relays sent (as rosterOf).
  const opened = new Map<string, Opened>();
  const open = (value: unknown): Opened | null => {
    const id = (value as { id?: unknown } | null)?.id;
    if (typeof id === "string") {
      const known = opened.get(id);
      if (known) return known;
    }
    const result = openRecord(value, {
      type: RECORD_TYPE,
      encryptionKey: keys.encryptionKey,
      address: () => true,
      author: keys.nostr.publicKey,
      parse: (payload, event) => {
        const part = parseMonthPart(payload, keys.linkKeyReader ?? null);
        return part && addressOf(event) === partAddress(keys, part.month, part.part)
          ? { part, clearKeys: holdsClearKey(payload) }
          : null;
      }
    });
    let read: Opened | null =
      result === null
        ? null
        : result.status === "ok"
          ? { status: "ok", event: result.event, ...result.value }
          : { status: "newer", event: result.event };
    if (!read) {
      const state = openRecord(value, {
        type: STATE_TYPE,
        encryptionKey: keys.encryptionKey,
        address: stateAddress(keys),
        author: keys.nostr.publicKey,
        parse: parseArchiveState
      });
      read =
        state === null
          ? null
          : state.status === "ok"
            ? { status: "state", event: state.event, state: state.value }
            : { status: "newer", event: state.event };
    }
    if (!read) return null;
    opened.set(read.event.id, read);
    return read;
  };
  const newest = new Map<string, PartEntry>();
  const newestAny = new Map<string, Opened>();
  const held = new Map<string, Map<string, number>>();
  for (const [relay, values] of answers) {
    const ofRelay = new Map<string, number>();
    held.set(relay, ofRelay);
    for (const value of values) {
      const read = open(value);
      if (!read) continue;
      const address = addressOf(read.event);
      if (address === undefined) continue;
      ofRelay.set(address, Math.max(ofRelay.get(address) ?? -1, read.event.created_at));
      if (newerThan(read.event, newestAny.get(address)?.event)) newestAny.set(address, read);
      if (read.status === "ok" && newerThan(read.event, newest.get(address)?.event)) {
        newest.set(address, {
          part: read.part,
          event: read.event,
          ...(read.clearKeys ? { clearKeys: true as const } : {})
        });
      }
    }
  }
  const parts = new Map<string, PartEntry>();
  const newer = new Set<string>();
  const events = new Map<string, NostrEvent>();
  let state: StateEntry | null = null;
  for (const [address, read] of newestAny) {
    events.set(address, read.event);
    if (read.status === "newer") newer.add(address);
    else if (read.status === "state") state = { state: read.state, event: read.event };
    else parts.set(address, newest.get(address)!);
  }
  return { parts, newer, held, events, state };
}

/** A month as the copies tell it. */
export type ArchivedMonth = {
  month: string;
  /**
   * Every part of one copy of the month is there (the newest at its address, all naming the same
   * count, `set` and `linkSet`, their payments and links hashing to them), none of a newer format:
   * its payments are decided. Otherwise "Wallet" reads the registry for them.
   */
  copied: boolean;
  /** Every payment of the month the parts read hold (any copy), by hash. */
  sales: Map<string, ArchivedSale>;
  /** Every link of the month the parts read hold (any copy), by author. */
  links: Map<string, ArchivedLink>;
  /** Every on-chain payment of the month the parts read hold (any copy), by txid. */
  deposits: Map<string, ArchivedDeposit>;
  /** The `set`, `linkSet` and `onchainSet` of the whole copy, when `copied`. */
  set: string | null;
  linkSet: string | null;
  onchainSet: string | null;
  /** An address of the month holds a record of a newer format: never written over. */
  newer: boolean;
};

/**
 * `month` as `answers` (and earlier reads, `parts` and `newer` of the same shape) tell it. Of a
 * payment or a link two copies hold, the whole copy's.
 */
export function archivedMonth(
  keys: ArchiveKeys,
  month: string,
  parts: ReadonlyMap<string, PartEntry>,
  newer: ReadonlySet<string>
): ArchivedMonth {
  const ofMonth = [...parts.values()].filter(({ part }) => part.month === month);
  const sales = new Map<string, ArchivedSale>();
  const links = new Map<string, ArchivedLink>();
  const deposits = new Map<string, ArchivedDeposit>();
  const take = (part: MonthPart) => {
    for (const entry of part.entries) sales.set(entry.hash, entry);
    for (const link of part.links) links.set(link.link, link);
    for (const entry of part.onchain) deposits.set(entry.txid, entry);
  };
  // The older parts first: of a payment two hold, the newest part's (then the whole copy's).
  for (const { part } of [...ofMonth].sort((a, b) => a.event.created_at - b.event.created_at)) {
    take(part);
  }
  const ranks = Math.max(1, ...ofMonth.map(({ part }) => part.parts));
  let isNewer = false;
  for (let rank = 0; rank < ranks; rank += 1) {
    if (newer.has(partAddress(keys, month, rank))) isNewer = true;
  }
  // The copy the part at rank 0 names: each of its parts must be there, of that same copy.
  const first = parts.get(partAddress(keys, month, 0))?.part;
  let copied = false;
  if (first && !isNewer) {
    const whole: MonthPart[] = [];
    for (let rank = 0; rank < first.parts; rank += 1) {
      const part = parts.get(partAddress(keys, month, rank))?.part;
      if (
        !part ||
        part.parts !== first.parts ||
        part.set !== first.set ||
        part.linkSet !== first.linkSet ||
        part.onchainSet !== first.onchainSet
      ) {
        break;
      }
      whole.push(part);
    }
    if (whole.length === first.parts) {
      const hashes = whole.flatMap((part) => part.entries.map(({ hash }) => hash));
      const authors = whole.flatMap((part) => part.links.map(({ link }) => link));
      const txids = whole.flatMap((part) => part.onchain.map(({ txid }) => txid));
      copied =
        new Set(hashes).size === hashes.length &&
        new Set(authors).size === authors.length &&
        new Set(txids).size === txids.length &&
        setDigest(hashes) === first.set &&
        setDigest(authors) === first.linkSet &&
        setDigest(txids) === first.onchainSet;
      if (copied) for (const part of whole) take(part);
    }
  }
  return {
    month,
    copied,
    sales,
    links,
    deposits,
    set: copied ? first!.set : null,
    linkSet: copied ? first!.linkSet : null,
    onchainSet: copied ? first!.onchainSet : null,
    newer: isNewer
  };
}

/**
 * The copies' records the relays of `call` hold, read page by page (one author, every month ever),
 * whole answers only: what it gives decides months for good. Never rejects: relays that did not
 * answer, or not to the end, are left out.
 */
export function fetchArchiveAnswers(
  keys: ArchiveKeys,
  call: RelayCall
): Promise<Map<string, unknown[]>> {
  return queryRelaysPaged(archiveFilter(keys), call, { whole: true, quorum: "majority" });
}
