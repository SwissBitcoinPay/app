import { hmac } from "@noble/hashes/hmac.js";
import { epochSealFor } from "@/lib/nostr/epochs";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

import { majority } from "@/config/registry";
import { ASSISTANT_LOT_SIZE, MEMBER_LOT_SIZE } from "@/config/team";
import type { BreezNetwork } from "@/lib/breez/config";
import type { NostrEvent } from "@/lib/nostr/event";
import { queryRelays, type RelayCall } from "@/lib/nostr/pool";
import {
  NewerRecordError,
  RECORD_KIND,
  newestRecord,
  openRecord,
  sealRecord,
  type NewestRecord
} from "@/lib/nostr/record";
import { parseDepositAddress } from "@/lib/onchain/address";
import { currentRelays } from "@/lib/relays/current";

import { recordAddress, usableTeamKeys, type MemberKeys, type TeamKeys } from "./keys";
import { TEAM_TIMEOUT_MS, isUnixSeconds } from "./shared";

/*
 * The on-chain addresses of an employee's device. Only the
 * owner's wallet hands out addresses: the owner gives each employee its own lot, a record signed
 * by the team and readable by the employee and the owner only, as the employee's channel. The
 * employee's device takes its sales' addresses from it, and publishes those it used (taken for a
 * sale, or paid already), signed by its own key: it can neither add, change nor remove an address
 * of its lot. At its next login or unlock, the owner drops the used ones and fills the lot up again
 * (src/features/team/owner-addresses.ts). Each address carries the owner's tag (issueTag): the
 * owner recognizes its own addresses in the employee's sales, without a list of them. One lot per
 * employee: two devices never take the same
 * address, where a shared list with "reserved" flags would need an atomic reservation relays do
 * not offer. An assistant holds a lot the same way, its MCP
 * server in the employee's device's place (sattleme/mcp-server, SPEC.md §10).
 */

const LOT_TYPE = "team-onchain-lot";
const USED_TYPE = "team-onchain-used";

/**
 * The versions of the lot's format, each with the most addresses it holds: version 1, an
 * employee's (MEMBER_LOT_SIZE: what its device keeps in its secure store); version 2, an
 * assistant's (ASSISTANT_LOT_SIZE). The record of the addresses used
 * takes the version of the lot they come from: never more addresses than it.
 */
const LOT_SIZES = { 1: MEMBER_LOT_SIZE, 2: ASSISTANT_LOT_SIZE } as const;

export type LotVersion = keyof typeof LOT_SIZES;

/** The version an employee's lot is written in, the only one its device takes. */
export const EMPLOYEE_LOT_VERSION: LotVersion = 1;
/** The version an assistant's lot is written in. */
export const ASSISTANT_LOT_VERSION: LotVersion = 2;
/** The newest version this app knows: the owner reads every one up to it. */
const NEWEST_LOT_VERSION: LotVersion = 2;

function isLotVersion(value: unknown): value is LotVersion {
  return value === 1 || value === 2;
}

/** The lot the owner gave an employee: the addresses it may show, in the order to take them. */
export type MemberLot = {
  version: LotVersion;
  addresses: string[];
  /** The tag of each address (issueTag), in the same order. */
  tags: string[];
  /** Unix seconds, strictly increasing: the record's `created_at`. */
  updatedAt: number;
};

/** 8 bytes, hex: a tag of the owner's (issueTag). */
const TAG = /^[0-9a-f]{16}$/;

export function isIssueTag(value: unknown): value is string {
  return typeof value === "string" && TAG.test(value);
}

/**
 * The tag of `address`, given to member `memberId`: the first 8 bytes of an HMAC-SHA256 with the
 * owner's issue key (deriveIssueKey). The employee's device copies it into the record of the sale
 * that shows the address (member-records.ts); the owner computes it again to tell that it gave the
 * address itself (src/features/payment-link/owner-finals.ts). 64 bits: a guess is only ever checked
 * on a sale paid on-chain, never offline.
 */
export function issueTag(issueKey: Uint8Array, memberId: string, address: string): string {
  return bytesToHex(hmac(sha256, issueKey, utf8ToBytes(`${memberId}:${address}`))).slice(0, 16);
}

/** Whether `tag` is the owner's tag of `address` for member `memberId`. */
export function isIssuedAddress(
  issueKey: Uint8Array,
  memberId: string,
  address: string,
  tag: string
): boolean {
  return isIssueTag(tag) && issueTag(issueKey, memberId, address) === tag;
}

/** The addresses of its lot the employee's device used: taken for a sale, or paid already. */
export type MemberUsedAddresses = {
  version: LotVersion;
  used: string[];
  /**
   * `updatedAt` of the lot the device holds: the owner never fills a lot from an older copy than
   * that one (a relay that missed the newest lot), which may hold addresses the newest dropped as
   * used, and that the device no longer keeps as used.
   */
  lotAt: number;
  /** Unix seconds, strictly increasing: the record's `created_at`. */
  updatedAt: number;
};

/** The `d` tag of the employee's lot (signed by the team). */
export function lotRecordAddress(keys: MemberKeys): string {
  return recordAddress(keys, "onchain-lot");
}

/** The `d` tag of the addresses the employee's device used (signed by the member). */
export function usedRecordAddress(keys: MemberKeys): string {
  return recordAddress(keys, "onchain-used");
}

/**
 * Distinct deposit addresses of `network`, at most what `version` holds (LOT_SIZES): null
 * otherwise (more than its version holds, or of another network).
 */
function parseAddresses(
  value: unknown,
  network: BreezNetwork,
  version: LotVersion
): string[] | null {
  if (!Array.isArray(value) || value.length > LOT_SIZES[version]) return null;
  const addresses: string[] = [];
  for (const item of value) {
    const address = typeof item === "string" ? parseDepositAddress(item, network) : null;
    if (address === null || address !== item || addresses.includes(address)) return null;
    addresses.push(address);
  }
  return addresses;
}

function parseLot(value: unknown, event: NostrEvent, network: BreezNetwork): MemberLot | null {
  if (value === null || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (!isLotVersion(v.version) || !isUnixSeconds(v.updatedAt)) return null;
  if (v.updatedAt !== event.created_at) return null;
  const addresses = parseAddresses(v.addresses, network, v.version);
  if (!addresses || !Array.isArray(v.tags) || v.tags.length !== addresses.length) return null;
  if (!v.tags.every(isIssueTag)) return null;
  return { version: v.version, addresses, tags: v.tags, updatedAt: v.updatedAt };
}

function parseUsed(
  value: unknown,
  event: NostrEvent,
  network: BreezNetwork
): MemberUsedAddresses | null {
  if (value === null || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (!isLotVersion(v.version) || !isUnixSeconds(v.updatedAt)) return null;
  if (v.updatedAt !== event.created_at || !isUnixSeconds(v.lotAt)) return null;
  const used = parseAddresses(v.used, network, v.version);
  return used ? { version: v.version, used, lotAt: v.lotAt, updatedAt: v.updatedAt } : null;
}

/** An employee's lot, signed by the team: only the owner makes one. */
export function lotEvent(team: TeamKeys, keys: MemberKeys, lot: MemberLot): NostrEvent {
  return sealRecord({
    type: LOT_TYPE,
    value: lot,
    signer: usableTeamKeys(team).secretKey,
    encryptionKey: keys.channel.encryptionKey,
    address: lotRecordAddress(keys),
    createdAt: lot.updatedAt
  });
}

/** The addresses an employee's device used, signed by the employee. */
export function usedEvent(keys: MemberKeys, used: MemberUsedAddresses): NostrEvent {
  return sealRecord({
    type: USED_TYPE,
    value: used,
    signer: keys.nostr.secretKey,
    encryptionKey: keys.records.encryptionKey,
    address: usedRecordAddress(keys),
    createdAt: used.updatedAt,
    epoch: epochSealFor(keys.records.encryptionKey)
  });
}

/**
 * A version above `newest`, the reader's last: of a newer format, never written over
 * (NewerRecordError). An employee's device reads version 1 only, the owner every version known.
 */
function refuseNewer(payload: unknown, newest: LotVersion): void {
  const version = (payload as { version?: unknown } | null)?.version;
  if (typeof version === "number" && version > newest) throw new NewerRecordError();
}

function openLot(
  value: unknown,
  teamPublicKey: string,
  keys: MemberKeys,
  network: BreezNetwork,
  newest: LotVersion
) {
  return openRecord(value, {
    type: LOT_TYPE,
    encryptionKey: keys.channel.encryptionKey,
    address: lotRecordAddress(keys),
    author: teamPublicKey,
    parse: (payload, event) => {
      refuseNewer(payload, newest);
      return parseLot(payload, event, network);
    }
  });
}

function openUsed(value: unknown, keys: MemberKeys, network: BreezNetwork) {
  return openRecord(value, {
    type: USED_TYPE,
    encryptionKey: keys.records.encryptionKey,
    address: usedRecordAddress(keys),
    author: keys.nostr.publicKey,
    parse: (payload, event) => {
      refuseNewer(payload, NEWEST_LOT_VERSION);
      return parseUsed(payload, event, network);
    }
  });
}

/** Whether a copy of a newer format is the newest the relays hold. */
function newerThanRead(found: NewestRecord<unknown>): boolean {
  return (
    found.newestUnreadable !== null &&
    found.newestUnreadable >= (found.newest?.event.created_at ?? -1)
  );
}

/**
 * The employee's lot, as its device reads it: the newest copy signed by the team `teamPublicKey`.
 * `undefined` when no relay answered, null when none holds one it takes (version 1 only: a lot of
 * more addresses than its secure store keeps is an assistant's).
 */
export async function fetchLot(
  teamPublicKey: string,
  keys: MemberKeys,
  network: BreezNetwork,
  relays: readonly string[] = currentRelays()
): Promise<MemberLot | null | undefined> {
  const answers = await queryRelays(
    { kinds: [RECORD_KIND], authors: [teamPublicKey], "#d": [lotRecordAddress(keys)] },
    {
      channel: "account",
      relays,
      timeoutMs: TEAM_TIMEOUT_MS.background,
      authKey: keys.nostr.secretKey
    },
    { quorum: "majority" }
  );
  if (answers.size === 0) return undefined;
  return (
    newestRecord(answers, (value) =>
      openLot(value, teamPublicKey, keys, network, EMPLOYEE_LOT_VERSION)
    ).newest?.value ?? null
  );
}

/** What the owner reads of an employee (or an assistant): its lot and the addresses it used. */
export type MemberLotState = {
  lot: MemberLot | null;
  used: MemberUsedAddresses | null;
  /**
   * The newest copy of the lot or of the addresses used is of a newer format (a newer app of the
   * owner's, or a newer assistant): the lot is left as it is.
   */
  newer: boolean;
};

/**
 * The lots and used addresses of several employees (two queries, each until a majority answered),
 * by member id, for the owner: `teamAuthKey` is the team's key, the lots' author. Null when a query
 * got fewer than a majority's answers: a newer lot, or addresses used, may be on the others (the
 * owner fills the lots from them).
 */
export async function fetchLotStates(
  team: TeamKeys,
  members: readonly { id: string; keys: MemberKeys }[],
  network: BreezNetwork,
  teamAuthKey: RelayCall["authKey"],
  relays: readonly string[] = currentRelays()
): Promise<Map<string, MemberLotState> | null> {
  if (members.length === 0) return new Map();
  const timeoutMs = TEAM_TIMEOUT_MS.background;
  // Each read authenticated as the authors it reads (NIP-42): the team, then the employees.
  const [lots, used] = await Promise.all([
    queryRelays(
      {
        kinds: [RECORD_KIND],
        authors: [team.publicKey],
        "#d": members.map(({ keys }) => lotRecordAddress(keys))
      },
      { channel: "account", relays, timeoutMs, authKey: teamAuthKey },
      { quorum: "majority" }
    ),
    queryRelays(
      {
        kinds: [RECORD_KIND],
        authors: members.map(({ keys }) => keys.nostr.publicKey),
        "#d": members.map(({ keys }) => usedRecordAddress(keys))
      },
      {
        channel: "account",
        relays,
        timeoutMs,
        authKey: members.map(({ keys }) => keys.nostr.secretKey)
      },
      { quorum: "majority" }
    )
  ]);
  if (lots.size < majority(relays.length) || used.size < majority(relays.length)) return null;
  return new Map(
    members.map(({ id, keys }) => {
      const lot = newestRecord(lots, (value) =>
        openLot(value, team.publicKey, keys, network, NEWEST_LOT_VERSION)
      );
      const usedRead = newestRecord(used, (value) => openUsed(value, keys, network));
      return [
        id,
        {
          lot: lot.newest?.value ?? null,
          used: usedRead.newest?.value ?? null,
          newer: newerThanRead(lot) || newerThanRead(usedRead)
        }
      ];
    })
  );
}
