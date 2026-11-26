import { CARD_MIGRATION_INVOICE_DESCRIPTION } from "@/config/card";
import {
  firstHorizon,
  historyRows,
  migrationTransfers,
  copyShown,
  monthHeadsOf,
  olderStep,
  refusalReasonOf,
  sentFees,
  type HistorySources,
  type OlderSources
} from "@/features/card/history-view";
import type { WalletPayment } from "@/lib/breez/types";
import type { CardMovement, UnidentifiedMovement } from "@/lib/card/card-movement";
import type { HeadCopy, HistoryCopy } from "@/lib/card/history-records";
import { deviceCalendar, monthAfter } from "@/lib/locale/calendar";
import type { MonthHead } from "@/lib/card/month-head";
import { CARD_PAYMENTS_KEPT_MS, type CardPaymentEntry } from "@/lib/card/payment-entry";
import { legacyCardRowRef, type LegacyCardRow } from "@/lib/legacy-v2/card-history";

import { fixedCalendar } from "../../jest/calendar";

/*
 * "History" of a card (history-view.ts): each payment and movement once, from wherever it is
 * kept, newest first, since how far back the list goes; the months beyond, a step at a time.
 */

const CARD = "0123456789abcdef0123456789abcdef";
const OTHER = "fedcba9876543210fedcba9876543210";
/** The card's current wallet, whose history shows: its second (deleted once, added again). */
const WALLET = { cardId: CARD, walletGeneration: 2 };
const NOW = Date.UTC(2026, 9, 18, 9, 0);
const HOUR = 3_600_000;

function tap(id: string, at: number, fields: Partial<CardPaymentEntry> = {}): CardPaymentEntry {
  return {
    id,
    ...WALLET,
    at,
    amountSats: 3_400n,
    paymentHash: id.padStart(64, "0"),
    description: `Payment ${id}`,
    outcome: "sent",
    reason: null,
    pr: "lnbc1",
    payee: null,
    preimage: null,
    value: null,
    ...fields
  };
}

function movement(id: string, at: number, fields: Partial<CardMovement> = {}): CardMovement {
  return {
    id,
    ...WALLET,
    kind: "recharge",
    way: "main",
    at,
    amountSats: 20_000n,
    feeSats: 0n,
    txid: null,
    description: null,
    value: null,
    ...fields
  };
}

/** A transfer of the card's wallet the SDK cannot tell (unidentifiedOf). */
function unidentified(
  id: string,
  at: number,
  fields: Partial<UnidentifiedMovement> = {}
): UnidentifiedMovement {
  return {
    kind: "unidentified",
    id,
    ...WALLET,
    direction: "receive",
    at,
    amountSats: 21_000n,
    ...fields
  };
}

const VALUE = { minor: 289, digits: 2, currency: "CHF", hour: Math.floor(NOW / 1000) - 3600 };

function sources(fields: Partial<HistorySources>): HistorySources {
  return {
    card: WALLET,
    horizon: firstHorizon(NOW),
    own: [],
    taps: [],
    movements: [],
    wallet: null,
    ...fields
  };
}

describe('"History" of a card', () => {
  it("shows each payment once, the phone's own entry over any copy of it, newest first", () => {
    const rows = historyRows(
      sources({
        own: [tap("a1", NOW - HOUR, { outcome: "sent", preimage: "1".repeat(64) })],
        taps: [
          // An earlier write of the phone's own tap: the log decides.
          { entry: tap("a1", NOW - HOUR, { outcome: "sending" }), revision: 0 },
          // Another phone's, written twice: its latest write.
          { entry: tap("b2", NOW - 2 * HOUR, { outcome: "uncertain" }), revision: 0 },
          { entry: tap("b2", NOW - 2 * HOUR, { outcome: "sent" }), revision: 1 },
          // Another card's: not this one's history.
          { entry: tap("c3", NOW - 3 * HOUR, { cardId: OTHER }), revision: 0 },
          // The card's first wallet's (deleted, then added again): nothing of before.
          { entry: tap("f6", NOW - 4 * HOUR, { walletGeneration: 1 }), revision: 0 }
        ]
      })
    );
    expect(rows.map((row) => row.key)).toEqual(["t/a1", "t/b2"]);
    expect(rows[0]).toMatchObject({
      kind: "tap",
      entry: { outcome: "sent", preimage: "1".repeat(64) }
    });
    expect(rows[1]).toMatchObject({ kind: "tap", entry: { outcome: "sent" } });
  });

  it("shows each movement once: its latest record, which keeps its value, else as the wallet tells it", () => {
    const rows = historyRows(
      sources({
        movements: [
          { movement: movement("m1", NOW - HOUR), revision: 0 },
          { movement: movement("m1", NOW - HOUR, { value: VALUE }), revision: 1 }
        ],
        wallet: [
          movement("m1", NOW - HOUR),
          movement("m2", NOW - 2 * HOUR, { kind: "return", way: null }),
          movement("m3", NOW - 3 * HOUR, { cardId: OTHER }),
          movement("m4", NOW - 4 * HOUR, { walletGeneration: 1 })
        ]
      })
    );
    expect(rows.map((row) => row.key)).toEqual([`m/${CARD}/m1`, `m/${CARD}/m2`]);
    expect(rows[0]).toMatchObject({ kind: "movement", movement: { value: VALUE } });
    expect(rows[1]).toMatchObject({ movement: { kind: "return", value: null } });
  });

  it("tells a deposit that brought funds back from a recharge (funds-recovery.ts)", () => {
    const TX = "ab".repeat(32);
    const back = movement("d1", NOW - HOUR, { way: "onchain", txid: TX, feeSats: 300n });
    const recharge = movement("d2", NOW - 2 * HOUR, { way: "onchain", txid: "cd".repeat(32) });
    const rows = historyRows(sources({ wallet: [back, recharge], recovered: new Set([TX]) }));
    expect(rows.map((row) => row.kind === "movement" && row.recovered === true)).toEqual([
      true,
      false
    ]);
    // Its record not read: a recharge, as the wallet tells it.
    expect(historyRows(sources({ wallet: [back] }))[0]).not.toHaveProperty("recovered");
  });

  it("shows what the payer of a recharge wrote, as the wallet tells it, over its record too", () => {
    const notes = new Map([
      [`${CARD}/m1`, "For the coffee"],
      [`${CARD}/r1`, "Never a return"]
    ]);
    const rows = historyRows(
      sources({
        movements: [{ movement: movement("m1", NOW - HOUR, { value: VALUE }), revision: 1 }],
        wallet: [
          movement("m1", NOW - HOUR),
          movement("m2", NOW - 2 * HOUR),
          movement("r1", NOW - 3 * HOUR, { kind: "return", way: null })
        ],
        notes
      })
    );
    expect(rows[0]).toMatchObject({ movement: { value: VALUE }, note: "For the coffee" });
    expect(rows[1]).not.toHaveProperty("note");
    expect(rows[2]).not.toHaveProperty("note");
    // The wallet unread: its record only, no note.
    expect(
      historyRows(
        sources({
          movements: [{ movement: movement("m1", NOW - HOUR, { value: VALUE }), revision: 1 }]
        })
      )[0]
    ).not.toHaveProperty("note");
  });

  it("shows what the wallet cannot tell as it tells it, never as a recharge recorded before", () => {
    const rows = historyRows(
      sources({
        // Recorded by an app whose SDK read the same transfer as a recharge (spark-sdk 0.26.1
        // reads a type it does not know as its first one): the wallet now tells it otherwise.
        movements: [{ movement: movement("u1", NOW - HOUR, { way: "address" }), revision: 0 }],
        wallet: [
          unidentified("u1", NOW - HOUR),
          unidentified("u2", NOW - 2 * HOUR, { direction: "send", amountSats: 5_000n }),
          unidentified("u3", NOW - 3 * HOUR, { cardId: OTHER }),
          unidentified("u4", NOW - 4 * HOUR, { walletGeneration: 1 }),
          movement("m5", NOW - 5 * HOUR)
        ]
      })
    );
    expect(rows.map((row) => row.key)).toEqual([`u/${CARD}/u1`, `u/${CARD}/u2`, `m/${CARD}/m5`]);
    expect(rows[0]).toEqual({
      kind: "unidentified",
      key: `u/${CARD}/u1`,
      at: NOW - HOUR,
      movement: unidentified("u1", NOW - HOUR)
    });
    expect(rows[1]).toMatchObject({ movement: { direction: "send", amountSats: 5_000n } });
    // The wallet unread: only the records are known, the recharge recorded included.
    expect(
      historyRows(
        sources({
          movements: [{ movement: movement("u1", NOW - HOUR, { way: "address" }), revision: 0 }]
        })
      ).map((row) => row.key)
    ).toEqual([`m/${CARD}/u1`]);
  });

  it("shows nothing of the card's earlier wallet, wherever it is left", () => {
    const before = { walletGeneration: 1 };
    const rows = historyRows(
      sources({
        own: [tap("a1", NOW - HOUR, before)],
        taps: [{ entry: tap("b2", NOW - HOUR, before), revision: 0 }],
        movements: [{ movement: movement("m1", NOW - HOUR, before), revision: 0 }],
        wallet: [movement("m2", NOW - HOUR, before)]
      })
    );
    expect(rows).toEqual([]);
  });

  it("orders payments and movements together, the same way on every device", () => {
    const rows = historyRows(
      sources({
        own: [tap("b", NOW - HOUR), tap("a", NOW - HOUR)],
        wallet: [movement("m", NOW - HOUR / 2), movement("n", NOW - 2 * HOUR)]
      })
    );
    expect(rows.map((row) => row.key)).toEqual([`m/${CARD}/m`, "t/a", "t/b", `m/${CARD}/n`]);
  });

  it("shows nothing older than how far back the list goes", () => {
    const horizon = firstHorizon(NOW);
    expect(horizon).toBe(NOW - CARD_PAYMENTS_KEPT_MS);
    const rows = historyRows(
      sources({
        own: [tap("new", horizon), tap("old", horizon - 1)],
        wallet: [movement("older", horizon - HOUR)]
      })
    );
    expect(rows.map((row) => row.key)).toEqual(["t/new"]);
  });
});

describe("the v2 history of a card migrated from Swiss Bitcoin Pay", () => {
  /** A row of its copy (legacy-history.ts): `at` in ms, as the list counts it. */
  function legacy(id: string, at: number, fields: Partial<LegacyCardRow> = {}): LegacyCardRow {
    return {
      ref: legacyCardRowRef(id),
      kind: "payment",
      at: Math.floor(at / 1000),
      sats: 2_500n,
      feeMsat: 0n,
      value: null,
      note: "",
      ...fields
    };
  }

  /** The recharge of the card's wallet its migration made, with the card's whole v2 balance. */
  function transfer(id: string, at: number, sats: bigint, cardId = CARD): CardMovement {
    return movement(id, at, {
      cardId,
      way: "invoice",
      amountSats: sats,
      description: CARD_MIGRATION_INVOICE_DESCRIPTION
    });
  }

  it("lists its rows among the card's movements, by date, as any other", () => {
    const old = NOW - 2 * HOUR;
    const rows = historyRows(
      sources({
        own: [tap("t1", NOW - HOUR)],
        legacy: [
          legacy("p1", old),
          legacy("r1", NOW - 3 * HOUR, { kind: "recharge", sats: 40_000n })
        ]
      })
    );
    expect(rows.map(({ key }) => key)).toEqual([
      "t/t1",
      `l/${legacyCardRowRef("p1")}`,
      `l/${legacyCardRowRef("r1")}`
    ]);
    expect(rows[1]).toMatchObject({ kind: "legacy", at: Math.floor(old / 1000) * 1000 });
  });

  it("shows nothing older than how far back the list goes", () => {
    const rows = historyRows(sources({ legacy: [legacy("p1", NOW - 100 * 24 * HOUR)] }));
    expect(rows).toEqual([]);
  });

  it("never shows the transfer of its balance at the migration, on either side", () => {
    const migrated = NOW - HOUR;
    const rows = historyRows(
      sources({
        wallet: [transfer("m1", migrated, 70n)],
        legacy: [
          // The v2 server paid the card's wallet a few seconds before it received.
          legacy("drain", migrated - 5_000, { sats: 70n }),
          // Another payment of the very same sats, days before: the card's own, kept.
          legacy("same", migrated - 72 * HOUR, { sats: 70n }),
          legacy("p1", migrated - 2 * HOUR)
        ]
      })
    );
    // Neither the recharge its wallet got nor the v2 payment that sent it, though it took place.
    expect(rows.map(({ key }) => key)).toEqual([
      `l/${legacyCardRowRef("p1")}`,
      `l/${legacyCardRowRef("same")}`
    ]);
    // Its record on the relays (the device that showed the card recorded it): the same.
    const recorded = historyRows(
      sources({
        movements: [{ movement: transfer("m1", migrated, 70n), revision: 0 }],
        legacy: [legacy("drain", migrated - 5_000, { sats: 70n })]
      })
    );
    expect(recorded).toEqual([]);
    // A recharge of "Top up" of the same sats is the holder's: shown.
    expect(
      historyRows(
        sources({
          wallet: [movement("r1", migrated, { way: "invoice", amountSats: 70n, description: "x" })]
        })
      ).map(({ key }) => key)
    ).toEqual(["m/0123456789abcdef0123456789abcdef/r1"]);
  });

  it("never hides a row for a recharge that is not a migration's, nor another card's", () => {
    const at = NOW - HOUR;
    const shown = (moved: CardMovement) =>
      historyRows(sources({ wallet: [moved], legacy: [legacy("drain", at, { sats: 70n })] }))
        .filter(({ kind }) => kind === "legacy")
        .map(({ key }) => key);
    const drain = [`l/${legacyCardRowRef("drain")}`];
    // A recharge of "Top up", of the same sats.
    expect(shown(movement("r", at, { way: "invoice", amountSats: 70n, description: "x" }))).toEqual(
      drain
    );
    // Another sum; too far apart.
    expect(shown(transfer("m", at, 71n))).toEqual(drain);
    expect(shown(transfer("m", at + 2 * HOUR, 70n))).toEqual(drain);
    // What the v2 card received is no transfer out of it.
    expect(
      historyRows(
        sources({
          wallet: [transfer("m", at, 70n)],
          legacy: [legacy("in", at, { kind: "recharge", sats: 70n })]
        })
      ).filter(({ kind }) => kind === "legacy")
    ).toHaveLength(1);
    // Another card's migration, the same minute and sats.
    expect(migrationTransfers([legacy("drain", at, { sats: 70n })], [])).toEqual(new Set());
    expect(
      historyRows(
        sources({
          movements: [{ movement: transfer("o", at, 70n, OTHER), revision: 0 }],
          legacy: [legacy("drain", at, { sats: 70n })]
        })
      ).map(({ key }) => key)
    ).toEqual(drain);
  });

  it("leaves out the transfer whose wallet kept a fee to receive it, never a payment far above", () => {
    const at = NOW - HOUR;
    // The v2 server paid the invoice's 50 000 sats; the wallet credited 49 979 (its fee kept).
    expect(
      migrationTransfers(
        [
          legacy("drain", at - 5_000, { sats: 50_000n }),
          legacy("other", at - 60_000, { sats: 90_000n })
        ],
        [transfer("m1", at, 49_979n)]
      )
    ).toEqual(new Set([legacyCardRowRef("drain")]));
    // A payment below what was received, or more than a tenth above it (at least 100 sats), is no
    // transfer of it.
    expect(
      migrationTransfers(
        [legacy("below", at, { sats: 49_000n }), legacy("above", at, { sats: 55_001n })],
        [transfer("m1", at, 49_979n)]
      )
    ).toEqual(new Set());
    expect(
      migrationTransfers([legacy("small", at, { sats: 170n })], [transfer("m1", at, 70n)])
    ).toEqual(new Set([legacyCardRowRef("small")]));
    // At the same distance, its very sats first.
    expect(
      migrationTransfers(
        [legacy("fee", at, { sats: 50_000n }), legacy("exact", at, { sats: 49_979n })],
        [transfer("m1", at, 49_979n)]
      )
    ).toEqual(new Set([legacyCardRowRef("exact")]));
  });

  it("takes one row per transfer: a balance transferred twice shows each time once", () => {
    const at = NOW - HOUR;
    const rows = [
      legacy("first", at - 60_000, { sats: 70n }),
      legacy("second", at + 600_000, { sats: 70n })
    ];
    expect(
      migrationTransfers(rows, [transfer("m1", at, 70n), transfer("m2", at + 610_000, 70n)])
    ).toEqual(new Set([legacyCardRowRef("first"), legacyCardRowRef("second")]));
  });

  it("offers no month for the transfer of a migration, which shows nowhere", () => {
    const horizon = firstHorizon(NOW);
    const old = Date.UTC(2025, 11, 24, 12);
    const step = olderStep(
      horizon,
      WALLET,
      {
        heads: new Map(),
        read: new Set(),
        partial: new Set(),
        taps: [],
        movements: [{ movement: transfer("m1", old, 70n), revision: 0 }],
        wallet: [transfer("m1", old, 70n)]
      },
      fixedCalendar(0)
    );
    expect(step).toBeNull();
  });

  it("offers the months its rows are in beyond the records", () => {
    const horizon = firstHorizon(NOW);
    const step = olderStep(
      horizon,
      WALLET,
      {
        heads: new Map(),
        read: new Set(),
        partial: new Set(),
        taps: [],
        movements: [],
        wallet: [],
        legacy: [legacy("old", Date.UTC(2025, 11, 24, 12))]
      },
      fixedCalendar(0)
    );
    expect(step).toEqual({ month: "2025-12", unread: [] });
  });
});

describe('the months of "History" beyond its records', () => {
  function head(month: string, cardId = CARD, walletGeneration = 2): HeadCopy {
    const value: MonthHead = {
      cardId,
      walletGeneration,
      month,
      parts: 1,
      set: "0".repeat(64)
    };
    return { head: value, createdAt: 0 };
  }

  /** The months of the copies of `heads` a step shows: their months, in UTC. */
  function monthsOf(heads: { month: string }[]): string[] {
    return heads.map(({ month }) => month);
  }

  /** What "History" knows beyond its horizon: `heads`, the copies read and the wallet. */
  function older(
    heads: Map<string, HeadCopy>,
    fields: Partial<Omit<OlderSources, "heads">> = {}
  ): OlderSources {
    return {
      heads,
      read: new Set(),
      partial: new Set(),
      taps: [],
      movements: [],
      wallet: null,
      ...fields
    };
  }

  /** A copy of the tap `entry`, as a month's copy holds it. */
  function copied(entry: CardPaymentEntry): HistoryCopy {
    return { entry, revision: 0 };
  }

  /** The step's copies to read first, by their months; its month once known. */
  function stepOf(step: ReturnType<typeof olderStep>) {
    return step === null ? null : { month: step.month, unread: monthsOf(step.unread) };
  }

  const UTC = fixedCalendar(0);
  /** Zurich in winter, New York in summer: an hour ahead of UTC, four behind. */
  const ZURICH = fixedCalendar(1);
  const NEW_YORK = fixedCalendar(-4);

  it("goes back a month at a time, to the newest one known to show something", () => {
    const horizon = firstHorizon(NOW);
    // 18.10.2026 less 90 days: 20.07.2026.
    expect(new Date(horizon).toISOString().slice(0, 10)).toBe("2026-07-20");
    const heads = new Map([
      [`${CARD}/2/2026-07`, head("2026-07")],
      [`${CARD}/2/2026-03`, head("2026-03")],
      [`${OTHER}/2/2026-06`, head("2026-06", OTHER)],
      // The card's first wallet's copies (deleted, then added again): never.
      [`${CARD}/1/2026-06`, head("2026-06", CARD, 1)],
      [`${CARD}/1/2026-02`, head("2026-02", CARD, 1)]
    ]);
    // July's copy may hold some of July before the horizon: read first, the newest only.
    expect(stepOf(olderStep(horizon, WALLET, older(heads), UTC))).toEqual({
      month: null,
      unread: ["2026-07"]
    });
    // It held some: July, whole once shown.
    const july = copied(tap("july", Date.UTC(2026, 6, 4)));
    const wallet = [movement("may", Date.UTC(2026, 4, 12))];
    const read = new Set(["2026-07"]);
    expect(
      stepOf(olderStep(horizon, WALLET, older(heads, { read, taps: [july], wallet }), UTC))
    ).toEqual({ month: "2026-07", unread: [] });
    // Then the wallet's movement of May: June has nothing, skipped; March's copy holds nothing as
    // new, not read yet.
    const fromJuly = UTC.monthStart("2026-07");
    expect(
      stepOf(olderStep(fromJuly, WALLET, older(heads, { read, taps: [july], wallet }), UTC))
    ).toEqual({ month: "2026-05", unread: [] });
  });

  it("offers a month only once known to show something, reading the newest copies first", () => {
    const heads = new Map([
      [`${CARD}/2/2026-07`, head("2026-07")],
      [`${CARD}/2/2026-03`, head("2026-03")],
      [`${CARD}/2/2026-02`, head("2026-02")],
      [`${OTHER}/2/2026-06`, head("2026-06", OTHER)],
      [`${CARD}/1/2026-06`, head("2026-06", CARD, 1)]
    ]);
    const fromJuly = UTC.monthStart("2026-07");
    const read = new Set(["2026-07"]);
    // Known: a movement of May. No copy may hold anything newer (June's is another wallet's):
    // May, without reading March's nor February's.
    const wallet = [movement("may", Date.UTC(2026, 4, 12))];
    expect(stepOf(olderStep(fromJuly, WALLET, older(heads, { read, wallet }), UTC))).toEqual({
      month: "2026-05",
      unread: []
    });
    // Known the same way: a transfer of May the wallet cannot tell.
    const told = [unidentified("may", Date.UTC(2026, 4, 12))];
    expect(stepOf(olderStep(fromJuly, WALLET, older(heads, { read, wallet: told }), UTC))).toEqual({
      month: "2026-05",
      unread: []
    });
    // Without it: March's copy first, February's only if March holds nothing older to offer.
    expect(stepOf(olderStep(fromJuly, WALLET, older(heads, { read }), UTC))).toEqual({
      month: null,
      unread: ["2026-03"]
    });
    const march = copied(tap("march", Date.UTC(2026, 2, 9)));
    const afterMarch = new Set(["2026-07", "2026-03"]);
    expect(
      stepOf(olderStep(fromJuly, WALLET, older(heads, { read: afterMarch, taps: [march] }), UTC))
    ).toEqual({ month: "2026-03", unread: [] });
    // March shown: February's copy next; then nothing older anywhere.
    const fromMarch = UTC.monthStart("2026-03");
    expect(
      stepOf(olderStep(fromMarch, WALLET, older(heads, { read: afterMarch, taps: [march] }), UTC))
    ).toEqual({ month: null, unread: ["2026-02"] });
    const all = new Set(["2026-07", "2026-03", "2026-02"]);
    const february = copied(tap("february", Date.UTC(2026, 1, 20)));
    expect(
      stepOf(
        olderStep(fromMarch, WALLET, older(heads, { read: all, taps: [march, february] }), UTC)
      )
    ).toEqual({ month: "2026-02", unread: [] });
    expect(
      olderStep(
        UTC.monthStart("2026-02"),
        WALLET,
        older(heads, { read: all, taps: [march, february] }),
        UTC
      )
    ).toBeNull();
    // Another card's copy, another wallet's: never.
    expect(monthHeadsOf(heads, WALLET, "2026-06", UTC)).toEqual([]);
    expect(
      monthsOf(monthHeadsOf(heads, { cardId: CARD, walletGeneration: 1 }, "2026-06", UTC))
    ).toEqual(["2026-06"]);
  });

  it("goes back by the device's months: in Zurich, a payment of 1 November at 00:30 is November's", () => {
    // Copied with October (UTC): 31 October at 23:30 there. No copy of November (UTC).
    const night = tap("night", Date.UTC(2026, 9, 31, 23, 30));
    const heads = new Map([[`${CARD}/2/2026-10`, head("2026-10")]]);
    const december = ZURICH.monthStart("2026-12");
    // October's copy may hold some of November, by its last hour: read first.
    expect(stepOf(olderStep(december, WALLET, older(heads), ZURICH))).toEqual({
      month: null,
      unread: ["2026-10"]
    });
    // It holds only the night's payment: November, never October with it.
    const shown = older(heads, { read: new Set(["2026-10"]), taps: [copied(night)] });
    expect(stepOf(olderStep(december, WALLET, shown, ZURICH))).toEqual({
      month: "2026-11",
      unread: []
    });
    const november = ZURICH.monthStart("2026-11");
    expect(monthsOf(monthHeadsOf(heads, WALLET, "2026-11", ZURICH))).toEqual(["2026-10"]);
    expect(
      historyRows(sources({ horizon: november, taps: shown.taps })).map(({ key }) => key)
    ).toEqual(["t/night"]);
    // October holds nothing else: never offered.
    expect(olderStep(november, WALLET, shown, ZURICH)).toBeNull();
    // In UTC, the night's payment was October's.
    expect(UTC.monthOf(night.at)).toBe("2026-10");
    expect(ZURICH.monthOf(night.at)).toBe("2026-11");
  });

  it("goes back by the device's months behind UTC too: in New York, 31 October at 22:00 is October's", () => {
    // Copied with November (UTC): 1 November at 02:00 there. No copy of October.
    const evening = tap("evening", Date.UTC(2026, 10, 1, 2, 0));
    const heads = new Map([[`${CARD}/2/2026-11`, head("2026-11")]]);
    const december = NEW_YORK.monthStart("2026-12");
    expect(stepOf(olderStep(december, WALLET, older(heads), NEW_YORK))).toEqual({
      month: null,
      unread: ["2026-11"]
    });
    // It holds only the evening's payment: October, never an empty November.
    const shown = older(heads, { read: new Set(["2026-11"]), taps: [copied(evening)] });
    expect(stepOf(olderStep(december, WALLET, shown, NEW_YORK))).toEqual({
      month: "2026-10",
      unread: []
    });
    // October has no copy of its own: November's, read already, holds its last hours.
    expect(monthsOf(monthHeadsOf(heads, WALLET, "2026-10", NEW_YORK))).toEqual(["2026-11"]);
    const october = NEW_YORK.monthStart("2026-10");
    expect(
      historyRows(sources({ horizon: october, taps: shown.taps })).map(({ key }) => key)
    ).toEqual(["t/evening"]);
    expect(olderStep(october, WALLET, shown, NEW_YORK)).toBeNull();
  });

  it("reads the copy the list's 90 days end in, and offers its month only for what it holds before", () => {
    // New York: the list goes back to 31 October at 23:00 there, in November's copy (UTC).
    const horizon = Date.UTC(2026, 10, 1, 3, 0);
    const heads = new Map([[`${CARD}/2/2026-11`, head("2026-11")]]);
    expect(stepOf(olderStep(horizon, WALLET, older(heads), NEW_YORK))).toEqual({
      month: null,
      unread: ["2026-11"]
    });
    // What it holds is after the horizon (the records showed it): nothing to offer.
    const later = copied(tap("later", Date.UTC(2026, 10, 12)));
    const read = new Set(["2026-11"]);
    expect(olderStep(horizon, WALLET, older(heads, { read, taps: [later] }), NEW_YORK)).toBeNull();
    // Some of 31 October, before it: October.
    const before = copied(tap("before", Date.UTC(2026, 10, 1, 1, 0)));
    expect(
      stepOf(olderStep(horizon, WALLET, older(heads, { read, taps: [later, before] }), NEW_YORK))
    ).toEqual({ month: "2026-10", unread: [] });
  });

  it("offers a copy read but not whole by its middle, its note once some of its month shows", () => {
    // April's copy, read: a part of a newer format (or missing), nothing of it readable here.
    const heads = new Map([[`${CARD}/2/2026-04`, head("2026-04")]]);
    const read = new Set(["2026-04"]);
    const step = olderStep(
      UTC.monthStart("2026-07"),
      WALLET,
      older(heads, { read, partial: read }),
      UTC
    );
    expect(stepOf(step)).toEqual({ month: "2026-04", unread: [] });
    const recordsFrom = firstHorizon(NOW);
    expect(copyShown("2026-04", UTC.monthStart("2026-07"), recordsFrom)).toBe(false);
    expect(copyShown("2026-04", UTC.monthStart("2026-04"), recordsFrom)).toBe(true);
    // Nothing shown beyond the records yet: the records hold what shows.
    expect(copyShown("2026-07", recordsFrom, recordsFrom)).toBe(false);
    // In Zurich, November shows the last hour of October's copy: its note shows with it.
    expect(copyShown("2026-10", ZURICH.monthStart("2026-11"), Date.UTC(2027, 0, 1))).toBe(true);
    expect(copyShown("2026-10", ZURICH.monthStart("2026-12"), Date.UTC(2027, 0, 1))).toBe(false);
    // Shown: nothing more of it offered.
    expect(
      olderStep(UTC.monthStart("2026-04"), WALLET, older(heads, { read, partial: read }), UTC)
    ).toBeNull();
  });

  it("counts its months in the device's time, its copies' in UTC", () => {
    const device = deviceCalendar();
    expect(device.monthStart("2026-07")).toBe(new Date(2026, 6, 1).getTime());
    expect(device.monthOf(new Date(2026, 6, 31, 23, 59).getTime())).toBe("2026-07");
    expect(device.monthOf(new Date(2026, 7, 1, 0, 0).getTime())).toBe("2026-08");
    expect(monthAfter("2026-07")).toBe("2026-08");
    expect(monthAfter("2026-12")).toBe("2027-01");
    // A copy of July holds July in UTC: in Zurich, July but its first hour, and August's first.
    const july = new Map([["july", head("2026-07")]]);
    expect(monthsOf(monthHeadsOf(july, WALLET, "2026-08", ZURICH))).toEqual(["2026-07"]);
    expect(monthsOf(monthHeadsOf(july, WALLET, "2026-07", ZURICH))).toEqual(["2026-07"]);
    expect(monthHeadsOf(july, WALLET, "2026-06", ZURICH)).toEqual([]);
  });
});

describe('what "History" says of a payment', () => {
  function payment(fields: Partial<WalletPayment>): WalletPayment {
    return {
      id: "p",
      direction: "send",
      status: "completed",
      amountSats: 3_400n,
      feeSats: 4n,
      timestamp: Math.floor(NOW / 1000),
      network: "lightning",
      paymentHash: "AB".repeat(32),
      ...fields
    };
  }

  it("tells a payment's fee as its card's wallet paid it, by its payment hash", () => {
    const fees = sentFees([
      payment({}),
      payment({ id: "q", paymentHash: "cd".repeat(32), feeSats: 0n }),
      // Not a payment at a point of sale, or not done: no fee told.
      payment({ id: "r", paymentHash: "ef".repeat(32), status: "pending" }),
      payment({ id: "s", paymentHash: "01".repeat(32), direction: "receive" }),
      payment({ id: "t", paymentHash: undefined, network: "spark" })
    ]);
    expect([...fees]).toEqual([
      ["ab".repeat(32), 4n],
      ["cd".repeat(32), 0n]
    ]);
  });

  it("says why it was refused when it knows the reason the point of sale was given", () => {
    expect(refusalReasonOf("amount above limit")).toBe("aboveLimit");
    expect(refusalReasonOf("payee_not_approved")).toBe("newPayee");
    expect(refusalReasonOf("declined")).toBe("declined");
    expect(refusalReasonOf("card suspended")).toBe("suspended");
    // Unknown (an older or newer app's), or none: just "Refused".
    expect(refusalReasonOf("something else")).toBeNull();
    expect(refusalReasonOf("constructor")).toBeNull();
    expect(refusalReasonOf(null)).toBeNull();
  });
});
