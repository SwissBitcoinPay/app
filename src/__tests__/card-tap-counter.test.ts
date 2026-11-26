import { hexToBytes } from "@noble/hashes/utils.js";

import { closeAccount } from "@/features/account/session";
import {
  TapAlreadySeenError,
  knownCardState,
  recordCardState,
  recordCardStateOnDevice,
  resetCardStates,
  withCardAccess
} from "@/features/card/states";
import type { CardState } from "@/lib/card/card-record";
import { cardIdOf } from "@/lib/card/keys";

import { TEST_WALLET_ID, openTestAccount } from "../../jest/account";
import type * as RelaysFake from "../../jest/nostr-relays";

/*
 * A tap's counter is recorded once (states.ts, checkTapCounter): the same tap checked twice against
 * the same state (a relay that sends it again under another session while the first is checked)
 * never passes twice, on the device's copy compared and written with nothing awaited in between.
 */

const nostr = jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");

const UID = "04000000000001";

function stateOf(cardId: string, fields: Partial<CardState> = {}): Omit<CardState, "updatedAt"> {
  return {
    cardId,
    uid: UID,
    keyVersion: 1,
    status: "active",
    relayHost: "relay.sattle.me",
    lastCounter: 10,
    depositedThrough: 1_010,
    maxPaymentSats: 20_000n,
    maxDaySats: 50_000n,
    maxPaymentsPerHour: 5,
    suspended: false,
    name: "",
    look: null,
    issuer: null,
    settingsAt: Date.now(),
    walletGeneration: 1,
    ...fields
  };
}

let cardId: string;

beforeEach(async () => {
  closeAccount();
  nostr.resetRelays();
  resetCardStates();
  await openTestAccount({ usage: "card", signUp: "done" });
  cardId = await withCardAccess(async (access) => {
    const id = cardIdOf(access.root, hexToBytes(UID));
    await recordCardState(access, stateOf(id));
    return id;
  });
});

afterEach(() => {
  closeAccount();
});

describe("a tap's counter, the account open (recordCardState)", () => {
  it("is recorded once: the same tap checked twice at once passes once", async () => {
    const results = await withCardAccess((access) =>
      Promise.allSettled([
        recordCardState(access, stateOf(cardId, { lastCounter: 11 }), undefined, { tap: true }),
        recordCardState(access, stateOf(cardId, { lastCounter: 11 }), undefined, { tap: true })
      ])
    );
    expect(results.map((result) => result.status).sort()).toEqual(["fulfilled", "rejected"]);
    const refused = results.find((result) => result.status === "rejected");
    expect((refused as PromiseRejectedResult).reason).toBeInstanceOf(TapAlreadySeenError);
    expect(knownCardState(TEST_WALLET_ID, cardId)?.lastCounter).toBe(11);
  });

  it("refuses a counter not above the one kept, or one of other keys, and writes nothing", async () => {
    await withCardAccess(async (access) => {
      for (const fields of [
        { lastCounter: 10 },
        { lastCounter: 9 },
        { lastCounter: 12, keyVersion: 2 },
        { lastCounter: 12, walletGeneration: 2 }
      ]) {
        const onSaved = jest.fn();
        await expect(
          recordCardState(access, stateOf(cardId, fields), undefined, { tap: true, onSaved })
        ).rejects.toBeInstanceOf(TapAlreadySeenError);
        expect(onSaved).not.toHaveBeenCalled();
      }
      expect(knownCardState(TEST_WALLET_ID, cardId)).toMatchObject({
        lastCounter: 10,
        keyVersion: 1,
        walletGeneration: 1
      });
      // The next tap: kept, then told.
      const onSaved = jest.fn();
      await recordCardState(access, stateOf(cardId, { lastCounter: 12 }), undefined, {
        tap: true,
        onSaved
      });
      expect(onSaved).toHaveBeenCalledTimes(1);
    });
    expect(knownCardState(TEST_WALLET_ID, cardId)?.lastCounter).toBe(12);
  });

  it("leaves any other write as it merges: a counter never goes down, never refused", async () => {
    await withCardAccess((access) =>
      recordCardState(access, stateOf(cardId, { lastCounter: 3, name: "Card" }))
    );
    expect(knownCardState(TEST_WALLET_ID, cardId)).toMatchObject({ lastCounter: 10 });
  });
});

describe("a tap's counter, the account closed (recordCardStateOnDevice)", () => {
  it("is recorded once: the same tap checked twice at once passes once", async () => {
    closeAccount();
    const results = await Promise.allSettled([
      recordCardStateOnDevice(TEST_WALLET_ID, stateOf(cardId, { lastCounter: 11 }), undefined, {
        tap: true
      }),
      recordCardStateOnDevice(TEST_WALLET_ID, stateOf(cardId, { lastCounter: 11 }), undefined, {
        tap: true
      })
    ]);
    expect(results.map((result) => result.status).sort()).toEqual(["fulfilled", "rejected"]);
    const refused = results.find((result) => result.status === "rejected");
    expect((refused as PromiseRejectedResult).reason).toBeInstanceOf(TapAlreadySeenError);
    expect(knownCardState(TEST_WALLET_ID, cardId)?.lastCounter).toBe(11);
  });

  it("refuses a counter not above the one kept, or one of other keys", async () => {
    closeAccount();
    for (const fields of [{ lastCounter: 10 }, { lastCounter: 12, keyVersion: 2 }]) {
      await expect(
        recordCardStateOnDevice(TEST_WALLET_ID, stateOf(cardId, fields), undefined, { tap: true })
      ).rejects.toBeInstanceOf(TapAlreadySeenError);
    }
    expect(knownCardState(TEST_WALLET_ID, cardId)?.lastCounter).toBe(10);
    await recordCardStateOnDevice(TEST_WALLET_ID, stateOf(cardId, { lastCounter: 11 }), undefined, {
      tap: true
    });
    expect(knownCardState(TEST_WALLET_ID, cardId)?.lastCounter).toBe(11);
  });
});
