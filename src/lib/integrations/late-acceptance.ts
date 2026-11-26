import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

import { majority } from "@/config/registry";
import type { NostrEvent } from "@/lib/nostr/event";
import { publishToQuorum, queryRelays, type RelayCall } from "@/lib/nostr/pool";
import {
  NewerRecordError,
  RECORD_KIND,
  newestRecord,
  openRecord,
  sealRecord
} from "@/lib/nostr/record";
import {
  isMemberId,
  usableTeamKeys,
  type LateAcceptanceKeys,
  type TeamKeys
} from "@/lib/team/keys";

import type { AcceptedInvoice, OrderAcceptance, OrderAcceptanceRead } from "./onchain-acceptance";

/*
 * The owner's acceptance of an integration's order paid short, made once the one its server reads
 * can no longer be (an owner who no longer reaches the integration's back-office still settles
 * the order in "Wallet"): from acceptanceCutoff on,
 * 5 minutes before its invoice's end, or once that one lapsed (onchain-acceptance.ts,
 * src/features/activity/acceptance.ts). The sats are in the wallet already: nothing moves,
 * the order is "Paid" at what it received, for the owner's devices alone.
 *
 * Not the merchant's acceptance its server reads (onchain-acceptance.ts, checkout-spec SPEC.md §31):
 * a server counts none dated after the lease's end, its `expired` final for the shop, which may
 * have cancelled the order (the spec's vectors lock it). So this record is the owner's own, at an
 * address no server knows, sealed with a key no server holds: the shop never learns of it, and the
 * app tells the owner so, before and after (AcceptAction, ActivitySheet), to settle the order in
 * the shop's back-office too.
 *
 * One record per invoice of an order (its integration, its sale, its leased address, its end),
 * signed by the team ("Delete account" finds it by that author), written once, never again.
 *
 * IRREVERSIBLE: the type, the keys (deriveLateAcceptanceKeys), the address and the format
 * (LATE_ACCEPTANCE_VERSION; vectors in late-acceptance.test.ts): a change needs a new version,
 * which older readers read as newer.
 */

const RECORD_TYPE = "integration-onchain-accepted-late";

/** 1: the first format. */
export const LATE_ACCEPTANCE_VERSION = 1;

/** Whole sats, as the value writes them: 1 to 16 digits, no leading zero. */
const SATS = /^[1-9][0-9]{0,15}$/;

/** An invoice whose late acceptance is read: its integration (id) and the invoice. */
export type LateAcceptanceQuery = { integration: string; invoice: AcceptedInvoice };

/** The opaque `d` tag of the late acceptance of `invoice` of integration `integration`. */
export function lateAcceptanceAddress(
  keys: LateAcceptanceKeys,
  integration: string,
  { sale, address, expiresAt }: Pick<AcceptedInvoice, "sale" | "address" | "expiresAt">
): string {
  if (!isMemberId(integration)) throw new Error("Invalid integration id");
  return bytesToHex(
    hmac(
      sha256,
      keys.addressKey,
      utf8ToBytes(`integration-late-acceptance/${integration}/${sale}/${address}/${expiresAt}`)
    )
  );
}

/**
 * A value of the record for `invoice`, made at `createdAt`: null when it is not one (another shape,
 * `received` not whole sats from 1 below the invoice's). Throws NewerRecordError for a newer one.
 */
export function parseLateAcceptance(
  value: unknown,
  createdAt: number,
  invoice: Pick<AcceptedInvoice, "sats">
): OrderAcceptance | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.version === "number" && v.version > LATE_ACCEPTANCE_VERSION) {
    throw new NewerRecordError();
  }
  if (v.version !== LATE_ACCEPTANCE_VERSION) return null;
  if (typeof v.received !== "string" || !SATS.test(v.received)) return null;
  const received = BigInt(v.received);
  if (received >= invoice.sats) return null;
  return { received, at: createdAt };
}

/** The event of the owner's late acceptance of `invoice` at `received` sats, made at `createdAt`. */
export function lateAcceptanceEvent(
  team: TeamKeys,
  keys: LateAcceptanceKeys,
  integration: string,
  invoice: AcceptedInvoice,
  received: bigint,
  createdAt: number
): NostrEvent {
  if (received < 1n || received >= invoice.sats || received > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("Invalid acceptance");
  }
  return sealRecord({
    type: RECORD_TYPE,
    value: { version: LATE_ACCEPTANCE_VERSION, received: received.toString() },
    signer: usableTeamKeys(team).secretKey,
    encryptionKey: keys.encryptionKey,
    address: lateAcceptanceAddress(keys, integration, invoice),
    createdAt
  });
}

/** What a relay sent, if it is the owner's late acceptance of `invoice`; else null. */
export function openLateAcceptance(
  value: unknown,
  teamPublicKey: string,
  keys: LateAcceptanceKeys,
  integration: string,
  invoice: AcceptedInvoice
) {
  return openRecord(value, {
    type: RECORD_TYPE,
    encryptionKey: keys.encryptionKey,
    address: lateAcceptanceAddress(keys, integration, invoice),
    author: teamPublicKey,
    parse: (payload, event) => parseLateAcceptance(payload, event.created_at, invoice)
  });
}

/** Invoices read in one query. */
const INVOICES_PER_READ = 50;

/**
 * The owner's late acceptances of `queries`, by lateAcceptanceAddress, read as the team
 * (`call.authKey`: the team's key, their author). Null when fewer than a majority of the relays
 * answered a query: a decision of the owner's must not be missed.
 */
export async function fetchLateAcceptances(
  team: TeamKeys,
  keys: LateAcceptanceKeys,
  queries: readonly LateAcceptanceQuery[],
  call: RelayCall
): Promise<Map<string, OrderAcceptanceRead> | null> {
  const found = new Map<string, OrderAcceptanceRead>();
  for (let start = 0; start < queries.length; start += INVOICES_PER_READ) {
    const batch = queries.slice(start, start + INVOICES_PER_READ).map((query) => ({
      ...query,
      address: lateAcceptanceAddress(keys, query.integration, query.invoice)
    }));
    const answers = await queryRelays(
      {
        kinds: [RECORD_KIND],
        authors: [team.publicKey],
        "#d": batch.map(({ address }) => address)
      },
      call
    );
    if (answers.size < majority(call.relays.length)) return null;
    for (const { integration, invoice, address } of batch) {
      const read = newestRecord(answers, (value) =>
        openLateAcceptance(value, team.publicKey, keys, integration, invoice)
      );
      const newest = read.newest;
      found.set(address, {
        acceptance: newest?.value ?? null,
        copy: newest
          ? {
              event: newest.event,
              holders: [...read.copies].flatMap(([relay, at]) =>
                at === newest.event.created_at ? [relay] : []
              )
            }
          : null,
        newer: read.newestUnreadable !== null
      });
    }
  }
  return found;
}

/**
 * Publishes the owner's late acceptance `event` on `call.relays` as the team (NIP-42): done once a
 * majority took it; rejects otherwise (the owner tries again with the same event).
 */
export function publishLateAcceptance(event: NostrEvent, call: RelayCall): Promise<void> {
  return publishToQuorum(event, call, majority(call.relays.length));
}
