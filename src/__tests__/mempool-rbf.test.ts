import { MEMPOOL_API_URL } from "@/config/onchain";
import { ChainError } from "@/lib/onchain/esplora";
import { fetchReplacedTxids, MAX_VERSIONS } from "@/lib/onchain/mempool-rbf";

// The real client: jest.setup.ts replaces it with the fake chain everywhere else.
jest.unmock("@/lib/onchain/mempool-rbf");

/*
 * mempool.space's history of the replacements (RBF) of a transaction. The chain below is one
 * mempool.space told (`GET /api/v1/tx/<txid>/rbf`): ten versions of one payment, the
 * last mined in block 970816, the newest first.
 */
const CHAIN = [
  "333876f6cb1cd608c9f290781cbd0a664b2f867fdbd11c2f6c7aa0b9edfd7ae5",
  "a9894a364b9fe38c469f33cc1d87ef80689fbca374fb566a74d1050794b4baf2",
  "cfae761e706faaab8621ae6c04f7b05e96ace7c24799d7c6e64ac2c3c5684bc5",
  "f0b592045e3d5b40d64ab1e845ddbb13cef3c914f0db2325b03d7a8ee54157e1",
  "a8e96307a0d628e1debbf203e90c458a033551061c6f7a737d182dda07910c7f",
  "e8939dea2c59cfc34910b8195c4103ef1253f9ce5e07d29d9301d347e73f2a83",
  "7b2a86176904dad0ca11df410c602adbb4a0a7486d65b28ad437421916770df3",
  "f821dd284acfa130f00c27a7fbdea038ad2132cb06d888e43535d4b444d79a88",
  "07b294b7a719ad4b85c9e1c30dd7d102c76f9998ba877f7f05ae858d1c28382a",
  "b5676424051fdefe8fe97db2ab68f0cae62d75f70c471b675dd556a6ac1beecc"
];

type Tree = { tx: Record<string, unknown>; time: number; fullRbf: boolean; replaces: Tree[] };

/** The tree of `txids` (the newest first), each replacing the next, as mempool.space writes it. */
function treeOf(txids: readonly string[]): Tree {
  const [txid, ...older] = txids;
  return {
    tx: { txid, fee: 1748, vsize: 139.5, value: 10481, rate: 1.05, time: 1791662033, rbf: true },
    time: 1791662033,
    fullRbf: false,
    replaces: older.length > 0 ? [treeOf(older)] : []
  };
}

const answer = (status: number, body: unknown) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

const reply = (status: number, body: unknown) =>
  jest.fn(async () => answer(status, body)) as unknown as typeof fetch & jest.Mock;

describe("fetchReplacedTxids", () => {
  it("names every version a transaction replaced, from any version asked", async () => {
    const asked = CHAIN[6]!;
    const fetchImpl = reply(200, { replacements: treeOf(CHAIN), replaces: [CHAIN[7]] });
    const replaced = await fetchReplacedTxids(asked, { fetchImpl });
    expect(replaced.sort()).toEqual(CHAIN.slice(7).sort());
    expect(fetchImpl).toHaveBeenCalledWith(
      `${MEMPOOL_API_URL}/v1/tx/${asked}/rbf`,
      expect.objectContaining({ headers: { Accept: "application/json" } })
    );

    // The last version replaced all the others; the first replaced none.
    await expect(
      fetchReplacedTxids(CHAIN[0]!, { fetchImpl: reply(200, { replacements: treeOf(CHAIN) }) })
    ).resolves.toHaveLength(9);
    await expect(
      fetchReplacedTxids(CHAIN[9]!, { fetchImpl: reply(200, { replacements: treeOf(CHAIN) }) })
    ).resolves.toEqual([]);
  });

  it("names the versions of each branch a merge replaced", async () => {
    const merge = treeOf(CHAIN.slice(0, 1));
    merge.replaces = [treeOf(CHAIN.slice(1, 3)), treeOf(CHAIN.slice(3, 5))];
    const replaced = await fetchReplacedTxids(CHAIN[0]!, {
      fetchImpl: reply(200, { replacements: merge, replaces: [CHAIN[1], CHAIN[3]] })
    });
    expect(replaced.sort()).toEqual(CHAIN.slice(1, 5).sort());
  });

  it("names nothing when mempool.space tells nothing (forgotten, or never replaced)", async () => {
    const fetchImpl = reply(200, { replacements: null, replaces: null });
    await expect(fetchReplacedTxids(CHAIN[7]!, { fetchImpl })).resolves.toEqual([]);
    // Once: asked again on the same connection, the same server answers the same.
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("refuses an answer out of shape, and fails on an HTTP error", async () => {
    const outOfShape = [
      [],
      { replacements: { tx: { txid: "nope" }, replaces: [] } },
      { replacements: { tx: { txid: CHAIN[0] }, replaces: "nope" } },
      { replacements: { tx: { txid: CHAIN[0] }, replaces: [{ tx: {} }] } },
      { replacements: null, replaces: ["nope"] },
      { replacements: null, replaces: CHAIN[1] }
    ];
    for (const body of outOfShape) {
      await expect(
        fetchReplacedTxids(CHAIN[0]!, { fetchImpl: reply(200, body) })
      ).rejects.toMatchObject({ code: "invalidResponse" });
    }
    const limited = fetchReplacedTxids(CHAIN[0]!, { fetchImpl: reply(429, {}) });
    await expect(limited).rejects.toBeInstanceOf(ChainError);
    await expect(limited).rejects.toMatchObject({ code: "network" });
    await expect(fetchReplacedTxids("nope", { fetchImpl: reply(200, {}) })).rejects.toThrow(
      /Not a transaction id/
    );
  });

  it("refuses an answer naming more transactions than any chain has: each would cost a request", async () => {
    const txids = Array.from({ length: MAX_VERSIONS + 1 }, (_, n) =>
      (n + 1).toString(16).padStart(64, "0")
    );
    await expect(
      fetchReplacedTxids(CHAIN[0]!, {
        fetchImpl: reply(200, { replacements: null, replaces: txids })
      })
    ).rejects.toMatchObject({ code: "invalidResponse" });
    // As many as allowed are taken.
    await expect(
      fetchReplacedTxids(CHAIN[0]!, {
        fetchImpl: reply(200, { replacements: null, replaces: txids.slice(1) })
      })
    ).resolves.toHaveLength(MAX_VERSIONS);
  });

  it("refuses a tree of more versions than any chain has", async () => {
    const txids = Array.from({ length: 1001 }, (_, n) => n.toString(16).padStart(64, "0"));
    // Built bottom up, a thousand deep: the client reads it without recursion, and stops early.
    let tree: Tree | null = null;
    for (const txid of txids.reverse()) {
      tree = { tx: { txid }, time: 0, fullRbf: false, replaces: tree ? [tree] : [] };
    }
    await expect(
      fetchReplacedTxids(CHAIN[0]!, { fetchImpl: reply(200, { replacements: tree }) })
    ).rejects.toMatchObject({ code: "invalidResponse" });
  });
});
