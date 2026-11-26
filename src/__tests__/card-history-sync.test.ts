import { closeAccount, updateAccount } from "@/features/account/session";
import type { CardWalletLease } from "@/features/card/card-wallet";
import {
  MOVEMENTS_RECORD_INTERVAL_MS,
  publishCardHistory,
  readCardHistory,
  noteCardWithdrawal,
  recordCardMovements,
  recordCardMovementsDaily,
  resetCardMovementRecords
} from "@/features/card/history-sync";
import { withCardAccess } from "@/features/card/states";
import type { Wallet, WalletPayment } from "@/lib/breez/types";
import { cardWallet } from "@/lib/breez/wallet";
import { FIRST_CARD_WALLET_GENERATION } from "@/lib/card/keys";
import {
  deriveHistoryRecordKeys,
  historyAddress,
  historyEvent,
  historyValue,
  movementAddress,
  movementEvent,
  movementValue,
  type HistoryRecordKeys
} from "@/lib/card/history-records";
import {
  CARD_PAYMENTS_KEPT_MS,
  loadCardPaymentsToPublish,
  logCardPayment,
  type CardPaymentEntry
} from "@/lib/card/payment-log";
import { readLog } from "@/lib/log/log";
import type { NostrEvent } from "@/lib/nostr/event";
import { publishToRelays } from "@/lib/nostr/pool";
import { sealRecord } from "@/lib/nostr/record";
import { currentRelays, setCurrentRelays } from "@/lib/relays/current";

import { openTestAccount, TEST_WALLET_ID } from "../../jest/account";
import type * as BreezFake from "../../jest/breez-sdk";
import { coingecko, setCoingeckoPrice } from "../../jest/coingecko";
import type * as FileSystemFake from "../../jest/expo-file-system";
import type * as RelaysFake from "../../jest/nostr-relays";

/*
 * The card payments on the account's relays (the history on Nostr): each
 * write of the phone's log published to a majority, read back by the web app and the other phones.
 */

// The card wallets of recordCardMovementsDaily connect: this build's network.
jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { extra: { breezNetwork: "mainnet" } } }
}));

const nostr = jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");
const fileSystem = jest.requireMock<typeof FileSystemFake>("expo-file-system");

const CARD = "0123456789abcdef0123456789abcdef";
/** Its wallet: its first. */
const OF_CARD = { cardId: CARD, walletGeneration: 1 };
const OTHER_CARD = "fedcba9876543210fedcba9876543210";
const NOW = Date.UTC(2026, 9, 15, 9, 0);

function entry(id: string, at: number, fields: Partial<CardPaymentEntry> = {}): CardPaymentEntry {
  return {
    id,
    cardId: CARD,
    walletGeneration: 1,
    at,
    amountSats: 1_000n,
    paymentHash: id.padStart(64, "0"),
    description: "Coffee",
    outcome: "sent",
    reason: null,
    pr: "lnbc10u1fake",
    payee: null,
    preimage: null,
    value: null,
    ...fields
  };
}

let keys: HistoryRecordKeys;

/** The records of the history's author a relay holds. */
function historyRecords(relay: string): NostrEvent[] {
  return (nostr.stored.get(relay) ?? []).filter((event) => event.pubkey === keys.nostr.publicKey);
}

const publish = (now = NOW) => withCardAccess((access) => publishCardHistory(access, now));
const read = (now = NOW) => withCardAccess((access) => readCardHistory(access, now));

beforeEach(async () => {
  nostr.resetRelays();
  fileSystem.resetFileSystem();
  await openTestAccount();
  keys = await withCardAccess(async ({ root }) => deriveHistoryRecordKeys(root));
});

afterEach(() => {
  setCurrentRelays(null);
  closeAccount();
});

describe("the phone's card payments on the account's relays", () => {
  it("are published to every relay, sealed, and read back newest first", async () => {
    await logCardPayment(entry("a1", NOW - 60_000, { outcome: "declined", reason: "declined" }));
    await logCardPayment(entry("a2", NOW));
    await expect(publish()).resolves.toBe(0);
    for (const relay of currentRelays()) {
      const records = historyRecords(relay);
      expect(records).toHaveLength(2);
      // Long enough never to be found by chance in the ciphertext's base64.
      expect(JSON.stringify(records)).not.toContain(CARD);
      expect(JSON.stringify(records)).not.toContain("lnbc10u1fake");
    }
    await expect(loadCardPaymentsToPublish(currentRelays(), NOW)).resolves.toEqual([]);
    // Another phone, or the web app: read from the relays alone.
    fileSystem.resetFileSystem();
    const history = await read();
    expect(history).toEqual({
      entries: [
        entry("a2", NOW),
        entry("a1", NOW - 60_000, { outcome: "declined", reason: "declined" })
      ],
      movements: [],
      heads: new Map(),
      withdrawals: new Map(),
      recorded: { taps: expect.any(Array), movements: [] },
      newerAt: new Set(),
      conclusive: true,
      newer: false,
      relays: currentRelays()
    });
    expect(history.recorded.taps.map(({ entry: e, revision }) => [e.id, revision]).sort()).toEqual([
      ["a1", 0],
      ["a2", 0]
    ]);
  });

  it("are published with what they were worth once worked out", async () => {
    await updateAccount({ displayCurrency: "CHF" });
    const hour = Math.floor(NOW / 1000 / 3600) * 3600 - 3 * 3600;
    setCoingeckoPrice("CHF", hour, 84_950);
    await logCardPayment(entry("e1", (hour + 600) * 1000, { amountSats: 29_901n }));
    await logCardPayment(
      entry("e2", (hour + 601) * 1000, { outcome: "declined", reason: "declined" })
    );
    await publish();
    fileSystem.resetFileSystem();
    const value = { minor: 2540, digits: 2, currency: "CHF", hour };
    expect((await read()).entries).toEqual([
      entry("e2", (hour + 601) * 1000, { outcome: "declined", reason: "declined" }),
      entry("e1", (hour + 600) * 1000, { amountSats: 29_901n, value })
    ]);
    // Its value's write, dated after the first.
    for (const relay of currentRelays()) {
      expect(
        historyRecords(relay)
          .map((record) => record.created_at)
          .sort()
      ).toEqual([hour + 600 + 1, hour + 601]);
    }
  });

  it("publish each later write of a tap, dated after the one before", async () => {
    await logCardPayment(entry("b1", NOW, { outcome: "sending" }));
    await publish();
    await logCardPayment(entry("b1", NOW, { outcome: "sent" }));
    await logCardPayment(entry("b1", NOW, { outcome: "sent", preimage: "cd".repeat(32) }));
    await publish();
    for (const relay of currentRelays()) {
      expect(historyRecords(relay).map((record) => record.created_at)).toEqual([
        Math.floor(NOW / 1000) + 2
      ]);
    }
    expect((await read()).entries).toEqual([
      entry("b1", NOW, { outcome: "sent", preimage: "cd".repeat(32) })
    ]);
  });

  it("keep what no majority took, published at the next sync", async () => {
    const relays = currentRelays();
    for (const relay of relays.slice(0, 3)) nostr.readOnly.add(relay);
    await logCardPayment(entry("c1", NOW));
    await expect(publish()).resolves.toBe(1);
    nostr.readOnly.clear();
    await expect(publish()).resolves.toBe(0);
    for (const relay of relays) expect(historyRecords(relay)).toHaveLength(1);
    // Nothing left: nothing asked of the relays.
    const calls = nostr.calls.length;
    await expect(publish()).resolves.toBe(0);
    expect(nostr.calls).toHaveLength(calls);
  });

  it("go to another list of relays whole, once the account's list changes", async () => {
    await logCardPayment(entry("d1", NOW));
    await logCardPayment(entry("d2", NOW + 1000));
    await publish();
    const moved = [
      "wss://relay.one.example",
      "wss://relay.two.example",
      "wss://relay.three.example"
    ];
    setCurrentRelays(moved);
    await expect(publish()).resolves.toBe(0);
    for (const relay of moved) expect(historyRecords(relay)).toHaveLength(2);
    expect((await read()).entries.map(({ id }) => id)).toEqual(["d2", "d1"]);
  });

  it("are never published nor shown past 90 days, as the relays drop them", async () => {
    await logCardPayment(entry("e1", NOW - CARD_PAYMENTS_KEPT_MS + 60_000));
    await logCardPayment(entry("e2", NOW));
    await publish(NOW + 120_000);
    for (const relay of currentRelays()) expect(historyRecords(relay)).toHaveLength(1);
    // A relay that keeps an expired record: not shown either.
    await logCardPayment(entry("e3", NOW + 1000));
    await publish();
    expect((await read(NOW + CARD_PAYMENTS_KEPT_MS + 500)).entries.map(({ id }) => id)).toEqual([
      "e3"
    ]);
  });

  it("are not proven when no majority of the relays answers", async () => {
    await logCardPayment(entry("f1", NOW));
    await publish();
    for (const relay of currentRelays().slice(0, 3)) nostr.unreachable.add(relay);
    await expect(read()).resolves.toMatchObject({ conclusive: false });
  });

  it("leave out a newer app's records, and say so", async () => {
    await logCardPayment(entry("9a1", NOW));
    await publish();
    const newer = sealRecord({
      type: "card-payment",
      value: { ...historyValue({ entry: entry("9a2", NOW), revision: 0 }), version: 3 },
      signer: keys.nostr.secretKey,
      encryptionKey: keys.encryptionKey,
      address: historyAddress(keys, "9a2"),
      createdAt: Math.floor(NOW / 1000),
      block: 1024
    });
    await publishToRelays(newer, {
      relays: currentRelays(),
      channel: "account",
      timeoutMs: 1000,
      authKey: keys.nostr.secretKey
    });
    await expect(read()).resolves.toMatchObject({
      entries: [entry("9a1", NOW)],
      movements: [],
      conclusive: true,
      newer: true
    });
    expect((await read()).newerAt.size).toBe(1);
  });

  it("are read whole, more of them than a relay sends at once", async () => {
    const count = nostr.MAX_EVENTS_PER_FILTER + 10;
    const events = Array.from({ length: count }, (_, index) =>
      historyEvent(keys, { entry: entry(`f${index}`, NOW - index * 1000), revision: 0 })
    );
    for (const event of events) {
      await publishToRelays(event, {
        relays: currentRelays(),
        channel: "account",
        timeoutMs: 1000,
        authKey: keys.nostr.secretKey
      });
    }
    const history = await read();
    expect(history.conclusive).toBe(true);
    expect(history.entries).toHaveLength(count);
  });
});

describe("the recharges and returns of a card", () => {
  const HOUR = Math.floor(Date.now() / 1000 / 3600) * 3600 - 48 * 3600;

  /** A card's wallet, connected, whose payments are `payments` (newest first, as the SDK). */
  function leaseOf(payments: WalletPayment[]): CardWalletLease {
    const wallet = {
      listPaymentsPage: async ({ offset = 0, limit = 200 } = {}) => ({
        payments: payments.slice(offset, offset + limit),
        listed: Math.max(0, Math.min(limit, payments.length - offset))
      })
    };
    return {
      cardId: CARD,
      generation: 1,
      walletId: "02".padEnd(66, "c"),
      wallet: wallet as unknown as Wallet,
      release: async () => undefined
    };
  }

  function received(id: string, at: number, fields: Partial<WalletPayment> = {}): WalletPayment {
    return {
      id,
      direction: "receive",
      status: "completed",
      amountSats: 20_000n,
      feeSats: 0n,
      timestamp: at,
      network: "spark",
      ...fields
    };
  }

  const record = (lease: CardWalletLease, history: Awaited<ReturnType<typeof readHistory>>) =>
    withCardAccess((access) => recordCardMovements(access, lease, history));
  const readHistory = () => withCardAccess((access) => readCardHistory(access));

  it("are recorded with their value, once, for every device of the account", async () => {
    await updateAccount({ displayCurrency: "CHF" });
    setCoingeckoPrice("CHF", HOUR, 84_000);
    const lease = leaseOf([
      received("m2", HOUR + 900, { network: "lightning", description: "Card top-up" }),
      received("m1", HOUR + 600),
      // A payment at a point of sale: its tap's, never a movement.
      received("p1", HOUR + 300, { direction: "send", network: "lightning" })
    ]);
    const kept = await record(lease, await readHistory());
    const value = { minor: 1680, digits: 2, currency: "CHF", hour: HOUR };
    expect(
      kept.map(({ movement, revision }) => [movement.id, movement.way, movement.value, revision])
    ).toEqual([
      ["m2", "invoice", value, 0],
      ["m1", "main", value, 0]
    ]);
    // Another device reads them from the relays.
    const history = await readHistory();
    expect(history.movements).toEqual(kept);
    for (const relay of currentRelays()) expect(historyRecords(relay)).toHaveLength(2);
    // Read again: nothing more to write.
    const before = nostr.calls.length;
    await record(lease, history);
    expect(nostr.calls.slice(before).filter((call) => call.operation === "publish")).toEqual([]);
  });

  it("never take what the wallet cannot tell: its format has no such movement", async () => {
    await updateAccount({ displayCurrency: "CHF" });
    setCoingeckoPrice("CHF", HOUR, 84_000);
    const lease = leaseOf([
      received("u2", HOUR + 900, { network: "unknown", direction: "send" }),
      received("u1", HOUR + 600, { network: "unknown" }),
      received("m1", HOUR + 300)
    ]);
    const kept = await record(lease, await readHistory());
    expect(kept.map(({ movement }) => [movement.id, movement.kind])).toEqual([["m1", "recharge"]]);
    for (const relay of currentRelays()) expect(historyRecords(relay)).toHaveLength(1);
    expect((await readHistory()).movements.map(({ movement }) => movement.id)).toEqual(["m1"]);
  });

  it("get their value as their next write once CoinGecko answers", async () => {
    await updateAccount({ displayCurrency: "CHF" });
    setCoingeckoPrice("CHF", HOUR, 84_000);
    coingecko.down = true;
    const lease = leaseOf([received("m1", HOUR + 600)]);
    expect((await record(lease, await readHistory()))[0]).toMatchObject({
      movement: { value: null },
      revision: 0
    });
    coingecko.down = false;
    const kept = await record(lease, await readHistory());
    expect(kept[0]).toMatchObject({ movement: { value: { minor: 1680 } }, revision: 1 });
    expect((await readHistory()).movements).toEqual(kept);
  });

  it("are written only after a majority's read, and never over a newer app's record", async () => {
    const lease = leaseOf([received("m1", HOUR + 600), received("m2", HOUR + 700)]);
    const relays = currentRelays();
    for (const relay of relays.slice(0, 3)) nostr.unreachable.add(relay);
    const partial = await readHistory();
    expect(partial.conclusive).toBe(false);
    expect(await record(lease, partial)).toHaveLength(2);
    nostr.unreachable.clear();
    for (const relay of relays) expect(historyRecords(relay)).toEqual([]);
    // A newer app recorded the second.
    const newer = sealRecord({
      type: "card-movement",
      value: {
        ...movementValue({
          movement: {
            id: "m2",
            cardId: CARD,
            walletGeneration: 1,
            kind: "recharge",
            way: "main",
            at: (HOUR + 700) * 1000,
            amountSats: 20_000n,
            feeSats: 0n,
            txid: null,
            description: null,
            value: null
          },
          revision: 0
        }),
        version: 3
      },
      signer: keys.nostr.secretKey,
      encryptionKey: keys.encryptionKey,
      address: movementAddress(keys, { cardId: CARD, id: "m2" }),
      createdAt: HOUR + 700
    });
    await publishToRelays(newer, {
      relays,
      channel: "account",
      timeoutMs: 1000,
      authKey: keys.nostr.secretKey
    });
    await record(lease, await readHistory());
    for (const relay of relays) {
      const held = historyRecords(relay);
      expect(held).toHaveLength(2);
      expect(held).toContainEqual(newer);
    }
  });

  it("are written to the list they were read on, nothing once the account left it", async () => {
    const lease = leaseOf([received("m1", HOUR + 600)]);
    const left = currentRelays();
    const history = await readHistory();
    expect(history.relays).toEqual(left);
    // The account's relays changed since the read: its revisions are the list's it left.
    const moved = [
      "wss://relay.one.example",
      "wss://relay.two.example",
      "wss://relay.three.example"
    ];
    setCurrentRelays(moved);
    const before = nostr.calls.length;
    expect(await record(lease, history)).toMatchObject([{ movement: { id: "m1" }, revision: 0 }]);
    expect(nostr.calls.slice(before).filter((call) => call.operation === "publish")).toEqual([]);
    // Read on the new list: recorded there.
    await record(lease, await readHistory());
    for (const relay of moved) expect(historyRecords(relay)).toHaveLength(1);
    for (const relay of left) expect(historyRecords(relay)).toEqual([]);
  });

  it("record a noted withdrawal as one (format 2), a Spark transfer sent as a return once read whole", async () => {
    await updateAccount({ displayCurrency: "CHF" });
    setCoingeckoPrice("CHF", HOUR, 84_000);
    const ID = "4f7a9c62-1d3e-4b8a-9c71-2f5e6d8a0b13";
    const sent = (id: string, at: number, fields: Partial<WalletPayment> = {}) =>
      received(id, at, { direction: "send", ...fields });
    const lease = leaseOf([
      sent(ID, HOUR + 900),
      sent("s1", HOUR + 800),
      sent("b1", HOUR + 700, { network: "bitcoin", txId: "ab".repeat(32), feeSats: 640n })
    ]);
    expect(
      await withCardAccess((access) =>
        noteCardWithdrawal(access, { cardId: CARD, walletGeneration: 1, id: ID, way: "spark" })
      )
    ).toBe(true);
    // Read on a minority: nothing written; the noted one known all the same.
    const relays = currentRelays();
    for (const relay of relays.slice(0, 3)) nostr.unreachable.add(relay);
    const partial = await readHistory();
    expect(partial.conclusive).toBe(false);
    // The note is on every relay: those that answered gave it.
    expect(partial.withdrawals.has(`${CARD}/${ID}`)).toBe(true);
    const unsure = await record(lease, partial);
    // The transfer without a note not known yet (a return, or another app's withdrawal): left out.
    expect(unsure.map(({ movement }) => [movement.id, movement.kind])).toEqual([
      [ID, "withdrawal"],
      ["b1", "withdrawal"]
    ]);
    // Nothing recorded without a majority's read: each relay holds the note alone.
    for (const relay of relays) expect(historyRecords(relay)).toHaveLength(1);
    nostr.unreachable.clear();
    const kept = await record(lease, await readHistory());
    expect(kept.map(({ movement }) => [movement.id, movement.kind, movement.way])).toEqual([
      [ID, "withdrawal", "spark"],
      ["s1", "return", null],
      ["b1", "withdrawal", "onchain"]
    ]);
    const history = await readHistory();
    expect(history.movements).toEqual(kept);
    // A withdrawal's record in format 2: an app of before leaves it.
    const withdrawals = history.movements.filter(({ movement }) => movement.kind === "withdrawal");
    expect(withdrawals.map(({ movement }) => movement.value)).toEqual([
      { minor: 1680, digits: 2, currency: "CHF", hour: HOUR },
      { minor: 1680, digits: 2, currency: "CHF", hour: HOUR }
    ]);
  });

  it("write a withdrawal an app of before recorded as a return again, as the withdrawal, its value kept", async () => {
    const ID = "4f7a9c62-1d3e-4b8a-9c71-2f5e6d8a0b13";
    const at = HOUR + 900;
    const value = { minor: 588, digits: 2, currency: "CHF", hour: HOUR };
    const relays = currentRelays();
    await publishToRelays(
      movementEvent(keys, {
        movement: {
          id: ID,
          cardId: CARD,
          walletGeneration: 1,
          kind: "return",
          way: null,
          at: at * 1000,
          amountSats: 7_000n,
          feeSats: 0n,
          txid: null,
          description: null,
          value
        },
        revision: 0
      }),
      { relays, channel: "account", timeoutMs: 1000, authKey: keys.nostr.secretKey }
    );
    const lease = leaseOf([received(ID, at, { direction: "send", amountSats: 7_000n })]);
    // Without its note: the return, as it is.
    expect(await record(lease, await readHistory())).toMatchObject([
      { movement: { kind: "return", value }, revision: 0 }
    ]);
    await withCardAccess((access) =>
      noteCardWithdrawal(access, { cardId: CARD, walletGeneration: 1, id: ID, way: "spark" })
    );
    const kept = await record(lease, await readHistory());
    expect(kept).toMatchObject([
      { movement: { kind: "withdrawal", way: "spark", value }, revision: 1 }
    ]);
    expect((await readHistory()).movements).toEqual(kept);
    // Written once: read again, nothing more.
    const before = nostr.calls.length;
    await record(lease, await readHistory());
    expect(nostr.calls.slice(before).filter((call) => call.operation === "publish")).toEqual([]);
  });

  it("leave out what is older than their records live", async () => {
    const old = Math.floor((Date.now() - CARD_PAYMENTS_KEPT_MS) / 1000) - 3600;
    expect(await record(leaseOf([received("m1", old)]), await readHistory())).toEqual([]);
    for (const relay of currentRelays()) expect(historyRecords(relay)).toEqual([]);
  });
});

describe('the recharges and returns recorded from "Cards" (recordCardMovementsDaily)', () => {
  const sdk = jest.requireMock<typeof BreezFake>("@breeztech/breez-sdk-spark-react-native");

  /** A transfer from the account's wallet, as the SDK's bindings give it (jest/breez-sdk.ts). */
  function recharge(id: string, at: number): Record<string, unknown> {
    return {
      id,
      paymentType: sdk.PaymentType.Receive,
      status: sdk.PaymentStatus.Completed,
      amount: 20_000n,
      fees: 0n,
      timestamp: BigInt(Math.floor(at / 1000)),
      method: sdk.PaymentMethod.Spark,
      details: { tag: sdk.PaymentDetails_Tags.Spark, inner: { invoiceDetails: undefined } }
    };
  }

  const apiKey = process.env.EXPO_PUBLIC_BREEZ_API_KEY;

  beforeEach(() => {
    process.env.EXPO_PUBLIC_BREEZ_API_KEY = "test-api-key";
    resetCardMovementRecords();
  });

  afterEach(() => {
    process.env.EXPO_PUBLIC_BREEZ_API_KEY = apiKey;
  });

  it("are recorded once a day per card on a device, the card's wallet released after", async () => {
    const now = Date.now();
    const wallet = sdk.fakeCardWallet(CARD);
    wallet.payments = [recharge("m1", now - 3_600_000)];
    await recordCardMovementsDaily(TEST_WALLET_ID, OF_CARD, now);
    for (const relay of currentRelays()) expect(historyRecords(relay)).toHaveLength(1);
    expect(cardWallet(CARD, FIRST_CARD_WALLET_GENERATION).isConnected()).toBe(false);
    // Again within the day: nothing read nor written.
    wallet.payments = [recharge("m2", now - 60_000), ...wallet.payments];
    const before = nostr.calls.length;
    await recordCardMovementsDaily(TEST_WALLET_ID.toUpperCase(), OF_CARD, now + 3_600_000);
    expect(nostr.calls.length).toBe(before);
    // Another card's: its own day.
    sdk.fakeCardWallet(OTHER_CARD).payments = [recharge("o1", now - 60_000)];
    await recordCardMovementsDaily(
      TEST_WALLET_ID,
      { cardId: OTHER_CARD, walletGeneration: 1 },
      now + 3_600_000
    );
    for (const relay of currentRelays()) expect(historyRecords(relay)).toHaveLength(2);
    // A day later: the new one too.
    await recordCardMovementsDaily(TEST_WALLET_ID, OF_CARD, now + MOVEMENTS_RECORD_INTERVAL_MS);
    for (const relay of currentRelays()) expect(historyRecords(relay)).toHaveLength(3);
    expect(cardWallet(CARD, FIRST_CARD_WALLET_GENERATION).isConnected()).toBe(false);
  });

  it("are not recorded for an account no longer open", async () => {
    sdk.fakeCardWallet(CARD).payments = [recharge("m1", Date.now() - 3_600_000)];
    await recordCardMovementsDaily("03".padEnd(66, "a"), OF_CARD);
    for (const relay of currentRelays()) expect(historyRecords(relay)).toEqual([]);
    expect(sdk.fakeCardWallet(CARD).identity).toBeNull();
  });

  it("never reject: a wallet that does not connect goes to the journal", async () => {
    sdk.fakeCardWallet(CARD).payments = [recharge("m1", Date.now() - 3_600_000)];
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    sdk.connect.mockRejectedValueOnce(new Error("Network error"));
    await expect(recordCardMovementsDaily(TEST_WALLET_ID, OF_CARD)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith("Recording a card's movements failed", expect.anything());
    warn.mockRestore();
    expect(
      readLog().entries.filter((entry) => entry.event === "Recording a card's movements failed")
    ).toMatchObject([{ error: { kind: "WalletError", code: "connectFailed" } }]);
    for (const relay of currentRelays()) expect(historyRecords(relay)).toEqual([]);
    expect(cardWallet(CARD, FIRST_CARD_WALLET_GENERATION).isConnected()).toBe(false);
  });
});
