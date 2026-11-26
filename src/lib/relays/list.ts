import { bytesToUtf8, utf8ToBytes } from "@noble/ciphers/utils.js";

import { MAX_RELAYS } from "@/config/relays";
import { base64UrlToBytes, bytesToBase64Url } from "@/lib/base64";

/*
 * Lists of Nostr relays: the device's, the account's, and the one an
 * invitation or a payment link names in its URL. Every address is a `wss://` URL in one spelling
 * (`normalizeRelayUrl`), so that a list can be compared and searched.
 */

/**
 * Longest address of a relay, `wss://` included: a list of MAX_RELAYS of them, encoded
 * (encodeRelayList), stays below the 2 KB some iOS releases refused in the Keychain (the pending
 * payment links keep their list there, src/lib/payment-link/pending.ts).
 */
export const MAX_URL_LENGTH = 120;

const PREFIX = "wss://";

/**
 * A host name (letters, digits, hyphens, at least one dot and a top-level label of letters), an
 * optional port, an optional path without spaces, query, fragment nor comma (the separator of
 * `encodeRelayList`).
 */
const ADDRESS = /^([a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,})(:\d{1,5})?(\/[^\s?#,]*)?$/i;

export type RelayUrlError =
  /** Nothing typed. */
  | "empty"
  /** Not a complete address (no domain, a space, another scheme…). */
  | "incomplete"
  /** Already in the list. */
  | "duplicate"
  /**
   * `localhost` or a name under it: the device itself (RFC 6761), which an integration's server
   * never reaches, and refuses in the integration's key (checkout-spec SPEC.md §9).
   */
  | "local";

/**
 * The relay's address in its one spelling: `wss://`, the host in lower case, no trailing slash.
 * Typed with or without `wss://` (the field shows it as a fixed prefix). Null when it is not a
 * complete address: `ws://` (unencrypted) and other schemes are refused.
 */
export function normalizeRelayUrl(input: string): string | null {
  let text = input.trim();
  if (text.toLowerCase().startsWith(PREFIX)) text = text.slice(PREFIX.length);
  const match = ADDRESS.exec(text);
  if (!match) return null;
  const host = match[1].toLowerCase();
  const port = match[2] ?? "";
  if (port !== "" && (Number(port.slice(1)) < 1 || Number(port.slice(1)) > 65535)) return null;
  const path = (match[3] ?? "").replace(/\/+$/, "");
  // Lower case for the host only: a path may be case-sensitive.
  const url = `${PREFIX}${host}${port}${path}`;
  return url.length <= MAX_URL_LENGTH && host.length <= 253 ? url : null;
}

/**
 * `localhost` or a name under it. Refused when typed only: a list read (the settings, a channel, a
 * link) keeps it, so that nothing saved with one becomes unreadable.
 */
const LOCALHOST = /(?:^|\.)localhost$/;

/** Why `input` cannot be added to `list`, null when it can. */
export function relayUrlError(input: string, list: readonly string[]): RelayUrlError | null {
  if (input.trim() === "") return "empty";
  const url = normalizeRelayUrl(input);
  if (url === null) return "incomplete";
  if (LOCALHOST.test(/^wss:\/\/([^/:]+)/.exec(url)![1])) return "local";
  return list.includes(url) ? "duplicate" : null;
}

/**
 * A valid list: 1 to MAX_RELAYS addresses, each in its one spelling, none twice. Anything else is
 * refused (null) rather than repaired: a list comes from the device, the settings, a channel or a
 * URL, where a damaged one must not replace a good one.
 */
export function parseRelayList(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_RELAYS) return null;
  const list: string[] = [];
  for (const item of value) {
    if (typeof item !== "string" || normalizeRelayUrl(item) !== item || list.includes(item)) {
      return null;
    }
    list.push(item);
  }
  return list;
}

/**
 * Suffixes of names a browser may resolve to an address of the local network (Local Network
 * Access, Chromium 142 and later): Tailscale's MagicDNS (`.ts.net`), which resolves in the tailnet
 * to an address of 100.64.0.0/10, local for Chromium (`ip_address_space_util.cc`); special-use
 * or private-use names (`.local`, RFC 6762, mDNS; `.home.arpa`, RFC 8375;
 * `.internal`, never to be delegated, ICANN resolution 2024.07.29.06); names that routers give,
 * absent from the root zone (`.lan`, `.home`, `.localdomain`: IANA's list of top-level domains).
 * `.localhost` is left out: it names the browser's own device, for which Chromium has
 * another permission (`loopback-network`), not checked here.
 */
const LOCAL_NETWORK_SUFFIXES = [
  ".ts.net",
  ".local",
  ".home.arpa",
  ".internal",
  ".lan",
  ".home",
  ".localdomain"
];

/**
 * Whether a browser may count the relay of `url` as one of the local network, by its name
 * (LOCAL_NETWORK_SUFFIXES). Other names that resolve to a local address cannot be told apart before
 * they are resolved.
 */
export function mayBeOnLocalNetwork(url: string): boolean {
  const host = /^wss:\/\/([^/:]+)/.exec(url)?.[1];
  return host !== undefined && LOCAL_NETWORK_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

export function sameRelayList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((relay, index) => relay === b[index]);
}

/** The relays of `a`, then those of `b` not in `a`. */
export function unionRelays(a: readonly string[], b: readonly string[]): string[] {
  return [...a, ...b.filter((relay) => !a.includes(relay))];
}

/**
 * The list as a URL fragment's part: the addresses without `wss://`, joined by commas, in
 * base64url (RFC 4648 §5). Its alphabet has no ".", the separator of the fragments of invitations
 * and payment links, so that it follows their other parts unambiguously.
 */
export function encodeRelayList(list: readonly string[]): string {
  return bytesToBase64Url(utf8ToBytes(list.map((relay) => relay.slice(PREFIX.length)).join(",")));
}

/** The list of a fragment's part (encodeRelayList), null when it is not a valid list. */
export function decodeRelayList(text: string): string[] | null {
  const bytes = base64UrlToBytes(text);
  if (!bytes || bytes.length === 0) return null;
  let decoded: string;
  try {
    decoded = bytesToUtf8(bytes);
  } catch {
    return null;
  }
  return parseRelayList(decoded.split(",").map((host) => `${PREFIX}${host}`));
}
