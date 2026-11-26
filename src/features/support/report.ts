import { Platform } from "react-native";

import { displayVersion, getAppInfo, getBuildTags } from "@/lib/app-info";
import type { LogEntry } from "@/lib/log/entry";
import type { LeftOut } from "@/lib/log/log";

/*
 * What "Contact support" sends: the journal's copy attached to the
 * mail, and the lines that end every mail, with or without it. The app's build and the device's
 * system and model: never an identifier of the device, nothing of the account.
 */

/** The copy's file name, as the mail shows it. */
export const REPORT_FILE_NAME = "sattle-me-journal.json";

export type DeviceInfo = {
  os: string;
  /** The system's version: Android's API level, iOS' "18.1". */
  version: string | null;
  /** Android only (iOS gives no model to the app). */
  manufacturer: string | null;
  model: string | null;
};

export function deviceInfo(): DeviceInfo {
  const constants = (Platform.constants ?? {}) as Record<string, unknown>;
  const text = (value: unknown) => (typeof value === "string" && value ? value : null);
  return {
    os: Platform.OS,
    version: Platform.Version === undefined ? null : String(Platform.Version),
    manufacturer: text(constants.Manufacturer),
    model: text(constants.Model)
  };
}

/** The journal's copy for support, as JSON: the app, the device, the entries oldest first. */
export function supportReport(
  log: { entries: readonly LogEntry[]; leftOut: readonly LeftOut[] },
  exportedAt: Date
): string {
  const app = getAppInfo();
  const iso = (ms: number) => new Date(ms).toISOString();
  return JSON.stringify(
    {
      report: "sattleme-app-log",
      version: 1,
      exportedAt: exportedAt.toISOString(),
      app: {
        variant: app.variant,
        version: app.version,
        buildNumber: app.buildNumber,
        commit: app.commit,
        updateId: app.updates?.updateId ?? null
      },
      device: deviceInfo(),
      entries: log.entries.map((entry) => ({ ...entry, at: iso(entry.at) })),
      leftOut: log.leftOut.map((left) => ({ ...left, lastAt: iso(left.lastAt) }))
    },
    null,
    2
  );
}

/** The lines every mail to support ends with: "sattle.me v3.0.0 · f82ecab · staging". */
export function supportSignature(): string {
  const app = getAppInfo();
  const device = deviceInfo();
  const build = [displayVersion(app.version), ...getBuildTags(app)].join(" · ");
  const system = [device.os, device.version, device.manufacturer, device.model]
    .filter((part) => part !== null)
    .join(" · ");
  return `sattle.me ${build}\n${system}`;
}
