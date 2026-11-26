import { fireEvent, render, screen } from "@testing-library/react-native";

import { TextField } from "@/components/ui/TextField";
import { ActivityDetector as WebActivityDetector } from "@/features/navigation/ActivityDetector.web";
import { holdActivity, idleMs, reportActivity, subscribeActivity } from "@/lib/activity";

/** The device's clock moves by `ms`, its timers and its monotonic clock do not. */
function setWallClock(ms: number) {
  jest.setSystemTime(Date.now() + ms);
}

describe("activity", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("counts the time since the last activity on the longer of its two clocks", () => {
    reportActivity();
    jest.advanceTimersByTime(1000);
    expect(idleMs()).toBe(1000);
    // The wall clock ahead (the device asleep, its monotonic clock stopped): it counts.
    setWallClock(60_000);
    expect(idleMs()).toBe(61_000);
    // Set back: the monotonic clock counts, never a negative time.
    setWallClock(-120_000);
    expect(idleMs()).toBe(1000);
    reportActivity();
    expect(idleMs()).toBe(0);
  });

  it("counts no time while held, and its release as an activity", () => {
    const listener = jest.fn();
    const unsubscribe = subscribeActivity(listener);
    reportActivity();
    jest.advanceTimersByTime(5000);
    const release = holdActivity();
    expect(listener).toHaveBeenCalledTimes(2);
    // A passkey's prompt open for minutes, the device asleep meanwhile: no time counts.
    jest.advanceTimersByTime(10 * 60 * 1000);
    setWallClock(60_000);
    expect(idleMs()).toBe(0);
    release();
    expect(listener).toHaveBeenCalledTimes(3);
    jest.advanceTimersByTime(1000);
    expect(idleMs()).toBe(1000);
    // Released once only: a second call changes nothing.
    release();
    expect(listener).toHaveBeenCalledTimes(3);
    expect(idleMs()).toBe(1000);
    unsubscribe();
  });

  it("tells its listeners until they leave", () => {
    const listener = jest.fn();
    const unsubscribe = subscribeActivity(listener);
    reportActivity();
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    reportActivity();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("counts typing in a field, which touches nothing of the app", async () => {
    const changed = jest.fn();
    const listener = jest.fn();
    const unsubscribe = subscribeActivity(listener);
    await render(<TextField label="First name" value="" onChangeText={changed} testID="field" />);
    await fireEvent.changeText(screen.getByTestId("field"), "J");
    expect(changed).toHaveBeenCalledWith("J");
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  describe("on the web", () => {
    const realDocument = (globalThis as { document?: unknown }).document;
    // The page's document: only its events matter here.
    let page: EventTarget;

    beforeEach(() => {
      page = new EventTarget();
      (globalThis as { document?: unknown }).document = page;
    });

    afterEach(() => {
      (globalThis as { document?: unknown }).document = realDocument;
    });

    const pointer = (type: string, screenX: number, screenY: number) =>
      Object.assign(new Event(type), { screenX, screenY });

    it("counts presses, clicks, keys, the wheel and the pointer moving, on the whole page", async () => {
      const listener = jest.fn();
      const unsubscribe = subscribeActivity(listener);
      const { unmount } = await render(<WebActivityDetector>{null}</WebActivityDetector>);

      page.dispatchEvent(pointer("pointerdown", 10, 20));
      page.dispatchEvent(new Event("keydown"));
      page.dispatchEvent(new Event("wheel"));
      // A screen reader's activation: a click alone.
      page.dispatchEvent(new Event("click"));
      expect(listener).toHaveBeenCalledTimes(4);
      // The pointer where the press left it: the page changed under it, not the user's doing.
      page.dispatchEvent(pointer("pointermove", 10, 20));
      expect(listener).toHaveBeenCalledTimes(4);
      page.dispatchEvent(pointer("pointermove", 11, 20));
      expect(listener).toHaveBeenCalledTimes(5);

      await unmount();
      page.dispatchEvent(new Event("keydown"));
      page.dispatchEvent(new Event("click"));
      page.dispatchEvent(pointer("pointerdown", 30, 20));
      expect(listener).toHaveBeenCalledTimes(5);
      unsubscribe();
    });
  });
});
