import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { THEMES, type Theme } from "@/theme/theme";

import { crossfade } from "./crossfade";

/*
 * A change of theme crossfades: the screen as it shows fades out over the screen in the new theme
 * (motion.themeCrossfade), what does not change (the side bar, ink in both themes; a photo; the
 * orange of a button) staying as it was. The screen as it shows is a still of it (crossfade.ts: the
 * app's own module in the apps, the browser's view transition on the web), taken before the new
 * theme is drawn under it: no screen is ever seen half in one theme, half in the other, nor while
 * it draws again; the still takes the touches while it shows (what they would reach under it cannot
 * be seen). A fade, kept with Reduce Motion, as the panels'.
 *
 * The first theme drawn shows at once. One change at a time: a theme asked for while one is under
 * way (the still being taken) is the one drawn under it; asked for after, it gets a crossfade of
 * its own, from the screen as it then shows.
 */

/** The theme drawn for `target`, the theme asked for: it follows it through a crossfade. */
export function useThemeCrossfade(target: Theme): Theme {
  // A new object at each change, even back to the same theme: its commit is always seen.
  const [shown, setShown] = useState({ theme: target, change: 0 });
  // The theme asked for last, read when the new theme is drawn (the still taken meanwhile).
  const latest = useRef(target);
  useLayoutEffect(() => {
    latest.current = target;
  });
  // The change waiting for its commit, told once it is (crossfade's `update`).
  const committed = useRef<(() => void) | null>(null);
  useLayoutEffect(() => {
    committed.current?.();
    committed.current = null;
  }, [shown]);
  // Gone during a change: its crossfade ends, the still faded out (a change whose still comes
  // after then has nothing to draw, nothing to wait for).
  const mounted = useRef(false);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      committed.current?.();
      committed.current = null;
    };
  }, []);
  const changing = useRef(false);
  // Each change ended: a theme asked for meanwhile gets its own.
  const [ended, setEnded] = useState(0);

  useEffect(() => {
    if (changing.current || target.scheme === shown.theme.scheme) return;
    changing.current = true;
    void crossfade(
      () =>
        new Promise<void>((resolve) => {
          if (!mounted.current) {
            resolve();
            return;
          }
          committed.current = resolve;
          setShown(({ change }) => ({ theme: THEMES[latest.current.scheme], change: change + 1 }));
        })
    ).finally(() => {
      changing.current = false;
      setEnded((count) => count + 1);
    });
  }, [target, shown, ended]);

  return shown.theme;
}
