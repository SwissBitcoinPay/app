// Also sets i18next up, as `import "@/i18n"` in the other tests.
import { resources } from "@/i18n";

import { CARD_ADDING_PATH } from "@/config/card";
import { printedCardHref } from "@/lib/card/legacy-link";
import { DEFAULT_RELAYS } from "@/config/relays";
import { act, fireEvent, renderRouter, screen, waitFor, within } from "expo-router/testing-library";
import {
  AppState,
  Linking,
  Platform,
  Share,
  StyleSheet,
  Text,
  type AppStateStatus
} from "react-native";

import RootLayout from "@/app/_layout";
import AppLayout from "@/app/(app)/_layout";
import CardsLayout from "@/app/(app)/cards/_layout";
import CardsScreen from "@/app/(app)/cards/index";
import PairCardScreen from "@/app/(app)/cards/pair";
import EmployeesScreen from "@/app/(app)/employees";
import IntegrationsScreen from "@/app/(app)/integrations";
import ChargeScreen from "@/app/(app)/pos/charge";
import AmountScreen from "@/app/(app)/pos/index";
import PosLayout from "@/app/(app)/pos/_layout";
import SettingsScreen from "@/app/(app)/settings";
import SettingsLayout from "@/app/(app)/settings/_layout";
import SettingsHelp from "@/app/(app)/settings/help";
import RecoveryScreen from "@/app/(app)/settings/recovery";
import RecoveryCheckRoute from "@/app/(app)/settings/recovery-check";
import SettingsSecurity from "@/app/(app)/settings/security";
import WalletScreen from "@/app/(app)/wallet";
import LaunchScreen from "@/app/index";
import { rememberDevicePasskey } from "@/features/account/device-passkey";
import { shownReleases } from "@/features/release-notes/releases";
import {
  closeAccount,
  getAccountCredentialId,
  getAccountSettings,
  getAccountWalletId,
  updateAccount
} from "@/features/account/session";
import {
  DEFAULT_DOCK,
  DESTINATIONS,
  MEMBER_DESTINATIONS,
  SIDEBAR_GROUPS,
  destinationOf,
  isFullScreenRoute,
  isMobileFullScreenRoute,
  keepPlaces,
  parseDock,
  restOf,
  swapInDock,
  type Destination
} from "@/features/navigation/destinations";
import {
  COMPACT_PILL,
  DOCK,
  DOCK_HEIGHT,
  DOCK_TOP,
  dockLayout,
  PILL,
  type PillSizes
} from "@/features/navigation/dock-layout";
import { parseStoredDock, serializeDock } from "@/features/navigation/dock-format";
import { loadDock, saveDock } from "@/features/navigation/dock-store";
import { forgetLaunchLink } from "@/features/navigation/AppShell";
import { resetLaunchUnlock } from "@/features/navigation/launch-unlock";
import { AUTO_LOCK_AFTER_MS } from "@/features/navigation/auto-lock";
import {
  APP_LOCK_KEY,
  parseAppLock,
  serializeAppLock
} from "@/features/app-lock/preference-format";
import { resetPayRequests } from "@/features/terminal/invoice";
import { PasskeyError } from "@/lib/breez/errors";
import { passkeysReady, preparePasskeys, signInWithPasskey } from "@/lib/breez/passkey";
import { connectWallet, disconnectWallet, getWalletId } from "@/lib/breez/wallet";
import { nowUnix } from "@/lib/clock";
import type { MerchantSettings } from "@/lib/settings/merchant";
import { loadMerchantSettings, saveMerchantSettings } from "@/lib/settings/store";
import {
  CARD_PAUSE_MS,
  expectSystemUi,
  shareWithSystem,
  withCardPause,
  withSystemUi
} from "@/lib/system-ui";
import { publishTerminalProfile } from "@/features/terminal/profile-cache";
import { markNotificationsOffered } from "@/features/notification-offer/offer";
import { NOTIFICATIONS_OFFER_KEY } from "@/features/notification-offer/offer-format";
import { saveTerminalProfile } from "@/lib/terminal/profile";
import { space } from "@/theme";

import {
  OTHER_TEST_MNEMONIC,
  TEST_MNEMONIC,
  openTestAccount,
  testBackupKey,
  testSeed
} from "../../jest/account";
import type * as LocalAuthenticationFake from "../../jest/expo-local-authentication";
import type * as SecureStoreFake from "../../jest/expo-secure-store";
import type * as NotificationsFake from "../../jest/expo-notifications";
import type * as RelaysFake from "../../jest/nostr-relays";
import { posScreens } from "../../jest/router";
import { versionParts } from "../../jest/version-label";

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
  // The wallet screen's (wallet-access.ts): never seen connected here, its screen is tested in
  // wallet-screen.test.tsx.
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
    // The point that prices the present (src/lib/rates/), on the test's clock.
    hour: jest
      .requireActual<typeof import("../lib/rates/sources")>("../lib/rates/sources")
      .pointHourOf(Math.floor(Date.now() / 1000)),
    loading: false,
    current: () => 50000
  })
}));
// The side bar's version line: Jest's app config has no version (version-label.test.tsx too).
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
// The notes this staging app of 3.0.0 shows first: the next version's while release-notes/next/
// exists, else the latest released.
const LATEST_NOTES = `whats-new-${shownReleases({ variant: "staging", version: "3.0.0" })[0]!.key}`;
const mockDesktop = jest.fn(() => false);
jest.mock("@/components/layout/useIsDesktop", () => ({
  ...jest.requireActual("@/components/layout/useIsDesktop"),
  useIsDesktop: () => mockDesktop()
}));

const signIn = jest.mocked(signInWithPasskey);
const ready = jest.mocked(passkeysReady);
const prepare = jest.mocked(preparePasskeys);
const connect = jest.mocked(connectWallet);
const disconnect = jest.mocked(disconnectWallet);
const walletId = jest.mocked(getWalletId);
const relays = jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");
const secureStore = jest.requireMock<typeof SecureStoreFake>("expo-secure-store");
const localAuth = jest.requireMock<typeof LocalAuthenticationFake>("expo-local-authentication");

/** The link printed on a v2 card, as the system gives it to the app. */
const PRINTED_LINK = "https://sbpc.ch/1709-1248-5643-8482";

/** This device's account (public key of the key 2), and another one (key 3). */
const WALLET = "02c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5";
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

const routes = {
  index: LaunchScreen,
  "(app)/_layout": AppLayout,
  "(app)/pos/_layout": PosLayout,
  "(app)/pos/index": AmountScreen,
  "(app)/pos/charge": ChargeScreen,
  "(app)/wallet": WalletScreen,
  "(app)/cards/_layout": CardsLayout,
  "(app)/cards/index": CardsScreen,
  "(app)/cards/pair": PairCardScreen,
  "(app)/employees": EmployeesScreen,
  "(app)/integrations": IntegrationsScreen,
  // As in the app: "Settings" holds its own stack (the split, the bank account, the relays).
  "(app)/settings/_layout": SettingsLayout,
  "(app)/settings/index": SettingsScreen,
  "(app)/settings/recovery": RecoveryScreen,
  "(app)/settings/recovery-check": RecoveryCheckRoute,
  "(app)/settings/security": SettingsSecurity,
  "(app)/settings/help": SettingsHelp
};

/**
 * With the app's root, as in the app: its own lock over every screen (src/features/app-lock/),
 * those outside the account's too (`pay`: a stand-in for the payment page a link opens).
 */
const rootedRoutes = {
  _layout: RootLayout,
  ...routes,
  pay: () => <Text testID="pay-page">Payment</Text>
};

/** Web: the SDK is still loading at launch; call the result once it is loaded. */
function loadingSdk(): () => Promise<void> {
  let loaded!: () => void;
  ready.mockReturnValue(false);
  prepare.mockReturnValue(new Promise<void>((resolve) => (loaded = resolve)));
  return async () => {
    ready.mockReturnValue(true);
    await act(async () => loaded());
  };
}

/**
 * Widths of the icons (Font Awesome at 18 px) and names (Poppins Bold 13.5 px) in the dock, measured
 * in Chromium with Poppins, whose names are narrower than in the app's Plus Jakarta Sans: widths
 * the layout must handle all the same.
 */
const ICON_WIDTHS: Record<Destination, number> = {
  pos: 13.5,
  wallet: 18,
  cards: 20.3,
  articles: 18,
  employees: 22.5,
  integrations: 13.5,
  settings: 18
};
const FR_NAMES: Record<Destination, number> = {
  pos: 66.9,
  wallet: 79.1,
  cards: 46.6,
  articles: 53.2,
  employees: 67.7,
  integrations: 85.7,
  settings: 64.5
};
const DE_NAMES: Record<Destination, number> = {
  pos: 69.1,
  wallet: 45.1,
  cards: 47.3,
  articles: 45.8,
  employees: 98.7,
  integrations: 95.6,
  settings: 94.5
};
const sizesOf = (names: Record<Destination, number>) =>
  Object.fromEntries(
    DESTINATIONS.map((d) => [d, { icon: ICON_WIDTHS[d], label: names[d] }])
  ) as Record<Destination, PillSizes>;

/** Jest has no layout: the dock's off-screen icons and names get the widths above. */
async function measureDock() {
  const hidden = { includeHiddenElements: true };
  for (const destination of DESTINATIONS) {
    const layout = (width: number) => ({
      nativeEvent: { layout: { x: 0, y: 0, width, height: 20 } }
    });
    await fireEvent(
      screen.getByTestId(`dock-measure-icon-${destination}`, hidden),
      "layout",
      layout(ICON_WIDTHS[destination])
    );
    await fireEvent(
      screen.getByTestId(`dock-measure-label-${destination}`, hidden),
      "layout",
      layout(FR_NAMES[destination])
    );
  }
}

/** The tiles of the "More" grid, in their order. */
const tiles = () =>
  screen
    .getAllByTestId(/^more-/)
    .map((tile) => (tile.props.testID as string).slice("more-".length))
    .filter((id): id is Destination => (DESTINATIONS as readonly string[]).includes(id));

/** Spinners are decorative: found with the hidden elements only. */
const spinner = (testID: string) => screen.queryByTestId(testID, { includeHiddenElements: true });

/**
 * `holder`: the device of a 100 % card account (CardHolderProfile), else a point of sale's. `home`:
 * where the app shows first (the point of sale, or "Cards" once the passkey asked as it opens
 * opened a card holder's account).
 */
async function openApp(
  initialUrl = "/",
  {
    holder = false,
    home = "/pos",
    rooted = false
  }: { holder?: boolean; home?: string; rooted?: boolean } = {}
) {
  await saveTerminalProfile(
    holder
      ? {
          version: 4,
          walletId: WALLET,
          backupKey: testBackupKey(),
          businessName: "Business 9EE5",
          currency: "CHF"
        }
      : {
          version: 2,
          walletId: WALLET,
          backupKey: testBackupKey(),
          lightningAddress: "sattleme02c6047f94@breez.tips",
          businessName: "Fine Bakery",
          currency: "CHF"
        }
  );
  const router = await renderRouter(rooted ? rootedRoutes : routes, { initialUrl });
  await waitFor(() => expect(router.getPathname()).toBe(home));
  return { router };
}

/**
 * The app's router, as a screen's code pushes a screen. Required once the app is loaded: imported at
 * the top of this file, the tests that take the first listener of links would fail.
 */
function appRouter(): (typeof import("expo-router"))["router"] {
  return jest.requireActual<typeof import("expo-router")>("expo-router").router;
}

/** The app's AppState listeners: the tests say when it goes to the background and comes back. */
const appStateListeners = new Set<(state: AppStateStatus) => void>();

/**
 * The app goes to `state`, as the system says it: its listeners told in the order they listened,
 * or the other way round (`reverse`: the shell's and the auto-lock's in either order).
 */
async function appState(state: AppStateStatus, { reverse = false }: { reverse?: boolean } = {}) {
  (AppState as { currentState: unknown }).currentState = state;
  const listeners = [...appStateListeners];
  if (reverse) listeners.reverse();
  await act(async () => {
    for (const listener of listeners) listener(state);
  });
}

/** The listener of the links the app gets while it runs (the shell's, AppShell.tsx). */
function linkListener(): (event: { url: string }) => void {
  const calls = jest.mocked(Linking.addEventListener).mock.calls as unknown as [
    string,
    (event: { url: string }) => void
  ][];
  return calls[calls.length - 1][1];
}

/** The device's wall clock moves `ms` ahead (the app in the background meanwhile); undone after. */
function clockAhead(ms: number): () => void {
  const realNow = Date.now.bind(Date);
  const spy = jest.spyOn(Date, "now").mockImplementation(() => realNow() + ms);
  return () => spy.mockRestore();
}

jest.setTimeout(20_000);

// "Stay informed" answered on this device, as on any past its first opening: its panel would
// cover this file's screens (notifications-offer.test.tsx tests it).
beforeEach(async () => {
  await markNotificationsOffered(0);
});

describe("navigation", () => {
  beforeEach(async () => {
    closeAccount();
    appStateListeners.clear();
    (AppState as { currentState: unknown }).currentState = "active";
    jest.spyOn(AppState, "addEventListener").mockImplementation((type, listener) => {
      if (type !== "change") return { remove: () => undefined };
      const changed = listener as (state: AppStateStatus) => void;
      appStateListeners.add(changed);
      return { remove: () => appStateListeners.delete(changed) };
    });
    relays.resetRelays();
    mockDesktop.mockReturnValue(false);
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    signIn.mockReset().mockResolvedValue({ seed: testSeed(), credentialId: null });
    ready.mockReset().mockReturnValue(true);
    prepare.mockReset().mockResolvedValue(undefined);
    connect.mockReset().mockResolvedValue({} as never);
    disconnect.mockReset().mockResolvedValue(undefined);
    walletId.mockReset().mockResolvedValue(WALLET);
    // No network (jest.setup.ts), also after a test that made it hang; and no request of the
    // Lightning address's parameters left hanging in invoice.ts's cache by such a test.
    jest
      .mocked(globalThis.fetch)
      .mockImplementation(() => Promise.reject(new Error("Network disabled in tests")));
    resetPayRequests();
    // The device keeps this account's settings: unlocking opens them without the relays.
    await saveMerchantSettings(WALLET, settings);
  });

  describe("mobile dock", () => {
    it("opens in till mode: Charge and a padlock, nothing else", async () => {
      await openApp();
      expect(screen.getByTestId("dock-charge")).toBeTruthy();
      expect(screen.getByLabelText("Unlock with your passkey")).toBeTruthy();
      // The unlocked slots are not reachable.
      expect(screen.queryByTestId("dock-slot-0")).toBeNull();
      expect(screen.queryByLabelText("Wallet")).toBeNull();
      expect(getAccountWalletId()).toBeNull();
    });

    it("shows no version line: it is the side bar's (desktop only)", async () => {
      await openApp();
      expect(screen.queryByTestId("sidebar-version")).toBeNull();
    });

    it("takes the dock out of reach while an invoice shows, and its faded layer always", async () => {
      // The LNURL server never answers: the invoice stays shown.
      jest.mocked(globalThis.fetch).mockImplementation(() => new Promise<Response>(() => {}));
      const { router } = await openApp();
      // Till mode: the pill and the padlock; the slots, faded out, are out of reach.
      expect(screen.getByTestId("dock-charge")).toBeTruthy();
      expect(screen.getByTestId("dock-unlock")).toBeTruthy();
      expect(screen.queryByTestId("dock-slot-0")).toBeNull();
      expect(screen.queryByTestId("dock-more")).toBeNull();

      for (const key of ["5", "0", "0"]) await fireEvent.press(screen.getByTestId(`key-${key}`));
      await fireEvent.press(screen.getByTestId("charge"));
      await waitFor(() => expect(router.getPathname()).toBe("/pos/charge"));
      // Hidden behind the invoice: nothing of it is within reach, though still drawn.
      expect(screen.queryByTestId("dock-charge")).toBeNull();
      expect(screen.queryByTestId("dock-unlock")).toBeNull();
      expect(screen.getByTestId("dock-charge", { includeHiddenElements: true })).toBeTruthy();

      await fireEvent.press(screen.getByTestId("charge-back"));
      await waitFor(() => expect(router.getPathname()).toBe("/pos"));
      expect(screen.getByTestId("dock-charge")).toBeTruthy();
    });

    it('puts no dot on "Charge" while the dock leaves for a new invoice (unlocked)', async () => {
      // The LNURL server never answers: the invoice is still being created, it waits.
      jest.mocked(globalThis.fetch).mockImplementation(() => new Promise<Response>(() => {}));
      const { router } = await openApp();
      await fireEvent.press(screen.getByTestId("dock-unlock"));
      await waitFor(() => expect(getAccountWalletId()).toBe(WALLET));

      for (const key of ["5", "0", "0"]) await fireEvent.press(screen.getByTestId(`key-${key}`));
      await fireEvent.press(screen.getByTestId("charge"));
      await waitFor(() => expect(router.getPathname()).toBe("/pos/charge"));
      // The invoice came as the dock left: no dot appears on its slot while it fades out.
      expect(screen.getByTestId("dock-slot-0", { includeHiddenElements: true })).toBeTruthy();
      expect(
        screen.queryByTestId("dock-slot-0-pending", { includeHiddenElements: true })
      ).toBeNull();
    });

    it("sends a locked destination back to the till", async () => {
      const { router } = await openApp("/wallet");
      expect(router.getPathname()).toBe("/pos");
      // Nothing of the wallet screen, which would connect the wallet.
      expect(screen.queryByTestId("wallet-opening", { includeHiddenElements: true })).toBeNull();
      expect(connect).not.toHaveBeenCalled();
    });

    it('keeps "Cards" locked in till mode, and opens it from "More" once unlocked', async () => {
      const hidden = { includeHiddenElements: true };
      const { router } = await openApp("/cards");
      expect(router.getPathname()).toBe("/pos");
      expect(screen.queryByTestId("cards-loading", hidden)).toBeNull();
      expect(screen.queryByTestId("cards-screen", hidden)).toBeNull();

      await fireEvent.press(screen.getByTestId("dock-unlock"));
      await screen.findByLabelText("Wallet");
      await fireEvent.press(screen.getByTestId("dock-more"));
      // Three tiles out of the dock, one full row: no empty cell.
      expect(tiles()).toHaveLength(3);
      expect(screen.queryAllByTestId("more-empty-cell")).toHaveLength(0);
      await fireEvent.press(screen.getByTestId("more-cards"));
      await waitFor(() => expect(router.getPathname()).toBe("/cards"));
      expect(await screen.findByText("Add your first card")).toBeTruthy();
      expect(screen.getByLabelText("More, current screen: Cards")).toBeTruthy();

      // Back to till mode: nothing of the cards stays.
      await fireEvent.press(screen.getByTestId("dock-more"));
      await fireEvent.press(screen.getAllByTestId("till-mode")[0]);
      await waitFor(() => expect(router.getPathname()).toBe("/pos"));
      expect(screen.queryByTestId("cards-screen", hidden)).toBeNull();
    });

    it('asks the passkey at once for a link to "Cards" the app opens with, then opens it', async () => {
      // The code of "Add a card" a computer shows, scanned.
      forgetLaunchLink();
      jest.mocked(Linking.getInitialURL).mockResolvedValueOnce("https://web.example/cards");
      let confirm!: () => void;
      signIn.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            confirm = () => resolve({ seed: testSeed(), credentialId: null });
          })
      );
      // The till while the passkey is asked.
      const { router } = await openApp("/cards");
      await waitFor(() => expect(signIn).toHaveBeenCalledTimes(1));
      confirm();
      await waitFor(() => expect(getAccountWalletId()).toBe(WALLET));
      await waitFor(() => expect(router.getPathname()).toBe("/cards"));
      expect(await screen.findByText("Add your first card")).toBeTruthy();
    });

    it("opens Add a card, the screen a computer's code names, once the passkey is given", async () => {
      forgetLaunchLink();
      jest
        .mocked(Linking.getInitialURL)
        .mockResolvedValueOnce(`https://web.example${CARD_ADDING_PATH}`);
      let confirm!: () => void;
      signIn.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            confirm = () => resolve({ seed: testSeed(), credentialId: null });
          })
      );
      const { router } = await openApp(CARD_ADDING_PATH);
      await waitFor(() => expect(signIn).toHaveBeenCalledTimes(1));
      confirm();
      await waitFor(() => expect(router.getPathname()).toBe(CARD_ADDING_PATH));
    });

    it('asks the passkey at once for the link printed on a v2 card the app opens with, then opens "Cards"', async () => {
      // Scanned with the phone's camera: a code too, on the card in hand.
      forgetLaunchLink();
      jest.mocked(Linking.getInitialURL).mockResolvedValueOnce(PRINTED_LINK);
      let confirm!: () => void;
      signIn.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            confirm = () => resolve({ seed: testSeed(), credentialId: null });
          })
      );
      // The router opens on the link as +native-intent rewrote it; the till while the passkey is
      // asked.
      const { router } = await openApp(printedCardHref("1709-1248-5643-8482", 1));
      await waitFor(() => expect(signIn).toHaveBeenCalledTimes(1));
      expect(router.getPathname()).toBe("/pos");
      confirm();
      await waitFor(() => expect(getAccountWalletId()).toBe(WALLET));
      // "Cards", the screen the link named, which took it once it read the account's cards
      // (what it does with it: cards-screen.test.tsx).
      await waitFor(() => expect(router.getPathname()).toBe("/cards"));
      await waitFor(() => expect(router.getSearchParams()).toEqual({}), { timeout: 8000 });
      expect(signIn).toHaveBeenCalledTimes(1);
    });

    it("asks the passkey for the link printed on a v2 card the app gets, not for another address of its host", async () => {
      const { router } = await openApp();
      await act(async () => {
        linkListener()({ url: "https://sbpc.ch/" });
        linkListener()({ url: `${PRINTED_LINK}/more` });
        linkListener()({ url: "https://sbpc.ch.other.example/1709-1248-5643-8482" });
      });
      expect(signIn).not.toHaveBeenCalled();
      expect(router.getPathname()).toBe("/pos");
      await act(async () => {
        linkListener()({ url: PRINTED_LINK });
      });
      await waitFor(() => expect(getAccountWalletId()).toBe(WALLET));
      await waitFor(() => expect(router.getPathname()).toBe("/cards"));
      expect(signIn).toHaveBeenCalledTimes(1);
    });

    it('asks the passkey for a link to "Cards" the app gets while it shows the till', async () => {
      const { router } = await openApp();
      expect(signIn).not.toHaveBeenCalled();
      const [[, listener]] = jest.mocked(Linking.addEventListener).mock.calls as unknown as [
        [string, (event: { url: string }) => void]
      ];
      await act(async () => {
        listener({ url: "https://web.example/cards" });
      });
      await waitFor(() => expect(getAccountWalletId()).toBe(WALLET));
      await waitFor(() => expect(router.getPathname()).toBe("/cards"));
      expect(signIn).toHaveBeenCalledTimes(1);
    });

    it("stays on the till when the passkey a link asked is refused, and asks nothing for another", async () => {
      signIn.mockRejectedValueOnce(new PasskeyError("cancelled", "The user cancelled"));
      const { router } = await openApp();
      const [[, listener]] = jest.mocked(Linking.addEventListener).mock.calls as unknown as [
        [string, (event: { url: string }) => void]
      ];
      await act(async () => {
        listener({ url: "https://web.example/cards" });
      });
      await waitFor(() => expect(signIn).toHaveBeenCalledTimes(1));
      expect(router.getPathname()).toBe("/pos");
      expect(getAccountWalletId()).toBeNull();
      // A payment link, the till itself: nothing locked, no passkey.
      await act(async () => {
        listener({ url: "https://web.example/pay#abc" });
        listener({ url: "https://web.example/pos" });
      });
      expect(signIn).toHaveBeenCalledTimes(1);
    });

    it("asks nothing for a link to a locked destination no code shows: the till stays", async () => {
      // A web page, another app, a checkout's return address: no passkey without a press in the
      // app.
      const { router } = await openApp();
      await act(async () => {
        linkListener()({ url: "https://web.example/wallet" });
        linkListener()({ url: "https://web.example/settings" });
        linkListener()({ url: "https://web.example/cards/pair/" });
      });
      expect(signIn).not.toHaveBeenCalled();
      expect(router.getPathname()).toBe("/pos");
    });

    it("asks the passkey for a code's link once the app is in front, not while it gets there", async () => {
      await openApp();
      await appState("background");
      await act(async () => {
        linkListener()({ url: `https://web.example${CARD_ADDING_PATH}` });
      });
      expect(signIn).not.toHaveBeenCalled();
      await appState("active");
      await waitFor(() => expect(getAccountWalletId()).toBe(WALLET));
      expect(signIn).toHaveBeenCalledTimes(1);
    });

    describe("a code's link, the account left open in the background past the auto-lock", () => {
      /**
       * The account opened, the app left without "Switch to till mode" longer than the
       * auto-lock's delay, then the code scanned: the link comes before the app is in front (the
       * account still open must not take it, the auto-lock then leading to the till, nothing
       * asked).
       */
      async function scanAfterAutoLock(order: { reverse: boolean }) {
        const { router } = await openApp();
        await fireEvent.press(screen.getByTestId("dock-unlock"));
        await waitFor(() => expect(getAccountWalletId()).toBe(WALLET));
        await screen.findByLabelText("Wallet");
        await appState("background");
        const restoreClock = clockAhead(AUTO_LOCK_AFTER_MS + 1000);
        try {
          let confirm!: () => void;
          signIn.mockImplementationOnce(
            () =>
              new Promise((resolve) => {
                confirm = () => resolve({ seed: testSeed(), credentialId: null });
              })
          );
          await act(async () => {
            linkListener()({ url: `https://web.example${CARD_ADDING_PATH}` });
          });
          await appState("active", order);
          // Locked first, as the auto-lock would; the till while the passkey is asked.
          await waitFor(() => expect(signIn).toHaveBeenCalledTimes(2));
          expect(getAccountWalletId()).toBeNull();
          expect(router.getPathname()).toBe("/pos");
          confirm();
          await waitFor(() => expect(getAccountWalletId()).toBe(WALLET));
          await waitFor(() => expect(router.getPathname()).toBe("/cards"));
        } finally {
          restoreClock();
        }
      }

      it("locks, asks the passkey, then opens the code's screen", async () => {
        await scanAfterAutoLock({ reverse: false });
      });

      it("does so whichever of the auto-lock and the link the app tells first", async () => {
        await scanAfterAutoLock({ reverse: true });
      });
    });

    it("opens a code's screen without the passkey while the account is open, the scan an activity", async () => {
      // The screen itself is the router's (expo-router follows the app's links), not modelled here.
      await openApp();
      await fireEvent.press(screen.getByTestId("dock-unlock"));
      await waitFor(() => expect(getAccountWalletId()).toBe(WALLET));
      await screen.findByLabelText("Wallet");
      await appState("background");
      // Scanned within the auto-lock's delay: the router shows its screen, the account stays open.
      let restoreClock = clockAhead(AUTO_LOCK_AFTER_MS - 10_000);
      try {
        await act(async () => {
          linkListener()({ url: `https://web.example${CARD_ADDING_PATH}` });
        });
        await appState("active");
        expect(signIn).toHaveBeenCalledTimes(1);
        expect(getAccountWalletId()).toBe(WALLET);
      } finally {
        restoreClock();
      }
      // The time counts from the scan: a minute later, still open.
      await appState("background");
      restoreClock = clockAhead(AUTO_LOCK_AFTER_MS - 10_000 + 60_000);
      try {
        await appState("active");
        expect(getAccountWalletId()).toBe(WALLET);
      } finally {
        restoreClock();
      }
    });

    it("unlocks with this device's passkey, stays on the till, then opens the destinations", async () => {
      const { router } = await openApp();
      await fireEvent.press(screen.getByTestId("dock-unlock"));

      await waitFor(() => expect(getAccountWalletId()).toBe(WALLET));
      expect(signIn).toHaveBeenCalledTimes(1);
      expect(router.getPathname()).toBe("/pos");
      // Default dock: Charge, Wallet, Employees, Settings.
      expect(await screen.findByLabelText("Wallet")).toBeTruthy();

      await fireEvent.press(screen.getByTestId("dock-slot-1"));
      await waitFor(() => expect(router.getPathname()).toBe("/wallet"));
      // The wallet screen connects the wallet with the open account's seed: no passkey again.
      await waitFor(() => expect(connect).toHaveBeenCalledWith(testSeed()));
      expect(signIn).toHaveBeenCalledTimes(1);
    });

    it("keeps the unlocking passkey's id with the account, and drops it in till mode", async () => {
      signIn.mockResolvedValue({ seed: testSeed(), credentialId: new Uint8Array([5, 6]).buffer });
      await openApp();
      await fireEvent.press(screen.getByTestId("dock-unlock"));

      await waitFor(() => expect(getAccountWalletId()).toBe(WALLET));
      // Asked for that passkey only from now on (wallet-access.ts).
      expect(Array.from(new Uint8Array(getAccountCredentialId() ?? new ArrayBuffer(0)))).toEqual([
        5, 6
      ]);
      // Till mode closes the account (lockTerminal): its passkey's id goes with its seed.
      await act(async () => closeAccount());
      expect(getAccountCredentialId()).toBeNull();
    });

    it("asks for the passkey this device saved for its account only", async () => {
      await rememberDevicePasskey(WALLET, new Uint8Array([5, 6]).buffer);
      await openApp();
      await fireEvent.press(screen.getByTestId("dock-unlock"));

      await waitFor(() => expect(getAccountWalletId()).toBe(WALLET));
      const [pinned] = signIn.mock.lastCall ?? [];
      expect(pinned && Array.from(new Uint8Array(pinned))).toEqual([5, 6]);
    });

    it("asks for any passkey when the one saved is another account's", async () => {
      await rememberDevicePasskey(OTHER_WALLET, new Uint8Array([5, 6]).buffer);
      await openApp();
      await fireEvent.press(screen.getByTestId("dock-unlock"));

      await waitFor(() => expect(getAccountWalletId()).toBe(WALLET));
      expect(signIn).toHaveBeenLastCalledWith(undefined);
    });

    it("unlocks without connecting the wallet: its keys are not needed", async () => {
      await openApp();
      await fireEvent.press(screen.getByTestId("dock-unlock"));

      await waitFor(() => expect(getAccountWalletId()).toBe(WALLET));
      expect(connect).not.toHaveBeenCalled();
      expect(walletId).not.toHaveBeenCalled();
    });

    it("refuses another account's passkey without connecting its wallet", async () => {
      signIn.mockResolvedValue({ seed: testSeed(OTHER_TEST_MNEMONIC), credentialId: null });
      await openApp();
      await fireEvent.press(screen.getByTestId("dock-unlock"));

      expect(
        await screen.findByText("This passkey opens another account than this device's")
      ).toBeTruthy();
      // An error notification.
      expect(screen.getByText("Couldn't unlock")).toBeTruthy();
      expect(screen.getByTestId("notification").props.role).toBe("alert");
      expect(getAccountWalletId()).toBeNull();
      expect(connect).not.toHaveBeenCalled();
    });

    it("offers the 12 words once the passkey no longer opens the account", async () => {
      // The app is no longer associated with the passkeys' domain.
      signIn.mockRejectedValue(new PasskeyError("notAssociated", "Not associated"));
      await openApp();
      await fireEvent.press(screen.getByTestId("dock-unlock"));

      expect(await screen.findByText("Couldn't unlock")).toBeTruthy();
      expect(screen.getByText("Open with my 12 words")).toBeTruthy();
      expect(getAccountWalletId()).toBeNull();
    });

    it("refuses the passkey of another account and keeps till mode", async () => {
      signIn.mockResolvedValue({ seed: testSeed(OTHER_TEST_MNEMONIC), credentialId: null });
      walletId.mockResolvedValue(OTHER_WALLET);
      await openApp();
      await fireEvent.press(screen.getByTestId("dock-unlock"));

      expect(
        await screen.findByText("This passkey opens another account than this device's")
      ).toBeTruthy();
      expect(getAccountWalletId()).toBeNull();
      // Nothing of the other account stays connected.
      expect(disconnect).toHaveBeenCalled();
      expect(screen.queryByLabelText("Wallet")).toBeNull();
    });

    it("says nothing when the passkey prompt is dismissed", async () => {
      signIn.mockRejectedValue(new PasskeyError("cancelled", "Dismissed"));
      await openApp();
      await fireEvent.press(screen.getByTestId("dock-unlock"));
      await waitFor(() => expect(signIn).toHaveBeenCalled());
      await waitFor(() =>
        expect(screen.getByTestId("dock-unlock").props.accessibilityState.busy).toBe(false)
      );
      expect(screen.queryByTestId("notification")).toBeNull();
      expect(getAccountWalletId()).toBeNull();
    });

    it("shows a spinner on the padlock until the SDK is loaded (web), then unlocks", async () => {
      const load = loadingSdk();
      await openApp();
      expect(spinner("dock-unlock-spinner")).toBeTruthy();
      const padlock = screen.getByTestId("dock-unlock");
      expect(padlock.props.accessibilityLabel).toBe("Preparing to unlock…");
      expect(padlock.props.accessibilityState).toMatchObject({ busy: true, disabled: true });
      await fireEvent.press(padlock);
      expect(signIn).not.toHaveBeenCalled();

      await load();
      expect(spinner("dock-unlock-spinner")).toBeNull();
      await fireEvent.press(screen.getByLabelText("Unlock with your passkey"));
      await waitFor(() => expect(getAccountWalletId()).toBe(WALLET));
      expect(signIn).toHaveBeenCalledTimes(1);
    });

    it('opens the rest from "More", and goes back to till mode from it', async () => {
      const { router } = await openApp();
      await fireEvent.press(screen.getByTestId("dock-unlock"));
      await screen.findByLabelText("Wallet");

      await fireEvent.press(screen.getByTestId("dock-more"));
      expect(screen.getByTestId("more-panel")).toBeTruthy();
      // What is not in the dock.
      expect(screen.getByTestId("more-articles")).toBeTruthy();
      expect(screen.getByTestId("more-integrations")).toBeTruthy();
      expect(screen.queryByTestId("more-settings")).toBeNull();
      expect(screen.queryByTestId("more-wallet")).toBeNull();

      await fireEvent.press(screen.getByTestId("more-integrations"));
      await waitFor(() => expect(router.getPathname()).toBe("/integrations"));
      // Out of the dock: "More" is shared with the screen, whose name shows for a moment.
      expect(screen.getByLabelText("More, current screen: Integrations")).toBeTruthy();
      expect(screen.getByTestId("dock-name")).toBeTruthy();

      await fireEvent.press(screen.getByTestId("dock-more"));
      // The screen shown is marked in the grid.
      expect(screen.getByLabelText("Integrations, current screen")).toBeTruthy();
      await fireEvent.press(screen.getAllByTestId("till-mode")[0]);
      await waitFor(() => expect(router.getPathname()).toBe("/pos"));
      expect(getAccountWalletId()).toBeNull();
      expect(disconnect).toHaveBeenCalled();
      expect(screen.getByLabelText("Unlock with your passkey")).toBeTruthy();
    });

    it("customises the dock: a slot, then a destination, kept on this device", async () => {
      await openApp();
      await fireEvent.press(screen.getByTestId("dock-unlock"));
      await screen.findByLabelText("Wallet");
      await fireEvent.press(screen.getByTestId("dock-more"));
      await fireEvent.press(screen.getByTestId("customize"));

      // The first slot is selected: Charge, which is a destination like the others.
      expect(screen.getByLabelText("Charge, slot 1")).toBeTruthy();
      await fireEvent.press(screen.getByTestId("dock-slot-1"));
      expect(screen.getByLabelText("Wallet, slot 2")).toBeTruthy();
      await fireEvent.press(screen.getByTestId("more-integrations"));

      // Wallet went back to the grid.
      expect(screen.getByTestId("more-wallet")).toBeTruthy();
      await fireEvent.press(screen.getByTestId("customize-done"));
      expect(screen.getByTestId("customize")).toBeTruthy();
      expect(await loadDock()).toEqual(["pos", "integrations", "employees", "settings"]);
    });

    it('shares "More" with a screen out of the dock until one of the dock is chosen', async () => {
      const { router } = await openApp();
      await fireEvent.press(screen.getByTestId("dock-unlock"));
      await screen.findByLabelText("Wallet");
      expect(screen.getByLabelText("More")).toBeTruthy();

      await fireEvent.press(screen.getByTestId("dock-more"));
      await fireEvent.press(screen.getByTestId("more-integrations"));
      await waitFor(() => expect(router.getPathname()).toBe("/integrations"));
      expect(screen.getByLabelText("More, current screen: Integrations")).toBeTruthy();

      await fireEvent.press(screen.getByTestId("dock-slot-1"));
      await waitFor(() => expect(router.getPathname()).toBe("/wallet"));
      expect(screen.getByLabelText("More")).toBeTruthy();
    });

    it("names the screen shown in its slot once the names are measured", async () => {
      const { router } = await openApp();
      await fireEvent.press(screen.getByTestId("dock-unlock"));
      await screen.findByLabelText("Wallet");
      // Not measured yet: icons only.
      expect(screen.queryByTestId("dock-label-0")).toBeNull();

      await measureDock();
      expect(screen.getByTestId("dock-label-0")).toHaveTextContent("Charge");
      expect(screen.queryByTestId("dock-label-1")).toBeNull();

      await fireEvent.press(screen.getByTestId("dock-slot-1"));
      await waitFor(() => expect(router.getPathname()).toBe("/wallet"));
      expect(screen.getByTestId("dock-label-1")).toHaveTextContent("Wallet");
    });

    it("selects the slot of the screen shown to customise the dock", async () => {
      const { router } = await openApp();
      await fireEvent.press(screen.getByTestId("dock-unlock"));
      await screen.findByLabelText("Wallet");
      await fireEvent.press(screen.getByTestId("dock-slot-1"));
      await waitFor(() => expect(router.getPathname()).toBe("/wallet"));

      await fireEvent.press(screen.getByTestId("dock-more"));
      await fireEvent.press(screen.getByTestId("customize"));
      expect(screen.getByLabelText("Wallet, slot 2")).toBeTruthy();
    });

    it("selects the first slot when the screen shown is out of the dock", async () => {
      const { router } = await openApp();
      await fireEvent.press(screen.getByTestId("dock-unlock"));
      await screen.findByLabelText("Wallet");
      await fireEvent.press(screen.getByTestId("dock-more"));
      await fireEvent.press(screen.getByTestId("more-integrations"));
      await waitFor(() => expect(router.getPathname()).toBe("/integrations"));

      await fireEvent.press(screen.getByTestId("dock-more"));
      await fireEvent.press(screen.getByTestId("customize"));
      expect(screen.getByLabelText("Charge, slot 1")).toBeTruthy();
    });

    it("keeps the grid in place on a swap, in its usual order at the next opening", async () => {
      await openApp();
      await fireEvent.press(screen.getByTestId("dock-unlock"));
      await screen.findByLabelText("Wallet");
      await fireEvent.press(screen.getByTestId("dock-more"));
      expect(tiles()).toEqual(["cards", "articles", "integrations"]);
      await fireEvent.press(screen.getByTestId("customize"));
      await fireEvent.press(screen.getByTestId("dock-slot-1"));
      await fireEvent.press(screen.getByTestId("more-integrations"));

      // Wallet takes the place of Integrations.
      expect(tiles()).toEqual(["cards", "articles", "wallet"]);
      await fireEvent.press(screen.getByTestId("customize-done"));
      await fireEvent.press(screen.getByTestId("dock-more"));
      await waitFor(() => expect(screen.queryByTestId("more-panel")).toBeNull());

      await fireEvent.press(screen.getByTestId("dock-more"));
      expect(tiles()).toEqual(["wallet", "cards", "articles"]);
    });

    it('sorts the grid again when "More" opens while it still fades out', async () => {
      await openApp();
      await fireEvent.press(screen.getByTestId("dock-unlock"));
      await screen.findByLabelText("Wallet");
      await fireEvent.press(screen.getByTestId("dock-more"));
      await fireEvent.press(screen.getByTestId("customize"));
      await fireEvent.press(screen.getByTestId("dock-slot-1"));
      await fireEvent.press(screen.getByTestId("more-integrations"));
      expect(tiles()).toEqual(["cards", "articles", "wallet"]);

      // Closed and opened again at once: the card is still there, its content is new.
      await fireEvent.press(screen.getByTestId("dock-more"));
      expect(screen.getByTestId("more-panel")).toBeTruthy();
      await fireEvent.press(screen.getByTestId("dock-more"));
      expect(tiles()).toEqual(["wallet", "cards", "articles"]);
      expect(screen.getByTestId("customize")).toBeTruthy();
    });

    it("selects only the slot picked for a swap while customising", async () => {
      const { router } = await openApp();
      await fireEvent.press(screen.getByTestId("dock-unlock"));
      await screen.findByLabelText("Wallet");
      await fireEvent.press(screen.getByTestId("dock-slot-1"));
      await waitFor(() => expect(router.getPathname()).toBe("/wallet"));
      expect(screen.getByTestId("dock-slot-1")).toBeSelected();

      await fireEvent.press(screen.getByTestId("dock-more"));
      await fireEvent.press(screen.getByTestId("customize"));
      await fireEvent.press(screen.getByTestId("dock-slot-2"));
      expect(screen.getByTestId("dock-slot-2")).toBeSelected();
      expect(screen.getByTestId("dock-slot-1")).not.toBeSelected();
    });

    it("never shows the name of the point of sale in till mode, whatever the dock", async () => {
      await saveDock(["settings", "wallet", "integrations", "employees"]);
      await openApp();
      await act(async () => undefined);
      expect(screen.queryByTestId("dock-name")).toBeNull();
      expect(screen.getByLabelText("Unlock with your passkey")).toBeTruthy();
    });

    it("uses the dock saved on this device", async () => {
      await saveDock(["settings", "wallet", "pos", "integrations"]);
      await openApp();
      await fireEvent.press(screen.getByTestId("dock-unlock"));
      await screen.findByLabelText("Settings");
      await act(async () => undefined);
      expect(screen.getByLabelText("Charge")).toBeTruthy();
      await fireEvent.press(screen.getByTestId("dock-more"));
      expect(screen.getByTestId("more-employees")).toBeTruthy();
      expect(screen.queryByTestId("more-settings")).toBeNull();
    });
  });

  describe("Settings in till mode, and the app's own lock", () => {
    /** The app in front again `ms` later, the account left as it was meanwhile. */
    async function backAfter(ms: number) {
      await appState("background");
      const restoreClock = clockAhead(ms);
      try {
        await appState("active");
      } finally {
        restoreClock();
      }
    }

    it("opens Settings from the till without the passkey, the account's settings greyed", async () => {
      const { router } = await openApp();
      expect(screen.getByTestId("dock-settings")).toHaveAccessibleName("Settings");
      await fireEvent.press(screen.getByTestId("dock-settings"));
      await waitFor(() => expect(router.getPathname()).toBe("/settings"));
      expect(await screen.findByTestId("settings-locked")).toBeTruthy();
      expect(signIn).not.toHaveBeenCalled();
      // The dock leads back: no header way of a card holder's phone.
      expect(screen.getByTestId("dock")).toBeTruthy();
      expect(screen.queryByTestId("header-cards")).toBeNull();
      // Its list runs under the dock, its end above it (dock-area.tsx): the screen's margin, then
      // the dock with the bottom safe area below it (none in Jest: space[5]).
      const list = screen.getByTestId("settings-locked");
      expect(StyleSheet.flatten(list.props.contentContainerStyle).paddingBottom).toBe(
        space[6] + space[5] + DOCK_TOP + DOCK_HEIGHT
      );
      expect(getAccountWalletId()).toBeNull();
      // What the till shows already, nothing more: no payout nor bank account, greyed.
      expect(screen.getByTestId("business-name")).toHaveTextContent("Fine Bakery");
      // Its rubrics' cards greyed, opening nothing, without their values, but the display
      // currency, which the till shows; "Help" works as unlocked.
      expect(screen.getByTestId("settings-card-business")).toHaveAccessibleName("Business, CHF");
      for (const card of ["business", "charging", "payouts", "network", "security"]) {
        expect(screen.getByTestId(`settings-card-${card}`)).toBeDisabled();
      }
      expect(screen.getByTestId("settings-card-payouts")).toHaveAccessibleName("Payouts");
      expect(screen.getByTestId("logout")).toBeDisabled();
      expect(screen.getByTestId("delete-account")).toBeDisabled();
      // The terms and the privacy policy open as unlocked: pages outside the app.
      expect(screen.getByTestId("settings-legal-terms")).toBeEnabled();
      expect(screen.getByTestId("settings-legal-privacy")).toBeEnabled();
      // This device's choice shown, changed only unlocked.
      expect(screen.getByTestId("unlock-asks-switch")).toBeDisabled();
      expect(screen.getByTestId("unlock-asks-row")).toHaveTextContent(
        /The app opens without biometrics/
      );
      // Read as one, its caption saying whether it is on (its switch out of reach).
      expect(screen.getByTestId("unlock-asks-row")).toHaveAccessibleName(
        "Ask for biometrics to unlock the app, The app opens without biometrics"
      );
      // "Help" works as unlocked, but for what this device sends to Expo Observe.
      await fireEvent.press(screen.getByTestId("settings-card-help"));
      await waitFor(() => expect(router.getPathname()).toBe("/settings/help"));
      expect(await screen.findByTestId("support-contact")).toBeEnabled();
      expect(screen.getByTestId("support-reports")).toBeDisabled();
      // Read as one, its section's name first: its visible label alone would not say it is sent.
      expect(screen.getByTestId("support-reports-row")).toHaveAccessibleName(
        "Send crash reports, Crashes and slowdowns, No amounts or payment addresses"
      );
      await fireEvent.press(screen.getByTestId("settings-page-back"));
      await waitFor(() => expect(router.getPathname()).toBe("/settings"));

      await fireEvent.press(await screen.findByTestId("settings-unlock"));
      await waitFor(() => expect(getAccountWalletId()).toBe(WALLET));
      expect(signIn).toHaveBeenCalledTimes(1);
      expect(await screen.findByTestId("settings")).toBeTruthy();
      expect(screen.queryByTestId("settings-locked")).toBeNull();
      expect(router.getPathname()).toBe("/settings");
      await fireEvent.press(screen.getByTestId("settings-card-security"));
      await waitFor(() => expect(router.getPathname()).toBe("/settings/security"));
      expect(await screen.findByTestId("unlock-asks-switch")).toBeEnabled();
      await fireEvent.press(screen.getByTestId("settings-page-back"));
      await fireEvent.press(await screen.findByTestId("settings-card-help"));
      await waitFor(() => expect(router.getPathname()).toBe("/settings/help"));
      expect(await screen.findByTestId("support-reports")).toBeEnabled();
    });

    it("opens its first screen only: a link to what it opens on top shows it reduced", async () => {
      const { router } = await openApp("/settings/recovery", { home: "/settings" });
      expect(await screen.findByTestId("settings-locked")).toBeTruthy();
      expect(screen.queryByTestId("recovery-screen")).toBeNull();
      await act(async () => appRouter().push("/settings/recovery"));
      expect(router.getPathname()).toBe("/settings");
      expect(screen.queryByTestId("recovery-screen")).toBeNull();
      expect(signIn).not.toHaveBeenCalled();
    });

    it("takes what Settings opened on top out of its history as it locks", async () => {
      const { router } = await openApp();
      await fireEvent.press(screen.getByTestId("dock-unlock"));
      await waitFor(() => expect(getAccountWalletId()).toBe(WALLET));
      await fireEvent.press(await screen.findByLabelText("Settings"));
      await waitFor(() => expect(router.getPathname()).toBe("/settings"));
      await act(async () => appRouter().push("/settings/recovery"));
      expect(await screen.findByTestId("recovery-screen")).toBeTruthy();

      await backAfter(AUTO_LOCK_AFTER_MS + 60_000);
      await waitFor(() => expect(router.getPathname()).toBe("/pos"));
      expect(getAccountWalletId()).toBeNull();
      await fireEvent.press(screen.getByTestId("dock-settings"));
      await waitFor(() => expect(router.getPathname()).toBe("/settings"));
      expect(await screen.findByTestId("settings-locked")).toBeTruthy();
      expect(screen.queryByTestId("recovery-screen")).toBeNull();
    });

    it("opens it from the side bar too, its row without a padlock", async () => {
      mockDesktop.mockReturnValue(true);
      const { router } = await openApp();
      await fireEvent.press(screen.getByTestId("sidebar-settings"));
      await waitFor(() => expect(router.getPathname()).toBe("/settings"));
      expect(await screen.findByTestId("settings-locked")).toBeTruthy();
      expect(signIn).not.toHaveBeenCalled();
      // What the till shows already: the business and its display currency, greyed.
      expect(screen.getByTestId("display-currency")).toBeDisabled();
      // What needs the account: its tabs with a padlock, as the side bar's locked rows.
      for (const tab of ["charging", "payouts", "network", "security"]) {
        expect(screen.getByTestId(`settings-tab-${tab}`)).toBeEnabled();
        expect(screen.getByTestId(`settings-tab-${tab}-padlock`)).toBeTruthy();
      }
      expect(screen.getByTestId("settings-tab-charging")).toHaveAccessibleName(
        "Payments, locked: unlock with your passkey"
      );
      for (const tab of ["business", "help", "account"]) {
        expect(screen.queryByTestId(`settings-tab-${tab}-padlock`)).toBeNull();
      }
      // At the title's right, "Unlock" where "Log out" is unlocked: no other there.
      expect(screen.queryByTestId("logout")).toBeNull();
      await fireEvent.press(screen.getByTestId("settings-tab-account"));
      expect(await screen.findByTestId("delete-account")).toBeDisabled();
      expect(screen.queryByTestId("logout")).toBeNull();
      expect(signIn).not.toHaveBeenCalled();
    });

    it("asks the passkey from a computer's locked tab, then shows that tab", async () => {
      mockDesktop.mockReturnValue(true);
      const { router } = await openApp("/settings", { home: "/settings" });
      expect(await screen.findByTestId("settings-locked")).toBeTruthy();
      await fireEvent.press(screen.getByTestId("settings-tab-security"));
      await waitFor(() => expect(getAccountWalletId()).toBe(WALLET));
      expect(signIn).toHaveBeenCalledTimes(1);
      expect(await screen.findByTestId("settings")).toBeTruthy();
      expect(screen.getByTestId("settings-tab-security")).toBeSelected();
      expect(screen.getByTestId("settings-panel-security")).toBeTruthy();
      expect(screen.queryByTestId("settings-tab-security-padlock")).toBeNull();
      expect(router.getPathname()).toBe("/settings");

      // The tab chosen then stays as the window narrows, then widens again.
      await fireEvent.press(screen.getByTestId("settings-tab-help"));
      mockDesktop.mockReturnValue(false);
      await act(async () => {
        await updateAccount({ displayCurrency: "EUR" });
      });
      expect(screen.queryByTestId("settings-tabs")).toBeNull();
      mockDesktop.mockReturnValue(true);
      await act(async () => {
        await updateAccount({ displayCurrency: "CHF" });
      });
      expect(await screen.findByTestId("settings-tabs")).toBeTruthy();
      expect(screen.getByTestId("settings-tab-help")).toBeSelected();

      // Locked again, then unlocked elsewhere: "Settings" opens on its first tab.
      await fireEvent.press(screen.getByTestId("till-mode"));
      await waitFor(() => expect(getAccountWalletId()).toBeNull());
      await fireEvent.press(screen.getByTestId("sidebar-employees"));
      await waitFor(() => expect(router.getPathname()).toBe("/employees"));
      await fireEvent.press(screen.getByTestId("sidebar-settings"));
      await waitFor(() => expect(router.getPathname()).toBe("/settings"));
      expect(await screen.findByTestId("settings")).toBeTruthy();
      expect(screen.getByTestId("settings-tab-business")).toBeSelected();
    });

    it("unlocks from the title's right on a computer, the tab shown kept", async () => {
      mockDesktop.mockReturnValue(true);
      await openApp("/settings", { home: "/settings" });
      expect(await screen.findByTestId("settings-locked")).toBeTruthy();
      await fireEvent.press(screen.getByTestId("settings-tab-help"));
      expect(await screen.findByTestId("support-contact")).toBeEnabled();
      await fireEvent.press(screen.getByTestId("settings-unlock"));
      await waitFor(() => expect(getAccountWalletId()).toBe(WALLET));
      expect(await screen.findByTestId("settings")).toBeTruthy();
      expect(screen.getByTestId("settings-tab-help")).toBeSelected();
      expect(await screen.findByTestId("support-reports")).toBeEnabled();
    });

    it("forgets a locked tab whose passkey was dismissed: a later unlock opens the first", async () => {
      mockDesktop.mockReturnValue(true);
      const { router } = await openApp("/settings", { home: "/settings" });
      expect(await screen.findByTestId("settings-locked")).toBeTruthy();
      signIn.mockRejectedValueOnce(new PasskeyError("cancelled", "Dismissed"));
      await fireEvent.press(screen.getByTestId("settings-tab-payouts"));
      await waitFor(() => expect(signIn).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(screen.getByTestId("settings-unlock")).toBeEnabled());
      expect(getAccountWalletId()).toBeNull();
      // Still till mode, the tab shown unchanged.
      expect(screen.getByTestId("settings-tab-business")).toBeSelected();

      // Unlocked elsewhere (a row of the side bar), then "Settings": its first tab.
      await fireEvent.press(screen.getByTestId("sidebar-employees"));
      await waitFor(() => expect(router.getPathname()).toBe("/employees"));
      expect(getAccountWalletId()).toBe(WALLET);
      await fireEvent.press(screen.getByTestId("sidebar-settings"));
      await waitFor(() => expect(router.getPathname()).toBe("/settings"));
      expect(await screen.findByTestId("settings")).toBeTruthy();
      expect(screen.getByTestId("settings-tab-business")).toBeSelected();
    });

    it("keeps a computer's locked tabs from asking until the SDK is loaded (web)", async () => {
      mockDesktop.mockReturnValue(true);
      const load = loadingSdk();
      await openApp("/settings", { home: "/settings" });
      expect(await screen.findByTestId("settings-locked")).toBeTruthy();
      expect(screen.getByTestId("settings-tab-charging")).toBeDisabled();
      expect(screen.getByTestId("settings-unlock")).toBeDisabled();
      await fireEvent.press(screen.getByTestId("settings-tab-charging"));
      // What the till shows stays open meanwhile.
      expect(screen.getByTestId("settings-tab-help")).toBeEnabled();
      expect(signIn).not.toHaveBeenCalled();

      await load();
      expect(screen.getByTestId("settings-tab-charging")).toBeEnabled();
      await fireEvent.press(screen.getByTestId("settings-tab-charging"));
      await waitFor(() => expect(getAccountWalletId()).toBe(WALLET));
      expect(await screen.findByTestId("settings-panel-charging")).toBeTruthy();
    });

    it("turns the app's lock on and off with the account open, from the next opening", async () => {
      const { router } = await openApp("/", { rooted: true });
      await fireEvent.press(screen.getByTestId("dock-unlock"));
      await waitFor(() => expect(getAccountWalletId()).toBe(WALLET));
      await fireEvent.press(await screen.findByLabelText("Settings"));
      await waitFor(() => expect(router.getPathname()).toBe("/settings"));
      await fireEvent.press(await screen.findByTestId("settings-card-security"));
      await waitFor(() => expect(router.getPathname()).toBe("/settings/security"));
      const toggle = await screen.findByTestId("unlock-asks-switch");
      // A business's device: off by default.
      expect(toggle.props.accessibilityState).toMatchObject({ checked: false });
      await fireEvent(toggle, "valueChange", true);
      await waitFor(() =>
        expect(parseAppLock(secureStore.items.get(APP_LOCK_KEY) ?? null)).toBe(true)
      );
      expect(screen.getByTestId("unlock-asks-row")).toHaveTextContent(/Each time the app opens/);
      // Not at once: from the next time the app is brought back.
      expect(screen.queryByTestId("app-lock")).toBeNull();
      expect(localAuth.prompts()).toBe(0);
      await appState("background");
      await appState("active");
      await waitFor(() => expect(localAuth.prompts()).toBe(1));
      await waitFor(() => expect(screen.queryByTestId("app-lock")).toBeNull());
      // Till mode untouched: the account stays open, its own lock (5 min) unchanged.
      expect(getAccountWalletId()).toBe(WALLET);

      await fireEvent(screen.getByTestId("unlock-asks-switch"), "valueChange", false);
      await waitFor(() =>
        expect(parseAppLock(secureStore.items.get(APP_LOCK_KEY) ?? null)).toBe(false)
      );
      await appState("background");
      await appState("active");
      expect(screen.queryByTestId("app-lock")).toBeNull();
      expect(localAuth.prompts()).toBe(1);
    });

    it("still goes back to till mode after 5 minutes without activity, the app's lock on", async () => {
      secureStore.items.set(APP_LOCK_KEY, serializeAppLock(true));
      await openApp("/", { rooted: true });
      await waitFor(() => expect(localAuth.prompts()).toBe(1));
      await waitFor(() => expect(screen.queryByTestId("app-lock")).toBeNull());
      await fireEvent.press(screen.getByTestId("dock-unlock"));
      await waitFor(() => expect(getAccountWalletId()).toBe(WALLET));
      await backAfter(AUTO_LOCK_AFTER_MS + 60_000);
      await waitFor(() => expect(getAccountWalletId()).toBeNull());
      // The biometrics asked again as it came back, the till under them.
      await waitFor(() => expect(localAuth.prompts()).toBe(2));
      await waitFor(() => expect(screen.queryByTestId("app-lock")).toBeNull());
      expect(screen.getByTestId("dock-unlock")).toBeTruthy();
    });
  });

  describe("the app's own lock", () => {
    /**
     * A business's device, "Ask for biometrics to unlock the app" turned on: the only
     * one with that lock (a card holder's has its passkey asked as the app opens instead).
     */
    function lockedBusiness() {
      secureStore.items.set(APP_LOCK_KEY, serializeAppLock(true));
    }
    const LOCKED = { rooted: true };

    it("hides a business's app as it opens until the device's biometrics, then the till as it was", async () => {
      lockedBusiness();
      const release = localAuth.holdNextPrompt();
      await openApp("/", LOCKED);
      expect(await screen.findByTestId("app-lock")).toBeTruthy();
      await waitFor(() => expect(localAuth.prompts()).toBe(1));
      expect(localAuth.authenticateAsync.mock.calls[0]![0]).toMatchObject({
        promptMessage: "Unlock sattle.me",
        cancelLabel: "Cancel",
        disableDeviceFallback: false
      });
      // Nothing of the app within reach meanwhile.
      expect(screen.queryByTestId("dock-unlock")).toBeNull();
      await act(async () => release());
      await waitFor(() => expect(screen.queryByTestId("app-lock")).toBeNull());
      // Till mode as before: the till, the passkey not asked, the account closed.
      expect(screen.getByTestId("dock-unlock")).toBeTruthy();
      expect(screen.queryByLabelText(/^Wallet/)).toBeNull();
      expect(signIn).not.toHaveBeenCalled();
      expect(getAccountWalletId()).toBeNull();
    });

    it("never hides a card holder's app, its choice saved on before: its passkey is asked instead", async () => {
      // No app lock on a 100 % card account.
      await saveMerchantSettings(WALLET, { ...settings, usage: "card" });
      secureStore.items.set(APP_LOCK_KEY, serializeAppLock(true));
      let confirm!: () => void;
      signIn.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            confirm = () => resolve({ seed: testSeed(), credentialId: null });
          })
      );
      await openApp("/", { holder: true, home: "/cards", rooted: true });
      await waitFor(() => expect(signIn).toHaveBeenCalledTimes(1));
      expect(screen.queryByTestId("app-lock")).toBeNull();
      await act(async () => confirm());
      expect(await screen.findByText("Add your first card")).toBeTruthy();
      // Nor when it comes back: "Cards" as it was.
      await appState("background");
      expect(screen.queryByTestId("app-lock")).toBeNull();
      await appState("active");
      await act(async () => undefined);
      expect(screen.queryByTestId("app-lock")).toBeNull();
      expect(localAuth.prompts()).toBe(0);
      // No choice to make in "Settings": its "Security" holds its recovery phrase only.
      await fireEvent.press(screen.getByLabelText("Settings"));
      expect(await screen.findByTestId("settings-card-network")).toBeTruthy();
      await fireEvent.press(screen.getByTestId("settings-card-security"));
      expect(await screen.findByTestId("recovery-open")).toBeTruthy();
      expect(screen.queryByTestId("unlock-asks-row")).toBeNull();
    });

    it("asks nothing on a business's device by default", async () => {
      await openApp("/", { rooted: true });
      await act(async () => undefined);
      expect(screen.queryByTestId("app-lock")).toBeNull();
      expect(localAuth.prompts()).toBe(0);
    });

    it('stays hidden when the biometrics are refused, until "Unlock"', async () => {
      lockedBusiness();
      localAuth.answerNext("user_cancel");
      await openApp("/", LOCKED);
      const unlockButton = await screen.findByTestId("app-lock-unlock");
      expect(screen.getByTestId("app-lock")).toHaveTextContent(/App locked/);
      // Not asked again by itself.
      await act(async () => undefined);
      expect(localAuth.prompts()).toBe(1);
      await fireEvent.press(unlockButton);
      await waitFor(() => expect(screen.queryByTestId("app-lock")).toBeNull());
      expect(localAuth.prompts()).toBe(2);
    });

    it("hides it again when brought back from the background, not from what the app opened itself (Android)", async () => {
      const android = jest.replaceProperty(Platform, "OS", "android");
      try {
        await passkeyTripOnAndroid();
      } finally {
        android.restore();
      }
    });

    async function passkeyTripOnAndroid() {
      lockedBusiness();
      await openApp("/", LOCKED);
      await waitFor(() => expect(screen.queryByTestId("app-lock")).toBeNull());
      expect(localAuth.prompts()).toBe(1);
      // The passkey's prompt puts the app in the background (Android): not a departure.
      signIn.mockImplementationOnce(() =>
        withSystemUi(async () => {
          await appState("background");
          await appState("active");
          return { seed: testSeed(), credentialId: null };
        })
      );
      await fireEvent.press(screen.getByTestId("dock-unlock"));
      await waitFor(() => expect(getAccountWalletId()).toBe(WALLET));
      expect(await screen.findByLabelText("Wallet")).toBeTruthy();
      expect(screen.queryByTestId("app-lock")).toBeNull();
      expect(localAuth.prompts()).toBe(1);
      // The holder leaving and coming back: hidden, the biometrics asked.
      const release = localAuth.holdNextPrompt();
      await appState("background");
      expect(screen.getByTestId("app-lock")).toBeTruthy();
      await appState("active");
      await waitFor(() => expect(localAuth.prompts()).toBe(2));
      await act(async () => release());
      await waitFor(() => expect(screen.queryByTestId("app-lock")).toBeNull());
      // The account open still: within its own 5 minutes.
      expect(getAccountWalletId()).toBe(WALLET);
    }

    it("takes only an instant for a card handed over on Android, not the whole wait for it", async () => {
      const android = jest.replaceProperty(Platform, "OS", "android");
      let tapped!: () => void;
      try {
        lockedBusiness();
        await openApp("/", LOCKED);
        await waitFor(() => expect(screen.queryByTestId("app-lock")).toBeNull());
        expect(localAuth.prompts()).toBe(1);
        // A card awaited (pairing, the point of sale's reading).
        const reading = withCardPause(
          () =>
            new Promise<void>((resolve) => {
              tapped = resolve;
            })
        );
        // The card handed over: Android pauses the app an instant.
        await appState("background");
        await appState("active");
        await act(async () => undefined);
        expect(screen.queryByTestId("app-lock")).toBeNull();
        expect(localAuth.prompts()).toBe(1);
        // The holder leaving while it waits: a departure.
        await appState("background");
        const restoreClock = clockAhead(CARD_PAUSE_MS);
        try {
          await appState("active");
        } finally {
          restoreClock();
        }
        await waitFor(() => expect(localAuth.prompts()).toBe(2));
        await act(async () => {
          tapped();
          await reading;
        });
        await waitFor(() => expect(screen.queryByTestId("app-lock")).toBeNull());
      } finally {
        android.restore();
      }
    });

    it("takes leaving while the share sheet shows for leaving on iOS, which shows it within the app", async () => {
      lockedBusiness();
      await openApp("/", LOCKED);
      await waitFor(() => expect(screen.queryByTestId("app-lock")).toBeNull());
      // The passkey's prompt makes the app inactive only: nothing asked.
      signIn.mockImplementationOnce(async () => {
        await appState("inactive");
        await appState("active");
        return { seed: testSeed(), credentialId: null };
      });
      await fireEvent.press(screen.getByTestId("dock-unlock"));
      await waitFor(() => expect(getAccountWalletId()).toBe(WALLET));
      expect(await screen.findByLabelText("Wallet")).toBeTruthy();
      expect(screen.queryByTestId("app-lock")).toBeNull();
      expect(localAuth.prompts()).toBe(1);
      // The share sheet showing, the holder leaves the app.
      let close!: () => void;
      const share = jest.spyOn(Share, "share").mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            close = () => resolve({ action: Share.dismissedAction, activityType: undefined });
          })
      );
      try {
        const shared = shareWithSystem({ message: "lightning:lnbc1" });
        await appState("background");
        expect(screen.getByTestId("app-lock")).toBeTruthy();
        await appState("active");
        await waitFor(() => expect(localAuth.prompts()).toBe(2));
        await act(async () => {
          close();
          await shared;
        });
      } finally {
        share.mockRestore();
      }
      await waitFor(() => expect(screen.queryByTestId("app-lock")).toBeNull());
    });

    it("hides what a link opens over it, outside the account's screens too", async () => {
      lockedBusiness();
      const release = localAuth.holdNextPrompt();
      const { router } = await openApp("/", LOCKED);
      expect(await screen.findByTestId("app-lock")).toBeTruthy();
      await act(async () => appRouter().push("/pay"));
      await waitFor(() => expect(router.getPathname()).toBe("/pay"));
      expect(screen.getByTestId("app-lock")).toBeTruthy();
      expect(screen.queryByTestId("pay-page")).toBeNull();
      expect(screen.getByTestId("pay-page", { includeHiddenElements: true })).toBeTruthy();
      await act(async () => release());
      await waitFor(() => expect(screen.queryByTestId("app-lock")).toBeNull());
      expect(screen.getByTestId("pay-page")).toBeTruthy();
    });

    it("stays hidden over the app's screens mounted again by a link", async () => {
      lockedBusiness();
      await openApp("/", LOCKED);
      await waitFor(() => expect(screen.queryByTestId("app-lock")).toBeNull());
      await fireEvent.press(screen.getByTestId("dock-unlock"));
      await waitFor(() => expect(getAccountWalletId()).toBe(WALLET));
      expect(await screen.findByLabelText("Wallet")).toBeTruthy();
      // The holder leaves, the account open; a link to the app's start brings it back.
      const release = localAuth.holdNextPrompt();
      await appState("background");
      await act(async () => appRouter().replace("/"));
      await appState("active");
      await waitFor(() => expect(localAuth.prompts()).toBe(2));
      expect(screen.getByTestId("app-lock")).toBeTruthy();
      expect(screen.queryByTestId("dock-more")).toBeNull();
      await act(async () => release("user_cancel"));
      // Refused: still hidden, the account's screens out of reach.
      expect(await screen.findByTestId("app-lock-unlock")).toBeTruthy();
      expect(screen.queryByTestId("dock-more")).toBeNull();
    });

    it("covers a panel left open, which stays as it was under it", async () => {
      lockedBusiness();
      await openApp("/", LOCKED);
      await waitFor(() => expect(screen.queryByTestId("app-lock")).toBeNull());
      await fireEvent.press(screen.getByTestId("dock-unlock"));
      await waitFor(() => expect(getAccountWalletId()).toBe(WALLET));
      expect(await screen.findByLabelText("Wallet")).toBeTruthy();
      // An app of 3.0.0 at the point of sale opens "What's new" by itself: closed first, gone.
      expect(await screen.findByTestId(LATEST_NOTES)).toBeTruthy();
      await fireEvent.press(screen.getAllByLabelText("Close")[0]!);
      await waitFor(() =>
        expect(screen.queryByTestId("whats-new", { includeHiddenElements: true })).toBeNull()
      );
      await fireEvent.press(await screen.findByLabelText("Settings"));
      await fireEvent.press(await screen.findByTestId("logout"));
      expect(await screen.findByText("Log out of this device?")).toBeTruthy();
      const release = localAuth.holdNextPrompt();
      await appState("background");
      await appState("active");
      // Over the screens and in the panel's own window.
      expect(screen.getAllByTestId("app-lock", { includeHiddenElements: true })).toHaveLength(2);
      expect(screen.queryByText("Log out of this device?")).toBeNull();
      await act(async () => release());
      await waitFor(() => expect(screen.queryByTestId("app-lock")).toBeNull());
      expect(screen.getByText("Log out of this device?")).toBeTruthy();
    });

    it("shows the app on a device without any lock, which cannot ask", async () => {
      lockedBusiness();
      localAuth.setDeviceLock(localAuth.SecurityLevel.NONE);
      await openApp("/", LOCKED);
      await waitFor(() => expect(screen.queryByTestId("app-lock")).toBeNull());
      expect(localAuth.prompts()).toBe(0);
    });

    it("greys the choice on a device without any lock, turned off as well", async () => {
      localAuth.setDeviceLock(localAuth.SecurityLevel.NONE);
      const { router } = await openApp("/", { rooted: true });
      await fireEvent.press(screen.getByTestId("dock-unlock"));
      await waitFor(() => expect(getAccountWalletId()).toBe(WALLET));
      await fireEvent.press(await screen.findByLabelText("Settings"));
      await waitFor(() => expect(router.getPathname()).toBe("/settings"));
      await fireEvent.press(await screen.findByTestId("settings-card-security"));
      await waitFor(() => expect(router.getPathname()).toBe("/settings/security"));
      await waitFor(() =>
        expect(screen.getByTestId("unlock-asks-switch").props.accessibilityState).toMatchObject({
          checked: false,
          disabled: true
        })
      );
      expect(screen.getByTestId("unlock-asks-row")).toHaveTextContent(
        /No biometrics or passcode on this device/
      );
    });

    it("asks nothing as the passkey just opened the account (signing in), until the app is left", async () => {
      secureStore.items.set(APP_LOCK_KEY, serializeAppLock(true));
      // The welcome screen: no account on the device, nothing to hide.
      const router = await renderRouter(rootedRoutes, { initialUrl: "/" });
      await act(async () => undefined);
      expect(screen.queryByTestId("app-lock")).toBeNull();
      // Signing in opens the account, then the device's point of sale shows (src/app/index.tsx).
      await act(async () => {
        await openTestAccount();
        const profile = {
          version: 2 as const,
          walletId: WALLET,
          backupKey: testBackupKey(),
          lightningAddress: "sattleme02c6047f94@breez.tips",
          businessName: "Fine Bakery",
          currency: "CHF"
        };
        await saveTerminalProfile(profile);
        publishTerminalProfile(profile);
        appRouter().replace("/pos");
      });
      await waitFor(() => expect(router.getPathname()).toBe("/pos"));
      await act(async () => undefined);
      expect(screen.queryByTestId("app-lock")).toBeNull();
      expect(localAuth.prompts()).toBe(0);
      await appState("background");
      expect(screen.getByTestId("app-lock")).toBeTruthy();
      await appState("active");
      await waitFor(() => expect(localAuth.prompts()).toBe(1));
      await waitFor(() => expect(screen.queryByTestId("app-lock")).toBeNull());
    });

    it("takes a trip to what the app opened for a departure past till mode's delay", async () => {
      lockedBusiness();
      await openApp("/", LOCKED);
      await waitFor(() => expect(screen.queryByTestId("app-lock")).toBeNull());
      expect(localAuth.prompts()).toBe(1);
      // The share sheet, the system's settings…, back within the delay: nothing asked.
      expectSystemUi();
      await appState("background");
      await appState("active");
      await act(async () => undefined);
      expect(screen.queryByTestId("app-lock")).toBeNull();
      expect(localAuth.prompts()).toBe(1);
      // Back after it: the holder may have left the device meanwhile.
      expectSystemUi();
      await appState("background");
      expect(screen.queryByTestId("app-lock")).toBeNull();
      const restoreClock = clockAhead(AUTO_LOCK_AFTER_MS);
      try {
        await appState("active");
      } finally {
        restoreClock();
      }
      await waitFor(() => expect(localAuth.prompts()).toBe(2));
      await waitFor(() => expect(screen.queryByTestId("app-lock")).toBeNull());
    });

    it("takes a code's link once the biometrics lifted the lock", async () => {
      lockedBusiness();
      const release = localAuth.holdNextPrompt();
      const { router } = await openApp("/", LOCKED);
      await waitFor(() => expect(localAuth.prompts()).toBe(1));
      await act(async () => {
        linkListener()({ url: "https://web.example/cards" });
      });
      // Not over the system's biometric prompt.
      expect(signIn).not.toHaveBeenCalled();
      await act(async () => release());
      await waitFor(() => expect(signIn).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(router.getPathname()).toBe("/cards"));
    });
  });

  describe("a card holder's device", () => {
    /**
     * The device of a 100 % card account: its profile a card holder's, no point of sale, no lock of
     * the app's own. `launch`: the passkey asked as the app opens, refused unless `given` (or left
     * to the test: `asIs`).
     */
    async function openHolders(
      initialUrl = "/",
      { launch = "refused" }: { launch?: "refused" | "given" | "asIs" } = {}
    ) {
      await saveMerchantSettings(WALLET, { ...settings, usage: "card" });
      if (launch === "refused") {
        signIn.mockRejectedValueOnce(new PasskeyError("cancelled", "The user cancelled"));
      }
      const opened = await openApp(initialUrl, { holder: true, home: "/cards" });
      if (launch === "refused") {
        await waitFor(() => expect(signIn).toHaveBeenCalledTimes(1));
        await act(async () => undefined);
      }
      return opened;
    }

    it("asks the passkey as the app opens, without a press, then shows the cards", async () => {
      // No "Your cards are locked" to press through.
      let confirm!: () => void;
      signIn.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            confirm = () => resolve({ seed: testSeed(), credentialId: null });
          })
      );
      const { router } = await openHolders("/", { launch: "asIs" });
      await waitFor(() => expect(signIn).toHaveBeenCalledTimes(1));
      // "Unlock" waits on that prompt.
      expect(screen.getByTestId("cards-unlock")).toBeDisabled();
      await act(async () => confirm());
      await waitFor(() => expect(getAccountWalletId()).toBe(WALLET));
      expect(await screen.findByText("Add your first card")).toBeTruthy();
      expect(router.getPathname()).toBe("/cards");
      expect(signIn).toHaveBeenCalledTimes(1);
      expect(connect).not.toHaveBeenCalled();
    });

    it('asks it once for the link printed on a v2 card, then shows "Cards" with the link taken', async () => {
      // Scanned with the phone's camera: its launch and its link ask one
      // passkey between them.
      forgetLaunchLink();
      jest.mocked(Linking.getInitialURL).mockResolvedValueOnce(PRINTED_LINK);
      let confirm!: () => void;
      signIn.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            confirm = () => resolve({ seed: testSeed(), credentialId: null });
          })
      );
      const { router } = await openHolders(printedCardHref("1709-1248-5643-8482", 1), {
        launch: "asIs"
      });
      await waitFor(() => expect(signIn).toHaveBeenCalledTimes(1));
      // Nothing of the cards before the passkey.
      expect(screen.getByTestId("cards-locked")).toBeTruthy();
      await act(async () => confirm());
      await waitFor(() => expect(getAccountWalletId()).toBe(WALLET));
      expect(await screen.findByTestId("cards-screen")).toBeTruthy();
      expect(router.getPathname()).toBe("/cards");
      await waitFor(() => expect(router.getSearchParams()).toEqual({}), { timeout: 8000 });
      expect(signIn).toHaveBeenCalledTimes(1);
    });

    it("asks it once: refused, nothing asked again by itself, nor after a lock", async () => {
      await openHolders();
      expect(screen.getByTestId("cards-locked")).toBeTruthy();
      expect(getAccountWalletId()).toBeNull();
      // No error for a prompt dismissed.
      expect(screen.queryByText("Couldn't unlock")).toBeNull();
      // Back from the background: still "Unlock" to press.
      await appState("background");
      await appState("active");
      await act(async () => undefined);
      expect(signIn).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId("cards-locked")).toBeTruthy();
      await fireEvent.press(screen.getByTestId("cards-unlock"));
      await waitFor(() => expect(getAccountWalletId()).toBe(WALLET));
      expect(signIn).toHaveBeenCalledTimes(2);
      // Locked again (no padlock on a phone: the auto-lock): not asked again.
      await appState("background");
      const restoreClock = clockAhead(AUTO_LOCK_AFTER_MS + 60_000);
      try {
        await appState("active");
      } finally {
        restoreClock();
      }
      expect(await screen.findByTestId("cards-locked")).toBeTruthy();
      await act(async () => undefined);
      expect(signIn).toHaveBeenCalledTimes(2);
    });

    it("asks it once the app is in front, not before; never once it left before", async () => {
      // Opened behind another app: asked as it comes to the front.
      (AppState as { currentState: unknown }).currentState = "inactive";
      await openHolders("/", { launch: "asIs" });
      await act(async () => undefined);
      expect(signIn).not.toHaveBeenCalled();
      await appState("active");
      await waitFor(() => expect(getAccountWalletId()).toBe(WALLET));
      expect(signIn).toHaveBeenCalledTimes(1);
      screen.unmount();

      // Left before it was in front: no longer its launch.
      closeAccount();
      resetLaunchUnlock();
      (AppState as { currentState: unknown }).currentState = "inactive";
      await openHolders("/", { launch: "asIs" });
      await appState("background");
      await appState("active");
      await act(async () => undefined);
      expect(signIn).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId("cards-locked")).toBeTruthy();
    });

    it("asks nothing as the web app opens: browsers ask no passkey without a press", async () => {
      const web = jest.replaceProperty(Platform, "OS", "web");
      try {
        await openHolders("/", { launch: "asIs" });
        await act(async () => undefined);
        expect(signIn).not.toHaveBeenCalled();
        expect(screen.getByTestId("cards-locked")).toBeTruthy();
      } finally {
        web.restore();
      }
    });

    it("asks nothing as a business's device opens: the till needs no passkey", async () => {
      await openApp();
      await act(async () => undefined);
      expect(signIn).not.toHaveBeenCalled();
      expect(screen.getByTestId("dock-unlock")).toBeTruthy();
    });

    it('opens on "Cards" in till mode, without a dock: "Settings" in its header, nothing else', async () => {
      await openHolders();
      expect(screen.getByTestId("cards-locked")).toHaveTextContent(/Your cards are locked/);
      // No dock on a phone: nothing but the header leads away.
      expect(screen.queryByTestId("dock")).toBeNull();
      expect(screen.queryByTestId("dock-padlock")).toBeNull();
      expect(screen.getByTestId("header-settings")).toHaveAccessibleName("Settings");
      expect(screen.queryByTestId("header-cards")).toBeNull();
      // Nothing of a point of sale, nor of a main wallet.
      for (const testID of ["dock-charge", "dock-unlock", "dock-more"]) {
        expect(screen.queryByTestId(testID)).toBeNull();
      }
      expect(screen.queryByLabelText(/^Charge/)).toBeNull();
      expect(screen.queryByLabelText(/^Wallet/)).toBeNull();
      expect(getAccountWalletId()).toBeNull();
      expect(connect).not.toHaveBeenCalled();
    });

    it("sends a link to a point of sale's screen back to Cards", async () => {
      for (const url of ["/pos", "/wallet", "/employees"]) {
        const { router } = await openHolders(url);
        expect(router.getPathname()).toBe("/cards");
        screen.unmount();
      }
      expect(connect).not.toHaveBeenCalled();
    });

    it("shows the cards once the passkey opened the account, never connecting its wallet, and locks again", async () => {
      const { router } = await openHolders();
      await fireEvent.press(screen.getByTestId("cards-unlock"));
      await waitFor(() => expect(getAccountWalletId()).toBe(WALLET));
      expect(await screen.findByText("Add your first card")).toBeTruthy();
      expect(screen.queryByTestId("cards-locked")).toBeNull();
      // Still no dock, and nothing of a point of sale once unlocked.
      expect(screen.queryByTestId("dock")).toBeNull();
      expect(screen.queryByLabelText(/^Charge/)).toBeNull();
      expect(screen.queryByLabelText(/^Wallet/)).toBeNull();

      await fireEvent.press(screen.getByTestId("header-settings"));
      await waitFor(() => expect(router.getPathname()).toBe("/settings"));
      expect(await screen.findByTestId("merchant-create")).toBeTruthy();
      expect(screen.queryByTestId("header-settings")).toBeNull();
      // Its recovery phrase: its words open its cards' wallets too ("Open with my 12 words").
      expect(screen.getByTestId("settings-card-security")).toBeTruthy();
      await act(async () => appRouter().push("/settings/recovery"));
      await waitFor(() => expect(router.getPathname()).toBe("/settings/recovery"));
      expect(await screen.findByTestId("recovery-screen")).toBeTruthy();
      await act(async () => appRouter().back());
      await waitFor(() => expect(router.getPathname()).toBe("/settings"));

      // Back to "Cards" from the header.
      await fireEvent.press(screen.getByTestId("header-cards"));
      await waitFor(() => expect(router.getPathname()).toBe("/cards"));
      expect(screen.getByText("Add your first card")).toBeTruthy();

      // No padlock: the auto-lock locks the app, "Cards" locked.
      await appState("background");
      const restoreClock = clockAhead(AUTO_LOCK_AFTER_MS + 60_000);
      try {
        await appState("active");
      } finally {
        restoreClock();
      }
      await waitFor(() => expect(router.getPathname()).toBe("/cards"));
      expect(await screen.findByTestId("cards-locked")).toBeTruthy();
      expect(getAccountWalletId()).toBeNull();
      expect(connect).not.toHaveBeenCalled();
    });

    it('shows "Settings" reduced in till mode, back to "Cards" from its header', async () => {
      const { router } = await openHolders();
      await fireEvent.press(screen.getByTestId("header-settings"));
      await waitFor(() => expect(router.getPathname()).toBe("/settings"));
      expect(await screen.findByTestId("settings-card-network")).toBeDisabled();
      // Shown, greyed: the passkey opens it (as the other rubrics of the account).
      expect(screen.getByTestId("merchant-create")).toBeDisabled();
      // Its recovery phrase greyed, as the other rubrics of the account: nothing of it shows
      // before the passkey.
      expect(screen.getByTestId("settings-card-security")).toBeDisabled();
      expect(screen.queryByText("Recovery phrase")).toBeNull();
      // The terms and the privacy policy open as unlocked.
      expect(screen.getByTestId("settings-legal-privacy")).toBeEnabled();
      expect(screen.getByTestId("settings-legal-terms")).toBeEnabled();
      expect(getAccountWalletId()).toBeNull();
      expect(screen.getByTestId("header-cards")).toHaveAccessibleName("Back");
      await fireEvent.press(screen.getByTestId("header-cards"));
      await waitFor(() => expect(router.getPathname()).toBe("/cards"));
      expect(screen.getByTestId("cards-locked")).toBeTruthy();
    });

    it('has "Cards" and "Settings" only in the side bar of a computer', async () => {
      mockDesktop.mockReturnValue(true);
      await openHolders();
      expect(await screen.findByTestId("sidebar-cards")).toBeTruthy();
      expect(screen.getByTestId("sidebar-settings")).toBeTruthy();
      // The terms and the privacy policy, without a business card.
      expect(screen.getByTestId("sidebar-legal-privacy")).toBeTruthy();
      expect(screen.getByTestId("sidebar-legal-terms")).toBeTruthy();
      for (const destination of ["pos", "wallet", "articles", "employees", "integrations"]) {
        expect(screen.queryByTestId(`sidebar-${destination}`)).toBeNull();
      }
      expect(screen.queryByTestId("sidebar-group-sales")).toBeNull();
    });

    it('centres "Unlock" under the lines over it on a computer', async () => {
      mockDesktop.mockReturnValue(true);
      await openHolders();
      const unlock = StyleSheet.flatten(screen.getByTestId("cards-unlock").props.style);
      // As wide as its label, not the column's width, and not aligned to its start.
      expect(unlock.width).toBeUndefined();
      expect(unlock.alignSelf).toBe("center");
    });
  });

  describe("desktop side bar", () => {
    beforeEach(() => mockDesktop.mockReturnValue(true));

    it("shows every row, padlocked but the point of sale, and opens the row clicked once unlocked", async () => {
      const { router } = await openApp();
      // "Sales" above "Charge" (named as in the dock), alone: the invoices are in "Wallet", in
      // "Manage".
      expect(screen.getByText("Sales")).toBeTruthy();
      expect(screen.getByTestId("sidebar-pos").props.accessibilityLabel).toBe("Charge");
      expect(screen.queryByTestId("sidebar-invoices")).toBeNull();
      expect(screen.getByLabelText("Wallet, locked: unlock with your passkey")).toBeTruthy();
      expect(screen.getByLabelText("Cards, locked: unlock with your passkey")).toBeTruthy();
      // "Switch to till mode" is folded away until unlocked.
      expect(screen.queryByTestId("till-mode")).toBeNull();

      await fireEvent.press(screen.getByTestId("sidebar-integrations"));
      await waitFor(() => expect(getAccountWalletId()).toBe(WALLET));
      // After the passkey, the row clicked shows, without a second click.
      await waitFor(() => expect(router.getPathname()).toBe("/integrations"));
      // "Integrations" is its own screen (src/features/integrations/), not a placeholder.
      expect(screen.getByTestId("integrations")).toBeTruthy();
      expect(screen.getByTestId("sidebar-integrations").props.accessibilityState.selected).toBe(
        true
      );
      expect(signIn).toHaveBeenCalledTimes(1);
      expect(screen.getByLabelText("Wallet")).toBeTruthy();

      await fireEvent.press(screen.getByTestId("sidebar-employees"));
      await waitFor(() => expect(router.getPathname()).toBe("/employees"));
      // "Employees" is the team screen (src/features/team/), not a placeholder.
      expect(screen.getByTestId("employees")).toBeTruthy();

      await fireEvent.press(screen.getByTestId("till-mode"));
      await waitFor(() => expect(router.getPathname()).toBe("/pos"));
      expect(getAccountWalletId()).toBeNull();
    });

    it("stays on the till when the passkey is dismissed or another account's", async () => {
      const { router } = await openApp();
      signIn.mockRejectedValueOnce(new PasskeyError("cancelled", "Dismissed"));
      await fireEvent.press(screen.getByTestId("sidebar-integrations"));
      await waitFor(() => expect(signIn).toHaveBeenCalledTimes(1));
      await waitFor(() =>
        expect(screen.getByTestId("sidebar-integrations").props.accessibilityState.busy).toBe(false)
      );
      await act(async () => undefined);
      expect(router.getPathname()).toBe("/pos");
      expect(getAccountWalletId()).toBeNull();

      signIn.mockResolvedValueOnce({ seed: testSeed(OTHER_TEST_MNEMONIC), credentialId: null });
      await fireEvent.press(screen.getByTestId("sidebar-wallet"));
      expect(await screen.findByText("Couldn't unlock")).toBeTruthy();
      await act(async () => undefined);
      expect(router.getPathname()).toBe("/pos");
      expect(getAccountWalletId()).toBeNull();

      // The next unlock opens its own row, not one of the attempts before it.
      await fireEvent.press(screen.getByTestId("sidebar-employees"));
      await waitFor(() => expect(router.getPathname()).toBe("/employees"));
      expect(getAccountWalletId()).toBe(WALLET);
      expect(signIn).toHaveBeenCalledTimes(3);
    });

    describe("a row chosen while the account opens", () => {
      /** The passkey, held until the result is called (the account then opens). */
      function heldPasskey(): () => Promise<void> {
        let accept!: () => void;
        signIn.mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              accept = () => resolve({ seed: testSeed(), credentialId: null });
            })
        );
        return async () => {
          await act(async () => accept());
          await waitFor(() => expect(getAccountWalletId()).toBe(WALLET));
        };
      }

      it("opens the locked row clicked last, with a single passkey prompt", async () => {
        const { router } = await openApp();
        const accept = heldPasskey();
        await fireEvent.press(screen.getByTestId("sidebar-integrations"));
        await fireEvent.press(screen.getByTestId("sidebar-employees"));

        await accept();
        await waitFor(() => expect(router.getPathname()).toBe("/employees"));
        expect(signIn).toHaveBeenCalledTimes(1);
      });

      it('stays on the point of sale once "Charge" is chosen', async () => {
        const { router } = await openApp();
        const accept = heldPasskey();
        await fireEvent.press(screen.getByTestId("sidebar-integrations"));
        expect(screen.getByTestId("sidebar-integrations").props.accessibilityState.busy).toBe(true);
        await fireEvent.press(screen.getByTestId("sidebar-pos"));
        // Its padlock no longer pulses: it will not open.
        expect(screen.getByTestId("sidebar-integrations").props.accessibilityState.busy).toBe(
          false
        );

        await accept();
        await act(async () => undefined);
        expect(router.getPathname()).toBe("/pos");
        // Unlocked all the same.
        expect(screen.getByLabelText("Integrations")).toBeTruthy();
      });
    });

    it("shows the point of sale as it was left, its invoice included, under no second keypad", async () => {
      const { router } = await openApp();
      for (const key of ["5", "0", "0"]) await fireEvent.press(screen.getByTestId(`key-${key}`));
      await fireEvent.press(screen.getByTestId("charge"));
      await waitFor(() => expect(router.getPathname()).toBe("/pos/charge"));

      // A locked row, from the invoice: its screen once unlocked.
      await fireEvent.press(screen.getByTestId("sidebar-integrations"));
      await waitFor(() => expect(router.getPathname()).toBe("/integrations"));
      expect(getAccountWalletId()).toBe(WALLET);
      // Back to the invoice, not to a keypad pushed over it (the invoice still mounted below).
      await fireEvent.press(screen.getByTestId("sidebar-pos"));
      await waitFor(() => expect(router.getPathname()).toBe("/pos/charge"));
      expect(posScreens(router)).toEqual(["index", "charge"]);

      // Till mode from another destination: the invoice too.
      await fireEvent.press(screen.getByTestId("sidebar-integrations"));
      await waitFor(() => expect(router.getPathname()).toBe("/integrations"));
      await fireEvent.press(screen.getByTestId("till-mode"));
      await waitFor(() => expect(getAccountWalletId()).toBeNull());
      await act(async () => undefined);
      expect(router.getPathname()).toBe("/pos/charge");
      expect(posScreens(router)).toEqual(["index", "charge"]);

      // The row, from the invoice: the keypad below it.
      await fireEvent.press(screen.getByTestId("sidebar-pos"));
      await waitFor(() => expect(router.getPathname()).toBe("/pos"));
      expect(posScreens(router)).toEqual(["index"]);
    });

    it("leaves an invoice without a sale (a reload) for the keypad", async () => {
      const { router } = await openApp("/pos/charge");
      expect(posScreens(router)).toEqual(["index"]);
    });

    describe('an invoice waiting in "Charge"', () => {
      /** An invoice left waiting for another destination, unlocked, then a narrower window. */
      async function invoiceLeftWaiting() {
        // The LNURL server never answers: the invoice is still being created, it waits.
        jest.mocked(globalThis.fetch).mockImplementation(() => new Promise<Response>(() => {}));
        const { router } = await openApp();
        expect(dot("sidebar-pos-pending")).toBeNull();

        for (const key of ["5", "0", "0"]) await fireEvent.press(screen.getByTestId(`key-${key}`));
        await fireEvent.press(screen.getByTestId("charge"));
        await waitFor(() => expect(router.getPathname()).toBe("/pos/charge"));
        // The invoice shown: no dot.
        expect(dot("sidebar-pos-pending")).toBeNull();
        expect(screen.getByTestId("sidebar-pos").props.accessibilityLabel).toBe("Charge");

        // A locked row, from the invoice: its screen once unlocked, the invoice still waiting,
        // its dot right of "Charge".
        await fireEvent.press(screen.getByTestId("sidebar-employees"));
        await waitFor(() => expect(router.getPathname()).toBe("/employees"));
        expect(getAccountWalletId()).toBe(WALLET);
        expect(dot("sidebar-pos-pending")).toBeTruthy();
        expect(screen.getByTestId("sidebar-pos").props.accessibilityLabel).toBe(
          "Charge, invoice in progress"
        );
        // No other row has one.
        expect(dot("sidebar-employees-pending")).toBeNull();

        // A tablet turned: the next render draws the dock instead of the side bar.
        mockDesktop.mockReturnValue(false);
        await fireEvent.press(screen.getByTestId("sidebar-integrations"));
        await waitFor(() => expect(router.getPathname()).toBe("/integrations"));
        expect(screen.queryByTestId("sidebar-pos")).toBeNull();
        return { router };
      }

      /** Decorative: found with the hidden elements only. */
      const dot = (testID: string) => screen.queryByTestId(testID, { includeHiddenElements: true });

      it("shows a pending dot right of it in the side bar, and on its icon in the dock", async () => {
        const { router } = await invoiceLeftWaiting();
        // "Charge" is the dock's first slot by default.
        expect(dot("dock-slot-0-pending")).toBeTruthy();
        expect(screen.getByTestId("dock-slot-0").props.accessibilityLabel).toBe(
          "Charge, invoice in progress"
        );
        expect(dot("dock-slot-1-pending")).toBeNull();

        // Back to the invoice: the dock hides, its dot held through the fade-out, then gone.
        await fireEvent.press(screen.getByTestId("dock-slot-0"));
        await waitFor(() => expect(router.getPathname()).toBe("/pos/charge"));
        expect(dot("dock-slot-0-pending")).toBeTruthy();
        await waitFor(() => expect(dot("dock-slot-0-pending")).toBeNull());
        // "Back": no invoice left, no dot.
        await fireEvent.press(screen.getByTestId("charge-back"));
        await waitFor(() => expect(router.getPathname()).toBe("/pos"));
        expect(dot("dock-slot-0-pending")).toBeNull();
        expect(screen.getByTestId("dock-slot-0").props.accessibilityLabel).toBe("Charge");
      });

      it('shows it on "More" and on its tile there when the dock leaves it out', async () => {
        await saveDock(["articles", "wallet", "employees", "settings"]);
        await invoiceLeftWaiting();
        // On "More", which holds it.
        expect(dot("dock-more-pending")).toBeTruthy();
        expect(screen.getByTestId("dock-more").props.accessibilityLabel).toBe(
          "More, current screen: Integrations (Charge, invoice in progress)"
        );

        await fireEvent.press(screen.getByTestId("dock-more"));
        expect(dot("more-pos-pending")).toBeTruthy();
        expect(screen.getByTestId("more-pos").props.accessibilityLabel).toBe(
          "Charge, invoice in progress"
        );
        expect(dot("more-integrations-pending")).toBeNull();
        // Open, the cross carries none: the tile does.
        expect(dot("dock-more-pending")).toBeNull();
      });

      it('shows none on "More" while the dock holds it', async () => {
        await invoiceLeftWaiting();
        expect(dot("dock-slot-0-pending")).toBeTruthy();
        expect(dot("dock-more-pending")).toBeNull();
      });

      it("shows none in till mode, the dock's pill fading out after a lock included", async () => {
        const { router } = await invoiceLeftWaiting();
        // "Switch to till mode" from another screen: the invoice again, the dock leaving.
        await fireEvent.press(screen.getByTestId("dock-more"));
        await fireEvent.press(screen.getAllByTestId("till-mode")[0]);
        await waitFor(() => expect(getAccountWalletId()).toBeNull());
        expect(router.getPathname()).toBe("/pos/charge");
        // The till-mode pill shows while the dock fades out: without a dot.
        const pill = screen.getByTestId("dock-charge", { includeHiddenElements: true });
        expect(pill).toHaveAccessibleName("Charge");
        expect(within(pill).queryAllByTestId(/pending/, { includeHiddenElements: true })).toEqual(
          []
        );
      });
    });

    it("shows spinners instead of the padlocks until the SDK is loaded (web)", async () => {
      const load = loadingSdk();
      const { router } = await openApp();
      expect(spinner("sidebar-wallet-spinner")).toBeTruthy();
      expect(spinner("sidebar-employees-spinner")).toBeTruthy();
      // The point of sale has no padlock, nor has "Settings", reduced in till mode.
      expect(spinner("sidebar-pos-spinner")).toBeNull();
      expect(spinner("sidebar-settings-spinner")).toBeNull();
      expect(screen.getByTestId("sidebar-wallet").props.accessibilityState).toMatchObject({
        busy: true,
        disabled: true
      });
      await fireEvent.press(screen.getByTestId("sidebar-wallet"));
      expect(signIn).not.toHaveBeenCalled();

      await load();
      expect(spinner("sidebar-wallet-spinner")).toBeNull();
      // Not the wallet's row: its screen, once shown, would connect the wallet (tested elsewhere).
      await fireEvent.press(screen.getByTestId("sidebar-employees"));
      await waitFor(() => expect(getAccountWalletId()).toBe(WALLET));
      await waitFor(() => expect(router.getPathname()).toBe("/employees"));
    });

    it("shows the business in its card", async () => {
      await openApp();
      const card = screen.getByTestId("business-card");
      // The initials, hidden from screen readers: the name follows them.
      expect(
        within(card).getByTestId("business-avatar", { includeHiddenElements: true })
      ).toHaveTextContent("FB", { exact: true });
      expect(within(card).getByText("Fine Bakery")).toBeTruthy();
      // Nothing to edit there: the device has no name of its own.
      expect(card.props.accessibilityRole).toBeUndefined();
      expect(screen.queryByText("Name this device")).toBeNull();
    });

    const ORDER = [
      "sidebar-version",
      "sidebar-legal-terms",
      "sidebar-legal-privacy",
      "business-card",
      "till-mode"
    ];

    it("shows the build by the logo, the business card at the bottom", async () => {
      await openApp();
      const line = screen.getByTestId("sidebar-version");
      // The commit alone in staging, the whole build for screen readers.
      expect(versionParts(line)).toEqual(["f82ecab"]);
      // It opens "What's new", which an app of 3.0.0 opened by itself at the point of sale, in till
      // mode too: no dot left.
      expect(await screen.findByTestId(LATEST_NOTES)).toBeTruthy();
      expect(line.props.accessibilityLabel).toBe("What's new, Version 3.0.0 · f82ecab · staging");
      expect(screen.queryByTestId("sidebar-version-unread")).toBeNull();
      // The build at the top, then the terms and the privacy policy above the business card,
      // "Switch to till mode" at its end (faded out in till mode): nothing moves when the account
      // opens.
      const order = screen.container
        .queryAll((node) => ORDER.includes(node.props.testID))
        .map((node) => node.props.testID);
      expect(order).toEqual(ORDER);
    });
  });

  // The yearly check of the 12 words (src/features/recovery-check/).
  describe("the check of the 12 words", () => {
    const DAY = 86_400;
    const WORDS = TEST_MNEMONIC.split(" ");

    /** This device's account with a check due since `days` days. */
    async function dueSince(days: number) {
      await saveMerchantSettings(WALLET, {
        ...settings,
        // Due: the account was seen above the threshold.
        recoveryCheck: {
          verifiedAt: null,
          dueSince: nowUnix() - days * DAY,
          aboveThresholdAt: nowUnix() - days * DAY
        }
      });
    }

    async function unlock() {
      await fireEvent.press(screen.getByTestId("dock-unlock"));
      await waitFor(() => expect(getAccountWalletId()).toBe(WALLET));
    }

    /** The 12 words typed one by one on "Check your 12 words". */
    async function typeWords(words: readonly string[]) {
      await fireEvent.press(await screen.findByTestId("recovery-check-start"));
      for (const [index, word] of words.entries()) {
        await screen.findByTestId(`recovery-check-word-${index + 1}`);
        await fireEvent.changeText(screen.getByTestId("recovery-check-word"), word);
        await fireEvent.press(screen.getByTestId("recovery-check-next"));
      }
    }

    it("shows its banner over the app unlocked only, with the days left", async () => {
      await dueSince(7);
      await openApp();
      // Till mode: nothing of it before a customer.
      expect(screen.queryByTestId("recovery-check-banner")).toBeNull();

      await unlock();

      expect(await screen.findByTestId("recovery-check-banner-text")).toHaveTextContent(
        "Your spare key is not checked"
      );
      expect(screen.getByTestId("recovery-check-banner-days")).toHaveTextContent("D−23");

      // Till mode ("Switch to till mode"): the account closes.
      await act(async () => closeAccount());
      await waitFor(() => expect(screen.queryByTestId("recovery-check-banner")).toBeNull());
    });

    it("turns red past its 30 days, the payments blocked", async () => {
      await dueSince(31);
      await openApp();
      await unlock();

      expect(await screen.findByTestId("recovery-check-banner-text")).toHaveTextContent(
        /Payments blocked/
      );
      expect(screen.queryByTestId("recovery-check-banner-days")).toBeNull();
    });

    it("shows nothing when no check is due", async () => {
      await openApp();
      await unlock();

      expect(screen.queryByTestId("recovery-check-banner")).toBeNull();
    });

    it("is done once the 12 words are typed back, for good on the account", async () => {
      jest.requireMock<typeof NotificationsFake>("expo-notifications").notifications.permission =
        "granted";
      await dueSince(10);
      const { router } = await openApp();
      await unlock();
      await fireEvent.press(await screen.findByTestId("recovery-check-banner-action"));
      await waitFor(() => expect(router.getPathname()).toBe("/settings/recovery-check"));
      // Not over its own screen.
      expect(screen.queryByTestId("recovery-check-banner")).toBeNull();
      expect(screen.getByTestId("recovery-check-due")).toBeTruthy();
      // Its notifications planned: 7 days before its end, the day before, its end.
      expect(
        jest
          .requireMock<typeof NotificationsFake>("expo-notifications")
          .notifications.scheduled.map((request) => request.identifier)
          .filter((id) => id?.startsWith("recovery-check-"))
      ).toEqual(["recovery-check-week", "recovery-check-eve", "recovery-check-day"]);

      await typeWords(WORDS);

      expect(await screen.findByTestId("recovery-check-done")).toBeTruthy();
      // The phone's notifications of this check taken back: the next one's start alone.
      await waitFor(() =>
        expect(
          jest
            .requireMock<typeof NotificationsFake>("expo-notifications")
            .notifications.scheduled.map((request) => request.identifier)
            .filter((id) => id?.startsWith("recovery-check-"))
        ).toEqual(["recovery-check-start"])
      );
      const check = getAccountSettings()!.recoveryCheck;
      expect(check.dueSince).toBeNull();
      expect(check.verifiedAt).toBeGreaterThanOrEqual(nowUnix() - 60);
      await expect(loadMerchantSettings(WALLET)).resolves.toMatchObject({ recoveryCheck: check });

      await fireEvent.press(screen.getByTestId("recovery-check-finish"));
      await waitFor(() => expect(router.getPathname()).not.toBe("/settings/recovery-check"));
      expect(screen.queryByTestId("recovery-check-banner")).toBeNull();
    });

    it("says words that do not match, without saying which, and saves nothing", async () => {
      await dueSince(3);
      const { router } = await openApp();
      await unlock();
      await act(async () => appRouter().push("/settings/recovery-check"));
      await waitFor(() => expect(router.getPathname()).toBe("/settings/recovery-check"));

      // The last word wrong, another word of the list.
      await typeWords([...WORDS.slice(0, 11), "zoo"]);

      expect(await screen.findByTestId("recovery-check-wrong")).toBeTruthy();
      expect(getAccountSettings()!.recoveryCheck.verifiedAt).toBeNull();
    });

    it("takes words typed with a capital or a space a keyboard added as the words", async () => {
      await dueSince(3);
      const { router } = await openApp();
      await unlock();
      await act(async () => appRouter().push("/settings/recovery-check"));
      await waitFor(() => expect(router.getPathname()).toBe("/settings/recovery-check"));

      await typeWords(WORDS.map((word, index) => (index % 2 ? `${word} ` : word.toUpperCase())));

      expect(await screen.findByTestId("recovery-check-done")).toBeTruthy();
      expect(getAccountSettings()!.recoveryCheck.dueSince).toBeNull();
    });

    it("offers the words of the list that start as typed, and refuses another word", async () => {
      await openApp();
      await unlock();
      await act(async () => appRouter().push("/settings/recovery-check"));
      await fireEvent.press(await screen.findByTestId("recovery-check-start"));

      // Elsewhere than Android, the keyboard's own (no suggestion learnt: autoCorrect off).
      expect(screen.getByTestId("recovery-check-word").props.keyboardType).toBe("default");
      await fireEvent.changeText(screen.getByTestId("recovery-check-word"), "aba");
      expect(screen.getByTestId("recovery-check-suggestion-abandon")).toBeTruthy();
      expect(screen.getByTestId("recovery-check-next")).toBeDisabled();

      await fireEvent.press(screen.getByTestId("recovery-check-suggestion-abandon"));
      expect(screen.getByTestId("recovery-check-next")).toBeEnabled();

      await fireEvent.changeText(screen.getByTestId("recovery-check-word"), "zzzz");
      expect(screen.getByTestId("recovery-check-next")).toBeDisabled();
    });

    it("keeps Android's keyboards from learning the words typed", async () => {
      const android = jest.replaceProperty(Platform, "OS", "android");
      try {
        await openApp();
        await unlock();
        await act(async () => appRouter().push("/settings/recovery-check"));
        await fireEvent.press(await screen.findByTestId("recovery-check-start"));
        // As "Open with my 12 words" and the migration's words: a password's field.
        expect(screen.getByTestId("recovery-check-word").props.keyboardType).toBe(
          "visible-password"
        );
      } finally {
        android.restore();
      }
    });

    it("opens from its notification tapped, the passkey asked at once, as good practice when nothing is due", async () => {
      const fake = jest.requireMock<typeof NotificationsFake>("expo-notifications");
      const { router } = await openApp();
      expect(getAccountWalletId()).toBeNull();

      await act(async () => fake.tap(fake.notification({ kind: "recoveryCheck" })));

      // The passkey asked without a press, as a code's link asks it.
      await waitFor(() => expect(getAccountWalletId()).toBe(WALLET));
      await waitFor(() => expect(router.getPathname()).toBe("/settings/recovery-check"));
      // Nothing due (under the threshold): good practice only, nothing blocked.
      expect(await screen.findByTestId("recovery-check-optional")).toBeTruthy();
      expect(
        screen.getByText("Nothing is due for now: this check is good practice, it blocks nothing.")
      ).toBeTruthy();
      expect(screen.queryByTestId("recovery-check-banner")).toBeNull();
    });

    it("opens from its notification tapped while the account is open", async () => {
      const fake = jest.requireMock<typeof NotificationsFake>("expo-notifications");
      const { router } = await openApp();
      await unlock();

      await act(async () => fake.tap(fake.notification({ kind: "recoveryCheck" })));

      await waitFor(() => expect(router.getPathname()).toBe("/settings/recovery-check"));
      expect(signIn).toHaveBeenCalledTimes(1);
    });

    it('leads to "Recovery phrase" when the words are lost', async () => {
      const { router } = await openApp();
      await unlock();
      await act(async () => appRouter().push("/settings/recovery-check"));

      await fireEvent.press(await screen.findByTestId("recovery-check-lost"));

      await waitFor(() => expect(router.getPathname()).toBe("/settings/recovery"));
    });
  });

  describe("Stay informed", () => {
    const notifications =
      jest.requireMock<typeof NotificationsFake>("expo-notifications").notifications;

    beforeEach(() => {
      // A device on which the app opens for the first time since its setup.
      secureStore.items.delete(NOTIFICATIONS_OFFER_KEY);
    });

    it("is offered once the app is unlocked, never in till mode, and asks the system", async () => {
      await openApp();
      await act(async () => undefined);
      // An app of 3.0.0 opens "What's new" by itself at the point of sale, in till mode too
      // (useWhatsNewOnArrival.ts); "Stay informed" never in till mode, before a customer.
      expect(await screen.findByTestId(LATEST_NOTES)).toBeTruthy();
      expect(screen.queryByText("Stay informed")).toBeNull();
      // Its scrim and its cross both close it.
      await fireEvent.press(screen.getAllByLabelText("Close")[0]!);
      await waitFor(() =>
        expect(screen.queryByTestId("whats-new", { includeHiddenElements: true })).toBeNull()
      );

      await fireEvent.press(screen.getByTestId("dock-unlock"));
      await waitFor(() => expect(getAccountWalletId()).toBe(WALLET));
      // Once per device: not again as the account opens.
      expect(screen.queryByTestId(LATEST_NOTES)).toBeNull();

      await fireEvent.press(await screen.findByTestId("notifications-offer-allow"));

      await waitFor(() => expect(notifications.permission).toBe("granted"));
      expect(notifications.requests).toBe(1);
    });

    it("is not offered on the web, which plans no notification", async () => {
      const web = jest.replaceProperty(Platform, "OS", "web");
      try {
        await openApp();
        await fireEvent.press(screen.getByTestId("dock-unlock"));
        await waitFor(() => expect(getAccountWalletId()).toBe(WALLET));
        await act(async () => undefined);

        expect(screen.queryByText("Stay informed")).toBeNull();
      } finally {
        web.restore();
      }
    });
  });
});

describe("destinations", () => {
  it("tells the destination of a path", () => {
    expect(destinationOf("/pos")).toBe("pos");
    expect(destinationOf("/pos/charge")).toBe("pos");
    expect(destinationOf("/integrations")).toBe("integrations");
    // The referral screen, removed: no destination.
    expect(destinationOf("/referral")).toBeNull();
    expect(destinationOf("/onboarding/split")).toBeNull();
  });

  it('puts "Cards" in "Manage", what it opens over the whole window', () => {
    expect(destinationOf("/cards")).toBe("cards");
    expect(destinationOf("/cards/pair")).toBe("cards");
    expect(SIDEBAR_GROUPS.find((group) => group.key === "manage")?.items).toEqual([
      "wallet",
      "cards",
      "articles",
      "employees",
      "integrations"
    ]);
    // The owner's: an employee's device has no cards of the account.
    expect(MEMBER_DESTINATIONS).not.toContain("cards");
    expect(isFullScreenRoute("/cards")).toBe(false);
    for (const route of [
      "/cards/pair",
      `/cards/history/${"a".repeat(32)}`,
      "/cards/wake-journal",
      "/cards/extension-test"
    ]) {
      expect(isFullScreenRoute(route)).toBe(true);
    }
    expect(isFullScreenRoute("/settings/cards")).toBe(false);
    // The merchant map: over the whole window on a phone, beside a computer's side bar.
    expect(isFullScreenRoute("/cards/map")).toBe(false);
    expect(isMobileFullScreenRoute("/cards/map")).toBe(true);
    expect(isMobileFullScreenRoute("/cards")).toBe(false);
    expect(isMobileFullScreenRoute("/cards/mapping")).toBe(false);
  });

  it("names Cards as its screen in every language: the app's texts send there by it", () => {
    for (const [language, { translation }] of Object.entries(resources)) {
      expect([language, translation.navigation.destinations.cards]).toEqual([
        language,
        translation.cards.title
      ]);
    }
  });

  it("swaps a destination into a slot, or two slots", () => {
    expect(swapInDock(DEFAULT_DOCK, 0, "integrations")).toEqual([
      "integrations",
      "wallet",
      "employees",
      "settings"
    ]);
    expect(swapInDock(DEFAULT_DOCK, 0, "wallet")).toEqual([
      "wallet",
      "pos",
      "employees",
      "settings"
    ]);
    expect(restOf(DEFAULT_DOCK)).toEqual(["cards", "articles", "integrations"]);
  });

  it("keeps the grid's places on a swap, its usual order otherwise", () => {
    const after = swapInDock(DEFAULT_DOCK, 1, "integrations");
    expect(keepPlaces(restOf(DEFAULT_DOCK), DEFAULT_DOCK, after)).toEqual([
      "cards",
      "articles",
      "wallet"
    ]);
    // Two slots swapped: nothing left the dock, the grid stays.
    const swapped = swapInDock(DEFAULT_DOCK, 0, "wallet");
    expect(keepPlaces(restOf(DEFAULT_DOCK), DEFAULT_DOCK, swapped)).toEqual(restOf(DEFAULT_DOCK));
    // Anything else: the usual order.
    expect(keepPlaces(["settings"], DEFAULT_DOCK, after)).toEqual(restOf(after));
  });

  it("only accepts a stored dock of four distinct destinations", () => {
    expect(parseDock(["pos", "wallet", "employees", "settings"])).toEqual(DEFAULT_DOCK);
    expect(parseDock(["pos", "pos", "wallet", "employees"])).toBeNull();
    expect(parseDock(["pos", "wallet", "employees"])).toBeNull();
    expect(parseDock(["pos", "wallet", "employees", "activity"])).toBeNull();
    expect(parseStoredDock(serializeDock(DEFAULT_DOCK))).toEqual(DEFAULT_DOCK);
    expect(parseStoredDock('{"version":2,"slots":["pos","wallet","employees","settings"]}')).toBe(
      null
    );
    expect(parseStoredDock("not json")).toBeNull();
    // The invoices, merged into "Wallet", are no destination: the default.
    expect(parseDock(["pos", "invoices", "wallet", "employees"])).toBeNull();
    // Nor the referral screen, removed: a dock that held it is the default again.
    expect(parseStoredDock('{"version":1,"slots":["pos","referral","employees","settings"]}')).toBe(
      null
    );
  });
});

describe("dock layout", () => {
  const layoutAt = (
    windowWidth: number,
    names: Record<Destination, number>,
    current: Destination,
    dock: readonly Destination[] = DEFAULT_DOCK
  ) =>
    dockLayout({
      windowWidth,
      gutter: 22,
      dock,
      active: dock.indexOf(current),
      split: !dock.includes(current),
      sizes: sizesOf(names)
    });
  const right = (layout: ReturnType<typeof dockLayout>) =>
    layout.plus.left + layout.plus.width + 2 * DOCK.padding;

  it("names the screen shown in its slot, the others sharing the rest", () => {
    const layout = layoutAt(390, FR_NAMES, "wallet");
    // As wide as the screen's gutters.
    expect(layout.width).toBe(346);
    expect(layout.pill).toEqual(PILL);
    expect(layout.labelled).toBe(1);
    expect(layout.labelWidth).toBeCloseTo(79.1);
    expect(layout.slots[1]!.width).toBeCloseTo(2 * 17 + 18 + 8 + 79.1);
    const others = [0, 2, 3].map((i) => layout.slots[i]!.width);
    expect(new Set(others).size).toBe(1);
    expect(layout.plus.width).toBeCloseTo(others[0]!);
    expect(others[0]).toBeGreaterThanOrEqual(DOCK.minSlot);
    expect(right(layout)).toBeCloseTo(layout.width);
  });

  it("keeps its width from one screen to another", () => {
    const widths = DEFAULT_DOCK.map((d) => layoutAt(390, FR_NAMES, d).width);
    expect(new Set(widths)).toEqual(new Set([346]));
  });

  it('shares "More" with a screen out of the dock, no name in the slots', () => {
    const layout = layoutAt(390, FR_NAMES, "integrations");
    expect(layout.labelled).toBe(-1);
    expect(layout.plus.width).toBe(DOCK.split);
    expect(layout.slots.map((slot) => slot.width)).toEqual(Array(4).fill((334 - 92) / 4));
  });

  it("widens beyond the gutters only as much as a long name needs", () => {
    // German, 390 pt: "Mitarbeitende" needs 351.2 px.
    const layout = layoutAt(390, DE_NAMES, "settings");
    expect(layout.width).toBeCloseTo(12 + 4 * 44 + 2 * 17 + 22.5 + 8 + 98.7);
    expect(layout.width).toBeLessThanOrEqual(390 - 2 * DOCK.edge);
    expect(layout.labelWidth).toBeCloseTo(94.5);
  });

  it("gets tighter on narrow screens, and cuts a name only as a last resort", () => {
    // French, 360 pt: widened, every name whole.
    for (const destination of DESTINATIONS) {
      const dock = DEFAULT_DOCK.includes(destination)
        ? DEFAULT_DOCK
        : swapInDock(DEFAULT_DOCK, 1, destination);
      const layout = layoutAt(360, FR_NAMES, destination, dock);
      expect(layout.labelWidth).toBeCloseTo(FR_NAMES[destination]);
      expect(layout.width).toBeLessThanOrEqual(336);
    }
    // German, 360 pt: tighter pill; "Mitarbeitende" cut by 3.2 px, "Wallet" whole.
    const employees = layoutAt(360, DE_NAMES, "employees");
    expect(employees.width).toBe(336);
    expect(employees.pill).toEqual(COMPACT_PILL);
    expect(employees.labelWidth).toBeCloseTo(324 - 4 * 44 - 2 * 12 - 22.5 - 6);
    expect(layoutAt(360, DE_NAMES, "wallet").labelWidth).toBeCloseTo(DE_NAMES.wallet);
    for (const layout of [employees, layoutAt(360, DE_NAMES, "wallet")]) {
      const others = layout.slots.filter((_, i) => i !== layout.labelled);
      for (const slot of [...others, layout.plus]) {
        expect(slot.width).toBeGreaterThanOrEqual(DOCK.minSlot - 1e-9);
      }
      expect(right(layout)).toBeCloseTo(layout.width);
    }
  });

  it("stays 400 px wide at most (tablets), with no name before they are measured", () => {
    const tablet = layoutAt(820, FR_NAMES, "pos");
    expect(tablet.width).toBe(DOCK.maxWidth);
    const unmeasured = dockLayout({
      windowWidth: 390,
      gutter: 22,
      dock: DEFAULT_DOCK,
      active: 0,
      split: false,
      sizes: null
    });
    expect(unmeasured.labelled).toBe(-1);
    expect(unmeasured.slots.map((slot) => slot.width)).toEqual(Array(4).fill(334 / 5));
  });
});
