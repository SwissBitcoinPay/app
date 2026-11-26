import { MEMBER_LOT_SIZE } from "@/config/team";
import type { BreezNetwork } from "@/lib/breez/config";
import { parseDepositAddress } from "@/lib/onchain/address";

import { isIssueTag } from "./onchain-lot";
import { isPublicKey, isUnixSeconds } from "./shared";

/*
 * What an employee's device keeps of its lot of on-chain addresses (onchain-lot.ts): the addresses
 * it may still show, and those it used, until the owner's next lot leaves them out. Both are in the
 * lot the device read last, and never meet: an address goes from one to the other when a sale takes
 * it (or the explorer shows it paid already), and back when it went unused. Each entry is
 * `<address>.<tag>`, the owner's tag of the address (onchain-lot.ts), which the device copies into
 * the record of the sale that shows it. Saved by member-lot-store.ts (secure storage in the apps,
 * `localStorage` on the web), at most MEMBER_LOT_SIZE entries in all: below the 2 KB some iOS
 * releases refused in the Keychain (under 1800 bytes, tested).
 */
export type StoredMemberLot = {
  /** Format of this record. A change of format needs a new version and a migration. */
  version: 1;
  /** The team's public key (hex): a lot of another team counts as none. */
  team: string;
  /** Unix seconds: `updatedAt` of the lot read last. An older one never replaces it. */
  lotAt: number;
  /** The entries left, in the order to take them. */
  available: string[];
  used: string[];
};

/** An entry of the stored lot: the address and its tag. */
export function lotEntry(address: string, tag: string): string {
  return `${address}.${tag}`;
}

/** The address and the tag of a stored entry. */
export function splitLotEntry(entry: string): { address: string; tag: string } {
  const dot = entry.lastIndexOf(".");
  return { address: entry.slice(0, dot), tag: entry.slice(dot + 1) };
}

export const MEMBER_LOT_VERSION = 1;

/** Storage key, on the device only. Never rename it: installed apps keep their data there. */
export const MEMBER_LOT_KEY = "team-onchain-lot";

function entries(value: unknown, network: BreezNetwork): string[] | null {
  if (!Array.isArray(value)) return null;
  const valid = value.filter((item): item is string => {
    if (typeof item !== "string") return false;
    const { address, tag } = splitLotEntry(item);
    return parseDepositAddress(address, network) === address && isIssueTag(tag);
  });
  return valid.length === value.length ? valid : null;
}

/** Validates a stored lot; anything else counts as none. */
export function parseStoredMemberLot(
  value: unknown,
  network: BreezNetwork
): StoredMemberLot | null {
  if (value === null || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (v.version !== MEMBER_LOT_VERSION || !isPublicKey(v.team) || !isUnixSeconds(v.lotAt)) {
    return null;
  }
  const available = entries(v.available, network);
  const used = entries(v.used, network);
  if (!available || !used) return null;
  const all = new Set([...available, ...used].map((entry) => splitLotEntry(entry).address));
  if (all.size !== available.length + used.length || all.size > MEMBER_LOT_SIZE) return null;
  return { version: MEMBER_LOT_VERSION, team: v.team, lotAt: v.lotAt, available, used };
}
