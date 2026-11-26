import { useEffect, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import { reportActivity } from "@/lib/activity";

/**
 * Web: notes the user's activity on the page (src/lib/activity.ts), for the auto-lock
 * (auto-lock.tsx): a press (mouse, finger or pen), a key, the wheel, the pointer moving, and a click,
 * which a screen reader's activation sends alone. Listened to on the document, in the capture phase:
 * nothing on the page can hide them, the dialogs (portals at the end of the body) included, and
 * nothing is taken from them (passive listeners).
 */
export function ActivityDetector({ children }: { children: ReactNode }) {
  useEffect(() => watchDocument(), []);
  return <View style={styles.root}>{children}</View>;
}

const PASSIVE_CAPTURE = { capture: true, passive: true } as const;

/** Each of these is the user's doing. */
const ACTIVITY_EVENTS = ["keydown", "wheel", "click"] as const;

function watchDocument(): () => void {
  // Where the pointer was last seen: a `pointermove` that did not move it (one a browser may send
  // when the page changes under a pointer at rest, as when a notification appears there) is not
  // the user's doing.
  let x: number | null = null;
  let y: number | null = null;
  const seen = (event: PointerEvent): boolean => {
    const moved = event.screenX !== x || event.screenY !== y;
    x = event.screenX;
    y = event.screenY;
    return moved;
  };
  const pressed = (event: PointerEvent) => {
    seen(event);
    reportActivity();
  };
  const moved = (event: PointerEvent) => {
    if (seen(event)) reportActivity();
  };

  document.addEventListener("pointerdown", pressed, PASSIVE_CAPTURE);
  document.addEventListener("pointermove", moved, PASSIVE_CAPTURE);
  for (const type of ACTIVITY_EVENTS)
    document.addEventListener(type, reportActivity, PASSIVE_CAPTURE);
  return () => {
    document.removeEventListener("pointerdown", pressed, PASSIVE_CAPTURE);
    document.removeEventListener("pointermove", moved, PASSIVE_CAPTURE);
    for (const type of ACTIVITY_EVENTS)
      document.removeEventListener(type, reportActivity, PASSIVE_CAPTURE);
  };
}

const styles = StyleSheet.create({
  root: { flex: 1 }
});
