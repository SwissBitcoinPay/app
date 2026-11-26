// The plugin that keeps the `fetch` background mode out of the iPhone app
// (plugins/no-ios-background-fetch): through Expo's own mod compiler, with expo-task-manager's own
// plugin, and in the prebuild of this very project for both platforms, where Expo applies that
// plugin by itself (the module is linked for Android). Expo's introspection: nothing is written.
import type { ExpoConfig } from "expo/config";
import { compileModsAsync, withInfoPlist, type ConfigPlugin } from "expo/config-plugins";

import appConfig from "../../app.config";
import { withEnv } from "../../jest/env";
import withoutBackgroundFetch from "../../plugins/no-ios-background-fetch/app.plugin";

// Node's types are not loaded (tsconfig `types` only lists jest): only what this test needs.
declare const __dirname: string;
const { join } = jest.requireActual<{ join(...segments: string[]): string }>("path");
const { createRequire } = jest.requireActual<{
  createRequire(file: string): (request: string) => unknown;
}>("module");

// expo-task-manager's own plugin (it has no types), the one Expo applies by itself.
const { default: withTaskManager } = jest.requireActual<{ default: ConfigPlugin }>(
  "expo-task-manager/app.plugin"
);

const ROOT = join(__dirname, "..", "..");

// Each test runs Expo's own config tooling over this project and its modules (plugins, autolinking,
// a prebuild's introspection): about a second here, but over the default 15 s on a loaded CI
// runner. Its budget is the work it does; what it checks does not depend on time.
jest.setTimeout(60_000);
const PLUGIN = "./plugins/no-ios-background-fetch/app.plugin";

type Compiled = ExpoConfig & {
  _internal?: {
    autolinkedModules?: string[];
    modResults?: { ios?: { infoPlist?: Record<string, unknown> } };
  };
};
type Compile = (
  config: ExpoConfig,
  options: {
    projectRoot: string;
    platforms: string[];
    introspect: boolean;
    assertMissingModProviders: boolean;
  }
) => Promise<ExpoConfig>;

// Expo's prebuild as Node runs it: it loads app.config.ts and the plugins with its own loader.
const fromRoot = createRequire(join(ROOT, "package.json"));
const { getPrebuildConfigAsync } = fromRoot("@expo/prebuild-config") as {
  getPrebuildConfigAsync(
    projectRoot: string,
    props: { platforms: string[] }
  ): Promise<{
    exp: ExpoConfig;
  }>;
};
const { getAutolinkedPackagesAsync } = fromRoot(
  "@expo/prebuild-config/build/getAutolinkedPackages"
) as { getAutolinkedPackagesAsync(projectRoot: string, platforms: string[]): Promise<string[]> };
const nodeConfigPlugins = fromRoot("@expo/config-plugins") as { compileModsAsync: Compile };

/** The Info.plist a prebuild of `config` writes for iOS, by Expo's introspection. */
async function iosInfoPlist(
  config: ExpoConfig,
  projectRoot: string,
  compile: Compile = compileModsAsync as unknown as Compile
): Promise<Record<string, unknown>> {
  const compiled = (await compile(config, {
    projectRoot,
    platforms: ["ios"],
    introspect: true,
    assertMissingModProviders: false
  })) as Compiled;
  const infoPlist = compiled._internal?.modResults?.ios?.infoPlist;
  if (!infoPlist) throw new Error("No Info.plist introspected");
  return infoPlist;
}

/** Another plugin's background mode. */
const withMode =
  (mode: string): ConfigPlugin =>
  (config) =>
    withInfoPlist(config, (config) => {
      const modes: unknown = config.modResults.UIBackgroundModes;
      config.modResults.UIBackgroundModes = [...(Array.isArray(modes) ? modes : []), mode];
      return config;
    });

/** A bare app (a new one each time: plugins change the config they get). */
const bare = (): ExpoConfig => ({ name: "sattle.me", slug: "sattleme" });
/** Its plist read from no project: the plugin's own directory has no ios/. */
const NO_PROJECT = join(ROOT, "plugins", "no-ios-background-fetch");

describe("no-ios-background-fetch plugin", () => {
  it("takes out the `fetch` mode expo-task-manager's plugin adds, in Expo's order", async () => {
    // Without it, the mode is there: what the plugin is for.
    expect((await iosInfoPlist(withTaskManager(bare()), NO_PROJECT)).UIBackgroundModes).toEqual([
      "fetch"
    ]);
    // The app's plugins first, Expo's automatic ones after (getPrebuildConfigAsync).
    const infoPlist = await iosInfoPlist(
      withTaskManager(withoutBackgroundFetch(bare())),
      NO_PROJECT
    );
    expect(infoPlist).not.toHaveProperty("UIBackgroundModes");
  });

  it("keeps any other background mode", async () => {
    const config = withTaskManager(withMode("remote-notification")(withoutBackgroundFetch(bare())));
    expect((await iosInfoPlist(config, NO_PROJECT)).UIBackgroundModes).toEqual([
      "remote-notification"
    ]);
  });

  it("is applied in both variants", () => {
    for (const variant of ["staging", "production"]) {
      const config = withEnv({ APP_VARIANT: variant, EAS_BUILD: undefined }, () =>
        appConfig({ config: {} } as Parameters<typeof appConfig>[0])
      );
      expect(config.plugins).toContain(PLUGIN);
    }
  });
});

describe("the card socket task's modules", () => {
  it("are linked on Android only", async () => {
    const android = await getAutolinkedPackagesAsync(ROOT, ["android"]);
    const ios = await getAutolinkedPackagesAsync(ROOT, ["ios"]);
    for (const name of ["expo-task-manager", "unimodules-app-loader"]) {
      expect(android).toContain(name);
      expect(ios).not.toContain(name);
    }
  });

  it("leave the iPhone app of a prebuild of both platforms without any background mode", async () => {
    const { exp } = await getPrebuildConfigAsync(ROOT, { platforms: ["ios", "android"] });
    // Linked for Android: Expo applied expo-task-manager's plugin, to iOS too.
    expect((exp as Compiled)._internal?.autolinkedModules).toContain("expo-task-manager");
    const infoPlist = await iosInfoPlist(exp, ROOT, nodeConfigPlugins.compileModsAsync);
    expect(infoPlist).not.toHaveProperty("UIBackgroundModes");
  });
});
