/*
 * Why a call to Mt Pelerin failed, as the flow tells it. Its message is
 * plain words and its `code` its kind: the app's journal (src/lib/log/) keeps nothing else of it.
 * Never a token, an SMS code, a phone number, a path with an id nor what the server wrote.
 */

export type MtpErrorKind =
  /** No answer: offline, the connection cut, a timeout. Tried again, nothing is decided. */
  | "offline"
  /** 401 with `exp: "token expired"`: refreshed, then the call is tried again. */
  | "tokenExpired"
  /** Another 401: the token, or a refresh token, is refused. */
  | "unauthorized"
  /** 403 ("Device registration expired, register the device again"). */
  | "forbidden"
  /** 404: `findOne` without a profile yet, an order it does not know. */
  | "notFound"
  /** 409: the profile exists, "Duplicate account". */
  | "conflict"
  /** Any other 4xx (400, 422): the request was refused. */
  | "refused"
  /** 5xx. */
  | "server"
  /** An answer the guards refuse (guards.ts): never used as it is. */
  | "malformed";

/**
 * Where a call failed, for support: the API's method (`listAccounts`, api.ts) and, for an answer
 * the guards refused, the field they could not read (`owner_lastname`, guards.ts). Names of the
 * code's own, never a value: the journal keeps them (src/lib/log/entry.ts, an error's causes).
 */
export type MtpErrorPlace = { call?: string | null; field?: string | null };

/**
 * A place of a MtPelerinError as the journal reads an error's cause: its kind (`MtpCall`,
 * `MtpField`) and its code (the call's or the field's name). Nothing else: no message.
 */
export class MtpErrorPart extends Error {
  readonly code: string;

  constructor(kind: "MtpCall" | "MtpField", code: string, cause: MtpErrorPart | null = null) {
    super("");
    this.name = kind;
    this.code = code;
    // By hand, not through the ES2022 option of Error: no reliance on the JS engine (as WalletError).
    if (cause !== null) this.cause = cause;
  }
}

export class MtPelerinError extends Error {
  readonly code: MtpErrorKind;
  /** The HTTP status, null without an answer. */
  readonly status: number | null;
  /**
   * What the server named ("Duplicate account", "token expired"), lowercase, to tell 409s and
   * 401s apart: kept off the message, so off the journal.
   */
  readonly reason: string | null;
  /** The API's method that failed (api.ts), null when not told. */
  readonly call: string | null;
  /** The field of the answer the guards could not read (guards.ts), null when not told. */
  readonly field: string | null;

  constructor(
    code: MtpErrorKind,
    status: number | null = null,
    reason: string | null = null,
    { call = null, field = null }: MtpErrorPlace = {}
  ) {
    super(MESSAGES[code]);
    this.name = "MtPelerinError";
    this.code = code;
    this.status = status;
    this.reason = reason;
    this.call = call;
    this.field = field;
    // The journal describes an error's causes (kind and code): the call, then the field.
    const fieldPart = field === null ? null : new MtpErrorPart("MtpField", field);
    const place = call === null ? fieldPart : new MtpErrorPart("MtpCall", call, fieldPart);
    if (place !== null) this.cause = place;
  }
}

/**
 * `error` with `place` told where it does not tell it already: the same error otherwise (its
 * code, status and reason kept). Anything but a MtPelerinError is returned as it is.
 */
export function placed(error: unknown, place: MtpErrorPlace): unknown {
  if (!(error instanceof MtPelerinError)) return error;
  const call = error.call ?? place.call ?? null;
  const field = error.field ?? place.field ?? null;
  if (call === error.call && field === error.field) return error;
  return new MtPelerinError(error.code, error.status, error.reason, { call, field });
}

const MESSAGES: Record<MtpErrorKind, string> = {
  offline: "Mt Pelerin could not be reached",
  tokenExpired: "The access token to Mt Pelerin expired",
  unauthorized: "Mt Pelerin refused the session",
  forbidden: "Mt Pelerin refused the device",
  notFound: "Mt Pelerin has no such entry",
  conflict: "Mt Pelerin has such an entry already",
  refused: "Mt Pelerin refused the request",
  server: "Mt Pelerin failed",
  malformed: "Mt Pelerin gave an unreadable answer"
};

/** Whether `error` is a MtPelerinError of `code`. */
export function isMtpError(error: unknown, code?: MtpErrorKind): error is MtPelerinError {
  return error instanceof MtPelerinError && (code === undefined || error.code === code);
}

/**
 * Mt Pelerin's refusal of a bank account's change (api.ts `updateBankAccount`): the account is as
 * it was, nothing to try again. Offline, a 5xx or an unreadable answer are not.
 */
export function isAccountRefusal(error: unknown): boolean {
  return (
    isMtpError(error, "forbidden") ||
    isMtpError(error, "refused") ||
    isMtpError(error, "notFound") ||
    isMtpError(error, "conflict")
  );
}

/** A second attempt returns HTTP 409 `Duplicate account`. */
export function isDuplicateAccount(error: unknown): boolean {
  return isMtpError(error, "conflict") && error.reason?.includes("duplicate account") === true;
}
