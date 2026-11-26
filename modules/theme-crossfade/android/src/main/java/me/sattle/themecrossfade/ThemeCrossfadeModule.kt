package me.sattle.themecrossfade

import expo.modules.kotlin.Promise
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * A change of theme as a crossfade (src/features/appearance/crossfade.ts): `hold` lays a still of
 * the app's window over it, `release` fades that still out once the new theme is drawn under it
 * (Crossfade). On the main thread, where the window and its views live.
 */
class ThemeCrossfadeModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ThemeCrossfade")

    // True once the still covers the window; false when there is no window to hold (no activity,
    // not laid out yet, the copy refused): the theme then changes at once. `fadeMs`: the theme's
    // fade, that of a still never released.
    AsyncFunction("hold") { fadeMs: Double, promise: Promise ->
      val activity = appContext.currentActivity
      if (activity == null) {
        promise.resolve(false)
      } else {
        Crossfade.hold(
          activity,
          fadeMs.toLong(),
          { held -> promise.resolve(held) },
          { message -> promise.reject("ERR_THEME_CROSSFADE_HOLD", message, null) }
        )
      }
    }.runOnQueue(Queues.MAIN)

    // The new theme committed: the still fades out over `durationMs`, then goes.
    AsyncFunction("release") { durationMs: Double ->
      Crossfade.release(durationMs.toLong())
    }.runOnQueue(Queues.MAIN)
  }
}
