import i18n from "@/i18n";

import { legacyHistoryItems } from "@/features/activity/legacy-history";
import type { ActivityItem } from "@/features/activity/model";
import {
  DEFAULT_COLUMNS,
  EXPORT_COLUMNS,
  exportCsv,
  type ExportColumn
} from "@/features/wallet/export/csv";
import { btcText, plainMinor, rowLabel, rowRemark } from "@/features/wallet/export/describe";
import { SALE_SPAN_SECONDS, exportWindow, loadExportRows } from "@/features/wallet/export/load";
import { glyphSize } from "@/features/wallet/export/PeriodChoice";
import {
  EXPORT_FIRST_DAY,
  PRESET_PERIODS,
  periodDays,
  periodGlyph,
  timeRange
} from "@/features/wallet/export/period";
import { fontFace } from "@/features/wallet/export/report-font-face";
import { reportFontFaces } from "@/features/wallet/export/report-fonts";
import type * as WebReportFonts from "@/features/wallet/export/report-fonts.web";
import { reportHtml } from "@/features/wallet/export/report-html";
import {
  exportRows,
  rowRate,
  rowValue,
  type ExportRow,
  type RowValue
} from "@/features/wallet/export/rows";
import { exportFileName, valuesOf } from "@/features/wallet/export/run";
import { PAYMENTS_PAGE_SIZE, readWalletPayments } from "@/features/wallet/payments-history";
import type { Roster } from "@/features/team/roster";
import type { WalletPayment } from "@/lib/breez/types";
import { listWalletPaymentsPage } from "@/lib/breez/wallet";
import { legacyRowRef } from "@/lib/legacy-v2/history";
import type { PaymentRate } from "@/lib/rates/payment-rates";
import { pointHourOf } from "@/lib/rates/sources";
import { fontAssets } from "@/theme/fonts";

import type * as FileSystemFake from "../../jest/expo-file-system";

jest.mock("../lib/breez/wallet", () => ({
  ...jest.requireActual("../lib/breez/wallet"),
  listWalletPaymentsPage: jest.fn()
}));

// The app's font files as expo-asset hands them over: a file of the cache per module (the fake
// file system), none for a module whose file cannot be read.
const mockFontFiles = new Map<unknown, string | null>();
jest.mock("expo-asset", () => ({
  Asset: {
    fromModule: (module: unknown) => ({
      downloadAsync: async () => {
        const localUri = mockFontFiles.get(module);
        if (localUri === undefined) throw new Error("No such asset");
        return { localUri };
      }
    })
  }
}));

const fileSystem = jest.requireMock<typeof FileSystemFake>("expo-file-system");
const listPage = jest.mocked(listWalletPaymentsPage);
const t = i18n.t.bind(i18n);

/** 24.10.2026 at 14:32 (UTC, the tests' time zone). */
const NOW = Date.UTC(2026, 9, 24, 14, 32) / 1000;

function payment(overrides: Partial<WalletPayment> = {}): WalletPayment {
  return {
    id: "p",
    direction: "receive",
    status: "completed",
    amountSats: 1000n,
    feeSats: 0n,
    timestamp: NOW - 3600,
    network: "lightning",
    paymentHash: "aa".repeat(32),
    ...overrides
  };
}

/** The rate recorded at `paid` (src/lib/rates/payment-rates.ts), in francs. */
function rateOf(paid: WalletPayment, rate: number): PaymentRate {
  return {
    payment: paid.id,
    at: paid.timestamp,
    currency: "CHF",
    hour: pointHourOf(paid.timestamp),
    rate
  };
}

function item(overrides: Partial<ActivityItem> = {}): ActivityItem {
  const timestamp = overrides.timestamp ?? NOW - 3600;
  return {
    id: "sale:1",
    source: "pos",
    timestamp,
    note: "Table 12",
    fiat: { minor: 1746, digits: 2, currency: "CHF" },
    sats: 17_460n,
    state: null,
    rest: null,
    by: { kind: "you" },
    payments: [payment({ timestamp, amountSats: overrides.sats ?? 17_460n })],
    link: null,
    ...overrides
  };
}

function row(overrides: Partial<ActivityItem> = {}): ExportRow {
  const [first] = exportRows([item(overrides)], { start: 0, end: NOW });
  if (!first) throw new Error("Not a line");
  return first;
}

beforeEach(async () => {
  await i18n.changeLanguage("en");
  listPage.mockReset();
});

describe("the period", () => {
  // Friday 24 October 2026.
  const today = new Date(2026, 9, 24, 14, 32);
  const custom = { first: "2026-10-03", last: "2026-10-09" };

  it("gives v2's presets, never past today", () => {
    expect(periodDays("thisMonth", today, custom)).toEqual({
      first: "2026-10-01",
      last: "2026-10-24"
    });
    expect(periodDays("lastMonth", today, custom)).toEqual({
      first: "2026-09-01",
      last: "2026-09-30"
    });
    expect(periodDays("thisYear", today, custom)).toEqual({
      first: "2026-01-01",
      last: "2026-10-24"
    });
    expect(periodDays("lastYear", today, custom)).toEqual({
      first: "2025-01-01",
      last: "2025-12-31"
    });
  });

  it("takes last month across a year, and its last day whatever its length", () => {
    expect(periodDays("lastMonth", new Date(2027, 0, 5), custom)).toEqual({
      first: "2026-12-01",
      last: "2026-12-31"
    });
    expect(periodDays("lastMonth", new Date(2028, 2, 31), custom)).toEqual({
      first: "2028-02-01",
      last: "2028-02-29"
    });
  });

  it("takes two days chosen only when they make a period", () => {
    expect(periodDays("custom", today, custom)).toEqual(custom);
    expect(periodDays("custom", today, { first: "2026-10-24", last: "2026-10-24" })).toEqual({
      first: "2026-10-24",
      last: "2026-10-24"
    });
    // The first after the last, the last after today, before Bitcoin's first block, not a day.
    expect(periodDays("custom", today, { first: "2026-10-10", last: "2026-10-09" })).toBeNull();
    expect(periodDays("custom", today, { first: "2026-10-01", last: "2026-10-25" })).toBeNull();
    expect(periodDays("custom", today, { first: "2009-01-02", last: "2026-01-02" })).toBeNull();
    expect(EXPORT_FIRST_DAY).toBe("2009-01-03");
    // A v2 account's history copied (src/features/migration/history-import.ts): years before v3.
    expect(periodDays("custom", today, { first: "2023-01-01", last: "2024-12-31" })).toEqual({
      first: "2023-01-01",
      last: "2024-12-31"
    });
    expect(periodDays("custom", today, { first: EXPORT_FIRST_DAY, last: "2026-01-02" })).toEqual({
      first: EXPORT_FIRST_DAY,
      last: "2026-01-02"
    });
    expect(periodDays("custom", today, { first: "2026-02-30", last: "2026-03-02" })).toBeNull();
    expect(periodDays("custom", today, { first: "2026-1-1", last: "2026-03-02" })).toBeNull();
  });

  it("writes on each preset's page its month's short name or its year, in the device's locale", () => {
    const glyphs = (languageTag: string) =>
      PRESET_PERIODS.map((period) =>
        periodGlyph(period, periodDays(period, today, custom), languageTag)
      );
    expect(glyphs("en-CH")).toEqual(["OCT", "SEPT", "2026", "2025"]);
    expect(glyphs("de-CH")).toEqual(["OKT", "SEP", "2026", "2025"]);
    // A tag the engine refuses: the default locale's, never a throw (the sheet renders it).
    expect(() => glyphs("en-US@posix")).not.toThrow();
  });

  it("fits the longest month names of the app's languages on their page", () => {
    // Up to 4 characters, and a year: their own size.
    expect(glyphSize("OCT.", false)).toBe(10.5);
    expect(glyphSize("2026", true)).toBe(11.5);
    // Finnish "TOUKO" and "MARRAS" (39 and 45.7 pt at 10.5): down to the page's 37 pt.
    expect(glyphSize("TOUKO", false) * (39 / 10.5)).toBeLessThanOrEqual(37);
    expect(glyphSize("MARRAS", false) * (45.7 / 10.5)).toBeLessThanOrEqual(37);
    expect(glyphSize("", false)).toBe(10.5);
    // A year the device's locale writes longer ("2026年"): smaller too, never cut.
    expect(glyphSize("2026年", true)).toBeLessThan(11.5);
  });

  it("covers its days from the first midnight to the last second of the last day", () => {
    expect(timeRange({ first: "2026-10-01", last: "2026-10-31" })).toEqual({
      start: Date.UTC(2026, 9, 1) / 1000,
      end: Date.UTC(2026, 10, 1) / 1000 - 1
    });
  });
});

describe("the lines", () => {
  const range = { start: NOW - 86_400, end: NOW };

  it("keeps the rows done of the period, the oldest first, sent ones negative with their fees", () => {
    const sent = item({
      id: "payment:s",
      source: "send",
      timestamp: NOW - 600,
      note: "",
      fiat: null,
      sats: 150_000n,
      by: null,
      payments: [
        payment({
          id: "s",
          direction: "send",
          amountSats: 150_000n,
          feeSats: 12n,
          timestamp: NOW - 600
        })
      ]
    });
    const received = item({
      id: "payment:r",
      source: "receive",
      timestamp: NOW - 1200,
      fiat: null,
      sats: 5000n
    });
    const paid = item({ id: "sale:a", timestamp: NOW - 1800 });
    const rows = exportRows(
      [
        sent,
        received,
        paid,
        item({ id: "link:open", source: "link", state: "open", sats: null, payments: [] }),
        item({ id: "sale:under", state: "underpaid" }),
        item({ id: "payment:f", source: "send", state: "failed" }),
        item({ id: "invoice:d", source: "link", state: "draft", sats: null, payments: [] }),
        // Out of the period, on both sides.
        item({ id: "sale:old", timestamp: range.start - 1 }),
        item({ id: "sale:new", timestamp: range.end + 1 })
      ],
      range
    );
    expect(rows.map((line) => [line.item.id, line.kind, line.sats, line.feeSats])).toEqual([
      ["sale:a", "paid", 17_460n, null],
      ["payment:r", "received", 5000n, null],
      ["payment:s", "sent", -150_000n, 12n]
    ]);
    // Its bounds are in it.
    expect(exportRows([item({ timestamp: range.start })], range)).toHaveLength(1);
    expect(exportRows([item({ timestamp: range.end })], range)).toHaveLength(1);
  });

  it('leaves out "Funds recovered": the merchant\'s own funds, whose sales are lines already', () => {
    const recovered = item({
      id: "payment:r",
      source: "recovered",
      note: "",
      fiat: null,
      sats: 49_000n,
      by: null
    });
    expect(
      exportRows([recovered, item()], { start: 0, end: NOW }).map(({ item: i }) => i.id)
    ).toEqual(["sale:1"]);
  });

  it("leaves out a paid link whose payments were not read: another period's line", () => {
    expect(exportRows([item({ id: "link:x", source: "link", payments: [] })], range)).toEqual([]);
  });

  it("makes no statement while a sale seen paid on-chain is not in the wallet yet", () => {
    expect(() =>
      exportRows([item({ sats: null, payments: [], pendingCredit: "other" })], range)
    ).toThrow(expect.objectContaining({ failure: "receiving" }));
  });

  it("adds up a sending's fees of its completed payments only", () => {
    const line = row({
      source: "send",
      fiat: null,
      sats: 100n,
      payments: [
        payment({ id: "a", direction: "send", feeSats: 3n }),
        payment({ id: "b", direction: "send", feeSats: 5n }),
        payment({ id: "c", direction: "send", feeSats: 7n, status: "failed" })
      ]
    });
    expect(line.feeSats).toBe(8n);
  });
});

describe("the values", () => {
  it("takes a sale's own amount, its payment's rate beside it", () => {
    const line = row();
    expect(rowValue(line, new Map())).toEqual({
      minor: 1746n,
      currency: "CHF",
      digits: 2,
      feeMinor: null,
      own: true,
      rate: null
    });
    const recorded = rateOf(line.item.payments[0]!, 69_400);
    expect(rowValue(line, new Map([["p", recorded]]))).toMatchObject({
      minor: 1746n,
      rate: recorded
    });
  });

  it("values sats at the rate recorded at their payment, rounded to the nearest cent", () => {
    // 12,345 sats at 69,400 CHF: 8.567... CHF.
    const line = row({ source: "receive", fiat: null, sats: 12_345n });
    const recorded = rateOf(line.item.payments[0]!, 69_400);
    expect(rowValue(line, new Map([["p", recorded]]))).toEqual({
      minor: 857n,
      currency: "CHF",
      digits: 2,
      feeMinor: null,
      own: false,
      rate: recorded
    });
    // Another payment's rate is not its own: bitcoin only.
    expect(rowValue(line, new Map([["other", { ...recorded, payment: "other" }]]))).toBeNull();
    // In the currency recorded, with its decimals.
    const yen = { ...recorded, currency: "JPY", rate: 10_000_000 };
    expect(rowValue(line, new Map([["p", yen]]))).toMatchObject({
      minor: 1235n,
      currency: "JPY",
      digits: 0
    });
  });

  it("keeps a sale typed in another currency in it", () => {
    const line = row({ fiat: { minor: 2000, digits: 2, currency: "EUR" }, sats: 30_000n });
    const recorded = rateOf(line.item.payments[0]!, 100_000);
    expect(rowValue(line, new Map([["p", recorded]]))).toMatchObject({
      minor: 2000n,
      currency: "EUR",
      own: true,
      rate: recorded
    });
  });

  it("signs a sending negative, its fees at the same rate", () => {
    const line = row({
      source: "send",
      fiat: null,
      sats: 150_000n,
      payments: [payment({ direction: "send", amountSats: 150_000n, feeSats: 1840n })]
    });
    const rates = new Map([["p", rateOf(line.item.payments[0]!, 100_000)]]);
    expect(rowValue(line, rates)).toMatchObject({ minor: -15_000n, feeMinor: 184n });
    const free = row({
      source: "send",
      fiat: null,
      sats: 10n,
      payments: [payment({ direction: "send", amountSats: 10n, feeSats: 0n })]
    });
    expect(rowValue(free, rates)?.feeMinor).toBe(0n);
  });

  it("takes the rate of the line's latest payment done", () => {
    const first = payment({ id: "a", timestamp: NOW - 7200 });
    const latest = payment({ id: "b", timestamp: NOW - 3600 });
    const failed = payment({ id: "c", timestamp: NOW - 60, status: "failed" });
    const line = row({ source: "link", fiat: null, payments: [failed, latest, first] });
    const rates = new Map(
      [first, latest, failed].map((each) => [each.id, rateOf(each, 100_000)] as const)
    );
    expect(rowRate(line, rates)?.payment).toBe("b");
  });

  it("asks no relay when no line was paid", async () => {
    await expect(valuesOf([])).resolves.toEqual([]);
  });
});

describe("the amounts written", () => {
  it("writes minor units and sats exactly, never through a float", () => {
    expect(plainMinor(123_456n, 2, ",")).toBe("1234,56");
    expect(plainMinor(-5n, 2, ".")).toBe("-0.05");
    expect(plainMinor(1200n, 0, ",")).toBe("1200");
    // Beyond a float's exact range: every digit kept.
    expect(plainMinor(2_100_000_000_000_001n, 8, ".")).toBe("21000000.00000001");
    expect(btcText(150_000n, "fr-CH", true)).toBe("+0,00150000 BTC");
    expect(btcText(-123_456_789n, "en-US", true)).toBe("−1.23456789 BTC");
    expect(btcText(0n, "en-US", true)).toBe("0.00000000 BTC");
  });

  it("names a line by its invoice, its note, or what the wallet tells of a transfer", () => {
    expect(
      rowLabel(
        row({
          source: "link",
          invoice: {
            id: "i",
            number: "2026-0042",
            recipient: "Smith Ltd",
            status: "sent",
            dueDate: null
          }
        }),
        t
      )
    ).toBe("2026-0042 · Smith Ltd");
    expect(rowLabel(row(), t)).toBe("Table 12");
    expect(rowLabel(row({ note: "" }), t)).toBe("");
    const transfer = (overrides: Partial<WalletPayment>) =>
      row({ source: "receive", note: "", fiat: null, payments: [payment(overrides)] });
    expect(rowLabel(transfer({ lightningAddress: "bakehouse@wallet.example" }), t)).toBe(
      "bakehouse@wallet.example"
    );
    expect(rowLabel(transfer({ network: "bitcoin", paymentHash: undefined }), t)).toBe("Deposit");
    expect(rowLabel(transfer({}), t)).toBe("");
  });

  it("names the file after the business and the period, in characters files take", () => {
    const days = { first: "2026-10-01", last: "2026-10-31" };
    expect(exportFileName("Fine Bakery", days, "csv")).toBe(
      "Fine-Bakery_2026-10-01_2026-10-31.csv"
    );
    expect(exportFileName("Müller “Zürich” / Kraków", days, "pdf")).toBe(
      "Müller-Zürich-Kraków_2026-10-01_2026-10-31.pdf"
    );
    expect(exportFileName("../..", days, "pdf")).toBe("export_2026-10-01_2026-10-31.pdf");
  });
});

describe("the CSV", () => {
  const sale = row({ note: '=HYPERLINK("https://evil")', timestamp: NOW - 3600 });
  const sent = row({
    id: "payment:s",
    source: "send",
    note: "",
    fiat: null,
    sats: 150_000n,
    by: null,
    timestamp: NOW - 60,
    payments: [
      payment({
        id: "s",
        direction: "send",
        amountSats: 150_000n,
        feeSats: 12n,
        network: "bitcoin",
        paymentHash: undefined,
        txId: "8e2d6b3a"
      })
    ]
  });
  const chf = (minor: bigint, at: ExportRow, feeMinor: bigint | null): RowValue => ({
    minor,
    currency: "CHF",
    digits: 2,
    feeMinor,
    own: feeMinor === null,
    rate: rateOf(at.item.payments[0]!, 69_400.123)
  });
  const values: RowValue[] = [chf(1746n, sale, null), chf(-10_410n, sent, 1n)];

  it("writes v2's columns in its order, in the device's locale, each formula made inert", () => {
    const csv = exportCsv([sale, sent], values, {
      columns: [...EXPORT_COLUMNS].reverse(),
      currency: "CHF",
      digits: 2,
      languageTag: "fr-CH",
      t
    });
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv.endsWith("\r\n")).toBe(true);
    const lines = csv.slice(1).split("\r\n");
    expect(lines).toHaveLength(4);
    expect(lines[0]).toBe(
      "Date and time;Description;Source;By;Payment type;Reference;Amount in BTC;Fees in BTC;" +
        "Amount in CHF;Fees in CHF;Amount entered;Currency entered;Bitcoin price in CHF;Remark"
    );
    // A note that starts as a formula stays text, quoted for its quote marks.
    expect(lines[1]).toBe(
      `24.10.2026 13:32;"'=HYPERLINK(""https://evil"")";Point of sale;You;Lightning;${"aa".repeat(32)};` +
        "0,00017460;;17,46;;17,46;CHF;69400,12;"
    );
    // Negative amounts stay numbers: never made inert.
    expect(lines[2]).toBe(
      "24.10.2026 14:31;Withdrawal;Sent;;Bitcoin;8e2d6b3a;-0,00150000;0,00000012;-104,10;0,01;;;69400,12;"
    );
    expect(lines[3]).toBe("");
  });

  it("separates by commas where the decimal separator is a point, quoting what holds one", () => {
    const csv = exportCsv([sale], [values[0]!], {
      columns: ["dateAndTime", "bitcoinAmount", "fiatAmount"],
      currency: "CHF",
      digits: 2,
      languageTag: "de-CH",
      t
    });
    expect(csv.slice(1).split("\r\n")[1]).toBe('"24.10.2026, 13:32",0.00017460,17.46');
  });

  it("leaves a value not known empty, never 0", () => {
    const csv = exportCsv([sale], [null], {
      columns: ["bitcoinAmount", "fiatAmount", "bitcoinPrice"],
      currency: "CHF",
      digits: 2,
      languageTag: "fr-CH",
      t
    });
    expect(csv.slice(1).split("\r\n")[1]).toBe("0,00017460;;");
  });

  it("tells a value in another currency in its own columns only", () => {
    const columns = [
      "fiatAmount",
      "fiatFees",
      "originalAmount",
      "originalCurrency",
      "bitcoinPrice"
    ];
    const options = {
      columns: columns as ExportColumn[],
      currency: "CHF",
      digits: 2,
      languageTag: "fr-CH",
      t
    };
    // A sale typed in euros: its amount where it was typed, the price of its payment in francs.
    const euros = row({ fiat: { minor: 2000, digits: 2, currency: "EUR" } });
    const typed = rowValue(euros, new Map([["p", rateOf(euros.item.payments[0]!, 69_400)]]));
    expect(exportCsv([euros], [typed], options).slice(1).split("\r\n")[1]).toBe(
      ";;20,00;EUR;69400,00"
    );
    // A transfer whose rate was recorded in euros (the account's currency then): nothing in francs.
    const transfer = row({ source: "receive", fiat: null, sats: 10_000n });
    const inEuros = { ...rateOf(transfer.item.payments[0]!, 60_000), currency: "EUR" };
    const value = rowValue(transfer, new Map([["p", inEuros]]));
    expect(value).toMatchObject({ minor: 600n, currency: "EUR" });
    expect(exportCsv([transfer], [value], options).slice(1).split("\r\n")[1]).toBe(";;;;");
  });

  it("ticks v2's own columns by default", () => {
    const csv = exportCsv([], null, {
      columns: DEFAULT_COLUMNS,
      currency: "EUR",
      digits: 2,
      languageTag: "fr-CH",
      t
    });
    expect(csv).toBe(
      "﻿Date and time;Description;Source;Reference;Amount in BTC;Amount in EUR;Remark\r\n"
    );
  });
});

describe('the remark ("Remark")', () => {
  /**
   * An "Underpaid" sale the owner accepted: 30,000 of its 49,000 sats, its line at what it
   * received, 3.06 of its 5.00 CHF (applyAcceptances).
   */
  const ACCEPTED_AT = NOW - 1800;
  const accepted = row({
    fiat: { minor: 306, digits: 2, currency: "CHF" },
    sats: 30_000n,
    acceptance: {
      status: "accepted",
      received: 30_000n,
      due: 49_000n,
      at: ACCEPTED_AT,
      fiat: { minor: 500, digits: 2, currency: "CHF" }
    }
  });
  const TEXT =
    "Difference of 1,94 CHF / 0,00019000 BTC, accepted by the owner on 24.10.2026 at 14:02";

  it("tells the difference accepted, in the sale's currency and in BTC, when and by whom", () => {
    expect(rowRemark(accepted, t, "fr-CH")).toBe(TEXT);
    // A sale in sats alone: in BTC only.
    const inSats = row({
      fiat: null,
      sats: 30_000n,
      acceptance: {
        status: "accepted",
        received: 30_000n,
        due: 49_000n,
        at: ACCEPTED_AT,
        fiat: null
      }
    });
    expect(rowRemark(inSats, t, "fr-CH")).toBe(
      "Difference of 0,00019000 BTC, accepted by the owner on 24.10.2026 at 14:02"
    );
    // More received since it was accepted: the difference that is left.
    const more = row({ ...accepted.item, sats: 40_000n });
    expect(rowRemark(more, t, "fr-CH")).toBe(
      "Difference of 0,92 CHF / 0,00009000 BTC, accepted by the owner on 24.10.2026 at 14:02"
    );
    // Nothing to say of any other line.
    expect(rowRemark(row(), t, "fr-CH")).toBe("");
  });

  it("writes it in its column, the line at what was received", () => {
    const value = rowValue(accepted, new Map());
    expect(value).toMatchObject({ minor: 306n, currency: "CHF", own: true });
    const csv = exportCsv([accepted], [value], {
      columns: ["fiatAmount", "remark"],
      currency: "CHF",
      digits: 2,
      languageTag: "fr-CH",
      t
    });
    expect(csv.slice(1).split("\r\n")).toEqual(["Amount in CHF;Remark", `3,06;${TEXT}`, ""]);
  });

  it("gives the statement a column of remarks only when a line has one", () => {
    const options = {
      businessName: "Fine Bakery",
      days: { first: "2026-10-01", last: "2026-10-24" },
      currency: "CHF",
      digits: 2,
      language: "en",
      languageTag: "fr-CH",
      t,
      madeAt: new Date(NOW * 1000),
      unit: "fiat" as const
    };
    const plain = row({ id: "sale:2" });
    const without = reportHtml([plain], [rowValue(plain, new Map())], options);
    expect(without).not.toContain("Remark");
    const html = reportHtml(
      [plain, accepted],
      [rowValue(plain, new Map()), rowValue(accepted, new Map())],
      options
    );
    expect(html).toContain("<th>Remark</th>");
    expect(html).toContain(`<td class="remark">${TEXT}</td>`);
    // The line without one keeps its cell, empty.
    expect(html).toContain('<td class="remark"></td>');
  });
});

describe("the PDF statement", () => {
  const options = {
    businessName: "Fine <Bakery>",
    days: { first: "2026-10-01", last: "2026-10-24" },
    currency: "CHF",
    digits: 2,
    language: "en",
    languageTag: "en-CH",
    t,
    madeAt: new Date(NOW * 1000)
  };
  const sale = row({ id: "sale:a", note: "<b>Table</b>", timestamp: NOW - 7200 });
  const received = row({
    id: "payment:r",
    source: "receive",
    fiat: null,
    sats: 5000n,
    timestamp: NOW - 3600
  });
  const sent = row({
    id: "payment:s",
    source: "send",
    fiat: null,
    sats: 150_000n,
    by: null,
    timestamp: NOW - 60,
    payments: [payment({ id: "s", direction: "send", amountSats: 150_000n, feeSats: 12n })]
  });
  const rows = [sale, received, sent];
  const rates = new Map(
    rows.map((line) => {
      const [paid] = line.item.payments;
      return [paid!.id, rateOf(paid!, 100_000)] as const;
    })
  );
  const values = rows.map((line) => rowValue(line, rates));
  const cell = (html: string, label: string) =>
    new RegExp(`<td>${label}</td><td class="num">([^<]*)</td>`).exec(html)?.[1];

  it("adds up the lines it lists, by source, in the currency", () => {
    const html = reportHtml(rows, values, { ...options, unit: "fiat" });
    expect(cell(html, "Number of transactions")).toBe("3");
    expect(cell(html, "of which point of sale")).toBe("1");
    expect(cell(html, "of which received")).toBe("1");
    expect(cell(html, "of which sent")).toBe("1");
    // No line of a source without any.
    expect(html).not.toContain("of which invoices");
    expect(html).not.toContain("of which integrations");
    expect(cell(html, "Total received")).toBe("+22.46 CHF");
    expect(cell(html, "Total sent")).toBe("−150.00 CHF");
    expect(cell(html, "Sending fees")).toBe("−0.01 CHF");
    expect(html).toContain("From 1 October 2026 to 24 October 2026");
    expect(html).toContain("Issued on 24 October 2026");
    expect(html).toContain("at the price recorded when it was paid (source: CoinGecko)");
    // v2's layout: the sattle.me logo at its head and foot, no company named as its issuer, the
    // period on its band; the system's font without the brand's (reportFontFaces).
    expect(html.match(/<svg class="logo"[^>]*aria-label="sattle\.me"/g)).toHaveLength(2);
    expect(html).toContain('<div class="band">From 1 October 2026 to 24 October 2026</div>');
    expect(html).toContain("<h1>Transactions report</h1>");
    // The amounts' header on their right edge, as the amounts.
    expect(html).toContain('<th class="num">Amount (CHF)</th>');
    expect(html).toContain(".list th.num { text-align: right; }");
    expect(html).not.toMatch(/Swiss Bitcoin Pay|ARIF|FINMA|@font-face/);
    // Everything typed escaped.
    expect(html).toContain("Fine &lt;Bakery&gt;");
    expect(html).toContain("&lt;b&gt;Table&lt;/b&gt;");
    expect(html).not.toContain("<b>Table");
  });

  it("draws it in Plus Jakarta Sans when its weights are given", () => {
    const fontFaces = fontFace(500, "data:font/ttf;base64,AAAA");
    const html = reportHtml(rows, values, { ...options, unit: "fiat", fontFaces });
    expect(html).toContain(
      '@font-face{font-family:"Plus Jakarta Sans";font-weight:500;font-style:normal;src:url("data:font/ttf;base64,AAAA") format("truetype")}'
    );
    expect(html).toContain('font-family: "Plus Jakarta Sans"');
  });

  it("embeds the brand's weights from the app's own files, or draws without them", async () => {
    const { Directory, File, Paths } = fileSystem;
    const names = ["PlusJakartaSans-Medium", "PlusJakartaSans-Bold", "PlusJakartaSans-ExtraBold"];
    // Under Jest every font file is the same module: one file stands for each.
    for (const name of names) mockFontFiles.set(fontAssets[name as keyof typeof fontAssets], null);
    // A file that does not read: no font rather than no statement.
    expect(await reportFontFaces()).toBe("");

    new Directory(Paths.cache, "fonts").create({ intermediates: true, idempotent: true });
    const file = new File(Paths.cache, "fonts", "PlusJakartaSans.ttf");
    file.writeSync(new Uint8Array([1, 2, 3]));
    for (const name of names) {
      mockFontFiles.set(fontAssets[name as keyof typeof fontAssets], file.uri);
    }
    expect((await reportFontFaces()).split("\n")).toEqual([
      fontFace(500, "data:font/ttf;base64,AQID"),
      fontFace(700, "data:font/ttf;base64,AQID"),
      fontFace(800, "data:font/ttf;base64,AQID")
    ]);
  });

  it("writes it in bitcoin, exact, without any rate", () => {
    const html = reportHtml(rows, null, { ...options, unit: "btc" });
    expect(cell(html, "Total received")).toBe("+0.00022460 BTC");
    expect(cell(html, "Total sent")).toBe("−0.00150000 BTC");
    expect(cell(html, "Sending fees")).toBe("−0.00000012 BTC");
    expect(html).not.toContain("CoinGecko");
  });

  it("gives no total of the fees a payout copied from the v2 account does not tell", () => {
    const [payout] = exportRows(
      legacyHistoryItems([
        {
          ref: legacyRowRef("id-1"),
          kind: "withdraw",
          channel: null,
          at: NOW - 30,
          sats: 40_000n,
          fiat: null,
          note: "",
          rate: { price: 60_000, currency: "CHF" }
        }
      ]),
      { start: NOW - 86_400, end: NOW + 60 }
    );
    const lines = [...rows, payout!];
    const html = reportHtml(lines, [...values, rowValue(payout!, rates)], {
      ...options,
      unit: "fiat"
    });
    // 150.00 CHF sent with its fees, 24.00 CHF of the payout without: no total of the fees.
    expect(cell(html, "Total sent")).toBe("−174.00 CHF");
    expect(cell(html, "Sending fees")).toBeUndefined();
    // Its value at the price the former service recorded, said without naming it.
    expect(html).toContain("the rate it had recorded");
    expect(html).not.toMatch(/Swiss Bitcoin Pay/);
    // Without it: the total of the fees, and the usual note.
    const own = reportHtml(rows, values, { ...options, unit: "fiat" });
    expect(cell(own, "Sending fees")).toBe("−0.01 CHF");
    expect(own).not.toContain("it had recorded");
  });

  it("adds up each currency apart, a line without a rate in bitcoin", () => {
    const euros = row({
      id: "sale:e",
      fiat: { minor: 2000, digits: 2, currency: "EUR" },
      sats: 30_000n,
      timestamp: NOW - 5400
    });
    const lines = [sale, euros, received, sent];
    // The reception's rate was never recorded (a payment over a year old when first seen).
    const html = reportHtml(lines, [values[0]!, rowValue(euros, rates), null, values[2]!], {
      ...options,
      unit: "fiat"
    });
    const summary = html.slice(html.indexOf('<table class="summary">'), html.indexOf("</table>"));
    expect(summary).toContain(
      [
        '<tr class="lead"><td>Total received</td><td class="num">+17.46 CHF</td></tr>',
        '<tr class="lead"><td></td><td class="num">+20.00 EUR</td></tr>',
        '<tr class="lead"><td></td><td class="num">+0.00005000 BTC</td></tr>'
      ].join("\n")
    );
    expect(cell(html, "Total sent")).toBe("−150.00 CHF");
    // Each amount says its currency: the header does not.
    expect(html).toContain('<th class="num">Amount</th>');
    expect(html).toContain('<td class="num">+20.00 EUR</td>');
    expect(html).toContain('<td class="num">+0.00005000 BTC</td>');
  });

  it("says when the period has no transaction, and adds up nothing sent", () => {
    const html = reportHtml([], [], { ...options, unit: "fiat" });
    expect(cell(html, "Number of transactions")).toBe("0");
    expect(cell(html, "Total received")).toBe("0.00 CHF");
    expect(html).not.toContain("Total sent");
    expect(html).toContain("No completed transaction in this period.");
  });
});

describe("the statement's font on the web", () => {
  // The frame's document is not at the page's address (srcdoc): the font files by their whole URL.
  const saved = Object.getOwnPropertyDescriptor(globalThis, "document");
  beforeEach(() => {
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: { baseURI: "https://app.example/wallet" }
    });
  });
  afterEach(() => {
    if (saved) Object.defineProperty(globalThis, "document", saved);
    else delete (globalThis as { document?: unknown }).document;
  });

  /** report-fonts.web.ts's rules, the web app's font files as Metro exports them (`sources`). */
  async function webFaces(sources: Record<string, unknown>): Promise<string> {
    let faces = "";
    try {
      await jest.isolateModulesAsync(async () => {
        jest.doMock("../theme/fonts", () => ({ fontAssets: { ...fontAssets, ...sources } }));
        /* eslint-disable-next-line @typescript-eslint/no-require-imports -- loaded after the mock */
        const web = require("../features/wallet/export/report-fonts.web") as typeof WebReportFonts;
        faces = await web.reportFontFaces();
      });
    } finally {
      // The mock outlives the isolated registry: a module this file loads later would get it.
      jest.dontMock("../theme/fonts");
    }
    return faces;
  }

  it("declares each weight at its file's URL, or draws without the files that have none", async () => {
    expect(
      (
        await webFaces({
          "PlusJakartaSans-Medium": "/assets/PlusJakartaSans-Medium.ttf",
          "PlusJakartaSans-Bold": { uri: "/assets/PlusJakartaSans-Bold.ttf" },
          "PlusJakartaSans-ExtraBold": "https://cdn.example/PlusJakartaSans-ExtraBold.ttf"
        })
      ).split("\n")
    ).toEqual([
      fontFace(500, "https://app.example/assets/PlusJakartaSans-Medium.ttf"),
      fontFace(700, "https://app.example/assets/PlusJakartaSans-Bold.ttf"),
      fontFace(800, "https://cdn.example/PlusJakartaSans-ExtraBold.ttf")
    ]);
    // A module id rather than a URL: that weight in the system's font, the statement still made.
    expect(
      (
        await webFaces({
          "PlusJakartaSans-Medium": 7,
          "PlusJakartaSans-Bold": "/assets/PlusJakartaSans-Bold.ttf",
          "PlusJakartaSans-ExtraBold": null
        })
      ).split("\n")
    ).toEqual([fontFace(700, "https://app.example/assets/PlusJakartaSans-Bold.ttf")]);
  });
});

describe("the read", () => {
  it("reads the payments a day around the period, and each link's whole sale it may hold", () => {
    const range = { start: 1_000_000, end: 2_000_000 };
    expect(exportWindow(range, [], 9_000_000)).toEqual({
      start: range.start - SALE_SPAN_SECONDS,
      end: range.end + SALE_SPAN_SECONDS
    });
    // Never past now.
    expect(exportWindow(range, [], range.end + 10)).toEqual({
      start: range.start - SALE_SPAN_SECONDS,
      end: range.end + 10
    });
    const invoice = { createdAt: range.start - 5_000_000, endsAt: range.end + 7_000_000 };
    expect(exportWindow(range, [invoice], 20_000_000)).toEqual({
      start: invoice.createdAt - SALE_SPAN_SECONDS,
      end: range.end + 7_000_000 + SALE_SPAN_SECONDS
    });
    // A link the period cannot hold a payment of leaves it alone.
    const before = { createdAt: 0, endsAt: range.start - SALE_SPAN_SECONDS - 1 };
    const after = { createdAt: range.end + SALE_SPAN_SECONDS + 1, endsAt: 9_000_000 };
    expect(exportWindow(range, [before, after], 9_000_000)).toEqual({
      start: range.start - SALE_SPAN_SECONDS,
      end: range.end + SALE_SPAN_SECONDS
    });
  });

  it("reads every page of the wallet, a payment shifted by a newer one kept once", async () => {
    const all = Array.from({ length: PAYMENTS_PAGE_SIZE + 3 }, (_, index) =>
      payment({ id: `p${index}`, timestamp: NOW - index })
    );
    listPage
      .mockResolvedValueOnce({ payments: all.slice(0, PAYMENTS_PAGE_SIZE), listed: 200 })
      // A payment received meanwhile: the second page starts with the first's last one again.
      .mockResolvedValueOnce({ payments: all.slice(PAYMENTS_PAGE_SIZE - 1), listed: 4 });
    const read = await readWalletPayments(NOW - 86_400);
    expect(listPage.mock.calls).toEqual([
      [{ since: NOW - 86_400, offset: 0, limit: PAYMENTS_PAGE_SIZE }],
      [{ since: NOW - 86_400, offset: PAYMENTS_PAGE_SIZE, limit: PAYMENTS_PAGE_SIZE }]
    ]);
    expect(read.map(({ id }) => id)).toEqual(all.map(({ id }) => id));
  });

  it("makes no statement before the roster was read: sales would be told as receptions", async () => {
    const range = { start: NOW - 86_400, end: NOW };
    const sources = { records: null, orders: [], invoices: [] };
    await expect(loadExportRows(range, sources, NOW)).rejects.toMatchObject({ failure: "unread" });
    await expect(
      loadExportRows(
        range,
        {
          ...sources,
          records: { sales: [], links: [], unread: 0, members: new Map(), roster: null }
        },
        NOW
      )
    ).rejects.toMatchObject({ failure: "unread" });
    expect(listPage).not.toHaveBeenCalled();
  });

  it("makes no statement while a holder's records or the invoices were not read", async () => {
    const range = { start: NOW - 86_400, end: NOW };
    const roster: Roster = { employees: [], integrations: [], assistants: [], removed: [] };
    const records = { sales: [], links: [], unread: 0, members: new Map(), roster };
    // An employee's records no relay gave: its links and who took its sales are not known.
    await expect(
      loadExportRows(range, { records: { ...records, unread: 1 }, orders: [], invoices: [] }, NOW)
    ).rejects.toMatchObject({ failure: "unread" });
    // The invoices not read: their links are not known, never "no invoice".
    await expect(
      loadExportRows(range, { records, orders: [], invoices: null }, NOW)
    ).rejects.toMatchObject({ failure: "unread" });
    expect(listPage).not.toHaveBeenCalled();
  });
});
