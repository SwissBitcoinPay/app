import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

import { isWalletGeneration } from "./keys";

/*
 * The head of a month's copy of a card's history (history-months.ts): the hash of the entries the
 * copy holds (each tap and movement of the card's wallet that month, with the revision copied: its
 * set, which names its parts' addresses) and how many parts hold them. A small record of the
 * history's author (history-records.ts), read with the taps and movements: a device knows from it,
 * without reading the parts, which months are copied and since when; which entries, from the parts.
 * Never their list: it grows with the month, and past some 950 taps it would go over the 64 kB a
 * relay takes, the month never copied. Pure.
 *
 * IRREVERSIBLE: the format (MONTH_FORMAT_VERSION) and the set's hash.
 */

/** 1. A change needs a new version, which the older apps read as "newer". */
export const MONTH_FORMAT_VERSION = 1;

/** More parts than a month of any card: anything above is refused rather than read. */
export const MAX_MONTH_PARTS = 2_000;

/** A month, in UTC: "YYYY-MM". */
const MONTH = /^([0-9]{4})-(0[1-9]|1[0-2])$/;
const CARD_ID = /^[0-9a-f]{32}$/;
const HEX_32 = /^[0-9a-f]{64}$/;

/**
 * An entry of a month's copy: a tap (`t`, by its id) or a movement (`m`, its key), its revision.
 */
export type MonthEntry = [kind: "t" | "m", key: string, revision: number];

export type MonthHead = {
  cardId: string;
  /** The generation of the card's wallet whose month it is (keys.ts, CardWalletOf). */
  walletGeneration: number;
  /** "YYYY-MM", in UTC: the month of its entries' times. */
  month: string;
  /** How many parts hold the copy (1 at least). */
  parts: number;
  /** Hex: the hash of the copy's entries (monthSet), which its parts hold. */
  set: string;
};

/** The month (UTC) of a time in ms. */
export function monthOf(at: number): string {
  const date = new Date(at);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Whether `month` is one ("YYYY-MM", UTC). */
export function isMonth(value: unknown): value is string {
  return typeof value === "string" && MONTH.test(value);
}

/** When `month` ends (ms): the first instant of the next one, in UTC. */
export function monthEnd(month: string): number {
  const [, year, number] = MONTH.exec(month)!;
  return Date.UTC(Number(year), Number(number), 1);
}

function compareEntries(a: MonthEntry, b: MonthEntry): number {
  if (a[0] !== b[0]) return a[0] < b[0] ? -1 : 1;
  if (a[1] !== b[1]) return a[1] < b[1] ? -1 : 1;
  return a[2] - b[2];
}

/** `entries` in the order every device lists them: by kind, then key (code units). */
export function sortedEntries(entries: readonly MonthEntry[]): MonthEntry[] {
  return [...entries].sort(compareEntries);
}

/** The hash of a copy's entries (sortedEntries): hex, one line per entry. */
export function monthSet(entries: readonly MonthEntry[]): string {
  const lines = sortedEntries(entries)
    .map(([kind, key, revision]) => `${kind}:${key}:${revision}\n`)
    .join("");
  return bytesToHex(sha256(utf8ToBytes(lines)));
}

/** A head's value, as written. */
export function monthHeadValue(head: MonthHead): Record<string, unknown> {
  return { version: MONTH_FORMAT_VERSION, ...head };
}

/**
 * A head, checked whole; null when out of shape. Of a newer version: `newer`. Its set is checked
 * against its parts' entries when they are read (monthCopyOf).
 */
export function parseMonthHead(value: unknown): MonthHead | "newer" | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.version === "number" && v.version > MONTH_FORMAT_VERSION) return "newer";
  if (
    v.version !== MONTH_FORMAT_VERSION ||
    typeof v.cardId !== "string" ||
    !CARD_ID.test(v.cardId) ||
    !isWalletGeneration(v.walletGeneration) ||
    !isMonth(v.month) ||
    typeof v.parts !== "number" ||
    !Number.isInteger(v.parts) ||
    v.parts < 1 ||
    v.parts > MAX_MONTH_PARTS ||
    typeof v.set !== "string" ||
    !HEX_32.test(v.set)
  ) {
    return null;
  }
  return {
    cardId: v.cardId,
    walletGeneration: v.walletGeneration,
    month: v.month,
    parts: v.parts,
    set: v.set
  };
}
