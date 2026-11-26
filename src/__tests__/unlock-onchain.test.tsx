import "@/i18n";

import { DEFAULT_RELAYS } from "@/config/relays";
import { act, fireEvent, renderRouter, screen, waitFor } from "expo-router/testing-library";

import AppLayout from "@/app/(app)/_layout";
import AmountScreen from "@/app/(app)/pos/index";
import PosLayout from "@/app/(app)/pos/_layout";
import LaunchScreen from "@/app/index";
import { closeAccount, getAccountWalletId, subscribeAccount } from "@/features/account/session";
import { lockTerminal } from "@/features/navigation/lock";
import { syncOnchainPool } from "@/features/terminal/onchain-pool";
import { signInWithPasskey } from "@/lib/breez/passkey";
import {
  connectWallet,
  disconnectWallet,
  getWalletConnectionId,
  getWalletId,
  newDepositAddress,
  subscribeWallet
} from "@/lib/breez/wallet";
import type { MerchantSettings } from "@/lib/settings/merchant";
import { saveMerchantSettings } from "@/lib/settings/store";
import { loadOnchainPool, saveOnchainPool, saveTerminalProfile } from "@/lib/terminal/profile";

import { OTHER_TEST_MNEMONIC, testBackupKey, testSeed } from "../../jest/account";
import { taprootAddress } from "../../jest/bitcoin";
import type * as RelaysFake from "../../jest/nostr-relays";

/*
 * Unlocking never waits for the point of sale's on-chain addresses: once the account is open, as
 * soon as one is missing, the wallet connects in the background for them and fills the pool up to
 * 20, without time limit, then disconnects (onchain-pool.ts). The rest of till mode is tested in
 * navigation.test.tsx, without on-chain payments.
 */

jest.mock("../lib/breez/config", () => ({
  ...jest.requireActual("../lib/breez/config"),
  getBreezNetwork: () => "mainnet"
}));
jest.mock("../lib/breez/passkey", () => ({
  createPasskeyWallet: jest.fn(),
  preparePasskeys: jest.fn(async () => undefined),
  passkeysReady: jest.fn(() => true),
  signInWithPasskey: jest.fn()
}));
jest.mock("../lib/breez/wallet", () => ({
  checkWalletConfig: jest.fn(),
  connectWallet: jest.fn(),
  disconnectCardWallets: jest.fn(async () => undefined),
  disconnectWallet: jest.fn(),
  getWalletConnectionId: jest.fn(),
  getWalletId: jest.fn(),
  getWalletLightningAddress: jest.fn(),
  newDepositAddress: jest.fn(),
  subscribeWallet: jest.fn()
}));
jest.mock("../features/terminal/useRate", () => ({
  useRate: () => ({
    rate: 50000,
    // The point that prices the present (src/lib/rates/), on the test's clock.
    hour: jest
      .requireActual<typeof import("../lib/rates/sources")>("../lib/rates/sources")
      .pointHourOf(Math.floor(Date.now() / 1000)),
    loading: false,
    current: () => 50000
  })
}));
jest.mock("@/components/layout/useIsDesktop", () => ({
  useIsDesktop: () => false
}));

const signIn = jest.mocked(signInWithPasskey);
const connect = jest.mocked(connectWallet);
const disconnect = jest.mocked(disconnectWallet);
const walletId = jest.mocked(getWalletId);
const newAddress = jest.mocked(newDepositAddress);
const relays = jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");

const WALLET = "02c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5";

const settings: MerchantSettings = {
  version: 18,
  recoveryCheck: { verifiedAt: null, dueSince: null },
  bitcoinNode: null,
  productLookup: true,
  splitSince: 1790000000,
  legacyTransfers: [],
  businessAddress: null,
  companyNumber: "",
  vatNumber: "",
  vatRate: null,
  onchainTolerance: 0,
  formerAddressMetadata: [],
  updatedAt: 1790000000,
  signUp: "done",
  businessName: "Fine Bakery",
  usage: "merchant",
  bitcoinPercent: 100,
  payoutCurrency: "CHF",
  displayCurrency: "CHF",
  detectedCountry: "CH",
  payoutAccountId: null,
  onchainPayments: true,
  relays: [...DEFAULT_RELAYS],
  devices: [],
  logo: null
};

const routes = {
  index: LaunchScreen,
  "(app)/_layout": AppLayout,
  "(app)/pos/_layout": PosLayout,
  "(app)/pos/index": AmountScreen
};

/** The point of sale with `left` on-chain addresses (fills 1, 2, …), in till mode. */
async function openApp(left: number) {
  await saveTerminalProfile({
    version: 2,
    walletId: WALLET,
    backupKey: testBackupKey(),
    lightningAddress: "sattleme02c6047f94@breez.tips",
    businessName: "Fine Bakery",
    currency: "CHF"
  });
  await saveOnchainPool({
    version: 1,
    walletId: WALLET,
    addresses: Array.from({ length: left }, (_, i) => taprootAddress(i + 1))
  });
  const router = await renderRouter(routes, { initialUrl: "/" });
  await waitFor(() => expect(router.getPathname()).toBe("/pos"));
}

/** How many times the wallet had been connected when the account opened, each time it did. */
function watchOpenings(): { connectionsWhenOpened: number[]; stop: () => void } {
  const connectionsWhenOpened: number[] = [];
  const stop = subscribeAccount(() => {
    if (getAccountWalletId() !== null) connectionsWhenOpened.push(connect.mock.calls.length);
  });
  return { connectionsWhenOpened, stop };
}

/** The account open, then the filling of its addresses done (it shares the one running). */
async function unlocked(): Promise<void> {
  await waitFor(() => expect(getAccountWalletId()).toBe(WALLET));
  await syncOnchainPool(WALLET);
}

jest.setTimeout(20_000);

describe("unlocking, and the point of sale's on-chain addresses", () => {
  /** The fake wallet's connection: 1 while connected. */
  let connection: number | null = null;

  beforeEach(async () => {
    closeAccount();
    relays.resetRelays();
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    signIn.mockReset().mockResolvedValue({ seed: testSeed(), credentialId: null });
    connection = null;
    connect.mockReset().mockImplementation(async () => {
      connection = 1;
    });
    disconnect.mockReset().mockImplementation(async () => {
      connection = null;
    });
    jest.mocked(getWalletConnectionId).mockImplementation(() => connection);
    jest.mocked(subscribeWallet).mockImplementation((listener) => {
      const timer = setTimeout(listener, 0);
      return () => clearTimeout(timer);
    });
    walletId.mockReset().mockResolvedValue(WALLET);
    let next = 100;
    newAddress.mockReset().mockImplementation(async () => taprootAddress(next++));
    await saveMerchantSettings(WALLET, settings);
  });

  it("fills them up to 20 once the account is open, as soon as one is missing", async () => {
    await openApp(19);
    const openings = watchOpenings();
    await fireEvent.press(screen.getByTestId("dock-unlock"));

    await unlocked();
    openings.stop();
    // The account opened before the wallet connected: unlocking never waits for the addresses.
    expect(openings.connectionsWhenOpened).toEqual([0]);
    expect(connect).toHaveBeenCalledWith(testSeed());
    expect(newAddress).toHaveBeenCalledTimes(1);
    expect(newAddress).toHaveBeenCalledWith(WALLET);
    expect((await loadOnchainPool("mainnet"))?.addresses).toEqual([
      ...Array.from({ length: 19 }, (_, i) => taprootAddress(i + 1)),
      taprootAddress(100)
    ]);
    // Connected for that only.
    expect(connection).toBeNull();
  });

  // Every unlock, not only the first one of a launch, gives back the addresses the sales took while
  // the account was locked.
  it("fills them up again at each unlock, after the sales of the locked till took some", async () => {
    await openApp(20);
    await fireEvent.press(screen.getByTestId("dock-unlock"));
    await unlocked();
    expect(newAddress).not.toHaveBeenCalled();

    // Locked ("Switch to till mode", or the auto-lock: lockTerminal): the till's sales take 3
    // of them, the wallet is not there to give others.
    await act(() => lockTerminal());
    expect(getAccountWalletId()).toBeNull();
    const left = Array.from({ length: 17 }, (_, i) => taprootAddress(i + 4));
    await saveOnchainPool({ version: 1, walletId: WALLET, addresses: left });

    // The unlock alone fills them (not unlocked(), which runs the filling itself).
    await fireEvent.press(await screen.findByTestId("dock-unlock"));
    await waitFor(async () =>
      expect((await loadOnchainPool("mainnet"))?.addresses).toEqual([
        ...left,
        taprootAddress(100),
        taprootAddress(101),
        taprootAddress(102)
      ])
    );
    expect(newAddress).toHaveBeenCalledTimes(3);
    await waitFor(() => expect(connection).toBeNull());
  });

  it("does not connect the wallet while all 20 are there", async () => {
    await openApp(20);
    await fireEvent.press(screen.getByTestId("dock-unlock"));

    await unlocked();
    expect(connect).not.toHaveBeenCalled();
    expect(newAddress).not.toHaveBeenCalled();
  });

  it("fills them when the point of sale takes Lightning only: the invoices take them", async () => {
    // "On-chain payments" off: the point of sale's only, the invoices of "New invoice" still offer
    // an on-chain address.
    await saveMerchantSettings(WALLET, { ...settings, onchainPayments: false });
    await openApp(0);
    await fireEvent.press(screen.getByTestId("dock-unlock"));

    await unlocked();
    expect(connect).toHaveBeenCalledWith(testSeed());
    await waitFor(async () =>
      expect((await loadOnchainPool("mainnet"))?.addresses).toEqual(
        Array.from({ length: 20 }, (_, i) => taprootAddress(i + 100))
      )
    );
    await waitFor(() => expect(connection).toBeNull());
  });

  it("never connects another account's wallet for them", async () => {
    signIn.mockResolvedValue({ seed: testSeed(OTHER_TEST_MNEMONIC), credentialId: null });
    await openApp(0);
    await fireEvent.press(screen.getByTestId("dock-unlock"));

    expect(
      await screen.findByText("This passkey opens another account than this device's")
    ).toBeTruthy();
    expect(connect).not.toHaveBeenCalled();
    expect(getAccountWalletId()).toBeNull();
  });

  it("still unlocks when the wallet cannot connect (offline)", async () => {
    connect.mockRejectedValue(new Error("connectFailed"));
    await openApp(0);
    await fireEvent.press(screen.getByTestId("dock-unlock"));

    await unlocked();
    expect(connect).toHaveBeenCalled();
    expect(newAddress).not.toHaveBeenCalled();
    expect(screen.queryByText(/passkey/i)).toBeNull();
  });

  it("unlocks at once while the wallet takes its time, and asks it for as long as it takes", async () => {
    let answer!: (address: string) => void;
    newAddress.mockImplementation(() => new Promise<string>((resolve) => (answer = resolve)));
    await openApp(19);
    await fireEvent.press(screen.getByTestId("dock-unlock"));

    await waitFor(() => expect(getAccountWalletId()).toBe(WALLET));
    await waitFor(() => expect(newAddress).toHaveBeenCalledTimes(1));
    // Well past 15 s: the request is still awaited, with no time limit.
    jest.advanceTimersByTime(60_000);
    answer(taprootAddress(100));
    await syncOnchainPool(WALLET);
    expect((await loadOnchainPool("mainnet"))?.addresses).toHaveLength(20);
    expect(connection).toBeNull();
  });
});
