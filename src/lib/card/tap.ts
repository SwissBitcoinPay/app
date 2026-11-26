import { cardEncryptionKey, cardIdOf, cardKeysOf, isKeyVersion, wipeCardKeys } from "./keys";
import { MAX_COUNTER, decryptPiccData, parseSunParams, verifySun } from "./sun";

/*
 * A tap of one of the wallet's cards, checked before anything is paid for it (boltcard/docs/
 * DETERMINISTIC.md, "How to implement a verification"): `p` opens with the wallet's K1 into
 * PICCData of tag C7, its UID is the expected card's, `c` is that tap's MAC with K2 at the card's
 * keys' version, and its counter is above the last one seen (a tap read once, by a point of sale or
 * anyone near the card, is never good twice).
 */

export type CardTapExpectation = {
  /** The wallet's card root (deriveCardRoot). */
  root: Uint8Array;
  cardId: string;
  version: number;
  /** The highest counter of a tap of this card already seen. */
  lastCounter: number;
};

export type CardTapCheck =
  | { ok: true; counter: number; uid: Uint8Array }
  | {
      ok: false;
      reason:
        /** `p` or `c` out of shape. */
        | "malformed"
        /** Not one of the wallet's cards, or another of them. */
        | "otherCard"
        /** The card's, but `c` is not its MAC: forged or altered. */
        | "badMac"
        /** A tap already seen, or an older one. */
        | "replayed";
    };

/**
 * What a payment checked its tap with (src/features/card/payment.ts): the open account's keys, what
 * the phone keeps to pay with the app closed ("cardRoot", the name the wakes' journal keeps: the
 * card's pass, card-pass.ts), the passkey's seed.
 */
export type TapCheckedWith = "account" | "cardRoot" | "passkey";

export function checkCardTap(expected: CardTapExpectation, p: unknown, c: unknown): CardTapCheck {
  const { root, cardId, version, lastCounter } = expected;
  if (!isKeyVersion(version)) throw new Error("Invalid card key version");
  if (!Number.isInteger(lastCounter) || lastCounter < 0 || lastCounter > MAX_COUNTER) {
    throw new Error("Invalid last counter");
  }
  const params = parseSunParams(p, c);
  if (!params) return { ok: false, reason: "malformed" };
  const k1 = cardEncryptionKey(root);
  try {
    const picc = decryptPiccData(k1, params.p);
    if (!picc || cardIdOf(root, picc.uid) !== cardId) return { ok: false, reason: "otherCard" };
    const keys = cardKeysOf(root, picc.uid, version);
    try {
      if (!verifySun(keys.k1, keys.k2, params.p, params.c)) return { ok: false, reason: "badMac" };
    } finally {
      wipeCardKeys(keys);
    }
    if (picc.counter <= lastCounter) return { ok: false, reason: "replayed" };
    return { ok: true, counter: picc.counter, uid: picc.uid };
  } finally {
    k1.fill(0);
  }
}

/** One of the wallet's cards, as a tap is checked against it. */
export type TapCandidate = { cardId: string; keyVersion: number; lastCounter: number };

export type CardTapIdentification<T extends TapCandidate> =
  | { ok: true; card: T; counter: number }
  | { ok: false; reason: Exclude<CardTapCheck, { ok: true }>["reason"] };

/**
 * Which of `cards` (the wallet's active ones) made the tap `p`, `c`, checked as checkCardTap does:
 * `p` opens with the wallet's K1 into the card's UID, whose id must be one of theirs.
 */
export function identifyCardTap<T extends TapCandidate>(
  root: Uint8Array,
  cards: readonly T[],
  p: unknown,
  c: unknown
): CardTapIdentification<T> {
  const params = parseSunParams(p, c);
  if (!params) return { ok: false, reason: "malformed" };
  const k1 = cardEncryptionKey(root);
  let cardId: string;
  try {
    const picc = decryptPiccData(k1, params.p);
    if (!picc) return { ok: false, reason: "otherCard" };
    cardId = cardIdOf(root, picc.uid);
    picc.uid.fill(0);
  } finally {
    k1.fill(0);
  }
  const card = cards.find((candidate) => candidate.cardId === cardId);
  if (!card) return { ok: false, reason: "otherCard" };
  const check = checkCardTap(
    { root, cardId, version: card.keyVersion, lastCounter: card.lastCounter },
    p,
    c
  );
  if (!check.ok) return check;
  check.uid.fill(0);
  return { ok: true, card, counter: check.counter };
}
