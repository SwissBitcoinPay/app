import { hexToBytes } from "@noble/hashes/utils.js";

import { majority } from "@/config/registry";
import { getBreezNetwork } from "@/lib/breez/config";
import { logFailure } from "@/lib/log/log";
import { nowUnix } from "@/lib/rates/snapshot";
import { currentRelays } from "@/lib/relays/current";
import { deriveMemberKeys, type MemberKeys } from "@/lib/team/keys";
import {
  MEMBER_LOT_VERSION,
  lotEntry,
  splitLotEntry,
  type StoredMemberLot
} from "@/lib/team/member-lot";
import { clearMemberLot, loadMemberLot, saveMemberLot } from "@/lib/team/member-lot-store";
import { publishMemberRecord } from "@/lib/team/member-records";
import { loadMembership } from "@/lib/team/membership-store";
import { EMPLOYEE_LOT_VERSION, fetchLot, usedEvent, type MemberLot } from "@/lib/team/onchain-lot";

/*
 * The employee's side of its lot of on-chain addresses (src/lib/team/onchain-lot.ts): the lot the
 * owner gave it, read with its channel (at launch and back in
 * the foreground), the addresses its sales take from it (src/features/terminal/onchain-pool.ts),
 * and those it used, published for the owner after each change.
 */

// Every change of the stored lot goes through one queue: a sale taking an address while the lot is
// read never loses either.
let queue: Promise<unknown> = Promise.resolve();

function serialized<T>(change: () => Promise<T>): Promise<T> {
  const next = queue.then(change, change);
  queue = next.catch(() => undefined);
  return next;
}

/** The stored lot of team `team`; another team's counts as none. */
async function lotOf(team: string): Promise<StoredMemberLot | null> {
  const lot = await loadMemberLot(getBreezNetwork());
  return lot && lot.team === team ? lot : null;
}

const addressOf = (entry: string) => splitLotEntry(entry).address;

/** The addresses left in the lot of `team`, in the order to take them. */
export async function lotAddresses(team: string): Promise<string[]> {
  return ((await serialized(() => lotOf(team)))?.available ?? []).map(addressOf);
}

/**
 * The tags of the addresses this launch's sales took: a sale's link may be made after the owner's
 * next lot left its address out (an underpayment shared later). A sale lives in memory too.
 */
const takenTags = new Map<string, string>();

/**
 * The owner's tag of `address`, taken by a sale of this launch, or of the lot of `team` (left or
 * used): what the records of the sale and of its link carry, so that the owner knows it gave it
 * (onchain-lot.ts). Null when neither holds it, or when the lot cannot be read. Never rejects.
 */
export async function lotTag(team: string, address: string): Promise<string | null> {
  const taken = takenTags.get(`${team}:${address}`);
  if (taken !== undefined) return taken;
  try {
    const lot = await serialized(() => lotOf(team));
    const entry = [...(lot?.available ?? []), ...(lot?.used ?? [])].find(
      (other) => addressOf(other) === address
    );
    return entry === undefined ? null : splitLotEntry(entry).tag;
  } catch (error) {
    // The record goes without it: the owner then does not vouch for an on-chain payment.
    logFailure("Reading the lot of on-chain addresses failed", error);
    return null;
  }
}

/**
 * Moves `address` from the addresses left to the used ones (taken for a sale, or paid already), and
 * tells the owner. False when it is no longer left (another sale took it).
 */
export async function takeFromLot(team: string, address: string): Promise<boolean> {
  const taken = await serialized(async () => {
    const lot = await lotOf(team);
    const entry = lot?.available.find((other) => addressOf(other) === address);
    if (!lot || entry === undefined) return false;
    await saveMemberLot({
      ...lot,
      available: lot.available.filter((other) => other !== entry),
      used: [...lot.used, entry]
    });
    takenTags.set(`${team}:${address}`, splitLotEntry(entry).tag);
    return true;
  });
  if (taken) publishUsed(team);
  return taken;
}

/**
 * Puts `address` back at the end of the addresses left (nothing reached it), and tells the owner.
 * Nothing when it is not a used address of the current lot (the owner's next lot left it out).
 */
export async function returnToLot(team: string, address: string): Promise<void> {
  const returned = await serialized(async () => {
    const lot = await lotOf(team);
    const entry = lot?.used.find((other) => addressOf(other) === address);
    if (!lot || entry === undefined) return false;
    await saveMemberLot({
      ...lot,
      available: [...lot.available, entry],
      used: lot.used.filter((other) => other !== entry)
    });
    return true;
  });
  if (returned) publishUsed(team);
}

/**
 * Keeps `lot`, read from the relays, when it is newer than the stored one: its addresses not used
 * yet are left, in its order; the used ones stay used while it still holds them (the owner had not
 * seen them used yet), and are forgotten once it does not. Resolves with whether it changed.
 */
export function applyLot(team: string, lot: MemberLot): Promise<boolean> {
  return serialized(async () => {
    const stored = await lotOf(team);
    if (stored && stored.lotAt >= lot.updatedAt) return false;
    const entries = lot.addresses.map((address, i) => lotEntry(address, lot.tags[i]));
    const usedAddresses = new Set((stored?.used ?? []).map(addressOf));
    await saveMemberLot({
      version: MEMBER_LOT_VERSION,
      team,
      lotAt: lot.updatedAt,
      available: entries.filter((entry) => !usedAddresses.has(addressOf(entry))),
      used: entries.filter((entry) => usedAddresses.has(addressOf(entry)))
    });
    return true;
  });
}

/**
 * Reads the employee's lot (with its channel, src/features/team/member.ts): a newer one is kept, and
 * the used addresses go to the owner again when it changed, once per launch (a publication that
 * failed gets another chance), and when `publish` (the business changed its relays). Never rejects.
 */
export async function syncMemberLot(
  team: string,
  keys: MemberKeys,
  { publish = false }: { publish?: boolean } = {}
): Promise<void> {
  try {
    const lot = await fetchLot(team, keys, getBreezNetwork());
    const changed = lot ? await applyLot(team, lot) : false;
    if (changed || publish || !publishedThisLaunch) publishUsed(team);
  } catch (error) {
    logFailure("Reading the lot of on-chain addresses failed", error);
  }
}

/** Forgets the lot: the device leaves its team. */
export function forgetMemberLot(): Promise<void> {
  return serialized(() => clearMemberLot());
}

/** `updatedAt` of the last used addresses published: each one is newer. */
let lastPublished = 0;
let publishedThisLaunch = false;

/** Publishes the used addresses of the lot of `team`, in the background. */
function publishUsed(team: string): void {
  void (async () => {
    const [membership, lot] = await Promise.all([loadMembership(), lotOf(team)]);
    if (!membership || membership.team !== team || !lot) return;
    const keys = deriveMemberKeys(hexToBytes(membership.secret));
    publishedThisLaunch = true;
    lastPublished = Math.max(nowUnix(), lastPublished + 1);
    const relays = currentRelays();
    const took = await publishMemberRecord(
      keys,
      usedEvent(keys, {
        version: EMPLOYEE_LOT_VERSION,
        used: lot.used.map(addressOf),
        lotAt: lot.lotAt,
        updatedAt: lastPublished
      }),
      relays
    );
    // Fewer than a majority: the owner's read may miss it (it fills the lots from it). Published
    // again at the next sync of the lot.
    if (took.length < majority(relays.length)) publishedThisLaunch = false;
  })().catch((error: unknown) => {
    publishedThisLaunch = false;
    logFailure("Publishing the used on-chain addresses failed", error);
  });
}

/** Tests only: forgets the last publication's date and the tags taken. */
export function resetUsedPublications(): void {
  lastPublished = 0;
  publishedThisLaunch = false;
  takenTags.clear();
}
