/*
 * The web page around the app takes the theme in use (surroundings.web.ts), its `theme-color`
 * included: the installed web app's title bar and Android's status bar follow this device's
 * "Theme", not only the device's scheme that public/index.html names first.
 */
import { applySurroundings } from "@/features/appearance/surroundings.web";
import { darkTheme, lightTheme } from "@/theme/theme";
import { darkColors, lightColors } from "@/theme/tokens";

const saved = Object.getOwnPropertyDescriptor(globalThis, "document");

afterEach(() => {
  if (saved) Object.defineProperty(globalThis, "document", saved);
  else delete (globalThis as Record<string, unknown>).document;
});

/** A page with public/index.html's two `theme-color`s, as the device's scheme set them. */
function page() {
  const metas = [
    { media: "(prefers-color-scheme: light)", content: lightColors.background.app },
    { media: "(prefers-color-scheme: dark)", content: darkColors.background.app }
  ];
  const root = { style: {} as Record<string, string> };
  const body = { style: {} as Record<string, string> };
  Object.defineProperty(globalThis, "document", {
    value: {
      documentElement: root,
      body,
      // The focus ring's style element is there already: only its text changes.
      getElementById: () => ({ textContent: "" }),
      querySelectorAll: (selector: string) => (selector === 'meta[name="theme-color"]' ? metas : [])
    },
    configurable: true
  });
  return { metas, root, body };
}

describe("the web page's surroundings", () => {
  it("paints the browser's bars in the theme in use, whatever the device's scheme", () => {
    const { metas, root, body } = page();

    // "Dark" on a light device.
    applySurroundings(darkTheme);
    expect(metas.map((meta) => meta.content)).toEqual([
      darkColors.background.app,
      darkColors.background.app
    ]);
    expect(root.style).toMatchObject({
      colorScheme: "dark",
      backgroundColor: darkColors.background.app
    });
    expect(body.style.backgroundColor).toBe(darkColors.background.app);

    // Back to "Light".
    applySurroundings(lightTheme);
    expect(metas.map((meta) => meta.content)).toEqual([
      lightColors.background.app,
      lightColors.background.app
    ]);
    // Their media stay: only their colour follows the app.
    expect(metas.map((meta) => meta.media)).toEqual([
      "(prefers-color-scheme: light)",
      "(prefers-color-scheme: dark)"
    ]);
  });
});
