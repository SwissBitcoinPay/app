import { getWithTimeout } from "@/lib/http";

import { CHAIN_TIMEOUT_MS, ChainError, type ChainOptions } from "./esplora";
import { MAX_VOUT } from "./replacement";

/*
 * What an address holds, as an Esplora explorer (mempool.space: src/config/onchain.ts) shows it:
 * whether it was ever used, and its coins not spent yet. For the transfer of the v2 wallet's funds
 * (src/lib/legacy-v2/wallet.ts), which finds the wallet's addresses as any wallet does (used ones
 * until a gap of unused ones) and spends their coins. Answers are untrusted: every field is checked,
 * an answer out of shape is refused. A lie cannot make the transfer spend more than the coins hold:
 * a SegWit signature commits to each coin's amount, and a transaction built on a wrong one is
 * refused by the network.
 */

/** A coin of the address, not spent yet. */
export type AddressCoin = {
  txid: string;
  vout: number;
  /** Its value, exact. */
  sats: bigint;
  confirmed: boolean;
};

export type AddressCoins = {
  /** Whether any transaction ever paid or spent from the address (in a block or the mempool). */
  used: boolean;
  coins: AddressCoin[];
};

const TXID = /^[0-9a-f]{64}$/;
/** Most coins one address is taken to hold: an answer with more is refused. */
const MAX_COINS = 10_000;

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function wholeNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

async function getJson(url: string, options: ChainOptions): Promise<unknown> {
  try {
    return await getWithTimeout(
      url,
      options.fetchImpl ?? fetch,
      options.timeoutMs ?? CHAIN_TIMEOUT_MS,
      async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return (await response.json()) as unknown;
      }
    );
  } catch (error) {
    throw new ChainError("network", `GET ${url} failed: ${String(error)}`);
  }
}

/** Esplora's `chain_stats` or `mempool_stats` of an address: its transactions, its coins left. */
function statsOf(value: unknown): { txs: number; unspent: number } | null {
  if (!isObject(value)) return null;
  const txs = wholeNumber(value.tx_count);
  const funded = wholeNumber(value.funded_txo_count);
  const spent = wholeNumber(value.spent_txo_count);
  if (txs === null || funded === null || spent === null) return null;
  return { txs, unspent: funded - spent };
}

/** The coins of `GET /address/:address/utxo`, or null when out of shape. */
function coinsOf(body: unknown): AddressCoin[] | null {
  if (!Array.isArray(body) || body.length > MAX_COINS) return null;
  const coins: AddressCoin[] = [];
  const seen = new Set<string>();
  for (const item of body as unknown[]) {
    if (!isObject(item) || !isObject(item.status)) return null;
    const { txid } = item;
    const vout = wholeNumber(item.vout);
    const sats = wholeNumber(item.value);
    const { confirmed } = item.status;
    if (typeof txid !== "string" || !TXID.test(txid) || vout === null || vout > MAX_VOUT) {
      return null;
    }
    if (sats === null || typeof confirmed !== "boolean") return null;
    const key = `${txid}:${vout}`;
    if (seen.has(key)) return null;
    seen.add(key);
    coins.push({ txid, vout, sats: BigInt(sats), confirmed });
  }
  return coins;
}

/**
 * Whether `address` was used, and its coins not spent yet (`GET /address/:address`, then, only
 * when it holds some, `GET /address/:address/utxo`). `address` is lowercase, as Esplora prints
 * bech32 addresses. Rejects ChainError.
 */
export async function fetchAddressCoins(
  baseUrl: string,
  address: string,
  options: ChainOptions = {}
): Promise<AddressCoins> {
  const url = `${baseUrl}/address/${address}`;
  const body = await getJson(url, options);
  if (!isObject(body)) throw new ChainError("invalidResponse", `GET ${url}: not an object`);
  const chain = statsOf(body.chain_stats);
  const mempool = statsOf(body.mempool_stats);
  if (!chain || !mempool) throw new ChainError("invalidResponse", `GET ${url}: out of shape`);
  const used = chain.txs + mempool.txs > 0;
  if (chain.unspent + mempool.unspent <= 0) return { used, coins: [] };
  const coinsUrl = `${url}/utxo`;
  const coins = coinsOf(await getJson(coinsUrl, options));
  if (!coins) throw new ChainError("invalidResponse", `GET ${coinsUrl}: out of shape`);
  return { used: used || coins.length > 0, coins };
}
