import { useEffect, useSyncExternalStore } from "react";

import { logFailure } from "@/lib/log/log";

import { loadSeen, saveSeen } from "./seen-store";

/*
 * The release notes last opened on this device, shared by every label that opens them (the side
 * bar's, the version chips'): opened from one, every dot goes. `undefined` until read from the
 * store, so that no dot shows for a moment before it is known; null when none was ever opened.
 */

let seen: string | null | undefined = undefined;
let reading: Promise<void> | null = null;
const listeners = new Set<() => void>();

/** The saves, one after the other: the last key opened stays stored. */
let saving: Promise<void> = Promise.resolve();

function set(value: string | null | undefined): void {
  seen = value;
  for (const listener of listeners) listener();
}

/** Reads the store once. A failed read counts as nothing opened: a dot rather than none. */
function read(): void {
  if (reading) return;
  reading = loadSeen()
    .catch((error: unknown) => {
      logFailure("Reading the release notes seen failed", error);
      return null;
    })
    .then((stored) => {
      // Opened before the read finished: that key stays.
      if (seen === undefined) set(stored);
    });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The key of the notes last opened (null: none; undefined: not read yet). */
export function useSeenReleaseNotes(): string | null | undefined {
  const value = useSyncExternalStore(subscribe, () => seen);
  useEffect(read, []);
  return value;
}

/** The notes of `key` opened: remembered on this device. A failed save is logged. */
export function markReleaseNotesSeen(key: string): void {
  if (seen === key) return;
  set(key);
  saving = saving
    .then(() => saveSeen(key))
    .catch((error: unknown) => {
      logFailure("Saving the release notes seen failed", error);
    });
}

/** As at the app's launch: read again from the store at the next use (tests, between them). */
export function resetSeenReleaseNotesCache(): void {
  reading = null;
  saving = Promise.resolve();
  set(undefined);
}
