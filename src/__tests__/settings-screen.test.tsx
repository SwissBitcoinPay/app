import "@/i18n";

import { schnorr } from "@noble/curves/secp256k1.js";
import { bytesToHex, concatBytes } from "@noble/hashes/utils.js";

import { Slot } from "expo-router";
import { act, fireEvent, renderRouter, screen, waitFor, within } from "expo-router/testing-library";
import { Platform, ScrollView, Share, StyleSheet } from "react-native";

import AppLayout from "@/app/(app)/_layout";
import EmployeesRoute from "@/app/(app)/employees";
import AmountScreen from "@/app/(app)/pos/index";
import PosLayout from "@/app/(app)/pos/_layout";
import SettingsBank from "@/app/(app)/settings/bank";
import SettingsBusiness from "@/app/(app)/settings/business";
import SettingsCharging from "@/app/(app)/settings/charging";
import SettingsDisplay from "@/app/(app)/settings/display";
import SettingsHelp from "@/app/(app)/settings/help";
import SettingsNetwork from "@/app/(app)/settings/network";
import SettingsPayouts from "@/app/(app)/settings/payouts";
import SettingsProfile from "@/app/(app)/settings/profile";
import SettingsSecurity from "@/app/(app)/settings/security";
import SettingsLayout from "@/app/(app)/settings/_layout";
import SettingsIndex from "@/app/(app)/settings/index";
import SettingsMerchant from "@/app/(app)/settings/merchant";
import SettingsMerchantBank from "@/app/(app)/settings/merchant-bank";
import SettingsNode from "@/app/(app)/settings/node";
import SettingsRelays from "@/app/(app)/settings/relays";
import SettingsSplit from "@/app/(app)/settings/split";
import AdvancedSettings from "@/app/advanced";
import LaunchScreen from "@/app/index";
import JoinScreen from "@/app/join";
import { DEFAULT_RELAYS } from "@/config/relays";
import { COUNTRY_DETECTION_KEY } from "@/features/account/country-detection-format";
import { PayoutDraftProvider } from "@/features/settings/payout-draft";
import {
  closeAccount,
  getAccountBackupKey,
  getAccountSettings,
  openAccount,
  updateAccount,
  whenAccountSynced
} from "@/features/account/session";
import { resetImages } from "@/features/media/images";
import { changeOnchainTolerance } from "@/features/settings/account-settings";
import {
  AMOUNT_UNIT_KEY,
  parseAmountUnit,
  serializeAmountUnit
} from "@/features/settings/amount-unit-format";
import {
  parseThemePreference,
  serializeThemePreference,
  THEME_KEY
} from "@/features/appearance/theme-format";
import { resetDeviceRelays } from "@/features/relays/device-relays";
import { journalPartAddress, type JournalPart } from "@/features/support/deposit";
import { JOURNAL_RECORD_TYPE } from "@/features/support/journal-format";
import * as supportMail from "@/features/support/mail";
import { resetRelayStatuses } from "@/features/relays/relay-test";
import {
  joinTeam,
  previewInvite,
  resetMembershipCache,
  syncMembership
} from "@/features/team/member";
import { inviteEmployee } from "@/features/team/owner";
import { loadBrandingOf } from "@/features/terminal/branding";
import { resetPayRequests } from "@/features/terminal/invoice";
import { getTerminalProfile, resetTerminalProfileCache } from "@/features/terminal/profile-cache";
import { saveDiscreet } from "@/features/wallet/discreet-store";
import { walletSecret } from "@/lib/breez/seed";
import { base64ToBytes } from "@/lib/base64";
import { logFailure, readLog } from "@/lib/log/log";
import { inflate } from "@/lib/media/inflate";
import { conversationKey } from "@/lib/nostr/nip44";
import { openRecord } from "@/lib/nostr/record";
import { OBSERVE_CHOICE_KEY, serializeObserveChoice } from "@/lib/observe/choice-format";
import { startObserve } from "@/lib/observe/observe";
import { currentRelays, setCurrentRelays } from "@/lib/relays/current";
import { inviteLinkOf } from "@/lib/team/invite";
import { deriveMemberKeys, deriveTeamKeys, memberSecret } from "@/lib/team/keys";
import { publishMemberRecord, saleEvent } from "@/lib/team/member-records";
import { loadMembership } from "@/lib/team/membership-store";
import { BRANDING_RECORD_KEY, type SavedTerminalProfile } from "@/lib/terminal/model";
import { loadTerminalProfile, saveTerminalProfile } from "@/lib/terminal/profile";
import { connectWallet, getWalletId, getWalletLightningAddress } from "@/lib/breez/wallet";
import { lightColors as colors, lightShadow as shadow, palette } from "@/theme";

import {
  TEST_WALLET_ID,
  openCardHolderAccount,
  openTestAccount,
  testSeed
} from "../../jest/account";
import { lightningAddresses } from "../../jest/breez-sdk";
import { breezTips, serveBreezTips } from "../../jest/breez-tips";
import { publishIntegration, rosterOn } from "../../jest/roster";
import { versionParts } from "../../jest/version-label";
import type * as FileSystemFake from "../../jest/expo-file-system";
import type * as MailComposerFake from "../../jest/expo-mail-composer";
import type * as ObserveFake from "../../jest/expo-observe";
import type * as SharingFake from "../../jest/expo-sharing";
import type * as SecureStoreFake from "../../jest/expo-secure-store";
import type * as MempoolFake from "../../jest/mempool";
import type * as RelaysFake from "../../jest/nostr-relays";
import type * as MtPelerinFake from "../../jest/mtpelerin";
import type * as LocalNetworkModule from "../lib/nostr/local-network";

// The browser's local network permission (web): none in the apps, as the real native module.
jest.mock("../lib/nostr/local-network", () => ({
  askLocalNetworkAccess: jest.fn(async () => null)
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
  disconnectWallet: jest.fn(async () => undefined),
  getWalletId: jest.fn(),
  getWalletLightningAddress: jest.fn(),
  newDepositAddress: jest.fn(),
  isWalletConnected: () => false,
  getWalletConnectionId: () => null,
  subscribeWallet: () => () => undefined
}));
/** The point of the hour the point of sale holds: undefined for none (an outage). */
let mockRate: number | undefined = 50000;
jest.mock("../features/terminal/useRate", () => ({
  useRate: () => ({
    rate: mockRate,
    hour:
      mockRate === undefined
        ? undefined
        : jest
            .requireActual<typeof import("../lib/rates/sources")>("../lib/rates/sources")
            .pointHourOf(Math.floor(Date.now() / 1000)),
    loading: false,
    current: () => mockRate
  })
}));
// Mainnet: invoices of "bc" (the app config has no network under Jest).
jest.mock("../lib/breez/config", () => ({
  ...jest.requireActual("../lib/breez/config"),
  getBreezNetwork: () => "mainnet"
}));
jest.mock("../config/team", () => ({
  ...jest.requireActual("../config/team"),
  getInviteOrigin: () => "https://web.example"
}));
// The system's photo library: a square JPEG, as pick-image.ts gives it.
const mockPick = jest.fn<Promise<Uint8Array | null>, []>(async () => new Uint8Array(400).fill(4));
jest.mock("../features/media/pick-image", () => ({
  ...jest.requireActual("../features/media/pick-image"),
  pickSquareImage: () => mockPick()
}));
// The build shown under the last button on mobile (the app config is not there under Jest).
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
// "Contact support" copies the address when there is no mail form.
const mockCopy = jest.fn(async (_text: string) => true);
jest.mock("expo-clipboard", () => ({ setStringAsync: (text: string) => mockCopy(text) }));
// Support's key for the journal deposited (deposit.ts): none but in the tests of the deposit, so
// that the others attach the journal whatever the app's own key.
let mockJournalKey: string | null = null;
jest.mock("../config/support", () =>
  // A getter of its own: an object spread would read it once, as the module loads.
  Object.defineProperty({ ...jest.requireActual("../config/support") }, "SUPPORT_JOURNAL_KEY", {
    get: () => mockJournalKey,
    enumerable: true
  })
);
const mockDesktop = jest.fn(() => false);
jest.mock("@/components/layout/useIsDesktop", () => ({
  ...jest.requireActual("@/components/layout/useIsDesktop"),
  useIsDesktop: () => mockDesktop()
}));

const relays = jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");
// Mt Pelerin under Jest (jest/mtpelerin.ts): the staging app's, its dev/test environment.
const mtPelerinFake = jest.requireMock<typeof MtPelerinFake>("@/lib/mtpelerin/transport");
/** Mt Pelerin's login and registration: several screens and panels. */
const SLOW = { timeout: 5000 };
const mempool = jest.requireMock<typeof MempoolFake>("../lib/onchain/esplora");
const localNetwork = jest.requireMock<typeof LocalNetworkModule>("../lib/nostr/local-network");
const secureStore = jest.requireMock<typeof SecureStoreFake>("expo-secure-store");
const fileSystem = jest.requireMock<typeof FileSystemFake>("expo-file-system");
const mailComposer = jest.requireMock<typeof MailComposerFake>("expo-mail-composer");
const sharing = jest.requireMock<typeof SharingFake>("expo-sharing");

const routes = {
  index: LaunchScreen,
  join: JoinScreen,
  advanced: AdvancedSettings,
  "(app)/_layout": AppLayout,
  "(app)/pos/_layout": PosLayout,
  "(app)/pos/index": AmountScreen,
  "(app)/employees": EmployeesRoute,
  "(app)/settings/_layout": SettingsLayout,
  "(app)/settings/index": SettingsIndex,
  "(app)/settings/relays": SettingsRelays,
  "(app)/settings/split": SettingsSplit,
  "(app)/settings/bank": SettingsBank,
  "(app)/settings/merchant": SettingsMerchant,
  "(app)/settings/merchant-bank": SettingsMerchantBank,
  "(app)/settings/business": SettingsBusiness,
  "(app)/settings/display": SettingsDisplay,
  "(app)/settings/charging": SettingsCharging,
  "(app)/settings/payouts": SettingsPayouts,
  "(app)/settings/security": SettingsSecurity,
  "(app)/settings/help": SettingsHelp,
  "(app)/settings/profile": SettingsProfile,
  "(app)/settings/network": SettingsNetwork,
  "(app)/settings/node": SettingsNode
};

const OWN = "wss://relay.bakery.example";

/** Clearly fake details: the IBAN is the example of the Swiss IBAN documentation. */
const IBAN = "CH9300762011623852957";

/** The Mt Pelerin login of the staging app (its dev/test, the account's key), then its profile. */
async function logInToMtPelerin() {
  await fireEvent.press(await screen.findByTestId("mtpelerin-create", {}, SLOW));
  await fireEvent.changeText(
    await screen.findByTestId("sell-email", {}, SLOW),
    "bakery@example.com"
  );
  await fireEvent.changeText(screen.getByTestId("sell-profile-phone"), "79 000 00 00");
  await fireEvent.press(screen.getByTestId("sell-save-profile"));
}

/** The bank form filled with a company's account of `IBAN` (the country, the detected one). */
async function typeBankAccount() {
  await fireEvent.press(await screen.findByTestId("bank-holder-company", {}, SLOW));
  await fireEvent.changeText(screen.getByTestId("bank-company"), "Fine Bakery LLC");
  await fireEvent.changeText(screen.getByTestId("bank-iban"), IBAN);
  await fireEvent.changeText(screen.getByTestId("bank-address"), "1 Town Street");
  await fireEvent.changeText(screen.getByTestId("bank-postal-code"), "1003");
  await fireEvent.changeText(screen.getByTestId("bank-city"), "Lausanne");
}

/** Mt Pelerin's bank accounts of the profile logged in (dev/test, faked). */
const mtpBankAccounts = () =>
  mtPelerinFake
    .testMtPelerin()
    .accountsOfUser()
    .filter((account) => account.type === "external");

/** The owner's device, unlocked: its account open (done), its point of sale prepared. */
async function ownerDevice(patch: Parameters<typeof openTestAccount>[0] = {}) {
  await openTestAccount({ usage: "merchant", signUp: "done", ...patch });
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

/**
 * A card holder's device, unlocked: its account open (done, "cards"), its profile a card holder's,
 * without any wallet.
 */
async function cardHolderDevice(patch: Parameters<typeof openTestAccount>[0] = {}) {
  await openCardHolderAccount(patch);
  await saveTerminalProfile({
    version: 4,
    walletId: TEST_WALLET_ID,
    backupKey: getAccountBackupKey()!,
    businessName: getAccountSettings()?.businessName ?? "",
    currency: "CHF"
  });
  resetTerminalProfileCache();
}

/** The point of sale "Create my merchant profile" prepares, with the account's wallet. */
const POINT_OF_SALE = {
  version: 2,
  walletId: TEST_WALLET_ID,
  lightningAddress: "sattleme02c6047f94@breez.tips",
  currency: "CHF"
};

/**
 * Holds the publications of the account's backups (its backup key's events) until `release`: a
 * change of "Settings" waits for a relay to take it. `restore` lets them through again.
 */
function holdBackups() {
  const author = getAccountBackupKey()!;
  let release = () => undefined as void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  const publish = relays.publishEvent;
  const spy = jest.spyOn(relays, "publishEvent").mockImplementation(async (url, event, options) => {
    if (event.pubkey === author) await gate;
    return publish(url, event, options);
  });
  return {
    release: () => act(async () => release()),
    restore: () => {
      spy.mockRestore();
      release();
    }
  };
}

/** `Spinner` is hidden from screen readers: the field's state says it is saved. */
const HIDDEN = { includeHiddenElements: true };

/** The message of a change no majority of the relays took (settings.errors.unpublished). */
const UNPUBLISHED =
  "Too few relays confirmed the change, so it was cancelled. Check the connection, then try again.";
/** The same in a notification, which shows no final period. */
const UNPUBLISHED_NOTIFICATION = UNPUBLISHED.slice(0, -1);

/**
 * The routes as the web renders them: the settings' layout without its stack, whose web version
 * measures its frame (Jest has no layout), as recovery-phrase-screen.test.tsx does.
 */
const webRoutes = {
  ...routes,
  "(app)/settings/_layout": () => (
    <PayoutDraftProvider>
      <Slot />
    </PayoutDraftProvider>
  )
};

/** Renders the app on `initialUrl`; the result also answers `getPathname()`. */
async function open(initialUrl: string, routeMap: typeof routes = routes) {
  const router = await renderRouter(routeMap, { initialUrl });
  return { router };
}

/** A phone: opens a rubric of "Settings" from its card, and waits for its page. */
async function openRubric(rubric: string) {
  await fireEvent.press(await screen.findByTestId(`settings-card-${rubric}`));
  return screen.findByTestId(`settings-page-${rubric}`);
}

/** A phone: back from a rubric's page to the cards (`card`: one of them, waited for). */
async function backToCards(card = "business") {
  await fireEvent.press(screen.getByTestId("settings-page-back"));
  await screen.findByTestId(`settings-card-${card}`);
}

/** A phone: "Network", then "Edit the relays": the relays' own screen. */
async function openRelaysScreen(router: { getPathname: () => string }) {
  await fireEvent.press(await screen.findByTestId("settings-card-network"));
  await waitFor(() => expect(router.getPathname()).toBe("/settings/network"));
  await fireEvent.press(await screen.findByTestId("edit-relays"));
  await waitFor(() => expect(router.getPathname()).toBe("/settings/relays"));
}

/** A computer: chooses a tab of "Settings", and waits for its settings. */
async function openTab(rubric: string) {
  await fireEvent.press(await screen.findByTestId(`settings-tab-${rubric}`));
  return screen.findByTestId(`settings-panel-${rubric}`);
}

type HostNode = {
  type: string;
  props: Record<string, unknown>;
  children: (HostNode | string)[] | null;
};

/** The props of the native stack's screen in sight (RNSScreen, react-native-screens). */
function shownStackScreen(): Record<string, unknown> {
  const screens: HostNode[] = [];
  const walk = (node: HostNode | HostNode[] | string | null) => {
    if (node === null || typeof node === "string") return;
    if (Array.isArray(node)) return node.forEach(walk);
    if (node.type === "RNSScreen" && node.props["aria-hidden"] === false) screens.push(node);
    (node.children ?? []).forEach(walk);
  };
  walk(screen.toJSON() as HostNode | HostNode[] | null);
  expect(screens).toHaveLength(1);
  return screens[0]!.props;
}

/** The `testID`s of the screen's elements, in the order they are drawn (top to bottom). */
function testIDsInOrder(): string[] {
  const ids: string[] = [];
  const walk = (node: HostNode | HostNode[] | string | null) => {
    if (node === null || typeof node === "string") return;
    if (Array.isArray(node)) return node.forEach(walk);
    if (typeof node.props.testID === "string") ids.push(node.props.testID);
    (node.children ?? []).forEach(walk);
  };
  walk(screen.toJSON() as HostNode | HostNode[] | null);
  return ids;
}

jest.setTimeout(30_000);

beforeEach(() => {
  mockRate = 50000;
  mockJournalKey = null;
  resetPayRequests();
  closeAccount();
  relays.resetRelays();
  fileSystem.resetFileSystem();
  resetImages();
  resetRelayStatuses();
  mockDesktop.mockReturnValue(false);
  mockPick.mockClear();
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

describe("Settings of the owner, on a phone", () => {
  it('keeps a rubric page on iOS\'s swipe off the edge: "Back" saves the field first', async () => {
    await ownerDevice();
    await open("/settings");
    for (const rubric of ["business", "charging", "help"] as const) {
      await openRubric(rubric);
      // The screen shown, of the native stack (react-native-screens): no swipe off it.
      expect(shownStackScreen().gestureEnabled).toBe(false);
      await backToCards(rubric);
    }
  });

  it("shows the rubrics as cards, each opening its page, and saves a change at once", async () => {
    await ownerDevice();
    await open("/settings");
    const name = getAccountSettings()!.businessName;
    // Two a row, each with what it holds now.
    for (const [card, summary] of [
      ["business", `${name} · CHF`],
      ["charging", "Lightning and on-chain"],
      ["payouts", "All in bitcoin"],
      ["network", "5 relays"],
      ["security", "Recovery phrase"],
      ["help", "Contact support"]
    ] as const) {
      expect(await screen.findByTestId(`settings-card-${card}`)).toHaveTextContent(summary, {
        exact: false
      });
    }
    // "Account" always at the bottom, then "Log out", apart as on a computer, then the terms and
    // the privacy policy and the version line, as on the welcome screen (the side bar's on
    // desktop).
    const FOOTER = [
      "settings-card-help",
      "delete-account",
      "logout",
      "settings-legal-terms",
      "settings-legal-privacy",
      "settings-version"
    ];
    const order = testIDsInOrder().filter((id) => FOOTER.includes(id));
    expect(order).toEqual(FOOTER);
    expect(screen.getByTestId("settings-legal-privacy")).toHaveTextContent("Privacy policy");
    // The staging build, then "What's new": its notes never opened on this device.
    expect(versionParts(screen.getByTestId("settings-version"))).toEqual([
      "f82ecab",
      "staging",
      "What's new"
    ]);

    // "Payments": "On-chain payments" saved as soon as it is switched, once a relay took it.
    await openRubric("charging");
    // Lightning's ceiling, not read (no LNURL server in this test): said without a figure.
    expect(
      await screen.findByText(
        "Always offered, up to your Lightning address's ceiling; above it, only the on-chain address is shown"
      )
    ).toBeTruthy();
    // Said precisely: the point of sale's only, the owner's and the employees'; the invoices and
    // the integrations always offer on-chain.
    expect(
      screen.getByText(
        "Confirmed in 10 to 60 minutes. Applies to the point of sale, yours and your employees'. Your invoices and integrations always offer on-chain payment."
      )
    ).toBeTruthy();
    await fireEvent.press(screen.getByTestId("onchain-switch"));
    expect(await screen.findByText("On-chain payments saved")).toBeTruthy();
    expect(screen.getByText("Lightning only at the point of sale")).toBeTruthy();
    expect(getAccountSettings()?.onchainPayments).toBe(false);
    await backToCards();
    expect(screen.getByTestId("settings-card-charging")).toHaveTextContent(
      "Lightning only at the point of sale",
      { exact: false }
    );

    // "Business": the name saved when its field is left.
    await openRubric("business");
    const field = screen.getByTestId("business-name-field");
    await fireEvent.changeText(field, "Fine Bakery");
    await fireEvent(field, "submitEditing");
    expect(await screen.findByText("Name saved")).toBeTruthy();
    expect(getAccountSettings()?.businessName).toBe("Fine Bakery");

    // "Reference currency": from its list.
    await fireEvent.press(screen.getByTestId("display-currency"));
    await fireEvent.press(await screen.findByTestId("currency-EUR"));
    expect(await screen.findByText("Reference currency saved")).toBeTruthy();
    expect(
      await within(screen.getByTestId("display-currency")).findByText("EUR — Euros")
    ).toBeTruthy();
    expect(getAccountSettings()?.displayCurrency).toBe("EUR");

    // The logo: picked, published, shown.
    await fireEvent.press(screen.getByTestId("change-logo"));
    expect(await screen.findByText("Logo saved")).toBeTruthy();
    expect(getAccountSettings()?.logo).not.toBeNull();
    expect(await screen.findByTestId("business-logo-image")).toBeTruthy();
    await backToCards();
    expect(screen.getByTestId("settings-card-business")).toHaveTextContent("Fine Bakery · EUR", {
      exact: false
    });
  });

  it("sets the invoices' default VAT: the country's standard rate until one is typed", async () => {
    await ownerDevice({ detectedCountry: "CH" });
    await open("/settings");
    await openRubric("business");
    // None typed yet: Switzerland's standard rate.
    const field = screen.getByTestId("vat-rate-field");
    expect(field.props.value).toBe("");
    expect(field.props.placeholder).toBe("8.1");
    expect(screen.getByText(/^Leave empty for the standard rate: 8\.1\s?%$/)).toBeTruthy();
    // Not a rate: said, nothing is saved, the field shows the saved one again.
    await fireEvent.changeText(field, "120");
    await fireEvent(field, "blur");
    expect(await screen.findByText("Enter a rate between 0 and 100%")).toBeTruthy();
    expect(getAccountSettings()?.vatRate).toBeNull();
    await waitFor(() => expect(screen.getByTestId("vat-rate-field").props.value).toBe(""));

    await fireEvent.changeText(screen.getByTestId("vat-rate-field"), "2.6");
    await fireEvent(screen.getByTestId("vat-rate-field"), "blur");
    expect(await screen.findByText("Default VAT saved")).toBeTruthy();
    expect(getAccountSettings()?.vatRate).toBe(260);

    // Emptied: the standard rate again.
    await fireEvent.changeText(screen.getByTestId("vat-rate-field"), "");
    await fireEvent(screen.getByTestId("vat-rate-field"), "blur");
    await waitFor(() => expect(getAccountSettings()?.vatRate).toBeNull());
  });

  it("sets the business's address for its invoices, line by line, in its country at first", async () => {
    await ownerDevice({ detectedCountry: "CH" });
    await open("/settings");
    await openRubric("business");
    // None typed yet: empty lines, the account's country.
    expect(screen.getByTestId("business-address-street").props.value).toBe("");
    expect(screen.getByTestId("business-address-country")).toHaveTextContent(/Switzerland/);

    await fireEvent.changeText(screen.getByTestId("business-address-street"), " 4 Market Street ");
    await fireEvent(screen.getByTestId("business-address-street"), "blur");
    expect(await screen.findByText("Address saved")).toBeTruthy();
    expect(getAccountSettings()?.businessAddress).toEqual({
      street: "4 Market Street",
      postalCode: "",
      city: "",
      country: "CH"
    });
    await fireEvent.changeText(screen.getByTestId("business-address-postalCode"), "1204");
    await fireEvent(screen.getByTestId("business-address-postalCode"), "submitEditing");
    await fireEvent.changeText(screen.getByTestId("business-address-city"), "Geneva");
    await fireEvent(screen.getByTestId("business-address-city"), "blur");
    await waitFor(() =>
      expect(getAccountSettings()?.businessAddress).toMatchObject({
        postalCode: "1204",
        city: "Geneva"
      })
    );

    // Another country, from the countries' list.
    await fireEvent.press(screen.getByTestId("business-address-country"));
    await fireEvent.changeText(await screen.findByTestId("country-search"), "france");
    await fireEvent.press(await screen.findByText("France", {}, { timeout: 5000 }));
    await waitFor(() => expect(getAccountSettings()?.businessAddress?.country).toBe("FR"));
    await waitFor(() =>
      expect(screen.getByTestId("business-address-country")).toHaveTextContent(/France/)
    );
  });

  it("names the business's numbers as its country does, and saves them for its invoices", async () => {
    await ownerDevice({ detectedCountry: "CH" });
    await open("/settings");
    await openRubric("business");
    // Switzerland, detected when the account was created: its IDE and its VAT number.
    expect(screen.getByText("UID number")).toBeTruthy();
    expect(screen.getByText("VAT number")).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId("business-companyNumber"), " CHE-123.456.789 ");
    await fireEvent(screen.getByTestId("business-companyNumber"), "blur");
    expect(await screen.findByText("Number saved")).toBeTruthy();
    expect(getAccountSettings()?.companyNumber).toBe("CHE-123.456.789");
    await fireEvent.changeText(screen.getByTestId("business-vatNumber"), "CHE-123.456.789 MWST");
    await fireEvent(screen.getByTestId("business-vatNumber"), "submitEditing");
    await waitFor(() => expect(getAccountSettings()?.vatNumber).toBe("CHE-123.456.789 MWST"));

    // The business in France: the same fields, named as France names them.
    await fireEvent.press(screen.getByTestId("business-address-country"));
    await fireEvent.changeText(await screen.findByTestId("country-search"), "france");
    await fireEvent.press(await screen.findByText("France", {}, { timeout: 5000 }));
    expect(await screen.findByText("SIRET number")).toBeTruthy();
    expect(screen.getByText("VAT identification number")).toBeTruthy();
    expect(screen.queryByText("UID number")).toBeNull();
    // Emptied: none on the invoices.
    await fireEvent.changeText(screen.getByTestId("business-vatNumber"), "");
    await fireEvent(screen.getByTestId("business-vatNumber"), "blur");
    await waitFor(() => expect(getAccountSettings()?.vatNumber).toBe(""));
  });

  it("sets the tolerance of on-chain underpayments: none at first, by tenths up to 10 %", async () => {
    await ownerDevice();
    await open("/settings");
    await openRubric("charging");
    expect(screen.getByTestId("tolerance-field").props.value).toBe("");
    expect(screen.getByText("From 0 to 10%, to the tenth. Empty or 0: none.")).toBeTruthy();
    // Above 10 %, or finer than a tenth: said, nothing saved.
    for (const typed of ["12", "2.55"]) {
      await fireEvent.changeText(screen.getByTestId("tolerance-field"), typed);
      await fireEvent(screen.getByTestId("tolerance-field"), "blur");
      expect(
        await screen.findByText("Enter a percentage between 0 and 10, to the tenth")
      ).toBeTruthy();
      await waitFor(() => expect(screen.getByTestId("tolerance-field").props.value).toBe(""));
    }
    expect(getAccountSettings()?.onchainTolerance).toBe(0);

    await fireEvent.changeText(screen.getByTestId("tolerance-field"), "2.5");
    await fireEvent(screen.getByTestId("tolerance-field"), "blur");
    expect(await screen.findByText("Tolerance saved")).toBeTruthy();
    expect(screen.getByText(/^2\.5\s?% for the next sales and invoices$/)).toBeTruthy();
    expect(getAccountSettings()?.onchainTolerance).toBe(250);
    await waitFor(() => expect(screen.getByTestId("tolerance-field").props.value).toBe("2.5"));

    // Emptied: none again.
    await fireEvent.changeText(screen.getByTestId("tolerance-field"), "");
    await fireEvent(screen.getByTestId("tolerance-field"), "blur");
    expect(await screen.findByText("None: the whole amount is asked")).toBeTruthy();
    expect(getAccountSettings()?.onchainTolerance).toBe(0);
  });

  it("shows a loader in the field until a relay took its change, which cannot change meanwhile", async () => {
    await ownerDevice();
    await open("/settings");

    // "On-chain payments": the switch shows the new value, the loader in its knob, none beside
    // it (one loader, the switch's).
    await openRubric("charging");
    let held = holdBackups();
    try {
      await fireEvent.press(screen.getByTestId("onchain-switch"));
      expect(await screen.findByTestId("onchain-switch-spinner", HIDDEN)).toBeTruthy();
      expect(screen.queryByTestId("onchain-row-saving", HIDDEN)).toBeNull();
      expect(screen.getByTestId("onchain-switch").props.accessibilityState).toEqual({
        checked: false,
        disabled: true,
        busy: true
      });
      expect(screen.queryByText("On-chain payments saved")).toBeNull();
      await held.release();
      expect(await screen.findByText("On-chain payments saved")).toBeTruthy();
      await waitFor(() =>
        expect(screen.queryByTestId("onchain-switch-spinner", HIDDEN)).toBeNull()
      );
      expect(screen.getByTestId("onchain-switch")).not.toBeDisabled();
    } finally {
      held.restore();
    }
    await backToCards();

    // The name: the field greyed with the loader at its end.
    await openRubric("business");
    held = holdBackups();
    try {
      await fireEvent.changeText(screen.getByTestId("business-name-field"), "Fine Bakery");
      await fireEvent(screen.getByTestId("business-name-field"), "submitEditing");
      expect(await screen.findByTestId("business-name-saving", HIDDEN)).toBeTruthy();
      expect(screen.getByTestId("business-name-field")).toBeDisabled();
      expect(screen.getByTestId("business-name-field")).toHaveDisplayValue("Fine Bakery");
      expect(screen.queryByText("Name saved")).toBeNull();
      await held.release();
      expect(await screen.findByText("Name saved")).toBeTruthy();
      expect(screen.getByTestId("business-name-field")).not.toBeDisabled();
    } finally {
      held.restore();
    }

    // The currency: its field shows the new one, the loader in place of the chevron.
    held = holdBackups();
    try {
      await fireEvent.press(screen.getByTestId("display-currency"));
      await fireEvent.press(await screen.findByTestId("currency-EUR"));
      expect(await screen.findByTestId("display-currency-saving", HIDDEN)).toBeTruthy();
      expect(screen.getByTestId("display-currency")).toBeDisabled();
      await held.release();
      expect(await screen.findByText("Reference currency saved")).toBeTruthy();
      expect(screen.queryByTestId("display-currency-saving", HIDDEN)).toBeNull();
      expect(screen.getByTestId("display-currency")).not.toBeDisabled();
    } finally {
      held.restore();
    }

    // The logo: the loader over it until its reference is taken too, not only its image.
    held = holdBackups();
    try {
      await fireEvent.press(screen.getByTestId("business-logo"));
      expect(await screen.findByTestId("avatar-busy")).toBeTruthy();
      await waitFor(() =>
        expect(
          relays.calls.some(
            ({ operation, event }) =>
              operation === "publish" && event?.pubkey === getAccountBackupKey()
          )
        ).toBe(true)
      );
      expect(screen.getByTestId("avatar-busy")).toBeTruthy();
      expect(screen.getByTestId("business-logo")).toBeDisabled();
      expect(screen.getByTestId("change-logo")).toBeDisabled();
      await held.release();
      expect(await screen.findByText("Logo saved")).toBeTruthy();
      expect(screen.queryByTestId("avatar-busy")).toBeNull();
    } finally {
      held.restore();
    }
  });

  it("cancels a change no relay took, and says so", async () => {
    await ownerDevice();
    const before = getAccountSettings()!;
    await open("/settings");
    await openRubric("business");
    // The relays answer, and refuse every event.
    for (const relay of DEFAULT_RELAYS) relays.readOnly.add(relay);

    // The name: the field shows the saved one again, and the notification says why.
    await fireEvent.changeText(screen.getByTestId("business-name-field"), "Fine Bakery");
    await fireEvent(screen.getByTestId("business-name-field"), "submitEditing");
    expect(await screen.findByText("Error while saving")).toBeTruthy();
    expect(screen.getByText(UNPUBLISHED_NOTIFICATION)).toBeTruthy();
    await waitFor(() =>
      expect(screen.getByTestId("business-name-field")).toHaveDisplayValue(before.businessName)
    );
    expect(getAccountSettings()?.businessName).toBe(before.businessName);
    await backToCards();

    // "On-chain payments": back as it was, with an error notification.
    await openRubric("charging");
    await fireEvent.press(screen.getByTestId("onchain-switch"));
    await waitFor(() => expect(screen.getByTestId("onchain-switch")).toBeChecked());
    expect(getAccountSettings()?.onchainPayments).toBe(true);
  });

  it('opens a phone\'s rubric page on a computer as its tab: back to "Settings"', async () => {
    await ownerDevice();
    mockDesktop.mockReturnValue(true);
    const { router } = await open("/settings/charging");
    await waitFor(() => expect(router.getPathname()).toBe("/settings"));
    expect(await screen.findByTestId("settings-tabs")).toBeTruthy();
  });

  it("edits the relays on their own screen: an address checked, the lights, then saved", async () => {
    await ownerDevice();
    const { router } = await open("/settings");
    await openRelaysScreen(router);
    expect(screen.getByText(DEFAULT_RELAYS[0]!)).toBeTruthy();
    // Nothing changed yet: "Save" is greyed.
    expect(screen.getByTestId("save-relays")).toBeDisabled();

    // An incomplete address, then one already listed, then a new one.
    await fireEvent.press(screen.getByTestId("add-relay"));
    await fireEvent.changeText(await screen.findByTestId("relay-address"), "relay");
    await fireEvent.press(screen.getByTestId("add-relay-confirm"));
    expect(await screen.findByText("Enter a complete address")).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId("relay-address"), DEFAULT_RELAYS[2]!);
    await fireEvent.press(screen.getByTestId("add-relay-confirm"));
    expect(await screen.findByText("Enter a relay not in the list")).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId("relay-address"), "Relay.Bakery.example");
    await fireEvent.press(screen.getByTestId("add-relay-confirm"));
    expect(await screen.findByText(OWN)).toBeTruthy();

    // One relay out of reach turns red after the test, and keeps "Save" greyed.
    relays.unreachable.add(DEFAULT_RELAYS[1]!);
    await fireEvent.press(screen.getByTestId("test-relays"));
    expect(await screen.findByTestId("relays-unreachable")).toBeTruthy();
    expect(screen.getByTestId("save-relays")).toBeDisabled();
    await fireEvent.press(screen.getByTestId("remove-relay-1"));
    expect(screen.queryByTestId("relays-unreachable")).toBeNull();

    await fireEvent.press(screen.getByTestId("save-relays"));
    expect(await screen.findByText("Relays saved")).toBeTruthy();
    // Back to "Network", where it was opened from.
    await waitFor(() => expect(router.getPathname()).toBe("/settings/network"));
    const expected = [DEFAULT_RELAYS[0], ...DEFAULT_RELAYS.slice(2), OWN];
    expect(getAccountSettings()?.relays).toEqual(expected);
    expect(currentRelays()).toEqual(expected);
  });

  it('shows "Network" on a phone: the relays, the Bitcoin node and the product lookup', async () => {
    await ownerDevice();
    const { router } = await open("/settings");
    await openRubric("network");
    expect(router.getPathname()).toBe("/settings/network");
    expect(screen.getByTestId("relays-summary")).toBeTruthy();
    // mempool.space until the owner names a node.
    expect(screen.getByTestId("node-row")).toHaveTextContent("mempool.space", { exact: false });
    expect(screen.getByTestId("node-row")).toHaveTextContent("Default", { exact: false });

    // "Look up scanned products": on, saved live once a relay took it.
    expect(screen.getByTestId("product-lookup-switch").props.accessibilityState).toMatchObject({
      checked: true
    });
    await fireEvent.press(screen.getByTestId("product-lookup-switch"));
    expect(await screen.findByText("Product lookup saved")).toBeTruthy();
    expect(getAccountSettings()?.productLookup).toBe(false);
  });

  it("names the merchant's own node: checked, refused in http://, tested, then saved", async () => {
    await ownerDevice();
    const { router } = await open("/settings/network");
    await fireEvent.press(await screen.findByTestId("node-row"));
    await waitFor(() => expect(router.getPathname()).toBe("/settings/node"));
    expect(screen.getByTestId("node-mempool").props.accessibilityState).toMatchObject({
      checked: true
    });
    // The address and the fallback show only for "My node".
    expect(screen.queryByTestId("node-url")).toBeNull();
    await fireEvent.press(screen.getByTestId("node-own"));

    // Plain HTTP: refused, the local network's included, nothing asked.
    for (const address of ["http://mempool.example.ch", "http://192.168.1.20:3006"]) {
      await fireEvent.changeText(await screen.findByTestId("node-url"), address);
      await fireEvent.press(screen.getByTestId("node-test"));
      expect(
        await screen.findByText(
          "Only an https:// address is accepted: with http://, the connection is not encrypted"
        )
      ).toBeTruthy();
    }
    expect(mempool.chain.calls.filter(({ base }) => base !== "https://mempool.space/api")).toEqual(
      []
    );

    // An address typed without its scheme: https://, tested.
    await fireEvent.changeText(screen.getByTestId("node-url"), "192.168.1.20:3006");
    expect(screen.queryByTestId("node-http")).toBeNull();
    await fireEvent.press(screen.getByTestId("node-test"));
    expect(await screen.findByText("Node reachable and up to date")).toBeTruthy();

    await fireEvent.press(screen.getByTestId("node-fallback-none"));
    await fireEvent.press(screen.getByTestId("node-save"));
    expect(await screen.findByText("Bitcoin node saved")).toBeTruthy();
    await waitFor(() => expect(router.getPathname()).toBe("/settings/network"));
    expect(getAccountSettings()?.bitcoinNode).toEqual({
      url: "https://192.168.1.20:3006",
      fallback: "none",
      payers: false
    });
    expect(await screen.findByTestId("node-row")).toHaveTextContent("192.168.1.20:3006", {
      exact: false
    });
  });

  // A node saved in http:// before HTTPS was required (src/lib/onchain/node.ts): still read, said
  // to be no longer used, and kept as it is only until the owner types another address.
  it("says a node saved in http:// is no longer used, and saves it only once in https://", async () => {
    await ownerDevice();
    await updateAccount({
      bitcoinNode: { url: "http://192.168.1.20:3006", fallback: "none", payers: false }
    });
    const { router } = await open("/settings/network");
    expect(await screen.findByTestId("node-row")).toHaveTextContent("HTTP", { exact: false });
    await fireEvent.press(screen.getByTestId("node-row"));
    await waitFor(() => expect(router.getPathname()).toBe("/settings/node"));
    expect(await screen.findByTestId("node-http")).toHaveTextContent(
      "the app now connects to your node over https:// only",
      { exact: false }
    );

    await fireEvent.press(screen.getByTestId("node-save"));
    expect(
      await screen.findByText(
        "Only an https:// address is accepted: with http://, the connection is not encrypted"
      )
    ).toBeTruthy();
    expect(getAccountSettings()?.bitcoinNode?.url).toBe("http://192.168.1.20:3006");

    await fireEvent.changeText(screen.getByTestId("node-url"), "https://192.168.1.20:3006");
    expect(screen.queryByTestId("node-http")).toBeNull();
    await fireEvent.press(screen.getByTestId("node-save"));
    expect(await screen.findByText("Bitcoin node saved")).toBeTruthy();
    expect(getAccountSettings()?.bitcoinNode).toEqual({
      url: "https://192.168.1.20:3006",
      fallback: "none",
      payers: false
    });
  });

  it("passes an HTTPS node on to the payers' pages only when the owner turns it on", async () => {
    await ownerDevice();
    await open("/settings/node");
    await fireEvent.press(await screen.findByTestId("node-own"));

    // A node of the local network: the payers' browsers cannot reach it, the switch is off.
    await fireEvent.changeText(await screen.findByTestId("node-url"), "192.168.1.20:3006");
    expect(await screen.findByTestId("node-payers-switch")).toBeTruthy();
    expect(screen.getByTestId("node-payers-switch").props.accessibilityState).toMatchObject({
      checked: false,
      disabled: true
    });
    expect(
      screen.getByText(
        "Only for a node reachable from the Internet, over https:// with a domain name: your customers' browser cannot reach your local network."
      )
    ).toBeTruthy();
    // That caption is a warning: the yellow triangle at its left.
    expect(screen.getByTestId("node-payers-row-warning")).toBeTruthy();
    // HTTPS on the local network: never named to the payers' pages either.
    await fireEvent.changeText(screen.getByTestId("node-url"), "https://192.168.1.20:3006");
    await waitFor(() =>
      expect(screen.getByTestId("node-payers-switch").props.accessibilityState).toMatchObject({
        checked: false,
        disabled: true
      })
    );

    // HTTPS: offered, off by default; the payers' pages stay on mempool.space until turned on.
    await fireEvent.changeText(screen.getByTestId("node-url"), "https://node.example.ch");
    await waitFor(() =>
      expect(screen.getByTestId("node-payers-switch").props.accessibilityState).toMatchObject({
        checked: false,
        disabled: false
      })
    );
    expect(screen.queryByTestId("node-payers-row-warning")).toBeNull();
    expect(
      screen.getByText(/^Your customers' payment page and the time a payment was sent/)
    ).toBeTruthy();
    // On the page's cream, its card raised, as every card of "Settings".
    expect(StyleSheet.flatten(screen.getByTestId("node-payers-card").props.style)).toMatchObject({
      boxShadow: shadow.card
    });
    await fireEvent.press(screen.getByTestId("node-payers-switch"));
    expect(screen.getByTestId("node-payers-switch").props.accessibilityState).toMatchObject({
      checked: true
    });
    expect(screen.getByText(/your customers' IP address/)).toBeTruthy();
    expect(screen.getByText(/^The time a payment was sent, which sets its rate/)).toBeTruthy();

    await fireEvent.press(screen.getByTestId("node-save"));
    expect(await screen.findByText("Bitcoin node saved")).toBeTruthy();
    expect(getAccountSettings()?.bitcoinNode).toEqual({
      url: "https://node.example.ch",
      fallback: "mempool",
      payers: true
    });
  });

  it("never passes a node on to the payers' pages once its address is the local network's", async () => {
    await ownerDevice();
    await updateAccount({
      bitcoinNode: { url: "https://node.example.ch", fallback: "mempool", payers: true }
    });
    await open("/settings/node");
    expect(
      (await screen.findByTestId("node-payers-switch")).props.accessibilityState
    ).toMatchObject({ checked: true });
    await fireEvent.changeText(screen.getByTestId("node-url"), "https://192.168.1.20:3006");
    await waitFor(() =>
      expect(screen.getByTestId("node-payers-switch").props.accessibilityState).toMatchObject({
        checked: false,
        disabled: true
      })
    );
    await fireEvent.press(screen.getByTestId("node-save"));
    expect(await screen.findByText("Bitcoin node saved")).toBeTruthy();
    expect(getAccountSettings()?.bitcoinNode).toEqual({
      url: "https://192.168.1.20:3006",
      fallback: "mempool",
      payers: false
    });
  });

  it("asks before saving a node that does not answer from this device", async () => {
    await ownerDevice();
    mempool.chain.down.add("https://192.168.1.20:3006/api");
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const { router } = await open("/settings/node");
      await fireEvent.press(await screen.findByTestId("node-own"));
      await fireEvent.changeText(
        await screen.findByTestId("node-url"),
        "https://192.168.1.20:3006"
      );
      await fireEvent.press(screen.getByTestId("node-save"));
      expect(await screen.findByText("Node unreachable")).toBeTruthy();
      expect(await screen.findByText("Save this node?")).toBeTruthy();
      // Cancelled: nothing saved.
      await fireEvent.press(screen.getByText("Cancel"));
      expect(getAccountSettings()?.bitcoinNode).toBeNull();
      // Saved all the same: it may answer from the business's network.
      await fireEvent.press(screen.getByTestId("node-save"));
      await fireEvent.press(await screen.findByTestId("node-confirm-save"));
      expect(await screen.findByText("Bitcoin node saved")).toBeTruthy();
      expect(getAccountSettings()?.bitcoinNode).toEqual({
        url: "https://192.168.1.20:3006",
        fallback: "mempool",
        payers: false
      });
      await waitFor(() => expect(router.getPathname()).toBe("/settings"));
    } finally {
      warn.mockRestore();
    }
  });

  it("goes back to mempool.space", async () => {
    await ownerDevice();
    await updateAccount({
      bitcoinNode: { url: "https://node.example.ch", fallback: "mempool", payers: false }
    });
    await open("/settings/node");
    expect((await screen.findByTestId("node-url")).props.value).toBe("https://node.example.ch");
    await fireEvent.press(screen.getByTestId("node-mempool"));
    await fireEvent.press(screen.getByTestId("node-save"));
    expect(await screen.findByText("Bitcoin node saved")).toBeTruthy();
    expect(getAccountSettings()?.bitcoinNode).toBeNull();
  });

  // A relay that gives an author's records to that author only would serve the points of sale,
  // the employees' devices and the payers nothing.
  it("never saves a relay that refuses to give a key's records to another key: tested first", async () => {
    await ownerDevice();
    const { router } = await open("/settings/relays");
    await waitFor(() => expect(router.getPathname()).toBe("/settings/relays"));
    await fireEvent.press(await screen.findByTestId("add-relay"));
    await fireEvent.changeText(await screen.findByTestId("relay-address"), "relay.bakery.example");
    await fireEvent.press(screen.getByTestId("add-relay-confirm"));
    relays.authorReads.add(OWN);
    // Not tested yet: "Save" tests it first, and saves nothing.
    expect(screen.getByTestId("save-relays")).toBeEnabled();
    await fireEvent.press(screen.getByTestId("save-relays"));
    expect(await screen.findByTestId("relays-restricted")).toBeTruthy();
    expect(screen.getByTestId("relays-unreachable")).toBeTruthy();
    const index = DEFAULT_RELAYS.length;
    expect(
      screen.getByTestId(`relay-line-${index}`, { includeHiddenElements: true })
    ).toHaveTextContent(/^Reading refused/);
    expect(
      screen.getAllByTestId("relay-light-restricted", { includeHiddenElements: true })
    ).toHaveLength(1);
    expect(screen.getByTestId("save-relays")).toBeDisabled();
    expect(router.getPathname()).toBe("/settings/relays");
    expect(getAccountSettings()?.relays).toEqual([...DEFAULT_RELAYS]);

    // Removed, it goes with its note; another relay added, tested at the save, then saved.
    await fireEvent.press(screen.getByTestId(`remove-relay-${index}`));
    expect(screen.queryByTestId("relays-restricted")).toBeNull();
    await fireEvent.press(screen.getByTestId("add-relay"));
    await fireEvent.changeText(await screen.findByTestId("relay-address"), "relay.open.example");
    await fireEvent.press(screen.getByTestId("add-relay-confirm"));
    await fireEvent.press(screen.getByTestId("save-relays"));
    expect(await screen.findByText("Relays saved")).toBeTruthy();
    await waitFor(() => expect(router.getPathname()).toBe("/settings"));
    expect(getAccountSettings()?.relays).toEqual([...DEFAULT_RELAYS, "wss://relay.open.example"]);
  });

  // Each light changes as soon as its relay answered, not with the slowest; under each address, its
  // status and how long it took.
  it("turns each relay's light as soon as that relay answered, with how long it took", async () => {
    await ownerDevice();
    const { router } = await open("/settings/relays");
    await waitFor(() => expect(router.getPathname()).toBe("/settings/relays"));
    const [slow, late, refused] = [DEFAULT_RELAYS[0]!, DEFAULT_RELAYS[1]!, DEFAULT_RELAYS[2]!];
    relays.unreachable.add(late);
    relays.unreachable.add(refused);
    const releases = new Map<string, () => void>();
    const held = new Map(
      [slow, late].map((relay) => [
        relay,
        new Promise<void>((resolve) => releases.set(relay, resolve))
      ])
    );
    const query = relays.queryEvents;
    const holding = jest.spyOn(relays, "queryEvents").mockImplementation(async (url, ...args) => {
      await held.get(url);
      return query(url, ...args);
    });
    // The test's clock (performance.now): each relay's delay is read from it.
    let clock = 50_000;
    const now = jest.spyOn(performance, "now").mockImplementation(() => clock);
    try {
      await fireEvent.press(await screen.findByTestId("test-relays"));
      // The held relays are still being tested: the others already show their outcome, a relay
      // that failed at once without the timeout's line.
      expect(await screen.findByLabelText(`${refused}, Unreachable`)).toBeTruthy();
      for (const relay of DEFAULT_RELAYS.slice(3)) {
        expect(screen.getByLabelText(`${relay}, Connected · 0\u00a0ms`)).toBeTruthy();
      }
      expect(screen.getByLabelText(`${slow}, Testing`)).toBeTruthy();
      expect(screen.getByLabelText(`${late}, Testing`)).toBeTruthy();
      // The line under the address, hidden from screen readers (the address's label reads it).
      const line = (index: number) =>
        screen.getByTestId(`relay-line-${index}`, { includeHiddenElements: true });
      expect(line(0)).toHaveTextContent("Testing");
      expect(line(3)).toHaveTextContent("Connected · 0\u00a0ms");
      expect(screen.getByTestId("test-relays")).toBeDisabled();
      // A spinner in place of its label, which stays as it was.
      expect(
        within(screen.getByTestId("test-relays")).getByText("Test the connection")
      ).toBeTruthy();
      expect(
        screen.getByTestId("test-relays-spinner", { includeHiddenElements: true })
      ).toBeTruthy();

      clock += 1340;
      releases.get(slow)!();
      expect(await screen.findByLabelText(`${slow}, Connected · 1.34\u00a0s`)).toBeTruthy();
      expect(screen.getByLabelText(`${late}, Testing`)).toBeTruthy();

      // No answer within the test's 8 s.
      clock += 8000;
      releases.get(late)!();
      expect(
        await screen.findByLabelText(`${late}, Unreachable · no answer in 8\u00a0s`)
      ).toBeTruthy();
    } finally {
      for (const release of releases.values()) release();
      holding.mockRestore();
      now.mockRestore();
    }
    await waitFor(() => expect(screen.getByTestId("test-relays")).toBeEnabled());
    expect(screen.getByTestId("relays-unreachable")).toBeTruthy();
  });

  // On the web, "Test the connection" asks the browser for local network access first (Local
  // Network Access), only when the list holds a relay it may count as local.
  it("asks for local network access before testing a relay it may need it for", async () => {
    const UMBREL = "wss://umbrel-1.tail1234.ts.net:8443";
    const ask = jest.mocked(localNetwork.askLocalNetworkAccess);
    ask.mockClear();
    await ownerDevice();
    const { router } = await open("/settings/relays");
    await waitFor(() => expect(router.getPathname()).toBe("/settings/relays"));

    // No such relay: nothing is asked.
    await fireEvent.press(await screen.findByTestId("test-relays"));
    await waitFor(() => expect(screen.getByTestId("test-relays")).toBeEnabled());
    expect(ask).not.toHaveBeenCalled();

    // A Tailscale name: asked for it alone, before the test; the browser blocks it, the note says
    // where to allow it.
    await fireEvent.press(screen.getByTestId("add-relay"));
    await fireEvent.changeText(
      await screen.findByTestId("relay-address"),
      "umbrel-1.tail1234.ts.net:8443"
    );
    await fireEvent.press(screen.getByTestId("add-relay-confirm"));
    expect(await screen.findByText(UMBREL)).toBeTruthy();
    relays.unreachable.add(UMBREL);
    ask.mockResolvedValueOnce("denied");
    await fireEvent.press(screen.getByTestId("test-relays"));
    expect(await screen.findByTestId("relays-local-network-blocked")).toBeTruthy();
    expect(ask).toHaveBeenCalledTimes(1);
    expect(ask).toHaveBeenCalledWith([UMBREL], 60_000);
    expect(screen.queryByTestId("relays-local-network-not-allowed")).toBeNull();

    // The browser's request dismissed (reset in the site's settings), the relay still red: the
    // note says to test again, or else to check this device's network.
    ask.mockResolvedValueOnce("prompt");
    await fireEvent.press(screen.getByTestId("test-relays"));
    expect(await screen.findByTestId("relays-local-network-not-allowed")).toBeTruthy();
    expect(screen.queryByTestId("relays-local-network-blocked")).toBeNull();
    expect(ask).toHaveBeenCalledTimes(2);

    // Allowed, then tested again: green, the notes gone.
    relays.unreachable.delete(UMBREL);
    ask.mockResolvedValueOnce("granted");
    await fireEvent.press(screen.getByTestId("test-relays"));
    await waitFor(() =>
      expect(screen.queryByTestId("relays-local-network-not-allowed")).toBeNull()
    );
    expect(screen.queryByTestId("relays-local-network-blocked")).toBeNull();
    expect(screen.queryByTestId("relays-unreachable")).toBeNull();
    expect(screen.getByTestId("save-relays")).toBeEnabled();
  });

  it("says nothing of integrations on the relays' screen when the account has none", async () => {
    await ownerDevice();
    const { router } = await open("/settings");
    await openRelaysScreen(router);
    // No integration: nothing to say.
    expect(await screen.findByText(DEFAULT_RELAYS[0]!)).toBeTruthy();
    await act(async () => undefined);
    expect(screen.queryByTestId("relays-notice")).toBeNull();
  });

  it("warns on the relays' screen that integrations follow 3 changes of relays at most", async () => {
    await ownerDevice();
    const team = deriveTeamKeys(walletSecret(testSeed()));
    await publishIntegration(team, {
      id: "0123456789abcdef0123456789abcdef",
      name: "Shop",
      createdAt: 1790000000,
      platform: "node"
    });
    const { router } = await open("/settings");
    await openRelaysScreen(router);
    expect((await screen.findByTestId("relays-notice")).props.children).toBe(
      "This account's integrations follow at most 3 changes of relays since they were created. Beyond that, their server can no longer find them: create them again and give the new keys to their integrators."
    );
  });

  it("warns on the relays' screen when no relay tells whether the account has integrations", async () => {
    await ownerDevice();
    const { router } = await open("/settings");
    await openRelaysScreen(router);
    await act(async () => undefined);
    expect(screen.queryByTestId("relays-notice")).toBeNull();
    // Leave, then come back while no relay answers: not read is never "none".
    await fireEvent.press(screen.getByTestId("relays-back"));
    await waitFor(() => expect(router.getPathname()).toBe("/settings/network"));
    for (const relay of DEFAULT_RELAYS) relays.unreachable.add(relay);
    await fireEvent.press(await screen.findByTestId("edit-relays"));
    expect(await screen.findByTestId("relays-notice")).toBeTruthy();
  });

  it("changes the relays of a team without asking: everyone in it follows", async () => {
    await ownerDevice();
    await inviteEmployee("Alice");
    const { router } = await open("/settings/relays");
    await waitFor(() => expect(router.getPathname()).toBe("/settings/relays"));
    await fireEvent.press(await screen.findByTestId("add-relay"));
    await fireEvent.changeText(await screen.findByTestId("relay-address"), "relay.bakery.example");
    await fireEvent.press(screen.getByTestId("add-relay-confirm"));
    await fireEvent.press(screen.getByTestId("save-relays"));
    expect(await screen.findByText("Relays saved")).toBeTruthy();
    expect(screen.queryByTestId("relays-confirm-dialog")).toBeNull();
    await waitFor(() => expect(router.getPathname()).toBe("/settings"));
    expect(getAccountSettings()?.relays).toEqual([...DEFAULT_RELAYS, OWN]);
    // Kept: their records and channels on the new relays.
    const team = deriveTeamKeys(walletSecret(testSeed()));
    expect((await rosterOn(team, [OWN])).active).toEqual([
      expect.objectContaining({ name: "Alice" })
    ]);
  });

  it("keeps the last relay: its trash is greyed", async () => {
    await ownerDevice({ relays: [OWN] });
    const { router } = await open("/settings/relays");
    await waitFor(() => expect(router.getPathname()).toBe("/settings/relays"));
    expect(await screen.findByText("Keep at least one relay.")).toBeTruthy();
    expect(screen.getByTestId("remove-relay-0")).toBeDisabled();
  });

  it("changes the bank account at Mt Pelerin, its IBAN checked, the settings keeping its id only", async () => {
    await ownerDevice({ bitcoinPercent: 60, detectedCountry: "CH" });
    const { router } = await open("/settings");
    // formatPercent: "40%" or "40 %", as the locale writes it.
    expect(await screen.findByText(/^40\s?% in CHF$/)).toBeTruthy();
    await openRubric("payouts");
    // No Mt Pelerin account chosen: none said.
    expect(within(screen.getByTestId("bank-row")).getByText("None")).toBeTruthy();
    expect(screen.getByTestId("split-summary")).toHaveAccessibleName(
      /^Split: 60\s?% in bitcoin, 40\s?% in CHF$/
    );
    await fireEvent.press(screen.getByTestId("split-row"));
    await waitFor(() => expect(router.getPathname()).toBe("/settings/split"));
    expect(await screen.findByText("How do you want to be paid?")).toBeTruthy();
    // With a fiat share: "Continue" leads to the bank account, Mt Pelerin's: its login first, then
    // its accounts (none here): the form, empty.
    await fireEvent.press(screen.getByTestId("split-continue"));
    await waitFor(() => expect(router.getPathname()).toBe("/settings/bank"));
    expect(await screen.findByTestId("mtpelerin-intro", {}, SLOW)).toBeTruthy();
    expect(screen.queryByTestId("bank-iban")).toBeNull();
    await logInToMtPelerin();
    expect((await screen.findByTestId("bank-iban", {}, SLOW)).props.value).toBe("");
    await typeBankAccount();
    // A changed digit: the checksum refuses it.
    await fireEvent.changeText(screen.getByTestId("bank-iban"), "CH93 0076 2011 6238 5295 8");
    await fireEvent(screen.getByTestId("bank-iban"), "blur");
    expect(await screen.findByText("Check the IBAN")).toBeTruthy();
    expect(screen.getByTestId("bank-submit")).toBeDisabled();
    await fireEvent.changeText(screen.getByTestId("bank-iban"), "CH93 0076 2011 6238 5295 7");
    await fireEvent.press(screen.getByTestId("bank-submit"));
    expect(await screen.findByText("Split saved", {}, SLOW)).toBeTruthy();
    expect(screen.getByText(/^IBAN checked · 40\s?% in /)).toBeTruthy();
    await waitFor(() => expect(router.getPathname()).toBe("/settings"));
    // Registered at Mt Pelerin; the settings keep its id, nothing of its details.
    const [registered] = mtpBankAccounts();
    expect(registered).toMatchObject({
      iban: IBAN,
      currency: "CHF",
      owner_companyname: "Fine Bakery LLC"
    });
    expect(getAccountSettings()?.payoutAccountId).toBe(registered?.id);
    expect(getAccountSettings()).not.toHaveProperty("bank");
    // Its IBAN in "Payouts", read from Mt Pelerin.
    await openRubric("payouts");
    expect(await screen.findByText("CH93 … 5295 7", {}, SLOW)).toBeTruthy();
  });

  it("opens the bank account from its row with the saved split, not one left unsaved", async () => {
    await ownerDevice({ bitcoinPercent: 60, payoutAccountId: "acc-1" });
    const { router } = await open("/settings");
    await openRubric("payouts");
    await fireEvent.press(screen.getByTestId("split-row"));
    const bar = await screen.findByTestId("split-slider");
    // All in bitcoin, then back without saving.
    await fireEvent(bar, "layout", {
      nativeEvent: { layout: { x: 0, y: 0, width: 200, height: 96 } }
    });
    await fireEvent(bar, "responderGrant", { nativeEvent: { pageX: 200, locationX: 200 } });
    await fireEvent(bar, "responderRelease", { nativeEvent: { pageX: 200, locationX: 200 } });
    await fireEvent.press(screen.getByLabelText("Back"));
    await waitFor(() => expect(router.getPathname()).toBe("/settings/payouts"));
    await fireEvent.press(screen.getByTestId("bank-row"));
    await waitFor(() => expect(router.getPathname()).toBe("/settings/bank"));
    // The saved split's share (40 % in CHF), before Mt Pelerin's login.
    expect(await screen.findByTestId("mtpelerin-intro", {}, SLOW)).toBeTruthy();
    expect(screen.getByText(/40\s?%/)).toBeTruthy();
    expect(getAccountSettings()).toMatchObject({ bitcoinPercent: 60, payoutAccountId: "acc-1" });
  });

  it("saves a split all in bitcoin at once, without the bank account", async () => {
    await ownerDevice({ bitcoinPercent: 60, payoutAccountId: "acc-1" });
    const { router } = await open("/settings/split");
    const bar = await screen.findByTestId("split-slider");
    // Dragged to the end, as signup-flow.test.tsx does: measured, touched, let go.
    await fireEvent(bar, "layout", {
      nativeEvent: { layout: { x: 0, y: 0, width: 200, height: 96 } }
    });
    await fireEvent(bar, "responderGrant", { nativeEvent: { pageX: 200, locationX: 200 } });
    await fireEvent(bar, "responderRelease", { nativeEvent: { pageX: 200, locationX: 200 } });
    await fireEvent.press(screen.getByTestId("split-continue"));
    expect(await screen.findByText("Split saved")).toBeTruthy();
    await waitFor(() => expect(router.getPathname()).toBe("/settings"));
    expect(getAccountSettings()).toMatchObject({ bitcoinPercent: 100, payoutAccountId: null });
    expect(await screen.findByLabelText("Payouts, All in bitcoin")).toBeTruthy();
  });

  it('asks before "Log out", then forgets everything and shows the welcome screen', async () => {
    await ownerDevice();
    // "Discreet" of the wallet screen, remembered on the device: forgotten too.
    await saveDiscreet(true);
    const { router } = await open("/settings");
    await fireEvent.press(await screen.findByTestId("logout"));
    expect(await screen.findByText("Log out of this device?")).toBeTruthy();
    // What it loses: this device's own choices, named; the rest is on the account.
    expect(
      screen.getByText(
        "Your data and your funds stay in your account: your passkey logs you back in. Only the choices made on this device go back to their defaults: the navigation bar, “Discreet” in the Wallet, “Currency shown first”, “Theme”, “Amount” or “Items” in the Point of Sale and biometrics to unlock the app."
      )
    ).toBeTruthy();
    // "Back": nothing happens.
    await fireEvent.press(screen.getByText("Back"));
    expect(getAccountSettings()).not.toBeNull();
    await fireEvent.press(screen.getByTestId("logout"));
    await fireEvent.press(await screen.findByTestId("logout-confirm"));
    await waitFor(() => expect(router.getPathname()).toBe("/"));
    expect(await screen.findByText("Create my account")).toBeTruthy();
    expect(getAccountSettings()).toBeNull();
    expect([...secureStore.items.keys()]).toEqual([]);
  });
  it("names on the web the device's choices \"Log out\" loses, without the app's lock", async () => {
    await ownerDevice();
    const web = jest.replaceProperty(Platform, "OS", "web");
    try {
      await open("/settings", webRoutes);
      await fireEvent.press(await screen.findByTestId("logout"));
      expect(
        await screen.findByText(
          "Your data and your funds stay in your account: your passkey logs you back in. Only the choices made on this device go back to their defaults: the navigation bar, “Discreet” in the Wallet, “Currency shown first”, “Theme” and “Amount” or “Items” in the Point of Sale."
        )
      ).toBeTruthy();
    } finally {
      web.restore();
    }
  });
});

describe("Settings of the owner, on a computer", () => {
  beforeEach(() => mockDesktop.mockReturnValue(true));

  it('shows "Log out" at the title\'s right on every tab, asked before, as on a phone', async () => {
    await ownerDevice();
    const { router } = await open("/settings");
    // Where the till's "Unlock" is: out of the tabs' panel, once, whatever the tab.
    for (const tab of [
      "business",
      "charging",
      "payouts",
      "network",
      "security",
      "help",
      "account"
    ]) {
      const panel = await openTab(tab);
      expect(screen.getAllByTestId("logout")).toHaveLength(1);
      expect(within(panel).queryByTestId("logout")).toBeNull();
    }
    await openTab("charging");
    await fireEvent.press(screen.getByTestId("logout"));
    expect(await screen.findByText("Log out of this device?")).toBeTruthy();
    await fireEvent.press(screen.getByText("Back"));
    expect(getAccountSettings()).not.toBeNull();
    await fireEvent.press(screen.getByTestId("logout"));
    await fireEvent.press(await screen.findByTestId("logout-confirm"));
    await waitFor(() => expect(router.getPathname()).toBe("/"));
    expect(getAccountSettings()).toBeNull();
  });

  it("saves the name when its field is left, and edits the relays in a dialog", async () => {
    await ownerDevice();
    await open("/settings");
    const field = await screen.findByTestId("business-name-field");
    await fireEvent.changeText(field, "Fine Bakery");
    await fireEvent(field, "blur");
    expect(await screen.findByText("Name saved")).toBeTruthy();
    expect(getAccountSettings()?.businessName).toBe("Fine Bakery");
    // The name as typed, its final period included: notifications drop only their own.
    await fireEvent.changeText(field, "Rose Bakery Ltd.");
    await fireEvent(field, "blur");
    await waitFor(() => expect(getAccountSettings()?.businessName).toBe("Rose Bakery Ltd."));
    expect(await screen.findByText("Name saved")).toBeTruthy();
    expect(screen.queryByText("Rose Bakery Ltd")).toBeNull();
    // A tab a rubric.
    for (const tab of [
      "business",
      "charging",
      "payouts",
      "network",
      "security",
      "help",
      "account"
    ]) {
      expect(screen.getByTestId(`settings-tab-${tab}`)).toBeTruthy();
    }
    expect(screen.getByTestId("settings-tab-business")).toBeSelected();
    // The version line and the legal links are the side bar's there.
    expect(screen.queryByTestId("settings-version")).toBeNull();
    expect(screen.queryByTestId("settings-legal")).toBeNull();
    // The saved relays, tested once shown: each read with its light.
    await openTab("network");
    expect(screen.getByTestId("settings-tab-network")).toBeSelected();
    await waitFor(() =>
      expect(screen.getAllByLabelText(/^wss:\/\/.+, Connected$/)).toHaveLength(5)
    );

    await fireEvent.press(screen.getByTestId("edit-relays"));
    expect(await screen.findByTestId("relays-dialog")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("add-relay"));
    await fireEvent.changeText(await screen.findByTestId("relay-address"), "relay.bakery.example");
    await fireEvent.press(screen.getByTestId("add-relay-confirm"));
    await fireEvent.press(screen.getByTestId("save-relays"));
    await waitFor(() => expect(getAccountSettings()?.relays).toEqual([...DEFAULT_RELAYS, OWN]));
    expect(await screen.findByText("Relays saved")).toBeTruthy();
  });

  // Five red relays, their notes and the field to add must not make the dialog taller than its 640
  // nor push its buttons below it; the field to add stays out of the list, "Add" on its frame.
  it("scrolls the relays' list inside their dialog, the field to add and the buttons out of it", async () => {
    const scrollToEnd = jest.spyOn(ScrollView.prototype, "scrollToEnd");
    scrollToEnd.mockClear();
    const scrolledList = () =>
      scrollToEnd.mock.instances.filter(
        (view) =>
          (view as unknown as { props: { testID?: string } }).props.testID ===
          "relays-dialog-scroll"
      ).length;
    await ownerDevice();
    await open("/settings");
    await openTab("network");
    await fireEvent.press(await screen.findByTestId("edit-relays"));
    const dialog = await screen.findByTestId("relays-dialog");
    // Jest has no layout: the shrink itself is Yoga's (and the browser's). The dialog keeps the
    // design's 640 and shrinks to the window; what scrolls shrinks within it.
    const dialogStyle = StyleSheet.flatten(dialog.props.style);
    expect(dialogStyle.maxHeight).toBe(640);
    expect(dialogStyle.flexShrink).toBe(1);
    const list = screen.getByTestId("relays-dialog-scroll");
    expect(StyleSheet.flatten(list.props.style)).toMatchObject({ flexGrow: 0, flexShrink: 1 });
    const inList = within(list);
    expect(inList.getByTestId("relay-rows")).toBeTruthy();
    expect(inList.queryByTestId("add-relay")).toBeNull();
    expect(within(dialog).getByTestId("add-relay")).toBeTruthy();

    await fireEvent.press(screen.getByTestId("add-relay"));
    for (const control of ["relay-address", "add-relay-confirm", "test-relays", "save-relays"]) {
      expect(inList.queryByTestId(control)).toBeNull();
      expect(within(dialog).getByTestId(control)).toBeTruthy();
    }
    expect(inList.queryByText("Cancel")).toBeNull();
    expect(within(dialog).getByText("Cancel")).toBeTruthy();
    // "Add" on the field's frame: both at the row's end, under the label (Jest has no
    // layout; a Button not full width otherwise aligns itself to the start).
    expect(StyleSheet.flatten(screen.getByTestId("relay-add-row").props.style)).toMatchObject({
      flexDirection: "row",
      alignItems: "flex-end"
    });
    expect(StyleSheet.flatten(screen.getByTestId("add-relay-confirm").props.style)).toMatchObject({
      alignSelf: "flex-end"
    });

    // A relay added goes last in the list: the list scrolls to it once its row is laid out, once.
    const field = () => screen.getByTestId("relay-address");
    await fireEvent.changeText(field(), "relay.bakery.example");
    await fireEvent.press(screen.getByTestId("add-relay-confirm"));
    expect(inList.getByText("wss://relay.bakery.example")).toBeTruthy();
    expect(scrolledList()).toBe(0);
    await fireEvent(list, "contentSizeChange", 512, 900);
    expect(scrolledList()).toBe(1);
    expect(scrollToEnd).toHaveBeenLastCalledWith({ animated: false });
    // Then a later change leaves the list where the owner scrolled it.
    await fireEvent(list, "contentSizeChange", 512, 960);
    expect(scrolledList()).toBe(1);
    // An address refused is not added: nothing to bring into sight.
    await fireEvent.changeText(field(), "relay.bakery.example");
    await fireEvent.press(screen.getByTestId("add-relay-confirm"));
    expect(field().props.value).toBe("relay.bakery.example");
    await fireEvent(list, "contentSizeChange", 512, 980);
    expect(scrolledList()).toBe(1);

    // The tenth relay: no room for another, the field gives way to the note, out of the list too.
    for (let index = DEFAULT_RELAYS.length + 1; index < 10; index++) {
      await fireEvent.changeText(field(), `relay-${index}.bakery.example`);
      await fireEvent.press(screen.getByTestId("add-relay-confirm"));
    }
    expect(screen.queryByTestId("relay-address")).toBeNull();
    const tooMany = "Ten relays at most: remove one to add another.";
    expect(inList.queryByText(tooMany)).toBeNull();
    expect(within(dialog).getByText(tooMany)).toBeTruthy();
  });

  it("saves the invoices' default VAT when its field is left", async () => {
    await ownerDevice({ detectedCountry: "CH" });
    await open("/settings");
    const field = await screen.findByTestId("vat-rate-field");
    expect(screen.getByText("Default VAT")).toBeTruthy();
    await fireEvent.changeText(field, "3.8");
    await fireEvent(field, "blur");
    expect(await screen.findByText("Default VAT saved")).toBeTruthy();
    expect(getAccountSettings()?.vatRate).toBe(380);
    // Not a rate: said, and the field shows the saved one again.
    await fireEvent.changeText(field, "abc");
    await fireEvent(field, "blur");
    expect(await screen.findByText("Enter a rate between 0 and 100%")).toBeTruthy();
    expect(getAccountSettings()?.vatRate).toBe(380);
    await waitFor(() => expect(screen.getByTestId("vat-rate-field").props.value).toBe("3.8"));
  });

  it("saves the tolerance of on-chain underpayments when its field is left", async () => {
    await ownerDevice();
    await open("/settings");
    await openTab("charging");
    const field = await screen.findByTestId("tolerance-field");
    expect(screen.getByText("Underpayment tolerance")).toBeTruthy();
    expect(field.props.value).toBe("");
    await fireEvent.changeText(field, "5");
    await fireEvent(field, "blur");
    expect(await screen.findByText("Tolerance saved")).toBeTruthy();
    expect(getAccountSettings()?.onchainTolerance).toBe(500);
    // Not one: said, and the field shows the saved one again.
    await fireEvent.changeText(field, "10.5");
    await fireEvent(field, "blur");
    expect(
      await screen.findByText("Enter a percentage between 0 and 10, to the tenth")
    ).toBeTruthy();
    expect(getAccountSettings()?.onchainTolerance).toBe(500);
    await waitFor(() => expect(screen.getByTestId("tolerance-field").props.value).toBe("5"));
  });

  it("warns in the relays' dialog when the account has an integration", async () => {
    await ownerDevice();
    await open("/settings");
    await openTab("network");
    await fireEvent.press(await screen.findByTestId("edit-relays"));
    expect(await screen.findByTestId("relays-dialog")).toBeTruthy();
    await act(async () => undefined);
    expect(screen.queryByTestId("relays-notice")).toBeNull();
    await fireEvent.press(screen.getByText("Cancel"));

    const team = deriveTeamKeys(walletSecret(testSeed()));
    await publishIntegration(team, {
      id: "0123456789abcdef0123456789abcdef",
      name: "Shop",
      createdAt: 1790000000,
      platform: "node"
    });
    // Read again at each opening.
    await fireEvent.press(screen.getByTestId("edit-relays"));
    expect(
      within(await screen.findByTestId("relays-dialog")).getByTestId("relays-notice")
    ).toBeTruthy();
  });

  // As the relays, in a dialog of "Network", never on a page whose header would be the point of
  // sale's.
  it('edits the Bitcoin node in a dialog of "Network", and leads a link to its page back', async () => {
    await ownerDevice();
    const { router } = await open("/settings/node");
    await waitFor(() => expect(router.getPathname()).toBe("/settings"));
    expect(screen.queryByTestId("settings-page-node")).toBeNull();

    await openTab("network");
    await fireEvent.press(screen.getByTestId("node-row"));
    const dialog = await screen.findByTestId("node-dialog");
    expect(router.getPathname()).toBe("/settings");
    expect(within(dialog).getByText("Bitcoin node")).toBeTruthy();
    // "Cancel": nothing saved, the dialog gone.
    await fireEvent.press(within(dialog).getByTestId("node-own"));
    await fireEvent.press(within(dialog).getByTestId("node-cancel"));
    await waitFor(() => expect(screen.queryByTestId("node-dialog")).toBeNull());
    expect(getAccountSettings()?.bitcoinNode).toBeNull();

    // Opened again: the draft starts from the saved node, mempool.space.
    await fireEvent.press(screen.getByTestId("node-row"));
    expect((await screen.findByTestId("node-mempool")).props.accessibilityState).toMatchObject({
      checked: true
    });
    expect(screen.queryByTestId("node-url")).toBeNull();
    await fireEvent.press(screen.getByTestId("node-own"));
    await fireEvent.changeText(await screen.findByTestId("node-url"), "https://node.example.ch");
    // On the dialog's white, its cards ringed, not raised (a raised card does not lift off white,
    // and the dialog's scroll clips its shadow): the choices as the card modes' dialog, the
    // payers' switch in a card ringed alike.
    const ringed = { borderColor: colors.border.subtle, boxShadow: "none" };
    expect(StyleSheet.flatten(screen.getByTestId("node-mempool").props.style)).toMatchObject(
      ringed
    );
    expect(StyleSheet.flatten(screen.getByTestId("node-own").props.style)).toMatchObject({
      borderColor: palette.orange,
      boxShadow: "none"
    });
    expect(StyleSheet.flatten(screen.getByTestId("node-payers-card").props.style)).toMatchObject(
      ringed
    );
    await fireEvent.press(screen.getByTestId("node-save"));
    expect(await screen.findByText("Bitcoin node saved")).toBeTruthy();
    await waitFor(() => expect(screen.queryByTestId("node-dialog")).toBeNull());
    expect(router.getPathname()).toBe("/settings");
    expect(getAccountSettings()?.bitcoinNode).toEqual({
      url: "https://node.example.ch",
      fallback: "mempool",
      payers: false
    });
    expect(screen.getByTestId("node-row")).toHaveTextContent("node.example.ch", { exact: false });
  });

  it("asks over the node's dialog before saving a node that does not answer", async () => {
    await ownerDevice();
    mempool.chain.down.add("https://192.168.1.20:3006/api");
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      await open("/settings");
      await openTab("network");
      await fireEvent.press(screen.getByTestId("node-row"));
      await fireEvent.press(await screen.findByTestId("node-own"));
      await fireEvent.changeText(
        await screen.findByTestId("node-url"),
        "https://192.168.1.20:3006"
      );
      await fireEvent.press(screen.getByTestId("node-save"));
      const confirm = await screen.findByTestId("node-confirm");
      expect(within(confirm).getByText("Save this node?")).toBeTruthy();
      // The dialog under it out of reach meanwhile (Sheet's `over`).
      expect(screen.queryByTestId("node-dialog")).toBeNull();
      expect(screen.getByTestId("node-dialog", { includeHiddenElements: true })).toBeTruthy();
      // Cancelled: back to the dialog, its test's outcome shown, nothing saved.
      await fireEvent.press(within(confirm).getByText("Cancel"));
      await waitFor(() => expect(screen.queryByTestId("node-confirm")).toBeNull());
      expect(screen.getByTestId("node-dialog")).toBeTruthy();
      expect(screen.getByText("Node unreachable")).toBeTruthy();
      expect(getAccountSettings()?.bitcoinNode).toBeNull();
      // Saved all the same: it may answer from the business's network.
      await fireEvent.press(screen.getByTestId("node-save"));
      await fireEvent.press(await screen.findByTestId("node-confirm-save"));
      expect(await screen.findByText("Bitcoin node saved")).toBeTruthy();
      await waitFor(() => expect(screen.queryByTestId("node-dialog")).toBeNull());
      expect(getAccountSettings()?.bitcoinNode).toEqual({
        url: "https://192.168.1.20:3006",
        fallback: "mempool",
        payers: false
      });
    } finally {
      warn.mockRestore();
    }
  });

  it("greys the name's field and the currency's with a loader while they are saved", async () => {
    await ownerDevice();
    await open("/settings");
    const field = await screen.findByTestId("business-name-field");

    let held = holdBackups();
    try {
      await fireEvent.changeText(field, "Fine Bakery");
      await fireEvent(field, "blur");
      expect(await screen.findByTestId("business-name-saving", HIDDEN)).toBeTruthy();
      expect(screen.getByTestId("business-name-field")).toBeDisabled();
      expect(screen.getByTestId("business-name-field")).toHaveDisplayValue("Fine Bakery");
      await held.release();
      expect(await screen.findByText("Name saved")).toBeTruthy();
      expect(screen.queryByTestId("business-name-saving", HIDDEN)).toBeNull();
      expect(screen.getByTestId("business-name-field")).not.toBeDisabled();
    } finally {
      held.restore();
    }

    held = holdBackups();
    try {
      await fireEvent.press(screen.getByTestId("display-currency"));
      await fireEvent.press(await screen.findByTestId("currency-EUR"));
      expect(await screen.findByTestId("display-currency-saving", HIDDEN)).toBeTruthy();
      expect(screen.getByTestId("display-currency")).toBeDisabled();
      await held.release();
      expect(await screen.findByText("Reference currency saved")).toBeTruthy();
      expect(screen.queryByTestId("display-currency-saving", HIDDEN)).toBeNull();
    } finally {
      held.restore();
    }

    // Cancelled: the field shows the name before, and the notification says why.
    for (const relay of DEFAULT_RELAYS) relays.readOnly.add(relay);
    await fireEvent.changeText(screen.getByTestId("business-name-field"), "Rose Bakery");
    await fireEvent(screen.getByTestId("business-name-field"), "blur");
    expect(await screen.findByText("Error while saving")).toBeTruthy();
    expect(screen.getByText(UNPUBLISHED_NOTIFICATION)).toBeTruthy();
    await waitFor(() =>
      expect(screen.getByTestId("business-name-field")).toHaveDisplayValue("Fine Bakery")
    );
  });

  it("changes the display currency without mounting the side bar again: its mark stays", async () => {
    await ownerDevice();
    await open("/settings");
    // Jest has no layout: the side bar's "Account" group and its "Settings" row.
    const at = async (testID: string, y: number) =>
      fireEvent(screen.getByTestId(testID), "layout", {
        nativeEvent: { layout: { x: 0, y, width: 216, height: 44 } }
      });
    await at("sidebar-group-account", 240);
    await at("sidebar-settings", 84);
    const mark = () => screen.queryByTestId("sidebar-mark", { includeHiddenElements: true });
    expect(mark()).toBeTruthy();

    await fireEvent.press(await screen.findByTestId("display-currency"));
    await fireEvent.press(await screen.findByTestId("currency-CAD"));
    await waitFor(() => expect(getAccountSettings()?.displayCurrency).toBe("CAD"));
    // This device's point of sale follows it.
    await waitFor(async () => expect((await getTerminalProfile())?.currency).toBe("CAD"));
    // In the field (the notification that says it is saved names it too).
    expect(
      await within(screen.getByTestId("display-currency")).findByText("CAD — Canadian dollars")
    ).toBeTruthy();
    // Mounted again (a new currency was a new app), the side bar lost its rows' places: its mark
    // slid back from the top of the list.
    expect(mark()).toBeTruthy();
  });

  it("says over the relays' dialog why they cannot change while a sale is open", async () => {
    await ownerDevice();
    const { member } = await inviteEmployee("Alice");
    const team = deriveTeamKeys(walletSecret(testSeed()));
    const keys = deriveMemberKeys(memberSecret(team, member.id));
    const now = Math.floor(Date.now() / 1000);
    await publishMemberRecord(
      keys,
      saleEvent(keys, {
        version: 1,
        paymentHash: "ef".repeat(32),
        sats: "46918",
        fiat: { minor: 2450, digits: 2, currency: "CHF" },
        note: "",
        verifyUrl: `https://breez.tips/lnurlpay/verify/${"ef".repeat(32)}`,
        createdAt: now - 60,
        expiresAt: now + 540,
        paidAt: null,
        onchainAddress: null,
        onchainTag: null,
        sale: "e1".repeat(32)
      })
    );
    await open("/settings");
    await openTab("network");
    await fireEvent.press(await screen.findByTestId("edit-relays"));
    await fireEvent.press(await screen.findByTestId("add-relay"));
    await fireEvent.changeText(await screen.findByTestId("relay-address"), "relay.bakery.example");
    await fireEvent.press(screen.getByTestId("add-relay-confirm"));
    await fireEvent.press(screen.getByTestId("save-relays"));
    expect(
      await screen.findByText(
        "Some of the business's invoices are not final yet. Try again once their final version is published (up to 3 hours after the end of an unpaid invoice)"
      )
    ).toBeTruthy();
    expect(getAccountSettings()?.relays).toEqual(DEFAULT_RELAYS);
    // The dialog stays, its draft kept, to save again later.
    expect(screen.getByTestId("relays-dialog")).toBeTruthy();
  });
});

describe("Settings of an employee", () => {
  it("shows the business and the relays read only, the employee's photo, then leaves", async () => {
    await ownerDevice();
    const business = getAccountSettings()!.businessName;
    // A tolerance of on-chain underpayments: the device holds it, never shows it.
    await changeOnchainTolerance(500);
    const { url } = await inviteEmployee("Alice");
    closeAccount();
    fileSystem.resetFileSystem();
    secureStore.resetSecureStore();
    resetTerminalProfileCache();
    resetMembershipCache();
    resetDeviceRelays();
    await joinTeam(await previewInvite(inviteLinkOf(url)!));

    const { router } = await open("/pos");
    // Never "What's new" by itself on an employee's device: a merchant's only.
    expect(screen.queryByTestId("whats-new-next")).toBeNull();
    // The employee's dock: the point of sale, its activity and its settings.
    await fireEvent.press(await screen.findByLabelText("Settings"));
    expect(await screen.findByTestId("business-name")).toHaveTextContent(business);
    expect(screen.getByTestId("settings-card-profile")).toHaveTextContent("Alice", {
      exact: false
    });
    expect(screen.getByTestId("settings-card-network")).toHaveTextContent("5 relays", {
      exact: false
    });
    expect(screen.getByTestId("settings-card-help")).toBeTruthy();
    expect(screen.queryByText(/Tolerance/)).toBeNull();
    // The version line under "Leave the business", the terms and the privacy policy above it.
    // The staging build, then "What's new": its notes never opened on this device.
    expect(versionParts(screen.getByTestId("settings-version"))).toEqual([
      "f82ecab",
      "staging",
      "What's new"
    ]);
    expect(screen.getByTestId("settings-legal-privacy")).toHaveTextContent("Privacy policy");
    expect(screen.getByTestId("settings-legal-terms")).toBeTruthy();

    // "Network": the business's relays, read only: nothing to remove.
    await openRubric("network");
    expect(screen.getByText("Set by your employer")).toBeTruthy();
    expect(screen.getByText(DEFAULT_RELAYS[0]!)).toBeTruthy();
    expect(screen.queryByTestId("remove-relay-0")).toBeNull();
    await backToCards("profile");

    // "Your profile": the name its employer set, the photo it changes.
    await openRubric("profile");
    expect(screen.getByTestId("member-name")).toHaveTextContent("Alice");
    expect(screen.getByText("Name set by your employer")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("pick-photo"));
    expect(await screen.findByText("Photo saved")).toBeTruthy();
    expect(screen.getByText("Change the photo")).toBeTruthy();
    expect(screen.getByTestId("remove-photo")).toBeTruthy();
    await backToCards("profile");

    await fireEvent.press(screen.getByTestId("leave-business"));
    expect(await screen.findByText(`Leave ${business}?`)).toBeTruthy();
    await fireEvent.press(await screen.findByTestId("leave-confirm"));
    await waitFor(() => expect(router.getPathname()).toBe("/"));
  });
  it("says the business could not be told, and stays, when no relay takes the departure", async () => {
    await ownerDevice();
    const { url } = await inviteEmployee("Alice");
    closeAccount();
    fileSystem.resetFileSystem();
    secureStore.resetSecureStore();
    resetTerminalProfileCache();
    resetMembershipCache();
    resetDeviceRelays();
    await joinTeam(await previewInvite(inviteLinkOf(url)!));
    const { router } = await open("/settings");
    expect(await screen.findByTestId("settings-card-profile")).toHaveTextContent("Alice", {
      exact: false
    });

    for (const relay of DEFAULT_RELAYS) relays.unreachable.add(relay);
    await fireEvent.press(screen.getByTestId("leave-business"));
    await fireEvent.press(await screen.findByTestId("leave-confirm"));
    expect(
      await screen.findByText(
        "The business could not be told that you are leaving. Check your internet connection, then try again"
      )
    ).toBeTruthy();
    expect(router.getPathname()).toBe("/settings");
    await expect(loadMembership()).resolves.not.toBeNull();
    // The button can be pressed again.
    expect(screen.getByTestId("leave-business")).not.toBeDisabled();
  });

  it("shows the loader on the photo only while it is sent, not while the channel syncs", async () => {
    await ownerDevice();
    const { url } = await inviteEmployee("Alice");
    closeAccount();
    fileSystem.resetFileSystem();
    secureStore.resetSecureStore();
    resetTerminalProfileCache();
    resetMembershipCache();
    resetDeviceRelays();
    await joinTeam(await previewInvite(inviteLinkOf(url)!));
    await open("/settings/profile");
    expect(await screen.findByTestId("member-name")).toHaveTextContent("Alice");

    // A sync (every 5 minutes) is held while it writes the branding.
    let release = () => undefined as void;
    const held = new Promise<void>((resolve) => (release = resolve));
    let holding = true;
    const read = secureStore.getItemAsync.getMockImplementation()!;
    secureStore.getItemAsync.mockImplementation(async (key, options) => {
      if (key !== BRANDING_RECORD_KEY || !holding) return read(key, options);
      holding = false;
      const value = await read(key, options);
      await held;
      return value;
    });
    try {
      let sync!: Promise<unknown>;
      await act(async () => {
        sync = syncMembership();
      });
      // Nothing shows it: the photo can be changed.
      expect(screen.queryByTestId("avatar-busy")).toBeNull();
      expect(screen.getByTestId("pick-photo")).not.toBeDisabled();
      expect(screen.getByTestId("member-photo")).not.toBeDisabled();
      // The photo picked is sent once the sync wrote the branding: its loader meanwhile.
      await fireEvent.press(screen.getByTestId("pick-photo"));
      expect(mockPick).toHaveBeenCalledTimes(1);
      expect(await screen.findByTestId("avatar-busy")).toBeTruthy();
      expect(screen.getByTestId("pick-photo")).toBeDisabled();
      await act(async () => {
        release();
        await sync;
      });
      await waitFor(() => expect(screen.queryByTestId("avatar-busy")).toBeNull());
      expect(await screen.findByText("Change the photo")).toBeTruthy();
      // Kept: the sync's write did not put the branding back without it.
      const membership = await loadMembership();
      await expect(loadBrandingOf(membership!.team)).resolves.toMatchObject({
        avatar: expect.objectContaining({ key: expect.any(String) })
      });
    } finally {
      secureStore.getItemAsync.mockImplementation(read);
    }
  });
});

describe("Settings by tabs on a computer, cards on a phone", () => {
  /** An employee's device, joined to the owner's team as Alice: the business's name. */
  async function employeeDevice(): Promise<string> {
    await ownerDevice();
    const business = getAccountSettings()!.businessName;
    const { url } = await inviteEmployee("Alice");
    closeAccount();
    fileSystem.resetFileSystem();
    secureStore.resetSecureStore();
    resetTerminalProfileCache();
    resetMembershipCache();
    resetDeviceRelays();
    await joinTeam(await previewInvite(inviteLinkOf(url)!));
    return business;
  }

  it("shows each of the owner's rubrics in its tab: the split, the security, the account", async () => {
    mockDesktop.mockReturnValue(true);
    await ownerDevice({ bitcoinPercent: 60, payoutAccountId: "acc-1" });
    const { router } = await open("/settings");
    // "Business" first.
    expect(await screen.findByTestId("business-name-field")).toBeTruthy();
    expect(screen.queryByTestId("onchain-switch")).toBeNull();

    await openTab("payouts");
    expect(screen.getByTestId("split-summary")).toHaveAccessibleName(
      /^Split: 60\s?% in bitcoin, 40\s?% in CHF$/
    );
    // Its account's IBAN is Mt Pelerin's, not connected here: where it is, never a former IBAN.
    expect(within(screen.getByTestId("bank-row")).getByText("At Mt Pelerin")).toBeTruthy();
    expect(screen.queryByTestId("business-name-field")).toBeNull();

    await openTab("security");
    expect(screen.getByTestId("recovery-open")).toBeTruthy();

    const account = await openTab("account");
    expect(within(account).getByTestId("delete-account")).toBeTruthy();
    // "Log out" is at the title's right, not in the tab.
    expect(within(account).queryByTestId("logout")).toBeNull();
    expect(screen.getByTestId("logout")).toBeTruthy();

    await openTab("charging");
    expect(screen.getByTestId("lightning-row")).toHaveTextContent(
      /Lightning\s*Always offered, up to your Lightning address's ceiling; above it, only the on-chain address is shown$/
    );
    await fireEvent.press(screen.getByTestId("onchain-switch"));
    expect(await screen.findByText("On-chain payments saved")).toBeTruthy();
    expect(router.getPathname()).toBe("/settings");
  });

  it("leads a card holder's link to a merchant's rubric back to \"Settings\"", async () => {
    await cardHolderDevice();
    const { router } = await open("/settings/business");
    await waitFor(() => expect(router.getPathname()).toBe("/settings"));
    expect(await screen.findByTestId("settings-card-display")).toBeTruthy();
    expect(screen.queryByTestId("business-name-field")).toBeNull();
  });

  it('shows an employee\'s rubrics in tabs on a computer, and leaves from "Account"', async () => {
    mockDesktop.mockReturnValue(true);
    const business = await employeeDevice();
    const { router } = await open("/settings");
    expect(await screen.findByTestId("member-name")).toHaveTextContent("Alice");
    expect(screen.getByTestId("settings-tab-profile")).toBeSelected();
    expect(screen.getByTestId("business-name")).toHaveTextContent(business);
    // Nothing of the owner's rubrics.
    for (const tab of ["business", "charging", "payouts", "security"]) {
      expect(screen.queryByTestId(`settings-tab-${tab}`)).toBeNull();
    }

    await openTab("network");
    expect(screen.getByText("Set by your employer")).toBeTruthy();
    expect(screen.queryByTestId("edit-relays")).toBeNull();

    await openTab("account");
    await fireEvent.press(screen.getByTestId("leave-business"));
    await fireEvent.press(await screen.findByTestId("leave-confirm"));
    await waitFor(() => expect(router.getPathname()).toBe("/"));
  });

  it("leads an employee's link to the owner's rubric back to \"Settings\"", async () => {
    await employeeDevice();
    const { router } = await open("/settings/charging");
    await waitFor(() => expect(router.getPathname()).toBe("/settings"));
    expect(await screen.findByTestId("settings-card-profile")).toBeTruthy();
  });
});

describe("Settings > Payments: Lightning's ceiling", () => {
  /** breez.tips accepts 1 BTC at most per invoice (jest/breez-tips.ts: 100 000 000 000 msat). */
  beforeEach(() => {
    serveBreezTips();
    lightningAddresses.set("sattleme02c6047f94", "Fine Bakery");
  });

  afterEach(() => {
    lightningAddresses.delete("sattleme02c6047f94");
  });

  it("says the most an invoice takes, read from the Lightning address, with its value now", async () => {
    await ownerDevice();
    await open("/settings");
    await openRubric("charging");

    expect(
      await screen.findByText(
        "Always offered, up to 1 BTC (about 50'000.00 CHF) per invoice; above it, only the on-chain address is shown"
      )
    ).toBeTruthy();
    // On-chain payments off: above it, the sale is refused, and the row says so.
    await fireEvent.press(screen.getByTestId("onchain-switch"));
    expect(await screen.findByText("On-chain payments saved")).toBeTruthy();
    expect(
      screen.getByText(
        "Always offered, up to 1 BTC (about 50'000.00 CHF) per invoice; above it, the point of sale refuses the sale while on-chain payments are turned off"
      )
    ).toBeTruthy();
  });

  it("asks the Lightning address nothing more when shown again", async () => {
    await ownerDevice();
    await open("/settings");
    await openRubric("charging");
    expect(await screen.findByText(/^Always offered, up to 1 BTC/)).toBeTruthy();
    // Its parameters, as the point of sale reads them once per session (the account's opening
    // reads the address's description on its own, address-description.ts).
    const reads = () =>
      breezTips.requests.filter((url) => url.includes("/.well-known/lnurlp/")).length;
    const before = reads();
    await backToCards("charging");
    await openRubric("charging");
    expect(await screen.findByText(/^Always offered, up to 1 BTC/)).toBeTruthy();

    expect(reads()).toBe(before);
  });

  it("gives no value in the currency without a point for the present", async () => {
    mockRate = undefined;
    await ownerDevice();
    await open("/settings");
    await openRubric("charging");

    expect(
      await screen.findByText(
        "Always offered, up to 1 BTC per invoice; above it, only the on-chain address is shown"
      )
    ).toBeTruthy();
  });

  it("says the ceiling without a figure while the Lightning address cannot be read", async () => {
    breezTips.unreachable = true;
    await ownerDevice();
    await open("/settings");
    await openRubric("charging");

    expect(
      await screen.findByText(
        "Always offered, up to your Lightning address's ceiling; above it, only the on-chain address is shown"
      )
    ).toBeTruthy();
    expect(screen.queryByText(/BTC/)).toBeNull();
  });
});

describe("Settings of the owner, while the account syncs", () => {
  it("shows the loader on the logo only while it is sent", async () => {
    await ownerDevice();
    closeAccount();
    // The account opens again from the device's copy; the relays' answer is held.
    let release = () => undefined as void;
    const held = new Promise<void>((resolve) => (release = resolve));
    const queryEvents = relays.queryEvents;
    const slow = jest.spyOn(relays, "queryEvents").mockImplementation(async (...args) => {
      await held;
      return queryEvents(...args);
    });
    try {
      await openAccount({
        seed: testSeed(),
        walletId: TEST_WALLET_ID,
        created: false,
        detect: async () => ({ payoutCurrency: "CHF", detectedCountry: "CH" }),
        businessNameWord: "Merchant"
      });
      await open("/settings/business");
      expect(await screen.findByTestId("business-logo")).not.toBeDisabled();
      expect(screen.queryByTestId("avatar-busy")).toBeNull();
      // The logo picked is saved once the account synced: its loader meanwhile.
      await fireEvent.press(screen.getByTestId("business-logo"));
      expect(mockPick).toHaveBeenCalledTimes(1);
      expect(await screen.findByTestId("avatar-busy")).toBeTruthy();
      expect(screen.getByTestId("business-logo")).toBeDisabled();
      await act(async () => {
        release();
        await whenAccountSynced();
      });
      await waitFor(() => expect(screen.queryByTestId("avatar-busy")).toBeNull());
      expect(getAccountSettings()?.logo).toEqual(
        expect.objectContaining({ key: expect.any(String) })
      );
    } finally {
      slow.mockRestore();
      release();
    }
  });
});

describe("Advanced settings before the sign-in", () => {
  it("chooses the relays the device looks for its account on", async () => {
    const { router } = await open("/");
    await fireEvent.press(await screen.findByTestId("advanced-settings"));
    await waitFor(() => expect(router.getPathname()).toBe("/advanced"));
    // Only its own relay: the others go, the last one stays.
    await fireEvent.press(screen.getByTestId("add-relay"));
    await fireEvent.changeText(await screen.findByTestId("relay-address"), "relay.bakery.example");
    await fireEvent.press(screen.getByTestId("add-relay-confirm"));
    for (let i = 0; i < DEFAULT_RELAYS.length; i++) {
      await fireEvent.press(screen.getByTestId("remove-relay-0"));
    }
    expect(screen.getByText(OWN)).toBeTruthy();
    await act(async () => {
      await fireEvent.press(screen.getByTestId("save-relays"));
    });
    await waitFor(() => expect(currentRelays()).toEqual([OWN]));
    await waitFor(() => expect(router.getPathname()).toBe("/"));
  });

  it("lets the device keep country.is out of the sign-up, saved as it is switched", async () => {
    await open("/advanced");
    const toggle = await screen.findByTestId("country-detection-switch");
    // On by default, as before the choice existed.
    await waitFor(() =>
      expect(screen.getByTestId("country-detection-switch").props.accessibilityState).toMatchObject(
        { checked: true }
      )
    );
    expect(screen.getByText("Detect my country with country.is")).toBeTruthy();
    await fireEvent.press(toggle);
    await waitFor(() =>
      expect(secureStore.items.get(COUNTRY_DETECTION_KEY)).toBe('{"version":1,"detect":false}')
    );
    // The relays are still saved by their own button: nothing else changed.
    expect(currentRelays()).toEqual(DEFAULT_RELAYS);
  });

  it("puts the relays' buttons right under their list, before the other settings", async () => {
    await open("/advanced");
    await screen.findByTestId("country-detection-row");
    // In the screen's order: "Test the connection" and "Save" belong to the relays, not to
    // "Sign-up" nor "Recovery".
    const tree = JSON.stringify(screen.toJSON());
    const at = (testID: string) => {
      const index = tree.indexOf(`"testID":"${testID}"`);
      expect(index).toBeGreaterThanOrEqual(0);
      return index;
    };
    expect(at("add-relay")).toBeLessThan(at("test-relays"));
    expect(at("test-relays")).toBeLessThan(at("save-relays"));
    expect(at("save-relays")).toBeLessThan(at("country-detection-row"));
  });

  it("are not offered to a device that takes payments: its list is its account's", async () => {
    await ownerDevice();
    closeAccount();
    const { router } = await open("/advanced");
    await waitFor(() => expect(router.getPathname()).toBe("/pos"));
    expect(screen.queryByTestId("advanced-relays")).toBeNull();
    expect(currentRelays()).toEqual(DEFAULT_RELAYS);
  });
});

describe("Contact support", () => {
  const SUPPORT = "support@sattle.me";
  const CACHE = "file:///data/user/0/ch.swissbitcoinpay.checkout.staging/cache";
  const COPY = `${CACHE}/app-log/sattle-me-journal.json`;

  /** The journal's copy a mail attached, read as support reads it. */
  function attachedReport(index = 0) {
    const text = mailComposer.mail.composed[index]?.attached[0];
    if (text === undefined) throw new Error("Nothing attached");
    return { text, report: JSON.parse(text) as Record<string, unknown> };
  }

  beforeEach(() => {
    mockCopy.mockClear();
  });

  it("writes to support from the owner's settings, the app's journal attached", async () => {
    await ownerDevice();
    logFailure("Syncing the team's channels failed", new TypeError("Network request failed"));
    await open("/settings/help");
    expect(await screen.findByText("Help")).toBeTruthy();
    expect(screen.getByTestId("support-attach")).toBeChecked();

    await fireEvent.press(screen.getByTestId("support-contact"));
    await waitFor(() => expect(mailComposer.mail.composed).toHaveLength(1));
    const mail = mailComposer.mail.composed[0]!;
    expect(mail.recipients).toEqual([SUPPORT]);
    expect(mail.subject).toBe("sattle.me support");
    expect(mail.body).toBe(
      "Hello,\n\nYour question or problem:\n\n\n\n--\n" +
        "sattle.me v3.0.0 · f82ecab · staging\nios"
    );
    expect(mail.attachments).toEqual([COPY]);
    const { text, report } = attachedReport();
    expect(report).toMatchObject({
      report: "sattleme-app-log",
      version: 1,
      app: { variant: "staging", version: "3.0.0", buildNumber: "3000000", commit: "f82ecab" },
      device: { os: "ios" },
      leftOut: []
    });
    expect(report.entries).toContainEqual(
      expect.objectContaining({
        level: "warning",
        event: "Syncing the team's channels failed",
        error: { kind: "TypeError", code: null, message: "Network request failed", cause: null }
      })
    );
    // Nothing of the account's.
    const settings = getAccountSettings()!;
    for (const value of [settings.businessName, TEST_WALLET_ID, "sattleme02c6047f94@breez.tips"]) {
      expect([value, text.includes(value)]).toEqual([value, false]);
    }
    // Noted for the next mail: support reads that one was written.
    await waitFor(() =>
      expect(readLog().entries.map(({ event }) => event)).toContain("Mail to support opened")
    );
  });

  it('attaches nothing once "Attach the app\'s log" is off', async () => {
    await ownerDevice();
    await open("/settings/help");
    await fireEvent.press(await screen.findByTestId("support-attach"));
    expect(screen.getByTestId("support-attach")).not.toBeChecked();
    await fireEvent.press(screen.getByTestId("support-contact"));
    await waitFor(() => expect(mailComposer.mail.composed).toHaveLength(1));
    expect(mailComposer.mail.composed[0]!.attachments).toEqual([]);
    expect(fileSystem.files.has(COPY)).toBe(false);
  });

  // Cut short, its caption would hide what the journal leaves out.
  it('shows "Attach the app\'s log" and its caption whole, on several lines', async () => {
    await ownerDevice();
    await open("/settings/help");
    const row = within(await screen.findByTestId("support-attach-row"));
    for (const text of ["Attach the app's log", "Technical events, no amounts or addresses"]) {
      expect([text, row.getByText(text).props.numberOfLines]).toEqual([text, undefined]);
    }
  });

  it("opens one mail form for two taps in a row", async () => {
    await ownerDevice();
    await open("/settings/help");
    const contact = await screen.findByTestId("support-contact");
    await act(async () => {
      fireEvent.press(contact);
      fireEvent.press(contact);
    });
    await waitFor(() => expect(mailComposer.mail.composed).toHaveLength(1));
    // Ready again once it opened.
    await fireEvent.press(screen.getByTestId("support-contact"));
    await waitFor(() => expect(mailComposer.mail.composed).toHaveLength(2));
  });

  it("opens the mail without the journal when its copy cannot be written, and says so", async () => {
    await ownerDevice();
    await open("/settings/help");
    const contact = await screen.findByTestId("support-contact");
    // A full disk: the copy's file cannot be written.
    const write = jest.spyOn(fileSystem.File.prototype, "writeSync").mockImplementation(function (
      this: { uri: string },
      content: string | Uint8Array
    ) {
      if (this.uri === COPY) throw new Error("No space left on device");
      if (typeof content === "string") fileSystem.files.set(this.uri, content);
      else fileSystem.binaries.set(this.uri, content);
    });
    try {
      await fireEvent.press(contact);
      expect(await screen.findByText("Log not attached to the mail")).toBeTruthy();
    } finally {
      write.mockRestore();
    }
    expect(mailComposer.mail.composed).toHaveLength(1);
    expect(mailComposer.mail.composed[0]!.attachments).toEqual([]);
    expect(readLog().entries.map(({ event }) => event)).toContain(
      "Writing the journal's copy failed"
    );
  });

  it("without a mail form, copies the address, says so and shares the journal", async () => {
    mailComposer.mail.available = false;
    await ownerDevice();
    await open("/settings/help");
    await fireEvent.press(await screen.findByTestId("support-contact"));
    expect(await screen.findByText("No Mail app on this device")).toBeTruthy();
    expect(screen.getByText(`Support address copied: ${SUPPORT}`)).toBeTruthy();
    expect(mockCopy).toHaveBeenCalledWith(SUPPORT);
    expect(mailComposer.mail.composed).toEqual([]);
    // The share sheet, where the holder picks the app that sends it.
    await waitFor(() => expect(sharing.shared).toHaveLength(1));
    expect(sharing.shared[0]).toEqual({
      url: COPY,
      options: { mimeType: "application/json", UTI: "public.json", dialogTitle: "App log" }
    });
    expect(JSON.parse(fileSystem.files.get(COPY)!)).toMatchObject({ report: "sattleme-app-log" });
  });

  it("without a mail form nor the journal: the address only, nothing shared", async () => {
    mailComposer.mail.available = false;
    mockCopy.mockResolvedValueOnce(false);
    await ownerDevice();
    await open("/settings/help");
    await fireEvent.press(await screen.findByTestId("support-attach"));
    await fireEvent.press(screen.getByTestId("support-contact"));
    expect(await screen.findByText(`Write to us at ${SUPPORT}`)).toBeTruthy();
    expect(sharing.shared).toEqual([]);
  });

  it("without a mail form, gives the address when copying it fails, and notes it", async () => {
    mailComposer.mail.available = false;
    mockCopy.mockRejectedValueOnce(new Error("Clipboard unavailable"));
    await ownerDevice();
    await open("/settings/help");
    await fireEvent.press(await screen.findByTestId("support-contact"));
    expect(await screen.findByText(`Write to us at ${SUPPORT}`)).toBeTruthy();
    expect(screen.queryByText(`Support address copied: ${SUPPORT}`)).toBeNull();
    expect(readLog().entries.map(({ event }) => event)).toContain(
      "Copying the support's address failed"
    );
  });

  it("offers no address to write to by hand: the button, which joins the journal", async () => {
    await ownerDevice();
    await open("/settings/help");
    expect(await screen.findByTestId("support-contact")).toBeTruthy();
    expect(screen.queryByTestId("support-address")).toBeNull();
    expect(screen.queryByText(SUPPORT)).toBeNull();
  });

  it("says so when the share sheet fails, and notes it", async () => {
    mailComposer.mail.available = false;
    const share = jest
      .spyOn(sharing, "shareAsync")
      .mockRejectedValueOnce(new Error("Another share is in progress"));
    await ownerDevice();
    await open("/settings/help");
    await fireEvent.press(await screen.findByTestId("support-contact"));
    expect(await screen.findByText("Log not shared")).toBeTruthy();
    expect(screen.getByText(`Support address copied: ${SUPPORT}`)).toBeTruthy();
    expect(readLog().entries.map(({ event }) => event)).toContain("Sharing the journal failed");
    share.mockRestore();
  });

  it("on the web, says where to write and to attach the journal it downloaded", async () => {
    await ownerDevice();
    await open("/settings/help");
    const contact = await screen.findByTestId("support-contact");
    // The web's mail (mail.web.ts) has its own tests: here, what the settings say once it opened.
    const web = jest.replaceProperty(Platform, "OS", "web");
    try {
      await fireEvent.press(contact);
      expect(await screen.findByText(`Write to us at ${SUPPORT}`)).toBeTruthy();
      expect(screen.getByText("Attach the downloaded log (sattle-me-journal.json)")).toBeTruthy();
      expect(mailComposer.mail.composed[0]!.body).toContain(
        "The app's log has just been downloaded (sattle-me-journal.json): please attach it to this message.\n\n--\n"
      );
    } finally {
      web.restore();
    }
  });

  it("says so when the mail form fails, and notes it", async () => {
    const compose = jest
      .spyOn(mailComposer, "composeAsync")
      .mockRejectedValueOnce(new Error("Another email composing operation is in progress"));
    await ownerDevice();
    await open("/settings/help");
    await fireEvent.press(await screen.findByTestId("support-contact"));
    expect(await screen.findByText("Mail not opened")).toBeTruthy();
    expect(screen.getByText(`Write to us at ${SUPPORT}`)).toBeTruthy();
    expect(readLog().entries.at(-1)).toMatchObject({
      event: "Opening the mail to support failed",
      error: { message: "Another email composing operation is in progress" }
    });
    // Ready again.
    expect(screen.getByTestId("support-contact")).not.toBeDisabled();
    compose.mockRestore();
  });

  it('is a section of the owner\'s settings on desktop, before "Account"', async () => {
    mockDesktop.mockReturnValue(true);
    await ownerDevice();
    await open("/settings");
    await openTab("help");
    expect(await screen.findByText("Support")).toBeTruthy();
    expect(screen.getByTestId("support-attach")).toBeChecked();
    await fireEvent.press(screen.getByTestId("support-contact"));
    await waitFor(() => expect(mailComposer.mail.composed).toHaveLength(1));
    expect(mailComposer.mail.composed[0]!.attachments).toEqual([COPY]);
  });

  it("is in an employee's settings too", async () => {
    await ownerDevice();
    const { url } = await inviteEmployee("Alice");
    closeAccount();
    fileSystem.resetFileSystem();
    secureStore.resetSecureStore();
    resetTerminalProfileCache();
    resetMembershipCache();
    resetDeviceRelays();
    await joinTeam(await previewInvite(inviteLinkOf(url)!));
    const { router } = await open("/settings");
    await openRubric("help");
    expect(router.getPathname()).toBe("/settings/help");
    await fireEvent.press(screen.getByTestId("support-contact"));
    await waitFor(() => expect(mailComposer.mail.composed).toHaveLength(1));
    const { text } = attachedReport();
    // Nothing of the business either.
    expect(text.includes("Alice")).toBe(false);
  });
});

describe("Contact support, the journal deposited", () => {
  const SUPPORT = "support@sattle.me";
  const CACHE = "file:///data/user/0/ch.swissbitcoinpay.checkout.staging/cache";
  const COPY = `${CACHE}/app-log/sattle-me-journal.json`;
  const SUPPORT_SECRET = new Uint8Array(32).fill(0x11);
  const DEPOSITED = "The app's log is sent encrypted to support, with the reference below.";

  beforeEach(() => {
    mockCopy.mockClear();
    mockJournalKey = bytesToHex(schnorr.getPublicKey(SUPPORT_SECRET));
  });

  /** The reference of the journal a mail names: its last line. */
  function referenceOf(body: string | undefined): string {
    const match = /\nLogs: ([0-9a-f]{64})$/.exec(body ?? "");
    if (!match) throw new Error("No journal named");
    return match[1]!;
  }

  /**
   * The journal a mail names, read with support's key on the build's default relays, as support
   * reads it (the mail names the build, not the relays).
   */
  function depositedJournal(body: string | undefined): Record<string, unknown> {
    const reference = referenceOf(body);
    const encryptionKey = conversationKey(SUPPORT_SECRET, reference);
    const parts = new Map<number, JournalPart>();
    for (const relay of DEFAULT_RELAYS) {
      for (const event of relays.stored.get(relay) ?? []) {
        const opened = openRecord(event, {
          type: JOURNAL_RECORD_TYPE,
          encryptionKey,
          author: reference,
          address: (tag) => [0, 1, 2, 3].some((i) => tag === journalPartAddress(reference, i)),
          parse: (value) => value as JournalPart
        });
        if (opened?.status === "ok") parts.set(opened.value.part, opened.value);
      }
    }
    const ordered = [...parts.values()].sort((a, b) => a.part - b.part);
    expect(ordered.length).toBe(ordered[0]?.parts);
    const bytes = concatBytes(...ordered.map(({ data }) => base64ToBytes(data)!));
    return JSON.parse(new TextDecoder().decode(inflate(bytes, 4_000_000))) as Record<
      string,
      unknown
    >;
  }

  it("deposits the journal before the mail opens, and the mail gives its reference", async () => {
    await ownerDevice();
    logFailure("Syncing the team's channels failed", new TypeError("Network request failed"));
    await open("/settings/help");
    const release = relays.holdPublishes();
    await fireEvent.press(await screen.findByTestId("support-contact"));
    // On its way: no mail yet, the button busy.
    await act(async () => undefined);
    expect(mailComposer.mail.composed).toEqual([]);
    release();
    await waitFor(() => expect(mailComposer.mail.composed).toHaveLength(1));
    const mail = mailComposer.mail.composed[0]!;
    expect(mail.recipients).toEqual([SUPPORT]);
    // Nothing attached, nothing written to the cache: the mail's provider never holds it.
    expect(mail.attachments).toEqual([]);
    expect(fileSystem.files.has(COPY)).toBe(false);
    const reference = referenceOf(mail.body);
    expect(mail.body).toBe(
      "Hello,\n\nYour question or problem:\n\n\n\n" +
        `${DEPOSITED}\n\n--\nsattle.me v3.0.0 · f82ecab · staging\nios\n` +
        `Logs: ${reference}`
    );
    const journal = depositedJournal(mail.body);
    expect(journal).toMatchObject({
      report: "sattleme-app-log",
      version: 1,
      device: { os: "ios" }
    });
    expect(journal.entries).toContainEqual(
      expect.objectContaining({ event: "Syncing the team's channels failed" })
    );
    await waitFor(() =>
      expect(readLog().entries.map(({ event }) => event)).toContain("Mail to support opened")
    );
  });

  it("deposits on the build's default relays when the device has relays of its own", async () => {
    await ownerDevice();
    await open("/settings/help");
    const own = ["wss://relay.business.example"];
    setCurrentRelays(own);
    try {
      await fireEvent.press(await screen.findByTestId("support-contact"));
      await waitFor(() => expect(mailComposer.mail.composed).toHaveLength(1));
      const mail = mailComposer.mail.composed[0]!;
      expect(mail.attachments).toEqual([]);
      expect(mail.body).not.toContain("Relays:");
      expect(mail.body).not.toContain(own[0]);
      expect(depositedJournal(mail.body)).toMatchObject({ report: "sattleme-app-log" });
      expect(relays.stored.get(own[0]!) ?? []).not.toContainEqual(
        expect.objectContaining({ pubkey: referenceOf(mail.body) })
      );
    } finally {
      resetDeviceRelays();
    }
  });

  it("attaches the journal as before when a majority of the relays cannot take it", async () => {
    await ownerDevice();
    await open("/settings/help");
    for (const relay of DEFAULT_RELAYS.slice(0, 3)) relays.unreachable.add(relay);
    await fireEvent.press(await screen.findByTestId("support-contact"));
    await waitFor(() => expect(mailComposer.mail.composed).toHaveLength(1));
    const mail = mailComposer.mail.composed[0]!;
    expect(mail.attachments).toEqual([COPY]);
    expect(mail.body).not.toContain("Logs:");
    expect(mail.body).not.toContain(DEPOSITED);
    expect(readLog().entries.map(({ event }) => event)).toContain(
      "Depositing the journal for support failed"
    );
  });

  it('deposits nothing once "Attach the app\'s log" is off', async () => {
    await ownerDevice();
    await open("/settings/help");
    const before = [...relays.stored.values()].flat().length;
    await fireEvent.press(await screen.findByTestId("support-attach"));
    await fireEvent.press(screen.getByTestId("support-contact"));
    await waitFor(() => expect(mailComposer.mail.composed).toHaveLength(1));
    expect(mailComposer.mail.composed[0]!.body).not.toContain("Logs:");
    expect([...relays.stored.values()].flat()).toHaveLength(before);
  });

  it("without a mail form, shares the mail's text, its reference in it, and no file", async () => {
    mailComposer.mail.available = false;
    const share = jest
      .spyOn(Share, "share")
      .mockResolvedValue({ action: Share.sharedAction, activityType: undefined });
    try {
      await ownerDevice();
      await open("/settings/help");
      await fireEvent.press(await screen.findByTestId("support-contact"));
      expect(await screen.findByText(`Support address copied: ${SUPPORT}`)).toBeTruthy();
      await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
      const { message } = share.mock.calls[0]![0] as { message: string };
      expect(message).toContain(DEPOSITED);
      expect(depositedJournal(message)).toMatchObject({ report: "sattleme-app-log" });
      expect(sharing.shared).toEqual([]);
    } finally {
      share.mockRestore();
    }
  });

  it("on the web, opens the mail from the tap, the deposit under way", async () => {
    await ownerDevice();
    await open("/settings/help");
    const contact = await screen.findByTestId("support-contact");
    const web = jest.replaceProperty(Platform, "OS", "web");
    const release = relays.holdPublishes();
    try {
      await fireEvent.press(contact);
      // Opened before any relay took the journal: a browser opens a mail client right after a tap.
      await waitFor(() => expect(mailComposer.mail.composed).toHaveLength(1));
      const mail = mailComposer.mail.composed[0]!;
      expect(mail.attachments).toEqual([]);
      expect(mail.body).toContain(`${DEPOSITED}\n\n--\n`);
      expect(await screen.findByText(`Write to us at ${SUPPORT}`)).toBeTruthy();
      expect(screen.queryByText("Attach the downloaded log (sattle-me-journal.json)")).toBeNull();
      release();
      await waitFor(() => expect(screen.getByTestId("support-contact")).not.toBeDisabled());
      expect(depositedJournal(mail.body)).toMatchObject({ report: "sattleme-app-log" });
      expect(screen.queryByText("Log not sent")).toBeNull();
    } finally {
      release();
      web.restore();
    }
  });

  it("on the web, downloads the journal to attach when its deposit fails, and says so", async () => {
    await ownerDevice();
    await open("/settings/help");
    const contact = await screen.findByTestId("support-contact");
    for (const relay of DEFAULT_RELAYS.slice(0, 3)) relays.unreachable.add(relay);
    const download = jest
      .spyOn(supportMail, "downloadSupportReport")
      .mockImplementation(() => undefined);
    const web = jest.replaceProperty(Platform, "OS", "web");
    try {
      await fireEvent.press(contact);
      expect(await screen.findByText("Log not sent")).toBeTruthy();
      expect(screen.getByText("Attach the downloaded log (sattle-me-journal.json)")).toBeTruthy();
      expect(download).toHaveBeenCalledTimes(1);
      expect(JSON.parse(download.mock.calls[0]![0])).toMatchObject({
        report: "sattleme-app-log"
      });
      expect(readLog().entries.map(({ event }) => event)).toContain(
        "Depositing the journal for support failed"
      );
    } finally {
      web.restore();
      download.mockRestore();
    }
  });
});

describe("Send crash reports", () => {
  const observeFake = jest.requireMock<typeof ObserveFake>("expo-observe");

  // As src/app/_layout.tsx does as the app starts: its layout is not among these routes.
  beforeAll(() => startObserve("staging"));

  /** The switch, once this device's choice is read. */
  async function reportsSwitch() {
    const toggle = await screen.findByTestId("support-reports");
    await waitFor(() => expect(toggle).toBeEnabled());
    return toggle;
  }

  it('shows this device\'s choice in "Help", saves a change at once and applies it', async () => {
    await ownerDevice();
    await open("/settings/help");
    // Staging's default: its testers' builds send.
    expect(await reportsSwitch()).toBeChecked();
    expect(screen.getByTestId("support-reports-row")).toHaveTextContent(
      /Crashes and slowdowns.*No amounts or payment addresses/
    );

    await fireEvent(screen.getByTestId("support-reports"), "valueChange", false);
    await waitFor(() => expect(screen.getByTestId("support-reports")).not.toBeChecked());
    expect(secureStore.items.get(OBSERVE_CHOICE_KEY)).toBe(serializeObserveChoice(false));
    expect(observeFake.observe.configured.at(-1)).toMatchObject({
      dispatchingEnabled: false,
      errorHandlingEnabled: false
    });
  });

  it("says so when the choice could not be saved, and keeps the one before", async () => {
    await ownerDevice();
    await open("/settings/help");
    await reportsSwitch();
    secureStore.setItemAsync.mockRejectedValueOnce(new Error("Keychain unavailable"));
    await fireEvent(screen.getByTestId("support-reports"), "valueChange", false);
    expect(await screen.findByText("Error while saving")).toBeTruthy();
    expect(
      screen.getByText("This choice could not be saved on this device. Try again")
    ).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId("support-reports")).toBeEnabled());
    expect(screen.getByTestId("support-reports")).toBeChecked();
    expect(secureStore.items.has(OBSERVE_CHOICE_KEY)).toBe(false);
    expect(readLog().entries.map(({ event }) => event)).toContain(
      "Saving the crash reports choice failed"
    );
  });

  // It has nothing to do with the mail to support, whose journal goes with "Contact support".
  it("is a section of its own, apart from the mail to support", async () => {
    await ownerDevice();
    await open("/settings/help");
    await reportsSwitch();
    const support = within(screen.getByTestId("support-block"));
    expect(support.getByTestId("support-attach")).toBeTruthy();
    expect(support.getByTestId("support-contact")).toBeTruthy();
    expect(support.queryByTestId("support-reports")).toBeNull();
    const reports = within(screen.getByTestId("support-reports-block"));
    expect(reports.getByRole("header")).toHaveTextContent("Send crash reports");
    // Said once: the row only turns it on.
    expect(reports.getAllByText("Send crash reports")).toHaveLength(1);
    expect(reports.getByTestId("support-reports")).toBeTruthy();
    expect(reports.queryByTestId("support-attach")).toBeNull();
  });

  it('is a switch of the section "Send crash reports" on the owner\'s desktop', async () => {
    mockDesktop.mockReturnValue(true);
    await ownerDevice();
    await open("/settings");
    await openTab("help");
    expect(await reportsSwitch()).toBeChecked();
    const reports = within(screen.getByTestId("support-reports-block"));
    expect(reports.getByRole("header")).toHaveTextContent("Send crash reports");
  });

  it("is not offered by the web app, which sends nothing to Expo Observe", async () => {
    await ownerDevice();
    const web = jest.replaceProperty(Platform, "OS", "web");
    try {
      await open("/settings/help");
      expect(await screen.findByTestId("support-contact")).toBeTruthy();
      expect(screen.queryByTestId("support-reports")).toBeNull();
      expect(screen.queryByTestId("support-reports-block")).toBeNull();
    } finally {
      web.restore();
    }
  });
});

describe("Settings of a card holder", () => {
  beforeEach(() => {
    jest
      .mocked(connectWallet)
      .mockReset()
      .mockResolvedValue(undefined as never);
    jest.mocked(getWalletId).mockReset().mockResolvedValue(TEST_WALLET_ID);
    jest
      .mocked(getWalletLightningAddress)
      .mockReset()
      .mockResolvedValue("sattleme02c6047f94@breez.tips");
  });

  it('shows what a card holder\'s account has, and "Create my merchant profile"', async () => {
    await cardHolderDevice();
    await open("/settings");
    expect(await screen.findByTestId("merchant-create")).toBeTruthy();
    for (const testID of [
      "settings-card-display",
      "settings-card-network",
      "logout",
      "settings-legal-terms",
      "settings-legal-privacy"
    ]) {
      expect(screen.getByTestId(testID)).toBeTruthy();
    }
    expect(screen.getByTestId("settings-card-display")).toHaveTextContent("CHF — Swiss francs", {
      exact: false
    });
    // Its recovery phrase: its words open its cards' wallets too ("Open with my 12 words"), and are
    // checked yearly.
    expect(screen.getByTestId("settings-card-security")).toHaveTextContent("Recovery phrase", {
      exact: false
    });
    expect(screen.getByTestId("delete-account", { includeHiddenElements: true })).toBeTruthy();
    // Nothing of a business: its name, what takes payments, what pays out.
    for (const card of ["business", "charging", "payouts"]) {
      expect(screen.queryByTestId(`settings-card-${card}`)).toBeNull();
    }
    // "Display": the display currency, its cards' amounts.
    await openRubric("display");
    expect(screen.getByTestId("display-currency")).toBeTruthy();
    expect(screen.getByText("Your cards' amounts shown in the app.")).toBeTruthy();
    expect(screen.queryByTestId("merchant-create")).toBeNull();
    expect(connectWallet).not.toHaveBeenCalled();
  });

  it("offers a card holder no app lock, and tells \"Log out\" loses its amounts' and theme's choices only", async () => {
    // Its passkey is asked as the app opens.
    await cardHolderDevice();
    await open("/settings");
    expect(await screen.findByTestId("settings-card-network")).toBeTruthy();
    // "Security": its recovery phrase and its check only.
    await openRubric("security");
    expect(screen.getByTestId("recovery-open")).toBeTruthy();
    expect(screen.getByTestId("recovery-check-open")).toBeTruthy();
    expect(screen.queryByTestId("unlock-asks-row")).toBeNull();
    await backToCards("network");
    await fireEvent.press(await screen.findByTestId("logout"));
    expect(
      await screen.findByText(
        "Your data and your funds stay in your account: your passkey logs you back in. Only the choices “Currency shown first” and “Theme” made on this device go back to their defaults."
      )
    ).toBeTruthy();
  });

  it("tells a card holder on the web that all but its amounts' and theme's choices is on the account", async () => {
    await cardHolderDevice();
    const web = jest.replaceProperty(Platform, "OS", "web");
    try {
      await open("/settings", webRoutes);
      await fireEvent.press(await screen.findByTestId("logout"));
      expect(
        await screen.findByText(
          "Your data and your funds stay in your account: your passkey logs you back in. Only the choices “Currency shown first” and “Theme” made on this device go back to their defaults."
        )
      ).toBeTruthy();
    } finally {
      web.restore();
    }
  });

  it("shows the same on a computer", async () => {
    mockDesktop.mockReturnValue(true);
    await cardHolderDevice();
    await open("/settings");
    expect(await screen.findByTestId("merchant-create")).toBeTruthy();
    expect(screen.getByTestId("display-currency")).toBeTruthy();
    expect(screen.getByTestId("settings-tab-display")).toBeSelected();
    for (const tab of ["business", "charging", "payouts"]) {
      expect(screen.queryByTestId(`settings-tab-${tab}`)).toBeNull();
    }
    // Its recovery phrase.
    expect(screen.getByTestId("settings-tab-security")).toBeTruthy();
    expect(
      screen.queryByText("Name and logo seen by customers, on receipts and invoices.")
    ).toBeNull();
  });

  it("opens the split, then creates the merchant's profile all in bitcoin: its point of sale opened", async () => {
    // The split first, as a new merchant's sign-up.
    await cardHolderDevice();
    const { router } = await open("/settings");
    // Nothing exists of the account's wallet until then.
    expect(connectWallet).not.toHaveBeenCalled();

    await fireEvent.press(await screen.findByTestId("merchant-create"));

    await waitFor(() => expect(router.getPathname()).toBe("/settings/merchant"));
    expect(screen.getByText("How do you want to be paid?")).toBeTruthy();
    expect(screen.getByTestId("split-continue")).toHaveTextContent("Start accepting payments");
    expect(connectWallet).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId("split-continue"));

    await waitFor(() => expect(router.getPathname()).toBe("/pos"));
    expect(jest.mocked(getWalletLightningAddress)).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Merchant profile created")).toBeTruthy();
    expect(getAccountSettings()).toMatchObject({
      usage: "merchant",
      bitcoinPercent: 100,
      payoutCurrency: "CHF",
      payoutAccountId: null
    });
    // Connected for the point of sale's profile (then for its on-chain addresses, in the background).
    expect(connectWallet).toHaveBeenCalled();
    await expect(loadTerminalProfile()).resolves.toMatchObject(POINT_OF_SALE);
  });

  it("asks for Mt Pelerin before the bank details of a fiat share, registers the account there, then creates the profile", async () => {
    // The card holder's own share (chosen in "Settings" before): the split's start.
    await cardHolderDevice({ bitcoinPercent: 60 });
    const { router } = await open("/settings");
    await fireEvent.press(await screen.findByTestId("merchant-create"));
    await waitFor(() => expect(router.getPathname()).toBe("/settings/merchant"));
    await fireEvent.press(screen.getByTestId("split-continue"));
    await waitFor(() => expect(router.getPathname()).toBe("/settings/merchant-bank"));

    // Why Mt Pelerin, before any bank detail (signup-mtpelerin.test.tsx: its texts).
    expect(await screen.findByTestId("mtpelerin-intro", {}, SLOW)).toBeTruthy();
    expect(screen.queryByTestId("bank-iban")).toBeNull();
    expect(screen.queryByTestId("bank-submit")).toBeNull();
    // The staging app's Mt Pelerin under Jest: its login by the account's key, then the profile.
    await logInToMtPelerin();

    // No account at Mt Pelerin yet: the form, typed.
    await typeBankAccount();
    expect(screen.getByTestId("bank-submit")).toHaveTextContent("Start accepting payments");
    expect(connectWallet).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId("bank-submit"));

    await waitFor(() => expect(router.getPathname()).toBe("/pos"), SLOW);
    expect(mtpBankAccounts()).toEqual([expect.objectContaining({ iban: IBAN, currency: "CHF" })]);
    expect(getAccountSettings()).toMatchObject({
      usage: "merchant",
      bitcoinPercent: 60,
      payoutAccountId: mtpBankAccounts()[0]?.id
    });
    expect(getAccountSettings()).not.toHaveProperty("bank");
    await expect(loadTerminalProfile()).resolves.toMatchObject(POINT_OF_SALE);
  });

  it("creates nothing while Mt Pelerin does not answer: the account stays a card holder's", async () => {
    await cardHolderDevice({ bitcoinPercent: 60 });
    const { router } = await open("/settings/merchant");
    await fireEvent.press(await screen.findByTestId("split-continue"));
    await waitFor(() => expect(router.getPathname()).toBe("/settings/merchant-bank"));
    await logInToMtPelerin();
    await typeBankAccount();
    mtPelerinFake.testMtPelerin().offline = true;

    await fireEvent.press(screen.getByTestId("bank-submit"));

    expect(
      await screen.findByText(
        "The sale service is not answering. Check your internet connection, then try again",
        {},
        SLOW
      )
    ).toBeTruthy();
    expect(router.getPathname()).toBe("/settings/merchant-bank");
    expect(getAccountSettings()).toMatchObject({ usage: "card" });
    expect(connectWallet).not.toHaveBeenCalled();
  });

  it("leaves the account a card holder's, without any wallet, when no relay takes the change", async () => {
    await cardHolderDevice();
    const { router } = await open("/settings/merchant");
    for (const relay of DEFAULT_RELAYS) relays.readOnly.add(relay);
    const held = holdBackups();
    try {
      await fireEvent.press(await screen.findByTestId("split-continue"));
      // Waiting for the relays: a second tap cannot start another creation.
      expect(screen.getByTestId("split-continue")).toBeDisabled();
      await held.release();
    } finally {
      held.restore();
    }
    expect(await screen.findByText(UNPUBLISHED_NOTIFICATION)).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId("split-continue")).toBeEnabled());
    expect(router.getPathname()).toBe("/settings/merchant");
    expect(getAccountSettings()).toMatchObject({ usage: "card", bitcoinPercent: 100 });
    expect(connectWallet).not.toHaveBeenCalled();
    await expect(loadTerminalProfile()).resolves.toMatchObject({ version: 4 });
  });

  it("says when the point of sale could not be prepared, the account a merchant's, and tries again", async () => {
    await cardHolderDevice();
    const { router } = await open("/settings/merchant");
    jest.mocked(getWalletLightningAddress).mockRejectedValueOnce(new Error("breez.tips down"));
    await fireEvent.press(await screen.findByTestId("split-continue"));
    expect(await screen.findByText("Point of sale not prepared")).toBeTruthy();
    expect(router.getPathname()).toBe("/settings/merchant");
    expect(getAccountSettings()).toMatchObject({ usage: "merchant", bitcoinPercent: 100 });
    await waitFor(() => expect(screen.getByTestId("split-continue")).toBeEnabled());

    await fireEvent.press(screen.getByTestId("split-continue"));

    await waitFor(() => expect(router.getPathname()).toBe("/pos"));
    await expect(loadTerminalProfile()).resolves.toMatchObject(POINT_OF_SALE);
  });

  it("creates it from a computer's tab too", async () => {
    mockDesktop.mockReturnValue(true);
    await cardHolderDevice();
    const { router } = await open("/settings");
    await fireEvent.press(await screen.findByTestId("merchant-create"));
    await waitFor(() => expect(router.getPathname()).toBe("/settings/merchant"));
    await fireEvent.press(screen.getByTestId("split-continue"));
    await waitFor(() => expect(router.getPathname()).toBe("/pos"));
    expect(getAccountSettings()).toMatchObject({ usage: "merchant", bitcoinPercent: 100 });
    await expect(loadTerminalProfile()).resolves.toMatchObject(POINT_OF_SALE);
  });

  it('has no profile to create on a point of sale: back to "Settings"', async () => {
    await ownerDevice();
    const { router } = await open("/settings/merchant");
    await waitFor(() => expect(router.getPathname()).toBe("/settings"));
    expect(screen.queryByTestId("merchant-create")).toBeNull();
  });
});

describe("Currency shown first", () => {
  const stored = () => parseAmountUnit(secureStore.items.get(AMOUNT_UNIT_KEY) ?? null);

  it("offers the display currency first by default, and saves the sats on this device at once", async () => {
    await ownerDevice();
    await open("/settings");
    // Under "Reference currency", in "Business": what the lists of movements write first.
    const page = within(await openRubric("business"));
    const block = within(page.getByTestId("amount-unit-block"));
    expect(block.getByText("Currency shown first")).toBeTruthy();
    expect(
      block.getByText(
        "In “Wallet” and your cards’ history, on this device. The other amount is shown below it."
      )
    ).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId("amount-unit-fiat")).toBeChecked());
    expect(screen.getByTestId("amount-unit-fiat")).toHaveTextContent("CHF");
    expect(screen.getByTestId("amount-unit-sats")).not.toBeChecked();

    await fireEvent.press(screen.getByTestId("amount-unit-sats"));
    expect(await screen.findByText("Currency shown first saved")).toBeTruthy();
    expect(screen.getByTestId("amount-unit-sats")).toBeChecked();
    expect(stored()).toBe("sats");
    // On this device only: nothing of it in the account's settings.
    expect(JSON.stringify(getAccountSettings())).not.toMatch(/amount-?unit/i);
  });

  it("keeps the choice before when it could not be saved, and says so", async () => {
    await ownerDevice();
    await open("/settings");
    await openRubric("business");
    await waitFor(() => expect(screen.getByTestId("amount-unit-fiat")).toBeChecked());
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    secureStore.setItemAsync.mockRejectedValueOnce(new Error("Keychain unavailable"));
    await fireEvent.press(screen.getByTestId("amount-unit-sats"));
    expect(
      // A notification's text without its final period.
      await screen.findByText("This choice could not be saved on this device. Try again")
    ).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId("amount-unit-fiat")).toBeChecked());
    expect(stored()).toBeNull();
    expect(readLog().entries.map((entry) => entry.event)).toContain(
      "Saving the amounts' unit failed"
    );
  });

  it('shows the choice stored on the device, and offers it to a card holder in "Display"', async () => {
    secureStore.items.set(AMOUNT_UNIT_KEY, serializeAmountUnit("sats"));
    await cardHolderDevice();
    await open("/settings");
    const page = within(await openRubric("display"));
    expect(page.getByTestId("amount-unit-block")).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId("amount-unit-sats")).toBeChecked());
  });
});

describe("Theme", () => {
  const stored = () => parseThemePreference(secureStore.items.get(THEME_KEY) ?? null);

  it("follows the device by default, and saves another theme on this device at once", async () => {
    await ownerDevice();
    await open("/settings");
    // A merchant's "Display", its card saying the theme in use.
    expect(await screen.findByTestId("settings-card-display")).toHaveTextContent(
      "Automatic theme",
      { exact: false }
    );
    const page = within(await openRubric("display"));
    const block = within(page.getByTestId("theme-block"));
    expect(block.getByText("Theme")).toBeTruthy();
    expect(
      block.getByText("On this device. “Automatic” follows the device's light or dark setting.")
    ).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId("theme-system")).toBeChecked());
    // (A segment holds a hidden copy of its label: SegmentedControl.tsx.)
    expect(screen.getByTestId("theme-light")).toHaveTextContent("Light", { exact: false });
    expect(screen.getByTestId("theme-dark")).toHaveTextContent("Dark", { exact: false });
    expect(screen.getByTestId("theme-system")).toHaveTextContent("Automatic", { exact: false });

    await fireEvent.press(screen.getByTestId("theme-dark"));
    expect(await screen.findByText("Theme saved")).toBeTruthy();
    expect(screen.getByTestId("theme-dark")).toBeChecked();
    expect(stored()).toBe("dark");
    // On this device only: nothing of it in the account's settings.
    expect(JSON.stringify(getAccountSettings())).not.toMatch(/theme|dark/i);
  });

  it("keeps the choice before when it could not be saved, and says so", async () => {
    await ownerDevice();
    await open("/settings");
    await openRubric("display");
    await waitFor(() => expect(screen.getByTestId("theme-system")).toBeChecked());
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    secureStore.setItemAsync.mockRejectedValueOnce(new Error("Keychain unavailable"));
    await fireEvent.press(screen.getByTestId("theme-light"));
    expect(
      await screen.findByText("This choice could not be saved on this device. Try again")
    ).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId("theme-system")).toBeChecked());
    expect(stored()).toBeNull();
    expect(readLog().entries.map((entry) => entry.event)).toContain("Saving the theme failed");
  });

  it('offers it to a card holder in "Display", under the display currency', async () => {
    secureStore.items.set(THEME_KEY, serializeThemePreference("light"));
    await cardHolderDevice();
    await open("/settings");
    const page = within(await openRubric("display"));
    expect(page.getByTestId("amount-unit-block")).toBeTruthy();
    expect(page.getByTestId("theme-block")).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId("theme-light")).toBeChecked());
  });

  it('offers it on a computer, in the merchant\'s "Display" tab', async () => {
    mockDesktop.mockReturnValue(true);
    await ownerDevice();
    await open("/settings");
    const panel = within(await openTab("display"));
    expect(panel.getByTestId("theme-block")).toBeTruthy();
    // A merchant's "Display": no profile to create, it has one.
    expect(panel.queryByTestId("merchant-create")).toBeNull();
  });

  it('offers it to an employee\'s device, in its own "Display"', async () => {
    await ownerDevice();
    const { url } = await inviteEmployee("Alice");
    closeAccount();
    fileSystem.resetFileSystem();
    secureStore.resetSecureStore();
    resetTerminalProfileCache();
    resetMembershipCache();
    resetDeviceRelays();
    await joinTeam(await previewInvite(inviteLinkOf(url)!));
    await open("/settings");
    expect(await screen.findByTestId("settings-card-display")).toHaveTextContent(
      "Automatic theme",
      { exact: false }
    );
    const page = within(await openRubric("display"));
    await waitFor(() => expect(screen.getByTestId("theme-system")).toBeChecked());
    await fireEvent.press(page.getByTestId("theme-dark"));
    expect(await screen.findByText("Theme saved")).toBeTruthy();
    expect(stored()).toBe("dark");
  });
});
