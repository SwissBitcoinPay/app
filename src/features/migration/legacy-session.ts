import { logOutLegacy, type LegacySession } from "@/lib/legacy-v2/server";

/*
 * The v2 server's session of the owner, between the read of the v2 account (flow.ts) and the copy
 * of its history (history-import.ts), in memory only: never stored, logged nor given to anything
 * else. Closed (`POST /api/auth/v1/logout`) as soon as nothing needs it: the history copied or
 * failed, the migration given up, another session held.
 */

let held: LegacySession | null = null;

/** Holds `session` for the history's copy, closing the one held before. */
export function holdLegacySession(session: LegacySession): void {
  if (held && held !== session) void logOutLegacy(held);
  held = session;
}

/** The session held, given to whoever takes it (it closes it once done); null when none. */
export function takeLegacySession(): LegacySession | null {
  const session = held;
  held = null;
  return session;
}

/** Closes the session held, if any: nothing will copy the history with it. */
export function closeLegacySession(): void {
  const session = takeLegacySession();
  if (session) void logOutLegacy(session);
}
