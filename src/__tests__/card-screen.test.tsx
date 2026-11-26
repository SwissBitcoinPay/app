import "@/i18n";

import { act, fireEvent, renderRouter, screen, waitFor } from "expo-router/testing-library";
import { Dimensions, Platform, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import CardScreen from "@/app/onboarding/card";
import OnboardingLayout from "@/app/onboarding/_layout";
import SetupScreen from "@/app/onboarding/setup";
import PendingScreen from "@/app/pending";
import { DEFAULT_CARD_RELAY_HOST } from "@/config/card";
import { closeAccount, getAccountSettings } from "@/features/account/session";
import { pairCard } from "@/features/card/pairing";
import { refreshCardStates, resetCardStates, withCardAccess } from "@/features/card/states";
import { connectWallet, disconnectWallet } from "@/lib/breez/wallet";
import { forgetDeviceKey } from "@/lib/card/device-key";
import { space } from "@/theme";

import { openTestAccount, testSeed } from "../../jest/account";
import { addRelay } from "../../jest/card-relay";
import type * as NotificationsFake from "../../jest/expo-notifications";
import { bottomInsetOf } from "../../jest/layout";
import type * as NfcFake from "../../jest/nfc-manager";
import type * as RelaysFake from "../../jest/nostr-relays";
import { FakeNtag424 } from "../../jest/ntag424";

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

const nfc = jest.requireMock<typeof NfcFake>("react-native-nfc-manager");
const notifications = jest.requireMock<typeof NotificationsFake>("expo-notifications");
const nostr = jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");

/**
 * A pairing goes through the relays, the card's APDUs and its cryptography, in real time: more
 * than findBy's default second on a busy runner.
 */
const SLOW = { timeout: 8000 };

const routes = {
  index: PendingScreen,
  pending: PendingScreen,
  // "Cards" itself is covered by cards-screen.test.tsx: here, where the sign-up leads.
  "cards/index": PendingScreen,
  "onboarding/_layout": OnboardingLayout,
  "onboarding/card": CardScreen,
  "onboarding/setup": SetupScreen
};

/** The steps of an addition, in their order, by their titles to come, then done. */
const STEPS_TO_COME = [
  "Notification permission",
  "Card's relay check",
  "Holding the card",
  "Card programming",
  "Card activation"
];
const STEPS_DONE = [
  "Notifications allowed",
  "Card's relay reachable",
  "Card held to the phone",
  "Card programmed",
  "Card activated"
];

/** The step titled `title`, as screen readers say it: its title, then its state. */
function stepSaid(title: string): string {
  const step = screen.getByLabelText(new RegExp(`^${title}: `));
  return String(step.props.accessibilityLabel);
}

/** As after the account's creation: its wallet connected, which the setup screen needs. */
async function connectTestWallet() {
  const apiKey = process.env.EXPO_PUBLIC_BREEZ_API_KEY;
  process.env.EXPO_PUBLIC_BREEZ_API_KEY = "test-api-key";
  try {
    await connectWallet(testSeed());
  } finally {
    if (apiKey === undefined) delete process.env.EXPO_PUBLIC_BREEZ_API_KEY;
    else process.env.EXPO_PUBLIC_BREEZ_API_KEY = apiKey;
  }
}

async function start() {
  await fireEvent.press(await screen.findByTestId("add-card-start", {}, SLOW));
}

beforeEach(async () => {
  nostr.resetRelays();
  nfc.resetNfcManager();
  resetCardStates();
  forgetDeviceKey();
  await openTestAccount({ usage: "card", signUp: "card" });
});

afterEach(async () => {
  closeAccount();
  await disconnectWallet();
});

describe("the sign-up's card step", () => {
  it('shows the steps to come first, asking nothing of the phone before "Start"', async () => {
    addRelay(DEFAULT_CARD_RELAY_HOST);
    const card = new FakeNtag424();
    nfc.holdCard(card);
    await renderRouter(routes, { initialUrl: "/onboarding/card" });

    expect(await screen.findByTestId("add-card-start", {}, SLOW)).toHaveTextContent("Start");
    expect(screen.getByTestId("card-steps-title")).toHaveTextContent("Before you start");
    for (const title of STEPS_TO_COME) {
      expect(stepSaid(title)).toMatch(new RegExp(`^${title}: to come, `));
    }
    // Neither the notifications nor the card asked for yet.
    expect(notifications.notifications.requests).toBe(0);
    expect(nfc.calls).toEqual([]);
    expect(card.received).toHaveLength(0);
  });

  it('keeps "Start" on the bottom safe area, counted once (as in "Cards")', async () => {
    // An iPhone's home indicator: the sign-up's layout leaves it to this screen.
    const insets = jest.mocked(useSafeAreaInsets);
    const original = insets.getMockImplementation();
    insets.mockReturnValue({ top: 47, right: 0, bottom: 34, left: 0 });
    try {
      await renderRouter(routes, { initialUrl: "/onboarding/card" });
      const start = await screen.findByTestId("add-card-start", {}, SLOW);
      expect(bottomInsetOf(start)).toBe(34 + space[5]);
    } finally {
      insets.mockImplementation(original);
    }
  });

  it("adds the card held to the phone once started, each step done, then offers to recharge it", async () => {
    const relay = addRelay(DEFAULT_CARD_RELAY_HOST);
    const card = new FakeNtag424();
    nfc.holdCard(card);
    await renderRouter(routes, { initialUrl: "/onboarding/card" });
    await start();

    expect(await screen.findByText("Card added", {}, SLOW)).toBeTruthy();
    expect(screen.getByText("Top it up to use it")).toBeTruthy();
    for (const title of STEPS_DONE) expect(stepSaid(title)).toMatch(new RegExp(`^${title}: done`));
    expect(screen.getByText("Top up the card")).toBeTruthy();
    expect(screen.getByText("Later")).toBeTruthy();
    expect(screen.queryByTestId("card-activation-pending")).toBeNull();
    expect(notifications.notifications.requests).toBe(1);
    expect(card.keyVersions).toEqual([1, 1, 1, 1, 1]);
    expect(relay.channels.size).toBe(1);
    // The sign-up goes on only once the holder chose.
    expect(getAccountSettings()).toMatchObject({ signUp: "card" });
  });

  it('ends the sign-up on "Later": the setup screen, then "Cards"', async () => {
    addRelay(DEFAULT_CARD_RELAY_HOST);
    nfc.holdCard(new FakeNtag424());
    await connectTestWallet();
    const router = await renderRouter(routes, { initialUrl: "/onboarding/card" });
    await start();

    await fireEvent.press(await screen.findByText("Later", {}, SLOW));
    expect(getAccountSettings()).toMatchObject({ usage: "card", signUp: "done" });
    await waitFor(() => expect(router.getPathname()).toBe("/cards"), SLOW);
    expect(router.getSearchParams()).toEqual({});
  });

  it('ends the sign-up on "Top up the card": "Cards", its "Top up" asked for the card', async () => {
    addRelay(DEFAULT_CARD_RELAY_HOST);
    nfc.holdCard(new FakeNtag424());
    await connectTestWallet();
    const router = await renderRouter(routes, { initialUrl: "/onboarding/card" });
    await start();

    await fireEvent.press(await screen.findByText("Top up the card", {}, SLOW));
    expect(getAccountSettings()).toMatchObject({ usage: "card", signUp: "done" });
    await waitFor(() => expect(router.getPathname()).toBe("/cards"), SLOW);
    const { states } = await withCardAccess(refreshCardStates);
    expect(states).toHaveLength(1);
    expect(router.getSearchParams()).toMatchObject({ added: states[0].cardId, open: "recharge" });
  });

  it("says when the card is programmed but its relay has not taken its channel yet", async () => {
    const relay = addRelay(DEFAULT_CARD_RELAY_HOST);
    const original = relay.handle.bind(relay);
    relay.handle = async (url, init) => {
      if (url.pathname.startsWith("/v1/channel")) throw new TypeError("Network request failed");
      return original(url, init);
    };
    nfc.holdCard(new FakeNtag424());
    await renderRouter(routes, { initialUrl: "/onboarding/card" });
    await start();

    expect(await screen.findByTestId("card-activation-pending", {}, SLOW)).toHaveTextContent(
      /its relay has not answered yet/
    );
    // Added, but its activation is to check.
    expect(screen.getByText("Card added")).toBeTruthy();
    // Not "Card activated": it does not pay yet.
    expect(stepSaid("Activation to finish")).toMatch(/^Activation to finish: to check/);
  });

  it("adds on a phone without a push token, and says the card pays with the app shown", async () => {
    addRelay(DEFAULT_CARD_RELAY_HOST);
    notifications.notifications.token = null;
    nfc.holdCard(new FakeNtag424());
    await renderRouter(routes, { initialUrl: "/onboarding/card" });
    await start();

    expect(await screen.findByTestId("card-activation-no-push", {}, SLOW)).toHaveTextContent(
      /this phone does not receive payment notifications: it pays only while the app is on screen/
    );
    expect(screen.getByText("Card added")).toBeTruthy();
    expect(screen.queryByTestId("card-activation-pending")).toBeNull();
  });

  it('says notifications refused at their step, with the settings, then adds on "Try again"', async () => {
    addRelay(DEFAULT_CARD_RELAY_HOST);
    notifications.answerPermission("denied");
    const card = new FakeNtag424();
    nfc.holdCard(card);
    await renderRouter(routes, { initialUrl: "/onboarding/card" });
    await start();

    expect(await screen.findByText("The card was not added", {}, SLOW)).toBeTruthy();
    expect(screen.getByText("Nothing was written to the card")).toBeTruthy();
    expect(stepSaid("Notifications refused")).toBe(
      "Notifications refused: failed, Allow them in the phone's settings, then try again."
    );
    // The steps not reached keep their title only.
    expect(stepSaid("Holding the card")).toBe("Holding the card: to come");
    expect(screen.getByTestId("card-step-notifications-fix")).toHaveTextContent(/Open settings$/);
    expect(card.received).toHaveLength(0);

    // Allowed in the system's settings meanwhile.
    notifications.notifications.permission = "granted";
    await fireEvent.press(screen.getByText("Try again"));
    expect(await screen.findByText("Card added", {}, SLOW)).toBeTruthy();
  });

  it("says NFC turned off on Android at the card's step, with its settings", async () => {
    const android = jest.replaceProperty(Platform, "OS", "android");
    try {
      addRelay(DEFAULT_CARD_RELAY_HOST);
      nfc.turnNfcOff();
      nfc.holdCard(new FakeNtag424());
      await renderRouter(routes, { initialUrl: "/onboarding/card" });
      await start();

      expect(await screen.findByText("The card was not added", {}, SLOW)).toBeTruthy();
      expect(stepSaid("NFC unavailable")).toMatch(
        /^NFC unavailable: failed, NFC is unavailable or turned off on this device/
      );
      // Before its notifications: none asked, nothing written.
      expect(notifications.notifications.requests).toBe(0);
      expect(screen.getByText("Nothing was written to the card")).toBeTruthy();
      // Its settings are Android's NFC screen, not the app's.
      await fireEvent.press(screen.getByTestId("card-step-card-fix"));
      expect(nfc.calls).toContain("goToNfcSetting");
    } finally {
      android.restore();
    }
  });

  it("says a session closed meanwhile under the steps, at none of them", async () => {
    addRelay(DEFAULT_CARD_RELAY_HOST);
    const card = new FakeNtag424();
    nfc.holdCard(card);
    await renderRouter(routes, { initialUrl: "/onboarding/card" });
    await screen.findByTestId("add-card-start", {}, SLOW);
    closeAccount();
    await start();

    expect(await screen.findByTestId("add-card-failure", {}, SLOW)).toHaveTextContent(
      /Your session is closed\. Log in again with your passkey, then try again\.$/
    );
    for (const title of STEPS_TO_COME) expect(stepSaid(title)).toBe(`${title}: to come`);
    expect(screen.getByText("Nothing was written to the card")).toBeTruthy();
    expect(card.received).toHaveLength(0);
  });

  it("tells a card that is not blank at the card's step", async () => {
    addRelay(DEFAULT_CARD_RELAY_HOST);
    const card = new FakeNtag424();
    card.keyVersions[0] = 3;
    nfc.holdCard(card);
    await renderRouter(routes, { initialUrl: "/onboarding/card" });
    await start();

    expect(await screen.findByText("The card was not added", {}, SLOW)).toBeTruthy();
    expect(stepSaid("Card not blank")).toMatch(
      /^Card not blank: failed, .*Ask its issuer to reset it first/
    );
    expect(stepSaid("Notifications allowed")).toMatch(/: done/);
    expect(stepSaid("Card's relay reachable")).toMatch(/: done/);
    expect(stepSaid("Card programming")).toBe("Card programming: to come");
  });

  it('goes back to the steps to come on "Cancel" while the card is awaited, its session ended', async () => {
    addRelay(DEFAULT_CARD_RELAY_HOST);
    nfc.waitForCard();
    await renderRouter(routes, { initialUrl: "/onboarding/card" });
    await start();

    await waitFor(() => expect(nfc.awaitingCard()).toBe(true), SLOW);
    // The tests run as on an iPhone.
    expect(screen.getByTestId("card-steps-title")).toHaveTextContent(
      "Hold the card above the phone"
    );
    expect(stepSaid("Waiting for the card")).toMatch(/^Waiting for the card: in progress/);
    await fireEvent.press(screen.getByText("Cancel"));

    expect(await screen.findByTestId("add-card-start", {}, SLOW)).toBeTruthy();
    await waitFor(() => expect(nfc.awaitingCard()).toBe(false));
    expect(nfc.calls).toContain("cancelTechnologyRequest");
    // A card held now is not programmed.
    const card = new FakeNtag424();
    nfc.holdCard(card);
    await act(async () => undefined);
    expect(card.received).toHaveLength(0);
  });

  it('leads nowhere while the card is written to: no "Cancel", the header\'s back greyed', async () => {
    addRelay(DEFAULT_CARD_RELAY_HOST);
    const card = new FakeNtag424();
    const release = card.pauseAt(0);
    nfc.holdCard(card);
    await renderRouter(routes, { initialUrl: "/onboarding/card" });
    expect(await screen.findByTestId("add-card-start", {}, SLOW)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Back" })).toBeEnabled();
    await start();

    expect(await screen.findByText("Keep the card in place", {}, SLOW)).toBeTruthy();
    expect(screen.queryByText("Cancel")).toBeNull();
    expect(screen.getByRole("button", { name: "Back" })).toBeDisabled();

    release();
    expect(await screen.findByText("Card added", {}, SLOW)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Back" })).toBeEnabled();
    expect(card.keyVersions).toEqual([1, 1, 1, 1, 1]);
  });

  it("shows the account's card already added, without asking for any card", async () => {
    addRelay(DEFAULT_CARD_RELAY_HOST);
    nfc.holdCard(new FakeNtag424());
    await pairCard({
      relayHost: DEFAULT_CARD_RELAY_HOST,
      channelName: "Card payments",
      messages: { alert: "Hold the BoltCard near the top of the phone." }
    });

    const other = new FakeNtag424("04a39493cc8680");
    nfc.holdCard(other);
    await renderRouter(routes, { initialUrl: "/onboarding/card" });
    expect(await screen.findByText("Card added", {}, SLOW)).toBeTruthy();
    // Its steps were another screen's: none shown.
    expect(screen.queryByTestId("card-step-programming")).toBeNull();
    expect(screen.queryByTestId("add-card-start")).toBeNull();
    expect(other.received).toHaveLength(0);
  });
});

describe("the card step in the app on a device that reads no card (an iPad)", () => {
  const extra = jest.requireMock<{ default: { expoConfig: { extra: Record<string, unknown> } } }>(
    "expo-constants"
  ).default.expoConfig.extra;
  // The tests' window (a phone's), given back after each test.
  const PHONE_WINDOW = { window: Dimensions.get("window"), screen: Dimensions.get("screen") };
  afterEach(async () => {
    delete extra.appVariant;
    delete extra.webAppOrigin;
    await act(async () => Dimensions.set(PHONE_WINDOW));
  });

  it("gives the computer's code at any width, said of the device, and waits for the phone", async () => {
    // The staging build, whose web app the phone's app opens; an iPad held upright.
    extra.appVariant = "staging";
    extra.webAppOrigin = "https://web.example";
    Dimensions.set({
      window: { ...PHONE_WINDOW.window, width: 820, height: 1180 },
      screen: { ...PHONE_WINDOW.screen, width: 820, height: 1180 }
    });
    nfc.removeNfc();
    await renderRouter(routes, { initialUrl: "/onboarding/card" });
    expect(await screen.findByTestId("onboarding-card-computer", {}, SLOW)).toBeTruthy();
    expect(screen.getByText("Add your card from your phone")).toBeTruthy();
    expect(
      screen.getByText(
        "This device cannot read NFC cards. Scan this code with your phone: it opens the app, where you log in with the same passkey. Then hold the card to the phone."
      )
    ).toBeTruthy();
    expect(
      screen.getByLabelText("QR code that opens this step in the app on your phone")
    ).toBeTruthy();
    // Beside the text, as on a computer.
    expect(StyleSheet.flatten(screen.getByTestId("card-code-row").props.style)).toMatchObject({
      flexDirection: "row"
    });
    expect(screen.getByTestId("card-waiting")).toHaveTextContent(
      "Waiting for your phone: this screen continues as soon as the card is added."
    );
    expect(screen.queryByTestId("add-card-start")).toBeNull();
    // Nothing asked of an NFC it has not, nor of the notifications.
    expect(nfc.calls).toEqual([]);
    expect(notifications.notifications.requests).toBe(0);
  });

  it("puts the code under the text on a narrow window, and says nothing of a code without one", async () => {
    extra.appVariant = "staging";
    extra.webAppOrigin = "https://web.example";
    // A phone without NFC.
    Dimensions.set({
      window: { ...PHONE_WINDOW.window, width: 390, height: 844 },
      screen: { ...PHONE_WINDOW.screen, width: 390, height: 844 }
    });
    nfc.removeNfc();
    const view = await renderRouter(routes, { initialUrl: "/onboarding/card" });
    expect(await screen.findByTestId("onboarding-card-computer", {}, SLOW)).toBeTruthy();
    expect(StyleSheet.flatten(screen.getByTestId("card-code-row").props.style).flexDirection).toBe(
      undefined
    );
    await view.unmount();

    // A build without a web app (no RP ID): nothing for the phone's app to open, no code.
    delete extra.appVariant;
    delete extra.webAppOrigin;
    await renderRouter(routes, { initialUrl: "/onboarding/card" });
    expect(await screen.findByTestId("onboarding-card-computer", {}, SLOW)).toBeTruthy();
    expect(
      screen.getByText(
        "This device cannot read NFC cards. Open the app on your phone and log in with the same passkey, then hold the card to the phone."
      )
    ).toBeTruthy();
    expect(
      screen.queryByLabelText("QR code that opens this step in the app on your phone")
    ).toBeNull();
    expect(screen.queryByText(/Scan/)).toBeNull();
  });

  it("shows the card the phone added, with what ends the sign-up", async () => {
    addRelay(DEFAULT_CARD_RELAY_HOST);
    nfc.holdCard(new FakeNtag424());
    await pairCard({
      relayHost: DEFAULT_CARD_RELAY_HOST,
      channelName: "Card payments",
      messages: { alert: "Hold the BoltCard near the top of the phone." }
    });
    const calls = nfc.calls.length;
    nfc.removeNfc();
    await renderRouter(routes, { initialUrl: "/onboarding/card" });
    expect(await screen.findByTestId("onboarding-card-added", {}, SLOW)).toBeTruthy();
    expect(screen.getByTestId("card-added-recharge")).toBeTruthy();
    expect(screen.getByTestId("card-added-later")).toBeTruthy();
    expect(nfc.calls).toHaveLength(calls);
  });
});
