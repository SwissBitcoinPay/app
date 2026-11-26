import { MEMPOOL_API_URL } from "@/config/onchain";
import { broadcastPackage, broadcastTransaction } from "@/lib/onchain/broadcast";
import { ChainError } from "@/lib/onchain/esplora";

// The real client: jest.setup.ts replaces it with the fake chain everywhere else.
jest.unmock("@/lib/onchain/broadcast");

/*
 * Broadcasting a signed transaction through mempool.space (`POST /api/tx`). The node's refusals
 * below are Bitcoin Core's, as mempool.space passes them on (HTTP 400).
 */
const TXID = "a".repeat(64);
const HEX = `0200000001${"b".repeat(64)}`;

function answering(status: number, body: string) {
  return jest.fn(
    async (_url: RequestInfo | URL, _init?: RequestInit) =>
      ({ ok: status >= 200 && status < 300, status, text: async () => body }) as Response
  );
}

describe("broadcastTransaction", () => {
  it("posts the raw transaction and takes the node's txid for it", async () => {
    const fetchImpl = answering(200, `${TXID}\n`);

    await expect(broadcastTransaction(HEX, TXID, { fetchImpl })).resolves.toBe("sent");
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe(`${MEMPOOL_API_URL}/tx`);
    expect(init).toMatchObject({ method: "POST", body: HEX });
  });

  it("refuses an answer naming another transaction", async () => {
    await expect(
      broadcastTransaction(HEX, TXID, { fetchImpl: answering(200, "c".repeat(64)) })
    ).rejects.toMatchObject({ name: "ChainError", code: "invalidResponse" });
  });

  it("tells a transaction the node holds already from one it refuses", async () => {
    for (const body of [
      'sendrawtransaction RPC error: {"code":-27,"message":"Transaction already in block chain"}',
      'sendrawtransaction RPC error: {"code":-26,"message":"txn-already-known"}',
      'sendrawtransaction RPC error: {"code":-26,"message":"Transaction already in the mempool"}'
    ]) {
      await expect(
        broadcastTransaction(HEX, TXID, { fetchImpl: answering(400, body) })
      ).resolves.toBe("known");
    }
    for (const body of [
      'sendrawtransaction RPC error: {"code":-25,"message":"bad-txns-inputs-missingorspent"}',
      'sendrawtransaction RPC error: {"code":-26,"message":"non-BIP68-final"}',
      'sendrawtransaction RPC error: {"code":-26,"message":"insufficient fee, rejecting replacement"}'
    ]) {
      await expect(
        broadcastTransaction(HEX, TXID, { fetchImpl: answering(400, body) })
      ).resolves.toBe("refused");
    }
  });

  it("fails as the network when mempool.space does not answer, or answers an error of its own", async () => {
    const down = jest.fn(async () => {
      throw new TypeError("Network request failed");
    });
    await expect(broadcastTransaction(HEX, TXID, { fetchImpl: down })).rejects.toBeInstanceOf(
      ChainError
    );
    for (const status of [429, 500, 503]) {
      await expect(
        broadcastTransaction(HEX, TXID, { fetchImpl: answering(status, "Too many requests") })
      ).rejects.toMatchObject({ code: "network" });
    }
  });

  it("gives up past its time, the request aborted", async () => {
    jest.useFakeTimers();
    try {
      const hanging = jest.fn(
        (_url: RequestInfo | URL, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
          })
      );
      const sent = broadcastTransaction(HEX, TXID, { fetchImpl: hanging, timeoutMs: 1000 });
      const outcome = expect(sent).rejects.toMatchObject({ code: "network" });
      await jest.advanceTimersByTimeAsync(1000);
      await outcome;
    } finally {
      jest.useRealTimers();
    }
  });

  it("refuses to send without a txid to check the answer against", async () => {
    await expect(
      broadcastTransaction(HEX, "not-a-txid", { fetchImpl: answering(200, TXID) })
    ).rejects.toThrow("Invalid txid");
  });
});

describe("broadcastPackage", () => {
  const CHILD = `0300000001${"c".repeat(64)}`;
  const CHILD_TXID = "d".repeat(64);

  /** Bitcoin Core's `submitpackage` answer, as mempool's backend passes it on (keyed by wtxid). */
  function packageAnswer(
    message: string,
    entries: { txid: string; error?: string }[] = [{ txid: TXID }, { txid: CHILD_TXID }]
  ): string {
    return JSON.stringify({
      package_msg: message,
      "tx-results": Object.fromEntries(
        entries.map((entry, index) => [String(index).repeat(64), { ...entry, vsize: 150 }])
      ),
      "replaced-transactions": []
    });
  }

  it("posts the parent then its child, as a JSON array, and takes both in the mempool", async () => {
    const fetchImpl = answering(200, packageAnswer("success"));

    await expect(broadcastPackage(HEX, TXID, CHILD, { fetchImpl })).resolves.toBe("sent");
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe(`${MEMPOOL_API_URL}/txs/package`);
    expect(init).toMatchObject({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([HEX, CHILD])
    });
  });

  it("tells a package the node holds already from one it refuses", async () => {
    // Held already: Bitcoin Core's `txn-already-known`.
    await expect(
      broadcastPackage(HEX, TXID, CHILD, {
        fetchImpl: answering(
          200,
          packageAnswer("transaction failed", [
            { txid: TXID, error: "txn-already-known" },
            { txid: CHILD_TXID, error: "txn-already-known" }
          ])
        )
      })
    ).resolves.toBe("known");
    for (const answer of [
      packageAnswer("transaction failed", [
        { txid: TXID, error: "bad-txns-inputs-missingorspent" },
        { txid: CHILD_TXID, error: "bad-txns-inputs-missingorspent" }
      ]),
      packageAnswer("package-fee-too-low", [{ txid: TXID }, { txid: CHILD_TXID }])
    ]) {
      await expect(
        broadcastPackage(HEX, TXID, CHILD, { fetchImpl: answering(200, answer) })
      ).resolves.toBe("refused");
    }
    // The package refused whole (a transaction that does not parse): mempool's backend's HTTP 400.
    await expect(
      broadcastPackage(HEX, TXID, CHILD, {
        fetchImpl: answering(400, "Invalid transaction size for item 0")
      })
    ).resolves.toBe("refused");
  });

  it("refuses an answer that is not the package's", async () => {
    for (const answer of [
      "not json",
      JSON.stringify({ package_msg: "success" }),
      packageAnswer("success", [{ txid: TXID }]),
      packageAnswer("success", [{ txid: "e".repeat(64) }, { txid: CHILD_TXID }]),
      packageAnswer("success", [{ txid: TXID }, { txid: TXID }]),
      JSON.stringify({
        package_msg: "success",
        "tx-results": { a: { txid: TXID }, b: { txid: 7 } }
      })
    ]) {
      await expect(
        broadcastPackage(HEX, TXID, CHILD, { fetchImpl: answering(200, answer) })
      ).rejects.toMatchObject({ name: "ChainError", code: "invalidResponse" });
    }
  });

  it("fails as the network without an answer, or from a backend without the endpoint", async () => {
    for (const status of [404, 429, 500, 503]) {
      await expect(
        broadcastPackage(HEX, TXID, CHILD, {
          fetchImpl: answering(status, "endpoint does not exist")
        })
      ).rejects.toMatchObject({ name: "ChainError", code: "network" });
    }
    await expect(
      broadcastPackage(HEX, "not-a-txid", CHILD, { fetchImpl: answering(200, "") })
    ).rejects.toThrow("Invalid txid");
  });
});
