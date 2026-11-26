import { Directory, File, Paths } from "expo-file-system";

import type { TapCheckedWith } from "./tap";
import {
  MAX_WAKES,
  MAX_WAKE_STEPS,
  parseCardWake,
  parseWakeStep,
  type CardWakeEntry,
  type WakeStep
} from "./wake-entry";

/*
 * The journal of this phone's card wakes (Android: the card socket's task,
 * src/features/card/background-wake.ts; docs/card-relay.md):
 * for each wake, when the socket received its packet, when its task started and its payment's
 * phases as they came, written at each step, so that a wake Android froze or ended shows where it
 * stopped. For the team, to measure on a real phone what the tests cannot (results handed over
 * from the app, "Copy the journal"). Never an amount, a merchant, an
 * invoice, a card nor a key: times, the payment's phases and codes (wake-entry.ts). The last
 * MAX_WAKES wakes. Same API on the web, where cards are not paid: wake-journal.web.ts.
 */

export type { CardWakeEntry, WakeStep } from "./wake-entry";
export { MAX_WAKES, MAX_WAKE_STEPS, isWakeCode } from "./wake-entry";

/** IRREVERSIBLE: the journal's directory in the documents directory, and its file. */
export const CARD_WAKES_DIR_NAME = "card-wakes";
const FILE_NAME = "journal.json";

/**
 * 3: the card socket's wakes only (Android no longer woken by a push): no `via`,
 * `sentAt` nor the push's priorities, `receivedAt` always. 2 (a push or the socket) and 1 (pushes
 * only) are no longer read: as an unreadable journal, empty.
 */
const FORMAT_VERSION = 3;

/** Thrown when a newer app wrote the journal: it is never written over. */
export class NewerCardWakesError extends Error {}

function journalFile(): File {
  return new File(new Directory(Paths.document, CARD_WAKES_DIR_NAME), FILE_NAME);
}

/**
 * The wakes, newest last. Unreadable (written whole, then moved over the old one: only a damaged
 * storage gives that): empty, an entry out of shape left out. A newer format: NewerCardWakesError.
 */
function read(): CardWakeEntry[] {
  const file = journalFile();
  if (!file.exists) return [];
  let value: unknown;
  try {
    value = JSON.parse(file.textSync());
  } catch {
    return [];
  }
  if (value === null || typeof value !== "object") return [];
  const v = value as { version?: unknown; wakes?: unknown };
  if (typeof v.version === "number" && v.version > FORMAT_VERSION) {
    throw new NewerCardWakesError("A newer app wrote the card wakes' journal");
  }
  if (v.version !== FORMAT_VERSION || !Array.isArray(v.wakes)) return [];
  return v.wakes.map(parseCardWake).filter((wake) => wake !== null);
}

function write(wakes: CardWakeEntry[]): void {
  const directory = new Directory(Paths.document, CARD_WAKES_DIR_NAME);
  directory.create({ intermediates: true, idempotent: true });
  const draft = new File(directory, `${FILE_NAME}.tmp`);
  draft.writeSync(JSON.stringify({ version: FORMAT_VERSION, wakes: wakes.slice(-MAX_WAKES) }));
  draft.moveSync(new File(directory, FILE_NAME), { overwrite: true });
}

/** One change at a time, in order: a wake's steps follow its start. */
let last: Promise<unknown> = Promise.resolve();

function inTurn<T>(change: () => T): Promise<T> {
  const run = last.then(change, change);
  last = run.catch(() => undefined);
  return run;
}

/** Changes the wake `id` (dropped when the journal no longer has it). NewerCardWakesError. */
function change(id: string, update: (wake: CardWakeEntry) => CardWakeEntry): Promise<void> {
  return inTurn(() => {
    const wakes = read();
    const index = wakes.findIndex((wake) => wake.id === id);
    if (index === -1) return;
    const changed = update(wakes[index]!);
    if (!parseCardWake(changed)) throw new Error("Not a card wake the journal could read back");
    wakes[index] = changed;
    write(wakes);
  });
}

/** The wakes, newest first. NewerCardWakesError. */
export function loadCardWakes(): Promise<CardWakeEntry[]> {
  return inTurn(() => read().reverse());
}

/** A wake's task started: its entry, without steps yet. NewerCardWakesError, nothing written. */
export function beginCardWake(
  wake: Omit<CardWakeEntry, "steps" | "tapCheck" | "endedAtMs">
): Promise<void> {
  const entry: CardWakeEntry = { ...wake, steps: [], tapCheck: null, endedAtMs: null };
  // Never an entry the journal could not read back.
  if (!parseCardWake(entry)) return Promise.reject(new Error("Not a card wake"));
  return inTurn(() => {
    const wakes = read().filter((kept) => kept.id !== entry.id);
    wakes.push(entry);
    write(wakes);
  });
}

/**
 * A step of the wake `id`. Past MAX_WAKE_STEPS, the newest step takes the last place: the steps in
 * between are lost, never how the wake ended.
 */
export function addCardWakeStep(id: string, step: WakeStep): Promise<void> {
  if (!parseWakeStep(step)) return Promise.reject(new Error("Not a card wake's step"));
  return change(id, (wake) => ({
    ...wake,
    steps: [...wake.steps.slice(0, MAX_WAKE_STEPS - 1), step]
  }));
}

/** The wake `id`'s task ended, `endedAtMs` after it started, its tap checked by `tapCheck`. */
export function endCardWake(
  id: string,
  endedAtMs: number,
  tapCheck: TapCheckedWith | null
): Promise<void> {
  return change(id, (wake) => ({ ...wake, endedAtMs, tapCheck }));
}

/** Empties the journal ("Clear the journal"). A newer app's is left as it is. */
export function clearCardWakes(): Promise<void> {
  return inTurn(() => {
    read();
    const file = journalFile();
    if (file.exists) file.delete();
  });
}
