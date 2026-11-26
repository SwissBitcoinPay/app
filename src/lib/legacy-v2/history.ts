import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

import { currencyDigits, rateToFraction } from "@/lib/terminal/amount";

import {
  LegacyServerError,
  refusal,
  request,
  type LegacyServerOptions,
  type LegacySession
} from "./server";

/*
 * The history of a v2 account, read on the v2 server with its
 * owner's session to be copied, for information only, to the account's relays (src/features/
 * migration/history-import.ts): it never touches the balance of the account's wallet.
 *
 * What is copied: what the v2 server's accounting export holds (the settled sales,
 * `amount_sat` ≥ 0, without the bank transfers `fiat-withdraw`), plus the bitcoin payouts to the
 * merchant's wallet (`withdraw`) and the referral fees (`referral-fees`). Nothing else: no invoice
 * not paid, no webhook, no bank account, no payer's data.
 *
 * Read with the v2 app's own route: TrailBase's Record API `apipayments` (`GET /api/records/v1/
 * apipayments`), which gives an owner the payments of their wallets only, page by page by its
 * primary key (a UUID v7: in the order they were made), at most 1 024 a page (TrailBase's bound).
 * Every row is untrusted: one out of shape is left out, never guessed.
 */

/** Rows asked per page: below TrailBase's bound of 1 024, few requests for a year of sales. */
export const HISTORY_PAGE_SIZE = 1_000;

/** What a row of the copy is. */
export type LegacyHistoryKind =
  /** A payment received for a sale: `channel` tells where it was made. */
  | "sale"
  /** A payout of bitcoin to the merchant's own wallet (`withdraw`): money that left. */
  | "withdraw"
  /** A referral fee the v2 service paid the merchant (`referral-fees`). */
  | "referral"
  /**
   * Money received that no sale asked for: a row of the accounting export the v2 server wrote
   * itself (a tag of its own: a deposit to the Lightning address, a top-up…), never an
   * integration's sale.
   */
  | "receipt";

/**
 * Where a sale was made, by its tag: the v2 app's point of sale (`invoice-tpos`), an invoice of the
 * v2 dashboard (`invoice-web`), anything else an integration's (a shop's plugin, the v2 API).
 */
export type LegacySaleChannel = "pos" | "link" | "integration";

/** A row of a v2 account's history, as the copy keeps it. Amounts exact. */
export type LegacyHistoryRow = {
  /** Hex: SHA-256 of the v2 payment's id (legacyRowRef): stable, and the id itself is not kept. */
  ref: string;
  kind: LegacyHistoryKind;
  /** A sale's; null for the others. */
  channel: LegacySaleChannel | null;
  /** Unix seconds: when it was paid (a sale), else when it was made. */
  at: number;
  /** What moved, in sats, unsigned: received (a sale, a fee), or sent (a payout). */
  sats: bigint;
  /**
   * The amount in fiat the sale was asked in (its `input`), to the minor unit of its currency, the
   * v2 server's decimal number rounded half up; null when it was
   * asked in bitcoin, or for a payout or a fee.
   */
  fiat: { minor: number; digits: number; currency: string } | null;
  /**
   * The price of 1 BTC the v2 server recorded nearest its date, in the point of sale's currency
   * (history-import.ts): what its sats were worth then, as a payment rate of the account's own
   * movements (src/lib/rates/payment-rates.ts). A price, never an amount; null when none is near.
   */
  rate: { price: number; currency: string } | null;
  /** What its merchant or its payer wrote of it, as the v2 apps showed it (noteOf); "" when none. */
  note: string;
};

/** Longest note kept: the v2 apps' notes stop far below. */
export const MAX_NOTE_LENGTH = 200;

/**
 * `text` trimmed and cut to MAX_NOTE_LENGTH (UTF-16 units, as the copies' validators count), never
 * through a character beyond the BMP (an emoji): the first half of its pair alone is no text.
 */
export function cutNote(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= MAX_NOTE_LENGTH) return trimmed;
  const cut = trimmed.slice(0, MAX_NOTE_LENGTH);
  return (/[\uD800-\uDBFF]$/.test(cut) ? cut.slice(0, -1) : cut).trimEnd();
}

/** A v2 id longer than this is no id of the v2 server (a UUID, however written). */
const MAX_ID_LENGTH = 100;

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** A JSON column as the Record API gives it: an object, or (an older server) its text. */
function jsonColumn(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

/** Bitcoin's first block (3 January 2009, 18:15:05 UTC): no payment is older. */
const FIRST_BLOCK_SECONDS = 1_231_006_505;
/** The last second of year 9999: a date the copy's months ("YYYY-MM") can still name. */
const LAST_SECONDS = 253_402_300_799;

/**
 * A date of the v2 server, Unix seconds; null when out of shape or out of any month the copy can
 * name (a single such row would stop the whole copy: history-records.ts refuses its month).
 */
function seconds(value: unknown): number | null {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= FIRST_BLOCK_SECONDS &&
    value <= LAST_SECONDS
    ? value
    : null;
}

/** The copy's reference of a v2 payment: SHA-256 of its id, its domain first. */
export function legacyRowRef(id: string): string {
  return bytesToHex(sha256(utf8ToBytes(`sattle.me/legacy-v2/payment/${id}`)));
}

/**
 * `amount` (the v2 server's JSON number) in minor units of a currency of `digits`, rounded half
 * up: computed on the integers of its shortest decimal (rateToFraction), never on a float. Null
 * when it is no amount, or beyond a safe integer.
 */
export function decimalToMinor(amount: number, digits: number): number | null {
  // Beyond a safe integer, no amount of a sale (and no decimal rateToFraction can expand).
  if (!Number.isFinite(amount) || amount < 0 || amount > Number.MAX_SAFE_INTEGER) return null;
  if (amount === 0) return 0;
  const { numerator, denominator } = rateToFraction(amount);
  const scaled = numerator * 10n ** BigInt(digits);
  const minor = (2n * scaled + denominator) / (2n * denominator);
  return minor <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(minor) : null;
}

/**
 * The tags the v2 server writes itself, compared as it does (exactly, case included), but the ones
 * read above (`withdraw`, `referral-fees`, `fiat-withdraw`): a merchant's sale never carries one
 * (`POST /checkout` refuses them).
 */
const SERVER_TAGS: ReadonlySet<string> = new Set([
  "onchain-deposit",
  "swap",
  "lightning-deposit",
  "lightning-address-deposit",
  "lnurlw-qr-topup",
  "fees",
  "deposit",
  "register-ln-address"
]);

/** A sale's `input`, when asked in a fiat currency: its amount to the minor unit. */
function fiatOf(input: unknown): LegacyHistoryRow["fiat"] {
  const value = jsonColumn(input);
  if (!isObject(value)) return null;
  const { unit, amount } = value;
  if (typeof unit !== "string" || typeof amount !== "number") return null;
  const currency = unit.trim().toUpperCase();
  // "sat", "BTC": asked in bitcoin, its sats are the amount.
  if (!/^[A-Z]{3}$/.test(currency) || currency === "BTC" || currency === "SAT") return null;
  const digits = currencyDigits(currency);
  const minor = decimalToMinor(amount, digits);
  return minor === null ? null : { minor, digits, currency };
}

/** A text column of the v2 server, trimmed; "" when it is none. */
function textOf(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Between the two parts of a note the v2 dashboard showed apart (a title and a description). */
const NOTE_JOIN = " — ";

/**
 * The note of a row, as the v2 apps showed it (SwissBitcoinPay/app's point of sale and history,
 * `usePostInvoice.ts` and `History.tsx`; the v2 dashboard's activity): what the merchant or the
 * payer wrote, never a label the v2 apps or server wrote themselves. `accountName`: the v2
 * account's name (`GET /account`), null when unknown.
 * - A sale of the point of sale: its description, the v2 app's note. Its title is the account's
 *   name (`title: name`), or in older rows "<name> - <note>", whose note the dashboard showed.
 * - An invoice of the dashboard, an integration's sale: their title (typed, or the integration's;
 *   the account's name when none was given, the v2 server's default) and their description, both,
 *   as the dashboard showed them.
 * - Any other row (a payout, a referral fee, money the server received itself): as a sale of the
 *   point of sale (a Lightning address's comment, LUD-12, is its description); its title is the
 *   v2 server's own label.
 */
function noteOf(
  row: Json,
  kind: LegacyHistoryKind,
  channel: LegacySaleChannel | null,
  accountName: string | null
): string {
  const description = textOf(row.description);
  const title = textOf(row.title);
  const name = accountName?.trim() || null;
  // What the account's name leaves of a title "<name> - <note>": its note (null: no such title).
  const prefix = name === null ? null : `${name} - `;
  const rest =
    prefix !== null && title.startsWith(prefix) ? title.slice(prefix.length).trim() : null;
  if (kind !== "sale" || channel === "pos") return cutNote(description || (rest ?? ""));
  // The account's name alone is the v2 server's default title: no note.
  const own = rest ?? (title === name ? "" : title);
  const parts = own === description ? [own] : [own, description];
  return cutNote(parts.filter((part) => part !== "").join(NOTE_JOIN));
}

/**
 * A row of `GET /api/records/v1/apipayments` as the copy keeps it, of the v2 account named
 * `accountName` (noteOf; null: unknown): null when it is out of the history's scope (see above),
 * or out of shape.
 */
export function parseLegacyPayment(
  value: unknown,
  accountName: string | null = null
): LegacyHistoryRow | null {
  const read = readPayment(value, accountName);
  return read === OUT_OF_SCOPE ? null : read;
}

/** What readPayment says of a row the history leaves out on purpose (see above). */
const OUT_OF_SCOPE = Symbol("out of scope");

/** A row of the history; OUT_OF_SCOPE when the history leaves it out; null when out of shape. */
function readPayment(
  value: unknown,
  accountName: string | null
): LegacyHistoryRow | typeof OUT_OF_SCOPE | null {
  if (!isObject(value)) return null;
  const { id, status, tag, amount_sat: amount } = value;
  if (typeof id !== "string" || id.length === 0 || id.length > MAX_ID_LENGTH) return null;
  if (status !== "settled") return OUT_OF_SCOPE;
  if (typeof amount !== "number" || !Number.isSafeInteger(amount)) return null;
  if (tag !== undefined && tag !== null && typeof tag !== "string") return null;
  const paid = seconds(value.paid_at);
  const made = seconds(value.created_at);
  const ref = legacyRowRef(id);
  const note = (kind: LegacyHistoryKind, channel: LegacySaleChannel | null) => ({
    ref,
    note: noteOf(value, kind, channel, accountName)
  });
  if (tag === "withdraw") {
    if (amount > 0) return OUT_OF_SCOPE;
    const at = paid ?? made;
    if (at === null) return null;
    return {
      ...note("withdraw", null),
      kind: "withdraw",
      channel: null,
      at,
      sats: BigInt(-amount),
      fiat: null,
      rate: null
    };
  }
  if (tag === "referral-fees") {
    // The v2 server writes them without a date of payment: when it made them.
    if (amount < 0) return OUT_OF_SCOPE;
    const at = paid ?? made;
    if (at === null) return null;
    return {
      ...note("referral", null),
      kind: "referral",
      channel: null,
      at,
      sats: BigInt(amount),
      fiat: null,
      rate: null
    };
  }
  // The accounting export's scope: paid, received, not a bank transfer.
  if (tag === "fiat-withdraw" || amount < 0) return OUT_OF_SCOPE;
  if (value.paid_at === null || value.paid_at === undefined) return OUT_OF_SCOPE;
  // Paid, at a date out of shape (in milliseconds, before Bitcoin): never read as another.
  if (paid === null) return null;
  if (typeof tag === "string" && SERVER_TAGS.has(tag)) {
    return {
      ...note("receipt", null),
      kind: "receipt",
      channel: null,
      at: paid,
      sats: BigInt(amount),
      fiat: fiatOf(value.input),
      rate: null
    };
  }
  const channel: LegacySaleChannel =
    tag === "invoice-tpos" ? "pos" : tag === "invoice-web" ? "link" : "integration";
  return {
    ...note("sale", channel),
    kind: "sale",
    channel,
    at: paid,
    sats: BigInt(amount),
    fiat: fiatOf(value.input),
    rate: null
  };
}

/**
 * One page of the history: its rows in scope, how many records it read, how many of them were out
 * of shape (left out: never guessed; the copy says so in the journal), and where the next page
 * starts (null: the last).
 */
export type LegacyHistoryPage = {
  rows: LegacyHistoryRow[];
  read: number;
  invalid: number;
  cursor: string | null;
};

/**
 * One page of the account's settled payments (`filter[status]=settled`), after `cursor` (from the
 * first one when null), with the owner's `session`, the v2 account named `accountName` (its notes:
 * noteOf; null: unknown). Rejects LegacyServerError: `refused` once the session's token expired
 * (renew it and ask again), `network`, `invalidResponse`.
 */
export async function fetchLegacyHistoryPage(
  session: LegacySession,
  cursor: string | null,
  accountName: string | null,
  options: LegacyServerOptions = {}
): Promise<LegacyHistoryPage> {
  const path = "/api/records/v1/apipayments";
  const query = new URLSearchParams({ limit: String(HISTORY_PAGE_SIZE) });
  query.append("filter[status]", "settled");
  if (cursor !== null) query.append("cursor", cursor);
  const { status, body } = await request(
    `${path}?${query.toString()}`,
    { method: "GET", headers: { Authorization: `Bearer ${session.authToken}` } },
    options
  );
  if (status !== 200) throw refusal(status, path);
  if (!isObject(body) || !Array.isArray(body.records)) {
    throw new LegacyServerError("invalidResponse", `${path}: out of shape`);
  }
  const next = body.cursor;
  if (next !== undefined && next !== null && (typeof next !== "string" || next.length > 200)) {
    throw new LegacyServerError("invalidResponse", `${path}: out of shape`);
  }
  const records = body.records as unknown[];
  const rows: LegacyHistoryRow[] = [];
  let invalid = 0;
  for (const record of records) {
    const row = readPayment(record, accountName);
    if (row === null) invalid += 1;
    else if (row !== OUT_OF_SCOPE) rows.push(row);
  }
  // The last page is the empty one, or one without a cursor: a short page is not taken for the
  // last (a server may answer less than it was asked), never a row missed.
  const last = records.length === 0 || typeof next !== "string" || next === "";
  return { rows, read: records.length, invalid, cursor: last ? null : (next as string) };
}

/** A price of bitcoin the v2 server recorded (`btc_price_history`), in `unit` per BTC. */
export type LegacyRatePoint = { time: number; price: number };

/**
 * The prices of bitcoin in `unit` the v2 server recorded between `start` and `end` (Unix seconds,
 * both included; `GET /v1/rates/history`, public: about one every 10 minutes), as it answers them.
 * Rejects LegacyServerError `network` or `invalidResponse`.
 */
export async function fetchLegacyRates(
  unit: string,
  start: number,
  end: number,
  options: LegacyServerOptions = {}
): Promise<LegacyRatePoint[]> {
  const path = "/v1/rates/history";
  const query = new URLSearchParams({ unit, start: String(start), end: String(end) });
  const { status, body } = await request(`${path}?${query.toString()}`, { method: "GET" }, options);
  if (status !== 200) throw new LegacyServerError("network", `${path}: HTTP ${status}`);
  if (!isObject(body) || !Array.isArray(body.points) || body.unit !== unit) {
    throw new LegacyServerError("invalidResponse", `${path}: out of shape`);
  }
  const points: LegacyRatePoint[] = [];
  for (const point of body.points as unknown[]) {
    if (!isObject(point)) continue;
    const time = seconds(point.time);
    const { price } = point;
    if (time === null || typeof price !== "number" || !Number.isFinite(price) || price <= 0) {
      continue;
    }
    points.push({ time, price });
  }
  return points.sort((a, b) => a.time - b.time);
}

/** A price further than this from a payment is no price of that payment. */
export const RATE_TOLERANCE_SECONDS = 24 * 60 * 60;

/**
 * The price of `points` (ascending) nearest `at`, within RATE_TOLERANCE_SECONDS (of two as near,
 * the earlier); null when none is.
 */
export function rateAt(points: readonly LegacyRatePoint[], at: number): number | null {
  let low = 0;
  let high = points.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (points[middle]!.time < at) low = middle + 1;
    else high = middle;
  }
  const after = points[low];
  const before = points[low - 1];
  const best = before && (!after || at - before.time <= after.time - at) ? before : (after ?? null);
  return best && Math.abs(best.time - at) <= RATE_TOLERANCE_SECONDS ? best.price : null;
}
