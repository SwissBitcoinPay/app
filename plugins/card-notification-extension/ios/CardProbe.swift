import BigNumber
import BreezSdkSpark
import Foundation

/*
 * The measurement of the iOS notification service extension: can it start
 * a Breez wallet, sync it and pay an invoice within the extension's memory and its ~30 seconds,
 * the way a card payment would with the app closed? The app sends itself a notification
 * (src/features/settings/extension-probe.ts) whose data asks for a probe; this runs it on a test
 * wallet whose seed the app put in the keychain group it shares with the extension, and records
 * each step (time, memory footprint, memory still available) in the shared container, after each
 * step: a run the system kills for its memory leaves its last step recorded. Never the account's
 * wallet: the test wallet holds a few sats only.
 *
 * Kept free of UserNotifications, Security and Darwin calls (ProbePlatform): this file is
 * type-checked against the Breez SDK's Swift bindings on Linux.
 */

/** What the probe needs of the system, given by the extension (DarwinProbePlatform). */
protocol ProbePlatform: AnyObject {
  /** The container shared with the app (its app group). */
  var container: URL { get }
  /** The device's model identifier ("iPhone16,1") and the system's version ("18.4.1"). */
  var device: String { get }
  var system: String { get }
  /** The test wallet's seed, from the keychain group shared with the app. */
  func readSeed() throws -> Data
  /**
   * The process's memory footprint and what it may still use before the system ends it (0 when
   * the system does not say).
   */
  func memory() -> ProbeMemory
  /**
   * Runs the extension's JavaScript engine's probe (EngineHost.swift), `step` called at each of
   * its steps; its result, a JSON text.
   */
  func runEngine(step: @escaping (String) -> Void) throws -> String
  /**
   * Runs the engine's runtime probe (EngineRuntime.swift, src/lib/engine/runtime-probe.ts), `step`
   * called at each of its steps; its result, a JSON text.
   */
  func runRuntime(step: @escaping (String) -> Void) async throws -> String
  /**
   * Runs the engine's wallet probe (EngineRuntime.swift, src/lib/engine/wallet-probe.ts): the test
   * wallet of `seed` connected through the engine, `invoice` paid, `maxSendSats` at most, fee
   * included, `run` its idempotency key; `step` called at each of its steps; its result, a JSON text.
   */
  func runWalletProbe(
    seed: Data,
    invoice: String,
    run: String,
    maxSendSats: UInt64,
    step: @escaping (String) -> Void
  ) async throws -> String
}

struct ProbeMemory {
  let footprintBytes: UInt64
  let availableBytes: UInt64
}

/** What a probe notification asks: the data the app joins to it (`body` of Expo's payload). */
struct ProbeRequest {
  enum Mode: String {
    /** Connect, sync, read the balance. */
    case sync
    /** The same, then an invoice of 100 sats to fund the test wallet. */
    case receive
    /** The same, then pay the invoice of the notification (1 sat to the account's address). */
    case pay
    /**
     * No wallet: the app's own code of a card payment run in the extension's JavaScriptCore
     * (EngineHost.swift, src/lib/engine/probe.ts), each of its steps recorded.
     */
    case engine
    /**
     * No wallet: the engine's runtime (EngineRuntime.swift, src/lib/engine/runtime-probe.ts), a
     * timer, HTTPS, a Nostr read, the card data the app shares, a URL, each recorded.
     */
    case runtime
    /**
     * The test wallet connected through the engine's wallet (EngineWallet.swift,
     * src/lib/engine/wallet-probe.ts), as a card's wallet would be, then the invoice of the
     * notification paid as the card payment core pays, each step recorded.
     */
    case enginePay
  }

  enum Profile: String {
    /** Breez's configuration without background tasks (`defaultServerConfig`). */
    case light
    /** Breez's mobile configuration (`defaultConfig`), as the app uses it. */
    case standard
  }

  static let maxInvoiceLength = 2048

  let run: String
  let mode: Mode
  let profile: Profile
  let invoice: String?

  init?(body: [String: Any]) {
    guard let version = body["sattlemeProbe"] as? Int, version == 1 else { return nil }
    guard let run = body["run"] as? String, ProbeRequest.isRunId(run),
      let mode = (body["mode"] as? String).flatMap(Mode.init(rawValue:)),
      let profile = (body["profile"] as? String).flatMap(Profile.init(rawValue:))
    else { return nil }
    let invoice = body["invoice"] as? String
    let pays = mode == .pay || mode == .enginePay
    if pays {
      guard let invoice, !invoice.isEmpty, invoice.count <= ProbeRequest.maxInvoiceLength else {
        return nil
      }
    }
    self.run = run
    self.mode = mode
    self.profile = profile
    self.invoice = pays ? invoice : nil
  }

  /** A UUID in lowercase, as the app makes it: it names the run's file. */
  static func isRunId(_ value: String) -> Bool {
    let allowed = Set("0123456789abcdef-")
    return value.count == 36 && value.allSatisfy { allowed.contains($0) }
  }
}

/**
 * Whether the app asked for this very run, a moment ago, and it has not run yet. Anyone who learns the phone's Expo push token can send it a notification
 * (Expo's push API asks no access token): only a run the app noted before sending its
 * notification (`probe/sent/<run>.json`, probe-store.ts `recordSentProbe`), of the same mode and
 * profile, runs, once (no record of it in `probe/results/` yet), within the notification's time
 * to live and a margin (the app's clock is the phone's).
 */
enum ProbeExpectation {
  /** The notification's time to live (extension-probe.ts, PROBE_TTL_SECONDS) and a margin. */
  static let maxAgeMs: Int64 = 360_000
  /** A sent record dated this far ahead of now is not one the app just wrote. */
  static let maxAheadMs: Int64 = 60_000
  /** A sent record is a few hundred bytes. */
  static let maxSentBytes = 4096

  static func isExpected(_ request: ProbeRequest, container: URL, nowMs: Int64) -> Bool {
    let probe = container.appendingPathComponent("probe", isDirectory: true)
    let result = probe.appendingPathComponent("results/\(request.run).json")
    if FileManager.default.fileExists(atPath: result.path) { return false }
    let sent = probe.appendingPathComponent("sent/\(request.run).json")
    guard let data = try? Data(contentsOf: sent), data.count <= maxSentBytes,
      let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
      (json["version"] as? Int) == 1,
      (json["run"] as? String) == request.run,
      (json["mode"] as? String) == request.mode.rawValue,
      (json["profile"] as? String) == request.profile.rawValue,
      let sentAt = (json["sentAt"] as? Int).map(Int64.init)
    else { return false }
    return sentAt <= nowMs + maxAheadMs && nowMs - sentAt <= maxAgeMs
  }
}

struct ProbeStep: Codable {
  let name: String
  /** Since the probe started. */
  let atMs: Int
  let footprintBytes: UInt64
  let availableBytes: UInt64
}

/** A run, as the app reads it (extension-probe.ts, PROBE_RECORD_VERSION). */
struct ProbeRecord: Codable {
  var version = 1
  let run: String
  let mode: String
  let profile: String
  let device: String
  let system: String
  /** Unix milliseconds. */
  let startedAt: Int64
  /**
   * 1 for the first probe since the extension's process started: iOS may keep that process for
   * the next notification, with the memory it already holds.
   */
  let processRun: Int
  var steps: [ProbeStep] = []
  /** "running" until it ends: "ok", "failed" or "expired" (the system's time ran out). */
  var outcome = "running"
  var failedStep: String?
  var error: String?
  var peakFootprintBytes: UInt64 = 0
  var minAvailableBytes: UInt64?
  /** Footprint plus what was still available, at the sample that had the least available. */
  var limitEstimateBytes: UInt64?
  var totalMs: Int?
  var balanceSats: UInt64?
  var invoice: String?
  var paymentStatus: String?
  var feeSats: String?
  /** What each step of the engine's runtime probe said ("name: detail; …"), ok or not. */
  var details: String?
}

enum ProbeError: Error, CustomStringConvertible {
  case noConfig
  case badConfig
  case noSeed
  case badSeed
  case overBound

  var description: String {
    switch self {
    case .noConfig: return "no config.json in the shared container"
    case .badConfig: return "config.json out of shape"
    case .noSeed: return "no test wallet seed in the shared keychain"
    case .badSeed: return "test wallet seed out of shape"
    case .overBound: return "the invoice is over the test's bound: not paid"
    }
  }
}

/** The run's record, changed and written in turn (the probe's task and the system's expiry). */
final class ProbeRecorder {
  /**
   * A memory sample is written only once the peak rose, or the least available memory fell, by
   * this much since the last write: a run the system ends for its memory loses at most that.
   */
  static let writeStepBytes: UInt64 = 1 << 20

  private let queue = DispatchQueue(label: "me.sattle.probe.record")
  private var record: ProbeRecord
  private let file: URL
  private let started: Date
  private var writtenPeak: UInt64 = 0
  private var writtenAvailable: UInt64?

  init(record: ProbeRecord, file: URL, started: Date) {
    self.record = record
    self.file = file
    self.started = started
  }

  func elapsedMs() -> Int {
    Int(Date().timeIntervalSince(started) * 1000)
  }

  /** Changes the record and writes it whole (atomically): the app may read it any time. */
  @discardableResult
  func update(_ change: (inout ProbeRecord) -> Void) -> ProbeRecord {
    queue.sync {
      change(&record)
      write()
      return record
    }
  }

  /** Keeps a memory sample (every 50 ms), written when it moved enough (writeStepBytes). */
  func sample(_ memory: ProbeMemory) {
    queue.sync {
      if memory.footprintBytes > record.peakFootprintBytes {
        record.peakFootprintBytes = memory.footprintBytes
      }
      // 0: the system does not say (Apple: "if the calling process isn't an app").
      if memory.availableBytes > 0,
        record.minAvailableBytes.map({ memory.availableBytes < $0 }) ?? true
      {
        record.minAvailableBytes = memory.availableBytes
        record.limitEstimateBytes = memory.footprintBytes + memory.availableBytes
      }
      let rose = record.peakFootprintBytes >= writtenPeak + Self.writeStepBytes
      let fell =
        record.minAvailableBytes.map { least in
          writtenAvailable.map { least + Self.writeStepBytes <= $0 } ?? true
        } ?? false
      if rose || fell { write() }
    }
  }

  /** On the queue only. */
  private func write() {
    writtenPeak = record.peakFootprintBytes
    writtenAvailable = record.minAvailableBytes
    if let data = try? JSONEncoder().encode(record) {
      try? data.write(to: file, options: .atomic)
    }
  }
}

final class CardProbe {
  /** How often memory is sampled while the probe runs. */
  static let sampleIntervalMs = 50
  static let receiveSats: UInt64 = 100
  /**
   * What a payment test may send at most, and its Lightning fee at most: the app asks for 1 sat, up to 10 when the address's smallest is more
   * (extension-probe.ts, PROBE_MAX_PAY_SATS).
   */
  static let maxPaySats: UInt64 = 10
  static let maxPayFeeSats: UInt64 = 10

  /**
   * Whether a prepared payment is one the test may send: a Lightning invoice of a fixed amount of
   * sats, neither a token nor a conversion, within maxPaySats and maxPayFeeSats.
   */
  static func isWithinPayBound(_ prepared: PrepareSendPaymentResponse) -> Bool {
    guard prepared.tokenIdentifier == nil, prepared.conversionEstimate == nil,
      case let .bolt11Invoice(details, sparkTransferFeeSats, lightningFeeSats) =
        prepared.paymentMethod,
      let amountMsat = details.amountMsat, amountMsat > 0, amountMsat <= maxPaySats * 1000,
      lightningFeeSats <= maxPayFeeSats,
      (sparkTransferFeeSats ?? 0) <= maxPayFeeSats
    else { return false }
    return prepared.amount <= BInt(Int(maxPaySats))
  }

  private static let runsLock = NSLock()
  private static var runs = 0

  /** Counts the probes of this process (ProbeRecord.processRun). */
  private static func nextRun() -> Int {
    runsLock.lock()
    defer { runsLock.unlock() }
    runs += 1
    return runs
  }

  private let request: ProbeRequest
  private let platform: ProbePlatform
  private let recorder: ProbeRecorder
  private let sampler: DispatchSourceTimer

  /** Nil when the shared container cannot hold the record. */
  init?(request: ProbeRequest, platform: ProbePlatform) {
    self.request = request
    self.platform = platform
    let results = platform.container.appendingPathComponent("probe/results", isDirectory: true)
    do {
      try FileManager.default.createDirectory(at: results, withIntermediateDirectories: true)
    } catch {
      return nil
    }
    let started = Date()
    recorder = ProbeRecorder(
      record: ProbeRecord(
        run: request.run,
        mode: request.mode.rawValue,
        profile: request.profile.rawValue,
        device: platform.device,
        system: platform.system,
        startedAt: Int64(started.timeIntervalSince1970 * 1000),
        processRun: CardProbe.nextRun()
      ),
      file: results.appendingPathComponent("\(request.run).json"),
      started: started
    )
    sampler = DispatchSource.makeTimerSource(queue: DispatchQueue.global(qos: .utility))
  }

  /** Runs the probe; never throws: a failure is in the record. */
  func run() async -> ProbeRecord {
    let recorder = self.recorder
    let platform = self.platform
    sampler.schedule(
      deadline: .now(),
      repeating: .milliseconds(CardProbe.sampleIntervalMs)
    )
    sampler.setEventHandler { recorder.sample(platform.memory()) }
    sampler.resume()
    defer { sampler.cancel() }
    mark("start")
    if request.mode == .engine {
      do {
        _ = try platform.runEngine { [weak self] name in self?.mark(name) }
        return finish(outcome: "ok", step: nil, error: nil)
      } catch {
        // The steps recorded say how far it went.
        return finish(outcome: "failed", step: "engine", error: String(describing: error))
      }
    }
    if request.mode == .runtime || request.mode == .enginePay {
      do {
        let result: String
        if request.mode == .enginePay {
          let seed = try platform.readSeed()
          mark("keychain")
          result = try await platform.runWalletProbe(
            seed: seed,
            invoice: request.invoice ?? "",
            run: request.run,
            maxSendSats: CardProbe.maxPaySats + CardProbe.maxPayFeeSats
          ) { [weak self] name in self?.mark(name) }
        } else {
          result = try await platform.runRuntime { [weak self] name in self?.mark(name) }
        }
        guard let steps = RuntimeProbeResult.steps(result) else {
          return finish(
            outcome: "failed", step: request.mode.rawValue, error: "Out of shape: \(result)")
        }
        let details = steps.map { "\($0.name): \($0.detail)" }.joined(separator: "; ")
        // Bounded: a step's detail may carry a long text.
        _ = recorder.update { $0.details = String(details.prefix(500)) }
        let failures = steps.filter { !$0.ok }
        guard let first = failures.first else { return finish(outcome: "ok", step: nil, error: nil) }
        let error = failures.map { "\($0.name): \($0.detail)" }.joined(separator: "; ")
        return finish(outcome: "failed", step: first.name, error: error)
      } catch {
        return finish(
          outcome: "failed", step: request.mode.rawValue, error: String(describing: error))
      }
    }
    var current = "keychain"
    do {
      let seed = try platform.readSeed()
      mark(current)
      current = "config"
      let apiKey = try readApiKey()
      mark(current)
      var config =
        request.profile == .light
        ? defaultServerConfig(network: .mainnet) : defaultConfig(network: .mainnet)
      config.apiKey = apiKey
      let storage = platform.container.appendingPathComponent(
        "probe/breez-\(request.profile.rawValue)",
        isDirectory: true
      )
      try FileManager.default.createDirectory(at: storage, withIntermediateDirectories: true)
      current = "connect"
      let sdk = try await connect(
        request: ConnectRequest(config: config, seed: .entropy(seed), storageDir: storage.path)
      )
      mark(current)
      do {
        current = "sync"
        _ = try await sdk.syncWallet(request: SyncWalletRequest())
        mark(current)
        current = "info"
        let info = try await sdk.getInfo(request: GetInfoRequest(ensureSynced: false))
        recorder.update { $0.balanceSats = info.balanceSats }
        mark(current)
        switch request.mode {
        case .sync, .engine, .runtime, .enginePay:
          break
        case .receive:
          current = "receive"
          let received = try await sdk.receivePayment(
            request: ReceivePaymentRequest(
              paymentMethod: .bolt11Invoice(
                description: "Test extension sattle.me",
                amountSats: CardProbe.receiveSats,
                expirySecs: 3600,
                paymentHash: nil,
                receiverIdentityPublicKey: nil,
                preimage: nil
              )
            )
          )
          recorder.update { $0.invoice = received.paymentRequest }
          mark(current)
        case .pay:
          current = "prepare"
          let prepared = try await sdk.prepareSendPayment(
            request: PrepareSendPaymentRequest(paymentRequest: .input(input: request.invoice ?? ""))
          )
          mark(current)
          current = "bound"
          guard CardProbe.isWithinPayBound(prepared) else { throw ProbeError.overBound }
          mark(current)
          current = "send"
          // As the app's card payments: over Lightning, back as soon as it has left.
          let sent = try await sdk.sendPayment(
            request: SendPaymentRequest(
              prepareResponse: prepared,
              options: .bolt11Invoice(preferSpark: false, completionTimeoutSecs: nil),
              idempotencyKey: request.run
            )
          )
          recorder.update {
            $0.paymentStatus = String(describing: sent.payment.status)
            $0.feeSats = sent.payment.fees.description
          }
          mark(current)
        }
      } catch {
        try? await sdk.disconnect()
        throw error
      }
      current = "disconnect"
      try await sdk.disconnect()
      mark(current)
      return finish(outcome: "ok", step: nil, error: nil)
    } catch {
      return finish(outcome: "failed", step: current, error: String(describing: error))
    }
  }

  /** The system's time ran out (serviceExtensionTimeWillExpire): the record says so at once. */
  func expire() -> ProbeRecord {
    let record = recorder.update { record in
      guard record.outcome == "running" else { return }
      record.outcome = "expired"
      record.failedStep = record.steps.last?.name
    }
    return finish(outcome: record.outcome, step: record.failedStep, error: record.error)
  }

  private func mark(_ name: String) {
    let memory = platform.memory()
    recorder.sample(memory)
    let atMs = recorder.elapsedMs()
    recorder.update {
      $0.steps.append(
        ProbeStep(
          name: name,
          atMs: atMs,
          footprintBytes: memory.footprintBytes,
          availableBytes: memory.availableBytes
        )
      )
    }
  }

  private func finish(outcome: String, step: String?, error: String?) -> ProbeRecord {
    let totalMs = recorder.elapsedMs()
    return recorder.update { record in
      // An expiry recorded first stays: what runs after it no longer counts.
      if record.outcome == "running" || record.outcome == outcome {
        record.outcome = outcome
        record.failedStep = step
        // Bounded: an SDK error may carry a long text.
        record.error = error.map { String($0.prefix(500)) }
      }
      if record.totalMs == nil { record.totalMs = totalMs }
    }
  }

  /** The Breez API key the app wrote next to the seed (it is in the app's bundle anyway). */
  private func readApiKey() throws -> String {
    let file = platform.container.appendingPathComponent("probe/config.json")
    guard let data = try? Data(contentsOf: file) else { throw ProbeError.noConfig }
    guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
      (json["version"] as? Int) == 1,
      let apiKey = json["apiKey"] as? String, !apiKey.isEmpty, apiKey.count <= 4096
    else { throw ProbeError.badConfig }
    return apiKey
  }
}

/** The result of the engine's runtime probe (src/lib/engine/runtime-probe.ts). */
enum RuntimeProbeResult {
  /** Its steps, with what each said; nil when it is out of shape. */
  static func steps(_ json: String) -> [(name: String, ok: Bool, detail: String)]? {
    guard let object = try? JSONSerialization.jsonObject(with: Data(json.utf8)) as? [String: Any]
    else { return nil }
    if let error = object["error"] as? String { return [(name: "runtime", ok: false, detail: error)] }
    guard let steps = object["steps"] as? [[String: Any]], !steps.isEmpty else { return nil }
    var read: [(name: String, ok: Bool, detail: String)] = []
    for step in steps {
      guard let name = step["name"] as? String, let ok = step["ok"] as? Bool,
        let detail = step["detail"] as? String
      else { return nil }
      read.append((name: name, ok: ok, detail: detail))
    }
    return read
  }
}

extension Data {
  /** Bytes of a hex string (either case), nil when it is not one. */
  init?(hex: String) {
    guard hex.count % 2 == 0 else { return nil }
    var bytes = [UInt8]()
    bytes.reserveCapacity(hex.count / 2)
    var index = hex.startIndex
    while index < hex.endIndex {
      let next = hex.index(index, offsetBy: 2)
      guard let byte = UInt8(hex[index..<next], radix: 16) else { return nil }
      bytes.append(byte)
      index = next
    }
    self.init(bytes)
  }
}

/** What the notification says once the probe ended (a staging test). */
enum ProbeSummary {
  static func text(_ record: ProbeRecord) -> String {
    let peak = megabytes(record.peakFootprintBytes)
    let limit = record.limitEstimateBytes.map { " · limit ≈ \(megabytes($0))" } ?? ""
    let seconds = record.totalMs.map { String(format: " · %.1f s", Double($0) / 1000) } ?? ""
    switch record.outcome {
    case "ok":
      return "Succeeded · peak \(peak)\(limit)\(seconds)"
    case "expired":
      return "Out of time (\(record.failedStep ?? "?")) · peak \(peak)\(limit)\(seconds)"
    default:
      return "Failed (\(record.failedStep ?? "?")) · peak \(peak)\(limit)\(seconds)"
    }
  }

  static func megabytes(_ bytes: UInt64) -> String {
    String(format: "%.1f MB", Double(bytes) / 1_048_576)
  }
}
