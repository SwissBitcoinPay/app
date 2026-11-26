import { hmac } from "@noble/hashes/hmac.js";
import { epochSealFor } from "@/lib/nostr/epochs";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

import type { NostrEvent } from "@/lib/nostr/event";
import { queryRelaysPaged, type RelayCall } from "@/lib/nostr/pool";
import { NewerRecordError, RECORD_KIND, openRecord, sealRecord } from "@/lib/nostr/record";
import type { RelayFilter } from "@/lib/nostr/relay";
import type { PaymentRateKeys } from "@/lib/team/keys";

import { HOUR_SECONDS, pointHourOf } from "./sources";

/*
 * The price of bitcoin at each payment of the account's wallet (an export asks CoinGecko
 * nothing: each payment's rate is recorded, once): the CoinGecko point of the hour that prices the
 * payment's time (pointHourOf, as every
 * amount of the app), in the account's currency of the moment it is recorded. Recorded once by an
 * owner's device that sees the payment done (src/features/wallet/payment-rates.ts), never worked
 * out again: a change of currency leaves the past rates as they were. "Export" reads them
 * (src/features/wallet/export/): the value of a transfer, which nobody typed in francs, and the
 * "Bitcoin price" of every line.
 *
 * One sealed record per payment, at an opaque address of its id, dated by the payment (a read of a
 * period asks for its records only, and a relay pages them by second). A relay sees when a payment
 * was made, never what it was nor its rate. Older than 3 years, a record is refused by relays that
 * keep nothing older (strfry's default): a payment's rate is written within a year of it.
 *
 * IRREVERSIBLE: the keys (derivePaymentRateKeys), the address and the format (PAYMENT_RATE_VERSION;
 * vectors in payment-rates.test.ts): a change needs a new version, which older apps read as newer.
 */

const RECORD_TYPE = "payment-rate";

/** 1: the first format. */
export const PAYMENT_RATE_VERSION = 1;

/** Records are padded to multiples of this many bytes (record.ts): they all look alike. */
const BLOCK = 256;

/** Longest payment id read (the SDK's are far shorter): anything longer is no payment of ours. */
const MAX_ID_LENGTH = 200;

/** A payment's rate. */
export type PaymentRate = {
  /** The wallet's id of the payment (WalletPayment.id). */
  payment: string;
  /** When the payment was made (Unix seconds, WalletPayment.timestamp). */
  at: number;
  /** ISO 4217, uppercase: the account's currency when the rate was recorded. */
  currency: string;
  /** The point's hour (Unix seconds, HH:00:00 UTC): pointHourOf(`at`). */
  hour: number;
  /** Price of 1 BTC in `currency` at `hour`, exactly as CoinGecko published it. */
  rate: number;
};

/** The opaque `d` tag of payment `id`'s rate: a relay cannot tell it from any other record. */
export function paymentRateAddress(keys: PaymentRateKeys, id: string): string {
  return bytesToHex(hmac(sha256, keys.addressKey, utf8ToBytes(`payment-rate/${id}`)));
}

function isUnixSeconds(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/**
 * A rate as written, checked whole (its hour the one that prices its time); null otherwise. Throws
 * NewerRecordError for a newer version.
 */
export function parsePaymentRate(value: unknown): PaymentRate | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.version === "number" && v.version > PAYMENT_RATE_VERSION) {
    throw new NewerRecordError();
  }
  if (
    v.version !== PAYMENT_RATE_VERSION ||
    typeof v.payment !== "string" ||
    v.payment.length === 0 ||
    v.payment.length > MAX_ID_LENGTH ||
    !isUnixSeconds(v.at) ||
    typeof v.currency !== "string" ||
    !/^[A-Z]{3}$/.test(v.currency) ||
    v.currency === "BTC" ||
    !isUnixSeconds(v.hour) ||
    v.hour % HOUR_SECONDS !== 0 ||
    v.hour !== pointHourOf(v.at) ||
    typeof v.rate !== "number" ||
    !Number.isFinite(v.rate) ||
    v.rate <= 0
  ) {
    return null;
  }
  return { payment: v.payment, at: v.at, currency: v.currency, hour: v.hour, rate: v.rate };
}

/** The signed record of a payment's rate, dated by the payment. */
export function paymentRateEvent(keys: PaymentRateKeys, rate: PaymentRate): NostrEvent {
  return sealRecord({
    type: RECORD_TYPE,
    value: { version: PAYMENT_RATE_VERSION, ...rate },
    signer: keys.nostr.secretKey,
    encryptionKey: keys.encryptionKey,
    address: paymentRateAddress(keys, rate.payment),
    createdAt: rate.at,
    block: BLOCK,
    epoch: epochSealFor(keys.encryptionKey)
  });
}

/** The records of the payments made from `since` to `until` (Unix seconds, both included). */
export function paymentRatesFilter(
  keys: PaymentRateKeys,
  since: number,
  until?: number
): RelayFilter {
  const filter: RelayFilter = {
    kinds: [RECORD_KIND],
    authors: [keys.nostr.publicKey],
    since: Math.max(0, since)
  };
  return until === undefined ? filter : { ...filter, until };
}

function addressOf(event: NostrEvent): string | undefined {
  return event.tags.find(([name]) => name === "d")?.[1];
}

/** The rates among events relays sent (paymentRatesOf). */
export type PaymentRates = {
  /** The rates read, by payment id. */
  rates: Map<string, PaymentRate>;
  /** The record each rate comes from (the copy relays keep), by payment id. */
  events: Map<string, NostrEvent>;
  /**
   * The addresses (paymentRateAddress) of the records of a newer format: a newer app wrote them,
   * their payments' rates are neither told nor written over.
   */
  newer: Set<string>;
};

export type PaymentRatesRead = PaymentRates & {
  /** How many relays answered, each with every page of its events. */
  answered: number;
  /** How many of them sent the record of each rate, by payment id. */
  copies: Map<string, number>;
};

/**
 * The rates among `events` (openRecord: author, decryption, type, signature), each checked against
 * its address. Every copy of a payment's rate has its address and its date (the payment's): of two
 * (two devices wrote it at once), the one of the lower id, which relays keep (NIP-01). A payment
 * whose address holds a record of a newer format is left out (its address in `newer`).
 */
export function paymentRatesOf(keys: PaymentRateKeys, events: readonly unknown[]): PaymentRates {
  const kept = new Map<string, { rate: PaymentRate; event: NostrEvent }>();
  const newer = new Set<string>();
  const checked = new Set<string>();
  for (const value of events) {
    const id = (value as { id?: unknown } | null)?.id;
    if (typeof id === "string" && checked.has(id)) continue;
    // A damaged copy is null: another relay may hold a good one.
    const opened = openRecord(value, {
      type: RECORD_TYPE,
      encryptionKey: keys.encryptionKey,
      address: () => true,
      author: keys.nostr.publicKey,
      parse: (payload, event) => {
        const rate = parsePaymentRate(payload);
        return rate && addressOf(event) === paymentRateAddress(keys, rate.payment) ? rate : null;
      }
    });
    if (!opened) continue;
    checked.add(opened.event.id);
    if (opened.status === "newer") {
      const address = addressOf(opened.event);
      if (address !== undefined) newer.add(address);
      continue;
    }
    const known = kept.get(opened.value.payment);
    if (!known || opened.event.id < known.event.id) {
      kept.set(opened.value.payment, { rate: opened.value, event: opened.event });
    }
  }
  const rates = new Map<string, PaymentRate>();
  const records = new Map<string, NostrEvent>();
  for (const [payment, { rate, event }] of kept) {
    if (newer.has(paymentRateAddress(keys, payment))) continue;
    rates.set(payment, rate);
    records.set(payment, event);
  }
  return { rates, events: records, newer };
}

/**
 * The rates of the payments made from `since` to `until` that the relays of `call` hold, read
 * whole, page by page (paymentRatesOf): a relay whose pages stopped before the end did not answer.
 * Never rejects: `answered` says how many relays did, `copies` how many of them hold each rate.
 */
export async function fetchPaymentRates(
  keys: PaymentRateKeys,
  call: RelayCall,
  since: number,
  until?: number
): Promise<PaymentRatesRead> {
  const answers = await queryRelaysPaged(paymentRatesFilter(keys, since, until), call, {
    whole: true,
    quorum: "majority"
  });
  const read = paymentRatesOf(keys, [...answers.values()].flat());
  const copies = new Map<string, number>();
  for (const events of answers.values()) {
    const ids = new Set(events.map((event) => (event as { id?: unknown } | null)?.id));
    for (const [payment, event] of read.events) {
      if (ids.has(event.id)) copies.set(payment, (copies.get(payment) ?? 0) + 1);
    }
  }
  return { ...read, answered: answers.size, copies };
}
