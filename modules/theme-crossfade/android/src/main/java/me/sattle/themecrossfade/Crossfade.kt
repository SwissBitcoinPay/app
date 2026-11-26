package me.sattle.themecrossfade

import android.app.Activity
import android.graphics.Bitmap
import android.graphics.drawable.BitmapDrawable
import android.os.Handler
import android.os.Looper
import android.view.Choreographer
import android.view.PixelCopy
import android.view.View
import android.view.ViewGroup
import android.view.Window
import android.view.animation.DecelerateInterpolator
import android.widget.ImageView
import com.facebook.react.views.modal.ReactModalHostView

/**
 * The stills of a theme's crossfade, on the main thread only. `hold` copies the pixels of each of
 * the app's windows as they show (PixelCopy: the views, their hardware layers, a still already
 * fading included): the activity's, and that of each panel shown, a React Native Modal being a
 * window of its own (a Dialog) over it. Each copy is laid last in its window's decor view, over
 * everything in it, and takes the touches meanwhile: they would reach what cannot be seen. All the
 * windows or none: a copy that fails leaves the theme to change at once, never half the screen in
 * one theme. `release` waits for the new theme's views to be mounted (FRAMES_BEFORE_FADE), then fades
 * the stills out and removes them.
 *
 * Never left over the app: without its `release` (the JavaScript gone, a change that never
 * committed), the stills fade out on their own after HOLD_LIMIT_MS.
 */
internal object Crossfade {
  /** Fabric mounts a commit in a frame callback: two frames on, the new views are drawn. */
  private const val FRAMES_BEFORE_FADE = 2

  /** The longest the stills cover the windows without their `release`. */
  private const val HOLD_LIMIT_MS = 1500L

  private val main = Handler(Looper.getMainLooper())

  /** The stills over the windows, if any. */
  private var stills: List<ImageView> = emptyList()

  /** Each hold and each release counts: copies that come back after a newer one are dropped. */
  private var generation = 0

  /** A window's copy under way. */
  private class Copy(val window: Window, val decor: ViewGroup, val bitmap: Bitmap)

  /**
   * `fadeMs`: the theme's fade (motion.themeCrossfade), that of stills released by HOLD_LIMIT_MS.
   * `failed`: the copies could not be made (no memory for them), told to the app's journal.
   */
  fun hold(activity: Activity, fadeMs: Long, done: (Boolean) -> Unit, failed: (String) -> Unit) {
    val windows = appWindows(activity)
    val decors = windows.map { it.decorView as? ViewGroup }
    if (windows.isEmpty() || decors.any { it == null || !shown(it) }) {
      done(false)
      return
    }
    val copies = mutableListOf<Copy>()
    for ((window, decor) in windows.zip(decors.filterNotNull())) {
      val bitmap = try {
        Bitmap.createBitmap(decor.width, decor.height, Bitmap.Config.ARGB_8888)
      } catch (error: OutOfMemoryError) {
        copies.forEach { it.bitmap.recycle() }
        failed("No memory for the stills of the windows")
        return
      }
      copies.add(Copy(window, decor, bitmap))
    }
    generation += 1
    val held = generation
    var left = copies.size
    var refused = false
    for (copy in copies) {
      val answered = PixelCopy.OnPixelCopyFinishedListener { result ->
        if (result != PixelCopy.SUCCESS) refused = true
        left -= 1
        if (left == 0) finish(activity, copies, held, refused, fadeMs, done)
      }
      try {
        PixelCopy.request(copy.window, copy.bitmap, answered, main)
      } catch (error: IllegalArgumentException) {
        // A window without a surface (yet, or any more).
        refused = true
        left -= 1
        if (left == 0) finish(activity, copies, held, refused, fadeMs, done)
      }
    }
  }

  fun release(durationMs: Long) {
    // Copies still on their way would come after the change: dropped.
    generation += 1
    val views = stills
    if (views.isEmpty()) return
    afterFrames(FRAMES_BEFORE_FADE) {
      // Gone, or replaced by a newer hold, meanwhile.
      if (stills === views) views.forEach { fadeOut(it, durationMs) }
    }
  }

  private fun finish(
    activity: Activity,
    copies: List<Copy>,
    held: Int,
    refused: Boolean,
    fadeMs: Long,
    done: (Boolean) -> Unit
  ) {
    if (refused || held != generation || copies.any { !it.decor.isAttachedToWindow }) {
      copies.forEach { it.bitmap.recycle() }
      done(false)
      return
    }
    val views = copies.map { cover(activity, it) }
    // The stills they replace (a change during a fade) are in these copies, as they showed.
    stills.forEach { remove(it) }
    stills = views
    main.postDelayed({
      if (held == generation && stills === views) views.forEach { fadeOut(it, fadeMs) }
    }, HOLD_LIMIT_MS)
    done(true)
  }

  private fun cover(activity: Activity, copy: Copy): ImageView {
    val view = ImageView(activity).apply {
      setImageBitmap(copy.bitmap)
      scaleType = ImageView.ScaleType.FIT_XY
      // Takes the touches: what they would reach under it cannot be seen.
      isClickable = true
      isFocusable = false
      importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS
    }
    copy.decor.addView(
      view,
      ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
    )
    return view
  }

  private fun fadeOut(view: ImageView, durationMs: Long) {
    view.animate()
      .alpha(0f)
      .setDuration(durationMs.coerceAtLeast(0L))
      .setInterpolator(DecelerateInterpolator())
      .withLayer()
      .withEndAction { remove(view) }
      .start()
  }

  private fun remove(view: ImageView) {
    view.animate().cancel()
    (view.parent as? ViewGroup)?.removeView(view)
    if (view in stills) stills = stills - view
    val bitmap = (view.drawable as? BitmapDrawable)?.bitmap
    view.setImageDrawable(null)
    bitmap?.recycle()
  }

  /** The activity's window, then each panel's shown over it, in the order they were shown. */
  private fun appWindows(activity: Activity): List<Window> {
    val window = activity.window ?: return emptyList()
    val panels = mutableListOf<Window>()
    collectPanels(window.decorView, panels)
    return listOf(window) + panels
  }

  /**
   * The windows of the Modals shown under `view`. A Modal's host view stays in the screen's views
   * and gives its panel's views as its children (ReactModalHostView): a panel opened from a panel
   * is found under the first one.
   */
  private fun collectPanels(view: View, into: MutableList<Window>) {
    if (view is ReactModalHostView) {
      view.dialog?.takeIf { it.isShowing }?.window?.let { into.add(it) }
    }
    if (view is ViewGroup) {
      for (index in 0 until view.childCount) view.getChildAt(index)?.let { collectPanels(it, into) }
    }
  }

  private fun shown(decor: ViewGroup): Boolean =
    decor.isAttachedToWindow && decor.width > 0 && decor.height > 0

  private fun afterFrames(count: Int, action: () -> Unit) {
    Choreographer.getInstance().postFrameCallback {
      if (count <= 1) action() else afterFrames(count - 1, action)
    }
  }
}
