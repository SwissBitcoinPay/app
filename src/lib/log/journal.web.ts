import type { LogEntry } from "./entry";

/*
 * Same API as journal.ts, in the browser: the journal of this page, in memory only, gone with the
 * tab. Nothing of it is kept in the browser's storage.
 */

export const APP_LOG_DIR_NAME = "app-log";
export const MAX_LOG_ENTRIES = 2000;
export const LOG_RETENTION_MS = 30 * 24 * 60 * 60_000;

let entries: LogEntry[] = [];

export function appendLogEntry(entry: LogEntry): void {
  entries.push(entry);
  if (entries.length > MAX_LOG_ENTRIES) entries = entries.slice(-MAX_LOG_ENTRIES);
}

export function readLogEntries(): LogEntry[] {
  return [...entries];
}

export function clearLogEntries(): void {
  entries = [];
}

/** No file on the web: a mail cannot attach one there (src/features/support/mail.web.ts). */
export function writeLogExport(_name: string, _text: string): string {
  throw new Error("No file of the journal on the web");
}

export function forgetLogEntries(): void {}
