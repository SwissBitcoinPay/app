import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

import type { NostrEvent } from "@/lib/nostr/event";
import { queryRelays, type RelayCall } from "@/lib/nostr/pool";
import { NewerRecordError, RECORD_KIND, openRecord, sealRecord } from "@/lib/nostr/record";
import type { RelayFilter } from "@/lib/nostr/relay";
import type { MtpSaleKeys } from "@/lib/team/keys";

import { ownerNameText } from "./accounts";
import { decimalString, readDecimal, type MtpDecimal } from "./decimal";
import type { MtpBankAccount, MtpSellOrder } from "./types";

/*
 * A sale to Mt Pelerin as the merchant agreed to it (the sale's rate, the fiat amount, the IBAN it
 * is sold to…): the order's figures as
 * Mt Pelerin gave them (exact decimals, never rounded), the bank account it is wired to, how it is
 * wired, and the payment hash of its invoice, by which "Wallet" finds it among the wallet's
 * payments. The wallet itself only knows an invoice paid, its memo Mt Pelerin's.
 *
 * Written by the owner's device that pays the sale, after the passkey and before the payment
 * leaves (src/features/sell/sale-records.ts): no sale is paid without its record on a majority of
 * the account's relays. Never written again: a later status of the sale (sent, refunded) is Mt
 * Pelerin's, read from it ("Your sales"). A record whose invoice was never paid, or whose
 * payment failed, shows nowhere (src/features/activity/model.ts).
 *
 * A deferred sale names no IBAN nor holder (format 2): its
 * transfer is made later, grouped with others once their threshold is reached, to the account as it
 * is then, which may have changed meanwhile; only the account's id and currency. A sale wired at
 * once keeps the account's IBAN, label and holder of the time (sale metadata, kept).
 *
 * One sealed record per sale, at an opaque address of its payment hash: a relay sees when a sale
 * was made, never what nor to where. Owner only (deriveMtpSaleKeys): it holds an IBAN.
 *
 * IRREVERSIBLE: the keys (deriveMtpSaleKeys), the address and the format (MTP_SALE_VERSION;
 * vectors in mtpelerin-sale-record.test.ts): a change needs a new version, which older readers
 * read as newer.
 */

const RECORD_TYPE = "mtpelerin-sale";

/**
 * 2: a deferred sale's account without IBAN, label nor holder. 1: every account with them; still
 * read.
 */
export const MTP_SALE_VERSION = 2;

/** Records are padded to multiples of this many bytes (record.ts): they all look alike. */
const BLOCK = 512;

const HASH = /^[0-9a-f]{64}$/;
const SATS = /^[1-9][0-9]{0,15}$/;
/** Mt Pelerin's ids (guards.ts `id`). */
const ID = /^[A-Za-z0-9-]{1,128}$/;
/** An asset's or a currency's code (guards.ts `assetCode`). */
const CODE = /^[A-Za-z0-9]{1,16}$/;
/** `oid` (guards.ts `orderOid`). */
const OID = /^[\x21-\x7e]{1,128}$/;
const IBAN = /^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/;
/** A holder's line: a company's name, or a person's two names (256 each, guards.ts) and a space. */
const MAX_HOLDER_LENGTH = 513;

/** A sale to Mt Pelerin, as agreed to before its payment left. */
export type MtpSaleRecord = {
  /** Its invoice's payment hash (lowercase hex): the wallet's payment of it. */
  paymentHash: string;
  /** When it was recorded, just before its payment left (Unix seconds). */
  at: number;
  /** Mt Pelerin's order (`id`) and its short id, as its e-mails and pages name it. */
  orderId: string;
  shortId: string;
  /** The sats sold: its invoice's amount, the wallet's fees excluded. */
  sats: bigint;
  /**
   * `dest_amount` in `dest_currency`: what the order wires, as Mt Pelerin gave it, before its
   * transfer fee (`transferFeeMinor`).
   */
  received: { amount: MtpDecimal; currency: string };
  /**
   * Mt Pelerin's transfer fee taken from it, in minor units of its currency (transfer-fee.ts),
   * which neither its estimate nor its order count: 0 for a deferred sell or from its threshold on.
   */
  transferFeeMinor: number;
  /** `rate`: the destination per sat, before fees; null when the order gave none. */
  rate: MtpDecimal | null;
  /** The order's `estimate.fees`: Mt Pelerin's, in their currency; null when it gave none. */
  fees: { total: MtpDecimal; currency: string } | null;
  /** Its francs wait for the bank account's one transfer (`withdraw: "manual"`). */
  deferred: boolean;
  /** `reference`: the bank transfer's communication. */
  reference: string;
  /** `oid`: the app's reference of the order (the split's sale's carries its checkpoint). */
  oid: string;
  /**
   * The bank account it is wired to, as Mt Pelerin registered it then. A deferred sale's (format 2)
   * has no IBAN, label nor holder: its transfer is made later, to the account as it is then.
   */
  account: {
    /** Mt Pelerin's id of the account (`beneficiary_id`). */
    id: string;
    /** Compact; null for a deferred sale (format 2). */
    iban: string | null;
    currency: string;
    /** The merchant's name of the account; null without one, and for a deferred sale. */
    label: string | null;
    /** Its holder, as a line (ownerNameText); null for a deferred sale (format 2). */
    holder: string | null;
  };
};

/**
 * The record of the sale `order` of `sats` to `account`, whose invoice has `paymentHash`, made at
 * `at`: the order's own figures, checked before (sale.ts `checkSellOrder`).
 */
export function mtpSaleRecordOf({
  order,
  account,
  sats,
  paymentHash,
  deferred,
  transferFeeMinor,
  reference,
  oid,
  at
}: {
  order: MtpSellOrder;
  account: MtpBankAccount;
  sats: bigint;
  paymentHash: string;
  deferred: boolean;
  transferFeeMinor: number;
  reference: string;
  oid: string;
  at: number;
}): MtpSaleRecord {
  return {
    paymentHash,
    at,
    orderId: order.id,
    shortId: order.shortId,
    sats,
    received: { amount: order.destAmount, currency: order.destCurrency },
    rate: order.rate,
    fees: order.estimate?.fees ?? null,
    transferFeeMinor,
    deferred,
    reference,
    oid,
    // A deferred sale's transfer goes later to the account as it is then: none of its details.
    account: deferred
      ? { id: account.id, iban: null, currency: account.currency, label: null, holder: null }
      : {
          id: account.id,
          iban: account.iban,
          currency: account.currency,
          label: account.label,
          holder: ownerNameText(account.owner.name)
        }
  };
}

/** The opaque `d` tag of the sale whose invoice has `paymentHash`. */
export function mtpSaleAddress(keys: MtpSaleKeys, paymentHash: string): string {
  return bytesToHex(hmac(sha256, keys.addressKey, utf8ToBytes(`mtpelerin-sale/${paymentHash}`)));
}

function objectOf(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

const isText = (value: unknown, max: number): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= max;

const matches = (value: unknown, pattern: RegExp): value is string =>
  typeof value === "string" && pattern.test(value);

/** An exact decimal as written (decimalString): only a text readDecimal reads. */
function decimalOf(value: unknown): MtpDecimal | null {
  return typeof value === "string" && value === value.trim() ? readDecimal(value) : null;
}

/** `{ amount | total, currency }` as written; null otherwise. */
function amountOf(value: unknown, field: "amount" | "total"): [MtpDecimal, string] | null {
  const v = objectOf(value);
  if (!v || !matches(v.currency, CODE)) return null;
  const amount = decimalOf(v[field]);
  return amount === null ? null : [amount, v.currency];
}

/**
 * A record's value checked whole, of format 1 or 2; null otherwise. Throws NewerRecordError for a
 * newer version.
 */
export function parseMtpSale(value: unknown): MtpSaleRecord | null {
  const v = objectOf(value);
  if (!v) return null;
  if (typeof v.version === "number" && v.version > MTP_SALE_VERSION) {
    throw new NewerRecordError();
  }
  if (
    (v.version !== 1 && v.version !== 2) ||
    !matches(v.paymentHash, HASH) ||
    typeof v.at !== "number" ||
    !Number.isSafeInteger(v.at) ||
    v.at < 0 ||
    !matches(v.orderId, ID) ||
    !isText(v.shortId, 32) ||
    !matches(v.sats, SATS) ||
    typeof v.transferFeeMinor !== "number" ||
    !Number.isSafeInteger(v.transferFeeMinor) ||
    v.transferFeeMinor < 0 ||
    typeof v.deferred !== "boolean" ||
    !isText(v.reference, 35) ||
    !matches(v.oid, OID)
  ) {
    return null;
  }
  const received = amountOf(v.received, "amount");
  const rate = v.rate === null ? null : decimalOf(v.rate);
  const fees = v.fees === null ? null : amountOf(v.fees, "total");
  const account = objectOf(v.account);
  // Format 2: a deferred sale's account has none of its details, any other all of them; format 1:
  // every account has them.
  const detailed = v.version === 1 || !v.deferred;
  if (
    received === null ||
    (v.rate !== null && rate === null) ||
    (v.fees !== null && fees === null) ||
    !account ||
    !matches(account.id, ID) ||
    !matches(account.currency, CODE) ||
    (detailed
      ? !matches(account.iban, IBAN) ||
        !(account.label === null || isText(account.label, 128)) ||
        !isText(account.holder, MAX_HOLDER_LENGTH)
      : account.iban !== null || account.label !== null || account.holder !== null)
  ) {
    return null;
  }
  return {
    paymentHash: v.paymentHash,
    at: v.at,
    orderId: v.orderId,
    shortId: v.shortId,
    sats: BigInt(v.sats),
    received: { amount: received[0], currency: received[1] },
    rate,
    fees: fees === null ? null : { total: fees[0], currency: fees[1] },
    transferFeeMinor: v.transferFeeMinor,
    deferred: v.deferred,
    reference: v.reference,
    oid: v.oid,
    account: {
      id: account.id,
      iban: account.iban as string | null,
      currency: account.currency,
      label: account.label as string | null,
      holder: account.holder as string | null
    }
  };
}

/**
 * The value written, of this app's format: amounts as exact texts (decimalString, sats in base 10).
 */
export function mtpSaleValue(sale: MtpSaleRecord): unknown {
  return {
    version: MTP_SALE_VERSION,
    paymentHash: sale.paymentHash,
    at: sale.at,
    orderId: sale.orderId,
    shortId: sale.shortId,
    sats: sale.sats.toString(),
    received: { amount: decimalString(sale.received.amount), currency: sale.received.currency },
    rate: sale.rate === null ? null : decimalString(sale.rate),
    fees:
      sale.fees === null
        ? null
        : { total: decimalString(sale.fees.total), currency: sale.fees.currency },
    transferFeeMinor: sale.transferFeeMinor,
    deferred: sale.deferred,
    reference: sale.reference,
    oid: sale.oid,
    account: {
      id: sale.account.id,
      iban: sale.account.iban,
      currency: sale.account.currency,
      label: sale.account.label,
      holder: sale.account.holder
    }
  };
}

/**
 * The signed record of `sale`, dated by it. Throws RangeError for a sale its reader would refuse
 * (parseMtpSale): nothing out of shape is ever written.
 */
export function mtpSaleEvent(keys: MtpSaleKeys, sale: MtpSaleRecord): NostrEvent {
  const value = mtpSaleValue(sale);
  if (parseMtpSale(value) === null) throw new RangeError("A sale's record out of shape");
  return sealRecord({
    type: RECORD_TYPE,
    value,
    signer: keys.nostr.secretKey,
    encryptionKey: keys.encryptionKey,
    address: mtpSaleAddress(keys, sale.paymentHash),
    createdAt: sale.at,
    block: BLOCK
  });
}

/** Every sale's record (a change of relays copies them all). */
export function mtpSalesFilter(keys: MtpSaleKeys): RelayFilter {
  return { kinds: [RECORD_KIND], authors: [keys.nostr.publicKey] };
}

function addressOf(event: NostrEvent): string | undefined {
  return event.tags.find(([name]) => name === "d")?.[1];
}

/**
 * The sales among `events` (openRecord: author, decryption, type, signature), by payment hash, each
 * checked against its address and its date. Of two copies of one (two attempts of its payment),
 * the one of the lower id, which relays keep (NIP-01). A record of a newer format is left out.
 */
export function mtpSalesOf(
  keys: MtpSaleKeys,
  events: readonly unknown[]
): Map<string, MtpSaleRecord> {
  const sales = new Map<string, { sale: MtpSaleRecord; id: string }>();
  for (const value of events) {
    const opened = openRecord(value, {
      type: RECORD_TYPE,
      encryptionKey: keys.encryptionKey,
      address: () => true,
      author: keys.nostr.publicKey,
      parse: (payload, event) => {
        const sale = parseMtpSale(payload);
        return sale &&
          event.created_at === sale.at &&
          addressOf(event) === mtpSaleAddress(keys, sale.paymentHash)
          ? sale
          : null;
      }
    });
    if (opened?.status !== "ok") continue;
    const known = sales.get(opened.value.paymentHash);
    if (!known || opened.event.id < known.id) {
      sales.set(opened.value.paymentHash, { sale: opened.value, id: opened.event.id });
    }
  }
  return new Map([...sales].map(([hash, { sale }]) => [hash, sale]));
}

/** Addresses asked at once (a relay's filter stays short). */
const ADDRESSES_AT_ONCE = 100;

/**
 * The records of the sales whose invoices have `paymentHashes`, read by their addresses from the
 * relays of `call`. `answered`: how many relays answered every part of the read. Never rejects.
 */
export async function fetchMtpSales(
  keys: MtpSaleKeys,
  call: RelayCall,
  paymentHashes: readonly string[]
): Promise<{ sales: Map<string, MtpSaleRecord>; answered: number }> {
  const hashes = [...new Set(paymentHashes)].filter((hash) => HASH.test(hash));
  if (hashes.length === 0) return { sales: new Map(), answered: call.relays.length };
  const events: unknown[] = [];
  let answered = Infinity;
  for (let start = 0; start < hashes.length; start += ADDRESSES_AT_ONCE) {
    const part = hashes.slice(start, start + ADDRESSES_AT_ONCE);
    const answers = await queryRelays(
      { ...mtpSalesFilter(keys), "#d": part.map((hash) => mtpSaleAddress(keys, hash)) },
      call
    );
    answered = Math.min(answered, answers.size);
    for (const found of answers.values()) events.push(...found);
  }
  return { sales: mtpSalesOf(keys, events), answered };
}
