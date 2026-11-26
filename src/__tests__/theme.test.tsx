import { act, render, renderHook, screen, waitFor } from "@testing-library/react-native";
import { Appearance, Text } from "react-native";

import { HOLD_LIMIT_MS } from "@/features/appearance/crossfade";
import { ThemeProvider } from "@/features/appearance/ThemeProvider";
import {
  DEFAULT_THEME_PREFERENCE,
  parseThemePreference,
  resolveScheme,
  serializeThemePreference,
  THEME_KEY,
  toggledPreference
} from "@/features/appearance/theme-format";
import {
  resetThemePreference,
  saveThemePreference,
  themePreferenceChoice,
  useThemePreferenceChoice
} from "@/features/appearance/theme-preference";
import { wipeDevice } from "@/features/settings/device-wipe";
import { readLog } from "@/lib/log/log";
import { contrastRatio, hexLuminance } from "@/lib/media/luminance";
import {
  darkColors,
  darkShadow,
  darkTheme,
  lightColors,
  lightShadow,
  lightTheme,
  makeStyles,
  motion,
  useTheme,
  type ThemeColors
} from "@/theme";

import type * as SecureStoreFake from "../../jest/expo-secure-store";
import type * as SystemUiFake from "../../jest/expo-system-ui";
import {
  answerHolds,
  crossfadeCalls,
  crossfadeHoldFades,
  observeCrossfade
} from "../../jest/theme-crossfade";

/*
 * The dark theme: "Theme" in "Settings › Display", "Light", "Dark" or "Automatic" (the device's
 * own, by default), saved on the device; the colours of both themes (src/theme/tokens.ts).
 */

const secureStore = jest.requireMock<typeof SecureStoreFake>("expo-secure-store");
const systemUi = jest.requireMock<typeof SystemUiFake>("expo-system-ui");
const useColorScheme = jest.requireMock<{ default: jest.Mock }>(
  "react-native/Libraries/Utilities/useColorScheme"
).default;

// Node's types are not loaded (see app-config.test.ts): only what this test needs is typed here.
declare const __dirname: string;
const { readFileSync } = jest.requireActual<{
  readFileSync(file: string, encoding: "utf8"): string;
}>("fs");
const { join } = jest.requireActual<{ join(...segments: string[]): string }>("path");

describe('"Theme"\'s record', () => {
  it("is stored under a key installed apps keep, in a versioned record", () => {
    // IRREVERSIBLE: installed apps keep the choice there.
    expect(THEME_KEY).toBe("theme");
    expect(serializeThemePreference("dark")).toBe('{"version":1,"theme":"dark"}');
    for (const preference of ["light", "dark", "system"] as const) {
      expect(parseThemePreference(serializeThemePreference(preference))).toBe(preference);
    }
  });

  it("reads nothing it does not know: absent, damaged, another theme, a newer format", () => {
    expect(parseThemePreference(null)).toBeNull();
    expect(parseThemePreference("{")).toBeNull();
    expect(parseThemePreference("null")).toBeNull();
    expect(parseThemePreference('{"version":1,"theme":"sepia"}')).toBeNull();
    expect(parseThemePreference('{"version":2,"theme":"dark"}')).toBeNull();
  });

  it("follows the device by default", () => {
    expect(DEFAULT_THEME_PREFERENCE).toBe("system");
    expect(resolveScheme("system", "dark")).toBe("dark");
    expect(resolveScheme("system", "light")).toBe("light");
    expect(resolveScheme("light", "dark")).toBe("light");
    expect(resolveScheme("dark", "light")).toBe("dark");
  });

  // The payer's page of a payment link: its switch shows the other theme, and follows the device
  // again once switched back to the device's own.
  it('switches to the other theme, back to the device\'s own as "Automatic"', () => {
    expect(toggledPreference("light", "light")).toBe("dark");
    expect(toggledPreference("dark", "light")).toBe("system");
    expect(toggledPreference("dark", "dark")).toBe("light");
    expect(toggledPreference("light", "dark")).toBe("system");
  });
});

describe('"Theme" on this device', () => {
  it("follows the device until something is chosen", async () => {
    const { result } = await renderHook(() => useThemePreferenceChoice());
    await waitFor(() => expect(result.current).toBe("system"));
  });

  it("reads the choice stored on the device", async () => {
    secureStore.items.set(THEME_KEY, serializeThemePreference("dark"));
    const { result } = await renderHook(() => useThemePreferenceChoice());
    await waitFor(() => expect(result.current).toBe("dark"));
  });

  it("follows the device when the stored choice cannot be read, and says so in the journal", async () => {
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    secureStore.getItemAsync.mockRejectedValueOnce(new Error("Keychain unavailable"));
    const { result } = await renderHook(() => useThemePreferenceChoice());
    await waitFor(() => expect(result.current).toBe("system"));
    expect(readLog().entries.map((entry) => entry.event)).toContain("Reading the theme failed");
  });

  it("saves a choice, then tells every screen that follows it", async () => {
    const { result } = await renderHook(() => useThemePreferenceChoice());
    await waitFor(() => expect(result.current).toBe("system"));
    await act(async () => saveThemePreference("dark"));
    expect(result.current).toBe("dark");
    expect(parseThemePreference(secureStore.items.get(THEME_KEY) ?? null)).toBe("dark");
  });

  it("changes nothing when the choice could not be saved", async () => {
    const { result } = await renderHook(() => useThemePreferenceChoice());
    await waitFor(() => expect(result.current).toBe("system"));
    secureStore.setItemAsync.mockRejectedValueOnce(new Error("Keychain unavailable"));
    await expect(saveThemePreference("dark")).rejects.toThrow("Keychain unavailable");
    expect(result.current).toBe("system");
    expect(secureStore.items.has(THEME_KEY)).toBe(false);
  });

  it("stands over a read still under way with the choice saved meanwhile", async () => {
    secureStore.items.set(THEME_KEY, serializeThemePreference("light"));
    let release = () => {};
    secureStore.getItemAsync.mockImplementationOnce(
      (key: string) =>
        new Promise((resolve) => {
          release = () => resolve(secureStore.items.get(key) ?? null);
        })
    );
    const { result } = await renderHook(() => useThemePreferenceChoice());
    await act(async () => saveThemePreference("dark"));
    await act(async () => release());
    expect(result.current).toBe("dark");
  });

  it("never applies a read begun before a reset", async () => {
    secureStore.items.set(THEME_KEY, serializeThemePreference("dark"));
    let release = () => {};
    secureStore.getItemAsync.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve(serializeThemePreference("dark"));
        })
    );
    const { result } = await renderHook(() => useThemePreferenceChoice());
    secureStore.items.clear();
    await act(async () => resetThemePreference());
    await waitFor(() => expect(result.current).toBe("system"));
    await act(async () => release());
    expect(result.current).toBe("system");
  });

  it('goes with "Log out": its key removed, the device\'s theme again', async () => {
    const { result } = await renderHook(() => useThemePreferenceChoice());
    await waitFor(() => expect(result.current).toBe("system"));
    await act(async () => saveThemePreference("dark"));
    await act(async () => wipeDevice());
    expect(secureStore.items.has(THEME_KEY)).toBe(false);
    await waitFor(() => expect(themePreferenceChoice()).toBe("system"));
    expect(result.current).toBe("system");
  });

  // The keyboard, the system's dialogs and the date picker in the theme chosen (the apps).
  it("draws the system's own parts of the app in the theme chosen, or the device's", async () => {
    const override = jest.spyOn(Appearance, "setColorScheme");
    const { result } = await renderHook(() => useThemePreferenceChoice());
    await waitFor(() => expect(result.current).toBe("system"));
    expect(override).toHaveBeenLastCalledWith("unspecified");
    await act(async () => saveThemePreference("dark"));
    expect(override).toHaveBeenLastCalledWith("dark");
    await act(async () => saveThemePreference("light"));
    expect(override).toHaveBeenLastCalledWith("light");
    await act(async () => saveThemePreference("system"));
    expect(override).toHaveBeenLastCalledWith("unspecified");
    // "Log out": the key gone, the device's own theme again.
    await act(async () => saveThemePreference("dark"));
    secureStore.items.delete(THEME_KEY);
    await act(async () => resetThemePreference());
    await waitFor(() => expect(themePreferenceChoice()).toBe("system"));
    expect(override).toHaveBeenLastCalledWith("unspecified");
  });
});

/** Says which theme it is drawn in, with a style of `makeStyles`. */
const useProbeStyles = makeStyles(({ colors }) => ({ text: { color: colors.text.primary } }));
function Probe() {
  const { scheme } = useTheme();
  const styles = useProbeStyles();
  return (
    <Text testID="probe" style={styles.text}>
      {scheme}
    </Text>
  );
}

async function renderThemed() {
  await render(
    <ThemeProvider>
      <Probe />
    </ThemeProvider>
  );
  await waitFor(() => expect(themePreferenceChoice()).not.toBeNull());
}

/** The work a change of theme set going done (its crossfade's promises, its commit). */
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe("the theme drawn", () => {
  it("is the light one outside the app's theme (a component rendered alone)", async () => {
    await render(<Probe />);
    expect(screen.getByTestId("probe")).toHaveTextContent("light");
    expect(screen.getByTestId("probe")).toHaveStyle({ color: lightColors.text.primary });
  });

  it('follows the device under "Automatic"', async () => {
    useColorScheme.mockImplementation(() => "dark");
    await renderThemed();
    expect(screen.getByTestId("probe")).toHaveTextContent("dark");
    expect(screen.getByTestId("probe")).toHaveStyle({ color: darkColors.text.primary });
    // Around the screens: the root view on the dark canvas.
    expect(systemUi.rootBackground()).toBe(darkColors.background.app);
  });

  it("takes the theme chosen over the device's", async () => {
    useColorScheme.mockImplementation(() => "dark");
    await renderThemed();
    await act(async () => saveThemePreference("light"));
    await settle();
    expect(screen.getByTestId("probe")).toHaveTextContent("light");
    expect(screen.getByTestId("probe")).toHaveStyle({ color: lightColors.text.primary });
    expect(systemUi.rootBackground()).toBe(lightColors.background.app);
    await act(async () => saveThemePreference("dark"));
    await settle();
    expect(screen.getByTestId("probe")).toHaveTextContent("dark");
    expect(screen.getByTestId("probe")).toHaveStyle({ color: darkColors.text.primary });
  });

  it("creates each theme's styles once, then shares them", async () => {
    const { result, rerender } = await renderHook(() => useProbeStyles(), {
      wrapper: ThemeProvider
    });
    await waitFor(() => expect(themePreferenceChoice()).toBe("system"));
    const light = result.current;
    await act(async () => saveThemePreference("dark"));
    await settle();
    const dark = result.current;
    expect(dark).not.toBe(light);
    await act(async () => saveThemePreference("light"));
    await settle();
    expect(result.current).toBe(light);
    await act(async () => saveThemePreference("dark"));
    await settle();
    await rerender({});
    expect(result.current).toBe(dark);
  });
});

/*
 * A change of theme crossfades (theme-crossfade.ts): a still of the
 * screen as it shows is laid over it (the app's own module, jest/theme-crossfade.ts), the new theme
 * drawn under it, then the still fades out.
 */
describe("a change of theme", () => {
  /** The theme the probe and the root view are drawn in. */
  const drawn = () =>
    `${String(screen.getByTestId("probe").props.children)} on ${
      systemUi.rootBackground() === darkColors.background.app ? "dark" : "light"
    }`;
  const release = `release ${motion.themeCrossfade}`;

  /** The next holds answer when the test says, with a still or not. */
  function holdUntilTold(): (held: boolean) => Promise<void> {
    const waiting: ((held: boolean) => void)[] = [];
    answerHolds(() => new Promise((resolve) => waiting.push(resolve)));
    return async (held) => {
      await act(async () => waiting.shift()?.(held));
      await settle();
    };
  }

  it("draws the first theme at once, without a crossfade", async () => {
    useColorScheme.mockImplementation(() => "dark");
    await renderThemed();
    expect(drawn()).toBe("dark on dark");
    await settle();
    expect(crossfadeCalls()).toEqual([]);
  });

  it("lays a still of the screen as it shows, draws the new theme under it, then fades it out", async () => {
    await renderThemed();
    observeCrossfade(drawn);
    const answer = holdUntilTold();
    await act(async () => saveThemePreference("dark"));
    await settle();
    // The still being taken: the light theme as it shows, nothing drawn in the dark one yet.
    expect(crossfadeCalls()).toEqual(["hold: light on light"]);
    expect(drawn()).toBe("light on light");
    // Taken: the dark theme under it, committed (the root view included) before it fades out.
    await answer(true);
    expect(drawn()).toBe("dark on dark");
    expect(crossfadeCalls()).toEqual(["hold: light on light", `${release}: dark on dark`]);
    // Should its release never come, the still fades out in the same time on its own.
    expect(crossfadeHoldFades()).toEqual([motion.themeCrossfade]);
  });

  it("changes at once when no still could be taken, and drops one that would come late", async () => {
    await renderThemed();
    answerHolds(async () => false);
    await act(async () => saveThemePreference("dark"));
    await settle();
    expect(drawn()).toBe("dark on dark");
    expect(crossfadeCalls()).toEqual(["hold", release]);
  });

  it("changes all the same when the still fails, and says so in the journal", async () => {
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    await renderThemed();
    answerHolds(async () => {
      throw new Error("No window");
    });
    await act(async () => saveThemePreference("dark"));
    await settle();
    expect(drawn()).toBe("dark on dark");
    expect(crossfadeCalls()).toEqual(["hold", release]);
    expect(readLog().entries.map((entry) => entry.event)).toContain(
      "Holding the screen for the theme's crossfade failed"
    );
  });

  it("never waits longer than its limit for a still that does not come", async () => {
    await renderThemed();
    jest.useFakeTimers();
    try {
      answerHolds(() => new Promise<boolean>(() => undefined));
      await act(async () => saveThemePreference("dark"));
      await act(async () => {
        jest.advanceTimersByTime(HOLD_LIMIT_MS - 1);
      });
      expect(drawn()).toBe("light on light");
      await act(async () => {
        jest.advanceTimersByTime(1);
      });
      expect(drawn()).toBe("dark on dark");
      expect(crossfadeCalls()).toEqual(["hold", release]);
    } finally {
      jest.useRealTimers();
    }
  });

  it("draws the theme asked for last while its still was taken, in one crossfade", async () => {
    await renderThemed();
    const answer = holdUntilTold();
    await act(async () => saveThemePreference("dark"));
    await act(async () => saveThemePreference("light"));
    await answer(true);
    expect(drawn()).toBe("light on light");
    expect(crossfadeCalls()).toEqual(["hold", release]);
    // Asked for after: a crossfade of its own.
    await act(async () => saveThemePreference("dark"));
    await answer(true);
    expect(drawn()).toBe("dark on dark");
    expect(crossfadeCalls()).toEqual(["hold", release, "hold", release]);
  });

  it("gives a theme asked for during a crossfade one of its own, once it is done", async () => {
    await renderThemed();
    const answer = holdUntilTold();
    await act(async () => saveThemePreference("dark"));
    // Its commit under way: asked for again just after.
    let release1 = () => {};
    answerHolds(
      () =>
        new Promise((resolve) => {
          release1 = () => resolve(true);
        })
    );
    await answer(true);
    await act(async () => saveThemePreference("light"));
    await settle();
    expect(drawn()).toBe("dark on dark");
    expect(crossfadeCalls()).toEqual(["hold", release, "hold"]);
    await act(async () => release1());
    await settle();
    expect(drawn()).toBe("light on light");
    expect(crossfadeCalls()).toEqual(["hold", release, "hold", release]);
  });

  it('follows the device under "Automatic" with the same crossfade', async () => {
    await renderThemed();
    observeCrossfade(drawn);
    useColorScheme.mockImplementation(() => "dark");
    await screen.rerender(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>
    );
    await settle();
    expect(drawn()).toBe("dark on dark");
    expect(crossfadeCalls()).toEqual(["hold: light on light", `${release}: dark on dark`]);
  });

  it("lets its still fade out when the app is gone during the change", async () => {
    await renderThemed();
    const answer = holdUntilTold();
    await act(async () => saveThemePreference("dark"));
    await screen.unmount();
    await answer(true);
    expect(crossfadeCalls()).toEqual(["hold", release]);
  });
});

/*
 * The web: the browser's view transition (crossfade.web.ts), which captures the page as it shows,
 * waits for the new theme's commit, then crossfades the whole page.
 */
describe("a change of theme on the web", () => {
  type FakeTransition = {
    ready: Promise<void>;
    finished: Promise<void>;
    updateCallbackDone: Promise<void>;
  };
  const head: { id: string; textContent: string }[] = [];
  let started: (() => Promise<void>)[] = [];
  let skip = false;

  /** A document with (or without) view transitions, as Jest has none. */
  function fakeDocument(transitions: boolean) {
    const document = {
      getElementById: (id: string) => head.find((element) => element.id === id) ?? null,
      createElement: () => ({ id: "", textContent: "" }),
      head: { appendChild: (element: { id: string; textContent: string }) => head.push(element) },
      ...(transitions
        ? {
            startViewTransition: (update: () => Promise<void>): FakeTransition => {
              started.push(update);
              const updateCallbackDone = Promise.resolve().then(update);
              // A transition skipped (another one, a page out of sight): its animation's promises reject.
              const animation = skip
                ? updateCallbackDone.then(() => Promise.reject(new Error("AbortError")))
                : updateCallbackDone;
              return { ready: animation, finished: animation, updateCallbackDone };
            }
          }
        : {})
    };
    Object.defineProperty(globalThis, "document", { value: document, configurable: true });
  }

  afterEach(() => {
    Reflect.deleteProperty(globalThis, "document");
    head.length = 0;
    started = [];
    skip = false;
  });

  const { crossfade } = jest.requireActual<typeof import("@/features/appearance/crossfade.web")>(
    "../features/appearance/crossfade.web"
  );

  it("changes at once in a browser without view transitions", async () => {
    fakeDocument(false);
    const update = jest.fn(async () => undefined);
    await crossfade(update);
    expect(update).toHaveBeenCalledTimes(1);
    expect(head).toEqual([]);
  });

  it("crossfades the whole page in the theme's duration, with the new theme committed", async () => {
    fakeDocument(true);
    const update = jest.fn(async () => undefined);
    await crossfade(update);
    expect(started).toEqual([update]);
    expect(update).toHaveBeenCalledTimes(1);
    expect(head).toHaveLength(1);
    expect(head[0].textContent).toContain(
      `::view-transition-old(root),::view-transition-new(root){animation-duration:${motion.themeCrossfade}ms;`
    );
    // Its style added once.
    await crossfade(update);
    expect(head).toHaveLength(1);
  });

  it("changes all the same when the browser skips its animation", async () => {
    fakeDocument(true);
    skip = true;
    const update = jest.fn(async () => undefined);
    await crossfade(update);
    await settle();
    expect(update).toHaveBeenCalledTimes(1);
  });
});

/** A colour (`#RRGGBB` or `rgba(…)`) drawn over an opaque background, as `#RRGGBB`. */
function over(color: string, background: string): string {
  const rgba = /^rgba\((\d+), (\d+), (\d+), ([\d.]+)\)$/.exec(color);
  if (!rgba) {
    expect(color).toMatch(/^#[0-9A-F]{6}$/);
    return color;
  }
  const alpha = Number(rgba[4]);
  return `#${[1, 2, 3]
    .map((i) => {
      const under = parseInt(background.slice(2 * i - 1, 2 * i + 1), 16);
      const mixed = Math.round(Number(rgba[i]) * alpha + under * (1 - alpha));
      return mixed.toString(16).padStart(2, "0").toUpperCase();
    })
    .join("")}`;
}

/** WCAG's contrast ratio of a colour over an opaque background. */
function contrast(color: string, background: string): number {
  return contrastRatio(hexLuminance(over(color, background)), hexLuminance(background));
}

/** The keys of a nested object, as paths. */
function shape(value: object, prefix = ""): string[] {
  return Object.entries(value).flatMap(([key, child]) =>
    typeof child === "object" && child !== null
      ? shape(child as object, `${prefix}${key}.`)
      : [`${prefix}${key}`]
  );
}

describe("the colours of both themes", () => {
  it("have the same roles", () => {
    expect(shape(darkColors).sort()).toEqual(shape(lightColors).sort());
    expect(shape(darkShadow).sort()).toEqual(shape(lightShadow).sort());
    expect(lightTheme.colors).toBe(lightColors);
    expect(darkTheme.colors).toBe(darkColors);
  });

  // The light theme is the design system's, unchanged by the dark theme's arrival.
  it("keep the design system's light canvas, ink and orange", () => {
    expect(lightColors.background.app).toBe("#FAF6EE");
    expect(lightColors.background.surface).toBe("#FFFFFF");
    expect(lightColors.text.primary).toBe("#0B1A33");
    expect(lightColors.text.accent).toBe("#8F5300");
    expect(lightColors.button.primary.bg).toBe("#F7931A");
  });

  // The dark theme's colours.
  it("make the dark theme of the brand's ink, cream and orange", () => {
    expect(darkColors.background.app).toBe("#0B1A33");
    expect(darkColors.background.surface).toBe("#16253D");
    expect(darkColors.background.subtle).toBe("#23324A");
    expect(darkColors.text.primary).toBe("#F4EFE6");
    expect(darkColors.text.secondary).toBe("#ADB6C6");
    expect(darkColors.text.accent).toBe("#F1AF64");
    expect(darkColors.button.primary).toEqual(lightColors.button.primary);
    expect(darkColors.cardFace).toEqual(lightColors.cardFace);
  });

  it.each([
    ["light", lightColors],
    ["dark", darkColors]
  ] as [string, ThemeColors][])("keep every text readable in the %s theme (WCAG AA)", (_, c) => {
    const backgrounds = [c.background.app, c.background.surface, c.background.subtle];
    for (const background of backgrounds) {
      for (const text of [c.text.primary, c.text.secondary, c.text.note, c.text.accent]) {
        expect(contrast(text, background)).toBeGreaterThanOrEqual(4.5);
      }
      // Its icons (a chevron, a padlock): 3:1 for graphics.
      expect(contrast(c.text.tertiary, background)).toBeGreaterThanOrEqual(3);
      expect(contrast(c.button.text.label, background)).toBeGreaterThanOrEqual(4.5);
    }
    for (const state of Object.values(c.state)) {
      expect(contrast(state.fg, state.bg)).toBeGreaterThanOrEqual(4.5);
    }
    for (const tone of [c.success, c.warning, c.danger]) {
      expect(contrast(tone.fg, tone.bg)).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrast(c.button.secondary.label, c.button.secondary.bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c.button.danger.label, c.button.danger.bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c.button.dangerSolid.label, c.button.dangerSolid.bg)).toBeGreaterThanOrEqual(
      4.5
    );
    expect(contrast(c.button.ink.label, c.button.ink.bg)).toBeGreaterThanOrEqual(4.5);
  });

  // The web page's first paint, before the app's code (public/index.html): each theme's canvas.
  it("paint the web page's canvas before the app's code, as the device's theme", () => {
    const html = readFileSync(join(__dirname, "../../public/index.html"), "utf8").toUpperCase();
    expect(html).toContain(`BACKGROUND-COLOR: ${lightColors.background.app};`);
    expect(html).toMatch(
      new RegExp(
        `@MEDIA \\(PREFERS-COLOR-SCHEME: DARK\\) \\{\\s*HTML,\\s*BODY \\{\\s*BACKGROUND-COLOR: ${darkColors.background.app};`
      )
    );
  });
});
