import { LEGACY_V2_HOST } from "../src/config/legacy-v2";

/*
 * A fake of the v2 server's routes the migration asks (TrailBase's native
 * auth and `GET /account`, src/lib/legacy-v2/server.ts), behind the `fetch` of the tests
 * (jest.setup.ts), before the fake v2 card service of the same host. A test gives it the account
 * (`legacyV2.account`: the full answer of GET /account), the v2 app's session it accepts
 * (`acceptSession`) and an e-mail and password (`acceptPassword`); everything else is refused as
 * the real server refuses it (401). `balances` answers `GET /v1/accounts/xpub-balance` (anonymous)
 * for the keys it holds (an unknown key: an empty wallet; `balanceDown`: its 503). The password's
 * reset (`POST /v1/auth/reset-password/request`, then `…/reset-password` with a code of
 * `resetCodes`) and the migration (`POST /v1/accounts/migrate`, `migratedTo`) as the v2 server
 * answers them. A v2 card's history (`GET /v1/apipayments/by-card`, the
 * card named by its printed number in `card-id`) for the cards of `cards`: its payments newest
 * first, by `limit` (at most 200) from `offset`, its PIN asked when it has one (`pin_required`,
 * `invalid_pin`, then `pin_locked` after five wrong ones), as the v2 server answers.
 * `calls` lists the requests, without their secrets.
 */

type Call = { method: string; path: string; authorization: string | null };

export const legacyV2 = {
  /** The full answer of `GET /account` for a valid session; null: 404. */
  account: null as Record<string, unknown> | null,
  /** Refresh tokens it renews, and the short-lived tokens it takes. */
  refreshTokens: new Set<string>(),
  authTokens: new Set<string>(),
  /** The e-mail and password it logs in with. */
  credentials: null as { email: string; password: string } | null,
  /** An account that asks for a second factor (TrailBase's 403 with an `mfa_token`). */
  secondFactor: false,
  /** No answer at all (a network failure). */
  unreachable: false,
  /** `xpub-balance`'s answer by account public key, as the server gives it (sats, numbers). */
  balances: new Map<
    string,
    { confirmed_sat: number; unconfirmed_sat: number; complete: boolean }
  >(),
  /** `xpub-balance` answering 503 `chain_unavailable` (its index down). */
  balanceDown: false,
  /**
   * The account's payments as the Record API `apipayments` lists them to its owner (any status:
   * it filters `filter[status]` itself), in the order of their ids, which page by page.
   */
  payments: [] as Record<string, unknown>[],
  /** `GET /v1/rates/history`'s points by unit (`{ time, price }`), any order. */
  rates: new Map<string, { time: number; price: number }[]>(),
  /** `GET /v1/rates/history` answering 503. */
  ratesDown: false,
  /**
   * The v2 cards by their printed number: their PIN on the v2 portal (null: none), their payments
   * as `GET /v1/apipayments/by-card` lists them (any status), and its wrong PINs in a row.
   */
  cards: new Map<
    string,
    { pin: string | null; payments: Record<string, unknown>[]; wrongPins: number }
  >(),
  /** `GET /v1/apipayments/by-card` answering this status, whatever it is asked (a 503: down). */
  byCardStatus: null as number | null,
  /**
   * Called before each page of `GET /v1/apipayments/by-card` is answered (its offset): a test
   * changes the card's payments meanwhile, as the v2 server's jobs do.
   */
  onByCardPage: null as ((offset: number) => void) | null,
  /** The PINs `GET /v1/apipayments/by-card` was given, in order (null: none). */
  pinsGiven: [] as (string | null)[],
  /** Every request, in order. */
  calls: [] as Call[],
  /** Refresh tokens closed by a logout. */
  loggedOut: [] as string[],
  /** The resets asked (`…/reset-password/request`'s bodies), whatever the e-mail. */
  resetRequests: [] as { email: string; lang: unknown; target: unknown }[],
  /** The reset codes still valid; each sets `credentials`' password once. */
  resetCodes: new Set<string>(),
  /** The Lightning address the account was migrated to (`POST /v1/accounts/migrate`); null: not. */
  migratedTo: null as string | null,
  /** `POST /v1/accounts/migrate` answering this status, whatever it is asked (a server down: 503). */
  migrateStatus: null as number | null,
  /** What the migration's call says of the payout it made (`payout`). */
  migratePayout: "sent" as "sent" | "pending" | "none",
  /**
   * A slow server: a request of one of these paths is answered once its promise settles (`hold`),
   * as it would be then.
   */
  holds: new Map<string, Promise<void>>(),
  counter: 0
};

export function resetLegacyV2Server(): void {
  legacyV2.account = null;
  legacyV2.refreshTokens.clear();
  legacyV2.authTokens.clear();
  legacyV2.credentials = null;
  legacyV2.secondFactor = false;
  legacyV2.unreachable = false;
  legacyV2.balances.clear();
  legacyV2.balanceDown = false;
  legacyV2.payments = [];
  legacyV2.rates.clear();
  legacyV2.ratesDown = false;
  legacyV2.cards.clear();
  legacyV2.byCardStatus = null;
  legacyV2.onByCardPage = null;
  legacyV2.pinsGiven = [];
  legacyV2.calls = [];
  legacyV2.loggedOut = [];
  legacyV2.resetRequests = [];
  legacyV2.resetCodes.clear();
  legacyV2.migratedTo = null;
  legacyV2.migrateStatus = null;
  legacyV2.migratePayout = "sent";
  legacyV2.holds.clear();
  legacyV2.counter = 0;
}

/** Holds the answers to `path` (`legacyV2.holds`) until the returned function is called. */
export function hold(path: string): () => void {
  let release = () => undefined as void;
  legacyV2.holds.set(
    path,
    new Promise<void>((resolve) => {
      release = resolve;
    })
  );
  return () => {
    legacyV2.holds.delete(path);
    release();
  };
}

/** The v2 app's session this server takes: its refresh token renews, its token reads. */
export function acceptSession(refreshToken: string, authToken?: string): void {
  legacyV2.refreshTokens.add(refreshToken);
  if (authToken) legacyV2.authTokens.add(authToken);
}

export function acceptPassword(email: string, password: string): void {
  legacyV2.credentials = { email, password };
}

function newToken(kind: string): string {
  legacyV2.counter += 1;
  return `${kind}-${legacyV2.counter.toString().padStart(16, "0")}`;
}

function answer(status: number, body: unknown): Response {
  const text = body === null ? "" : JSON.stringify(body);
  return { ok: status >= 200 && status < 300, status, text: async () => text } as Response;
}

function headerOf(init: RequestInit | undefined, name: string): string | null {
  const headers = (init?.headers ?? {}) as Record<string, string>;
  const key = Object.keys(headers).find((header) => header.toLowerCase() === name.toLowerCase());
  return key === undefined ? null : headers[key]!;
}

/** The answer to a request of this server, or null for any other host or path. */
export function tryFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> | null {
  const url = new URL(typeof input === "string" ? input : input.toString());
  if (url.host !== LEGACY_V2_HOST) return null;
  const path = url.pathname;
  if (
    path !== "/account" &&
    path !== "/v1/accounts/xpub-balance" &&
    path !== "/api/records/v1/apipayments" &&
    path !== "/v1/rates/history" &&
    path !== "/v1/apipayments/by-card" &&
    path !== "/v1/accounts/migrate" &&
    path !== "/v1/auth/reset-password/request" &&
    path !== "/v1/auth/reset-password" &&
    !path.startsWith("/api/auth/v1/")
  ) {
    return null;
  }
  const method = init?.method ?? "GET";
  const authorization = headerOf(init, "Authorization");
  legacyV2.calls.push({ method, path, authorization });
  if (legacyV2.unreachable) return Promise.reject(new TypeError("Network request failed"));
  const held = legacyV2.holds.get(path);
  if (held) return held.then(() => answerRequest(url, method, authorization, init));
  return answerRequest(url, method, authorization, init);
}

function answerRequest(
  url: URL,
  method: string,
  authorization: string | null,
  init: RequestInit | undefined
): Promise<Response> {
  const path = url.pathname;
  const body = (() => {
    try {
      return JSON.parse((init?.body as string | undefined) ?? "null") as Record<string, unknown>;
    } catch {
      return null;
    }
  })();
  switch (`${method} ${path}`) {
    case "POST /api/auth/v1/refresh": {
      const refresh = body?.refresh_token;
      if (typeof refresh !== "string" || !legacyV2.refreshTokens.has(refresh)) {
        return Promise.resolve(answer(401, null));
      }
      const auth = newToken("auth");
      legacyV2.authTokens.add(auth);
      return Promise.resolve(answer(200, { auth_token: auth, csrf_token: "csrf" }));
    }
    case "POST /api/auth/v1/login": {
      const { credentials } = legacyV2;
      if (
        !credentials ||
        body?.email !== credentials.email ||
        body?.password !== credentials.password
      ) {
        return Promise.resolve(answer(401, null));
      }
      if (legacyV2.secondFactor) return Promise.resolve(answer(403, { mfa_token: "mfa" }));
      const auth = newToken("auth");
      const refresh = newToken("refresh");
      legacyV2.authTokens.add(auth);
      legacyV2.refreshTokens.add(refresh);
      return Promise.resolve(
        answer(200, { auth_token: auth, refresh_token: refresh, csrf_token: "csrf" })
      );
    }
    case "POST /api/auth/v1/logout": {
      const refresh = body?.refresh_token;
      if (typeof refresh === "string") {
        legacyV2.refreshTokens.delete(refresh);
        legacyV2.loggedOut.push(refresh);
      }
      return Promise.resolve(answer(200, null));
    }
    case "GET /account": {
      const token = authorization?.replace(/^Bearer /, "") ?? "";
      if (!legacyV2.authTokens.has(token)) return Promise.resolve(answer(401, null));
      if (headerOf(init, "api-key") !== null) return Promise.resolve(answer(400, null));
      return Promise.resolve(legacyV2.account ? answer(200, legacyV2.account) : answer(404, null));
    }
    case "POST /v1/auth/reset-password/request": {
      const email = body?.email;
      if (typeof email !== "string" || !email.includes("@")) {
        return Promise.resolve(answer(400, { error: "validation" }));
      }
      legacyV2.resetRequests.push({ email, lang: body?.lang, target: body?.target });
      // The same answer for an e-mail it does not know.
      return Promise.resolve(answer(204, null));
    }
    case "POST /v1/auth/reset-password": {
      const code = body?.id;
      const next = body?.new_password;
      if (typeof code !== "string" || !legacyV2.resetCodes.has(code)) {
        return Promise.resolve(answer(400, { error: "code_invalid_or_expired" }));
      }
      if (
        typeof next !== "string" ||
        next.length < 8 ||
        !/[a-zA-Z]/.test(next) ||
        !/[0-9]/.test(next)
      ) {
        return Promise.resolve(answer(400, { error: "validation" }));
      }
      legacyV2.resetCodes.delete(code);
      if (legacyV2.credentials) legacyV2.credentials.password = next;
      return Promise.resolve(answer(204, null));
    }
    case "POST /v1/accounts/migrate": {
      if (legacyV2.migrateStatus !== null) {
        return Promise.resolve(answer(legacyV2.migrateStatus, { error: "internal" }));
      }
      const token = authorization?.replace(/^Bearer /, "") ?? "";
      if (!legacyV2.authTokens.has(token)) return Promise.resolve(answer(401, null));
      const address = body?.lightning_address;
      if (typeof address !== "string" || !address.includes("@")) {
        return Promise.resolve(answer(400, { error: "invalid_lightning_address" }));
      }
      if (legacyV2.migratedTo !== null && legacyV2.migratedTo !== address) {
        return Promise.resolve(answer(409, { error: "account_already_migrated" }));
      }
      legacyV2.migratedTo = address;
      return Promise.resolve(
        answer(200, {
          migrated: true,
          lightning_address: address,
          migrated_at: 1_793_000_000,
          payout: legacyV2.migratePayout
        })
      );
    }
    case "GET /v1/accounts/xpub-balance": {
      if (legacyV2.balanceDown) return Promise.resolve(answer(503, { error: "chain_unavailable" }));
      const key = url.searchParams.get("xpub");
      if (!key) return Promise.resolve(answer(400, null));
      const balance = legacyV2.balances.get(key);
      return Promise.resolve(
        answer(200, {
          confirmed_sat: balance?.confirmed_sat ?? 0,
          unconfirmed_sat: balance?.unconfirmed_sat ?? 0,
          tx_count: balance ? 1 : 0,
          complete: balance?.complete ?? true
        })
      );
    }
    case "GET /api/records/v1/apipayments": {
      const token = authorization?.replace(/^Bearer /, "") ?? "";
      if (!legacyV2.authTokens.has(token)) return Promise.resolve(answer(401, null));
      const limit = Math.min(Number(url.searchParams.get("limit") ?? "50"), 1024);
      const cursor = url.searchParams.get("cursor");
      const status = url.searchParams.get("filter[status]");
      const ordered = [...legacyV2.payments]
        .filter((payment) => status === null || payment.status === status)
        .sort((a, b) => (String(a.id) < String(b.id) ? -1 : 1));
      const from = cursor === null ? 0 : ordered.findIndex(({ id }) => String(id) > cursor);
      const records = from < 0 ? [] : ordered.slice(from, from + limit);
      const last = records.at(-1);
      return Promise.resolve(answer(200, { cursor: last ? String(last.id) : null, records }));
    }
    case "GET /v1/apipayments/by-card": {
      if (legacyV2.byCardStatus !== null) {
        return Promise.resolve(answer(legacyV2.byCardStatus, { error: "internal" }));
      }
      const number = headerOf(init, "card-id");
      if (number === null) return Promise.resolve(answer(400, { error: "missing_card_id" }));
      const card = legacyV2.cards.get(number);
      if (!card) return Promise.resolve(answer(400, { error: "invalid_card_id" }));
      const pin = headerOf(init, "pin-code");
      legacyV2.pinsGiven.push(pin);
      if (card.pin !== null) {
        if (card.wrongPins >= 5) return Promise.resolve(answer(429, { error: "pin_locked" }));
        if (pin === null) return Promise.resolve(answer(403, { error: "pin_required" }));
        if (pin !== card.pin) {
          card.wrongPins += 1;
          return Promise.resolve(answer(403, { error: "invalid_pin" }));
        }
        card.wrongPins = 0;
      }
      const asked = Number.parseInt(url.searchParams.get("limit") ?? "50", 10);
      const limit = Math.min(Math.max(Number.isNaN(asked) ? 50 : asked, 1), 200);
      const offset = Math.max(Number.parseInt(url.searchParams.get("offset") ?? "0", 10) || 0, 0);
      legacyV2.onByCardPage?.(offset);
      const anchor = (payment: Record<string, unknown>) =>
        Number(payment.paid_at ?? payment.created_at ?? 0);
      const ordered = [...card.payments].sort((a, b) => anchor(b) - anchor(a));
      return Promise.resolve(
        answer(200, { payments: ordered.slice(offset, offset + limit), limit, offset })
      );
    }
    case "GET /v1/rates/history": {
      if (legacyV2.ratesDown) return Promise.resolve(answer(503, null));
      const unit = (url.searchParams.get("unit") ?? "CHF").toUpperCase();
      const start = Number(url.searchParams.get("start"));
      const end = Number(url.searchParams.get("end"));
      const points = (legacyV2.rates.get(unit) ?? [])
        .filter(({ time }) => time >= start && time <= end)
        .sort((a, b) => a.time - b.time);
      return Promise.resolve(answer(200, { unit, points }));
    }
    default:
      return Promise.resolve(answer(404, null));
  }
}
