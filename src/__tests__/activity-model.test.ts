import { DEFAULT_RELAYS } from "@/config/relays";
import { REMOVED_SEAT_GRACE_SECONDS } from "@/config/team";
import {
  followUpAmount,
  followUpsOf,
  linksAwaitingFinal,
  memberActivity,
  nextEnd,
  ownerActivity,
  removedKey,
  type DeclaredSale,
  type LinkInfo,
  type RecordedSale
} from "@/features/activity/model";
import type { PendingDeposit, WalletPayment } from "@/lib/breez/types";
import type { MtpSaleRecord } from "@/lib/mtpelerin/sale-record";
import { splitFiat } from "@/lib/terminal/amount";

const NOW = 1_780_000_000;
const CHF = (minor: number) => ({ minor, digits: 2, currency: "CHF" });
const hash = (n: number) => n.toString(16).padStart(64, "0");
const ERIN = { kind: "member", id: "m1", name: "Erin Grant" } as const;

function payment(over: Partial<WalletPayment> & { id: string }): WalletPayment {
  return {
    direction: "receive",
    status: "completed",
    amountSats: 1000n,
    feeSats: 0n,
    timestamp: NOW - 100,
    network: "lightning",
    ...over
  };
}

function link(over: Partial<LinkInfo> & { id: string }): LinkInfo {
  return {
    saleAuthor: `sale-${over.id}`,
    key: new Uint8Array(32),
    relays: DEFAULT_RELAYS,
    createdAt: NOW - 3600,
    fiat: CHF(25000),
    note: "Bastion Coffee",
    endsAt: NOW + 3600,
    final: null,
    by: ERIN,
    ...over
  };
}

describe("ownerActivity", () => {
  it("makes one row of a sale's payments, with its fiat amount, note and employee", () => {
    const sale: DeclaredSale = { author: "s1", fiat: CHF(1746), note: "Table 12" };
    const declarations = new Map([
      [hash(1), [sale]],
      [hash(2), [sale]]
    ]);
    const sales: RecordedSale[] = [
      {
        paymentHash: hash(2),
        fiat: CHF(1746),
        note: "Table 12",
        sats: 600n,
        createdAt: NOW - 500,
        expiresAt: NOW - 100,
        paidAt: NOW - 200,
        sale: "s1",
        underpaid: null,
        by: ERIN
      }
    ];
    const items = ownerActivity({
      payments: [
        payment({ id: "p1", paymentHash: hash(1), amountSats: 1200n, timestamp: NOW - 100 }),
        payment({ id: "p2", paymentHash: hash(2), amountSats: 600n, timestamp: NOW - 200 })
      ],
      declarations,
      links: [],
      sales,
      now: NOW
    });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: "sale:s1",
      source: "pos",
      sats: 1800n,
      fiat: CHF(1746),
      note: "Table 12",
      by: ERIN,
      timestamp: NOW - 100,
      state: null
    });
  });

  it("shows as the wallet has them a declared sale nobody vouches for, and the rest", () => {
    const items = ownerActivity({
      payments: [
        payment({ id: "p1", paymentHash: hash(1) }),
        payment({ id: "p2", direction: "send", amountSats: 5000n, timestamp: NOW - 50 }),
        payment({
          id: "p3",
          network: "bitcoin",
          status: "pending",
          txId: "aa",
          timestamp: NOW - 10
        })
      ],
      declarations: new Map([[hash(1), [{ author: "s1", fiat: CHF(600), note: "" }]]]),
      links: [],
      sales: [],
      now: NOW
    });
    expect(items.map((item) => [item.id, item.source, item.state, item.by, item.fiat])).toEqual([
      ["payment:p3", "receive", "unconfirmed", null, null],
      ["payment:p2", "send", null, null, null],
      // No record holds it, no mark names anyone: its declaration's amount
      // and note are anyone's claim, never shown.
      ["payment:p1", "receive", null, null, null]
    ]);
  });

  describe("a declared sale someone vouches for", () => {
    const ACME = { kind: "integration", id: "i1", name: "Shop" } as const;
    const REMOVED_AT = NOW - 10_000;
    const rows = (taker: DeclaredSale["taker"], paidAt = NOW - 100) =>
      ownerActivity({
        payments: [payment({ id: "p1", paymentHash: hash(1), timestamp: paidAt })],
        declarations: new Map([
          [hash(1), [{ author: "s1", fiat: CHF(600), note: "CMD-1", taker }]]
        ]),
        links: [],
        sales: [],
        members: new Map([[ERIN.id, ERIN]]),
        integrations: new Map([[ACME.id, ACME]]),
        removed: new Map([
          [
            removedKey("member", "m2"),
            { removedAt: REMOVED_AT, by: { kind: "member", id: "m2", name: "Bob" } }
          ],
          [
            removedKey("integration", "i2"),
            { removedAt: REMOVED_AT, by: { kind: "integration", id: "i2", name: "Former" } }
          ]
        ]),
        now: NOW
      }).map(({ id, source, by, fiat, note }) => ({ id, source, by, fiat, note }));
    const sale = (source: string, by: unknown) => [
      { id: "sale:s1", source, by, fiat: CHF(600), note: "CMD-1" }
    ];
    const wallet = [{ id: "payment:p1", source: "receive", by: null, fiat: null, note: "" }];

    it("is a sale of the owner's devices, of an employee or an integration of the account", () => {
      expect(rows({ kind: "you" })).toEqual(sale("pos", { kind: "you" }));
      expect(rows({ kind: "member", id: ERIN.id })).toEqual(sale("pos", ERIN));
      expect(rows({ kind: "integration", id: ACME.id })).toEqual(sale("integration", ACME));
    });

    it("is a sale of one removed since, by its name, only when paid before its removal", () => {
      const BOB = { kind: "member", id: "m2", name: "Bob" };
      const OLD = { kind: "integration", id: "i2", name: "Former" };
      expect(rows({ kind: "member", id: "m2" }, REMOVED_AT - 3600)).toEqual(sale("pos", BOB));
      expect(rows({ kind: "integration", id: "i2" }, REMOVED_AT)).toEqual(sale("integration", OLD));
      // An invoice shown before the removal, paid within the grace that follows it.
      const last = REMOVED_AT + REMOVED_SEAT_GRACE_SECONDS;
      expect(rows({ kind: "integration", id: "i2" }, last)).toEqual(sale("integration", OLD));
      // Past it, whatever the declaration claims: the wallet's payment.
      expect(rows({ kind: "integration", id: "i2" }, last + 1)).toEqual(wallet);
      expect(rows({ kind: "member", id: "m2" }, last + 1)).toEqual(wallet);
    });

    it("keeps a removed integration's order paid on-chain before its removal, claimed after", () => {
      const OLD = { kind: "integration", id: "i2", name: "Former" };
      const TX = "ef".repeat(32);
      // Claimed by the wallet two days after the removal (once confirmed, the owner offline).
      const onchainRows = (paidAt: number) =>
        ownerActivity({
          payments: [
            payment({
              id: "d1",
              network: "bitcoin",
              txId: TX,
              paymentHash: undefined,
              timestamp: REMOVED_AT + 2 * 86_400
            })
          ],
          declarations: new Map(),
          onchainSales: new Map([
            [
              TX,
              [
                {
                  author: "s1",
                  fiat: CHF(600),
                  note: "CMD-1",
                  taker: { kind: "integration", id: "i2" },
                  paidAt
                }
              ]
            ]
          ]),
          links: [],
          sales: [],
          integrations: new Map([[ACME.id, ACME]]),
          removed: new Map([
            [
              removedKey("integration", "i2"),
              { removedAt: REMOVED_AT, by: { kind: "integration", id: "i2", name: "Former" } }
            ]
          ]),
          now: NOW
        }).map(({ id, source, by, fiat, note }) => ({ id, source, by, fiat, note }));
      // Seen paid by its server before the removal: its sale, by its name and note.
      expect(onchainRows(REMOVED_AT - 600)).toEqual(sale("integration", OLD));
      expect(onchainRows(REMOVED_AT + REMOVED_SEAT_GRACE_SECONDS)).toEqual(
        sale("integration", OLD)
      );
      // Seen paid past the removal's grace: the wallet's deposit.
      expect(onchainRows(REMOVED_AT + REMOVED_SEAT_GRACE_SECONDS + 1)).toEqual([
        { id: "payment:d1", source: "receive", by: null, fiat: null, note: "" }
      ]);
    });

    it("is the wallet's payment when its mark names nobody the owner knows", () => {
      expect(rows(null)).toEqual(wallet);
      expect(rows({ kind: "member", id: "m9" })).toEqual(wallet);
      expect(rows({ kind: "integration", id: "i9" })).toEqual(wallet);
      // A removal never vouches for another kind of seat with the same id.
      expect(rows({ kind: "member", id: "i2" }, REMOVED_AT)).toEqual(wallet);
    });

    it("is a sale when a record of the team holds one of its payments, whatever its mark", () => {
      const items = ownerActivity({
        payments: [
          payment({ id: "p1", paymentHash: hash(1), timestamp: NOW - 100 }),
          payment({ id: "p2", paymentHash: hash(2), timestamp: NOW - 200 })
        ],
        declarations: new Map([
          [hash(1), [{ author: "s1", fiat: CHF(600), note: "Table 3" }]],
          [hash(2), [{ author: "s1", fiat: CHF(600), note: "Table 3" }]]
        ]),
        links: [],
        sales: [
          {
            paymentHash: hash(2),
            fiat: CHF(600),
            note: "Table 3",
            sats: 1000n,
            createdAt: NOW - 400,
            expiresAt: NOW,
            paidAt: NOW - 200,
            sale: "s1",
            underpaid: null,
            by: ERIN
          }
        ],
        now: NOW
      });
      expect(items).toMatchObject([{ id: "sale:s1", sats: 2000n, by: ERIN, note: "Table 3" }]);
    });
  });

  it("counts a payment two sales declared for none of them", () => {
    const items = ownerActivity({
      payments: [payment({ id: "p1", paymentHash: hash(1) })],
      declarations: new Map([
        [
          hash(1),
          [
            { author: "s1", fiat: CHF(600), note: "" },
            { author: "s2", fiat: CHF(600), note: "" }
          ]
        ]
      ]),
      links: [],
      sales: [],
      now: NOW
    });
    expect(items.map((item) => item.id)).toEqual(["payment:p1"]);
  });

  it("shows a link open until its sale's end, then paid once its final version proves it", () => {
    const open = link({ id: "l1" });
    expect(
      ownerActivity({ payments: [], declarations: new Map(), links: [open], sales: [], now: NOW })
    ).toMatchObject([{ id: "link:l1", source: "link", state: "open", sats: null, by: ERIN }]);

    const received = {
      payments: [payment({ id: "p1", paymentHash: hash(1), amountSats: 26375n })],
      declarations: new Map([[hash(1), [{ author: "sale-l1", fiat: CHF(25000), note: "" }]]]),
      sales: [],
      now: NOW
    };
    // A payment of its sale in the wallet, in full or in part: the point of its hour tells, which
    // its final version proves. Not "Paid" before, also once its sale ended.
    expect(ownerActivity({ ...received, links: [open] })).toMatchObject([
      { id: "link:l1", state: "unconfirmed", sats: 26375n }
    ]);
    const ended = link({ id: "l1", endsAt: NOW - 60 });
    expect(ownerActivity({ ...received, links: [ended] })).toMatchObject([
      { id: "link:l1", state: "unconfirmed", sats: 26375n }
    ]);
    const final = {
      status: "paid" as const,
      received: 26375n,
      due: 26375n,
      lightning: [hash(1)],
      transactions: []
    };
    expect(ownerActivity({ ...received, links: [link({ id: "l1", final })] })).toMatchObject([
      { id: "link:l1", state: null, sats: 26375n }
    ]);
  });

  it('tells the links "Confirming" for want of a final version, for the owner to settle', () => {
    const canceled = {
      status: "canceled" as const,
      received: 0n,
      due: null,
      lightning: [],
      transactions: [],
      provisional: true as const
    };
    const paid = {
      status: "paid" as const,
      received: 26375n,
      due: 26375n,
      lightning: [hash(1)],
      transactions: []
    };
    const links = [
      // Paid in the wallet, no final version: the owner's device settles it (finals-wake.ts).
      link({ id: "l1", saleAuthor: "sale-l1" }),
      // Nothing received: open, nothing to settle.
      link({ id: "l2", saleAuthor: "sale-l2" }),
      // Its final version proves it paid.
      link({ id: "l3", saleAuthor: "sale-l3", final: paid }),
      // Canceled, then paid: being judged, its settlement waits for the sale's end (finalize.ts).
      link({ id: "l4", saleAuthor: "sale-l4", final: canceled })
    ];
    const items = ownerActivity({
      payments: [
        payment({ id: "p1", paymentHash: hash(1), amountSats: 26375n }),
        payment({ id: "p3", paymentHash: hash(3), amountSats: 26375n }),
        payment({ id: "p4", paymentHash: hash(4), amountSats: 26375n })
      ],
      declarations: new Map([
        [hash(1), [{ author: "sale-l1", fiat: CHF(25000), note: "" }]],
        [hash(3), [{ author: "sale-l3", fiat: CHF(25000), note: "" }]],
        [hash(4), [{ author: "sale-l4", fiat: CHF(25000), note: "" }]]
      ]),
      links,
      sales: [],
      now: NOW
    });
    expect(Object.fromEntries(items.map((item) => [item.id, item.state]))).toEqual({
      "link:l1": "unconfirmed",
      "link:l2": "open",
      "link:l3": null,
      "link:l4": "unconfirmed"
    });
    expect(linksAwaitingFinal(items, links)).toEqual(["l1"]);
    // A link the list does not know the final version of (not read yet): never asked on a guess.
    expect(linksAwaitingFinal(items, [])).toEqual([]);
  });

  it("never hides a payment of a canceled link: being judged, then as its settlement says", () => {
    const canceled = {
      status: "canceled" as const,
      received: 0n,
      due: null,
      lightning: [],
      transactions: []
    };
    const received = {
      // A Lightning invoice the payer kept in its wallet, paid after the cancellation.
      payments: [payment({ id: "p1", paymentHash: hash(1), amountSats: 26375n })],
      declarations: new Map([[hash(1), [{ author: "sale-l1", fiat: CHF(25000), note: "" }]]]),
      sales: [],
      now: NOW
    };
    // Nothing received: "Canceled", without an amount, as before.
    expect(
      ownerActivity({
        ...received,
        payments: [],
        links: [link({ id: "l1", final: { ...canceled, provisional: true } })]
      })
    ).toMatchObject([{ id: "link:l1", state: "canceled", sats: null }]);
    // Received while the sale's settlement may still replace the cancellation: being judged.
    expect(
      ownerActivity({
        ...received,
        links: [link({ id: "l1", final: { ...canceled, provisional: true } })]
      })
    ).toMatchObject([{ id: "link:l1", state: "unconfirmed", sats: 26375n }]);
    // The cancellation for good (its settlement found nothing): canceled, the amount still shown.
    expect(
      ownerActivity({ ...received, links: [link({ id: "l1", final: canceled })] })
    ).toMatchObject([{ id: "link:l1", state: "canceled", sats: 26375n }]);
    // The owner's settlement, over the cancellation: paid, or underpaid with its rest.
    const settled = (status: "paid" | "underpaid", due: bigint) =>
      link({
        id: "l1",
        final: { status, received: 26375n, due, lightning: [hash(1)], transactions: [] }
      });
    expect(ownerActivity({ ...received, links: [settled("paid", 26375n)] })).toMatchObject([
      { id: "link:l1", state: null, sats: 26375n }
    ]);
    expect(ownerActivity({ ...received, links: [settled("underpaid", 30_000n)] })).toMatchObject([
      { id: "link:l1", state: "underpaid", sats: 26375n, rest: { sats: 3625n } }
    ]);
  });

  it("settles a link from its final version: underpaid with its rest, expired", () => {
    const items = ownerActivity({
      payments: [],
      declarations: new Map(),
      links: [
        link({
          id: "l1",
          endsAt: NOW - 7200,
          final: {
            status: "underpaid",
            received: 19_000n,
            due: 26_000n,
            lightning: [],
            transactions: []
          }
        }),
        link({
          id: "l2",
          createdAt: NOW - 7000,
          endsAt: NOW - 3600,
          final: { status: "expired", received: 0n, due: null, lightning: [], transactions: [] }
        })
      ],
      sales: [],
      now: NOW
    });
    expect(items[0]).toMatchObject({
      id: "link:l1",
      state: "underpaid",
      sats: 19_000n,
      rest: { sats: 7_000n, minor: 25000 - Math.floor((25000 * 19000) / 26000) }
    });
    expect(items[1]).toMatchObject({ id: "link:l2", state: "expired", sats: null });
  });

  it("shows a link the owner canceled as canceled, still payable or not", () => {
    const items = ownerActivity({
      payments: [],
      declarations: new Map(),
      links: [
        link({
          id: "l1",
          endsAt: NOW + 300,
          final: { status: "canceled", received: 0n, due: null, lightning: [], transactions: [] }
        })
      ],
      sales: [],
      now: NOW
    });
    // Never "Open" while its sale lasts: its page no longer offers to pay.
    expect(items).toMatchObject([{ id: "link:l1", state: "canceled", sats: null, rest: null }]);
  });

  it("folds a link's Lightning payment into its row without its declaration, never twice", () => {
    const final = {
      status: "paid" as const,
      received: 26_375n,
      due: 26_375n,
      lightning: [hash(1)],
      transactions: []
    };
    // The registry out of reach (null): only the link's final version names the invoice.
    const items = ownerActivity({
      payments: [payment({ id: "p1", paymentHash: hash(1), amountSats: 26_375n })],
      declarations: null,
      links: [link({ id: "l1", final })],
      sales: [],
      now: NOW
    });
    expect(items).toMatchObject([{ id: "link:l1", state: null, sats: 26_375n }]);
  });

  it("folds a link's on-chain payment into its row, from its final version's transactions", () => {
    const items = ownerActivity({
      payments: [payment({ id: "p1", network: "bitcoin", txId: "tx1", amountSats: 30_000n })],
      declarations: new Map(),
      links: [
        link({
          id: "l1",
          final: {
            status: "paid",
            received: 30_000n,
            due: 30_000n,
            lightning: [],
            transactions: ["tx1"]
          }
        })
      ],
      sales: [],
      now: NOW
    });
    expect(items).toMatchObject([{ id: "link:l1", state: null, sats: 30_000n }]);
  });

  it("keeps a deposit an integration's witness also names to the sale already declared", () => {
    const TX = "cd".repeat(32);
    const integrationSale = [
      {
        author: "integration-sale",
        fiat: CHF(3000),
        note: "Order 7",
        taker: { kind: "integration" as const, id: "i1" }
      }
    ];
    const deposit = payment({
      id: "d1",
      network: "bitcoin",
      txId: TX,
      paymentHash: undefined,
      amountSats: 30_000n
    });
    // A payment link's final version names it: the link's row.
    const byLink = ownerActivity({
      payments: [deposit],
      declarations: new Map(),
      onchainSales: new Map([[TX, integrationSale]]),
      links: [
        link({
          id: "l1",
          final: {
            status: "paid",
            received: 30_000n,
            due: 30_000n,
            lightning: [],
            transactions: [TX]
          }
        })
      ],
      sales: [],
      integrations: new Map([["i1", { kind: "integration", id: "i1", name: "Shop" }]]),
      now: NOW
    });
    expect(byLink.map((item) => item.id)).toEqual(["link:l1"]);
    // A point of sale's record names it (an underpaid sale): the sale's row.
    const bySale = ownerActivity({
      payments: [deposit],
      declarations: new Map(),
      onchainSales: new Map([[TX, integrationSale]]),
      links: [],
      sales: [
        {
          paymentHash: hash(1),
          fiat: CHF(4000),
          note: "",
          sats: 40_000n,
          createdAt: NOW - 600,
          expiresAt: NOW - 60,
          paidAt: null,
          sale: "s1",
          underpaid: { at: NOW - 20, received: 30_000n, due: 40_000n, transactions: [TX] },
          by: null
        }
      ],
      integrations: new Map([["i1", { kind: "integration", id: "i1", name: "Shop" }]]),
      now: NOW
    });
    expect(bySale.map((item) => item.id)).toEqual(["sale:s1"]);
    // Named by nothing else: the integration's sale.
    const alone = ownerActivity({
      payments: [deposit],
      declarations: new Map(),
      onchainSales: new Map([[TX, integrationSale]]),
      links: [],
      sales: [],
      integrations: new Map([["i1", { kind: "integration", id: "i1", name: "Shop" }]]),
      now: NOW
    });
    expect(alone).toMatchObject([{ id: "sale:integration-sale", source: "integration" }]);
  });
});

describe("ownerActivity, funds recovered (funds-recovery.ts)", () => {
  const TX = "ef".repeat(32);
  const deposit = payment({
    id: "d9",
    network: "bitcoin",
    txId: TX.toUpperCase(),
    paymentHash: undefined,
    amountSats: 49_200n,
    feeSats: 300n
  });

  it("are a discreet row of their own, never a sale, with what their recovery cost", () => {
    const rows = ownerActivity({
      payments: [deposit],
      declarations: new Map(),
      // Whatever else names its transaction: the account's own record decides.
      onchainSales: new Map([
        [TX, [{ author: "integration-sale", fiat: CHF(3000), note: "", taker: null }]]
      ]),
      links: [],
      sales: [],
      recovered: new Map([[TX, 50_000n]]),
      now: NOW
    });
    expect(rows).toEqual([
      {
        id: "payment:d9",
        source: "recovered",
        timestamp: deposit.timestamp,
        note: "",
        fiat: null,
        sats: 49_200n,
        state: null,
        rest: null,
        by: null,
        payments: [deposit],
        link: null,
        recovery: { feeSats: 800n }
      }
    ]);
  });

  it("tell no cost a record cannot prove, and leave other deposits as receptions", () => {
    const other = payment({
      id: "d8",
      network: "bitcoin",
      txId: "ab".repeat(32),
      timestamp: NOW - 200
    });
    const rows = ownerActivity({
      payments: [deposit, other],
      declarations: new Map(),
      links: [],
      sales: [],
      recovered: new Map([[TX, 40_000n]]),
      now: NOW
    });
    expect(rows.map(({ source, recovery }) => [source, recovery])).toEqual([
      ["recovered", { feeSats: null }],
      ["receive", undefined]
    ]);
  });
});

describe("ownerActivity, sales to Mt Pelerin (sale-records.ts)", () => {
  const SALE_HASH = hash(77);
  const sent = payment({
    id: "s1",
    direction: "send",
    paymentHash: SALE_HASH,
    amountSats: 2213n,
    feeSats: 10n,
    description: "1.2 CHF for 64a0c0de0000000000000006"
  });
  const sale: MtpSaleRecord = {
    paymentHash: SALE_HASH,
    at: sent.timestamp - 2,
    orderId: "64a0c0de0000000000000006",
    shortId: "X7K2P9",
    sats: 2213n,
    received: { amount: { units: 120n, scale: 2 }, currency: "CHF" },
    rate: { units: 54231n, scale: 8 },
    fees: null,
    transferFeeMinor: 100,
    deferred: false,
    reference: "SALE SATTLE 16-11",
    oid: "o",
    account: { id: "a", iban: "CH9300762011623852957", currency: "CHF", label: null, holder: "J" }
  };
  const rows = (payments: WalletPayment[], mtpSales = new Map([[SALE_HASH, sale]])) =>
    ownerActivity({ payments, declarations: new Map(), links: [], sales: [], mtpSales, now: NOW });

  it("tell the sending that paid one, of its sats exactly", () => {
    const [row] = rows([sent]);
    expect(row).toMatchObject({ id: "payment:s1", source: "send", fiat: null, mtpSale: sale });
  });

  it("never take a reception, another amount, a failed payment, nor a record not read", () => {
    expect(rows([{ ...sent, direction: "receive" }])[0]).not.toHaveProperty("mtpSale");
    expect(rows([{ ...sent, amountSats: 2212n }])[0]).not.toHaveProperty("mtpSale");
    expect(rows([sent], new Map())[0]).not.toHaveProperty("mtpSale");
    expect(rows([{ ...sent, paymentHash: hash(78) }])[0]).not.toHaveProperty("mtpSale");
    // Its payment failed: nothing sold, never "You receive".
    expect(rows([{ ...sent, status: "failed" }])[0]).not.toHaveProperty("mtpSale");
    // On its way: the sale, "In progress".
    expect(rows([{ ...sent, status: "pending" }])[0]).toMatchObject({ mtpSale: sale });
  });
});

describe("ownerActivity, deposits not credited yet", () => {
  const TX = "ab".repeat(32);
  const SHOP = { kind: "integration", id: "i1", name: "Shop" } as const;
  const PAID_AT = NOW - 7200;
  const orderSale: DeclaredSale = {
    author: "order-7",
    fiat: CHF(150),
    note: "Order 7",
    taker: { kind: "integration", id: "i1" },
    paidAt: PAID_AT
  };
  const pending = (over: Partial<PendingDeposit> = {}): PendingDeposit => ({
    txid: TX,
    vout: 0,
    amountSats: 1500n,
    mature: true,
    waitsForFees: true,
    ...over
  });
  const rows = (
    deposits: readonly PendingDeposit[],
    over: Partial<Parameters<typeof ownerActivity>[0]> = {}
  ) =>
    ownerActivity({
      payments: [],
      declarations: new Map(),
      onchainSales: new Map([[TX, [orderSale]]]),
      deposits,
      links: [],
      sales: [],
      integrations: new Map([[SHOP.id, SHOP]]),
      now: NOW,
      ...over
    });

  it('shows an integration\'s order "Confirming" until its sats are in the balance, and why', () => {
    // "Paid" only once its sats are in the balance.
    const items = rows([pending()]);
    expect(items).toEqual([
      {
        id: "sale:order-7",
        source: "integration",
        timestamp: PAID_AT,
        note: "Order 7",
        fiat: CHF(150),
        sats: 1500n,
        state: "unconfirmed",
        rest: null,
        by: SHOP,
        payments: [
          {
            id: `deposit:${TX}:0`,
            direction: "receive",
            status: "completed",
            amountSats: 1500n,
            feeSats: 0n,
            timestamp: PAID_AT,
            network: "bitcoin",
            txId: TX
          }
        ],
        link: null,
        pendingCredit: "fees"
      }
    ]);
    // Not refused for its fee (not tried yet, or another failure): no word of the fees.
    expect(rows([pending({ waitsForFees: false })])).toMatchObject([
      { id: "sale:order-7", state: "unconfirmed", pendingCredit: "other" }
    ]);
    expect(rows([pending({ waitsForFees: false })])[0]).not.toHaveProperty("pendingCreditFeeSats");
  });

  it("tells the price of its credit when one deposit of the order waits for it", () => {
    expect(rows([pending({ claimFeeSats: 150n })])).toMatchObject([
      { id: "sale:order-7", pendingCredit: "fees", pendingCreditFeeSats: 150n }
    ]);
    // Another deposit of the order waiting for another reason: still that one's price.
    const TX2 = "cd".repeat(32);
    const sales = {
      onchainSales: new Map([
        [TX, [orderSale]],
        [TX2, [orderSale]]
      ])
    };
    expect(
      rows([pending({ claimFeeSats: 150n }), pending({ txid: TX2, waitsForFees: false })], sales)
    ).toMatchObject([{ pendingCredit: "fees", pendingCreditFeeSats: 150n }]);
    // Two deposits waiting for fees: two prices, none the order's.
    const two = rows(
      [pending({ claimFeeSats: 150n }), pending({ txid: TX2, claimFeeSats: 200n })],
      sales
    );
    expect(two).toMatchObject([{ pendingCredit: "fees" }]);
    expect(two[0]).not.toHaveProperty("pendingCreditFeeSats");
  });

  it("shows nothing before 3 confirmations, nor a deposit no sale names", () => {
    expect(rows([pending({ mature: false })])).toEqual([]);
    expect(rows([pending()], { onchainSales: new Map() })).toEqual([]);
    expect(rows([pending()], { onchainSales: new Map([[TX, []]]) })).toEqual([]);
    // Two sales for one transaction: nobody's.
    expect(
      rows([pending()], {
        onchainSales: new Map([[TX, [orderSale, { ...orderSale, author: "order-8" }]]])
      })
    ).toEqual([]);
    // The owner's copy tells no date of payment: the wallet's claim alone dates it.
    const { paidAt: _, ...archived } = orderSale;
    expect(rows([pending()], { onchainSales: new Map([[TX, [archived]]]) })).toEqual([]);
  });

  it("is never the sale of an integration the owner does not know", () => {
    expect(rows([pending()], { integrations: new Map() })).toEqual([]);
    // Removed after the payment: its sale all the same, as once claimed.
    expect(
      rows([pending()], {
        integrations: new Map(),
        removed: new Map([[removedKey("integration", "i1"), { removedAt: PAID_AT + 60, by: SHOP }]])
      })
    ).toMatchObject([{ id: "sale:order-7", pendingCredit: "fees" }]);
  });

  it("is the wallet's payment alone once claimed", () => {
    const claimed = payment({
      id: "p1",
      network: "bitcoin",
      paymentHash: undefined,
      txId: TX,
      amountSats: 1401n,
      timestamp: NOW - 60
    });
    // Still listed among the deposits a moment (read before the payments): never counted twice.
    const items = rows([pending()], { payments: [claimed] });
    expect(items).toMatchObject([
      { id: "sale:order-7", sats: 1401n, timestamp: NOW - 60, payments: [claimed] }
    ]);
    expect(items[0]).not.toHaveProperty("pendingCredit");
  });

  it("adds a deposit not credited yet to the order's other payments, the newest first", () => {
    const TX2 = "cd".repeat(32);
    const claimed = payment({
      id: "p1",
      network: "bitcoin",
      paymentHash: undefined,
      txId: TX2,
      amountSats: 901n,
      timestamp: PAID_AT - 600
    });
    const items = rows([pending({ waitsForFees: false }), pending({ txid: TX2 })], {
      payments: [claimed],
      onchainSales: new Map([
        [TX, [orderSale]],
        [TX2, [orderSale]]
      ])
    });
    expect(items).toMatchObject([
      {
        id: "sale:order-7",
        sats: 2401n,
        timestamp: PAID_AT,
        payments: [{ id: `deposit:${TX}:0` }, { id: "p1" }],
        pendingCredit: "other"
      }
    ]);
  });

  it("keeps an order's state its witnesses and the explorer tell, with its warning", () => {
    // Underpaid: 1 500 of its 2 000 sats paid in time, that deposit not claimed yet.
    const items = rows([pending()], {
      integrationOrders: [
        {
          author: "order-7",
          fiat: CHF(200),
          note: "Order 7",
          taker: { kind: "integration", id: "i1" },
          at: PAID_AT,
          state: "underpaid",
          received: 1500n,
          confirmed: false,
          due: 2000n,
          tolerance: 0,
          lease: {
            integration: "i1",
            address: "bc1paddress",
            expiresAt: PAID_AT + 600,
            sats: 2000n,
            tolerance: 0
          }
        }
      ]
    });
    expect(items).toMatchObject([
      {
        id: "sale:order-7",
        state: "underpaid",
        sats: 1500n,
        rest: { sats: 500n },
        pendingCredit: "fees"
      }
    ]);
  });

  it('leaves a transaction a payment link names to its link, "Confirming" until credited', () => {
    const final = {
      status: "paid" as const,
      received: 1500n,
      due: 1500n,
      lightning: [],
      transactions: [TX],
      transactionsAt: new Map([[TX, PAID_AT - 30]])
    };
    // Its deposit waiting for its claim: on the link's row, dated as its final version tells.
    const byLink = rows([pending()], { links: [link({ id: "l1", final })] });
    expect(byLink).toEqual([
      expect.objectContaining({
        id: "link:l1",
        state: "unconfirmed",
        sats: 1500n,
        timestamp: PAID_AT - 30,
        pendingCredit: "fees",
        payments: [expect.objectContaining({ txId: TX, amountSats: 1500n })]
      })
    ]);
    // Not even a deposit of the wallet yet: its sats are not in the balance either.
    expect(rows([], { links: [link({ id: "l1", final })] })).toEqual([
      expect.objectContaining({ id: "link:l1", state: "unconfirmed", pendingCredit: "other" })
    ]);
    // Claimed: in the balance, "Paid".
    const claimed = payment({
      id: "claim",
      network: "bitcoin",
      txId: TX,
      paymentHash: undefined,
      amountSats: 1400n,
      timestamp: PAID_AT + 600
    });
    const paid = rows([], { payments: [claimed], links: [link({ id: "l1", final })] });
    expect(paid).toEqual([expect.objectContaining({ id: "link:l1", state: null })]);
    expect(paid[0]).not.toHaveProperty("pendingCredit");
  });
});

describe("memberActivity", () => {
  it("lists the sales seen paid and the links, a sale paid through a link once", () => {
    const sale = (n: number, paidAt: number | null): RecordedSale => ({
      paymentHash: hash(n),
      fiat: CHF(1746),
      note: "Table 12",
      sats: 18_420n,
      createdAt: NOW - 1000 - n,
      expiresAt: NOW - 400 - n,
      paidAt,
      sale: `sale-${n}`,
      underpaid: null,
      by: null
    });
    const items = memberActivity({
      sales: [sale(1, NOW - 900), sale(2, null), sale(3, NOW - 500)],
      links: [
        link({
          id: "l1",
          by: null,
          createdAt: NOW - 600,
          final: {
            status: "paid",
            received: 18_420n,
            due: 18_420n,
            lightning: [hash(3)],
            transactions: []
          }
        })
      ],
      now: NOW
    });
    expect(items.map((item) => item.id)).toEqual(["link:l1", `sale:${hash(1)}`]);
    expect(items[1]).toMatchObject({ source: "pos", sats: 18_420n, timestamp: NOW - 900 });
  });
});

describe("a sale's hour shown with the address alone", () => {
  // Its record names no invoice: its address and the transactions its device saw tie it.
  const ADDRESS = "bc1p" + "q".repeat(58);
  const TX = "ef".repeat(32);
  const alone = (over: Partial<RecordedSale> = {}): RecordedSale => ({
    paymentHash: null,
    fiat: CHF(250_000),
    note: "Bicycle",
    sats: 5_000_000n,
    createdAt: NOW - 60,
    expiresAt: NOW + 540,
    paidAt: null,
    sale: "sale-alone",
    underpaid: null,
    onchain: { address: ADDRESS, sightings: [] },
    by: ERIN,
    ...over
  });

  it("is listed open until its end, then paid in its place, for the owner and the employee", () => {
    const open = alone();
    for (const items of [
      ownerActivity({ payments: [], declarations: new Map(), links: [], sales: [open], now: NOW }),
      memberActivity({ sales: [open], links: [], now: NOW })
    ]) {
      expect(items).toEqual([
        expect.objectContaining({
          id: `sale-onchain:sale-alone:${NOW - 60}`,
          source: "pos",
          state: "open",
          fiat: CHF(250_000)
        })
      ]);
    }
    // Ended unpaid: no row (a point of sale's sale has no final version).
    expect(memberActivity({ sales: [alone({ expiresAt: NOW })], links: [], now: NOW })).toEqual([]);

    // Seen paid on-chain: the employee's row, in the same place, without sats (the wallet's).
    const paid = alone({
      paidAt: NOW - 10,
      onchain: { address: ADDRESS, sightings: [{ txid: TX, at: NOW - 30 }] }
    });
    expect(memberActivity({ sales: [paid], links: [], now: NOW })).toEqual([
      expect.objectContaining({
        id: `sale-onchain:sale-alone:${NOW - 60}`,
        source: "pos",
        state: null,
        sats: null,
        timestamp: NOW - 10
      })
    ]);
  });
});

describe("open invoices of a point of sale", () => {
  const shown = (n: number, over: Partial<RecordedSale> = {}): RecordedSale => ({
    paymentHash: hash(n),
    fiat: CHF(1000 + n),
    note: "",
    sats: 20_000n,
    createdAt: NOW - 60,
    expiresAt: NOW + 540,
    paidAt: null,
    sale: `sale-${n}`,
    underpaid: null,
    by: ERIN,
    ...over
  });

  it("lists an invoice not paid until its end, for the owner and the employee", () => {
    const sales = [shown(1), shown(2, { expiresAt: NOW }), shown(3, { paidAt: NOW - 10 })];
    const owner = ownerActivity({
      payments: [],
      declarations: new Map(),
      links: [],
      sales,
      now: NOW
    });
    expect(owner).toEqual([
      expect.objectContaining({
        id: `sale:${hash(1)}`,
        source: "pos",
        state: "open",
        fiat: CHF(1001),
        sats: null,
        by: ERIN,
        timestamp: NOW - 60
      })
    ]);
    const member = memberActivity({
      sales: sales.map((sale) => ({ ...sale, by: null })),
      links: [],
      now: NOW
    });
    // Its open invoice, and the one seen paid, under the same id it keeps once paid.
    expect(member.map((item) => [item.id, item.state])).toEqual([
      [`sale:${hash(3)}`, null],
      [`sale:${hash(1)}`, "open"]
    ]);
    expect(followUpsOf(member).open.map((item) => item.id)).toEqual([`sale:${hash(1)}`]);
  });

  it("leaves the invoice to the wallet's row once the wallet has its payment", () => {
    const items = ownerActivity({
      payments: [payment({ id: "p1", paymentHash: hash(1), status: "pending" })],
      declarations: new Map(),
      links: [],
      sales: [shown(1)],
      now: NOW
    });
    expect(items.map((item) => item.id)).toEqual(["payment:p1"]);
  });

  it("lists a sale shared as a link once, as the link", () => {
    const shared = link({ id: "l1", saleAuthor: "s1", endsAt: NOW + 540 });
    const sales = [shown(1, { sale: "s1" })];
    const owner = ownerActivity({
      payments: [],
      declarations: new Map(),
      links: [shared],
      sales,
      now: NOW
    });
    expect(owner.map((item) => [item.id, item.state])).toEqual([["link:l1", "open"]]);
    const member = memberActivity({ sales, links: [shared], now: NOW });
    expect(member.map((item) => [item.id, item.state])).toEqual([["link:l1", "open"]]);
  });

  it("drops a sale's invoice still open once another of its invoices was paid", () => {
    // An hour's invoice paid in its last seconds, the next hour's still shown until its end.
    const sales = [
      shown(1, { sale: "s1", createdAt: NOW - 30 }),
      shown(2, { sale: "s1", createdAt: NOW - 400, expiresAt: NOW - 30, paidAt: NOW - 40 })
    ];
    const member = memberActivity({ sales, links: [], now: NOW });
    expect(member.map((item) => [item.id, item.state])).toEqual([[`sale:${hash(2)}`, null]]);
    // The owner: its wallet's payment, declared for that sale, is the sale's row.
    const owner = ownerActivity({
      payments: [payment({ id: "p2", paymentHash: hash(2) })],
      declarations: new Map([[hash(2), [{ author: "s1", fiat: CHF(1002), note: "" }]]]),
      links: [],
      sales: [shown(1, { sale: "s1" })],
      now: NOW
    });
    expect(owner.map((item) => [item.id, item.state])).toEqual([["sale:s1", null]]);
  });

  describe("a sale seen underpaid by its point of sale", () => {
    const TX = "ab".repeat(32);
    const seen = (due: bigint | null) => ({
      at: NOW - 20,
      received: 4_000n,
      due,
      transactions: [TX]
    });
    const restOf = (minor: number) => ({
      sats: 6_000n,
      minor: splitFiat(minor, 10_000n, 4_000n).restMinor
    });
    const deposit = payment({
      id: "d1",
      network: "bitcoin",
      amountSats: 4_000n,
      txId: TX,
      paymentHash: undefined
    });

    it('is "Underpaid" with its rest, the wallet\'s deposit in its row', () => {
      const sales = [shown(1, { sale: "s1", underpaid: seen(10_000n) })];
      const items = ownerActivity({
        payments: [deposit],
        declarations: new Map(),
        links: [],
        sales,
        now: NOW
      });
      expect(items).toEqual([
        expect.objectContaining({
          id: "sale:s1",
          state: "underpaid",
          rest: restOf(1001),
          sats: 4_000n,
          fiat: CHF(1001),
          by: ERIN,
          payments: [deposit]
        })
      ]);
      expect(followUpsOf(items).underpaid).toHaveLength(1);
      // Its deposit not listed by the wallet (yet): the row from the record alone.
      const alone = ownerActivity({
        payments: [],
        declarations: new Map(),
        links: [],
        sales,
        now: NOW
      });
      expect(alone).toMatchObject([{ id: "sale:s1", state: "underpaid", payments: [] }]);
      // The employee's own view: the same, its open invoice left out.
      const member = memberActivity({ sales, links: [], now: NOW });
      expect(member.map((item) => [item.id, item.state])).toEqual([["sale:s1", "underpaid"]]);
    });

    it('weighs nothing in "Underpaid" while its amount due is not known', () => {
      const [item] = ownerActivity({
        payments: [],
        declarations: new Map(),
        links: [],
        sales: [shown(1, { sale: "s1", underpaid: seen(null) })],
        now: NOW
      });
      expect(item).toMatchObject({ state: "underpaid", rest: null });
      expect(followUpAmount(item!)).toBeNull();
    });

    it("is paid once a record of the sale says so", () => {
      const sales = [
        shown(1, { sale: "s1", underpaid: seen(10_000n) }),
        shown(2, { sale: "s1", paidAt: NOW - 5 })
      ];
      const items = ownerActivity({
        payments: [payment({ id: "p2", paymentHash: hash(2), amountSats: 6_000n })],
        declarations: new Map([[hash(2), [{ author: "s1", fiat: CHF(1001), note: "" }]]]),
        links: [],
        sales,
        now: NOW
      });
      expect(items).toMatchObject([{ id: "sale:s1", state: null }]);
    });

    it('makes a link without its final version "Underpaid"', () => {
      const shared = link({ id: "l1", saleAuthor: "s1", endsAt: NOW - 10 });
      const sales = [shown(1, { sale: "s1", underpaid: seen(10_000n) })];
      const owner = ownerActivity({
        payments: [deposit],
        declarations: new Map(),
        links: [shared],
        sales,
        now: NOW
      });
      expect(owner).toEqual([
        expect.objectContaining({
          id: "link:l1",
          state: "underpaid",
          rest: restOf(25000),
          payments: [deposit]
        })
      ]);
      const member = memberActivity({ sales, links: [shared], now: NOW });
      expect(member).toMatchObject([{ id: "link:l1", state: "underpaid", rest: restOf(25000) }]);
      // Recorded paid: no longer "Expired" for want of a payment in the wallet.
      const paid = memberActivity({
        sales: [shown(1, { sale: "s1", paidAt: NOW - 30 })],
        links: [shared],
        now: NOW
      });
      // Once: the link's row, the record naming its sale.
      expect(paid.map((item) => [item.id, item.state])).toEqual([["link:l1", null]]);
    });
  });

  it('tells when the next row "Open" ends', () => {
    expect(
      nextEnd(
        [
          shown(1),
          shown(2, { expiresAt: NOW + 30 }),
          shown(3, { expiresAt: NOW + 5, paidAt: NOW })
        ],
        [link({ id: "l1", endsAt: NOW + 60 }), link({ id: "l2", endsAt: NOW - 5 })],
        NOW
      )
    ).toBe(NOW + 30);
    expect(nextEnd([shown(1)], [], NOW + 540)).toBeNull();
  });
});

describe("followUpsOf", () => {
  it("groups the rows to follow, each weighing its rest, its amount or its sats", () => {
    const items = ownerActivity({
      payments: [payment({ id: "p1", network: "bitcoin", status: "pending", amountSats: 7n })],
      declarations: new Map(),
      links: [
        link({ id: "l1" }),
        link({
          id: "l2",
          endsAt: NOW - 7200,
          final: {
            status: "underpaid",
            received: 10n,
            due: 20n,
            lightning: [],
            transactions: []
          }
        })
      ],
      sales: [],
      now: NOW
    });
    const groups = followUpsOf(items);
    expect(groups.open.map((item) => item.id)).toEqual(["link:l1"]);
    expect(groups.underpaid.map((item) => item.id)).toEqual(["link:l2"]);
    expect(groups.unconfirmed.map((item) => item.id)).toEqual(["payment:p1"]);
    expect(followUpAmount(groups.underpaid[0]!)).toEqual({ fiat: CHF(12500) });
    expect(followUpAmount(groups.unconfirmed[0]!)).toEqual({ sats: 7n });
  });
});

describe("a point of sale's sale paid on-chain", () => {
  // 2.00 CHF, 2,882 sats due: 1,500 sats, then 1,382 sats to the same address.
  const ADDRESS = "bc1p-of-the-sale";
  const TX1 = "a1".repeat(32);
  const TX2 = "a2".repeat(32);
  const deposit = (txid: string, sats: bigint): WalletPayment =>
    payment({
      id: `d-${txid.slice(0, 4)}`,
      network: "bitcoin",
      txId: txid,
      paymentHash: undefined,
      amountSats: sats
    });
  const sightings = (...seen: [string, number][]) => ({
    address: ADDRESS,
    sightings: seen.map(([txid, at]) => ({ txid, at }))
  });
  const sale = (over: Partial<RecordedSale> = {}): RecordedSale => ({
    paymentHash: hash(1),
    fiat: CHF(200),
    note: "Table 4",
    sats: 2_882n,
    createdAt: NOW - 600,
    expiresAt: NOW,
    paidAt: null,
    sale: "s1",
    underpaid: null,
    onchain: sightings(),
    by: ERIN,
    ...over
  });
  const underpaid = (at: number, received: bigint, transactions: string[]) => ({
    at,
    received,
    due: 2_882n,
    transactions
  });
  const rows = (sales: RecordedSale[], over: Partial<Parameters<typeof ownerActivity>[0]> = {}) =>
    ownerActivity({ payments: [], declarations: new Map(), links: [], sales, now: NOW, ...over });

  it("is a sale paid, with both its deposits, once recorded paid", () => {
    const sales = [
      sale({
        underpaid: underpaid(NOW - 550, 1_500n, [TX1]),
        onchain: sightings([TX1, NOW - 550], [TX2, NOW - 500])
      }),
      sale({ paymentHash: hash(2), paidAt: NOW - 100, onchain: sightings([TX2, NOW - 500]) })
    ];
    const payments = [deposit(TX2, 1_382n), deposit(TX1, 1_500n)];
    expect(rows(sales, { payments })).toEqual([
      expect.objectContaining({
        id: "sale:s1",
        source: "pos",
        state: null,
        rest: null,
        sats: 2_882n,
        fiat: CHF(200),
        note: "Table 4",
        by: ERIN,
        payments
      })
    ]);
    // "My activity": paid, its sats the owner's wallet's to tell (not its invoice's amount).
    expect(memberActivity({ sales, links: [], now: NOW })).toEqual([
      expect.objectContaining({ id: `sale:${hash(2)}`, state: null, sats: null, fiat: CHF(200) })
    ]);
  });

  it("is being confirmed while a payment its point of sale saw is not judged yet", () => {
    // The audit's records: underpaid with the first transaction, the second seen after.
    const sales = [
      sale({
        underpaid: underpaid(NOW - 550, 1_500n, [TX1]),
        onchain: sightings([TX1, NOW - 550], [TX2, NOW - 500])
      })
    ];
    const payments = [deposit(TX1, 1_500n)];
    const [row] = rows(sales, { payments });
    expect(row).toMatchObject({ id: "sale:s1", state: "unconfirmed", rest: null, sats: 1_500n });
    expect(row!.payments).toEqual(payments);
    // Neither in the wallet yet: from its records alone, never "Underpaid".
    expect(rows(sales)).toEqual([
      expect.objectContaining({ id: "sale:s1", state: "unconfirmed", payments: [] })
    ]);
    expect(memberActivity({ sales, links: [], now: NOW })).toEqual([
      expect.objectContaining({ id: "sale:s1", state: "unconfirmed", rest: null })
    ]);
    // Nothing recorded but the invoice shown, a payment seen: being confirmed, not "Open".
    const shownOnly = [sale({ expiresAt: NOW + 300, onchain: sightings([TX1, NOW - 550]) })];
    expect(rows(shownOnly).map((item) => [item.id, item.state])).toEqual([
      ["sale:s1", "unconfirmed"]
    ]);
  });

  it('is "Underpaid" with its exact rest once the point of sale judged every payment', () => {
    // 1 500 + 100 sats: 1 282 sats left, the rest in francs as the point of sale splits it.
    const sales = [
      sale({
        underpaid: underpaid(NOW - 100, 1_600n, [TX1, TX2]),
        onchain: sightings([TX1, NOW - 550], [TX2, NOW - 500])
      })
    ];
    const payments = [deposit(TX2, 100n), deposit(TX1, 1_500n)];
    expect(rows(sales, { payments })).toEqual([
      expect.objectContaining({
        id: "sale:s1",
        state: "underpaid",
        rest: { sats: 1_282n, minor: splitFiat(200, 2_882n, 1_600n).restMinor },
        sats: 1_600n,
        payments
      })
    ]);
    // A transaction seen well before the verdict and not counted (replaced, gone): judged.
    const replaced = [
      sale({
        underpaid: underpaid(NOW - 100, 1_500n, [TX1]),
        onchain: sightings([TX1, NOW - 550], [TX2, NOW - 500])
      })
    ];
    expect(rows(replaced)[0]).toMatchObject({ state: "underpaid", rest: { sats: 1_382n } });
  });

  it('shows a deposit not credited yet in its row, "Confirming", its sats waiting', () => {
    const sales = [sale({ paidAt: NOW - 100, onchain: sightings([TX1, NOW - 550]) })];
    const pending: PendingDeposit = {
      txid: TX1,
      vout: 0,
      amountSats: 2_882n,
      mature: true,
      waitsForFees: false
    };
    expect(rows(sales, { deposits: [pending] })).toEqual([
      expect.objectContaining({
        id: "sale:s1",
        state: "unconfirmed",
        sats: 2_882n,
        pendingCredit: "other",
        payments: [expect.objectContaining({ txId: TX1, amountSats: 2_882n })]
      })
    ]);
    // Not even listed by the wallet yet: its sats not in the balance either.
    expect(rows(sales)).toEqual([
      expect.objectContaining({
        id: "sale:s1",
        state: "unconfirmed",
        sats: null,
        pendingCredit: "other"
      })
    ]);
    // Older than the wallet's list: its deposits are, too.
    const later = payment({ id: "p9", paymentHash: hash(9), timestamp: NOW - 50 });
    expect(rows(sales, { payments: [later] }).map((item) => item.id)).toEqual(["payment:p9"]);
  });

  it("counts a transaction two sales name for none of them", () => {
    const sales = [
      sale({ paidAt: NOW - 100, onchain: sightings([TX1, NOW - 550]) }),
      sale({
        paymentHash: hash(2),
        sale: "s2",
        paidAt: NOW - 100,
        onchain: { address: "bc1p-other", sightings: [{ txid: TX1, at: NOW - 540 }] }
      })
    ];
    const items = rows(sales, { payments: [deposit(TX1, 2_882n)] });
    expect(items.find((item) => item.id === `payment:d-${TX1.slice(0, 4)}`)).toMatchObject({
      source: "receive",
      fiat: null,
      by: null
    });
    expect(items.flatMap((item) => item.payments).filter((p) => p.txId === TX1)).toHaveLength(1);
    // Nor are they shown waiting for a deposit the wallet has.
    expect(items.filter((item) => item.source === "pos")).toEqual([]);
    const recent = sales.map((one) => ({ ...one, createdAt: NOW - 60 }));
    expect(
      rows(recent, { payments: [deposit(TX1, 2_882n)] }).filter((item) => item.source === "pos")
    ).toEqual([]);
  });
});
