import { bytesToHex } from "@noble/hashes/utils.js";
import { AppState, Platform } from "react-native";

import { logFailure } from "@/lib/log/log";
import { secureRandomBytes } from "@/lib/random";

import { signEvent, type NostrEvent } from "./event";
import { nostrKeys } from "./keys";
import {
  MAX_EVENTS_PER_QUERY,
  MAX_INVALID_EVENTS,
  MAX_MESSAGE_LENGTH,
  matchesFilter
} from "./relay-bounds";
import { QueryClosed, RelayRefusal } from "./relay-errors";
import { createRelaySocket } from "./socket";

/*
 * Nostr relay client (NIP-01, NIP-42). A call goes over the connection its channel keeps to the
 * relay (RelayChannel): opened by the first call, shared by every call made while it is open, each
 * call with subscriptions of its own (closed once it is done), and closed after IDLE_CLOSE_MS
 * without a call. A connection per call would mean hundreds for "Wallet" alone (each read, each
 * page of a read, to each relay, again every minute).
 * What a relay receives names nothing of the app: random subscription ids, and on the web a
 * connection whose origin is hidden (socket.web.ts).
 */

/**
 * Which connection a call goes over. NIP-42 authentications last as long as their connection and
 * add up: a relay learns that the keys one connection authenticated as are one client's. So a
 * device keeps two connections to each relay:
 * - "account": what the account, the team and its devices read and write as their own keys (the
 *   backup, the roster, the employees' records, invoices, catalogue, images, the owner's copy);
 * - "anonymous": the registry and the payment links, read without a key of the account's (a key
 *   of the connection's own, when a relay asks) and written by a sale's own key: no connection ties
 *   them to the account's keys. What goes over one anonymous connection, the relay may tie together.
 * - "single": a connection of the call's own, closed once the call is done ("Test the
 *   connection": a new connection, never one already open; an invitation until the device joined
 *   its team, member.ts).
 */
export type RelayChannel = "account" | "anonymous" | "single";

/** A NIP-01 subscription filter, as far as the app uses it. */
export type RelayFilter = {
  ids?: string[];
  kinds?: number[];
  authors?: string[];
  "#d"?: string[];
  /** Events naming one of these addresses (`kind:pubkey:d`): deletion requests (deletion.ts). */
  "#a"?: string[];
  /** Unix seconds: events created at this time or later. */
  since?: number;
  /** Unix seconds: events created at this time or earlier. */
  until?: number;
  /** At most this many events, the newest first (relays may send fewer). */
  limit?: number;
};

export type RelayOptions = {
  /** The connection the call goes over (RelayChannel). */
  channel: RelayChannel;
  /**
   * Past this, from the call on (the connection's opening included), the call rejects (a watch:
   * until the connection is open only).
   */
  timeoutMs: number;
  /**
   * The keys the call authenticates as when a relay asks (NIP-42 lets a client authenticate as
   * several keys on one connection), each once per connection. None: the connection's own key (a
   * random one, made with it, gone with it), for a read that needs no key of its authors'.
   */
  authKeys?: readonly AuthKey[];
  /**
   * The platform's by default (socket.ts: React Native's; socket.web.ts: an isolated frame's).
   * Calls share a connection only when they share this function.
   */
  createSocket?: (url: string) => WebSocket;
  /**
   * Aborting it ends the call at once (a connection of its own: closed): nothing the relay sends
   * after is read for it, no challenge answered. Only `aborted` and the `abort` event are used:
   * React Native's AbortController (the abort-controller package) has neither `reason` nor
   * `throwIfAborted`.
   */
  signal?: AbortSignal;
};

/** A key, or a function giving it at each challenge: it can refuse (throw) once the key is wiped. */
export type AuthKey = Uint8Array | (() => Uint8Array);

/** NIP-42 authentication event. */
const AUTH_KIND = 22242;

/**
 * The public key of each secret key the calls authenticate as, computed once per key object (it
 * costs a signature's work): a key wiped in place keeps its entry, but no longer signs.
 */
const publicKeys = new WeakMap<Uint8Array, string>();

function publicKeyOf(secretKey: Uint8Array): string {
  let publicKey = publicKeys.get(secretKey);
  if (publicKey === undefined) {
    publicKey = nostrKeys(secretKey).publicKey;
    publicKeys.set(secretKey, publicKey);
  }
  return publicKey;
}

type Message = unknown[];

type Session = {
  send: (message: Message) => void;
  /** Calls `listener` with every message of the relay, until the returned function is called. */
  listen: (listener: (message: Message) => void) => () => void;
  /**
   * Answers the relay's last AUTH challenge (NIP-42), as each key of the call not yet
   * authenticated on the connection. false without a challenge, or when every key is refused.
   */
  authenticate: () => Promise<boolean>;
  /** Resolves true after `ms`, or false as soon as the call ends (its timer cleared). */
  wait: (ms: number) => Promise<boolean>;
  /**
   * Ends the call's connection, its other calls included (relay-bounds.ts): the relay misbehaved,
   * and only closing the socket stops what it keeps sending.
   */
  abandon: (error: Error) => void;
};

/** NIP-42 prefix of a refusal that authentication may lift. */
const AUTH_REQUIRED = "auth-required:";

/**
 * What an EOSE with NIP-67's "auth" hint stands for: the relay holds more events of the filter for
 * an authenticated reader. The answer is not whole: it counts as a refusal that authentication may
 * lift, never as all the relay holds.
 */
const AUTH_HINTED = `${AUTH_REQUIRED} more events for an authenticated reader (NIP-67)`;

/** Whether an EOSE carries NIP-67's "auth" hint (its third element, a list of hints). */
function authHinted(message: Message): boolean {
  return Array.isArray(message[2]) && message[2].includes("auth");
}

/** `WebSocket.CONNECTING`, as a literal: the `WebSocket` global is not there in every runtime. */
const CONNECTING = 0;

/**
 * At most this many subscriptions open at once on a connection; the calls' next ones wait for a
 * slot. Relays refuse more than theirs (NIP-11 `max_subscriptions` of the default relays: 20 at
 * the fewest); the heartbeat goes past it, by one.
 */
export const MAX_SUBSCRIPTIONS = 10;

/**
 * The wait for a slot (MAX_SUBSCRIPTIONS) does not count against a call's timeout: a burst of reads
 * behind a slow relay would time out while it answers. At most this long, though.
 */
export const SLOT_WAIT_MAX_MS = 60_000;

/** A shared connection without a call for this long is closed ("Wallet" reads every minute). */
export const IDLE_CLOSE_MS = 3 * 60_000;

/**
 * How long a connection's heartbeat (HEARTBEAT_MS after the relay last sent something), or an
 * authentication, may wait for the relay's answer: past it, the connection is given up (the
 * heartbeat), the key counted as refused (an authentication).
 */
export const HEARTBEAT_TIMEOUT_MS = 10_000;

type SocketFactory = (url: string) => WebSocket;

/** Why a connection ended, and whether its calls may go on over a new one (not once closed on purpose). */
type EndListener = (error: Error, retryable: boolean) => void;

/** A connection to one relay: a call's own, or shared by a channel's calls (connectionFor). */
class Connection {
  state: "connecting" | "open" | "ended" = "connecting";
  /** When the relay last sent something (Date.now()). */
  lastMessageAt = 0;
  readonly listeners = new Set<(message: Message) => void>();
  readonly endListeners = new Set<EndListener>();
  private readonly openListeners = new Set<() => void>();
  private readonly socket: WebSocket;
  private challenge: string | null = null;
  /** Per public key (hex): its authentication on this connection, accepted or still unanswered. */
  private readonly authenticated = new Map<string, Promise<boolean>>();
  /** The key it authenticates as for the calls that bring none: random, made at their first need. */
  private ownKey: Uint8Array | null = null;
  /**
   * The subscriptions open on the relay; `queued`, the REQs waiting for a slot (MAX_SUBSCRIPTIONS),
   * each with what to call once it goes.
   */
  private readonly open = new Set<string>();
  private readonly queued: { message: Message; sent?: () => void }[] = [];
  private users = 0;
  private retired = false;
  private idleTimer: ReturnType<typeof setTimeout> | undefined;
  private heartbeatTimer: ReturnType<typeof setTimeout> | undefined;
  private heartbeat: string | null = null;

  constructor(
    readonly url: string,
    factory: SocketFactory,
    readonly shared: boolean,
    /** Takes it out of its channel's connections (connectionFor): no call gets it any more. */
    private readonly forget: () => void = () => undefined
  ) {
    this.socket = factory(url);
    this.socket.onmessage = (event: MessageEvent) => this.receive(event);
    this.socket.onerror = () => this.end(new Error(`${url}: connection failed`));
    this.socket.onclose = () => this.end(new Error(`${url}: connection closed`));
    this.socket.onopen = () => {
      this.state = "open";
      this.lastMessageAt = Date.now();
      this.scheduleHeartbeat();
      for (const listener of [...this.openListeners]) listener();
      this.openListeners.clear();
    };
  }

  /** Runs `listener` once the connection is open (at once when it is). */
  whenOpen(listener: () => void) {
    if (this.state === "open") listener();
    else if (this.state === "connecting") this.openListeners.add(listener);
  }

  join() {
    this.users += 1;
    clearTimeout(this.idleTimer);
  }

  /** A call is done with it: a shared connection without a call closes after IDLE_CLOSE_MS. */
  leave() {
    this.users -= 1;
    if (!this.shared || this.users > 0 || this.state === "ended") return;
    if (this.state === "connecting" || this.retired) {
      this.end(new Error(`${this.url}: connection closed`), false);
      return;
    }
    clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(
      () => this.end(new Error(`${this.url}: connection closed`), false),
      IDLE_CLOSE_MS
    );
  }

  /** No new call gets it; closed once its calls are done. */
  retire() {
    this.retired = true;
    this.forget();
    if (this.users === 0) this.end(new Error(`${this.url}: connection closed`), false);
  }

  /**
   * Sends `message`. false when it is a REQ waiting for a slot (MAX_SUBSCRIPTIONS, unless
   * `pastLimit`): it goes once one is free, then calls `sent`.
   */
  send(
    message: Message,
    { pastLimit = false, sent }: { pastLimit?: boolean; sent?: () => void } = {}
  ) {
    if (this.state !== "open") return true;
    const [type, id] = message;
    if (type === "REQ") {
      if (!pastLimit && this.open.size >= MAX_SUBSCRIPTIONS) {
        this.queued.push({ message, sent });
        return false;
      }
      this.open.add(String(id));
    } else if (type === "CLOSE") {
      const waiting = this.queued.findIndex(({ message: [, queued] }) => queued === id);
      if (waiting >= 0) {
        this.queued.splice(waiting, 1);
        return true;
      }
      // Closed already (CLOSED): nothing to close.
      if (!this.open.delete(String(id))) return true;
    }
    this.socket.send(JSON.stringify(message));
    if (type === "CLOSE") this.sendQueued();
    return true;
  }

  private sendQueued() {
    while (this.state === "open" && this.queued.length > 0) {
      if (this.open.size >= MAX_SUBSCRIPTIONS) return;
      const { message, sent } = this.queued.shift()!;
      this.open.add(String(message[1]));
      this.socket.send(JSON.stringify(message));
      sent?.();
    }
  }

  private receive(event: MessageEvent) {
    const data = String(event.data);
    // Its length is known before anything is parsed (relay-bounds.ts).
    if (data.length > MAX_MESSAGE_LENGTH) {
      logFailure("A relay sent a message too long: its connection closed");
      this.end(new Error(`${this.url}: message too long`));
      return;
    }
    let message: unknown;
    try {
      message = JSON.parse(data);
    } catch {
      return;
    }
    if (!Array.isArray(message)) return;
    this.lastMessageAt = Date.now();
    // Valid until the connection ends or the relay sends another one (NIP-42).
    if (message[0] === "AUTH" && typeof message[1] === "string") this.challenge = message[1];
    if (message[0] === "CLOSED" && this.open.delete(String(message[1]))) this.sendQueued();
    for (const listener of [...this.listeners]) listener(message);
  }

  /**
   * Answers the last challenge as each of `keys` (none: the connection's own key) not yet
   * authenticated on it: signed only then, once per key and connection (NIP-42: an
   * authentication lasts as long as its connection). Whether one key at least was accepted: what
   * the relay then answers tells whether it was enough. Throws when a key refuses (wiped).
   */
  async authenticate(keys: readonly AuthKey[]): Promise<boolean> {
    const { challenge } = this;
    if (this.state !== "open" || challenge === null) return false;
    const signers = keys.length > 0 ? keys : [(this.ownKey ??= secureRandomBytes(32))];
    const answers = signers.map((key) => {
      const secretKey = typeof key === "function" ? key() : key;
      const publicKey = publicKeyOf(secretKey);
      const known = this.authenticated.get(publicKey);
      if (known) return known;
      const auth = signEvent(
        {
          kind: AUTH_KIND,
          created_at: Math.floor(Date.now() / 1000),
          tags: [
            ["relay", this.url],
            ["challenge", challenge]
          ],
          content: ""
        },
        secretKey
      );
      const answer = this.answer(auth.id).then((accepted) => {
        if (!accepted && this.authenticated.get(publicKey) === answer) {
          this.authenticated.delete(publicKey);
        }
        return accepted;
      });
      this.authenticated.set(publicKey, answer);
      this.send(["AUTH", auth]);
      return answer;
    });
    return (await Promise.all(answers)).some((accepted) => accepted);
  }

  /** The relay's OK to the AUTH `id`: false refused, or without an answer in HEARTBEAT_TIMEOUT_MS. */
  private answer(id: string): Promise<boolean> {
    return new Promise((done) => {
      const finish = (accepted: boolean) => {
        clearTimeout(timer);
        this.listeners.delete(listener);
        this.endListeners.delete(ended);
        done(accepted);
      };
      const listener = (message: Message) => {
        if (message[0] === "OK" && message[1] === id) finish(message[2] === true);
      };
      const ended = () => finish(false);
      const timer = setTimeout(() => finish(false), HEARTBEAT_TIMEOUT_MS);
      this.listeners.add(listener);
      this.endListeners.add(ended);
    });
  }

  /**
   * A connection checks that the relay still answers once it sent nothing for HEARTBEAT_MS (a
   * call's own connection, only as long as its call: a watch's): a connection cut without a close (a phone changing networks, a router
   * dropping an idle connection) tells the app nothing, neither React Native (Android's read
   * timeout is off, no automatic ping) nor a browser (no ping from a page's script).
   */
  private scheduleHeartbeat() {
    clearTimeout(this.heartbeatTimer);
    const quiet = Date.now() - this.lastMessageAt;
    this.heartbeatTimer = setTimeout(
      () => {
        if (Date.now() - this.lastMessageAt < HEARTBEAT_MS) this.scheduleHeartbeat();
        else this.checkAlive();
      },
      Math.max(0, HEARTBEAT_MS - Math.min(quiet, HEARTBEAT_MS))
    );
  }

  /** Asks the relay something it answers at once now, unless a heartbeat is waiting already. */
  checkAlive() {
    if (this.state !== "open" || this.heartbeat !== null) return;
    clearTimeout(this.heartbeatTimer);
    const subscription = subscriptionId();
    this.heartbeat = subscription;
    const listener = (message: Message) => {
      if (message[1] !== subscription) return;
      if (message[0] !== "EOSE" && message[0] !== "CLOSED") return;
      if (message[0] === "EOSE") this.send(["CLOSE", subscription]);
      this.listeners.delete(listener);
      this.heartbeat = null;
      this.scheduleHeartbeat();
    };
    this.listeners.add(listener);
    this.heartbeatTimer = setTimeout(
      () => this.end(new Error(`${this.url}: no answer to the heartbeat`)),
      HEARTBEAT_TIMEOUT_MS
    );
    this.send(["REQ", subscription, HEARTBEAT_FILTER], { pastLimit: true });
  }

  end(error: Error, retryable = true) {
    if (this.state === "ended") return;
    this.state = "ended";
    this.forget();
    clearTimeout(this.idleTimer);
    clearTimeout(this.heartbeatTimer);
    this.ownKey?.fill(0);
    this.listeners.clear();
    this.openListeners.clear();
    this.queued.length = 0;
    const { socket } = this;
    socket.onmessage = socket.onerror = socket.onclose = null;
    // React Native on Android ignores close() while the socket connects (its native module only
    // knows a socket once open): one given up on then would stay open, so close it as soon as it
    // opens.
    socket.onopen = socket.readyState === CONNECTING ? () => socket.close() : null;
    try {
      socket.close();
    } catch {
      // Already closed.
    }
    const listeners = [...this.endListeners];
    this.endListeners.clear();
    for (const listener of listeners) listener(error, retryable);
  }
}

/** The shared connections, by socket factory, then by `channel url`. */
const connections = new Map<SocketFactory, Map<string, Connection>>();

/**
 * Every shared connection not ended yet, those retired (out of `connections`, still carrying
 * their calls) included: closeRelayConnections must reach them too.
 */
const liveConnections = new Set<Connection>();

/** The connection a call goes over: its channel's to `url` (opened when none is), or its own. */
function connectionFor(url: string, options: RelayOptions): Connection {
  const factory = options.createSocket ?? createRelaySocket;
  if (options.channel === "single") return new Connection(url, factory, false);
  followAppState();
  let shared = connections.get(factory);
  if (!shared) {
    shared = new Map();
    connections.set(factory, shared);
  }
  const key = `${options.channel} ${url}`;
  const known = shared.get(key);
  if (known) return known;
  const byKey = shared;
  const connection: Connection = new Connection(url, factory, true, () => {
    if (byKey.get(key) !== connection) return;
    byKey.delete(key);
    if (byKey.size === 0 && connections.get(factory) === byKey) connections.delete(factory);
  });
  byKey.set(key, connection);
  liveConnections.add(connection);
  connection.endListeners.add(() => liveConnections.delete(connection));
  return connection;
}

/**
 * Closes every shared connection, its calls rejected ("connection closed"), never taken over by a
 * new one: an account closes (its keys are wiped; the next account's calls must not go over
 * connections authenticated as them), a device leaves its team.
 */
export function closeRelayConnections(): void {
  for (const connection of [...liveConnections]) {
    connection.end(new Error(`${connection.url}: connection closed`), false);
  }
}

let followingAppState = false;

/**
 * Once the app went to the background (the system may cut its connections there, without a
 * close), its shared connections are retired: the calls made after go over new ones. Not on the
 * web, where a hidden tab keeps its connections (each switch of tabs would open them again).
 */
function followAppState() {
  if (followingAppState || Platform.OS === "web") return;
  followingAppState = true;
  AppState.addEventListener("change", (state) => {
    if (state !== "background") return;
    for (const byKey of [...connections.values()]) {
      for (const connection of [...byKey.values()]) connection.retire();
    }
  });
}

/** What a call hears of its REQs waiting for a slot (MAX_SUBSCRIPTIONS): its timeout stops then. */
type SlotWait = { waiting: () => void; sent: () => void };

/** One call's view of its connection: its listeners and subscriptions, ended with the call. */
class CallSession implements Session {
  private readonly listeners = new Set<(message: Message) => void>();
  private readonly subscriptions = new Set<string>();
  /** Its REQs waiting for a slot: each one told `slot.sent` once it goes, or once the call ends. */
  private readonly queued = new Set<string>();
  private readonly waits = new Set<() => void>();

  constructor(
    private readonly connection: Connection,
    private readonly authKeys: readonly AuthKey[],
    private readonly active: () => boolean,
    private readonly slot: SlotWait
  ) {
    // A subscription the relay closed is closed for the call too.
    this.listen((message) => {
      if (message[0] === "CLOSED") this.subscriptions.delete(String(message[1]));
    });
  }

  send = (message: Message) => {
    if (!this.active()) return;
    const id = String(message[1]);
    if (message[0] === "CLOSE") {
      this.subscriptions.delete(id);
      this.dequeued(id);
      this.connection.send(message);
      return;
    }
    if (message[0] !== "REQ") {
      this.connection.send(message);
      return;
    }
    this.subscriptions.add(id);
    const sent = this.connection.send(message, { sent: () => this.dequeued(id) });
    if (!sent) {
      this.queued.add(id);
      this.slot.waiting();
    }
  };

  /** The REQ `id` no longer waits for a slot (sent, or closed): its wait ends. */
  private dequeued(id: string) {
    if (this.queued.delete(id)) this.slot.sent();
  }

  listen = (listener: (message: Message) => void) => {
    this.listeners.add(listener);
    this.connection.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
      this.connection.listeners.delete(listener);
    };
  };

  authenticate = async () => {
    // Not once the call is done (an abort above all): the keys may be wiped by then.
    if (!this.active()) return false;
    return this.connection.authenticate(this.authKeys);
  };

  wait = (ms: number) =>
    new Promise<boolean>((done) => {
      if (!this.active()) {
        done(false);
        return;
      }
      const end = () => {
        clearTimeout(waiting);
        this.waits.delete(end);
        done(false);
      };
      const waiting = setTimeout(() => {
        this.waits.delete(end);
        done(true);
      }, ms);
      this.waits.add(end);
    });

  abandon = (error: Error) => {
    if (this.active()) this.connection.end(error);
  };

  /** The call is done: its listeners leave, its subscriptions still open are closed. */
  end() {
    for (const listener of this.listeners) this.connection.listeners.delete(listener);
    this.listeners.clear();
    for (const end of [...this.waits]) end();
    for (const id of [...this.queued]) this.dequeued(id);
    // A connection of the call's own closes with it, its subscriptions with it.
    if (this.connection.shared) {
      for (const subscription of this.subscriptions) this.connection.send(["CLOSE", subscription]);
    }
    this.subscriptions.clear();
  }
}

/**
 * Runs `operation` over the connection of the call's channel to `url` (connectionFor), once open.
 * The timeout covers the whole call, or only the opening (`untilOpen`: a watch lasts), but for the
 * waits for a subscription slot (SLOT_WAIT_MAX_MS at most each). A shared
 * connection already open that ends during the call (cut while idle, found dead by its heartbeat)
 * hands the call once to a new connection, within the same timeout. A call that times out on a
 * shared connection the relay sent nothing on since has it checked at once (checkAlive).
 */
function withRelay<T>(
  url: string,
  options: RelayOptions,
  operation: (session: Session) => Promise<T>,
  untilOpen = false
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const { signal } = options;
    if (signal?.aborted) {
      reject(new Error(`${url}: aborted`));
      return;
    }
    let settled = false;
    let attempt: { connection: Connection; session: CallSession; startedAt: number } | null = null;

    const leave = () => {
      const current = attempt;
      if (!current) return;
      attempt = null;
      current.session.end();
      current.connection.endListeners.delete(onEnd);
      if (current.connection.shared) current.connection.leave();
      else current.connection.end(new Error(`${url}: connection closed`), false);
    };
    const settle = (outcome: { value: T } | { error: unknown }) => {
      if (settled) return;
      settled = true;
      timing = false;
      clearTimeout(timer);
      clearTimeout(slotTimer);
      signal?.removeEventListener("abort", abort);
      leave();
      if ("value" in outcome) resolve(outcome.value);
      else reject(outcome.error);
    };
    const expire = () => {
      const current = attempt;
      settle({ error: new Error(`${url}: no answer in time`) });
      if (current?.connection.shared && current.connection.lastMessageAt < current.startedAt) {
        current.connection.checkAlive();
      }
    };
    // The call's timeout: stopped while one of its REQs waits for a slot, then the rest of it.
    let timing = true;
    let left = options.timeoutMs;
    let armedAt = Date.now();
    let timer = setTimeout(expire, left);
    let slotTimer: ReturnType<typeof setTimeout> | undefined;
    let waitingSlots = 0;
    const slot: SlotWait = {
      waiting: () => {
        waitingSlots += 1;
        if (waitingSlots > 1 || !timing) return;
        clearTimeout(timer);
        left -= Date.now() - armedAt;
        slotTimer = setTimeout(
          () => settle({ error: new Error(`${url}: no subscription slot in time`) }),
          SLOT_WAIT_MAX_MS
        );
      },
      sent: () => {
        waitingSlots -= 1;
        if (waitingSlots > 0 || !timing) return;
        clearTimeout(slotTimer);
        armedAt = Date.now();
        timer = setTimeout(expire, Math.max(0, left));
      }
    };
    const abort = () => settle({ error: new Error(`${url}: aborted`) });
    signal?.addEventListener("abort", abort);

    let retried = false;
    const onEnd: EndListener = (error, retryable) => {
      const current = attempt;
      if (settled || !current) return;
      const reused = current.connection.shared && current.startedAt > 0;
      attempt = null;
      current.session.end();
      if (retryable && reused && !untilOpen && !retried) {
        retried = true;
        begin();
      } else {
        settle({ error });
      }
    };
    const start = () => {
      const connection = connectionFor(url, options);
      // 0: a connection opened for this call; a failure of it is the call's.
      const startedAt = connection.state === "open" ? Date.now() : 0;
      const current: { connection: Connection; session: CallSession; startedAt: number } = {
        connection,
        session: new CallSession(
          connection,
          options.authKeys ?? [],
          () => !settled && attempt === current,
          slot
        ),
        startedAt
      };
      attempt = current;
      connection.join();
      connection.endListeners.add(onEnd);
      connection.whenOpen(() => {
        if (settled || attempt !== current) return;
        if (untilOpen) {
          // An open watch lasts: no timeout any more, its waits for a slot included.
          timing = false;
          clearTimeout(timer);
          clearTimeout(slotTimer);
        }
        operation(current.session).then(
          (value) => {
            if (attempt === current) settle({ value });
          },
          (error: unknown) => {
            if (attempt === current) settle({ error });
          }
        );
      });
    };
    const begin = () => {
      try {
        start();
      } catch (failure) {
        // The socket could not be created (connectionFor): the timer and the abort listener go.
        settle({ error: failure });
      }
    };
    begin();
  });
}

/** The relay's answer to an event or an AUTH message: accepted, and its reason (NIP-01). */
function nextOk(session: Session, id: string): Promise<{ accepted: boolean; reason: string }> {
  return new Promise((done) => {
    const stop = session.listen((message) => {
      if (message[0] !== "OK" || message[1] !== id) return;
      stop();
      done({ accepted: message[2] === true, reason: String(message[3] ?? "") });
    });
  });
}

/**
 * Publishes `event` to the relay at `url`, authenticating when the relay asks for it (NIP-42).
 * Resolves once the relay has accepted it ("duplicate:" included), rejects otherwise.
 */
export function publishEvent(url: string, event: NostrEvent, options: RelayOptions) {
  return withRelay(url, options, async (session) => {
    const write = () => {
      const answer = nextOk(session, event.id);
      session.send(["EVENT", event]);
      return answer;
    };
    let answer = await write();
    if (
      !answer.accepted &&
      answer.reason.startsWith(AUTH_REQUIRED) &&
      (await session.authenticate())
    ) {
      answer = await write();
    }
    if (!answer.accepted) throw new RelayRefusal(url, answer.reason);
  });
}

/**
 * The stored events of the relay at `url` that match `filter`, as the relay sent them: unchecked,
 * the caller must verify them (isValidEvent). Authenticates when the relay asks for it (NIP-42),
 * or says it holds more for an authenticated reader (NIP-67), and rejects when it still holds some
 * back: a partial answer is never taken for all the relay holds. Rejects as well once the relay
 * sent more than MAX_EVENTS_PER_QUERY events (relay-bounds.ts), its subscription closed.
 */
export function queryEvents(url: string, filter: RelayFilter, options: RelayOptions) {
  return withRelay(url, options, async (session) => {
    const query = (subscription: string) =>
      new Promise<{ events: unknown[]; closed: string | null; overflow?: true }>((done) => {
        const events: unknown[] = [];
        const stop = session.listen((message) => {
          if (message[1] !== subscription) return;
          if (message[0] === "EVENT") {
            if (events.length >= MAX_EVENTS_PER_QUERY) {
              stop();
              session.send(["CLOSE", subscription]);
              done({ events: [], closed: null, overflow: true });
              return;
            }
            events.push(message[2]);
          } else if (message[0] === "CLOSED") {
            stop();
            done({ events, closed: String(message[2] ?? "") });
          } else if (message[0] === "EOSE") {
            stop();
            done({ events, closed: authHinted(message) ? AUTH_HINTED : null });
          }
        });
        session.send(["REQ", subscription, filter]);
      });
    let result = await query(subscriptionId());
    if (result.closed?.startsWith(AUTH_REQUIRED) && (await session.authenticate())) {
      result = await query(subscriptionId());
    }
    if (result.overflow) {
      logFailure("A relay sent more events than a query takes");
      throw new Error(`${url}: more than ${MAX_EVENTS_PER_QUERY} events for one query`);
    }
    if (result.closed !== null) throw new QueryClosed(url, result.closed);
    return result.events;
  });
}

/**
 * A connection checks that its relay still answers once it sent nothing for this long
 * (Connection.checkAlive): a connection cut without a close (a phone changing networks, a router
 * dropping an idle connection) tells the app nothing, neither React Native (Android's read timeout
 * is off, no automatic ping) nor a browser (no ping from a page's script).
 */
export const HEARTBEAT_MS = 10_000;

/** Matches no event: the id of none (all zeros). Its answer is the relay's EOSE alone. */
const HEARTBEAT_FILTER: RelayFilter = { ids: ["0".repeat(64)], limit: 1 };

/**
 * Keeps a subscription open on the relay at `url` (NIP-01: the REQ stays open past EOSE): each event
 * matching `filter` it holds, then each one it receives later, goes to `onEvent` as it comes,
 * unchecked but for the filter (matchesFilter, relay-bounds.ts): the caller verifies it, and
 * returns false when it does not check out. Authenticates when the relay asks for it (NIP-42), or
 * holds events back for an authenticated reader (NIP-67): still held back, they end the watch.
 * Lasts until `options.signal` aborts it (it then rejects, "aborted"); rejects as soon as the
 * connection fails or ends (its heartbeat unanswered among others, Connection.checkAlive), the
 * relay closes the subscription, or does not answer the authentication within
 * `options.timeoutMs`: the caller connects again (watchRelays). Its relay's MAX_INVALID_EVENTS-th
 * event outside the filter or that does not check out ends the connection (relay-bounds.ts).
 */
export function watchEvents(
  url: string,
  filter: RelayFilter,
  options: RelayOptions,
  onEvent: (value: unknown) => boolean | void
): Promise<never> {
  return withRelay(
    url,
    options,
    async (session) => {
      let invalid = 0;
      const watch = (subscription: string) =>
        new Promise<string>((done) => {
          const stop = session.listen((message) => {
            if (message[1] !== subscription) return;
            if (message[0] === "EVENT") {
              // Outside the filter: never handed over, its signature never checked.
              const value: unknown = message[2];
              if (matchesFilter(value, filter) && onEvent(value) !== false) return;
              invalid += 1;
              if (invalid < MAX_INVALID_EVENTS) return;
              stop();
              logFailure("A relay sent events that do not check out: its connection closed");
              session.abandon(new Error(`${url}: events that do not check out`));
            } else if (message[0] === "CLOSED") {
              stop();
              done(String(message[2] ?? ""));
            } else if (message[0] === "EOSE" && authHinted(message)) {
              // Events held back for an authenticated reader: as closed, the subscription ends.
              stop();
              session.send(["CLOSE", subscription]);
              done(AUTH_HINTED);
            }
          });
          session.send(["REQ", subscription, filter]);
        });
      const subscribed = async () => {
        let closed = await watch(subscriptionId());
        // The call's timeout no longer runs once open: a relay that never answers the
        // authentication would hold the watch forever, without events nor a new connection.
        if (
          closed.startsWith(AUTH_REQUIRED) &&
          (await Promise.race([
            session.authenticate(),
            session.wait(options.timeoutMs).then(() => false)
          ]))
        ) {
          closed = await watch(subscriptionId());
        }
        return `${url} closed the subscription: ${closed}`;
      };
      // The connection checks itself that the relay answers (Connection.checkAlive): given up, it
      // ends the watch.
      throw new Error(await subscribed());
    },
    true
  );
}

/** A random subscription id, as most clients use: it tells the relay nothing. */
function subscriptionId(): string {
  return bytesToHex(secureRandomBytes(8));
}
