import type { RecoveryCheck } from "@/lib/settings/merchant";

/*
 * The yearly check of the recovery phrase:
 * once the account keeps more than RECOVERY_CHECK_THRESHOLD (its wallet and its cards, less the
 * split's share still to sell), its owner has RECOVERY_CHECK_WINDOW to type the 12 words back; past
 * it, everything that asks the passkey is refused until they do (wallet-access.ts). A check holds a
 * year: the next one starts 12 months after it, its 30 days from then, only while the account still
 * keeps more than the threshold. Pure: the times are the caller's (Unix seconds), the state the
 * account's settings'.
 */

/** 1000 CHF, in centimes: what the account must keep for a check to start. */
export const RECOVERY_CHECK_THRESHOLD_CHF_MINOR = 100_000;

const DAY = 24 * 60 * 60;

/** The owner's time to check the words once a check is due: 30 days. */
export const RECOVERY_CHECK_WINDOW = 30 * DAY;

/** How long a check holds: a year, the next one's 30 days after it. */
export const RECOVERY_CHECK_INTERVAL = 365 * DAY;

/** When the next check after one done at `verifiedAt` may start: once its year has ended. */
export function nextCheckStart(verifiedAt: number): number {
  return verifiedAt + RECOVERY_CHECK_INTERVAL;
}

/** Where the check of the words stands now. */
export type RecoveryCheckState =
  /** Nothing due: never above the threshold, or checked within the year. */
  | { kind: "none" }
  /** Due since `dueSince`, to be done before `endsAt`. */
  | { kind: "due"; dueSince: number; endsAt: number }
  /** Not done before `endedAt`: what asks the passkey is refused until it is. */
  | { kind: "overdue"; dueSince: number; endedAt: number };

export function recoveryCheckState(check: RecoveryCheck, now: number): RecoveryCheckState {
  const { dueSince } = check;
  if (dueSince === null) return { kind: "none" };
  const endsAt = dueSince + RECOVERY_CHECK_WINDOW;
  return now < endsAt
    ? { kind: "due", dueSince, endsAt }
    : { kind: "overdue", dueSince, endedAt: endsAt };
}

/** Whole days left before `endsAt`, the day under way counted: 30 on the first day, 1 on the last. */
export function daysLeft(endsAt: number, now: number): number {
  return Math.max(1, Math.ceil((endsAt - now) / DAY));
}

/**
 * Whether the account was seen keeping more than the threshold since its words were last checked
 * (or ever, never checked): not what a check carried from the year before it.
 */
function seenSinceChecked(check: RecoveryCheck): boolean {
  const at = check.aboveThresholdAt;
  return at !== undefined && (check.verifiedAt === null || at > check.verifiedAt);
}

/**
 * The check to save once the account is seen keeping more than the threshold at `now`: one starts
 * when none is due and the words were never checked, or were checked a year ago or more
 * (nextCheckStart). Its 30 days count from `now`, when the app sees the account above the
 * threshold: never fewer, whenever it is seen. The first time it is seen so since the last check,
 * `now` is kept (`aboveThresholdAt`): the invitation a year after that check comes then only. Null
 * when nothing changes (one due already, or checked within the year, seen so since already).
 */
export function seenAboveThreshold(check: RecoveryCheck, now: number): RecoveryCheck | null {
  const seen = seenSinceChecked(check);
  const marked: RecoveryCheck = seen ? check : { ...check, aboveThresholdAt: now };
  const waiting =
    check.dueSince !== null ||
    (check.verifiedAt !== null && now < nextCheckStart(check.verifiedAt));
  if (waiting) return seen ? null : marked;
  return { ...marked, dueSince: now };
}

/** A notification planned for the check (reminders.ts), at `at` (Unix seconds). */
export type RecoveryReminder = {
  kind: "start" | "week" | "eve" | "day";
  at: number;
};

/**
 * The notifications of the check still to come after `now`: once
 * a check is due, 7 days before its end, the day before and the day it ends (the payments then
 * blocked). Before, an invitation to check the words when the next check may start (12 months after
 * the last one), only for an account seen above the threshold in the year that check ended or
 * since (`aboveThresholdAt`): whether that check will start (the account still above it) is known
 * once the app sees it, which plans the others; under it, checking them is good practice only,
 * nothing blocked. Each time the account is seen above it, one invitation at most: checked again
 * after it, the words carry that time no further (verifiedCheck). None before the words were ever
 * checked: the first check starts as the app shows the account above the threshold, its banner
 * there.
 */
export function plannedReminders(check: RecoveryCheck, now: number): RecoveryReminder[] {
  let planned: RecoveryReminder[];
  if (check.dueSince !== null) {
    const end = check.dueSince + RECOVERY_CHECK_WINDOW;
    planned = [
      { kind: "week", at: end - 7 * DAY },
      { kind: "eve", at: end - DAY },
      { kind: "day", at: end }
    ];
  } else if (
    check.verifiedAt !== null &&
    check.aboveThresholdAt !== undefined &&
    check.aboveThresholdAt >= check.verifiedAt
  ) {
    planned = [{ kind: "start", at: nextCheckStart(check.verifiedAt) }];
  } else {
    planned = [];
  }
  return planned.filter((reminder) => reminder.at > now);
}

/**
 * The check once its owner typed the 12 words back right at `now`: done, nothing due. The account
 * seen above the threshold since the words were last checked (a check due, or seen so within the
 * year), that time is carried once (`aboveThresholdAt` = `now`): the invitation a year after comes.
 * Otherwise none: an invitation checked from, the account never seen above it since, brings no
 * other.
 */
export function verifiedCheck(check: RecoveryCheck, now: number): RecoveryCheck {
  return check.dueSince !== null || seenSinceChecked(check)
    ? { verifiedAt: now, dueSince: null, aboveThresholdAt: now }
    : { verifiedAt: now, dueSince: null };
}
