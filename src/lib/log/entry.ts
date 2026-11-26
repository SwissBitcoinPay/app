/*
 * An entry of the app's journal (journal.ts, log.ts): what happened on this device, for support
 * ("Contact support"). Technical events
 * only: the code's own texts, the kinds and codes of errors, their messages when they are plain
 * words. Never an amount, an address, an invoice, a key, a link nor a host; names and identifiers
 * kept out as far as their words show them (safeText). A text that could hold one is left out
 * whole, never cut or masked. Pure.
 */

export type LogLevel = "info" | "warning" | "error";

export type LoggedError = {
  /** Its kind: its `name` ("TypeError", "WalletError"). */
  kind: string;
  /** Its own code ("requestFailed"), when it has one. */
  code: string | null;
  /** Its message when it is plain words (safeText, from elsewhere), else null. */
  message: string | null;
  /** What caused it (`cause`), described the same way, MAX_CAUSES levels at most. */
  cause: LoggedError | null;
};

export type LogEntry = {
  /** When it happened (ms since the epoch, the device's clock). */
  at: number;
  level: LogLevel;
  /** What happened, a text of the code: "Syncing the team's channels failed". */
  event: string;
  error: LoggedError | null;
  /** The app's build (version, number, commit, update), on "App started" only. */
  build: string | null;
  /** How many times the same entry was left out just before this one (a burst, log.ts). */
  skipped: number;
};

/** The longest text kept: an event, a message. */
export const MAX_TEXT_LENGTH = 200;
/** Longer than this, a word is no word: a key, an address, an encoded value. */
const MAX_WORD_LENGTH = 24;
/** Below an error, the causes described (a WalletError's SDK error, its own cause…). */
const MAX_CAUSES = 3;

/*
 * A word: letters of the app's languages (Latin script, accents included), the punctuation of a
 * sentence, and at most one number (3 digits at most, the code's own texts only). No @, /, =, #,
 * %, &, +, _ nor brackets, and no dot or colon inside a word: no mail, Lightning address, host,
 * URL, scheme, path, query nor encoded value gets through. Explicit ranges, not \p{L}: Hermes'
 * support of Unicode property escapes is not relied on.
 */
const LETTER = "A-Za-zÀ-ÖØ-öø-ÿĀ-ž";
const SIGNS = "'’.,;:!?()«»\"\\-";
const WORDS = {
  elsewhere: new RegExp(`^[${LETTER}${SIGNS}]*$`),
  code: new RegExp(`^[${LETTER}${SIGNS}]*[0-9]{0,3}[${LETTER}${SIGNS}]*$`)
} as const;
/** A dot or a colon between two letters or digits: "relay.example.ch", "mailto:x", "a.b". */
const INNER_SIGN = new RegExp(`[${LETTER}0-9][.:][${LETTER}0-9]`);
const NOT_LETTER = new RegExp(`[^${LETTER}]`, "g");

/**
 * Whether a word of a text from elsewhere has the case of a technical message: lower case, or an
 * acronym ("JSON", "HTTP": 5 capitals at most), or a capital first letter for the first word
 * only. A capital elsewhere ("Alice", "Smith"), or inside a word (a token: "AbCdEf"): no.
 */
function plainCase(word: string, first: boolean): boolean {
  const letters = word.replace(NOT_LETTER, "");
  if (letters === letters.toLowerCase()) return true;
  if (letters === letters.toUpperCase()) return letters.length >= 2 && letters.length <= 5;
  const rest = letters.slice(1);
  return first && rest === rest.toLowerCase();
}

/**
 * Where a text comes from: the code's own words (an event: "Reading the LUD-21 answer failed"),
 * or elsewhere (an error's message, written by a library, a server, maybe from what someone typed):
 * no digit at all there, so no amount of any size, and no capital but the first word's, so no name.
 */
export type TextSource = "code" | "elsewhere";

/**
 * `value` when it is a text of plain words (WORDS), MAX_TEXT_LENGTH characters at most, its spaces
 * collapsed; null otherwise, whole.
 */
export function safeText(value: unknown, from: TextSource): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/\s+/g, " ").trim();
  if (text.length === 0 || text.length > MAX_TEXT_LENGTH) return null;
  const words = text.split(" ");
  for (let index = 0; index < words.length; index += 1) {
    const word = words[index]!;
    if (word.length > MAX_WORD_LENGTH || !WORDS[from].test(word) || INNER_SIGN.test(word)) {
      return null;
    }
    if (from === "elsewhere" && !plainCase(word, index === 0)) return null;
  }
  return text;
}

/**
 * An error's kind or code: one word ("TypeError", "requestFailed", "ERR_NETWORK"), 3 digits at
 * most: never an identifier nor a value.
 */
function isName(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[A-Za-z][A-Za-z0-9_-]{0,39}$/.test(value) &&
    value.replace(/[^0-9]/g, "").length <= 3
  );
}

/** A numeric code ("-1", "404"): an integer of up to 3 digits. */
function isNumericCode(value: unknown): value is string {
  return typeof value === "string" && /^-?[0-9]{1,3}$/.test(value);
}

/**
 * What the journal keeps of `error`: its kind, its code, its message when plain (`messages` false:
 * none, an error that may repeat what someone typed), its causes.
 */
export function describeError(error: unknown, messages = true, depth = 0): LoggedError | null {
  if (error === undefined || error === null) return null;
  if (typeof error !== "object" && typeof error !== "function") {
    // Something thrown that is no error: its type, and a text when it is plain words.
    return {
      kind: typeof error,
      code: null,
      message: typeof error === "string" && messages ? safeText(error, "elsewhere") : null,
      cause: null
    };
  }
  const { name, code, tag, message, cause } = error as Record<string, unknown>;
  let ownCode: string | null = null;
  if (isName(code)) ownCode = code;
  else if (typeof code === "number" && isNumericCode(String(code))) ownCode = String(code);
  // The Breez SDK's errors (uniffi) name their variant `tag`.
  else if (isName(tag)) ownCode = tag;
  return {
    kind: isName(name) ? name : "Error",
    code: ownCode,
    message: messages ? safeText(message, "elsewhere") : null,
    cause: depth < MAX_CAUSES ? describeError(cause, messages, depth + 1) : null
  };
}

const LEVELS: Record<LogLevel, true> = { info: true, warning: true, error: true };

function isLevel(value: unknown): value is LogLevel {
  // `=== true`: never a name every object inherits ("toString"…).
  return typeof value === "string" && (LEVELS as Record<string, unknown>)[value] === true;
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/** A build as appBuild writes it (lifecycle.ts): version, number, commit, variant, update. */
export function isBuild(value: unknown): value is string {
  return typeof value === "string" && /^[0-9A-Za-z .()_+-]{1,120}$/.test(value);
}

function parseError(value: unknown, depth: number): LoggedError | null | undefined {
  if (value === null) return null;
  if (depth > MAX_CAUSES || typeof value !== "object") return undefined;
  const v = value as Record<string, unknown>;
  if (!isName(v.kind)) return undefined;
  let code: string | null = null;
  if (isName(v.code) || isNumericCode(v.code)) code = v.code;
  else if (v.code !== null) return undefined;
  let message: string | null = null;
  if (typeof v.message === "string" && safeText(v.message, "elsewhere") === v.message) {
    message = v.message;
  } else if (v.message !== null) return undefined;
  const cause = parseError(v.cause, depth + 1);
  if (cause === undefined) return undefined;
  return { kind: v.kind, code, message, cause };
}

/** An entry as the journal kept it, checked whole: null for anything else. */
export function parseLogEntry(value: unknown): LogEntry | null {
  if (value === null || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (!isCount(v.at) || !isLevel(v.level) || !isCount(v.skipped)) return null;
  if (typeof v.event !== "string" || safeText(v.event, "code") !== v.event) return null;
  if (!(v.build === null || isBuild(v.build))) return null;
  const error = parseError(v.error, 0);
  if (error === undefined) return null;
  return { at: v.at, level: v.level, event: v.event, error, build: v.build, skipped: v.skipped };
}
