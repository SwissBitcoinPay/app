import { DEFAULT_CARD_RELAY_HOST } from "@/config/card";
import { resetCardErasures } from "@/features/card/card-erasure";
import { readCardHistory } from "@/features/card/history-sync";
import { historyRows, firstHorizon } from "@/features/card/history-view";
import { deleteCard, reprogramCard } from "@/features/card/manage";
import { pairCard } from "@/features/card/pairing";
import { resetCardPayments } from "@/features/card/payments";
import { refreshCardPayees } from "@/features/card/payees-sync";
import {
  knownCardState,
  recordCardState,
  refreshCardStates,
  resetCardStates,
  withCardAccess
} from "@/features/card/states";
import { syncAccountCards } from "@/features/card/sync";
import { lockTerminal } from "@/features/navigation/lock";
import {
  cardStateEvent,
  cardStatesFilter,
  cardStatesOf,
  deriveCardRecordKeys,
  type CardState
} from "@/lib/card/card-record";
import { forgetDeviceKey } from "@/lib/card/device-key";
import { deriveHistoryRecordKeys, historyEvent } from "@/lib/card/history-records";
import { deriveCardRoot, type CardWalletOf } from "@/lib/card/keys";
import {
  approvePayee,
  bookOf,
  choosePayeeMode,
  emptyPayeeBook,
  payeesView
} from "@/lib/card/payee-book";
import { decidePayee } from "@/lib/card/payee-decision";
import {
  derivePayeeRecordKeys,
  payeeEvent,
  payeeModeEvent,
  payeesOf
} from "@/lib/card/payee-records";
import { approveCardPayee, loadCardPayees, loadPayeeBooks } from "@/lib/card/payees";
import { loadCardPayments, logCardPayment, type CardPaymentEntry } from "@/lib/card/payment-log";
import { walletSecret } from "@/lib/breez/seed";
import { createImage, fetchImage, publishImageToMajority } from "@/lib/media/image";
import type { NostrEvent } from "@/lib/nostr/event";
import { publishToRelays, queryRelays } from "@/lib/nostr/pool";
import { currentRelays } from "@/lib/relays/current";

import { TEST_WALLET_ID, openTestAccount, testSeed } from "../../jest/account";
import { addRelay } from "../../jest/card-relay";
import type * as FileSystemFake from "../../jest/expo-file-system";
import type * as NfcFake from "../../jest/nfc-manager";
import type * as RelaysFake from "../../jest/nostr-relays";
import { FakeNtag424 } from "../../jest/ntag424";

/*
 * A card deleted, then added again ("Delete" erases all its data, the card found again starts
 * anew): nothing of its first wallet decides a payment of its
 * next one, nor shows, wherever it is left: a relay that missed the erasure, a phone not told of
 * the deletion. Then the leftovers go, and never the data of the wallet in use.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock("react-native-nfc-manager", () => require("../../jest/nfc-manager"));
jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    expoConfig: {
      extra: { breezNetwork: "mainnet", eas: { projectId: "00000000-0000-4000-8000-000000000000" } }
    }
  }
}));

const nfc = jest.requireMock<typeof NfcFake>("react-native-nfc-manager");
const nostr = jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");
const fileSystem = jest.requireMock<typeof FileSystemFake>("expo-file-system");
const HOST = DEFAULT_CARD_RELAY_HOST;
const MESSAGES = { alert: "Hold the card to the phone" };
const COFFEE_SHOP = { id: "sattleme07@breez.tips", name: "Coffee Shop" };
const apiKey = process.env.EXPO_PUBLIC_BREEZ_API_KEY;
const root = deriveCardRoot(walletSecret(testSeed()));
let card: FakeNtag424;
let cardId: string;

beforeEach(async () => {
  process.env.EXPO_PUBLIC_BREEZ_API_KEY = "test-api-key";
  fileSystem.resetFileSystem();
  nostr.resetRelays();
  nfc.resetNfcManager();
  resetCardStates();
  resetCardPayments();
  resetCardErasures();
  forgetDeviceKey();
  addRelay(HOST);
  await openTestAccount({ usage: "card", signUp: "card" });
  card = new FakeNtag424();
  nfc.holdCard(card);
  const paired = await pairCard({ relayHost: HOST, channelName: "P", messages: MESSAGES });
  cardId = paired.state.cardId;
});

afterEach(async () => {
  resetCardPayments();
  await lockTerminal();
  process.env.EXPO_PUBLIC_BREEZ_API_KEY = apiKey;
  jest.restoreAllMocks();
});

/** Published by another device of the account, signed by `secretKey`'s author. */
async function publishElsewhere(event: NostrEvent, secretKey: Uint8Array): Promise<void> {
  await publishToRelays(event, {
    relays: currentRelays(),
    channel: "account",
    timeoutMs: 1000,
    authKey: secretKey
  });
}

/** `wallet`'s book on the relays: "Automatic", the coffee shop approved. */
async function bookOnRelays(wallet: CardWalletOf): Promise<void> {
  const keys = derivePayeeRecordKeys(root);
  const book = choosePayeeMode(
    approvePayee(emptyPayeeBook(wallet), COFFEE_SHOP, 200_000),
    "automatic",
    1
  )!;
  await publishElsewhere(payeeModeEvent(keys, book.mode), keys.nostr.secretKey);
  await publishElsewhere(payeeEvent(keys, book.payees.get(COFFEE_SHOP.id)!), keys.nostr.secretKey);
}

function payment(id: string, wallet: CardWalletOf): CardPaymentEntry {
  return {
    id,
    cardId: wallet.cardId,
    walletGeneration: wallet.walletGeneration,
    at: Date.now() - 60_000,
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

/** A payment of `wallet` on the relays, as its phone publishes it. */
async function paymentOnRelays(id: string, wallet: CardWalletOf): Promise<void> {
  const keys = deriveHistoryRecordKeys(root);
  await publishElsewhere(
    historyEvent(keys, { entry: payment(id, wallet), revision: 0 }),
    keys.nostr.secretKey
  );
}

/** The ids of the card's payments "History" shows for its wallet `wallet`. */
async function shownPayments(wallet: CardWalletOf): Promise<string[]> {
  const history = await withCardAccess((access) => readCardHistory(access));
  return historyRows({
    card: wallet,
    horizon: firstHorizon(Date.now()),
    own: await loadCardPayments(),
    taps: history.recorded.taps,
    movements: history.movements,
    wallet: null
  }).flatMap((row) => (row.kind === "tap" ? [row.entry.id] : []));
}

/** The ids of the card's payments the relays hold, whatever wallet paid them. */
async function paymentsOnRelays(): Promise<string[]> {
  const history = await withCardAccess((access) => readCardHistory(access));
  return history.recorded.taps
    .filter(({ entry }) => entry.cardId === cardId)
    .map(({ entry }) => entry.id)
    .sort();
}

/** Another phone of the account added the card again: its record at the next keys and wallet. */
async function addedAgainElsewhere(): Promise<CardState> {
  const keys = deriveCardRecordKeys(root);
  const state = knownCardState(TEST_WALLET_ID, cardId)!;
  const again: CardState = {
    ...state,
    status: "active",
    keyVersion: state.keyVersion + 1,
    walletGeneration: state.walletGeneration + 1,
    settingsAt: state.settingsAt + 10,
    updatedAt: state.updatedAt + 10
  };
  await publishElsewhere(cardStateEvent(keys, again), keys.nostr.secretKey);
  return again;
}

it("a relay down during the deletion: the card added again gets nothing of before back", async () => {
  const first = { cardId, walletGeneration: 1 };
  await bookOnRelays(first);
  await paymentOnRelays("a1", first);
  const lagging = currentRelays()[4];
  nostr.unreachable.add(lagging);
  const deleted = await deleteCard(cardId, { inHand: { messages: MESSAGES } });
  expect(deleted).toMatchObject({ state: { status: "deleted" }, erased: true });
  nostr.unreachable.clear();
  // "Add a card" with the same card, right after.
  const again = await pairCard({ relayHost: HOST, channelName: "P", messages: MESSAGES });
  expect(again.state).toMatchObject({ cardId, status: "active", walletGeneration: 2 });

  // The relay back: its copies of the first wallet's book and payment decide and show nothing.
  const { books } = await withCardAccess((access) => refreshCardPayees(access));
  expect(payeesView(bookOf(books, again.state))).toEqual({ mode: "approved", approved: [] });
  expect((await loadPayeeBooks(TEST_WALLET_ID)).books.size).toBe(0);
  expect(await shownPayments(again.state)).toEqual([]);
  expect(await paymentsOnRelays()).toEqual(["a1"]);

  // The next session's sync erases them there too.
  resetCardErasures();
  await syncAccountCards("P");
  expect(await paymentsOnRelays()).toEqual([]);
  const held = payeesOf(
    derivePayeeRecordKeys(root),
    new Map([[lagging, nostr.stored.get(lagging) ?? []]])
  );
  expect(held.cards.size).toBe(0);
});

it("a v2 card added again shows its printed visual again, nothing of its holder's", async () => {
  const printed = createImage(new Uint8Array(300).fill(7), Math.floor(Date.now() / 1000));
  await publishImageToMajority(printed.event, printed.ref, currentRelays());
  const issuer = { image: printed.ref, number: "4821-0937-5530-1186", white: false };
  await withCardAccess(async (access) => {
    const { updatedAt: _updatedAt, ...state } = knownCardState(TEST_WALLET_ID, cardId)!;
    await recordCardState(access, {
      ...state,
      name: "Everyday",
      issuer,
      settingsAt: state.settingsAt + 1
    });
  });
  const deleted = await deleteCard(cardId, { inHand: { messages: MESSAGES } });
  expect(deleted).toMatchObject({ state: { status: "deleted" }, erased: true });
  expect(knownCardState(TEST_WALLET_ID, cardId)).toMatchObject({
    status: "deleted",
    name: "",
    issuer
  });
  expect((await fetchImage(printed.ref)).status).toBe("found");

  const again = await pairCard({ relayHost: HOST, channelName: "P", messages: MESSAGES });
  expect(again.state).toMatchObject({ cardId, status: "active", name: "", issuer });
  const { states } = await withCardAccess(refreshCardStates);
  expect(states.find((state) => state.cardId === cardId)).toMatchObject({ issuer });
});

it("a phone never told of the deletion pays none of the first wallet's merchants without asking", async () => {
  const first = { cardId, walletGeneration: 1 };
  // This phone approved a merchant and logged a payment, for the card's first wallet.
  await approveCardPayee(TEST_WALLET_ID, first, COFFEE_SHOP, Date.now());
  await logCardPayment(payment("b1", first));
  // Meanwhile another phone deleted the card and added it again.
  const again = await addedAgainElsewhere();
  await syncAccountCards("P");
  expect(knownCardState(TEST_WALLET_ID, cardId)).toMatchObject({
    status: "active",
    walletGeneration: 2
  });
  // Nothing of the first wallet decides: every payment asks.
  const payees = await loadCardPayees(TEST_WALLET_ID, again);
  expect(payees).toEqual({ mode: "approved", approved: [] });
  const decided = decidePayee(payees, {
    status: "identified",
    payee: {
      by: "address",
      ...COFFEE_SHOP,
      metadata: "[]",
      verify: "https://breez.tips/v",
      verifyAnswer: "{}"
    }
  });
  expect(decided).toMatchObject({ automatic: false, automaticLocked: false });
  // Its first wallet's book and payment are gone from this phone, never published.
  expect((await loadPayeeBooks(TEST_WALLET_ID)).books.size).toBe(0);
  expect(await loadCardPayments()).toEqual([]);
  expect(await paymentsOnRelays()).toEqual([]);
});

it("a sync whose read of the cards is not conclusive erases nothing of the card added again", async () => {
  // This phone deletes the card without it: it knows it deleted.
  await deleteCard(cardId);
  // Another phone adds it again, pays and approves a merchant with its next wallet.
  const again = await addedAgainElsewhere();
  await paymentOnRelays("c1", again);
  await bookOnRelays(again);
  // A new session; at its sync, the read of the cards' records gets no majority in time.
  resetCardErasures();
  resetCardStates();
  const cardAuthor = deriveCardRecordKeys(root).nostr.publicKey;
  const queryEvents = nostr.queryEvents;
  const slow = jest.spyOn(nostr, "queryEvents").mockImplementation(async (url, filter, options) => {
    if (filter.authors?.includes(cardAuthor)) throw new Error(`${url}: no answer in time`);
    return queryEvents(url, filter, options);
  });
  await syncAccountCards("P");
  slow.mockRestore();
  expect(await paymentsOnRelays()).toEqual(["c1"]);
  // Read whole at last: the card is in service, its next wallet's data its own.
  const { states } = await withCardAccess((access) => refreshCardStates(access));
  expect(states.find((state) => state.cardId === cardId)).toMatchObject({
    status: "active",
    walletGeneration: 2
  });
  await syncAccountCards("P");
  expect(await paymentsOnRelays()).toEqual(["c1"]);
  const { books } = await withCardAccess((access) => refreshCardPayees(access));
  expect(payeesView(bookOf(books, again))).toMatchObject({
    mode: "automatic",
    approved: [{ id: COFFEE_SHOP.id }]
  });
});

/** Waits until `condition` holds (real timers), at most a second. */
async function until(condition: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 200 && !condition(); attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  expect(condition()).toBe(true);
}

/** The card's record as a majority of the relays hold it: what another phone of the account reads. */
async function relaysCopy(): Promise<CardState | undefined> {
  const keys = deriveCardRecordKeys(root);
  const answers = await queryRelays(cardStatesFilter(keys), {
    relays: currentRelays(),
    channel: "account",
    timeoutMs: 1000,
    authKey: keys.nostr.secretKey
  });
  return cardStatesOf(keys, root, answers).states.get(cardId);
}

/** How many relays hold a copy of the card's record of `status`, each read on its own. */
async function relaysHolding(status: CardState["status"]): Promise<number> {
  const keys = deriveCardRecordKeys(root);
  const answers = await queryRelays(cardStatesFilter(keys), {
    relays: currentRelays(),
    channel: "account",
    timeoutMs: 1000,
    authKey: keys.nostr.secretKey
  });
  return [...answers].filter(
    ([url, events]) =>
      cardStatesOf(keys, root, new Map([[url, events]])).states.get(cardId)?.status === status
  ).length;
}

/** Whether a state of the card was sent to a relay since `from` calls. */
function stateSent(from: number): boolean {
  const author = deriveCardRecordKeys(root).nostr.publicKey;
  return nostr.calls
    .slice(from)
    .some(({ operation, event }) => operation === "publish" && event?.pubkey === author);
}

describe("its deletion stands on a majority of the relays before it is done", () => {
  it("makes the card held blank only once a majority of the relays took its deletion", async () => {
    const from = nostr.calls.length;
    const release = nostr.holdPublishes();
    const deleting = deleteCard(cardId, { inHand: { messages: MESSAGES } });
    // The card held, shown to be this one: its deletion on its way, its keys as they were.
    await until(() => stateSent(from));
    expect(card.keyVersions).toEqual([1, 1, 1, 1, 1]);
    expect(knownCardState(TEST_WALLET_ID, cardId)?.status).toBe("active");
    release();
    await expect(deleting).resolves.toMatchObject({ state: { status: "deleted" } });
    expect(card.keyVersions).toEqual([0, 0, 0, 0, 0]);
  });

  it("keeps a deletion no majority of the relays took on this phone, then ends it", async () => {
    const first = { cardId, walletGeneration: 1 };
    await bookOnRelays(first);
    // All relays but one take nothing more: the one that took it makes it apply, sooner or later,
    // over the card in service.
    for (const url of currentRelays().slice(1)) nostr.readOnly.add(url);
    await expect(deleteCard(cardId, { inHand: { messages: MESSAGES } })).rejects.toMatchObject({
      reason: "deletionPending"
    });
    expect(await relaysHolding("deleted")).toBe(1);
    expect((await relaysCopy())?.status).toBe("deleted");
    // Not made blank (that needs a majority first), but deleted on this phone: it pays nothing.
    expect(card.keyVersions).toEqual([1, 1, 1, 1, 1]);
    expect(knownCardState(TEST_WALLET_ID, cardId)).toMatchObject({
      status: "deleted",
      walletGeneration: 1
    });
    // Kept on the device, the app started again.
    resetCardStates();
    const { states: kept } = await withCardAccess((access) => refreshCardStates(access));
    expect(kept.find((state) => state.cardId === cardId)?.status).toBe("deleted");

    // The relays back: the next sync publishes it, for every device of the account.
    nostr.readOnly.clear();
    await withCardAccess((access) => refreshCardStates(access));
    expect(await relaysHolding("deleted")).toBeGreaterThanOrEqual(3);
    // Held again: "Try again" makes it blank, its data erased.
    await expect(deleteCard(cardId, { inHand: { messages: MESSAGES } })).resolves.toMatchObject({
      state: { status: "deleted" }
    });
    expect(card.keyVersions).toEqual([0, 0, 0, 0, 0]);
    // Its merchants erased: back to the mode of a card never set.
    const { books } = await withCardAccess((access) => refreshCardPayees(access));
    expect(payeesView(bookOf(books, first))).toEqual({ mode: "approved", approved: [] });
  });

  it("without the card, keeps it on this phone even when no relay took it, said pending", async () => {
    for (const url of currentRelays()) nostr.readOnly.add(url);
    await expect(deleteCard(cardId)).rejects.toMatchObject({ reason: "deletionPending" });
    expect(knownCardState(TEST_WALLET_ID, cardId)?.status).toBe("deleted");
    expect((await relaysCopy())?.status).toBe("active");
    nostr.readOnly.clear();
    await withCardAccess((access) => refreshCardStates(access));
    expect(await relaysHolding("deleted")).toBeGreaterThanOrEqual(3);
  });

  it("is never undone by a phone that programmed the card again without knowing of it", async () => {
    await bookOnRelays({ cardId, walletGeneration: 1 });
    await deleteCard(cardId, { inHand: { messages: MESSAGES } });
    // A phone that never read the deletion (an app of before, a race) programmed the card again,
    // at its next keys, for the same wallet: its record says so.
    const keys = deriveCardRecordKeys(root);
    const deleted = knownCardState(TEST_WALLET_ID, cardId)!;
    const stale: CardState = {
      ...deleted,
      status: "active",
      keyVersion: deleted.keyVersion + 1,
      name: "Everyday",
      settingsAt: deleted.settingsAt + 10,
      updatedAt: deleted.updatedAt + 10
    };
    await publishElsewhere(cardStateEvent(keys, stale), keys.nostr.secretKey);
    // The deletion stands: its wallet stays out of service, nothing of it read for the card again.
    const { states } = await withCardAccess((access) => refreshCardStates(access));
    expect(states.find((state) => state.cardId === cardId)).toMatchObject({
      status: "deleted",
      walletGeneration: 1
    });
    const { books } = await withCardAccess((access) => refreshCardPayees(access));
    expect(books.books.size).toBe(0);
    // Found again: added as a new card, its next wallet.
    const again = await pairCard({ relayHost: HOST, channelName: "P", messages: MESSAGES });
    expect(again.state).toMatchObject({ cardId, status: "active", walletGeneration: 2 });
  });

  it('is never undone by "Change relay" on a phone that showed the card before it', async () => {
    // Deleted without it on another device (the web app), while this phone still showed it.
    const keys = deriveCardRecordKeys(root);
    const shown = knownCardState(TEST_WALLET_ID, cardId)!;
    await publishElsewhere(
      cardStateEvent(keys, { ...shown, status: "deleted", updatedAt: shown.updatedAt + 10 }),
      keys.nostr.secretKey
    );
    const asked = nfc.calls.length;
    await expect(
      reprogramCard(cardId, { relayHost: HOST, messages: MESSAGES, channelName: "P" })
    ).rejects.toMatchObject({ reason: "cardGone" });
    // The card never asked for, nothing recorded but the deletion.
    expect(nfc.calls.slice(asked)).toEqual([]);
    expect(card.keyVersions).toEqual([1, 1, 1, 1, 1]);
    expect(knownCardState(TEST_WALLET_ID, cardId)?.status).toBe("deleted");
  });
});
