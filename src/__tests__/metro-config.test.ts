// metro.config.js: the commit shown next to the version, the keys of Metro's transform cache, and
// the Wix plugin's files fetched before each bundle.

type MetroConfig = { cacheVersion: string; resolver: { assetExts: string[] } };

const COMMIT = "f82ecab4c6a0b23c7e44c5aa0e655cf71009060a";
const EAS_COMMIT = "2222222222222222222222222222222222222222";
const VARIABLES = [
  "EXPO_PUBLIC_GIT_COMMIT",
  "EAS_BUILD_GIT_COMMIT_HASH",
  "EXPO_PUBLIC_BREEZ_API_KEY",
  "NODE_ENV",
  "APP_VARIANT",
  "APP_MANIFEST"
] as const;

// NODE_ENV is typed as Expo's three values: the test sets and restores plain strings.
const env = process.env as Record<string, string | undefined>;
const saved = Object.fromEntries(VARIABLES.map((name) => [name, env[name]]));

afterEach(() => {
  for (const name of VARIABLES) {
    if (saved[name] === undefined) delete env[name];
    else env[name] = saved[name];
  }
});

/**
 * Loads metro.config.js with these variables, `git rev-parse HEAD` answered by `git`, the Wix
 * plugin's fetch (scripts/wix-plugin.js, which reaches GitHub) by `fetchWix`.
 */
function loadMetroConfig(
  variables: Partial<Record<(typeof VARIABLES)[number], string>>,
  git: () => string = () => `${COMMIT}\n`,
  fetchWix: () => void = () => {}
) {
  for (const name of VARIABLES) delete process.env[name];
  Object.assign(process.env, { NODE_ENV: "production", ...variables });
  const execFileSync = jest.fn(git);
  const fetchWixPluginSync = jest.fn(fetchWix);
  // The public app config of app.config.ts, reduced to what differs between the variants here.
  const getConfig = jest.fn(() => ({
    exp: { extra: { appVariant: process.env.APP_VARIANT ?? "staging" } }
  }));
  let config!: MetroConfig;
  jest.isolateModules(() => {
    jest.doMock("node:child_process", () => ({ execFileSync }));
    jest.doMock("expo/config", () => ({ getConfig }));
    jest.doMock("../../scripts/wix-plugin", () => ({ fetchWixPluginSync }));
    // Expo's default config is not under test (and slow to load).
    jest.doMock("expo/metro-config", () => ({
      getDefaultConfig: () => ({ cacheVersion: "1.0", resolver: { assetExts: [] } })
    }));
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    config = require("../../metro.config") as MetroConfig;
  });
  const keys = config.cacheVersion.split("+");
  return {
    config,
    execFileSync,
    fetchWixPluginSync,
    getConfig,
    commit: process.env.EXPO_PUBLIC_GIT_COMMIT,
    configKey: keys.find((key) => key.startsWith("config:")),
    envKey: keys.find((key) => key.startsWith("env:"))
  };
}

describe("metro.config.js commit", () => {
  it("takes the HEAD of the git checkout", () => {
    const { commit, execFileSync } = loadMetroConfig({});

    expect(commit).toBe(COMMIT);
    expect(execFileSync).toHaveBeenCalledWith(
      "git",
      ["rev-parse", "HEAD"],
      expect.objectContaining({ encoding: "utf8" })
    );
  });

  it("prefers the commit passed by the staging deploy, then the one of the EAS build", () => {
    const passed = loadMetroConfig({
      EXPO_PUBLIC_GIT_COMMIT: COMMIT,
      EAS_BUILD_GIT_COMMIT_HASH: EAS_COMMIT
    });
    expect(passed.commit).toBe(COMMIT);
    expect(passed.execFileSync).not.toHaveBeenCalled();

    const easBuild = loadMetroConfig({ EAS_BUILD_GIT_COMMIT_HASH: EAS_COMMIT });
    expect(easBuild.commit).toBe(EAS_COMMIT);
    expect(easBuild.execFileSync).not.toHaveBeenCalled();
  });

  it("skips values that are not commit hashes, such as a missing workflow input", () => {
    for (const value of ["", "null", "f82ecab"]) {
      expect(
        loadMetroConfig({ EXPO_PUBLIC_GIT_COMMIT: value, EAS_BUILD_GIT_COMMIT_HASH: EAS_COMMIT })
          .commit
      ).toBe(EAS_COMMIT);
    }
  });

  it("sets no commit when git cannot give one", () => {
    const noGit = loadMetroConfig({ EXPO_PUBLIC_GIT_COMMIT: "null" }, () => {
      throw new Error("spawnSync git ENOENT");
    });
    expect(noGit.commit).toBeUndefined();
    expect(noGit.envKey).not.toBe(loadMetroConfig({}).envKey);

    expect(loadMetroConfig({}, () => "fatal: not a git repository\n").commit).toBeUndefined();
  });

  it("keys the transform cache on the EXPO_PUBLIC_* variables, except for the dev server", () => {
    const first = loadMetroConfig({ NODE_ENV: "production" });
    expect(first.envKey).toMatch(/^env:[0-9a-f]{64}$/);
    // The same variables reuse the transforms.
    expect(loadMetroConfig({}).envKey).toBe(first.envKey);
    // Inlined when a file is transformed: a cached transform would keep the previous commit, or
    // the previous Breez API key.
    expect(loadMetroConfig({}, () => `${EAS_COMMIT}\n`).envKey).not.toBe(first.envKey);
    expect(loadMetroConfig({ EXPO_PUBLIC_BREEZ_API_KEY: "key" }).envKey).not.toBe(first.envKey);
    // The dev server reads them when it serializes the bundle.
    expect(loadMetroConfig({ NODE_ENV: "development" }).envKey).toBeUndefined();
  });
});

describe("metro.config.js app config", () => {
  it("keys the transform cache on the app config inlined into web bundles", () => {
    const staging = loadMetroConfig({ APP_VARIANT: "staging" });
    const production = loadMetroConfig({ APP_VARIANT: "production" });

    expect(staging.configKey).toMatch(/^config:[0-9a-f]{64}$/);
    // A production bundle made after a staging one must not reuse its transforms.
    expect(production.configKey).not.toBe(staging.configKey);
    // The same config reuses them.
    expect(loadMetroConfig({ APP_VARIANT: "staging" }).configKey).toBe(staging.configKey);
    expect(staging.config.cacheVersion).toBe(`1.0+${staging.configKey}+${staging.envKey}`);
  });

  it("keys the dev server's cache on it too: web dev bundles inline it as well", () => {
    const staging = loadMetroConfig({ APP_VARIANT: "staging", NODE_ENV: "development" });
    const production = loadMetroConfig({ APP_VARIANT: "production", NODE_ENV: "development" });

    expect(staging.config.cacheVersion).toBe(`1.0+${staging.configKey}`);
    expect(production.configKey).not.toBe(staging.configKey);
  });

  it("reads the config as babel-preset-expo inlines it", () => {
    const { getConfig } = loadMetroConfig({});
    expect(getConfig).toHaveBeenCalledWith(expect.any(String), {
      isPublicConfig: true,
      skipSDKVersionRequirement: true
    });

    // Babel inlines APP_MANIFEST as is when it is set.
    const manifest = loadMetroConfig({ APP_MANIFEST: '{"name":"a"}' });
    expect(manifest.getConfig).not.toHaveBeenCalled();
    expect(loadMetroConfig({ APP_MANIFEST: '{"name":"b"}' }).configKey).not.toBe(
      manifest.configKey
    );
  });
});

describe("metro.config.js Wix plugin", () => {
  it("fetches the Wix plugin's files before each bundle, as text assets", () => {
    const { config, fetchWixPluginSync } = loadMetroConfig({});
    expect(fetchWixPluginSync).toHaveBeenCalledTimes(1);
    expect(config.resolver.assetExts).toContain("txt");
  });

  it("bundles nothing without them", () => {
    expect(() =>
      loadMetroConfig({}, undefined, () => {
        throw new Error("The Wix plugin's files could not be fetched (scripts/wix-plugin.js)");
      })
    ).toThrow("The Wix plugin's files could not be fetched");
  });
});
