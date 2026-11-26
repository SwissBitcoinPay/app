/**
 * The passkey asked as the app opens on a card holder's phone:
 * "Cards" shows nothing of the cards before it (LockedCards.tsx), so the system's prompt comes
 * at once, without a press. At launch only: the first time the app is in front with its account's
 * navigation (AppShell), never after a lock (the padlock, the auto-lock) nor back from the
 * background, where "Unlock" asks it. In memory: a new run of the app asks it again.
 */
let pending = true;

/** Whether the app is still at its launch, nothing asked or decided yet. */
export function launchUnlockPending(): boolean {
  return pending;
}

/** The launch is over: its passkey asked, not needed, or the app left before it could be. */
export function endLaunchUnlock(): void {
  pending = false;
}

/** The app just opened again (tests). */
export function resetLaunchUnlock(): void {
  pending = true;
}
