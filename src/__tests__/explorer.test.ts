import { NODE_RETRY_AFTER_MS } from "@/config/onchain";
import * as session from "@/features/account/session";
import {
  MEMPOOL_SPACE,
  PUBLIC_SOURCES,
  chainSourcesOf,
  deviceBitcoinNode,
  orderedSources,
  readChain
} from "@/features/onchain/explorer";
import { savePosOptions } from "@/features/terminal/options";
import { publishTerminalProfile } from "@/features/terminal/profile-cache";
import { ChainError } from "@/lib/onchain/esplora";

const NODE = { url: "https://192.168.1.20:3006", fallback: "mempool", payers: false } as const;
const OWN = { api: "https://192.168.1.20:3006/api", socket: "wss://192.168.1.20:3006/api/v1/ws" };

afterEach(() => jest.restoreAllMocks());

describe("chainSourcesOf", () => {
  it("is mempool.space alone without a node", () => {
    expect(chainSourcesOf(null)).toBe(PUBLIC_SOURCES);
    expect(PUBLIC_SOURCES).toEqual([MEMPOOL_SPACE]);
  });

  it("is the node, then mempool.space only when the owner allowed it", () => {
    expect(chainSourcesOf(NODE)).toEqual([{ ...OWN, own: true }, MEMPOOL_SPACE]);
    expect(chainSourcesOf({ ...NODE, fallback: "none" })).toEqual([{ ...OWN, own: true }]);
  });

  // HTTPS only: a node saved in http:// before is asked over
  // HTTPS, where a plain HTTP node does not answer and the owner's fallback applies.
  it("asks a node saved in http:// over HTTPS only, never in clear", () => {
    const legacy = { ...NODE, url: "http://192.168.1.20:3006" };
    expect(chainSourcesOf(legacy)).toEqual([{ ...OWN, own: true }, MEMPOOL_SPACE]);
    expect(chainSourcesOf({ ...legacy, fallback: "none" })).toEqual([{ ...OWN, own: true }]);
  });
});

describe("readChain", () => {
  beforeEach(() => jest.useFakeTimers({ now: 1_790_000_000_000 }));
  afterEach(() => jest.useRealTimers());

  it("reads the first explorer that answers, and puts one that failed last for a while", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const sources = chainSourcesOf(NODE);
    const asked: string[] = [];
    let nodeUp = false;
    const read = async (api: string) => {
      asked.push(api);
      if (api === OWN.api && !nodeUp) throw new ChainError("network", "unreachable");
      return api;
    };

    await expect(readChain(sources, read)).resolves.toBe(MEMPOOL_SPACE.api);
    expect(asked).toEqual([OWN.api, MEMPOOL_SPACE.api]);
    expect(warn).toHaveBeenCalled();

    // Within the wait: mempool.space first, the node not asked while it answers.
    asked.length = 0;
    expect(orderedSources(sources).map((source) => source.api)).toEqual([
      MEMPOOL_SPACE.api,
      OWN.api
    ]);
    await expect(readChain(sources, read)).resolves.toBe(MEMPOOL_SPACE.api);
    expect(asked).toEqual([MEMPOOL_SPACE.api]);

    // Past it, the node first again: back, it answers.
    jest.advanceTimersByTime(NODE_RETRY_AFTER_MS);
    nodeUp = true;
    asked.length = 0;
    await expect(readChain(sources, read)).resolves.toBe(OWN.api);
    expect(asked).toEqual([OWN.api]);
  });

  it("still asks a node that failed when it is the only one, and rejects with its failure", async () => {
    const sources = chainSourcesOf({ ...NODE, fallback: "none" });
    const failure = new ChainError("network", "unreachable");
    const read = jest.fn(async () => {
      throw failure;
    });
    await expect(readChain(sources, read)).rejects.toBe(failure);
    await expect(readChain(sources, read)).rejects.toBe(failure);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("passes over an answer out of shape as a node that does not answer", async () => {
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const read = async (api: string) => {
      if (api === OWN.api) throw new ChainError("invalidResponse", "not mempool's API");
      return "ok";
    };
    await expect(readChain(chainSourcesOf(NODE), read)).resolves.toBe("ok");
  });
});

describe("deviceBitcoinNode", () => {
  it("is the open account's choice on the owner's device", async () => {
    jest
      .spyOn(session, "getAccountSettings")
      .mockReturnValue({ bitcoinNode: NODE } as ReturnType<typeof session.getAccountSettings>);
    await expect(deviceBitcoinNode()).resolves.toEqual(NODE);
  });

  it("is the one its point of sale holds without an open account (an employee's device)", async () => {
    const team = "ab".repeat(32);
    publishTerminalProfile({
      version: 3,
      team,
      memberName: "Alice",
      lightningAddress: "sattleme02ab@breez.tips",
      businessName: "Fine Bakery",
      currency: "CHF"
    });
    await expect(deviceBitcoinNode()).resolves.toBeNull();
    await savePosOptions(team, { onchain: true, onchainTolerance: 0, bitcoinNode: NODE });
    await expect(deviceBitcoinNode()).resolves.toEqual(NODE);
  });

  it("is mempool.space on a device that takes no payment", async () => {
    publishTerminalProfile(null);
    await expect(deviceBitcoinNode()).resolves.toBeNull();
  });
});
