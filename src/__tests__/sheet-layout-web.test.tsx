import { renderHook } from "@testing-library/react-native";
import type { ComponentRef } from "react";
import type { View } from "react-native";
import { useReducedMotion } from "react-native-reanimated";

import { useSheetLayout } from "@/components/ui/sheet-layout.web";
import { motion } from "@/theme";

jest.mock("react-native-reanimated", () => ({
  __esModule: true,
  ...jest.requireActual("react-native-reanimated"),
  useReducedMotion: jest.fn(() => false)
}));

/**
 * A panel in the browser, as the hook reads it: its frame (its height at the ease's current point
 * while one runs), its layer's height, and the eases it was given (the Web Animations API).
 */
class FakePanel {
  /** Its own height, as its content lays it out. */
  height = 300;
  width = 440;
  room = 900;
  animations: FakeAnimation[] = [];
  parentElement = { getBoundingClientRect: () => ({ height: this.room }) };

  getBoundingClientRect() {
    const running = this.animations.find((animation) => animation.playState === "running");
    return { height: running ? running.shownHeight : this.height, width: this.width };
  }

  animate(keyframes: Record<string, string>[], options: { duration: number; easing: string }) {
    const animation = new FakeAnimation(keyframes, options);
    this.animations.push(animation);
    return animation;
  }
}

class FakeAnimation {
  playState: "running" | "idle" | "finished" = "running";
  currentTime: number | null = 0;
  /** The height it shows at this point. */
  shownHeight: number;
  constructor(
    readonly keyframes: Record<string, string>[],
    readonly options: { duration: number; easing: string }
  ) {
    this.shownHeight = parseFloat(keyframes[0].height);
  }
  cancel() {
    this.playState = "idle";
    this.currentTime = null;
  }
  play() {
    this.playState = "running";
    this.currentTime = 0;
  }
}

/** The hook over `panel`, drawn again (a render of the panel) by `rerender`. */
async function follow(panel: FakePanel | null) {
  const ref = { current: panel as unknown as ComponentRef<typeof View> | null };
  return renderHook(() => useSheetLayout(ref));
}

describe("a panel's height on the web (sheet-layout.web.ts)", () => {
  it("leaves its first height as it is", async () => {
    const panel = new FakePanel();
    await follow(panel);
    expect(panel.animations).toEqual([]);
  });

  it("eases a change of its height from where it was, clipped meanwhile", async () => {
    const panel = new FakePanel();
    const hook = await follow(panel);
    panel.height = 520;
    await hook.rerender({});
    expect(panel.animations).toHaveLength(1);
    const [ease] = panel.animations;
    expect(ease.keyframes).toEqual([
      { overflow: "hidden", height: "300px" },
      { overflow: "hidden", height: "520px" }
    ]);
    expect(ease.options).toEqual({
      duration: motion.sheet,
      easing: "cubic-bezier(0.32, 0.72, 0, 1)"
    });
  });

  it("does nothing when its height stays", async () => {
    const panel = new FakePanel();
    const hook = await follow(panel);
    await hook.rerender({});
    expect(panel.animations).toEqual([]);
  });

  it("goes on with an ease under way to the same height", async () => {
    const panel = new FakePanel();
    const hook = await follow(panel);
    panel.height = 520;
    await hook.rerender({});
    const [ease] = panel.animations;
    ease.shownHeight = 410;
    ease.currentTime = 120;
    // A render that changes nothing of its height (a countdown, a field typed in).
    await hook.rerender({});
    expect(panel.animations).toHaveLength(1);
    expect(ease.playState).toBe("running");
    expect(ease.currentTime).toBe(120);
  });

  it("eases to a new height from where an ease under way was", async () => {
    const panel = new FakePanel();
    const hook = await follow(panel);
    panel.height = 520;
    await hook.rerender({});
    const [first] = panel.animations;
    first.shownHeight = 410;
    panel.height = 260;
    await hook.rerender({});
    expect(first.playState).toBe("idle");
    expect(panel.animations).toHaveLength(2);
    expect(panel.animations[1].keyframes).toEqual([
      { overflow: "hidden", height: "410px" },
      { overflow: "hidden", height: "260px" }
    ]);
  });

  it("follows a change of the window at once: its width, or its room", async () => {
    const panel = new FakePanel();
    const hook = await follow(panel);
    panel.width = 360;
    panel.height = 480;
    await hook.rerender({});
    panel.room = 700;
    panel.height = 420;
    await hook.rerender({});
    expect(panel.animations).toEqual([]);
    // Then, the window still, a change of its content eases again.
    panel.height = 300;
    await hook.rerender({});
    expect(panel.animations).toHaveLength(1);
  });

  it("follows every change at once with Reduce Motion", async () => {
    jest.mocked(useReducedMotion).mockReturnValue(true);
    try {
      const panel = new FakePanel();
      const hook = await follow(panel);
      panel.height = 520;
      await hook.rerender({});
      expect(panel.animations).toEqual([]);
    } finally {
      jest.mocked(useReducedMotion).mockReturnValue(false);
    }
  });

  it("starts each opening from its own height", async () => {
    const panel = new FakePanel();
    const ref = { current: panel as unknown as ComponentRef<typeof View> | null };
    const hook = await renderHook(() => useSheetLayout(ref));
    // Closed: no panel.
    ref.current = null;
    await hook.rerender({});
    panel.height = 520;
    ref.current = panel as unknown as ComponentRef<typeof View>;
    await hook.rerender({});
    expect(panel.animations).toEqual([]);
  });
});
