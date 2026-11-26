import { bytesToHex } from "@noble/hashes/utils.js";

import { majority } from "@/config/registry";
import type { NostrEvent } from "@/lib/nostr/event";
import { deriveKey } from "@/lib/nostr/keys";
import { publishToQuorum, queryRelays } from "@/lib/nostr/pool";
import { NewerRecordError, newestRecord, openRecord, sealRecord } from "@/lib/nostr/record";
import { saleOwnerPublicKey, saleOwnerSecretKey } from "@/lib/payment-link/owner-key";

import { deriveSaleKeys } from "./registry";

/*
 * The owner's acceptance of a sale paid short: a sale of the point
 * of sale or of a payment link that received less than its amount on-chain, which the owner accepts
 * as paid at what came, while its payer could still pay the rest or once its sale ended, for good.
 * The sats are in the wallet already: nothing moves, the sale is "Paid" from then on, for the
 * owner, the device that showed it, the employee who took it and the payer's page alike.
 *
 * One record per sale, which every holder of the sale's key reads (its payment link's payer, the
 * device showing it, the employee's records of it, the owner from its declarations or its link)
 * and only the owner writes: signed by the owner's key of that sale (owner-key.ts, the key that
 * signs a link's final version, which the sale's holders compute from the business's link owner
 * key they know), at an address and under a key of the sale's own key. So a relay sees an opaque
 * `d` tag and an author of that sale alone; a payer can neither forge one nor read another sale's.
 * Its value says what the sale had received when the owner accepted it, and what it was due then:
 * it counts while what the sale received is at least that (a replacement, RBF, that pays less
 * leaves it underpaid again), and the owner's statement tells the difference ("Remark").
 *
 * An integration's order has its own record, which its server reads (checkout-spec SPEC.md §31, the
 * merchant's acceptance, src/lib/integrations/onchain-acceptance.ts).
 *
 * Never change the type, the salt nor the `info` strings once released: every acceptance would be
 * lost (`sale-acceptance.test.ts` locks them).
 */

/** What the record is (src/lib/nostr/record.ts). */
const RECORD_TYPE = "sale-accepted";

/** Format of the value: a change of what it holds needs a new one (an older app then ignores it). */
export const SALE_ACCEPTANCE_VERSION = 1;

/** Domain of the keys of a sale's acceptance, from the sale's own key. */
const SALT = "sattle.me/sale-acceptance";

/** Whole sats, as the value writes them: 1 to 16 digits, no leading zero. */
const SATS = /^[1-9][0-9]{0,15}$/;
/** Every bitcoin there will ever be, in sats: no sale is due more. */
const MAX_SATS = 2_100_000_000_000_000n;

/** A sale's acceptance, as read. */
export type SaleAcceptance = {
  /** Sats the sale had received when the owner accepted it: at least 1, below `due`. */
  received: bigint;
  /** Sats it was due then: what it fell short of. */
  due: bigint;
  /** Unix seconds: when the owner accepted it (the event's `created_at`). */
  at: number;
};

/** The `d` tag of the acceptance of the sale whose own key is `saleKey`. */
export function saleAcceptanceAddress(saleKey: Uint8Array): string {
  return bytesToHex(deriveKey(saleKey, SALT, "address/v1"));
}

/** The key the acceptance of the sale whose own key is `saleKey` is sealed with (NIP-44). */
function encryptionKeyOf(saleKey: Uint8Array): Uint8Array {
  return deriveKey(saleKey, SALT, "encryption-key/v1");
}

/** A value of the record, checked: null when it is not one. Throws NewerRecordError for a newer one. */
export function parseSaleAcceptance(
  value: unknown,
  event: Pick<NostrEvent, "created_at">
): SaleAcceptance | null {
  if (value === null || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (typeof v.version === "number" && v.version > SALE_ACCEPTANCE_VERSION) {
    throw new NewerRecordError();
  }
  if (v.version !== SALE_ACCEPTANCE_VERSION) return null;
  if (typeof v.received !== "string" || !SATS.test(v.received)) return null;
  if (typeof v.due !== "string" || !SATS.test(v.due)) return null;
  const received = BigInt(v.received);
  const due = BigInt(v.due);
  if (received >= due || due > MAX_SATS) return null;
  return { received, due, at: event.created_at };
}

/**
 * The event of the owner's acceptance of the sale whose own key is `saleKey`: signed with the
 * owner's key of that sale (from `ownerSecret`, the business's link owner key's secret).
 */
export function saleAcceptanceEvent(
  ownerSecret: Uint8Array,
  saleKey: Uint8Array,
  { received, due }: { received: bigint; due: bigint },
  createdAt: number
): NostrEvent {
  if (received < 1n || received >= due || due > MAX_SATS) {
    throw new Error("Invalid acceptance");
  }
  return sealRecord({
    type: RECORD_TYPE,
    value: {
      version: SALE_ACCEPTANCE_VERSION,
      received: received.toString(),
      due: due.toString()
    },
    signer: saleOwnerSecretKey(ownerSecret, saleKey),
    encryptionKey: encryptionKeyOf(saleKey),
    address: saleAcceptanceAddress(saleKey),
    createdAt
  });
}

/**
 * What a relay sent, if it is the acceptance of the sale whose own key is `saleKey`, signed by the
 * owner's key of that sale (`owner`: the business's link owner key, hex): null otherwise.
 */
export function openSaleAcceptance(value: unknown, owner: string, saleKey: Uint8Array) {
  return openRecord(value, {
    type: RECORD_TYPE,
    encryptionKey: encryptionKeyOf(saleKey),
    address: saleAcceptanceAddress(saleKey),
    author: saleOwnerPublicKey(owner, saleKey),
    parse: parseSaleAcceptance
  });
}

/** A sale whose acceptance is read: its own key and the relays it is on. */
export type AcceptedSaleRef = { saleKey: Uint8Array; relays: readonly string[] };

/** What the relays hold of a sale's acceptance. */
export type AcceptanceRead =
  | { kind: "none" }
  | {
      kind: "accepted";
      acceptance: SaleAcceptance;
      /** The record, and the relays of the read that hold it: the owner sends it to the others. */
      event: NostrEvent;
      holders: readonly string[];
      relays: readonly string[];
    }
  /** Of a newer format: an app of today counts it as none, and never writes over it. */
  | { kind: "newer" };

/** Sales read in one query (each adds an author and a `d` tag to it). */
const SALES_PER_READ = 50;

/** Per relay, connection included (as a payment link's read). */
export const SALE_ACCEPTANCE_TIMEOUT_MS = 10_000;

/**
 * The acceptances of `sales`, by their sale's registry identity (deriveSaleKeys' public key,
 * hex), for the business whose link owner key is `owner` (hex): read on each sale's relays, those
 * of one list in one query (SALES_PER_READ at a time). A sale whose relays did not answer with a
 * majority is left out of the map: not read, never "none". The newest valid copy counts (as relays
 * keep it); one of a newer format, newer than it, makes it "newer".
 */
export async function readSaleAcceptances(
  sales: readonly AcceptedSaleRef[],
  owner: string,
  { signal }: { signal?: AbortSignal } = {}
): Promise<Map<string, AcceptanceRead>> {
  const found = new Map<string, AcceptanceRead>();
  // The sales of each list of relays, each once.
  const byRelays = new Map<string, { relays: readonly string[]; sales: Uint8Array[] }>();
  const seen = new Set<string>();
  for (const { saleKey, relays } of sales) {
    const id = bytesToHex(saleKey);
    if (seen.has(id) || relays.length === 0) continue;
    seen.add(id);
    const key = JSON.stringify(relays);
    const group = byRelays.get(key);
    if (group) group.sales.push(saleKey);
    else byRelays.set(key, { relays, sales: [saleKey] });
  }
  const reads: Promise<void>[] = [];
  for (const { relays, sales: keys } of byRelays.values()) {
    for (let start = 0; start < keys.length; start += SALES_PER_READ) {
      const batch = keys.slice(start, start + SALES_PER_READ);
      reads.push(
        readBatch(batch, relays, owner, signal).then((read) => {
          for (const [author, result] of read) found.set(author, result);
        })
      );
    }
  }
  await Promise.all(reads);
  return found;
}

/** Most sales whose derived keys are kept (derivedOf): the rows of a list, read again and again. */
const MAX_DERIVED = 2_000;
const derived = new Map<string, { sale: string; author: string; address: string }>();

/**
 * The registry identity of the sale whose own key is `saleKey`, the author of its acceptance for
 * the business's link owner key `owner`, and its address: derived once (elliptic-curve work the
 * screens would redo at each read).
 */
function derivedOf(owner: string, saleKey: Uint8Array) {
  const id = `${owner}:${bytesToHex(saleKey)}`;
  let found = derived.get(id);
  if (!found) {
    found = {
      sale: deriveSaleKeys(saleKey).nostr.publicKey,
      author: saleOwnerPublicKey(owner, saleKey),
      address: saleAcceptanceAddress(saleKey)
    };
    if (derived.size >= MAX_DERIVED) derived.clear();
    derived.set(id, found);
  }
  return found;
}

async function readBatch(
  saleKeys: readonly Uint8Array[],
  relays: readonly string[],
  owner: string,
  signal: AbortSignal | undefined
): Promise<Map<string, AcceptanceRead>> {
  const entries = saleKeys.map((saleKey) => ({ saleKey, ...derivedOf(owner, saleKey) }));
  const answers = await queryRelays(
    {
      kinds: [30078],
      authors: entries.map(({ author }) => author),
      "#d": entries.map(({ address }) => address)
    },
    // A sale's own records, as its payment link's: never as the account's keys.
    { relays, channel: "anonymous", timeoutMs: SALE_ACCEPTANCE_TIMEOUT_MS, signal },
    { quorum: "majority" }
  );
  const found = new Map<string, AcceptanceRead>();
  if (answers.size < majority(relays.length)) return found;
  for (const { saleKey, sale } of entries) {
    const read = newestRecord(answers, (value) => openSaleAcceptance(value, owner, saleKey));
    const { newest, newestUnreadable } = read;
    if (newestUnreadable !== null && (!newest || newestUnreadable >= newest.event.created_at)) {
      found.set(sale, { kind: "newer" });
    } else if (newest) {
      const holders = [...read.copies].flatMap(([relay, at]) =>
        at === newest.event.created_at ? [relay] : []
      );
      found.set(sale, {
        kind: "accepted",
        acceptance: newest.value,
        event: newest.event,
        holders,
        relays
      });
    } else {
      found.set(sale, { kind: "none" });
    }
  }
  return found;
}

/**
 * Publishes the owner's acceptance `event` of a sale on `relays`, signed with `authKey` (the owner's
 * key of the sale, NIP-42): done once a majority took it; rejects otherwise (the owner tries again:
 * the same event, never another one).
 */
export function publishSaleAcceptance(
  event: NostrEvent,
  authKey: Uint8Array,
  relays: readonly string[]
): Promise<void> {
  return publishToQuorum(
    event,
    { channel: "anonymous", relays, timeoutMs: SALE_ACCEPTANCE_TIMEOUT_MS, authKey },
    majority(relays.length)
  );
}
