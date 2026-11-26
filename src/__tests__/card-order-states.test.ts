import { hexToBytes } from "@noble/hashes/utils.js";

import { closeAccount } from "@/features/account/session";
import {
  CardOrderUnsavedError,
  knownCardOrder,
  recordCardState,
  refreshCardStates,
  resetCardStates,
  saveCardOrder,
  subscribeCardStates,
  withCardAccess
} from "@/features/card/states";
import {
  CARD_ORDER_VERSION,
  cardOrderAddress,
  cardOrderEvent,
  cardOrderFilter,
  cardOrderOf
} from "@/lib/card/card-order";
import { cardStatesFilter, cardStatesOf } from "@/lib/card/card-record";
import { cardIdOf } from "@/lib/card/keys";
import { publishToRelays, queryRelays } from "@/lib/nostr/pool";
import { sealRecord } from "@/lib/nostr/record";
import { currentRelays } from "@/lib/relays/current";

import { TEST_WALLET_ID, openTestAccount } from "../../jest/account";
import type * as RelaysFake from "../../jest/nostr-relays";

const nostr = jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");

/** A card in service of the account, as its pairing records it; resolves with its id. */
async function activeCard(uid: string): Promise<string> {
  return withCardAccess(async (access) => {
    const cardId = cardIdOf(access.root, hexToBytes(uid));
    await recordCardState(access, {
      cardId,
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
    return cardId;
  });
}

const wallet = (cardId: string) => ({ cardId, walletGeneration: 1 });

/** What a majority of the relays hold at the order's address, read as another device would. */
async function onRelays() {
  return withCardAccess(async ({ keys }) =>
    cardOrderOf(
      keys,
      await queryRelays(cardOrderFilter(keys), {
        relays: currentRelays(),
        channel: "account",
        timeoutMs: 1_000
      })
    )
  );
}

let first: string;
let second: string;
let third: string;

beforeEach(async () => {
  closeAccount();
  nostr.resetRelays();
  resetCardStates();
  await openTestAccount({ usage: "card", signUp: "done" });
  first = await activeCard("04000000000001");
  second = await activeCard("04000000000002");
  third = await activeCard("04000000000003");
});

describe("the cards' order", () => {
  it("is saved on a majority of the relays, then read with the cards on another device", async () => {
    const listener = jest.fn();
    const unsubscribe = subscribeCardStates(listener);
    const saved = await withCardAccess((access) =>
      saveCardOrder(access, [wallet(third), wallet(first), wallet(second)], 1_800_000_000)
    );
    unsubscribe();
    expect(saved).toEqual({
      cards: [wallet(third), wallet(first), wallet(second)],
      updatedAt: 1_800_000_000
    });
    expect(knownCardOrder(TEST_WALLET_ID)).toEqual(saved);
    expect(knownCardOrder("another wallet")).toBeNull();
    expect(listener).toHaveBeenCalled();
    expect((await onRelays()).order).toEqual(saved);

    // Another device: nothing known, read from the relays with the cards.
    resetCardStates();
    expect(knownCardOrder(TEST_WALLET_ID)).toBeNull();
    const read = await withCardAccess(refreshCardStates);
    expect(read.order).toEqual(saved);
    expect(read.states.map(({ cardId }) => cardId).sort()).toEqual([first, second, third].sort());
    expect(knownCardOrder(TEST_WALLET_ID)).toEqual(saved);
  });

  it("goes with the cards' records, which still read their cards only", async () => {
    await withCardAccess((access) => saveCardOrder(access, [wallet(second)], 1_800_000_000));
    await withCardAccess(async ({ keys, root }) => {
      const answers = await queryRelays(cardStatesFilter(keys), {
        relays: currentRelays(),
        channel: "account",
        timeoutMs: 1_000
      });
      expect(cardOrderOf(keys, answers).order?.cards).toEqual([wallet(second)]);
      const read = cardStatesOf(keys, root, answers);
      expect(read.states.size).toBe(3);
      expect(read.newer.size).toBe(0);
    });
  });

  it("is dated after another device's newer copy, which it replaces", async () => {
    await withCardAccess(async ({ keys }) => {
      await publishToRelays(
        cardOrderEvent(keys, { cards: [wallet(first)], updatedAt: 1_900_000_000 }),
        {
          relays: currentRelays(),
          channel: "account",
          timeoutMs: 1_000,
          authKey: keys.nostr.secretKey
        }
      );
    });
    const saved = await withCardAccess((access) =>
      saveCardOrder(access, [wallet(second), wallet(first)], 1_800_000_000)
    );
    expect(saved.updatedAt).toBe(1_900_000_001);
    expect((await onRelays()).order).toEqual(saved);
    // Saved again at once: still after its own copy.
    const again = await withCardAccess((access) =>
      saveCardOrder(access, [wallet(first)], 1_800_000_000)
    );
    expect(again.updatedAt).toBe(1_900_000_002);
  });

  it("read with the cards gives way to another device's later choice", async () => {
    await withCardAccess((access) => saveCardOrder(access, [wallet(first)], 1_800_000_000));
    await withCardAccess(async ({ keys }) => {
      await publishToRelays(
        cardOrderEvent(keys, { cards: [wallet(third)], updatedAt: 1_800_000_100 }),
        {
          relays: currentRelays(),
          channel: "account",
          timeoutMs: 1_000,
          authKey: keys.nostr.secretKey
        }
      );
    });
    const read = await withCardAccess(refreshCardStates);
    expect(read.order?.cards).toEqual([wallet(third)]);
  });

  it("is never written over when a relay holds it in a newer format", async () => {
    await withCardAccess(async ({ keys }) => {
      await publishToRelays(
        sealRecord({
          type: "card-order",
          value: { version: CARD_ORDER_VERSION + 1 },
          signer: keys.nostr.secretKey,
          encryptionKey: keys.encryptionKey,
          address: cardOrderAddress(keys),
          createdAt: 1_700_000_000,
          block: 512
        }),
        {
          relays: currentRelays(),
          channel: "account",
          timeoutMs: 1_000,
          authKey: keys.nostr.secretKey
        }
      );
    });
    await expect(
      withCardAccess((access) => saveCardOrder(access, [wallet(first)], 1_800_000_000))
    ).rejects.toMatchObject({ name: "NewerRecordError" });
    const relays = await onRelays();
    expect(relays.newer).toBe(true);
    expect(relays.order).toBeNull();
    expect(knownCardOrder(TEST_WALLET_ID)).toBeNull();
    // Known since: refused at once, without asking the relays again.
    await expect(
      withCardAccess((access) => saveCardOrder(access, [wallet(first)], 1_800_000_000))
    ).rejects.toMatchObject({ name: "NewerRecordError" });
  });

  it("is not saved when no majority of the relays answers, nor when none takes it", async () => {
    const relays = currentRelays();
    for (const relay of relays.slice(0, Math.ceil(relays.length / 2))) nostr.unreachable.add(relay);
    await expect(
      withCardAccess((access) => saveCardOrder(access, [wallet(first)], 1_800_000_000))
    ).rejects.toBeInstanceOf(CardOrderUnsavedError);
    nostr.unreachable.clear();

    for (const relay of relays) nostr.readOnly.add(relay);
    await expect(
      withCardAccess((access) => saveCardOrder(access, [wallet(first)], 1_800_000_000))
    ).rejects.toBeInstanceOf(CardOrderUnsavedError);
    nostr.readOnly.clear();

    expect(knownCardOrder(TEST_WALLET_ID)).toBeNull();
    expect((await onRelays()).order).toBeNull();
  });
});
