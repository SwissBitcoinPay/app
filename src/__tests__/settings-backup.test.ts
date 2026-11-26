import { schnorr } from "@noble/curves/secp256k1.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";

import { DEFAULT_RELAYS as BACKUP_RELAYS } from "@/config/relays";
import { base64ToBytes } from "@/lib/base64";
import { deriveBackupKeys, wipeBackupKeys } from "@/lib/backup/keys";
import { isValidEvent, signEvent } from "@/lib/nostr/event";
import { BACKUP_KIND, backupEvent, fetchBackup, publishBackup } from "@/lib/backup/settings-backup";
import { encodeWalletSecret } from "@/lib/breez/secret";
import { walletSecret } from "@/lib/breez/seed";
import { walletSecret as webWalletSecret } from "@/lib/breez/seed.web";
import type { WalletSeed } from "@/lib/breez/types";
import type { MerchantSettings } from "@/lib/settings/merchant";

import type * as RelaysFake from "../../jest/nostr-relays";

// The in-memory relays of jest.setup.ts.
const relays = jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");

// A BIP-39 test mnemonic (all-zero entropy), never a real wallet's.
const MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const keys = deriveBackupKeys(encodeWalletSecret({ mnemonic: MNEMONIC }));
const otherKeys = deriveBackupKeys(encodeWalletSecret({ mnemonic: `${MNEMONIC} zoo` }));

const settings: MerchantSettings = {
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
  updatedAt: 1790000000,
  signUp: "done",
  businessName: "Merchant 9EE5",
  usage: "merchant",
  bitcoinPercent: 50,
  payoutCurrency: "CHF",
  displayCurrency: "CHF",
  detectedCountry: "CH",
  // A Mt Pelerin bank account's id, fictitious: never its details (format 18).
  payoutAccountId: "64a0c0de0000000000000004",
  onchainPayments: true,
  relays: [...BACKUP_RELAYS],
  devices: [],
  logo: null
};

beforeEach(() => relays.resetRelays());

describe("wallet secret", () => {
  it("is the same for a wallet in the apps and on the web", () => {
    const native = { tag: "Mnemonic", inner: { mnemonic: MNEMONIC, passphrase: undefined } };
    const web = { type: "mnemonic", mnemonic: MNEMONIC };
    expect(walletSecret(native as unknown as WalletSeed)).toEqual(
      webWalletSecret(web as unknown as WalletSeed)
    );
    // Whatever the spacing or the case of the words.
    expect(
      encodeWalletSecret({ mnemonic: ` ${MNEMONIC.toUpperCase().replace(/ /g, "  ")}\n` })
    ).toEqual(encodeWalletSecret({ mnemonic: MNEMONIC }));
    const entropy = new Uint8Array(16).fill(7);
    expect(
      walletSecret({ tag: "Entropy", inner: [entropy.buffer] } as unknown as WalletSeed)
    ).toEqual(webWalletSecret(Object.assign([...entropy], { type: "entropy" }) as never));
  });

  it("tells the passphrase, and a mnemonic from entropy, apart", () => {
    const plain = encodeWalletSecret({ mnemonic: MNEMONIC });
    expect(encodeWalletSecret({ mnemonic: MNEMONIC, passphrase: "" })).toEqual(plain);
    expect(encodeWalletSecret({ mnemonic: MNEMONIC, passphrase: "x" })).not.toEqual(plain);
    expect(() => walletSecret({ tag: "created-seed" } as never)).toThrow(/Unexpected wallet seed/);
  });
});

describe("backup keys", () => {
  it("derive the same keys from the same wallet, and other keys from another", () => {
    expect(deriveBackupKeys(encodeWalletSecret({ mnemonic: MNEMONIC }))).toEqual(keys);
    expect(otherKeys.publicKey).not.toBe(keys.publicKey);
    expect(otherKeys.address).not.toBe(keys.address);
    expect(keys.secretKey).toHaveLength(32);
    expect(keys.encryptionKey).toHaveLength(32);
    expect(keys.publicKey).toBe(bytesToHex(schnorr.getPublicKey(keys.secretKey)));
    expect(keys.address).toMatch(/^[0-9a-f]{64}$/);
  });

  it("never change: every released backup derives from them (salt, info strings, wallet secret)", () => {
    expect(new TextDecoder().decode(encodeWalletSecret({ mnemonic: MNEMONIC }))).toBe(
      `mnemonic:${MNEMONIC}`
    );
    expect(bytesToHex(encodeWalletSecret({ entropy: new Uint8Array([1, 2]) }))).toBe(
      "656e74726f70793a0102"
    );
    expect(keys.publicKey).toBe("a9af8f510fd1fbbc05f19974b96d9555f43614c56c7e12a24b86d059ab013cfb");
    expect(keys.address).toBe("971e87baaa29954d3a5fc92815d27e9df06a067eb5dd39c1db8520b7a009962c");
    expect(bytesToHex(sha256(keys.encryptionKey))).toBe(
      "2693f6efcdb5f9804c2ecead27334f8939d300f763714c41d98e90c5b5656399"
    );
  });
});

describe("Nostr events", () => {
  it("signs like BIP-340 with constant auxiliary data (test vector 0)", () => {
    // BIP-340 test vector 0: secret key 3, aux_rand and message all zeros.
    const secretKey = hexToBytes(`${"00".repeat(31)}03`);
    expect(bytesToHex(schnorr.sign(new Uint8Array(32), secretKey, new Uint8Array(32)))).toBe(
      "e907831f80848d1069a5371b402410364bdf1c5f8307b0084c55f1ce2dca821525f66a4a85ea8b71e482a74f382d2ce5ebeee8fdb2172f477df4900d310536c0"
    );
  });

  it("checks the id and the signature of an event", () => {
    const event = signEvent(
      { kind: 1, created_at: 1790000000, tags: [["t", "test"]], content: "Grüezi" },
      keys.secretKey
    );
    expect(event.pubkey).toBe(keys.publicKey);
    expect(isValidEvent(event)).toBe(true);
    expect(isValidEvent({ ...event, content: "Hello" })).toBe(false);
    expect(isValidEvent({ ...event, id: "0".repeat(64) })).toBe(false);
    const forged = signEvent({ ...event, content: "Hello" }, otherKeys.secretKey);
    expect(isValidEvent({ ...forged, pubkey: event.pubkey })).toBe(false);
    expect(isValidEvent({ ...event, tags: [[1]] })).toBe(false);
    expect(isValidEvent(null)).toBe(false);
  });
});

describe("settings backup", () => {
  it("is an addressable event that names nothing: encrypted settings, opaque address", () => {
    const event = backupEvent(settings, keys);

    expect(event).toMatchObject({
      kind: BACKUP_KIND,
      pubkey: keys.publicKey,
      created_at: settings.updatedAt,
      tags: [["d", keys.address]]
    });
    expect(isValidEvent(event)).toBe(true);
    // Everything but the content in clear. The content is random base64: a short word such as
    // "CHF" turns up in it by chance (6 events in 2000), so it is checked as a NIP-44 v2
    // payload instead, whose alphabet holds no JSON.
    const visible = JSON.stringify({ ...event, content: "" });
    for (const secret of ["CH93", "Bakery", "Lausanne", "CHF", "Merchant", "swiss"]) {
      expect(visible).not.toContain(secret);
    }
    expect(event.content).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
    expect(base64ToBytes(event.content)?.[0]).toBe(2);
    // Encrypted and signed with fresh randomness: another event, the same settings.
    const again = backupEvent(settings, keys);
    expect(again.content).not.toBe(event.content);
    expect(again.sig).not.toBe(event.sig);
    expect(isValidEvent(again)).toBe(true);
  });

  it("goes to every relay, and comes back as the newest copy", async () => {
    const older = {
      ...settings,
      updatedAt: settings.updatedAt - 60,
      bitcoinPercent: 100,
      payoutAccountId: null
    };
    await publishBackup(older, keys);
    // Once a majority took it; the others in the background.
    await expect(publishBackup(settings, keys)).resolves.toEqual(BACKUP_RELAYS.slice(0, 3));
    await new Promise((resolve) => setTimeout(resolve, 0));

    const state = await fetchBackup(keys);

    expect(state.newest).toEqual(settings);
    expect(state.newerUnreadable).toBe(false);
    expect([...state.copies]).toEqual(BACKUP_RELAYS.map((relay) => [relay, settings.updatedAt]));
    // Another wallet has no backup.
    await expect(fetchBackup(otherKeys)).resolves.toMatchObject({ newest: null });
  });

  it("takes the newest copy whichever relay holds it, and tells which relays did not answer", async () => {
    const [first, second, ...others] = BACKUP_RELAYS;
    await publishBackup({ ...settings, updatedAt: 1790000000 }, keys, [first]);
    await publishBackup({ ...settings, updatedAt: 1790000500 }, keys, [second]);
    for (const relay of others) relays.unreachable.add(relay);

    const state = await fetchBackup(keys);

    expect(state.newest?.updatedAt).toBe(1790000500);
    expect([...state.copies]).toEqual([
      [first, 1790000000],
      [second, 1790000500]
    ]);
  });

  it("reads a copy of format 12 or 17, its bank details dropped (format 18)", async () => {
    // Clearly fake details: the IBAN is the example of the Swiss IBAN documentation.
    const bank = {
      country: "CH",
      iban: "CH9300762011623852957",
      address: "1 Town Street",
      postalCode: "1003",
      city: "Lausanne",
      addressComplement: null,
      transferReference: null
    };
    const { payoutAccountId: _id, ...v17 } = {
      ...settings,
      version: 17,
      bank: { ...bank, holder: { kind: "company", name: "Fine Bakery LLC" } }
    };
    await publishBackup(v17 as unknown as MerchantSettings, keys);
    await expect(fetchBackup(keys)).resolves.toMatchObject({
      newest: { ...settings, payoutAccountId: null }
    });
    expect((await fetchBackup(keys)).newest).not.toHaveProperty("bank");

    relays.resetRelays();
    const {
      payoutAccountId: _id12,
      businessAddress: _none,
      companyNumber: _c,
      vatNumber: _v,
      bitcoinNode: _n,
      productLookup: _l,
      splitSince: _since1,
      legacyTransfers: _transfers1,
      recoveryCheck: _check,
      ...rest
    } = settings;
    const v12 = {
      ...rest,
      version: 12,
      bank: { ...bank, holderName: "Fine Bakery LLC" }
    };
    await publishBackup(v12 as unknown as MerchantSettings, keys);

    const state = await fetchBackup(keys);

    expect(state.newest).toEqual({ ...settings, payoutAccountId: null });
    expect(state.newerUnreadable).toBe(false);
  });

  it("never publishes an older copy over a newer one", async () => {
    await publishBackup(settings, keys);
    await publishBackup(
      {
        ...settings,
        updatedAt: settings.updatedAt - 1,
        bitcoinPercent: 100,
        payoutAccountId: null
      },
      keys
    );

    await expect(fetchBackup(keys)).resolves.toMatchObject({ newest: settings });
  });

  it("ignores events that are not this wallet's backups", async () => {
    const [relay] = BACKUP_RELAYS;
    const theirs = backupEvent({ ...settings, updatedAt: settings.updatedAt + 10 }, otherKeys);
    // Another author at the same address, a forged copy, or this author's other kinds of events.
    relays.stored.set(relay, [
      signEvent({ ...theirs, tags: [["d", keys.address]] }, otherKeys.secretKey),
      { ...theirs, pubkey: keys.publicKey, tags: [["d", keys.address]] },
      signEvent(
        { kind: 1, created_at: settings.updatedAt + 20, tags: [], content: "" },
        keys.secretKey
      )
    ]);

    await expect(fetchBackup(keys, [relay])).resolves.toEqual({
      newest: null,
      newerUnreadable: false,
      copies: new Map([[relay, null]]),
      relays: [relay]
    });
  });

  it("is written in the NIP-44 format, padded so that its bank account does not show", () => {
    const event = backupEvent(settings, keys);
    expect(event.content).toMatch(/^A[A-Za-z0-9+/]+={0,2}$/);
    expect(event.tags).toEqual([["d", keys.address]]);
    // Padded to 1 KiB: the size does not tell whether there is a bank account.
    const withoutBank = { ...settings, bitcoinPercent: 100, payoutAccountId: null };
    expect(backupEvent(withoutBank, keys).content).toHaveLength(event.content.length);
  });

  it("flags a newer backup it cannot read, which must not be overwritten", async () => {
    const [relay] = BACKUP_RELAYS;
    await publishBackup(settings, keys, [relay]);
    // Written by a newer version of the app, in a format this one does not know.
    const future = backupEvent(
      {
        ...settings,
        version: settings.version + 1,
        updatedAt: settings.updatedAt + 60
      } as unknown as MerchantSettings,
      keys
    );
    relays.stored.set(relay, [...(relays.stored.get(relay) ?? []), future]);

    await expect(fetchBackup(keys, [relay])).resolves.toMatchObject({
      newest: settings,
      newerUnreadable: true
    });
  });
});

describe("wiped keys", () => {
  const isZero = (bytes: Uint8Array) => bytes.length > 0 && bytes.every((byte) => byte === 0);

  it("are zeros, and never sign, encrypt nor read anything", async () => {
    const wiped = deriveBackupKeys(encodeWalletSecret({ mnemonic: `${MNEMONIC} wiped` }));

    wipeBackupKeys(wiped);

    expect(isZero(wiped.secretKey)).toBe(true);
    expect(isZero(wiped.encryptionKey)).toBe(true);
    expect(() => backupEvent(settings, wiped)).toThrow("The backup keys were wiped");
    await expect(publishBackup(settings, wiped)).rejects.toThrow("The backup keys were wiped");
    await expect(fetchBackup(wiped)).rejects.toThrow("The backup keys were wiped");
    expect(relays.calls).toEqual([]);
  });

  it("reads nothing a relay sent once the read is aborted", async () => {
    const [relay] = BACKUP_RELAYS;
    await publishBackup(settings, keys, [relay]);
    const controller = new AbortController();

    const read = fetchBackup(keys, [relay], 15000, controller.signal);
    controller.abort();

    await expect(read).rejects.toThrow("Reading the backup was aborted");
  });
});
