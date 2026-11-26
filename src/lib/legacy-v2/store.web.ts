import { logFailure } from "@/lib/log/log";
import { secureRandomBytes } from "@/lib/random";

import type { LegacyRole, LegacyAccountCopy, LegacyTokens } from "./data";
import {
  LEGACY_HANDOFF_PREFIX,
  LEGACY_TILL_KEY,
  NewerLegacyTillError,
  legacyHandoffFetchUrl,
  legacyHandoffPendingText,
  legacyTillText,
  newLegacyHandoffNonce,
  parseLegacyHandoff,
  parseLegacyHandoffPending,
  parseLegacyHandoffRequest,
  parseLegacyTill,
  type LegacyHandoff,
  type LegacyWebApp
} from "./handoff";

/*
 * Same API as store.ts, in the browser. The v2 web app's storage belongs to its own domain, which
 * no other site reads: what it kept comes as a hand-off instead (handoff.ts), when the v2 web apps
 * (`app.` and `dashboard.swiss-bitcoin-pay.ch`) send their users
 * here: their request sends the browser back to fetch it, with a nonce this tab
 * keeps (handoff.ts). Taken once, as the page loads (captureLegacyHandoff, before Expo Router reads
 * the URL), its fragment removed from the address bar at once. A till's is kept in this browser
 * (its screen waits for the owner's invitation), an owner's in memory only, its session's token
 * with it. Without a hand-off, nothing: "Migrate my Swiss Bitcoin Pay account" on the welcome
 * screen asks the password.
 */

export type LegacyState = {
  role: LegacyRole;
  account: LegacyAccountCopy | null;
  tokens: LegacyTokens | null;
  hasWallet: boolean;
};

export type LegacyPrompt = { title: string; cancel: string };

export type LegacyWordsRead =
  { status: "read"; words: string[] } | { status: "absent" } | { status: "unreadable" };

/** An owner's hand-off of this page's load, in memory only; null when none or forgotten. */
let owner: LegacyHandoff | null = null;

/**
 * The tab's request awaiting its hand-off (handoff.ts, step 2): its own storage, gone with the tab.
 * IRREVERSIBLE: the key's name (a tab may wait across an update of the web app).
 */
export const LEGACY_HANDOFF_PENDING_KEY = "legacy-v2-handoff-request";

/**
 * What the URL this page was opened with says of the v2 web apps, before Expo Router reads it
 * (handoff-capture.web.ts), once. Its fragment leaves the address bar first, whatever it is (a
 * token must not stay in sight, nor be read again at a reload). A request (step 1) sends the tab to
 * fetch the hand-off; a hand-off (step 3) is taken with the nonce the tab waits for only. A till's
 * replaces any kept before; an owner's forgets it (the last hand-off is the browser's). Never
 * throws.
 */
export function captureLegacyHandoff(): void {
  let request: LegacyWebApp | null;
  let found: ReturnType<typeof parseLegacyHandoff>;
  try {
    const { hash, pathname, search } = window.location;
    request = parseLegacyHandoffRequest(hash);
    found =
      request || !hash.startsWith(LEGACY_HANDOFF_PREFIX)
        ? null
        : parseLegacyHandoff(hash, pendingNonce());
    // Spent by the hand-off it awaited only: another link opened in this tab meanwhile (the owner
    // writing down the v2 wallet's words) leaves it for the real one.
    if (found && !("refused" in found)) forgetPendingNonce();
    if (!request && found === null) return;
    window.history.replaceState(window.history.state, "", `${pathname}${search}`);
  } catch (error) {
    logFailure("Reading the hand-off of a v2 web app failed", error);
    return;
  }
  if (request) {
    fetchHandoff(request);
    return;
  }
  if (!found) return;
  if ("refused" in found) {
    // The reason only (the code's own words), never a value of the hand-off.
    logFailure(`The hand-off of a v2 web app was refused: ${found.refused}`);
    return;
  }
  if (found.role === "owner") {
    owner = found;
    removeTill();
    return;
  }
  owner = null;
  try {
    // A newer app's (staging's rollbacks) is never written over.
    if (readTill() !== "newer")
      localStorage.setItem(LEGACY_TILL_KEY, legacyTillText(found.account));
  } catch (error) {
    logFailure("Keeping the hand-off of a v2 till failed", error);
  }
}

/**
 * Step 2: keeps a new nonce in the tab, then sends it to the v2 web app `app` for the hand-off.
 * Without the tab's storage (blocked), nothing: the hand-off could not be taken, the welcome screen
 * shows ("Migrate my Swiss Bitcoin Pay account" asks the password).
 */
function fetchHandoff(app: LegacyWebApp): void {
  let nonce: string;
  try {
    nonce = newLegacyHandoffNonce(secureRandomBytes);
    window.sessionStorage.setItem(
      LEGACY_HANDOFF_PENDING_KEY,
      legacyHandoffPendingText({ nonce, at: Date.now() })
    );
  } catch (error) {
    logFailure("Asking a v2 web app for its hand-off failed", error);
    return;
  }
  // `replace`: going back does not ask again.
  window.location.replace(legacyHandoffFetchUrl(app, nonce));
}

/** The nonce the tab waits for, if still awaited; a request past its time is forgotten. */
function pendingNonce(): string | null {
  try {
    const text = window.sessionStorage.getItem(LEGACY_HANDOFF_PENDING_KEY);
    const pending = parseLegacyHandoffPending(text, Date.now());
    if (!pending && text !== null) forgetPendingNonce();
    return pending?.nonce ?? null;
  } catch (error) {
    logFailure("Reading the request of a v2 web app's hand-off failed", error);
    return null;
  }
}

/** Forgets the tab's request: a hand-off is taken once. */
function forgetPendingNonce(): void {
  try {
    window.sessionStorage.removeItem(LEGACY_HANDOFF_PENDING_KEY);
  } catch (error) {
    logFailure("Forgetting the request of a v2 web app's hand-off failed", error);
  }
}

/** The till's hand-off kept in this browser; "newer" when a newer app's. */
function readTill(): { account: LegacyAccountCopy | null } | "newer" | undefined {
  try {
    return parseLegacyTill(localStorage.getItem(LEGACY_TILL_KEY));
  } catch (error) {
    if (error instanceof NewerLegacyTillError) return "newer";
    logFailure("Reading the hand-off of a v2 till failed", error);
    return undefined;
  }
}

function removeTill(): void {
  try {
    localStorage.removeItem(LEGACY_TILL_KEY);
  } catch (error) {
    logFailure("Forgetting the hand-off of a v2 till failed", error);
  }
}

export function readLegacyState(): Promise<LegacyState | null> {
  if (owner) return Promise.resolve({ ...owner, hasWallet: false });
  const till = readTill();
  if (!till || till === "newer") return Promise.resolve(null);
  return Promise.resolve({
    role: "employee",
    account: till.account,
    tokens: null,
    hasWallet: false
  });
}

export function hasLegacyWallet(): Promise<boolean> {
  return Promise.resolve(false);
}

export function readLegacyWords(_prompt: LegacyPrompt): Promise<LegacyWordsRead> {
  return Promise.resolve({ status: "absent" });
}

/** The browser holds no words of the v2 app: nothing to erase. */
export function forgetLegacyWords(): Promise<boolean> {
  return Promise.resolve(true);
}

/** Forgets the hand-off: the owner's in memory, the till's kept in this browser. */
export function forgetLegacySession(): Promise<void> {
  owner = null;
  removeTill();
  return Promise.resolve();
}
