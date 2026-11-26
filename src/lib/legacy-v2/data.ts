import { isBip39Phrase } from "@/lib/breez/recovery-phrase";

/*
 * What the v2 app (SwissBitcoinPay/app 2.x) left on the device, read by the migration.
 * Every value is untrusted: it comes from another app, of any 2.x
 * version, and is checked whole before use; a value out of shape is taken as absent.
 *
 * The v2 app kept each value under its own name (`src/config/settingsKeys.ts` there, and
 * `tb_tokens` of its API client), in the keychain since 2.0.0 (react-native-keychain, service =
 * the name). Read only: the names are the v2 app's, never written by this app.
 */

/** The names the v2 app stored its values under (SwissBitcoinPay/app). */
export const LEGACY_KEYS = {
  /** "admin" | "wallet" (the owner) | "employee" (a till activated by QR code). */
  userType: "settings.userType",
  /** The account as the v2 server last answered `GET /account` (JSON). */
  accountConfig: "settings.accountConfig",
  /** The v2 server's session (TrailBase's tokens, JSON), since 2.7.0. */
  tokens: "tb_tokens",
  /** The 12 words of the wallet created in the v2 app, behind the device's biometrics. */
  mnemonic: "settings.wallet.mnemonicWords"
} as const;

/** Who used the v2 app on this device. */
export type LegacyRole = "owner" | "employee";

/**
 * The role of `settings.userType`: "admin" (logged in by e-mail) and "wallet" (by a signature)
 * are the owner; "employee" a till. Anything else: null.
 */
export function parseLegacyRole(value: string | null): LegacyRole | null {
  if (value === "admin" || value === "wallet") return "owner";
  if (value === "employee") return "employee";
  return null;
}

/** What the migration takes from the v2 app's copy of the account. */
export type LegacyAccountCopy = {
  /** The v2 account's id (a UUID, lowercase). */
  id: string;
  /** The business name, trimmed; null when empty. */
  name: string | null;
  /** ISO 4217 code of the v2 point of sale's currency; null when out of shape. */
  currency: string | null;
  /** Whether the v2 point of sale offered on-chain payments; null when unsaid. */
  onchain: boolean | null;
  /**
   * The e-mail the owner logs in to the v2 account with (`mail`): the account's card shows it and
   * the password goes with it (LegacyPasswordForm.tsx); null when absent or out of shape. Never
   * sent unless its owner sends their password.
   */
  email: string | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CURRENCY = /^[A-Z]{3}$/;
/** An e-mail as the v2 server keeps it (lowercase, one `@`). */
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}$/;
/** A name longer than this is no business name the v2 app took (its fields stop far below). */
const MAX_NAME_LENGTH = 200;

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseJson(text: string | null): unknown {
  if (text === null) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

/** A field the v2 app wrote in snake_case (2.7, the current server) or camelCase (before). */
function field(value: Record<string, unknown>, snake: string, camel: string): unknown {
  return value[snake] !== undefined ? value[snake] : value[camel];
}

/** Whether `value` is an e-mail as the v2 server keeps it (EMAIL). */
export function isLegacyEmail(value: unknown): value is string {
  return typeof value === "string" && EMAIL.test(value);
}

/**
 * The v2 app's copy of the account (`settings.accountConfig`): the answer of `GET /account` it
 * kept, of the current server (snake_case and camelCase) or the former one (camelCase). Null
 * without an id.
 */
export function parseLegacyAccountCopy(text: string | null): LegacyAccountCopy | null {
  return legacyAccountCopyOf(parseJson(text));
}

/**
 * The same copy from a value already parsed: the v2 app's own, or the part of it a v2 web app
 * handed over (handoff.ts). Null without an id.
 */
export function legacyAccountCopyOf(value: unknown): LegacyAccountCopy | null {
  if (!isObject(value)) return null;
  const { id } = value;
  if (typeof id !== "string" || !UUID.test(id)) return null;
  const name = typeof value.name === "string" ? value.name.trim() : "";
  const currency = value.currency;
  const onchain = field(value, "is_onchain_available", "isOnchainAvailable");
  const email = typeof value.mail === "string" ? value.mail.trim() : null;
  return {
    id: id.toLowerCase(),
    name: name !== "" && name.length <= MAX_NAME_LENGTH ? name : null,
    currency: typeof currency === "string" && CURRENCY.test(currency) ? currency : null,
    onchain: typeof onchain === "boolean" ? onchain : null,
    email: isLegacyEmail(email) ? email : null
  };
}

/** The v2 server's session as the v2 app kept it (TrailBase's client: `tb_tokens`). */
export type LegacyTokens = {
  /** The session's short-lived token (a JWT, an hour on the v2 server). */
  authToken: string;
  /** What renews it (30 days on the v2 server); null when the v2 app kept none. */
  refreshToken: string | null;
};

/**
 * A token as it may go in an HTTP header: base64url, dots of a JWT, and the few characters
 * TrailBase's tokens use. Anything else (a line break, a quote) never reaches a header.
 */
const TOKEN = /^[A-Za-z0-9._~+/=-]{16,4096}$/;

/** Whether `token` may go in a header (TOKEN). */
export function isLegacyToken(token: unknown): token is string {
  return typeof token === "string" && TOKEN.test(token);
}

/** `tb_tokens`: TrailBase's `{ auth_token, refresh_token, csrf_token }`. Null when unusable. */
export function parseLegacyTokens(text: string | null): LegacyTokens | null {
  const value = parseJson(text);
  if (!isObject(value)) return null;
  const { auth_token: authToken, refresh_token: refreshToken } = value;
  if (!isLegacyToken(authToken)) return null;
  if (refreshToken !== undefined && refreshToken !== null && !isLegacyToken(refreshToken)) {
    return null;
  }
  return { authToken, refreshToken: refreshToken ?? null };
}

/**
 * The v2 wallet's words (`settings.wallet.mnemonicWords`: 12 English BIP-39 words, one space
 * between them, as the v2 app generated them), checksum included. Null otherwise: a value of
 * another shape is never taken for words.
 */
export function parseLegacyWords(text: string | null): string[] | null {
  if (text === null) return null;
  const words = text.trim().split(/\s+/);
  return words.length === 12 && isBip39Phrase(words) ? words : null;
}
