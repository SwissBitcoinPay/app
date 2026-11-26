// Learn more: https://docs.expo.dev/guides/customizing-metro/
const { execFileSync } = require("node:child_process");
const { createHash } = require("node:crypto");

const { getConfig } = require("expo/config");
const { getDefaultConfig } = require("expo/metro-config");

const { fetchWixPluginSync } = require("./scripts/wix-plugin");

/** A full commit hash: 40 hex digits, 64 in SHA-256 repositories. */
const COMMIT_HASH = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i;

/**
 * Commit of the bundled code, shown next to the version (src/lib/app-info.ts). The first commit
 * hash among: EXPO_PUBLIC_GIT_COMMIT (the staging deploy passes it to EAS), the commit of the EAS
 * build (EAS_BUILD_GIT_COMMIT_HASH, set by EAS Build), then the git checkout. Null when none is
 * known: the app then shows no commit.
 */
function resolveGitCommit() {
  const fromEnv = [process.env.EXPO_PUBLIC_GIT_COMMIT, process.env.EAS_BUILD_GIT_COMMIT_HASH]
    .map((value) => value?.trim())
    .find((value) => value && COMMIT_HASH.test(value));
  if (fromEnv) return fromEnv;
  try {
    const head = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: __dirname,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
    return COMMIT_HASH.test(head) ? head : null;
  } catch {
    // No git, or not a git checkout.
    return null;
  }
}

// Every bundle is made through this config (dev server, `expo export`, `eas update`, the JS step
// of native builds): the commit is inlined there as an EXPO_PUBLIC_* variable. Not in the app
// config `extra`, which the native fingerprint hashes: every commit would start a new EAS staging
// build. The dev server resolves it when it starts: restart it to show a newer commit.
const gitCommit = resolveGitCommit();
if (gitCommit) process.env.EXPO_PUBLIC_GIT_COMMIT = gitCommit;
else delete process.env.EXPO_PUBLIC_GIT_COMMIT;

/**
 * The public app config as Babel inlines it into web bundles, where expo-constants reads it
 * (`process.env.APP_MANIFEST`, see expo-inline-manifest-plugin of babel-preset-expo): the variant,
 * Breez network and passkey RP ID of the web app come from there.
 */
function getInlinedAppConfig() {
  return (
    process.env.APP_MANIFEST ||
    JSON.stringify(
      getConfig(__dirname, { isPublicConfig: true, skipSDKVersionRequirement: true }).exp
    )
  );
}

/**
 * The EXPO_PUBLIC_* variables (as names and values), which Babel inlines into production bundles:
 * the commit, the Breez API key of .env.local, … Only their hash goes into the cache key.
 */
function getPublicEnv() {
  return JSON.stringify(
    Object.keys(process.env)
      .filter((name) => name.startsWith("EXPO_PUBLIC_"))
      .sort()
      .map((name) => [name, process.env[name]])
  );
}

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

const config = getDefaultConfig(__dirname);

// Metro's transform cache keys on the source files, not on the values Babel inlines into them:
// without these keys, a bundle reuses stale values.
// - The app config, inlined into web bundles, dev included: a production export (or dev server)
//   started after a staging one kept the staging variant and passkey RP ID.
// - Outside the dev server, the EXPO_PUBLIC_* variables: an export after a new commit kept the
//   previous one, an export after setting EXPO_PUBLIC_BREEZ_API_KEY kept the previous key. The
//   dev server keeps its cache across their changes: it reads them when serializing the bundle
//   (expo/virtual/env). Expo CLI sets NODE_ENV before loading this file. Expo SDK 58 records the
//   EXPO_PUBLIC_* values it inlines in its transform cache too (expo/expo#47750): this key stays,
//   which the app's own tests check (metro-config.test.ts).
const cacheKeys = [`config:${sha256(getInlinedAppConfig())}`];
if (process.env.NODE_ENV !== "development") cacheKeys.push(`env:${sha256(getPublicEnv())}`);
config.cacheVersion = [config.cacheVersion, ...cacheKeys].join("+");

// The web build of the Breez SDK (@breeztech/breez-sdk-spark/web) is WebAssembly: its .wasm
// file becomes an asset, which Metro gives to the web bundle as its URL.
config.resolver.assetExts.push("wasm");

// The Wix plugin's files that the Wix guide copies (src/features/integrations/wix-plugin.ts),
// fetched from the plugin's latest release before every bundle (dev server, web export, native
// builds, updates), into assets/plugins/wix/: text the guide copies, bundled as assets, read when
// the guide shows them, never parsed as code. A bundle fails without them.
fetchWixPluginSync();
config.resolver.assetExts.push("txt");

// src/lib/breez/web-sdk.ts initialises that build itself, with the URL of the .wasm (see there).
// It imports two files that the package "exports" do not list: they are resolved as imports
// relative to the package's own web entry, like its passkey module imports them.
const BREEZ_WEB_FILES = {
  "@breeztech/breez-sdk-spark/web/breez_sdk_spark_wasm.js": "./breez_sdk_spark_wasm.js",
  "@breeztech/breez-sdk-spark/web/breez_sdk_spark_wasm_bg.wasm": "./breez_sdk_spark_wasm_bg.wasm"
};
const breezWebEntry = require.resolve("@breeztech/breez-sdk-spark/web");

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const file = BREEZ_WEB_FILES[moduleName];
  if (file) {
    return context.resolveRequest({ ...context, originModulePath: breezWebEntry }, file, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
