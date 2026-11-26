import "@/i18n";

import { Slot } from "expo-router";
import { act, fireEvent, renderRouter, screen, waitFor } from "expo-router/testing-library";
import { AppState, Platform, type AppStateStatus } from "react-native";

import AppLayout from "@/app/(app)/_layout";
import RecoveryRoute from "@/app/(app)/settings/recovery";
import SettingsLayout from "@/app/(app)/settings/_layout";
import SettingsIndex from "@/app/(app)/settings/index";
import SettingsSecurity from "@/app/(app)/settings/security";
import LaunchScreen from "@/app/index";
import { closeAccount, getAccountBackupKey, getAccountSettings } from "@/features/account/session";
import { PayoutDraftProvider } from "@/features/settings/payout-draft";
import { resetTerminalProfileCache } from "@/features/terminal/profile-cache";
import { PasskeyError } from "@/lib/breez/errors";
import { signInWithPasskey } from "@/lib/breez/passkey";
import type { WalletSeed } from "@/lib/breez/types";
import type { SavedTerminalProfile } from "@/lib/terminal/model";
import { saveTerminalProfile } from "@/lib/terminal/profile";

import {
  OTHER_TEST_MNEMONIC,
  TEST_MNEMONIC,
  TEST_WALLET_ID,
  openTestAccount,
  testSeed
} from "../../jest/account";
import type * as ScreenCaptureFake from "../../jest/expo-screen-capture";

// The passkey prompt is the test's.
jest.mock("../lib/breez/passkey", () => ({
  createPasskeyWallet: jest.fn(),
  preparePasskeys: jest.fn(async () => undefined),
  passkeysReady: jest.fn(() => true),
  signInWithPasskey: jest.fn()
}));
jest.mock("../lib/app-info", () => ({
  ...jest.requireActual("../lib/app-info"),
  getAppInfo: () => ({
    variant: "staging",
    version: "3.0.0",
    buildNumber: "3000000",
    commit: "f82ecab",
    updates: null
  })
}));
const mockDesktop = jest.fn(() => false);
jest.mock("@/components/layout/useIsDesktop", () => ({
  ...jest.requireActual("@/components/layout/useIsDesktop"),
  useIsDesktop: () => mockDesktop()
}));

const signIn = jest.mocked(signInWithPasskey);
const capture = jest.requireMock<typeof ScreenCaptureFake>("expo-screen-capture");

const routes = {
  index: LaunchScreen,
  "(app)/_layout": AppLayout,
  // Where till mode leads (the account closed): the point of sale itself is pos-flow.test.tsx's.
  "(app)/pos/_layout": () => <Slot />,
  "(app)/pos/index": () => null,
  "(app)/settings/_layout": SettingsLayout,
  "(app)/settings/index": SettingsIndex,
  "(app)/settings/recovery": RecoveryRoute,
  "(app)/settings/security": SettingsSecurity
};

const WORDS = TEST_MNEMONIC.split(" ");

/** The app's AppState listeners: the tests say when it leaves the foreground. */
const appStateListeners = new Set<(state: AppStateStatus) => void>();
async function appState(state: AppStateStatus) {
  await act(async () => {
    for (const listener of [...appStateListeners]) listener(state);
  });
}

/** The owner's device, unlocked, its point of sale prepared. */
async function ownerDevice() {
  await openTestAccount({ usage: "merchant", signUp: "done" });
  const profile: SavedTerminalProfile = {
    version: 2,
    walletId: TEST_WALLET_ID,
    backupKey: getAccountBackupKey()!,
    lightningAddress: "sattleme02c6047f94@breez.tips",
    businessName: getAccountSettings()?.businessName ?? "",
    currency: "CHF"
  };
  await saveTerminalProfile(profile);
  resetTerminalProfileCache();
}

async function open(initialUrl: string, shown: Parameters<typeof renderRouter>[0] = routes) {
  const router = await renderRouter(shown, { initialUrl });
  return { router };
}

/** The words on the screen, in order. */
function shownWords(): string[] {
  return screen.queryAllByTestId(/^recovery-word-\d+$/).map((node) => String(node.props.children));
}

async function reveal() {
  await fireEvent.press(await screen.findByTestId("recovery-reveal"));
}

jest.setTimeout(30_000);

beforeEach(async () => {
  closeAccount();
  mockDesktop.mockReturnValue(false);
  signIn.mockReset().mockResolvedValue({ seed: testSeed(), credentialId: null });
  appStateListeners.clear();
  jest.spyOn(AppState, "addEventListener").mockImplementation((type, listener) => {
    if (type !== "change") return { remove: () => undefined };
    const changed = listener as (state: AppStateStatus) => void;
    appStateListeners.add(changed);
    return { remove: () => appStateListeners.delete(changed) };
  });
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
  await ownerDevice();
});

afterEach(() => {
  closeAccount();
  jest.restoreAllMocks();
});

describe('"Settings" leads to "Recovery phrase"', () => {
  it('from its "Security" page on a phone, warnings first, no word shown', async () => {
    const { router } = await open("/settings");
    await fireEvent.press(await screen.findByTestId("settings-card-security"));
    await waitFor(() => expect(router.getPathname()).toBe("/settings/security"));
    await fireEvent.press(await screen.findByTestId("recovery-open"));
    await waitFor(() => expect(router.getPathname()).toBe("/settings/recovery"));

    expect(await screen.findByText(/anyone can spend all its funds/)).toBeTruthy();
    expect(screen.getByText(/sattle.me will never ask you for them/)).toBeTruthy();
    expect(shownWords()).toEqual([]);
    expect(signIn).not.toHaveBeenCalled();
  });

  it("from its tab on a tablet, over the whole window with its own way back", async () => {
    mockDesktop.mockReturnValue(true);
    const { router } = await open("/settings");
    await fireEvent.press(await screen.findByTestId("settings-tab-security"));
    await fireEvent.press(await screen.findByTestId("recovery-open"));
    await waitFor(() => expect(router.getPathname()).toBe("/settings/recovery"));
    expect(screen.queryByTestId("sidebar-version")).toBeNull();
    await fireEvent.press(screen.getByTestId("recovery-back-desktop"));
    await waitFor(() => expect(router.getPathname()).toBe("/settings"));
  });
});

describe('"Recovery phrase"', () => {
  it("shows the words after the passkey, screen capture blocked, never selectable nor copied", async () => {
    await open("/settings/recovery");
    await reveal();

    await waitFor(() => expect(shownWords()).toEqual(WORDS));
    expect(signIn).toHaveBeenCalledTimes(1);
    expect(capture.blockedBy()).toEqual(["recovery-phrase"]);
    // iOS (Jest's platform): the app switcher's snapshot blurred at most.
    expect(capture.appSwitcherBlur()).toBe(1);
    expect(screen.queryByTestId("recovery-capture-open")).toBeNull();
    for (const node of screen.getAllByTestId(/^recovery-word-\d+$/)) {
      expect(node.props.selectable).toBe(false);
    }
    expect(screen.queryByText(/Copy/)).toBeNull();
    // Read in order by screen readers, each with its number.
    expect(screen.getByLabelText("Word 12: about")).toBeTruthy();
  });

  it('forgets the words on "Hide", and asks for the passkey again to show them', async () => {
    await open("/settings/recovery");
    await reveal();
    await waitFor(() => expect(shownWords()).toHaveLength(12));

    await fireEvent.press(screen.getByTestId("recovery-hide"));
    expect(shownWords()).toEqual([]);
    await waitFor(() => expect(capture.blockedBy()).toEqual([]));
    expect(capture.appSwitcherBlur()).toBeNull();

    await reveal();
    await waitFor(() => expect(shownWords()).toEqual(WORDS));
    expect(signIn).toHaveBeenCalledTimes(2);
    expect(capture.blockedBy()).toEqual(["recovery-phrase"]);
  });

  it("hides them as soon as the app is not active, or the account closes", async () => {
    await open("/settings/recovery");
    await reveal();
    await waitFor(() => expect(shownWords()).toHaveLength(12));
    await appState("inactive");
    expect(shownWords()).toEqual([]);
    await waitFor(() => expect(capture.blockedBy()).toEqual([]));

    await appState("active");
    await reveal();
    await waitFor(() => expect(shownWords()).toHaveLength(12));
    await act(async () => closeAccount());
    expect(shownWords()).toEqual([]);
    await waitFor(() => expect(capture.blockedBy()).toEqual([]));
  });

  it("shows them though the passkey's prompt made the app inactive meanwhile", async () => {
    await open("/settings/recovery");
    signIn.mockImplementationOnce(async () => {
      // The system's prompt over the app (iOS "inactive", Android's background).
      for (const listener of [...appStateListeners]) listener("inactive");
      for (const listener of [...appStateListeners]) listener("background");
      for (const listener of [...appStateListeners]) listener("active");
      return { seed: testSeed(), credentialId: null };
    });
    await reveal();
    await waitFor(() => expect(shownWords()).toEqual(WORDS));
    expect(capture.blockedBy()).toEqual(["recovery-phrase"]);
  });

  it("hides them when the screen is left", async () => {
    const { router } = await open("/settings/security");
    await fireEvent.press(await screen.findByTestId("recovery-open"));
    await reveal();
    await waitFor(() => expect(shownWords()).toHaveLength(12));

    await fireEvent.press(screen.getByTestId("recovery-back"));
    await waitFor(() => expect(router.getPathname()).toBe("/settings/security"));
    expect(shownWords()).toEqual([]);
    await waitFor(() => expect(capture.blockedBy()).toEqual([]));
  });

  it("shows nothing for the passkey of another account, and nothing said for a dismissed one", async () => {
    await open("/settings/recovery");
    signIn.mockResolvedValueOnce({ seed: testSeed(OTHER_TEST_MNEMONIC), credentialId: null });
    await reveal();
    expect(await screen.findByTestId("recovery-failure")).toHaveTextContent(
      "This passkey opens another account than this device's.",
      { exact: false }
    );
    expect(shownWords()).toEqual([]);
    expect(capture.blockedBy()).toEqual([]);

    signIn.mockRejectedValueOnce(new PasskeyError("cancelled", "Dismissed"));
    await reveal();
    await waitFor(() => expect(screen.queryByTestId("recovery-failure")).toBeNull());
    expect(shownWords()).toEqual([]);
  });

  it("says when the wallet has no phrase to show", async () => {
    const entropy = {
      tag: "Entropy",
      inner: [new Uint8Array(32).fill(5).buffer]
    } as unknown as WalletSeed;
    // The open account's passkey, whose seed is raw entropy (no wallet of this app's passkeys).
    const session = jest.requireActual<typeof import("@/features/account/session")>(
      "@/features/account/session"
    );
    jest.spyOn(session, "isAccountSeed").mockReturnValue(true);
    signIn.mockResolvedValueOnce({ seed: entropy, credentialId: null });
    await open("/settings/recovery");
    await reveal();
    expect(await screen.findByTestId("recovery-failure")).toHaveTextContent(
      "This wallet has no recovery phrase to show.",
      { exact: false }
    );
    expect(shownWords()).toEqual([]);
  });

  it("says so when the system refuses to block screen capture", async () => {
    capture.failNextPrevention();
    await open("/settings/recovery");
    await reveal();
    await waitFor(() => expect(shownWords()).toEqual(WORDS));
    expect(screen.getByTestId("recovery-capture-open")).toHaveTextContent(
      "Screenshots are not blocked here",
      { exact: false }
    );
  });
});

describe('"Recovery phrase" on the web', () => {
  // The settings' layout without its stack: the web's measures its frame, Jest has no layout.
  const web = {
    ...routes,
    "(app)/settings/_layout": () => (
      <PayoutDraftProvider>
        <Slot />
      </PayoutDraftProvider>
    )
  };

  it("shows the words after the passkey, and says that nothing blocks screen capture", async () => {
    jest.replaceProperty(Platform, "OS", "web");
    await open("/settings/recovery", web);
    await reveal();
    await waitFor(() => expect(shownWords()).toEqual(WORDS));
    expect(screen.getByTestId("recovery-capture-open")).toBeTruthy();
    expect(capture.blockedBy()).toEqual([]);
    expect(capture.appSwitcherBlur()).toBeNull();
  });
});
