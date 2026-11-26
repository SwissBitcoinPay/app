import { hexToBytes } from "@noble/hashes/utils.js";

import {
  DEFAULT_CARD_DAY_SATS,
  DEFAULT_CARD_PAYMENT_SATS,
  DEFAULT_CARD_PAYMENTS_PER_HOUR,
  DEFAULT_CARD_RELAY_HOST
} from "@/config/card";
import { closeAccount } from "@/features/account/session";
import {
  eraseCardLeftoversOnRelays,
  eraseCardRecords,
  finishCardDeletion,
  forgetCardsOnDevice,
  forgetErasedCards,
  holdsErasedSettings,
  resetCardErasures
} from "@/features/card/card-erasure";
import { copyCardHistory } from "@/features/card/history-copies";
import { readCardHistory } from "@/features/card/history-sync";
import {
  recordCardState,
  refreshCardStates,
  resetCardStates,
  withCardAccess,
  type CardAccess
} from "@/features/card/states";
import type { CardMovement } from "@/lib/card/card-movement";
import type { CardState } from "@/lib/card/card-record";
import {
  deriveMonthPartKeys,
  monthPartAddresses,
  type MonthPartKeys
} from "@/lib/card/history-months";
import {
  deriveHistoryRecordKeys,
  historyAddress,
  historyEvent,
  movementEvent,
  type HistoryCopy,
  type HistoryRecordKeys,
  type MovementCopy
} from "@/lib/card/history-records";
import { cardIdOf } from "@/lib/card/keys";
import { approvePayee, emptyPayeeBook } from "@/lib/card/payee-book";
import {
  derivePayeeRecordKeys,
  payeeEvent,
  payeeModeEvent,
  type PayeeRecordKeys
} from "@/lib/card/payee-records";
import { approveCardPayee, loadPayeeBooks } from "@/lib/card/payees";
import { loadCardPayments, logCardPayment, type CardPaymentEntry } from "@/lib/card/payment-log";
import { loadPushMarks, markPushToken } from "@/lib/card/push-marks";
import { createImage, fetchImage, imageAuthor, publishImageToMajority } from "@/lib/media/image";
import type { NostrEvent } from "@/lib/nostr/event";
import { publishToRelays } from "@/lib/nostr/pool";
import { currentRelays } from "@/lib/relays/current";

import { openTestAccount, TEST_WALLET_ID } from "../../jest/account";
import type * as FileSystemFake from "../../jest/expo-file-system";
import type * as RelaysFake from "../../jest/nostr-relays";

/*
 * "Delete the card" erases all its data: its settings, the
 * images they name, its history and its book on the account's relays, and what each device keeps
 * of them.
 */

const nostr = jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");
const fileSystem = jest.requireMock<typeof FileSystemFake>("expo-file-system");
const UID = "04996c6a926980";
const OTHER_UID = "04a39493cc8680";
/** The test account's cards of those UIDs (beforeEach). */
let CARD: string;
let OTHER: string;

/** The first instant of last month (UTC): its records live still, and it can be copied. */
const today = new Date();
const LAST_MONTH = Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1);

let historyKeys: HistoryRecordKeys;
let partKeys: MonthPartKeys;
let payeeKeys: PayeeRecordKeys;

/** A card's settings once deleted: none of its holder's. */
const ERASED = {
  name: "",
  look: null,
  issuer: null,
  maxPaymentSats: DEFAULT_CARD_PAYMENT_SATS,
  maxDaySats: DEFAULT_CARD_DAY_SATS,
  maxPaymentsPerHour: DEFAULT_CARD_PAYMENTS_PER_HOUR,
  suspended: false
} as const;

/** A card in service with its holder's settings, `patch` over it. */
function cardOf(
  cardId: string,
  uid: string,
  patch: Partial<CardState> = {}
): Omit<CardState, "updatedAt"> {
  return {
    cardId,
    uid,
    keyVersion: 1,
    status: "active",
    relayHost: DEFAULT_CARD_RELAY_HOST,
    lastCounter: 0,
    depositedThrough: 0,
    maxPaymentSats: 30_000n,
    maxDaySats: 80_000n,
    maxPaymentsPerHour: 7,
    suspended: true,
    name: "Everyday",
    look: null,
    issuer: null,
    settingsAt: Date.now() - 60_000,
    walletGeneration: 1,
    ...patch
  };
}

/** `state` recorded, as its phone records it: the state kept. */
function record(state: Omit<CardState, "updatedAt">): Promise<CardState> {
  return withCardAccess(async (access) => (await recordCardState(access, state)).state);
}

/** What a sync of the cards does of the erased ones (sync.ts): this device's, then the relays'. */
async function eraseCardLeftovers(
  access: CardAccess,
  states: readonly CardState[],
  conclusive: boolean
): Promise<void> {
  await forgetErasedCards(access, states);
  await eraseCardLeftoversOnRelays(access, states, conclusive);
}

/** The card `cardId` as a majority of the relays and this device tell it now. */
function stateOf(cardId: string): Promise<CardState | undefined> {
  return withCardAccess(async (access) =>
    (await refreshCardStates(access)).states.find((state) => state.cardId === cardId)
  );
}

function entry(id: string, at: number, cardId = CARD, walletGeneration = 1): CardPaymentEntry {
  return {
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
}

function tap(
  id: string,
  at: number,
  cardId = CARD,
  revision = 0,
  walletGeneration = 1
): HistoryCopy {
  return { entry: entry(id, at, cardId, walletGeneration), revision };
}

function movement(id: string, at: number, cardId = CARD, walletGeneration = 1): MovementCopy {
  const moved: CardMovement = {
    id,
    cardId,
    walletGeneration,
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

async function publish(event: NostrEvent, authKey: Uint8Array): Promise<string[]> {
  return publishToRelays(event, {
    relays: currentRelays(),
    channel: "account",
    timeoutMs: 1000,
    authKey
  });
}

/** What the relays hold of `author`'s records (not its deletion requests), each event once. */
function recordsOf(author: string): NostrEvent[] {
  const events = new Map<string, NostrEvent>();
  for (const event of [...nostr.stored.values()].flat()) {
    if (event.pubkey === author && event.kind !== 5) events.set(event.id, event);
  }
  return [...events.values()];
}

/** Whether a relay holds a record of `author` at the address `d`. */
function heldAt(author: string, d: string): boolean {
  return recordsOf(author).some((event) =>
    event.tags.some(([name, value]) => name === "d" && value === d)
  );
}

/** The card's history and book on the relays, and another card's, as their phones publish them. */
async function seed(): Promise<void> {
  for (const copy of [tap("a1", LAST_MONTH + 1000), tap("a2", Date.now() - 60_000)]) {
    await publish(historyEvent(historyKeys, copy), historyKeys.nostr.secretKey);
  }
  await publish(
    historyEvent(historyKeys, tap("b1", LAST_MONTH + 2000, OTHER)),
    historyKeys.nostr.secretKey
  );
  await publish(
    movementEvent(historyKeys, movement("m1", LAST_MONTH + 3000)),
    historyKeys.nostr.secretKey
  );
  await publish(
    movementEvent(historyKeys, movement("m2", LAST_MONTH + 4000, OTHER)),
    historyKeys.nostr.secretKey
  );
  // Last month's copies, both cards'.
  await withCardAccess(async (access) =>
    copyCardHistory(access, await readCardHistory(access), Date.now())
  );
  for (const cardId of [CARD, OTHER]) {
    const wallet = { cardId, walletGeneration: 1 };
    const mode = { ...wallet, mode: "automatic" as const, modeAt: 100_000, updatedAt: 100 };
    await publish(payeeModeEvent(payeeKeys, mode), payeeKeys.nostr.secretKey);
    const book = approvePayee(
      emptyPayeeBook(wallet),
      { id: "sattleme07@breez.tips", name: "Coffee Shop" },
      200_000
    );
    await publish(
      payeeEvent(payeeKeys, book.payees.get("sattleme07@breez.tips")!),
      payeeKeys.nostr.secretKey
    );
  }
}

beforeEach(async () => {
  // A device of its own for each test: its cards' states, its log, its books.
  fileSystem.resetFileSystem();
  resetCardStates();
  nostr.resetRelays();
  resetCardErasures();
  await openTestAccount();
  ({ historyKeys, partKeys, payeeKeys, CARD, OTHER } = await withCardAccess(async ({ root }) => ({
    historyKeys: deriveHistoryRecordKeys(root),
    partKeys: deriveMonthPartKeys(root),
    payeeKeys: derivePayeeRecordKeys(root),
    CARD: cardIdOf(root, hexToBytes(UID)),
    OTHER: cardIdOf(root, hexToBytes(OTHER_UID))
  })));
});

afterEach(() => {
  jest.restoreAllMocks();
  closeAccount();
});

describe("a deleted card's records on the account's relays", () => {
  it("are erased, its history and its book: another card's stay", async () => {
    await seed();
    const { heads } = await withCardAccess((access) => readCardHistory(access));
    const partsOf = (cardId: string) =>
      [...heads.values()].flatMap(({ head }) =>
        head.cardId === cardId ? monthPartAddresses(partKeys, head) : []
      );
    expect(partsOf(CARD).length).toBeGreaterThan(0);
    expect(partsOf(OTHER).length).toBeGreaterThan(0);
    const parts = partKeys.nostr.publicKey;
    const partIds = recordsOf(parts)
      .filter((event) => event.tags.some(([name, d]) => name === "d" && partsOf(CARD).includes(d)))
      .map(({ id }) => id);
    expect(partIds.length).toBeGreaterThan(0);
    await expect(
      withCardAccess((access) => eraseCardRecords(access, new Map([[CARD, 1]])))
    ).resolves.toBe(true);
    // Named by id too, which every version of strfry deletes, as well as by address.
    const named = nostr.calls.flatMap(({ operation, event }) =>
      operation === "publish" && event?.kind === 5 && event.pubkey === parts
        ? event.tags.filter(([name]) => name === "e").map(([, id]) => id)
        : []
    );
    expect(partIds.filter((id) => !named.includes(id))).toEqual([]);

    const history = await withCardAccess((access) => readCardHistory(access));
    expect([...history.recorded.taps].map(({ entry }) => entry.id).sort()).toEqual(["b1"]);
    expect([...history.recorded.movements].map(({ movement }) => movement.id)).toEqual(["m2"]);
    expect([...history.heads.values()].map(({ head }) => head.cardId)).toEqual([OTHER]);
    // Its months' parts gone, the other card's kept.
    expect(partsOf(CARD).filter((d) => heldAt(parts, d))).toEqual([]);
    expect(partsOf(OTHER).every((d) => heldAt(parts, d))).toBe(true);
    // Its book: its mode and merchant gone, the other card's kept.
    expect(recordsOf(payeeKeys.nostr.publicKey)).toHaveLength(2);
  });

  it("never come back: an older copy published again is refused", async () => {
    await seed();
    await withCardAccess((access) => eraseCardRecords(access, new Map([[CARD, 1]])));
    await expect(
      publish(historyEvent(historyKeys, tap("a1", LAST_MONTH + 1000)), historyKeys.nostr.secretKey)
    ).resolves.toEqual([]);
    expect(heldAt(historyKeys.nostr.publicKey, historyAddress(historyKeys, "a1"))).toBe(false);
  });

  it("are not said erased while no majority of the relays answered, nor took the requests", async () => {
    await seed();
    // Three of the five: two answer, fewer than a majority.
    const relays = currentRelays().slice(0, 3);
    expect(currentRelays()).toHaveLength(5);
    for (const url of relays) nostr.unreachable.add(url);
    await expect(
      withCardAccess((access) => eraseCardRecords(access, new Map([[CARD, 1]])))
    ).resolves.toBe(false);
    nostr.unreachable.clear();
    for (const url of relays) nostr.readOnly.add(url);
    await expect(
      withCardAccess((access) => eraseCardRecords(access, new Map([[CARD, 1]])))
    ).resolves.toBe(false);
    nostr.readOnly.clear();
    await expect(
      withCardAccess((access) => eraseCardRecords(access, new Map([[CARD, 1]])))
    ).resolves.toBe(true);
  });
});

describe("a deleted card's settings", () => {
  it("are erased, the images they name first; its record stays, its keys and wallet with it", async () => {
    const look = createImage(new Uint8Array(300).fill(4), Math.floor(Date.now() / 1000));
    await publishImageToMajority(look.event, look.ref, currentRelays());
    const deleted = await record(
      cardOf(CARD, UID, {
        status: "deleted",
        keyVersion: 3,
        walletGeneration: 2,
        look: { kind: "image", image: look.ref, ink: "dark" }
      })
    );
    expect((await fetchImage(look.ref)).status).toBe("found");
    await expect(withCardAccess((access) => finishCardDeletion(access, deleted))).resolves.toBe(
      true
    );
    const after = await stateOf(CARD);
    expect(after).toMatchObject({
      ...ERASED,
      status: "deleted",
      uid: UID,
      keyVersion: 3,
      walletGeneration: 2
    });
    expect(holdsErasedSettings(after!)).toBe(true);
    expect((await fetchImage(look.ref)).status).toBe("notFound");
  });

  it("keep a v2 card's printed visual, its look's image erased", async () => {
    const now = Math.floor(Date.now() / 1000);
    const look = createImage(new Uint8Array(300).fill(4), now);
    const printed = createImage(new Uint8Array(300).fill(7), now);
    await publishImageToMajority(look.event, look.ref, currentRelays());
    await publishImageToMajority(printed.event, printed.ref, currentRelays());
    const issuer = { image: printed.ref, number: "4821-0937-5530-1186", white: true };
    const deleted = await record(
      cardOf(CARD, UID, {
        status: "deleted",
        look: { kind: "image", image: look.ref, ink: "dark" },
        issuer
      })
    );
    await expect(withCardAccess((access) => finishCardDeletion(access, deleted))).resolves.toBe(
      true
    );
    const after = await stateOf(CARD);
    expect(after).toMatchObject({ ...ERASED, issuer, status: "deleted" });
    expect(holdsErasedSettings(after!)).toBe(true);
    expect((await fetchImage(look.ref)).status).toBe("notFound");
    expect((await fetchImage(printed.ref)).status).toBe("found");
  });

  it("stay while the images they name are not erased: nothing would find those again", async () => {
    const look = createImage(new Uint8Array(300).fill(4), Math.floor(Date.now() / 1000));
    await publishImageToMajority(look.event, look.ref, currentRelays());
    const deleted = await record(
      cardOf(CARD, UID, {
        status: "deleted",
        look: { kind: "image", image: look.ref, ink: "light" }
      })
    );
    // The relays refuse the image's deletion.
    const author = imageAuthor(look.ref).publicKey;
    const publishEvent = nostr.publishEvent;
    const refusing = jest
      .spyOn(nostr, "publishEvent")
      .mockImplementation(async (url, event, options) => {
        if (event.kind === 5 && event.pubkey === author) throw new Error(`${url}: refused`);
        return publishEvent(url, event, options);
      });
    await expect(withCardAccess((access) => finishCardDeletion(access, deleted))).resolves.toBe(
      false
    );
    expect(await stateOf(CARD)).toMatchObject({
      status: "deleted",
      name: "Everyday",
      look: { kind: "image", image: look.ref }
    });
    expect((await fetchImage(look.ref)).status).toBe("found");
    // Taken at the next sync: then the settings go.
    refusing.mockRestore();
    await withCardAccess(async (access) =>
      eraseCardLeftovers(access, [(await stateOf(CARD))!], true)
    );
    expect(await stateOf(CARD)).toMatchObject({ ...ERASED, status: "deleted" });
    expect((await fetchImage(look.ref)).status).toBe("notFound");
  });

  it("are not said erased while no majority of the relays took the record without them", async () => {
    const deleted = await record(cardOf(CARD, UID, { status: "deleted" }));
    const author = await withCardAccess(async ({ keys }) => keys.nostr.publicKey);
    // The relays refuse the card's record, and take the rest.
    const publishEvent = nostr.publishEvent;
    const refusing = jest
      .spyOn(nostr, "publishEvent")
      .mockImplementation(async (url, event, options) => {
        if (event.kind !== 5 && event.pubkey === author) throw new Error(`${url}: refused`);
        return publishEvent(url, event, options);
      });
    await expect(withCardAccess((access) => finishCardDeletion(access, deleted))).resolves.toBe(
      false
    );
    // Kept on this phone, published at the next sync.
    refusing.mockRestore();
    await withCardAccess(async (access) =>
      eraseCardLeftovers(access, [(await stateOf(CARD))!], true)
    );
    const erased = (await stateOf(CARD))!;
    expect(erased).toMatchObject({ ...ERASED, status: "deleted" });
    // Proven then: not erased again this session.
    const queries = nostr.calls.filter((call) => call.operation === "query").length;
    await withCardAccess((access) => eraseCardLeftovers(access, [erased], true));
    expect(nostr.calls.filter((call) => call.operation === "query").length).toBe(queries);
  });

  it("are erased again when a copy holds some again: a device changed one, not knowing", async () => {
    const deleted = await record(cardOf(CARD, UID, { status: "deleted" }));
    await expect(withCardAccess((access) => finishCardDeletion(access, deleted))).resolves.toBe(
      true
    );
    const { updatedAt: _updatedAt, ...erased } = (await stateOf(CARD))!;
    const renamed = await record({ ...erased, name: "Holidays", settingsAt: Date.now() + 1000 });
    expect(renamed).toMatchObject({ status: "deleted", name: "Holidays" });
    // The same session: its records erased already, its settings again.
    await withCardAccess((access) => eraseCardLeftovers(access, [renamed], true));
    expect(await stateOf(CARD)).toMatchObject({ ...ERASED, status: "deleted" });
  });
});

describe("a deleted card on this phone", () => {
  it("leaves nothing of it, its payments and its book; another card's stay", async () => {
    await logCardPayment(entry("a1", Date.now() - 60_000));
    await logCardPayment(entry("b1", Date.now() - 50_000, OTHER));
    const coffeeShop = { id: "sattleme07@breez.tips", name: "Coffee Shop" };
    await approveCardPayee(TEST_WALLET_ID, { cardId: CARD, walletGeneration: 1 }, coffeeShop, 1);
    await approveCardPayee(TEST_WALLET_ID, { cardId: OTHER, walletGeneration: 1 }, coffeeShop, 1);
    await markPushToken(CARD, null);
    await markPushToken(OTHER, null);

    await forgetCardsOnDevice(TEST_WALLET_ID, new Map([[CARD, 1]]));

    expect((await loadCardPayments()).map(({ id }) => id)).toEqual(["b1"]);
    expect([...(await loadPayeeBooks(TEST_WALLET_ID)).books.keys()]).toEqual([OTHER]);
    // Its push mark goes with its channel, once the relay deleted it (sync.ts).
    const marks = await loadPushMarks();
    expect(marks.has(CARD)).toBe(true);
    expect(marks.has(OTHER)).toBe(true);
  });

  it("is erased at each sync, its relays' records once a session", async () => {
    await seed();
    await logCardPayment(entry("a3", Date.now() - 60_000));
    const deleted = await record(cardOf(CARD, UID, { ...ERASED, status: "deleted" }));
    const active = await record(cardOf(OTHER, OTHER_UID));
    await withCardAccess((access) => eraseCardLeftovers(access, [deleted, active], true));
    expect((await loadCardPayments()).map(({ id }) => id)).toEqual([]);
    const history = await withCardAccess((access) => readCardHistory(access));
    expect([...history.recorded.taps].map(({ entry }) => entry.id)).toEqual(["b1"]);
    expect((await stateOf(OTHER))?.name).toBe("Everyday");
    // Once a session: no read again. A payment this phone logged before it knew is forgotten still.
    await logCardPayment(entry("a4", Date.now() - 30_000));
    const queries = nostr.calls.filter((call) => call.operation === "query").length;
    await withCardAccess((access) => eraseCardLeftovers(access, [deleted, active], true));
    expect(nostr.calls.filter((call) => call.operation === "query").length).toBe(queries);
    expect((await loadCardPayments()).map(({ id }) => id)).toEqual([]);
  });
});

describe("a card deleted, then added again", () => {
  /** Its next wallet's records, as its phone publishes them once the card is added again. */
  async function seedNextWallet(): Promise<void> {
    await publish(
      historyEvent(historyKeys, tap("c1", Date.now() - 30_000, CARD, 0, 2)),
      historyKeys.nostr.secretKey
    );
    await publish(
      movementEvent(historyKeys, movement("n1", Date.now() - 20_000, CARD, 2)),
      historyKeys.nostr.secretKey
    );
    const book = approvePayee(
      emptyPayeeBook({ cardId: CARD, walletGeneration: 2 }),
      { id: "sattleme09@breez.tips", name: "Bakery" },
      Date.now()
    );
    await publish(
      payeeEvent(payeeKeys, book.payees.get("sattleme09@breez.tips")!),
      payeeKeys.nostr.secretKey
    );
  }

  it("leaves its earlier wallet's records nowhere, its current wallet's kept", async () => {
    // The first wallet's history and book, left on the relays (a relay missed their erasure, or a
    // phone not told of the deletion published them again).
    await seed();
    await seedNextWallet();
    await logCardPayment(entry("a3", Date.now() - 60_000));
    await logCardPayment(entry("c2", Date.now() - 10_000, CARD, 2));
    await approveCardPayee(
      TEST_WALLET_ID,
      { cardId: CARD, walletGeneration: 1 },
      { id: "sattleme07@breez.tips", name: "Coffee Shop" },
      1
    );
    const again = await record(cardOf(CARD, UID, { keyVersion: 2, walletGeneration: 2 }));
    await withCardAccess((access) => eraseCardLeftovers(access, [again], true));
    const history = await withCardAccess((access) => readCardHistory(access));
    expect([...history.recorded.taps].map(({ entry }) => entry.id).sort()).toEqual(["b1", "c1"]);
    expect([...history.recorded.movements].map(({ movement }) => movement.id).sort()).toEqual([
      "m2",
      "n1"
    ]);
    expect([...history.heads.values()].map(({ head }) => head.cardId)).toEqual([OTHER]);
    // Its book: the first wallet's mode and merchant gone; the next one's merchant and the other
    // card's book kept.
    expect(recordsOf(payeeKeys.nostr.publicKey)).toHaveLength(3);
    // On this phone: the first wallet's payment and book forgotten, the next one's payment kept.
    expect((await loadCardPayments()).map(({ id }) => id)).toEqual(["c2"]);
    expect((await loadPayeeBooks(TEST_WALLET_ID)).books.size).toBe(0);
    // A card in service: its settings are its own, never erased.
    expect(await stateOf(CARD)).toMatchObject({ status: "active", name: "Everyday" });
  });

  it("never loses its current wallet's data to a device that knows only its deletion", async () => {
    await seedNextWallet();
    // Added again elsewhere, its settings changed since; this device's copy: deleted.
    const deleted = await record(cardOf(CARD, UID, { status: "deleted", settingsAt: 1_000 }));
    await record(
      cardOf(CARD, UID, {
        keyVersion: 2,
        walletGeneration: 2,
        name: "Holidays",
        settingsAt: Date.now()
      })
    );
    await withCardAccess((access) => eraseCardLeftovers(access, [deleted], true));
    const history = await withCardAccess((access) => readCardHistory(access));
    expect([...history.recorded.taps].map(({ entry }) => entry.id)).toEqual(["c1"]);
    expect([...history.recorded.movements].map(({ movement }) => movement.id)).toEqual(["n1"]);
    expect(recordsOf(payeeKeys.nostr.publicKey)).toHaveLength(1);
    // Its settings, changed after the deletion, stand.
    expect(await stateOf(CARD)).toMatchObject({
      status: "active",
      keyVersion: 2,
      walletGeneration: 2,
      name: "Holidays"
    });
  });

  it("erases nothing on the relays after a read of the cards no majority gave", async () => {
    await seed();
    await logCardPayment(entry("a3", Date.now() - 60_000));
    const deleted = await record(cardOf(CARD, UID, { ...ERASED, status: "deleted" }));
    const before = nostr.calls.length;
    await withCardAccess((access) => eraseCardLeftovers(access, [deleted], false));
    // This phone's own data goes (erasing it never touches a wallet in use); the relays wait for
    // a read that proves the card deleted.
    expect((await loadCardPayments()).map(({ id }) => id)).toEqual([]);
    expect(nostr.calls.slice(before)).toEqual([]);
    const history = await withCardAccess((access) => readCardHistory(access));
    expect([...history.recorded.taps].map(({ entry }) => entry.id).sort()).toEqual([
      "a1",
      "a2",
      "b1"
    ]);
  });
});
