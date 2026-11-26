import { describeError, isBuild, safeText, type LogEntry, type LogLevel } from "./entry";
import { appendLogEntry, clearLogEntries, forgetLogEntries, readLogEntries } from "./journal";

/*
 * The app's journal ("Contact support" attaches it to the mail): the failures the app handles,
 * the errors nothing caught, its starts
 * and its comings to the foreground, on this device only (journal.ts). Technical events only
 * (entry.ts): never an amount, an address, an invoice, a key nor a link. Every
 * handled failure goes through logFailure (ESLint refuses `console` elsewhere in src/). Logging
 * never throws: a journal that cannot be written loses its entry, never the app's work.
 */

/** At most LOG_BURST entries of the same event, error and code per LOG_BURST_WINDOW_MS. */
export const LOG_BURST = 5;
export const LOG_BURST_WINDOW_MS = 10 * 60_000;

type Burst = { since: number; written: number; skipped: number; lastAt: number };

/*
 * A failure that repeats (offline, a relay down, read again every few seconds) would push the rest
 * out of the journal: past LOG_BURST in a window, its entries are counted, not written. The first
 * one written after says how many were left out (`skipped`); those not written yet show in the
 * copy for support (readLog's `leftOut`). Counted in memory: an app stopped forgets them.
 */
const bursts = new Map<string, Burst>();

/** For an event text that is not plain words (entry.ts): never written as it is. */
const UNREADABLE_EVENT = "An event whose text was left out";

function record(
  level: LogLevel,
  event: string,
  error: unknown,
  { build = null, messages = true }: { build?: string | null; messages?: boolean } = {}
): void {
  try {
    const text = safeText(event, "code") ?? UNREADABLE_EVENT;
    const described = describeError(error, messages);
    const at = Date.now();
    const key = [level, text, described?.kind ?? "", described?.code ?? ""].join("\n");
    const burst = bursts.get(key);
    let skipped = 0;
    if (!burst || at - burst.since >= LOG_BURST_WINDOW_MS || at < burst.since) {
      skipped = burst?.skipped ?? 0;
      bursts.set(key, { since: at, written: 1, skipped: 0, lastAt: at });
    } else if (burst.written < LOG_BURST) {
      burst.written += 1;
      burst.lastAt = at;
    } else {
      burst.skipped += 1;
      burst.lastAt = at;
      return;
    }
    appendLogEntry({ at, level, event: text, error: described, build, skipped });
  } catch (failure) {
    if (__DEV__) console.warn("Writing the app's journal failed", failure);
  }
}

/**
 * A failure the app handled: `event` says what failed, in the code's words ("Syncing the team's
 * channels failed"), `error` what went wrong. `withMessages` false: the error's kind and code
 * only, for an error that may repeat what someone typed. In development, on the console too.
 */
export function logFailure(event: string, error?: unknown, withMessages = true): void {
  if (__DEV__) {
    if (error === undefined) console.warn(event);
    else console.warn(event, error);
  }
  record("warning", event, error, { messages: withMessages });
}

/** Something that happened ("App in the foreground"). */
export function logEvent(event: string): void {
  record("info", event, undefined);
}

/** An error nothing caught (crashes.ts). */
export function logUncaught(event: string, error: unknown): void {
  record("error", event, error);
}

/** "App started", with its build (lifecycle.ts). */
export function logStart(build: string): void {
  record("info", "App started", undefined, { build: isBuild(build) ? build : null });
}

/** What bursts left out and no entry said yet: the level, event and error, how many, until when. */
export type LeftOut = Pick<LogEntry, "level" | "event"> & {
  kind: string | null;
  code: string | null;
  count: number;
  lastAt: number;
};

/** The journal, oldest first, and what its bursts left out that no entry said yet. */
export function readLog(): { entries: LogEntry[]; leftOut: LeftOut[] } {
  const leftOut: LeftOut[] = [];
  for (const [key, burst] of bursts) {
    if (burst.skipped === 0) continue;
    const [level, event, kind, code] = key.split("\n") as [LogLevel, string, string, string];
    leftOut.push({
      level,
      event,
      kind: kind || null,
      code: code || null,
      count: burst.skipped,
      lastAt: burst.lastAt
    });
  }
  let entries: LogEntry[] = [];
  try {
    entries = readLogEntries();
  } catch (error) {
    if (__DEV__) console.warn("Reading the app's journal failed", error);
  }
  return { entries, leftOut };
}

/** Removes the journal ("Log out", device-wipe.ts). Throws when its file was not removed. */
export function clearLog(): void {
  bursts.clear();
  clearLogEntries();
}

/** Tests: as when the app starts again, the journal read again from its file, no burst going. */
export function resetLog(): void {
  bursts.clear();
  forgetLogEntries();
}
