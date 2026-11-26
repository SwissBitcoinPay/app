import { useLayoutEffect, useRef, type ComponentRef, type RefObject } from "react";
import type { View } from "react-native";
import { useReducedMotion, type LayoutAnimationFunction } from "react-native-reanimated";

import { motion } from "@/theme";

import { cssBezier, SHEET_IN } from "./easing";

/** The panel's frame as last read: its height, its width and its layer's height. */
type Frame = { height: number; width: number; room: number };

/** An ease of the panel's height under way, to the height it goes to. */
type Resize = { animation: Animation; to: number };

/**
 * On the web, a panel's height follows a change of its content smoothly too, through the Web
 * Animations API: Reanimated animates a layout change there by scaling the view (its FLIP
 * transitions, 4.7.1), which would stretch its text. sheet-layout.ts for the apps.
 *
 * After each render of the panel and before the browser paints it (a layout effect), its new
 * height is read: when it changed, its width and its layer's height not, it eases from the height
 * it showed (mid-way through an ease included) to the new one, motion.sheet long, with the sheet's
 * own deceleration, its content clipped meanwhile; at its end, the panel takes its own height again.
 * A change of the window (its width, or its height, which the panel's room follows) is followed at
 * once, and so is any change with Reduce Motion. A page changing deeper in its content renders the
 * panel (SheetPagesContext); any other change of the content that does not render it (a part's own
 * state) is followed at once: a ResizeObserver would read it after the frame is painted, or,
 * resizing the panel in its callback, end in a loop error.
 */
export function useSheetLayout(
  panel: RefObject<ComponentRef<typeof View> | null>
): LayoutAnimationFunction | undefined {
  const reduceMotion = useReducedMotion();
  const last = useRef<Frame | null>(null);
  const resize = useRef<Resize | null>(null);
  // Every render of the panel: its content may have changed.
  useLayoutEffect(() => {
    const element = panel.current as unknown as HTMLElement | null;
    if (!element || typeof element.animate !== "function") {
      // Closed: its next opening starts from its own height.
      last.current = null;
      resize.current = null;
      return;
    }
    const running = resize.current;
    const live = running !== null && running.animation.playState === "running";
    // Where its height shows now, read before the ease under way lets it go.
    const shown = live ? element.getBoundingClientRect().height : last.current?.height;
    const elapsed = live ? running.animation.currentTime : null;
    if (live) running.animation.cancel();
    resize.current = null;

    const { height, width } = element.getBoundingClientRect();
    const frame: Frame = {
      height,
      width,
      room: element.parentElement?.getBoundingClientRect().height ?? 0
    };
    const previous = last.current;
    last.current = frame;
    if (previous === null || shown === undefined || reduceMotion) return;
    if (frame.width !== previous.width || frame.room !== previous.room) return;
    if (live && frame.height === running.to) {
      // Same height to go to: the ease goes on where it was.
      running.animation.play();
      running.animation.currentTime = elapsed;
      resize.current = running;
      return;
    }
    if (Math.abs(frame.height - shown) < 0.5) return;
    const clipped = { overflow: "hidden" };
    resize.current = {
      animation: element.animate(
        [
          { ...clipped, height: `${shown}px` },
          { ...clipped, height: `${frame.height}px` }
        ],
        { duration: motion.sheet, easing: cssBezier(SHEET_IN) }
      ),
      to: frame.height
    };
  });
  return undefined;
}
