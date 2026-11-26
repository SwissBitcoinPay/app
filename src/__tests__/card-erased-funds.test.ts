import { act, renderHook, waitFor } from "@testing-library/react-native";

import { CARD_WALLET_CHECK_MS, DEFAULT_CARD_RELAY_HOST } from "@/config/card";
import { isAccountWalletOpen } from "@/features/account/wallet-access";
import { NothingToReturnError } from "@/features/card/card-wallet";
import {
  erasedWallets,
  readErasedFunds,
  resetWallets,
  returnErasedFunds
} from "@/features/card/erased-funds";
import * as erasedFundsModule from "@/features/card/erased-funds";
import { withCardAccess } from "@/features/card/states";
import { ERASED_FUNDS_READ_INTERVAL_MS, useErasedFunds } from "@/features/card/useErasedFunds";
import { lockTerminal } from "@/features/navigation/lock";
import * as fundsRecoverySync from "@/features/wallet/funds-recovery-sync";
import { PasskeyError } from "@/lib/breez/errors";
import { signInWithPasskey } from "@/lib/breez/passkey";
import { cardWallet } from "@/lib/breez/wallet";
import type { CardState } from "@/lib/card/card-record";
import type { CardWalletOf } from "@/lib/card/keys";

import { TEST_WALLET_ID, openMerchantAccount, testSeed } from "../../jest/account";
import type * as BreezFake from "../../jest/breez-sdk";

/*
 * The wallets no card shows any more (erased-funds.ts): a deleted card's, a
 * card's earlier ones once it was added again. What reaches one after the card's deletion (an
 * invoice paid before it expired, its Bitcoin address) is read there, and sent back to the
 * account's wallet after the passkey, as any "Withdraw".
 */

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { extra: { breezNetwork: "mainnet" } } }
}));
// The passkey prompt is the test's; the wallet layer is the real one, over the fake SDK.
jest.mock("../lib/breez/passkey", () => ({
  createPasskeyWallet: jest.fn(),
  preparePasskeys: jest.fn(async () => undefined),
  passkeysReady: jest.fn(() => true),
  signInWithPasskey: jest.fn()
}));

const sdk = jest.requireMock<typeof BreezFake>("@breeztech/breez-sdk-spark-react-native");
const signIn = jest.mocked(signInWithPasskey);
const apiKey = process.env.EXPO_PUBLIC_BREEZ_API_KEY;

const CARD = "30c19d9bfae333c1cb42a5ce6e20debb";
const OTHER_CARD = "0123456789abcdef0123456789abcdef";
const DELETED: CardWalletOf = { cardId: CARD, walletGeneration: 1 };

/** A state of the card `cardId`, `status`, at its wallet's `walletGeneration`. */
function state(cardId: string, status: CardState["status"], walletGeneration: number): CardState {
  return {
    cardId,
    uid: "04996c6a926980",
    keyVersion: 1,
    status,
    relayHost: DEFAULT_CARD_RELAY_HOST,
    lastCounter: 0,
    depositedThrough: 0,
    maxPaymentSats: 20_000n,
    maxDaySats: 50_000n,
    maxPaymentsPerHour: 5,
    suspended: false,
    name: "",
    look: null,
    issuer: null,
    settingsAt: 1,
    walletGeneration,
    updatedAt: 1
  };
}

/** An on-chain deposit to the wallet, not credited yet. */
function arriving(sats: bigint) {
  return {
    txid: "ab".repeat(32),
    vout: 0,
    amountSats: sats,
    isMature: false,
    refundTx: undefined,
    refundTxId: undefined,
    claimError: undefined,
    instantClaimStatus: undefined
  };
}

function read(wallet: CardWalletOf = DELETED) {
  return withCardAccess((access) => readErasedFunds(access, wallet));
}

function sendBack(wallet: CardWalletOf = DELETED) {
  return withCardAccess((access) => returnErasedFunds(access, wallet));
}

beforeEach(async () => {
  process.env.EXPO_PUBLIC_BREEZ_API_KEY = "test-api-key";
  signIn.mockReset().mockResolvedValue({ seed: testSeed(), credentialId: null });
  // The account's backup finds no relay here: said in development, not this test's.
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
  await openMerchantAccount();
});

afterEach(async () => {
  jest.useRealTimers();
  await lockTerminal();
  process.env.EXPO_PUBLIC_BREEZ_API_KEY = apiKey;
  jest.restoreAllMocks();
});

describe("the wallets no card shows any more", () => {
  it("are a deleted card's, and a card's earlier ones once it was added again", () => {
    expect(
      erasedWallets([
        // In service with its first wallet, or left the field during a relay change: its own.
        state(CARD, "active", 1),
        state(OTHER_CARD, "reset", 1)
      ])
    ).toEqual([]);
    expect(erasedWallets([state(CARD, "deleted", 1)])).toEqual([DELETED]);
    // Added again twice: it pays from its third wallet.
    expect(erasedWallets([state(CARD, "active", 3)])).toEqual([
      DELETED,
      { cardId: CARD, walletGeneration: 2 }
    ]);
    expect(erasedWallets([state(CARD, "deleted", 2), state(OTHER_CARD, "migrating", 2)])).toEqual([
      DELETED,
      { cardId: CARD, walletGeneration: 2 },
      { cardId: OTHER_CARD, walletGeneration: 1 }
    ]);
  });
});

describe("the wallets of the cards whose programming stopped", () => {
  it("are each such card's current one, nothing of a card in service nor deleted", () => {
    expect(
      resetWallets([
        state(CARD, "reset", 2),
        state(OTHER_CARD, "active", 1),
        state("f".repeat(32), "deleted", 1),
        state("e".repeat(32), "migrating", 1)
      ])
    ).toEqual([{ cardId: CARD, walletGeneration: 2 }]);
  });
});

describe("what such a wallet holds", () => {
  it("is read once synced: its balance and its deposits on their way", async () => {
    sdk.fakeCardWallet(CARD).balanceSats = 2_100n;
    sdk.fakeCardWallet(CARD).unclaimedDeposits = [arriving(30_000n), arriving(4_000n)];
    await expect(read()).resolves.toEqual({
      wallet: DELETED,
      sats: 2_100n,
      arrivingSats: 34_000n
    });

    sdk.fakeCardWallet(CARD).balanceSats = 0n;
    await expect(read()).resolves.toEqual({ wallet: DELETED, sats: 0n, arrivingSats: 34_000n });
    // Disconnected once read.
    expect(cardWallet(CARD, 1).isConnected()).toBe(false);
  });

  it("has its funds out of its balance brought back to it (funds-recovery-sync.ts)", async () => {
    const recover = jest.spyOn(fundsRecoverySync, "recoverCardFunds").mockResolvedValue();
    sdk.fakeCardWallet(CARD).recovery.leaves = [
      { leafId: "leaf-1", valueSats: 5_000n, method: "cooperative", takenFeeSats: 0n }
    ];
    // Nothing to say yet: they show as its deposit on its way once sent back to it.
    await expect(read()).resolves.toBeNull();
    expect(recover).toHaveBeenCalledWith(TEST_WALLET_ID, DELETED, { connect: true });

    recover.mockClear();
    sdk.fakeCardWallet(CARD).recovery.leaves = [];
    await read();
    expect(recover).not.toHaveBeenCalled();
  });

  it("is nothing to say when it is empty, never another generation's", async () => {
    sdk.fakeCardWallet(CARD, 2).balanceSats = 900n;
    await expect(read()).resolves.toBeNull();
    await expect(read({ cardId: CARD, walletGeneration: 2 })).resolves.toMatchObject({
      sats: 900n
    });
  });

  it("is nothing to say when the wallet does not answer in time, or fails: never a rejection", async () => {
    sdk.fakeCardWallet(CARD).balanceSats = 500n;
    jest.useFakeTimers({ now: Date.now(), doNotFake: ["queueMicrotask", "nextTick"] });
    const release = sdk.holdFirstSync();
    let settled = false;
    const late = read().finally(() => {
      settled = true;
    });
    await jest.advanceTimersByTimeAsync(CARD_WALLET_CHECK_MS - 1);
    expect(settled).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    await expect(late).resolves.toBeNull();
    release();
    jest.useRealTimers();
    // Its read past the wait still ends, the wallet disconnected.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(cardWallet(CARD, 1).isConnected()).toBe(false);

    sdk.connect.mockRejectedValueOnce(new Error("ServiceConnectivity: unreachable"));
    await expect(read()).resolves.toBeNull();
    // Read again later: what it holds.
    await expect(read()).resolves.toMatchObject({ sats: 500n });
  });
});

describe('"Withdraw" what reached such a wallet', () => {
  it("sends everything it holds back to the main balance, after the passkey", async () => {
    sdk.fakeCardWallet(CARD).balanceSats = 7_700n;
    await expect(sendBack()).resolves.toEqual({ sats: 7_700n, status: "completed" });
    expect(signIn).toHaveBeenCalledTimes(1);
    expect(sdk.fakeCardWallet(CARD).balanceSats).toBe(0n);
    // Claimed by the account's wallet at its sync; both wallets disconnected again.
    expect(sdk.fakeWallet.balanceSats).toBe(7_700n);
    expect(isAccountWalletOpen()).toBe(false);
    expect(cardWallet(CARD, 1).isConnected()).toBe(false);
  });

  it("says when the transfer left without arriving yet, or failed", async () => {
    sdk.fakeCardWallet(CARD).balanceSats = 300n;
    sdk.fakeSend.sentStatus = sdk.PaymentStatus.Pending;
    await expect(sendBack()).resolves.toEqual({ sats: 300n, status: "pending" });

    sdk.fakeCardWallet(CARD).balanceSats = 200n;
    sdk.fakeSend.sentStatus = sdk.PaymentStatus.Failed;
    await expect(sendBack()).resolves.toEqual({ sats: 200n, status: "failed" });
  });

  it("sends nothing when the passkey is dismissed, nor from an empty wallet, both disconnected", async () => {
    sdk.fakeCardWallet(CARD).balanceSats = 1_000n;
    signIn.mockRejectedValueOnce(new PasskeyError("cancelled", "Dismissed"));
    await expect(sendBack()).rejects.toBeInstanceOf(PasskeyError);
    expect(sdk.fakeCardWallet(CARD).balanceSats).toBe(1_000n);
    expect(sdk.fakeWallet.balanceSats).toBe(0n);
    expect(isAccountWalletOpen()).toBe(false);
    expect(cardWallet(CARD, 1).isConnected()).toBe(false);

    sdk.fakeCardWallet(CARD).balanceSats = 0n;
    signIn.mockClear();
    await expect(sendBack()).rejects.toBeInstanceOf(NothingToReturnError);
    expect(signIn).not.toHaveBeenCalled();
    expect(isAccountWalletOpen()).toBe(false);
  });

  it("releases the main balance's wallet when the transfer fails, nothing moved", async () => {
    sdk.fakeCardWallet(CARD).balanceSats = 1_000n;
    sdk.fakeSend.sendError = new Error("ServiceConnectivity: unreachable");
    await expect(sendBack()).rejects.toThrow();
    expect(sdk.fakeCardWallet(CARD).balanceSats).toBe(1_000n);
    expect(isAccountWalletOpen()).toBe(false);
    expect(cardWallet(CARD, 1).isConnected()).toBe(false);

    // Pressed again: sent.
    sdk.fakeSend.sendError = null;
    await expect(sendBack()).resolves.toEqual({ sats: 1_000n, status: "completed" });
  });
});

describe('"Cards"\' reads of such wallets', () => {
  /** How many times `wallet` was connected since the test began. */
  function connections(wallet: CardWalletOf): number {
    const storage = `/breez-sdk-spark-cards/${wallet.cardId}/${wallet.walletGeneration}`;
    return sdk.connect.mock.calls.filter((call) =>
      ((call[0] as { storageDir?: string } | undefined)?.storageDir ?? "").includes(storage)
    ).length;
  }

  // A deleted card, and a card added again whose first wallet is empty.
  const states = [state(CARD, "deleted", 1), state(OTHER_CARD, "active", 2)];
  const HELD = { wallet: DELETED, sats: 400n, arrivingSats: 0n, stopped: null };

  beforeEach(() => {
    sdk.connect.mockClear();
    sdk.fakeCardWallet(CARD).balanceSats = 400n;
  });

  it("says only those holding something, each read once it shows, at most once an hour", async () => {
    // Nothing said before it is read.
    let release = sdk.holdFirstSync();
    const first = await renderHook(() => useErasedFunds(states));
    expect(first.result.current.funds).toEqual([]);
    release();
    await waitFor(() => expect(first.result.current.funds).toEqual([HELD]));
    await waitFor(() => expect(connections({ cardId: OTHER_CARD, walletGeneration: 1 })).toBe(1));
    expect(connections(DELETED)).toBe(1);
    await first.unmount();

    // Shown again within the hour: as read, read again by no one.
    release = sdk.holdFirstSync();
    const again = await renderHook(() => useErasedFunds(states));
    expect(again.result.current.funds).toEqual([HELD]);
    release();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(connections(DELETED)).toBe(1);
    await again.unmount();

    // An hour later: read again.
    jest.spyOn(Date, "now").mockReturnValue(Date.now() + ERASED_FUNDS_READ_INTERVAL_MS);
    sdk.fakeCardWallet(CARD).balanceSats = 650n;
    const later = await renderHook(() => useErasedFunds(states));
    await waitFor(() => expect(later.result.current.funds).toEqual([{ ...HELD, sats: 650n }]));
    expect(connections(DELETED)).toBe(2);
    await later.unmount();
  });

  it("reads one again at once once its sats moved, saying nothing of it meanwhile", async () => {
    const { result, unmount } = await renderHook(() => useErasedFunds(states));
    await waitFor(() => expect(result.current.funds).toEqual([HELD]));
    await sendBack();
    expect(connections(DELETED)).toBe(2);
    const release = sdk.holdFirstSync();
    await act(async () => result.current.reread(DELETED));
    expect(result.current.funds).toEqual([]);
    release();
    await waitFor(() => expect(connections(DELETED)).toBe(3));
    // Empty now: nothing said.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(result.current.funds).toEqual([]);
    await unmount();
  });

  it("forgets what it read once the account closes", async () => {
    const first = await renderHook(() => useErasedFunds(states));
    await waitFor(() => expect(first.result.current.funds).toEqual([HELD]));
    await first.unmount();
    await lockTerminal();

    await openMerchantAccount();
    const release = sdk.holdFirstSync();
    const again = await renderHook(() => useErasedFunds(states));
    // Not as read before the account closed: read anew.
    expect(again.result.current.funds).toEqual([]);
    release();
    await waitFor(() => expect(again.result.current.funds).toEqual([HELD]));
    expect(connections(DELETED)).toBe(2);
    await again.unmount();
  });
});

describe('a stopped card\'s wallet in "Cards"', () => {
  it("says it with its card while it holds sats", async () => {
    const stopped = state(CARD, "reset", 1);
    // As "Cards" holds them: the same list from one render to the next.
    const states = [stopped];
    sdk.fakeCardWallet(CARD).balanceSats = 900n;
    sdk.fakeCardWallet(CARD).unclaimedDeposits = [arriving(5_000n)];
    const { result, unmount } = await renderHook(() => useErasedFunds(states));
    await waitFor(() =>
      expect(result.current.funds).toEqual([
        { wallet: DELETED, sats: 900n, arrivingSats: 5_000n, stopped }
      ])
    );
    await unmount();
  });

  it("says nothing of it without sats, its deposits on their way included", async () => {
    const states = [state(OTHER_CARD, "reset", 1)];
    sdk.fakeCardWallet(OTHER_CARD).unclaimedDeposits = [arriving(5_000n)];
    const reads = jest.spyOn(erasedFundsModule, "readErasedFunds");
    const { result, unmount } = await renderHook(() => useErasedFunds(states));
    await waitFor(() => expect(reads).toHaveBeenCalledTimes(1));
    // Read: it holds sats on their way only.
    await expect(reads.mock.results[0]!.value).resolves.toMatchObject({
      sats: 0n,
      arrivingSats: 5_000n
    });
    await act(async () => undefined);
    expect(result.current.funds).toEqual([]);
    await unmount();
  });

  /** A stop of the card's programming at its keys' `keyVersion` (keyVersionFor: one more each time). */
  function stoppedAt(keyVersion: number): CardState {
    return { ...state(CARD, "reset", 1), keyVersion };
  }

  it("reads it again once its card was back in service then stopped again, never as read before", async () => {
    sdk.fakeCardWallet(CARD).balanceSats = 4_200n;
    const first = stoppedAt(1);
    const view = await renderHook((states: CardState[]) => useErasedFunds(states), {
      initialProps: [first]
    });
    await waitFor(() =>
      expect(view.result.current.funds).toEqual([
        { wallet: DELETED, sats: 4_200n, arrivingSats: 0n, stopped: first }
      ])
    );
    // Programmed again (at its next keys), it paid 4 000 sats; twenty minutes later, stopped again.
    sdk.fakeCardWallet(CARD).balanceSats = 200n;
    jest.spyOn(Date, "now").mockReturnValue(Date.now() + 20 * 60_000);
    const again = stoppedAt(2);
    await view.rerender([again]);
    await waitFor(() =>
      expect(view.result.current.funds).toEqual([
        { wallet: DELETED, sats: 200n, arrivingSats: 0n, stopped: again }
      ])
    );
    await view.unmount();
  });

  it("says nothing of it once its card, emptied, was deleted, whatever it held when stopped", async () => {
    sdk.fakeCardWallet(CARD).balanceSats = 4_200n;
    const stopped = stoppedAt(1);
    const view = await renderHook((states: CardState[]) => useErasedFunds(states), {
      initialProps: [stopped]
    });
    await waitFor(() => expect(view.result.current.funds).toHaveLength(1));
    // Back in service, emptied, then deleted: its wallet is a deleted card's, read anew.
    sdk.fakeCardWallet(CARD).balanceSats = 0n;
    sdk.connect.mockClear();
    const reads = jest.spyOn(erasedFundsModule, "readErasedFunds");
    await view.rerender([{ ...state(CARD, "deleted", 1), keyVersion: 2 }]);
    await waitFor(() => expect(reads).toHaveBeenCalledTimes(1));
    await act(async () => undefined);
    expect(view.result.current.funds).toEqual([]);
    await view.unmount();
  });

  it("says what reached it after a stop it was read empty at, once stopped again", async () => {
    const first = stoppedAt(1);
    const reads = jest.spyOn(erasedFundsModule, "readErasedFunds");
    const view = await renderHook((states: CardState[]) => useErasedFunds(states), {
      initialProps: [first]
    });
    await waitFor(() => expect(reads).toHaveBeenCalledTimes(1));
    await act(async () => undefined);
    expect(view.result.current.funds).toEqual([]);
    // Added again, recharged, then stopped again within the hour.
    sdk.fakeCardWallet(CARD).balanceSats = 50_000n;
    const again = stoppedAt(2);
    await view.rerender([again]);
    await waitFor(() =>
      expect(view.result.current.funds).toEqual([
        { wallet: DELETED, sats: 50_000n, arrivingSats: 0n, stopped: again }
      ])
    );
    // The same stop shown again within the hour: as read, not read again.
    await view.rerender([{ ...again }]);
    await act(async () => undefined);
    expect(reads).toHaveBeenCalledTimes(2);
    await view.unmount();
  });
});
