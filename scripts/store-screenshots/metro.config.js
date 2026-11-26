// The Metro config of the store screenshots' web build (scripts/store-screenshots/capture.mjs),
// never of the app's: the project's own config (metro.config.js) with two modules swapped:
// - the loader of the Breez SDK's web build (src/lib/breez/web-sdk.ts) resolves to a fake wallet
//   (./web-sdk.ts), so that the screens show a fictitious business without a passkey, a wallet nor
//   a Breez API key;
// - the BoltCard reader of the web (src/lib/nfc/boltcard.web.ts) resolves to ./boltcard.ts, which
//   reads as the device the page shows does (the point of sale's "Or hold the BoltCard").
// Every other module is the app's own.
//
// Expo CLI loads it in place of metro.config.js through EXPO_OVERRIDE_METRO_CONFIG, which only
// capture.mjs sets, for its own export to its own output directory. That variable is internal to
// Expo CLI (instantiateMetro.js of SDK 58): the page checks at run time that the fake is the one
// loaded (FAKE_MARKER), and the capture stops otherwise.
const path = require("node:path");

const projectConfig = require("../../metro.config.js");

const PROJECT_ROOT = path.join(__dirname, "..", "..");

/** The modules swapped, each to what takes its place. */
const SWAPPED = new Map([
  [
    path.join(PROJECT_ROOT, "src", "lib", "breez", "web-sdk.ts"),
    path.join(__dirname, "web-sdk.ts")
  ],
  [
    path.join(PROJECT_ROOT, "src", "lib", "nfc", "boltcard.web.ts"),
    path.join(__dirname, "boltcard.ts")
  ]
]);

const resolveProjectRequest = projectConfig.resolver.resolveRequest;

/** Resolves as the project does, then sends the modules swapped to what takes their place. */
function resolveRequest(context, moduleName, platform) {
  const resolution = resolveProjectRequest(context, moduleName, platform);
  const swapped =
    resolution.type === "sourceFile" ? SWAPPED.get(path.resolve(resolution.filePath)) : undefined;
  return swapped ? { type: "sourceFile", filePath: swapped } : resolution;
}

module.exports = {
  ...projectConfig,
  // A cache of its own: nothing this build makes is reused by the app's builds, nor the reverse.
  cacheVersion: `${projectConfig.cacheVersion}+store-screenshots`,
  resolver: { ...projectConfig.resolver, resolveRequest }
};
