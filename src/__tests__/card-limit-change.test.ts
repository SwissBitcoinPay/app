import { hexToBytes } from "@noble/hashes/utils.js";

import { closeAccount, OtherAccountError, updateAccount } from "@/features/account/session";
import { changeCardLimit, RaisedLimitError, setCardLimit } from "@/features/card/manage";
import {
  knownCardState,
  recordCardState,
  refreshCardStates,
  resetCardStates,
  withCardAccess
} from "@/features/card/states";
import { RecoveryCheckOverdueError } from "@/features/recovery-check/overdue";
import { PasskeyError } from "@/lib/breez/errors";
import { signInWithPasskey } from "@/lib/breez/passkey";
import { cardIdOf } from "@/lib/card/keys";
import { nowUnix } from "@/lib/clock";

import { OTHER_TEST_MNEMONIC, TEST_WALLET_ID, openTestAccount, testSeed } from "../../jest/account";
import type * as RelaysFake from "../../jest/nostr-relays";

/*
 * "Limits": the holder changes a card's limit, raised or lowered, only once the open account's
 * passkey confirms it. Below the holder's screen, setCardLimit still refuses a raise without it:
 * card-manage.test.ts.
 */

jest.mock("../lib/breez/passkey", () => ({
  createPasskeyWallet: jest.fn(),
  preparePasskeys: jest.fn(async () => undefined),
  passkeysReady: jest.fn(() => true),
  signInWithPasskey: jest.fn()
}));

const nostr = jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");
const signIn = jest.mocked(signInWithPasskey);

let cardId: string;

/** A card in service of the account, at the limits a pairing gives it. */
async function activeCard(): Promise<string> {
  const uid = "04a1b2c3d4e5f6";
  return withCardAccess(async (access) => {
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
}

/** The card's limits as a majority of the relays give them, the device's copy forgotten first. */
async function onRelays() {
  resetCardStates();
  const { states, conclusive } = await withCardAccess(refreshCardStates);
  expect(conclusive).toBe(true);
  const state = states.find((each) => each.cardId === cardId);
  return {
    maxPaymentSats: state?.maxPaymentSats,
    maxDaySats: state?.maxDaySats,
    maxPaymentsPerHour: state?.maxPaymentsPerHour
  };
}

beforeEach(async () => {
  closeAccount();
  nostr.resetRelays();
  resetCardStates();
  signIn.mockReset().mockResolvedValue({ seed: testSeed(), credentialId: null });
  await openTestAccount({ usage: "card", signUp: "card" });
  cardId = await activeCard();
});

afterEach(() => closeAccount());

describe("a card's limit, changed by its holder", () => {
  it("is lowered only once the account's passkey confirms it, as it is raised", async () => {
    await expect(changeCardLimit(cardId, "maxPaymentSats", 5_000n)).resolves.toMatchObject({
      maxPaymentSats: 5_000n
    });
    expect(signIn).toHaveBeenCalledTimes(1);
    await expect(changeCardLimit(cardId, "maxDaySats", 80_000n)).resolves.toMatchObject({
      maxDaySats: 80_000n
    });
    expect(signIn).toHaveBeenCalledTimes(2);
    await expect(changeCardLimit(cardId, "maxPaymentsPerHour", 2)).resolves.toMatchObject({
      maxPaymentsPerHour: 2
    });
    expect(signIn).toHaveBeenCalledTimes(3);
    expect(await onRelays()).toEqual({
      maxPaymentSats: 5_000n,
      maxDaySats: 80_000n,
      maxPaymentsPerHour: 2
    });
  });

  it("stays as it was when the prompt is dismissed, or the passkey is another account's", async () => {
    signIn.mockRejectedValueOnce(new PasskeyError("cancelled", "Dismissed"));
    await expect(changeCardLimit(cardId, "maxPaymentSats", 5_000n)).rejects.toBeInstanceOf(
      PasskeyError
    );
    signIn.mockResolvedValueOnce({ seed: testSeed(OTHER_TEST_MNEMONIC), credentialId: null });
    await expect(changeCardLimit(cardId, "maxPaymentsPerHour", 1)).rejects.toBeInstanceOf(
      OtherAccountError
    );
    // Nothing written, here nor on the relays.
    expect(knownCardState(TEST_WALLET_ID, cardId)).toMatchObject({
      maxPaymentSats: 20_000n,
      maxPaymentsPerHour: 5
    });
    expect(await onRelays()).toEqual({
      maxPaymentSats: 20_000n,
      maxDaySats: 50_000n,
      maxPaymentsPerHour: 5
    });
  });

  it("asks the passkey before it asks the relays anything", async () => {
    const asked = nostr.calls.length;
    signIn.mockRejectedValueOnce(new PasskeyError("cancelled", "Dismissed"));
    await expect(changeCardLimit(cardId, "maxDaySats", 10_000n)).rejects.toBeInstanceOf(
      PasskeyError
    );
    expect(nostr.calls).toHaveLength(asked);
  });

  it("is never changed with the account closed meanwhile", async () => {
    signIn.mockImplementationOnce(async () => {
      closeAccount();
      return { seed: testSeed(), credentialId: null };
    });
    await expect(changeCardLimit(cardId, "maxPaymentSats", 5_000n)).rejects.toThrow();
    await openTestAccount({ usage: "card", signUp: "card" });
    expect((await onRelays()).maxPaymentSats).toBe(20_000n);
  });

  it("still cannot be raised below the holder's screen without the passkey", async () => {
    await expect(setCardLimit(cardId, "maxPaymentSats", 20_001n)).rejects.toBeInstanceOf(
      RaisedLimitError
    );
    expect(signIn).not.toHaveBeenCalled();
    expect((await onRelays()).maxPaymentSats).toBe(20_000n);
  });
});

describe("a card's limit past the check of the 12 words", () => {
  beforeEach(async () => {
    // The check started 31 days ago, the words never typed back.
    await updateAccount({
      recoveryCheck: { verifiedAt: null, dueSince: nowUnix() - 31 * 86_400 }
    });
  });

  it("is lowered still, once the account's passkey confirms it", async () => {
    await expect(changeCardLimit(cardId, "maxPaymentSats", 5_000n)).resolves.toMatchObject({
      maxPaymentSats: 5_000n
    });
    expect(signIn).toHaveBeenCalledTimes(1);
  });

  it("is never raised, the passkey confirming it or not: nothing written", async () => {
    await expect(changeCardLimit(cardId, "maxPaymentSats", 30_000n)).rejects.toBeInstanceOf(
      RecoveryCheckOverdueError
    );
    await expect(changeCardLimit(cardId, "maxPaymentsPerHour", 6)).rejects.toBeInstanceOf(
      RecoveryCheckOverdueError
    );
    expect(await onRelays()).toEqual({
      maxPaymentSats: 20_000n,
      maxDaySats: 50_000n,
      maxPaymentsPerHour: 5
    });
  });
});
