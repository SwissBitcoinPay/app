import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

import { LEASE_GRACE_SECONDS } from "@/config/onchain";
import { REGISTRY_TIMEOUT_MS, majority } from "@/config/registry";
import { decodeBolt11 } from "@/lib/lightning/bolt11";
import { isHttpsUrl, type Invoice } from "@/lib/lightning/lnurl";
import type { NostrEvent } from "@/lib/nostr/event";
import type { NostrKeys } from "@/lib/nostr/keys";
import { conversationKey, nip44Decrypt, nip44Encrypt } from "@/lib/nostr/nip44";
import { queryRelaysPaged } from "@/lib/nostr/pool";
import { NewerRecordError, RECORD_KIND, openRecord, sealRecord } from "@/lib/nostr/record";
import { parseTaprootAddress } from "@/lib/onchain/address";
import { toleranceOf } from "@/lib/onchain/tolerance";
import { isSatsNumber } from "@/lib/sats";
import { currentRelays } from "@/lib/relays/current";

import {
  declarationKey,
  deriveSaleKeys,
  dTagOf,
  isTakerTag,
  outerKey,
  parseSale,
  type DeclaredSale,
  type Registry
} from "./registry";

/*
 * The leases of on-chain addresses (checkout-spec SPEC.md §31). An
 * integration's server has no wallet: its orders take an address of the lot the owner gave the
 * integration (src/lib/integrations/onchain-lot.ts) for the time of their invoice, by publishing
 * a lease at the address's own place in the business's registry, signed by the order's sale. Two
 * servers that lease one address at once cannot both keep it: each reads the address again once
 * its own lease is on a majority of the relays, and the later reader sees both and withdraws its
 * own (a newer record of the same author at the same place). A lease is published with
 * `confirmed` false, then, once that read confirmed it, published again with `confirmed` true (its
 * mark, which replaces it): only then is the address the order's (checkout-spec 0.1.0). A lease
 * not confirmed (`confirmed` false, or absent) is a try its customer never saw, no order's. A lease
 * stays once it ended: a payment broadcast in its time is its sale's for good.
 *
 * The app never leases an address (its point of sale takes them from its own pool): the owner
 * reads the leases, to tell which sale a deposit of its wallet paid ("Wallet",
 * src/features/activity/onchain-sales.ts). `leaseEvent` and `withdrawalEvent` write them as a
 * server does, for the tests.
 *
 * As a declaration (registry.ts), a lease opens outside with the registry key (outerKey: its
 * address and its author), so that only a holder of the registry key makes one that counts; inside
 * with the conversation between its sale and the business's reading key. Its `end` is outside:
 * every server reads whether an address is leased, never whose sale it is.
 *
 * Never change the record's type, its address (`onchain/v1/…`) nor its keys once released: every
 * integration's server writes them (checkout-spec's vectors/onchain-leases.json locks them).
 */

const RECORD_TYPE = "registry-onchain";

/** Format of a lease, outside and inside. */
const LEASE_VERSION = 1;

/** d(A): where the leases of the deposit address `address` are. */
export function onchainRegistryAddress(registryKey: Uint8Array, address: string): string {
  return bytesToHex(hmac(sha256, registryKey, utf8ToBytes(`onchain/v1/${address}`)));
}

/** A lease's outside: its end and what it says sealed, or the withdrawal of its author's lease. */
export type LeaseOutside = { kind: "lease"; end: number; sealed: string } | { kind: "withdrawn" };

function parseOutside(value: unknown): LeaseOutside | null {
  if (value === null || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (typeof v.version === "number" && v.version > LEASE_VERSION) throw new NewerRecordError();
  if (v.version !== LEASE_VERSION) return null;
  if (v.withdrawn === true) return { kind: "withdrawn" };
  if (!Number.isSafeInteger(v.end) || typeof v.sealed !== "string") return null;
  return { kind: "lease", end: v.end as number, sealed: v.sealed };
}

/** What a lease says inside, opened. */
export type Lease = {
  address: string;
  sats: bigint;
  /** The order's Lightning invoice, null for an order paid on-chain only. */
  invoice: Invoice | null;
  createdAt: number;
  expiresAt: number;
  /** Unix seconds: when the lease ends, `expiresAt` + LEASE_GRACE_SECONDS. */
  end: number;
  saleKey: Uint8Array;
  /** Who took the sale (takerTag), null when it does not say. */
  taker: string | null;
  /**
   * The order's tolerance of on-chain underpayments (basis points, src/lib/onchain/tolerance.ts):
   * its server's channel's when the order was created (SPEC.md §31, "The merchant's tolerance"),
   * which judges its payment for good. 0 when absent (none, or a server of before), or not one.
   */
  tolerance: number;
  /**
   * Whether it is the lease of an order (SPEC.md §31, Leases): `confirmed` true (its mark). False,
   * or absent: a try that was never shown to the customer, no order's.
   */
  confirmed: boolean;
} & DeclaredSale;

/** The lease's JSON, inside (SPEC.md §31). */
type LeaseValue = {
  version: typeof LEASE_VERSION;
  address: string;
  sats: number;
  invoice: string | null;
  verifyUrl: string | null;
  createdAt: number;
  expiresAt: number;
  sale: { key: string } & DeclaredSale;
  taker?: string;
  /** Only when above 0 (SPEC.md §31, Leases). */
  tolerance?: number;
  /** False as first published, true in its mark. */
  confirmed?: boolean;
};

/**
 * The lease inside `outside`, if it opens with `innerKey` and is valid for the address whose place
 * is `place` (d(A)) on `network` ("bc"): null otherwise. Throws NewerRecordError for a lease of a
 * newer format.
 */
export function parseLease(
  outside: Extract<LeaseOutside, { kind: "lease" }>,
  innerKey: Uint8Array,
  registryKey: Uint8Array,
  place: string,
  network: string
): Lease | null {
  let value: unknown;
  try {
    value = JSON.parse(nip44Decrypt(outside.sealed, innerKey));
  } catch {
    return null;
  }
  if (value === null || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (typeof v.version === "number" && v.version > LEASE_VERSION) throw new NewerRecordError();
  if (v.version !== LEASE_VERSION || typeof v.address !== "string") return null;
  const address = parseTaprootAddress(v.address, network);
  if (address !== v.address || onchainRegistryAddress(registryKey, address) !== place) return null;
  if (!isSatsNumber(v.sats)) return null;
  if (!Number.isSafeInteger(v.createdAt) || !Number.isSafeInteger(v.expiresAt)) return null;
  const createdAt = v.createdAt as number;
  const expiresAt = v.expiresAt as number;
  if (createdAt >= expiresAt || outside.end !== expiresAt + LEASE_GRACE_SECONDS) return null;
  let invoice: Invoice | null = null;
  if (v.invoice !== null || v.verifyUrl !== null) {
    if (typeof v.invoice !== "string" || !isHttpsUrl(v.verifyUrl)) return null;
    const decoded = decodeBolt11(v.invoice);
    if (!decoded || decoded.network !== network) return null;
    if (decoded.amountMsat !== BigInt(v.sats) * 1000n) return null;
    if (decoded.timestamp !== createdAt) return null;
    if (decoded.timestamp + decoded.expirySeconds !== expiresAt) return null;
    invoice = { pr: v.invoice, decoded, verifyUrl: v.verifyUrl };
  }
  const sale = parseSale(v.sale);
  if (!sale) return null;
  return {
    address,
    sats: BigInt(v.sats),
    invoice,
    createdAt,
    expiresAt,
    end: outside.end,
    saleKey: sale.key,
    fiat: sale.fiat,
    note: sale.note,
    taker: isTakerTag(v.taker) ? v.taker : null,
    // Absent, or not a tolerance: none (SPEC.md §31).
    tolerance: toleranceOf(v.tolerance),
    // Anything but true: a try, no order's.
    confirmed: v.confirmed === true
  };
}

/** What a server leases an address for: its order's invoice (null: on-chain only) and times. */
export type LeaseTerms = {
  address: string;
  sats: bigint;
  invoice: Invoice | null;
  createdAt: number;
  expiresAt: number;
  /** The order's tolerance (basis points), written only when above 0. */
  tolerance?: number;
  /** False as first published, true in its mark (SPEC.md §31, Leasing an address). */
  confirmed: boolean;
};

/** The signed lease of `terms.address` for the sale of `registry`, which `sale` describes. */
export function leaseEvent(
  registry: Registry,
  terms: LeaseTerms,
  sale: DeclaredSale,
  now: number
): NostrEvent {
  const value: LeaseValue = {
    version: LEASE_VERSION,
    address: terms.address,
    sats: Number(terms.sats),
    invoice: terms.invoice?.pr ?? null,
    verifyUrl: terms.invoice?.verifyUrl ?? null,
    createdAt: terms.createdAt,
    expiresAt: terms.expiresAt,
    sale: { key: bytesToHex(registry.saleKey), fiat: sale.fiat, note: sale.note },
    ...(registry.taker ? { taker: registry.taker } : {}),
    ...(terms.tolerance ? { tolerance: terms.tolerance } : {}),
    confirmed: terms.confirmed
  };
  const place = onchainRegistryAddress(registry.key, terms.address);
  return sealRecord({
    type: RECORD_TYPE,
    value: {
      version: LEASE_VERSION,
      end: terms.expiresAt + LEASE_GRACE_SECONDS,
      sealed: nip44Encrypt(JSON.stringify(value), declarationKey(registry))
    },
    signer: registry.saleKeys.nostr.secretKey,
    encryptionKey: outerKey(registry.key, place, registry.saleKeys.nostr.publicKey),
    address: place,
    createdAt: now
  });
}

/** The withdrawal of the sale's lease of `address`, dated after it (`createdAt`). */
export function withdrawalEvent(registry: Registry, address: string, createdAt: number) {
  const place = onchainRegistryAddress(registry.key, address);
  return sealRecord({
    type: RECORD_TYPE,
    value: { version: LEASE_VERSION, withdrawn: true },
    signer: registry.saleKeys.nostr.secretKey,
    encryptionKey: outerKey(registry.key, place, registry.saleKeys.nostr.publicKey),
    address: place,
    createdAt
  });
}

/**
 * A lease as the owner reads it: whose sale (its author), what it says, and its event as it is
 * (copied to the account's new relays at a change of relays).
 */
export type OwnerLease = { author: string; leasedAt: number; event: NostrEvent } & Lease;

/** What the owner finds at the place of an address. */
export type AddressLeases = {
  /**
   * Each author's newest record, when it is a lease that opens: withdrawn ones are left out. One
   * not `confirmed` is no order's lease (leaseOfSale, onchain-sales.ts).
   */
  leases: OwnerLease[];
  /** A record there is of a newer format: whose the address was cannot be told. */
  newer: boolean;
};

/** At most this many addresses' places per query. */
const ADDRESSES_PER_READ = 50;

/**
 * The leases of `addresses` (deposit addresses of `network`), opened with the business's reading
 * key: who leased each, for which sale, until when; `since` (Unix seconds), only those made since.
 * Paged: an address goes from order to order, its leases add up. Null when fewer than a majority
 * of the relays answered (a lease may be on the others: any two majorities share a relay).
 *
 * Anybody can write at a lease's place (it is public): a content of a newer NIP-44 version there,
 * which any key can sign, is no record (SPEC.md §31, "Opening a lease"); only a value of a newer
 * version, which the registry key seals, is of a newer format.
 */
export async function ownerLeasesOf(
  owner: { key: Uint8Array; reader: NostrKeys },
  addresses: readonly string[],
  network: string,
  {
    relays = currentRelays(),
    timeoutMs = REGISTRY_TIMEOUT_MS,
    since
  }: { relays?: readonly string[]; timeoutMs?: number; since?: number } = {}
): Promise<Map<string, AddressLeases> | null> {
  const result = new Map<string, AddressLeases>();
  const unique = [...new Set(addresses)];
  for (let start = 0; start < unique.length; start += ADDRESSES_PER_READ) {
    const byPlace = new Map(
      unique
        .slice(start, start + ADDRESSES_PER_READ)
        .map((address) => [onchainRegistryAddress(owner.key, address), address] as const)
    );
    const answers = await queryRelaysPaged(
      {
        kinds: [RECORD_KIND],
        "#d": [...byPlace.keys()],
        ...(since === undefined ? {} : { since })
      },
      // As the declarations (registry.ts): the anonymous connection's own key, never the reader.
      { channel: "anonymous", relays, timeoutMs },
      { quorum: "majority" }
    );
    if (answers.size < majority(relays.length)) return null;
    // Each author's newest record at each place: a withdrawal replaces its lease.
    const newest = new Map<string, { event: NostrEvent; outside: LeaseOutside | "newer" }>();
    for (const events of answers.values()) {
      for (const value of events) {
        const place = dTagOf(value);
        const author = (value as Partial<NostrEvent> | null)?.pubkey;
        if (place === null || typeof author !== "string" || !byPlace.has(place)) continue;
        let opened;
        try {
          opened = openRecord(value, {
            type: RECORD_TYPE,
            encryptionKey: outerKey(owner.key, place, author),
            address: place,
            author,
            parse: parseOutside,
            newerContentIgnored: true
          });
        } catch {
          // An author that is not a key: not a lease of this business.
          continue;
        }
        if (!opened) continue;
        const key = `${place}:${author}`;
        const known = newest.get(key);
        const event = opened.event;
        if (
          known &&
          (known.event.created_at > event.created_at ||
            (known.event.created_at === event.created_at && known.event.id <= event.id))
        ) {
          continue;
        }
        newest.set(key, {
          event,
          outside: opened.status === "newer" ? "newer" : opened.value
        });
      }
    }
    for (const address of byPlace.values()) result.set(address, { leases: [], newer: false });
    for (const [key, { event, outside }] of newest) {
      const place = key.slice(0, key.indexOf(":"));
      const found = result.get(byPlace.get(place)!)!;
      if (outside === "newer") {
        found.newer = true;
        continue;
      }
      if (outside.kind === "withdrawn") continue;
      try {
        const lease = parseLease(
          outside,
          conversationKey(owner.reader.secretKey, event.pubkey),
          owner.key,
          place,
          network
        );
        // Signed by the sale it names, as a declaration (registry.ts): whoever holds another
        // sale's key cannot speak for it, and a copy authenticates with that sale's key.
        if (lease && deriveSaleKeys(lease.saleKey).nostr.publicKey === event.pubkey) {
          found.leases.push({ ...lease, author: event.pubkey, leasedAt: event.created_at, event });
        }
      } catch (error) {
        if (error instanceof NewerRecordError) found.newer = true;
      }
    }
  }
  return result;
}
