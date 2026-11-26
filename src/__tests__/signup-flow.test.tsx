import "@/i18n";

import { router as appRouter } from "expo-router";
import { act, fireEvent, renderRouter, screen, waitFor } from "expo-router/testing-library";
import { StyleSheet } from "react-native";

import WelcomeScreen from "@/app/index";
import BankScreen from "@/app/onboarding/bank";
import CardScreen from "@/app/onboarding/card";
import OnboardingLayout from "@/app/onboarding/_layout";
import SetupScreen from "@/app/onboarding/setup";
import SplitScreen from "@/app/onboarding/split";
import PendingScreen from "@/app/pending";
import { PasskeyError } from "@/lib/breez/errors";
import { createPasskeyWallet } from "@/lib/breez/passkey";
import { disconnectWallet, getWalletLightningAddress } from "@/lib/breez/wallet";
import { loadTerminalProfile } from "@/lib/terminal/profile";
import { closeAccount, getAccountSettings, updateAccount } from "@/features/account/session";
import { bitcoinFeeWaived } from "@/features/onboarding/SplitFees";
import { DEFAULT_RELAYS as BACKUP_RELAYS } from "@/config/relays";
import * as store from "@/lib/settings/store";
import { loadMerchantSettings } from "@/lib/settings/store";

import { openTestAccount, testBackupKey } from "../../jest/account";
import type * as FileSystemFake from "../../jest/expo-file-system";
import type * as NfcFake from "../../jest/nfc-manager";
import type * as RelaysFake from "../../jest/nostr-relays";
import type * as MtPelerinFake from "../../jest/mtpelerin";

// Account creation succeeds: its passkey and wallet steps are covered by account-flow.test.tsx.
jest.mock("../lib/breez/passkey", () => ({
  createPasskeyWallet: jest.fn(async () => ({
    seed: { tag: "Mnemonic", inner: { mnemonic: "test seed", passphrase: undefined } },
    credentialId: null
  })),
  preparePasskeys: jest.fn(async () => undefined),
  passkeysReady: jest.fn(() => true)
}));
// The public key of the private key 2, a well-known test value.
const WALLET = "02c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5";
jest.mock("../lib/breez/wallet", () => ({
  checkWalletConfig: jest.fn(),
  connectWallet: jest.fn(async () => ({})),
  disconnectWallet: jest.fn(async () => undefined),
  getWalletId: jest.fn(async () => WALLET),
  getWalletLightningAddress: jest.fn(async () => "sattleme02c6047f94@breez.tips"),
  newDepositAddress: jest.fn(),
  // The account's id, without connecting its wallet (the connected wallet's, getWalletId).
  walletIdOf: jest.fn(async () => WALLET)
}));

// A device without NFC, as an iPad, unless a test gives it NFC (useReadsCards.ts): "Manage my
// BoltCard" creates an account on a device that programs cards only (BoltCardAppSheet.tsx).
// eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories are synchronous
jest.mock("react-native-nfc-manager", () => require("../../jest/nfc-manager"));
const nfc = jest.requireMock<typeof NfcFake>("react-native-nfc-manager");
beforeEach(() => {
  nfc.resetNfcManager();
  nfc.removeNfc();
});

// The in-memory expo-file-system and Nostr relays of jest.setup.ts.
const fileSystem = jest.requireMock<typeof FileSystemFake>("expo-file-system");
const relays = jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");
// Mt Pelerin under Jest (jest/mtpelerin.ts): the staging app's, its dev/test environment.
const mtPelerinFake = jest.requireMock<typeof MtPelerinFake>("@/lib/mtpelerin/transport");

const SLOW = { timeout: 5000 };

// The device is mocked as en-CH / CHF in jest.setup.ts.
const routes = {
  index: WelcomeScreen,
  pending: PendingScreen,
  // The point of sale itself is covered by pos-flow.test.tsx: here, where the sign-up leads.
  "pos/index": PendingScreen,
  "onboarding/_layout": OnboardingLayout,
  "onboarding/split": SplitScreen,
  "onboarding/bank": BankScreen,
  "onboarding/card": CardScreen,
  "onboarding/setup": SetupScreen
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function isDisabled(testID: string): boolean {
  return screen.getByTestId(testID).props.accessibilityState?.disabled === true;
}

/**
 * The dots of the step header, as their accessibility value. Their view is not an accessibility
 * element (getByRole does not see it); the waiting indicator, also a progress bar, has no value.
 */
function stepDots() {
  return screen.container
    .queryAll(
      (node) =>
        typeof node.type === "string" &&
        node.props.accessibilityRole === "progressbar" &&
        node.props.accessibilityValue !== undefined
    )
    .map((node) => node.props.accessibilityValue);
}

/** Drags the split bar to this bitcoin share: the bar is measured, touched at that point, let go. */
async function setSplit(bitcoinPercent: number) {
  const bar = screen.getByTestId("split-slider");
  await fireEvent(bar, "layout", {
    nativeEvent: { layout: { x: 0, y: 0, width: 200, height: 96 } }
  });
  const x = bitcoinPercent * 2;
  await fireEvent(bar, "responderGrant", { nativeEvent: { pageX: x, locationX: x } });
  await fireEvent(bar, "responderRelease", { nativeEvent: { pageX: x, locationX: x } });
}

/** The split step of a sign-up that stopped there: its saved step resumes there. */
async function resumeAtSplit(patch: Parameters<typeof openTestAccount>[0] = {}) {
  await openTestAccount({ usage: "merchant", signUp: "split", ...patch });
  return renderRouter(routes, { initialUrl: "/onboarding/split" });
}

/**
 * The bank step's Mt Pelerin login (bank.tsx), as under Jest: the staging app's, Mt Pelerin's
 * dev/test environment, its login by the account's key, then the profile's e-mail and number
 * (fictitious). The production app's, by SMS: signup-mtpelerin.test.tsx.
 */
async function connectMtPelerin() {
  await fireEvent.press(await screen.findByTestId("mtpelerin-create", {}, SLOW));
  await fireEvent.changeText(
    await screen.findByTestId("sell-email", {}, SLOW),
    "bakery@example.com"
  );
  await fireEvent.changeText(screen.getByTestId("sell-profile-phone"), "79 000 00 00");
  await fireEvent.press(screen.getByTestId("sell-save-profile"));
  await screen.findByTestId("mtpelerin-connected", {}, SLOW);
}

/** The split's "Continue" with a fiat share, then the Mt Pelerin login: the bank details. */
async function continueToBankDetails() {
  await fireEvent.press(screen.getByTestId("split-continue"));
  await connectMtPelerin();
}

/** What screen readers say of the split bar. */
function splitValue(): string {
  return screen.getByTestId("split-slider").props.accessibilityValue.text;
}

type JsonNode = { props: Record<string, unknown>; children: (JsonNode | string)[] | null };

/** The testIDs of the bank step, in screen order. */
function bankFieldsInOrder(): string[] {
  const ids: string[] = [];
  const visit = (node: JsonNode | string) => {
    if (typeof node === "string") return;
    const id = node.props.testID;
    // The holder's control by its group alone (its segments, measures and thumb inside it).
    if (typeof id === "string" && /^(bank|add)-/.test(id) && !/^bank-holder-(?!group$)/.test(id)) {
      ids.push(id);
    }
    node.children?.forEach(visit);
  };
  const tree = screen.toJSON() as JsonNode | JsonNode[] | null;
  (Array.isArray(tree) ? tree : tree ? [tree] : []).forEach(visit);
  return ids;
}

/** The settings saved on the device, without their date. */
async function savedSettings() {
  const settings = await loadMerchantSettings(WALLET);
  if (!settings) return null;
  const { updatedAt, ...rest } = settings;
  expect(updatedAt).toBeGreaterThan(0);
  return rest;
}

/** The newest backup event of each relay, by date. */
function backupDates(): number[] {
  return BACKUP_RELAYS.map((relay) =>
    Math.max(...(relays.stored.get(relay) ?? []).map((event) => event.created_at))
  );
}

describe("sign-up flow", () => {
  beforeEach(async () => {
    fileSystem.resetFileSystem();
    relays.resetRelays();
    closeAccount();
  });

  it("shows the welcome screen in the device language", async () => {
    await renderRouter(routes, { initialUrl: "/" });

    expect(screen.getByText("Create my account")).toBeTruthy();
    expect(screen.getByText("Log in")).toBeTruthy();
    expect(screen.getByText("Point of sale, invoices and NFC cards.")).toBeTruthy();
  });

  it("shows the build info, Breez SDK status included, to testers on the pending screen", async () => {
    await renderRouter(routes, { initialUrl: "/pending" });

    expect(screen.getByText("Coming soon")).toBeTruthy();
    expect(screen.getByText("Breez SDK")).toBeTruthy();
    // Its values are covered by breez-status.test.ts: Jest's app config sets no Breez network.
    expect(screen.getByText(/^(loaded \(\w+\)|unavailable: .+)$/)).toBeTruthy();
  });

  it('goes from "Create my account" straight to the split, then to the point of sale all in bitcoin', async () => {
    const router = await renderRouter(routes, { initialUrl: "/" });
    // RNTL 14 renders asynchronously; the router helpers live on the returned promise.

    // No usage step: the welcome screen's button is a merchant's.
    await fireEvent.press(screen.getByTestId("create-account"));
    await waitFor(() => expect(router.getPathname()).toBe("/onboarding/split"));

    expect(screen.getByText("How do you want to be paid?")).toBeTruthy();
    await expect(savedSettings()).resolves.toMatchObject({ usage: "merchant", signUp: "split" });
    // The split is the path's first step: "back" leads to the welcome screen.
    expect(appRouter.canGoBack()).toBe(true);
    // 100 % bitcoin by default: no bank details, the sign-up ends here.
    expect(screen.getByTestId("split-continue")).toHaveTextContent("Start accepting payments");
    await fireEvent.press(screen.getByTestId("split-continue"));

    await waitFor(() => expect(router.getPathname()).toBe("/pos"));
    await expect(savedSettings()).resolves.toMatchObject({
      usage: "merchant",
      signUp: "done",
      bitcoinPercent: 100,
      payoutCurrency: "CHF",
      displayCurrency: "CHF",
      payoutAccountId: null
    });
  });

  it("leads the split's back button to the welcome screen", async () => {
    const router = await renderRouter(routes, { initialUrl: "/" });
    await fireEvent.press(screen.getByTestId("create-account"));
    await waitFor(() => expect(router.getPathname()).toBe("/onboarding/split"));

    await fireEvent.press(screen.getByRole("button", { name: "Back" }));

    expect(router.getPathname()).toBe("/");
    expect(screen.getByText("Create my account")).toBeTruthy();
  });

  it("shows the split of a sign-up that stopped there, then Mt Pelerin and the bank details when fiat is chosen", async () => {
    const router = await resumeAtSplit();

    // 100 % bitcoin by default: the account is complete.
    expect(screen.getByText("Start accepting payments")).toBeTruthy();
    expect(splitValue()).toBe("100% in bitcoin, 0% in Swiss francs");
    // Swiss format of the device locale. The bitcoin fee
    // waived until the end of 2026 (split-fees.test.tsx), Mt Pelerin's range on the share sold.
    expect(screen.getByTestId("sattle-fee")).toHaveTextContent(
      bitcoinFeeWaived()
        ? /On everything you take in, converted or notFree until 31 December 20261%0%$/
        : /On everything you take in, converted or not1%$/
    );
    expect(screen.getByTestId("conversion-fee")).toHaveTextContent(
      /^Conversion to Swiss francs.*\+ 0\.5% to 1\.3%/
    );

    await setSplit(50);
    expect(splitValue()).toBe("50% in bitcoin, 50% in Swiss francs");
    expect(screen.getByText("Continue")).toBeTruthy();
    expect(screen.getByTestId("split-currency")).toHaveTextContent(/CHF/);

    await fireEvent.press(screen.getByTestId("split-continue"));
    expect(router.getPathname()).toBe("/onboarding/bank");
    expect(screen.getByText("Swiss francs")).toBeTruthy();
    // Mt Pelerin before the bank details (signup-mtpelerin.test.tsx): no field until logged in.
    expect(await screen.findByTestId("mtpelerin-intro", {}, SLOW)).toBeTruthy();
    expect(screen.queryByTestId("bank-iban")).toBeNull();
    await connectMtPelerin();
    // Country prefilled from the device region.
    expect(screen.getByText("Switzerland")).toBeTruthy();
  });

  it("keeps one header above the steps, whose dots follow the step", async () => {
    await openTestAccount({ usage: "merchant", signUp: "split" });
    const router = await renderRouter(routes, { initialUrl: "/onboarding/split" });
    const back = screen.getByRole("button", { name: "Back" });
    // The merchant path all in bitcoin: the split alone.
    expect(stepDots()).toEqual([{ min: 1, max: 1, now: 1 }]);
    // From 1 % in fiat, the bank details join the path.
    await setSplit(50);
    expect(stepDots()).toEqual([{ min: 1, max: 2, now: 1 }]);
    await fireEvent.press(screen.getByTestId("split-continue"));
    await waitFor(() => expect(router.getPathname()).toBe("/onboarding/bank"));

    // The split stays mounted under the bank details (hidden from accessibility), without a header
    // of its own: the one header is the same element as on the first step.
    const all = { includeHiddenElements: true };
    expect(screen.getByTestId("split-slider", all)).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Back", ...all })).toEqual([back]);
    expect(stepDots()).toEqual([{ min: 1, max: 2, now: 2 }]);

    await fireEvent.press(back);
    expect(router.getPathname()).toBe("/onboarding/split");
    expect(stepDots()).toEqual([{ min: 1, max: 2, now: 1 }]);
  });

  it("keeps the merchant's dot from the split to the setup screen, whose back leads to the split", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const wallet = jest.requireMock<{ getWalletLightningAddress: jest.Mock }>(
      "../lib/breez/wallet"
    );
    wallet.getWalletLightningAddress.mockRejectedValueOnce(new Error("Offline"));
    try {
      const router = await renderRouter(routes, { initialUrl: "/" });
      await fireEvent.press(screen.getByTestId("create-account"));
      await waitFor(() => expect(router.getPathname()).toBe("/onboarding/split"));
      const back = screen.getByRole("button", { name: "Back" });
      expect(stepDots()).toEqual([{ min: 1, max: 1, now: 1 }]);

      await fireEvent.press(screen.getByTestId("split-continue"));
      await waitFor(() => expect(screen.getByTestId("account-setup-failure")).toBeTruthy());
      expect(router.getPathname()).toBe("/onboarding/setup");
      expect(stepDots()).toEqual([{ min: 1, max: 1, now: 1 }]);

      // Its preparation failed: "back" leads to the split, which finishes again.
      await fireEvent.press(back);
      expect(router.getPathname()).toBe("/onboarding/split");
      await fireEvent.press(screen.getByTestId("split-continue"));
      await waitFor(() => expect(router.getPathname()).toBe("/pos"));
      await expect(savedSettings()).resolves.toMatchObject({ signUp: "done", bitcoinPercent: 100 });
    } finally {
      warn.mockRestore();
    }
  });

  it("resumes a sign-up created before the usage step was taken out on the split", async () => {
    // Saved at "usage", nothing chosen yet (an account of an earlier version). Its login leads
    // where accountRoutes says (onboarding-steps.test.ts), as the setup screen does here.
    await openTestAccount();
    await expect(savedSettings()).resolves.toMatchObject({ signUp: "usage", usage: null });
    const router = await renderRouter(routes, { initialUrl: "/onboarding/setup" });

    await waitFor(() => expect(router.getPathname()).toBe("/onboarding/split"));
    await fireEvent.press(screen.getByTestId("split-continue"));
    await waitFor(() => expect(router.getPathname()).toBe("/pos"));
    await expect(savedSettings()).resolves.toMatchObject({ usage: "merchant", signUp: "done" });
  });

  it("sends the header's back button to the welcome screen when there is no history", async () => {
    await openTestAccount({ usage: "card", signUp: "card" });
    const router = await renderRouter(routes, { initialUrl: "/onboarding/card" });
    expect(stepDots()).toEqual([{ min: 1, max: 1, now: 1 }]);

    await fireEvent.press(screen.getByRole("button", { name: "Back" }));
    expect(router.getPathname()).toBe("/");
  });

  it("only enables the bank step once the details are complete and the IBAN is valid", async () => {
    await resumeAtSplit();
    await setSplit(0);
    await continueToBankDetails();

    expect(isDisabled("bank-submit")).toBe(true);

    await fireEvent.changeText(screen.getByTestId("bank-iban"), "CH94 0076 2011 6238 5295 7");
    await fireEvent(screen.getByTestId("bank-iban"), "blur");
    expect(screen.getByText("Check the IBAN")).toBeTruthy();

    await fireEvent.changeText(screen.getByTestId("bank-iban"), "ch9300762011623852957");
    expect(screen.queryByText("Check the IBAN")).toBeNull();
    await fireEvent.changeText(screen.getByTestId("bank-address"), "1 Town Street");
    await fireEvent.changeText(screen.getByTestId("bank-postal-code"), "1003");
    await fireEvent.changeText(screen.getByTestId("bank-city"), "Lausanne");
    // Who holds the account, always asked: a company, its name; a person, both names.
    expect(isDisabled("bank-submit")).toBe(true);
    await fireEvent.press(screen.getByTestId("bank-holder-company"));
    expect(isDisabled("bank-submit")).toBe(true);
    await fireEvent.changeText(screen.getByTestId("bank-company"), "Fine Bakery LLC");
    expect(isDisabled("bank-submit")).toBe(false);
    await fireEvent.press(screen.getByTestId("bank-holder-person"));
    await fireEvent.changeText(screen.getByTestId("bank-firstname"), "Carol");
    expect(isDisabled("bank-submit")).toBe(true);
    await fireEvent.changeText(screen.getByTestId("bank-lastname"), "Smith");
    expect(isDisabled("bank-submit")).toBe(false);
    // Back to the company: its name kept.
    await fireEvent.press(screen.getByTestId("bank-holder-company"));
    expect(screen.getByTestId("bank-company").props.value).toBe("Fine Bakery LLC");
  });

  it("lays the bank details out: what Mt Pelerin registers, the country below the city", async () => {
    await resumeAtSplit();
    await setSplit(0);
    await continueToBankDetails();

    // No address complement nor transfer reference: Mt Pelerin takes neither.
    expect(bankFieldsInOrder()).toEqual([
      "bank-holder-group",
      "bank-iban",
      "bank-address",
      "bank-postal-code",
      "bank-city",
      "bank-country",
      "bank-submit"
    ]);
  });

  it("saves the split and the bank account's Mt Pelerin id for the wallet, then opens the point of sale", async () => {
    const router = await resumeAtSplit();
    await setSplit(50);
    await continueToBankDetails();

    // Clearly fake details: the IBAN is the example of the Swiss IBAN documentation.
    await fireEvent.changeText(screen.getByTestId("bank-iban"), "ch93 0076 2011 6238 5295 7");
    await fireEvent.press(screen.getByTestId("bank-holder-company"));
    await fireEvent.changeText(screen.getByTestId("bank-company"), " Fine Bakery LLC ");
    await fireEvent.changeText(screen.getByTestId("bank-address"), "1 Town Street");
    await fireEvent.changeText(screen.getByTestId("bank-postal-code"), "1003");
    await fireEvent.changeText(screen.getByTestId("bank-city"), "Lausanne");
    await fireEvent.press(screen.getByTestId("bank-submit"));

    await waitFor(() => expect(router.getPathname()).toBe("/pos"));
    await expect(savedSettings()).resolves.toEqual({
      version: 18,
      recoveryCheck: { verifiedAt: null, dueSince: null },
      bitcoinNode: null,
      productLookup: true,
      splitSince: expect.any(Number),
      legacyTransfers: [],
      businessAddress: null,
      companyNumber: "",
      vatNumber: "",
      vatRate: null,
      onchainTolerance: 0,
      formerAddressMetadata: [],
      signUp: "done",
      businessName: "Merchant 9EE5",
      usage: "merchant",
      bitcoinPercent: 50,
      payoutCurrency: "CHF",
      displayCurrency: "CHF",
      detectedCountry: "CH",
      // Mt Pelerin's id of the account registered there: its details stay Mt Pelerin's.
      payoutAccountId: mtPelerinFake
        .testMtPelerin()
        .accountsOfUser()
        .find((account) => account.iban === "CH9300762011623852957")?.id,
      onchainPayments: true,
      relays: [...BACKUP_RELAYS],
      devices: [],
      logo: null
    });
  });

  it("takes any country of residence, one without IBANs included, with the IBAN", async () => {
    const router = await resumeAtSplit();
    await setSplit(0);
    await continueToBankDetails();

    // The picker is titled like the field that opens it.
    await fireEvent.press(screen.getByTestId("bank-country"));
    expect(screen.getByRole("header", { name: "Country of residence" })).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId("country-search"), "united states");
    await fireEvent.press(screen.getByText("United States of America"));
    // The sheet slides out, then the field shows the country.
    await waitFor(() => expect(screen.queryByTestId("country-search")).toBeNull());
    expect(screen.getByText("United States of America")).toBeTruthy();

    // Opened again, the picker starts with an empty search.
    await fireEvent.press(screen.getByTestId("bank-country"));
    expect(screen.getByTestId("country-search").props.value).toBe("");
    await fireEvent.press(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByTestId("country-search")).toBeNull());

    // Clearly fake details: an account in Switzerland (the IBAN of the Swiss documentation).
    await fireEvent.changeText(screen.getByTestId("bank-iban"), "CH93 0076 2011 6238 5295 7");
    await fireEvent.press(screen.getByTestId("bank-holder-person"));
    await fireEvent.changeText(screen.getByTestId("bank-firstname"), " Jane ");
    await fireEvent.changeText(screen.getByTestId("bank-lastname"), "Example");
    await fireEvent.changeText(screen.getByTestId("bank-address"), "1 Main Street");
    // No address complement nor transfer reference: Mt Pelerin takes neither.
    expect(screen.queryByTestId("add-address-complement")).toBeNull();
    expect(screen.queryByTestId("add-transfer-reference")).toBeNull();
    await fireEvent.changeText(screen.getByTestId("bank-postal-code"), "10001");
    await fireEvent.changeText(screen.getByTestId("bank-city"), "New York");
    expect(isDisabled("bank-submit")).toBe(false);
    await fireEvent.press(screen.getByTestId("bank-submit"));

    await waitFor(() => expect(router.getPathname()).toBe("/pos"));
    // Registered at Mt Pelerin (its holder trimmed, its country of residence); the settings, on
    // the device as on the relays, keep only its id there.
    const [registered] = mtPelerinFake
      .testMtPelerin()
      .accountsOfUser()
      .filter((account) => account.type === "external");
    expect(registered).toMatchObject({
      iban: "CH9300762011623852957",
      owner_firstname: "Jane",
      owner_lastname: "Example",
      owner_street: "1 Main Street",
      owner_country: "US",
      currency: "CHF"
    });
    const settings = await loadMerchantSettings(WALLET);
    expect(settings?.payoutAccountId).toBe(registered?.id);
    expect(settings).not.toHaveProperty("bank");
    expect(JSON.stringify(settings)).not.toMatch(/CH93|Jane|Main Street/);
  });

  it("changes the payout currency from the split bar's tag, and saves it", async () => {
    const router = await resumeAtSplit();

    // Detected from the time zone (en-CH device): Swiss francs.
    expect(screen.getByTestId("split-currency")).toHaveTextContent(/CHF/);
    await fireEvent.press(screen.getByTestId("split-currency"));
    expect(screen.getByText("Payout currency")).toBeTruthy();
    // Every payout currency, the current one checked.
    expect(screen.getAllByRole("radio")).toHaveLength(18);
    expect(screen.getByTestId("currency-CHF").props.accessibilityState).toEqual({ checked: true });
    await fireEvent.press(screen.getByTestId("currency-EUR"));
    await waitFor(() => expect(screen.queryByTestId("currency-picker")).toBeNull());

    expect(screen.getByTestId("split-currency")).toHaveTextContent(/EUR/);
    expect(screen.getByTestId("split-currency").props.accessibilityLabel).toBe(
      "Payout currency: Euros"
    );
    expect(screen.getByTestId("conversion-fee")).toHaveTextContent(
      /^Conversion to euros.*0\.5% to 1\.3%/
    );

    await setSplit(70);
    expect(splitValue()).toBe("70% in bitcoin, 30% in euros");
    await fireEvent.press(screen.getByTestId("split-continue"));
    await waitFor(() => expect(router.getPathname()).toBe("/onboarding/bank"));
    expect(screen.getByText("euros")).toBeTruthy();
    // Saved with the split.
    await expect(loadMerchantSettings(WALLET)).resolves.toMatchObject({
      signUp: "bank",
      bitcoinPercent: 70,
      payoutCurrency: "EUR",
      displayCurrency: "EUR"
    });

    // Back to 100 % bitcoin: the picked currency is kept and saved.
    await fireEvent.press(screen.getByLabelText("Back"));
    await setSplit(100);
    await fireEvent.press(screen.getByTestId("split-continue"));
    await waitFor(() => expect(router.getPathname()).toBe("/pos"));
    await expect(loadMerchantSettings(WALLET)).resolves.toMatchObject({
      bitcoinPercent: 100,
      payoutCurrency: "EUR",
      displayCurrency: "EUR",
      payoutAccountId: null
    });
  });

  it("saves the merchant's account all in bitcoin from the split, without bank details", async () => {
    // As "Create my account" leaves it (account-flow.test.tsx), with the test account's keys.
    const router = await resumeAtSplit();
    await fireEvent.press(screen.getByTestId("split-continue"));

    await waitFor(() => expect(router.getPathname()).toBe("/pos"));
    await expect(savedSettings()).resolves.toEqual({
      version: 18,
      recoveryCheck: { verifiedAt: null, dueSince: null },
      bitcoinNode: null,
      productLookup: true,
      splitSince: expect.any(Number),
      legacyTransfers: [],
      businessAddress: null,
      companyNumber: "",
      vatNumber: "",
      vatRate: null,
      onchainTolerance: 0,
      formerAddressMetadata: [],
      signUp: "done",
      businessName: "Merchant 9EE5",
      usage: "merchant",
      bitcoinPercent: 100,
      payoutCurrency: "CHF",
      displayCurrency: "CHF",
      detectedCountry: "CH",
      payoutAccountId: null,
      onchainPayments: true,
      relays: [...BACKUP_RELAYS],
      devices: [],
      logo: null
    });
    // This device can now take payments without a passkey.
    await expect(loadTerminalProfile()).resolves.toEqual({
      version: 2,
      walletId: WALLET,
      backupKey: testBackupKey(),
      lightningAddress: "sattleme02c6047f94@breez.tips",
      businessName: "Merchant 9EE5",
      currency: "CHF"
    });
    // Its Lightning address registered, the wallet goes: the point of sale never needs its keys.
    const disconnect = jest.mocked(disconnectWallet);
    expect(disconnect).toHaveBeenCalled();
    expect(disconnect.mock.invocationCallOrder.at(-1)).toBeGreaterThan(
      jest.mocked(getWalletLightningAddress).mock.invocationCallOrder.at(-1) ?? Infinity
    );
  });

  it("finishes again without the wallet once this device's point of sale is prepared", async () => {
    await openTestAccount({ usage: "merchant", signUp: "split" });
    const router = await renderRouter(routes, { initialUrl: "/onboarding/split" });
    await fireEvent.press(screen.getByTestId("split-continue"));
    await waitFor(() => expect(router.getPathname()).toBe("/pos"));
    const lookups = jest.mocked(getWalletLightningAddress).mock.calls.length;

    // The step shown again (left while the point of sale was prepared): the wallet is gone with
    // that preparation, the point of sale is ready all the same.
    await act(() => appRouter.push("/onboarding/split"));
    await waitFor(() => expect(router.getPathname()).toBe("/onboarding/split"));
    await fireEvent.press(screen.getByTestId("split-continue"));

    await waitFor(() => expect(router.getPathname()).toBe("/pos"));
    expect(jest.mocked(getWalletLightningAddress).mock.calls.length).toBe(lookups);
  });

  it("follows another currency chosen then, still without the wallet", async () => {
    await openTestAccount({ usage: "merchant", signUp: "split" });
    const router = await renderRouter(routes, { initialUrl: "/onboarding/split" });
    await fireEvent.press(screen.getByTestId("split-continue"));
    await waitFor(() => expect(router.getPathname()).toBe("/pos"));
    const lookups = jest.mocked(getWalletLightningAddress).mock.calls.length;

    await act(() => appRouter.push("/onboarding/split"));
    await waitFor(() => expect(router.getPathname()).toBe("/onboarding/split"));
    await fireEvent.press(screen.getByTestId("split-currency"));
    await fireEvent.press(screen.getByTestId("currency-EUR"));
    await waitFor(() => expect(screen.queryByTestId("currency-picker")).toBeNull());
    await fireEvent.press(screen.getByTestId("split-continue"));

    await waitFor(() => expect(router.getPathname()).toBe("/pos"));
    expect(jest.mocked(getWalletLightningAddress).mock.calls.length).toBe(lookups);
    await expect(loadTerminalProfile()).resolves.toMatchObject({
      walletId: WALLET,
      backupKey: testBackupKey(),
      lightningAddress: "sattleme02c6047f94@breez.tips",
      currency: "EUR"
    });
  });

  it("shows the setup screen while the point of sale is prepared, then opens it", async () => {
    const wallet = jest.requireMock<{ getWalletLightningAddress: jest.Mock }>(
      "../lib/breez/wallet"
    );
    let registered!: (address: string) => void;
    wallet.getWalletLightningAddress.mockImplementationOnce(
      () => new Promise<string>((resolve) => (registered = resolve))
    );
    await openTestAccount({ usage: "merchant", signUp: "split" });
    const router = await renderRouter(routes, { initialUrl: "/onboarding/split" });

    await fireEvent.press(screen.getByTestId("split-continue"));

    // At once, before the point of sale is ready: the settings saved, the setup screen says why
    // the merchant waits, and cannot be left meanwhile.
    await waitFor(() => expect(router.getPathname()).toBe("/onboarding/setup"));
    // Decorative, hidden from screen readers: the screen says in words what it waits for.
    expect(
      screen.getByTestId("account-setup-spinner", { includeHiddenElements: true })
    ).toBeTruthy();
    expect(screen.getByText("Setting up your account…")).toBeTruthy();
    expect(
      screen.getByText(
        "Preparing your Lightning address and your point of sale. This may take a few moments."
      )
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Back" })).toBeDisabled();
    await expect(savedSettings()).resolves.toMatchObject({ signUp: "done" });
    await expect(loadTerminalProfile()).resolves.toBeNull();

    await act(async () => registered("sattleme02c6047f94@breez.tips"));

    await waitFor(() => expect(router.getPathname()).toBe("/pos"));
    await expect(loadTerminalProfile()).resolves.toMatchObject({
      walletId: WALLET,
      lightningAddress: "sattleme02c6047f94@breez.tips"
    });
    // The point of sale replaced the whole history: "back" leads into the steps no more.
    expect(appRouter.canGoBack()).toBe(false);
  });

  it("says so on the setup screen when the point of sale cannot be prepared", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const wallet = jest.requireMock<{ getWalletLightningAddress: jest.Mock }>(
      "../lib/breez/wallet"
    );
    wallet.getWalletLightningAddress.mockRejectedValueOnce(new Error("Offline"));
    try {
      await openTestAccount({ usage: "merchant", signUp: "split" });
      const router = await renderRouter(routes, { initialUrl: "/onboarding/split" });

      await fireEvent.press(screen.getByTestId("split-continue"));
      await waitFor(() => expect(screen.getByTestId("account-setup-failure")).toBeTruthy());
      // Centred under its title.
      expect(
        StyleSheet.flatten(
          screen.getByText(
            "Your point of sale could not be prepared. Check your internet connection, then try again."
          ).props.style
        ).textAlign
      ).toBe("center");
      expect(StyleSheet.flatten(screen.getByText("Setup interrupted").props.style).textAlign).toBe(
        "center"
      );
      // The message wraps on a phone: its icon above it, centred, not left at the row's start.
      const failure = StyleSheet.flatten(screen.getByTestId("account-setup-failure").props.style);
      expect(failure.flexDirection).not.toBe("row");
      expect(failure.alignItems).toBe("center");
      expect(
        screen.queryByTestId("account-setup-spinner", { includeHiddenElements: true })
      ).toBeNull();
      expect(router.getPathname()).toBe("/onboarding/setup");
      await expect(loadTerminalProfile()).resolves.toBeNull();

      // "Try again" tries again.
      await fireEvent.press(screen.getByTestId("account-setup-retry"));
      await waitFor(() => expect(router.getPathname()).toBe("/pos"));
      await expect(loadTerminalProfile()).resolves.toMatchObject({ walletId: WALLET });
    } finally {
      warn.mockRestore();
    }
  });

  it("leads back to the last step once the setup failed, which finishes again", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const wallet = jest.requireMock<{ getWalletLightningAddress: jest.Mock }>(
      "../lib/breez/wallet"
    );
    wallet.getWalletLightningAddress.mockRejectedValueOnce(new Error("Offline"));
    try {
      await openTestAccount({ usage: "merchant", signUp: "split" });
      const router = await renderRouter(routes, { initialUrl: "/onboarding/split" });

      await fireEvent.press(screen.getByTestId("split-continue"));
      await waitFor(() => expect(screen.getByTestId("account-setup-failure")).toBeTruthy());
      expect(screen.getByRole("button", { name: "Back" })).toBeEnabled();

      await fireEvent.press(screen.getByRole("button", { name: "Back" }));
      expect(router.getPathname()).toBe("/onboarding/split");
      // The step shows no message: the failure was the setup's.
      expect(screen.queryByTestId("account-setup-failure")).toBeNull();

      await fireEvent.press(screen.getByTestId("split-continue"));
      await waitFor(() => expect(router.getPathname()).toBe("/pos"));
    } finally {
      warn.mockRestore();
    }
  });

  it("leads to the step a sign-up stopped at from the setup screen", async () => {
    await openTestAccount({ usage: "merchant", signUp: "split" });
    const lookups = jest.mocked(getWalletLightningAddress).mock.calls.length;
    const router = await renderRouter(routes, { initialUrl: "/onboarding/setup" });

    await waitFor(() => expect(router.getPathname()).toBe("/onboarding/split"));
    expect(jest.mocked(getWalletLightningAddress).mock.calls.length).toBe(lookups);
    await expect(loadTerminalProfile()).resolves.toBeNull();
  });

  it("stays on the step and says so when the settings cannot be saved", async () => {
    // Failures are logged in development builds.
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    await openTestAccount({ usage: "merchant", signUp: "split" });
    const before = await loadMerchantSettings(WALLET);
    const save = jest
      .spyOn(store, "saveMerchantSettings")
      .mockRejectedValueOnce(new Error("Disk full"));
    try {
      const router = await renderRouter(routes, { initialUrl: "/onboarding/split" });

      await fireEvent.press(screen.getByTestId("split-continue"));

      await waitFor(() =>
        expect(
          screen.getByText("Your settings could not be saved on this device. Try again.")
        ).toBeTruthy()
      );
      expect(router.getPathname()).toBe("/onboarding/split");
      expect(isDisabled("split-continue")).toBe(false);
      await expect(loadMerchantSettings(WALLET)).resolves.toEqual(before);
      expect(getAccountSettings()).toEqual(before);

      // The next tap tries again.
      await fireEvent.press(screen.getByTestId("split-continue"));
      await waitFor(() => expect(router.getPathname()).toBe("/pos"));
      await expect(savedSettings()).resolves.toMatchObject({ signUp: "done" });
    } finally {
      // Even when an expectation fails: the next tests must save and warn for real.
      save.mockRestore();
      warn.mockRestore();
    }
  });

  it("clears a failure once a tap saves nothing, the sign-up being done meanwhile", async () => {
    const failure = "Your settings could not be saved on this device. Try again.";
    // Failures are logged in development builds.
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    await openTestAccount({ usage: "merchant", signUp: "split" });
    const save = jest
      .spyOn(store, "saveMerchantSettings")
      .mockRejectedValueOnce(new Error("Disk full"));
    try {
      const router = await renderRouter(routes, { initialUrl: "/onboarding/split" });
      await setSplit(50);
      await fireEvent.press(screen.getByTestId("split-continue"));
      await waitFor(() => expect(screen.getByText(failure)).toBeTruthy());

      // The sign-up is done meanwhile: this tap saves nothing. (Another device's change would lead
      // where the account stands instead: account-flow.test.tsx.)
      await updateAccount({ signUp: "done", bitcoinPercent: 100 });
      await fireEvent.press(screen.getByTestId("split-continue"));

      await waitFor(() => expect(router.getPathname()).toBe("/onboarding/bank"));
      await fireEvent.press(screen.getByRole("button", { name: "Back" }));
      expect(router.getPathname()).toBe("/onboarding/split");
      expect(screen.queryByText(failure)).toBeNull();
    } finally {
      save.mockRestore();
      warn.mockRestore();
    }
  });

  it("saves each step as it goes, and backs it up on the relays", async () => {
    const router = await renderRouter(routes, { initialUrl: "/" });
    await fireEvent.press(screen.getByTestId("create-account"));
    await waitFor(() => expect(router.getPathname()).toBe("/onboarding/split"));

    // Saved as soon as the account exists, the payout currency and the welcome screen's answer
    // included.
    await expect(savedSettings()).resolves.toEqual({
      version: 18,
      recoveryCheck: { verifiedAt: null, dueSince: null },
      bitcoinNode: null,
      productLookup: true,
      splitSince: expect.any(Number),
      legacyTransfers: [],
      businessAddress: null,
      companyNumber: "",
      vatNumber: "",
      vatRate: null,
      onchainTolerance: 0,
      formerAddressMetadata: [],
      signUp: "split",
      businessName: "Merchant 9EE5",
      usage: "merchant",
      bitcoinPercent: 100,
      payoutCurrency: "CHF",
      displayCurrency: "CHF",
      detectedCountry: "CH",
      payoutAccountId: null,
      onchainPayments: true,
      relays: [...BACKUP_RELAYS],
      devices: [],
      logo: null
    });
    const created = (await loadMerchantSettings(WALLET))?.updatedAt ?? 0;
    await waitFor(() => expect(backupDates()).toEqual(BACKUP_RELAYS.map(() => created)));

    await fireEvent.press(screen.getByTestId("split-continue"));
    await waitFor(() => expect(router.getPathname()).toBe("/pos"));
    await expect(savedSettings()).resolves.toMatchObject({
      usage: "merchant",
      signUp: "done",
      bitcoinPercent: 100,
      payoutAccountId: null
    });

    // Each change is newer than the last, and goes to every relay.
    const latest = (await loadMerchantSettings(WALLET))?.updatedAt ?? 0;
    expect(latest).toBeGreaterThan(created);
    await waitFor(() => expect(backupDates()).toEqual(BACKUP_RELAYS.map(() => latest)));
  });

  it("shows the answers saved at the previous steps when the sign-up resumes", async () => {
    // Euros picked at the split, on a device of Switzerland.
    await openTestAccount({
      usage: "merchant",
      bitcoinPercent: 30,
      payoutCurrency: "EUR",
      displayCurrency: "EUR",
      signUp: "bank"
    });
    const router = await renderRouter(routes, { initialUrl: "/onboarding/bank" });

    expect(router.getPathname()).toBe("/onboarding/bank");
    // The title repeats the fiat share and the currency saved at the split.
    expect(screen.getByText("70%")).toBeTruthy();
    expect(screen.getByText("euros")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByTestId("split-currency")).toHaveTextContent(/EUR/);
  });

  it("shows the default payout currency, and saves it, for a saved one no longer offered", async () => {
    // Valid settings (any ISO 4217 code: payout currencies may be removed from the list later).
    await openTestAccount({
      usage: "merchant",
      payoutCurrency: "XAF",
      displayCurrency: "XAF",
      signUp: "split"
    });
    const router = await renderRouter(routes, { initialUrl: "/onboarding/split" });

    expect(screen.getByTestId("split-currency")).toHaveTextContent(/CHF/);
    await setSplit(50);
    await fireEvent.press(screen.getByTestId("split-continue"));
    await waitFor(() => expect(router.getPathname()).toBe("/onboarding/bank"));
    await expect(loadMerchantSettings(WALLET)).resolves.toMatchObject({
      payoutCurrency: "CHF",
      displayCurrency: "CHF"
    });
  });

  it("starts the bank details empty, none kept by the settings, the IBAN grouped by four", async () => {
    await openTestAccount({ usage: "merchant", bitcoinPercent: 30, signUp: "bank" });
    await renderRouter(routes, { initialUrl: "/onboarding/bank" });
    await connectMtPelerin();

    expect(screen.getByTestId("bank-iban").props.value).toBe("");
    await fireEvent.changeText(screen.getByTestId("bank-iban"), "CH9300762011623852957");
    expect(screen.getByTestId("bank-iban").props.value).toBe("CH93 0076 2011 6238 5295 7");
    expect(isDisabled("bank-submit")).toBe(true);
  });

  it("does not turn a finished sign-up back into an unfinished one on the way back", async () => {
    const router = await renderRouter(routes, { initialUrl: "/" });
    await fireEvent.press(screen.getByTestId("create-account"));
    await waitFor(() => expect(router.getPathname()).toBe("/onboarding/split"));
    await fireEvent.press(screen.getByTestId("split-continue"));
    await waitFor(() => expect(router.getPathname()).toBe("/pos"));
    const done = await loadMerchantSettings(WALLET);

    // The point of sale replaces the steps: no "back" leads into them.
    expect(appRouter.canGoBack()).toBe(false);
    // Reached again all the same (a link on the web), then on to the bank details: nothing is
    // saved until the end.
    await act(async () => appRouter.push("/onboarding/split"));
    await waitFor(() => expect(router.getPathname()).toBe("/onboarding/split"));
    await setSplit(50);
    await fireEvent.press(screen.getByTestId("split-continue"));
    await waitFor(() => expect(router.getPathname()).toBe("/onboarding/bank"));
    await expect(loadMerchantSettings(WALLET)).resolves.toEqual(done);
  });

  it("goes back to the welcome screen without an open account", async () => {
    const router = await renderRouter(routes, { initialUrl: "/onboarding/split" });

    expect(router.getPathname()).toBe("/");
    expect(screen.getByText("Create my account")).toBeTruthy();
  });

  /*
   * "A BoltCard" on the welcome screen: the account is created with the card's usage, straight to
   * the card's pairing; "back" leads to the welcome screen (no usage step).
   */
  describe('"A BoltCard"', () => {
    // A phone that programs cards: elsewhere, no account (boltcard-app-sheet.test.tsx).
    beforeEach(() => nfc.resetNfcManager());

    it("creates a card holder's account, straight to the card's step", async () => {
      const router = await renderRouter(routes, { initialUrl: "/" });

      await fireEvent.press(screen.getByTestId("boltcard-entry"));

      await waitFor(() => expect(router.getPathname()).toBe("/onboarding/card"));
      await expect(savedSettings()).resolves.toMatchObject({ usage: "card", signUp: "card" });
      // The card's steps, to be held to this phone.
      expect(await screen.findByTestId("onboarding-card")).toBeTruthy();
      // The card's path: its pairing alone.
      expect(stepDots()).toEqual([{ min: 1, max: 1, now: 1 }]);
    });

    it("leads the card's back button to the welcome screen", async () => {
      const router = await renderRouter(routes, { initialUrl: "/" });
      await fireEvent.press(screen.getByTestId("boltcard-entry"));
      await waitFor(() => expect(router.getPathname()).toBe("/onboarding/card"));

      await fireEvent.press(screen.getByRole("button", { name: "Back" }));

      expect(router.getPathname()).toBe("/");
      expect(screen.getByText("Create my account")).toBeTruthy();
    });

    it("greys every way in while the passkey is created, then goes on", async () => {
      // The mock's own wallet, given once the prompt is answered.
      const wallet = await createPasskeyWallet();
      const passkey = deferred<typeof wallet>();
      jest.mocked(createPasskeyWallet).mockReturnValueOnce(passkey.promise);
      const router = await renderRouter(routes, { initialUrl: "/" });

      await fireEvent.press(screen.getByTestId("boltcard-entry"));

      expect(screen.getByText("Creating your passkey…")).toBeTruthy();
      for (const id of [
        "create-account",
        "login",
        "join-team",
        "boltcard-entry",
        "migrate-account",
        "advanced-settings"
      ]) {
        expect(isDisabled(id)).toBe(true);
      }
      await act(async () => passkey.resolve(wallet));
      await waitFor(() => expect(router.getPathname()).toBe("/onboarding/card"));
    });

    it('keeps "Create my account" a merchant\'s choice to make, after a BoltCard was tapped', async () => {
      // The BoltCard's prompt dismissed: nothing was created.
      jest
        .mocked(createPasskeyWallet)
        .mockRejectedValueOnce(new PasskeyError("cancelled", "Passkey prompt dismissed"));
      const router = await renderRouter(routes, { initialUrl: "/" });
      await fireEvent.press(screen.getByTestId("boltcard-entry"));
      await waitFor(() => expect(isDisabled("create-account")).toBe(false));
      expect(router.getPathname()).toBe("/");

      await fireEvent.press(screen.getByTestId("create-account"));

      // A merchant's account: the BoltCard's answer was its tap's only.
      await waitFor(() => expect(router.getPathname()).toBe("/onboarding/split"));
      await expect(savedSettings()).resolves.toMatchObject({ usage: "merchant", signUp: "split" });
    });
  });

  it("sends the bank step back to the split when no fiat share is chosen", async () => {
    await openTestAccount();
    const router = await renderRouter(routes, { initialUrl: "/onboarding/bank" });
    // RNTL 14 renders asynchronously; the router helpers live on the returned promise.

    expect(router.getPathname()).toBe("/onboarding/split");
    expect(stepDots()).toEqual([{ min: 1, max: 1, now: 1 }]);
  });
});
