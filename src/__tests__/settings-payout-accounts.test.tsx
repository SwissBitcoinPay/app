import "@/i18n";

import { fireEvent, renderRouter, screen, waitFor, within } from "expo-router/testing-library";
import { StyleSheet } from "react-native";

import AppLayout from "@/app/(app)/_layout";
import AmountScreen from "@/app/(app)/pos/index";
import PosLayout from "@/app/(app)/pos/_layout";
import SettingsBank from "@/app/(app)/settings/bank";
import SettingsLayout from "@/app/(app)/settings/_layout";
import SettingsIndex from "@/app/(app)/settings/index";
import SettingsPayouts from "@/app/(app)/settings/payouts";
import SettingsSplit from "@/app/(app)/settings/split";
import LaunchScreen from "@/app/index";
import { closeAccount, getAccountBackupKey, getAccountSettings } from "@/features/account/session";
import { resetImages } from "@/features/media/images";
import { resetRelayStatuses } from "@/features/relays/relay-test";
import { accountMtpAccess } from "@/features/sell/account-flow";
import { resetPayRequests } from "@/features/terminal/invoice";
import { resetTerminalProfileCache } from "@/features/terminal/profile-cache";
import { currentRelays } from "@/lib/relays/current";
import type { SavedTerminalProfile } from "@/lib/terminal/model";
import { saveTerminalProfile } from "@/lib/terminal/profile";

import { TEST_WALLET_ID, openTestAccount } from "../../jest/account";
import { fakeIban, type FakeMtPelerin } from "../../jest/mtpelerin-fake/server";
import type * as FileSystemFake from "../../jest/expo-file-system";
import type * as MtPelerinFake from "../../jest/mtpelerin";
import type * as RelaysFake from "../../jest/nostr-relays";

/*
 * "Settings › Bank account" with Mt Pelerin connected (src/features/settings/payout-accounts.ts): the bank accounts the merchant has at Mt Pelerin in
 * the currency chosen, offered first, "Add an account" for another, registered at Mt Pelerin
 * as it is saved; the form at once without any. The staging app's Mt Pelerin (its dev/test
 * environment), faked (jest/mtpelerin.ts); its session one another device of the account shared.
 * Fictitious data only.
 */

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
jest.mock("../features/terminal/useRate", () => ({
  useRate: () => ({ rate: 50000, loading: false, current: () => 50000 })
}));
// Mainnet: invoices of "bc" (the app config has no network under Jest).
jest.mock("../lib/breez/config", () => ({
  ...jest.requireActual("../lib/breez/config"),
  getBreezNetwork: () => "mainnet"
}));
// The staging app: Mt Pelerin's dev/test environment (src/lib/mtpelerin/environment.ts).
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

const relays = jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");
const fileSystem = jest.requireMock<typeof FileSystemFake>("expo-file-system");
const fake = jest.requireMock<typeof MtPelerinFake>("@/lib/mtpelerin/transport");

const routes = {
  index: LaunchScreen,
  "(app)/_layout": AppLayout,
  "(app)/pos/_layout": PosLayout,
  "(app)/pos/index": AmountScreen,
  "(app)/settings/_layout": SettingsLayout,
  "(app)/settings/index": SettingsIndex,
  "(app)/settings/split": SettingsSplit,
  "(app)/settings/bank": SettingsBank,
  "(app)/settings/payouts": SettingsPayouts
};

/** A session another device of the account shared: the fake adopts it as a profile of its own. */
const SHARED_TOKEN = `fake.00000000.${"cd".repeat(24)}`;
const SLOW = { timeout: 5000 };

/** Clearly fake details: the IBAN is the example of the Swiss IBAN documentation. */
const SETTINGS_IBAN = "CH9300762011623852957";
/** Mt Pelerin's id of the settings' account: all the settings keep of it (format 18). */
const SETTINGS_ACCOUNT_ID = "settings-account-1";
const OTHER_IBAN = fakeIban(7021);
const NEW_IBAN = fakeIban(7022);

type Json = Record<string, unknown>;

/** A bank account as Mt Pelerin registers it: Alice Example's, in CHF, active. */
function mtpBank(iban: string, patch: Json = {}): Json {
  return {
    type: "external",
    reference: "Account",
    iban,
    currency: "CHF",
    owner_firstname: "Alice",
    owner_lastname: "Example",
    owner_street: "2 Test Street",
    owner_postcode: "1004",
    owner_city: "Lausanne",
    owner_country: "CH",
    user_is_owner: true,
    status: "active",
    ...patch
  };
}

/** The settings' account as Mt Pelerin has it. */
const SETTINGS_AT_MTP = mtpBank(SETTINGS_IBAN, {
  id: SETTINGS_ACCOUNT_ID,
  owner_firstname: undefined,
  owner_lastname: undefined,
  owner_companyname: "Fine Bakery LLC",
  owner_street: "1 Town Street",
  owner_postcode: "1003"
});

/**
 * The owner's device, unlocked (60 % in bitcoin, 40 % in CHF to Mt Pelerin's account
 * SETTINGS_ACCOUNT_ID); Mt Pelerin connected with
 * `accounts` (their ids in `ids`, in order), unless `connected` is false.
 */
async function ownerDevice({
  accounts = [],
  connected = true,
  allBitcoin = false
}: {
  accounts?: Json[];
  connected?: boolean;
  /** At 100 % in bitcoin, without any bank account in the settings. */
  allBitcoin?: boolean;
} = {}) {
  await openTestAccount({
    usage: "merchant",
    signUp: "done",
    payoutCurrency: "CHF",
    detectedCountry: "CH",
    ...(allBitcoin
      ? { bitcoinPercent: 100, payoutAccountId: null }
      : { bitcoinPercent: 60, payoutAccountId: SETTINGS_ACCOUNT_ID })
  });
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
  const server: FakeMtPelerin = fake.testMtPelerin();
  const ids: string[] = [];
  server.onNewPhone = (phone) => {
    server.seedProfile(phone);
    for (const account of accounts) ids.push(server.seedAccount(phone, account).id as string);
  };
  if (connected) await accountMtpAccess()!.sessions.keep(SHARED_TOKEN);
  return { server, ids };
}

/** "Split", then "Continue": "Bank account", once its accounts are read. */
async function openBank() {
  const router = await renderRouter(routes, { initialUrl: "/settings/split" });
  await fireEvent.press(await screen.findByTestId("split-continue", {}, SLOW));
  await waitFor(() => expect(router.getPathname()).toBe("/settings/bank"));
  return router;
}

/** Whether an account's card is the one chosen. */
const checked = (testID: string) =>
  screen.getByTestId(testID).props.accessibilityState?.checked === true;

/** The accounts Mt Pelerin was asked to create. */
const created = (server: FakeMtPelerin) =>
  server.requests.filter(({ method, path }) => method === "PUT" && path === "/accounts");

/** Mt Pelerin's id of the profile's account of `iban` in CHF. */
const idOf = (server: FakeMtPelerin, iban: string) =>
  server.accountsOfUser().find((account) => account.iban === iban && account.currency === "CHF")
    ?.id as string;

/** The settings' bank account: its Mt Pelerin id, and never its details (format 18). */
function settingsAccount(): string | null | undefined {
  const settings = getAccountSettings();
  expect(settings).not.toHaveProperty("bank");
  return settings?.payoutAccountId;
}

/** The form filled with the settings' account, its IBAN `iban` (the country is the detected one). */
async function typeAccount(iban: string = SETTINGS_IBAN) {
  await fireEvent.press(screen.getByTestId("bank-holder-company"));
  await fireEvent.changeText(screen.getByTestId("bank-company"), "Fine Bakery LLC");
  await fireEvent.changeText(screen.getByTestId("bank-iban"), iban);
  await fireEvent.changeText(screen.getByTestId("bank-address"), "1 Town Street");
  await fireEvent.changeText(screen.getByTestId("bank-postal-code"), "1003");
  await fireEvent.changeText(screen.getByTestId("bank-city"), "Lausanne");
}

jest.setTimeout(30_000);

beforeEach(() => {
  resetPayRequests();
  closeAccount();
  relays.resetRelays();
  fileSystem.resetFileSystem();
  resetImages();
  resetRelayStatuses();
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  closeAccount();
  jest.restoreAllMocks();
});

describe('"Bank account" with Mt Pelerin connected', () => {
  it("offers its accounts in the currency chosen, the settings' one chosen, and saves another", async () => {
    const { server, ids } = await ownerDevice({
      accounts: [
        SETTINGS_AT_MTP,
        mtpBank(OTHER_IBAN, { status: "pending_validation" }),
        // Another currency: not where the francs go.
        mtpBank(NEW_IBAN, { currency: "EUR" })
      ]
    });
    const router = await openBank();

    const settingsCard = `bank-account-${ids[0]}`;
    const otherCard = `bank-account-${ids[1]}`;
    await screen.findByTestId(settingsCard, {}, SLOW);
    expect(screen.queryByTestId(`bank-account-${ids[2]}`)).toBeNull();
    // No form: the accounts, the settings' one chosen.
    expect(screen.queryByTestId("bank-iban")).toBeNull();
    expect(within(screen.getByTestId(settingsCard)).getByText("Fine Bakery LLC")).toBeTruthy();
    expect(within(screen.getByTestId(settingsCard)).getByText("CH93 •••• 2957")).toBeTruthy();
    expect(
      within(screen.getByTestId(otherCard)).getByText(
        `${OTHER_IBAN.slice(0, 4)} •••• ${OTHER_IBAN.slice(-4)} · Pending`
      )
    ).toBeTruthy();
    expect(checked(settingsCard)).toBe(true);
    expect(checked(otherCard)).toBe(false);
    expect(screen.getByTestId("bank-account-add")).toBeTruthy();

    await fireEvent.press(screen.getByTestId(otherCard));
    expect(checked(otherCard)).toBe(true);
    expect(checked(settingsCard)).toBe(false);
    await fireEvent.press(screen.getByTestId("bank-submit"));

    expect(await screen.findByText("Split saved", {}, SLOW)).toBeTruthy();
    await waitFor(() => expect(router.getPathname()).toBe("/settings"));
    // Its id: the account the split's sale now goes to, its details left at Mt Pelerin.
    expect(settingsAccount()).toBe(ids[1]);
    expect(created(server)).toEqual([]);
  });

  it("keeps the settings' account as it is when it is chosen again", async () => {
    await ownerDevice({ accounts: [SETTINGS_AT_MTP, mtpBank(OTHER_IBAN)] });
    const router = await openBank();

    await screen.findByTestId("bank-submit", {}, SLOW);
    await fireEvent.press(screen.getByTestId("bank-submit"));

    await waitFor(() => expect(router.getPathname()).toBe("/settings"));
    expect(settingsAccount()).toBe(SETTINGS_ACCOUNT_ID);
  });

  it("chooses nothing for the user when the settings' account is not among them", async () => {
    await ownerDevice({ accounts: [mtpBank(OTHER_IBAN), mtpBank(NEW_IBAN)] });
    await openBank();

    expect(await screen.findByTestId("bank-submit", {}, SLOW)).toBeDisabled();
  });

  it("adds an account: the form, back to the accounts, then registered at Mt Pelerin and saved", async () => {
    const { server } = await ownerDevice({ accounts: [SETTINGS_AT_MTP] });
    const router = await openBank();

    await fireEvent.press(await screen.findByTestId("bank-account-add", {}, SLOW));
    // A new account: nothing of the settings' one in the form.
    expect(screen.getByTestId("bank-iban").props.value).toBe("");
    expect(screen.getByTestId("bank-submit")).toBeDisabled();
    // "Back" leads back to the accounts, not out of the screen.
    await fireEvent.press(screen.getByLabelText("Back"));
    expect(await screen.findByTestId("bank-account-add")).toBeTruthy();
    expect(router.getPathname()).toBe("/settings/bank");

    await fireEvent.press(screen.getByTestId("bank-account-add"));
    await fireEvent.press(screen.getByTestId("bank-holder-company"));
    await fireEvent.changeText(screen.getByTestId("bank-company"), "New Studio Ltd");
    await fireEvent.changeText(screen.getByTestId("bank-iban"), NEW_IBAN);
    await fireEvent.changeText(screen.getByTestId("bank-address"), "3 New Street");
    await fireEvent.changeText(screen.getByTestId("bank-postal-code"), "1000");
    await fireEvent.changeText(screen.getByTestId("bank-city"), "Lausanne");
    await fireEvent.press(screen.getByTestId("bank-submit"));

    expect(await screen.findByText("Split saved", {}, SLOW)).toBeTruthy();
    await waitFor(() => expect(router.getPathname()).toBe("/settings"));
    expect(created(server)).toHaveLength(1);
    expect(created(server)[0]?.body).toMatchObject({
      type: "external",
      iban: NEW_IBAN,
      currency: "CHF",
      owner_companyname: "New Studio Ltd",
      owner_street: "3 New Street",
      owner_postcode: "1000",
      owner_city: "Lausanne",
      owner_country: "CH",
      user_is_owner: true
    });
    expect(settingsAccount()).toBe(idOf(server, NEW_IBAN));
  });

  it("edits the account chosen: its holder and address changed at Mt Pelerin, then saved", async () => {
    const { server, ids } = await ownerDevice({ accounts: [SETTINGS_AT_MTP, mtpBank(OTHER_IBAN)] });
    const router = await openBank();

    await screen.findByTestId(`bank-account-${ids[0]}`, {}, SLOW);
    await fireEvent.press(screen.getByTestId("bank-account-edit"));
    // As Mt Pelerin has it; its IBAN shown, not changed.
    expect(screen.getByTestId("bank-company").props.value).toBe("Fine Bakery LLC");
    expect(screen.getByTestId("bank-address").props.value).toBe("1 Town Street");
    expect(screen.getByTestId("bank-iban").props.value).toBe("CH93 0076 2011 6238 5295 7");
    expect(screen.getByTestId("bank-iban").props.editable).toBe(false);
    // In Plus Jakarta Sans, as every other field of the form.
    expect(StyleSheet.flatten(screen.getByTestId("bank-iban").props.style).fontFamily).toMatch(
      /^PlusJakartaSans-/
    );
    await fireEvent.changeText(screen.getByTestId("bank-address"), "5 Station Road");
    await fireEvent.changeText(screen.getByTestId("bank-postal-code"), "1003");
    await fireEvent.press(screen.getByTestId("bank-submit"));

    expect(await screen.findByText("Split saved", {}, SLOW)).toBeTruthy();
    await waitFor(() => expect(router.getPathname()).toBe("/settings"));
    // Changed there, never created again.
    expect(created(server)).toEqual([]);
    const patches = server.requests.filter(({ method }) => method === "PATCH");
    expect(patches).toHaveLength(1);
    expect(patches[0]).toMatchObject({
      path: `/accounts/${ids[0]}`,
      body: {
        owner_companyname: "Fine Bakery LLC",
        owner_firstname: null,
        owner_lastname: null,
        owner_street: "5 Station Road",
        owner_postcode: "1003",
        owner_city: "Lausanne",
        owner_country: "CH"
      }
    });
    expect(server.accountsOfUser().find(({ id }) => id === ids[0])).toMatchObject({
      iban: SETTINGS_IBAN,
      owner_street: "5 Station Road"
    });
    // The settings: the same account's id, nothing of its new address.
    expect(settingsAccount()).toBe(ids[0]);
  });

  it("saves nothing when Mt Pelerin keeps the account as it was", async () => {
    const { server, ids } = await ownerDevice({ accounts: [SETTINGS_AT_MTP] });
    const router = await openBank();

    await fireEvent.press(await screen.findByTestId("bank-account-edit", {}, SLOW));
    await fireEvent.changeText(screen.getByTestId("bank-city"), "Geneva");
    server.failNext(`PATCH /accounts/${ids[0]}`, 422, { error: { message: "Locked" } });
    await fireEvent.press(screen.getByTestId("bank-submit"));

    expect(
      await screen.findByText(/Mt Pelerin did not change this account/, {}, SLOW)
    ).toBeTruthy();
    expect(router.getPathname()).toBe("/settings/bank");
    expect(screen.getByTestId("bank-city").props.value).toBe("Geneva");
    expect(settingsAccount()).toBe(SETTINGS_ACCOUNT_ID);
    expect(created(server)).toEqual([]);
  });

  it("refuses an IBAN another Mt Pelerin profile has, on its field, and saves nothing", async () => {
    const { server } = await ownerDevice({ accounts: [SETTINGS_AT_MTP] });
    server.seedOtherProfileAccount(mtpBank(NEW_IBAN));
    await openBank();

    await fireEvent.press(await screen.findByTestId("bank-account-add", {}, SLOW));
    await fireEvent.press(screen.getByTestId("bank-holder-company"));
    await fireEvent.changeText(screen.getByTestId("bank-company"), "New Studio Ltd");
    await fireEvent.changeText(screen.getByTestId("bank-iban"), NEW_IBAN);
    await fireEvent.changeText(screen.getByTestId("bank-address"), "3 New Street");
    await fireEvent.changeText(screen.getByTestId("bank-postal-code"), "1000");
    await fireEvent.changeText(screen.getByTestId("bank-city"), "Lausanne");
    await fireEvent.press(screen.getByTestId("bank-submit"));

    expect(
      await screen.findByText(
        "This IBAN is already registered on another Mt Pelerin account",
        {},
        SLOW
      )
    ).toBeTruthy();
    expect(settingsAccount()).toBe(SETTINGS_ACCOUNT_ID);
  });

  it("saves nothing when Mt Pelerin does not take the new account", async () => {
    const { server } = await ownerDevice({ accounts: [SETTINGS_AT_MTP] });
    await openBank();
    await fireEvent.press(await screen.findByTestId("bank-account-add", {}, SLOW));
    await fireEvent.press(screen.getByTestId("bank-holder-company"));
    await fireEvent.changeText(screen.getByTestId("bank-company"), "New Studio Ltd");
    await fireEvent.changeText(screen.getByTestId("bank-iban"), NEW_IBAN);
    await fireEvent.changeText(screen.getByTestId("bank-address"), "3 New Street");
    await fireEvent.changeText(screen.getByTestId("bank-postal-code"), "1000");
    await fireEvent.changeText(screen.getByTestId("bank-city"), "Lausanne");
    server.offline = true;
    await fireEvent.press(screen.getByTestId("bank-submit"));

    expect(
      await screen.findByText(
        "The sale service is not answering. Check your internet connection, then try again",
        {},
        SLOW
      )
    ).toBeTruthy();
    expect(screen.getByTestId("bank-submit")).toBeEnabled();
    expect(settingsAccount()).toBe(SETTINGS_ACCOUNT_ID);
  });

  it("completes an account Mt Pelerin lacks a line of, in the form, there too, without registering it again", async () => {
    const { server, ids } = await ownerDevice({
      accounts: [SETTINGS_AT_MTP, mtpBank(OTHER_IBAN, { owner_street: undefined })]
    });
    const router = await openBank();

    await fireEvent.press(await screen.findByTestId(`bank-account-${ids[1]}`, {}, SLOW));
    await fireEvent.press(screen.getByTestId("bank-submit"));
    // The form, filled with what Mt Pelerin has: the street to type.
    expect(await screen.findByDisplayValue("Alice")).toBeTruthy();
    expect(screen.getByTestId("bank-iban").props.value.replace(/ /g, "")).toBe(OTHER_IBAN);
    expect(screen.getByTestId("bank-iban").props.editable).toBe(false);
    expect(screen.getByTestId("bank-address").props.value).toBe("");
    expect(screen.getByTestId("bank-submit")).toBeDisabled();
    await fireEvent.changeText(screen.getByTestId("bank-address"), "2 Test Street");
    await fireEvent.press(screen.getByTestId("bank-submit"));

    await waitFor(() => expect(router.getPathname()).toBe("/settings"), SLOW);
    expect(settingsAccount()).toBe(ids[1]);
    expect(created(server)).toEqual([]);
    // The line Mt Pelerin lacked, now there too: each transfer carries it.
    expect(server.accountsOfUser().find(({ id }) => id === ids[1])).toMatchObject({
      owner_street: "2 Test Street"
    });
  });

  it("shows the form at once without an account in that currency, and registers it as saved", async () => {
    const { server } = await ownerDevice({ accounts: [mtpBank(OTHER_IBAN, { currency: "EUR" })] });
    const router = await openBank();

    // Empty: the settings hold nothing of their account but its id.
    expect((await screen.findByTestId("bank-iban", {}, SLOW)).props.value).toBe("");
    expect(screen.queryByTestId("bank-account-add")).toBeNull();
    await typeAccount();
    await fireEvent.press(screen.getByTestId("bank-submit"));

    await waitFor(() => expect(router.getPathname()).toBe("/settings"), SLOW);
    expect(created(server)).toHaveLength(1);
    expect(created(server)[0]?.body).toMatchObject({ iban: SETTINGS_IBAN, currency: "CHF" });
    expect(settingsAccount()).toBe(idOf(server, SETTINGS_IBAN));
  });

  it("keeps the form when the account is registered but the settings are not saved", async () => {
    const { server } = await ownerDevice({ accounts: [mtpBank(OTHER_IBAN, { currency: "EUR" })] });
    const router = await openBank();
    await screen.findByTestId("bank-iban", {}, SLOW);
    await typeAccount();
    // The relays answer, and refuse every event: Mt Pelerin takes the account, not the relays.
    for (const relay of currentRelays()) relays.readOnly.add(relay);
    await fireEvent.press(screen.getByTestId("bank-submit"));

    expect(await screen.findByText("Error while saving", {}, SLOW)).toBeTruthy();
    expect(created(server)).toHaveLength(1);
    // Mt Pelerin's list read again now holds it: the form stays under the merchant's finger.
    await waitFor(() =>
      expect(server.requests.filter(({ path }) => path === "/accounts").length).toBeGreaterThan(3)
    );
    expect(screen.getByTestId("bank-iban")).toBeTruthy();
    expect(screen.getByTestId("bank-submit")).toBeEnabled();
    expect(router.getPathname()).toBe("/settings/bank");
    expect(settingsAccount()).toBe(SETTINGS_ACCOUNT_ID);

    // "Back" now leads to Mt Pelerin's accounts, the new one among them.
    await fireEvent.press(screen.getByLabelText("Back"));
    expect(await screen.findByTestId("bank-account-add")).toBeTruthy();
    // A new account is "Pending" until Mt Pelerin validates it.
    expect(screen.getByText("CH93 •••• 2957 · Pending")).toBeTruthy();
  });

  it("offers the accounts it can read, and says how many others it cannot", async () => {
    const { ids } = await ownerDevice({
      accounts: [
        SETTINGS_AT_MTP,
        // Written without its holder's name: never offered.
        mtpBank(OTHER_IBAN, { owner_firstname: undefined, owner_lastname: undefined })
      ]
    });
    await openBank();

    await screen.findByTestId(`bank-account-${ids[0]}`, {}, SLOW);
    expect(screen.queryByTestId(`bank-account-${ids[1]}`)).toBeNull();
    expect(screen.getByTestId("bank-accounts-unreadable")).toHaveTextContent(
      /1 other account could not be read/
    );
  });

  it("offers an account Mt Pelerin lacks its holder's address for, saying so", async () => {
    const { ids } = await ownerDevice({
      accounts: [
        SETTINGS_AT_MTP,
        // As production lists accounts registered elsewhere: one name, no address.
        mtpBank(OTHER_IBAN, {
          owner_firstname: "EXAMPLE STUDIO LTD",
          owner_lastname: undefined,
          owner_street: undefined,
          owner_postcode: undefined,
          owner_city: undefined,
          owner_country: undefined
        })
      ]
    });
    await openBank();

    expect(await screen.findByTestId(`bank-account-${ids[1]}`, {}, SLOW)).toHaveTextContent(
      /EXAMPLE STUDIO LTD.*Incomplete address/
    );
    expect(screen.getByTestId(`bank-account-${ids[0]}`)).not.toHaveTextContent(
      /Incomplete address/
    );
  });

  it('never offers "none at Mt Pelerin" when it can read none of its accounts', async () => {
    await ownerDevice({
      accounts: [mtpBank(OTHER_IBAN, { owner_firstname: undefined, owner_lastname: undefined })]
    });
    await openBank();

    expect(await screen.findByTestId("bank-accounts-unread", {}, SLOW)).toHaveTextContent(
      /unreadable answer/
    );
    expect(screen.queryByTestId("bank-accounts-unreadable")).toBeNull();
  });

  it("says Mt Pelerin did not answer, never as if it had no account, and reads again", async () => {
    const { server, ids } = await ownerDevice({ accounts: [SETTINGS_AT_MTP] });
    server.offline = true;
    await openBank();

    expect(
      await screen.findByText(
        "The sale service is not answering. Check your internet connection, then try again",
        {},
        SLOW
      )
    ).toBeTruthy();
    expect(screen.queryByTestId("bank-iban")).toBeNull();
    // Meanwhile, the settings' account only: Mt Pelerin's other accounts are not known.
    expect(checked("bank-account-current")).toBe(true);
    expect(screen.queryByTestId("bank-account-add")).toBeNull();

    server.offline = false;
    await fireEvent.press(screen.getByTestId("sell-retry"));
    expect(await screen.findByTestId(`bank-account-${ids[0]}`, {}, SLOW)).toBeTruthy();
    expect(screen.queryByTestId("bank-account-current")).toBeNull();
  });

  it("saves the split with the settings' account as it is while Mt Pelerin does not answer", async () => {
    const { server } = await ownerDevice({ accounts: [SETTINGS_AT_MTP] });
    server.offline = true;
    const router = await openBank();

    const current = await screen.findByTestId("bank-account-current", {}, SLOW);
    // Its holder and IBAN are Mt Pelerin's, which does not answer: not shown, never a former one.
    expect(within(current).getByText("The saved account")).toBeTruthy();
    expect(within(current).getByText("At Mt Pelerin, in this currency")).toBeTruthy();
    expect(within(current).queryByText(/CH93/)).toBeNull();
    const requests = server.requests.length;
    await fireEvent.press(screen.getByTestId("bank-submit"));

    expect(await screen.findByText("Split saved", {}, SLOW)).toBeTruthy();
    await waitFor(() => expect(router.getPathname()).toBe("/settings"));
    expect(getAccountSettings()).toMatchObject({
      bitcoinPercent: 60,
      payoutAccountId: SETTINGS_ACCOUNT_ID
    });
    // Nothing more asked of Mt Pelerin.
    expect(server.requests).toHaveLength(requests);
  });

  it("offers nothing to save without an account in the settings while Mt Pelerin does not answer", async () => {
    const { server } = await ownerDevice({ accounts: [SETTINGS_AT_MTP], allBitcoin: true });
    server.offline = true;
    const router = await renderRouter(routes, { initialUrl: "/settings/split" });
    const bar = await screen.findByTestId("split-slider", {}, SLOW);
    // Half in francs: measured, touched in the middle, let go.
    await fireEvent(bar, "layout", {
      nativeEvent: { layout: { x: 0, y: 0, width: 200, height: 96 } }
    });
    await fireEvent(bar, "responderGrant", { nativeEvent: { pageX: 100, locationX: 100 } });
    await fireEvent(bar, "responderRelease", { nativeEvent: { pageX: 100, locationX: 100 } });
    await fireEvent.press(screen.getByTestId("split-continue"));
    await waitFor(() => expect(router.getPathname()).toBe("/settings/bank"));

    expect(await screen.findByTestId("sell-retry", {}, SLOW)).toBeTruthy();
    expect(screen.queryByTestId("bank-account-current")).toBeNull();
    expect(screen.queryByTestId("bank-submit")).toBeNull();
  });
});

describe('"Bank account" without Mt Pelerin', () => {
  it("asks for the Mt Pelerin login first: no form, nothing asked of Mt Pelerin", async () => {
    const { server } = await ownerDevice({ connected: false });
    const router = await openBank();

    // The bank account is Mt Pelerin's: its login first.
    expect(await screen.findByTestId("mtpelerin-intro", {}, SLOW)).toBeTruthy();
    expect(screen.getByTestId("mtpelerin-create")).toBeTruthy();
    expect(screen.queryByTestId("bank-iban")).toBeNull();
    expect(screen.queryByTestId("bank-submit")).toBeNull();
    expect(router.getPathname()).toBe("/settings/bank");
    expect(server.requests).toEqual([]);
    expect(settingsAccount()).toBe(SETTINGS_ACCOUNT_ID);
  });
});
