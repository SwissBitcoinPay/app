/** A relay's refusal of an event (NIP-01: `OK` false), with the relay's reason. */
export class RelayRefusal extends Error {
  readonly reason: string;

  constructor(url: string, reason: string) {
    super(`${url} refused the event: ${reason}`);
    this.name = "RelayRefusal";
    this.reason = reason;
  }
}

/**
 * Whether a relay refused an event because it holds a newer one at its address, or one as old
 * with a lower id: strfry's "replaced: have newer event" (RelayWriter.cpp; the 5 default relays run
 * strfry, as their NIP-11 says). A record published again finds the same, or newer, there.
 */
export function holdsNewer(error: unknown): boolean {
  return error instanceof RelayRefusal && error.reason.startsWith("replaced:");
}

/** A relay closed a query (NIP-01 CLOSED) instead of answering it: `reason` is its message. */
export class QueryClosed extends Error {
  readonly reason: string;

  constructor(url: string, reason: string) {
    super(`${url} closed the query: ${reason}`);
    this.name = "QueryClosed";
    this.reason = reason;
  }
}

/**
 * Whether a relay refused a query for whom it comes from (NIP-01 "restricted:", or still
 * "auth-required:" once the call authenticated, NIP-42): a relay that gives an author's events to
 * that author only, or to the keys it lets in, refuses so the records of a key the call does not
 * hold. Its answer to whoever holds that key does not tell that it serves the app's other readers.
 */
export function refusesReads(error: unknown): boolean {
  return (
    error instanceof QueryClosed &&
    (error.reason.startsWith("restricted:") || error.reason.startsWith("auth-required:"))
  );
}
