import { MEMPOOL_WEBSOCKET_URL } from "@/config/onchain";

import { parseChainTx, type ChainTx } from "./esplora";

/*
 * Live watch of one address over mempool's WebSocket (mempool.space's, src/config/onchain.ts, or
 * the merchant's own node's, src/lib/onchain/node.ts): what changes is pushed, nothing is polled. Messages are JSON objects whose keys say what they hold (its
 * server's `websocket-handler.ts`):
 * - `blocks` (once, on `want blocks`) and `block` (each new block): the chain's height;
 * - `address-transactions`: transactions of the address entering the mempool;
 * - `block-transactions`: transactions of the address in a new block, now confirmed;
 * - `address-removed-transactions`: transactions of the address leaving the mempool unconfirmed
 *   (replaced, RBF, or evicted).
 * The socket only says what changes from now on: after each (re)connection, `onOpen` lets the
 * caller read the current state over REST (esplora.ts).
 */

export type AddressWatchHandlers = {
  /** Connected, or connected again: whatever happened meanwhile was not pushed. */
  onOpen: () => void;
  /** Transactions paying the address, new or newly confirmed. */
  onTransactions: (txs: ChainTx[]) => void;
  /** Transactions that left the mempool unconfirmed. */
  onRemoved: (txids: string[]) => void;
  /** Height of the chain's last block. */
  onTip: (height: number) => void;
};

export type AddressWatchOptions = {
  /** The WebSocket of the platform by default (React Native's, the browser's). */
  createSocket?: (url: string) => WebSocket;
  /**
   * The explorers' WebSockets, in the order to try them (src/features/onchain/explorer.ts):
   * mempool.space's alone by default.
   */
  urls?: readonly string[];
};

/** `WebSocket.CONNECTING`, as a literal: the `WebSocket` global is not there in every runtime. */
const CONNECTING = 0;

/** Wait before connecting again: doubled at each failure from the first, up to the last. */
export const RECONNECT_DELAYS_MS = { first: 1000, max: 30_000 };

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function heightOf(block: unknown): number | null {
  if (!isObject(block)) return null;
  const { height } = block;
  return typeof height === "number" && Number.isSafeInteger(height) && height >= 0 ? height : null;
}

/** The transactions of `list` as far as `address` is concerned; the ones out of shape dropped. */
function transactionsOf(list: unknown, address: string): ChainTx[] {
  if (!Array.isArray(list)) return [];
  return list.flatMap((item) => {
    const tx = parseChainTx(item, address);
    return tx && tx.received > 0n ? [tx] : [];
  });
}

/**
 * Watches `address` (lowercase) until the returned function is called: connects, asks for blocks
 * and the address, reconnects after any loss.
 */
export function watchAddress(
  address: string,
  handlers: AddressWatchHandlers,
  options: AddressWatchOptions = {}
): () => void {
  const createSocket = options.createSocket ?? ((target: string) => new WebSocket(target));
  const urls = options.urls && options.urls.length > 0 ? options.urls : [MEMPOOL_WEBSOCKET_URL];
  // The explorer tried now: the next one at once when it never opened, back to the first after a
  // wait otherwise (the merchant's node may be back).
  let index = 0;
  let socket: WebSocket | null = null;
  let retry: ReturnType<typeof setTimeout> | null = null;
  let delay = RECONNECT_DELAYS_MS.first;
  let stopped = false;

  const close = (current: WebSocket) => {
    current.onopen = current.onmessage = current.onerror = current.onclose = null;
    // React Native on Android ignores close() while the socket connects (relay.ts): one given up
    // on then is closed as soon as it opens.
    if (current.readyState === CONNECTING) current.onopen = () => current.close();
    try {
      current.close();
    } catch {
      // Already closed.
    }
  };

  /** Connects again: to the next explorer at once when this one never opened and one is left. */
  const again = (opened: boolean) => {
    if (!opened && index < urls.length - 1) {
      index += 1;
      retry = setTimeout(connect, 0);
      return;
    }
    index = 0;
    retry = setTimeout(connect, delay);
    delay = Math.min(delay * 2, RECONNECT_DELAYS_MS.max);
  };

  const lost = (current: WebSocket, opened: boolean) => {
    if (stopped || socket !== current) return;
    close(current);
    socket = null;
    again(opened);
  };

  const onMessage = (data: unknown) => {
    let message: unknown;
    try {
      message = JSON.parse(String(data));
    } catch {
      return;
    }
    if (!isObject(message)) return;
    const heights = [
      heightOf(message.block),
      ...(Array.isArray(message.blocks) ? message.blocks.map(heightOf) : [])
    ].filter((height): height is number => height !== null);
    if (heights.length > 0) handlers.onTip(Math.max(...heights));
    const txs = [
      ...transactionsOf(message["address-transactions"], address),
      ...transactionsOf(message["block-transactions"], address)
    ];
    if (txs.length > 0) handlers.onTransactions(txs);
    const removed = message["address-removed-transactions"];
    if (Array.isArray(removed)) {
      const txids = removed.flatMap((tx) =>
        isObject(tx) && typeof tx.txid === "string" ? [tx.txid] : []
      );
      if (txids.length > 0) handlers.onRemoved(txids);
    }
  };

  function connect() {
    retry = null;
    if (stopped) return;
    let current: WebSocket;
    try {
      current = createSocket(urls[index]!);
    } catch {
      again(false);
      return;
    }
    socket = current;
    let opened = false;
    current.onopen = () => {
      opened = true;
      delay = RECONNECT_DELAYS_MS.first;
      current.send(JSON.stringify({ action: "want", data: ["blocks"] }));
      current.send(JSON.stringify({ "track-address": address }));
      handlers.onOpen();
    };
    current.onmessage = (event: MessageEvent) => onMessage(event.data);
    current.onerror = () => lost(current, opened);
    current.onclose = () => lost(current, opened);
  }

  connect();
  return () => {
    stopped = true;
    if (retry) clearTimeout(retry);
    if (socket) close(socket);
    socket = null;
  };
}
