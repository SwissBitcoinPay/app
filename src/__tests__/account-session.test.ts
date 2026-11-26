import { waitFor } from "@testing-library/react-native";

import { DEFAULT_RELAYS as BACKUP_RELAYS } from "@/config/relays";
import {
  AccountNotFoundError,
  closeAccount,
  getAccountBackupKey,
  getAccountTeamKeys,
  getAccountRevision,
  getAccountSettings,
  isAccountSeed,
  openAccount,
  updateAccount,
  whenAccountSynced,
  whenBackedUp
} from "@/features/account/session";
import * as backupKeys from "@/lib/backup/keys";
import { deriveBackupKeys, type BackupKeys } from "@/lib/backup/keys";
import { backupEvent, fetchBackup, publishBackup } from "@/lib/backup/settings-backup";
import { walletSecret } from "@/lib/breez/seed";
import { unixSeconds, type MerchantSettings } from "@/lib/settings/merchant";
import * as teamKeys from "@/lib/team/keys";
import { memberSecret, type TeamKeys } from "@/lib/team/keys";
import { resetDeviceRelays } from "@/features/relays/device-relays";
import { hasOwnRelays } from "@/lib/relays/current";
import { RELAYS_KEY } from "@/lib/relays/stored";
import * as store from "@/lib/settings/store";
import { loadMerchantSettings, saveMerchantSettings } from "@/lib/settings/store";

import { OTHER_TEST_MNEMONIC, testSeed } from "../../jest/account";
import type * as FileSystemFake from "../../jest/expo-file-system";
import type * as SecureStoreFake from "../../jest/expo-secure-store";
import type * as RelaysFake from "../../jest/nostr-relays";

const WALLET = "02c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5";
const OTHER_WALLET = "02f9308a019258c31049344f85f89d5229b531c845836f99b08601f113bce036f9";

// The in-memory expo-file-system and Nostr relays of jest.setup.ts.
const fileSystem = jest.requireMock<typeof FileSystemFake>("expo-file-system");
const relays = jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");
const secureStore = jest.requireMock<typeof SecureStoreFake>("expo-secure-store");

const SETTINGS_FILE = `file:///data/user/0/ch.swissbitcoinpay.checkout.staging/files/merchant-settings/${WALLET}.json`;
const keys = deriveBackupKeys(walletSecret(testSeed()));
const DAY = 24 * 60 * 60;
/** More than half of the relays. */
const MOST = Math.floor(BACKUP_RELAYS.length / 2) + 1;

const finished: MerchantSettings = {
  version: 18,
  recoveryCheck: { verifiedAt: null, dueSince: null },
  bitcoinNode: null,
  productLookup: true,
  splitSince: 1790000000,
  legacyTransfers: [],
  businessAddress: null,
  companyNumber: "",
  vatNumber: "",
  vatRate: null,
  onchainTolerance: 0,
  formerAddressMetadata: [],
  updatedAt: unixSeconds() - 3600,
  signUp: "done",
  businessName: "Merchant 9EE5",
  usage: "merchant",
  bitcoinPercent: 100,
  payoutCurrency: "CHF",
  displayCurrency: "CHF",
  detectedCountry: "CH",
  payoutAccountId: null,
  onchainPayments: true,
  relays: [...BACKUP_RELAYS],
  devices: [],
  logo: null
};

function login() {
  return openAccount({
    seed: testSeed(),
    walletId: WALLET,
    created: false,
    detect: () => Promise.reject(new Error("No sign-up expected")),
    businessNameWord: "Merchant"
  });
}

/** The `updatedAt` of the newest copy on each relay. */
async function backupDates() {
  const state = await fetchBackup(keys);
  return BACKUP_RELAYS.map((relay) => state.copies.get(relay));
}

/** Every relay holds settings dated `updatedAt` (backups are published in the background). */
function everyRelayHolds(updatedAt: number) {
  return waitFor(async () =>
    expect(await backupDates()).toEqual(BACKUP_RELAYS.map(() => updatedAt))
  );
}

/** Lets the background sync of the last login run. */
async function settle() {
  for (let i = 0; i < 20; i++) await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  fileSystem.resetFileSystem();
  relays.resetRelays();
  closeAccount();
});

describe("account session", () => {
  it("reads and writes as its keys over the account's connections, closed with it", async () => {
    await saveMerchantSettings(WALLET, finished);
    await login();
    await settle();
    expect(relays.calls.length).toBeGreaterThan(0);
    expect(new Set(relays.calls.map(({ channel }) => channel))).toEqual(new Set(["account"]));
    expect(relays.connectionsClosed).toBe(0);

    closeAccount();
    // Authenticated as its keys (NIP-42): the next account must not use them.
    expect(relays.connectionsClosed).toBe(1);
    closeAccount();
    expect(relays.connectionsClosed).toBe(1);
  });

  it("saves the account's relays on the device, the default ones too", async () => {
    resetDeviceRelays();
    await saveMerchantSettings(WALLET, finished);
    expect(finished.relays).toEqual(BACKUP_RELAYS);
    await login();
    // Kept as the device's own: a later change of the default list leaves this device as it is.
    expect(hasOwnRelays()).toBe(true);
    expect(JSON.parse(secureStore.items.get(RELAYS_KEY)!)).toEqual({
      version: 1,
      relays: [...BACKUP_RELAYS]
    });
  });

  it("dates settings unchanged for a month again, once most relays answered", async () => {
    const old = { ...finished, updatedAt: unixSeconds() - 31 * DAY };
    await publishBackup(old, keys);
    for (const relay of BACKUP_RELAYS.slice(MOST)) relays.unreachable.add(relay);

    await expect(login()).resolves.toEqual(old);

    await waitFor(() => expect(getAccountSettings()?.updatedAt).toBeGreaterThan(old.updatedAt));
    const settings = getAccountSettings();
    expect(settings).toEqual({ ...old, updatedAt: settings?.updatedAt });
    relays.unreachable.clear();
    await waitFor(async () =>
      expect((await backupDates()).slice(0, MOST)).toEqual(
        BACKUP_RELAYS.slice(0, MOST).map(() => settings?.updatedAt)
      )
    );
  });

  it("does not date them again while most relays could hold a newer copy", async () => {
    const old = { ...finished, updatedAt: unixSeconds() - 31 * DAY };
    await publishBackup(old, keys);
    for (const relay of BACKUP_RELAYS.slice(BACKUP_RELAYS.length - MOST)) {
      relays.unreachable.add(relay);
    }

    await login();
    await settle();

    expect(getAccountSettings()).toEqual(old);
  });

  it("takes a newer backup in the background, and backs it up on the relays that lack it", async () => {
    await saveMerchantSettings(WALLET, { ...finished, updatedAt: finished.updatedAt - 100 });
    await publishBackup(finished, keys, [BACKUP_RELAYS[0]]);

    await login();

    await waitFor(() => expect(getAccountSettings()).toEqual(finished));
    await expect(loadMerchantSettings(WALLET)).resolves.toEqual(finished);
    await everyRelayHolds(finished.updatedAt);
  });

  it("counts another device's change as a new revision of the account, once synced", async () => {
    await saveMerchantSettings(WALLET, { ...finished, updatedAt: finished.updatedAt - 100 });
    await publishBackup(
      { ...finished, bitcoinPercent: 40, payoutAccountId: null, signUp: "bank" },
      keys
    );

    await login();
    const opened = getAccountRevision();
    await whenAccountSynced();

    expect(getAccountSettings()).toMatchObject({ signUp: "bank", bitcoinPercent: 40 });
    expect(getAccountRevision()).not.toBe(opened);
  });

  it("does not count the same settings dated again elsewhere as a change, in any key order", async () => {
    await saveMerchantSettings(WALLET, { ...finished, updatedAt: finished.updatedAt - 100 });
    // Another device's copy, keys in reverse order.
    const reversed = Object.fromEntries(Object.entries(finished).reverse()) as MerchantSettings;
    await publishBackup(reversed, keys);

    await login();
    const opened = getAccountRevision();
    await whenAccountSynced();

    expect(getAccountSettings()).toEqual(finished);
    expect(getAccountRevision()).toBe(opened);
  });

  it("backs the device's newer settings up on the relays that lost them or hold an older copy", async () => {
    const [first, second, ...rest] = BACKUP_RELAYS;
    await saveMerchantSettings(WALLET, finished);
    await publishBackup({ ...finished, updatedAt: finished.updatedAt - 10 }, keys, [first]);
    await publishBackup(finished, keys, [second]);

    await expect(login()).resolves.toEqual(finished);

    await everyRelayHolds(finished.updatedAt);
    // The relay that had it is not written to again.
    const published = relays.calls.filter(({ operation }) => operation === "publish");
    expect(published.map(({ relay }) => relay).slice(2)).toEqual([first, ...rest]);
  });

  /** A backup of `finished` written by a newer version of the app, in a newer format. */
  function newerFormatBackup() {
    return backupEvent(
      {
        ...finished,
        version: finished.version + 1,
        updatedAt: finished.updatedAt + 60
      } as unknown as MerchantSettings,
      keys
    );
  }

  it("never publishes over a backup of a newer format", async () => {
    await saveMerchantSettings(WALLET, finished);
    const [relay] = BACKUP_RELAYS;
    const future = newerFormatBackup();
    relays.stored.set(relay, [future]);

    await login();
    await settle();
    // Not even a change of this device: "Settings" says why it is cancelled.
    const changed = await updateAccount({ bitcoinPercent: 100 });
    await expect(whenBackedUp(changed)).resolves.toBe("frozen");
    await settle();

    expect(relays.calls.filter(({ operation }) => operation === "publish")).toEqual([]);
    expect(relays.stored.get(relay)).toEqual([future]);
  });

  it("does not publish a change saved before the relays answer over a backup of a newer format", async () => {
    await saveMerchantSettings(WALLET, finished);
    const [relay] = BACKUP_RELAYS;
    const future = newerFormatBackup();
    relays.stored.set(relay, [future]);
    let answer = () => undefined as void;
    const answered = new Promise<void>((resolve) => (answer = resolve));
    const query = relays.queryEvents;
    const slow = jest.spyOn(relays, "queryEvents").mockImplementation(async (...args) => {
      await answered;
      return query(...args);
    });
    try {
      await login();
      // Before the relays answered: the backup of a newer format is not known yet.
      await updateAccount({ bitcoinPercent: 100 });
      await settle();
      answer();
      await settle();
    } finally {
      slow.mockRestore();
    }

    expect(relays.calls.filter(({ operation }) => operation === "publish")).toEqual([]);
    expect(relays.stored.get(relay)).toEqual([future]);
  });

  it("backs up a change saved before the relays answer once they did", async () => {
    await saveMerchantSettings(WALLET, finished);
    let answer = () => undefined as void;
    const answered = new Promise<void>((resolve) => (answer = resolve));
    const query = relays.queryEvents;
    const slow = jest.spyOn(relays, "queryEvents").mockImplementation(async (...args) => {
      await answered;
      return query(...args);
    });
    try {
      await login();
      const changed = await updateAccount({ businessName: "Merchant Lausanne" });
      await settle();
      expect(relays.calls.filter(({ operation }) => operation === "publish")).toEqual([]);
      answer();
      await everyRelayHolds(changed.updatedAt);
      await settle();
      // Once to each relay: the sync does not publish it too.
      expect(
        relays.calls.filter(({ operation }) => operation === "publish").map(({ relay }) => relay)
      ).toEqual(BACKUP_RELAYS);
    } finally {
      slow.mockRestore();
    }
  });

  it("never applies a change to another account opened before it is written", async () => {
    await saveMerchantSettings(WALLET, finished);
    await login();
    await settle();
    const save = store.saveMerchantSettings;
    let release = () => undefined as void;
    const released = new Promise<void>((resolve) => (release = resolve));
    const slow = jest
      .spyOn(store, "saveMerchantSettings")
      .mockImplementation(async (walletId, settings) => {
        // The writes of this account wait: another one opens meanwhile.
        if (walletId === WALLET) await released;
        return save(walletId, settings);
      });
    try {
      const first = updateAccount({ bitcoinPercent: 100 });
      await settle();
      const second = updateAccount({ businessName: "Merchant Lausanne" });
      closeAccount();
      const other = await openAccount({
        seed: testSeed(OTHER_TEST_MNEMONIC),
        walletId: OTHER_WALLET,
        created: true,
        detect: async () => ({ payoutCurrency: "EUR", detectedCountry: "FR" }),
        businessNameWord: "Merchant"
      });
      release();
      await first;
      await second;

      expect(getAccountSettings()).toEqual(other);
      await expect(loadMerchantSettings(OTHER_WALLET)).resolves.toEqual(other);
      await expect(loadMerchantSettings(WALLET)).resolves.toMatchObject({
        businessName: "Merchant Lausanne"
      });
    } finally {
      slow.mockRestore();
    }
  });

  it("keeps a change saved while the relays answer, over an older backup", async () => {
    await saveMerchantSettings(WALLET, { ...finished, updatedAt: finished.updatedAt - 100 });
    await publishBackup(finished, keys);

    await login();
    // Saved before the background sync applies the backup: it comes after it, so it wins.
    const changed = await updateAccount({ businessName: "Merchant Lausanne" });
    await settle();

    expect(changed.updatedAt).toBeGreaterThan(finished.updatedAt);
    expect(getAccountSettings()).toEqual(changed);
    await expect(loadMerchantSettings(WALLET)).resolves.toEqual(changed);
  });
});

describe("the account's passkey", () => {
  const isZero = (bytes: Uint8Array) => bytes.length > 0 && bytes.every((byte) => byte === 0);

  it("is told by the account's backup key, kept public", async () => {
    await saveMerchantSettings(WALLET, finished);
    expect(getAccountBackupKey()).toBeNull();
    expect(isAccountSeed(testSeed())).toBe(false);

    await login();

    expect(getAccountBackupKey()).toBe(keys.publicKey);
    const derive = backupKeys.deriveBackupKeys;
    const derived: BackupKeys[] = [];
    const spy = jest.spyOn(backupKeys, "deriveBackupKeys").mockImplementation((secret) => {
      const result = derive(secret);
      derived.push(result);
      return result;
    });
    try {
      expect(isAccountSeed(testSeed())).toBe(true);
      expect(isAccountSeed(testSeed(OTHER_TEST_MNEMONIC))).toBe(false);
    } finally {
      spy.mockRestore();
    }
    // The keys derived to tell are wiped at once.
    expect(derived).toHaveLength(2);
    expect(derived.every(({ secretKey }) => isZero(secretKey))).toBe(true);
  });

  it("opens nothing for another account than the expected one, and wipes its keys", async () => {
    await saveMerchantSettings(WALLET, finished);
    const derive = backupKeys.deriveBackupKeys;
    const derived: BackupKeys[] = [];
    const spy = jest.spyOn(backupKeys, "deriveBackupKeys").mockImplementation((secret) => {
      const result = derive(secret);
      derived.push(result);
      return result;
    });
    try {
      await expect(
        openAccount({
          seed: testSeed(OTHER_TEST_MNEMONIC),
          walletId: WALLET,
          backupKey: keys.publicKey,
          created: false,
          detect: () => Promise.reject(new Error("No sign-up expected")),
          businessNameWord: "Merchant"
        })
      ).rejects.toMatchObject({ name: "OtherAccountError" });
    } finally {
      spy.mockRestore();
    }

    expect(getAccountSettings()).toBeNull();
    expect(isZero(derived[0].secretKey)).toBe(true);
    // Checked before anything is read.
    expect(relays.calls).toEqual([]);

    await expect(
      openAccount({
        seed: testSeed(),
        walletId: WALLET,
        backupKey: keys.publicKey,
        created: false,
        detect: () => Promise.reject(new Error("No sign-up expected")),
        businessNameWord: "Merchant"
      })
    ).resolves.toEqual(finished);
  });
});

describe("closing the account", () => {
  const isZero = (bytes: Uint8Array) => bytes.length > 0 && bytes.every((byte) => byte === 0);

  /** The wallet secrets each opening derives backup keys from, and those keys. */
  function watchKeys() {
    const derive = backupKeys.deriveBackupKeys;
    const opened: { secret: Uint8Array; keys: BackupKeys }[] = [];
    const spy = jest.spyOn(backupKeys, "deriveBackupKeys").mockImplementation((secret) => {
      const derived = derive(secret);
      opened.push({ secret, keys: derived });
      return derived;
    });
    return { opened, restore: () => spy.mockRestore() };
  }

  function publishes() {
    return relays.calls.filter(({ operation }) => operation === "publish");
  }

  it("keeps the backup keys only: the wallet secret they derive from is wiped at once", async () => {
    await saveMerchantSettings(WALLET, finished);
    const watched = watchKeys();
    try {
      await login();
    } finally {
      watched.restore();
    }

    expect(watched.opened).toHaveLength(1);
    const [{ secret, keys: opened }] = watched.opened;
    expect(isZero(secret)).toBe(true);
    expect(opened.secretKey).toEqual(keys.secretKey);
    expect(opened.encryptionKey).toEqual(keys.encryptionKey);
  });

  it("wipes the backup keys: nothing can be signed nor encrypted with them any more", async () => {
    await saveMerchantSettings(WALLET, finished);
    const watched = watchKeys();
    try {
      await login();
      await settle();
    } finally {
      watched.restore();
    }
    const [{ keys: opened }] = watched.opened;

    closeAccount();

    expect(getAccountSettings()).toBeNull();
    expect(isZero(opened.secretKey)).toBe(true);
    expect(isZero(opened.encryptionKey)).toBe(true);
    expect(() => backupEvent(finished, opened)).toThrow("The backup keys were wiped");
  });

  it("stops reading the relays, publishes nothing more, and backs up at the next opening", async () => {
    await saveMerchantSettings(WALLET, finished);
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    let answer = () => undefined as void;
    const answered = new Promise<void>((resolve) => (answer = resolve));
    const query = relays.queryEvents;
    const slow = jest.spyOn(relays, "queryEvents").mockImplementation(async (...args) => {
      await answered;
      return query(...args);
    });
    let changed: MerchantSettings;
    try {
      await login();
      // Backed up once the relays answered: the account closes before.
      changed = await updateAccount({ businessName: "Merchant Lausanne" });
      const synced = whenAccountSynced();
      closeAccount();
      answer();
      await synced;
      await settle();
    } finally {
      slow.mockRestore();
    }

    expect(publishes()).toEqual([]);
    // The read was aborted on purpose: not a failure.
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
    await expect(loadMerchantSettings(WALLET)).resolves.toEqual(changed);

    await login();
    await everyRelayHolds(changed.updatedAt);
  });

  it("wipes the team keys with the backup keys: nothing signs nor derives with them any more", async () => {
    await saveMerchantSettings(WALLET, finished);
    await login();
    await settle();
    const team = getAccountTeamKeys()!;
    expect(isZero(team.root)).toBe(false);

    closeAccount();

    expect(getAccountTeamKeys()).toBeNull();
    expect(isZero(team.root)).toBe(true);
    expect(isZero(team.secretKey)).toBe(true);
    expect(() => memberSecret(team, "ab".repeat(16))).toThrow("The team keys were wiped");
  });

  it("wipes the team keys of an account that does not open", async () => {
    fileSystem.files.set(SETTINGS_FILE, JSON.stringify({ ...finished, version: 99 }));
    const derive = teamKeys.deriveTeamKeys;
    const derived: TeamKeys[] = [];
    const spy = jest.spyOn(teamKeys, "deriveTeamKeys").mockImplementation((secret) => {
      const team = derive(secret);
      derived.push(team);
      return team;
    });
    try {
      await expect(login()).rejects.toMatchObject({ code: "settingsTooNew" });
    } finally {
      spy.mockRestore();
    }

    expect(derived).toHaveLength(1);
    expect(isZero(derived[0].root)).toBe(true);
    expect(isZero(derived[0].secretKey)).toBe(true);
  });

  it("closes the connections of an account that does not open: the next one gets new ones", async () => {
    fileSystem.files.set(SETTINGS_FILE, JSON.stringify({ ...finished, version: 99 }));
    await expect(login()).rejects.toMatchObject({ code: "settingsTooNew" });
    expect(relays.connectionsClosed).toBe(1);
  });

  it("wipes the keys of an account that does not open", async () => {
    fileSystem.files.set(SETTINGS_FILE, JSON.stringify({ ...finished, version: 99 }));
    const watched = watchKeys();
    try {
      await expect(login()).rejects.toMatchObject({ code: "settingsTooNew" });
    } finally {
      watched.restore();
    }

    const [{ secret, keys: opened }] = watched.opened;
    expect(isZero(secret)).toBe(true);
    expect(isZero(opened.secretKey)).toBe(true);
    expect(isZero(opened.encryptionKey)).toBe(true);
    expect(getAccountSettings()).toBeNull();
  });

  it("wipes the keys of the account open before another one opens", async () => {
    await saveMerchantSettings(WALLET, finished);
    const watched = watchKeys();
    try {
      await login();
      await settle();
      await login();
      await settle();
    } finally {
      watched.restore();
    }

    expect(watched.opened).toHaveLength(2);
    expect(isZero(watched.opened[0].keys.secretKey)).toBe(true);
    expect(isZero(watched.opened[1].keys.secretKey)).toBe(false);
  });

  it("wipes the keys of an account opened while another one was being opened", async () => {
    await saveMerchantSettings(WALLET, finished);
    const watched = watchKeys();
    try {
      // Each opening closes the account open when it starts: none is open then.
      await Promise.all([login(), login()]);
      await settle();
    } finally {
      watched.restore();
    }

    expect(watched.opened).toHaveLength(2);
    // One account stays open; the other is closed like any other, never left behind.
    const wiped = watched.opened.filter(({ keys: opened }) => isZero(opened.secretKey));
    expect(wiped).toHaveLength(1);
    expect(getAccountBackupKey()).toBe(keys.publicKey);
  });

  it("opens no account at login when no relay of the device holds its backup", async () => {
    relays.unreachable.add(BACKUP_RELAYS[0]);
    const watched = watchKeys();
    const closed = relays.connectionsClosed;
    let error: unknown;
    try {
      // `detect` rejects: no sign-up starts.
      error = await login().catch((thrown: unknown) => thrown);
    } finally {
      watched.restore();
    }

    expect(error).toBeInstanceOf(AccountNotFoundError);
    expect(error).toMatchObject({
      code: "notFound",
      asked: BACKUP_RELAYS,
      answered: BACKUP_RELAYS.slice(1)
    });
    // Nothing of a new account, on the device nor on the relays; its keys are gone.
    await expect(loadMerchantSettings(WALLET)).resolves.toBeNull();
    expect([...relays.stored.values()].flat()).toEqual([]);
    expect(getAccountSettings()).toBeNull();
    expect(isZero(watched.opened[0].keys.secretKey)).toBe(true);
    // Its reads authenticated as its keys: the next account gets new connections.
    expect(relays.connectionsClosed).toBe(closed + 1);
  });

  it("knows nothing of the account when no relay answered at login", async () => {
    for (const relay of BACKUP_RELAYS) relays.unreachable.add(relay);

    await expect(login()).rejects.toMatchObject({
      code: "notFound",
      asked: BACKUP_RELAYS,
      answered: []
    });
    await expect(loadMerchantSettings(WALLET)).resolves.toBeNull();
  });
});

describe("a change's backup (whenBackedUp)", () => {
  it("is published once a majority of the relays took it, the others still going on", async () => {
    await saveMerchantSettings(WALLET, finished);
    await login();
    await whenAccountSynced();
    // A majority (3 of 5) answers at once, the others later: published once the majority took it.
    const quorum = BACKUP_RELAYS.slice(0, 3);
    const late = BACKUP_RELAYS.slice(3);
    let answer = () => undefined as void;
    const answered = new Promise<void>((resolve) => (answer = resolve));
    const publish = relays.publishEvent;
    const slow = jest.spyOn(relays, "publishEvent").mockImplementation(async (url, ...args) => {
      if (!quorum.includes(url)) await answered;
      return publish(url, ...args);
    });
    try {
      const changed = await updateAccount({ businessName: "Merchant Lausanne" });
      await expect(whenBackedUp(changed)).resolves.toBe("published");
      expect(await backupDates()).toEqual([
        ...quorum.map(() => changed.updatedAt),
        ...late.map(() => finished.updatedAt)
      ]);
      answer();
      await everyRelayHolds(changed.updatedAt);
    } finally {
      slow.mockRestore();
      answer();
    }
  });

  it("is not published while fewer than a majority took it", async () => {
    await saveMerchantSettings(WALLET, finished);
    await login();
    await whenAccountSynced();
    // Two relays of five take it at once, the others only once released: not saved before.
    let answer = () => undefined as void;
    const answered = new Promise<void>((resolve) => (answer = resolve));
    const publish = relays.publishEvent;
    const slow = jest.spyOn(relays, "publishEvent").mockImplementation(async (url, ...args) => {
      if (!BACKUP_RELAYS.slice(0, 2).includes(url)) await answered;
      return publish(url, ...args);
    });
    try {
      const changed = await updateAccount({ businessName: "Merchant Lausanne" });
      const outcome = jest.fn();
      void whenBackedUp(changed).then(outcome);
      await settle();
      expect(outcome).not.toHaveBeenCalled();
      answer();
      await waitFor(() => expect(outcome).toHaveBeenCalledWith("published"));
    } finally {
      slow.mockRestore();
      answer();
    }
  });

  it("is unreachable when no majority of the relays took it, refused or out of reach", async () => {
    await saveMerchantSettings(WALLET, finished);
    await login();
    await whenAccountSynced();
    // Two take it, one refuses it, two are out of reach: two of five, no majority.
    const [, , refusing, ...rest] = BACKUP_RELAYS;
    relays.readOnly.add(refusing);
    for (const relay of rest) relays.unreachable.add(relay);

    const changed = await updateAccount({ businessName: "Merchant Lausanne" });
    await expect(whenBackedUp(changed)).resolves.toBe("unreachable");
    // Saved on the device all the same: updateAccount knows nothing of "Settings"' undo.
    expect(getAccountSettings()).toEqual(changed);
  });

  it("of a change saved before the relays answered is the later change's, which carries it", async () => {
    await saveMerchantSettings(WALLET, finished);
    let answer = () => undefined as void;
    const answered = new Promise<void>((resolve) => (answer = resolve));
    const query = relays.queryEvents;
    const slow = jest.spyOn(relays, "queryEvents").mockImplementation(async (...args) => {
      await answered;
      return query(...args);
    });
    try {
      await login();
      const first = await updateAccount({ businessName: "Merchant Lausanne" });
      const second = await updateAccount({ displayCurrency: "EUR" });
      const outcomes = Promise.all([whenBackedUp(first), whenBackedUp(second)]);
      answer();
      await expect(outcomes).resolves.toEqual(["published", "published"]);
      // One backup only, the later one's, with both changes.
      const state = await fetchBackup(keys);
      expect(state.newest).toMatchObject({
        businessName: "Merchant Lausanne",
        displayCurrency: "EUR"
      });
      await settle();
      expect(relays.calls.filter(({ operation }) => operation === "publish")).toHaveLength(
        BACKUP_RELAYS.length
      );
    } finally {
      slow.mockRestore();
      answer();
    }
  });

  it("is the later change's while that change still saves the device's relays", async () => {
    await saveMerchantSettings(WALLET, finished);
    await login();
    await whenAccountSynced();
    // The first backup is held, then refused by every relay; the next ones go through.
    let refuse = () => undefined as void;
    const refused = new Promise<void>((resolve) => (refuse = resolve));
    let first: string | null = null;
    const publish = relays.publishEvent;
    const backups = jest
      .spyOn(relays, "publishEvent")
      .mockImplementation(async (url, event, options) => {
        if (event.pubkey === keys.publicKey && (first === null || first === event.id)) {
          first = event.id;
          await refused;
          throw new Error(`${url}: no answer in time`);
        }
        return publish(url, event, options);
      });
    // The device's copy of the relays is written slowly.
    let written = () => undefined as void;
    const writing = new Promise<void>((resolve) => (written = resolve));
    const write = secureStore.setItemAsync.getMockImplementation()!;
    secureStore.setItemAsync.mockImplementation(async (key, value, options) => {
      if (key === RELAYS_KEY) await writing;
      return write(key, value, options);
    });
    try {
      const naming = await updateAccount({ businessName: "Merchant Lausanne" });
      await waitFor(() => expect(first).not.toBeNull());
      // A change of relays, saved over the name: its device's copy of the list is being written.
      const moving = updateAccount({ relays: [...BACKUP_RELAYS, "wss://relay.bakery.example"] });
      await waitFor(() => expect(getAccountSettings()?.businessName).toBe("Merchant Lausanne"));
      await waitFor(() =>
        expect(secureStore.setItemAsync.mock.calls.some(([key]) => key === RELAYS_KEY)).toBe(true)
      );
      refuse();
      // Its backup carries the name: taken, the name counts as saved.
      await expect(whenBackedUp(naming)).resolves.toBe("published");
      written();
      await expect(whenBackedUp(await moving)).resolves.toBe("published");
    } finally {
      backups.mockRestore();
      secureStore.setItemAsync.mockImplementation(write);
      refuse();
      written();
    }
  });

  it("is unreachable for settings no change saved", async () => {
    await expect(whenBackedUp(finished)).resolves.toBe("unreachable");
  });
});
