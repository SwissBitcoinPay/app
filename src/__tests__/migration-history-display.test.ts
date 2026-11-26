import { paidRate } from "@/features/activity/format";
import {
  legacyHistoryItem,
  legacyHistoryItems,
  listWindow
} from "@/features/activity/legacy-history";
import type { ActivityItem } from "@/features/activity/model";
import { exportRows, rowValue } from "@/features/wallet/export/rows";
import { legacyRowRef, type LegacyHistoryRow } from "@/lib/legacy-v2/history";

/*
 * The rows copied from the v2 account among "Wallet"'s movements and in its exports
 * (legacy-history.ts): as the account's own, without a word of
 * where they come from, for information only (no payment of the wallet), their amount asked or
 * their sats at the v2 server's price of then, never today's.
 */

const AT = 1_791_033_030;

function row(n: number, fields: Partial<LegacyHistoryRow> = {}): LegacyHistoryRow {
  return {
    ref: legacyRowRef(`id-${n}`),
    kind: "sale",
    channel: "pos",
    at: AT + n,
    sats: 25_000n,
    fiat: { minor: 1250, digits: 2, currency: "CHF" },
    note: "Croissants",
    rate: { price: 60_000, currency: "CHF" },
    ...fields
  };
}

describe("a row copied from the v2 account", () => {
  it("shows as the account's own: a sale by where it was made, a payout sent, a fee received", () => {
    expect(legacyHistoryItem(row(1))).toMatchObject({
      id: `legacy:${legacyRowRef("id-1")}`,
      source: "pos",
      timestamp: AT + 1,
      note: "Croissants",
      fiat: { minor: 1250, digits: 2, currency: "CHF" },
      sats: 25_000n,
      state: null,
      by: null,
      payments: [],
      imported: { kind: "sale" }
    });
    expect(legacyHistoryItem(row(2, { channel: "link" })).source).toBe("link");
    expect(legacyHistoryItem(row(3, { channel: "integration" })).source).toBe("integration");
    expect(legacyHistoryItem(row(4, { kind: "withdraw", channel: null })).source).toBe("send");
    expect(legacyHistoryItem(row(5, { kind: "referral", channel: null })).source).toBe("receive");
    // Money the v2 server received itself (a deposit): a reception, never a sale.
    expect(legacyHistoryItem(row(6, { kind: "receipt", channel: null }))).toMatchObject({
      source: "receive",
      imported: { kind: "receipt" }
    });
  });

  it("is worth its sats at the v2 server's price of then, none without one", () => {
    const payout = legacyHistoryItem(row(1, { kind: "withdraw", channel: null, fiat: null }));
    // The v2 server's price of then, never one of the wallet's own payments' (it has none).
    const own = new Map([
      [`legacy:${legacyRowRef("id-1")}`, { ...payout.imported!.rate!, rate: 1 }]
    ]);
    expect(paidRate(payout, own)).toEqual(payout.imported!.rate);
    expect(paidRate(payout, own)).toMatchObject({ rate: 60_000, currency: "CHF" });
    expect(paidRate(legacyHistoryItem(row(2, { fiat: null, rate: null })), own)).toBeNull();
  });
});

describe('in "Wallet"\'s list', () => {
  /** A row of the account's own (a payment of the wallet), at `at`. */
  function own(id: string, at: number): ActivityItem {
    return { ...legacyHistoryItem(row(0)), id, timestamp: at, imported: undefined };
  }
  const ids = (items: readonly ActivityItem[]) => items.map(({ id }) => id);

  it('lists about `limit` movements, the newest, the copied ones among them, "Show more" for the rest', () => {
    const legacy = legacyHistoryItems(Array.from({ length: 120 }, (_, n) => row(n)));
    const mine = own("own", AT + 10_000);
    // The wallet's payments all listed (none older): from 0.
    const first = listWindow({
      items: [mine],
      legacy,
      walletFrom: 0,
      limit: 100,
      walletMore: false
    });
    expect(first.items).toHaveLength(100);
    expect(first.items[0]!.id).toBe("own");
    // The newest of the copied ones, down to the 99th.
    expect(first.items[1]!.timestamp).toBe(AT + 119);
    expect(first.items[99]!.timestamp).toBe(AT + 21);
    // Every movement from the last one listed: its days' nets count from there.
    expect(first.listedFrom).toBe(AT + 21);
    expect(first.more).toBe(true);

    // "Show more": 100 more asked, all of them there.
    const next = listWindow({
      items: [mine],
      legacy,
      walletFrom: 0,
      limit: 200,
      walletMore: false
    });
    expect(next.items).toHaveLength(121);
    expect(next.items[120]!.timestamp).toBe(AT);
    expect(next.listedFrom).toBe(0);
    expect(next.more).toBe(false);
  });

  it("never lists a copied row below the wallet's payments it did not read", () => {
    // 100 payments of the wallet read, older ones left: every movement only from its oldest read.
    const mine = Array.from({ length: 100 }, (_, n) => own(`own-${n}`, AT + 5_000 + n));
    const legacy = legacyHistoryItems([row(1), row(2)]);
    const window = listWindow({
      items: mine,
      legacy,
      walletFrom: AT + 5_001,
      limit: 100,
      walletMore: true
    });
    // The copied rows are older than payments not read yet: shown only once those are.
    expect(ids(window.items)).toEqual(ids([...mine].reverse()));
    expect(window.listedFrom).toBe(AT + 5_001);
    expect(window.more).toBe(true);
  });

  it("keeps the rows of the second it stops at together, and what awaits something whatever its age", () => {
    const legacy = legacyHistoryItems([
      row(1),
      row(2),
      // Two of the same second.
      { ...row(3), ref: legacyRowRef("id-3b") },
      row(3),
      row(4)
    ]);
    // A draft of long ago ("To follow up"), and a paid invoice of long ago.
    const draft = { ...own("draft", AT - 2_000_000), state: "draft" } as ActivityItem;
    const paid = own("paid", AT - 1_000_000);
    const window = listWindow({
      items: [draft, paid],
      legacy,
      walletFrom: 0,
      limit: 2,
      walletMore: false
    });
    expect(window.items.map(({ timestamp }) => timestamp)).toEqual([
      AT + 4,
      AT + 3,
      AT + 3,
      AT - 2_000_000
    ]);
    expect(ids(window.items)).toContain("draft");
    expect(window.listedFrom).toBe(AT + 3);
    expect(window.more).toBe(true);
  });

  it("never lists an own row below a copied one left out (v2 and v3 used at once)", () => {
    // The wallet's payments interleaved with the copied rows, all of them read.
    const mine = Array.from({ length: 4 }, (_, n) => own(`own-${n}`, AT + 2 * n + 1));
    const legacy = legacyHistoryItems(Array.from({ length: 4 }, (_, n) => row(2 * n)));
    const window = listWindow({ items: mine, legacy, walletFrom: 0, limit: 4, walletMore: false });
    // The 4 newest, whatever their origin: nothing older, neither own nor copied.
    expect(window.items.map(({ timestamp }) => timestamp)).toEqual([
      AT + 7,
      AT + 6,
      AT + 5,
      AT + 4
    ]);
    expect(window.listedFrom).toBe(AT + 4);
    expect(window.more).toBe(true);
    // "Show more": all of them.
    const all = listWindow({ items: mine, legacy, walletFrom: 0, limit: 8, walletMore: false });
    expect(all.items).toHaveLength(8);
    expect(all.more).toBe(false);
  });

  it("tells the wallet's older payments, without any copied row", () => {
    const mine = own("own", AT);
    expect(
      listWindow({ items: [mine], legacy: [], walletFrom: AT, limit: 100, walletMore: true })
    ).toEqual({ items: [mine], listedFrom: AT, more: true });
    expect(
      listWindow({ items: [mine], legacy: [], walletFrom: 0, limit: 100, walletMore: false })
    ).toEqual({ items: [mine], listedFrom: 0, more: false });
  });
});

describe("in the exports", () => {
  const range = { start: AT - 86_400, end: AT + 86_400 };

  it("is a line, without a payment of the wallet, a payout signed negative", () => {
    const items = legacyHistoryItems([
      row(1),
      row(2, { kind: "withdraw", channel: null, fiat: null, sats: 40_000n }),
      row(3, { kind: "receipt", channel: null, fiat: null, sats: 5_000n })
    ]);
    const lines = exportRows(items, range);
    expect(lines.map(({ kind, sats, feeSats }) => ({ kind, sats, feeSats }))).toEqual([
      { kind: "paid", sats: 25_000n, feeSats: null },
      // No fee told by the v2 server: none, never "0".
      { kind: "sent", sats: -40_000n, feeSats: null },
      { kind: "received", sats: 5_000n, feeSats: null }
    ]);
  });

  it("is worth the amount asked, else its sats at the v2 server's price of then", () => {
    const [sale, payout] = exportRows(
      legacyHistoryItems([
        row(1),
        row(2, { kind: "withdraw", channel: null, fiat: null, sats: 40_000n })
      ]),
      range
    );
    expect(rowValue(sale!, new Map())).toMatchObject({
      minor: 1250n,
      currency: "CHF",
      own: true,
      rate: { rate: 60_000, currency: "CHF" }
    });
    // 40,000 sats at 60,000 CHF: −24.00 CHF; never a rate of the wallet's own payments.
    expect(rowValue(payout!, new Map())).toMatchObject({
      minor: -2400n,
      currency: "CHF",
      own: false
    });
  });
});
