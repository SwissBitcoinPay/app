import { SUPPORT_EMAIL } from "@/config/support";
import { openUri } from "@/lib/payment-link/device";

import { REPORT_FILE_NAME } from "./report";
import type { SupportMail, SupportMailOutcome } from "./mail";

export type { SupportMail, SupportMailOutcome } from "./mail";

/*
 * Same API as mail.ts, in the browser: a `mailto:` link opens the holder's mail client with the
 * mail written, which no link can attach a file to. The journal's copy is downloaded first, for the
 * holder to attach (the body says so). How long the download's object URL stays, after which the
 * browser frees it.
 */
const DOWNLOAD_LIFETIME_MS = 60_000;

/** Downloads `text` as `name`, from this page. */
function download(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), DOWNLOAD_LIFETIME_MS);
}

/** The `mailto:` of a mail to support. Line breaks as CRLF (RFC 6068). */
export function supportMailto(subject: string, body: string): string {
  const text = body.replace(/\r?\n/g, "\r\n");
  const query = `subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
  return `mailto:${SUPPORT_EMAIL}?${query}`;
}

/** Downloads the journal's copy (when there is one), then opens the mail client. */
export async function openSupportMail(mail: SupportMail): Promise<SupportMailOutcome> {
  if (mail.report !== null) download(REPORT_FILE_NAME, mail.report);
  await openUri(supportMailto(mail.subject, mail.body));
  return "opened";
}

/** Downloads the journal's copy: the mail is open, its deposit failed (SupportSettings.tsx). */
export function downloadSupportReport(report: string): void {
  download(REPORT_FILE_NAME, report);
}

/** No share sheet for files on the web: the copy is downloaded with the mail (openSupportMail). */
export async function shareSupportReport(_report: string, _title: string): Promise<void> {
  throw new Error("No sharing of the journal on the web");
}

/** The web always opens a mail (`mailto:`): nothing to share instead. */
export async function shareSupportText(_text: string): Promise<void> {
  throw new Error("No sharing of the mail's text on the web");
}
