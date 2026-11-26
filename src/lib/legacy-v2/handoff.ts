import {
  LEGACY_V2_HANDOFF_PATH,
  LEGACY_V2_HANDOFF_TTL_MS,
  LEGACY_V2_WEB_ORIGINS
} from "@/config/legacy-v2";
import { base64UrlToBytes, bytesToBase64Url } from "@/lib/base64";

import {
  isLegacyToken,
  legacyAccountCopyOf,
  type LegacyAccountCopy,
  type LegacyRole,
  type LegacyTokens
} from "./data";

/*
 * The hand-off of a v2 web app: `app.swiss-bitcoin-pay.ch` (SwissBitcoinPay/app on the web) and
 * `dashboard.swiss-bitcoin-pay.ch` (the v2 dashboard) send their users to this web app
 * with what their browser kept, as the v2 app leaves it on a phone for the native app (store.ts):
 * the role, the copy of the account, and for an owner the v2 server's session. Always in the URL's
 * fragment, never sent to a server nor written in its logs. In three steps, so that no other site
 * can hand this app an account that is not its user's (a v2 page that sends its payer to an address
 * of the merchant's choice included: the invoice's `redirect_after_paid`):
 *
 *   1. the v2 web app asks, with nothing of its own:  <web app>/#sbp-from=<app | dashboard>
 *   2. this app keeps a random nonce in the tab (sessionStorage) and sends the browser back to that
 *      v2 web app, never another origin:           <v2 web app>/sattleme#n=<nonce>
 *   3. the v2 web app hands over what its browser kept, with the nonce:
 *                                                  <web app>/#sbp=<base64url, unpadded, of the
 *                                                  UTF-8 JSON below>
 *
 *   { "v": 1, "nonce": "<step 2's>", "role": "owner" | "employee",
 *     "account"?: { "id", "name"?, "currency"?, "is_onchain_available"?, "mail"? },
 *     "token"?: "<the v2 server's short-lived token, an hour; an owner's only>" }
 *
 * A hand-off is taken only with the nonce this tab is waiting for, once, within
 * LEGACY_V2_HANDOFF_TTL_MS: a link made anywhere else cannot know it. A request made anywhere else
 * only brings the browser's own v2 data back to it. `account` takes the names of the v2 server's
 * `GET /account` (the v2 app's own copy). Never the session's refresh token, the API key, the bank
 * account nor the wallet's words: a URL stays in the browser's history.
 *
 * IRREVERSIBLE: the fragments' names and the format are the v2 web apps' as released (their own
 * code builds them): a change needs a new `v`, and this app keeps reading the ones before. Locked by
 * src/__tests__/fixtures/legacy-v2-handoff.json, the vectors the three repositories test.
 */

/** Step 1's fragment start: the name of the v2 web app follows. */
export const LEGACY_HANDOFF_REQUEST_PREFIX = "#sbp-from=";

/** Step 3's fragment start: the hand-off follows. */
export const LEGACY_HANDOFF_PREFIX = "#sbp=";

/** The format's version this app reads. */
export const LEGACY_HANDOFF_VERSION = 1;

/** A v2 web app that may ask for a hand-off. */
export type LegacyWebApp = keyof typeof LEGACY_V2_WEB_ORIGINS;

/** 16 random bytes, base64url: what a tab waits for (step 2). */
const NONCE = /^[A-Za-z0-9_-]{22}$/;

/**
 * Longest fragment taken: a hand-off is some 2 kB (a JWT, a business name); far longer is none
 * the v2 web apps built.
 */
const MAX_FRAGMENT_LENGTH = 16_384;

/** What a v2 web app handed over. */
export type LegacyHandoff = {
  role: LegacyRole;
  /** Its copy of the account; null when none, or out of shape. */
  account: LegacyAccountCopy | null;
  /** The v2 server's session, an owner's only (its short-lived token: no refresh token). */
  tokens: LegacyTokens | null;
};

/** Why a fragment starting with LEGACY_HANDOFF_PREFIX was not taken. */
export type LegacyHandoffRefusal = "nonce" | "shape" | "version";

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** The v2 web app a fragment asks a hand-off of (step 1); null when it is no such request. */
export function parseLegacyHandoffRequest(fragment: string): LegacyWebApp | null {
  if (!fragment.startsWith(LEGACY_HANDOFF_REQUEST_PREFIX)) return null;
  const name = fragment.slice(LEGACY_HANDOFF_REQUEST_PREFIX.length);
  return name === "app" || name === "dashboard" ? name : null;
}

/** A new nonce of a request, from `random` (16 bytes): secureRandomBytes. */
export function newLegacyHandoffNonce(random: (length: number) => Uint8Array): string {
  return bytesToBase64Url(random(16));
}

/** Where step 2 sends the browser: the v2 web app's page, with the nonce in its fragment. */
export function legacyHandoffFetchUrl(app: LegacyWebApp, nonce: string): string {
  return `${LEGACY_V2_WEB_ORIGINS[app]}${LEGACY_V2_HANDOFF_PATH}#n=${nonce}`;
}

/** The request a tab waits for (step 2), as it keeps it. */
export type LegacyHandoffPending = { nonce: string; at: number };

/** The text a pending request is kept as in the tab. */
export function legacyHandoffPendingText(pending: LegacyHandoffPending): string {
  return JSON.stringify(pending);
}

/** A pending request as kept, still awaited at `now`; null otherwise. */
export function parseLegacyHandoffPending(
  text: string | null,
  now: number
): LegacyHandoffPending | null {
  if (text === null) return null;
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    return null;
  }
  if (!isObject(value) || typeof value.nonce !== "string" || !NONCE.test(value.nonce)) {
    return null;
  }
  const { at } = value;
  if (typeof at !== "number" || !Number.isFinite(at) || at > now) return null;
  return now - at <= LEGACY_V2_HANDOFF_TTL_MS ? { nonce: value.nonce, at } : null;
}

/**
 * The hand-off in `fragment` (the URL's, "#…"), when it carries `nonce`, the one this tab waits for
 * (parseLegacyHandoffPending): null when the fragment is none (not LEGACY_HANDOFF_PREFIX); a refusal
 * when it is one but cannot be taken. Every value is checked as the v2 app's own on a phone
 * (data.ts): a field out of shape is unsaid, a token that could not go in a header none, a token of
 * a till ignored.
 */
export function parseLegacyHandoff(
  fragment: string,
  nonce: string | null
): LegacyHandoff | { refused: LegacyHandoffRefusal } | null {
  if (!fragment.startsWith(LEGACY_HANDOFF_PREFIX)) return null;
  if (fragment.length > MAX_FRAGMENT_LENGTH) return { refused: "shape" };
  const bytes = base64UrlToBytes(fragment.slice(LEGACY_HANDOFF_PREFIX.length));
  if (!bytes) return { refused: "shape" };
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
  } catch {
    return { refused: "shape" };
  }
  if (!isObject(value)) return { refused: "shape" };
  // A newer v2 web app than this one: none was released after version 1 (they stop with v2).
  if (value.v !== LEGACY_HANDOFF_VERSION) return { refused: "version" };
  // Before anything of it is read: a hand-off this tab did not ask for is nobody's.
  if (nonce === null || value.nonce !== nonce) return { refused: "nonce" };
  const role = value.role === "owner" || value.role === "employee" ? value.role : null;
  if (!role) return { refused: "shape" };
  const { token } = value;
  return {
    role,
    account: legacyAccountCopyOf(value.account),
    tokens:
      role === "owner" && isLegacyToken(token) ? { authToken: token, refreshToken: null } : null
  };
}

/**
 * The fragment of a hand-off, as the v2 web apps build it (their own code): for the tests and the
 * vectors only, this app never sends one.
 */
export function legacyHandoffFragment(payload: Record<string, unknown>): string {
  return (
    LEGACY_HANDOFF_PREFIX + bytesToBase64Url(new TextEncoder().encode(JSON.stringify(payload)))
  );
}

/*
 * A till's hand-off is kept in this browser (store.web.ts): its screen waits for the owner's
 * invitation, a reload or a later visit included, until the browser joins
 * a team. An owner's stays in memory, the session's token with it: a reload leads to the welcome
 * screen, whose "Migrate my Swiss Bitcoin Pay account" asks the password.
 *
 * IRREVERSIBLE: the key's name (removed by "Log out" on the web, device-wipe.web.ts, as all
 * of this browser's) and the format: a change needs a new `version`, and a value of a newer one is
 * never written over.
 */

/** The browser's `localStorage` key of a till's hand-off. */
export const LEGACY_TILL_KEY = "legacy-v2-till";

/** 1: the till's copy of the account. */
export const LEGACY_TILL_VERSION = 1;

/** A value of a newer version than this app writes. */
export class NewerLegacyTillError extends Error {
  constructor() {
    super("A newer app's hand-off of a v2 till");
    this.name = "NewerLegacyTillError";
  }
}

/**
 * The text a till's hand-off is kept as: its copy of the account under the v2 server's names, as
 * handed over (read back by the same check, legacyAccountCopyOf).
 */
export function legacyTillText(account: LegacyAccountCopy | null): string {
  return JSON.stringify({
    version: LEGACY_TILL_VERSION,
    account: account && {
      id: account.id,
      name: account.name,
      currency: account.currency,
      is_onchain_available: account.onchain,
      mail: account.email
    }
  });
}

/**
 * A till's hand-off as kept (legacyTillText): its copy of the account (null when none); undefined
 * when nothing, or nothing of this shape, is kept. Throws NewerLegacyTillError for a newer version.
 */
export function parseLegacyTill(
  text: string | null
): { account: LegacyAccountCopy | null } | undefined {
  if (text === null) return undefined;
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
  if (!isObject(value) || typeof value.version !== "number") return undefined;
  if (value.version > LEGACY_TILL_VERSION) throw new NewerLegacyTillError();
  if (value.version !== LEGACY_TILL_VERSION) return undefined;
  if (value.account === null) return { account: null };
  const account = legacyAccountCopyOf(value.account);
  return account ? { account } : undefined;
}
