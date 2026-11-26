import { useEffect, useState } from "react";

import { logFailure } from "@/lib/log/log";
import { loadMerchantSettings } from "@/lib/settings/store";

import { readAppLock, writeAppLock } from "./preference-store";

/*
 * "Ask for biometrics to unlock the app", this device's choice: the system's biometrics (or the
 * device's code) as the app opens or is brought back, on top of till mode, which does not change
 * (AppLock.tsx). The apps only: the web has no choice to make (preference-store.web.ts). A
 * business's device only: a card holder's has none, its passkey asked as the app opens. By default
 * not asked when this device's copy of the account's settings (settings/store.ts) says it was
 * opened for a business; asked when that copy cannot tell. Changed only unlocked
 * (OwnerSettings.tsx): whoever held the device in till mode could otherwise turn it off.
 */

/** The choice known, for the account it was read for. */
let known: { walletId: string; biometrics: boolean } | null = null;
const listeners = new Set<() => void>();

function sameAccount(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/**
 * This device's choice for the account `walletId` (its point of sale's): the one saved, else its
 * default (see above). Never rejects.
 */
export async function loadAppLock(walletId: string): Promise<boolean> {
  const saved = await readAppLock();
  if (saved !== null) return saved;
  try {
    const usage = (await loadMerchantSettings(walletId))?.usage ?? null;
    return usage !== "merchant";
  } catch (error) {
    logFailure("Reading the settings for the app lock failed", error);
    return true;
  }
}

/** Saves the choice, then tells every screen that follows it. Rejects when it was not saved. */
export async function saveAppLock(walletId: string, biometrics: boolean): Promise<void> {
  await writeAppLock(biometrics);
  known = { walletId, biometrics };
  for (const listener of listeners) listener();
}

/** The choice for the account `walletId`, followed; null until read, false without an account. */
export function useAppLockChoice(walletId: string | null): boolean | null {
  const [shown, setShown] = useState(() =>
    walletId !== null && known !== null && sameAccount(known.walletId, walletId) ? known : null
  );
  useEffect(() => {
    if (walletId === null) return;
    let live = true;
    const show = () => {
      if (live && known !== null && sameAccount(known.walletId, walletId)) setShown(known);
    };
    listeners.add(show);
    if (known === null || !sameAccount(known.walletId, walletId)) {
      void loadAppLock(walletId).then((biometrics) => {
        // A choice saved meanwhile stands over the one read before it.
        if (known === null || !sameAccount(known.walletId, walletId)) {
          known = { walletId, biometrics };
        }
        show();
      });
    } else {
      show();
    }
    return () => {
      live = false;
      listeners.delete(show);
    };
  }, [walletId]);
  if (walletId === null) return false;
  return shown !== null && sameAccount(shown.walletId, walletId) ? shown.biometrics : null;
}

/** Forgets the choice read (tests; "Log out" removes the saved one: device-wipe.ts). */
export function resetAppLock(): void {
  known = null;
}
