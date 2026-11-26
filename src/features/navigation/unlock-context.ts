import { createContext, useContext } from "react";

import type { Destination } from "./destinations";

/**
 * The shell's passkey prompt, for a screen that opens in till mode ("Settings", reduced:
 * LockedSettings.tsx): the same prompt as the navigation's (AppShell's `unlock`), one at a
 * time, `destination` shown once it opened the account (null: the screen shown stays).
 */
export type ShellUnlock = {
  unlock: (destination: Destination | null) => void;
  unlocking: boolean;
  /** Web: the SDK is still loading, the prompt waits for it. */
  preparing: boolean;
};

export const ShellUnlockContext = createContext<ShellUnlock | null>(null);

/** The shell's prompt; null outside an owner's shell (an employee's device has none). */
export function useShellUnlock(): ShellUnlock | null {
  return useContext(ShellUnlockContext);
}
