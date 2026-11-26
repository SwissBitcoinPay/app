/**
 * The user's last activity on this device: a touch, a key, the pointer moving, a field typed in
 * (ActivityDetector, TextField). The unlocked app goes back to till mode after a while without any
 * (src/features/navigation/auto-lock.tsx). In memory only.
 *
 * The time since is read on two clocks, and the longer counts: the wall clock (`Date`) runs while
 * the device sleeps, where the monotonic one (`performance.now()`, a steady clock in React Native)
 * may stand still; the monotonic one keeps running when the wall clock is set back (by hand, or by
 * the network's time), where the wall clock would count less time, or none.
 *
 * While the user waits on the app without touching it (holdActivity: a payment's passkey prompt,
 * the payment being sent), no time counts.
 */

type Instant = { wall: number; monotonic: number };

function now(): Instant {
  return { wall: Date.now(), monotonic: performance.now() };
}

let last: Instant = now();
/** Holds not released yet (holdActivity). */
let holds = 0;

const listeners = new Set<() => void>();

/** Notes an activity now, and tells the listeners (subscribeActivity). */
export function reportActivity(): void {
  last = now();
  for (const listener of listeners) listener();
}

/**
 * The user waits on the app (a system prompt it opened, a payment it sends): until the returned
 * release, no time without activity counts. The hold and its release are activities.
 */
export function holdActivity(): () => void {
  holds += 1;
  reportActivity();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holds -= 1;
    reportActivity();
  };
}

/**
 * Milliseconds since the last activity: the longer of the two clocks' counts, never negative; 0
 * while held (holdActivity).
 */
export function idleMs(): number {
  if (holds > 0) return 0;
  const at = now();
  return Math.max(0, at.wall - last.wall, at.monotonic - last.monotonic);
}

/** Calls `listener` at each activity; returns the unsubscribe function. */
export function subscribeActivity(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
