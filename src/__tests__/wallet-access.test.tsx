import "@/i18n";

import { DEFAULT_RELAYS } from "@/config/relays";
import { act, fireEvent, renderRouter, screen, waitFor } from "expo-router/testing-library";
import { Pressable, Text, View } from "react-native";

import AppLayout from "@/app/(app)/_layout";
import EmployeesScreen from "@/app/(app)/employees";
import IntegrationsScreen from "@/app/(app)/integrations";
import AmountScreen from "@/app/(app)/pos/index";
import PosLayout from "@/app/(app)/pos/_layout";
import SettingsScreen from "@/app/(app)/settings";
import SettingsLayout from "@/app/(app)/settings/_layout";
import LaunchScreen from "@/app/index";
import {
  closeAccount,
  getAccountCredentialId,
  getAccountSeed,
  getAccountWalletId,
  openAccount
} from "@/features/account/session";
import { NoMainWalletError } from "@/features/account/main-wallet";
import {
  NoRecoveryPhraseError,
  closeAccountWallet,
  confirmAccountPasskey,
  isAccountWalletOpen,
  openAccountWallet,
  revealRecoveryPhrase,
  useAccountWallet
} from "@/features/account/wallet-access";
import { lockTerminal } from "@/features/navigation/lock";
import { PasskeyError } from "@/lib/breez/errors";
import { signInWithPasskey } from "@/lib/breez/passkey";
import type { WalletSeed } from "@/lib/breez/types";
import { connectWallet, disconnectWallet, isWalletConnected } from "@/lib/breez/wallet";
import type { MerchantSettings } from "@/lib/settings/merchant";
import { saveMerchantSettings } from "@/lib/settings/store";
import { saveTerminalProfile } from "@/lib/terminal/profile";

import {
  OTHER_TEST_MNEMONIC,
  TEST_MNEMONIC,
  TEST_WALLET_ID,
  testBackupKey,
  testSeed
} from "../../jest/account";
import type * as RelaysFake from "../../jest/nostr-relays";

// The network of the build comes from the app config, which Jest leaves out.
jest.mock("../lib/breez/config", () => ({
  ...jest.requireActual("../lib/breez/config"),
  getWalletConfig: () => ({ network: "mainnet", apiKey: "test-api-key" })
}));
// The passkey prompt is the test's; the wallet layer is the real one, over the fake SDK.
jest.mock("../lib/breez/passkey", () => ({
  createPasskeyWallet: jest.fn(),
  preparePasskeys: jest.fn(async () => undefined),
  passkeysReady: jest.fn(() => true),
  signInWithPasskey: jest.fn()
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
  ...jest.requireActual("@/components/layout/useIsDesktop"),
  useIsDesktop: () => false
}));

const signIn = jest.mocked(signInWithPasskey);
const relays = jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");
const sdk = jest.requireMock<{ connect: jest.Mock }>("@breeztech/breez-sdk-spark-react-native");

/** Another wallet id: the public key of the private key 3. */
const OTHER_WALLET = "02f9308a019258c31049344f85f89d5229b531c845836f99b08601f113bce036f9";

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

/** The SDK object of the last connection. */
async function lastInstance(): Promise<{ disconnect: jest.Mock; uniffiDestroy: jest.Mock }> {
  const { results } = sdk.connect.mock;
  return (await results[results.length - 1].value) as never;
}

function openTestAccount(walletId = TEST_WALLET_ID, credentialId?: ArrayBuffer | null) {
  return openAccount({
    seed: testSeed(),
    credentialId,
    walletId,
    created: false,
    detect: () => Promise.reject(new Error("No sign-up expected")),
    businessNameWord: "Merchant"
  });
}

beforeEach(async () => {
  closeAccount();
  await disconnectWallet();
  relays.resetRelays();
  sdk.connect.mockClear();
  signIn.mockReset().mockResolvedValue({ seed: testSeed(), credentialId: null });
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
  await saveMerchantSettings(TEST_WALLET_ID, settings);
});

afterEach(async () => {
  closeAccount();
  await disconnectWallet();
});

describe("opening the account's wallet", () => {
  it("connects it with the open account's seed, without the passkey", async () => {
    await openTestAccount();

    await openAccountWallet();

    expect(signIn).not.toHaveBeenCalled();
    expect(sdk.connect).toHaveBeenCalledTimes(1);
    expect(sdk.connect.mock.calls[0][0]).toMatchObject({ seed: testSeed() });
    expect(isWalletConnected()).toBe(true);
  });

  it("needs an open account", async () => {
    await expect(openAccountWallet()).rejects.toThrow("closed while it was being opened");
    expect(signIn).not.toHaveBeenCalled();
    expect(sdk.connect).not.toHaveBeenCalled();
  });

  it("never connects a card holder's account, which has no wallet of its own", async () => {
    await saveMerchantSettings(TEST_WALLET_ID, { ...settings, usage: "card" });
    await openTestAccount();

    await expect(openAccountWallet()).rejects.toBeInstanceOf(NoMainWalletError);

    expect(signIn).not.toHaveBeenCalled();
    expect(sdk.connect).not.toHaveBeenCalled();
    expect(isAccountWalletOpen()).toBe(false);
  });

  it("keeps the seed while the account is open, and drops it once it closes", async () => {
    await openTestAccount();
    expect(getAccountSeed()).toEqual(testSeed());

    await lockTerminal();

    expect(getAccountSeed()).toBeNull();
    await expect(openAccountWallet()).rejects.toThrow("closed while it was being opened");
    expect(sdk.connect).not.toHaveBeenCalled();
  });

  it("disconnects a wallet that is not the account's", async () => {
    // The account says another wallet id than the one its seed connects (02c6…).
    await saveMerchantSettings(OTHER_WALLET, settings);
    await openTestAccount(OTHER_WALLET);

    await expect(openAccountWallet()).rejects.toMatchObject({ name: "OtherAccountError" });
    expect(sdk.connect).toHaveBeenCalledTimes(1);
    expect((await lastInstance()).uniffiDestroy).toHaveBeenCalledTimes(1);
    expect(isWalletConnected()).toBe(false);
  });

  it("connects once while the account's wallet is connected", async () => {
    await openTestAccount();
    await openAccountWallet();

    await openAccountWallet();

    expect(sdk.connect).toHaveBeenCalledTimes(1);
  });

  it("replaces a wallet connected by another flow", async () => {
    await openTestAccount();
    await connectWallet(testSeed());
    const other = await lastInstance();
    expect(isAccountWalletOpen()).toBe(false);

    await openAccountWallet();

    expect(signIn).not.toHaveBeenCalled();
    expect(other.uniffiDestroy).toHaveBeenCalledTimes(1);
    expect(sdk.connect).toHaveBeenCalledTimes(2);
    expect(isAccountWalletOpen()).toBe(true);
  });

  it("connects nothing when the screen was left", async () => {
    await openTestAccount();

    await expect(openAccountWallet(() => false)).rejects.toThrow(
      "closed while it was being opened"
    );
    expect(sdk.connect).not.toHaveBeenCalled();
  });

  it("connects nothing when the account closes while another flow's wallet disconnects", async () => {
    await openTestAccount();
    await connectWallet(testSeed());
    const other = await lastInstance();
    other.disconnect.mockImplementationOnce(async () => {
      closeAccount();
    });

    await expect(openAccountWallet()).rejects.toThrow("closed while it was being opened");
    // Only the other flow's connection.
    expect(sdk.connect).toHaveBeenCalledTimes(1);
    expect(isWalletConnected()).toBe(false);
  });

  it("does not stay connected when till mode comes while it connects", async () => {
    await openTestAccount();
    let connected!: () => void;
    const connecting = new Promise<void>((resolve) => (connected = resolve));
    const connect = sdk.connect.getMockImplementation()!;
    sdk.connect.mockImplementationOnce(async (...args: unknown[]) => {
      await connecting;
      return connect(...args);
    });

    const opening = openAccountWallet();
    await waitFor(() => expect(sdk.connect).toHaveBeenCalled());
    const locking = lockTerminal();
    connected();
    await locking;

    await expect(opening).rejects.toThrow("closed while it was being opened");
    expect((await lastInstance()).uniffiDestroy).toHaveBeenCalledTimes(1);
    expect(isWalletConnected()).toBe(false);
  });
});

describe("opening the account's wallet, then leaving", () => {
  it("does not stay connected when closed while it connects (the screen left)", async () => {
    await openTestAccount();
    let connected!: () => void;
    const connecting = new Promise<void>((resolve) => (connected = resolve));
    const connect = sdk.connect.getMockImplementation()!;
    sdk.connect.mockImplementationOnce(async (...args: unknown[]) => {
      await connecting;
      return connect(...args);
    });

    const opening = openAccountWallet();
    await waitFor(() => expect(sdk.connect).toHaveBeenCalled());
    const closing = closeAccountWallet();
    connected();
    await closing;

    await expect(opening).rejects.toThrow("closed while it was being opened");
    expect((await lastInstance()).uniffiDestroy).toHaveBeenCalledTimes(1);
    // The account stays open.
    expect(getAccountWalletId()).toBe(TEST_WALLET_ID);
  });
});

/** Stands for the wallet screen: what it needs from useAccountWallet (it opens on a tap here). */
function WalletTestScreen() {
  const wallet = useAccountWallet();
  return (
    <View>
      <Text testID="wallet-state">{wallet.connected ? "connected" : "closed"}</Text>
      <Pressable testID="wallet-open" onPress={() => void wallet.open()}>
        <Text>Open</Text>
      </Pressable>
      {wallet.failure ? <Text testID="wallet-failure">{wallet.failure}</Text> : null}
    </View>
  );
}

const routes = {
  index: LaunchScreen,
  "(app)/_layout": AppLayout,
  "(app)/pos/_layout": PosLayout,
  "(app)/pos/index": AmountScreen,
  "(app)/wallet": WalletTestScreen,
  "(app)/employees": EmployeesScreen,
  "(app)/integrations": IntegrationsScreen,
  "(app)/settings/_layout": SettingsLayout,
  "(app)/settings/index": SettingsScreen
};

/** The app of a prepared device, unlocked, on the wallet screen. */
async function openWalletScreen() {
  await saveTerminalProfile({
    version: 2,
    walletId: TEST_WALLET_ID,
    backupKey: testBackupKey(),
    lightningAddress: "sattleme02c6047f94@breez.tips",
    businessName: "Fine Bakery",
    currency: "CHF"
  });
  const router = await renderRouter(routes, { initialUrl: "/" });
  await waitFor(() => expect(router.getPathname()).toBe("/pos"));
  await fireEvent.press(screen.getByTestId("dock-unlock"));
  await waitFor(() => expect(getAccountWalletId()).toBe(TEST_WALLET_ID));
  // Unlocking leaves the wallet disconnected.
  expect(sdk.connect).not.toHaveBeenCalled();
  await fireEvent.press(await screen.findByLabelText("Wallet"));
  await waitFor(() => expect(router.getPathname()).toBe("/wallet"));
  expect(screen.getByTestId("wallet-state")).toHaveTextContent("closed");
  // In an object: the router is a thenable, which an async function's result would unwrap.
  return { router };
}

jest.setTimeout(20_000);

describe("a screen that needs the wallet (useAccountWallet)", () => {
  it("connects it without the passkey, and disconnects it once left for another destination", async () => {
    const { router } = await openWalletScreen();

    await fireEvent.press(screen.getByTestId("wallet-open"));
    await waitFor(() => expect(screen.getByTestId("wallet-state")).toHaveTextContent("connected"));
    // The unlock's passkey only.
    expect(signIn).toHaveBeenCalledTimes(1);
    const instance = await lastInstance();

    await fireEvent.press(screen.getByLabelText("Settings"));
    await waitFor(() => expect(router.getPathname()).toBe("/settings"));
    await waitFor(() => expect(instance.uniffiDestroy).toHaveBeenCalledTimes(1));
    expect(isWalletConnected()).toBe(false);
    // The account stays open: only the wallet's keys went.
    expect(getAccountWalletId()).toBe(TEST_WALLET_ID);

    await fireEvent.press(screen.getByLabelText("Wallet"));
    await waitFor(() => expect(router.getPathname()).toBe("/wallet"));
    expect(screen.getByTestId("wallet-state")).toHaveTextContent("closed");
  });

  it("does not keep it connected when the screen is left while it connects", async () => {
    const { router } = await openWalletScreen();
    let connected!: () => void;
    const connecting = new Promise<void>((resolve) => (connected = resolve));
    const connect = sdk.connect.getMockImplementation()!;
    sdk.connect.mockImplementationOnce(async (...args: unknown[]) => {
      await connecting;
      return connect(...args);
    });

    await fireEvent.press(screen.getByTestId("wallet-open"));
    await waitFor(() => expect(sdk.connect).toHaveBeenCalled());
    await fireEvent.press(screen.getByLabelText("Settings"));
    await waitFor(() => expect(router.getPathname()).toBe("/settings"));
    await act(async () => connected());
    const instance = await lastInstance();

    // Destroyed once connected: the wallet's keys do not stay.
    await waitFor(() => expect(instance.uniffiDestroy).toHaveBeenCalledTimes(1));
    expect(isWalletConnected()).toBe(false);
    expect(getAccountWalletId()).toBe(TEST_WALLET_ID);
    await fireEvent.press(screen.getByLabelText("Wallet"));
    await waitFor(() => expect(router.getPathname()).toBe("/wallet"));
    expect(screen.getByTestId("wallet-state")).toHaveTextContent("closed");
    // Left on purpose: not a failure.
    expect(screen.queryByTestId("wallet-failure")).toBeNull();
  });

  it("says no failure when the screen is left and shown again while it connects", async () => {
    const { router } = await openWalletScreen();
    let connected!: () => void;
    const connecting = new Promise<void>((resolve) => (connected = resolve));
    const connect = sdk.connect.getMockImplementation()!;
    sdk.connect.mockImplementationOnce(async (...args: unknown[]) => {
      await connecting;
      return connect(...args);
    });

    await fireEvent.press(screen.getByTestId("wallet-open"));
    await waitFor(() => expect(sdk.connect).toHaveBeenCalled());
    // Left (the connection in progress is closed), then shown again before it ends.
    await fireEvent.press(screen.getByLabelText("Settings"));
    await waitFor(() => expect(router.getPathname()).toBe("/settings"));
    await fireEvent.press(screen.getByLabelText("Wallet"));
    await waitFor(() => expect(router.getPathname()).toBe("/wallet"));
    await act(async () => connected());
    const instance = await lastInstance();

    await waitFor(() => expect(instance.uniffiDestroy).toHaveBeenCalledTimes(1));
    await act(async () => undefined);
    expect(screen.queryByTestId("wallet-failure")).toBeNull();

    // This visit opens it again.
    await fireEvent.press(screen.getByTestId("wallet-open"));
    await waitFor(() => expect(screen.getByTestId("wallet-state")).toHaveTextContent("connected"));
  });

  it("does not count a wallet another flow left connected as opened", async () => {
    await openWalletScreen();
    // Stands for a flow that connected the wallet without this screen.
    await act(() => connectWallet(testSeed()));
    expect(isWalletConnected()).toBe(true);
    const other = await lastInstance();
    expect(screen.getByTestId("wallet-state")).toHaveTextContent("closed");

    await fireEvent.press(screen.getByTestId("wallet-open"));

    await waitFor(() => expect(screen.getByTestId("wallet-state")).toHaveTextContent("connected"));
    // Replaced by its own connection, still without the passkey.
    expect(signIn).toHaveBeenCalledTimes(1);
    expect(other.uniffiDestroy).toHaveBeenCalledTimes(1);
    expect(sdk.connect).toHaveBeenCalledTimes(2);
  });

  it("disconnects it in till mode, and drops the account's seed", async () => {
    await openWalletScreen();
    await fireEvent.press(screen.getByTestId("wallet-open"));
    await waitFor(() => expect(screen.getByTestId("wallet-state")).toHaveTextContent("connected"));
    const instance = await lastInstance();

    await fireEvent.press(screen.getByTestId("dock-more"));
    await fireEvent.press(screen.getAllByTestId("till-mode")[0]);

    await waitFor(() => expect(instance.uniffiDestroy).toHaveBeenCalledTimes(1));
    expect(getAccountWalletId()).toBeNull();
    expect(getAccountSeed()).toBeNull();
  });

  it("says why it did not connect, until the next tap or the screen is left", async () => {
    const { router } = await openWalletScreen();
    sdk.connect.mockRejectedValueOnce(new Error("Offline"));

    await fireEvent.press(screen.getByTestId("wallet-open"));
    expect(await screen.findByTestId("wallet-failure")).toHaveTextContent("connectFailed");
    expect(screen.getByTestId("wallet-state")).toHaveTextContent("closed");

    // Left, then shown again: the failure went.
    await fireEvent.press(screen.getByLabelText("Settings"));
    await waitFor(() => expect(router.getPathname()).toBe("/settings"));
    await fireEvent.press(screen.getByLabelText("Wallet"));
    await waitFor(() => expect(router.getPathname()).toBe("/wallet"));
    expect(screen.queryByTestId("wallet-failure")).toBeNull();

    sdk.connect.mockRejectedValueOnce(new Error("Offline"));
    await fireEvent.press(screen.getByTestId("wallet-open"));
    expect(await screen.findByTestId("wallet-failure")).toHaveTextContent("connectFailed");
    // The next tap: connected, the failure gone.
    await fireEvent.press(screen.getByTestId("wallet-open"));
    await waitFor(() => expect(screen.getByTestId("wallet-state")).toHaveTextContent("connected"));
    expect(screen.queryByTestId("wallet-failure")).toBeNull();
    expect(signIn).toHaveBeenCalledTimes(1);
  });
});

describe('"Recovery phrase" (revealRecoveryPhrase)', () => {
  it("gives the phrase of the open account's passkey, without connecting its wallet", async () => {
    await openTestAccount();
    await expect(revealRecoveryPhrase()).resolves.toEqual(TEST_MNEMONIC.split(" "));
    expect(signIn).toHaveBeenCalledTimes(1);
    expect(sdk.connect).not.toHaveBeenCalled();
  });

  it("gives nothing for the passkey of another account", async () => {
    await openTestAccount();
    signIn.mockResolvedValueOnce({ seed: testSeed(OTHER_TEST_MNEMONIC), credentialId: null });
    await expect(revealRecoveryPhrase()).rejects.toMatchObject({ name: "OtherAccountError" });
  });

  it("gives nothing when the prompt is dismissed, nor without an open account", async () => {
    await openTestAccount();
    signIn.mockRejectedValueOnce(new PasskeyError("cancelled", "Dismissed"));
    await expect(revealRecoveryPhrase()).rejects.toMatchObject({ code: "cancelled" });

    closeAccount();
    signIn.mockClear();
    await expect(revealRecoveryPhrase()).rejects.toThrow();
    expect(signIn).not.toHaveBeenCalled();
  });

  it("gives nothing when the account closes during the prompt (till mode)", async () => {
    await openTestAccount();
    signIn.mockImplementationOnce(async () => {
      closeAccount();
      return { seed: testSeed(), credentialId: null };
    });
    await expect(revealRecoveryPhrase()).rejects.toThrow();
  });

  it("says a seed of raw entropy has no phrase to show", async () => {
    const entropy = {
      tag: "Entropy",
      inner: [new Uint8Array(32).fill(5).buffer]
    } as unknown as WalletSeed;
    await openAccount({
      seed: entropy,
      walletId: TEST_WALLET_ID,
      created: false,
      detect: () => Promise.reject(new Error("No sign-up expected")),
      businessNameWord: "Merchant"
    });
    signIn.mockResolvedValueOnce({ seed: entropy, credentialId: null });
    await expect(revealRecoveryPhrase()).rejects.toBeInstanceOf(NoRecoveryPhraseError);
  });
});

describe("the passkey asked again while the account is open", () => {
  /** The bytes of the passkey id the last prompt was pinned to, undefined when not pinned. */
  function pinnedTo(): number[] | undefined {
    const [credentialId] = signIn.mock.lastCall ?? [];
    return credentialId ? Array.from(new Uint8Array(credentialId)) : undefined;
  }

  it("is the passkey that opened the account only, before a payment and for the phrase", async () => {
    await openTestAccount(TEST_WALLET_ID, new Uint8Array([5, 6, 7]).buffer);

    await confirmAccountPasskey({ accountWallet: false });
    expect(pinnedTo()).toEqual([5, 6, 7]);
    await revealRecoveryPhrase();
    expect(pinnedTo()).toEqual([5, 6, 7]);
    expect(signIn).toHaveBeenCalledTimes(2);
  });

  it("is any passkey of the app when the platform did not name the account's", async () => {
    await openTestAccount(TEST_WALLET_ID, null);
    await confirmAccountPasskey({ accountWallet: false });
    expect(signIn).toHaveBeenLastCalledWith(undefined);
  });

  it("still refuses another account's seed: the pin only narrows the prompt", async () => {
    await openTestAccount(TEST_WALLET_ID, new Uint8Array([5]).buffer);
    signIn.mockResolvedValueOnce({
      seed: testSeed(OTHER_TEST_MNEMONIC),
      credentialId: new Uint8Array([5]).buffer
    });
    await expect(confirmAccountPasskey({ accountWallet: false })).rejects.toMatchObject({
      name: "OtherAccountError"
    });
  });

  it("is never the passkey of an account closed since", async () => {
    await openTestAccount(TEST_WALLET_ID, new Uint8Array([5]).buffer);
    closeAccount();
    expect(getAccountCredentialId()).toBeNull();
    await openTestAccount(TEST_WALLET_ID);
    expect(getAccountCredentialId()).toBeNull();
    await revealRecoveryPhrase();
    expect(signIn).toHaveBeenLastCalledWith(undefined);
  });

  it("keeps its own copy of the id: neither the caller's buffer nor a reader can change it", async () => {
    const given = new Uint8Array([5, 6]);
    await openTestAccount(TEST_WALLET_ID, given.buffer);
    given.fill(0);
    const read = getAccountCredentialId();
    if (!read) throw new Error("The account keeps the passkey's id");
    new Uint8Array(read).fill(9);

    await confirmAccountPasskey({ accountWallet: false });
    expect(pinnedTo()).toEqual([5, 6]);
  });
});
