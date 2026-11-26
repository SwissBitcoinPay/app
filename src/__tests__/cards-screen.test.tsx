import "@/i18n";

import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils.js";
import * as Clipboard from "expo-clipboard";
import Constants from "expo-constants";
import { Slot, type Href } from "expo-router";
import { act, fireEvent, renderRouter, screen, waitFor, within } from "expo-router/testing-library";
import { render } from "@testing-library/react-native";
import { useState } from "react";
import {
  AppState,
  Dimensions,
  Linking,
  Platform,
  Share,
  StyleSheet,
  Text,
  Vibration,
  type AppStateStatus
} from "react-native";

import AppLayout from "@/app/(app)/_layout";
import CardsLayout from "@/app/(app)/cards/_layout";
import CardHistoryRoute from "@/app/(app)/cards/history/[id]";
import CardsRoute from "@/app/(app)/cards/index";
import MerchantMapRoute from "@/app/(app)/cards/map";
import PairCardRoute from "@/app/(app)/cards/pair";
import SettingsLayout from "@/app/(app)/settings/_layout";
import SettingsIndex from "@/app/(app)/settings/index";
import { redirectSystemPath } from "@/app/+native-intent";
import LaunchScreen from "@/app/index";
import { ANDROID_APP_URL, IOS_APP_URL } from "@/config/app-stores";
import {
  CARD_ADDED_READ_MS,
  CARD_INVOICE_POLL_MS,
  CARD_MIGRATION_INVOICE_DESCRIPTION,
  DEFAULT_CARD_DAY_SATS,
  DEFAULT_CARD_PAYMENTS_PER_HOUR,
  DEFAULT_CARD_PAYMENT_SATS,
  DEFAULT_CARD_RELAY_HOST
} from "@/config/card";
import {
  closeAccount,
  getAccountBackupKey,
  getAccountSettings,
  updateAccount
} from "@/features/account/session";
import { isAccountWalletOpen } from "@/features/account/wallet-access";
import { pairCard } from "@/features/card/pairing";
import { resetCardPayments } from "@/features/card/payments";
import { CARD_ASPECT, CARD_PALETTE } from "@/features/card/card-look";
import * as cardPassesModule from "@/features/card/card-passes";
import type { BrowserDevice } from "@/lib/browser-device";
import * as deviceIntegrityModule from "@/lib/device-integrity";
import { CardSheet, type CardTask } from "@/features/card/CardSheet";
import { useCardLimitLog } from "@/features/card/LimitsPanel";
import { CustomizePanel, customizeDraftOf } from "@/features/card/CustomizePanel";
import { customizeCard, setCardSuspended } from "@/features/card/manage";
import { MAIN_BALANCE_READ_MS } from "@/features/card/card-wallet";
import {
  knownCardState,
  recordCardState,
  refreshCardStates,
  resetCardStates,
  withCardAccess
} from "@/features/card/states";
import { writeMonthCopy } from "@/features/card/history-copies";
import * as historyCopiesModule from "@/features/card/history-copies";
import * as historySync from "@/features/card/history-sync";
import { publishCardHistory, resetCardMovementRecords } from "@/features/card/history-sync";
import { resetLegacyCardHistory } from "@/features/card/legacy-history";
import { syncCardPayees } from "@/features/card/payees-sync";
import { resetChannelSyncs } from "@/features/card/sync";
import { rememberImage } from "@/features/media/images";
import { forgetLaunchLink } from "@/features/navigation/AppShell";
import { lockTerminal } from "@/features/navigation/lock";
import { NotificationsProvider } from "@/features/notifications/NotificationsProvider";
import { NOTIFICATION_DURATION } from "@/features/notifications/stack";
import * as erasedFundsModule from "@/features/card/erased-funds";
import * as calendarModule from "@/lib/locale/calendar";
import { nowUnix } from "@/lib/clock";
import { deriveLegacyHistoryKeys } from "@/lib/card/legacy-history-records";
import { legacyCardRowRef } from "@/lib/legacy-v2/card-history";
import { readLog } from "@/lib/log/log";
import { changeBitcoinNode } from "@/features/settings/account-settings";
import { saveAmountUnit } from "@/features/settings/amount-unit";
import { PayoutDraftProvider } from "@/features/settings/payout-draft";
import { WALLET_REFRESH_MS } from "@/features/wallet/useWalletData";
import { PosProvider } from "@/features/terminal/pos";
import {
  getTerminalProfile,
  publishTerminalProfile,
  resetTerminalProfileCache
} from "@/features/terminal/profile-cache";
import { markNotificationsOffered } from "@/features/notification-offer/offer";
import { forgetDeviceKey } from "@/lib/card/device-key";
import {
  cardStateEvent,
  cardStatesFilter,
  cardStatesOf,
  defaultCardColor,
  deriveCardRecordKeys,
  type CardState
} from "@/lib/card/card-record";
import { CARD_STATES_KEY } from "@/lib/card/card-store";
import {
  deriveMonthPartKeys,
  monthCopy,
  monthPartAddress,
  monthPartValue
} from "@/lib/card/history-months";
import { deriveHistoryRecordKeys, historyEvent, movementEvent } from "@/lib/card/history-records";
import { cardOwnCopiesOf, cardOwnFilter, cardOwnKeys, cardOwnSecret } from "@/lib/card/card-own";
import { cardIdOf, channelSecretOf, deriveCardRoot } from "@/lib/card/keys";
import { printedCardHref } from "@/lib/card/legacy-link";
import { forgetCardPayees } from "@/lib/card/payees.web";
import { PasskeyError } from "@/lib/breez/errors";
import { signInWithPasskey } from "@/lib/breez/passkey";
import { walletSecret } from "@/lib/breez/seed";
import { bookOf } from "@/lib/card/payee-book";
import {
  CARD_PAYEES_DIR_NAME,
  approveCardPayee,
  loadCardPayees,
  loadPayeeBooks,
  noteCardPayee,
  removeCardPayee,
  setCardPayeeMode
} from "@/lib/card/payees";
import { Ntag424 } from "@/lib/card/ntag424";
import { wipeLegacyCard } from "@/lib/card/legacy-card";
import { logCardPayment, type CardPaymentEntry } from "@/lib/card/payment-log";
import { decodeBolt11 } from "@/lib/lightning/bolt11";
import { formatDate } from "@/lib/locale/date";
import { fetchImage } from "@/lib/media/image";
import { publishToRelays, queryRelays } from "@/lib/nostr/pool";
import { sealRecord } from "@/lib/nostr/record";
import { currentRelays } from "@/lib/relays/current";
import type { SavedTerminalProfile } from "@/lib/terminal/model";
import * as terminalProfile from "@/lib/terminal/profile";
import { saveTerminalProfile } from "@/lib/terminal/profile";
import { lightColors as colors, control, gutter, motion, sans, palette } from "@/theme";

import {
  OTHER_TEST_MNEMONIC,
  TEST_WALLET_ID,
  openCardHolderAccount,
  openMerchantAccount,
  testSeed
} from "../../jest/account";
import type * as BreezFake from "../../jest/breez-sdk";
import { addRelay, posTap, type FakeCardRelay } from "../../jest/card-relay";
import type * as FileSystemFake from "../../jest/expo-file-system";
import type * as NotificationsFake from "../../jest/expo-notifications";
import type * as NfcFake from "../../jest/nfc-manager";
import type * as WebViewFake from "../../jest/react-native-webview";
import type * as RelaysFake from "../../jest/nostr-relays";
import type * as SecureStoreFake from "../../jest/expo-secure-store";
import { imageFake, resetImageFake } from "../../jest/image-manipulator";
import { legacyV2 } from "../../jest/legacy-v2-server";
import { provenCardPayee } from "../../jest/breez-tips";
import { bottomInsetOf, sideInsetsOf } from "../../jest/layout";
import { addLegacyServer } from "../../jest/legacy-card-server";
import { makeInvoice, testNode } from "../../jest/lightning";
import { FakeNtag424, legacyNtag424 } from "../../jest/ntag424";
import { fixedCalendar } from "../../jest/calendar";
import { setCoingeckoPrice } from "../../jest/coingecko";

// eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories are synchronous
jest.mock("react-native-nfc-manager", () => require("../../jest/nfc-manager"));
jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    expoConfig: {
      extra: { breezNetwork: "mainnet", eas: { projectId: "00000000-0000-4000-8000-000000000000" } }
    }
  }
}));
jest.mock("../lib/breez/passkey", () => ({
  createPasskeyWallet: jest.fn(),
  preparePasskeys: jest.fn(async () => undefined),
  passkeysReady: jest.fn(() => true),
  signInWithPasskey: jest.fn()
}));
jest.mock("expo-clipboard", () => ({
  setStringAsync: jest.fn(async () => true),
  getStringAsync: jest.fn(async () => "")
}));
// eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories are synchronous
jest.mock("expo-image-manipulator", () => require("../../jest/image-manipulator"));
/** expo-image-picker, faked: the system's photo library and camera app, and its permission. */
const mockPicker = { library: jest.fn(), camera: jest.fn(), permission: jest.fn() };
jest.mock("expo-image-picker", () => ({
  launchImageLibraryAsync: (options: unknown) => mockPicker.library(options),
  launchCameraAsync: (options: unknown) => mockPicker.camera(options),
  requestCameraPermissionsAsync: () => mockPicker.permission()
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
// The web app's device (browser-device.ts), set by a test: none, as in the apps, by default (read
// through `?.`: the app's modules load it before this file sets `mockBrowser`).
const mockBrowser: { device: BrowserDevice | null } = { device: null };
jest.mock("@/lib/browser-device", () => ({ browserDevice: () => mockBrowser?.device ?? null }));
// The web app's modules of the cards (*.web.ts) while `mockWeb.on`: nothing kept on the device
// (read through `?.`: the app's modules load them before this file sets `mockWeb`).
const mockWeb = { on: false };
jest.mock("@/lib/card/card-store", () => {
  const native = jest.requireActual<Record<string, unknown>>("@/lib/card/card-store");
  const web = jest.requireActual<Record<string, unknown>>("@/lib/card/card-store.web");
  return new Proxy({}, { get: (_, key: string) => (mockWeb?.on ? web : native)[key] });
});
jest.mock("@/lib/card/payees", () => {
  const native = jest.requireActual<Record<string, unknown>>("@/lib/card/payees");
  const web = jest.requireActual<Record<string, unknown>>("@/lib/card/payees.web");
  return new Proxy({}, { get: (_, key: string) => (mockWeb?.on ? web : native)[key] });
});
jest.mock("@/lib/card/payment-log", () => {
  const native = jest.requireActual<Record<string, unknown>>("@/lib/card/payment-log");
  const web = jest.requireActual<Record<string, unknown>>("@/lib/card/payment-log.web");
  return new Proxy({}, { get: (_, key: string) => (mockWeb?.on ? web : native)[key] });
});
// 1 BTC = 100,000 CHF: 1 sat = 0.1 cent. Undefined: a rate outage. setMockRate also renders the
// hooks that read it again, as a rate refreshed (or turned stale) does.
let mockRate: number | undefined;
/** True: the rate's source has not answered yet. */
let mockRateLoading = false;
/** The currencies whose rate was asked. */
const mockRateCurrencies = new Set<string | null>();
const mockRateListeners = new Set<() => void>();
function setMockRate(rate: number | undefined) {
  mockRate = rate;
  for (const listener of mockRateListeners) listener();
}
jest.mock("../features/terminal/useRate", () => {
  const { useEffect, useReducer } = jest.requireActual<typeof import("react")>("react");
  return {
    useRate: (currency: string | null) => {
      mockRateCurrencies.add(currency);
      const [, rerender] = useReducer((n: number) => n + 1, 0);
      useEffect(() => {
        mockRateListeners.add(rerender);
        return () => {
          mockRateListeners.delete(rerender);
        };
      }, []);
      return {
        rate: mockRateLoading ? undefined : mockRate,
        hour: undefined,
        loading: mockRateLoading,
        current: () => (mockRateLoading ? undefined : mockRate)
      };
    }
  };
});
const mockDesktop = jest.fn(() => false);
jest.mock("@/components/layout/useIsDesktop", () => ({
  ...jest.requireActual("@/components/layout/useIsDesktop"),
  useIsDesktop: () => mockDesktop()
}));
// The tests' window (a phone's), given back after each test of a desktop's (`phoneWindow`).
const PHONE_WINDOW = { window: Dimensions.get("window"), screen: Dimensions.get("screen") };
/** A window of `width` × `height`, as the native side tells it. */
function windowOf(width: number, height: number) {
  Dimensions.set({
    window: { ...PHONE_WINDOW.window, width, height },
    screen: { ...PHONE_WINDOW.screen, width, height }
  });
}
async function phoneWindow() {
  await act(async () => Dimensions.set(PHONE_WINDOW));
}

const nfc = jest.requireMock<typeof NfcFake>("react-native-nfc-manager");
const webView = jest.requireMock<typeof WebViewFake>("react-native-webview");
const notifications = jest.requireMock<typeof NotificationsFake>("expo-notifications");
const nostr = jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");
const fileSystem = jest.requireMock<typeof FileSystemFake>("expo-file-system");
const secureStore = jest.requireMock<typeof SecureStoreFake>("expo-secure-store");
const sdk = jest.requireMock<typeof BreezFake>("@breeztech/breez-sdk-spark-react-native");
const signIn = jest.mocked(signInWithPasskey);
const apiKey = process.env.EXPO_PUBLIC_BREEZ_API_KEY;

const routes = {
  index: LaunchScreen,
  "(app)/_layout": AppLayout,
  "(app)/settings/_layout": SettingsLayout,
  "(app)/settings/index": SettingsIndex,
  "(app)/cards/_layout": CardsLayout,
  "(app)/cards/index": CardsRoute,
  "(app)/cards/pair": PairCardRoute,
  "(app)/cards/history/[id]": CardHistoryRoute,
  "(app)/cards/map": MerchantMapRoute
};

const HOST = DEFAULT_CARD_RELAY_HOST;
const OTHER = "relay.example.org";
/** A v2 card and its keys (tests only), for its migration. */
const LEGACY_UID = "04aabbccddeeff";
const LEGACY_MASTER = "000102030405060708090a0b0c0d0e0f";
const LEGACY_META = "0f0e0d0c0b0a09080706050403020100";
const LEGACY_FILE = "a0a1a2a3a4a5a6a7a8a9aaabacadaeaf";
/** The v2 keys, as the fake v2 server holds them (the app holds none). */
const LEGACY_KEYS = {
  master: hexToBytes(LEGACY_MASTER),
  meta: hexToBytes(LEGACY_META),
  file: hexToBytes(LEGACY_FILE)
};
/**
 * A card operation goes through the relays, the card's APDUs and its cryptography, in real time:
 * more than findBy's default second on a busy runner.
 */
const SLOW = { timeout: 8000 };

let relay: FakeCardRelay;
let other: FakeCardRelay;
let card: FakeNtag424;

/**
 * The owner's device, unlocked, its point of sale prepared: a merchant's sign-up done, whose cards
 * recharge from and go back to the main balance (a card holder's: cardHolderDevice).
 */
async function ownerDevice() {
  await openMerchantAccount();
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

/** Pairs `held` with the account, as the sign-up does; resolves with its card id. */
async function pair(held: FakeNtag424 = card): Promise<string> {
  nfc.holdCard(held);
  const paired = await pairCard({
    relayHost: HOST,
    channelName: "Card payments",
    messages: { alert: "Hold the card to the phone" }
  });
  return paired.state.cardId;
}

/** "Card 9D81": the label of a card without a name. */
function unnamed(cardId: string): string {
  return `Card ${cardId.slice(-4).toUpperCase()}`;
}

/** The card's channel on `host`, as that relay keeps it. */
async function channelOn(host: FakeCardRelay, cardId: string) {
  const secret = await withCardAccess(async ({ root }) => channelSecretOf(root, cardId, host.host));
  return host.channelOf(secret);
}

/** Renders the app on `initialUrl`; `router` also answers `getPathname()`. */
async function open(initialUrl: string, shown: Parameters<typeof renderRouter>[0] = routes) {
  const router = await renderRouter(shown, { initialUrl });
  return { router };
}

/**
 * A v2 card being migrated, recorded as the migration records it before anything moves
 * (src/features/card/migration.ts); resolves with its card id.
 */
async function migratingCard(
  uid = "04aabbccddeeff",
  settings: Partial<Pick<CardState, "name" | "look">> = {}
): Promise<string> {
  return withCardAccess(async (access) => {
    const cardId = cardIdOf(access.root, hexToBytes(uid));
    await recordCardState(access, {
      cardId,
      uid,
      keyVersion: 1,
      status: "migrating",
      relayHost: HOST,
      lastCounter: 0,
      depositedThrough: 0,
      maxPaymentSats: DEFAULT_CARD_PAYMENT_SATS,
      maxDaySats: DEFAULT_CARD_DAY_SATS,
      maxPaymentsPerHour: DEFAULT_CARD_PAYMENTS_PER_HOUR,
      suspended: false,
      name: "",
      look: null,
      issuer: null,
      settingsAt: Date.now(),
      walletGeneration: 1,
      ...settings
    });
    return cardId;
  });
}

/** The steps' title says `text` ("Add a card", its outcome). */
async function titleSays(text: string) {
  await waitFor(() => expect(screen.getByTestId("card-steps-title")).toHaveTextContent(text), SLOW);
}

/** Chooses the card in the carousel of "Cards". */
async function choose(cardId: string) {
  await fireEvent.press(await screen.findByTestId(`card-slot-${cardId}`, {}, SLOW));
}

/**
 * Chooses the card, then opens its panel on one of its tasks from "Cards" (its row, or its
 * action under the balance: `testID`).
 */
async function openTask(cardId: string, testID: string) {
  await choose(cardId);
  // An action under the balance waits for it to be read (shown again then: found again).
  await waitFor(() => expect(screen.getByTestId(testID)).toBeEnabled(), SLOW);
  await fireEvent.press(screen.getByTestId(testID));
  return within(await screen.findByTestId("card-sheet"));
}

/**
 * "Relay and programming" of the card `cardId`, from its panel "Advanced settings".
 */
async function openRelay(cardId: string) {
  const panel = await openTask(cardId, "card-advanced");
  await fireEvent.press(panel.getByTestId("card-relay"));
  return panel;
}

/**
 * "Payments without confirmation" of the card chosen, from its panel "Advanced settings": the
 * card's panel.
 */
async function toPayees() {
  await fireEvent.press(await screen.findByTestId("card-advanced", {}, SLOW));
  const panel = within(await screen.findByTestId("card-sheet"));
  await fireEvent.press(panel.getByTestId("card-payees"));
  return panel;
}

/**
 * A merchant's "Withdraw" of the card `cardId`, then "To my main balance" under the means of any
 * other wallet: the withdrawal's panel.
 */
async function openReturn(cardId: string) {
  const panel = await openTask(cardId, "card-wallet-return");
  await fireEvent.press(await panel.findByTestId("card-wallet-to-main", {}, SLOW));
  return panel;
}

/**
 * "Empty the card" from "Withdraw"'s `panel`: the recipient typed there first, as in "Send",
 * "Empty the card" offered once it is read, then its own form on that recipient, read again.
 */
async function drainTo(panel: ReturnType<typeof within>, recipient: string) {
  await fireEvent.changeText(await panel.findByTestId("send-recipient", {}, SLOW), recipient);
  await fireEvent.press(await panel.findByTestId("card-wallet-drain", {}, SLOW));
  expect(await panel.findByTestId("card-drain-recipient", {}, SLOW)).toHaveDisplayValue(recipient);
}

/**
 * The withdrawal to its end in the card's `panel`: the whole card ("Empty the card"), then its
 * confirmation sent (the passkey asked).
 */
async function emptyCard(panel: ReturnType<typeof within>) {
  await fireEvent.press(await panel.findByTestId("card-wallet-empty", {}, SLOW));
  await fireEvent.press(panel.getByTestId("card-wallet-continue"));
  await fireEvent.press(await panel.findByTestId("card-wallet-send", {}, SLOW));
}

/**
 * A card wallet's transfer ended: no page of its panel after it, a
 * notification says `text` (its last period dropped; a warning read at once), the panel closed.
 */
async function transferSays(text: RegExp, tone: "success" | "warning" = "success") {
  const notice = await waitFor(() => {
    const found = screen
      .getAllByTestId("notification")
      .find((each) => within(each).queryByText(text) !== null);
    expect(found).toBeDefined();
    return found!;
  }, SLOW);
  expect(notice.props.role).toBe(tone === "warning" ? "alert" : "status");
  await waitFor(() => expect(screen.queryByTestId("card-sheet")).toBeNull(), SLOW);
}

/**
 * The fake SDK object of the last connection of the card `cardId`'s wallet, or (null) of the
 * account's: its methods are mocks a test may make fail once.
 */
async function sdkOf(cardId: string | null): Promise<Record<string, jest.Mock>> {
  const storages = sdk.connect.mock.calls.map(
    (call) => (call[0] as { storageDir?: string } | undefined)?.storageDir ?? ""
  );
  const at = storages.findLastIndex((dir) =>
    cardId === null
      ? !dir.includes("/breez-sdk-spark-cards/")
      : dir.includes(`/breez-sdk-spark-cards/${cardId}/`)
  );
  return (await sdk.connect.mock.results[at]!.value) as Record<string, jest.Mock>;
}

/**
 * The SDK of the card `cardId`'s wallet says something moved, once "Cards" listens to it: its
 * payment `payment` received (`PaymentSucceeded`, as the bindings give it), else a sync.
 */
async function sdkSays(cardId: string, payment?: Record<string, unknown>) {
  const wallet = sdk.fakeCardWallet(cardId);
  await waitFor(() => expect(sdk.sdkListenerCount(wallet)).toBeGreaterThan(0), SLOW);
  await act(async () => {
    await sdk.emitSdkEvent(
      wallet,
      payment ? sdk.SdkEvent_Tags.PaymentSucceeded : sdk.SdkEvent_Tags.Synced,
      payment
    );
  });
}

/** How many connections of the account's wallet were made: those of no card's storage. */
function accountConnections(): number {
  return sdk.connect.mock.calls.filter(
    (call) =>
      !((call[0] as { storageDir?: string } | undefined)?.storageDir ?? "").includes(
        "/breez-sdk-spark-cards/"
      )
  ).length;
}

/** The caption of the chosen card's row `testID` of "Cards". */
function rowOf(testID: string) {
  return screen.getByTestId(testID);
}

jest.setTimeout(30_000);

// "Stay informed" answered on this device, as on any past its first opening: its panel would
// cover this file's screens (notifications-offer.test.tsx tests it).
beforeEach(async () => {
  await markNotificationsOffered(0);
});

beforeEach(async () => {
  closeAccount();
  // A card's panel shows its wallet (CardWalletPanel.tsx): connected with the account's keys.
  process.env.EXPO_PUBLIC_BREEZ_API_KEY = "test-api-key";
  signIn.mockReset().mockResolvedValue({ seed: testSeed(), credentialId: null });
  nostr.resetRelays();
  fileSystem.resetFileSystem();
  nfc.resetNfcManager();
  resetCardStates();
  resetChannelSyncs();
  resetCardPayments();
  resetCardMovementRecords();
  forgetDeviceKey();
  mockDesktop.mockReturnValue(false);
  mockRate = undefined;
  mockRateLoading = false;
  relay = addRelay(HOST);
  other = addRelay(OTHER);
  card = new FakeNtag424();
  await ownerDevice();
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(async () => {
  mockBrowser.device = null;
  resetCardPayments();
  await lockTerminal();
  process.env.EXPO_PUBLIC_BREEZ_API_KEY = apiKey;
  jest.restoreAllMocks();
});

/** A payment of `cardId` at `at` (ms), sent. */
function payment(cardId: string, id: string, at: number): CardPaymentEntry {
  return {
    id,
    cardId,
    walletGeneration: 1,
    at,
    amountSats: 2_000n,
    paymentHash: id.padStart(64, "0"),
    description: `Payment ${id}`,
    outcome: "sent",
    reason: null,
    pr: "lnbc1",
    payee: null,
    preimage: null,
    value: null
  };
}

/** The card's wallet's record of `entry` once it left: a Lightning payment, completed. */
function leftWallet(entry: CardPaymentEntry): Record<string, unknown> {
  return {
    id: `send-${entry.id}`,
    paymentType: sdk.PaymentType.Send,
    status: sdk.PaymentStatus.Completed,
    amount: entry.amountSats,
    fees: 0n,
    timestamp: BigInt(Math.floor(entry.at / 1000) + 1),
    method: sdk.PaymentMethod.Lightning,
    details: {
      tag: sdk.PaymentDetails_Tags.Lightning,
      inner: {
        description: undefined,
        invoice: "lnbc1fake",
        htlcDetails: { paymentHash: entry.paymentHash, preimage: undefined }
      }
    }
  };
}

/** An on-chain deposit of `sats` the card's wallet has not claimed yet. */
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

/**
 * A payment's invoice and payee as the phone logs them (payment.ts): the merchant's proof as its
 * point of sale gave it and breez.tips answered it (payee-proof.ts), its name and its address;
 * nothing of it for one not identified.
 */
function payee(
  name: string,
  address: string,
  status: "approved" | "new" | "unidentified"
): Pick<CardPaymentEntry, "pr" | "payee"> {
  if (status === "unidentified") {
    return {
      pr: "lnbc1",
      payee: { status, name: null, metadata: null, verify: null, verifyAnswer: null }
    };
  }
  const hash = bytesToHex(sha256(utf8ToBytes(`${address} ${name}`)));
  const { pr, ...proof } = provenCardPayee(address.split("@")[0], name, hash);
  return { pr, payee: { status, name, ...proof } };
}

describe('the navigation leads to "Cards"', () => {
  it('from "More" on a phone, no longer from "Settings"', async () => {
    const { router } = await open("/settings");
    expect(await screen.findByTestId("settings-card-network")).toBeTruthy();
    expect(screen.queryByText("Cards")).toBeNull();

    await fireEvent.press(screen.getByTestId("dock-more"));
    await fireEvent.press(screen.getByTestId("more-cards"));
    await waitFor(() => expect(router.getPathname()).toBe("/cards"));
    expect(await screen.findByText("Add your first card", {}, SLOW)).toBeTruthy();
    // A destination: the dock stays, no way back of its own.
    expect(screen.getByLabelText("More, current screen: Cards")).toBeTruthy();
    expect(screen.queryByLabelText("Back")).toBeNull();
  });

  it('from "Manage" in the side bar on a tablet, beside the wallet', async () => {
    mockDesktop.mockReturnValue(true);
    const { router } = await open("/settings");
    expect(await screen.findByTestId("settings-tabs")).toBeTruthy();
    // The side bar's row only: "Settings" has no section of the cards any more.
    expect(screen.getAllByText("Cards")).toHaveLength(1);
    const manage = within(screen.getByTestId("sidebar-group-manage"));
    expect(manage.getAllByRole("button").map((row) => row.props.testID)).toEqual([
      "sidebar-wallet",
      "sidebar-cards",
      "sidebar-articles",
      "sidebar-employees",
      "sidebar-integrations"
    ]);

    await fireEvent.press(screen.getByTestId("sidebar-cards"));
    await waitFor(() => expect(router.getPathname()).toBe("/cards"));
    expect(await screen.findByText("Add your first card", {}, SLOW)).toBeTruthy();
    expect(screen.getByTestId("sidebar-cards").props.accessibilityState.selected).toBe(true);
    expect(screen.queryByText("Back")).toBeNull();
  });

  it("reads the cards again each time it shows again after another destination", async () => {
    const { router } = await open("/cards");
    expect(await screen.findByText("Add your first card", {}, SLOW)).toBeTruthy();
    // A point of sale's dock leads to "Settings": not the header, as on a card holder's phone.
    expect(screen.queryByTestId("header-settings")).toBeNull();
    await fireEvent.press(screen.getByTestId("dock-slot-3"));
    await waitFor(() => expect(router.getPathname()).toBe("/settings"));

    // Meanwhile, another device of the account paired a card: only the relays have it. (The
    // screen stays mounted, hidden: it follows the states known.)
    const cardId = await act(async () => {
      const paired = await pair();
      resetCardStates();
      secureStore.items.delete(CARD_STATES_KEY);
      return paired;
    });

    await fireEvent.press(screen.getByTestId("dock-more"));
    await fireEvent.press(screen.getByTestId("more-cards"));
    await waitFor(() => expect(router.getPathname()).toBe("/cards"));
    expect(await screen.findByTestId(`card-slot-${cardId}`, {}, SLOW)).toBeTruthy();
    expect(screen.queryByText("Add your first card")).toBeNull();
  });

  it('opens nothing, then or later, for a card added whose "Cards" was left before it showed', async () => {
    const cardId = await pair();
    // Only the relays know it: "Cards" reads them, held meanwhile.
    resetCardStates();
    secureStore.items.delete(CARD_STATES_KEY);
    const release = nostr.holdQueries();
    const { router } = await open(`/cards?added=${cardId}&open=recharge&at=1`);
    expect(await screen.findByTestId("cards-loading", {}, SLOW)).toBeTruthy();
    // Another destination chosen before the cards were read.
    await fireEvent.press(screen.getByTestId("dock-slot-3"));
    await waitFor(() => expect(router.getPathname()).toBe("/settings"));
    release();
    // Read while hidden: its "Top up" not opened there, over "Settings".
    expect(
      await screen.findByTestId(`card-slot-${cardId}`, { includeHiddenElements: true }, SLOW)
    ).toBeTruthy();
    expect(screen.queryByTestId("card-sheet", { includeHiddenElements: true })).toBeNull();

    // Nor at the next visit: what was asked then is not asked again now.
    await fireEvent.press(screen.getByTestId("dock-more"));
    await fireEvent.press(screen.getByTestId("more-cards"));
    await waitFor(() => expect(router.getPathname()).toBe("/cards"));
    expect(await screen.findByTestId(`card-slot-${cardId}`, {}, SLOW)).toBeTruthy();
    expect(screen.queryByTestId("card-sheet", { includeHiddenElements: true })).toBeNull();
    expect(router.getSearchParams()).toEqual({});
  });
});

describe('the link printed on a v2 card opens "Cards" on it', () => {
  const NUMBER = "1709-1248-5643-8482";
  /** The link, as the system gives it to the app (universal link, App Link). */
  const PRINTED = `https://sbpc.ch/${NUMBER}`;
  /**
   * The address the app opens with: the link as src/app/+native-intent.ts rewrites it (its own
   * tests, legacy-link.test.ts). Expo Router's test renderer drops a starting link's host before
   * that file reads it; the app's own does not (getLinkingURL, getInitialURL).
   */
  const OPENED = printedCardHref(NUMBER, 1);
  /** The app's routes and its file of links, as Expo Router takes them. */
  const linked = { ...routes, "+native-intent": { redirectSystemPath } };

  /** The card `cardId` migrated from a v2 card printed with `number` (its issuer's visual). */
  async function printed(cardId: string, number: string) {
    await withCardAccess(async (access) => {
      const { updatedAt: _updatedAt, ...state } = knownCardState(TEST_WALLET_ID, cardId)!;
      await recordCardState(access, {
        ...state,
        issuer: { image: { key: "11".repeat(32), hash: "22".repeat(32) }, number, white: false },
        settingsAt: state.settingsAt + 1
      });
    });
  }

  /** Two cards of the account: the one "Cards" shows first, and the other. */
  async function twoCards(): Promise<{ firstShown: string; other: string }> {
    const ids = [await pair(), await pair(new FakeNtag424("04a39493cc8680"))];
    // Without an order saved, by id (useCards).
    const [firstShown, other] = ids.sort((a, b) => a.localeCompare(b));
    return { firstShown: firstShown!, other: other! };
  }

  /** The app's router, as Expo Router routes a link (taken once the app is loaded). */
  const appRouter = () => jest.requireActual<typeof import("expo-router")>("expo-router").router;

  /**
   * The system gives the running app `url`, as it does a scanned link: the shell hears it
   * (AppShell.tsx, through React Native's Linking), and Expo Router routes what +native-intent
   * makes of it (`subscribe` of its getLinkingConfig, then a NAVIGATE: its test renderer listens to
   * no link of its own, expo-router/testing-library's mock of expo-linking).
   */
  async function linkReceived(url: string) {
    const shell = jest
      .mocked(Linking.addEventListener)
      .mock.calls.filter(([type]) => type === "url")
      .map(([, listener]) => listener as (event: { url: string }) => void);
    expect(shell).toHaveLength(1);
    const href = redirectSystemPath({ path: url, initial: false });
    await act(async () => {
      shell[0]!({ url });
      appRouter().navigate(href as Href);
    });
  }

  const selected = (cardId: string) =>
    screen.getByTestId(`card-slot-${cardId}`).props.accessibilityState.selected as boolean;

  it("opens on the card of that number, not the first, then forgets the link", async () => {
    const { firstShown, other } = await twoCards();
    await printed(other, NUMBER);
    const { router } = await open(OPENED, linked);
    await waitFor(() => expect(selected(other)).toBe(true), SLOW);
    expect(selected(firstShown)).toBe(false);
    expect(router.getPathname()).toBe("/cards");
    await waitFor(() => expect(router.getSearchParams()).toEqual({}));
    expect(screen.queryByTestId("card-sheet")).toBeNull();
  });

  it("chooses it at each scan while the app runs, another card chosen meanwhile", async () => {
    const { firstShown, other } = await twoCards();
    await printed(other, NUMBER);
    const { router } = await open("/cards", linked);
    await waitFor(() => expect(selected(firstShown)).toBe(true), SLOW);

    await linkReceived(PRINTED);
    await waitFor(() => expect(selected(other)).toBe(true), SLOW);
    expect(router.getPathname()).toBe("/cards");
    await waitFor(() => expect(router.getSearchParams()).toEqual({}));

    await choose(firstShown);
    await waitFor(() => expect(selected(firstShown)).toBe(true));
    // The same card scanned again: chosen again.
    await linkReceived(PRINTED);
    await waitFor(() => expect(selected(other)).toBe(true), SLOW);
    // Another address of the link's host is no screen of the app's: the start (which leads to the
    // point of sale, not among these routes), never a screen its path would name.
    await linkReceived("https://sbpc.ch/1709-1248-5643-8482/more");
    await waitFor(() => expect(router.getPathname()).toBe("/"), SLOW);
  });

  it('opens "Add a card" once a majority of the relays proved the account has none of it', async () => {
    const cardId = await pair();
    // The account's card carries another number.
    await printed(cardId, "1709-1248-5643-8483");
    const { router } = await open(OPENED, linked);
    await waitFor(() => expect(router.getPathname()).toBe("/cards/pair"), SLOW);
    expect(await screen.findByTestId("add-card-start", {}, SLOW)).toBeTruthy();
    // Back to "Cards": the link is not taken again.
    await act(async () => appRouter().back());
    await waitFor(() => expect(router.getPathname()).toBe("/cards"));
    expect(await screen.findByTestId(`card-slot-${cardId}`, {}, SLOW)).toBeTruthy();
    expect(router.getSearchParams()).toEqual({});
    expect(router.getPathname()).toBe("/cards");
  });

  it('opens "Add a card" on an account without any card', async () => {
    const { router } = await open(OPENED, linked);
    await waitFor(() => expect(router.getPathname()).toBe("/cards/pair"), SLOW);
  });

  it("on a till, asks the passkey at once, then opens on the card of that number", async () => {
    const { firstShown, other } = await twoCards();
    await printed(other, NUMBER);
    // The account closed: the phone in till mode, as it is most of the time.
    await lockTerminal();
    signIn.mockClear();
    forgetLaunchLink();
    jest.mocked(Linking.getInitialURL).mockResolvedValueOnce(PRINTED);
    const { router } = await open(OPENED, {
      ...linked,
      "(app)/pos/index": () => <Text testID="till">Till</Text>
    });
    await waitFor(() => expect(signIn).toHaveBeenCalledTimes(1), SLOW);
    await waitFor(() => expect(selected(other)).toBe(true), SLOW);
    expect(selected(firstShown)).toBe(false);
    expect(router.getPathname()).toBe("/cards");
    expect(signIn).toHaveBeenCalledTimes(1);
  });

  it("takes nothing from an address of the app's own scheme that gives its parameters twice", async () => {
    const cardId = await pair();
    await printed(cardId, NUMBER);
    const { router } = await open(`/cards?printed=${NUMBER}&printed=${NUMBER}&scan=1`, linked);
    expect(await screen.findByTestId(`card-slot-${cardId}`, {}, SLOW)).toBeTruthy();
    expect(router.getPathname()).toBe("/cards");
    expect(screen.queryByTestId("add-card-dialog")).toBeNull();
  });

  it('opens "Add a card"\'s dialog on a device that reads no card (an iPad)', async () => {
    nfc.removeNfc();
    const { router } = await open(OPENED, linked);
    expect(await screen.findByTestId("add-card-dialog", {}, SLOW)).toBeTruthy();
    expect(router.getPathname()).toBe("/cards");
    expect(nfc.calls).toEqual([]);
  });

  it("never says the card absent on what the relays did not answer, and drops the link once left", async () => {
    const cardId = await pair();
    // The device keeps its cards; no relay of the account answers: the list is not proven.
    for (const url of currentRelays()) nostr.unreachable.add(url);
    const { router } = await open(OPENED, linked);
    expect(await screen.findByTestId(`card-slot-${cardId}`, {}, SLOW)).toBeTruthy();
    expect(router.getPathname()).toBe("/cards");
    // Still waiting for a list that shows the card.
    expect(router.getSearchParams()).toMatchObject({ printed: NUMBER });

    // Left (another destination): the link goes. Read on a majority at the next visit, nothing
    // opens then.
    nostr.unreachable.clear();
    await fireEvent.press(screen.getByTestId("dock-slot-3"));
    await waitFor(() => expect(router.getPathname()).toBe("/settings"));
    await fireEvent.press(screen.getByTestId("dock-more"));
    await fireEvent.press(screen.getByTestId("more-cards"));
    await waitFor(() => expect(router.getPathname()).toBe("/cards"));
    expect(await screen.findByTestId(`card-slot-${cardId}`, {}, SLOW)).toBeTruthy();
    expect(router.getSearchParams()).toEqual({});
    expect(router.getPathname()).toBe("/cards");
  });
});

describe('"Cards"', () => {
  it("without a card, says what one does in three steps, in place of the carousel", async () => {
    await open("/cards");
    const guide = await screen.findByTestId("cards-add", {}, SLOW);
    expect(within(guide).getByRole("header", { name: "Add your first card" })).toBeTruthy();
    expect(within(guide).getByLabelText(/^1\. Program it, Hold the blank card/)).toBeTruthy();
    expect(within(guide).getByLabelText(/^2\. Top it up, /)).toBeTruthy();
    expect(within(guide).getByLabelText(/^3\. Pay with a tap, /)).toBeTruthy();
    // Its button adds one: the carousel's empty place would say it twice.
    expect(within(guide).getByTestId("cards-pair")).toBeTruthy();
    expect(screen.queryByTestId("card-slot-add")).toBeNull();
    // Without a card to add: the shop, in the browser.
    const opened = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
    try {
      await fireEvent.press(within(guide).getByRole("button", { name: "Order cards" }));
      expect(opened).toHaveBeenCalledWith("https://shop.sattle.me");
    } finally {
      opened.mockRestore();
    }
  });

  it('opens "Where to pay" from the map\'s icon in the header, over the whole window, and back', async () => {
    const { router } = await open("/cards");
    // Without a card already: where a card pays is worth knowing before adding one.
    expect(await screen.findByText("Add your first card", {}, SLOW)).toBeTruthy();
    const icon = screen.getByTestId("cards-merchant-map");
    expect(icon).toHaveAccessibleName("Where to pay with your card");
    // No row of its own in the page.
    expect(screen.queryByText("Pay with the card")).toBeNull();

    await fireEvent.press(icon);
    await waitFor(() => expect(router.getPathname()).toBe("/cards/map"));
    expect(await screen.findByTestId("merchant-map-screen", {}, SLOW)).toBeTruthy();
    expect(screen.getByText("Contactless Lightning · BTC Map")).toBeTruthy();
    expect(webView.shownWebView().source).toEqual({ uri: "https://btcmap.org/map?&nfc" });
    // Over the whole window: no dock.
    expect(screen.queryByTestId("dock")).toBeNull();
    // Down to the window's bottom edge, once the dock left: no band of the shell below the map
    // (merchant-map-bottom.test.tsx).
    await act(async () => {
      jest.advanceTimersByTime(motion.navDock * 2);
    });
    expect(bottomInsetOf(screen.getByTestId("merchant-map-view"))).toBe(0);

    // BTC Map in the system's browser, from the header.
    const opened = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
    try {
      await fireEvent.press(screen.getByTestId("merchant-map-open"));
      expect(opened).toHaveBeenCalledWith("https://btcmap.org/map?&nfc");
    } finally {
      opened.mockRestore();
    }

    await fireEvent.press(screen.getByTestId("merchant-map-back"));
    await waitFor(() => expect(router.getPathname()).toBe("/cards"));
    expect(webView.webViewShown()).toBe(false);
  });

  it("keeps \"Organise\" at the header's edge, the map's icon beside it, from two cards", async () => {
    const first = await pair();
    await pair(new FakeNtag424("04a39493cc8680"));
    await open("/cards");
    await screen.findByTestId(`card-slot-${first}`, {}, SLOW);
    const header = screen.getAllByRole("button").map((button) => button.props.testID as string);
    expect(header.slice(0, 2)).toEqual(["cards-merchant-map", "cards-organize"]);
    // No card chosen changes it: the header is the page's, not a card's.
    await choose(first);
    expect(screen.queryByText("Pay with the card")).toBeNull();
  });

  it("shows the account's cards side by side, each with its relay, then a place to add one", async () => {
    const first = await pair();
    const second = await pair(new FakeNtag424("04a39493cc8680"));
    await open("/cards");

    const slots = (await screen.findAllByTestId(/^card-slot-/, {}, SLOW)).map(
      (slot) => slot.props.testID as string
    );
    // In the order of their ids, the same on every device; the last place adds a card.
    expect(slots).toEqual([
      ...[first, second].sort().map((cardId) => `card-slot-${cardId}`),
      "card-slot-add"
    ]);
    for (const [n, cardId] of [first, second].sort().entries()) {
      const slot = screen.getByTestId(`card-slot-${cardId}`);
      expect(slot.props.accessibilityLabel).toBe(`Card ${n + 1} of 2: ${unnamed(cardId)}`);
      expect(within(slot).getByText(unnamed(cardId))).toBeTruthy();
      await choose(cardId);
      await waitFor(() => expect(slot.props.accessibilityState.selected).toBe(true));
      expect(rowOf("card-advanced")).toBeTruthy();
    }
    expect(screen.queryByText("Add your first card")).toBeNull();
    // The last place: "New card", "Add a card", and the shop where cards are ordered.
    await fireEvent.press(screen.getByTestId("card-slot-add"));
    expect(await screen.findByText("New card")).toBeTruthy();
    expect(screen.getByTestId("cards-pair")).toBeTruthy();
    expect(
      within(screen.getByTestId("cards-add")).getByRole("button", { name: "Order cards" })
    ).toBeTruthy();
  });

  it("shows no card deleted from the account (without it), nor a card reset", async () => {
    const deleted = await pair();
    const kept = await pair(new FakeNtag424("04a39493cc8680"));
    await withCardAccess(async (access) => {
      const { updatedAt: _u, ...state } = knownCardState(TEST_WALLET_ID, deleted)!;
      await recordCardState(access, { ...state, status: "deleted" });
    });
    await open("/cards");
    expect(await screen.findByTestId(`card-slot-${kept}`, {}, SLOW)).toBeTruthy();
    expect(screen.queryByTestId(`card-slot-${deleted}`)).toBeNull();
  });

  it('says when its cards could not be read, never "no card", then reads them again', async () => {
    const cardId = await pair();
    // Another device: no card kept here, and no relay of the account answers.
    resetCardStates();
    secureStore.items.delete(CARD_STATES_KEY);
    for (const url of currentRelays()) nostr.unreachable.add(url);

    await open("/cards");
    expect(await screen.findByTestId("cards-failed", {}, SLOW)).toHaveTextContent(
      /your account's relays are not answering/
    );
    expect(screen.queryByText("Add your first card")).toBeNull();

    nostr.unreachable.clear();
    await fireEvent.press(screen.getByTestId("cards-retry"));
    expect(await screen.findByTestId(`card-slot-${cardId}`, {}, SLOW)).toBeTruthy();
  });

  it("renames a card and lowers its ceiling with the passkey, refusing what is out of bounds", async () => {
    const cardId = await pair();
    await open("/cards");
    // "Limits" under it, grouped as the device's locale does (en-CH in jest.setup.ts): what it
    // spent over 24 hours and this hour, nothing yet, then its ceiling per payment; its button says
    // it whole.
    await choose(cardId);
    await waitFor(
      () =>
        expect(screen.getByTestId("card-limits-day")).toHaveTextContent(
          /^Over 24 hours0of 50.000 sats50.000 sats left$/
        ),
      SLOW
    );
    expect(screen.getByTestId("card-limits-hour")).toHaveTextContent(
      /^This hour0payments of 55 payments left$/
    );
    // Drawn only: the button says them.
    const drawn = { includeHiddenElements: true };
    expect(screen.getByTestId("card-limits-gauge", drawn)).toBeTruthy();
    expect(screen.getByTestId("card-limits-segments", drawn)).toBeTruthy();
    expect(screen.getByTestId("card-limits")).toHaveTextContent(/Per payment20.000 sats at most/);
    expect(screen.getByTestId("card-limits").props.accessibilityLabel).toMatch(
      new RegExp(
        "^Limits, Over 24 hours, 0 of 50.000 sats, 50.000 sats left, This hour, " +
          "0 payments of 5, 5 payments left, Per payment, 20.000 sats at most, Change$"
      )
    );

    let panel = await openTask(cardId, "card-customize");
    await fireEvent.changeText(panel.getByTestId("card-name-field"), "  Erin's   card ");
    await fireEvent.press(panel.getByTestId("card-customize-save"));
    // Saved: the panel closes, the card shows its name.
    await waitFor(() =>
      expect(
        within(screen.getByTestId(`card-slot-${cardId}`)).getByText("Erin's card")
      ).toBeTruthy()
    );

    panel = await openTask(cardId, "card-limits");
    expect(panel.getByTestId("card-ceiling")).toHaveTextContent(/20.000 sats/);
    await fireEvent.press(panel.getByTestId("card-ceiling"));
    expect(await screen.findByTestId("card-limit-maxPaymentSats")).toHaveTextContent(
      /A payment higher than this limit is refused\./
    );
    for (const refused of ["0", "100000001", "12a"]) {
      await fireEvent.changeText(screen.getByTestId("card-limit-field"), refused);
      // 1 BTC at most, grouped as the device's locale does (en-CH in jest.setup.ts).
      expect(
        screen.getByText(/^A whole number of sats, from 1 to 100.000.000 sats\.$/)
      ).toBeTruthy();
      expect(screen.getByTestId("card-limit-save")).toBeDisabled();
    }
    // Unchanged: nothing to save.
    await fireEvent.changeText(screen.getByTestId("card-limit-field"), "20000");
    expect(screen.getByTestId("card-limit-save")).toBeDisabled();
    // Grouped as the user may type it; lowered, with the passkey as any change.
    await fireEvent.changeText(screen.getByTestId("card-limit-field"), "5'000");
    expect(screen.getByTestId("card-limit-save")).toHaveTextContent(/Confirm with my passkey$/);
    await fireEvent.press(screen.getByTestId("card-limit-save"));
    expect(await screen.findByTestId("card-limits-list", {}, SLOW)).toBeTruthy();
    expect(screen.getByTestId("card-ceiling")).toHaveTextContent(/5.000 sats/);
    expect(signIn).toHaveBeenCalledTimes(1);
    expect(knownCardState(TEST_WALLET_ID, cardId)).toMatchObject({
      name: "Erin's card",
      maxPaymentSats: 5_000n
    });

    // "Cards" says the new ceiling.
    await fireEvent.press(screen.getByTestId("card-limits-close"));
    await waitFor(() =>
      expect(screen.getByTestId("card-limits")).toHaveTextContent(/Per payment5.000 sats at most/)
    );
  });

  it("changes a limit only with the passkey, raised or lowered, said on its button", async () => {
    const cardId = await pair();
    await open("/cards");
    await openTask(cardId, "card-limits");
    // The cautious defaults.
    expect(await screen.findByTestId("card-day", {}, SLOW)).toHaveTextContent(/of 50.000 sats/);
    expect(screen.getByTestId("card-hour")).toHaveTextContent(/payments of 5/);

    await fireEvent.press(screen.getByTestId("card-day"));
    // Its own title, and the way back to the three limits.
    expect(screen.getByRole("header", { name: "Over 24 hours" })).toBeTruthy();
    expect(screen.getByLabelText("Back to the limits")).toBeTruthy();
    for (const refused of ["0", "100000001", "-5"]) {
      await fireEvent.changeText(screen.getByTestId("card-limit-field"), refused);
      expect(
        screen.getByText(/^A whole number of sats, from 1 to 100.000.000 sats\.$/)
      ).toBeTruthy();
      expect(screen.getByTestId("card-limit-save")).toBeDisabled();
    }
    await fireEvent.changeText(screen.getByTestId("card-limit-field"), "80 000");
    // Its key's glyph before the text.
    expect(screen.getByTestId("card-limit-save")).toHaveTextContent(/Confirm with my passkey$/);
    await fireEvent.press(screen.getByTestId("card-limit-save"));
    expect(await screen.findByTestId("card-limits-list", {}, SLOW)).toBeTruthy();
    expect(signIn).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("card-day")).toHaveTextContent(/of 80.000 sats/);

    await fireEvent.press(screen.getByTestId("card-hour"));
    // Its title and its field's label alike.
    expect(screen.getAllByText("Payments per hour")).toHaveLength(2);
    for (const refused of ["0", "61", "2.5"]) {
      await fireEvent.changeText(screen.getByTestId("card-limit-field"), refused);
      expect(screen.getByText("A whole number, from 1 to 60.")).toBeTruthy();
      expect(screen.getByTestId("card-limit-save")).toBeDisabled();
    }
    await fireEvent.changeText(screen.getByTestId("card-limit-field"), "12");
    await fireEvent.press(screen.getByTestId("card-limit-save"));
    expect(await screen.findByTestId("card-limits-list", {}, SLOW)).toBeTruthy();
    expect(signIn).toHaveBeenCalledTimes(2);
    expect(knownCardState(TEST_WALLET_ID, cardId)).toMatchObject({
      maxDaySats: 80_000n,
      maxPaymentsPerHour: 12
    });

    // The prompt dismissed: the same form, nothing said, nothing changed.
    await fireEvent.press(screen.getByTestId("card-hour"));
    await fireEvent.changeText(screen.getByTestId("card-limit-field"), "20");
    signIn.mockRejectedValueOnce(new PasskeyError("cancelled", "Dismissed"));
    await fireEvent.press(screen.getByTestId("card-limit-save"));
    await waitFor(() => expect(signIn).toHaveBeenCalledTimes(3));
    expect(await screen.findByTestId("card-limit-save")).toBeEnabled();
    expect(screen.queryByTestId("card-limit-error")).toBeNull();
    // Another account's passkey: said so, nothing changed.
    signIn.mockResolvedValueOnce({ seed: testSeed(OTHER_TEST_MNEMONIC), credentialId: null });
    await fireEvent.press(screen.getByTestId("card-limit-save"));
    expect(await screen.findByTestId("card-limit-error", {}, SLOW)).toBeTruthy();
    expect(knownCardState(TEST_WALLET_ID, cardId)?.maxPaymentsPerHour).toBe(12);
    // Lowered: the same passkey asked, the same button; dismissed, nothing changed.
    await fireEvent.changeText(screen.getByTestId("card-limit-field"), "3");
    expect(screen.getByTestId("card-limit-save")).toHaveTextContent(/Confirm with my passkey$/);
    signIn.mockRejectedValueOnce(new PasskeyError("cancelled", "Dismissed"));
    await fireEvent.press(screen.getByTestId("card-limit-save"));
    await waitFor(() => expect(signIn).toHaveBeenCalledTimes(5));
    expect(await screen.findByTestId("card-limit-save")).toBeEnabled();
    expect(screen.queryByTestId("card-limit-error")).toBeNull();
    expect(knownCardState(TEST_WALLET_ID, cardId)?.maxPaymentsPerHour).toBe(12);
    // "Cancel": back to the three limits, nothing changed.
    await fireEvent.press(screen.getByTestId("card-limit-cancel"));
    expect(await screen.findByTestId("card-limits-list")).toBeTruthy();
    expect(knownCardState(TEST_WALLET_ID, cardId)?.maxPaymentsPerHour).toBe(12);
    // "Cards" says them.
    await fireEvent.press(screen.getByTestId("card-limits-close"));
    await waitFor(() =>
      expect(screen.getByTestId("card-limits").props.accessibilityLabel).toMatch(
        /0 of 80.000 sats, 80.000 sats left, This hour, 0 payments of 12, 12 payments left,/
      )
    );
  });

  it("pauses a card with its switch, said under it, then lets it pay again", async () => {
    const cardId = await pair();
    await open("/cards");
    await choose(cardId);
    expect(screen.queryByTestId("card-face-status")).toBeNull();
    expect(screen.queryByTestId("card-face-paused")).toBeNull();

    await fireEvent(await screen.findByTestId("card-suspend"), "valueChange", true);
    expect(await screen.findByTestId("card-face-status")).toHaveTextContent(/Paused/);
    expect(knownCardState(TEST_WALLET_ID, cardId)?.suspended).toBe(true);
    expect(screen.getByTestId(`card-slot-${cardId}`).props.accessibilityLabel).toMatch(/, paused$/);
    // Its face striped in the carousel, with its badge, out of screen readers' reach: its slot
    // says it.
    const slot = within(screen.getByTestId(`card-slot-${cardId}`));
    // Said under its face's right, in its slot: nothing under the carousel moves for it.
    expect(slot.getByTestId("card-face-status", { includeHiddenElements: true })).toHaveTextContent(
      "Paused"
    );
    expect(slot.getByTestId("card-face-paused", { includeHiddenElements: true })).toBeTruthy();
    expect(slot.getByTestId("card-face-pause-badge", { includeHiddenElements: true })).toBeTruthy();
    // Its channel and keys are kept: a pause forgets nothing.
    expect((await channelOn(relay, cardId))?.hashes.size).toBeGreaterThan(0);

    await fireEvent(screen.getByTestId("card-suspend"), "valueChange", false);
    await waitFor(() => expect(screen.queryByTestId("card-face-status")).toBeNull());
    expect(knownCardState(TEST_WALLET_ID, cardId)?.suspended).toBe(false);
    expect(screen.queryByTestId("card-face-paused", { includeHiddenElements: true })).toBeNull();
  });

  it("says a pause or a limit not saved as a change not saved, never as a pairing", async () => {
    const cardId = await pair();
    await open("/cards");
    await choose(cardId);
    // The device's copy of the cards cannot be written: a failure of no named reason.
    const write = secureStore.setItemAsync.getMockImplementation()!;
    secureStore.setItemAsync.mockImplementation(async (key, value, options) => {
      if (key === CARD_STATES_KEY) throw new Error("Keychain unavailable");
      return write(key, value, options);
    });
    try {
      await fireEvent(await screen.findByTestId("card-suspend"), "valueChange", true);
      expect(await screen.findByText("Error while saving", {}, SLOW)).toBeTruthy();
      // A notification's last period dropped (NotificationsProvider).
      expect(screen.getByText(/^The change could not be saved\. Try again/)).toBeTruthy();
      expect(screen.queryByText(/The pairing failed/)).toBeNull();
      await waitFor(() => expect(screen.getByTestId("card-suspend")).not.toBeChecked());

      // A limit lowered (the passkey confirmed it): the same words in its panel.
      await openTask(cardId, "card-limits");
      await fireEvent.press(await screen.findByTestId("card-hour", {}, SLOW));
      await fireEvent.changeText(screen.getByTestId("card-limit-field"), "2");
      await fireEvent.press(screen.getByTestId("card-limit-save"));
      expect(await screen.findByTestId("card-failed", {}, SLOW)).toHaveTextContent(
        /The change could not be saved\. Try again\./
      );
      expect(screen.getByTestId("card-failed")).not.toHaveTextContent(/The pairing failed/);
    } finally {
      secureStore.setItemAsync.mockImplementation(write);
    }
    expect(knownCardState(TEST_WALLET_ID, cardId)).toMatchObject({
      suspended: false,
      maxPaymentsPerHour: 5
    });
  });

  /** A payment of a card's own wallet, as the SDK's bindings give it (jest/breez-sdk.ts). */
  function sdkPayment({
    id,
    send = false,
    method,
    amount,
    fees = 0n,
    at,
    description,
    paymentHash,
    txId,
    comment
  }: {
    id: string;
    send?: boolean;
    method: "spark" | "lightning" | "deposit" | "withdraw";
    amount: bigint;
    fees?: bigint;
    at: number;
    description?: string;
    paymentHash?: string;
    txId?: string;
    /** Its payer's comment, received at the card's Lightning address (LUD-12). */
    comment?: string;
  }): Record<string, unknown> {
    const details =
      method === "spark"
        ? { tag: sdk.PaymentDetails_Tags.Spark, inner: { invoiceDetails: undefined } }
        : method === "lightning"
          ? {
              tag: sdk.PaymentDetails_Tags.Lightning,
              inner: {
                description,
                invoice: "lnbc1fake",
                htlcDetails: { paymentHash: paymentHash ?? "f".repeat(64), preimage: undefined },
                lnurlReceiveMetadata: comment
                  ? {
                      nostrZapRequest: undefined,
                      nostrZapReceipt: undefined,
                      senderComment: comment
                    }
                  : undefined
              }
            }
          : method === "withdraw"
            ? { tag: sdk.PaymentDetails_Tags.Withdraw, inner: { txId } }
            : { tag: sdk.PaymentDetails_Tags.Deposit, inner: { txId } };
    return {
      id,
      paymentType: send ? sdk.PaymentType.Send : sdk.PaymentType.Receive,
      status: sdk.PaymentStatus.Completed,
      amount,
      fees,
      timestamp: BigInt(Math.floor(at / 1000)),
      method:
        method === "spark"
          ? sdk.PaymentMethod.Spark
          : method === "lightning"
            ? sdk.PaymentMethod.Lightning
            : method === "withdraw"
              ? sdk.PaymentMethod.Withdraw
              : sdk.PaymentMethod.Deposit,
      details
    };
  }

  /** An on-chain deposit not claimed yet, as the bindings give it (`DepositInfo`). */
  function unclaimed(txid: string, amountSats: bigint, over: Record<string, unknown> = {}) {
    return {
      txid,
      vout: 0,
      amountSats,
      isMature: false,
      refundTx: undefined,
      refundTxId: undefined,
      refundState: undefined,
      claimError: undefined,
      instantClaimStatus: undefined,
      maxClaimFee: undefined,
      ...over
    };
  }

  /** "History" of the card, from its action under its balance on "Cards". */
  async function openHistory(cardId: string) {
    await choose(cardId);
    await waitFor(() => expect(screen.getByTestId("card-history")).toBeEnabled(), SLOW);
    await fireEvent.press(screen.getByTestId("card-history"));
    return screen.findByTestId("card-history-list", {}, SLOW);
  }

  /** The rows of "History" shown, by key, in their order. */
  function historyKeys(): string[] {
    return screen
      .getAllByTestId(/^card-history-row-/)
      .map((row) => (row.props.testID as string).replace("card-history-row-", ""));
  }

  /** "History" once read whole (the relays and the card's wallet). */
  async function historyRead() {
    await waitFor(() => expect(screen.queryByTestId("card-history-reading")).toBeNull(), SLOW);
  }

  it("scrolls the whole width of a phone's screen, its content at the screen's gutter", async () => {
    const cardId = await pair();
    await open("/cards");
    expect(await screen.findByText("Security", {}, SLOW)).toBeTruthy();
    // No margin around the scroll view (its bar at the screen's edge), one inside it: the frame's
    // and the screen's both were the gutter twice over.
    expect(sideInsetsOf(screen.getByTestId("cards-screen"))).toEqual({ left: 0, right: 0 });
    expect(sideInsetsOf(screen.getByText("Security"))).toEqual({ left: gutter, right: gutter });

    // "History", the same.
    const history = await openHistory(cardId);
    let scroll = history.parent;
    while (scroll && scroll.type !== "RCTScrollView") scroll = scroll.parent;
    if (!scroll) throw new Error('"History" shows in no scroll view');
    expect(sideInsetsOf(scroll)).toEqual({ left: 0, right: 0 });
    expect(sideInsetsOf(history)).toEqual({ left: gutter, right: gutter });
  });

  it('records the card\'s movements from "Cards" on a phone, its history on a screen of its own', async () => {
    const daily = jest.spyOn(historySync, "recordCardMovementsDaily");
    try {
      const cardId = await pair();
      sdk.fakeCardWallet(cardId).balanceSats = 2_000n;
      await open("/cards");
      expect(await screen.findByTestId("card-balance-sats", {}, SLOW)).toHaveTextContent(
        /^2.000 sats$/
      );
      await waitFor(() => expect(daily).toHaveBeenCalledTimes(1), SLOW);
      expect(daily.mock.calls[0][1]).toEqual({ cardId, walletGeneration: 1 });
    } finally {
      daily.mockRestore();
    }
  });

  it("shows the card's movements by day on a screen of its own, newest first", async () => {
    jest.useFakeTimers({ advanceTimers: true, now: new Date(2026, 9, 17, 12, 0) });
    try {
      const cardId = await pair();
      const today = (h: number, m: number) => new Date(2026, 9, 17, h, m).getTime();
      const yesterday = (h: number, m: number) => new Date(2026, 9, 16, h, m).getTime();
      // Paid this morning, its value kept at the rate of its hour.
      await logCardPayment({
        ...payment(cardId, "a1", today(9, 41)),
        amountSats: 3_400n,
        description: "Cappuccino ×2",
        ...payee("Lakeside Coffee", "sattleme07@breez.tips", "approved"),
        preimage: "1".repeat(64),
        value: {
          minor: 289,
          digits: 2,
          currency: "CHF",
          hour: Math.floor(today(9, 0) / 3_600_000) * 3600
        }
      });
      // Refused yesterday, above its limit: nothing moved, no value.
      await logCardPayment({
        ...payment(cardId, "b2", yesterday(15, 30)),
        amountSats: 24_000n,
        description: null,
        outcome: "declined",
        reason: "amount above limit"
      });
      // Another card's: not in this one's history.
      await logCardPayment({
        ...payment("f".repeat(32), "c3", today(8, 0)),
        cardId: "f".repeat(32)
      });
      // The card's wallet: a recharge from the main balance, a return, a deposit on its way.
      const wallet = sdk.fakeCardWallet(cardId);
      wallet.payments = [
        sdkPayment({ id: "r1", method: "spark", amount: 50_000n, at: today(10, 45) }),
        sdkPayment({
          id: "s1",
          send: true,
          method: "spark",
          amount: 10_000n,
          at: yesterday(18, 10)
        })
      ];
      wallet.unclaimedDeposits = [unclaimed("ab".repeat(32), 25_000n)];
      await open("/cards");
      const list = within(await openHistory(cardId));
      await historyRead();

      // A screen of its own: its title, the card's name, its way back.
      expect(screen.getByText("History")).toBeTruthy();
      expect(screen.getByText(unnamed(cardId))).toBeTruthy();
      // What is on its way first, sats only.
      const pending = within(list.getByTestId("card-history-pending"));
      expect(pending.getByText("In progress")).toBeTruthy();
      expect(pending.getByText("Bitcoin deposit")).toBeTruthy();
      expect(pending.getByText("Received · waiting for confirmation")).toBeTruthy();
      expect(pending.getByText(/^25.000 sats$/)).toBeTruthy();
      // Then every movement, by day, newest first.
      expect(list.getByText("Today")).toBeTruthy();
      expect(list.getByText("Yesterday")).toBeTruthy();
      expect(historyKeys()).toEqual([`m/${cardId}/r1`, "t/a1", `m/${cardId}/s1`, "t/b2"]);
      const row = (key: string) => list.getByTestId(`card-history-row-${key}`);
      expect(row(`m/${cardId}/r1`)).toHaveTextContent(
        /Top-up10:45 · From my main balance50.000 sats$/
      );
      // Its value first, signed as its sats, its sats under it (the display currency first by
      // default); its sats alone without a value.
      expect(row("t/a1")).toHaveTextContent(/Lakeside Coffee09:41 · Paid−2.89 CHF3.400 sats$/);
      expect(row(`m/${cardId}/s1`)).toHaveTextContent(
        /Withdrawal18:10 · To my main balance−10.000 sats$/
      );
      expect(row("t/b2")).toHaveTextContent(
        /Card payment15:30 · Refused: above the per-payment limit24.000 sats$/
      );
      // Each day's net at its title's right, signed, of what moved only (not the refused payment):
      // in sats, as a recharge without a value cannot be told in francs.
      expect(list.getByLabelText(/^Day's net: \+46.600 sats$/)).toBeTruthy();
      expect(list.getByLabelText(/^Day's net: −10.000 sats$/)).toBeTruthy();
      // Never the merchant's address.
      expect(list.queryByText(/@breez\.tips/)).toBeNull();
      // No sentence under the list.
      expect(list.queryByText(/^Payments, top-ups and withdrawals/)).toBeNull();

      await fireEvent.press(screen.getByTestId("card-history-back"));
      expect(await screen.findByTestId("cards-screen", {}, SLOW)).toBeTruthy();
    } finally {
      jest.useRealTimers();
    }
  });

  it("says what a deposit on its way waits for: its confirmations, its claim, lower fees", async () => {
    const cardId = await pair();
    const refused = (requiredFeeSats: bigint) => ({
      tag: sdk.DepositClaimError_Tags.MaxDepositClaimFeeExceeded,
      inner: { tx: "x", vout: 0, requiredFeeSats }
    });
    sdk.fakeCardWallet(cardId).unclaimedDeposits = [
      unclaimed("a1".repeat(32), 25_000n, { isMature: true }),
      unclaimed("b2".repeat(32), 30_000n, { isMature: true, claimError: refused(340n) }),
      // Refused within the 300 sats (under the 99 of an older app): claimed at the next sync.
      unclaimed("c3".repeat(32), 40_000n, { isMature: true, claimError: refused(120n) })
    ];
    await open("/cards");
    await openHistory(cardId);
    await historyRead();
    const deposit = (txid: string) => screen.getByTestId(`card-history-deposit-${txid}-0`);
    expect(deposit("a1".repeat(32))).toHaveTextContent(
      /Bitcoin depositConfirmed · being added to the balance25.000 sats$/
    );
    expect(deposit("b2".repeat(32))).toHaveTextContent(
      /Bitcoin depositWaiting for lower fees: 340 sats asked, 300 at most30.000 sats$/
    );
    expect(deposit("c3".repeat(32))).toHaveTextContent(
      /Bitcoin depositConfirmed · being added to the balance40.000 sats$/
    );
  });

  it("shows a payment's details: its value at its hour's rate, its proof, its fee as paid", async () => {
    const cardId = await pair();
    const at = Date.now() - 3600_000;
    const hash = "a1".padStart(64, "0");
    await logCardPayment({
      ...payment(cardId, "a1", at),
      amountSats: 3_400n,
      description: "Cappuccino ×2",
      ...payee("Lakeside Coffee", "sattleme07@breez.tips", "approved"),
      preimage: "1".repeat(64),
      value: { minor: 289, digits: 2, currency: "CHF", hour: 1_792_310_400 }
    });
    // What the card's wallet paid for it: its fee.
    sdk.fakeCardWallet(cardId).payments = [
      sdkPayment({
        id: "p1",
        send: true,
        method: "lightning",
        amount: 3_400n,
        fees: 4n,
        at,
        paymentHash: hash
      })
    ];
    await open("/cards");
    await openHistory(cardId);
    await historyRead();
    await fireEvent.press(screen.getByTestId("card-history-row-t/a1"));
    const detail = within(await screen.findByTestId("card-history-tap", {}, SLOW));
    expect(within(screen.getByTestId("card-history-detail")).getByRole("header")).toHaveTextContent(
      "Payment"
    );
    // Its value first, as the list writes it ("Currency shown first"), its sats under it.
    expect(detail.getByTestId("card-history-amount")).toHaveTextContent(/^−2.89 CHF$/);
    expect(detail.getByTestId("card-history-amount-sats")).toHaveTextContent(/^3.400 sats$/);
    expect(detail.getByText("Lakeside Coffee")).toBeTruthy();
    expect(detail.getByText("Paid · approved merchant")).toBeTruthy();
    // As kept, "At the time of the transaction"; now: no point of the present known, said so.
    expect(detail.getByTestId("card-history-value-then")).toHaveTextContent(
      /^At the time of the transaction: 2.89 CHF$/
    );
    expect(await detail.findByText("Now: rate unavailable", {}, SLOW)).toBeTruthy();
    // The screen's title names the card: never its rows.
    expect(detail.queryByText("Card")).toBeNull();
    expect(detail.queryByText(unnamed(cardId))).toBeNull();
    expect(detail.queryByTestId("card-mini", { includeHiddenElements: true })).toBeNull();
    expect(detail.getByText("Cappuccino ×2")).toBeTruthy();
    expect(detail.getByText(/^4 sats$/)).toBeTruthy();
    // Its proof is kept, never shown.
    expect(detail.queryByText("Proof of payment")).toBeNull();
    expect(detail.queryByText(/The proof of payment/)).toBeNull();
  });

  describe("a card migrated from Swiss Bitcoin Pay", () => {
    const PRINTED_NUMBER = "9337-6937-5632-2883";
    /** Two days ago and a week ago, in the v2 server's seconds: within the records' 90 days. */
    const paidAt = (days: number) => Math.floor(Date.now() / 1000) - days * 24 * 3600;

    /** A card of the account, migrated from the v2 card printed PRINTED_NUMBER. */
    async function migrated(): Promise<string> {
      const cardId = await pair();
      await withCardAccess(async (access) => {
        const { updatedAt: _updatedAt, ...state } = knownCardState(TEST_WALLET_ID, cardId)!;
        await recordCardState(access, {
          ...state,
          issuer: {
            image: { key: "11".repeat(32), hash: "22".repeat(32) },
            number: PRINTED_NUMBER,
            white: false
          },
          settingsAt: state.settingsAt + 1
        });
      });
      return cardId;
    }

    /**
     * The v2 card's history on the v2 server: a tap and a recharge its payer wrote a note with (its
     * description), settled; PIN `pin`.
     */
    function v2History(pin: string | null) {
      const row = (id: string, amount: number, days: number) => ({
        id,
        amount_sat: amount,
        fee_msat: 0,
        title: amount < 0 ? "🇨🇭 Swiss Bitcoin Pay Card" : "Card top-up",
        description: amount < 0 ? null : " For Heidi's coffee ",
        tag: amount < 0 ? "withdraw" : "lightning-deposit",
        status: "settled",
        payment_details: null,
        created_at: paidAt(days),
        paid_at: paidAt(days)
      });
      legacyV2.cards.set(PRINTED_NUMBER, {
        pin,
        payments: [row("tap", -2_500, 2), row("topup", 40_000, 7)],
        wrongPins: 0
      });
    }

    const legacyKeys = [`l/${legacyCardRowRef("tap")}`, `l/${legacyCardRowRef("topup")}`];

    // A new run of the app: no copy tried yet.
    beforeEach(() => resetLegacyCardHistory());

    it("shows its v2 history among its movements, copied by itself, without saying where from", async () => {
      const cardId = await migrated();
      v2History(null);
      await open("/cards");
      await openHistory(cardId);
      await waitFor(() => expect(historyKeys()).toEqual(legacyKeys), SLOW);
      await historyRead();
      // As any payment, without a merchant's name: the v2 server kept none.
      const tap = screen.getByTestId(`card-history-row-${legacyKeys[0]}`);
      expect(tap).toHaveTextContent(/Card payment/);
      expect(tap).not.toHaveTextContent(/Swiss Bitcoin Pay/);
      expect(screen.getByTestId(`card-history-row-${legacyKeys[1]}`)).toHaveTextContent(/Top-up/);
      expect(screen.queryByTestId("card-history-legacy-pin")).toBeNull();
      await fireEvent.press(tap);
      const detail = within(await screen.findByTestId("card-history-legacy", {}, SLOW));
      expect(detail.getByText("Card payment")).toBeTruthy();
      expect(detail.getByTestId("card-history-amount")).toHaveTextContent(/^−2.500 sats$/);
      // Nothing written with it: no note, never the v2 server's own label.
      expect(detail.queryByText("Note")).toBeNull();
      expect(detail.queryByText(/Swiss Bitcoin Pay/)).toBeNull();
    });

    it("shows the note of a v2 movement in its detail, as the v2 card portal did", async () => {
      const cardId = await migrated();
      v2History(null);
      await open("/cards");
      await openHistory(cardId);
      await waitFor(() => expect(historyKeys()).toEqual(legacyKeys), SLOW);
      await historyRead();
      await fireEvent.press(screen.getByTestId(`card-history-row-${legacyKeys[1]}`));
      const detail = within(await screen.findByTestId("card-history-legacy", {}, SLOW));
      expect(detail.getByTestId("card-history-amount")).toHaveTextContent(/^40.000 sats$/);
      expect(detail.getByText("Note")).toBeTruthy();
      expect(detail.getByText("For Heidi's coffee")).toBeTruthy();
      // Its title is the v2 app's label, no note.
      expect(detail.queryByText("Card top-up")).toBeNull();
    });

    it("never shows the transfer of its balance at the migration, on either side", async () => {
      const cardId = await migrated();
      const at = (paidAt(1) + 5) * 1000;
      // The card's v2 balance, 70 sats, sent to its wallet at its migration: paid on the v2
      // server, then received by the wallet seconds later. Only the v2 service's pages show it.
      legacyV2.cards.set(PRINTED_NUMBER, {
        pin: null,
        payments: [
          {
            id: "drain",
            amount_sat: -70,
            fee_msat: 0,
            title: "🇨🇭 Swiss Bitcoin Pay Card",
            description: null,
            tag: "withdraw",
            status: "settled",
            payment_details: null,
            created_at: paidAt(1),
            paid_at: paidAt(1)
          }
        ],
        wrongPins: 0
      });
      sdk.fakeCardWallet(cardId).payments = [
        sdkPayment({
          id: "migration",
          method: "lightning",
          amount: 70n,
          at,
          description: CARD_MIGRATION_INVOICE_DESCRIPTION
        })
      ];
      await open("/cards");
      await openHistory(cardId);
      await historyRead();
      // Its v2 history copied (its only row the transfer), and nothing of it shown.
      await waitFor(() => expect(legacyV2.pinsGiven.length).toBeGreaterThanOrEqual(2), SLOW);
      await historyRead();
      expect(screen.queryAllByTestId(/^card-history-row-/)).toEqual([]);
      expect(screen.queryByText(/Transfer to sattle\.me/)).toBeNull();
      expect(screen.queryByText("Top-up")).toBeNull();
      expect(await screen.findByTestId("card-history-empty", {}, SLOW)).toBeTruthy();
    });

    it("says when its v2 history could not be read from a majority of the relays", async () => {
      const cardId = await migrated();
      v2History(null);
      const author = await withCardAccess(
        async ({ root }) => deriveLegacyHistoryKeys(root).nostr.publicKey
      );
      // Three relays of five never send the copies' author's records: no majority to tell of it.
      for (const relay of currentRelays().slice(0, 3)) {
        nostr.silentAuthors.set(relay, new Set([author]));
      }
      await open("/cards");
      await openHistory(cardId);
      expect(
        await screen.findByTestId("card-history-legacy-unread", {}, { timeout: 20_000 })
      ).toHaveTextContent(/older movements of the card may be missing/);
      // Nothing copied without knowing what the relays hold, nothing said empty.
      expect(legacyV2.calls.filter(({ path }) => path === "/v1/apipayments/by-card")).toEqual([]);
      expect(screen.queryByTestId("card-history-empty")).toBeNull();
    });

    it("asks the PIN of a card that has one, once, and shows its history with it", async () => {
      const cardId = await migrated();
      v2History("2580");
      await open("/cards");
      await openHistory(cardId);
      expect(await screen.findByTestId("card-history-legacy-pin", {}, SLOW)).toHaveTextContent(
        /protected by the PIN/
      );
      expect(screen.queryAllByTestId(/^card-history-row-l\//)).toEqual([]);
      await fireEvent.press(screen.getByTestId("card-history-legacy-open"));
      const sheet = within(await screen.findByTestId("card-history-legacy-sheet"));
      // Too short: never sent, its button stays off.
      await fireEvent.changeText(sheet.getByTestId("card-history-legacy-pin-field"), "25");
      expect(sheet.getByTestId("card-history-legacy-submit")).toBeDisabled();
      await fireEvent.changeText(sheet.getByTestId("card-history-legacy-pin-field"), "1111");
      await fireEvent.press(sheet.getByTestId("card-history-legacy-submit"));
      expect(await sheet.findByText("Wrong PIN", {}, SLOW)).toBeTruthy();
      // Cleared after each try: never kept.
      expect(sheet.getByTestId("card-history-legacy-pin-field")).toHaveProp("value", "");
      await fireEvent.changeText(sheet.getByTestId("card-history-legacy-pin-field"), "2580");
      await fireEvent.press(sheet.getByTestId("card-history-legacy-submit"));
      await waitFor(() => expect(historyKeys()).toEqual(legacyKeys), SLOW);
      expect(screen.queryByTestId("card-history-legacy-pin")).toBeNull();
      // Asked of the v2 server without, then with each PIN typed: never more.
      expect(legacyV2.pinsGiven.filter((pin) => pin !== null)).toEqual(["1111", "2580", "2580"]);
    });
  });

  it("offers to approve a refused new merchant, with the passkey; never one it could not identify", async () => {
    const cardId = await pair();
    const at = Date.now() - 3600_000;
    await logCardPayment({
      ...payment(cardId, "a1", at),
      description: "Daily newspaper",
      outcome: "declined",
      reason: "payee_not_approved",
      ...payee("Station Kiosk", "sattleme07@breez.tips", "new")
    });
    await logCardPayment({
      ...payment(cardId, "b2", at - 60_000),
      outcome: "declined",
      reason: "payee_unidentified",
      ...payee("", "", "unidentified")
    });
    await open("/cards");
    await openHistory(cardId);
    await historyRead();

    // Not identified: nothing to approve.
    await fireEvent.press(screen.getByTestId("card-history-row-t/b2"));
    const unknown = within(await screen.findByTestId("card-history-tap", {}, SLOW));
    expect(unknown.getByText("Unidentified merchant, not confirmed in time")).toBeTruthy();
    expect(unknown.queryByTestId("card-history-approve")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByTestId("card-history-tap")).toBeNull());

    await fireEvent.press(screen.getByTestId("card-history-row-t/a1"));
    const detail = within(await screen.findByTestId("card-history-tap", {}, SLOW));
    expect(within(screen.getByTestId("card-history-detail")).getByRole("header")).toHaveTextContent(
      "Refused payment"
    );
    expect(detail.getByTestId("card-history-amount")).toHaveTextContent(/^2.000 sats$/);
    expect(detail.getByText("Refused · nothing left")).toBeTruthy();
    expect(detail.getByText("New merchant, not confirmed in time")).toBeTruthy();
    expect(detail.getByText("Daily newspaper")).toBeTruthy();
    expect(
      detail.getByText(
        "You will be asked for your passkey. Its next payments will go through without confirmation, within the card's limits."
      )
    ).toBeTruthy();
    // The passkey dismissed: nothing approved, nothing said.
    signIn.mockRejectedValueOnce(new PasskeyError("cancelled", "Dismissed"));
    await fireEvent.press(await detail.findByTestId("card-history-approve", {}, SLOW));
    await waitFor(() => expect(signIn).toHaveBeenCalledTimes(1));
    expect(await detail.findByTestId("card-history-approve", {}, SLOW)).toBeEnabled();
    expect(detail.queryByTestId("card-history-approve-error")).toBeNull();
    expect(
      (await loadCardPayees(TEST_WALLET_ID, { cardId, walletGeneration: 1 })).approved
    ).toEqual([]);

    await fireEvent.press(detail.getByTestId("card-history-approve"));
    expect(await detail.findByTestId("card-history-approved", {}, SLOW)).toBeTruthy();
    expect(signIn).toHaveBeenCalledTimes(2);
    expect(detail.queryByTestId("card-history-approve")).toBeNull();
    expect(
      (await loadCardPayees(TEST_WALLET_ID, { cardId, walletGeneration: 1 })).approved
    ).toMatchObject([{ id: "sattleme07@breez.tips", approvedName: "Station Kiosk" }]);
    // Published to the account's relays (payees-sync.ts).
    await waitFor(
      async () =>
        expect(
          bookOf(await loadPayeeBooks(TEST_WALLET_ID), { cardId, walletGeneration: 1 }).unpublished
            .size
        ).toBe(0),
      SLOW
    );
  });

  it("approves no merchant past the check of the 12 words, the passkey never asked", async () => {
    const cardId = await pair();
    await logCardPayment({
      ...payment(cardId, "a1", Date.now() - 3600_000),
      description: "Daily newspaper",
      outcome: "declined",
      reason: "payee_not_approved",
      ...payee("Station Kiosk", "sattleme07@breez.tips", "new")
    });
    // The check started 31 days ago, the words never typed back.
    await updateAccount({
      recoveryCheck: { verifiedAt: null, dueSince: nowUnix() - 31 * 86_400 }
    });
    await open("/cards");
    await openHistory(cardId);
    await historyRead();
    await fireEvent.press(screen.getByTestId("card-history-row-t/a1"));
    const detail = within(await screen.findByTestId("card-history-tap", {}, SLOW));
    signIn.mockClear();

    await fireEvent.press(await detail.findByTestId("card-history-approve", {}, SLOW));

    expect(await detail.findByTestId("card-history-approve-error", {}, SLOW)).toBeTruthy();
    expect(
      detail.getByText("Your payments are blocked: first check your 12 recovery words.")
    ).toBeTruthy();
    expect(signIn).not.toHaveBeenCalled();
    expect(
      (await loadCardPayees(TEST_WALLET_ID, { cardId, walletGeneration: 1 })).approved
    ).toEqual([]);
  });

  it("offers to approve a refused merchant its node names, saying what approving it means", async () => {
    const cardId = await pair();
    const node = testNode(31);
    const shown = `Node ${node.nodeId.slice(0, 8)}…${node.nodeId.slice(-8)}`;
    const entry = payment(cardId, "a1", Date.now() - 3600_000);
    await logCardPayment({
      ...entry,
      description: "Saturday Market",
      outcome: "declined",
      reason: "payee_not_approved",
      // Another point of sale: no proof, its invoice signed by the merchant's node.
      pr: makeInvoice({
        amountMsat: 2_000_000n,
        paymentHash: entry.paymentHash,
        signWith: node.secretKey
      }),
      payee: { status: "new", name: null, metadata: null, verify: null, verifyAnswer: null }
    });
    await open("/cards");
    await openHistory(cardId);
    await historyRead();
    await fireEvent.press(screen.getByTestId("card-history-row-t/a1"));
    const detail = within(await screen.findByTestId("card-history-tap", {}, SLOW));
    // Its title is the point of sale's note; the merchant, its node, after its mark.
    expect(detail.getByText("Saturday Market")).toBeTruthy();
    expect(detail.getByText(shown)).toBeTruthy();
    expect(detail.getByTestId("payee-mark-node")).toBeTruthy();
    expect(within(detail.getByTestId("card-history-merchant")).getByText(shown)).toBeTruthy();
    expect(detail.getByTestId("card-history-approve-node")).toBeTruthy();
    await fireEvent.press(await detail.findByTestId("card-history-approve", {}, SLOW));
    expect(await detail.findByTestId("card-history-approved", {}, SLOW)).toBeTruthy();
    expect(
      (await loadCardPayees(TEST_WALLET_ID, { cardId, walletGeneration: 1 })).approved
    ).toMatchObject([{ id: node.nodeId, by: "node" }]);
  });

  it("names a merchant its node identifies by the alias it declared, after its mark", async () => {
    const cardId = await pair();
    const node = testNode(35);
    const entry = payment(cardId, "a1", Date.now() - 3600_000);
    await logCardPayment({
      ...entry,
      description: "Card payment",
      preimage: "1".repeat(64),
      pr: makeInvoice({
        amountMsat: 2_000_000n,
        paymentHash: entry.paymentHash,
        signWith: node.secretKey
      }),
      payee: { status: "new", name: " kappa ", metadata: null, verify: null, verifyAnswer: null }
    });
    await open("/cards");
    await openHistory(cardId);
    await historyRead();
    await fireEvent.press(screen.getByTestId("card-history-row-t/a1"));
    const detail = within(await screen.findByTestId("card-history-tap", {}, SLOW));
    // Its alias, cleaned, never "Node …": its key shortened is its name only without one.
    const merchant = within(detail.getByTestId("card-history-merchant"));
    expect(merchant.getByText("kappa")).toBeTruthy();
    expect(merchant.getByTestId("payee-mark-node")).toBeTruthy();
    expect(detail.queryByText(/^Node /)).toBeNull();
    expect(detail.getByText("Card payment")).toBeTruthy();
  });

  it("offers no approval where its next payments would still be asked: every payment confirmed", async () => {
    const cardId = await pair();
    await logCardPayment({
      ...payment(cardId, "a1", Date.now() - 3600_000),
      outcome: "declined",
      reason: "payment_unconfirmed",
      ...payee("Station Kiosk", "sattleme07@breez.tips", "new")
    });
    await setCardPayeeMode(TEST_WALLET_ID, { cardId, walletGeneration: 1 }, "confirm");
    await open("/cards");
    await openHistory(cardId);
    await historyRead();
    await fireEvent.press(screen.getByTestId("card-history-row-t/a1"));
    const detail = within(await screen.findByTestId("card-history-tap", {}, SLOW));
    expect(detail.getByText("Not confirmed in time")).toBeTruthy();
    // Its book read: nothing offered.
    await act(async () => {
      for (let turn = 0; turn < 100; turn++) await Promise.resolve();
    });
    expect(detail.queryByTestId("card-history-approve")).toBeNull();
  });

  it("links an on-chain recharge's transaction to the account's node when it names one", async () => {
    // The node the card's wallets read the chain on (src/lib/breez/chain-node.ts).
    await changeBitcoinNode({ url: "https://node.example.ch", fallback: "none", payers: false });
    const cardId = await pair();
    const txid = "7f3a9c".padEnd(64, "1");
    sdk.fakeCardWallet(cardId).payments = [
      sdkPayment({
        id: "d1",
        method: "deposit",
        amount: 29_901n,
        fees: 99n,
        at: Date.now() - 3600_000,
        txId: txid
      })
    ];
    const opened = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
    await open("/cards");
    await openHistory(cardId);
    await historyRead();
    await fireEvent.press(screen.getByTestId(`card-history-row-m/${cardId}/d1`));
    const detail = within(await screen.findByTestId("card-history-movement", {}, SLOW));
    const link = detail.getByTestId("card-history-tx-link");
    expect(link.props.accessibilityLabel).toBe("View the transaction on node.example.ch");
    await fireEvent.press(link);
    expect(opened).toHaveBeenCalledWith(`https://node.example.ch/tx/${txid}`);
    expect(opened).toHaveBeenCalledTimes(1);
  });

  it("shows a recharge's details: an on-chain one's received sats, its fee, its transaction", async () => {
    const cardId = await pair();
    const at = Date.now() - 3600_000;
    const txid = "7f3a9c".padEnd(64, "1");
    sdk.fakeCardWallet(cardId).payments = [
      sdkPayment({ id: "d1", method: "deposit", amount: 29_901n, fees: 99n, at, txId: txid }),
      sdkPayment({
        id: "i1",
        method: "lightning",
        amount: 50_000n,
        at: at - 60_000,
        description: "Card top-up",
        paymentHash: "b".repeat(64)
      })
    ];
    const opened = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
    const copied = jest.mocked(Clipboard.setStringAsync);
    await open("/cards");
    await openHistory(cardId);
    await historyRead();
    expect(screen.getByTestId(`card-history-row-m/${cardId}/d1`)).toHaveTextContent(
      /Top-up\d\d:\d\d · Bitcoin address, fee 99 sats29.901 sats$/
    );
    expect(screen.getByTestId(`card-history-row-m/${cardId}/i1`)).toHaveTextContent(
      /Top-up\d\d:\d\d · Lightning invoice50.000 sats$/
    );
    // What came in: unsigned, in green.
    expect(
      StyleSheet.flatten(
        within(screen.getByTestId(`card-history-row-m/${cardId}/i1`)).getByText(/^50.000 sats$/)
          .props.style
      ).color
    ).toBe(colors.success.fg);

    await fireEvent.press(screen.getByTestId(`card-history-row-m/${cardId}/d1`));
    const detail = within(await screen.findByTestId("card-history-movement", {}, SLOW));
    expect(within(screen.getByTestId("card-history-detail")).getByRole("header")).toHaveTextContent(
      "Top-up"
    );
    expect(detail.getByTestId("card-history-amount")).toHaveTextContent(/^29.901 sats$/);
    expect(detail.getByText("Bitcoin address")).toBeTruthy();
    expect(detail.getByText(/^30.000 sats$/)).toBeTruthy();
    expect(detail.getByText("99 sats, deducted")).toBeTruthy();
    expect(detail.getByTestId("card-history-txid")).toHaveTextContent("7f3a9c…111111");
    await fireEvent.press(detail.getByTestId("card-history-tx-copy"));
    await waitFor(() => expect(copied).toHaveBeenLastCalledWith(txid));
    expect(await screen.findByText("Transaction ID copied")).toBeTruthy();
    const link = detail.getByTestId("card-history-tx-link");
    expect(link.props.accessibilityLabel).toBe("View the transaction on mempool.space");
    await fireEvent.press(link);
    expect(opened).toHaveBeenCalledWith(`https://mempool.space/tx/${txid}`);
    await fireEvent.press(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByTestId("card-history-movement")).toBeNull());

    // An invoice's: its description, no fee.
    await fireEvent.press(screen.getByTestId(`card-history-row-m/${cardId}/i1`));
    const invoice = within(await screen.findByTestId("card-history-movement", {}, SLOW));
    expect(invoice.getByText("Lightning invoice")).toBeTruthy();
    expect(invoice.getByText("Card top-up")).toBeTruthy();
    expect(invoice.getByText("None")).toBeTruthy();
  });

  it('shows what the card\'s wallet cannot tell as "Deposit" or "Withdrawal", never a recharge', async () => {
    const cardId = await pair();
    const at = Date.now() - 3600_000;
    // As spark-sdk 0.27.0 on stores transfers of a type it does not know, completed, the received
    // one with a Lightning receipt's details: it read before as a recharge by Lightning address.
    sdk.fakeCardWallet(cardId).payments = [
      sdk.unknownMethodPayment({
        id: "u1",
        amount: 21_000n,
        timestamp: Math.floor(at / 1000),
        details: {
          tag: sdk.PaymentDetails_Tags.Lightning,
          inner: {
            description: undefined,
            invoice: "lnbc1fake",
            htlcDetails: { paymentHash: "e".repeat(64), preimage: undefined }
          }
        }
      }),
      sdk.unknownMethodPayment({
        id: "u2",
        send: true,
        amount: 5_000n,
        fees: 7n,
        timestamp: Math.floor((at - 60_000) / 1000)
      }),
      // Not completed: not a movement yet.
      sdk.unknownMethodPayment({
        id: "u3",
        status: sdk.PaymentStatus.Pending,
        amount: 1_000n,
        timestamp: Math.floor((at - 120_000) / 1000)
      })
    ];
    await open("/cards");
    await openHistory(cardId);
    await historyRead();
    expect(historyKeys()).toEqual([`u/${cardId}/u1`, `u/${cardId}/u2`]);
    expect(screen.getByTestId(`card-history-row-u/${cardId}/u1`)).toHaveTextContent(
      /Deposit\d\d:\d\d21.000 sats$/
    );
    expect(screen.getByTestId(`card-history-row-u/${cardId}/u2`)).toHaveTextContent(
      /Withdrawal\d\d:\d\d−5.000 sats$/
    );
    expect(screen.queryByText(/Top-up|Lightning address/)).toBeNull();

    // Its details: its amount and its date, nothing it is not known to be (no way, no fee).
    await fireEvent.press(screen.getByTestId(`card-history-row-u/${cardId}/u2`));
    const detail = within(await screen.findByTestId("card-history-unidentified", {}, SLOW));
    expect(within(screen.getByTestId("card-history-detail")).getByRole("header")).toHaveTextContent(
      "Withdrawal"
    );
    expect(detail.getByTestId("card-history-amount")).toHaveTextContent(/^−5.000 sats$/);
    expect(within(detail.getByTestId("card-history-detail-0")).getByText("Date")).toBeTruthy();
    expect(detail.queryByTestId("card-history-detail-1")).toBeNull();
  });

  it("shows the payments the account's other phones made with the card, from the relays", async () => {
    const cardId = await pair();
    const at = Date.now() - 3600_000;
    await logCardPayment(payment(cardId, "a1", at));
    // Paid by another phone of the account: on the relays only.
    const keys = await withCardAccess(async ({ root }) => deriveHistoryRecordKeys(root));
    await publishToRelays(
      historyEvent(keys, { entry: payment(cardId, "b2", at + 60_000), revision: 1 }),
      {
        relays: currentRelays(),
        channel: "account",
        timeoutMs: 1000,
        authKey: keys.nostr.secretKey
      }
    );
    await open("/cards");
    await openHistory(cardId);
    await historyRead();
    expect(historyKeys()).toEqual(["t/b2", "t/a1"]);
    expect(screen.getByTestId("card-history-row-t/b2")).toHaveTextContent(/Payment b2/);
    expect(screen.queryByTestId("card-history-own")).toBeNull();
  });

  it("says when the relays did not answer: this phone's payments only", async () => {
    const cardId = await pair();
    await logCardPayment(payment(cardId, "c3", Date.now() - 3600_000));
    // A recharge of April in the card's wallet: its month's copy, if any, is on the relays.
    sdk.fakeCardWallet(cardId).payments = [
      sdkPayment({ id: "r0", method: "spark", amount: 5_000n, at: Date.UTC(2026, 3, 14, 12, 0) })
    ];
    await open("/cards");
    await choose(cardId);
    for (const url of currentRelays()) nostr.unreachable.add(url);
    await openHistory(cardId);
    expect(await screen.findByTestId("card-history-own", {}, SLOW)).toHaveTextContent(
      /payments made by your other phones may be missing/
    );
    expect(screen.getByTestId("card-history-row-t/c3")).toBeTruthy();
    await historyRead();
    // No month shown without the copy a majority holds of it.
    expect(screen.queryByTestId("card-history-older")).toBeNull();
  });

  it("says when the card has no movement, never before everything was read", async () => {
    const cardId = await pair();
    await open("/cards");
    await choose(cardId);
    await waitFor(() => expect(screen.getByTestId("card-history")).toBeEnabled(), SLOW);
    // The relays still being read: the phone's log shows (empty), never "No movement".
    const release = nostr.holdQueries();
    await fireEvent.press(screen.getByTestId("card-history"));
    expect(await screen.findByTestId("card-history-reading", {}, SLOW)).toBeTruthy();
    expect(screen.getByTestId("card-history-list")).toBeTruthy();
    expect(screen.queryByTestId("card-history-empty")).toBeNull();
    release();
    expect(await screen.findByTestId("card-history-empty", {}, SLOW)).toHaveTextContent(
      "No movement for this card."
    );
    expect(screen.queryByTestId("card-history-reading")).toBeNull();
  });

  it("never offers to approve a refused merchant bearing an approved one's name", async () => {
    const cardId = await pair();
    await approveCardPayee(
      TEST_WALLET_ID,
      { cardId, walletGeneration: 1 },
      { id: "sattleme01@breez.tips", name: "Walter Bakery" },
      Date.now()
    );
    // Another account, the same name: its address is never shown, nothing tells them apart.
    await logCardPayment({
      ...payment(cardId, "a1", Date.now() - 3600_000),
      outcome: "declined",
      reason: "payee_not_approved",
      ...payee("Walter Bakery", "impostor@breez.tips", "new")
    });
    await open("/cards");
    await openHistory(cardId);
    await historyRead();
    await fireEvent.press(screen.getByTestId("card-history-row-t/a1"));
    const detail = within(await screen.findByTestId("card-history-tap", {}, SLOW));
    expect(await detail.findByTestId("card-history-homonym", {}, SLOW)).toHaveTextContent(
      /Same name as an approved merchant, but a different account/
    );
    expect(detail.queryByTestId("card-history-approve")).toBeNull();
  });

  it("says where each withdrawal went: its note, else a Bitcoin withdrawal's own", async () => {
    await updateAccount({ displayCurrency: "CHF" });
    const hour = Math.floor(Date.now() / 3_600_000) * 3600 - 2 * 3600;
    setCoingeckoPrice("CHF", hour, 84_000);
    setMockRate(100_000);
    const cardId = await pair();
    const SPARK = "11111111-1111-4111-8111-111111111111";
    const LIGHTNING = "22222222-2222-4222-8222-222222222222";
    const TAP = "33333333-3333-4333-8333-333333333333";
    const TXID = "ab".repeat(32);
    sdk.fakeCardWallet(cardId).payments = [
      sdkPayment({
        id: SPARK,
        send: true,
        method: "spark",
        amount: 7_000n,
        at: (hour + 900) * 1000
      }),
      sdkPayment({
        id: LIGHTNING,
        send: true,
        method: "lightning",
        amount: 3_000n,
        fees: 2n,
        at: (hour + 800) * 1000
      }),
      // A payment at a point of sale this phone did not log: no note, no movement.
      sdkPayment({
        id: TAP,
        send: true,
        method: "lightning",
        amount: 1_000n,
        at: (hour + 750) * 1000
      }),
      sdkPayment({
        id: "w1",
        send: true,
        method: "withdraw",
        amount: 20_000n,
        fees: 640n,
        at: (hour + 700) * 1000,
        txId: TXID
      }),
      sdkPayment({ id: "r1", method: "spark", amount: 40_000n, at: (hour + 600) * 1000 })
    ];
    // Noted before they left (withdrawal-source.ts), as "Withdraw" does.
    await withCardAccess(async (access) => {
      for (const [id, way] of [
        [SPARK, "spark"],
        [LIGHTNING, "address"]
      ] as const) {
        expect(
          await historySync.noteCardWithdrawal(access, { cardId, walletGeneration: 1, id, way })
        ).toBe(true);
      }
    });
    await open("/cards");
    await openHistory(cardId);
    await historyRead();
    const row = (id: string) => screen.getByTestId(`card-history-row-m/${cardId}/${id}`);
    await waitFor(() => expect(row(SPARK)).toHaveTextContent(/5.88 CHF/), SLOW);
    expect(row(SPARK)).toHaveTextContent(/Withdrawal\d\d:\d\d · Spark address−5.88 CHF7.000 sats$/);
    expect(row(LIGHTNING)).toHaveTextContent(
      /Withdrawal\d\d:\d\d · Lightning address−2.52 CHF3.000 sats$/
    );
    // On-chain: a withdrawal, noted or not (no payment at a point of sale goes on-chain).
    expect(row("w1")).toHaveTextContent(
      /Withdrawal\d\d:\d\d · Bitcoin address, fee 640 sats−16.80 CHF20.000 sats$/
    );
    expect(screen.queryByTestId(`card-history-row-m/${cardId}/${TAP}`)).toBeNull();
    expect(screen.queryByTestId(`card-history-row-u/${cardId}/${SPARK}`)).toBeNull();

    await fireEvent.press(row("w1"));
    const detail = within(await screen.findByTestId("card-history-movement", {}, SLOW));
    expect(detail.getByText("To")).toBeTruthy();
    expect(detail.getByText("Bitcoin address")).toBeTruthy();
    expect(detail.getByText("Transaction")).toBeTruthy();
    // Its fee on top, never "deducted" as a deposit's.
    expect(detail.getByText("640 sats")).toBeTruthy();
    expect(detail.queryByText("Received")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByTestId("card-history-movement")).toBeNull());
  });

  it("shows a withdrawal an app of before recorded as a return as the withdrawal", async () => {
    await updateAccount({ displayCurrency: "CHF" });
    const hour = Math.floor(Date.now() / 3_600_000) * 3600 - 2 * 3600;
    setCoingeckoPrice("CHF", hour, 84_000);
    const cardId = await pair();
    const ID = "44444444-4444-4444-8444-444444444444";
    const at = (hour + 900) * 1000;
    sdk.fakeCardWallet(cardId).payments = [
      sdkPayment({ id: ID, send: true, method: "spark", amount: 7_000n, at })
    ];
    const value = { minor: 588, digits: 2, currency: "CHF", hour };
    await withCardAccess(async (access) => {
      const keys = deriveHistoryRecordKeys(access.root);
      // As an older app version recorded it: a return, with its value.
      await publishToRelays(
        movementEvent(keys, {
          movement: {
            id: ID,
            cardId,
            walletGeneration: 1,
            kind: "return",
            way: null,
            at,
            amountSats: 7_000n,
            feeSats: 0n,
            txid: null,
            description: null,
            value
          },
          revision: 0
        }),
        {
          relays: currentRelays(),
          channel: "account",
          timeoutMs: 1000,
          authKey: keys.nostr.secretKey
        }
      );
      await historySync.noteCardWithdrawal(access, {
        cardId,
        walletGeneration: 1,
        id: ID,
        way: "spark"
      });
    });
    await open("/cards");
    await openHistory(cardId);
    await historyRead();
    // Its note over the record: the withdrawal, with the value kept (written again so on the
    // relays: card-history-sync.test.ts).
    const row = screen.getByTestId(`card-history-row-m/${cardId}/${ID}`);
    expect(row).toHaveTextContent(/Withdrawal\d\d:\d\d · Spark address−5.88 CHF7.000 sats$/);
  });

  it("never says a Spark transfer sent went to the main balance before its notes are read", async () => {
    const cardId = await pair();
    const ID = "55555555-5555-4555-8555-555555555555";
    sdk.fakeCardWallet(cardId).payments = [
      sdkPayment({ id: ID, send: true, method: "spark", amount: 7_000n, at: Date.now() - 60_000 })
    ];
    // The relays' answer to "History" held: the card's wallet read, its notes not yet.
    const read = historySync.readCardHistory;
    let release = () => undefined as void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const reading = jest
      .spyOn(historySync, "readCardHistory")
      .mockImplementation(async (...args) => {
        await held;
        return read(...args);
      });
    try {
      await open("/cards");
      await openHistory(cardId);
      // A return or a withdrawal, not known yet: "Withdrawal", its time alone, nothing said of
      // where.
      const row = await screen.findByTestId(`card-history-row-u/${cardId}/${ID}`, {}, SLOW);
      expect(row).toHaveTextContent(/Withdrawal\d\d:\d\d−7.000 sats$/);
      expect(row).not.toHaveTextContent(/main balance/);
      expect(screen.queryByTestId(`card-history-row-m/${cardId}/${ID}`)).toBeNull();
      // Read whole, no note: a return to the main balance.
      release();
      expect(
        await screen.findByTestId(`card-history-row-m/${cardId}/${ID}`, {}, SLOW)
      ).toHaveTextContent(/Withdrawal\d\d:\d\d · To my main balance−7.000 sats/);
      expect(screen.queryByTestId(`card-history-row-u/${cardId}/${ID}`)).toBeNull();
    } finally {
      release();
      reading.mockRestore();
    }
  });

  it("shows a recharge's and a return's value as recorded, and their details", async () => {
    await updateAccount({ displayCurrency: "CHF" });
    const hour = Math.floor(Date.now() / 3_600_000) * 3600 - 2 * 3600;
    // 1 BTC = 84,000 CHF at that hour: 20,000 sats = 16.80 CHF.
    setCoingeckoPrice("CHF", hour, 84_000);
    // 100,000 CHF at the point pricing the present: 20,000 sats = 20.00 CHF now.
    setMockRate(100_000);
    const cardId = await pair();
    sdk.fakeCardWallet(cardId).payments = [
      sdkPayment({
        id: "l1",
        method: "lightning",
        amount: 20_000n,
        at: (hour + 900) * 1000,
        paymentHash: "c".repeat(64),
        comment: "For the coffee"
      }),
      sdkPayment({
        id: "s1",
        send: true,
        method: "spark",
        amount: 20_000n,
        at: (hour + 700) * 1000
      }),
      sdkPayment({ id: "r1", method: "spark", amount: 20_000n, at: (hour + 600) * 1000 })
    ];
    await open("/cards");
    await openHistory(cardId);
    await historyRead();
    const row = (id: string) => screen.getByTestId(`card-history-row-m/${cardId}/${id}`);
    // Recorded with their value as "History" opened (recordCardMovements).
    await waitFor(() => expect(row("r1")).toHaveTextContent(/16.80 CHF20.000 sats$/), SLOW);
    expect(row("r1")).toHaveTextContent(
      /Top-up\d\d:\d\d · From my main balance16.80 CHF20.000 sats$/
    );
    expect(row("s1")).toHaveTextContent(
      /Withdrawal\d\d:\d\d · To my main balance−16.80 CHF20.000 sats$/
    );
    // A Lightning payment received without a description: the card's Lightning address.
    expect(row("l1")).toHaveTextContent(/Top-up\d\d:\d\d · Lightning address16.80 CHF20.000 sats$/);
    // The day's net in francs, each of its movements valued: two recharges, a return.
    expect(screen.getByLabelText(/^Day's net: \+16.80 CHF$/)).toBeTruthy();

    await fireEvent.press(row("r1"));
    let detail = within(await screen.findByTestId("card-history-movement", {}, SLOW));
    expect(detail.getByText("My main balance")).toBeTruthy();
    expect(detail.getByTestId("card-history-value-then")).toHaveTextContent(
      /^At the time of the transaction: 16.80 CHF$/
    );
    expect(await detail.findByText(/^Now: 20.00 CHF$/, {}, SLOW)).toBeTruthy();
    expect(detail.getByText("None")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByTestId("card-history-movement")).toBeNull());

    await fireEvent.press(row("s1"));
    detail = within(await screen.findByTestId("card-history-movement", {}, SLOW));
    expect(within(screen.getByTestId("card-history-detail")).getByRole("header")).toHaveTextContent(
      "Withdrawal"
    );
    expect(detail.getByTestId("card-history-amount")).toHaveTextContent(/^−16.80 CHF$/);
    expect(detail.getByTestId("card-history-amount-sats")).toHaveTextContent(/^20.000 sats$/);
    expect(detail.getByText("To")).toBeTruthy();
    expect(detail.getByText("My main balance")).toBeTruthy();
    expect(detail.getByTestId("card-history-value-then")).toHaveTextContent(
      /^At the time of the transaction: 16.80 CHF$/
    );
    expect(await detail.findByText(/^Now: 20.00 CHF$/, {}, SLOW)).toBeTruthy();
    expect(detail.queryByText("Note")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByTestId("card-history-movement")).toBeNull());

    // Received at the card's Lightning address: its value as recorded, what its payer wrote as
    // the card's wallet tells it (never recorded).
    await fireEvent.press(row("l1"));
    detail = within(await screen.findByTestId("card-history-movement", {}, SLOW));
    expect(detail.getByText("Payment type")).toBeTruthy();
    expect(detail.getByText("Lightning address")).toBeTruthy();
    expect(detail.getByTestId("card-history-value-then")).toHaveTextContent(/: 16.80 CHF$/);
    expect(detail.getByText("Note")).toBeTruthy();
    expect(detail.getByText("For the coffee")).toBeTruthy();
  });

  it("says a payment may have left, with its value, and when the card's wallet was not read", async () => {
    const cardId = await pair();
    const at = Date.now() - 3600_000;
    await logCardPayment({
      ...payment(cardId, "b9", at),
      amountSats: 3_400n,
      outcome: "uncertain",
      value: { minor: 289, digits: 2, currency: "CHF", hour: Math.floor(at / 3_600_000) * 3600 }
    });
    // The card's wallet connects, but lists none of its payments.
    const connect = sdk.connect.getMockImplementation()!;
    sdk.connect.mockImplementation(async (request?: unknown) => {
      const connected = (await connect(request)) as Record<string, jest.Mock>;
      const dir = (request as { storageDir?: string } | undefined)?.storageDir ?? "";
      if (dir.includes(`/breez-sdk-spark-cards/${cardId}/`)) {
        connected.listPayments!.mockRejectedValue(new Error("Storage unavailable"));
      }
      return connected;
    });
    try {
      await open("/cards");
      await choose(cardId);
      await waitFor(() => expect(screen.getByTestId("card-history")).toBeEnabled(), SLOW);
      await fireEvent.press(screen.getByTestId("card-history"));
      expect(await screen.findByTestId("card-history-wallet-failed", {}, SLOW)).toHaveTextContent(
        /its latest top-ups and withdrawals may be missing/
      );
      expect(screen.queryByTestId("card-history-empty")).toBeNull();
      expect(screen.getByTestId("card-history-row-t/b9")).toHaveTextContent(
        /Payment b9\d\d:\d\d · Uncertain: may have left−2.89 CHF3.400 sats$/
      );
      // Its recharges and returns may be missing: no day's net.
      expect(screen.queryByLabelText(/^Day's net/)).toBeNull();
      await fireEvent.press(screen.getByTestId("card-history-row-t/b9"));
      expect(await screen.findByText("Uncertain · may have left", {}, SLOW)).toBeTruthy();
    } finally {
      sdk.connect.mockImplementation(connect);
    }
  });

  it("shows a deposit claimed while it was read once: as the recharge it became", async () => {
    const cardId = await pair();
    const txid = "5d".repeat(32);
    const wallet = sdk.fakeCardWallet(cardId);
    // Listed as waiting, then as claimed: the wallet claimed it between the two reads.
    wallet.unclaimedDeposits = [unclaimed(txid, 30_000n, { isMature: true })];
    wallet.payments = [
      sdkPayment({
        id: "d1",
        method: "deposit",
        amount: 29_901n,
        fees: 99n,
        at: Date.now() - 600_000,
        txId: txid
      })
    ];
    await open("/cards");
    await openHistory(cardId);
    await historyRead();
    expect(screen.getByTestId(`card-history-row-m/${cardId}/d1`)).toBeTruthy();
    expect(screen.queryByTestId("card-history-pending")).toBeNull();
  });

  it("never says the card has no movement while the relays did not answer", async () => {
    const cardId = await pair();
    await open("/cards");
    await choose(cardId);
    for (const url of currentRelays()) nostr.unreachable.add(url);
    await openHistory(cardId);
    expect(await screen.findByTestId("card-history-own", {}, SLOW)).toBeTruthy();
    await historyRead();
    expect(screen.queryByTestId("card-history-empty")).toBeNull();
  });

  it("writes a movement's sats first, then its value, once this device chose so", async () => {
    await saveAmountUnit("sats");
    const cardId = await pair();
    const at = Date.now() - 3600_000;
    const hour = Math.floor(at / 3_600_000) * 3600;
    await logCardPayment({
      ...payment(cardId, "a1", at),
      value: { minor: 289, digits: 2, currency: "CHF", hour }
    });
    // Refused: struck through, in sats, whatever the choice.
    await logCardPayment({
      ...payment(cardId, "b2", at + 60_000),
      outcome: "declined",
      value: null
    });
    await open("/cards");
    await openHistory(cardId);
    await historyRead();
    expect(screen.getByTestId("card-history-row-t/a1")).toHaveTextContent(/−2.000 sats2.89 CHF$/);
    expect(screen.getByTestId("card-history-row-t/b2")).toHaveTextContent(/2.000 sats$/);
    // Its details as well: its sats, large; its value in its rows.
    await fireEvent.press(screen.getByTestId("card-history-row-t/a1"));
    const detail = within(await screen.findByTestId("card-history-tap", {}, SLOW));
    expect(detail.getByTestId("card-history-amount")).toHaveTextContent(/^−2.000 sats$/);
    expect(detail.queryByTestId("card-history-amount-sats")).toBeNull();
    if (new Date(at).toDateString() === new Date(at + 60_000).toDateString()) {
      expect(screen.getByLabelText(/^Day's net: −2.000 sats$/)).toBeTruthy();
    }
  });

  it("tells each value in the currency it was kept in, never one for all once it changed", async () => {
    const cardId = await pair();
    const at = Date.now() - 3600_000;
    const hour = Math.floor(at / 3_600_000) * 3600;
    await logCardPayment({
      ...payment(cardId, "a1", at),
      value: { minor: 289, digits: 2, currency: "EUR", hour }
    });
    await logCardPayment({
      ...payment(cardId, "b2", at + 60_000),
      value: { minor: 312, digits: 2, currency: "CHF", hour }
    });
    // Refused: nothing moved, its value never shown (nor counted).
    await logCardPayment({
      ...payment(cardId, "c3", at + 120_000),
      outcome: "declined",
      value: { minor: 1, digits: 0, currency: "JPY", hour }
    });
    await open("/cards");
    await openHistory(cardId);
    await historyRead();
    expect(screen.getByTestId("card-history-row-t/a1")).toHaveTextContent(/−2.89 EUR2.000 sats$/);
    expect(screen.getByTestId("card-history-row-t/b2")).toHaveTextContent(/−3.12 CHF2.000 sats$/);
    // Values in two currencies never add up: the day's net in sats (the refused one left out),
    // both on the same day (a run in the minute midnight falls between them puts them in two).
    if (new Date(at).toDateString() === new Date(at + 60_000).toDateString()) {
      expect(screen.getByLabelText(/^Day's net: −4.000 sats$/)).toBeTruthy();
    }
    // Its value now in the currency it was kept in, not the account's: 2,000 sats at 90,000 EUR.
    // Not read yet: said so, never an outage nor a value.
    mockRateLoading = true;
    mockRateCurrencies.clear();
    await fireEvent.press(screen.getByTestId("card-history-row-t/a1"));
    const detail = within(await screen.findByTestId("card-history-tap", {}, SLOW));
    expect(detail.getByTestId("card-history-value-then")).toHaveTextContent(
      /^At the time of the transaction: 2.89 EUR$/
    );
    expect(detail.getByText("Now: reading the rate")).toBeTruthy();
    expect(detail.queryByText(/^Now: rate unavailable$/)).toBeNull();
    mockRateLoading = false;
    await act(async () => setMockRate(90_000));
    expect(await detail.findByText(/^Now: 1.80 EUR$/, {}, SLOW)).toBeTruthy();
    expect(mockRateCurrencies).toContain("EUR");
  });

  it("shows the months beyond its records' 90 days, a month at a time, from their copies", async () => {
    const cardId = await pair();
    const at = Date.UTC(2026, 3, 14, 12, 0);
    // A copy of April (history-copies.ts): its records long gone.
    await withCardAccess(async ({ root }) => {
      const keys = { parts: deriveMonthPartKeys(root), history: deriveHistoryRecordKeys(root) };
      const taken = await writeMonthCopy(
        keys,
        { cardId, walletGeneration: 1 },
        "2026-04",
        [{ entry: payment(cardId, "0a", at), revision: 0 }],
        [],
        null,
        Date.now(),
        currentRelays()
      );
      expect(taken).toBe(true);
    });
    await open("/cards");
    await openHistory(cardId);
    await historyRead();
    expect(screen.queryByTestId("card-history-row-t/0a")).toBeNull();
    const older = await screen.findByTestId("card-history-older", {}, SLOW);
    expect(older).toHaveTextContent(/April 2026/);
    await fireEvent.press(older);
    expect(await screen.findByTestId("card-history-row-t/0a", {}, SLOW)).toHaveTextContent(
      /Payment 0a/
    );
    // Nothing older kept anywhere: nothing more offered.
    expect(screen.queryByTestId("card-history-older")).toBeNull();
  });

  it("says a month copied by a newer app shows in it, never that the relays did not answer", async () => {
    const cardId = await pair();
    const taps = [{ entry: payment(cardId, "0a", Date.UTC(2026, 3, 14, 12, 0)), revision: 0 }];
    await withCardAccess(async ({ root }) => {
      const keys = { parts: deriveMonthPartKeys(root), history: deriveHistoryRecordKeys(root) };
      const now = Date.now();
      expect(
        await writeMonthCopy(
          keys,
          { cardId, walletGeneration: 1 },
          "2026-04",
          taps,
          [],
          null,
          now,
          currentRelays()
        )
      ).toBe(true);
      // A newer app wrote its part again, of a format this one does not read.
      const { head, parts } = monthCopy({ cardId, walletGeneration: 1 }, "2026-04", taps, []);
      const newer = sealRecord({
        type: "card-history-month-part",
        value: { ...monthPartValue(parts[0]), version: 2 },
        signer: keys.parts.nostr.secretKey,
        encryptionKey: keys.parts.encryptionKey,
        address: monthPartAddress(keys.parts, { ...head, part: 0 }),
        createdAt: Math.floor(now / 1000) + 60
      });
      await publishToRelays(newer, {
        relays: currentRelays(),
        channel: "account",
        timeoutMs: 1000,
        authKey: keys.parts.nostr.secretKey
      });
    });
    await open("/cards");
    await openHistory(cardId);
    await historyRead();
    expect(screen.queryByTestId("card-history-newer")).toBeNull();
    await fireEvent.press(await screen.findByTestId("card-history-older", {}, SLOW));
    expect(await screen.findByTestId("card-history-newer", {}, SLOW)).toHaveTextContent(
      /are only shown by a newer version of the app/
    );
    expect(screen.queryByTestId("card-history-month-failed")).toBeNull();
    expect(screen.queryByText("Part of the months shown could not be read.")).toBeNull();
    expect(screen.queryByTestId("card-history-row-t/0a")).toBeNull();
  });

  it('says "Show all" for the month the list reaches into', async () => {
    jest.useFakeTimers({ advanceTimers: true, now: new Date(2026, 9, 18, 12, 0) });
    try {
      const cardId = await pair();
      const july = (day: number) => new Date(2026, 6, day, 12, 0).getTime();
      // Paid on 25 July: within its records' 90 days.
      await logCardPayment(payment(cardId, "b1", july(25)));
      // Paid on 10 July: kept by the copy of July only.
      await withCardAccess(async ({ root }) => {
        const keys = { parts: deriveMonthPartKeys(root), history: deriveHistoryRecordKeys(root) };
        const copied = await writeMonthCopy(
          keys,
          { cardId, walletGeneration: 1 },
          "2026-07",
          [{ entry: payment(cardId, "a1", july(10)), revision: 0 }],
          [],
          null,
          Date.now(),
          currentRelays()
        );
        expect(copied).toBe(true);
      });
      await open("/cards");
      await openHistory(cardId);
      await historyRead();
      expect(historyKeys()).toEqual(["t/b1"]);
      const older = await screen.findByTestId("card-history-older", {}, SLOW);
      expect(older).toHaveTextContent(/Show all of July 2026/);
      await fireEvent.press(older);
      expect(await screen.findByTestId("card-history-row-t/a1", {}, SLOW)).toBeTruthy();
      expect(historyKeys()).toEqual(["t/b1", "t/a1"]);
    } finally {
      jest.useRealTimers();
    }
  });

  it("goes back by the holder's months: in Zurich, a payment of 1 November at 00:30 is November's", async () => {
    jest.useFakeTimers({ advanceTimers: true, now: Date.UTC(2027, 2, 15, 12, 0) });
    jest.spyOn(calendarModule, "deviceCalendar").mockReturnValue(fixedCalendar(1));
    try {
      const cardId = await pair();
      const copy = (month: string, ids: [string, number][]) =>
        withCardAccess(async ({ root }) => {
          const keys = { parts: deriveMonthPartKeys(root), history: deriveHistoryRecordKeys(root) };
          const taken = await writeMonthCopy(
            keys,
            { cardId, walletGeneration: 1 },
            month,
            ids.map(([id, at]) => ({ entry: payment(cardId, id, at), revision: 0 })),
            [],
            null,
            Date.now(),
            currentRelays()
          );
          expect(taken).toBe(true);
        });
      // October's copy (UTC) holds 31 October at 23:30 there: 1 November at 00:30 in Zurich.
      await copy("2026-10", [
        ["0c", Date.UTC(2026, 9, 15, 12, 0)],
        ["0d", Date.UTC(2026, 9, 31, 23, 30)]
      ]);
      await copy("2026-11", [["0e", Date.UTC(2026, 10, 20, 12, 0)]]);
      // October's copy not given by a majority of the relays, once.
      const original = historyCopiesModule.readCardHistoryMonth;
      let october = 0;
      const reads = jest
        .spyOn(historyCopiesModule, "readCardHistoryMonth")
        .mockImplementation(async (access, head) =>
          head.month === "2026-10" && ++october === 1 ? null : original(access, head)
        );
      await open("/cards");
      await openHistory(cardId);
      await historyRead();
      const older = await screen.findByTestId("card-history-older", {}, SLOW);
      expect(older).toHaveTextContent(/Show November 2026$/);
      await fireEvent.press(older);
      // November needs both copies: not shown without October's, nothing of it shown.
      expect(await screen.findByTestId("card-history-month-failed", {}, SLOW)).toBeTruthy();
      expect(screen.queryAllByTestId(/^card-history-row-/)).toEqual([]);
      // Again: October's only, November's read already.
      await fireEvent.press(screen.getByTestId("card-history-older"));
      // November whole: its night's payment from October's copy, read with it.
      await waitFor(() => expect(historyKeys()).toEqual(["t/0e", "t/0d"]), SLOW);
      const months = reads.mock.calls.map(([, head]) => head.month);
      expect(months.slice(0, 2).sort()).toEqual(["2026-10", "2026-11"]);
      expect(months.slice(2)).toEqual(["2026-10"]);
      expect(screen.getByTestId("card-history-older")).toHaveTextContent(/Show October 2026$/);
      await fireEvent.press(screen.getByTestId("card-history-older"));
      await waitFor(() => expect(historyKeys()).toEqual(["t/0e", "t/0d", "t/0c"]), SLOW);
      expect(screen.queryByTestId("card-history-older")).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it("says a month may miss something when a copy holding its first hours lacks a part (Zurich)", async () => {
    jest.useFakeTimers({ advanceTimers: true, now: Date.UTC(2027, 2, 15, 12, 0) });
    jest.spyOn(calendarModule, "deviceCalendar").mockReturnValue(fixedCalendar(1));
    try {
      const cardId = await pair();
      const copy = (month: string, ids: [string, number][]) =>
        withCardAccess(async ({ root }) => {
          const keys = { parts: deriveMonthPartKeys(root), history: deriveHistoryRecordKeys(root) };
          const taken = await writeMonthCopy(
            keys,
            { cardId, walletGeneration: 1 },
            month,
            ids.map(([id, at]) => ({ entry: payment(cardId, id, at), revision: 0 })),
            [],
            null,
            Date.now(),
            currentRelays()
          );
          expect(taken).toBe(true);
        });
      await copy("2026-10", [["0c", Date.UTC(2026, 9, 15, 12, 0)]]);
      await copy("2026-11", [["0e", Date.UTC(2026, 10, 20, 12, 0)]]);
      // October's copy read without one of its parts: its last hour (1 November in Zurich) may
      // hold a payment no relay gave.
      const original = historyCopiesModule.readCardHistoryMonth;
      jest
        .spyOn(historyCopiesModule, "readCardHistoryMonth")
        .mockImplementation(async (access, head) => {
          const read = await original(access, head);
          return read && head.month === "2026-10" ? { ...read, complete: false } : read;
        });
      await open("/cards");
      await openHistory(cardId);
      await historyRead();
      const older = await screen.findByTestId("card-history-older", {}, SLOW);
      expect(older).toHaveTextContent(/Show November 2026$/);
      expect(screen.queryByTestId("card-history-incomplete")).toBeNull();
      await fireEvent.press(older);
      await waitFor(() => expect(historyKeys()).toEqual(["t/0e"]), SLOW);
      // November shown, its first hour from October's incomplete copy: said.
      expect(screen.getByTestId("card-history-incomplete")).toBeTruthy();
    } finally {
      jest.useRealTimers();
    }
  });

  it("offers the holder's month a copy shows, never an empty one: in New York, 31 October at 22:00", async () => {
    jest.useFakeTimers({ advanceTimers: true, now: Date.UTC(2027, 2, 15, 12, 0) });
    jest.spyOn(calendarModule, "deviceCalendar").mockReturnValue(fixedCalendar(-4));
    try {
      const cardId = await pair();
      // November's copy (UTC) holds only 1 November at 02:00 UTC: 31 October at 22:00 there.
      await withCardAccess(async ({ root }) => {
        const keys = { parts: deriveMonthPartKeys(root), history: deriveHistoryRecordKeys(root) };
        const taken = await writeMonthCopy(
          keys,
          { cardId, walletGeneration: 1 },
          "2026-11",
          [{ entry: payment(cardId, "0f", Date.UTC(2026, 10, 1, 2, 0)), revision: 0 }],
          [],
          null,
          Date.now(),
          currentRelays()
        );
        expect(taken).toBe(true);
      });
      // Its first read not given by a majority of the relays: said, then "Try again".
      const original = historyCopiesModule.readCardHistoryMonth;
      let reads = 0;
      jest
        .spyOn(historyCopiesModule, "readCardHistoryMonth")
        .mockImplementation(async (access, head) =>
          ++reads === 1 ? null : original(access, head)
        );
      await open("/cards");
      await openHistory(cardId);
      await historyRead();
      expect(await screen.findByTestId("card-history-month-failed", {}, SLOW)).toBeTruthy();
      // No month offered nor "No movement" said while it is not known.
      expect(screen.queryByTestId("card-history-older")).toBeNull();
      expect(screen.queryByTestId("card-history-empty")).toBeNull();
      await fireEvent.press(screen.getByTestId("card-history-older-retry"));
      const older = await screen.findByTestId("card-history-older", {}, SLOW);
      // October, never November, which would show nothing.
      expect(older).toHaveTextContent(/Show October 2026$/);
      expect(screen.queryByTestId("card-history-month-failed")).toBeNull();
      expect(screen.queryAllByTestId(/^card-history-row-/)).toEqual([]);
      await fireEvent.press(older);
      await waitFor(() => expect(historyKeys()).toEqual(["t/0f"]), SLOW);
      // Read twice only: the first failed, then once; nothing older anywhere.
      expect(reads).toBe(2);
      expect(screen.queryByTestId("card-history-older")).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  /** "Add a card" from "Cards", through its guide, to the card added. */
  async function addFromCards(router: { getPathname(): string }) {
    // The carousel's last place adds a card.
    await fireEvent.press(await screen.findByTestId("card-slot-add", {}, SLOW));
    await fireEvent.press(await screen.findByTestId("cards-pair", {}, SLOW));
    await waitFor(() => expect(router.getPathname()).toBe("/cards/pair"));
    // Its guide first: nothing asked of the phone before "Start".
    await fireEvent.press(await screen.findByTestId("add-card-start", {}, SLOW));
    await titleSays("Card added");
  }

  it('adds another card from "Add a card", the first one kept, then "Later"', async () => {
    const first = await pair();
    const second = new FakeNtag424("04a39493cc8680");
    nfc.holdCard(second);
    const { router } = await open("/cards");
    await addFromCards(router);
    expect(second.keyVersions).toEqual([1, 1, 1, 1, 1]);

    await fireEvent.press(screen.getByText("Later"));
    await waitFor(() => expect(router.getPathname()).toBe("/cards"));
    expect(await screen.findByTestId(`card-slot-${first}`, {}, SLOW)).toBeTruthy();
    expect(screen.getAllByTestId(/^card-slot-[0-9a-f]{32}$/)).toHaveLength(2);
    // The card added is the one chosen, no panel open; the screen's address says nothing more.
    const added = await withCardAccess(async ({ root }) => cardIdOf(root, second.uid));
    await waitFor(() =>
      expect(screen.getByTestId(`card-slot-${added}`).props.accessibilityState.selected).toBe(true)
    );
    expect(screen.queryByTestId("card-sheet")).toBeNull();
    await waitFor(() => expect(router.getSearchParams()).toEqual({}));
  });

  it('opens "Top up" of the card just added on "Top up the card", once', async () => {
    await pair();
    const second = new FakeNtag424("04a39493cc8680");
    nfc.holdCard(second);
    const { router } = await open("/cards");
    await addFromCards(router);

    await fireEvent.press(screen.getByText("Top up the card"));
    await waitFor(() => expect(router.getPathname()).toBe("/cards"));
    const added = await withCardAccess(async ({ root }) => cardIdOf(root, second.uid));
    const panel = within(await screen.findByTestId("card-sheet", {}, SLOW));
    expect(panel.getByRole("header")).toHaveTextContent("Top up");
    expect(screen.getByTestId(`card-slot-${added}`).props.accessibilityState.selected).toBe(true);
    // Its parameters gone once shown: closed, the panel does not come back.
    await waitFor(() => expect(router.getSearchParams()).toEqual({}));
    await fireEvent.press(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByTestId("card-sheet")).toBeNull(), SLOW);
  });

  it("adds a card on a phone without a push token, saying it pays with the app shown", async () => {
    notifications.notifications.token = null;
    nfc.holdCard(card);
    await open("/cards/pair");
    await fireEvent.press(await screen.findByTestId("add-card-start", {}, SLOW));
    expect(await screen.findByTestId("card-activation-no-push", {}, SLOW)).toHaveTextContent(
      /it pays only while the app is on screen/
    );
    expect(screen.getByTestId("card-steps-title")).toHaveTextContent("Card added");
    expect(screen.queryByTestId("add-card-failure")).toBeNull();
  });

  it('says an addition that failed at its step, then adds on "Try again"', async () => {
    const strange = new FakeNtag424();
    strange.keyVersions[0] = 3;
    nfc.holdCard(strange);
    await open("/cards/pair");
    await fireEvent.press(await screen.findByTestId("add-card-start", {}, SLOW));
    await titleSays("The card was not added");
    expect(screen.getByTestId("card-step-card")).toHaveTextContent(
      /Card not blank.*Ask its issuer to reset it first/
    );

    nfc.holdCard(card);
    await fireEvent.press(screen.getByTestId("card-steps-primary"));
    await titleSays("Card added");
  });

  it('leaves "Add a card" by its way back, its steps to come or under way, the card let go', async () => {
    await pair();
    // The card paired taken away: the next session waits for one.
    nfc.holdCard(null);
    nfc.waitForCard();
    const { router } = await open("/cards");
    await fireEvent.press(await screen.findByTestId("card-slot-add", {}, SLOW));
    await fireEvent.press(await screen.findByTestId("cards-pair", {}, SLOW));
    // Before "Start": "Cards".
    expect(await screen.findByTestId("add-card-start", {}, SLOW)).toBeTruthy();
    await fireEvent.press(screen.getByTestId("pair-card-back"));
    await waitFor(() => expect(router.getPathname()).toBe("/cards"));

    // Under way: "Cards" too (the steps to come are the same screen), the card no longer awaited.
    await fireEvent.press(await screen.findByTestId("card-slot-add", {}, SLOW));
    await fireEvent.press(await screen.findByTestId("cards-pair", {}, SLOW));
    await fireEvent.press(await screen.findByTestId("add-card-start", {}, SLOW));
    await waitFor(() => expect(nfc.awaitingCard()).toBe(true), SLOW);
    await fireEvent.press(screen.getByTestId("pair-card-back"));
    await waitFor(() => expect(router.getPathname()).toBe("/cards"));
    await waitFor(() => expect(nfc.awaitingCard()).toBe(false));
    expect(nfc.calls).toContain("cancelTechnologyRequest");
  });

  it('leaves "Add a card" on "Cancel" of its steps: "Cards", the card let go', async () => {
    nfc.waitForCard();
    const { router } = await open("/cards");
    await fireEvent.press(await screen.findByTestId("cards-pair", {}, SLOW));
    await fireEvent.press(await screen.findByTestId("add-card-start", {}, SLOW));
    await waitFor(() => expect(nfc.awaitingCard()).toBe(true), SLOW);
    // Its steps, not its guide, until "Cards" shows.
    expect(screen.getByTestId("card-steps-cancel")).toHaveTextContent("Cancel");
    await fireEvent.press(screen.getByTestId("card-steps-cancel"));
    await waitFor(() => expect(router.getPathname()).toBe("/cards"));
    await waitFor(() => expect(nfc.awaitingCard()).toBe(false));
    expect(screen.queryByTestId("add-card-start")).toBeNull();
  });

  it('goes back to "Cards" on the card added by its way back, as "Later" does', async () => {
    nfc.holdCard(card);
    const { router } = await open("/cards");
    await fireEvent.press(await screen.findByTestId("cards-pair", {}, SLOW));
    await fireEvent.press(await screen.findByTestId("add-card-start", {}, SLOW));
    await titleSays("Card added");
    await fireEvent.press(screen.getByTestId("pair-card-back"));
    await waitFor(() => expect(router.getPathname()).toBe("/cards"));
    const added = await withCardAccess(async ({ root }) => cardIdOf(root, card.uid));
    await waitFor(
      () =>
        expect(screen.getByTestId(`card-slot-${added}`).props.accessibilityState.selected).toBe(
          true
        ),
      SLOW
    );
    expect(screen.queryByTestId("card-sheet")).toBeNull();
  });

  it("says what a v2 card held holds, in sats and in the point of sale's currency", async () => {
    // 1 BTC = 100,000 CHF: 30,000 sats are 30 CHF.
    setMockRate(100_000);
    const server = addLegacyServer("api.swiss-bitcoin-pay.ch");
    server.balanceMsat = BigInt(30_000_000);
    server.v2Keys = LEGACY_KEYS;
    {
      nfc.holdCard(
        legacyNtag424({
          uid: LEGACY_UID,
          host: "api.swiss-bitcoin-pay.ch",
          master: hexToBytes(LEGACY_MASTER),
          meta: hexToBytes(LEGACY_META),
          file: hexToBytes(LEGACY_FILE)
        })
      );
      await open("/cards/pair");
      await fireEvent.press(await screen.findByTestId("add-card-start", {}, SLOW));
      expect(await screen.findByTestId("legacy-card-amount", {}, SLOW)).toHaveTextContent(
        /^30.000 sats$/
      );
      expect(screen.getByTestId("legacy-card-fiat")).toHaveTextContent(/30[.,]00/);
      // Nothing transferred before the holder confirms.
      expect(server.submitted).toHaveLength(0);
    }
  });

  describe("on a desktop", () => {
    beforeEach(() => {
      mockDesktop.mockReturnValue(true);
      // A large desktop window.
      windowOf(1440, 900);
    });
    afterEach(phoneWindow);

    it("puts the map's icon first of the header's actions, the map beside the side bar", async () => {
      const cardId = await pair();
      const { router } = await open("/cards");
      await screen.findByTestId(`card-slot-${cardId}`, {}, SLOW);
      const icon = screen.getByTestId("cards-merchant-map-header");
      expect(icon).toHaveAccessibleName("Where to pay with your card");
      const header = screen.getAllByRole("button").map((button) => button.props.testID as string);
      expect(header.indexOf("cards-merchant-map-header")).toBeLessThan(
        header.indexOf("cards-add-header")
      );
      // No row of its own in the settings' column.
      const aside = await screen.findByTestId("cards-page-aside", {}, SLOW);
      expect(within(aside).queryByText("Where to pay with your card")).toBeNull();

      await fireEvent.press(icon);
      await waitFor(() => expect(router.getPathname()).toBe("/cards/map"));
      expect(await screen.findByTestId("merchant-map-screen", {}, SLOW)).toBeTruthy();
      expect(screen.getByTestId("sidebar")).toBeTruthy();
      expect(
        screen.getByText("The shops that accept contactless Lightning payment · BTC Map's map")
      ).toBeTruthy();
      await fireEvent.press(screen.getByTestId("merchant-map-back-desktop"));
      await waitFor(() => expect(router.getPathname()).toBe("/cards"));
    });

    it("hides the map's icon while the row of cards is organized", async () => {
      await pair();
      await pair(new FakeNtag424("04a39493cc8680"));
      await open("/cards");
      await fireEvent.press(await screen.findByTestId("cards-organize-header", {}, SLOW));
      expect(screen.queryByTestId("cards-merchant-map-header")).toBeNull();
      await fireEvent.press(screen.getByTestId("cards-order-cancel"));
      expect(screen.getByTestId("cards-merchant-map-header")).toBeTruthy();
    });

    it('runs BTC Map\'s page only while "Where to pay" shows, not behind another destination', async () => {
      const cardId = await pair();
      const { router } = await open("/cards");
      await screen.findByTestId(`card-slot-${cardId}`, {}, SLOW);
      await fireEvent.press(screen.getByTestId("cards-merchant-map-header"));
      await waitFor(() => expect(router.getPathname()).toBe("/cards/map"));
      await waitFor(() => expect(webView.webViewShown()).toBe(true));
      const mounts = webView.webViewMounts();

      // "Settings" from the side bar: the cards' tab stays mounted, hidden, its map dropped.
      await fireEvent.press(screen.getByTestId("sidebar-settings"));
      await waitFor(() => expect(router.getPathname()).toBe("/settings"));
      await waitFor(() => expect(webView.webViewShown()).toBe(false));

      // Back to "Cards": "Where to pay" again, its page loaded anew.
      await fireEvent.press(screen.getByTestId("sidebar-cards"));
      await waitFor(() => expect(router.getPathname()).toBe("/cards/map"));
      await waitFor(() => expect(webView.webViewShown()).toBe(true));
      expect(webView.webViewMounts()).toBe(mounts + 1);
    });

    it("says a v2 card's printed number with its thumbnail, and shows it under its face on the page", async () => {
      const cardId = await pair();
      const image = { key: "11".repeat(32), hash: "22".repeat(32) };
      await withCardAccess(async (access) => {
        const { updatedAt: _updatedAt, ...state } = knownCardState(TEST_WALLET_ID, cardId)!;
        await recordCardState(access, {
          ...state,
          issuer: { image, number: "4821-0937-5530-1186", white: false },
          settingsAt: state.settingsAt + 1
        });
      });
      await open("/cards");
      expect(await screen.findByTestId("card-printed-number", {}, SLOW)).toHaveTextContent(
        "4821-0937-5530-1186"
      );
      // Its thumbnail's face does not write it: the slot says it, as the phone's carousel does.
      const slot = screen.getByTestId(`card-slot-${cardId}`);
      expect(within(slot).queryByText("4821-0937-5530-1186")).toBeNull();
      expect(slot.props.accessibilityLabel).toBe(
        `Card 1 of 1: ${unnamed(cardId)}, 4821-0937-5530-1186`
      );
    });

    it('reads the card\'s history once as it first shows: the list records its movements, not "Cards" again', async () => {
      // The page reads the card's whole history and wallet once, not twice at once.
      const daily = jest.spyOn(historySync, "recordCardMovementsDaily");
      try {
        const cardId = await pair();
        const wallet = sdk.fakeCardWallet(cardId);
        wallet.balanceSats = 12_000n;
        wallet.payments = [
          sdkPayment({ id: "r1", method: "spark", amount: 12_000n, at: Date.now() - 60_000 })
        ];
        await open("/cards");
        expect(await screen.findByTestId("card-balance-sats", {}, SLOW)).toHaveTextContent(
          /^12.000 sats$/
        );
        await historyRead();
        expect(await screen.findByTestId(`card-history-row-m/${cardId}/r1`, {}, SLOW)).toBeTruthy();
        expect(daily).not.toHaveBeenCalled();
      } finally {
        daily.mockRestore();
      }
    });

    it("shows the cards side by side, the one chosen with its balance, its whole history and its settings aside", async () => {
      setMockRate(100_000);
      const first = await pair();
      const second = await pair(new FakeNtag424("04a39493cc8680"));
      const [shown, other] = [first, second].sort();
      const wallet = sdk.fakeCardWallet(shown);
      wallet.balanceSats = 12_000n;
      wallet.payments = [
        sdkPayment({ id: "r1", method: "spark", amount: 12_000n, at: Date.now() - 60_000 })
      ];
      const { router } = await open("/cards");

      // Side by side, the first chosen, no "Add" after them (the header's): no carousel.
      expect(await screen.findByTestId("cards-thumbnails", {}, SLOW)).toBeTruthy();
      expect(screen.queryByTestId("cards-carousel")).toBeNull();
      expect(
        screen.getAllByTestId(/^card-slot-/).map((slot) => slot.props.testID as string)
      ).toEqual([`card-slot-${shown}`, `card-slot-${other}`]);
      const slot = screen.getByTestId(`card-slot-${shown}`);
      expect(slot.props.accessibilityState.selected).toBe(true);
      expect(slot.props.accessibilityLabel).toBe(`Card 1 of 2: ${unnamed(shown)}`);
      // Its label on its face, and under it.
      expect(within(slot).getAllByText(unnamed(shown))).toHaveLength(2);

      // Its balance beside its face, a small "Top up" under it, as on the phone: nothing to open
      // for its history, which is on the page; "Withdraw", a row of "Card".
      expect(await screen.findByTestId("card-balance-sats", {}, SLOW)).toHaveTextContent(
        /^12.000 sats$/
      );
      expect(screen.getByTestId("card-balance-fiat")).toHaveTextContent(/^12.00 CHF$/);
      expect(screen.getByTestId("card-wallet-recharge")).toBeEnabled();
      expect(StyleSheet.flatten(screen.getByTestId("card-wallet-recharge").props.style)).toEqual(
        expect.objectContaining({ height: control.min, alignSelf: "flex-start" })
      );
      expect(
        screen
          .getAllByTestId(/^(card-balance|card-wallet-recharge|card-page-face)$/)
          .map((element) => element.props.testID as string)
      ).toEqual(["card-page-face", "card-balance", "card-wallet-recharge"]);
      expect(screen.getByTestId("card-wallet-return")).toBeEnabled();
      expect(screen.getByTestId("card-wallet-return")).toHaveTextContent(
        /WithdrawTo another wallet or my main balance/
      );
      expect(screen.queryByTestId("card-history")).toBeNull();
      const list = within(await screen.findByTestId("card-history-list", {}, SLOW));
      await historyRead();
      expect(list.getByTestId(`card-history-row-m/${shown}/r1`)).toHaveTextContent(
        /Top-up\d\d:\d\d · From my main balance12.000 sats$/
      );
      // Its settings in the column aside: the history beside them, under the balance.
      const aside = within(screen.getByTestId("cards-page-aside"));
      for (const row of [
        "card-suspend",
        "card-limits",
        "card-customize",
        "card-wallet-return",
        "card-advanced",
        "card-delete"
      ]) {
        expect(aside.getByTestId(row)).toBeTruthy();
      }
      expect(
        screen
          .getAllByTestId(
            /^(card-balance|card-suspend|card-customize|card-wallet-return|card-delete|card-history-list)$/
          )
          .map((element) => element.props.testID as string)
      ).toEqual([
        "card-balance",
        "card-history-list",
        "card-suspend",
        "card-customize",
        "card-wallet-return",
        "card-delete"
      ]);

      // Another card chosen: its own balance and history.
      await choose(other);
      await waitFor(() =>
        expect(screen.getByTestId(`card-slot-${other}`).props.accessibilityState.selected).toBe(
          true
        )
      );
      expect(await screen.findByTestId("card-balance-sats", {}, SLOW)).toHaveTextContent(
        /^0 sats$/
      );
      await historyRead();
      expect(screen.queryByTestId(`card-history-row-m/${shown}/r1`)).toBeNull();

      // "Add a card" in the header: the phone adds the card held to it.
      await fireEvent.press(screen.getByTestId("cards-add-header"));
      await waitFor(() => expect(router.getPathname()).toBe("/cards/pair"));
    });

    it("stripes a paused card in the row of cards and beside its balance, its dot after its name, the others as they are", async () => {
      const first = await pair();
      const second = await pair(new FakeNtag424("04a39493cc8680"));
      const [shown, other] = [first, second].sort();
      await open("/cards");
      expect(await screen.findByTestId("cards-thumbnails", {}, SLOW)).toBeTruthy();
      const hidden = { includeHiddenElements: true };
      expect(screen.queryByTestId("card-face-paused", hidden)).toBeNull();

      expect(screen.queryByTestId("card-status-balance")).toBeNull();
      await fireEvent(await screen.findByTestId("card-suspend", {}, SLOW), "valueChange", true);
      expect(await screen.findByTestId("card-status")).toHaveTextContent(/Paused/);
      // Under the balance, as tall as the pill above it: the balance stays where it was, centred
      // beside the face.
      const pillHeight = StyleSheet.flatten(screen.getByTestId("card-status").props.style).height;
      expect(pillHeight).toBeGreaterThan(0);
      expect(StyleSheet.flatten(screen.getByTestId("card-status-balance").props.style).height).toBe(
        pillHeight
      );
      // Its face in the row and beside its balance: two striped faces, none of the other card.
      expect(
        within(screen.getByTestId(`card-slot-${shown}`)).getByTestId("card-face-paused", hidden)
      ).toBeTruthy();
      expect(
        within(screen.getByTestId("card-page-face")).getByTestId("card-face-paused", hidden)
      ).toBeTruthy();
      expect(screen.getAllByTestId("card-face-paused", hidden)).toHaveLength(2);
      expect(
        within(screen.getByTestId(`card-slot-${other}`)).queryByTestId("card-face-paused", hidden)
      ).toBeNull();
      // No badge over a desktop's faces: a dot after the paused card's name in the row, the pill
      // "Paused" beside its balance.
      expect(screen.queryByTestId("card-face-pause-badge", hidden)).toBeNull();
      expect(
        within(screen.getByTestId(`card-slot-${shown}`)).getByTestId(
          `card-slot-paused-${shown}`,
          hidden
        )
      ).toBeTruthy();
      expect(screen.getAllByTestId(/^card-slot-paused-/, hidden)).toHaveLength(1);
      // Out of screen readers' reach: the slot's name says the pause.
      expect(screen.queryByTestId(`card-slot-paused-${shown}`)).toBeNull();
      expect(screen.getByTestId(`card-slot-${shown}`).props.accessibilityLabel).toMatch(
        /, paused$/
      );

      // The other card chosen: the paused one striped still in the row, not the face shown.
      await choose(other);
      await waitFor(() => expect(screen.queryByTestId("card-status")).toBeNull());
      expect(screen.queryByTestId("card-status-balance")).toBeNull();
      expect(
        within(screen.getByTestId(`card-slot-${shown}`)).getByTestId("card-face-paused", hidden)
      ).toBeTruthy();
      expect(
        within(screen.getByTestId("card-page-face")).queryByTestId("card-face-paused", hidden)
      ).toBeNull();
      expect(screen.getAllByTestId(/^card-slot-paused-/, hidden)).toHaveLength(1);

      // Paying again: neither stripes nor dot.
      await choose(shown);
      await fireEvent(await screen.findByTestId("card-suspend", {}, SLOW), "valueChange", false);
      await waitFor(() => expect(screen.queryByTestId("card-status")).toBeNull());
      expect(screen.queryByTestId("card-face-paused", hidden)).toBeNull();
      expect(screen.queryAllByTestId(/^card-slot-paused-/, hidden)).toHaveLength(0);
    });

    it("puts the settings under the balance, before the history, in a window narrower than a large desktop's", async () => {
      // An iPad's, across.
      windowOf(1180, 820);
      await pair();
      await open("/cards");
      expect(await screen.findByTestId("card-history-list", {}, SLOW)).toBeTruthy();
      expect(screen.queryByTestId("cards-page-aside")).toBeNull();
      expect(
        screen
          .getAllByTestId(/^(card-balance|card-suspend|card-delete|card-history-list)$/)
          .map((element) => element.props.testID as string)
      ).toEqual(["card-balance", "card-suspend", "card-delete", "card-history-list"]);
      // The rest as wide: the cards side by side, the face beside the balance.
      expect(screen.getByTestId("cards-thumbnails")).toBeTruthy();
      expect(screen.queryByTestId("card-history")).toBeNull();
    });

    it("adds a card from the header, no place for it beside the cards", async () => {
      const cardId = await pair();
      const { router } = await open("/cards");
      expect(await screen.findByTestId(`card-slot-${cardId}`, {}, SLOW)).toBeTruthy();
      expect(screen.queryByTestId("card-slot-add")).toBeNull();
      await fireEvent.press(screen.getByTestId("cards-add-header"));
      await waitFor(() => expect(router.getPathname()).toBe("/cards/pair"));
    });

    it("reads the card's history again once its balance moved while the page shows it", async () => {
      // Its clock in the test's hands (each step of real time advances it too).
      jest.useFakeTimers({ advanceTimers: true });
      try {
        const cardId = await pair();
        await open("/cards");
        expect(await screen.findByTestId("card-balance-sats", {}, SLOW)).toHaveTextContent(
          /^0 sats$/
        );
        await historyRead();
        expect(screen.queryByTestId(`card-history-row-m/${cardId}/p1`)).toBeNull();

        // Paid to its Lightning address meanwhile, its SDK says so: its balance follows, its
        // history is read again.
        const wallet = sdk.fakeCardWallet(cardId);
        const paid = sdkPayment({ id: "p1", method: "lightning", amount: 2_100n, at: Date.now() });
        wallet.balanceSats = 2_100n;
        wallet.payments = [paid];
        await sdkSays(cardId, paid);
        await waitFor(
          () => expect(screen.getByTestId("card-balance-sats")).toHaveTextContent(/^2.100 sats$/),
          SLOW
        );
        expect(
          await screen.findByTestId(`card-history-row-m/${cardId}/p1`, {}, SLOW)
        ).toHaveTextContent(/[^−]2.100 sats/);
      } finally {
        jest.useRealTimers();
      }
    });

    it("keeps the history as it shows, a row's detail open, while it reads it again", async () => {
      jest.useFakeTimers({ advanceTimers: true });
      try {
        const cardId = await pair();
        const wallet = sdk.fakeCardWallet(cardId);
        wallet.balanceSats = 12_000n;
        wallet.payments = [
          sdkPayment({ id: "r1", method: "spark", amount: 12_000n, at: Date.now() - 60_000 })
        ];
        await open("/cards");
        expect(await screen.findByTestId("card-balance-sats", {}, SLOW)).toHaveTextContent(
          /^12.000 sats$/
        );
        await historyRead();
        await fireEvent.press(screen.getByTestId(`card-history-row-m/${cardId}/r1`));
        expect(await screen.findByTestId("card-history-movement", {}, SLOW)).toBeTruthy();

        // Paid meanwhile, its SDK says so: its balance follows, its history is read again under
        // the open detail.
        const paid = sdkPayment({ id: "p1", method: "lightning", amount: 2_100n, at: Date.now() });
        wallet.balanceSats = 14_100n;
        wallet.payments = [...wallet.payments, paid];
        await sdkSays(cardId, paid);
        await waitFor(
          () => expect(screen.getByTestId("card-balance-sats")).toHaveTextContent(/^14.100 sats$/),
          SLOW
        );
        expect(await screen.findByTestId(`card-history-row-m/${cardId}/p1`, {}, SLOW)).toBeTruthy();
        // The detail open all along, the rows never gone.
        expect(screen.getByTestId("card-history-movement")).toBeTruthy();
        expect(screen.getByTestId(`card-history-row-m/${cardId}/r1`)).toBeTruthy();
      } finally {
        jest.useRealTimers();
      }
    });

    it("says when the card's wallet could not be read again, the history as it showed kept", async () => {
      jest.useFakeTimers({ advanceTimers: true });
      try {
        const cardId = await pair();
        const wallet = sdk.fakeCardWallet(cardId);
        wallet.balanceSats = 12_000n;
        wallet.payments = [
          sdkPayment({ id: "r1", method: "spark", amount: 12_000n, at: Date.now() - 60_000 })
        ];
        await open("/cards");
        expect(await screen.findByTestId("card-balance-sats", {}, SLOW)).toHaveTextContent(
          /^12.000 sats$/
        );
        await historyRead();
        expect(screen.queryByTestId("card-history-wallet-failed")).toBeNull();

        // Paid meanwhile, its payments then unreadable: the rows stay, said to be maybe not the
        // latest.
        const paid = sdkPayment({ id: "p1", method: "lightning", amount: 2_100n, at: Date.now() });
        wallet.balanceSats = 14_100n;
        wallet.payments = [...wallet.payments, paid];
        wallet.listError = new Error("Storage unreadable");
        await sdkSays(cardId, paid);
        await waitFor(
          () => expect(screen.getByTestId("card-balance-sats")).toHaveTextContent(/^14.100 sats$/),
          SLOW
        );
        expect(await screen.findByTestId("card-history-wallet-failed", {}, SLOW)).toBeTruthy();
        expect(screen.getByTestId(`card-history-row-m/${cardId}/r1`)).toBeTruthy();
        expect(screen.queryByTestId(`card-history-row-m/${cardId}/p1`)).toBeNull();

        // Read again whole: the warning goes, the payment shows.
        wallet.listError = null;
        const second = sdkPayment({ id: "r2", method: "spark", amount: 100n, at: Date.now() });
        wallet.balanceSats = 14_200n;
        wallet.payments = [...wallet.payments, second];
        await sdkSays(cardId, second);
        expect(await screen.findByTestId(`card-history-row-m/${cardId}/p1`, {}, SLOW)).toBeTruthy();
        expect(screen.queryByTestId("card-history-wallet-failed")).toBeNull();
      } finally {
        jest.useRealTimers();
      }
    });

    it("shows a card being migrated without its history nor settings, its way to finish first", async () => {
      const cardId = await migratingCard();
      // Its v2 balance transferred already: something to send back.
      sdk.fakeCardWallet(cardId).balanceSats = 5_000n;
      await open("/cards");
      expect(await screen.findByTestId("card-migrating-note", {}, SLOW)).toBeTruthy();
      expect(screen.getByTestId("card-finish-migration")).toBeTruthy();
      expect(screen.getByTestId("card-status")).toHaveTextContent(/Migration to finish$/);
      expect(await screen.findByTestId("card-balance-sats", {}, SLOW)).toHaveTextContent(
        /^5.000 sats$/
      );
      // Nothing goes on it yet: "Withdraw" alone under its balance, outlined: "Finish the
      // migration" is the block's one filled button.
      expect(screen.queryByTestId("card-wallet-recharge")).toBeNull();
      expect(screen.getByTestId("card-wallet-return")).toBeEnabled();
      expect(
        StyleSheet.flatten(screen.getByTestId("card-wallet-return").props.style).backgroundColor
      ).toBe(colors.button.secondary.bg);
      expect(
        StyleSheet.flatten(screen.getByTestId("card-finish-migration").props.style).backgroundColor
      ).toBe(colors.button.primary.bg);
      expect(screen.queryByTestId("card-history-list")).toBeNull();
      for (const row of ["card-limits", "card-customize", "card-advanced", "card-delete"]) {
        expect(screen.queryByTestId(row)).toBeNull();
      }
      expect(screen.getByTestId(`card-slot-${cardId}`)).toBeTruthy();
    });
  });
});

describe('"Relay and programming": the card\'s state, then "Change relay"', () => {
  /**
   * "Change relay", from the options of the card's panel: open once the card is ready,
   * opened by hand otherwise.
   */
  async function openChange(cardId: string) {
    await openRelay(cardId);
    return toForm();
  }

  /** From the card's state shown, "Change relay". */
  async function toForm() {
    await waitFor(() => expect(screen.queryByTestId("card-relay-checking")).toBeNull(), SLOW);
    await fireEvent.press(screen.getByTestId("card-relay-change"));
    return screen.findByTestId("card-relay-form");
  }

  /** The drawing of the card held to the phone, hidden from screen readers. */
  function stage(testID: string) {
    return screen.queryByTestId(testID, { includeHiddenElements: true });
  }

  /** "Program the card" for the address `typed`. */
  async function program(typed: string) {
    await fireEvent.changeText(screen.getByTestId("card-relay-field"), typed);
    await fireEvent.press(screen.getByTestId("card-relay-program"));
  }

  /** The steps screen's title, once it says `text`. */
  async function stepsSay(text: string) {
    await waitFor(
      () => expect(screen.getByTestId("card-steps-title")).toHaveTextContent(text),
      SLOW
    );
  }

  /** The steps' end for `host`, then "Done": back on "Cards", which says it. */
  async function finish(host: string) {
    await stepsSay(`The card goes through ${host}`);
    await fireEvent.press(screen.getByTestId("card-steps-primary"));
    expect(await screen.findByText(`The card now goes through ${host}`)).toBeTruthy();
    expect(screen.queryByTestId("card-steps")).toBeNull();
  }

  /**
   * "Relay and programming"'s row, in the card's panel "Advanced settings", says `text`: the
   * panel closed after.
   */
  async function relayRowSays(cardId: string, text: string) {
    const panel = await openTask(cardId, "card-advanced");
    await waitFor(() =>
      expect(panel.getByTestId("card-relay")).toHaveTextContent(text, { exact: false })
    );
    await fireEvent.press(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByTestId("card-relay")).toBeNull());
  }

  it('says a card ready as it checks it, its options open on "Change relay"', async () => {
    const cardId = await pair();
    // The relay answers once the test has seen the check under way.
    let release!: () => void;
    const answer = new Promise<void>((resolve) => {
      release = resolve;
    });
    const handle = relay.handle.bind(relay);
    relay.handle = async (url, init) => {
      await answer;
      return handle(url, init);
    };
    await open("/cards");
    await openRelay(cardId);
    // Checked as the panel opens: never told from an older sync alone.
    expect(screen.getByTestId("card-relay-checking")).toHaveTextContent("Checking the card…");
    release();

    const ready = await screen.findByTestId("card-relay-ready", {}, SLOW);
    expect(ready).toHaveTextContent("The card is ready", { exact: false });
    expect(ready).toHaveTextContent(
      `Its relay, ${HOST}, wakes this phone at each payment. It holds no key and no funds.`,
      { exact: false }
    );
    expect(screen.queryByTestId("card-relay-checks")).toBeNull();
    // "Change relay" as it is: no "Advanced options" fold, the panel reached from "Advanced
    // settings" already.
    expect(screen.queryByText("Advanced options")).toBeNull();
    expect(screen.getByTestId("card-relay-change")).toHaveTextContent(
      "For a relay you host yourself",
      { exact: false }
    );

    // "Cards" says what the check found.
    await fireEvent.press(screen.getByRole("button", { name: "Close" }));
    await waitFor(() =>
      expect(rowOf("card-advanced")).toHaveTextContent("Relay ready", { exact: false })
    );
    expect(screen.queryByTestId("card-advanced-warning")).toBeNull();
  });

  it("says what keeps this phone from being woken, then has the notifications allowed", async () => {
    const cardId = await pair();
    // Turned off in the phone's settings since the pairing: the app can no longer ask.
    notifications.notifications.permission = "denied";
    // React Native's own mock: its calls of earlier tests cleared.
    const settings = jest.spyOn(Linking, "openSettings").mockResolvedValue(undefined);
    settings.mockClear();
    const foreground = new Set<(state: AppStateStatus) => void>();
    jest.spyOn(AppState, "addEventListener").mockImplementation((type, listener) => {
      if (type !== "change") return { remove: () => undefined };
      const changed = listener as (state: AppStateStatus) => void;
      foreground.add(changed);
      return { remove: () => foreground.delete(changed) };
    });
    await open("/cards");
    await openRelay(cardId);

    const checks = await screen.findByTestId("card-relay-checks", {}, SLOW);
    expect(within(checks).getByTestId("card-relay-check-relay")).toHaveTextContent(
      `Relay reachable${HOST}, default relay`,
      { exact: false }
    );
    expect(within(checks).getByTestId("card-relay-check-card")).toHaveTextContent(
      "Card programmed for this relayIts next taps are expected there",
      { exact: false }
    );
    expect(within(checks).getByTestId("card-relay-check-phone")).toHaveTextContent(
      "This phone is not wokenNotifications off: the card pays only while the app is open on this phone.",
      { exact: false }
    );
    // The fix first, "Change relay" after it (no fold).
    expect(screen.queryByText("Advanced options")).toBeNull();
    expect(screen.getByTestId("card-relay-change")).toBeTruthy();
    const order = screen
      .getAllByTestId(/^card-relay-(fix|change)$/)
      .map((element) => element.props.testID as string);
    expect(order).toEqual(["card-relay-fix", "card-relay-change"]);

    // Refused for good: the phone's settings.
    await fireEvent.press(screen.getByTestId("card-relay-fix"));
    await waitFor(() => expect(settings).toHaveBeenCalledTimes(1));
    expect(notifications.notifications.requests).toBe(1);
    // Allowed there, back in the app: checked again.
    notifications.notifications.permission = "granted";
    await act(async () => {
      for (const listener of [...foreground]) listener("active");
    });
    expect(await screen.findByTestId("card-relay-ready", {}, SLOW)).toBeTruthy();
  });

  it("asks for the notifications when the phone still may, and says a phone without a token", async () => {
    const cardId = await pair();
    // Never answered on this phone (its card paired elsewhere): the system asks.
    notifications.notifications.permission = "undetermined";
    notifications.notifications.canAskAgain = true;
    // React Native's own mock: its calls of earlier tests cleared.
    const settings = jest.spyOn(Linking, "openSettings").mockResolvedValue(undefined);
    settings.mockClear();
    await open("/cards");
    await openRelay(cardId);
    await fireEvent.press(await screen.findByTestId("card-relay-fix", {}, SLOW));
    expect(await screen.findByTestId("card-relay-ready", {}, SLOW)).toBeTruthy();
    expect(settings).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole("button", { name: "Close" }));

    // Allowed, yet no token (an iPhone whose token did not come): nothing to allow.
    notifications.notifications.token = null;
    await openRelay(cardId);
    expect(await screen.findByTestId("card-relay-check-phone", {}, SLOW)).toHaveTextContent(
      "This phone does not receive payment notifications",
      { exact: false }
    );
    expect(screen.queryByTestId("card-relay-fix")).toBeNull();
  });

  it("says a relay that does not answer, then checks again", async () => {
    const cardId = await pair();
    relay.unreachable = true;
    await open("/cards");
    await openRelay(cardId);
    const check = await screen.findByTestId("card-relay-check-relay", {}, SLOW);
    expect(check).toHaveTextContent(
      `Relay unreachable${HOST} did not answer this phone: the card cannot pay until it answers.`,
      { exact: false }
    );
    expect(screen.getByTestId("card-relay-fix")).toHaveTextContent("Try again", { exact: false });

    // "Cards" warns of it on the card's row, in place of the ready relay's dot.
    await fireEvent.press(screen.getByRole("button", { name: "Close" }));
    await waitFor(() =>
      expect(rowOf("card-advanced")).toHaveTextContent("Relay unreachable · ", { exact: false })
    );
    expect(screen.getByTestId("card-advanced-warning")).toBeTruthy();

    // Answering again, checked as the panel opens: the dot back in place of the warning.
    relay.unreachable = false;
    await openRelay(cardId);
    expect(await screen.findByTestId("card-relay-ready", {}, SLOW)).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Close" }));
    await waitFor(() =>
      expect(rowOf("card-advanced")).toHaveTextContent("Relay ready", { exact: false })
    );
    expect(screen.queryByTestId("card-advanced-warning")).toBeNull();
  });

  it("moves a card to another relay, then back to the default one", async () => {
    const cardId = await pair();
    await open("/cards");
    await openChange(cardId);

    // Opened on the card's relay: "Default relay" only for another address.
    const field = screen.getByTestId("card-relay-field");
    expect(field.props.value).toBe(HOST);
    expect(field.props.placeholder).toBe("relay.example.com");
    expect(screen.queryByTestId("card-relay-default")).toBeNull();
    expect(screen.getByTestId("card-relay-program")).toBeDisabled();
    // The relay's source, to host one's own, in the browser.
    const opened = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
    await fireEvent.press(screen.getByRole("link", { name: "sattleme/relay on github.com" }));
    expect(opened).toHaveBeenCalledWith("https://github.com/sattleme/relay");
    // An address's error in its field, once "Program the card" is pressed; an edit clears it.
    for (const [typed, message] of [
      ["ftp://relay.example.org", "Enter a complete address"],
      ["relay.example.org/v1", "Enter a complete address"],
      [`${"a".repeat(60)}.example.org`, "Enter an address of 56 characters at most"]
    ]) {
      await fireEvent.changeText(field, typed);
      expect(screen.queryByText(message)).toBeNull();
      await fireEvent.press(screen.getByTestId("card-relay-program"));
      expect(screen.getByText(message)).toBeTruthy();
    }
    await fireEvent.changeText(field, `https://${HOST}/`);
    expect(screen.getByTestId("card-relay-program")).toBeDisabled();

    await program("https://Relay.Example.org:443/");
    await stepsSay(`The card goes through ${OTHER}`);
    expect(screen.getByTestId("card-steps-subtitle")).toHaveTextContent(
      "It keeps its name, its balance and its settings"
    );
    expect(screen.getByTestId("card-step-former")).toHaveTextContent(
      `Former relay forgotten${HOST} no longer receives its taps`,
      { exact: false }
    );
    expect(stage("hold-stage-ok")).toBeTruthy();
    await finish(OTHER);
    expect(new URL(card.tap().replace(/^lnurlw:/, "https:")).host).toBe(OTHER);
    expect(await channelOn(relay, cardId)).toBeUndefined();
    expect(await channelOn(other, cardId)).toBeDefined();
    // "Cards" says the new relay as the move's own sync of its channel found it.
    await relayRowSays(cardId, `${OTHER} · Ready`);

    // Back to the default relay: its link on the field's label row.
    await openChange(cardId);
    expect(screen.getByTestId("card-relay-field").props.value).toBe(OTHER);
    await fireEvent.press(screen.getByTestId("card-relay-default"));
    expect(screen.getByTestId("card-relay-field").props.value).toBe(HOST);
    expect(screen.queryByTestId("card-relay-default")).toBeNull();
    await fireEvent.press(screen.getByTestId("card-relay-program"));
    await finish(HOST);
    expect(knownCardState(TEST_WALLET_ID, cardId)).toMatchObject({
      relayHost: HOST,
      status: "active"
    });
  });

  it("says what the new relay or the phone refused, nothing asked of the card", async () => {
    const cardId = await pair();
    await open("/cards");
    await openChange(cardId);

    other.unreachable = true;
    await program(OTHER);
    expect(await screen.findByText("Relay unreachable: check the address", {}, SLOW)).toBeTruthy();
    // An edit clears it.
    await fireEvent.changeText(screen.getByTestId("card-relay-field"), `${OTHER} `);
    expect(screen.queryByText("Relay unreachable: check the address")).toBeNull();

    other.unreachable = false;
    other.protocol = 1;
    await fireEvent.press(screen.getByTestId("card-relay-program"));
    expect(await screen.findByText("Relay not compatible with this card", {}, SLOW)).toBeTruthy();

    // Not the address's: above the button.
    other.protocol = 2;
    notifications.notifications.permission = "denied";
    await fireEvent.press(screen.getByTestId("card-relay-program"));
    expect(await screen.findByTestId("card-relay-failure", {}, SLOW)).toHaveTextContent(
      /Allow sattle.me's notifications in the phone's settings/
    );
    expect(screen.queryByTestId("card-steps")).toBeNull();
    expect(card.keyVersions).toEqual([1, 1, 1, 1, 1]);
    // The pairing's session only.
    expect(nfc.calls.filter((call) => call.startsWith("requestTechnology"))).toHaveLength(1);
  });

  it("moves a card from a phone without a push token, saying it pays with the app shown", async () => {
    const cardId = await pair();
    notifications.notifications.token = null;
    await open("/cards");
    await openRelay(cardId);
    // Not woken: what is wrong said, "Change relay" after it.
    await screen.findByTestId("card-relay-checks", {}, SLOW);
    await fireEvent.press(screen.getByTestId("card-relay-change"));

    await program(OTHER);
    await stepsSay(`The card goes through ${OTHER}`);
    expect(screen.getByTestId("card-activation-no-push")).toHaveTextContent(
      /it pays only while the app is on screen/
    );
    await finish(OTHER);
  });

  it("refuses another card in place of the chosen one, then goes on from the steps", async () => {
    const cardId = await pair();
    await open("/cards");
    await openChange(cardId);

    const stranger = new FakeNtag424("04112233445566");
    nfc.holdCard(stranger);
    await program(OTHER);
    await stepsSay("The change did not go through");
    expect(screen.getByTestId("card-step-card")).toHaveTextContent(/This is not the chosen card/);
    // Each step says what it reached only: the card held was not recognized, nothing after done.
    const said = (key: string, label: RegExp) =>
      expect(within(screen.getByTestId(`card-step-${key}`)).getByLabelText(label)).toBeTruthy();
    said("relay", /^New relay reachable: done/);
    said("card", /^Card not recognized: failed, /);
    said("programming", /^Programming for this relay: to come$/);
    said("former", /^Former relay to forget: to come$/);
    expect(stage("hold-stage-fail")).toBeTruthy();
    expect(stranger.keyVersions).toEqual([0, 0, 0, 0, 0]);

    // "Try again" stays on the steps: its checks first, the relay asked again.
    let release!: () => void;
    const answer = new Promise<void>((resolve) => {
      release = resolve;
    });
    const handle = other.handle.bind(other);
    other.handle = async (url, init) => {
      await answer;
      return handle(url, init);
    };
    nfc.holdCard(card);
    await fireEvent.press(screen.getByTestId("card-steps-primary"));
    await stepsSay("Checking the new relay");
    expect(
      within(screen.getByTestId("card-step-relay")).getByLabelText(
        /^Checking the new relay: in progress/
      )
    ).toBeTruthy();
    // Nothing said yet of the former relay: "no longer receives its taps" only once it is so.
    said("former", /^Former relay to forget: to come$/);
    expect(screen.queryByText(/no longer receives its taps/)).toBeNull();
    expect(screen.getByTestId("card-steps-cancel")).toBeTruthy();
    release();

    await finish(OTHER);
    expect(knownCardState(TEST_WALLET_ID, cardId)).toMatchObject({
      keyVersion: 2,
      relayHost: OTHER
    });
    expect((await posTap(card.tap())).status).toBe(200);
  });

  it("runs a move asked while the one left is stopping after it, never beside it", async () => {
    const cardId = await pair();
    await open("/cards");
    await openChange(cardId);
    // Failed at the card (another one held), tried again, then left while its checks wait.
    nfc.holdCard(new FakeNtag424("04112233445566"));
    await program(OTHER);
    await stepsSay("The change did not go through");
    let release!: () => void;
    const answer = new Promise<void>((resolve) => {
      release = resolve;
    });
    const handle = other.handle.bind(other);
    other.handle = async (url, init) => {
      await answer;
      return handle(url, init);
    };
    nfc.holdCard(card);
    await fireEvent.press(screen.getByTestId("card-steps-primary"));
    await stepsSay("Checking the new relay");
    await fireEvent.press(screen.getByTestId("card-steps-cancel"));
    await waitFor(() => expect(screen.queryByTestId("card-steps")).toBeNull());

    // Asked again at once: it waits for the one left, which stops before the card.
    await openChange(cardId);
    const before = other.requests.length;
    await program(OTHER);
    release();
    await finish(OTHER);
    // The one left asked the new relay its info only (no channel for a move left), then this one
    // began: never beside it.
    expect(other.requests.slice(before, before + 3)).toEqual([
      "GET /v1/info",
      "GET /v1/info",
      "DELETE /v1/channel"
    ]);
    // Sessions: the pairing's, the other card's, this move's; none for the one left.
    expect(nfc.calls.filter((call) => call.startsWith("requestTechnology"))).toHaveLength(3);
    expect((await posTap(card.tap())).status).toBe(200);
  });

  it.each([
    { shown: true, waves: "none" },
    { shown: false, waves: "its waves" }
  ])(
    "draws over a migrated card's issuer visual while the phone waits for it (visual read: $shown): $waves",
    async ({ shown }) => {
      const cardId = await pair();
      const image = { key: "11".repeat(32), hash: "22".repeat(32) };
      // Read, or not on any relay (offline, a relay down): its face then shows the sand, its name.
      if (shown) rememberImage(image, Uint8Array.of(0xff, 0xd8, 0xff));
      await withCardAccess(async (access) => {
        const { updatedAt: _updatedAt, ...state } = knownCardState(TEST_WALLET_ID, cardId)!;
        await recordCardState(access, {
          ...state,
          issuer: { image, number: "4821-0937-5530-1186", white: false },
          settingsAt: state.settingsAt + 1
        });
      });
      await open("/cards");
      await openChange(cardId);
      nfc.holdCard(null);
      nfc.waitForCard();
      await program(OTHER);
      await waitFor(() => expect(nfc.awaitingCard()).toBe(true), SLOW);
      expect(stage("hold-stage-face")).toBeTruthy();
      if (shown) {
        expect(stage("hold-stage-face-image")).toBeTruthy();
        expect(stage("hold-stage-face-label")).toBeNull();
        expect(stage("hold-stage-waves")).toBeNull();
      } else {
        expect(stage("hold-stage-face-image")).toBeNull();
        expect(stage("hold-stage-face-label")).toBeTruthy();
        expect(stage("hold-stage-waves")).toBeTruthy();
      }
      await fireEvent.press(screen.getByTestId("card-steps-cancel"));
      await waitFor(() => expect(nfc.awaitingCard()).toBe(false));
    }
  );

  it('cancels the wait for the card: nothing written, back on "Cards"', async () => {
    const cardId = await pair();
    await open("/cards");
    await openChange(cardId);
    // No card in the field: the phone waits for one.
    nfc.holdCard(null);
    nfc.waitForCard();
    await program(OTHER);
    await waitFor(() => expect(nfc.awaitingCard()).toBe(true), SLOW);
    await stepsSay(`Hold ${unnamed(cardId)} above the phone`);
    expect(screen.getByTestId("card-steps-subtitle")).toHaveTextContent(
      `It will go through ${OTHER}`
    );
    expect(screen.getByTestId("card-step-relay")).toHaveTextContent(`${OTHER}, expected version`, {
      exact: false
    });
    expect(stage("hold-stage-waves")).toBeTruthy();

    await fireEvent.press(screen.getByTestId("card-steps-cancel"));
    await waitFor(() => expect(nfc.awaitingCard()).toBe(false));
    await waitFor(() => expect(screen.queryByTestId("card-steps")).toBeNull());
    expect(screen.queryByTestId("card-relay-form")).toBeNull();
    expect(knownCardState(TEST_WALLET_ID, cardId)).toMatchObject({
      status: "active",
      relayHost: HOST,
      keyVersion: 1
    });
    // No session waits any more, none opens: a card held now is sent nothing. (The pairing's
    // session, then the one cancelled.)
    expect(nfc.calls.filter((call) => call.startsWith("requestTechnology"))).toHaveLength(2);
    expect(nfc.requestActive()).toBe(false);
    await relayRowSays(cardId, HOST);
  });

  it("never lets the steps go while the card is written to", async () => {
    const cardId = await pair();
    await open("/cards");
    await openChange(cardId);
    const resume = card.pauseAt(2);
    await program(OTHER);
    await stepsSay("Keep the card in place");
    expect(screen.getByTestId("card-steps-subtitle")).toHaveTextContent(
      "Programming for the new relay"
    );
    expect(screen.queryByTestId("card-steps-cancel")).toBeNull();
    expect(screen.queryByTestId("relay-move-back")).toBeNull();
    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
    // The system's back leaves nothing either: the steps' modal, the last one shown.
    const modals = screen.container.queryAll(
      (node) => typeof node.props.onRequestClose === "function"
    );
    await act(async () => {
      modals[modals.length - 1].props.onRequestClose();
    });
    expect(screen.getByTestId("card-steps-title")).toHaveTextContent("Keep the card in place");
    resume();
    await finish(OTHER);
  });

  it("keeps the steps of a card that left the field once reset, then adds it again", async () => {
    const cardId = await pair();
    // How many commands a move takes on this card.
    const start = card.received.length;
    await open("/cards");
    await openChange(cardId);
    await program(OTHER);
    await finish(OTHER);
    const count = card.received.length - start;

    // Left the field while being programmed, after its reset.
    card.interruptAt(count - 3);
    await openChange(cardId);
    await fireEvent.press(screen.getByTestId("card-relay-default"));
    await fireEvent.press(screen.getByTestId("card-relay-program"));
    await stepsSay("The change did not go through");
    expect(screen.getByTestId("card-step-programming")).toHaveTextContent(
      "Card moved away too earlyHold it again and keep it in place until the confirmation: the change will resume where it stopped.",
      { exact: false }
    );
    expect(screen.getByTestId("card-steps-subtitle")).toHaveTextContent(
      "It will resume where it stopped"
    );
    expect(knownCardState(TEST_WALLET_ID, cardId)?.status).toBe("reset");
    expect(screen.getByTestId("relay-move-reset")).toHaveTextContent(
      "Until the change succeeds, the card no longer pays and no longer shows in “Cards”. With “Add a card”, it comes back on the default relay, with its balance, its name and its limits.",
      { exact: false }
    );

    // Left: "Cards" no longer shows it; added again, it comes back.
    await fireEvent.press(screen.getByTestId("card-steps-cancel"));
    expect(await screen.findByText("Add your first card")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("cards-pair"));
    await fireEvent.press(await screen.findByTestId("add-card-start", {}, SLOW));
    await stepsSay("Card added");
    expect(card.failedAuthentications).toBe(0);
    expect((await posTap(card.tap())).status).toBe(200);
    await fireEvent.press(screen.getByText("Later"));
    expect(await screen.findByTestId(`card-slot-${cardId}`, {}, SLOW)).toBeTruthy();
  });

  it("reads no wallet while the card is written to, then says a stopped card's balance", async () => {
    const cardId = await pair();
    sdk.fakeCardWallet(cardId).balanceSats = 2_500n;
    // How many commands a move takes on this card, and where its reset's first write is.
    const start = card.received.length;
    await open("/cards");
    await openChange(cardId);
    await program(OTHER);
    await finish(OTHER);
    const sent = card.received.slice(start);
    // ChangeKey: the reset changes its keys first.
    const firstWrite = sent.findIndex((apdu) => apdu[1] === 0xc4);
    expect(firstWrite).toBeGreaterThan(0);

    // The next move held at its reset's first write (the card recorded reset from then on), then
    // the card out of the field while being programmed.
    const resume = card.pauseAt(firstWrite);
    card.interruptAt(sent.length - 3);
    const reads = jest.spyOn(erasedFundsModule, "readErasedFunds");
    await openChange(cardId);
    await fireEvent.press(screen.getByTestId("card-relay-default"));
    await fireEvent.press(screen.getByTestId("card-relay-program"));
    await waitFor(() => expect(knownCardState(TEST_WALLET_ID, cardId)?.status).toBe("reset"), SLOW);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(2_000);
    });
    // Its wallet is neither connected nor synced while the card is written to.
    expect(reads).not.toHaveBeenCalled();
    resume();
    await stepsSay("The change did not go through");

    // Left: "Cards" says its balance, the card out of the list until added again.
    await fireEvent.press(screen.getByTestId("card-steps-cancel"));
    expect(await screen.findByTestId("cards-erased-funds-note", {}, SLOW)).toHaveTextContent(
      new RegExp(
        `${unnamed(cardId)}: reprogramming stoppedIt comes back to “Cards”, with its balance, when you add it again\\. 2.500 sats remain in its wallet: without the card, withdraw them to your main balance\\.$`
      )
    );
    expect(screen.getByTestId("cards-erased-funds-return")).toBeEnabled();
    expect(screen.queryByTestId(`card-slot-${cardId}`)).toBeNull();
  });

  it("says a relay that refuses the card's channel, and a state that could not be read", async () => {
    const cardId = await pair();
    const handle = relay.handle.bind(relay);
    relay.handle = async (url, init) =>
      (init.method ?? "GET") === "PUT"
        ? new Response(JSON.stringify({ error: "forbidden" }), { status: 403 })
        : handle(url, init);
    await open("/cards");
    await openRelay(cardId);
    expect(await screen.findByTestId("card-relay-check-relay", {}, SLOW)).toHaveTextContent(
      `Relay error${HOST} refused the card's channel: it cannot pay while the relay refuses it.`,
      { exact: false }
    );
    relay.handle = handle;

    // Deleted from another device meanwhile: this phone no longer knows it active.
    await act(async () => {
      await withCardAccess(async (access) => {
        const { updatedAt: _updatedAt, ...state } = knownCardState(TEST_WALLET_ID, cardId)!;
        await recordCardState(access, { ...state, status: "deleted" });
      });
    });
    await fireEvent.press(screen.getByTestId("card-relay-fix"));
    expect(await screen.findByTestId("card-relay-check-unknown", {}, SLOW)).toHaveTextContent(
      "Status not checkedThe card's state could not be read on this phone. Try again in a moment.",
      { exact: false }
    );
    expect(screen.getByTestId("card-relay-fix")).toHaveTextContent("Try again", { exact: false });
  });

  it("can be left while the new relay is checked: nothing then asked of the card", async () => {
    const cardId = await pair();
    await open("/cards");
    await openChange(cardId);
    let release!: () => void;
    const answer = new Promise<void>((resolve) => {
      release = resolve;
    });
    const handle = other.handle.bind(other);
    other.handle = async (url, init) => {
      await answer;
      return handle(url, init);
    };
    await program(OTHER);
    // Checked: the field and its button wait, the default relay's link is gone.
    expect(screen.getByTestId("card-relay-field").props.editable).toBe(false);
    expect(screen.getByTestId("card-relay-program").props.accessibilityState).toMatchObject({
      busy: true
    });
    expect(screen.queryByTestId("card-relay-default")).toBeNull();

    // Left: back on the card's state, no steps.
    await fireEvent.press(screen.getByTestId("sheet-back"));
    expect(await screen.findByTestId("card-relay-status")).toBeTruthy();
    expect(screen.queryByTestId("card-steps")).toBeNull();

    // Asked again: it runs once the one left stopped, before the card and before the new relay's
    // channel: the one left asked that relay its info only.
    await toForm();
    await program(OTHER);
    release();
    await finish(OTHER);
    expect(other.requests.slice(0, 3)).toEqual([
      "GET /v1/info",
      "GET /v1/info",
      "DELETE /v1/channel"
    ]);
    // Sessions: the pairing's, this move's; none for the one left.
    expect(nfc.calls.filter((call) => call.startsWith("requestTechnology"))).toHaveLength(2);
    expect(knownCardState(TEST_WALLET_ID, cardId)).toMatchObject({
      status: "active",
      relayHost: OTHER,
      keyVersion: 2
    });
  });

  it("says a phone without NFC above the button, nothing asked of the card", async () => {
    jest.replaceProperty(Platform, "OS", "android");
    const cardId = await pair();
    await open("/cards");
    await openChange(cardId);
    jest.spyOn(nfc.default, "isEnabled").mockResolvedValue(false);
    await program(OTHER);
    expect(await screen.findByTestId("card-relay-failure", {}, SLOW)).toHaveTextContent(
      "NFC is unavailable or turned off on this device. Turn it on in the settings, then try again.",
      { exact: false }
    );
    expect(screen.queryByTestId("card-steps")).toBeNull();
    expect(card.keyVersions).toEqual([1, 1, 1, 1, 1]);
  });

  it("says when the card may leave, then a former relay that kept its channel", async () => {
    const cardId = await pair();
    await open("/cards");
    await openChange(cardId);
    // The former relay holds its answer to the deletion, then refuses it.
    let release!: () => void;
    const answer = new Promise<void>((resolve) => {
      release = resolve;
    });
    const handle = relay.handle.bind(relay);
    relay.handle = async (url, init) => {
      if ((init.method ?? "GET") !== "DELETE") return handle(url, init);
      await answer;
      return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
    };
    await program(OTHER);
    await stepsSay("Almost done");
    expect(screen.getByTestId("card-steps-subtitle")).toHaveTextContent(
      "You can move the card away"
    );
    expect(
      within(screen.getByTestId("card-step-programming")).getByLabelText(
        /^Programmed for this relay: done/
      )
    ).toBeTruthy();
    expect(stage("hold-stage-waves")).toBeNull();
    // Programmed already: it cannot be left, only finished.
    expect(screen.queryByTestId("card-steps-cancel")).toBeNull();

    release();
    await stepsSay(`The card goes through ${OTHER}`);
    expect(screen.getByTestId("card-step-former")).toHaveTextContent(
      `Former relay in error${HOST} refused to forget its channel: it stays there, without effect`,
      { exact: false }
    );
    await finish(OTHER);
    expect((await posTap(card.tap())).status).toBe(200);
  });

  it("says a former relay that did not answer", async () => {
    const cardId = await pair();
    await open("/cards");
    await openChange(cardId);
    const handle = relay.handle.bind(relay);
    relay.handle = async (url, init) => {
      if ((init.method ?? "GET") === "DELETE") throw new TypeError("Network request failed");
      return handle(url, init);
    };
    await program(OTHER);
    await stepsSay(`The card goes through ${OTHER}`);
    expect(screen.getByTestId("card-step-former")).toHaveTextContent(
      `Former relay unreachable${HOST} did not answer: its channel stays there, without effect`,
      { exact: false }
    );
    expect(
      within(screen.getByTestId("card-step-former")).getByLabelText(
        /^Former relay unreachable: to check/
      )
    ).toBeTruthy();
    // Done, the way back finishes as "Done" does.
    await fireEvent.press(screen.getByTestId("relay-move-back"));
    expect(await screen.findByText(`The card now goes through ${OTHER}`)).toBeTruthy();
    expect(screen.queryByTestId("card-steps")).toBeNull();
  });

  it("says a former relay whose answer proves nothing of its channel", async () => {
    const cardId = await pair();
    await open("/cards");
    await openChange(cardId);
    const handle = relay.handle.bind(relay);
    relay.handle = async (url, init) =>
      (init.method ?? "GET") === "DELETE"
        ? new Response("<html>OK</html>", { status: 200 })
        : handle(url, init);
    await program(OTHER);
    await stepsSay(`The card goes through ${OTHER}`);
    expect(screen.getByTestId("card-step-former")).toHaveTextContent(
      `Former relay to check${HOST} answered without confirming it: its channel may still be there, without effect`,
      { exact: false }
    );
    await finish(OTHER);
  });

  it("says a read cancelled at the card, then a new relay gone quiet, nothing written", async () => {
    const cardId = await pair();
    await open("/cards");
    await openChange(cardId);
    // The holder closes the system's sheet (iOS) as the phone waits for the card.
    nfc.cancelNextRequest();
    await program(OTHER);
    await stepsSay("The change did not go through");
    expect(screen.getByTestId("card-step-card")).toHaveTextContent("Card reading cancelled", {
      exact: false
    });
    expect(screen.getByTestId("card-steps-subtitle")).toHaveTextContent(
      "Nothing was written to this card"
    );

    // Tried again, the new relay no longer answers: said at its step, in the move's own words.
    other.unreachable = true;
    await fireEvent.press(screen.getByTestId("card-steps-primary"));
    await waitFor(
      () =>
        expect(screen.getByTestId("card-step-relay")).toHaveTextContent(
          `${OTHER} does not answer: check this phone's connection, then try again`,
          { exact: false }
        ),
      SLOW
    );
    // Its own title, as "Add a card" says it: never "not checked" for a relay asked.
    expect(
      within(screen.getByTestId("card-step-relay")).getByLabelText(/^Relay unreachable: failed/)
    ).toBeTruthy();
    expect(screen.getByTestId("card-steps-subtitle")).toHaveTextContent(
      "Nothing was written to this card"
    );
    expect(card.keyVersions).toEqual([1, 1, 1, 1, 1]);

    other.unreachable = false;
    await fireEvent.press(screen.getByTestId("card-steps-primary"));
    await finish(OTHER);
  });

  it("shows its steps over the whole window on a tablet, with its own way back", async () => {
    mockDesktop.mockReturnValue(true);
    const cardId = await pair();
    await open("/cards");
    await openChange(cardId);
    nfc.holdCard(null);
    nfc.waitForCard();
    await program(OTHER);
    await waitFor(() => expect(nfc.awaitingCard()).toBe(true), SLOW);
    expect(screen.getByRole("header", { name: "Change relay" })).toBeTruthy();
    await fireEvent.press(screen.getByTestId("relay-move-back-desktop"));
    await waitFor(() => expect(nfc.awaitingCard()).toBe(false));
    await waitFor(() => expect(screen.queryByTestId("card-steps")).toBeNull());
  });

  it("holds the card against an Android phone's back, which vibrates once it may leave", async () => {
    jest.replaceProperty(Platform, "OS", "android");
    const vibrate = jest.spyOn(Vibration, "vibrate");
    const cardId = await pair();
    await open("/cards");
    await openChange(cardId);
    await program(OTHER);
    await stepsSay(`The card goes through ${OTHER}`);
    expect(screen.getByTestId("card-step-card")).toHaveTextContent(
      "Card held to the phoneAgainst the back of the phone, until it vibrates",
      { exact: false }
    );
    expect(vibrate).toHaveBeenCalledTimes(1);
    expect(vibrate).toHaveBeenCalledWith(200);
  });
});

describe('"Delete the card"', () => {
  /** The drawing of the card held to the phone, hidden from screen readers. */
  function stage(testID: string) {
    return screen.queryByTestId(testID, { includeHiddenElements: true });
  }

  /**
   * The SDK of the card `cardId`'s wallet syncs again, the Spark operators reachable: that sync
   * reaches the network (Wallet.waitNetworkSync).
   */
  async function syncReachesNetwork(cardId: string) {
    sdk.setSparkReachable(true);
    await act(async () => {
      await sdk.emitSdkEvent(sdk.fakeCardWallet(cardId), sdk.SdkEvent_Tags.Synced);
    });
  }

  /** The steps screen's title, once it says `text`. */
  async function stepsSay(text: string) {
    await waitFor(
      () => expect(screen.getByTestId("card-steps-title")).toHaveTextContent(text),
      SLOW
    );
  }

  /** The step `key` says `label` to screen readers: its title, its state, what it says. */
  function stepSays(key: string, label: string) {
    expect(within(screen.getByTestId(`card-step-${key}`)).getByLabelText(label)).toBeTruthy();
  }

  /** Back on "Cards", the panel closed: its notification says the card `name` deleted. */
  async function saysDeleted(name: string) {
    await waitFor(() => expect(screen.queryByTestId("card-sheet")).toBeNull(), SLOW);
    expect(await screen.findByText(`${name} is deleted`)).toBeTruthy();
  }

  /** "I don't have the card": the phone waits for a card none holds to it. */
  function noCardHeld() {
    nfc.holdCard(null);
    nfc.waitForCard();
  }

  it("deletes the card held to the phone: its steps over the panel, then the card in its place", async () => {
    const first = await pair();
    await customizeCard(first, { name: "Everyday" });
    const next = await pair(new FakeNtag424("04a39493cc8680"));
    await open("/cards");
    const panel = await openTask(first, "card-delete");

    // What goes for good; the card in hand, where the phone reads cards.
    expect(screen.getByRole("header", { name: "Delete Everyday" })).toBeTruthy();
    expect(panel.getByText("Erased for good")).toBeTruthy();
    for (const gone of [
      "Its name and settings, approved merchants included",
      "Its history",
      "Its Lightning address"
    ]) {
      expect(panel.getByText(gone)).toBeTruthy();
    }
    const inHand = panel.getByTestId("card-delete-in-hand");
    expect(inHand.props.accessibilityState).toMatchObject({ checked: true });
    expect(inHand.props.accessibilityLabel).toBe(
      "I have the card with me, Held to the phone, it becomes blank again"
    );

    nfc.holdCard(card);
    await fireEvent.press(panel.getByTestId("card-delete-confirm"));
    await stepsSay("Everyday is deleted");
    expect(screen.getByTestId("card-steps-subtitle")).toHaveTextContent(
      "The card is blank: give it away, or add it as a new card"
    );
    stepSays("emptied", "Balance withdrawn: done, The card is empty");
    stepSays("held", "Card held to the phone: done, Above the phone, until the confirmation");
    stepSays("blank", "Card made blank: done, Do not move the card");
    stepSays(
      "erased",
      "Data erased: done, Its name, its settings, its history, its Lightning address"
    );
    expect(stage("hold-stage-blank")).toBeTruthy();
    expect(stage("hold-stage-ok")).toBeTruthy();
    // Blank, gone from its relay, recorded deleted without its settings.
    expect(card.keyVersions).toEqual([0, 0, 0, 0, 0]);
    expect(await channelOn(relay, first)).toBeUndefined();
    expect(knownCardState(TEST_WALLET_ID, first)).toMatchObject({ status: "deleted", name: "" });
    // Done: neither another way nor leaving, "Done".
    expect(screen.queryByTestId("card-steps-secondary")).toBeNull();
    expect(screen.queryByTestId("card-steps-cancel")).toBeNull();

    await fireEvent.press(screen.getByTestId("card-steps-primary"));
    await saysDeleted("Everyday");
    expect(screen.queryByTestId(`card-slot-${first}`)).toBeNull();
    expect(screen.getByTestId(`card-slot-${next}`).props.accessibilityState.selected).toBe(true);
  });

  it("chooses the card before the last one once that one is deleted", async () => {
    const ids = [await pair(), await pair(new FakeNtag424("04a39493cc8680"))];
    // "Cards" shows them by id: the last one is the highest.
    const [before, last] = [...ids].sort();
    await open("/cards");
    const panel = await openTask(last, "card-delete");
    await fireEvent.press(panel.getByTestId("card-delete-in-hand"));
    await fireEvent.press(panel.getByTestId("card-delete-confirm"));
    await fireEvent.press(await screen.findByTestId("card-delete-without-confirm"));
    await saysDeleted(unnamed(last));
    expect(screen.queryByTestId(`card-slot-${last}`)).toBeNull();
    expect(screen.getByTestId(`card-slot-${before}`).props.accessibilityState.selected).toBe(true);
  });

  it("says another card held in its place, changing nothing, then deletes the right one", async () => {
    const cardId = await pair();
    await open("/cards");
    const panel = await openTask(cardId, "card-delete");
    const stranger = new FakeNtag424("04112233445566");
    nfc.holdCard(stranger);
    await fireEvent.press(panel.getByTestId("card-delete-confirm"));
    await stepsSay(`This is not ${unnamed(cardId)}`);
    expect(screen.getByTestId("card-steps-subtitle")).toHaveTextContent(
      "Nothing was changed on the card held"
    );
    stepSays("emptied", "Balance withdrawn: done, The card is empty");
    stepSays(
      "held",
      `This is not ${unnamed(cardId)}: failed, Or it was programmed again elsewhere. Nothing was changed: hold the right card.`
    );
    // The steps not reached: their title only.
    stepSays("blank", "Card reset: to come");
    stepSays("erased", "Data erasure: to come");
    expect(stage("hold-stage-fail")).toBeTruthy();
    expect(screen.getByTestId("card-steps-primary")).toHaveTextContent("Try again", {
      exact: false
    });
    expect(screen.getByTestId("card-steps-cancel")).toHaveTextContent("Cancel");
    expect(stranger.keyVersions).toEqual([0, 0, 0, 0, 0]);
    expect(knownCardState(TEST_WALLET_ID, cardId)?.status).toBe("active");

    nfc.holdCard(card);
    await fireEvent.press(screen.getByTestId("card-steps-primary"));
    await stepsSay(`${unnamed(cardId)} is deleted`);
    expect(card.keyVersions).toEqual([0, 0, 0, 0, 0]);
    expect(stranger.keyVersions).toEqual([0, 0, 0, 0, 0]);
  });

  it('deletes the card without it from "I don\'t have the card", the card left as it is', async () => {
    const cardId = await pair();
    noCardHeld();
    await open("/cards");
    const panel = await openTask(cardId, "card-delete");
    await fireEvent.press(panel.getByTestId("card-delete-confirm"));
    await stepsSay(`Hold ${unnamed(cardId)} above the phone`);
    expect(screen.getByTestId("card-steps-subtitle")).toHaveTextContent(
      "It becomes blank again, then its data are erased"
    );
    stepSays("emptied", "Balance withdrawn: done, The card is empty");
    stepSays("held", "Waiting for the card: in progress, Above the phone, until the confirmation");
    stepSays("blank", "Card reset: to come, Do not move the card");
    expect(stage("hold-stage-waves")).toBeTruthy();
    await waitFor(() => expect(nfc.awaitingCard()).toBe(true), SLOW);
    expect(screen.getByTestId("card-steps-secondary")).toHaveTextContent("I don't have the card");
    expect(screen.getByTestId("card-steps-cancel")).toHaveTextContent("Cancel");

    await fireEvent.press(screen.getByTestId("card-steps-secondary"));
    // No card awaited any more: its dialog over the panel.
    const dialog = await screen.findByTestId("card-delete-without");
    expect(nfc.awaitingCard()).toBe(false);
    expect(screen.queryByTestId("card-steps")).toBeNull();
    expect(
      within(dialog).getByRole("header", { name: `Delete ${unnamed(cardId)} without it?` })
    ).toBeTruthy();
    expect(dialog).toHaveTextContent(
      "Its data are erased and it can never pay again. If you find it, “Add a card” will make it blank.",
      { exact: false }
    );
    await fireEvent.press(screen.getByTestId("card-delete-without-confirm"));
    await saysDeleted(unnamed(cardId));
    expect(knownCardState(TEST_WALLET_ID, cardId)?.status).toBe("deleted");
    // Its keys still in it, its channel gone: its taps wake nothing.
    expect(card.keyVersions).toEqual([1, 1, 1, 1, 1]);
    expect(await channelOn(relay, cardId)).toBeUndefined();
    expect(await screen.findByText("Add your first card")).toBeTruthy();
  });

  it('leaves the card as it was with "Cancel" while it is awaited', async () => {
    const cardId = await pair();
    noCardHeld();
    await open("/cards");
    const panel = await openTask(cardId, "card-delete");
    await fireEvent.press(panel.getByTestId("card-delete-confirm"));
    await waitFor(() => expect(nfc.awaitingCard()).toBe(true), SLOW);
    await fireEvent.press(screen.getByTestId("card-steps-cancel"));
    await waitFor(() => expect(screen.queryByTestId("card-sheet")).toBeNull(), SLOW);
    expect(nfc.awaitingCard()).toBe(false);
    expect(knownCardState(TEST_WALLET_ID, cardId)?.status).toBe("active");
    expect(card.keyVersions).toEqual([1, 1, 1, 1, 1]);
    expect(await channelOn(relay, cardId)).toBeDefined();
    expect(screen.getByTestId(`card-slot-${cardId}`)).toBeTruthy();
  });

  it("asks before deleting the card without it, the card never asked for", async () => {
    const cardId = await pair();
    await open("/cards");
    const panel = await openTask(cardId, "card-delete");
    const asked = nfc.calls.length;
    await fireEvent.press(panel.getByTestId("card-delete-in-hand"));
    expect(panel.getByTestId("card-delete-in-hand").props.accessibilityState).toMatchObject({
      checked: false
    });
    await fireEvent.press(panel.getByTestId("card-delete-confirm"));
    // "Back": the panel as it was, nothing done.
    await fireEvent.press(
      within(await screen.findByTestId("card-delete-without")).getByText("Back")
    );
    await waitFor(() => expect(screen.queryByTestId("card-delete-without")).toBeNull());
    expect(panel.getByTestId("card-delete-in-hand").props.accessibilityState).toMatchObject({
      checked: false
    });
    expect(knownCardState(TEST_WALLET_ID, cardId)?.status).toBe("active");

    await fireEvent.press(panel.getByTestId("card-delete-confirm"));
    await fireEvent.press(await screen.findByTestId("card-delete-without-confirm"));
    await saysDeleted(unnamed(cardId));
    expect(nfc.calls.slice(asked)).toEqual([]);
    expect(card.keyVersions).toEqual([1, 1, 1, 1, 1]);
  });

  it("says a deletion whose data are not all erased on the relays yet, with the card or without", async () => {
    // The relays take the deletion, not the requests that erase its data (NIP-09).
    const publish = nostr.publishEvent;
    jest.spyOn(nostr, "publishEvent").mockImplementation(async (url, event, options) => {
      if (event.kind === 5) throw new Error(`${url}: no answer in time`);
      return publish(url, event, options);
    });
    const notice =
      /^Not all your account's relays answered: the erasure will resume at the next sync$/;

    const without = await pair();
    await open("/cards");
    const panel = await openTask(without, "card-delete");
    await fireEvent.press(panel.getByTestId("card-delete-in-hand"));
    await fireEvent.press(panel.getByTestId("card-delete-confirm"));
    await fireEvent.press(await screen.findByTestId("card-delete-without-confirm"));
    await saysDeleted(unnamed(without));
    expect(await screen.findByText(notice)).toBeTruthy();

    const held = await pair(new FakeNtag424("04a39493cc8680"));
    const again = await openTask(held, "card-delete");
    await fireEvent.press(again.getByTestId("card-delete-confirm"));
    await stepsSay(`${unnamed(held)} is deleted`);
    stepSays("erased", `Erasure to finish: to check, ${notice.source.slice(1, -1)}`);
    await fireEvent.press(screen.getByTestId("card-steps-primary"));
    await saysDeleted(unnamed(held));
    expect(await screen.findByText(notice)).toBeTruthy();
  });

  /** The colour of "Delete the card"'s title on its row. */
  function deleteTitleColor() {
    const title = within(screen.getByTestId("card-delete")).getByText("Delete the card");
    return StyleSheet.flatten(title.props.style).color;
  }

  it("waits, greyed, until the card's balance is read, then opens its panel", async () => {
    const cardId = await pair();
    // Its wallet slow to sync: its balance not read yet.
    const release = sdk.holdFirstSync();
    await open("/cards");
    await choose(cardId);
    expect(await screen.findByTestId("card-balance-reading", {}, SLOW)).toBeTruthy();
    const row = screen.getByTestId("card-delete");
    expect(row).toBeDisabled();
    expect(row.props.accessibilityLabel).toBe("Delete the card, Reading the balance…");
    expect(deleteTitleColor()).toBe(colors.text.disabled);
    // Neither its panel nor "Empty first": nothing is known of what it holds.
    await fireEvent.press(row);
    expect(screen.queryByTestId("card-sheet")).toBeNull();
    expect(screen.queryByTestId("card-delete-drain")).toBeNull();

    release();
    await waitFor(() => expect(screen.getByTestId("card-delete")).toBeEnabled(), SLOW);
    expect(screen.getByTestId("card-balance-sats")).toHaveTextContent(/^0 sats$/);
    expect(screen.getByTestId("card-delete").props.accessibilityLabel).toBe(
      "Delete the card, It and all its data leave the app"
    );
    expect(deleteTitleColor()).toBe(colors.danger.fg);
    await fireEvent.press(screen.getByTestId("card-delete"));
    expect(await screen.findByTestId("card-delete-confirm")).toBeEnabled();
  });

  it('waits, greyed, while its balance could not be read, until "Try again" reads it', async () => {
    const cardId = await pair();
    delete process.env.EXPO_PUBLIC_BREEZ_API_KEY;
    await open("/cards");
    await choose(cardId);
    expect(await screen.findByTestId("card-wallet-failed", {}, SLOW)).toBeTruthy();
    const row = screen.getByTestId("card-delete");
    expect(row).toBeDisabled();
    expect(row.props.accessibilityLabel).toBe("Delete the card, Its balance must be read first");
    await fireEvent.press(row);
    expect(screen.queryByTestId("card-sheet")).toBeNull();
    expect(screen.queryByTestId("card-delete-drain")).toBeNull();

    process.env.EXPO_PUBLIC_BREEZ_API_KEY = "test-api-key";
    await fireEvent.press(screen.getByTestId("card-wallet-retry"));
    await waitFor(() => expect(screen.getByTestId("card-delete")).toBeEnabled(), SLOW);
    await fireEvent.press(screen.getByTestId("card-delete"));
    expect(await screen.findByTestId("card-delete-confirm")).toBeTruthy();
  });

  it("waits again while its balance is read again, once its panel closed", async () => {
    const cardId = await pair();
    await open("/cards");
    await openTask(cardId, "card-delete");
    // Read again as its panel closes, its wallet slow to sync: what it showed may be no longer so.
    const release = sdk.holdFirstSync();
    await fireEvent.press(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByTestId("card-sheet")).toBeNull(), SLOW);
    // Read quietly: its balance stays shown meanwhile.
    expect(screen.queryByTestId("card-balance-reading")).toBeNull();
    expect(screen.getByTestId("card-balance-sats")).toHaveTextContent(/^0 sats$/);
    expect(screen.getByTestId("card-delete")).toBeDisabled();
    await fireEvent.press(screen.getByTestId("card-delete"));
    expect(screen.queryByTestId("card-sheet")).toBeNull();

    release();
    await waitFor(() => expect(screen.getByTestId("card-delete")).toBeEnabled(), SLOW);
    expect(screen.getByTestId("card-balance-sats")).toHaveTextContent(/^0 sats$/);
  });

  it('has a card holding sats emptied first: "Withdraw" all of it, then its panel', async () => {
    const cardId = await pair();
    sdk.fakeCardWallet(cardId).balanceSats = 500n;
    await open("/cards");
    await choose(cardId);
    await waitFor(
      () => expect(screen.getByTestId("card-balance-sats")).toHaveTextContent(/^500 sats$/),
      SLOW
    );
    await fireEvent.press(screen.getByTestId("card-delete"));
    const drain = await screen.findByTestId("card-delete-drain");
    expect(
      within(drain).getByRole("header", { name: `Empty ${unnamed(cardId)} first` })
    ).toBeTruthy();
    expect(drain).toHaveTextContent(
      "It still holds 500 sats. Withdraw them to your main balance before deleting it.",
      { exact: false }
    );
    // Its name in orange, its amount in bold.
    expect(StyleSheet.flatten(within(drain).getByText(unnamed(cardId)).props.style).color).toBe(
      palette.orange
    );
    expect(StyleSheet.flatten(within(drain).getByText("500 sats").props.style)).toMatchObject(
      sans(700)
    );
    // "Back": nothing opened.
    await fireEvent.press(within(drain).getByText("Back"));
    await waitFor(() => expect(screen.queryByTestId("card-delete-drain")).toBeNull());
    expect(screen.queryByTestId("card-sheet")).toBeNull();

    // "Withdraw": the card's whole balance chosen, sent back after the passkey.
    await fireEvent.press(screen.getByTestId("card-delete"));
    await fireEvent.press(await screen.findByTestId("card-delete-drain-return"));
    const panel = within(await screen.findByTestId("card-sheet"));
    await waitFor(() => expect(screen.queryByTestId("card-delete-drain")).toBeNull(), SLOW);
    const all = await panel.findByTestId("card-wallet-empty", {}, SLOW);
    expect(all.props.accessibilityState).toMatchObject({ selected: true });
    await emptyCard(panel);
    await transferSays(/^500 sats withdrawn to your main balance$/);
    expect(sdk.fakeWallet.balanceSats).toBe(500n);
    expect(knownCardState(TEST_WALLET_ID, cardId)?.status).toBe("active");

    // Read again, empty: "Delete the card" opens its panel.
    await waitFor(
      () => expect(screen.getByTestId("card-balance-sats")).toHaveTextContent(/^0 sats$/),
      SLOW
    );
    await fireEvent.press(screen.getByTestId("card-delete"));
    expect(await screen.findByTestId("card-delete-confirm")).toBeTruthy();
    expect(screen.queryByTestId("card-delete-drain")).toBeNull();
  });

  it('refuses to delete a card sats reached since "Cards" read it, the card never asked for', async () => {
    const cardId = await pair();
    await open("/cards");
    const panel = await openTask(cardId, "card-delete");
    // Paid to its Lightning address meanwhile: its deletion reads it again first.
    sdk.fakeCardWallet(cardId).balanceSats = 42n;
    const asked = nfc.calls.length;
    await fireEvent.press(panel.getByTestId("card-delete-confirm"));
    await stepsSay("The deletion did not go through");
    expect(screen.getByTestId("card-steps-subtitle")).toHaveTextContent(
      "Nothing was changed on the card"
    );
    stepSays(
      "emptied",
      "Balance not withdrawn: failed, This card's wallet is not empty, or sats are still on their way to it. Withdraw its balance to your main balance first: a deleted card no longer shows anywhere, nor do its sats. Your card was not changed."
    );
    stepSays("held", "Holding the card to the phone: to come");
    expect(stage("hold-stage-fail")).toBeTruthy();
    expect(nfc.calls.slice(asked)).toEqual([]);
    expect(knownCardState(TEST_WALLET_ID, cardId)?.status).toBe("active");

    // Left: "Cards" says what the card holds now.
    await fireEvent.press(screen.getByTestId("card-steps-cancel"));
    await waitFor(
      () => expect(screen.getByTestId("card-balance-sats")).toHaveTextContent(/^42 sats$/),
      SLOW
    );
  });

  it('says sats on their way to the card first, "Back" alone until they are added', async () => {
    const cardId = await pair();
    sdk.fakeCardWallet(cardId).unclaimedDeposits = [arriving(27_500n)];
    await open("/cards");
    await choose(cardId);
    await waitFor(() => expect(screen.getByTestId("card-balance-pending")).toBeTruthy(), SLOW);
    await fireEvent.press(screen.getByTestId("card-delete"));
    const drain = await screen.findByTestId("card-delete-drain");
    expect(drain).toHaveTextContent(
      /27.500 sats are on their way to a Bitcoin address of this card\. Withdraw them to your main balance once added, before deleting it\./
    );
    // Nothing to send back yet.
    expect(screen.queryByTestId("card-delete-drain-return")).toBeNull();
    await fireEvent.press(within(drain).getByText("Back"));
    await waitFor(() => expect(screen.queryByTestId("card-delete-drain")).toBeNull(), SLOW);
    expect(screen.queryByTestId("card-sheet")).toBeNull();
    expect(knownCardState(TEST_WALLET_ID, cardId)?.status).toBe("active");
  });

  it('says the balance and the sats on their way, "Withdraw" sending the balance', async () => {
    const cardId = await pair();
    const wallet = sdk.fakeCardWallet(cardId);
    wallet.balanceSats = 48_210n;
    wallet.unclaimedDeposits = [arriving(27_500n)];
    await open("/cards");
    await choose(cardId);
    await waitFor(() => expect(screen.getByTestId("card-balance-pending")).toBeTruthy(), SLOW);
    await fireEvent.press(screen.getByTestId("card-delete"));
    const drain = await screen.findByTestId("card-delete-drain");
    expect(drain).toHaveTextContent(
      /It still holds 48.210 sats, and 27.500 sats are on their way to a Bitcoin address\. Withdraw its balance to your main balance, then these 27.500 sats once added\./
    );
    await fireEvent.press(screen.getByTestId("card-delete-drain-return"));
    const panel = within(await screen.findByTestId("card-sheet"));
    const all = await panel.findByTestId("card-wallet-empty", {}, SLOW);
    expect(all.props.accessibilityState).toMatchObject({ selected: true });
  });

  it('never deletes a card sats were sent to on-chain since "Cards" read it', async () => {
    const cardId = await pair();
    await open("/cards");
    const panel = await openTask(cardId, "card-delete");
    // Paid to its Bitcoin address meanwhile: its deletion reads its wallet again first.
    sdk.fakeCardWallet(cardId).unclaimedDeposits = [arriving(10_000n)];
    await fireEvent.press(panel.getByTestId("card-delete-in-hand"));
    await fireEvent.press(panel.getByTestId("card-delete-confirm"));
    await fireEvent.press(await screen.findByTestId("card-delete-without-confirm"));
    const failed = await panel.findByTestId("card-delete-failed", {}, SLOW);
    expect(failed).toHaveTextContent("The deletion did not go through", { exact: false });
    expect(failed).toHaveTextContent(
      /This card's wallet is not empty, or sats are still on their way to it/
    );
    expect(knownCardState(TEST_WALLET_ID, cardId)?.status).toBe("active");

    // Its sats claimed and sent back: "Try again" deletes it.
    sdk.fakeCardWallet(cardId).unclaimedDeposits = [];
    await fireEvent.press(panel.getByTestId("card-delete-retry"));
    await saysDeleted(unnamed(cardId));
    expect(knownCardState(TEST_WALLET_ID, cardId)?.status).toBe("deleted");
  });

  it('finishes with "Try again" a deletion the card left once it was recorded', async () => {
    const cardId = await pair();
    await customizeCard(cardId, { name: "Everyday" });
    await open("/cards");
    const panel = await openTask(cardId, "card-delete");
    // Taken away as its reset begins to write (ChangeKey): recorded deleted already.
    card.interruptAtCommand(0xc4);
    await fireEvent.press(panel.getByTestId("card-delete-confirm"));
    await stepsSay("The deletion did not go through");
    expect(screen.getByTestId("card-steps-subtitle")).toHaveTextContent(
      "It no longer pays: “Try again” finishes the deletion"
    );
    stepSays(
      "blank",
      "Card moved away too early: failed, Hold it again and keep it in place until the confirmation: the deletion will resume where it stopped."
    );
    expect(knownCardState(TEST_WALLET_ID, cardId)?.status).toBe("deleted");

    await fireEvent.press(screen.getByTestId("card-steps-primary"));
    // Said by the name it had, which its record no longer holds.
    await stepsSay("Everyday is deleted");
    expect(card.keyVersions).toEqual([0, 0, 0, 0, 0]);
    expect(knownCardState(TEST_WALLET_ID, cardId)).toMatchObject({ status: "deleted", name: "" });
    await fireEvent.press(screen.getByTestId("card-steps-primary"));
    await saysDeleted("Everyday");
  });

  it("says a phone that reads no card, its wallet unread, and deletes the card without it", async () => {
    jest.replaceProperty(Platform, "OS", "android");
    const cardId = await pair();
    await open("/cards");
    const panel = await openTask(cardId, "card-delete");
    // NFC turned off in the phone's settings since the pairing.
    jest.spyOn(nfc.default, "isEnabled").mockResolvedValue(false);
    await fireEvent.press(panel.getByTestId("card-delete-confirm"));
    await stepsSay("The deletion did not go through");
    // Checked first: nothing else was, its wallet included.
    stepSays("emptied", "Balance check: to come");
    stepSays(
      "held",
      "Card not recognized: failed, NFC is unavailable or turned off on this device. Turn it on in the settings, then try again."
    );
    expect(screen.getByTestId("card-steps-subtitle")).toHaveTextContent(
      "Nothing was changed on the card"
    );

    await fireEvent.press(screen.getByTestId("card-steps-secondary"));
    await fireEvent.press(await screen.findByTestId("card-delete-without-confirm"));
    await saysDeleted(unnamed(cardId));
    expect(card.keyVersions).toEqual([1, 1, 1, 1, 1]);
  });

  it("says the card empty only once its wallet is read so", async () => {
    const cardId = await pair();
    // No sync of its wallet reaches the network yet (the Spark operators unreachable): the
    // deletion waits for one (readCardWalletContents).
    sdk.setSparkReachable(false);
    await open("/cards");
    const panel = await openTask(cardId, "card-delete");
    await fireEvent.press(panel.getByTestId("card-delete-confirm"));
    await stepsSay("Preparing…");
    expect(screen.getByTestId("card-steps-subtitle")).toHaveTextContent(
      "Checking the card's balance"
    );
    stepSays("emptied", "Checking the balance: in progress");
    expect(screen.queryByText("The card is empty")).toBeNull();

    await syncReachesNetwork(cardId);
    await stepsSay(`${unnamed(cardId)} is deleted`);
    stepSays("emptied", "Balance withdrawn: done, The card is empty");
  });

  it('never says the card empty while "Try again" reads its wallet again', async () => {
    const cardId = await pair();
    await open("/cards");
    const panel = await openTask(cardId, "card-delete");
    // First attempt: its wallet read empty, then another card held: nothing recorded.
    nfc.holdCard(new FakeNtag424("04112233445566"));
    await fireEvent.press(panel.getByTestId("card-delete-confirm"));
    await stepsSay(`This is not ${unnamed(cardId)}`);
    // Sats arrive meanwhile, its wallet slow to answer: the retry reads it again.
    sdk.fakeCardWallet(cardId).balanceSats = 700n;
    const release = sdk.holdBalanceReads(sdk.fakeCardWallet(cardId));
    nfc.holdCard(card);
    await fireEvent.press(screen.getByTestId("card-steps-primary"));
    await stepsSay("Preparing…");
    stepSays("emptied", "Checking the balance: in progress");
    expect(screen.queryByText("The card is empty")).toBeNull();
    release();
    await stepsSay("The deletion did not go through");
    expect(screen.queryByText("The card is empty")).toBeNull();
    expect(knownCardState(TEST_WALLET_ID, cardId)?.status).toBe("active");
  });

  it("keeps on the phone a deletion no majority of the relays took, then finishes it", async () => {
    const cardId = await pair();
    await open("/cards");
    const panel = await openTask(cardId, "card-delete");
    // The relays answer, but take nothing more (the network lost as the card is held).
    for (const url of currentRelays()) nostr.readOnly.add(url);
    await fireEvent.press(panel.getByTestId("card-delete-confirm"));
    await stepsSay("The deletion did not go through");
    // Deleted on this phone all the same (a relay that did not answer may hold it): it pays
    // nothing, but it is not made blank before a majority took it.
    expect(screen.getByTestId("card-steps-subtitle")).toHaveTextContent(
      "It no longer pays: “Try again” finishes the deletion"
    );
    stepSays(
      "blank",
      "Card not reset: failed, Your account's relays have not recorded the deletion yet: the card was not made blank."
    );
    expect(card.keyVersions).toEqual([1, 1, 1, 1, 1]);
    expect(knownCardState(TEST_WALLET_ID, cardId)?.status).toBe("deleted");

    // Taken again: "Try again" makes it blank, its wallet read empty by the first attempt.
    nostr.readOnly.clear();
    await fireEvent.press(screen.getByTestId("card-steps-primary"));
    await stepsSay(`${unnamed(cardId)} is deleted`);
    stepSays("emptied", "Balance withdrawn: done, The card is empty");
    expect(card.keyVersions).toEqual([0, 0, 0, 0, 0]);
  });

  it("says a deletion without the card that the relays did not take yet", async () => {
    const cardId = await pair();
    await open("/cards");
    const panel = await openTask(cardId, "card-delete");
    for (const url of currentRelays()) nostr.readOnly.add(url);
    await fireEvent.press(panel.getByTestId("card-delete-in-hand"));
    await fireEvent.press(panel.getByTestId("card-delete-confirm"));
    await fireEvent.press(await screen.findByTestId("card-delete-without-confirm"));
    await saysDeleted(unnamed(cardId));
    expect(
      await screen.findByText(
        "Your account's relays have not recorded its deletion yet: it will finish at the next sync"
      )
    ).toBeTruthy();
    expect(knownCardState(TEST_WALLET_ID, cardId)?.status).toBe("deleted");
    nostr.readOnly.clear();
  });

  it("says nothing of the wallet of a card deleted elsewhere while shown here", async () => {
    const cardId = await pair();
    await open("/cards");
    const panel = await openTask(cardId, "card-delete");
    // Deleted meanwhile without the card on another device (the web app), then paid: a
    // "Top up" invoice paid before it expired.
    const keys = deriveCardRecordKeys(deriveCardRoot(walletSecret(testSeed())));
    const shown = knownCardState(TEST_WALLET_ID, cardId)!;
    await publishToRelays(
      cardStateEvent(keys, { ...shown, status: "deleted", updatedAt: shown.updatedAt + 10 }),
      {
        relays: currentRelays(),
        channel: "account",
        timeoutMs: 1000,
        authKey: keys.nostr.secretKey
      }
    );
    sdk.fakeCardWallet(cardId).balanceSats = 500n;
    await fireEvent.press(panel.getByTestId("card-delete-confirm"));
    await stepsSay(`${unnamed(cardId)} is deleted`);
    // Its wallet not read by this deletion: never "The card is empty".
    stepSays(
      "emptied",
      "Balance not checked: to check, Its deletion was recorded already: sats that arrived since stay visible in “Cards”"
    );
    expect(screen.queryByText("The card is empty")).toBeNull();
    expect(card.keyVersions).toEqual([0, 0, 0, 0, 0]);
  });

  it("reads no deleted wallet while the card held is being made blank", async () => {
    const cardId = await pair();
    await open("/cards");
    const panel = await openTask(cardId, "card-delete");
    // The reset's first write held (ChangeKey): the card in the field, being made blank,
    // its record "deleted" already.
    const transceive = card.transceive;
    let resume!: () => void;
    const gate = new Promise<void>((resolve) => {
      resume = resolve;
    });
    let held = false;
    Object.defineProperty(card, "transceive", {
      value: async (apdu: Uint8Array) => {
        if (apdu[1] === 0xc4 && !held) {
          held = true;
          await gate;
        }
        return transceive(apdu);
      }
    });
    nfc.holdCard(card);
    const reads = jest.spyOn(erasedFundsModule, "readErasedFunds");
    await fireEvent.press(panel.getByTestId("card-delete-confirm"));
    await waitFor(() => expect(held).toBe(true), SLOW);
    expect(knownCardState(TEST_WALLET_ID, cardId)?.status).toBe("deleted");
    await act(async () => {
      await jest.advanceTimersByTimeAsync(2_000);
    });
    // Its wallet, deleted, is not connected nor synced while the card is reset ("Cards" reads
    // it once the deletion ends).
    expect(reads).not.toHaveBeenCalled();
    resume();
    await stepsSay(`${unnamed(cardId)} is deleted`);
    expect(card.keyVersions).toEqual([0, 0, 0, 0, 0]);
  });

  it("says a read the holder cancelled in the deletion's own words", async () => {
    const cardId = await pair();
    await open("/cards");
    const panel = await openTask(cardId, "card-delete");
    // The holder closes the system's sheet (iOS) as the phone waits for the card.
    nfc.cancelNextRequest();
    await fireEvent.press(panel.getByTestId("card-delete-confirm"));
    await stepsSay("The deletion did not go through");
    stepSays("held", "Card not recognized: failed, Card reading cancelled");
    expect(knownCardState(TEST_WALLET_ID, cardId)?.status).toBe("active");
  });

  it("holds the card against an Android phone's back, which vibrates once it is blank", async () => {
    jest.replaceProperty(Platform, "OS", "android");
    // React Native's own mock: its calls of earlier tests cleared.
    const vibrate = jest.spyOn(Vibration, "vibrate");
    vibrate.mockClear();
    const cardId = await pair();
    noCardHeld();
    await open("/cards");
    const panel = await openTask(cardId, "card-delete");
    await fireEvent.press(panel.getByTestId("card-delete-confirm"));
    await stepsSay(`Hold ${unnamed(cardId)} against the back of the phone`);
    stepSays(
      "held",
      "Waiting for the card: in progress, Against the back of the phone, until it vibrates"
    );
    expect(vibrate).not.toHaveBeenCalled();

    nfc.holdCard(card);
    await stepsSay(`${unnamed(cardId)} is deleted`);
    expect(vibrate).toHaveBeenCalledTimes(1);
    expect(vibrate).toHaveBeenCalledWith(200);
  });
});

describe("Sats that reached a deleted card's wallet", () => {
  /** `cardId` deleted without it, as from another device: its record says so. */
  async function deletedElsewhere(cardId: string) {
    await withCardAccess(async (access) => {
      const { updatedAt: _updatedAt, ...state } = knownCardState(TEST_WALLET_ID, cardId)!;
      await recordCardState(access, { ...state, status: "deleted" });
    });
  }

  /** The notice of a deleted card's wallet, once read. */
  function erasedNote() {
    return screen.findByTestId("cards-erased-funds-note", {}, SLOW);
  }

  it("says them above the cards, then sends them back to the main balance with the passkey", async () => {
    const deleted = await pair();
    const kept = await pair(new FakeNtag424("04a39493cc8680"));
    await deletedElsewhere(deleted);
    // Paid since: an invoice of "Top up" paid before it expired.
    sdk.fakeCardWallet(deleted).balanceSats = 1_200n;
    await open("/cards");
    const note = await erasedNote();
    expect(note).toHaveTextContent(
      /Sats reached a deleted card1.200 sats reached its wallet after it was deleted\. Withdraw them to your main balance\.$/
    );
    // The cards as they are: the deleted one gone, the one in service with its own balance.
    expect(screen.queryByTestId(`card-slot-${deleted}`)).toBeNull();
    expect(screen.getByTestId(`card-slot-${kept}`)).toBeTruthy();
    await waitFor(
      () => expect(screen.getByTestId("card-balance-sats")).toHaveTextContent(/^0 sats$/),
      SLOW
    );

    signIn.mockClear();
    await fireEvent.press(screen.getByTestId("cards-erased-funds-return"));
    expect(await screen.findByText(/^1.200 sats withdrawn to your main balance$/, {}, SLOW));
    expect(signIn).toHaveBeenCalledTimes(1);
    expect(sdk.fakeCardWallet(deleted).balanceSats).toBe(0n);
    expect(sdk.fakeWallet.balanceSats).toBe(1_200n);
    // Read again, empty: nothing said any more.
    await waitFor(() => expect(screen.queryByTestId("cards-erased-funds")).toBeNull(), SLOW);
  });

  it("says sats on their way to its Bitcoin address, with nothing to send until they are added", async () => {
    const cardId = await pair();
    await deletedElsewhere(cardId);
    sdk.fakeCardWallet(cardId).unclaimedDeposits = [arriving(27_500n)];
    await open("/cards");
    expect(await erasedNote()).toHaveTextContent(
      /Sats are on their way to a deleted card27.500 sats are on their way to a deleted card's Bitcoin address\. You can withdraw them to your main balance once added\.$/
    );
    expect(screen.queryByTestId("cards-erased-funds-return")).toBeNull();
    // No card left in service.
    expect(screen.getByText("Add your first card")).toBeTruthy();
  });

  it('says the balance and the sats on their way together, "Withdraw" sending the balance', async () => {
    const cardId = await pair();
    await deletedElsewhere(cardId);
    sdk.fakeCardWallet(cardId).balanceSats = 900n;
    sdk.fakeCardWallet(cardId).unclaimedDeposits = [arriving(27_500n)];
    await open("/cards");
    expect(await erasedNote()).toHaveTextContent(
      /Sats reached a deleted card900 sats reached its wallet after it was deleted, and 27.500 sats are still on their way to its Bitcoin address\. Withdraw them to your main balance\.$/
    );
    await fireEvent.press(screen.getByTestId("cards-erased-funds-return"));
    expect(await screen.findByText(/^900 sats withdrawn to your main balance$/, {}, SLOW));
    // Read again: what is still on its way.
    await waitFor(
      () =>
        expect(screen.getByTestId("cards-erased-funds-note")).toHaveTextContent(
          /Sats are on their way to a deleted card27.500 sats are on their way/
        ),
      SLOW
    );
    expect(screen.queryByTestId("cards-erased-funds-return")).toBeNull();
  });

  it("says a card's first wallet once it was added again, its balance its next wallet's", async () => {
    const cardId = await pair();
    await withCardAccess(async (access) => {
      const { updatedAt: _updatedAt, ...state } = knownCardState(TEST_WALLET_ID, cardId)!;
      await recordCardState(access, { ...state, keyVersion: 2, walletGeneration: 2 });
    });
    sdk.fakeCardWallet(cardId, 1).balanceSats = 800n;
    sdk.fakeCardWallet(cardId, 2).balanceSats = 50n;
    await open("/cards");
    expect(await erasedNote()).toHaveTextContent(/800 sats reached its wallet/);
    await waitFor(
      () => expect(screen.getByTestId("card-balance-sats")).toHaveTextContent(/^50 sats$/),
      SLOW
    );
  });

  it("says nothing of a dismissed passkey, a failed return under its notice, then sends it", async () => {
    const cardId = await pair();
    await deletedElsewhere(cardId);
    sdk.fakeCardWallet(cardId).balanceSats = 300n;
    await open("/cards");
    await erasedNote();
    const send = () => fireEvent.press(screen.getByTestId("cards-erased-funds-return"));

    signIn.mockRejectedValueOnce(new PasskeyError("cancelled", "Dismissed"));
    await send();
    await waitFor(() => expect(screen.getByTestId("cards-erased-funds-return")).toBeEnabled());
    expect(screen.queryByTestId("cards-erased-funds-error")).toBeNull();
    expect(sdk.fakeCardWallet(cardId).balanceSats).toBe(300n);

    sdk.fakeSend.sendError = new Error("ServiceConnectivity: unreachable");
    await send();
    expect(await screen.findByTestId("cards-erased-funds-error", {}, SLOW)).toHaveTextContent(
      "The withdrawal did not go through. Check your internet connection, then try again.",
      { exact: false }
    );
    expect(sdk.fakeCardWallet(cardId).balanceSats).toBe(300n);
    expect(screen.getByTestId("cards-erased-funds-return")).toBeEnabled();

    sdk.fakeSend.sendError = null;
    await send();
    expect(await screen.findByText(/^300 sats withdrawn to your main balance$/, {}, SLOW));
    expect(sdk.fakeWallet.balanceSats).toBe(300n);
    await waitFor(() => expect(screen.queryByTestId("cards-erased-funds")).toBeNull(), SLOW);
  });

  /** `cardId` reset, as a relay change left once the card's reset ended leaves it. */
  async function stoppedElsewhere(cardId: string) {
    await withCardAccess(async (access) => {
      const { updatedAt: _updatedAt, ...state } = knownCardState(TEST_WALLET_ID, cardId)!;
      await recordCardState(access, { ...state, status: "reset" });
    });
  }

  it("says the balance of a card whose reprogramming stopped, then sends it back", async () => {
    const stopped = await pair();
    await customizeCard(stopped, { name: "Everyday" });
    await stoppedElsewhere(stopped);
    sdk.fakeCardWallet(stopped).balanceSats = 4_200n;
    sdk.fakeCardWallet(stopped).unclaimedDeposits = [arriving(27_500n)];
    await open("/cards");
    expect(await erasedNote()).toHaveTextContent(
      /Everyday: reprogramming stoppedIt comes back to “Cards”, with its balance, when you add it again\. 4.200 sats remain in its wallet, and 27.500 sats are still on their way to its Bitcoin address: without the card, withdraw them to your main balance\.$/
    );
    expect(screen.queryByTestId(`card-slot-${stopped}`)).toBeNull();

    signIn.mockClear();
    await fireEvent.press(screen.getByTestId("cards-erased-funds-return"));
    expect(await screen.findByText(/^4.200 sats withdrawn to your main balance$/, {}, SLOW));
    expect(signIn).toHaveBeenCalledTimes(1);
    expect(sdk.fakeCardWallet(stopped).balanceSats).toBe(0n);
    expect(sdk.fakeWallet.balanceSats).toBe(4_200n);
    // Read again: no balance left, only sats on their way, of a card that may come back: nothing
    // said any more (only while a balance remains).
    await waitFor(() => expect(screen.queryByTestId("cards-erased-funds")).toBeNull(), SLOW);
  });

  it("says nothing of a stopped card's wallet without a balance", async () => {
    const empty = await pair();
    await stoppedElsewhere(empty);
    const arrivingOnly = await pair(new FakeNtag424("04a39493cc8680"));
    await stoppedElsewhere(arrivingOnly);
    sdk.fakeCardWallet(arrivingOnly).unclaimedDeposits = [arriving(27_500n)];
    const reads = jest.spyOn(erasedFundsModule, "readErasedFunds");
    await open("/cards");
    expect(await screen.findByText("Add your first card", {}, SLOW)).toBeTruthy();
    // Both read, neither said.
    await waitFor(() => expect(reads).toHaveBeenCalledTimes(2), SLOW);
    await act(async () => {
      await Promise.all(reads.mock.results.map(({ value }) => value));
    });
    expect(screen.queryByTestId("cards-erased-funds")).toBeNull();
  });

  it("says nothing of a deleted card's empty wallet, nor of one not read yet", async () => {
    const cardId = await pair();
    await deletedElsewhere(cardId);
    const other = await pair(new FakeNtag424("04a39493cc8680"));
    await deletedElsewhere(other);
    sdk.fakeCardWallet(other).balanceSats = 700n;
    // The wallets slow to sync: the second deleted card's not read yet.
    const release = sdk.holdFirstSync();
    await open("/cards");
    expect(await screen.findByText("Add your first card", {}, SLOW)).toBeTruthy();
    // renderRouter's fake timers: a while passes.
    await act(async () => {
      await jest.advanceTimersByTimeAsync(1_000);
    });
    expect(screen.queryByTestId("cards-erased-funds")).toBeNull();

    // Read at last: the second one's sats only, the first one empty.
    release();
    expect(await erasedNote()).toHaveTextContent(/700 sats reached its wallet/);
    expect(screen.getAllByTestId("cards-erased-funds-note")).toHaveLength(1);
  });
});

describe('"Limits": what the card spent against its limits', () => {
  const HOUR_MS = 3600_000;
  const DAY_MS = 24 * HOUR_MS;

  /** A payment of `cardId`, `sats` at `at` (ms). */
  function spent(
    cardId: string,
    id: string,
    sats: bigint,
    at: number,
    outcome: CardPaymentEntry["outcome"] = "sent"
  ): CardPaymentEntry {
    return {
      id,
      cardId,
      walletGeneration: 1,
      at,
      amountSats: sats,
      paymentHash: id.padStart(64, "0"),
      description: `Payment ${id}`,
      outcome,
      reason: null,
      pr: "lnbc1",
      payee: null,
      preimage: null,
      value: null
    };
  }

  /** "at 16:20", "tomorrow at 09:41": when `at` comes, as "Limits" says it (en-CH). */
  function when(at: number): string {
    const time = formatDate(new Date(at), "en-CH", { hour: "2-digit", minute: "2-digit" });
    const day = (ms: number) => new Date(ms).setHours(0, 0, 0, 0);
    return day(at) === day(Date.now()) ? `at ${time}` : `tomorrow at ${time}`;
  }

  /** `text` as a pattern, the spaces of grouping matched as any one character. */
  function grouped(text: string): RegExp {
    return new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ (?=\d{3})/g, "."));
  }

  it("shows the 24 hours, this hour and when their payments free up, from this phone's", async () => {
    setMockRate(100_000);
    const cardId = await pair();
    const now = Date.now();
    const first = now - 20 * HOUR_MS;
    const recent = now - 10 * 60_000;
    await logCardPayment(spent(cardId, "a1", 3_500n, first));
    await logCardPayment(spent(cardId, "a2", 8_900n, now - 2 * HOUR_MS, "uncertain"));
    await logCardPayment(spent(cardId, "a3", 600n, recent, "sending"));
    // Refused, or another card's: not counted.
    await logCardPayment(spent(cardId, "a4", 40_000n, now - 5 * 60_000, "declined"));
    await logCardPayment(spent("f".repeat(32), "a5", 1_000n, now - 5 * 60_000));
    await open("/cards");
    await openTask(cardId, "card-limits");

    const day = await screen.findByTestId("card-day", {}, SLOW);
    await waitFor(() => expect(day).toHaveTextContent(/13.000of 50.000 sats/));
    // 1 BTC = 100,000 CHF.
    expect(screen.getByTestId("card-day-left")).toHaveTextContent(
      /37.000 sats left, that is 37.00 CHF/
    );
    expect(screen.getByTestId("card-day-release")).toHaveTextContent(
      grouped(`3 500 sats are released ${when(first + DAY_MS)}`)
    );
    // Read as one button: its figure and its lines, which its label replaces.
    expect(day).toHaveAccessibleName(
      new RegExp(
        `^Over 24 hours, 13.000 of 50.000 sats, 37.000 sats left, that is 37.00 CHF, ` +
          `${grouped(`3 500 sats are released ${when(first + DAY_MS)}`).source}, Change$`
      )
    );
    const hour = screen.getByTestId("card-hour");
    expect(hour).toHaveTextContent(/1payment of 5/);
    const paid = formatDate(new Date(recent), "en-CH", { hour: "2-digit", minute: "2-digit" });
    expect(screen.getByTestId("card-hour-release")).toHaveTextContent(
      grouped(`The payment of ${paid} is released ${when(recent + HOUR_MS)}`)
    );
    expect(hour).toHaveAccessibleName(
      new RegExp(
        `^This hour, 1 payment of 5, ` +
          `${grouped(`The payment of ${paid} is released ${when(recent + HOUR_MS)}`).source}, Change$`
      )
    );
    expect(screen.getByTestId("card-ceiling")).toHaveTextContent(/20.000 sats20.00 CHF/);
    expect(screen.getByTestId("card-ceiling")).toHaveAccessibleName(
      /^Per payment, A higher payment is refused, 20.000 sats, 20.00 CHF, Change$/
    );
    expect(
      screen.getByText(/^Based on the payments made by this phone\. The windows slide/)
    ).toBeTruthy();
    expect(screen.queryByTestId("card-limits-reading")).toBeNull();
  });

  /** Five payments of `sats` in the last hour, the most it allows by default; `now` returned. */
  async function fullHour(cardId: string, sats: bigint): Promise<number> {
    const now = Date.now();
    for (const [n, ago] of [50, 40, 30, 20, 10].entries()) {
      await logCardPayment(spent(cardId, `b${n}`, sats, now - ago * 60_000));
    }
    return now;
  }

  it("says when the hour is full, and when the card may pay again", async () => {
    const cardId = await pair();
    const now = await fullHour(cardId, 1_000n);
    await open("/cards");
    await openTask(cardId, "card-limits");
    await waitFor(
      () => expect(screen.getByTestId("card-hour")).toHaveTextContent(/5payments of 5/),
      SLOW
    );
    // Its oldest payment leaves the hour: then a sixth fits.
    expect(screen.getByTestId("card-hour-release")).toHaveTextContent(
      grouped(`Limit reached: next payment possible ${when(now - 50 * 60_000 + HOUR_MS)}`)
    );
    expect(screen.getByTestId("card-day-left")).toHaveTextContent(/45.000 sats left/);
  });

  it("says when the card may pay again once the 24 hours let it too, never sooner", async () => {
    const cardId = await pair();
    // 50,000 sats over 24 hours as well, all of it: the hour frees up first, the day decides.
    const now = await fullHour(cardId, 10_000n);
    await open("/cards");
    await openTask(cardId, "card-limits");
    await waitFor(
      () => expect(screen.getByTestId("card-hour")).toHaveTextContent(/5payments of 5/),
      SLOW
    );
    expect(screen.getByTestId("card-hour-release")).toHaveTextContent(
      grouped(`Limit reached: next payment possible ${when(now - 50 * 60_000 + DAY_MS)}`)
    );
    expect(screen.getByTestId("card-day-left")).toHaveTextContent(
      "Limit reached: the card refuses every payment"
    );
  });

  it("promises no payment while the card is paused: when its hour frees up only", async () => {
    const cardId = await pair();
    const now = await fullHour(cardId, 1_000n);
    await setCardSuspended(cardId, true);
    await open("/cards");
    await openTask(cardId, "card-limits");
    await waitFor(
      () => expect(screen.getByTestId("card-hour")).toHaveTextContent(/5payments of 5/),
      SLOW
    );
    const first = now - 50 * 60_000;
    const paid = formatDate(new Date(first), "en-CH", { hour: "2-digit", minute: "2-digit" });
    expect(screen.getByTestId("card-hour-release")).toHaveTextContent(
      grouped(`The payment of ${paid} is released ${when(first + HOUR_MS)}`)
    );
    expect(screen.queryByText(/next payment possible/)).toBeNull();
  });

  /** The fill of a gauge drawn under "Cards"'s "Limits" (hidden: its button says it). */
  function fillOf(testID: string): unknown {
    const gauge = screen.getByTestId(testID, { includeHiddenElements: true });
    return StyleSheet.flatten((gauge.children[0] as typeof gauge).props.style).backgroundColor;
  }

  it("shows them under the card too, ochre from 90 %, from this phone's", async () => {
    const cardId = await pair();
    const now = Date.now();
    await logCardPayment(spent(cardId, "c1", 45_000n, now - 2 * HOUR_MS));
    await logCardPayment(spent(cardId, "c2", 1_000n, now - 10 * 60_000));
    await open("/cards");
    await choose(cardId);
    await waitFor(
      () =>
        expect(screen.getByTestId("card-limits-day")).toHaveTextContent(
          /^Over 24 hours46.000of 50.000 sats4.000 sats left$/
        ),
      SLOW
    );
    // 92 % of the 24 hours: ochre, as its panel's; 1 payment of 5: orange.
    expect(fillOf("card-limits-gauge")).toBe(colors.warning.solid);
    expect(screen.getByTestId("card-limits-hour")).toHaveTextContent(
      /^This hour1payment of 54 payments left$/
    );
    expect(screen.queryByTestId("card-limits-preview-reading")).toBeNull();
    expect(screen.queryByTestId("card-limits-preview-unread")).toBeNull();
    // Its panel counts the same.
    await openTask(cardId, "card-limits");
    expect(screen.getByTestId("card-day")).toHaveTextContent(/46.000of 50.000 sats/);
  });

  it("says under the card when a limit is reached, and when the card may pay again", async () => {
    const cardId = await pair();
    // 50,000 sats over 24 hours, in five payments of the last hour: both full, the day decides.
    const now = await fullHour(cardId, 10_000n);
    await open("/cards");
    await choose(cardId);
    await waitFor(
      () =>
        expect(screen.getByTestId("card-limits-day")).toHaveTextContent(
          /^Over 24 hours50.000of 50.000 satsLimit reached$/
        ),
      SLOW
    );
    expect(fillOf("card-limits-gauge")).toBe(colors.warning.solid);
    expect(screen.getByTestId("card-limits-hour")).toHaveTextContent(/^This hour5payments of 5/);
    expect(screen.getByTestId("card-limits-hour-left")).toHaveTextContent(
      grouped(`Next payment possible ${when(now - 50 * 60_000 + DAY_MS)}`)
    );
    expect(screen.getByTestId("card-limits")).toHaveAccessibleName(
      new RegExp(
        "^Limits, Over 24 hours, 50.000 of 50.000 sats, Limit reached, This hour, " +
          "5 payments of 5, " +
          `${grouped(`Next payment possible ${when(now - 50 * 60_000 + DAY_MS)}`).source}, ` +
          "Per payment, 20.000 sats at most, Change$"
      )
    );
  });

  it("promises no payment of the hour under the card once the 24 hours are full", async () => {
    const cardId = await pair();
    // All of the 24 hours, two hours ago: none of it in this hour.
    await logCardPayment(spent(cardId, "f1", 50_000n, Date.now() - 2 * HOUR_MS));
    await open("/cards");
    await choose(cardId);
    await waitFor(
      () =>
        expect(screen.getByTestId("card-limits-day")).toHaveTextContent(
          /^Over 24 hours50.000of 50.000 satsLimit reached$/
        ),
      SLOW
    );
    expect(screen.getByTestId("card-limits-hour")).toHaveTextContent(/^This hour0payments of 5$/);
    expect(screen.queryByTestId("card-limits-hour-left")).toBeNull();
  });

  it("reads this phone's payments again as its panel opens, what was read shown meanwhile", async () => {
    const cardId = await pair();
    await open("/cards");
    await choose(cardId);
    await waitFor(
      () => expect(screen.getByTestId("card-limits-day")).toHaveTextContent(/\D0of 50.000 sats/),
      SLOW
    );
    // Paid meanwhile, before the next tick (30 s): its panel says it as it opens.
    await logCardPayment(spent(cardId, "f2", 7_000n, Date.now() - 60_000));
    await openTask(cardId, "card-limits");
    expect(screen.queryByTestId("card-limits-reading")).toBeNull();
    await waitFor(() =>
      expect(screen.getByTestId("card-day")).toHaveTextContent(/7.000of 50.000 sats/)
    );
    expect(screen.getByTestId("card-limits-day")).toHaveTextContent(/7.000of 50.000 sats/);
  });

  it("promises no payment under the card while it is paused: its hour reached only", async () => {
    const cardId = await pair();
    await fullHour(cardId, 1_000n);
    await setCardSuspended(cardId, true);
    await open("/cards");
    await choose(cardId);
    await waitFor(
      () =>
        expect(screen.getByTestId("card-limits-hour")).toHaveTextContent(
          /^This hour5payments of 5Limit reached$/
        ),
      SLOW
    );
    expect(screen.queryByText(/Next payment possible/)).toBeNull();
  });

  it("stays open while a limit is saved: its passkey asked over it, its outcome in it", async () => {
    const cardId = await pair();
    await open("/cards");
    await openTask(cardId, "card-limits");
    await fireEvent.press(await screen.findByTestId("card-day", {}, SLOW));
    await fireEvent.changeText(screen.getByTestId("card-limit-field"), "80000");
    // The passkey asked: held until the test answers it.
    let confirm!: () => void;
    signIn.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          confirm = () => resolve({ seed: testSeed(), credentialId: null });
        })
    );
    await fireEvent.press(screen.getByTestId("card-limit-save"));
    await waitFor(() => expect(signIn).toHaveBeenCalledTimes(1), SLOW);
    // Neither its close button, nor the way back to the limits, nor "Cancel" meanwhile.
    expect(screen.getByRole("button", { name: "Close" })).toBeDisabled();
    expect(screen.getByLabelText("Back to the limits")).toBeDisabled();
    expect(screen.getByTestId("card-limit-cancel")).toBeDisabled();
    await act(async () => confirm());
    expect(await screen.findByTestId("card-limits-list", {}, SLOW)).toBeTruthy();
    expect(screen.getByTestId("card-day")).toHaveTextContent(/of 80.000 sats/);
    // Done: it closes again (its close button, beside "Close" under the limits).
    expect(screen.getAllByRole("button", { name: "Close" })).toHaveLength(2);
  });

  it("never lets what a change of an earlier opening comes to land in a later one", async () => {
    const cardId = await pair();
    const card = knownCardState(TEST_WALLET_ID, cardId)!;
    const profile = {
      version: 2 as const,
      walletId: TEST_WALLET_ID,
      backupKey: getAccountBackupKey()!,
      lightningAddress: "sattleme02c6047f94@breez.tips",
      businessName: "",
      currency: "CHF"
    };
    const onClose = jest.fn();
    // The panel as "Cards" shows it, its card and task given by the test, its card's payments
    // read as "Cards" reads them.
    function Shown({ shown, task }: { shown: CardState | null; task: CardTask }) {
      const limits = useCardLimitLog(shown);
      return (
        <CardSheet
          card={shown}
          task={task}
          limits={limits}
          onWalletChange={() => undefined}
          onClose={onClose}
        />
      );
    }
    const panel = (shown: CardState | null, task: CardTask) => (
      <PosProvider profile={profile}>
        <NotificationsProvider>
          <Shown shown={shown} task={task} />
        </NotificationsProvider>
      </PosProvider>
    );
    const view = await render(panel(card, "limits"));
    await fireEvent.press(await screen.findByTestId("card-day", {}, SLOW));
    // Lowered (the passkey confirms it at once). Its read of the relays held until the test lets
    // it go.
    await fireEvent.changeText(screen.getByTestId("card-limit-field"), "30000");
    const release = nostr.holdQueries();
    await fireEvent.press(screen.getByTestId("card-limit-save"));
    // Closed meanwhile (nothing of "Cards" closes it while it saves), then opened on another task.
    await view.rerender(panel(null, "limits"));
    await view.rerender(panel(card, "customize"));
    expect(await screen.findByTestId("card-name-field")).toBeTruthy();
    release();
    // A change of the settings starts once the one before is over (manage.ts): by then, what the
    // first one came to has run. (No timer: renderRouter leaves Jest's fake ones on.)
    await act(async () => {
      await setCardSuspended(cardId, false);
    });
    expect(knownCardState(TEST_WALLET_ID, cardId)?.maxDaySats).toBe(30_000n);
    // Still the name: neither the limits nor anything of the earlier opening.
    expect(screen.getByTestId("card-name-field")).toBeTruthy();
    expect(screen.queryByTestId("card-limits-list")).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    view.unmount();
  });

  it("says what a new limit leaves before it is saved", async () => {
    const cardId = await pair();
    const now = Date.now();
    await logCardPayment(spent(cardId, "c1", 12_400n, now - HOUR_MS / 2));
    await open("/cards");
    await openTask(cardId, "card-limits");
    await waitFor(() => expect(screen.getByTestId("card-day")).toHaveTextContent(/12.400of/), SLOW);

    await fireEvent.press(screen.getByTestId("card-day"));
    expect(screen.getByTestId("card-limit-maxDaySats")).toHaveTextContent(
      /would go over this limit is refused\. Already used: 12.400 sats\./
    );
    // Under what was used, and under the ceiling per payment: both said, nothing refused.
    await fireEvent.changeText(screen.getByTestId("card-limit-field"), "10000");
    const notes = screen.getAllByTestId("card-limit-note");
    expect(notes).toHaveLength(2);
    expect(notes[0]).toHaveTextContent(
      /You have already used 12.400 sats: the card will refuse every payment/
    );
    expect(notes[1]).toHaveTextContent(/Below the limit per payment \(20.000 sats\)/);
    expect(screen.getByTestId("card-limit-save")).toBeEnabled();
    // Without a rate: the sats alone.
    expect(screen.getByTestId("card-limit-hint")).toHaveTextContent(/^100.000.000 sats at most$/);
    await fireEvent.press(screen.getByTestId("card-limit-cancel"));

    await fireEvent.press(await screen.findByTestId("card-hour"));
    await fireEvent.changeText(screen.getByTestId("card-limit-field"), "1");
    expect(screen.getByTestId("card-limit-note")).toHaveTextContent(
      /You have already made 1 payment this hour/
    );
    await fireEvent.press(screen.getByTestId("card-limit-cancel"));

    // Over the limit over 24 hours: said, and a raise.
    setMockRate(100_000);
    await fireEvent.press(await screen.findByTestId("card-ceiling"));
    await fireEvent.changeText(screen.getByTestId("card-limit-field"), "60000");
    expect(screen.getByTestId("card-limit-note")).toHaveTextContent(
      /Above the limit over 24 hours \(50.000 sats\)/
    );
    expect(screen.getByTestId("card-limit-hint")).toHaveTextContent(
      /^That is 60.00 CHF at the current rate · 100.000.000 sats at most$/
    );
    expect(screen.getByTestId("card-limit-save")).toHaveTextContent(/Confirm with my passkey$/);
  });

  describe("on a desktop", () => {
    beforeEach(() => {
      mockDesktop.mockReturnValue(true);
      windowOf(1440, 900);
    });
    afterEach(phoneWindow);

    const dialogWidth = () =>
      StyleSheet.flatten(screen.getByTestId("card-sheet").props.style).maxWidth;

    it("closes with its dialog's own button, a limit's form \"Cancel\" beside its button", async () => {
      const cardId = await pair();
      await open("/cards");
      const panel = await openTask(cardId, "card-limits");
      expect(await panel.findByTestId("card-day", {}, SLOW)).toBeTruthy();
      // The three limits as wide as a limit's form: the dialog keeps its width from one to the
      // other. No "Close" under them.
      expect(dialogWidth()).toBe(480);
      expect(panel.queryByTestId("card-limits-close")).toBeNull();

      // A limit's form: "Cancel" and its button side by side.
      await fireEvent.press(panel.getByTestId("card-day"));
      const form = within(await screen.findByTestId("card-limit-maxDaySats"));
      expect(dialogWidth()).toBe(480);
      expect(StyleSheet.flatten(form.getByTestId("card-limit-cancel").props.style)).toMatchObject({
        minWidth: 120
      });
      expect(StyleSheet.flatten(form.getByTestId("card-limit-save").props.style)).toMatchObject({
        minWidth: 180
      });
      // Raised or lowered: the passkey said on its button.
      await fireEvent.changeText(form.getByTestId("card-limit-field"), "100000");
      expect(form.getByTestId("card-limit-save")).toHaveTextContent(/Confirm with my passkey$/);
      await fireEvent.changeText(form.getByTestId("card-limit-field"), "10000");
      expect(form.getByTestId("card-limit-save")).toHaveTextContent(/Confirm with my passkey$/);
      // "Cancel": back to the limits, nothing saved, nothing asked.
      await fireEvent.press(form.getByTestId("card-limit-cancel"));
      expect(await screen.findByTestId("card-limits-list")).toBeTruthy();
      expect(dialogWidth()).toBe(480);
      expect(signIn).not.toHaveBeenCalled();
      expect(knownCardState(TEST_WALLET_ID, cardId)?.maxDaySats).toBe(50_000n);
      // Its own button closes it.
      await fireEvent.press(screen.getByRole("button", { name: "Close" }));
      await waitFor(() => expect(screen.queryByTestId("card-sheet")).toBeNull());
    });
  });
});

describe('"Customise": the card\'s name and look, one save', () => {
  const PHOTO = "file:///DCIM/photo.jpg";

  /** The preview: drawn, hidden from screen readers (`aria-hidden`). */
  const HIDDEN = { includeHiddenElements: true };

  /** The panel of `cardId`'s "Customise". */
  async function customizeOf(cardId: string) {
    return openTask(cardId, "card-customize");
  }

  /** A photo of 4032 × 3024 px in the library: a light sky over dark dunes. */
  function photoInLibrary() {
    fileSystem.binaries.set(PHOTO, new Uint8Array([0xff, 0xd8, 0xff, 0xe0]));
    imageFake.decoded = { width: 4032, height: 3024 };
    imageFake.picture = (_x, y) => (y < 0.5 ? { r: 250, g: 244, b: 230 } : { r: 60, g: 40, b: 28 });
    const picked = { canceled: false, assets: [{ uri: PHOTO, width: 4032, height: 3024 }] };
    mockPicker.library.mockResolvedValue(picked);
    mockPicker.camera.mockResolvedValue(picked);
  }

  /** The Modals `element` is drawn in, the innermost first (Jest's Modal draws its content). */
  function modalsOf(element: ReturnType<typeof screen.getByTestId>) {
    const modals: ReturnType<typeof screen.getByTestId>[] = [];
    for (let node = element.parent; node; node = node.parent) {
      if (node.type === "Modal") modals.push(node);
    }
    return modals;
  }

  /** "Frame the image" laid out as on a phone of 390 × 844 pt (Jest has no layout). */
  async function layOutFrame() {
    await fireEvent(screen.getByTestId("card-frame-slot"), "layout", {
      nativeEvent: { layout: { x: 0, y: 190, width: 390, height: 340 } }
    });
  }

  beforeEach(() => {
    resetImageFake();
    mockPicker.library.mockReset().mockResolvedValue({ canceled: true, assets: null });
    mockPicker.camera.mockReset().mockResolvedValue({ canceled: true, assets: null });
    mockPicker.permission.mockReset().mockResolvedValue({ granted: true, status: "granted" });
  });

  it("names the card and gives it a colour of the palette, its names for screen readers", async () => {
    const cardId = await pair();
    await open("/cards");
    const panel = await customizeOf(cardId);
    expect(panel.getByText("Customise the card")).toBeTruthy();
    // No name yet: the end of its id, faded, in the preview and as the field's placeholder.
    const field = panel.getByTestId("card-name-field");
    expect(field.props.placeholder).toBe(unnamed(cardId));
    expect(panel.getByTestId("card-customize-preview", HIDDEN)).toHaveTextContent(unnamed(cardId));
    // Nothing changed: nothing to save.
    expect(panel.getByTestId("card-customize-save")).toBeDisabled();
    // The colour drawn for it, chosen; each colour a radio named for screen readers only.
    const drawn = defaultCardColor(cardId);
    expect(panel.getByTestId(`card-customize-color-${drawn}`).props.accessibilityState).toEqual({
      checked: true,
      disabled: false
    });
    const fir = drawn === "fir" ? "plum" : "fir";
    const named = { fir: "Fir", plum: "Plum" }[fir];
    expect(panel.getByRole("radio", { name: named })).toBeTruthy();
    expect(panel.queryByText(named)).toBeNull();

    await fireEvent.changeText(field, "  Everyday ");
    await fireEvent.press(panel.getByTestId(`card-customize-color-${fir}`));
    expect(panel.getByTestId("card-customize-preview", HIDDEN)).toHaveTextContent("Everyday");
    expect(panel.getByTestId(`card-customize-color-${fir}`).props.accessibilityState).toEqual({
      checked: true,
      disabled: false
    });
    await fireEvent.press(panel.getByTestId("card-customize-save"));
    // Saved together: the panel closes, the card shows both.
    await waitFor(() => expect(screen.queryByTestId("card-customize-panel")).toBeNull(), SLOW);
    expect(knownCardState(TEST_WALLET_ID, cardId)).toMatchObject({
      name: "Everyday",
      look: { kind: "color", color: fir }
    });
    expect(within(screen.getByTestId(`card-slot-${cardId}`)).getByText("Everyday")).toBeTruthy();
    // On the relays too: what this phone forgets is read back there.
    const { states } = await act(async () => {
      resetCardStates();
      return withCardAccess(refreshCardStates);
    });
    expect(states[0]).toMatchObject({ name: "Everyday", look: { kind: "color", color: fir } });
  });

  it("says when another card shows the name already, never refusing it; clears it with a tap", async () => {
    const cardId = await pair();
    const otherId = await pair(new FakeNtag424("04a39493cc8680"));
    await customizeCard(otherId, { name: "Travel" });
    await open("/cards");
    const panel = await customizeOf(cardId);
    await fireEvent.changeText(panel.getByTestId("card-name-field"), "travel");
    expect(panel.getByTestId("card-customize-taken")).toHaveTextContent(
      /Another of your cards is already called travel\. A different name tells them apart when paying\./
    );
    expect(panel.getByTestId("card-customize-save")).toBeEnabled();
    // Another card's label without a name counts too.
    await act(async () => {
      await customizeCard(otherId, { name: "" });
    });
    await fireEvent.changeText(panel.getByTestId("card-name-field"), "Travel");
    await waitFor(() => expect(panel.queryByTestId("card-customize-taken")).toBeNull());
    await fireEvent.changeText(
      panel.getByTestId("card-name-field"),
      unnamed(otherId).toLowerCase()
    );
    await waitFor(() => expect(panel.getByTestId("card-customize-taken")).toBeTruthy());

    await fireEvent.changeText(panel.getByTestId("card-name-field"), "Groceries");
    await fireEvent.press(panel.getByTestId("card-customize-save"));
    await waitFor(
      () => expect(knownCardState(TEST_WALLET_ID, cardId)?.name).toBe("Groceries"),
      SLOW
    );
    // Cleared: the card shows the end of its id again.
    const again = await customizeOf(cardId);
    await fireEvent.press(again.getByLabelText("Clear the name"));
    expect(again.getByTestId("card-name-field").props.value).toBe("");
    // Opened again while it slid away, the panel's former page fades out over the new one first.
    await waitFor(() =>
      expect(again.getAllByTestId("card-customize-preview", HIDDEN)).toHaveLength(1)
    );
    expect(again.getByTestId("card-customize-preview", HIDDEN)).toHaveTextContent(unnamed(cardId));
    await fireEvent.press(again.getByTestId("card-customize-save"));
    await waitFor(() => expect(knownCardState(TEST_WALLET_ID, cardId)?.name).toBe(""), SLOW);
  });

  it('shares the panel\'s width between "Colour" and "Image" on a phone too', async () => {
    const cardId = await pair();
    await open("/cards");
    const panel = await customizeOf(cardId);
    expect(
      StyleSheet.flatten(panel.getByTestId("card-customize-kind-group").props.style).alignSelf
    ).toBe("stretch");
    for (const kind of ["color", "image"]) {
      expect(
        StyleSheet.flatten(panel.getByTestId(`card-customize-kind-${kind}`).props.style)
      ).toMatchObject({ flexGrow: 1, flexBasis: 0 });
    }
  });

  it("frames an imported image, the name in the ink of the light where it goes, saved with it", async () => {
    photoInLibrary();
    const cardId = await pair();
    await open("/cards");
    const panel = await customizeOf(cardId);
    await fireEvent.changeText(panel.getByTestId("card-name-field"), "Holidays");
    await fireEvent.press(panel.getByTestId("card-customize-kind-image"));
    expect(
      panel.getByText("You will then frame it to the card's shape. It will replace the colour.")
    ).toBeTruthy();
    await fireEvent.press(panel.getByTestId("card-customize-library"));
    // The framing shows over the panel, in a Modal nested in the panel's own (iOS shows no Modal
    // opened beside one that leaves); the panel waits under it, out of reach.
    const frame = await screen.findByTestId("card-frame", {}, SLOW);
    const [own, around] = modalsOf(frame);
    expect(own).toBeDefined();
    expect(around && within(around).getByTestId("card-sheet", HIDDEN)).toBeTruthy();
    expect(screen.queryByTestId("card-customize-panel")).toBeNull();
    expect(screen.getByTestId("card-customize-panel", HIDDEN)).toBeTruthy();
    await layOutFrame();
    // Its middle under the window: the name over the sky, in black, with no line saying why.
    expect(screen.getByTestId("card-frame-name")).toHaveTextContent("Holidays");
    expect(screen.getByTestId("card-frame-name")).toHaveStyle({ color: palette.ink });
    expect(screen.queryByText(/^Name in (black|white)/)).toBeNull();
    expect(screen.getByTestId("card-frame-zoom-out")).toBeDisabled();
    // Zoomed in to the most, then moved up as far as it goes: the name over the dunes, in white.
    for (let step = 0; step < 8; step++) {
      await fireEvent.press(screen.getByTestId("card-frame-zoom-in"));
    }
    expect(screen.getByTestId("card-frame-zoom-in")).toBeDisabled();
    const slot = screen.getByTestId("card-frame-slot");
    const touch = (pageX: number, pageY: number) => ({
      nativeEvent: { touches: [{ pageX, pageY }], pageX, pageY }
    });
    await fireEvent(slot, "responderGrant", touch(200, 400));
    await fireEvent(slot, "responderMove", touch(200, 100));
    await fireEvent(slot, "responderMove", touch(200, -2000));
    await fireEvent(slot, "responderRelease", touch(200, -2000));
    expect(screen.getByTestId("card-frame-name")).toHaveStyle({ color: palette.white });

    await fireEvent.press(screen.getByTestId("card-frame-use"));
    // Back to the panel, as it was: its name kept, the image in its preview.
    const back = within(await screen.findByTestId("card-customize-panel", {}, SLOW));
    expect(back.getByTestId("card-name-field").props.value).toBe("Holidays");
    expect(await back.findByTestId("card-customize-preview-image", HIDDEN)).toBeTruthy();
    // The card's JPEG: the bottom third of the image, a card's shape, from the copy framed.
    const crop = imageFake.rendered.find((render) => render.crop !== null)!.crop!;
    expect(crop.width).toBe(Math.round(2048 / 3));
    expect(crop.originX).toBe(Math.round((2048 - crop.width) / 2));
    expect(crop.originY + crop.height).toBe(1536);
    expect(crop.width / crop.height).toBeCloseTo(CARD_ASPECT, 2);
    // Nothing on the relays before "Save".
    const published = () => nostr.calls.filter((call) => call.operation === "publish").length;
    const before = published();
    await fireEvent.press(back.getByTestId("card-customize-save"));
    await waitFor(() => expect(screen.queryByTestId("card-customize-panel")).toBeNull(), SLOW);
    expect(published()).toBeGreaterThan(before);
    const saved = knownCardState(TEST_WALLET_ID, cardId)!;
    expect(saved).toMatchObject({ name: "Holidays", look: { kind: "image", ink: "light" } });
    // The image on a majority of the relays, the bytes the card names.
    if (saved.look?.kind !== "image") throw new Error("No image");
    const found = await fetchImage(saved.look.image);
    expect(found.status).toBe("found");
    if (found.status === "found") expect(found.holders.length).toBeGreaterThanOrEqual(3);
  });

  it("moves the image without dragging: a screen reader's actions in the apps", async () => {
    photoInLibrary();
    const cardId = await pair();
    await open("/cards");
    const panel = await customizeOf(cardId);
    await fireEvent.press(panel.getByTestId("card-customize-kind-image"));
    await fireEvent.press(panel.getByTestId("card-customize-library"));
    await screen.findByTestId("card-frame", {}, SLOW);
    await layOutFrame();
    const slot = screen.getByTestId("card-frame-slot");
    expect(slot.props.accessibilityActions).toEqual([
      { name: "increment" },
      { name: "decrement" },
      { name: "moveLeft", label: "Move the image left" },
      { name: "moveRight", label: "Move the image right" },
      { name: "moveUp", label: "Move the image up" },
      { name: "moveDown", label: "Move the image down" }
    ]);
    const action = (actionName: string) =>
      fireEvent(slot, "accessibilityAction", { nativeEvent: { actionName } });
    // Zoomed in (a swipe up) to the most, then moved up as far as it goes: the name over the dunes.
    for (let step = 0; step < 8; step++) await action("increment");
    expect(screen.getByTestId("card-frame-zoom-in")).toBeDisabled();
    for (let step = 0; step < 30; step++) await action("moveUp");
    expect(screen.getByTestId("card-frame-name")).toHaveStyle({ color: palette.white });
    // Back down a third of the way: the sky again.
    for (let step = 0; step < 30; step++) await action("moveDown");
    expect(screen.getByTestId("card-frame-name")).toHaveStyle({ color: palette.ink });
    // No keys in the apps, which have the actions.
    expect(slot.props.onKeyDown).toBeUndefined();
  });

  it("moves the image with the arrow keys on the web, zooms it with + and -", async () => {
    photoInLibrary();
    const cardId = await pair();
    await open("/cards");
    const panel = await customizeOf(cardId);
    await fireEvent.press(panel.getByTestId("card-customize-kind-image"));
    // The framing as the web app draws it.
    jest.replaceProperty(Platform, "OS", "web");
    await fireEvent.press(panel.getByTestId("card-customize-library"));
    await screen.findByTestId("card-frame", {}, SLOW);
    await layOutFrame();
    const slot = screen.getByTestId("card-frame-slot");
    // RNTL 14 fires events asynchronously: each one must be awaited.
    const key = async (name: string) => {
      // As react-native-web hands it: React's keyboard event, the browser's in `nativeEvent`.
      const event = { key: name, nativeEvent: { key: name }, preventDefault: jest.fn() };
      await fireEvent(slot, "keyDown", event);
      return event;
    };
    expect(slot.props.tabIndex).toBe(0);
    for (let step = 0; step < 8; step++) expect((await key("+")).preventDefault).toHaveBeenCalled();
    expect(screen.getByTestId("card-frame-zoom-in")).toBeDisabled();
    for (let step = 0; step < 30; step++) await key("ArrowUp");
    expect(screen.getByTestId("card-frame-name")).toHaveStyle({ color: palette.white });
    await key("-");
    expect(screen.getByTestId("card-frame-zoom-in")).toBeEnabled();
    // Other keys (Tab to move on) are left to the browser.
    expect((await key("Tab")).preventDefault).not.toHaveBeenCalled();
  });

  it("goes back to the panel as it was when the framing is left, nothing made", async () => {
    photoInLibrary();
    const cardId = await pair();
    await open("/cards");
    const panel = await customizeOf(cardId);
    await fireEvent.changeText(panel.getByTestId("card-name-field"), "Holidays");
    await fireEvent.press(panel.getByTestId("card-customize-kind-image"));
    await fireEvent.press(panel.getByTestId("card-customize-camera"));
    expect(mockPicker.permission).toHaveBeenCalled();
    expect(await screen.findByTestId("card-frame", {}, SLOW)).toBeTruthy();
    await layOutFrame();
    await fireEvent.press(screen.getByTestId("card-frame-cancel"));
    const back = within(await screen.findByTestId("card-customize-panel", {}, SLOW));
    expect(back.getByTestId("card-name-field").props.value).toBe("Holidays");
    expect(back.queryByTestId("card-customize-preview-image", HIDDEN)).toBeNull();
    expect(imageFake.rendered.some((render) => render.crop !== null)).toBe(false);
    // The image decoded for the framing, freed.
    await waitFor(() => expect(imageFake.made.every((made) => made.released)).toBe(true));
  });

  it("says when the image could not be kept on the relays: nothing saved", async () => {
    photoInLibrary();
    const cardId = await pair();
    await open("/cards");
    const panel = await customizeOf(cardId);
    await fireEvent.press(panel.getByTestId("card-customize-kind-image"));
    await fireEvent.press(panel.getByTestId("card-customize-library"));
    expect(await screen.findByTestId("card-frame", {}, SLOW)).toBeTruthy();
    await layOutFrame();
    await fireEvent.press(screen.getByTestId("card-frame-use"));
    const back = within(await screen.findByTestId("card-customize-panel", {}, SLOW));
    // A majority of the relays refusing what is published.
    for (const url of currentRelays().slice(0, 3)) nostr.readOnly.add(url);
    await fireEvent.press(back.getByTestId("card-customize-save"));
    expect(await back.findByTestId("card-customize-failed", {}, SLOW)).toHaveTextContent(
      /The image could not be saved on your account's relays\. Check your connection/
    );
    expect(knownCardState(TEST_WALLET_ID, cardId)?.look).toBeNull();
    // Still there to save again.
    nostr.readOnly.clear();
    await fireEvent.press(back.getByTestId("card-customize-save"));
    await waitFor(
      () => expect(knownCardState(TEST_WALLET_ID, cardId)?.look?.kind).toBe("image"),
      SLOW
    );
  });

  it("says why a photo cannot be picked", async () => {
    const cardId = await pair();
    await open("/cards");
    const panel = await customizeOf(cardId);
    await fireEvent.press(panel.getByTestId("card-customize-kind-image"));
    mockPicker.library.mockRejectedValue(new Error("No access to the photos"));
    await fireEvent.press(panel.getByTestId("card-customize-library"));
    expect(await panel.findByTestId("card-customize-failed")).toHaveTextContent(
      /Allow access to your photos in the device settings, then try again\./
    );
    mockPicker.permission.mockResolvedValue({ granted: false, status: "denied" });
    await fireEvent.press(panel.getByTestId("card-customize-camera"));
    await waitFor(() =>
      expect(panel.getByTestId("card-customize-failed")).toHaveTextContent(
        /The camera does not open/
      )
    );
    expect(screen.queryByTestId("card-frame")).toBeNull();
  });

  it('keeps a v2 card\'s visual: its name only changes, no "Look"', async () => {
    const cardId = await pair();
    const image = { key: "11".repeat(32), hash: "22".repeat(32) };
    // Its visual read: drawn on its face (the sand and its label, without it).
    rememberImage(image, Uint8Array.of(0xff, 0xd8, 0xff));
    await withCardAccess(async (access) => {
      const { updatedAt: _updatedAt, ...state } = knownCardState(TEST_WALLET_ID, cardId)!;
      await recordCardState(access, {
        ...state,
        issuer: { image, number: "4821-0937-5530-1186", white: false },
        settingsAt: state.settingsAt + 1
      });
    });
    await open("/cards");
    // Its printed number under its face, small, and said with its name.
    expect(await screen.findByTestId("card-printed-number")).toHaveTextContent(
      "4821-0937-5530-1186"
    );
    const slot = screen.getByTestId(`card-slot-${cardId}`);
    expect(slot.props.accessibilityLabel).toMatch(
      new RegExp(`${unnamed(cardId)}, 4821-0937-5530-1186$`)
    );
    // Without a name, its visual alone: never "Card …" over it.
    expect(await within(slot).findByTestId("card-face-image", {}, SLOW)).toBeTruthy();
    expect(within(slot).queryByTestId("card-face-label")).toBeNull();
    const panel = await customizeOf(cardId);
    expect(panel.queryByText("Look")).toBeNull();
    expect(panel.queryByTestId("card-customize-kind")).toBeNull();
    // Its visual is no change: nothing to save until its name changes.
    expect(panel.getByTestId("card-customize-save")).toBeDisabled();
    expect(panel.getByTestId("card-customize-preview-image", HIDDEN)).toBeTruthy();
    expect(panel.queryByTestId("card-customize-preview-label", HIDDEN)).toBeNull();
    expect(panel.getByTestId("card-customize-preview", HIDDEN)).not.toHaveTextContent(
      /4821-0937-5530-1186/
    );
    await fireEvent.changeText(panel.getByTestId("card-name-field"), "Everyday");
    // The name its holder gives it written on its face as "Cards" writes it.
    expect(panel.getByTestId("card-customize-preview", HIDDEN)).toHaveTextContent("Everyday");
    await fireEvent.press(panel.getByTestId("card-customize-save"));
    await waitFor(
      () => expect(knownCardState(TEST_WALLET_ID, cardId)?.name).toBe("Everyday"),
      SLOW
    );
    await waitFor(() =>
      expect(
        within(screen.getByTestId(`card-slot-${cardId}`)).getByTestId("card-face-label")
      ).toHaveTextContent("Everyday")
    );
    expect(knownCardState(TEST_WALLET_ID, cardId)).toMatchObject({
      look: null,
      issuer: { number: "4821-0937-5530-1186" }
    });
  });

  it("stays open while it saves", async () => {
    const cardId = await pair();
    await open("/cards");
    const panel = await customizeOf(cardId);
    await fireEvent.changeText(panel.getByTestId("card-name-field"), "Everyday");
    const release = nostr.holdPublishes();
    await fireEvent.press(panel.getByTestId("card-customize-save"));
    expect(screen.getByRole("button", { name: "Close" })).toBeDisabled();
    expect(panel.getByTestId("card-name-field")).toBeDisabled();
    release();
    await waitFor(() => expect(screen.queryByTestId("card-customize-panel")).toBeNull(), SLOW);
    expect(knownCardState(TEST_WALLET_ID, cardId)?.name).toBe("Everyday");
  });

  it("never writes back what it did not change: a rename made elsewhere stays", async () => {
    const cardId = await pair();
    await customizeCard(cardId, { name: "Old" });
    await open("/cards");
    const panel = await customizeOf(cardId);
    const drawn = defaultCardColor(cardId);
    const other = drawn === "fir" ? "plum" : "fir";
    // The colour changed alone…
    await fireEvent.press(panel.getByTestId(`card-customize-color-${other}`));
    // …while the card is renamed on another device, which this one learns.
    await act(async () => {
      await customizeCard(cardId, { name: "New" });
    });
    await fireEvent.press(panel.getByTestId("card-customize-save"));
    await waitFor(() => expect(screen.queryByTestId("card-customize-panel")).toBeNull(), SLOW);
    expect(knownCardState(TEST_WALLET_ID, cardId)).toMatchObject({
      name: "New",
      look: { kind: "color", color: other }
    });
  });

  it("tells a change from what it opened on, never from one made elsewhere", async () => {
    const cardId = await pair();
    await open("/cards");
    const panel = await customizeOf(cardId);
    const drawn = defaultCardColor(cardId);
    const other = drawn === "fir" ? "plum" : "fir";
    // Nothing changed here yet: it shows what is made elsewhere, with nothing to save.
    await act(async () => {
      await customizeCard(cardId, { name: "Elsewhere" });
    });
    await waitFor(() => expect(panel.getByTestId("card-name-field").props.value).toBe("Elsewhere"));
    expect(panel.getByTestId("card-customize-save")).toBeDisabled();
    // A colour chosen, then the card renamed again elsewhere, then the colour chosen back: no
    // change of this panel's, nothing to save (its name would undo the other device's).
    await fireEvent.press(panel.getByTestId(`card-customize-color-${other}`));
    expect(panel.getByTestId("card-customize-save")).toBeEnabled();
    await act(async () => {
      await customizeCard(cardId, { name: "Elsewhere again" });
    });
    await fireEvent.press(panel.getByTestId(`card-customize-color-${drawn}`));
    expect(panel.getByTestId("card-customize-save")).toBeDisabled();
  });

  it("takes the colour drawn for the card, chosen again, for no change", async () => {
    const cardId = await pair();
    await open("/cards");
    const panel = await customizeOf(cardId);
    await fireEvent.press(panel.getByTestId(`card-customize-color-${defaultCardColor(cardId)}`));
    expect(panel.getByTestId("card-customize-save")).toBeDisabled();
    // The name changed with it: saved alone, the card still without a look of its own.
    await fireEvent.changeText(panel.getByTestId("card-name-field"), "Everyday");
    await fireEvent.press(panel.getByTestId("card-customize-save"));
    await waitFor(
      () => expect(knownCardState(TEST_WALLET_ID, cardId)?.name).toBe("Everyday"),
      SLOW
    );
    expect(knownCardState(TEST_WALLET_ID, cardId)?.look).toBeNull();
  });

  it("says its own failure when nothing more precise is known", async () => {
    const cardId = await pair();
    // A card neither the relays nor this device know: its save fails, for no named reason.
    const card = { ...knownCardState(TEST_WALLET_ID, cardId)!, cardId: "f".repeat(cardId.length) };
    function Panel() {
      const [draft, setDraft] = useState(() => customizeDraftOf(card));
      return (
        <CustomizePanel
          card={card}
          others={[]}
          draft={draft}
          onDraft={setDraft}
          onFrame={() => undefined}
          onBusy={() => undefined}
          onDone={() => undefined}
        />
      );
    }
    await render(<Panel />);
    await fireEvent.changeText(screen.getByTestId("card-name-field"), "Everyday");
    await fireEvent.press(screen.getByTestId("card-customize-save"));
    // Never "The pairing failed", which says nothing of this change.
    expect(await screen.findByTestId("card-customize-failed", {}, SLOW)).toHaveTextContent(
      /The card could not be changed\. Try again\./
    );
  });

  describe("on a desktop", () => {
    beforeEach(() => {
      mockDesktop.mockReturnValue(true);
      windowOf(1440, 900);
    });
    afterEach(phoneWindow);

    const dialogWidth = () =>
      StyleSheet.flatten(screen.getByTestId("card-sheet").props.style).maxWidth;

    it('chooses among its eight colours on one line, "Cancel" beside "Save"', async () => {
      const cardId = await pair();
      await open("/cards");
      const panel = await customizeOf(cardId);
      expect(dialogWidth()).toBe(480);
      // "Colour" and "Image" sharing the dialog's width.
      expect(
        StyleSheet.flatten(panel.getByTestId("card-customize-kind-group").props.style).alignSelf
      ).toBe("stretch");
      for (const kind of ["color", "image"]) {
        expect(
          StyleSheet.flatten(panel.getByTestId(`card-customize-kind-${kind}`).props.style)
        ).toMatchObject({ flexGrow: 1, flexBasis: 0 });
      }
      // The eight colours, an eighth of the line each.
      const drawn = defaultCardColor(cardId);
      const other = drawn === "fir" ? "plum" : "fir";
      expect(
        StyleSheet.flatten(panel.getByTestId(`card-customize-color-${other}`).props.style).width
      ).toBe("12.5%");
      // "Cancel" closes it, nothing saved.
      await fireEvent.press(panel.getByTestId(`card-customize-color-${other}`));
      expect(panel.getByTestId("card-customize-save")).toBeEnabled();
      await fireEvent.press(panel.getByTestId("card-customize-cancel"));
      await waitFor(() => expect(screen.queryByTestId("card-sheet")).toBeNull());
      expect(knownCardState(TEST_WALLET_ID, cardId)?.look).toBeNull();
    });

    it('frames an image in the panel\'s own dialog, then goes back to "Customise" as it was', async () => {
      photoInLibrary();
      const cardId = await pair();
      await open("/cards");
      const panel = await customizeOf(cardId);
      await fireEvent.changeText(panel.getByTestId("card-name-field"), "Holidays");
      await fireEvent.press(panel.getByTestId("card-customize-kind-image"));
      await fireEvent.press(panel.getByTestId("card-customize-library"));
      // In the panel's dialog itself, which takes its title: no Modal of its own over it.
      const frame = await screen.findByTestId("card-frame", {}, SLOW);
      expect(modalsOf(frame)).toHaveLength(1);
      expect(within(screen.getByTestId("card-sheet")).getByRole("header")).toHaveTextContent(
        "Frame the image"
      );
      expect(dialogWidth()).toBe(560);
      expect(screen.queryByTestId("card-customize-panel")).toBeNull();
      // The window of the card's shape, 420 px wide; the name over the sky, in black.
      expect(StyleSheet.flatten(screen.getByTestId("card-frame-slot").props.style)).toMatchObject({
        width: 420,
        height: 420 / CARD_ASPECT
      });
      expect(screen.getByTestId("card-frame-name")).toHaveTextContent("Holidays");
      expect(screen.getByTestId("card-frame-name")).toHaveStyle({ color: palette.ink });
      expect(screen.queryByText(/^Name in (black|white)/)).toBeNull();
      // The slider: pressed at its end, the most zoom; at its start, none.
      // Hidden from screen readers, which zoom with the buttons and the window's actions.
      const slider = screen.getByTestId("card-frame-slider", HIDDEN);
      const at = (locationX: number) => ({ nativeEvent: { locationX, pageX: 500 + locationX } });
      await fireEvent(slider, "responderGrant", at(160));
      await fireEvent(slider, "responderRelease", at(160));
      expect(screen.getByTestId("card-frame-zoom-in")).toBeDisabled();
      expect(screen.getByTestId("card-frame-slider-fill", HIDDEN)).toHaveStyle({ width: 160 });
      // Dragged back from there to its start.
      await fireEvent(slider, "responderGrant", at(160));
      await fireEvent(slider, "responderMove", at(-40));
      await fireEvent(slider, "responderRelease", at(-40));
      expect(screen.getByTestId("card-frame-zoom-out")).toBeDisabled();
      expect(screen.getByTestId("card-frame-slider-fill", HIDDEN)).toHaveStyle({ width: 0 });
      // Its close button goes back to "Customise", the name typed kept, nothing framed.
      await fireEvent.press(screen.getByRole("button", { name: "Close" }));
      const back = within(await screen.findByTestId("card-customize-panel", {}, SLOW));
      expect(back.getByTestId("card-name-field").props.value).toBe("Holidays");
      expect(back.queryByTestId("card-customize-preview-image", HIDDEN)).toBeNull();
      expect(dialogWidth()).toBe(480);

      // Framed again and used: back with the image, saved with the name.
      await fireEvent.press(back.getByTestId("card-customize-library"));
      await screen.findByTestId("card-frame", {}, SLOW);
      await fireEvent.press(screen.getByTestId("card-frame-use"));
      const again = within(await screen.findByTestId("card-customize-panel", {}, SLOW));
      expect(await again.findByTestId("card-customize-preview-image", HIDDEN)).toBeTruthy();
      // The card's JPEG: the image's middle, at the card's shape.
      const crop = imageFake.rendered.find((render) => render.crop !== null)!.crop!;
      expect(crop.width / crop.height).toBeCloseTo(CARD_ASPECT, 2);
      await fireEvent.press(again.getByTestId("card-customize-save"));
      await waitFor(() => expect(screen.queryByTestId("card-customize-panel")).toBeNull(), SLOW);
      expect(knownCardState(TEST_WALLET_ID, cardId)).toMatchObject({
        name: "Holidays",
        look: { kind: "image", ink: "dark" }
      });
    });
  });
});

describe('"Cards": the card\'s own wallet', () => {
  /** "Cards", `cardId` chosen, its balance read. */
  async function balanceOf(cardId: string) {
    await open("/cards");
    await choose(cardId);
    return screen.findByTestId("card-balance-sats", {}, SLOW);
  }

  it('shows "Top up" under the balance, "History" first of "Card" and "Withdraw" last', async () => {
    const cardId = await pair();
    sdk.fakeCardWallet(cardId).balanceSats = 7_000n;
    const release = sdk.holdFirstSync();
    await open("/cards");
    await choose(cardId);
    expect(await screen.findByTestId("card-balance-reading", {}, SLOW)).toBeTruthy();
    expect(screen.getByTestId("card-balance")).toHaveTextContent(/^Balance/);
    // Unread: "Withdraw" greyed, its caption says why.
    expect(screen.getByTestId("card-wallet-return")).toBeDisabled();
    expect(screen.getByTestId("card-wallet-return")).toHaveTextContent(
      /WithdrawReading the balance…$/
    );
    release();
    expect(await screen.findByTestId("card-balance-sats", {}, SLOW)).toHaveTextContent(
      /^7.000 sats$/
    );

    // "Top up": the screen's one filled button, small, no longer a round action.
    const recharge = screen.getByTestId("card-wallet-recharge");
    expect(recharge).toBeEnabled();
    expect(recharge).toHaveTextContent(/Top up$/);
    const look = StyleSheet.flatten(recharge.props.style);
    expect(look.backgroundColor).toBe(colors.button.primary.bg);
    expect(look.height).toBe(44);
    // "Card", after "Security": "History" first, "Withdraw" last, before "Delete the card" (a
    // group of its own).
    const ids = screen
      .getAllByRole("button")
      .map((row) => row.props.testID as string | undefined)
      .filter((id) => id?.startsWith("card-"));
    const at = ids.indexOf("card-history");
    expect(ids.indexOf("card-limits")).toBeLessThan(at);
    // "Advanced settings" between "Card" and "Delete the card": "Payments without confirmation"
    // and "Relay and programming" in its panel only.
    expect(ids.slice(at, at + 5)).toEqual([
      "card-history",
      "card-customize",
      "card-wallet-return",
      "card-advanced",
      "card-delete"
    ]);
    expect(ids).not.toContain("card-payees");
    expect(ids).not.toContain("card-relay");
    expect(screen.getByTestId("card-wallet-return")).toBeEnabled();
    // To any other wallet, the main balance among them.
    expect(screen.getByTestId("card-wallet-return")).toHaveTextContent(
      /WithdrawTo another wallet or my main balance/
    );
    expect(screen.getByTestId("card-history")).toHaveTextContent(
      /HistoryAll of the card's movements/
    );

    // Its panel: the recipient first, as in "Send", "Paste" an icon in its field, the main
    // balance under it; "Empty the card" not before a recipient is read.
    const panel = await openTask(cardId, "card-wallet-return");
    expect(await panel.findByLabelText("Recipient", {}, SLOW)).toBeTruthy();
    expect(panel.getByRole("header")).toHaveTextContent("Withdraw");
    expect(panel.getByLabelText("Paste")).toBe(panel.getByTestId("send-paste"));
    expect(panel.queryByText("Paste")).toBeNull();
    expect(panel.getByTestId("card-wallet-to-main")).toHaveTextContent(/To my main balance$/);
    expect(panel.queryByTestId("card-wallet-drain")).toBeNull();
    // The main wallet not held for it: only "To my main balance" does.
    await fireEvent.press(panel.getByTestId("card-wallet-to-main"));
    expect(await panel.findByTestId("card-wallet-amount-return", {}, SLOW)).toBeTruthy();
    expect(panel.getByRole("header")).toHaveTextContent("Withdraw to my main balance");
    // Its way back: the recipient again.
    await fireEvent.press(panel.getByTestId("sheet-back"));
    expect(await panel.findByLabelText("Recipient", {}, SLOW)).toBeTruthy();
  });

  it("withdraws to any other wallet, a Spark address too, noted on the relays before it leaves", async () => {
    const cardId = await pair();
    sdk.fakeCardWallet(cardId).balanceSats = 10_000n;
    expect(await balanceOf(cardId)).toHaveTextContent(/^10.000 sats$/);
    const panel = await openTask(cardId, "card-wallet-return");
    const address = sdk.fakeSparkAddress(`02${"cd".repeat(32)}`);
    await fireEvent.changeText(await panel.findByLabelText("Recipient", {}, SLOW), address);
    expect(await panel.findByText("Spark address", {}, SLOW)).toBeTruthy();
    // In sats, whatever unit it opened on.
    if (within(panel.getByTestId("send-unit")).queryByText("sats") === null) {
      await fireEvent.press(panel.getByTestId("send-unit"));
    }
    await fireEvent.changeText(panel.getByLabelText("Amount"), "4000");
    const send = panel.getByTestId("send-confirm");
    await waitFor(() => expect(send).toBeEnabled(), SLOW);
    signIn.mockClear();
    await fireEvent.press(send);
    expect(await panel.findByText("Payment sent", {}, SLOW)).toBeTruthy();
    expect(signIn).toHaveBeenCalledTimes(1);
    // A free Spark transfer of exactly that, from the card's wallet, never the main one.
    expect(sdk.fakeCardWallet(cardId).balanceSats).toBe(6_000n);
    const [payment] = sdk.fakeCardWallet(cardId).payments as { id: string }[];
    // Its note on a majority of the account's relays, at its payment's id: where it went.
    const read = await withCardAccess((access) => historySync.readCardHistory(access));
    expect(read.withdrawals.get(`${cardId}/${payment!.id}`)).toEqual({
      cardId,
      walletGeneration: 1,
      id: payment!.id,
      way: "spark"
    });
    await fireEvent.press(panel.getByTestId("send-done"));
    await waitFor(
      () => expect(screen.getByTestId("card-balance-sats")).toHaveTextContent(/^6.000 sats$/),
      SLOW
    );
  });

  it("sends nothing while the relays cannot note the withdrawal, then once when they can", async () => {
    const cardId = await pair();
    sdk.fakeCardWallet(cardId).balanceSats = 10_000n;
    expect(await balanceOf(cardId)).toHaveTextContent(/^10.000 sats$/);
    const panel = await openTask(cardId, "card-wallet-return");
    await fireEvent.changeText(
      await panel.findByLabelText("Recipient", {}, SLOW),
      sdk.fakeSparkAddress(`02${"cd".repeat(32)}`)
    );
    await panel.findByText("Spark address", {}, SLOW);
    if (within(panel.getByTestId("send-unit")).queryByText("sats") === null) {
      await fireEvent.press(panel.getByTestId("send-unit"));
    }
    await fireEvent.changeText(panel.getByLabelText("Amount"), "4000");
    const send = panel.getByTestId("send-confirm");
    await waitFor(() => expect(send).toBeEnabled(), SLOW);
    for (const url of currentRelays()) nostr.readOnly.add(url);
    await fireEvent.press(send);
    expect(await panel.findByTestId("send-failure", {}, SLOW)).toHaveTextContent(
      /Your account's relays did not answer: nothing was sent\./
    );
    // Nothing left the card.
    expect(sdk.fakeCardWallet(cardId).balanceSats).toBe(10_000n);
    expect(sdk.fakeCardWallet(cardId).payments).toEqual([]);
    expect(readLog().entries.map((entry) => entry.event)).toContain(
      "Recording the payment before it leaves failed"
    );

    nostr.readOnly.clear();
    await fireEvent.press(panel.getByTestId("send-confirm"));
    expect(await panel.findByText("Payment sent", {}, SLOW)).toBeTruthy();
    expect(sdk.fakeCardWallet(cardId).balanceSats).toBe(6_000n);
    expect(sdk.fakeCardWallet(cardId).payments).toHaveLength(1);
  });

  it("empties a merchant's card to any other wallet too, the main balance not held for it", async () => {
    const cardId = await pair();
    sdk.fakeCardWallet(cardId).balanceSats = 5_000n;
    expect(await balanceOf(cardId)).toHaveTextContent(/^5.000 sats$/);
    const connections = sdk.accountConnections.count;
    const panel = await openTask(cardId, "card-wallet-return");
    await drainTo(panel, sdk.fakeSparkAddress(`02${"cd".repeat(32)}`));
    // A free transfer: all of it received.
    expect(await panel.findByTestId("card-drain-received", {}, SLOW)).toHaveTextContent(
      /5.000 sats/
    );
    await fireEvent.press(panel.getByTestId("card-drain-confirm"));
    expect(await panel.findByTestId("card-drain-outcome", {}, SLOW)).toHaveTextContent(
      /5.000 sats withdrawn: the card is empty\.$/
    );
    expect(sdk.fakeCardWallet(cardId).balanceSats).toBe(0n);
    expect(sdk.accountConnections.count).toBe(connections);
    const [payment] = sdk.fakeCardWallet(cardId).payments as { id: string }[];
    const read = await withCardAccess((access) => historySync.readCardHistory(access));
    expect(read.withdrawals.get(`${cardId}/${payment!.id}`)).toMatchObject({ way: "spark" });
  });

  it('greys "Withdraw" in "Card" while nothing is on the card', async () => {
    const cardId = await pair();
    expect(await balanceOf(cardId)).toHaveTextContent(/^0 sats$/);
    expect(screen.getByTestId("card-wallet-return")).toBeDisabled();
    expect(screen.getByTestId("card-wallet-return")).toHaveTextContent(
      /WithdrawNothing to withdraw$/
    );
    // Its history still opens.
    expect(screen.getByTestId("card-history")).toBeEnabled();
  });

  it("shows the card's balance once read, its value at the hour's rate, what is on its way", async () => {
    setMockRate(100_000);
    const cardId = await pair();
    const wallet = sdk.fakeCardWallet(cardId);
    wallet.balanceSats = 12_000n;
    wallet.unclaimedDeposits = [arriving(10_000n)];
    const release = sdk.holdFirstSync();
    await open("/cards");
    // Never shown before it is read: neither its sats nor what moves them.
    expect(await screen.findByTestId("card-balance-reading", {}, SLOW)).toHaveTextContent(
      "Reading the balance…"
    );
    expect(screen.queryByTestId("card-balance-sats")).toBeNull();
    expect(screen.getByTestId("card-wallet-recharge")).toBeDisabled();
    expect(screen.getByTestId("card-wallet-return")).toBeDisabled();
    release();

    const sats = await screen.findByTestId("card-balance-sats", {}, SLOW);
    expect(sats).toHaveTextContent(/^12.000 sats$/);
    expect(sats.props.accessibilityLabel).toMatch(/^Card balance: 12.000 sats$/);
    // 1 BTC = 100,000 CHF, the point of sale's currency.
    expect(screen.getByTestId("card-balance-fiat")).toHaveTextContent(/^12.00 CHF$/);
    expect(screen.getByTestId("card-balance-pending")).toHaveTextContent(
      /^10.000 sats received on a Bitcoin address, not added to the balance yet$/
    );
    expect(screen.getByTestId("card-wallet-recharge")).toBeEnabled();
    expect(screen.getByTestId("card-wallet-return")).toBeEnabled();
    // Never the account's wallet: its own.
    expect(sdk.fakeWallet.balanceSats).toBe(0n);

    // The rate gone (an outage): the sats alone, never a former rate.
    await act(async () => setMockRate(undefined));
    expect(screen.queryByTestId("card-balance-fiat")).toBeNull();
    expect(screen.getByTestId("card-balance-sats")).toHaveTextContent(/^12.000 sats$/);
  });

  it("says when the card's wallet could not be read, then reads it again", async () => {
    const cardId = await pair();
    delete process.env.EXPO_PUBLIC_BREEZ_API_KEY;
    await open("/cards");
    await choose(cardId);
    expect(await screen.findByTestId("card-wallet-failed", {}, SLOW)).toHaveTextContent(
      /could not be read/
    );
    expect(screen.queryByTestId("card-balance-sats")).toBeNull();
    expect(screen.getByTestId("card-wallet-recharge")).toBeDisabled();

    process.env.EXPO_PUBLIC_BREEZ_API_KEY = "test-api-key";
    await fireEvent.press(screen.getByTestId("card-wallet-retry"));
    expect(await screen.findByTestId("card-balance-sats", {}, SLOW)).toHaveTextContent(/^0 sats$/);
    // Nothing to send back.
    expect(screen.getByTestId("card-wallet-return")).toBeDisabled();
  });

  /** Types `digits` on the panel's keypad, a key a digit. */
  async function typeOn(panel: ReturnType<typeof within>, digits: string) {
    for (const digit of digits) await fireEvent.press(panel.getByTestId(`key-${digit}`));
  }

  /** The panel of `cardId`'s "Top up", once the main balance was read. */
  async function rechargeOf(cardId: string) {
    const panel = await openTask(cardId, "card-wallet-recharge");
    await waitFor(() => expect(panel.queryByTestId("card-wallet-reading-main")).toBeNull(), SLOW);
    return panel;
  }

  it("recharges from the main balance on its keypad, never beyond it, after the passkey", async () => {
    setMockRate(100_000);
    sdk.fakeWallet.balanceSats = 50_000n;
    const cardId = await pair();
    sdk.fakeCardWallet(cardId).balanceSats = 3_000n;
    await open("/cards");
    const panel = await rechargeOf(cardId);
    // The main balance holds sats: the keypad, its source above it.
    expect(panel.getByTestId("card-wallet-amount-recharge")).toBeTruthy();
    expect(panel.getByRole("header")).toHaveTextContent("Top up");
    expect(panel.queryByTestId("sheet-back")).toBeNull();
    expect(panel.getByTestId("card-wallet-change").props.accessibilityLabel).toMatch(
      /^From my main balance, 50.000 sats available, Change$/
    );
    expect(panel.getByTestId("card-wallet-continue")).toBeDisabled();
    // Beyond it: said under the figure, nothing to go on with.
    await typeOn(panel, "60000");
    expect(panel.getByTestId("card-amount-sub")).toHaveTextContent(
      /^Your main balance does not cover this amount$/
    );
    expect(panel.getByTestId("card-wallet-continue")).toBeDisabled();
    for (let key = 0; key < 5; key++) await fireEvent.press(panel.getByTestId("key-del"));
    // Paid to the card since its panel read it: what it holds after is told from it now.
    sdk.fakeCardWallet(cardId).balanceSats = 3_500n;
    await typeOn(panel, "12000");
    expect(panel.getByTestId("card-amount").props.accessibilityLabel).toMatch(/^12.000 sats$/);
    expect(panel.getByTestId("card-amount-sub")).toHaveTextContent(/^12.00 CHF$/);
    await fireEvent.press(panel.getByTestId("card-wallet-continue"));

    // Shown again exactly: from where, to where, its fee, what the card holds after it.
    const confirm = within(await panel.findByTestId("card-wallet-confirm", {}, SLOW));
    expect(panel.getByRole("header")).toHaveTextContent("Confirm the top-up");
    // Its way back in the header, in place of "Cancel".
    expect(panel.getByTestId("sheet-back")).toBeTruthy();
    expect(confirm.getByLabelText(/^12.000 sats$/)).toBeTruthy();
    expect(confirm.getByText(/^12.00 CHF$/)).toBeTruthy();
    expect(confirm.getByText("My main balance")).toBeTruthy();
    expect(confirm.getByText(unnamed(cardId))).toBeTruthy();
    expect(confirm.getByTestId("card-mini", { includeHiddenElements: true })).toBeTruthy();
    expect(confirm.getByText("None")).toBeTruthy();
    expect(confirm.getByTestId("card-wallet-after")).toHaveTextContent(/^15.500 sats$/);
    // No "Cancel" under the passkey's button.
    expect(panel.queryByTestId("card-wallet-cancel")).toBeNull();
    expect(confirm.queryByText("Cancel")).toBeNull();
    expect(signIn).not.toHaveBeenCalled();
    expect(sdk.fakeWallet.balanceSats).toBe(50_000n);

    // Being sent: no way back, nor any close.
    const release = sdk.holdSends();
    await fireEvent.press(panel.getByTestId("card-wallet-send"));
    expect(await panel.findByTestId("card-wallet-working", {}, SLOW)).toBeTruthy();
    expect(panel.queryByTestId("sheet-back")).toBeNull();
    // Sent: the panel closes at once, a notification says it; "Cards" reads the card's balance
    // again.
    release();
    await transferSays(/^Card topped up with 12.000 sats$/);
    expect(signIn).toHaveBeenCalledTimes(1);
    expect(sdk.fakeWallet.balanceSats).toBe(38_000n);
    expect(sdk.fakeCardWallet(cardId).balanceSats).toBe(15_500n);
    await waitFor(
      () => expect(screen.getByTestId("card-balance-sats")).toHaveTextContent(/^15.500 sats$/),
      SLOW
    );
  });

  it("takes an amount in the account's currency while a rate is known, rounded up to the sat", async () => {
    setMockRate(85_000);
    sdk.fakeWallet.balanceSats = 50_000n;
    const cardId = await pair();
    await open("/cards");
    const panel = await rechargeOf(cardId);
    await fireEvent.press(panel.getByTestId("card-amount-unit-fiat"));
    await typeOn(panel, "2000");
    expect(panel.getByTestId("card-amount").props.accessibilityLabel).toMatch(/^20.00 CHF$/);
    // 20 CHF at 85,000 CHF a bitcoin: 23,529.41… sats, the next whole sat.
    expect(panel.getByTestId("card-amount-sub")).toHaveTextContent(/^23.530 sats$/);
    await fireEvent.press(panel.getByTestId("card-wallet-continue"));
    const confirm = within(await panel.findByTestId("card-wallet-confirm", {}, SLOW));
    expect(confirm.getByLabelText(/^23.530 sats$/)).toBeTruthy();
    expect(confirm.getByText(/^20.00 CHF$/)).toBeTruthy();
    // Back: the keypad again; a rate gone (an outage), sats alone, no unit to choose.
    await fireEvent.press(panel.getByTestId("sheet-back"));
    await act(async () => setMockRate(undefined));
    expect(await panel.findByTestId("card-wallet-amount-recharge")).toBeTruthy();
    expect(panel.queryByTestId("card-amount-unit")).toBeNull();
    expect(signIn).not.toHaveBeenCalled();
    expect(sdk.fakeWallet.balanceSats).toBe(50_000n);
  });

  it("asks the passkey again when dismissed, and retries a failed transfer: sent once", async () => {
    sdk.fakeWallet.balanceSats = 5_000n;
    const cardId = await pair();
    await open("/cards");
    const panel = await rechargeOf(cardId);
    await typeOn(panel, "1000");
    await fireEvent.press(panel.getByTestId("card-wallet-continue"));
    await panel.findByTestId("card-wallet-confirm", {}, SLOW);

    // Dismissed: the same confirmation, nothing said, nothing sent.
    signIn.mockRejectedValueOnce(new PasskeyError("cancelled", "Dismissed"));
    await fireEvent.press(panel.getByTestId("card-wallet-send"));
    await waitFor(() => expect(signIn).toHaveBeenCalledTimes(1));
    expect(await panel.findByTestId("card-wallet-send", {}, SLOW)).toBeTruthy();
    expect(panel.queryByTestId("card-wallet-send-failed")).toBeNull();
    expect(sdk.fakeWallet.balanceSats).toBe(5_000n);

    // The network failed: said on the same confirmation, which sends it once.
    sdk.fakeSend.sendError = new Error("Network down");
    await fireEvent.press(panel.getByTestId("card-wallet-send"));
    expect(await panel.findByTestId("card-wallet-send-failed", {}, SLOW)).toHaveTextContent(
      /it will only be sent once/
    );
    sdk.fakeSend.sendError = null;
    await fireEvent.press(panel.getByTestId("card-wallet-send"));
    await transferSays(/^Card topped up with 1.000 sats$/);
    expect(sdk.fakeWallet.balanceSats).toBe(4_000n);
    expect(sdk.fakeCardWallet(cardId).balanceSats).toBe(1_000n);
  });

  it("opens on the means of any other wallet when the main balance is empty, never saying so", async () => {
    const cardId = await pair();
    await open("/cards");
    const shared = jest
      .spyOn(Share, "share")
      .mockResolvedValue({ action: Share.sharedAction, activityType: undefined });
    const copied = jest.mocked(Clipboard.setStringAsync);
    const panel = await rechargeOf(cardId);
    // The card's Lightning address first.
    const address = await panel.findByTestId("card-wallet-code-text", {}, SLOW);
    expect(address).toHaveTextContent(/^sattleme[0-9a-f]{10}@breez\.tips$/);
    expect(panel.getByRole("header")).toHaveTextContent("Top up");
    expect(panel.queryByTestId("sheet-back")).toBeNull();
    expect(panel.queryByTestId("card-wallet-from-main")).toBeNull();
    expect(panel.queryByText(/empty/)).toBeNull();
    expect(
      panel.getByText(
        "The card's permanent Lightning address: share it, the amount sent is added to the card's balance."
      )
    ).toBeTruthy();
    await fireEvent.press(panel.getByTestId("card-wallet-copy"));
    await waitFor(() => expect(copied).toHaveBeenLastCalledWith(address.props.children));
    expect(await screen.findByText("Copied")).toBeTruthy();
    await fireEvent.press(panel.getByTestId("card-wallet-share"));
    expect(shared).toHaveBeenCalledWith({ message: address.props.children });
    // Nothing asked of the passkey, nothing left the main balance.
    expect(signIn).not.toHaveBeenCalled();
  });

  it("offers the main balance on top when it could not be read, then reads it again", async () => {
    sdk.fakeWallet.balanceSats = 20_000n;
    const cardId = await pair();
    // The account's wallet does not connect, neither with "Cards" nor its panel: its balance
    // unread, never taken for empty.
    sdk.fakeWallet.connectError = new Error("Network down");
    await open("/cards");
    const panel = await openTask(cardId, "card-wallet-recharge");
    expect(await panel.findByTestId("card-wallet-from-main", {}, SLOW)).toBeTruthy();
    expect(panel.getByText("or from any wallet")).toBeTruthy();
    expect(panel.getByTestId("card-wallet-code-text")).toHaveTextContent(/@breez\.tips$/);
    expect(panel.queryByText(/empty/)).toBeNull();
    sdk.fakeWallet.connectError = null;
    await fireEvent.press(panel.getByTestId("card-wallet-from-main"));
    expect(await panel.findByTestId("card-wallet-amount-recharge", {}, SLOW)).toBeTruthy();
  });

  it("offers the main balance on top when it is too slow to read, then its keypad once read", async () => {
    jest.useFakeTimers({ advanceTimers: true });
    try {
      sdk.fakeWallet.balanceSats = 20_000n;
      const cardId = await pair();
      await open("/cards");
      const release = sdk.holdAccountSync();
      const panel = await openTask(cardId, "card-wallet-recharge");
      expect(await panel.findByTestId("card-wallet-reading-main", {}, SLOW)).toHaveTextContent(
        "Reading your main balance…"
      );
      await act(async () => {
        await jest.advanceTimersByTimeAsync(MAIN_BALANCE_READ_MS);
      });
      expect(await panel.findByTestId("card-wallet-from-main", {}, SLOW)).toBeTruthy();
      expect(panel.queryByText(/empty/)).toBeNull();
      // Read at last, past its wait: its keypad, without asking again.
      release();
      expect(await panel.findByTestId("card-wallet-amount-recharge", {}, SLOW)).toBeTruthy();
      expect(panel.getByTestId("card-wallet-change").props.accessibilityLabel).toMatch(
        /20.000 sats available/
      );
      // The account's wallet stayed connected: its transfer needs no connection anew.
      const connections = sdk.connect.mock.calls.length;
      await typeOn(panel, "1000");
      await fireEvent.press(panel.getByTestId("card-wallet-continue"));
      expect(await panel.findByTestId("card-wallet-confirm", {}, SLOW)).toBeTruthy();
      expect(sdk.connect.mock.calls.length).toBe(connections);
    } finally {
      jest.useRealTimers();
    }
  });

  it('connects the account\'s wallet as "Cards" shows a card to recharge, let go once left', async () => {
    sdk.fakeWallet.balanceSats = 20_000n;
    const cardId = await pair();
    const { router } = await open("/cards");
    // Before "Top up" is pressed: synced meanwhile.
    await waitFor(() => expect(isAccountWalletOpen()).toBe(true), SLOW);
    const connections = accountConnections();
    const account = await sdkOf(null);
    const panel = await rechargeOf(cardId);
    expect(panel.getByTestId("card-wallet-change").props.accessibilityLabel).toMatch(
      /20.000 sats available/
    );
    // Its read needed no connection of its own; closed, the wallet stays: "Cards" shows.
    expect(accountConnections()).toBe(connections);
    await fireEvent.press(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByTestId("card-sheet")).toBeNull());
    expect(isAccountWalletOpen()).toBe(true);
    expect(account.disconnect).not.toHaveBeenCalled();

    // Another destination: disconnected, its keys gone with its SDK object.
    await fireEvent.press(screen.getByTestId("dock-slot-3"));
    await waitFor(() => expect(router.getPathname()).toBe("/settings"));
    await waitFor(() => expect(account.disconnect).toHaveBeenCalled(), SLOW);
    expect(isAccountWalletOpen()).toBe(false);
    // Back: connected again.
    await fireEvent.press(screen.getByTestId("dock-more"));
    await fireEvent.press(screen.getByTestId("more-cards"));
    await waitFor(() => expect(router.getPathname()).toBe("/cards"));
    await waitFor(() => expect(isAccountWalletOpen()).toBe(true), SLOW);
    expect(signIn).not.toHaveBeenCalled();
  });

  it("never connects the account's wallet for cards none of which can be recharged", async () => {
    // None: not opened for "Cards" (its background tasks' connections are not a screen's).
    await open("/cards");
    expect(await screen.findByTestId("cards-add", {}, SLOW)).toBeTruthy();
    expect(isAccountWalletOpen()).toBe(false);
    await screen.unmount();
    // A v2 card being migrated: its balance read, no "Top up" (its own test).
    const cardId = await migratingCard();
    sdk.fakeCardWallet(cardId).balanceSats = 40_000n;
    await open("/cards");
    expect(await screen.findByTestId("card-balance-sats", {}, SLOW)).toHaveTextContent(
      /^40.000 sats$/
    );
    expect(screen.queryByTestId("card-wallet-recharge")).toBeNull();
    expect(isAccountWalletOpen()).toBe(false);
  });

  it("says when the main balance could not be read again, its card's code smaller under it", async () => {
    sdk.fakeWallet.balanceSats = 20_000n;
    const cardId = await pair();
    sdk.fakeWallet.connectError = new Error("Network down");
    await open("/cards");
    const panel = await openTask(cardId, "card-wallet-recharge");
    expect(await panel.findByTestId("card-wallet-from-main", {}, SLOW)).toBeTruthy();
    // Not asked again yet: nothing said.
    expect(panel.queryByTestId("card-wallet-main-unread")).toBeNull();
    const width = () => StyleSheet.flatten(panel.getByTestId("card-wallet-code").props.style).width;
    const under = width();
    // Asked again, unread again: said, never silent.
    await fireEvent.press(panel.getByTestId("card-wallet-from-main"));
    expect(await panel.findByTestId("card-wallet-main-unread", {}, SLOW)).toHaveTextContent(
      "Your main balance could not be read. Try again in a moment.",
      { exact: false }
    );
    // Read at last, empty: the means alone, the code at its full size.
    sdk.fakeWallet.connectError = null;
    sdk.fakeWallet.balanceSats = 0n;
    await fireEvent.press(panel.getByTestId("card-wallet-from-main"));
    await waitFor(() => expect(panel.queryByTestId("card-wallet-from-main")).toBeNull(), SLOW);
    expect(panel.queryByTestId("card-wallet-main-unread")).toBeNull();
    expect(await panel.findByTestId("card-wallet-code", {}, SLOW)).toBeTruthy();
    expect(width()).toBeGreaterThan(under);
  });

  it("keeps what was typed on each keypad when a step goes back to it", async () => {
    sdk.fakeWallet.balanceSats = 50_000n;
    const cardId = await pair();
    sdk.fakeCardWallet(cardId).balanceSats = 9_000n;
    await open("/cards");
    const panel = await rechargeOf(cardId);
    await typeOn(panel, "3500");
    // Back from its confirmation (the header's way back): the amount as typed.
    await fireEvent.press(panel.getByTestId("card-wallet-continue"));
    await panel.findByTestId("card-wallet-confirm", {}, SLOW);
    await fireEvent.press(panel.getByTestId("sheet-back"));
    expect(await panel.findByTestId("card-wallet-amount-recharge")).toBeTruthy();
    expect(panel.getByRole("header")).toHaveTextContent("Top up");
    expect(panel.getByTestId("card-amount").props.accessibilityLabel).toMatch(/^3.500 sats$/);
    // An invoice's amount, back from its invoice.
    await fireEvent.press(panel.getByTestId("card-wallet-change"));
    await fireEvent.press(await panel.findByTestId("card-wallet-invoice", {}, SLOW));
    await typeOn(panel, "4200");
    await fireEvent.press(panel.getByTestId("card-wallet-invoice-create"));
    await panel.findByTestId("card-wallet-invoice-code", {}, SLOW);
    await fireEvent.press(panel.getByTestId("sheet-back"));
    expect(await panel.findByTestId("card-wallet-amount-invoice")).toBeTruthy();
    expect(panel.getByTestId("card-amount").props.accessibilityLabel).toMatch(/^4.200 sats$/);
    // Back to the other means, then to the main balance's keypad: its amount as typed.
    await fireEvent.press(panel.getByTestId("sheet-back"));
    expect(await panel.findByTestId("card-wallet-other")).toBeTruthy();
    await fireEvent.press(panel.getByTestId("sheet-back"));
    expect(await panel.findByTestId("card-wallet-amount-recharge")).toBeTruthy();
    expect(panel.getByTestId("card-amount").props.accessibilityLabel).toMatch(/^3.500 sats$/);
    await fireEvent.press(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByTestId("card-sheet")).toBeNull());

    // "Withdraw", its amount kept the same way.
    const back = await openReturn(cardId);
    await typeOn(back, "2000");
    await fireEvent.press(back.getByTestId("card-wallet-continue"));
    await back.findByTestId("card-wallet-confirm", {}, SLOW);
    await fireEvent.press(back.getByTestId("sheet-back"));
    expect(await back.findByTestId("card-wallet-amount-return")).toBeTruthy();
    expect(back.getByTestId("card-amount").props.accessibilityLabel).toMatch(/^2.000 sats$/);
    // Closed from its confirmation: nothing sent.
    await fireEvent.press(back.getByTestId("card-wallet-continue"));
    await back.findByTestId("card-wallet-confirm", {}, SLOW);
    await fireEvent.press(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByTestId("card-sheet")).toBeNull());
    expect(signIn).not.toHaveBeenCalled();
    expect(sdk.fakeWallet.balanceSats).toBe(50_000n);
    expect(sdk.fakeCardWallet(cardId).balanceSats).toBe(9_000n);
  });

  it("says when the card's Lightning address could not be read, then reads it again", async () => {
    const cardId = await pair();
    await open("/cards");
    await choose(cardId);
    await waitFor(() => expect(screen.getByTestId("card-wallet-recharge")).toBeEnabled(), SLOW);
    const card = await sdkOf(cardId);
    card.getLightningAddress!.mockRejectedValueOnce(new Error("Service unavailable"));
    await fireEvent.press(screen.getByTestId("card-wallet-recharge"));
    const panel = within(await screen.findByTestId("card-sheet"));
    expect(await panel.findByTestId("card-wallet-address-failed", {}, SLOW)).toBeTruthy();
    expect(panel.queryByTestId("card-wallet-code")).toBeNull();
    // The other means stay offered meanwhile.
    expect(panel.getByTestId("card-wallet-invoice")).toBeTruthy();
    await fireEvent.press(panel.getByTestId("card-wallet-address-retry"));
    expect(await panel.findByTestId("card-wallet-code-text", {}, SLOW)).toHaveTextContent(
      /@breez\.tips$/
    );
  });

  it("never fixes an amount in the account's currency without a rate", async () => {
    setMockRate(100_000);
    sdk.fakeWallet.balanceSats = 50_000n;
    const cardId = await pair();
    await open("/cards");
    const panel = await rechargeOf(cardId);
    await fireEvent.press(panel.getByTestId("card-amount-unit-fiat"));
    await typeOn(panel, "1000");
    expect(panel.getByTestId("card-wallet-continue")).toBeEnabled();
    // The rate gone (an outage): no amount, nothing to go on with, the reason said.
    await act(async () => setMockRate(undefined));
    expect(panel.getByTestId("card-amount-sub")).toHaveTextContent(
      "Bitcoin price unavailable. Check your internet connection."
    );
    expect(panel.getByTestId("card-wallet-continue")).toBeDisabled();
  });

  it("says what the main balance holds when it fell short as the transfer was prepared", async () => {
    sdk.fakeWallet.balanceSats = 50_000n;
    const cardId = await pair();
    await open("/cards");
    const panel = await rechargeOf(cardId);
    // Spent elsewhere since it was read.
    sdk.fakeWallet.balanceSats = 2_000n;
    await typeOn(panel, "3000");
    await fireEvent.press(panel.getByTestId("card-wallet-continue"));
    await waitFor(
      () =>
        expect(panel.getByTestId("card-wallet-change").props.accessibilityLabel).toMatch(
          /2.000 sats available/
        ),
      SLOW
    );
    expect(panel.getByTestId("card-amount-sub")).toHaveTextContent(
      "Your main balance does not cover this amount"
    );
    expect(panel.getByTestId("card-wallet-continue")).toBeDisabled();
    expect(panel.getByTestId("card-amount").props.accessibilityLabel).toMatch(/^3.000 sats$/);
    expect(signIn).not.toHaveBeenCalled();
  });

  it('says when a transfer could not be prepared, "Back" going back to its keypad', async () => {
    sdk.fakeWallet.balanceSats = 50_000n;
    const cardId = await pair();
    await open("/cards");
    const panel = await rechargeOf(cardId);
    const account = await sdkOf(null);
    account.prepareSendPayment!.mockRejectedValueOnce(new Error("Service unavailable"));
    await typeOn(panel, "1500");
    await fireEvent.press(panel.getByTestId("card-wallet-continue"));
    expect(await panel.findByTestId("card-wallet-error", {}, SLOW)).toBeTruthy();
    await fireEvent.press(panel.getByTestId("card-wallet-back"));
    expect(await panel.findByTestId("card-wallet-amount-recharge")).toBeTruthy();
    expect(panel.getByTestId("card-amount").props.accessibilityLabel).toMatch(/^1.500 sats$/);
    expect(sdk.fakeWallet.balanceSats).toBe(50_000n);
  });

  it("says what is left on the card without a rate, and when nothing is left to send back", async () => {
    const cardId = await pair();
    sdk.fakeCardWallet(cardId).balanceSats = 5_000n;
    await open("/cards");
    const panel = await openReturn(cardId);
    // Without a rate: the sats alone.
    await typeOn(panel, "1200");
    expect(panel.getByTestId("card-amount-sub")).toHaveTextContent(
      /^3.800 sats will stay on the card$/
    );
    await fireEvent.press(panel.getByTestId("card-wallet-empty"));
    expect(panel.getByTestId("card-amount-sub")).toHaveTextContent(/^The card's whole balance$/);
    // Spent meanwhile (a payment at a point of sale): nothing to send back, said.
    sdk.fakeCardWallet(cardId).balanceSats = 0n;
    await fireEvent.press(panel.getByTestId("card-wallet-continue"));
    await transferSays(/^This card holds nothing to withdraw$/, "warning");
    expect(signIn).not.toHaveBeenCalled();
  });

  it('goes to another wallet with "Change", and back to the keypad', async () => {
    sdk.fakeWallet.balanceSats = 20_000n;
    const cardId = await pair();
    await open("/cards");
    const panel = await rechargeOf(cardId);
    await fireEvent.press(panel.getByTestId("card-wallet-change"));
    expect(await panel.findByTestId("card-wallet-other")).toBeTruthy();
    expect(panel.getByRole("header")).toHaveTextContent("Another wallet");
    expect(panel.queryByTestId("card-wallet-from-main")).toBeNull();
    await fireEvent.press(panel.getByTestId("sheet-back"));
    expect(await panel.findByTestId("card-wallet-amount-recharge")).toBeTruthy();
    expect(panel.getByRole("header")).toHaveTextContent("Top up");
    expect(panel.queryByTestId("sheet-back")).toBeNull();
  });

  it("makes an invoice payable 24 hours, and says its payment as soon as the card has it", async () => {
    setMockRate(100_000);
    const cardId = await pair();
    await open("/cards");
    const panel = await rechargeOf(cardId);
    await fireEvent.press(await panel.findByTestId("card-wallet-invoice", {}, SLOW));
    expect(panel.getByRole("header")).toHaveTextContent("Lightning invoice");
    expect(panel.getByTestId("sheet-back")).toBeTruthy();
    await typeOn(panel, "25000");
    await fireEvent.press(panel.getByTestId("card-wallet-invoice-create"));

    const text = await panel.findByTestId("card-wallet-code-text", {}, SLOW);
    const [invoice] = sdk.fakeCardWallet(cardId).invoices;
    expect(text.props.accessibilityLabel).toBe(invoice);
    expect(text).toHaveTextContent(`${invoice!.slice(0, 17)}…${invoice!.slice(-7)}`);
    // Payable 24 hours, as it says itself.
    expect(decodeBolt11(invoice!)).toMatchObject({
      amountMsat: 25_000_000n,
      expirySeconds: 86_400
    });
    expect(panel.getByLabelText(/^25.000 sats$/)).toBeTruthy();
    expect(panel.getByText(/^25.00 CHF$/)).toBeTruthy();
    expect(panel.getByText("Waiting for the payment…")).toBeTruthy();
    expect(panel.getByText(/^Payable once, from any Lightning wallet, until .+\.$/)).toBeTruthy();

    // Paid from another wallet: said at the card wallet's next look, of this very invoice.
    expect(sdk.settleReceivedInvoice(invoice!)).toBe(true);
    const paid = await panel.findByTestId("card-wallet-invoice-paid", {}, SLOW);
    expect(paid).toHaveTextContent(/Invoice paid/);
    expect(within(paid).getByLabelText(/^\+25.000 sats$/)).toBeTruthy();
    expect(paid).toHaveTextContent(/added to the card's balance/);
    await fireEvent.press(panel.getByTestId("card-wallet-finish"));
    await waitFor(
      () => expect(screen.getByTestId("card-balance-sats")).toHaveTextContent(/^25.000 sats$/),
      SLOW
    );
  });

  it("says when an invoice expired: nobody can pay it any more, a new one is a tap away", async () => {
    jest.useFakeTimers({ advanceTimers: true });
    try {
      const cardId = await pair();
      await open("/cards");
      const panel = await rechargeOf(cardId);
      await fireEvent.press(await panel.findByTestId("card-wallet-invoice", {}, SLOW));
      await typeOn(panel, "5000");
      await fireEvent.press(panel.getByTestId("card-wallet-invoice-create"));
      await panel.findByTestId("card-wallet-invoice-code", {}, SLOW);
      // A day later, unpaid.
      jest.setSystemTime(Date.now() + 24 * 3600 * 1000 + 1000);
      await act(async () => {
        await jest.advanceTimersByTimeAsync(CARD_INVOICE_POLL_MS);
      });
      const expired = await panel.findByTestId("card-wallet-invoice-expired", {}, SLOW);
      expect(expired).toHaveTextContent(/Invoice expired/);
      expect(expired).toHaveTextContent(/It was not paid before .+: no one can pay it any more\./);
      await fireEvent.press(panel.getByTestId("card-wallet-invoice-new"));
      expect(await panel.findByTestId("card-wallet-amount-invoice")).toBeTruthy();
    } finally {
      jest.useRealTimers();
    }
  });

  it("never says an invoice expired on a wrong clock: its time counted on this device", async () => {
    jest.useFakeTimers({ advanceTimers: true });
    try {
      const cardId = await pair();
      await open("/cards");
      const panel = await rechargeOf(cardId);
      // Dated 25 hours before this device's clock (the clock set ahead by hand): by its own times,
      // it would be past its validity as soon as made.
      sdk.fakeCardWallet(cardId).invoiceClockSkewSecs = 25 * 3600;
      await fireEvent.press(await panel.findByTestId("card-wallet-invoice", {}, SLOW));
      await typeOn(panel, "5000");
      await fireEvent.press(panel.getByTestId("card-wallet-invoice-create"));
      expect(await panel.findByTestId("card-wallet-invoice-code", {}, SLOW)).toBeTruthy();
      await act(async () => {
        await jest.advanceTimersByTimeAsync(2 * CARD_INVOICE_POLL_MS);
      });
      expect(panel.getByTestId("card-wallet-invoice-code")).toBeTruthy();
      expect(panel.queryByTestId("card-wallet-invoice-expired")).toBeNull();
      expect(panel.getByText("Waiting for the payment…")).toBeTruthy();
    } finally {
      jest.useRealTimers();
    }
  });

  it("gives a new Bitcoin address of the card, and what a deposit to it implies", async () => {
    const cardId = await pair();
    await open("/cards");
    const panel = await rechargeOf(cardId);
    await fireEvent.press(await panel.findByTestId("card-wallet-onchain", {}, SLOW));
    expect(panel.getByRole("header")).toHaveTextContent("Bitcoin address");
    const text = await panel.findByTestId("card-wallet-code-text", {}, SLOW);
    const address = text.props.accessibilityLabel as string;
    expect(address).toMatch(/^bc1p/);
    // In two lines, to be checked by halves.
    const half = Math.ceil(address.length / 2);
    expect(text.props.children).toBe(`${address.slice(0, half)}\n${address.slice(half)}`);
    const facts = panel.getByTestId("card-wallet-onchain-code");
    expect(facts).toHaveTextContent(/after 1 to 3 confirmations, up to about thirty minutes/);
    expect(facts).toHaveTextContent(/Fee: 300 sats at most, deducted\./);
    expect(facts).toHaveTextContent(/when you open the card in “Cards”/);
    await fireEvent.press(panel.getByTestId("sheet-back"));
    expect(await panel.findByTestId("card-wallet-other")).toBeTruthy();
    expect(signIn).not.toHaveBeenCalled();
  });

  it("never shows an answer that comes once its step was left", async () => {
    const cardId = await pair();
    await open("/cards");
    const panel = await rechargeOf(cardId);
    await fireEvent.press(await panel.findByTestId("card-wallet-invoice", {}, SLOW));
    await typeOn(panel, "5000");
    const release = sdk.holdReceives();
    await fireEvent.press(panel.getByTestId("card-wallet-invoice-create"));
    // Back to the other means while the invoice is being made.
    await fireEvent.press(panel.getByTestId("sheet-back"));
    expect(await panel.findByTestId("card-wallet-other")).toBeTruthy();
    release();
    await waitFor(() => expect(sdk.fakeCardWallet(cardId).invoices).toHaveLength(1));
    // The invoice's answer lands (promises only, no timer: this file's clock is the router's).
    await act(async () => {
      for (let turn = 0; turn < 100; turn++) await Promise.resolve();
    });
    expect(panel.queryByTestId("card-wallet-invoice-code")).toBeNull();
    expect(panel.getByTestId("card-wallet-other")).toBeTruthy();
    expect(panel.getByRole("header")).toHaveTextContent("Top up");
  });

  it("reads the card's balance again as its transfer closes its panel", async () => {
    const cardId = await pair();
    sdk.fakeCardWallet(cardId).balanceSats = 7_777n;
    expect(await balanceOf(cardId)).toHaveTextContent(/^7.777 sats$/);
    const panel = await openReturn(cardId);
    await emptyCard(panel);
    await transferSays(/^7.777 sats withdrawn to your main balance$/);
    await waitFor(
      () => expect(screen.getByTestId("card-balance-sats")).toHaveTextContent(/^0 sats$/),
      SLOW
    );
    expect(screen.getByTestId("card-wallet-return")).toBeDisabled();
  });

  it("lets the card's wallet go while another destination shows, then reads it again", async () => {
    jest.useFakeTimers({ advanceTimers: true });
    try {
      const cardId = await pair();
      const { router } = await open("/cards");
      await choose(cardId);
      expect(await screen.findByTestId("card-balance-sats", {}, SLOW)).toHaveTextContent(
        /^0 sats$/
      );
      // The card wallet's SDK object: the last connection made with a card's storage.
      const storages = sdk.connect.mock.calls.map(
        (call) => (call[0] as { storageDir?: string } | undefined)?.storageDir ?? ""
      );
      const at = storages.findLastIndex((dir) => dir.includes("/breez-sdk-spark-cards/"));
      const wallet = (await sdk.connect.mock.results[at]!.value) as Record<string, jest.Mock>;
      const connections = sdk.connect.mock.calls.length;

      await fireEvent.press(screen.getByTestId("dock-slot-3"));
      await waitFor(() => expect(router.getPathname()).toBe("/settings"));
      await waitFor(() => expect(wallet.disconnect).toHaveBeenCalled(), SLOW);
      const reads = wallet.getInfo.mock.calls.length;
      await act(async () => {
        await jest.advanceTimersByTimeAsync(4 * WALLET_REFRESH_MS);
      });
      expect(wallet.getInfo.mock.calls.length).toBe(reads);
      expect(sdk.connect.mock.calls.length).toBe(connections);

      // Back: connected again, what reached it meanwhile read.
      sdk.fakeCardWallet(cardId).balanceSats = 3_300n;
      await fireEvent.press(screen.getByTestId("dock-more"));
      await fireEvent.press(screen.getByTestId("more-cards"));
      await waitFor(() => expect(router.getPathname()).toBe("/cards"));
      await waitFor(
        () => expect(screen.getByTestId("card-balance-sats")).toHaveTextContent(/^3.300 sats$/),
        SLOW
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it("follows what reaches the card as its SDK says so, never on a timer", async () => {
    // Its clock in the test's hands (each step of real time advances it too).
    jest.useFakeTimers({ advanceTimers: true });
    try {
      const cardId = await pair();
      expect(await balanceOf(cardId)).toHaveTextContent(/^0 sats$/);
      const wallet = await sdkOf(cardId);
      await waitFor(() => expect(sdk.sdkListenerCount(sdk.fakeCardWallet(cardId))).toBe(1), SLOW);
      const reads = wallet.getInfo!.mock.calls.length;
      // Stored meanwhile, its SDK silent: nothing read again, however long.
      sdk.fakeCardWallet(cardId).balanceSats = 2_100n;
      await act(async () => {
        await jest.advanceTimersByTimeAsync(4 * WALLET_REFRESH_MS);
      });
      expect(wallet.getInfo!.mock.calls.length).toBe(reads);
      expect(screen.getByTestId("card-balance-sats")).toHaveTextContent(/^0 sats$/);
      // Its SDK synced: read again at once.
      await sdkSays(cardId);
      await waitFor(
        () => expect(screen.getByTestId("card-balance-sats")).toHaveTextContent(/^2.100 sats$/),
        SLOW
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('keeps the card\'s balance shown as "Top up" closes, reading it again', async () => {
    const cardId = await pair();
    sdk.fakeCardWallet(cardId).balanceSats = 4_200n;
    expect(await balanceOf(cardId)).toHaveTextContent(/^4.200 sats$/);
    const wallet = await sdkOf(cardId);
    const panel = await rechargeOf(cardId);
    expect(await panel.findByTestId("card-wallet-other", {}, SLOW)).toBeTruthy();
    const syncs = wallet.syncWallet!.mock.calls.length;
    // Paid meanwhile: read again as it closes, its wallet slow to sync, what it showed shown until
    // then.
    sdk.fakeCardWallet(cardId).balanceSats = 5_200n;
    const release = sdk.holdFirstSync();
    await fireEvent.press(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByTestId("card-sheet")).toBeNull(), SLOW);
    await waitFor(() => expect(wallet.syncWallet!.mock.calls.length).toBeGreaterThan(syncs), SLOW);
    expect(screen.queryByTestId("card-balance-reading")).toBeNull();
    expect(screen.getByTestId("card-balance-sats")).toHaveTextContent(/^4.200 sats$/);
    release();
    await waitFor(
      () => expect(screen.getByTestId("card-balance-sats")).toHaveTextContent(/^5.200 sats$/),
      SLOW
    );
    expect(screen.queryByTestId("card-balance-reading")).toBeNull();
  });

  /** A Lightning payment of `amount` the card's wallet received, completed, as the bindings give it. */
  function receipt(id: string, amount: bigint): Record<string, unknown> {
    return {
      id,
      paymentType: sdk.PaymentType.Receive,
      status: sdk.PaymentStatus.Completed,
      amount,
      fees: 0n,
      timestamp: BigInt(Math.floor(Date.now() / 1000)),
      method: sdk.PaymentMethod.Lightning,
      details: {
        tag: sdk.PaymentDetails_Tags.Lightning,
        inner: {
          description: undefined,
          invoice: "lnbc1fake",
          htlcDetails: { paymentHash: "e".repeat(64), preimage: undefined }
        }
      }
    };
  }

  /** The notifications shown. */
  function notices() {
    return screen.queryAllByTestId("notification");
  }

  it('tells each payment a card receives while "Cards" shows it, once', async () => {
    jest.useFakeTimers({ advanceTimers: true });
    try {
      const [first, second] = await twoCards();
      // What it had before "Cards" showed: its balance says it, no notice.
      const wallet = sdk.fakeCardWallet(second);
      wallet.balanceSats = 500n;
      wallet.payments = [receipt("before", 500n)];
      await open("/cards");
      await walletRead(first);
      await walletRead(second);
      await sdkSays(second);
      expect(notices()).toHaveLength(0);

      // Paid to its Lightning address: told from its SDK's event, before its storage is listed.
      const paid = receipt("paid", 2_100n);
      wallet.balanceSats += 2_100n;
      await sdkSays(second, paid);
      // Its amount, then the card it reached.
      await waitFor(() => expect(notices()).toHaveLength(1), SLOW);
      expect(notices()[0]).toHaveTextContent(new RegExp(`2.100 sats received${unnamed(second)}$`));
      // Its balance moved too.
      await choose(second);
      expect(screen.getByTestId("card-balance-sats")).toHaveTextContent(/^2.600 sats$/);
      await act(async () => {
        await jest.advanceTimersByTimeAsync(NOTIFICATION_DURATION);
      });
      await waitFor(() => expect(notices()).toHaveLength(0), SLOW);

      // Told once: its storage listing it, read again on its next event, no notice anew.
      wallet.payments = [paid, ...wallet.payments];
      await sdkSays(second);
      await sdkSays(second, paid);
      expect(notices()).toHaveLength(0);

      // One its SDK told no event of (claimed by another device: only its storage has it): told as
      // a read finds it.
      wallet.balanceSats += 400n;
      wallet.payments = [receipt("elsewhere", 400n), ...wallet.payments];
      await sdkSays(second);
      await waitFor(() => expect(notices()).toHaveLength(1), SLOW);
      expect(notices()[0]).toHaveTextContent(new RegExp(`400 sats received${unnamed(second)}$`));
      expect(screen.getByTestId("card-balance-sats")).toHaveTextContent(/^3.000 sats$/);
    } finally {
      jest.useRealTimers();
    }
  });

  it("tells a payment and shows its balance as soon as the card's SDK says so, not 15 s later", async () => {
    // Its clock in the test's hands: never 15 s (WALLET_REFRESH_MS) here.
    jest.useFakeTimers({ advanceTimers: true });
    try {
      const cardId = await pair();
      const wallet = sdk.fakeCardWallet(cardId);
      const { router } = await open("/cards");
      await choose(cardId);
      await walletRead(cardId);
      // Listening once its first read ended.
      await waitFor(() => expect(sdk.sdkListenerCount(wallet)).toBe(1), SLOW);
      const startedAt = Date.now();

      // Paid to its Lightning address: the SDK stores it, then says so.
      const paid = receipt("paid", 3_300n);
      wallet.balanceSats = 3_300n;
      wallet.payments = [paid];
      await act(async () => {
        await sdk.emitSdkEvent(wallet, sdk.SdkEvent_Tags.PaymentPending, paid);
        await sdk.emitSdkEvent(wallet, sdk.SdkEvent_Tags.PaymentSucceeded, paid);
        await sdk.emitSdkEvent(wallet, sdk.SdkEvent_Tags.Synced);
      });
      await waitFor(() => expect(notices()).toHaveLength(1), SLOW);
      expect(notices()[0]).toHaveTextContent(new RegExp(`3.300 sats received${unnamed(cardId)}$`));
      await waitFor(
        () => expect(screen.getByTestId("card-balance-sats")).toHaveTextContent(/^3.300 sats$/),
        SLOW
      );
      expect(Date.now() - startedAt).toBeLessThan(WALLET_REFRESH_MS);

      // Another destination: its wallet let go, its listener with it.
      await fireEvent.press(screen.getByTestId("dock-slot-3"));
      await waitFor(() => expect(router.getPathname()).toBe("/settings"));
      await waitFor(() => expect(sdk.sdkListenerCount(wallet)).toBe(0), SLOW);
    } finally {
      jest.useRealTimers();
    }
  });

  it("reads the card's wallet on a timer only while its SDK refuses to be listened to", async () => {
    jest.useFakeTimers({ advanceTimers: true });
    const cardId = await pair();
    const connect = sdk.connect.getMockImplementation()!;
    sdk.connect.mockImplementation(async (request?: unknown) => {
      const connected = (await connect(request)) as Record<string, jest.Mock>;
      const dir = (request as { storageDir?: string } | undefined)?.storageDir ?? "";
      if (dir.includes(`/breez-sdk-spark-cards/${cardId}/`)) {
        connected.addEventListener!.mockRejectedValue(new Error("listener refused"));
      }
      return connected;
    });
    try {
      expect(await balanceOf(cardId)).toHaveTextContent(/^0 sats$/);
      await waitFor(
        () =>
          expect(readLog().entries.map((entry) => entry.event)).toContain(
            "Listening to a card's wallet failed"
          ),
        SLOW
      );
      // Paid meanwhile: no event comes, the timer reads it.
      const wallet = sdk.fakeCardWallet(cardId);
      wallet.balanceSats = 700n;
      wallet.payments = [receipt("paid", 700n)];
      await act(async () => {
        await jest.advanceTimersByTimeAsync(WALLET_REFRESH_MS);
      });
      await waitFor(
        () => expect(screen.getByTestId("card-balance-sats")).toHaveTextContent(/^700 sats$/),
        SLOW
      );
      await waitFor(() => expect(notices()).toHaveLength(1), SLOW);
    } finally {
      sdk.connect.mockImplementation(connect);
      jest.useRealTimers();
    }
  });

  it("shows the card's balance when its payments cannot be listed, telling none", async () => {
    const cardId = await pair();
    const wallet = sdk.fakeCardWallet(cardId);
    wallet.listError = new Error("storage unreadable");
    expect(await balanceOf(cardId)).toHaveTextContent(/^0 sats$/);
    wallet.balanceSats = 900n;
    wallet.payments = [receipt("paid", 900n)];
    await sdkSays(cardId);
    await waitFor(
      () => expect(screen.getByTestId("card-balance-sats")).toHaveTextContent(/^900 sats$/),
      SLOW
    );
    expect(notices()).toHaveLength(0);
    expect(readLog().entries.map((entry) => entry.event)).toContain(
      "Reading a card's receipts failed"
    );
  });

  /** How many times the wallet of `cardId` was connected. */
  function cardConnections(cardId: string): number {
    return sdk.connect.mock.calls.filter((call) =>
      ((call[0] as { storageDir?: string } | undefined)?.storageDir ?? "").includes(
        `/breez-sdk-spark-cards/${cardId}/`
      )
    ).length;
  }

  /** The account's two cards, in the order "Cards" shows them. */
  async function twoCards(): Promise<[string, string]> {
    const ids = [await pair(), await pair(new FakeNtag424("04a39493cc8680"))].sort();
    return [ids[0]!, ids[1]!];
  }

  /** Once the wallet of `cardId` was connected and read to its end (readCardWallet). */
  async function walletRead(cardId: string) {
    await waitFor(() => expect(cardConnections(cardId)).toBe(1), SLOW);
    const wallet = await sdkOf(cardId);
    await waitFor(() => expect(wallet.listUnclaimedDeposits).toHaveBeenCalled(), SLOW);
    await act(async () => undefined);
    return wallet;
  }

  it('reads every card\'s balance as "Cards" shows, a card chosen showing its own at once', async () => {
    // The day's record of a chosen card's movements reads its wallet on its own (history-sync.ts,
    // its own tests): left out of what is counted here.
    const daily = jest.spyOn(historySync, "recordCardMovementsDaily").mockResolvedValue();
    try {
      const [first, second] = await twoCards();
      sdk.fakeCardWallet(first).balanceSats = 1_100n;
      sdk.fakeCardWallet(second).balanceSats = 2_200n;
      const { router } = await open("/cards");
      expect(await screen.findByTestId("card-balance-sats", {}, SLOW)).toHaveTextContent(
        /^1.100 sats$/
      );
      // The other card's wallet connected and read meanwhile, never chosen.
      const firstWallet = await walletRead(first);
      const secondWallet = await walletRead(second);
      const connections = sdk.connect.mock.calls.length;
      const reads = [firstWallet.getInfo.mock.calls.length, secondWallet.getInfo.mock.calls.length];

      // Chosen: its balance at once, never "Reading the balance…", nothing connected nor read again.
      await choose(second);
      expect(screen.queryByTestId("card-balance-reading")).toBeNull();
      expect(screen.getByTestId("card-balance-sats")).toHaveTextContent(/^2.200 sats$/);
      expect(screen.getByTestId("card-wallet-return")).toBeEnabled();
      await choose(first);
      expect(screen.queryByTestId("card-balance-reading")).toBeNull();
      expect(screen.getByTestId("card-balance-sats")).toHaveTextContent(/^1.100 sats$/);
      await choose(second);
      expect(screen.getByTestId("card-balance-sats")).toHaveTextContent(/^2.200 sats$/);
      expect(sdk.connect.mock.calls.length).toBe(connections);
      expect([
        firstWallet.getInfo.mock.calls.length,
        secondWallet.getInfo.mock.calls.length
      ]).toEqual(reads);
      expect(firstWallet.disconnect).not.toHaveBeenCalled();
      expect(secondWallet.disconnect).not.toHaveBeenCalled();

      // Another destination: every card's wallet let go.
      await fireEvent.press(screen.getByTestId("dock-slot-3"));
      await waitFor(() => expect(router.getPathname()).toBe("/settings"));
      await waitFor(() => expect(firstWallet.disconnect).toHaveBeenCalled(), SLOW);
      await waitFor(() => expect(secondWallet.disconnect).toHaveBeenCalled(), SLOW);
    } finally {
      daily.mockRestore();
    }
  });

  it("reads the balance of the card whose panel moved sats, the other card's kept as read", async () => {
    const [first, second] = await twoCards();
    sdk.fakeCardWallet(first).balanceSats = 1_100n;
    sdk.fakeCardWallet(second).balanceSats = 5_000n;
    await open("/cards");
    const firstWallet = await walletRead(first);
    await walletRead(second);
    const panel = await openReturn(second);
    const reads = firstWallet.getInfo.mock.calls.length;
    await emptyCard(panel);
    await transferSays(/^5.000 sats withdrawn to your main balance$/);
    await waitFor(
      () => expect(screen.getByTestId("card-balance-sats")).toHaveTextContent(/^0 sats$/),
      SLOW
    );
    // The other card's wallet neither read again nor let go: its balance shown at once.
    expect(firstWallet.getInfo.mock.calls.length).toBe(reads);
    await choose(first);
    expect(screen.getByTestId("card-balance-sats")).toHaveTextContent(/^1.100 sats$/);
    expect(firstWallet.disconnect).not.toHaveBeenCalled();
  });

  it("reads again the wallet of a card that could not be read, the other card's staying connected", async () => {
    const [first, second] = await twoCards();
    sdk.fakeCardWallet(first).balanceSats = 1_100n;
    sdk.fakeCardWallet(second).balanceSats = 2_200n;
    // The second card's wallet does not connect, until "Try again".
    const connect = sdk.connect.getMockImplementation()!;
    let refused = true;
    sdk.connect.mockImplementation(async (request?: unknown) => {
      const dir = (request as { storageDir?: string } | undefined)?.storageDir ?? "";
      if (refused && dir.includes(`/breez-sdk-spark-cards/${second}/`)) {
        throw new Error("Spark operators unreachable");
      }
      return connect(request);
    });
    try {
      await open("/cards");
      const firstWallet = await walletRead(first);
      await waitFor(() => expect(cardConnections(second)).toBe(1), SLOW);
      await choose(second);
      expect(await screen.findByTestId("card-wallet-failed", {}, SLOW)).toHaveTextContent(
        /could not be read/
      );
      expect(screen.queryByTestId("card-balance-sats")).toBeNull();

      refused = false;
      await fireEvent.press(screen.getByTestId("card-wallet-retry"));
      expect(await screen.findByTestId("card-balance-sats", {}, SLOW)).toHaveTextContent(
        /^2.200 sats$/
      );
      // Its wallet alone connected again.
      expect(cardConnections(second)).toBe(2);
      expect(cardConnections(first)).toBe(1);
      expect(firstWallet.disconnect).not.toHaveBeenCalled();
      await choose(first);
      expect(screen.getByTestId("card-balance-sats")).toHaveTextContent(/^1.100 sats$/);
    } finally {
      sdk.connect.mockImplementation(connect);
    }
  });

  it("lets go of the wallet of a card deleted elsewhere only, the other card's staying connected", async () => {
    const [first, second] = await twoCards();
    sdk.fakeCardWallet(first).balanceSats = 1_100n;
    await open("/cards");
    const firstWallet = await walletRead(first);
    const secondWallet = await walletRead(second);
    await act(async () => {
      await withCardAccess(async (access) => {
        const { updatedAt: _updatedAt, ...state } = knownCardState(TEST_WALLET_ID, second)!;
        await recordCardState(access, { ...state, status: "deleted" });
      });
    });
    await waitFor(() => expect(screen.queryByTestId(`card-slot-${second}`)).toBeNull(), SLOW);
    await waitFor(() => expect(secondWallet.disconnect).toHaveBeenCalled(), SLOW);
    expect(firstWallet.disconnect).not.toHaveBeenCalled();
    expect(cardConnections(first)).toBe(1);
    expect(screen.getByTestId("card-balance-sats")).toHaveTextContent(/^1.100 sats$/);
  });

  it("reads the card's balance as its transfer ends and closes its panel, never as it was", async () => {
    const cardId = await pair();
    sdk.fakeCardWallet(cardId).balanceSats = 7_777n;
    // The card's wallet's syncs held once asked to, one by one.
    const held: (() => void)[] = [];
    let holding = false;
    const connect = sdk.connect.getMockImplementation()!;
    sdk.connect.mockImplementation(async (request?: unknown) => {
      const connected = (await connect(request)) as Record<string, jest.Mock>;
      const dir = (request as { storageDir?: string } | undefined)?.storageDir ?? "";
      if (dir.includes(`/breez-sdk-spark-cards/${cardId}/`)) {
        const sync = connected.syncWallet!.getMockImplementation()!;
        connected.syncWallet!.mockImplementation(async (...args: never[]) => {
          if (holding) await new Promise<void>((resolve) => held.push(resolve));
          return sync(...args);
        });
      }
      return connected;
    });
    try {
      await open("/cards");
      const panel = await openReturn(cardId);
      await fireEvent.press(await panel.findByTestId("card-wallet-empty", {}, SLOW));
      await fireEvent.press(panel.getByTestId("card-wallet-continue"));
      const send = await panel.findByTestId("card-wallet-send", {}, SLOW);
      // The card's wallet's syncs held from its transfer on.
      holding = true;
      await fireEvent.press(send);
      await transferSays(/^7.777 sats withdrawn to your main balance$/);
      // Read again as its transfer ended, not quietly (unlike a panel merely closed): its sats
      // moved, what it showed is no longer so, nor its deletion offered meanwhile.
      await waitFor(() => expect(held.length).toBeGreaterThan(0), SLOW);
      expect(screen.getByTestId("card-balance-reading")).toBeTruthy();
      expect(screen.queryByTestId("card-balance-sats")).toBeNull();
      expect(screen.getByTestId("card-delete")).toBeDisabled();
      holding = false;
      for (const resolve of held.splice(0)) resolve();
      await waitFor(
        () => expect(screen.getByTestId("card-balance-sats")).toHaveTextContent(/^0 sats$/),
        SLOW
      );
      await waitFor(() => expect(screen.getByTestId("card-delete")).toBeEnabled(), SLOW);
    } finally {
      holding = false;
      for (const resolve of held) resolve();
      sdk.connect.mockImplementation(connect);
    }
  });

  it("leaves nothing in the journal for the wallets let go while they were read", async () => {
    const [first, second] = await twoCards();
    // Their first reads wait for a sync, ended with an error once they disconnect.
    const release = sdk.holdFirstSync();
    try {
      const { router } = await open("/cards");
      const wallets = [await sdkOf(first), await sdkOf(second)];
      for (const wallet of wallets) {
        await waitFor(() => expect(wallet.getInfo).toHaveBeenCalled(), SLOW);
      }
      await fireEvent.press(screen.getByTestId("dock-slot-3"));
      await waitFor(() => expect(router.getPathname()).toBe("/settings"));
      for (const wallet of wallets) {
        await waitFor(() => expect(wallet.disconnect).toHaveBeenCalled(), SLOW);
      }
      await act(async () => undefined);
      const events = readLog().entries.map((entry) => entry.event);
      expect(events).not.toContain("Reading a card's wallet failed");
      expect(events).not.toContain("Reading a card's wallet again failed");
    } finally {
      release();
    }
  });

  it("sends an amount back to the main balance, the rest staying on the card", async () => {
    setMockRate(100_000);
    const cardId = await pair();
    sdk.fakeCardWallet(cardId).balanceSats = 48_210n;
    expect(await balanceOf(cardId)).toHaveTextContent(/^48.210 sats$/);
    const panel = await openReturn(cardId);
    await panel.findByTestId("card-wallet-amount-return", {}, SLOW);
    expect(panel.getByRole("header")).toHaveTextContent("Withdraw to my main balance");
    expect(panel.getByText("To my main balance")).toBeTruthy();
    expect(
      panel.getByText(new RegExp(`^From the card ${unnamed(cardId)} · 48.210 sats$`))
    ).toBeTruthy();
    // In sats alone: what the card holds.
    expect(panel.queryByTestId("card-amount-unit")).toBeNull();
    await typeOn(panel, "10000");
    expect(panel.getByTestId("card-amount-sub")).toHaveTextContent(
      /^10.00 CHF · 38.210 sats will stay on the card$/
    );
    await fireEvent.press(panel.getByTestId("card-wallet-continue"));
    const confirm = within(await panel.findByTestId("card-wallet-confirm", {}, SLOW));
    expect(panel.getByRole("header")).toHaveTextContent("Withdraw to my main balance");
    expect(confirm.getByLabelText(/^10.000 sats$/)).toBeTruthy();
    expect(confirm.getByText(/^10.00 CHF$/)).toBeTruthy();
    expect(confirm.getByText(unnamed(cardId))).toBeTruthy();
    expect(confirm.getByText("My main balance")).toBeTruthy();
    expect(confirm.getByTestId("card-wallet-after")).toHaveTextContent(/^38.210 sats$/);
    expect(signIn).not.toHaveBeenCalled();
    // No "Cancel" under the passkey's button.
    expect(panel.queryByTestId("card-wallet-cancel")).toBeNull();
    await fireEvent.press(panel.getByTestId("card-wallet-send"));
    await transferSays(/^10.000 sats withdrawn to your main balance$/);
    expect(signIn).toHaveBeenCalledTimes(1);
    expect(sdk.fakeCardWallet(cardId).balanceSats).toBe(38_210n);
    expect(sdk.fakeWallet.balanceSats).toBe(10_000n);
  });

  it('empties the card back to the main balance with "Empty the card", after the passkey', async () => {
    setMockRate(100_000);
    const cardId = await pair();
    sdk.fakeCardWallet(cardId).balanceSats = 7_777n;
    expect(await balanceOf(cardId)).toHaveTextContent(/^7.777 sats$/);
    const panel = await openReturn(cardId);
    await fireEvent.press(await panel.findByTestId("card-wallet-empty", {}, SLOW));
    expect(panel.getByTestId("card-wallet-empty").props.accessibilityState).toMatchObject({
      selected: true
    });
    expect(panel.getByTestId("card-amount").props.accessibilityLabel).toMatch(/^7.777 sats$/);
    expect(panel.getByTestId("card-amount-sub")).toHaveTextContent(
      /^The card's whole balance · 7.78 CHF$/
    );
    await fireEvent.press(panel.getByTestId("card-wallet-continue"));
    const confirm = within(await panel.findByTestId("card-wallet-confirm", {}, SLOW));
    // The amount and its value alone: "Empty the card" is told by what the card holds after.
    expect(confirm.getByLabelText(/^7.777 sats$/)).toBeTruthy();
    expect(confirm.getByText(/^7.78 CHF$/)).toBeTruthy();
    expect(confirm.queryByText(/The card's whole balance/)).toBeNull();
    expect(confirm.getByTestId("card-wallet-after")).toHaveTextContent(/^0 sats$/);
    expect(signIn).not.toHaveBeenCalled();
    await fireEvent.press(panel.getByTestId("card-wallet-send"));
    await transferSays(/^7.777 sats withdrawn to your main balance$/);
    expect(signIn).toHaveBeenCalledTimes(1);
    expect(sdk.fakeCardWallet(cardId).balanceSats).toBe(0n);
    expect(sdk.fakeWallet.balanceSats).toBe(7_777n);
    // Read again: nothing left to send back.
    await waitFor(
      () => expect(screen.getByTestId("card-balance-sats")).toHaveTextContent(/^0 sats$/),
      SLOW
    );
    expect(screen.getByTestId("card-wallet-return")).toBeDisabled();
  });

  it("empties the card of what it holds as the transfer reads it, all of it", async () => {
    const cardId = await pair();
    sdk.fakeCardWallet(cardId).balanceSats = 7_777n;
    expect(await balanceOf(cardId)).toHaveTextContent(/^7.777 sats$/);
    const panel = await openReturn(cardId);
    await fireEvent.press(await panel.findByTestId("card-wallet-empty", {}, SLOW));
    // Paid to the card since its panel read it: "Empty the card" sends it all the same.
    sdk.fakeCardWallet(cardId).balanceSats = 8_000n;
    await fireEvent.press(panel.getByTestId("card-wallet-continue"));
    const confirm = within(await panel.findByTestId("card-wallet-confirm", {}, SLOW));
    expect(confirm.getByLabelText(/^8.000 sats$/)).toBeTruthy();
    expect(confirm.getByTestId("card-wallet-after")).toHaveTextContent(/^0 sats$/);
    await fireEvent.press(panel.getByTestId("card-wallet-send"));
    await transferSays(/^8.000 sats withdrawn to your main balance$/);
    expect(sdk.fakeCardWallet(cardId).balanceSats).toBe(0n);
    expect(sdk.fakeWallet.balanceSats).toBe(8_000n);
  });

  it("never sends back more than the card holds, as the transfer reads it again", async () => {
    const cardId = await pair();
    sdk.fakeCardWallet(cardId).balanceSats = 7_777n;
    expect(await balanceOf(cardId)).toHaveTextContent(/^7.777 sats$/);
    const panel = await openReturn(cardId);
    await panel.findByTestId("card-wallet-amount-return", {}, SLOW);
    await typeOn(panel, "8000");
    expect(panel.getByTestId("card-amount-sub")).toHaveTextContent(
      /^The card only holds 7.777 sats$/
    );
    expect(panel.getByTestId("card-wallet-continue")).toBeDisabled();
    for (let key = 0; key < 4; key++) await fireEvent.press(panel.getByTestId("key-del"));
    // Paid with since its panel read it: what it holds now is said.
    sdk.fakeCardWallet(cardId).balanceSats = 5_000n;
    await typeOn(panel, "6000");
    await fireEvent.press(panel.getByTestId("card-wallet-continue"));
    await waitFor(
      () =>
        expect(panel.getByTestId("card-amount-sub")).toHaveTextContent(
          /^The card only holds 5.000 sats$/
        ),
      SLOW
    );
    expect(panel.getByTestId("card-wallet-continue")).toBeDisabled();
    expect(panel.queryByTestId("card-wallet-confirm")).toBeNull();
    expect(signIn).not.toHaveBeenCalled();
  });

  describe("on a desktop", () => {
    beforeEach(() => {
      mockDesktop.mockReturnValue(true);
      // A large desktop window.
      windowOf(1440, 900);
    });
    afterEach(phoneWindow);

    /** The dialog's amount, typed in its field: no keypad on a desktop. */
    function amountField(panel: ReturnType<typeof within>) {
      return panel.getByLabelText("Amount");
    }

    /** What is typed prepared as a transfer: its fee said. Resolves with the dialog's button. */
    async function quoted(panel: ReturnType<typeof within>, fee = /^None$/) {
      await waitFor(
        () => expect(panel.getByTestId("card-wallet-fee")).toHaveTextContent(fee),
        SLOW
      );
      return panel.getByTestId("card-wallet-send");
    }

    it('recharges as "Send" sends: the amount typed, its fee and what the card holds after it, then the passkey', async () => {
      setMockRate(100_000);
      sdk.fakeWallet.balanceSats = 1_254_300n;
      const cardId = await pair();
      sdk.fakeCardWallet(cardId).balanceSats = 48_210n;
      await open("/cards");
      const panel = await rechargeOf(cardId);
      // A dialog named after the card.
      expect(StyleSheet.flatten(screen.getByTestId("card-sheet").props.style).maxWidth).toBe(560);
      expect(panel.getByRole("header")).toHaveTextContent(`Top up ${unnamed(cardId)}`);
      // Its name in orange.
      expect(
        StyleSheet.flatten(within(panel.getByRole("header")).getByText(unnamed(cardId)).props.style)
          .color
      ).toBe(palette.orange);
      expect(panel.queryByTestId("sheet-back")).toBeNull();
      expect(panel.getByTestId("card-wallet-change").props.accessibilityLabel).toMatch(
        /^From my main balance, 1.254.300 sats available, Change$/
      );
      // A field, no keypad; nothing said of a transfer before an amount is typed.
      expect(panel.queryByTestId("key-1")).toBeNull();
      expect(amountField(panel).props.value).toBe("");
      expect(panel.getByTestId("card-wallet-fee")).toHaveTextContent(/^—$/);
      expect(panel.getByTestId("card-wallet-after")).toHaveTextContent(/^—$/);
      expect(panel.getByTestId("card-wallet-send")).toBeDisabled();

      // Its fee as the SDK quotes it, never before the transfer is prepared.
      sdk.fakeSend.sparkFeeSats = 5n;
      await fireEvent.changeText(amountField(panel), "20000");
      expect(panel.getByTestId("card-amount-sub")).toHaveTextContent(/^20.00 CHF$/);
      expect(panel.getByTestId("card-wallet-fee")).toHaveTextContent(/^Calculating fees…$/);
      expect(panel.getByTestId("card-wallet-after")).toHaveTextContent(/^—$/);
      expect(panel.getByTestId("card-wallet-send")).toBeDisabled();
      const send = await quoted(panel, /^5 sats$/);
      expect(panel.getByTestId("card-wallet-after")).toHaveTextContent(/^68.210 sats$/);
      // In the title and in "To".
      expect(panel.getAllByText(unnamed(cardId))).toHaveLength(2);
      expect(send).toBeEnabled();
      expect(send).toHaveTextContent(/Top up 20.000 sats$/);
      expect(signIn).not.toHaveBeenCalled();
      expect(sdk.fakeWallet.balanceSats).toBe(1_254_300n);

      // Sent at once, after the passkey: the dialog closes, a notification says it.
      await fireEvent.press(send);
      await transferSays(/^Card topped up with 20.000 sats$/);
      expect(signIn).toHaveBeenCalledTimes(1);
      expect(sdk.fakeWallet.balanceSats).toBe(1_234_295n);
      expect(sdk.fakeCardWallet(cardId).balanceSats).toBe(68_210n);
      await waitFor(
        () => expect(screen.getByTestId("card-balance-sats")).toHaveTextContent(/^68.210 sats$/),
        SLOW
      );
    });

    it("takes the account's currency, rounded up to the sat, and switches back to the text typed", async () => {
      setMockRate(85_000);
      sdk.fakeWallet.balanceSats = 50_000n;
      const cardId = await pair();
      await open("/cards");
      const panel = await rechargeOf(cardId);
      const unit = () => panel.getByTestId("card-amount-unit");
      expect(unit()).toHaveTextContent(/^sats/);
      await fireEvent.press(unit());
      expect(unit()).toHaveTextContent(/^CHF/);
      await fireEvent.changeText(amountField(panel), "20");
      // 20 CHF at 85,000 CHF a bitcoin: 23,529.41… sats, the next whole sat.
      expect(panel.getByTestId("card-amount-sub")).toHaveTextContent(/^23.530 sats$/);
      expect(await quoted(panel)).toHaveTextContent(/Top up 23.530 sats$/);
      // In sats, the amount carried over; back unedited, the text typed, not a conversion of it.
      await fireEvent.press(unit());
      expect(amountField(panel).props.value).toBe("23530");
      await fireEvent.press(unit());
      expect(amountField(panel).props.value).toBe("20");
      expect(unit()).toHaveTextContent(/^CHF/);
      // The rate gone (an outage): no amount fixed, nothing to send, the reason said.
      await act(async () => setMockRate(undefined));
      expect(panel.getByTestId("card-amount-sub")).toHaveTextContent(
        "Bitcoin price unavailable. Check your internet connection."
      );
      expect(panel.getByTestId("card-wallet-fee")).toHaveTextContent(/^—$/);
      expect(panel.getByTestId("card-wallet-send")).toBeDisabled();
      expect(signIn).not.toHaveBeenCalled();
    });

    it("shows the transfer again to try once more: a passkey dismissed, a network failed, sent once", async () => {
      sdk.fakeWallet.balanceSats = 5_000n;
      const cardId = await pair();
      await open("/cards");
      const panel = await rechargeOf(cardId);
      await fireEvent.changeText(amountField(panel), "1000");
      signIn.mockRejectedValueOnce(new PasskeyError("cancelled", "Dismissed"));
      await fireEvent.press(await quoted(panel));
      await waitFor(() => expect(signIn).toHaveBeenCalledTimes(1));
      // Its confirmation, in the same dialog: the transfer as prepared, nothing said, nothing sent.
      const confirm = within(await panel.findByTestId("card-wallet-confirm", {}, SLOW));
      expect(panel.getByRole("header")).toHaveTextContent(`Top up ${unnamed(cardId)}`);
      expect(confirm.getByLabelText(/^1.000 sats$/)).toBeTruthy();
      expect(confirm.getByTestId("card-wallet-after")).toHaveTextContent(/^1.000 sats$/);
      expect(confirm.getByTestId("card-wallet-send")).toHaveTextContent(/Top up 1.000 sats$/);
      expect(panel.queryByTestId("card-wallet-send-failed")).toBeNull();
      expect(sdk.fakeWallet.balanceSats).toBe(5_000n);

      // The network failed: said on it, which sends it once.
      sdk.fakeSend.sendError = new Error("Network down");
      await fireEvent.press(confirm.getByTestId("card-wallet-send"));
      expect(await panel.findByTestId("card-wallet-send-failed", {}, SLOW)).toHaveTextContent(
        /it will only be sent once/
      );
      sdk.fakeSend.sendError = null;
      await fireEvent.press(panel.getByTestId("card-wallet-send"));
      await transferSays(/^Card topped up with 1.000 sats$/);
      expect(sdk.fakeWallet.balanceSats).toBe(4_000n);
      expect(sdk.fakeCardWallet(cardId).balanceSats).toBe(1_000n);
    });

    it('goes back to the amount as typed from its confirmation, and closes with "Cancel"', async () => {
      sdk.fakeWallet.balanceSats = 50_000n;
      const cardId = await pair();
      await open("/cards");
      const panel = await rechargeOf(cardId);
      await fireEvent.changeText(amountField(panel), "3500");
      signIn.mockRejectedValueOnce(new PasskeyError("cancelled", "Dismissed"));
      await fireEvent.press(await quoted(panel));
      await panel.findByTestId("card-wallet-confirm", {}, SLOW);
      await fireEvent.press(panel.getByTestId("card-wallet-cancel"));
      expect(await panel.findByTestId("card-wallet-amount-recharge")).toBeTruthy();
      expect(amountField(panel).props.value).toBe("3500");
      // Prepared again as it shows: ready to go.
      expect(await quoted(panel)).toBeEnabled();
      await fireEvent.press(panel.getByTestId("card-wallet-cancel"));
      await waitFor(() => expect(screen.queryByTestId("card-sheet")).toBeNull());
      expect(signIn).toHaveBeenCalledTimes(1);
      expect(sdk.fakeWallet.balanceSats).toBe(50_000n);
    });

    it("says the main balance falls short, as typed or as the transfer reads it", async () => {
      sdk.fakeWallet.balanceSats = 50_000n;
      const cardId = await pair();
      await open("/cards");
      const panel = await rechargeOf(cardId);
      await fireEvent.changeText(amountField(panel), "60000");
      expect(panel.getByTestId("card-amount-sub")).toHaveTextContent(
        /^Your main balance does not cover this amount$/
      );
      expect(panel.getByTestId("card-wallet-fee")).toHaveTextContent(/^—$/);
      expect(panel.getByTestId("card-wallet-send")).toBeDisabled();
      // Spent elsewhere since it was read: what it holds, once the transfer reads it.
      sdk.fakeWallet.balanceSats = 2_000n;
      await fireEvent.changeText(amountField(panel), "3000");
      await waitFor(
        () =>
          expect(panel.getByTestId("card-wallet-change").props.accessibilityLabel).toMatch(
            /2.000 sats available/
          ),
        SLOW
      );
      expect(panel.getByTestId("card-amount-sub")).toHaveTextContent(
        /^Your main balance does not cover this amount$/
      );
      expect(panel.getByTestId("card-wallet-send")).toBeDisabled();
      expect(amountField(panel).props.value).toBe("3000");
      expect(signIn).not.toHaveBeenCalled();
    });

    it("says when the transfer could not be prepared, and prepares it again", async () => {
      sdk.fakeWallet.balanceSats = 50_000n;
      const cardId = await pair();
      await open("/cards");
      const panel = await rechargeOf(cardId);
      const account = await sdkOf(null);
      account.prepareSendPayment!.mockRejectedValueOnce(new Error("Service unavailable"));
      await fireEvent.changeText(amountField(panel), "1500");
      expect(await panel.findByTestId("card-wallet-quote-failed", {}, SLOW)).toHaveTextContent(
        /The fees could not be calculated\. Check your internet connection, then try again\.$/
      );
      expect(panel.getByTestId("card-wallet-fee")).toHaveTextContent(/^—$/);
      expect(panel.getByTestId("card-wallet-send")).toBeDisabled();
      await fireEvent.press(panel.getByTestId("card-wallet-quote-retry"));
      expect(await quoted(panel)).toBeEnabled();
      expect(panel.queryByTestId("card-wallet-quote-failed")).toBeNull();
      expect(sdk.fakeWallet.balanceSats).toBe(50_000n);
    });

    it("never shows a transfer given up as ready: an amount typed again is prepared anew", async () => {
      sdk.fakeWallet.balanceSats = 50_000n;
      const cardId = await pair();
      await open("/cards");
      const panel = await rechargeOf(cardId);
      await fireEvent.changeText(amountField(panel), "1000");
      expect(await quoted(panel)).toBeEnabled();
      // Another amount, then the first again before the other's transfer is prepared: the first
      // one's, given up, is not shown again (its button would do nothing).
      await fireEvent.changeText(amountField(panel), "10000");
      await fireEvent.changeText(amountField(panel), "1000");
      expect(panel.getByTestId("card-wallet-fee")).toHaveTextContent(/^Calculating fees…$/);
      expect(panel.getByTestId("card-wallet-after")).toHaveTextContent(/^—$/);
      expect(panel.getByTestId("card-wallet-send")).toBeDisabled();
      // Prepared anew: sent at once, after the passkey.
      await fireEvent.press(await quoted(panel));
      await transferSays(/^Card topped up with 1.000 sats$/);
      expect(signIn).toHaveBeenCalledTimes(1);
      expect(sdk.fakeWallet.balanceSats).toBe(49_000n);
      expect(sdk.fakeCardWallet(cardId).balanceSats).toBe(1_000n);
    });

    it("sends an amount back as typed, its fee and what the card holds after it shown before it goes", async () => {
      setMockRate(100_000);
      const cardId = await pair();
      sdk.fakeCardWallet(cardId).balanceSats = 48_210n;
      expect(await balanceOf(cardId)).toHaveTextContent(/^48.210 sats$/);
      const panel = await openReturn(cardId);
      await panel.findByTestId("card-wallet-amount-return", {}, SLOW);
      expect(StyleSheet.flatten(screen.getByTestId("card-sheet").props.style).maxWidth).toBe(560);
      expect(panel.getByRole("header")).toHaveTextContent("Withdraw to my main balance");
      expect(panel.getByText("To my main balance")).toBeTruthy();
      expect(
        panel.getByText(new RegExp(`^From the card ${unnamed(cardId)} · 48.210 sats$`))
      ).toBeTruthy();
      // The currency offered too, "Empty the card" on the field's label line.
      expect(panel.getByTestId("card-amount-unit")).toBeEnabled();
      expect(panel.getByTestId("card-wallet-empty")).toHaveTextContent(/Empty the card$/);
      sdk.fakeSend.sparkFeeSats = 5n;
      await fireEvent.changeText(amountField(panel), "10000");
      expect(panel.getByTestId("card-amount-sub")).toHaveTextContent(/^10.00 CHF$/);
      const send = await quoted(panel, /^5 sats$/);
      // Its fee on top of the amount, out of the card.
      expect(panel.getByTestId("card-wallet-after")).toHaveTextContent(/^38.205 sats$/);
      expect(panel.getByText("My main balance")).toBeTruthy();
      expect(send).toHaveTextContent(/Withdraw 10.000 sats$/);
      expect(signIn).not.toHaveBeenCalled();
      await fireEvent.press(send);
      await transferSays(/^10.000 sats withdrawn to your main balance$/);
      expect(signIn).toHaveBeenCalledTimes(1);
      expect(sdk.fakeCardWallet(cardId).balanceSats).toBe(38_205n);
      expect(sdk.fakeWallet.balanceSats).toBe(10_000n);
    });

    it('empties the card with "Empty the card": all it holds as the transfer reads it', async () => {
      setMockRate(100_000);
      const cardId = await pair();
      sdk.fakeCardWallet(cardId).balanceSats = 48_210n;
      expect(await balanceOf(cardId)).toHaveTextContent(/^48.210 sats$/);
      const panel = await openReturn(cardId);
      await fireEvent.press(await panel.findByTestId("card-wallet-empty", {}, SLOW));
      // All of it: its link gone.
      expect(panel.queryByTestId("card-wallet-empty")).toBeNull();
      expect(amountField(panel).props.value).toBe("48210");
      expect(panel.getByTestId("card-amount-sub")).toHaveTextContent(
        /^The card's whole balance · 48.21 CHF$/
      );
      // Paid to the card since its panel read it: all of it all the same, the amount following.
      sdk.fakeCardWallet(cardId).balanceSats = 50_000n;
      await quoted(panel);
      expect(panel.getByTestId("card-wallet-after")).toHaveTextContent(/^0 sats$/);
      await waitFor(() => expect(amountField(panel).props.value).toBe("50000"));
      expect(
        panel.getByText(new RegExp(`^From the card ${unnamed(cardId)} · 50.000 sats$`))
      ).toBeTruthy();
      expect(panel.queryByTestId("card-wallet-empty")).toBeNull();
      expect(panel.getByTestId("card-wallet-send")).toHaveTextContent(/Withdraw 50.000 sats$/);
      await fireEvent.press(panel.getByTestId("card-wallet-send"));
      await transferSays(/^50.000 sats withdrawn to your main balance$/);
      expect(signIn).toHaveBeenCalledTimes(1);
      expect(sdk.fakeCardWallet(cardId).balanceSats).toBe(0n);
      expect(sdk.fakeWallet.balanceSats).toBe(50_000n);
      await waitFor(
        () => expect(screen.getByTestId("card-balance-sats")).toHaveTextContent(/^0 sats$/),
        SLOW
      );
      expect(screen.getByTestId("card-wallet-return")).toBeDisabled();
    });

    it('keeps the account\'s wallet connected while "Withdraw" shows, once for every amount typed', async () => {
      const cardId = await pair();
      sdk.fakeCardWallet(cardId).balanceSats = 48_210n;
      expect(await balanceOf(cardId)).toHaveTextContent(/^48.210 sats$/);
      // Connected by "Cards" already: the panel needs no connection of its own.
      await waitFor(() => expect(isAccountWalletOpen()).toBe(true), SLOW);
      const before = accountConnections();
      const panel = await openReturn(cardId);
      await panel.findByTestId("card-wallet-amount-return", {}, SLOW);
      for (const amount of ["1000", "2000", "3000"]) {
        await fireEvent.changeText(amountField(panel), amount);
        await quoted(panel);
      }
      // "Empty the card", an amount, then "Empty the card" again before that amount's transfer
      // is prepared: the whole card's, given up, is prepared anew, never shown ready.
      await fireEvent.press(panel.getByTestId("card-wallet-empty"));
      await quoted(panel);
      await fireEvent.changeText(amountField(panel), "1000");
      await fireEvent.press(panel.getByTestId("card-wallet-empty"));
      expect(panel.getByTestId("card-wallet-fee")).toHaveTextContent(/^Calculating fees…$/);
      expect(panel.getByTestId("card-wallet-send")).toBeDisabled();
      expect(await quoted(panel)).toHaveTextContent(/Withdraw 48.210 sats$/);
      expect(accountConnections()).toBe(before);
      // Closed: let go by the panel, still held by "Cards", which shows.
      const account = await sdkOf(null);
      await fireEvent.press(panel.getByTestId("card-wallet-cancel"));
      await waitFor(() => expect(screen.queryByTestId("card-sheet")).toBeNull());
      expect(isAccountWalletOpen()).toBe(true);
      expect(account.disconnect).not.toHaveBeenCalled();
      expect(signIn).not.toHaveBeenCalled();
      expect(sdk.fakeCardWallet(cardId).balanceSats).toBe(48_210n);
    });

    it("never sends back more than the card holds, as the transfer reads it again", async () => {
      const cardId = await pair();
      sdk.fakeCardWallet(cardId).balanceSats = 7_777n;
      expect(await balanceOf(cardId)).toHaveTextContent(/^7.777 sats$/);
      const panel = await openReturn(cardId);
      await panel.findByTestId("card-wallet-amount-return", {}, SLOW);
      await fireEvent.changeText(amountField(panel), "8000");
      expect(panel.getByTestId("card-amount-sub")).toHaveTextContent(
        /^The card only holds 7.777 sats$/
      );
      expect(panel.getByTestId("card-wallet-fee")).toHaveTextContent(/^—$/);
      expect(panel.getByTestId("card-wallet-send")).toBeDisabled();
      // Paid with since its panel read it: what it holds now is said.
      sdk.fakeCardWallet(cardId).balanceSats = 5_000n;
      await fireEvent.changeText(amountField(panel), "6000");
      await waitFor(
        () =>
          expect(panel.getByTestId("card-amount-sub")).toHaveTextContent(
            /^The card only holds 5.000 sats$/
          ),
        SLOW
      );
      expect(
        panel.getByText(new RegExp(`^From the card ${unnamed(cardId)} · 5.000 sats$`))
      ).toBeTruthy();
      expect(panel.getByTestId("card-wallet-send")).toBeDisabled();
      expect(signIn).not.toHaveBeenCalled();
    });

    it("says when the card holds nothing to send back as the transfer reads it", async () => {
      const cardId = await pair();
      sdk.fakeCardWallet(cardId).balanceSats = 5_000n;
      expect(await balanceOf(cardId)).toHaveTextContent(/^5.000 sats$/);
      const panel = await openReturn(cardId);
      await panel.findByTestId("card-wallet-amount-return", {}, SLOW);
      // Spent meanwhile (a payment at a point of sale).
      sdk.fakeCardWallet(cardId).balanceSats = 0n;
      await fireEvent.changeText(amountField(panel), "1200");
      await transferSays(/^This card holds nothing to withdraw$/, "warning");
      expect(signIn).not.toHaveBeenCalled();
    });

    it('empties a card before its deletion ("Empty first"): all of it chosen, sent after the passkey', async () => {
      const cardId = await pair();
      sdk.fakeCardWallet(cardId).balanceSats = 500n;
      await open("/cards");
      await choose(cardId);
      await waitFor(
        () => expect(screen.getByTestId("card-balance-sats")).toHaveTextContent(/^500 sats$/),
        SLOW
      );
      await fireEvent.press(screen.getByTestId("card-delete"));
      await fireEvent.press(await screen.findByTestId("card-delete-drain-return"));
      const panel = within(await screen.findByTestId("card-sheet"));
      await waitFor(() => expect(screen.queryByTestId("card-delete-drain")).toBeNull(), SLOW);
      expect(await panel.findByTestId("card-wallet-amount-return", {}, SLOW)).toBeTruthy();
      expect(panel.getByRole("header")).toHaveTextContent("Withdraw to my main balance");
      expect(amountField(panel).props.value).toBe("500");
      expect(panel.queryByTestId("card-wallet-empty")).toBeNull();
      const send = await quoted(panel);
      expect(panel.getByTestId("card-wallet-after")).toHaveTextContent(/^0 sats$/);
      expect(send).toHaveTextContent(/Withdraw 500 sats$/);
      await fireEvent.press(send);
      await transferSays(/^500 sats withdrawn to your main balance$/);
      expect(signIn).toHaveBeenCalledTimes(1);
      expect(sdk.fakeWallet.balanceSats).toBe(500n);
      expect(sdk.fakeCardWallet(cardId).balanceSats).toBe(0n);
    });

    it("gives the card's address to copy, then an invoice beside its code, its payment said", async () => {
      setMockRate(100_000);
      const cardId = await pair();
      await open("/cards");
      const copied = jest.mocked(Clipboard.setStringAsync);
      const panel = await rechargeOf(cardId);
      // The main balance empty: the card's Lightning address, "Copy the address" alone (no share
      // sheet on a computer).
      const address = await panel.findByTestId("card-wallet-code-text", {}, SLOW);
      expect(panel.getByRole("header")).toHaveTextContent(`Top up ${unnamed(cardId)}`);
      expect(panel.getByTestId("card-wallet-copy")).toHaveTextContent(/Copy the address$/);
      expect(panel.queryByTestId("card-wallet-share")).toBeNull();
      await fireEvent.press(panel.getByTestId("card-wallet-copy"));
      await waitFor(() => expect(copied).toHaveBeenLastCalledWith(address.props.children));

      // "Lightning invoice": its amount in a field, "Cancel" beside "Create the invoice".
      await fireEvent.press(panel.getByTestId("card-wallet-invoice"));
      expect(await panel.findByTestId("card-wallet-amount-invoice")).toBeTruthy();
      expect(panel.getByRole("header")).toHaveTextContent("Lightning invoice");
      expect(panel.getByTestId("sheet-back")).toBeTruthy();
      expect(panel.getByTestId("card-wallet-invoice-create")).toBeDisabled();
      await fireEvent.changeText(amountField(panel), "50000");
      expect(panel.getByTestId("card-amount-sub")).toHaveTextContent(/^50.00 CHF$/);
      await fireEvent.press(panel.getByTestId("card-wallet-invoice-create"));

      // Beside its code: its amount, its wait, its text, "Copy the invoice".
      const shown = await panel.findByTestId("card-wallet-invoice-code", {}, SLOW);
      expect(StyleSheet.flatten(shown.props.style).flexDirection).toBe("row");
      const [invoice] = sdk.fakeCardWallet(cardId).invoices;
      expect(panel.getByTestId("card-wallet-code-text").props.accessibilityLabel).toBe(invoice);
      expect(panel.getByLabelText(/^50.000 sats$/)).toBeTruthy();
      expect(panel.getByText(/^50.00 CHF$/)).toBeTruthy();
      expect(panel.getByText("Waiting for the payment…")).toBeTruthy();
      expect(panel.getByTestId("card-wallet-copy")).toHaveTextContent(/Copy the invoice$/);
      expect(panel.queryByTestId("card-wallet-share")).toBeNull();
      await fireEvent.press(panel.getByTestId("card-wallet-copy"));
      await waitFor(() => expect(copied).toHaveBeenLastCalledWith(invoice));

      // Paid from another wallet: said, with no way back to it; "Finish" closes, the balance read
      // again.
      expect(sdk.settleReceivedInvoice(invoice!)).toBe(true);
      const paid = await panel.findByTestId("card-wallet-invoice-paid", {}, SLOW);
      expect(within(paid).getByLabelText(/^\+50.000 sats$/)).toBeTruthy();
      await waitFor(() => expect(panel.queryByTestId("sheet-back")).toBeNull());
      expect(panel.getByRole("header")).toHaveTextContent("Lightning invoice");
      await fireEvent.press(panel.getByTestId("card-wallet-finish"));
      await waitFor(
        () => expect(screen.getByTestId("card-balance-sats")).toHaveTextContent(/^50.000 sats$/),
        SLOW
      );
      expect(signIn).not.toHaveBeenCalled();
    });

    it("shows an expired invoice beside its faded code, a new one from the amount kept", async () => {
      jest.useFakeTimers({ advanceTimers: true });
      try {
        const cardId = await pair();
        await open("/cards");
        const panel = await rechargeOf(cardId);
        await fireEvent.press(await panel.findByTestId("card-wallet-invoice", {}, SLOW));
        await fireEvent.changeText(amountField(panel), "5000");
        await fireEvent.press(panel.getByTestId("card-wallet-invoice-create"));
        await panel.findByTestId("card-wallet-invoice-code", {}, SLOW);
        // A day later, unpaid.
        jest.setSystemTime(Date.now() + 24 * 3600 * 1000 + 1000);
        await act(async () => {
          await jest.advanceTimersByTimeAsync(CARD_INVOICE_POLL_MS);
        });
        const expired = await panel.findByTestId("card-wallet-invoice-expired", {}, SLOW);
        expect(StyleSheet.flatten(expired.props.style).flexDirection).toBe("row");
        expect(expired).toHaveTextContent(/Invoice expired/);
        expect(expired).toHaveTextContent(
          /It was not paid before .+: no one can pay it any more\./
        );
        expect(within(expired).getByLabelText(/^5.000 sats$/)).toBeTruthy();
        await fireEvent.press(panel.getByTestId("card-wallet-invoice-new"));
        expect(await panel.findByTestId("card-wallet-amount-invoice")).toBeTruthy();
        expect(amountField(panel).props.value).toBe("5000");
        // "Cancel": the dialog closes.
        await fireEvent.press(panel.getByTestId("card-wallet-cancel"));
        await waitFor(() => expect(screen.queryByTestId("card-sheet")).toBeNull());
      } finally {
        jest.useRealTimers();
      }
    });

    it("gives a new Bitcoin address on one line, to copy, and where its deposit is added", async () => {
      const cardId = await pair();
      await open("/cards");
      const copied = jest.mocked(Clipboard.setStringAsync);
      const panel = await rechargeOf(cardId);
      await fireEvent.press(await panel.findByTestId("card-wallet-onchain", {}, SLOW));
      expect(panel.getByRole("header")).toHaveTextContent("Bitcoin address");
      const text = await panel.findByTestId("card-wallet-code-text", {}, SLOW);
      const address = text.props.accessibilityLabel as string;
      expect(address).toMatch(/^bc1p/);
      // On one line.
      expect(text.props.children).toBe(address);
      expect(panel.getByTestId("card-wallet-copy")).toHaveTextContent(/Copy the address$/);
      expect(panel.queryByTestId("card-wallet-share")).toBeNull();
      await fireEvent.press(panel.getByTestId("card-wallet-copy"));
      await waitFor(() => expect(copied).toHaveBeenLastCalledWith(address));
      expect(panel.getByTestId("card-wallet-onchain-code")).toHaveTextContent(
        /The credit is made when the card is open in “Cards”, here or on your phone\./
      );
      expect(signIn).not.toHaveBeenCalled();
    });
  });
});

describe('"Cards": a v2 card being migrated', () => {
  it("is in the carousel, its wallet in sight: what it transferred can go back, nothing goes on it", async () => {
    const cardId = await migratingCard();
    sdk.fakeCardWallet(cardId).balanceSats = 40_000n;
    const { router } = await open("/cards");
    const slot = await screen.findByTestId(`card-slot-${cardId}`, {}, SLOW);
    expect(slot.props.accessibilityLabel).toMatch(/, migration to finish$/);
    expect(screen.getByTestId("card-face-status")).toHaveTextContent(/Migration to finish/);
    expect(screen.getByTestId("card-migrating-note")).toHaveTextContent(
      /This card's migration is not finished: it does not pay yet/
    );
    expect(await screen.findByTestId("card-balance-sats", {}, SLOW)).toHaveTextContent(
      /^40.000 sats$/
    );
    expect(screen.getByTestId("card-wallet-return")).toBeEnabled();
    expect(screen.queryByTestId("card-wallet-recharge")).toBeNull();
    // Not programmed yet: none of a card's own settings nor operations, and nothing that takes it
    // out of the list (a late payment of the v2 server would reach a wallet no screen shows).
    for (const id of [
      "card-history",
      "card-suspend",
      "card-limits",
      "card-payees",
      "card-customize",
      "card-relay",
      "card-advanced",
      "card-delete"
    ]) {
      expect(screen.queryByTestId(id)).toBeNull();
    }
    // Finished held to the phone, as a card is added.
    await fireEvent.press(screen.getByTestId("card-finish-migration"));
    await waitFor(() => expect(router.getPathname()).toBe("/cards/pair"));
  });
});

describe('"Finish the migration" of a v2 card left half-done', () => {
  beforeEach(() => {
    // The v2 keys live on the v2 server only (legacy-reset.ts): the fake one holds them.
    addLegacyServer("api.swiss-bitcoin-pay.ch").v2Keys = LEGACY_KEYS;
  });

  /** The card as its interrupted erase left it: K1 blank, the v2 master key still on it. */
  async function halfWiped(): Promise<FakeNtag424> {
    const card = legacyNtag424({
      uid: LEGACY_UID,
      host: "api.swiss-bitcoin-pay.ch",
      master: hexToBytes(LEGACY_MASTER),
      meta: hexToBytes(LEGACY_META),
      file: hexToBytes(LEGACY_FILE)
    });
    // Its first change (K1, ChangeKey) handled, then the card out of the field.
    card.interruptAtCommand(0xc4, true);
    await expect(wipeLegacyCard(new Ntag424(card.transceive), LEGACY_UID)).rejects.toMatchObject({
      code: "connection"
    });
    expect(card.keyVersions).toEqual([1, 0, 1, 0, 0]);
    return card;
  }

  /** "Finish the migration" pressed in "Cards", no card held yet. */
  async function finishFromCards() {
    nfc.waitForCard();
    const { router } = await open("/cards");
    await fireEvent.press(await screen.findByTestId("card-finish-migration", {}, SLOW));
    await waitFor(() => expect(router.getPathname()).toBe("/cards/pair"));
    return { router };
  }

  it('finishes it at once, the card held once: no guide, its steps from "Card recognized"', async () => {
    const cardId = await migratingCard(LEGACY_UID);
    sdk.fakeCardWallet(cardId).balanceSats = 40_000n;
    const { router } = await finishFromCards();
    await titleSays("Hold the card to the phone once more");
    expect(screen.queryByTestId("add-card-start")).toBeNull();
    expect(screen.getByText("Finish the migration")).toBeTruthy();
    expect(screen.getByLabelText(/^Card recognized: done/)).toBeTruthy();
    await waitFor(() => expect(nfc.awaitingCard()).toBe(true), SLOW);

    const held = await halfWiped();
    nfc.holdCard(held);
    await titleSays("Card migrated");
    expect(held.keyVersions).toEqual([1, 1, 1, 1, 1]);
    await fireEvent.press(screen.getByTestId("card-steps-primary"));
    await waitFor(() => expect(router.getPathname()).toBe("/cards"));
    // Active on "Cards", chosen there, its wallet as it was.
    await waitFor(() => expect(screen.queryByTestId("card-migrating-note")).toBeNull(), SLOW);
    expect(screen.getByTestId(`card-slot-${cardId}`).props.accessibilityState.selected).toBe(true);
    expect(sdk.fakeCardWallet(cardId).balanceSats).toBe(40_000n);
  });

  it("draws the card as its record has it, its name and colour, never a colour drawn for it", async () => {
    await migratingCard(LEGACY_UID, { name: "Everyday", look: { kind: "color", color: "plum" } });
    await finishFromCards();
    await titleSays("Hold the card to the phone once more");
    expect(screen.getByTestId("hold-stage-face", { includeHiddenElements: true })).toHaveStyle({
      backgroundColor: CARD_PALETTE.plum.fill
    });
    expect(
      screen.getByTestId("hold-stage-face-label", { includeHiddenElements: true })
    ).toHaveTextContent("Everyday");
  });

  it('refuses another card held, at its step, sending it nothing: the right one on "Try again"', async () => {
    await migratingCard(LEGACY_UID);
    await finishFromCards();
    await waitFor(() => expect(nfc.awaitingCard()).toBe(true), SLOW);
    const other = new FakeNtag424("04ffffffffffff");
    nfc.holdCard(other);
    await titleSays("The migration did not go through");
    expect(screen.getByTestId("card-step-held")).toHaveTextContent(/This is not the chosen card/);
    expect(other.received).toHaveLength(0);

    const held = await halfWiped();
    nfc.holdCard(held);
    await fireEvent.press(screen.getByTestId("card-steps-primary"));
    await titleSays("Card migrated");
    expect(held.keyVersions).toEqual([1, 1, 1, 1, 1]);
  });

  it('leaves for "Cards" by its way back and by "Cancel", never to a guide', async () => {
    await migratingCard(LEGACY_UID);
    const { router } = await finishFromCards();
    await waitFor(() => expect(nfc.awaitingCard()).toBe(true), SLOW);
    await fireEvent.press(screen.getByTestId("pair-card-back"));
    await waitFor(() => expect(router.getPathname()).toBe("/cards"));
    await waitFor(() => expect(nfc.awaitingCard()).toBe(false));
    expect(screen.queryByTestId("add-card-start")).toBeNull();

    await fireEvent.press(await screen.findByTestId("card-finish-migration", {}, SLOW));
    await waitFor(() => expect(nfc.awaitingCard()).toBe(true), SLOW);
    await fireEvent.press(screen.getByTestId("card-steps-cancel"));
    await waitFor(() => expect(router.getPathname()).toBe("/cards"));
    await waitFor(() => expect(nfc.awaitingCard()).toBe(false));
    expect(screen.queryByTestId("add-card-start")).toBeNull();
  });
});

describe('"Advanced settings": the card\'s mode and relay in a panel of their own', () => {
  it('leads to "Payments without confirmation" and "Relay and programming", each page back to it', async () => {
    const cardId = await pair();
    await open("/cards");
    await choose(cardId);
    // On "Cards", neither row: their panel's, whose row says what they hold.
    expect(screen.queryByTestId("card-payees")).toBeNull();
    expect(screen.queryByTestId("card-relay")).toBeNull();
    // Its relay not checked yet on this phone: its mode alone.
    await waitFor(
      () =>
        expect(screen.getByTestId("card-advanced").props.accessibilityLabel).toBe(
          "Advanced settings, Approved merchants"
        ),
      SLOW
    );

    const panel = await openTask(cardId, "card-advanced");
    expect(screen.getByRole("header", { name: "Advanced settings" })).toBeTruthy();
    expect(panel.getByText(unnamed(cardId))).toBeTruthy();
    expect(panel.queryByTestId("sheet-back")).toBeNull();
    await waitFor(
      () => expect(panel.getByTestId("card-payees")).toHaveTextContent(/Approved merchants/),
      SLOW
    );
    expect(panel.getByTestId("card-relay")).toHaveTextContent(HOST, { exact: false });

    // "Payments without confirmation": its pages, then back to "Advanced settings".
    await fireEvent.press(panel.getByTestId("card-payees"));
    expect(await panel.findByTestId("payees-mode", {}, SLOW)).toBeTruthy();
    expect(screen.getByRole("header", { name: "Payments without confirmation" })).toBeTruthy();
    await fireEvent.press(panel.getByTestId("payees-mode-change"));
    expect(await screen.findByRole("header", { name: "Change mode" })).toBeTruthy();
    await fireEvent.press(screen.getByTestId("sheet-back"));
    expect(
      await screen.findByRole("header", { name: "Payments without confirmation" })
    ).toBeTruthy();
    await fireEvent.press(screen.getByTestId("sheet-back"));
    expect(await screen.findByRole("header", { name: "Advanced settings" })).toBeTruthy();

    // "Relay and programming": the card's state checked, then back again.
    await fireEvent.press(await panel.findByTestId("card-relay"));
    expect(await panel.findByTestId("card-relay-ready", {}, SLOW)).toBeTruthy();
    expect(screen.getByRole("header", { name: "Relay and programming" })).toBeTruthy();
    await fireEvent.press(screen.getByTestId("sheet-back"));
    expect(await panel.findByTestId("card-relay")).toHaveTextContent(`${HOST} · Ready`, {
      exact: false
    });

    // Closed: its row says the mode, then the relay ready (not its host).
    await fireEvent.press(screen.getByRole("button", { name: "Close" }));
    await waitFor(() =>
      expect(screen.getByTestId("card-advanced").props.accessibilityLabel).toBe(
        "Advanced settings, Approved merchants · Relay ready"
      )
    );
    expect(screen.queryByTestId("card-advanced-warning")).toBeNull();
  });

  it("is as wide on a desktop as the pages it leads to", async () => {
    mockDesktop.mockReturnValue(true);
    windowOf(1440, 900);
    try {
      const cardId = await pair();
      await open("/cards");
      const panel = await openTask(cardId, "card-advanced");
      const width = () => StyleSheet.flatten(screen.getByTestId("card-sheet").props.style).maxWidth;
      expect(width()).toBe(560);
      await fireEvent.press(panel.getByTestId("card-payees"));
      expect(await panel.findByTestId("payees-mode", {}, SLOW)).toBeTruthy();
      expect(width()).toBe(560);
    } finally {
      await phoneWindow();
    }
  });
});

describe('"Cards": whom each card pays without asking', () => {
  /** "Payments without confirmation" of `cardId` from "Cards", its book read. */
  async function payeesOf(cardId: string) {
    await choose(cardId);
    const sheet = await toPayees();
    await sheet.findByTestId("payees-mode", {}, SLOW);
    return sheet;
  }

  /** Thursday 15 October 2026, 9:00 (local), a day the merchants below were approved. */
  const APPROVED_AT = new Date(2026, 9, 15, 9, 0).getTime();

  /** `text` with its digit groups split by any character (the device locale's). */
  function grouped(text: string): RegExp {
    return new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ (?=\d{3})/g, "."));
  }

  /** "Change mode", from the panel's list. */
  async function changeMode(sheet: ReturnType<typeof within>) {
    await fireEvent.press(sheet.getByTestId("payees-mode-change"));
    return sheet.findByTestId("payees-mode-save");
  }

  /** An Android phone that keeps a card's pass (card-passes.ts) and shows `signals`. */
  function phoneKeepingPasses(signals: deviceIntegrityModule.PhoneRiskSignal[]) {
    jest.spyOn(cardPassesModule, "cardPassesKept").mockReturnValue(true);
    return jest.spyOn(deviceIntegrityModule, "phoneRiskSignals").mockResolvedValue(signals);
  }

  /** Lets the signs read settle: what they show, shown. */
  async function settle() {
    await act(async () => {
      for (let turn = 0; turn < 100; turn++) await Promise.resolve();
    });
  }

  it("warns in the panel, and before its row's title, that a modified phone keeps the card less safe", async () => {
    const cardId = await pair();
    phoneKeepingPasses(["root"]);
    await open("/cards");
    await choose(cardId);
    // Not above the cards any more: on the row of the mode that pays without asking.
    const title = await screen.findByTestId("card-advanced-title-warning", {}, SLOW);
    expect(title).toBeTruthy();
    expect(screen.queryByTestId("cards-modified-phone")).toBeNull();
    expect(screen.getByTestId("card-advanced").props.accessibilityLabel).toBe(
      "This phone is less safe, Advanced settings, Approved merchants"
    );

    const sheet = await payeesOf(cardId);
    const notice = sheet.getByTestId("payees-modified-phone");
    expect(notice).toHaveTextContent(/This phone is less safe/);
    expect(notice).toHaveTextContent(/a malicious app could use it/);
    expect(notice).toHaveTextContent(/“Always confirm”/);

    // "Always confirm": nothing kept for it to pay without asking, no warning.
    await changeMode(sheet);
    await fireEvent.press(sheet.getByTestId("payees-mode-confirm"));
    await fireEvent.press(sheet.getByTestId("payees-mode-save"));
    await waitFor(
      () => expect(sheet.getByTestId("payees-mode")).toHaveTextContent(/Mode: always confirm/),
      SLOW
    );
    expect(sheet.queryByTestId("payees-modified-phone")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Close" }));
    await waitFor(
      () => expect(screen.getByTestId("card-advanced")).toHaveTextContent(/Always confirm/),
      SLOW
    );
    expect(screen.queryByTestId("card-advanced-title-warning")).toBeNull();
    expect(screen.getByTestId("card-advanced").props.accessibilityLabel).toBe(
      "Advanced settings, Always confirm"
    );
  });

  it('warns of nothing on a modified phone for a card in "Always confirm"', async () => {
    const cardId = await pair();
    await setCardPayeeMode(TEST_WALLET_ID, { cardId, walletGeneration: 1 }, "confirm");
    phoneKeepingPasses(["hooks"]);
    await open("/cards");
    await choose(cardId);
    await waitFor(
      () => expect(screen.getByTestId("card-advanced")).toHaveTextContent(/Always confirm/),
      SLOW
    );
    await settle();
    expect(screen.queryByTestId("card-advanced-title-warning")).toBeNull();
    const sheet = await payeesOf(cardId);
    await settle();
    expect(sheet.queryByTestId("payees-modified-phone")).toBeNull();
  });

  it("warns of nothing where the phone keeps cards' passes but shows no sign", async () => {
    const cardId = await pair();
    const signals = phoneKeepingPasses([]);
    await open("/cards");
    await choose(cardId);
    await waitFor(
      () => expect(screen.getByTestId("card-advanced")).toHaveTextContent(/Approved merchants/),
      SLOW
    );
    // Its signs read: none.
    await waitFor(() => expect(signals).toHaveBeenCalled());
    await settle();
    expect(screen.queryByTestId("card-advanced-title-warning")).toBeNull();
    const sheet = await payeesOf(cardId);
    await settle();
    expect(sheet.queryByTestId("payees-modified-phone")).toBeNull();
  });

  it("warns of nothing where the phone keeps no card's pass, its signs not even read", async () => {
    const cardId = await pair();
    // An iPhone, or the card socket off: no pass kept.
    jest.spyOn(cardPassesModule, "cardPassesKept").mockReturnValue(false);
    const signals = jest
      .spyOn(deviceIntegrityModule, "phoneRiskSignals")
      .mockResolvedValue(["root"]);
    await open("/cards");
    await choose(cardId);
    await waitFor(
      () => expect(screen.getByTestId("card-advanced")).toHaveTextContent(/Approved merchants/),
      SLOW
    );
    const sheet = await payeesOf(cardId);
    await settle();
    expect(sheet.queryByTestId("payees-modified-phone")).toBeNull();
    expect(screen.queryByTestId("card-advanced-title-warning")).toBeNull();
    expect(signals).not.toHaveBeenCalled();
  });

  it("says the card's mode under its row, then in its panel, and changes it there", async () => {
    const cardId = await pair();
    await open("/cards");
    await choose(cardId);
    await waitFor(
      () => expect(screen.getByTestId("card-advanced")).toHaveTextContent(/Approved merchants/),
      SLOW
    );
    const sheet = await payeesOf(cardId);
    // Its title, and the card it is of.
    expect(screen.getByRole("header", { name: "Payments without confirmation" })).toBeTruthy();
    expect(sheet.getByText(unnamed(cardId))).toBeTruthy();
    expect(sheet.getByTestId("payees-mode")).toHaveTextContent(
      "Mode: approved merchantsElsewhere, your phone asks you to confirm"
    );
    // The box is pressed as a whole, as one button named for what it does.
    expect(
      sheet.getByRole("button", { name: `Change the confirmation mode of ${unnamed(cardId)}` })
    ).toBe(sheet.getByTestId("payees-mode-change"));
    expect(within(sheet.getByTestId("payees-mode-change")).getByTestId("payees-mode")).toBe(
      sheet.getByTestId("payees-mode")
    );
    // No merchant yet: the list's frame says so, and how one is approved,
    // the list titled for its card, not by the mode's name.
    expect(sheet.getByTestId("payees-approved-label")).toHaveTextContent("Approved for this card");
    expect(sheet.getByTestId("payees-empty-title")).toHaveTextContent("No approved merchant");
    expect(sheet.getByTestId("payees-empty-lead")).toHaveTextContent(
      "When you confirm a payment with this card, tick “Approve this merchant”: its next payments will go without confirmation."
    );
    // Said once: in the frame, not again under it.
    expect(sheet.queryByTestId("payees-approve-note")).toBeNull();

    // "Change mode": the current one chosen, nothing to save yet.
    const save = await changeMode(sheet);
    expect(screen.getByRole("header", { name: "Change mode" })).toBeTruthy();
    expect(sheet.getByText(unnamed(cardId))).toBeTruthy();
    expect(sheet.getByTestId("payees-mode-approved").props.accessibilityState).toMatchObject({
      checked: true
    });
    expect(sheet.getByTestId("payees-mode-approved").props.accessibilityLabel).toBe(
      "Approved merchants, Recommended. Paid without confirmation at an identified merchant you approved; elsewhere, your phone asks you to confirm."
    );
    expect(save.props.accessibilityState).toMatchObject({ disabled: true });
    // Any change with the passkey, its button says so: no note under it.
    expect(save).toHaveTextContent("Confirm with my passkey", { exact: false });
    expect(sheet.queryByTestId("payees-mode-note")).toBeNull();

    // Fewer confirmations: the passkey first.
    await fireEvent.press(sheet.getByTestId("payees-mode-automatic"));
    expect(sheet.getByTestId("payees-mode-save")).toHaveTextContent("Confirm with my passkey", {
      exact: false
    });
    expect(sheet.queryByTestId("payees-mode-note")).toBeNull();
    expect(signIn).not.toHaveBeenCalled();
    await fireEvent.press(sheet.getByTestId("payees-mode-save"));
    // Saved: back on the list, which says it.
    await waitFor(
      () =>
        expect(sheet.getByTestId("payees-mode")).toHaveTextContent(
          "Mode: automaticEvery valid tap is paid, within the limits"
        ),
      SLOW
    );
    expect(signIn).toHaveBeenCalledTimes(1);
    expect((await loadCardPayees(TEST_WALLET_ID, { cardId, walletGeneration: 1 })).mode).toBe(
      "automatic"
    );
    // Outside "Approved merchants", no payment approves its merchant: no note says so, the
    // empty frame says only that none is.
    expect(sheet.getByTestId("payees-empty-title")).toHaveTextContent("No approved merchant");
    expect(sheet.queryByTestId("payees-empty-lead")).toBeNull();
    expect(sheet.queryByTestId("payees-approve-note")).toBeNull();

    // More confirmations: with the passkey too, the same button.
    await changeMode(sheet);
    await fireEvent.press(sheet.getByTestId("payees-mode-confirm"));
    expect(sheet.getByTestId("payees-mode-save")).toHaveTextContent("Confirm with my passkey", {
      exact: false
    });
    expect(sheet.queryByTestId("payees-mode-note")).toBeNull();
    await fireEvent.press(sheet.getByTestId("payees-mode-save"));
    await waitFor(
      () => expect(sheet.getByTestId("payees-mode")).toHaveTextContent(/Mode: always confirm/),
      SLOW
    );
    expect(signIn).toHaveBeenCalledTimes(2);
    // Closed: its row says the mode.
    await fireEvent.press(screen.getByRole("button", { name: "Close" }));
    await waitFor(
      () => expect(screen.getByTestId("card-advanced")).toHaveTextContent(/Always confirm/),
      SLOW
    );
    expect(screen.getByTestId("card-advanced")).not.toHaveTextContent(/not yet/);
  });

  it("is each card's own: a mode chosen for one leaves the other's", async () => {
    const first = await pair();
    const second = await pair(new FakeNtag424("04a39493cc8680"));
    await open("/cards");
    const sheet = await payeesOf(first);
    await changeMode(sheet);
    await fireEvent.press(sheet.getByTestId("payees-mode-confirm"));
    await fireEvent.press(sheet.getByTestId("payees-mode-save"));
    await waitFor(
      () => expect(sheet.getByTestId("payees-mode")).toHaveTextContent(/Mode: always confirm/),
      SLOW
    );
    await fireEvent.press(screen.getByRole("button", { name: "Close" }));
    await choose(second);
    await waitFor(
      () => expect(screen.getByTestId("card-advanced")).toHaveTextContent(/Approved merchants/),
      SLOW
    );
    expect(
      (await loadCardPayees(TEST_WALLET_ID, { cardId: second, walletGeneration: 1 })).mode
    ).toBe("approved");
    await choose(first);
    await waitFor(
      () => expect(screen.getByTestId("card-advanced")).toHaveTextContent(/Always confirm/),
      SLOW
    );
  });

  it("stays open while a change runs, its outcome then in it", async () => {
    const cardId = await pair();
    await open("/cards");
    const sheet = await payeesOf(cardId);
    await changeMode(sheet);
    // The passkey asked: held until the test answers it.
    let confirm!: () => void;
    signIn.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          confirm = () => resolve({ seed: testSeed(), credentialId: null });
        })
    );
    await fireEvent.press(sheet.getByTestId("payees-mode-automatic"));
    await fireEvent.press(sheet.getByTestId("payees-mode-save"));
    await waitFor(() => expect(signIn).toHaveBeenCalledTimes(1));
    // Neither its close button, nor its way back, nor another choice meanwhile.
    expect(screen.getByRole("button", { name: "Close" })).toBeDisabled();
    expect(screen.getByTestId("sheet-back")).toBeDisabled();
    await fireEvent.press(sheet.getByTestId("payees-mode-confirm"));
    expect(sheet.getByTestId("payees-mode-automatic").props.accessibilityState).toMatchObject({
      checked: true
    });
    await act(async () => confirm());
    await waitFor(
      () => expect(sheet.getByTestId("payees-mode")).toHaveTextContent(/Mode: automatic/),
      SLOW
    );
    await fireEvent.press(screen.getByRole("button", { name: "Close" }));
    await waitFor(
      () => expect(screen.getByTestId("card-advanced")).toHaveTextContent(/Automatic/),
      SLOW
    );
    expect((await loadCardPayees(TEST_WALLET_ID, { cardId, walletGeneration: 1 })).mode).toBe(
      "automatic"
    );
  });

  it("keeps the mode, without a word, when the passkey prompt is dismissed", async () => {
    const cardId = await pair();
    await open("/cards");
    const sheet = await payeesOf(cardId);
    await changeMode(sheet);
    signIn.mockRejectedValueOnce(new PasskeyError("cancelled", "Dismissed"));
    await fireEvent.press(sheet.getByTestId("payees-mode-automatic"));
    await fireEvent.press(sheet.getByTestId("payees-mode-save"));
    await waitFor(() => expect(signIn).toHaveBeenCalledTimes(1));
    // Still on its choice, nothing said, nothing changed.
    await waitFor(() =>
      expect(sheet.getByTestId("payees-mode-save").props.accessibilityState).toMatchObject({
        busy: false
      })
    );
    expect(sheet.getByTestId("payees-mode-automatic").props.accessibilityState).toMatchObject({
      checked: true
    });
    expect(sheet.queryByTestId("payees-error")).toBeNull();
    expect((await loadCardPayees(TEST_WALLET_ID, { cardId, walletGeneration: 1 })).mode).toBe(
      "approved"
    );
    // Another account's passkey: said so, nothing changed.
    signIn.mockResolvedValueOnce({ seed: testSeed(OTHER_TEST_MNEMONIC), credentialId: null });
    await fireEvent.press(sheet.getByTestId("payees-mode-save"));
    expect(await sheet.findByTestId("payees-error")).toBeTruthy();
    expect((await loadCardPayees(TEST_WALLET_ID, { cardId, walletGeneration: 1 })).mode).toBe(
      "approved"
    );
  });

  it("lists the approved merchants by name, newest first, with what the card paid each since", async () => {
    jest.useFakeTimers({ advanceTimers: true, now: new Date(2026, 9, 18, 12, 0) });
    const cardId = await pair();
    await approveCardPayee(
      TEST_WALLET_ID,
      { cardId, walletGeneration: 1 },
      { id: "sattleme01@breez.tips", name: "Lakeside Bakery" },
      APPROVED_AT
    );
    // Renamed by the merchant since: still approved.
    await noteCardPayee(
      TEST_WALLET_ID,
      { cardId, walletGeneration: 1 },
      { id: "sattleme01@breez.tips", name: "The Lake" },
      APPROVED_AT + 1000
    );
    await approveCardPayee(
      TEST_WALLET_ID,
      { cardId, walletGeneration: 1 },
      { id: "sattleme02@breez.tips", name: "Grocery" },
      APPROVED_AT + 3600_000
    );
    // Paid twice at the first since its approval, once before it (not counted), refused once.
    const paidThere: CardPaymentEntry[] = [
      {
        ...payment(cardId, "a1", APPROVED_AT - 60_000),
        ...payee("Lakeside Bakery", "sattleme01@breez.tips", "new")
      },
      {
        ...payment(cardId, "a2", APPROVED_AT + 60_000),
        amountSats: 2_500n,
        ...payee("The Lake", "sattleme01@breez.tips", "approved")
      },
      {
        ...payment(cardId, "a3", APPROVED_AT + 2 * 86_400_000),
        amountSats: 3_400n,
        ...payee("The Lake", "sattleme01@breez.tips", "approved")
      }
    ];
    for (const entry of paidThere) await logCardPayment(entry);
    await logCardPayment({
      ...payment(cardId, "a4", APPROVED_AT + 3 * 86_400_000),
      outcome: "declined",
      reason: "amount above limit",
      ...payee("The Lake", "sattleme01@breez.tips", "approved")
    });
    // The card's wallet tells each left.
    sdk.fakeCardWallet(cardId).payments = paidThere.map(leftWallet);
    await open("/cards");
    const sheet = await payeesOf(cardId);
    const list = within(await sheet.findByTestId("payees-list"));
    // The latest approval first; their count once the relays answered whole.
    await waitFor(
      () =>
        expect(list.getByTestId("payees-row-1")).toHaveTextContent(
          "The Lakeapproved on 15 Oct · 2 payments",
          { exact: false }
        ),
      SLOW
    );
    expect(list.getByTestId("payees-row-0")).toHaveTextContent(
      "Groceryapproved on 15 Oct · 0 payments",
      { exact: false }
    );
    expect(list.queryByText(/@breez\.tips/)).toBeNull();
    expect(list.getByTestId("payees-row-1-remove").props.accessibilityLabel).toBe(
      "Remove The Lake from approved merchants"
    );
    // Titled for its card with its count, how to add one under it; no empty frame.
    expect(sheet.getByTestId("payees-approved-label")).toHaveTextContent(
      "Approved for this card · 2"
    );
    expect(sheet.getByTestId("payees-approve-note")).toHaveTextContent(
      "To add one, tick “Approve this merchant” when you confirm a payment there."
    );
    expect(sheet.queryByTestId("payees-empty")).toBeNull();

    // A merchant: what it declares, its approval, the card's payments there.
    await fireEvent.press(list.getByTestId("payees-row-1-open"));
    expect(await sheet.findByTestId("payees-payee")).toBeTruthy();
    expect(screen.getByRole("header", { name: "The Lake" })).toBeTruthy();
    expect(sheet.getByTestId("payees-fact-name")).toHaveTextContent("Its nameThe Lake");
    expect(sheet.getByTestId("payees-fact-former")).toHaveTextContent(
      "Approved under the nameLakeside Bakery"
    );
    expect(sheet.getByTestId("payees-fact-approved")).toHaveTextContent(
      /Approved onThursday,? 15 October/
    );
    expect(sheet.getByTestId("payees-fact-payments")).toHaveTextContent(
      grouped("Payments2, for 5 900 sats")
    );
    expect(
      sheet.getByText("For you only. Left empty, the name declared by the merchant comes back.")
    ).toBeTruthy();
    expect(
      sheet.getByText(
        "You will be asked for your passkey. Its next payments will ask for your confirmation again."
      )
    ).toBeTruthy();
    // Nothing to save while its name is as it was.
    expect(sheet.queryByTestId("payees-name-save")).toBeNull();
    expect(sheet.getByTestId("payees-name-field").props.placeholder).toBe("The Lake");

    // Its own name, for the holder only.
    await fireEvent.changeText(sheet.getByTestId("payees-name-field"), "My bakery");
    await fireEvent.press(sheet.getByTestId("payees-name-save"));
    expect(await screen.findByRole("header", { name: "My bakery" })).toBeTruthy();
    expect(
      (await loadCardPayees(TEST_WALLET_ID, { cardId, walletGeneration: 1 })).approved[0]!.localName
    ).toBe("My bakery");
    await fireEvent.press(screen.getByTestId("sheet-back"));
    const renamed = within(await sheet.findByTestId("payees-list"));
    expect(renamed.getByTestId("payees-row-1")).toHaveTextContent(/My bakery/);

    // Removed from the list once the passkey confirms it; dismissed, nothing changed, nothing
    // said.
    expect(signIn).not.toHaveBeenCalled();
    signIn.mockRejectedValueOnce(new PasskeyError("cancelled", "Dismissed"));
    await fireEvent.press(renamed.getByTestId("payees-row-0-remove"));
    await waitFor(() => expect(signIn).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(sheet.getByTestId("payees-row-0-remove")).not.toBeDisabled());
    expect(sheet.queryByTestId("payees-error")).toBeNull();
    expect(
      (await loadCardPayees(TEST_WALLET_ID, { cardId, walletGeneration: 1 })).approved
    ).toHaveLength(2);
    // Confirmed: its next payment asks again.
    await fireEvent.press(sheet.getByTestId("payees-row-0-remove"));
    await waitFor(() =>
      expect(within(sheet.getByTestId("payees-list")).queryByTestId("payees-row-1")).toBeNull()
    );
    expect(signIn).toHaveBeenCalledTimes(2);
    expect(sheet.getByTestId("payees-row-0")).toHaveTextContent(/My bakery/);
    // And from its own panel, the same.
    await fireEvent.press(sheet.getByTestId("payees-row-0-open"));
    await fireEvent.press(await sheet.findByTestId("payees-remove"));
    expect(await sheet.findByTestId("payees-empty")).toBeTruthy();
    expect(signIn).toHaveBeenCalledTimes(3);
    expect(
      (await loadCardPayees(TEST_WALLET_ID, { cardId, walletGeneration: 1 })).approved
    ).toEqual([]);
  });

  it("shows a merchant approved by its node by its key, after its mark, and what it means", async () => {
    const cardId = await pair();
    const node = testNode(32);
    const shown = `Node ${node.nodeId.slice(0, 8)}…${node.nodeId.slice(-8)}`;
    await approveCardPayee(
      TEST_WALLET_ID,
      { cardId, walletGeneration: 1 },
      { id: node.nodeId, name: null },
      APPROVED_AT
    );
    await approveCardPayee(
      TEST_WALLET_ID,
      { cardId, walletGeneration: 1 },
      { id: "sattleme01@breez.tips", name: "Lakeside Bakery" },
      APPROVED_AT + 1000
    );
    await open("/cards");
    const sheet = await payeesOf(cardId);
    const list = within(await sheet.findByTestId("payees-list"));
    // Each after the mark of how it is identified: its address, its node.
    expect(list.getByTestId("payees-row-0")).toHaveTextContent(/Lakeside Bakery/);
    expect(within(list.getByTestId("payees-row-0")).getByTestId("payee-mark-address")).toBeTruthy();
    expect(list.getByTestId("payees-row-1")).toHaveTextContent(new RegExp(shown));
    expect(within(list.getByTestId("payees-row-1")).getByTestId("payee-mark-node")).toBeTruthy();
    expect(list.getByTestId("payees-row-1-open").props.accessibilityLabel).toMatch(
      new RegExp(`^${shown}, identified by its Lightning node, approved on`)
    );
    await fireEvent.press(list.getByTestId("payees-row-1-open"));
    expect(await sheet.findByTestId("payees-payee")).toBeTruthy();
    expect(sheet.getByTestId("payees-fact-node")).toHaveTextContent(
      `Its node${node.nodeId.slice(0, 8)}…${node.nodeId.slice(-8)}`
    );
    expect(sheet.queryByTestId("payees-fact-name")).toBeNull();
    expect(sheet.getByTestId("payees-node-note")).toBeTruthy();
    // Named by the holder: the name shown from then on.
    await fireEvent.changeText(sheet.getByTestId("payees-name-field"), "Market stall");
    await fireEvent.press(sheet.getByTestId("payees-name-save"));
    expect(await screen.findByRole("header", { name: "Market stall" })).toBeTruthy();
  });

  it("shows a node approved under its alias, its key beside it", async () => {
    const cardId = await pair();
    const node = testNode(33);
    await approveCardPayee(
      TEST_WALLET_ID,
      { cardId, walletGeneration: 1 },
      { id: node.nodeId, name: "LNBank" },
      APPROVED_AT
    );
    await open("/cards");
    const sheet = await payeesOf(cardId);
    const list = within(await sheet.findByTestId("payees-list"));
    expect(list.getByTestId("payees-row-0")).toHaveTextContent(/LNBank/);
    expect(within(list.getByTestId("payees-row-0")).getByTestId("payee-mark-node")).toBeTruthy();
    await fireEvent.press(list.getByTestId("payees-row-0-open"));
    expect(await sheet.findByTestId("payees-payee")).toBeTruthy();
    expect(sheet.getByTestId("payees-fact-name")).toHaveTextContent("Its nameLNBank");
    expect(sheet.getByTestId("payees-fact-node")).toHaveTextContent(
      `Its node${node.nodeId.slice(0, 8)}…${node.nodeId.slice(-8)}`
    );
  });

  it("says a change the relays did not take, under its row too, then publishes it", async () => {
    const cardId = await pair();
    await open("/cards");
    let sheet = await payeesOf(cardId);
    // The account's relays take nothing now (a full disk, a write policy).
    for (const relay of currentRelays()) nostr.readOnly.add(relay);
    await changeMode(sheet);
    await fireEvent.press(sheet.getByTestId("payees-mode-confirm"));
    await fireEvent.press(sheet.getByTestId("payees-mode-save"));
    // Kept on this phone, which decides its payments with it; not yet for the other devices.
    expect(await sheet.findByTestId("payees-pending", {}, SLOW)).toHaveTextContent(
      /Saved on this phone, not yet on your account's relays/
    );
    expect((await loadCardPayees(TEST_WALLET_ID, { cardId, walletGeneration: 1 })).mode).toBe(
      "confirm"
    );
    await fireEvent.press(screen.getByRole("button", { name: "Close" }));
    await waitFor(
      () =>
        expect(screen.getByTestId("card-advanced")).toHaveTextContent(
          /Always confirm · not yet on the relays/
        ),
      SLOW
    );

    // Opened again: still not taken, until the relays take it ("Try again").
    sheet = await payeesOf(cardId);
    expect(await sheet.findByTestId("payees-pending", {}, SLOW)).toBeTruthy();
    nostr.readOnly.clear();
    await fireEvent.press(sheet.getByTestId("payees-pending-retry"));
    await waitFor(() => expect(sheet.queryByTestId("payees-pending")).toBeNull(), SLOW);
    expect(
      bookOf(await loadPayeeBooks(TEST_WALLET_ID), { cardId, walletGeneration: 1 }).unpublished
    ).toEqual(new Set());
    await fireEvent.press(screen.getByRole("button", { name: "Close" }));
    await waitFor(
      () => expect(screen.getByTestId("card-advanced")).toHaveTextContent(/Always confirm/),
      SLOW
    );
    expect(screen.getByTestId("card-advanced")).not.toHaveTextContent(/not yet/);
  });

  it("says the card it is of by its name, and an approval of another year with its year", async () => {
    jest.useFakeTimers({ advanceTimers: true, now: new Date(2026, 9, 18, 12, 0) });
    const cardId = await pair();
    await customizeCard(cardId, { name: "Everyday" });
    // Approved a year ago: its payments of the last 90 days only, said so.
    const approvedAt = new Date(2025, 9, 15, 9, 0).getTime();
    await approveCardPayee(
      TEST_WALLET_ID,
      { cardId, walletGeneration: 1 },
      { id: "sattleme01@breez.tips", name: "The Lake" },
      approvedAt
    );
    const recent = {
      ...payment(cardId, "a1", Date.now() - 2 * 86_400_000),
      ...payee("The Lake", "sattleme01@breez.tips", "approved")
    };
    await logCardPayment(recent);
    sdk.fakeCardWallet(cardId).payments = [leftWallet(recent)];
    await open("/cards");
    const sheet = await payeesOf(cardId);
    expect(sheet.getByText("Card Everyday")).toBeTruthy();
    expect(sheet.getByTestId("payees-mode-change").props.accessibilityLabel).toBe(
      "Change the confirmation mode of Everyday"
    );
    await waitFor(
      () =>
        expect(sheet.getByTestId("payees-row-0")).toHaveTextContent(
          "The Lakeapproved on 15 Oct 2025 · 1 payment in 90 days",
          { exact: false }
        ),
      SLOW
    );
    // One initial.
    expect(within(sheet.getByTestId("payees-row-0")).getByText("T")).toBeTruthy();
    await fireEvent.press(sheet.getByTestId("payees-row-0-open"));
    expect(await sheet.findByTestId("payees-payee")).toBeTruthy();
    // The device's format (Intl): its punctuation is the locale data's.
    expect(sheet.getByTestId("payees-fact-approved")).toHaveTextContent(
      /^Approved onWednesday,? 15 October 2025$/
    );
    expect(sheet.getByTestId("payees-fact-payments")).toHaveTextContent(
      grouped("Payments1 in 90 days, for 2 000 sats")
    );
  });

  it('counts the approved merchants in any mode, but says how to add one in "Approved merchants" only', async () => {
    const cardId = await pair();
    await approveCardPayee(
      TEST_WALLET_ID,
      { cardId, walletGeneration: 1 },
      { id: "sattleme01@breez.tips", name: "Lakeside Bakery" },
      APPROVED_AT
    );
    await setCardPayeeMode(TEST_WALLET_ID, { cardId, walletGeneration: 1 }, "confirm");
    await cardsOn(cardId, /Always confirm/);
    const sheet = await payeesOf(cardId);
    expect(await sheet.findByTestId("payees-list")).toBeTruthy();
    expect(sheet.getByTestId("payees-approved-label")).toHaveTextContent(
      "Approved for this card · 1"
    );
    // No payment approves its merchant in this mode: no note says one would.
    expect(sheet.queryByTestId("payees-approve-note")).toBeNull();
    expect(sheet.queryByTestId("payees-empty")).toBeNull();
  });

  it('asks the passkey for any mode, "Always confirm" too, while the relays do not answer', async () => {
    const cardId = await pair();
    await setCardPayeeMode(TEST_WALLET_ID, { cardId, walletGeneration: 1 }, "automatic", {
      passkeyConfirmed: true
    });
    await open("/cards");
    for (const url of currentRelays()) nostr.unreachable.add(url);
    try {
      const sheet = await payeesOf(cardId);
      await changeMode(sheet);
      // The strictest: the passkey too, the same button, no note.
      await fireEvent.press(sheet.getByTestId("payees-mode-confirm"));
      expect(sheet.getByTestId("payees-mode-save")).toHaveTextContent("Confirm with my passkey", {
        exact: false
      });
      expect(sheet.queryByTestId("payees-mode-note")).toBeNull();
      await fireEvent.press(sheet.getByTestId("payees-mode-save"));
      // Kept on this phone, which decides its payments with it.
      expect(await sheet.findByTestId("payees-pending", {}, SLOW)).toBeTruthy();
      expect(signIn).toHaveBeenCalledTimes(1);
      expect((await loadCardPayees(TEST_WALLET_ID, { cardId, walletGeneration: 1 })).mode).toBe(
        "confirm"
      );
    } finally {
      nostr.unreachable.clear();
    }
  });

  it("never waits for the relays to save a mode: the passkey is asked whatever they hold", async () => {
    const cardId = await pair();
    await setCardPayeeMode(TEST_WALLET_ID, { cardId, walletGeneration: 1 }, "automatic", {
      passkeyConfirmed: true
    });
    await cardsOn(cardId, /Automatic/);
    await whileRelaysHeld(async (sheet, release) => {
      await changeMode(sheet);
      // Stricter, the relays still being read: its button at once, as for any mode.
      await fireEvent.press(sheet.getByTestId("payees-mode-approved"));
      expect(sheet.getByTestId("payees-mode-save")).not.toBeDisabled();
      expect(sheet.getByTestId("payees-mode-save").props.accessibilityState).toMatchObject({
        busy: false
      });
      // Dismissed: nothing changed, nothing said.
      signIn.mockRejectedValueOnce(new PasskeyError("cancelled", "Dismissed"));
      await fireEvent.press(sheet.getByTestId("payees-mode-save"));
      await waitFor(() => expect(signIn).toHaveBeenCalledTimes(1));
      await waitFor(() =>
        expect(sheet.getByTestId("payees-mode-save").props.accessibilityState).toMatchObject({
          busy: false
        })
      );
      expect(sheet.queryByTestId("payees-error")).toBeNull();
      expect((await loadCardPayees(TEST_WALLET_ID, { cardId, walletGeneration: 1 })).mode).toBe(
        "automatic"
      );
      await release();
      await fireEvent.press(sheet.getByTestId("payees-mode-save"));
      await waitFor(
        () =>
          expect(sheet.getByTestId("payees-mode")).toHaveTextContent(/Mode: approved merchants/),
        SLOW
      );
    });
    expect(signIn).toHaveBeenCalledTimes(2);
    expect((await loadCardPayees(TEST_WALLET_ID, { cardId, walletGeneration: 1 })).mode).toBe(
      "approved"
    );
  });

  /**
   * What another device changes with `change`, on the relays only: this phone's books are put back
   * as they were, as if it had not synced since.
   */
  async function onAnotherDevice(change: () => Promise<unknown>) {
    const ofBooks = (path: string) => path.includes(`/${CARD_PAYEES_DIR_NAME}/`);
    const kept = [...fileSystem.files].filter(([path]) => ofBooks(path));
    await change();
    await syncCardPayees();
    for (const path of [...fileSystem.files.keys()]) {
      if (ofBooks(path)) fileSystem.files.delete(path);
    }
    for (const [path, text] of kept) fileSystem.files.set(path, text);
  }

  /**
   * "Payments without confirmation" of the card chosen in "Cards", opened while the relays'
   * answers are held: `run` looks at it, then lets them answer (always: held, they would hold the
   * test's end too).
   */
  async function whileRelaysHeld(
    run: (sheet: ReturnType<typeof within>, release: () => Promise<void>) => Promise<void>
  ) {
    const held = nostr.holdQueries();
    let released = false;
    const release = async () => {
      released = true;
      await act(async () => held());
    };
    try {
      const sheet = await toPayees();
      await sheet.findByTestId("payees-mode", {}, SLOW);
      await run(sheet, release);
    } finally {
      if (!released) held();
    }
  }

  /** "Cards" on `cardId`, its mode read under its row (the relays read). */
  async function cardsOn(cardId: string, mode: RegExp) {
    await open("/cards");
    await choose(cardId);
    await waitFor(() => expect(screen.getByTestId("card-advanced")).toHaveTextContent(mode), SLOW);
  }

  it("goes back to the list when the merchant it shows was removed by another device", async () => {
    const cardId = await pair();
    const address = "sattleme01@breez.tips";
    await approveCardPayee(
      TEST_WALLET_ID,
      { cardId, walletGeneration: 1 },
      { id: address, name: "Lakeside Bakery" },
      APPROVED_AT
    );
    await syncCardPayees();
    await cardsOn(cardId, /Approved merchants/);
    await onAnotherDevice(() =>
      removeCardPayee(TEST_WALLET_ID, { cardId, walletGeneration: 1 }, address)
    );
    await whileRelaysHeld(async (sheet, release) => {
      // This phone's book still has it: its panel opens.
      await fireEvent.press(await sheet.findByTestId("payees-row-0-open"));
      expect(await screen.findByRole("header", { name: "Lakeside Bakery" })).toBeTruthy();
      // The relays tell it removed: the list, without it, under its own title.
      await release();
      expect(await sheet.findByTestId("payees-empty", {}, SLOW)).toBeTruthy();
      expect(screen.getByRole("header", { name: "Payments without confirmation" })).toBeTruthy();
      // Its way back as the list's: to "Advanced settings", not to the merchant.
      await fireEvent.press(screen.getByTestId("sheet-back"));
      expect(await screen.findByRole("header", { name: "Advanced settings" })).toBeTruthy();
    });
    expect(
      (await loadCardPayees(TEST_WALLET_ID, { cardId, walletGeneration: 1 })).approved
    ).toEqual([]);
  });

  it('chooses anew from a mode another device changed while "Change mode" shows', async () => {
    const cardId = await pair();
    await cardsOn(cardId, /Approved merchants/);
    await onAnotherDevice(() =>
      setCardPayeeMode(TEST_WALLET_ID, { cardId, walletGeneration: 1 }, "confirm")
    );
    await whileRelaysHeld(async (sheet, release) => {
      // This phone's book: "Approved merchants", nothing to save.
      const save = await changeMode(sheet);
      expect(sheet.getByTestId("payees-mode-approved").props.accessibilityState).toMatchObject({
        checked: true
      });
      expect(save.props.accessibilityState).toMatchObject({ disabled: true });
      // "Always confirm" from the relays: chosen, still nothing to save (no passkey asked
      // for a change the holder never made).
      await release();
      await waitFor(
        () =>
          expect(sheet.getByTestId("payees-mode-confirm").props.accessibilityState).toMatchObject({
            checked: true
          }),
        SLOW
      );
      expect(sheet.getByTestId("payees-mode-save").props.accessibilityState).toMatchObject({
        disabled: true
      });
      expect(sheet.queryByTestId("payees-mode-note")).toBeNull();
    });
    expect(signIn).not.toHaveBeenCalled();
  });

  it("keeps the mode being saved while another device's change comes in", async () => {
    const cardId = await pair();
    await cardsOn(cardId, /Approved merchants/);
    await onAnotherDevice(() =>
      setCardPayeeMode(TEST_WALLET_ID, { cardId, walletGeneration: 1 }, "confirm")
    );
    // The passkey asked: held until the test answers it.
    let confirm!: () => void;
    signIn.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          confirm = () => resolve({ seed: testSeed(), credentialId: null });
        })
    );
    await whileRelaysHeld(async (sheet, release) => {
      await changeMode(sheet);
      await fireEvent.press(sheet.getByTestId("payees-mode-automatic"));
      await fireEvent.press(sheet.getByTestId("payees-mode-save"));
      // The panel's read answers first ("Always confirm"), then the save's own: looser than
      // it, the passkey. The choice being saved stays shown meanwhile.
      await release();
      await waitFor(() => expect(signIn).toHaveBeenCalledTimes(1), SLOW);
      expect(sheet.getByTestId("payees-mode-automatic").props.accessibilityState).toMatchObject({
        checked: true
      });
      await act(async () => confirm());
      await waitFor(
        () => expect(sheet.getByTestId("payees-mode")).toHaveTextContent(/Mode: automatic/),
        SLOW
      );
    });
    expect((await loadCardPayees(TEST_WALLET_ID, { cardId, walletGeneration: 1 })).mode).toBe(
      "automatic"
    );
  });

  it("is not shown without a card", async () => {
    await open("/cards");
    expect(await screen.findByTestId("cards-pair", {}, SLOW)).toBeTruthy();
    expect(screen.queryByTestId("card-advanced")).toBeNull();
  });

  describe("on a desktop", () => {
    beforeEach(() => {
      mockDesktop.mockReturnValue(true);
      windowOf(1440, 900);
    });
    afterEach(phoneWindow);

    const dialogWidth = () =>
      StyleSheet.flatten(screen.getByTestId("card-sheet").props.style).maxWidth;

    it('changes the mode with "Cancel" beside its button, its choices ringed', async () => {
      const cardId = await pair();
      await open("/cards");
      const sheet = await payeesOf(cardId);
      expect(dialogWidth()).toBe(560);
      await changeMode(sheet);
      expect(dialogWidth()).toBe(560);
      // Ringed choices, not raised cards: the one not chosen in the ring of a field.
      const confirm = StyleSheet.flatten(sheet.getByTestId("payees-mode-confirm").props.style);
      expect(confirm).toMatchObject({ borderColor: colors.border.subtle, boxShadow: "none" });
      expect(
        StyleSheet.flatten(sheet.getByTestId("payees-mode-approved").props.style).borderColor
      ).toBe(palette.orange);
      // Looser or stricter: the passkey said on its button, beside "Cancel", no note.
      await fireEvent.press(sheet.getByTestId("payees-mode-automatic"));
      expect(sheet.getByTestId("payees-mode-save")).toHaveTextContent(/Confirm with my passkey$/);
      await fireEvent.press(sheet.getByTestId("payees-mode-confirm"));
      expect(sheet.getByTestId("payees-mode-save")).toHaveTextContent(/Confirm with my passkey$/);
      expect(sheet.queryByTestId("payees-mode-note")).toBeNull();
      // "Cancel": back to the list, nothing changed, nothing asked.
      await fireEvent.press(sheet.getByTestId("payees-mode-cancel"));
      expect(await sheet.findByTestId("payees-mode")).toHaveTextContent(/Mode: approved merchants/);
      expect(signIn).not.toHaveBeenCalled();
      expect((await loadCardPayees(TEST_WALLET_ID, { cardId, walletGeneration: 1 })).mode).toBe(
        "approved"
      );
    });

    it("says what removing a merchant means beside its button, on one line", async () => {
      const cardId = await pair();
      await approveCardPayee(
        TEST_WALLET_ID,
        { cardId, walletGeneration: 1 },
        { id: "sattleme01@breez.tips", name: "Lakeside Coffee" },
        APPROVED_AT
      );
      await open("/cards");
      const sheet = await payeesOf(cardId);
      await fireEvent.press(await sheet.findByTestId("payees-row-0-open", {}, SLOW));
      const payee = within(await sheet.findByTestId("payees-payee"));
      expect(dialogWidth()).toBe(560);
      const hint = payee.getByText(
        "You will be asked for your passkey. Its next payments will ask for your confirmation again."
      );
      const remove = payee.getByTestId("payees-remove");
      // Side by side: the hint taking what the button leaves.
      expect(StyleSheet.flatten(hint.parent!.props.style)).toMatchObject({ flexDirection: "row" });
      expect(StyleSheet.flatten(hint.props.style)).toMatchObject({ flex: 1 });
      expect(remove).toHaveTextContent(/Remove from approved merchants$/);
      // A name typed: saved on its own button, at the end of the line.
      await fireEvent.changeText(payee.getByTestId("payees-name-field"), "The coffee shop");
      expect(StyleSheet.flatten(payee.getByTestId("payees-name-save").props.style)).toMatchObject({
        minWidth: 180,
        alignSelf: "flex-end"
      });
      await fireEvent.press(payee.getByTestId("payees-name-save"));
      await waitFor(
        () => expect(screen.getByRole("header", { name: "The coffee shop" })).toBeTruthy(),
        SLOW
      );
      // Removed: back to the list, which shows it no more.
      await fireEvent.press(sheet.getByTestId("payees-remove"));
      expect(await sheet.findByTestId("payees-empty-title", {}, SLOW)).toHaveTextContent(
        "No approved merchant"
      );
    });
  });
});

describe('"Cards" on the web', () => {
  // The layouts without their stack: the web's measures its frame, Jest has no layout.
  const web = {
    ...routes,
    "(app)/settings/_layout": () => (
      <PayoutDraftProvider>
        <Slot />
      </PayoutDraftProvider>
    ),
    "(app)/cards/_layout": Slot
  };
  const root = deriveCardRoot(walletSecret(testSeed()));
  const keys = deriveCardRecordKeys(root);

  /** From here, the web app: no NFC, nothing kept on the device, its memory empty. */
  function goWeb() {
    jest.replaceProperty(Platform, "OS", "web");
    mockWeb.on = true;
    resetCardStates();
  }

  /**
   * Back on the phone that paired the card. The web page closes first: Jest runs both in one
   * memory, where the page would follow the phone's (rendered outside act()).
   */
  async function goPhone() {
    await screen.unmount();
    jest.restoreAllMocks();
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    mockWeb.on = false;
    resetCardStates();
  }

  /** What a majority of the relays hold of the card. */
  async function onRelays(cardId: string): Promise<CardState | undefined> {
    const answers = await queryRelays(cardStatesFilter(keys), {
      relays: currentRelays(),
      channel: "account",
      timeoutMs: 1000
    });
    return cardStatesOf(keys, root, answers).states.get(cardId);
  }

  /** What the relays hold of the card's own copy, which a phone keeping its pass reads. */
  async function ownCopyOnRelays(cardId: string): Promise<CardState | null> {
    const wallet = { cardId, walletGeneration: 1 };
    const own = cardOwnKeys(cardOwnSecret(root, wallet));
    const answers = await queryRelays(cardOwnFilter(own), {
      relays: currentRelays(),
      channel: "account",
      timeoutMs: 1000
    });
    return cardOwnCopiesOf(own, wallet, answers, { root }).state;
  }

  afterEach(() => {
    mockWeb.on = false;
    forgetCardPayees();
  });

  it("is a destination of the navigation, as on the phone", async () => {
    const cardId = await pair();
    goWeb();
    const { router } = await open("/settings", web);
    expect(await screen.findByTestId("settings-card-network")).toBeTruthy();
    expect(screen.queryByText("Cards")).toBeNull();
    await fireEvent.press(screen.getByTestId("dock-more"));
    await fireEvent.press(screen.getByTestId("more-cards"));
    await waitFor(() => expect(router.getPathname()).toBe("/cards"));
    expect(await screen.findByTestId(`card-slot-${cardId}`, {}, SLOW)).toBeTruthy();
  });

  it("shows the account's cards from its relays, and sends to the phone to add one", async () => {
    const cardId = await pair();
    const calls = nfc.calls.length;
    goWeb();
    await open("/cards", web);
    const slot = await screen.findByTestId(`card-slot-${cardId}`, {}, SLOW);
    expect(within(slot).getByText(unnamed(cardId))).toBeTruthy();
    await fireEvent.press(screen.getByTestId("card-slot-add"));
    expect(await screen.findByTestId("cards-pair-phone")).toHaveTextContent(
      /open the app on your phone/
    );
    expect(screen.queryByTestId("cards-pair")).toBeNull();
    expect(nfc.calls).toHaveLength(calls);
  });

  it("without a card, says what one does, then sends to the phone to add it", async () => {
    goWeb();
    await open("/cards", web);
    const guide = await screen.findByTestId("cards-add", {}, SLOW);
    expect(within(guide).getByRole("header", { name: "Add your first card" })).toBeTruthy();
    expect(within(guide).getByLabelText(/^1\. Program it, /)).toBeTruthy();
    // The web app cannot program a card: no button, where to do it in its place.
    expect(within(guide).getByTestId("cards-pair-phone")).toHaveTextContent(
      /open the app on your phone/
    );
    expect(screen.queryByTestId("cards-pair")).toBeNull();
    expect(screen.queryByTestId("card-slot-add")).toBeNull();
    // No store said where the device is not known to be a phone.
    expect(screen.queryByTestId("app-store-link")).toBeNull();
  });

  // A phone's browser is told to use its own app, with its store.
  it.each([
    {
      phone: "an Android phone",
      device: "android" as const,
      says: "To pair a card, use the sattle.me Android app: it programs the card, held against the phone.",
      store: "Get the app on Google Play",
      url: ANDROID_APP_URL
    },
    {
      phone: "an iPhone",
      device: "iphone" as const,
      says: "To pair a card, use the sattle.me iPhone app: it programs the card, held against the phone.",
      store: "Get the app on the App Store",
      url: IOS_APP_URL
    }
  ])("on $phone's browser, sends to its app and its store to add a card", async (phone) => {
    const opened = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
    mockBrowser.device = phone.device;
    goWeb();
    await open("/cards", web);
    const guide = await screen.findByTestId("cards-add", {}, SLOW);
    expect(within(guide).getByTestId("cards-pair-phone")).toHaveTextContent(phone.says);
    const link = within(guide).getByRole("link", { name: phone.store });
    await fireEvent.press(link);
    expect(opened).toHaveBeenCalledWith(phone.url);

    // "Add a card" opened at its address says the same.
    await screen.unmount();
    await open("/cards/pair", web);
    const pairCard = within(await screen.findByTestId("pair-card", {}, SLOW));
    expect(pairCard.getByText(phone.says)).toBeTruthy();
    expect(pairCard.getByRole("link", { name: phone.store })).toBeTruthy();
  });

  it("shows a card being migrated from its relays, to be finished on the phone", async () => {
    await migratingCard();
    goWeb();
    await open("/cards", web);
    expect(await screen.findByTestId("card-migrating-note", {}, SLOW)).toBeTruthy();
    expect(screen.getByTestId("card-finish-on-phone")).toHaveTextContent(
      /in the app on your phone, the card held against it/
    );
    expect(screen.queryByTestId("card-finish-migration")).toBeNull();
  });

  it("never shows a list no majority of the relays gave", async () => {
    await pair();
    goWeb();
    for (const url of currentRelays().slice(0, 3)) nostr.unreachable.add(url);
    await open("/cards", web);
    expect(await screen.findByTestId("cards-failed", {}, SLOW)).toHaveTextContent(
      /your account's relays are not answering/
    );
  });

  it('shows the card\'s relay, and leads "Change relay" to the phone with the card', async () => {
    const cardId = await pair();
    await customizeCard(cardId, { name: "Everyday" });
    const { relayHost } = (await onRelays(cardId))!;
    const calls = nfc.calls.length;
    goWeb();
    await open("/cards", web);
    const panel = await openRelay(cardId);
    // Its relay and what it does; nothing of the card's state, checked on the phone it wakes.
    const relay = within(panel.getByTestId("card-relay-web"));
    expect(relay.getByTestId("card-relay-host")).toHaveTextContent(relayHost);
    expect(
      relay.getByText(
        "It wakes your phone at each payment of the card, holding neither key nor funds."
      )
    ).toBeTruthy();
    // The relay's source, to host one's own: a computer is where a server is set up.
    const opened = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
    await fireEvent.press(relay.getByRole("link", { name: "sattleme/relay on github.com" }));
    expect(opened).toHaveBeenCalledWith("https://github.com/sattleme/relay");
    expect(
      relay.getByText(
        "A computer cannot read NFC cards: the card is programmed from the app, on a phone."
      )
    ).toBeTruthy();
    expect(panel.queryByTestId("card-relay-field")).toBeNull();
    expect(panel.queryByTestId("card-relay-check")).toBeNull();
    expect(relay.getByTestId("card-relay-change").props.accessibilityLabel).toBe(
      "Change relay, For a relay you host yourself, On the phone"
    );

    // The way there on the phone, the card in hand; no code on a phone's browser.
    await fireEvent.press(relay.getByTestId("card-relay-change"));
    const steps = within(await panel.findByTestId("card-relay-on-phone"));
    expect(panel.getByRole("header", { name: "Change relay" })).toBeTruthy();
    expect(
      steps.getByRole("header", { name: "On your phone, with the card in hand" })
    ).toBeTruthy();
    expect(steps.getByLabelText("1. Open sattle.me on your phone")).toBeTruthy();
    expect(
      steps.getByLabelText("2. Everyday › Advanced settings › Relay and programming › Change relay")
    ).toBeTruthy();
    expect(
      steps.getByLabelText(
        "3. Hold the card to the phone, When the app asks for it, until the end of the steps."
      )
    ).toBeTruthy();
    expect(panel.queryByTestId("card-on-phone-code")).toBeNull();

    expect(relay.queryByTestId("app-store-link")).toBeNull();

    // Back to its relay, then closed: nothing asked of a card, nothing changed.
    await fireEvent.press(panel.getByTestId("sheet-back"));
    expect(await panel.findByTestId("card-relay-web")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByTestId("card-sheet")).toBeNull());
    expect(nfc.calls).toHaveLength(calls);
    expect(await onRelays(cardId)).toMatchObject({ status: "active", relayHost });
  });

  // No "computer" on a phone nor on an iPad.
  it.each([
    {
      device: "android" as const,
      says: "A browser cannot program a card: it is programmed from the sattle.me Android app.",
      store: "Get the app on Google Play",
      url: ANDROID_APP_URL
    },
    {
      device: "iphone" as const,
      says: "A browser cannot program a card: it is programmed from the sattle.me iPhone app.",
      store: "Get the app on the App Store",
      url: IOS_APP_URL
    },
    {
      device: "ipad" as const,
      says: "This device cannot read NFC cards: the card is programmed from the app, on a phone.",
      store: null,
      url: null
    }
  ])(
    "says of the card's relay in a browser of $device what this device can do",
    async (browser) => {
      const opened = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
      const cardId = await pair();
      mockBrowser.device = browser.device;
      goWeb();
      await open("/cards", web);
      const panel = await openRelay(cardId);
      const relay = within(panel.getByTestId("card-relay-web"));
      expect(relay.getByText(browser.says)).toBeTruthy();
      expect(relay.queryByText(/A computer/)).toBeNull();
      if (browser.store === null) {
        expect(relay.queryByTestId("app-store-link")).toBeNull();
      } else {
        await fireEvent.press(relay.getByRole("link", { name: browser.store }));
        expect(opened).toHaveBeenCalledWith(browser.url);
      }
    }
  );

  it('leaves the card\'s deletion to the phone that holds it, "I have it with me" chosen first', async () => {
    const cardId = await pair();
    await customizeCard(cardId, { name: "Everyday" });
    const calls = nfc.calls.length;
    goWeb();
    await open("/cards", web);
    const panel = await openTask(cardId, "card-delete");
    expect(panel.getByRole("header", { name: "Delete Everyday" })).toBeTruthy();
    expect(panel.getByText("Erased for good")).toBeTruthy();
    // The phone's "I have the card with me" as a choice, the card in hand at first.
    const group = panel.getByTestId("card-delete-choice");
    expect(group.props.accessibilityRole).toBe("radiogroup");
    expect(group.props.accessibilityLabel).toBe("The card");
    const choice = within(group);
    expect(choice.getByTestId("card-delete-with-card").props.accessibilityState).toEqual({
      checked: true
    });
    expect(choice.getByTestId("card-delete-with-card").props.accessibilityLabel).toBe(
      "I have it with me, It becomes blank again"
    );
    expect(choice.getByTestId("card-delete-without-card").props.accessibilityState).toEqual({
      checked: false
    });
    // In hand: the way there on the phone, nothing deleted here.
    expect(
      panel.getByLabelText(
        "2. Everyday › Delete the card, “I have the card with me” stays checked."
      )
    ).toBeTruthy();
    expect(
      panel.getByLabelText("3. Hold the card to the phone, When the app asks for it.")
    ).toBeTruthy();
    expect(panel.queryByTestId("card-delete-confirm")).toBeNull();
    await fireEvent.press(panel.getByTestId("card-delete-understood"));
    await waitFor(() => expect(screen.queryByTestId("card-sheet")).toBeNull());
    expect(nfc.calls).toHaveLength(calls);
    expect(await onRelays(cardId)).toMatchObject({ status: "active", name: "Everyday" });
    expect(screen.getByTestId(`card-slot-${cardId}`)).toBeTruthy();
  });

  it('deletes a card without it at once, "I don\'t have it" its confirmation, its channel left to the phone', async () => {
    const cardId = await pair();
    await customizeCard(cardId, { name: "Everyday" });
    const calls = nfc.calls.length;
    goWeb();
    await open("/cards", web);
    let panel = await openTask(cardId, "card-delete");
    await fireEvent.press(panel.getByTestId("card-delete-without-card"));
    expect(panel.getByTestId("card-delete-without-card").props.accessibilityState).toEqual({
      checked: true
    });
    expect(
      panel.getByText("If you find it, “Add a card”, in the app on your phone, will make it blank.")
    ).toBeTruthy();
    expect(panel.queryByTestId("card-on-phone-steps")).toBeNull();
    // "Cancel" leaves it as it is.
    await fireEvent.press(panel.getByTestId("card-delete-cancel"));
    await waitFor(() => expect(screen.queryByTestId("card-sheet")).toBeNull());
    expect(await onRelays(cardId)).toMatchObject({ status: "active" });

    // Opened again, the card in hand at first; without it, deleted at once: no other dialog.
    panel = await openTask(cardId, "card-delete");
    expect(panel.getByTestId("card-delete-with-card").props.accessibilityState).toEqual({
      checked: true
    });
    await fireEvent.press(panel.getByTestId("card-delete-without-card"));
    await fireEvent.press(panel.getByTestId("card-delete-confirm"));
    expect(screen.queryByTestId("card-delete-without")).toBeNull();
    await waitFor(() => expect(screen.queryByTestId("card-sheet")).toBeNull(), SLOW);
    expect(await screen.findByText("Everyday is deleted")).toBeTruthy();
    expect(await screen.findByText("Add your first card")).toBeTruthy();
    expect(nfc.calls).toHaveLength(calls);
    // Recorded deleted where every device reads it, nothing of its settings left.
    expect(await onRelays(cardId)).toMatchObject({ status: "deleted", name: "" });
    // Its channel is deleted by the phone that made it, at its next sync (sync.ts).
    expect(await channelOn(relay, cardId)).toBeDefined();
  });

  it("says a deletion no majority of the relays took unconfirmed, nothing kept here", async () => {
    const cardId = await pair();
    goWeb();
    await open("/cards", web);
    const panel = await openTask(cardId, "card-delete");
    for (const url of currentRelays()) nostr.readOnly.add(url);
    await fireEvent.press(panel.getByTestId("card-delete-without-card"));
    await fireEvent.press(panel.getByTestId("card-delete-confirm"));
    const failed = await panel.findByTestId("card-delete-failed", {}, SLOW);
    expect(failed).toHaveTextContent(/it may still apply, or not/);
    nostr.readOnly.clear();
    expect(await onRelays(cardId)).toMatchObject({ status: "active" });
  });

  it("erases what a deletion elsewhere left of a card on the relays, as a phone's sync does", async () => {
    const cardId = await pair();
    await customizeCard(cardId, { name: "Everyday" });
    // Recorded deleted by a device that did not erase its data: its name still in its record.
    await withCardAccess(async (access) => {
      const { updatedAt: _u, ...state } = knownCardState(TEST_WALLET_ID, cardId)!;
      await recordCardState(access, { ...state, status: "deleted" });
    });
    expect(await onRelays(cardId)).toMatchObject({ status: "deleted", name: "Everyday" });
    goWeb();
    await open("/cards", web);
    expect(await screen.findByText("Add your first card", {}, SLOW)).toBeTruthy();
    await waitFor(
      async () => expect(await onRelays(cardId)).toMatchObject({ status: "deleted", name: "" }),
      SLOW
    );
  });

  it("manages the card's own wallet: its balance, a recharge, its sats sent back", async () => {
    // The screens; the web build's wallet layer (wallet.web.ts) is card-wallet-layer-web.test.ts's.
    sdk.fakeWallet.balanceSats = 2_000n;
    const cardId = await pair();
    sdk.fakeCardWallet(cardId).balanceSats = 300n;
    goWeb();
    await open("/cards", web);
    await choose(cardId);
    expect(await screen.findByTestId("card-balance-sats", {}, SLOW)).toHaveTextContent(
      /^300 sats$/
    );
    expect(screen.getByTestId("card-wallet-recharge")).toBeEnabled();

    await emptyCard(await openReturn(cardId));
    await transferSays(/^300 sats withdrawn to your main balance$/);
    expect(signIn).toHaveBeenCalledTimes(1);
    expect(sdk.fakeWallet.balanceSats).toBe(2_300n);
    await waitFor(
      () => expect(screen.getByTestId("card-balance-sats")).toHaveTextContent(/^0 sats$/),
      SLOW
    );
  });

  it("pauses a card on its relays, said once they took it, which the phone reads", async () => {
    const cardId = await pair();
    goWeb();
    await open("/cards", web);
    await choose(cardId);
    const toggle = await screen.findByTestId("card-suspend");
    const release = nostr.holdPublishes();
    await fireEvent(toggle, "valueChange", true);
    // While its record is on its way: the switch waits, the card not said paused (a page closed
    // now would not have paused it).
    await waitFor(() =>
      expect(nostr.calls.some(({ operation }) => operation === "publish")).toBe(true)
    );
    expect(screen.getByTestId("card-suspend").props.accessibilityState).toEqual({
      checked: true,
      disabled: true,
      busy: true
    });
    expect(
      screen.getByTestId("card-suspend-spinner", { includeHiddenElements: true })
    ).toBeTruthy();
    expect(screen.queryByTestId("card-face-status")).toBeNull();
    release();
    expect(await screen.findByTestId("card-face-status", {}, SLOW)).toHaveTextContent(/Paused/);
    expect(await onRelays(cardId)).toMatchObject({ suspended: true });
    // The phone, which knew it in service: told at its next read.
    await goPhone();
    const { states } = await withCardAccess(refreshCardStates);
    expect(states.find((state) => state.cardId === cardId)).toMatchObject({ suspended: true });
  });

  it("says when no majority of the relays took a pause: not kept, never said done", async () => {
    const cardId = await pair();
    goWeb();
    await open("/cards", web);
    await choose(cardId);
    const toggle = await screen.findByTestId("card-suspend");
    for (const url of currentRelays()) nostr.readOnly.add(url);
    await fireEvent(toggle, "valueChange", true);
    expect(await screen.findByText("Error while saving", {}, SLOW)).toBeTruthy();
    expect(
      screen.getByText(/Your account's relays did not confirm this change: it may still/)
    ).toBeTruthy();
    // Back as it was: in service, said so nowhere else.
    await waitFor(() => expect(screen.getByTestId("card-suspend")).not.toBeChecked());
    expect(screen.queryByTestId("card-face-status")).toBeNull();
    nostr.readOnly.clear();
    expect(await onRelays(cardId)).toMatchObject({ suspended: false });
    // Not kept: never published behind its author's back once the relays answer again.
    await act(async () => {
      await withCardAccess(refreshCardStates);
    });
    expect(await onRelays(cardId)).toMatchObject({ suspended: false });
    expect(screen.queryByTestId("card-face-status")).toBeNull();
  });

  it("never says a pause some relays took is not made: it may still apply", async () => {
    const cardId = await pair();
    goWeb();
    await open("/cards", web);
    await choose(cardId);
    const toggle = await screen.findByTestId("card-suspend");
    // Two relays of five take it: no majority.
    for (const url of currentRelays().slice(0, 3)) nostr.readOnly.add(url);
    await fireEvent(toggle, "valueChange", true);
    expect(
      await screen.findByText(/did not confirm this change: it may still apply, or not/, {}, SLOW)
    ).toBeTruthy();
    // Those two keep it in the card's own copy, written first (own-copies.ts): a phone paying the
    // card with the app closed reads them and refuses it. The account's record waits for a majority
    // to hold the card's copy: none of its relays is ahead of what that phone reads.
    nostr.readOnly.clear();
    expect(await ownCopyOnRelays(cardId)).toMatchObject({ suspended: true });
    expect(await onRelays(cardId)).toMatchObject({ suspended: false });
  });

  it("keeps a pause asked before a change of a limit, both on the relays", async () => {
    const cardId = await pair();
    goWeb();
    await open("/cards", web);
    await choose(cardId);
    const toggle = await screen.findByTestId("card-suspend");
    // The pause on its way, slowly; meanwhile the ceiling is lowered.
    const release = nostr.holdPublishes();
    await fireEvent(toggle, "valueChange", true);
    await waitFor(() =>
      expect(nostr.calls.some(({ operation }) => operation === "publish")).toBe(true)
    );
    await fireEvent.press(screen.getByTestId("card-limits"));
    await fireEvent.press(await screen.findByTestId("card-ceiling"));
    await fireEvent.changeText(await screen.findByTestId("card-limit-field"), "5000");
    await fireEvent.press(screen.getByTestId("card-limit-save"));
    release();
    expect(await screen.findByTestId("card-limits-list", {}, SLOW)).toBeTruthy();
    // Each read the card once the one before was kept: neither undid the other.
    expect(await onRelays(cardId)).toMatchObject({ suspended: true, maxPaymentSats: 5_000n });
    await fireEvent.press(screen.getByTestId("card-limits-close"));
    expect(await screen.findByTestId("card-face-status")).toHaveTextContent(/Paused/);
  });

  it("shows the approved merchants from the relays, and changes the mode there", async () => {
    const cardId = await pair();
    await approveCardPayee(
      TEST_WALLET_ID,
      { cardId, walletGeneration: 1 },
      { id: "sattleme01@breez.tips", name: "Lakeside Bakery" },
      Date.now()
    );
    await syncCardPayees();
    goWeb();
    await open("/cards", web);
    await choose(cardId);
    const sheet = await toPayees();
    expect(await sheet.findByTestId("payees-row-0", {}, SLOW)).toHaveTextContent(/Lakeside Bakery/);
    await fireEvent.press(sheet.getByTestId("payees-mode-change"));
    await fireEvent.press(await sheet.findByTestId("payees-mode-confirm"));
    await fireEvent.press(sheet.getByTestId("payees-mode-save"));
    await waitFor(
      () => expect(sheet.getByTestId("payees-mode")).toHaveTextContent(/Mode: always confirm/),
      SLOW
    );
    await waitFor(() => expect(sheet.queryByTestId("payees-pending")).toBeNull(), SLOW);
    // On the relays: the phone reads it.
    await goPhone();
    await syncCardPayees();
    expect((await loadCardPayees(TEST_WALLET_ID, { cardId, walletGeneration: 1 })).mode).toBe(
      "confirm"
    );
  });

  it("says a change of the merchants the relays did not take is lost with the page", async () => {
    const cardId = await pair();
    goWeb();
    await open("/cards", web);
    await choose(cardId);
    const sheet = await toPayees();
    await fireEvent.press(await sheet.findByTestId("payees-mode-change", {}, SLOW));
    for (const url of currentRelays()) nostr.readOnly.add(url);
    await fireEvent.press(await sheet.findByTestId("payees-mode-automatic"));
    await fireEvent.press(sheet.getByTestId("payees-mode-save"));
    expect(await sheet.findByTestId("payees-pending", {}, SLOW)).toHaveTextContent(
      /will be lost if you leave the page/
    );
    // Its row says it too, once the panel closed.
    await fireEvent.press(screen.getByRole("button", { name: "Close" }));
    await waitFor(
      () =>
        expect(screen.getByTestId("card-advanced")).toHaveTextContent(
          /Automatic · not yet on the relays/
        ),
      SLOW
    );
  });

  it("says the mode is not read when no majority of the relays gave it", async () => {
    const cardId = await pair();
    goWeb();
    await open("/cards", web);
    await choose(cardId);
    await waitFor(
      () => expect(screen.getByTestId("card-advanced")).toHaveTextContent(/Approved merchants/),
      SLOW
    );
    // Read again once its panel closes: three of the five relays silent meanwhile.
    for (const url of currentRelays().slice(0, 3)) nostr.unreachable.add(url);
    const sheet = await toPayees();
    expect(await sheet.findByTestId("payees-failed", {}, SLOW)).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Close" }));
    await waitFor(
      () => expect(screen.getByTestId("card-advanced")).toHaveTextContent(/Not read yet/),
      SLOW
    );
  });

  it("shows what the card spent from the relays, under it and in its panel, read once, nothing of it no majority gave", async () => {
    const cardId = await pair();
    await logCardPayment({
      id: "d1",
      cardId,
      walletGeneration: 1,
      at: Date.now() - 3600_000 / 2,
      amountSats: 2_000n,
      paymentHash: "d1".padStart(64, "0"),
      description: "Croissants",
      outcome: "sent",
      reason: null,
      pr: "lnbc1",
      payee: null,
      preimage: null,
      value: null
    });
    await withCardAccess((access) => publishCardHistory(access));
    const second = await pair(new FakeNtag424("04a39493cc8680"));
    goWeb();
    await open("/cards", web);
    await choose(cardId);
    // Under the card ("Limits"): what it spent, as a majority of the relays hold it.
    await waitFor(
      () => expect(screen.getByTestId("card-limits-day")).toHaveTextContent(/2.000of 50.000 sats/),
      SLOW
    );
    expect(screen.getByTestId("card-limits-hour")).toHaveTextContent(/1payment of 5/);
    // Its panel counts the same read: shown at once, never "Reading the payments…" (it is read
    // again meanwhile, quietly).
    await openTask(cardId, "card-limits");
    expect(screen.queryByTestId("card-limits-reading")).toBeNull();
    expect(screen.getByTestId("card-day")).toHaveTextContent(/2.000of 50.000 sats/);
    expect(screen.getByTestId("card-hour")).toHaveTextContent(/1payment of 5/);
    expect(
      screen.getByText(/^Based on the card's payments your account's relays keep/)
    ).toBeTruthy();
    await fireEvent.press(screen.getByTestId("card-limits-close"));
    await waitFor(() => expect(screen.queryByTestId("card-limits-list")).toBeNull());

    // Another card chosen while the relays are read: its limits, nothing of what it spent.
    const release = nostr.holdQueries();
    await choose(second);
    expect(await screen.findByTestId("card-limits-preview-reading")).toBeTruthy();
    expect(screen.getByTestId("card-limits-day")).toHaveTextContent(/Limit: 50.000 sats/);
    expect(screen.getByTestId("card-limits-day")).not.toHaveTextContent(/of 50.000 sats/);
    // No majority of the relays: said, nothing of what was spent, until they answer again.
    for (const url of currentRelays().slice(0, 3)) nostr.unreachable.add(url);
    release();
    expect(await screen.findByTestId("card-limits-preview-unread", {}, SLOW)).toHaveTextContent(
      /Your account's relays did not answer: what the card has already paid is not shown/
    );
    expect(screen.getByTestId("card-limits-day")).toHaveTextContent(/Limit: 50.000 sats/);
    await openTask(second, "card-limits");
    expect(screen.getByTestId("card-limits-unread")).toBeTruthy();
    expect(screen.getByTestId("card-day")).toHaveTextContent(/Limit: 50.000 sats/);
    nostr.unreachable.clear();
    await fireEvent.press(screen.getByTestId("card-limits-retry"));
    await waitFor(
      // Nothing spent (0, after the "Change" chevron), not the first card's 2,000.
      () => expect(screen.getByTestId("card-day")).toHaveTextContent(/\D0of 50.000 sats/),
      SLOW
    );
    // Read again for both: under the card too.
    expect(screen.getByTestId("card-limits-day")).toHaveTextContent(/\D0of 50.000 sats/);
  });

  it("reads what the card spent again once its balance moved, what was read shown meanwhile", async () => {
    const cardId = await pair();
    await logCardPayment({
      id: "e1",
      cardId,
      walletGeneration: 1,
      at: Date.now() - 3600_000 / 2,
      amountSats: 2_000n,
      paymentHash: "e1".padStart(64, "0"),
      description: "Croissants",
      outcome: "sent",
      reason: null,
      pr: "lnbc1",
      payee: null,
      preimage: null,
      value: null
    });
    await withCardAccess((access) => publishCardHistory(access));
    sdk.fakeCardWallet(cardId).balanceSats = 10_000n;
    goWeb();
    await open("/cards", web);
    await choose(cardId);
    await waitFor(
      () => expect(screen.getByTestId("card-limits-day")).toHaveTextContent(/2.000of 50.000 sats/),
      SLOW
    );
    expect(await screen.findByTestId("card-balance-sats", {}, SLOW)).toHaveTextContent(
      /^10.000 sats$/
    );
    // Its balance moves (a payment of the card's): its payments read again, while what was read
    // shows, never "Reading the payments…".
    const release = nostr.holdQueries();
    sdk.fakeCardWallet(cardId).balanceSats = 7_000n;
    await sdkSays(cardId);
    await waitFor(
      () => expect(screen.getByTestId("card-balance-sats")).toHaveTextContent(/^7.000 sats$/),
      SLOW
    );
    expect(screen.queryByTestId("card-limits-preview-reading")).toBeNull();
    expect(screen.getByTestId("card-limits-day")).toHaveTextContent(/2.000of 50.000 sats/);
    // No majority answers it: what was read is no longer shown as what the card spent.
    for (const url of currentRelays().slice(0, 3)) nostr.unreachable.add(url);
    release();
    expect(await screen.findByTestId("card-limits-preview-unread", {}, SLOW)).toBeTruthy();
    expect(screen.getByTestId("card-limits-day")).toHaveTextContent(/Limit: 50.000 sats/);
    expect(screen.getByTestId("card-limits-day")).not.toHaveTextContent(/2.000of/);
  });

  it("shows a card's history from the relays, never a list no majority gave", async () => {
    const cardId = await pair();
    const at = Date.now() - 3600_000;
    await logCardPayment({
      id: "a1",
      cardId,
      walletGeneration: 1,
      at,
      amountSats: 2_000n,
      paymentHash: "a1".padStart(64, "0"),
      description: "Croissants",
      outcome: "sent",
      reason: null,
      pr: "lnbc1",
      payee: null,
      preimage: null,
      value: null
    });
    await withCardAccess((access) => publishCardHistory(access));
    goWeb();
    await open("/cards", web);
    await choose(cardId);
    await waitFor(() => expect(screen.getByTestId("card-history")).toBeEnabled(), SLOW);
    for (const url of currentRelays().slice(0, 3)) nostr.unreachable.add(url);
    await fireEvent.press(screen.getByTestId("card-history"));
    expect(await screen.findByTestId("card-history-failed", {}, SLOW)).toBeTruthy();
    expect(screen.queryByTestId("card-history-list")).toBeNull();
    nostr.unreachable.clear();
    await fireEvent.press(screen.getByTestId("card-history-retry"));
    expect(await screen.findByTestId("card-history-row-t/a1", {}, SLOW)).toHaveTextContent(
      /Croissants/
    );
  });

  it("approves a refused merchant from the history, said done once a majority took it", async () => {
    const cardId = await pair();
    await logCardPayment({
      id: "a1",
      cardId,
      walletGeneration: 1,
      at: Date.now() - 3600_000,
      amountSats: 2_000n,
      paymentHash: "a1".padStart(64, "0"),
      description: "Daily newspaper",
      outcome: "declined",
      reason: "payee_not_approved",
      ...payee("Station Kiosk", "sattleme07@breez.tips", "new"),
      preimage: null,
      value: null
    });
    await withCardAccess((access) => publishCardHistory(access));
    goWeb();
    await open("/cards", web);
    await choose(cardId);
    await waitFor(() => expect(screen.getByTestId("card-history")).toBeEnabled(), SLOW);
    await fireEvent.press(screen.getByTestId("card-history"));
    await fireEvent.press(await screen.findByTestId("card-history-row-t/a1", {}, SLOW));
    const detail = within(await screen.findByTestId("card-history-tap", {}, SLOW));
    const approve = await detail.findByTestId("card-history-approve", {}, SLOW);
    // The relays take nothing more: kept in the page only, never said approved.
    for (const url of currentRelays()) nostr.readOnly.add(url);
    await fireEvent.press(approve);
    expect(await detail.findByTestId("card-history-approve-unsaved", {}, SLOW)).toHaveTextContent(
      /this change will be lost if you leave the page/
    );
    expect(detail.queryByTestId("card-history-approved")).toBeNull();
    // Opened again: still said unsaved, never offered nor said done.
    await fireEvent.press(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByTestId("card-history-tap")).toBeNull());
    await fireEvent.press(screen.getByTestId("card-history-row-t/a1"));
    const again = within(await screen.findByTestId("card-history-tap", {}, SLOW));
    expect(await again.findByTestId("card-history-approve-unsaved", {}, SLOW)).toBeTruthy();
    expect(again.queryByTestId("card-history-approve")).toBeNull();
    nostr.readOnly.clear();
    await fireEvent.press(again.getByTestId("card-history-approve-retry"));
    expect(await again.findByTestId("card-history-approved", {}, SLOW)).toBeTruthy();
    // On the relays: the phone reads it.
    await goPhone();
    await syncCardPayees();
    expect(
      (await loadCardPayees(TEST_WALLET_ID, { cardId, walletGeneration: 1 })).approved
    ).toMatchObject([{ id: "sattleme07@breez.tips", approvedName: "Station Kiosk" }]);
  });

  describe("on a computer", () => {
    beforeEach(() => {
      mockDesktop.mockReturnValue(true);
      windowOf(1440, 900);
    });
    afterEach(phoneWindow);

    it("sends to the phone to add a card from the header, on the page without a card", async () => {
      goWeb();
      await open("/cards", web);
      // Without a card: what it is, the header's "Add a card" the one primary button.
      expect(await screen.findByTestId("cards-add", {}, SLOW)).toHaveTextContent(
        /^Add your first card/
      );
      expect(screen.queryByTestId("cards-pair")).toBeNull();
      expect(screen.queryByTestId("cards-pair-phone")).toBeNull();
      // No row of cards: the guide under the header's "Add a card".
      expect(screen.queryByTestId("cards-thumbnails")).toBeNull();
      expect(screen.queryByTestId("card-slot-add")).toBeNull();

      await fireEvent.press(screen.getByTestId("cards-add-header"));
      const dialog = within(await screen.findByTestId("add-card-dialog"));
      expect(dialog.getByRole("header", { name: "Before you start" })).toBeTruthy();
      await fireEvent.press(screen.getByRole("button", { name: "Close" }));
      await waitFor(() => expect(screen.queryByTestId("add-card-dialog")).toBeNull());
    });

    it("sends to the phone to add a card from the header, no place for it beside the cards", async () => {
      const first = await pair();
      goWeb();
      await open("/cards", web);
      expect(await screen.findByTestId(`card-slot-${first}`, {}, SLOW)).toBeTruthy();
      expect(screen.queryByTestId("card-slot-add")).toBeNull();
      await fireEvent.press(screen.getByTestId("cards-add-header"));
      const dialog = within(await screen.findByTestId("add-card-dialog"));
      expect(dialog.getByRole("header", { name: "Before you start" })).toBeTruthy();
    });

    it("opens its dialog at once, the cards not read", async () => {
      goWeb();
      for (const url of currentRelays()) nostr.unreachable.add(url);
      await open("/cards", web);
      expect(await screen.findByTestId("cards-failed", {}, SLOW)).toBeTruthy();
      await fireEvent.press(screen.getByTestId("cards-add-header"));
      expect(await screen.findByTestId("add-card-dialog")).toBeTruthy();
    });

    it("shows the card the phone added while its dialog showed, chosen, and closes the dialog", async () => {
      // Its clock in the test's hands (each step of real time advances it too).
      jest.useFakeTimers({ advanceTimers: true });
      try {
        const first = await pair();
        goWeb();
        await open("/cards", web);
        expect(await screen.findByTestId(`card-slot-${first}`, {}, SLOW)).toBeTruthy();
        await fireEvent.press(screen.getByTestId("cards-add-header"));
        expect(await screen.findByTestId("add-card-dialog")).toBeTruthy();

        // Meanwhile the phone adds a card: only the relays know it.
        const uid = "04a39493cc8680";
        const added = cardIdOf(root, hexToBytes(uid));
        const shown = (await onRelays(first))!;
        await act(async () => {
          await publishToRelays(
            cardStateEvent(keys, { ...shown, cardId: added, uid, updatedAt: shown.updatedAt + 10 }),
            {
              relays: currentRelays(),
              channel: "account",
              timeoutMs: 1000,
              authKey: keys.nostr.secretKey
            }
          );
        });
        expect(screen.queryByTestId(`card-slot-${added}`)).toBeNull();

        // Read again while the dialog shows: there, chosen, the dialog gone.
        await act(async () => {
          await jest.advanceTimersByTimeAsync(CARD_ADDED_READ_MS);
        });
        await waitFor(
          () =>
            expect(screen.getByTestId(`card-slot-${added}`).props.accessibilityState.selected).toBe(
              true
            ),
          SLOW
        );
        await waitFor(() => expect(screen.queryByTestId("add-card-dialog")).toBeNull());
      } finally {
        jest.useRealTimers();
      }
    });

    it("waits for a card being migrated on the phone to be in service before it closes on it", async () => {
      jest.useFakeTimers({ advanceTimers: true });
      try {
        const first = await pair();
        goWeb();
        await open("/cards", web);
        expect(await screen.findByTestId(`card-slot-${first}`, {}, SLOW)).toBeTruthy();
        await fireEvent.press(screen.getByTestId("cards-add-header"));
        expect(await screen.findByTestId("add-card-dialog")).toBeTruthy();
        // The phone migrates a v2 card: its state first, before its balance moves, then in service
        // once programmed.
        const uid = "04a39493cc8680";
        const added = cardIdOf(root, hexToBytes(uid));
        const shown = (await onRelays(first))!;
        const publish = (state: CardState) =>
          act(async () => {
            await publishToRelays(cardStateEvent(keys, state), {
              relays: currentRelays(),
              channel: "account",
              timeoutMs: 1000,
              authKey: keys.nostr.secretKey
            });
          });
        const migrating: CardState = {
          ...shown,
          cardId: added,
          uid,
          status: "migrating",
          lastCounter: 0,
          depositedThrough: 0,
          updatedAt: shown.updatedAt + 10
        };
        await publish(migrating);
        await act(async () => {
          await jest.advanceTimersByTimeAsync(CARD_ADDED_READ_MS);
        });
        expect(await screen.findByTestId(`card-slot-${added}`, {}, SLOW)).toBeTruthy();
        // Not added yet: the dialog stays, reading on.
        expect(screen.getByTestId("add-card-dialog")).toBeTruthy();
        await publish({ ...migrating, status: "active", updatedAt: shown.updatedAt + 20 });
        await act(async () => {
          await jest.advanceTimersByTimeAsync(CARD_ADDED_READ_MS);
        });
        await waitFor(() => expect(screen.queryByTestId("add-card-dialog")).toBeNull(), SLOW);
        expect(screen.getByTestId(`card-slot-${added}`).props.accessibilityState.selected).toBe(
          true
        );
      } finally {
        jest.useRealTimers();
      }
    });

    it("ends the page's failure once its reads reach the relays again", async () => {
      jest.useFakeTimers({ advanceTimers: true });
      try {
        const first = await pair();
        goWeb();
        for (const url of currentRelays()) nostr.unreachable.add(url);
        await open("/cards", web);
        expect(await screen.findByTestId("cards-failed", {}, SLOW)).toBeTruthy();
        await fireEvent.press(screen.getByTestId("cards-add-header"));
        expect(await screen.findByTestId("add-card-dialog")).toBeTruthy();
        nostr.unreachable.clear();
        await act(async () => {
          await jest.advanceTimersByTimeAsync(CARD_ADDED_READ_MS);
        });
        // The cards read: the page shows them, behind the dialog.
        expect(await screen.findByTestId(`card-slot-${first}`, {}, SLOW)).toBeTruthy();
        expect(screen.queryByTestId("cards-failed")).toBeNull();
        expect(screen.getByTestId("add-card-dialog")).toBeTruthy();
      } finally {
        jest.useRealTimers();
      }
    });

    it("keeps its dialog as it is while the page's first read ends", async () => {
      await pair();
      goWeb();
      const release = nostr.holdQueries();
      await open("/cards", web);
      expect(await screen.findByTestId("cards-loading")).toBeTruthy();
      await fireEvent.press(screen.getByTestId("cards-add-header"));
      const dialog = await screen.findByTestId("add-card-dialog");
      release();
      expect(await screen.findByTestId("cards-screen", {}, SLOW)).toBeTruthy();
      // The same dialog, never closed and opened again.
      expect(screen.getByTestId("add-card-dialog")).toBe(dialog);
    });
  });

  describe("on a computer, its relay and its deletion", () => {
    // The staging build, whose web app the phone's app opens (none in production).
    const extra = Constants.expoConfig!.extra!;
    beforeEach(() => {
      mockDesktop.mockReturnValue(true);
      windowOf(1440, 900);
      extra.appVariant = "staging";
      extra.webAppOrigin = "https://web.example";
    });
    afterEach(() => {
      phoneWindow();
      delete extra.appVariant;
      delete extra.webAppOrigin;
    });

    const codeLabel = "QR code that opens “Cards” in the app on your phone";

    it('gives the phone a code to "Cards" beside the steps of "Change relay"', async () => {
      const cardId = await pair();
      goWeb();
      await open("/cards", web);
      const panel = await openRelay(cardId);
      // As wide as the dialog, its relay and "Change relay" first.
      expect(StyleSheet.flatten(screen.getByTestId("card-sheet").props.style).maxWidth).toBe(560);
      await fireEvent.press(panel.getByTestId("card-relay-change"));
      expect(await panel.findByTestId("card-on-phone-code")).toBeTruthy();
      expect(panel.getByLabelText(codeLabel)).toBeTruthy();
      expect(
        panel.getByLabelText(
          "1. Open sattle.me on your phone, Or scan this code with it: it opens “Cards” in the app."
        )
      ).toBeTruthy();
      expect(StyleSheet.flatten(screen.getByTestId("card-sheet").props.style).maxWidth).toBe(560);
    });

    it("gives the phone the same code beside the steps of a deletion, the card in hand", async () => {
      const cardId = await pair();
      goWeb();
      await open("/cards", web);
      const panel = await openTask(cardId, "card-delete");
      expect(StyleSheet.flatten(screen.getByTestId("card-sheet").props.style).maxWidth).toBe(560);
      expect(panel.getByLabelText(codeLabel)).toBeTruthy();
      // Without it, no phone needed: no code.
      await fireEvent.press(panel.getByTestId("card-delete-without-card"));
      expect(panel.queryByLabelText(codeLabel)).toBeNull();
      expect(panel.getByTestId("card-delete-confirm")).toHaveTextContent(/Delete the card$/);
    });
  });
});

describe('"Cards" in the app on a device that reads no card (an iPad)', () => {
  // The staging build, whose web app the phone's app opens (none in production).
  const extra = Constants.expoConfig!.extra!;
  const root = deriveCardRoot(walletSecret(testSeed()));
  const keys = deriveCardRecordKeys(root);
  const codeLabel = "QR code that opens “Cards” in the app on your phone";
  beforeEach(() => {
    extra.appVariant = "staging";
    extra.webAppOrigin = "https://web.example";
  });
  afterEach(() => {
    delete extra.appVariant;
    delete extra.webAppOrigin;
  });

  it("adds a card as a computer does: its dialog, said of the device, and the phone's code", async () => {
    // Its clock in the test's hands (each step of real time advances it too).
    jest.useFakeTimers({ advanceTimers: true });
    try {
      const first = await pair();
      const calls = nfc.calls.length;
      // From here, the account open on an iPad.
      nfc.removeNfc();
      const { router } = await open("/cards");
      expect(await screen.findByTestId(`card-slot-${first}`, {}, SLOW)).toBeTruthy();
      await fireEvent.press(screen.getByTestId("card-slot-add"));
      await fireEvent.press(await screen.findByTestId("cards-pair"));
      const dialog = within(await screen.findByTestId("add-card-dialog"));
      expect(
        dialog.getByText(
          "This device cannot read NFC cards: a card is added from the app, on your phone, with the card in hand."
        )
      ).toBeTruthy();
      expect(
        dialog.getByLabelText("QR code that opens “Add a card” in the app on your phone")
      ).toBeTruthy();
      expect(router.getPathname()).toBe("/cards");

      // The phone adds a card meanwhile: only the relays know it, read again here.
      const uid = "04a39493cc8680";
      const added = cardIdOf(root, hexToBytes(uid));
      const shown = knownCardState(TEST_WALLET_ID, first)!;
      await act(async () => {
        await publishToRelays(
          cardStateEvent(keys, { ...shown, cardId: added, uid, updatedAt: shown.updatedAt + 10 }),
          {
            relays: currentRelays(),
            channel: "account",
            timeoutMs: 1000,
            authKey: keys.nostr.secretKey
          }
        );
      });
      await act(async () => {
        await jest.advanceTimersByTimeAsync(CARD_ADDED_READ_MS);
      });
      await waitFor(() => expect(screen.queryByTestId("add-card-dialog")).toBeNull(), SLOW);
      expect(screen.getByTestId(`card-slot-${added}`).props.accessibilityState.selected).toBe(true);
      // Nothing was asked of an NFC it has not.
      expect(nfc.calls).toHaveLength(calls);
    } finally {
      jest.useRealTimers();
    }
  });

  it('says to add a card on the phone when "Add a card" opens at its address', async () => {
    nfc.removeNfc();
    const { router } = await open("/cards/pair");
    expect(await screen.findByTestId("pair-card", {}, SLOW)).toHaveTextContent(
      "To pair a card, open the app on your phone: it programs the card, held against it."
    );
    expect(screen.queryByTestId("add-card-start")).toBeNull();
    expect(router.getPathname()).toBe("/cards/pair");
    expect(nfc.calls).toEqual([]);
  });

  it('leads "Change relay" to the phone, said of the device, its relay\'s state checked here', async () => {
    const cardId = await pair();
    const calls = nfc.calls.length;
    nfc.removeNfc();
    await open("/cards");
    const panel = await openRelay(cardId);
    // This device's own state of the card, as on a phone: it is woken too.
    expect(await panel.findByTestId("card-relay-status", {}, SLOW)).toBeTruthy();
    await fireEvent.press(panel.getByTestId("card-relay-change"));
    expect(await panel.findByTestId("card-relay-on-phone")).toBeTruthy();
    expect(
      panel.getByText(
        "This device cannot read NFC cards: the card is programmed from the app, on a phone."
      )
    ).toBeTruthy();
    expect(panel.getByLabelText(codeLabel)).toBeTruthy();
    expect(panel.queryByTestId("card-relay-form")).toBeNull();
    expect(nfc.calls).toHaveLength(calls);
    expect(knownCardState(TEST_WALLET_ID, cardId)).toMatchObject({
      status: "active",
      relayHost: HOST
    });
  });

  it("deletes a card as a computer does: with it, on the phone; without it, at once", async () => {
    const cardId = await pair();
    await customizeCard(cardId, { name: "Everyday" });
    const calls = nfc.calls.length;
    nfc.removeNfc();
    await open("/cards");
    const panel = await openTask(cardId, "card-delete");
    expect(panel.getByTestId("card-delete-web")).toBeTruthy();
    // In hand: the way there on the phone, its code beside it, nothing deleted here.
    expect(panel.getByTestId("card-delete-with-card").props.accessibilityState).toEqual({
      checked: true
    });
    expect(panel.getByLabelText(codeLabel)).toBeTruthy();
    expect(panel.queryByTestId("card-delete-confirm")).toBeNull();
    // Without it: deleted at once, "I don't have it" its confirmation.
    await fireEvent.press(panel.getByTestId("card-delete-without-card"));
    await fireEvent.press(panel.getByTestId("card-delete-confirm"));
    expect(screen.queryByTestId("card-delete-without")).toBeNull();
    await waitFor(() => expect(screen.queryByTestId("card-sheet")).toBeNull(), SLOW);
    expect(await screen.findByText("Everyday is deleted")).toBeTruthy();
    expect(nfc.calls).toHaveLength(calls);
    expect(knownCardState(TEST_WALLET_ID, cardId)).toMatchObject({ status: "deleted", name: "" });
  });

  it('leaves "Finish the migration" to the phone', async () => {
    const cardId = await migratingCard();
    nfc.removeNfc();
    await open("/cards");
    expect(await screen.findByTestId(`card-slot-${cardId}`, {}, SLOW)).toBeTruthy();
    expect(await screen.findByTestId("card-finish-on-phone")).toHaveTextContent(
      "Finish it in the app on your phone, the card held against it."
    );
    expect(screen.queryByTestId("card-finish-migration")).toBeNull();
  });
});

describe("a card holder's cards (no main wallet)", () => {
  const ADDRESS = "bakery@wallet.example";
  const INVOICE = "lnbc250u1pfake";
  const BTC_ADDRESS = "bc1qm4tz8s0xk7v9yfh3e5c2nq6wjr8ad2wz9";

  beforeEach(async () => {
    closeAccount();
    await openCardHolderAccount();
    await saveTerminalProfile({
      version: 4,
      walletId: TEST_WALLET_ID,
      backupKey: getAccountBackupKey()!,
      businessName: getAccountSettings()?.businessName ?? "",
      currency: "CHF"
    });
    resetTerminalProfileCache();
    sdk.resetFakeSend();
    sdk.accountConnections.count = 0;
    sdk.fakeSend.inputs.set(ADDRESS, {
      tag: sdk.InputType_Tags.LightningAddress,
      inner: [
        {
          address: ADDRESS,
          payRequest: {
            callback: "https://wallet.example/cb",
            minSendable: BigInt(1000),
            maxSendable: BigInt(1_000_000_000),
            metadataStr: "[]",
            commentAllowed: 0,
            domain: "wallet.example",
            url: "https://wallet.example",
            address: ADDRESS,
            allowsNostr: undefined,
            nostrPubkey: undefined
          }
        }
      ]
    });
    sdk.fakeSend.inputs.set(INVOICE, {
      tag: sdk.InputType_Tags.Bolt11Invoice,
      inner: [
        {
          amountMsat: BigInt(25_000_000),
          description: "Flour, 25 kg",
          expiry: BigInt(3600),
          invoice: { bolt11: INVOICE, source: {} },
          network: sdk.BitcoinNetwork.Bitcoin,
          paymentHash: "9c1f",
          timestamp: BigInt(Math.floor(Date.now() / 1000) - 60)
        }
      ]
    });
    sdk.fakeSend.inputs.set(BTC_ADDRESS, {
      tag: sdk.InputType_Tags.BitcoinAddress,
      inner: [{ address: BTC_ADDRESS, network: sdk.BitcoinNetwork.Bitcoin, source: {} }]
    });
  });

  /** The card's balance, once read on "Cards". */
  async function balanceOf(cardId: string) {
    await open("/cards");
    await choose(cardId);
    return screen.findByTestId("card-balance-sats", {}, SLOW);
  }

  it('says "Withdraw", to another wallet, and recharges from another wallet only', async () => {
    const cardId = await pair();
    sdk.fakeCardWallet(cardId).balanceSats = 5_000n;
    expect(await balanceOf(cardId)).toHaveTextContent(/^5.000 sats$/);
    expect(screen.getByTestId("card-wallet-return")).toHaveTextContent(/WithdrawTo another wallet/);
    const panel = await openTask(cardId, "card-wallet-recharge");
    // Straight to another wallet's means: no main balance to read nor to recharge from.
    expect(await panel.findByTestId("card-wallet-other", {}, SLOW)).toBeTruthy();
    expect(panel.queryByTestId("card-wallet-reading-main")).toBeNull();
    expect(sdk.accountConnections.count).toBe(0);
    // Not even asked, as "Cards" shows a card to recharge (useHeldAccountWallet).
    expect(readLog().entries.map((entry) => entry.event)).not.toContain(
      "Holding the main wallet failed"
    );
  });

  it("shows the cards as a card holder's on a device not converted yet, and once a merchant's until its point of sale", async () => {
    const cardId = await pair();
    sdk.fakeCardWallet(cardId).balanceSats = 5_000n;
    // A point of sale of this account, its settings unread at launch (profile-cache.ts): followed
    // as it is until the device is prepared again, which fails here (its storage refusing).
    const saving = jest
      .spyOn(terminalProfile, "saveTerminalProfile")
      .mockRejectedValue(new Error("Disk full"));
    publishTerminalProfile({
      version: 2,
      walletId: TEST_WALLET_ID,
      backupKey: getAccountBackupKey()!,
      lightningAddress: "sattleme02c6047f94@breez.tips",
      businessName: getAccountSettings()?.businessName ?? "",
      currency: "CHF"
    });
    expect(await balanceOf(cardId)).toHaveTextContent(/^5.000 sats$/);
    expect(screen.getByTestId("card-wallet-return")).toHaveTextContent(/WithdrawTo another wallet/);
    let panel = await openTask(cardId, "card-wallet-return");
    expect(await panel.findByLabelText("Recipient")).toBeTruthy();
    expect(sdk.accountConnections.count).toBe(0);
    expect(await getTerminalProfile()).toMatchObject({ version: 2 });
    screen.unmount();
    saving.mockRestore();

    // "Create my merchant profile" saved, its point of sale not prepared yet (its wallet out of
    // reach): still a card holder's cards, nothing of the main wallet held for them.
    sdk.fakeWallet.connectError = new Error("Network error");
    await saveTerminalProfile({
      version: 4,
      walletId: TEST_WALLET_ID,
      backupKey: getAccountBackupKey()!,
      businessName: getAccountSettings()?.businessName ?? "",
      currency: "CHF"
    });
    resetTerminalProfileCache();
    await updateAccount({ usage: "merchant" });
    expect(await balanceOf(cardId)).toHaveTextContent(/^5.000 sats$/);
    expect(screen.getByTestId("card-wallet-return")).toHaveTextContent(/WithdrawTo another wallet/);
    panel = await openTask(cardId, "card-wallet-recharge");
    expect(await panel.findByTestId("card-wallet-other", {}, SLOW)).toBeTruthy();
    expect(panel.queryByTestId("card-wallet-reading-main")).toBeNull();
    const events = readLog().entries.map((entry) => entry.event);
    // Its point of sale tried (device-kind.ts), never the cards' screens.
    expect(events).toContain("Preparing this device for its account failed");
    expect(events).not.toContain("Holding the main wallet failed");
  });

  it("sends an amount from the card to anyone, after the passkey, the rest staying on it", async () => {
    const cardId = await pair();
    sdk.fakeCardWallet(cardId).balanceSats = 5_000n;
    expect(await balanceOf(cardId)).toHaveTextContent(/^5.000 sats$/);
    const panel = await openTask(cardId, "card-wallet-return");
    await fireEvent.changeText(await panel.findByLabelText("Recipient"), ADDRESS);
    await panel.findByText("Lightning address", {}, SLOW);
    await fireEvent.changeText(panel.getByLabelText("Amount"), "2000");
    const send = panel.getByTestId("send-confirm");
    await waitFor(() => expect(send).toBeEnabled(), SLOW);
    signIn.mockClear();
    await fireEvent.press(send);
    expect(await panel.findByText("Payment sent", {}, SLOW)).toBeTruthy();
    expect(signIn).toHaveBeenCalledTimes(1);
    // 2,000 sats and the fake's 3 sats of fee.
    expect(sdk.fakeCardWallet(cardId).balanceSats).toBe(2_997n);
    expect(sdk.accountConnections.count).toBe(0);
    await fireEvent.press(panel.getByTestId("send-done"));
    await waitFor(
      () => expect(screen.getByTestId("card-balance-sats")).toHaveTextContent(/^2.997 sats$/),
      SLOW
    );
  });

  it('empties the card with "Empty the card": what the recipient gets shown first, nothing left', async () => {
    const cardId = await pair();
    sdk.fakeCardWallet(cardId).balanceSats = 5_000n;
    expect(await balanceOf(cardId)).toHaveTextContent(/^5.000 sats$/);
    const panel = await openTask(cardId, "card-wallet-return");
    await drainTo(panel, ADDRESS);
    expect(await panel.findByTestId("card-drain-received", {}, SLOW)).toHaveTextContent(
      /4.997 sats/
    );
    expect(panel.getByTestId("card-drain-total")).toHaveTextContent(/5.000 sats/);
    expect(panel.getByTestId("card-drain-fee")).toHaveTextContent(/3 sats/);
    signIn.mockClear();
    await fireEvent.press(panel.getByTestId("card-drain-confirm"));
    expect(await panel.findByTestId("card-drain-outcome", {}, SLOW)).toHaveTextContent(
      /4.997 sats withdrawn: the card is empty\.$/
    );
    expect(signIn).toHaveBeenCalledTimes(1);
    expect(sdk.fakeCardWallet(cardId).balanceSats).toBe(0n);
    expect(sdk.accountConnections.count).toBe(0);
    await fireEvent.press(panel.getByTestId("card-drain-finish"));
    await waitFor(
      () => expect(screen.getByTestId("card-balance-sats")).toHaveTextContent(/^0 sats$/),
      SLOW
    );
  });

  it('gives each figure of "Empty the card" in francs and in exact sats, which add up', async () => {
    // 1 BTC = 100,000 CHF: 596 sats are 0.596 CHF, the fake's 3 sats of fee 0.003 CHF; each
    // rounded on its own, the francs alone would read 0.60 − 0.00 = 0.59.
    setMockRate(100_000);
    const cardId = await pair();
    sdk.fakeCardWallet(cardId).balanceSats = 596n;
    expect(await balanceOf(cardId)).toHaveTextContent(/^596 sats$/);
    const panel = await openTask(cardId, "card-wallet-return");
    await drainTo(panel, ADDRESS);
    expect(await panel.findByTestId("card-drain-received", {}, SLOW)).toHaveTextContent(
      /\D0[.,]59 CHF593 sats$/
    );
    expect(panel.getByTestId("card-drain-total")).toHaveTextContent(/\D0[.,]60 CHF596 sats$/);
    expect(panel.getByTestId("card-drain-fee")).toHaveTextContent(/\D0[.,]00 CHF3 sats$/);
  });

  it("tries the same payment again after a failure: it leaves the card once at most", async () => {
    const cardId = await pair();
    sdk.fakeCardWallet(cardId).balanceSats = 5_000n;
    expect(await balanceOf(cardId)).toHaveTextContent(/^5.000 sats$/);
    const panel = await openTask(cardId, "card-wallet-return");
    await drainTo(panel, ADDRESS);
    await waitFor(() => expect(panel.getByTestId("card-drain-confirm")).toBeEnabled(), SLOW);
    sdk.fakeSend.sendError = new Error("Network error");
    await fireEvent.press(panel.getByTestId("card-drain-confirm"));
    expect(await panel.findByTestId("card-drain-failure", {}, SLOW)).toHaveTextContent(
      /it will only be sent once/
    );
    expect(sdk.fakeCardWallet(cardId).balanceSats).toBe(5_000n);
    sdk.fakeSend.sendError = null;
    await fireEvent.press(panel.getByTestId("card-drain-confirm"));
    expect(await panel.findByTestId("card-drain-outcome", {}, SLOW)).toHaveTextContent(
      /the card is empty/
    );
    const { lnurlPay } = await sdkOf(cardId);
    const keys = lnurlPay!.mock.calls.map(
      ([request]) => (request as { idempotencyKey: string }).idempotencyKey
    );
    expect(keys).toHaveLength(2);
    expect(keys[1]).toBe(keys[0]);
    expect(sdk.fakeCardWallet(cardId).balanceSats).toBe(0n);
  });

  it("empties it to a Bitcoin address, its fee at the speed chosen", async () => {
    const cardId = await pair();
    sdk.fakeCardWallet(cardId).balanceSats = 50_000n;
    expect(await balanceOf(cardId)).toHaveTextContent(/^50.000 sats$/);
    const panel = await openTask(cardId, "card-wallet-return");
    await drainTo(panel, BTC_ADDRESS);
    // "Normal" first: 900 + 340 sats of fees.
    expect(await panel.findByTestId("card-drain-received", {}, SLOW)).toHaveTextContent(
      /48.760 sats/
    );
    expect(panel.getByTestId("card-drain-fee")).toHaveTextContent(/1.240 sats/);
    // The three speeds share the panel's width, each with its icon.
    expect(
      StyleSheet.flatten(panel.getByTestId("card-drain-speed-group").props.style).alignSelf
    ).toBe("stretch");
    expect(
      within(panel.getByTestId("card-drain-speed-slow")).getByText(String.fromCodePoint(0xf4d3))
    ).toBeTruthy();
    // "Fast": 1,500 + 340 sats.
    await fireEvent.press(panel.getByTestId("card-drain-speed-fast"));
    expect(panel.getByTestId("card-drain-received")).toHaveTextContent(/48.160 sats/);
    await waitFor(() => expect(panel.getByTestId("card-drain-confirm")).toBeEnabled(), SLOW);
    await fireEvent.press(panel.getByTestId("card-drain-confirm"));
    expect(await panel.findByTestId("card-drain-outcome", {}, SLOW)).toHaveTextContent(
      /48.160 sats withdrawn/
    );
    expect(sdk.fakeCardWallet(cardId).balanceSats).toBe(0n);
  });

  it("keeps the speed of a failed attempt: its retry sends that very payment", async () => {
    const cardId = await pair();
    sdk.fakeCardWallet(cardId).balanceSats = 50_000n;
    expect(await balanceOf(cardId)).toHaveTextContent(/^50.000 sats$/);
    const panel = await openTask(cardId, "card-wallet-return");
    await drainTo(panel, BTC_ADDRESS);
    expect(await panel.findByTestId("card-drain-received", {}, SLOW)).toHaveTextContent(
      /48.760 sats/
    );
    await waitFor(() => expect(panel.getByTestId("card-drain-confirm")).toBeEnabled(), SLOW);
    sdk.fakeSend.sendError = new Error("Network error");
    await fireEvent.press(panel.getByTestId("card-drain-confirm"));
    expect(await panel.findByTestId("card-drain-failure", {}, SLOW)).toBeTruthy();
    // "Fast" after the attempt at "Normal": the figures stay those of the attempt.
    await fireEvent.press(panel.getByTestId("card-drain-speed-fast"));
    expect(panel.getByTestId("card-drain-received")).toHaveTextContent(/48.760 sats/);
    sdk.fakeSend.sendError = null;
    await fireEvent.press(panel.getByTestId("card-drain-confirm"));
    expect(await panel.findByTestId("card-drain-outcome", {}, SLOW)).toHaveTextContent(
      /48.760 sats withdrawn/
    );
  });

  it('offers "Empty the card" once a recipient that can take it all is read, never an invoice', async () => {
    const cardId = await pair();
    sdk.fakeCardWallet(cardId).balanceSats = 5_000n;
    expect(await balanceOf(cardId)).toHaveTextContent(/^5.000 sats$/);
    const panel = await openTask(cardId, "card-wallet-return");
    expect(await panel.findByTestId("send-recipient", {}, SLOW)).toBeTruthy();
    expect(panel.queryByTestId("card-wallet-drain")).toBeNull();
    // An invoice names its own amount: paid as it asks, never the whole card.
    await fireEvent.changeText(panel.getByTestId("send-recipient"), INVOICE);
    expect(await panel.findByText("Lightning invoice", {}, SLOW)).toBeTruthy();
    expect(panel.queryByTestId("card-wallet-drain")).toBeNull();
    // An address: under "Send".
    await fireEvent.changeText(panel.getByTestId("send-recipient"), ADDRESS);
    expect(await panel.findByTestId("card-wallet-drain", {}, SLOW)).toHaveTextContent(
      /Empty the card$/
    );
    expect(panel.getByTestId("send-confirm")).toBeTruthy();
  });

  it('keeps the recipient on the way back from "Empty the card" to "Withdraw"', async () => {
    const cardId = await pair();
    sdk.fakeCardWallet(cardId).balanceSats = 5_000n;
    expect(await balanceOf(cardId)).toHaveTextContent(/^5.000 sats$/);
    const panel = await openTask(cardId, "card-wallet-return");
    await drainTo(panel, ADDRESS);
    expect(await panel.findByTestId("card-drain-received", {}, SLOW)).toHaveTextContent(
      /4.997 sats/
    );
    expect(panel.getByRole("header")).toHaveTextContent("Empty the card");
    await fireEvent.press(panel.getByTestId("sheet-back"));
    expect(await panel.findByTestId("send-recipient", {}, SLOW)).toHaveDisplayValue(ADDRESS);
    expect(await panel.findByTestId("card-wallet-drain", {}, SLOW)).toBeTruthy();
    expect(panel.getByRole("header")).toHaveTextContent("Withdraw");
    // Nothing left the card.
    expect(sdk.fakeCardWallet(cardId).balanceSats).toBe(5_000n);
  });

  it("never empties it to an invoice typed in its own form, which names its own amount", async () => {
    const cardId = await pair();
    sdk.fakeCardWallet(cardId).balanceSats = 5_000n;
    expect(await balanceOf(cardId)).toHaveTextContent(/^5.000 sats$/);
    const panel = await openTask(cardId, "card-wallet-return");
    await drainTo(panel, ADDRESS);
    await fireEvent.changeText(panel.getByTestId("card-drain-recipient"), INVOICE);
    expect(
      await panel.findByText("Use a lightning, bitcoin or Spark address", {}, SLOW)
    ).toBeTruthy();
    // Nothing prepared, nothing to send.
    expect(panel.queryByTestId("card-drain-received")).toBeNull();
    expect(panel.queryByTestId("card-drain-confirm")).toBeNull();
    expect(sdk.fakeCardWallet(cardId).balanceSats).toBe(5_000n);
  });

  it("asks the deletion of a card holding sats to empty it elsewhere first", async () => {
    const cardId = await pair();
    sdk.fakeCardWallet(cardId).balanceSats = 1_200n;
    expect(await balanceOf(cardId)).toHaveTextContent(/^1.200 sats$/);
    await fireEvent.press(await screen.findByTestId("card-delete", {}, SLOW));
    const dialog = await screen.findByTestId("card-delete-drain", {}, SLOW);
    expect(dialog).toHaveTextContent(/lightning, bitcoin or Spark/);
    expect(dialog).not.toHaveTextContent(/main balance/);
    expect(screen.getByTestId("card-delete-drain-return")).toHaveTextContent(/Empty the card$/);
    // "Empty the card" at once: the card's whole balance, to an address.
    await fireEvent.press(screen.getByTestId("card-delete-drain-return"));
    const panel = within(await screen.findByTestId("card-sheet"));
    expect(await panel.findByTestId("card-drain-recipient", {}, SLOW)).toBeTruthy();
    expect(sdk.accountConnections.count).toBe(0);
    // "Paste" in the field, an icon only: what was copied, read.
    expect(panel.getByLabelText("Paste")).toBe(panel.getByTestId("card-drain-paste"));
    expect(panel.queryByText("Paste")).toBeNull();
    jest.mocked(Clipboard.getStringAsync).mockResolvedValueOnce(` ${ADDRESS} `);
    await fireEvent.press(panel.getByTestId("card-drain-paste"));
    expect(await panel.findByTestId("card-drain-received", {}, SLOW)).toHaveTextContent(
      /1.197 sats/
    );
    expect(panel.getByTestId("card-drain-recipient")).toHaveDisplayValue(ADDRESS);
  });

  it("empties a deleted card's wallet that sats reached, from its notice", async () => {
    const deleted = await pair();
    await withCardAccess(async (access) => {
      const { updatedAt: _updatedAt, ...state } = knownCardState(TEST_WALLET_ID, deleted)!;
      await recordCardState(access, { ...state, status: "deleted" });
    });
    sdk.fakeCardWallet(deleted).balanceSats = 1_200n;
    await open("/cards");
    expect(await screen.findByTestId("cards-erased-funds-note", {}, SLOW)).toHaveTextContent(
      /1.200 sats reached its wallet after it was deleted\. Empty it to a lightning, bitcoin or Spark address\.$/
    );
    expect(screen.queryByTestId("cards-erased-funds-return")).toBeNull();
    await fireEvent.press(screen.getByTestId("cards-erased-funds-drain"));
    const sheet = within(await screen.findByTestId("erased-drain-sheet"));
    await fireEvent.changeText(await sheet.findByTestId("card-drain-recipient", {}, SLOW), ADDRESS);
    expect(await sheet.findByTestId("card-drain-received", {}, SLOW)).toHaveTextContent(
      /1.197 sats/
    );
    await fireEvent.press(sheet.getByTestId("card-drain-confirm"));
    expect(await sheet.findByTestId("card-drain-outcome", {}, SLOW)).toHaveTextContent(
      /the card is empty/
    );
    expect(sdk.fakeCardWallet(deleted).balanceSats).toBe(0n);
    expect(sdk.accountConnections.count).toBe(0);
    // An erased wallet shows no history again: no withdrawal's note of it.
    const read = await withCardAccess((access) => historySync.readCardHistory(access));
    expect(read.withdrawals.size).toBe(0);
    await fireEvent.press(sheet.getByTestId("card-drain-finish"));
    await waitFor(() => expect(screen.queryByTestId("cards-erased-funds")).toBeNull(), SLOW);
  });

  it("notes the withdrawal of a card whose programming stopped: added again, it pays from that wallet", async () => {
    const stopped = await pair();
    await withCardAccess(async (access) => {
      const { updatedAt: _updatedAt, ...state } = knownCardState(TEST_WALLET_ID, stopped)!;
      await recordCardState(access, { ...state, status: "reset" });
    });
    sdk.fakeCardWallet(stopped).balanceSats = 1_200n;
    await open("/cards");
    await fireEvent.press(await screen.findByTestId("cards-erased-funds-drain", {}, SLOW));
    const sheet = within(await screen.findByTestId("erased-drain-sheet"));
    await fireEvent.changeText(await sheet.findByTestId("card-drain-recipient", {}, SLOW), ADDRESS);
    await sheet.findByTestId("card-drain-received", {}, SLOW);
    await fireEvent.press(sheet.getByTestId("card-drain-confirm"));
    expect(await sheet.findByTestId("card-drain-outcome", {}, SLOW)).toHaveTextContent(
      /the card is empty/
    );
    const [payment] = sdk.fakeCardWallet(stopped).payments as { id: string }[];
    const read = await withCardAccess((access) => historySync.readCardHistory(access));
    expect(read.withdrawals.get(`${stopped}/${payment!.id}`)).toMatchObject({
      walletGeneration: 1,
      way: "address"
    });
  });
});
