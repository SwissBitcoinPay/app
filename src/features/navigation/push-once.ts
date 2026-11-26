import { useIsFocused } from "expo-router";
import { useEffect, useRef } from "react";

/**
 * For a screen of a stack whose taps push another screen on top of it: the returned function runs
 * a push only while the screen is the one shown, and once until it shows again. A ref: a double
 * tap must not push a second screen before the navigation re-renders (two invoice
 * wizards, the second shown empty once the first saved its draft).
 */
export function usePushOnce(): (push: () => void) => void {
  const focused = useIsFocused();
  const pushing = useRef(false);
  useEffect(() => {
    if (focused) pushing.current = false;
  }, [focused]);
  return (push) => {
    if (!focused || pushing.current) return;
    pushing.current = true;
    push();
  };
}
