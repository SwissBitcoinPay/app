import { renderHook, waitFor } from "@testing-library/react-native";
import { Platform } from "react-native";

import { DEFAULT_CARD_RELAY_HOST } from "@/config/card";
import { closeAccount } from "@/features/account/session";
import {
  COPIES_PER_ROUND,
  COPY_INTERVAL_MS,
  MONTH_REFRESH_SECONDS,
  copyCardHistory,
  copyCardHistoryDaily,
  readCardHistoryMonth
} from "@/features/card/history-copies";
import { readCardHistory } from "@/features/card/history-sync";
import { recordCardState, withCardAccess } from "@/features/card/states";
import { useCards } from "@/features/card/useCards";
import type { CardMovement } from "@/lib/card/card-movement";
import {
  deriveMonthPartKeys,
  monthCopy,
  monthEntries,
  monthPartEvent,
  type MonthPart,
  type MonthPartKeys
} from "@/lib/card/history-months";
import {
  deriveHistoryRecordKeys,
  historyAddress,
  historyEvent,
  historyValue,
  monthHeadEvent,
  movementEvent,
  type HistoryCopy,
  type HistoryRecordKeys,
  type MovementCopy
} from "@/lib/card/history-records";
import { monthOf, monthSet, type MonthHead } from "@/lib/card/month-head";
import type { CardPaymentEntry } from "@/lib/card/payment-entry";
import type { NostrEvent } from "@/lib/nostr/event";
import { publishToRelays } from "@/lib/nostr/pool";
import { sealRecord } from "@/lib/nostr/record";
import * as relaysOfAccount from "@/lib/relays/current";
import { currentRelays } from "@/lib/relays/current";

import { openTestAccount } from "../../jest/account";
import type * as RelaysFake from "../../jest/nostr-relays";

/*
 * The copies of each card's months: the whole history kept, rewritten each year as "Wallet"'s.
 */

const nostr = jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");
const CARD = "0123456789abcdef0123456789abcdef";
/** The card's first wallet, whose months the tests copy. */
const WALLET = { cardId: CARD, walletGeneration: 1 };

/** The first instant of last month and of this one (UTC): the records of last month live still. */
const today = new Date();
const LAST_MONTH = Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1);
const THIS_MONTH = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1);

let historyKeys: HistoryRecordKeys;
let partKeys: MonthPartKeys;

function tap(
  id: string,
  at: number,
  revision = 0,
  cardId = CARD,
  walletGeneration = 1
): HistoryCopy {
  const entry: CardPaymentEntry = {
    id,
    cardId,
    walletGeneration,
    at,
    amountSats: 3_400n,
    paymentHash: id.padStart(64, "0"),
    description: "Lakeside Coffee",
    outcome: "sent",
    reason: null,
    pr: "lnbc34u1fake",
    payee: null,
    preimage: null,
    value: null
  };
  return { entry, revision };
}

function movement(id: string, at: number): MovementCopy {
  const moved: CardMovement = {
    id,
    ...WALLET,
    kind: "recharge",
    way: "main",
    at,
    amountSats: 20_000n,
    feeSats: 0n,
    txid: null,
    description: null,
    value: null
  };
  return { movement: moved, revision: 0 };
}

async function publish(event: NostrEvent, authKey: Uint8Array): Promise<void> {
  await publishToRelays(event, {
    relays: currentRelays(),
    channel: "account",
    timeoutMs: 1000,
    authKey
  });
}

/** What `relay` holds of the parts' author: its records, not its deletion requests. */
function partRecords(relay: string): NostrEvent[] {
  return (nostr.stored.get(relay) ?? []).filter(
    (event) => event.pubkey === partKeys.nostr.publicKey && event.kind !== 5
  );
}

const read = () => withCardAccess((access) => readCardHistory(access));
const copy = (now = Date.now()) =>
  withCardAccess(async (access) => copyCardHistory(access, await readCardHistory(access), now));
const readMonth = (head: Parameters<typeof readCardHistoryMonth>[1]) =>
  withCardAccess((access) => readCardHistoryMonth(access, head));

beforeEach(async () => {
  nostr.resetRelays();
  await openTestAccount();
  ({ historyKeys, partKeys } = await withCardAccess(async ({ root }) => ({
    historyKeys: deriveHistoryRecordKeys(root),
    partKeys: deriveMonthPartKeys(root)
  })));
});

afterEach(() => closeAccount());

describe("the copies of a card's months", () => {
  it("copy each month that is over, its head naming the parts every device reads back", async () => {
    const last = monthOf(LAST_MONTH);
    for (const copy of [tap("a1", LAST_MONTH + 1000), tap("a2", LAST_MONTH + 2000)]) {
      await publish(historyEvent(historyKeys, copy), historyKeys.nostr.secretKey);
    }
    await publish(
      movementEvent(historyKeys, movement("m1", LAST_MONTH + 3000)),
      historyKeys.nostr.secretKey
    );
    // This month: not over, not copied.
    await publish(
      historyEvent(historyKeys, tap("b1", THIS_MONTH + 1000)),
      historyKeys.nostr.secretKey
    );
    await expect(copy()).resolves.toBe(1);
    // Another device: the head with the history, the parts by address.
    const history = await read();
    expect([...history.heads.keys()]).toEqual([`${CARD}/1/${last}`]);
    const head = history.heads.get(`${CARD}/1/${last}`)!.head;
    expect(head.set).toBe(
      monthSet([
        ["m", `${CARD}/m1`, 0],
        ["t", "a1", 0],
        ["t", "a2", 0]
      ])
    );
    const held = await readMonth(head);
    expect(held).toMatchObject({ complete: true, newer: false });
    expect(held!.taps.map(({ entry }) => entry.id)).toEqual(["a1", "a2"]);
    expect(held!.movements.map(({ movement: moved }) => moved.id)).toEqual(["m1"]);
    for (const relay of currentRelays()) expect(partRecords(relay)).toHaveLength(1);
    // Copied already, whole: nothing more.
    const before = nostr.calls.length;
    await expect(copy()).resolves.toBe(0);
    expect(nostr.calls.slice(before).filter((call) => call.operation === "publish")).toEqual([]);
  });

  it("copy a month again with a later write, keeping what its copy held", async () => {
    const last = monthOf(LAST_MONTH);
    await publish(
      historyEvent(historyKeys, tap("a1", LAST_MONTH + 1000)),
      historyKeys.nostr.secretKey
    );
    await publish(
      historyEvent(historyKeys, tap("a2", LAST_MONTH + 2000)),
      historyKeys.nostr.secretKey
    );
    await copy();
    // Its record gone from the relays (dropped, or lost), and a later write of the other.
    const gone = historyAddress(historyKeys, "a1");
    for (const relay of currentRelays()) {
      const held = nostr.stored.get(relay) ?? [];
      expect(held.some((event) => event.tags.some(([, value]) => value === gone))).toBe(true);
      nostr.stored.set(
        relay,
        held.filter((event) => !event.tags.some(([name, value]) => name === "d" && value === gone))
      );
    }
    expect((await read()).recorded.taps.map(({ entry }) => entry.id)).toEqual(["a2"]);
    await publish(
      historyEvent(historyKeys, tap("a2", LAST_MONTH + 2000, 1)),
      historyKeys.nostr.secretKey
    );
    const former = new Set(
      currentRelays().flatMap((relay) => partRecords(relay).map(({ id }) => id))
    );
    expect(former.size).toBe(1);
    await expect(copy()).resolves.toBe(1);
    const head = (await read()).heads.get(`${CARD}/1/${last}`)!.head;
    expect(head.set).toBe(
      monthSet([
        ["t", "a1", 0],
        ["t", "a2", 1]
      ])
    );
    expect((await readMonth(head))?.complete).toBe(true);
    // The copy it replaced, which no head names, is gone: only the new one is left.
    for (const relay of currentRelays()) {
      expect(partRecords(relay)).toHaveLength(1);
      expect(partRecords(relay).some(({ id }) => former.has(id))).toBe(false);
    }
  });

  it("never write what is left of a copy another round just replaced: its entries stay named", async () => {
    const last = monthOf(LAST_MONTH);
    const key = `${CARD}/1/${last}`;
    for (const id of ["a1", "a2"]) {
      await publish(
        historyEvent(historyKeys, tap(id, LAST_MONTH + 1000)),
        historyKeys.nostr.secretKey
      );
    }
    await copy();
    // Their records expired since; a later one the copy does not hold yet.
    const expired = new Set(["a1", "a2"].map((id) => historyAddress(historyKeys, id)));
    for (const relay of currentRelays()) {
      nostr.stored.set(
        relay,
        (nostr.stored.get(relay) ?? []).filter(
          (event) => !event.tags.some(([name, value]) => name === "d" && expired.has(value))
        )
      );
    }
    await publish(
      historyEvent(historyKeys, tap("a3", LAST_MONTH + 3000)),
      historyKeys.nostr.secretKey
    );
    // Two rounds read the history before either writes (two tabs of the web app, a phone and the
    // web): the first replaces the copy and deletes its parts, then the second reads them.
    const second = await read();
    await expect(copy()).resolves.toBe(1);
    expect((await read()).heads.get(key)!.head.set).toBe(
      monthSet([
        ["t", "a1", 0],
        ["t", "a2", 0],
        ["t", "a3", 0]
      ])
    );
    await expect(
      withCardAccess((access) => copyCardHistory(access, second, Date.now() + 5_000))
    ).resolves.toBe(0);
    // The copy of the first round stands, every entry named.
    const head = (await read()).heads.get(key)!.head;
    expect(head.set).toBe(
      monthSet([
        ["t", "a1", 0],
        ["t", "a2", 0],
        ["t", "a3", 0]
      ])
    );
    expect((await readMonth(head))?.complete).toBe(true);
  });

  it("delete the copy replaced by its ids only: the same parts another device signed again stay", async () => {
    const last = monthOf(LAST_MONTH);
    const taps = [tap("a1", LAST_MONTH + 1000), tap("a2", LAST_MONTH + 2000)];
    for (const copied of taps) {
      await publish(historyEvent(historyKeys, copied), historyKeys.nostr.secretKey);
    }
    const earlier = Date.now() - 10_000;
    await copy(earlier);
    await publish(
      historyEvent(historyKeys, tap("a2", LAST_MONTH + 2000, 1)),
      historyKeys.nostr.secretKey
    );
    // Another device signs the copy read again meanwhile (its part, dated before this round's
    // request): it reaches each relay just before the request.
    const [part] = monthCopy(WALLET, last, taps, []).parts;
    const signedAgain = monthPartEvent(partKeys, part!, Math.floor(earlier / 1000) + 5);
    const publishEvent = nostr.publishEvent;
    jest.spyOn(nostr, "publishEvent").mockImplementation(async (url, event, options) => {
      if (event.kind === 5 && event.pubkey === partKeys.nostr.publicKey) {
        await publishEvent(url, signedAgain, options);
      }
      return publishEvent(url, event, options);
    });
    try {
      await expect(copy()).resolves.toBe(1);
    } finally {
      jest.restoreAllMocks();
    }
    for (const relay of currentRelays()) {
      expect(partRecords(relay).map(({ id }) => id)).toContain(signedAgain.id);
    }
  });

  it("sign a copy again once a year, as it is", async () => {
    const old = LAST_MONTH - 400 * 24 * 3600 * 1000;
    const { head, parts } = monthCopy(WALLET, monthOf(old), [tap("c1", old)], []);
    const signedAt = Math.floor(Date.now() / 1000) - MONTH_REFRESH_SECONDS - 3600;
    for (const part of parts) {
      await publish(monthPartEvent(partKeys, part, signedAt), partKeys.nostr.secretKey);
    }
    await publish(monthHeadEvent(historyKeys, head, signedAt), historyKeys.nostr.secretKey);
    await expect(copy()).resolves.toBe(1);
    const again = (await read()).heads.get(`${CARD}/1/${monthOf(old)}`)!;
    expect(again.head).toEqual(head);
    expect(again.createdAt).toBeGreaterThan(signedAt + MONTH_REFRESH_SECONDS);
    expect((await readMonth(head))?.oldestAt).toBe(again.createdAt);
    // The same parts, signed again where they were: nothing to delete.
    for (const relay of currentRelays()) expect(partRecords(relay)).toHaveLength(1);
    expect(nostr.calls.filter(({ event }) => event?.kind === 5)).toEqual([]);
  });

  it("never copy nor sign again the months of a card deleted: its history goes", async () => {
    const other = "f".repeat(32);
    await publish(
      historyEvent(historyKeys, tap("a1", LAST_MONTH + 1000)),
      historyKeys.nostr.secretKey
    );
    await publish(
      historyEvent(historyKeys, tap("b1", LAST_MONTH + 2000, 0, other)),
      historyKeys.nostr.secretKey
    );
    // A copy of it signed long ago, due to be signed again.
    const old = LAST_MONTH - 400 * 24 * 3600 * 1000;
    const { head, parts } = monthCopy(WALLET, monthOf(old), [tap("c1", old)], []);
    const signedAt = Math.floor(Date.now() / 1000) - MONTH_REFRESH_SECONDS - 3600;
    for (const part of parts) {
      await publish(monthPartEvent(partKeys, part, signedAt), partKeys.nostr.secretKey);
    }
    await publish(monthHeadEvent(historyKeys, head, signedAt), historyKeys.nostr.secretKey);
    const erased = new Map([[CARD, 1]]);
    await expect(
      withCardAccess(async (access) =>
        copyCardHistory(access, await readCardHistory(access), Date.now(), erased)
      )
    ).resolves.toBe(1);
    const heads = (await read()).heads;
    expect([...heads.keys()].sort()).toEqual(
      [`${CARD}/1/${monthOf(old)}`, `${other}/1/${monthOf(LAST_MONTH)}`].sort()
    );
    expect(heads.get(`${CARD}/1/${monthOf(old)}`)!.createdAt).toBe(signedAt);
  });

  it("copy a card added again apart: its earlier wallet's months never", async () => {
    // Last month, the card's first wallet paid, then the card was deleted and added again: its
    // next wallet paid too.
    await publish(
      historyEvent(historyKeys, tap("a1", LAST_MONTH + 1000)),
      historyKeys.nostr.secretKey
    );
    await publish(
      historyEvent(historyKeys, tap("a2", LAST_MONTH + 2000, 0, CARD, 2)),
      historyKeys.nostr.secretKey
    );
    const erased = new Map([[CARD, 1]]);
    await expect(
      withCardAccess(async (access) =>
        copyCardHistory(access, await readCardHistory(access), Date.now(), erased)
      )
    ).resolves.toBe(1);
    const last = monthOf(LAST_MONTH);
    const heads = (await read()).heads;
    expect([...heads.keys()]).toEqual([`${CARD}/2/${last}`]);
    expect(heads.get(`${CARD}/2/${last}`)!.head.set).toBe(monthSet([["t", "a2", 0]]));
  });

  it("are written only after a majority's read, and never with a newer app's record", async () => {
    await publish(
      historyEvent(historyKeys, tap("a1", LAST_MONTH + 1000)),
      historyKeys.nostr.secretKey
    );
    const relays = currentRelays();
    for (const relay of relays.slice(0, 3)) nostr.unreachable.add(relay);
    await expect(copy()).resolves.toBe(0);
    nostr.unreachable.clear();
    // A tap's record of a newer format (version 3).
    const at = LAST_MONTH + 5000;
    await publish(
      sealRecord({
        type: "card-payment",
        value: { ...historyValue(tap("a9", at)), version: 3 },
        signer: historyKeys.nostr.secretKey,
        encryptionKey: historyKeys.encryptionKey,
        address: historyAddress(historyKeys, "a9"),
        createdAt: Math.floor(at / 1000)
      }),
      historyKeys.nostr.secretKey
    );
    await expect(copy()).resolves.toBe(0);
    expect((await read()).heads.size).toBe(0);
  });

  it("are read whole with more parts than a relay sends for one filter", async () => {
    // One tap a part: as many parts as a copy of the busiest card's month could have.
    const month = monthOf(LAST_MONTH);
    const taps = Array.from({ length: nostr.MAX_EVENTS_PER_FILTER + 20 }, (_, n) =>
      tap(n.toString(16), LAST_MONTH + n * 1000)
    );
    const entries = monthEntries(taps, []);
    const set = monthSet(entries);
    const head: MonthHead = { ...WALLET, month, parts: taps.length, set };
    const parts = taps.map((copy, part): MonthPart => ({
      ...head,
      part,
      taps: [copy],
      movements: []
    }));
    // On a majority of the relays, signed in one second as a copy is.
    const signedAt = Math.floor(Date.now() / 1000);
    for (const part of parts) {
      await publishToRelays(monthPartEvent(partKeys, part, signedAt), {
        relays: currentRelays().slice(0, 3),
        channel: "account",
        timeoutMs: 1000,
        authKey: partKeys.nostr.secretKey
      });
    }
    const held = await readMonth(head);
    expect(held).toMatchObject({ complete: true, newer: false });
    expect(held!.taps).toHaveLength(taps.length);
  });

  it("are written COPIES_PER_ROUND a round at most, the oldest months first", async () => {
    // Two months over whose records live still, of more cards than a round copies.
    const older = Date.now() - 80 * 24 * 3600 * 1000;
    const newer = Date.now() - 40 * 24 * 3600 * 1000;
    const cards = Array.from({ length: COPIES_PER_ROUND / 2 + 1 }, (_, n) =>
      n.toString(16).padStart(32, "0")
    );
    for (const [n, cardId] of cards.entries()) {
      for (const [m, at] of [older, newer].entries()) {
        const copy = tap((n * 2 + m + 1).toString(16), at + n * 1000, 0, cardId);
        // On a majority of the relays: enough for a conclusive read, half the signatures checked.
        await publishToRelays(historyEvent(historyKeys, copy), {
          relays: currentRelays().slice(0, 3),
          channel: "account",
          timeoutMs: 1000,
          authKey: historyKeys.nostr.secretKey
        });
      }
    }
    await expect(copy()).resolves.toBe(COPIES_PER_ROUND);
    const heads = [...(await read()).heads.keys()];
    expect(heads.filter((key) => key.endsWith(monthOf(older)))).toHaveLength(cards.length);
    expect(heads.filter((key) => key.endsWith(monthOf(newer)))).toHaveLength(
      COPIES_PER_ROUND - cards.length
    );
    // The next round copies the rest.
    await expect(copy()).resolves.toBe(cards.length * 2 - COPIES_PER_ROUND);
    expect((await read()).heads.size).toBe(cards.length * 2);
  });

  it("write what is left of a copy that lost parts when it is signed again", async () => {
    const old = LAST_MONTH - 500 * 24 * 3600 * 1000;
    const taps = [tap("f1", old), tap("f2", old + 1000)];
    const entries = monthEntries(taps, []);
    const head: MonthHead = {
      ...WALLET,
      month: monthOf(old),
      parts: 2,
      set: monthSet(entries)
    };
    const signedAt = Math.floor(Date.now() / 1000) - MONTH_REFRESH_SECONDS - 3600;
    // Its second part gone from the relays.
    const first: MonthPart = { ...head, part: 0, taps: [taps[0]], movements: [] };
    const left = monthPartEvent(partKeys, first, signedAt);
    await publish(left, partKeys.nostr.secretKey);
    await publish(monthHeadEvent(historyKeys, head, signedAt), historyKeys.nostr.secretKey);
    await expect(copy()).resolves.toBe(1);
    const again = (await read()).heads.get(`${CARD}/1/${monthOf(old)}`)!;
    expect(again.head.set).toBe(monthSet([["t", "f1", 0]]));
    expect(again.createdAt).toBeGreaterThan(signedAt + MONTH_REFRESH_SECONDS);
    expect((await readMonth(again.head))?.complete).toBe(true);
    // A copy of another set: what was left of the former one is gone.
    for (const relay of currentRelays()) {
      expect(partRecords(relay)).toHaveLength(1);
      expect(partRecords(relay)[0]!.id).not.toBe(left.id);
    }
  });

  it("never sign again what is left of a copy another round replaced since it was read", async () => {
    const old = LAST_MONTH - 500 * 24 * 3600 * 1000;
    const key = `${CARD}/1/${monthOf(old)}`;
    const taps = [tap("f1", old), tap("f2", old + 1000)];
    const entries = monthEntries(taps, []);
    const head: MonthHead = {
      ...WALLET,
      month: monthOf(old),
      parts: 2,
      set: monthSet(entries)
    };
    const signedAt = Math.floor(Date.now() / 1000) - MONTH_REFRESH_SECONDS - 3600;
    // Its second part gone from the relays.
    const first: MonthPart = { ...head, part: 0, taps: [taps[0]], movements: [] };
    await publish(monthPartEvent(partKeys, first, signedAt), partKeys.nostr.secretKey);
    await publish(monthHeadEvent(historyKeys, head, signedAt), historyKeys.nostr.secretKey);
    const held = await read();
    // Another device's round replaces it meanwhile, one more entry in it.
    const whole = monthCopy(WALLET, monthOf(old), [...taps, tap("f3", old + 2000)], []);
    for (const part of whole.parts) {
      await publish(monthPartEvent(partKeys, part, signedAt + 60), partKeys.nostr.secretKey);
    }
    await publish(
      monthHeadEvent(historyKeys, whole.head, signedAt + 60),
      historyKeys.nostr.secretKey
    );
    await expect(
      withCardAccess((access) => copyCardHistory(access, held, Date.now()))
    ).resolves.toBe(0);
    // That copy stands, every entry named.
    expect((await read()).heads.get(key)!.head.set).toBe(whole.head.set);
  });

  it("never write to a list the account left during their round", async () => {
    const other = "f".repeat(32);
    await publish(
      historyEvent(historyKeys, tap("a1", LAST_MONTH + 1000)),
      historyKeys.nostr.secretKey
    );
    await publish(
      historyEvent(historyKeys, tap("a2", LAST_MONTH + 2000, 0, other)),
      historyKeys.nostr.secretKey
    );
    const left = currentRelays();
    const next = ["wss://relay-a.bakery.example", "wss://relay-b.bakery.example"];
    // The account's relays change once the round's first head is written.
    let moved = false;
    const publishEvent = nostr.publishEvent;
    jest.spyOn(nostr, "publishEvent").mockImplementation(async (url, event, options) => {
      const taken = await publishEvent(url, event, options);
      if (event.pubkey === historyKeys.nostr.publicKey) moved = true;
      return taken;
    });
    jest.spyOn(relaysOfAccount, "currentRelays").mockImplementation(() => (moved ? next : left));
    try {
      await expect(copy()).resolves.toBe(1);
    } finally {
      jest.restoreAllMocks();
    }
    expect(nostr.calls.filter(({ relay }) => next.includes(relay))).toEqual([]);
  });

  it("never write from a read of a list the account left since", async () => {
    await publish(
      historyEvent(historyKeys, tap("a1", LAST_MONTH + 1000)),
      historyKeys.nostr.secretKey
    );
    const left = currentRelays();
    const history = await read();
    expect(history.relays).toEqual(left);
    // Saved while the round read: the round's reads and writes are the list's it left.
    const next = ["wss://relay-a.bakery.example", "wss://relay-b.bakery.example"];
    jest.spyOn(relaysOfAccount, "currentRelays").mockReturnValue(next);
    const before = nostr.calls.length;
    try {
      await expect(withCardAccess((access) => copyCardHistory(access, history))).resolves.toBe(0);
    } finally {
      jest.restoreAllMocks();
    }
    expect(nostr.calls.slice(before)).toEqual([]);
  });

  it("never name parts the relays did not take", async () => {
    await publish(
      historyEvent(historyKeys, tap("a1", LAST_MONTH + 1000)),
      historyKeys.nostr.secretKey
    );
    const history = await read();
    for (const relay of currentRelays().slice(0, 3)) nostr.readOnly.add(relay);
    await expect(withCardAccess((access) => copyCardHistory(access, history))).resolves.toBe(0);
    nostr.readOnly.clear();
    expect((await read()).heads.size).toBe(0);
  });
});

describe("a device's copy rounds", () => {
  it("run at most once a day for the account: each reads the whole history", async () => {
    await publish(
      historyEvent(historyKeys, tap("a1", LAST_MONTH + 1000)),
      historyKeys.nostr.secretKey
    );
    const round = (now: number) => withCardAccess((access) => copyCardHistoryDaily(access, now));
    const queries = () => nostr.calls.filter((call) => call.operation === "query").length;
    const now = Date.now();
    await expect(round(now)).resolves.toBe(1);
    const before = queries();
    await expect(round(now + COPY_INTERVAL_MS - 1)).resolves.toBe(0);
    expect(queries()).toBe(before);
    // A day later: read again, nothing left to copy.
    await expect(round(now + COPY_INTERVAL_MS)).resolves.toBe(0);
    expect(queries()).toBeGreaterThan(before);
  });
});

describe("the web app's copy round", () => {
  it('runs when "Cards" reads the cards: the web app syncs no card', async () => {
    await withCardAccess((access) =>
      recordCardState(access, {
        cardId: CARD,
        uid: "04996c6a926980",
        keyVersion: 1,
        status: "active",
        relayHost: DEFAULT_CARD_RELAY_HOST,
        lastCounter: 0,
        depositedThrough: 0,
        maxPaymentSats: 20_000n,
        maxDaySats: 50_000n,
        maxPaymentsPerHour: 5,
        suspended: false,
        name: "",
        look: null,
        issuer: null,
        settingsAt: Date.now(),
        walletGeneration: 1
      })
    );
    await publish(
      historyEvent(historyKeys, tap("a1", LAST_MONTH + 1000)),
      historyKeys.nostr.secretKey
    );
    const web = jest.replaceProperty(Platform, "OS", "web");
    try {
      const { result } = await renderHook(() => useCards());
      await waitFor(() => expect(result.current.view.phase).toBe("ready"));
      await waitFor(async () => expect((await read()).heads.size).toBe(1));
    } finally {
      web.restore();
    }
  });
});
