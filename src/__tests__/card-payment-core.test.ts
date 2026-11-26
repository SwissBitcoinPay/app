// The card payment's core (src/features/card/payment-core.ts): its rules, with what differs between
// the app and the iOS notification service extension given as ports (payment.ts gives the app's).
// The extension's engine (scripts/extension-engine.js) bundles the app's own files without React
// Native: the core, and the card stores the extension reads, must stay made of such files.

// Node's types are not loaded (tsconfig `types` only lists jest): only what this test needs.
type EngineScript = {
  engineFiles(entry: string): {
    files: string[];
    packages: Map<string, string[]>;
    shimmed: Map<string, string[]>;
  };
  SHIMS: Record<string, string>;
};
const engine = jest.requireActual<EngineScript>("../../scripts/extension-engine.js");

const ENTRIES = [
  "src/features/card/payment-core.ts",
  "src/lib/card/payment-log.ts",
  "src/lib/card/payees.ts",
  "src/lib/card/card-pass-store.ts",
  "src/lib/card/card-store.ts",
  "src/lib/card/device-key.ts"
];

describe("the card payment's core and the card stores", () => {
  it.each(ENTRIES)(
    "%s: the app's own files and @noble's packages only, React Native's never",
    (entry) => {
      const { files, packages, shimmed } = engine.engineFiles(entry);
      expect(files).toContain(entry);
      for (const [name, chain] of packages) {
        expect([name, chain]).toEqual([
          expect.stringMatching(/^@noble\/(hashes|ciphers|curves)\//),
          chain
        ]);
      }
      // What it takes of a package the bundle shims, the shim gives.
      for (const [name, names] of shimmed) {
        const shim = jest.requireActual<Record<string, unknown>>(`../../${engine.SHIMS[name]}`);
        for (const imported of names)
          expect([name, imported, imported in shim]).toEqual([name, imported, true]);
      }
    }
  );

  it("reaches none of the app's account, passkey, texts, wallet nor screens: they are its ports", () => {
    const { files } = engine.engineFiles("src/features/card/payment-core.ts");
    const app = files.filter((file) =>
      /^src\/(app|components|features\/account|i18n|theme)\/|^src\/lib\/breez\/(wallet|passkey|connection)|^src\/features\/card\/(payment|card-wallet|states|relay-sync|card-passes|history-sync|payees-sync)\.ts$/.test(
        file
      )
    );
    expect(app).toEqual([]);
  });

  it("reads the card items and files the app shares, and moves none: the engine's own modules", () => {
    const files = new Set(ENTRIES.flatMap((entry) => engine.engineFiles(entry).files));
    for (const file of [
      "src/lib/card/card-keychain.engine.ts",
      "src/lib/card/card-files.engine.ts",
      "src/lib/card/app-group.engine.ts",
      "src/lib/log/journal.engine.ts"
    ]) {
      expect(files).toContain(file);
    }
    for (const file of [
      "src/lib/card/card-keychain.ts",
      "src/lib/card/card-files.ts",
      "src/lib/card/app-group.ts",
      "src/lib/log/journal.ts"
    ]) {
      expect(files).not.toContain(file);
    }
  });
});
