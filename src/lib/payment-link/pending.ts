import { schnorr } from "@noble/curves/secp256k1.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils.js";

import { logFailure } from "@/lib/log/log";
import { toleranceOf } from "@/lib/onchain/tolerance";
import { decodeRelayList, encodeRelayList } from "@/lib/relays/list";
import { parseAddressPool, type AddressPool } from "@/lib/terminal/model";

import type { PaymentLink } from "./link";
import { getItem, removeItem, setItem } from "./pending-backend";
import { parsePaymentLinkPayload, payloadOfSale, type PaymentLinkPayload } from "./payload";

/*
 * The payment links this device made whose final version is not published yet: what the device
 * needs to settle the sale later (after a restart, or once its last
 * invoice ended 3 hours ago) and to sign the final version as the link's author. One entry per link,
 * each below the 2 KB some iOS releases refused in the Keychain (expo-secure-store's docs), and an
 * index of their ids. The link's signing key leaves the device with its final version: then
 * nobody can replace that version any more.
 *
 * Each link keeps the relays it went to (version 2): its final version goes there,
 * where its payer's page reads, even once the device has another list. The list is an entry of its
 * own, `terminal-pending-relays.<16 hex digits of its hash>`, shared by the links made on it and
 * removed with the last of them: in the link's entry, a list of 10 relays would pass the 2 KB.
 */

/**
 * The index: the pending links, oldest first, by 16 hex digits of their id (64 bits: 64 of them
 * stay well below 2 KB too). Never rename it.
 */
export const PENDING_LINKS_KEY = "terminal-pending-links";
const ENTRY_PREFIX = "terminal-pending-link.";
/** A list of relays of pending links, by 16 hex digits of its hash (relaysId). Never rename it. */
const RELAYS_PREFIX = "terminal-pending-relays.";
const PENDING_LINK_VERSION = 2;
/**
 * At most this many links wait for their final version on a device; a new one then drops the
 * oldest, whose final version only the owner can publish (src/features/payment-link/). A link waits
 * 3 hours after its sale at most, longer only while what paid its address is being confirmed.
 */
export const PENDING_LINKS_LIMIT = 64;

export type PendingLink = {
  version: typeof PENDING_LINK_VERSION;
  /** Hex: the link's author, the public key of `secret` (not stored: derived when read). */
  id: string;
  /** Hex: the link's signing key. */
  secret: string;
  /** Hex: the sale's key, the link's. */
  key: string;
  /** Unix seconds: the link event's `created_at`; its final version is dated after it. */
  createdAt: number;
  payload: PaymentLinkPayload;
  /**
   * Where its on-chain address came from (src/features/terminal/onchain-pool.ts): the pool of the
   * owner's wallet, or an employee's lot. The address goes back there once the final version leaves
   * it out. Null without an address.
   */
  pool: AddressPool | null;
  /** The relays the link went to, which its URL names: its final version goes there. */
  relays: readonly string[];
  /**
   * The sale's tolerance of on-chain underpayments (basis points, src/lib/onchain/tolerance.ts),
   * held from its start: this device settles the sale with it. 0: none. Optional in the entry, the
   * format unchanged: absent when none, and from the entries of apps before
   * it, read as none; an app before it ignores it and settles against the whole amount.
   */
  tolerance: number;
};

/** 16 hex digits of the hash of a list of relays: its entry's name, which link entries name. */
function relaysId(relays: readonly string[]): string {
  return bytesToHex(sha256(utf8ToBytes(encodeRelayList(relays)))).slice(0, 16);
}

/** 16 hex digits of a link's id (64 bits): its name in the index and in its entry's key. */
function shortId(id: string): string {
  return id.replace(/-/g, "").slice(0, 16);
}

function entryKey(id: string): string {
  return `${ENTRY_PREFIX}${shortId(id)}`;
}

/**
 * A stored entry, checked: its payload as a link holds it; its id, the author of its key (the
 * loader checks it against the entry's name); its relays, from the list its entry names
 * (`relaysOf`, the lists read by the loader).
 */
export function parsePendingLink(
  value: unknown,
  network: string,
  relaysOf: (id: string) => readonly string[] | null = () => null
): PendingLink | null {
  if (value === null || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const relays =
    v.version === PENDING_LINK_VERSION && typeof v.relays === "string" ? relaysOf(v.relays) : null;
  if (
    relays === null ||
    typeof v.secret !== "string" ||
    !/^[0-9a-f]{64}$/.test(v.secret) ||
    typeof v.key !== "string" ||
    !/^[0-9a-f]{64}$/.test(v.key) ||
    !Number.isSafeInteger(v.createdAt) ||
    (v.createdAt as number) <= 0 ||
    (v.pool !== null && parseAddressPool(v.pool) === null)
  ) {
    return null;
  }
  const link = parsePaymentLinkPayload(v.payload, network);
  if (link?.kind !== "sale" || link.sale.final !== null) return null;
  let id: string;
  try {
    id = bytesToHex(schnorr.getPublicKey(hexToBytes(v.secret)));
  } catch {
    return null;
  }
  return {
    version: PENDING_LINK_VERSION,
    id,
    secret: v.secret,
    key: v.key,
    createdAt: v.createdAt as number,
    payload: payloadOfSale(link.sale),
    pool: v.pool === null ? null : parseAddressPool(v.pool),
    relays,
    // Absent, or not a tolerance: none.
    tolerance: toleranceOf(v.tolerance)
  };
}

/** The list a link entry names (its `relays`), null when it has none or it cannot be read. */
async function readRelays(id: string): Promise<string[] | null> {
  const stored = await getItem(`${RELAYS_PREFIX}${id}`);
  if (stored === null) return null;
  const value: unknown = JSON.parse(stored);
  if (value === null || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (v.version !== 1 || typeof v.relays !== "string") return null;
  const relays = decodeRelayList(v.relays);
  return relays && relaysId(relays) === id ? relays : null;
}

/** The id of the list the stored entry of link `short` names, null without one. */
async function entryRelaysId(short: string): Promise<string | null> {
  try {
    const stored = await getItem(`${ENTRY_PREFIX}${short}`);
    if (stored === null) return null;
    const relays = (JSON.parse(stored) as { relays?: unknown } | null)?.relays;
    return typeof relays === "string" ? relays : null;
  } catch {
    return null;
  }
}

/** Removes the lists among `ids` that no entry of `remaining` (short ids of links) names. */
async function releaseRelays(ids: Iterable<string | null>, remaining: readonly string[]) {
  const candidates = new Set([...ids].filter((id): id is string => id !== null));
  if (candidates.size === 0) return;
  for (const short of remaining) {
    const id = await entryRelaysId(short);
    if (id !== null) candidates.delete(id);
    if (candidates.size === 0) return;
  }
  for (const id of candidates) await removeItem(`${RELAYS_PREFIX}${id}`);
}

/**
 * The index's short ids. Rejects when it cannot be read: a change written over it would lose the
 * other links.
 */
async function readIndex(): Promise<string[]> {
  const stored = await getItem(PENDING_LINKS_KEY);
  if (stored === null) return [];
  const ids: unknown = JSON.parse(stored);
  if (!Array.isArray(ids)) throw new Error("Unreadable index of the pending links");
  return ids.filter((id): id is string => typeof id === "string" && /^[0-9a-f]{16}$/.test(id));
}

// Every change of the index goes through one queue: two links saved at once both stay.
let queue: Promise<unknown> = Promise.resolve();

function serialized<T>(change: () => Promise<T>): Promise<T> {
  const next = queue.then(change, change);
  queue = next.catch(() => undefined);
  return next;
}

/**
 * What this device keeps of `link` until its final version is published; `pool`: where its
 * on-chain address came from, null without one; `tolerance`: its sale's (basis points, 0: none).
 */
export function pendingOf(
  link: PaymentLink,
  pool: AddressPool | null = null,
  tolerance = 0
): PendingLink {
  return {
    version: PENDING_LINK_VERSION,
    id: link.id,
    secret: bytesToHex(link.secretKey),
    key: bytesToHex(link.key),
    createdAt: link.event.created_at,
    payload: link.payload,
    pool,
    relays: link.relays,
    tolerance
  };
}

/**
 * Keeps `link` until its final version is published; drops the oldest beyond the limit. Rejects,
 * keeping nothing, when the index cannot be read.
 */
export function savePendingLink(
  link: PaymentLink,
  pool: AddressPool | null = null,
  tolerance = 0
): Promise<void> {
  const entry = pendingOf(link, pool, tolerance);
  const short = shortId(link.id);
  return serialized(async () => {
    const known = await readIndex();
    // The list first: an entry never names a list that is not there.
    const listId = relaysId(entry.relays);
    if ((await readRelays(listId).catch(() => null)) === null) {
      await setItem(
        `${RELAYS_PREFIX}${listId}`,
        JSON.stringify({ version: 1, relays: encodeRelayList(entry.relays) })
      );
    }
    // Without its id, which its key gives, and with its list's id only: the entry stays below the
    // Keychain's 2 KB with a business name and a note of their longest (pending-link size test).
    // Its tolerance only when it has one, as apps before it wrote none.
    const { id: _id, relays: _relays, tolerance: _tolerance, ...stored } = entry;
    await setItem(
      entryKey(link.id),
      JSON.stringify({
        ...stored,
        relays: listId,
        ...(entry.tolerance > 0 ? { tolerance: entry.tolerance } : {})
      })
    );
    const ids = [...known.filter((id) => id !== short), short];
    const dropped = ids.slice(0, Math.max(0, ids.length - PENDING_LINKS_LIMIT));
    const kept = ids.slice(dropped.length);
    await setItem(PENDING_LINKS_KEY, JSON.stringify(kept));
    const droppedLists: (string | null)[] = [];
    for (const id of dropped) {
      droppedLists.push(await entryRelaysId(id));
      await removeItem(`${ENTRY_PREFIX}${id}`);
    }
    await releaseRelays(droppedLists, kept);
  });
}

/** The pending links this device keeps, oldest first; an unreadable one is left out. */
export async function loadPendingLinks(network: string): Promise<PendingLink[]> {
  let ids: string[];
  try {
    ids = await readIndex();
  } catch (error) {
    logFailure("Unreadable pending links", error);
    return [];
  }
  const links: PendingLink[] = [];
  const lists = new Map<string, string[] | null>();
  for (const id of ids) {
    try {
      const stored = await getItem(`${ENTRY_PREFIX}${id}`);
      const value: unknown = stored === null ? null : JSON.parse(stored);
      const listId = (value as { relays?: unknown } | null)?.relays;
      if (typeof listId === "string" && /^[0-9a-f]{16}$/.test(listId) && !lists.has(listId)) {
        lists.set(listId, await readRelays(listId).catch(() => null));
      }
      const link =
        value === null ? null : parsePendingLink(value, network, (list) => lists.get(list) ?? null);
      if (link && shortId(link.id) === id) links.push(link);
    } catch (error) {
      logFailure("Unreadable pending link", error);
    }
  }
  return links;
}

/**
 * Forgets link `id`: its final version is published, its signing key goes with it. Resolves with
 * whether this call removed its entry: of two calls for one link (the invoice's screen and the
 * pending links' worker, or a retry), one only, so that what follows the removal (its on-chain
 * address back to the pool, finalize.ts) happens once.
 */
export function removePendingLink(id: string): Promise<boolean> {
  const short = shortId(id);
  return serialized(async () => {
    const existed = (await getItem(entryKey(id))) !== null;
    const listId = existed ? await entryRelaysId(short) : null;
    // The entry goes first: an index that cannot be read is left as it is, its name then leads to
    // nothing.
    await removeItem(entryKey(id));
    const ids = await readIndex();
    const remaining = ids.filter((other) => other !== short);
    if (ids.includes(short)) {
      await setItem(PENDING_LINKS_KEY, JSON.stringify(remaining));
    }
    // Its list, once no other link names it.
    await releaseRelays([listId], remaining);
    return existed;
  });
}

/**
 * Forgets every pending link and their lists of relays ("Log out"): their final versions
 * are then the owner's to publish, for the employees' links only (owner-finals.ts).
 */
export function clearPendingLinks(): Promise<void> {
  return serialized(async () => {
    let ids: string[] = [];
    try {
      ids = await readIndex();
    } catch {
      // Unreadable: its entries cannot be named, the index goes all the same.
    }
    const lists = new Set<string>();
    for (const id of ids) {
      const list = await entryRelaysId(id);
      if (list !== null) lists.add(list);
      await removeItem(`${ENTRY_PREFIX}${id}`);
    }
    for (const list of lists) await removeItem(`${RELAYS_PREFIX}${list}`);
    await removeItem(PENDING_LINKS_KEY);
  });
}
