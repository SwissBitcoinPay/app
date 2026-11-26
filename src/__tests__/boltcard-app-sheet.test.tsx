import "@/i18n";

import { act, fireEvent, renderRouter, screen, waitFor, within } from "expo-router/testing-library";
import { Linking, Platform } from "react-native";

import LaunchScreen from "@/app/index";
import PendingScreen from "@/app/pending";
import { ANDROID_APP_URL, IOS_APP_URL } from "@/config/app-stores";
import { getAccountSettings } from "@/features/account/session";
import type { BrowserDevice } from "@/lib/browser-device";
import { createPasskeyWallet } from "@/lib/breez/passkey";

import type * as NfcFake from "../../jest/nfc-manager";

/*
 * "Manage my BoltCard" on a device that programs no card (BoltCardAppSheet.tsx): the app's stores,
 * never an account created there, whose passkey the phone might
 * not get. On a phone that programs cards, the account is created: signup-flow.test.tsx.
 */

// No passkey is to be asked: one asked would be a test's failure, not a prompt.
jest.mock("../lib/breez/passkey", () => ({
  createPasskeyWallet: jest.fn(async () => {
    throw new Error("No passkey on a device that programs no card");
  }),
  preparePasskeys: jest.fn(async () => undefined),
  passkeysReady: jest.fn(() => true)
}));
// The codes' content, readable: the plate draws it as squares.
jest.mock("@/components/ui/QrPlate", () => {
  /* eslint-disable @typescript-eslint/no-require-imports -- jest.mock factories are synchronous */
  const { createElement } = require("react") as typeof import("react");
  const { Text } = require("react-native") as typeof import("react-native");
  /* eslint-enable @typescript-eslint/no-require-imports */
  return {
    QrPlate: ({ value, accessibilityLabel }: { value: string; accessibilityLabel?: string }) =>
      createElement(Text, { testID: "qr-value", accessibilityLabel }, value)
  };
});
const mockBrowser: { device: BrowserDevice | null } = { device: null };
jest.mock("@/lib/browser-device", () => ({ browserDevice: () => mockBrowser?.device ?? null }));
// eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories are synchronous
jest.mock("react-native-nfc-manager", () => require("../../jest/nfc-manager"));
const nfc = jest.requireMock<typeof NfcFake>("react-native-nfc-manager");

// Where an account would lead: none must be reached.
const routes = { index: LaunchScreen, pending: PendingScreen, "onboarding/card": PendingScreen };

const COMPUTER =
  "A computer cannot read NFC cards. Download the sattle.me app on your phone: you will create your account there, then hold the card to the phone to program it.";
const DEVICE =
  "This device cannot read NFC cards. Download the sattle.me app on your phone: you will create your account there, then hold the card to the phone to program it.";
const BROWSER =
  "A browser cannot program a card. Open or install the sattle.me app on this phone: you will create your account there, then hold the card to the phone to program it.";
const SCAN = "Scan the code for your phone with its camera.";
/** Font Awesome's glyphs (Icon.tsx): the stores' logos, "arrow-up-right-from-square". */
const APPLE_GLYPH = String.fromCodePoint(0xf179);
const ANDROID_GLYPH = String.fromCodePoint(0xf17b);
const EXTERNAL_GLYPH = String.fromCodePoint(0xf08e);

let web: jest.ReplaceProperty<typeof Platform.OS> | null = null;

/** The web app, in a browser of this device. */
function inBrowser(device: BrowserDevice) {
  web = jest.replaceProperty(Platform, "OS", "web");
  mockBrowser.device = device;
}

beforeEach(() => {
  nfc.resetNfcManager();
});

afterEach(() => {
  web?.restore();
  web = null;
  mockBrowser.device = null;
});

/** The welcome screen, "Manage my BoltCard" tapped: its panel. */
async function manageBoltCard() {
  const router = await renderRouter(routes, { initialUrl: "/" });
  await fireEvent.press(screen.getByTestId("boltcard-entry"));
  const sheet = await screen.findByTestId("boltcard-app");
  return { router, sheet: within(sheet) };
}

/** No account was made: no passkey asked, none opened, the welcome screen still shown. */
function expectNoAccount(router: { getPathname: () => string }) {
  expect(createPasskeyWallet).not.toHaveBeenCalled();
  expect(getAccountSettings()).toBeNull();
  expect(router.getPathname()).toBe("/");
}

/** The code of each store, named, the iPhone's first, as the design shows them. */
function expectStoreCodes(sheet: ReturnType<typeof within>) {
  const codes = sheet.getAllByTestId("qr-value");
  expect(codes.map((code) => code.props.children)).toEqual([IOS_APP_URL, ANDROID_APP_URL]);
  expect(codes.map((code) => code.props.accessibilityLabel)).toEqual([
    "QR code of the sattle.me app on the App Store",
    "QR code of the sattle.me app on Google Play"
  ]);
  const iphone = within(sheet.getByTestId("boltcard-app-iphone"));
  expect(iphone.getByText("iPhone")).toBeTruthy();
  expect(iphone.getByText("App Store")).toBeTruthy();
  const android = within(sheet.getByTestId("boltcard-app-android"));
  expect(android.getByText("Android")).toBeTruthy();
  expect(android.getByText("Google Play")).toBeTruthy();
  expect(sheet.getByText(SCAN)).toBeTruthy();
  // A code to scan, no store to open on this device.
  expect(sheet.queryByTestId("boltcard-app-store")).toBeNull();
}

describe('"Manage my BoltCard" where no card is programmed', () => {
  it("on a computer, gives a code per store, and creates no account", async () => {
    inBrowser("other");
    const { router, sheet } = await manageBoltCard();

    expect(sheet.getByText("Manage my BoltCard")).toBeTruthy();
    expect(sheet.getByText(COMPUTER)).toBeTruthy();
    expectStoreCodes(sheet);
    expectNoAccount(router);
  });

  it("in an iPad's browser, says it of this device: an iPad is no computer", async () => {
    inBrowser("ipad");
    const { router, sheet } = await manageBoltCard();

    expect(sheet.getByText(DEVICE)).toBeTruthy();
    expect(sheet.queryByText(COMPUTER)).toBeNull();
    expectStoreCodes(sheet);
    expectNoAccount(router);
  });

  it("in the app on a device without NFC (an iPad), the same codes, of this device", async () => {
    nfc.removeNfc();
    const { router, sheet } = await manageBoltCard();

    expect(sheet.getByText(DEVICE)).toBeTruthy();
    expectStoreCodes(sheet);
    expectNoAccount(router);
  });

  it.each([
    ["iphone", "Get the app on the App Store", APPLE_GLYPH, IOS_APP_URL],
    ["android", "Get the app on Google Play", ANDROID_GLYPH, ANDROID_APP_URL]
  ] as const)(
    "in a phone's browser (%s), which cannot scan its own screen, a button to its store",
    async (device, label, glyph, url) => {
      inBrowser(device);
      const open = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
      const { router, sheet } = await manageBoltCard();

      expect(sheet.getByText(BROWSER)).toBeTruthy();
      expect(sheet.queryByTestId("qr-value")).toBeNull();
      expect(sheet.queryByText(SCAN)).toBeNull();
      // The panel's one filled button, not a link.
      const button = sheet.getByTestId("boltcard-app-store");
      expect(button.props.accessibilityRole).toBe("button");
      expect(within(button).getByText(label)).toBeTruthy();
      // Its store's logo, its label, then the icon of a page outside the app (Icon.tsx).
      expect(button).toHaveTextContent(`${glyph}${label}${EXTERNAL_GLYPH}`);
      expect(sheet.queryByTestId("app-store-link")).toBeNull();
      await fireEvent.press(button);
      expect(open).toHaveBeenCalledWith(url);
      expectNoAccount(router);
      open.mockRestore();
    }
  );

  it('closes on "Close", the welcome screen as it was, and opens again', async () => {
    inBrowser("other");
    const { router, sheet } = await manageBoltCard();

    await fireEvent.press(sheet.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByTestId("boltcard-app")).toBeNull());
    expect(screen.getByTestId("create-account")).toBeTruthy();

    await act(async () => {
      await fireEvent.press(screen.getByTestId("boltcard-entry"));
    });
    expect(await screen.findByTestId("boltcard-app")).toBeTruthy();
    expectNoAccount(router);
  });
});
