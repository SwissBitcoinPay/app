import { act, fireEvent, render, screen, within } from "@testing-library/react-native";
import { useEffect } from "react";
import { AccessibilityInfo, StyleSheet, Text, View } from "react-native";

import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { withoutFinalPeriod } from "@/components/ui/Notification";
import { Sheet } from "@/components/ui/Sheet";

import {
  NotificationsProvider,
  useNotifications
} from "@/features/notifications/NotificationsProvider";
import {
  NOTIFICATION_DURATION,
  SWIPE_DISMISS_X,
  SWIPE_DISMISS_Y,
  type NotificationInput
} from "@/features/notifications/stack";
import { motion } from "@/theme";

let notify: (notification: NotificationInput) => number;
let dismiss: (id: number) => void;

function Probe() {
  const api = useNotifications();
  useEffect(() => {
    notify = api.notify;
    dismiss = api.dismiss;
  }, [api]);
  return <Text>Screen</Text>;
}

async function show(notification: NotificationInput) {
  await act(async () => {
    notify(notification);
  });
  await measureAll();
  await advance(motion.notificationIn + 20);
}

/** Jest has no layout: each notification waits for its height before it comes in. */
async function measureAll() {
  for (const card of screen.queryAllByTestId("notification"))
    await fireEvent(card, "layout", {
      nativeEvent: { layout: { x: 0, y: 0, width: 366, height: 68 } }
    });
}

/**
 * In steps: React renders what a timer changed (a notification leaving) only once its `act` ends,
 * and the exit starts from that render.
 */
async function advance(ms: number) {
  for (let left = ms; left > 0; left -= 50) {
    await act(async () => {
      jest.advanceTimersByTime(Math.min(50, left));
    });
  }
}

const cards = () => screen.queryAllByTestId("notification");

type Handler = (event: { nativeEvent: { pageX: number; pageY: number } }) => unknown;

/** The notification's responder handler `name`, called as React Native would, at (x, y). */
async function touch(name: string, x: number, y: number): Promise<unknown> {
  const handler = screen.getByTestId("notification").props[name] as Handler;
  let result: unknown;
  await act(async () => {
    result = handler({ nativeEvent: { pageX: x, pageY: y } });
  });
  return result;
}

/**
 * A finger down at (200, 40), sliding to (x, y) in steps of 50 ms, then held still `still` ms
 * before it lifts. Returns whether the notification took the slide.
 */
async function slide(x: number, y: number, { steps = 4, still = 0 } = {}): Promise<boolean> {
  expect(await touch("onStartShouldSetResponderCapture", 200, 40)).toBe(false);
  let taken = false;
  for (let step = 1; step <= steps; step++) {
    const at = [200 + ((x - 200) * step) / steps, 40 + ((y - 40) * step) / steps] as const;
    await advance(50);
    if (!taken) {
      taken = (await touch("onMoveShouldSetResponderCapture", ...at)) === true;
      if (taken) expect(await touch("onResponderGrant", ...at)).toBe(true);
    }
    if (taken) await touch("onResponderMove", ...at);
  }
  if (still > 0) await advance(still);
  if (taken) await touch("onResponderRelease", x, y);
  return taken;
}

describe("NotificationsProvider", () => {
  beforeEach(async () => {
    jest.useFakeTimers();
    await render(
      <NotificationsProvider>
        <Probe />
      </NotificationsProvider>
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("shows a notification over the screen, then lets it go after its duration", async () => {
    await show({ tone: "success", title: "Payment received", body: "Receipt printed." });
    expect(screen.getByText("Screen")).toBeTruthy();
    expect(screen.getByTestId("notification").props.role).toBe("status");
    expect(screen.getByText("Payment received")).toBeTruthy();

    await advance(NOTIFICATION_DURATION - motion.notificationIn - 100);
    expect(screen.getByText("Payment received")).toBeTruthy();
    await advance(100 + motion.notificationOut + 50);
    expect(screen.queryByText("Payment received")).toBeNull();
  });

  it("announces errors as alerts", async () => {
    await show({ tone: "error", title: "Payment not created", body: "Check the connection." });
    expect(screen.getByTestId("notification").props.role).toBe("alert");
  });

  it("stacks five at most: a sixth sends the oldest out", async () => {
    for (const title of ["One", "Two", "Three", "Four", "Five"])
      await show({ tone: "success", title });
    expect(cards()).toHaveLength(5);
    await show({ tone: "error", title: "Six" });
    await advance(motion.notificationOut + 50);
    expect(screen.queryByText("One")).toBeNull();
    expect(cards()).toHaveLength(5);
    expect(screen.getByText("Six")).toBeTruthy();
  });

  it("runs the action, then lets the notification go", async () => {
    const retry = jest.fn();
    await show({
      tone: "error",
      title: "Payment not created",
      action: { label: "Try again", icon: "arrow-rotate-right", onPress: retry }
    });
    // By its label: Jest keeps the animated card's first style (opacity 0), which hides it from
    // role queries.
    await fireEvent.press(screen.getByText("Try again"));
    expect(retry).toHaveBeenCalledTimes(1);
    await advance(motion.notificationOut + 50);
    expect(screen.queryByText("Payment not created")).toBeNull();
  });

  it("keeps the notification an action shows at once with the same key", async () => {
    await show({
      tone: "error",
      title: "Link not shared",
      key: "link",
      action: {
        label: "Try again",
        icon: "arrow-rotate-right",
        onPress: () => notify({ tone: "error", title: "Still not shared", key: "link" })
      }
    });
    await fireEvent.press(screen.getByText("Try again"));
    await measureAll();
    await advance(motion.notificationOut + 50);
    expect(screen.queryByText("Link not shared")).toBeNull();
    expect(screen.getByText("Still not shared")).toBeTruthy();
  });

  it("updates a notification with the same key instead of stacking, and restarts its timer", async () => {
    await show({ tone: "info", title: "Printer disconnected", key: "printer" });
    await advance(NOTIFICATION_DURATION - 1000);
    await show({ tone: "info", title: "Printer still disconnected", key: "printer" });
    expect(cards()).toHaveLength(1);
    expect(screen.getByText("Printer still disconnected")).toBeTruthy();
    await advance(2000);
    expect(screen.getByText("Printer still disconnected")).toBeTruthy();
  });

  it("keeps a notification without duration until it is dismissed", async () => {
    let id = 0;
    await act(async () => {
      id = notify({ tone: "warning", title: "Locking in 30 s", duration: null });
    });
    await measureAll();
    await advance(NOTIFICATION_DURATION * 10);
    expect(screen.getByText("Locking in 30 s")).toBeTruthy();
    // A pointer over the stack and away again starts no timer for it.
    await fireEvent(screen.getByTestId("notification"), "pointerEnter");
    await fireEvent(screen.getByTestId("notification"), "pointerLeave");
    await advance(NOTIFICATION_DURATION * 2);
    expect(screen.getByText("Locking in 30 s")).toBeTruthy();

    await act(async () => dismiss(id));
    await advance(motion.notificationOut + 50);
    expect(cards()).toHaveLength(0);
  });

  it("shows no final period, in the title nor in the body", async () => {
    await show({
      tone: "error",
      title: "The link could not be copied. Select it, then copy it.",
      body: "The withdrawal could not be published. Check your connection, then try again."
    });
    expect(screen.getByText("The link could not be copied. Select it, then copy it")).toBeTruthy();
    expect(
      screen.getByText(
        "The withdrawal could not be published. Check your connection, then try again"
      )
    ).toBeTruthy();
  });

  it("removes the final period only", () => {
    expect(withoutFinalPeriod("Alice can no longer join Bakery.")).toBe(
      "Alice can no longer join Bakery"
    );
    expect(withoutFinalPeriod("Access removed")).toBe("Access removed");
    expect(withoutFinalPeriod("Withdrawal in progress…")).toBe("Withdrawal in progress…");
    expect(withoutFinalPeriod("Withdrawal in progress...")).toBe("Withdrawal in progress...");
    expect(withoutFinalPeriod("Ready?")).toBe("Ready?");
    expect(withoutFinalPeriod("0.5 BTC received. ")).toBe("0.5 BTC received");
  });

  it("announces a title that is not plain text by its label (apps)", async () => {
    const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility");
    await show({
      tone: "warning",
      title: <Text>Locking in 30 s</Text>,
      titleLabel: "Locking in 30 s",
      body: "Without activity, the app goes back to till mode."
    });
    expect(announce).toHaveBeenLastCalledWith(
      "Locking in 30 s. Without activity, the app goes back to till mode"
    );
    announce.mockRestore();
  });

  it("holds the stack while a pointer is over it", async () => {
    await show({ tone: "success", title: "Payment received" });
    await fireEvent(screen.getByTestId("notification"), "pointerEnter");
    await advance(NOTIFICATION_DURATION * 3);
    expect(screen.getByText("Payment received")).toBeTruthy();

    await fireEvent(screen.getByTestId("notification"), "pointerLeave");
    await advance(NOTIFICATION_DURATION + motion.notificationOut + 50);
    expect(screen.queryByText("Payment received")).toBeNull();
  });

  it("lets the stack go on once the notification under the pointer leaves", async () => {
    await show({
      tone: "error",
      title: "Link not online",
      action: { label: "Try again", icon: "arrow-rotate-right", onPress: () => undefined }
    });
    // The pointer stays where it pressed: the notification leaves under it, no pointerleave comes.
    await fireEvent(screen.getByTestId("notification"), "pointerEnter");
    await fireEvent.press(screen.getByText("Try again"));
    await advance(motion.notificationOut + 50);
    expect(cards()).toHaveLength(0);

    await show({ tone: "success", title: "Link copied" });
    await advance(NOTIFICATION_DURATION + motion.notificationOut + 50);
    expect(screen.queryByText("Link copied")).toBeNull();
  });
});

describe("NotificationsProvider: swiping a notification away", () => {
  beforeEach(async () => {
    jest.useFakeTimers();
    await render(
      <NotificationsProvider>
        <Probe />
      </NotificationsProvider>
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("lets a notification slid sideways far enough go, either side, without its action", async () => {
    const retry = jest.fn();
    for (const side of [-1, 1]) {
      await show({
        tone: "error",
        title: "Account not deleted",
        action: { label: "Try again", icon: "arrow-rotate-right", onPress: retry }
      });
      // Slowly: no fling, its distance decides.
      expect(await slide(200 + side * SWIPE_DISMISS_X, 44, { steps: 20 })).toBe(true);
      await advance(motion.notificationOut + 50);
      expect(cards()).toHaveLength(0);
    }
    expect(retry).not.toHaveBeenCalled();
    expect(screen.getByText("Screen")).toBeTruthy();
  });

  it("lets it go slid towards the top of the screen (phone), not away from it", async () => {
    await show({ tone: "error", title: "Account not deleted" });
    // Down, away from the edge: not the notification's.
    expect(await slide(202, 40 + SWIPE_DISMISS_Y * 2)).toBe(false);
    await advance(motion.notificationOut + 50);
    expect(cards()).toHaveLength(1);

    expect(await slide(202, 40 - SWIPE_DISMISS_Y, { steps: 10 })).toBe(true);
    await advance(motion.notificationOut + 50);
    expect(cards()).toHaveLength(0);
  });

  it("lets a short slide flung go, not one held still before it lifts", async () => {
    await show({ tone: "success", title: "Payment received" });
    // 60 points in 100 ms, then held: its speed is past, it slides back.
    expect(await slide(260, 40, { steps: 2, still: 200 })).toBe(true);
    await advance(motion.notificationMove + 50);
    expect(cards()).toHaveLength(1);

    // The same 60 points (short of SWIPE_DISMISS_X), lifted as it moves: flung.
    expect(await slide(260, 40, { steps: 2 })).toBe(true);
    await advance(motion.notificationOut + 50);
    expect(cards()).toHaveLength(0);
  });

  it("slides back a notification let go too soon, and leaves its tap to its action", async () => {
    const retry = jest.fn();
    await show({
      tone: "error",
      title: "Payment not created",
      action: { label: "Try again", icon: "arrow-rotate-right", onPress: retry }
    });
    expect(await slide(200 + SWIPE_DISMISS_X - 10, 40, { steps: 20 })).toBe(true);
    await advance(motion.notificationMove + 50);
    expect(cards()).toHaveLength(1);

    // A tap wobbles a little: the notification does not take it.
    expect(await slide(203, 38, { steps: 1 })).toBe(false);
    await fireEvent.press(screen.getByText("Try again"));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("holds the stack while a finger slides a notification, and lets it go on after", async () => {
    await show({ tone: "success", title: "Payment received" });
    await touch("onStartShouldSetResponderCapture", 200, 40);
    expect(await touch("onMoveShouldSetResponderCapture", 230, 40)).toBe(true);
    await touch("onResponderGrant", 230, 40);
    await touch("onResponderMove", 230, 40);
    await advance(NOTIFICATION_DURATION * 2);
    expect(screen.getByText("Payment received")).toBeTruthy();

    // Interrupted (the system took the touch): it slides back and its time runs again.
    await touch("onResponderTerminate", 230, 40);
    await advance(NOTIFICATION_DURATION + motion.notificationOut + 50);
    expect(cards()).toHaveLength(0);
  });

  it("lets a notification that stays until dismissed go too, and the stack go on after", async () => {
    await act(async () => {
      notify({ tone: "info", title: "New version available", duration: null });
    });
    await measureAll();
    await advance(motion.notificationIn + 20);
    expect(await slide(200 - SWIPE_DISMISS_X, 40, { steps: 20 })).toBe(true);
    await advance(motion.notificationOut + 50);
    expect(cards()).toHaveLength(0);

    await show({ tone: "success", title: "Link copied" });
    await advance(NOTIFICATION_DURATION + motion.notificationOut + 50);
    expect(cards()).toHaveLength(0);
  });
});

describe("NotificationsProvider with panels", () => {
  function app({ sheet, dialog }: { sheet: boolean; dialog: boolean }) {
    return (
      <NotificationsProvider>
        <Probe />
        <View testID="sheet-host">
          <Sheet title="Send" closeLabel="Close" visible={sheet} onClose={() => undefined}>
            <Text>Recipient</Text>
          </Sheet>
        </View>
        <View testID="dialog-host">
          <ConfirmDialog
            visible={dialog}
            title="Remove access?"
            body="Alice can no longer take payments."
            confirmLabel="Remove access"
            cancelLabel="Back"
            onConfirm={() => undefined}
            onCancel={() => undefined}
          />
        </View>
      </NotificationsProvider>
    );
  }

  const cardsIn = (host: string) =>
    within(screen.getByTestId(host)).queryAllByTestId("notification");
  const opacityOf = (card: ReturnType<typeof cards>[number]) =>
    StyleSheet.flatten(card.props.style).opacity;

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("draws the notifications in the Modal of the panel shown last, else in the app", async () => {
    const view = await render(app({ sheet: false, dialog: false }));
    await show({ tone: "error", title: "Payment not sent", duration: null });
    expect(cardsIn("sheet-host")).toHaveLength(0);
    expect(cards()).toHaveLength(1);

    // A Modal covers whatever is drawn outside it: the stack goes into the sheet's.
    await view.rerender(app({ sheet: true, dialog: false }));
    expect(cardsIn("sheet-host")).toHaveLength(1);
    expect(cards()).toHaveLength(1);
    // Already in place: shown at once, without coming in again.
    expect(opacityOf(cards()[0])).toBe(1);

    await view.rerender(app({ sheet: true, dialog: true }));
    expect(cardsIn("dialog-host")).toHaveLength(1);
    expect(cardsIn("sheet-host")).toHaveLength(0);

    await view.rerender(app({ sheet: true, dialog: false }));
    expect(cardsIn("sheet-host")).toHaveLength(1);
    expect(cardsIn("dialog-host")).toHaveLength(0);

    await view.rerender(app({ sheet: false, dialog: false }));
    expect(cardsIn("sheet-host")).toHaveLength(0);
    expect(cards()).toHaveLength(1);
    expect(screen.getByText("Payment not sent")).toBeTruthy();
  });

  it("shows a notification that comes while a panel shows over it, and lets it go", async () => {
    await render(app({ sheet: true, dialog: false }));
    await show({ tone: "success", title: "IBAN verified" });
    expect(cardsIn("sheet-host")).toHaveLength(1);
    await advance(NOTIFICATION_DURATION + motion.notificationOut + 50);
    expect(cards()).toHaveLength(0);
  });
});
