// The iOS notification service extension's JavaScript engine (src/lib/engine/,
// scripts/extension-engine.js): the app's own code, bundled without React Native, run by
// JavaScriptCore with what the extension's Swift gives it (EngineHost.swift).
import { DEFAULT_CARD_RELAY_HOST } from "@/config/card";
import i18n, { resources } from "@/i18n";
import { LANGUAGES, toLanguage } from "@/i18n/languages";
import { ENGINE_TEXT_KEYS, engineT } from "@/lib/engine/engine-texts";
import { REFILL_TAPS, runEngineProbe } from "@/lib/engine/probe";
import { CARD_PAYMENTS_DIR_NAME, logCardPayment } from "@/lib/card/payment-log";

import { PROBE_WALLET, fakeBreez, fakeBreezWallet, fakePreimage } from "../../jest/engine-breez";
import { fakeEngineHost, type FakeEngineHost } from "../../jest/engine-host";
import { makeInvoice } from "../../jest/lightning";
import type * as FileSystemFake from "../../jest/expo-file-system";

// Node's types are not loaded (tsconfig `types` only lists jest): only what this test needs.
declare const __dirname: string;
type EngineScript = {
  engineFiles(entry?: string): {
    files: string[];
    packages: Map<string, string[]>;
    shimmed: Map<string, string[]>;
  };
  ENGINE_ENTRY: string;
  SHIMS: Record<string, string>;
};
const { join } = jest.requireActual<{ join(...segments: string[]): string }>("path");
const fs = jest.requireActual<{
  existsSync(file: string): boolean;
  mkdtempSync(prefix: string): string;
  readFileSync(file: string, encoding: "utf8"): string;
  rmSync(path: string, options: { recursive: true; force: true }): void;
}>("fs");
const { tmpdir } = jest.requireActual<{ tmpdir(): string }>("os");
const vm = jest.requireActual<{
  createContext(sandbox: object): object;
  runInContext(code: string, context: object): unknown;
}>("vm");
const { randomBytes } = jest.requireActual<{ randomBytes(length: number): Uint8Array }>("crypto");
const { execFileSync } = jest.requireActual<{
  execFileSync(
    file: string,
    args: string[],
    options: { cwd: string; stdio: "ignore"; env: Record<string, string | undefined> }
  ): unknown;
}>("child_process");

const ROOT = join(__dirname, "..", "..");
const engine = jest.requireActual<EngineScript>("../../scripts/extension-engine.js");

const STEPS = [
  "prepare",
  "packet",
  "nostrPrepare",
  "nostrVerify",
  "nostrDecrypt",
  "invoice",
  "tap",
  "refill"
];

describe("the extension's engine", () => {
  it("is made of the app's own files, @noble's packages and the app's URL only, React Native's never", () => {
    const { files, packages, shimmed } = engine.engineFiles();
    for (const [name, chain] of packages) {
      expect([name, chain]).toEqual([
        expect.stringMatching(/^(@noble\/(hashes|ciphers|curves)\/|whatwg-url-minimum$)/),
        chain
      ]);
    }
    // What its modules take of a package the bundle shims, the shim gives.
    for (const [name, names] of shimmed) {
      const shim = jest.requireActual<Record<string, unknown>>(`../../${engine.SHIMS[name]}`);
      for (const imported of names) {
        expect([name, imported, imported in shim]).toEqual([name, imported, true]);
      }
    }
    for (const file of files) expect(fs.existsSync(join(ROOT, file))).toBe(true);
    // The engine's own randomness, never expo-crypto's.
    expect(files).toContain("src/lib/random.engine.ts");
    expect(files).not.toContain("src/lib/random.ts");
    expect(files).toContain(engine.ENGINE_ENTRY);
  });

  it("is in the native fingerprint, file by file: the extension takes no update", () => {
    const { extraSources } = jest.requireActual<{
      extraSources: { type: string; filePath: string }[];
    }>("../../fingerprint.config.js");
    const fingerprinted = extraSources.map(({ filePath }) => filePath);
    expect(fingerprinted).toContain("scripts/extension-engine.js");
    for (const file of engine.engineFiles().files) expect(fingerprinted).toContain(file);
  });

  it("runs the card payment's steps on the app's code, each recorded", () => {
    const steps: string[] = [];
    expect(runEngineProbe({ step: (name) => steps.push(name) })).toEqual({ steps: STEPS.length });
    expect(steps).toEqual(STEPS);
    expect(REFILL_TAPS).toBe(500);
  });

  // Bundled as at prebuild, then run where there is nothing but the language (no React Native, no
  // TextEncoder, no crypto), as in JavaScriptCore, with a host such as EngineHost.swift.
  describe("bundled", () => {
    let script = "";
    beforeAll(async () => {
      // A log of card payments as the app writes it (Jest's file system: the documents directory).
      await logCardPayment({
        id: "1",
        cardId: "30c19d9bfae333c1cb42a5ce6e20debb",
        walletGeneration: 1,
        at: Date.UTC(2026, 10, 23, 9, 0),
        amountSats: 1_000n,
        paymentHash: "1".padStart(64, "0"),
        description: "Coffee",
        outcome: "sent",
        reason: null,
        pr: "lnbc1",
        payee: null,
        preimage: null,
        value: null
      });
      const fileSystem = jest.requireMock<typeof FileSystemFake>("expo-file-system");
      appWrittenLog = new fileSystem.File(
        fileSystem.Paths.document,
        CARD_PAYMENTS_DIR_NAME,
        "log.json"
      ).textSync();
      const directory = fs.mkdtempSync(join(tmpdir(), "engine-"));
      try {
        const output = join(directory, "engine.js");
        // In a Node process of its own, as the extension's plugin runs it at prebuild: Metro does
        // not run inside Jest's environment. The engine holds none of the Wix plugin's files: the
        // app's Metro config fetches none for it (scripts/wix-plugin.js, withoutWixPlugin). Asked
        // for a release that cannot exist, a fetch would fail the bundle, online or not, whatever
        // files were fetched earlier.
        const env = Object.fromEntries(
          Object.entries(process.env).filter(([name]) => name !== "SATTLEME_WIX_PLUGIN_FETCHED")
        );
        execFileSync(process.execPath, ["scripts/extension-engine.js", output], {
          cwd: ROOT,
          stdio: "ignore",
          env: { ...env, WIX_PLUGIN_TAG: "no-release" }
        });
        script = fs.readFileSync(output, "utf8");
      } finally {
        fs.rmSync(directory, { recursive: true, force: true });
      }
    }, 240_000);

    it("runs with nothing but its host", () => {
      const steps: string[] = [];
      const context = vm.createContext({
        __sattlemeHost: {
          random: (length: number) => Array.from(randomBytes(length)),
          step: (name: string) => steps.push(name)
        }
      });
      expect(vm.runInContext("typeof TextEncoder + typeof crypto", context)).toBe(
        "undefinedundefined"
      );
      vm.runInContext(script, context);
      expect(JSON.parse(vm.runInContext("sattlemeEngineProbe()", context) as string)).toEqual({
        steps: STEPS.length
      });
      expect(steps).toEqual(STEPS);
      // Without its host, it throws: never a run on another source of randomness.
      const bare = vm.createContext({});
      vm.runInContext(script, bare);
      expect(() => vm.runInContext("sattlemeEngineProbe()", bare)).toThrow("No engine host");
      // Without a runtime host, no runtime: its probe throws at once.
      expect(() => vm.runInContext("sattlemeEngineRuntimeProbe(() => {})", context)).toThrow(
        "No engine runtime host"
      );
    });

    it("gives the app's code its runtime from the host: timers, HTTPS, Nostr, the app's shared card data, URL", async () => {
      const host = runtimeHost();
      try {
        const context = vm.createContext({ __sattlemeHost: host });
        expect(
          vm.runInContext(
            "[typeof setTimeout, typeof fetch, typeof WebSocket, typeof URL, typeof atob].join()",
            context
          )
        ).toBe("undefined,undefined,undefined,undefined,undefined");
        vm.runInContext(script, context);
        const stored = new Map(host.stored);
        const result = await new Promise<string>((resolve) => {
          (vm.runInContext("sattlemeEngineRuntimeProbe", context) as (done: unknown) => void)(
            resolve
          );
        });
        expect(JSON.parse(result)).toEqual({
          steps: [
            {
              name: "timer",
              ok: true,
              ms: expect.any(Number),
              detail: expect.stringMatching(/ms$/)
            },
            { name: "fetch", ok: true, ms: expect.any(Number), detail: "relay 2.6.0" },
            { name: "nostr", ok: true, ms: expect.any(Number), detail: "3 of 3 relays" },
            { name: "keychain", ok: true, ms: expect.any(Number), detail: "present" },
            { name: "files", ok: true, ms: expect.any(Number), detail: "1 payments" },
            {
              name: "url",
              ok: true,
              ms: expect.any(Number),
              detail: "https://example.com/b?c=d#e"
            }
          ]
        });
        expect(host.steps).toEqual(["timer", "fetch", "nostr", "keychain", "files", "url"]);
        // Read only: nothing of the app's written.
        expect(host.stored).toEqual(stored);
        expect(host.requests.map(({ url, noRedirect }) => [url, noRedirect])).toEqual([
          [`https://${DEFAULT_CARD_RELAY_HOST}/v1/info`, expect.any(Boolean)]
        ]);
      } finally {
        host.stop();
      }
    });

    it("takes a card's tap from its host (sattlemeEngineCardWake), never arguments out of shape", async () => {
      const host = runtimeHost();
      try {
        const context = vm.createContext({ __sattlemeHost: host });
        vm.runInContext(script, context);
        const entry = vm.runInContext("sattlemeEngineCardWake", context) as (
          ...args: unknown[]
        ) => void;
        expect(() => entry("{}", "now", "fr", 30_000, () => undefined)).toThrow(
          "A packet, its time, a language and a budget"
        );
        // A packet nothing opens: not taken, the outcome said, its sats never a float.
        const result = await new Promise<string>((resolve) => {
          entry('{"epk":"x","iv":"y","ct":"z"}', Date.now(), "fr", 30_000, resolve);
        });
        expect(JSON.parse(result)).toEqual({
          outcome: "skipped",
          reason: "packet",
          notice: null,
          data: null
        });
      } finally {
        host.stop();
      }
    });

    it("pays through the host's Breez SDK as a card payment does: the wallet probe", async () => {
      const host = runtimeHost();
      const breez = fakeBreez();
      const funds = fakeBreezWallet(9, 5_000n);
      const { preimage, paymentHash } = fakePreimage(3);
      funds.preimages.set(paymentHash, preimage);
      breez.wallets.set(PROBE_WALLET, funds);
      const connectProbe = breez.connectProbe;
      breez.connectProbe = (storage, synced, done) =>
        connectProbe(storage, synced, (id, error) => {
          done(id, error);
          if (id !== null) setTimeout(synced, 1);
        });
      try {
        const context = vm.createContext({ __sattlemeHost: { ...host, breez } });
        vm.runInContext(script, context);
        const entry = vm.runInContext("sattlemeEngineWalletProbe", context) as (
          ...args: unknown[]
        ) => void;
        const invoice = makeInvoice({ amountMsat: 1_000n, paymentHash, description: "Test" });
        // Out of shape: refused at once.
        expect(() => entry(invoice, "run", 0, () => undefined)).toThrow(
          "An invoice, a run and a bound"
        );
        const result = await new Promise<string>((resolve) => {
          entry(invoice, "3b241101-e2bb-4255-8caf-4136c566a962", 20, resolve);
        });
        expect(
          (
            JSON.parse(result) as { steps: { name: string; ok: boolean; detail: string }[] }
          ).steps.map(({ name, ok, detail }) => [name, ok, detail])
        ).toEqual([
          ["connect", true, "connected"],
          ["synced", true, "synced"],
          ["balance", true, "5000 sats"],
          ["pay", true, "1 sats, fee 2, completed"],
          ["payment", true, "completed, preimage present"],
          ["disconnect", true, "disconnected"]
        ]);
        expect(breez.live()).toEqual([]);
        expect(funds.balanceSats).toBe(5_000n - 3n);
      } finally {
        host.stop();
      }
    });
  });
});

type TextTree = { [key: string]: string | TextTree };
type Translate = (key: string, values?: Record<string, unknown>) => string;

/** The value at `key` (dotted) of `tree`. */
function valueAt(tree: unknown, key: string): unknown {
  return key.split(".").reduce<unknown>((node, part) => (node as TextTree)?.[part], tree);
}

/** The dotted keys of every text under `key` in `tree`. */
function textKeys(tree: unknown, key: string): string[] {
  const node = valueAt(tree, key);
  if (typeof node === "string") return [key];
  return Object.keys(node as TextTree).flatMap((part) => textKeys(tree, `${key}.${part}`));
}

describe("the texts of the engine (engine-texts.json)", () => {
  const texts = jest.requireActual<Record<string, TextTree>>("../lib/engine/engine-texts.json");

  it("are the app's own translations of ENGINE_TEXT_KEYS, nothing else, in every language", () => {
    expect(Object.keys(texts).sort()).toEqual([...LANGUAGES].sort());
    for (const language of LANGUAGES) {
      const expected: TextTree = {};
      for (const key of ENGINE_TEXT_KEYS) {
        const parts = key.split(".");
        let node = expected;
        for (const part of parts.slice(0, -1)) node = (node[part] ??= {}) as TextTree;
        node[parts[parts.length - 1]] = valueAt(resources[language].translation, key) as TextTree;
      }
      // A change of one of these translations in a locale changes this file too.
      expect([language, texts[language]]).toEqual([language, expected]);
    }
  });

  it("are written as i18next writes them: interpolated, plurals by count", () => {
    const values = {
      amount: "1’234 sats",
      name: "“Bakery”",
      card: "Daily",
      node: "030936e7…44270d8a",
      id: "9D81",
      delay: "within 12 seconds"
    };
    const keys = new Set(
      ENGINE_TEXT_KEYS.flatMap((key) => textKeys(resources.fr.translation, key)).map((key) =>
        key.replace(/_(zero|one|two|few|many|other)$/, "")
      )
    );
    expect(keys.size).toBeGreaterThan(60);
    for (const tag of [...LANGUAGES, "pt-BR", "de-LI", "nl", "en-US"]) {
      // Any key, as the payment's core and the notices ask: i18next's typing knows the app's.
      const engine = engineT(tag) as unknown as Translate;
      // The app's language for the tag, as the app starts i18next with it (src/i18n/index.ts).
      const app = i18n.getFixedT(toLanguage(tag)) as unknown as Translate;
      for (const key of keys) {
        expect([tag, key, engine(key, values)]).toEqual([tag, key, app(key, values)]);
        for (const count of [0, 1, 2, 12]) {
          expect([tag, key, count, engine(key, { ...values, count })]).toEqual([
            tag,
            key,
            count,
            app(key, { ...values, count })
          ]);
        }
      }
    }
    expect((engineT("fr") as unknown as Translate)("card.unknownKey")).toBe("card.unknownKey");
  });
});

const GROUP = "group.ch.swissbitcoinpay.checkout.staging.cards";
let appWrittenLog = "";

/**
 * A host such as EngineHost.swift on a staging iPhone: the card relay's `/v1/info`, three Nostr
 * relays with nothing of the author asked, the device key and the log of card payments the app
 * shares (that log written by the app's own payment-log.ts, here on Jest's file system).
 */
function runtimeHost(): FakeEngineHost {
  const host = fakeEngineHost((length) => Array.from(randomBytes(length)), {
    cardAppGroup: GROUP,
    breezNetwork: "mainnet"
  });
  host.respond = (request) =>
    request.url === `https://${DEFAULT_CARD_RELAY_HOST}/v1/info`
      ? {
          status: 200,
          url: request.url,
          redirected: false,
          headers: [["content-type", "application/json"]],
          body: JSON.stringify({ protocol: 2, version: "2.6.0", listen: null })
        }
      : "offline";
  host.serve = () => ({
    receive(text) {
      const message = JSON.parse(text) as unknown[];
      return message[0] === "REQ" ? [JSON.stringify(["EOSE", message[1]])] : [];
    }
  });
  host.items.set("card-device-key", '{"version":1}');
  host.directories.add("probe");
  host.stored.set(
    "probe/config.json",
    JSON.stringify({
      version: 1,
      apiKey: "key",
      relays: ["wss://relay.one", "wss://relay.two", "wss://relay.three"]
    })
  );
  host.directories.add("card-payments");
  host.stored.set("card-payments/log.json", appWrittenLog);
  return host;
}

describe("the engine's randomness (random.engine.ts)", () => {
  type Random = typeof import("@/lib/random.engine");
  const host = globalThis as { __sattlemeHost?: unknown };
  afterEach(() => {
    delete host.__sattlemeHost;
  });

  it("takes the host's bytes, and refuses what no working source gives", () => {
    const random = jest.requireActual<Random>("../lib/random.engine");
    host.__sattlemeHost = {
      random: (length: number) => Array.from(randomBytes(length)),
      step() {}
    };
    expect(random.secureRandomBytes(32)).toHaveLength(32);
    expect(random.randomUuid()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
    host.__sattlemeHost = { random: (length: number) => new Array(length).fill(0), step() {} };
    expect(() => random.secureRandomBytes(16)).toThrow("No secure random source");
    host.__sattlemeHost = { random: () => [], step() {} };
    expect(() => random.secureRandomBytes(8)).toThrow("No secure random source");
    expect(() => random.secureRandomBytes(65_537)).toThrow();
    delete host.__sattlemeHost;
    expect(() => random.secureRandomBytes(8)).toThrow("No engine host");
  });
});
