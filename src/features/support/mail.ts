import * as MailComposer from "expo-mail-composer";
import * as Sharing from "expo-sharing";

import { SUPPORT_EMAIL } from "@/config/support";
import { writeLogExport } from "@/lib/log/journal";
import { logFailure } from "@/lib/log/log";
import { shareWithSystem, withSystemUi } from "@/lib/system-ui";

import { REPORT_FILE_NAME } from "./report";

/*
 * The mail to support in the apps (expo-mail-composer, the
 * only way to attach a file to a mail written by the app): the system's mail form, the support's
 * address, the subject and the body written, the journal's copy attached. iOS shows it only with an
 * account in Mail; elsewhere the holder sends the copy from the share sheet (shareSupportReport).
 * The web: mail.web.ts.
 */

export type SupportMail = {
  subject: string;
  body: string;
  /** The journal's copy to attach (report.ts), or null. */
  report: string | null;
};

/**
 * "noMailApp": no mail form here (iOS without an account in Mail, Android without a mail app).
 * "openedWithoutReport": opened, the journal's copy not written (a full disk): without it.
 */
export type SupportMailOutcome = "opened" | "openedWithoutReport" | "noMailApp";

/** Opens the mail form with `mail` written. Rejects when the copy or the form failed. */
export async function openSupportMail(mail: SupportMail): Promise<SupportMailOutcome> {
  // Android: composeAsync throws without a mail app; iOS: without an account in Mail.
  if (!(await MailComposer.isAvailableAsync())) return "noMailApp";
  let attachments: string[] = [];
  let outcome: SupportMailOutcome = "opened";
  if (mail.report !== null) {
    try {
      attachments = [writeLogExport(REPORT_FILE_NAME, mail.report)];
    } catch (error) {
      logFailure("Writing the journal's copy failed", error);
      outcome = "openedWithoutReport";
    }
  }
  // The system's mail form over the app: coming back is not leaving it (src/lib/system-ui.ts).
  await withSystemUi(() =>
    MailComposer.composeAsync({
      recipients: [SUPPORT_EMAIL],
      subject: mail.subject,
      body: mail.body,
      attachments
    })
  );
  return outcome;
}

/**
 * The mail's text to the system's share sheet, without a mail form: the holder picks the app that
 * sends it (the journal deposited, its reference in the text).
 */
export async function shareSupportText(text: string): Promise<void> {
  await shareWithSystem({ message: text });
}

/** No download in the apps: the journal goes with the mail or the share sheet. */
export function downloadSupportReport(_report: string): void {
  throw new Error("No download of the journal in the apps");
}

/** The journal's copy to the system's share sheet: the holder picks the app that sends it. */
export async function shareSupportReport(report: string, title: string): Promise<void> {
  const uri = writeLogExport(REPORT_FILE_NAME, report);
  await withSystemUi(() =>
    Sharing.shareAsync(uri, {
      mimeType: "application/json",
      UTI: "public.json",
      dialogTitle: title
    })
  );
}
