import { bytesToHex } from "@noble/hashes/utils.js";

import { exportGrantsSuspended } from "@/config/assistants";
import { majority } from "@/config/registry";
import {
  exportDecisionEvent,
  exportGrantFilter,
  exportGrantOf,
  exportKeysParts,
  exportPartEvent,
  newerThanRead,
  type ExportGrantKeys,
  type ExportGrantRead,
  type ExportKeys,
  type ExportKeysPart,
  type GrantEpoch,
  type GrantFormat,
  type GrantRecords,
  type GrantSeat,
  type ReadKeys
} from "@/lib/assistant/export-grant";
import { baseLanguage, toLanguage } from "@/i18n/languages";
import { deriveIntegrationKeys } from "@/lib/integrations/keys";
import { getDeviceLocale } from "@/lib/locale/device";
import type { NostrEvent } from "@/lib/nostr/event";
import type { NostrKeys } from "@/lib/nostr/keys";
import { publishToRelays, queryRelays, type RelayCall } from "@/lib/nostr/pool";
import type { NewestRecord } from "@/lib/nostr/record";
import type { OwnerDevice } from "@/lib/settings/merchant";
import {
  deriveArchiveKeys,
  deriveInvoiceKeys,
  deriveLegacyHistoryKeys,
  deriveMemberKeys,
  derivePaymentRateKeys,
  deriveRegistryReader,
  deriveWalletSendKeys,
  integrationSecretKey,
  memberSecret,
  ownerDeviceSecret,
  usableTeamKeys,
  type MemberKeys,
  type TeamKeys
} from "@/lib/team/keys";
import { ExportEpochError } from "@/lib/team/export-epoch";
import type { RemovedSeat } from "@/lib/team/roster";
import { logFailure } from "@/lib/log/log";

import { assistantKeysOf } from "./assistants";
import { publishRepairs, type Repair } from "./repairs";
import type { Roster } from "./roster";

/*
 * The owner's side of the grants of the transactions' export (src/lib/assistant/export-grant.ts):
 * the keys a grant gives, from the account (the team's root, the
 * roster, the devices of the settings), and their records on the account's relays. owner.ts calls
 * these within its team lock: a sync of the grants never writes over a choice made meanwhile on
 * this device; on another, the decision it reads on a majority of the relays tells it.
 *
 * Each write is decided from what a majority of the relays hold, never over a record of a newer
 * format: the decision first, then the keys, so that keys never wait on the relays for a decision
 * that allows them; withdrawn, the decision first too, then the keys cleared, then the account's
 * export epoch raised (src/lib/team/export-epoch.ts): what is
 * written afterwards is sealed with keys the withdrawn grant never had. A withdrawal dated after the
 * epoch's latest raise (one whose raise failed, or made by an app before epochs) raises it at the
 * next sync. The grants still allowed then name the new epoch (format 2), at the next sync.
 */

/**
 * The account's export epoch, as the grants need it (owner.ts gives it): what a majority of the
 * relays gave this device, and the date of its latest raise (-1: none), null while not read; the
 * seed of an epoch (hex); and its raise, once a grant ended, dated `at` or later, which rejects with
 * ExportEpochError.
 */
export type GrantEpochs = {
  /** Asked again at each use: a raise made meanwhile counts at once. */
  known: () => { epoch: number; latest: number } | null;
  /** An epoch learnt from a grant's keys: this device never seals nor raises below it. */
  note: (epoch: number) => void;
  seedOf: (epoch: number) => string;
  raise: (at: number) => Promise<void>;
};

/** Grants unchanged for this long are written again, dated then (relays drop old events). */
const GRANT_REFRESH_SECONDS = 30 * 24 * 60 * 60;

/**
 * This device's format (GrantFormat): the language its texts are in (as src/i18n/ picks it), the
 * locale of its numbers and dates, its time zone (the engine's when the platform tells none), as its
 * own "Export" writes them. The language without its variant ("de" for "de-CH": the
 * format's readers know two letters only); the locale's region tells the variant, as
 * `toLanguage` reads it.
 */
export function deviceFormat(): GrantFormat {
  const locale = getDeviceLocale();
  let timeZone = locale.timeZone;
  if (!timeZone) {
    try {
      timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || null;
    } catch {
      timeZone = null;
    }
  }
  return {
    language: baseLanguage(toLanguage(locale.languageTag)),
    locale: locale.languageTag,
    timeZone
  };
}

/** The keys of the export grant of the assistant `id`. */
export function grantKeysOf(team: TeamKeys, id: string): ExportGrantKeys {
  return assistantKeysOf(team, id).exportGrant;
}

function readKeysOf(keys: {
  nostr: NostrKeys;
  encryptionKey: Uint8Array;
  addressKey: Uint8Array;
}): ReadKeys {
  return {
    author: keys.nostr.publicKey,
    encryptionKey: bytesToHex(keys.encryptionKey),
    addressKey: bytesToHex(keys.addressKey)
  };
}

function recordsOf(keys: MemberKeys): GrantRecords {
  return {
    sales: keys.nostr.publicKey,
    links: keys.links.publicKey,
    encryptionKey: bytesToHex(keys.records.encryptionKey),
    addressKey: bytesToHex(keys.records.addressKey)
  };
}

/** A seat of the roster (in the team or removed) with the keys of what records its payments. */
function grantSeatOf(
  team: TeamKeys,
  seat: { role: "employee" | "integration" | "assistant"; id: string; name: string },
  since: number,
  removedAt: number | null
): GrantSeat {
  const base = { id: seat.id, name: seat.name, since, removedAt };
  if (seat.role === "employee") {
    return {
      ...base,
      role: "employee",
      records: recordsOf(deriveMemberKeys(memberSecret(team, seat.id)))
    };
  }
  if (seat.role === "assistant") {
    const keys = assistantKeysOf(team, seat.id);
    return {
      ...base,
      role: "assistant",
      records: recordsOf(keys.member),
      invoices: readKeysOf(keys.invoices)
    };
  }
  const keys = deriveIntegrationKeys(integrationSecretKey(team, seat.id));
  return {
    ...base,
    role: "integration",
    channelKey: bytesToHex(keys.channel.encryptionKey),
    seen: { author: keys.seen.nostr.publicKey, addressKey: bytesToHex(keys.seen.addressKey) },
    paid: { author: keys.paid.nostr.publicKey, addressKey: bytesToHex(keys.paid.addressKey) }
  };
}

/** Each removed seat once (its first removal), the latest removal first; none still in the team. */
function removedSeats(roster: Pick<Roster, "removed">, active: ReadonlySet<string>): RemovedSeat[] {
  const first = new Map<string, RemovedSeat>();
  for (const seat of roster.removed) {
    const key = `${seat.role}:${seat.id}`;
    if (active.has(key)) continue;
    const known = first.get(key);
    if (!known || seat.removedAt < known.removedAt) first.set(key, seat);
  }
  return [...first.values()].sort((a, b) => b.removedAt - a.removedAt || (a.id < b.id ? -1 : 1));
}

/**
 * What a grant gives (ExportKeys) for the account of `team`: its own records' reading keys, then
 * every device of the owner that took payments (`devices`, the settings'), the roster's employees,
 * integrations and assistants, then those removed, the latest removal first.
 */
export function exportKeysOf(
  team: TeamKeys,
  devices: readonly OwnerDevice[],
  roster: Roster,
  /** The format the keys name (GrantFormat): the allowing device's, kept by the others. */
  format: GrantFormat | null = null,
  /** The account's export epoch and its seed (format 2), null at epoch 0. */
  epoch: GrantEpoch | null = null
): ExportKeys {
  const owner: GrantSeat[] = [...devices]
    .sort((a, b) => a.addedAt - b.addedAt || (a.id < b.id ? -1 : 1))
    .map((device) => ({
      role: "owner",
      id: device.id,
      name: null,
      since: device.addedAt,
      removedAt: null,
      records: recordsOf(deriveMemberKeys(ownerDeviceSecret(team, device.id)))
    }));
  const active: GrantSeat[] = [
    ...roster.employees.map((member) =>
      grantSeatOf(team, { ...member, role: "employee" }, member.invitedAt, null)
    ),
    ...roster.integrations.map((integration) =>
      grantSeatOf(team, { ...integration, role: "integration" }, integration.createdAt, null)
    ),
    ...roster.assistants.map((assistant) =>
      grantSeatOf(team, { ...assistant, role: "assistant" }, assistant.createdAt, null)
    )
  ];
  const inTeam = new Set(active.map((seat) => `${seat.role}:${seat.id}`));
  const removed = removedSeats(roster, inTeam).map((seat) =>
    grantSeatOf(team, seat, seat.since, seat.removedAt)
  );
  return {
    account: {
      registryReader: bytesToHex(deriveRegistryReader(team).secretKey),
      invoices: readKeysOf(deriveInvoiceKeys(team)),
      paymentRates: readKeysOf(derivePaymentRateKeys(team)),
      walletSends: readKeysOf(deriveWalletSendKeys(team)),
      archive: readKeysOf(deriveArchiveKeys(team)),
      legacyHistory: readKeysOf(deriveLegacyHistoryKeys(team)),
      ...(epoch ? { epoch } : {})
    },
    format,
    seats: [...owner, ...active, ...removed],
    omitted: 0
  };
}

/** A call to `relays` as the team, which signs the grants. */
function teamCall(team: TeamKeys, relays: readonly string[], timeoutMs: number): RelayCall {
  return {
    relays,
    timeoutMs,
    channel: "account",
    authKey: () => usableTeamKeys(team).secretKey
  };
}

/** What the relays hold of the grant of an assistant: read by a majority, or not. */
export type GrantReading =
  { status: "read"; read: ExportGrantRead; relays: readonly string[] } | { status: "unread" };

/** The grant of the assistant `id` on `relays`; "unread" unless a majority of them answered. */
export async function readExportGrant(
  team: TeamKeys,
  id: string,
  relays: readonly string[],
  timeoutMs: number
): Promise<GrantReading> {
  const keys = grantKeysOf(team, id);
  const answers = await queryRelays(
    exportGrantFilter(team.publicKey, keys),
    teamCall(team, relays, timeoutMs),
    { quorum: "majority" }
  );
  if (answers.size < majority(relays.length)) return { status: "unread" };
  return { status: "read", read: exportGrantOf(answers, team.publicKey, keys), relays };
}

/** What the owner sees of a grant. */
export type ExportStatus =
  /** The newest decision allows it. */
  | "allowed"
  /** No decision, or the newest withdraws it. */
  | "notAllowed"
  /** Written by a newer app of the owner's: not changed by this one. */
  | "newer"
  /** No majority of the relays answered. */
  | "unread";

export function exportStatusOf(reading: GrantReading): ExportStatus {
  if (reading.status === "unread") return "unread";
  if (newerThanRead(reading.read.decision)) return "newer";
  return reading.read.decision.newest?.value.allowed ? "allowed" : "notAllowed";
}

/** The newest date the relays hold at an address, readable or not; -1 without one. */
function latestOf<T>(found: NewestRecord<T>): number {
  return Math.max(found.newest?.event.created_at ?? -1, found.newestUnreadable ?? -1);
}

/** Whether a majority of `relays` took `event` (the others take it in the background). */
async function onMajority(event: NostrEvent, call: RelayCall): Promise<boolean> {
  return (
    (await publishToRelays(event, call, { quorum: "majority" })).length >=
    majority(call.relays.length)
  );
}

/** Thrown when a write was not taken by a majority of the relays, or decided on too few. */
export class GrantUnreachableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GrantUnreachableError";
  }
}

/** Thrown when a newer app of the owner's wrote the grant: never written over. */
export class GrantNewerError extends Error {
  constructor() {
    super("The export grant is of a newer format");
    this.name = "GrantNewerError";
  }
}

/** Thrown when the owner allows an assistant to export while exportGrantsSuspended. */
export class GrantSuspendedError extends Error {
  constructor() {
    super("Allowing an assistant to export is suspended");
    this.name = "GrantSuspendedError";
  }
}

/** Whether two values are the same JSON whatever the order of their members. */
function sameJson(a: unknown, b: unknown): boolean {
  const canonical = (value: unknown): unknown =>
    Array.isArray(value)
      ? value.map(canonical)
      : value !== null && typeof value === "object"
        ? Object.fromEntries(
            Object.keys(value as object)
              .sort()
              .map((key) => [key, canonical((value as Record<string, unknown>)[key])])
          )
        : value;
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}

/**
 * Writes the keys `keys` for the decision of `grantedAt`, every part on a majority of the relays,
 * dated after every part they hold, then clears the parts beyond them that still hold keys.
 * Rejects with GrantUnreachableError when a part was not taken.
 */
async function writeKeys(
  team: TeamKeys,
  grant: ExportGrantKeys,
  read: ExportGrantRead,
  keys: ExportKeys,
  grantedAt: number,
  call: RelayCall,
  now: number
): Promise<void> {
  const parts = exportKeysParts(keys, grantedAt);
  const createdAt = Math.max(now, ...read.parts.map((found) => latestOf(found) + 1));
  const signer = usableTeamKeys(team).secretKey;
  const events = [
    ...parts.map((part) => exportPartEvent(signer, grant, part, createdAt)),
    ...read.parts
      .map((found, part) => ({ found, part }))
      .filter(({ found, part }) => part >= parts.length && found.newest?.value.grantedAt != null)
      .map(({ part }) => exportPartEvent(signer, grant, { grantedAt: null, part }, createdAt))
  ];
  const taken = await Promise.all(events.map((event) => onMajority(event, call)));
  if (!taken.every(Boolean)) {
    throw new GrantUnreachableError("No majority of the relays took the export grant's keys");
  }
}

/**
 * Clears every part that holds keys (the decision no longer allows them). Rejects with
 * GrantUnreachableError when one was not taken.
 */
async function clearKeys(
  team: TeamKeys,
  grant: ExportGrantKeys,
  read: ExportGrantRead,
  call: RelayCall,
  now: number
): Promise<void> {
  const signer = usableTeamKeys(team).secretKey;
  const held = read.parts
    .map((found, part) => ({ found, part }))
    .filter(({ found }) => found.newest?.value.grantedAt != null && !newerThanRead(found));
  const taken = await Promise.all(
    held.map(({ found, part }) =>
      onMajority(
        exportPartEvent(
          signer,
          grant,
          { grantedAt: null, part },
          Math.max(now, latestOf(found) + 1)
        ),
        call
      )
    )
  );
  if (!taken.every(Boolean)) {
    throw new GrantUnreachableError("No majority of the relays cleared the export grant's keys");
  }
}

/**
 * The epoch a grant's keys name: the account's as a majority gave it, or the one its keys name
 * already when higher (an epoch is never lowered: this device learns it); null while it is not
 * known.
 */
function epochToGrant(
  epochs: GrantEpochs,
  read: ExportGrantRead
): { epoch: GrantEpoch | null } | null {
  const named = read.parts[0]?.newest?.value;
  const held = named && named.grantedAt !== null ? (named.account?.epoch?.epoch ?? 0) : 0;
  if (held > 0) epochs.note(held);
  const known = epochs.known();
  if (!known) return null;
  const epoch = Math.max(known.epoch, held);
  return { epoch: epoch >= 1 ? { epoch, seed: epochs.seedOf(epoch) } : null };
}

/**
 * Raises the account's export epoch once a grant ended, dated `at` or later (after its withdrawal):
 * GrantUnreachableError or GrantNewerError when it could not be (tried again at the next sync); an
 * account whose epochs are exhausted keeps its last, logged.
 */
async function raiseEpoch(epochs: GrantEpochs, at: number): Promise<void> {
  try {
    await epochs.raise(at);
  } catch (error) {
    if (!(error instanceof ExportEpochError)) throw error;
    if (error.reason === "newer") throw new GrantNewerError();
    if (error.reason === "exhausted") {
      logFailure("No export epoch is left to raise", error);
      return;
    }
    throw new GrantUnreachableError("No majority of the relays took the export epoch");
  }
}

/**
 * The owner's choice for the assistant `id` ("Export transactions"): its decision on a
 * majority of the account's `relays`, then its keys (allowed) or their clearing (withdrawn).
 * `roster` read on a majority (owner.ts, decidingRoster) and `devices` the settings' give the keys.
 * Rejects with GrantUnreachableError (the relays did not answer or take it: the decision may have
 * been written, the next sync completes it), GrantNewerError, or GrantSuspendedError (allowing,
 * nothing written).
 */
export async function setExportAllowed(
  team: TeamKeys,
  id: string,
  allowed: boolean,
  devices: readonly OwnerDevice[],
  roster: Roster,
  relays: readonly string[],
  timeoutMs: number,
  now: number,
  epochs: GrantEpochs
): Promise<void> {
  if (allowed && exportGrantsSuspended()) throw new GrantSuspendedError();
  const reading = await readExportGrant(team, id, relays, timeoutMs);
  if (reading.status === "unread") {
    throw new GrantUnreachableError("No majority of the relays gave the export grant");
  }
  const { read } = reading;
  if (newerThanRead(read.decision) || read.parts.some(newerThanRead)) throw new GrantNewerError();
  const grant = grantKeysOf(team, id);
  const call = teamCall(team, relays, timeoutMs);
  // Allowed, the keys name the account's epoch: never written while it is not known.
  const epoch = allowed ? epochToGrant(epochs, read) : null;
  if (allowed && !epoch) {
    throw new GrantUnreachableError("No majority of the relays gave the export epoch");
  }
  // What a grant ending ends: keys given, or a decision that allowed them.
  const gave =
    read.decision.newest?.value.allowed === true ||
    read.parts.some((found) => found.newest?.value.grantedAt != null);
  const updatedAt = Math.max(now, latestOf(read.decision) + 1);
  const decision = exportDecisionEvent(usableTeamKeys(team).secretKey, grant, {
    allowed,
    updatedAt
  });
  if (!(await onMajority(decision, call))) {
    throw new GrantUnreachableError("No majority of the relays took the export decision");
  }
  if (allowed) {
    // This device's format: the owner allowed it here (deviceFormat).
    const keys = exportKeysOf(team, devices, roster, deviceFormat(), epoch!.epoch);
    await writeKeys(team, grant, read, keys, updatedAt, call, now);
  } else {
    await clearKeys(team, grant, read, call, now);
    // What is written from now on, sealed with keys the grant never had.
    if (gave) await raiseEpoch(epochs, updatedAt);
  }
}

/**
 * Keeps the grant of an assistant (`seat`, in the team or removed) in step, at a sync of the team
 * (owner.ts): allowed, its keys as the team is now (written again when they changed, or after
 * GRANT_REFRESH_SECONDS), given to the relays lacking them (into `repairs` when given, published
 * by the caller once the team's lock is left: repairs.ts); withdrawn, its keys cleared; a removed
 * assistant's withdrawn first. Only from what a majority of `relays` hold, never over a record of a
 * newer format. Rejects with GrantUnreachableError when a write was not taken.
 */
export async function syncExportGrant(
  team: TeamKeys,
  seat: { id: string; removedAt: number | null },
  devices: readonly OwnerDevice[],
  roster: Roster,
  relays: readonly string[],
  timeoutMs: number,
  now: number,
  epochs: GrantEpochs,
  repairs?: Repair[]
): Promise<void> {
  const reading = await readExportGrant(team, seat.id, relays, timeoutMs);
  if (reading.status === "unread") return;
  const { read } = reading;
  if (newerThanRead(read.decision) || read.parts.some(newerThanRead)) return;
  const grant = grantKeysOf(team, seat.id);
  const call = teamCall(team, relays, timeoutMs);
  const decision = read.decision.newest?.value ?? null;
  if (decision?.allowed && seat.removedAt !== null) {
    // A removed assistant exports nothing more: withdrawn, then its keys cleared, then the
    // account's export epoch raised.
    const updatedAt = Math.max(now, latestOf(read.decision) + 1);
    const withdrawn = exportDecisionEvent(usableTeamKeys(team).secretKey, grant, {
      allowed: false,
      updatedAt
    });
    if (!(await onMajority(withdrawn, call))) {
      throw new GrantUnreachableError("No majority of the relays took the export decision");
    }
    await clearKeys(team, grant, read, call, now);
    await raiseEpoch(epochs, updatedAt);
    return;
  }
  if (!decision?.allowed) {
    await clearKeys(team, grant, read, call, now);
    // A withdrawal after the epoch's latest raise (its raise failed, or an app before epochs made
    // it): raised now. Never on an epoch not known.
    const known = epochs.known();
    if (decision && known && decision.updatedAt > known.latest) {
      await raiseEpoch(epochs, decision.updatedAt);
    }
    return;
  }
  // The keys name the account's epoch: left as they are while it is not known.
  const epoch = epochToGrant(epochs, read);
  if (!epoch) return;
  // The format the keys name already (the allowing device's) stays; this device's when none.
  const named = read.parts[0]?.newest?.value;
  const format =
    named && named.grantedAt !== null && named.format !== null ? named.format : deviceFormat();
  const keys = exportKeysOf(team, devices, roster, format, epoch.epoch);
  const expected = exportKeysParts(keys, decision.updatedAt);
  const current = read.parts.map((found) => found.newest);
  const stale =
    expected.some((part, index) => !sameJson(current[index]?.value, part)) ||
    current.some((copy, index) => index >= expected.length && copy?.value.grantedAt != null) ||
    current
      .slice(0, expected.length)
      .some((copy) => !copy || now - copy.event.created_at > GRANT_REFRESH_SECONDS);
  if (stale) {
    await writeKeys(team, grant, read, keys, decision.updatedAt, call, now);
    return;
  }
  // Up to date: the decision and its keys, as they are, to the relays that answered without them.
  const records = [
    read.decision,
    ...read.parts.slice(0, expected.length)
  ] as NewestRecord<unknown>[];
  for (const found of records) {
    const newest = found.newest;
    if (!newest) continue;
    const lacking = [...found.copies]
      .filter(([, held]) => held === null || held < newest.event.created_at)
      .map(([relay]) => relay)
      .concat(call.relays.filter((relay) => !found.copies.has(relay)));
    if (lacking.length === 0) continue;
    const repair = { event: newest.event, call: { ...call, relays: lacking } };
    if (repairs) repairs.push(repair);
    else await publishRepairs([repair]);
  }
}

/** What a grant's keys part is, for tests and readers: re-exported. */
export type { ExportKeysPart };
