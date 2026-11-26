import { hexToBytes } from "@noble/hashes/utils.js";

import { CARD_RECORD_TIMEOUT_MS } from "@/config/card";
import { closeAccount } from "@/features/account/session";
import { readOwnCopies } from "@/features/card/own-copies";
import { refreshCardPayees } from "@/features/card/payees-sync";
import {
  CardOrderUnsavedError,
  readAllCardIds,
  recordCardState,
  refreshCardStates,
  resetCardStates,
  saveCardOrder,
  withCardAccess
} from "@/features/card/states";
import { cardPassOf } from "@/lib/card/card-pass";
import { cardStateEvent, type CardState } from "@/lib/card/card-record";
import { cardIdOf } from "@/lib/card/keys";
import { publishToRelays } from "@/lib/nostr/pool";
import { currentRelays } from "@/lib/relays/current";

import { openTestAccount } from "../../jest/account";
import type * as RelaysFake from "../../jest/nostr-relays";

/*
 * The cards' records on the relays, read and written without waiting for every relay: a relay
 * that stays connected without answering no
 * longer holds a read up to its timeout, which a card payment cannot spare (3 s per relay, 4 s in
 * all); what a majority holds is still found, and without a majority nothing is decided.
 */

const nostr = jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");

let cardId: string;

/** Every pair of the five relays. */
function pairs(relays: readonly string[]): [string, string][] {
  return relays.flatMap((a, i) => relays.slice(i + 1).map((b): [string, string] => [a, b]));
}

/** Runs `promise` on fake timers: its value, and how long (fake ms) it took to settle. */
async function timed<T>(promise: Promise<T>): Promise<{ value: T; ms: number }> {
  const startedAt = Date.now();
  let settled: { value: T } | null = null;
  void promise.then((value) => {
    settled = { value };
  });
  while (settled === null) {
    if (Date.now() - startedAt > 10 * CARD_RECORD_TIMEOUT_MS) throw new Error("Never settled");
    await jest.advanceTimersByTimeAsync(10);
  }
  return { value: (settled as { value: T }).value, ms: Date.now() - startedAt };
}

/** The card's state as the relays hold it now (read before any relay is made quiet). */
async function stateOnRelays(): Promise<CardState> {
  const read = await withCardAccess(refreshCardStates);
  return read.states.find((state) => state.cardId === cardId)!;
}

/** Another device pauses the card, its write reaching `holders` only. */
async function pauseElsewhere(state: CardState, holders: readonly string[]) {
  await withCardAccess(({ keys }) =>
    publishToRelays(
      cardStateEvent(keys, {
        ...state,
        suspended: true,
        settingsAt: state.settingsAt + 1,
        updatedAt: state.updatedAt + 60
      }),
      { relays: holders, channel: "account", timeoutMs: 1000, authKey: keys.nostr.secretKey }
    )
  );
}

beforeEach(async () => {
  closeAccount();
  nostr.resetRelays();
  resetCardStates();
  await openTestAccount({ usage: "card", signUp: "done" });
  cardId = await withCardAccess(async (access) => {
    const uid = "04000000000001";
    const id = cardIdOf(access.root, hexToBytes(uid));
    await recordCardState(access, {
      cardId: id,
      uid,
      keyVersion: 1,
      status: "active",
      relayHost: "relay.sattle.me",
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
    });
    return id;
  });
  jest.useFakeTimers({ now: Date.now(), doNotFake: ["queueMicrotask", "nextTick"] });
});

afterEach(() => {
  jest.useRealTimers();
});

describe("the cards' states", () => {
  it("are read without waiting for a relay that stays connected without answering", async () => {
    nostr.silent.add(currentRelays()[4]);
    const { value, ms } = await timed(
      withCardAccess((access) => refreshCardStates(access, { timeoutMs: 3000 }))
    );
    expect(ms).toBeLessThan(3000);
    expect(value.conclusive).toBe(true);
    expect(value.states.map((state) => state.cardId)).toEqual([cardId]);
  });

  it("hold a pause a majority took, whichever two relays stay quiet", async () => {
    const relays = currentRelays();
    const state = await stateOnRelays();
    await pauseElsewhere(state, relays.slice(0, 3));
    for (const [silent, mute] of pairs(relays)) {
      nostr.silent.clear();
      nostr.latency.clear();
      // As another device: nothing known of the pause.
      resetCardStates();
      nostr.silent.add(silent);
      nostr.latency.set(mute, Infinity);
      const { value, ms } = await timed(
        withCardAccess((access) => refreshCardStates(access, { timeoutMs: 3000 }))
      );
      expect(ms).toBeLessThan(3000);
      expect(value.conclusive).toBe(true);
      expect(value.states.find((read) => read.cardId === cardId)).toMatchObject({
        suspended: true
      });
    }
  });

  it("are not conclusive without a majority, after the relays' timeout and not before", async () => {
    for (const relay of currentRelays().slice(2)) nostr.silent.add(relay);
    const { value, ms } = await timed(
      withCardAccess((access) => refreshCardStates(access, { timeoutMs: 3000 }))
    );
    expect(ms).toBeGreaterThanOrEqual(3000);
    expect(value.conclusive).toBe(false);

    const ids = await timed(withCardAccess(readAllCardIds));
    expect(ids.value.conclusive).toBe(false);
  });

  it('are all listed for "Delete account" with a relay silent, a majority\'s read', async () => {
    nostr.silent.add(currentRelays()[0]);
    const { value, ms } = await timed(withCardAccess(readAllCardIds));
    expect(ms).toBeLessThan(CARD_RECORD_TIMEOUT_MS);
    expect(value).toMatchObject({ cardIds: [cardId], conclusive: true });
  });
});

describe("the cards' order", () => {
  it("is saved with a relay silent, and refused without a majority", async () => {
    const wallet = { cardId, walletGeneration: 1 };
    nostr.silent.add(currentRelays()[1]);
    const saved = await timed(
      withCardAccess((access) => saveCardOrder(access, [wallet], 1_800_000_000))
    );
    expect(saved.ms).toBeLessThan(CARD_RECORD_TIMEOUT_MS);
    expect(saved.value).toEqual({ cards: [wallet], updatedAt: 1_800_000_000 });

    for (const relay of currentRelays().slice(2)) nostr.silent.add(relay);
    const refused = timed(
      withCardAccess((access) => saveCardOrder(access, [wallet], 1_800_000_001)).catch(
        (error: unknown) => error
      )
    );
    expect((await refused).value).toBeInstanceOf(CardOrderUnsavedError);
  });
});

describe("a card's merchants", () => {
  it("are read without waiting for a silent relay, and not conclusive without a majority", async () => {
    nostr.silent.add(currentRelays()[2]);
    const read = await timed(
      withCardAccess((access) => refreshCardPayees(access, { timeoutMs: 3000 }))
    );
    expect(read.ms).toBeLessThan(3000);
    expect(read.value.conclusive).toBe(true);

    for (const relay of currentRelays().slice(3)) nostr.silent.add(relay);
    const unread = await timed(
      withCardAccess((access) => refreshCardPayees(access, { timeoutMs: 3000 }))
    );
    expect(unread.value.conclusive).toBe(false);
  });
});

describe("a card's own copies, read with the app closed", () => {
  it("are read within a payment's time with a relay silent, and conclusive only with a majority", async () => {
    const state = await stateOnRelays();
    const pass = await withCardAccess(async ({ root }) => cardPassOf(root, state));
    nostr.silent.add(currentRelays()[3]);
    const read = await timed(readOwnCopies(pass, 3000));
    expect(read.ms).toBeLessThan(3000);
    expect(read.value).toMatchObject({ conclusive: true, state: { cardId } });

    for (const relay of currentRelays().slice(0, 2)) nostr.silent.add(relay);
    const unread = await timed(readOwnCopies(pass, 3000));
    expect(unread.value?.conclusive).toBe(false);
  });
});
