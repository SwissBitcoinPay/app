import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AppState, Text } from "react-native";

import { useNotifications } from "@/features/notifications/NotificationsProvider";
import { idleMs, reportActivity, subscribeActivity } from "@/lib/activity";

/**
 * The unlocked app goes back to till mode after this long without any activity: a device left
 * unlocked shows the business's wallet, employees and settings to
 * whoever picks it up. 5 minutes, on every device, a card holder's included. Also the app's
 * lock's longest trip (app-lock/AppLock.tsx).
 */
export const AUTO_LOCK_AFTER_MS = 5 * 60 * 1000;
/** A warning notification shows this long before (same request). */
export const AUTO_LOCK_WARNING_MS = 30 * 1000;

/**
 * Auto-lock: while `unlocked`, `lock` runs once the user did nothing for AUTO_LOCK_AFTER_MS (a
 * touch, a click, a key, the pointer, typing: src/lib/activity.ts, ActivityDetector), counted from
 * the account's opening; never while the user waits on the app (holdActivity: "Send"'s
 * passkey and payment). AUTO_LOCK_WARNING_MS before, a warning notification counts the seconds
 * down (Countdown) and stays until the end of its countdown, the lock; any activity, a touch on the
 * warning included, takes it away and starts the time again. It has no action: any touch does, and
 * a label as long as "Stay unlocked" would leave its title and body a word per line on a phone.
 */
export function useAutoLock(unlocked: boolean, lock: () => void, cardHolder = false): void {
  const { t } = useTranslation();
  useIdleLock(unlocked, lock, {
    afterMs: AUTO_LOCK_AFTER_MS,
    title: (seconds) => t("navigation.lock.autoLockTitle", { seconds }),
    // A card holder's device has no till: the app locks.
    body: t(cardHolder ? "navigation.lock.autoLockBodyCard" : "navigation.lock.autoLockBody")
  });
}

/** What an idle lock waits for, and what its warning says. */
export type IdleLockOptions = {
  /** Without any activity this long, it locks. */
  afterMs: number;
  /** The warning's title, the whole seconds left given (30 to 1). */
  title: (seconds: number) => string;
  /** The warning's body: what happens at the end of its countdown. */
  body: string;
};

/**
 * While `active`, `lock` runs once the user did nothing for `afterMs` (src/lib/activity.ts), counted
 * from when it became active; AUTO_LOCK_WARNING_MS before, the warning counts down (useAutoLock).
 * The till's auto-lock, and the rescue's own (src/features/rescue/RescueScreen.tsx). Under a
 * NotificationsProvider; the activity is noted by an ActivityDetector above the screen.
 *
 * Time is read again (idleMs) at each step, never assumed from a timer: timers run late or not at
 * all while the app is in the background (iOS suspends it, browsers slow down hidden tabs). Back to
 * the front, the time spent away counts: past the delay the app locks at once, within the warning's
 * time the warning shows the seconds actually left.
 */
export function useIdleLock(active: boolean, lock: () => void, options: IdleLockOptions): void {
  const { notify, dismiss } = useNotifications();
  // The latest `lock` and texts: the callers make new ones at each render.
  const latest = useRef({ lock, options });
  useEffect(() => {
    latest.current = { lock, options };
  });
  const { afterMs } = options;

  // Becoming active is the user's doing (opening the account, typing): the time counts from it, not
  // from the last touch before.
  useEffect(() => {
    if (active) reportActivity();
  }, [active]);

  useEffect(() => {
    if (!active) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let locked = false;
    // The warning shown, if any.
    let warning: number | null = null;
    const withdrawWarning = () => {
      if (warning !== null) dismiss(warning);
      warning = null;
    };

    const check = () => {
      clearTimeout(timer);
      if (locked) return;
      const left = afterMs - idleMs();
      if (left <= 0) {
        locked = true;
        withdrawWarning();
        latest.current.lock();
        return;
      }
      if (left > AUTO_LOCK_WARNING_MS) {
        withdrawWarning();
        timer = setTimeout(check, left - AUTO_LOCK_WARNING_MS);
        return;
      }
      if (warning === null) {
        const { title, body } = latest.current.options;
        warning = notify({
          tone: "warning",
          // The seconds left, counted down until the lock.
          title: <Countdown afterMs={afterMs} title={title} />,
          titleLabel: title(secondsOf(left)),
          body,
          key: "auto-lock",
          // Until the end of its countdown: the lock, or an activity, takes it away.
          duration: null
        });
      }
      timer = setTimeout(check, left);
    };

    // An activity while the warning shows: away with it, the lock moves on. Otherwise nothing to
    // do now: the next step reads the time of the last one.
    const unsubscribe = subscribeActivity(() => {
      if (warning !== null) check();
    });
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") check();
    });
    check();
    return () => {
      clearTimeout(timer);
      unsubscribe();
      subscription.remove();
      withdrawWarning();
    };
  }, [active, afterMs, notify, dismiss]);
}

/** Whole seconds left, as the countdown shows them: 30 to 1 (the lock comes at 0). */
function secondsOf(left: number): number {
  return Math.max(1, Math.ceil(left / 1000));
}

/**
 * The warning's title, "Locking in 30 s", counted down to 1 s, each change read from the
 * time without activity (idleMs) as the lock reads it, also back to the front. Never up: an
 * activity takes the warning away, which still shows while it fades out. On the web, the warning
 * is a live region (role `alert`): its seconds are in a region of their own, `off`, so that a
 * screen reader reads the warning when it shows, not each second after (ARIA: the nearest
 * `aria-live` decides; Chromium fires no event for a change whose region is `off`,
 * `FireLiveRegionEvents` of ax_event_generator.cc). The apps announce it once
 * (`titleLabel`): on Android, role `alert` only names the role, no live region.
 */
function Countdown({ afterMs, title }: { afterMs: number; title: (seconds: number) => string }) {
  const [seconds, setSeconds] = useState(() => secondsOf(afterMs - idleMs()));

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = () => {
      clearTimeout(timer);
      const left = afterMs - idleMs();
      setSeconds((shown) => Math.min(shown, secondsOf(left)));
      // When the whole seconds change next.
      timer = setTimeout(tick, left > 1000 ? left - (Math.ceil(left / 1000) - 1) * 1000 : 1000);
    };
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") tick();
    });
    tick();
    return () => {
      clearTimeout(timer);
      subscription.remove();
    };
  }, [afterMs]);

  return <Text aria-live="off">{title(seconds)}</Text>;
}
