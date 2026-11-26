import { logFailure } from "@/lib/log/log";
import { motion } from "@/theme";

const STYLE_ID = "theme-crossfade";

/** Same API as crossfade.ts: the browser takes its capture itself, the theme never waits for it. */
export const HOLD_LIMIT_MS = 1000;

/**
 * The browser's own crossfade of the page (a view transition: `::view-transition-old(root)` fades
 * out over `::view-transition-new(root)`) in the theme's duration and easing (motion.themeCrossfade,
 * slowing down), as the apps' still fades (modules/theme-crossfade). The page's other transitions,
 * if any, keep the browser's.
 */
const CROSSFADE_CSS = `::view-transition-old(root),::view-transition-new(root){animation-duration:${motion.themeCrossfade}ms;animation-timing-function:cubic-bezier(0,0,0.2,1)}`;

/**
 * Same API as crossfade.ts. The web: the browser's view transition (every engine since
 * October 2025), which captures the page as it shows, waits for `update` (the new theme committed),
 * then crossfades the whole page, its panels included, to the new one. A browser without it
 * changes the theme at once.
 */
export async function crossfade(update: () => Promise<void>): Promise<void> {
  if (typeof document === "undefined" || !("startViewTransition" in document)) return update();
  installCrossfadeCss();
  let transition: ViewTransition;
  try {
    transition = document.startViewTransition(update);
  } catch (error) {
    logFailure("Starting the theme's crossfade failed", error);
    return update();
  }
  // Skipped (another transition, a page out of sight): the change is made all the same, without
  // its animation, whose promises then reject.
  transition.ready.catch(() => undefined);
  transition.finished.catch(() => undefined);
  await transition.updateCallbackDone.catch((error: unknown) => {
    logFailure("Changing the theme under its crossfade failed", error);
  });
}

function installCrossfadeCss(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = CROSSFADE_CSS;
  document.head.appendChild(style);
}
