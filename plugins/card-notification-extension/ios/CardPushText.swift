import Foundation

/*
 * The text of a card's wake-up, written by the extension before iOS shows it: the card relay
 * sends a title in no language ("sattle.me"), the extension writes the app's own, in the language
 * the app shows (src/i18n/languages.ts, toLanguage: the device's first preferred language, German in
 * its Swiss variant for Switzerland and Liechtenstein, English for a language the app does not
 * speak). The titles are the app's translations (`card.payment.title`), put in the extension's
 * Info.plist at prebuild (card-push-titles.json, kept equal to the translations by a test).
 *
 * Foundation only: compiled and checked on Linux against the app's language vectors
 * (card-push-language-vectors.json).
 */
enum CardPushText {
  /** The Info.plist key of the titles, by language. */
  static let titlesKey = "SattlemeCardPushTitles"
  /** The data of the app's own test of this text (extension-probe.ts, launchCardTextTest). */
  static let testKey = "sattlemeCardTextTest"

  static let languages: Set<String> = ["fr", "en", "de", "de-CH", "it", "es", "pt", "fi"]
  static let fallback = "en"
  static let swissGermanRegions: Set<String> = ["CH", "LI"]

  /**
   * Whether a notification's data (`body` of Expo's payload) is a card's wake-up: it carries the
   * relay's packet (`cr`), or it is the app's test of this text.
   */
  static func isCardWake(_ data: [String: Any]) -> Bool {
    data["cr"] != nil || (data[testKey] as? Bool) == true
  }

  /** The app's language for a BCP 47 tag ("de-CH", "pt_BR", "zh-Hant-TW"), as toLanguage reads it. */
  static func language(of tag: String?) -> String {
    let subtags = (tag ?? "").split(
      omittingEmptySubsequences: false, whereSeparator: { $0 == "-" || $0 == "_" }
    ).map(String.init)
    let base = (subtags.first ?? "").lowercased()
    if base == "de" {
      // The region: the first subtag of two letters after the language (a script has four).
      let region = subtags.dropFirst().first { subtag in
        subtag.count == 2 && subtag.unicodeScalars.allSatisfy { $0.isASCII && $0.properties.isAlphabetic }
      }
      return region.map { swissGermanRegions.contains($0.uppercased()) } == true ? "de-CH" : "de"
    }
    return languages.contains(base) ? base : fallback
  }

  /** The title in the language of `tag`, else in English; nil without titles. */
  static func title(titles: [String: String], tag: String?) -> String? {
    titles[language(of: tag)] ?? titles[fallback]
  }

  /**
   * The device's first preferred language, as the app reads it (expo-localization, getLocales:
   * `Locale.preferredLanguages`, else the current locale).
   */
  static func deviceTag() -> String {
    Locale.preferredLanguages.first ?? Locale.current.identifier
  }
}
