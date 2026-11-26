import { MEMPOOL_API_URL } from "@/config/onchain";
import { ChainError } from "@/lib/onchain/esplora";
import { fetchFirstSeen, resetFirstSeen } from "@/lib/onchain/mempool-times";

// The real client: jest.setup.ts replaces it with the fake chain everywhere else.
jest.unmock("@/lib/onchain/mempool-times");

const TXID = "308099ff5220768b2d33da7222c24a99aca03ae2fbc6e8d4b1528f055beb1199";

const answer = (status: number, body: unknown) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

const reply = (status: number, body: unknown) =>
  jest.fn(async () => answer(status, body)) as unknown as typeof fetch & jest.Mock;

beforeEach(() => {
  resetFirstSeen();
});

describe("fetchFirstSeen", () => {
  it("gives when mempool.space first saw the transaction, in seconds, read once", async () => {
    const fetchImpl = reply(200, [1791930600]);
    await expect(fetchFirstSeen(TXID, { fetchImpl })).resolves.toBe(1791930600);
    // Its servers disagree by seconds: the first answer stays this device's.
    await expect(fetchFirstSeen(TXID, { fetchImpl })).resolves.toBe(1791930600);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith(
      `${MEMPOOL_API_URL}/v1/transaction-times?txId%5B%5D=${TXID}`,
      expect.objectContaining({ headers: { Accept: "application/json" } })
    );
  });

  it("is null while its mempool does not hold the transaction, and asks again", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(answer(200, [0]))
      .mockResolvedValueOnce(answer(200, [1791930600]));
    await expect(fetchFirstSeen(TXID, { fetchImpl })).resolves.toBeNull();
    await expect(fetchFirstSeen(TXID, { fetchImpl })).resolves.toBe(1791930600);
  });

  it("refuses an answer out of shape, an HTTP error or a transaction id that is none", async () => {
    for (const body of [[], [1, 2], ["1791930600"], [-1], [1.5], { 0: 1 }, null]) {
      await expect(fetchFirstSeen(TXID, { fetchImpl: reply(200, body) })).rejects.toMatchObject({
        code: "invalidResponse"
      });
    }
    const limited = fetchFirstSeen(TXID, { fetchImpl: reply(429, {}) });
    await expect(limited).rejects.toBeInstanceOf(ChainError);
    await expect(limited).rejects.toMatchObject({ code: "network" });
    const offline = jest.fn(async () => {
      throw new TypeError("Network request failed");
    }) as unknown as typeof fetch;
    await expect(fetchFirstSeen(TXID, { fetchImpl: offline })).rejects.toMatchObject({
      code: "network"
    });
    const never = reply(200, [1]);
    await expect(fetchFirstSeen("nope", { fetchImpl: never })).rejects.toThrow(
      /Not a transaction id/
    );
    expect(never).not.toHaveBeenCalled();
  });
});
