import { schnorr } from "@noble/curves/secp256k1.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";

import type { NostrKeys } from "@/lib/nostr/keys";
import { conversationKey, nip44Decrypt, nip44Encrypt } from "@/lib/nostr/nip44";

/*
 * A payment link's own signing key, sealed for the owner alone:
 * the device that made the link puts it in its record of the link (src/lib/team/member-records.ts),
 * so that the owner can sign the link's final version again each year, the same, at the same address
 * (strfry refuses events over 3 years old, and a payer opens a link years later). NIP-44 v2, with
 * the conversation key of the link's key and the business's link key reader (deriveLinkKeyReader,
 * src/lib/team/keys.ts): the device computes it with the link's secret, the owner with the reader's.
 * Once the device dropped the link's key with its final version (pending.ts), it can no longer open
 * it, nor anyone but the owner.
 *
 * Older records sealed it for the registry's reading key (deriveRegistryReader), whose secret an
 * assistant's export grant gives: whoever held a grant could open the key of every link, and
 * publish a newer version of an open link paying elsewhere. Records
 * of before (no `sealedFor`) are still opened with that key; a device sealing for it still does so
 * only while its channel, from an owner's app of before, does not name the link key reader.
 *
 * The owner may then sign anything as the link: replace its final version (so the owner, unlike
 * anyone else, could replace a final version once its device dropped the key). Its app only ever
 * signs the same version again.
 */

/** What a sealed key is sealed for: the link key reader, or the registry's reading key (before). */
export type LinkKeySeal = { sealedKey: string; sealedFor?: "link-key-reader" };

/** The link's signing key `secretKey`, sealed for the business whose key is `reader` (hex). */
export function sealLinkKey(secretKey: Uint8Array, reader: string): string {
  return nip44Encrypt(bytesToHex(secretKey), conversationKey(secretKey, reader));
}

/**
 * The link's signing key `secretKey`, sealed as a device seals it in the link's record: for the
 * business's link key reader when `business` names it, for its reading key otherwise (a registry
 * told by an older owner's app).
 */
export function sealLinkKeyFor(
  secretKey: Uint8Array,
  business: { reader: string; linkKeyReader?: string }
): LinkKeySeal {
  return business.linkKeyReader
    ? { sealedKey: sealLinkKey(secretKey, business.linkKeyReader), sealedFor: "link-key-reader" }
    : { sealedKey: sealLinkKey(secretKey, business.reader) };
}

/**
 * The signing key of the link whose author is `author` (hex), from `sealed` (sealLinkKey), opened
 * with the key it was sealed for: null when it does not open, or is not that link's key.
 */
export function openLinkKey(sealed: string, reader: NostrKeys, author: string): Uint8Array | null {
  try {
    const text = nip44Decrypt(sealed, conversationKey(reader.secretKey, author));
    if (!/^[0-9a-f]{64}$/.test(text)) return null;
    const secretKey = hexToBytes(text);
    return bytesToHex(schnorr.getPublicKey(secretKey)) === author ? secretKey : null;
  } catch {
    return null;
  }
}

/**
 * The signing key of the link `author` from its record's seal (sealLinkKeyFor), opened with the
 * owner's key it names: the link key reader, or the registry's reading key for a record of before.
 */
export function openRecordLinkKey(
  seal: LinkKeySeal,
  readers: { linkKeyReader: NostrKeys; registryReader: NostrKeys },
  author: string
): Uint8Array | null {
  return openLinkKey(
    seal.sealedKey,
    seal.sealedFor === "link-key-reader" ? readers.linkKeyReader : readers.registryReader,
    author
  );
}
