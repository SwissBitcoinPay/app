import { taprootAddress } from "../../jest/bitcoin";
import { RECONNECT_DELAYS_MS, watchAddress } from "../lib/onchain/mempool-socket";

// The real client (hoisted by Jest): jest.setup.ts replaces it with the chain of jest/mempool.ts.
jest.unmock("../lib/onchain/mempool-socket");

const ADDRESS = taprootAddress(1);
const TXID = "ab".repeat(32);
const COIN = `${"cd".repeat(32)}:0`;

function esploraTx(txid: string, value: number, height: number | null = null) {
  return {
    txid,
    vin: [{ txid: "cd".repeat(32), vout: 0 }],
    vout: [{ scriptpubkey_address: ADDRESS, value }],
    status: height === null ? { confirmed: false } : { confirmed: true, block_height: height }
  };
}

/** The sockets the watch opens, driven by hand. */
function fakeSockets() {
  const sockets: {
    readyState: number;
    sent: unknown[];
    closed: boolean;
    onopen: (() => void) | null;
    onmessage: ((event: { data: string }) => void) | null;
    onerror: (() => void) | null;
    onclose: (() => void) | null;
    send: (data: string) => void;
    close: () => void;
  }[] = [];
  const createSocket = jest.fn((_url: string) => {
    const socket = {
      readyState: 0,
      sent: [] as unknown[],
      closed: false,
      onopen: null as (() => void) | null,
      onmessage: null as ((event: { data: string }) => void) | null,
      onerror: null as (() => void) | null,
      onclose: null as (() => void) | null,
      send(data: string) {
        this.sent.push(JSON.parse(data));
      },
      close() {
        this.closed = true;
      }
    };
    sockets.push(socket);
    return socket as unknown as WebSocket;
  });
  const open = (index: number) => {
    sockets[index].readyState = 1;
    sockets[index].onopen?.();
  };
  const push = (index: number, message: unknown) =>
    sockets[index].onmessage?.({
      data: typeof message === "string" ? message : JSON.stringify(message)
    });
  return { sockets, createSocket, open, push };
}

function handlers() {
  return { onOpen: jest.fn(), onTransactions: jest.fn(), onRemoved: jest.fn(), onTip: jest.fn() };
}

describe("mempool address watch", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("asks for blocks and the address once connected, then says what it pushes", () => {
    const fake = fakeSockets();
    const on = handlers();
    const stop = watchAddress(ADDRESS, on, { createSocket: fake.createSocket });

    expect(fake.createSocket).toHaveBeenCalledWith("wss://mempool.space/api/v1/ws");
    fake.open(0);
    expect(fake.sockets[0].sent).toEqual([
      { action: "want", data: ["blocks"] },
      { "track-address": ADDRESS }
    ]);
    expect(on.onOpen).toHaveBeenCalledTimes(1);

    fake.push(0, { blocks: [{ height: 899_998 }, { height: 900_000 }], mempoolInfo: {} });
    expect(on.onTip).toHaveBeenLastCalledWith(900_000);
    fake.push(0, { "address-transactions": [esploraTx(TXID, 46_918)] });
    expect(on.onTransactions).toHaveBeenLastCalledWith([
      { txid: TXID, received: 46_918n, confirmed: false, blockHeight: null, inputs: [COIN] }
    ]);
    fake.push(0, {
      block: { height: 900_001 },
      "block-transactions": [esploraTx(TXID, 46_918, 900_001)]
    });
    expect(on.onTip).toHaveBeenLastCalledWith(900_001);
    expect(on.onTransactions).toHaveBeenLastCalledWith([
      { txid: TXID, received: 46_918n, confirmed: true, blockHeight: 900_001, inputs: [COIN] }
    ]);
    fake.push(0, { "address-removed-transactions": [esploraTx("cd".repeat(32), 1)] });
    expect(on.onRemoved).toHaveBeenLastCalledWith(["cd".repeat(32)]);

    stop();
    expect(fake.sockets[0].closed).toBe(true);
  });

  it("ignores what it cannot read", () => {
    const fake = fakeSockets();
    const on = handlers();
    watchAddress(ADDRESS, on, { createSocket: fake.createSocket });
    fake.open(0);

    fake.push(0, "not json");
    fake.push(0, ["a", "list"]);
    fake.push(0, { block: { height: -1 }, "address-transactions": [{ txid: "x" }, "junk"] });
    fake.push(0, { "address-transactions": [{ ...esploraTx(TXID, 5), vout: [] }] });

    expect(on.onTip).not.toHaveBeenCalled();
    expect(on.onTransactions).not.toHaveBeenCalled();
  });

  it("connects again after a loss, waiting longer each time, and says so", () => {
    const fake = fakeSockets();
    const on = handlers();
    const stop = watchAddress(ADDRESS, on, { createSocket: fake.createSocket });
    fake.open(0);

    fake.sockets[0].onclose?.();
    expect(fake.sockets[0].closed).toBe(true);
    jest.advanceTimersByTime(RECONNECT_DELAYS_MS.first - 1);
    expect(fake.createSocket).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(1);
    expect(fake.createSocket).toHaveBeenCalledTimes(2);

    // Fails before opening: twice the wait.
    fake.sockets[1].onerror?.();
    jest.advanceTimersByTime(RECONNECT_DELAYS_MS.first * 2);
    expect(fake.createSocket).toHaveBeenCalledTimes(3);

    // Back: the caller reads what it missed, and the wait starts over.
    fake.open(2);
    expect(on.onOpen).toHaveBeenCalledTimes(2);
    fake.sockets[2].onclose?.();
    jest.advanceTimersByTime(RECONNECT_DELAYS_MS.first);
    expect(fake.createSocket).toHaveBeenCalledTimes(4);

    stop();
    jest.advanceTimersByTime(RECONNECT_DELAYS_MS.max);
    expect(fake.createSocket).toHaveBeenCalledTimes(4);
  });

  it("closes a socket stopped while it connects as soon as it opens (Android)", () => {
    const fake = fakeSockets();
    const stop = watchAddress(ADDRESS, handlers(), { createSocket: fake.createSocket });

    stop();
    fake.sockets[0].closed = false;
    fake.open(0);

    expect(fake.sockets[0].closed).toBe(true);
    expect(fake.sockets[0].sent).toEqual([]);
  });

  it("tries the next explorer at once when one never opens, the first again after a loss", () => {
    const fake = fakeSockets();
    const on = handlers();
    const node = "ws://192.168.1.20:3006/api/v1/ws";
    const stop = watchAddress(ADDRESS, on, {
      createSocket: fake.createSocket,
      urls: [node, "wss://mempool.space/api/v1/ws"]
    });
    expect(fake.createSocket).toHaveBeenLastCalledWith(node);

    // The node does not answer: mempool.space without waiting.
    fake.sockets[0].onerror?.();
    jest.advanceTimersByTime(0);
    expect(fake.createSocket).toHaveBeenLastCalledWith("wss://mempool.space/api/v1/ws");
    fake.open(1);
    expect(on.onOpen).toHaveBeenCalledTimes(1);

    // Lost after it opened: the node first again, after the wait.
    fake.sockets[1].onclose?.();
    jest.advanceTimersByTime(RECONNECT_DELAYS_MS.first - 1);
    expect(fake.createSocket).toHaveBeenCalledTimes(2);
    jest.advanceTimersByTime(1);
    expect(fake.createSocket).toHaveBeenLastCalledWith(node);

    // Neither answers: the round starts over after a longer wait.
    fake.sockets[2].onerror?.();
    jest.advanceTimersByTime(0);
    fake.sockets[3].onerror?.();
    jest.advanceTimersByTime(RECONNECT_DELAYS_MS.first * 2 - 1);
    expect(fake.createSocket).toHaveBeenCalledTimes(4);
    jest.advanceTimersByTime(1);
    expect(fake.createSocket).toHaveBeenLastCalledWith(node);

    stop();
  });

  it("keeps to the merchant's node alone when mempool.space is not allowed", () => {
    const fake = fakeSockets();
    const node = "ws://192.168.1.20:3006/api/v1/ws";
    const stop = watchAddress(ADDRESS, handlers(), {
      createSocket: fake.createSocket,
      urls: [node]
    });
    fake.sockets[0].onerror?.();
    jest.advanceTimersByTime(RECONNECT_DELAYS_MS.first);
    expect(fake.createSocket.mock.calls.map(([url]) => url)).toEqual([node, node]);
    stop();
  });
});
