import {
  addEntry,
  dropEntry,
  leaveEntry,
  MAX_NOTIFICATIONS,
  NOTIFICATION_GAP,
  stackOffsets,
  SWIPE_DISMISS_X,
  SWIPE_DISMISS_Y,
  SWIPE_FLING,
  SWIPE_START,
  swipeAxis,
  swipeDismisses,
  type NotificationEntry,
  type NotificationInput
} from "@/features/notifications/stack";

const paid: NotificationInput = { tone: "success", title: "Payment received" };
const printer: NotificationInput = {
  tone: "info",
  title: "Printer disconnected",
  key: "printer"
};
const failed: NotificationInput = { tone: "error", title: "Payment not created" };

function stack(...notifications: NotificationInput[]): NotificationEntry[] {
  return notifications.reduce<NotificationEntry[]>((all, n, i) => addEntry(all, i + 1, n), []);
}

describe("notification stack", () => {
  it("puts the newest first", () => {
    expect(stack(paid, failed).map((e) => e.notification.title)).toEqual([
      "Payment not created",
      "Payment received"
    ]);
  });

  it("sends the oldest out beyond five", () => {
    const all = stack(paid, printer, failed, { ...paid, title: "Invoice sent" }, failed, {
      ...paid,
      title: "Six"
    });
    expect(all.filter((e) => !e.leaving)).toHaveLength(MAX_NOTIFICATIONS);
    expect(all.find((e) => e.leaving)?.notification).toBe(paid);
  });

  it("keeps those that stay until dismissed: the oldest that leaves by itself goes", () => {
    const update: NotificationInput = { tone: "info", title: "New version", duration: null };
    const lock: NotificationInput = { tone: "warning", title: "Lock", duration: null };
    const all = stack(update, paid, lock, printer, failed, { ...paid, title: "Six" });
    expect(all.filter((e) => !e.leaving)).toHaveLength(MAX_NOTIFICATIONS);
    expect(all.filter((e) => e.leaving).map((e) => e.notification)).toEqual([paid]);

    // Only those left: the oldest of them, never the one arriving.
    const staying = stack(update, lock, update, lock, update, { ...lock, title: "Six" });
    expect(staying.filter((e) => e.leaving).map((e) => e.id)).toEqual([1]);
    const arriving = addEntry(stack(update, lock, update, lock, update), 6, paid);
    expect(arriving.find((e) => e.id === 6)?.leaving).toBe(false);
    expect(arriving.filter((e) => e.leaving).map((e) => e.id)).toEqual([1]);
  });

  it("updates a notification with the same key in place", () => {
    const again = { ...printer, title: "Printer still disconnected" };
    const all = addEntry(stack(printer, paid), 3, again);
    expect(all).toHaveLength(2);
    expect(all[1]).toMatchObject({ id: 1, notification: again, revision: 1 });
  });

  it("stacks a notification whose namesake is already leaving", () => {
    const all = addEntry(leaveEntry(stack(printer), 1), 2, printer);
    expect(all.map((e) => [e.id, e.leaving])).toEqual([
      [2, false],
      [1, true]
    ]);
  });

  it("places each one past the newer ones, leaving ones taking no room", () => {
    const all = leaveEntry(stack(paid, printer, failed), 2);
    // Newest first: failed (3), printer (2, leaving), paid (1).
    const offsets = stackOffsets(all, { 1: 70, 2: 66, 3: 68 });
    expect([...offsets]).toEqual([
      [3, 0],
      [1, 68 + NOTIFICATION_GAP]
    ]);
  });

  it("drops an entry once its exit played", () => {
    expect(dropEntry(stack(paid, failed), 1).map((e) => e.id)).toEqual([2]);
  });
});

describe("swiping a notification away", () => {
  it("follows a slide sideways, or towards the stack's edge, never a tap nor away from the edge", () => {
    // Within a tap's wobble: nothing.
    expect(swipeAxis(SWIPE_START, -SWIPE_START, -1)).toBeNull();
    expect(swipeAxis(-SWIPE_START - 1, 2, -1)).toBe("x");
    expect(swipeAxis(SWIPE_START + 1, -2, 1)).toBe("x");
    // Up on a phone (edge at the top), down on desktop (edge at the bottom).
    expect(swipeAxis(2, -SWIPE_START - 1, -1)).toBe("y");
    expect(swipeAxis(2, SWIPE_START + 1, 1)).toBe("y");
    expect(swipeAxis(2, SWIPE_START + 1, -1)).toBeNull();
    expect(swipeAxis(2, -SWIPE_START - 1, 1)).toBeNull();
    // More down than sideways, away from the edge: still nothing.
    expect(swipeAxis(10, 20, -1)).toBeNull();
  });

  it("lets it go far enough, or flung, the way it slides", () => {
    for (const side of [-1, 1]) {
      expect(swipeDismisses("x", side * SWIPE_DISMISS_X, 0, -1)).toBe(true);
      expect(swipeDismisses("x", side * (SWIPE_DISMISS_X - 1), 0, -1)).toBe(false);
      expect(swipeDismisses("x", side * (SWIPE_START + 1), side * SWIPE_FLING, -1)).toBe(true);
      // Flung back the other way: it stays.
      expect(swipeDismisses("x", side * (SWIPE_DISMISS_X - 1), -side * SWIPE_FLING, -1)).toBe(
        false
      );
    }
    expect(swipeDismisses("x", 0, SWIPE_FLING, -1)).toBe(false);
    expect(swipeDismisses("x", SWIPE_START, SWIPE_FLING, -1)).toBe(false);

    expect(swipeDismisses("y", -SWIPE_DISMISS_Y, 0, -1)).toBe(true);
    expect(swipeDismisses("y", -(SWIPE_DISMISS_Y - 1), 0, -1)).toBe(false);
    expect(swipeDismisses("y", -(SWIPE_START + 1), -SWIPE_FLING, -1)).toBe(true);
    expect(swipeDismisses("y", SWIPE_DISMISS_Y, 0, 1)).toBe(true);
    // Back past where it began, away from the edge: it stays.
    expect(swipeDismisses("y", SWIPE_DISMISS_Y, SWIPE_FLING, -1)).toBe(false);
    expect(swipeDismisses("y", -SWIPE_DISMISS_Y, -SWIPE_FLING, 1)).toBe(false);
  });
});
