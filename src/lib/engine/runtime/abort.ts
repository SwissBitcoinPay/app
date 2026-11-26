/*
 * AbortController and AbortSignal, as the app uses them (http.ts, nostr/pool.ts, nostr/relay.ts):
 * `aborted`, `reason`, `throwIfAborted`, the "abort" event through `addEventListener` and
 * `onabort`, each listener called once. JavaScriptCore has none.
 */

type AbortListener = (event: { type: "abort"; target: EngineAbortSignal }) => void;

/** The reason of an abort without one: an "AbortError", as the web's. */
export function abortError(): Error {
  const error = new Error("This operation was aborted");
  error.name = "AbortError";
  return error;
}

export class EngineAbortSignal {
  aborted = false;
  reason: unknown = undefined;
  onabort: AbortListener | null = null;
  private readonly listeners = new Set<AbortListener>();

  addEventListener(type: string, listener: AbortListener | null): void {
    if (type === "abort" && typeof listener === "function") this.listeners.add(listener);
  }

  removeEventListener(type: string, listener: AbortListener | null): void {
    if (type === "abort" && listener) this.listeners.delete(listener);
  }

  throwIfAborted(): void {
    if (this.aborted) throw this.reason;
  }

  /** Aborts the signal once (EngineAbortController.abort). */
  signalAbort(reason: unknown): void {
    if (this.aborted) return;
    this.aborted = true;
    this.reason = reason === undefined ? abortError() : reason;
    const event = { type: "abort" as const, target: this };
    const listeners = [...(this.onabort ? [this.onabort] : []), ...this.listeners];
    this.listeners.clear();
    for (const listener of listeners) listener(event);
  }
}

export class EngineAbortController {
  readonly signal = new EngineAbortSignal();

  abort(reason?: unknown): void {
    this.signal.signalAbort(reason);
  }
}
