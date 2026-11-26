package me.sattle.softkeyboard

import android.view.View
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class SoftKeyboardModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("SoftKeyboard")

    // Opens the keyboard of the field `view` (its React tag) once that field is focused and its
    // window has the focus (KeyboardRequest). On the main thread: the tag is resolved there.
    AsyncFunction("showOnceFocused") { view: View ->
      KeyboardRequest.start(view)
    }.runOnQueue(Queues.MAIN)
  }
}
