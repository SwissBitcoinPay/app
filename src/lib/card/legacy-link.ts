import { CARDS_PATH, LEGACY_CARD_LINK_HOST } from "@/config/card";

import { ISSUER_NUMBER, isCardShown, type CardState } from "./card-record";

/*
 * The link printed on the v2 cards: `https://sbpc.ch/<number>`, the card's
 * printed number ("1709-1248-5643-8482"), the one its server gave at its migration and its record
 * keeps (CardIssuer, src/lib/card/legacy-visual.ts). Scanned with the phone's camera, the system
 * opens the app with it (iOS universal links, Android App Links: app.config.ts), whose router
 * rewrites it (src/app/+native-intent.ts) into "Cards" on that card (CardsScreen.tsx), or
 * "Add a card" when the account has none of that number.
 *
 * Read as text, never with `URL` (React Native's reads its parts with regular expressions of its
 * own, as legacy-visual.ts says): https, the host exactly (in any case: the system may give the
 * link as the code holds it, and a QR code's alphanumeric mode has capitals only), then the number
 * as the only segment of the path, then nothing but a query or a fragment, which nothing reads.
 * Anything else names no card: `https://sbpc.ch@other.example/…` or
 * `https://sbpc.ch.other.example/…` are another host's.
 */

const HOST = LEGACY_CARD_LINK_HOST.replace(/\./g, "\\.");

/** An address of the host: its origin, then a path, a query, a fragment, or nothing. */
const HOST_LINK = new RegExp(`^https://${HOST}(?:[/?#]|$)`, "i");

/**
 * The printed link: one segment of path (the number, checked by ISSUER_NUMBER), then a query or a
 * fragment, without a space.
 */
const PRINTED_LINK = new RegExp(`^https://${HOST}/([^/?#]*)(?:[?#][^\\s]*)?$`, "i");

/** The printed number the link of a v2 card names (`url`, untrusted), or null for any other text. */
export function legacyCardLinkNumber(url: string): string | null {
  const number = PRINTED_LINK.exec(url)?.[1];
  return number !== undefined && ISSUER_NUMBER.test(number) ? number : null;
}

/** Whether `url` is an address of the v2 cards' link host, whatever its path. */
export function isLegacyCardLinkHost(url: string): boolean {
  return HOST_LINK.test(url);
}

/**
 * The card "Cards" shows (isCardShown: never a card deleted, whose record keeps its printed
 * visual) whose printed number is `number`, or null. Letters in any case: what was printed is the
 * number the server gave, and a code may hold it in capitals (above); two cards of one account whose
 * numbers differ only by the case of their letters are not told apart, the first of `cards` (in
 * their order) is taken. A card whose server gave no visual at its migration, or whose visual could
 * not be kept, has no number: never found.
 */
export function cardOfPrintedNumber(cards: readonly CardState[], number: string): CardState | null {
  const wanted = number.toUpperCase();
  return (
    cards.find((card) => isCardShown(card) && card.issuer?.number.toUpperCase() === wanted) ?? null
  );
}

/**
 * What "Cards" was opened with by a printed link (printedCardHref), checked: its address's
 * parameters are untrusted (a link of the app's own scheme can carry any, a key given twice comes
 * as a list). Null unless the number is a printed number and the scan one number.
 */
export function printedScanOf(
  printed: string | string[] | undefined,
  scan: string | string[] | undefined
): { number: string; scan: string } | null {
  if (typeof printed !== "string" || !ISSUER_NUMBER.test(printed)) return null;
  if (typeof scan !== "string" || !/^[0-9]{1,15}$/.test(scan)) return null;
  return { number: printed, scan };
}

/**
 * "Cards" opened on the card of a printed link: its number, and which link of this run of the app
 * it is (`scan`, counted by +native-intent.ts, never a clock's time), which tells two scans of the
 * same card apart (the second chooses it again).
 */
export function printedCardHref(number: string, scan: number): string {
  return `${CARDS_PATH}?printed=${encodeURIComponent(number)}&scan=${scan}`;
}
