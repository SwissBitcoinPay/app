import i18n from "@/i18n";
import type { Language } from "@/i18n/languages";
import type { ActivityItem } from "@/features/activity/model";
import { EXPORT_COLUMNS, exportCsv, type ExportColumn } from "@/features/wallet/export/csv";
import { reportHtml, type ReportUnit } from "@/features/wallet/export/report-html";
import { exportRows, rowValue, type ExportRow, type RowValue } from "@/features/wallet/export/rows";
import { exportFileName } from "@/features/wallet/export/run";
import { exportKeysOf } from "@/features/team/export-grants";
import type { Roster } from "@/features/team/roster";
import {
  exportDecisionAddress,
  exportDecisionEvent,
  exportGrantOf,
  exportKeysParts,
  exportPartEvent,
  grantedKeys,
  type GrantFormat
} from "@/lib/assistant/export-grant";
import { legacyHistoryItem } from "@/features/activity/legacy-history";
import { decodeBolt11 } from "@/lib/lightning/bolt11";
import type { Invoice as LightningInvoice } from "@/lib/lightning/lnurl";
import { declarationEvent, deriveSaleKeys, saleRegistry } from "@/lib/registry/registry";
import { openSaleAcceptance, saleAcceptanceEvent } from "@/lib/registry/sale-acceptance";
import {
  memberRecordsOf,
  saleEvent,
  saleTxEvent,
  type MemberSale,
  type SaleRecordValue
} from "@/lib/team/member-records";
import { makeInvoice, metadataHash, preimagePair } from "../../jest/lightning";
import { taprootAddress } from "../../jest/bitcoin";
import { deriveAssistantKeys } from "@/lib/assistant/keys";
import { encodeWalletSecret } from "@/lib/breez/secret";
import type { LegacyHistoryRow } from "@/lib/legacy-v2/history";
import {
  historyOf,
  historyMonth,
  historyPartAddress,
  historyPartEvent,
  historyParts,
  historyStateEvent
} from "@/lib/legacy-v2/history-records";
import type { WalletPayment } from "@/lib/breez/types";
import type { NostrEvent } from "@/lib/nostr/event";
import { sealRecord } from "@/lib/nostr/record";
import { paymentRateEvent, paymentRatesOf } from "@/lib/rates/payment-rates";
import { walletSendEvent, walletSendOf, walletSendsOf } from "@/lib/wallet-sends/record";
import {
  assistantSecretKey,
  derivePaymentRateKeys,
  deriveLegacyHistoryKeys,
  deriveLinkOwner,
  deriveMemberKeys,
  deriveRegistryKey,
  deriveRegistryReader,
  deriveTeamKeys,
  memberSecret,
  ownerDeviceSecret,
  deriveWalletSendKeys,
  usableTeamKeys
} from "@/lib/team/keys";
import type { PaymentRate } from "@/lib/rates/payment-rates";
import { currencyDigits } from "@/lib/terminal/amount";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

/*
 * The app's half of the export's cross-check: the MCP server (sattleme/mcp-server) writes the
 * transactions' export of an assistant as "Wallet › Export" writes it, and is tested against the
 * app's own output: src/__tests__/fixtures/mcp-server/export.json.
 * Each case gives lines as the server builds them (a line: what a row of "Wallet" holds that
 * the export reads), the options of an export (language, locale, time zone, currency, columns,
 * unit), and what the app's code makes of them: the CSV, the report's HTML (without its fonts,
 * which the server embeds its own way) and the files' names. The app reads its rows, the server its
 * lines: this file checks that the app still writes exactly these files from them. Made again on
 * purpose only: WRITE_EXPORT_VECTORS=1 npx jest src/__tests__/export-vectors.test.ts
 */

// Node's own modules, which the app's typings leave out (jest.requireActual: the files, unmocked).
const fs = jest.requireActual<{
  readFileSync(path: string, encoding: "utf8"): string;
  writeFileSync(path: string, data: string): void;
}>("fs");
const FILE = `${process.cwd()}/src/__tests__/fixtures/mcp-server/export.json`;

/** A payment of a line, as the wallet lists it (WalletPayment), in JSON. */
type VectorPayment = {
  id: string;
  direction: "receive" | "send";
  status: "completed" | "pending" | "failed";
  amountSats: string;
  feeSats: string;
  timestamp: number;
  network: "lightning" | "bitcoin" | "spark" | "unknown";
  paymentHash: string | null;
  txId: string | null;
  lightningAddress: string | null;
  description: string | null;
};

type VectorFiat = { minor: number; digits: number; currency: string };

/** What the export reads of a row (ActivityItem), in JSON. */
type VectorLine = {
  id: string;
  source: "pos" | "link" | "integration" | "receive" | "send";
  /** Unix seconds: when it was paid. */
  at: number;
  note: string;
  invoice: { number: string; recipient: string } | null;
  /** "By": "You" (`you`), a seat's name, or nobody. */
  by: { kind: "you" } | { kind: "seat"; name: string } | null;
  /** The newest first. */
  payments: VectorPayment[];
  /** What moved, in sats (received, or sent without fees): unsigned. */
  sats: string;
  fiat: VectorFiat | null;
  /**
   * The price of bitcoin recorded at its payment (the rate of its latest completed payment, or of a
   * v2 history row): null when none.
   */
  rate: { currency: string; rate: number } | null;
  /** A row of the v2 history (no payment of the wallet). */
  imported: boolean;
  /** The owner's acceptance of a sale paid short. */
  acceptance: { received: string; due: string; at: number; fiat: VectorFiat | null } | null;
};

type VectorOptions = {
  /**
   * The app's language of the texts, as `toLanguage` (src/i18n/languages.ts) reads the device's
   * locale: "de-CH" is German as Switzerland and Liechtenstein write it, which a grant's format
   * tells by "de" and its locale ("de-CH", "de-LI").
   */
  language: Language;
  /** The device's locale (numbers, dates). */
  locale: string;
  /**
   * The device's time zone: UTC in every case, as the app's tests run (jest.config.js). The app
   * formats in the engine's own time zone; an implementation passes this one to its formatter
   * explicitly (Intl's `timeZone`), and checks other time zones by its own tests.
   */
  timeZone: string;
  businessName: string;
  /** The merchant's currency. */
  currency: string;
  columns: readonly ExportColumn[];
  unit: ReportUnit;
  /** The period's days, and its first and last seconds in the time zone. */
  days: { first: string; last: string };
  range: { start: number; end: number };
  /** Unix seconds: when the report is made. */
  madeAt: number;
};

type VectorCase = {
  name: string;
  options: VectorOptions;
  /** Ids of `lines`, in any order: the export orders them. */
  lines: string[];
  csv: string;
  html: string;
  fileNames: { csv: string; pdf: string };
};

const HASH = (n: number) => n.toString(16).padStart(2, "0").repeat(32);
const TXID = (n: number) => (n + 100).toString(16).padStart(4, "0").repeat(16);

function payment(
  id: string,
  fields: Partial<VectorPayment> & Pick<VectorPayment, "direction" | "amountSats" | "timestamp">
): VectorPayment {
  return {
    id,
    status: "completed",
    feeSats: "0",
    network: "lightning",
    paymentHash: null,
    txId: null,
    lightningAddress: null,
    description: null,
    ...fields
  };
}

// 26.10.2026, 09:46 UTC.
const T = 1_793_008_000;

const LINES: VectorLine[] = [
  {
    id: "sale:pos-1",
    source: "pos",
    at: T,
    note: "Table 12",
    invoice: null,
    by: { kind: "you" },
    payments: [
      payment("p-1", {
        direction: "receive",
        amountSats: "18420",
        timestamp: T,
        paymentHash: HASH(1)
      })
    ],
    sats: "18420",
    fiat: { minor: 1746, digits: 2, currency: "CHF" },
    rate: { currency: "CHF", rate: 94_800.12 },
    imported: false,
    acceptance: null
  },
  {
    id: "sale:pos-2",
    source: "pos",
    at: T + 61,
    // A note a spreadsheet would run as a formula: written inert.
    note: '=HYPERLINK("https://evil")',
    invoice: null,
    by: { kind: "seat", name: "Alice" },
    payments: [
      payment("p-2", {
        direction: "receive",
        amountSats: "1234567",
        timestamp: T + 61,
        paymentHash: HASH(2)
      })
    ],
    sats: "1234567",
    fiat: { minor: 117_000, digits: 2, currency: "CHF" },
    rate: { currency: "CHF", rate: 94_800.12 },
    imported: false,
    acceptance: null
  },
  {
    id: "link:invoice-1",
    source: "link",
    at: T + 3_600,
    note: "Consulting",
    invoice: { number: "2026-0042", recipient: "Smith Ltd" },
    by: { kind: "seat", name: "Carol's assistant" },
    payments: [
      payment("p-3b", {
        direction: "receive",
        amountSats: "200000",
        timestamp: T + 3_600,
        paymentHash: HASH(3)
      }),
      payment("p-3a", {
        direction: "receive",
        amountSats: "3600000",
        timestamp: T + 3_000,
        network: "bitcoin",
        txId: TXID(3)
      })
    ],
    sats: "3800000",
    fiat: { minor: 360_000, digits: 2, currency: "CHF" },
    rate: { currency: "CHF", rate: 94_810 },
    imported: false,
    acceptance: null
  },
  {
    id: "sale:integration-1",
    source: "integration",
    at: T + 7_200,
    note: "Order 1042",
    invoice: null,
    by: { kind: "seat", name: "Shop; “online”" },
    payments: [
      payment("p-4", {
        direction: "receive",
        amountSats: "25800",
        timestamp: T + 7_200,
        paymentHash: HASH(4)
      })
    ],
    sats: "25800",
    // Priced in another currency than the merchant's.
    fiat: { minor: 2_450, digits: 2, currency: "EUR" },
    rate: { currency: "CHF", rate: 94_900 },
    imported: false,
    acceptance: null
  },
  {
    id: "sale:accepted-1",
    source: "pos",
    at: T + 9_000,
    note: "",
    invoice: null,
    by: { kind: "you" },
    payments: [
      payment("p-5", {
        direction: "receive",
        amountSats: "48000",
        timestamp: T + 9_000,
        network: "bitcoin",
        txId: TXID(5)
      })
    ],
    sats: "48000",
    // What it received, of the 50,00 CHF typed (splitFiat).
    fiat: { minor: 4_800, digits: 2, currency: "CHF" },
    rate: { currency: "CHF", rate: 94_950 },
    imported: false,
    acceptance: {
      received: "48000",
      due: "50000",
      at: T + 9_300,
      fiat: {
        minor: 5_000,
        digits: 2,
        currency: "CHF"
      }
    }
  },
  {
    id: "sale:accepted-sats",
    source: "integration",
    at: T + 9_100,
    note: "Order 7",
    invoice: null,
    by: { kind: "seat", name: "Shop" },
    payments: [
      payment("p-6", {
        direction: "receive",
        amountSats: "9900",
        timestamp: T + 9_100,
        network: "bitcoin",
        txId: TXID(6)
      })
    ],
    sats: "9900",
    fiat: null,
    rate: null,
    imported: false,
    acceptance: { received: "9900", due: "10000", at: T + 9_400, fiat: null }
  },
  {
    id: "p-7",
    source: "send",
    at: T + 10_800,
    note: "",
    invoice: null,
    by: null,
    payments: [
      payment("p-7", {
        direction: "send",
        amountSats: "150000",
        feeSats: "1840",
        timestamp: T + 10_800,
        network: "bitcoin",
        txId: TXID(7)
      })
    ],
    sats: "150000",
    fiat: null,
    rate: { currency: "CHF", rate: 95_000.5 },
    imported: false,
    acceptance: null
  },
  {
    id: "p-8",
    source: "send",
    at: T + 11_000,
    note: "",
    invoice: null,
    by: null,
    payments: [
      payment("p-8", {
        direction: "send",
        amountSats: "2100",
        feeSats: "3",
        timestamp: T + 11_000,
        paymentHash: HASH(8),
        lightningAddress: "cafe@getalby.com"
      })
    ],
    sats: "2100",
    fiat: null,
    rate: { currency: "CHF", rate: 95_010 },
    imported: false,
    acceptance: null
  },
  {
    id: "p-9",
    source: "send",
    at: T + 11_100,
    note: "",
    invoice: null,
    by: null,
    payments: [
      payment("p-9", {
        direction: "send",
        amountSats: "500",
        timestamp: T + 11_100,
        network: "spark"
      })
    ],
    sats: "500",
    fiat: null,
    // A rate recorded in another currency: no value in the merchant's.
    rate: { currency: "EUR", rate: 88_000 },
    imported: false,
    acceptance: null
  },
  {
    id: "legacy:2026-10:1",
    source: "pos",
    at: T - 86_400,
    note: "Old till",
    invoice: null,
    by: null,
    payments: [],
    sats: "52000",
    fiat: { minor: 5_000, digits: 2, currency: "CHF" },
    rate: { currency: "CHF", rate: 96_000 },
    imported: true,
    acceptance: null
  },
  {
    id: "legacy:2026-10:2",
    source: "send",
    at: T - 80_000,
    note: "",
    invoice: null,
    by: null,
    payments: [],
    sats: "10000",
    fiat: null,
    rate: null,
    imported: true,
    acceptance: null
  }
];

const OCTOBER = { first: "2026-10-01", last: "2026-10-31" };
/** 1.10.2026 00:00 to 31.10.2026 23:59:59 UTC. */
const OCTOBER_UTC = { start: 1_790_812_800, end: 1_793_491_199 };
const MADE_AT = T + 20_000;

const ALL = [...EXPORT_COLUMNS];
const DEFAULT: ExportColumn[] = [
  "dateAndTime",
  "label",
  "source",
  "reference",
  "bitcoinAmount",
  "fiatAmount",
  "remark"
];

const ids = (lines: VectorLine[]) => lines.map(({ id }) => id);

const CASES: Omit<VectorCase, "csv" | "html" | "fileNames">[] = [
  {
    name: "fr-CH, CHF, every column, in CHF",
    options: {
      language: "fr",
      locale: "fr-CH",
      timeZone: "UTC",
      businessName: "Café Zürich-Basel",
      currency: "CHF",
      columns: ALL,
      unit: "fiat",
      days: OCTOBER,
      range: OCTOBER_UTC,
      madeAt: MADE_AT
    },
    lines: ids(LINES)
  },
  {
    name: "de-CH, CHF, default columns, in BTC",
    options: {
      language: "de-CH",
      locale: "de-CH",
      timeZone: "UTC",
      businessName: "Bäckerei Müller",
      currency: "CHF",
      columns: DEFAULT,
      unit: "btc",
      days: OCTOBER,
      range: OCTOBER_UTC,
      madeAt: MADE_AT
    },
    lines: ids(LINES)
  },
  {
    name: "de-DE, EUR, every column, in EUR",
    options: {
      language: "de",
      locale: "de-DE",
      timeZone: "UTC",
      businessName: "Bäckerei Groß",
      currency: "EUR",
      columns: ALL,
      unit: "fiat",
      days: OCTOBER,
      range: OCTOBER_UTC,
      madeAt: MADE_AT
    },
    lines: ids(LINES)
  },
  {
    name: "en-US, CHF, every column",
    options: {
      language: "en",
      locale: "en-US",
      timeZone: "UTC",
      businessName: "Corner Shop",
      currency: "CHF",
      columns: ALL,
      unit: "fiat",
      days: OCTOBER,
      range: OCTOBER_UTC,
      madeAt: MADE_AT
    },
    lines: ids(LINES)
  },
  {
    name: "fi-FI, EUR, every column",
    options: {
      language: "fi",
      locale: "fi-FI",
      timeZone: "UTC",
      businessName: "Kahvila",
      currency: "EUR",
      columns: ALL,
      unit: "fiat",
      days: OCTOBER,
      range: OCTOBER_UTC,
      madeAt: MADE_AT
    },
    lines: ids(LINES)
  },
  {
    name: "es-ES, CHF, every column",
    options: {
      language: "es",
      locale: "es-ES",
      timeZone: "UTC",
      businessName: "Panadería",
      currency: "CHF",
      columns: ALL,
      unit: "fiat",
      days: OCTOBER,
      range: OCTOBER_UTC,
      madeAt: MADE_AT
    },
    lines: ids(LINES)
  },
  {
    name: "pt-PT, CHF, every column, in BTC",
    options: {
      language: "pt",
      locale: "pt-PT",
      timeZone: "UTC",
      businessName: "Pastelaria",
      currency: "CHF",
      columns: ALL,
      unit: "btc",
      days: OCTOBER,
      range: OCTOBER_UTC,
      madeAt: MADE_AT
    },
    lines: ids(LINES)
  },
  {
    name: "it-CH, JPY (no decimals), every column",
    options: {
      language: "it",
      locale: "it-CH",
      timeZone: "UTC",
      businessName: "Trattoria",
      currency: "JPY",
      columns: ALL,
      unit: "fiat",
      days: OCTOBER,
      range: OCTOBER_UTC,
      madeAt: MADE_AT
    },
    lines: ids(LINES)
  },
  {
    name: "en-GB, a period with nothing",
    options: {
      language: "en",
      locale: "en-GB",
      timeZone: "UTC",
      businessName: "Café",
      currency: "CHF",
      columns: DEFAULT,
      unit: "fiat",
      days: { first: "2026-09-01", last: "2026-09-30" },
      range: { start: 1_788_220_800, end: 1_790_812_799 },
      madeAt: MADE_AT
    },
    lines: ids(LINES)
  },
  {
    name: "fr-CH, the v2 history only (no payment of the wallet: no value told)",
    options: {
      language: "fr",
      locale: "fr-CH",
      timeZone: "UTC",
      businessName: "Café",
      currency: "CHF",
      columns: ALL,
      unit: "fiat",
      days: OCTOBER,
      range: OCTOBER_UTC,
      madeAt: MADE_AT
    },
    lines: ["legacy:2026-10:1", "legacy:2026-10:2"]
  }
];

function walletPayment(p: VectorPayment): WalletPayment {
  return {
    id: p.id,
    direction: p.direction,
    status: p.status,
    amountSats: BigInt(p.amountSats),
    feeSats: BigInt(p.feeSats),
    timestamp: p.timestamp,
    network: p.network,
    ...(p.paymentHash !== null ? { paymentHash: p.paymentHash } : {}),
    ...(p.txId !== null ? { txId: p.txId } : {}),
    ...(p.lightningAddress !== null ? { lightningAddress: p.lightningAddress } : {}),
    ...(p.description !== null ? { description: p.description } : {})
  } as WalletPayment;
}

function rateOf(paymentId: string, at: number, rate: { currency: string; rate: number }) {
  return {
    payment: paymentId,
    at,
    currency: rate.currency,
    hour: at - (at % 3600),
    rate: rate.rate
  };
}

/** The row of "Wallet" a line stands for. */
function itemOf(line: VectorLine): ActivityItem {
  return {
    id: line.id,
    source: line.source,
    timestamp: line.at,
    note: line.note,
    fiat: line.fiat,
    sats: BigInt(line.sats),
    state: null,
    rest: null,
    by:
      line.by === null
        ? null
        : line.by.kind === "you"
          ? { kind: "you" }
          : { kind: "member", id: "0".repeat(32), name: line.by.name },
    payments: line.payments.map(walletPayment),
    link: null,
    ...(line.invoice
      ? {
          invoice: {
            id: "i",
            number: line.invoice.number,
            recipient: line.invoice.recipient,
            status: "sent" as const,
            dueDate: null
          }
        }
      : {}),
    ...(line.imported
      ? {
          imported: {
            kind: line.source === "send" ? "withdraw" : "sale",
            rate: line.rate ? (rateOf(line.id, line.at, line.rate) as PaymentRate) : null
          }
        }
      : {}),
    ...(line.acceptance
      ? {
          acceptance: {
            status: "accepted" as const,
            received: BigInt(line.acceptance.received),
            due: BigInt(line.acceptance.due),
            at: line.acceptance.at,
            fiat: line.acceptance.fiat
          }
        }
      : {})
  } as ActivityItem;
}

/**
 * Each row's value (rowValue), with the rates the lines name, as "Export" reads them
 * (run.ts, valuesOf): none at all when no line has a completed payment of the wallet.
 */
function valuesOf(rows: readonly ExportRow[], lines: readonly VectorLine[]): (RowValue | null)[] {
  const rates = new Map<string, PaymentRate>();
  for (const line of lines) {
    const latest = line.payments.find(({ status }) => status === "completed");
    if (latest && line.rate) {
      rates.set(latest.id, rateOf(latest.id, latest.timestamp, line.rate) as PaymentRate);
    }
  }
  const completed = rows.some((row) =>
    row.item.payments.some(({ status }) => status === "completed")
  );
  return rows.map((row) => (completed ? rowValue(row, rates) : null));
}

/** What the app writes for `spec`, in its time zone. */
function made(spec: Omit<VectorCase, "csv" | "html" | "fileNames">): VectorCase {
  const { options } = spec;
  // The app formats dates in the engine's time zone: the cases' (jest.config.js runs in UTC).
  expect(options.timeZone).toBe("UTC");
  expect(new Date(0).getTimezoneOffset()).toBe(0);
  {
    const lines = LINES.filter(({ id }) => spec.lines.includes(id));
    const rows = exportRows(lines.map(itemOf), options.range);
    const values = valuesOf(rows, lines);
    const t = i18n.getFixedT(options.language);
    const digits = currencyDigits(options.currency);
    const csv = exportCsv(rows, values, {
      columns: options.columns,
      currency: options.currency,
      digits,
      languageTag: options.locale,
      t
    });
    const html = reportHtml(rows, values, {
      businessName: options.businessName,
      days: options.days,
      unit: options.unit,
      currency: options.currency,
      digits,
      language: options.language,
      languageTag: options.locale,
      t,
      madeAt: new Date(options.madeAt * 1000),
      fontFaces: ""
    });
    return {
      ...spec,
      csv,
      html,
      fileNames: {
        csv: exportFileName(options.businessName, options.days, "csv"),
        pdf: exportFileName(options.businessName, options.days, "pdf")
      }
    };
  }
}

// The team and the assistant of src/__tests__/fixtures/mcp-server/assistant.json: the BIP-39 test mnemonic (all-zero
// entropy), never a real wallet, and the assistant 0123456789abcdef0123456789abcdef.
const team = deriveTeamKeys(
  encodeWalletSecret({
    mnemonic:
      "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about"
  })
);
const ASSISTANT = "0123456789abcdef0123456789abcdef";
const GRANT_AT = 1_793_000_000;
const GRANT_FORMAT: GrantFormat = { language: "fr", locale: "fr-CH", timeZone: "Europe/Zurich" };
/** The account's team as the grant names it: a device, an employee, an integration, the assistant, one removed. */
const GRANT_ROSTER: Roster = {
  employees: [{ id: "1".repeat(32), name: "Alice", role: "employee", invitedAt: 1_790_000_000 }],
  integrations: [
    { id: "2".repeat(32), name: "Shop", createdAt: 1_790_100_000, platform: "woocommerce" }
  ],
  assistants: [{ id: ASSISTANT, name: "Carol's assistant", createdAt: 1_790_200_000 }],
  removed: [
    {
      role: "employee",
      id: "3".repeat(32),
      name: "Bob",
      since: 1_789_000_000,
      removedAt: 1_790_500_000
    }
  ]
};
const GRANT_DEVICES = [{ id: "4".repeat(32), addedAt: 1_789_500_000 }];

/** The keys the app's grant gives, for the vectors' team (exportKeysOf). */
function grantKeys() {
  return exportKeysOf(team, GRANT_DEVICES, GRANT_ROSTER, GRANT_FORMAT);
}

/** The grant's records, made now (random NIP-44 nonces and signatures: made once, then kept). */
function grantEvents(): NostrEvent[] {
  const keys = deriveAssistantKeys(assistantSecretKey(team, ASSISTANT)).exportGrant;
  const signer = usableTeamKeys(team).secretKey;
  return [
    exportDecisionEvent(signer, keys, { allowed: true, updatedAt: GRANT_AT }),
    ...exportKeysParts(grantKeys(), GRANT_AT).map((part) =>
      exportPartEvent(signer, keys, part, GRANT_AT)
    )
  ];
}

/**
 * Later decisions of the same grant, each to add to its events: withdrawn, allowed again (its keys
 * not written yet), and one of a newer format (version 2, as a newer app would write it).
 */
function laterDecisions(): Record<"withdrawn" | "allowedAgain" | "newer", NostrEvent> {
  const keys = deriveAssistantKeys(assistantSecretKey(team, ASSISTANT)).exportGrant;
  const signer = usableTeamKeys(team).secretKey;
  return {
    withdrawn: exportDecisionEvent(signer, keys, { allowed: false, updatedAt: GRANT_AT + 10 }),
    allowedAgain: exportDecisionEvent(signer, keys, { allowed: true, updatedAt: GRANT_AT + 20 }),
    newer: sealRecord({
      type: "assistant-export",
      value: { version: 2, allowed: true, updatedAt: GRANT_AT + 30 },
      signer,
      encryptionKey: keys.encryptionKey,
      address: exportDecisionAddress(keys),
      createdAt: GRANT_AT + 30
    })
  };
}

/**
 * The sendings of the source vectors: three payments the wallet sent (to a Lightning address over
 * Lightning, on-chain, over Spark), as the app publishes them (wallet-send), two with the rate it
 * recorded (payment-rate).
 */
const SEND_PAYMENTS: VectorPayment[] = [
  payment("send-ln", {
    direction: "send",
    amountSats: "2100",
    feeSats: "3",
    timestamp: T + 100,
    paymentHash: HASH(20),
    description: "  Corner Café  "
  }),
  payment("send-chain", {
    direction: "send",
    amountSats: "150000",
    feeSats: "1840",
    timestamp: T + 200,
    network: "bitcoin",
    txId: TXID(21)
  }),
  payment("send-spark", {
    direction: "send",
    amountSats: "500",
    timestamp: T + 300,
    network: "spark"
  })
];
const SEND_RATES = [
  rateOf("send-ln", T + 100, { currency: "CHF", rate: 95_010 }),
  rateOf("send-chain", T + 200, { currency: "CHF", rate: 95_000.5 })
] as PaymentRate[];
const SEND_RANGE = { start: T, end: T + 3_600 };

/** A sending's line as the server builds it from its records (what it reads of it). */
function sendLine(p: VectorPayment): VectorLine {
  const send = walletSendOf(walletPayment(p))!;
  const lightning = send.network === "lightning" || send.network === "spark";
  const rate = SEND_RATES.find(({ payment: id }) => id === p.id);
  return {
    id: p.id,
    source: "send",
    at: send.at,
    note: "",
    invoice: null,
    by: null,
    payments: [
      {
        id: send.payment,
        direction: "send",
        status: "completed",
        amountSats: send.sats.toString(),
        feeSats: send.feeSats.toString(),
        timestamp: send.at,
        network: send.network,
        paymentHash: lightning && send.reference !== send.payment ? send.reference : null,
        txId: !lightning && send.reference !== send.payment ? send.reference : null,
        lightningAddress: lightning ? send.text : null,
        description: null
      }
    ],
    sats: send.sats.toString(),
    fiat: null,
    rate: rate ? { currency: rate.currency, rate: rate.rate } : null,
    imported: false,
    acceptance: null
  };
}

/** The records the app publishes of the sendings and their rates (made once, then kept). */
function sendEvents(): NostrEvent[] {
  const sends = deriveWalletSendKeys(team);
  const rates = derivePaymentRateKeys(team);
  return [
    ...SEND_PAYMENTS.map((p) => walletSendEvent(sends, walletSendOf(walletPayment(p))!)),
    ...SEND_RATES.map((rate) => paymentRateEvent(rates, rate))
  ];
}

/*
 * The history copied from the v2 account (src/lib/legacy-v2/history-records.ts): September 2026 in
 * two parts (many rows with long notes), October 2026 in one, read from 20 September to 10 October
 * (UTC): rows on both edges are in, those before and after are not.
 */
const HISTORY_RANGE = { start: 1_789_862_400, end: 1_791_676_799 };
const HISTORY_AT = 1_793_000_000;
const HISTORY_REF = (label: string) => bytesToHex(sha256(utf8ToBytes(`v2:${label}`)));
const HISTORY_KINDS: Pick<LegacyHistoryRow, "kind" | "channel">[] = [
  { kind: "sale", channel: "pos" },
  { kind: "sale", channel: "link" },
  { kind: "sale", channel: "integration" },
  { kind: "withdraw", channel: null },
  { kind: "referral", channel: null },
  { kind: "receipt", channel: null }
];

function historyRows(): LegacyHistoryRow[] {
  // 1.9.2026 00:00 UTC, then a row every 20 000 s: up to 26 September.
  const september = Array.from({ length: 110 }, (_, n): LegacyHistoryRow => {
    const { kind, channel } = HISTORY_KINDS[n % HISTORY_KINDS.length]!;
    const sale = kind === "sale";
    return {
      ref: HISTORY_REF(`september/${n}`),
      kind,
      channel,
      at: 1_788_220_800 + n * 20_000,
      sats: BigInt(1_000 + n * 37),
      fiat: sale && n % 2 === 0 ? { minor: 100 + n * 3, digits: 2, currency: "CHF" } : null,
      note: `${sale ? "Sale" : "Transfer"} ${n} `.padEnd(200, "·"),
      rate: n % 5 === 4 ? null : { price: 95_000 + n * 10.25, currency: "CHF" }
    };
  });
  const october: LegacyHistoryRow[] = [
    { at: HISTORY_RANGE.end - 86_400 * 9, kind: "sale", channel: "pos", note: "Café" },
    { at: HISTORY_RANGE.end - 86_400 * 3, kind: "withdraw", channel: null, note: "" },
    { at: HISTORY_RANGE.end, kind: "sale", channel: "link", note: "At the edge" },
    { at: HISTORY_RANGE.end + 1, kind: "sale", channel: "pos", note: "Too late" },
    { at: HISTORY_RANGE.end + 86_400 * 15, kind: "receipt", channel: null, note: "" }
  ].map(({ at, kind, channel, note }, n): LegacyHistoryRow => ({
    ref: HISTORY_REF(`october/${n}`),
    kind: kind as LegacyHistoryRow["kind"],
    channel: channel as LegacyHistoryRow["channel"],
    at,
    sats: BigInt(21_000 + n),
    fiat: kind === "sale" ? { minor: 2_000 + n, digits: 2, currency: "CHF" } : null,
    note,
    rate: { price: 96_500.5, currency: "CHF" }
  }));
  // On the range's first second.
  september[0] = { ...september[0]!, at: HISTORY_RANGE.start };
  return [...september, ...october];
}

/** A v2 history row's line as the server builds it (legacy-history.ts, legacyHistoryItem). */
function historyLine(row: LegacyHistoryRow): VectorLine {
  return {
    id: `legacy:${row.ref}`,
    source:
      row.kind === "withdraw" ? "send" : row.kind === "sale" ? (row.channel ?? "pos") : "receive",
    at: row.at,
    note: row.note,
    invoice: null,
    by: null,
    payments: [],
    sats: row.sats.toString(),
    fiat: row.fiat,
    rate: row.rate && { currency: row.rate.currency, rate: row.rate.price },
    imported: true,
    acceptance: null
  };
}

const monthOfRow = ({ at }: LegacyHistoryRow) => new Date(at * 1000).toISOString().slice(0, 7);

/** The records the app writes of the history (its parts, then its state: copied whole). */
function historyEvents(): NostrEvent[] {
  const keys = deriveLegacyHistoryKeys(team);
  const rows = historyRows();
  const months = [...new Set(rows.map(monthOfRow))].sort();
  return [
    ...months.flatMap((month) =>
      historyParts(
        month,
        rows.filter((row) => monthOfRow(row) === month)
      ).map((part) => historyPartEvent(keys, part, HISTORY_AT))
    ),
    historyStateEvent(keys, { done: HISTORY_AT }, HISTORY_AT)
  ];
}

/**
 * Records written after them, each added to the history's: `pending` (the state of a copy started
 * again, not finished), `newer` (October's first part, of a newer format: never read past).
 */
function historyLater(): Record<"pending" | "newer", NostrEvent> {
  const keys = deriveLegacyHistoryKeys(team);
  return {
    pending: historyStateEvent(keys, { done: null }, HISTORY_AT + 60),
    newer: sealRecord({
      type: "legacy-history-month",
      value: { version: 2, month: "2026-10", part: 0 },
      signer: keys.nostr.secretKey,
      encryptionKey: keys.encryptionKey,
      address: historyPartAddress(keys, "2026-10", 0),
      createdAt: HISTORY_AT + 60,
      block: 256
    })
  };
}

/** The lines of the rows within the range, by id. */
function historyLines(): VectorLine[] {
  return historyRows()
    .filter(({ at }) => at >= HISTORY_RANGE.start && at <= HISTORY_RANGE.end)
    .map(historyLine)
    .sort((a, b) => (a.id < b.id ? -1 : 1));
}

/*
 * The sales of the points of sale (src/lib/team/member-records.ts), on 26 October 2026 (UTC): one
 * Alice took, paid over Lightning (its record's proof, its declaration in the registry); one an
 * owner's device took, paid on-chain (its device saw the transaction); one Alice took, paid short
 * on-chain and accepted by the owner. `chain` is what the explorer tells of their transactions.
 */
const TILL_RANGE = { start: 1_792_972_800, end: 1_793_059_199 };
const TILL_T = 1_793_008_800; // 26.10.2026 10:00 UTC
const TILL_FIAT = { minor: 1_250, digits: 2, currency: "CHF" };
const ALICE = "1".repeat(32);
const OWNER_DEVICE = "4".repeat(32);
const TILL_ADDRESS = taprootAddress(0x51);
const SHORT_ADDRESS = taprootAddress(0x52);
const TILL_TXID = "5a".repeat(32);
const SHORT_TXID = "5b".repeat(32);
/** What the explorer tells (the server's test sets it so). */
const TILL_CHAIN = [
  {
    address: TILL_ADDRESS,
    txid: TILL_TXID,
    sats: 13_000,
    confirmations: 6,
    received: TILL_T + 700
  },
  {
    address: SHORT_ADDRESS,
    txid: SHORT_TXID,
    sats: 12_000,
    confirmations: 6,
    received: TILL_T + 900
  }
];

function tillKeys() {
  const business = {
    key: deriveRegistryKey(team),
    reader: deriveRegistryReader(team).publicKey,
    owner: deriveLinkOwner(team).publicKey
  };
  return {
    business,
    alice: deriveMemberKeys(memberSecret(team, ALICE)),
    device: deriveMemberKeys(ownerDeviceSecret(team, OWNER_DEVICE))
  };
}

function tillSaleKey(fill: number) {
  const key = new Uint8Array(32).fill(fill);
  return { key, identity: deriveSaleKeys(key).nostr.publicKey };
}

/** A Lightning invoice of the merchant's address for a sale, and what pays it. */
function tillInvoice() {
  const { preimage, paymentHash } = preimagePair(0x71);
  const pr = makeInvoice({
    amountMsat: 13_000_000n,
    paymentHash,
    descriptionHash: metadataHash("[]"),
    timestamp: TILL_T,
    expirySeconds: 600
  });
  return {
    pr,
    preimage,
    paymentHash,
    verifyUrl: `https://breez.tips/lnurlp/verify/${paymentHash}`
  };
}

function tillSale(value: SaleRecordValue): MemberSale {
  return { version: 1, onchainTag: null, ...value } as MemberSale;
}

/** The records the app writes of these sales: its devices', the registry's, the owner's. */
function tillEvents(): NostrEvent[] {
  const { business, alice, device } = tillKeys();
  const paid = tillSaleKey(0x61);
  const onchain = tillSaleKey(0x62);
  const short = tillSaleKey(0x63);
  const invoice = tillInvoice();
  const shown = {
    sats: "13000",
    fiat: TILL_FIAT,
    note: "Café",
    createdAt: TILL_T,
    expiresAt: TILL_T + 600,
    paidAt: null
  };
  const lightning = {
    ...shown,
    sale: paid.identity,
    saleKey: bytesToHex(paid.key),
    paymentHash: invoice.paymentHash,
    verifyUrl: invoice.verifyUrl,
    onchainAddress: null
  };
  const hour = TILL_T - (TILL_T % 3600);
  return [
    // Shown, then paid: the paid record replaces it.
    saleEvent(alice, tillSale(lightning)),
    saleEvent(
      alice,
      tillSale({
        ...lightning,
        paidAt: TILL_T + 42,
        lightning: [{ invoice: invoice.pr, preimage: invoice.preimage }]
      })
    ),
    declarationEvent(
      saleRegistry(business, paid.key),
      {
        pr: invoice.pr,
        verifyUrl: invoice.verifyUrl,
        decoded: decodeBolt11(invoice.pr)!
      } as LightningInvoice,
      { fiat: TILL_FIAT, note: "Café" },
      TILL_T
    ),
    saleEvent(
      device,
      tillSale({
        ...shown,
        createdAt: TILL_T + 600,
        expiresAt: TILL_T + 1200,
        paidAt: TILL_T + 2400,
        lightning: [],
        sale: onchain.identity,
        saleKey: bytesToHex(onchain.key),
        paymentHash: null,
        verifyUrl: null,
        onchainAddress: TILL_ADDRESS,
        hour
      })
    ),
    saleTxEvent(device, TILL_ADDRESS, TILL_TXID, TILL_T + 720),
    saleEvent(
      alice,
      tillSale({
        ...shown,
        createdAt: TILL_T + 600,
        expiresAt: TILL_T + 1200,
        sale: short.identity,
        saleKey: bytesToHex(short.key),
        paymentHash: null,
        verifyUrl: null,
        onchainAddress: SHORT_ADDRESS,
        hour,
        underpaid: {
          at: TILL_T + 2400,
          received: "12000",
          due: "13000",
          transactions: [SHORT_TXID]
        }
      })
    ),
    saleAcceptanceEvent(
      deriveLinkOwner(team).secretKey,
      short.key,
      { received: 12_000n, due: 13_000n },
      TILL_T + 3000
    )
  ];
}

/** The lines a server makes of them, the explorer telling `TILL_CHAIN`. */
function tillLines(): VectorLine[] {
  const invoice = tillInvoice();
  const receive = (fields: Partial<VectorPayment>): VectorPayment => ({
    id: "",
    direction: "receive",
    status: "completed",
    amountSats: "0",
    feeSats: "0",
    timestamp: 0,
    network: "bitcoin",
    paymentHash: null,
    txId: null,
    lightningAddress: null,
    description: null,
    ...fields
  });
  const line = (fields: Partial<VectorLine>): VectorLine => ({
    id: "",
    source: "pos",
    at: 0,
    note: "Café",
    invoice: null,
    by: null,
    payments: [],
    sats: "0",
    fiat: TILL_FIAT,
    rate: null,
    imported: false,
    acceptance: null,
    ...fields
  });
  return [
    line({
      id: `sale:${tillSaleKey(0x61).identity}`,
      at: TILL_T + 42,
      by: { kind: "seat", name: "Alice" },
      payments: [
        receive({
          id: invoice.paymentHash,
          amountSats: "13000",
          timestamp: TILL_T + 42,
          network: "lightning",
          paymentHash: invoice.paymentHash
        })
      ],
      sats: "13000"
    }),
    line({
      id: `sale:${tillSaleKey(0x62).identity}`,
      at: TILL_T + 700,
      by: { kind: "you" },
      payments: [
        receive({ id: TILL_TXID, amountSats: "13000", timestamp: TILL_T + 700, txId: TILL_TXID })
      ],
      sats: "13000"
    }),
    line({
      id: `sale:${tillSaleKey(0x63).identity}`,
      at: TILL_T + 900,
      by: { kind: "seat", name: "Alice" },
      payments: [
        receive({ id: SHORT_TXID, amountSats: "12000", timestamp: TILL_T + 900, txId: SHORT_TXID })
      ],
      sats: "12000",
      // 12.50 × 12 000 / 13 000, rounded down (splitFiat).
      fiat: { ...TILL_FIAT, minor: 1_153 },
      acceptance: { received: "12000", due: "13000", at: TILL_T + 3000, fiat: TILL_FIAT }
    })
  ].sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : 1));
}

function vectors() {
  return {
    source:
      'Made by the sattle.me app (src/__tests__/export-vectors.test.ts, Node\'s ICU): "Wallet › Export" of these lines with these options. An implementation writes `csv` and `html` exactly from `lines` and `options` (docs/etude-export-assistant.md).',
    lines: LINES,
    cases: CASES.map(made)
  };
}

describe("the export's vectors (src/__tests__/fixtures/mcp-server/export.json)", () => {
  it("are what the app writes from their lines, in every case", () => {
    const now = vectors();
    if (process.env.WRITE_EXPORT_VECTORS === "1") {
      const grant = {
        source:
          "A grant of the export the app made for the team and the assistant of src/__tests__/fixtures/mcp-server/assistant.json (its `parsed.assistantKey`): its `events` (the decision, then each part of the keys) open, with the assistant's key, to `keys`. `later`: decisions made after it, each added to `events`: `withdrawn` (nothing given), `allowedAgain` (nothing until its keys are written), `newer` (a newer format: never read past).",
        team: team.publicKey,
        events: grantEvents(),
        keys: grantKeys(),
        later: laterDecisions()
      };
      const sources = {
        source:
          "Records of the account of `grant` as the app publishes them, each source with the lines an implementation builds from them, read within `range` with the keys of `grant.keys`.",
        sends: { range: SEND_RANGE, events: sendEvents(), lines: SEND_PAYMENTS.map(sendLine) },
        history: {
          range: HISTORY_RANGE,
          events: historyEvents(),
          later: historyLater(),
          lines: historyLines()
        },
        till: { range: TILL_RANGE, events: tillEvents(), chain: TILL_CHAIN, lines: tillLines() }
      };
      fs.writeFileSync(FILE, `${JSON.stringify({ ...now, grant, sources }, null, 2)}\n`);
    }
    const { grant: _grant, sources: _sources, ...kept } = JSON.parse(fs.readFileSync(FILE, "utf8"));
    expect(kept).toEqual(JSON.parse(JSON.stringify(now)));
  });

  it("hold a grant the app made, which opens with the assistant's key to the keys it gives", () => {
    const { grant } = JSON.parse(fs.readFileSync(FILE, "utf8")) as {
      grant: { team: string; events: NostrEvent[]; keys: unknown };
    };
    expect(grant.team).toBe(team.publicKey);
    expect(grant.keys).toEqual(JSON.parse(JSON.stringify(grantKeys())));
    const keys = deriveAssistantKeys(assistantSecretKey(team, ASSISTANT)).exportGrant;
    const read = exportGrantOf(
      new Map([["wss://relay.example", grant.events]]),
      team.publicKey,
      keys
    );
    expect(grantedKeys(read)).toEqual(grant.keys);
    const later = (
      JSON.parse(fs.readFileSync(FILE, "utf8")) as {
        grant: { later: Record<string, NostrEvent> };
      }
    ).grant.later;
    const withEvent = (event: NostrEvent) =>
      exportGrantOf(
        new Map([["wss://relay.example", [...grant.events, event]]]),
        team.publicKey,
        keys
      );
    expect(grantedKeys(withEvent(later.withdrawn!))).toBeNull();
    expect(grantedKeys(withEvent(later.allowedAgain!))).toBeNull();
    const newer = withEvent(later.newer!);
    expect(newer.decision.newestUnreadable).toBe(later.newer!.created_at);
    expect(grantedKeys(newer)).toBeNull();
  });

  it("cover every source, every column and each kind of remark", () => {
    const cases = vectors().cases;
    const all = cases.find(({ name }) => name.startsWith("en-US"))!;
    for (const source of ["Point of sale", "Invoice", "Integration", "Sent"]) {
      expect(all.csv).toContain(source);
    }
    expect(all.csv).toContain("'=HYPERLINK");
    expect(all.csv).toContain("accepted by the owner");
    expect(all.csv).toContain("Difference of 0.00000100 BTC");
    expect(cases.find(({ name }) => name.includes("nothing"))!.html).toContain(
      "No completed transaction in this period."
    );
  });
});

describe("the export's source vectors", () => {
  /** Read when each test runs: after a run that makes them again (WRITE_EXPORT_VECTORS). */
  const read = () =>
    (
      JSON.parse(fs.readFileSync(FILE, "utf8")) as {
        sources: {
          sends: {
            range: { start: number; end: number };
            events: NostrEvent[];
            lines: VectorLine[];
          };
          history: {
            range: { start: number; end: number };
            events: NostrEvent[];
            later: Record<"pending" | "newer", NostrEvent>;
            lines: VectorLine[];
          };
          till: {
            range: { start: number; end: number };
            events: NostrEvent[];
            chain: typeof TILL_CHAIN;
            lines: VectorLine[];
          };
        };
      }
    ).sources;

  it("hold the sendings the app published, and the lines they make", () => {
    const { events, lines, range } = read().sends;
    expect(range).toEqual(SEND_RANGE);
    expect(lines).toEqual(JSON.parse(JSON.stringify(SEND_PAYMENTS.map(sendLine))));
    const sends = walletSendsOf(deriveWalletSendKeys(team), events);
    expect([...sends.sends.keys()].sort()).toEqual(SEND_PAYMENTS.map(({ id }) => id).sort());
    const rates = paymentRatesOf(derivePaymentRateKeys(team), events);
    expect([...rates.rates.values()]).toEqual(expect.arrayContaining(SEND_RATES));
  });

  it("make the files the app writes of the same payments", () => {
    // The app's rows of these payments (itemOf) and the server's lines write the same CSV.
    const own: VectorLine[] = SEND_PAYMENTS.map((p) => ({
      ...sendLine(p),
      payments: [p]
    }));
    const options = CASES[0]!.options;
    const csvOf = (lines: VectorLine[]) => {
      const rows = exportRows(lines.map(itemOf), SEND_RANGE);
      return exportCsv(rows, valuesOf(rows, lines), {
        columns: options.columns,
        currency: options.currency,
        digits: currencyDigits(options.currency),
        languageTag: options.locale,
        t: i18n.getFixedT(options.language)
      });
    };
    expect(csvOf(read().sends.lines)).toBe(csvOf(own));
    expect(csvOf(own)).toContain("Corner Café");
  });

  it("hold the v2 history the app copied, and the lines of the period", () => {
    const { events, later, lines, range } = read().history;
    expect(range).toEqual(HISTORY_RANGE);
    expect(lines).toEqual(JSON.parse(JSON.stringify(historyLines())));
    const keys = deriveLegacyHistoryKeys(team);
    const read2 = (more: NostrEvent[] = []) =>
      historyOf(keys, new Map([["wss://relay.example", [...events, ...more]]]));
    const answers = read2();
    // September in two parts, October in one: both read whole.
    expect(
      [...answers.parts.values()]
        .filter(({ part }) => part.month === "2026-09")
        .map(({ part }) => part.parts)
    ).toEqual([2, 2]);
    const rows = ["2026-09", "2026-10"].flatMap(
      (month) => historyMonth(keys, month, answers.parts, answers.newer).rows
    );
    expect(
      rows
        .map(legacyHistoryItem)
        .filter(({ timestamp }) => timestamp >= range.start && timestamp <= range.end)
        .map(({ id }) => id)
        .sort()
    ).toEqual(lines.map(({ id }) => id));
    expect(answers.state?.state.done).toBe(HISTORY_AT);
    // Its records written later: a copy not finished, a month of a newer format.
    expect(read2([later.pending]).state?.state.done).toBeNull();
    const newer = read2([later.newer]);
    expect(historyMonth(keys, "2026-10", newer.parts, newer.newer)).toMatchObject({
      copied: false,
      newer: true
    });
  });

  it("make the files the app writes of the same v2 history", () => {
    const options = CASES[0]!.options;
    const lines = read().history.lines;
    const own = historyRows()
      .map(legacyHistoryItem)
      .filter(
        ({ timestamp }) => timestamp >= HISTORY_RANGE.start && timestamp <= HISTORY_RANGE.end
      );
    const csvOf = (items: ActivityItem[]) => {
      const rows = exportRows(items, HISTORY_RANGE);
      // The values "Export" gives: none, without a completed payment of the wallet (valuesOf).
      return exportCsv(rows, valuesOf(rows, []), {
        columns: options.columns,
        currency: options.currency,
        digits: currencyDigits(options.currency),
        languageTag: options.locale,
        t: i18n.getFixedT(options.language)
      });
    };
    expect(csvOf(lines.map(itemOf))).toBe(csvOf(own));
    expect(csvOf(own)).toContain("At the edge");
    expect(csvOf(own)).not.toContain("Too late");
  });

  it("hold the sales the points of sale recorded, and the lines they make", () => {
    const { events, chain, lines, range } = read().till;
    expect(range).toEqual(TILL_RANGE);
    expect(chain).toEqual(TILL_CHAIN);
    expect(lines).toEqual(JSON.parse(JSON.stringify(tillLines())));
    const { alice, device } = tillKeys();
    // Alice's: the paid record of the Lightning sale (with its proof), the short one.
    const ofAlice = memberRecordsOf(alice, events);
    expect(ofAlice.sales.map(({ paidAt, underpaid }) => [paidAt, underpaid?.at ?? null])).toEqual(
      expect.arrayContaining([
        [TILL_T + 42, null],
        [null, TILL_T + 2400]
      ])
    );
    expect(ofAlice.sales.find(({ paidAt }) => paidAt !== null)?.lightning).toEqual([
      { invoice: tillInvoice().pr, preimage: tillInvoice().preimage }
    ]);
    // The owner's device's: the on-chain sale, and the transaction it saw.
    const ofDevice = memberRecordsOf(device, events);
    expect(ofDevice.sales.map(({ onchainAddress }) => onchainAddress)).toEqual([TILL_ADDRESS]);
    expect(ofDevice.sightings).toEqual([
      { address: TILL_ADDRESS, txid: TILL_TXID, at: TILL_T + 720 }
    ]);
    // The owner's acceptance of the short one, signed with the owner's key of that sale.
    expect(
      events
        .map((event) =>
          openSaleAcceptance(event, deriveLinkOwner(team).publicKey, tillSaleKey(0x63).key)
        )
        .filter((opened) => opened?.status === "ok")
    ).toHaveLength(1);
  });
});
