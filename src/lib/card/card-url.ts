import { isCanonicalRelayHost } from "./relay-host";

/*
 * What a paired card holds in its NDEF file (NTAG 424 DNA file 02h): one NDEF URI record,
 * `lnurlw://<relay host>/w?p=<32 hex>&c=<16 hex>` (LUD-17, boltcard/docs/SPEC.md), whose `p` and
 * `c` the card mirrors at each read (Secure Dynamic Messaging, sun.ts). The file is written once
 * with placeholders; the offsets of `p` and `c` go into its SDM settings (ntag424.ts).
 */

/** The NDEF file of an NTAG 424 DNA (data sheet §8.2.3). */
export const NDEF_FILE_NO = 2;

/**
 * Longest file content the app writes: a single WriteData frame of up to 128 bytes is tearing
 * protected (data sheet §8.2.3.1), so a card pulled away mid-write keeps either its old content
 * or the new one. With the fixed parts of the URL, a relay host of up to 56 characters.
 */
export const MAX_FILE_CONTENT = 128;

/** The path of the relay's LUD-03 endpoint (relay contract v2: `GET /w?p&c`). */
const PATH = "/w";

const P_PLACEHOLDER = "0".repeat(32);
const C_PLACEHOLDER = "0".repeat(16);

/**
 * The longest relay host a card holds ("Change relay" says it): MAX_FILE_CONTENT less NLEN
 * (2 bytes), the record's header (4), the URI identifier code (1) and the URL's fixed parts, one
 * byte per character of a canonical host.
 */
export const MAX_RELAY_HOST_LENGTH =
  MAX_FILE_CONTENT - 2 - 4 - 1 - `lnurlw://${PATH}?p=${P_PLACEHOLDER}&c=${C_PLACEHOLDER}`.length;

/** The URL a card of `host` sends, with its tap's `p` and `c`. */
export function cardUrl(host: string, p: string, c: string): string {
  return `lnurlw://${host}${PATH}?p=${p}&c=${c}`;
}

export type CardFileTemplate = {
  /** The NDEF file's content: NLEN (2 bytes, big-endian), then the record. */
  bytes: Uint8Array;
  /** Where the card mirrors `p` (PICCDataOffset) and `c` (SDMMACOffset, SDMMACInputOffset). */
  pOffset: number;
  cOffset: number;
};

export class CardUrlTooLongError extends Error {
  constructor() {
    super(`The card's URL does not fit in ${MAX_FILE_CONTENT} bytes`);
    this.name = "CardUrlTooLongError";
  }
}

/**
 * The NDEF file of a card paired with the relay `host` (canonical, relay-host.ts), placeholders
 * in place of `p` and `c`. Throws CardUrlTooLongError when it would not fit in one write.
 */
export function cardFileTemplate(host: string): CardFileTemplate {
  if (!isCanonicalRelayHost(host)) throw new Error("Relay host not canonical");
  const url = cardUrl(host, P_PLACEHOLDER, C_PLACEHOLDER);
  // A canonical host is ASCII: one byte per character.
  const payload = [0x00, ...Array.from(url, (char) => char.charCodeAt(0))];
  // Short record (SR): MB, ME, SR set, TNF 1 (NFC Forum well-known type), type "U" (RTD URI),
  // URI identifier code 0 (no prefix, the URL is written whole).
  const record = [0xd1, 0x01, payload.length, 0x55, ...payload];
  const bytes = Uint8Array.from([record.length >> 8, record.length & 0xff, ...record]);
  if (bytes.length > MAX_FILE_CONTENT) throw new CardUrlTooLongError();
  // NLEN, the record's 4 header bytes and the URI identifier code come before the URL.
  const urlStart = 2 + 4 + 1;
  return {
    bytes,
    pOffset: urlStart + url.indexOf("?p=") + 3,
    cOffset: urlStart + url.indexOf("&c=") + 3
  };
}

/** Whether `host` can be written into a card: canonical, and short enough. */
export function fitsInCard(host: string): boolean {
  if (!isCanonicalRelayHost(host)) return false;
  try {
    cardFileTemplate(host);
    return true;
  } catch {
    return false;
  }
}

/** What a card's file holds of the template: the hex the card wrote in place of `p` and `c`. */
export type TemplateMatch = { p: string; c: string; placeholders: boolean };

const UPPER_HEX = /^[0-9A-F]+$/;

/**
 * `file` (from its first byte) read as the template: every byte as the template's, but `p` and
 * `c`, which must be uppercase hex (the card's ASCII mirroring) or the placeholders. Null for any
 * other content: another URL, another relay, another card's format.
 */
export function matchTemplate(file: Uint8Array, template: CardFileTemplate): TemplateMatch | null {
  const { bytes, pOffset, cOffset } = template;
  if (file.length < bytes.length) return null;
  const inP = (i: number) => i >= pOffset && i < pOffset + 32;
  const inC = (i: number) => i >= cOffset && i < cOffset + 16;
  for (let i = 0; i < bytes.length; i++) {
    if (!inP(i) && !inC(i) && file[i] !== bytes[i]) return null;
  }
  const text = (from: number, length: number) =>
    String.fromCharCode(...file.subarray(from, from + length));
  const p = text(pOffset, 32);
  const c = text(cOffset, 16);
  if (!UPPER_HEX.test(p) || !UPPER_HEX.test(c)) return null;
  return { p, c, placeholders: p === P_PLACEHOLDER && c === C_PLACEHOLDER };
}

/** Whether a file holds no NDEF message: NLEN 0, as a blank card's. */
export function isEmptyNdef(file: Uint8Array): boolean {
  return file.length >= 2 && file[0] === 0 && file[1] === 0;
}

/**
 * The relay host that a card file of this format names (cardFileTemplate: its placeholders, or a
 * tap the card mirrored), null for any other content. Unproven (anyone can write such a file): it
 * only tells which relay a programming of the card was for.
 */
export function relayOfCardFile(file: Uint8Array): string | null {
  // NLEN, then the record cardFileTemplate writes: its header, its payload's length, type "U", URI
  // identifier code 0, the URL.
  if (file.length < 7 || file[2] !== 0xd1 || file[3] !== 0x01 || file[5] !== 0x55) return null;
  if (file[6] !== 0x00) return null;
  const url = String.fromCharCode(...file.subarray(7, 7 + file[4] - 1));
  const host = /^lnurlw:\/\/([^/]+)\/w\?/.exec(url)?.[1];
  if (host === undefined || !fitsInCard(host)) return null;
  return matchTemplate(file, cardFileTemplate(host)) ? host : null;
}

/** Whether a file holds a card file of this format with its placeholders, for any relay. */
export function holdsPlaceholders(file: Uint8Array): boolean {
  const host = relayOfCardFile(file);
  return host !== null && matchTemplate(file, cardFileTemplate(host))?.placeholders === true;
}
