import { closeAccount } from "@/features/account/session";
import {
  oldestValued,
  valueCardPayments,
  valueCurrency,
  valuesOf
} from "@/features/card/history-value";
import { loadCardPayments, logCardPayment, type CardPaymentEntry } from "@/lib/card/payment-log";
import { readLog } from "@/lib/log/log";
import { HOUR_SECONDS } from "@/lib/rates/sources";
import { saveTerminalProfile } from "@/lib/terminal/profile";
import { resetTerminalProfileCache } from "@/features/terminal/profile-cache";

import { TEST_WALLET_ID, openTestAccount, testBackupKey } from "../../jest/account";
import { coingecko, setCoingeckoPrice } from "../../jest/coingecko";
import type * as FileSystemFake from "../../jest/expo-file-system";

/*
 * What each card payment was worth when it left (its fiat amount and currency, recorded on the
 * relays): its sats at the CoinGecko point of the hour that priced its time, in the account's
 * currency, worked out once.
 */

const fileSystem = jest.requireMock<typeof FileSystemFake>("expo-file-system");
const CARD = "0123456789abcdef0123456789abcdef";

/** Three days ago, on an hour: CoinGecko's hourly series holds it. */
const H = Math.floor(Date.now() / 1000 / HOUR_SECONDS) * HOUR_SECONDS - 72 * HOUR_SECONDS;

function entry(id: string, at: number, fields: Partial<CardPaymentEntry> = {}): CardPaymentEntry {
  return {
    id,
    cardId: CARD,
    walletGeneration: 1,
    at,
    amountSats: 29_901n,
    paymentHash: id.padStart(64, "0"),
    description: null,
    outcome: "sent",
    reason: null,
    pr: "lnbc1",
    payee: null,
    preimage: null,
    value: null,
    ...fields
  };
}

beforeEach(() => {
  fileSystem.resetFileSystem();
  resetTerminalProfileCache();
});

afterEach(() => closeAccount());

describe("a movement's value", () => {
  it("is its sats at the point of the hour that priced its time, to the nearest minor unit", async () => {
    setCoingeckoPrice("CHF", H, 84_950);
    setCoingeckoPrice("CHF", H + HOUR_SECONDS, 85_000);
    const values = await valuesOf(
      [
        // 29 901 sats at 84 950 CHF: 25,4009… CHF.
        { id: "a", sats: 29_901n, at: (H + 5 * 60) * 1000 },
        // 5 minutes past the next hour, less a second: still that hour's point.
        { id: "b", sats: 1_850n, at: (H + HOUR_SECONDS + 299) * 1000 },
        // From 5 minutes past: the next one. 1 850 sats at 85 000: 1,5725 → 1,57.
        { id: "c", sats: 1_850n, at: (H + HOUR_SECONDS + 300) * 1000 }
      ],
      "CHF"
    );
    expect(values).toEqual(
      new Map([
        ["a", { minor: 2540, digits: 2, currency: "CHF", hour: H }],
        ["b", { minor: 157, digits: 2, currency: "CHF", hour: H }],
        ["c", { minor: 157, digits: 2, currency: "CHF", hour: H + HOUR_SECONDS }]
      ])
    );
  });

  it("keeps the currency's own minor unit, and rounds half up", async () => {
    setCoingeckoPrice("JPY", H, 15_000_000);
    setCoingeckoPrice("EUR", H, 80_000);
    const at = (H + 600) * 1000;
    expect(await valuesOf([{ id: "a", sats: 50_001n, at }], "JPY")).toEqual(
      new Map([["a", { minor: 7500, digits: 0, currency: "JPY", hour: H }]])
    );
    // 15 625 sats at 80 000 EUR: exactly 12,50; 15 619 sats: 12,4952 → 12,50; 15 618: 12,4944 → 12,49.
    expect(
      await valuesOf(
        [
          { id: "a", sats: 15_625n, at },
          { id: "b", sats: 15_619n, at },
          { id: "c", sats: 15_618n, at }
        ],
        "EUR"
      )
    ).toEqual(
      new Map([
        ["a", { minor: 1250, digits: 2, currency: "EUR", hour: H }],
        ["b", { minor: 1250, digits: 2, currency: "EUR", hour: H }],
        ["c", { minor: 1249, digits: 2, currency: "EUR", hour: H }]
      ])
    );
  });

  it("is none without a point: CoinGecko refusing, an hour it never priced, nor older than its history", async () => {
    setCoingeckoPrice("CHF", H, 84_950);
    coingecko.down = true;
    expect(await valuesOf([{ id: "a", sats: 1n, at: (H + 600) * 1000 }], "CHF")).toEqual(new Map());
    expect(readLog().entries.map((e) => e.event)).toContain(
      "Reading the rates of card movements failed"
    );
    coingecko.down = false;
    expect(
      await valuesOf([{ id: "b", sats: 1n, at: (H - 5 * HOUR_SECONDS) * 1000 }], "CHF")
    ).toEqual(new Map());
    const now = Date.now();
    expect(oldestValued(now)).toBe(now - 364 * 24 * HOUR_SECONDS * 1000 - (now % 1000));
  });
});

describe("the currency of a value", () => {
  it("is the open account's, else this phone's point of sale's, of the same wallet only", async () => {
    await openTestAccount({ displayCurrency: "EUR" });
    expect(await valueCurrency(TEST_WALLET_ID)).toBe("EUR");
    closeAccount();
    expect(await valueCurrency(TEST_WALLET_ID)).toBeNull();
    await saveTerminalProfile({
      version: 2,
      walletId: TEST_WALLET_ID,
      backupKey: testBackupKey(),
      lightningAddress: "sattleme02c6047f94@breez.tips",
      businessName: "Fine Bakery",
      currency: "CHF"
    });
    resetTerminalProfileCache();
    expect(await valueCurrency(TEST_WALLET_ID.toUpperCase())).toBe("CHF");
    expect(await valueCurrency("03".padEnd(66, "b"))).toBeNull();
  });
});

describe("the values of the phone's card payments", () => {
  it("are worked out for those that left, once, in the account's currency", async () => {
    await openTestAccount({ displayCurrency: "CHF" });
    setCoingeckoPrice("CHF", H, 84_950);
    const at = (H + 600) * 1000;
    await logCardPayment(entry("a1", at));
    await logCardPayment(entry("a2", at + 1, { outcome: "declined", reason: "declined" }));
    await valueCardPayments(TEST_WALLET_ID);
    expect(await loadCardPayments()).toMatchObject([
      { id: "a1", value: { minor: 2540, digits: 2, currency: "CHF", hour: H } },
      { id: "a2", value: null }
    ]);
    // Never worked out again: another currency since, another price, the value stays.
    setCoingeckoPrice("CHF", H, 90_000);
    await valueCardPayments(TEST_WALLET_ID);
    expect((await loadCardPayments())[0].value).toMatchObject({ minor: 2540 });
  });

  it("wait for CoinGecko when it does not answer", async () => {
    await openTestAccount({ displayCurrency: "CHF" });
    setCoingeckoPrice("CHF", H, 84_950);
    coingecko.down = true;
    await logCardPayment(entry("a1", (H + 600) * 1000));
    await valueCardPayments(TEST_WALLET_ID);
    expect((await loadCardPayments())[0].value).toBeNull();
    coingecko.down = false;
    await valueCardPayments(TEST_WALLET_ID);
    expect((await loadCardPayments())[0].value).toMatchObject({ minor: 2540 });
  });
});
