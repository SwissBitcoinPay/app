import "@/i18n";

import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Dimensions, Linking, Platform, StyleSheet } from "react-native";

import { ANDROID_APP_URL, IOS_APP_URL } from "@/config/app-stores";
import { CARD_ADDED_READ_MS } from "@/config/card";
import { closeAccount } from "@/features/account/session";
import { AddCardDialog } from "@/features/card/AddCardDialog";
import { resetCardStates } from "@/features/card/states";
import type { BrowserDevice } from "@/lib/browser-device";

import { openTestAccount } from "../../jest/account";
import * as nostr from "../../jest/nostr-relays";

// The code's content, readable: the plate draws it as squares.
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
// The variant's web app (read through `?.`: the dialog's module loads before this file sets it).
const mockOrigin: { value: string | null } = { value: null };
jest.mock("@/config/card", () => ({
  ...jest.requireActual<typeof import("@/config/card")>("@/config/card"),
  getCardAddingOrigin: () => mockOrigin?.value ?? null
}));

// The web app's device (browser-device.ts), set by a test: none, as in the apps, by default.
const mockBrowser: { device: BrowserDevice | null } = { device: null };
jest.mock("@/lib/browser-device", () => ({ browserDevice: () => mockBrowser?.device ?? null }));

/** The account's cards read so far: each read asks every relay. */
function cardReads(): number {
  return nostr.calls.filter((call) => call.operation === "query").length;
}

async function advance(ms: number) {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(async () => {
  closeAccount();
  nostr.resetRelays();
  resetCardStates();
  mockOrigin.value = "https://web.example";
  await openTestAccount({ usage: "card", signUp: "done" });
});

afterEach(() => {
  jest.useRealTimers();
  mockBrowser.device = null;
});

describe('"Add a card" on a computer', () => {
  let web: jest.ReplaceProperty<typeof Platform.OS>;
  beforeEach(() => {
    web = jest.replaceProperty(Platform, "OS", "web");
  });
  afterEach(() => web.restore());

  it('says what to have, then gives a code that opens "Add a card" in the app on the phone', async () => {
    const onClose = jest.fn();
    await render(<AddCardDialog visible onClose={onClose} />);
    expect(screen.getByRole("header", { name: "Add a card" })).toBeTruthy();
    expect(
      screen.getByText(
        "A computer cannot read NFC cards: a card is added from the app, on your phone, with the card in hand."
      )
    ).toBeTruthy();
    expect(screen.getByRole("header", { name: "Before you start" })).toBeTruthy();
    for (const label of [
      "A blank BoltCard, A card from the former app is migrated, with its balance.",
      "Notifications, Allow them when the phone asks: they are how it learns that a till reads the card.",
      "Against the phone, Keep the card in place until the end, a few seconds."
    ]) {
      expect(screen.getByLabelText(label)).toBeTruthy();
    }
    // The web app's own address, whose links the phone's app opens itself.
    const code = screen.getByTestId("qr-value");
    expect(code).toHaveTextContent("https://web.example/cards/pair");
    expect(code.props.accessibilityLabel).toBe(
      "QR code that opens “Add a card” in the app on your phone"
    );
    expect(
      screen.getByText("Scan this code with your phone: it opens “Add a card” in the app.")
    ).toBeTruthy();

    await fireEvent.press(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("offers the shop where cards are ordered, in the browser", async () => {
    const opened = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
    try {
      await render(<AddCardDialog visible onClose={jest.fn()} />);
      await fireEvent.press(screen.getByRole("button", { name: "Order cards" }));
      expect(opened).toHaveBeenCalledWith("https://shop.sattle.me");
    } finally {
      opened.mockRestore();
    }
  });

  it("gives no code where the build has no web app for the phone to open (no RP ID)", async () => {
    mockOrigin.value = null;
    await render(<AddCardDialog visible onClose={jest.fn()} />);
    expect(screen.queryByTestId("add-card-code")).toBeNull();
    expect(screen.queryByTestId("qr-value")).toBeNull();
    // What to do stays said.
    expect(
      screen.getByText(
        "A computer cannot read NFC cards: a card is added from the app, on your phone, with the card in hand."
      )
    ).toBeTruthy();
  });

  it("reads the account's cards again while it shows, one read at a time, then no more once closed", async () => {
    jest.useFakeTimers({ advanceTimers: true });
    const view = await render(<AddCardDialog visible onClose={jest.fn()} />);
    const before = cardReads();
    await advance(CARD_ADDED_READ_MS);
    const once = cardReads();
    expect(once).toBeGreaterThan(before);

    // A read the relays hold: the next time comes, none other starts.
    const release = nostr.holdQueries();
    await advance(CARD_ADDED_READ_MS);
    const held = cardReads();
    expect(held).toBeGreaterThan(once);
    await advance(CARD_ADDED_READ_MS);
    expect(cardReads()).toBe(held);
    release();
    await advance(CARD_ADDED_READ_MS);
    expect(cardReads()).toBeGreaterThan(held);

    // Closed: nothing more is read.
    await view.rerender(<AddCardDialog visible={false} onClose={jest.fn()} />);
    const closed = cardReads();
    await advance(3 * CARD_ADDED_READ_MS);
    expect(cardReads()).toBe(closed);
  });
});

/*
 * In a phone's or a tablet's browser: never "A computer". A
 * phone cannot scan its own screen: its store in place of the code.
 */
describe("Add a card in a phone's or a tablet's browser", () => {
  let web: jest.ReplaceProperty<typeof Platform.OS>;
  beforeEach(() => {
    web = jest.replaceProperty(Platform, "OS", "web");
  });
  afterEach(() => web.restore());

  it.each([
    {
      device: "android" as const,
      says: "A browser cannot program a card: a card is added from the sattle.me Android app, with the card in hand.",
      store: "Get the app on Google Play",
      url: ANDROID_APP_URL
    },
    {
      device: "iphone" as const,
      says: "A browser cannot program a card: a card is added from the sattle.me iPhone app, with the card in hand.",
      store: "Get the app on the App Store",
      url: IOS_APP_URL
    }
  ])("on $device, sends to its app and its store, without a code", async (phone) => {
    const opened = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
    try {
      mockBrowser.device = phone.device;
      await render(<AddCardDialog visible onClose={jest.fn()} />);
      expect(screen.getByText(phone.says)).toBeTruthy();
      expect(screen.queryByText(/A computer/)).toBeNull();
      expect(screen.queryByTestId("add-card-code")).toBeNull();
      expect(screen.queryByTestId("qr-value")).toBeNull();
      // What to have before starting stays said.
      expect(screen.getByRole("header", { name: "Before you start" })).toBeTruthy();
      await fireEvent.press(screen.getByRole("link", { name: phone.store }));
      expect(opened).toHaveBeenCalledWith(phone.url);
    } finally {
      opened.mockRestore();
    }
  });

  it("on an iPad, says it of the device and gives the code, no store", async () => {
    mockBrowser.device = "ipad";
    await render(<AddCardDialog visible onClose={jest.fn()} />);
    expect(
      screen.getByText(
        "This device cannot read NFC cards: a card is added from the app, on your phone, with the card in hand."
      )
    ).toBeTruthy();
    expect(screen.getByTestId("qr-value")).toHaveTextContent("https://web.example/cards/pair");
    expect(screen.queryByTestId("app-store-link")).toBeNull();
  });

  it("on a computer, says it of a computer, no store", async () => {
    mockBrowser.device = "other";
    await render(<AddCardDialog visible onClose={jest.fn()} />);
    expect(
      screen.getByText(
        "A computer cannot read NFC cards: a card is added from the app, on your phone, with the card in hand."
      )
    ).toBeTruthy();
    expect(screen.getByTestId("qr-value")).toBeTruthy();
    expect(screen.queryByTestId("app-store-link")).toBeNull();
  });
});

describe("Add a card in the app on a device that reads no card (an iPad)", () => {
  // The tests' window, given back after each test.
  const WINDOW = { window: Dimensions.get("window"), screen: Dimensions.get("screen") };
  function windowOf(width: number, height: number) {
    Dimensions.set({
      window: { ...WINDOW.window, width, height },
      screen: { ...WINDOW.screen, width, height }
    });
  }
  afterEach(async () => {
    await act(async () => Dimensions.set(WINDOW));
  });

  it("says it of the device, the code beside the guide as on a computer", async () => {
    // An iPad held upright.
    windowOf(820, 1180);
    await render(<AddCardDialog visible onClose={jest.fn()} />);
    expect(
      screen.getByText(
        "This device cannot read NFC cards: a card is added from the app, on your phone, with the card in hand."
      )
    ).toBeTruthy();
    expect(screen.queryByText(/A computer/)).toBeNull();
    expect(screen.getByTestId("qr-value")).toHaveTextContent("https://web.example/cards/pair");
    expect(StyleSheet.flatten(screen.getByTestId("add-card-code").props.style).width).toBe(200);
  });

  it("puts the code under the guide on a narrow window, across the sheet", async () => {
    // A phone without NFC.
    windowOf(390, 844);
    await render(<AddCardDialog visible onClose={jest.fn()} />);
    expect(StyleSheet.flatten(screen.getByTestId("add-card-code").props.style).width).toBe("100%");
    expect(screen.getByTestId("qr-value")).toBeTruthy();
  });
});
