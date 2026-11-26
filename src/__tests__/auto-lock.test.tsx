import "@/i18n";

import { act, fireEvent, renderRouter, screen, waitFor } from "expo-router/testing-library";
import { AppState, type AppStateStatus } from "react-native";

import AppLayout from "@/app/(app)/_layout";
import EmployeesScreen from "@/app/(app)/employees";
import IntegrationsScreen from "@/app/(app)/integrations";
import ChargeScreen from "@/app/(app)/pos/charge";
import AmountScreen from "@/app/(app)/pos/index";
import PosLayout from "@/app/(app)/pos/_layout";
import SettingsScreen from "@/app/(app)/settings";
import SettingsLayout from "@/app/(app)/settings/_layout";
import WalletScreen from "@/app/(app)/wallet";
import LaunchScreen from "@/app/index";
import { closeAccount, getAccountWalletId } from "@/features/account/session";
import { AUTO_LOCK_AFTER_MS, AUTO_LOCK_WARNING_MS } from "@/features/navigation/auto-lock";
import { resetPayRequests } from "@/features/terminal/invoice";
import { holdActivity } from "@/lib/activity";
import { disconnectWallet } from "@/lib/breez/wallet";
import { saveTerminalProfile } from "@/lib/terminal/profile";

import { openTestAccount, TEST_WALLET_ID, testBackupKey } from "../../jest/account";
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
  disconnectWallet: jest.fn(async () => undefined),
  getWalletId: jest.fn(),
  getWalletLightningAddress: jest.fn(),
  newDepositAddress: jest.fn(),
  isWalletConnected: () => false,
  getWalletConnectionId: () => null,
  subscribeWallet: () => () => undefined,
  getWalletBalance: jest.fn(),
  listWalletPayments: jest.fn()
}));
// A fixed rate: the keypad only needs one (the point of sale is tested in pos-flow.test.tsx).
jest.mock("../features/terminal/useRate", () => ({
  useRate: () => ({
    rate: 50000,
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

const relays = jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");

const routes = {
  index: LaunchScreen,
  "(app)/_layout": AppLayout,
  "(app)/pos/_layout": PosLayout,
  "(app)/pos/index": AmountScreen,
  "(app)/pos/charge": ChargeScreen,
  "(app)/wallet": WalletScreen,
  "(app)/employees": EmployeesScreen,
  "(app)/integrations": IntegrationsScreen,
  "(app)/settings/_layout": SettingsLayout,
  "(app)/settings/index": SettingsScreen
};

/** Until the warning: 4 min 30 s. */
const UNTIL_WARNING = AUTO_LOCK_AFTER_MS - AUTO_LOCK_WARNING_MS;

/** The app's AppState listeners: the tests say when it goes to the background and comes back. */
const appStateListeners = new Set<(state: AppStateStatus) => void>();
async function appState(state: AppStateStatus) {
  await act(async () => {
    for (const listener of [...appStateListeners]) listener(state);
  });
}

async function advance(ms: number) {
  await act(async () => jest.advanceTimersByTimeAsync(ms));
}

/** The device's clock moves by `ms`, its timers and its monotonic clock do not. */
function setWallClock(ms: number) {
  jest.setSystemTime(Date.now() + ms);
}

type Element = Parameters<typeof fireEvent>[0];
type Capture = (event: { nativeEvent: { pageX: number; pageY: number } }) => boolean;

/**
 * A touch on `element`, as React Native's responder system asks: every ancestor that listens, from
 * the root down (the capture phase), until one takes it (whether one did). Not `fireEvent`, which
 * would call the nearest listener only: a notification's own (its swipe) would hide the detector.
 */
async function touch(element: Element, phase: "start" | "move" = "start"): Promise<boolean> {
  const name =
    phase === "start" ? "onStartShouldSetResponderCapture" : "onMoveShouldSetResponderCapture";
  const listeners: Capture[] = [];
  for (let node: Element | null = element; node; node = node.parent)
    if (typeof node.props[name] === "function") listeners.unshift(node.props[name] as Capture);
  expect(listeners.length).toBeGreaterThan(0);
  let taken = false;
  await act(async () => {
    taken = listeners.some((listener) => listener({ nativeEvent: { pageX: 100, pageY: 100 } }));
  });
  return taken;
}

/** The owner's device in till mode, on the point of sale. */
async function openApp() {
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
  return { router };
}

/** This device's account opens (as the passkey's unlock does): the other destinations open. */
async function unlock() {
  await act(() =>
    openTestAccount(undefined, async () => ({ payoutCurrency: "CHF", detectedCountry: "CH" }))
  );
  await screen.findByLabelText("Wallet");
}

const warning = () => screen.queryByTestId("notification");

jest.setTimeout(30_000);

describe("auto-lock", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    closeAccount();
    relays.resetRelays();
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    jest.mocked(disconnectWallet).mockClear();
    jest
      .mocked(globalThis.fetch)
      .mockImplementation(() => Promise.reject(new Error("Network disabled in tests")));
    resetPayRequests();
    appStateListeners.clear();
    jest.spyOn(AppState, "addEventListener").mockImplementation((type, listener) => {
      if (type !== "change") return { remove: () => undefined };
      const changed = listener as (state: AppStateStatus) => void;
      appStateListeners.add(changed);
      return { remove: () => appStateListeners.delete(changed) };
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("warns 30 s before, then goes back to till mode after 5 minutes without activity", async () => {
    // The owner's delay, its warning 30 s before.
    expect(AUTO_LOCK_AFTER_MS).toBe(5 * 60 * 1000);
    expect(AUTO_LOCK_WARNING_MS).toBe(30 * 1000);
    const { router } = await openApp();
    // Locked, nothing counts: the time starts once the account opens.
    await advance(10 * 60 * 1000);
    expect(warning()).toBeNull();
    await unlock();
    await fireEvent.press(screen.getByTestId("dock-slot-3"));
    await waitFor(() => expect(router.getPathname()).toBe("/settings"));

    await advance(UNTIL_WARNING - 1000);
    expect(warning()).toBeNull();
    await advance(1000);
    expect(screen.getByText("Locking in 30 s")).toBeTruthy();
    expect(screen.getByText("Without activity, the app goes back to till mode")).toBeTruthy();
    // Time is running out: read at once (an error's role), not at each second after.
    expect(warning()!.props.role).toBe("alert");
    expect(screen.getByText("Locking in 30 s").props["aria-live"]).toBe("off");

    // The seconds count down, the warning stays until the end of its countdown.
    await advance(1000);
    expect(screen.getByText("Locking in 29 s")).toBeTruthy();
    await advance(AUTO_LOCK_WARNING_MS - 2000);
    expect(screen.getByText("Locking in 1 s")).toBeTruthy();
    await advance(999);
    expect(screen.getByText("Locking in 1 s")).toBeTruthy();
    expect(screen.getAllByTestId("notification")).toHaveLength(1);
    expect(getAccountWalletId()).toBe(TEST_WALLET_ID);
    await advance(1);
    expect(getAccountWalletId()).toBeNull();
    expect(disconnectWallet).toHaveBeenCalled();
    await waitFor(() => expect(router.getPathname()).toBe("/pos"));
    expect(screen.getByLabelText("Unlock with your passkey")).toBeTruthy();
    expect(warning()).toBeNull();

    // Till mode: no further warning.
    await advance(10 * 60 * 1000);
    expect(warning()).toBeNull();
  });

  it("takes the warning away at a touch, the warning's own included, and counts again", async () => {
    await openApp();
    await unlock();
    await advance(UNTIL_WARNING);
    expect(warning()).not.toBeNull();

    // React Native asks every ancestor of a touch first (capture): the detector never takes it.
    expect(await touch(warning()!)).toBe(false);
    expect(warning()).toBeNull();
    await advance(AUTO_LOCK_AFTER_MS - 1000);
    expect(getAccountWalletId()).toBe(TEST_WALLET_ID);
    // Warned again 4 min 30 s after the touch.
    expect(warning()).not.toBeNull();

    // A finger moving counts too.
    await touch(screen.getByTestId("dock-slot-0"), "move");
    expect(warning()).toBeNull();
    await advance(AUTO_LOCK_AFTER_MS - 1000);
    expect(getAccountWalletId()).toBe(TEST_WALLET_ID);
    await advance(1000);
    expect(getAccountWalletId()).toBeNull();
  });

  it("counts a screen reader's activation, a click without any touch", async () => {
    await openApp();
    await unlock();
    await advance(UNTIL_WARNING);
    expect(warning()).not.toBeNull();

    // TalkBack's double tap on a Pressable: a click goes from the root down, with no touch.
    await fireEvent(screen.getByTestId("dock-slot-1"), "clickCapture");
    expect(warning()).toBeNull();
    await advance(AUTO_LOCK_WARNING_MS + 1000);
    expect(getAccountWalletId()).toBe(TEST_WALLET_ID);
    expect(warning()).toBeNull();
    // Warned again 4 min 30 s after the click.
    await advance(UNTIL_WARNING - AUTO_LOCK_WARNING_MS - 1000);
    expect(warning()).not.toBeNull();
  });

  it('takes the warning away when "Switch to till mode" locks first', async () => {
    await openApp();
    await unlock();
    await advance(UNTIL_WARNING);
    expect(warning()).not.toBeNull();

    await fireEvent.press(screen.getByTestId("dock-more"));
    await fireEvent.press(screen.getAllByTestId("till-mode")[0]);
    await waitFor(() => expect(getAccountWalletId()).toBeNull());
    expect(warning()).toBeNull();
  });

  it("never locks while held (a payment's passkey or sending), and counts again from the release", async () => {
    await openApp();
    await unlock();
    await advance(UNTIL_WARNING);
    expect(warning()).not.toBeNull();

    // The hold takes the warning away, and no time counts until it is released.
    let release!: () => void;
    await act(async () => {
      release = holdActivity();
    });
    expect(warning()).toBeNull();
    await advance(10 * 60 * 1000);
    await appState("background");
    setWallClock(10 * 60 * 1000);
    await appState("active");
    expect(getAccountWalletId()).toBe(TEST_WALLET_ID);
    expect(warning()).toBeNull();

    await act(async () => release());
    await advance(UNTIL_WARNING - 1000);
    expect(warning()).toBeNull();
    await advance(AUTO_LOCK_WARNING_MS + 1000);
    expect(getAccountWalletId()).toBeNull();
  });

  it("counts the time in the background: back to the front past 5 minutes, it locks at once", async () => {
    const { router } = await openApp();
    await unlock();
    await fireEvent.press(screen.getByTestId("dock-slot-1"));
    await waitFor(() => expect(router.getPathname()).toBe("/wallet"));

    await appState("background");
    // Asleep: neither the app's timers nor the monotonic clock ran, the wall clock did.
    setWallClock(AUTO_LOCK_AFTER_MS + 60_000);
    expect(getAccountWalletId()).toBe(TEST_WALLET_ID);
    await appState("active");
    expect(getAccountWalletId()).toBeNull();
    await waitFor(() => expect(router.getPathname()).toBe("/pos"));
    expect(warning()).toBeNull();
  });

  it("says the seconds actually left when the app comes back within the warning's time", async () => {
    await openApp();
    await unlock();
    await advance(10_000);
    await appState("background");
    setWallClock(AUTO_LOCK_AFTER_MS - 20_000);
    await appState("active");

    expect(screen.getByText("Locking in 10 s")).toBeTruthy();
    await advance(10_000);
    expect(getAccountWalletId()).toBeNull();
  });

  it("updates a warning shown before the app left with the seconds left", async () => {
    await openApp();
    await unlock();
    await advance(UNTIL_WARNING);
    expect(screen.getByText("Locking in 30 s")).toBeTruthy();
    await appState("background");
    setWallClock(18_000);
    await appState("active");

    expect(screen.getByText("Locking in 12 s")).toBeTruthy();
    expect(screen.getAllByTestId("notification")).toHaveLength(1);
  });

  it("locks on time when the device's clock is set back", async () => {
    await openApp();
    await unlock();
    await advance(60_000);
    setWallClock(-60 * 60 * 1000);

    // The monotonic clock counts on.
    await advance(UNTIL_WARNING - 60_000);
    expect(screen.getByText("Locking in 30 s")).toBeTruthy();
    await advance(AUTO_LOCK_WARNING_MS);
    expect(getAccountWalletId()).toBeNull();
  });
});
