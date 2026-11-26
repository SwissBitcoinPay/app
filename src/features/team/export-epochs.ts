import {
  getAccountSettings,
  getAccountTeamKeys,
  getAccountWalletId,
  subscribeAccount
} from "@/features/account/session";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";

import { logFailure } from "@/lib/log/log";
import { addEpochHolder, familyOf, type EpochHolder } from "@/lib/nostr/epochs";
import type { NostrKeys } from "@/lib/nostr/keys";
import { MAX_CHANNEL_EPOCHS, type ChannelEpoch } from "@/lib/team/channel";
import {
  EXPORT_EPOCH_TIMEOUT_MS,
  EpochSeeds,
  keepExportEpoch,
  readExportEpoch,
  type EpochReading
} from "@/lib/team/export-epoch";
import {
  deriveArchiveKeys,
  deriveInvoiceKeys,
  deriveLegacyHistoryKeys,
  derivePaymentRateKeys,
  deriveRegistryReader,
  deriveWalletSendKeys,
  ownerDevicesSecret,
  type TeamKeys
} from "@/lib/team/keys";
import { currentRelays } from "@/lib/relays/current";

/*
 * The export epoch on this device (src/lib/team/export-epoch.ts):
 * what seals the records an assistant's export grant reads, and opens them, registered with
 * src/lib/nostr/epochs.ts.
 *
 * - One of the owner's devices (the account open, or in till mode) holds the secret the owner's
 *   devices share: it seals the families it writes (the account's own records while it is open,
 *   this device's sales and links in any case) at the epoch it knows, and opens every epoch's. It
 *   learns the epoch from the account's relays (refreshOwnerEpoch: at the account's opening, then
 *   before a record is written if it was not read for OWNER_EPOCH_MAX_AGE_MS), and from a raise it
 *   made itself (noteOwnerEpoch). An epoch is only ever raised: what it knows never goes back.
 * - An employee's device holds what its channel gives (src/lib/team/channel.ts, `exportEpoch`):
 *   the epoch, and its own records' keys of the latest epochs.
 *
 * A device that does not know the epoch yet seals as before (epoch 0, or the one it knew): such a
 * record stays readable to a copy of a grant withdrawn since, never lost.
 */

/** A read of the epoch older than this is made again before a record of the owner's is written. */
export const OWNER_EPOCH_MAX_AGE_MS = 10 * 60_000;

type OwnerHolding = {
  /** The account (its wallet id, lowercase). */
  account: string;
  /** The secret the owner's devices share: the epoch's record is read with it. */
  shared: Uint8Array;
  seeds: EpochSeeds;
  /** The highest epoch this device knows: read, or raised itself. */
  epoch: number;
  /** When a majority of the relays last gave it (ms), null before. */
  readAt: number | null;
  /** When a read last got no majority (ms), null since one did. */
  failedAt: number | null;
  /** When the epoch known was raised (Unix seconds, its record's `raisedAt`), -1 without one. */
  latest: number;
  /** The families this device seals (familyOf of their own keys). */
  writes: Set<string>;
  /**
   * The registry's reading key of before epochs (its public half, hex), once known: its
   * declarations are sealed at this device's epoch, never another business's.
   */
  reader: string | null;
  /** The registry's reading keys of the epochs computed (an ECDH key each). */
  readers: Map<number, NostrKeys>;
  /** A read in progress. */
  reading: Promise<EpochReading> | null;
  remove: () => void;
};

/**
 * By account (wallet id, lowercase): one per account whose epochs this device holds (the account
 * open, the one its till mode takes payments for: never one for the other).
 */
const owners = new Map<string, OwnerHolding>();

function ownerOf(account: string): OwnerHolding | null {
  return owners.get(account.toLowerCase()) ?? null;
}

function ownerHolder(holding: OwnerHolding): EpochHolder {
  return {
    sealFor: (base) => {
      if (holding.epoch < 1 || !holding.writes.has(familyOf(base))) return null;
      const key = holding.seeds.keyOf(holding.epoch, base);
      return key ? { epoch: holding.epoch, key } : null;
    },
    keyOf: (epoch, base) => holding.seeds.keyOf(epoch, base),
    readerFor: (reader) => {
      if (holding.epoch < 1 || reader !== holding.reader) return null;
      const keys = readerOf(holding, holding.epoch);
      return keys ? { epoch: holding.epoch, reader: keys.publicKey } : null;
    },
    readerOf: (epoch, reader) => (reader === holding.reader ? readerOf(holding, epoch) : null)
  };
}

/** The registry's reading key of `epoch` for the account held, computed once. */
function readerOf(holding: OwnerHolding, epoch: number): NostrKeys | null {
  const known = holding.readers.get(epoch);
  if (known) return known;
  const keys = holding.seeds.readerOf(epoch);
  if (keys) holding.readers.set(epoch, keys);
  return keys;
}

/**
 * Holds the epochs of the account `account` (its wallet id), whose owner's devices share `shared`,
 * this device sealing the families `writes` (their own keys) from now on: added to those it held
 * for the same account; another account's stay held.
 */
export function holdOwnerEpochs(
  account: string,
  shared: Uint8Array,
  writes: readonly Uint8Array[],
  /** The registry's reading key of before epochs (hex), when known (registry.ts, sealInside). */
  reader: string | null = null
): void {
  const id = account.toLowerCase();
  let holding = owners.get(id);
  if (!holding) {
    holding = {
      account: id,
      shared,
      seeds: new EpochSeeds({ shared }),
      epoch: 0,
      readAt: null,
      failedAt: null,
      latest: -1,
      writes: new Set(),
      reader: null,
      readers: new Map(),
      reading: null,
      remove: () => undefined
    };
    holding.remove = addEpochHolder(ownerHolder(holding));
    owners.set(id, holding);
  }
  for (const base of writes) holding.writes.add(familyOf(base));
  if (reader !== null) holding.reader = reader;
}

/** The epoch this device knows for `account`, and whether a majority of the relays gave it. */
export function ownerEpoch(account: string): { epoch: number; read: boolean } | null {
  const holding = ownerOf(account);
  return holding ? { epoch: holding.epoch, read: holding.readAt !== null } : null;
}

/**
 * An epoch this device raised itself for `account` (raiseExportEpoch), its record dated `at`:
 * known at once.
 */
export function noteOwnerEpoch(account: string, epoch: number, at: number = -1): void {
  const holding = ownerOf(account);
  if (!holding) return;
  if (epoch > holding.epoch) holding.epoch = epoch;
  if (at > holding.latest) holding.latest = at;
}

/**
 * The account's epoch as a majority of the relays gave this device (or as it raised it), the date
 * of its latest raise (-1: none) and the seed of that epoch (hex, null at epoch 0), for the export
 * grants (export-grants.ts); null while no majority gave it.
 */
export function ownerGrantEpoch(
  account: string
): { epoch: number; latest: number; seed: string | null } | null {
  const holding = ownerOf(account);
  if (!holding || holding.readAt === null) return null;
  const seed = holding.epoch >= 1 ? holding.seeds.seedOf(holding.epoch) : null;
  return {
    epoch: holding.epoch,
    latest: holding.latest,
    seed: seed ? bytesToHex(seed) : null
  };
}

/** The seed of `epoch` of the account held (hex), null when none. */
export function ownerEpochSeed(account: string, epoch: number): string | null {
  const seed = ownerOf(account)?.seeds.seedOf(epoch) ?? null;
  return seed ? bytesToHex(seed) : null;
}

/** After a read that got no majority, the next one starts no sooner than this. */
const RETRY_MS = 30_000;

/**
 * Reads the epoch of the account held on `relays`, unless a majority gave it less than `maxAgeMs`
 * ago, or a read failed less than RETRY_MS ago: what it knows is raised to the highest copy any
 * relay sent. Waits for that read `waitMs` at most (the read goes on). Resolves with the epoch known
 * then and whether a majority ever gave it; null without that account held. Never rejects.
 */
export async function refreshOwnerEpoch(
  account: string,
  relays: readonly string[],
  maxAgeMs: number = 0,
  waitMs: number = Infinity
): Promise<{ epoch: number; read: boolean } | null> {
  const holding = ownerOf(account);
  if (!holding) return null;
  const now = Date.now();
  const fresh = holding.readAt !== null && now - holding.readAt < maxAgeMs;
  const tried = holding.failedAt !== null && now - holding.failedAt < RETRY_MS;
  if (!fresh && !tried && !holding.reading) {
    holding.reading = readEpochOf(holding, relays).finally(() => {
      holding.reading = null;
    });
  }
  const reading = fresh ? null : holding.reading;
  if (reading) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      reading,
      ...(Number.isFinite(waitMs)
        ? [new Promise((resolve) => (timer = setTimeout(resolve, waitMs)))]
        : [])
    ]);
    if (timer !== undefined) clearTimeout(timer);
  }
  return { epoch: holding.epoch, read: holding.readAt !== null };
}

async function readEpochOf(
  holding: OwnerHolding,
  relays: readonly string[]
): Promise<EpochReading> {
  const reading = await readExportEpoch(holding.shared, relays, EXPORT_EPOCH_TIMEOUT_MS);
  if (reading.epoch > holding.epoch) holding.epoch = reading.epoch;
  if (reading.status !== "unread" && reading.raisedAt > holding.latest) {
    holding.latest = reading.raisedAt;
  }
  if (reading.status === "unread") holding.failedAt = Date.now();
  else {
    holding.readAt = Date.now();
    holding.failedAt = null;
  }
  return reading;
}

type MemberHolding = {
  /** The member's own records' key: the only family it seals and opens. */
  base: string;
  /** The registry's reading key of before epochs (hex): its declarations are sealed at the epoch. */
  reader: string;
  epoch: number;
  keys: Map<number, Uint8Array>;
  readers: Map<number, string>;
  remove: () => void;
};

let member: MemberHolding | null = null;

/**
 * Holds what the channel of a member gives (`exportEpoch`, ChannelEpoch): its records' keys (their
 * own key `base`) and the registry's reading keys (of the registry whose reading key of before
 * epochs is `reader`) of the latest epochs; replaces what it held before. Null: nothing held (the
 * account at epoch 0, or an app of before epochs wrote the channel).
 */
export function holdMemberEpochs(
  base: Uint8Array,
  reader: string,
  channel: ChannelEpoch | null
): void {
  releaseMemberEpochs();
  if (!channel) return;
  const holding: MemberHolding = {
    base: familyOf(base),
    reader,
    epoch: channel.epoch,
    keys: new Map(channel.epochs.map(({ epoch, key }) => [epoch, hexToBytes(key)])),
    readers: new Map(channel.epochs.map(({ epoch, reader: at }) => [epoch, at])),
    remove: () => undefined
  };
  holding.remove = addEpochHolder({
    sealFor: (family) => {
      if (familyOf(family) !== holding.base) return null;
      const key = holding.keys.get(holding.epoch);
      return key ? { epoch: holding.epoch, key } : null;
    },
    keyOf: (epoch, family) =>
      familyOf(family) === holding.base ? (holding.keys.get(epoch) ?? null) : null,
    readerFor: (at) => {
      if (at !== holding.reader) return null;
      const epochReader = holding.readers.get(holding.epoch);
      return epochReader ? { epoch: holding.epoch, reader: epochReader } : null;
    },
    readerOf: (epoch, at) => {
      const publicKey = at === holding.reader ? holding.readers.get(epoch) : undefined;
      return publicKey ? { publicKey } : null;
    }
  });
  member = holding;
}

/** Forgets what the channel of a member gave (it left its team). */
export function releaseMemberEpochs(): void {
  member?.remove();
  member = null;
}

/** Tests only: forgets every epoch held. */
export function resetExportEpochs(): void {
  for (const holding of owners.values()) holding.remove();
  owners.clear();
  releaseMemberEpochs();
}

/** The families the open account's owner seals at its epoch: what an export grant reads of it. */
function accountFamilies(team: TeamKeys): Uint8Array[] {
  return [
    deriveInvoiceKeys(team).encryptionKey,
    deriveWalletSendKeys(team).encryptionKey,
    derivePaymentRateKeys(team).encryptionKey,
    deriveArchiveKeys(team).encryptionKey,
    deriveLegacyHistoryKeys(team).encryptionKey
  ];
}

/**
 * Holds the epochs of the account `team` opens (accountFamilies, its registry): from its opening,
 * before anything of it is read, its records and declarations of any epoch open on this device.
 * Its epoch is read before the first record is sealed (ownerEpochSettled). Throws once its keys
 * are wiped.
 */
function holdAccount(team: TeamKeys, walletId: string): void {
  holdOwnerEpochs(
    walletId,
    ownerDevicesSecret(team),
    accountFamilies(team),
    deriveRegistryReader(team).publicKey
  );
}

subscribeAccount(() => {
  const team = getAccountTeamKeys();
  const walletId = getAccountWalletId();
  if (!team || !walletId) return;
  try {
    holdAccount(team, walletId);
  } catch (error) {
    logFailure("Holding the account's export epochs failed", error);
  }
});

/**
 * Holds the open account's epochs (its own records sealed at its epoch from now on), and resolves
 * once its epoch was read on its relays, unless it was less than OWNER_EPOCH_MAX_AGE_MS ago (or
 * could not be: what this device knew then). Writers of the account's records wait for it before
 * they seal one. Nothing without an account open. Never rejects.
 */
export async function ownerEpochSettled(): Promise<void> {
  const team = getAccountTeamKeys();
  const walletId = getAccountWalletId();
  const settings = getAccountSettings();
  if (!team || !walletId || !settings) return;
  try {
    holdAccount(team, walletId);
  } catch (error) {
    // The account closed meanwhile (its team keys wiped): nothing is written for it any more.
    logFailure("Holding the account's export epochs failed", error);
    return;
  }
  await refreshOwnerEpoch(walletId, settings.relays, OWNER_EPOCH_MAX_AGE_MS);
}

/**
 * Holds the epochs of the account `walletId` for this device's own sales and links (their key
 * `base`), whose owner's devices share `shared` (till mode too), and resolves once its epoch was
 * read as ownerEpochSettled, on the device's relays. Never rejects.
 */
export async function deviceEpochSettled(
  walletId: string,
  shared: Uint8Array,
  writes: readonly Uint8Array[],
  /** The registry's reading key of before epochs (hex), as the device saved its registry. */
  reader: string | null,
  /** How long to wait for the read at most (the read goes on). */
  waitMs: number = Infinity
): Promise<void> {
  holdOwnerEpochs(walletId, shared, writes, reader);
  await refreshOwnerEpoch(walletId, currentRelays(), OWNER_EPOCH_MAX_AGE_MS, waitMs);
}

/**
 * What the channel of an employee whose own records' key is `base` gives of the epochs of
 * `account` (ChannelEpoch of src/lib/team/channel.ts): null at epoch 0, or while no majority of the
 * relays gave this device the epoch (the channel keeps what it carries).
 */
export function ownerChannelEpoch(account: string, base: Uint8Array): ChannelEpoch | null {
  const holding = ownerOf(account);
  if (!holding || holding.readAt === null || holding.epoch < 1) return null;
  const epochs: ChannelEpoch["epochs"] = [];
  for (let at = Math.max(1, holding.epoch - MAX_CHANNEL_EPOCHS + 1); at <= holding.epoch; at += 1) {
    const key = holding.seeds.keyOf(at, base);
    const reader = readerOf(holding, at);
    if (!key || !reader) return null;
    epochs.push({ epoch: at, key: bytesToHex(key), reader: reader.publicKey });
  }
  return { epoch: holding.epoch, epochs };
}

/**
 * Keeps the open account's epoch record on its relays (keepExportEpoch): signed again once a month,
 * written again at the highest epoch this device knows when the relays lost it. At each sync of
 * the team. Never rejects.
 */
export async function keepAccountEpoch(): Promise<void> {
  const team = getAccountTeamKeys();
  const walletId = getAccountWalletId();
  const settings = getAccountSettings();
  if (!team || !walletId || !settings) return;
  const holding = ownerOf(walletId);
  if (!holding || holding.readAt === null) return;
  try {
    const kept = await keepExportEpoch(
      ownerDevicesSecret(team),
      settings.relays,
      Math.floor(Date.now() / 1000),
      holding.epoch
    );
    if (!kept) logFailure("Keeping the account's export epoch on its relays failed");
  } catch (error) {
    logFailure("Keeping the account's export epoch on its relays failed", error);
  }
}
