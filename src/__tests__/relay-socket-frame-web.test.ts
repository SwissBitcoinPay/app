import { RELAY_FRAME_SCRIPT } from "@/lib/nostr/relay-frame-script";
import { createRelaySocket } from "@/lib/nostr/socket.web";

/*
 * The web app's relay frame and the page talk over a channel of their own: the frame's port goes
 * to the page with "ready", to the page's origin only, and
 * neither listens to the window's messages afterwards. Jest has no DOM: the frame's own script
 * runs here against fakes of its window (`parent`, `addEventListener`, `WebSocket`), with Node's
 * MessageChannel.
 */

jest.mock("@/lib/nostr/local-network", () => ({ prepareLocalNetworkAccess: jest.fn() }));

const ORIGIN = "https://app.example";

type Listener = (event: Partial<MessageEvent>) => void;

/** The page's window message listeners. */
const pageListeners = new Set<Listener>();
/** The frame's window: the source of the messages it posts to the page. */
const frameWindow = {};
/** The target origins the frame posted to. */
const postedTo: string[] = [];
/** Whether the frame listened to its window's messages. */
const frameWindowListener = jest.fn();

/** The frame's sockets, by address. */
const frameSockets = new Map<string, FrameWebSocket>();

class FrameWebSocket {
  readyState = 0;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  constructor(url: string) {
    frameSockets.set(url, this);
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.onclose?.();
  }
}

/** The frame's attributes, as socket.web.ts sets them. */
const frameAttributes = new Map<string, string>();

const element: { srcdoc?: string; contentWindow: object; [key: string]: unknown } = {
  setAttribute: (name: string, value: string) => frameAttributes.set(name, value),
  style: {},
  contentWindow: frameWindow,
  tabIndex: 0
};

/** The frame's channels, closed after the tests: an open port keeps Jest's worker alive. */
const channels: MessageChannel[] = [];
class RecordedChannel extends MessageChannel {
  constructor() {
    super();
    channels.push(this);
  }
}

/** What the frame's port carries: delivered on Node's event loop. */
const delivered = () => new Promise<void>((resolve) => setImmediate(resolve));

/** Posts a message to the page's window, as `source`. */
function postToPage(source: object, data: unknown, ports: MessagePort[] = []) {
  for (const listener of [...pageListeners]) {
    listener({ source: source as Window, data, ports });
  }
}

/** Runs the frame's script as the browser would, in its own window. */
function startFrameScript(srcdoc: string) {
  const script = /<script>([\s\S]*)<\/script>/.exec(srcdoc)?.[1] ?? "";
  const parent = {
    postMessage: (data: unknown, targetOrigin: string, transfer: MessagePort[] = []) => {
      postedTo.push(targetOrigin);
      postToPage(frameWindow, data, transfer);
    }
  };
  // Its window's name is the frame's `name` attribute, as a browser gives it.
  const frameSelf = { name: frameAttributes.get("name") ?? "" };
  new Function("parent", "window", "addEventListener", "WebSocket", "MessageChannel", script)(
    parent,
    frameSelf,
    frameWindowListener,
    FrameWebSocket,
    RecordedChannel
  );
}

const saved = (["document", "window"] as const).map(
  (name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const
);

beforeAll(() => {
  Object.defineProperty(globalThis, "document", {
    value: {
      createElement: () => element,
      body: { appendChild: () => startFrameScript(element.srcdoc ?? "") }
    },
    configurable: true
  });
  Object.defineProperty(globalThis, "window", {
    value: {
      addEventListener: (_: string, listener: Listener) => pageListeners.add(listener),
      removeEventListener: (_: string, listener: Listener) => pageListeners.delete(listener),
      location: { origin: ORIGIN }
    },
    configurable: true
  });
});

afterAll(() => {
  for (const channel of channels) {
    channel.port1.close();
    channel.port2.close();
  }
  for (const [name, descriptor] of saved) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete (globalThis as Record<string, unknown>)[name];
  }
});

/** A relay socket of the page, opened through the frame. */
async function openThroughFrame(url: string) {
  const socket = createRelaySocket(url);
  const received: string[] = [];
  socket.onmessage = (event) => received.push(String(event.data));
  await delivered();
  await delivered();
  const relay = frameSockets.get(url);
  if (!relay) throw new Error(`The frame did not open ${url}`);
  relay.readyState = 1;
  relay.onopen?.();
  await delivered();
  return { socket, relay, received };
}

describe("the web app's relay frame", () => {
  it("gives its port to the page's origin only, and never listens to its window", async () => {
    const { socket } = await openThroughFrame("wss://nos.lol");
    expect(socket.readyState).toBe(1); // OPEN
    expect(postedTo).toEqual([ORIGIN]);
    expect(frameWindowListener).not.toHaveBeenCalled();
    // Once ready, the page listens to no window message.
    expect(pageListeners.size).toBe(0);
  });

  // The web app's Content-Security-Policy runs this script by its hash (web-csp.test.ts): the
  // frame's document is the same, to the character, whatever the page's origin.
  it("runs the one script the web app's policy allows, the page's origin given as its name", async () => {
    await openThroughFrame("wss://relay.nostr.band");
    expect(element.srcdoc).toBe(
      `<!doctype html><meta charset="utf-8"><script>${RELAY_FRAME_SCRIPT}</script>`
    );
    expect(element.srcdoc).not.toContain(ORIGIN);
    expect(frameAttributes.get("name")).toBe(ORIGIN);
  });

  it("relays the relay's messages and the page's on the channel", async () => {
    const { socket, relay, received } = await openThroughFrame("wss://relay.damus.io");
    relay.onmessage?.({ data: '["EOSE","sub"]' });
    await delivered();
    expect(received).toEqual(['["EOSE","sub"]']);
    socket.send('["REQ","sub",{}]');
    await delivered();
    expect(relay.sent).toEqual(['["REQ","sub",{}]']);
  });

  it("takes no report posted to the page's window, even from the frame's", async () => {
    const { received } = await openThroughFrame("wss://relay.primal.net");
    pageListeners.add(() => {}); // as if some listener remained
    postToPage(frameWindow, { type: "message", id: 1, data: "forged" });
    postToPage(frameWindow, { type: "message", id: 2, data: "forged" });
    postToPage(frameWindow, { type: "message", id: 3, data: "forged" });
    await delivered();
    expect(received).toEqual([]);
  });
});
