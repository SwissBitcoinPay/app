import { parseFiatMinor } from "@/features/wallet/send/amount";
import { parseQuantity, parseVatRate, type InvoiceLine } from "@/lib/invoice/amounts";
import type { Invoice, InvoiceRecipient } from "@/lib/invoice/record";
import { decimalSeparator } from "@/lib/locale/format";
import { secureRandomBytes } from "@/lib/random";
import { formatFiatPlain } from "@/lib/terminal/amount";

import { defaultDueDate, type InvoiceForm } from "./invoices";

/*
 * What the wizard of "New invoice" holds while the merchant types: the lines as typed (their
 * numbers as text, checked as they change), the rest as the invoice saves it (InvoiceForm).
 */

/** A line as typed: its numbers are text until they are read (lineOf). */
export type LineDraft = {
  /** Stable while the line exists: React's key, the line expanded. */
  key: string;
  name: string;
  quantity: string;
  /** The unit price before VAT, in the invoice's currency. */
  price: string;
  /** The VAT rate, in percent ("8.1"). */
  vat: string;
  /** The catalogue's article it was picked from: never offered to save (SaveToCatalog). */
  article?: string;
};

export type WizardState = Omit<InvoiceForm, "lines"> & {
  lines: LineDraft[];
  /** "Add a redirect URL" pressed, or a URL in it. */
  redirectOpen: boolean;
};

export function newLineKey(): string {
  return Array.from(secureRandomBytes(6), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** A rate in basis points as typed in percent, with the device's separator: 810 → "8.1". */
export function vatText(rate: number, languageTag: string): string {
  const whole = Math.floor(rate / 100);
  const fraction = String(rate % 100)
    .padStart(2, "0")
    .replace(/0+$/, "");
  return fraction === "" ? String(whole) : `${whole}${decimalSeparator(languageTag)}${fraction}`;
}

/** A quantity in hundredths as typed: 150 → "1.5", 2400 → "24". */
export function quantityText(quantity: number, languageTag: string): string {
  return vatText(quantity, languageTag);
}

/** A typed line read, or null while one of its numbers is not one. */
export function lineOf(draft: LineDraft, digits: number): InvoiceLine | null {
  const quantity = parseQuantity(draft.quantity);
  const unitMinor = parseFiatMinor(draft.price, digits);
  const vatRate = parseVatRate(draft.vat);
  if (quantity === null || unitMinor === null || vatRate === null) return null;
  return { name: draft.name, quantity, unitMinor, vatRate };
}

/** The lines read, those whose numbers are not ones left out (a draft saves what it can). */
export function readLines(lines: readonly LineDraft[], digits: number): InvoiceLine[] {
  return lines.flatMap((line) => {
    const read = lineOf(line, digits);
    return read ? [read] : [];
  });
}

/** A line of an invoice as the wizard shows it. */
export function draftOf(line: InvoiceLine, digits: number, languageTag: string): LineDraft {
  return {
    key: newLineKey(),
    name: line.name,
    quantity: quantityText(line.quantity, languageTag),
    price: formatFiatPlain(line.unitMinor, digits, languageTag),
    vat: vatText(line.vatRate, languageTag)
  };
}

const EMPTY_RECIPIENT: Omit<InvoiceRecipient, "country"> = {
  name: "",
  street: "",
  postalCode: "",
  city: "",
  reference: ""
};

/** A new invoice in `currency`: the recipient in `country`, due in 30 days, nothing else kept. */
export function newWizardState(
  currency: { code: string; digits: number },
  country: string
): WizardState {
  return {
    recipient: { ...EMPTY_RECIPIENT, country },
    currency,
    lines: [],
    dueDate: defaultDueDate(),
    terms: "",
    legal: "",
    redirectUrl: null,
    redirectOpen: false
  };
}

/**
 * A saved invoice in the wizard: a draft opened again, or one duplicated (`copy`: a new invoice of
 * the same recipient and lines, due in 30 days). A copy leaves the client's reference out: it
 * belongs to the order invoiced, and the wizard no longer has a field to change it (a draft keeps
 * its own).
 */
export function wizardStateOf(invoice: Invoice, languageTag: string, copy = false): WizardState {
  const { digits } = invoice.currency;
  return {
    recipient: copy ? { ...invoice.recipient, reference: "" } : invoice.recipient,
    currency: invoice.currency,
    lines: invoice.lines.map((line) => draftOf(line, digits, languageTag)),
    dueDate: copy ? defaultDueDate() : invoice.dueDate,
    terms: invoice.terms,
    legal: invoice.legal,
    redirectUrl: invoice.redirectUrl,
    redirectOpen: invoice.redirectUrl !== null
  };
}

/** What the wizard holds, as the invoice saves it: the lines read. */
export function formOf(state: WizardState): InvoiceForm {
  return {
    recipient: state.recipient,
    currency: state.currency,
    lines: readLines(state.lines, state.currency.digits),
    dueDate: state.dueDate,
    terms: state.terms,
    legal: state.legal,
    redirectUrl: state.redirectUrl
  };
}
