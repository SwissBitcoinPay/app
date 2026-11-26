import {
  relayStatus,
  resetRelayStatuses,
  testRelaysAskingAccess
} from "@/features/relays/relay-test";
import { localNetworkPermission } from "@/lib/nostr/local-network-permission";
import {
  askLocalNetworkAccess,
  prepareLocalNetworkAccess,
  resetLocalNetworkAccess
} from "@/lib/nostr/local-network.web";

// "Test the connection" as the web app has it: its local network module, not the apps'.
jest.mock("@/lib/nostr/local-network", () => jest.requireActual("@/lib/nostr/local-network.web"));

/*
 * The browser's request for local network access (Local Network Access, Chromium), asked before
 * "Test the connection". Its prompt was checked with Chrome 154; here,
 * what the page asks and sends.
 */

const UMBREL = "wss://umbrel-1.tail1234.ts.net:8443";
const LAN = "wss://umbrel.local:4848/nostr";

const navigatorBefore = Object.getOwnPropertyDescriptor(globalThis, "navigator");
const fetchBefore = globalThis.fetch;

/** The page's permission: `states` in turn, one per query; a query that throws: an unknown name. */
function permissionStates(...states: (PermissionState | Error)[]) {
  const query = jest.fn(async (descriptor: { name: string }) => {
    expect(descriptor).toEqual({ name: "local-network" });
    const state = states.shift();
    if (state instanceof Error || state === undefined) throw state ?? new Error("no state");
    return { state };
  });
  Object.defineProperty(globalThis, "navigator", {
    value: { permissions: { query } },
    configurable: true
  });
  return query;
}

function fakeFetch(impl: (url: string, init: RequestInit) => Promise<Response>) {
  const fetchMock = jest.fn(impl);
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

afterEach(() => {
  if (navigatorBefore) Object.defineProperty(globalThis, "navigator", navigatorBefore);
  else delete (globalThis as { navigator?: unknown }).navigator;
  globalThis.fetch = fetchBefore;
  jest.useRealTimers();
  resetRelayStatuses();
  resetLocalNetworkAccess();
});

describe("asking the browser for local network access", () => {
  it("asks nothing without a relay to ask for", async () => {
    const query = permissionStates("prompt");
    const fetchMock = fakeFetch(async () => new Response());
    await expect(askLocalNetworkAccess([], 60_000)).resolves.toBeNull();
    expect(query).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("asks nothing once the user answered, nor in a browser without the permission", async () => {
    const fetchMock = fakeFetch(async () => new Response());
    permissionStates("granted");
    await expect(askLocalNetworkAccess([UMBREL], 60_000)).resolves.toBe("granted");
    permissionStates("denied");
    await expect(askLocalNetworkAccess([UMBREL], 60_000)).resolves.toBe("denied");
    // Safari, Firefox: no such permission, nothing to ask.
    permissionStates(new TypeError("unknown permission name"));
    await expect(askLocalNetworkAccess([UMBREL], 60_000)).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("makes the browser ask by a request of the page that carries nothing of the app", async () => {
    permissionStates("prompt", "granted");
    const fetchMock = fakeFetch(async () => new Response());
    await expect(askLocalNetworkAccess([UMBREL, LAN], 60_000)).resolves.toBe("granted");
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "https://umbrel-1.tail1234.ts.net:8443",
      "https://umbrel.local:4848/nostr"
    ]);
    for (const [, init] of fetchMock.mock.calls) {
      expect(init).toMatchObject({
        mode: "no-cors",
        credentials: "omit",
        referrerPolicy: "no-referrer",
        cache: "no-store"
      });
      expect(init.headers).toBeUndefined();
    }
  });

  it("waits for the answer, then tells it; a request refused counts as answered too", async () => {
    permissionStates("prompt", "denied");
    fakeFetch(async () => {
      throw new TypeError("Failed to fetch");
    });
    await expect(askLocalNetworkAccess([UMBREL], 60_000)).resolves.toBe("denied");
  });

  it("goes on once the user answered, without waiting for a relay that does not answer", async () => {
    jest.useFakeTimers();
    const status: { state: PermissionState; onchange: (() => void) | null } = {
      state: "prompt",
      onchange: null
    };
    Object.defineProperty(globalThis, "navigator", {
      value: { permissions: { query: jest.fn(async () => status) } },
      configurable: true
    });
    let aborted = false;
    fakeFetch(
      (_url, init) =>
        new Promise((_resolve, reject) =>
          init.signal?.addEventListener("abort", () => {
            aborted = true;
            reject(new Error("aborted"));
          })
        )
    );
    const asked = askLocalNetworkAccess([UMBREL], 60_000);
    await jest.advanceTimersByTimeAsync(2_000);
    status.state = "granted";
    status.onchange?.();
    await expect(asked).resolves.toBe("granted");
    // The request left waiting is given up.
    expect(aborted).toBe(true);
    expect(status.onchange).toBeNull();
  });

  it("stops waiting past its time: the test goes on", async () => {
    jest.useFakeTimers();
    permissionStates("prompt", "prompt");
    fakeFetch(
      (_url, init) =>
        new Promise((_resolve, reject) =>
          init.signal?.addEventListener("abort", () => reject(new Error("aborted")))
        )
    );
    const asked = askLocalNetworkAccess([UMBREL], 60_000);
    await jest.advanceTimersByTimeAsync(59_999);
    let settled = false;
    void asked.then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    await expect(asked).resolves.toBe("prompt");
  });
});

// Asked as soon as the app is to connect to such a relay (socket.web.ts).
describe("before a connection to a relay the browser may count as local", () => {
  it("asks once since the page loaded: the next connections wait for that request", async () => {
    const query = permissionStates("prompt", "denied");
    let answer: () => void = () => {};
    const fetchMock = fakeFetch(
      () =>
        new Promise((resolve) => {
          answer = () => resolve(new Response());
        })
    );
    const first = prepareLocalNetworkAccess(UMBREL);
    const second = prepareLocalNetworkAccess(UMBREL);
    await Promise.resolve();
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // The editor's notes follow the answer.
    answer();
    await Promise.all([first, second]);
    expect(localNetworkPermission()).toBe("denied");
    await prepareLocalNetworkAccess(UMBREL);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('asks nothing again right after "Test the connection" asked for the relay', async () => {
    permissionStates("prompt", "prompt");
    const fetchMock = fakeFetch(async () => {
      throw new TypeError("Failed to fetch");
    });
    // The merchant dismissed the browser's request: the test's connections do not ask again.
    await expect(askLocalNetworkAccess([UMBREL], 60_000)).resolves.toBe("prompt");
    await prepareLocalNetworkAccess(UMBREL);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(localNetworkPermission()).toBe("prompt");
  });

  it("asks for each relay of its own, once", async () => {
    permissionStates("prompt", "prompt", "prompt", "prompt");
    const fetchMock = fakeFetch(async () => {
      throw new TypeError("Failed to fetch");
    });
    await prepareLocalNetworkAccess(UMBREL);
    await prepareLocalNetworkAccess(LAN);
    await prepareLocalNetworkAccess(UMBREL);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "https://umbrel-1.tail1234.ts.net:8443",
      "https://umbrel.local:4848/nostr"
    ]);
  });
});

describe('"Test the connection" in the web app', () => {
  const INTERNET = "wss://nos.lol";

  it("asks the browser for local network access first, for such a relay only", async () => {
    permissionStates("prompt", "granted");
    const fetchMock = fakeFetch(async () => {
      // The relays are "testing" while the browser asks.
      expect(relayStatus(UMBREL)).toBe("testing");
      expect(relayStatus(INTERNET)).toBe("testing");
      return new Response();
    });
    await expect(testRelaysAskingAccess([INTERNET, UMBREL])).resolves.toBe(true);
    // Not nos.lol, of the Internet.
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "https://umbrel-1.tail1234.ts.net:8443"
    ]);
    expect(relayStatus(UMBREL)).toBe("reachable");
    expect(relayStatus(INTERNET)).toBe("reachable");
  });

  it("asks nothing without such a relay", async () => {
    const query = permissionStates("prompt");
    const fetchMock = fakeFetch(async () => new Response());
    await expect(testRelaysAskingAccess([INTERNET, "wss://relay.example.com"])).resolves.toBe(true);
    expect(query).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
