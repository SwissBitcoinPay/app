import { prepareLocalNetworkAccess } from "@/lib/nostr/local-network";
import { createRelaySocket } from "@/lib/nostr/socket.web";

/*
 * The web app's relay connections and the browser's local network permission: a relay the browser
 * may count as one of the local network is connected to once the browser was asked for access
 * (local-network.web.ts). Jest has no DOM: the frame never starts here, and the sockets are direct
 * ones, as in a browser that does not start it in time.
 */

jest.mock("@/lib/nostr/local-network", () => ({ prepareLocalNetworkAccess: jest.fn() }));

const UMBREL = "wss://umbrel-1.tail1234.ts.net:8443";

/** The WebSockets opened, by address. */
const opened: string[] = [];
/** The attributes of the relay frame, as socket.web.ts sets them. */
const frameAttributes = new Map<string, string>();

class FakeWebSocket {
  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  constructor(url: string) {
    opened.push(url);
  }
  close() {}
}

const saved = (["document", "window", "WebSocket"] as const).map(
  (name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const
);

beforeAll(async () => {
  jest.useFakeTimers();
  jest.spyOn(console, "warn").mockImplementation(() => {});
  const element = {
    setAttribute: (name: string, value: string) => frameAttributes.set(name, value),
    style: {},
    contentWindow: null,
    tabIndex: 0
  };
  Object.defineProperty(globalThis, "document", {
    value: { createElement: () => element, body: { appendChild: () => {} } },
    configurable: true
  });
  Object.defineProperty(globalThis, "window", {
    value: {
      addEventListener: () => {},
      removeEventListener: () => {},
      location: { origin: "https://app.example" }
    },
    configurable: true
  });
  Object.defineProperty(globalThis, "WebSocket", { value: FakeWebSocket, configurable: true });
  // The frame does not start: direct connections from then on.
  createRelaySocket("wss://nos.lol").close();
  await jest.advanceTimersByTimeAsync(3000);
});

afterAll(() => {
  for (const [name, descriptor] of saved) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete (globalThis as Record<string, unknown>)[name];
  }
  jest.useRealTimers();
  jest.restoreAllMocks();
});

beforeEach(() => {
  opened.length = 0;
  jest.mocked(prepareLocalNetworkAccess).mockReset();
});

/** A request for access that the test answers. */
function pendingRequest(): () => Promise<void> {
  let answer: () => void = () => {};
  jest.mocked(prepareLocalNetworkAccess).mockReturnValue(
    new Promise((resolve) => {
      answer = resolve;
    })
  );
  return async () => {
    answer();
    await jest.advanceTimersByTimeAsync(0);
  };
}

describe("relay connections of the web app", () => {
  // Checked with Chrome 154 and Brave 1.96, the browser's "Allow" clicked: without
  // the delegation, the page's permission left the frame's sockets to a local relay refused.
  it("open from a frame of an opaque origin, delegated the page's local network access", () => {
    expect(frameAttributes.get("sandbox")).toBe("allow-scripts");
    expect(frameAttributes.get("allow")).toBe("local-network");
  });

  it("connect to a relay of the Internet without asking anything", async () => {
    createRelaySocket("wss://nos.lol");
    await jest.advanceTimersByTimeAsync(0);
    expect(opened).toEqual(["wss://nos.lol"]);
    expect(prepareLocalNetworkAccess).not.toHaveBeenCalled();
  });

  it("connect to a relay the browser may count as local once the browser was asked", async () => {
    const answer = pendingRequest();
    const socket = createRelaySocket(UMBREL);
    await jest.advanceTimersByTimeAsync(5000);
    expect(prepareLocalNetworkAccess).toHaveBeenCalledWith(UMBREL);
    expect(opened).toEqual([]);
    expect(socket.readyState).toBe(0); // CONNECTING
    await answer();
    expect(opened).toEqual([UMBREL]);
  });

  it("open nothing once closed while the browser asks", async () => {
    const answer = pendingRequest();
    const socket = createRelaySocket(UMBREL);
    const closed = jest.fn();
    socket.onclose = closed;
    // The relay client's own time is over (relay.ts).
    socket.close();
    expect(closed).toHaveBeenCalledTimes(1);
    expect(socket.readyState).toBe(3); // CLOSED
    await answer();
    expect(opened).toEqual([]);
  });
});
