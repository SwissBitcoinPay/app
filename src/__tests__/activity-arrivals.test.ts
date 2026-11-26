import {
  ARRIVAL_RECENT_SECONDS,
  continuityKeys,
  firstArrivals,
  nextArrivals
} from "@/features/activity/arrivals";
import type { ActivityItem } from "@/features/activity/model";
import type { WalletPayment } from "@/lib/breez/types";

const NOW = 1_780_000_000;

function row(id: string, over: Partial<ActivityItem> = {}): ActivityItem {
  return {
    id,
    source: "pos",
    timestamp: NOW - 60,
    note: "",
    fiat: null,
    sats: null,
    state: null,
    rest: null,
    by: null,
    payments: [],
    link: null,
    ...over
  };
}

function payment(over: Partial<WalletPayment> & { id: string }): WalletPayment {
  return {
    direction: "receive",
    status: "completed",
    amountSats: 1000n,
    feeSats: 0n,
    timestamp: NOW - 30,
    network: "lightning",
    ...over
  };
}

const hash = (n: number) => n.toString(16).padStart(64, "0");

describe("arrivals", () => {
  it("never makes the first list's rows arrive", () => {
    const first = firstArrivals([row("a"), row("b")]);
    expect(first.arriving.size).toBe(0);
    expect(first.held.size).toBe(0);
  });

  it("makes a new recent row arrive, once", () => {
    const first = firstArrivals([row("a", { timestamp: NOW - 600 })]);
    const next = nextArrivals(first, [row("b"), row("a", { timestamp: NOW - 600 })], false, NOW);
    expect([...next.arriving]).toEqual(["b"]);
    // The next list, the same rows (another read): nothing arrives again.
    const again = nextArrivals(next, [row("b"), row("a", { timestamp: NOW - 600 })], false, NOW);
    expect(again.arriving.size).toBe(0);
  });

  it("makes a row arrive in a list that had none", () => {
    const next = nextArrivals(firstArrivals([]), [row("a")], false, NOW);
    expect([...next.arriving]).toEqual(["a"]);
  });

  it('never makes arrive an older row: "Show more", a read come late, the v2 history', () => {
    const first = firstArrivals([row("a", { timestamp: NOW - 120 })]);
    const next = nextArrivals(
      first,
      [
        row("a", { timestamp: NOW - 120 }),
        // Older than the list ("Show more"), though of the last minutes.
        row("older", { timestamp: NOW - 180 }),
        // Older than a few minutes.
        row("late", { timestamp: NOW - ARRIVAL_RECENT_SECONDS - 1 }),
        // The history copied from the v2 account.
        row("legacy:1", { imported: { kind: "sale", rate: null } })
      ],
      false,
      NOW
    );
    expect(next.arriving.size).toBe(0);
    // A row seen once never arrives later.
    const later = nextArrivals(next, [row("x"), row("older", { timestamp: NOW })], false, NOW);
    expect([...later.arriving]).toEqual(["x"]);
  });

  it("never makes arrive a row already there under another identity", () => {
    const paymentHash = hash(1);
    const first = firstArrivals([
      // An open sale of the point of sale, its invoice's hash its id.
      row(`sale:${paymentHash}`, { state: "open" }),
      // A draft of "New invoice".
      row("invoice:inv1", {
        state: "draft",
        invoice: { id: "inv1", number: "2026-0001", recipient: "", status: "draft", dueDate: null }
      }),
      // A sale shown with its address alone.
      row("sale-onchain:author1:1779990000", { state: "open" }),
      // An integration's deposit not credited yet.
      row("sale:order", {
        payments: [payment({ id: "deposit:tx1:0", network: "bitcoin", txId: "AB12" })]
      })
    ]);
    const next = nextArrivals(
      first,
      [
        // Paid: its declared sale's row, its payment naming the invoice's hash.
        row("sale:declared", { payments: [payment({ id: "p1", paymentHash })] }),
        // Sent: its link's row.
        row("link:l1", {
          link: { id: "l1", endsAt: NOW + 600, key: new Uint8Array(32), relays: [] },
          invoice: { id: "inv1", number: "2026-0001", recipient: "", status: "sent", dueDate: null }
        }),
        // Paid on-chain: its sale's row.
        row("sale:author1"),
        // Credited: the wallet's payment of the same transaction.
        row("payment:p2", { payments: [payment({ id: "p2", network: "bitcoin", txId: "ab12" })] })
      ],
      false,
      NOW
    );
    expect(next.arriving.size).toBe(0);
  });

  it("keeps out of the list what arrives while its top is out of sight, then brings it in", () => {
    const first = firstArrivals([row("a", { timestamp: NOW - 300 })]);
    const held = nextArrivals(first, [row("b"), row("a", { timestamp: NOW - 300 })], true, NOW);
    expect([...held.held]).toEqual(["b"]);
    expect(held.arriving.size).toBe(0);
    // Another arrives meanwhile: both wait.
    const more = nextArrivals(
      held,
      [row("c"), row("b"), row("a", { timestamp: NOW - 300 })],
      true,
      NOW
    );
    expect([...more.held].sort()).toEqual(["b", "c"]);
    // The list's top shows again: they arrive.
    const back = nextArrivals(
      more,
      [row("c"), row("b"), row("a", { timestamp: NOW - 300 })],
      false,
      NOW
    );
    expect(back.held.size).toBe(0);
    expect([...back.arriving].sort()).toEqual(["b", "c"]);
  });

  it("keeps out a held row that changed identity meanwhile (paid), and drops one gone", () => {
    const paymentHash = hash(2);
    const first = firstArrivals([row("a", { timestamp: NOW - 300 })]);
    const held = nextArrivals(
      first,
      [row(`sale:${paymentHash}`, { state: "open" }), row("gone"), row("a")],
      true,
      NOW
    );
    expect([...held.held].sort()).toEqual(["gone", `sale:${paymentHash}`]);
    const paid = nextArrivals(
      held,
      [row("sale:declared", { payments: [payment({ id: "p1", paymentHash })] }), row("a")],
      true,
      NOW
    );
    expect([...paid.held]).toEqual(["sale:declared"]);
  });

  it("tells a movement by its id, its payments, its link and its invoice", () => {
    expect(
      continuityKeys(
        row("sale:x", {
          payments: [
            payment({ id: "p1", paymentHash: hash(3) }),
            payment({ id: "p2", network: "bitcoin", txId: "CD34" })
          ]
        })
      )
    ).toEqual(["sale:x", "payment:p1", `sale:${hash(3)}`, "payment:p2", "tx:cd34"]);
  });
});
