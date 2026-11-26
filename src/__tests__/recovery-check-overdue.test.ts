import "@/i18n";

import { t } from "i18next";

import { closeAccount, updateAccount } from "@/features/account/session";
import { toUnlockFailure, unlockFailureMessage } from "@/features/account/usePasskeyAccount";
import { confirmAccountPasskey } from "@/features/account/wallet-access";
import {
  RecoveryCheckOverdueError,
  refuseOverduePaymentOf
} from "@/features/recovery-check/overdue";
import { RECOVERY_CHECK_WINDOW } from "@/features/recovery-check/policy";
import { signInWithPasskey } from "@/lib/breez/passkey";
import { nowUnix } from "@/lib/clock";

import { TEST_WALLET_ID, openMerchantAccount, testSeed } from "../../jest/account";
import type * as FileSystemFake from "../../jest/expo-file-system";
import type * as RelaysFake from "../../jest/nostr-relays";

/*
 * Past the 30 days of the check of the 12 words, every payment
 * that asks the passkey is refused before the passkey is asked, and so is approving a merchant a
 * card pays without asking; what makes a card safer is not (card-limit-change.test.ts,
 * card-payee-mode.test.ts: no raise, no looser mode).
 */

jest.mock("../lib/breez/passkey", () => ({
  createPasskeyWallet: jest.fn(),
  preparePasskeys: jest.fn(async () => undefined),
  passkeysReady: jest.fn(() => true),
  signInWithPasskey: jest.fn()
}));

const fileSystem = jest.requireMock<typeof FileSystemFake>("expo-file-system");
const relays = jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");
const signIn = jest.mocked(signInWithPasskey);

/** A check that started `days` days ago, never done. */
function dueFor(days: number) {
  return { recoveryCheck: { verifiedAt: null, dueSince: nowUnix() - days * 86_400 } };
}

beforeEach(async () => {
  fileSystem.resetFileSystem();
  relays.resetRelays();
  closeAccount();
  signIn.mockReset().mockResolvedValue({ seed: testSeed(), credentialId: null });
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
  await openMerchantAccount();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("a payment past the check's 30 days", () => {
  it("is refused before the passkey is asked, saying why", async () => {
    await updateAccount(dueFor(30));

    const error = await confirmAccountPasskey({ accountWallet: false }).catch(
      (thrown: unknown) => thrown
    );

    expect(error).toBeInstanceOf(RecoveryCheckOverdueError);
    expect(signIn).not.toHaveBeenCalled();
    expect(toUnlockFailure(error)).toBe("recoveryOverdue");
    expect(unlockFailureMessage("recoveryOverdue", t)).toMatch(/Your payments are blocked/);
  });

  it("asks the passkey as always within the 30 days, and once the words are checked", async () => {
    await updateAccount(dueFor(29));
    await expect(confirmAccountPasskey({ accountWallet: false })).resolves.toBeUndefined();
    expect(signIn).toHaveBeenCalledTimes(1);

    await updateAccount({ recoveryCheck: { verifiedAt: nowUnix(), dueSince: null } });
    await expect(confirmAccountPasskey({ accountWallet: false })).resolves.toBeUndefined();
    expect(signIn).toHaveBeenCalledTimes(2);
  });

  it("never refuses, by itself, what may make a card safer (a limit lowered, a stricter mode)", async () => {
    await updateAccount(dueFor(45));

    await expect(
      confirmAccountPasskey({ accountWallet: false, payment: false })
    ).resolves.toBeUndefined();
    expect(signIn).toHaveBeenCalledTimes(1);
  });

  it("is refused for a card's payment with the app locked, from this device's settings", async () => {
    await updateAccount(dueFor(RECOVERY_CHECK_WINDOW / 86_400));
    closeAccount();

    await expect(refuseOverduePaymentOf(TEST_WALLET_ID)).rejects.toBeInstanceOf(
      RecoveryCheckOverdueError
    );
  });

  it("is not refused for an account whose check is not overdue, nor one this device lacks", async () => {
    await updateAccount(dueFor(3));
    closeAccount();

    await expect(refuseOverduePaymentOf(TEST_WALLET_ID)).resolves.toBeUndefined();
    await expect(refuseOverduePaymentOf(`03${"ab".repeat(32)}`)).resolves.toBeUndefined();
  });
});
