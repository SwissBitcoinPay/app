import { act, render } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { AppState, Platform, Text } from "react-native";

import { LogRenderErrors } from "@/components/LogRenderErrors";
import { wipeDevice } from "@/features/settings/device-wipe";
import { logUnhandledRejections } from "@/lib/log/crashes";
import { describeError, parseLogEntry, safeText, type LogEntry } from "@/lib/log/entry";
import {
  APP_LOG_DIR_NAME,
  LOG_RETENTION_MS,
  MAX_LOG_BYTES,
  MAX_LOG_ENTRIES
} from "@/lib/log/journal";
import { appBuild, startAppLog } from "@/lib/log/lifecycle";
import {
  LOG_BURST,
  LOG_BURST_WINDOW_MS,
  logEvent,
  logFailure,
  logStart,
  readLog,
  resetLog
} from "@/lib/log/log";

import type * as FileSystemFake from "../../jest/expo-file-system";

/*
 * The app's journal (src/lib/log/): what it keeps of a failure, never a
 * value of the app's; on file as each entry comes, without reading it; bounded in size, in age and
 * in bursts; gone with "Log out"; the errors nothing caught.
 */

// Node's types are not loaded (tsconfig `types` only lists jest): only what the scan needs.
declare const __dirname: string;
const fs = jest.requireActual<{
  readdirSync(
    path: string,
    options: { withFileTypes: true }
  ): { name: string; isDirectory(): boolean }[];
  readFileSync(path: string, encoding: "utf8"): string;
}>("fs");
const { join } = jest.requireActual<{ join(...segments: string[]): string }>("path");

const fileSystem = jest.requireMock<typeof FileSystemFake>("expo-file-system");
const CACHE = "file:///data/user/0/ch.swissbitcoinpay.checkout.staging/cache";
const DIRECTORY = `${CACHE}/${APP_LOG_DIR_NAME}`;
const JOURNAL = `${DIRECTORY}/journal.jsonl`;
const HEADER = JSON.stringify({ log: "sattleme-app-log", version: 1 });

/** The journal's file, line by line. */
function fileLines(): string[] {
  return (fileSystem.files.get(JOURNAL) ?? "").split("\n");
}

/** A journal written by an earlier session: its header, then `lines`. */
function journalOnFile(lines: readonly string[]): void {
  new fileSystem.Directory(DIRECTORY).create({ intermediates: true, idempotent: true });
  fileSystem.files.set(JOURNAL, HEADER + lines.map((line) => `\n${line}`).join(""));
}

/** An entry as the journal writes it. */
function entryLine(event: string, at: number): string {
  const entry: LogEntry = { at, level: "info", event, error: null, build: null, skipped: 0 };
  return JSON.stringify(entry);
}

/** An event text without digits for each `n`: "Event ab". */
function eventNamed(n: number): string {
  let name = "";
  for (let rest = n; ; rest = Math.floor(rest / 26) - 1) {
    name = String.fromCharCode(97 + (rest % 26)) + name;
    if (rest < 26) break;
  }
  return `Event ${name}`;
}

// Values of the app that must never reach the journal (clearly fake ones).
const INVOICE =
  "lnbc15u1p3xnhl2pp5jptserfk3zk4qy42tlucycrfwxhydvlemu9pqr93tuzlv9cc7g3sdqsvfhkcap3xyhx7un8cqzpgxqzjcsp5f8c52y2stc300gl6s4xswtjpc37hrnnr3c9wvtgjfuvqmpm35evq9qyyssqy4lgd8tj637qcjp05rdpxxykjenthxftej7a2zzmwrmrl70fyj9hvj0rewhzj7jfyuwkwcg9g2jpwtk3wkjtwnkdks84hsnu8xps5vsq4gj5hs";
const ADDRESS = "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq";
const LEGACY_ADDRESS = "1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2";
const KEY = "7f".repeat(32);
const ID = "c0ffee00c0ffee00c0ffee00c0ffee00";
const TOKEN = "eyJhbGciOiJIUzI1NiJ9AbCdEfGhIjKlMnOpQrStUvWxYz";

beforeEach(() => {
  fileSystem.resetFileSystem();
  resetLog();
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.useRealTimers();
});

describe("safeText", () => {
  it("keeps plain words, in the app's languages", () => {
    expect(safeText("Network request failed", "elsewhere")).toBe("Network request failed");
    expect(safeText("  No answer   in time ", "elsewhere")).toBe("No answer in time");
    expect(safeText("Aikakatkaisu: yritä myöhemmin uudelleen (välittäjä)", "elsewhere")).toBe(
      "Aikakatkaisu: yritä myöhemmin uudelleen (välittäjä)"
    );
    expect(safeText("Übertragung fehlgeschlagen", "elsewhere")).toBe("Übertragung fehlgeschlagen");
    expect(safeText("HTTP error from the relay", "elsewhere")).toBe("HTTP error from the relay");
    // The code's own texts may name a standard, a product.
    expect(safeText("Reading the LUD-21 answer failed", "code")).toBe(
      "Reading the LUD-21 answer failed"
    );
    expect(safeText("Opening the Breez SDK failed", "code")).toBe("Opening the Breez SDK failed");
  });

  it("leaves out whole a text that could hold a value of the app's", () => {
    for (const text of [
      `Invalid invoice ${INVOICE}`,
      `Cannot pay ${ADDRESS}`,
      `Cannot pay ${LEGACY_ADDRESS}`,
      `Bad key ${KEY}`,
      `Unknown sale ${ID}`,
      `Bearer ${TOKEN}`,
      "Mail to anna@example.com bounced",
      "No route to sattleme01@breez.tips",
      "Fetch https://breez.tips/lnurlp/sattleme01?amount=150000 failed",
      "Fetch breez.tips/lnurlp failed",
      'Unable to resolve host "relay.damus.io": No address associated with hostname',
      "getaddrinfo ENOTFOUND relay.bakery.example",
      "Cannot open mailto:anna",
      "Unknown member Alice Smith",
      "Smith Bakery LLC",
      "Token AbCdEf-GhIjKlMnOpQrStUv",
      "Not enough funds: 150000 sats",
      "Amount 12.50 CHF too low",
      "Amount 150 sats too low",
      "Expected 3 relays",
      '{"error":"internal"}',
      "a".repeat(25),
      "word ".repeat(50)
    ]) {
      expect([text, safeText(text, "elsewhere")]).toEqual([text, null]);
    }
    // The code's own texts: numbers of up to 3 digits, never more; never a host.
    expect(safeText("HTTP 404 from the relay", "code")).toBe("HTTP 404 from the relay");
    expect(safeText("Waited 1500 ms", "code")).toBeNull();
    expect(safeText("SoftKeyboard.showOnceFocused failed", "code")).toBeNull();
  });

  it("keeps only a text", () => {
    for (const value of [undefined, null, 42, {}, ["word"], ""]) {
      expect(safeText(value, "code")).toBeNull();
    }
  });

  it("passes every event text of the code: none is left out", () => {
    const events: string[] = [];
    const scan = (directory: string) => {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== "__tests__") scan(path);
        } else if (/\.tsx?$/.test(entry.name)) {
          const source = fs.readFileSync(path, "utf8");
          const calls = /\blog(?:Failure|Event|Uncaught)\(\s*("(?:[^"\\]|\\.)*"|`[^`]*`)/g;
          for (const [, literal] of source.matchAll(calls)) {
            // A template's values are the code's own (an action, a currency): a word stands in.
            events.push(literal!.slice(1, -1).replace(/\$\{[^}]*\}/g, "value"));
          }
        }
      }
    };
    scan(join(__dirname, ".."));
    expect(events.length).toBeGreaterThan(150);
    for (const event of events) expect([event, safeText(event, "code")]).toEqual([event, event]);
  });
});

describe("describeError", () => {
  it("keeps an error's kind, its code and its message when plain", () => {
    class WalletError extends Error {
      readonly code = "requestFailed";
      constructor(message: string, options: { cause: unknown }) {
        super(message);
        this.name = "WalletError";
        this.cause = options.cause;
      }
    }
    const sdk = Object.assign(new Error(`Invoice expired: ${INVOICE}`), {
      name: "SdkError",
      tag: "Generic"
    });
    expect(describeError(new WalletError("The wallet refused", { cause: sdk }))).toEqual({
      kind: "WalletError",
      code: "requestFailed",
      message: "The wallet refused",
      cause: { kind: "SdkError", code: "Generic", message: null, cause: null }
    });
    expect(describeError(new TypeError("Network request failed"))).toEqual({
      kind: "TypeError",
      code: null,
      message: "Network request failed",
      cause: null
    });
    expect(
      describeError({ name: "AbortError", message: "The operation was aborted" })
    ).toMatchObject({ kind: "AbortError", message: "The operation was aborted" });
  });

  it("keeps no code nor kind that could be a value", () => {
    const withCode = (code: unknown) => describeError(Object.assign(new Error("x"), { code }));
    expect(withCode(ID)?.code).toBeNull();
    expect(withCode(150000)?.code).toBeNull();
    expect(withCode("relay.bakery.example")?.code).toBeNull();
    expect(withCode(404)?.code).toBe("404");
    expect(describeError(Object.assign(new Error("x"), { name: KEY }))?.kind).toBe("Error");
  });

  it("keeps no message at all of an error that may repeat what someone typed", () => {
    const typed = new Error("Invalid input", { cause: new Error("Not a lightning address") });
    expect(describeError(typed, false)).toEqual({
      kind: "Error",
      code: null,
      message: null,
      cause: { kind: "Error", code: null, message: null, cause: null }
    });
  });

  it("describes what is thrown that is no error, and nothing for nothing", () => {
    expect(describeError("Timed out")).toEqual({
      kind: "string",
      code: null,
      message: "Timed out",
      cause: null
    });
    expect(describeError(ADDRESS)).toMatchObject({ kind: "string", message: null });
    expect(describeError(42)).toEqual({ kind: "number", code: null, message: null, cause: null });
    expect(describeError(undefined)).toBeNull();
    expect(describeError(null)).toBeNull();
  });

  it("follows causes a few levels down, never further", () => {
    let error: unknown = new Error("Root");
    for (let level = 0; level < 10; level += 1) error = new Error("Above", { cause: error });
    let described = describeError(error);
    let depth = 0;
    while (described?.cause) {
      described = described.cause;
      depth += 1;
    }
    expect(depth).toBe(3);
  });
});

describe("parseLogEntry", () => {
  const error = { kind: "TypeError", code: null, message: "Network request failed", cause: null };
  const entry: LogEntry = {
    at: 1_760_000_000_000,
    level: "warning",
    event: "Syncing the team's channels failed",
    error,
    build: null,
    skipped: 2
  };

  it("reads back what the journal writes", () => {
    expect(parseLogEntry(JSON.parse(JSON.stringify(entry)))).toEqual(entry);
  });

  it("refuses an entry out of shape, or holding a value", () => {
    for (const changed of [
      { ...entry, level: "toString" },
      { ...entry, at: -1 },
      { ...entry, skipped: 1.5 },
      { ...entry, event: `Paid ${INVOICE}` },
      { ...entry, build: "3.0.0 <script>" },
      { ...entry, error: { ...error, message: `Bad ${ADDRESS}` } },
      { ...entry, error: { ...error, message: "Unknown member Alice" } },
      { ...entry, error: { ...error, code: ID } },
      { ...entry, error: { ...error, cause: "x" } }
    ]) {
      expect(parseLogEntry(changed)).toBeNull();
    }
  });
});

describe("the journal on file", () => {
  it("is in the cache, a line naming its format, then each entry appended as it comes", () => {
    logFailure("Syncing the team's channels failed", new TypeError("Network request failed"));
    expect(fileLines()).toHaveLength(2);
    expect(JSON.parse(fileLines()[0]!)).toEqual({ log: "sattleme-app-log", version: 1 });
    logEvent("App in the background");
    expect(fileLines()).toHaveLength(3);
    expect(JSON.parse(fileLines()[2]!)).toMatchObject({
      level: "info",
      event: "App in the background",
      error: null
    });
  });

  it("appends without reading the journal: its first line only, once a session", () => {
    journalOnFile(Array.from({ length: 50 }, (_, n) => entryLine(eventNamed(n), Date.now())));
    resetLog();
    const textSync = jest.spyOn(fileSystem.File.prototype, "textSync");
    const open = jest.spyOn(fileSystem.File.prototype, "open");
    logEvent("App in the foreground");
    logEvent("App in the background");
    expect(textSync).not.toHaveBeenCalled();
    // The first line read once (ReadOnly), then each entry appended.
    expect(open.mock.calls.map(([mode]) => mode)).toEqual(["r", "wa", "wa"]);
    expect(readLog().entries).toHaveLength(52);
  });

  it("is read again when the app starts again; a line cut short stays alone, left out", () => {
    logFailure("Reading the rate failed", new Error("No answer in time"));
    // The app stopped while writing an entry: its line cut short.
    fileSystem.files.set(JOURNAL, `${fileSystem.files.get(JOURNAL)}\n{"at":17600000`);
    resetLog();
    logEvent("App in the foreground");
    expect(readLog().entries.map(({ event }) => event)).toEqual([
      "Reading the rate failed",
      "App in the foreground"
    ]);
  });

  it("never keeps a value of the app's, whatever an error says", () => {
    const sdk = Object.assign(new Error(`Insufficient funds for ${INVOICE}: 150000 sats`), {
      code: ID,
      cause: new Error(`Key ${KEY} rejected by https://relay.example/${TOKEN}`, {
        cause: new Error("Unknown member Alice Smith at relay.bakery.example")
      })
    });
    logFailure(`Paying ${ADDRESS} failed`, sdk);
    const written = fileSystem.files.get(JOURNAL) ?? "";
    for (const value of [INVOICE, ADDRESS, KEY, ID, TOKEN, "150000", "relay", "Alice", "Smith"]) {
      expect([value, written.includes(value)]).toEqual([value, false]);
    }
    expect(readLog().entries[0]).toMatchObject({
      event: "An event whose text was left out",
      error: { kind: "Error", code: null, message: null, cause: { kind: "Error", message: null } }
    });
  });

  it(`gives its last ${MAX_LOG_ENTRIES} entries`, () => {
    const now = Date.now();
    const lines = Array.from({ length: MAX_LOG_ENTRIES + 300 }, (_, n) =>
      entryLine(eventNamed(n), now)
    );
    journalOnFile(lines);
    resetLog();
    const { entries } = readLog();
    expect(entries).toHaveLength(MAX_LOG_ENTRIES);
    expect(entries[0]?.event).toBe(eventNamed(300));
    expect(entries.at(-1)?.event).toBe(eventNamed(MAX_LOG_ENTRIES + 299));
  });

  it(`keeps its last entries once past ${MAX_LOG_BYTES} bytes`, () => {
    const now = Date.now();
    const count = Math.ceil(MAX_LOG_BYTES / entryLine(eventNamed(0), now).length);
    journalOnFile(Array.from({ length: count }, (_, n) => entryLine(eventNamed(n), now)));
    resetLog();
    logEvent("App in the foreground");
    const size = new TextEncoder().encode(fileSystem.files.get(JOURNAL)!).length;
    expect(size).toBeLessThanOrEqual(MAX_LOG_BYTES / 2 + HEADER.length);
    const { entries } = readLog();
    expect(entries.length).toBeLessThanOrEqual(MAX_LOG_ENTRIES);
    expect(entries.at(-1)?.event).toBe("App in the foreground");
    expect(entries.at(-2)?.event).toBe(eventNamed(count - 1));
  });

  it("gives no entry older than its retention", () => {
    jest.useFakeTimers({ now: Date.parse("2026-09-01T10:00:00Z") });
    logEvent("App in the background");
    jest.setSystemTime(Date.parse("2026-09-01T10:00:00Z") + LOG_RETENTION_MS - 1000);
    logEvent("App in the foreground");
    jest.setSystemTime(Date.parse("2026-09-01T10:00:00Z") + LOG_RETENTION_MS + 1000);
    expect(readLog().entries.map(({ event }) => event)).toEqual(["App in the foreground"]);
  });

  it("never writes over a newer app's journal: this session's entries kept in memory", () => {
    const newer = `${JSON.stringify({ log: "sattleme-app-log", version: 2 })}\n{"whatever":true}`;
    new fileSystem.Directory(DIRECTORY).create({ intermediates: true });
    fileSystem.files.set(JOURNAL, newer);
    resetLog();
    logFailure("Reading the rate failed", new Error("No answer in time"));
    expect(fileSystem.files.get(JOURNAL)).toBe(newer);
    expect(readLog().entries.map(({ event }) => event)).toEqual(["Reading the rate failed"]);
  });

  it("starts again a journal of no format of its own", () => {
    new fileSystem.Directory(DIRECTORY).create({ intermediates: true });
    fileSystem.files.set(JOURNAL, "garbage\n{}\n");
    resetLog();
    logEvent("App in the foreground");
    expect(JSON.parse(fileLines()[0]!)).toEqual({ log: "sattleme-app-log", version: 1 });
    expect(readLog().entries.map(({ event }) => event)).toEqual(["App in the foreground"]);
  });

  it("never throws: an entry the disk refuses is lost, the next one written", () => {
    logEvent("App in the background");
    const open = jest.spyOn(fileSystem.File.prototype, "open").mockImplementationOnce(() => {
      throw new Error("No space left on device");
    });
    expect(() => logFailure("Saving a setting failed", new Error("Disk full"))).not.toThrow();
    open.mockRestore();
    logEvent("App in the foreground");
    expect(readLog().entries.map(({ event }) => event)).toEqual([
      "App in the background",
      "App in the foreground"
    ]);
  });

  it("tells the console too, in development", () => {
    const error = new Error("No answer in time");
    logFailure("Reading the rate failed", error);
    expect(console.warn).toHaveBeenCalledWith("Reading the rate failed", error);
  });
});

describe("bursts", () => {
  it(`writes ${LOG_BURST} entries of a failure that repeats, then counts the others`, () => {
    jest.useFakeTimers({ now: Date.parse("2026-10-15T08:00:00Z") });
    for (let n = 0; n < 40; n += 1) {
      logFailure("Reading the rate failed", new TypeError("Network request failed"));
      jest.advanceTimersByTime(1000);
    }
    // Another failure of the same event: an entry of its own.
    logFailure("Reading the rate failed", Object.assign(new Error("x"), { code: "timeout" }));
    let log = readLog();
    expect(log.entries).toHaveLength(LOG_BURST + 1);
    expect(log.leftOut).toEqual([
      {
        level: "warning",
        event: "Reading the rate failed",
        kind: "TypeError",
        code: null,
        count: 40 - LOG_BURST,
        lastAt: Date.parse("2026-10-15T08:00:39Z")
      }
    ]);

    // Its window over: written again, saying how many were left out.
    jest.setSystemTime(Date.parse("2026-10-15T08:00:00Z") + LOG_BURST_WINDOW_MS);
    logFailure("Reading the rate failed", new TypeError("Network request failed"));
    log = readLog();
    expect(log.entries.at(-1)).toMatchObject({ skipped: 40 - LOG_BURST });
    expect(log.leftOut).toEqual([]);
  });
});

describe('"Log out"', () => {
  it("removes the journal: nothing of it is written again", async () => {
    logFailure("Syncing the team's channels failed", new TypeError("Network request failed"));
    await wipeDevice();
    expect(fileSystem.files.has(JOURNAL)).toBe(false);
    expect(readLog().entries).toEqual([]);
    logEvent("App in the foreground");
    expect(readLog().entries.map(({ event }) => event)).toEqual(["App in the foreground"]);
    expect(fileLines()).toHaveLength(2);
  });
});

describe("the app's start, its comings and goings, its uncaught errors", () => {
  const info = {
    variant: "staging",
    version: "3.0.0",
    buildNumber: "3000000",
    commit: "f82ecab",
    updates: {
      channel: "staging",
      runtimeVersion: "abc",
      updateId: "1a2b3c4d-0000-4000-8000-000000000000"
    }
  };

  it("notes the build", () => {
    jest.spyOn(Platform, "Version", "get").mockReturnValue("18.1");
    expect(appBuild(info)).toBe(
      `3.0.0 (3000000) f82ecab staging update 1a2b3c4d ${Platform.OS} 18.1`
    );
    logStart(appBuild(info));
    expect(readLog().entries[0]).toMatchObject({ event: "App started", build: appBuild(info) });
    // A build out of shape is not noted.
    logStart("3.0.0 <script>");
    expect(readLog().entries[1]).toMatchObject({ event: "App started", build: null });
  });

  it("notes the app's comings and goings, and an error before React Native's handler", () => {
    const previous = jest.fn();
    const saved = Object.getOwnPropertyDescriptor(globalThis, "ErrorUtils");
    let handler: ((error: unknown, isFatal?: boolean) => void) | null = null;
    Object.defineProperty(globalThis, "ErrorUtils", {
      value: {
        getGlobalHandler: () => previous,
        setGlobalHandler: (next: typeof handler) => (handler = next)
      },
      configurable: true
    });
    const listeners: ((state: string) => void)[] = [];
    jest.spyOn(AppState, "addEventListener").mockImplementation((_type, listener) => {
      listeners.push(listener as (state: string) => void);
      return { remove: () => undefined };
    });
    try {
      startAppLog(info);
      // Once only.
      startAppLog(info);
      for (const state of ["inactive", "background", "background", "active"]) {
        for (const listener of listeners) listener(state);
      }
      expect(readLog().entries.map(({ event }) => event)).toEqual([
        "App started",
        "App in the background",
        "App in the foreground"
      ]);

      const crash = new TypeError("Cannot read properties of undefined");
      previous.mockImplementation(() => {
        // On file before React Native's handler stops the app.
        expect(fileSystem.files.get(JOURNAL)).toContain("The app stopped on an uncaught error");
      });
      handler!(crash, true);
      expect(previous).toHaveBeenCalledWith(crash, true);
      expect(readLog().entries.at(-1)).toMatchObject({
        level: "error",
        event: "The app stopped on an uncaught error",
        error: { kind: "TypeError", message: "Cannot read properties of undefined" }
      });
    } finally {
      if (saved) Object.defineProperty(globalThis, "ErrorUtils", saved);
      else delete (globalThis as { ErrorUtils?: unknown }).ErrorUtils;
    }
  });

  it("notes an error while rendering, then lets it stop the app as before", async () => {
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    function Broken(): ReactElement {
      throw new TypeError("Cannot read properties of undefined");
    }
    await expect(
      render(
        <LogRenderErrors>
          <Broken />
        </LogRenderErrors>
      )
    ).rejects.toThrow("Cannot read properties of undefined");
    expect(readLog().entries).toEqual([
      expect.objectContaining({
        level: "error",
        event: "The app stopped on an error while rendering",
        error: expect.objectContaining({ kind: "TypeError" })
      })
    ]);
  });

  it("renders its children as they are", async () => {
    const shown = await render(
      <LogRenderErrors>
        <Text>Charge</Text>
      </LogRenderErrors>
    );
    expect(shown.getByText("Charge")).toBeTruthy();
    await act(async () => undefined);
    expect(readLog().entries).toEqual([]);
  });

  it("notes the promises rejected with nothing to catch them, in a release build only", () => {
    let options: { onUnhandled(id: number, rejection: unknown): void } | null = null;
    const enablePromiseRejectionTracker = jest.fn((given: typeof options) => (options = given));
    const saved = Object.getOwnPropertyDescriptor(globalThis, "HermesInternal");
    const dev = Object.getOwnPropertyDescriptor(globalThis, "__DEV__");
    Object.defineProperty(globalThis, "HermesInternal", {
      value: { enablePromiseRejectionTracker },
      configurable: true
    });
    try {
      // Development: React Native's own tracker stays.
      logUnhandledRejections();
      expect(enablePromiseRejectionTracker).not.toHaveBeenCalled();
      Object.defineProperty(globalThis, "__DEV__", { value: false, configurable: true });
      logUnhandledRejections();
      logUnhandledRejections();
      expect(enablePromiseRejectionTracker).toHaveBeenCalledTimes(1);
      options!.onUnhandled(1, new Error("No answer in time"));
      expect(readLog().entries).toEqual([
        expect.objectContaining({
          level: "error",
          event: "A promise rejected with nothing to catch it",
          error: expect.objectContaining({ message: "No answer in time" })
        })
      ]);
    } finally {
      if (dev) Object.defineProperty(globalThis, "__DEV__", dev);
      if (saved) Object.defineProperty(globalThis, "HermesInternal", saved);
      else delete (globalThis as { HermesInternal?: unknown }).HermesInternal;
    }
  });
});
