import { DEFAULT_CARD_RELAY_HOST } from "@/config/card";
import { DEFAULT_RELAYS } from "@/config/relays";
import { closeAccount, getAccountSettings } from "@/features/account/session";
import {
  MONTH_REFRESH_SECONDS,
  queryMonthParts,
  readCardHistoryMonth
} from "@/features/card/history-copies";
import { readCardHistory } from "@/features/card/history-sync";
import { copyCardMonths, copyCardRecords } from "@/features/card/relays-move";
import {
  recordCardState,
  resetCardStates,
  saveCardOrder,
  withCardAccess
} from "@/features/card/states";
import { SettingsError, changeRelays } from "@/features/settings/account-settings";
import { hexToBytes } from "@noble/hashes/utils.js";

import { walletSecret } from "@/lib/breez/seed";
import type { CardMovement } from "@/lib/card/card-movement";
import { cardOrderAddress } from "@/lib/card/card-order";
import { cardOwnKeys, cardOwnSecret } from "@/lib/card/card-own";
import { deriveCardRecordKeys } from "@/lib/card/card-record";
import { cardIdOf, deriveCardRoot } from "@/lib/card/keys";
import {
  deriveMonthPartKeys,
  monthCopy,
  monthCopyOf,
  monthEntries,
  monthPartEvent,
  type MonthPart
} from "@/lib/card/history-months";
import {
  deriveHistoryRecordKeys,
  historyAddress,
  historyEvent,
  historyOf,
  historyValue,
  monthHeadEvent,
  movementEvent,
  type HistoryCopy,
  type MovementCopy
} from "@/lib/card/history-records";
import { monthOf, monthSet, type MonthHead } from "@/lib/card/month-head";
import { derivePayeeRecordKeys, payeeModeEvent } from "@/lib/card/payee-records";
import type { CardPaymentEntry } from "@/lib/card/payment-entry";
import { idleMs } from "@/lib/activity";
import { createImage, imageAuthor, publishImageToMajority } from "@/lib/media/image";
import type { NostrEvent } from "@/lib/nostr/event";
import { randomNostrKeys } from "@/lib/nostr/keys";
import { publishToRelays, queryRelays } from "@/lib/nostr/pool";
import { RECORD_KIND, sealRecord } from "@/lib/nostr/record";
import { currentRelays } from "@/lib/relays/current";

import { openTestAccount, testSeed } from "../../jest/account";
import type * as FileSystemFake from "../../jest/expo-file-system";
import type * as RelaysFake from "../../jest/nostr-relays";

/*
 * The cards' records at a change of the account's relays (src/features/card/relays-move.ts): the
 * copies of their months before the change (the whole history kept), the rest after it.
 */

// The wallet layer is the real one, over the fake SDK (the copy of the declarations reads it).
jest.mock("../lib/breez/config", () => ({
  ...jest.requireActual("../lib/breez/config"),
  getWalletConfig: () => ({ network: "mainnet", apiKey: "test-api-key" }),
  // Mainnet: invoices of "bc" (the app config has no network under Jest).
  getBreezNetwork: () => "mainnet"
}));

const nostr = jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");
const fileSystem = jest.requireMock<typeof FileSystemFake>("expo-file-system");

const NEXT = [
  "wss://relay-a.bakery.example",
  "wss://relay-b.bakery.example",
  "wss://relay-c.bakery.example"
];
const root = deriveCardRoot(walletSecret(testSeed()));
const historyKeys = deriveHistoryRecordKeys(root);
const partKeys = deriveMonthPartKeys(root);
const payeeKeys = derivePayeeRecordKeys(root);
const stateKeys = deriveCardRecordKeys(root);
const UID = "04996c6a926980";
const CARD = cardIdOf(root, hexToBytes(UID));
const nowUnix = () => Math.floor(Date.now() / 1000);

/** A month long over (its records gone), and one whose records live still. */
const OLD = Date.UTC(2025, 0, 15);
const RECENT = Date.now() - 40 * 24 * 3600 * 1000;

function tap(id: string, at: number, revision = 0): HistoryCopy {
  const entry: CardPaymentEntry = {
    id,
    cardId: CARD,
    walletGeneration: 1,
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
    cardId: CARD,
    walletGeneration: 1,
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

async function publishTo(
  event: NostrEvent,
  authKey: Uint8Array,
  relays: readonly string[] = DEFAULT_RELAYS
): Promise<void> {
  await publishToRelays(event, { relays, channel: "account", timeoutMs: 1000, authKey });
}

/** The ids of the events `relay` holds. */
function heldBy(relay: string): Set<string> {
  return new Set((nostr.stored.get(relay) ?? []).map((event) => event.id));
}

/** Whether every relay of `relays` holds `event`. */
function everywhere(event: NostrEvent, relays: readonly string[] = NEXT): boolean {
  return relays.every((relay) => heldBy(relay).has(event.id));
}

/** Whether no relay of `relays` holds `event`. */
function nowhere(event: NostrEvent, relays: readonly string[] = NEXT): boolean {
  return relays.every((relay) => !heldBy(relay).has(event.id));
}

/**
 * What the account's history holds on the list left: the copy of a month long over (two parts'
 * worth of taps would be heavy: one), a part of a copy replaced since, a tap and a movement of
 * this month's records, and a newer app's record of the history.
 */
async function historyOnListLeft() {
  const signedAt = nowUnix() - 30 * 24 * 3600;
  const copy = monthCopy(
    { cardId: CARD, walletGeneration: 1 },
    monthOf(OLD),
    [tap("c1", OLD), tap("c2", OLD + 60_000)],
    []
  );
  const parts = copy.parts.map((part) => monthPartEvent(partKeys, part, signedAt));
  const head = monthHeadEvent(historyKeys, copy.head, signedAt);
  const replaced = monthCopy(
    { cardId: CARD, walletGeneration: 1 },
    monthOf(OLD),
    [tap("c1", OLD)],
    []
  );
  const orphan = monthPartEvent(partKeys, replaced.parts[0], signedAt - 3600);
  const recentTap = historyEvent(historyKeys, tap("a1", RECENT));
  const recentMovement = movementEvent(historyKeys, movement("m1", RECENT + 1000));
  const at = RECENT + 5000;
  const newer = sealRecord({
    type: "card-payment",
    value: { ...historyValue(tap("a9", at)), version: 3 },
    signer: historyKeys.nostr.secretKey,
    encryptionKey: historyKeys.encryptionKey,
    address: historyAddress(historyKeys, "a9"),
    createdAt: Math.floor(at / 1000)
  });
  for (const event of [...parts, orphan]) await publishTo(event, partKeys.nostr.secretKey);
  for (const event of [head, recentTap, recentMovement, newer]) {
    await publishTo(event, historyKeys.nostr.secretKey);
  }
  return { copy, parts, head, orphan, recentTap, recentMovement, newer };
}

/** Until the relays get no new call: what a change of relays left running in the background. */
async function settled(): Promise<void> {
  for (let count = -1; count !== nostr.calls.length;) {
    count = nostr.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

beforeEach(async () => {
  nostr.resetRelays();
  // A new device: the settings and the cards an earlier test saved are not there.
  fileSystem.resetFileSystem();
  resetCardStates();
  await openTestAccount({ usage: "card", signUp: "done" });
});

afterEach(async () => {
  await settled();
  closeAccount();
});

describe("the copies of the cards' months at a change of relays", () => {
  it("go to the new list with a newer app's records, the taps and movements of this format after", async () => {
    const held = await historyOnListLeft();
    const copy = await copyCardMonths(DEFAULT_RELAYS, NEXT);
    // The taps and movements of this format: left for once the change is saved.
    expect(copy?.later.map(({ id }) => id).sort()).toEqual(
      [held.recentTap.id, held.recentMovement.id].sort()
    );
    // Signed a month ago, whole: as it is.
    for (const event of [...held.parts, held.head, held.newer]) {
      expect(everywhere(event)).toBe(true);
    }
    // A part no head names (of a copy replaced since) stays behind.
    for (const event of [held.orphan, held.recentTap, held.recentMovement]) {
      expect(nowhere(event)).toBe(true);
    }
  });

  it("sign again there a copy signed over a year ago, and what is left of one that lost parts", async () => {
    // Signed long ago, whole: signed again, as it is.
    const old = Date.UTC(2024, 2, 15);
    const signedLongAgo = nowUnix() - MONTH_REFRESH_SECONDS - 24 * 3600;
    const aged = monthCopy(
      { cardId: CARD, walletGeneration: 1 },
      monthOf(old),
      [tap("d1", old)],
      []
    );
    for (const part of aged.parts) {
      await publishTo(monthPartEvent(partKeys, part, signedLongAgo), partKeys.nostr.secretKey);
    }
    await publishTo(
      monthHeadEvent(historyKeys, aged.head, signedLongAgo),
      historyKeys.nostr.secretKey
    );
    // Two parts, one of them gone from the relays: what is left of it, written again.
    const lossy = Date.UTC(2024, 5, 15);
    const taps = [tap("e1", lossy), tap("e2", lossy + 1000)];
    const entries = monthEntries(taps, []);
    const head: MonthHead = {
      cardId: CARD,
      walletGeneration: 1,
      month: monthOf(lossy),
      parts: 2,
      set: monthSet(entries)
    };
    const signedRecently = nowUnix() - 30 * 24 * 3600;
    const first: MonthPart = { ...head, part: 0, taps: [taps[0]], movements: [] };
    await publishTo(monthPartEvent(partKeys, first, signedRecently), partKeys.nostr.secretKey);
    await publishTo(monthHeadEvent(historyKeys, head, signedRecently), historyKeys.nostr.secretKey);

    await expect(copyCardMonths(DEFAULT_RELAYS, NEXT)).resolves.not.toBeNull();
    const records = await queryRelays(
      { kinds: [RECORD_KIND], authors: [historyKeys.nostr.publicKey] },
      { relays: NEXT, channel: "account", timeoutMs: 1000, authKey: historyKeys.nostr.secretKey }
    );
    const heads = historyOf(historyKeys, records).heads;
    const again = heads.get(`${CARD}/1/${monthOf(old)}`)!;
    expect(again.head).toEqual(aged.head);
    expect(again.createdAt).toBeGreaterThan(nowUnix() - 60);
    const left = heads.get(`${CARD}/1/${monthOf(lossy)}`)!;
    expect(left.head.set).toBe(monthSet([["t", "e1", 0]]));
    for (const { head: copied } of [again, left]) {
      const parts = await queryMonthParts(partKeys, [copied], NEXT);
      expect(monthCopyOf(partKeys, copied, parts!)).toMatchObject({ complete: true });
    }
  });

  describe("a copy another device's round replaces during the change", () => {
    const month = Date.UTC(2024, 5, 15);
    const key = `${CARD}/1/${monthOf(month)}`;
    const wallet = { cardId: CARD, walletGeneration: 1 };

    /** A copy of two entries on the list left; what replaces it: a copy of three, its parts gone. */
    async function copyToReplace() {
      const signedAt = nowUnix() - 30 * 24 * 3600;
      const first = monthCopy(wallet, monthOf(month), [tap("e1", month), tap("e2", month + 1)], []);
      const firstParts = first.parts.map((part) => monthPartEvent(partKeys, part, signedAt));
      for (const event of firstParts) await publishTo(event, partKeys.nostr.secretKey);
      await publishTo(
        monthHeadEvent(historyKeys, first.head, signedAt),
        historyKeys.nostr.secretKey
      );
      const replaced = monthCopy(
        wallet,
        monthOf(month),
        [tap("e1", month), tap("e2", month + 1), tap("e3", month + 2)],
        []
      );
      // The other round: its parts, its head, then the parts it replaced deleted.
      return async (publish: typeof nostr.publishEvent) => {
        const options = { channel: "account" as const, timeoutMs: 1000 };
        for (const relay of DEFAULT_RELAYS) {
          for (const part of replaced.parts) {
            await publish(relay, monthPartEvent(partKeys, part, signedAt + 60), {
              ...options,
              authKeys: [partKeys.nostr.secretKey]
            });
          }
          await publish(relay, monthHeadEvent(historyKeys, replaced.head, signedAt + 60), {
            ...options,
            authKeys: [historyKeys.nostr.secretKey]
          });
        }
        const gone = new Set(firstParts.map(({ id }) => id));
        for (const relay of DEFAULT_RELAYS) {
          nostr.stored.set(
            relay,
            (nostr.stored.get(relay) ?? []).filter((event) => !gone.has(event.id))
          );
        }
      };
    }

    async function headsOnNext() {
      return historyOf(
        historyKeys,
        await queryRelays(
          { kinds: [RECORD_KIND], authors: [historyKeys.nostr.publicKey] },
          {
            relays: NEXT,
            channel: "account",
            timeoutMs: 1000,
            authKey: historyKeys.nostr.secretKey
          }
        )
      ).heads;
    }

    it("waits when it is replaced before its parts are read, writing nothing of what is left", async () => {
      // A copy of two parts, the second gone from the relays.
      const signedAt = nowUnix() - 30 * 24 * 3600;
      const taps = [tap("e1", month), tap("e2", month + 1)];
      const entries = monthEntries(taps, []);
      const head: MonthHead = {
        ...wallet,
        month: monthOf(month),
        parts: 2,
        set: monthSet(entries)
      };
      const first: MonthPart = { ...head, part: 0, taps: [taps[0]], movements: [] };
      await publishTo(monthPartEvent(partKeys, first, signedAt), partKeys.nostr.secretKey);
      await publishTo(monthHeadEvent(historyKeys, head, signedAt), historyKeys.nostr.secretKey);
      // Once the change read the history, another device's round replaces it (a copy of three).
      const replaced = monthCopy(wallet, monthOf(month), [...taps, tap("e3", month + 2)], []);
      const queryEvents = nostr.queryEvents;
      let replacing: Promise<void> | null = null;
      jest.spyOn(nostr, "queryEvents").mockImplementation(async (url, filter, options) => {
        if (filter.authors?.includes(partKeys.nostr.publicKey)) {
          replacing ??= (async () => {
            for (const part of replaced.parts) {
              await publishTo(
                monthPartEvent(partKeys, part, signedAt + 60),
                partKeys.nostr.secretKey
              );
            }
            await publishTo(
              monthHeadEvent(historyKeys, replaced.head, signedAt + 60),
              historyKeys.nostr.secretKey
            );
          })();
          await replacing;
        }
        return queryEvents(url, filter, options);
      });
      try {
        await expect(copyCardMonths(DEFAULT_RELAYS, NEXT)).resolves.toBeNull();
      } finally {
        jest.restoreAllMocks();
      }
      // Nothing of what was left written there: it would come after the copy that stands.
      expect((await headsOnNext()).get(key)).toBeUndefined();
      // Tried again: the copy that stands goes, every entry named.
      await expect(copyCardMonths(DEFAULT_RELAYS, NEXT)).resolves.not.toBeNull();
      expect((await headsOnNext()).get(key)!.head.set).toBe(
        monthSet([
          ["t", "e1", 0],
          ["t", "e2", 0],
          ["t", "e3", 0]
        ])
      );
    });

    it("waits when it is replaced while it goes to the new list", async () => {
      const replace = await copyToReplace();
      const publishEvent = nostr.publishEvent;
      let replacing: Promise<void> | null = null;
      jest.spyOn(nostr, "publishEvent").mockImplementation(async (url, event, options) => {
        if (NEXT.includes(url) && !DEFAULT_RELAYS.includes(url)) {
          replacing ??= replace(publishEvent);
          await replacing;
        }
        return publishEvent(url, event, options);
      });
      try {
        await expect(copyCardMonths(DEFAULT_RELAYS, NEXT)).resolves.toBeNull();
      } finally {
        jest.restoreAllMocks();
      }
      await expect(copyCardMonths(DEFAULT_RELAYS, NEXT)).resolves.not.toBeNull();
      expect((await headsOnNext()).get(key)!.head.set).toBe(
        monthSet([
          ["t", "e1", 0],
          ["t", "e2", 0],
          ["t", "e3", 0]
        ])
      );
    });
  });

  it("go before anything when the list left does not answer whole, or the new one does not take them", async () => {
    // Nothing to copy yet: unread, that is not told either.
    for (const relay of DEFAULT_RELAYS.slice(0, 3)) nostr.unreachable.add(relay);
    await expect(copyCardMonths(DEFAULT_RELAYS, NEXT)).resolves.toBeNull();
    nostr.unreachable.clear();
    await historyOnListLeft();
    for (const relay of DEFAULT_RELAYS.slice(0, 3)) nostr.unreachable.add(relay);
    await expect(copyCardMonths(DEFAULT_RELAYS, NEXT)).resolves.toBeNull();
    expect(NEXT.every((relay) => heldBy(relay).size === 0)).toBe(true);
    nostr.unreachable.clear();
    for (const relay of NEXT.slice(0, 2)) nostr.readOnly.add(relay);
    await expect(copyCardMonths(DEFAULT_RELAYS, NEXT)).resolves.toBeNull();
  });

  it("put the parts first: a head never names parts the new list lacks", async () => {
    const held = await historyOnListLeft();
    // The new relays refuse the parts, and take the rest.
    const publish = nostr.publishEvent;
    const spy = jest
      .spyOn(nostr, "publishEvent")
      .mockImplementation(async (url, event, options) => {
        if (NEXT.includes(url) && event.pubkey === partKeys.nostr.publicKey) {
          throw new Error(`${url}: no answer in time`);
        }
        return publish(url, event, options);
      });
    try {
      await expect(copyCardMonths(DEFAULT_RELAYS, NEXT)).resolves.toBeNull();
    } finally {
      spy.mockRestore();
    }
    expect(nowhere(held.head)).toBe(true);
    expect(nowhere(held.newer)).toBe(true);
  });

  it("count the relays both lists share, and copy only the account's own records", async () => {
    const held = await historyOnListLeft();
    // A relay of the list left adds an event of somebody else's to its answers.
    const stranger = randomNostrKeys();
    const foreign = sealRecord({
      type: "card-history-month",
      value: {},
      signer: stranger.secretKey,
      encryptionKey: historyKeys.encryptionKey,
      address: "ab".repeat(32),
      createdAt: nowUnix()
    });
    const query = nostr.queryEvents;
    const spy = jest
      .spyOn(nostr, "queryEvents")
      .mockImplementation(async (url, filter, options) => [
        ...(await query(url, filter, options)),
        // In its first page: a relay that sent it on every page would never be through.
        ...(url === DEFAULT_RELAYS[0] && filter.until === undefined ? [foreign] : [])
      ]);
    // Two of the three relays of the new list are on the list left already; the third takes nothing.
    const next = [DEFAULT_RELAYS[0], DEFAULT_RELAYS[1], NEXT[0]];
    nostr.readOnly.add(NEXT[0]);
    try {
      await expect(copyCardMonths(DEFAULT_RELAYS, next)).resolves.not.toBeNull();
    } finally {
      spy.mockRestore();
    }
    expect(everywhere(held.head, next.slice(0, 2))).toBe(true);
    expect([...nostr.stored.values()].flat().some(({ id }) => id === foreign.id)).toBe(false);
    expect(
      nostr.calls.some((call) => call.operation === "publish" && call.event?.id === foreign.id)
    ).toBe(false);
  });
});

describe("the cards' other records at a change of relays", () => {
  it("follow as they are: states, their order, approved merchants, taps, movements, the images", async () => {
    const held = await historyOnListLeft();
    const look = createImage(new Uint8Array(300).fill(4), nowUnix());
    await publishImageToMajority(look.event, look.ref, currentRelays());
    await withCardAccess((access) =>
      recordCardState(access, {
        cardId: CARD,
        uid: UID,
        keyVersion: 1,
        status: "active",
        relayHost: DEFAULT_CARD_RELAY_HOST,
        lastCounter: 5,
        depositedThrough: 1005,
        maxPaymentSats: 20_000n,
        maxDaySats: 50_000n,
        maxPaymentsPerHour: 5,
        suspended: false,
        name: "",
        look: { kind: "image", image: look.ref, ink: "light" },
        issuer: null,
        settingsAt: Date.now(),
        walletGeneration: 1
      })
    );
    const mode = payeeModeEvent(payeeKeys, {
      cardId: CARD,
      walletGeneration: 1,
      mode: "approved",
      modeAt: Date.now(),
      updatedAt: nowUnix()
    });
    await publishTo(mode, payeeKeys.nostr.secretKey);
    // "Organise": the cards' order, a record of the cards' author (card-order.ts).
    await withCardAccess((access) =>
      saveCardOrder(access, [{ cardId: CARD, walletGeneration: 1 }])
    );
    const months = await copyCardMonths(DEFAULT_RELAYS, NEXT);
    const before = nostr.calls.length;
    await copyCardRecords(DEFAULT_RELAYS, NEXT, months!);
    const order = (nostr.stored.get(DEFAULT_RELAYS[0]) ?? []).find((event) =>
      event.tags.some(([name, value]) => name === "d" && value === cardOrderAddress(stateKeys))
    )!;
    expect(order.pubkey).toBe(stateKeys.nostr.publicKey);
    expect(everywhere(order)).toBe(true);
    for (const event of [held.recentTap, held.recentMovement, mode]) {
      expect(everywhere(event)).toBe(true);
    }
    const state = (nostr.stored.get(DEFAULT_RELAYS[0]) ?? []).find(
      (event) => event.pubkey === stateKeys.nostr.publicKey
    )!;
    expect(everywhere(state)).toBe(true);
    // The card's own copy of its state (own-copies.ts), which its pass reads.
    const own = cardOwnKeys(cardOwnSecret(root, { cardId: CARD, walletGeneration: 1 }));
    const ownState = (nostr.stored.get(DEFAULT_RELAYS[0]) ?? []).find(
      (event) => event.pubkey === own.state.nostr.publicKey
    )!;
    expect(ownState).toBeDefined();
    expect(everywhere(ownState)).toBe(true);
    const imageKey = imageAuthor(look.ref).publicKey;
    for (const relay of NEXT) {
      expect((nostr.stored.get(relay) ?? []).some((event) => event.pubkey === imageKey)).toBe(true);
    }
    // Nothing of the copies of the months read nor sent again, a part no head names left behind.
    const again = nostr.calls
      .slice(before)
      .filter(
        (call) =>
          (call.operation === "publish" &&
            [...held.parts, held.head].some(({ id }) => id === call.event!.id)) ||
          call.filter?.authors?.includes(partKeys.nostr.publicKey)
      );
    expect(again).toEqual([]);
    expect(nowhere(held.orphan)).toBe(true);
  });

  it("reach a majority of a shorter list too, given to its relays that lack them", async () => {
    // A record on a majority of the list left may be on a minority of a shorter one, where a read
    // stops at a majority.
    await historyOnListLeft();
    await withCardAccess((access) =>
      recordCardState(access, {
        cardId: CARD,
        uid: UID,
        keyVersion: 1,
        status: "active",
        relayHost: DEFAULT_CARD_RELAY_HOST,
        lastCounter: 5,
        depositedThrough: 1005,
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
    const kept = DEFAULT_RELAYS.slice(0, 3);
    const lost = kept[2]!;
    const held = nostr.stored.get(DEFAULT_RELAYS[0]!)?.length ?? 0;
    nostr.stored.set(lost, []);
    const before = nostr.calls.length;
    await copyCardRecords(DEFAULT_RELAYS, kept, { later: [] });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const published = nostr.calls
      .slice(before)
      .filter(({ operation }) => operation === "publish")
      .map(({ relay }) => relay);
    // To the new list only, and the relay that lost them holds the cards' records again.
    expect(published.every((relay) => kept.includes(relay))).toBe(true);
    expect(published).toContain(lost);
    expect(nostr.stored.get(lost)?.length ?? 0).toBeGreaterThan(0);
    expect(nostr.stored.get(lost)!.length).toBeLessThanOrEqual(held);
  });
});

describe("what a deleted card's wallet left, at a change of relays", () => {
  it("stays on the list left: neither its months, taps, movements nor merchants follow", async () => {
    // The card deleted, then added again: its first wallet's data erased, its second's in service.
    await withCardAccess((access) =>
      recordCardState(access, {
        cardId: CARD,
        uid: UID,
        keyVersion: 2,
        status: "active",
        relayHost: DEFAULT_CARD_RELAY_HOST,
        lastCounter: 1,
        depositedThrough: 1,
        maxPaymentSats: 20_000n,
        maxDaySats: 50_000n,
        maxPaymentsPerHour: 5,
        suspended: false,
        name: "",
        look: null,
        issuer: null,
        settingsAt: Date.now(),
        walletGeneration: 2
      })
    );
    const first = { cardId: CARD, walletGeneration: 1 };
    const second = { cardId: CARD, walletGeneration: 2 };
    /** `copy` of `wallet`'s. */
    const of = (copy: HistoryCopy, walletGeneration: number): HistoryCopy => ({
      ...copy,
      entry: { ...copy.entry, walletGeneration }
    });
    const signedAt = nowUnix() - 30 * 24 * 3600;
    const month = (wallet: typeof first, id: string) => {
      const copy = monthCopy(wallet, monthOf(OLD), [of(tap(id, OLD), wallet.walletGeneration)], []);
      return {
        parts: copy.parts.map((part) => monthPartEvent(partKeys, part, signedAt)),
        head: monthHeadEvent(historyKeys, copy.head, signedAt)
      };
    };
    const gone = month(first, "c1");
    const kept = month(second, "c2");
    const goneTap = historyEvent(historyKeys, tap("a1", RECENT));
    const goneMovement = movementEvent(historyKeys, movement("m1", RECENT + 1000));
    const keptTap = historyEvent(historyKeys, of(tap("a2", RECENT + 2000), 2));
    const mode = (walletGeneration: number) =>
      payeeModeEvent(payeeKeys, {
        cardId: CARD,
        walletGeneration,
        mode: "approved",
        modeAt: Date.now(),
        updatedAt: nowUnix()
      });
    const goneMode = mode(1);
    const keptMode = mode(2);
    for (const event of [...gone.parts, ...kept.parts]) {
      await publishTo(event, partKeys.nostr.secretKey);
    }
    for (const event of [gone.head, kept.head, goneTap, goneMovement, keptTap]) {
      await publishTo(event, historyKeys.nostr.secretKey);
    }
    for (const event of [goneMode, keptMode]) await publishTo(event, payeeKeys.nostr.secretKey);

    const months = await copyCardMonths(DEFAULT_RELAYS, NEXT);
    expect(months?.later.map(({ id }) => id)).toEqual([keptTap.id]);
    await copyCardRecords(DEFAULT_RELAYS, NEXT, months!);
    for (const event of [...gone.parts, gone.head, goneTap, goneMovement, goneMode]) {
      expect(nowhere(event)).toBe(true);
    }
    for (const event of [...kept.parts, kept.head, keptTap, keptMode]) {
      expect(everywhere(event)).toBe(true);
    }
  });
});

describe("a change of the account's relays", () => {
  it("takes the copies of the cards' months along before it is saved, the rest after", async () => {
    const held = await historyOnListLeft();
    await changeRelays(NEXT);
    expect(getAccountSettings()?.relays).toEqual(NEXT);
    // Read on the new list as soon as the change is saved: every month whole.
    const history = await withCardAccess((access) => readCardHistory(access));
    const head = history.heads.get(`${CARD}/1/${monthOf(OLD)}`)!.head;
    expect(head).toEqual(held.copy.head);
    const month = await withCardAccess((access) => readCardHistoryMonth(access, head));
    expect(month).toMatchObject({ complete: true });
    expect(month!.taps.map(({ entry }) => entry.id)).toEqual(["c1", "c2"]);
    // The taps and movements of this format follow.
    await settled();
    expect(everywhere(held.recentTap)).toBe(true);
    expect(everywhere(held.recentMovement)).toBe(true);
  });

  it("holds the activity: the auto-lock never closes the account while the records are copied", async () => {
    await historyOnListLeft();
    const release = nostr.holdQueries();
    const change = changeRelays(NEXT);
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(idleMs()).toBe(0);
    release();
    await change;
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(idleMs()).toBeGreaterThan(0);
  });

  it("is refused when the new relays do not take them, before anything moves", async () => {
    await historyOnListLeft();
    for (const relay of NEXT) nostr.readOnly.add(relay);
    const refusal = changeRelays(NEXT);
    // Refused by the copy of the months, not by the team's move (TeamError).
    await expect(refusal).rejects.toBeInstanceOf(SettingsError);
    await expect(refusal).rejects.toMatchObject({ code: "unreachable" });
    expect(getAccountSettings()?.relays).toEqual(DEFAULT_RELAYS);
    // Nothing but the first parts was sent there: the team did not move.
    const sent = nostr.calls.filter(
      (call) => call.operation === "publish" && NEXT.includes(call.relay)
    );
    expect(sent.length).toBeGreaterThan(0);
    expect(sent.every(({ event }) => event!.pubkey === partKeys.nostr.publicKey)).toBe(true);
  });
});
