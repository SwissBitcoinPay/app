// The store screenshots' tooling (scripts/store-screenshots/): its Metro config swaps only the
// Breez SDK's loader, nothing that builds the app reads that config, its fake loader gives the
// Jest fake of the web SDK, its relays answer as NIP-01 relays do, and its feature graphic
// draws the logo as the app does over ink.

import { palette } from "../theme/tokens";

// Node's types are not loaded (tsconfig `types` only lists jest): only what this test needs.
declare const __dirname: string;
const fs = jest.requireActual<{
  readFileSync(file: string, encoding: "utf8"): string;
  readdirSync(dir: string): string[];
  statSync(file: string): { isDirectory(): boolean };
  existsSync(file: string): boolean;
}>("fs");
const path = jest.requireActual<{ join(...segments: string[]): string }>("path");

const ROOT = path.join(__dirname, "..", "..");
const TOOL = path.join(ROOT, "scripts", "store-screenshots");
const REAL_WEB_SDK = path.join(ROOT, "src", "lib", "breez", "web-sdk.ts");
const FAKE_WEB_SDK = path.join(TOOL, "web-sdk.ts");

type Resolution = { type: "sourceFile"; filePath: string } | { type: "empty" };
type ResolveRequest = (
  context: { resolveRequest: (context: unknown, name: string, platform: string) => Resolution },
  name: string,
  platform: string
) => Resolution;
type MetroConfig = { cacheVersion: string; resolver: { resolveRequest: ResolveRequest } };

/**
 * Loads a Metro config as metro-config.test.ts does: git, the app config, Expo's and the Wix
 * plugin's fetch (which reaches GitHub) mocked.
 */
function loadConfig(file: string): MetroConfig {
  let config!: MetroConfig;
  jest.isolateModules(() => {
    jest.doMock("node:child_process", () => ({ execFileSync: () => "f".repeat(40) }));
    jest.doMock("expo/config", () => ({ getConfig: () => ({ exp: {} }) }));
    jest.doMock("../../scripts/wix-plugin", () => ({ fetchWixPluginSync: () => {} }));
    jest.doMock("expo/metro-config", () => ({
      getDefaultConfig: () => ({ cacheVersion: "1.0", resolver: { assetExts: [] } })
    }));
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    config = require(file) as MetroConfig;
  });
  return config;
}

/** A Metro context whose own resolution gives `files[name]`. */
function contextResolving(files: Record<string, string>) {
  return {
    resolveRequest: (_context: unknown, name: string): Resolution =>
      files[name] ? { type: "sourceFile", filePath: files[name] } : { type: "empty" }
  };
}

describe("store screenshots' Metro config", () => {
  const files = {
    "./web-sdk": REAL_WEB_SDK,
    "./wallet": path.join(ROOT, "src", "lib", "breez", "wallet.web.ts"),
    "react-native": path.join(ROOT, "node_modules", "react-native", "index.js")
  };

  it("resolves the Breez SDK's loader to the fake, and every other module as the project does", () => {
    const config = loadConfig(path.join(TOOL, "metro.config.js"));
    const resolve = (name: string) =>
      config.resolver.resolveRequest(contextResolving(files), name, "web");

    expect(resolve("./web-sdk")).toEqual({ type: "sourceFile", filePath: FAKE_WEB_SDK });
    expect(resolve("./wallet")).toEqual({ type: "sourceFile", filePath: files["./wallet"] });
    expect(resolve("react-native")).toEqual({
      type: "sourceFile",
      filePath: files["react-native"]
    });
    expect(resolve("missing")).toEqual({ type: "empty" });
  });

  it("keeps a cache of its own", () => {
    const project = loadConfig(path.join(ROOT, "metro.config.js"));
    const tool = loadConfig(path.join(TOOL, "metro.config.js"));

    expect(tool.cacheVersion).toBe(`${project.cacheVersion}+store-screenshots`);
  });

  it("leaves the project's own config resolving the real loader", () => {
    const project = loadConfig(path.join(ROOT, "metro.config.js"));

    expect(project.resolver.resolveRequest(contextResolving(files), "./web-sdk", "web")).toEqual({
      type: "sourceFile",
      filePath: REAL_WEB_SDK
    });
  });
});

describe("what builds the app", () => {
  /** Every file of `dir`, recursively. */
  function filesOf(dir: string): string[] {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).flatMap((name) => {
      const full = path.join(dir, name);
      return fs.statSync(full).isDirectory() ? filesOf(full) : [full];
    });
  }

  it("never reads the store screenshots' Metro config", () => {
    const builders = [
      "package.json",
      "eas.json",
      "app.config.ts",
      "metro.config.js",
      "babel.config.js",
      ...fs
        .readdirSync(path.join(ROOT, "scripts"))
        .filter((name) => /\.(js|mjs|cjs|sh)$/.test(name))
        .map((name) => path.join("scripts", name))
    ]
      .map((file) => path.join(ROOT, file))
      .concat(filesOf(path.join(ROOT, ".github")), filesOf(path.join(ROOT, ".eas")))
      .filter((file) => fs.existsSync(file));

    expect(builders.length).toBeGreaterThan(5);
    for (const file of builders) {
      const text = fs.readFileSync(file, "utf8");
      expect({ file, text: text.includes("EXPO_OVERRIDE_METRO_CONFIG") }).toEqual({
        file,
        text: false
      });
      expect({ file, text: text.includes("store-screenshots/metro.config") }).toEqual({
        file,
        text: false
      });
    }
  });
});

describe("store screenshots' wallet loader", () => {
  afterEach(() => {
    const scope = globalThis as Record<string, unknown>;
    delete scope.__sattleStoreScreenshotsFakeWallet;
  });

  it("gives the Jest fake of the web SDK, loaded, and marks the page", async () => {
    let loader!: typeof import("../../scripts/store-screenshots/web-sdk");
    let fake!: typeof import("../../jest/breez-sdk-web");
    const scope = globalThis as Record<string, unknown>;
    const saved = scope.jest;
    jest.isolateModules(() => {
      /* eslint-disable @typescript-eslint/no-require-imports -- a fresh module graph */
      loader = require("../../scripts/store-screenshots/web-sdk");
      fake = require("../../jest/breez-sdk-web");
      /* eslint-enable @typescript-eslint/no-require-imports */
    });
    try {
      const web = await loader.loadBreezWeb();

      expect(web.sdk).toBe(fake);
      expect(web.passkeys).toBe(fake);
      expect(loader.isBreezWebLoaded()).toBe(true);
      const marked = scope[loader.FAKE_MARKER] as { fake: unknown; identity: string };
      expect(marked.fake).toBe(fake);
      // A compressed public key, the account's identity in the fake (`getInfo`).
      expect(marked.identity).toMatch(/^0[23][0-9a-f]{64}$/);
    } finally {
      if (saved === undefined) delete scope.jest;
      else scope.jest = saved;
    }
  });
});

describe("store screenshots' jest.fn", () => {
  it("calls its implementation, records the calls, and replaces, resets or clears", () => {
    const scope = globalThis as Record<string, unknown>;
    const saved = scope.jest;
    let shim!: {
      fn: (implementation?: (...args: unknown[]) => unknown) => {
        (...args: unknown[]): unknown;
        mock: { calls: unknown[][] };
        mockImplementation(next: (...args: unknown[]) => unknown): unknown;
        mockReset(): unknown;
        mockClear(): unknown;
      };
    };
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("../../scripts/store-screenshots/jest-fn");
      shim = scope.jest as typeof shim;
    });
    if (saved === undefined) delete scope.jest;
    else scope.jest = saved;

    const mock = shim.fn((a: unknown, b: unknown) => `${String(a)}${String(b)}`);
    expect(mock(1, 2)).toBe("12");
    expect(mock.mock.calls).toEqual([[1, 2]]);
    mock.mockImplementation(() => "other");
    expect(mock()).toBe("other");
    mock.mockClear();
    expect(mock.mock.calls).toEqual([]);
    mock.mockReset();
    expect(mock(3)).toBeUndefined();
    expect(mock.mock.calls).toEqual([[3]]);
  });
});

describe("store screenshots' relays", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { FakeRelays } = require("../../scripts/store-screenshots/relays.js") as {
    FakeRelays: new () => {
      serve(route: unknown): void;
      errors: string[];
    };
  };

  /** A WebSocket the page opened, as Playwright's WebSocketRoute gives it. */
  function socket(relays: InstanceType<typeof FakeRelays>, url = "wss://relay.example/") {
    const sent: unknown[][] = [];
    let onMessage: (data: string) => void = () => undefined;
    let onClose: () => void = () => undefined;
    relays.serve({
      url: () => url,
      send: (data: string) => sent.push(JSON.parse(data) as unknown[]),
      onMessage: (handler: (data: string) => void) => (onMessage = handler),
      onClose: (handler: () => void) => (onClose = handler)
    });
    return {
      sent,
      send: (message: unknown) => onMessage(JSON.stringify(message)),
      close: () => onClose()
    };
  }

  const PUBKEY = "a".repeat(64);

  function event(
    id: string,
    fields: { kind?: number; created_at?: number; tags?: string[][]; pubkey?: string } = {}
  ) {
    return {
      id: id.repeat(64).slice(0, 64),
      pubkey: fields.pubkey ?? PUBKEY,
      kind: fields.kind ?? 30078,
      created_at: fields.created_at ?? 1000,
      tags: fields.tags ?? [["d", "record"]],
      content: "",
      sig: "0".repeat(128)
    };
  }

  it("stores an event, answers OK, and gives it to a query then EOSE", () => {
    const relays = new FakeRelays();
    const writer = socket(relays);
    const stored = event("1");
    writer.send(["EVENT", stored]);
    expect(writer.sent).toEqual([["OK", stored.id, true, ""]]);

    const reader = socket(relays);
    reader.send(["REQ", "q", { kinds: [30078], authors: [PUBKEY], "#d": ["record"] }]);
    expect(reader.sent).toEqual([
      ["EVENT", "q", stored],
      ["EOSE", "q"]
    ]);
    expect(relays.errors).toEqual([]);
  });

  it("keeps the newest version of an addressable event only", () => {
    const relays = new FakeRelays();
    const writer = socket(relays);
    const older = event("1", { created_at: 1000 });
    const newer = event("2", { created_at: 2000 });
    writer.send(["EVENT", newer]);
    writer.send(["EVENT", older]);
    expect(writer.sent[1]).toEqual(["OK", older.id, false, "duplicate: a newer version is stored"]);

    const reader = socket(relays);
    reader.send(["REQ", "q", { kinds: [30078] }]);
    expect(reader.sent).toEqual([
      ["EVENT", "q", newer],
      ["EOSE", "q"]
    ]);
  });

  it("removes what a deletion request names, of its author only", () => {
    const relays = new FakeRelays();
    const writer = socket(relays);
    const own = event("1");
    const other = event("2", { pubkey: "b".repeat(64), tags: [["d", "other"]] });
    writer.send(["EVENT", own]);
    writer.send(["EVENT", other]);
    writer.send([
      "EVENT",
      event("3", {
        kind: 5,
        created_at: 1500,
        tags: [
          ["a", `30078:${PUBKEY}:record`],
          ["e", other.id]
        ]
      })
    ]);

    const reader = socket(relays);
    reader.send(["REQ", "q", { kinds: [30078] }]);
    expect(reader.sent).toEqual([
      ["EVENT", "q", other],
      ["EOSE", "q"]
    ]);
  });

  it("applies each filter's limit, the newest first", () => {
    const relays = new FakeRelays();
    const writer = socket(relays);
    for (const [id, time] of [
      ["1", 1000],
      ["2", 3000],
      ["3", 2000]
    ] as const) {
      writer.send(["EVENT", event(id, { created_at: time, tags: [["d", id]] })]);
    }
    const reader = socket(relays);
    reader.send(["REQ", "q", { kinds: [30078], limit: 2 }]);
    expect(reader.sent.map((message) => (message[2] as { id?: string } | undefined)?.id)).toEqual([
      "2".repeat(64),
      "3".repeat(64),
      undefined
    ]);
  });

  it("sends new events to open subscriptions until they are closed, per relay", () => {
    const relays = new FakeRelays();
    const reader = socket(relays);
    const elsewhere = socket(relays, "wss://other.example/");
    reader.send(["REQ", "live", { kinds: [30078] }]);
    elsewhere.send(["REQ", "live", { kinds: [30078] }]);
    const writer = socket(relays);
    const first = event("1");
    writer.send(["EVENT", first]);
    expect(reader.sent).toEqual([
      ["EOSE", "live"],
      ["EVENT", "live", first]
    ]);
    expect(elsewhere.sent).toEqual([["EOSE", "live"]]);

    reader.send(["CLOSE", "live"]);
    writer.send(["EVENT", event("2", { tags: [["d", "second"]] })]);
    expect(reader.sent).toHaveLength(2);
  });

  it("reports malformed messages and refuses malformed events", () => {
    const relays = new FakeRelays();
    const writer = socket(relays);
    writer.send(["EVENT", { id: "x" }]);
    writer.send(["PING"]);

    expect(writer.sent).toEqual([["OK", "x", false, "invalid: malformed"]]);
    expect(relays.errors).toEqual([
      "wss://relay.example/: malformed event",
      "wss://relay.example/: PING"
    ]);
  });
});

describe("store screenshots' breez.tips", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { FakeBreezTips } = require("../../scripts/store-screenshots/breez-tips.js") as {
    FakeBreezTips: (new (options: {
      descriptionOf: (username: string) => Promise<string | undefined>;
      nowSeconds: () => Promise<number>;
    }) => {
      answer(url: URL): Promise<{ status: number; body: Record<string, unknown> }>;
      settleLast(): { pr: string; preimage: string };
    }) & { serves(url: URL): boolean };
  };
  const { decodeBolt11 } =
    jest.requireActual<typeof import("@/lib/lightning/bolt11")>("@/lib/lightning/bolt11");
  const decodeInvoice = (pr: string) => {
    const invoice = decodeBolt11(pr);
    if (!invoice) throw new Error(`Not an invoice: ${pr}`);
    return invoice;
  };
  const { sha256 } =
    jest.requireActual<typeof import("@noble/hashes/sha2.js")>("@noble/hashes/sha2.js");
  const { bytesToHex, hexToBytes, utf8ToBytes } =
    jest.requireActual<typeof import("@noble/hashes/utils.js")>("@noble/hashes/utils.js");

  const NOW = 1_795_000_000;
  const server = () =>
    new FakeBreezTips({
      descriptionOf: async (username) => (username === "sattleme5a" ? "Lumen Café" : undefined),
      nowSeconds: async () => NOW
    });

  it("serves breez.tips over https only", () => {
    expect(FakeBreezTips.serves(new URL("https://breez.tips/x"))).toBe(true);
    expect(FakeBreezTips.serves(new URL("http://breez.tips/x"))).toBe(false);
    expect(FakeBreezTips.serves(new URL("https://example.com/x"))).toBe(false);
  });

  it("answers the payRequest with the registered description's metadata", async () => {
    const { status, body } = await server().answer(
      new URL("https://breez.tips/.well-known/lnurlp/sattleme5a")
    );

    expect(status).toBe(200);
    expect(body).toMatchObject({
      tag: "payRequest",
      callback: "https://breez.tips/lnurlp/sattleme5a/invoice",
      minSendable: 1000
    });
    expect(JSON.parse(String(body.metadata))).toEqual([
      ["text/plain", "Lumen Café"],
      ["text/identifier", "sattleme5a@breez.tips"]
    ]);
  });

  it("makes an invoice of the exact amount, its description hash the metadata's", async () => {
    const tips = server();
    const { body: payRequest } = await tips.answer(
      new URL("https://breez.tips/.well-known/lnurlp/sattleme5a")
    );
    const { status, body } = await tips.answer(
      new URL("https://breez.tips/lnurlp/sattleme5a/invoice?amount=23000000&expiry=600")
    );

    expect(status).toBe(200);
    const invoice = decodeInvoice(String(body.pr));
    expect(invoice.amountMsat).toBe(23_000_000n);
    expect(invoice.timestamp).toBe(NOW);
    expect(invoice.descriptionHash).toBe(
      bytesToHex(sha256(utf8ToBytes(String(payRequest.metadata))))
    );
    expect(body.verify).toBe(`https://breez.tips/lnurlp/verify/${invoice.paymentHash}`);
  });

  it("tells an invoice settled, with its preimage, only once paid", async () => {
    const tips = server();
    const { body } = await tips.answer(
      new URL("https://breez.tips/lnurlp/sattleme5a/invoice?amount=1000")
    );
    const verify = new URL(String(body.verify));

    expect((await tips.answer(verify)).body).toEqual({
      status: "OK",
      settled: false,
      preimage: null,
      pr: body.pr
    });
    const paid = tips.settleLast();
    const answer = (await tips.answer(verify)).body;
    expect(answer).toEqual({ status: "OK", settled: true, preimage: paid.preimage, pr: body.pr });
    expect(bytesToHex(sha256(hexToBytes(paid.preimage)))).toBe(
      decodeInvoice(String(body.pr)).paymentHash
    );
  });

  it("refuses unknown addresses, invoices and amounts as the server does", async () => {
    const tips = server();

    expect((await tips.answer(new URL("https://breez.tips/.well-known/lnurlp/other"))).status).toBe(
      404
    );
    expect(
      (await tips.answer(new URL(`https://breez.tips/lnurlp/verify/${"0".repeat(64)}`))).body
    ).toEqual({ status: "ERROR", reason: "Not found" });
    expect(
      (await tips.answer(new URL("https://breez.tips/lnurlp/sattleme5a/invoice?amount=999"))).status
    ).toBe(400);
    expect(() => tips.settleLast()).toThrow("No invoice made yet");
  });
});

describe("store screenshots' BoltCard reader", () => {
  const REAL_READER = path.join(ROOT, "src", "lib", "nfc", "boltcard.web.ts");
  const FAKE_READER = path.join(TOOL, "boltcard.ts");

  it("takes the place of the web's reader, in the store screenshots' build only", () => {
    const files = { "@/lib/nfc/boltcard": REAL_READER };
    const tool = loadConfig(path.join(TOOL, "metro.config.js"));
    const project = loadConfig(path.join(ROOT, "metro.config.js"));
    const resolve = (config: MetroConfig) =>
      config.resolver.resolveRequest(contextResolving(files), "@/lib/nfc/boltcard", "web");

    expect(resolve(tool)).toEqual({ type: "sourceFile", filePath: FAKE_READER });
    expect(resolve(project)).toEqual({ type: "sourceFile", filePath: REAL_READER });
  });

  it("reads as the device the page shows, none when it is not told", async () => {
    let reader!: typeof import("../../scripts/store-screenshots/boltcard");
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      reader = require("../../scripts/store-screenshots/boltcard");
    });
    const scope = globalThis as Record<string, unknown>;
    try {
      await expect(reader.getCardReading()).resolves.toBe("none");
      for (const reading of ["tap", "auto", "none"] as const) {
        scope[reader.CARD_READING] = reading;
        await expect(reader.getCardReading()).resolves.toBe(reading);
      }
      scope[reader.CARD_READING] = "anything";
      await expect(reader.getCardReading()).resolves.toBe("none");
    } finally {
      delete scope[reader.CARD_READING];
    }
  });

  it("waits for a card until the reading is cancelled", async () => {
    let reader!: typeof import("../../scripts/store-screenshots/boltcard");
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      reader = require("../../scripts/store-screenshots/boltcard");
    });
    const read = reader.readCard({ alertMessage: "" });
    let settled = false;
    read.lnurl.then(
      () => (settled = true),
      () => (settled = true)
    );
    await Promise.resolve();
    expect(settled).toBe(false);

    read.cancel();
    const error = await read.lnurl.catch((caught: unknown) => caught);
    expect(reader.isReadCancelled(error)).toBe(true);
    expect(reader.isReadCancelled(new Error("other"))).toBe(false);
  });
});

describe("store screenshots' captions", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { CAPTIONS } = require("../../scripts/store-screenshots/captions.js") as {
    CAPTIONS: Record<string, Record<string, { title: string; subtitle: string }>>;
  };
  const { LANGUAGES } = jest.requireActual<typeof import("@/i18n/languages")>("@/i18n/languages");

  it("has every screen in every language of the app", () => {
    for (const [screen, captions] of Object.entries(CAPTIONS)) {
      expect({ screen, languages: Object.keys(captions).sort() }).toEqual({
        screen,
        languages: [...LANGUAGES].sort()
      });
    }
  });

  it("writes each title on two lines, one word at most in the accent colour, no other markup", () => {
    for (const captions of Object.values(CAPTIONS)) {
      for (const { title, subtitle } of Object.values(captions)) {
        expect({ title, lines: title.split("\n").length }).toEqual({ title, lines: 2 });
        expect(title.replace(/<\/?em>/g, "")).not.toMatch(/[<>]/);
        expect((title.match(/<em>/g) ?? []).length).toBeLessThanOrEqual(1);
        expect(subtitle).not.toMatch(/[<>\n]/);
      }
    }
  });
});

describe("store screenshots' feature graphic", () => {
  it("draws the logo as the app does over ink: its ink in white, its orange kept", () => {
    const logo = fs.readFileSync(path.join(ROOT, "assets", "images", "logo.svg"), "utf8");
    const page = fs.readFileSync(path.join(TOOL, "feature.html"), "utf8");
    expect(new Set(logo.match(/<\w+/g))).toEqual(new Set(["<svg", "<path"]));
    expect(new Set(logo.match(/(fill|stroke|style)="[^"]*"/g))).toEqual(
      new Set(['fill="#0B1A33"', 'fill="#F7931A"'])
    );
    expect(page).toContain('logo.replace(/#0B1A33/gi, "#FFFFFF")');
    expect(palette.ink).toBe("#0B1A33");
    expect(palette.white).toBe("#FFFFFF");
  });
});
