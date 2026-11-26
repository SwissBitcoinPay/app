import {
  CARD_PAYMENTS_DIR_NAME,
  CARD_PAYMENTS_KEPT_MS,
  NewerCardPaymentsError,
  forgetCardPayments,
  isSpent,
  loadCardPayments,
  loadCardPaymentsToPublish,
  loadCardPaymentsToValue,
  logCardPayment,
  markCardPaymentsPublished,
  setCardPaymentValues,
  type CardPaymentEntry
} from "@/lib/card/payment-log";
import * as web from "@/lib/card/payment-log.web";

import type * as FileSystemFake from "../../jest/expo-file-system";

const fileSystem = jest.requireMock<typeof FileSystemFake>("expo-file-system");
const LOG_URI = `file:///data/user/0/ch.swissbitcoinpay.checkout.staging/files/${CARD_PAYMENTS_DIR_NAME}/log.json`;

const CARD = "0123456789abcdef0123456789abcdef";
const NOW = Date.UTC(2026, 9, 14, 12, 0, 0);
const HOUR = 3600 * 1000;

function entry(
  id: number,
  at: number,
  overrides: Partial<CardPaymentEntry> = {}
): CardPaymentEntry {
  return {
    id: id.toString(16),
    cardId: CARD,
    walletGeneration: 1,
    at,
    amountSats: 1_000n,
    paymentHash: id.toString(16).padStart(64, "0"),
    description: "Coffee",
    outcome: "sent",
    reason: null,
    pr: "lnbc1",
    payee: null,
    preimage: null,
    value: null,
    ...overrides
  };
}

const RELAYS = ["wss://relay.one", "wss://relay.two", "wss://relay.three"];

beforeEach(() => fileSystem.resetFileSystem());

describe("the phone's log of card payments", () => {
  it("is empty at first, then keeps each tap's latest outcome, oldest first", async () => {
    expect(await loadCardPayments()).toEqual([]);
    await logCardPayment(entry(1, NOW, { outcome: "sending" }));
    await logCardPayment(entry(2, NOW + 1, { outcome: "declined", reason: "daily limit reached" }));
    await logCardPayment(entry(1, NOW, { outcome: "sent" }));
    const log = await loadCardPayments();
    expect(log.map((e) => [e.id, e.outcome])).toEqual([
      ["2", "declined"],
      ["1", "sent"]
    ]);
    expect(log[1]!.amountSats).toBe(1_000n);
    expect(log[0]!.reason).toBe("daily limit reached");
  });

  it("is written whole under its irreversible name, amounts as whole numbers", async () => {
    await logCardPayment(entry(1, NOW, { amountSats: 99_999n }));
    const stored = JSON.parse(fileSystem.files.get(LOG_URI)!) as {
      version: number;
      entries: { amountSats: unknown }[];
    };
    expect(CARD_PAYMENTS_DIR_NAME).toBe("card-payments");
    expect(stored.version).toBe(4);
    expect(stored.entries[0]!.amountSats).toBe(99_999);
    expect([...fileSystem.files.keys()]).toEqual([LOG_URI]);
  });

  it("drops entries older than 90 days", async () => {
    await logCardPayment(entry(1, NOW - CARD_PAYMENTS_KEPT_MS - 1));
    await logCardPayment(entry(2, NOW - CARD_PAYMENTS_KEPT_MS + HOUR));
    await logCardPayment(entry(3, NOW));
    expect((await loadCardPayments()).map((e) => e.id)).toEqual(["2", "3"]);
  });

  it("keeps 2 000 entries, never dropping a payment the limits still count", async () => {
    // The day's payments first, then 2 000 refusals.
    await logCardPayment(entry(1, NOW - 23 * HOUR, { outcome: "sent" }));
    await logCardPayment(entry(2, NOW - 23 * HOUR, { outcome: "uncertain" }));
    await logCardPayment(entry(3, NOW - 30 * HOUR, { outcome: "sent" }));
    for (let id = 10; id < 2010; id += 1) {
      await logCardPayment(entry(id, NOW, { outcome: "declined", reason: "hourly limit reached" }));
    }
    const log = await loadCardPayments();
    expect(log).toHaveLength(2000);
    expect(log.slice(0, 2).map((e) => e.id)).toEqual(["1", "2"]);
    expect(log.some((e) => e.id === "3")).toBe(false);
  }, 60_000);

  it("refuses an entry that is not an amount of sats", async () => {
    await expect(logCardPayment(entry(1, NOW, { amountSats: 0n }))).rejects.toThrow();
    await expect(
      logCardPayment(entry(1, NOW, { amountSats: 2_100_000_000_000_001n }))
    ).rejects.toThrow();
    expect(fileSystem.files.size).toBe(0);
  });

  it("leaves out stored entries out of shape, and reads a damaged file as empty", async () => {
    await logCardPayment(entry(1, NOW));
    const stored = JSON.parse(fileSystem.files.get(LOG_URI)!) as { entries: unknown[] };
    stored.entries.push(
      { ...(stored.entries[0] as object), id: "2", amountSats: 1.5 },
      { ...(stored.entries[0] as object), id: "3", paymentHash: "zz" },
      { ...(stored.entries[0] as object), id: "4", outcome: "refunded" },
      { ...(stored.entries[0] as object), id: "5", cardId: "card" },
      null
    );
    fileSystem.files.set(LOG_URI, JSON.stringify(stored));
    expect((await loadCardPayments()).map((e) => e.id)).toEqual(["1"]);

    fileSystem.files.set(LOG_URI, "{not json");
    expect(await loadCardPayments()).toEqual([]);
  });

  it("is never written over by an older app, and refuses to be read", async () => {
    const newer = JSON.stringify({ version: 5, entries: [], more: true });
    await logCardPayment(entry(1, NOW));
    fileSystem.files.set(LOG_URI, newer);
    await expect(loadCardPayments()).rejects.toBeInstanceOf(NewerCardPaymentsError);
    await expect(logCardPayment(entry(2, NOW))).rejects.toBeInstanceOf(NewerCardPaymentsError);
    expect(fileSystem.files.get(LOG_URI)).toBe(newer);
  });

  it("keeps the invoice, who it paid with the proof, and the preimage", async () => {
    const payee = {
      status: "approved" as const,
      name: "Lakeside Bakery",
      metadata: '[["text/plain","Lakeside Bakery"],["text/identifier","sattleme01@breez.tips"]]',
      verify: `https://breez.tips/lnurlp/verify/${"a".repeat(64)}`,
      verifyAnswer: '{"status":"OK","settled":false,"preimage":null,"pr":"lnbc1"}'
    };
    await logCardPayment(entry(1, NOW, { pr: "lnbc1", payee, preimage: "b".repeat(64) }));
    expect(await loadCardPayments()).toEqual([
      entry(1, NOW, { pr: "lnbc1", payee, preimage: "b".repeat(64) })
    ]);
  });

  it("no longer reads a log of format 1 to 3: as an unreadable one, written over", async () => {
    const { value: _value, walletGeneration: _generation, ...old } = entry(1, NOW);
    const stored = { ...old, amountSats: 1000, revision: 0, published: null };
    for (const version of [1, 2, 3]) {
      fileSystem.files.set(
        LOG_URI,
        JSON.stringify({ version, publishedTo: RELAYS, entries: [stored] })
      );
      expect(await loadCardPayments()).toEqual([]);
    }
    // Nor an entry of format 4 in such a log.
    fileSystem.files.set(
      LOG_URI,
      JSON.stringify({
        version: 3,
        publishedTo: RELAYS,
        entries: [{ ...entry(1, NOW), amountSats: 1000, revision: 0, published: null }]
      })
    );
    expect(await loadCardPayments()).toEqual([]);
    await logCardPayment(entry(2, NOW + 1));
    expect(JSON.parse(fileSystem.files.get(LOG_URI)!)).toMatchObject({ version: 4 });
    expect((await loadCardPayments()).map((e) => e.id)).toEqual(["2"]);
  });

  it("never writes an entry it could not read back", async () => {
    const invalid: Partial<CardPaymentEntry>[] = [
      { pr: "x".repeat(2049) },
      { preimage: "B".repeat(64) },
      {
        payee: {
          status: "approved",
          name: null,
          metadata: "m".repeat(1025),
          verify: null,
          verifyAnswer: null
        }
      },
      { amountSats: -1n },
      { walletGeneration: 0 },
      { value: { minor: 1.5, digits: 2, currency: "CHF", hour: 0 } },
      { value: { minor: 100, digits: 2, currency: "BTC", hour: 0 } },
      { value: { minor: 100, digits: 2, currency: "CHF", hour: 60 } }
    ];
    for (const overrides of invalid) {
      await expect(logCardPayment(entry(1, NOW, overrides))).rejects.toThrow();
    }
    expect(fileSystem.files.has(LOG_URI)).toBe(false);
  });

  it('forgets the payments of the cards\' wallets erased only ("Delete the card")', async () => {
    const OTHER = "fedcba9876543210fedcba9876543210";
    await logCardPayment(entry(1, NOW));
    await logCardPayment(entry(2, NOW + 1, { walletGeneration: 2 }));
    await logCardPayment(entry(3, NOW + 2, { cardId: OTHER }));
    // The card's first wallet erased (deleted, then added again): its second's kept.
    await expect(forgetCardPayments(new Map([[CARD, 1]]))).resolves.toBe(1);
    expect((await loadCardPayments()).map((e) => e.id)).toEqual(["2", "3"]);
    await expect(forgetCardPayments(new Map([[CARD, 1]]))).resolves.toBe(0);
    // Deleted again: its second wallet's go too.
    await expect(forgetCardPayments(new Map([[CARD, 2]]))).resolves.toBe(1);
    expect((await loadCardPayments()).map((e) => e.id)).toEqual(["3"]);
  });

  it("counts as spent what is sent, being sent or maybe sent", () => {
    expect(isSpent(entry(1, NOW, { outcome: "sending" }))).toBe(true);
    expect(isSpent(entry(1, NOW, { outcome: "sent" }))).toBe(true);
    expect(isSpent(entry(1, NOW, { outcome: "uncertain" }))).toBe(true);
    expect(isSpent(entry(1, NOW, { outcome: "declined" }))).toBe(false);
    expect(isSpent(entry(1, NOW, { outcome: "failed" }))).toBe(false);
  });
});

describe("the values of the payments", () => {
  const CHF = { minor: 85, digits: 2, currency: "CHF", hour: 1_792_000_800 };

  it("are worked out for the payments that left, as their next write", async () => {
    await logCardPayment(entry(1, NOW, { outcome: "sent" }));
    await logCardPayment(entry(2, NOW + 1, { outcome: "uncertain" }));
    await logCardPayment(entry(3, NOW + 2, { outcome: "declined", reason: "declined" }));
    await logCardPayment(entry(4, NOW + 3, { outcome: "sending" }));
    await logCardPayment(entry(5, NOW - 400 * 24 * HOUR, { outcome: "sent" }));
    await markCardPaymentsPublished(
      RELAYS,
      new Map([
        ["1", 0],
        ["2", 0],
        ["3", 0],
        ["4", 0]
      ])
    );
    // Refused, still being sent, or older than the rates' history: none to work out.
    expect((await loadCardPaymentsToValue(NOW - 365 * 24 * HOUR)).map((e) => e.id)).toEqual([
      "1",
      "2"
    ]);
    await setCardPaymentValues(
      new Map([
        ["1", CHF],
        ["3", CHF]
      ])
    );
    expect(await loadCardPayments()).toMatchObject([
      { id: "1", value: CHF },
      { id: "2", value: null },
      { id: "3", value: null },
      { id: "4", value: null },
      { id: "5", value: null }
    ]);
    // Its next write: published again, with its value.
    expect(await loadCardPaymentsToPublish(RELAYS, NOW)).toEqual([
      { entry: entry(1, NOW, { outcome: "sent", value: CHF }), revision: 1 }
    ]);
    // Never worked out twice.
    await setCardPaymentValues(new Map([["1", { ...CHF, minor: 99 }]]));
    expect((await loadCardPayments()).find((e) => e.id === "1")?.value).toEqual(CHF);
  });

  it("are kept when the payment is written again, gone when it turns out not to have left", async () => {
    await logCardPayment(entry(1, NOW, { outcome: "uncertain" }));
    await setCardPaymentValues(new Map([["1", CHF]]));
    await logCardPayment(entry(1, NOW, { outcome: "sent" }));
    expect((await loadCardPayments())[0].value).toEqual(CHF);
    await logCardPayment(entry(1, NOW, { outcome: "failed", reason: "failed" }));
    expect((await loadCardPayments())[0].value).toBeNull();
  });

  it("are none in the web app", async () => {
    await expect(web.loadCardPaymentsToValue(0)).resolves.toEqual([]);
    await expect(web.setCardPaymentValues(new Map())).resolves.toBeUndefined();
  });
});

describe("what the account's relays took of the log", () => {
  it("counts each write of a tap, and keeps which one a majority took", async () => {
    await logCardPayment(entry(1, NOW, { outcome: "sending" }));
    await logCardPayment(entry(2, NOW + 1, { outcome: "declined", reason: "declined" }));
    expect(await loadCardPaymentsToPublish(RELAYS, NOW)).toEqual([
      { entry: entry(1, NOW, { outcome: "sending" }), revision: 0 },
      { entry: entry(2, NOW + 1, { outcome: "declined", reason: "declined" }), revision: 0 }
    ]);
    await markCardPaymentsPublished(RELAYS, new Map([["1", 0]]));
    expect((await loadCardPaymentsToPublish(RELAYS, NOW)).map(({ entry: e }) => e.id)).toEqual([
      "2"
    ]);
    // Written again (sent): its next revision, to publish again.
    await logCardPayment(entry(1, NOW, { outcome: "sent" }));
    expect(await loadCardPaymentsToPublish(RELAYS, NOW)).toEqual([
      { entry: entry(2, NOW + 1, { outcome: "declined", reason: "declined" }), revision: 0 },
      { entry: entry(1, NOW, { outcome: "sent" }), revision: 1 }
    ]);
    // A mark of the earlier write, taken meanwhile, does not count for the later one.
    await markCardPaymentsPublished(
      RELAYS,
      new Map([
        ["1", 0],
        ["2", 0]
      ])
    );
    expect(await loadCardPaymentsToPublish(RELAYS, NOW)).toEqual([
      { entry: entry(1, NOW, { outcome: "sent" }), revision: 1 }
    ]);
    await markCardPaymentsPublished(RELAYS, new Map([["1", 1]]));
    expect(await loadCardPaymentsToPublish(RELAYS, NOW)).toEqual([]);
    expect(JSON.parse(fileSystem.files.get(LOG_URI)!)).toMatchObject({
      version: 4,
      publishedTo: RELAYS,
      entries: [
        { id: "2", revision: 0, published: 0 },
        { id: "1", revision: 1, published: 1 }
      ]
    });
  });

  it("are all to publish on another list of relays, what the former one took forgotten", async () => {
    await logCardPayment(entry(1, NOW));
    await logCardPayment(entry(2, NOW + 1));
    await markCardPaymentsPublished(
      RELAYS,
      new Map([
        ["1", 0],
        ["2", 0]
      ])
    );
    const moved = ["wss://relay.four", ...RELAYS.slice(1)];
    expect((await loadCardPaymentsToPublish(moved, NOW)).map(({ entry: e }) => e.id)).toEqual([
      "1",
      "2"
    ]);
    await markCardPaymentsPublished(moved, new Map([["2", 0]]));
    expect((await loadCardPaymentsToPublish(moved, NOW)).map(({ entry: e }) => e.id)).toEqual([
      "1"
    ]);
    // The former list again: none of its marks kept.
    expect(await loadCardPaymentsToPublish(RELAYS, NOW)).toHaveLength(2);
  });

  it("leaves out what expired: its record would be refused", async () => {
    await logCardPayment(entry(1, NOW - CARD_PAYMENTS_KEPT_MS + HOUR));
    await logCardPayment(entry(2, NOW));
    expect(
      (await loadCardPaymentsToPublish(RELAYS, NOW + HOUR)).map(({ entry: e }) => e.id)
    ).toEqual(["2"]);
  });

  it("refuses marks out of shape in the file, read as never published", async () => {
    await logCardPayment(entry(1, NOW));
    await markCardPaymentsPublished(RELAYS, new Map([["1", 0]]));
    const stored = JSON.parse(fileSystem.files.get(LOG_URI)!) as { entries: object[] };
    for (const marks of [
      { revision: -1 },
      { revision: 1.5 },
      { published: 2 },
      { revision: "0" }
    ]) {
      fileSystem.files.set(
        LOG_URI,
        JSON.stringify({ ...stored, entries: [{ ...stored.entries[0], ...marks }] })
      );
      expect(await loadCardPayments()).toEqual([]);
    }
    fileSystem.files.set(LOG_URI, JSON.stringify({ ...stored, publishedTo: "wss://relay.one" }));
    expect(await loadCardPaymentsToPublish(RELAYS, NOW)).toHaveLength(1);
  });

  it("is empty in the web app, which logs no card payment", async () => {
    await expect(web.loadCardPayments()).resolves.toEqual([]);
    await expect(web.loadCardPaymentsToPublish(RELAYS, NOW)).resolves.toEqual([]);
    await expect(web.markCardPaymentsPublished(RELAYS, new Map())).resolves.toBeUndefined();
    await expect(web.logCardPayment(entry(1, NOW))).rejects.toThrow();
    expect(web.isSpent(entry(1, NOW))).toBe(true);
  });
});
