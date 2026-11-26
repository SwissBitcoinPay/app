package me.sattle.relativeday

import android.icu.text.DisplayContext
import android.icu.text.RelativeDateTimeFormatter
import android.icu.text.RelativeDateTimeFormatter.AbsoluteUnit
import android.icu.text.RelativeDateTimeFormatter.Direction
import android.icu.text.RelativeDateTimeFormatter.Style
import android.icu.util.ULocale
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class RelativeDayModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("RelativeDay")

    // The device's word for today (offset 0) or yesterday (-1) in `languageTag`, as at the start
    // of a sentence: ICU's relative date formatter (API 24), with the system's locale data. Null
    // for another offset.
    Function("relativeDay") { languageTag: String, offset: Int ->
      val direction: Direction? = when (offset) {
        0 -> Direction.THIS
        -1 -> Direction.LAST
        else -> null
      }
      direction?.let {
        RelativeDateTimeFormatter.getInstance(
          ULocale.forLanguageTag(languageTag),
          null,
          Style.LONG,
          DisplayContext.CAPITALIZATION_FOR_BEGINNING_OF_SENTENCE
        ).format(it, AbsoluteUnit.DAY)
      }
    }
  }
}
