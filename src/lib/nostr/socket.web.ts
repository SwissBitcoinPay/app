import { logFailure } from "@/lib/log/log";
import { mayBeOnLocalNetwork } from "@/lib/relays/list";

import { prepareLocalNetworkAccess } from "./local-network";
import { RELAY_FRAME_SCRIPT } from "./relay-frame-script";

/*
 * Relay connections of the web app, opened from an isolated frame. A
 * browser sends the page's origin with every WebSocket handshake (`Origin` header, set by the
 * browser itself): each relay would learn that the connection, and the events it carries, come
 * from this app's domain. A frame sandboxed without `allow-same-origin` has an opaque origin: its
 * connections say `Origin: null`, as those of any sandboxed or local page.
 *
 * The frame only relays frames: it opens the sockets the page asks for and passes their messages
 * on. Nothing else runs in it, it reads nothing of the page. A browser that does not start it in
 * time gets direct connections (`FRAME_TIMEOUT_MS`), so that the app keeps working there.
 *
 * A relay the browser may count as one of the local network (mayBeOnLocalNetwork) is connected to
 * once the browser was asked for access to it (prepareLocalNetworkAccess, local-network.web.ts):
 * Chromium refuses the frame's sockets to the local network without asking, and lets them through
 * once the page was allowed, only because the frame is delegated the permission
 * (`allow="local-network"`).
 */

/** Same API as socket.ts. */
export function createRelaySocket(url: string): WebSocket {
  return new FrameSocket(url) as unknown as WebSocket;
}

/** Past this, a frame that never said it was ready is given up for direct connections. */
const FRAME_TIMEOUT_MS = 3000;

const CONNECTING = 0;
const OPEN = 1;
const CLOSING = 2;
const CLOSED = 3;

/** Page → frame. */
type Command =
  | { op: "open"; id: number; url: string }
  | { op: "send"; id: number; data: string }
  | { op: "close"; id: number };

/** Frame → page. */
type Report =
  | { type: "ready" }
  | { type: "open" | "error" | "close"; id: number }
  | { type: "message"; id: number; data: string };

/**
 * The frame's whole document: its script (relay-frame-script.ts), which the web app's
 * Content-Security-Policy allows by its hash. Nothing else of the page goes into it.
 */
function frameDocument(): string {
  return `<!doctype html><meta charset="utf-8"><script>${RELAY_FRAME_SCRIPT}</script>`;
}

/** The frame's port once it said it is ready; null when it never did (direct connections). */
let frame: Promise<MessagePort | null> | null = null;
const sockets = new Map<number, FrameSocket>();
let nextId = 1;

function startFrame(): Promise<MessagePort | null> {
  return new Promise((resolve) => {
    const element = document.createElement("iframe");
    element.setAttribute("sandbox", "allow-scripts");
    // The page's local network permission reaches the frame's sockets only once delegated to it
    // (Permissions Policy; see local-network.web.ts). Its origin stays opaque.
    element.setAttribute("allow", "local-network");
    element.setAttribute("aria-hidden", "true");
    element.setAttribute("title", "");
    element.tabIndex = -1;
    element.style.display = "none";
    // The only origin the frame gives its port to (relay-frame-script.ts): the page's.
    element.setAttribute("name", window.location.origin);
    element.srcdoc = frameDocument();
    const timer = setTimeout(() => {
      window.removeEventListener("message", onReady);
      logFailure("The relay frame did not start: direct relay connections");
      resolve(null);
    }, FRAME_TIMEOUT_MS);
    const onReady = (event: MessageEvent) => {
      const port = event.ports?.[0];
      if (
        event.source !== element.contentWindow ||
        (event.data as Report)?.type !== "ready" ||
        !port
      ) {
        return;
      }
      clearTimeout(timer);
      window.removeEventListener("message", onReady);
      // From then on, the frame's reports come on its port only.
      port.onmessage = (message) => dispatch(message.data as Report);
      resolve(port);
    };
    window.addEventListener("message", onReady);
    document.body.appendChild(element);
  });
}

function dispatch(report: Report) {
  if (report.type === "ready") return;
  sockets.get(report.id)?.receive(report);
}

/**
 * The part of the WebSocket API the relay client uses (relay.ts), over a socket of the frame, or a
 * direct one where the frame could not start.
 */
class FrameSocket {
  readyState: number = CONNECTING;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  private readonly id = nextId++;
  private target: MessagePort | null = null;
  private direct: WebSocket | null = null;

  constructor(url: string) {
    frame ??= startFrame();
    const ready = mayBeOnLocalNetwork(url)
      ? Promise.all([frame, prepareLocalNetworkAccess(url)]).then(([target]) => target)
      : frame;
    void ready.then((target) => {
      if (this.readyState === CLOSED) return;
      if (target) {
        this.target = target;
        sockets.set(this.id, this);
        this.post({ op: "open", id: this.id, url });
      } else {
        this.openDirect(url);
      }
    });
  }

  send(data: string) {
    if (this.readyState !== OPEN) throw new Error("The relay connection is not open");
    if (this.direct) this.direct.send(data);
    else this.post({ op: "send", id: this.id, data });
  }

  close() {
    if (this.readyState === CLOSED || this.readyState === CLOSING) return;
    if (this.direct) {
      this.readyState = CLOSING;
      this.direct.close();
    } else if (this.target) {
      this.readyState = CLOSING;
      this.post({ op: "close", id: this.id });
    } else {
      // The frame is still starting, or the browser asking for access: nothing was opened yet.
      this.finish();
    }
  }

  receive(report: Report) {
    switch (report.type) {
      case "open":
        if (this.readyState !== CONNECTING) return;
        this.readyState = OPEN;
        this.onopen?.();
        return;
      case "message":
        if (this.readyState === OPEN) this.onmessage?.({ data: report.data });
        return;
      case "error":
        this.onerror?.();
        return;
      case "close":
        this.finish();
        return;
      case "ready":
        return;
    }
  }

  private finish() {
    if (this.readyState === CLOSED) return;
    this.readyState = CLOSED;
    sockets.delete(this.id);
    this.onclose?.();
  }

  private post(command: Command) {
    this.target?.postMessage(command);
  }

  private openDirect(url: string) {
    const socket = new WebSocket(url);
    this.direct = socket;
    socket.onopen = () => this.receive({ type: "open", id: this.id });
    socket.onmessage = (event: MessageEvent) =>
      this.receive({ type: "message", id: this.id, data: String(event.data) });
    socket.onerror = () => this.receive({ type: "error", id: this.id });
    socket.onclose = () => this.finish();
  }
}
