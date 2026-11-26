import {
  RECOVERY_CHECK_INTERVAL,
  RECOVERY_CHECK_WINDOW,
  daysLeft,
  nextCheckStart,
  plannedReminders,
  recoveryCheckState,
  seenAboveThreshold,
  verifiedCheck
} from "@/features/recovery-check/policy";

/*
 * The yearly check of the 12 words: 30 days once due, then every
 * passkey refused; a year after a check, the next one may start.
 */

const T = 1_795_000_000;
const DAY = 86_400;

describe("the check's state", () => {
  it("is nothing while none is due", () => {
    expect(recoveryCheckState({ verifiedAt: null, dueSince: null }, T)).toEqual({ kind: "none" });
    expect(recoveryCheckState({ verifiedAt: T - DAY, dueSince: null }, T)).toEqual({
      kind: "none"
    });
  });

  it("is due for 30 days, then overdue for good", () => {
    const check = { verifiedAt: null, dueSince: T };
    expect(recoveryCheckState(check, T)).toEqual({
      kind: "due",
      dueSince: T,
      endsAt: T + RECOVERY_CHECK_WINDOW
    });
    expect(recoveryCheckState(check, T + RECOVERY_CHECK_WINDOW - 1).kind).toBe("due");
    expect(recoveryCheckState(check, T + RECOVERY_CHECK_WINDOW)).toEqual({
      kind: "overdue",
      dueSince: T,
      endedAt: T + RECOVERY_CHECK_WINDOW
    });
    expect(recoveryCheckState(check, T + 400 * DAY).kind).toBe("overdue");
  });

  it("tells the days left, the day under way counted", () => {
    const endsAt = T + RECOVERY_CHECK_WINDOW;
    expect(daysLeft(endsAt, T)).toBe(30);
    expect(daysLeft(endsAt, T + 1)).toBe(30);
    expect(daysLeft(endsAt, endsAt - DAY)).toBe(1);
    expect(daysLeft(endsAt, endsAt - 1)).toBe(1);
    // A clock past the end never says "0 days" nor less.
    expect(daysLeft(endsAt, endsAt + DAY)).toBe(1);
  });
});

describe("the account seen above the threshold", () => {
  it("starts a check when the words were never checked, the time kept", () => {
    expect(seenAboveThreshold({ verifiedAt: null, dueSince: null }, T)).toEqual({
      verifiedAt: null,
      dueSince: T,
      aboveThresholdAt: T
    });
  });

  it("starts one 12 months after the last check, its 30 days from when the account is seen", () => {
    const checked = { verifiedAt: T, dueSince: null };
    const start = T + RECOVERY_CHECK_INTERVAL;
    expect(nextCheckStart(T)).toBe(start);
    expect(seenAboveThreshold(checked, start)).toEqual({
      verifiedAt: T,
      dueSince: start,
      aboveThresholdAt: start
    });
    // Seen above the threshold later than its start: its 30 days from then, never fewer.
    const seen = seenAboveThreshold(checked, start + 10 * DAY)!;
    expect(seen.dueSince).toBe(start + 10 * DAY);
    expect(recoveryCheckState(seen, start + 10 * DAY + RECOVERY_CHECK_WINDOW - 1).kind).toBe("due");
    expect(recoveryCheckState(seen, start + 10 * DAY + RECOVERY_CHECK_WINDOW).kind).toBe("overdue");
  });

  it("gives 30 days from then when the account is seen above the threshold long after the year", () => {
    const late = T + RECOVERY_CHECK_INTERVAL + 40 * DAY;
    expect(seenAboveThreshold({ verifiedAt: T, dueSince: null }, late)?.dueSince).toBe(late);
  });

  it("never starts one again while one is due: its 30 days are not moved", () => {
    const due = { verifiedAt: null, dueSince: T, aboveThresholdAt: T };
    expect(seenAboveThreshold(due, T + 10 * DAY)).toBeNull();
    expect(seenAboveThreshold(due, T + 100 * DAY)).toBeNull();
  });

  it("keeps the first time within the year of a check, once, without starting one", () => {
    // The words checked while the account kept less ("Settings › Security"), then more.
    const checked = { verifiedAt: T, dueSince: null };
    const seen = seenAboveThreshold(checked, T + 20 * DAY);
    expect(seen).toEqual({ verifiedAt: T, dueSince: null, aboveThresholdAt: T + 20 * DAY });
    expect(recoveryCheckState(seen!, T + 20 * DAY)).toEqual({ kind: "none" });
    expect(seenAboveThreshold(seen!, T + 21 * DAY)).toBeNull();
  });

  it("keeps a new time once seen again after a check that carried the one before", () => {
    const carried = { verifiedAt: T, dueSince: null, aboveThresholdAt: T };
    expect(seenAboveThreshold(carried, T + 20 * DAY)).toEqual({
      verifiedAt: T,
      dueSince: null,
      aboveThresholdAt: T + 20 * DAY
    });
  });
});

describe("the words checked", () => {
  it("end the check due, nothing due until a year after, the time carried once", () => {
    const done = verifiedCheck(
      { verifiedAt: null, dueSince: T, aboveThresholdAt: T },
      T + 20 * DAY
    );
    expect(done).toEqual({
      verifiedAt: T + 20 * DAY,
      dueSince: null,
      aboveThresholdAt: T + 20 * DAY
    });
    expect(recoveryCheckState(done, T + 21 * DAY)).toEqual({ kind: "none" });
    // Seen above the threshold again within the year: no check starts.
    expect(seenAboveThreshold(done, T + 21 * DAY)?.dueSince).toBeNull();
  });

  it("carry nothing for an account never seen above the threshold", () => {
    expect(verifiedCheck({ verifiedAt: null, dueSince: null }, T)).toEqual({
      verifiedAt: T,
      dueSince: null
    });
  });

  it("carry a time no further than once: checked again from the invitation, under the threshold since", () => {
    const carried = { verifiedAt: T, dueSince: null, aboveThresholdAt: T };
    expect(verifiedCheck(carried, nextCheckStart(T) + DAY)).toEqual({
      verifiedAt: nextCheckStart(T) + DAY,
      dueSince: null
    });
  });
});

describe("the check's notifications", () => {
  it("are 7 days before its end, the day before and its end, once a check is due", () => {
    const end = T + RECOVERY_CHECK_WINDOW;
    expect(plannedReminders({ verifiedAt: null, dueSince: T }, T)).toEqual([
      { kind: "week", at: end - 7 * DAY },
      { kind: "eve", at: end - DAY },
      { kind: "day", at: end }
    ]);
    // Those past are left out.
    expect(plannedReminders({ verifiedAt: null, dueSince: T }, end - 3 * DAY)).toEqual([
      { kind: "eve", at: end - DAY },
      { kind: "day", at: end }
    ]);
    expect(plannedReminders({ verifiedAt: null, dueSince: T }, end)).toEqual([]);
  });

  it("invite to check the words a year after they were, the account seen above the threshold before or since", () => {
    const carried = { verifiedAt: T, dueSince: null, aboveThresholdAt: T };
    expect(plannedReminders(carried, T)).toEqual([{ kind: "start", at: nextCheckStart(T) }]);
    expect(plannedReminders(carried, nextCheckStart(T))).toEqual([]);
    const seenSince = { verifiedAt: T, dueSince: null, aboveThresholdAt: T + 30 * DAY };
    expect(plannedReminders(seenSince, T + 30 * DAY)).toEqual([
      { kind: "start", at: nextCheckStart(T) }
    ]);
  });

  it("are none for an account never seen above the threshold, nor before the words were checked", () => {
    expect(plannedReminders({ verifiedAt: T, dueSince: null }, T)).toEqual([]);
    // Seen so before the year its last check ended only.
    expect(
      plannedReminders({ verifiedAt: T, dueSince: null, aboveThresholdAt: T - DAY }, T)
    ).toEqual([]);
    expect(plannedReminders({ verifiedAt: null, dueSince: null }, T)).toEqual([]);
  });

  it("invite once only for an account seen above the threshold once, then under it for good", () => {
    // Above the threshold: a check due, the words checked.
    let check = verifiedCheck(
      seenAboveThreshold({ verifiedAt: null, dueSince: null }, T)!,
      T + DAY
    );
    const invitation = nextCheckStart(T + DAY);
    expect(plannedReminders(check, T + DAY)).toEqual([{ kind: "start", at: invitation }]);

    // Under it ever since: each year, the invitation tapped and the words checked again.
    for (let year = 0, at = invitation + DAY; year < 3; year++, at = nextCheckStart(at) + DAY) {
      check = verifiedCheck(check, at);
      expect(plannedReminders(check, at)).toEqual([]);
    }
  });
});
