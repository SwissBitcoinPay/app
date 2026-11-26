/*
 * The merchant's own Bitcoin node ("Bitcoin node" of "Settings"): a mempool instance
 * (mempool/mempool, as Umbrel and Start9 install it), whose API is
 * mempool.space's, under `/api` of the address its web page opens at. The owner's devices and
 * the employees' read the chain there instead of mempool.space (src/features/onchain/explorer.ts);
 * the payers' pages too when the owner passes it on to them (`payers`, an HTTPS node of the
 * Internet only), else mempool.space.
 *
 * Its address is typed by the owner and read back from the settings, a channel and the device's
 * records: one spelling (`normalizeNodeUrl`), checked everywhere it is read (`parseBitcoinNode`).
 * HTTPS only: a node reached over plain HTTP, on
 * the business's Wi-Fi, could be impersonated by anyone on it and make an unpaid sale look paid.
 * An address in `http://` is no longer accepted where it is typed; one saved before (a local
 * network's, accepted until then) is still read, so that the settings and channels that name it
 * stay valid, but never reached over plain HTTP: the devices ask it over HTTPS (`secureNodeUrl`),
 * where a plain HTTP node does not answer, and the owner's fallback applies ("When it does not
 * answer"). Android refuses unencrypted requests for the whole app (app.config.ts).
 */

/** What the devices do while the node does not answer ("When it does not answer"). */
export type NodeFallback =
  /** "Use mempool.space": the same reads, from mempool.space. */
  | "mempool"
  /** "Lightning only": nothing goes to mempool.space; a sale offers no address meanwhile. */
  | "none";

export type BitcoinNode = {
  /** In its one spelling (normalizeNodeUrl): `http(s)://host[:port][/path]`, no trailing slash. */
  url: string;
  fallback: NodeFallback;
  /**
   * "Pass my node on to the payers' pages" (off by default): the
   * payment links and the integrations' checkout links name the node, and the payers' browsers
   * read the chain there too (PayerNode). A node of the Internet only (isPayersNode).
   */
  payers: boolean;
};

/** The node a payer's page reads the chain on (a payment link's, a checkout link's): isPayersNode. */
export type PayerNode = {
  url: string;
  fallback: NodeFallback;
};

/** Longest address kept: a path deep enough for a reverse proxy, short enough to show. */
export const MAX_NODE_URL_LENGTH = 200;

/**
 * `scheme://host[:port][/path]`, split before each part is checked (normalizeNodeUrl): an
 * authority of letters, digits, dots and hyphens only (no user nor password: a secret must not
 * travel in the settings; no IPv6 address: none of the setups this was made for needs one), an
 * optional port of digits, an optional path. The rules each part follows are checkout-spec's
 * (SPEC.md §14, `bitcoinNode`), so that a merchant's app and an integration's server read the one
 * spelling alike.
 */
const ADDRESS = /^(https?):\/\/([a-z0-9.-]+)(?::([0-9]+))?(\/.*)?$/i;

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

/** A label of a host name: 1 to 63 of `a-z 0-9 -`, neither starting nor ending with `-`. */
const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/** A path's characters: visible ASCII, but `?` `#` `@` `\` (a query, a fragment, a user). */
const PATH = /^\/[\x21-\x22\x24-\x3e\x41-\x5b\x5d-\x7e]*$/;

function ipv4(host: string): number[] | null {
  const match = IPV4.exec(host);
  if (!match) return null;
  const bytes = match.slice(1).map(Number);
  return bytes.every((byte, i) => byte <= 255 && String(byte) === match[i + 1]) ? bytes : null;
}

/** A host name: 2 labels or more (LABEL), the last starting with a letter, 253 characters at most. */
function isHostName(host: string): boolean {
  const labels = host.split(".");
  return (
    host.length <= 253 &&
    labels.length >= 2 &&
    labels.every((label) => LABEL.test(label)) &&
    /^[a-z]/.test(labels[labels.length - 1]!)
  );
}

/**
 * Whether `host` (lower case) is an address of the local network: a private IPv4 address (RFC
 * 1918), one of the shared space Tailscale gives its devices (100.64.0.0/10, RFC 6598), or a
 * `.local` name (mDNS, RFC 6762); the device itself (localhost, 127.0.0.0/8) is not one. The only
 * addresses saved in `http://` before HTTPS was required (readNodeUrl).
 */
function isLocalHost(host: string): boolean {
  const bytes = ipv4(host);
  if (bytes) {
    const [a, b] = bytes;
    return (
      a === 10 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127)
    );
  }
  return isHostName(host) && host.endsWith(".local");
}

/** The device itself: `localhost` and names under it, 127.0.0.0/8, and 0.0.0.0/8 ("this host"). */
function isDevice(host: string): boolean {
  const first = ipv4(host)?.[0];
  return host === "localhost" || host.endsWith(".localhost") || first === 127 || first === 0;
}

export type NodeUrlError =
  /** Nothing typed. */
  | "empty"
  /** Not a complete address (a space, another scheme, a query, a user…). */
  | "incomplete"
  /** `http://`: refused, it would travel in clear (HTTPS only). */
  | "insecure"
  /** The device itself (localhost, 127.0.0.0/8, 0.0.0.0/8): a phone does not run the node. */
  | "device";

type Normalized = { url: string; error: null } | { url: null; error: NodeUrlError };

/**
 * The node's address in its one spelling, or why it cannot be one. Typed as the browser shows its
 * mempool's page: with or without `https://` (without, `https://`), with or without its `/api`,
 * which is taken off, as are the slashes that end it. `http://` is refused (`insecure`). The one
 * spelling is that of checkout-spec (SPEC.md §14): scheme and host in lower case, a port without a
 * leading zero, a path of visible ASCII neither ending with `/` nor with `/api`. Normalizing it
 * again gives it back (parseBitcoinNode reads only it).
 */
export function normalizeNodeUrl(input: string): Normalized {
  return spell(input, false);
}

/**
 * `url` when it is a node's address in its one spelling as saved: one normalizeNodeUrl gives, or
 * one in `http://` to an address of the local network, which it gave until HTTPS was required:
 * still read, never reached so (secureNodeUrl). Null for anything else.
 */
function readNodeUrl(url: string): string | null {
  return spell(url, true).url === url ? url : null;
}

/** normalizeNodeUrl's spelling; with `localHttp`, `http://` to a local network's address too. */
function spell(input: string, localHttp: boolean): Normalized {
  let text = input.trim();
  if (text === "") return { url: null, error: "empty" };
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) text = `https://${text}`;
  const match = ADDRESS.exec(text);
  if (!match) return { url: null, error: "incomplete" };
  const scheme = match[1]!.toLowerCase();
  const host = match[2]!.toLowerCase();
  const digits = match[3];
  let port = "";
  if (digits !== undefined) {
    // 1 to 65535, written without a leading zero (`:0080` is `:80`).
    const value = Number(digits);
    if (value < 1 || value > 65535) return { url: null, error: "incomplete" };
    port = `:${value}`;
  }
  if (isDevice(host)) return { url: null, error: "device" };
  if (!ipv4(host) && !isHostName(host)) return { url: null, error: "incomplete" };
  if (scheme === "http" && !(localHttp && isLocalHost(host))) {
    return { url: null, error: "insecure" };
  }
  // The page's address and its API's are the same node: the slashes that end the path, and its
  // `/api`, taken off until neither is left (`/api/api`, `/a//api` and `/a/api/` alike).
  let path = match[4] ?? "";
  if (path !== "" && !PATH.test(path)) return { url: null, error: "incomplete" };
  for (let before = ""; before !== path;) {
    before = path;
    path = path.replace(/\/+$/, "").replace(/\/api$/i, "");
  }
  // Lower case for the scheme and the host only: a path may be case-sensitive.
  const url = `${scheme}://${host}${port}${path}`;
  if (url.length > MAX_NODE_URL_LENGTH) return { url: null, error: "incomplete" };
  return { url, error: null };
}

/**
 * Whether the node was saved in `http://` before HTTPS was required (readNodeUrl): still named in
 * the settings, flagged there ("HTTP"), and asked over HTTPS only (secureNodeUrl).
 */
export function isPlainHttp(url: string): boolean {
  return url.startsWith("http://");
}

/**
 * The address the devices ask the node at: `url` itself, over HTTPS; an address saved in `http://`
 * (isPlainHttp) asked over HTTPS too, never in clear. A node that serves plain HTTP only does not
 * answer it (the TLS handshake fails before any request is sent), and the owner's fallback applies,
 * as for a node switched off. Every address the devices ask goes through it (nodeApiUrl,
 * nodeSocketUrl, nodeTxPageUrl).
 */
function secureNodeUrl(url: string): string {
  return isPlainHttp(url) ? `https://${url.slice("http://".length)}` : url;
}

/**
 * Whether the payers' pages may be given the node at `url` (in its one spelling): HTTPS to a domain
 * name that is not a `.local` one. A payer's browser is not on the merchant's network, a page of the
 * Internet cannot ask a plain HTTP address, and a link naming an address of the local network (an
 * IP address, a `.local` name) would have each payer's browser knock on their own network's.
 */
export function isPayersNode(url: string): boolean {
  const host = /^https:\/\/([^/:]+)/.exec(url)?.[1];
  return host !== undefined && ipv4(host) === null && !host.endsWith(".local");
}

/** The node's REST API: mempool.space's, Esplora's format (src/lib/onchain/esplora.ts). */
export function nodeApiUrl(url: string): string {
  return `${secureNodeUrl(url)}/api`;
}

/**
 * The node's page of a transaction (`<url><txid>`): `/tx/` of the address its web page opens at, as
 * mempool.space's (MEMPOOL_TX_PAGE_URL); mempool's web app routes `tx/:id` (its
 * `master-page.module.ts` and `transaction.module.ts`).
 */
export function nodeTxPageUrl(url: string): string {
  return `${secureNodeUrl(url)}/tx/`;
}

/**
 * The node's WebSocket (src/lib/onchain/mempool-socket.ts): `/api/v1/ws` of the same address, as
 * mempool's own web server serves it (its `nginx-mempool.conf`), over TLS
 * (`wss://`, secureNodeUrl).
 */
export function nodeSocketUrl(url: string): string {
  return `${secureNodeUrl(url).replace(/^https/, "wss")}/api/v1/ws`;
}

/** `value`'s address and fallback in their one spelling, or null. */
function parseNodeParts(value: unknown): PayerNode | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const node = value as Record<string, unknown>;
  if (typeof node.url !== "string") return null;
  if (readNodeUrl(node.url) === null) return null;
  if (node.fallback !== "mempool" && node.fallback !== "none") return null;
  return { url: node.url, fallback: node.fallback };
}

/**
 * The node as read back (the settings, a channel, the device's records), or null when it is not one
 * in its one spelling: a value that does not check is never used, nor repaired. Named to the
 * payers' pages, it is a node of the Internet (isPayersNode).
 */
export function parseBitcoinNode(value: unknown): BitcoinNode | null {
  const parts = parseNodeParts(value);
  if (parts === null) return null;
  const { payers } = value as { payers?: unknown };
  if (typeof payers !== "boolean" || (payers && !isPayersNode(parts.url))) return null;
  return { ...parts, payers };
}

/**
 * The node a payment link or a checkout link names to its payer's page, or null when it names none,
 * or one that is not a node of the Internet in its one spelling (isPayersNode; left aside: the page
 * reads mempool.space).
 */
export function parsePayerNode(value: unknown): PayerNode | null {
  if (value === undefined) return null;
  const parts = parseNodeParts(value);
  return parts !== null && isPayersNode(parts.url) ? parts : null;
}

/** What the payers' pages are given of `node`: itself when the owner allows it, else nothing. */
export function payerNodeOf(node: BitcoinNode | null): PayerNode | null {
  return node !== null && node.payers ? { url: node.url, fallback: node.fallback } : null;
}

/** Whether two choices are the same (null: mempool.space). */
export function sameBitcoinNode(a: BitcoinNode | null, b: BitcoinNode | null): boolean {
  return a === null || b === null
    ? a === b
    : a.url === b.url && a.fallback === b.fallback && a.payers === b.payers;
}
