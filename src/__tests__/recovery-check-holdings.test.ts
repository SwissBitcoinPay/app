import { waitFor } from "@testing-library/react-native";

import { detectSignUpLocation } from "@/features/account/detection";
import * as session from "@/features/account/session";
import {
  closeAccount,
  getAccountSettings,
  openAccount,
  updateAccount
} from "@/features/account/session";
import {
  noteCardHeld,
  noteWalletKept,
  resetRecoveryHoldings,
  walletKept
} from "@/features/recovery-check/holdings";
import { RECOVERY_CHECK_INTERVAL } from "@/features/recovery-check/policy";
import { nowUnix } from "@/lib/clock";

import {
  OTHER_TEST_MNEMONIC,
  TEST_WALLET_ID,
  openCardHolderAccount,
  openMerchantAccount,
  openTestAccount,
  testSeed
} from "../../jest/account";
import { coingecko, setCoingeckoPrice } from "../../jest/coingecko";
import type * as FileSystemFake from "../../jest/expo-file-system";
import type * as RelaysFake from "../../jest/nostr-relays";

/*
 * What the account keeps, as its screens read it (holdings.ts): once it keeps more than 1000 CHF,
 * the check of its 12 words starts, saved with its settings.
 */

const fileSystem = jest.requireMock<typeof FileSystemFake>("expo-file-system");
const relays = jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");

/** Another wallet's id: the public key of the private key 3. */
const OTHER_WALLET = "02f9308a019258c31049344f85f89d5229b531c845836f99b08601f113bce036f9";

/** 1000 CHF at 50 000 CHF a bitcoin: 2 000 000 sats. */
const THRESHOLD = 2_000_000n;
const CARD = { cardId: "30c19d9bfae333c1cb42a5ce6e20debb", walletGeneration: 1 };
const OTHER_CARD = { cardId: "0123456789abcdef0123456789abcdef", walletGeneration: 1 };

/** Lets the evaluations started by the notes run to their end. */
async function settle() {
  for (let i = 0; i < 30; i++) await new Promise((resolve) => setTimeout(resolve, 0));
}

function check() {
  return getAccountSettings()?.recoveryCheck;
}

beforeEach(() => {
  fileSystem.resetFileSystem();
  relays.resetRelays();
  closeAccount();
  resetRecoveryHoldings();
  const hour = Math.floor(Date.now() / 1000 / 3600) * 3600;
  for (let at = hour - 3 * 3600; at <= hour + 3 * 3600; at += 3600) {
    setCoingeckoPrice("CHF", at, 50_000);
  }
  // The account's backup finds no relay of a test that wrote none: said in development only.
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("what the account's wallet keeps", () => {
  it("is its balance less the split's share still to sell", () => {
    expect(walletKept(5_000n, 100, null)).toBe(5_000n);
    expect(walletKept(5_000n, 70, 900n)).toBe(4_100n);
    expect(walletKept(5_000n, 70, 0n)).toBe(5_000n);
    // A share to sell above the balance (sent away meanwhile): nothing kept, never less.
    expect(walletKept(500n, 70, 900n)).toBe(0n);
    // The share unknown: the share kept in bitcoin of the balance, rounded down.
    expect(walletKept(5_001n, 70, null)).toBe(3_500n);
  });
});

describe("a check starting", () => {
  it("starts once the wallet keeps 1000 CHF", async () => {
    await openMerchantAccount();

    noteWalletKept(THRESHOLD - 1n);
    await settle();
    expect(check()).toEqual({ verifiedAt: null, dueSince: null });

    const before = nowUnix();
    noteWalletKept(THRESHOLD);
    await waitFor(() => expect(check()?.dueSince).not.toBeNull());
    expect(check()!.dueSince!).toBeGreaterThanOrEqual(before);
    expect(check()!.verifiedAt).toBeNull();
  });

  it("counts the cards' wallets with the account's", async () => {
    await openMerchantAccount();

    noteWalletKept(THRESHOLD / 2n);
    noteCardHeld(CARD, THRESHOLD / 4n);
    await settle();
    expect(check()?.dueSince).toBeNull();

    // The same card read again: counted once.
    noteCardHeld(CARD, THRESHOLD / 4n);
    await settle();
    expect(check()?.dueSince).toBeNull();

    noteCardHeld(OTHER_CARD, THRESHOLD / 4n);
    await waitFor(() => expect(check()?.dueSince).not.toBeNull());
  });

  it("starts for a card holder's account, from its cards alone", async () => {
    await openCardHolderAccount();

    noteCardHeld(CARD, THRESHOLD);

    await waitFor(() => expect(check()?.dueSince).not.toBeNull());
  });

  it("starts nothing without a rate: nothing is proven", async () => {
    coingecko.down = true;
    await openMerchantAccount();

    noteWalletKept(THRESHOLD * 10n);
    await settle();

    expect(check()?.dueSince).toBeNull();
  });

  it("starts nothing within a year of the last check, then starts again", async () => {
    await openMerchantAccount();
    const now = nowUnix();
    await updateAccount({ recoveryCheck: { verifiedAt: now - 10, dueSince: null } });

    noteWalletKept(THRESHOLD);
    // Nothing due: the account marked only (its invitation a year after the check).
    await waitFor(() =>
      expect(check()).toEqual({
        verifiedAt: now - 10,
        dueSince: null,
        aboveThresholdAt: expect.any(Number)
      })
    );

    await updateAccount({
      recoveryCheck: { verifiedAt: now - RECOVERY_CHECK_INTERVAL, dueSince: null }
    });
    noteWalletKept(THRESHOLD + 1n);
    await waitFor(() => expect(check()?.dueSince).not.toBeNull());
    expect(check()?.verifiedAt).toBe(now - RECOVERY_CHECK_INTERVAL);
  });

  it("writes nothing before the relays' answer at the opening was handled", async () => {
    await openMerchantAccount();
    // The backup of another device (a check done there) still being read.
    let synced = () => undefined as void;
    jest
      .spyOn(session, "whenAccountSynced")
      .mockReturnValue(new Promise<void>((resolve) => (synced = resolve)));

    noteWalletKept(THRESHOLD);
    await settle();
    expect(check()).toEqual({ verifiedAt: null, dueSince: null });

    synced();
    await waitFor(() => expect(check()?.dueSince).not.toBeNull());
  });

  it("never moves a check due already", async () => {
    await openMerchantAccount();
    const dueSince = nowUnix() - 5 * 86_400;
    await updateAccount({ recoveryCheck: { verifiedAt: null, dueSince } });

    noteWalletKept(THRESHOLD * 2n);
    await waitFor(() => expect(check()?.aboveThresholdAt).toBeGreaterThan(dueSince));

    expect(check()?.dueSince).toBe(dueSince);
  });

  it("never marks an account kept under the threshold", async () => {
    await openMerchantAccount();
    const now = nowUnix();
    await updateAccount({ recoveryCheck: { verifiedAt: now - 10, dueSince: null } });

    noteWalletKept(THRESHOLD - 1n);
    await settle();

    expect(check()).toEqual({ verifiedAt: now - 10, dueSince: null });
  });

  it("starts nothing during the sign-up", async () => {
    await openTestAccount();

    noteWalletKept(THRESHOLD * 2n);
    await settle();

    expect(check()?.dueSince).toBeNull();
  });

  it("starts nothing for an account opened with its words", async () => {
    await openMerchantAccount();
    const { recoveryCheck } = getAccountSettings()!;
    closeAccount();
    await openAccount({
      seed: testSeed(),
      openedBy: "words",
      walletId: TEST_WALLET_ID,
      created: false,
      detect: () => Promise.reject(new Error("No sign-up expected")),
      businessNameWord: "Merchant"
    });

    noteWalletKept(THRESHOLD * 2n);
    await settle();

    expect(check()).toEqual(recoveryCheck);
  });

  it("forgets what another account kept", async () => {
    await openMerchantAccount();
    noteCardHeld(CARD, THRESHOLD - 1n);
    await settle();
    closeAccount();
    // Another account on the same device (the wallet of other words).
    await openAccount({
      seed: testSeed(OTHER_TEST_MNEMONIC),
      walletId: OTHER_WALLET,
      created: true,
      detect: () => detectSignUpLocation(),
      businessNameWord: "Merchant"
    });
    await updateAccount({ signUp: "done", usage: "merchant" });

    // The first account's card does not count for this one.
    noteWalletKept(1n);
    await settle();

    expect(check()?.dueSince).toBeNull();
  });
});
