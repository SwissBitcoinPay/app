import type { EngineRuntimeHost } from "../host";

/*
 * WebSocket over the host's (EngineRuntimeHost.openSocket), as the app uses it (relay-session.ts,
 * nostr/relay.ts): wss URLs, text frames, `readyState`, `send`, `close`, and the `onopen`,
 * `onmessage`, `onerror` and `onclose` handlers. A failed connection tells `error`, then `close`,
 * as the web's.
 */

const CONNECTING = 0;
const OPEN = 1;
const CLOSING = 2;
const CLOSED = 3;

type Handler<E> = ((event: E) => void) | null;

export function engineWebSocket(host: EngineRuntimeHost) {
  return class EngineWebSocket {
    static readonly CONNECTING = CONNECTING;
    static readonly OPEN = OPEN;
    static readonly CLOSING = CLOSING;
    static readonly CLOSED = CLOSED;
    readonly CONNECTING = CONNECTING;
    readonly OPEN = OPEN;
    readonly CLOSING = CLOSING;
    readonly CLOSED = CLOSED;

    readonly url: string;
    readyState = CONNECTING;
    onopen: Handler<{ type: "open" }> = null;
    onmessage: Handler<{ type: "message"; data: string }> = null;
    onerror: Handler<{ type: "error" }> = null;
    onclose: Handler<{ type: "close"; code: number; reason: string; wasClean: boolean }> = null;
    private readonly id: number;

    constructor(url: string, protocols?: unknown) {
      if (protocols !== undefined) throw new TypeError("No WebSocket protocols here");
      if (!/^wss:\/\//i.test(url)) throw new SyntaxError("wss URLs only here");
      this.url = url;
      this.id = host.openSocket(url, {
        open: () => {
          if (this.readyState !== CONNECTING) return;
          this.readyState = OPEN;
          this.onopen?.({ type: "open" });
        },
        message: (text) => {
          if (this.readyState !== OPEN) return;
          this.onmessage?.({ type: "message", data: text });
        },
        error: () => {
          if (this.readyState === CLOSED) return;
          this.onerror?.({ type: "error" });
        },
        close: (code, reason) => {
          if (this.readyState === CLOSED) return;
          this.readyState = CLOSED;
          this.onclose?.({ type: "close", code, reason, wasClean: code === 1000 });
        }
      });
    }

    send(text: unknown): void {
      if (this.readyState === CONNECTING) throw new Error("InvalidStateError: still connecting");
      if (typeof text !== "string") throw new TypeError("Text frames only here");
      // Closing or closed: dropped, as the web's.
      if (this.readyState === OPEN) host.sendSocket(this.id, text);
    }

    close(code = 1000, reason = ""): void {
      if (this.readyState === CLOSING || this.readyState === CLOSED) return;
      this.readyState = CLOSING;
      host.closeSocket(this.id, code, reason);
    }
  };
}
