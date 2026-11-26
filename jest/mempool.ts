/**
 * In-memory fake of the Bitcoin chain as the explorers show it, for Jest (jest.setup.ts): it stands
 * in for src/lib/onchain/esplora.ts (the REST API of mempool.space, or of the merchant's own node)
 * and src/lib/onchain/mempool-socket.ts (their WebSocket). Tests pay addresses, mine blocks
 * and replace transactions; watchers hear of it as from the real socket. onchain.test.ts and
 * mempool-socket.test.ts cover the real clients; it also stands in for mempool.space's history of
 * the replacements (src/lib/onchain/mempool-rbf.ts, mempool-rbf.test.ts covers the client).
 */
import type { ChainTx } from "../src/lib/onchain/esplora";
import type { AddressWatchHandlers, AddressWatchOptions } from "../src/lib/onchain/mempool-socket";

const actual = jest.requireActual<typeof import("../src/lib/onchain/esplora")>(
  "../src/lib/onchain/esplora"
);
export const { ChainError, parseChainTx, CHAIN_TIMEOUT_MS } = actual;

type FakeTx = {
  txid: string;
  outputs: [address: string, sats: bigint][];
  /** The coins it spends (`<txid>:<vout>`): a transaction spending one of them replaces it. */
  inputs: string[];
  height: number | null;
  /** When it was broadcast (Unix milliseconds, the test's clock): BlockCypher's `received`. */
  receivedAt: number;
};

export const chain = {
  tip: 900_000,
  txs: [] as FakeTx[],
  /** Explorers that do not answer (their base URL): calls reject like a network failure. */
  down: new Set<string>(),
  /** Explorers that answer late (their base URL): this many ms of the test's clock per call. */
  slow: new Map<string, number>(),
  /** How old the chain's last block is, in seconds, for fetchTipTime. */
  tipAgeSeconds: 120,
  /** Explorers that answer the chain's height but no address (a mempool without its index). */
  noAddressIndex: new Set<string>(),
  /** Addresses whose transactions every explorer refuses (HTTP 429: too many requests). */
  refusedAddresses: new Set<string>(),
  /** Watches open, by address. */
  watchers: new Map<string, Set<AddressWatchHandlers>>(),
  /** The WebSockets each watch was given, in its order (mempool.space's when none was). */
  socketUrls: [] as (readonly string[])[],
  /** Every REST call, in order. */
  calls: [] as { base: string; path: string }[],
  /** BlockCypher does not know the transactions yet (its answer is HTTP 404). */
  receivedUnknown: false,
  /** BlockCypher fails (a network error, HTTP 429…). */
  receivedFails: false,
  /** BlockCypher fails for these transactions only. */
  receivedFailsFor: new Set<string>(),
  /** Every transaction BlockCypher was asked about, in order. */
  receivedAsked: [] as string[],
  /**
   * Transactions replaced (RBF): the explorers forget them, BlockCypher keeps them (its
   * /txs/<txid> still answers for a replaced one).
   */
  replaced: [] as FakeTx[],
  /** The transactions each replacement replaced directly, as mempool.space's history tells. */
  replacedBy: new Map<string, string[]>(),
  /** mempool.space's history is forgotten (a day after the last version was mined): empty. */
  historyForgets: false,
  /** mempool.space's history fails (a network error, HTTP 429…). */
  historyFails: false,
  /** Transactions mempool.space's history names besides, by transaction (a lie, or a mistake). */
  historyAlsoNames: new Map<string, string[]>(),
  /** Every transaction mempool.space's history was asked about, in order. */
  historyAsked: [] as string[],
  /**
   * mempool.space's first sight of each transaction is this many seconds after BlockCypher's time
   * (its servers see it a little later, and disagree among themselves).
   */
  firstSeenLag: 0,
  /** mempool.space's mempool does not hold the transactions yet (its answer is 0). */
  firstSeenUnknown: false,
  /** Every transaction mempool.space's first sight was asked about, in order. */
  firstSeenAsked: [] as string[],
  /**
   * The transactions broadcast (src/lib/onchain/broadcast.ts), in order: the recovery of funds
   * that left a wallet's balance sends them. One sent with its child, as a package, names it.
   */
  broadcasts: [] as { txid: string; hex: string; childHex?: string }[],
  /** What the node answers a broadcast (a package: its parent's txid), `sent` unless said here. */
  broadcastAnswers: new Map<string, "sent" | "known" | "refused">(),
  /** mempool.space does not answer a broadcast (a network failure). */
  broadcastFails: false
};

let counter = 0;

export function resetMempool() {
  chain.tip = 900_000;
  chain.txs = [];
  chain.down.clear();
  chain.slow.clear();
  chain.tipAgeSeconds = 120;
  chain.noAddressIndex.clear();
  chain.refusedAddresses.clear();
  chain.watchers.clear();
  chain.socketUrls.length = 0;
  chain.calls.length = 0;
  chain.receivedUnknown = false;
  chain.receivedFails = false;
  chain.receivedFailsFor.clear();
  chain.receivedAsked.length = 0;
  chain.replaced = [];
  chain.replacedBy.clear();
  chain.historyForgets = false;
  chain.historyFails = false;
  chain.historyAlsoNames.clear();
  chain.historyAsked.length = 0;
  chain.firstSeenLag = 0;
  chain.firstSeenUnknown = false;
  chain.firstSeenAsked.length = 0;
  chain.broadcasts = [];
  chain.broadcastAnswers.clear();
  chain.broadcastFails = false;
  counter = 0;
}

/** Stands in for broadcastTransaction (src/lib/onchain/broadcast.ts; onchain-broadcast.test.ts). */
export async function broadcastTransaction(
  hex: string,
  txid: string
): Promise<"sent" | "known" | "refused"> {
  if (chain.broadcastFails) {
    throw new actual.ChainError("network", "POST https://mempool.space/api/tx failed");
  }
  chain.broadcasts.push({ txid, hex });
  return chain.broadcastAnswers.get(txid) ?? "sent";
}

/** Stands in for broadcastPackage (src/lib/onchain/broadcast.ts; onchain-broadcast.test.ts). */
export async function broadcastPackage(
  hex: string,
  txid: string,
  childHex: string
): Promise<"sent" | "known" | "refused"> {
  if (chain.broadcastFails) {
    throw new actual.ChainError("network", "POST https://mempool.space/api/txs/package failed");
  }
  chain.broadcasts.push({ txid, hex, childHex });
  return chain.broadcastAnswers.get(txid) ?? "sent";
}

/** A coin no test transaction spends yet: output 0 of a funding transaction of its own. */
export function freshCoin(): string {
  counter += 1;
  return `f${counter.toString(16).padStart(63, "0")}:0`;
}

function view(tx: FakeTx, address: string): ChainTx {
  const received = tx.outputs
    .filter(([to]) => to === address)
    .reduce((sum, [, sats]) => sum + sats, 0n);
  const confirmed = tx.height !== null;
  return {
    txid: tx.txid,
    received,
    confirmed,
    blockHeight: confirmed ? tx.height : null,
    inputs: [...tx.inputs]
  };
}

function notify(address: string, call: (handlers: AddressWatchHandlers) => void) {
  for (const handlers of chain.watchers.get(address) ?? []) call(handlers);
}

/**
 * A new transaction in the mempool paying `sats` to `address`, spending `inputs` (a coin of its own
 * by default); its txid.
 */
export function pay(address: string, sats: bigint, inputs: string[] = [freshCoin()]): string {
  counter += 1;
  const tx: FakeTx = {
    txid: counter.toString(16).padStart(64, "0"),
    outputs: [[address, sats]],
    inputs,
    height: null,
    receivedAt: Date.now()
  };
  chain.txs.push(tx);
  notify(address, (handlers) => handlers.onTransactions([view(tx, address)]));
  return tx.txid;
}

/**
 * The unconfirmed transaction `txid` replaced by another (RBF): the same coins (`inputs` instead,
 * else those and `more`), paying `sats` (the same by default) to its address. The explorers forget
 * the first one, BlockCypher keeps it. The replacement's txid.
 */
export function replace(
  txid: string,
  { sats, inputs, more = [] }: { sats?: bigint; inputs?: string[]; more?: string[] } = {}
): string {
  const old = chain.txs.find((other) => other.txid === txid);
  if (!old || old.height !== null) throw new Error(`${txid} is not in the mempool`);
  const [address, paid] = old.outputs[0]!;
  chain.txs = chain.txs.filter((other) => other !== old);
  chain.replaced.push(old);
  for (const [to] of old.outputs) notify(to, (handlers) => handlers.onRemoved([txid]));
  const replacement = pay(address, sats ?? paid, inputs ?? [...old.inputs, ...more]);
  chain.replacedBy.set(replacement, [txid]);
  return replacement;
}

/** `count` new blocks: the first one confirms the whole mempool. */
export function mine(count = 1) {
  const pending = chain.txs.filter((tx) => tx.height === null);
  chain.tip += 1;
  for (const tx of pending) tx.height = chain.tip;
  chain.tip += count - 1;
  for (const [address] of chain.watchers) {
    notify(address, (handlers) => handlers.onTip(chain.tip));
    const mined = pending.filter((tx) => tx.outputs.some(([to]) => to === address));
    if (mined.length > 0) {
      notify(address, (handlers) => handlers.onTransactions(mined.map((tx) => view(tx, address))));
    }
  }
}

/** The unconfirmed transaction `txid` leaves the mempool (replaced or evicted). */
export function drop(txid: string) {
  const tx = chain.txs.find((other) => other.txid === txid);
  if (!tx || tx.height !== null) throw new Error(`${txid} is not in the mempool`);
  chain.txs = chain.txs.filter((other) => other !== tx);
  for (const [address] of tx.outputs) {
    notify(address, (handlers) => handlers.onRemoved([txid]));
  }
}

async function reach(base: string, path: string) {
  chain.calls.push({ base, path });
  const delay = chain.slow.get(base);
  if (delay !== undefined) await new Promise((resolve) => setTimeout(resolve, delay));
  if (chain.down.has(base)) throw new ChainError("network", `GET ${base}${path} failed`);
}

export async function fetchAddressTxs(base: string, address: string): Promise<ChainTx[]> {
  await reach(base, `/address/${address}/txs`);
  if (chain.noAddressIndex.has(base)) {
    throw new ChainError("network", `GET ${base}/address/${address}/txs failed: HTTP 500`);
  }
  if (chain.refusedAddresses.has(address)) {
    throw new ChainError("network", `GET ${base}/address/${address}/txs failed: HTTP 429`);
  }
  return chain.txs
    .map((tx) => view(tx, address))
    .filter((tx) => tx.received > 0n)
    .reverse();
}

export async function fetchTx(base: string, txid: string, address: string): Promise<ChainTx> {
  await reach(base, `/tx/${txid}`);
  const tx = chain.txs.find((other) => other.txid === txid);
  if (!tx) throw new ChainError("network", `GET ${base}/tx/${txid} failed with HTTP 404`);
  return view(tx, address);
}

export async function fetchTipHeight(base: string): Promise<number> {
  await reach(base, "/blocks/tip/height");
  return chain.tip;
}

/** When the last block was made: `chain.tipAgeSeconds` before the test's clock. */
export async function fetchTipTime(base: string): Promise<number> {
  await reach(base, "/blocks/tip/hash");
  return Math.floor(Date.now() / 1000) - chain.tipAgeSeconds;
}

/**
 * Watches as the real socket does: connected at once, then told of what the tests do. Records the
 * WebSockets it was given (`chain.socketUrls`).
 */
export function watchAddress(
  address: string,
  handlers: AddressWatchHandlers,
  options: AddressWatchOptions = {}
): () => void {
  chain.socketUrls.push(options.urls ?? ["wss://mempool.space/api/v1/ws"]);
  const watchers = chain.watchers.get(address) ?? new Set();
  chain.watchers.set(address, watchers);
  watchers.add(handlers);
  let open = true;
  queueMicrotask(() => {
    if (open) handlers.onOpen();
  });
  return () => {
    open = false;
    watchers.delete(handlers);
  };
}

/**
 * Stands in for src/lib/onchain/blockcypher.ts: when the transaction was broadcast, null while
 * "BlockCypher" does not know it (`chain.receivedUnknown`, or a transaction of no test); rejects
 * while it fails (`chain.receivedFails`, or `chain.receivedFailsFor` names the transaction).
 * blockcypher.test.ts covers the real client.
 */
export async function fetchTxReceived(txid: string): Promise<number | null> {
  chain.receivedAsked.push(txid);
  if (chain.receivedFails || chain.receivedFailsFor.has(txid)) {
    throw new ChainError("network", "BlockCypher failed");
  }
  if (chain.receivedUnknown) return null;
  return [...chain.txs, ...chain.replaced].find((tx) => tx.txid === txid)?.receivedAt ?? null;
}

/**
 * Stands in for blockcypher.ts's fetchTxDetails: what BlockCypher keeps of a transaction, replaced
 * ones included. Fails and does not know as fetchTxReceived.
 */
export async function fetchTxDetails(
  txid: string,
  address: string
): Promise<{ receivedAt: number; sats: bigint; inputs: string[] } | null> {
  chain.receivedAsked.push(txid);
  if (chain.receivedFails || chain.receivedFailsFor.has(txid)) {
    throw new ChainError("network", "BlockCypher failed");
  }
  if (chain.receivedUnknown) return null;
  const tx = [...chain.txs, ...chain.replaced].find((other) => other.txid === txid);
  if (!tx) return null;
  const sats = tx.outputs
    .filter(([to]) => to === address)
    .reduce((sum, [, paid]) => sum + paid, 0n);
  return { receivedAt: tx.receivedAt, sats, inputs: [...tx.inputs] };
}

export function resetReceivedTimes() {}

/**
 * Stands in for src/lib/onchain/mempool-times.ts: when mempool.space first saw the transaction
 * (Unix seconds, `chain.firstSeenLag` after its broadcast), null once it left the mempool (mined,
 * replaced) or while `chain.firstSeenUnknown`; rejects while mempool.space is down.
 * mempool-times.test.ts covers the real client.
 */
export async function fetchFirstSeen(txid: string): Promise<number | null> {
  chain.firstSeenAsked.push(txid);
  await reach("https://mempool.space/api", `/v1/transaction-times?txId%5B%5D=${txid}`);
  if (chain.firstSeenUnknown) return null;
  const tx = chain.txs.find((other) => other.txid === txid && other.height === null);
  return tx ? Math.floor(tx.receivedAt / 1000) + chain.firstSeenLag : null;
}

export function resetFirstSeen() {}

/**
 * Stands in for src/lib/onchain/mempool-rbf.ts: the transactions `txid` replaced, through earlier
 * replacements, as `replace` made them; empty while `chain.historyForgets`; rejects while
 * `chain.historyFails` or mempool.space is down.
 */
export async function fetchReplacedTxids(txid: string): Promise<string[]> {
  chain.historyAsked.push(txid);
  if (chain.historyFails || chain.down.has("https://mempool.space/api")) {
    throw new ChainError("network", "mempool.space's history failed");
  }
  if (chain.historyForgets) return [];
  const replaced: string[] = [...(chain.historyAlsoNames.get(txid) ?? [])];
  const pending = [...(chain.replacedBy.get(txid) ?? [])];
  while (pending.length > 0) {
    const older = pending.pop()!;
    replaced.push(older);
    pending.push(...(chain.replacedBy.get(older) ?? []));
  }
  return replaced;
}

/**
 * Stands in for fetchAddressCoins (src/lib/onchain/address-coins.ts; legacy-v2-wallet.test.ts
 * tests the client): whether a transaction of the chain pays or spends from `address`, and its
 * outputs no transaction spends yet. Each output of a fake transaction is its vout, in order.
 */
export async function fetchAddressCoins(
  base: string,
  address: string
): Promise<import("../src/lib/onchain/address-coins").AddressCoins> {
  chain.calls.push({ base, path: `/address/${address}` });
  if (chain.down.has(base)) throw new actual.ChainError("network", `GET ${base} failed`);
  const spent = new Set(chain.txs.flatMap((tx) => tx.inputs));
  const coins: import("../src/lib/onchain/address-coins").AddressCoin[] = [];
  let used = false;
  for (const tx of chain.txs) {
    tx.outputs.forEach(([to, sats], vout) => {
      if (to !== address) return;
      used = true;
      if (!spent.has(`${tx.txid}:${vout}`)) {
        coins.push({ txid: tx.txid, vout, sats, confirmed: tx.height !== null });
      }
    });
  }
  return { used, coins };
}

/**
 * A transaction the chain takes as it is (the transfer of the v2 wallet: legacy-transfer.ts),
 * spending `inputs` and paying `outputs`, in the mempool: what a broadcast transaction becomes.
 */
export function addTransaction(
  txid: string,
  inputs: string[],
  outputs: [address: string, sats: bigint][]
): void {
  chain.txs.push({ txid, inputs, outputs, height: null, receivedAt: Date.now() });
  for (const [address] of outputs) {
    notify(address, (handlers) =>
      handlers.onTransactions([view(chain.txs[chain.txs.length - 1]!, address)])
    );
  }
}
