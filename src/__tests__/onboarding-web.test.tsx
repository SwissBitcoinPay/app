import "@/i18n";

import { hexToBytes } from "@noble/hashes/utils.js";
import { Slot } from "expo-router";
import { act, fireEvent, renderRouter, screen, waitFor } from "expo-router/testing-library";
import { Dimensions, Linking, Platform, StyleSheet } from "react-native";

import CardScreen from "@/app/onboarding/card";
import SetupScreen from "@/app/onboarding/setup";
import PendingScreen from "@/app/pending";
import { ANDROID_APP_URL, IOS_APP_URL } from "@/config/app-stores";
import {
  CARD_ADDED_READ_MS,
  DEFAULT_CARD_DAY_SATS,
  DEFAULT_CARD_PAYMENT_SATS,
  DEFAULT_CARD_PAYMENTS_PER_HOUR,
  DEFAULT_CARD_RELAY_HOST
} from "@/config/card";
import { closeAccount, getAccountSettings } from "@/features/account/session";
import { resetCardStates } from "@/features/card/states";
import { OnboardingHeader } from "@/features/onboarding/OnboardingHeader";
import { OnboardingProvider } from "@/features/onboarding/state";
import type { BrowserDevice } from "@/lib/browser-device";
import { walletSecret } from "@/lib/breez/seed";
import { disconnectWallet } from "@/lib/breez/wallet";
import {
  cardStateEvent,
  deriveCardRecordKeys,
  type CardState,
  type CardStatus
} from "@/lib/card/card-record";
import { cardIdOf, deriveCardRoot } from "@/lib/card/keys";
import { publishToRelays } from "@/lib/nostr/pool";
import * as terminalProfile from "@/lib/terminal/profile";
import { currentRelays } from "@/lib/relays/current";

import { openTestAccount, testSeed } from "../../jest/account";
import type * as BreezFake from "../../jest/breez-sdk";
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
jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    expoConfig: {
      extra: { breezNetwork: "mainnet", eas: { projectId: "00000000-0000-4000-8000-000000000000" } }
    }
  }
}));
// The variant's web app (read through `?.`: the step's module loads before this file sets it).
const mockOrigin: { value: string | null } = { value: null };
jest.mock("@/config/card", () => ({
  ...jest.requireActual<typeof import("@/config/card")>("@/config/card"),
  getCardAddingOrigin: () => mockOrigin?.value ?? null
}));

// The web app's device (browser-device.ts), set by a test: none, as in the apps, by default.
const mockBrowser: { device: BrowserDevice | null } = { device: null };
jest.mock("@/lib/browser-device", () => ({ browserDevice: () => mockBrowser?.device ?? null }));

/** The SDK the wallet layer runs on here (its native module): its account connections counted. */
const breezSdk = jest.requireMock<typeof BreezFake>("@breeztech/breez-sdk-spark-react-native");

/** The account's cards are read from relays, in real time: more than findBy's default second. */
const SLOW = { timeout: 8000 };

const routes = {
  index: PendingScreen,
  pending: PendingScreen,
  // "Cards" itself is covered by cards-screen.test.tsx: here, where the sign-up leads.
  "cards/index": PendingScreen,
  // The sign-up's layout without its stack: on the web, a stack measures its frame, which Jest
  // cannot (it has no layout).
  "onboarding/_layout": () => (
    <OnboardingProvider>
      <OnboardingHeader />
      <Slot />
    </OnboardingProvider>
  ),
  "onboarding/card": CardScreen,
  "onboarding/setup": SetupScreen
};

const root = deriveCardRoot(walletSecret(testSeed()));
const keys = deriveCardRecordKeys(root);

/**
 * The phone adds a card while the web app shows: only the relays know its record, as the phone
 * wrote it (signed with the account's keys). Returns its id.
 */
async function addedOnPhone(
  uid: string,
  status: CardStatus = "active",
  updatedAt = Math.floor(Date.now() / 1000)
): Promise<string> {
  const cardId = cardIdOf(root, hexToBytes(uid));
  const state: CardState = {
    cardId,
    uid,
    keyVersion: 1,
    status,
    relayHost: DEFAULT_CARD_RELAY_HOST,
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
    updatedAt
  };
  await act(async () => {
    await publishToRelays(cardStateEvent(keys, state), {
      relays: currentRelays(),
      channel: "account",
      timeoutMs: 1000,
      authKey: keys.nostr.secretKey
    });
  });
  return cardId;
}

/** The account's cards read so far: each read asks every relay for their records' author. */
function cardReads(): number {
  return nostr.calls.filter(
    (call) =>
      call.operation === "query" && call.filter?.authors?.includes(keys.nostr.publicKey) === true
  ).length;
}

/** One more read of the cards, as the page does every CARD_ADDED_READ_MS. */
async function readAgain() {
  const before = cardReads();
  await act(async () => {
    await jest.advanceTimersByTimeAsync(CARD_ADDED_READ_MS);
  });
  await waitFor(() => expect(cardReads()).toBeGreaterThan(before), SLOW);
}

// The tests' window (a phone's), given back after each test.
const PHONE_WINDOW = { window: Dimensions.get("window"), screen: Dimensions.get("screen") };
/** A computer's window, as the design draws it. */
function computerWindow() {
  Dimensions.set({
    window: { ...PHONE_WINDOW.window, width: 1440, height: 900 },
    screen: { ...PHONE_WINDOW.screen, width: 1440, height: 900 }
  });
}

let web: jest.ReplaceProperty<typeof Platform.OS>;

beforeEach(async () => {
  // The web app, its memory empty: it knows of the account's cards what the relays hold only.
  web = jest.replaceProperty(Platform, "OS", "web");
  nostr.resetRelays();
  resetCardStates();
  mockOrigin.value = "https://web.example";
  // Its clock in the test's hands (each step of real time advances it too).
  jest.useFakeTimers({ advanceTimers: true });
  await openTestAccount({ usage: "card", signUp: "card" });
});

afterEach(async () => {
  mockBrowser.device = null;
  jest.useRealTimers();
  closeAccount();
  await disconnectWallet();
  web.restore();
  await act(async () => Dimensions.set(PHONE_WINDOW));
});

describe("the sign-up's card step on a computer", () => {
  beforeEach(() => computerWindow());

  it("gives a code that opens this step in the app on the phone, and waits for its card", async () => {
    await renderRouter(routes, { initialUrl: "/onboarding/card" });
    expect(await screen.findByTestId("onboarding-card-computer")).toBeTruthy();
    expect(screen.getByText("Add your card from your phone")).toBeTruthy();
    expect(
      screen.getByText(
        "A computer cannot read NFC cards. Scan this code with your phone: it opens the app, where you log in with the same passkey. Then hold the card to the phone."
      )
    ).toBeTruthy();
    // The address of the variant's web app, all of whose pages the phone's app opens.
    const code = screen.getByTestId("qr-value");
    expect(code).toHaveTextContent("https://web.example/onboarding/card");
    expect(code.props.accessibilityLabel).toBe(
      "QR code that opens this step in the app on your phone"
    );
    expect(screen.getByTestId("card-waiting")).toHaveTextContent(
      "Waiting for your phone: this page continues as soon as the card is added."
    );
    // Nothing to press: the page goes on by itself.
    expect(screen.queryByTestId("card-added-recharge")).toBeNull();
    expect(screen.queryByRole("button", { name: "Later" })).toBeNull();
    // The account's cards read at once, then again.
    await waitFor(() => expect(cardReads()).toBeGreaterThan(0), SLOW);
    await readAgain();
    await readAgain();
    expect(getAccountSettings()).toMatchObject({ signUp: "card" });
  });

  it("shows no code without a web app for the phone's app to open", async () => {
    mockOrigin.value = null;
    await renderRouter(routes, { initialUrl: "/onboarding/card" });
    expect(await screen.findByTestId("card-waiting")).toBeTruthy();
    expect(screen.queryByTestId("qr-value")).toBeNull();
  });

  it('shows the card the phone added meanwhile, then ends the sign-up on "Later"', async () => {
    const router = await renderRouter(routes, { initialUrl: "/onboarding/card" });
    expect(await screen.findByTestId("card-waiting")).toBeTruthy();
    await waitFor(() => expect(cardReads()).toBeGreaterThan(0), SLOW);

    const cardId = await addedOnPhone("04a39493cc8680");
    // Not read yet: still waiting.
    expect(screen.getByTestId("card-waiting")).toBeTruthy();
    await readAgain();
    expect(await screen.findByTestId("onboarding-card-added", {}, SLOW)).toBeTruthy();
    expect(screen.getByText("Your card is added")).toBeTruthy();
    expect(
      screen.getByText(
        "Added from your phone, it also shows here, in “Cards”. Top it up to use it."
      )
    ).toBeTruthy();
    expect(screen.queryByTestId("card-waiting")).toBeNull();
    // The sign-up goes on only once its holder chose.
    expect(getAccountSettings()).toMatchObject({ signUp: "card" });

    await fireEvent.press(screen.getByRole("button", { name: "Later" }));
    expect(getAccountSettings()).toMatchObject({ usage: "card", signUp: "done" });
    await waitFor(() => expect(router.getPathname()).toBe("/cards"), SLOW);
    expect(router.getSearchParams()).toEqual({});
    expect(cardId).toHaveLength(32);
    // A card holder's device, prepared without any wallet of the account's (no main wallet, nor
    // point of sale).
    await expect(terminalProfile.loadTerminalProfile()).resolves.toMatchObject({ version: 4 });
    expect(breezSdk.accountConnections.count).toBe(0);
  });

  it('ends the sign-up on "Top up the card": "Cards", its "Top up" asked for the card', async () => {
    const router = await renderRouter(routes, { initialUrl: "/onboarding/card" });
    expect(await screen.findByTestId("card-waiting")).toBeTruthy();
    const cardId = await addedOnPhone("04a39493cc8680");
    await readAgain();

    await fireEvent.press(await screen.findByTestId("card-added-recharge", {}, SLOW));
    expect(getAccountSettings()).toMatchObject({ usage: "card", signUp: "done" });
    await waitFor(() => expect(router.getPathname()).toBe("/cards"), SLOW);
    expect(router.getSearchParams()).toMatchObject({ added: cardId, open: "recharge" });
  });

  it("shows the account's card already added at once, without waiting", async () => {
    await addedOnPhone("04a39493cc8680");
    await renderRouter(routes, { initialUrl: "/onboarding/card" });
    // From its first read, before any read again (the clock follows real time: bounded under it).
    expect(
      await screen.findByTestId("onboarding-card-added", {}, { timeout: CARD_ADDED_READ_MS - 1000 })
    ).toBeTruthy();
    expect(cardReads()).toBe(currentRelays().length);
    expect(screen.queryByTestId("card-waiting")).toBeNull();
  });

  it("takes the card the phone added last when the account has several", async () => {
    const now = Math.floor(Date.now() / 1000);
    await addedOnPhone("04a39493cc8680", "active", now - 60);
    const last = await addedOnPhone("04b1c2d3e4f501", "active", now);
    const router = await renderRouter(routes, { initialUrl: "/onboarding/card" });
    await fireEvent.press(await screen.findByTestId("card-added-recharge", {}, SLOW));
    await waitFor(() => expect(router.getPathname()).toBe("/cards"), SLOW);
    expect(router.getSearchParams()).toMatchObject({ added: last, open: "recharge" });
  });

  it("never takes a card being migrated, reset or deleted for a card added", async () => {
    await addedOnPhone("04a39493cc8680", "migrating");
    await addedOnPhone("04b1c2d3e4f501", "deleted");
    await addedOnPhone("04c2d3e4f50612", "reset");
    await renderRouter(routes, { initialUrl: "/onboarding/card" });
    expect(await screen.findByTestId("card-waiting")).toBeTruthy();
    await waitFor(() => expect(cardReads()).toBeGreaterThan(0), SLOW);
    await readAgain();
    expect(screen.queryByTestId("onboarding-card-added")).toBeNull();

    // The migration ends on the phone: the card is in service, and added.
    await addedOnPhone("04a39493cc8680", "active", Math.floor(Date.now() / 1000) + 1);
    await readAgain();
    expect(await screen.findByTestId("onboarding-card-added", {}, SLOW)).toBeTruthy();
  });

  it("keeps waiting while the relays answer not, and shows the card once they do", async () => {
    for (const url of currentRelays()) nostr.unreachable.add(url);
    await renderRouter(routes, { initialUrl: "/onboarding/card" });
    expect(await screen.findByTestId("card-waiting")).toBeTruthy();
    await waitFor(() => expect(cardReads()).toBeGreaterThan(0), SLOW);
    await readAgain();
    // Nothing read is no card added: still waiting, read again.
    expect(screen.getByTestId("card-waiting")).toBeTruthy();
    expect(screen.queryByTestId("onboarding-card-added")).toBeNull();

    // Back, with the record the phone wrote meanwhile.
    nostr.unreachable.clear();
    await addedOnPhone("04a39493cc8680");
    await readAgain();
    expect(await screen.findByTestId("onboarding-card-added", {}, SLOW)).toBeTruthy();
  });

  it("stops reading the cards once the sign-up ended", async () => {
    await addedOnPhone("04a39493cc8680");
    const router = await renderRouter(routes, { initialUrl: "/onboarding/card" });
    await fireEvent.press(await screen.findByRole("button", { name: "Later" }, SLOW));
    await waitFor(() => expect(router.getPathname()).toBe("/cards"), SLOW);
    const reads = cardReads();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(CARD_ADDED_READ_MS * 3);
    });
    expect(cardReads()).toBe(reads);
  });
});

describe("the sign-up's card step in a phone's browser", () => {
  it("says to go on in the app, then shows the card added there", async () => {
    await renderRouter(routes, { initialUrl: "/onboarding/card" });
    expect(await screen.findByText("Pair your BoltCard from the app")).toBeTruthy();
    expect(screen.queryByTestId("onboarding-card-computer")).toBeNull();
    expect(screen.queryByTestId("qr-value")).toBeNull();
    // "Back", under the text, as the header's back.
    expect(screen.getByText("Back")).toBeTruthy();
    await waitFor(() => expect(cardReads()).toBeGreaterThan(0), SLOW);

    await addedOnPhone("04a39493cc8680");
    await readAgain();
    expect(await screen.findByTestId("onboarding-card-added", {}, SLOW)).toBeTruthy();
    expect(screen.getByTestId("card-added-recharge")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Later" })).toBeTruthy();
  });

  // The phone's own app, and its store.
  it.each([
    {
      device: "android" as const,
      says: "A browser cannot program a card. Open the sattle.me Android app on this phone, or install it, then log in with your passkey: the pairing will resume in the app.",
      store: "Get the app on Google Play",
      url: ANDROID_APP_URL
    },
    {
      device: "iphone" as const,
      says: "A browser cannot program a card. Open the sattle.me iPhone app on this phone, or install it, then log in with your passkey: the pairing will resume in the app.",
      store: "Get the app on the App Store",
      url: IOS_APP_URL
    }
  ])("on $device, names its app and links to its store, at any width", async (phone) => {
    const opened = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
    try {
      mockBrowser.device = phone.device;
      // Told by the device, not the width: a tablet held sideways is no computer.
      computerWindow();
      await renderRouter(routes, { initialUrl: "/onboarding/card" });
      expect(await screen.findByText(phone.says)).toBeTruthy();
      expect(screen.queryByTestId("onboarding-card-computer")).toBeNull();
      expect(screen.queryByTestId("qr-value")).toBeNull();
      await fireEvent.press(screen.getByRole("link", { name: phone.store }));
      expect(opened).toHaveBeenCalledWith(phone.url);
    } finally {
      opened.mockRestore();
    }
  });

  it("on an iPad, gives the code for the phone, said of the device, at any width", async () => {
    mockBrowser.device = "ipad";
    await renderRouter(routes, { initialUrl: "/onboarding/card" });
    expect(await screen.findByTestId("onboarding-card-computer")).toBeTruthy();
    expect(
      screen.getByText(
        "This device cannot read NFC cards. Scan this code with your phone: it opens the app, where you log in with the same passkey. Then hold the card to the phone."
      )
    ).toBeTruthy();
    expect(screen.getByTestId("qr-value")).toHaveTextContent("https://web.example/onboarding/card");
    // A page of the web app, which goes on once the card is added.
    expect(screen.getByTestId("card-waiting")).toHaveTextContent(
      "Waiting for your phone: this page continues as soon as the card is added."
    );
    expect(screen.queryByTestId("app-store-link")).toBeNull();
  });
});

describe("the setup screen on a computer", () => {
  beforeEach(() => computerWindow());

  it("centres its title, what it does and the spinner while it waits", async () => {
    // The account's backup reaches no relay here.
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    let saved!: () => void;
    const save = jest
      .spyOn(terminalProfile, "saveTerminalProfile")
      .mockImplementationOnce(() => new Promise<void>((resolve) => (saved = resolve)));
    try {
      await openTestAccount({ usage: "card", signUp: "done" });
      const router = await renderRouter(routes, { initialUrl: "/onboarding/setup" });
      await waitFor(() => expect(save).toHaveBeenCalled(), SLOW);

      // At the height of every step's title, still 28 px, centred as the spinner under it.
      const title = screen.getByRole("header", { name: "Setting up your account…" });
      expect(StyleSheet.flatten(title.props.style)).toMatchObject({
        fontSize: 28,
        textAlign: "center"
      });
      expect(
        StyleSheet.flatten(
          screen.getByText("Preparing your account on this device. This only takes a moment.").props
            .style
        ).textAlign
      ).toBe("center");
      const progress = screen.getByRole("progressbar");
      expect(StyleSheet.flatten(progress.props.style).alignItems).toBe("center");
      // The spinner's own frame does not pull it back to the column's start.
      let frame = screen.getByTestId("account-setup-spinner", {
        includeHiddenElements: true
      }).parent;
      while (frame && typeof frame.type !== "string") frame = frame.parent;
      expect(frame).toBeTruthy();
      expect(StyleSheet.flatten(frame?.props.style).alignSelf).toBeUndefined();

      await act(async () => saved());
      await waitFor(() => expect(router.getPathname()).toBe("/cards"), SLOW);
    } finally {
      save.mockRestore();
      warn.mockRestore();
    }
  });

  it('says a failure under its title, then "Try again" opens "Cards"', async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    // The card holder's profile not saved (this browser's storage refused it): the device is not
    // prepared.
    const save = jest
      .spyOn(terminalProfile, "saveTerminalProfile")
      .mockRejectedValueOnce(new Error("QuotaExceededError"));
    try {
      await openTestAccount({ usage: "card", signUp: "done" });
      const router = await renderRouter(routes, { initialUrl: "/onboarding/setup" });
      expect(await screen.findByTestId("account-setup-failure", {}, SLOW)).toBeTruthy();
      expect(
        screen.getByText("Your account could not be prepared on this device. Try again.")
      ).toBeTruthy();
      // Its title as every step's on a computer, centred as its message.
      const title = screen.getByRole("header", { name: "Setup interrupted" });
      expect(StyleSheet.flatten(title.props.style)).toMatchObject({
        fontSize: 28,
        textAlign: "center"
      });
      const message = screen.getByRole("alert");
      expect(StyleSheet.flatten(message.props.style).textAlign).toBe("center");
      // Its icon above it: beside it, the icon would stay at the start once the text wraps.
      const failure = StyleSheet.flatten(screen.getByTestId("account-setup-failure").props.style);
      expect(failure.flexDirection).not.toBe("row");
      expect(failure.alignItems).toBe("center");
      expect(
        screen.queryByTestId("account-setup-spinner", { includeHiddenElements: true })
      ).toBeNull();

      await fireEvent.press(screen.getByTestId("account-setup-retry"));
      await waitFor(() => expect(router.getPathname()).toBe("/cards"), SLOW);
      expect(breezSdk.accountConnections.count).toBe(0);
    } finally {
      save.mockRestore();
      warn.mockRestore();
    }
  });
});
