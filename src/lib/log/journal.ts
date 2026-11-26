import { utf8ToBytes } from "@noble/hashes/utils.js";
import { Directory, File, FileMode, Paths } from "expo-file-system";

import { parseLogEntry, type LogEntry } from "./entry";

/*
 * Where the app's journal is kept (log.ts): a file of the app's cache directory, a line naming its
 * format, then one entry per line (JSON Lines). The cache, not the documents: no backup of the
 * phone (iCloud, Android's Auto Backup) carries it; the system may empty it when storage runs out,
 * which a journal can afford. Same API on the web, in memory: journal.web.ts.
 *
 * Each entry is appended as it comes, through a file handle, a line break first: what was written
 * stays when the app is stopped or crashes, and a line cut short (the app stopped while writing it)
 * stays alone on its line, left out when read, the next entry on a line of its own. iOS' plain append (`File.write` with
 * `append`, expo-file-system 57.0.7) writes through an API that raises an Objective-C exception
 * when the disk is full, which no JavaScript can catch: the handle's write throws a catchable error
 * instead. Nothing is read to append (the app's start reads nothing but the first line, once): the
 * whole file is read only to give the journal (readLogEntries) or, past MAX_LOG_BYTES, to keep its
 * last entries (compaction). The last MAX_LOG_ENTRIES entries of the last LOG_RETENTION_MS are
 * given. Gone with "Log out" (clearLogEntries, device-wipe.ts).
 */

/** IRREVERSIBLE: the journal's directory in the cache directory, and its file. */
export const APP_LOG_DIR_NAME = "app-log";
const FILE_NAME = "journal.jsonl";

const FORMAT = "sattleme-app-log";
const FORMAT_VERSION = 1;
const HEADER = JSON.stringify({ log: FORMAT, version: FORMAT_VERSION });

export const MAX_LOG_ENTRIES = 2000;
export const LOG_RETENTION_MS = 30 * 24 * 60 * 60_000;
/** Past this size, the file is written again with its last entries, KEPT_LOG_BYTES at most. */
export const MAX_LOG_BYTES = 1_000_000;
const KEPT_LOG_BYTES = 500_000;
/** The first line's bytes read to know the file's format: the header is far shorter. */
const HEADER_BYTES = 128;

type FileState =
  /** Not looked at yet this session. */
  | "unknown"
  /** Ours: entries are appended to it. */
  | "ours"
  /** A newer app wrote it: never written over; this session's entries kept in memory. */
  | "newer";

let state: FileState = "unknown";
/** The entries of a session that cannot write the file (a newer app's). */
let held: LogEntry[] = [];

function appLogDirectory(): Directory {
  return new Directory(Paths.cache, APP_LOG_DIR_NAME);
}

function journalFile(): File {
  return new File(appLogDirectory(), FILE_NAME);
}

/** The file written whole, then moved over the old one: never half a file. */
function rewrite(lines: readonly string[]): void {
  const directory = appLogDirectory();
  directory.create({ intermediates: true, idempotent: true });
  const draft = new File(directory, `${FILE_NAME}.tmp`);
  draft.writeSync(HEADER + lines.map((line) => `\n${line}`).join(""));
  draft.moveSync(journalFile(), { overwrite: true });
}

/** "ours", "newer" (a newer app's: never written over), or "unreadable" (started again). */
function formatOf(line: string): "ours" | "newer" | "unreadable" {
  try {
    const value: unknown = JSON.parse(line);
    if (value === null || typeof value !== "object") return "unreadable";
    const { log, version } = value as { log?: unknown; version?: unknown };
    if (log !== FORMAT || typeof version !== "number") return "unreadable";
    if (version > FORMAT_VERSION) return "newer";
    return version === FORMAT_VERSION ? "ours" : "unreadable";
  } catch {
    return "unreadable";
  }
}

/** The format of the file's first line, from its first bytes only (ASCII: the header's). */
function formatOfFile(file: File): "ours" | "newer" | "unreadable" {
  const handle = file.open(FileMode.ReadOnly);
  let bytes: Uint8Array;
  try {
    bytes = handle.readBytesSync(HEADER_BYTES);
  } finally {
    handle.close();
  }
  let line = "";
  for (const byte of bytes) {
    if (byte === 0x0a) return formatOf(line);
    if (byte >= 0x80) return "unreadable";
    line += String.fromCharCode(byte);
  }
  // The whole file read (a header without entries), else a first line longer than any header.
  return bytes.length < HEADER_BYTES ? formatOf(line) : "unreadable";
}

/** The file's entries of the last LOG_RETENTION_MS, oldest first; their lines. */
function readFile(file: File, now: number): { entries: LogEntry[]; lines: string[] } {
  const entries: LogEntry[] = [];
  const lines: string[] = [];
  const [first, ...rest] = file.textSync().split("\n");
  if (formatOf(first ?? "") !== "ours") return { entries, lines };
  for (const line of rest) {
    if (line === "") continue;
    let entry: LogEntry | null = null;
    try {
      entry = parseLogEntry(JSON.parse(line));
    } catch {
      // A line cut short (the app stopped while writing it), or damaged.
    }
    if (entry && now - entry.at < LOG_RETENTION_MS) {
      entries.push(entry);
      lines.push(line);
    }
  }
  return { entries, lines };
}

/** Keeps the last entries: MAX_LOG_ENTRIES and KEPT_LOG_BYTES at most. */
function compact(file: File, now: number): void {
  const { lines } = readFile(file, now);
  const kept: string[] = [];
  let bytes = 0;
  for (let index = lines.length - 1; index >= 0 && kept.length < MAX_LOG_ENTRIES; index -= 1) {
    bytes += utf8ToBytes(lines[index]!).length + 1;
    if (bytes > KEPT_LOG_BYTES) break;
    kept.push(lines[index]!);
  }
  rewrite(kept.reverse());
}

/** Adds `entry` to the file at once. Throws when it could not be written: the entry is lost. */
export function appendLogEntry(entry: LogEntry): void {
  const line = JSON.stringify(entry);
  const file = journalFile();
  if (state === "unknown" && file.exists) {
    const format = formatOfFile(file);
    if (format === "newer") state = "newer";
    // Unreadable (damaged, or of no format of ours): started again below.
    else if (format === "ours") state = "ours";
  }
  if (state === "newer") {
    held = [...held, entry].slice(-MAX_LOG_ENTRIES);
    return;
  }
  if (state !== "ours" || !file.exists) {
    // The first entry (or the file removed meanwhile): the header first.
    rewrite([line]);
    state = "ours";
    return;
  }
  const handle = file.open(FileMode.Append);
  let size: number | null;
  try {
    handle.writeBytesSync(utf8ToBytes(`\n${line}`));
    size = handle.size;
  } finally {
    handle.close();
  }
  if (size !== null && size > MAX_LOG_BYTES) compact(file, entry.at);
}

/** The entries of the last LOG_RETENTION_MS, MAX_LOG_ENTRIES at most, oldest first. */
export function readLogEntries(now = Date.now()): LogEntry[] {
  if (state === "newer") return held.filter((entry) => now - entry.at < LOG_RETENTION_MS);
  const file = journalFile();
  if (!file.exists) return [];
  return readFile(file, now).entries.slice(-MAX_LOG_ENTRIES);
}

/** Removes the journal, its file and what this session keeps of it. Throws when not removed. */
export function clearLogEntries(): void {
  state = "unknown";
  held = [];
  const directory = appLogDirectory();
  if (directory.exists) directory.delete();
}

/**
 * Writes `text`, the copy of the journal a mail to support attaches (src/features/support/), as
 * `name` in the journal's directory (gone with it), over the one before: its URI. The cache
 * directory, which a mail app (expo-mail-composer's provider) and the share sheet (expo-sharing's)
 * read on Android. Throws when not written.
 */
export function writeLogExport(name: string, text: string): string {
  if (!/^[a-z0-9-]{1,64}\.json$/.test(name)) throw new Error("Not a name for the journal's copy");
  const directory = appLogDirectory();
  directory.create({ intermediates: true, idempotent: true });
  const file = new File(directory, name);
  file.writeSync(text);
  return file.uri;
}

/** Forgets what this session knows of the journal's file (tests: as when the app starts again). */
export function forgetLogEntries(): void {
  state = "unknown";
  held = [];
}
