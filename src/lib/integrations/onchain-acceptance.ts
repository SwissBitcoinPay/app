import { bytesToHex } from "@noble/hashes/utils.js";

import { LEASE_GRACE_SECONDS } from "@/config/onchain";
import { majority } from "@/config/registry";
import type { NostrEvent } from "@/lib/nostr/event";
import { deriveKey } from "@/lib/nostr/keys";
import { publishToQuorum, queryRelays, type RelayCall } from "@/lib/nostr/pool";
import { NewerRecordError, RECORD_KIND, openRecord, sealRecord } from "@/lib/nostr/record";
import { usableTeamKeys, type TeamKeys } from "@/lib/team/keys";

import { INTEGRATION_SALT, type IntegrationKeys } from "./keys";

/*
 * The merchant's acceptance of an integration's order paid short (checkout-spec SPEC.md §31, "The
 * merchant's acceptance"): what the order had received on-chain
 * (and by the invoices of its rest) when the owner accepted it as paid, while its customer could
 * still pay the rest. Its server reads it at each check of the order's invoice: what came in time
 * then pays the order, which its shop sees `unconfirmed`, then `paid`, and whose checkout links'
 * pages show paid (the server's acceptance record, SPEC.md §31, "Acceptance records").
 *
 * One record per invoice of an order (its sale, its leased address, its end), signed by the team,
 * sealed with the integration's channel key: its server opens it with the integration's secret key
 * alone, and only the owner writes one (no integration key holds the team's secret). Its server
 * counts it only when a majority of the merchant's relays sent it (SPEC.md §31, "Counting it": the
 * majority of the relays holds the truth), and none dated after the lease's end. So the owner
 * makes, sends and sends again one only while its invoice runs (ACCEPTANCE_CLOCK_MARGIN_SECONDS),
 * never after: a copy completed to a majority after the server judged the order `expired` (final)
 * would make the order paid after that, its status depending on which relays answered.
 *
 * Never change the type, the `info` string nor the value's format once released: every server
 * reads them (checkout-spec's vectors/app/merchant-acceptance.json locks them).
 */

/** What the record is (src/lib/nostr/record.ts). */
const ACCEPTANCE_TYPE = "integration-onchain-accepted";

/** Format of the value (SPEC.md §31). */
export const INTEGRATION_ACCEPTANCE_VERSION = 1;

/** An invoice of an integration's order, as its acceptance is found by. */
export type AcceptedInvoice = {
  /** Hex: the order's sale (its lease's author). */
  sale: string;
  /** The deposit address its invoice leased. */
  address: string;
  /** Unix seconds: its invoice's end (`expiresAt`); its lease ends LEASE_GRACE_SECONDS later. */
  expiresAt: number;
  /** Sats its invoice asks: an acceptance is of less. */
  sats: bigint;
};

/** An order's acceptance, as read. */
export type OrderAcceptance = {
  /** Sats it had received when the owner accepted it: at least 1, below its invoice's `sats`. */
  received: bigint;
  /** Unix seconds: when the owner accepted it (the event's `created_at`). */
  at: number;
};

/** The `d` tag of the merchant's acceptance of `invoice` (SPEC.md §31). */
export function orderAcceptanceAddress(
  integrationKey: Uint8Array,
  { sale, address, expiresAt }: Pick<AcceptedInvoice, "sale" | "address" | "expiresAt">
): string {
  return bytesToHex(
    deriveKey(
      integrationKey,
      INTEGRATION_SALT,
      `onchain-accepted/${sale}/${address}/${expiresAt}/v1`
    )
  );
}

/**
 * A value of the record for `invoice`, made at `createdAt`: null when it does not count (another
 * shape, `received` not a safe integer from 1 below its sats, made after the lease's end). Throws
 * NewerRecordError for a newer version, which no server counts either.
 */
export function parseOrderAcceptance(
  value: unknown,
  createdAt: number,
  invoice: Pick<AcceptedInvoice, "expiresAt" | "sats">
): OrderAcceptance | null {
  if (value === null || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (typeof v.version === "number" && v.version > INTEGRATION_ACCEPTANCE_VERSION) {
    throw new NewerRecordError();
  }
  if (v.version !== INTEGRATION_ACCEPTANCE_VERSION) return null;
  const { received } = v;
  if (typeof received !== "number" || !Number.isSafeInteger(received) || received < 1) return null;
  if (BigInt(received) >= invoice.sats) return null;
  if (isAfterLease(createdAt, invoice)) return null;
  return { received: BigInt(received), at: createdAt };
}

/**
 * Whether a record made at `createdAt` is dated after the lease's end of `invoice` (its
 * `expiresAt` + LEASE_GRACE_SECONDS): set aside, of a newer format or not (SPEC.md §31, "Reading
 * it"), so that an `expired` status stays final.
 */
export function isAfterLease(
  createdAt: number,
  invoice: Pick<AcceptedInvoice, "expiresAt">
): boolean {
  return createdAt > invoice.expiresAt + LEASE_GRACE_SECONDS;
}

/** The event of the merchant's acceptance of `invoice` at `received` sats, made at `createdAt`. */
export function orderAcceptanceEvent(
  team: TeamKeys,
  keys: IntegrationKeys,
  integrationKey: Uint8Array,
  invoice: AcceptedInvoice,
  received: bigint,
  createdAt: number
): NostrEvent {
  if (received < 1n || received >= invoice.sats || received > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("Invalid acceptance");
  }
  return sealRecord({
    type: ACCEPTANCE_TYPE,
    value: { version: INTEGRATION_ACCEPTANCE_VERSION, received: Number(received) },
    signer: usableTeamKeys(team).secretKey,
    encryptionKey: keys.channel.encryptionKey,
    address: orderAcceptanceAddress(integrationKey, invoice),
    createdAt
  });
}

/** What a relay sent, if it is the merchant's acceptance of `invoice` that counts; else null. */
export function openOrderAcceptance(
  value: unknown,
  teamPublicKey: string,
  keys: IntegrationKeys,
  integrationKey: Uint8Array,
  invoice: AcceptedInvoice
) {
  return openRecord(value, {
    type: ACCEPTANCE_TYPE,
    encryptionKey: keys.channel.encryptionKey,
    address: orderAcceptanceAddress(integrationKey, invoice),
    author: teamPublicKey,
    parse: (payload, event) => parseOrderAcceptance(payload, event.created_at, invoice)
  });
}

/** An invoice whose acceptance is read, with its integration's keys. */
export type AcceptanceQuery = {
  integrationKey: Uint8Array;
  keys: IntegrationKeys;
  invoice: AcceptedInvoice;
};

/**
 * What the relays hold of an invoice's late acceptance (late-acceptance.ts), which no server
 * counts: the newest copy any relay sent.
 */
export type OrderAcceptanceRead = {
  /** The newest that counts, null when none. */
  acceptance: OrderAcceptance | null;
  /** Its record and the relays of the read that hold it (the owner sends it to the others). */
  copy: { event: NostrEvent; holders: readonly string[] } | null;
  /** A copy of a newer format was sent: never written over. */
  newer: boolean;
};

/** A readable copy of an invoice's merchant's acceptance, and the relays of the read that sent it. */
export type MerchantAcceptanceCopy = {
  event: NostrEvent;
  value: OrderAcceptance;
  holders: readonly string[];
};

/** What the relays hold of an invoice's merchant's acceptance, as its server counts it. */
export type MerchantAcceptanceRead = {
  /**
   * The newest that counts, null when none: one a majority of the call's relays sent (the very
   * event, by its id), as its server counts it (SPEC.md §31, "Counting it"). A copy fewer than a
   * majority sent does not count, whichever relays sent it: so the app tells an order accepted
   * only when its server counts it too. Null too when the newest a majority sent is of a newer
   * format: its server then counts none.
   */
  acceptance: OrderAcceptance | null;
  /**
   * The newest copy any relay sent, majority or not, and the relays that sent it (by id), when it
   * is readable (null when the newest is of a newer format): the owner sends it to the others while
   * its invoice runs (acceptance.ts), never after.
   */
  copy: MerchantAcceptanceCopy | null;
  /** A copy of a newer format was sent, whatever its date: never written over. */
  newer: boolean;
  /**
   * Whether the read proves what a majority holds. False when a copy newer than the one that counts
   * (or than none) was sent by fewer than a majority, but by enough that the relays which did not
   * answer (the read stops at a majority, pool.ts) could make it one: what counts is then not
   * known, never told (acceptance.ts leaves the order not read).
   */
  settled: boolean;
};

/** Invoices read in one query. */
const INVOICES_PER_READ = 50;

/** The newest of `copies` (the highest `created_at`, then the lowest id, as relays keep it). */
function newestCopy<T extends { event: NostrEvent }>(copies: readonly T[]): T | null {
  let newest: T | null = null;
  for (const copy of copies) {
    if (!newest || isNewer(copy.event, newest.event)) newest = copy;
  }
  return newest;
}

/** Whether `a` is newer than `b`, as relays keep an addressable event (NIP-01). */
function isNewer(a: NostrEvent, b: NostrEvent): boolean {
  return a.created_at > b.created_at || (a.created_at === b.created_at && a.id < b.id);
}

/**
 * The merchant's acceptances of `queries`, by orderAcceptanceAddress, as the owner reads them
 * (`call.authKey`: the team's key, their author), as their server counts them (SPEC.md §31,
 * "Counting it"). Null when fewer than a majority of the relays answered a query: a decision of the
 * owner's must not be missed.
 */
export async function fetchOrderAcceptances(
  team: TeamKeys,
  queries: readonly AcceptanceQuery[],
  call: RelayCall
): Promise<Map<string, MerchantAcceptanceRead> | null> {
  const found = new Map<string, MerchantAcceptanceRead>();
  const list = [...new Set(call.relays)];
  // Of the relays of the list, not of those that answered: what a majority of them holds.
  const quorum = majority(list.length);
  for (let start = 0; start < queries.length; start += INVOICES_PER_READ) {
    const batch = queries.slice(start, start + INVOICES_PER_READ).map((query) => ({
      ...query,
      address: orderAcceptanceAddress(query.integrationKey, query.invoice)
    }));
    const answers = await queryRelays(
      {
        kinds: [RECORD_KIND],
        authors: [team.publicKey],
        "#d": batch.map(({ address }) => address)
      },
      call,
      { quorum: "majority" }
    );
    const answered = list.filter((relay) => answers.has(relay));
    if (answered.length < quorum) return null;
    // The relays given up (the read stops at a majority) or failed: each may hold any copy.
    const silent = list.length - answered.length;
    for (const { integrationKey, keys, invoice, address } of batch) {
      // One event goes to every relay: identical copies are checked (signature, decryption) once.
      const checked = new Map<string, ReturnType<typeof openOrderAcceptance>>();
      // Each copy that counts by its id (checked to be its hash, its signature verified), with the
      // relays that sent it: a readable one (its value), or one of a newer format (null) not dated
      // after the lease's end.
      const copies = new Map<
        string,
        { event: NostrEvent; value: OrderAcceptance | null; holders: Set<string> }
      >();
      let newer = false;
      for (const relay of answered) {
        for (const value of answers.get(relay) ?? []) {
          const key = JSON.stringify(value) ?? "";
          let opened = checked.get(key);
          if (opened === undefined) {
            opened = openOrderAcceptance(value, team.publicKey, keys, integrationKey, invoice);
            checked.set(key, opened);
          }
          if (!opened) continue;
          if (opened.status === "newer") {
            // Told whatever its date, as a server logs it (SPEC.md §31, "Reading it"); set aside
            // when dated after the lease's end, as one of this format is (parseOrderAcceptance).
            newer = true;
            if (isAfterLease(opened.event.created_at, invoice)) continue;
          }
          const copy = copies.get(opened.event.id) ?? {
            event: opened.event,
            value: opened.status === "ok" ? opened.value : null,
            holders: new Set<string>()
          };
          copy.holders.add(relay);
          copies.set(opened.event.id, copy);
        }
      }
      const all = [...copies.values()].map(({ event, value, holders }) => ({
        event,
        value,
        holders: list.filter((relay) => holders.has(relay))
      }));
      // Of the copies a majority sent, the newest decides, of a newer format too: the order then
      // has no acceptance (SPEC.md §31, "Counting it"), as its server judges it. A copy no relay
      // of the read sent is held by fewer than a majority (any two majorities share a relay).
      const counted = newestCopy(all.filter(({ holders }) => holders.length >= quorum));
      // Settled unless a newer copy a minority sent could be a majority's with the silent relays.
      const settled = all.every(
        ({ event, holders }) =>
          holders.length >= quorum ||
          holders.length + silent < quorum ||
          (counted !== null && !isNewer(event, counted.event))
      );
      // The newest copy any relay sent is sent to the others only when this app can read it: one
      // of this format older than one of a newer format is never spread over it.
      const newest = newestCopy(all);
      found.set(address, {
        acceptance: counted?.value ?? null,
        copy: newest?.value
          ? { event: newest.event, value: newest.value, holders: newest.holders }
          : null,
        newer,
        settled
      });
    }
  }
  return found;
}

/**
 * The longest a request sending the merchant's acceptance to a relay lasts, its connection and
 * authentication included (relay.ts, RelayOptions.timeoutMs): a server's relay request's bound
 * (SPEC.md §13). Each starts before acceptanceCutoff, so what it sends reaches the relays by
 * `expiresAt` + 60, before the lease's end (`expiresAt` + LEASE_GRACE_SECONDS), after which a
 * check may judge the order `expired`.
 */
export const ACCEPTANCE_REQUEST_MAX_MS = 60_000;

/**
 * How long before its invoice's end, by the app's clock, the merchant's acceptance of an order is
 * no longer made, sent nor sent again (SPEC.md §31, "Publishing it", rule 1: only while now <
 * `expiresAt`, by a clock synchronized as a server's, SPEC.md §2; what it sends reaches the relays
 * by `expiresAt` + 60, before the lease's end, after which a check may judge the order `expired`,
 * for good). The app's clock (nowUnix, src/lib/clock.ts) is not synchronized so: the device's,
 * corrected only by the dates of the invoices it got this launch, else roughly; it may run behind.
 * Stopping 5 minutes early, a clock up to 5 minutes behind still starts every send before
 * `expiresAt`, and each request (ACCEPTANCE_REQUEST_MAX_MS) ends before `expiresAt` + 60. From
 * then on, the owner's acceptance of the order is the late one (late-acceptance.ts), which its
 * server never reads.
 */
export const ACCEPTANCE_CLOCK_MARGIN_SECONDS = 300;

/**
 * The moment, by the app's clock, from which the merchant's acceptance of `invoice` is no longer
 * made nor sent (ACCEPTANCE_CLOCK_MARGIN_SECONDS before its end): only while now is below it.
 */
export function acceptanceCutoff(invoice: Pick<AcceptedInvoice, "expiresAt">): number {
  return invoice.expiresAt - ACCEPTANCE_CLOCK_MARGIN_SECONDS;
}

/** `call`, each of its requests bounded by ACCEPTANCE_REQUEST_MAX_MS. */
export function acceptanceCall<T extends Pick<RelayCall, "timeoutMs">>(call: T): T {
  return { ...call, timeoutMs: Math.min(call.timeoutMs, ACCEPTANCE_REQUEST_MAX_MS) };
}

/**
 * Publishes the merchant's acceptance `event` on `call.relays` as the team (NIP-42), each request
 * bounded (acceptanceCall): done once a majority took it; rejects otherwise (the owner tries again
 * with the same event, while the invoice runs).
 */
export function publishOrderAcceptance(event: NostrEvent, call: RelayCall): Promise<void> {
  return publishToQuorum(event, acceptanceCall(call), majority(call.relays.length));
}
