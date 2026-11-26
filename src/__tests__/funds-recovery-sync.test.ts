import { waitFor } from "@testing-library/react-native";

import { closeAccount, getAccountTeamKeys } from "@/features/account/session";
import { isAccountWalletOpen } from "@/features/account/wallet-access";
import { leaseCardWallet } from "@/features/card/card-wallet";
import { withCardAccess } from "@/features/card/states";
import { recoverFunds, type FundsRecoveryOutcome } from "@/features/wallet/funds-recovery";
import {
  FUNDS_RECOVERY_INTERVAL_MS,
  FUNDS_RECOVERY_RETRY_MS,
  recoverAccountFunds,
  recoverCardFunds,
  resetFundsRecoveryAttempts
} from "@/features/wallet/funds-recovery-sync";
import {
  accountRecoveryWallet,
  cardWallet,
  connectWallet,
  disconnectWallet
} from "@/lib/breez/wallet";
import { logFailure } from "@/lib/log/log";
import { currentRelays } from "@/lib/relays/current";

import { TEST_WALLET_ID, openMerchantAccount, testSeed } from "../../jest/account";
import type * as BreezFake from "../../jest/breez-sdk";

/*
 * When the funds that left a wallet's balance are recovered (funds-recovery-sync.ts): the account's
 * wallet on the connection "Wallet" holds, each card's on the lease "Cards" holds, never
 * a wallet connected for that alone (but a deleted card's found with funds out of its balance),
 * each wallet at most so often while the app runs.
 */

// The wallets connect: this build's network. The trigger's own check reads `mockNetwork`.
jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { extra: { breezNetwork: "mainnet" } } }
}));
const mockNetwork = jest.fn(() => "mainnet");
jest.mock("../lib/breez/config", () => ({
  ...jest.requireActual<object>("../lib/breez/config"),
  getBreezNetwork: () => mockNetwork()
}));
// Whether "Wallet" holds the connection: the test's.
jest.mock("../features/account/wallet-access", () => ({ isAccountWalletOpen: jest.fn() }));
jest.mock("../features/wallet/funds-recovery", () => ({ recoverFunds: jest.fn() }));
jest.mock("../lib/log/log", () => ({ logFailure: jest.fn(), logEvent: jest.fn() }));

const sdk = jest.requireMock<typeof BreezFake>("@breeztech/breez-sdk-spark-react-native");
/** What the journal is told of an attempt that could not start (the settings' backup has its own). */
const STARTING = "Starting a funds recovery failed";
const CARD = { cardId: "30c19d9bfae333c1cb42a5ce6e20debb", walletGeneration: 1 };
const T0 = Date.UTC(2026, 9, 24, 9, 0);
const apiKey = process.env.EXPO_PUBLIC_BREEZ_API_KEY;
let clock = T0;

const done = (waiting: boolean): FundsRecoveryOutcome => ({
  status: "done",
  sent: 1,
  waiting,
  stranded: 0
});

beforeEach(async () => {
  jest.clearAllMocks();
  process.env.EXPO_PUBLIC_BREEZ_API_KEY = "test-api-key";
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
  clock = T0;
  jest.spyOn(Date, "now").mockImplementation(() => clock);
  mockNetwork.mockReturnValue("mainnet");
  resetFundsRecoveryAttempts();
  jest.mocked(isAccountWalletOpen).mockReturnValue(true);
  jest.mocked(recoverFunds).mockResolvedValue({ status: "none" });
  await openMerchantAccount();
  await connectWallet(testSeed());
});

afterEach(async () => {
  await disconnectWallet();
  closeAccount();
  process.env.EXPO_PUBLIC_BREEZ_API_KEY = apiKey;
  jest.restoreAllMocks();
});

describe("the account's wallet", () => {
  it('is recovered on the connection "Wallet" holds, with the team\'s keys and relays', async () => {
    await recoverAccountFunds(TEST_WALLET_ID);

    expect(recoverFunds).toHaveBeenCalledWith({
      wallet: accountRecoveryWallet,
      walletId: TEST_WALLET_ID,
      subject: { kind: "account" },
      team: getAccountTeamKeys(),
      relays: currentRelays(),
      own: expect.any(Function)
    });
    // Its own as long as the screen holds this connection.
    const [[{ own }]] = jest.mocked(recoverFunds).mock.calls;
    expect(own()).toBe(true);
    jest.mocked(isAccountWalletOpen).mockReturnValue(false);
    expect(own()).toBe(false);
    jest.mocked(isAccountWalletOpen).mockReturnValue(true);
    await disconnectWallet();
    await connectWallet(testSeed());
    expect(own()).toBe(false);
  });

  it("never connects the wallet for it: the screen's next opening tries again", async () => {
    await disconnectWallet();
    const connections = sdk.connect.mock.calls.length;
    await recoverAccountFunds(TEST_WALLET_ID);
    // Connected by another flow (the activation at login, a background task): left to it.
    await connectWallet(testSeed());
    jest.mocked(isAccountWalletOpen).mockReturnValue(false);
    clock += FUNDS_RECOVERY_RETRY_MS;
    await recoverAccountFunds(TEST_WALLET_ID, clock);
    expect(recoverFunds).not.toHaveBeenCalled();
    expect(sdk.connect.mock.calls.length).toBe(connections + 1);

    jest.mocked(isAccountWalletOpen).mockReturnValue(true);
    clock += FUNDS_RECOVERY_RETRY_MS;
    await recoverAccountFunds(TEST_WALLET_ID, clock);
    expect(recoverFunds).toHaveBeenCalledTimes(1);
  });

  it("is not tried again for a while once nothing is left to do", async () => {
    await recoverAccountFunds(TEST_WALLET_ID);
    clock += FUNDS_RECOVERY_INTERVAL_MS - 1;
    await recoverAccountFunds(TEST_WALLET_ID, clock);
    expect(recoverFunds).toHaveBeenCalledTimes(1);

    // Everything sent: as long.
    jest.mocked(recoverFunds).mockResolvedValue(done(false));
    clock += 1;
    await recoverAccountFunds(TEST_WALLET_ID, clock);
    clock += FUNDS_RECOVERY_RETRY_MS;
    await recoverAccountFunds(TEST_WALLET_ID, clock);
    expect(recoverFunds).toHaveBeenCalledTimes(2);
  });

  it("is tried again sooner when something was left for later", async () => {
    for (const outcome of [{ status: "later" } as const, done(true)]) {
      resetFundsRecoveryAttempts();
      jest.mocked(recoverFunds).mockClear().mockResolvedValue(outcome);
      await recoverAccountFunds(TEST_WALLET_ID, clock);
      await recoverAccountFunds(TEST_WALLET_ID, clock + FUNDS_RECOVERY_RETRY_MS - 1);
      expect(recoverFunds).toHaveBeenCalledTimes(1);
      clock += FUNDS_RECOVERY_RETRY_MS;
      await recoverAccountFunds(TEST_WALLET_ID, clock);
      expect(recoverFunds).toHaveBeenCalledTimes(2);
    }
  });

  it("is recovered once at a time: a call meanwhile shares the attempt", async () => {
    let finish!: (outcome: FundsRecoveryOutcome) => void;
    jest.mocked(recoverFunds).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const first = recoverAccountFunds(TEST_WALLET_ID);
    const second = recoverAccountFunds(TEST_WALLET_ID);
    await waitFor(() => expect(recoverFunds).toHaveBeenCalledTimes(1));
    finish({ status: "none" });
    await Promise.all([first, second]);
    expect(recoverFunds).toHaveBeenCalledTimes(1);
  });

  it("tells the journal of an attempt that could not start, and tries again soon", async () => {
    jest.mocked(recoverFunds).mockRejectedValueOnce(new Error("Unexpected"));
    await recoverAccountFunds(TEST_WALLET_ID);
    expect(logFailure).toHaveBeenCalledWith(STARTING, expect.any(Error));
    clock += FUNDS_RECOVERY_RETRY_MS;
    await recoverAccountFunds(TEST_WALLET_ID, clock);
    expect(recoverFunds).toHaveBeenCalledTimes(2);
  });

  it("is left alone off mainnet, or for another account", async () => {
    mockNetwork.mockReturnValue("regtest");
    await recoverAccountFunds(TEST_WALLET_ID);
    mockNetwork.mockReturnValue("mainnet");
    await recoverAccountFunds(`03${"1".repeat(64)}`);
    expect(recoverFunds).not.toHaveBeenCalled();
  });
});

describe("a card's wallet", () => {
  it("is recovered as the card's, its wallet leased for it and released after", async () => {
    let connected: boolean | null = null;
    jest.mocked(recoverFunds).mockImplementation(async (params) => {
      connected = cardWallet(CARD.cardId, 1).isConnected();
      expect(params.own()).toBe(true);
      return { status: "none" };
    });

    await recoverCardFunds(TEST_WALLET_ID, CARD, { connect: true });

    expect(connected).toBe(true);
    expect(cardWallet(CARD.cardId, 1).isConnected()).toBe(false);
    const [[params]] = jest.mocked(recoverFunds).mock.calls;
    expect(params).toMatchObject({
      subject: { kind: "card", ...CARD },
      team: getAccountTeamKeys(),
      relays: currentRelays()
    });
    // Its own wallet, its own id: never the account's.
    expect(params!.wallet).not.toBe(accountRecoveryWallet);
    expect(params!.walletId).toMatch(/^0[23][0-9a-f]{64}$/);
    expect(params!.walletId).not.toBe(TEST_WALLET_ID);
  });

  it("is tried at most so often, each wallet on its own", async () => {
    await recoverCardFunds(TEST_WALLET_ID, CARD, { connect: true });
    await recoverCardFunds(TEST_WALLET_ID, CARD, { connect: true });
    await recoverCardFunds(TEST_WALLET_ID, { ...CARD, walletGeneration: 2 }, { connect: true });
    await recoverAccountFunds(TEST_WALLET_ID);
    expect(recoverFunds).toHaveBeenCalledTimes(3);
  });

  it('from "Cards", joins the connection its screen holds, never connects one it let go', async () => {
    const screen = await withCardAccess((access) => leaseCardWallet(access, CARD));
    let connections = 0;
    const counted = cardWallet(CARD.cardId, 1).subscribe(() => {
      if (cardWallet(CARD.cardId, 1).isConnected()) connections += 1;
    });
    let finish!: () => void;
    jest.mocked(recoverFunds).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = () => resolve({ status: "none" });
        })
    );
    try {
      const attempt = recoverCardFunds(TEST_WALLET_ID, CARD);
      await waitFor(() => expect(recoverFunds).toHaveBeenCalledTimes(1));
      // The screen left meanwhile: connected until the attempt ends, then let go.
      await screen.release();
      expect(cardWallet(CARD.cardId, 1).isConnected()).toBe(true);
      finish();
      await attempt;
      expect(cardWallet(CARD.cardId, 1).isConnected()).toBe(false);
      expect(connections).toBe(0);

      // Not connected (the screen let it go): left alone, tried again soon.
      clock += FUNDS_RECOVERY_INTERVAL_MS;
      await recoverCardFunds(TEST_WALLET_ID, CARD, { now: clock });
      expect(recoverFunds).toHaveBeenCalledTimes(1);
      expect(connections).toBe(0);
      clock += FUNDS_RECOVERY_RETRY_MS;
      jest.mocked(recoverFunds).mockResolvedValue({ status: "none" });
      await recoverCardFunds(TEST_WALLET_ID, CARD, { connect: true, now: clock });
      expect(recoverFunds).toHaveBeenCalledTimes(2);
    } finally {
      counted();
    }
  });

  it("is left alone once the account closed", async () => {
    closeAccount();
    await recoverCardFunds(TEST_WALLET_ID, CARD);
    expect(recoverFunds).not.toHaveBeenCalled();
    expect(logFailure).not.toHaveBeenCalledWith(STARTING, expect.anything());
  });
});
