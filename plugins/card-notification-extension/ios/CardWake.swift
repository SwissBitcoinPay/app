import Foundation

/*
 * A card's tap in the notification service extension (docs/ios-card-payments.md): the relay's
 * packet given to the engine's payment (src/lib/engine/card-wake.ts, entry
 * `sattlemeEngineCardWake`, EngineRuntime.swift), within the extension's time, and its outcome
 * read for the notification: its words, and the data that replaces the relay's once the session
 * is answered (the packet left out: the app, opened from the notification, takes no session
 * already answered). Whatever is out of shape shows the relay's notification as it came, its title
 * in the holder's language (CardPushText.swift), its packet left to the app.
 *
 * Foundation only: compiled and checked on Linux.
 */
enum CardWake {
  /** The engine's entry (src/lib/engine/probe-entry.ts). */
  static let entry = "sattlemeEngineCardWake"
  /**
   * The system's time for the extension: about 30 seconds from the notification (Apple,
   * UNNotificationServiceExtension, `didReceive`), then `serviceExtensionTimeWillExpire`.
   */
  static let extensionSeconds: TimeInterval = 30
  /** Kept of it to show the outcome: the engine's own time ends this much before. */
  static let marginSeconds: TimeInterval = 2
  /** The longest packet given to the engine (as the app's card socket, background-wake.ts). */
  static let maxPacketLength = 4096
  /** The longest texts shown: a notification's banner shows a few lines. */
  static let maxTitleLength = 200
  static let maxBodyLength = 1000
  /** The data of a session answered (src/features/card/card-notices.ts): its `kind` only. */
  static let answeredKinds: Set<String> = ["cardPaid", "cardWake"]

  /** The relay's packet (`cr`) as JSON text: a text as it came, an object written; nil otherwise. */
  static func packetText(_ value: Any?) -> String? {
    let text: String?
    if let string = value as? String {
      text = string
    } else if let object = value as? [String: Any], JSONSerialization.isValidJSONObject(object),
      let data = try? JSONSerialization.data(withJSONObject: object)
    {
      text = String(data: data, encoding: .utf8)
    } else {
      text = nil
    }
    guard let text, !text.isEmpty, text.utf16.count <= maxPacketLength else { return nil }
    return text
  }

  /** What the engine has of the extension's time (ms) at `now`, the notification received at `started`. */
  static func budgetMs(started: Date, now: Date) -> Double {
    let left = extensionSeconds - marginSeconds - now.timeIntervalSince(started)
    return max(0, (left * 1000).rounded(.down))
  }

  /** The notification as the engine's outcome tells it. */
  struct Outcome: Equatable {
    var title: String
    var body: String
    /** The data replacing the relay's (Expo's `body`), nil to keep it. */
    var data: [String: String]?
  }

  /**
   * The engine's outcome (its JSON: `notice` {title, body} or null, `data` {kind} or null) as the
   * notification shows it; nil for no notice (the relay's notification as it came) or anything out
   * of shape.
   */
  static func outcome(json: String) -> Outcome? {
    guard let object = (try? JSONSerialization.jsonObject(with: Data(json.utf8))) as? [String: Any],
      let notice = object["notice"] as? [String: Any],
      let title = text(notice["title"], max: maxTitleLength),
      let body = text(notice["body"], max: maxBodyLength)
    else { return nil }
    var data: [String: String]?
    switch object["data"] {
    case nil, is NSNull:
      data = nil
    case let given as [String: Any]:
      guard given.count == 1, let kind = given["kind"] as? String, answeredKinds.contains(kind)
      else { return nil }
      data = ["kind": kind]
    default:
      return nil
    }
    return Outcome(title: title, body: body, data: data)
  }

  /** A text to show: not blank, cut at `max` characters (an ellipsis ends it then). */
  private static func text(_ value: Any?, max: Int) -> String? {
    guard let string = value as? String,
      !string.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    else { return nil }
    return string.count <= max ? string : String(string.prefix(max - 1)) + "…"
  }
}
