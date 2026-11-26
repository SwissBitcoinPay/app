// The iOS extension engine's runtime (src/lib/engine/runtime/) and the packages its bundle takes
// from src/lib/engine/shims/, over a fake of the extension's host (jest/engine-host.ts).
import { EngineAbortController, abortError } from "@/lib/engine/runtime/abort";
import { engineFetch } from "@/lib/engine/runtime/fetch";
import { engineWebSocket } from "@/lib/engine/runtime/socket";
import { engineConsole, enginePerformance, engineTimers } from "@/lib/engine/runtime/timers";
import { webAtob, webBtoa } from "@/lib/engine/web-base64";

import { fakeEngineHost, type FakeEngineHost } from "../../jest/engine-host";

const { randomBytes } = jest.requireActual<{ randomBytes(length: number): Uint8Array }>("crypto");
const { Buffer } = jest.requireActual<{
  Buffer: {
    from(text: string, encoding: "latin1" | "base64"): { toString(encoding: string): string };
  };
}>("buffer");

const scope = globalThis as { __sattlemeHost?: unknown };
let host: FakeEngineHost;

beforeEach(() => {
  host = fakeEngineHost((length) => Array.from(randomBytes(length)));
  scope.__sattlemeHost = host;
});

afterEach(() => {
  host.stop();
  delete scope.__sattlemeHost;
});

function settle(ms = 5): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** A deterministic pseudo-random source (tests only): xorshift32. */
function generator(seed: number) {
  let state = seed >>> 0 || 1;
  return (bound: number) => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) % bound;
  };
}

describe("the timers, the clock and the console", () => {
  it("call back once, with their arguments, unless cleared; a callback that throws is logged", async () => {
    const timers = engineTimers(host);
    const calls: unknown[] = [];
    timers.setTimeout((...args) => calls.push(args), 2, "a", 1);
    const cleared = timers.setTimeout(() => calls.push("cleared"), 2);
    timers.clearTimeout(cleared);
    timers.setTimeout(() => {
      throw new Error("broken");
    }, 1);
    await settle(10);
    expect(calls).toEqual([["a", 1]]);
    expect(host.logs).toEqual([
      { level: "error", text: "A timer's callback threw: Error: broken" }
    ]);
    expect(() => timers.setTimeout("code" as never)).toThrow(TypeError);
    expect(enginePerformance(host).now()).toBeGreaterThan(0);
    engineConsole(host).warn("Something", 2);
    expect(host.logs[1]).toEqual({ level: "warn", text: "Something 2" });
  });
});

describe("AbortController", () => {
  it("aborts once, telling each listener once, with an AbortError or the reason given", () => {
    const controller = new EngineAbortController();
    const heard: string[] = [];
    const listener = () => heard.push("listener");
    const removed = () => heard.push("removed");
    controller.signal.addEventListener("abort", listener);
    controller.signal.addEventListener("abort", removed);
    controller.signal.removeEventListener("abort", removed);
    controller.signal.onabort = () => heard.push("onabort");
    expect(() => controller.signal.throwIfAborted()).not.toThrow();
    controller.abort();
    controller.abort("again");
    expect(heard).toEqual(["onabort", "listener"]);
    expect(controller.signal.aborted).toBe(true);
    expect(controller.signal.reason).toMatchObject({ name: "AbortError" });
    expect(() => controller.signal.throwIfAborted()).toThrow("This operation was aborted");
    const withReason = new EngineAbortController();
    withReason.abort("gone");
    expect(withReason.signal.reason).toBe("gone");
    expect(abortError().name).toBe("AbortError");
  });
});

describe("fetch", () => {
  const relayInfo = {
    status: 200,
    url: "https://relay.example/v1/info",
    redirected: false,
    headers: [
      ["Content-Type", "application/json"],
      ["Vary", "Origin"],
      ["vary", "Accept"]
    ] as [string, string][],
    body: '{"version":"2.6.0"}'
  };

  it("sends the request as asked, and reads the answer once, as text or JSON", async () => {
    host.respond = () => relayInfo;
    const fetch = engineFetch(host);
    const response = await fetch("https://relay.example/v1/info", {
      method: "post",
      headers: { Accept: "application/json" },
      body: "{}",
      redirect: "error"
    });
    expect(host.requests).toEqual([
      {
        url: "https://relay.example/v1/info",
        method: "POST",
        headers: [["Accept", "application/json"]],
        body: "{}",
        noRedirect: true
      }
    ]);
    expect(response).toMatchObject({ status: 200, ok: true, redirected: false, bodyUsed: false });
    expect(response.headers.get("content-type")).toBe("application/json");
    expect(response.headers.get("VARY")).toBe("Origin, Accept");
    expect(response.headers.get("x-none")).toBeNull();
    expect(await response.json()).toEqual({ version: "2.6.0" });
    await expect(response.text()).rejects.toThrow(TypeError);
    host.respond = () => ({ ...relayInfo, status: 404, body: "not found" });
    const missing = await fetch(new URL("https://relay.example/v1/none"));
    expect(missing.ok).toBe(false);
    expect(await missing.text()).toBe("not found");
    expect(host.requests[1]).toMatchObject({ method: "GET", headers: [], body: null });
  });

  it("refuses what it does not support, never ignoring it", async () => {
    const fetch = engineFetch(host);
    await expect(fetch("http://relay.example/")).rejects.toThrow("HTTPS URLs only here");
    await expect(fetch("https://relay.example/", { redirect: "manual" })).rejects.toThrow(
      'redirect "manual" is not supported here'
    );
    await expect(
      fetch("https://relay.example/", { body: new Uint8Array(1) as never })
    ).rejects.toThrow("Text bodies only here");
    await expect(fetch("https://relay.example/", { headers: [["a"]] as never })).rejects.toThrow(
      "Headers are text pairs here"
    );
    expect(host.requests).toEqual([]);
    host.respond = () => "The Internet connection appears to be offline.";
    await expect(fetch("https://relay.example/")).rejects.toThrow(
      new TypeError("The Internet connection appears to be offline.")
    );
  });

  it("is aborted by its signal, before or while it runs, the host's request cancelled", async () => {
    host.respond = () => relayInfo;
    const fetch = engineFetch(host);
    const before = new EngineAbortController();
    before.abort("before");
    await expect(fetch("https://relay.example/", { signal: before.signal })).rejects.toBe("before");
    expect(host.requests).toEqual([]);
    const during = new EngineAbortController();
    const running = fetch("https://relay.example/", { signal: during.signal });
    during.abort();
    await expect(running).rejects.toMatchObject({ name: "AbortError" });
    expect(host.cancelled).toHaveLength(1);
  });
});

describe("WebSocket", () => {
  it("opens, sends and receives text, then closes", async () => {
    host.serve = () => ({ receive: (text) => [`echo ${text}`] });
    const Socket = engineWebSocket(host);
    const socket = new Socket("wss://relay.example");
    const heard: unknown[] = [];
    socket.onopen = () => heard.push("open");
    socket.onmessage = (event) => heard.push(event.data);
    socket.onclose = (event) => heard.push([event.code, event.wasClean]);
    expect(socket.readyState).toBe(Socket.CONNECTING);
    expect(() => socket.send("too soon")).toThrow("still connecting");
    await settle();
    expect(socket.readyState).toBe(socket.OPEN);
    socket.send('["REQ"]');
    expect(() => socket.send(new Uint8Array(1))).toThrow(TypeError);
    await settle();
    socket.close();
    expect(socket.readyState).toBe(Socket.CLOSING);
    socket.send("dropped");
    await settle();
    expect(socket.readyState).toBe(Socket.CLOSED);
    expect(heard).toEqual(["open", 'echo ["REQ"]', [1000, true]]);
    expect([...host.sockets.values()][0].sent).toEqual(['["REQ"]']);
  });

  it("tells an error, then its close, when the connection fails; never opens once closed", async () => {
    const Socket = engineWebSocket(host);
    const refused = new Socket("wss://down.example");
    const heard: unknown[] = [];
    refused.onerror = () => heard.push("error");
    refused.onclose = (event) => heard.push(event.code);
    host.serve = () => ({ receive: () => [] });
    const closedEarly = new Socket("wss://relay.example");
    closedEarly.onopen = () => heard.push("open");
    closedEarly.close();
    await settle();
    expect(heard).toEqual(["error", 1006]);
    expect(closedEarly.readyState).toBe(Socket.CLOSED);
    expect(() => new Socket("ws://relay.example")).toThrow("wss URLs only here");
    expect(() => new Socket("wss://relay.example", ["nostr"])).toThrow("No WebSocket protocols");
  });
});

describe("atob and btoa", () => {
  const nodeAtob = (text: string) => Buffer.from(text, "base64").toString("latin1");
  const nodeBtoa = (text: string) => Buffer.from(text, "latin1").toString("base64");

  it("encode what Node encodes, refusing what is not Latin-1", () => {
    const next = generator(3);
    for (let i = 0; i < 2000; i++) {
      const text = String.fromCharCode(...Array.from({ length: next(20) }, () => next(256)));
      expect(webBtoa(text)).toBe(nodeBtoa(text));
    }
    expect(() => webBtoa("€")).toThrow(expect.objectContaining({ name: "InvalidCharacterError" }));
  });

  it("decode what the HTML standard decodes: whitespace, missing padding and spare bits forgiven", () => {
    const next = generator(5);
    for (let i = 0; i < 2000; i++) {
      const text = String.fromCharCode(...Array.from({ length: next(20) }, () => next(256)));
      const encoded = nodeBtoa(text);
      expect(webAtob(encoded)).toBe(text);
      expect(webAtob(encoded)).toBe(nodeAtob(encoded));
      expect(webAtob(encoded.replace(/=+$/, ""))).toBe(text);
    }
    expect(webAtob(" Y W\tJj\nZA= =")).toBe("abcd");
    // Spare bits dropped: "YR" and "YQ" read alike.
    expect(webAtob("YR")).toBe("a");
    for (const invalid of ["Y", "YWJjZ", "YW=J", "YW===", "YW_-", "Y€"]) {
      expect(() => webAtob(invalid)).toThrow(
        expect.objectContaining({ name: "InvalidCharacterError" })
      );
    }
  });
});

describe("the shims of the engine's bundle", () => {
  type FileSystem = typeof import("@/lib/engine/shims/expo-file-system");
  const fileSystem = () => jest.requireActual<FileSystem>("../lib/engine/shims/expo-file-system");

  it("expo-file-system: the app group's container only, its writes the extension's only", () => {
    const { Directory, File, Paths } = fileSystem();
    const container = Paths.appleSharedContainers["group.example.cards"];
    expect(container.path).toBe("");
    expect(Object.keys(Paths.appleSharedContainers)).toEqual(["group.example.cards"]);
    expect(() => Paths.document).toThrow("not the extension's");
    expect(() => Paths.cache).toThrow("not the extension's");
    host.stored.set("card-payments/log.json", "{}");
    host.directories.add("card-payments");
    const directory = new Directory(container, "card-payments");
    const log = new File(directory, "log.json");
    expect([directory.exists, log.exists, log.textSync(), log.name]).toEqual([
      true,
      true,
      "{}",
      "log.json"
    ]);
    expect(() => log.writeSync("[]")).toThrow("The app's, not the extension's");
    expect(() => new File(directory, "log.json.tmp").moveSync(log)).toThrow();
    const own = new Directory(container, "extension/payments");
    own.create({ intermediates: true, idempotent: true });
    own.create({ intermediates: true, idempotent: true });
    const draft = new File(own, "log.json.tmp");
    draft.writeSync("[1]");
    draft.moveSync(new File(own, "log.json"), { overwrite: true });
    expect(host.stored.get("extension/payments/log.json")).toBe("[1]");
    expect(draft.path).toBe("extension/payments/log.json");
    expect(() => new File(own, "a").writeSync("x", { append: true })).toThrow("No append");
    expect(() => new File(container, "../outside")).toThrow("No relative segment");
    expect(() => new File("file:///etc/passwd" as never)).toThrow("container only");
    own.delete();
    expect(own.exists).toBe(false);
  });

  it("expo-constants: the build's settings the host gives, none when unreadable", () => {
    type Constants = { default: { expoConfig: { extra: Record<string, unknown> } } };
    const constants = jest.requireActual<Constants>("../lib/engine/shims/expo-constants").default;
    expect(constants.expoConfig.extra).toEqual({ cardAppGroup: "group.example.cards" });
    host.config = () => "[1]";
    expect(constants.expoConfig.extra).toEqual({});
    host.config = () => "not json";
    expect(constants.expoConfig.extra).toEqual({});
  });

  it("react-native: iOS, never in front", () => {
    const { AppState, Platform } = jest.requireActual<{
      AppState: { currentState: string; addEventListener(type: string, f: () => void): unknown };
      Platform: { OS: string };
    }>("../lib/engine/shims/react-native");
    expect(Platform.OS).toBe("ios");
    expect(AppState.currentState).toBe("background");
    expect(AppState.addEventListener("change", () => undefined)).toEqual({
      remove: expect.any(Function)
    });
  });
});
