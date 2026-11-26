import Foundation
import JavaScriptCore
import Security

/*
 * The extension's JavaScript engine: JavaScriptCore, the system's, running the app's own
 * TypeScript bundled into the extension at prebuild (engine.js, scripts/extension-engine.js,
 * src/lib/engine/). The bundle reads what the extension gives it as `globalThis.__sattlemeHost`
 * (src/lib/engine/host.ts): random bytes from SecRandomCopyBytes, and a step recorder. An
 * extension's JavaScriptCore has no JIT: the probe measures what that costs. Apple's APIs only,
 * checked against their documentation: this file is not compiled outside Xcode.
 */
enum EngineError: Error, CustomStringConvertible {
  case noBundle
  case noContext
  case script(String)
  case noEntry
  case badResult

  var description: String {
    switch self {
    case .noBundle: return "no engine.js in the extension"
    case .noContext: return "no JavaScript context"
    case let .script(message): return "engine: \(message.prefix(300))"
    case .noEntry: return "the engine has no sattlemeEngineProbe"
    case .badResult: return "the engine's result is not a text"
    }
  }
}

enum EngineHost {
  /** The most random bytes the engine gets at once (src/lib/random.engine.ts asks no more). */
  static let maxRandomBytes = 65_536

  /** A step's name as the engine gives it: a few ASCII letters and digits. */
  static func isStepName(_ name: String) -> Bool {
    !name.isEmpty && name.count <= 32
      && name.unicodeScalars.allSatisfy { $0.isASCII && CharacterSet.alphanumerics.contains($0) }
  }

  /**
   * Loads the engine and runs its probe (`sattlemeEngineProbe()`), on the calling thread;
   * `step` records each step it names, and "load" once the bundle ran. Its result, a JSON text.
   */
  static func runProbe(step: @escaping (String) -> Void) throws -> String {
    guard let url = Bundle.main.url(forResource: "engine", withExtension: "js"),
      let script = try? String(contentsOf: url, encoding: .utf8)
    else { throw EngineError.noBundle }
    guard let context = JSContext() else { throw EngineError.noContext }
    var thrown: String?
    context.exceptionHandler = { _, exception in
      thrown = exception?.toString() ?? "an exception"
    }
    let random: @convention(block) (Int) -> [NSNumber] = { length in
      guard length >= 0, length <= maxRandomBytes else { return [] }
      var bytes = [UInt8](repeating: 0, count: length)
      guard length == 0 || SecRandomCopyBytes(kSecRandomDefault, length, &bytes) == errSecSuccess
      else { return [] }
      return bytes.map { NSNumber(value: $0) }
    }
    let record: @convention(block) (String) -> Void = { name in
      if isStepName(name) { step(name) }
    }
    guard let host = JSValue(newObjectIn: context) else { throw EngineError.noContext }
    host.setObject(random, forKeyedSubscript: "random" as NSString)
    host.setObject(record, forKeyedSubscript: "step" as NSString)
    context.setObject(host, forKeyedSubscript: "__sattlemeHost" as NSString)
    _ = context.evaluateScript(script, withSourceURL: url)
    if let thrown { throw EngineError.script(thrown) }
    step("load")
    guard let entry = context.objectForKeyedSubscript("sattlemeEngineProbe"),
      entry.isObject
    else { throw EngineError.noEntry }
    let result = entry.call(withArguments: [])
    if let thrown { throw EngineError.script(thrown) }
    guard let result, result.isString, let text = result.toString() else {
      throw EngineError.badResult
    }
    return text
  }
}
