import { Easing } from "react-native-reanimated";

import type { OverlayEasing } from "./overlay";

/** A cubic Bézier's control points, x1, y1, x2, y2. */
type Bezier = readonly [number, number, number, number];

/** The same curve for the browser's own animations (sheet-layout.web.ts). */
export function cssBezier([x1, y1, x2, y2]: Bezier): string {
  return `cubic-bezier(${x1}, ${y1}, ${x2}, ${y2})`;
}

/**
 * Ease-out of the navigation (its marks, panels and dock) and of the segmented control's thumb:
 * quick to answer the tap, soft to settle.
 */
export const NAV_EASING = Easing.bezier(0.2, 0.9, 0.3, 1);

/** How a bottom sheet comes in, like the iOS sheets: SHEET_EASING.in. */
export const SHEET_IN: Bezier = [0.32, 0.72, 0, 1];

/**
 * A bottom sheet (Sheet.tsx) decelerates into place like the iOS sheets, and accelerates on its
 * way out; a change of its height eases as it comes in (sheet-layout.ts, sheet-layout.web.ts).
 */
export const SHEET_EASING: OverlayEasing = {
  in: Easing.bezier(...SHEET_IN),
  out: Easing.bezier(0.3, 0, 0.8, 0.15)
};
