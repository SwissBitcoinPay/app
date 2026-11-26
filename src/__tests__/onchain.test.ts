import { taprootAddress } from "../../jest/bitcoin";
import { formatBtcAmount, paymentUri } from "../lib/onchain/bip21";
import {
  ChainError,
  fetchAddressTxs,
  fetchTipHeight,
  fetchTipTime,
  fetchTx,
  parseChainTx,
  type ChainTx
} from "../lib/onchain/esplora";
import { confirmationsOf, onchainStatus } from "../lib/onchain/payment";

// The real client (hoisted by Jest): jest.setup.ts replaces it with the chain of jest/mempool.ts.
jest.unmock("../lib/onchain/esplora");

const ADDRESS = taprootAddress(1);
const OTHER = taprootAddress(2);
const TXID = "ab".repeat(32);
const API = "https://mempool.space/api";

/** The coin each test transaction spends: output 1 of a transaction of its own. */
const spent = (txid: string) => `${txid.slice(2)}ff:1`;

/** An Esplora transaction: outputs as [address, sats], in a block at `height` or in the mempool. */
function esploraTx(txid: string, outputs: [string, number][], height: number | null = null) {
  return {
    txid,
    version: 2,
    vin: [
      {
        txid: `${txid.slice(2)}ff`,
        vout: 1,
        prevout: { scriptpubkey_address: OTHER, value: 100_000 },
        is_coinbase: false,
        sequence: 4294967293
      }
    ],
    vout: outputs.map(([address, value]) => ({
      scriptpubkey: "5120…",
      scriptpubkey_type: "v1_p2tr",
      scriptpubkey_address: address,
      value
    })),
    status: height === null ? { confirmed: false } : { confirmed: true, block_height: height }
  };
}

function response(body: unknown, status = 200, text?: string): Response {
  return {
    ok: status < 400,
    status,
    json: async () => body,
    text: async () => text ?? JSON.stringify(body)
  } as Response;
}

describe("BIP-21", () => {
  it("writes the amount in bitcoins, exactly, without trailing zeros", () => {
    expect(formatBtcAmount(1n)).toBe("0.00000001");
    expect(formatBtcAmount(46_918n)).toBe("0.00046918");
    expect(formatBtcAmount(100_000_000n)).toBe("1");
    expect(formatBtcAmount(150_000_000n)).toBe("1.5");
    expect(formatBtcAmount(2_100_000_000_000_000n)).toBe("21000000");
    expect(formatBtcAmount(2_099_999_999_999_999n)).toBe("20999999.99999999");
    expect(() => formatBtcAmount(0n)).toThrow();
  });

  it("puts both networks in one URI, or the address alone", () => {
    expect(paymentUri({ address: ADDRESS, sats: 46_918n, invoice: "lnbc469180n1p" })).toBe(
      `bitcoin:${ADDRESS}?amount=0.00046918&lightning=lnbc469180n1p`
    );
    expect(paymentUri({ address: ADDRESS, sats: 46_918n })).toBe(
      `bitcoin:${ADDRESS}?amount=0.00046918`
    );
  });

  describe("with the sale's title (the wallet's button)", () => {
    const query = (uri: string) => uri.slice(uri.indexOf("?") + 1).split("&");

    // Core, Electrum, Muun, Phoenix read `message`; Sparrow, BlueWallet `label`, and BlueWallet
    // only before `lightning`.
    it("gives it as label and message, before the invoice", () => {
      expect(
        paymentUri({ address: ADDRESS, sats: 46_918n, invoice: "lnbc469180n1p", title: "Table 4" })
      ).toBe(
        `bitcoin:${ADDRESS}?amount=0.00046918&label=Table%204&message=Table%204&lightning=lnbc469180n1p`
      );
      expect(paymentUri({ address: ADDRESS, sats: 46_918n, title: "Table 4" })).toBe(
        `bitcoin:${ADDRESS}?amount=0.00046918&label=Table%204&message=Table%204`
      );
    });

    // Wallets refuse a raw `;` or space (Muun, Sparrow), split on a raw `?` or `:` (Zeus,
    // BlueWallet), and Core and the Breez SDK read `+` as a plus.
    it("percent-encodes it as UTF-8, a space as %20: nothing a wallet splits on stays raw", () => {
      const title = "Invoice 14; Studio Zürich & co? a=b #2 +5% bitcoin:x/ø 🍞";
      const uri = paymentUri({ address: ADDRESS, sats: 1_000n, invoice: "lnbc10u1p", title });
      const params = query(uri);
      expect(params.map((param) => param.split("=")[0])).toEqual([
        "amount",
        "label",
        "message",
        "lightning"
      ]);
      for (const param of params.slice(1, 3)) {
        const value = param.slice(param.indexOf("=") + 1);
        expect(value).toMatch(/^[A-Za-z0-9\-_.!~*'()%]+$/);
        expect(value).not.toContain("+");
        expect(decodeURIComponent(value)).toBe(title);
      }
      expect(uri).toContain("Z%C3%BCrich");
      expect(uri).toContain("%F0%9F%8D%9E");
    });

    it("puts it on one line, and never throws on a text UTF-8 cannot carry", () => {
      const uri = paymentUri({
        address: ADDRESS,
        sats: 1_000n,
        title: "  Table 4\n\tterrace\u0000\u0085 \uD83C  "
      });
      expect(query(uri).slice(1)).toEqual([
        "label=Table%204%20terrace%20%EF%BF%BD",
        "message=Table%204%20terrace%20%EF%BF%BD"
      ]);
    });

    it("leaves out an empty title", () => {
      for (const title of ["", " \n "]) {
        expect(paymentUri({ address: ADDRESS, sats: 46_918n, invoice: "lnbc1p", title })).toBe(
          `bitcoin:${ADDRESS}?amount=0.00046918&lightning=lnbc1p`
        );
      }
    });
  });
});

describe("Esplora client", () => {
  it("reads what each transaction pays the address, mempool and blocks", async () => {
    const fetchImpl = jest.fn(async () =>
      response([
        esploraTx(TXID, [
          [ADDRESS, 30_000],
          [OTHER, 5_000],
          [ADDRESS, 16_918]
        ]),
        esploraTx("cd".repeat(32), [[ADDRESS, 1_000]], 900_000),
        // Spends from the address: pays it nothing.
        esploraTx("ef".repeat(32), [[OTHER, 1_000]], 899_999)
      ])
    );

    await expect(fetchAddressTxs(API, ADDRESS, { fetchImpl })).resolves.toEqual([
      {
        txid: TXID,
        received: 46_918n,
        confirmed: false,
        blockHeight: null,
        inputs: [spent(TXID)]
      },
      {
        txid: "cd".repeat(32),
        received: 1_000n,
        confirmed: true,
        blockHeight: 900_000,
        inputs: [spent("cd".repeat(32))]
      }
    ]);
    expect(fetchImpl).toHaveBeenCalledWith(`${API}/address/${ADDRESS}/txs`, {
      headers: { Accept: "application/json" },
      signal: expect.any(AbortSignal)
    });
  });

  it("refuses an answer out of shape", async () => {
    const answers = [
      { not: "a list" },
      [{ ...esploraTx(TXID, [[ADDRESS, 1]]), txid: "nothex" }],
      [esploraTx(TXID, [[ADDRESS, 1.5]])],
      [esploraTx(TXID, [[ADDRESS, -1]])],
      [esploraTx(TXID, [[ADDRESS, Number.MAX_SAFE_INTEGER + 2]])],
      [{ ...esploraTx(TXID, [[ADDRESS, 1]]), status: { confirmed: true } }],
      [{ ...esploraTx(TXID, [[ADDRESS, 1]]), status: { confirmed: "yes" } }],
      // The coins it spends: needed to tell a replacement (RBF).
      [{ ...esploraTx(TXID, [[ADDRESS, 1]]), vin: undefined }],
      [{ ...esploraTx(TXID, [[ADDRESS, 1]]), vin: [{ txid: "nothex", vout: 0 }] }],
      [{ ...esploraTx(TXID, [[ADDRESS, 1]]), vin: [{ txid: TXID.toUpperCase(), vout: 0 }] }],
      [{ ...esploraTx(TXID, [[ADDRESS, 1]]), vin: [{ txid: TXID, vout: -1 }] }],
      [{ ...esploraTx(TXID, [[ADDRESS, 1]]), vin: [{ txid: TXID, vout: 4294967296 }] }],
      [{ ...esploraTx(TXID, [[ADDRESS, 1]]), vin: ["input"] }]
    ];
    for (const answer of answers) {
      await expect(
        fetchAddressTxs(API, ADDRESS, { fetchImpl: async () => response(answer) })
      ).rejects.toMatchObject({ name: "ChainError", code: "invalidResponse" });
    }
  });

  it("reports an explorer it could not reach, or an HTTP error, as a network failure", async () => {
    await expect(
      fetchAddressTxs(API, ADDRESS, {
        fetchImpl: async () => {
          throw new TypeError("Network request failed");
        }
      })
    ).rejects.toMatchObject({ code: "network" });
    await expect(
      fetchTipHeight(API, { fetchImpl: async () => response(null, 503, "busy") })
    ).rejects.toBeInstanceOf(ChainError);
  });

  it("reads one transaction and the chain's height", async () => {
    await expect(
      fetchTx(API, TXID, ADDRESS, {
        fetchImpl: async () => response(esploraTx(TXID, [[ADDRESS, 7]], 900_001))
      })
    ).resolves.toEqual({
      txid: TXID,
      received: 7n,
      confirmed: true,
      blockHeight: 900_001,
      inputs: [spent(TXID)]
    });
    // Another transaction than the one asked for.
    await expect(
      fetchTx(API, TXID, ADDRESS, {
        fetchImpl: async () => response(esploraTx("cd".repeat(32), [[ADDRESS, 7]], 1))
      })
    ).rejects.toMatchObject({ code: "invalidResponse" });
    await expect(
      fetchTipHeight(API, { fetchImpl: async () => response(null, 200, "969592\n") })
    ).resolves.toBe(969_592);
    await expect(
      fetchTipHeight(API, { fetchImpl: async () => response(null, 200, "<html>") })
    ).rejects.toMatchObject({ code: "invalidResponse" });
  });

  it("reads when the chain's last block was made, from its header", async () => {
    const HASH = "00".repeat(12) + "ab".repeat(20);
    const node = (block: unknown, hash = `${HASH}\n`) =>
      (async (url: string) =>
        url.endsWith("/blocks/tip/hash")
          ? response(null, 200, hash)
          : response(block)) as unknown as typeof fetch;
    await expect(
      fetchTipTime(API, { fetchImpl: node({ id: HASH, height: 900_000, timestamp: 1790000000 }) })
    ).resolves.toBe(1_790_000_000);
    // Another block than the tip, a time out of shape, a hash that is none: refused.
    for (const block of [
      { id: "cd".repeat(32), timestamp: 1790000000 },
      { id: HASH, timestamp: "1790000000" },
      { id: HASH, timestamp: -1 },
      { id: HASH }
    ]) {
      await expect(fetchTipTime(API, { fetchImpl: node(block) })).rejects.toMatchObject({
        code: "invalidResponse"
      });
    }
    await expect(
      fetchTipTime(API, { fetchImpl: node({ id: HASH, timestamp: 1 }, "<html>") })
    ).rejects.toMatchObject({ code: "invalidResponse" });
  });

  it("gives up past its timeout", async () => {
    const hanging = (_url: unknown, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      });
    await expect(
      fetchTipHeight(API, { fetchImpl: hanging as typeof fetch, timeoutMs: 10 })
    ).rejects.toMatchObject({ code: "network" });
  });

  it("reads the transactions the WebSocket pushes the same way", () => {
    expect(parseChainTx(esploraTx(TXID, [[ADDRESS, 3]]), ADDRESS)).toEqual({
      txid: TXID,
      received: 3n,
      confirmed: false,
      blockHeight: null,
      inputs: [spent(TXID)]
    });
    expect(parseChainTx("junk", ADDRESS)).toBeNull();
  });

  it("reads every coin a transaction spends, in its order, a coinbase's none", () => {
    const tx = esploraTx(TXID, [[ADDRESS, 3]]);
    expect(
      parseChainTx(
        {
          ...tx,
          vin: [
            { txid: "01".repeat(32), vout: 4294967295 },
            { txid: "02".repeat(32), vout: 0, is_coinbase: false }
          ]
        },
        ADDRESS
      )?.inputs
    ).toEqual([`${"01".repeat(32)}:4294967295`, `${"02".repeat(32)}:0`]);
    expect(
      parseChainTx(
        { ...tx, vin: [{ txid: "00".repeat(32), vout: 4294967295, is_coinbase: true }] },
        ADDRESS
      )?.inputs
    ).toEqual([]);
  });
});

describe("on-chain payment status", () => {
  const tx = (received: bigint, blockHeight: number | null, txid = TXID): ChainTx => ({
    txid,
    received,
    confirmed: blockHeight !== null,
    blockHeight,
    inputs: []
  });

  it("counts confirmations from the chain's height", () => {
    expect(confirmationsOf(tx(1n, null), 900_000)).toBe(0);
    expect(confirmationsOf(tx(1n, 900_000), 900_000)).toBe(1);
    expect(confirmationsOf(tx(1n, 899_998), 900_000)).toBe(3);
    // An explorer whose tip lags: still mined.
    expect(confirmationsOf(tx(1n, 900_001), 900_000)).toBe(1);
    expect(confirmationsOf(tx(1n, 900_001), null)).toBe(1);
  });

  it("is paid once enough is received and every transaction is 3 blocks deep", () => {
    expect(onchainStatus([], 900_000, 46_918n)).toEqual({ kind: "none" });
    expect(onchainStatus([tx(46_918n, null)], 900_000, 46_918n)).toEqual({
      kind: "unconfirmed",
      received: 46_918n,
      confirmations: 0
    });
    expect(onchainStatus([tx(46_918n, 899_999)], 900_000, 46_918n)).toEqual({
      kind: "unconfirmed",
      received: 46_918n,
      confirmations: 2
    });
    expect(onchainStatus([tx(46_918n, 899_998)], 900_000, 46_918n)).toEqual({
      kind: "confirmed",
      received: 46_918n,
      txids: [TXID]
    });
    // An overpayment is a payment.
    expect(onchainStatus([tx(50_000n, 899_998)], 900_000, 46_918n)).toMatchObject({
      kind: "confirmed",
      received: 50_000n
    });
  });

  it("adds up a payment made in several times, as deep as its last part", () => {
    const parts = [tx(30_000n, 899_990, "aa".repeat(32)), tx(16_918n, 899_999, "bb".repeat(32))];
    expect(onchainStatus(parts, 900_000, 46_918n)).toEqual({
      kind: "unconfirmed",
      received: 46_918n,
      confirmations: 2
    });
    expect(onchainStatus(parts, 900_001, 46_918n)).toEqual({
      kind: "confirmed",
      received: 46_918n,
      txids: ["aa".repeat(32), "bb".repeat(32)]
    });
  });

  it("says what is missing from an underpayment, however deep", () => {
    expect(onchainStatus([tx(30_000n, 899_000)], 900_000, 46_918n)).toEqual({
      kind: "underpaid",
      received: 30_000n,
      rest: 16_918n
    });
  });
});
