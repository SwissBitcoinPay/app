// The jest-expo preset, whose transformIgnorePatterns also let Babel transform the @noble packages
// (src/lib/backup/) and those of the same author the v2 wallet's transfer signs with (@scure,
// micro-packed: src/lib/legacy-v2/): they ship ES modules only, which Jest's CommonJS runtime
// cannot load as is.
const { transform, transformIgnorePatterns } = require("jest-expo/jest-preset");

const TRANSFORMED = "/node_modules/(?!(";

// The project's own code goes through the React Compiler, as Metro builds the app
// (`experiments.reactCompiler`): its memoization changes what renders again (a screen pushed on
// desktop can fail to show while tests without it pass). Metro leaves the packages out,
// and so does this pattern: Jest tells babel-preset-expo nothing about node_modules.
const [babelJest, babelOptions] = transform["\\.[jt]sx?$"];
const reactCompiler = [
  babelJest,
  { ...babelOptions, caller: { ...babelOptions.caller, supportsReactCompiler: true } }
];

// The tests' clock in UTC whatever the machine's time zone, as the CI's: what follows the device's
// time zone is tested with calendars of their own (jest/calendar.ts), the device's own in Node
// processes of their own (device-calendar.test.ts). Set before the workers start, which take it
// from this process (a zone set in a test is not read).
process.env.TZ = "UTC";

module.exports = {
  preset: "jest-expo",
  // Reanimated's resolver, around the preset's (jest/resolver.js).
  resolver: "<rootDir>/jest/resolver.js",
  setupFiles: ["<rootDir>/jest.setup.ts"],
  // The Wix plugin's files are fetched when the app is bundled (scripts/wix-plugin.js), never in a
  // test: Jest reads a copy of a release instead.
  moduleNameMapper: { "^(?:.*/)?assets/plugins/wix/(.*)$": "<rootDir>/jest/wix-plugin/$1" },
  setupFilesAfterEnv: ["<rootDir>/jest.after-env.ts"],
  // Jest's 5 s by default: on a busy CI machine, the first test of animated-amount.test.tsx
  // (0.3 s alone) can take over 5 s. Files that need more keep their own jest.setTimeout.
  testTimeout: 15_000,
  // A worker keeps every file's modules: over the whole suite (3 workers), each grows from 0.5 to
  // 3.2 GB, 6.3 GB together, and on a CI machine with one worker per core but one the system kills
  // workers (SIGKILL) and tests time out. Restarted past 512 MB of heap after a file (3 workers,
  // the suite's peak resident memory): 3.0 GB together, 1.1 GB at most each.
  workerIdleMemoryLimit: "512MB",
  // Within a file, a mock kept every call's arguments for the rest of it: React Native's
  // `AppState.addEventListener` kept each listener of the app's shell (auto-lock.tsx), hence each
  // test's whole screen and fake clock. Measured on cards-screen.test.tsx: 5 MB more
  // kept after each test, 1.2 GB after 164, 2.3 GB of heap at the file's end; cleared before each
  // test, 0.4 GB throughout. Implementations stay: `jest.fn(impl)` and `mockImplementation` keep
  // theirs, only what was recorded goes.
  clearMocks: true,
  // Before the preset's own pattern, which still transforms the packages.
  transform: {
    "^(?!.*/node_modules/).+\\.[jt]sx?$": reactCompiler,
    // Text files Metro bundles as assets (metro.config.js): a module id, as the preset gives images.
    "\\.txt$": require.resolve("jest-expo/src/preset/assetFileTransformer.js"),
    // The @noble packages only need their ES modules turned into CommonJS: the preset's whole
    // transform also rewrote their classes into Babel's helpers, which ran at every hash, cipher
    // and point made (profile of cards-screen.test.tsx: 43 % of its CPU time in
    // @noble). Node runs the rest of their code as is. Measured on the whole suite, 2 workers:
    // 557 s instead of 639 with an empty cache, 460 s instead of 499 with a full one.
    "/node_modules/(?:@noble|@scure|micro-packed)/.+\\.js$": [
      babelJest,
      { babelrc: false, configFile: false, plugins: ["@babel/plugin-transform-modules-commonjs"] }
    ]
  },
  transformIgnorePatterns: transformIgnorePatterns.map((pattern) =>
    pattern.startsWith(TRANSFORMED)
      ? pattern.replace(TRANSFORMED, `${TRANSFORMED}@noble/|@scure/|micro-packed/|`)
      : pattern
  )
};
