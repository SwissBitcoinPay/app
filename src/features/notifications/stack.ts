import type { ReactNode } from "react";

import type { NotificationAction, NotificationTone } from "@/components/ui/Notification";

export type NotificationInput = {
  tone: NotificationTone;
  /** A short line; a component when it changes while shown (the auto-lock's countdown). */
  title: ReactNode;
  /** Announced by the apps in place of `title` when it is not plain text. */
  titleLabel?: string;
  /** One short line under the title; amounts in it go through `NotificationAmount` (mono). */
  body?: ReactNode;
  /** Read by screen readers in place of `body` when it is not plain text. */
  bodyLabel?: string;
  /** The notification leaves once its action is pressed. */
  action?: NotificationAction;
  /**
   * A notification about the same thing ("Printer disconnected" twice): a new one with the
   * key of one still shown updates it in place and restarts its timer, instead of stacking.
   */
  key?: string;
  /**
   * How long it stays, in ms (`NOTIFICATION_DURATION` by default); `null`: until it is dismissed
   * (the auto-lock's warning, until the lock).
   */
  duration?: number | null;
};

export type NotificationEntry = {
  id: number;
  notification: NotificationInput;
  /** Bumped each time a notification with the same key updates it. */
  revision: number;
  /** Playing its exit: out of the stack's layout, removed once it ends (`dropEntry`). */
  leaving: boolean;
};

/** How long a notification stays, unless its own `duration` says otherwise. */
export const NOTIFICATION_DURATION = 4000;
/** At most this many shown at once: a newer one sends the oldest out. */
export const MAX_NOTIFICATIONS = 5;
/** Between two stacked notifications, in points. */
export const NOTIFICATION_GAP = 8;

/**
 * The stack after `notification` arrives, newest first. With the key of one shown (not leaving),
 * it updates that entry in place; otherwise it comes first, and the shown entries beyond
 * `MAX_NOTIFICATIONS` start leaving: the oldest of those that leave by themselves first, those
 * that stay until dismissed (`duration: null`: the auto-lock's warning, a new version of the web
 * app) only when no other is left. Never the one arriving.
 */
export function addEntry(
  entries: readonly NotificationEntry[],
  id: number,
  notification: NotificationInput
): NotificationEntry[] {
  const key = notification.key;
  const same =
    key === undefined ? undefined : entries.find((e) => !e.leaving && e.notification.key === key);
  if (same)
    return entries.map((e) => (e === same ? { ...e, notification, revision: e.revision + 1 } : e));
  const next = [{ id, notification, revision: 0, leaving: false }, ...entries];
  const over = next.filter((e) => !e.leaving).length - MAX_NOTIFICATIONS;
  const out = new Set<number>();
  for (const staying of [false, true])
    for (let i = next.length - 1; i > 0 && out.size < over; i--) {
      const e = next[i];
      if (!e.leaving && (e.notification.duration === null) === staying) out.add(e.id);
    }
  return next.map((e) => (out.has(e.id) ? { ...e, leaving: true } : e));
}

/** `id` starts leaving (its timer ended, its action was pressed, swiped away, or dismissed). */
export function leaveEntry(entries: readonly NotificationEntry[], id: number): NotificationEntry[] {
  return entries.map((e) => (e.id === id && !e.leaving ? { ...e, leaving: true } : e));
}

/** `id` is gone, its exit played. */
export function dropEntry(entries: readonly NotificationEntry[], id: number): NotificationEntry[] {
  return entries.filter((e) => e.id !== id);
}

/**
 * The distance of each shown entry from the stack's edge (the top of the screen on mobile, the
 * bottom on desktop): the newest at 0, each older one past the newer ones and a gap. An entry not
 * measured yet takes no room. Leaving entries are left out: they stay where they were while the
 * others close the gap.
 */
export function stackOffsets(
  entries: readonly NotificationEntry[],
  heights: Readonly<Record<number, number>>
): Map<number, number> {
  const offsets = new Map<number, number>();
  let offset = 0;
  for (const e of entries) {
    if (e.leaving) continue;
    offsets.set(e.id, offset);
    const height = heights[e.id];
    if (height) offset += height + NOTIFICATION_GAP;
  }
  return offsets;
}

/** How far a finger moves before the notification follows it (a tap moves a little). */
export const SWIPE_START = 6;
/** Slid this far sideways, a notification is let go: about a fifth of a phone's. */
export const SWIPE_DISMISS_X = 80;
/** Slid this far towards its edge (up on a phone, down on desktop), a notification is let go. */
export const SWIPE_DISMISS_Y = 32;
/** Flung this fast (points per ms) the way it slides, a notification is let go however short. */
export const SWIPE_FLING = 0.5;

export type SwipeAxis = "x" | "y";

/**
 * The axis a move of (dx, dy) from where the finger went down slides the notification on, or null
 * while it is a tap still (or slides away from its edge: it has nowhere to go that way). `toEdge`:
 * -1 when the stack's edge is the top (phone), 1 the bottom (desktop).
 */
export function swipeAxis(dx: number, dy: number, toEdge: -1 | 1): SwipeAxis | null {
  if (Math.abs(dx) > SWIPE_START && Math.abs(dx) > Math.abs(dy)) return "x";
  if (Math.abs(dy) > SWIPE_START && dy * toEdge > 0) return "y";
  return null;
}

/**
 * Whether a slide on `axis` that ended at `distance` from where it began, at `velocity` (points per
 * ms, same sign as a distance), lets the notification go: far enough, or flung that way. On `y`,
 * only towards the edge (`toEdge`); on `x`, either side.
 */
export function swipeDismisses(
  axis: SwipeAxis,
  distance: number,
  velocity: number,
  toEdge: -1 | 1
): boolean {
  const way = axis === "x" ? Math.sign(distance) : toEdge;
  if (way === 0 || distance * way <= 0) return false;
  const limit = axis === "x" ? SWIPE_DISMISS_X : SWIPE_DISMISS_Y;
  return distance * way >= limit || (distance * way > SWIPE_START && velocity * way >= SWIPE_FLING);
}
