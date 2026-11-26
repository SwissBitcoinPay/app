// The alias a Lightning node announces, as mempool.space tells it (src/lib/lightning/node-alias.ts):
// the real client (jest.setup.ts fakes it for the other tests).
const { fetchNodeAlias, NODE_ALIAS_TIMEOUT_MS } = jest.requireActual<
  typeof import("@/lib/lightning/node-alias")
>("@/lib/lightning/node-alias");

/** LNBank's node, as mempool.space answers for it (shortened). */
const LNBANK = "03217102c3a91590ab5081921df6509844434761a074c6071661729410f3672029";
const ANSWER = {
  public_key: LNBANK,
  alias: "LNBank",
  first_seen: 1649623769,
  updated_at: 1788039920,
  color: "#68f442",
  sockets: "46.101.122.181:30741"
};

function answering(status: number, body: unknown) {
  return jest.fn(
    async (_url: string) =>
      ({
        ok: status < 400,
        status,
        text: async () => (typeof body === "string" ? body : JSON.stringify(body))
      }) as Response
  );
}

describe("the alias a node announces", () => {
  it("is read from mempool.space's node, asked by its key", async () => {
    const fetchImpl = answering(200, ANSWER);
    await expect(
      fetchNodeAlias(LNBANK, { fetchImpl: fetchImpl as unknown as typeof fetch })
    ).resolves.toBe("LNBank");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][0]).toBe(
      `https://mempool.space/api/v1/lightning/nodes/${LNBANK}`
    );
  });

  it("drops BOLT #7's padding, and keeps a name of 32 bytes at most", async () => {
    const read = (alias: unknown) =>
      fetchNodeAlias(LNBANK, {
        fetchImpl: answering(200, { ...ANSWER, alias }) as unknown as typeof fetch
      });
    await expect(read("LNBank\u0000\u0000")).resolves.toBe("LNBank");
    await expect(read("ü".repeat(16))).resolves.toBe("ü".repeat(16));
    await expect(read("ü".repeat(17))).resolves.toBeNull();
    await expect(read("")).resolves.toBeNull();
    await expect(read("  ")).resolves.toBeNull();
    await expect(read(42)).resolves.toBeNull();
  });

  it("is none for a node mempool.space does not know (a private one), or an error", async () => {
    for (const [status, body] of [
      [404, { error: "Failed to get node" }],
      [200, { error: "Failed to get node" }],
      [500, "Internal error"],
      [200, "<html>"],
      [200, []],
      [200, null],
      [200, "x".repeat(70_000)]
    ] as const) {
      await expect(
        fetchNodeAlias(LNBANK, { fetchImpl: answering(status, body) as unknown as typeof fetch })
      ).resolves.toBeNull();
    }
  });

  it("never takes an answer about another node", async () => {
    const other = `02${LNBANK.slice(2)}`;
    await expect(
      fetchNodeAlias(LNBANK, {
        fetchImpl: answering(200, { ...ANSWER, public_key: other }) as unknown as typeof fetch
      })
    ).resolves.toBeNull();
  });

  it("asks nothing for what is not a node's key", async () => {
    const fetchImpl = answering(200, ANSWER);
    for (const node of [LNBANK.toUpperCase(), `04${LNBANK.slice(2)}`, "../../address/x", ""]) {
      await expect(
        fetchNodeAlias(node, { fetchImpl: fetchImpl as unknown as typeof fetch })
      ).resolves.toBeNull();
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("gives up past its time, or when the network fails", async () => {
    expect(NODE_ALIAS_TIMEOUT_MS).toBe(3000);
    await expect(
      fetchNodeAlias(LNBANK, {
        fetchImpl: (async () => {
          throw new TypeError("Network request failed");
        }) as typeof fetch
      })
    ).resolves.toBeNull();
    jest.useFakeTimers();
    try {
      const never = (async (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("Aborted")));
        })) as typeof fetch;
      const pending = fetchNodeAlias(LNBANK, { fetchImpl: never });
      await jest.advanceTimersByTimeAsync(NODE_ALIAS_TIMEOUT_MS);
      await expect(pending).resolves.toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });
});
