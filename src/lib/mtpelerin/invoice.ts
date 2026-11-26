import { bolt11ExpiresAt, decodeBolt11 } from "@/lib/lightning/bolt11";
import { cleanDescription } from "@/lib/card/card-invoice";

/*
 * Mt Pelerin's invoices, checked before they are shown or paid, as the app's other invoices
 * (src/lib/card/card-invoice.ts): of this build's network, of exactly the amount expected, not
 * expired. The 1-sat invoice that proves the Lightning address (an amount other than 1 sat is
 * treated as a normal payment, not as a validation), and a sale's invoice, which must ask for
 * exactly the sats the
 * merchant agreed to sell. Pure.
 */

/** The 1-sat invoice's amount: 1 sat, its 1000 millisatoshis. */
export const VALIDATION_SATS = 1n;
/** Longer than any invoice with a short memo: never decoded. */
const MAX_INVOICE_LENGTH = 2048;
/**
 * An invoice that ends sooner than this is asked again: the passkey and the payment need time. The
 * app's own margin, never shown.
 */
export const INVOICE_MIN_LIFE_SECONDS = 60;

export type CheckedInvoice = {
  /** The bolt11 invoice, as Mt Pelerin gave it. */
  pr: string;
  amountSats: bigint;
  paymentHash: string;
  /** Its memo, fit for display; null without one. */
  description: string | null;
  /** Unix seconds. */
  expiresAt: number;
};

export type InvoiceIssue = "malformed" | "otherNetwork" | "otherAmount" | "expired";

export type InvoiceRead =
  { ok: true; invoice: CheckedInvoice } | { ok: false; issue: InvoiceIssue };

/**
 * Reads `pr`: an invoice of `network` (its BOLT11 prefix, "bc" on mainnet) of exactly `amountSats`,
 * which still has INVOICE_MIN_LIFE_SECONDS at `nowSeconds`.
 */
export function readExactInvoice(
  pr: unknown,
  { network, nowSeconds, amountSats }: { network: string; nowSeconds: number; amountSats: bigint }
): InvoiceRead {
  if (typeof pr !== "string" || pr.length > MAX_INVOICE_LENGTH) {
    return { ok: false, issue: "malformed" };
  }
  const decoded = decodeBolt11(pr);
  if (!decoded) return { ok: false, issue: "malformed" };
  if (decoded.network !== network) return { ok: false, issue: "otherNetwork" };
  if (decoded.amountMsat !== amountSats * 1000n) return { ok: false, issue: "otherAmount" };
  const expiresAt = bolt11ExpiresAt(decoded);
  if (expiresAt - nowSeconds < INVOICE_MIN_LIFE_SECONDS) return { ok: false, issue: "expired" };
  return {
    ok: true,
    invoice: {
      pr,
      amountSats,
      paymentHash: decoded.paymentHash,
      description: decoded.description === null ? null : cleanDescription(decoded.description),
      expiresAt
    }
  };
}

/** The 1-sat invoice that proves the Lightning address. */
export function readValidationInvoice(
  pr: unknown,
  options: { network: string; nowSeconds: number }
): InvoiceRead {
  return readExactInvoice(pr, { ...options, amountSats: VALIDATION_SATS });
}

/**
 * `comment`: the invoice memo, shown by the payer's wallet, as Mt Pelerin's example writes it. The
 * merchant's Lightning address only: no name.
 */
export function validationComment(lightningAddress: string): string {
  return `I hereby certify owning ${lightningAddress}`;
}
