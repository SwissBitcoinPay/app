import Darwin
import Foundation
import Security
import os

/*
 * What the probe needs of iOS (CardProbe.swift, ProbePlatform): the container and the keychain
 * group shared with the app, and the process's memory. Apple's APIs only, checked against their
 * documentation: this file is not compiled outside Xcode.
 */
final class DarwinProbePlatform: ProbePlatform {
  /** The app group shared with the app, written in the extension's Info.plist by the plugin. */
  static let appGroupKey = "SattlemeAppGroup"
  /**
   * As the app writes the test seed with expo-secure-store 57 (extension-probe.ts): its service
   * with the ":no-auth" suffix expo-secure-store adds to an item without authentication, and its
   * key as both account and generic attribute (SecureStoreModule.swift, `query(with:)`).
   */
  static let keychainService = "card-probe:no-auth"
  static let seedKey = "probe-seed"

  let container: URL
  let device: String
  let system: String
  private let group: String

  /**
   * The app group shared with the app and its container; nil when the extension has no app group,
   * or the system gives no container for it.
   */
  static func shared() -> (group: String, container: URL)? {
    guard let group = Bundle.main.object(forInfoDictionaryKey: appGroupKey) as? String,
      !group.isEmpty,
      let container = FileManager.default.containerURL(
        forSecurityApplicationGroupIdentifier: group
      )
    else { return nil }
    return (group, container)
  }

  /** Nil when the extension has no app group, or the system gives no container for it. */
  init?() {
    guard let shared = Self.shared() else { return nil }
    self.group = shared.group
    self.container = shared.container
    var info = utsname()
    uname(&info)
    device = withUnsafeBytes(of: &info.machine) { raw in
      String(decoding: raw.prefix { $0 != 0 }, as: UTF8.self)
    }
    let version = ProcessInfo.processInfo.operatingSystemVersion
    system = "\(version.majorVersion).\(version.minorVersion).\(version.patchVersion)"
  }

  /**
   * The seed, 32 bytes in hex. An app group's name is also a keychain access group the app and
   * the extension share, without the team's prefix (Apple, "Sharing access to keychain items
   * among a collection of apps"). Readable once the phone was unlocked after its start
   * (AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY, set by the app).
   */
  func readSeed() throws -> Data {
    let key = Data(Self.seedKey.utf8)
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: Self.keychainService,
      kSecAttrGeneric as String: key,
      kSecAttrAccount as String: key,
      kSecAttrAccessGroup as String: group,
      kSecMatchLimit as String: kSecMatchLimitOne,
      kSecReturnData as String: true
    ]
    var item: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &item)
    guard status == errSecSuccess, let data = item as? Data,
      let hex = String(data: data, encoding: .utf8)
    else { throw ProbeError.noSeed }
    guard let seed = Data(hex: hex), seed.count == 32 else { throw ProbeError.badSeed }
    return seed
  }

  func runEngine(step: @escaping (String) -> Void) throws -> String {
    try EngineHost.runProbe(step: step)
  }

  /** Within the extension's 30 seconds, a margin kept for the record and the notification. */
  func runRuntime(step: @escaping (String) -> Void) async throws -> String {
    try await EngineRuntime.runProbe(group: group, container: container, timeout: 25, step: step)
  }

  /** Within the extension's 30 seconds, a margin kept for the record and the notification. */
  func runWalletProbe(
    seed: Data,
    invoice: String,
    run: String,
    maxSendSats: UInt64,
    step: @escaping (String) -> Void
  ) async throws -> String {
    try await EngineRuntime.runWalletProbe(
      group: group,
      container: container,
      seed: seed,
      invoice: invoice,
      run: run,
      maxSendSats: maxSendSats,
      timeout: 25,
      step: step
    )
  }

  /**
   * The footprint Xcode's memory gauge shows (`phys_footprint`, what the system's memory limit
   * counts), and what the process may still use before the system ends it
   * (`os_proc_available_memory`, iOS 13 and later).
   */
  func memory() -> ProbeMemory {
    var info = task_vm_info_data_t()
    var count = mach_msg_type_number_t(
      MemoryLayout<task_vm_info_data_t>.size / MemoryLayout<integer_t>.size
    )
    let result = withUnsafeMutablePointer(to: &info) { pointer in
      pointer.withMemoryRebound(to: integer_t.self, capacity: Int(count)) { raw in
        task_info(mach_task_self_, task_flavor_t(TASK_VM_INFO), raw, &count)
      }
    }
    let footprint = result == KERN_SUCCESS ? UInt64(info.phys_footprint) : 0
    return ProbeMemory(
      footprintBytes: footprint,
      availableBytes: UInt64(os_proc_available_memory())
    )
  }
}
