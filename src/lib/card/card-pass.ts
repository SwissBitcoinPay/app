import { equalBytes } from "@noble/ciphers/utils.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";

import { CARD_HASHES_AHEAD } from "@/config/card";

import type { CardState } from "./card-record";
import { cardOwnSecret } from "./card-own";
import {
  cardKeysOf,
  cardWalletEntropy,
  channelSecretOf,
  isKeyVersion,
  isWalletGeneration,
  wipeCardKeys,
  type CardWalletOf
} from "./keys";
import { isCanonicalRelayHost } from "./relay-host";
import { MAX_COUNTER, UID_LENGTH, parseSunParams, verifySun } from "./sun";

/*
 * A card's pass: what an Android phone keeps of one card to pay
 * with it, the app closed (src/features/card/card-passes.ts), in place of the root of every card's
 * keys it kept before. Only that card's: its K2 at its keys' version and the wallet's K1 (check its
 * taps), its wallet's entropy (pays from it), its channel's secret on its relay (deposits its next
 * taps' hashes), its own copies' secret (reads its state and book, card-own.ts). Never K0 (who holds
 * the pass cannot program the card again), the card root nor the seed. Whoever takes it from the
 * phone gets that card's wallet, and with K1 can open the PICCData of the account's cards' taps
 * (their UID and counter: tell them apart), never pay with another card nor program one: deleting
 * the card (then adding it again: a new wallet, new keys) leaves the pass worth nothing to pay.
 *
 * K1 is in the pass since format 2 (against the relay's forged taps): a tap is checked as tap.ts
 * checks it, `p` opened with K1 into this card's
 * UID and its counter, `c` that tap's MAC with K2. Checked with K2 alone, `c` was all that proved
 * a tap; but `c` is 64 bits and the relay keeps a hash of each of the card's next ones (hashes.ts),
 * so its operator could find one by trying every `c` against all the hashes it keeps at once, and
 * wake the phone with any `p`. `p` cannot be made without K1.
 */

export type CardPass = {
  cardId: string;
  walletGeneration: number;
  /** 7 bytes, lowercase hex. */
  uid: string;
  keyVersion: number;
  /** The relay the card was programmed with (canonical host). */
  relayHost: string;
  /** The wallet's K1 (16 bytes, keys.ts, cardEncryptionKey): opens its cards' `p`. */
  k1: Uint8Array;
  /** The card's K2 at `keyVersion` (16 bytes). */
  k2: Uint8Array;
  /** The entropy of the card's wallet's words (16 bytes, keys.ts, cardWalletEntropy). */
  walletEntropy: Uint8Array;
  /** The secret of the card's channel on `relayHost` (32 bytes). */
  channelSecret: Uint8Array;
  /** The secret of the card's wallet's own copies (32 bytes, card-own.ts). */
  ownSecret: Uint8Array;
};

/** The pass of the active card `state`, from the card root. Wiped by its holder (wipeCardPass). */
export function cardPassOf(root: Uint8Array, state: CardState): CardPass {
  const uid = hexToBytes(state.uid);
  const keys = cardKeysOf(root, uid, state.keyVersion);
  try {
    return {
      cardId: state.cardId,
      walletGeneration: state.walletGeneration,
      uid: state.uid,
      keyVersion: state.keyVersion,
      relayHost: state.relayHost,
      k1: keys.k1.slice(),
      k2: keys.k2.slice(),
      walletEntropy: cardWalletEntropy(root, state.cardId, state.walletGeneration),
      channelSecret: channelSecretOf(root, state.cardId, state.relayHost),
      ownSecret: cardOwnSecret(root, state)
    };
  } finally {
    wipeCardKeys(keys);
    uid.fill(0);
  }
}

export function wipeCardPass(pass: CardPass): void {
  pass.k1.fill(0);
  pass.k2.fill(0);
  pass.walletEntropy.fill(0);
  pass.channelSecret.fill(0);
  pass.ownSecret.fill(0);
}

/** Whether `pass` is the pass of the card's wallet `card`. */
export function isPassOf(pass: CardPass, card: CardWalletOf): boolean {
  return pass.cardId === card.cardId && pass.walletGeneration === card.walletGeneration;
}

/** Whether `a` and `b` hold the same card's same secrets (written again only when they differ). */
export function samePass(a: CardPass, b: CardPass): boolean {
  return (
    a.cardId === b.cardId &&
    a.walletGeneration === b.walletGeneration &&
    a.uid === b.uid &&
    a.keyVersion === b.keyVersion &&
    a.relayHost === b.relayHost &&
    equalBytes(a.k1, b.k1) &&
    equalBytes(a.k2, b.k2) &&
    equalBytes(a.walletEntropy, b.walletEntropy) &&
    equalBytes(a.channelSecret, b.channelSecret) &&
    equalBytes(a.ownSecret, b.ownSecret)
  );
}

/** The pass as the phone keeps it (card-pass-store.ts): its bytes in lowercase hex. */
export function cardPassValue(pass: CardPass): Record<string, unknown> {
  return {
    cardId: pass.cardId,
    walletGeneration: pass.walletGeneration,
    uid: pass.uid,
    keyVersion: pass.keyVersion,
    relayHost: pass.relayHost,
    k1: bytesToHex(pass.k1),
    k2: bytesToHex(pass.k2),
    walletEntropy: bytesToHex(pass.walletEntropy),
    channelSecret: bytesToHex(pass.channelSecret),
    ownSecret: bytesToHex(pass.ownSecret)
  };
}

function hexOf(value: unknown, bytes: number): Uint8Array | null {
  return typeof value === "string" && value.length === bytes * 2 && /^[0-9a-f]+$/.test(value)
    ? hexToBytes(value)
    : null;
}

/** A pass as the phone keeps it, checked whole; null when out of shape. */
export function parseCardPass(value: unknown): CardPass | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (
    typeof v.cardId !== "string" ||
    !/^[0-9a-f]{32}$/.test(v.cardId) ||
    !isWalletGeneration(v.walletGeneration) ||
    typeof v.uid !== "string" ||
    !new RegExp(`^[0-9a-f]{${UID_LENGTH * 2}}$`).test(v.uid) ||
    !isKeyVersion(v.keyVersion) ||
    typeof v.relayHost !== "string" ||
    !isCanonicalRelayHost(v.relayHost)
  ) {
    return null;
  }
  const k1 = hexOf(v.k1, 16);
  const k2 = hexOf(v.k2, 16);
  const walletEntropy = hexOf(v.walletEntropy, 16);
  const channelSecret = hexOf(v.channelSecret, 32);
  const ownSecret = hexOf(v.ownSecret, 32);
  if (!k1 || !k2 || !walletEntropy || !channelSecret || !ownSecret) return null;
  return {
    cardId: v.cardId,
    walletGeneration: v.walletGeneration,
    uid: v.uid,
    keyVersion: v.keyVersion,
    relayHost: v.relayHost,
    k1,
    k2,
    walletEntropy,
    channelSecret,
    ownSecret
  };
}

/**
 * How far past the last counter deposited a tap is looked for: one deposit of hashes, which the
 * relay may hold before the phone recorded it (a deposit, then the app ended before its record).
 * Hashes another phone of the account left beyond are not looked for (several phones paying the
 * same cards is a known limit: docs/card-relay.md): such a tap asks
 * the holder.
 */
export const PASS_TAP_MARGIN = CARD_HASHES_AHEAD;

export type PassTap =
  | { ok: true; counter: number }
  | {
      ok: false;
      /**
       * Out of shape; another card's, forged, or past the hashes this phone deposited plus a
       * deposit (another phone's: asked); a counter already seen.
       */
      reason: "otherCard" | "malformed" | "replayed";
    };

/**
 * The tap `p`, `c` of the card of `pass`, checked as checkCardTap (tap.ts) does: `p` opens with K1
 * into PICCData of this card's UID, `c` is that tap's MAC with K2, and its counter is above
 * `lastCounter` ("replayed" otherwise: a tap already seen is never good again), up to
 * `depositedThrough` and PASS_TAP_MARGIN past it.
 */
export function findPassTap(
  pass: CardPass,
  { lastCounter, depositedThrough }: Pick<CardState, "lastCounter" | "depositedThrough">,
  p: unknown,
  c: unknown
): PassTap {
  const params = parseSunParams(p, c);
  if (!params) return { ok: false, reason: "malformed" };
  const picc = verifySun(pass.k1, pass.k2, params.p, params.c);
  if (!picc) return { ok: false, reason: "otherCard" };
  const uid = hexToBytes(pass.uid);
  try {
    if (!equalBytes(picc.uid, uid)) return { ok: false, reason: "otherCard" };
    if (picc.counter <= lastCounter) return { ok: false, reason: "replayed" };
    const last = Math.min(MAX_COUNTER, Math.max(lastCounter, depositedThrough) + PASS_TAP_MARGIN);
    if (picc.counter > last) return { ok: false, reason: "otherCard" };
    return { ok: true, counter: picc.counter };
  } finally {
    picc.uid.fill(0);
    uid.fill(0);
  }
}
