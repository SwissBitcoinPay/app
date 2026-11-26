/*
 * The JavaScript engine of the iOS notification service extension: JavaScriptCore, which runs
 * the app's own TypeScript (bundled by scripts/extension-engine.js) without React Native, with
 * what the extension's Swift gives it as `globalThis.__sattlemeHost`
 * (plugins/card-notification-extension/ios/EngineHost.swift). Platform files `*.engine.ts` stand
 * for the modules that need React Native or Expo (random.engine.ts), and the engine's bundle takes
 * the few packages they need from src/lib/engine/shims/ instead.
 */

/** What the extension gives the engine. */
export type EngineHost = {
  /** `length` bytes from SecRandomCopyBytes, as numbers (0 to 255); none when it failed. */
  random(length: number): number[];
  /** Records a step of the run (its time and memory, as the extension's probe records steps). */
  step(name: string): void;
};

/** An HTTP request the host sends (fetch.ts): text bodies only, the app's APIs are JSON. */
export type HostRequest = {
  url: string;
  method: string;
  headers: [string, string][];
  body: string | null;
  /** Refuse to follow a redirect (fetch's `redirect: "error"`). */
  noRedirect: boolean;
};

/** Its answer: the body as UTF-8 text. */
export type HostResponse = {
  status: number;
  /** The URL that answered (after the redirects followed). */
  url: string;
  redirected: boolean;
  headers: [string, string][];
  body: string;
};

/** What a WebSocket the host opened tells (socket.ts): text frames only. */
export type HostSocketEvents = {
  open(): void;
  message(text: string): void;
  error(): void;
  close(code: number, reason: string): void;
};

/**
 * What the engine's runtime asks of the host (runtime.ts): timers, a monotonic clock, the
 * network, the journal, and what the app shares with the extension (card-keychain.engine.ts,
 * card-files.engine.ts). Every call returns at once; what comes later comes through the callback
 * given, on the engine's queue, one at a time.
 */
export type EngineRuntimeHost = EngineHost & {
  /** Milliseconds of a clock that never goes back (performance.now). */
  monotonic(): number;
  /** Calls `callback` once, `ms` later; the timer's id. */
  setTimer(ms: number, callback: () => void): number;
  clearTimer(id: number): void;
  /** Writes a line of the extension's journal. */
  log(level: "info" | "warn" | "error", text: string): void;
  /** Sends `request`; `done` gets the response, or an error's message. The request's id. */
  fetch(
    request: HostRequest,
    done: (response: HostResponse | null, error: string | null) => void
  ): number;
  /** Cancels the request `id`: its `done` is not called. */
  cancelFetch(id: number): void;
  /** Opens a WebSocket to `url` (wss only); the socket's id. */
  openSocket(url: string, events: HostSocketEvents): number;
  sendSocket(id: number, text: string): void;
  /** Closes the socket `id`: its `close` event follows. */
  closeSocket(id: number, code: number, reason: string): void;
  /** A card item the app shares (card-keychain.ts), null when there is none. */
  cardItem(key: string): string | null;
  /** The JSON of the build's settings the engine reads (app.config.ts `extra`, in part). */
  config(): string;
  /**
   * The app group's container (card-files.ts), paths relative to it ("card-payments/log.json"):
   * the host refuses a path out of it, and any write but to the extension's own files.
   */
  files: {
    exists(path: string): boolean;
    isDirectory(path: string): boolean;
    read(path: string): string;
    write(path: string, text: string): void;
    move(from: string, to: string, overwrite: boolean): void;
    makeDirectory(path: string): void;
    remove(path: string): void;
  };
};

/** A payment of the SDK as the host gives it (sdk-read.ts SdkPaymentView, its numbers as text). */
export type HostPayment = {
  id: string;
  type: "send" | "receive";
  status: "completed" | "failed" | "pending";
  /** Sats, whole, in decimal. */
  amount: string;
  fees: string;
  /** Unix seconds, in decimal. */
  timestamp: string;
  method: "lightning" | "spark" | "token" | "deposit" | "withdraw" | "unknown";
  details:
    | {
        tag: "lightning";
        description: string | null;
        lnAddress: string | null;
        senderComment: string | null;
        paymentHash: string;
        preimage: string | null;
      }
    | { tag: "spark"; invoiceDescription: string | null }
    | { tag: "deposit" | "withdraw"; txId: string }
    | { tag: "token" }
    | { tag: "other" }
    | null;
};

/** What the SDK's `parse` read (sdk-read.ts SdkBolt11View): a Lightning invoice, or another input. */
export type HostParsed =
  | {
      tag: "bolt11";
      bolt11: string;
      network: "bitcoin" | "regtest" | "other";
      /** Millisats, in decimal; null without an amount. */
      amountMsat: string | null;
      timestamp: string;
      expiry: string;
      description: string | null;
    }
  | { tag: "other" };

/** A payment of an invoice the SDK prepared, kept by the host under `quoteId`. */
export type HostQuote = {
  quoteId: string;
  /** Sats, in decimal. */
  amountSats: string;
  /** Its method: "bolt11" for a Lightning invoice paid as such. */
  method: "bolt11" | "other";
  lightningFeeSats: string;
  /** The fee is on top of the amount (FeePolicy.FeesExcluded). */
  feesExcluded: boolean;
};

/**
 * The Breez SDK in the extension (its Swift build): a card's wallet, connected for a payment. Each
 * call answers once through `done`: its value, or an error's message. The host connects it with
 * the app's settings of a card's wallet but these (EngineWallet.swift): deposits are never claimed
 * there, no chain service is asked and no external input parser either (no third party the app
 * does not reach). `send` pays sats over Lightning only (`preferSpark` false), as the app's wallet
 * does.
 */
export type HostBreez = {
  /**
   * Connects the wallet of `mnemonic` (BIP-39 words, no passphrase), its storage at `storage` (names
   * joined by "/") below the extension's own directory of the SDK; `synced` is called at each
   * `Synced` event of the SDK. Its id, for the calls below.
   */
  connect(
    mnemonic: string,
    storage: string,
    synced: () => void,
    done: (id: number | null, error: string | null) => void
  ): void;
  /**
   * Connects the test wallet of the extension's probe, whose seed the host keeps: given only for a
   * probe's run (CardProbe.swift, "enginePay"). As `connect` otherwise.
   */
  connectProbe?(
    storage: string,
    synced: () => void,
    done: (id: number | null, error: string | null) => void
  ): void;
  disconnect(id: number, done: (ok: boolean | null, error: string | null) => void): void;
  /** Lets the SDK's instance go, its keys with it: once disconnected and no call uses it. */
  release(id: number): void;
  info(
    id: number,
    ensureSynced: boolean,
    done: (
      info: { identityPubkey: string; balanceSats: string } | null,
      error: string | null
    ) => void
  ): void;
  parse(
    id: number,
    input: string,
    done: (parsed: HostParsed | null, error: string | null) => void
  ): void;
  prepareBolt11(
    id: number,
    bolt11: string,
    done: (quote: HostQuote | null, error: string | null) => void
  ): void;
  /** Pays `quoteId` over Lightning; `untilSent`: back as soon as it left. */
  send(
    id: number,
    quoteId: string,
    idempotencyKey: string,
    untilSent: boolean,
    completionTimeoutSecs: number,
    done: (payment: HostPayment | null, error: string | null) => void
  ): void;
  getPayment(
    id: number,
    paymentId: string,
    done: (payment: HostPayment | null, error: string | null) => void
  ): void;
};

function hostObject(): Record<string, unknown> | null {
  const host = (globalThis as { __sattlemeHost?: unknown }).__sattlemeHost;
  return host && typeof host === "object" ? (host as Record<string, unknown>) : null;
}

/** The extension's host; throws where there is none (anywhere but the extension's engine). */
export function engineHost(): EngineHost {
  const host = hostObject();
  if (!host || typeof host.random !== "function" || typeof host.step !== "function") {
    throw new Error("No engine host");
  }
  return host as unknown as EngineHost;
}

const RUNTIME_MEMBERS = [
  "monotonic",
  "setTimer",
  "clearTimer",
  "log",
  "fetch",
  "cancelFetch",
  "openSocket",
  "sendSocket",
  "closeSocket",
  "cardItem",
  "config"
] as const;

const FILE_MEMBERS = [
  "exists",
  "isDirectory",
  "read",
  "write",
  "move",
  "makeDirectory",
  "remove"
] as const;

/** The extension's host with its runtime; throws where it has none. */
export function engineRuntimeHost(): EngineRuntimeHost {
  const host = engineHost() as unknown as Record<string, unknown>;
  const files = host.files as Record<string, unknown> | undefined;
  if (
    RUNTIME_MEMBERS.some((name) => typeof host[name] !== "function") ||
    !files ||
    FILE_MEMBERS.some((name) => typeof files[name] !== "function")
  ) {
    throw new Error("No engine runtime host");
  }
  return host as unknown as EngineRuntimeHost;
}

const BREEZ_MEMBERS = [
  "connect",
  "disconnect",
  "release",
  "info",
  "parse",
  "prepareBolt11",
  "send",
  "getPayment"
] as const;

/** The Breez SDK the extension's host gives; throws where it gives none. */
export function engineBreez(): HostBreez {
  const breez = (engineRuntimeHost() as unknown as { breez?: Record<string, unknown> }).breez;
  if (!breez || BREEZ_MEMBERS.some((name) => typeof breez[name] !== "function")) {
    throw new Error("No Breez SDK in the engine's host");
  }
  return breez as unknown as HostBreez;
}
