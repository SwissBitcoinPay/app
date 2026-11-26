import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

import { ISSUER_NUMBER } from "@/lib/card/card-record";

import { cutNote } from "./history";
import { request, type LegacyServerOptions } from "./server";

/*
 * The history of a v2 card, read on the v2 server once the card
 * migrated to sattle.me, to be copied for information to the account's relays
 * (src/features/card/legacy-history.ts) and shown in the card's "History" among its sattle.me
 * movements: never in its balance nor its limits.
 *
 * Read with the v2 card portal's own route (`GET /v1/apipayments/by-card`): the card named by the
 * number printed on it (header `card-id`), its PIN in the header `pin-code` when its holder set one
 * on the v2 portal (403 `pin_required` without it, 403 `invalid_pin` for a wrong one, 429
 * `pin_locked` after five wrong ones: the server's own throttle, by card). It lists every payment
 * of the card's v2 wallet, newest first, `limit` (at most 200) from `offset`. A card closed for its
 * migration still answers.
 *
 * What is kept of each: the settled ones only, that moved something (`amount_sat` ≠ 0): what left
 * the card (a tap at a merchant or a wallet, a Lightning address bought: `amount_sat` < 0, the v2
 * server's own sign) and what came to it (a recharge, in any way). Its date (paid, else made), its
 * sats, its fee (millisatoshis, as the v2 server counts them: a recharge's deducted, a payment's on
 * top), and its note: its description, as the v2 card portal showed it (what its payer wrote with a
 * recharge to the card's Lightning address, LUD-12, the Lightning address a payment bought…). Never
 * its title: the v2 apps and server write their own labels there ("🇨🇭 Swiss Bitcoin Pay Card" on
 * every tap, "Card top-up", "Card <name>"…). Nothing else of a payer. Every row is untrusted: one
 * out of shape is left out, never guessed.
 */

/** What a row of a v2 card's history is: what left the card, or what came to it. */
export type LegacyCardRowKind = "payment" | "recharge";

/** A row of a v2 card's history, as its copy keeps it. Amounts exact. */
export type LegacyCardRow = {
  /** Hex: SHA-256 of the v2 payment's id (legacyCardRowRef): stable, the id itself not kept. */
  ref: string;
  kind: LegacyCardRowKind;
  /** Unix seconds: when it was paid, else when it was made. */
  at: number;
  /** Its amount on the v2 server, in sats, unsigned. */
  sats: bigint;
  /** Its fee on the v2 server, in millisatoshis: a recharge's deducted, a payment's on top. */
  feeMsat: bigint;
  /**
   * What its sats were worth then (src/features/card/legacy-history.ts): at the v2 server's price
   * of bitcoin nearest its date, in the account's display currency of the copy, rounded to the
   * nearest minor unit. Null when no price was near enough: its sats alone show.
   */
  value: { minor: number; digits: number; currency: string } | null;
  /** Its description on the v2 server, trimmed and cut (cutNote); "" when none. */
  note: string;
};

/** Rows asked per page: the most the v2 server gives. */
export const CARD_HISTORY_PAGE_SIZE = 200;

/** Pages read at most: 100 000 rows, far beyond a card's; a server that never ends stops there. */
const MAX_PAGES = 500;

/** Readings of the whole list at most until two in a row agree (fetchLegacyCardHistory). */
const MAX_READINGS = 4;

/** A v2 id longer than this is no id of the v2 server (a UUID, however written). */
const MAX_ID_LENGTH = 100;

/** Bitcoin's first block (3 January 2009, 18:15:05 UTC): no payment is older. */
const FIRST_BLOCK_SECONDS = 1_231_006_505;
/** The last second of year 9999: a date the copies' records can still hold. */
const LAST_SECONDS = 253_402_300_799;

/**
 * A PIN of the v2 portal: 4 to 8 characters (`PATCH /v1/cards/me` of the v2 server, which
 * takes any string of that length: not only digits), visible ASCII (a header's value).
 */
export const LEGACY_PIN = /^[\x21-\x7e]{4,8}$/;

export type LegacyCardHistoryErrorCode =
  /** The card has a PIN on the v2 portal: its history is read with it only. */
  | "pinRequired"
  /** The PIN given is not the card's. */
  | "pinInvalid"
  /** Too many wrong PINs: the v2 server refuses the card's for a while (a minute to an hour). */
  | "pinLocked"
  /** The v2 server knows no card of that number. */
  | "unknownCard"
  /** No answer, an HTTP error, a timeout, the server's rate limit. */
  | "network"
  /** An answer out of shape, or a list that never settled. */
  | "invalidResponse";

export class LegacyCardHistoryError extends Error {
  readonly code: LegacyCardHistoryErrorCode;

  constructor(code: LegacyCardHistoryErrorCode, message: string) {
    super(message);
    this.name = "LegacyCardHistoryError";
    this.code = code;
  }
}

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** The copy's reference of a v2 card's payment: SHA-256 of its id, its domain first. */
export function legacyCardRowRef(id: string): string {
  return bytesToHex(sha256(utf8ToBytes(`sattle.me/legacy-v2/card-payment/${id}`)));
}

/** A date of the v2 server, Unix seconds; null when out of shape or out of range. */
function seconds(value: unknown): number | null {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= FIRST_BLOCK_SECONDS &&
    value <= LAST_SECONDS
    ? value
    : null;
}

/** What readRow says of a row the history leaves out on purpose (not settled, nothing moved). */
const OUT_OF_SCOPE = Symbol("out of scope");

/** A row of the card's history; OUT_OF_SCOPE when left out on purpose; null when out of shape. */
function readRow(value: unknown): LegacyCardRow | typeof OUT_OF_SCOPE | null {
  if (!isObject(value)) return null;
  const { id, status, amount_sat: amount, fee_msat: fee } = value;
  if (typeof id !== "string" || id.length === 0 || id.length > MAX_ID_LENGTH) return null;
  if (typeof status !== "string") return null;
  if (status !== "settled") return OUT_OF_SCOPE;
  if (typeof amount !== "number" || !Number.isSafeInteger(amount)) return null;
  if (amount === 0) return OUT_OF_SCOPE;
  if (typeof fee !== "number" || !Number.isSafeInteger(fee) || fee < 0) return null;
  // Settled, at a date out of shape (in milliseconds, before Bitcoin): never read as another.
  const paid =
    value.paid_at === null || value.paid_at === undefined ? null : seconds(value.paid_at);
  if (value.paid_at !== null && value.paid_at !== undefined && paid === null) return null;
  const at = paid ?? seconds(value.created_at);
  if (at === null) return null;
  return {
    ref: legacyCardRowRef(id),
    kind: amount < 0 ? "payment" : "recharge",
    at,
    sats: BigInt(Math.abs(amount)),
    feeMsat: BigInt(fee),
    value: null,
    note: typeof value.description === "string" ? cutNote(value.description) : ""
  };
}

/** A row of `GET /v1/apipayments/by-card` as the copy keeps it; null when left out (see above). */
export function parseLegacyCardPayment(value: unknown): LegacyCardRow | null {
  const read = readRow(value);
  return read === OUT_OF_SCOPE ? null : read;
}

/** The error the v2 server's refusal (`status`, its `{ error }` body) says. */
function refusalOf(status: number, body: unknown, path: string): LegacyCardHistoryError {
  const key = isObject(body) && typeof body.error === "string" ? body.error : null;
  if (status === 403 && key === "pin_required") {
    return new LegacyCardHistoryError("pinRequired", `${path}: PIN required`);
  }
  if (status === 403 && key === "invalid_pin") {
    return new LegacyCardHistoryError("pinInvalid", `${path}: wrong PIN`);
  }
  if (status === 429 && key === "pin_locked") {
    return new LegacyCardHistoryError("pinLocked", `${path}: PIN locked`);
  }
  if (
    (status === 404 && key === "card_not_found") ||
    (status === 400 && (key === "invalid_card_id" || key === "missing_card_id"))
  ) {
    return new LegacyCardHistoryError("unknownCard", `${path}: unknown card`);
  }
  return new LegacyCardHistoryError("network", `${path}: HTTP ${status}`);
}

/** One page of the card's payments: every one of its records, whatever its status. */
type Page = { records: unknown[]; limit: number };

async function fetchPage(
  number: string,
  pin: string | null,
  offset: number,
  options: LegacyServerOptions
): Promise<Page> {
  const path = "/v1/apipayments/by-card";
  const query = new URLSearchParams({
    limit: String(CARD_HISTORY_PAGE_SIZE),
    offset: String(offset)
  });
  const { status, body } = await request(
    `${path}?${query.toString()}`,
    {
      method: "GET",
      headers: { "card-id": number, ...(pin !== null ? { "pin-code": pin } : {}) }
    },
    options
  ).catch(() => {
    // request's error names the path only: never the card's number nor its PIN.
    throw new LegacyCardHistoryError("network", `GET ${path} failed`);
  });
  if (status !== 200) throw refusalOf(status, body, path);
  if (!isObject(body) || !Array.isArray(body.payments)) {
    throw new LegacyCardHistoryError("invalidResponse", `${path}: out of shape`);
  }
  const { limit } = body;
  if (typeof limit !== "number" || !Number.isSafeInteger(limit) || limit < 1) {
    throw new LegacyCardHistoryError("invalidResponse", `${path}: out of shape`);
  }
  // More than asked, or more than its own limit: not the route's answer.
  if (body.payments.length > Math.min(limit, CARD_HISTORY_PAGE_SIZE)) {
    throw new LegacyCardHistoryError("invalidResponse", `${path}: too many rows`);
  }
  return { records: body.payments as unknown[], limit };
}

/** One reading of the whole list: its rows in scope by ref, every record's id, those out of shape. */
type Reading = { rows: Map<string, LegacyCardRow>; ids: string; invalid: number };

async function readWhole(
  number: string,
  pin: string | null,
  options: LegacyServerOptions
): Promise<Reading> {
  const rows = new Map<string, LegacyCardRow>();
  const ids: string[] = [];
  let invalid = 0;
  let offset = 0;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const { records, limit } = await fetchPage(number, pin, offset, options);
    for (const record of records) {
      const id = isObject(record) && typeof record.id === "string" ? record.id : "";
      ids.push(id);
      const row = readRow(record);
      if (row === null) invalid += 1;
      else if (row !== OUT_OF_SCOPE) rows.set(row.ref, row);
    }
    // The last page is a short one (the server's own page size, which may be below what was
    // asked): an empty one after a full one ends it too.
    if (records.length < Math.min(limit, CARD_HISTORY_PAGE_SIZE)) {
      return { rows, ids: [...ids].sort().join("\n"), invalid };
    }
    offset += records.length;
  }
  throw new LegacyCardHistoryError("invalidResponse", "The card's history never ends");
}

/** What a read of a v2 card's history gave. */
export type LegacyCardHistory = {
  /** Its rows in scope (see above), any order, each once. */
  rows: LegacyCardRow[];
  /** How many of its records were out of shape: left out, never guessed. */
  invalid: number;
};

/**
 * The whole history of the v2 card printed `number` (ISSUER_NUMBER), with its v2 `pin` when its
 * holder set one (null: none given). The list is paged by offset, newest first, on a server whose
 * jobs delete rows (an abandoned tap's reservation, an invoice expired): a row deleted while it is
 * read shifts the next pages, and one row would be missed. So the whole list is read again until
 * two readings in a row list the very same records, at most MAX_READINGS times. Rejects
 * LegacyCardHistoryError.
 */
export async function fetchLegacyCardHistory(
  number: string,
  pin: string | null,
  options: LegacyServerOptions = {}
): Promise<LegacyCardHistory> {
  if (!ISSUER_NUMBER.test(number)) {
    throw new LegacyCardHistoryError("unknownCard", "Not the number of a v2 card");
  }
  if (pin !== null && !LEGACY_PIN.test(pin)) {
    // Never sent: the v2 server would count it as a wrong one.
    throw new LegacyCardHistoryError("pinInvalid", "Not a PIN of the v2 portal");
  }
  let before = await readWhole(number, pin, options);
  for (let reading = 1; reading < MAX_READINGS; reading += 1) {
    const again = await readWhole(number, pin, options);
    if (again.ids === before.ids) return { rows: [...again.rows.values()], invalid: again.invalid };
    before = again;
  }
  throw new LegacyCardHistoryError("invalidResponse", "The card's history kept changing");
}
