import type * as AppInfoModule from "../lib/app-info";
import { chipParts, displayVersion, getBuildTags } from "../lib/app-info";

type UpdatesMock = {
  isEnabled: boolean;
  channel: string | null;
  runtimeVersion: string | null;
  updateId: string | null;
  isEmbeddedLaunch: boolean;
};

// What the staging app.config.ts embeds in the binary (read through expo-constants).
const stagingConfig = {
  version: "3.0.0",
  ios: { buildNumber: "3000000" },
  android: { versionCode: 3_000_000 },
  extra: { appVariant: "staging" }
};

const downloadedUpdate: UpdatesMock = {
  isEnabled: true,
  channel: "staging",
  runtimeVersion: "runtime-1",
  updateId: "update-1",
  isEmbeddedLaunch: false
};

function loadGetAppInfo(
  updates: UpdatesMock,
  { os, expoConfig = stagingConfig }: { os?: "web"; expoConfig?: object | null } = {}
) {
  // Fresh module graph, so that app-info and the Platform patched below share one
  // react-native instance, and expo-updates / expo-constants resolve to these mocks.
  jest.resetModules();
  jest.doMock("expo-updates", () => updates);
  jest.doMock("expo-constants", () => ({ __esModule: true, default: { expoConfig } }));
  if (os !== undefined) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Platform } = require("react-native") as typeof import("react-native");
    jest.replaceProperty(Platform, "OS", os);
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return (require("../lib/app-info") as typeof AppInfoModule).getAppInfo;
}

describe("getAppInfo", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("reads the variant, version and build number from the app config", () => {
    const info = loadGetAppInfo(downloadedUpdate)();

    expect(info.variant).toBe("staging");
    expect(info.version).toBe("3.0.0");
    // jest-expo runs as iOS: the build number is ios.buildNumber.
    expect(info.buildNumber).toBe("3000000");
  });

  it("falls back to explicit placeholders when the app config is missing", () => {
    const info = loadGetAppInfo(downloadedUpdate, { expoConfig: null })();

    expect(info.variant).toBe("unknown");
    expect(info.version).toBe("unknown");
    expect(info.buildNumber).toBeNull();
  });

  it("reports the downloaded OTA update that is running", () => {
    expect(loadGetAppInfo(downloadedUpdate)().updates).toEqual({
      channel: "staging",
      runtimeVersion: "runtime-1",
      updateId: "update-1"
    });
  });

  it("reports no update id when the bundle embedded in the binary is running", () => {
    const info = loadGetAppInfo({ ...downloadedUpdate, isEmbeddedLaunch: true })();

    expect(info.updates).toEqual({
      channel: "staging",
      runtimeVersion: "runtime-1",
      updateId: null
    });
  });

  it("reports updates as disabled when expo-updates is off (production)", () => {
    expect(loadGetAppInfo({ ...downloadedUpdate, isEnabled: false })().updates).toBeNull();
  });

  it("ignores the expo-updates web shim, which claims to be enabled", () => {
    expect(loadGetAppInfo(downloadedUpdate, { os: "web" })().updates).toBeNull();
  });
});

describe("commit", () => {
  const commit = process.env.EXPO_PUBLIC_GIT_COMMIT;

  afterEach(() => {
    if (commit === undefined) delete process.env.EXPO_PUBLIC_GIT_COMMIT;
    else process.env.EXPO_PUBLIC_GIT_COMMIT = commit;
  });

  it("shows the first 7 characters of the commit set by metro.config.js", () => {
    process.env.EXPO_PUBLIC_GIT_COMMIT = "f82ecab4c6a0b23c7e44c5aa0e655cf71009060a";

    expect(loadGetAppInfo(downloadedUpdate)().commit).toBe("f82ecab");
  });

  it("accepts SHA-256 commit hashes and upper case", () => {
    process.env.EXPO_PUBLIC_GIT_COMMIT =
      "  F82ECAB4C6A0B23C7E44C5AA0E655CF71009060AF82ECAB4C6A0B23C7E44C5AA ";

    expect(loadGetAppInfo(downloadedUpdate)().commit).toBe("f82ecab");
  });

  it("reports no commit when none is known", () => {
    delete process.env.EXPO_PUBLIC_GIT_COMMIT;
    expect(loadGetAppInfo(downloadedUpdate)().commit).toBeNull();

    process.env.EXPO_PUBLIC_GIT_COMMIT = "";
    expect(loadGetAppInfo(downloadedUpdate)().commit).toBeNull();
  });

  it("reports no commit for a value that is not a full commit hash", () => {
    for (const value of ["f82ecab", "null", "g82ecab4c6a0b23c7e44c5aa0e655cf71009060a"]) {
      process.env.EXPO_PUBLIC_GIT_COMMIT = value;
      expect(loadGetAppInfo(downloadedUpdate)().commit).toBeNull();
    }
  });
});

describe("getBuildTags", () => {
  it("follows the version with the commit, then staging, in the staging app", () => {
    expect(getBuildTags({ commit: "f82ecab", variant: "staging" })).toEqual(["f82ecab", "staging"]);
  });

  it("shows no variant in production", () => {
    expect(getBuildTags({ commit: "f82ecab", variant: "production" })).toEqual(["f82ecab"]);
    expect(getBuildTags({ commit: null, variant: "production" })).toEqual([]);
  });

  it("leaves out an unknown commit", () => {
    expect(getBuildTags({ commit: null, variant: "staging" })).toEqual(["staging"]);
  });

  it("shows staging only for the staging variant", () => {
    expect(getBuildTags({ commit: null, variant: "unknown" })).toEqual([]);
  });
});

describe("chipParts", () => {
  it("is the commit, then staging, in the staging app", () => {
    expect(chipParts({ commit: "f82ecab", variant: "staging", version: "3.0.0" })).toEqual([
      "f82ecab",
      "staging"
    ]);
  });

  it("is the release tag's name alone in production", () => {
    expect(chipParts({ commit: "f82ecab", variant: "production", version: "3.0.0" })).toEqual([
      "v3.0.0"
    ]);
    expect(chipParts({ commit: null, variant: "production", version: "3.0.0" })).toEqual([
      "v3.0.0"
    ]);
  });

  it("is the version, then staging, in staging when the commit is unknown", () => {
    expect(chipParts({ commit: null, variant: "staging", version: "3.0.0" })).toEqual([
      "v3.0.0",
      "staging"
    ]);
  });

  it("is the version alone for any variant other than staging", () => {
    expect(chipParts({ commit: "f82ecab", variant: "unknown", version: "unknown" })).toEqual([
      "unknown"
    ]);
  });
});

describe("displayVersion", () => {
  it("names the version as its release tag", () => {
    expect(displayVersion("3.0.0")).toBe("v3.0.0");
  });

  it("shows a placeholder as is", () => {
    expect(displayVersion("unknown")).toBe("unknown");
  });
});
