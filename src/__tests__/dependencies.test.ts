// The dependency rules of AGENTS.md ("Commands") that `npm ls --all` cannot see: a version range
// that peers accept, but that the project's rules do not.
import packageJson from "../../package.json";

// Node's types are not loaded (tsconfig `types` only lists jest): only what this test needs.
declare const __dirname: string;
const { readFileSync, readdirSync } = jest.requireActual<{
  readFileSync(file: string, encoding: "utf8"): string;
  readdirSync(path: string): string[];
}>("fs");
const { join } = jest.requireActual<{ join(...segments: string[]): string }>("path");
const { createRequire } = jest.requireActual<{
  createRequire(file: string): { resolve(request: string): string };
}>("module");

const ROOT = join(__dirname, "..", "..");

type Manifest = { version: string; peerDependencies?: Record<string, string> };

function readManifest(file: string): Manifest {
  return JSON.parse(readFileSync(file, "utf8")) as Manifest;
}

/** "19.2" of "19.2.3" or "^19.2.0". */
function minorLine(version: string): string | undefined {
  return /(\d+\.\d+)\.\d+/.exec(version)?.[1];
}

describe("dependencies", () => {
  // The web build and the React Native build of the Breez SDK are upgraded together, each pinned
  // exactly: Breez upgrades are deliberate, reviewed changes.
  it("pins both builds of the Breez SDK to one exact version", () => {
    const { dependencies } = packageJson as { dependencies: Record<string, string> };
    const native = dependencies["@breeztech/breez-sdk-spark-react-native"];
    expect(native).toMatch(/^\d+\.\d+\.\d+$/);
    expect(dependencies["@breeztech/breez-sdk-spark"]).toBe(native);
  });

  // The v2 app's values are read with the very library that wrote them (react-native-keychain
  // 10.0.0, the v2 app's: src/lib/legacy-v2/store.ts): another version could read another layout.
  // The v2 wallet's transfer signs with @scure (src/lib/legacy-v2/wallet.ts), of the author of
  // @noble, on @noble's own version: two copies of the curves would never meet in one key.
  it("pins the v2 app's reader and the Bitcoin libraries exactly, on one @noble version", () => {
    const { dependencies } = packageJson as { dependencies: Record<string, string> };
    expect(dependencies["react-native-keychain"]).toBe("10.0.0");
    for (const name of ["@scure/bip32", "@scure/btc-signer", "@noble/curves", "@noble/hashes"]) {
      expect(dependencies[name]).toMatch(/^\d+\.\d+\.\d+$/);
    }
    for (const name of ["@scure/bip32", "@scure/btc-signer"]) {
      const manifest = readManifest(
        join(ROOT, "node_modules", name, "package.json")
      ) as Manifest & {
        dependencies?: Record<string, string>;
      };
      expect(manifest.dependencies?.["@noble/curves"]).toBe(dependencies["@noble/curves"]);
      expect(manifest.dependencies?.["@noble/hashes"]).toBe(dependencies["@noble/hashes"]);
    }
  });

  // test-renderer follows React's minor line (1.2.x: react-reconciler ~0.33.0, React 19.2). Its
  // reconciler's peer range (^19.2.0) also accepts a later React: nothing else tells that
  // test-renderer has to move with React.
  it("renders the tests with the reconciler of React's own minor version", () => {
    const testRenderer = join(ROOT, "node_modules", "test-renderer", "package.json");
    const reconciler = readManifest(
      createRequire(testRenderer).resolve("react-reconciler/package.json")
    );
    const react = readManifest(join(ROOT, "node_modules", "react", "package.json"));
    const reconcilerReact = reconciler.peerDependencies?.react ?? "";
    expect(minorLine(reconcilerReact)).toBeDefined();
    expect(minorLine(reconcilerReact)).toBe(minorLine(react.version));
  });

  // Reanimated 4.5.1, the SDK's version, dropped a settled animated value before React had it: on
  // Android, once the app came back from a system sheet ("Share"), React put the value it
  // rendered first back, and the invoice's QR, faded in from opacity 0, vanished
  // (software-mansion/react-native-reanimated#9574, #9635; fixed by #9527 in 4.5.3, on the native
  // side). Up to 4.5.5, a layout transition's last frame was dropped when it settled in the frame
  // it came: one of no length never moved its view, and a panel (Sheet, sheet-layout.ts) kept an
  // earlier frame, its content out of the screen (#10171, in 4.6.0). Expo's version check skips
  // Reanimated and its Worklets (`expo.install.exclude`) only while the SDK's versions are older:
  // once they are not, both go back to the SDK's versions, unexcluded.
  it("keeps Reanimated's fixes, excluded from Expo's check only while needed", () => {
    const excluded =
      (packageJson as { expo: { install?: { exclude?: string[] } } }).expo.install?.exclude ?? [];
    for (const [name, fixed] of [
      ["react-native-reanimated", FIXED_REANIMATED],
      ["react-native-worklets", installedVersion("react-native-worklets")]
    ] as const) {
      expect(compareVersions(installedVersion(name), fixed)).toBeGreaterThanOrEqual(0);
      if (compareVersions(bundledVersion(name), fixed) < 0) {
        expect(excluded).toContain(name);
      } else {
        expect(excluded).not.toContain(name);
      }
    }
  });

  // The web app reads barcodes with expo-camera's `barcode-detector`, whose ZXing reader loads the
  // app's own .wasm (src/features/catalog/barcode-engine.web.ts) instead of jsDelivr's: the very
  // file of the ZXing version that package was built with, else the reader fails to load. One copy
  // of the package (expo-camera's is the app's), each pinned exactly: upgraded together.
  it("serves the web app the very ZXing .wasm its barcode reader was built with", () => {
    const { dependencies } = packageJson as { dependencies: Record<string, string> };
    expect(dependencies["barcode-detector"]).toMatch(/^\d+\.\d+\.\d+$/);
    expect(dependencies["zxing-wasm"]).toMatch(/^\d+\.\d+\.\d+$/);
    expect(installedVersion("barcode-detector")).toBe(dependencies["barcode-detector"]);
    expect(installedVersion("zxing-wasm")).toBe(dependencies["zxing-wasm"]);
    // expo-camera resolves the app's copy: one ZXing module, made with the app's .wasm.
    const fromCamera = createRequire(join(ROOT, "node_modules", "expo-camera", "package.json"));
    const fromApp = createRequire(join(ROOT, "package.json"));
    expect(fromCamera.resolve("barcode-detector")).toBe(fromApp.resolve("barcode-detector"));

    const reader = jest.requireActual<{ ZXING_WASM_VERSION: string; ZXING_WASM_SHA256: string }>(
      "barcode-detector/ponyfill"
    );
    expect(reader.ZXING_WASM_VERSION).toBe(dependencies["zxing-wasm"]);
    const { createHash } = jest.requireActual<{
      createHash(algorithm: string): {
        update(data: Uint8Array): { digest(encoding: "hex"): string };
      };
    }>("crypto");
    const { readFileSync: readBytes } = jest.requireActual<{
      readFileSync(file: string): Uint8Array;
    }>("fs");
    const wasm = readBytes(
      join(ROOT, "node_modules", "zxing-wasm", "dist", "reader", "zxing_reader.wasm")
    );
    expect(createHash("sha256").update(wasm).digest("hex")).toBe(reader.ZXING_WASM_SHA256);
  });

  // Expo SDK 57's expo-modules-core accepts Worklets up to 0.10 only (an optional peer: it
  // compiles its worklets integration with them), Reanimated 4.7 needs 0.13. Its integration
  // compiles with 0.13 (checked against Worklets 0.13.0, which Expo SDK 58 ships with
  // Reanimated 4.7.1): the override lifts that range, only while it does not accept the version.
  it("lifts expo-modules-core's Worklets range only while it refuses the installed version", () => {
    const range =
      readManifest(join(ROOT, "node_modules", "expo-modules-core", "package.json"))
        .peerDependencies?.["react-native-worklets"] ?? "*";
    const overrides = (packageJson as { overrides?: Record<string, string> }).overrides ?? {};
    if (satisfies(installedVersion("react-native-worklets"), range)) {
      expect(overrides).not.toHaveProperty("react-native-worklets");
    } else {
      expect(overrides["react-native-worklets"]).toBe("$react-native-worklets");
    }
  });

  // One Node everywhere: .nvmrc for the GitHub jobs (setup-node) and nvm, eas.json for EAS Build,
  // each EAS workflow's `defaults.tools.node` for its other jobs (fingerprint, update, submit: they
  // run on the image's own Node otherwise, and eas.json's `node` does not reach them), devEngines
  // for npm itself, which refuses to install or run a script on an older Node.
  it("runs on the Node version of .nvmrc, in GitHub's jobs, EAS's jobs and npm", () => {
    const node = readFileSync(join(ROOT, ".nvmrc"), "utf8").trim();
    expect(node).toMatch(/^\d+\.\d+\.\d+$/);
    const eas = JSON.parse(readFileSync(join(ROOT, "eas.json"), "utf8")) as {
      build: { base: { node?: string } };
    };
    expect(eas.build.base.node).toBe(node);
    const workflows = readdirSync(join(ROOT, ".eas", "workflows")).filter((file) =>
      file.endsWith(".yml")
    );
    expect(workflows).toEqual(
      expect.arrayContaining(["deploy-staging.yml", "release-production.yml"])
    );
    for (const file of workflows) {
      const workflow = readFileSync(join(ROOT, ".eas", "workflows", file), "utf8");
      // Read as text: no YAML parser is a dependency of the project.
      expect([file, /^defaults:\n {2}tools:\n {4}node: "([^"\n]*)"$/m.exec(workflow)?.[1]]).toEqual(
        [file, node]
      );
    }
    expect(devEngines().runtime).toEqual({ name: "node", version: `^${node}`, onFail: "error" });
  });

  // npm 12 installs no git dependency by default (`allow-git`: none, and `root` only admits those
  // of package.json): the Breez SDK's uniffi-bindgen-react-native comes from GitHub, so npm 12
  // stops with EALLOWGIT (checked with npm 12.2.3). devEngines says so first.
  // The range keeps the npm of Node 22.22.2 (10.9.7, setup-node) and of EAS's image for that Node
  // (10.9.4, docs.expo.dev/build-reference/infrastructure): EAS Build has no field for npm.
  it("refuses an npm that would not install the lockfile's git dependencies", () => {
    const lock = JSON.parse(readFileSync(join(ROOT, "package-lock.json"), "utf8")) as {
      packages: Record<string, { resolved?: string }>;
    };
    const fromGit = Object.keys(lock.packages).filter((path) =>
      lock.packages[path].resolved?.startsWith("git+")
    );
    const npm = devEngines().packageManager;
    expect(npm).toMatchObject({ name: "npm", onFail: "error" });
    expect(satisfies("10.9.4", npm.version)).toBe(true);
    expect(satisfies("10.9.7", npm.version)).toBe(true);
    if (fromGit.length > 0) {
      const semver = jest.requireActual<{ intersects(a: string, b: string): boolean }>("semver");
      expect(semver.intersects(npm.version, ">=12.0.0")).toBe(false);
    }
  });

  // The iOS extension's engine reads URLs with whatwg-url-minimum (src/lib/engine/runtime/), the
  // very package Expo installs as the app's URL (expo/src/winter/url.ts): one copy, pinned, so that
  // a URL (a payee's verify URL, payee-proof.ts) reads the same in the app and the extension.
  it("pins the engine's URL to the one Expo gives the app, a single copy", () => {
    const { dependencies } = packageJson as { dependencies: Record<string, string> };
    const pinned = dependencies["whatwg-url-minimum"];
    expect(pinned).toMatch(/^\d+\.\d+\.\d+$/);
    const fromApp = createRequire(join(ROOT, "package.json")).resolve(
      "whatwg-url-minimum/package.json"
    );
    const fromExpo = createRequire(
      createRequire(join(ROOT, "package.json")).resolve("expo/package.json")
    ).resolve("whatwg-url-minimum/package.json");
    expect(fromExpo).toBe(fromApp);
    expect(readManifest(fromApp).version).toBe(pinned);
  });
});

type Engine = { name: string; version: string; onFail?: string };

/** package.json's devEngines: what npm checks before it installs or runs a script. */
function devEngines(): { runtime: Engine; packageManager: Engine } {
  return (packageJson as unknown as { devEngines: { runtime: Engine; packageManager: Engine } })
    .devEngines;
}

/**
 * The first Reanimated that keeps a settled value until React has it (#9527) and applies a
 * layout transition's last frame (#10171).
 */
const FIXED_REANIMATED = "4.6.0";

/** The version of `name` in node_modules. */
function installedVersion(name: string): string {
  return readManifest(join(ROOT, "node_modules", name, "package.json")).version;
}

/** The SDK's version of `name`: at least what `expo install` picks (a range's lower bound). */
function bundledVersion(name: string): string {
  const bundled = JSON.parse(
    readFileSync(join(ROOT, "node_modules", "expo", "bundledNativeModules.json"), "utf8")
  ) as Record<string, string>;
  return lowerBound(bundled[name]);
}

/** Whether `version` is in `range` (npm's semver, as npm reads peer ranges). */
function satisfies(version: string, range: string): boolean {
  const semver = jest.requireActual<{ satisfies(version: string, range: string): boolean }>(
    "semver"
  );
  return semver.satisfies(version, range);
}

/** "4.6.0" of "4.6.0", "~4.6.0" or "^4.6.0"; anything else is not a range this test reads. */
function lowerBound(range: string): string {
  const match = /^[~^]?(\d+\.\d+\.\d+)$/.exec(range);
  if (!match) throw new Error(`Not a version range this test reads: ${range}`);
  return match[1];
}

/** Negative when `a` comes before `b` ("4.5.1" before "4.5.3"), 0 when equal. */
function compareVersions(a: string, b: string): number {
  const parts = (version: string) => {
    const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
    if (!match) throw new Error(`Not an exact version: ${version}`);
    return match.slice(1).map(Number);
  };
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}
