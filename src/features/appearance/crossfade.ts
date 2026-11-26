import { requireOptionalNativeModule } from "expo";

import { logFailure } from "@/lib/log/log";
import { motion } from "@/theme";

type ThemeCrossfadeModule = {
  /**
   * A still of the window laid over it; false when there was none to take. `fadeMs`: its fade
   * should its `release` never come (the native module lets it out on its own).
   */
  hold(fadeMs: number): Promise<boolean>;
  /** The still fades out over `durationMs`, once the new theme is drawn under it, then goes. */
  release(durationMs: number): Promise<void>;
};

// The app's own native module (modules/theme-crossfade): absent from a binary built before it,
// where the theme changes at once, as before.
const native = requireOptionalNativeModule<ThemeCrossfadeModule>("ThemeCrossfade");

/**
 * The longest the theme waits for its still (ms): a main thread too busy to take it, the theme
 * changes at once all the same.
 */
export const HOLD_LIMIT_MS = 1000;

/**
 * A change of theme as a crossfade (theme-crossfade.ts), in the apps: a still of the window, as it
 * shows, is laid over it (`hold`), `update` draws the new theme under it and resolves once that is
 * committed, then the still fades out (`release`, motion.themeCrossfade). What does not change
 * stays as it was. Without its still (none taken, an older binary), the theme changes at once.
 * Same API on the web: crossfade.web.ts.
 */
export async function crossfade(update: () => Promise<void>): Promise<void> {
  if (native) await hold(native);
  try {
    await update();
  } finally {
    // Even without a still: a still on its way would come after the change, and is dropped then.
    native?.release(motion.themeCrossfade).catch((error: unknown) => {
      logFailure("Releasing the theme's crossfade failed", error);
    });
  }
}

/** The still taken, or not; never longer than HOLD_LIMIT_MS, never rejects. */
function hold(module: ThemeCrossfadeModule): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), HOLD_LIMIT_MS);
    const failed = (error: unknown) => {
      logFailure("Holding the screen for the theme's crossfade failed", error);
      resolve(false);
    };
    try {
      module
        .hold(motion.themeCrossfade)
        .then((held) => resolve(held === true), failed)
        .finally(() => clearTimeout(timer));
    } catch (error) {
      clearTimeout(timer);
      failed(error);
    }
  });
}
