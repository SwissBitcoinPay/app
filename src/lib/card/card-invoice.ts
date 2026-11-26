import { MAX_CARD_PAYMENT_SATS, MIN_CARD_PAYMENT_SATS } from "@/config/card";
import { bolt11ExpiresAt, decodeSignedBolt11 } from "@/lib/lightning/bolt11";

/*
 * The invoice a point of sale sends for a tap of a card (LUD-03 `pr`, through the relay's
 * WebSocket, contract v2): read and checked before the phone shows it. Anything from the relay is
 * untrusted, the point of sale's invoice included: what the phone pays is what it showed, checked
 * again by the wallet when paid (parseSendInput).
 */

const MSAT_PER_SAT = 1000n;
/** A BOLT11 invoice of more is not one a point of sale makes (the relay refuses over 2 048). */
const MAX_INVOICE_LENGTH = 2048;
/** Characters of the description shown: the rest is cut, with an ellipsis. */
export const MAX_DESCRIPTION_LENGTH = 140;

export type CardInvoice = {
  /** The invoice as received, for the wallet. */
  pr: string;
  amountSats: bigint;
  /** Its payment hash (hex): an invoice is never paid twice (payment-log.ts). */
  paymentHash: string;
  /**
   * Its description hash (hex), null for a plain description: the SHA-256 of the metadata of the
   * Lightning address that made it (LUD-06), which names the payee (payee-proof.ts).
   */
  descriptionHash: string | null;
  /** What the point of sale wrote (cleaned for display), null without a plain description. */
  description: string | null;
  /** Unix seconds after which it can no longer be paid. */
  expiresAt: number;
  /**
   * The node it pays: the key that signed it (decodeSignedBolt11), which names the payee when no proof
   * names its address (payee-proof.ts). Null when its signature holds for no key: the wallet then
   * refuses to pay it.
   */
  payeeNode: string | null;
};

export type CardInvoiceIssue =
  /** Not a BOLT11 invoice. */
  | "malformed"
  /** An invoice of another network than the wallet's. */
  | "otherNetwork"
  /** No amount, zero, or a fraction of a sat (never rounded). */
  | "noAmount"
  /** Out of the relay's bounds (its withdraw request: 1 000 to 100 000 000 msat). */
  | "outOfBounds"
  | "expired"
  /** Above the card's ceiling. */
  | "aboveLimit";

export type CardInvoiceRead =
  { ok: true; invoice: CardInvoice } | { ok: false; issue: CardInvoiceIssue };

/**
 * Control characters and the marks that reorder text (bidirectional overrides and isolates): a
 * description is shown as plain text, never laid out by the point of sale.
 */
const HIDDEN = /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;

/** A description fit for display: one line, without hidden characters, cut when too long. */
export function cleanDescription(text: string): string | null {
  const line = text.replace(HIDDEN, " ").replace(/\s+/g, " ").trim();
  if (line === "") return null;
  const chars = Array.from(line);
  return chars.length > MAX_DESCRIPTION_LENGTH
    ? `${chars.slice(0, MAX_DESCRIPTION_LENGTH - 1).join("")}…`
    : line;
}

/**
 * Reads `pr` for a card payment: an invoice of `network` (its BOLT11 prefix, "bc" on mainnet) for
 * a whole amount of sats from 1 to `maxSats`, not expired at `nowSeconds`.
 */
export function readCardInvoice(
  pr: unknown,
  { network, maxSats, nowSeconds }: { network: string; maxSats: bigint; nowSeconds: number }
): CardInvoiceRead {
  if (typeof pr !== "string" || pr.length > MAX_INVOICE_LENGTH) {
    return { ok: false, issue: "malformed" };
  }
  const signed = decodeSignedBolt11(pr);
  if (!signed) return { ok: false, issue: "malformed" };
  const decoded = signed.invoice;
  if (decoded.network !== network) return { ok: false, issue: "otherNetwork" };
  const msat = decoded.amountMsat;
  if (msat === null || msat <= 0n || msat % MSAT_PER_SAT !== 0n) {
    return { ok: false, issue: "noAmount" };
  }
  const amountSats = msat / MSAT_PER_SAT;
  if (amountSats < MIN_CARD_PAYMENT_SATS || amountSats > MAX_CARD_PAYMENT_SATS) {
    return { ok: false, issue: "outOfBounds" };
  }
  const expiresAt = bolt11ExpiresAt(decoded);
  if (expiresAt <= nowSeconds) return { ok: false, issue: "expired" };
  if (amountSats > maxSats) return { ok: false, issue: "aboveLimit" };
  return {
    ok: true,
    invoice: {
      pr,
      amountSats,
      paymentHash: decoded.paymentHash,
      descriptionHash: decoded.descriptionHash,
      description: decoded.description === null ? null : cleanDescription(decoded.description),
      expiresAt,
      payeeNode: signed.signer()
    }
  };
}
