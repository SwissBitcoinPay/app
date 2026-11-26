import Constants from "expo-constants";
import * as Updates from "expo-updates";
import { Platform } from "react-native";

export type UpdatesInfo = {
  channel: string | null;
  runtimeVersion: string | null;
  /** null when running the bundle embedded in the binary. */
  updateId: string | null;
};

export type AppInfo = {
  variant: string;
  version: string;
  buildNumber: string | null;
  /** Short ID (7 characters) of the commit of the JavaScript bundle; null when unknown. */
  commit: string | null;
  /** null when expo-updates is disabled (production, web). */
  updates: UpdatesInfo | null;
};

/** Set by metro.config.js when the bundle is made: an OTA update carries its own commit. */
function getCommit(): string | null {
  // Dot notation on purpose: Expo only inlines statically referenced EXPO_PUBLIC_* variables.
  const commit = process.env.EXPO_PUBLIC_GIT_COMMIT?.trim().toLowerCase();
  // A full commit hash: 40 hex digits, 64 in SHA-256 repositories.
  return commit && /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(commit) ? commit.slice(0, 7) : null;
}

/**
 * The version as the app shows it: "v3.0.0", the name of its release tag (vX.Y.Z). A placeholder
 * ("unknown", no app config) is shown as is.
 */
export function displayVersion(version: string): string {
  return /^\d/.test(version) ? `v${version}` : version;
}

/**
 * What follows the version number in the support mail's signature and in the staging chip's
 * spoken label: the commit, then "staging" in that variant only. Technical identifiers, not
 * translated.
 */
export function getBuildTags(info: Pick<AppInfo, "commit" | "variant">): string[] {
  const tags: string[] = [];
  if (info.commit) tags.push(info.commit);
  if (info.variant === "staging") tags.push("staging");
  return tags;
}

/**
 * The version chip's texts. In the staging app, the commit, where testers tell builds apart by it
 * (the release tag's name when the commit is unknown), then "staging"; otherwise the release tag's
 * name alone ("v3.0.0"). Technical identifiers, not translated.
 */
export function chipParts(info: Pick<AppInfo, "commit" | "variant" | "version">): string[] {
  const version = displayVersion(info.version);
  return info.variant === "staging" ? [info.commit ?? version, "staging"] : [version];
}

export function getAppInfo(): AppInfo {
  const config = Constants.expoConfig;
  const buildNumber = Platform.select({
    android: config?.android?.versionCode?.toString(),
    ios: config?.ios?.buildNumber
  });

  // expo-updates' web shim reports isEnabled = true (with an empty channel):
  // OTA updates only exist in native builds.
  const updatesEnabled = Platform.OS !== "web" && Updates.isEnabled;

  return {
    variant: String(config?.extra?.appVariant ?? "unknown"),
    version: config?.version ?? "unknown",
    buildNumber: buildNumber ?? null,
    commit: getCommit(),
    updates: updatesEnabled
      ? {
          channel: Updates.channel,
          runtimeVersion: Updates.runtimeVersion,
          updateId: Updates.isEmbeddedLaunch ? null : Updates.updateId
        }
      : null
  };
}
