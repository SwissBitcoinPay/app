import { BLOCKCYPHER_API_URL } from "@/config/onchain";
import { getWithTimeout } from "@/lib/http";

import { CHAIN_TIMEOUT_MS, ChainError, type ChainOptions } from "./esplora";
import { MAX_VOUT, outpoint } from "./replacement";

/*
 * When a transaction was broadcast, as BlockCypher saw it (src/config/onchain.ts): the rate of
 * that hour is the one an on-chain payment is due at. A third party's word, like the explorers':
 * the same for every device that asks, which is what the amount due needs.
 */

const TXID = /^[0-9a-f]{64}$/;

/** `received` as BlockCypher writes it: UTC, a fraction of 1 to 9 digits (checkout-spec §31). */
const RECEIVED =
  /^([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2}):([0-9]{2})(?:\.([0-9]{1,9}))?Z$/;

/**
 * BlockCypher's `received` in Unix milliseconds, the fraction past milliseconds dropped (never
 * rounded), above 0; null for anything else (checkout-spec SPEC.md §31, Explorers, as the
 * integrations' servers read it): a date and time that exists (no leap second), never another
 * spelling of RFC 3339, nor what `Date.parse` would guess (its reading of other forms, and of more
 * than 3 digits of fraction, is each engine's own).
 */
export function parseReceived(text: string): number | null {
  const match = RECEIVED.exec(text);
  if (!match) return null;
  const [year, month, day, hours, minutes, seconds] = match.slice(1, 7).map(Number);
  if (hours > 23 || minutes > 59 || seconds > 59) return null;
  const date = new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds));
  // A day or month that does not exist rolls over; a year below 100, Date.UTC reads as 19xx.
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  const time = date.getTime() + Number((match[7] ?? "").slice(0, 3).padEnd(3, "0"));
  return time > 0 ? time : null;
}

/** `received` of each transaction already read: it never changes. */
const receivedTimes = new Map<string, number>();

/** What fetchTxDetails read of each transaction: it never changes either (its txid commits to it). */
const detailsRead = new Map<string, ReadDetails>();

/** Tests only. */
export function resetReceivedTimes(): void {
  receivedTimes.clear();
  detailsRead.clear();
}

/**
 * When BlockCypher first received `txid` (its `received`, Unix milliseconds); null while it does
 * not know the transaction yet (HTTP 404, a few seconds after its broadcast). Rejects on any other
 * failure (`ChainError`), an answer for another transaction or without a valid time included.
 */
export async function fetchTxReceived(
  txid: string,
  { fetchImpl = fetch, timeoutMs = CHAIN_TIMEOUT_MS }: ChainOptions = {}
): Promise<number | null> {
  if (!TXID.test(txid)) throw new ChainError("invalidResponse", `Not a transaction id: ${txid}`);
  const known = receivedTimes.get(txid);
  if (known !== undefined) return known;

  const url = `${BLOCKCYPHER_API_URL}/txs/${txid}?limit=1&includeHex=false`;
  let body: unknown;
  try {
    body = await getWithTimeout(url, fetchImpl, timeoutMs, async (res): Promise<unknown> => {
      if (res.status === 404) return null;
      if (!res.ok) throw new ChainError("network", `${url} → ${res.status}`);
      return res.json();
    });
  } catch (error) {
    if (error instanceof ChainError) throw error;
    throw new ChainError("network", error instanceof Error ? error.message : String(error));
  }
  if (body === null) return null;
  const tx = body as { hash?: unknown; received?: unknown };
  if (tx.hash !== txid || typeof tx.received !== "string") {
    throw new ChainError("invalidResponse", "BlockCypher answered another transaction");
  }
  const time = parseReceived(tx.received);
  if (time === null) {
    throw new ChainError("invalidResponse", `Invalid received time: ${tx.received}`);
  }
  receivedTimes.set(txid, time);
  return time;
}

/** Inputs and outputs asked at most (BlockCypher's own maximum for one answer). */
const DETAILS_LIMIT = 100;

type ReadDetails = {
  receivedAt: number;
  outputs: [address: string, sats: bigint][];
  inputs: string[];
};

/** What BlockCypher keeps of a transaction, as far as one address is concerned. */
export type TxDetails = {
  /** When BlockCypher first received it (Unix milliseconds). */
  receivedAt: number;
  /** What it pays the address, among its first DETAILS_LIMIT outputs. */
  sats: bigint;
  /** The coins it spends (`<txid>:<vout>`, replacement.ts), its first DETAILS_LIMIT. */
  inputs: string[];
};

function safeWhole(value: unknown, max: number): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= max
    ? value
    : null;
}

function parseDetails(body: unknown, txid: string): ReadDetails {
  const tx = body as {
    hash?: unknown;
    received?: unknown;
    inputs?: unknown;
    outputs?: unknown;
  } | null;
  if (tx?.hash !== txid || typeof tx.received !== "string") {
    throw new ChainError("invalidResponse", "BlockCypher answered another transaction");
  }
  const receivedAt = parseReceived(tx.received);
  if (receivedAt === null) {
    throw new ChainError("invalidResponse", `Invalid received time: ${tx.received}`);
  }
  if (!Array.isArray(tx.inputs) || !Array.isArray(tx.outputs)) {
    throw new ChainError("invalidResponse", "BlockCypher's transaction without its inputs");
  }
  const inputs: string[] = [];
  for (const input of tx.inputs as unknown[]) {
    const { prev_hash: from, output_index: index } = (input ?? {}) as Record<string, unknown>;
    // A coinbase input spends no coin.
    if (from === undefined) continue;
    const vout = safeWhole(index, MAX_VOUT);
    if (typeof from !== "string" || !TXID.test(from) || vout === null) {
      throw new ChainError("invalidResponse", "BlockCypher's input out of shape");
    }
    inputs.push(outpoint(from, vout));
  }
  const outputs: ReadDetails["outputs"] = [];
  for (const output of tx.outputs as unknown[]) {
    const { value, addresses } = (output ?? {}) as Record<string, unknown>;
    const sats = safeWhole(value, Number.MAX_SAFE_INTEGER);
    if (
      sats === null ||
      (addresses !== null && addresses !== undefined && !Array.isArray(addresses))
    ) {
      throw new ChainError("invalidResponse", "BlockCypher's output out of shape");
    }
    // Paid to one address (a script of several is no deposit address's).
    const [to, ...others] = (addresses ?? []) as unknown[];
    if (typeof to === "string" && others.length === 0) outputs.push([to, BigInt(sats)]);
  }
  return { receivedAt, outputs, inputs };
}

/**
 * What BlockCypher keeps of `txid` as far as `address` (lowercase) is concerned: when it received
 * it, what it pays the address and the coins it spends. BlockCypher keeps a transaction once it was
 * replaced (RBF), where the explorers forget it (as checked minutes after a replacement:
 * for how long is not known): a replacement's coins are told against these. Null while it does not know the transaction (HTTP 404). Rejects on any other
 * failure (`ChainError`). A transaction of more than DETAILS_LIMIT inputs or outputs is read in part:
 * fewer coins, perhaps less paid, never more.
 */
export async function fetchTxDetails(
  txid: string,
  address: string,
  { fetchImpl = fetch, timeoutMs = CHAIN_TIMEOUT_MS }: ChainOptions = {}
): Promise<TxDetails | null> {
  if (!TXID.test(txid)) throw new ChainError("invalidResponse", `Not a transaction id: ${txid}`);
  let read = detailsRead.get(txid);
  if (!read) {
    const url = `${BLOCKCYPHER_API_URL}/txs/${txid}?limit=${DETAILS_LIMIT}&includeHex=false`;
    let body: unknown;
    try {
      body = await getWithTimeout(url, fetchImpl, timeoutMs, async (res): Promise<unknown> => {
        if (res.status === 404) return null;
        if (!res.ok) throw new ChainError("network", `${url} → ${res.status}`);
        return res.json();
      });
    } catch (error) {
      if (error instanceof ChainError) throw error;
      throw new ChainError("network", error instanceof Error ? error.message : String(error));
    }
    if (body === null) return null;
    read = parseDetails(body, txid);
    detailsRead.set(txid, read);
    receivedTimes.set(txid, read.receivedAt);
  }
  const sats = read.outputs
    .filter(([to]) => to === address)
    .reduce((sum, [, paid]) => sum + paid, 0n);
  return { receivedAt: read.receivedAt, sats, inputs: [...read.inputs] };
}
