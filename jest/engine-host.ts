import type {
  EngineRuntimeHost,
  HostRequest,
  HostResponse,
  HostSocketEvents
} from "../src/lib/engine/host";

/**
 * A fake of the iOS extension's host (src/lib/engine/host.ts, EngineHost.swift) for the engine's
 * tests: timers on the test's own clock, an in-memory app group container (paths relative to it)
 * whose writes it refuses but under `extension/`, as the host does, the card items the app shares,
 * HTTP answered by `respond`, and WebSockets answered by `serve`.
 */
export type FakeEngineHost = EngineRuntimeHost & {
  steps: string[];
  logs: { level: string; text: string }[];
  /** Files of the container, by path; directories. */
  stored: Map<string, string>;
  directories: Set<string>;
  items: Map<string, string>;
  settings: Record<string, unknown>;
  requests: HostRequest[];
  cancelled: number[];
  /** Answers a request: a response, or an error's message. */
  respond: (request: HostRequest) => HostResponse | string;
  /** A WebSocket's server: opened (or refused), each text sent, closed. */
  serve: (url: string) => FakeSocketServer | null;
  /** The WebSockets opened, by id. */
  sockets: Map<number, FakeSocket>;
  /** Cancels every timer, request and socket left (a test's end). */
  stop(): void;
};

type FakeSocket = {
  url: string;
  events: HostSocketEvents;
  sent: string[];
  closed: boolean;
  server: FakeSocketServer | null;
};

export type FakeSocketServer = {
  /** A text the engine sent: what the server answers, each a frame. */
  receive(text: string): string[];
};

/** Writable by the extension: its own files only (the app writes the others). */
const WRITABLE = /^extension(\/|$)/;

function clean(path: string): string {
  if (path.split("/").some((segment) => segment === "." || segment === "..")) {
    throw new Error(`Out of the container: ${path}`);
  }
  return path;
}

function writable(path: string): string {
  if (!WRITABLE.test(clean(path))) throw new Error(`The app's, not the extension's: ${path}`);
  return path;
}

export function fakeEngineHost(
  random: (length: number) => number[],
  settings: Record<string, unknown> = { cardAppGroup: "group.example.cards" }
): FakeEngineHost {
  let next = 1;
  const timers = new Map<number, ReturnType<typeof setTimeout>>();
  const pending = new Map<number, ReturnType<typeof setTimeout>>();
  const host: FakeEngineHost = {
    steps: [],
    logs: [],
    stored: new Map(),
    directories: new Set([""]),
    items: new Map(),
    settings,
    requests: [],
    cancelled: [],
    respond: () => "offline",
    serve: () => null,
    sockets: new Map(),
    stop() {
      for (const timer of [...timers.values(), ...pending.values()]) clearTimeout(timer);
      timers.clear();
      pending.clear();
      for (const socket of host.sockets.values()) socket.closed = true;
    },
    random,
    step: (name) => host.steps.push(name),
    monotonic: () => performance.now(),
    setTimer(ms, callback) {
      const id = next++;
      timers.set(
        id,
        setTimeout(() => {
          timers.delete(id);
          callback();
        }, ms)
      );
      return id;
    },
    clearTimer(id) {
      clearTimeout(timers.get(id));
      timers.delete(id);
    },
    log: (level, text) => host.logs.push({ level, text }),
    fetch(request, done) {
      const id = next++;
      host.requests.push(request);
      pending.set(
        id,
        setTimeout(() => {
          pending.delete(id);
          const answer = host.respond(request);
          if (typeof answer === "string") done(null, answer);
          else done(answer, null);
        }, 1)
      );
      return id;
    },
    cancelFetch(id) {
      host.cancelled.push(id);
      clearTimeout(pending.get(id));
      pending.delete(id);
    },
    openSocket(url, events) {
      const id = next++;
      const server = host.serve(url);
      const socket: FakeSocket = { url, events, sent: [], closed: false, server };
      host.sockets.set(id, socket);
      setTimeout(() => {
        if (socket.closed) return;
        if (!server) {
          events.error();
          socket.closed = true;
          events.close(1006, "");
          return;
        }
        events.open();
      }, 1);
      return id;
    },
    sendSocket(id, text) {
      const socket = host.sockets.get(id);
      if (!socket || socket.closed) return;
      socket.sent.push(text);
      const answers = socket.server?.receive(text) ?? [];
      setTimeout(() => {
        for (const answer of answers) if (!socket.closed) socket.events.message(answer);
      }, 1);
    },
    closeSocket(id, code, reason) {
      const socket = host.sockets.get(id);
      if (!socket || socket.closed) return;
      socket.closed = true;
      setTimeout(() => socket.events.close(code, reason), 1);
    },
    cardItem: (key) => host.items.get(key) ?? null,
    config: () => JSON.stringify(host.settings),
    files: {
      exists: (path) => host.stored.has(clean(path)) || host.directories.has(path),
      isDirectory: (path) => host.directories.has(clean(path)),
      read(path) {
        const text = host.stored.get(clean(path));
        if (text === undefined) throw new Error(`No file ${path}`);
        return text;
      },
      write(path, text) {
        const parent = path.slice(0, Math.max(0, path.lastIndexOf("/")));
        if (!host.directories.has(parent)) throw new Error(`No directory for ${path}`);
        host.stored.set(writable(path), text);
      },
      move(from, to, overwrite) {
        const text = host.stored.get(writable(from));
        if (text === undefined) throw new Error(`No file ${from}`);
        if (host.stored.has(writable(to)) && !overwrite) throw new Error(`${to} exists`);
        host.stored.delete(from);
        host.stored.set(to, text);
      },
      makeDirectory(path) {
        const segments = writable(path).split("/");
        segments.forEach((_, index) =>
          host.directories.add(segments.slice(0, index + 1).join("/"))
        );
      },
      remove(path) {
        writable(path);
        for (const file of [...host.stored.keys()]) {
          if (file === path || file.startsWith(`${path}/`)) host.stored.delete(file);
        }
        for (const directory of [...host.directories]) {
          if (directory === path || directory.startsWith(`${path}/`)) {
            host.directories.delete(directory);
          }
        }
      }
    }
  };
  return host;
}
