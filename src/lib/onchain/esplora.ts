import { getWithTimeout } from "@/lib/http";

import { MAX_VOUT, outpoint } from "./replacement";

/*
 * Client of the Esplora REST API (mempool.space, or the merchant's own node:
 * src/features/onchain/explorer.ts), for the address of an invoice: which transactions pay it, how
 * deep they are. Answers are untrusted: every field is checked, an answer out of shape is refused.
 */

/** Per request: the payer may be waiting at the counter. */
export const CHAIN_TIMEOUT_MS = 10_000;

export type ChainErrorCode =
  /** No answer, or an HTTP error: network down, explorer unreachable. */
  | "network"
  /** An answer out of the API's shape. */
  | "invalidResponse";

export class ChainError extends Error {
  readonly code: ChainErrorCode;

  constructor(code: ChainErrorCode, message: string) {
    super(message);
    this.name = "ChainError";
    this.code = code;
  }
}

export type ChainOptions = {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

/** A transaction as far as one address is concerned. */
export type ChainTx = {
  txid: string;
  /** Sats it pays to the address: the sum of its outputs to it, exact. */
  received: bigint;
  confirmed: boolean;
  /** Height of its block when confirmed, else null. */
  blockHeight: number | null;
  /**
   * The coins it spends (`<txid>:<vout>`, replacement.ts), in its order: a transaction that spends
   * one of them too replaces it (RBF). A coinbase input spends none.
   */
  inputs: string[];
};

const TXID = /^[0-9a-f]{64}$/;

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** A whole, non-negative JSON number, else null. Sats (2.1e15 at most) are exact as numbers. */
function wholeNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

/** The coins `vin` spends, or null when it is out of shape. */
function inputsOf(vin: unknown[]): string[] | null {
  const inputs: string[] = [];
  for (const input of vin) {
    if (!isObject(input)) return null;
    if (input.is_coinbase === true) continue;
    const vout = wholeNumber(input.vout);
    if (typeof input.txid !== "string" || !TXID.test(input.txid)) return null;
    if (vout === null || vout > MAX_VOUT) return null;
    inputs.push(outpoint(input.txid, vout));
  }
  return inputs;
}

/**
 * The transaction `value` (Esplora's format, also mempool.space's WebSocket's) as far as
 * `address` is concerned, or null when it is out of shape. `address` is lowercase, as Esplora
 * prints bech32 addresses.
 */
export function parseChainTx(value: unknown, address: string): ChainTx | null {
  if (!isObject(value) || typeof value.txid !== "string" || !TXID.test(value.txid)) return null;
  if (!Array.isArray(value.vout) || !Array.isArray(value.vin) || !isObject(value.status)) {
    return null;
  }
  const inputs = inputsOf(value.vin);
  if (!inputs) return null;
  let received = 0n;
  for (const output of value.vout) {
    if (!isObject(output)) return null;
    const sats = wholeNumber(output.value);
    if (sats === null) return null;
    if (output.scriptpubkey_address === address) received += BigInt(sats);
  }
  const { confirmed, block_height: height } = value.status;
  if (typeof confirmed !== "boolean") return null;
  const blockHeight = confirmed ? wholeNumber(height) : null;
  if (confirmed && blockHeight === null) return null;
  return { txid: value.txid, received, confirmed, blockHeight, inputs };
}

async function get<T>(
  url: string,
  options: ChainOptions,
  read: (response: Response) => Promise<T>
): Promise<T> {
  try {
    return await getWithTimeout(
      url,
      options.fetchImpl ?? fetch,
      options.timeoutMs ?? CHAIN_TIMEOUT_MS,
      async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return read(response);
      }
    );
  } catch (error) {
    throw new ChainError("network", `GET ${url} failed: ${String(error)}`);
  }
}

/**
 * The transactions paying `address` (`GET /address/:address/txs`: those in the mempool, then
 * the confirmed ones, newest first). Those paying it nothing (spending from it) are left out.
 */
export async function fetchAddressTxs(
  baseUrl: string,
  address: string,
  options: ChainOptions = {}
): Promise<ChainTx[]> {
  const url = `${baseUrl}/address/${address}/txs`;
  const body = await get(url, options, (response) => response.json() as Promise<unknown>);
  if (!Array.isArray(body)) throw new ChainError("invalidResponse", `GET ${url}: not a list`);
  const txs: ChainTx[] = [];
  for (const item of body) {
    const tx = parseChainTx(item, address);
    if (!tx) throw new ChainError("invalidResponse", `GET ${url}: a transaction out of shape`);
    if (tx.received > 0n) txs.push(tx);
  }
  return txs;
}

/** The transaction `txid` as far as `address` is concerned (`GET /tx/:txid`). */
export async function fetchTx(
  baseUrl: string,
  txid: string,
  address: string,
  options: ChainOptions = {}
): Promise<ChainTx> {
  const url = `${baseUrl}/tx/${txid}`;
  const body = await get(url, options, (response) => response.json() as Promise<unknown>);
  const tx = parseChainTx(body, address);
  if (!tx || tx.txid !== txid) throw new ChainError("invalidResponse", `GET ${url}: out of shape`);
  return tx;
}

/** Height of the chain's last block (`GET /blocks/tip/height`, plain text). */
export async function fetchTipHeight(baseUrl: string, options: ChainOptions = {}): Promise<number> {
  const url = `${baseUrl}/blocks/tip/height`;
  const text = await get(url, options, (response) => response.text());
  const height = /^\d{1,9}$/.test(text.trim()) ? Number(text.trim()) : null;
  if (height === null) throw new ChainError("invalidResponse", `GET ${url}: not a height`);
  return height;
}

const BLOCK_HASH = /^[0-9a-f]{64}$/;

/**
 * When the chain's last block was made (`GET /blocks/tip/hash`, then `GET /block/:hash`: its
 * header's `timestamp`, Unix seconds): how far behind an explorer is ("Bitcoin node",
 * src/features/onchain/node-test.ts).
 */
export async function fetchTipTime(baseUrl: string, options: ChainOptions = {}): Promise<number> {
  const hashUrl = `${baseUrl}/blocks/tip/hash`;
  const hash = (await get(hashUrl, options, (response) => response.text())).trim();
  if (!BLOCK_HASH.test(hash)) throw new ChainError("invalidResponse", `GET ${hashUrl}: not a hash`);
  const url = `${baseUrl}/block/${hash}`;
  const body = await get(url, options, (response) => response.json() as Promise<unknown>);
  const time = isObject(body) && body.id === hash ? wholeNumber(body.timestamp) : null;
  if (time === null) throw new ChainError("invalidResponse", `GET ${url}: out of shape`);
  return time;
}
