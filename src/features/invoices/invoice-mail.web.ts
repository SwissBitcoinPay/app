import { openUri } from "@/lib/payment-link/device";

import type { InvoiceMail } from "./invoice-mail";

export type { InvoiceMail } from "./invoice-mail";

/*
 * Same API as invoice-mail.ts, in the browser: the `mailto:` link opens the holder's mail client
 * with the mail written, which no link can attach a file to (the PDF is "Download the PDF"'s).
 */

/** Opens the mail written, without the PDF. */
export async function openInvoiceMail(mail: InvoiceMail): Promise<void> {
  await openUri(mail.mailto);
}
