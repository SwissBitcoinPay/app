import "@/i18n";

import { renderRouter, screen, within } from "expo-router/testing-library";
import { StyleSheet } from "react-native";
import { useSafeAreaInsets, type EdgeInsets } from "react-native-safe-area-context";

import WelcomeScreen from "@/app/index";
import OnboardingLayout from "@/app/onboarding/_layout";
import SplitScreen from "@/app/onboarding/split";
import { closeAccount } from "@/features/account/session";

import { openTestAccount } from "../../jest/account";
import type * as FileSystemFake from "../../jest/expo-file-system";
import type * as RelaysFake from "../../jest/nostr-relays";

jest.mock("../lib/breez/wallet", () => ({
  checkWalletConfig: jest.fn(),
  connectWallet: jest.fn(async () => ({})),
  disconnectWallet: jest.fn(async () => undefined),
  getWalletId: jest.fn(
    async () => "02c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5"
  )
}));

// A tablet wide enough for the desktop layout: an iPad Pro is 1024 pt wide in portrait.
jest.mock("@/components/layout/useIsDesktop", () => ({
  ...jest.requireActual("@/components/layout/useIsDesktop"),
  useIsDesktop: () => true
}));

// Status bar 24 pt, home indicator 20 pt (iPads with Face ID).
const IPAD: EdgeInsets = { top: 24, right: 0, bottom: 20, left: 0 };
// Status bar 24 dp, three-button navigation bar 48 dp (Android draws the app under both).
const ANDROID_TABLET: EdgeInsets = { top: 24, right: 0, bottom: 48, left: 0 };

// The in-memory expo-file-system and Nostr relays of jest.setup.ts.
const fileSystem = jest.requireMock<typeof FileSystemFake>("expo-file-system");
const relays = jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");

const routes = {
  index: WelcomeScreen,
  "onboarding/_layout": OnboardingLayout,
  "onboarding/split": SplitScreen
};

type Node = typeof screen.container;

/**
 * Padding and margin of the element's ancestors on one edge: what keeps it off that edge of the
 * screen, Jest having no layout. A scroll view's content container style counts too: its Jest mock
 * keeps it as a prop instead of styling an inner view.
 */
function offset(element: Node, edge: "Top" | "Bottom"): number {
  let total = 0;
  for (let node = element.parent; node; node = node.parent) {
    for (const styles of [node.props.style, node.props.contentContainerStyle]) {
      const style = StyleSheet.flatten(styles) ?? {};
      total += Number(style[`padding${edge}`] ?? style.paddingVertical ?? style.padding ?? 0);
      total += Number(style[`margin${edge}`] ?? style.marginVertical ?? style.margin ?? 0);
    }
  }
  return total;
}

const logo = () => screen.getByLabelText("sattle.me");

function setInsets(insets: EdgeInsets) {
  jest.mocked(useSafeAreaInsets).mockReturnValue(insets);
}

describe("desktop layout on a tablet", () => {
  // The steps need an open account: a new one for each test.
  beforeEach(() => {
    fileSystem.resetFileSystem();
    relays.resetRelays();
    closeAccount();
    return openTestAccount();
  });

  afterEach(() => {
    jest.mocked(useSafeAreaInsets).mockReset();
  });

  it("starts the welcome screen's header under the status bar", async () => {
    setInsets(IPAD);
    await renderRouter(routes, { initialUrl: "/" });
    expect(offset(logo(), "Top")).toBe(IPAD.top);
  });

  it("offers to join a team by invitation, with the QR code's icon: a tablet, however wide", async () => {
    setInsets(IPAD);
    await renderRouter(routes, { initialUrl: "/" });
    const join = screen.getByTestId("join-team");
    expect(within(join).getByText("Join by invitation")).toBeTruthy();
    expect(within(join).getByText(String.fromCodePoint(0xf029))).toBeTruthy(); // qrcode
    expect(within(join).queryByText(String.fromCodePoint(0xf0c1))).toBeNull(); // link
    // Rows of "I already have", above the 44 px touch floor.
    for (const row of [join, screen.getByTestId("login")]) {
      const content = row.children[0];
      if (typeof content === "string") throw new Error("A row's content is a view");
      expect(StyleSheet.flatten(content.props.style).minHeight).toBe(62);
    }
  });

  it("starts the steps' header under the status bar, its logo where the welcome screen has it", async () => {
    setInsets(IPAD);
    await renderRouter(routes, { initialUrl: "/onboarding/split" });
    expect(screen.getByTestId("split-continue")).toBeTruthy();
    expect(offset(logo(), "Top")).toBe(IPAD.top);
  });

  it("keeps its margins above a home indicator lower than them", async () => {
    setInsets(IPAD);
    await renderRouter(routes, { initialUrl: "/" });
    expect(offset(screen.getByTestId("login"), "Bottom")).toBe(40);

    await renderRouter(routes, { initialUrl: "/onboarding/split" });
    expect(offset(screen.getByTestId("split-continue"), "Bottom")).toBe(24);
  });

  it("ends the content above an Android navigation bar taller than its margins", async () => {
    setInsets(ANDROID_TABLET);
    await renderRouter(routes, { initialUrl: "/" });
    expect(offset(screen.getByTestId("login"), "Bottom")).toBe(ANDROID_TABLET.bottom);

    await renderRouter(routes, { initialUrl: "/onboarding/split" });
    expect(offset(screen.getByTestId("split-continue"), "Bottom")).toBe(ANDROID_TABLET.bottom);
  });
});
