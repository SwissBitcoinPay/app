import { engineRuntimeHost } from "@/lib/engine/host";

import type { LogEntry } from "./entry";

/*
 * Same API as journal.ts, in the iOS extension's engine (src/lib/engine/): each entry goes to the
 * extension's journal, which the host writes (EngineRuntimeHost.log), never to the app's, whose
 * only writer is the app. Nothing is read back here.
 */

export const APP_LOG_DIR_NAME = "app-log";
export const MAX_LOG_ENTRIES = 2000;
export const LOG_RETENTION_MS = 30 * 24 * 60 * 60_000;

export function appendLogEntry(entry: LogEntry): void {
  engineRuntimeHost().log(entry.level === "warning" ? "warn" : entry.level, JSON.stringify(entry));
}

export function readLogEntries(): LogEntry[] {
  return [];
}

export function clearLogEntries(): void {}

/** No copy of the journal from the extension: the app sends its own (src/features/support/). */
export function writeLogExport(_name: string, _text: string): string {
  throw new Error("No copy of the journal in the extension");
}

export function forgetLogEntries(): void {}
