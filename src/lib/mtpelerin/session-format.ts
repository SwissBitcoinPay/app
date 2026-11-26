import { isMtpEnvironment, type MtpEnvironment } from "./environment";

/*
 * What this device keeps of Mt Pelerin (session-store.ts, session-store.web.ts): the refresh token
 * of the session (a credential, treated as one) and the 1-sat invoices paid, for the open
 * account only (its wallet id). The account's other devices get the same through the relays
 * (shared-session.ts), merged with this copy (session-sync.ts). Pure.
 */

/**
 * IRREVERSIBLE: the secure store's key of the record. Never rename it: installed apps keep their
 * session there, and "Log out" removes it (wipeDevice, src/features/settings/device-wipe.ts).
 */
export const MTPELERIN_SESSION_KEY = "mtpelerin-session";

/** Format of the record. A change of format needs a new version and a migration. */
export const MTPELERIN_SESSION_VERSION = 1;

/** A 1-sat invoice paid from the account's wallet, for the Lightning account `accountId`. */
export type PaidValidation = { accountId: string; paidAt: number };

/** The session as the account's devices share it (shared-session.ts), and as each one keeps it. */
export type MtpSessionState = {
  /** Null: none, or "Log out of Mt Pelerin" (the paid invoices stay). */
  refreshToken: string | null;
  /**
   * Unix seconds: when a device of the account got this token (a login, a rotation) or
   * dropped it ("Log out of Mt Pelerin"); 0 for never. The latest wins between devices.
   */
  sessionAt: number;
  paidValidations: PaidValidation[];
};

export type MtpDeviceRecord = MtpSessionState & {
  /** The account it belongs to: another account's session is never used. */
  walletId: string;
  /** The Mt Pelerin it is a session of (environment.ts): another one's is never sent. */
  environment: MtpEnvironment;
  /**
   * A change of this device (its token, an invoice paid) not taken by a majority of the relays
   * yet: shared at the flow's next opening. A token refused only here is never shared (its drop
   * could log out the device that holds the next one).
   */
  unshared: boolean;
};

/** At most this many paid invoices kept, the newest: one per account, a few accounts at most. */
export const MAX_PAID = 8;

/** A record of a newer app's format: never written over (staging gets OTA rollbacks). */
export class NewerMtpSessionError extends Error {
  constructor() {
    super("The Mt Pelerin session was saved by a newer app");
    this.name = "NewerMtpSessionError";
  }
}

function isPaid(value: unknown): value is PaidValidation {
  if (value === null || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.accountId === "string" &&
    /^[A-Za-z0-9-]{1,128}$/.test(v.accountId) &&
    typeof v.paidAt === "number" &&
    Number.isSafeInteger(v.paidAt) &&
    v.paidAt > 0
  );
}

/** Unix seconds, as `sessionAt`: a whole number from 0. */
function isSeconds(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/** `value`'s token and its date, its paid invoices (the newest MAX_PAID), null when invalid. */
export function readSessionState(value: Record<string, unknown>): MtpSessionState | null {
  const { refreshToken, sessionAt, paidValidations } = value;
  if (refreshToken !== null && (typeof refreshToken !== "string" || refreshToken === "")) {
    return null;
  }
  if (!isSeconds(sessionAt)) return null;
  if (!Array.isArray(paidValidations) || !paidValidations.every(isPaid)) return null;
  return { refreshToken, sessionAt, paidValidations: newestPaid(paidValidations) };
}

/** The newest MAX_PAID of `paid`, oldest first. */
function newestPaid(paid: readonly PaidValidation[]): PaidValidation[] {
  return [...paid].sort((a, b) => a.paidAt - b.paidAt).slice(-MAX_PAID);
}

/** Both lists' invoices, one per account: its latest payment. */
export function mergePaid(
  a: readonly PaidValidation[],
  b: readonly PaidValidation[]
): PaidValidation[] {
  const byAccount = new Map<string, PaidValidation>();
  for (const paid of [...a, ...b]) {
    const known = byAccount.get(paid.accountId);
    if (!known || paid.paidAt > known.paidAt) byAccount.set(paid.accountId, paid);
  }
  return newestPaid([...byAccount.values()]);
}

/**
 * The stored record: null when absent or damaged, "newer" for a newer format (never written
 * over, NewerMtpSessionError).
 */
export function parseMtpSession(text: string | null): MtpDeviceRecord | null | "newer" {
  if (text === null) return null;
  try {
    const value = JSON.parse(text) as Record<string, unknown> | null;
    if (value === null || typeof value !== "object") return null;
    if (typeof value.version === "number" && value.version > MTPELERIN_SESSION_VERSION) {
      return "newer";
    }
    if (value.version !== MTPELERIN_SESSION_VERSION) return null;
    const { walletId, environment, unshared } = value;
    if (typeof walletId !== "string" || !/^[0-9a-f]{66}$/i.test(walletId)) return null;
    if (!isMtpEnvironment(environment) || typeof unshared !== "boolean") return null;
    const state = readSessionState(value);
    return state && { walletId, environment, unshared, ...state };
  } catch {
    return null;
  }
}

export function serializeMtpSession(record: MtpDeviceRecord): string {
  return JSON.stringify({
    version: MTPELERIN_SESSION_VERSION,
    walletId: record.walletId,
    environment: record.environment,
    refreshToken: record.refreshToken,
    sessionAt: record.sessionAt,
    paidValidations: newestPaid(record.paidValidations),
    unshared: record.unshared
  });
}

/** The session's owner: an account, at one Mt Pelerin. */
export type MtpSessionOwner = { walletId: string; environment: MtpEnvironment };

/** `owner`'s record when there is none yet. */
export function emptyMtpSession({ walletId, environment }: MtpSessionOwner): MtpDeviceRecord {
  return {
    walletId,
    environment,
    refreshToken: null,
    sessionAt: 0,
    paidValidations: [],
    unshared: false
  };
}

/** Whether `record` is `owner`'s: wallet ids compared without their case. */
export function isRecordOf(
  record: MtpDeviceRecord | null,
  { walletId, environment }: MtpSessionOwner
): record is MtpDeviceRecord {
  return (
    record !== null &&
    record.walletId.toLowerCase() === walletId.toLowerCase() &&
    record.environment === environment
  );
}
