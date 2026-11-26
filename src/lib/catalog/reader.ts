import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";

import type { CatalogReader } from "@/lib/team/keys";

/*
 * The catalogue's reading keys as an employee's channel and a point of sale's device keep them:
 * what a CatalogReader (src/lib/team/keys.ts) is made from, in hex.
 */

/**
 * The catalogue's reading keys as a channel carries them (CatalogReader), hex: its author's public
 * key, the key of its `d` tags, its epoch (how many employees the team removed) and the NIP-44 keys
 * to try, the epoch's first, then the one before it (articles not sealed again yet).
 */
export type ChannelCatalog = {
  author: string;
  addressKey: string;
  epoch: number;
  encryptionKeys: string[];
};

const HEX_32 = /^[0-9a-f]{64}$/;

/** Most NIP-44 keys a channel's catalogue carries: its epoch's and the one before. */
const MAX_CATALOG_KEYS = 2;

/** A catalogue's reading keys (ChannelCatalog), null when invalid. */
export function parseChannelCatalog(value: unknown): ChannelCatalog | null {
  if (value === null || typeof value !== "object") return null;
  const c = value as Record<string, unknown>;
  if (
    typeof c.author !== "string" ||
    !HEX_32.test(c.author) ||
    typeof c.addressKey !== "string" ||
    !HEX_32.test(c.addressKey) ||
    typeof c.epoch !== "number" ||
    !Number.isSafeInteger(c.epoch) ||
    c.epoch < 0 ||
    !Array.isArray(c.encryptionKeys) ||
    c.encryptionKeys.length === 0 ||
    c.encryptionKeys.length > MAX_CATALOG_KEYS ||
    c.encryptionKeys.some((key) => typeof key !== "string" || !HEX_32.test(key))
  ) {
    return null;
  }
  return {
    author: c.author,
    addressKey: c.addressKey,
    epoch: c.epoch,
    encryptionKeys: [...(c.encryptionKeys as string[])]
  };
}

/** The reading keys of a catalogue a channel carries (CatalogReader). */
export function catalogReaderOf(catalog: ChannelCatalog): CatalogReader {
  const [first, ...others] = catalog.encryptionKeys.map((key) => hexToBytes(key));
  return {
    nostr: { publicKey: catalog.author },
    encryptionKey: first!,
    otherKeys: others,
    addressKey: hexToBytes(catalog.addressKey)
  };
}

/** A catalogue's reading keys at `epoch` as a channel carries them (ChannelCatalog). */
export function channelCatalogOf(reader: CatalogReader, epoch: number): ChannelCatalog {
  return {
    author: reader.nostr.publicKey,
    addressKey: bytesToHex(reader.addressKey),
    epoch,
    encryptionKeys: [reader.encryptionKey, ...(reader.otherKeys ?? [])]
      .slice(0, MAX_CATALOG_KEYS)
      .map((key) => bytesToHex(key))
  };
}

/** Whether two catalogues' reading keys are the same (a channel brought in step otherwise). */
export function sameChannelCatalog(
  a: ChannelCatalog | null | undefined,
  b: ChannelCatalog | null | undefined
): boolean {
  if (!a || !b) return !a && !b;
  return (
    a.author === b.author &&
    a.addressKey === b.addressKey &&
    a.epoch === b.epoch &&
    a.encryptionKeys.length === b.encryptionKeys.length &&
    a.encryptionKeys.every((key, i) => key === b.encryptionKeys[i])
  );
}
