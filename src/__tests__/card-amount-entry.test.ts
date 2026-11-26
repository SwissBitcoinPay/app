import {
  EMPTY_ENTRY,
  MAX_ENTRY_SATS,
  entrySats,
  entryText,
  readEntryText,
  sameEntry,
  switchedEntry,
  type AmountEntry
} from "@/features/card/amount-entry";

const sats = (value: bigint): AmountEntry => ({ unit: "sats", sats: value, minor: 0 });
const fiat = (minor: number): AmountEntry => ({ unit: "fiat", sats: 0n, minor });

describe('an amount typed in its field ("Top up", "Withdraw", "Lightning invoice" on a desktop)', () => {
  it("reads sats as typed, grouping ignored, and nothing for an empty field", () => {
    expect(readEntryText("20000", "sats", 2)).toEqual(sats(20_000n));
    expect(readEntryText("20 000", "sats", 2)).toEqual(sats(20_000n));
    expect(readEntryText("20 000", "sats", 2)).toEqual(sats(20_000n));
    expect(readEntryText("20'000", "sats", 2)).toEqual(sats(20_000n));
    expect(readEntryText("", "sats", 2)).toEqual(EMPTY_ENTRY);
    expect(readEntryText("  ", "sats", 2)).toEqual(EMPTY_ENTRY);
  });

  it("refuses what is not whole sats, or beyond the keypad's eight digits", () => {
    for (const text of ["12.5", "12,5", "-3", "1e3", "abc", "0x10"]) {
      expect(readEntryText(text, "sats", 2)).toBeNull();
    }
    expect(readEntryText(MAX_ENTRY_SATS.toString(), "sats", 2)).toEqual(sats(MAX_ENTRY_SATS));
    expect(readEntryText((MAX_ENTRY_SATS + 1n).toString(), "sats", 2)).toBeNull();
  });

  it("reads the currency with its decimals, either separator, while they are typed", () => {
    expect(readEntryText("17", "fiat", 2)).toEqual(fiat(1700));
    expect(readEntryText("17,", "fiat", 2)).toEqual(fiat(1700));
    expect(readEntryText("17,5", "fiat", 2)).toEqual(fiat(1750));
    expect(readEntryText("17.05", "fiat", 2)).toEqual(fiat(1705));
    expect(readEntryText("1 234,56", "fiat", 2)).toEqual(fiat(123_456));
    expect(readEntryText("", "fiat", 2)).toEqual(fiat(0));
    // More decimals than the currency has, two separators, or beyond the keypad's 99 999.99.
    expect(readEntryText("17,055", "fiat", 2)).toBeNull();
    expect(readEntryText("1.2.3", "fiat", 2)).toBeNull();
    expect(readEntryText("100000", "fiat", 2)).toBeNull();
    // A currency without decimals.
    expect(readEntryText("1500", "fiat", 0)).toEqual(fiat(1500));
    expect(readEntryText("15,5", "fiat", 0)).toBeNull();
  });

  it("writes an entry it did not read from the field in the device locale, empty for nothing", () => {
    // Sats as "Send" writes them: no grouping, which a locale's comma would make a decimal.
    expect(entryText(sats(48_210n), 2, "fr-CH")).toBe("48210");
    expect(entryText(sats(48_210n), 2, "en-US")).toBe("48210");
    expect(entryText(sats(0n), 2, "fr-CH")).toBe("");
    expect(entryText(fiat(1700), 2, "fr-CH")).toBe("17,00");
    expect(entryText(fiat(1700), 2, "en-US")).toBe("17.00");
    expect(entryText(fiat(0), 2, "fr-CH")).toBe("");
    // Read back as the same entry: the field can be typed on from there.
    for (const entry of [sats(48_210n), fiat(1700), fiat(123_456)]) {
      for (const locale of ["fr-CH", "en-US", "de-CH"]) {
        expect(readEntryText(entryText(entry, 2, locale), entry.unit, 2)).toEqual(entry);
      }
    }
  });

  it("switches units at the instant's rate: the currency to the next whole sat, sats to the nearest cent", () => {
    // 20 CHF at 85 000 CHF a bitcoin: 23 529.41… sats, the next whole sat.
    const switched = switchedEntry(fiat(2000), 2, 85_000);
    expect(switched).toEqual(sats(23_530n));
    expect(entrySats(switched, 2, 85_000)).toBe(23_530n);
    // 12 000 sats at 100 000 CHF: 12.00 CHF.
    expect(switchedEntry(sats(12_000n), 2, 100_000)).toEqual(fiat(1200));
    // Nothing typed, nothing carried.
    expect(switchedEntry(sats(0n), 2, 100_000)).toEqual(fiat(0));
    expect(switchedEntry(fiat(0), 2, 100_000)).toEqual(sats(0n));
  });

  it("carries nothing without a rate, nor beyond the keypad's limits", () => {
    // A rate gone (an outage): back to sats, empty; never a former rate.
    expect(switchedEntry(fiat(2000), 2, undefined)).toEqual(sats(0n));
    expect(switchedEntry(sats(12_000n), 2, undefined)).toEqual(fiat(0));
    // 99 999 999 sats at 2 000 000 CHF a bitcoin: 1 999 999.98 CHF, past 99 999.99.
    expect(switchedEntry(sats(MAX_ENTRY_SATS), 2, 2_000_000)).toEqual(fiat(0));
    // 99 999.99 CHF at 1 000 CHF a bitcoin: more than 99 999 999 sats.
    expect(switchedEntry(fiat(9_999_999), 2, 1_000)).toEqual(sats(0n));
  });

  it("tells the same amount in the same unit", () => {
    expect(sameEntry(sats(1n), sats(1n))).toBe(true);
    expect(sameEntry(sats(1n), sats(2n))).toBe(false);
    expect(sameEntry(fiat(100), fiat(100))).toBe(true);
    expect(sameEntry(sats(0n), fiat(0))).toBe(false);
  });
});
