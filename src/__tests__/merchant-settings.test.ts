import {
  MAX_LEGACY_TRANSFERS,
  NewerSettingsFormatError,
  businessName,
  initialSettings,
  MAX_FORMER_ADDRESS_METADATA,
  isMerchantSettings,
  parseMerchantSettings,
  touchSettings,
  type MerchantSettings
} from "@/lib/settings/merchant";
import { DEFAULT_RELAYS } from "@/config/relays";
import { MAX_OWNER_DEVICES } from "@/config/team";
import { loadMerchantSettings, saveMerchantSettings } from "@/lib/settings/store";

import type * as FileSystemFake from "../../jest/expo-file-system";

// The in-memory expo-file-system of jest.setup.ts.
const fileSystem = jest.requireMock<typeof FileSystemFake>("expo-file-system");

// Wallet ids: the public keys of the private keys 2 and 3, well-known test values.
const WALLET = "02c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5";
const OTHER_WALLET = "02f9308a019258c31049344f85f89d5229b531c845836f99b08601f113bce036f9";
const SETTINGS_DIR =
  "file:///data/user/0/ch.swissbitcoinpay.checkout.staging/files/merchant-settings";

const allBitcoin: MerchantSettings = {
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
  bitcoinPercent: 100,
  payoutCurrency: "CHF",
  displayCurrency: "CHF",
  detectedCountry: "CH",
  payoutAccountId: null,
  onchainPayments: true,
  relays: [...DEFAULT_RELAYS],
  devices: [],
  logo: null
};

/** A Mt Pelerin bank account's id (`beneficiary_id`), fictitious. */
const ACCOUNT_ID = "64a0c0de0000000000000004";

const halfFiat: MerchantSettings = {
  ...allBitcoin,
  bitcoinPercent: 50,
  payoutAccountId: ACCOUNT_ID
};

/**
 * The bank details formats 12 to 17 kept (format 13 to 17's holder; format 12 said it otherwise).
 * Clearly fake details: the IBAN is the example of the Swiss IBAN documentation.
 */
const BANK_17 = {
  country: "CH",
  iban: "CH9300762011623852957",
  holder: { kind: "company", name: "Fine Bakery LLC" },
  address: "1 Bourg Street",
  postalCode: "1003",
  city: "Lausanne",
  addressComplement: null,
  transferReference: "SATTLEME"
};

/**
 * `settings` as a format before 18 wrote them: their bank details, no Mt Pelerin account's id;
 * read back, the details are dropped and the account is to choose again (`expected`).
 */
function before18(settings: MerchantSettings): {
  value: Omit<MerchantSettings, "payoutAccountId" | "version"> & { version: number; bank: unknown };
  expected: MerchantSettings;
} {
  const { payoutAccountId: _id, ...rest } = settings;
  return {
    value: { ...rest, bank: settings.bitcoinPercent < 100 ? BANK_17 : null },
    expected: { ...settings, payoutAccountId: null }
  };
}

beforeEach(() => fileSystem.resetFileSystem());

describe("businessName", () => {
  it("adds the last 4 hex digits of the wallet id, uppercased", () => {
    expect(businessName("Merchant", WALLET)).toBe("Merchant 9EE5");
    expect(businessName("Merchant", OTHER_WALLET)).toBe("Merchant 36F9");
  });
});

/** The metadata breez.tips served for the address under its generated name. */
const FORMER =
  '[["text/plain","Merchant 9EE5"],["text/identifier","sattleme02c6047f94@breez.tips"]]';

describe("isMerchantSettings", () => {
  it("accepts complete settings", () => {
    expect(isMerchantSettings(allBitcoin)).toBe(true);
    expect(isMerchantSettings(halfFiat)).toBe(true);
  });

  it("accepts the state of each step of an unfinished sign-up, without bank details", () => {
    const created = initialSettings(
      {
        businessName: "Merchant 9EE5",
        payoutCurrency: "CHF",
        detectedCountry: null,
        relays: ["wss://relay.example.ch"]
      },
      1790000000123
    );
    expect(created).toEqual({
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
      signUp: "usage",
      businessName: "Merchant 9EE5",
      usage: null,
      bitcoinPercent: 100,
      payoutCurrency: "CHF",
      displayCurrency: "CHF",
      detectedCountry: null,
      payoutAccountId: null,
      onchainPayments: true,
      relays: ["wss://relay.example.ch"],
      devices: [],
      logo: null
    });
    expect(isMerchantSettings(created)).toBe(true);
    const merchant = { ...created, usage: "merchant" } as const;
    expect(isMerchantSettings({ ...merchant, signUp: "split" })).toBe(true);
    expect(isMerchantSettings({ ...merchant, signUp: "bank", bitcoinPercent: 50 })).toBe(true);
    expect(isMerchantSettings({ ...created, signUp: "card", usage: "card" })).toBe(true);

    // The step follows the path of the usage chosen.
    expect(isMerchantSettings({ ...created, signUp: "split" })).toBe(false);
    expect(isMerchantSettings({ ...created, signUp: "card", usage: "merchant" })).toBe(false);
    // The bank details step only comes with a fiat share.
    expect(isMerchantSettings({ ...merchant, signUp: "bank" })).toBe(false);
    // The bank account is only saved when the sign-up ends.
    expect(isMerchantSettings({ ...halfFiat, signUp: "bank" })).toBe(false);
    // The card path ends once the card is paired (format 11); its holder may choose a split in
    // "Settings" later, under the same rule as a merchant.
    expect(isMerchantSettings({ ...allBitcoin, usage: "card" })).toBe(true);
    expect(isMerchantSettings({ ...halfFiat, usage: "card" })).toBe(true);
    expect(isMerchantSettings({ ...halfFiat, usage: "card", bitcoinPercent: 100 })).toBe(false);
    expect(isMerchantSettings({ ...allBitcoin, usage: null })).toBe(false);
    expect(isMerchantSettings({ ...allBitcoin, signUp: "welcome" })).toBe(false);
  });

  it("keeps a Mt Pelerin bank account's id only, and only with a fiat share", () => {
    // At 100 % bitcoin, none.
    expect(isMerchantSettings({ ...halfFiat, bitcoinPercent: 100 })).toBe(false);
    // With a fiat share, none only for an account of format 17 (its account to choose again).
    expect(isMerchantSettings({ ...allBitcoin, bitcoinPercent: 99 })).toBe(true);
    expect(isMerchantSettings({ ...halfFiat, payoutAccountId: "a-1" })).toBe(true);
    for (const payoutAccountId of ["", "6adf 8ad9", "6adf/8ad9", "x".repeat(129), 42, undefined]) {
      expect(isMerchantSettings({ ...halfFiat, payoutAccountId })).toBe(false);
    }
    // Never a bank account's details: settings holding them,
    // were it null, are refused, so never written nor read.
    expect(isMerchantSettings({ ...halfFiat, bank: BANK_17 })).toBe(false);
    expect(isMerchantSettings({ ...allBitcoin, bank: null })).toBe(false);
  });

  it("rejects a share that is not an integer percentage, or malformed codes", () => {
    for (const bitcoinPercent of [-1, 101, 50.5, Number.NaN]) {
      expect(isMerchantSettings({ ...halfFiat, bitcoinPercent })).toBe(false);
    }
    expect(isMerchantSettings({ ...allBitcoin, payoutCurrency: "chf" })).toBe(false);
    expect(isMerchantSettings({ ...allBitcoin, displayCurrency: undefined })).toBe(false);
    expect(isMerchantSettings({ ...allBitcoin, businessName: "" })).toBe(false);
    expect(isMerchantSettings({ ...allBitcoin, version: 1 })).toBe(false);
    expect(isMerchantSettings({ ...allBitcoin, detectedCountry: "che" })).toBe(false);
    for (const updatedAt of [-1, 1.5, "1790000000", undefined]) {
      expect(isMerchantSettings({ ...allBitcoin, updatedAt })).toBe(false);
    }
    expect(isMerchantSettings(null)).toBe(false);
  });
});

describe("touchSettings", () => {
  it("dates the change, always after the previous one", () => {
    expect(touchSettings(allBitcoin, { bitcoinPercent: 80 }, 1790000100999)).toMatchObject({
      bitcoinPercent: 80,
      updatedAt: 1790000100
    });
    // A clock behind the previous change, or two changes in the same second.
    expect(touchSettings(allBitcoin, {}, 1700000000000).updatedAt).toBe(1790000001);
    expect(touchSettings(allBitcoin, {}, 1790000000500).updatedAt).toBe(1790000001);
  });
});

describe("parseMerchantSettings", () => {
  it("reads the settings of the current format only", () => {
    expect(parseMerchantSettings(halfFiat)).toEqual(halfFiat);
    expect(parseMerchantSettings("settings")).toBeNull();
    expect(parseMerchantSettings(null)).toBeNull();
    // A format before 12 is not converted (no data of before is kept): its settings are invalid,
    // even holding every field of the current format.
    for (const version of [1, 2, 10, 11]) {
      expect(parseMerchantSettings({ ...halfFiat, version })).toBeNull();
    }
    const { formerAddressMetadata: _former, ...v11 } = { ...halfFiat, version: 11 };
    expect(parseMerchantSettings(v11)).toBeNull();
    // A newer one still throws: it is never replaced.
    expect(() => parseMerchantSettings({ ...v11, version: 19 })).toThrow(NewerSettingsFormatError);
  });

  it("keeps the former metadata of the address only as the payee's metadata, each once", () => {
    const other =
      '[["text/plain","Fine Bakery"],["text/identifier","sattleme02c6047f94@breez.tips"]]';
    expect(isMerchantSettings({ ...halfFiat, formerAddressMetadata: [FORMER, other] })).toBe(true);
    for (const formerAddressMetadata of [
      [FORMER, FORMER],
      ["not metadata"],
      ['[["text/plain","A"]]'],
      [42],
      FORMER,
      Array.from({ length: MAX_FORMER_ADDRESS_METADATA + 1 }, (_, index) =>
        JSON.stringify([
          ["text/plain", `Name ${index}`],
          ["text/identifier", "sattleme02c6047f94@breez.tips"]
        ])
      ),
      [`[["text/plain","${"x".repeat(2100)}"],["text/identifier","a@b.example"]]`]
    ]) {
      expect(isMerchantSettings({ ...halfFiat, formerAddressMetadata })).toBe(false);
    }
  });

  it("checks the on-chain tolerance: basis points from 0 to 10 %", () => {
    for (const onchainTolerance of [0, 10, 250, 500, 1000]) {
      expect(isMerchantSettings({ ...halfFiat, onchainTolerance })).toBe(true);
    }
    for (const onchainTolerance of [-1, 1001, 10_000, 2.5, "500", null, undefined]) {
      expect(isMerchantSettings({ ...halfFiat, onchainTolerance })).toBe(false);
    }
  });

  it("checks the VAT rate: none (the country's), or basis points from 0 to 100 %", () => {
    for (const vatRate of [null, 0, 260, 810, 2550, 10_000]) {
      expect(isMerchantSettings({ ...halfFiat, vatRate })).toBe(true);
    }
    for (const vatRate of [-1, 8.1, 10_001, "810", undefined]) {
      expect(isMerchantSettings({ ...halfFiat, vatRate })).toBe(false);
    }
  });

  it("checks the relays, the owner's devices and the logo", () => {
    const own = { ...halfFiat, relays: ["wss://relay.bakery.example"] };
    expect(isMerchantSettings(own)).toBe(true);
    expect(isMerchantSettings({ ...halfFiat, relays: [] })).toBe(false);
    expect(isMerchantSettings({ ...halfFiat, relays: ["https://relay.bakery.example"] })).toBe(
      false
    );
    const device = { id: "a".repeat(32), addedAt: 1790000000 };
    expect(isMerchantSettings({ ...halfFiat, devices: [device] })).toBe(true);
    expect(isMerchantSettings({ ...halfFiat, devices: [device, device] })).toBe(false);
    expect(isMerchantSettings({ ...halfFiat, devices: [{ ...device, id: "xyz" }] })).toBe(false);
    expect(isMerchantSettings({ ...halfFiat, devices: undefined })).toBe(false);
    const many = Array.from({ length: MAX_OWNER_DEVICES + 1 }, (_, index) => ({
      ...device,
      id: index.toString(16).padStart(32, "0")
    }));
    expect(isMerchantSettings({ ...halfFiat, devices: many.slice(1) })).toBe(true);
    expect(isMerchantSettings({ ...halfFiat, devices: many })).toBe(false);
    const logo = { key: "ab".repeat(32), hash: "cd".repeat(32) };
    expect(isMerchantSettings({ ...halfFiat, logo })).toBe(true);
    expect(isMerchantSettings({ ...halfFiat, logo: { key: "ab", hash: "cd" } })).toBe(false);
  });

  it("keeps on-chain payments as saved", () => {
    expect(parseMerchantSettings({ ...halfFiat, onchainPayments: false })).toEqual({
      ...halfFiat,
      onchainPayments: false
    });
  });

  it("refuses settings of a newer format", () => {
    expect(() => parseMerchantSettings({ ...halfFiat, version: 19 })).toThrow(
      NewerSettingsFormatError
    );
  });

  it("keeps the Bitcoin node only in its one spelling, and the product lookup as saved", () => {
    const node = { url: "http://192.168.1.20:3006", fallback: "mempool", payers: false } as const;
    expect(parseMerchantSettings({ ...halfFiat, bitcoinNode: node })).toEqual({
      ...halfFiat,
      bitcoinNode: node
    });
    expect(
      isMerchantSettings({
        ...halfFiat,
        bitcoinNode: { url: "https://mempool.example.ch/mempool", fallback: "none", payers: false }
      })
    ).toBe(true);
    expect(isMerchantSettings({ ...halfFiat, productLookup: false })).toBe(true);
    expect(
      isMerchantSettings({
        ...halfFiat,
        bitcoinNode: { url: "https://node.example.ch", fallback: "none", payers: true }
      })
    ).toBe(true);
    for (const bitcoinNode of [
      // Plain HTTP outside the local network: it would travel in clear.
      { url: "http://mempool.example.ch", fallback: "mempool", payers: false },
      // Another spelling of a valid address: never repaired.
      { url: "http://192.168.1.20:3006/", fallback: "mempool", payers: false },
      { url: "HTTP://192.168.1.20:3006", fallback: "mempool", payers: false },
      { url: "http://192.168.1.20:3006/api", fallback: "mempool", payers: false },
      { url: "https://localhost:3006", fallback: "mempool", payers: false },
      { url: "http://192.168.1.20:3006", fallback: "blockstream", payers: false },
      // Named to the payers' pages: HTTPS only, and said either way.
      { url: "http://192.168.1.20:3006", fallback: "none", payers: true },
      { url: "http://192.168.1.20:3006", fallback: "none" },
      { url: "http://192.168.1.20:3006" },
      "http://192.168.1.20:3006",
      undefined
    ]) {
      expect(isMerchantSettings({ ...halfFiat, bitcoinNode })).toBe(false);
    }
    for (const productLookup of [undefined, null, "true", 1]) {
      expect(isMerchantSettings({ ...halfFiat, productLookup })).toBe(false);
    }
  });

  it("counts the split from the account's creation, then from each change of its share", () => {
    const created = initialSettings(
      { businessName: "Merchant 9EE5", payoutCurrency: "CHF", detectedCountry: "CH", relays: [] },
      1_790_000_000_000
    );
    expect(created).toMatchObject({ splitSince: 1_790_000_000, legacyTransfers: [] });
    // Another setting changed: the split goes on from where it was.
    const renamed = touchSettings(halfFiat, { businessName: "Fine Bakery" }, 1_795_000_000_000);
    expect(renamed.splitSince).toBe(halfFiat.splitSince);
    // The same share saved again changes nothing either.
    const same = touchSettings(halfFiat, { bitcoinPercent: 50 }, 1_795_000_000_000);
    expect(same.splitSince).toBe(halfFiat.splitSince);
    // A new share starts from nothing: what came under the former one is never sold at the new.
    const changed = touchSettings(halfFiat, { bitcoinPercent: 80 }, 1_795_000_000_000);
    expect(changed).toMatchObject({ bitcoinPercent: 80, splitSince: 1_795_000_000 });
    expect(isMerchantSettings(changed)).toBe(true);
    // Unless the change says since when itself.
    const told = touchSettings(
      halfFiat,
      { bitcoinPercent: 80, splitSince: 1_794_000_000 },
      1_795_000_000_000
    );
    expect(told.splitSince).toBe(1_794_000_000);
    for (const splitSince of [undefined, null, -1, 1.5, "1790000000"]) {
      expect(isMerchantSettings({ ...halfFiat, splitSince })).toBe(false);
    }
  });

  it("keeps the transfers of the v2 wallet's coins: transaction ids, each once", () => {
    const txid = "ab".repeat(32);
    const other = "cd".repeat(32);
    expect(isMerchantSettings({ ...halfFiat, legacyTransfers: [txid, other] })).toBe(true);
    const full = Array.from({ length: MAX_LEGACY_TRANSFERS }, (_, index) =>
      index.toString(16).padStart(64, "0")
    );
    expect(isMerchantSettings({ ...halfFiat, legacyTransfers: full })).toBe(true);
    for (const legacyTransfers of [
      undefined,
      null,
      "",
      [txid, txid],
      [txid.toUpperCase()],
      [txid.slice(2)],
      [`${txid}00`],
      [42],
      [...full, txid]
    ]) {
      expect(isMerchantSettings({ ...halfFiat, legacyTransfers })).toBe(false);
    }
  });

  it("reads format 17: its bank details dropped, the Mt Pelerin account to choose again", () => {
    const { value, expected } = before18(halfFiat);
    const v17 = { ...value, version: 17 };
    expect(parseMerchantSettings(v17)).toEqual(expected);
    expect(parseMerchantSettings(v17)).not.toHaveProperty("bank");
    // Its date kept: the newest copy still wins (and a backup's date is its event's).
    expect(parseMerchantSettings(v17)?.updatedAt).toBe(halfFiat.updatedAt);
    // At 100 % bitcoin, the same settings.
    expect(parseMerchantSettings({ ...before18(allBitcoin).value, version: 17 })).toEqual(
      allBitcoin
    );
    // Its bank details, whatever they held, dropped all the same.
    expect(parseMerchantSettings({ ...v17, bank: { iban: "not one" } })).toEqual(expected);
    // Format 17 holding a field of format 18: not a file format 17 ever wrote, refused.
    expect(parseMerchantSettings({ ...v17, payoutAccountId: ACCOUNT_ID })).toBeNull();
    expect(parseMerchantSettings({ ...v17, payoutAccountId: null })).toBeNull();
  });

  it("reads format 16: no check of the recovery phrase done nor due", () => {
    const { value, expected } = before18(halfFiat);
    const { recoveryCheck: _check, ...v16 } = { ...value, version: 16 };
    expect(parseMerchantSettings(v16)).toEqual({
      ...expected,
      recoveryCheck: { verifiedAt: null, dueSince: null }
    });
    // Its date kept: the newest copy still wins (and a backup's date is its event's).
    expect(parseMerchantSettings(v16)?.updatedAt).toBe(halfFiat.updatedAt);
    // Format 16 holding a field of format 17: not a file format 16 ever wrote, refused.
    expect(
      parseMerchantSettings({ ...v16, recoveryCheck: { verifiedAt: null, dueSince: null } })
    ).toBeNull();
  });

  it("keeps the recovery phrase's check as Unix seconds or nothing, when it was seen above the threshold or nothing, and nothing else", () => {
    for (const recoveryCheck of [
      { verifiedAt: null, dueSince: null },
      { verifiedAt: 1_790_000_000, dueSince: null },
      { verifiedAt: null, dueSince: 1_790_000_000 },
      { verifiedAt: 1_790_000_000, dueSince: 1_795_000_000 },
      { verifiedAt: 1_790_000_000, dueSince: null, aboveThresholdAt: 1_790_000_000 }
    ]) {
      expect(isMerchantSettings({ ...halfFiat, recoveryCheck })).toBe(true);
    }
    for (const recoveryCheck of [
      undefined,
      null,
      [],
      {},
      { verifiedAt: null },
      { verifiedAt: -1, dueSince: null },
      { verifiedAt: 1.5, dueSince: null },
      { verifiedAt: null, dueSince: "1790000000" },
      { verifiedAt: null, dueSince: null, words: "legal winner" },
      { verifiedAt: null, dueSince: null, aboveThresholdAt: null },
      { verifiedAt: null, dueSince: null, aboveThresholdAt: -1 },
      { verifiedAt: null, dueSince: null, aboveThresholdAt: "1790000000" },
      { verifiedAt: null, aboveThresholdAt: 1_790_000_000 }
    ]) {
      expect(isMerchantSettings({ ...halfFiat, recoveryCheck })).toBe(false);
    }
  });

  it("reads format 15: the split counted from its last change, no transfer of the v2 wallet", () => {
    const {
      splitSince: _since,
      legacyTransfers: _transfers,
      recoveryCheck: _check15,
      ...v15
    } = {
      ...before18(halfFiat).value,
      version: 15,
      updatedAt: 1_791_234_567
    };
    expect(parseMerchantSettings(v15)).toEqual({
      ...before18(halfFiat).expected,
      updatedAt: 1_791_234_567,
      splitSince: 1_791_234_567
    });
    // Format 15 holding a field of format 16: not a file format 15 ever wrote, refused.
    expect(parseMerchantSettings({ ...v15, splitSince: 1_790_000_000 })).toBeNull();
    expect(parseMerchantSettings({ ...v15, legacyTransfers: [] })).toBeNull();
  });

  it("reads format 14, with mempool.space and the product lookup on, as the app did then", () => {
    const {
      bitcoinNode: _node,
      productLookup: _lookup,
      splitSince: _since,
      legacyTransfers: _transfers,
      recoveryCheck: _check14,
      ...v14
    } = { ...before18(halfFiat).value, version: 14 };
    expect(parseMerchantSettings(v14)).toEqual(before18(halfFiat).expected);
    // Its date kept: the newest copy still wins (and a backup's date is its event's).
    expect(parseMerchantSettings(v14)?.updatedAt).toBe(halfFiat.updatedAt);
    // Format 14 holding a field of format 15: not a file format 14 ever wrote, refused.
    expect(parseMerchantSettings({ ...v14, bitcoinNode: null })).toBeNull();
    expect(parseMerchantSettings({ ...v14, productLookup: false })).toBeNull();
  });

  it("keeps the business's address, each line trimmed and at most 120 characters", () => {
    const address = {
      street: "4 Market Street",
      postalCode: "1204",
      city: "Geneva",
      country: "CH"
    };
    expect(isMerchantSettings({ ...halfFiat, businessAddress: address })).toBe(true);
    // Lines not typed yet, no country known: still an address.
    expect(
      isMerchantSettings({
        ...halfFiat,
        businessAddress: { street: "", postalCode: "", city: "", country: null }
      })
    ).toBe(true);
    for (const businessAddress of [
      { ...address, street: " 4 Market Street" },
      { ...address, city: "G".repeat(121) },
      { ...address, country: "che" },
      { ...address, country: "" },
      { street: "4 Market Street", postalCode: "1204", city: "Geneva" },
      { ...address, postalCode: 1204 },
      "4 Market Street, 1204 Geneva",
      undefined
    ]) {
      expect(isMerchantSettings({ ...halfFiat, businessAddress })).toBe(false);
    }
  });

  it("keeps the business's company and VAT numbers, trimmed and at most 40 characters", () => {
    expect(
      isMerchantSettings({
        ...halfFiat,
        companyNumber: "CHE-123.456.789",
        vatNumber: "CHE-123.456.789 MWST"
      })
    ).toBe(true);
    for (const companyNumber of [" CHE-123.456.789", "1".repeat(41), null, undefined, 123]) {
      expect(isMerchantSettings({ ...halfFiat, companyNumber })).toBe(false);
      expect(isMerchantSettings({ ...halfFiat, vatNumber: companyNumber })).toBe(false);
    }
  });

  it("reads format 13, without the business's address nor its numbers", () => {
    const {
      businessAddress: _none,
      companyNumber: _noCompany,
      vatNumber: _noVat,
      bitcoinNode: _node,
      productLookup: _lookup,
      splitSince: _since1,
      legacyTransfers: _transfers1,
      recoveryCheck: _check13,
      ...v13
    } = { ...before18(halfFiat).value, version: 13 };
    expect(parseMerchantSettings(v13)).toEqual(before18(halfFiat).expected);
    // Its date kept: the newest copy still wins (and a backup's date is its event's).
    expect(parseMerchantSettings(v13)?.updatedAt).toBe(halfFiat.updatedAt);
    // Format 13 holding an address: not a file format 13 ever wrote, refused.
    const address = {
      street: "4 Market Street",
      postalCode: "1204",
      city: "Geneva",
      country: "CH"
    };
    expect(parseMerchantSettings({ ...v13, businessAddress: address })).toBeNull();
    expect(parseMerchantSettings({ ...v13, businessAddress: null })).toBeNull();
    expect(parseMerchantSettings({ ...v13, companyNumber: "" })).toBeNull();
    expect(parseMerchantSettings({ ...v13, vatNumber: "CHE-123.456.789 MWST" })).toBeNull();
  });

  it("reads format 12, its bank details (its holder one name) dropped as format 17's", () => {
    const { holder: _holder, ...bank } = BANK_17;
    const {
      businessAddress: _a,
      companyNumber: _c,
      vatNumber: _v,
      bitcoinNode: _n,
      productLookup: _l,
      splitSince: _since2,
      legacyTransfers: _transfers2,
      recoveryCheck: _check12,
      ...halfFiat12
    } = before18(halfFiat).value;
    const {
      businessAddress: _a2,
      companyNumber: _c2,
      vatNumber: _v2,
      bitcoinNode: _n2,
      productLookup: _l2,
      splitSince: _since3,
      legacyTransfers: _transfers3,
      recoveryCheck: _checkAll12,
      ...allBitcoin12
    } = before18(allBitcoin).value;
    const v12 = {
      ...halfFiat12,
      version: 12,
      bank: { ...bank, holderName: "Fine Bakery LLC" }
    };
    expect(parseMerchantSettings(v12)).toEqual(before18(halfFiat).expected);
    // Its date kept: the newest copy still wins (and a backup's date is its event's).
    expect(parseMerchantSettings(v12)?.updatedAt).toBe(halfFiat.updatedAt);
    // Without a bank account (100 % bitcoin): the same settings.
    expect(parseMerchantSettings({ ...allBitcoin12, version: 12 })).toEqual(allBitcoin);
    // Format 12 holding a field of a later format: not a file format 12 ever wrote, refused.
    expect(parseMerchantSettings({ ...v12, businessAddress: null })).toBeNull();
  });
});

describe("merchant settings store", () => {
  it("keeps one file per wallet in the documents directory, and reads it back", async () => {
    await saveMerchantSettings(WALLET, halfFiat);

    expect([...fileSystem.files.keys()]).toEqual([`${SETTINGS_DIR}/${WALLET}.json`]);
    await expect(loadMerchantSettings(WALLET)).resolves.toEqual(halfFiat);
    // Another account on the same device sees nothing.
    await expect(loadMerchantSettings(OTHER_WALLET)).resolves.toBeNull();
  });

  it("replaces the previous settings of the wallet", async () => {
    await saveMerchantSettings(WALLET, halfFiat);
    await saveMerchantSettings(WALLET, allBitcoin);

    await expect(loadMerchantSettings(WALLET)).resolves.toEqual(allBitcoin);
    expect(fileSystem.files.size).toBe(1);
  });

  it("never writes invalid settings", async () => {
    await expect(
      // A bank account at 100 % bitcoin.
      saveMerchantSettings(WALLET, { ...allBitcoin, payoutAccountId: ACCOUNT_ID })
    ).rejects.toThrow(/Invalid merchant settings/);
    expect(fileSystem.files.size).toBe(0);
  });

  it("only takes hex wallet ids, which cannot leave the directory", async () => {
    await expect(saveMerchantSettings("../settings", allBitcoin)).rejects.toThrow(/wallet id/);
    await expect(loadMerchantSettings("")).rejects.toThrow(/wallet id/);
  });

  it("rejects a file it cannot trust", async () => {
    await saveMerchantSettings(WALLET, allBitcoin);
    fileSystem.files.set(`${SETTINGS_DIR}/${WALLET}.json`, JSON.stringify({ version: 2 }));

    await expect(loadMerchantSettings(WALLET)).rejects.toThrow(/Unexpected merchant settings/);
    // A file of a format before 12 too: none is converted.
    fileSystem.files.set(
      `${SETTINGS_DIR}/${WALLET}.json`,
      JSON.stringify({ ...allBitcoin, version: 11 })
    );
    await expect(loadMerchantSettings(WALLET)).rejects.toThrow(/Unexpected merchant settings/);
  });
});
