import { useEffect, useState } from "react";

import { forgetLegacySession, readLegacyState, type LegacyState } from "@/lib/legacy-v2/store";

/*
 * Whether the v2 app (Swiss Bitcoin Pay) left something to migrate on this device: the launch
 * screen leads its owner, or its till, to the migration (src/app/migration/) instead of the welcome
 * screen. Read once per start of the app; forgotten once the device moved on (forgetLegacy).
 */

let read: Promise<LegacyState | null> | null = null;

/** The v2 app's state on this device (readLegacyState), read once. */
export function loadLegacyState(): Promise<LegacyState | null> {
  read ??= readLegacyState();
  return read;
}

/**
 * The device moved on from the v2 app (its account created, its till joined a team, it opens a
 * point of sale): the v2 app's session and role are forgotten, the migration shows no more. Its
 * wallet's words stay (store.ts: forgetLegacySession). Never rejects.
 */
export async function forgetLegacy(): Promise<void> {
  const known = await loadLegacyState().catch(() => null);
  read = Promise.resolve(null);
  if (known) await forgetLegacySession();
}

/** For the tests: the next read asks the keychain again. */
export function resetLegacyState(): void {
  read = null;
}

/**
 * The v2 app's state, read once `enabled` (the launch screen, once it knows the device has no point
 * of sale); undefined until known.
 */
export function useLegacyState(enabled: boolean): LegacyState | null | undefined {
  const [state, setState] = useState<LegacyState | null | undefined>(undefined);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    loadLegacyState().then(
      (value) => {
        if (active) setState(value);
      },
      () => {
        if (active) setState(null);
      }
    );
    return () => {
      active = false;
    };
  }, [enabled]);
  return state;
}
