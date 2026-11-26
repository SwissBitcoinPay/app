import { closeAccount, OtherAccountError, updateAccount } from "@/features/account/session";
import { chooseCardPayeeMode, removeApprovedPayee } from "@/features/card/payee-mode";
import { syncCardPayees } from "@/features/card/payees-sync";
import { withCardAccess } from "@/features/card/states";
import { RecoveryCheckOverdueError } from "@/features/recovery-check/overdue";
import { PasskeyError } from "@/lib/breez/errors";
import { signInWithPasskey } from "@/lib/breez/passkey";
import { derivePayeeRecordKeys, payeeModeEvent } from "@/lib/card/payee-records";
import {
  LooserCardPayeeModeError,
  approveCardPayee,
  loadCardPayees,
  setCardPayeeMode
} from "@/lib/card/payees";
import { nowUnix } from "@/lib/clock";
import { publishToRelays } from "@/lib/nostr/pool";
import { currentRelays } from "@/lib/relays/current";

import { OTHER_TEST_MNEMONIC, TEST_WALLET_ID, openTestAccount, testSeed } from "../../jest/account";
import type * as FileSystemFake from "../../jest/expo-file-system";
import type * as RelaysFake from "../../jest/nostr-relays";

/*
 * "Payments without confirmation": any change of a card's mode, stricter or looser, only with the
 * open account's passkey, as a change of a limit, and so is an approved merchant's removal. Below
 * the holder's screen, the books still refuse a looser mode without it.
 */

jest.mock("../lib/breez/passkey", () => ({
  createPasskeyWallet: jest.fn(),
  preparePasskeys: jest.fn(async () => undefined),
  passkeysReady: jest.fn(() => true),
  signInWithPasskey: jest.fn()
}));

const fileSystem = jest.requireMock<typeof FileSystemFake>("expo-file-system");
const nostr = jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");
const signIn = jest.mocked(signInWithPasskey);
/** The card's wallet whose mode the tests choose (its first). */
const CARD = { cardId: "30c19d9bfae333c1cb42a5ce6e20debb", walletGeneration: 1 };

beforeEach(async () => {
  fileSystem.resetFileSystem();
  nostr.resetRelays();
  signIn.mockReset().mockResolvedValue({ seed: testSeed(), credentialId: null });
  await openTestAccount({ usage: "card", signUp: "card" });
});

afterEach(() => closeAccount());

describe("a card's mode, chosen by its holder", () => {
  it("is stricter only once the account's passkey confirms it, as it is looser", async () => {
    await expect(chooseCardPayeeMode(TEST_WALLET_ID, CARD, "confirm")).resolves.toMatchObject({
      mode: "confirm"
    });
    expect(signIn).toHaveBeenCalledTimes(1);
    await expect(chooseCardPayeeMode(TEST_WALLET_ID, CARD, "approved")).resolves.toMatchObject({
      mode: "approved"
    });
    await expect(chooseCardPayeeMode(TEST_WALLET_ID, CARD, "automatic")).resolves.toMatchObject({
      mode: "automatic"
    });
    expect(signIn).toHaveBeenCalledTimes(3);
  });

  it("stays as it was when the prompt is dismissed, or the passkey is another account's", async () => {
    signIn.mockRejectedValueOnce(new PasskeyError("cancelled", "Dismissed"));
    await expect(chooseCardPayeeMode(TEST_WALLET_ID, CARD, "confirm")).rejects.toBeInstanceOf(
      PasskeyError
    );
    signIn.mockResolvedValueOnce({ seed: testSeed(OTHER_TEST_MNEMONIC), credentialId: null });
    await expect(chooseCardPayeeMode(TEST_WALLET_ID, CARD, "automatic")).rejects.toBeInstanceOf(
      OtherAccountError
    );
    expect((await loadCardPayees(TEST_WALLET_ID, CARD)).mode).toBe("approved");
  });

  it("asks the passkey before it asks the relays anything", async () => {
    const asked = nostr.calls.length;
    signIn.mockRejectedValueOnce(new PasskeyError("cancelled", "Dismissed"));
    await expect(chooseCardPayeeMode(TEST_WALLET_ID, CARD, "confirm")).rejects.toBeInstanceOf(
      PasskeyError
    );
    expect(nostr.calls).toHaveLength(asked);
  });

  it("wins over the mode another device chose before, read from the relays or not", async () => {
    // The web app chose "Always confirm" a minute ago; this phone has not read it.
    const event = await withCardAccess(async ({ root }) => {
      const keys = derivePayeeRecordKeys(root);
      const at = Date.now() - 60_000;
      return {
        keys,
        event: payeeModeEvent(keys, {
          ...CARD,
          mode: "confirm",
          modeAt: at,
          updatedAt: Math.floor(at / 1000)
        })
      };
    });
    await publishToRelays(event.event, {
      relays: currentRelays(),
      channel: "account",
      timeoutMs: 1000,
      authKey: event.keys.nostr.secretKey
    });
    await expect(chooseCardPayeeMode(TEST_WALLET_ID, CARD, "automatic")).resolves.toMatchObject({
      mode: "automatic"
    });
    expect(signIn).toHaveBeenCalledTimes(1);
    // Merged with the relays' (payee-book.ts): the latest choice wins on every device.
    await syncCardPayees({ fresh: true });
    expect((await loadCardPayees(TEST_WALLET_ID, CARD)).mode).toBe("automatic");
  });

  it("is chosen with the passkey while the relays do not answer, kept on the device", async () => {
    await setCardPayeeMode(TEST_WALLET_ID, CARD, "automatic", { passkeyConfirmed: true });
    for (const url of currentRelays()) nostr.unreachable.add(url);
    await expect(chooseCardPayeeMode(TEST_WALLET_ID, CARD, "confirm")).resolves.toMatchObject({
      mode: "confirm"
    });
    expect(signIn).toHaveBeenCalledTimes(1);
    expect((await loadCardPayees(TEST_WALLET_ID, CARD)).mode).toBe("confirm");
  });

  it("is never changed with the account closed meanwhile", async () => {
    signIn.mockImplementationOnce(async () => {
      closeAccount();
      return { seed: testSeed(), credentialId: null };
    });
    await expect(chooseCardPayeeMode(TEST_WALLET_ID, CARD, "confirm")).rejects.toThrow();
    expect((await loadCardPayees(TEST_WALLET_ID, CARD)).mode).toBe("approved");
  });

  it("is still never looser below the holder's screen without the passkey", async () => {
    await setCardPayeeMode(TEST_WALLET_ID, CARD, "confirm");
    await expect(setCardPayeeMode(TEST_WALLET_ID, CARD, "approved")).rejects.toBeInstanceOf(
      LooserCardPayeeModeError
    );
    expect((await loadCardPayees(TEST_WALLET_ID, CARD)).mode).toBe("confirm");
  });
});

describe("an approved merchant, removed by the card's holder", () => {
  const MERCHANT = { id: "sattleme01@breez.tips", name: "Lakeside Bakery" };

  beforeEach(async () => {
    await approveCardPayee(TEST_WALLET_ID, CARD, MERCHANT, Date.now() - 60_000);
  });

  it("is removed only once the account's passkey confirms it", async () => {
    await expect(removeApprovedPayee(TEST_WALLET_ID, CARD, MERCHANT.id)).resolves.toMatchObject({
      approved: []
    });
    expect(signIn).toHaveBeenCalledTimes(1);
    expect((await loadCardPayees(TEST_WALLET_ID, CARD)).approved).toEqual([]);
  });

  it("stays approved when the prompt is dismissed, or the passkey is another account's", async () => {
    signIn.mockRejectedValueOnce(new PasskeyError("cancelled", "Dismissed"));
    await expect(removeApprovedPayee(TEST_WALLET_ID, CARD, MERCHANT.id)).rejects.toBeInstanceOf(
      PasskeyError
    );
    signIn.mockResolvedValueOnce({ seed: testSeed(OTHER_TEST_MNEMONIC), credentialId: null });
    await expect(removeApprovedPayee(TEST_WALLET_ID, CARD, MERCHANT.id)).rejects.toBeInstanceOf(
      OtherAccountError
    );
    expect((await loadCardPayees(TEST_WALLET_ID, CARD)).approved).toMatchObject([
      { id: MERCHANT.id }
    ]);
  });

  it("stays approved with the account closed meanwhile", async () => {
    signIn.mockImplementationOnce(async () => {
      closeAccount();
      return { seed: testSeed(), credentialId: null };
    });
    await expect(removeApprovedPayee(TEST_WALLET_ID, CARD, MERCHANT.id)).rejects.toThrow();
    expect((await loadCardPayees(TEST_WALLET_ID, CARD)).approved).toMatchObject([
      { id: MERCHANT.id }
    ]);
  });
});

describe("a card's mode past the check of the 12 words", () => {
  beforeEach(async () => {
    // The check started 31 days ago, the words never typed back.
    await updateAccount({
      recoveryCheck: { verifiedAt: null, dueSince: nowUnix() - 31 * 86_400 }
    });
  });

  it("is stricter still, once the account's passkey confirms it", async () => {
    await expect(chooseCardPayeeMode(TEST_WALLET_ID, CARD, "confirm")).resolves.toMatchObject({
      mode: "confirm"
    });
    expect(signIn).toHaveBeenCalledTimes(1);
  });

  it("is never looser, the passkey confirming it or not: nothing changed", async () => {
    await expect(chooseCardPayeeMode(TEST_WALLET_ID, CARD, "automatic")).rejects.toBeInstanceOf(
      RecoveryCheckOverdueError
    );
    expect((await loadCardPayees(TEST_WALLET_ID, CARD)).mode).toBe("approved");
  });
});
