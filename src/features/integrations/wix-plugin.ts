/**
 * The Wix plugin whose files the guide copies (github.com/sattleme/checkout-wix). Wix has no plugin
 * to install: the merchant creates six files in the site's backend and pastes each one's content.
 * The app bundles them as the latest release published them, fetched when the app is bundled
 * (scripts/wix-plugin.js, run by metro.config.js) into assets/plugins/wix/, which git ignores:
 * each file as `<name>.txt` (Metro's text assets), and release.json, the release's version and each
 * file's SHA-256 from its notes. A browser cannot read them from GitHub (its release downloads send
 * no CORS header), and the app reaches no other site for them. Each is checked against its SHA-256
 * again before it can be copied (plugin-files.ts). Jest reads a copy of a release instead
 * (jest/wix-plugin/, jest.config.js).
 */

/**
 * Where a file goes in Wix's code panel, which tells how it is made there:
 * - `js`: Backend › + › "Add a .js file", named as the file;
 * - `file`: Backend › + › "Add a file", named as the file: Wix fills it with an example, replaced;
 * - `servicePlugin`: Service Plugins › + › Payment, named `sattlemeCheckout`: Wix makes this file
 *   and the next (`servicePluginConfig`) with examples, replaced.
 * A site that already has `http-functions.js`, `events.js` or `jobs.config` adds the plugin's to its
 * own instead (`shared`: its code, or its job).
 */
export type WixFilePlace = "js" | "file" | "servicePlugin" | "servicePluginConfig";

export type WixPluginFile = {
  /** Its name in Wix, as the release names it. */
  name: string;
  /** The bundled file, as Metro gives an asset: its module id in the apps, its URL on the web. */
  source: number | string;
  /** SHA-256 of its bytes, hex, as the release's notes list it. */
  sha256: string;
  place: WixFilePlace;
  /**
   * A file the site may have already, of its own, which the plugin's goes into: its code
   * (`code`), or its job, into the list of jobs (`jobs`); null for the plugin's own files.
   */
  shared: "code" | "jobs" | null;
};

export type WixPlugin = {
  /** The release's version, `1.2.3`. */
  version: string;
  files: readonly WixPluginFile[];
};

/*
 * The six files, in the order the guide has them made: the plugin's own file first, the only one in
 * the backend then, so it cannot be pasted into the payment provider's file of nearly the same name
 * (`sattlemeCheckout.js`), made last. The same names as scripts/wix-plugin.js, which fetches no
 * release with other files. Metro bundles an asset only where it is `require`d, by a literal path;
 * Expo's lint config allows that for images and fonts, not for these text assets.
 */
/* eslint-disable @typescript-eslint/no-require-imports */
const FILES: readonly Omit<WixPluginFile, "sha256">[] = [
  {
    name: "sattleme-plugin.js",
    source: require("../../../assets/plugins/wix/sattleme-plugin.js.txt"),
    place: "js",
    shared: null
  },
  {
    name: "http-functions.js",
    source: require("../../../assets/plugins/wix/http-functions.js.txt"),
    place: "file",
    shared: "code"
  },
  {
    name: "events.js",
    source: require("../../../assets/plugins/wix/events.js.txt"),
    place: "file",
    shared: "code"
  },
  {
    name: "jobs.config",
    source: require("../../../assets/plugins/wix/jobs.config.txt"),
    place: "file",
    shared: "jobs"
  },
  {
    name: "sattlemeCheckout.js",
    source: require("../../../assets/plugins/wix/sattlemeCheckout.js.txt"),
    place: "servicePlugin",
    shared: null
  },
  {
    name: "sattlemeCheckout-config.js",
    source: require("../../../assets/plugins/wix/sattlemeCheckout-config.js.txt"),
    place: "servicePluginConfig",
    shared: null
  }
];

/** release.json, as scripts/wix-plugin.js writes it. */
const RELEASE: unknown = require("../../../assets/plugins/wix/release.json");
/* eslint-enable @typescript-eslint/no-require-imports */

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

/**
 * The plugin a release.json describes: its version and the hash of each of the guide's files, in
 * the guide's order. Null for anything else: the guide is then not offered rather than copying
 * files it cannot check.
 */
export function wixPluginOf(release: unknown): WixPlugin | null {
  if (!isRecord(release) || typeof release.version !== "string") return null;
  if (!/^\d+\.\d+\.\d+$/.test(release.version) || !Array.isArray(release.files)) return null;
  const hashes = release.files.map((file: unknown) =>
    isRecord(file) && typeof file.name === "string" && typeof file.sha256 === "string"
      ? { name: file.name, sha256: file.sha256 }
      : null
  );
  if (hashes.length !== FILES.length) return null;
  const files: WixPluginFile[] = [];
  for (const [index, file] of FILES.entries()) {
    const hash = hashes[index];
    if (!hash || hash.name !== file.name || !/^[0-9a-f]{64}$/.test(hash.sha256)) return null;
    files.push({ ...file, sha256: hash.sha256 });
  }
  return {
    version: release.version,
    files
  };
}

/** The plugin bundled with the app; null when its release.json is not one (wixPluginOf). */
export const WIX_PLUGIN = wixPluginOf(RELEASE);
