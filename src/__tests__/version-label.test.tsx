import "@/i18n";

import { act, render } from "@testing-library/react-native";
import { fireEvent, renderRouter, screen } from "expo-router/testing-library";
import { Linking, StyleSheet } from "react-native";

import WelcomeScreen from "@/app/index";
import PendingScreen from "@/app/pending";
import { externalLinkProps as webLinkProps } from "@/components/ui/external-link.web";
import { VersionLabel, VersionTag } from "@/components/VersionLabel";
import { SOURCE_URL } from "@/config/source";
import { NEXT, notesOf, shownReleases } from "@/features/release-notes/releases";
import { markReleaseNotesSeen } from "@/features/release-notes/seen";
import { parseStoredSeen, RELEASE_NOTES_SEEN_KEY } from "@/features/release-notes/seen-format";
import { type AppInfo, getAppInfo } from "@/lib/app-info";
import { parseMarkdown } from "@/lib/release-notes/markdown";
import { lightColors as colors, sans, type } from "@/theme";

import type * as SecureStoreFake from "../../jest/expo-secure-store";
import { versionParts } from "../../jest/version-label";

// The welcome screen loads the passkey support on mount: not under test here.
jest.mock("../lib/breez/passkey", () => ({
  createPasskeyWallet: jest.fn(),
  preparePasskeys: jest.fn(async () => undefined),
  passkeysReady: jest.fn(() => true),
  signInWithPasskey: jest.fn()
}));
jest.mock("../lib/app-info", () => ({
  ...jest.requireActual("../lib/app-info"),
  getAppInfo: jest.fn()
}));
// The notes of release-notes/ as written, with notes of the version being made between a release
// and its first change too: release-notes/next/'s, or else this test's own.
jest.mock("../features/release-notes/notes.generated", () => {
  const actual = jest.requireActual("../features/release-notes/notes.generated");
  const languages = ["fr", "en", "de", "it", "es", "pt", "fi"];
  const next = Object.fromEntries(
    languages.map((language) => [language, `- The next version's note, ${language}.`])
  );
  return { NOTES: { ...actual.NOTES, next: actual.NOTES.next ?? next } };
});

const routes = { index: WelcomeScreen, pending: PendingScreen };

const secureStore = jest.requireMock<typeof SecureStoreFake>("expo-secure-store");

/**
 * The build's look: the latest notes the app shows already opened, no "What's new" in the chip
 * (marked as each test's app is set, by mockAppInfo).
 */
let opened = false;
const notesOpened = () => {
  opened = true;
};
afterEach(() => {
  opened = false;
});

function mockAppInfo(
  info: Pick<AppInfo, "variant" | "commit"> & Partial<Pick<AppInfo, "version">>
) {
  const appInfo: AppInfo = { version: "3.0.0", buildNumber: "3000000", updates: null, ...info };
  jest.mocked(getAppInfo).mockReturnValue(appInfo);
  const latest = shownReleases(appInfo)[0];
  if (opened && latest) markReleaseNotesSeen(latest.key);
}

describe("version label of the welcome screen", () => {
  beforeEach(notesOpened);

  it("shows the commit and staging in the staging app", async () => {
    mockAppInfo({ variant: "staging", commit: "f82ecab" });
    await renderRouter(routes, { initialUrl: "/" });

    const version = screen.getByTestId("version");
    expect(versionParts(version)).toEqual(["f82ecab", "staging"]);
    expect(screen.getByTestId("version-staging-dot")).toBeTruthy();
    // Screen readers get what it opens, then the whole build, in words, for testers.
    expect(version.props.accessibilityLabel).toBe("What's new, Version 3.0.0 · f82ecab · staging");
  });

  it("shows the version and staging in the staging app when the commit is unknown", async () => {
    mockAppInfo({ variant: "staging", commit: null });
    await renderRouter(routes, { initialUrl: "/" });

    const version = screen.getByTestId("version");
    expect(versionParts(version)).toEqual(["v3.0.0", "staging"]);
    expect(version.props.accessibilityLabel).toBe("What's new, Version 3.0.0 · staging");
  });

  it("opens What's new, whose header links the source code on GitHub", async () => {
    mockAppInfo({ variant: "staging", commit: "f82ecab" });
    const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
    try {
      await renderRouter(routes, { initialUrl: "/" });

      const version = screen.getByTestId("version");
      expect(version.props.accessibilityRole).toBe("button");
      await fireEvent.press(version);
      expect(await screen.findByText("What's new")).toBeTruthy();
      expect(screen.getByTestId(`whats-new-${NEXT}`)).toBeTruthy();
      expect(openURL).not.toHaveBeenCalled();

      const source = screen.getByTestId("whats-new-source");
      expect(source).toHaveAccessibleName("Source code");
      await fireEvent.press(source);
      expect(SOURCE_URL).toBe("https://github.com/sattleme/app");
      expect(openURL).toHaveBeenCalledWith(SOURCE_URL);
    } finally {
      openURL.mockRestore();
    }
  });

  it("is a real anchor in a new tab on the web", () => {
    // react-native-web renders a Pressable with `href` as an <a>: Enter and a middle click open it.
    expect(webLinkProps(SOURCE_URL)).toEqual({
      href: SOURCE_URL,
      hrefAttrs: { target: "_blank", rel: "noopener noreferrer" }
    });
  });

  it("shows the version alone in production, the release tag's name", async () => {
    mockAppInfo({ variant: "production", commit: "f82ecab" });
    await renderRouter(routes, { initialUrl: "/" });

    const version = screen.getByTestId("version");
    expect(versionParts(version)).toEqual(["v3.0.0"]);
    expect(screen.queryByTestId("version-staging-dot")).toBeNull();
    // No commit for screen readers either.
    expect(version.props.accessibilityLabel).toBe("What's new, Version 3.0.0");
  });

  it("shows the version alone in production when the commit is unknown", async () => {
    mockAppInfo({ variant: "production", commit: null });
    await renderRouter(routes, { initialUrl: "/" });

    expect(versionParts(screen.getByTestId("version"))).toEqual(["v3.0.0"]);
    expect(screen.getByTestId("version").props.accessibilityLabel).toBe(
      "What's new, Version 3.0.0"
    );
  });
});

describe("the version chip's look", () => {
  const style = (element: { props: { style?: unknown } }) =>
    StyleSheet.flatten(element.props.style as never);
  const chip = () => screen.getByTestId("label");

  beforeEach(() => {
    notesOpened();
    mockAppInfo({ variant: "staging", commit: "f82ecab" });
  });

  it("is the brand's sans, the commit in bold, staging behind an orange dot", async () => {
    await render(<VersionLabel testID="label" />);

    expect(style(screen.getByText("f82ecab"))).toMatchObject({ fontFamily: sans(600).fontFamily });
    expect(style(screen.getByText("staging"))).toMatchObject({ fontFamily: sans(500).fontFamily });
    // Orange is a fill, never the text.
    expect(style(screen.getByTestId("label-staging-dot"))).toMatchObject({
      backgroundColor: colors.background.accent
    });
    expect(style(screen.getByText("staging")).color).toBe(colors.text.primary);
  });

  it("is the version alone, in bold, in production", async () => {
    mockAppInfo({ variant: "production", commit: "f82ecab" });
    await render(<VersionLabel testID="label" />);

    expect(versionParts(chip())).toEqual(["v3.0.0"]);
    expect(style(screen.getByText("v3.0.0"))).toMatchObject({ fontFamily: sans(600).fontFamily });
  });

  it("over light screens, the primary text on the hover tint, its ring darker when hovered", async () => {
    await render(<VersionLabel testID="label" />);

    expect(style(screen.getByText("f82ecab"))).toMatchObject({ color: colors.text.primary });
    expect(style(chip())).toMatchObject({
      backgroundColor: colors.hoverOverlay,
      borderColor: colors.border.faint
    });
    await fireEvent(chip(), "hoverIn");
    // Never underlined.
    expect(style(chip())).toMatchObject({ borderColor: colors.border.strong });
    expect(style(screen.getByText("f82ecab")).textDecorationLine).toBeUndefined();
    await fireEvent(chip(), "hoverOut");
    expect(style(chip())).toMatchObject({ borderColor: colors.border.faint });
  });

  it("reaches the 44 px touch floor", async () => {
    await render(<VersionLabel testID="label" />);
    const { top, bottom } = chip().props.hitSlop;
    expect(style(chip()).minHeight + top + bottom).toBeGreaterThanOrEqual(44);
  });
});

describe("the side bar's version tag", () => {
  beforeEach(notesOpened);

  const style = (element: { props: { style?: unknown } }) =>
    StyleSheet.flatten(element.props.style as never);
  const tag = () => screen.getByTestId("tag");

  it("shows the commit alone in the staging app, the whole build for screen readers", async () => {
    mockAppInfo({ variant: "staging", commit: "f82ecab" });
    await render(<VersionTag testID="tag" />);
    expect(versionParts(tag())).toEqual(["f82ecab"]);
    expect(tag().props.accessibilityLabel).toBe("What's new, Version 3.0.0 · f82ecab · staging");
    expect(tag().props.accessibilityRole).toBe("button");
  });

  it("shows the version in the staging app when the commit is unknown", async () => {
    mockAppInfo({ variant: "staging", commit: null });
    await render(<VersionTag testID="tag" />);
    expect(versionParts(tag())).toEqual(["v3.0.0"]);
    expect(tag().props.accessibilityLabel).toBe("What's new, Version 3.0.0 · staging");
  });

  it("shows the release tag's name alone in production", async () => {
    mockAppInfo({ variant: "production", commit: "f82ecab" });
    await render(<VersionTag testID="tag" />);
    expect(versionParts(tag())).toEqual(["v3.0.0"]);
    expect(tag().props.accessibilityLabel).toBe("What's new, Version 3.0.0");
  });

  it("opens What's new", async () => {
    mockAppInfo({ variant: "production", commit: null });
    await render(<VersionTag testID="tag" />);
    await fireEvent.press(tag());
    expect(await screen.findByText("What's new")).toBeTruthy();
  });

  it("is small and dimmed over ink, white when hovered, on one line", async () => {
    mockAppInfo({ variant: "staging", commit: "f82ecab" });
    await render(<VersionTag testID="tag" />);
    const text = () => screen.getByText("f82ecab");
    expect(style(text())).toMatchObject({
      fontFamily: sans(500).fontFamily,
      fontSize: type.overline,
      color: colors.onDark.muted
    });
    expect(text().props.numberOfLines).toBe(1);
    await fireEvent(tag(), "hoverIn");
    expect(style(text())).toMatchObject({ color: colors.onDark.text });
    await fireEvent(tag(), "hoverOut");
    expect(style(text())).toMatchObject({ color: colors.onDark.muted });
  });

  it("reaches the 44 px touch floor without taking room: its padding is taken back", async () => {
    mockAppInfo({ variant: "staging", commit: "f82ecab" });
    await render(<VersionTag testID="tag" />);
    const box = style(tag());
    expect(box.minHeight).toBeGreaterThanOrEqual(44);
    expect(box.marginVertical).toBe(-box.paddingVertical);
    expect(box.marginHorizontal).toBe(-box.paddingHorizontal);
    // On the web too: react-native-web ignores `hitSlop`.
    expect(tag().props.hitSlop).toBeUndefined();
  });
});

describe("What's new from the version", () => {
  beforeEach(() => {
    // Never opened on this device: the store empty (jest.after-env.ts).
    mockAppInfo({ variant: "staging", commit: "f82ecab" });
  });

  it('ends the chip with "What\'s new" and a dot while its latest notes were never opened', async () => {
    await render(<VersionLabel testID="label" />);
    const chip = screen.getByTestId("label");
    expect(versionParts(chip)).toEqual(["f82ecab", "staging", "What's new"]);
    expect(screen.getByTestId("label-unread")).toBeTruthy();
    expect(chip.props.accessibilityLabel).toBe(
      "What's new, unread, Version 3.0.0 · f82ecab · staging"
    );
  });

  it("marks the notes opened as new in the window, then no more anywhere, remembered", async () => {
    await render(
      <>
        <VersionLabel testID="label" />
        <VersionTag testID="tag" />
      </>
    );
    expect(screen.getByTestId("tag-unread")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("label"));
    // New in this window, while it shows.
    expect(await screen.findByTestId("whats-new-fresh")).toHaveTextContent("New");
    // Every label's dot goes at once, and the device remembers it.
    expect(screen.queryByTestId("label-unread")).toBeNull();
    expect(screen.queryByTestId("tag-unread")).toBeNull();
    expect(versionParts(screen.getByTestId("label"))).toEqual(["f82ecab", "staging"]);
    await act(async () => undefined);
    expect(parseStoredSeen(secureStore.items.get(RELEASE_NOTES_SEEN_KEY) ?? null)).toBe(NEXT);
  });

  it("shows the next version's notes in the staging app, in the UI's language", async () => {
    await render(<VersionTag testID="tag" />);
    await fireEvent.press(screen.getByTestId("tag"));
    const next = await screen.findByTestId(`whats-new-${NEXT}`);
    expect(next).toHaveTextContent(/^Next version/);
    // The notes of release-notes/next/ as written, whatever they say: English's, not French's.
    const firstText = (markdown: string | undefined) =>
      parseMarkdown(markdown ?? "")
        .flatMap((block) => (block.kind === "list" ? block.items : [block.spans]))[0]!
        .map((span) => span.text)
        .join("");
    const english = firstText(notesOf("en")[NEXT]);
    const french = firstText(notesOf("fr")[NEXT]);
    expect(english).not.toBe(french);
    expect(next).toHaveTextContent(english, { exact: false });
    expect(next).not.toHaveTextContent(french, { exact: false });
  });

  it("has nothing new in production in an app older than every version with notes", async () => {
    mockAppInfo({ variant: "production", commit: null, version: "2.9.0" });
    await render(<VersionTag testID="tag" />);
    expect(screen.queryByTestId("tag-unread")).toBeNull();
    await fireEvent.press(screen.getByTestId("tag"));
    expect(await screen.findByTestId("whats-new-empty")).toHaveTextContent(
      "What's new in each version will show here."
    );
    expect(screen.queryByTestId(`whats-new-${NEXT}`)).toBeNull();
  });
});

describe("build info", () => {
  it("shows the version and the commit to testers", async () => {
    mockAppInfo({ variant: "staging", commit: "f82ecab" });
    await renderRouter(routes, { initialUrl: "/pending" });

    expect(screen.getByText("Commit")).toBeTruthy();
    expect(screen.getByText("f82ecab")).toBeTruthy();
    expect(screen.getByText("v3.0.0 (3000000)")).toBeTruthy();
  });

  it("says when the commit is unknown", async () => {
    mockAppInfo({ variant: "staging", commit: null });
    await renderRouter(routes, { initialUrl: "/pending" });

    expect(screen.getByText("Commit")).toBeTruthy();
    expect(screen.getByText("unknown")).toBeTruthy();
  });
});
