import type { TFunction } from "i18next";

import { LnurlError } from "@/lib/lightning/lnurl";

/** The most of a card service's reason shown, in UTF-16 code units: the card relay's own bound. */
export const MAX_REFUSAL_LENGTH = 200;

/** Why a card did not pay the invoice, as the point of sale shows it over its code. */
export type CardRefusal = {
  title: string;
  /**
   * The card's service's reason as it came, cleaned (cleanServiceReason): the words of the
   * holder's app, in its holder's language, for a card of sattle.me; another service's own.
   * Otherwise the point of sale's own sentence.
   */
  message: string;
};

// Characters that print nothing, or that reorder or hide what follows (bidirectional controls,
// tags): a service could make its text read otherwise than it is. Joiners stay (emoji, scripts).
const INVISIBLE =
  /[\u00ad\u061c\u180e\u200b\u200e\u200f\u202a-\u202e\u2060-\u2064\u2066-\u206f\ufeff\ufff9-\ufffb]|\udb40[\udc00-\udc7f]/g;
// Line breaks and other controls: one line of text, as a space.
const BREAKS = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g;

/**
 * A card service's reason as shown: its words unchanged, without invisible characters nor line
 * breaks, spaces collapsed, cut at MAX_REFUSAL_LENGTH (never inside a surrogate pair, "…" then
 * ending it). Empty when nothing visible is left.
 */
export function cleanServiceReason(reason: string): string {
  const text = reason.replace(INVISIBLE, "").replace(BREAKS, " ").replace(/\s+/g, " ").trim();
  if (text.length <= MAX_REFUSAL_LENGTH) return text;
  let cut = text.slice(0, MAX_REFUSAL_LENGTH - 1);
  const last = cut.charCodeAt(cut.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) cut = cut.slice(0, -1);
  return `${cut.trimEnd()}…`;
}

/**
 * What the point of sale says of a card that did not pay: the reason its service gave, as it gave
 * it; without one, what the point of sale itself knows, in its own language. A service's text is
 * always shown under "Card declined", never as anything else: a service that wrote "Payment
 * accepted" would still read as a refusal, and only the invoice's own check says "Paid".
 */
export function cardRefusalOf(error: unknown, t: TFunction): CardRefusal {
  if (error instanceof LnurlError) {
    switch (error.code) {
      case "service": {
        const reason = cleanServiceReason(error.reason ?? "");
        return {
          title: t("pos.boltcard.refusal.refused"),
          message: reason === "" ? t("pos.boltcard.refusal.noReason") : reason
        };
      }
      case "outOfRange":
        return {
          title: t("pos.boltcard.refusal.refused"),
          message: t("pos.boltcard.refusal.outOfRange")
        };
      case "network":
        return {
          title: t("pos.boltcard.refusal.interrupted"),
          message: t("pos.boltcard.refusal.noAnswer")
        };
      default:
        break;
    }
  }
  // Not read (the NFC reading failed), not an LNURL-withdraw, or a service's answer out of shape.
  return { title: t("pos.boltcard.refusal.unread"), message: t("pos.boltcard.refusal.unreadable") };
}
