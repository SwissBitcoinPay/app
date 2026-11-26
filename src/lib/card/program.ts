import { concatBytes, equalBytes } from "@noble/ciphers/utils.js";

import {
  MAX_FILE_CONTENT,
  NDEF_FILE_NO,
  cardFileTemplate,
  holdsPlaceholders,
  isEmptyNdef,
  matchTemplate,
  relayOfCardFile,
  type CardFileTemplate
} from "./card-url";
import {
  cardEncryptionKey,
  cardIdOf,
  cardKeysOf,
  isKeyVersion,
  wipeCardKeys,
  type CardKeys
} from "./keys";
import { CardError, type Ntag424 } from "./ntag424";
import { ZERO_KEY } from "./ntag424-sm";
import { UID_LENGTH, decryptPiccData, parseSunParams, verifySun, type PiccData } from "./sun";

/*
 * Programming a blank NTAG 424 DNA as a BoltCard of the wallet, and resetting it to a blank card
 * (boltcard/docs/DETERMINISTIC.md, "How to setup a new BoltCard", "How to implement a Reset
 * feature"), over the commands of ntag424.ts.
 *
 * The app never authenticates with a key it has no reason to believe is the card's: a wrong key
 * counts against the card's failed authentications, and enough of them make it unusable
 * (DETERMINISTIC.md, AN12196 §6.4). Before programming, the card must show itself blank: every key
 * at version 0 and an empty NDEF file, or the placeholders of a card file (a programming stopped
 * before its SDM settings, for whichever relay), or this wallet's own programming, interrupted.
 * Before a reset, the card must name the expected card: by its tap (`p`, `c`), which opens and
 * verifies with the keys it holds (this wallet's, or blank ones), or, without a tap (SDM off), by
 * the UID its blank key 0 opens (GetCardUID).
 *
 * Programming turns Random ID on (boltcard/docs/CARD_PRIVACY.md "best"):
 * a point of sale, or any reader held near the card, no longer gets its UID at anticollision, a new
 * random one at each tap, and cannot tell it from one tap to the next. Its UID is only in the
 * PICCData, encrypted with K1, and told by GetCardUID to whoever holds one of its keys. It cannot be
 * undone, a reset keeps it: whoever programs the card next must read its UID with GetCardUID (as
 * DETERMINISTIC.md does), not at anticollision. So a reset never takes the tag's UID: it keeps a
 * tap on the card until every key is blank (resetCard).
 *
 * A card may leave the field at any command: both procedures go in an order whose every
 * intermediate state is recognized at the next attempt, which goes on from there
 * (card-program.test.ts interrupts them at every command).
 */

const KEY_NUMBERS = [0, 1, 2, 3, 4] as const;

function le3(value: number): Uint8Array {
  return Uint8Array.of(value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff);
}

/**
 * The NDEF file's settings of a BoltCard (data sheet §10.7.1): SDM and mirroring on,
 * CommMode.Plain; read free, write, read-write and change with key 0; UID and read counter mirrored
 * in the PICCData encrypted with key 1 at `p`, SDM MAC with key 2 at `c` over an empty input;
 * ASCII; the counter not retrievable (SDMCtrRet F), no read limit.
 */
export function boltCardFileSettings(template: CardFileTemplate): Uint8Array {
  return concatBytes(
    // FileOption: SDM and mirroring enabled (bit 6), CommMode.Plain.
    Uint8Array.of(0x40),
    // AccessRights, least significant byte first: ReadWrite 0, Change 0 | Read E, Write 0.
    Uint8Array.of(0x00, 0xe0),
    // SDMOptions: UID (bit 7) and SDMReadCtr (bit 6) mirrored, ASCII encoding (bit 0).
    Uint8Array.of(0xc1),
    // SDMAccessRights, least significant byte first: RFU F, SDMCtrRet F | SDMMetaRead 1,
    // SDMFileRead 2.
    Uint8Array.of(0xff, 0x12),
    // PICCDataOffset, SDMMACInputOffset, SDMMACOffset: the MAC of an empty input.
    le3(template.pOffset),
    le3(template.cOffset),
    le3(template.cOffset)
  );
}

/** The NDEF file's settings at delivery: no SDM, CommMode.Plain, all free but Change (key 0). */
export const FACTORY_FILE_SETTINGS = Uint8Array.of(0x00, 0xe0, 0xee);

/** What the card shows without authenticating. */
type CardState = {
  /** Versions of keys 0 to 4. */
  versions: number[];
  /** The NDEF file, as long as the longest card file: whichever relay it names. */
  file: Uint8Array;
};

/**
 * The state last read of each card in the field, with the card's count of changes then
 * (Ntag424.changes): adding a card reads it to find its record, then to reset it, then to program
 * it, a v2 card's migration to recognize it, then to erase it (legacy-card.ts), all in one tap.
 */
const readStates = new WeakMap<Ntag424, { changes: number; state: CardState }>();

/**
 * The card's state, the NDEF application selected (any authentication dropped). Read again only
 * when a command that changes the card was sent since it was last read (or its answer was lost):
 * the card in the field is the same, and nothing else changes it but its read counter, which the
 * tap read last gives as it was then.
 */
export async function readCardState(card: Ntag424): Promise<CardState> {
  await card.selectApplication();
  const known = readStates.get(card);
  if (known?.changes === card.changes) {
    return { versions: known.state.versions.slice(), file: known.state.file.slice() };
  }
  const changes = card.changes;
  const versions: number[] = [];
  for (const keyNo of KEY_NUMBERS) versions.push(await card.getKeyVersion(keyNo));
  const file = await card.readData(NDEF_FILE_NO, 0, MAX_FILE_CONTENT);
  readStates.set(card, { changes, state: { versions: versions.slice(), file: file.slice() } });
  return { versions, file };
}

export type ResetErrorCode =
  /** Not the expected card of this wallet, or not at the expected keys' version: nothing sent. */
  | "notThisCard"
  /** Its key 0 refused the key it was believed to hold: never another attempt. */
  | "keyRefused";

export class ResetError extends Error {
  readonly code: ResetErrorCode;

  constructor(code: ResetErrorCode, message: string) {
    super(message);
    this.name = "ResetError";
    this.code = code;
  }
}

/**
 * The UID of a card whose key 0 is blank by its version, proven: GetCardUID once authenticated with
 * the blank key 0, where anticollision gives a random one (Random ID); the one GetCardUID gave
 * already to this card in the field, if any (Ntag424.knownUid). A card that refuses the
 * blank key (its key 0 changed, its version left at 0) throws ResetError "keyRefused": one failed
 * authentication, never another attempt. Ends unauthenticated, the application selected again.
 */
export async function blankKeyUid(card: Ntag424): Promise<Uint8Array> {
  const known = card.knownUid;
  if (known) return known;
  try {
    await card.authenticate(0, ZERO_KEY);
  } catch (error) {
    if (error instanceof CardError && error.code === "authFailed") {
      throw new ResetError("keyRefused", "The card's key 0 is not blank");
    }
    throw error;
  }
  const uid = await card.getCardUid();
  await card.selectApplication();
  return uid;
}

/**
 * The key `keyNo` the card holds at key version `held`, as this wallet would have set it: its own
 * at `version`, a blank card's zeros at 0, null for any other version (not this wallet's doing).
 */
function heldKey(
  root: Uint8Array,
  uid: Uint8Array,
  version: number,
  keyNo: 1 | 2,
  held: number
): Uint8Array | null {
  if (held === 0) return ZERO_KEY;
  if (held !== version) return null;
  if (keyNo === 1) return cardEncryptionKey(root);
  const keys = cardKeysOf(root, uid, version);
  const key = keys.k2.slice();
  wipeCardKeys(keys);
  return key;
}

/**
 * The tap the card mirrored in its file, verified with the keys 1 and 2 it holds (heldKey). Null
 * when the file holds no tap, or one these keys do not verify.
 */
function mirroredTap(
  state: CardState,
  template: CardFileTemplate,
  root: Uint8Array,
  version: number
): PiccData | null {
  const match = matchTemplate(state.file, template);
  if (!match || match.placeholders) return null;
  const params = parseSunParams(match.p, match.c);
  if (!params) return null;
  // K1 does not depend on the UID: `p` opens first and gives it, then K2 derives from it.
  const k1 = heldKey(root, new Uint8Array(UID_LENGTH), version, 1, state.versions[1]);
  if (!k1) return null;
  const probe = decryptPiccData(k1, params.p);
  if (!probe) return null;
  const k2 = heldKey(root, probe.uid, version, 2, state.versions[2]);
  if (!k2) return null;
  return verifySun(k1, k2, params.p, params.c);
}

export type ProgramErrorCode =
  /** Not blank: another issuer's card (or one this wallet cannot tell as its own). */
  | "notBlank"
  /** This wallet's card already, programmed at another keys' version: reset it first. */
  | "ownCard"
  /** Programmed, but its tap read back is not what the keys give. */
  | "verifyFailed";

export class ProgramError extends Error {
  readonly code: ProgramErrorCode;

  constructor(code: ProgramErrorCode, message: string) {
    super(message);
    this.name = "ProgramError";
    this.code = code;
  }
}

export type ProgrammedCard = {
  /** In memory only: never stored nor sent in clear (keys.ts). */
  uid: Uint8Array;
  cardId: string;
  version: number;
  /** The read counter of the tap read back to verify the programming. */
  counter: number;
};

export type ProgramOptions = {
  /** The wallet's card root (deriveCardRoot). */
  root: Uint8Array;
  /** The relay written into the card (canonical). */
  relayHost: string;
  /**
   * The keys' version to program: one more than any this card had with this wallet. A function of
   * the card's UID when it depends on the card (its record), called once the UID is known: read
   * from a tap the card mirrors (`found` "tap": this wallet's programming, ended or interrupted, or
   * none of its), or from GetCardUID on a blank card (`found` "blank": a new programming).
   */
  version: number | ((uid: Uint8Array, found: "tap" | "blank") => number);
};

/** The UID inside the tap the card mirrors, opened with the K1 it holds (this wallet's or zeros). */
function mirroredUid(state: CardState, template: CardFileTemplate, root: Uint8Array) {
  const match = matchTemplate(state.file, template);
  if (!match || match.placeholders) return null;
  const params = parseSunParams(match.p, match.c);
  if (!params) return null;
  const k1 = state.versions[1] === 0 ? ZERO_KEY : cardEncryptionKey(root);
  return decryptPiccData(k1, params.p)?.uid ?? null;
}

/** This wallet's card at its own keys of one version (ownCardOf). */
export type OwnCard = {
  /** In memory only: never stored nor sent in clear (keys.ts). */
  uid: Uint8Array;
  cardId: string;
  version: number;
  /** The relay its file names. */
  relayHost: string;
  /** The read counter of the tap it mirrored. */
  counter: number;
};

/**
 * Whether the card held to the phone is this wallet's, at its own keys of one version: every key
 * at the same version, one of this wallet's, and the tap it mirrors verifying with them (its MAC
 * with the K2 of its UID: only a card holding this wallet's keys makes it), whichever relay its
 * file names. Null otherwise. Reads only.
 */
export async function ownCardOf(card: Ntag424, root: Uint8Array): Promise<OwnCard | null> {
  const state = await readCardState(card);
  const held = state.versions[0];
  if (!isKeyVersion(held) || !state.versions.every((v) => v === held)) return null;
  const host = relayOfCardFile(state.file);
  const tap = host === null ? null : mirroredTap(state, cardFileTemplate(host), root, held);
  if (!tap || host === null) return null;
  return {
    uid: tap.uid,
    cardId: cardIdOf(root, tap.uid),
    version: held,
    relayHost: host,
    counter: tap.counter
  };
}

/**
 * The UID by which to pick the record of the card held to the phone: the tag's from anticollision
 * when it is a 7-byte one (no Random ID; unproven), else the one in the tap the card mirrors,
 * opened with the K1 it holds (this wallet's or a blank one; unverified), whichever relay its file
 * names, else, its key 0 blank and its file empty or holding placeholders (as resetCard and
 * programCard take a card without a tap), its own (blankKeyUid: ResetError "keyRefused" when the
 * card refuses that key, never tried again). Null when none tells it: a file holding anything else
 * is another issuer's, whose key 0 is never tried. Only to pick a record: resetCard and programCard
 * check the card before changing anything on it. Sends reads only, and the blank key 0's
 * authentication.
 */
export async function shownCardUid(
  card: Ntag424,
  root: Uint8Array,
  tagUid: Uint8Array | null
): Promise<Uint8Array | null> {
  if (tagUid?.length === UID_LENGTH) return tagUid;
  const state = await readCardState(card);
  const host = relayOfCardFile(state.file);
  const tapped = host === null ? null : mirroredUid(state, cardFileTemplate(host), root);
  if (tapped) return tapped;
  const untapped = isEmptyNdef(state.file) || holdsPlaceholders(state.file);
  return untapped && state.versions[0] === 0 ? blankKeyUid(card) : null;
}

/**
 * Programs a blank card, then reads a tap back and checks it with the new keys. Goes on with this
 * wallet's programming of the card at `version` when an earlier attempt was interrupted, and gives
 * the card back as is when that attempt had ended but for its check.
 *
 * Order, as the reference programmer (bolt-nfc-android-app) does on real cards: the NDEF file with
 * placeholders (free write on a blank card), AuthenticateEV2First with the blank key 0, GetCardUID,
 * Random ID (unless GetVersion says it is on already: a card programmed again, or an attempt that
 * stopped after it), the SDM settings, keys 1 to 4, key 0 last (which ends the authentication),
 * then an unauthenticated read, which the card mirrors. Random ID comes once the card is shown to
 * be the one expected (`version`), before anything else changes on it.
 */
export async function programCard(card: Ntag424, options: ProgramOptions): Promise<ProgrammedCard> {
  const { root, relayHost } = options;
  const versionOf = (uid: Uint8Array, found: "tap" | "blank") => {
    const version =
      typeof options.version === "number" ? options.version : options.version(uid, found);
    if (!isKeyVersion(version)) throw new Error("Invalid card key version");
    return version;
  };
  if (typeof options.version === "number") versionOf(new Uint8Array(UID_LENGTH), "blank");
  const template = cardFileTemplate(relayHost);
  const state = await readCardState(card);
  const { versions, file } = state;
  const match = matchTemplate(file, template);
  // Known now when the card mirrors a tap; else from GetCardUID, once authenticated.
  const tapUid = mirroredUid(state, template, root);
  let version = tapUid ? versionOf(tapUid, "tap") : null;

  // Ended but for its check: every key at this version, a tap they verify.
  if (version !== null && versions.every((v) => v === version)) {
    const tap = mirroredTap(state, template, root, version);
    if (tap) {
      return { uid: tap.uid, cardId: cardIdOf(root, tap.uid), version, counter: tap.counter };
    }
  }
  // Every key blank, and the file empty or holding placeholders: this relay's, or another's (a
  // programming for another relay that stopped before its SDM settings, its file still free).
  const blank = versions.every((v) => v === 0) && (isEmptyNdef(file) || holdsPlaceholders(file));
  // Interrupted after the SDM settings: key 0 still blank, the others blank or at this version,
  // and the tap mirrored in the file verifies with them.
  const resumed =
    !blank &&
    version !== null &&
    versions[0] === 0 &&
    versions.every((v) => v === 0 || v === version)
      ? mirroredTap(state, template, root, version)
      : null;
  if (!blank && !resumed) {
    // This wallet's card already, at the keys of another programming: to be reset first, here.
    const held = versions[0];
    if (
      held !== version &&
      isKeyVersion(held) &&
      versions.every((v) => v === held) &&
      mirroredTap(state, template, root, held)
    ) {
      throw new ProgramError("ownCard", "The card is this wallet's already");
    }
    throw new ProgramError("notBlank", "The card is not blank");
  }

  // Before any authentication: GetVersion is plain only then.
  const randomId = await card.randomIdEnabled();
  // Free on a blank card: the file's Write access is E until the SDM settings.
  if (!match) await card.writeData(NDEF_FILE_NO, 0, template.bytes);
  try {
    await card.authenticate(0, ZERO_KEY);
  } catch (error) {
    // Key 0 is not blank after all: never another attempt.
    if (error instanceof CardError && error.code === "authFailed") {
      throw new ProgramError("notBlank", "The card's key 0 is not blank");
    }
    throw error;
  }
  const uid = await card.getCardUid();
  if (resumed && !equalBytes(resumed.uid, uid)) {
    throw new ProgramError("notBlank", "The card's tap names another UID");
  }
  version ??= versionOf(uid, "blank");
  if (!randomId) await card.enableRandomId();
  const keys = cardKeysOf(root, uid, version);
  try {
    // Stopped once its keys 1 and 2 were set, its tap verifying with them: its SDM settings are in
    // place. Set again, they would start the read counter again (data sheet §9.3.1), and a tap read
    // from the card meanwhile would be good once it is programmed.
    if (!(resumed && versions[1] === version && versions[2] === version)) {
      await card.changeFileSettings(NDEF_FILE_NO, boltCardFileSettings(template));
    }
    const newKeys: Record<1 | 2 | 3 | 4, Uint8Array> = {
      1: keys.k1,
      2: keys.k2,
      3: keys.k3,
      4: keys.k4
    };
    for (const keyNo of [1, 2, 3, 4] as const) {
      // Already at this version: changed by the interrupted attempt.
      if (versions[keyNo] === version) continue;
      await card.changeKey(keyNo, ZERO_KEY, newKeys[keyNo], version);
    }
    await card.changeKey(0, ZERO_KEY, keys.k0, version);
    return await checkTap(card, template, keys, uid, root, version);
  } finally {
    wipeCardKeys(keys);
  }
}

/** Reads a fresh tap (unauthenticated: the card mirrors it) and verifies it with `keys`. */
async function checkTap(
  card: Ntag424,
  template: CardFileTemplate,
  keys: CardKeys,
  uid: Uint8Array,
  root: Uint8Array,
  version: number
): Promise<ProgrammedCard> {
  await card.selectApplication();
  const file = await card.readData(NDEF_FILE_NO, 0, template.bytes.length);
  const match = matchTemplate(file, template);
  const params = match && !match.placeholders ? parseSunParams(match.p, match.c) : null;
  const picc = params ? verifySun(keys.k1, keys.k2, params.p, params.c) : null;
  if (!picc || !equalBytes(picc.uid, uid) || picc.counter < 1) {
    throw new ProgramError("verifyFailed", "The card's tap does not verify");
  }
  return { uid, cardId: cardIdOf(root, uid), version, counter: picc.counter };
}

export type ResetOptions = {
  root: Uint8Array;
  /**
   * The card to reset, and the keys' version it holds: its record's, or the next one, which a
   * programming stopped on its way may have set some keys to.
   */
  cardId: string;
  version: number;
  /**
   * Called once the card is shown to be `cardId`, before anything on it is changed (a relay
   * change records it reset then, manage.ts): its failure leaves the card as it was.
   */
  beforeChange?: () => Promise<void>;
};

/**
 * Resets the card to a blank card: factory NDEF settings, empty NDEF file, every key back to zeros
 * at version 0. Its keys must be blank or at `version`, and it is shown to be `cardId` before
 * anything is changed:
 * - by its mirrored tap, which opens with the K1 it holds and verifies with its K2, its UID giving
 *   `cardId` (DETERMINISTIC.md, "How to implement a Reset feature"), whichever relay its file
 *   names (it only gives where `p` and `c` are). With this wallet's keys 1 and 2, the proof that
 *   the card holds them;
 * - or, SDM off (its programming stopped before it turned SDM on, or its reset after it turned SDM
 *   off: no tap left to read), its file empty or holding placeholders, its key 0 blank, by the UID
 *   it gives to that key (blankKeyUid). Without a tap, a key 0 at `version` is never this
 *   wallet's doing: refused, nothing sent but reads.
 * Authenticated with its key 0 at `version`, or with the blank key when its version is 0 (a
 * programming that stopped before it, as programCard believes it blank); GetCardUID then checks the
 * UID. Each key at `version` is changed back with this wallet's own, which the card checks
 * (ntag424.ts: a wrong one is refused, never written).
 *
 * Its keys first, key 0 last, SDM still on: until every key is blank, the card mirrors a tap that
 * the keys it holds verify (mirroredTap takes each key blank or at `version`); then SDM off, the
 * file emptied, authenticated with the blank key 0. At no step does the card need the tag's UID to
 * be recognized: with Random ID, anticollision no longer gives it.
 * Resolves `false` when the card is blank already (an interrupted reset that had ended).
 */
export async function resetCard(card: Ntag424, options: ResetOptions): Promise<boolean> {
  const { root, cardId, version, beforeChange } = options;
  if (!isKeyVersion(version)) throw new Error("Invalid card key version");
  const state = await readCardState(card);
  const { versions, file } = state;
  if (versions.every((v) => v === 0) && isEmptyNdef(file)) return false;
  if (!versions.every((v) => v === 0 || v === version)) {
    throw new ResetError("notThisCard", "Not the expected card");
  }

  const host = relayOfCardFile(file);
  let uid =
    host === null ? null : (mirroredTap(state, cardFileTemplate(host), root, version)?.uid ?? null);
  if (!uid && versions[0] === 0 && (isEmptyNdef(file) || holdsPlaceholders(file))) {
    uid = await blankKeyUid(card);
  }
  if (!uid || cardIdOf(root, uid) !== cardId) {
    throw new ResetError("notThisCard", "Not the expected card");
  }

  const keys = cardKeysOf(root, uid, version);
  try {
    try {
      await card.authenticate(0, versions[0] === version ? keys.k0 : ZERO_KEY);
    } catch (error) {
      // A key 0 that is not the one its version gives: never another attempt.
      if (error instanceof CardError && error.code === "authFailed") {
        throw new ResetError("keyRefused", "The card's key 0 is not the expected one");
      }
      throw error;
    }
    if (!equalBytes(await card.getCardUid(), uid)) {
      throw new ResetError("notThisCard", "The card's UID is not the expected one");
    }
    await beforeChange?.();
    // The keys first, SDM still on: the card keeps a tap its keys verify until they are all blank.
    const oldKeys: Record<1 | 2 | 3 | 4, Uint8Array> = {
      1: keys.k1,
      2: keys.k2,
      3: keys.k3,
      4: keys.k4
    };
    for (const keyNo of [1, 2, 3, 4] as const) {
      if (versions[keyNo] === 0) continue;
      await card.changeKey(keyNo, oldKeys[keyNo], ZERO_KEY, 0);
    }
    if (versions[0] === version) {
      // Ends the authentication: again with the key 0 it now holds.
      await card.changeKey(0, keys.k0, ZERO_KEY, 0);
      await card.authenticate(0, ZERO_KEY);
    }
    // Then SDM off: the card stops mirroring, and the file's write access is free again.
    await card.changeFileSettings(NDEF_FILE_NO, FACTORY_FILE_SETTINGS);
    await card.writeData(NDEF_FILE_NO, 0, new Uint8Array(MAX_FILE_CONTENT));
  } finally {
    wipeCardKeys(keys);
  }

  const after = await readCardState(card);
  if (!after.versions.every((v) => v === 0) || !isEmptyNdef(after.file)) {
    throw new CardError("protocol", "The card is not blank after its reset");
  }
  return true;
}
