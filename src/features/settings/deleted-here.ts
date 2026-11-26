/*
 * "Delete account" done on this device: the welcome screen, which
 * takes the place of "Settings" once the device is wiped, says so with a notification. Told here,
 * not by DeleteAccount.tsx: the welcome screen and the app have a NotificationsProvider each, and
 * the app's goes with its screens. In memory only.
 */

/** A deletion done on this device that no welcome screen said yet. */
let pending = false;
const listeners = new Set<() => void>();

/** The open account was deleted and this device wiped (account-deletion.ts deleteAccount). */
export function noteAccountDeleted(): void {
  pending = true;
  for (const listener of listeners) listener();
}

/**
 * Calls `show`, once, for the deletion done on this device: at once when it is done already, else
 * as soon as it is (the welcome screen may mount before DeleteAccount.tsx is told the deletion
 * ended). Returns the unsubscription.
 */
export function onAccountDeleted(show: () => void): () => void {
  const take = () => {
    if (!pending) return;
    pending = false;
    show();
  };
  take();
  listeners.add(take);
  return () => {
    listeners.delete(take);
  };
}
