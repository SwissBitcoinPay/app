import "@/i18n";

import { Stack } from "expo-router";
import { act, fireEvent, renderRouter, screen, waitFor } from "expo-router/testing-library";
import { Platform } from "react-native";

import WelcomeScreen from "@/app/index";
import NoAccountScreen from "@/app/no-account";
import BankScreen from "@/app/onboarding/bank";
import CardScreen from "@/app/onboarding/card";
import OnboardingLayout from "@/app/onboarding/_layout";
import SetupScreen from "@/app/onboarding/setup";
import SplitScreen from "@/app/onboarding/split";
import PendingScreen from "@/app/pending";
import { DEFAULT_RELAYS as BACKUP_RELAYS } from "@/config/relays";
import * as detection from "@/features/account/detection";
import { getAccountCredentialId, getAccountSettings } from "@/features/account/session";
import { deriveBackupKeys } from "@/lib/backup/keys";
import { backupEvent, publishBackup } from "@/lib/backup/settings-backup";
import { PasskeyError, WalletError } from "@/lib/breez/errors";
import { createPasskeyWallet, signInWithPasskey } from "@/lib/breez/passkey";
import { walletSecret } from "@/lib/breez/seed";
import type { WalletSeed } from "@/lib/breez/types";
import { createImage } from "@/lib/media/image";
import {
  checkWalletConfig,
  connectWallet,
  disconnectWallet,
  getWalletId,
  getWalletLightningAddress,
  walletIdOf
} from "@/lib/breez/wallet";
import { unixSeconds, type MerchantSettings } from "@/lib/settings/merchant";
import { currentRelays } from "@/lib/relays/current";
import { loadMerchantSettings, saveMerchantSettings } from "@/lib/settings/store";
import { loadTerminalProfile, saveTerminalProfile } from "@/lib/terminal/profile";

import { OTHER_TEST_MNEMONIC, testSeed } from "../../jest/account";
import type * as FileSystemFake from "../../jest/expo-file-system";
import type * as RelaysFake from "../../jest/nostr-relays";

jest.mock("../lib/breez/passkey", () => ({
  createPasskeyWallet: jest.fn(),
  preparePasskeys: jest.fn(async () => undefined),
  passkeysReady: jest.fn(() => true),
  signInWithPasskey: jest.fn()
}));
jest.mock("../lib/breez/wallet", () => ({
  checkWalletConfig: jest.fn(),
  connectWallet: jest.fn(),
  disconnectWallet: jest.fn(),
  getWalletId: jest.fn(),
  getWalletLightningAddress: jest.fn(),
  newDepositAddress: jest.fn(),
  walletIdOf: jest.fn()
}));

const create = jest.mocked(createPasskeyWallet);
const signIn = jest.mocked(signInWithPasskey);
const connect = jest.mocked(connectWallet);
const disconnect = jest.mocked(disconnectWallet);
const checkConfig = jest.mocked(checkWalletConfig);
const walletId = jest.mocked(getWalletId);
const idOf = jest.mocked(walletIdOf);
const lightningAddress = jest.mocked(getWalletLightningAddress);

// The in-memory expo-file-system and Nostr relays of jest.setup.ts.
const fileSystem = jest.requireMock<typeof FileSystemFake>("expo-file-system");
const relays = jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");

// Two wallets: one created here, one signed in to (wallet ids: public keys of the keys 2 and 3).
const createdSeed = testSeed();
const signedInSeed = testSeed(OTHER_TEST_MNEMONIC);
const CREATED_WALLET = "02c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5";
const SIGNED_IN_WALLET = "02f9308a019258c31049344f85f89d5229b531c845836f99b08601f113bce036f9";
const signedInKeys = deriveBackupKeys(walletSecret(signedInSeed));

/**
 * Settings of the signed-in wallet, sign-up done at 100 % bitcoin. Dated an hour ago, never a
 * fixed date: a backup unchanged for 30 days is dated again at sign-in (session.ts, reconcile).
 */
const finished: MerchantSettings = {
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
  updatedAt: unixSeconds() - 3600,
  signUp: "done",
  businessName: "Merchant 36F9",
  usage: "merchant",
  bitcoinPercent: 100,
  payoutCurrency: "EUR",
  displayCurrency: "EUR",
  detectedCountry: "FR",
  payoutAccountId: null,
  onchainPayments: true,
  relays: [...BACKUP_RELAYS],
  devices: [],
  logo: null
};

const routes = {
  index: WelcomeScreen,
  "no-account": NoAccountScreen,
  pending: PendingScreen,
  // The point of sale itself is covered by pos-flow.test.tsx, "Cards" by cards-screen.test.tsx:
  // here, where the login leads.
  "pos/index": PendingScreen,
  "cards/index": PendingScreen,
  "onboarding/_layout": OnboardingLayout,
  "onboarding/split": SplitScreen,
  "onboarding/bank": BankScreen,
  "onboarding/card": CardScreen,
  "onboarding/setup": SetupScreen
};

const PASSKEY_WARNING =
  "Your passkey is the key to your wallet: deleting it can make your funds inaccessible.";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function bytesOf(buffer: ArrayBuffer | null): number[] | null {
  return buffer ? Array.from(new Uint8Array(buffer)) : null;
}

function isDisabled(testID: string): boolean {
  return screen.getByTestId(testID).props.accessibilityState?.disabled === true;
}

async function renderWelcome() {
  const router = await renderRouter(routes, { initialUrl: "/" });
  // RNTL 14 renders asynchronously; the router helpers live on the returned promise, which must
  // not be returned as is (an async function would unwrap it).
  return { router };
}

describe("account creation and login with a passkey", () => {
  beforeEach(() => {
    // Not jest.resetAllMocks(): it would also reset the mocks of jest.setup.ts.
    for (const mock of [
      create,
      signIn,
      connect,
      disconnect,
      checkConfig,
      walletId,
      idOf,
      lightningAddress
    ]) {
      mock.mockReset();
    }
    lightningAddress.mockResolvedValue("sattleme02f9308a01@breez.tips");
    create.mockResolvedValue({ seed: createdSeed, credentialId: null });
    signIn.mockResolvedValue({ seed: signedInSeed, credentialId: null });
    connect.mockImplementation(async (seed) => {
      walletId.mockResolvedValue(seed === createdSeed ? CREATED_WALLET : SIGNED_IN_WALLET);
      return {} as never;
    });
    // The account's id, derived from the seed without connecting its wallet (walletIdOf): the
    // connected wallet's (getWalletId), as the SDK gives both (recovery-phrase-sdk.test.ts). A test
    // that holds getWalletId's answer holds this one.
    idOf.mockImplementation(async (seed) => {
      walletId.mockResolvedValue(seed === createdSeed ? CREATED_WALLET : SIGNED_IN_WALLET);
      return walletId();
    });
    disconnect.mockResolvedValue(undefined);
    fileSystem.resetFileSystem();
    relays.resetRelays();
    // Failures are logged in development builds.
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  it("creates the passkey, names its account without opening any wallet, then opens its split", async () => {
    const { router } = await renderWelcome();

    await fireEvent.press(screen.getByTestId("create-account"));

    // A merchant's account ("Create my account").
    await waitFor(() => expect(router.getPathname()).toBe("/onboarding/split"));
    await expect(loadMerchantSettings(CREATED_WALLET)).resolves.toMatchObject({
      usage: "merchant",
      signUp: "split",
      businessName: "Merchant 9EE5",
      payoutCurrency: "CHF"
    });
    // A new wallet has no backup to look for: the relays are only written to.
    expect(relays.calls.every(({ operation }) => operation === "publish")).toBe(true);
    expect(create).toHaveBeenCalledTimes(1);
    expect(signIn).not.toHaveBeenCalled();
    // Any wallet still open is closed first; the new account's own is never connected before its
    // usage is known (a card holder's never is).
    expect(disconnect.mock.invocationCallOrder[0]).toBeLessThan(idOf.mock.invocationCallOrder[0]);
    expect(idOf).toHaveBeenCalledWith(createdSeed);
    expect(connect).not.toHaveBeenCalled();
  });

  it("detects the payout currency as soon as the passkey is created, while the account opens", async () => {
    const detect = jest.spyOn(detection, "detectSignUpLocation");
    const named = deferred<string>();
    idOf.mockImplementationOnce(() => named.promise);
    const { router } = await renderWelcome();

    await fireEvent.press(screen.getByTestId("create-account"));

    await waitFor(() => expect(detect).toHaveBeenCalledTimes(1));
    expect(screen.getByText("Preparing your account…")).toBeTruthy();
    named.resolve(CREATED_WALLET);
    await waitFor(() => expect(router.getPathname()).toBe("/onboarding/split"));
    // Not again when the account opens.
    expect(detect).toHaveBeenCalledTimes(1);
    detect.mockRestore();
  });

  it("opens the point of sale at launch, without a passkey, on a device prepared for it", async () => {
    await saveTerminalProfile({
      version: 2,
      walletId: SIGNED_IN_WALLET,
      backupKey: signedInKeys.publicKey,
      lightningAddress: "sattleme02f9308a01@breez.tips",
      businessName: "Merchant 36F9",
      currency: "EUR"
    });
    const router = await renderRouter(routes, { initialUrl: "/" });

    await waitFor(() => expect(router.getPathname()).toBe("/pos"));
    expect(signIn).not.toHaveBeenCalled();
    expect(connect).not.toHaveBeenCalled();
  });

  it("says so, and retries without a new passkey prompt, when the point of sale cannot be prepared", async () => {
    await saveMerchantSettings(SIGNED_IN_WALLET, finished);
    lightningAddress.mockRejectedValueOnce(new Error("Offline"));
    const { router } = await renderWelcome();

    await fireEvent.press(screen.getByTestId("login"));
    expect(
      await screen.findByText(
        "Your point of sale could not be prepared. Check your internet connection, then try again."
      )
    ).toBeTruthy();
    expect(router.getPathname()).toBe("/");

    await fireEvent.press(screen.getByTestId("login"));
    await waitFor(() => expect(router.getPathname()).toBe("/pos"));
    expect(signIn).toHaveBeenCalledTimes(1);
  });

  it("logs in with a passkey, then opens the app once the sign-up is done", async () => {
    await saveMerchantSettings(SIGNED_IN_WALLET, finished);
    const { router } = await renderWelcome();

    await fireEvent.press(screen.getByTestId("login"));

    await waitFor(() => expect(router.getPathname()).toBe("/pos"));
    expect(signIn).toHaveBeenCalledWith();
    expect(create).not.toHaveBeenCalled();
    expect(connect).toHaveBeenCalledWith(signedInSeed);
    // This device can now take payments without a passkey.
    await expect(loadTerminalProfile()).resolves.toEqual({
      version: 2,
      walletId: SIGNED_IN_WALLET,
      backupKey: signedInKeys.publicKey,
      lightningAddress: "sattleme02f9308a01@breez.tips",
      businessName: "Merchant 36F9",
      currency: "EUR"
    });
    expect(lightningAddress).toHaveBeenCalledWith(SIGNED_IN_WALLET, "Merchant 36F9");
    // Then the wallet goes: neither the point of sale nor the unlocked app needs its keys.
    expect(disconnect.mock.invocationCallOrder.at(-1)).toBeGreaterThan(
      lightningAddress.mock.invocationCallOrder.at(-1) ?? Infinity
    );
    // The device's settings, missing from the relays, are backed up again.
    await waitFor(() =>
      expect(BACKUP_RELAYS.map((relay) => relays.stored.get(relay)?.length)).toEqual(
        BACKUP_RELAYS.map(() => 1)
      )
    );
  });

  it('logs in a card holder whose sign-up is done on "Cards"', async () => {
    await saveMerchantSettings(SIGNED_IN_WALLET, { ...finished, usage: "card" });
    const { router } = await renderWelcome();

    await fireEvent.press(screen.getByTestId("login"));

    // What they chose to do: "Cards". No main wallet, nor point
    // of sale: the wallet never connected, no Lightning address,
    // this device prepared as a card holder's.
    await waitFor(() => expect(router.getPathname()).toBe("/cards"));
    await expect(loadTerminalProfile()).resolves.toEqual({
      version: 4,
      walletId: SIGNED_IN_WALLET,
      backupKey: signedInKeys.publicKey,
      businessName: "Merchant 36F9",
      currency: "EUR"
    });
    expect(connect).not.toHaveBeenCalled();
    expect(lightningAddress).not.toHaveBeenCalled();
    expect(screen.queryByText("Preparing your point of sale…")).toBeNull();
  });

  it("shows only the logo and what is being done while logging in", async () => {
    await saveMerchantSettings(SIGNED_IN_WALLET, finished);
    const passkey = deferred<{ seed: WalletSeed; credentialId: null }>();
    signIn.mockReturnValueOnce(passkey.promise);
    const { router } = await renderWelcome();

    await fireEvent.press(screen.getByTestId("login"));

    expect(screen.getByTestId("login-loading")).toBeTruthy();
    expect(screen.getByLabelText("sattle.me")).toBeTruthy();
    expect(screen.getByTestId("login-spinner", { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByRole("progressbar", { name: "Signing in with your passkey…" })).toBeTruthy();
    expect(screen.getByText("Signing in with your passkey…")).toBeTruthy();
    // Nothing else of the welcome screen.
    for (const id of ["create-account", "login", "join-team", "advanced-settings", "version"]) {
      expect(screen.queryByTestId(id)).toBeNull();
    }
    expect(screen.queryByText(PASSKEY_WARNING)).toBeNull();

    // Each step in turn, on the same screen.
    const id = deferred<string>();
    walletId.mockReturnValueOnce(id.promise);
    passkey.resolve({ seed: signedInSeed, credentialId: null });
    expect(await screen.findByText("Retrieving your settings…")).toBeTruthy();
    // The business is not known yet.
    expect(screen.queryByTestId("login-business")).toBeNull();
    const address = deferred<string>();
    lightningAddress.mockReturnValueOnce(address.promise);
    id.resolve(SIGNED_IN_WALLET);
    expect(await screen.findByText("Preparing your point of sale…")).toBeTruthy();
    expect(screen.queryByTestId("login")).toBeNull();
    address.resolve("sattleme02f9308a01@breez.tips");
    await waitFor(() => expect(router.getPathname()).toBe("/pos"));
  });

  it("shows the business once its settings are known: its name, the shop's icon without a logo", async () => {
    await saveMerchantSettings(SIGNED_IN_WALLET, finished);
    const address = deferred<string>();
    lightningAddress.mockReturnValueOnce(address.promise);
    const { router } = await renderWelcome();

    await fireEvent.press(screen.getByTestId("login"));

    expect(await screen.findByText("Preparing your point of sale…")).toBeTruthy();
    expect(screen.getByTestId("login-business")).toBeTruthy();
    expect(screen.getByText("Merchant 36F9")).toBeTruthy();
    expect(
      screen.getByTestId("login-business-store", { includeHiddenElements: true })
    ).toBeTruthy();
    expect(screen.queryByTestId("login-business-logo", { includeHiddenElements: true })).toBeNull();
    // Still the spinner and what is being done.
    expect(screen.getByRole("progressbar", { name: "Preparing your point of sale…" })).toBeTruthy();
    address.resolve("sattleme02f9308a01@breez.tips");
    await waitFor(() => expect(router.getPathname()).toBe("/pos"));
  });

  it("shows the business's name alone where its icon does not fit above the spinner", async () => {
    await saveMerchantSettings(SIGNED_IN_WALLET, finished);
    const address = deferred<string>();
    lightningAddress.mockReturnValueOnce(address.promise);
    const { router } = await renderWelcome();

    await fireEvent.press(screen.getByTestId("login"));
    expect(await screen.findByText("Preparing your point of sale…")).toBeTruthy();
    const layout = (height: number) => ({
      nativeEvent: { layout: { x: 0, y: 0, width: 300, height } }
    });
    await fireEvent(screen.getByText("Merchant 36F9"), "layout", layout(26));
    // Room for the icon (72), the gap (12), the name and the margin (32).
    await fireEvent(screen.getByTestId("login-business-room"), "layout", layout(142));
    expect(
      screen.getByTestId("login-business-store", { includeHiddenElements: true })
    ).toBeTruthy();
    // A short screen (a phone's web app in landscape): never half an icon.
    await fireEvent(screen.getByTestId("login-business-room"), "layout", layout(141));
    expect(
      screen.queryByTestId("login-business-store", { includeHiddenElements: true })
    ).toBeNull();
    expect(screen.getByText("Merchant 36F9")).toBeTruthy();
    address.resolve("sattleme02f9308a01@breez.tips");
    await waitFor(() => expect(router.getPathname()).toBe("/pos"));
  });

  it("shows the business's logo, read on the account's relays", async () => {
    const { ref, event } = createImage(new Uint8Array(500).fill(7), finished.updatedAt);
    for (const relay of finished.relays) relays.stored.set(relay, [event]);
    await saveMerchantSettings(SIGNED_IN_WALLET, { ...finished, logo: ref });
    const address = deferred<string>();
    lightningAddress.mockReturnValueOnce(address.promise);
    const { router } = await renderWelcome();

    await fireEvent.press(screen.getByTestId("login"));

    expect(
      await screen.findByTestId("login-business-logo-image", { includeHiddenElements: true })
    ).toBeTruthy();
    expect(
      screen.queryByTestId("login-business-store", { includeHiddenElements: true })
    ).toBeNull();
    expect(screen.getByText("Merchant 36F9")).toBeTruthy();
    address.resolve("sattleme02f9308a01@breez.tips");
    await waitFor(() => expect(router.getPathname()).toBe("/pos"));
  });

  it("keeps its loading screen under the sign-up, and shows the welcome screen again on return", async () => {
    // A sign-up saved before any step (an earlier version's), on another device: its split.
    await publishBackup({ ...finished, signUp: "usage" }, signedInKeys);
    // A stack, as the app's root layout: the welcome screen stays mounted under the steps.
    const router = await renderRouter(
      { ...routes, _layout: () => <Stack screenOptions={{ headerShown: false }} /> },
      { initialUrl: "/" }
    );

    await fireEvent.press(screen.getByTestId("login"));
    await waitFor(() => expect(router.getPathname()).toBe("/onboarding/split"));
    // Never the welcome again under the step's transition.
    expect(screen.queryByTestId("login-loading", { includeHiddenElements: true })).toBeTruthy();
    expect(screen.queryByTestId("login", { includeHiddenElements: true })).toBeNull();
    // A sign-up not done: its generated name is not shown as the business.
    expect(screen.queryByTestId("login-business", { includeHiddenElements: true })).toBeNull();

    await fireEvent.press(screen.getByRole("button", { name: "Back" }));
    expect(router.getPathname()).toBe("/");
    expect(await screen.findByTestId("login")).toBeTruthy();
    expect(screen.queryByTestId("login-loading")).toBeNull();
    expect(isDisabled("login")).toBe(false);
  });

  it("shows the welcome screen under the sign-up once covered, for a back swipe", async () => {
    await publishBackup({ ...finished, signUp: "usage" }, signedInKeys);
    const router = await renderRouter(
      { ...routes, _layout: () => <Stack screenOptions={{ headerShown: false }} /> },
      { initialUrl: "/" }
    );

    await fireEvent.press(screen.getByTestId("login"));
    await waitFor(() => expect(router.getPathname()).toBe("/onboarding/split"));
    // The step's transition is over: react-native-screens says the welcome screen disappeared.
    let welcome = screen.getByTestId("login-loading", { includeHiddenElements: true }).parent;
    while (welcome && welcome.type !== "RNSScreen") welcome = welcome.parent;
    if (!welcome) throw new Error("No native screen around the welcome screen");
    await fireEvent(welcome, "disappear", { nativeEvent: {} });

    // Still under the step, the welcome itself: a back swipe uncovers it, not a loading.
    expect(router.getPathname()).toBe("/onboarding/split");
    expect(screen.queryByTestId("login-loading", { includeHiddenElements: true })).toBeNull();
    expect(screen.getByTestId("login", { includeHiddenElements: true })).toBeTruthy();
  });

  it("restores the settings of its backup on a new device", async () => {
    await publishBackup(finished, signedInKeys);
    const answer = deferred<void>();
    const query = relays.queryEvents;
    const slow = jest.spyOn(relays, "queryEvents").mockImplementationOnce(async (...args) => {
      await answer.promise;
      return query(...args);
    });
    const { router } = await renderWelcome();

    await fireEvent.press(screen.getByTestId("login"));

    expect(await screen.findByText("Retrieving your settings…")).toBeTruthy();
    answer.resolve();
    await waitFor(() => expect(router.getPathname()).toBe("/pos"));
    slow.mockRestore();
    await expect(loadMerchantSettings(SIGNED_IN_WALLET)).resolves.toEqual(finished);
  });

  it("opens the device's settings first, then takes a newer backup in the background", async () => {
    const older = { ...finished, signUp: "split", updatedAt: finished.updatedAt - 100 } as const;
    await saveMerchantSettings(SIGNED_IN_WALLET, older);
    await publishBackup(finished, signedInKeys);
    const { router } = await renderWelcome();

    await fireEvent.press(screen.getByTestId("login"));

    // Without waiting for the relays: the step the device's copy stopped at.
    await waitFor(() => expect(router.getPathname()).toBe("/onboarding/split"));
    // Another device finished the sign-up meanwhile: the device's copy follows, silently.
    await waitFor(() => expect(getAccountSettings()).toEqual(finished));
    await expect(loadMerchantSettings(SIGNED_IN_WALLET)).resolves.toEqual(finished);
  });

  /** Holds every relay's answer until `answer.resolve()`. Restore with `slow.mockRestore()`. */
  function slowRelays() {
    const answer = deferred<void>();
    const query = relays.queryEvents;
    const slow = jest.spyOn(relays, "queryEvents").mockImplementation(async (...args) => {
      await answer.promise;
      return query(...args);
    });
    return { answer, slow };
  }

  /** The device's copy: the sign-up stopped at the split, all in bitcoin. */
  const atSplit = { ...finished, signUp: "split", updatedAt: finished.updatedAt - 100 } as const;

  it("saves a step once the relays answered at sign-in", async () => {
    await saveMerchantSettings(SIGNED_IN_WALLET, atSplit);
    // The same settings, dated again by another device: not a change.
    await publishBackup({ ...atSplit, updatedAt: finished.updatedAt }, signedInKeys);
    const { answer, slow } = slowRelays();
    try {
      const { router } = await renderWelcome();
      await fireEvent.press(screen.getByTestId("login"));
      await waitFor(() => expect(router.getPathname()).toBe("/onboarding/split"));

      await fireEvent.press(screen.getByTestId("split-continue"));
      expect(isDisabled("split-continue")).toBe(true);
      expect(router.getPathname()).toBe("/onboarding/split");
      answer.resolve();

      await waitFor(() => expect(router.getPathname()).toBe("/pos"));
    } finally {
      slow.mockRestore();
    }
    await expect(loadMerchantSettings(SIGNED_IN_WALLET)).resolves.toMatchObject({
      signUp: "done",
      bitcoinPercent: 100
    });
  });

  it("never saves a step over another device's change: goes where the account now stands", async () => {
    await saveMerchantSettings(SIGNED_IN_WALLET, atSplit);
    // Meanwhile, another device chose 60 % in fiat.
    const elsewhere = { ...finished, signUp: "bank", bitcoinPercent: 40 } as const;
    await publishBackup(elsewhere, signedInKeys);
    const { answer, slow } = slowRelays();
    try {
      const { router } = await renderWelcome();
      await fireEvent.press(screen.getByTestId("login"));
      await waitFor(() => expect(router.getPathname()).toBe("/onboarding/split"));
      expect(screen.getByTestId("split-slider").props.accessibilityValue.now).toBe(100);

      // "Start accepting payments" with the device's stale answers.
      await fireEvent.press(screen.getByTestId("split-continue"));
      answer.resolve();

      await waitFor(() => expect(router.getPathname()).toBe("/onboarding/bank"));
      expect(screen.getByText("60%")).toBeTruthy();
      // "Back" leads to the steps before it, with the other device's answers.
      await fireEvent.press(screen.getByRole("button", { name: "Back" }));
      expect(router.getPathname()).toBe("/onboarding/split");
      expect(screen.getByTestId("split-slider").props.accessibilityValue.now).toBe(40);
      await fireEvent.press(screen.getByRole("button", { name: "Back" }));
      expect(router.getPathname()).toBe("/");
    } finally {
      slow.mockRestore();
    }
    await expect(loadMerchantSettings(SIGNED_IN_WALLET)).resolves.toEqual(elsewhere);
  });

  it("prepares the point of sale on the setup screen when another device finished the sign-up", async () => {
    await saveMerchantSettings(SIGNED_IN_WALLET, atSplit);
    // Meanwhile, another device finished it, with another payout currency.
    const elsewhere = { ...finished, payoutCurrency: "CHF", displayCurrency: "CHF" } as const;
    await publishBackup(elsewhere, signedInKeys);
    const { answer, slow } = slowRelays();
    try {
      const { router } = await renderWelcome();
      await fireEvent.press(screen.getByTestId("login"));
      await waitFor(() => expect(router.getPathname()).toBe("/onboarding/split"));

      // "Start accepting payments" with the device's stale answers.
      await fireEvent.press(screen.getByTestId("split-continue"));
      answer.resolve();

      await waitFor(() => expect(router.getPathname()).toBe("/pos"));
    } finally {
      slow.mockRestore();
    }
    // Nothing saved over the other device's answers; the point of sale follows them.
    await expect(loadMerchantSettings(SIGNED_IN_WALLET)).resolves.toEqual(elsewhere);
    await expect(loadTerminalProfile()).resolves.toMatchObject({
      walletId: SIGNED_IN_WALLET,
      currency: "CHF"
    });
  });

  it("saves nothing from a step left while its save waited for the relays", async () => {
    await saveMerchantSettings(SIGNED_IN_WALLET, atSplit);
    const { answer, slow } = slowRelays();
    try {
      const { router } = await renderWelcome();
      await fireEvent.press(screen.getByTestId("login"));
      await waitFor(() => expect(router.getPathname()).toBe("/onboarding/split"));

      await fireEvent.press(screen.getByTestId("split-continue"));
      await fireEvent.press(screen.getByRole("button", { name: "Back" }));
      expect(router.getPathname()).toBe("/");
      answer.resolve();
      await waitFor(() =>
        expect(BACKUP_RELAYS.map((relay) => relays.stored.get(relay)?.length)).toEqual(
          BACKUP_RELAYS.map(() => 1)
        )
      );

      expect(router.getPathname()).toBe("/");
    } finally {
      slow.mockRestore();
    }
    await expect(loadMerchantSettings(SIGNED_IN_WALLET)).resolves.toEqual(atSplit);
  });

  it("ignores a damaged copy from a relay", async () => {
    const [damaged, ...others] = BACKUP_RELAYS;
    await publishBackup(finished, signedInKeys, others);
    // A newer copy whose content was changed after it was signed.
    const newer = backupEvent({ ...finished, updatedAt: finished.updatedAt + 60 }, signedInKeys);
    relays.stored.set(damaged, [{ ...newer, content: `${newer.content.slice(0, -2)}00` }]);
    const { router } = await renderWelcome();

    await fireEvent.press(screen.getByTestId("login"));

    await waitFor(() => expect(router.getPathname()).toBe("/pos"));
    await expect(loadMerchantSettings(SIGNED_IN_WALLET)).resolves.toEqual(finished);
  });

  it("resumes an unfinished sign-up at its step, after the steps before it", async () => {
    await publishBackup(
      { ...finished, signUp: "bank", bitcoinPercent: 40, payoutCurrency: "CHF" },
      signedInKeys
    );
    const { router } = await renderWelcome();

    await fireEvent.press(screen.getByTestId("login"));

    await waitFor(() => expect(router.getPathname()).toBe("/onboarding/bank"));
    expect(screen.getByText("60%")).toBeTruthy();
    // "Back" leads to the previous steps of the path.
    await fireEvent.press(screen.getByRole("button", { name: "Back" }));
    expect(router.getPathname()).toBe("/onboarding/split");
    await fireEvent.press(screen.getByRole("button", { name: "Back" }));
    expect(router.getPathname()).toBe("/");
  });

  describe('"No account found"', () => {
    const OWN = "wss://relay.bakery.example";

    it("never starts a sign-up for a passkey whose account is on none of the device's relays", async () => {
      const detect = jest.spyOn(detection, "detectSignUpLocation");
      const { router } = await renderWelcome();

      await fireEvent.press(screen.getByTestId("login"));

      await waitFor(() => expect(router.getPathname()).toBe("/no-account"));
      expect(screen.getByText("No account found")).toBeTruthy();
      expect(
        screen.getByText("No account is linked to this passkey on the Nostr relays below.")
      ).toBeTruthy();
      expect(
        screen.getByText(
          "Did you choose custom relays for your account? Add them, save, then tap “Log in”. If you have several passkeys, also check that you chose the right one."
        )
      ).toBeTruthy();
      // The relays looked on, to be changed.
      for (const relay of BACKUP_RELAYS) expect(screen.getByText(relay)).toBeTruthy();
      // Nothing of a new account: no settings, no backup, no payout currency looked up.
      await expect(loadMerchantSettings(SIGNED_IN_WALLET)).resolves.toBeNull();
      expect([...relays.stored.values()].flat()).toEqual([]);
      expect(detect).not.toHaveBeenCalled();
      expect(getAccountSettings()).toBeNull();
      detect.mockRestore();
    });

    it("says the relays did not answer, never that no account exists", async () => {
      for (const relay of BACKUP_RELAYS) relays.unreachable.add(relay);
      const { router } = await renderWelcome();

      await fireEvent.press(screen.getByTestId("login"));

      await waitFor(() => expect(router.getPathname()).toBe("/no-account"));
      expect(screen.getByText("Relays unreachable")).toBeTruthy();
      expect(
        screen.getByText(
          "None of the Nostr relays below answered: there is no way to tell whether an account is linked to this passkey. Check your internet connection."
        )
      ).toBeTruthy();
      expect(screen.queryByText("No account found")).toBeNull();
      await expect(loadMerchantSettings(SIGNED_IN_WALLET)).resolves.toBeNull();
    });

    it("says that relays which did not answer were not read", async () => {
      relays.unreachable.add(BACKUP_RELAYS[0]);
      const { router } = await renderWelcome();

      await fireEvent.press(screen.getByTestId("login"));

      await waitFor(() => expect(router.getPathname()).toBe("/no-account"));
      expect(
        screen.getByText(
          "No account is linked to this passkey on the Nostr relays below that answered. Others did not answer: “Test the connection” shows which."
        )
      ).toBeTruthy();
    });

    it("finds the account on the relays added, with the passkey asked again", async () => {
      // The account lives on its own relay only, which the device was not told of.
      await publishBackup({ ...finished, relays: [OWN] }, signedInKeys, [OWN]);
      const { router } = await renderWelcome();

      await fireEvent.press(screen.getByTestId("login"));
      await waitFor(() => expect(router.getPathname()).toBe("/no-account"));
      await fireEvent.press(screen.getByTestId("add-relay"));
      await fireEvent.changeText(
        await screen.findByTestId("relay-address"),
        "relay.bakery.example"
      );
      await fireEvent.press(screen.getByTestId("add-relay-confirm"));
      await act(async () => {
        await fireEvent.press(screen.getByTestId("save-relays"));
      });

      // Back on the welcome screen, without a failure: "Log in" looks on the new list.
      await waitFor(() => expect(router.getPathname()).toBe("/"));
      expect(currentRelays()).toEqual([...BACKUP_RELAYS, OWN]);
      expect(screen.queryByText("Something went wrong. Try again.")).toBeNull();
      await fireEvent.press(screen.getByTestId("login"));

      await waitFor(() => expect(router.getPathname()).toBe("/pos"));
      // No seed was kept meanwhile: the passkey was asked again (another one could be chosen).
      expect(signIn).toHaveBeenCalledTimes(2);
      // The account's relays become the device's.
      expect(currentRelays()).toEqual([OWN]);
    });

    it("goes back to the welcome screen, without a failure", async () => {
      const { router } = await renderWelcome();
      await fireEvent.press(screen.getByTestId("login"));
      await waitFor(() => expect(router.getPathname()).toBe("/no-account"));

      await fireEvent.press(screen.getByTestId("no-account-back"));

      await waitFor(() => expect(router.getPathname()).toBe("/"));
      expect(screen.queryByText("Something went wrong. Try again.")).toBeNull();
      expect(isDisabled("login")).toBe(false);
    });

    it("says nothing without a login that found no account", async () => {
      const router = await renderRouter(routes, { initialUrl: "/no-account" });

      await waitFor(() => expect(router.getPathname()).toBe("/"));
      expect(screen.getByTestId("login")).toBeTruthy();
    });
  });

  it("opens the device's settings while no relay answers", async () => {
    await saveMerchantSettings(SIGNED_IN_WALLET, finished);
    for (const relay of BACKUP_RELAYS) relays.unreachable.add(relay);
    const { router } = await renderWelcome();

    await fireEvent.press(screen.getByTestId("login"));

    await waitFor(() => expect(router.getPathname()).toBe("/pos"));
  });

  it("never replaces settings saved by a newer version of the app", async () => {
    await saveMerchantSettings(SIGNED_IN_WALLET, finished);
    // The settings' file, not another the app wrote meanwhile (its journal, src/lib/log/).
    const file = [...fileSystem.files.keys()].find((uri) => uri.includes("/merchant-settings/"));
    if (!file) throw new Error("No settings saved");
    fileSystem.files.set(file, JSON.stringify({ ...finished, version: finished.version + 1 }));
    await renderWelcome();

    await fireEvent.press(screen.getByTestId("login"));

    expect(
      await screen.findByText(
        "Your settings were saved by a newer version of the app. Update the app, then try again."
      )
    ).toBeTruthy();
    expect(JSON.parse(fileSystem.files.get(file) ?? "")).toMatchObject({
      version: finished.version + 1
    });
  });

  it("tells what is going on and ignores taps until done", async () => {
    const passkey = deferred<{ seed: WalletSeed; credentialId: null }>();
    create.mockReturnValueOnce(passkey.promise);
    const { router } = await renderWelcome();

    await fireEvent.press(screen.getByTestId("create-account"));

    expect(screen.getByText("Creating your passkey…")).toBeTruthy();
    // Only a login replaces the welcome screen with its loading screen.
    expect(screen.queryByTestId("login-loading")).toBeNull();
    expect(isDisabled("create-account")).toBe(true);
    expect(isDisabled("login")).toBe(true);
    await fireEvent.press(screen.getByTestId("create-account"));
    expect(create).toHaveBeenCalledTimes(1);

    // Then the new account is saved: its wallet id comes first.
    const id = deferred<string>();
    walletId.mockReturnValueOnce(id.promise);
    passkey.resolve({ seed: createdSeed, credentialId: null });
    expect(await screen.findByText("Preparing your account…")).toBeTruthy();
    expect(isDisabled("login")).toBe(true);
    id.resolve(CREATED_WALLET);
    await waitFor(() => expect(router.getPathname()).toBe("/onboarding/split"));
  });

  it("stays on the welcome screen with a notification when the prompt is dismissed", async () => {
    create.mockRejectedValueOnce(new PasskeyError("cancelled", "Cancelled"));
    const { router } = await renderWelcome();

    await fireEvent.press(screen.getByTestId("create-account"));

    const notification = await screen.findByTestId("notification");
    expect(notification.props.role).toBe("status");
    expect(screen.getByText("Passkey cancelled")).toBeTruthy();
    expect(screen.getByText("Tap the button again to retry")).toBeTruthy();
    // Not a failure: no message above the buttons.
    expect(screen.queryByText("Passkey cancelled. Tap the button again to retry.")).toBeNull();
    expect(router.getPathname()).toBe("/");
    expect(connect).not.toHaveBeenCalled();
    // Never retried on its own: the next attempt waits for a tap.
    expect(create).toHaveBeenCalledTimes(1);
    expect(isDisabled("create-account")).toBe(false);

    // Gone at the next tap, while its prompt shows.
    let dismissAgain: (error: Error) => void = () => undefined;
    create.mockReturnValueOnce(new Promise((_, reject) => (dismissAgain = reject)));
    await fireEvent.press(screen.getByTestId("create-account"));
    await waitFor(() => expect(screen.queryByTestId("notification")).toBeNull());
    expect(await screen.findByText("Creating your passkey…")).toBeTruthy();

    // Dismissed again: the notification shows again.
    dismissAgain(new PasskeyError("cancelled", "Cancelled again"));
    expect(await screen.findByText("Passkey cancelled")).toBeTruthy();
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("leaves the login's loading screen with a notification when its prompt is dismissed", async () => {
    let dismissPrompt: (error: Error) => void = () => undefined;
    signIn.mockReturnValueOnce(new Promise((_, reject) => (dismissPrompt = reject)));
    const { router } = await renderWelcome();

    await fireEvent.press(screen.getByTestId("login"));
    expect(screen.getByTestId("login-loading")).toBeTruthy();

    dismissPrompt(new PasskeyError("cancelled", "Dismissed"));
    expect(await screen.findByText("Passkey cancelled")).toBeTruthy();
    expect(screen.queryByTestId("login-loading")).toBeNull();
    expect(isDisabled("login")).toBe(false);
    expect(screen.queryByText("Passkey cancelled. Tap the button again to retry.")).toBeNull();
    expect(router.getPathname()).toBe("/");
    expect(connect).not.toHaveBeenCalled();
  });

  it("keeps the instruction for a created passkey when its prompt is dismissed", async () => {
    const credentialId = new Uint8Array([7, 7]).buffer;
    create.mockRejectedValueOnce(
      new PasskeyError("createdNotDerived", "Derive failed", { credentialId })
    );
    signIn.mockRejectedValueOnce(new PasskeyError("cancelled", "Dismissed"));
    await renderWelcome();

    await fireEvent.press(screen.getByTestId("create-account"));
    const instruction =
      "Your passkey was created, but your wallet could not be opened. Tap “Create my account” to finish with this passkey.";
    expect(await screen.findByText(instruction)).toBeTruthy();

    await fireEvent.press(screen.getByTestId("create-account"));
    expect(await screen.findByText("Passkey cancelled")).toBeTruthy();
    expect(screen.getByText(instruction)).toBeTruthy();
    expect(signIn).toHaveBeenLastCalledWith(credentialId);
  });

  it("finishes with the created passkey instead of creating another one", async () => {
    const credentialId = new Uint8Array([7, 7]).buffer;
    create.mockRejectedValueOnce(
      new PasskeyError("createdNotDerived", "Derive failed", { credentialId })
    );
    signIn.mockRejectedValueOnce(new PasskeyError("failed", "Derive failed again"));
    const { router } = await renderWelcome();

    await fireEvent.press(screen.getByTestId("create-account"));
    const instruction =
      "Your passkey was created, but your wallet could not be opened. Tap “Create my account” to finish with this passkey.";
    expect(await screen.findByText(instruction)).toBeTruthy();

    // Still pending after a second failure.
    await fireEvent.press(screen.getByTestId("create-account"));
    expect(await screen.findByText(instruction)).toBeTruthy();

    await fireEvent.press(screen.getByTestId("create-account"));
    await waitFor(() => expect(router.getPathname()).toBe("/onboarding/split"));
    expect(create).toHaveBeenCalledTimes(1);
    expect(signIn).toHaveBeenCalledTimes(2);
    expect(signIn).toHaveBeenLastCalledWith(credentialId);
    expect(idOf).toHaveBeenCalledWith(signedInSeed);
    expect(connect).not.toHaveBeenCalled();
  });

  it("still finishes with the created passkey after a login that found no account", async () => {
    const credentialId = new Uint8Array([7, 7]).buffer;
    create.mockRejectedValueOnce(
      new PasskeyError("createdNotDerived", "Derive failed", { credentialId })
    );
    const router = await renderRouter(
      { ...routes, _layout: () => <Stack screenOptions={{ headerShown: false }} /> },
      { initialUrl: "/" }
    );
    await fireEvent.press(screen.getByTestId("create-account"));
    const instruction =
      "Your passkey was created, but your wallet could not be opened. Tap “Create my account” to finish with this passkey.";
    expect(await screen.findByText(instruction)).toBeTruthy();

    // "Log in" with the created passkey: it has no account yet.
    await fireEvent.press(screen.getByTestId("login"));
    await waitFor(() => expect(router.getPathname()).toBe("/no-account"));
    await fireEvent.press(screen.getByTestId("no-account-back"));
    await waitFor(() => expect(router.getPathname()).toBe("/"));
    expect(await screen.findByText(instruction)).toBeTruthy();

    await fireEvent.press(screen.getByTestId("create-account"));
    await waitFor(() => expect(router.getPathname()).toBe("/onboarding/split"));
    expect(create).toHaveBeenCalledTimes(1);
    expect(signIn).toHaveBeenLastCalledWith(credentialId);
  });

  it.each([
    [
      new PasskeyError("prfUnsupported", "PRF not supported by authenticator"),
      "Your passkey manager is not compatible: use Apple's Passwords app or Google Password Manager."
    ],
    [
      new PasskeyError("noCredential", "No credential"),
      "No sattle.me passkey was offered on this device. Check that your passkeys are synced to this device."
    ]
  ])("forgets a created passkey that cannot give a wallet (%#)", async (error, message) => {
    const credentialId = new Uint8Array([7, 7]).buffer;
    create.mockRejectedValueOnce(
      new PasskeyError("createdNotDerived", "Derive failed", { credentialId })
    );
    signIn.mockRejectedValueOnce(error);
    const { router } = await renderWelcome();

    await fireEvent.press(screen.getByTestId("create-account"));
    await fireEvent.press(screen.getByTestId("create-account"));
    expect(await screen.findByText(message)).toBeTruthy();
    expect(signIn).toHaveBeenLastCalledWith(credentialId);

    // The next tap creates a passkey again instead of retrying one that cannot succeed.
    await fireEvent.press(screen.getByTestId("create-account"));
    await waitFor(() => expect(router.getPathname()).toBe("/onboarding/split"));
    expect(create).toHaveBeenCalledTimes(2);
    expect(signIn).toHaveBeenCalledTimes(1);
  });

  it("keeps the id of the passkey created with the account", async () => {
    create.mockResolvedValueOnce({
      seed: createdSeed,
      credentialId: new Uint8Array([1, 1]).buffer
    });
    const { router } = await renderWelcome();

    await fireEvent.press(screen.getByTestId("create-account"));
    await waitFor(() => expect(router.getPathname()).toBe("/onboarding/split"));
    // The account asks for that passkey only from now on (wallet-access.ts).
    expect(bytesOf(getAccountCredentialId())).toEqual([1, 1]);
  });

  it("keeps the id of the passkey the account was logged in with", async () => {
    await saveMerchantSettings(SIGNED_IN_WALLET, finished);
    signIn.mockResolvedValueOnce({
      seed: signedInSeed,
      credentialId: new Uint8Array([2, 2]).buffer
    });
    const { router } = await renderWelcome();

    await fireEvent.press(screen.getByTestId("login"));
    await waitFor(() => expect(router.getPathname()).toBe("/pos"));
    expect(bytesOf(getAccountCredentialId())).toEqual([2, 2]);
  });

  it("keeps the passkey's id when the account opens on a retry without a new prompt", async () => {
    create.mockResolvedValueOnce({
      seed: createdSeed,
      credentialId: new Uint8Array([3, 3]).buffer
    });
    idOf.mockRejectedValueOnce(
      new WalletError("requestFailed", "Could not derive the wallet's id")
    );
    const { router } = await renderWelcome();

    await fireEvent.press(screen.getByTestId("create-account"));
    expect(await screen.findByText("Something went wrong. Try again.")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("create-account"));
    await waitFor(() => expect(router.getPathname()).toBe("/onboarding/split"));
    expect(create).toHaveBeenCalledTimes(1);
    expect(bytesOf(getAccountCredentialId())).toEqual([3, 3]);
  });

  it("names the account again without a new passkey prompt", async () => {
    idOf.mockRejectedValueOnce(
      new WalletError("requestFailed", "Could not derive the wallet's id")
    );
    const { router } = await renderWelcome();

    await fireEvent.press(screen.getByTestId("create-account"));
    expect(await screen.findByText("Something went wrong. Try again.")).toBeTruthy();

    await fireEvent.press(screen.getByTestId("create-account"));
    await waitFor(() => expect(router.getPathname()).toBe("/onboarding/split"));
    expect(create).toHaveBeenCalledTimes(1);
    expect(idOf).toHaveBeenCalledTimes(2);
    expect(idOf).toHaveBeenLastCalledWith(createdSeed);
    expect(connect).not.toHaveBeenCalled();
  });

  it("retries the point of sale's wallet connection without a new passkey prompt", async () => {
    await saveMerchantSettings(SIGNED_IN_WALLET, finished);
    connect.mockRejectedValueOnce(new WalletError("connectFailed", "Network error"));
    const { router } = await renderWelcome();

    await fireEvent.press(screen.getByTestId("login"));
    expect(
      await screen.findByText(
        "Your point of sale could not be prepared. Check your internet connection, then try again."
      )
    ).toBeTruthy();

    await fireEvent.press(screen.getByTestId("login"));
    await waitFor(() => expect(router.getPathname()).toBe("/pos"));
    expect(signIn).toHaveBeenCalledTimes(1);
    expect(connect).toHaveBeenCalledTimes(2);
    expect(connect).toHaveBeenLastCalledWith(signedInSeed);
  });

  it.each([
    [
      new PasskeyError("noCredential", "No credential"),
      "No sattle.me passkey was offered on this device. Check that your passkeys are synced to this device."
    ],
    [
      new PasskeyError("unsupported", "Web"),
      "This device or browser cannot use a sattle.me passkey. Use a recent browser, or the app on iPhone, iPad or Android."
    ],
    [
      new PasskeyError("alreadyExists", "Exists"),
      "A passkey already exists on this device: use “Log in”."
    ],
    [new Error("Unexpected"), "Something went wrong. Try again."]
  ])("explains a failed login (%#)", async (error, message) => {
    signIn.mockRejectedValueOnce(error);
    await renderWelcome();

    await fireEvent.press(screen.getByTestId("login"));

    expect(await screen.findByText(message)).toBeTruthy();
    // Back on the welcome screen, to try again.
    expect(screen.queryByTestId("login-loading")).toBeNull();
    expect(isDisabled("login")).toBe(false);
  });

  it("tells an Android user that a battery saver may keep the passkey from being offered", async () => {
    // Restored here: nothing restores replaced properties between this file's tests.
    const os = jest.replaceProperty(Platform, "OS", "android");
    try {
      signIn.mockRejectedValueOnce(new PasskeyError("noCredential", "No credential"));
      await renderWelcome();

      await fireEvent.press(screen.getByTestId("login"));

      expect(
        await screen.findByText(
          "No sattle.me passkey was offered on this device. Check that your password manager is not restricted by the battery saver."
        )
      ).toBeTruthy();
    } finally {
      os.restore();
    }
  });

  it("explains a build that cannot open a wallet", async () => {
    idOf.mockRejectedValueOnce(new WalletError("notConfigured", "Invalid network"));
    await renderWelcome();

    await fireEvent.press(screen.getByTestId("login"));

    expect(
      await screen.findByText("This version of the app is not configured to open a wallet.")
    ).toBeTruthy();
  });

  it("does not prompt for a passkey when the build cannot open a wallet", async () => {
    checkConfig.mockImplementation(() => {
      throw new WalletError("notConfigured", "No API key");
    });
    await renderWelcome();

    await fireEvent.press(screen.getByTestId("create-account"));

    expect(
      await screen.findByText("This version of the app is not configured to open a wallet.")
    ).toBeTruthy();
    // No passkey is created whose wallet this build could not open.
    expect(create).not.toHaveBeenCalled();
    expect(connect).not.toHaveBeenCalled();
  });

  it("warns that the passkey is the key to the wallet", async () => {
    await renderWelcome();

    expect(screen.getByText(PASSKEY_WARNING)).toBeTruthy();
  });
});
