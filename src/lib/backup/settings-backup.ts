import { majority } from "@/config/registry";
import type { NostrEvent } from "@/lib/nostr/event";
import { publishToRelays, queryRelays, type Quorum } from "@/lib/nostr/pool";
import {
  NewerRecordError,
  RECORD_KIND,
  newestRecord,
  openRecord,
  sealRecord
} from "@/lib/nostr/record";
import { currentRelays } from "@/lib/relays/current";
import {
  NewerSettingsFormatError,
  parseMerchantSettings,
  type MerchantSettings
} from "@/lib/settings/merchant";

import { usableKeys, type BackupKeys } from "./keys";

/** NIP-78: arbitrary app data, an addressable event (one per author and `d` tag). */
export const BACKUP_KIND = RECORD_KIND;

/** What the record is (src/lib/nostr/record.ts). */
const RECORD_TYPE = "merchant-settings";

/**
 * Plaintexts are padded to a multiple of this: the size of a backup does not tell what it holds (a
 * bank account's id, a logo, owner devices…). It holds no bank details since format 18.
 */
const PADDING_BLOCK = 1024;

/**
 * Per relay, connection included: past this, the relay counts as unreachable. Some relays take
 * several seconds (nostr.mom: 4 s to accept a backup from a cloud container).
 * The sign-in only waits for the relays when the device has no settings (`waiting`); otherwise
 * reading, like publishing, happens in the background.
 */
export const RELAY_TIMEOUT_MS = { waiting: 5000, background: 15000 } as const;

/**
 * The backup event of `settings`, a sealed record (NIP-44).
 * Its `created_at` is the settings' `updatedAt`: relays keep the latest event of an address
 * (NIP-01), so that publishing an older copy can never replace a newer one. Encryption and
 * signature are randomized: the same settings give a different event each time, of the same
 * `created_at` (a relay then keeps the lowest id, NIP-01).
 */
export function backupEvent(settings: MerchantSettings, keys: BackupKeys): NostrEvent {
  const { address, encryptionKey, secretKey } = usableKeys(keys);
  return sealRecord({
    type: RECORD_TYPE,
    value: settings,
    signer: secretKey,
    encryptionKey,
    address,
    createdAt: settings.updatedAt,
    block: PADDING_BLOCK
  });
}

/**
 * Settings read from a backup event: valid, of this app's format (parseMerchantSettings: format 12
 * converted, an older one invalid), dated like the event. A newer format throws NewerRecordError: never published
 * over.
 */
function parseBackup(value: unknown, event: NostrEvent): MerchantSettings | null {
  let settings: MerchantSettings | null;
  try {
    settings = parseMerchantSettings(value);
  } catch (error) {
    if (error instanceof NewerSettingsFormatError) throw new NewerRecordError();
    throw error;
  }
  return settings && settings.updatedAt === event.created_at ? settings : null;
}

/**
 * What a relay sent, if it is a usable backup event of `keys`: only
 * they can have signed it. Anything else is ignored (null), a damaged copy included (record.ts).
 */
function readCopy(value: unknown, keys: BackupKeys) {
  return openRecord(value, {
    type: RECORD_TYPE,
    encryptionKey: keys.encryptionKey,
    address: keys.address,
    author: keys.publicKey,
    parse: parseBackup
  });
}

export type BackupState = {
  /** The newest settings found on the relays, null when none. */
  newest: MerchantSettings | null;
  /**
   * A backup newer than `newest` exists in a format this version of the app cannot read (written
   * by a newer one): starting the sign-up over, or publishing over it, would lose it.
   */
  newerUnreadable: boolean;
  /**
   * The relays that answered, each with the `updatedAt` of the newest copy it holds (null: none).
   * The others did not answer in time.
   */
  copies: Map<string, number | null>;
  /** The relays asked. */
  relays: readonly string[];
};

/**
 * Asks every relay for the backup of `keys`, in parallel, until `quorum` (a majority of `relays` by
 * default: every backup is published to a majority of its list, publishBackupToMajority). Never
 * rejects, but when `signal` aborts the read (the account closes, session.ts): nothing that came
 * is read then, so that the keys can be wiped at once. Rejects too with keys already wiped.
 */
export async function fetchBackup(
  keys: BackupKeys,
  relays: readonly string[] = currentRelays(),
  timeoutMs: number = RELAY_TIMEOUT_MS.background,
  signal?: AbortSignal,
  quorum: Quorum = "majority"
): Promise<BackupState> {
  usableKeys(keys);
  const answers = await queryRelays(
    { kinds: [BACKUP_KIND], authors: [keys.publicKey], "#d": [keys.address] },
    { channel: "account", relays, timeoutMs, signal, authKey: () => usableKeys(keys).secretKey },
    { quorum }
  );
  if (signal?.aborted) throw new Error("Reading the backup was aborted");
  // Wiped meanwhile: zeros would take every copy for a damaged one.
  usableKeys(keys);
  const { newest, newestUnreadable, copies } = newestRecord(answers, (value) =>
    readCopy(value, keys)
  );
  return {
    newest: newest?.value ?? null,
    newerUnreadable:
      newestUnreadable !== null && newestUnreadable > (newest?.value.updatedAt ?? -1),
    copies,
    relays
  };
}

/** Publishes the backup of `settings` to `relays`, in parallel. Resolves with those that took it. */
export async function publishBackup(
  settings: MerchantSettings,
  keys: BackupKeys,
  relays: readonly string[] = currentRelays()
): Promise<string[]> {
  return publishToRelays(backupEvent(settings, keys), backupCall(keys, relays));
}

/**
 * Publishes the backup of `settings` to `relays`, in parallel. Resolves once a majority of the
 * account's list (`settings.relays`) holds it, the `holding` relays of that list that hold it
 * already included (the others go on in the background); rejects as soon as it cannot: a read
 * that stops at a majority of the list finds it then (any two majorities share a relay).
 * "Settings" says a change is saved then, not before the relays took it. `relays` may hold
 * others (a list the account left, which looks for it there once).
 */
export async function publishBackupToMajority(
  settings: MerchantSettings,
  keys: BackupKeys,
  relays: readonly string[],
  holding = 0
): Promise<void> {
  const part = {
    relays: settings.relays.filter((relay) => relays.includes(relay)),
    count: majority(settings.relays.length) - holding
  };
  const took = await publishToRelays(backupEvent(settings, keys), backupCall(keys, relays), {
    quorum: { lists: [part] }
  });
  if (took.filter((relay) => part.relays.includes(relay)).length < part.count) {
    throw new Error("Fewer than a majority of the account's relays took the backup");
  }
}

function backupCall(keys: BackupKeys, relays: readonly string[]) {
  return {
    relays,
    timeoutMs: RELAY_TIMEOUT_MS.background,
    // Refused once the keys are wiped: a backup still being published then keeps its signed
    // event, but cannot authenticate any more (NIP-42).
    channel: "account" as const,
    authKey: () => usableKeys(keys).secretKey
  };
}
