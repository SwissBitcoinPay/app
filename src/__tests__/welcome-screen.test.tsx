import "@/i18n";

import { cleanup, renderRouter, screen, within } from "expo-router/testing-library";
import { StyleSheet, useWindowDimensions } from "react-native";

import LaunchScreen from "@/app/index";
import { StepHeader } from "@/components/layout/StepHeader";
import {
  desktopHeadlineSize,
  headlineLineHeight,
  mobileHeadlineSize
} from "@/features/welcome/headline";
import { darkColors, darkTheme, lightColors, ThemeContext } from "@/theme";

// The window's size, set by each test (a phone by default).
jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({
  __esModule: true,
  default: jest.fn()
}));

type Node = typeof screen.container;

const PHONE = { width: 390, height: 844, scale: 3, fontScale: 1 };
const SMALL_PHONE = { width: 360, height: 640, scale: 2, fontScale: 1 };
const DESKTOP = { width: 1440, height: 900, scale: 2, fontScale: 1 };

beforeEach(() => {
  jest.mocked(useWindowDimensions).mockReturnValue(PHONE);
});

afterEach(() => {
  jest.mocked(useWindowDimensions).mockReset();
});

async function renderWelcome(theme?: "dark") {
  const index = () =>
    theme ? (
      <ThemeContext value={darkTheme}>
        <LaunchScreen />
      </ThemeContext>
    ) : (
      <LaunchScreen />
    );
  await renderRouter({ index }, { initialUrl: "/" });
  await screen.findByTestId("create-account");
}

/** The testIDs among `ids` in screen order. */
function inOrder(ids: readonly string[]): string[] {
  const found: string[] = [];
  const visit = (node: Node) => {
    const id = node.props.testID;
    if (typeof id === "string" && ids.includes(id) && !found.includes(id)) found.push(id);
    for (const child of node.children) if (typeof child !== "string") visit(child);
  };
  if (!screen.root) throw new Error("Nothing rendered");
  visit(screen.root);
  return found;
}

/** The content of a row of "I already have" (ListRow's inner view): its height. */
function rowMinHeight(testID: string): unknown {
  const content = screen.getByTestId(testID).children[0];
  if (typeof content === "string") throw new Error("A row's content is a view");
  return StyleSheet.flatten(content.props.style).minHeight;
}

function headline(): Node {
  return screen.getByRole("header", { name: "Payments in bitcoin." });
}

/**
 * Where the logo sits in its header row, Jest having no layout: the left padding and margin of its
 * ancestors, whether it comes first in each of them, and whether any row centres it.
 */
function logoPlace() {
  let left = 0;
  let first = true;
  let centred = false;
  let child: Node = screen.getByLabelText("sattle.me");
  for (let parent = child.parent; parent; child = parent, parent = parent.parent) {
    const style = StyleSheet.flatten(parent.props.style) ?? {};
    left += Number(style.paddingLeft ?? style.paddingHorizontal ?? style.padding ?? 0);
    left += Number(style.marginLeft ?? style.marginHorizontal ?? style.margin ?? 0);
    if (parent.children[0] !== child) first = false;
    if (
      style.flexDirection === "row" &&
      ["center", "flex-end"].includes(String(style.justifyContent))
    )
      centred = true;
  }
  return { left, first, centred };
}

/** The nearest ancestor of `node` with a background colour. */
function backgroundOf(node: Node): unknown {
  for (let parent = node.parent; parent; parent = parent.parent) {
    const color = StyleSheet.flatten(parent.props.style)?.backgroundColor;
    if (color) return color;
  }
  return undefined;
}

/*
 * The welcome screen: "I already have", centred; on a desktop, its ink-and-cream layout.
 */
describe("the welcome screen", () => {
  it("leads with one filled button, then what one may already have, then the migration", async () => {
    await renderWelcome();

    expect(headline()).toBeTruthy();
    expect(screen.getByText("Point of sale, invoices and NFC cards.")).toBeTruthy();
    for (const guarantee of ["Non-custodial", "No KYC identification", "In 1 minute"]) {
      expect(screen.getByText(guarantee)).toBeTruthy();
    }
    expect(screen.getByRole("header", { name: "I already have" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "A sattle.me account, Log in" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "An invitation, Join by invitation" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "A BoltCard, Manage my BoltCard" })).toBeTruthy();
    expect(
      inOrder([
        "advanced-settings",
        "create-account",
        "login",
        "join-team",
        "boltcard-entry",
        "migrate-account",
        "version"
      ])
    ).toEqual([
      "advanced-settings",
      "create-account",
      "login",
      "join-team",
      "boltcard-entry",
      "migrate-account",
      "version"
    ]);
    // No tagline lines.
    expect(screen.queryByText("Merchant point of sale.")).toBeNull();
  });

  it('keeps the rows of "I already have" in one card, each with what it opens', async () => {
    await renderWelcome();

    const login = screen.getByTestId("login");
    expect(within(login).getByText("A sattle.me account")).toBeTruthy();
    expect(within(login).getByText("Log in")).toBeTruthy();
    const card = within(screen.getByTestId("boltcard-entry"));
    expect(card.getByText("A BoltCard")).toBeTruthy();
    expect(card.getByText("Manage my BoltCard")).toBeTruthy();
    // One card for the three: the same parent.
    expect(screen.getByTestId("join-team").parent).toBe(login.parent);
    expect(screen.getByTestId("boltcard-entry").parent).toBe(login.parent);
  });

  describe("on a phone", () => {
    it("sets the headline at 32 px on one line, under the centred logo", async () => {
      await renderWelcome();

      expect(StyleSheet.flatten(headline().props.style)).toMatchObject({
        fontSize: 32,
        textAlign: "center"
      });
      expect(rowMinHeight("login")).toBe(62);
    });

    it("draws the headline smaller and the spaces tighter on a phone of little height", async () => {
      jest.mocked(useWindowDimensions).mockReturnValue(SMALL_PHONE);
      await renderWelcome();

      // 29.5 px: 300 px of the 316 px between the gutters.
      expect(StyleSheet.flatten(headline().props.style).fontSize).toBe(29.5);
      for (const id of ["login", "join-team", "boltcard-entry"]) {
        // Above the 44 px touch floor.
        expect(rowMinHeight(id)).toBe(58);
      }
    });
  });

  describe("on a desktop", () => {
    beforeEach(() => {
      jest.mocked(useWindowDimensions).mockReturnValue(DESKTOP);
    });

    it("sets the brand on the side bar's ink, the actions on the screen's cream", async () => {
      await renderWelcome();

      expect(StyleSheet.flatten(headline().props.style)).toMatchObject({
        fontSize: 56,
        color: lightColors.onDark.text
      });
      expect(backgroundOf(screen.getByLabelText("sattle.me"))).toBe(lightColors.sidebar.bg);
      expect(backgroundOf(headline())).toBe(lightColors.sidebar.bg);
      expect(backgroundOf(screen.getByTestId("create-account"))).toBe(lightColors.background.app);
      // "Advanced settings" in words, at the top of the actions' half.
      expect(screen.getByTestId("advanced-settings")).toHaveTextContent(/Advanced settings/);
    });

    it("keeps the logo at the top left, where the steps' header has it", async () => {
      await renderWelcome();
      const welcome = logoPlace();
      // One router at a time.
      await cleanup();

      await renderRouter(
        { step: () => <StepHeader steps={{ count: 2, current: 0 }} onBack={() => undefined} /> },
        { initialUrl: "/step" }
      );

      expect(welcome).toEqual({ left: 40, first: true, centred: false });
      expect(logoPlace()).toEqual(welcome);
    });

    it("deepens the brand's ink in the dark theme, as the side bar's", async () => {
      await renderWelcome("dark");

      expect(backgroundOf(headline())).toBe(darkColors.sidebar.bg);
      expect(backgroundOf(screen.getByTestId("create-account"))).toBe(darkColors.background.app);
      expect(darkColors.sidebar.bg).not.toBe(darkColors.background.app);
    });
  });

  it("shows the BoltCard's logo with light waves in the dark theme, where black ones vanish", async () => {
    const image = () => {
      const find = (node: Node): Node | null => {
        if (node.type === "Image") return node;
        for (const child of node.children) {
          const found = typeof child === "string" ? null : find(child);
          if (found) return found;
        }
        return null;
      };
      const found = find(screen.getByTestId("boltcard-entry"));
      if (!found) throw new Error('No image in "A BoltCard"');
      return found;
    };

    await renderWelcome();
    expect(image().props.source).toBe(require("../../assets/images/boltcard.png"));
    // One router at a time.
    await cleanup();

    await renderWelcome("dark");
    expect(image().props.source).toBe(require("../../assets/images/boltcard-dark.png"));
  });
});

describe("the welcome screen's headline size", () => {
  it.each([
    [320, 26],
    [360, 29.5],
    [375, 31],
    [390, 32],
    [430, 32]
  ])("is %i px wide on a phone: %f px", (width, size) => {
    expect(mobileHeadlineSize(width)).toBe(size);
  });

  it.each([
    [1024, 40],
    [1280, 50],
    [1440, 56],
    [2560, 56]
  ])("is %i px wide on a desktop: %f px", (width, size) => {
    expect(desktopHeadlineSize(width)).toBe(size);
  });

  it("never goes under 36 px on a desktop", () => {
    expect(desktopHeadlineSize(800)).toBe(36);
  });

  it("tightens its line from 40 px", () => {
    expect(headlineLineHeight(32)).toBe(36);
    expect(headlineLineHeight(40)).toBe(43);
    expect(headlineLineHeight(56)).toBe(60);
  });
});
