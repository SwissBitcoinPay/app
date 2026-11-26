import { files } from "./expo-file-system";

/**
 * expo-mail-composer under Jest (src/features/support/mail.ts): the mails composed, with what their
 * attachments held then (read from the fake file system, as the mail app reads them), no mail app.
 * `available` false: a device without one (iOS without an account in Mail), where the SDK's
 * `composeAsync` rejects. Reset before each test (jest.after-env.ts).
 */

export enum MailComposerStatus {
  UNDETERMINED = "undetermined",
  SENT = "sent",
  SAVED = "saved",
  CANCELLED = "cancelled"
}

type Options = {
  recipients?: string[];
  subject?: string;
  body?: string;
  attachments?: string[];
};

export const mail = {
  available: true,
  composed: [] as (Options & { attached: (string | undefined)[] })[]
};

export async function isAvailableAsync(): Promise<boolean> {
  return mail.available;
}

export async function composeAsync(options: Options): Promise<{ status: MailComposerStatus }> {
  if (!mail.available) {
    throw new Error("Mail services are not available, make sure you're signed into the Mail app");
  }
  const attached = (options.attachments ?? []).map((uri) => files.get(uri));
  mail.composed.push({ ...options, attached });
  return { status: MailComposerStatus.SENT };
}

export function resetMailComposer(): void {
  mail.available = true;
  mail.composed.length = 0;
}
