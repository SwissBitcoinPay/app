import { CARD_SESSION_LIFETIME_MS } from "@/config/card";

import { isCanonicalRelayHost } from "./relay-host";

/*
 * The phone's side of a tap's session on the card relay (contract v2, docs/card-relay.md): a
 * WebSocket to `wss://<relay>/wait/<session>?t=<wsToken>`, opened with what the wake packet gave.
 * The relay sends the point of sale's invoice once it has it (`{"pr", "k1"}`, with the payee's proof
 * when the point of sale gave it: `metadata`, `verify`, payee-proof.ts, and since relay 2.1.0 how
 * long the point of sale still waits: `waitMs`) and closes the socket
 * when the point of sale stops waiting; the phone answers once, `{"ok": true}` when the payment has
 * left, `{"ok": false, "reason"}` otherwise. Everything the relay sends is checked; the first
 * message must be the invoice, anything else ends the session.
 */

/** `WebSocket.OPEN`, as a literal: the `WebSocket` global is not there in every runtime. */
const OPEN = 1;
const CONNECTING = 0;

/**
 * The point of sale's invoice, as the relay forwards it, with the payee's proof the point of sale
 * may join to it (`payeeProof`): its LUD-06 metadata and its LUD-21 verify URL,
 * checked by the phone itself (payee-proof.ts), never trusted as such. Null when absent, or out of
 * the relay's bounds (the invoice is still read: the payee is then not identified).
 */
export type CardInvoiceRequest = {
  pr: string;
  k1: string;
  metadata: string | null;
  verify: string | null;
  /**
   * How long the point of sale still waits for the answer as the relay sent the invoice (ms,
   * sattleme/relay 2.1.0); null when the relay does not say (before 2.1.0, or a
   * value out of shape): the answer then keeps the time it had before (CARD_ANSWER_LEGACY_MS).
   */
  waitMs: number | null;
};

/**
 * Why the phone does not pay, as its log keeps it (payment-log.ts) and "History" reads it
 * (history-view.ts): persisted codes, never changed. The point of sale is told a sentence in the
 * holder's language (decline-message.ts).
 */
export type CardDeclineReason =
  | "declined"
  /**
   * Not confirmed in time: a payee identified but not approved yet, a payee not identified, or any
   * payee when every payment is confirmed.
   */
  | "payee_not_approved"
  | "payee_unidentified"
  | "payment_unconfirmed"
  /** The card's own wallet holds less than the payment and its fee. */
  | "insufficient_balance"
  | "invalid invoice"
  | "invoice expired"
  | "invoice without amount"
  | "invoice already paid"
  | "amount out of bounds"
  | "amount above limit"
  | "daily limit reached"
  | "hourly limit reached"
  | "card suspended"
  | "invalid tap"
  | "payment failed"
  | "superseded"
  | "unavailable";

/**
 * The phone's answer. `reason`: what the point of sale shows, as written (the relay forwards it
 * unchanged, cut at 200 UTF-16 code units: decline-message.ts).
 */
export type CardAnswer = { ok: true } | { ok: false; reason: string };

export type RelaySessionErrorCode =
  /** The socket did not open: offline, the relay down, the session unknown or taken. */
  | "unreachable"
  /** The relay closed the session before the invoice: the point of sale gave up. */
  | "closed"
  /** The relay sent something else than an invoice. */
  | "malformed"
  /** No invoice within the session's lifetime. */
  | "timeout";

export class RelaySessionError extends Error {
  readonly code: RelaySessionErrorCode;

  constructor(code: RelaySessionErrorCode, message: string) {
    super(message);
    this.name = "RelaySessionError";
    this.code = code;
  }
}

export type RelaySession = {
  /** The point of sale's invoice; rejects with RelaySessionError. */
  readonly invoice: Promise<CardInvoiceRequest>;
  /** Whether the relay still waits for the phone's answer: the socket open, nothing answered. */
  isWaiting(): boolean;
  /** Called once, when the session ends (the socket closed, by either side). */
  onEnd(listener: () => void): () => void;
  /** Sends the answer, once; false when the relay no longer waits for it (nothing sent). */
  answer(answer: CardAnswer): boolean;
  /** Ends the session without an answer (the relay tells the point of sale the wallet left). */
  close(): void;
  /**
   * Hands the session over to the next socket with its token (`{"hold":true}`, then closed: a relay
   * that announces `handOver`, relay-client.ts), before or after the invoice, once nothing was
   * answered: the point of sale keeps waiting, and the app its holder opens takes it. False when
   * it could not be sent (the session ended, or answered): nothing handed over.
   */
  handOver(): boolean;
};

export type RelaySessionOptions = {
  /** The WebSocket of the platform by default (React Native's). */
  createSocket?: (url: string) => WebSocket;
  /** How long to wait for the invoice once connected. */
  invoiceTimeoutMs?: number;
};

const SESSION = /^[0-9a-f]{32}$/;
const WS_TOKEN = /^[A-Za-z0-9_-]{22,128}$/;
const K1 = /^[0-9a-fA-F]{64}$/;
/** As the relay accepts them from a point of sale (contract v2). */
const MAX_INVOICE_LENGTH = 2048;
/** As the relay accepts the payee's proof (UTF-16 code units). */
const MAX_METADATA_LENGTH = 1024;
const MAX_VERIFY_LENGTH = 512;
/**
 * A message longer than this is not an invoice: ignored unread. The relay's longest, every field at
 * its bound and JSON-escaped at worst (`\u00XX`), is under 12 KiB.
 */
const MAX_MESSAGE_LENGTH = 16_384;
/** The longest `waitMs` read: a relay's own bound is the session's lifetime and its wait. */
const MAX_WAIT_MS = 10 * 60_000;

/** `wss://<relay>/wait/<session>?t=<wsToken>`, from a wake packet's fields (checked again). */
export function relaySessionUrl({
  relay,
  session,
  wsToken
}: {
  relay: string;
  session: string;
  wsToken: string;
}): string {
  if (!isCanonicalRelayHost(relay) || !SESSION.test(session) || !WS_TOKEN.test(wsToken)) {
    throw new Error("Not a relay session");
  }
  return `wss://${relay}/wait/${session}?t=${wsToken}`;
}

function boundedString(value: unknown, max: number): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= max ? value : null;
}

/**
 * The relay's `waitMs`: whole milliseconds, from 0 to MAX_WAIT_MS. Larger tells nothing more (the
 * phone answers within CARD_ANSWER_MS anyway); anything else is not the relay's wait.
 */
function waitOf(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? Math.min(value, MAX_WAIT_MS)
    : null;
}

function parseInvoiceRequest(data: unknown): CardInvoiceRequest | null {
  if (typeof data !== "string" || data.length > MAX_MESSAGE_LENGTH) return null;
  let message: unknown;
  try {
    message = JSON.parse(data);
  } catch {
    return null;
  }
  if (message === null || typeof message !== "object" || Array.isArray(message)) return null;
  const { pr, k1, metadata, verify, waitMs } = message as Record<string, unknown>;
  if (typeof pr !== "string" || pr.length === 0 || pr.length > MAX_INVOICE_LENGTH) return null;
  if (typeof k1 !== "string" || !K1.test(k1)) return null;
  return {
    pr,
    k1,
    metadata: boundedString(metadata, MAX_METADATA_LENGTH),
    verify: boundedString(verify, MAX_VERIFY_LENGTH),
    waitMs: waitOf(waitMs)
  };
}

/** Opens the session of a tap's wake packet (wake-packet.ts). */
export function openRelaySession(
  wake: { relay: string; session: string; wsToken: string },
  options: RelaySessionOptions = {}
): RelaySession {
  const url = relaySessionUrl(wake);
  const createSocket = options.createSocket ?? ((target: string) => new WebSocket(target));
  const timeoutMs = options.invoiceTimeoutMs ?? CARD_SESSION_LIFETIME_MS;
  const endListeners = new Set<() => void>();
  let opened = false;
  let ended = false;
  let answered = false;
  let received: CardInvoiceRequest | null = null;
  let settle: { resolve: (request: CardInvoiceRequest) => void; reject: (e: Error) => void };
  const invoice = new Promise<CardInvoiceRequest>((resolve, reject) => {
    settle = { resolve, reject };
  });
  // A rejection nobody waits for yet is not unhandled: the caller reads it when it needs it.
  invoice.catch(() => undefined);

  let socket: WebSocket | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const end = (error: RelaySessionError | null) => {
    if (ended) return;
    ended = true;
    if (timer) clearTimeout(timer);
    if (!received) {
      settle.reject(error ?? new RelaySessionError("closed", "The relay ended the session"));
    }
    const current = socket;
    if (current) {
      current.onopen = current.onmessage = current.onerror = current.onclose = null;
      // React Native on Android ignores close() while the socket connects (relay.ts).
      if (current.readyState === CONNECTING) current.onopen = () => current.close();
      try {
        current.close();
      } catch {
        // Already closed.
      }
    }
    for (const listener of endListeners) listener();
    endListeners.clear();
  };

  try {
    socket = createSocket(url);
  } catch {
    socket = null;
  }
  if (!socket) {
    end(new RelaySessionError("unreachable", "The relay's socket could not be made"));
  } else {
    const current = socket;
    current.onopen = () => {
      opened = true;
    };
    current.onmessage = (event: MessageEvent) => {
      if (ended || received) return;
      const request = parseInvoiceRequest(event.data);
      if (!request) {
        end(new RelaySessionError("malformed", "The relay sent something else than an invoice"));
        return;
      }
      received = request;
      if (timer) clearTimeout(timer);
      settle.resolve(request);
    };
    current.onerror = () =>
      end(opened ? null : new RelaySessionError("unreachable", "The relay's socket failed"));
    current.onclose = () =>
      end(opened ? null : new RelaySessionError("unreachable", "The relay refused the session"));
    timer = setTimeout(
      () => end(new RelaySessionError("timeout", "No invoice from the point of sale")),
      timeoutMs
    );
  }

  return {
    invoice,
    isWaiting: () => !ended && !answered && socket?.readyState === OPEN,
    onEnd(listener) {
      if (ended) {
        listener();
        return () => undefined;
      }
      endListeners.add(listener);
      return () => {
        endListeners.delete(listener);
      };
    },
    answer(answer) {
      if (ended || answered || !socket || socket.readyState !== OPEN || !received) return false;
      try {
        socket.send(JSON.stringify(answer));
      } catch {
        return false;
      }
      answered = true;
      // The relay closes the socket once it has told the point of sale.
      return true;
    },
    close: () => end(null),
    handOver() {
      if (ended || answered || !socket || socket.readyState !== OPEN) return false;
      try {
        socket.send(JSON.stringify({ hold: true }));
      } catch {
        return false;
      }
      answered = true;
      // Closed by the phone: the relay keeps the session for the next socket.
      end(new RelaySessionError("closed", "The session was handed over"));
      return true;
    }
  };
}
