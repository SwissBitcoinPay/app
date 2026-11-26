import { LOGO_HEIGHT, LOGO_PATHS, LOGO_WIDTH } from "../components/layout/logo-paths";
import {
  SBP_LOGO_CROSS,
  SBP_LOGO_HEIGHT,
  SBP_LOGO_TILE,
  SBP_LOGO_TILE_FILL,
  SBP_LOGO_WIDTH,
  SBP_LOGO_WORDMARK
} from "../features/migration/swiss-bitcoin-pay-logo";
import {
  MTPELERIN_LOGO_DARK_PATHS,
  MTPELERIN_LOGO_DARK_VIEWBOX,
  MTPELERIN_LOGO_HEIGHT,
  MTPELERIN_LOGO_PATHS,
  MTPELERIN_LOGO_WIDTH
} from "../features/sell/mtpelerin-logo-paths";
import { palette } from "../theme/tokens";

// Node's types are not loaded (see app-config.test.ts): only what this test needs is typed here.
declare const __dirname: string;
const { readFileSync } = jest.requireActual<{
  readFileSync(file: string, encoding: "utf8"): string;
}>("fs");
const { join } = jest.requireActual<{ join(...segments: string[]): string }>("path");

/** An asset's XML without its comments, whose text could read as elements below. */
const readAsset = (name: string) =>
  readFileSync(join(__dirname, "../../assets/images", name), "utf8").replace(
    /<!--[\s\S]*?-->/g,
    ""
  );

/** Attributes of the first `<tag …>` of an XML document. */
function attributes(xml: string, tag: string): Record<string, string> {
  const element = new RegExp(`<${tag}\\s([^>]*)>`).exec(xml);
  if (!element) throw new Error(`No <${tag}> element`);
  return Object.fromEntries(
    [...element[1].matchAll(/([\w:.-]+)="([^"]*)"/g)].map(([, name, value]) => [name, value])
  );
}

/**
 * Every `<path>` of an XML document, as fill colour and path data. A path with any other attribute
 * (fill rule, opacity, stroke, transform…) would not draw the same in the three copies: none allowed.
 */
function paths(xml: string, fill: string, d: string) {
  return [...xml.matchAll(/<path\s[^>]*>/g)].map(([element]) => {
    const { [fill]: color, [d]: data, ...others } = attributes(element, "path");
    expect(Object.keys(others)).toEqual([]);
    return { fill: color, d: data };
  });
}

const svg = readAsset("logo.svg");
const drawable = readAsset("splash-logo-android.xml");
const darkDrawable = readAsset("splash-logo-android-dark.xml");

describe("brand logo", () => {
  it("draws the paths of logo.svg in the app and on the Android splash screen", () => {
    const logo = paths(svg, "fill", "d");

    expect(logo).toHaveLength(3);
    expect(attributes(svg, "svg").viewBox).toBe(`0 0 ${LOGO_WIDTH} ${LOGO_HEIGHT}`);
    expect(LOGO_PATHS).toEqual(logo);
    expect(paths(drawable, "android:fillColor", "android:pathData")).toEqual(logo);
  });

  // A device in dark mode (app.config.ts): the same drawable, "sattle" in white on the dark
  // theme's background, ".me" in its orange, as Logo.tsx draws it in the dark theme.
  it("draws the same logo on the dark splash screen, in its light tone", () => {
    expect(darkDrawable.replace('android:fillColor="#FFFFFF"', 'android:fillColor="#0B1A33"')).toBe(
      drawable
    );
    expect(paths(darkDrawable, "android:fillColor", "android:pathData")).toEqual(
      LOGO_PATHS.map(({ fill, d }) => ({ fill: fill === palette.ink ? palette.white : fill, d }))
    );
  });

  // Android colour attributes take no colour names ("white").
  it("only uses colours that Android vector drawables accept", () => {
    for (const { fill } of LOGO_PATHS) expect(fill).toMatch(/^#[0-9A-F]{6}$/);
  });

  // Android draws the splash screen icon in a 288 dp square and masks it to its middle: a 192 dp
  // circle (https://developer.android.com/develop/ui/views/launch/splash-screen), or the device's
  // icon shape, which never clips the adaptive icon safe zone (66 dp of the 108 dp layers).
  it("fits whole inside the visible middle of the Android splash screen icon", () => {
    const vector = attributes(drawable, "vector");
    const group = attributes(drawable, "group");
    expect(vector["android:width"]).toBe("288dp");
    expect(vector["android:height"]).toBe("288dp");
    // One group, the only transform of the paths (`attributes` reads the first one), around all
    // of them: a path outside it would be drawn untranslated, in the masked corner,
    expect(drawable.match(/<group\b/g)).toHaveLength(1);
    const grouped = /<group\b[^>]*>([\s\S]*)<\/group>/.exec(drawable)?.[1] ?? "";
    expect(paths(grouped, "android:fillColor", "android:pathData")).toHaveLength(LOGO_PATHS.length);
    // a translation only: the logo is scaled by the viewport alone.
    expect(Object.keys(group).sort()).toEqual(["android:translateX", "android:translateY"]);

    const viewport = Number(vector["android:viewportWidth"]);
    expect(Number(vector["android:viewportHeight"])).toBe(viewport);
    const dp = 288 / viewport;
    const left = Number(group["android:translateX"]) * dp;
    const top = Number(group["android:translateY"]) * dp;
    const width = LOGO_WIDTH * dp;
    const height = LOGO_HEIGHT * dp;

    // Centred,
    expect(left + width / 2).toBeCloseTo(144, 1);
    expect(top + height / 2).toBeCloseTo(144, 1);
    // its corners (those of the viewBox, around the paths) inside the safe zone,
    const safeZoneRadius = ((288 * 66) / 108) * 0.5;
    const corner = Math.hypot(width / 2, height / 2);
    expect(corner).toBeLessThanOrEqual(safeZoneRadius);
    // and not much smaller than it can be.
    expect(corner).toBeGreaterThan(safeZoneRadius - 4);
  });
});

// The v2 brand's logo of "Migrate from" (MigrateAccountEntry), drawn from the file it was given as.
describe("Swiss Bitcoin Pay logo", () => {
  it("draws the paths of assets/images/swiss-bitcoin-pay-logo-white.svg", () => {
    const xml = readAsset("swiss-bitcoin-pay-logo-white.svg");
    const svg = attributes(xml, "svg");
    expect(svg.viewBox).toBe(`0 0 ${SBP_LOGO_WIDTH} ${SBP_LOGO_HEIGHT}`);
    const drawn = [...xml.matchAll(/<path d="([^"]*)" fill="([^"]*)"/g)].map(([, d, fill]) => ({
      d,
      fill
    }));
    // The tile's rounded square masks its red fill in the file; the cross and the wordmark, white.
    expect(drawn).toContainEqual({ d: SBP_LOGO_TILE, fill: "white" });
    expect(drawn).toContainEqual({ d: SBP_LOGO_CROSS, fill: "white" });
    expect(drawn).toContainEqual({ d: SBP_LOGO_WORDMARK, fill: "white" });
    expect(xml).toContain(`fill="${SBP_LOGO_TILE_FILL}"`);
  });
});

// Mt Pelerin's logo ("Powered by" of "Sell"): its brand kit's light version, and its version
// for dark backgrounds in the dark theme, the same shapes, the letters in white.
describe("Mt Pelerin's logo", () => {
  it("has its kit's dark version: the same mark, the same frame, its letters in white", () => {
    expect(MTPELERIN_LOGO_DARK_PATHS).toHaveLength(MTPELERIN_LOGO_PATHS.length);
    const [width, height] = MTPELERIN_LOGO_DARK_VIEWBOX.split(" ").slice(2).map(Number);
    expect(width).toBeCloseTo(MTPELERIN_LOGO_WIDTH, 1);
    expect(height).toBeCloseTo(MTPELERIN_LOGO_HEIGHT, 1);
    MTPELERIN_LOGO_PATHS.forEach(({ fill }, index) => {
      expect(MTPELERIN_LOGO_DARK_PATHS[index]?.fill).toBe(fill === "#3e3e3e" ? "#fff" : fill);
    });
  });
});
