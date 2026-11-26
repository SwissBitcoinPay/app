import { utf8ToBytes } from "@noble/hashes/utils.js";

import {
  INVOICE_EXPIRY_SECONDS,
  VERIFY_INTERVAL_MS,
  VERIFY_SLOW_INTERVAL_MS,
  verifyDelayMs
} from "@/features/terminal/invoice";
import { ensureLightningAddress, lightningAddressUsernames } from "@/lib/breez/lightning-address";
import { decodeTextPayload, decodeUriPayload, lnurlFromRecords } from "@/lib/nfc/ndef";
import {
  currencyDigits,
  fiatToSats,
  formatBtc,
  formatFiat,
  formatFiatPlain,
  formatSatsGrouped,
  maxMinorUnits,
  pressKey,
  rateToFraction,
  splitSatsLead
} from "@/lib/terminal/amount";
import {
  accountProfile,
  isCardHolderProfile,
  isMemberProfile,
  ownerProfile,
  parseCatalogRecord,
  parseTerminalProfile,
  profileAccount,
  type CatalogRecord
} from "@/lib/terminal/model";
import {
  clearTerminalProfile,
  loadCatalogRecord,
  loadTerminalProfile,
  saveCatalogRecord,
  saveTerminalProfile
} from "@/lib/terminal/profile";

import {
  POS_MODE_STORE_KEY,
  parseStoredPosMode,
  serializePosMode
} from "@/features/terminal/pos-mode-format";

import type * as SecureStoreFake from "../../jest/expo-secure-store";

const WALLET = "02c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5";
const PROFILE = {
  version: 2,
  walletId: WALLET,
  backupKey: "5f".repeat(32),
  lightningAddress: "sattleme02c6047f94@breez.tips",
  businessName: "Merchant 9EE5",
  currency: "CHF"
} as const;

describe("keypad amounts", () => {
  it("knows the minor unit of the payout currencies", () => {
    expect(currencyDigits("CHF")).toBe(2);
    expect(currencyDigits("EUR")).toBe(2);
    expect(currencyDigits("JPY")).toBe(0);
  });

  it("shifts digits in from the right, up to 99,999.99", () => {
    let minor = 0;
    for (const key of ["2", "4", "5", "0"] as const) minor = pressKey(minor, key, 2);
    expect(minor).toBe(2450);
    expect(pressKey(minor, "00", 2)).toBe(245000);
    expect(pressKey(minor, "del", 2)).toBe(245);
    expect(pressKey(0, "del", 2)).toBe(0);
    expect(maxMinorUnits(2)).toBe(9_999_999);
    expect(maxMinorUnits(0)).toBe(99_999);
    expect(pressKey(9_999_999, "9", 2)).toBe(9_999_999);
    expect(pressKey(99_999, "00", 2)).toBe(9_999_900);
    expect(pressKey(99_999, "00", 0)).toBe(99_999);
  });

  it("reads a rate exactly as its decimal digits", () => {
    expect(rateToFraction(52213.45)).toEqual({ numerator: 5221345n, denominator: 100n });
    expect(rateToFraction(95000)).toEqual({ numerator: 95000n, denominator: 1n });
    expect(rateToFraction(0.1)).toEqual({ numerator: 1n, denominator: 10n });
    expect(() => rateToFraction(0)).toThrow();
    expect(() => rateToFraction(Number.NaN)).toThrow();
  });

  it("converts to sats on integers, rounded up to the next whole sat", () => {
    // 24.50 CHF at 52,213.45 CHF/BTC = 46,922.94… sats → 46,923.
    expect(fiatToSats(2450, 2, 52213.45)).toBe(46923n);
    // Exact: 100.00 at 100,000 per BTC = 100,000 sats, no rounding.
    expect(fiatToSats(10000, 2, 100000)).toBe(100000n);
    // 0.01 CHF at 100,000 CHF/BTC is exactly 10 sats; at 3,000,000, a third of a sat → 1.
    expect(fiatToSats(1, 2, 100000)).toBe(10n);
    expect(fiatToSats(1, 2, 3_000_000)).toBe(1n);
    // No float on the way: 99,999.99 at 0.1 per BTC.
    expect(fiatToSats(9_999_999, 2, 0.1)).toBe(99_999_990_000_000n);
    expect(fiatToSats(500, 0, 15_000_000)).toBe(3334n);
  });

  it("formats with the device locale, from the integer", () => {
    expect(formatFiat(2450, 2, "en-US")).toBe("24.50");
    expect(formatFiat(123456789, 2, "en-US")).toBe("1,234,567.89");
    expect(formatFiat(5, 2, "en-US")).toBe("0.05");
    expect(formatFiat(0, 2, "fr-CH")).toBe("0,00");
    expect(formatFiat(12345, 0, "en-US")).toBe("12,345");
    expect(formatFiat(2450, 2, "not a tag")).toMatch(/^24.50$/);
    // The cents in the locale's own digits, like the units.
    expect(formatFiat(2405, 2, "ar-EG")).toBe(
      new Intl.NumberFormat("ar-EG", { minimumFractionDigits: 2 }).format(24.05)
    );
  });

  it("writes a fiat amount for a field, without grouping", () => {
    expect(formatFiatPlain(2450, 2, "fr-CH")).toBe("24,50");
    expect(formatFiatPlain(123456789, 2, "fr-CH")).toBe("1234567,89");
    expect(formatFiatPlain(123456789, 2, "en-US")).toBe("1234567.89");
    expect(formatFiatPlain(5, 2, "de-CH")).toBe("0.05");
    expect(formatFiatPlain(12345, 0, "en-US")).toBe("12345");
  });

  it("writes a bitcoin amount exactly, in the device locale, without trailing zeros", () => {
    expect(formatBtc(100_000_000n, "fr-CH")).toBe("1");
    expect(formatBtc(4_000_000n, "fr-CH")).toBe("0,04");
    expect(formatBtc(4_000_000n, "de-CH")).toBe("0.04");
    expect(formatBtc(1n, "fr-CH")).toBe("0,00000001");
    expect(formatBtc(0n, "fr-CH")).toBe("0");
    // Grouped as the locale groups: 21 million bitcoins.
    expect(formatBtc(2_100_000_000_000_000n, "en-US")).toBe("21,000,000");
    expect(formatBtc(123_456_789n, "en-US")).toBe("1.23456789");
    expect(() => formatBtc(-1n, "fr-CH")).toThrow();
  });

  it("groups sats like the design", () => {
    expect(formatSatsGrouped(46918n)).toBe("0.00 046 918");
    expect(formatSatsGrouped(123_456_789n)).toBe("1.23 456 789");
    expect(splitSatsLead("0.00 046 918")).toEqual(["0.00 0", "46 918"]);
  });
});

describe("point of sale profile", () => {
  it("accepts only a complete, well-formed profile", () => {
    expect(parseTerminalProfile(PROFILE)).toEqual(PROFILE);
    expect(parseTerminalProfile({ ...PROFILE, version: 4 })).toBeNull();
    // The backup key is the x-only public key of the backups: 32 bytes, lowercase hex.
    expect(parseTerminalProfile({ ...PROFILE, backupKey: undefined })).toBeNull();
    expect(parseTerminalProfile({ ...PROFILE, backupKey: "5F".repeat(32) })).toBeNull();
    expect(parseTerminalProfile({ ...PROFILE, backupKey: "02" + "5f".repeat(32) })).toBeNull();
    expect(parseTerminalProfile({ ...PROFILE, walletId: "02ab" })).toBeNull();
    expect(parseTerminalProfile({ ...PROFILE, lightningAddress: "nope" })).toBeNull();
    expect(parseTerminalProfile({ ...PROFILE, businessName: " " })).toBeNull();
    expect(parseTerminalProfile({ ...PROFILE, currency: "chf" })).toBeNull();
    expect(parseTerminalProfile(null)).toBeNull();
  });

  it("refuses an owner's profile of version 1, without its backup key", () => {
    const { backupKey: _key, ...rest } = PROFILE;
    // No device keeps one: the device then needs a login, as without a profile.
    expect(parseTerminalProfile({ ...rest, version: 1 })).toBeNull();
    expect(parseTerminalProfile({ ...PROFILE, version: 1 })).toBeNull();
  });

  it("accepts an employee's profile, which names the team, never the wallet", () => {
    const member = {
      version: 3,
      team: "a".repeat(64),
      memberName: "Alice",
      lightningAddress: PROFILE.lightningAddress,
      businessName: PROFILE.businessName,
      currency: PROFILE.currency
    };
    const parsed = parseTerminalProfile(member);
    expect(parsed).toEqual(member);
    expect(parsed && isMemberProfile(parsed)).toBe(true);
    expect(parsed && profileAccount(parsed)).toBe("a".repeat(64));
    expect(isMemberProfile(PROFILE)).toBe(false);
    expect(profileAccount(PROFILE)).toBe(PROFILE.walletId);
    expect(parseTerminalProfile({ ...member, team: PROFILE.walletId })).toBeNull();
    expect(parseTerminalProfile({ ...member, memberName: "" })).toBeNull();
    // Version 2 is the owner's: an employee's profile is never read as one.
    expect(parseTerminalProfile({ ...member, version: 2 })).toBeNull();
    expect(parseTerminalProfile({ ...member, version: 4 })).toBeNull();
  });

  it("accepts a card holder's profile: the account's id and key, no Lightning address", () => {
    // A 100 % card account has no main wallet nor point of sale.
    const holder = {
      version: 4,
      walletId: WALLET,
      backupKey: PROFILE.backupKey,
      businessName: PROFILE.businessName,
      currency: PROFILE.currency
    };
    const parsed = parseTerminalProfile(holder);
    expect(parsed).toEqual(holder);
    expect(parsed && isCardHolderProfile(parsed)).toBe(true);
    expect(parsed && isMemberProfile(parsed)).toBe(false);
    expect(parsed && profileAccount(parsed)).toBe(WALLET);
    // An owner's device, never a point of sale.
    expect(accountProfile(parsed)).toEqual(holder);
    expect(ownerProfile(parsed)).toBeNull();
    expect(ownerProfile(PROFILE)).toEqual(PROFILE);
    expect(accountProfile(PROFILE)).toEqual(PROFILE);
    expect(isCardHolderProfile(PROFILE)).toBe(false);
    // Always with its backup key, never with a Lightning address.
    expect(parseTerminalProfile({ ...holder, backupKey: null })).toBeNull();
    expect(parseTerminalProfile({ ...holder, backupKey: "5F".repeat(32) })).toBeNull();
    expect(
      parseTerminalProfile({ ...holder, lightningAddress: PROFILE.lightningAddress })
    ).toBeNull();
    expect(parseTerminalProfile({ ...holder, walletId: "02ab" })).toBeNull();
    expect(parseTerminalProfile({ ...holder, businessName: "" })).toBeNull();
    expect(parseTerminalProfile({ ...holder, currency: "chf" })).toBeNull();
    // Version 2 needs its Lightning address: a card holder's profile is never read as one.
    expect(parseTerminalProfile({ ...holder, version: 2 })).toBeNull();
  });

  it("is kept in the secure storage, without biometrics, on this device only", async () => {
    const secureStore = jest.requireMock<typeof SecureStoreFake>("expo-secure-store");
    await expect(loadTerminalProfile()).resolves.toBeNull();
    await saveTerminalProfile(PROFILE);
    await expect(loadTerminalProfile()).resolves.toEqual(PROFILE);
    expect(secureStore.setItemAsync).toHaveBeenLastCalledWith(
      "terminal-profile",
      JSON.stringify(PROFILE),
      { keychainAccessible: secureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY }
    );
    // No option that would ask for Face ID or a fingerprint.
    for (const call of secureStore.setItemAsync.mock.calls) {
      expect(call[2]).not.toHaveProperty("requireAuthentication");
    }
    await clearTerminalProfile();
    await expect(loadTerminalProfile()).resolves.toBeNull();
  });

  it("counts a damaged profile as none", async () => {
    const secureStore = jest.requireMock<typeof SecureStoreFake>("expo-secure-store");
    secureStore.items.set("terminal-profile", "{not json");
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    await expect(loadTerminalProfile()).resolves.toBeNull();
    warn.mockRestore();
  });
});

describe("the wallet's Lightning address", () => {
  function api(taken: string[] = [], existing?: string) {
    return {
      getLightningAddress: jest.fn(async () =>
        existing ? { lightningAddress: existing, username: existing.split("@")[0] } : undefined
      ),
      checkLightningAddressAvailable: jest.fn(
        async ({ username }: { username: string }) => !taken.includes(username)
      ),
      registerLightningAddress: jest.fn(async ({ username }: { username: string }) => ({
        lightningAddress: `${username}@breez.tips`
      }))
    };
  }

  it("uses sattleme and the first 10 hex characters of the identity key", async () => {
    expect(lightningAddressUsernames(WALLET)).toEqual([
      "sattleme02c6047f94",
      "sattleme02c6047f9441ed7d",
      "sattleme02c6047f9441ed7d6d304540"
    ]);
    const sdk = api();
    await expect(ensureLightningAddress(sdk, WALLET, "Merchant 9EE5")).resolves.toBe(
      "sattleme02c6047f94@breez.tips"
    );
    expect(sdk.registerLightningAddress).toHaveBeenCalledWith({
      username: "sattleme02c6047f94",
      description: "Merchant 9EE5"
    });
  });

  // An address registered already keeps its name, even one this device would not choose.
  it("keeps the address registered already, by this device or another", async () => {
    const sdk = api([], "bakery@breez.tips");
    await expect(ensureLightningAddress(sdk, WALLET, "x")).resolves.toBe("bakery@breez.tips");
    expect(sdk.registerLightningAddress).not.toHaveBeenCalled();
  });

  it("takes a longer name when the short one is taken", async () => {
    const sdk = api(["sattleme02c6047f94"]);
    await expect(ensureLightningAddress(sdk, WALLET, "x")).resolves.toBe(
      "sattleme02c6047f9441ed7d@breez.tips"
    );
  });
});

describe("BoltCard NDEF records", () => {
  const bytes = (text: string) => [...utf8ToBytes(text)];

  it("decodes URI and text records", () => {
    expect(decodeUriPayload([0, ...bytes("lnurlw://card.example.com/ln?p=1")])).toBe(
      "lnurlw://card.example.com/ln?p=1"
    );
    expect(decodeUriPayload([4, ...bytes("card.example.com")])).toBe("https://card.example.com");
    // Status byte: UTF-8, language "en".
    expect(decodeTextPayload([2, ...bytes("en"), ...bytes("lnurlw://x.com/a")])).toBe(
      "lnurlw://x.com/a"
    );
  });

  it("finds the card's LNURL among its records", () => {
    expect(
      lnurlFromRecords([
        { tnf: 1, type: "T", payload: [2, ...bytes("en"), ...bytes("Hello")] },
        { tnf: 1, type: [0x55], payload: [0, ...bytes("lnurlw://card.example.com/ln?p=1")] }
      ])
    ).toBe("lnurlw://card.example.com/ln?p=1");
    expect(lnurlFromRecords([{ tnf: 1, type: "U", payload: [0, ...bytes("tel:123")] }])).toBe(null);
    expect(lnurlFromRecords([])).toBeNull();
  });
});

describe("point of sale profile on the web", () => {
  const entries = new Map<string, string>();

  beforeAll(() => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => entries.get(key) ?? null,
        setItem: (key: string, value: string) => void entries.set(key, String(value)),
        removeItem: (key: string) => void entries.delete(key)
      }
    });
  });

  afterAll(() => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  it("is kept in the browser's localStorage, which holds no secret", async () => {
    const web = jest.requireActual<typeof import("@/lib/terminal/profile.web")>(
      "@/lib/terminal/profile.web"
    );
    await expect(web.loadTerminalProfile()).resolves.toBeNull();
    await web.saveTerminalProfile(PROFILE);
    expect(JSON.parse(entries.get("terminal-profile")!)).toEqual(PROFILE);
    await expect(web.loadTerminalProfile()).resolves.toEqual(PROFILE);
    entries.set("terminal-profile", '{"version":1}');
    await expect(web.loadTerminalProfile()).resolves.toBeNull();
    await web.clearTerminalProfile();
    expect(entries.has("terminal-profile")).toBe(false);
  });
});

describe("BoltCard reading on the web", () => {
  const web = jest.requireActual<typeof import("@/lib/nfc/boltcard.web")>("@/lib/nfc/boltcard.web");

  afterEach(() => {
    delete (globalThis as { NDEFReader?: unknown }).NDEFReader;
  });

  function fakeReader(scan: () => Promise<void>) {
    (globalThis as { NDEFReader?: unknown }).NDEFReader = class {
      onreading = null;
      onreadingerror = null;
      scan = scan;
    };
  }

  it("reports a refused scan as a failure, not as a cancelled reading", async () => {
    const refused = new Error("Permission denied");
    fakeReader(() => Promise.reject(refused));
    const read = web.readCard({ alertMessage: "" });
    const error: unknown = await read.lnurl.catch((e: unknown) => e);
    expect(error).toBe(refused);
    expect(web.isReadCancelled(error)).toBe(false);
  });

  it("reports a cancelled reading as such", async () => {
    fakeReader(() => new Promise<void>(() => undefined));
    const read = web.readCard({ alertMessage: "" });
    read.cancel();
    const error: unknown = await read.lnurl.catch((e: unknown) => e);
    expect(web.isReadCancelled(error)).toBe(true);
  });
});

describe("pace of the invoice checks", () => {
  const SINCE = 1_800_000_000;
  const YEAR = 365 * 24 * 3600;

  it("checks every second for the first 10 minutes, then every 30 s", () => {
    expect(VERIFY_INTERVAL_MS).toBe(1000);
    const end = SINCE + YEAR;
    expect(verifyDelayMs(SINCE, end, SINCE)).toBe(VERIFY_INTERVAL_MS);
    expect(verifyDelayMs(SINCE, end, SINCE + INVOICE_EXPIRY_SECONDS - 1)).toBe(VERIFY_INTERVAL_MS);
    expect(verifyDelayMs(SINCE, end, SINCE + INVOICE_EXPIRY_SECONDS)).toBe(VERIFY_SLOW_INTERVAL_MS);
    expect(verifyDelayMs(SINCE, end, SINCE + 30 * 24 * 3600)).toBe(VERIFY_SLOW_INTERVAL_MS);
  });

  it("keeps the usual pace for a sale's invoice, to its end and through its grace period", () => {
    const end = SINCE + INVOICE_EXPIRY_SECONDS;
    for (let now = SINCE; now <= end + 30; now += 1) {
      expect(verifyDelayMs(SINCE, end, now)).toBe(VERIFY_INTERVAL_MS);
    }
  });

  it("stops the last slow wait at the invoice's end, and checks its grace period quickly", () => {
    const end = SINCE + YEAR;
    expect(verifyDelayMs(SINCE, end, end - 10)).toBe(10_000);
    expect(verifyDelayMs(SINCE, end, end - 1)).toBe(VERIFY_INTERVAL_MS);
    expect(verifyDelayMs(SINCE, end, end)).toBe(VERIFY_INTERVAL_MS);
    expect(verifyDelayMs(SINCE, end, end + 20)).toBe(VERIFY_INTERVAL_MS);
  });
});

describe("catalogue's keys on the device", () => {
  const RECORD: CatalogRecord = {
    version: 1,
    account: "a".repeat(64),
    reader: {
      author: "b".repeat(64),
      addressKey: "d".repeat(64),
      epoch: 1,
      encryptionKeys: ["c".repeat(64), "e".repeat(64)]
    }
  };

  it("are kept in the secure storage, for one account, none (null) included", async () => {
    const secureStore = jest.requireMock<typeof SecureStoreFake>("expo-secure-store");
    await expect(loadCatalogRecord()).resolves.toBeNull();
    await saveCatalogRecord(RECORD);
    await expect(loadCatalogRecord()).resolves.toEqual(RECORD);
    expect(secureStore.setItemAsync).toHaveBeenLastCalledWith(
      "terminal-catalog",
      JSON.stringify(RECORD),
      { keychainAccessible: secureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY }
    );
    const none = { ...RECORD, reader: null };
    await saveCatalogRecord(none);
    await expect(loadCatalogRecord()).resolves.toEqual(none);
  });

  it("count anything invalid as none", () => {
    expect(parseCatalogRecord(RECORD)).toEqual(RECORD);
    expect(parseCatalogRecord({ ...RECORD, version: 2 })).toBeNull();
    expect(parseCatalogRecord({ ...RECORD, account: "x" })).toBeNull();
    expect(
      parseCatalogRecord({ ...RECORD, reader: { ...RECORD.reader, author: "B".repeat(64) } })
    ).toBeNull();
    expect(parseCatalogRecord({ ...RECORD, reader: undefined })).toBeNull();
    expect(parseCatalogRecord({ ...RECORD, reader: "none" })).toBeNull();
  });
});

describe("point of sale's mode on the device", () => {
  it("reads what it wrote, and anything else as none", () => {
    expect(parseStoredPosMode(serializePosMode("articles"))).toBe("articles");
    expect(parseStoredPosMode(serializePosMode("amount"))).toBe("amount");
    expect(parseStoredPosMode(serializePosMode("scan"))).toBe("scan");
    expect(POS_MODE_STORE_KEY).toBe("terminal-pos-mode");
    expect(parseStoredPosMode(null)).toBeNull();
    expect(parseStoredPosMode("{not json")).toBeNull();
    expect(parseStoredPosMode(JSON.stringify({ version: 3, mode: "articles" }))).toBeNull();
    expect(parseStoredPosMode(JSON.stringify({ version: 2, mode: "basket" }))).toBeNull();
    // Version 1 never held the scan.
    expect(parseStoredPosMode(JSON.stringify({ version: 1, mode: "scan" }))).toBeNull();
  });

  it('writes "Amount" and "Items" as before the scan, for older apps', () => {
    // As an app older than the scan wrote them, and reads them.
    expect(JSON.parse(serializePosMode("amount"))).toEqual({ version: 1, mode: "amount" });
    expect(JSON.parse(serializePosMode("articles"))).toEqual({ version: 1, mode: "articles" });
    // The scan in a version of its own, which an older app reads as none (its keypad).
    expect(JSON.parse(serializePosMode("scan"))).toEqual({ version: 2, mode: "scan" });
  });
});
