import BigNumber
import BreezSdkSpark
import Foundation

/*
 * The Breez SDK the engine's host gives the app's TypeScript (src/lib/engine/host.ts, HostBreez;
 * src/lib/engine/wallet.ts): a card's wallet, connected for a payment, on the extension's own
 * storage. Its answers are what the engine reads (HostParsed, HostQuote, HostPayment): plain
 * values, numbers as decimal text.
 *
 * Connected with the app's settings of a card's wallet (src/lib/breez/wallet.ts, createConfig) but
 * these, so that the extension reaches no third party the app does not:
 * - no chain service: each of its calls fails as a connectivity failure (NoChainService). A card
 *   payment is a Lightning payment, which needs none; the SDK's own default would ask
 *   blockstream.info as its fallback;
 * - deposits never claimed (`maxDepositClaimFee` unset: "Unset disables claiming rather than
 *   allowing any fee", spark-sdk 0.28.4): the app claims them;
 * - no external input parser: an input is only ever parsed by the SDK itself.
 *
 * Kept free of JavaScriptCore (EngineRuntime.swift bridges it): this file is type-checked against
 * the Breez SDK's Swift bindings on Linux.
 */

enum EngineWalletError: Error, CustomStringConvertible {
  case noApiKey
  case badNetwork
  case badStorage
  case badSeed
  case noInstance
  case noQuote
  case notLightning
  case overBound

  var description: String {
    switch self {
    case .noApiKey: return "no Breez API key in the extension"
    case .badNetwork: return "no Breez network in the extension"
    case .badStorage: return "not a storage of the extension"
    case .badSeed: return "not a wallet's words"
    case .noInstance: return "no such wallet connected"
    case .noQuote: return "no such payment prepared"
    case .notLightning: return "not a payment of sats over Lightning"
    case .overBound: return "over what this run may send"
    }
  }
}

/** The SDK's chain service in the extension: none (see above). */
final class NoChainService: BitcoinChainService, @unchecked Sendable {
  private func none() -> ChainServiceError {
    ChainServiceError.ServiceConnectivity("No chain service in the extension")
  }

  func getAddressUtxos(address: String) async throws -> [Utxo] { throw none() }
  func getAddressTxos(address: String) async throws -> [Utxo] { throw none() }
  func getTransactionStatus(txid: String) async throws -> TxStatus { throw none() }
  func tipHeight() async throws -> UInt32 { throw none() }
  func getTransactionHex(txid: String) async throws -> String { throw none() }
  func getOutspend(txid: String, vout: UInt32) async throws -> Outspend { throw none() }
  func broadcastTransaction(tx: String) async throws { throw none() }
  func recommendedFees() async throws -> RecommendedFees { throw none() }
}

/** Calls `synced` at each `Synced` event of an instance. */
final class SyncedListener: EventListener, @unchecked Sendable {
  private let synced: @Sendable () -> Void

  init(synced: @escaping @Sendable () -> Void) {
    self.synced = synced
  }

  func onEvent(event: SdkEvent) async {
    if case .synced = event { synced() }
  }
}

actor EngineWallets {
  /** The SDK's storages, below the extension's own directory (EngineRuntime.ownDirectory). */
  static let storageDirectory = "breez"
  /** A storage's path as the engine names it (card-wallet.ts): a few plain names. */
  static let maxStorageNames = 4

  private struct Instance {
    let sdk: BreezSdk
    var quotes: [String: PrepareSendPaymentResponse] = [:]
    var nextQuote = 1
  }

  private let root: URL
  private let network: Network
  private let apiKey: String?
  /** What a payment may send at most, fee included (the probe's runs); nil: no bound. */
  private let maxSendSats: UInt64?
  private var instances: [Int: Instance] = [:]
  private var nextId = 1

  /**
   * `container` is the app group's; `settings` the build's (EngineRuntime.configKey): its
   * `breezNetwork` and `breezApiKey`.
   */
  init(container: URL, settings: [String: Any], maxSendSats: UInt64? = nil) throws {
    switch settings["breezNetwork"] as? String {
    case "mainnet": network = .mainnet
    case "regtest": network = .regtest
    default: throw EngineWalletError.badNetwork
    }
    let key = settings["breezApiKey"] as? String
    apiKey = key?.isEmpty == false ? key : nil
    root = container.appendingPathComponent("extension", isDirectory: true)
      .appendingPathComponent(Self.storageDirectory, isDirectory: true)
    self.maxSendSats = maxSendSats
  }

  /** `path` below the SDK's storages: plain names only (letters, digits, ".", "-", "_"). */
  static func isStoragePath(_ path: String) -> Bool {
    let names = path.split(separator: "/", omittingEmptySubsequences: false)
    let allowed = CharacterSet(
      charactersIn: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._-"
    )
    return !names.isEmpty && names.count <= maxStorageNames
      && names.allSatisfy { name in
        !name.isEmpty && name.count <= 64 && name != "." && name != ".."
          && name.unicodeScalars.allSatisfy { allowed.contains($0) }
      }
  }

  /** BIP-39 words as the engine gives them (keys.ts, walletPhraseOf): 12 or 24 lowercase words. */
  static func isMnemonic(_ text: String) -> Bool {
    let words = text.split(separator: " ", omittingEmptySubsequences: false)
    return (words.count == 12 || words.count == 24)
      && words.allSatisfy { word in
        !word.isEmpty && word.count <= 8 && word.unicodeScalars.allSatisfy { $0.properties.isLowercase && $0.isASCII }
      }
  }

  /** Connects the wallet of `seed` on the storage `storage`; its id. */
  func connect(seed: Seed, storage: String, synced: @escaping @Sendable () -> Void) async throws -> Int {
    guard Self.isStoragePath(storage) else { throw EngineWalletError.badStorage }
    if network == .mainnet && apiKey == nil { throw EngineWalletError.noApiKey }
    let directory = storage.split(separator: "/").reduce(root) {
      $0.appendingPathComponent(String($1), isDirectory: true)
    }
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    var config = defaultConfig(network: network)
    config.apiKey = apiKey
    config.maxDepositClaimFee = nil
    config.watchtowerFeeLadderEnabled = true
    config.externalInputParsers = nil
    config.useDefaultExternalInputParsers = false
    let builder = SdkBuilder(config: config, seed: seed)
    await builder.withDefaultStorage(storageDir: directory.path)
    await builder.withChainService(chainService: NoChainService())
    let sdk = try await builder.build()
    // At once: its first sync may end as soon as it is built (wallet.ts does the same).
    _ = await sdk.addEventListener(listener: SyncedListener(synced: synced))
    let id = nextId
    nextId += 1
    instances[id] = Instance(sdk: sdk)
    return id
  }

  func connect(mnemonic: String, storage: String, synced: @escaping @Sendable () -> Void)
    async throws -> Int
  {
    guard Self.isMnemonic(mnemonic) else { throw EngineWalletError.badSeed }
    return try await connect(
      seed: .mnemonic(mnemonic: mnemonic, passphrase: nil),
      storage: storage,
      synced: synced
    )
  }

  /** Connects the probe's test wallet, of the seed `seed` (CardProbe.swift's own). */
  func connectProbe(seed: Data, storage: String, synced: @escaping @Sendable () -> Void)
    async throws -> Int
  {
    try await connect(seed: .entropy(seed), storage: storage, synced: synced)
  }

  private func instance(_ id: Int) throws -> Instance {
    guard let instance = instances[id] else { throw EngineWalletError.noInstance }
    return instance
  }

  /** Disconnects it; it stays until released (the engine releases it once no call uses it). */
  func disconnect(id: Int) async throws -> Bool {
    try await instance(id).sdk.disconnect()
    return true
  }

  /** Lets it go: the SDK's object, which holds the wallet's keys, with it. */
  func release(id: Int) {
    instances.removeValue(forKey: id)
  }

  /** Disconnects and lets go every instance left (the runtime ends). */
  func closeAll() async {
    let left = instances.values.map(\.sdk)
    instances.removeAll()
    for sdk in left { try? await sdk.disconnect() }
  }

  func info(id: Int, ensureSynced: Bool) async throws -> [String: Any] {
    let info = try await instance(id).sdk.getInfo(request: GetInfoRequest(ensureSynced: ensureSynced))
    return ["identityPubkey": info.identityPubkey, "balanceSats": String(info.balanceSats)]
  }

  /** What the SDK read of `input` (HostParsed): a Lightning invoice, or another input. */
  func parse(id: Int, input: String) async throws -> [String: Any] {
    let parsed = try await instance(id).sdk.parse(input: input)
    guard case let .bolt11Invoice(details) = parsed else { return ["tag": "other"] }
    return Self.bolt11(details)
  }

  static func bolt11(_ details: Bolt11InvoiceDetails) -> [String: Any] {
    [
      "tag": "bolt11",
      "bolt11": details.invoice.bolt11,
      "network": details.network == .bitcoin
        ? "bitcoin" : details.network == .regtest ? "regtest" : "other",
      "amountMsat": details.amountMsat.map { String($0) as Any } ?? NSNull(),
      "timestamp": String(details.timestamp),
      "expiry": String(details.expiry),
      "description": details.description.map { $0 as Any } ?? NSNull()
    ]
  }

  /** Prepares the payment of `bolt11`, kept for `send` (HostQuote). */
  func prepareBolt11(id: Int, bolt11: String) async throws -> [String: Any] {
    var held = try instance(id)
    let prepared = try await held.sdk.prepareSendPayment(
      request: PrepareSendPaymentRequest(paymentRequest: .input(input: bolt11))
    )
    // Sats over Lightning only: neither a token nor a conversion.
    var method = "other"
    var lightningFee: UInt64 = 0
    if prepared.tokenIdentifier == nil, prepared.conversionEstimate == nil,
      case let .bolt11Invoice(_, _, lightningFeeSats) = prepared.paymentMethod
    {
      method = "bolt11"
      lightningFee = lightningFeeSats
    }
    // Read again: another call may have changed it while this one waited.
    held = try instance(id)
    let quoteId = "quote-\(held.nextQuote)"
    held.nextQuote += 1
    held.quotes[quoteId] = prepared
    instances[id] = held
    return [
      "quoteId": quoteId,
      "amountSats": prepared.amount.description,
      "method": method,
      "lightningFeeSats": String(lightningFee),
      "feesExcluded": prepared.feePolicy == .feesExcluded
    ]
  }

  /** Pays the quote `quoteId` over Lightning (HostPayment). */
  func send(
    id: Int,
    quoteId: String,
    idempotencyKey: String,
    untilSent: Bool,
    completionTimeoutSecs: UInt32
  ) async throws -> [String: Any] {
    let held = try instance(id)
    guard let prepared = held.quotes[quoteId] else { throw EngineWalletError.noQuote }
    // Sats over Lightning only, as prepareBolt11 tells it.
    guard prepared.tokenIdentifier == nil, prepared.conversionEstimate == nil,
      case let .bolt11Invoice(_, _, lightningFeeSats) = prepared.paymentMethod
    else { throw EngineWalletError.notLightning }
    if let maxSendSats,
      prepared.amount + BInt(Int(lightningFeeSats)) > BInt(Int(maxSendSats))
    {
      throw EngineWalletError.overBound
    }
    let sent = try await held.sdk.sendPayment(
      request: SendPaymentRequest(
        prepareResponse: prepared,
        options: .bolt11Invoice(
          preferSpark: false,
          completionTimeoutSecs: untilSent ? nil : completionTimeoutSecs
        ),
        idempotencyKey: idempotencyKey
      )
    )
    return Self.payment(sent.payment)
  }

  func getPayment(id: Int, paymentId: String) async throws -> [String: Any] {
    let found = try await instance(id).sdk.getPayment(request: GetPaymentRequest(paymentId: paymentId))
    return Self.payment(found.payment)
  }

  /** `payment` as the engine reads it (HostPayment; wallet.ts reads the SDK's the same way). */
  static func payment(_ payment: Payment) -> [String: Any] {
    let method: String
    switch payment.method {
    case .lightning: method = "lightning"
    case .spark: method = "spark"
    case .token: method = "token"
    case .deposit: method = "deposit"
    case .withdraw: method = "withdraw"
    case .unknown: method = "unknown"
    }
    let status: String
    switch payment.status {
    case .completed: status = "completed"
    case .failed: status = "failed"
    case .pending: status = "pending"
    }
    let optional = { (text: String?) -> Any in text.map { $0 as Any } ?? NSNull() }
    let details: Any
    switch payment.details {
    case .none:
      details = NSNull()
    case let .lightning(description, _, _, htlcDetails, lnurlPayInfo, _, lnurlReceiveMetadata, _):
      details = [
        "tag": "lightning",
        "description": optional(description),
        "lnAddress": optional(lnurlPayInfo?.lnAddress),
        "senderComment": optional(lnurlReceiveMetadata?.senderComment),
        "paymentHash": htlcDetails.paymentHash,
        "preimage": optional(htlcDetails.preimage)
      ] as [String: Any]
    case let .spark(invoiceDetails, _, _):
      details = ["tag": "spark", "invoiceDescription": optional(invoiceDetails?.description)]
    case let .deposit(txId, _):
      details = ["tag": "deposit", "txId": txId]
    case let .withdraw(txId, _, _):
      details = ["tag": "withdraw", "txId": txId]
    case .token:
      details = ["tag": "token"]
    }
    return [
      "id": payment.id,
      "type": payment.paymentType == .send ? "send" : "receive",
      "status": status,
      "amount": payment.amount.description,
      "fees": payment.fees.description,
      "timestamp": String(payment.timestamp),
      "method": method,
      "details": details
    ]
  }
}
