// https://docs.expo.dev/versions/v58.0.0/sdk/fingerprint/
// The staging runtime version is this fingerprint (app.config.ts): every change to it starts a new
// EAS staging build, and installed staging apps stop receiving updates until testers reinstall.
// Keep tooling-only files out of it: package.json `scripts` (e.g. bumping the pinned expo-doctor)
// and .gitignore (android/ and ios/ are generated, so it holds no native project rules).
const { SourceSkips } = require("expo/fingerprint");

const { engineFiles } = require("./scripts/extension-engine");

/** @type {import("expo/fingerprint").Config} */
module.exports = {
  // Expo SDK 58's default, said here: a package of node_modules (native module, config plugin) is
  // hashed by its name and version, not its files, so the Breez SDK's binaries, downloaded by its
  // postinstall, no longer count; the app's own modules (modules/) and plugins (plugins/) are still
  // hashed by their files. Its own source skips are replaced by these:
  // versions and eas.json still count, as before.
  preset: "balanced",
  sourceSkips: SourceSkips.PackageJsonScriptsAll | SourceSkips.GitIgnore,
  // Native files the fingerprint does not find by itself. Of the expo-splash-screen options, it
  // hashes the images, not `android.drawable` (@expo/fingerprint, sourcer/Expo.js): without this,
  // a change to the drawable would only reach staging apps as an update, which cannot change it.
  // src/__tests__/app-config.test.ts checks that they are the drawables of app.config.ts.
  extraSources: [
    {
      type: "file",
      filePath: "assets/images/splash-logo-android.xml",
      reasons: ["expo-splash-screen android.drawable"]
    },
    {
      type: "file",
      filePath: "assets/images/splash-logo-android-dark.xml",
      reasons: ["expo-splash-screen android.drawable.darkIcon"]
    },
    // The iOS notification service extension's Swift files and podspecs, which its plugin copies
    // into ios/: of a local plugin, the fingerprint hashes the plugin's own file only. Without
    // this, a change to them would reach staging apps as an update, which cannot carry native
    // code. Sources are not per platform: such a change also starts an Android staging build.
    {
      type: "dir",
      filePath: "plugins/card-notification-extension",
      reasons: ["card notification extension"]
    },
    // Where the card items and files are, which the extension reads too: an update of the app that
    // looks for them elsewhere (before they moved into the app group) never reaches a build that
    // moved them, nor the reverse (src/lib/card/card-keychain.ts, card-files.ts).
    ...[
      "src/lib/card/app-group.ts",
      "src/lib/card/app-group-name.ts",
      "src/lib/card/card-keychain.ts",
      "src/lib/card/card-files.ts",
      "src/lib/card/extension-dir.ts",
      // What the extension records of its card payments, which the app reads.
      "src/lib/card/extension-records.ts",
      // The device's relays, moved to the card items (read by the extension).
      "src/lib/relays/store.ts",
      "src/features/rescue/traces.ts"
    ].map((filePath) => ({ type: "file", filePath, reasons: ["card shared storage"] })),
    // The extension's JavaScript (scripts/extension-engine.js): the app's own TypeScript, bundled
    // into the extension at prebuild. The extension takes no update: a change to one of its files
    // starts a native build.
    { type: "file", filePath: "scripts/extension-engine.js", reasons: ["extension engine"] },
    ...engineFiles().files.map((filePath) => ({
      type: "file",
      filePath,
      reasons: ["extension engine"]
    }))
  ]
};
