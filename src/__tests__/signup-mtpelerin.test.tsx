import "@/i18n";

import { fireEvent, renderRouter, screen, waitFor } from "expo-router/testing-library";

import WelcomeScreen from "@/app/index";
import BankScreen from "@/app/onboarding/bank";
import OnboardingLayout from "@/app/onboarding/_layout";
import SetupScreen from "@/app/onboarding/setup";
import SplitScreen from "@/app/onboarding/split";
import PendingScreen from "@/app/pending";
import { closeAccount, getAccountSettings } from "@/features/account/session";
import { accountMtpAccess } from "@/features/sell/account-flow";
import { loadMerchantSettings } from "@/lib/settings/store";

import { openTestAccount } from "../../jest/account";
import type * as FileSystemFake from "../../jest/expo-file-system";
import type * as MtPelerinFake from "../../jest/mtpelerin";
import type * as RelaysFake from "../../jest/nostr-relays";

/*
 * The merchant sign-up's bank step with Mt Pelerin (src/app/onboarding/bank.tsx): what Mt Pelerin is for, said before any bank detail; its login in a
 * panel (src/features/onboarding/MtpLoginSheet.tsx), by SMS in the production app, by the
 * account's key in the staging app; then the bank details, registered at Mt Pelerin before the
 * settings are saved. Against the fake Mt Pelerin of the tests (jest/mtpelerin.ts). Fictitious data
 * only: the IBAN is the example of the Swiss IBAN documentation, the numbers are not anyone's.
 */

jest.mock("../lib/breez/passkey", () => ({
  createPasskeyWallet: jest.fn(),
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
  walletIdOf: jest.fn(async () => WALLET)
}));
// The app's variant, the production app's unless a test says otherwise: its Mt Pelerin.
let mockVariant = "production";
jest.mock("../lib/app-info", () => ({
  ...jest.requireActual("../lib/app-info"),
  getAppInfo: () => ({
    variant: mockVariant,
    version: "3.0.0",
    buildNumber: "3000000",
    commit: "f82ecab",
    updates: null
  })
}));

const fileSystem = jest.requireMock<typeof FileSystemFake>("expo-file-system");
const relays = jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");
const fake = jest.requireMock<typeof MtPelerinFake>("@/lib/mtpelerin/transport");

const routes = {
  index: WelcomeScreen,
  pending: PendingScreen,
  "pos/index": PendingScreen,
  "onboarding/_layout": OnboardingLayout,
  "onboarding/split": SplitScreen,
  "onboarding/bank": BankScreen,
  "onboarding/setup": SetupScreen
};

const SLOW = { timeout: 5000 };
/** A fictitious Swiss mobile number, as typed, and as Mt Pelerin gets it (E.164). */
const PHONE_TYPED = "79 000 00 00";
const PHONE = "+41790000000";
const IBAN = "CH9300762011623852957";

/** The bank step of a sign-up at 50 % in francs, from its split. */
async function openBankStep() {
  await openTestAccount({ usage: "merchant", signUp: "split" });
  const router = await renderRouter(routes, { initialUrl: "/onboarding/split" });
  const bar = screen.getByTestId("split-slider");
  await fireEvent(bar, "layout", {
    nativeEvent: { layout: { x: 0, y: 0, width: 200, height: 96 } }
  });
  await fireEvent(bar, "responderGrant", { nativeEvent: { pageX: 100, locationX: 100 } });
  await fireEvent(bar, "responderRelease", { nativeEvent: { pageX: 100, locationX: 100 } });
  await fireEvent.press(screen.getByTestId("split-continue"));
  await waitFor(() => expect(router.getPathname()).toBe("/onboarding/bank"));
  await screen.findByTestId("mtpelerin-intro", {}, SLOW);
  return router;
}

/** The number, then the SMS code (the fake's), in the panel. */
async function logInBySms() {
  await fireEvent.press(screen.getByTestId("mtpelerin-create"));
  await fireEvent.changeText(await screen.findByTestId("sell-phone", {}, SLOW), PHONE_TYPED);
  await fireEvent.press(screen.getByTestId("sell-send-code"));
  await fireEvent.changeText(
    await screen.findByTestId("sell-code", {}, SLOW),
    fake.mtPelerin().smsCode
  );
  await fireEvent.press(screen.getByTestId("sell-submit-code"));
}

/** A new profile's e-mail, then the bank details' form. */
async function giveEmail() {
  await fireEvent.changeText(
    await screen.findByTestId("sell-email", {}, SLOW),
    "bakery@example.com"
  );
  await fireEvent.press(screen.getByTestId("sell-save-profile"));
  await screen.findByTestId("mtpelerin-connected", {}, SLOW);
}

async function fillBankDetails() {
  await fireEvent.press(screen.getByTestId("bank-holder-company"));
  await fireEvent.changeText(screen.getByTestId("bank-company"), "Fine Bakery LLC");
  await fireEvent.changeText(screen.getByTestId("bank-iban"), "CH93 0076 2011 6238 5295 7");
  await fireEvent.changeText(screen.getByTestId("bank-address"), "1 Market Street");
  await fireEvent.changeText(screen.getByTestId("bank-postal-code"), "1003");
  await fireEvent.changeText(screen.getByTestId("bank-city"), "Lausanne");
}

/** The bank accounts of the merchant's profile at Mt Pelerin, raw. */
function bankAccountsAtMtPelerin() {
  return fake
    .mtPelerin()
    .accountsOfUser()
    .filter((account) => account.type === "external");
}

describe("the sign-up's Mt Pelerin before the bank details", () => {
  beforeEach(() => {
    mockVariant = "production";
    fileSystem.resetFileSystem();
    relays.resetRelays();
    closeAccount();
  });

  it("says Mt Pelerin is needed first, logs in by SMS in a panel, then registers the account there", async () => {
    const router = await openBankStep();

    // Before any field: why, and what the login asks; Mt Pelerin named once, as the partner.
    expect(
      screen.getByText(
        "This share is sold to our partner Mt Pelerin, a Swiss financial intermediary, which wires the amount to your bank account."
      )
    ).toBeTruthy();
    expect(screen.getByTestId("mtpelerin-intro")).not.toHaveTextContent(/Mt Pelerin/);
    expect(screen.getByTestId("mtpelerin-intro")).toHaveTextContent(
      /Your mobile number and a code received by SMS, then your e-mail/
    );
    expect(screen.getByTestId("mtpelerin-intro")).toHaveTextContent(/Nothing is sold without you/);
    expect(screen.queryByTestId("bank-iban")).toBeNull();
    expect(screen.queryByTestId("bank-submit")).toBeNull();
    // Its two buttons, then "Powered by" and Mt Pelerin's logo.
    expect(screen.getByTestId("mtpelerin-create")).toHaveTextContent(
      "Create my Mt Pelerin account"
    );
    expect(screen.getByTestId("mtpelerin-existing")).toHaveTextContent(
      "I already have a Mt Pelerin account"
    );
    expect(screen.getByTestId("sell-powered-by")).toHaveTextContent("Powered by");
    expect(screen.getByLabelText("Mt Pelerin")).toBeTruthy();

    await logInBySms();
    expect(screen.getByText("Mt Pelerin account")).toBeTruthy();
    await giveEmail();
    // The panel closed, the form open.
    await waitFor(() => expect(screen.queryByTestId("mtp-login-sheet")).toBeNull(), SLOW);
    expect(fake.mtPelerin().person()).toMatchObject({
      email: "bakery@example.com",
      phone: PHONE
    });

    await fillBankDetails();
    await fireEvent.press(screen.getByTestId("bank-submit"));
    await waitFor(() => expect(router.getPathname()).toBe("/pos"), SLOW);

    // Registered at Mt Pelerin as the merchant's own, in the share's currency.
    expect(bankAccountsAtMtPelerin()).toEqual([
      expect.objectContaining({ iban: IBAN, currency: "CHF", user_is_owner: true })
    ]);
    // Nothing else asked: no Lightning address registered, no 1-sat invoice ("Sell" does).
    expect(fake.mtPelerin().accountsOfUser()).toHaveLength(1);
    expect(fake.mtPelerin().requests.some(({ path }) => path.includes("/ln/"))).toBe(false);
    // The settings keep Mt Pelerin's id of the account, nothing of its details.
    const saved = await loadMerchantSettings(WALLET);
    expect(saved).toMatchObject({
      signUp: "done",
      bitcoinPercent: 50,
      payoutAccountId: fake.mtPelerin().accountsOfUser()[0]?.id
    });
    expect(saved).not.toHaveProperty("bank");
    // The session is the account's: "Sell" finds it logged in.
    const access = accountMtpAccess();
    expect(access).not.toBeNull();
    await expect(access!.sessions.load()).resolves.toMatchObject({
      refreshToken: expect.any(String)
    });
  });

  it("finds a Mt Pelerin profile of that number: no e-mail asked", async () => {
    fake.mtPelerin().seedProfile(PHONE);
    await openBankStep();

    await logInBySms();

    expect(await screen.findByTestId("mtpelerin-connected", {}, SLOW)).toBeTruthy();
    expect(screen.queryByTestId("sell-email")).toBeNull();
  });

  it("changes there the address of the IBAN a Mt Pelerin profile has, or says it could not", async () => {
    const at = {
      type: "external",
      reference: "Fine Bakery LLC",
      iban: IBAN,
      currency: "CHF",
      owner_companyname: "Fine Bakery LLC",
      owner_street: "9 Old Street",
      owner_postcode: "1003",
      owner_city: "Lausanne",
      owner_country: "CH",
      user_is_owner: true,
      status: "active"
    };
    fake.mtPelerin().seedProfile(PHONE);
    const id = fake.mtPelerin().seedAccount(PHONE, at).id as string;
    const router = await openBankStep();
    await logInBySms();
    await screen.findByTestId("mtpelerin-connected", {}, SLOW);
    await fillBankDetails();

    // Refused there: nothing saved, the details typed kept.
    fake.mtPelerin().failNext(`PATCH /accounts/${id}`, 422, { error: { message: "Locked" } });
    await fireEvent.press(screen.getByTestId("bank-submit"));
    expect(
      await screen.findByText(/Mt Pelerin did not change this account/, {}, SLOW)
    ).toBeTruthy();
    expect(router.getPathname()).toBe("/onboarding/bank");
    expect(getAccountSettings()).toMatchObject({ signUp: "bank", payoutAccountId: null });

    await fireEvent.press(screen.getByTestId("bank-submit"));
    await waitFor(() => expect(router.getPathname()).toBe("/pos"), SLOW);
    // The same account, its address the one typed: none created.
    expect(bankAccountsAtMtPelerin()).toHaveLength(1);
    expect(bankAccountsAtMtPelerin()[0]).toMatchObject({ id, owner_street: "1 Market Street" });
  });

  it("goes to the bank details at once once the account is logged in", async () => {
    await openBankStep();
    await logInBySms();
    await giveEmail();

    await fireEvent.press(screen.getByRole("button", { name: "Back" }));
    await fireEvent.press(screen.getByTestId("split-continue"));

    expect(await screen.findByTestId("bank-iban", {}, SLOW)).toBeTruthy();
    expect(screen.queryByTestId("mtpelerin-intro")).toBeNull();
  });

  it("heads its panel after the button pressed, never with the screen's explanation again", async () => {
    await openBankStep();

    await fireEvent.press(screen.getByTestId("mtpelerin-create"));
    const sheet = await screen.findByTestId("mtp-login-sheet", {}, SLOW);
    await screen.findByTestId("sell-phone", {}, SLOW);
    expect(sheet).toHaveTextContent(/Create your account/);
    expect(sheet).toHaveTextContent(
      /With your mobile number, then your e-mail\. An account already opened with this number is reused\./
    );
    // "Sell"'s heading, and its explanation, are not repeated.
    expect(sheet).not.toHaveTextContent(/Sell with Mt Pelerin/);
    expect(sheet).not.toHaveTextContent(/Swiss financial intermediary/);
    await fireEvent.press(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByTestId("sell-phone")).toBeNull(), SLOW);

    await fireEvent.press(screen.getByTestId("mtpelerin-existing"));
    await screen.findByTestId("sell-phone", {}, SLOW);
    expect(screen.getByTestId("mtp-login-sheet")).toHaveTextContent(/Connect your account/);
    expect(screen.getByTestId("mtp-login-sheet")).toHaveTextContent(
      /With your account's mobile number\./
    );
  });

  it('logs in an account Mt Pelerin has by "I already have a Mt Pelerin account", the same login', async () => {
    fake.mtPelerin().seedProfile(PHONE);
    await openBankStep();

    await fireEvent.press(screen.getByTestId("mtpelerin-existing"));
    await fireEvent.changeText(await screen.findByTestId("sell-phone", {}, SLOW), PHONE_TYPED);
    await fireEvent.press(screen.getByTestId("sell-send-code"));
    await fireEvent.changeText(
      await screen.findByTestId("sell-code", {}, SLOW),
      fake.mtPelerin().smsCode
    );
    await fireEvent.press(screen.getByTestId("sell-submit-code"));

    expect(await screen.findByTestId("mtpelerin-connected", {}, SLOW)).toBeTruthy();
    expect(screen.queryByTestId("sell-email")).toBeNull();
  });

  it("keeps the explanation when the panel is closed without logging in", async () => {
    const router = await openBankStep();
    await fireEvent.press(screen.getByTestId("mtpelerin-create"));
    await screen.findByTestId("sell-phone", {}, SLOW);

    await fireEvent.press(screen.getByRole("button", { name: "Close" }));

    await waitFor(() => expect(screen.queryByTestId("sell-phone")).toBeNull(), SLOW);
    expect(screen.getByTestId("mtpelerin-intro")).toBeTruthy();
    expect(router.getPathname()).toBe("/onboarding/bank");
  });

  it("refuses an IBAN another Mt Pelerin profile has, on its field, and saves nothing", async () => {
    fake.mtPelerin().seedOtherProfileAccount({
      type: "external",
      reference: "Account",
      iban: IBAN,
      currency: "CHF",
      owner_firstname: "Alice",
      owner_lastname: "Example",
      owner_street: "1 Example Street",
      owner_postcode: "1000",
      owner_city: "Lausanne",
      owner_country: "CH",
      status: "active"
    });
    const router = await openBankStep();
    await logInBySms();
    await giveEmail();
    await fillBankDetails();

    await fireEvent.press(screen.getByTestId("bank-submit"));

    expect(
      await screen.findByText(
        "This IBAN is already registered on another Mt Pelerin account",
        {},
        SLOW
      )
    ).toBeTruthy();
    expect(router.getPathname()).toBe("/onboarding/bank");
    expect(getAccountSettings()).toMatchObject({ signUp: "bank", payoutAccountId: null });
  });

  it("saves nothing while Mt Pelerin does not answer, then tries again", async () => {
    const router = await openBankStep();
    await logInBySms();
    await giveEmail();
    await fillBankDetails();
    fake.mtPelerin().offline = true;

    await fireEvent.press(screen.getByTestId("bank-submit"));

    expect(
      await screen.findByText(
        "The sale service is not answering. Check your internet connection, then try again",
        {},
        SLOW
      )
    ).toBeTruthy();
    expect(screen.getByTestId("bank-submit")).toBeEnabled();
    expect(getAccountSettings()).toMatchObject({ signUp: "bank", payoutAccountId: null });

    fake.mtPelerin().offline = false;
    await fireEvent.press(screen.getByTestId("bank-submit"));
    await waitFor(() => expect(router.getPathname()).toBe("/pos"), SLOW);
    expect(bankAccountsAtMtPelerin()).toHaveLength(1);
  });

  it("leads back to the login when the session was lost meanwhile, nothing saved", async () => {
    const router = await openBankStep();
    await logInBySms();
    await giveEmail();
    await fillBankDetails();
    fake.mtPelerin().revokeSessions();

    await fireEvent.press(screen.getByTestId("bank-submit"));

    expect(
      await screen.findByText("Your Mt Pelerin session has expired: sign in again", {}, SLOW)
    ).toBeTruthy();
    expect(screen.getByTestId("mtpelerin-intro")).toBeTruthy();
    expect(router.getPathname()).toBe("/onboarding/bank");
    expect(bankAccountsAtMtPelerin()).toEqual([]);
    expect(getAccountSettings()).toMatchObject({ signUp: "bank", payoutAccountId: null });

    // Logged in again: the details typed are still there, and go.
    await logInBySms();
    await screen.findByTestId("mtpelerin-connected", {}, SLOW);
    expect(screen.getByTestId("bank-iban").props.value).toBe("CH93 0076 2011 6238 5295 7");
    await fireEvent.press(screen.getByTestId("bank-submit"));
    await waitFor(() => expect(router.getPathname()).toBe("/pos"), SLOW);
  });

  it("logs in with the account's key in the staging app (Mt Pelerin's dev/test)", async () => {
    mockVariant = "staging";
    await openBankStep();
    expect(screen.getByTestId("mtpelerin-intro")).toHaveTextContent(
      /Your sattle\.me account's key, then your e-mail and your number/
    );

    // The button pressed is the login: no second "Sign in to Mt Pelerin" in its panel.
    await fireEvent.press(screen.getByTestId("mtpelerin-create"));
    await fireEvent.changeText(
      await screen.findByTestId("sell-email", {}, SLOW),
      "bakery@example.com"
    );
    expect(screen.queryByTestId("sell-connect")).toBeNull();
    await fireEvent.changeText(screen.getByTestId("sell-profile-phone"), PHONE_TYPED);
    await fireEvent.press(screen.getByTestId("sell-save-profile"));

    expect(await screen.findByTestId("mtpelerin-connected", {}, SLOW)).toBeTruthy();
    // The staging app's Mt Pelerin only.
    expect(fake.testMtPelerin().person()).toMatchObject({ phone: PHONE });
    expect(fake.mtPelerin().requests).toEqual([]);
  });

  it("offers its retry when the key's login fails in the staging app, not a second button", async () => {
    mockVariant = "staging";
    await openBankStep();
    fake.testMtPelerin().failNext("POST /devices/add", 500);

    await fireEvent.press(screen.getByTestId("mtpelerin-create"));

    expect(await screen.findByTestId("sell-failure", {}, SLOW)).toBeTruthy();
    expect(screen.queryByTestId("sell-connect")).toBeNull();
    await fireEvent.press(screen.getByTestId("sell-retry"));
    expect(await screen.findByTestId("sell-email", {}, SLOW)).toBeTruthy();
  });

  it("asks for the key's login again only when the session is lost after it (staging app)", async () => {
    mockVariant = "staging";
    await openBankStep();
    await fireEvent.press(screen.getByTestId("mtpelerin-create"));
    await fireEvent.changeText(
      await screen.findByTestId("sell-email", {}, SLOW),
      "bakery@example.com"
    );
    await fireEvent.changeText(screen.getByTestId("sell-profile-phone"), PHONE_TYPED);
    fake.testMtPelerin().revokeSessions();

    await fireEvent.press(screen.getByTestId("sell-save-profile"));

    // Not started again on its own: the merchant signs in again.
    expect(await screen.findByTestId("sell-connect", {}, SLOW)).toBeTruthy();
    expect(screen.getByText("Your Mt Pelerin session has expired: sign in again")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("sell-connect"));
    expect(await screen.findByTestId("sell-email", {}, SLOW)).toBeTruthy();
  });
});
