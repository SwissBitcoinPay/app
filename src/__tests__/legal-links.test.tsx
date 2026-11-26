import "@/i18n";

import { render } from "@testing-library/react-native";
import { fireEvent, renderRouter, screen } from "expo-router/testing-library";
import { Linking, StyleSheet } from "react-native";

import WelcomeScreen from "@/app/index";
import PendingScreen from "@/app/pending";
import { LegalLinks } from "@/components/LegalLinks";
import { LEGAL_URLS } from "@/config/legal";
import i18n from "@/i18n";
import { LANGUAGES } from "@/i18n/languages";
import { lightColors as colors } from "@/theme";

// The welcome screen loads the passkey support on mount: not under test here.
jest.mock("../lib/breez/passkey", () => ({
  createPasskeyWallet: jest.fn(),
  preparePasskeys: jest.fn(async () => undefined),
  passkeysReady: jest.fn(() => true),
  signInWithPasskey: jest.fn()
}));

const routes = { index: WelcomeScreen, pending: PendingScreen };

let openURL: jest.SpyInstance;
beforeEach(() => {
  openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
});
afterEach(() => openURL.mockRestore());

/** The `testID`s of the screen's elements, in the order they are drawn (top to bottom). */
function testIDsInOrder(): string[] {
  type Node = { props: Record<string, unknown>; children: (Node | string)[] | null };
  const ids: string[] = [];
  const walk = (node: Node | Node[] | string | null) => {
    if (node === null || typeof node === "string") return;
    if (Array.isArray(node)) return node.forEach(walk);
    if (typeof node.props.testID === "string") ids.push(node.props.testID);
    (node.children ?? []).forEach(walk);
  };
  walk(screen.toJSON() as Node | Node[] | null);
  return ids;
}

describe("the legal documents' addresses", () => {
  it("are sattle.me's published pages, in HTTPS", () => {
    // Read by the App Store's and Google Play's reviewers: a change is a change of the stores'
    // metadata too.
    expect(LEGAL_URLS).toEqual({
      terms: "https://sattle.me/terms",
      privacy: "https://sattle.me/privacy"
    });
  });
});

describe("the legal documents' titles", () => {
  it.each(LANGUAGES)("are translated in %s, each its own", (language) => {
    const t = i18n.getFixedT(language);
    const terms = t("legal.terms");
    const privacy = t("legal.privacy");
    for (const title of [terms, privacy]) {
      expect(title.trim()).not.toBe("");
      expect(title).not.toMatch(/^legal\./);
    }
    expect(terms).not.toBe(privacy);
  });
});

describe("LegalLinks", () => {
  it("links the terms, then the privacy policy, each opening its page outside the app", async () => {
    await render(<LegalLinks testID="legal" />);
    const terms = screen.getByTestId("legal-terms");
    const privacy = screen.getByTestId("legal-privacy");
    expect(terms).toHaveTextContent("Terms and conditions");
    expect(privacy).toHaveTextContent("Privacy policy");
    for (const link of [terms, privacy]) expect(link.props.accessibilityRole).toBe("link");
    // Each as high as the touch floor: react-native-web ignores `hitSlop`.
    expect(StyleSheet.flatten(privacy.props.style)).toMatchObject({ minHeight: 44 });

    await fireEvent.press(privacy);
    expect(openURL).toHaveBeenLastCalledWith(LEGAL_URLS.privacy);
    await fireEvent.press(terms);
    expect(openURL).toHaveBeenLastCalledWith(LEGAL_URLS.terms);
    expect(openURL).toHaveBeenCalledTimes(2);
  });

  it("shows only the documents asked", async () => {
    await render(<LegalLinks documents={["privacy"]} testID="legal" />);
    expect(screen.getByTestId("legal-privacy")).toBeTruthy();
    expect(screen.queryByTestId("legal-terms")).toBeNull();
  });

  it("writes in the accent's text colour, dimmed white over ink, underlined when pointed at", async () => {
    await render(<LegalLinks testID="legal" />);
    const label = () => screen.getByText("Privacy policy");
    expect(StyleSheet.flatten(label().props.style)).toMatchObject({
      color: colors.text.accent
    });
    expect(StyleSheet.flatten(label().props.style).textDecorationLine).toBeUndefined();
    await fireEvent(screen.getByTestId("legal-privacy"), "hoverIn");
    expect(StyleSheet.flatten(label().props.style)).toMatchObject({
      textDecorationLine: "underline"
    });

    await render(<LegalLinks onDark testID="legal" />);
    expect(StyleSheet.flatten(label().props.style)).toMatchObject({
      color: colors.onDark.muted
    });
    await fireEvent(screen.getByTestId("legal-privacy"), "hoverIn");
    expect(StyleSheet.flatten(label().props.style)).toMatchObject({
      color: colors.onDark.text,
      textDecorationLine: "underline"
    });
  });

  it("centres the links, or lines them up at the start (the side bar)", async () => {
    await render(<LegalLinks testID="legal" />);
    expect(StyleSheet.flatten(screen.getByTestId("legal").props.style)).toMatchObject({
      justifyContent: "center"
    });
    expect(StyleSheet.flatten(screen.getByText("Privacy policy").props.style)).toMatchObject({
      textAlign: "center"
    });

    await render(<LegalLinks align="start" testID="legal" />);
    expect(StyleSheet.flatten(screen.getByTestId("legal").props.style)).toMatchObject({
      justifyContent: "flex-start"
    });
    expect(StyleSheet.flatten(screen.getByText("Privacy policy").props.style)).toMatchObject({
      textAlign: "left"
    });
    // Still as high as the touch floor.
    expect(StyleSheet.flatten(screen.getByTestId("legal-privacy").props.style)).toMatchObject({
      minHeight: 44
    });
  });
});

describe("the welcome screen's legal links", () => {
  it("links the privacy policy under the terms, above the version", async () => {
    await renderRouter(routes, { initialUrl: "/" });
    const privacy = await screen.findByTestId("welcome-legal-privacy");
    expect(privacy).toHaveTextContent("Privacy policy");
    // The terms are linked by their own line, above.
    expect(screen.queryByTestId("welcome-legal-terms")).toBeNull();
    const order = testIDsInOrder().filter((id) =>
      ["boltcard-entry", "welcome-legal-privacy", "version"].includes(id)
    );
    expect(order).toEqual(["boltcard-entry", "welcome-legal-privacy", "version"]);

    await fireEvent.press(privacy);
    expect(openURL).toHaveBeenCalledWith(LEGAL_URLS.privacy);
  });

  it("opens the terms from their line", async () => {
    await renderRouter(routes, { initialUrl: "/" });
    await fireEvent.press(await screen.findByText("terms and conditions"));
    expect(openURL).toHaveBeenCalledWith(LEGAL_URLS.terms);
  });
});
