import { BLOCKCYPHER_API_URL } from "@/config/onchain";
import {
  fetchTxDetails,
  fetchTxReceived,
  parseReceived,
  resetReceivedTimes
} from "@/lib/onchain/blockcypher";
import { ChainError } from "@/lib/onchain/esplora";

// The real client: jest.setup.ts replaces it with the fake chain everywhere else.
jest.unmock("@/lib/onchain/blockcypher");

const TXID = "308099ff5220768b2d33da7222c24a99aca03ae2fbc6e8d4b1528f055beb1199";

const answer = (status: number, body: unknown) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

beforeEach(() => {
  resetReceivedTimes();
});

describe("fetchTxReceived", () => {
  it("gives when BlockCypher received the transaction, to the millisecond, read once", async () => {
    const fetchImpl = jest.fn(async () =>
      answer(200, { hash: TXID, received: "2026-10-01T02:15:34.766Z", confirmed: "x" })
    ) as unknown as typeof fetch & jest.Mock;
    await expect(fetchTxReceived(TXID, { fetchImpl })).resolves.toBe(
      Date.UTC(2026, 9, 1, 2, 15, 34, 766)
    );
    await expect(fetchTxReceived(TXID, { fetchImpl })).resolves.toBe(
      Date.UTC(2026, 9, 1, 2, 15, 34, 766)
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith(
      `${BLOCKCYPHER_API_URL}/txs/${TXID}?limit=1&includeHex=false`,
      expect.objectContaining({ headers: { Accept: "application/json" } })
    );
  });

  it("is null while BlockCypher does not know the transaction, and asks again", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(answer(404, { error: "Transaction not found" }))
      .mockResolvedValueOnce(answer(200, { hash: TXID, received: "2026-10-01T02:15:34.766Z" }));
    await expect(fetchTxReceived(TXID, { fetchImpl })).resolves.toBeNull();
    await expect(fetchTxReceived(TXID, { fetchImpl })).resolves.toBe(
      Date.UTC(2026, 9, 1, 2, 15, 34, 766)
    );
  });

  it("refuses an answer for another transaction, without a valid time, or an HTTP error", async () => {
    const reply = (status: number, body: unknown) =>
      jest.fn(async () => answer(status, body)) as unknown as typeof fetch;
    await expect(
      fetchTxReceived(TXID, { fetchImpl: reply(200, { hash: "ab".repeat(32), received: "x" }) })
    ).rejects.toThrow(/another transaction/);
    await expect(
      fetchTxReceived(TXID, { fetchImpl: reply(200, { hash: TXID, received: "never" }) })
    ).rejects.toThrow(/Invalid received time/);
    const limited = fetchTxReceived(TXID, { fetchImpl: reply(429, {}) });
    await expect(limited).rejects.toBeInstanceOf(ChainError);
    await expect(limited).rejects.toMatchObject({ code: "network" });
    await expect(fetchTxReceived("nope", { fetchImpl: reply(200, {}) })).rejects.toThrow(
      /Not a transaction id/
    );
  });
});

describe("parseReceived", () => {
  it("reads the time as BlockCypher writes it, the fraction past milliseconds dropped", () => {
    expect(parseReceived("2026-10-10T13:05:12.345Z")).toBe(Date.UTC(2026, 9, 10, 13, 5, 12, 345));
    expect(parseReceived("2026-10-10T13:05:12.91Z")).toBe(Date.UTC(2026, 9, 10, 13, 5, 12, 910));
    expect(parseReceived("2026-10-10T13:05:12.9Z")).toBe(Date.UTC(2026, 9, 10, 13, 5, 12, 900));
    expect(parseReceived("2026-10-10T13:05:12Z")).toBe(Date.UTC(2026, 9, 10, 13, 5, 12));
    // Never rounded.
    expect(parseReceived("2026-10-10T13:05:12.999999999Z")).toBe(
      Date.UTC(2026, 9, 10, 13, 5, 12, 999)
    );
    expect(parseReceived("2028-02-29T23:59:59.000Z")).toBe(Date.UTC(2028, 1, 29, 23, 59, 59));
  });

  it("refuses another spelling, a time that does not exist, or none after 1970", () => {
    for (const text of [
      "",
      "never",
      "2026-10-10T13:05:12.345+00:00",
      "2026-10-10T13:05:12.345z",
      "2026-10-10t13:05:12.345Z",
      "2026-10-10 13:05:12.345Z",
      "2026-10-10T13:05:12.Z",
      "2026-10-10T13:05:12.1234567890Z",
      "2026-10-10T13:05Z",
      "2026-10-10",
      "Sat, 10 Oct 2026 13:05:12 GMT",
      " 2026-10-10T13:05:12Z",
      "2026-10-10T13:05:12Z ",
      "２０２６-10-10T13:05:12Z",
      "2026-13-10T13:05:12Z",
      "2026-00-10T13:05:12Z",
      "2026-02-29T13:05:12Z",
      "2026-04-31T13:05:12Z",
      "2026-10-00T13:05:12Z",
      "2026-10-10T24:00:00Z",
      "2026-10-10T13:60:12Z",
      "2026-10-10T13:05:60Z",
      "0070-10-10T13:05:12Z",
      "1970-01-01T00:00:00.000Z",
      "1969-12-31T23:59:59Z"
    ]) {
      expect([text, parseReceived(text)]).toEqual([text, null]);
    }
  });
});

describe("fetchTxDetails", () => {
  const ADDRESS = "bc1p3hdncj4y6gte4kxzs4d789e7q570hud88xaxdx24amsk42m3ghqskwgj7w";
  // As BlockCypher answers for a transaction paying a taproot address.
  const body = {
    hash: TXID,
    received: "2026-10-10T19:51:05.148Z",
    vin_sz: 2,
    vout_sz: 3,
    double_spend: true,
    inputs: [
      { prev_hash: "d0".repeat(32), output_index: 5, output_value: 300_000 },
      { prev_hash: "7d".repeat(32), output_index: 0, output_value: 2_000 }
    ],
    outputs: [
      { value: 283_365, addresses: [ADDRESS], script_type: "pay-to-taproot" },
      { value: 1_000, addresses: [ADDRESS], script_type: "pay-to-taproot" },
      { value: 0, addresses: null, script_type: "null-data" }
    ]
  };

  it("gives when it was received, what it pays the address and the coins it spends", async () => {
    const fetchImpl = jest.fn(async () => answer(200, body)) as unknown as typeof fetch & jest.Mock;
    await expect(fetchTxDetails(TXID, ADDRESS, { fetchImpl })).resolves.toEqual({
      receivedAt: Date.UTC(2026, 9, 10, 19, 51, 5, 148),
      sats: 284_365n,
      inputs: [`${"d0".repeat(32)}:5`, `${"7d".repeat(32)}:0`]
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      `${BLOCKCYPHER_API_URL}/txs/${TXID}?limit=100&includeHex=false`,
      expect.objectContaining({ headers: { Accept: "application/json" } })
    );
    // Read once, for any address; its time serves fetchTxReceived too.
    await expect(fetchTxDetails(TXID, "bc1pother", { fetchImpl })).resolves.toMatchObject({
      sats: 0n
    });
    await expect(fetchTxReceived(TXID, { fetchImpl })).resolves.toBe(
      Date.UTC(2026, 9, 10, 19, 51, 5, 148)
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("skips a coinbase input, and is null while BlockCypher does not know the transaction", async () => {
    const coinbase = { ...body, inputs: [{ output_index: -1, script_type: "empty" }] };
    await expect(
      fetchTxDetails(TXID, ADDRESS, { fetchImpl: async () => answer(200, coinbase) })
    ).resolves.toMatchObject({ inputs: [] });
    resetReceivedTimes();
    await expect(
      fetchTxDetails(TXID, ADDRESS, { fetchImpl: async () => answer(404, {}) })
    ).resolves.toBeNull();
  });

  it("refuses an answer out of shape", async () => {
    const bodies = [
      { ...body, hash: "ab".repeat(32) },
      { ...body, received: "never" },
      { ...body, inputs: undefined },
      { ...body, inputs: [{ prev_hash: "D0".repeat(32), output_index: 1 }] },
      { ...body, inputs: [{ prev_hash: "d0".repeat(32), output_index: -1 }] },
      { ...body, outputs: [{ value: -1, addresses: [ADDRESS] }] },
      { ...body, outputs: [{ value: 1, addresses: ADDRESS }] }
    ];
    for (const shape of bodies) {
      resetReceivedTimes();
      await expect(
        fetchTxDetails(TXID, ADDRESS, { fetchImpl: async () => answer(200, shape) })
      ).rejects.toMatchObject({ name: "ChainError", code: "invalidResponse" });
    }
    await expect(
      fetchTxDetails(TXID, ADDRESS, { fetchImpl: async () => answer(503, {}) })
    ).rejects.toMatchObject({ code: "network" });
  });
});
