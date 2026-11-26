import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

import type { NostrEvent } from "@/lib/nostr/event";
import {
  NewerRecordError,
  RECORD_KIND,
  newestRecord,
  openRecord,
  sealRecord,
  type NewestRecord
} from "@/lib/nostr/record";
import type { RelayFilter } from "@/lib/nostr/relay";
import { isExportEpoch } from "@/lib/team/export-epoch";
import { isMemberId } from "@/lib/team/keys";
import { isName, isPublicKey, isUnixSeconds } from "@/lib/team/shared";

/*
 * The owner's grant of the transactions' export to an assistant: an assistant the owner allows
 * reads on the relays what "Wallet › Export" lists (the sales of the points of sale, of the
 * payment links, of the invoices and of
 * the integrations, the wallet's sendings, the rates), with the reading keys this grant gives it,
 * never a key that signs, spends or reads the wallet. Two records, both signed by the team (the
 * assistant's key names it) and sealed with the assistant's own keys (deriveAssistantKeys'
 * `exportGrant`), so that only the assistant and the owner read them:
 *
 * - the **decision** (`assistant-export`): whether the owner allows it, dated when it chose. Only
 *   an explicit choice of the owner writes it; an assistant never exports without one that allows
 *   it, newest on its relays;
 * - the **keys**, in parts (`assistant-export-keys`, each under 40 kB, as the archive's), naming the
 *   decision they were written for (`grantedAt`): an assistant reads them only with the decision of
 *   that date. The owner's devices write them again when the team changes (a seat added or removed,
 *   a device that took payments), and clear them once the owner withdraws the grant.
 *
 * Withdrawing stops an assistant that keeps to the decision (the hosted server reads it at each
 * export and keeps nothing). Whoever copied the keys while it was allowed can still read with them,
 * as an assistant's removal leaves its invoices readable to its key's holder (assistant/keys.ts).
 *
 * From the account's first export epoch (src/lib/team/export-epoch.ts: each grant that ends
 * raises it), the keys are of format 2: the account's part names
 * the epoch and its seed (`epoch`), from which an assistant derives the keys of the records sealed
 * at that epoch and the ones before it, never after: a grant withdrawn reads nothing written once
 * it ended. A reader of format 1 only (an older MCP server) takes them for a newer format and
 * exports nothing, rather than an export missing what it could not open. Format 1 at epoch 0.
 *
 * IRREVERSIBLE once released: the types, the addresses, the formats (EXPORT_GRANT_VERSION,
 * EXPORT_GRANT_EPOCH_VERSION) and the keys (export-grant.test.ts locks them); sattleme/mcp-server
 * reads them.
 */

const DECISION_TYPE = "assistant-export";
const KEYS_TYPE = "assistant-export-keys";

/** 1: the first format. */
export const EXPORT_GRANT_VERSION = 1;

/** The keys of a grant at an export epoch: format 1 and the account's `epoch`. */
export const EXPORT_GRANT_EPOCH_VERSION = 2;

/** A format of a grant's keys. */
export type GrantKeysVersion = typeof EXPORT_GRANT_VERSION | typeof EXPORT_GRANT_EPOCH_VERSION;

/** Parts of the keys at most: about 1 500 seats (each under 500 bytes), removed ones included. */
export const MAX_GRANT_PARTS = 16;

/** Largest JSON of a part's value, in bytes: its sealed event stays under 64 kB (as archive.ts). */
export const MAX_PART_BYTES = 40_000;

/** Plaintexts are padded to multiples of this (record.ts). */
const BLOCK = 256;

const HEX_32 = /^[0-9a-f]{64}$/;

/** The keys of the records (deriveAssistantKeys' `exportGrant`). */
export type ExportGrantKeys = { encryptionKey: Uint8Array; addressKey: Uint8Array };

/** What reads the records of one author: its public key, their NIP-44 key and `d` tags' key (hex). */
export type ReadKeys = { author: string; encryptionKey: string; addressKey: string };

/** The account's own records the export reads. */
export type GrantAccount = {
  /**
   * The secret half of the business's reading key of the registry (deriveRegistryReader, hex): it
   * opens the inside of the declarations and the leases (the sale's price, note and taker). It
   * signs nothing of the business: every record it opens is signed by its sale.
   */
  registryReader: string;
  /** The owner's invoices (deriveInvoiceKeys). */
  invoices: ReadKeys;
  /** The price of bitcoin at each payment of the wallet (derivePaymentRateKeys). */
  paymentRates: ReadKeys;
  /** Each payment the wallet sent (deriveWalletSendKeys). */
  walletSends: ReadKeys;
  /** The owner's copy of a year-old month's declarations (deriveArchiveKeys). */
  archive: ReadKeys;
  /** The history copied from the v2 account (deriveLegacyHistoryKeys). */
  legacyHistory: ReadKeys;
  /**
   * The account's export epoch (≥ 1) and its seed (exportEpochSeed, hex): the keys of the records
   * sealed at it and at the epochs before it derive from it (export-epoch.ts). Format 2 only;
   * absent at epoch 0.
   */
  epoch?: GrantEpoch;
};

/** An export epoch and its seed (hex). */
export type GrantEpoch = { epoch: number; seed: string };

/** The records of a device or a seat (deriveMemberKeys): its sales and its payment links. */
export type GrantRecords = {
  /** Author of its sales' records. */
  sales: string;
  /** Author of its payment links' records. */
  links: string;
  encryptionKey: string;
  addressKey: string;
};

/** What the export reads of one witness author of an integration (an author, its `d` tags' key). */
export type GrantWitnesses = { author: string; addressKey: string };

type SeatBase = {
  /** Its id (32 hex digits), the roster's or the device's. */
  id: string;
  /** Unix seconds: its invitation, creation, or the day the account first opened on the device. */
  since: number;
  /** Unix seconds: its removal, null in the team (a device of the owner is never removed). */
  removedAt: number | null;
};

/** Who took a payment, with the keys of what records it: "By" of the export. */
export type GrantSeat =
  | (SeatBase & { role: "owner"; name: null; records: GrantRecords })
  | (SeatBase & { role: "employee"; name: string; records: GrantRecords })
  | (SeatBase & { role: "assistant"; name: string; records: GrantRecords; invoices: ReadKeys })
  | (SeatBase & {
      role: "integration";
      name: string;
      /** Its channel's NIP-44 key: its witnesses are sealed with it (checkout-spec SPEC.md §31). */
      channelKey: string;
      /** Its witnesses of on-chain payments (SPEC.md §31). */
      seen: GrantWitnesses;
      /** Its Lightning witnesses (SPEC.md §32). */
      paid: GrantWitnesses;
    });

/**
 * How the owner's device writes its export (the assistant's export as the phone's, which may be
 * off when the assistant exports): the language of its texts, the
 * locale of its numbers and dates, its time zone. The device that allowed the export writes its
 * own; the others keep it (export-grants.ts). An assistant may write in others when asked.
 */
export type GrantFormat = {
  /**
   * One of the app's languages without its variant (src/i18n/languages.ts, BaseLanguage): "de"
   * for German as Switzerland writes it too, which `locale` tells ("de-CH", "de-LI").
   */
  language: string;
  /** BCP 47 tag of the numbers and dates, as the device gives it (e.g. "fr-CH"). */
  locale: string;
  /** IANA time zone (e.g. "Europe/Zurich"); null when the device tells none. */
  timeZone: string | null;
};

/** What the keys give, whole. */
export type ExportKeys = {
  account: GrantAccount;
  /** The owner's device's format (GrantFormat); null when a grant names none. */
  format: GrantFormat | null;
  /** The seats, those in the team first, then the removed ones, the latest removal first. */
  seats: GrantSeat[];
  /** Removed seats left out (MAX_GRANT_PARTS): their sales show without "By". */
  omitted: number;
};

/** The owner's choice. */
export type ExportDecision = { allowed: boolean; updatedAt: number };

/** A part of the keys: written for the decision of `grantedAt`, or cleared (null). */
export type ExportKeysPart =
  | {
      /** EXPORT_GRANT_EPOCH_VERSION when the account names an epoch, else EXPORT_GRANT_VERSION. */
      version: GrantKeysVersion;
      grantedAt: number;
      part: number;
      parts: number;
      /** Part 0 only. */
      account: GrantAccount | null;
      /** Part 0 only: null when it names none (GrantFormat). */
      format: GrantFormat | null;
      /** Part 0 only (0 elsewhere). */
      omitted: number;
      seats: GrantSeat[];
    }
  | { grantedAt: null; part: number };

function mac(keys: ExportGrantKeys, subject: string): string {
  return bytesToHex(hmac(sha256, keys.addressKey, utf8ToBytes(subject)));
}

/** The `d` tag of the decision. */
export function exportDecisionAddress(keys: ExportGrantKeys): string {
  return mac(keys, "decision");
}

/** The `d` tag of part `part` of the keys. */
export function exportPartAddress(keys: ExportGrantKeys, part: number): string {
  return mac(keys, `keys/${part}`);
}

const isHex32 = (value: unknown): value is string =>
  typeof value === "string" && HEX_32.test(value);

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

function readKeysOf(value: unknown): ReadKeys | null {
  if (!isObject(value)) return null;
  const { author, encryptionKey, addressKey } = value;
  return isPublicKey(author) && isHex32(encryptionKey) && isHex32(addressKey)
    ? { author, encryptionKey, addressKey }
    : null;
}

function witnessesOf(value: unknown): GrantWitnesses | null {
  if (!isObject(value)) return null;
  const { author, addressKey } = value;
  return isPublicKey(author) && isHex32(addressKey) ? { author, addressKey } : null;
}

function recordsOf(value: unknown): GrantRecords | null {
  if (!isObject(value)) return null;
  const { sales, links, encryptionKey, addressKey } = value;
  return isPublicKey(sales) && isPublicKey(links) && isHex32(encryptionKey) && isHex32(addressKey)
    ? { sales, links, encryptionKey, addressKey }
    : null;
}

const LANGUAGE = /^[a-z]{2}$/;
const LOCALE = /^[A-Za-z0-9]{1,8}(?:-[A-Za-z0-9]{1,8}){0,7}$/;
const TIME_ZONE = /^[A-Za-z0-9_+\-/]{1,64}$/;

/**
 * A part's format, read leniently: absent, or anything else than a whole format, is none (an
 * assistant then writes in its own), never a reason to refuse the keys.
 */
export function parseGrantFormat(value: unknown): GrantFormat | null {
  if (!isObject(value)) return null;
  const { language, locale, timeZone } = value;
  if (typeof language !== "string" || !LANGUAGE.test(language)) return null;
  if (typeof locale !== "string" || locale.length > 35 || !LOCALE.test(locale)) return null;
  if (!(timeZone === null || (typeof timeZone === "string" && TIME_ZONE.test(timeZone)))) {
    return null;
  }
  return { language, locale, timeZone: timeZone as string | null };
}

function grantEpochOf(value: unknown): GrantEpoch | null {
  if (!isObject(value)) return null;
  const { epoch, seed } = value;
  return isExportEpoch(epoch) && epoch >= 1 && isHex32(seed) ? { epoch, seed } : null;
}

function accountOf(value: unknown, version: GrantKeysVersion): GrantAccount | null {
  if (!isObject(value) || !isHex32(value.registryReader)) return null;
  // Format 2 names the epoch, whole; format 1 none (a field it holds is left aside).
  const epoch = version === EXPORT_GRANT_EPOCH_VERSION ? grantEpochOf(value.epoch) : null;
  if (version === EXPORT_GRANT_EPOCH_VERSION && !epoch) return null;
  const invoices = readKeysOf(value.invoices);
  const paymentRates = readKeysOf(value.paymentRates);
  const walletSends = readKeysOf(value.walletSends);
  const archive = readKeysOf(value.archive);
  const legacyHistory = readKeysOf(value.legacyHistory);
  if (!invoices || !paymentRates || !walletSends || !archive || !legacyHistory) return null;
  return {
    registryReader: value.registryReader,
    invoices,
    paymentRates,
    walletSends,
    archive,
    legacyHistory,
    ...(epoch ? { epoch } : {})
  };
}

/** A seat of a part, checked whole; null otherwise. */
export function parseGrantSeat(value: unknown): GrantSeat | null {
  if (!isObject(value)) return null;
  const { role, id, name, since, removedAt } = value;
  if (!isMemberId(id) || !isUnixSeconds(since)) return null;
  if (!(removedAt === null || isUnixSeconds(removedAt))) return null;
  const base: SeatBase = { id, since, removedAt };
  if (role === "owner") {
    const records = recordsOf(value.records);
    return name === null && removedAt === null && records
      ? { ...base, role, name: null, records }
      : null;
  }
  if (!isName(name)) return null;
  if (role === "employee") {
    const records = recordsOf(value.records);
    return records ? { ...base, role, name, records } : null;
  }
  if (role === "assistant") {
    const records = recordsOf(value.records);
    const invoices = readKeysOf(value.invoices);
    return records && invoices ? { ...base, role, name, records, invoices } : null;
  }
  if (role === "integration") {
    const seen = witnessesOf(value.seen);
    const paid = witnessesOf(value.paid);
    return isHex32(value.channelKey) && seen && paid
      ? { ...base, role, name, channelKey: value.channelKey, seen, paid }
      : null;
  }
  return null;
}

/** The decision's value, checked against its event; null otherwise. */
export function parseExportDecision(value: unknown, event: NostrEvent): ExportDecision | null {
  if (!isObject(value)) return null;
  if (typeof value.version === "number" && value.version > EXPORT_GRANT_VERSION) {
    throw new NewerRecordError();
  }
  if (value.version !== EXPORT_GRANT_VERSION || typeof value.allowed !== "boolean") return null;
  if (!isUnixSeconds(value.updatedAt) || value.updatedAt !== event.created_at) return null;
  return { allowed: value.allowed, updatedAt: value.updatedAt };
}

/** A part's value, checked whole for part `part`; null otherwise. */
export function parseExportKeysPart(value: unknown, part: number): ExportKeysPart | null {
  if (!isObject(value)) return null;
  if (typeof value.version === "number" && value.version > EXPORT_GRANT_EPOCH_VERSION) {
    throw new NewerRecordError();
  }
  const version = value.version;
  if (version !== EXPORT_GRANT_VERSION && version !== EXPORT_GRANT_EPOCH_VERSION) return null;
  if (value.part !== part) return null;
  // Cleared: written in format 1 (a reader of format 1 reads it).
  if (value.grantedAt === null) {
    return version === EXPORT_GRANT_VERSION ? { grantedAt: null, part } : null;
  }
  const { grantedAt, parts, seats } = value;
  if (!isUnixSeconds(grantedAt)) return null;
  if (
    !Number.isSafeInteger(parts) ||
    (parts as number) < 1 ||
    (parts as number) > MAX_GRANT_PARTS
  ) {
    return null;
  }
  if (part >= (parts as number) || !Array.isArray(seats)) return null;
  const read: GrantSeat[] = [];
  for (const seat of seats) {
    const parsed = parseGrantSeat(seat);
    if (!parsed) return null;
    read.push(parsed);
  }
  let account: GrantAccount | null = null;
  let format: GrantFormat | null = null;
  let omitted = 0;
  if (part === 0) {
    format = parseGrantFormat(value.format);
    account = accountOf(value.account, version);
    if (!account || !Number.isSafeInteger(value.omitted) || (value.omitted as number) < 0) {
      return null;
    }
    omitted = value.omitted as number;
  } else if (
    value.account !== undefined ||
    value.omitted !== undefined ||
    value.format !== undefined
  ) {
    return null;
  }
  return {
    version,
    grantedAt,
    part,
    parts: parts as number,
    account,
    format,
    omitted,
    seats: read
  };
}

function jsonBytes(value: unknown): number {
  return utf8ToBytes(JSON.stringify(value)).length;
}

/** What a part's record holds, as written. */
function partValue(part: ExportKeysPart): Record<string, unknown> {
  if (part.grantedAt === null) {
    return { version: EXPORT_GRANT_VERSION, grantedAt: null, part: part.part };
  }
  return {
    version: part.version,
    grantedAt: part.grantedAt,
    part: part.part,
    parts: part.parts,
    ...(part.part === 0
      ? { account: part.account, format: part.format, omitted: part.omitted }
      : {}),
    seats: part.seats
  };
}

/**
 * The parts of `keys` for the decision of `grantedAt`: part 0 holds the account, then the seats
 * in their order, each part filled up to MAX_PART_BYTES. Removed seats beyond MAX_GRANT_PARTS are
 * left out from the last (the oldest removals), and counted in part 0's `omitted`; seats in the
 * team never are (MAX_TEAM_MEMBERS, MAX_OWNER_DEVICES, MAX_INTEGRATIONS and MAX_ASSISTANTS keep
 * them within 3 parts).
 */
export function exportKeysParts(keys: ExportKeys, grantedAt: number): ExportKeysPart[] {
  // Room for a part's own fields around its seats, the largest numbers written.
  const version = keys.account.epoch ? EXPORT_GRANT_EPOCH_VERSION : EXPORT_GRANT_VERSION;
  const frame = jsonBytes({
    version,
    grantedAt: Number.MAX_SAFE_INTEGER,
    part: MAX_GRANT_PARTS,
    parts: MAX_GRANT_PARTS,
    seats: []
  });
  const first =
    frame +
    jsonBytes({ account: keys.account, format: keys.format, omitted: Number.MAX_SAFE_INTEGER }) +
    3;
  const groups: GrantSeat[][] = [[]];
  let size = first;
  let kept = 0;
  for (const seat of keys.seats) {
    const bytes = jsonBytes(seat) + 1;
    if (size + bytes > MAX_PART_BYTES && groups[groups.length - 1]!.length > 0) {
      if (groups.length === MAX_GRANT_PARTS) break;
      groups.push([]);
      size = frame;
    }
    groups[groups.length - 1]!.push(seat);
    size += bytes;
    kept += 1;
  }
  const left = keys.seats.slice(kept);
  if (left.some((seat) => seat.removedAt === null)) {
    throw new Error("The seats in the team do not fit in the export grant");
  }
  return groups.map((seats, part) => ({
    version,
    grantedAt,
    part,
    parts: groups.length,
    account: part === 0 ? keys.account : null,
    format: part === 0 ? keys.format : null,
    omitted: part === 0 ? keys.omitted + left.length : 0,
    seats
  }));
}

/** The signed record of the decision, dated by it. */
export function exportDecisionEvent(
  signer: Uint8Array,
  keys: ExportGrantKeys,
  decision: ExportDecision
): NostrEvent {
  return sealRecord({
    type: DECISION_TYPE,
    value: {
      version: EXPORT_GRANT_VERSION,
      allowed: decision.allowed,
      updatedAt: decision.updatedAt
    },
    signer,
    encryptionKey: keys.encryptionKey,
    address: exportDecisionAddress(keys),
    createdAt: decision.updatedAt,
    block: BLOCK
  });
}

/** The signed record of a part of the keys (or of a cleared part), dated `createdAt`. */
export function exportPartEvent(
  signer: Uint8Array,
  keys: ExportGrantKeys,
  part: ExportKeysPart,
  createdAt: number
): NostrEvent {
  return sealRecord({
    type: KEYS_TYPE,
    value: partValue(part),
    signer,
    encryptionKey: keys.encryptionKey,
    address: exportPartAddress(keys, part.part),
    createdAt,
    block: BLOCK
  });
}

/** The decision and every part a grant may have, of the team `teamPublicKey`. */
export function exportGrantFilter(teamPublicKey: string, keys: ExportGrantKeys): RelayFilter {
  return {
    kinds: [RECORD_KIND],
    authors: [teamPublicKey],
    "#d": [
      exportDecisionAddress(keys),
      ...Array.from({ length: MAX_GRANT_PARTS }, (_, part) => exportPartAddress(keys, part))
    ]
  };
}

/** What the relays that answered hold of a grant: the decision and each part, newest copies. */
export type ExportGrantRead = {
  decision: NewestRecord<ExportDecision>;
  /** By part, 0 to MAX_GRANT_PARTS − 1. */
  parts: NewestRecord<ExportKeysPart>[];
};

/** The grant among `answers` (queryRelays of exportGrantFilter), each record opened and checked. */
export function exportGrantOf(
  answers: Map<string, unknown[]>,
  teamPublicKey: string,
  keys: ExportGrantKeys
): ExportGrantRead {
  const decision = newestRecord(answers, (value) =>
    openRecord(value, {
      type: DECISION_TYPE,
      encryptionKey: keys.encryptionKey,
      address: exportDecisionAddress(keys),
      author: teamPublicKey,
      parse: parseExportDecision
    })
  );
  const parts = Array.from({ length: MAX_GRANT_PARTS }, (_, part) =>
    newestRecord(answers, (value) =>
      openRecord(value, {
        type: KEYS_TYPE,
        encryptionKey: keys.encryptionKey,
        address: exportPartAddress(keys, part),
        author: teamPublicKey,
        parse: (payload) => parseExportKeysPart(payload, part)
      })
    )
  );
  return { decision, parts };
}

/** Whether a record of a newer format is newer than its readable copy (never written over). */
export function newerThanRead<T>(found: NewestRecord<T>): boolean {
  const { newest, newestUnreadable } = found;
  return newestUnreadable !== null && newestUnreadable > (newest?.event.created_at ?? -1);
}

/**
 * The keys the grant gives, as an assistant reads them: only with a decision that allows it
 * (newest, none of a newer format newer), and every part of that decision (its `grantedAt`), the
 * newest copy of each. Null otherwise: "not allowed" and "not read whole" alike export nothing.
 */
export function grantedKeys(read: ExportGrantRead): ExportKeys | null {
  const decision = read.decision.newest?.value;
  if (!decision?.allowed || newerThanRead(read.decision)) return null;
  const first = read.parts[0]?.newest?.value;
  if (!first || first.grantedAt !== decision.updatedAt || newerThanRead(read.parts[0]!)) {
    return null;
  }
  const seats: GrantSeat[] = [];
  for (let part = 0; part < first.parts; part += 1) {
    const found = read.parts[part]!;
    const value = found.newest?.value;
    if (
      !value ||
      newerThanRead(found) ||
      value.grantedAt !== decision.updatedAt ||
      value.parts !== first.parts ||
      value.version !== first.version
    ) {
      return null;
    }
    seats.push(...value.seats);
  }
  return { account: first.account!, format: first.format, seats, omitted: first.omitted };
}
