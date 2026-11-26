import { LEGACY_V2_HOST, LEGACY_V2_TIMEOUT_MS } from "@/config/legacy-v2";
import { isValidIban, compactIban } from "@/lib/iban";

import { isLegacyEmail, isLegacyToken, type LegacyTokens } from "./data";

/*
 * The v2 server (LEGACY_V2_HOST), asked once by the migration of a v2 owner: how its account was
 * paid out (the share kept in bitcoin, the bank account of the rest), which only the owner's
 * session reads. That session is the v2 app's own (`tb_tokens`, data.ts), renewed when its
 * short-lived token expired, else one opened with the e-mail and password of the v2 account. It
 * serves for that read and for the copy of the account's history (history.ts), then is closed.
 *
 * The routes are the v2 app's own (TrailBase's native auth, `/api/auth/v1/…`, and the server's
 * `GET /account`), asked as the v2 app asked them, and three the v2 server has for sattle.me: the
 * password's reset, its link to this app
 * (`requestLegacyPasswordReset`, `resetLegacyPassword`), and the v2 account's freeze, its money paid
 * out to the new account's Lightning address (`migrateLegacyAccount`). Answers are untrusted: every
 * field is checked, one out of shape is left to the merchant (the sign-up's steps ask it).
 *
 * Never logged nor kept: the password, the tokens, the account's values (bank details).
 */

const BASE_URL = `https://${LEGACY_V2_HOST}`;

export type LegacyServerErrorCode =
  /** No answer, an HTTP error of the server, a timeout. */
  | "network"
  /** The session or the password was refused (TrailBase: 401; Caddy also turns 429 into 401). */
  | "refused"
  /** The account asks for a second factor (TrailBase: 403 with an `mfa_token`): not done here. */
  | "secondFactor"
  /** An answer out of shape. */
  | "invalidResponse"
  /** The request's content was refused (HTTP 400: a field out of the server's rules). */
  | "rejected"
  /** A password reset's link that is no longer valid (used, expired, unknown). */
  | "expired"
  /** The v2 account was already migrated, to another sattle.me account (HTTP 409). */
  | "conflict";

export class LegacyServerError extends Error {
  readonly code: LegacyServerErrorCode;

  constructor(code: LegacyServerErrorCode, message: string) {
    super(message);
    this.name = "LegacyServerError";
    this.code = code;
  }
}

export type LegacyServerOptions = {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

/** A session of the v2 server: what `GET /account` is asked with. */
export type LegacySession = LegacyTokens;

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * One request, its body read within the timeout. Rejects LegacyServerError `network`. Shared with
 * the history's reads (history.ts).
 */
export async function request(
  path: string,
  init: { method: "GET" | "POST"; headers?: Record<string, string>; body?: unknown },
  options: LegacyServerOptions
): Promise<{ status: number; body: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? LEGACY_V2_TIMEOUT_MS);
  try {
    const response = await (options.fetchImpl ?? fetch)(`${BASE_URL}${path}`, {
      method: init.method,
      headers: {
        Accept: "application/json",
        ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...init.headers
      },
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
      // Never the v2 app's cookies: the session goes in the header only.
      credentials: "omit",
      signal: controller.signal
    });
    const text = await response.text();
    let body: unknown = null;
    try {
      body = text === "" ? null : (JSON.parse(text) as unknown);
    } catch {
      body = null;
    }
    return { status: response.status, body };
  } catch {
    // The error's text may hold the URL only: no token nor password is in it.
    throw new LegacyServerError("network", `${init.method} ${path} failed`);
  } finally {
    clearTimeout(timer);
  }
}

export function refusal(status: number, path: string): LegacyServerError {
  if (status === 401) return new LegacyServerError("refused", `${path}: refused`);
  if (status === 403) return new LegacyServerError("secondFactor", `${path}: second factor`);
  return new LegacyServerError("network", `${path}: HTTP ${status}`);
}

/**
 * A new short-lived token for the v2 app's session (`POST /api/auth/v1/refresh`), as TrailBase's
 * client renews it. `refused` once the session ended (30 days without use, a logout elsewhere).
 */
export async function refreshLegacySession(
  refreshToken: string,
  options: LegacyServerOptions = {}
): Promise<LegacySession> {
  const path = "/api/auth/v1/refresh";
  const { status, body } = await request(
    path,
    { method: "POST", body: { refresh_token: refreshToken } },
    options
  );
  if (status !== 200) throw refusal(status, path);
  const authToken = isObject(body) ? body.auth_token : undefined;
  if (!isLegacyToken(authToken))
    throw new LegacyServerError("invalidResponse", `${path}: no token`);
  return { authToken, refreshToken };
}

/**
 * A session opened with the v2 account's e-mail and password (`POST /api/auth/v1/login`, TrailBase's
 * own, as the v2 app logged in). `refused` for a wrong pair (TrailBase locks the account after three
 * in a row: the screen stops before), `secondFactor` for an account that asks one.
 */
export async function logInLegacy(
  email: string,
  password: string,
  options: LegacyServerOptions = {}
): Promise<LegacySession> {
  const path = "/api/auth/v1/login";
  const { status, body } = await request(
    path,
    { method: "POST", body: { email, password } },
    options
  );
  if (status !== 200) throw refusal(status, path);
  if (!isObject(body)) throw new LegacyServerError("invalidResponse", `${path}: not an object`);
  const { auth_token: authToken, refresh_token: refreshToken } = body;
  if (!isLegacyToken(authToken))
    throw new LegacyServerError("invalidResponse", `${path}: no token`);
  return { authToken, refreshToken: isLegacyToken(refreshToken) ? refreshToken : null };
}

/**
 * Closes a session (`POST /api/auth/v1/logout`, as TrailBase's client logs out): its refresh token
 * no longer renews anything. Never rejects: a session left open ends on its own (30 days).
 */
export async function logOutLegacy(
  session: LegacySession,
  options: LegacyServerOptions = {}
): Promise<void> {
  if (!session.refreshToken) return;
  try {
    await request(
      "/api/auth/v1/logout",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${session.authToken}` },
        body: { refresh_token: session.refreshToken }
      },
      options
    );
  } catch {
    // Ends on its own.
  }
}

/** A bank account the v2 server paid the fiat share to (its payout provider's beneficiary). */
export type LegacyBankAccount = {
  /** Electronic format (compact, uppercase), checksum verified. */
  iban: string;
  /** The holder, as one name: the v2 app never said whether a person or a company. */
  holderName: string | null;
  address: string | null;
  addressComplement: string | null;
  postalCode: string | null;
  city: string | null;
  /** ISO 3166-1 alpha-2, uppercase. */
  country: string | null;
  transferReference: string | null;
};

/** What the migration takes of the v2 account, as the owner's session reads it. */
export type LegacyAccount = {
  /** The v2 account's id (a UUID, lowercase). */
  id: string;
  name: string | null;
  /** The e-mail its owner logs in with, shown on the account's card (src/app/migration/index.tsx). */
  email: string | null;
  /**
   * When the v2 account was migrated to sattle.me (Unix seconds, `migrated_at`), by this device
   * or another: it takes no payment since. Null when it was not, or when the server does not say.
   */
  migratedAt: number | null;
  /** ISO 4217 code of the v2 point of sale's currency. */
  currency: string | null;
  /** ISO 4217 code of the fiat share's payout. */
  bankCurrency: string | null;
  /** The share of each payment paid out in bitcoin, integer 0–100; null when unsaid. */
  bitcoinPercent: number | null;
  onchain: boolean | null;
  /** The bank account of the fiat share; null when there is none, or it could not be read. */
  bank: LegacyBankAccount | null;
  /**
   * The on-chain wallets the v2 app created on a phone (`walletConfig.type` "local"), among every
   * payout destination the merchant ever proved (`verified_addresses`, kept by the v2 server as a
   * history): only those hold coins the 12 words move. `key`: its account public key (the v2 app
   * gave a zpub), null when the entry names none. Null when the answer has no such list.
   */
  localWallets: LegacyLocalWallet[] | null;
};

/** An on-chain wallet the v2 app created (LegacyAccount's `localWallets`). */
export type LegacyLocalWallet = { key: string | null };

/** An account public key (xpub, ypub, zpub), as the v2 app wrote them; checked where compared. */
const EXTENDED_KEY = /^[xyz]pub[1-9A-HJ-NP-Za-km-z]{100,112}$/;
/** A mainnet address (base58 or bech32), as the v2 server took them. */
const BITCOIN_ADDRESS = /^(bc1[02-9ac-hj-np-z]{8,87}|[13][1-9A-HJ-NP-Za-km-z]{25,34})$/i;
/** Most entries one answer is read for: far above what any merchant proved. */
const MAX_VERIFIED_ADDRESSES = 1_000;

/**
 * `verified_addresses` of the full answer (`[{ address, walletConfig? }]`, the server keeps the
 * proved ones only): the on-chain wallets the v2 app created. A Lightning address or LNURL is no
 * wallet of words; a hardware wallet's entry (`ledger`, `trezor`, `bitbox02`) neither.
 */
function localWalletsOf(value: unknown): LegacyLocalWallet[] | null {
  if (!Array.isArray(value) || value.length > MAX_VERIFIED_ADDRESSES) return null;
  const wallets: LegacyLocalWallet[] = [];
  for (const entry of value) {
    if (!isObject(entry) || !isObject(entry.walletConfig)) continue;
    if (entry.walletConfig.type !== "local") continue;
    const address = typeof entry.address === "string" ? entry.address.trim() : "";
    const zpub = entry.walletConfig.zpub;
    const onchainAddress = EXTENDED_KEY.test(address) || BITCOIN_ADDRESS.test(address);
    if (!onchainAddress) continue;
    const key = EXTENDED_KEY.test(address)
      ? address
      : typeof zpub === "string" && EXTENDED_KEY.test(zpub)
        ? zpub
        : null;
    wallets.push({ key });
  }
  return wallets;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CURRENCY = /^[A-Z]{3}$/;
const COUNTRY = /^[A-Z]{2}$/;
/** Longer than this, a field is no value the v2 server took (its own bounds are far below). */
const MAX_TEXT_LENGTH = 200;

/** A text of the answer, trimmed; null when absent, empty or out of shape. */
function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed !== "" && trimmed.length <= MAX_TEXT_LENGTH ? trimmed : null;
}

function code(value: unknown, pattern: RegExp): string | null {
  const read = text(value)?.toUpperCase() ?? null;
  return read !== null && pattern.test(read) ? read : null;
}

function percent(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 100
    ? value
    : null;
}

/**
 * The full answer of `GET /account` (owner's session, no API key), as far as the migration needs
 * it. Its bank details come from the server's payout provider at each request: `error_bank` says it
 * could not read them, and none are taken then.
 */
export function parseLegacyAccount(body: unknown): LegacyAccount | null {
  if (!isObject(body)) return null;
  const { id } = body;
  if (typeof id !== "string" || !UUID.test(id)) return null;
  const onchain = body.is_onchain_available;
  let bank: LegacyBankAccount | null = null;
  const iban = text(body.iban);
  if (body.error_bank !== true && iban !== null && isValidIban(iban)) {
    bank = {
      iban: compactIban(iban),
      holderName: text(body.owner_name),
      address: text(body.owner_address),
      addressComplement: text(body.owner_complement),
      postalCode: text(body.owner_zip),
      city: text(body.owner_city),
      country: code(body.owner_country, COUNTRY),
      transferReference: text(body.bank_reference)
    };
  }
  const email = text(body.mail);
  const migratedAt = body.migrated_at;
  return {
    id: id.toLowerCase(),
    name: text(body.name),
    // Only shown, never sent anywhere.
    email: isLegacyEmail(email) ? email : null,
    migratedAt:
      typeof migratedAt === "number" && Number.isSafeInteger(migratedAt) && migratedAt > 0
        ? migratedAt
        : null,
    currency: code(body.currency, CURRENCY),
    bankCurrency: code(body.bank_currency, CURRENCY),
    bitcoinPercent: percent(body.btc_percent),
    onchain: typeof onchain === "boolean" ? onchain : null,
    bank,
    // The current server's name first, its camelCase alias of the former one else.
    localWallets: localWalletsOf(body.verified_addresses ?? body.verifiedAddresses)
  };
}

/**
 * The v2 account of `session` (`GET /account` with the session alone: with an API key too, the
 * server would answer the till's few fields). `refused` when the session's token is no longer
 * valid: renew it (refreshLegacySession) and ask again.
 */
export async function fetchLegacyAccount(
  session: LegacySession,
  options: LegacyServerOptions = {}
): Promise<LegacyAccount> {
  const path = "/account";
  const { status, body } = await request(
    path,
    { method: "GET", headers: { Authorization: `Bearer ${session.authToken}` } },
    options
  );
  if (status !== 200) throw refusal(status, path);
  const account = parseLegacyAccount(body);
  if (!account) throw new LegacyServerError("invalidResponse", `${path}: out of shape`);
  return account;
}

/** What the v2 server's index of the chain holds for one of the v2 app's wallets. Exact, in sats. */
export type LegacyWalletBalance = {
  confirmedSats: bigint;
  /** Signed: a spend waiting in the mempool of a confirmed coin makes it negative. */
  unconfirmedSats: bigint;
  /** False when the server's scan stopped on a bound: the figures are a minimum then. */
  complete: boolean;
};

/**
 * The v2 server reads its index for a scan of 500 addresses per chain within its route's 20 s:
 * more than the other routes' timeout.
 */
const BALANCE_TIMEOUT_MS = 25_000;

/**
 * The balance of an account public key on the v2 server (`GET /v1/accounts/xpub-balance`,
 * anonymous, as the v2 app asks it before any session: no token goes with it), from the v2
 * server's own index of the chain, its gap limit the v2 app's (20). Rejects LegacyServerError
 * `network` on any failure (the server answers 503 when its index does not).
 */
export async function fetchLegacyWalletBalance(
  key: string,
  options: LegacyServerOptions = {}
): Promise<LegacyWalletBalance> {
  const path = "/v1/accounts/xpub-balance";
  const { status, body } = await request(
    `${path}?xpub=${encodeURIComponent(key)}`,
    { method: "GET" },
    { timeoutMs: BALANCE_TIMEOUT_MS, ...options }
  );
  if (status !== 200) throw new LegacyServerError("network", `${path}: HTTP ${status}`);
  if (!isObject(body)) throw new LegacyServerError("invalidResponse", `${path}: out of shape`);
  const { confirmed_sat: confirmed, unconfirmed_sat: unconfirmed, complete } = body;
  if (
    typeof confirmed !== "number" ||
    !Number.isSafeInteger(confirmed) ||
    confirmed < 0 ||
    typeof unconfirmed !== "number" ||
    !Number.isSafeInteger(unconfirmed) ||
    typeof complete !== "boolean"
  ) {
    throw new LegacyServerError("invalidResponse", `${path}: out of shape`);
  }
  return { confirmedSats: BigInt(confirmed), unconfirmedSats: BigInt(unconfirmed), complete };
}

/** The `error` key of a refusal (`{ "error": "<key>" }`, the v2 server's ApiError), if any. */
function errorKey(body: unknown): string | null {
  return isObject(body) && typeof body.error === "string" ? body.error : null;
}

/**
 * Asks the v2 server to e-mail the owner of `email` a link to choose a new password
 * (`POST /v1/auth/reset-password/request`), the link to this app's "New password"
 * (`target`, src/app/migration/password.tsx): the v2 server builds it from its own setting, never
 * from anything sent. It answers the same for an e-mail it does not know (no account is revealed):
 * resolving says the request was taken, not that an e-mail left. `rejected` for an e-mail out of
 * its rules. `lang`: the e-mail's language, two letters.
 */
export async function requestLegacyPasswordReset(
  email: string,
  lang: string,
  options: LegacyServerOptions = {}
): Promise<void> {
  const path = "/v1/auth/reset-password/request";
  const { status } = await request(
    path,
    { method: "POST", body: { email, lang, target: "sattleme" } },
    options
  );
  if (status === 204 || status === 200) return;
  if (status === 400) throw new LegacyServerError("rejected", `${path}: refused`);
  throw new LegacyServerError("network", `${path}: HTTP ${status}`);
}

/**
 * Sets the new password of the account whose reset link holds `code` (`POST /v1/auth/reset-password`):
 * the v2 server then closes every session of that account. `expired` for a link no longer valid
 * (used, an hour past, unknown), `rejected` for a password out of its rules (PASSWORD_RULES).
 */
export async function resetLegacyPassword(
  code: string,
  newPassword: string,
  options: LegacyServerOptions = {}
): Promise<void> {
  const path = "/v1/auth/reset-password";
  const { status, body } = await request(
    path,
    { method: "POST", body: { id: code, new_password: newPassword } },
    options
  );
  if (status === 204 || status === 200) return;
  if (status === 400) {
    const key = errorKey(body);
    if (key === "code_invalid_or_expired" || key === "invalid_id") {
      throw new LegacyServerError("expired", `${path}: link no longer valid`);
    }
    throw new LegacyServerError("rejected", `${path}: refused`);
  }
  throw new LegacyServerError("network", `${path}: HTTP ${status}`);
}

/**
 * The v2 server's rules for a new password: checked here first, so that the owner sees which one
 * is missing.
 */
export const PASSWORD_RULES = {
  minLength: 8,
  maxLength: 256,
  letter: /[a-zA-Z]/,
  digit: /[0-9]/
} as const;

/** Which of the v2 server's rules `password` meets (PASSWORD_RULES). */
export function passwordChecks(password: string): {
  length: boolean;
  letter: boolean;
  digit: boolean;
} {
  return {
    length:
      password.length >= PASSWORD_RULES.minLength && password.length <= PASSWORD_RULES.maxLength,
    letter: PASSWORD_RULES.letter.test(password),
    digit: PASSWORD_RULES.digit.test(password)
  };
}

/**
 * What became of the v2 account's bitcoin in the migration's call:
 * `sent`, paid out over Lightning to the new account's address (or nothing to pay); `pending`, not
 * paid in the call (failed, deferred by a sale just settled, held, busy): the v2 server's 0:00 UTC
 * run pays it, every night until it is; `none`, nothing was owed and nothing ever left for it
 * ("No balance to transfer", never "gone").
 */
export type LegacyPayout = "sent" | "pending" | "none";

/**
 * The migration's call pays out in it: the v2 server cuts a call at 20 s, past which it answers
 * 500 (the payment then settled by its own rails). Long enough to hear that answer.
 */
const MIGRATE_TIMEOUT_MS = 25_000;

/**
 * Migrates the v2 account of `session` to sattle.me (`POST /v1/accounts/migrate`): from now on it
 * takes no payment (its open invoices cancelled, none created, its
 * Lightning address refused), and what it still owes its owner in bitcoin is paid out to
 * `lightningAddress`, the new account's, over Lightning in this very call (`payout`), else by the v2
 * server's 0:00 UTC run, whatever its payout settings said; what settles later is forwarded as it
 * settles. A cut call (500, a timeout) is asked again: the same address answers the same, and the
 * v2 server never pays twice. Asked again with the same address, it answers the same; `conflict` once
 * it was migrated to another address (a second account never takes the money); `refused` when the
 * session's token expired (renew it, refreshLegacySession, and ask again); `rejected` for an
 * account its compliance suspended; `network` too when it could not check the address (400).
 */
export async function migrateLegacyAccount(
  session: LegacySession,
  lightningAddress: string,
  options: LegacyServerOptions = {}
): Promise<{ payout: LegacyPayout }> {
  const path = "/v1/accounts/migrate";
  const { status, body } = await request(
    path,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${session.authToken}` },
      body: { lightning_address: lightningAddress }
    },
    { timeoutMs: MIGRATE_TIMEOUT_MS, ...options }
  );
  if (status === 200) {
    if (!isObject(body) || body.migrated !== true) {
      throw new LegacyServerError("invalidResponse", `${path}: out of shape`);
    }
    // "sent" or "none" only when the v2 server says so: anything else is what its 0:00 run pays.
    const payout = body.payout === "sent" || body.payout === "none" ? body.payout : "pending";
    return { payout };
  }
  if (status === 409) throw new LegacyServerError("conflict", `${path}: migrated elsewhere`);
  // 403: an account the v2 service suspended (`account_suspended`), which only its support settles.
  if (status === 403) throw new LegacyServerError("rejected", `${path}: refused`);
  // 400 `invalid_lightning_address`: also what the v2 server answers when the address's LNURL
  // server did not answer it in time. The address is this app's own: tried again, never taken
  // as final.
  if (status === 400) throw new LegacyServerError("network", `${path}: address not checked`);
  throw refusal(status, path);
}
