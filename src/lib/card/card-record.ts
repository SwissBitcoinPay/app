import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";

import { parseImageRef, type ImageRef } from "@/lib/media/image";
import type { NostrEvent } from "@/lib/nostr/event";
import { deriveKey, nostrKeys, type NostrKeys } from "@/lib/nostr/keys";
import { NewerRecordError, RECORD_KIND, openRecord, sealRecord } from "@/lib/nostr/record";
import type { RelayFilter } from "@/lib/nostr/relay";
import { isSatsNumber } from "@/lib/sats";

import {
  CARD_SALT,
  FIRST_CARD_WALLET_GENERATION,
  cardIdOf,
  isKeyVersion,
  isWalletGeneration,
  type CardWalletOf
} from "./keys";
import { isCanonicalRelayHost } from "./relay-host";
import { MAX_COUNTER, UID_LENGTH } from "./sun";

/*
 * The state of one of the wallet's cards, in a sealed record on the account's relays
 * (src/lib/nostr/record.ts, channel "account"): another phone of the wallet finds its cards, their
 * keys' version and the last counter seen, which no tap may go under again. One record per card,
 * at an opaque address; its author is a key of the cards' own (never the backup's), so that a
 * relay cannot tie the cards to the merchant settings. The UID is inside, encrypted with the
 * record: the phone needs it to compute the hashes of the card's next taps (hashes.ts); a relay
 * never sees it, nor anything that tells it.
 *
 * IRREVERSIBLE: the salt and the `info` strings of these keys (vectors in card-record.test.ts), and
 * the format: a change needs a new `version` and a migration from the older ones.
 */

const RECORD_TYPE = "card-state";
/** Records are padded to multiples of this many bytes (record.ts): they all look alike. */
const BLOCK = 512;

/**
 * 4: the card's look (`look`: a colour of the palette or an image of the holder's),
 * its issuer's visual (`issuer`: a v2 card's, never changed), the "deleted"
 * status, and the generation of the card's wallet (`walletGeneration`, keys.ts: above the first
 * for a card deleted then added again, a new wallet, none of the deleted card's history: "Delete"
 * erases all its data). Only a state that holds one of them
 * (a generation above the first) is written at 4; others keep the oldest version that holds them,
 * as before: the apps before it read them, and leave a card of a later generation alone (they
 * would pay from its first wallet, emptied at its deletion).
 * 3: the "migrating" status (a v2 card being migrated). Only a state of that status
 * is written at 3: every other keeps version 2, which the apps before it read (staging gets OTA
 * rollbacks), so that they still see every card but the ones being migrated.
 * 2 (the cards managed on the web too): when the settings were last changed
 * (`settingsAt`), apart from when the record was written: a tap's counter, which the phone writes,
 * never takes back a setting changed elsewhere. 1 (no `settingsAt`) is no longer read.
 */
export const CARD_STATE_VERSION = 4;

/** The version `state` is written at: the oldest that holds it (CARD_STATE_VERSION). */
function versionOf(state: CardState): number {
  if (
    state.look !== null ||
    state.issuer !== null ||
    state.status === "deleted" ||
    state.walletGeneration > FIRST_CARD_WALLET_GENERATION
  ) {
    return 4;
  }
  return state.status === "migrating" ? 3 : 2;
}

export type CardStatus =
  /** Programmed with this wallet's keys at `keyVersion`, and serving payments. */
  | "active"
  /** Reset to a blank card: kept so that its next programming takes the next version. */
  | "reset"
  /**
   * A v2 card being migrated to this wallet (src/features/card/migration.ts):
   * recorded before its balance moves to the card's wallet or the card is erased, so that the
   * wallet shows in "Cards" on every device of the account, and "Delete account" checks
   * it, until the card is re-encoded (then active at `keyVersion`, the version kept for it) or
   * given up (reset). Not programmed with this wallet's keys yet: it pays nothing, has no channel.
   */
  | "migrating"
  /**
   * Deleted from the account ("Delete the card"): its data
   * erased, its settings with them (src/features/card/card-erasure.ts), its channel deleted; it pays
   * nothing and shows nowhere. The card itself is blank (deleted in hand) or still holds this
   * wallet's keys at `keyVersion` (deleted without it). Kept so that the card, found and added
   * again, is reset and programmed at the next version (its earlier taps must never be good again),
   * and pays from its wallet's next generation (nothing of the deleted card's shows again).
   */
  | "deleted";

/** Most characters of a card's name. */
export const MAX_CARD_NAME_LENGTH = 40;

/**
 * The colours a card's look may take (their fills and inks in
 * src/features/card/card-look.ts). IRREVERSIBLE: written into the cards' records and drawn from
 * the cards' ids by their order (DRAWN_COLORS): never renamed, removed nor reordered; a new one
 * goes at the end, to be chosen only.
 */
export const CARD_COLORS = [
  "ink",
  "night",
  "plum",
  "bordeaux",
  "fir",
  "lagoon",
  "copper",
  "bitcoin"
] as const;

export type CardColor = (typeof CARD_COLORS)[number];

/** The colours a card is drawn among (defaultCardColor): the first palette, for good. */
const DRAWN_COLORS: readonly CardColor[] = CARD_COLORS.slice(0, 8);

/**
 * How the card shows in "Cards": one colour of the palette, or
 * an image its holder chose, framed to the card's shape, with the ink its name takes over it (the
 * lighter of the two where the name is written: "dark" ink over a light image).
 */
export type CardLook =
  { kind: "color"; color: CardColor } | { kind: "image"; image: ImageRef; ink: "light" | "dark" };

/**
 * The visual printed on a v2 card, given by its server at the migration
 * (`front_image`, `card_id`, `is_white`, src/lib/card/legacy-visual.ts): shown with the card's
 * name over it, its number under it, and never changed by its holder.
 */
export type CardIssuer = {
  image: ImageRef;
  /** The number printed on the card, as its server writes it ("4821-0937-5530-1186"). */
  number: string;
  /** A light visual: the name written in black over it, else in white. */
  white: boolean;
};

export type CardState = {
  cardId: string;
  /** 7 bytes, lowercase hex. Never sent in clear. */
  uid: string;
  keyVersion: number;
  status: CardStatus;
  /** The relay written into the card (canonical host). */
  relayHost: string;
  /** The highest counter of a tap of this card seen at `keyVersion`: never goes down. */
  lastCounter: number;
  /** The highest counter whose tap's hash was left on the relay. */
  depositedThrough: number;
  /** Above this, a card payment is refused (whole sats). */
  maxPaymentSats: bigint;
  /** What the card may pay over 24 sliding hours, this payment included (whole sats). */
  maxDaySats: bigint;
  /** How many payments the card may make in an hour (sliding), this one included. */
  maxPaymentsPerHour: number;
  /** Suspended by its holder: refuses every payment, its channel and keys kept. */
  suspended: boolean;
  /**
   * What the user calls the card, to tell the cards of the account apart (several cards); empty
   * for none. One line, MAX_CARD_NAME_LENGTH characters at most.
   */
  name: string;
  /**
   * Its look, a setting as its name; null until its holder chooses one: it shows the colour drawn
   * for it (defaultCardColor), as a record of before version 4 does.
   */
  look: CardLook | null;
  /**
   * Its issuer's visual, given at its migration (a v2 card): shown instead of its look, never
   * changed by its holder; erased with the card's other settings when it is deleted.
   */
  issuer: CardIssuer | null;
  /**
   * When the settings (name, look, issuer's visual, limits, suspension) were last changed (ms): two
   * copies merge them by it, whoever wrote either record (mergeCardStates).
   */
  settingsAt: number;
  /**
   * The generation of the wallet the card pays from (keys.ts, cardWalletPhrase): 1, and one more
   * each time the card is added again after its deletion. Part of its programming.
   */
  walletGeneration: number;
  /** Unix seconds: when this state was written. */
  updatedAt: number;
};

/** The keys of the cards' records. In memory only, wiped with the card root they come from. */
export type CardRecordKeys = {
  nostr: NostrKeys;
  encryptionKey: Uint8Array;
  /** Gives each card's record address (cardRecordAddress). */
  addressKey: Uint8Array;
};

export function deriveCardRecordKeys(root: Uint8Array): CardRecordKeys {
  return {
    // Throws for the 0 or ≥ n keys BIP-340 refuses: an HKDF output has odds below 2^-127.
    nostr: nostrKeys(deriveKey(root, CARD_SALT, "record-nostr-secret-key/v1")),
    encryptionKey: deriveKey(root, CARD_SALT, "record-encryption-key/v1"),
    addressKey: deriveKey(root, CARD_SALT, "record-address-key/v1")
  };
}

export function wipeCardRecordKeys(keys: CardRecordKeys): void {
  keys.nostr.secretKey.fill(0);
  keys.encryptionKey.fill(0);
  keys.addressKey.fill(0);
}

/** The `d` tag of a card's record: 32 bytes, hex. Tells neither the card nor its UID. */
export function cardRecordAddress(keys: CardRecordKeys, cardId: string): string {
  return bytesToHex(deriveKey(keys.addressKey, CARD_SALT, `record-address/v1/${cardId}`));
}

function isCounter(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= MAX_COUNTER;
}

function isUnixSeconds(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isUnixMillis(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/**
 * The colour drawn for a card at its pairing (one at random), until its holder
 * chooses a look: from its id, an HKDF output, so uniform over the palette and the same on every
 * device without a write (a record that names no look stays readable by the apps of before version
 * 4). IRREVERSIBLE: every card shows it (vectors in card-record.test.ts).
 */
export function defaultCardColor(cardId: string): CardColor {
  // 2^32 is a multiple of 8: none is drawn more often than another.
  return DRAWN_COLORS[Number.parseInt(cardId.slice(0, 8), 16) % DRAWN_COLORS.length];
}

/**
 * Whether "Cards" shows the card: neither reset (a blank card again) nor deleted. The others
 * read every card ("Delete account" checks each card's wallet, whatever its status).
 */
export function isCardShown(state: CardState): boolean {
  return state.status !== "reset" && state.status !== "deleted";
}

/**
 * Up to which generation of the card's wallets its data is erased ("Delete" erases all its data):
 * its wallets before the current one (a card deleted, then
 * added again), and the current one too once the card is deleted; 0 for none. It never goes down
 * as copies merge (programmingOf: a later generation stands over the earlier ones, a deletion over
 * any programming of its generation): a device that knows an older copy erases less, never data of
 * a wallet in use.
 */
export function erasedThrough(state: CardState): number {
  return state.status === "deleted"
    ? state.walletGeneration
    : state.walletGeneration - FIRST_CARD_WALLET_GENERATION;
}

/** Each card's erasedThrough among `states`, by card id: those with something erased only. */
export function erasedGenerations(states: Iterable<CardState>): Map<string, number> {
  const erased = new Map<string, number>();
  for (const state of states) {
    const through = erasedThrough(state);
    if (through > 0) erased.set(state.cardId, Math.max(erased.get(state.cardId) ?? 0, through));
  }
  return erased;
}

/** Whether `data` belongs to a wallet `erased` (erasedGenerations) says is erased. */
export function isErasedData(data: CardWalletOf, erased: ReadonlyMap<string, number>): boolean {
  return data.walletGeneration <= (erased.get(data.cardId) ?? 0);
}

/**
 * The images of a card's state its holder chose: its look's. "Delete" erases them, never its
 * issuer's visual (card-erasure.ts).
 */
export function lookImagesOf(state: CardState): ImageRef[] {
  return state.look?.kind === "image" ? [state.look.image] : [];
}

/** The images a card's state names: its look's (lookImagesOf), its issuer's visual's. */
export function cardImagesOf(state: CardState): ImageRef[] {
  const images = lookImagesOf(state);
  if (state.issuer) images.push(state.issuer.image);
  return images;
}

function lookValue(look: CardLook): Record<string, unknown> {
  return look.kind === "color"
    ? { kind: "color", color: look.color }
    : { kind: "image", image: { key: look.image.key, hash: look.image.hash }, ink: look.ink };
}

function issuerValue(issuer: CardIssuer): Record<string, unknown> {
  return {
    image: { key: issuer.image.key, hash: issuer.image.hash },
    number: issuer.number,
    white: issuer.white
  };
}

function isCardColor(value: unknown): value is CardColor {
  return CARD_COLORS.some((color) => color === value);
}

/** A record's look: null, or one of its shapes; undefined when out of shape. */
function parseLook(value: unknown): CardLook | null | undefined {
  if (value === null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const v = value as Record<string, unknown>;
  if (v.kind === "color") {
    return isCardColor(v.color) ? { kind: "color", color: v.color } : undefined;
  }
  if (v.kind !== "image" || (v.ink !== "light" && v.ink !== "dark")) return undefined;
  const image = parseImageRef(v.image);
  return image ? { kind: "image", image, ink: v.ink } : undefined;
}

/**
 * The number printed on a v2 card: four groups of four letters or digits, in any case, as the v2
 * server reserves the cards' printed numbers.
 */
export const ISSUER_NUMBER = /^[0-9A-Za-z]{4}(?:-[0-9A-Za-z]{4}){3}$/;

/** A record's issuer visual: null, or its shape; undefined when out of shape. */
function parseIssuer(value: unknown): CardIssuer | null | undefined {
  if (value === null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const v = value as Record<string, unknown>;
  const image = parseImageRef(v.image);
  if (!image || typeof v.number !== "string" || !ISSUER_NUMBER.test(v.number)) return undefined;
  return typeof v.white === "boolean" ? { image, number: v.number, white: v.white } : undefined;
}

/** The record's value: amounts as JSON numbers (safe integers, src/lib/sats.ts). */
export function cardStateValue(state: CardState): Record<string, unknown> {
  const version = versionOf(state);
  return {
    version,
    cardId: state.cardId,
    uid: state.uid,
    keyVersion: state.keyVersion,
    status: state.status,
    relayHost: state.relayHost,
    lastCounter: state.lastCounter,
    depositedThrough: state.depositedThrough,
    maxPaymentSats: Number(state.maxPaymentSats),
    maxDaySats: Number(state.maxDaySats),
    maxPaymentsPerHour: state.maxPaymentsPerHour,
    suspended: state.suspended,
    name: state.name,
    settingsAt: state.settingsAt,
    updatedAt: state.updatedAt,
    // Version 4 only: the records of before stay as they were written.
    ...(version >= 4
      ? {
          look: state.look === null ? null : lookValue(state.look),
          issuer: state.issuer === null ? null : issuerValue(state.issuer),
          walletGeneration: state.walletGeneration
        }
      : {})
  };
}

/** Control characters and the marks that reorder text: never in a card's name. */
const HIDDEN = /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/;

/** Whether `name` is a card's name as kept: one trimmed line, without hidden characters. */
export function isCardName(name: unknown): name is string {
  return (
    typeof name === "string" &&
    name === name.trim() &&
    !HIDDEN.test(name) &&
    Array.from(name).length <= MAX_CARD_NAME_LENGTH
  );
}

/**
 * A card's state from a record's value (or the device's copy), checked whole: its id must be its
 * UID's with this wallet's keys (`root`; null before the account is unlocked, for the device's own
 * copy only, which is checked again once it is). Null when invalid; NewerRecordError for a newer
 * version.
 */
export function parseCardState(value: unknown, root: Uint8Array | null): CardState | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.version === "number" && v.version > CARD_STATE_VERSION) throw new NewerRecordError();
  const version = v.version;
  // Version 4 holds the look and the issuer's visual (null for none), and the wallet's generation;
  // versions 2 and 3, still written (versionOf), neither: theirs is the first.
  const look = version === 4 ? parseLook(v.look) : null;
  const issuer = version === 4 ? parseIssuer(v.issuer) : null;
  const walletGeneration = version === 4 ? v.walletGeneration : FIRST_CARD_WALLET_GENERATION;
  if (
    (version !== 2 && version !== 3 && version !== 4) ||
    look === undefined ||
    issuer === undefined ||
    !isWalletGeneration(walletGeneration) ||
    !isUnixMillis(v.settingsAt) ||
    typeof v.cardId !== "string" ||
    !/^[0-9a-f]{32}$/.test(v.cardId) ||
    typeof v.uid !== "string" ||
    !new RegExp(`^[0-9a-f]{${UID_LENGTH * 2}}$`).test(v.uid) ||
    !isKeyVersion(v.keyVersion) ||
    (v.status !== "active" &&
      v.status !== "reset" &&
      // Not statuses of the versions before.
      (v.status !== "migrating" || version < 3) &&
      (v.status !== "deleted" || version < 4)) ||
    typeof v.relayHost !== "string" ||
    !isCanonicalRelayHost(v.relayHost) ||
    !isCounter(v.lastCounter) ||
    !isCounter(v.depositedThrough) ||
    v.depositedThrough < v.lastCounter ||
    !isSatsNumber(v.maxPaymentSats) ||
    !isSatsNumber(v.maxDaySats) ||
    typeof v.maxPaymentsPerHour !== "number" ||
    !Number.isInteger(v.maxPaymentsPerHour) ||
    v.maxPaymentsPerHour < 1 ||
    v.maxPaymentsPerHour > 1000 ||
    typeof v.suspended !== "boolean" ||
    !isCardName(v.name) ||
    !isUnixSeconds(v.updatedAt)
  ) {
    return null;
  }
  if (root && cardIdOf(root, hexToBytes(v.uid)) !== v.cardId) return null;
  return {
    cardId: v.cardId,
    uid: v.uid,
    keyVersion: v.keyVersion,
    status: v.status,
    relayHost: v.relayHost,
    lastCounter: v.lastCounter,
    depositedThrough: v.depositedThrough,
    maxPaymentSats: BigInt(v.maxPaymentSats),
    maxDaySats: BigInt(v.maxDaySats),
    maxPaymentsPerHour: v.maxPaymentsPerHour,
    suspended: v.suspended,
    name: v.name,
    look,
    issuer,
    settingsAt: v.settingsAt,
    walletGeneration,
    updatedAt: v.updatedAt
  };
}

/** The signed record of `state`, dated its `updatedAt`. */
export function cardStateEvent(keys: CardRecordKeys, state: CardState): NostrEvent {
  return sealRecord({
    type: RECORD_TYPE,
    value: cardStateValue(state),
    signer: keys.nostr.secretKey,
    encryptionKey: keys.encryptionKey,
    address: cardRecordAddress(keys, state.cardId),
    createdAt: state.updatedAt,
    block: BLOCK
  });
}

/** What relays hold of the wallet's cards. */
export function cardStatesFilter(keys: CardRecordKeys): RelayFilter {
  return { kinds: [RECORD_KIND], authors: [keys.nostr.publicKey] };
}

/**
 * For one programming: a migration ends with its card programmed (or given up), a reset ends it. A
 * deletion ends them all (mergeCardStates): the card's data erased, its next programming takes the
 * next keys and the next wallet.
 */
const STATUS_RANK: Record<CardStatus, number> = {
  migrating: 0,
  active: 1,
  reset: 2,
  deleted: 3
};

/**
 * Of two copies, the one whose programming stands: the later wallet's generation (the card added
 * again after its deletion, pairing.ts), then the later keys' version (a new programming), then a
 * deletion, then a reset, then the programming that ends a migration, over what they end (never
 * undone by an older copy). The same programming has one relay and one UID; on a damaged copy, the
 * same pick on every device. A deletion of the generation it stands for then overrides its status
 * (mergeCardStates).
 */
function programmingOf(a: CardState, b: CardState): CardState {
  if (a.walletGeneration !== b.walletGeneration) {
    return a.walletGeneration > b.walletGeneration ? a : b;
  }
  if (a.keyVersion !== b.keyVersion) return a.keyVersion > b.keyVersion ? a : b;
  if (a.status !== b.status) return STATUS_RANK[a.status] > STATUS_RANK[b.status] ? a : b;
  if (a.relayHost !== b.relayHost) return a.relayHost < b.relayHost ? a : b;
  return a.uid <= b.uid ? a : b;
}

/** A look as text, to compare two the same way on every device ("" for none). */
function lookKey(look: CardLook | null): string {
  if (look === null) return "";
  return look.kind === "color"
    ? `color ${look.color}`
    : `image ${look.image.hash} ${look.image.key} ${look.ink}`;
}

function issuerKey(issuer: CardIssuer | null): string {
  return issuer === null
    ? ""
    : `${issuer.image.hash} ${issuer.image.key} ${issuer.number} ${issuer.white ? 1 : 0}`;
}

/**
 * Of two copies, the one whose settings stand: changed later, or on a tie the cautious ones
 * (suspended, then the lower limits), then the name, the look and the issuer's visual, the same on
 * every device. The issuer's visual is a setting: only its migration gives it, on a record that
 * every device then reads, and "Delete account" erases it (the card's deletion keeps it,
 * card-erasure.ts).
 */
function settingsOf(a: CardState, b: CardState): CardState {
  if (a.settingsAt !== b.settingsAt) return a.settingsAt > b.settingsAt ? a : b;
  if (a.suspended !== b.suspended) return a.suspended ? a : b;
  if (a.maxPaymentSats !== b.maxPaymentSats) return a.maxPaymentSats < b.maxPaymentSats ? a : b;
  if (a.maxDaySats !== b.maxDaySats) return a.maxDaySats < b.maxDaySats ? a : b;
  if (a.maxPaymentsPerHour !== b.maxPaymentsPerHour) {
    return a.maxPaymentsPerHour < b.maxPaymentsPerHour ? a : b;
  }
  if (a.name !== b.name) return a.name < b.name ? a : b;
  if (lookKey(a.look) !== lookKey(b.look)) return lookKey(a.look) < lookKey(b.look) ? a : b;
  return issuerKey(a.issuer) <= issuerKey(b.issuer) ? a : b;
}

/**
 * Two states of one card merged, whatever their order, part by part: the programming that stands
 * (programmingOf), its highest counters (a tap seen anywhere is never good again), the settings
 * changed last of its wallet's generation (settingsOf), whoever wrote either copy: the phone
 * recording a tap's counter never takes back a setting the web app changed meanwhile.
 *
 * A deletion ends its generation's wallet over any programming of it, however later (a phone that
 * did not know of the deletion, programming the card again, would bring
 * that wallet back in service, its approved merchants and history with it): a deleted copy of the
 * generation that stands makes the merged state deleted, the rest of its programming kept (the
 * keys the card last took, which a reset after it starts from, pairing.ts), so that three copies
 * merge the same in any order.
 */
export function mergeCardStates(a: CardState, b: CardState): CardState {
  if (a.cardId !== b.cardId) throw new Error("Two different cards");
  const programming = programmingOf(a, b);
  // The settings of the wallet's generation that stands: a card added again after its deletion
  // starts afresh, its issuer's visual given again by its
  // programming (keptSettings). A copy of the deleted generation,
  // even changed later (by a phone that did not know of the deletion), never gives it back its
  // former name, look, limits nor pause.
  const settings = a.walletGeneration === b.walletGeneration ? settingsOf(a, b) : programming;
  // The same programming: its keys and its wallet. A later generation always holds later keys
  // (pairing.ts); a damaged copy that names an earlier wallet at the same keys never lends its
  // counters, so that three copies still merge the same in any order.
  const sameKeys = a.keyVersion === b.keyVersion && a.walletGeneration === b.walletGeneration;
  const deleted = [a, b].some(
    (state) => state.status === "deleted" && state.walletGeneration === programming.walletGeneration
  );
  return {
    cardId: a.cardId,
    uid: programming.uid,
    keyVersion: programming.keyVersion,
    status: deleted ? "deleted" : programming.status,
    relayHost: programming.relayHost,
    lastCounter: sameKeys ? Math.max(a.lastCounter, b.lastCounter) : programming.lastCounter,
    depositedThrough: sameKeys
      ? Math.max(a.depositedThrough, b.depositedThrough)
      : programming.depositedThrough,
    maxPaymentSats: settings.maxPaymentSats,
    maxDaySats: settings.maxDaySats,
    maxPaymentsPerHour: settings.maxPaymentsPerHour,
    suspended: settings.suspended,
    name: settings.name,
    look: settings.look,
    issuer: settings.issuer,
    settingsAt: settings.settingsAt,
    walletGeneration: programming.walletGeneration,
    updatedAt: Math.max(a.updatedAt, b.updatedAt)
  };
}

/** Whether `next` holds anything `known` lacks: it is worth writing. */
export function addsToCardState(known: CardState, next: CardState): boolean {
  const merged = mergeCardStates(known, next);
  return (
    merged.uid !== known.uid ||
    merged.keyVersion !== known.keyVersion ||
    merged.status !== known.status ||
    merged.walletGeneration !== known.walletGeneration ||
    merged.lastCounter !== known.lastCounter ||
    merged.depositedThrough !== known.depositedThrough ||
    merged.relayHost !== known.relayHost ||
    merged.maxPaymentSats !== known.maxPaymentSats ||
    merged.maxDaySats !== known.maxDaySats ||
    merged.maxPaymentsPerHour !== known.maxPaymentsPerHour ||
    merged.suspended !== known.suspended ||
    merged.name !== known.name ||
    lookKey(merged.look) !== lookKey(known.look) ||
    issuerKey(merged.issuer) !== issuerKey(known.issuer) ||
    merged.settingsAt !== known.settingsAt
  );
}

export type CardStatesRead = {
  /** By card id, every readable copy merged. */
  states: Map<string, CardState>;
  /** Addresses whose newest copy is of a newer format: never written over. */
  newer: Set<string>;
  /** Relays that answered. */
  answered: number;
};

/**
 * The cards among the events relays sent: each copy checked (openRecord), then merged by card.
 * `root` checks each card's id against its UID (parseCardState); null, for a card's own copies read
 * with its pass (card-own.ts), whose caller checks the UID itself.
 */
export function cardStatesOf(
  keys: CardRecordKeys,
  root: Uint8Array | null,
  answers: ReadonlyMap<string, readonly unknown[]>
): CardStatesRead {
  const states = new Map<string, CardState>();
  const newer = new Set<string>();
  const seen = new Set<string>();
  for (const events of answers.values()) {
    for (const value of events) {
      const id = (value as { id?: unknown } | null)?.id;
      if (typeof id === "string" && seen.has(id)) continue;
      const opened = openRecord(value, {
        type: RECORD_TYPE,
        encryptionKey: keys.encryptionKey,
        address: () => true,
        author: keys.nostr.publicKey,
        parse: (payload, event) => {
          const state = parseCardState(payload, root);
          const address = event.tags.find(([name]) => name === "d")?.[1];
          return state &&
            event.created_at === state.updatedAt &&
            address === cardRecordAddress(keys, state.cardId)
            ? state
            : null;
        }
      });
      if (!opened) continue;
      seen.add(opened.event.id);
      if (opened.status === "newer") {
        const address = opened.event.tags.find(([name]) => name === "d")?.[1];
        if (address) newer.add(address);
        continue;
      }
      const known = states.get(opened.value.cardId);
      states.set(opened.value.cardId, known ? mergeCardStates(known, opened.value) : opened.value);
    }
  }
  return { states, newer, answered: answers.size };
}
