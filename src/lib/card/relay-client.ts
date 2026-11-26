import { bytesToHex } from "@noble/hashes/utils.js";

import {
  CARD_RELAY_MAX_HASHES_PER_POST,
  CARD_RELAY_MAX_PENDING,
  CARD_RELAY_PROTOCOL,
  CARD_RELAY_TIMEOUT_MS
} from "@/config/card";

import type { TapEntry } from "./hashes";
import { isCanonicalRelayHost } from "./relay-host";
import { parseWakePacket, type WakePacket } from "./wake-packet";

// Its own module (push-token.ts), which the extension's engine can bundle; still offered here.
export { isExpoPushToken } from "./push-token";

/*
 * The phone's side of a card relay (contract v2, docs/card-relay.md): its info, and the card's
 * channel there, which the channel's secret opens (`Authorization: Bearer <64 hex>`, keys.ts). The
 * relay is untrusted: every answer is checked before use, and an answer out of shape is an error,
 * never a guess. Nothing here tells the relay the card's keys, its UID nor the wallet.
 */

export type RelayErrorCode =
  /** No answer: offline, timeout, the relay down (5xx). Nothing is known of the channel. */
  | "unreachable"
  /** The relay refused the channel's secret (401, 403). */
  | "unauthorized"
  /** No such channel there (404): deleted, or never created. */
  | "notFound"
  /** The relay refused the request (other 4xx): its reason, if it gave one, in `reason`. */
  | "refused"
  /** An answer out of the contract: another protocol, a body out of shape. */
  | "protocol";

export class RelayError extends Error {
  readonly code: RelayErrorCode;
  readonly status: number | null;
  /** The relay's own words (`{"status":"ERROR","reason":…}`): never shown as is. */
  readonly reason: string | null;

  constructor(
    code: RelayErrorCode,
    message: string,
    status: number | null = null,
    reason: string | null = null,
    cause?: unknown
  ) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "RelayError";
    this.code = code;
    this.status = status;
    this.reason = reason;
  }
}

export type RelayOptions = { fetchImpl?: typeof fetch; timeoutMs?: number };

type Answer = { status: number; body: unknown };

const MAX_REASON = 200;

function reasonOf(body: unknown): string | null {
  if (body === null || typeof body !== "object") return null;
  const { status, reason } = body as Record<string, unknown>;
  return status === "ERROR" && typeof reason === "string" ? reason.slice(0, MAX_REASON) : null;
}

async function call(
  host: string,
  method: "GET" | "PUT" | "POST" | "PATCH" | "DELETE",
  path: string,
  { secret, body }: { secret?: Uint8Array; body?: unknown },
  { fetchImpl = fetch, timeoutMs = CARD_RELAY_TIMEOUT_MS }: RelayOptions
): Promise<Answer> {
  if (!isCanonicalRelayHost(host)) throw new Error("Relay host not canonical");
  const headers: Record<string, string> = { Accept: "application/json" };
  if (secret) {
    if (secret.length !== 32) throw new Error("A channel secret has 32 bytes");
    headers.Authorization = `Bearer ${bytesToHex(secret)}`;
  }
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let response: Response;
    try {
      response = await fetchImpl(`https://${host}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal
      });
    } catch (error) {
      throw new RelayError("unreachable", `${method} ${path}: no answer`, null, null, error);
    }
    let text: string;
    try {
      text = await response.text();
    } catch (error) {
      throw new RelayError("unreachable", `${method} ${path}: body cut`, null, null, error);
    }
    let parsed: unknown = null;
    if (text !== "") {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = undefined;
      }
    }
    const { status } = response;
    if (status >= 500) {
      throw new RelayError("unreachable", `${method} ${path}: ${status}`, status, reasonOf(parsed));
    }
    if (status === 401 || status === 403) {
      throw new RelayError(
        "unauthorized",
        `${method} ${path}: ${status}`,
        status,
        reasonOf(parsed)
      );
    }
    if (status === 404) {
      throw new RelayError("notFound", `${method} ${path}: 404`, status, reasonOf(parsed));
    }
    if (status >= 400) {
      throw new RelayError("refused", `${method} ${path}: ${status}`, status, reasonOf(parsed));
    }
    if (status < 200 || status >= 300 || parsed === undefined) {
      throw new RelayError("protocol", `${method} ${path}: unexpected answer`, status);
    }
    return { status, body: parsed };
  } finally {
    clearTimeout(timer);
  }
}

function protocolError(what: string): RelayError {
  return new RelayError("protocol", `${what}: answer out of the contract`);
}

export type RelayInfo = {
  protocol: typeof CARD_RELAY_PROTOCOL;
  version: string;
  /**
   * Whether it serves `GET /v1/listen` (the card socket, docs/card-relay.md), and its heartbeat;
   * null for a relay of before it, or an announcement out of shape.
   */
  listen: { heartbeatSeconds: number } | null;
  /**
   * Whether a phone's socket may hand its session over to the next one (`{"hold":true}`,
   * relay-session.ts): the iOS extension leaves a payment to the app only with such a relay.
   * False for a relay of before it, or an announcement out of shape.
   */
  handOver: boolean;
};

/** The heartbeats the app accepts from a relay (sattleme/relay: 30 s to an hour). */
export const LISTEN_HEARTBEAT_MIN_S = 30;
export const LISTEN_HEARTBEAT_MAX_S = 3600;

/** What a relay announces of `/v1/listen`; null when it announces nothing usable. */
function readListen(announced: unknown): RelayInfo["listen"] {
  if (!announced || typeof announced !== "object") return null;
  const { heartbeatSeconds } = announced as { heartbeatSeconds?: unknown };
  if (
    !Number.isSafeInteger(heartbeatSeconds) ||
    (heartbeatSeconds as number) < LISTEN_HEARTBEAT_MIN_S ||
    (heartbeatSeconds as number) > LISTEN_HEARTBEAT_MAX_S
  ) {
    return null;
  }
  return { heartbeatSeconds: heartbeatSeconds as number };
}

/**
 * `GET /v1/info`: the relay must speak contract v2. Asked before a relay is chosen ("Advanced
 * settings"), so that a card is never programmed with a relay that cannot serve it, and before the
 * card socket listens to it (relay-sync.ts).
 */
export async function fetchRelayInfo(host: string, options: RelayOptions = {}): Promise<RelayInfo> {
  const { body } = await call(host, "GET", "/v1/info", {}, options);
  const { protocol, version, listen, handOver } = (body ?? {}) as Record<string, unknown>;
  if (protocol !== CARD_RELAY_PROTOCOL) {
    throw new RelayError("protocol", `Relay protocol ${String(protocol)}, not 2`);
  }
  if (typeof version !== "string" || version.length > 64) throw protocolError("/v1/info");
  return { protocol, version, listen: readListen(listen), handOver: handOver === true };
}

/** The SHA-256 of a listening token, base64url without padding (32 bytes). */
const LISTEN_HASH = /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/;

/** Whether `hash` is a listening token's SHA-256 as the relay takes it (canonical base64url). */
export function isListenHash(hash: unknown): hash is string {
  return typeof hash === "string" && LISTEN_HASH.test(hash);
}

/**
 * `PUT /v1/channel`: creates the channel, or gives it this phone's public key (a new phone); its
 * hashes and their sealed tokens stay. Never the push token: it goes sealed with each hash
 * (postHashes), the relay refuses it here. `listen`: the SHA-256 of this phone's listening token
 * (the card socket), null to stop, left out for a relay that does not announce `/v1/listen`.
 * Resolves whether the relay created the channel.
 */
export async function putChannel(
  host: string,
  secret: Uint8Array,
  device: { publicKey: string; listen?: string | null },
  options: RelayOptions = {}
): Promise<"created" | "updated"> {
  if (!/^[A-Za-z0-9_-]{87}$/.test(device.publicKey)) throw new Error("Not a P-256 public key");
  if (device.listen != null && !isListenHash(device.listen)) {
    throw new Error("Not a listening token's hash");
  }
  const body =
    device.listen === undefined
      ? { pubkey: device.publicKey }
      : { pubkey: device.publicKey, listen: device.listen };
  const { status } = await call(host, "PUT", "/v1/channel", { secret, body }, options);
  if (status === 201) return "created";
  if (status === 200) return "updated";
  throw protocolError("PUT /v1/channel");
}

/** What the relay holds for the channel: hashes waiting, and the index the next one gets. */
export type ChannelState = { pending: number; nextIdx: number };

function parseChannelState(body: unknown, what: string): ChannelState {
  const { pending, nextIdx } = (body ?? {}) as Record<string, unknown>;
  if (
    !Number.isSafeInteger(pending) ||
    !Number.isSafeInteger(nextIdx) ||
    (pending as number) < 0 ||
    (pending as number) > CARD_RELAY_MAX_PENDING ||
    (nextIdx as number) < (pending as number)
  ) {
    throw protocolError(what);
  }
  return { pending: pending as number, nextIdx: nextIdx as number };
}

/** `GET /v1/channel`; null when the relay has no such channel (deleted: create it again). */
export async function fetchChannel(
  host: string,
  secret: Uint8Array,
  options: RelayOptions = {}
): Promise<ChannelState | null> {
  try {
    const { body } = await call(host, "GET", "/v1/channel", { secret }, options);
    return parseChannelState(body, "GET /v1/channel");
  } catch (error) {
    if (error instanceof RelayError && error.code === "notFound") return null;
    throw error;
  }
}

const HASH = /^[A-Za-z0-9_-]{22}$/;
/** A sealed push token: 29 to 328 bytes, base64url without padding (push-seal.ts). */
const SEALED_TOKEN = /^[A-Za-z0-9_-]{39,438}$/;

function checkEntries(entries: readonly TapEntry[]): void {
  if (entries.length === 0) throw new Error("No hash to send");
  for (const entry of entries) {
    if (!HASH.test(entry.h)) throw new Error("Not a tap hash");
    if (entry.t !== undefined && !SEALED_TOKEN.test(entry.t)) throw new Error("Not a sealed token");
  }
}

/** The entries as the relay reads them: `t` only when there is one. */
function entriesBody(batch: readonly TapEntry[]): { hashes: TapEntry[] } {
  return { hashes: batch.map(({ h, t }) => (t === undefined ? { h } : { h, t })) };
}

/**
 * `POST /v1/channel/hashes`: leaves the entries of the card's next taps (hashes.ts: hash, push
 * token sealed for that tap) on the channel, in counter order, by batches of at most 1 024.
 * Resolves the channel's state after the last batch. It also turns the channel's notifications on
 * again after the relay stopped them (Expo's DeviceNotRegistered).
 */
export async function postHashes(
  host: string,
  secret: Uint8Array,
  entries: readonly TapEntry[],
  options: RelayOptions = {}
): Promise<ChannelState> {
  checkEntries(entries);
  let state: ChannelState | null = null;
  for (let from = 0; from < entries.length; from += CARD_RELAY_MAX_HASHES_PER_POST) {
    const batch = entries.slice(from, from + CARD_RELAY_MAX_HASHES_PER_POST);
    const { body } = await call(
      host,
      "POST",
      "/v1/channel/hashes",
      { secret, body: entriesBody(batch) },
      options
    );
    state = parseChannelState(body, "POST /v1/channel/hashes");
  }
  return state!;
}

/**
 * `PATCH /v1/channel/hashes`: new sealed tokens for the hashes still waiting on the channel (the
 * phone's push token changed; an entry without `t` loses its token), by batches of at most 1 024.
 * The relay never adds a hash this way: a tap already made never comes back. Resolves the
 * channel's state after the last batch and how many hashes took a new token, in all.
 */
export async function patchHashes(
  host: string,
  secret: Uint8Array,
  entries: readonly TapEntry[],
  options: RelayOptions = {}
): Promise<ChannelState & { updated: number }> {
  checkEntries(entries);
  let state: ChannelState | null = null;
  let updated = 0;
  for (let from = 0; from < entries.length; from += CARD_RELAY_MAX_HASHES_PER_POST) {
    const batch = entries.slice(from, from + CARD_RELAY_MAX_HASHES_PER_POST);
    const { body } = await call(
      host,
      "PATCH",
      "/v1/channel/hashes",
      { secret, body: entriesBody(batch) },
      options
    );
    state = parseChannelState(body, "PATCH /v1/channel/hashes");
    const count = (body as Record<string, unknown>).updated;
    if (!Number.isSafeInteger(count) || (count as number) < 0 || (count as number) > batch.length) {
      throw protocolError("PATCH /v1/channel/hashes");
    }
    updated += count as number;
  }
  return { ...state!, updated };
}

/** Most packets read at once: the relay keeps them under a minute. */
const MAX_PACKETS = 100;

/**
 * `GET /v1/channel/pending`: the wake packets of the last minute, for a phone that opens the app
 * without its notification. Packets out of shape are left out; they are opened by the caller.
 */
export async function fetchPendingPackets(
  host: string,
  secret: Uint8Array,
  options: RelayOptions = {}
): Promise<WakePacket[]> {
  const { body } = await call(host, "GET", "/v1/channel/pending", { secret }, options);
  const { packets } = (body ?? {}) as Record<string, unknown>;
  if (!Array.isArray(packets)) throw protocolError("GET /v1/channel/pending");
  return packets
    .slice(0, MAX_PACKETS)
    .map(parseWakePacket)
    .filter((packet): packet is WakePacket => packet !== null);
}

/** `DELETE /v1/channel`. A channel the relay no longer has is deleted already. */
export async function deleteChannel(
  host: string,
  secret: Uint8Array,
  options: RelayOptions = {}
): Promise<void> {
  try {
    await call(host, "DELETE", "/v1/channel", { secret }, options);
  } catch (error) {
    if (error instanceof RelayError && error.code === "notFound") return;
    throw error;
  }
}
