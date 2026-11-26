package me.sattle.softkeyboard

import android.view.View
import android.view.ViewTreeObserver
import android.view.inputmethod.InputMethodManager
import android.widget.EditText

/**
 * Opens the keyboard of a field once it is focused and its window has the focus, as Android says
 * to show it reliably (developer.android.com/develop/ui/views/touch-and-input/keyboard-input/
 * visibility, "Show the soft keyboard reliably"): `showSoftInput` is ignored while the field's
 * window has no focus (InputMethodManager: "not served"), and React Native calls it only as the
 * field is focused (ReactEditText.requestFocusProgrammatically, 0.86). A Modal's window takes the
 * focus some time after its `onShow`, later still when it replaces another Modal (the barcode
 * scanner, then "New item"): the field would show its cursor with the keyboard closed.
 *
 * Waits for both, in either order (React Native's focus command may reach the field after this
 * request), then asks for the keyboard once. Ends there, or when the field loses the focus it had
 * (the user moved on), or leaves its window. Main thread only.
 */
internal class KeyboardRequest private constructor(private val view: View) :
  ViewTreeObserver.OnWindowFocusChangeListener,
  ViewTreeObserver.OnGlobalFocusChangeListener,
  View.OnAttachStateChangeListener {

  /** The field was focused since the request: losing the focus then ends it. */
  private var focused = false

  /** Where the listeners are: the field's window's, while it is attached. */
  private var observer: ViewTreeObserver? = null

  /** Asks for the keyboard once both hold; true when there is nothing more to wait for. */
  private fun settle(): Boolean {
    if (!view.isAttachedToWindow) return true
    if (!view.isFocused) return focused
    focused = true
    if (!view.hasWindowFocus()) return false
    // Posted, as Android's guide does: the window's focus reaches these listeners before the input
    // method takes the field (ViewRootImpl: dispatchFocusEvent, then
    // ImeFocusController.onPostWindowFocus).
    view.post {
      // As React Native asks for it: in touch mode, unless the field opens no keyboard on focus.
      val opens = (view as? EditText)?.showSoftInputOnFocus ?: true
      if (view.isFocused && view.hasWindowFocus() && view.isInTouchMode && opens) {
        view.context.getSystemService(InputMethodManager::class.java)?.showSoftInput(view, 0)
      }
    }
    return true
  }

  override fun onWindowFocusChanged(hasFocus: Boolean) {
    if (settle()) stop()
  }

  override fun onGlobalFocusChanged(oldFocus: View?, newFocus: View?) {
    if (settle()) stop()
  }

  override fun onViewAttachedToWindow(v: View) = Unit

  override fun onViewDetachedFromWindow(v: View) {
    stop()
  }

  private fun stop() {
    observer?.let {
      // A window's observer stays alive; one that was merged into another throws when used.
      if (it.isAlive) {
        it.removeOnWindowFocusChangeListener(this)
        it.removeOnGlobalFocusChangeListener(this)
      }
    }
    observer = null
    view.removeOnAttachStateChangeListener(this)
  }

  companion object {
    fun start(view: View) {
      val request = KeyboardRequest(view)
      if (request.settle()) return
      val observer = view.viewTreeObserver
      observer.addOnWindowFocusChangeListener(request)
      observer.addOnGlobalFocusChangeListener(request)
      view.addOnAttachStateChangeListener(request)
      request.observer = observer
    }
  }
}
