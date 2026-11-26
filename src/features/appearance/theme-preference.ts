import { useSyncExternalStore } from "react";

import { overrideScheme } from "./scheme-override";
import { DEFAULT_THEME_PREFERENCE, type ThemePreference } from "./theme-format";
import { readThemePreference, writeThemePreference } from "./theme-store";

/*
 * "Theme" in "Settings › Display": "Light", "Dark" or "Automatic", the device's own theme, by
 * default. This device's choice, as "Currency shown first": each device of the business picks its
 * own, nothing goes to the account. The payer's page of a payment link switches it too
 * (src/app/pay.tsx), in the payer's browser. Read before the first screen shows (the root layout
 * waits for it, under the splash screen): no screen is drawn in a theme it then leaves.
 */

/** This device's choice; null until read. */
let preference: ThemePreference | null = null;
/** Each read, and each reset, counts: a read started before a reset never applies after it. */
let generation = 0;
let reading = false;
const listeners = new Set<() => void>();

/** The apps' own parts follow the choice first (scheme-override.ts), then the screens hear of it. */
function tell(): void {
  overrideScheme(preference);
  for (const listener of listeners) listener();
}

function startRead(): void {
  if (reading) return;
  reading = true;
  const started = generation;
  void readThemePreference().then((saved) => {
    if (started !== generation) return;
    reading = false;
    // A choice saved meanwhile stands over the one read before it.
    if (preference === null) {
      preference = saved ?? DEFAULT_THEME_PREFERENCE;
      tell();
    }
  });
}

/** Calls `listener` at each change of the choice; the first follower reads it. Returns how to stop. */
export function followThemePreference(listener: () => void): () => void {
  listeners.add(listener);
  if (preference === null) startRead();
  return () => {
    listeners.delete(listener);
  };
}

/** This device's choice; null until read. */
export function themePreferenceChoice(): ThemePreference | null {
  return preference;
}

/**
 * Saves this device's choice, then tells the screens, which take its theme at once. Rejects when
 * it was not saved: nothing changes.
 */
export async function saveThemePreference(next: ThemePreference): Promise<void> {
  await writeThemePreference(next);
  preference = next;
  tell();
}

/**
 * Forgets the choice read ("Log out", device-wipe.ts, once its key is removed): read again, the
 * default then.
 */
export function resetThemePreference(): void {
  generation += 1;
  reading = false;
  preference = null;
  if (listeners.size > 0) startRead();
  tell();
}

/** The choice followed: null until read. */
export function useThemePreferenceChoice(): ThemePreference | null {
  return useSyncExternalStore(followThemePreference, themePreferenceChoice);
}
