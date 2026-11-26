// The iOS notification service extension's JavaScript (src/lib/engine/): the app's own
// TypeScript, bundled by Metro, the app's bundler, into one plain script that JavaScriptCore runs in
// the extension (plugins/card-notification-extension/ios/EngineHost.swift), without React Native:
// no React Native prelude nor polyfill, and the platform "engine" first, so that a module's
// `*.engine.ts` (random.engine.ts) stands for its React Native one. Run at prebuild by the
// extension's config plugin, its output copied into the extension (never committed).
//
// The files it is made of (engineFiles) are in the native fingerprint (fingerprint.config.js): the
// extension cannot take an update, so a change to one of them starts a native build. Its only
// packages are @noble/* (pinned, pure JavaScript; src/__tests__/extension-engine.test.ts).
//
// Run by hand: node scripts/extension-engine.js <output file>
const fs = require("node:fs");
const path = require("node:path");

const { withoutWixPlugin } = require("./wix-plugin");

const PROJECT_ROOT = path.join(__dirname, "..");
/** The platform of the engine's own files, `*.engine.ts`, tried before any other. */
const PLATFORM = "engine";
/** The bundle's entry, from the project's root. */
const ENGINE_ENTRY = "src/lib/engine/probe-entry.ts";
/**
 * The packages the bundle takes from src/lib/engine/shims/ instead (from the project's root): what
 * the app's modules use of them, without React Native nor Expo's native modules.
 */
const SHIMS = {
  "react-native": "src/lib/engine/shims/react-native.ts",
  "expo-constants": "src/lib/engine/shims/expo-constants.ts",
  "expo-file-system": "src/lib/engine/shims/expo-file-system.ts"
};

/** Static imports and re-exports (`import … from "x"`, `import "x"`, `export … from "x"`). */
const IMPORT = /(?:^|\n)[ \t]*(import|export)\s+(type\s+)?(?:[^'";]*?\s+from\s+)?["']([^"']+)["']/g;
/** The names a static import takes (`import a, { b, c as d, type e } from "x"`). */
const IMPORT_CLAUSE = /(?:^|\n)[ \t]*import\s+(?!type\s)([^'";]*?)\s+from\s+["']([^"']+)["']/g;
/** What the walk cannot follow: a module the bundle would hold but engineFiles would miss. */
const DYNAMIC = /\brequire\s*\(|\bimport\s*\(/;

/** A project module's file, as Metro resolves it for the engine (`*.engine.ts` first). */
function resolveModule(from, specifier) {
  const base = specifier.startsWith("@/")
    ? path.join(PROJECT_ROOT, "src", specifier.slice(2))
    : path.resolve(path.dirname(from), specifier);
  // A JSON file the bundle holds as it is (its data, no import of its own).
  if (base.endsWith(".json") && fs.existsSync(base)) return base;
  for (const suffix of [`.${PLATFORM}.ts`, ".ts", ".tsx", `/index.${PLATFORM}.ts`, "/index.ts"]) {
    if (fs.existsSync(base + suffix)) return base + suffix;
  }
  throw new Error(`Cannot resolve ${specifier} from ${path.relative(PROJECT_ROOT, from)}`);
}

/** The names `clause` imports (`a, { b, c as d, type e }`): "default" for a default import. */
function importedNames(clause) {
  const names = [];
  const braces = /\{([^}]*)\}/.exec(clause);
  const outside = clause
    .replace(/\{[^}]*\}/, "")
    .replace(/,/g, " ")
    .trim();
  if (outside.startsWith("*")) names.push("*");
  else if (outside !== "") names.push("default");
  for (const item of braces ? braces[1].split(",") : []) {
    const name = item.trim();
    if (name === "" || name.startsWith("type ")) continue;
    names.push(name.split(/\s+as\s+/)[0].trim());
  }
  return names;
}

/**
 * The project files the engine's bundle is made of (from the project's root, sorted), and the
 * packages it imports, each with the chain of files that imports it. Type-only imports are left
 * out, as the bundle leaves them out. Throws on an import it cannot follow. A package of SHIMS is
 * walked as its shim, the names imported of it listed in `shimmed`.
 */
function engineFiles(entry = ENGINE_ENTRY) {
  const files = new Set();
  const packages = new Map();
  const shimmed = new Map();
  const walk = (file, chain) => {
    const relative = path.relative(PROJECT_ROOT, file).split(path.sep).join("/");
    if (files.has(relative)) return;
    files.add(relative);
    const source = fs.readFileSync(file, "utf8");
    if (DYNAMIC.test(source)) throw new Error(`${relative}: a dynamic import or require`);
    for (const [, clause, specifier] of source.matchAll(IMPORT_CLAUSE)) {
      if (!(specifier in SHIMS)) continue;
      const names = shimmed.get(specifier) ?? new Set();
      for (const name of importedNames(clause)) names.add(name);
      shimmed.set(specifier, names);
    }
    for (const [, , typeOnly, specifier] of source.matchAll(IMPORT)) {
      if (typeOnly) continue;
      if (specifier in SHIMS) {
        walk(path.join(PROJECT_ROOT, SHIMS[specifier]), [...chain, relative]);
      } else if (specifier.startsWith("@/") || specifier.startsWith(".")) {
        walk(resolveModule(file, specifier), [...chain, relative]);
      } else if (!packages.has(specifier)) {
        packages.set(specifier, [...chain, relative]);
      }
    }
  };
  walk(path.join(PROJECT_ROOT, entry), []);
  return {
    files: [...files].sort(),
    packages,
    shimmed: new Map([...shimmed].map(([name, names]) => [name, [...names].sort()]))
  };
}

/** Bundles the engine into `output` (a file path). */
async function bundleEngine(output, entry = ENGINE_ENTRY) {
  const Metro = require("metro");
  // The app's own Metro config (metro.config.js), then what the engine needs over it. The engine
  // holds none of the Wix plugin's files: metro.config.js fetches none for it (no GitHub at
  // prebuild nor in tests).
  const base = await withoutWixPlugin(() => Metro.loadConfig({ cwd: PROJECT_ROOT }));
  const resolveRequest = base.resolver.resolveRequest;
  const config = Metro.mergeConfig(base, {
    resolver: {
      platforms: [PLATFORM, ...base.resolver.platforms],
      // The app's path alias (tsconfig.json, `@/…` → src/…), which Expo CLI resolves for the
      // app's own bundles and Metro alone does not.
      resolveRequest: (context, moduleName, platform) => {
        if (Object.hasOwn(SHIMS, moduleName)) {
          return { type: "sourceFile", filePath: path.join(PROJECT_ROOT, SHIMS[moduleName]) };
        }
        const name = moduleName.startsWith("@/")
          ? path.join(PROJECT_ROOT, "src", moduleName.slice(2))
          : moduleName;
        return resolveRequest
          ? resolveRequest(context, name, platform)
          : context.resolveRequest(context, name, platform);
      }
    },
    serializer: {
      // React Native's InitializeCore and polyfills need its native runtime, which the extension
      // has not.
      getModulesRunBeforeMainModule: () => [],
      getPolyfills: () => []
    }
  });
  fs.mkdirSync(path.dirname(output), { recursive: true });
  await Metro.runBuild(config, {
    entry: path.join(PROJECT_ROOT, entry),
    out: output,
    platform: PLATFORM,
    dev: false,
    minify: true,
    sourceMap: false
  });
}

module.exports = { bundleEngine, engineFiles, ENGINE_ENTRY, PLATFORM, PROJECT_ROOT, SHIMS };

if (require.main === module) {
  const [output] = process.argv.slice(2);
  if (!output) {
    console.error("Usage: node scripts/extension-engine.js <output file>");
    process.exit(2);
  }
  bundleEngine(path.resolve(output)).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
