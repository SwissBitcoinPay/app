import "@/i18n";

import { Slot } from "expo-router";
import { act, fireEvent, renderRouter, screen, waitFor, within } from "expo-router/testing-library";
import { useState } from "react";
import { Pressable, StyleSheet } from "react-native";

import AppLayout from "@/app/(app)/_layout";
import WalletLayout from "@/app/(app)/wallet/_layout";
import LaunchScreen from "@/app/index";
import { openExternal } from "@/components/ui/external-link";
import { closeAccount, getAccountBackupKey, getAccountSettings } from "@/features/account/session";
import { SELL_RATE_REFRESH_MS } from "@/config/mtpelerin";
import { SellSheet } from "@/features/sell/SellSheet";
import { resetTerminalProfileCache } from "@/features/terminal/profile-cache";
import { reportActivity } from "@/lib/activity";
import { getAppInfo, type AppInfo } from "@/lib/app-info";
import { getDeviceLocale } from "@/lib/locale/device";
import { formatInteger } from "@/lib/locale/format";
import { formatFiat } from "@/lib/terminal/amount";
import type { SavedTerminalProfile } from "@/lib/terminal/model";
import { saveTerminalProfile } from "@/lib/terminal/profile";
import { lightColors } from "@/theme";

import { TEST_WALLET_ID, openCardHolderAccount, openMerchantAccount } from "../../jest/account";
import { SCENARIO_IBAN } from "../../jest/mtpelerin-fake/scenarios";
import { fakeIban } from "../../jest/mtpelerin-fake/server";
import { fieldCalls, resetFieldCalls } from "../../jest/text-input";
import type * as MtPelerinFake from "../../jest/mtpelerin";
import type * as FileSystemFake from "../../jest/expo-file-system";
import type * as RelaysFake from "../../jest/nostr-relays";

/*
 * "Sell" as the merchant goes through it (src/features/sell/):
 * its panel's three steps, a sale quoted and paid, sold, the sales, the limits and the settings,
 * every page in the one panel, against the fake Mt Pelerin of the tests (jest/mtpelerin.ts), in
 * the production app (its SMS login) unless a test says otherwise. The panel shows over a screen
 * of its own here ("Wallet" opens it: wallet-screen.test.tsx). The wallet's payments are
 * the fake's (its payer mocked below: wallet-payer.ts is the SDK's).
 */

jest.mock("../lib/app-info", () => ({
  ...jest.requireActual("../lib/app-info"),
  getAppInfo: jest.fn()
}));
// The BOLT11 prefix of the build (no app config under Jest): mainnet, as both variants.
jest.mock("../lib/breez/config", () => ({
  ...jest.requireActual("../lib/breez/config"),
  getBreezNetwork: () => "mainnet"
}));
// Mt Pelerin's sync awaited every 300 ms rather than every minute.
jest.mock("../config/mtpelerin", () => ({
  ...jest.requireActual("../config/mtpelerin"),
  MTPELERIN_POLL_MS: 300
}));
jest.mock("../components/ui/external-link", () => ({
  ...jest.requireActual("../components/ui/external-link"),
  openExternal: jest.fn()
}));
// 1 BTC = 100 000 CHF: 1 sat = 0.1 centime.
jest.mock("../features/terminal/useRate", () => ({
  useRate: () => ({ rate: 100000, loading: false, current: () => 100000 })
}));
// The account's wallet: `mockBalance` sats, 1 sat of fees a payment, paid to the app's fake Mt
// Pelerin, which then knows it paid.
let mockBalance = 0n;
// The passkey's answer: given at once, unless a test holds it.
let mockConfirmed: Promise<boolean> = Promise.resolve(true);
// The wallet's payments of Mt Pelerin's invoices, by payment hash: sent once paid.
const mockSent = new Map<string, "completed" | "pending">();
jest.mock("@/features/sell/wallet-payer", () => ({
  walletPayer: () => ({
    quote: async (invoice: { amountSats: bigint }) => ({
      amountSats: invoice.amountSats,
      feeSats: BigInt(1)
    }),
    covers: async (quote: { amountSats: bigint; feeSats: bigint }) =>
      mockBalance >= quote.amountSats + quote.feeSats,
    balance: async () => mockBalance,
    paidSince: async () => new Map(mockSent),
    confirm: () => mockConfirmed,
    pay: async (quote: {
      invoice: { pr: string; paymentHash: string };
      amountSats: bigint;
      feeSats: bigint;
    }) => {
      const mtp = jest.requireMock<typeof MtPelerinFake>("@/lib/mtpelerin/transport");
      if (!mtp.mtPelerin().payInvoice(quote.invoice.pr)) {
        if (!mtp.testMtPelerin().payInvoice(quote.invoice.pr)) throw new Error("Unknown invoice");
      }
      mockBalance -= quote.amountSats + quote.feeSats;
      mockSent.set(quote.invoice.paymentHash, "completed");
    }
  })
}));

const fake = jest.requireMock<typeof MtPelerinFake>("@/lib/mtpelerin/transport");
const relays = jest.requireMock<typeof RelaysFake>("@/lib/nostr/relay");
const fileSystem = jest.requireMock<typeof FileSystemFake>("expo-file-system");
const ADDRESS = "sattleme02c6047f94@breez.tips";
const SLOW = { timeout: 5000 };
const onSold = jest.fn();

const STAGING: AppInfo = {
  variant: "staging",
  version: "3.0.0",
  buildNumber: "3000000",
  commit: "f82ecab",
  updates: null
};

/**
 * The sale "Wallet" asks "Sell" to open on ("Follow the sale"), read at each opening;
 * null: none.
 */
let hostOrder: { orderId: string; fromMs: number } | null = null;

/** "Sell"'s panel, shown at once, over a screen that opens it again ("open-sell"). */
function SellHost() {
  const [visible, setVisible] = useState(true);
  return (
    <>
      <Pressable accessibilityRole="button" onPress={() => setVisible(true)} testID="open-sell" />
      <SellSheet
        visible={visible}
        onClose={() => setVisible(false)}
        openWallet={async () => undefined}
        onSold={onSold}
        order={hostOrder}
      />
    </>
  );
}

const routes = {
  index: LaunchScreen,
  "(app)/_layout": AppLayout,
  "(app)/pos/_layout": () => <Slot />,
  "(app)/pos/index": () => null,
  "(app)/wallet/_layout": WalletLayout,
  "(app)/wallet/index": SellHost
};

/** The owner's device, unlocked, its point of sale prepared, of a merchant's account. */
async function merchantDevice(open: () => Promise<void> = () => openMerchantAccount()) {
  await open();
  const profile: SavedTerminalProfile = {
    version: 2,
    walletId: TEST_WALLET_ID,
    backupKey: getAccountBackupKey()!,
    lightningAddress: ADDRESS,
    businessName: getAccountSettings()?.businessName ?? "",
    currency: "CHF"
  };
  await saveTerminalProfile(profile);
  resetTerminalProfileCache();
}

/** "Add an account" filled with the scenario's account, a company's, in Switzerland. */
async function fillAccountForm() {
  expect(await screen.findByTestId("sell-account-form", {}, SLOW)).toBeTruthy();
  await press("sell-account-holder-company");
  await type("sell-account-company", "Example Studio");
  await type("sell-account-iban", SCENARIO_IBAN);
  await type("sell-account-address", "1 Example Street");
  await type("sell-account-postal-code", "1000");
  await type("sell-account-city", "Lausanne");
  await press("sell-account-country");
  await type("country-search", "switzerland");
  await fireEvent.press(await screen.findByText("Switzerland", {}, SLOW));
  await waitFor(() => expect(disabled("sell-account-submit")).toBe(false), SLOW);
}

const press = async (testID: string) =>
  fireEvent.press(await screen.findByTestId(testID, {}, SLOW));

const type = async (testID: string, text: string) =>
  fireEvent.changeText(await screen.findByTestId(testID, {}, SLOW), text);

const disabled = (testID: string) =>
  screen.getByTestId(testID).props.accessibilityState?.disabled === true;

const tag = () => getDeviceLocale().languageTag;
/** "999.00 CHF" in the test device's locale. */
const chf = (cents: number) => `${formatFiat(cents, 2, tag())} CHF`;
const sats = (count: number) =>
  `${formatInteger(BigInt(count), tag())} ${count === 1 ? "sat" : "sats"}`;
/** `text` anywhere in an element's text (toHaveTextContent reads every space as " "). */
const has = (text: string) =>
  new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s/g, "\\s"));

/** "Sell" opened by the production app, logged in by SMS, in `scenario`'s state. */
async function openSell(
  scenario: Parameters<typeof fake.startScenario>[0] = "ready",
  prepare?: (server: ReturnType<typeof fake.startScenario>) => void
) {
  const server = fake.startScenario(scenario, ADDRESS);
  prepare?.(server);
  await renderRouter(routes, { initialUrl: "/wallet" });
  await type("sell-phone", "79 123 45 67");
  await press("sell-send-code");
  await type("sell-code", server.smsCode);
  await press("sell-submit-code");
  return { server };
}

/** The panel's title (its header, centred). */
const title = () => within(screen.getByTestId("sell-sheet")).getAllByRole("header")[0];

jest.setTimeout(60_000);

beforeEach(() => {
  hostOrder = null;
  closeAccount();
  // A device of its own: no settings of an earlier test (their bank account).
  fileSystem.resetFileSystem();
  // No session of the account shared by an earlier test (src/lib/mtpelerin/shared-session.ts).
  relays.resetRelays();
  mockBalance = 100_000n;
  mockConfirmed = Promise.resolve(true);
  mockSent.clear();
  onSold.mockClear();
  jest.mocked(getAppInfo).mockReturnValue({ ...STAGING, variant: "production", commit: null });
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  closeAccount();
  jest.restoreAllMocks();
});

describe('"Sell"\'s steps', () => {
  it("goes from the number to a sale in its panel: the code, the e-mail, 1 sat, the bank account", async () => {
    await merchantDevice(() => openMerchantAccount({ bitcoinPercent: 50 }));
    const server = fake.startScenario("newCustomer", ADDRESS);
    await renderRouter(routes, { initialUrl: "/wallet" });

    // The number after its country's dial code, Switzerland's first; Mt Pelerin's "Powered by".
    expect(await screen.findByTestId("sell-phone-step", {}, SLOW)).toBeTruthy();
    expect(screen.getByTestId("sell-dial-code")).toHaveTextContent(/\+41/);
    expect(screen.getAllByTestId("sell-powered-by").length).toBeGreaterThan(0);
    expect(screen.getByLabelText("Mt Pelerin")).toBeTruthy();
    // Another country: France's number.
    await press("sell-dial-code");
    await type("country-search", "france");
    await fireEvent.press(await screen.findByText("France", {}, SLOW));
    // The countries slide out as they came, then leave the panel under them in reach.
    expect(screen.getByTestId("country-search")).toBeTruthy();
    await waitFor(() => expect(screen.queryByTestId("country-search")).toBeNull(), SLOW);
    await waitFor(() => expect(screen.getByTestId("sell-dial-code")).toHaveTextContent(/\+33/));
    await type("sell-phone", "6 12 34 56 78");
    await press("sell-send-code");

    // The code in its six boxes, the number it went to.
    expect(await screen.findByTestId("sell-code-step", {}, SLOW)).toHaveTextContent(
      /by SMS at \+33612345678/
    );
    expect(title()).toHaveTextContent("Sell");
    // Back to the number from the header's arrow, then the code again.
    await press("sheet-back");
    expect(await screen.findByTestId("sell-phone-step", {}, SLOW)).toBeTruthy();
    await press("sell-dial-code");
    await type("country-search", "switzerland");
    await fireEvent.press(await screen.findByText("Switzerland", {}, SLOW));
    await type("sell-phone", "79 123 45 67");
    await press("sell-send-code");
    await type("sell-code", server.smsCode);
    await press("sell-submit-code");

    // The e-mail, the login's number shown.
    expect(await screen.findByTestId("sell-profile-step", {}, SLOW)).toHaveTextContent(
      /\+41791234567/
    );
    expect(disabled("sell-save-profile")).toBe(true);
    await type("sell-email", "alice@example.com");
    await press("sell-save-profile");

    // 1 sat: less than a centime at the app's rate; its fees.
    const validation = await screen.findByTestId("sell-validation-step", {}, SLOW);
    expect(validation).toHaveTextContent(/Verify your wallet/);
    expect(validation).toHaveTextContent(has(`Pay 1 sat (less than ${chf(1)})`));
    expect(screen.getByTestId("sell-validation-fee")).toHaveTextContent(has(sats(1)));
    await press("sell-pay-validation");

    // Paid: Mt Pelerin's sync awaited, "In progress" beside the time; the bank account meanwhile.
    expect(await screen.findByTestId("sell-pending", {}, SLOW)).toHaveTextContent(
      /Verifying your wallet/
    );
    expect(screen.getByTestId("sell-pending-paid")).toHaveTextContent(/In progress/);
    expect(mockBalance).toBe(100_000n - 2n);
    await press("sell-pending-bank");
    // No account of the settings' to offer (they keep none): one typed, in the merchant's currency,
    // said: wired in Switzerland, no word of SWIFT.
    expect(await screen.findByText("Where to wire your CHF", {}, SLOW)).toBeTruthy();
    await press("sell-bank-add");
    await fillAccountForm();
    expect(screen.getByTestId("sell-account-currency")).toHaveTextContent(/CHF — Swiss francs/);
    expect(screen.queryByTestId("sell-account-currency-swift")).toBeNull();
    await press("sell-account-submit");
    await waitFor(
      () =>
        expect(fake.mtPelerin().accountsOfUser()).toContainEqual(
          expect.objectContaining({
            type: "external",
            iban: SCENARIO_IBAN,
            owner_companyname: "Example Studio",
            owner_city: "Lausanne",
            currency: "CHF",
            user_is_owner: true
          })
        ),
      SLOW
    );
    // Its bank account there, the panel waits for the sat; then "Address verified".
    expect(await screen.findByTestId("sell-pending", {}, SLOW)).toBeTruthy();
    expect(screen.queryByTestId("sell-pending-bank")).toBeNull();
    await act(async () => fake.mtPelerin().syncPayments());
    expect(await screen.findByTestId("sell-verified", {}, SLOW)).toHaveTextContent(
      /Address verified/
    );
    await press("sell-verified-continue");
    expect(await screen.findByTestId("sell-sale", {}, SLOW)).toBeTruthy();
    // No steps any more: the sale's settings in the header.
    expect(screen.getByTestId("sell-settings-open")).toBeTruthy();
  });

  it('says "To do" for the bank account once the address is verified without one', async () => {
    await merchantDevice();
    await openSell("existingProfile");
    await press("sell-pay-validation");
    expect(await screen.findByTestId("sell-pending-bank", {}, SLOW)).toBeTruthy();
    await act(async () => fake.mtPelerin().syncPayments());
    expect(await screen.findByTestId("sell-verified-bank", {}, SLOW)).toHaveTextContent(/To do/);
    await press("sell-verified-continue");
    expect(await screen.findByTestId("sell-bank-step", {}, SLOW)).toBeTruthy();
  });

  it("proposes the merchant's payout currency for an account typed, says SWIFT's costs", async () => {
    await merchantDevice(() => openMerchantAccount({ bitcoinPercent: 50, payoutCurrency: "USD" }));
    await openSell("noBank");
    // In dollars, said in the title, then in the form with what an international transfer costs.
    expect(await screen.findByText("Where to wire your USD", {}, SLOW)).toBeTruthy();
    expect(screen.queryByTestId("sell-bank-suggestion")).toBeNull();
    await press("sell-bank-add");
    expect(await screen.findByTestId("sell-account-currency", {}, SLOW)).toHaveTextContent(
      /USD — US dollars/
    );
    expect(screen.getByTestId("sell-account-currency-swift")).toHaveTextContent(
      /International transfer \(SWIFT\).*fees/
    );
    // Another picked: the warning follows it.
    await press("sell-account-currency");
    await press("currency-CHF");
    await waitFor(() =>
      expect(screen.getByTestId("sell-account-currency")).toHaveTextContent(/CHF — Swiss francs/)
    );
    expect(screen.queryByTestId("sell-account-currency-swift")).toBeNull();
    await press("sell-account-currency");
    await press("currency-ZAR");
    await fillAccountForm();
    await press("sell-account-submit");
    expect(await screen.findByTestId("sell-sale", {}, SLOW)).toBeTruthy();
    expect(fake.mtPelerin().accountsOfUser().at(-1)).toMatchObject({
      iban: SCENARIO_IBAN,
      currency: "ZAR"
    });
  });

  it("types a new bank account by hand, a person's, its country chosen", async () => {
    await merchantDevice();
    await openSell("noBank");
    expect(await screen.findByTestId("sell-bank-step", {}, SLOW)).toBeTruthy();
    expect(screen.queryByTestId("sell-bank-suggestion")).toBeNull();
    // No account to offer: the currency the form will propose names the step.
    expect(screen.getByText("Where to wire your CHF")).toBeTruthy();
    await press("sell-bank-add");
    expect(await screen.findByTestId("sell-account-form", {}, SLOW)).toBeTruthy();
    expect(title()).toHaveTextContent("Add an account");
    await fireEvent.press(screen.getByText("A person"));
    await type("sell-account-firstname", "Alice");
    await type("sell-account-lastname", "Example");
    await type("sell-account-iban", "CH93 0076 2011 6238 5295 8");
    await fireEvent(screen.getByTestId("sell-account-iban"), "blur");
    expect(await screen.findByText("Check the IBAN")).toBeTruthy();
    await type("sell-account-iban", SCENARIO_IBAN.toLowerCase());
    expect(screen.queryByText("Check the IBAN")).toBeNull();
    await type("sell-account-address", "1 Example Street");
    await type("sell-account-postal-code", "1000");
    await type("sell-account-city", "Lausanne");
    // The merchant's currency by default, wired in Switzerland: no word of SWIFT.
    expect(screen.getByTestId("sell-account-currency")).toHaveTextContent(/CHF — Swiss francs/);
    expect(screen.queryByTestId("sell-account-currency-swift")).toBeNull();
    expect(screen.queryByText(/joins this name/)).toBeNull();
    expect(disabled("sell-account-submit")).toBe(true);
    await press("sell-account-country");
    await type("country-search", "switzerland");
    await fireEvent.press(await screen.findByText("Switzerland", {}, SLOW));
    await waitFor(() => expect(disabled("sell-account-submit")).toBe(false), SLOW);
    await press("sell-account-submit");
    expect(await screen.findByTestId("sell-sale", {}, SLOW)).toBeTruthy();
    expect(fake.mtPelerin().accountsOfUser().at(-1)).toMatchObject({
      type: "external",
      owner_firstname: "Alice",
      owner_lastname: "Example",
      owner_country: "CH",
      iban: SCENARIO_IBAN,
      currency: "CHF",
      user_is_owner: true
    });
  });

  it("logs in with the account's key in the staging app, its number asked with the e-mail", async () => {
    jest.mocked(getAppInfo).mockReturnValue(STAGING);
    await merchantDevice();
    await renderRouter(routes, { initialUrl: "/wallet" });
    expect(await screen.findByTestId("sell-connect-step", {}, SLOW)).toHaveTextContent(
      /the key of your sattle.me account/
    );
    await press("sell-connect");
    expect(await screen.findByTestId("sell-profile-step", {}, SLOW)).toBeTruthy();
    await type("sell-email", "alice@example.com");
    expect(disabled("sell-save-profile")).toBe(true);
    await type("sell-profile-phone", "079 123 45 67");
    await press("sell-save-profile");
    expect(await screen.findByTestId("sell-validation-step", {}, SLOW)).toBeTruthy();
    // Mt Pelerin's dev/test environment, never Mt Pelerin itself.
    expect(fake.testMtPelerin().person()).toMatchObject({ phone: "+41791234567" });
    expect(fake.mtPelerin().requests).toEqual([]);
  });

  it("says a wrong code, and when the address is another profile's", async () => {
    await merchantDevice();
    const server = fake.startScenario("addressTaken", ADDRESS);
    await renderRouter(routes, { initialUrl: "/wallet" });
    await type("sell-phone", "79 123 45 67");
    await press("sell-send-code");
    // Back to the number from the header's arrow only.
    expect(await screen.findByTestId("sell-code-step", {}, SLOW)).toBeTruthy();
    expect(screen.queryByText("Change number")).toBeNull();
    await type("sell-code", "000000");
    await press("sell-submit-code");
    expect(await screen.findByTestId("sell-failure", {}, SLOW)).toHaveTextContent(
      /This code is not the right one/
    );
    // The boxes emptied and focused for the right code, the failure saying why.
    await waitFor(() => expect(screen.getByTestId("sell-code").props.value).toBe(""));
    expect(fieldCalls()).toContainEqual({ testID: "sell-code", call: "focus" });
    // A new code asked: the boxes emptied again, the failure gone.
    resetFieldCalls();
    await type("sell-code", "1234");
    await press("sell-resend");
    await waitFor(() => expect(screen.getByTestId("sell-code").props.value).toBe(""), SLOW);
    expect(screen.queryByTestId("sell-failure")).toBeNull();
    expect(fieldCalls()).toContainEqual({ testID: "sell-code", call: "focus" });
    await type("sell-code", server.smsCode);
    await press("sell-submit-code");
    expect(await screen.findByTestId("sell-address-taken", {}, SLOW)).toHaveTextContent(
      /registered on another Mt Pelerin account/
    );
    await press("sell-switch-account");
    expect(await screen.findByTestId("sell-phone-step", {}, SLOW)).toBeTruthy();
  });

  it("says the wallet cannot pay 1 sat and its fees", async () => {
    mockBalance = 1n;
    await merchantDevice();
    await openSell("existingProfile");
    expect(await screen.findByTestId("sell-unaffordable", {}, SLOW)).toBeTruthy();
    expect(screen.queryByTestId("sell-pay-validation")).toBeNull();
  });

  it("starts again where Mt Pelerin is once closed and opened again", async () => {
    await merchantDevice();
    await openSell();
    expect(await screen.findByTestId("sell-sale", {}, SLOW)).toBeTruthy();
    await press("sell-settings-open");
    expect(await screen.findByTestId("sell-settings", {}, SLOW)).toBeTruthy();
    await press("sheet-close");
    await waitFor(() => expect(screen.queryByTestId("sell-settings")).toBeNull(), SLOW);
    await press("open-sell");
    // Its first page again, its session kept: no number asked.
    expect(await screen.findByTestId("sell-sale", {}, SLOW)).toBeTruthy();
    expect(screen.queryByTestId("sell-phone-step")).toBeNull();
  });

  it("reads Mt Pelerin again at each opening: a bank account added meanwhile", async () => {
    await merchantDevice();
    const { server } = await openSell();
    await press("sell-settings-open");
    expect(await screen.findByTestId("sell-settings-accounts", {}, SLOW)).toHaveTextContent(
      /1 account/
    );
    await press("sheet-close");
    await waitFor(() => expect(screen.queryByTestId("sell-settings")).toBeNull(), SLOW);
    // Added elsewhere (another device of the account) while the panel was closed.
    server.seedAccount("+41791234567", {
      type: "external",
      reference: "Example Studio",
      iban: fakeIban(7),
      currency: "EUR",
      owner_companyname: "Example Studio",
      owner_street: "1 Example Street",
      owner_postcode: "1000",
      owner_city: "Lausanne",
      owner_country: "CH",
      user_is_owner: true,
      status: "active"
    });
    await press("open-sell");
    expect(await screen.findByTestId("sell-sale", {}, SLOW)).toBeTruthy();
    await press("sell-settings-open");
    await waitFor(
      () => expect(screen.getByTestId("sell-settings-accounts")).toHaveTextContent(/2 accounts/),
      SLOW
    );
  });

  it("changes a bank account's holder and address at Mt Pelerin, the settings keeping its id only", async () => {
    await merchantDevice(() => openMerchantAccount({ bitcoinPercent: 50 }));
    const { server } = await openSell();
    await press("sell-settings-open");
    await press("sell-settings-accounts");
    await press("sell-bank-0");
    expect(await screen.findByTestId("sell-account-edit", {}, SLOW)).toBeTruthy();
    await waitFor(() => expect(title()).toHaveTextContent("Edit the account"), SLOW);
    // As Mt Pelerin has it; its IBAN and currency shown, not changed.
    expect(screen.getByTestId("sell-account-address").props.value).toBe("1 Example Street");
    expect(screen.getByTestId("sell-account-iban").props.editable).toBe(false);
    expect(disabled("sell-account-currency")).toBe(true);
    // Nothing changed: nothing to save.
    expect(disabled("sell-account-submit")).toBe(true);
    await type("sell-account-address", "2 New Street");
    await type("sell-account-city", "Geneva");
    expect(disabled("sell-account-submit")).toBe(false);
    await press("sell-account-submit");
    expect(await screen.findByTestId("sell-accounts", {}, SLOW)).toBeTruthy();
    expect(server.accountsOfUser().find(({ type }) => type === "external")).toMatchObject({
      iban: SCENARIO_IBAN,
      currency: "CHF",
      owner_companyname: "Example Studio",
      owner_street: "2 New Street",
      owner_city: "Geneva"
    });
    // Nothing of it in the settings: its details are Mt Pelerin's.
    expect(getAccountSettings()).not.toHaveProperty("bank");
  });

  it("says when Mt Pelerin keeps a bank account as it was, and adds no IBAN twice", async () => {
    await merchantDevice();
    const { server } = await openSell();
    await press("sell-settings-open");
    await press("sell-settings-accounts");
    await press("sell-bank-0");
    await type("sell-account-city", "Geneva");
    const id = server.accountsOfUser().find(({ type }) => type === "external")?.id as string;
    server.failNext(`PATCH /accounts/${id}`, 422, { error: { message: "Locked" } });
    await press("sell-account-submit");
    expect(await screen.findByTestId("sell-account-failure", {}, SLOW)).toHaveTextContent(
      /Mt Pelerin did not change this account/
    );
    // Still the form, its fields as typed; back to the list, the same account as before.
    expect(screen.getByTestId("sell-account-city").props.value).toBe("Geneva");
    await press("sheet-back");
    expect(await screen.findByTestId("sell-accounts", {}, SLOW)).toHaveTextContent(/CH48/);
    // The same IBAN in the same currency, added again: refused before Mt Pelerin is asked.
    await press("sell-accounts-add");
    expect(await screen.findByTestId("sell-account-form", {}, SLOW)).toBeTruthy();
    // The change's refusal is not this form's.
    expect(screen.queryByTestId("sell-account-failure")).toBeNull();
    await press("sell-account-holder-company");
    await type("sell-account-company", "Example Studio");
    await type("sell-account-iban", SCENARIO_IBAN);
    await type("sell-account-address", "1 Example Street");
    await type("sell-account-postal-code", "1000");
    await type("sell-account-city", "Lausanne");
    await press("sell-account-country");
    await type("country-search", "switzerland");
    await fireEvent.press(await screen.findByText("Switzerland", {}, SLOW));
    await waitFor(() => expect(disabled("sell-account-submit")).toBe(false), SLOW);
    const puts = server.requests.filter(({ method }) => method === "PUT").length;
    await press("sell-account-submit");
    expect(await screen.findByTestId("sell-account-failure", {}, SLOW)).toHaveTextContent(
      /already among your bank accounts/
    );
    expect(server.requests.filter(({ method }) => method === "PUT")).toHaveLength(puts);
  });

  /** A bank account of the merchant's that Mt Pelerin wrote without its holder's name. */
  const nameless = (server: ReturnType<typeof fake.startScenario>, iban: string) => {
    const seed = server.onNewPhone;
    server.onNewPhone = (phone) => {
      seed?.(phone);
      server.seedAccount(phone, {
        type: "external",
        iban,
        currency: "CHF",
        owner_country: "CH",
        user_is_owner: true,
        status: "active"
      });
    };
  };

  it("offers to log out of Mt Pelerin when its answers cannot be read", async () => {
    await merchantDevice();
    await openSell("noBank", (server) => nameless(server, fakeIban(5150)));
    expect(await screen.findByTestId("sell-failure", {}, SLOW)).toHaveTextContent(
      /unreadable answer/
    );
    // Never the bank step, as if the merchant had no account.
    expect(screen.queryByTestId("sell-bank-step")).toBeNull();
    expect(screen.getByTestId("sell-unread-logout")).toHaveTextContent(
      has("Log out of Mt Pelerin")
    );
    await press("sell-unread-logout");
    expect(await screen.findByTestId("sell-phone-step", {}, SLOW)).toBeTruthy();
    expect(screen.queryByTestId("sell-failure")).toBeNull();
  });

  it('says "Incomplete address" of an account Mt Pelerin lacks its holder\'s address for', async () => {
    await merchantDevice();
    await openSell("ready", (server) => {
      const seed = server.onNewPhone;
      server.onNewPhone = (phone) => {
        seed?.(phone);
        // As production lists accounts registered elsewhere: one name, no address.
        server.seedAccount(phone, {
          type: "external",
          iban: fakeIban(5152),
          currency: "CHF",
          owner_firstname: "EXAMPLE STUDIO LTD",
          user_is_owner: true,
          status: "active"
        });
      };
    });
    expect(await screen.findByTestId("sell-sale", {}, SLOW)).toBeTruthy();
    await press("sell-settings-open");
    await press("sell-settings-accounts");
    // Offered, said so; the account with its whole address says nothing.
    expect(await screen.findByTestId("sell-bank-1", {}, SLOW)).toHaveTextContent(
      has("EXAMPLE STUDIO LTD")
    );
    expect(screen.getByTestId("sell-bank-1")).toHaveTextContent(has("Incomplete address"));
    expect(screen.getByTestId("sell-bank-0")).not.toHaveTextContent(has("Incomplete address"));
    expect(screen.queryByTestId("sell-accounts-unreadable")).toBeNull();
  });

  it("lists the bank accounts it can read, and says how many others it cannot", async () => {
    await merchantDevice();
    await openSell("ready", (server) => nameless(server, fakeIban(5150)));
    expect(await screen.findByTestId("sell-sale", {}, SLOW)).toBeTruthy();
    await press("sell-settings-open");
    expect(await screen.findByTestId("sell-settings-accounts", {}, SLOW)).toHaveTextContent(
      /1 account/
    );
    await press("sell-settings-accounts");
    expect(await screen.findByTestId("sell-bank-0", {}, SLOW)).toHaveTextContent(/2957/);
    // Its IBAN in Plus Jakarta Sans, as its holder's name.
    const iban = within(screen.getByTestId("sell-bank-0")).getByText(/2957/);
    expect(StyleSheet.flatten(iban.props.style).fontFamily).toMatch(/^PlusJakartaSans-/);
    expect(screen.queryByTestId("sell-bank-1")).toBeNull();
    expect(screen.getByTestId("sell-accounts-unreadable")).toHaveTextContent(
      has("1 other account could not be read: it is not offered")
    );
  });

  it("shows nothing for a card holder's account, which has no wallet", async () => {
    await merchantDevice(() => openCardHolderAccount());
    await renderRouter(routes, { initialUrl: "/wallet" });
    expect(await screen.findByTestId("open-sell", {}, SLOW)).toBeTruthy();
    expect(screen.queryByTestId("sell-sheet")).toBeNull();
  });
});

describe("a sale", () => {
  it("quotes 10 CHF, sells its sats once the passkey says so, then says it sold", async () => {
    await merchantDevice();
    const { server } = await openSell();
    expect(await screen.findByTestId("sell-sale", {}, SLOW)).toBeTruthy();
    expect(await screen.findByTestId("sell-available", {}, SLOW)).toHaveTextContent(
      `Available: ${sats(100_000)}`
    );
    // What is left without an identity verification, these 30 days and this year.
    expect(await screen.findByTestId("sell-sale-limit-month", {}, SLOW)).toHaveTextContent(
      has(`Last 30 days${chf(99_900)} left of ${chf(99_900)}`)
    );
    expect(screen.getByTestId("sell-sale-limit-year")).toHaveTextContent(
      has(`This year${chf(1_198_800)} left of ${chf(1_198_800)}`)
    );
    // Nothing held yet for the account's deferred sells: read, not assumed.
    await waitFor(
      () =>
        expect(screen.getByTestId("sell-pending-total")).toHaveTextContent(
          has(`${formatFiat(0, 2, tag())} / ${chf(5_000)}`)
        ),
      SLOW
    );
    expect(screen.getByTestId("sell-pending-held")).toHaveTextContent(
      has(`Balance: ${formatFiat(0, 2, tag())}`)
    );
    expect(screen.queryByTestId("sell-pending-sale")).toBeNull();
    expect(screen.getByTestId("sell-account")).toHaveTextContent(
      /Example Studio.*CH\d\d •••• 2957/
    );
    // Wired at once by default, Mt Pelerin's transfer fee said; or with the grouped sales.
    expect(screen.getByTestId("sell-transfer-now").props.accessibilityState).toMatchObject({
      checked: true
    });
    expect(screen.getByTestId("sell-transfer-now")).toHaveTextContent(
      has(`${chf(100)} transfer fee below ${chf(5_000)}`)
    );
    expect(screen.getByTestId("sell-transfer-later")).toHaveTextContent(
      has(`in one grouped transfer with your other sales, once they reach ${chf(5_000)}`)
    );
    expect(disabled("sell-quote")).toBe(true);

    // 10 CHF at Mt Pelerin's rate (84 318 CHF), not the app's (100 000 CHF, which would sell
    // 10 000 sats, worth 8,43 CHF to Mt Pelerin): 11 860 sats, rounded up.
    await type("sell-amount", "10");
    expect(await screen.findByText(sats(11_860), {}, SLOW)).toBeTruthy();
    expect(screen.getByTestId("sell-equivalent")).toHaveTextContent(has(sats(11_860)));
    // The fake's estimate: its fees in sats, 1.3 %, rounded up, and in francs at its rate,
    // rounded up; 11 860 − 155 sats at that rate: 9.86 CHF, never more than the 10 CHF sold.
    await waitFor(
      () => expect(screen.getByTestId("sell-fee")).toHaveTextContent(has(sats(155))),
      SLOW
    );
    expect(screen.getByTestId("sell-fee")).toHaveTextContent(has(chf(14)));
    // Wired at once below 50 CHF: Mt Pelerin's transfer fee, which its estimate leaves out, taken
    // from the 9.86 CHF it wires.
    expect(screen.getByTestId("sell-transfer-fee")).toHaveTextContent(has(chf(100)));
    expect(screen.getByTestId("sell-receive")).toHaveTextContent(has(chf(886)));
    // Wired at once, it joins none of the deferred sales: "Pending" tells only what is held.
    expect(screen.queryByTestId("sell-pending-sale")).toBeNull();
    expect(screen.getByTestId("sell-pending-total")).toHaveTextContent(
      has(`${formatFiat(0, 2, tag())} / ${chf(5_000)}`)
    );
    expect(screen.getByTestId("sell-pending-gauge").props.accessibilityLabel).toBe(
      `${chf(0)} pending, out of ${chf(5_000)}`
    );
    await waitFor(() => expect(disabled("sell-quote")).toBe(false), SLOW);
    await press("sell-quote");

    const quote = await screen.findByTestId("sell-quote-view", {}, SLOW);
    expect(title()).toHaveTextContent("Quote");
    expect(quote).toHaveTextContent(has(`You receive ${chf(886)}`));
    expect(screen.getByTestId("sell-quote-transfer-fee")).toHaveTextContent(
      has(`Transfer fee${chf(100)}`)
    );
    // What is sold, in francs (rounded down): the 10 CHF typed; in sats; the Lightning fees
    // likewise (up).
    expect(screen.getByTestId("sell-quote-selling")).toHaveTextContent(has(chf(1_000)));
    expect(screen.getByTestId("sell-quote-selling")).toHaveTextContent(has(sats(11_860)));
    expect(screen.getByTestId("sell-quote-lightning-fee")).toHaveTextContent(has(chf(1)));
    expect(screen.getByTestId("sell-quote-lightning-fee")).toHaveTextContent(has(sats(1)));
    expect(screen.getByTestId("sell-quote-locked")).toHaveTextContent(/Rate guaranteed until/);
    expect(screen.getByTestId("sell-quote-transfer")).toHaveTextContent(/Immediate/);
    expect(screen.queryByTestId("sell-deferred")).toBeNull();
    // Back to the amount, still typed: the header's arrow, the quote's only way back.
    expect(quote).not.toHaveTextContent(/Edit the amount/);
    await press("sheet-back");
    expect((await screen.findByTestId("sell-amount", {}, SLOW)).props.value).toBe("10");
    await waitFor(() => expect(disabled("sell-quote")).toBe(false), SLOW);
    await press("sell-quote");
    expect(screen.getByTestId("sell-confirm")).toHaveTextContent(has(`Sell ${sats(11_860)}`));
    // While the passkey is asked, no way back to the amount: the arrow hidden.
    let answer: (yes: boolean) => void = () => undefined;
    mockConfirmed = new Promise((resolve) => (answer = resolve));
    await press("sell-confirm");
    await waitFor(() => expect(screen.queryByTestId("sheet-back")).toBeNull(), SLOW);
    answer(true);

    // Sold: what Mt Pelerin wires, then what comes next.
    const order = await screen.findByTestId("sell-order", {}, SLOW);
    expect(order).toHaveTextContent(/Sold successfully/);
    expect(order).toHaveTextContent(
      has(`Your ${sats(11_860)} are sold: ${chf(886)} will be wired to your account.`)
    );
    expect(mockBalance).toBe(100_000n - 11_861n);
    expect(onSold).toHaveBeenCalled();
    const steps = screen.getByTestId("sell-order-steps");
    expect(steps).toHaveTextContent(/Sats received/);
    expect(steps).toHaveTextContent(/Being processed/);
    expect(steps).toHaveTextContent(/Within 1 business day/);
    expect(steps).toHaveTextContent(/Example Studio · CH\d\d •••• 2957/);
    const sold = server.ordersOfUser().at(-1);
    expect(screen.getByTestId("sell-order")).toHaveTextContent(has(sold!.short_id as string));
    await act(async () => server.advanceSale(sold!.id as string, "sent"));
    await waitFor(
      () =>
        expect(screen.getByTestId("sell-order-steps")).not.toHaveTextContent(
          /Within 1 business day/
        ),
      SLOW
    );
    // "See your sales", then back to it, and "Close".
    await press("sell-order-history");
    expect(await screen.findByTestId("sell-history", {}, SLOW)).toBeTruthy();
    await press("sheet-back");
    await press("sell-order-done");
    await waitFor(() => expect(screen.queryByTestId("sell-order")).toBeNull(), SLOW);
  });

  it("sells with the grouped sales when chosen: no transfer fee, wired with the others", async () => {
    await merchantDevice();
    const { server } = await openSell();
    await press("sell-transfer-later");
    expect(screen.getByTestId("sell-transfer-later").props.accessibilityState).toMatchObject({
      checked: true
    });
    await type("sell-amount", "10");
    // No transfer fee of its own: all 9.86 CHF, wired with the others; "—" for its fee, not
    // "0.00 CHF".
    await waitFor(
      () => expect(screen.getByTestId("sell-receive")).toHaveTextContent(has(chf(986))),
      SLOW
    );
    expect(screen.getByTestId("sell-transfer-fee")).toHaveTextContent(/^Transfer fee—$/);
    // What it adds to the deferred sales: the 9.86 CHF it wires, on the way to 50 CHF.
    const pendingWithSale = () => {
      expect(screen.getByTestId("sell-pending-sale")).toHaveTextContent(
        has(`This sale: ${formatFiat(986, 2, tag())}`)
      );
      expect(screen.getByTestId("sell-pending-total")).toHaveTextContent(
        has(`${formatFiat(986, 2, tag())} / ${chf(5_000)}`)
      );
      expect(screen.getByTestId("sell-pending-gauge").props.accessibilityLabel).toBe(
        `${chf(0)} pending, plus ${chf(986)} from this sale, out of ${chf(5_000)}`
      );
    };
    pendingWithSale();
    // Back to "Immediate" and again: the fee and "Pending" follow the choice, without a new
    // estimate.
    const estimates = () =>
      server.requests.filter(({ path }) => path === "/orders/estimate").length;
    const before = estimates();
    await press("sell-transfer-now");
    expect(screen.getByTestId("sell-transfer-fee")).toHaveTextContent(has(chf(100)));
    expect(screen.getByTestId("sell-receive")).toHaveTextContent(has(chf(886)));
    expect(screen.queryByTestId("sell-pending-sale")).toBeNull();
    expect(screen.getByTestId("sell-pending-total")).toHaveTextContent(
      has(`${formatFiat(0, 2, tag())} / ${chf(5_000)}`)
    );
    await press("sell-transfer-later");
    expect(screen.getByTestId("sell-receive")).toHaveTextContent(has(chf(986)));
    expect(screen.getByTestId("sell-transfer-fee")).toHaveTextContent(/^Transfer fee—$/);
    pendingWithSale();
    expect(estimates()).toBe(before);
    await waitFor(() => expect(disabled("sell-quote")).toBe(false), SLOW);
    await press("sell-quote");
    const quote = await screen.findByTestId("sell-quote-view", {}, SLOW);
    expect(quote).toHaveTextContent(has(`You receive ${chf(986)}`));
    expect(screen.getByTestId("sell-quote-transfer-fee")).toHaveTextContent(/^Transfer fee—$/);
    expect(screen.getByTestId("sell-quote-transfer")).toHaveTextContent(/Deferred/);
    expect(screen.getByTestId("sell-deferred")).toHaveTextContent(has(chf(5_000)));
    // A deferred sell, with a reference of its own: not the split's.
    const body = server.requests.find(({ path }) => path === "/orders/create")?.body as {
      withdraw?: string;
      oid?: string;
    };
    expect(body.withdraw).toBe("manual");
    expect(body.oid).not.toMatch(/^sattle-split/);
    await press("sell-confirm");
    const order = await screen.findByTestId("sell-order", {}, SLOW);
    expect(order).toHaveTextContent(
      has(`Your ${sats(11_860)} are sold for ${chf(986)}, which joins your sales awaiting transfer`)
    );
    expect(screen.getByTestId("sell-order-steps")).toHaveTextContent(
      has(`In a grouped transfer with your other sales, once they reach ${chf(5_000)}`)
    );
    expect(screen.getByTestId("sell-order-steps")).not.toHaveTextContent(/Within 1 business day/);
    await press("sell-order-done");
    await waitFor(() => expect(screen.queryByTestId("sell-order")).toBeNull(), SLOW);
    // Opened again: the 9.86 CHF Mt Pelerin now holds for the account, on the way to 50 CHF.
    await press("open-sell");
    await waitFor(
      () =>
        expect(screen.getByTestId("sell-pending-held")).toHaveTextContent(
          has(`Balance: ${formatFiat(986, 2, tag())}`)
        ),
      SLOW
    );
    expect(screen.getByTestId("sell-pending-total")).toHaveTextContent(
      has(`${formatFiat(986, 2, tag())} / ${chf(5_000)}`)
    );
    expect(screen.getByTestId("sell-pending-gauge").props.accessibilityValue).toEqual({
      min: 0,
      max: 5_000,
      now: 986
    });
    // Among "Your sales": its sats received by Mt Pelerin, though a deferred sell never has a
    // transaction, and its francs held for the grouped transfer.
    const sold = server.ordersOfUser().at(-1)!;
    await press("sell-settings-open");
    await press("sell-settings-history");
    const row = await screen.findByTestId(`sell-sale-${sold.id as string}`, {}, SLOW);
    expect(row).toHaveTextContent(/In progress/);
    await fireEvent.press(row);
    const steps = await screen.findByTestId("sell-order-steps", {}, SLOW);
    await waitFor(() => expect(steps).toHaveTextContent(/Sats received/), SLOW);
    expect(steps).toHaveTextContent(/Converted to CHF/);
    expect(steps).toHaveTextContent(
      has(`In a grouped transfer with your other sales, once they reach ${chf(5_000)}`)
    );
    expect(screen.getByTestId("sell-order")).toHaveTextContent(/In progress/);
    expect(screen.getByTestId("sell-order")).not.toHaveTextContent(
      /Awaiting payment|Receiving the sats|Expired|nothing was sold/
    );
  });

  it("tells a sale the wallet paid as received before Mt Pelerin tells its funds", async () => {
    await merchantDevice();
    const { server } = await openSell();
    // Mt Pelerin tells nothing yet of the funds it received: its order stays `pending`.
    server.fundsUntold = true;
    await press("sell-transfer-later");
    await type("sell-amount", "10");
    await waitFor(() => expect(disabled("sell-quote")).toBe(false), SLOW);
    await press("sell-quote");
    await screen.findByTestId("sell-quote-view", {}, SLOW);
    await press("sell-confirm");
    expect(await screen.findByTestId("sell-order", {}, SLOW)).toHaveTextContent(
      /Sold successfully/
    );
    const sold = server.ordersOfUser().at(-1)!;
    expect(sold.status).toBe("pending");
    // Among "Your sales": in progress, its invoice paid by the wallet.
    await press("sell-order-history");
    const row = await screen.findByTestId(`sell-sale-${sold.id as string}`, {}, SLOW);
    expect(row).toHaveTextContent(/In progress/);
    expect(row).not.toHaveTextContent(/Awaiting payment/);
    // Its progress: the sats received (the wallet's payment), their processing begun.
    await fireEvent.press(row);
    const steps = await screen.findByTestId("sell-order-steps", {}, SLOW);
    expect(steps).toHaveTextContent(/Sats received/);
    expect(steps).toHaveTextContent(/Being processed/);
    expect(steps).toHaveTextContent(
      has(`In a grouped transfer with your other sales, once they reach ${chf(5_000)}`)
    );
    expect(screen.getByTestId("sell-order")).toHaveTextContent(/In progress/);
    expect(screen.getByTestId("sell-order")).not.toHaveTextContent(
      /Awaiting payment|Receiving the sats|Expired|nothing was sold/
    );
    // Mt Pelerin then tells them: its francs held for the grouped transfer.
    await act(async () => server.fundSale(sold.id as string));
    await waitFor(() => expect(steps).toHaveTextContent(/Converted to CHF/), SLOW);
    expect(screen.getByTestId("sell-order")).toHaveTextContent(/In progress/);
  });

  it("still tells a sale awaiting payment while the wallet has not paid it", async () => {
    await merchantDevice();
    const { server } = await openSell();
    server.fundsUntold = true;
    await type("sell-amount", "10");
    await waitFor(() => expect(disabled("sell-quote")).toBe(false), SLOW);
    await press("sell-quote");
    await screen.findByTestId("sell-quote-view", {}, SLOW);
    // The order made, its invoice never paid (the passkey dismissed).
    mockConfirmed = Promise.resolve(false);
    await press("sell-confirm");
    const order = server.ordersOfUser().at(-1)!;
    await press("sheet-back");
    await press("sell-settings-open");
    await press("sell-settings-history");
    const row = await screen.findByTestId(`sell-sale-${order.id as string}`, {}, SLOW);
    expect(row).toHaveTextContent(/Awaiting payment/);
    await fireEvent.press(row);
    const steps = await screen.findByTestId("sell-order-steps", {}, SLOW);
    expect(steps).toHaveTextContent(/Receipt of the sats/);
    expect(steps).not.toHaveTextContent(/Sats received/);
    expect(screen.getByTestId("sell-order")).toHaveTextContent(/Awaiting payment/);
  });

  it("says when what Mt Pelerin holds for the deferred sales cannot be read, never 0", async () => {
    await merchantDevice();
    const { server } = await openSell();
    await screen.findByTestId("sell-pending-held", {}, SLOW);
    // Opened again, Mt Pelerin's balances fail.
    const balances = server.requests.find(({ path }) => path.endsWith("/balances"))!.path;
    server.failNext(`GET ${balances}`, 500);
    await press("sheet-close");
    await waitFor(() => expect(screen.queryByTestId("sell-sale")).toBeNull(), SLOW);
    await press("open-sell");
    await waitFor(
      () => expect(screen.getByTestId("sell-pending-total")).toHaveTextContent(/^Unavailable$/),
      SLOW
    );
    expect(screen.queryByTestId("sell-pending-gauge")).toBeNull();
    expect(screen.queryByTestId("sell-pending-held")).toBeNull();
    // The choice stays: a deferred sale still sells.
    await press("sell-transfer-later");
    await type("sell-amount", "10");
    await waitFor(() => expect(disabled("sell-quote")).toBe(false), SLOW);
  });

  it("reads Mt Pelerin's rate again while the sale shows; one read that fails keeps the last", async () => {
    await merchantDevice();
    const { server } = await openSell();
    await type("sell-amount", "10");
    await waitFor(
      () => expect(screen.getByTestId("sell-equivalent")).toHaveTextContent(has(sats(11_860))),
      SLOW
    );
    // A read of the rate that fails: the amount stays typed in francs, at the rate read before.
    const probe = ({ body }: { body?: unknown }) =>
      (body as { amount_in?: string }).amount_in === "100000";
    const probes = () =>
      server.requests.filter((request) => request.path === "/orders/estimate" && probe(request))
        .length;
    // The panel's timers are fake (renderRouter's): a minute passes, the merchant still there
    // (the auto-lock's five minutes start again).
    const aMinute = () =>
      act(async () => {
        reportActivity();
        jest.advanceTimersByTime(SELL_RATE_REFRESH_MS);
      });
    const before = probes();
    server.failNext("POST /orders/estimate", 500, undefined, probe);
    await aMinute();
    await waitFor(() => expect(probes()).toBe(before + 1), SLOW);
    expect(screen.getByTestId("sell-amount").props.value).toBe("10");
    expect(screen.getByTestId("sell-unit")).toHaveTextContent(/CHF/);
    expect(screen.getByTestId("sell-equivalent")).toHaveTextContent(has(sats(11_860)));
    // Mt Pelerin's price moves: the same 10 CHF, 10 000 sats at 100 000 CHF, a minute later.
    server.chfPerBtc = 100_000n;
    expect(screen.getByTestId("sell-equivalent")).toHaveTextContent(has(sats(11_860)));
    await aMinute();
    await waitFor(
      () => expect(screen.getByTestId("sell-equivalent")).toHaveTextContent(has(sats(10_000))),
      SLOW
    );
    // 10 000 − 130 sats of fees: 9.87 CHF wired, less the transfer fee.
    await waitFor(
      () => expect(screen.getByTestId("sell-receive")).toHaveTextContent(has(chf(887))),
      SLOW
    );
  });

  it("takes sats only while Mt Pelerin's rate cannot be read, never the app's", async () => {
    await merchantDevice();
    await openSell("ready", (server) =>
      server.failNext(
        "POST /orders/estimate",
        500,
        undefined,
        ({ body }) => (body as { amount_in?: string }).amount_in === "100000"
      )
    );
    expect(await screen.findByTestId("sell-sale", {}, SLOW)).toBeTruthy();
    await waitFor(() => expect(disabled("sell-unit")).toBe(true), SLOW);
    expect(screen.getByTestId("sell-unit")).toHaveTextContent(/sats/);
    // Sats typed are sold as they are: 10 000 sats, 8,32 CHF wired at Mt Pelerin's rate.
    await type("sell-amount", "10000");
    expect(screen.getByTestId("sell-equivalent")).toHaveTextContent(/^$/);
    await waitFor(
      () => expect(screen.getByTestId("sell-receive")).toHaveTextContent(has(chf(732))),
      SLOW
    );
  });

  it("sells nothing while the account's relays cannot keep the sale", async () => {
    await merchantDevice();
    await openSell();
    await type("sell-amount", "10");
    await waitFor(() => expect(disabled("sell-quote")).toBe(false), SLOW);
    await press("sell-quote");
    await screen.findByTestId("sell-quote-view", {}, SLOW);
    // No majority of the account's relays answers: its record not kept, nothing paid.
    for (const relay of getAccountSettings()!.relays) relays.unreachable.add(relay);
    await press("sell-confirm");
    expect(await screen.findByTestId("sell-pay-failed", {}, SLOW)).toHaveTextContent(
      has(
        "Your account's relays did not answer: nothing was sold. Check your internet connection, then try again"
      )
    );
    expect(mockBalance).toBe(100_000n);
    // They answer again: the same quote is sold, its record kept first.
    relays.unreachable.clear();
    await press("sell-confirm");
    expect(await screen.findByTestId("sell-order", {}, SLOW)).toHaveTextContent(
      /Sold successfully/
    );
    expect(mockBalance).toBe(100_000n - 11_861n);
  });

  it("refuses an amount above the balance or what is left of the month", async () => {
    mockBalance = 1_000_000n;
    await merchantDevice();
    await openSell("readyWithSales");
    // 999.00 − 420.01 CHF sold this month.
    expect(await screen.findByTestId("sell-sale-limit-month", {}, SLOW)).toHaveTextContent(
      has(`${chf(57_899)} left of ${chf(99_900)}`)
    );
    await type("sell-amount", "1100");
    expect(await screen.findByText("Enter at most the available balance", {}, SLOW)).toBeTruthy();
    // 700 CHF at Mt Pelerin's rate (830 191 sats), fees included: above what is left.
    await type("sell-amount", "700");
    expect(await screen.findByText(`Enter at most ${chf(57_899)}`, {}, SLOW)).toBeTruthy();
    expect(disabled("sell-quote")).toBe(true);
    await type("sell-amount", "550");
    await waitFor(() => expect(disabled("sell-quote")).toBe(false), SLOW);
  });

  it("refuses an amount that would wire nothing: at least 0.01 CHF, said at what is received", async () => {
    mockBalance = 1_000_000n;
    await merchantDevice();
    await openSell();
    await press("sell-unit");
    const tooSmall = `You must receive at least ${chf(1)}: increase the amount`;
    // Said once, under "You receive about": never at the amount's field.
    const saidUnderReceive = () => {
      expect(screen.getByTestId("sell-too-small")).toHaveTextContent(has(tooSmall));
      expect(screen.getAllByText(tooSmall)).toHaveLength(1);
      expect(screen.getAllByRole("alert")).toHaveLength(1);
      expect(within(screen.getByTestId("sell-receive")).getByText(has(chf(0)))).toHaveStyle({
        color: lightColors.danger.fg
      });
    };
    // 5 sats, 1 of fees: 0,00 CHF at Mt Pelerin's rate.
    await type("sell-amount", "5");
    expect(await screen.findByTestId("sell-too-small", {}, SLOW)).toBeTruthy();
    saidUnderReceive();
    expect(screen.getByTestId("sell-receive")).toHaveTextContent(has(chf(0)));
    expect(disabled("sell-quote")).toBe(true);
    // 1 200 sats, 16 of fees: 0,99 CHF wired at once, which Mt Pelerin's transfer fee of
    // 1,00 CHF takes whole.
    await type("sell-amount", "1200");
    await waitFor(
      () => expect(screen.getByTestId("sell-receive")).toHaveTextContent(has(chf(0))),
      SLOW
    );
    saidUnderReceive();
    expect(disabled("sell-quote")).toBe(true);
    // With the grouped sales, no transfer fee: its 0,99 CHF.
    await press("sell-transfer-later");
    await waitFor(() => expect(disabled("sell-quote")).toBe(false), SLOW);
    expect(screen.queryByTestId("sell-too-small")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(within(screen.getByTestId("sell-receive")).getByText(has(chf(99)))).not.toHaveStyle({
      color: lightColors.danger.fg
    });
    // At once, 1 300 sats, 17 of fees: 1,08 CHF wired, 0,08 CHF received.
    await press("sell-transfer-now");
    await type("sell-amount", "1300");
    await waitFor(
      () => expect(screen.getByTestId("sell-receive")).toHaveTextContent(has(chf(8))),
      SLOW
    );
    await waitFor(() => expect(disabled("sell-quote")).toBe(false), SLOW);
    expect(screen.queryByTestId("sell-too-small")).toBeNull();
  });

  it("adds a bank account in EUR from the sale, and sells to it", async () => {
    await merchantDevice();
    await openSell();
    await press("sell-account");
    expect(await screen.findByTestId("sell-choose-account", {}, SLOW)).toBeTruthy();
    expect(title()).toHaveTextContent("To which account?");
    await press("sell-add-account");
    await press("sell-account-holder-company");
    await type("sell-account-company", "Example Studio");
    await type("sell-account-iban", fakeIban(4321));
    await type("sell-account-address", "1 Example Street");
    await type("sell-account-postal-code", "1000");
    await type("sell-account-city", "Lausanne");
    await press("sell-account-country");
    await type("country-search", "switzerland");
    await fireEvent.press(await screen.findByText("Switzerland", {}, SLOW));
    // "Payout currency": Mt Pelerin's 18 currencies, in a panel over the form.
    await press("sell-account-currency");
    expect(await screen.findByTestId("currency-picker", {}, SLOW)).toHaveTextContent(
      /Payout currency/
    );
    expect(screen.getByTestId("currency-ZAR")).toBeTruthy();
    await press("currency-EUR");
    await waitFor(() => expect(screen.queryByTestId("currency-picker")).toBeNull(), SLOW);
    expect(screen.getByTestId("sell-account-currency")).toHaveTextContent(/EUR — Euros/);
    // SEPA: no word of SWIFT.
    expect(screen.queryByTestId("sell-account-currency-swift")).toBeNull();
    await press("sell-account-submit");

    // Back to the accounts, the new one listed; chosen, back to the sale.
    expect(await screen.findByTestId("sell-account-1", {}, SLOW)).toHaveTextContent(/4321 · EUR/);
    await press("sell-account-1");
    await waitFor(() => expect(screen.getByTestId("sell-account")).toHaveTextContent(/4321/));
    // No month's figure for a sale in another currency than the franc; what is held for the
    // account told in euros, without a gauge (Mt Pelerin's threshold is 50 CHF's equivalent).
    expect(screen.queryByTestId("sell-sale-limits")).toBeNull();
    await waitFor(
      () =>
        expect(screen.getByTestId("sell-pending-total")).toHaveTextContent(
          has(`${formatFiat(0, 2, tag())} EUR`)
        ),
      SLOW
    );
    expect(screen.queryByTestId("sell-pending-gauge")).toBeNull();
    await type("sell-amount", "10");
    await waitFor(() => expect(disabled("sell-quote")).toBe(false), SLOW);
    await press("sell-quote");
    expect(await screen.findByTestId("sell-quote-view", {}, SLOW)).toHaveTextContent(/EUR/);
    expect(fake.mtPelerin().ordersOfUser()[0]).toMatchObject({ dest_currency: "EUR" });
  });

  it("adds a bank account in USD, says what SWIFT costs, and sells to it", async () => {
    mockBalance = 100_000n;
    await merchantDevice();
    await openSell();
    await press("sell-account");
    await press("sell-add-account");
    await press("sell-account-holder-company");
    await type("sell-account-company", "Example Studio");
    await type("sell-account-iban", fakeIban(4322));
    await type("sell-account-address", "1 Example Street");
    await type("sell-account-postal-code", "1000");
    await type("sell-account-city", "Lausanne");
    await press("sell-account-country");
    await type("country-search", "switzerland");
    await fireEvent.press(await screen.findByText("Switzerland", {}, SLOW));
    await press("sell-account-currency");
    await press("currency-USD");
    // An international transfer: its delay and the intermediary banks' fees, said under it.
    expect(await screen.findByTestId("sell-account-currency-swift", {}, SLOW)).toHaveTextContent(
      /International transfer \(SWIFT\).*fees/
    );
    await press("sell-account-submit");

    expect(await screen.findByTestId("sell-account-1", {}, SLOW)).toHaveTextContent(/4322 · USD/);
    expect(fake.mtPelerin().accountsOfUser().at(-1)).toMatchObject({ currency: "USD" });
    await press("sell-account-1");
    await type("sell-amount", "10");
    // Mt Pelerin's estimate, in dollars.
    await waitFor(() => expect(screen.getByTestId("sell-receive")).toHaveTextContent(/USD/), SLOW);
    await waitFor(() => expect(disabled("sell-quote")).toBe(false), SLOW);
    await press("sell-quote");
    expect(await screen.findByTestId("sell-quote-view", {}, SLOW)).toHaveTextContent(/USD/);
    await press("sell-confirm");

    // Sold: the transfer's usual delay is SWIFT's.
    const steps = await screen.findByTestId("sell-order-steps", {}, SLOW);
    expect(steps).toHaveTextContent(/One business day or more \(international SWIFT transfer\)/);
    expect(fake.mtPelerin().ordersOfUser().at(-1)).toMatchObject({ dest_currency: "USD" });
  });

  it("reads an amount in yen to the whole yen, never more than Mt Pelerin wires", async () => {
    await merchantDevice();
    await openSell();
    await press("sell-account");
    await press("sell-add-account");
    await press("sell-account-holder-company");
    await type("sell-account-company", "Example Studio");
    await type("sell-account-iban", fakeIban(4323));
    await type("sell-account-address", "1 Example Street");
    await type("sell-account-postal-code", "1000");
    await type("sell-account-city", "Lausanne");
    await press("sell-account-country");
    await type("country-search", "switzerland");
    await fireEvent.press(await screen.findByText("Switzerland", {}, SLOW));
    await press("sell-account-currency");
    await press("currency-JPY");
    await press("sell-account-submit");
    await press("sell-account-1");
    // Its francs unread: the transfer fee cannot be told, nor what is received; no quote.
    fake
      .mtPelerin()
      .failNext(
        "POST /orders/estimate",
        500,
        undefined,
        ({ body }) => (body as { dest_currency?: string }).dest_currency === "CHF"
      );
    await type("sell-amount", "9");
    await waitFor(
      () => expect(screen.getByTestId("sell-transfer-fee")).toHaveTextContent(/Unavailable/),
      SLOW
    );
    expect(screen.getByTestId("sell-receive")).toHaveTextContent(/Unavailable/);
    expect(screen.getByTestId("sell-fee")).not.toHaveTextContent(/Unavailable/);
    expect(disabled("sell-quote")).toBe(true);
    await type("sell-amount", "10");
    // 10 CHF typed, 11 860 sats at Mt Pelerin's rate in francs (the display currency). The fake
    // wires 9.86 (its amounts to the cent, as dev/test's JPY): 9 yen, rounded down,
    // less Mt Pelerin's transfer fee, the equivalent of 1 CHF (the fake prices every currency
    // alike: 1 yen), read from the same sats estimated in CHF.
    await waitFor(
      () =>
        expect(screen.getByTestId("sell-receive")).toHaveTextContent(
          has(`${formatFiat(8, 0, tag())} JPY`)
        ),
      SLOW
    );
    expect(screen.getByTestId("sell-transfer-fee")).toHaveTextContent(
      has(`${formatFiat(1, 0, tag())} JPY`)
    );
    expect(screen.getByTestId("sell-receive")).not.toHaveTextContent(/9[.,]8/);
  });
});

describe("the sales, the limits and the settings", () => {
  it('opens on a sale\'s progress once logged in ("Follow the sale" of "Wallet")', async () => {
    await merchantDevice();
    const { server } = await openSell("readyWithSales");
    expect(await screen.findByTestId("sell-sale", {}, SLOW)).toBeTruthy();
    await press("sheet-close");
    const [sale] = server.ordersOfUser();
    // The sale's record says when it was made: its order is looked for since then.
    hostOrder = { orderId: sale!.id as string, fromMs: server.now() - 3_600_000 };
    await press("open-sell");
    expect(await screen.findByTestId("sell-order-steps", {}, SLOW)).toBeTruthy();
    expect(title()).toHaveTextContent("Sale");
    const listed = server.requests.filter(({ path }) => path === "/orders/status").at(-1);
    expect(listed?.query).toMatchObject({ orderId: sale!.id });
    // Back: the sale, as for one of "Your sales".
    await press("sheet-back");
    expect(await screen.findByTestId("sell-sale", {}, SLOW)).toBeTruthy();
  });

  it("lists this month's sale and opens its progress", async () => {
    await merchantDevice();
    const { server } = await openSell("readyWithSales");
    await press("sell-settings-open");
    expect(await screen.findByTestId("sell-settings-history", {}, SLOW)).toHaveTextContent(
      /1 this year/
    );
    await press("sell-settings-history");
    const [sale] = server.ordersOfUser();
    const row = await screen.findByTestId(`sell-sale-${sale!.id as string}`, {}, SLOW);
    // What was wired, rounded down; no sats: Mt Pelerin's `source_amount` is recomputed from the
    // francs, never a whole number to show.
    expect(row).toHaveTextContent(has(chf(41_454)));
    expect(row).toHaveTextContent(/Wired/);
    await fireEvent.press(row);
    expect(await screen.findByTestId("sell-order-steps", {}, SLOW)).toBeTruthy();
    expect(title()).toHaveTextContent("Sale");
    expect(screen.getByTestId("sell-order")).toHaveTextContent(/Sale of /);
  });

  // A step never says what it has not reached.
  it.each([
    { stage: "held", said: "Receiving the sats" },
    { stage: "refunded", said: "Sats not received" }
  ] as const)(
    "never says the sats received while they are not ($stage)",
    async ({ stage, said }) => {
      await merchantDevice();
      const { server } = await openSell("readyWithSales");
      const [sale] = server.ordersOfUser();
      server.advanceSale(sale!.id as string, stage);
      await press("sell-settings-open");
      await press("sell-settings-history");
      await fireEvent.press(await screen.findByTestId(`sell-sale-${sale!.id as string}`, {}, SLOW));
      const steps = await screen.findByTestId("sell-order-steps", {}, SLOW);
      await waitFor(() => expect(steps).toHaveTextContent(has(said)), SLOW);
      expect(steps).not.toHaveTextContent(/Sats received/);
    }
  );

  it("reads a sale by its id again until Mt Pelerin gives it", async () => {
    await merchantDevice();
    const { server } = await openSell("readyWithSales");
    await press("sell-settings-open");
    await press("sell-settings-history");
    const [sale] = server.ordersOfUser();
    const row = await screen.findByTestId(`sell-sale-${sale!.id as string}`, {}, SLOW);
    // Its first read fails: said, then read again at the next poll, by its id alone.
    server.failNext("GET /orders/status", 503);
    await fireEvent.press(row);
    expect(await screen.findByTestId("sell-order-unread", {}, SLOW)).toBeTruthy();
    expect(await screen.findByTestId("sell-order-steps", {}, SLOW)).toBeTruthy();
    const reads = server.requests.filter(({ path }) => path === "/orders/status").slice(-2);
    expect(reads.map(({ query }) => query?.orderId)).toEqual([sale!.id, sale!.id]);
  });

  it("says when there is no sale yet", async () => {
    await merchantDevice();
    await openSell();
    await press("sell-settings-open");
    await press("sell-settings-history");
    expect(await screen.findByTestId("sell-history-empty", {}, SLOW)).toHaveTextContent(
      "No sale yet"
    );
  });

  it("shows what the month and the year have used, fees included", async () => {
    await merchantDevice();
    await openSell("readyWithSales");
    await press("sell-limits-open");
    expect(await screen.findByTestId("sell-limits", {}, SLOW)).toHaveTextContent(
      /Without an identity verification, you can sell at most/
    );
    const month = await screen.findByTestId("sell-limit-month", {}, SLOW);
    expect(month).toHaveTextContent(has(chf(42_001)));
    expect(month).toHaveTextContent(has(chf(99_900)));
    // The last 30 days, not a calendar month: what is left is freed by each sale's 30 days.
    expect(month).toHaveTextContent(has(`Last 30 days${chf(42_001)} / ${chf(99_900)}`));
    expect(month).toHaveTextContent(has(`${chf(99_900 - 42_001)} left: a sale counts for 30 days`));
    expect(screen.getByTestId("sell-limit-year")).toHaveTextContent(has(chf(1_198_800)));
    // To sell more: the identity, verified by Mt Pelerin itself on its pages.
    await press("sell-limits-identify");
    expect(openExternal).toHaveBeenCalledWith("https://app.mtpelerin.com");
    // "Sale settings": what is left to sell, the sale's limit within it.
    await press("sheet-back");
    await press("sell-settings-open");
    expect(await screen.findByTestId("sell-settings-limits", {}, SLOW)).toHaveTextContent(
      has(`${chf(99_900 - 42_001)} left`)
    );
  });

  it("holds an identified profile to no limit of its own", async () => {
    mockBalance = 5_000_000n;
    await merchantDevice();
    const { server } = await openSell("readyWithSales");
    expect(await screen.findByTestId("sell-sale-limits", {}, SLOW)).toBeTruthy();
    // Identified at Mt Pelerin since: "Sell", opened again, reads the profile again.
    server.approveIdentity("+41791234567");
    await press("sheet-close");
    await waitFor(() => expect(screen.queryByTestId("sell-sale")).toBeNull(), SLOW);
    await press("open-sell");
    await screen.findByTestId("sell-sale", {}, SLOW);
    // 2 000 CHF, above the month's 999: no limit is told, the quote is offered.
    await type("sell-amount", "2000");
    await waitFor(() => expect(disabled("sell-quote")).toBe(false), SLOW);
    expect(screen.queryByTestId("sell-sale-limits")).toBeNull();
    expect(screen.queryByText(has("Enter at most"))).toBeNull();
    // "Sale settings": the limit of an identified profile, a sale's, never the month's.
    await press("sell-settings-open");
    const row = await screen.findByTestId("sell-settings-limits", {}, SLOW);
    expect(row).toHaveTextContent(has(`${chf(10_000_000)} per sale`));
    expect(row).not.toHaveTextContent(/left/);
    // "Sale limits": 100 000 CHF a sale, no limit a month nor a year, no order counted.
    await press("sell-settings-limits");
    expect(await screen.findByTestId("sell-limits-identified", {}, SLOW)).toHaveTextContent(
      /Your identity is verified at Mt Pelerin/
    );
    const card = screen.getByTestId("sell-limits-identified-card");
    expect(screen.getByTestId("sell-limits-identified-sale")).toHaveTextContent(
      has(chf(10_000_000))
    );
    expect(card).toHaveTextContent(/Per monthNo limit/);
    expect(card).toHaveTextContent(/Per yearNo limit/);
    expect(screen.queryByTestId("sell-limit-month")).toBeNull();
    expect(screen.queryByText(has(chf(99_900)))).toBeNull();
  });

  it("lists the bank accounts, and logs out of Mt Pelerin on every device", async () => {
    await merchantDevice();
    await openSell();
    await press("sell-settings-open");
    const settings = await screen.findByTestId("sell-settings", {}, SLOW);
    expect(title()).toHaveTextContent("Sale settings");
    expect(settings).toHaveTextContent(/Mt Pelerin account/);
    // How it logged in is not told: by SMS goes without saying.
    expect(settings).not.toHaveTextContent(/SMS|signed in/);
    expect(await screen.findByTestId("sell-settings-verified", {}, SLOW)).toHaveTextContent(
      /verified/
    );
    expect(screen.getByTestId("sell-settings-accounts")).toHaveTextContent(/1 account/);
    await press("sell-settings-accounts");
    expect(await screen.findByTestId("sell-bank-0", {}, SLOW)).toHaveTextContent(/2957/);
    await press("sheet-back");
    await press("sell-logout");
    await press("sell-logout-confirm");
    // Its session forgotten: "Sell" asks the number again, from its first page.
    expect(await screen.findByTestId("sell-phone-step", {}, SLOW)).toBeTruthy();
    expect(screen.queryByTestId("sell-settings")).toBeNull();
  });
});
