import { gcm } from "@noble/ciphers/aes.js";
import { p256 } from "@noble/curves/nist.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils.js";

/*
 * Fake card relays (contract v2, docs/card-relay.md), in memory, behind the `fetch` and the
 * `WebSocket` of the tests (jest.setup.ts): `fetchRelays`, `FakeRelaySocket`. One per host, created
 * with `addRelay(host)`. They keep what the real one keeps (the SHA-256 of a channel's secret, its
 * public key, and its tap hashes in order, each with the push token sealed for it) and serve a tap
 * as it does (sattleme/relay, `src/app.ts`, `src/sessions.ts`, `src/crypto.ts`):
 * - `PUT /v1/channel` refuses a `pushToken`; `POST` and `PATCH /v1/channel/hashes` take entries
 *   `{h, t?}`, PATCH only for hashes still pending;
 * - `GET /w` (a point of sale's first call, `posTap`): the tap's hash looked up, every hash before
 *   it dropped (anti-replay), a session opened for a minute, and the phone's wake packet encrypted
 *   to its key (ECIES, its own implementation here), "pushed" (`pushes`) to the token sealed with
 *   that hash when it opens with the tap's `c` (none otherwise), and kept for
 *   `GET /v1/channel/pending` until read once or the phone connects;
 * - `GET /cb/<session>?k1&pr` (`posCallback`): the invoice handed to the phone's WebSocket, the
 *   point of sale answered with the phone's answer, or an error without text 30 s later (65 s at a
 *   relay of 2.1.0: `answerWaitMs`);
 * - the WebSocket `/wait/<session>?t=<wsToken>` (FakeRelaySocket): refused without the session's
 *   token or once taken; sends `{pr, k1}` (with `metadata` and `verify` when the point of sale gave
 *   them, `payeeProof`; with `waitMs` at a relay of 2.1.0), reads `{ok, reason}`, closes once the
 *   point of sale is answered or the session ends.
 *
 * Faults: `unreachable` (no answer), `answerNext(status, body)` (the next request gets that
 * answer instead), `protocol` (what `/v1/info` announces).
 *
 * A sealed text is a bare Expo token, pushed as an alert (what the app seals, iPhones only), or
 * nothing is pushed (`push.bad_token`). `/v1/info` may announce wake kinds (`wakes`, which the card
 * relay announces): the app reads none of them.
 *
 * `/v1/listen` (the card socket), when `listen` is set: `/v1/info`
 * announces it, `PUT /v1/channel` takes `listen` (the SHA-256 of the phone's listening token), and
 * a phone listening with that token (`listenWith`, which the card socket's fake calls,
 * jest/card-socket.ts) gets each tap's packet at once (`socketWakes`), beside the push.
 */

const MAX_PENDING = 2048;
const MAX_BATCH = 1024;
/** A session (and its packet) lives this long after the tap, until the point of sale calls back. */
const SESSION_LIFETIME_MS = 60_000;
/** How long the point of sale's callback waits for the phone, at a relay of before 2.1.0. */
const WAIT_MS = 30_000;

const B64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

function b64url(bytes: Uint8Array): string {
  let text = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    const chars = Math.ceil((Math.min(3, bytes.length - i) * 8) / 6);
    for (let k = 0; k < chars; k++) text += B64URL[(n >> (18 - 6 * k)) & 63];
  }
  return text;
}

function fromB64url(text: string): Uint8Array {
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const char of text) {
    buffer = (buffer << 6) | B64URL.indexOf(char);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 255);
    }
  }
  return Uint8Array.from(bytes);
}

function random(length: number): Uint8Array {
  return globalThis.crypto.getRandomValues(new Uint8Array(length));
}

/** ECIES to `publicKey` as the relay does it (WebCrypto layout: the GCM tag after the text). */
export function sealPacket(
  publicKey: string,
  plaintext: string
): { epk: string; iv: string; ct: string } {
  const ephemeral = p256.utils.randomSecretKey();
  const epk = p256.getPublicKey(ephemeral, false);
  const shared = p256.getSharedSecret(ephemeral, fromB64url(publicKey), true).slice(1);
  const key = hkdf(sha256, shared, epk, utf8ToBytes("card-relay v2"), 32);
  const iv = random(12);
  const ct = gcm(key, iv).encrypt(utf8ToBytes(plaintext));
  return { epk: b64url(epk), iv: b64url(iv), ct: b64url(ct) };
}

type Packet = { epk: string; iv: string; ct: string };

type Channel = {
  pubkey: string;
  nextIdx: number;
  /** Hash → its index (deposit order) and the push token sealed with it, if any. */
  hashes: Map<string, { idx: number; t: string | null }>;
  /** Expo said DeviceNotRegistered: no push until the next POST or PATCH of hashes. */
  muted: boolean;
  /** The last token a tap opened: what a dishonest relay could keep (forgeWake). */
  lastToken: string | null;
  /** The SHA-256 of the listening token of the channel's phone (base64url), if it listens. */
  listen: string | null;
};

const EXPO_TOKEN = /^Expo(?:nent)?PushToken\[[\x21-\x5a\x5c\x5e-\x7e]{1,256}\]$/;

/** The relay's `openToken` (src/crypto.ts): the text sealed with the tap of MAC `c`, or null. */
export function openSealedText(c: Uint8Array, t: string): string | null {
  const bytes = fromB64url(t);
  if (bytes.length < 29) return null;
  const key = hkdf(sha256, c, new Uint8Array(0), utf8ToBytes("card-relay v2 push token"), 32);
  try {
    return new TextDecoder().decode(gcm(key, bytes.subarray(0, 12)).decrypt(bytes.subarray(12)));
  } catch {
    return null;
  }
}

/** The bare token sealed with the tap of MAC `c` (what the relay pushes an alert to), or null. */
export function openSealedToken(c: Uint8Array, t: string): string | null {
  const text = openSealedText(c, t);
  return text !== null && EXPO_TOKEN.test(text) ? text : null;
}

const ENTRY_HASH = /^[A-Za-z0-9_-]{22}$/;
/** The SHA-256 of a listening token, base64url (32 bytes). */
const LISTEN_HASH = /^[A-Za-z0-9_-]{43}$/;

/** Why a relay refuses a phone's `/v1/listen`. */
export type ListenRefusal = "unannounced" | "unreachable" | "unknown";
const ENTRY_TOKEN = /^[A-Za-z0-9_-]{39,438}$/;

/** `{"hashes": [{h, t?}, …]}`, 1 to 1024 entries, or null. */
function entriesOf(body: Record<string, unknown>): { h: string; t: string | null }[] | null {
  const { hashes } = body;
  if (!Array.isArray(hashes) || hashes.length < 1 || hashes.length > MAX_BATCH) return null;
  const entries: { h: string; t: string | null }[] = [];
  for (const entry of hashes as unknown[]) {
    if (!entry || typeof entry !== "object") return null;
    const { h, t, ...rest } = entry as Record<string, unknown>;
    if (Object.keys(rest).length > 0 || typeof h !== "string" || !ENTRY_HASH.test(h)) return null;
    if (t !== undefined && (typeof t !== "string" || !ENTRY_TOKEN.test(t))) return null;
    entries.push({ h, t: t ?? null });
  }
  return entries;
}

/** What the point of sale's callback gets. */
type Outcome = { status: "OK" } | { status: "ERROR"; reason: string };

export type Session = {
  id: string;
  k1: string;
  wsToken: string;
  /** The channel (SHA-256 of its secret, hex) the tap woke. */
  channel: string;
  createdAt: number;
  /** Its wake packet, until the phone reads it from `/v1/channel/pending` or connects. */
  packet: Packet | null;
  socket: FakeRelaySocket | null;
  /** The point of sale's invoice, while its callback waits. */
  waiting: {
    /** What the phone receives: absent fields of the proof left out. */
    message: { pr: string; k1: string; metadata?: string; verify?: string };
    /** When the point of sale stops waiting (Date.now()): what `waitMs` tells, relay 2.1.0. */
    until: number;
    resolve: (outcome: Outcome) => void;
    timer: ReturnType<typeof setTimeout>;
  } | null;
  /** The point of sale was answered: the session takes nothing more. */
  done: boolean;
  /** The phone's socket asked to hand the session over (`{"hold":true}`, relay `handOver`). */
  held: boolean;
  /** Its wake packet as sealed, offered again once a held socket closes. */
  sealed: Packet | null;
  /** What the point of sale was told, once it was. */
  outcome: Outcome | null;
  expiry: ReturnType<typeof setTimeout>;
};

/** A push the relay asked Expo to send, as the real one writes it: an alert, shown by the system. */
export type Push = {
  to: string;
  kind: "alert";
  title: string;
  data: { cr: Packet };
};

function json(status: number, body?: unknown): Response {
  return new Response(body === undefined ? "" : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

/**
 * As relay 2.2.0 answers: no text of its own, ever (`reason` empty); the only words a point
 * of sale gets are the phone's (`declined`).
 */
const error = (status: number) => json(status, { status: "ERROR", reason: "" });
const NO_TEXT: Outcome = { status: "ERROR", reason: "" };

/** The phone's reason as the relay forwards it: as written, cut at 200 UTF-16 code units whole. */
function declined(reason: unknown): Outcome {
  if (typeof reason !== "string") return NO_TEXT;
  let cut = reason.slice(0, 200);
  const last = cut.charCodeAt(cut.length - 1);
  if (reason.length > 200 && last >= 0xd800 && last <= 0xdbff) cut = cut.slice(0, -1);
  return { status: "ERROR", reason: cut };
}

export class FakeCardRelay {
  /** Channels by the SHA-256 (hex) of their secret: the relay never keeps the secret. */
  readonly channels = new Map<string, Channel>();
  readonly sessions = new Map<string, Session>();
  /** Notifications sent to Expo, in order. */
  readonly pushes: Push[] = [];
  /** Every request, as `METHOD /path`, WebSocket upgrades as `WS /wait/<session>`. */
  readonly requests: string[] = [];
  unreachable = false;
  protocol: unknown = 2;
  /** What `/v1/info` announces as `wakes`: null for none. The app reads none. */
  wakes: unknown = null;
  /** What `/v1/info` announces of `/v1/listen`: null for a relay of before it. */
  listen: { heartbeatSeconds: number } | null = null;
  /**
   * Whether it hands a session over (`/v1/info` `handOver`): a phone's socket that sent
   * `{"hold":true}` leaves the session, once closed, to the next socket with its token.
   */
  handOver = false;
  /** How many sessions were handed over. */
  handedOver = 0;
  /**
   * How long the point of sale's callback waits for the phone at a relay of 2.1.0 or later, which
   * tells the phone what is left of it with the invoice (`waitMs`): 65 s there.
   * Null: a relay of before, which waits WAIT_MS (30 s) and tells nothing.
   */
  answerWaitMs: number | null = null;
  /** The phones listening, by their token's hash: what each gets at a tap of its channels. */
  readonly listeners = new Map<string, (packet: Packet) => void>();
  /** The packets sent to listening phones, in order. */
  readonly socketWakes: Packet[] = [];
  private overrides: { status: number; body?: unknown }[] = [];

  constructor(readonly host: string) {}

  /** The next request gets this answer, whatever it asks. */
  answerNext(status: number, body?: unknown): void {
    this.overrides.push({ status, body });
  }

  /** The channel opened by `secret`, if any. */
  channelOf(secret: Uint8Array): Channel | undefined {
    return this.channels.get(bytesToHex(sha256(secret)));
  }

  async handle(url: URL, init: RequestInit): Promise<Response> {
    const method = (init.method ?? "GET").toUpperCase();
    this.requests.push(`${method} ${url.pathname}`);
    if (this.unreachable) throw new TypeError("Network request failed");
    const override = this.overrides.shift();
    if (override) return json(override.status, override.body);
    const path = url.pathname;
    if (method === "GET" && path === "/v1/info")
      return json(200, {
        protocol: this.protocol,
        version: "test",
        ...(this.wakes === null ? {} : { wakes: this.wakes }),
        ...(this.listen === null ? {} : { listen: this.listen }),
        ...(this.handOver ? { handOver: true } : {})
      });
    if (method === "GET" && path === "/healthz") return json(200, { ok: true });
    if (method === "GET" && path === "/w") return this.withdraw(url);
    if (method === "GET" && path.startsWith("/cb/")) return this.callback(url);
    if (path.startsWith("/v1/channel")) return this.channel(method, path, init);
    return error(404);
  }

  private channel(method: string, path: string, init: RequestInit): Response {
    const auth = /^Bearer ([0-9a-f]{64})$/.exec(
      new Headers(init.headers).get("Authorization") ?? ""
    );
    if (!auth) return error(401);
    const id = bytesToHex(sha256(hexToBytes(auth[1])));
    const channel = this.channels.get(id);
    let body: Record<string, unknown> = {};
    if (typeof init.body === "string") {
      try {
        body = JSON.parse(init.body) as Record<string, unknown>;
      } catch {
        return error(400);
      }
    }
    if (method === "PUT" && path === "/v1/channel") {
      const { pubkey, pushToken, listen } = body;
      if (pushToken !== undefined) return error(400);
      if (typeof pubkey !== "string" || !/^[A-Za-z0-9_-]{87}$/.test(pubkey)) {
        return error(400);
      }
      // A relay of before /v1/listen ignores the field, as the real one did.
      const listens = this.listen !== null && listen !== undefined;
      if (listens && listen !== null && (typeof listen !== "string" || !LISTEN_HASH.test(listen))) {
        return error(400);
      }
      if (channel) {
        channel.pubkey = pubkey;
        if (listens) channel.listen = listen as string | null;
        return json(200, { pending: channel.hashes.size, nextIdx: channel.nextIdx });
      }
      this.channels.set(id, {
        pubkey,
        nextIdx: 0,
        hashes: new Map(),
        muted: false,
        lastToken: null,
        listen: listens ? (listen as string | null) : null
      });
      return json(201, { pending: 0, nextIdx: 0 });
    }
    if (!channel) return error(404);
    if (method === "GET" && path === "/v1/channel") {
      return json(200, { pending: channel.hashes.size, nextIdx: channel.nextIdx });
    }
    if (method === "POST" && path === "/v1/channel/hashes") {
      const entries = entriesOf(body);
      if (!entries) return error(400);
      if (channel.hashes.size + entries.length > MAX_PENDING) return error(409);
      for (const { h, t } of entries) {
        if (!channel.hashes.has(h)) channel.hashes.set(h, { idx: channel.nextIdx, t });
        channel.nextIdx++;
      }
      channel.muted = false;
      return json(200, { pending: channel.hashes.size, nextIdx: channel.nextIdx });
    }
    if (method === "PATCH" && path === "/v1/channel/hashes") {
      const entries = entriesOf(body);
      if (!entries) return error(400);
      let updated = 0;
      for (const { h, t } of entries) {
        const pending = channel.hashes.get(h);
        if (!pending) continue;
        pending.t = t;
        updated++;
      }
      channel.muted = false;
      return json(200, { pending: channel.hashes.size, nextIdx: channel.nextIdx, updated });
    }
    if (method === "GET" && path === "/v1/channel/pending") {
      // Each packet once, and only while its session waits for the phone (contract v2).
      const packets: Packet[] = [];
      for (const session of this.sessions.values()) {
        if (session.channel !== id || !session.packet) continue;
        packets.push(session.packet);
        session.packet = null;
      }
      return json(200, { packets });
    }
    if (method === "DELETE" && path === "/v1/channel") {
      this.channels.delete(id);
      for (const session of this.sessions.values()) {
        if (session.channel === id) session.packet = null;
      }
      return json(200, { status: "OK" });
    }
    return error(404);
  }

  /**
   * As a dishonest relay: wakes the phone of the channel opened by `secret` for any `p`, `c` (a tap
   * kept back, another card's), without looking at its hashes. Gives the withdraw request a point
   * of sale would get.
   */
  forgeWake(secret: Uint8Array, p: string, c: string): { callback: string; k1: string } {
    const id = bytesToHex(sha256(secret));
    const channel = this.channels.get(id);
    if (!channel) throw new Error("No such channel");
    return this.wake(id, channel, p, c, channel.lastToken);
  }

  /**
   * A phone opens `/v1/listen` with the token of this hash: refused as the relay does when it does
   * not serve it (`unannounced`), is not reached (`unreachable`), or no channel names the hash
   * (`unknown`, 404); else, from now on, `deliver` gets each tap of those channels (a phone that
   * connects again replaces its former socket).
   */
  listenWith(hash: string, deliver: (packet: Packet) => void): "open" | ListenRefusal {
    this.requests.push("WS /v1/listen");
    if (this.unreachable) return "unreachable";
    if (this.listen === null) return "unannounced";
    if (![...this.channels.values()].some((channel) => channel.listen === hash)) return "unknown";
    this.listeners.set(hash, deliver);
    return "open";
  }

  /** The phone closed its listening socket. */
  stopListening(hash: string): void {
    this.listeners.delete(hash);
  }

  /** Expo answered DeviceNotRegistered for the channel opened by `secret`. */
  unregisterDevice(secret: Uint8Array): void {
    const channel = this.channelOf(secret);
    if (channel) channel.muted = true;
  }

  /** A point of sale's first call (LUD-03): `GET /w?p&c`. */
  private withdraw(url: URL): Response {
    const p = url.searchParams.get("p") ?? "";
    const c = url.searchParams.get("c") ?? "";
    if (!/^[0-9a-fA-F]{32}$/.test(p) || !/^[0-9a-fA-F]{16}$/.test(c)) {
      return error(400);
    }
    const hash = b64url(sha256(hexToBytes(c.toLowerCase())).slice(0, 16));
    const found = [...this.channels].filter(([, channel]) => channel.hashes.has(hash));
    if (found.length === 0) return error(404);
    if (found.length > 1) return error(409);
    const [id, channel] = found[0];
    // Anti-replay: this hash and every one before it.
    const { idx: index, t } = channel.hashes.get(hash)!;
    for (const [other, entry] of channel.hashes) {
      if (entry.idx <= index) channel.hashes.delete(other);
    }
    // The token sealed with this tap, opened with its c, then forgotten (but by a dishonest relay).
    const token = t === null ? null : openSealedToken(hexToBytes(c.toLowerCase()), t);
    if (token) channel.lastToken = token;
    const request = this.wake(id, channel, p, c, token);
    return json(200, {
      tag: "withdrawRequest",
      callback: request.callback,
      k1: request.k1,
      minWithdrawable: 1000,
      maxWithdrawable: 100_000_000,
      // Relay 2.2.0: present, as LUD-03 lists it, and empty (no text of its own).
      defaultDescription: "",
      payeeProof: true
    });
  }

  /** Opens a tap's session, seals its packet to the channel's phone and "pushes" it. */
  private wake(
    id: string,
    channel: Channel,
    p: string,
    c: string,
    token: string | null
  ): { callback: string; k1: string } {
    const sessionId = bytesToHex(random(16));
    const session: Session = {
      id: sessionId,
      k1: bytesToHex(random(32)),
      // 16 random bytes in hex, as the relay makes it.
      wsToken: bytesToHex(random(16)),
      channel: id,
      createdAt: Date.now(),
      packet: null,
      socket: null,
      waiting: null,
      done: false,
      held: false,
      sealed: null,
      outcome: null,
      expiry: setTimeout(() => this.drop(sessionId), SESSION_LIFETIME_MS)
    };
    this.sessions.set(session.id, session);
    const packet = sealPacket(
      channel.pubkey,
      JSON.stringify({ p, c, session: session.id, wsToken: session.wsToken, relay: this.host })
    );
    session.packet = packet;
    session.sealed = packet;
    // A listening phone gets it at once, the push as well (the app takes each session once).
    const listener = channel.listen === null ? undefined : this.listeners.get(channel.listen);
    if (listener) {
      this.socketWakes.push(packet);
      later(() => listener(packet));
    }
    if (token && !channel.muted) {
      this.pushes.push({
        to: token,
        kind: "alert",
        title: "Card payment",
        data: { cr: packet }
      });
    }
    return { callback: `https://${this.host}/cb/${session.id}`, k1: session.k1 };
  }

  /** The point of sale's invoice (LUD-03 callback): answered once the phone is, 30 s at most. */
  private async callback(url: URL): Promise<Response> {
    const id = url.pathname.slice("/cb/".length);
    const k1 = url.searchParams.get("k1");
    const pr = url.searchParams.get("pr");
    const metadata = url.searchParams.get("metadata") ?? undefined;
    const verify = url.searchParams.get("verify") ?? undefined;
    if (!k1 || !pr || !/^ln/i.test(pr)) return error(400);
    // The relay's bounds of the payee's proof: checked, never more.
    if (metadata !== undefined && (metadata.length === 0 || metadata.length > 1024)) {
      return error(400);
    }
    if (
      verify !== undefined &&
      (verify.length === 0 || verify.length > 512 || !/^https:\/\//i.test(verify))
    ) {
      return error(400);
    }
    const session = this.sessions.get(id);
    if (!session) return error(404);
    if (k1.toLowerCase() !== session.k1) return error(400);
    if (session.waiting || session.done) return error(409);
    const wait = this.answerWaitMs ?? WAIT_MS;
    clearTimeout(session.expiry);
    session.expiry = setTimeout(() => this.drop(id), wait + 1000);
    const outcome = await new Promise<Outcome>((resolve) => {
      const message = { pr, k1: session.k1, metadata, verify };
      session.waiting = {
        message,
        until: Date.now() + wait,
        resolve,
        timer: setTimeout(() => this.settle(session, NO_TEXT), wait)
      };
      session.socket?.deliver(this.invoiceMessage(session.waiting));
    });
    session.packet = null;
    session.socket?.closeFromRelay(1000);
    session.socket = null;
    return json(200, outcome);
  }

  /** The phone connects to `/wait/<session>?t=<wsToken>`: true when the relay takes it. */
  attach(socket: FakeRelaySocket, url: URL): boolean {
    const id = url.pathname.slice("/wait/".length);
    this.requests.push(`WS /wait/${id}`);
    if (this.unreachable) return false;
    const session = this.sessions.get(id);
    if (!session || url.searchParams.get("t") !== session.wsToken) return false;
    if (session.socket || session.done) return false;
    session.socket = socket;
    session.held = false;
    session.packet = null;
    socket.onPhoneMessage = (data) => {
      if (session.socket !== socket || session.done) return;
      let answer: { ok?: unknown; reason?: unknown; hold?: unknown };
      try {
        answer = JSON.parse(data) as typeof answer;
      } catch {
        return;
      }
      // As the relay: before or after the invoice, until it answers.
      if (answer?.hold === true && this.handOver) {
        session.held = true;
        return;
      }
      if (!session.waiting) return;
      if (answer?.ok === true) this.settle(session, { status: "OK" });
      else if (answer?.ok === false) this.settle(session, declined(answer.reason));
    };
    socket.onPhoneClose = () => {
      if (session.socket !== socket) return;
      session.socket = null;
      if (session.held && !session.done) {
        // Handed over: the point of sale keeps waiting, the packet is offered again.
        session.held = false;
        this.handedOver += 1;
        session.packet = session.sealed;
        return;
      }
      this.settle(session, NO_TEXT);
    };
    if (session.waiting) socket.deliver(this.invoiceMessage(session.waiting));
    return true;
  }

  /**
   * The invoice as the phone receives it now: at a relay of 2.1.0 or later, with what is left of
   * the point of sale's wait (`waitMs`), less for a phone that connects late.
   */
  private invoiceMessage(waiting: NonNullable<Session["waiting"]>): Record<string, unknown> {
    return this.answerWaitMs === null
      ? waiting.message
      : { ...waiting.message, waitMs: Math.max(0, waiting.until - Date.now()) };
  }

  /** Answers the waiting point of sale, once. */
  private settle(session: Session, outcome: Outcome): void {
    const waiting = session.waiting;
    if (!waiting) return;
    clearTimeout(waiting.timer);
    session.waiting = null;
    session.done = true;
    session.outcome = outcome;
    waiting.resolve(outcome);
  }

  /** The session ends: its point of sale answered, its phone's socket closed. */
  private drop(id: string): void {
    const session = this.sessions.get(id);
    if (!session) return;
    this.sessions.delete(id);
    clearTimeout(session.expiry);
    session.packet = null;
    this.settle(session, NO_TEXT);
    session.socket?.closeFromRelay(1000);
    session.socket = null;
  }

  /** Ends every session (between tests): no timer outlives its test. */
  dropAll(): void {
    for (const id of [...this.sessions.keys()]) this.drop(id);
  }
}

const relays = new Map<string, FakeCardRelay>();

export function addRelay(host: string): FakeCardRelay {
  const relay = new FakeCardRelay(host);
  relays.set(host, relay);
  return relay;
}

export function resetCardRelays(): void {
  for (const relay of relays.values()) relay.dropAll();
  relays.clear();
}

/** The fake relay of `host`, if a test added it. */
export function relayAt(host: string): FakeCardRelay | undefined {
  return relays.get(host);
}

/** `fetch` over the fake relays: an unknown host does not answer. */
export async function fetchRelays(
  input: RequestInfo | URL,
  init: RequestInit = {}
): Promise<Response> {
  const url = new URL(
    typeof input === "string" ? input : input instanceof URL ? input.href : input.url
  );
  const relay = relays.get(url.host);
  if (url.protocol !== "https:" || !relay) throw new Error("Network disabled in tests");
  if (init.signal?.aborted) throw new DOMException("Aborted", "AbortError");
  return relay.handle(url, init);
}

/** A point of sale reading `url` (`lnurlw://…`) from a card. */
export function posTap(url: string): Promise<Response> {
  return fetchRelays(url.replace(/^lnurlw:/, "https:"));
}

/**
 * A point of sale sending `pr` to the callback of the withdraw request `posTap` gave (LUD-03):
 * resolves with what the relay tells it once the phone answered (or after 30 s).
 */
export async function posCallback(
  request: { callback: string; k1: string },
  pr: string,
  proof: { metadata?: string; verify?: string } = {}
): Promise<Record<string, unknown>> {
  const url = new URL(request.callback);
  url.searchParams.set("k1", request.k1);
  url.searchParams.set("pr", pr);
  // The payee's proof, as the point of sale joins it (src/lib/lightning/lnurl.ts, submitWithdraw).
  if (proof.metadata !== undefined) url.searchParams.set("metadata", proof.metadata);
  if (proof.verify !== undefined) url.searchParams.set("verify", proof.verify);
  const answer = await fetchRelays(url);
  return (await answer.json()) as Record<string, unknown>;
}

/** The withdraw request of a tap read by a point of sale, as `posTap` gives it. */
export async function posWithdraw(url: string): Promise<{ callback: string; k1: string }> {
  const answer = await posTap(url);
  if (answer.status !== 200) throw new Error(`The relay refused the tap: ${answer.status}`);
  return (await answer.json()) as { callback: string; k1: string };
}

const CONNECTING = 0;
const OPEN = 1;
const CLOSING = 2;
const CLOSED = 3;

/** Runs `run` after the current task's promises, as a socket's events come (no timer). */
function later(run: () => void): void {
  void Promise.resolve().then(run);
}

/**
 * The tests' `WebSocket` (jest.setup.ts): the phone's side of `wss://<relay>/wait/…` on the fake
 * relays. Any other address fails, as with no network. Events come asynchronously, as a real
 * socket's; only what the app uses is there (`on…` handlers, `send`, `close`, `readyState`).
 */
export class FakeRelaySocket {
  static readonly CONNECTING = CONNECTING;
  static readonly OPEN = OPEN;
  static readonly CLOSING = CLOSING;
  static readonly CLOSED = CLOSED;
  readonly CONNECTING = CONNECTING;
  readonly OPEN = OPEN;
  readonly CLOSING = CLOSING;
  readonly CLOSED = CLOSED;

  readyState = CONNECTING;
  onopen: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;
  /** The relay's side. */
  onPhoneMessage: ((data: string) => void) | null = null;
  onPhoneClose: (() => void) | null = null;
  /** What the phone sent, in order. */
  readonly sent: string[] = [];

  constructor(readonly url: string) {
    later(() => this.connect());
  }

  private connect(): void {
    if (this.readyState !== CONNECTING) return;
    let target: URL | null = null;
    try {
      target = new URL(this.url);
    } catch {
      target = null;
    }
    const relay = target && target.protocol === "wss:" ? relays.get(target.host) : undefined;
    if (!target || !relay || !target.pathname.startsWith("/wait/") || !relay.attach(this, target)) {
      // A refused upgrade (403, 404, 409) or no network: an error, then the close.
      this.readyState = CLOSED;
      this.onerror?.({ type: "error" });
      this.onclose?.({ code: 1006, reason: "" });
      return;
    }
    this.readyState = OPEN;
    this.onopen?.({ type: "open" });
  }

  send(data: string): void {
    if (this.readyState !== OPEN) throw new Error("INVALID_STATE_ERR");
    this.sent.push(data);
    later(() => this.onPhoneMessage?.(data));
  }

  close(): void {
    if (this.readyState === CLOSED || this.readyState === CLOSING) return;
    const wasOpen = this.readyState === OPEN;
    this.readyState = CLOSING;
    later(() => {
      this.readyState = CLOSED;
      if (wasOpen) this.onPhoneClose?.();
      this.onclose?.({ code: 1000, reason: "" });
    });
  }

  /** The relay sends `message` to the phone (from the upgrade on: it arrives after `onopen`). */
  deliver(message: unknown): void {
    if (this.readyState === CLOSING || this.readyState === CLOSED) return;
    const data = JSON.stringify(message);
    later(() => {
      if (this.readyState === OPEN) this.onmessage?.({ data });
    });
  }

  /** The relay closes the socket: a code, no text (relay 2.2.0). */
  closeFromRelay(code: number, reason = ""): void {
    if (this.readyState === CLOSED) return;
    this.readyState = CLOSING;
    later(() => {
      this.readyState = CLOSED;
      this.onclose?.({ code, reason });
    });
  }
}
