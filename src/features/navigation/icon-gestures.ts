import type { IconName } from "@/components/ui/Icon";
import { motion } from "@/theme";

/**
 * A small gesture of a destination's icon, made when its screen is chosen in the side bar.
 * Keyframes at the times `at` (0 to 1, of `duration`): the icon moved by `x` / `y` (pt),
 * turned by `rotate` (degrees), scaled by `scale`, around `origin`; a channel left out stays at
 * rest. `easing`: "gesture" eases the whole gesture in and out, the keyframes linear between them;
 * "turn" is the navigation's ease-out, for a single turn. Every gesture starts and ends at rest
 * (sidebar.test.tsx): nothing stays moved, whenever it ends or is cut.
 */
export type IconGesture = {
  duration: number;
  easing: "gesture" | "turn";
  origin: string;
  at: readonly number[];
  x?: readonly number[];
  y?: readonly number[];
  rotate?: readonly number[];
  scale?: readonly number[];
};

/** Each side bar icon's gesture. */
export const ICON_GESTURES: Partial<Record<IconName, IconGesture>> = {
  // "Charge": pressed like a key.
  calculator: {
    duration: motion.navGesture,
    easing: "gesture",
    origin: "50% 50%",
    at: [0, 0.3, 0.65, 1],
    scale: [1, 0.78, 1.08, 1]
  },
  // "Wallet": tips open.
  wallet: {
    duration: motion.navGesture,
    easing: "gesture",
    origin: "20% 80%",
    at: [0, 0.35, 0.7, 1],
    rotate: [0, -14, 5, 0],
    y: [0, -1, 0, 0]
  },
  // "Cards": swiped.
  "credit-card": {
    duration: motion.navGesture,
    easing: "gesture",
    origin: "50% 50%",
    at: [0, 0.35, 0.7, 1],
    x: [0, 5, -1.5, 0]
  },
  // "Items": the tags swing on their hole.
  tags: {
    duration: motion.navGesture,
    easing: "gesture",
    origin: "15% 15%",
    at: [0, 0.3, 0.6, 0.82, 1],
    rotate: [0, -16, 10, -4, 0]
  },
  // "Employees": the team grows.
  users: {
    duration: motion.navGesture,
    easing: "gesture",
    origin: "50% 50%",
    at: [0, 0.4, 1],
    scale: [1, 1.2, 1]
  },
  // "Integrations": plugged in.
  plug: {
    duration: motion.navGesture,
    easing: "gesture",
    origin: "50% 50%",
    at: [0, 0.35, 0.7, 1],
    y: [0, -5, 1, 0]
  },
  // "Settings": the gear turns once.
  gear: {
    duration: motion.navGestureTurn,
    easing: "turn",
    origin: "50% 50%",
    at: [0, 1],
    rotate: [0, 360]
  },
  // "My activity" (an employee's device): the history winds back.
  "clock-rotate-left": {
    duration: motion.navGestureTurn,
    easing: "turn",
    origin: "50% 50%",
    at: [0, 1],
    rotate: [0, -360]
  }
};
