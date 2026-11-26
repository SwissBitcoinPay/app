import * as MailComposer from "expo-mail-composer";

import { logFailure } from "@/lib/log/log";
import { openUri } from "@/lib/payment-link/device";
import { withSystemUi } from "@/lib/system-ui";

import { INVOICE_MARGINS } from "./invoice-html";
import { writePdf } from "./pdf";

/*
 * "Send by email" in the apps (the invoice's PDF attached wherever it can be): expo-mail-composer,
 * the only way to attach a file to a mail the app writes (as "Contact support",
 * src/features/support/mail.ts). Android hands it to the mail app the holder picks; iOS shows
 * Mail's own form, never Gmail's nor Outlook's, and only with an account in Mail. Without a mail
 * form (iOS without that account), the `mailto:` of before opens the default mail client, without
 * the PDF: no link can attach a file. A PDF that cannot be made leaves the mail without it, rather
 * than no mail. The web: invoice-mail.web.ts.
 */

export type InvoiceMail = {
  subject: string;
  body: string;
  /** The same mail as a `mailto:` link (invoiceMailto). */
  mailto: string;
  /** Makes the invoice's HTML (invoiceHtml), made into the PDF attached: only when it is. */
  html: () => Promise<string>;
  /** The PDF's name (invoiceFileName). */
  fileName: string;
};

/** Opens the mail written, the PDF attached when the device's mail form can take it. */
export async function openInvoiceMail(mail: InvoiceMail): Promise<void> {
  if (!(await MailComposer.isAvailableAsync())) {
    await openUri(mail.mailto);
    return;
  }
  let attachments: string[] = [];
  try {
    attachments = [await writePdf(await mail.html(), mail.fileName, INVOICE_MARGINS)];
  } catch (error) {
    logFailure("Making the invoice's PDF for its mail failed", error);
  }
  // The system's mail form over the app: coming back is not leaving it (src/lib/system-ui.ts).
  await withSystemUi(() =>
    MailComposer.composeAsync({ subject: mail.subject, body: mail.body, attachments })
  );
}
