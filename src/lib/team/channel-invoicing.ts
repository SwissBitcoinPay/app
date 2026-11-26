import { MAX_VAT_BASIS_POINTS } from "@/config/invoices";
import { isCheckoutOrigin } from "@/lib/payment-link/checkout";
import { isBusinessAddress, isBusinessNumber, type BusinessAddress } from "@/lib/settings/merchant";

import { isPublicKey } from "./shared";

/*
 * What an assistant's channel adds to an employee's: what the business's invoices print
 * ("Settings › Business", as the owner's
 * invoices print it: src/features/invoices/business-details.ts), the account's default VAT rate,
 * the web app its payment links open on, and how it takes a number in the owner's series (the
 * shared counter, src/lib/invoice/counter.ts): the counter's key and the other writers whose
 * counters it reads. Written by the owner's devices only, at each synchronisation of the channels
 * (src/features/team/owner.ts): the settings it copies change there first.
 */

/** Most writers a channel names: the owner, its assistants and those removed within the year. */
export const MAX_COUNTER_WRITERS = 64;

export type ChannelInvoicing = {
  businessAddress: BusinessAddress | null;
  companyNumber: string;
  vatNumber: string;
  /** ISO 3166-1 alpha-2: the country detected when the account was created, null if none. */
  detectedCountry: string | null;
  /** The account's default VAT rate, in basis points (defaultVatRate of src/features/invoices/). */
  vatRate: number;
  /**
   * The origin of the web app the payment links open on (`getPaymentLinkOrigin`), null without one
   * (a build without RP ID: local, CI): the assistant makes no invoice then. Checked as a checkout
   * link's origin (isCheckoutOrigin): the same web app.
   */
  linkOrigin: string | null;
  /** Hex, 32 bytes: the key of the shared counter (invoiceCounterKey of src/lib/team/keys.ts). */
  counterKey: string;
  /**
   * The other writers of numbers whose counters the assistant reads before taking one (hex: their
   * invoices' authors): the owner's, then the account's other assistants', those removed within
   * the year included (src/lib/invoice/counter.ts says why). Never itself: it reads its own anyway.
   */
  counterWriters: string[];
};

const COUNTRY = /^[A-Z]{2}$/;
const HEX_32 = /^[0-9a-f]{64}$/;

/** What a channel's `invoicing` holds, null when it is not that whole. */
export function parseChannelInvoicing(value: unknown): ChannelInvoicing | null {
  if (value === null || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (
    !(v.businessAddress === null || isBusinessAddress(v.businessAddress)) ||
    !isBusinessNumber(v.companyNumber) ||
    !isBusinessNumber(v.vatNumber) ||
    !(
      v.detectedCountry === null ||
      (typeof v.detectedCountry === "string" && COUNTRY.test(v.detectedCountry))
    ) ||
    !Number.isSafeInteger(v.vatRate) ||
    (v.vatRate as number) < 0 ||
    (v.vatRate as number) > MAX_VAT_BASIS_POINTS ||
    !(v.linkOrigin === null || isCheckoutOrigin(v.linkOrigin)) ||
    typeof v.counterKey !== "string" ||
    !HEX_32.test(v.counterKey) ||
    !Array.isArray(v.counterWriters) ||
    v.counterWriters.length > MAX_COUNTER_WRITERS
  ) {
    return null;
  }
  const writers = v.counterWriters as unknown[];
  if (!writers.every(isPublicKey) || new Set(writers).size !== writers.length) return null;
  return {
    businessAddress: v.businessAddress as BusinessAddress | null,
    companyNumber: v.companyNumber,
    vatNumber: v.vatNumber,
    detectedCountry: v.detectedCountry as string | null,
    vatRate: v.vatRate as number,
    linkOrigin: v.linkOrigin as string | null,
    counterKey: v.counterKey,
    counterWriters: [...writers]
  };
}
