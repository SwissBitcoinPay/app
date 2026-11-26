import { withInfoPlist, type ConfigPlugin } from "expo/config-plugins";

/*
 * The card socket's task runs on Android only (src/features/card/wake-task.android.ts):
 * expo-task-manager is not linked on iOS (package.json, `expo.autolinking.ios.exclude`). Expo's
 * prebuild applies its config plugin by itself to an app that links it, and that plugin adds the
 * `fetch` background mode to the iOS Info.plist. A prebuild of iOS alone (EAS Build) leaves it
 * out, but one of both platforms at once links it for Android and adds it to iOS too: the iPhone
 * app would declare a background mode it never uses (App Review, guideline 2.5.4). This takes it
 * out, whichever the prebuild. app.config.ts' plugins are applied before Expo's automatic ones,
 * and Expo runs the latest plugin's change first: this one sees the mode added (as a prebuild of
 * both platforms shows).
 */
const withoutBackgroundFetch: ConfigPlugin = (config) =>
  withInfoPlist(config, (config) => {
    const modes: unknown = config.modResults.UIBackgroundModes;
    if (Array.isArray(modes)) {
      const kept = modes.filter((mode) => mode !== "fetch");
      if (kept.length > 0) config.modResults.UIBackgroundModes = kept;
      else delete config.modResults.UIBackgroundModes;
    }
    return config;
  });

export default withoutBackgroundFetch;
