import { majority } from "@/config/registry";
import { saveDeviceRelays } from "@/features/relays/device-relays";
import { fetchAccountDeletion, type AccountDeletion } from "@/lib/backup/deletion";
import { deriveBackupKeys, usableKeys, wipeBackupKeys, type BackupKeys } from "@/lib/backup/keys";
import {
  RELAY_TIMEOUT_MS,
  fetchBackup,
  publishBackupToMajority,
  type BackupState
} from "@/lib/backup/settings-backup";
import { setChainNodeSource } from "@/lib/breez/chain-node";
import { walletSecret } from "@/lib/breez/seed";
import type { WalletSeed } from "@/lib/breez/types";
import { logFailure } from "@/lib/log/log";
import type { Quorum } from "@/lib/nostr/pool";
import { closeRelayConnections } from "@/lib/nostr/relay";
import { currentRelays, setCurrentRelays } from "@/lib/relays/current";
import { sameRelayList, unionRelays } from "@/lib/relays/list";
import { movedEvent, publishMoved } from "@/lib/relays/moved";
import { setOpenAccountFormerMetadata } from "@/lib/settings/former-metadata";
import {
  NewerSettingsFormatError,
  businessName,
  initialSettings,
  newestSettings,
  touchSettings,
  unixSeconds,
  type MerchantSettings,
  type SettingsPatch
} from "@/lib/settings/merchant";
import { loadMerchantSettings, saveMerchantSettings } from "@/lib/settings/store";
import { deriveTeamKeys, ownerDevicesSecret, wipeTeamKeys, type TeamKeys } from "@/lib/team/keys";

import type { SignUpLocation } from "./detection";
import { rememberDevicePasskey } from "./device-passkey";

// The wallets read the chain on the open account's own node, when it names one (src/lib/breez/
// chain-node.ts): asked as each one connects.
setChainNodeSource(() => getAccountSettings()?.bitcoinNode ?? null);

export type AccountErrorCode =
  /**
   * Settings saved by a newer version of the app, in a newer format: on the device, or in the
   * backup when the device has none. Replacing them would lose them.
   */
  | "settingsTooNew"
  /** At login, no settings on the device nor on its relays (AccountNotFoundError). */
  | "notFound";

/** Error of the account layer, with a code the screens can map to a message. */
export class AccountError extends Error {
  readonly code: AccountErrorCode;

  constructor(code: AccountErrorCode, message: string) {
    super(message);
    this.name = "AccountError";
    this.code = code;
  }
}

/**
 * At login, the passkey's account has no settings on the device, and no relay of the device's list
 * (`asked`) sent a backup of it, nor a deletion request. No sign-up starts then: the account may
 * live on relays of its own, which the device is not told of anywhere (no pointer on the default
 * relays), or another passkey may be the account's. "No account found" (src/app/no-account.tsx)
 * says so and lets the device's relays be changed. `answered`: the relays of `asked` that answered,
 * without a backup; none means nothing is known of the account.
 */
export class AccountNotFoundError extends AccountError {
  readonly asked: readonly string[];
  readonly answered: readonly string[];

  constructor(asked: readonly string[], answered: readonly string[]) {
    super("notFound", "No backup of the account on the device's relays");
    this.name = "AccountNotFoundError";
    this.asked = [...asked];
    this.answered = answered.filter((relay) => asked.includes(relay));
  }
}

/**
 * The passkey gave another account than the one expected: this device's point of sale (lock.ts),
 * or the open account (wallet-access.ts).
 */
export class OtherAccountError extends Error {
  constructor() {
    super("The passkey belongs to another account");
    this.name = "OtherAccountError";
  }
}

/** The open account: one at a time, like the wallet (wallet.ts). In memory only. */
type Account = {
  walletId: string;
  /** Wiped once the account closes (closeAccount). */
  keys: BackupKeys;
  /**
   * The team's keys (src/lib/team/keys.ts): invitations, employees' channels and sales. Wiped
   * once the account closes, like `keys`.
   */
  team: TeamKeys;
  /**
   * The seed of the account's wallet, from the passkey that opened it, kept while the account is
   * open: the wallet screen connects the wallet with it, without asking for the passkey again
   * (wallet-access.ts). Dropped once the account closes (closeAccount): its mnemonic is a
   * JavaScript string, which cannot be wiped, only no longer referenced.
   */
  seed: WalletSeed | null;
  /**
   * The id of the passkey that gave `seed`, when the platform named it (the SDK's iOS, Android and
   * browser providers do, Breez SDK 0.28.4): the passkey asked again while the account is open is
   * pinned to it (`allowCredentials`, wallet-access.ts), so that the password manager offers that
   * one only, not every passkey of the app. Only it can give this seed: a PRF output is a passkey's
   * own. Not a secret (WebAuthn sends it in each assertion): this device also saves it, for the
   * prompts while the account is closed (device-passkey.ts). Dropped with the seed all the same.
   */
  credentialId: ArrayBuffer | null;
  /** What gave `seed`: the passkey, or its recovery phrase typed (OpenAccountOptions.openedBy). */
  openedBy: AccountOpener;
  /** Aborted once the account closes: its relay reads stop, no backup is published any more. */
  closing: AbortController;
  settings: MerchantSettings;
  /** A backup of a newer format was seen: publishing over it would lose it. */
  backupFrozen: boolean;
  /**
   * Relays a change of list left (updateAccount), not given the backup yet: the next backup
   * published goes there too, once.
   */
  leftRelays: string[];
  /** The list changed and its notice (src/lib/relays/moved.ts) is not published yet. */
  relaysMoved: boolean;
  /**
   * Settles once the relays' answer at sign-in was handled (`reconcile`): changes are published
   * after it only, once `backupFrozen` tells whether a backup of a newer format is there.
   */
  synced: Promise<void>;
};

let current: Account | null = null;

/** Told whenever an account opens or closes (the navigation's till mode follows it). */
const listeners = new Set<() => void>();

function accountChanged(): void {
  for (const listener of listeners) listener();
  settingsChanged();
}

/** Told whenever the open account's settings change, or another account opens or closes. */
const settingsListeners = new Set<() => void>();

function settingsChanged(): void {
  // Before the listeners: what they read of the checks of declared invoices is the new settings'.
  setOpenAccountFormerMetadata(current?.settings.formerAddressMetadata ?? []);
  for (const listener of settingsListeners) listener();
}

/**
 * Calls `listener` whenever the open account's settings change (a change saved here, another
 * device's taken from the relays), or an account opens or closes; returns the unsubscribe function.
 */
export function subscribeAccountSettings(listener: () => void): () => void {
  settingsListeners.add(listener);
  return () => {
    settingsListeners.delete(listener);
  };
}

/** Told when the open account turns out deleted on another device (reconcile). */
const deletionListeners = new Set<(walletId: string) => void>();

/**
 * Calls `listener` with the wallet id of an account found deleted on another of the owner's devices
 * as it opened here ("Delete account": its backup key's deletion request on a majority of the
 * relays, src/lib/backup/deletion.ts). The account is closed by then, and nothing of it was
 * published again; what the device keeps of it is the listener's to forget. Returns the unsubscribe
 * function.
 */
export function subscribeAccountDeletion(listener: (walletId: string) => void): () => void {
  deletionListeners.add(listener);
  return () => {
    deletionListeners.delete(listener);
  };
}

/**
 * Stops publishing the open account's backups ("Delete account", account-deletion.ts): a backup
 * dated after the deletion requests would outlive them on the relays, and the other devices would
 * read the account as kept (src/lib/backup/deletion.ts). A change saved meanwhile stays on the
 * device. Returns the function that publishes them again (the deletion failed), unless the account
 * closed or was frozen already (a backup of a newer format).
 */
export function freezeAccountBackups(): () => void {
  const account = current;
  if (!account || account.backupFrozen) return () => {};
  account.backupFrozen = true;
  return () => {
    if (current === account) account.backupFrozen = false;
  };
}

/** Calls `listener` whenever an account opens or closes; returns the unsubscribe function. */
export function subscribeAccount(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Whether the open account was opened with its recovery phrase ("Open with my 12 words",
 * src/features/rescue/): its owner may only send its funds away and export its history there, never
 * use the app with it (lock.ts: never unlocked). False when none is open.
 */
export function isAccountOpenedByWords(): boolean {
  return current?.openedBy === "words";
}

/** The wallet id (getWalletId) of the open account, null when none is open. */
export function getAccountWalletId(): string | null {
  return current?.walletId ?? null;
}

/**
 * The public key of the open account's settings backups (`BackupKeys.publicKey`), null when none
 * is open. Public: the author of its events on the relays. The point of sale's profile keeps it,
 * so that unlocking checks a passkey without connecting the wallet (lock.ts).
 */
export function getAccountBackupKey(): string | null {
  return current?.keys.publicKey ?? null;
}

/**
 * The seed of the open account's wallet (Account.seed), null when no account is open. Only
 * wallet-access.ts reads it, to connect that wallet for a screen that needs it.
 */
export function getAccountSeed(): WalletSeed | null {
  return current?.seed ?? null;
}

/**
 * The id of the passkey that opened the account (Account.credentialId), null when no account is
 * open or the platform did not name it. A copy: the caller cannot change the account's.
 */
export function getAccountCredentialId(): ArrayBuffer | null {
  return current?.credentialId ? current.credentialId.slice(0) : null;
}

/**
 * Whether `seed` (from a passkey) is the open account's: it gives the account's backup key. The
 * keys derived to tell are wiped at once; the wallet is not needed (wallet-access.ts).
 */
export function isAccountSeed(seed: WalletSeed): boolean {
  return current !== null && seedHasBackupKey(seed, current.keys.publicKey);
}

/**
 * Whether `seed` (from a passkey) gives `backupKey`, an account's backup key the device knows (the
 * point of sale's profile), without any account open. As isAccountSeed: the keys are wiped at once.
 */
export function seedHasBackupKey(seed: WalletSeed, backupKey: string): boolean {
  const keys = backupKeysOf(seed);
  try {
    return keys.publicKey === backupKey;
  } finally {
    wipeBackupKeys(keys);
  }
}

/**
 * Changes whenever the open account's settings are replaced by something this device's steps did
 * not write: another account opened, or another device's change taken from the relays (`reconcile`).
 * A screen showing settings it read before such a change must not save its answers over it.
 */
let revision = 0;

/** Writes of the settings, one at a time: a step's save and the background sync never cross. */
let writes: Promise<unknown> = Promise.resolve();

function serialized<T>(write: () => Promise<T>): Promise<T> {
  const run = writes.then(write);
  writes = run.catch(() => undefined);
  return run;
}

/**
 * Backups are dated again at sign-in when unchanged for this long:
 * a relay that pruned them, or refuses old events (strfry: 3 years, the `created_at_lower_limit` of
 * monitorlizard.nostr1.com), takes them back. The backup's date is its settings' `updatedAt`.
 */
const REFRESH_AFTER_SECONDS = 30 * 24 * 60 * 60;

/** The team keys of the open account, null when none is open. In memory only, like the seed. */
export function getAccountTeamKeys(): TeamKeys | null {
  return current?.team ?? null;
}

/** The settings of the open account, null when none is open. */
export function getAccountSettings(): MerchantSettings | null {
  return current?.settings ?? null;
}

/** See `revision`: compare the value read with the settings to the value at the time of saving. */
export function getAccountRevision(): number {
  return revision;
}

/**
 * Settles once the relays' answer at sign-in was handled for the open account (`reconcile`): a
 * newer backup from another device has replaced its settings by then. Never rejects.
 */
export function whenAccountSynced(): Promise<void> {
  return current?.synced ?? Promise.resolve();
}

/**
 * Forgets the open account, before another one opens or in till mode (its wallet is disconnected
 * apart). Its relay reads stop and its backup keys are wiped at once: a backup being published
 * keeps its signed event, but answers no relay's authentication challenge any more. A change saved
 * on the device and not published yet is published at the account's next opening (`reconcile`).
 */
export function closeAccount(): void {
  const closed = current;
  current = null;
  revision++;
  if (!closed) return;
  closed.closing.abort();
  // Authenticated as its keys (NIP-42): the next account's calls go over new connections.
  closeRelayConnections();
  wipeBackupKeys(closed.keys);
  wipeTeamKeys(closed.team);
  // `reconcile` may still hold the account object: the seed must not stay reachable through it.
  closed.seed = null;
  closed.credentialId = null;
  accountChanged();
}

/**
 * The backup keys of `seed`. The wallet secret they derive from is the seed itself (the mnemonic,
 * seed.ts): the bytes read for them are wiped at once.
 */
function backupKeysOf(seed: WalletSeed): BackupKeys {
  const secret = walletSecret(seed);
  try {
    return deriveBackupKeys(secret);
  } finally {
    secret.fill(0);
  }
}

/** The backup and team keys of `seed`, derived from one wallet secret, wiped at once as above. */
function accountKeysOf(seed: WalletSeed): { keys: BackupKeys; team: TeamKeys } {
  const secret = walletSecret(seed);
  try {
    return { keys: deriveBackupKeys(secret), team: deriveTeamKeys(secret) };
  } finally {
    secret.fill(0);
  }
}

/** What gives an account's seed: its passkey, or its recovery phrase typed by its owner. */
export type AccountOpener = "passkey" | "words";

export type OpenAccountOptions = {
  /**
   * The seed of the account's wallet, from the passkey (or its recovery phrase, `openedBy`): the
   * backup keys derive from it. Kept with the account while it is open (Account.seed).
   */
  seed: WalletSeed;
  /**
   * "words": the seed is the recovery phrase its owner typed ("Open with my 12 words",
   * src/features/rescue/). Such an opening only reads an account that exists: no sign-up starts,
   * never `created`, an account deleted is not found (AccountNotFoundError), and nothing of a
   * passkey is saved. "passkey" by default.
   */
  openedBy?: AccountOpener;
  /**
   * The id of the passkey that gave `seed`, when the platform named it: kept with the account
   * while it is open (Account.credentialId), and saved on this device once the account opened
   * (device-passkey.ts). Absent or null, the passkey asked again is not pinned (any passkey of the
   * app is offered, as before).
   */
  credentialId?: ArrayBuffer | null;
  /**
   * The id of that wallet (getWalletId): the connected wallet's at sign-up and login, the point of
   * sale's profile's at unlock, where the wallet is not connected (lock.ts).
   */
  walletId: string;
  /**
   * The account's backup key the device knows (the point of sale's profile): the account opens
   * only when `seed` gives this one, else OtherAccountError. Checked before anything is read.
   */
  backupKey?: string;
  /** A wallet created just now: it has no settings anywhere yet. */
  created: boolean;
  /** Payout currency and country, for a sign-up that starts now (detection.ts). */
  detect: () => Promise<SignUpLocation>;
  /** First word of the generated business name, in the app language. */
  businessNameWord: string;
};

/**
 * Opens the account of the wallet of `seed` and returns its settings, without the wallet itself:
 * the device's copy first, the relays' answer updating it in the background (`reconcile`). Only a
 * device without settings waits for the relays: the newest backup, else AccountNotFoundError (no
 * sign-up then, also when no relay answered). A sign-up starts for a wallet created just now, or
 * for an account deleted: it detects the payout currency and saves the state of the new account
 * right away.
 *
 * The backup is read on the device's relays (its list, src/features/relays/device-relays.ts:
 * "Advanced settings" before a first login, the account's afterwards), then the account's list
 * becomes the device's; a new account takes the device's list.
 */
export async function openAccount({
  seed,
  openedBy = "passkey",
  credentialId = null,
  walletId,
  backupKey,
  created,
  detect,
  businessNameWord
}: OpenAccountOptions): Promise<MerchantSettings> {
  // A recovery phrase never creates an account, nor names a passkey (OpenAccountOptions.openedBy).
  if (openedBy === "words" && (created || credentialId)) {
    throw new Error("An account opened with its words is neither created nor a passkey's");
  }
  closeAccount();
  const { keys, team } = accountKeysOf(seed);
  const closing = new AbortController();
  let settings: MerchantSettings;
  let backup: Promise<BackupState> | null = null;
  let deletion: Promise<AccountDeletion> = Promise.resolve("kept");
  try {
    if (backupKey !== undefined && keys.publicKey !== backupKey) throw new OtherAccountError();
    const startSignUp = async () =>
      initialSettings({
        businessName: businessName(businessNameWord, walletId),
        relays: currentRelays(),
        ...(await detect())
      });
    const local = await loadLocalSettings(walletId);
    if (created) {
      // A new wallet: no backup to look for.
      settings = local ?? (await startSignUp());
    } else if (local) {
      settings = local;
      backup = fetchAccountBackup(
        keys,
        readRelays(local),
        RELAY_TIMEOUT_MS.background,
        closing.signal,
        // A majority of each list: the account's backup is on a majority of its own.
        { lists: [currentRelays(), local.relays] }
      );
      deletion = fetchAccountDeletion(
        keys.publicKey,
        readRelays(local),
        RELAY_TIMEOUT_MS.background,
        closing.signal,
        () => usableKeys(keys).secretKey,
        [currentRelays(), local.relays]
      );
    } else {
      backup = fetchAccountBackup(keys, currentRelays(), RELAY_TIMEOUT_MS.waiting, closing.signal);
      const [state, deleted] = await Promise.all([
        backup,
        fetchAccountDeletion(
          keys.publicKey,
          currentRelays(),
          RELAY_TIMEOUT_MS.waiting,
          closing.signal,
          () => usableKeys(keys).secretKey
        )
      ]);
      // Deleted ("Delete account"): a relay that missed the deletion still sends its last backup,
      // which must not come back. The passkey starts a new account; the words find none.
      if (deleted === "deleted" && openedBy === "words") {
        throw new AccountNotFoundError(state.relays, [...state.copies.keys()]);
      }
      if (deleted === "deleted") {
        settings = await startSignUp();
        // Not reconciled with that backup (it could replace the new account's settings, dated
        // later by a device's clock ahead): published as a new account's.
        backup = null;
      } else {
        if (state.newerUnreadable) {
          throw new AccountError("settingsTooNew", "The backup is in a newer format");
        }
        // No move followed without a backup: the relays asked are the device's.
        if (!state.newest) throw new AccountNotFoundError(state.relays, [...state.copies.keys()]);
        settings = state.newest;
      }
    }
    if (settings !== local) await saveMerchantSettings(walletId, settings);
    await adoptRelays(settings);
  } catch (error) {
    // The account does not open: its keys go now, a read in progress stops.
    closing.abort();
    backup?.catch(() => undefined);
    // Its reads authenticated as its keys (NIP-42): the next account's calls go over new
    // connections, as after closeAccount (which returns early, no account being open).
    closeRelayConnections();
    wipeBackupKeys(keys);
    wipeTeamKeys(team);
    throw error;
  }
  // The passkey that opens this account, for the prompts while it is closed (unlocking, a card
  // payment): saved once the account opened. Awaited, so that a "Log out" that follows finds it
  // saved and removes it. Never fails the opening (only logged).
  if (credentialId) await rememberDevicePasskey(walletId, credentialId);
  // Another account opened while this one was read: it closes like any other (keys wiped, reads
  // stopped), never left behind.
  if (current) closeAccount();
  const account: Account = {
    walletId,
    keys,
    team,
    seed,
    // A copy: the caller's buffer may change after the account opened.
    credentialId: credentialId ? credentialId.slice(0) : null,
    openedBy,
    closing,
    settings,
    backupFrozen: false,
    leftRelays: [],
    relaysMoved: false,
    synced: Promise.resolve()
  };
  current = account;
  revision++;
  accountChanged();
  if (backup) {
    account.synced = reconcile(account, backup, deletion).catch((error: unknown) => {
      // Closed meanwhile: the read was aborted on purpose.
      if (!account.closing.signal.aborted) {
        logFailure("Syncing the merchant settings backup failed", error);
      }
    });
  } else {
    void backUp(account, settings, settings.relays);
  }
  return settings;
}

/**
 * Where the backup of settings `local` (the device's copy) is looked for: the device's relays and
 * the account's (a change of list made on another device left its backup on the list it left too,
 * updateAccount).
 */
function readRelays(local: MerchantSettings): string[] {
  return unionRelays(currentRelays(), local.relays);
}

/** Moves of the account's relays a read of its backup follows (fetchAccountBackup). */
const BACKUP_HOPS = 3;

/**
 * The account's backup read on `relays` (fetchBackup), then on the relays the newest copy names
 * when they were not asked, up to BACKUP_HOPS times: a list the account left holds the backup of
 * the move only (updateAccount gives it there once), whose `relays` lead to the newer settings. A
 * device that read only the list left would open the account with the settings of the move, and
 * its next change would publish them over the newer ones.
 */
async function fetchAccountBackup(
  keys: BackupKeys,
  relays: readonly string[],
  timeoutMs: number,
  signal: AbortSignal,
  quorum: Quorum = "majority"
): Promise<BackupState> {
  let state = await fetchBackup(keys, relays, timeoutMs, signal, quorum);
  for (let hop = 0; hop < BACKUP_HOPS && state.newest; hop += 1) {
    const asked = state.relays;
    const list = state.newest.relays;
    const unasked = list.filter((relay) => !asked.includes(relay));
    if (unasked.length === 0) break;
    // The newest copy's list holds its backup on a majority: what its relays asked already
    // answered counts towards it.
    const answered = list.filter((relay) => state.copies.has(relay)).length;
    const more = await fetchBackup(keys, unasked, timeoutMs, signal, {
      count: majority(list.length) - answered
    });
    state = {
      newest: newestSettings(state.newest, more.newest),
      // A newer format on either list: never published over.
      newerUnreadable: state.newerUnreadable || more.newerUnreadable,
      copies: new Map([...state.copies, ...more.copies]),
      relays: [...asked, ...unasked]
    };
  }
  return state;
}

/**
 * Makes the account's relays the device's (saved on it), unless they are already, also when they
 * are the default list (which may change). Never rejects:
 * the settings are saved by then, and a sign-in, a change or another device's change must not be
 * reported as failed for the device's copy of the list. Not saved, the list is still used for
 * this launch; the account's opening after the next launch saves it again.
 */
async function adoptRelays(settings: MerchantSettings): Promise<void> {
  try {
    // Saved unless the device's own list is already this one (saveDeviceRelays).
    await saveDeviceRelays(settings.relays);
  } catch (error) {
    logFailure("Saving the account's relays on the device failed", error);
    setCurrentRelays(settings.relays);
  }
}

/**
 * This device's settings for the wallet. Damaged ones count as none: the backup has them, else
 * the sign-up starts over. Those of a newer format must never be replaced.
 */
async function loadLocalSettings(walletId: string): Promise<MerchantSettings | null> {
  try {
    return await loadMerchantSettings(walletId);
  } catch (error) {
    if (error instanceof NewerSettingsFormatError) {
      throw new AccountError("settingsTooNew", "The settings on this device are in a newer format");
    }
    logFailure("Unreadable merchant settings on this device", error);
    return null;
  }
}

/**
 * Brings the account and the relays in step once they answered, in the background: a newer
 * backup (another device's change) replaces the device's copy without a word; the newest copy goes
 * to the relays that answered without it; settings unchanged for a month are dated again. Damaged
 * copies were ignored (readCopy in settings-backup.ts).
 */
async function reconcile(
  account: Account,
  answer: Promise<BackupState>,
  deletion: Promise<AccountDeletion>
): Promise<void> {
  // The settings opened: one changed meanwhile was saved by updateAccount, which backs it up.
  const opened = account.settings;
  const [backup, deleted] = await Promise.all([answer, deletion]);
  if (deleted === "deleted") {
    // Deleted on another device ("Delete account"): nothing of it is published again (a backup
    // dated now would outlive the deletion), the account closes, and the device forgets it
    // (subscribeAccountDeletion).
    account.backupFrozen = true;
    if (current !== account) return;
    closeAccount();
    for (const listener of deletionListeners) listener(account.walletId);
    return;
  }
  if (backup.newerUnreadable) {
    account.backupFrozen = true;
    logFailure("A backup of a newer format exists: not published over");
  }
  await serialized(async () => {
    // Another account opened meanwhile: its next sign-in syncs it.
    if (current !== account) return;
    let settings = account.settings;
    // Most relays answered without a newer copy: one elsewhere is unlikely enough to date ours.
    const mostAnswered = backup.copies.size * 2 > backup.relays.length;
    if (backup.newest && backup.newest.updatedAt > settings.updatedAt) {
      settings = backup.newest;
    } else if (
      mostAnswered &&
      !account.backupFrozen &&
      unixSeconds() - settings.updatedAt > REFRESH_AFTER_SECONDS
    ) {
      settings = touchSettings(settings, {});
    }
    if (settings !== account.settings) {
      await saveMerchantSettings(account.walletId, settings);
      // Another device's change: the answers shown since the sign-in are stale. Not the same
      // settings dated again by another device (a month later), nor ours dated again here.
      if (!sameAnswers(settings, account.settings)) revision++;
      account.settings = settings;
      // Another device changed the list: it is this device's too from now on.
      await adoptRelays(settings);
      settingsChanged();
    } else if (settings !== opened) {
      // A change saved while the relays answered: updateAccount backs it up to every relay once
      // this is done, publishing it here too would send it twice.
      return;
    }
    void backUp(
      account,
      settings,
      relaysLacking(settings, backup),
      relaysHolding(settings, backup)
    );
  });
}

/** How many of the account's relays answered with the latest settings already (relaysLacking). */
function relaysHolding(settings: MerchantSettings, backup: BackupState): number {
  return settings.relays.filter((relay) => {
    const held = backup.copies.get(relay);
    return held !== undefined && held !== null && held >= settings.updatedAt;
  }).length;
}

/** Whether two copies of the settings hold the same values, whatever their dates. */
function sameAnswers(a: MerchantSettings, b: MerchantSettings): boolean {
  return canonicalJson({ ...a, updatedAt: 0 }) === canonicalJson({ ...b, updatedAt: 0 });
}

/** JSON with the keys of objects sorted: copies read from the device and the relays may differ. */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/**
 * The account's relays not known to hold the latest settings: those that answered without them,
 * those that did not answer (the read stopped at a majority, or they were late: the backup waits
 * for none of them, backUp), and those that were not asked (a list changed on another device). The
 * relays out of the account's list are skipped (a list it left: nothing is written there
 * afterwards).
 */
function relaysLacking(settings: MerchantSettings, backup: BackupState): string[] {
  return settings.relays.filter((relay) => {
    const held = backup.copies.get(relay);
    return held === undefined || held === null || held < settings.updatedAt;
  });
}

/**
 * Publishes the notice that the account's relays are now `settings.relays` (moved.ts) to `relays`,
 * the new list and the one left, in the background. Signed with the backup key: once the account
 * closes, nothing is signed any more.
 */
function announceMove(account: Account, settings: MerchantSettings, relays: readonly string[]) {
  if (account.closing.signal.aborted) return;
  try {
    const event = movedEvent(
      usableKeys(account.keys).secretKey,
      ownerDevicesSecret(account.team),
      settings.relays,
      settings.updatedAt
    );
    publishMoved(event, relays, () => usableKeys(account.keys).secretKey).catch(
      (error: unknown) => {
        logFailure("Publishing the notice of the relays failed", error);
      }
    );
  } catch (error) {
    logFailure("Signing the notice of the relays failed", error);
  }
}

/** What became of the backup of a change (whenBackedUp). */
export type BackupOutcome =
  /** A majority of the account's relays took it (the others go on in the background). */
  | "published"
  /** No majority took it: too few answered in time, or they refused it. */
  | "unreachable"
  /** Not published: a backup of a newer format is on the relays (never published over). */
  | "frozen"
  /** Not published: the account closed (its keys are wiped). */
  | "closed";

/**
 * Publishes the backup in the background: a relay that misses it gets it at a next sign-in.
 * Resolves once a majority of the account's relays holds it, `holding` of them that hold it
 * already included, or once it cannot ("published", "unreachable"), or at once when it is not
 * published. Never rejects.
 */
function backUp(
  account: Account,
  settings: MerchantSettings,
  relays: readonly string[],
  holding = 0
): Promise<BackupOutcome> {
  // Closed: its keys are wiped.
  if (account.closing.signal.aborted) return Promise.resolve("closed");
  if (account.backupFrozen) return Promise.resolve("frozen");
  if (relays.length === 0) return Promise.resolve("unreachable");
  try {
    return publishBackupToMajority(settings, account.keys, relays, holding).then(
      () => "published" as const,
      (error: unknown) => {
        logFailure("Backing the merchant settings up failed", error);
        return account.closing.signal.aborted ? "closed" : "unreachable";
      }
    );
  } catch (error) {
    // Its keys wiped meanwhile (backupEvent): the account closed.
    logFailure("Signing the merchant settings backup failed", error);
    return Promise.resolve("closed");
  }
}

/** The backup of each change updateAccount saved, by the settings it saved (whenBackedUp). */
const backups = new WeakMap<MerchantSettings, Promise<BackupOutcome>>();

/**
 * What became of the backup of `settings`, settings a change saved (updateAccount resolved with
 * them): "published" once a majority of the account's relays took it, the others still going on in
 * the background ("Settings" says a change is saved then). A later change of this device, saved
 * before the backup went out or before it was taken, carries this one: its backup's outcome (a
 * relay that holds the later backup refuses this older one). Settings no change saved (another
 * device's, taken from the relays: they carry nothing): "unreachable". Never rejects.
 */
export function whenBackedUp(settings: MerchantSettings): Promise<BackupOutcome> {
  return backups.get(settings) ?? Promise.resolve("unreachable");
}

/**
 * Saves a change of the open account's settings on the device, then backs it up in the
 * background, once the relays' answer at sign-in was handled (a backup of a newer format there is
 * never published over): whenBackedUp tells what became of it. Rejects when it cannot be saved on
 * the device.
 */
export function updateAccount(
  patch: SettingsPatch | ((settings: MerchantSettings) => SettingsPatch)
): Promise<MerchantSettings> {
  // The account open now: another one opened before the write runs must not get this change.
  const account = current;
  return serialized(async () => {
    if (!account) throw new Error("No account is open");
    // A function is given the settings as they are when the write runs (a newer backup, another
    // write before it): a list changed from them loses nothing.
    const previous = account.settings;
    const settings = touchSettings(previous, typeof patch === "function" ? patch(previous) : patch);
    await saveMerchantSettings(account.walletId, settings);
    account.settings = settings;
    // A new list (no transition): the next backup goes once to the list left too, with the notice
    // of the move, where the owner's other devices still look for the account (at their next
    // unlock) and read the notice (in till mode, moved-notice.ts).
    const left = previous.relays.filter((relay) => !settings.relays.includes(relay));
    account.leftRelays = [
      ...account.leftRelays.filter(
        (relay) => !settings.relays.includes(relay) && !left.includes(relay)
      ),
      ...left
    ];
    if (!sameRelayList(previous.relays, settings.relays)) account.relaysMoved = true;
    const backup = account.synced.then(async (): Promise<BackupOutcome> => {
      // Replaced meanwhile (a later change, a newer backup): that one is backed up instead. A
      // later change of this device carries this one; another device's does not.
      if (account.settings !== settings) return whenBackedUp(account.settings);
      const once = account.leftRelays;
      account.leftRelays = [];
      const relays = [...settings.relays, ...once];
      const published = backUp(account, settings, relays);
      if (account.relaysMoved) {
        account.relaysMoved = false;
        announceMove(account, settings, relays);
      }
      const outcome = await published;
      // Not taken, and a later change of this device saved since: its backup carries this one.
      if (outcome === "unreachable" && account.settings !== settings) {
        return whenBackedUp(account.settings);
      }
      return outcome;
    });
    // Registered before anything else is awaited: an earlier change's backup that finds these
    // settings in place counts on theirs (whenBackedUp).
    backups.set(settings, backup);
    // A new list of relays: this device's from now on.
    await adoptRelays(settings);
    settingsChanged();
    return settings;
  });
}
