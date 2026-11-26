// The web app's manifest: what makes it installable,
// "Install" in Chrome and Edge, "Add to Home Screen" in Safari. public/index.html links it,
// the variant's icon and its tab icon. All depend on the variant (its icon: dark in staging, light
// in production), so they are written at export time, from the app config, into public/, which the
// web export copies as is: `npm run export:web` and `npm run web` run this script first (the
// export-web jobs of .github/workflows/deploy-staging.yml and release-production.yml run the
// former).
// Written there, not in app.config.ts: the app config is part of the native fingerprint, and a
// web-only change must never start a native build. Never committed (.gitignore).
//
// No service worker: no offline cache. The app needs
// the network to take payments, and a web app kept on an older code by a cache could open its
// wallets' storage with an older Breez SDK, whose storage migrations go one way only (AGENTS.md).
// Chrome and Edge install a web app without one (Chromium dropped that check in Chrome 129),
// Safari and Firefox for Android never asked for one; a test fails if one
// appears (src/__tests__/web-manifest.test.ts).
//
// Run by hand: APP_VARIANT=… node scripts/web-manifest.js
const fs = require("node:fs");
const path = require("node:path");

const PROJECT_ROOT = path.join(__dirname, "..");

/** Where the web export picks them up: Expo CLI copies public/ into the export as is. */
const OUTPUT_DIR = path.join(PROJECT_ROOT, "public");

/**
 * The manifest's name. The `.webmanifest` extension gives it the manifest's own type,
 * `application/manifest+json`, on EAS Hosting, which picks a file's type from its extension (the
 * `mime` package of EAS CLI 24.8.0, worker/assets.js). Linked by public/index.html: never rename
 * one without the other (web-manifest.test.ts).
 */
const MANIFEST_FILE = "manifest.webmanifest";

/**
 * The variant's icon, the whole square (iOS rounds its corners itself, Android masks it). Named as
 * Apple names a website's icon at its root ("Configuring Web Applications"), which some clients
 * request without a link: they get the icon, not the app's page. Linked by public/index.html too.
 */
const ICON_FILE = "apple-touch-icon.png";

/**
 * The tab's icon: the variant's favicon (`web.favicon`, a PNG tile with rounded transparent
 * corners), its very bytes in an ICO file. Expo CLI makes this file from `web.favicon` only when
 * public/ holds none, and where sharp is not installed (the deploy jobs) it resizes it with Jimp,
 * whose `contain` darkens translucent pixels (@expo/image-utils 0.12.7): a grey ring along the
 * tile's corners. No image tool here: the browser scales the same pixels down to the tab. Requested
 * at this path by clients that read no link; linked by public/index.html too.
 */
const FAVICON_FILE = "favicon.ico";

/** The largest side an ICO directory entry holds (one byte, 0 standing for 256). */
const MAX_FAVICON_SIZE = 256;

/**
 * The app's canvas in each theme (src/theme/tokens.ts, `background.app`: palette.cream and
 * palette.ink; web-manifest.test.ts checks they are the same). This script cannot import that
 * TypeScript file.
 */
const LIGHT_CANVAS = "#FAF6EE";
const DARK_CANVAS = "#0B1A33";

/**
 * The colours of each variant's installed app before its page paints (Android's launch screen, a
 * desktop app window's first frame), and of its title bar until the page names its own (the
 * `theme-color` of public/index.html, then the theme in use: surroundings.web.ts). A manifest
 * holds one value of each (no colours per scheme in any shipped browser): the variant's icon's
 * background, so that its launch screen shows the icon on its own colour, the light theme's canvas
 * for production's white icon, the dark one for staging's ink one.
 */
const VARIANT_COLORS = {
  staging: DARK_CANVAS,
  production: LIGHT_CANVAS
};

/**
 * The icon's side, within what every browser takes: at least 512 pixels (Android's launch screen and
 * maskable icons; Chrome needs 144, Firefox for Android 192), at most 1024, the largest icon Chrome
 * installs from on a computer (Chromium, installable_evaluator.cc, kMaximumIconSizeInPx).
 */
const MIN_ICON_SIZE = 512;
const MAX_ICON_SIZE = 1024;

/** The 8 bytes every PNG file starts with (https://www.w3.org/TR/png-3/#5PNG-file-signature). */
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * The width and height of a PNG file, read from its header (IHDR). Throws on anything but a PNG:
 * the manifest declares its type and size, which browsers check against the file.
 */
function pngSize(bytes, name) {
  if (
    bytes.length < 24 ||
    !bytes.subarray(0, 8).equals(PNG_SIGNATURE) ||
    bytes.toString("latin1", 12, 16) !== "IHDR"
  ) {
    throw new Error(`${name} is not a PNG image.`);
  }
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

/**
 * An ICO file holding one PNG image (ICO images may be PNG files since Windows Vista; every
 * browser reads them). Only a square, 8-bit RGBA PNG of at most 256 pixels, the only PNG an ICO
 * entry may hold: throws on anything else, never converts it.
 */
function pngIco(png, name) {
  const { width, height } = pngSize(png, name);
  // IHDR: bit depth (byte 24) 8, colour type (byte 25) 6, truecolour with alpha.
  if (width !== height || width > MAX_FAVICON_SIZE || png[24] !== 8 || png[25] !== 6) {
    throw new Error(
      `${name} is ${width}x${height}: a square 8-bit RGBA PNG of at most ` +
        `${MAX_FAVICON_SIZE} pixels is needed.`
    );
  }
  // ICONDIR: reserved, type 1 (icon), one image.
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  // ICONDIRENTRY: width, height, no palette, reserved, one colour plane, 32 bits per pixel, the
  // image's length and its offset, right after this entry.
  const entry = Buffer.alloc(16);
  entry.writeUInt8(width % MAX_FAVICON_SIZE, 0);
  entry.writeUInt8(height % MAX_FAVICON_SIZE, 1);
  entry.writeUInt8(0, 2);
  entry.writeUInt8(0, 3);
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt32LE(header.length + entry.length, 12);
  return Buffer.concat([header, entry, png]);
}

/**
 * The manifest of an app config (`exp`, as `expo config` resolves it, its variant in
 * `extra.appVariant`) and the size of its icon, as a JSON text.
 * - `id`, `start_url` and `scope` are the origin's root: whichever page it was installed from (a
 *   payment link, an invitation, whose fragment holds a key), the installed app opens on the
 *   welcome screen, and every page of the origin (`/pay#…`, `/join#…`, a v2 hand-off `/#sbp…`)
 *   stays in it. Relative to the manifest's own URL: the same file on any host, the staging one or
 *   the production one. `id` set, so that a later change of
 *   `start_url` never makes another app of it (W3C "Web Application Manifest", `id`).
 * - `display: standalone`: the app's own window, without the browser's bars. No `orientation`: the
 *   web app turns with the device (iPad, desktop).
 * - The icon twice, one file: as is (`any`), and as Android's masked icon (`maskable`), its "s."
 *   being within the mask's safe zone (web-manifest.test.ts).
 */
function webManifest(exp, iconSize) {
  const variant = exp.extra?.appVariant;
  const color = Object.hasOwn(VARIANT_COLORS, variant) ? VARIANT_COLORS[variant] : undefined;
  if (!color) throw new Error(`Unknown app variant "${variant}" in the app config.`);
  if (!exp.name) throw new Error("The app config has no name.");
  if (
    iconSize.width !== iconSize.height ||
    iconSize.width < MIN_ICON_SIZE ||
    iconSize.width > MAX_ICON_SIZE
  ) {
    throw new Error(
      `The variant's icon is ${iconSize.width}x${iconSize.height}: a square of ${MIN_ICON_SIZE} ` +
        `to ${MAX_ICON_SIZE} pixels is needed.`
    );
  }
  const icon = {
    src: `/${ICON_FILE}`,
    sizes: `${iconSize.width}x${iconSize.height}`,
    type: "image/png"
  };
  const manifest = {
    id: "/",
    name: exp.name,
    short_name: exp.name,
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: color,
    theme_color: color,
    icons: [
      { ...icon, purpose: "any" },
      { ...icon, purpose: "maskable" }
    ]
  };
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

/**
 * The files, by name, for an app config: the manifest, the variant's icon (`exp.icon`, the
 * native apps' own, copied as is: no image tool, the same pixels) and its tab icon
 * (`exp.web.favicon`, in an ICO file).
 */
function webManifestFiles(exp, projectRoot = PROJECT_ROOT) {
  if (!exp.icon) throw new Error("The app config has no icon.");
  const icon = fs.readFileSync(path.resolve(projectRoot, exp.icon));
  const manifest = webManifest(exp, pngSize(icon, exp.icon));
  if (!exp.web?.favicon) throw new Error("The app config has no favicon.");
  const favicon = fs.readFileSync(path.resolve(projectRoot, exp.web.favicon));
  return {
    [MANIFEST_FILE]: manifest,
    [ICON_FILE]: icon,
    [FAVICON_FILE]: pngIco(favicon, exp.web.favicon)
  };
}

/** Writes the files of `exp` into `outputDir`; returns their names. */
function writeWebManifestFiles(exp, outputDir = OUTPUT_DIR, projectRoot = PROJECT_ROOT) {
  const files = webManifestFiles(exp, projectRoot);
  fs.mkdirSync(outputDir, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(outputDir, name), content);
  }
  return Object.keys(files);
}

function main() {
  // The public app config, as the web export inlines it (same call as metro.config.js).
  const { getConfig } = require("expo/config");
  const { exp } = getConfig(PROJECT_ROOT, {
    isPublicConfig: true,
    skipSDKVersionRequirement: true
  });
  const names = writeWebManifestFiles(exp);
  console.log(
    `Wrote ${names.join(", ")} (${exp.extra?.appVariant}) into ` +
      `${path.relative(process.cwd(), OUTPUT_DIR) || "."}`
  );
}

module.exports = {
  FAVICON_FILE,
  ICON_FILE,
  MANIFEST_FILE,
  LIGHT_CANVAS,
  DARK_CANVAS,
  webManifest,
  webManifestFiles,
  writeWebManifestFiles
};

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
