import type * as MempoolFake from "../../jest/mempool";
import { NODE_STALE_TIP_SECONDS } from "../config/onchain";
import { testBitcoinNode } from "../features/onchain/node-test";
import * as esplora from "../lib/onchain/esplora";

// The in-memory chain of jest.setup.ts.
const { chain } = jest.requireMock<typeof MempoolFake>("../lib/onchain/esplora");

const NODE = "https://192.168.1.20:3006";
const API = `${NODE}/api`;

let warn: jest.SpyInstance;
beforeEach(() => {
  warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => {
  warn.mockRestore();
  jest.restoreAllMocks();
});

describe("testBitcoinNode", () => {
  it("is ok when the node answers, lists an address and is up to date, asking it alone", async () => {
    await expect(testBitcoinNode(NODE)).resolves.toEqual({ status: "ok", height: chain.tip });
    expect(chain.calls.every((call) => call.base === API)).toBe(true);
    // A random taproot address: nothing of the business.
    const asked = chain.calls.find((call) => call.path.startsWith("/address/"))!.path;
    expect(asked).toMatch(/^\/address\/bc1p[02-9ac-hj-np-z]{58}\/txs$/);
  });

  it("says when the node does not answer", async () => {
    chain.down.add(API);
    await expect(testBitcoinNode(NODE)).resolves.toEqual({ status: "unreachable" });
  });

  it("says when another service answers at that address", async () => {
    jest
      .spyOn(esplora, "fetchTipHeight")
      .mockRejectedValue(new esplora.ChainError("invalidResponse", "not a height"));
    await expect(testBitcoinNode(NODE)).resolves.toEqual({ status: "notMempool" });
  });

  it("says when the node lists no address (its index missing)", async () => {
    chain.noAddressIndex.add(API);
    await expect(testBitcoinNode(NODE)).resolves.toEqual({ status: "noAddressIndex" });
  });

  it("says when the node is behind", async () => {
    chain.tipAgeSeconds = NODE_STALE_TIP_SECONDS + 1;
    await expect(testBitcoinNode(NODE)).resolves.toEqual({
      status: "behind",
      height: chain.tip,
      ageSeconds: NODE_STALE_TIP_SECONDS + 1
    });
    chain.tipAgeSeconds = NODE_STALE_TIP_SECONDS;
    await expect(testBitcoinNode(NODE)).resolves.toMatchObject({ status: "ok" });
  });
});
