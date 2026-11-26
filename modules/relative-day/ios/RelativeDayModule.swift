import ExpoModulesCore
import Foundation

public class RelativeDayModule: Module {
  public func definition() -> ModuleDefinition {
    Name("RelativeDay")

    // The device's word for today (offset 0) or yesterday (-1) in `languageTag`, as at the start
    // of a sentence: DateFormatter's relative formatting, which replaces the date with that word
    // where its locale data has one. Nil for another offset, when it wrote the date itself, or when
    // the day turned during the call: the formatter compares `day` with its own present, so today's
    // date would then come out as "Yesterday", yesterday's as "Vorgestern", and the caller
    // keeps a word for good.
    Function("relativeDay") { (languageTag: String, offset: Int) -> String? in
      let calendar = Calendar.current
      let now = Date()
      guard offset == 0 || offset == -1,
        let day = calendar.date(byAdding: .day, value: offset, to: now)
      else { return nil }
      let formatter = DateFormatter()
      formatter.locale = Locale(identifier: languageTag)
      formatter.dateStyle = .medium
      formatter.timeStyle = .none
      formatter.formattingContext = .beginningOfSentence
      let date = formatter.string(from: day)
      formatter.doesRelativeDateFormatting = true
      let word = formatter.string(from: day)
      guard calendar.isDate(now, inSameDayAs: Date()) else { return nil }
      return word == date ? nil : word
    }
  }
}
