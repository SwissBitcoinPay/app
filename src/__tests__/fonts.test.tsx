import "@/i18n";

import type * as Rntl from "@testing-library/react-native/pure";
import { fireEvent, renderRouter, screen } from "expo-router/testing-library";
import { StyleSheet } from "react-native";

import WelcomeScreen from "@/app/index";
import { PasskeyError } from "@/lib/breez/errors";
import { createPasskeyWallet } from "@/lib/breez/passkey";
import { fontFileUrl } from "@/theme/font-url";
import { fontAssets, webStartupFonts, type FontName } from "@/theme/fonts";
import type * as UseAppFonts from "@/theme/useAppFonts.web";

jest.mock("../lib/breez/passkey", () => ({
  createPasskeyWallet: jest.fn(),
  preparePasskeys: jest.fn(async () => undefined),
  passkeysReady: jest.fn(() => true),
  signInWithPasskey: jest.fn()
}));
jest.mock("../lib/breez/wallet", () => ({
  checkWalletConfig: jest.fn(),
  connectWallet: jest.fn(),
  disconnectWallet: jest.fn()
}));

type JsonNode = {
  type: string;
  props: { style?: unknown };
  children: (JsonNode | string)[] | null;
};

/** Font families of every Text on screen. */
function drawnFonts(): Set<string> {
  const fonts = new Set<string>();
  const visit = (node: JsonNode | JsonNode[] | string | null) => {
    if (node === null || typeof node === "string") return;
    if (Array.isArray(node)) return node.forEach(visit);
    if (node.type === "Text") {
      const { fontFamily } = StyleSheet.flatten(node.props.style as never) ?? {};
      if (typeof fontFamily === "string") fonts.add(fontFamily);
    }
    node.children?.forEach(visit);
  };
  visit(screen.toJSON() as JsonNode | JsonNode[] | null);
  return fonts;
}

describe("web startup fonts", () => {
  // On the web, a font missing from webStartupFonts would be downloaded after the welcome screen
  // is drawn: its text would stay invisible until then.
  it("include every font of the welcome screen, idle, busy and with an error", async () => {
    // Failures are logged in development builds.
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    // RNTL 14 renders asynchronously.
    await renderRouter({ index: WelcomeScreen }, { initialUrl: "/" });
    const seen = drawnFonts();

    let fail: (error: Error) => void = () => undefined;
    jest
      .mocked(createPasskeyWallet)
      .mockImplementationOnce(() => new Promise((_, reject) => (fail = reject)));
    await fireEvent.press(screen.getByTestId("create-account"));
    drawnFonts().forEach((font) => seen.add(font));

    fail(new PasskeyError("cancelled", "cancelled by the test"));
    // A notification: the welcome screen has its own.
    await screen.findByText("Passkey cancelled");
    drawnFonts().forEach((font) => seen.add(font));

    jest
      .mocked(createPasskeyWallet)
      .mockRejectedValueOnce(new PasskeyError("failed", "by the test"));
    await fireEvent.press(screen.getByTestId("create-account"));
    await screen.findByText("Something went wrong. Try again.");
    drawnFonts().forEach((font) => seen.add(font));

    expect(seen.size).toBeGreaterThan(0);
    expect(
      [...seen].filter((font) => !(webStartupFonts as readonly string[]).includes(font))
    ).toEqual([]);
  });

  it("are fonts of the design system", () => {
    for (const font of webStartupFonts) expect(Object.keys(fontAssets)).toContain(font);
  });
});

describe("a font file's URL on the web", () => {
  // Shared by the app's fonts (useAppFonts.web.ts) and the statement's (report-fonts.web.ts).
  it("is Metro's URL, a string or { uri }, and nothing for any other source", () => {
    expect(fontFileUrl("/assets/fonts/x.ttf")).toBe("/assets/fonts/x.ttf");
    expect(fontFileUrl({ uri: "/assets/fonts/x.ttf" })).toBe("/assets/fonts/x.ttf");
    // The apps' module ids, and what is not a URL.
    for (const source of [42, null, undefined, {}, { uri: 42 }, { uri: null }, ["/x.ttf"]]) {
      expect(fontFileUrl(source)).toBeNull();
    }
  });
});

describe("useAppFonts on the web", () => {
  type FakeElement = { id: string; textContent: string };
  let head: FakeElement[];

  beforeEach(() => {
    head = [];
    // The parts of the browser document the hook uses (Jest runs without a DOM here).
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: {
        getElementById: (id: string) => head.find((element) => element.id === id) ?? null,
        createElement: (): FakeElement => ({ id: "", textContent: "" }),
        head: { appendChild: (element: FakeElement) => head.push(element) }
      }
    });
  });

  afterEach(() => {
    delete (globalThis as { document?: unknown }).document;
  });

  /** Loads useAppFonts.web.ts with font files served at /fonts/<name>.ttf, except `sources`. */
  async function load(sources: Partial<Record<FontName, unknown>> = {}) {
    const useFonts = jest.fn((_fonts: Record<string, unknown>) => [true, null]);
    await jest.isolateModulesAsync(async () => {
      jest.doMock("expo-font", () => ({ useFonts }));
      jest.doMock("../theme/fonts", () => ({
        fontAssets: Object.fromEntries(
          Object.keys(fontAssets).map((name) => [
            name,
            name in sources ? sources[name as FontName] : `/fonts/${name}.ttf`
          ])
        ),
        webStartupFonts
      }));
      /* eslint-disable @typescript-eslint/no-require-imports -- loaded after the mocks */
      const { useAppFonts } = require("../theme/useAppFonts.web") as typeof UseAppFonts;
      // Rendered, as a hook compiled by the React Compiler needs; with the React of this registry
      // (`pure`: the main entry would register its cleanup in the middle of a test).
      const { renderHook } = require("@testing-library/react-native/pure") as typeof Rntl;
      /* eslint-enable @typescript-eslint/no-require-imports */
      const { unmount } = await renderHook(() => useAppFonts());
      await unmount();
    });
    return Object.keys(useFonts.mock.calls[0][0]);
  }

  const lazyFonts = (Object.keys(fontAssets) as FontName[]).filter(
    (name) => !(webStartupFonts as readonly FontName[]).includes(name)
  );

  it("loads the startup fonts and only declares the others", async () => {
    expect(await load()).toEqual([...webStartupFonts]);

    expect(head).toHaveLength(1);
    expect(head[0].id).toBe("lazy-fonts");
    expect(head[0].textContent.split("\n")).toEqual(
      lazyFonts.map(
        (name) =>
          `@font-face{font-family:"${name}";src:url("/fonts/${name}.ttf");font-display:block}`
      )
    );
  });

  it("declares the fonts once", async () => {
    await load();
    await load();
    expect(head).toHaveLength(1);
  });

  it("loads at startup a font whose file is not a plain URL", async () => {
    const [font] = lazyFonts;
    expect(await load({ [font]: 42 })).toContain(font);
    expect(head[0].textContent).not.toContain(font);
  });
});
