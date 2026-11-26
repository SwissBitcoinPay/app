import Foundation
import UserNotifications

/*
 * The app's notification service extension (Apple: it runs for each remote notification that
 * shows an alert and carries `mutable-content: 1`, about 30 seconds, before the notification
 * shows). A card's wake-up runs its payment in the engine (CardWake.swift,
 * docs/ios-card-payments.md) and shows its outcome; without one, the app's title in its language
 * (CardPushText.swift). A notification whose data asks for a probe runs the measurement
 * (CardProbe.swift) and shows its result; any other notification shows as it came.
 */
final class NotificationService: UNNotificationServiceExtension {
  private let lock = NSLock()
  private var handler: ((UNNotificationContent) -> Void)?
  private var content: UNMutableNotificationContent?
  private var probe: CardProbe?
  /** A card wake-up's title in the holder's language: what shows when the time runs out. */
  private var wakeTitle: String?

  override func didReceive(
    _ request: UNNotificationRequest,
    withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void
  ) {
    guard let content = request.content.mutableCopy() as? UNMutableNotificationContent else {
      contentHandler(request.content)
      return
    }
    lock.lock()
    handler = contentHandler
    self.content = content
    lock.unlock()
    // Expo puts a push's data under `body` (expo-notifications 57, NotificationRecords.swift).
    guard let body = request.content.userInfo["body"] as? [String: Any] else {
      deliver(nil)
      return
    }
    // A card's wake-up: its payment in the engine, which tells what shows. Without an outcome
    // (the app's test of the text, no app group, the engine's time out, a payment the extension
    // does not take), its title in the app's language, nothing else changed: the app takes the
    // packet. Without titles (a build that lacks them), the relay's own title shows.
    if CardPushText.isCardWake(body) {
      let started = Date()
      let titles =
        Bundle.main.object(forInfoDictionaryKey: CardPushText.titlesKey) as? [String: String] ?? [:]
      let tag = CardPushText.deviceTag()
      let title = CardPushText.title(titles: titles, tag: tag)
      lock.lock()
      wakeTitle = title
      lock.unlock()
      guard let packet = CardWake.packetText(body["cr"]),
        let shared = DarwinProbePlatform.shared()
      else {
        deliver(nil, title: title)
        return
      }
      Task {
        let result = try? await EngineRuntime.runCardWake(
          group: shared.group,
          container: shared.container,
          packet: packet,
          receivedAtMs: (started.timeIntervalSince1970 * 1000).rounded(.down),
          language: tag,
          budgetMs: CardWake.budgetMs(started: started, now: Date())
        )
        guard let outcome = result.flatMap(CardWake.outcome(json:)) else {
          self.deliver(nil, title: title)
          return
        }
        self.deliver(outcome.body, title: outcome.title, data: outcome.data)
      }
      return
    }
    guard let probeRequest = ProbeRequest(body: body) else {
      deliver(nil)
      return
    }
    guard let platform = DarwinProbePlatform() else {
      deliver("Failed: no container shared with the app (app group)")
      return
    }
    // A run the app did not just ask for (anyone with the push token can send one): shown as it
    // came, nothing run (ProbeExpectation).
    let nowMs = Int64(Date().timeIntervalSince1970 * 1000)
    guard ProbeExpectation.isExpected(probeRequest, container: platform.container, nowMs: nowMs)
    else {
      deliver(nil)
      return
    }
    guard let probe = CardProbe(request: probeRequest, platform: platform) else {
      deliver("Failed: no container shared with the app (app group)")
      return
    }
    lock.lock()
    self.probe = probe
    lock.unlock()
    Task {
      let record = await probe.run()
      self.deliver(ProbeSummary.text(record))
    }
  }

  /** The system's time is about to run out: what is known shows now. */
  override func serviceExtensionTimeWillExpire() {
    lock.lock()
    let probe = self.probe
    let wakeTitle = self.wakeTitle
    lock.unlock()
    deliver(probe.map { ProbeSummary.text($0.expire()) }, title: wakeTitle)
  }

  /**
   * Shows the notification once, with `body` and `title` when given; `data` in place of the
   * push's own (Expo's `body` of `userInfo`: the relay's packet), when given.
   */
  private func deliver(_ body: String?, title: String? = nil, data: [String: String]? = nil) {
    lock.lock()
    let handler = self.handler
    let content = self.content
    self.handler = nil
    lock.unlock()
    guard let handler, let content else { return }
    if let body { content.body = body }
    if let title { content.title = title }
    if let data {
      var userInfo = content.userInfo
      userInfo["body"] = data
      content.userInfo = userInfo
    }
    handler(content)
  }
}
