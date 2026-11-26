import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";

import { LEGACY_CARD_RESET_TIMEOUT_MS } from "@/config/card";
import { request, type LegacyServerOptions } from "@/lib/legacy-v2/server";

/*
 * The v2 server's reset of a v2 card (`POST /v1/card-reset/…`): the server holds the three v2
 * keys, the phone only relays bytes between the card and these four routes. The keys never reach
 * the app (inlined in it, they would be readable by whoever had a build carrying them).
 *
 *   start      the tap the card mirrors (`p`, `c`), checked with the v2 SDM keys BEFORE any
 *              key is tried on the card (it counts failed authentications); `uid`, when the app
 *              expects a given card, has the tap of any other refused there;
 *   challenge  the card's AuthenticateEV2First challenge, answered with the v2 master key;
 *   open       the card's answer, proof it holds that key; the GetCardUID command for the session;
 *   finish     GetCardUID's answer: `identify` gives the card's UID and whether its v2 card is
 *              already closed; `wipe` closes the v2 card (on a balance of zero), then gives the
 *              ChangeKey commands that blank its keys, encrypted for the session.
 *
 * Answers are untrusted: every field is checked, one out of shape is CardResetError
 * "invalidResponse". Nothing here is logged: the codes say what went wrong.
 */

export type CardResetErrorCode =
  /** The tap verified with no v2 key (another issuer's card), or is not the expected card's. */
  | "tapInvalid"
  /** A v2-programmed card that no v2 account holds. */
  | "notFound"
  /** The card did not prove it holds the v2 master key. */
  | "notAuthenticated"
  /** GetCardUID's answer is not the authenticated card's, or not the tap's card. */
  | "responseInvalid"
  /** The v2 card is locked by its holder or banned: it does not migrate. */
  | "disabled"
  /** The v2 card still holds a balance (a sat or more): it was not closed. */
  | "balanceNotEmpty"
  /** A payment of the v2 card is in flight: it was not closed. */
  | "paymentPending"
  /** The session expired, or a step was played twice: start again from the tap. */
  | "sessionLost"
  /** The server has no v2 keys: card migration is off there. */
  | "notConfigured"
  /** No answer, a timeout, or an error of the server's own: try again. */
  | "unavailable"
  /** An answer out of shape. */
  | "invalidResponse";

export class CardResetError extends Error {
  readonly code: CardResetErrorCode;

  constructor(code: CardResetErrorCode, message: string) {
    super(message);
    this.name = "CardResetError";
    this.code = code;
  }
}

/** A native command the server computed for the card's session: its code and data. */
export type ResetCommand = { ins: number; data: Uint8Array };

const HEX = /^[0-9a-fA-F]*$/;

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hexOf(value: unknown, bytes: number | null): string | null {
  if (typeof value !== "string" || !HEX.test(value)) return null;
  if (bytes !== null ? value.length !== bytes * 2 : value.length === 0 || value.length % 2) {
    return null;
  }
  return value;
}

function commandOf(value: unknown): ResetCommand | null {
  if (!isObject(value)) return null;
  const { ins, data } = value;
  // A native command fits a short APDU: 255 bytes of data at most.
  const hex = hexOf(data, null);
  if (typeof ins !== "number" || !Number.isInteger(ins) || ins < 0 || ins > 0xff) return null;
  if (hex === null || hex.length > 510) return null;
  return { ins, data: hexToBytes(hex) };
}

/** The server's refusals, by its error code; anything else is "unavailable" (try again). */
const REFUSALS: Record<string, CardResetErrorCode> = {
  card_tap_invalid: "tapInvalid",
  card_not_found: "notFound",
  card_not_authenticated: "notAuthenticated",
  card_response_invalid: "responseInvalid",
  card_disabled: "disabled",
  card_balance_not_empty: "balanceNotEmpty",
  card_payment_pending: "paymentPending",
  card_reset_session_not_found: "sessionLost",
  card_reset_not_configured: "notConfigured"
};

async function post(
  step: "start" | "challenge" | "open" | "finish",
  body: Record<string, unknown>,
  options: LegacyServerOptions
): Promise<unknown> {
  let answer: { status: number; body: unknown };
  try {
    answer = await request(
      `/v1/card-reset/${step}`,
      { method: "POST", body },
      { timeoutMs: LEGACY_CARD_RESET_TIMEOUT_MS, ...options }
    );
  } catch {
    throw new CardResetError("unavailable", `card-reset ${step}: no answer`);
  }
  if (answer.status === 200) return answer.body;
  const error = isObject(answer.body) ? answer.body.error : undefined;
  const code = typeof error === "string" ? REFUSALS[error] : undefined;
  throw new CardResetError(code ?? "unavailable", `card-reset ${step}: HTTP ${answer.status}`);
}

function invalid(step: string): CardResetError {
  return new CardResetError("invalidResponse", `card-reset ${step}: answer out of shape`);
}

/** Opens a session from the card's tap; `uid` (7 bytes, hex), the card the app expects. */
export async function startCardReset(
  tap: { p: string; c: string; uid?: string },
  options: LegacyServerOptions = {}
): Promise<string> {
  const body = await post(
    "start",
    { p: tap.p, c: tap.c, ...(tap.uid !== undefined ? { uid: tap.uid } : {}) },
    options
  );
  const session = isObject(body) ? hexOf(body.session, 32) : null;
  if (session === null) throw invalid("start");
  return session;
}

/** The answer to the card's challenge (E(K0, RndB), 16 bytes): 32 bytes for the card. */
export async function answerCardChallenge(
  session: string,
  challenge: Uint8Array,
  options: LegacyServerOptions = {}
): Promise<Uint8Array> {
  const body = await post("challenge", { session, challenge: bytesToHex(challenge) }, options);
  const answer = isObject(body) ? hexOf(body.answer, 32) : null;
  if (answer === null) throw invalid("challenge");
  return hexToBytes(answer);
}

/** The card's answer (32 bytes) checked by the server: the GetCardUID command for the session. */
export async function openCardSession(
  session: string,
  cardAnswer: Uint8Array,
  options: LegacyServerOptions = {}
): Promise<ResetCommand> {
  const body = await post("open", { session, card_answer: bytesToHex(cardAnswer) }, options);
  const command = isObject(body) ? commandOf(body.command) : null;
  if (command === null) throw invalid("open");
  return command;
}

export type IdentifiedCard = { uid: string; closed: boolean };

/** GetCardUID's answer (24 bytes): the card's UID (lowercase hex), and whether it is closed. */
export async function identifyCard(
  session: string,
  response: Uint8Array,
  options: LegacyServerOptions = {}
): Promise<IdentifiedCard> {
  const body = await post(
    "finish",
    { session, response: bytesToHex(response), action: "identify" },
    options
  );
  const uid = isObject(body) ? hexOf(body.uid, 7) : null;
  if (uid === null || !isObject(body) || typeof body.closed !== "boolean") {
    throw invalid("finish");
  }
  return { uid: uid.toLowerCase(), closed: body.closed };
}

export type CardWipe = { uid: string; commands: ResetCommand[] };

/**
 * GetCardUID's answer (24 bytes): the v2 card closed for good, and the ChangeKey commands that blank
 * the card's keys, in the order the card takes them (K1, K2, then the master key, which ends the
 * session).
 */
export async function wipeCardKeys(
  session: string,
  response: Uint8Array,
  options: LegacyServerOptions = {}
): Promise<CardWipe> {
  const body = await post(
    "finish",
    { session, response: bytesToHex(response), action: "wipe" },
    options
  );
  if (!isObject(body)) throw invalid("finish");
  const uid = hexOf(body.uid, 7);
  const commands = Array.isArray(body.commands) ? body.commands.map(commandOf) : null;
  if (
    uid === null ||
    commands === null ||
    commands.length < 1 ||
    commands.length > 3 ||
    commands.some((command) => command === null || command.ins !== 0xc4)
  ) {
    throw invalid("finish");
  }
  return { uid: uid.toLowerCase(), commands: commands as ResetCommand[] };
}
