/*
 * The web app is installable: a manifest, the
 * variant's icon and its tab icon, written at export time from the app config
 * (scripts/web-manifest.js) and linked from public/index.html. Never a service worker.
 */
import type { ExpoConfig } from "expo/config";

import appConfig from "../../app.config";
import { withEnv } from "../../jest/env";
import { readPng } from "../../jest/png";
import packageJson from "../../package.json";
import { darkColors, lightColors, palette } from "../theme/tokens";

// Node's types are not loaded (tsconfig `types` only lists jest): only what this test needs is
// typed here, as in passkey-association.test.ts.
declare const __dirname: string;
type Dirent = { name: string; isDirectory(): boolean; isFile(): boolean };
const fs = jest.requireActual<{
  mkdtempSync(prefix: string): string;
  readdirSync(path: string): string[];
  readdirSync(path: string, options: { withFileTypes: true }): Dirent[];
  readFileSync(path: string): Uint8Array;
  readFileSync(path: string, encoding: "utf8"): string;
  writeFileSync(path: string, data: Uint8Array | string): void;
  rmSync(path: string, options: { recursive: true; force: true }): void;
}>("fs");
const { join, relative } = jest.requireActual<{
  join(...segments: string[]): string;
  relative(from: string, to: string): string;
}>("path");
const { tmpdir } = jest.requireActual<{ tmpdir(): string }>("os");

const ROOT = join(__dirname, "../..");

type Icon = { src: string; sizes: string; type: string; purpose: string };
type Manifest = {
  id: string;
  name: string;
  short_name: string;
  start_url: string;
  scope: string;
  display: string;
  background_color: string;
  theme_color: string;
  icons: Icon[];
  [member: string]: unknown;
};

const script = jest.requireActual<{
  FAVICON_FILE: string;
  ICON_FILE: string;
  MANIFEST_FILE: string;
  LIGHT_CANVAS: string;
  DARK_CANVAS: string;
  webManifest(exp: ExpoConfig, iconSize: { width: number; height: number }): string;
  webManifestFiles(exp: ExpoConfig, projectRoot?: string): Record<string, string | Uint8Array>;
  writeWebManifestFiles(exp: ExpoConfig, outputDir: string, projectRoot?: string): string[];
}>("../../scripts/web-manifest.js");

const VARIANTS = ["staging", "production"] as const;

/** The app config of a variant, as the web export resolves it (outside EAS Build). */
function configOf(variant: string): ExpoConfig {
  return withEnv({ APP_VARIANT: variant, PASSKEY_RP_ID: undefined, EAS_BUILD: undefined }, () =>
    appConfig({ config: {} } as Parameters<typeof appConfig>[0])
  );
}

/** The manifest the export writes for a variant. */
function manifestOf(variant: string): Manifest {
  const files = script.webManifestFiles(configOf(variant));
  return JSON.parse(files[script.MANIFEST_FILE] as string) as Manifest;
}

/** The manifest and icon of a variant, written as the export writes them, into a fresh folder. */
function withWrittenFiles<T>(variant: string, check: (dir: string, names: string[]) => T): T {
  const dir = fs.mkdtempSync(join(tmpdir(), "web-manifest-"));
  try {
    return check(dir, script.writeWebManifestFiles(configOf(variant), dir));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const indexHtml = fs.readFileSync(join(ROOT, "public/index.html"), "utf8");

/** The `<link>` and `<meta>` tags of public/index.html's head, by their attributes. */
function headTags(tag: "link" | "meta"): Record<string, string>[] {
  const head = indexHtml.slice(0, indexHtml.indexOf("</head>"));
  return [...head.matchAll(new RegExp(`<${tag}\\b([^>]*)>`, "g"))].map(([, attributes]) =>
    Object.fromEntries(
      [...attributes.matchAll(/([a-zA-Z-]+)="([^"]*)"/g)].map(([, name, value]) => [name, value])
    )
  );
}

describe("the web app's manifest", () => {
  // Chrome and Edge install a web app whose manifest has a name, a start URL in its scope, a
  // display of its own and a PNG icon of at least 144 pixels; Safari reads the same members.
  it.each(VARIANTS)("makes the %s web app installable, opened on its welcome screen", (variant) => {
    const manifest = manifestOf(variant);

    expect(manifest).toEqual({
      id: "/",
      name: "sattle.me",
      short_name: "sattle.me",
      start_url: "/",
      scope: "/",
      display: "standalone",
      background_color: expect.any(String),
      theme_color: expect.any(String),
      icons: expect.any(Array)
    });
    expect(manifest.name).toBe(configOf(variant).name);
    // Never the app's native store listing first, nor a locked orientation (iPad, desktop).
    expect(manifest).not.toHaveProperty("prefer_related_applications");
    expect(manifest).not.toHaveProperty("orientation");
  });

  // Every page of the origin stays in the installed app: a payment link, an invitation, a v2
  // hand-off, all in their fragment; the app never starts on the page it was installed from.
  it("keeps the payment links, the invitations and the v2 hand-offs in its scope", () => {
    for (const variant of VARIANTS) {
      const { scope, start_url: startUrl, id } = manifestOf(variant);
      const origin = "https://app.example";
      const scopeUrl = new URL(scope, `${origin}/manifest.webmanifest`).href;
      for (const page of ["/", "/pay#a1b2.c3d4", "/join#e5f6", "/#sbp-from=x", "/#sbp=y"]) {
        expect(new URL(page, origin).href.startsWith(scopeUrl)).toBe(true);
      }
      expect(new URL(startUrl, origin).href).toBe(`${origin}/`);
      expect(id).toBe("/");
    }
  });

  // The icon tells staging apart, as the native apps' does: its launch screen and title bar in the
  // icon's own background, the dark theme's canvas for staging, the light one's for production.
  it("gives each variant its own icon and the colours of its background", () => {
    const staging = manifestOf("staging");
    const production = manifestOf("production");

    expect(staging.background_color).toBe(darkColors.background.app);
    expect(staging.theme_color).toBe(darkColors.background.app);
    expect(production.background_color).toBe(lightColors.background.app);
    expect(production.theme_color).toBe(lightColors.background.app);
    expect(script.DARK_CANVAS).toBe(darkColors.background.app);
    expect(script.LIGHT_CANVAS).toBe(lightColors.background.app);

    for (const variant of VARIANTS) {
      const config = configOf(variant);
      const files = script.webManifestFiles(config);
      expect(files[script.ICON_FILE]).toEqual(fs.readFileSync(join(ROOT, config.icon ?? "")));
    }
    expect(configOf("staging").icon).not.toBe(configOf("production").icon);
  });

  // Browsers check an icon's type and size against the manifest: each icon is a file the export
  // writes, a PNG of the very size declared, large enough for Android's launch screen and maskable
  // icons (512), within what Chrome installs from on a computer (1024).
  it.each(VARIANTS)("declares the %s icons at the size of the file written", (variant) => {
    withWrittenFiles(variant, (dir, names) => {
      expect(names.sort()).toEqual(
        [script.FAVICON_FILE, script.ICON_FILE, script.MANIFEST_FILE].sort()
      );
      expect(fs.readdirSync(dir).sort()).toEqual(names);
      const manifest = JSON.parse(
        fs.readFileSync(join(dir, script.MANIFEST_FILE), "utf8")
      ) as Manifest;

      expect(manifest.icons.map((icon) => icon.purpose).sort()).toEqual(["any", "maskable"]);
      for (const icon of manifest.icons) {
        expect(icon.type).toBe("image/png");
        expect(icon.src).toBe(`/${script.ICON_FILE}`);
        const png = readPng(join(dir, icon.src));
        expect(icon.sizes).toBe(`${png.width}x${png.height}`);
        expect(png.width).toBe(png.height);
        expect(png.width).toBeGreaterThanOrEqual(512);
        expect(png.width).toBeLessThanOrEqual(1024);
      }
    });
  });

  // A maskable icon is cut to any shape within its middle circle of 40 % of its side in radius
  // (W3C "Web Application Manifest", safe zone): the "s." stays within it, the rest is the
  // icon's background. And the icon is opaque: iOS fills transparent parts in black.
  it.each(VARIANTS)('keeps the %s icon\'s "s." within the maskable safe zone', (variant) => {
    const png = readPng(join(ROOT, configOf(variant).icon ?? ""));
    const background = png.rgbValue(0, 0);
    const centre = (png.width - 1) / 2;
    const radius = png.width * 0.4;
    let logo = 0;
    let outside = 0;
    let translucent = 0;
    for (let y = 0; y < png.height; y++) {
      for (let x = 0; x < png.width; x++) {
        if (png.alpha(x, y) !== 255) translucent++;
        if (png.rgbValue(x, y) === background) continue;
        logo++;
        if (Math.hypot(x - centre, y - centre) >= radius) outside++;
      }
    }
    expect({ outside, translucent }).toEqual({ outside: 0, translucent: 0 });
    expect(logo).toBeGreaterThan(png.width * png.height * 0.1);
    expect(background).toBe(variant === "staging" ? 0x0b1a33 : 0xffffff);
  });

  // Expo CLI makes its own favicon.ico only when public/ holds none, with Jimp on the deploy jobs,
  // which darkens the tile's translucent corners: the file written is the variant's PNG, its very
  // bytes, in a one-image ICO file (ICONDIR, then one ICONDIRENTRY, then the PNG).
  it.each(VARIANTS)("writes the %s favicon's very pixels into favicon.ico", (variant) => {
    withWrittenFiles(variant, (dir) => {
      const favicon = fs.readFileSync(join(ROOT, configOf(variant).web?.favicon ?? ""));
      const ico = fs.readFileSync(join(dir, script.FAVICON_FILE));
      const view = new DataView(ico.buffer, ico.byteOffset, ico.byteLength);

      expect([view.getUint16(0, true), view.getUint16(2, true), view.getUint16(4, true)]).toEqual([
        0, 1, 1
      ]);
      // Width, height, palette, reserved, planes, bits per pixel, length, offset.
      expect([
        ico[6],
        ico[7],
        ico[8],
        ico[9],
        view.getUint16(10, true),
        view.getUint16(12, true),
        view.getUint32(14, true),
        view.getUint32(18, true)
      ]).toEqual([48, 48, 0, 0, 1, 32, favicon.length, 22]);
      expect(ico.length).toBe(22 + favicon.length);
      expect(ico.subarray(22)).toEqual(favicon);
    });
  });

  // An ICO entry holds a square PNG of at most 256 pixels, in 8-bit RGBA only: anything else is
  // refused, never converted.
  it("refuses a favicon that an ICO file cannot hold", () => {
    const config = configOf("production");
    const dir = fs.mkdtempSync(join(tmpdir(), "web-manifest-favicon-"));
    const withFavicon = (favicon: string) => ({ ...config, web: { ...config.web, favicon } });
    try {
      const icon = join(ROOT, config.icon ?? "");
      const rgba = fs.readFileSync(join(ROOT, config.web?.favicon ?? ""));
      const withIcon = { icon };
      // The app icon: 1024 pixels, RGB.
      expect(() => script.webManifestFiles({ ...withFavicon(icon), ...withIcon }, dir)).toThrow(
        /1024x1024: a square 8-bit RGBA PNG of at most 256 pixels/
      );
      const rgb = Uint8Array.from(rgba);
      rgb[25] = 2;
      fs.writeFileSync(join(dir, "rgb.png"), rgb);
      expect(() =>
        script.webManifestFiles({ ...withFavicon("./rgb.png"), ...withIcon }, dir)
      ).toThrow(/48x48: a square 8-bit RGBA PNG/);
      const wide = Uint8Array.from(rgba);
      wide[19] = 64;
      fs.writeFileSync(join(dir, "wide.png"), wide);
      expect(() =>
        script.webManifestFiles({ ...withFavicon("./wide.png"), ...withIcon }, dir)
      ).toThrow(/64x48/);
      fs.writeFileSync(join(dir, "favicon.png"), "not a PNG");
      expect(() =>
        script.webManifestFiles({ ...withFavicon("./favicon.png"), ...withIcon }, dir)
      ).toThrow(/not a PNG/);
      expect(() =>
        script.webManifestFiles(
          { ...config, icon, web: { ...config.web, favicon: undefined } },
          dir
        )
      ).toThrow(/no favicon/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  // The export would deploy a manifest that browsers refuse, or none.
  it("refuses an icon that is not a large enough square PNG, and an unknown variant", () => {
    const config = configOf("production");
    expect(() => script.webManifest(config, { width: 1024, height: 512 })).toThrow(/square/);
    expect(() => script.webManifest(config, { width: 256, height: 256 })).toThrow(/512/);
    // Chrome on a computer installs from no icon larger than 1024 pixels.
    expect(() => script.webManifest(config, { width: 2048, height: 2048 })).toThrow(/1024/);
    expect(() =>
      script.webManifest(
        { ...config, extra: { ...config.extra, appVariant: "preview" } },
        { width: 1024, height: 1024 }
      )
    ).toThrow(/variant/);
    // Never a member every object has: it would pass as a colour.
    expect(() =>
      script.webManifest(
        { ...config, extra: { ...config.extra, appVariant: "constructor" } },
        { width: 1024, height: 1024 }
      )
    ).toThrow(/variant/);

    const dir = fs.mkdtempSync(join(tmpdir(), "web-manifest-icon-"));
    try {
      fs.writeFileSync(join(dir, "icon.png"), "not a PNG");
      expect(() => script.webManifestFiles({ ...config, icon: "./icon.png" }, dir)).toThrow(
        /not a PNG/
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("public/index.html", () => {
  it("links the manifest and the icon that the export writes", () => {
    const links = headTags("link");

    expect(links).toContainEqual({ rel: "manifest", href: `/${script.MANIFEST_FILE}` });
    expect(links).toContainEqual({ rel: "apple-touch-icon", href: `/${script.ICON_FILE}` });
    expect(links).toContainEqual({ rel: "icon", href: `/${script.FAVICON_FILE}` });
  });

  // The browser's bars in the canvas of the device's theme, until the app's code paints them in
  // this device's "Theme" (surroundings.web.ts).
  it("names a theme colour for each scheme of the device", () => {
    const themeColors = headTags("meta").filter((meta) => meta.name === "theme-color");

    expect(themeColors).toEqual([
      {
        name: "theme-color",
        media: "(prefers-color-scheme: light)",
        content: lightColors.background.app
      },
      {
        name: "theme-color",
        media: "(prefers-color-scheme: dark)",
        content: darkColors.background.app
      }
    ]);
    expect(palette.cream).toBe(lightColors.background.app);
  });

  // Each deploy writes the files before its export: the npm scripts, which the staging and
  // production deploys run (their export-web jobs, on GitHub).
  it("is exported and deployed with the files it links, which git never holds", () => {
    const { scripts } = packageJson as { scripts: Record<string, string> };
    expect(scripts["export:web"]).toMatch(/^node scripts\/web-manifest\.js && expo export /);
    expect(scripts.web).toMatch(/^node scripts\/web-manifest\.js && expo start /);

    for (const file of ["deploy-staging.yml", "release-production.yml"]) {
      const workflow = fs.readFileSync(join(ROOT, ".github/workflows", file), "utf8");
      const exportWeb = workflow.slice(workflow.indexOf("  export-web:"));
      expect(exportWeb).toContain("run: npm run export:web");
    }

    const ignored = fs.readFileSync(join(ROOT, ".gitignore"), "utf8").split("\n");
    expect(ignored).toEqual(
      expect.arrayContaining([
        `/public/${script.MANIFEST_FILE}`,
        `/public/${script.ICON_FILE}`,
        `/public/${script.FAVICON_FILE}`
      ])
    );
  });
});

/**
 * Where the web app's code and the files it serves live: the app's sources, what the export copies
 * as is, its scripts, plugins and modules, and the files at the root that build it.
 */
const SHIPPED = ["src", "public", "scripts", "plugins", "modules", "index.ts", "app.config.ts"];

/** Folders that are not the project's sources: generated, or another tool's. */
const NOT_SOURCES = new Set(["node_modules", "android", "ios", "build", ".gradle", ".cxx"]);

function filesUnder(path: string): string[] {
  const entries = fs.readdirSync(path, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const child = join(path, entry.name);
    if (entry.isDirectory()) return NOT_SOURCES.has(entry.name) ? [] : filesUnder(child);
    return entry.isFile() ? [child] : [];
  });
}

describe("no service worker", () => {
  // A service worker would cache the app: a web app kept on an
  // older code could open its wallets' storage with an older Breez SDK, whose migrations go one
  // way only, and it would stop the app from updating itself ("New version available").
  it("registers none and serves none", () => {
    const self = join(ROOT, "src/__tests__/web-manifest.test.ts");
    const files = SHIPPED.flatMap((entry) => {
      const path = join(ROOT, entry);
      return entry.includes(".") ? [path] : filesUnder(path);
    }).filter((file) => file !== self);
    expect(files.length).toBeGreaterThan(100);

    const found = files.filter((file) => {
      const name = relative(ROOT, file);
      if (/(^|\/)(sw|service-?worker[^/]*|workbox[^/]*)\.[cm]?[jt]sx?$/i.test(name)) return true;
      if (!/\.([cm]?[jt]sx?|html|json|webmanifest)$/.test(name)) return false;
      return /serviceWorker|workbox/i.test(fs.readFileSync(file, "utf8"));
    });
    expect(found.map((file) => relative(ROOT, file))).toEqual([]);
  });

  // Packages that make one: Workbox and the PWA plugins of bundlers.
  it("depends on no package that makes one", () => {
    const { dependencies, devDependencies } = packageJson as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    const names = Object.keys({ ...dependencies, ...devDependencies });
    expect(names.filter((name) => /workbox|pwa|service-?worker/i.test(name))).toEqual([]);
  });

  // expo-notifications registers the service worker its config names, for web push
  // (getDevicePushTokenAsync.web.js): the web app has no push.
  it.each(VARIANTS)("gives expo-notifications none to register in the %s web app", (variant) => {
    const config = configOf(variant) as ExpoConfig & {
      notification?: { serviceWorkerPath?: string };
    };
    expect(config.notification?.serviceWorkerPath).toBeUndefined();
  });
});
