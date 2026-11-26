import type { KnownLink } from "@/features/activity/load";
import { byNewest, type ActivityItem, type InvoiceRef } from "@/features/activity/model";
import { invoiceTotals } from "@/lib/invoice/amounts";
import { formatInvoiceNumber, type Invoice } from "@/lib/invoice/record";

import type { InvoiceAuthor } from "./invoices";

/*
 * The invoices of "New invoice" in "Wallet"'s list (one list, an invoice and a sale of the point of
 * sale side by side): a sent invoice is the row of its payment link, titled by its recipient; a
 * draft is a row of its own, "Draft", in "To follow up" (OWNER_FOLLOW_UPS). Either opens the
 * invoice's details (InvoiceDetail), not the sheet of a row's details.
 */

function refOf(invoice: Invoice): InvoiceRef {
  return {
    id: invoice.id,
    number: formatInvoiceNumber(invoice.number),
    recipient: invoice.recipient.name,
    status: invoice.status,
    dueDate: invoice.dueDate
  };
}

/** A draft's row: its total (what it asks, not received), dated by its last change. */
function draftItem(invoice: Invoice): ActivityItem {
  const { totalMinor } = invoiceTotals(invoice.lines);
  return {
    id: `invoice:${invoice.id}`,
    source: "link",
    timestamp: invoice.updatedAt,
    note: "",
    fiat:
      totalMinor > 0
        ? { minor: totalMinor, digits: invoice.currency.digits, currency: invoice.currency.code }
        : null,
    sats: null,
    state: "draft",
    rest: null,
    by: { kind: "you" },
    payments: [],
    link: null,
    invoice: refOf(invoice)
  };
}

/**
 * `items` (ownerActivity) with the invoices: each sent invoice on its link's row, each draft as a
 * row, the newest first. A sent invoice whose link no row lists (not read yet) shows when it is.
 */
export function withInvoices(
  items: readonly ActivityItem[],
  invoices: readonly Invoice[]
): ActivityItem[] {
  const byLink = new Map(
    invoices.flatMap((invoice) => (invoice.sent ? [[invoice.sent.link.id, invoice] as const] : []))
  );
  const rows = items.map((item) => {
    const invoice = item.link ? byLink.get(item.link.id) : undefined;
    return invoice ? { ...item, invoice: refOf(invoice) } : item;
  });
  const drafts = invoices.filter((invoice) => invoice.status === "draft").map(draftItem);
  return [...rows, ...drafts].sort(byNewest);
}

/**
 * The links of the invoices sent, for "Wallet" to read them whatever their age: the owner's
 * ("You"), and its assistants' (`authors`: "By" names the assistant).
 */
export function sentLinks(
  invoices: readonly Invoice[],
  authors: ReadonlyMap<string, InvoiceAuthor> = new Map()
): KnownLink[] {
  return invoices.flatMap((invoice) => {
    if (!invoice.sent) return [];
    const author = authors.get(invoice.id);
    return [
      {
        id: invoice.sent.link.id,
        key: invoice.sent.link.key,
        createdAt: invoice.sent.at,
        relays: invoice.sent.link.relays,
        ...(author
          ? { by: { kind: "member", id: author.id, name: author.name, assistant: true } as const }
          : {})
      }
    ];
  });
}
