import { LEGACY_CARD_IMAGE_HOST } from "@/config/card";

import { ISSUER_NUMBER } from "./card-record";

/*
 * The visual printed on a v2 card, as its
 * server gives it in its answer to the migration's first request (src/features/card/migration.ts,
 * readLegacyBalance): `front_image`, the front's image on the v2 CDN; `card_id`, the number printed
 * on the card; `is_white`, a light card (its name then written in black). Optional: a
 * server that does not send all three, or one out of shape, gives none, and the card takes a
 * colour of the palette like any other (card-record.ts, defaultCardColor). The image is downloaded
 * once, from that host only (LEGACY_CARD_IMAGE_HOST), then kept on the account's relays
 * (src/features/card/issuer-visual.ts).
 */

/** What a v2 card's server tells of its visual, checked. */
export type LegacyVisual = {
  /** An https URL of LEGACY_CARD_IMAGE_HOST (legacyVisualOf). */
  imageUrl: string;
  /** The number printed on the card (ISSUER_NUMBER). */
  number: string;
  white: boolean;
};

/** The longest image URL taken: The v2 CDN serves `/api/records/v1/cdn_files/<id>/file/content`. */
const MAX_URL_LENGTH = 512;

/**
 * The image URLs taken: https on LEGACY_CARD_IMAGE_HOST exactly, its default port, a path of
 * unreserved characters, percent escapes and `=` only (the v2 server names the file by its id in
 * base64url WITH its padding, which its route requires: `…/cdn_files/AZoX…Q==/file/content`).
 * Checked as text, not with `URL`: React Native's reads its parts with regular expressions, which
 * the HTTP client that downloads it would not follow (a `\`, an `@`, a `#`); with none of them,
 * both read the same host.
 */
const IMAGE_URL = new RegExp(
  `^https://${LEGACY_CARD_IMAGE_HOST.replace(/\./g, "\\.")}/[A-Za-z0-9._~%/=-]*$`
);

/**
 * The visual a v2 card's server answered with (`fields`, the withdraw request's whole answer,
 * untrusted), or null when it gave none or one out of shape (IMAGE_URL, ISSUER_NUMBER, a boolean).
 */
export function legacyVisualOf(fields: Readonly<Record<string, unknown>>): LegacyVisual | null {
  const { front_image: image, card_id: number, is_white: white } = fields;
  if (typeof image !== "string" || image.length > MAX_URL_LENGTH || !IMAGE_URL.test(image)) {
    return null;
  }
  if (typeof number !== "string" || !ISSUER_NUMBER.test(number)) return null;
  if (typeof white !== "boolean") return null;
  return { imageUrl: image, number, white };
}

/**
 * The number printed on a v2 card, as its server answered with it (`card_id`, the withdraw
 * request's whole answer `fields`, untrusted), with a visual or not; null when it gave none, or one
 * out of shape (ISSUER_NUMBER). Its v2 history is read by it (src/features/card/legacy-history.ts).
 */
export function legacyNumberOf(fields: Readonly<Record<string, unknown>>): string | null {
  const { card_id: number } = fields;
  return typeof number === "string" && ISSUER_NUMBER.test(number) ? number : null;
}
