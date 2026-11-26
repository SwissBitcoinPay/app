import { act, renderHook, waitFor } from "@testing-library/react-native";

import { taprootAddress } from "../../jest/bitcoin";
import type * as MempoolFake from "../../jest/mempool";
import { MEMPOOL_API_URL } from "../config/onchain";
import * as session from "../features/account/session";
import { useOnchainPayment } from "../features/onchain/useOnchainPayment";

// The in-memory chain of jest.setup.ts.
const { chain, drop, mine, pay } = jest.requireMock<typeof MempoolFake>("../lib/onchain/esplora");

const ADDRESS = taprootAddress(1);
const SATS = 46_918n;

function watch(expected = SATS, active = true, address: string | null = ADDRESS) {
  return renderHook(
    (props: { expected: bigint; active: boolean; address: string | null }) =>
      useOnchainPayment(props),
    { initialProps: { expected, active, address } }
  );
}

describe("useOnchainPayment", () => {
  it("follows a payment from the mempool to 3 confirmations, on one explorer", async () => {
    const { result } = await watch();
    // Connected: the explorer is read once.
    await waitFor(() =>
      expect(chain.calls).toContainEqual({ base: MEMPOOL_API_URL, path: `/address/${ADDRESS}/txs` })
    );
    expect(result.current).toEqual({ phase: "waiting" });

    await act(async () => {
      pay(ADDRESS, SATS);
    });
    expect(result.current).toMatchObject({
      phase: "unconfirmed",
      received: SATS,
      confirmations: 0
    });
    const detectedAt = (result.current as { detectedAt: Date }).detectedAt;
    expect(detectedAt).toBeInstanceOf(Date);

    await act(async () => mine());
    expect(result.current).toMatchObject({ phase: "unconfirmed", confirmations: 1, detectedAt });

    // 3 deep: paid on mempool.space's word alone, nothing else asked.
    await act(async () => mine(2));
    await waitFor(() => expect(result.current).toMatchObject({ phase: "paid", received: SATS }));
    expect(result.current).toMatchObject({ detectedAt });
    expect(chain.calls.every((call) => call.base === MEMPOOL_API_URL)).toBe(true);
    expect(chain.socketUrls).toEqual([["wss://mempool.space/api/v1/ws"]]);
  });

  describe("on the merchant's devices, with their own node", () => {
    const NODE_API = "https://192.168.1.20:3006/api";
    const NODE_SOCKET = "wss://192.168.1.20:3006/api/v1/ws";

    function useNode(fallback: "mempool" | "none") {
      jest.spyOn(session, "getAccountSettings").mockReturnValue({
        bitcoinNode: { url: "https://192.168.1.20:3006", fallback, payers: false }
      } as ReturnType<typeof session.getAccountSettings>);
    }

    function watchOnDevice() {
      return renderHook(() =>
        useOnchainPayment({ address: ADDRESS, expected: SATS, active: true, explorer: "device" })
      );
    }

    afterEach(() => jest.restoreAllMocks());

    it("reads the node alone while it answers", async () => {
      useNode("mempool");
      const { result } = await watchOnDevice();
      await waitFor(() => expect(result.current).toEqual({ phase: "waiting" }));
      expect(chain.socketUrls).toEqual([[NODE_SOCKET, "wss://mempool.space/api/v1/ws"]]);
      await act(async () => {
        pay(ADDRESS, SATS);
        mine(3);
      });
      await waitFor(() => expect(result.current).toMatchObject({ phase: "paid" }));
      expect(chain.calls.length).toBeGreaterThan(0);
      expect(chain.calls.every((call) => call.base === NODE_API)).toBe(true);
    });

    it("reads mempool.space while the node does not answer, when the owner allowed it", async () => {
      useNode("mempool");
      chain.down.add(NODE_API);
      const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
      try {
        const { result } = await watchOnDevice();
        await waitFor(() => expect(result.current).toEqual({ phase: "waiting" }));
        expect(chain.calls).toContainEqual({
          base: MEMPOOL_API_URL,
          path: `/address/${ADDRESS}/txs`
        });
      } finally {
        warn.mockRestore();
      }
    });

    it('never asks mempool.space for "Lightning only": not read, neither paid nor unpaid', async () => {
      useNode("none");
      chain.down.add(NODE_API);
      const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
      try {
        const { result } = await watchOnDevice();
        await waitFor(() =>
          expect(chain.calls).toContainEqual({ base: NODE_API, path: "/blocks/tip/height" })
        );
        expect(result.current).toEqual({ phase: "unknown" });
        expect(chain.calls.some((call) => call.base === MEMPOOL_API_URL)).toBe(false);
        expect(chain.socketUrls).toEqual([[NODE_SOCKET]]);
      } finally {
        warn.mockRestore();
      }
    });

    it("reads mempool.space on a payer's page, whatever the account names", async () => {
      useNode("none");
      const { result } = await watch();
      await waitFor(() => expect(result.current).toEqual({ phase: "waiting" }));
      expect(chain.calls.every((call) => call.base === MEMPOOL_API_URL)).toBe(true);
    });
  });

  it("says what is missing, then counts the payment made in two times", async () => {
    const { result } = await watch();
    await act(async () => {
      pay(ADDRESS, 30_000n);
    });
    expect(result.current).toMatchObject({ phase: "underpaid", received: 30_000n, rest: 16_918n });

    await act(async () => {
      pay(ADDRESS, 16_918n);
    });
    expect(result.current).toMatchObject({ phase: "unconfirmed", received: SATS });
  });

  it("forgets a transaction replaced before it confirmed (RBF)", async () => {
    const { result } = await watch();
    let txid = "";
    await act(async () => {
      txid = pay(ADDRESS, SATS);
    });
    expect(result.current.phase).toBe("unconfirmed");

    await act(async () => drop(txid));
    await waitFor(() => expect(result.current).toEqual({ phase: "waiting" }));
  });

  it("still hears the socket while the explorer's REST API is down", async () => {
    chain.down.add(MEMPOOL_API_URL);
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const { result } = await watch();
      await waitFor(() =>
        expect(chain.calls).toContainEqual({ base: MEMPOOL_API_URL, path: "/blocks/tip/height" })
      );
      // Not read: neither paid nor unpaid.
      expect(result.current).toEqual({ phase: "unknown" });
      await act(async () => {
        pay(ADDRESS, SATS);
      });
      expect(result.current).toMatchObject({ phase: "unconfirmed", received: SATS });
    } finally {
      warn.mockRestore();
    }
  });

  it("is not unpaid because the socket gave the chain's height before the address was read", async () => {
    chain.down.add(MEMPOOL_API_URL);
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const { result } = await watch();
      await waitFor(() => expect(chain.watchers.get(ADDRESS)?.size).toBe(1));
      // As the real socket answers `want blocks` at once.
      await act(async () => {
        for (const handlers of chain.watchers.get(ADDRESS) ?? []) handlers.onTip(chain.tip);
      });
      expect(result.current).toEqual({ phase: "unknown" });
    } finally {
      warn.mockRestore();
    }
  });

  it("watches nothing while inactive, or without an address", async () => {
    const inactive = await watch(SATS, false);
    const none = await watch(SATS, true, null);
    await act(async () => {
      pay(ADDRESS, SATS);
    });

    expect(chain.watchers.get(ADDRESS)?.size ?? 0).toBe(0);
    expect(inactive.result.current).toEqual({ phase: "waiting" });
    expect(none.result.current).toEqual({ phase: "waiting" });
  });

  it("stops watching when the screen leaves", async () => {
    const { unmount } = await watch();
    await waitFor(() => expect(chain.watchers.get(ADDRESS)?.size).toBe(1));

    await unmount();

    expect(chain.watchers.get(ADDRESS)?.size).toBe(0);
  });
});
