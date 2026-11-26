import { hmac } from "@noble/hashes/hmac.js";
import { epochSealFor } from "@/lib/nostr/epochs";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

import { majority } from "@/config/registry";
import {
  INVOICE_TEXT_MAX_LENGTH,
  LINE_NAME_MAX_LENGTH,
  MAX_INVOICE_LINES,
  RECIPIENT_FIELD_MAX_LENGTH,
  REDIRECT_URL_MAX_LENGTH
} from "@/config/invoices";
import type { NostrEvent } from "@/lib/nostr/event";
import { publishToQuorum, queryRelaysPaged, type RelayCall } from "@/lib/nostr/pool";
import {
  NewerRecordError,
  RECORD_KIND,
  openRecord,
  sealRecord,
  type OpenedRecord
} from "@/lib/nostr/record";
import type { RelayFilter } from "@/lib/nostr/relay";
import { parseRelayList } from "@/lib/relays/list";
import { secureRandomBytes } from "@/lib/random";
import type { InvoiceKeys } from "@/lib/team/keys";

import { isPayable, isValidLine, type InvoiceLine } from "./amounts";

/*
 * The business's invoices ("New invoice"): one sealed record each
 * (src/lib/nostr/record.ts), signed by the invoices' author (deriveInvoiceKeys), on the account's
 * relays, written and read by the owner's devices only. A draft is saved as it is, even half
 * typed; sending it makes its payment link (src/lib/payment-link/, version 4: payable until its due
 * date) and saves the invoice again, sent, naming that link. What became of it (paid, canceled…)
 * is its link's final version: never written here.
 *
 * Changing an invoice publishes its record again, dated later (relays keep the newest event of an
 * address); removing a draft publishes a removal at its address, never a NIP-09 deletion (as the
 * catalogue's articles, src/lib/catalog/article.ts). A sent invoice is never removed: its link may
 * be paid. A record unchanged for a year is signed again as it is (upkeep.ts): its date is then
 * later than its value's `updatedAt`, which readers accept.
 */

const RECORD_TYPE = "invoice";

/** Format of an invoice's value. */
export const INVOICE_VERSION = 1;

/** Plaintexts are padded to multiples of this: the size tells little of what is in it. */
const BLOCK = 1024;

/** Its number: the year it was given in, and its rank in that year ("2026-0042"). */
export type InvoiceNumber = { year: number; sequence: number };

export type InvoiceRecipient = {
  /** Company name. */
  name: string;
  street: string;
  postalCode: string;
  city: string;
  /** ISO 3166-1 alpha-2. */
  country: string;
  /** The client's reference, "" when none. */
  reference: string;
};

/** The invoice's payment link, once sent (src/lib/payment-link/link.ts). */
export type InvoiceLink = {
  /** Hex: the link's author, which names it. */
  id: string;
  /** Hex: its sale's key, which its URL holds. */
  key: string;
  /** The relays it is on, which its URL names. */
  relays: string[];
  /** What the payer opens. */
  url: string;
};

export type Invoice = {
  version: typeof INVOICE_VERSION;
  /** 32 hex digits, random: its `d` tag derives from it. */
  id: string;
  number: InvoiceNumber;
  status: "draft" | "sent";
  recipient: InvoiceRecipient;
  /** ISO 4217, and the digits of its minor unit: every amount of the invoice is in it. */
  currency: { code: string; digits: number };
  lines: InvoiceLine[];
  /**
   * The due date, "YYYY-MM-DD" in the calendar of the device that chose it; null in a draft that
   * has none yet.
   */
  dueDate: string | null;
  /**
   * Unix seconds: the end of that day where it was chosen, when the payment link's sale ends; null
   * with `dueDate`.
   */
  dueAt: number | null;
  /** Payment conditions ("Payment terms"), "" when none. */
  terms: string;
  /** Legal notice ("Legal notices"), "" when none. */
  legal: string;
  /** Where the payer's page sends the payer once paid, null when nowhere. */
  redirectUrl: string | null;
  /** Unix seconds: when it was first saved. */
  createdAt: number;
  /** Unix seconds: its last change (`createdAt` until changed), strictly increasing. */
  updatedAt: number;
  /** Once sent: when, and its payment link. Null for a draft. */
  sent: { at: number; link: InvoiceLink } | null;
};

/** A draft removed: what its address holds from then on. */
export type InvoiceRemoval = {
  version: typeof INVOICE_VERSION;
  id: string;
  removed: true;
  /** Unix seconds: when it was removed, after its last change. The record is dated then. */
  updatedAt: number;
};

export type InvoiceEntry = Invoice | InvoiceRemoval;

export function isInvoiceRemoval(entry: InvoiceEntry): entry is InvoiceRemoval {
  return "removed" in entry;
}

const ID = /^[0-9a-f]{32}$/;
const HEX_32 = /^[0-9a-f]{64}$/;
const CURRENCY = /^[A-Z]{3}$/;
const COUNTRY = /^[A-Z]{2}$/;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A new invoice's id: 16 random bytes, hex. */
export function newInvoiceId(): string {
  return bytesToHex(secureRandomBytes(16));
}

/** "2026-0042": its year, then its rank in four digits at least. */
export function formatInvoiceNumber(number: InvoiceNumber): string {
  return `${number.year}-${String(number.sequence).padStart(4, "0")}`;
}

/** The opaque `d` tag of invoice `id`: a relay cannot tell an invoice from any other record. */
export function invoiceAddress(keys: InvoiceKeys, id: string): string {
  return bytesToHex(hmac(sha256, keys.addressKey, utf8ToBytes(`invoice/${id}`)));
}

function isUnixSeconds(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isText(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length <= max;
}

function isFilledText(value: unknown, max: number): value is string {
  return isText(value, max) && value.trim() !== "";
}

/** Whether `value` is a calendar date "YYYY-MM-DD" that exists. */
export function isCalendarDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = DATE.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    year >= 2000 &&
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/** An https URL of at most REDIRECT_URL_MAX_LENGTH characters, with a host. */
export function isRedirectUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > REDIRECT_URL_MAX_LENGTH) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname !== "";
  } catch {
    return false;
  }
}

function parseNumber(value: unknown): InvoiceNumber | null {
  if (value === null || typeof value !== "object") return null;
  const n = value as Record<string, unknown>;
  if (
    !Number.isSafeInteger(n.year) ||
    (n.year as number) < 2000 ||
    (n.year as number) > 9999 ||
    !Number.isSafeInteger(n.sequence) ||
    (n.sequence as number) < 1
  ) {
    return null;
  }
  return { year: n.year as number, sequence: n.sequence as number };
}

/** A recipient; in a draft its texts may be empty, sent its name, street, postal code, city not. */
function parseRecipient(value: unknown, sent: boolean): InvoiceRecipient | null {
  if (value === null || typeof value !== "object") return null;
  const r = value as Record<string, unknown>;
  const field = sent ? isFilledText : isText;
  if (
    !field(r.name, RECIPIENT_FIELD_MAX_LENGTH) ||
    !field(r.street, RECIPIENT_FIELD_MAX_LENGTH) ||
    !field(r.postalCode, RECIPIENT_FIELD_MAX_LENGTH) ||
    !field(r.city, RECIPIENT_FIELD_MAX_LENGTH) ||
    !isText(r.reference, RECIPIENT_FIELD_MAX_LENGTH) ||
    typeof r.country !== "string" ||
    !COUNTRY.test(r.country)
  ) {
    return null;
  }
  return {
    name: r.name,
    street: r.street,
    postalCode: r.postalCode,
    city: r.city,
    country: r.country,
    reference: r.reference
  };
}

/** A line; in a draft its designation may be empty (being typed). */
function parseLine(value: unknown, digits: number, sent: boolean): InvoiceLine | null {
  if (value === null || typeof value !== "object") return null;
  const l = value as Record<string, unknown>;
  if (
    !isText(l.name, LINE_NAME_MAX_LENGTH) ||
    typeof l.quantity !== "number" ||
    typeof l.unitMinor !== "number" ||
    typeof l.vatRate !== "number"
  ) {
    return null;
  }
  const line: InvoiceLine = {
    name: l.name,
    quantity: l.quantity,
    unitMinor: l.unitMinor,
    vatRate: l.vatRate
  };
  // A draft's line being typed: its numbers valid, its designation maybe not yet.
  const checked = sent ? line : { ...line, name: line.name.trim() === "" ? "-" : line.name };
  return isValidLine(checked, digits) ? line : null;
}

function parseLink(value: unknown): InvoiceLink | null {
  if (value === null || typeof value !== "object") return null;
  const l = value as Record<string, unknown>;
  const relays = parseRelayList(l.relays);
  if (
    typeof l.id !== "string" ||
    !HEX_32.test(l.id) ||
    typeof l.key !== "string" ||
    !HEX_32.test(l.key) ||
    relays === null ||
    typeof l.url !== "string" ||
    !l.url.startsWith("https://") ||
    l.url.length > 2000
  ) {
    return null;
  }
  return { id: l.id, key: l.key, relays, url: l.url };
}

/** What an invoice's record holds, the invoice or its removal; null when invalid. */
export function parseInvoiceEntry(value: unknown): InvoiceEntry | null {
  if (value === null || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (typeof v.version === "number" && v.version > INVOICE_VERSION) throw new NewerRecordError();
  if (v.removed === undefined) return parseInvoice(value);
  if (
    v.version !== INVOICE_VERSION ||
    v.removed !== true ||
    typeof v.id !== "string" ||
    !ID.test(v.id) ||
    !isUnixSeconds(v.updatedAt)
  ) {
    return null;
  }
  return { version: INVOICE_VERSION, id: v.id, removed: true, updatedAt: v.updatedAt };
}

/**
 * An invoice's value as a record holds it; null when invalid. A draft may be half typed; a sent
 * invoice is whole: its recipient, its lines (payable: isPayable), its due date and its link.
 * Throws for a newer version.
 */
export function parseInvoice(value: unknown): Invoice | null {
  if (value === null || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (typeof v.version === "number" && v.version > INVOICE_VERSION) throw new NewerRecordError();
  if (v.version !== INVOICE_VERSION || (v.status !== "draft" && v.status !== "sent")) return null;
  const sent = v.status === "sent";
  const currency = v.currency as Record<string, unknown> | null;
  if (
    typeof v.id !== "string" ||
    !ID.test(v.id) ||
    currency === null ||
    typeof currency !== "object" ||
    typeof currency.code !== "string" ||
    !CURRENCY.test(currency.code) ||
    !Number.isInteger(currency.digits) ||
    (currency.digits as number) < 0 ||
    (currency.digits as number) > 4 ||
    !Array.isArray(v.lines) ||
    v.lines.length > MAX_INVOICE_LINES ||
    !isText(v.terms, INVOICE_TEXT_MAX_LENGTH) ||
    !isText(v.legal, INVOICE_TEXT_MAX_LENGTH) ||
    !(v.redirectUrl === null || isRedirectUrl(v.redirectUrl)) ||
    !isUnixSeconds(v.createdAt) ||
    !isUnixSeconds(v.updatedAt) ||
    v.updatedAt < v.createdAt
  ) {
    return null;
  }
  const digits = currency.digits as number;
  const number = parseNumber(v.number);
  const recipient = parseRecipient(v.recipient, sent);
  const lines = (v.lines as unknown[]).map((line) => parseLine(line, digits, sent));
  if (!number || !recipient || lines.some((line) => line === null)) return null;
  const valid = lines as InvoiceLine[];
  // A due date and its end go together.
  const due =
    v.dueDate === null && v.dueAt === null
      ? { dueDate: null, dueAt: null }
      : isCalendarDate(v.dueDate) && isUnixSeconds(v.dueAt) && v.dueAt > 0
        ? { dueDate: v.dueDate, dueAt: v.dueAt }
        : null;
  if (!due) return null;
  let sentPart: Invoice["sent"] = null;
  if (sent) {
    const s = v.sent as Record<string, unknown> | null;
    const link = s && typeof s === "object" ? parseLink(s.link) : null;
    if (
      !s ||
      !link ||
      !isUnixSeconds(s.at) ||
      due.dueAt === null ||
      due.dueAt <= (s.at as number) ||
      !isPayable(valid, digits)
    ) {
      return null;
    }
    sentPart = { at: s.at as number, link };
  } else if (v.sent !== null) {
    return null;
  }
  return {
    version: INVOICE_VERSION,
    id: v.id,
    number,
    status: sent ? "sent" : "draft",
    recipient,
    currency: { code: currency.code as string, digits },
    lines: valid,
    dueDate: due.dueDate,
    dueAt: due.dueAt,
    terms: v.terms,
    legal: v.legal,
    redirectUrl: v.redirectUrl,
    createdAt: v.createdAt,
    updatedAt: v.updatedAt,
    sent: sentPart
  };
}

/**
 * The signed record of an invoice or of its removal, dated by its last change; `createdAt`, later,
 * for the same value signed again (upkeep.ts).
 */
export function invoiceEvent(
  keys: InvoiceKeys,
  entry: InvoiceEntry,
  createdAt: number = entry.updatedAt
): NostrEvent {
  return sealRecord({
    type: RECORD_TYPE,
    value: entry,
    signer: keys.nostr.secretKey,
    encryptionKey: keys.encryptionKey,
    address: invoiceAddress(keys, entry.id),
    createdAt,
    block: BLOCK,
    // At the export epoch of the owner's invoices (export-epochs.ts): none for an assistant's.
    epoch: epochSealFor(keys.encryptionKey)
  });
}

/**
 * Publishes an invoice's record to the relays of `call` (its author's key authenticates). Resolves
 * once a majority of them took it (the others go on in the background), rejects as soon as they no
 * longer can: saved then, as an article, and found by any read of a majority.
 */
export function publishInvoice(event: NostrEvent, call: RelayCall): Promise<void> {
  return publishToQuorum(event, call, majority(call.relays.length));
}

export type InvoicesRead = {
  /** The invoices, the newest first (by when they were created); removed drafts left out. */
  invoices: Invoice[];
  /** How many relays answered (0: none, nothing can be told). */
  answered: number;
  /** Some record was of a newer format: a newer app of the owner's wrote it. */
  newerUnreadable: boolean;
};

/**
 * What relays hold of the invoices of `keys`: every record of their author (the counter of their
 * numbers among them, counter.ts, left aside when read).
 */
export function invoicesFilter(keys: InvoiceKeys): RelayFilter {
  return { kinds: [RECORD_KIND], authors: [keys.nostr.publicKey] };
}

/**
 * What a relay sent, if it is the record of an invoice or of its removal of `keys` (openRecord:
 * author, decryption, type, signature, and its `d` tag that of its id); null otherwise.
 */
export function openInvoiceRecord(
  keys: InvoiceKeys,
  value: unknown
): OpenedRecord<InvoiceEntry> | null {
  return openRecord(value, {
    type: RECORD_TYPE,
    encryptionKey: keys.encryptionKey,
    address: () => true,
    author: keys.nostr.publicKey,
    parse: (payload, event) => {
      const entry = parseInvoiceEntry(payload);
      const address = event.tags.find(([name]) => name === "d")?.[1];
      return entry && address === invoiceAddress(keys, entry.id) ? entry : null;
    }
  });
}

/**
 * Every invoice the relays of `call` hold, read page by page until a majority answered (invoicesOf).
 * Never rejects.
 */
export async function fetchInvoices(keys: InvoiceKeys, call: RelayCall): Promise<InvoicesRead> {
  const answers = await queryRelaysPaged(invoicesFilter(keys), call, { quorum: "majority" });
  return { ...invoicesOf(keys, [...answers.values()].flat()), answered: answers.size };
}

/**
 * The invoices among the events relays sent: each copy is checked (openRecord: author, decryption,
 * type, `d` tag against its id, signature); of an invoice on several relays, the newest copy. An
 * invoice a newer app changed since is left out, as an article (articlesOf).
 */
export function invoicesOf(
  keys: InvoiceKeys,
  events: readonly unknown[]
): Omit<InvoicesRead, "answered"> {
  const newest = new Map<string, { event: NostrEvent; entry: InvoiceEntry }>();
  const newer = new Map<string, number>();
  const checked = new Set<string>();
  let newerUnreadable = false;
  for (const value of events) {
    const id = (value as { id?: unknown } | null)?.id;
    if (typeof id === "string" && checked.has(id)) continue;
    const opened = openInvoiceRecord(keys, value);
    if (!opened) continue;
    checked.add(opened.event.id);
    if (opened.status === "newer") {
      newerUnreadable = true;
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
      newest.set(opened.value.id, { event: opened.event, entry: opened.value });
    }
  }
  const invoices = [...newest.values()]
    .filter(({ event, entry }) => {
      const newerAt = newer.get(invoiceAddress(keys, entry.id));
      return newerAt === undefined || newerAt < event.created_at;
    })
    .flatMap(({ entry }) => (isInvoiceRemoval(entry) ? [] : [entry]))
    .sort((a, b) => b.createdAt - a.createdAt || (a.id < b.id ? -1 : 1));
  return { invoices, newerUnreadable };
}
