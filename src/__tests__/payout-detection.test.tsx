import "@/i18n";

import { getCalendars, getLocales } from "expo-localization";
import { fireEvent, renderRouter, screen } from "expo-router/testing-library";

import BankScreen from "@/app/onboarding/bank";
import OnboardingLayout from "@/app/onboarding/_layout";
import SplitScreen from "@/app/onboarding/split";
import { closeAccount, getAccountSettings, openAccount } from "@/features/account/session";
import { IP_COUNTRY_URL } from "@/lib/ip-country";

import { TEST_WALLET_ID, openTestAccount, testSeed } from "../../jest/account";
import type * as FileSystemFake from "../../jest/expo-file-system";
import type * as RelaysFake from "../../jest/nostr-relays";

jest.mock("../lib/breez/wallet", () => ({
  getWalletId: jest.fn(
    async () => "02c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5"
  )
}));

// The device of each test; the UI language stays English (i18n reads it once, at import).
jest.mock("expo-localization", () => ({
  getLocales: jest.fn(() => [
    { languageTag: "en-CH", languageCode: "en", regionCode: "CH", currencyCode: "CHF" }
  ]),
  getCalendars: jest.fn(() => [{ timeZone: "Europe/Zurich" }])
}));

const routes = {
  "onboarding/_layout": OnboardingLayout,
  "onboarding/split": SplitScreen,
  "onboarding/bank": BankScreen
};

const fetchMock = jest.mocked(globalThis.fetch);
// The in-memory expo-file-system and Nostr relays of jest.setup.ts: every test uses the same
// test wallet, whose backups must not outlive the test.
const fileSystem = jest.requireMock<typeof FileSystemFake>("expo-file-system");
const relays = jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");

/** A phone set to English (United States), in the time zone given. Partial: what the app reads. */
function setDevice(timeZone: string) {
  jest
    .mocked(getLocales)
    .mockReturnValue([
      { languageTag: "en-US", languageCode: "en", regionCode: "US", currencyCode: "USD" }
    ] as never);
  jest.mocked(getCalendars).mockReturnValue([{ timeZone }] as never);
}

/** country.is answers `country`; any other request fails. */
function ipCountryAnswers(country: string) {
  fetchMock.mockImplementation(async (url) => {
    if (url !== IP_COUNTRY_URL) throw new Error("Network disabled in tests");
    return { ok: true, status: 200, json: async () => ({ ip: "192.0.2.1", country }) } as Response;
  });
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

/**
 * The split's "Continue", then the bank step's Mt Pelerin login (src/app/onboarding/bank.tsx):
 * under Jest, the staging app's, by the account's key, then a fictitious e-mail and number.
 */
async function continueToBankDetails() {
  const slow = { timeout: 5000 };
  await fireEvent.press(screen.getByTestId("split-continue"));
  await fireEvent.press(await screen.findByTestId("mtpelerin-create", {}, slow));
  await fireEvent.changeText(await screen.findByTestId("sell-email", {}, slow), "shop@example.com");
  await fireEvent.changeText(screen.getByTestId("sell-profile-phone"), "79 000 00 00");
  await fireEvent.press(screen.getByTestId("sell-save-profile"));
  await screen.findByTestId("mtpelerin-connected", {}, slow);
}

function ipLookups(): number {
  return fetchMock.mock.calls.filter(([url]) => url === IP_COUNTRY_URL).length;
}

/** Creates an account, which detects its payout currency, then opens the split. */
async function createAccountThenSplit() {
  await openTestAccount();
  await renderRouter(routes, { initialUrl: "/onboarding/split" });
}

describe("payout currency and country detection, when the account is created", () => {
  beforeEach(() => {
    fileSystem.resetFileSystem();
    relays.resetRelays();
    closeAccount();
    fetchMock.mockReset();
    fetchMock.mockImplementation(() => Promise.reject(new Error("Network disabled in tests")));
  });

  it("never looks the IP address up when the time zone is enough", async () => {
    setDevice("Europe/Zurich");
    ipCountryAnswers("NL");

    await createAccountThenSplit();

    expect(screen.getByTestId("split-currency")).toHaveTextContent(/CHF/);
    // The payout currencies are a config of the app: no request at all.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("pays out in rand in South Africa", async () => {
    setDevice("Africa/Johannesburg");

    await createAccountThenSplit();

    expect(screen.getByTestId("split-currency")).toHaveTextContent(/ZAR/);
    await setSplit(0);
    await continueToBankDetails();
    expect(screen.getByText("South African rand")).toBeTruthy();
    expect(screen.getByText("South Africa")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses the IP country when the time zone is not enough, before the device settings", async () => {
    // Privacy-hardened browsers (Tor Browser, for one) report UTC.
    setDevice("UTC");
    ipCountryAnswers("GB");

    await createAccountThenSplit();

    expect(screen.getByTestId("split-currency")).toHaveTextContent(/GBP/);
    expect(ipLookups()).toBe(1);

    // The bank country follows the same detection.
    await setSplit(0);
    await continueToBankDetails();
    expect(screen.getByText("United Kingdom")).toBeTruthy();
  });

  it("falls back to the device settings when the IP lookup fails", async () => {
    setDevice("UTC");

    await createAccountThenSplit();

    expect(ipLookups()).toBe(1);
    expect(screen.getByTestId("split-currency")).toHaveTextContent(/USD/);
  });

  it("keeps what it detected: the device is not asked again when the account opens again", async () => {
    setDevice("UTC");
    ipCountryAnswers("GB");
    await openTestAccount();
    // The device moves to another country before the next login.
    setDevice("Africa/Johannesburg");

    await openAccount({
      seed: testSeed(),
      walletId: TEST_WALLET_ID,
      created: false,
      detect: () => Promise.reject(new Error("Not detected again")),
      businessNameWord: "Merchant"
    });

    expect(getAccountSettings()).toMatchObject({ payoutCurrency: "GBP", detectedCountry: "GB" });
    expect(ipLookups()).toBe(1);
  });
});
