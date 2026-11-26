import { schnorr } from "@noble/curves/secp256k1.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

import { MAX_INVOICE_LINES, standardVatRate } from "@/config/invoices";
import { DEFAULT_RELAYS } from "@/config/relays";
import type { ActivityItem } from "@/features/activity/model";
import { sentLinks, withInvoices } from "@/features/invoices/activity";
import { wizardStateOf } from "@/features/invoices/form";
import { encodeWalletSecret } from "@/lib/breez/secret";
import {
  convertPrice,
  invoiceTotals,
  isPayable,
  lineNetMinor,
  parseQuantity,
  parseScaled,
  parseVatRate,
  type InvoiceLine
} from "@/lib/invoice/amounts";
import {
  InvoiceCounterError,
  counterEvent,
  nextNumber,
  takeInvoiceNumber
} from "@/lib/invoice/counter";
import {
  fetchInvoices,
  formatInvoiceNumber,
  invoiceAddress,
  invoiceEvent,
  isCalendarDate,
  newInvoiceId,
  parseInvoice,
  parseInvoiceEntry,
  publishInvoice,
  type Invoice
} from "@/lib/invoice/record";
import { publishToRelays } from "@/lib/nostr/pool";
import { NewerRecordError, sealRecord } from "@/lib/nostr/record";
import { deriveInvoiceKeys, deriveTeamKeys, wipeTeamKeys } from "@/lib/team/keys";

import type * as RelaysFake from "../../jest/nostr-relays";

const relays = jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");

/** BIP-39 test mnemonic (all-zero entropy), never a real wallet's. */
const MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const team = deriveTeamKeys(encodeWalletSecret({ mnemonic: MNEMONIC }));
const keys = deriveInvoiceKeys(team);
const call = {
  relays: DEFAULT_RELAYS,
  channel: "account" as const,
  timeoutMs: 1000,
  authKey: keys.nostr.secretKey
};
const NOW = 1_791_500_000;

beforeEach(() => relays.resetRelays());

/** The lines of a sample invoice. */
const LINES: InvoiceLine[] = [
  { name: "Sourdough bread 800 g", quantity: 2400, unitMinor: 650, vatRate: 260 },
  { name: "Butter croissants", quantity: 6000, unitMinor: 180, vatRate: 260 },
  { name: "Delivery fee", quantity: 100, unitMinor: 4500, vatRate: 810 }
];

function invoice(patch: Partial<Invoice> = {}): Invoice {
  return {
    version: 1,
    id: newInvoiceId(),
    number: { year: 2026, sequence: 42 },
    status: "draft",
    recipient: {
      name: "Bastion Coffee LLC",
      street: "12 Gold Cross Street",
      postalCode: "1204",
      city: "Geneva",
      country: "CH",
      reference: ""
    },
    currency: { code: "CHF", digits: 2 },
    lines: LINES,
    dueDate: "2026-11-08",
    dueAt: Date.UTC(2026, 10, 8, 23, 0, 0) / 1000,
    terms: "Payment within 30 days net, no discount.",
    legal: "",
    redirectUrl: null,
    createdAt: NOW,
    updatedAt: NOW,
    sent: null,
    ...patch
  };
}

const LINK = {
  id: "ab".repeat(32),
  key: "cd".repeat(32),
  relays: [...DEFAULT_RELAYS],
  url: "https://web.example/pay#x"
};

describe("invoice amounts", () => {
  it("add up the sample invoice: VAT per rate, rounded half up on each rate's sum", () => {
    expect(LINES.map(lineNetMinor)).toEqual([15_600, 10_800, 4_500]);
    expect(invoiceTotals(LINES)).toEqual({
      netMinor: 30_900,
      vat: [
        // 2.6 % of 264.00 is 6.864: 6.86.
        { rate: 260, baseMinor: 26_400, vatMinor: 686 },
        // 8.1 % of 45.00 is 3.645: 3.65 (half up).
        { rate: 810, baseMinor: 4_500, vatMinor: 365 }
      ],
      totalMinor: 31_951
    });
  });

  it("round a line with hundredths of a unit half up, and leave a rate of 0 % out", () => {
    // 1.5 h at 33.33: 49.995 → 50.00.
    expect(lineNetMinor({ quantity: 150, unitMinor: 3333 })).toBe(5000);
    // 0.33 × 0.01 = 0.0033 → 0.00.
    expect(lineNetMinor({ quantity: 33, unitMinor: 1 })).toBe(0);
    const totals = invoiceTotals([
      { name: "Consulting", quantity: 100, unitMinor: 10_000, vatRate: 0 }
    ]);
    expect(totals).toEqual({ netMinor: 10_000, vat: [], totalMinor: 10_000 });
  });

  it("tell a payable invoice: lines, a total above zero and within the largest amount", () => {
    expect(isPayable(LINES, 2)).toBe(true);
    expect(isPayable([], 2)).toBe(false);
    expect(isPayable([{ ...LINES[0]!, unitMinor: 0 }], 2)).toBe(false);
    expect(isPayable([{ ...LINES[0]!, name: " " }], 2)).toBe(false);
    expect(isPayable([{ ...LINES[0]!, quantity: 0 }], 2)).toBe(false);
    expect(isPayable([{ ...LINES[0]!, vatRate: 10_001 }], 2)).toBe(false);
    // 99 999.99 at most, VAT included.
    const largest = { name: "Machine", quantity: 100, unitMinor: 9_999_999, vatRate: 0 };
    expect(isPayable([largest], 2)).toBe(true);
    expect(isPayable([{ ...largest, vatRate: 1 }], 2)).toBe(false);
    expect(
      isPayable(
        Array.from({ length: MAX_INVOICE_LINES + 1 }, () => LINES[2]!),
        2
      )
    ).toBe(false);
  });

  it("read what the merchant types, comma or dot, never more decimals than allowed", () => {
    expect(parseQuantity("24")).toBe(2400);
    expect(parseQuantity("1,5")).toBe(150);
    expect(parseQuantity("1.25")).toBe(125);
    expect(parseQuantity("1 000")).toBe(100_000);
    expect(parseQuantity("0")).toBeNull();
    expect(parseQuantity("1,234")).toBeNull();
    expect(parseQuantity("-1")).toBeNull();
    expect(parseQuantity("")).toBeNull();
    expect(parseQuantity("100000")).toBeNull();
    expect(parseVatRate("8,1")).toBe(810);
    expect(parseVatRate("8,1 %")).toBe(810);
    expect(parseVatRate("2.6")).toBe(260);
    expect(parseVatRate("0")).toBe(0);
    expect(parseVatRate("100")).toBe(10_000);
    expect(parseVatRate("100,01")).toBeNull();
    expect(parseVatRate("abc")).toBeNull();
    expect(parseScaled(",", 2, 100)).toBeNull();
  });

  it("convert a price of another currency at the points of one hour, rounded up", () => {
    // 4.80 EUR at 90 000 EUR/BTC and 84 000 CHF/BTC: 4.48 CHF exactly.
    expect(convertPrice({ minor: 480, digits: 2, rate: 90_000 }, { digits: 2, rate: 84_000 })).toBe(
      448
    );
    // 1.00 EUR → 0.9333… CHF: 0.94.
    expect(convertPrice({ minor: 100, digits: 2, rate: 90_000 }, { digits: 2, rate: 84_000 })).toBe(
      94
    );
    // To a currency without minor unit: 500 JPY at 15 000 000 JPY/BTC, to 2 decimals.
    expect(
      convertPrice({ minor: 500, digits: 0, rate: 15_000_000 }, { digits: 2, rate: 90_000.5 })
    ).toBe(301);
    expect(() =>
      convertPrice({ minor: -1, digits: 2, rate: 90_000 }, { digits: 2, rate: 84_000 })
    ).toThrow();
  });

  it("leave the client's reference out of a copy, which has no field for it; a draft keeps it", () => {
    const ordered = invoice({ recipient: { ...invoice().recipient, reference: "PO-2026-118" } });
    expect(wizardStateOf(ordered, "fr-CH", true).recipient).toEqual({
      ...ordered.recipient,
      reference: ""
    });
    expect(wizardStateOf(ordered, "fr-CH").recipient.reference).toBe("PO-2026-118");
  });

  it("start a line with the standard rate of the account's country", () => {
    expect(standardVatRate("CH")).toBe(810);
    expect(standardVatRate("fi")).toBe(2550);
    expect(standardVatRate("US")).toBe(0);
    expect(standardVatRate(null)).toBe(0);
  });
});

describe("invoice keys", () => {
  it("derive from the team's root under their own info strings: never change them", () => {
    const derive = (info: string) =>
      hkdf(sha256, team.root, utf8ToBytes("sattle.me/team"), utf8ToBytes(info), 32);
    expect(keys.encryptionKey).toEqual(derive("invoices/encryption-key/v1"));
    expect(keys.addressKey).toEqual(derive("invoices/address-key/v1"));
    expect(keys.nostr.secretKey).toEqual(derive("invoices/author/v1"));
    expect(keys.nostr.publicKey).toBe(
      bytesToHex(schnorr.getPublicKey(derive("invoices/author/v1")))
    );
    // Test vectors: the addresses of an invoice and of the counter.
    expect(invoiceAddress(keys, "0".repeat(32))).toBe(
      bytesToHex(
        // HMAC-SHA256 of the id under the address key.
        jest
          .requireActual<typeof import("@noble/hashes/hmac.js")>("@noble/hashes/hmac.js")
          .hmac(sha256, derive("invoices/address-key/v1"), utf8ToBytes(`invoice/${"0".repeat(32)}`))
      )
    );
  });

  it("are refused once the account closes", () => {
    const closing = deriveTeamKeys(encodeWalletSecret({ mnemonic: MNEMONIC }));
    wipeTeamKeys(closing);
    expect(() => deriveInvoiceKeys(closing)).toThrow();
  });
});

describe("invoice records", () => {
  it("number an invoice by its year and its rank", () => {
    expect(formatInvoiceNumber({ year: 2026, sequence: 42 })).toBe("2026-0042");
    expect(formatInvoiceNumber({ year: 2027, sequence: 12_345 })).toBe("2027-12345");
  });

  it("read a draft half typed, and a sent invoice only whole", () => {
    expect(parseInvoice(invoice())).toEqual(invoice({ id: expect.any(String) }));
    const empty = invoice({
      recipient: { name: "", street: "", postalCode: "", city: "", country: "CH", reference: "" },
      lines: [{ name: "", quantity: 100, unitMinor: 0, vatRate: 810 }],
      dueDate: null,
      dueAt: null
    });
    expect(parseInvoice(empty)).not.toBeNull();
    const sent = invoice({ status: "sent", sent: { at: NOW, link: LINK } });
    expect(parseInvoice(sent)).toEqual(sent);
    expect(parseInvoice({ ...sent, sent: null })).toBeNull();
    expect(parseInvoice({ ...empty, status: "sent", sent: { at: NOW, link: LINK } })).toBeNull();
    expect(parseInvoice({ ...sent, dueAt: NOW })).toBeNull();
    expect(parseInvoice({ ...sent, lines: [] })).toBeNull();
    expect(
      parseInvoice({ ...sent, sent: { at: NOW, link: { ...LINK, url: "http://x" } } })
    ).toBeNull();
    expect(parseInvoice({ ...sent, sent: { at: NOW, link: { ...LINK, key: "zz" } } })).toBeNull();
    // A draft names no link.
    expect(parseInvoice({ ...invoice(), sent: { at: NOW, link: LINK } })).toBeNull();
  });

  it("refuse anything else malformed", () => {
    const base = invoice();
    expect(parseInvoice({ ...base, id: "x" })).toBeNull();
    expect(parseInvoice({ ...base, status: "paid" })).toBeNull();
    expect(parseInvoice({ ...base, number: { year: 2026, sequence: 0 } })).toBeNull();
    expect(parseInvoice({ ...base, currency: { code: "chf", digits: 2 } })).toBeNull();
    expect(parseInvoice({ ...base, dueDate: "2026-02-30" })).toBeNull();
    expect(parseInvoice({ ...base, dueAt: null })).toBeNull();
    expect(parseInvoice({ ...base, redirectUrl: "http://example.ch" })).toBeNull();
    expect(parseInvoice({ ...base, redirectUrl: "https://example.ch/thanks" })).not.toBeNull();
    expect(
      parseInvoice({ ...base, recipient: { ...base.recipient, country: "Switzerland" } })
    ).toBeNull();
    expect(parseInvoice({ ...base, lines: [{ ...LINES[0]!, quantity: 1.5 }] })).toBeNull();
    expect(parseInvoice({ ...base, updatedAt: NOW - 1 })).toBeNull();
    expect(parseInvoice({ ...base, terms: "x".repeat(1001) })).toBeNull();
    expect(() => parseInvoice({ ...base, version: 2 })).toThrow(NewerRecordError);
    const removal = { version: 1, id: base.id, removed: true, updatedAt: NOW };
    expect(parseInvoiceEntry(removal)).toEqual(removal);
    expect(parseInvoiceEntry({ ...removal, removed: false })).toBeNull();
  });

  it("tell a calendar date that exists", () => {
    expect(isCalendarDate("2028-02-29")).toBe(true);
    expect(isCalendarDate("2026-02-29")).toBe(false);
    expect(isCalendarDate("2026-13-01")).toBe(false);
    expect(isCalendarDate("26-01-01")).toBe(false);
  });

  it("go to the relays sealed and come back, the newest version of each, drafts removed left out", async () => {
    const first = invoice({ createdAt: NOW, updatedAt: NOW });
    const changed = { ...first, terms: "Net 10 days", updatedAt: NOW + 5 };
    const other = invoice({ createdAt: NOW + 10, updatedAt: NOW + 10 });
    await publishInvoice(invoiceEvent(keys, first), call);
    await publishInvoice(invoiceEvent(keys, changed), call);
    await publishInvoice(invoiceEvent(keys, other), call);
    // The counter, by the same author, is not an invoice.
    await publishToRelays(counterEvent(keys, { version: 1, year: 2026, last: 3 }, NOW), call);
    let read = await fetchInvoices(keys, call);
    expect(read.invoices).toEqual([other, changed]);
    expect(read.answered).toBe(DEFAULT_RELAYS.length);
    // Nothing a relay sees tells what it is.
    const [event] = relays.stored
      .get(DEFAULT_RELAYS[0]!)!
      .filter((stored) => stored.created_at === NOW + 10);
    expect(event!.content).not.toContain("Coffee");
    expect(event!.tags).toEqual([["d", invoiceAddress(keys, other.id)]]);

    await publishInvoice(
      invoiceEvent(keys, { version: 1, id: other.id, removed: true, updatedAt: NOW + 20 }),
      call
    );
    read = await fetchInvoices(keys, call);
    expect(read.invoices).toEqual([changed]);
  });

  it("never take a record at another invoice's address, nor another author's", async () => {
    const real = invoice();
    const forged = sealRecord({
      type: "invoice",
      value: invoice({ id: newInvoiceId() }),
      signer: keys.nostr.secretKey,
      encryptionKey: keys.encryptionKey,
      // The address of another invoice: refused.
      address: invoiceAddress(keys, real.id),
      createdAt: NOW
    });
    await publishToRelays(forged, call);
    const otherTeam = deriveTeamKeys(
      encodeWalletSecret({
        mnemonic: "legal winner thank year wave sausage worth useful legal winner thank yellow"
      })
    );
    const otherKeys = deriveInvoiceKeys(otherTeam);
    await publishInvoice(invoiceEvent(otherKeys, invoice()), {
      ...call,
      authKey: otherKeys.nostr.secretKey
    });
    expect((await fetchInvoices(keys, call)).invoices).toEqual([]);
  });

  it("leave out an invoice a newer app changed since, and say so", async () => {
    const saved = invoice();
    await publishInvoice(invoiceEvent(keys, saved), call);
    const newer = sealRecord({
      type: "invoice",
      value: { ...saved, version: 2 },
      signer: keys.nostr.secretKey,
      encryptionKey: keys.encryptionKey,
      address: invoiceAddress(keys, saved.id),
      createdAt: NOW + 1
    });
    await publishToRelays(newer, call);
    expect(await fetchInvoices(keys, call)).toMatchObject({ invoices: [], newerUnreadable: true });
  });
});

describe("invoice numbers", () => {
  it("follow the counter, start again each year, and stay above the invoices saved", () => {
    expect(nextNumber(null, 2026)).toEqual({ year: 2026, sequence: 1 });
    expect(nextNumber({ version: 1, year: 2026, last: 41 }, 2026)).toEqual({
      year: 2026,
      sequence: 42
    });
    expect(nextNumber({ version: 1, year: 2026, last: 41 }, 2027)).toEqual({
      year: 2027,
      sequence: 1
    });
    const saved = [
      { year: 2026, sequence: 50 },
      { year: 2025, sequence: 90 }
    ];
    expect(nextNumber({ version: 1, year: 2026, last: 41 }, 2026, saved)).toEqual({
      year: 2026,
      sequence: 51
    });
  });

  it("are taken from a majority of the relays, the counter saved there before use", async () => {
    expect(await takeInvoiceNumber(keys, call, 2026, NOW)).toEqual({ year: 2026, sequence: 1 });
    expect(await takeInvoiceNumber(keys, call, 2026, NOW)).toEqual({ year: 2026, sequence: 2 });
    // Another device reading a majority finds it, even with two relays that never had it.
    relays.stored.delete(DEFAULT_RELAYS[0]!);
    relays.stored.delete(DEFAULT_RELAYS[1]!);
    expect(await takeInvoiceNumber(keys, call, 2026, NOW)).toEqual({ year: 2026, sequence: 3 });
    expect(await takeInvoiceNumber(keys, call, 2027, NOW + 100)).toEqual({
      year: 2027,
      sequence: 1
    });
  });

  it("are never given when too few relays answer or take the counter", async () => {
    for (const relay of DEFAULT_RELAYS.slice(0, 3)) relays.unreachable.add(relay);
    await expect(takeInvoiceNumber(keys, call, 2026, NOW)).rejects.toThrow(InvoiceCounterError);
    relays.unreachable.clear();
    for (const relay of DEFAULT_RELAYS.slice(0, 3)) relays.readOnly.add(relay);
    await expect(takeInvoiceNumber(keys, call, 2026, NOW)).rejects.toThrow(InvoiceCounterError);
  });

  it("are never given over a counter a newer app wrote", async () => {
    const newer = sealRecord({
      type: "invoice-counter",
      value: { version: 2, year: 2026, last: 7 },
      signer: keys.nostr.secretKey,
      encryptionKey: keys.encryptionKey,
      address: jest
        .requireActual<typeof import("@/lib/invoice/counter")>("@/lib/invoice/counter")
        .counterAddress(keys),
      createdAt: NOW
    });
    await publishToRelays(newer, call);
    await expect(takeInvoiceNumber(keys, call, 2026, NOW)).rejects.toThrow(InvoiceCounterError);
  });
});

describe("invoices in Wallet", () => {
  const row = (id: string, timestamp: number, linkId: string | null): ActivityItem => ({
    id,
    source: "link",
    timestamp,
    note: "",
    fiat: { minor: 32_051, digits: 2, currency: "CHF" },
    sats: null,
    state: "open",
    rest: null,
    by: { kind: "you" },
    payments: [],
    link: linkId
      ? { id: linkId, endsAt: NOW + 86_400, key: new Uint8Array(32), relays: DEFAULT_RELAYS }
      : null
  });

  it('titles the link row of a sent invoice, adds each draft as "Draft", newest first', () => {
    const sent = invoice({
      status: "sent",
      number: { year: 2026, sequence: 41 },
      sent: { at: NOW, link: LINK }
    });
    const draft = invoice({ updatedAt: NOW + 50 });
    const items = withInvoices(
      [row("sale", NOW + 100, null), row(LINK.id, NOW, LINK.id)],
      [sent, draft]
    );
    expect(items.map((item) => item.id)).toEqual(["sale", `invoice:${draft.id}`, LINK.id]);
    expect(items[0]!.invoice).toBeUndefined();
    expect(items[1]).toMatchObject({
      state: "draft",
      by: { kind: "you" },
      link: null,
      // What it asks: its total, VAT included.
      fiat: { minor: 31_951, digits: 2, currency: "CHF" },
      invoice: { id: draft.id, number: "2026-0042", status: "draft" }
    });
    expect(items[2]).toMatchObject({
      state: "open",
      invoice: { id: sent.id, number: "2026-0041", recipient: "Bastion Coffee LLC" }
    });
  });

  it("gives no amount to a draft whose lines add up to nothing yet", () => {
    const [item] = withInvoices([], [invoice({ lines: [] })]);
    expect(item!.fiat).toBeNull();
  });

  it("lists the links of the invoices sent, whatever their age", () => {
    const sent = invoice({ status: "sent", sent: { at: NOW - 400 * 86_400, link: LINK } });
    expect(sentLinks([sent, invoice()])).toEqual([
      { id: LINK.id, key: LINK.key, createdAt: NOW - 400 * 86_400, relays: LINK.relays }
    ]);
  });
});
