import Foundation
import JavaScriptCore
import Security
import os

/*
 * The engine's runtime host (src/lib/engine/host.ts, EngineRuntimeHost): what the app's
 * TypeScript asks of the extension in JavaScriptCore. Timers, a monotonic clock, HTTPS and
 * WebSockets (URLSession), the journal, the card items the app shares (its app group's keychain
 * group, read only), the build's settings, and the app group's container, where only the
 * extension's own files (`extension/`) may be written: the app is the one writer of the others
 * (docs/ios-card-payments.md, "Shared state"); and the Breez SDK (`breez`, EngineWallet.swift).
 *
 * Everything runs on one serial queue: JavaScriptCore's context, the host's functions it calls,
 * the timers, and URLSession's delegate (its operation queue runs on that queue). A callback into
 * JavaScript is called there, one at a time; the engine's promises settle as each one returns.
 * The Breez SDK's calls run off it (EngineWallets, an actor), their answers given back on it.
 * Apple's APIs only, checked against their documentation: this file is not compiled outside Xcode.
 */

enum EngineRuntimeError: Error, CustomStringConvertible {
  case noBundle
  case noContext
  case script(String)
  case noEntry(String)
  case timedOut
  case badResult

  var description: String {
    switch self {
    case .noBundle: return "no engine.js in the extension"
    case .noContext: return "no JavaScript context"
    case let .script(message): return "engine: \(message.prefix(300))"
    case let .noEntry(name): return "the engine has no \(name)"
    case .timedOut: return "the engine did not answer in time"
    case .badResult: return "the engine's result is not a text"
    }
  }
}

final class EngineRuntime: NSObject, URLSessionDataDelegate, URLSessionWebSocketDelegate {
  /** The build's settings the engine reads, written in the extension's Info.plist by the plugin. */
  static let configKey = "SattlemeEngineConfig"
  /**
   * The card items the app shares (src/lib/card/card-keychain.ts, CARD_SHARED_SERVICE): their
   * service with the ":no-auth" expo-secure-store 58 adds to an item without authentication, and
   * their key as account (SecureStoreModule.swift, `query(with:)`).
   */
  static let cardItemService = "card-shared:no-auth"
  /** The extension's own files in the container: the only ones it writes. */
  static let ownDirectory = "extension"
  /** The most a response's body, a file read, or a WebSocket frame may hold. */
  static let maxBodyBytes = 4 * 1024 * 1024
  static let requestTimeout: TimeInterval = 30
  static let maxLogLines = 200
  static let maxLogLength = 1000

  private static let logger = Logger(subsystem: "me.sattle.card-extension", category: "engine")

  let queue = DispatchQueue(label: "me.sattle.card-extension.engine")
  private let group: String
  private let container: URL
  private let config: String
  private let recordStep: (String) -> Void
  /** The Breez SDK the engine is given (EngineWallet.swift); nil without a valid network. */
  private let wallets: EngineWallets?
  /** The probe's test wallet's seed (`connectProbe`): a probe's runtime only. */
  private let probeSeed: Data?
  private var context: JSContext?
  private var session: URLSession?
  private var nextId = 1
  private var timers: [Int: DispatchWorkItem] = [:]
  private var fetches: [Int: Fetch] = [:]
  private var fetchIds: [Int: Int] = [:]
  private var sockets: [Int: Socket] = [:]
  private var socketIds: [Int: Int] = [:]
  private(set) var logs: [String] = []

  private final class Fetch {
    let task: URLSessionDataTask
    let done: JSValue
    let noRedirect: Bool
    var data = Data()
    var redirected = false
    var refusedRedirect = false
    var tooLarge = false
    init(task: URLSessionDataTask, done: JSValue, noRedirect: Bool) {
      self.task = task
      self.done = done
      self.noRedirect = noRedirect
    }
  }

  private final class Socket {
    let task: URLSessionWebSocketTask
    let events: JSValue
    var closed = false
    init(task: URLSessionWebSocketTask, events: JSValue) {
      self.task = task
      self.events = events
    }
  }

  /**
   * `probeSeed`: the seed of the probe's test wallet, which `connectProbe` connects (a probe's runs
   * only); `maxSendSats`: what a payment may send at most there, fee included.
   */
  init(
    group: String,
    container: URL,
    probeSeed: Data? = nil,
    maxSendSats: UInt64? = nil,
    step: @escaping (String) -> Void
  ) {
    self.group = group
    self.container = container.standardizedFileURL
    let config = Bundle.main.object(forInfoDictionaryKey: Self.configKey) as? String ?? "{}"
    self.config = config
    let settings =
      (try? JSONSerialization.jsonObject(with: Data(config.utf8))) as? [String: Any] ?? [:]
    self.wallets = try? EngineWallets(
      container: container.standardizedFileURL,
      settings: settings,
      maxSendSats: maxSendSats
    )
    self.probeSeed = probeSeed
    self.recordStep = step
    super.init()
  }

  /**
   * Runs the engine's runtime probe (src/lib/engine/runtime-probe.ts) and returns its result, a
   * JSON text, or throws; within `timeout` seconds. Everything it opened is closed after.
   */
  static func runProbe(
    group: String,
    container: URL,
    timeout: TimeInterval,
    step: @escaping (String) -> Void
  ) async throws -> String {
    let runtime = EngineRuntime(group: group, container: container, step: step)
    return try await runtime.run(entry: "sattlemeEngineRuntimeProbe", arguments: [], timeout: timeout)
  }

  /**
   * Runs the engine's wallet probe (src/lib/engine/wallet-probe.ts): the probe's test wallet of
   * `seed` connected through the engine, `invoice` paid, `maxSendSats` at most, fee included;
   * `run` its idempotency key. Its result, a JSON text, or throws; within `timeout` seconds.
   */
  static func runWalletProbe(
    group: String,
    container: URL,
    seed: Data,
    invoice: String,
    run: String,
    maxSendSats: UInt64,
    timeout: TimeInterval,
    step: @escaping (String) -> Void
  ) async throws -> String {
    let runtime = EngineRuntime(
      group: group,
      container: container,
      probeSeed: seed,
      maxSendSats: maxSendSats,
      step: step
    )
    return try await runtime.run(
      entry: "sattlemeEngineWalletProbe",
      arguments: [invoice, run, NSNumber(value: maxSendSats)],
      timeout: timeout
    )
  }

  /**
   * Runs a card's tap in the engine (src/lib/engine/card-wake.ts, CardWake.swift): `packet` the
   * relay's (JSON text), received at `receivedAtMs` (ms since 1970), `language` the holder's (a
   * BCP 47 tag), `budgetMs` what the engine has of the extension's time. Its outcome, a JSON text,
   * or throws; within that time and a second. Everything it opened is closed after.
   */
  static func runCardWake(
    group: String,
    container: URL,
    packet: String,
    receivedAtMs: Double,
    language: String,
    budgetMs: Double
  ) async throws -> String {
    let runtime = EngineRuntime(group: group, container: container, step: { _ in })
    return try await runtime.run(
      entry: CardWake.entry,
      arguments: [packet, NSNumber(value: receivedAtMs), language, NSNumber(value: budgetMs)],
      timeout: budgetMs / 1000 + 1
    )
  }

  /**
   * Calls the engine's `entry(...arguments, done)` and returns what `done` gives, a JSON text, or
   * throws; within `timeout` seconds. Everything it opened is closed after.
   */
  private func run(entry name: String, arguments: [Any], timeout: TimeInterval) async throws
    -> String
  {
    let runtime = self
    return try await withCheckedThrowingContinuation { continuation in
      var settled = false
      let settle: (Result<String, Error>) -> Void = { result in
        if settled { return }
        settled = true
        runtime.shutdown()
        continuation.resume(with: result)
      }
      runtime.queue.async {
        do {
          let (context, entry) = try runtime.start(entry: name)
          let done: @convention(block) (JSValue) -> Void = { value in
            runtime.queue.async {
              if value.isString, let text = value.toString() {
                settle(.success(text))
              } else {
                settle(.failure(EngineRuntimeError.badResult))
              }
            }
          }
          _ = entry.call(withArguments: arguments + [JSValue(object: done, in: context) as Any])
          if let thrown = runtime.takeException() { settle(.failure(thrown)) }
        } catch {
          settle(.failure(error))
        }
      }
      runtime.queue.asyncAfter(deadline: .now() + timeout) {
        settle(.failure(EngineRuntimeError.timedOut))
      }
    }
  }

  /** Loads engine.js with the host installed, on the queue; its context and entry `name`. */
  private func start(entry name: String) throws -> (JSContext, JSValue) {
    dispatchPrecondition(condition: .onQueue(queue))
    guard let url = Bundle.main.url(forResource: "engine", withExtension: "js"),
      let script = try? String(contentsOf: url, encoding: .utf8)
    else { throw EngineRuntimeError.noBundle }
    guard let context = JSContext() else { throw EngineRuntimeError.noContext }
    self.context = context
    let operations = OperationQueue()
    operations.maxConcurrentOperationCount = 1
    operations.underlyingQueue = queue
    let configuration = URLSessionConfiguration.ephemeral
    configuration.timeoutIntervalForRequest = Self.requestTimeout
    configuration.httpCookieStorage = nil
    configuration.urlCache = nil
    session = URLSession(configuration: configuration, delegate: self, delegateQueue: operations)
    context.setObject(makeHost(in: context), forKeyedSubscript: "__sattlemeHost" as NSString)
    _ = context.evaluateScript(script, withSourceURL: url)
    if let thrown = takeException() { throw thrown }
    guard let entry = context.objectForKeyedSubscript(name), entry.isObject else {
      throw EngineRuntimeError.noEntry(name)
    }
    return (context, entry)
  }

  /** The exception the last call into JavaScript left, cleared. */
  private func takeException() -> Error? {
    guard let context, let exception = context.exception else { return nil }
    context.exception = nil
    return EngineRuntimeError.script(exception.toString() ?? "an exception")
  }

  /** Cancels what is left (timers, requests, sockets) and lets the context go. */
  private func shutdown() {
    queue.async { [self] in
      for timer in timers.values { timer.cancel() }
      timers.removeAll()
      for fetch in fetches.values { fetch.task.cancel() }
      fetches.removeAll()
      fetchIds.removeAll()
      for socket in sockets.values { socket.task.cancel(with: .goingAway, reason: nil) }
      sockets.removeAll()
      socketIds.removeAll()
      // A session keeps its delegate until it is invalidated.
      session?.invalidateAndCancel()
      session = nil
      context = nil
      // What the engine did not disconnect: disconnected and let go.
      if let wallets {
        Task { await wallets.closeAll() }
      }
    }
  }

  /** Throws `message` in JavaScript, as the host function called returns. */
  private func fail(_ message: String) {
    guard let context = JSContext.current() else { return }
    context.exception = JSValue(newErrorFromMessage: message, in: context)
  }

  /** JavaScript's null, or `text`, in the context calling the host. */
  private func textOrNull(_ text: String?) -> JSValue? {
    guard let context = JSContext.current() else { return nil }
    guard let text else { return JSValue(nullIn: context) }
    return JSValue(object: text, in: context)
  }

  private func newId() -> Int {
    defer { nextId += 1 }
    return nextId
  }

  // MARK: The host object

  private func makeHost(in context: JSContext) -> JSValue {
    let host = JSValue(newObjectIn: context)!
    let random: @convention(block) (Int) -> [NSNumber] = { length in
      guard length >= 0, length <= EngineHost.maxRandomBytes else { return [] }
      var bytes = [UInt8](repeating: 0, count: length)
      guard length == 0 || SecRandomCopyBytes(kSecRandomDefault, length, &bytes) == errSecSuccess
      else { return [] }
      return bytes.map { NSNumber(value: $0) }
    }
    let step: @convention(block) (String) -> Void = { [weak self] name in
      if EngineHost.isStepName(name) { self?.recordStep(name) }
    }
    let monotonic: @convention(block) () -> Double = {
      Double(DispatchTime.now().uptimeNanoseconds) / 1_000_000
    }
    let setTimer: @convention(block) (Double, JSValue) -> Int = { [weak self] ms, callback in
      self?.setTimer(ms: ms, callback: callback) ?? 0
    }
    let clearTimer: @convention(block) (Int) -> Void = { [weak self] id in
      self?.timers.removeValue(forKey: id)?.cancel()
    }
    let log: @convention(block) (String, String) -> Void = { [weak self] level, text in
      self?.log(level: level, text: text)
    }
    let fetch: @convention(block) (JSValue, JSValue) -> Int = { [weak self] request, done in
      self?.fetch(request: request, done: done) ?? 0
    }
    let cancelFetch: @convention(block) (Int) -> Void = { [weak self] id in
      self?.cancelFetch(id: id)
    }
    let openSocket: @convention(block) (String, JSValue) -> Int = { [weak self] url, events in
      self?.openSocket(url: url, events: events) ?? 0
    }
    let sendSocket: @convention(block) (Int, String) -> Void = { [weak self] id, text in
      self?.sendSocket(id: id, text: text)
    }
    let closeSocket: @convention(block) (Int, Int, String) -> Void = { [weak self] id, code, reason in
      self?.closeSocket(id: id, code: code, reason: reason)
    }
    let cardItem: @convention(block) (String) -> JSValue? = { [weak self] key in
      self?.textOrNull(self?.cardItem(key: key))
    }
    let config: @convention(block) () -> String = { [weak self] in self?.config ?? "{}" }
    let members: [String: Any] = [
      "random": random, "step": step, "monotonic": monotonic, "setTimer": setTimer,
      "clearTimer": clearTimer, "log": log, "fetch": fetch, "cancelFetch": cancelFetch,
      "openSocket": openSocket, "sendSocket": sendSocket, "closeSocket": closeSocket,
      "cardItem": cardItem, "config": config
    ]
    for (name, block) in members {
      host.setObject(block, forKeyedSubscript: name as NSString)
    }
    host.setObject(makeFiles(in: context), forKeyedSubscript: "files" as NSString)
    if let wallets {
      host.setObject(makeBreez(in: context, wallets: wallets), forKeyedSubscript: "breez" as NSString)
    }
    return host
  }

  // MARK: Timers and journal

  private func setTimer(ms: Double, callback: JSValue) -> Int {
    let id = newId()
    let delay = ms.isFinite && ms > 0 ? ms : 0
    let item = DispatchWorkItem { [weak self] in
      guard let self, self.timers.removeValue(forKey: id) != nil else { return }
      _ = callback.call(withArguments: [])
      if let thrown = self.takeException() { self.log(level: "error", text: "\(thrown)") }
    }
    timers[id] = item
    queue.asyncAfter(deadline: .now() + .microseconds(Int(delay * 1000)), execute: item)
    return id
  }

  private func log(level: String, text: String) {
    let line = String("\(level) \(text)".prefix(Self.maxLogLength))
    logs.append(line)
    if logs.count > Self.maxLogLines { logs.removeFirst(logs.count - Self.maxLogLines) }
    Self.logger.log("\(line, privacy: .private)")
  }

  // MARK: HTTPS

  private func fetch(request: JSValue, done: JSValue) -> Int {
    guard let session,
      let urlText = request.forProperty("url")?.toString(),
      let url = URL(string: urlText), url.scheme?.lowercased() == "https",
      let method = request.forProperty("method")?.toString()
    else {
      fail("Not a request the host sends")
      return 0
    }
    var urlRequest = URLRequest(url: url)
    urlRequest.httpMethod = method
    urlRequest.httpShouldHandleCookies = false
    if let headers = request.forProperty("headers")?.toArray() as? [[String]] {
      for pair in headers where pair.count == 2 {
        urlRequest.addValue(pair[1], forHTTPHeaderField: pair[0])
      }
    }
    if let body = request.forProperty("body"), body.isString, let text = body.toString() {
      urlRequest.httpBody = Data(text.utf8)
    }
    let noRedirect = request.forProperty("noRedirect")?.toBool() ?? false
    let id = newId()
    let task = session.dataTask(with: urlRequest)
    fetches[id] = Fetch(task: task, done: done, noRedirect: noRedirect)
    fetchIds[task.taskIdentifier] = id
    task.resume()
    return id
  }

  /** Its `done` is never called: the engine gave up on it. */
  private func cancelFetch(id: Int) {
    guard let fetch = fetches.removeValue(forKey: id) else { return }
    fetchIds.removeValue(forKey: fetch.task.taskIdentifier)
    fetch.task.cancel()
  }

  func urlSession(
    _ session: URLSession,
    task: URLSessionTask,
    willPerformHTTPRedirection response: HTTPURLResponse,
    newRequest request: URLRequest,
    completionHandler: @escaping @Sendable (URLRequest?) -> Void
  ) {
    guard let id = fetchIds[task.taskIdentifier], let fetch = fetches[id] else {
      completionHandler(nil)
      return
    }
    // Only HTTPS, and none at all when the engine asked so (fetch's `redirect: "error"`).
    if fetch.noRedirect || request.url?.scheme?.lowercased() != "https" {
      fetch.refusedRedirect = true
      completionHandler(nil)
      task.cancel()
      return
    }
    fetch.redirected = true
    completionHandler(request)
  }

  func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
    guard let id = fetchIds[dataTask.taskIdentifier], let fetch = fetches[id] else { return }
    if fetch.data.count + data.count > Self.maxBodyBytes {
      fetch.tooLarge = true
      dataTask.cancel()
      return
    }
    fetch.data.append(data)
  }

  func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
    if let id = fetchIds.removeValue(forKey: task.taskIdentifier) {
      guard let fetch = fetches.removeValue(forKey: id) else { return }
      completeFetch(fetch, task: task, error: error)
      return
    }
    if let id = socketIds[task.taskIdentifier] {
      socketEnded(id: id, code: 1006, reason: "")
    }
  }

  private func completeFetch(_ fetch: Fetch, task: URLSessionTask, error: Error?) {
    let failure: String?
    if fetch.refusedRedirect {
      failure = "Redirected"
    } else if fetch.tooLarge {
      failure = "The response is too large"
    } else if let error {
      failure = error.localizedDescription
    } else {
      failure = nil
    }
    guard failure == nil, let response = task.response as? HTTPURLResponse,
      let body = String(data: fetch.data, encoding: .utf8)
    else {
      _ = fetch.done.call(withArguments: [NSNull(), failure ?? "Not a text response"])
      if let thrown = takeException() { log(level: "error", text: "\(thrown)") }
      return
    }
    let headers: [[String]] = response.allHeaderFields.compactMap { name, value in
      guard let name = name as? String, let value = value as? String else { return nil }
      return [name, value]
    }
    let answer: [String: Any] = [
      "status": response.statusCode,
      "url": response.url?.absoluteString ?? "",
      "redirected": fetch.redirected,
      "headers": headers,
      "body": body
    ]
    _ = fetch.done.call(withArguments: [answer, NSNull()])
    if let thrown = takeException() { log(level: "error", text: "\(thrown)") }
  }

  // MARK: WebSockets

  private func openSocket(url text: String, events: JSValue) -> Int {
    guard let session, let url = URL(string: text), url.scheme?.lowercased() == "wss" else {
      fail("wss URLs only here")
      return 0
    }
    let id = newId()
    let task = session.webSocketTask(with: url)
    task.maximumMessageSize = Self.maxBodyBytes
    sockets[id] = Socket(task: task, events: events)
    socketIds[task.taskIdentifier] = id
    task.resume()
    return id
  }

  func urlSession(
    _ session: URLSession,
    webSocketTask: URLSessionWebSocketTask,
    didOpenWithProtocol protocol: String?
  ) {
    guard let id = socketIds[webSocketTask.taskIdentifier], let socket = sockets[id],
      !socket.closed
    else { return }
    emit(socket, "open", [])
    receive(id: id)
  }

  func urlSession(
    _ session: URLSession,
    webSocketTask: URLSessionWebSocketTask,
    didCloseWith closeCode: URLSessionWebSocketTask.CloseCode,
    reason: Data?
  ) {
    guard let id = socketIds[webSocketTask.taskIdentifier] else { return }
    let text = reason.flatMap { String(data: $0, encoding: .utf8) } ?? ""
    socketEnded(id: id, code: closeCode.rawValue, reason: text, error: false)
  }

  private func receive(id: Int) {
    guard let socket = sockets[id], !socket.closed else { return }
    socket.task.receive { [weak self] result in
      // URLSession calls back on its delegate's queue: the engine's.
      guard let self, let socket = self.sockets[id], !socket.closed else { return }
      switch result {
      case let .success(.string(text)):
        self.emit(socket, "message", [text])
        self.receive(id: id)
      case .success:
        // Text frames only.
        socket.task.cancel(with: .unsupportedData, reason: nil)
        self.socketEnded(id: id, code: 1003, reason: "")
      case .failure:
        self.socketEnded(id: id, code: 1006, reason: "")
      }
    }
  }

  private func sendSocket(id: Int, text: String) {
    guard let socket = sockets[id], !socket.closed else { return }
    socket.task.send(.string(text)) { [weak self] error in
      guard error != nil, let self else { return }
      self.queue.async { self.socketEnded(id: id, code: 1006, reason: "") }
    }
  }

  /** The engine closes it: its close follows, whatever the server says after. */
  private func closeSocket(id: Int, code: Int, reason: String) {
    guard let socket = sockets[id], !socket.closed else { return }
    let closeCode = URLSessionWebSocketTask.CloseCode(rawValue: code) ?? .normalClosure
    socket.task.cancel(with: closeCode, reason: Data(reason.utf8))
    queue.async { [weak self] in
      self?.socketEnded(id: id, code: code, reason: reason, error: false)
    }
  }

  /** Tells the socket's end once: an error first when it failed, then its close. */
  private func socketEnded(id: Int, code: Int, reason: String, error: Bool = true) {
    guard let socket = sockets.removeValue(forKey: id), !socket.closed else { return }
    socket.closed = true
    socketIds.removeValue(forKey: socket.task.taskIdentifier)
    if error { emit(socket, "error", []) }
    emit(socket, "close", [code, reason])
  }

  private func emit(_ socket: Socket, _ event: String, _ arguments: [Any]) {
    _ = socket.events.invokeMethod(event, withArguments: arguments)
    if let thrown = takeException() { log(level: "error", text: "\(thrown)") }
  }

  // MARK: The Breez SDK

  /**
   * Runs `work` off the queue, then calls `done(value, null)` or `done(null, message)` on it,
   * unless the runtime ended meanwhile.
   */
  private func answer(_ done: JSValue, _ work: @escaping @Sendable () async throws -> Any) {
    Task {
      let result: Result<Any, Error>
      do {
        result = .success(try await work())
      } catch {
        result = .failure(error)
      }
      queue.async { [weak self] in
        guard let self, self.context != nil else { return }
        switch result {
        case let .success(value):
          _ = done.call(withArguments: [value, NSNull()])
        case let .failure(error):
          // Bounded: an SDK error may carry a long text.
          _ = done.call(withArguments: [NSNull(), String(String(describing: error).prefix(300))])
        }
        if let thrown = self.takeException() { self.log(level: "error", text: "\(thrown)") }
      }
    }
  }

  /** `callback()` on the queue, unless the runtime ended. */
  private func later(_ callback: JSValue) -> @Sendable () -> Void {
    return { [weak self] in
      self?.queue.async {
        guard let self, self.context != nil else { return }
        _ = callback.call(withArguments: [])
        if let thrown = self.takeException() { self.log(level: "error", text: "\(thrown)") }
      }
    }
  }

  /** The engine's `HostBreez` (src/lib/engine/host.ts). */
  private func makeBreez(in context: JSContext, wallets: EngineWallets) -> JSValue {
    let breez = JSValue(newObjectIn: context)!
    let connect: @convention(block) (String, String, JSValue, JSValue) -> Void = {
      [weak self] mnemonic, storage, synced, done in
      guard let self else { return }
      let onSynced = self.later(synced)
      self.answer(done) {
        try await wallets.connect(mnemonic: mnemonic, storage: storage, synced: onSynced)
      }
    }
    let disconnect: @convention(block) (Int, JSValue) -> Void = { [weak self] id, done in
      self?.answer(done) { try await wallets.disconnect(id: id) }
    }
    let release: @convention(block) (Int) -> Void = { id in
      Task { await wallets.release(id: id) }
    }
    let info: @convention(block) (Int, Bool, JSValue) -> Void = { [weak self] id, ensureSynced, done in
      self?.answer(done) { try await wallets.info(id: id, ensureSynced: ensureSynced) }
    }
    let parse: @convention(block) (Int, String, JSValue) -> Void = { [weak self] id, input, done in
      self?.answer(done) { try await wallets.parse(id: id, input: input) }
    }
    let prepareBolt11: @convention(block) (Int, String, JSValue) -> Void = {
      [weak self] id, bolt11, done in
      self?.answer(done) { try await wallets.prepareBolt11(id: id, bolt11: bolt11) }
    }
    let send: @convention(block) (Int, String, String, Bool, Int, JSValue) -> Void = {
      [weak self] id, quoteId, idempotencyKey, untilSent, timeoutSecs, done in
      let timeout = UInt32(max(0, min(timeoutSecs, 60)))
      self?.answer(done) {
        try await wallets.send(
          id: id,
          quoteId: quoteId,
          idempotencyKey: idempotencyKey,
          untilSent: untilSent,
          completionTimeoutSecs: timeout
        )
      }
    }
    let getPayment: @convention(block) (Int, String, JSValue) -> Void = {
      [weak self] id, paymentId, done in
      self?.answer(done) { try await wallets.getPayment(id: id, paymentId: paymentId) }
    }
    var members: [String: Any] = [
      "connect": connect, "disconnect": disconnect, "release": release, "info": info,
      "parse": parse, "prepareBolt11": prepareBolt11, "send": send, "getPayment": getPayment
    ]
    if let probeSeed {
      // The probe's test wallet only: its seed never reaches the engine.
      let connectProbe: @convention(block) (String, JSValue, JSValue) -> Void = {
        [weak self] storage, synced, done in
        guard let self else { return }
        let onSynced = self.later(synced)
        self.answer(done) {
          try await wallets.connectProbe(seed: probeSeed, storage: storage, synced: onSynced)
        }
      }
      members["connectProbe"] = connectProbe
    }
    for (name, block) in members {
      breez.setObject(block, forKeyedSubscript: name as NSString)
    }
    return breez
  }

  // MARK: What the app shares

  /**
   * A card item the app wrote with expo-secure-store in the app group's keychain group
   * (card-keychain.ts), readable once the phone was unlocked after its start; null when absent.
   */
  private func cardItem(key: String) -> String? {
    let account = Data(key.utf8)
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: Self.cardItemService,
      kSecAttrAccount as String: account,
      kSecAttrAccessGroup as String: group,
      kSecMatchLimit as String: kSecMatchLimitOne,
      kSecReturnData as String: true
    ]
    var item: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &item)
    if status == errSecItemNotFound { return nil }
    guard status == errSecSuccess, let data = item as? Data,
      let text = String(data: data, encoding: .utf8)
    else {
      fail("The card item could not be read (\(status))")
      return nil
    }
    return text
  }

  /**
   * `path` in the container: relative, of plain names only (no ".", "..", nor empty one), as the
   * engine's expo-file-system shim gives it. Nil out of it.
   */
  private func resolve(_ path: String) -> URL? {
    if path.isEmpty { return container }
    let names = path.split(separator: "/", omittingEmptySubsequences: false).map(String.init)
    guard !path.hasPrefix("/"), names.allSatisfy({ !$0.isEmpty && $0 != "." && $0 != ".." })
    else { return nil }
    let url = names.reduce(container) { $0.appendingPathComponent($1) }.standardizedFileURL
    guard url.path.hasPrefix(container.path + "/") else { return nil }
    return url
  }

  /** `path` if the extension may write it: its own directory only. */
  private func writable(_ path: String) -> URL? {
    guard path == Self.ownDirectory || path.hasPrefix(Self.ownDirectory + "/") else { return nil }
    return resolve(path)
  }

  private func makeFiles(in context: JSContext) -> JSValue {
    let files = JSValue(newObjectIn: context)!
    let manager = FileManager.default
    let exists: @convention(block) (String) -> Bool = { [weak self] path in
      guard let url = self?.resolve(path) else { return false }
      return manager.fileExists(atPath: url.path)
    }
    let isDirectory: @convention(block) (String) -> Bool = { [weak self] path in
      guard let url = self?.resolve(path) else { return false }
      var directory: ObjCBool = false
      return manager.fileExists(atPath: url.path, isDirectory: &directory) && directory.boolValue
    }
    let read: @convention(block) (String) -> JSValue? = { [weak self] path in
      guard let self else { return nil }
      guard let url = self.resolve(path),
        let size = (try? manager.attributesOfItem(atPath: url.path))?[.size] as? Int,
        size <= Self.maxBodyBytes,
        let text = try? String(contentsOf: url, encoding: .utf8)
      else {
        self.fail("No file to read at \(path)")
        return nil
      }
      return self.textOrNull(text)
    }
    let write: @convention(block) (String, String) -> Void = { [weak self] path, text in
      guard let self else { return }
      guard let url = self.writable(path) else { return self.fail("Not the extension's: \(path)") }
      do {
        try Data(text.utf8).write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
      } catch {
        self.fail("Not written: \(path)")
      }
    }
    let move: @convention(block) (String, String, Bool) -> Void = { [weak self] from, to, overwrite in
      guard let self else { return }
      guard let source = self.writable(from), let target = self.writable(to) else {
        return self.fail("Not the extension's: \(from) → \(to)")
      }
      do {
        if manager.fileExists(atPath: target.path) {
          guard overwrite else { return self.fail("\(to) exists") }
          _ = try manager.replaceItemAt(target, withItemAt: source)
        } else {
          try manager.moveItem(at: source, to: target)
        }
      } catch {
        self.fail("Not moved: \(from)")
      }
    }
    let makeDirectory: @convention(block) (String) -> Void = { [weak self] path in
      guard let self else { return }
      guard let url = self.writable(path) else { return self.fail("Not the extension's: \(path)") }
      do {
        try manager.createDirectory(at: url, withIntermediateDirectories: true)
      } catch {
        self.fail("Not made: \(path)")
      }
    }
    let remove: @convention(block) (String) -> Void = { [weak self] path in
      guard let self else { return }
      guard let url = self.writable(path) else { return self.fail("Not the extension's: \(path)") }
      do {
        try manager.removeItem(at: url)
      } catch {
        self.fail("Not removed: \(path)")
      }
    }
    let members: [String: Any] = [
      "exists": exists, "isDirectory": isDirectory, "read": read, "write": write, "move": move,
      "makeDirectory": makeDirectory, "remove": remove
    ]
    for (name, block) in members {
      files.setObject(block, forKeyedSubscript: name as NSString)
    }
    return files
  }
}
