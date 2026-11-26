import { equalBytes } from "@noble/ciphers/utils.js";
import { hexToBytes } from "@noble/hashes/utils.js";

import { LEGACY_CARD_HOST } from "@/config/card";
import { lnurlToUrl } from "@/lib/lightning/lnurl";

import { NDEF_FILE_NO } from "./card-url";
import { cardIdOf } from "./keys";
import {
  CardResetError,
  answerCardChallenge,
  identifyCard,
  openCardSession,
  startCardReset,
  wipeCardKeys,
  type IdentifiedCard,
  type ResetCommand
} from "./legacy-reset";
import { CardError, type Ntag424 } from "./ntag424";
import { ZERO_KEY } from "./ntag424-sm";
import { FACTORY_FILE_SETTINGS, ResetError, blankKeyUid, readCardState } from "./program";
import { decryptPiccData, parseSunParams, verifySun, type SunParams } from "./sun";

/*
 * The gestures to migrate a v2 card to a v3 card of the open wallet (re-encoding). A v2 card
 * (the v2 app, SwissBitcoinPay/app, and its server, `api.swiss-bitcoin-pay.ch`) holds three
 * AES-128 keys: a master key (K0, NTAG 424 AppMasterKey), the PICCData encryption key (K1,
 * SDMMetaReadKey) and the SDM MAC key (K2, SDMFileReadKey). K3 and K4 are at their factory value
 * (all zeros).
 *
 * The app does NOT hold those keys: they live on the v2 server only, which checks the card's tap,
 * answers its authentication and computes the commands that blank its keys, encrypted for that one
 * session (legacy-reset.ts, the v2 server's `/v1/card-reset/…`). The app relays bytes between the
 * card and the server, and does with no key what needs none: reading the card's state, the steps
 * after its master key is blank (SDM off, file emptied), checking that it ended blank. The server
 * also closes the v2 card for good before giving the commands, on a balance of zero only.
 *
 * Not verified on a device (no card, no real funds in the container): the whole NFC exchange with
 * the server, on a real v2 card.
 */

/** A v2 card recognized through the v2 server, held to the phone: its tap and what it identifies. */
export type LegacyCard = {
  /** The LNURL-withdraw URL the card mirrors (`lnurlw://api.swiss-bitcoin-pay.ch/…?p=&c=`). */
  url: string;
  /** The tap's PICCData parameter, uppercase hex (32). */
  p: string;
  /** The tap's SDM MAC, uppercase hex (16). */
  c: string;
  /** The card's UID (7 bytes, lowercase hex), as the card told the server in a session. */
  uid: string;
  /** This wallet's id for the card (cardIdOf): the v3 card keeps it, so it keeps its wallet. */
  cardId: string;
  /**
   * Whether its v2 card is already closed for its migration (its erase begun, here or on another
   * device, then interrupted): nothing to transfer — a closed card neither pays nor is recharged.
   */
  closed?: boolean;
};

/** The URL of the one URI record of an NDEF file's first 128 bytes, or null. */
function ndefUrlOf(file: Uint8Array): string | null {
  const length = (file[0] << 8) | file[1];
  if (length < 5) return null;
  // A short URI record: D1 01 <payload length> 55 <identifier code> <URI>.
  if (file[2] !== 0xd1 || file[3] !== 0x01 || file[5] !== 0x55) return null;
  const payloadLength = file[4];
  const end = 6 + payloadLength;
  if (payloadLength < 1 || end > file.length) return null;
  // Identifier code 0: no prefix, the URL is written whole (as BoltCards write it).
  if (file[6] !== 0x00) return null;
  return String.fromCharCode(...file.subarray(7, end));
}

/** What a v2 card shows without a key: its keys' versions, its NDEF message's length and URL. */
type LegacyState = { versions: number[]; nlen: number; url: string | null };

/**
 * The card's LegacyState, selected (no authentication holds after it), as the pairing read it: one
 * read per tap while nothing changes the card (readCardState). Its file read unauthenticated, as
 * a point of sale reads it: the card mirrors a fresh `p` and `c` into it, the last of this tap.
 */
async function readLegacyState(card: Ntag424): Promise<LegacyState> {
  // The NDEF file's first 128 bytes (MAX_FILE_CONTENT), enough for the longest v2 URL.
  const { versions, file } = await readCardState(card);
  return { versions, nlen: (file[0] << 8) | file[1], url: ndefUrlOf(file) };
}

/** The tap a v2 card mirrors: its URL, `p` and `c` as uppercase hex, and both as bytes. */
type LegacyTap = { url: string; p: string; c: string; sun: SunParams };

/** The tap the card mirrors under the v2 service's URL (LEGACY_CARD_HOST); null without. */
function legacyTapOf(state: LegacyState): LegacyTap | null {
  if (state.url === null) return null;
  const parsed = lnurlToUrl(state.url);
  if (!parsed || parsed.host !== LEGACY_CARD_HOST) return null;
  const p = parsed.searchParams.get("p");
  const c = parsed.searchParams.get("c");
  const sun = parseSunParams(p, c);
  if (!p || !c || !sun) return null;
  return { url: state.url, p: p.toUpperCase(), c: c.toUpperCase(), sun };
}

/** The UID of a tap its blank keys 1 and 2 verify (an erase's, SDM still on); null otherwise. */
function blankTapUid(tap: LegacyTap): Uint8Array | null {
  return verifySun(ZERO_KEY, ZERO_KEY, tap.sun.p, tap.sun.c)?.uid ?? null;
}

/** Whether the NDEF file still holds the v2 service's URL (mirrored or not). */
function namesLegacyHost(state: LegacyState): boolean {
  const parsed = state.url === null ? null : lnurlToUrl(state.url);
  return parsed?.host === LEGACY_CARD_HOST;
}

/**
 * The card's master key opened through the v2 server, from the tap it mirrors: the session's start
 * (the tap checked BEFORE any key is tried on the card), the card's challenge answered, its answer
 * checked, then GetCardUID, whose answer is handed to `finish`. `uid`, the card the app expects:
 * the server refuses the tap of any other. Ends with whatever `finish` gives; the card's
 * authentication is left to the commands that follow, or to the next select.
 */
async function throughServer<T>(
  card: Ntag424,
  tap: { p: string; c: string },
  uid: string | undefined,
  finish: (session: string, response: Uint8Array) => Promise<T>
): Promise<T> {
  const session = await startCardReset({ ...tap, ...(uid !== undefined ? { uid } : {}) });
  const challenge = await card.beginRelayedAuthentication(0);
  const answer = await answerCardChallenge(session, challenge);
  const cardAnswer = await card.completeRelayedAuthentication(answer);
  const getUid = await openCardSession(session, cardAnswer);
  const response = await card.sendRelayed(getUid.ins, getUid.data);
  return finish(session, response);
}

/** A v2 card could not be told, or acted on, by the v2 server. */
export class LegacyServerUnavailableError extends Error {
  constructor(cause: unknown) {
    super("The v2 server could not reset the card", { cause });
    this.name = "LegacyServerUnavailableError";
  }
}

/** The v2 card is locked by its holder, or banned: it does not migrate. */
export class LegacyCardDisabledError extends Error {
  constructor(cause?: unknown) {
    super("The v2 card is locked or disabled", cause === undefined ? undefined : { cause });
    this.name = "LegacyCardDisabledError";
  }
}

/** A refusal of the server that says the card is not one it would migrate. */
const NOT_OURS = new Set(["tapInvalid", "notFound", "notAuthenticated", "responseInvalid"]);

/**
 * Whether the card held to the phone is one of the v2 cards: its mirrored tap names the v2 service
 * (LEGACY_CARD_HOST), its keys' versions are the v2 ones (K0 to K2 changed, K3 and K4 at the
 * factory's 0: the erase can clear it), and the v2 server, given its tap, finds it one of its cards,
 * opens it with the v2 master key and reads its UID. Returns the tap and the card it
 * identifies, or null (another issuer's card, or not a BoltCard, or a v2-programmed card the server
 * does not migrate): the pairing then shows the usual "this card is not blank", nothing
 * moved. A locked or banned v2 card is LegacyCardDisabledError; a server that cannot answer,
 * LegacyServerUnavailableError. With the v2 keys absent from the server (migration off there),
 * null, as before them.
 *
 * `root` is the open wallet's card root (deriveCardRoot): the UID gives the v3 card's id, so the
 * wallet the drained sats go to is the very one the re-encoded card will pay from.
 */
export async function detectLegacyCard(
  card: Ntag424,
  root: Uint8Array
): Promise<LegacyCard | null> {
  const state = await readLegacyState(card);
  const tap = legacyTapOf(state);
  if (!tap) return null;
  const { versions } = state;
  if (versions[0] === 0 || versions[1] === 0 || versions[2] === 0) return null;
  if (versions[3] !== 0 || versions[4] !== 0) return null;
  let identified: IdentifiedCard;
  try {
    identified = await throughServer(card, tap, undefined, identifyCard);
  } catch (error) {
    if (error instanceof CardResetError) {
      if (NOT_OURS.has(error.code) || error.code === "notConfigured") return null;
      if (error.code === "disabled") throw new LegacyCardDisabledError(error);
      throw new LegacyServerUnavailableError(error);
    }
    // The card refused the server's answer: its master key is not the v2 one.
    if (error instanceof CardError && error.code === "authFailed") return null;
    throw error;
  } finally {
    // Ends the authentication, whatever came of it.
    await card.selectApplication().catch(() => undefined);
  }
  const uid = hexToBytes(identified.uid);
  try {
    return {
      url: tap.url,
      p: tap.p,
      c: tap.c,
      uid: identified.uid,
      cardId: cardIdOf(root, uid),
      closed: identified.closed
    };
  } finally {
    uid.fill(0);
  }
}

/**
 * The UID of a v2 card whose erase stopped halfway, as the card tells it without any v2 key, for
 * the pairing to find its "migrating" record (v2 cards have Random ID: anticollision gives a
 * random UID). The erase blanks K1, then K2, then K0, then turns SDM off: with K1 blank, the tap it
 * still mirrors opens with the blank key (its MAC checked when K2 is blank too, else by the server
 * when the erase goes on); every key blank and SDM off, its file still holding the v2 URL, its blank
 * key 0 gives it (GetCardUID). Null for a card none of this fits — a fresh v2 card is
 * detectLegacyCard's — or whose blank key 0 is refused (another issuer's card: one failed
 * authentication, never another attempt here). Ends unauthenticated.
 */
export async function wipedLegacyUid(card: Ntag424): Promise<Uint8Array | null> {
  const state = await readLegacyState(card);
  const { versions } = state;
  if (versions[1] !== 0) return null;
  const tap = legacyTapOf(state);
  if (tap) {
    if (versions[2] !== 0) return decryptPiccData(ZERO_KEY, tap.sun.p)?.uid ?? null;
    const shown = blankTapUid(tap);
    if (shown) return shown;
    // SDM off: the file still holds the last tap mirrored, which no longer verifies.
  }
  if (!versions.every((v) => v === 0) || !namesLegacyHost(state)) return null;
  return blankKeyUid(card).catch((error: unknown) => {
    if (error instanceof ResetError && error.code === "keyRefused") return null;
    throw error;
  });
}

/** A v2 card could not be re-encoded to a blank card. */
export type LegacyWipeErrorCode =
  /** The card's master key did not open (the server's, or the blank one): nothing changed. */
  | "masterKeyRefused"
  /** The card presented is not the one being migrated (its UID differs; nothing changed). */
  | "otherCard"
  /** The card did not end up blank (a key slot the v2 programming never set still holds a key). */
  | "notBlank"
  /**
   * The v2 server refused to close the card: it still holds a balance. Nothing changed: its balance
   * is to be transferred first.
   */
  | "balanceRemains"
  /**
   * The v2 server refused to close the card: a payment of it is still in flight there (often the
   * transfer just made, which the server has not settled yet). Nothing changed: try again shortly.
   */
  | "paymentPending";

export class LegacyWipeError extends Error {
  readonly code: LegacyWipeErrorCode;

  constructor(code: LegacyWipeErrorCode, cause?: unknown) {
    super(`Legacy card wipe failed: ${code}`, cause === undefined ? undefined : { cause });
    this.name = "LegacyWipeError";
    this.code = code;
  }
}

/** The server's commands sent to the card, in order: each must be accepted (91 00). */
async function sendAll(card: Ntag424, commands: ResetCommand[]): Promise<void> {
  for (const command of commands) await card.sendRelayed(command.ins, command.data);
}

/**
 * Resets a v2 card held to the phone to a blank card (every key back to the factory zeros at
 * version 0, SDM off, the NDEF file emptied), so that programCard can then program it as a v3 card
 * of the open wallet.
 *
 * While its master key is still the v2 one, the v2 server does that part: given the tap the card
 * mirrors and the UID expected (`uidHex`: the server refuses any other card's tap before trying a
 * key), it opens the card, CLOSES its v2 card for good (on a balance of zero only:
 * LegacyWipeError "balanceRemains" otherwise, "paymentPending" while a payment of it is in flight
 * there, nothing changed in either case), and gives the ChangeKey commands
 * of the keys still to blank — K1, K2, then K0 —, which are sent as they come. The rest needs no
 * key: the blank master key opens the card, its UID read back must be the one migrated, then SDM
 * off and the file emptied. K3 and K4 must be the factory zeros already (the v2 service set
 * three): a card where they are not is refused before anything changes ("notBlank"). The card is
 * read back afterwards and must be fully blank: every key version 0 and an empty NDEF file.
 *
 * RESUMABLE, the card identifiable at every step: K1 and K2 first, SDM still on (its tap verifies
 * with the keys it holds, v2 or blank), K0 last of the keys, then SDM off and the file emptied.
 * A card pulled from the field anywhere is recognized at the next attempt (wipedLegacyUid, through
 * its "migrating" record), and this goes on from there.
 */
export async function wipeLegacyCard(card: Ntag424, uidHex: string): Promise<void> {
  const uid = hexToBytes(uidHex);
  const state = await readLegacyState(card);
  // Already blank (an earlier wipe that had ended): nothing to do.
  if (state.versions.every((v) => v === 0) && state.nlen === 0) return;
  if (state.versions[3] !== 0 || state.versions[4] !== 0) throw new LegacyWipeError("notBlank");

  if (state.versions[0] !== 0) {
    // The v2 master key still on the card: the server's part. Its tap, still mirrored (SDM
    // goes off only once every key is blank), names the card.
    const tap = legacyTapOf(state);
    if (!tap) throw new LegacyWipeError("otherCard");
    try {
      await throughServer(card, tap, uidHex, async (session, response) => {
        const wipe = await wipeCardKeys(session, response);
        if (wipe.uid !== uidHex.toLowerCase()) throw new LegacyWipeError("otherCard");
        // The keys the card's versions say are still the v2 ones, K0 last (its change ends the
        // session): a ChangeKey's first data byte is its key number, in clear. Anything else, nothing
        // is sent (the card stays as it is, closed: a later attempt goes on).
        const expected = [1, 2].filter((keyNo) => state.versions[keyNo] !== 0).concat(0);
        const keys = wipe.commands.map((command) => command.data[0]);
        if (keys.length !== expected.length || keys.some((keyNo, i) => keyNo !== expected[i])) {
          throw new CardResetError("invalidResponse", "card-reset finish: unexpected keys");
        }
        await sendAll(card, wipe.commands);
      });
    } catch (error) {
      if (error instanceof CardResetError) {
        if (
          error.code === "tapInvalid" ||
          error.code === "responseInvalid" ||
          error.code === "notFound"
        ) {
          throw new LegacyWipeError("otherCard", error);
        }
        if (error.code === "notAuthenticated") throw new LegacyWipeError("masterKeyRefused", error);
        if (error.code === "balanceNotEmpty") throw new LegacyWipeError("balanceRemains", error);
        if (error.code === "paymentPending") throw new LegacyWipeError("paymentPending", error);
        if (error.code === "disabled") throw new LegacyCardDisabledError(error);
        throw new LegacyServerUnavailableError(error);
      }
      if (error instanceof CardError && error.code === "authFailed") {
        throw new LegacyWipeError("masterKeyRefused", error);
      }
      throw error;
    }
    // Every command accepted (91 00): K1, K2 and K0 are blank now, and the server read the card's
    // UID in its session, the one expected. The blank master key opens it from here.
  } else {
    // The master key is blank: it changes last of the keys, so K1 and K2 are blank too, or the
    // card is not in a state an erase leaves.
    if (state.versions[1] !== 0 || state.versions[2] !== 0) throw new LegacyWipeError("notBlank");
    // Named before any key is tried: by the tap it still mirrors (blank keys, SDM still on), else
    // — SDM already off, its file still holding the v2 URL with the last tap mirrored, which no
    // longer verifies — by the UID its blank key 0 gives (checked below).
    const tap = legacyTapOf(state);
    const shown = tap ? blankTapUid(tap) : null;
    if (shown ? !equalBytes(shown, uid) : !namesLegacyHost(state)) {
      throw new LegacyWipeError("otherCard");
    }
  }
  try {
    await card.authenticate(0, ZERO_KEY);
  } catch (error) {
    if (error instanceof CardError && error.code === "authFailed") {
      throw new LegacyWipeError("masterKeyRefused", error);
    }
    throw error;
  }
  if (!equalBytes(await card.getCardUid(), uid)) {
    throw new LegacyWipeError("otherCard");
  }
  // SDM off (idempotent): the card stops mirroring, and the file's write access is free again.
  await card.changeFileSettings(NDEF_FILE_NO, FACTORY_FILE_SETTINGS);
  // Enough zeros to blank the record (NLEN 0 is an empty NDEF message).
  await card.writeData(NDEF_FILE_NO, 0, new Uint8Array(Math.min(128, Math.max(2, state.nlen + 2))));

  // The card must be blank now: re-read (selecting ends the authentication).
  const after = await readLegacyState(card);
  if (!after.versions.every((v) => v === 0) || after.nlen !== 0) {
    throw new LegacyWipeError("notBlank");
  }
}
