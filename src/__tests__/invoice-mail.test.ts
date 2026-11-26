import { Linking } from "react-native";

import { openInvoiceMail, type InvoiceMail } from "@/features/invoices/invoice-mail";
import { openInvoiceMail as openInvoiceMailWeb } from "@/features/invoices/invoice-mail.web";
import { readLog } from "@/lib/log/log";

import type * as MailComposerFake from "../../jest/expo-mail-composer";
import type * as PrintFake from "../../jest/expo-print";

/*
 * "Send by email": the invoice's PDF attached wherever the device's
 * mail form takes it; the `mailto:` link, without it, where there is no such form and on the web.
 */

const mailComposer = jest.requireMock<typeof MailComposerFake>("expo-mail-composer");
const print = jest.requireMock<typeof PrintFake>("expo-print");

const HTML = "<html><head></head><body>Invoice 2026-0004</body></html>";

let MAIL: InvoiceMail;

beforeEach(() => {
  jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
  MAIL = {
    subject: "Invoice 2026-0004 · Fine Bakery",
    body: "Hello,\n\nTo pay it in bitcoin: https://web.example/pay#x",
    mailto: "mailto:?subject=Invoice&body=Hello",
    html: jest.fn(async () => HTML),
    fileName: "Invoice-2026-0004.pdf"
  };
});

describe("openInvoiceMail", () => {
  it("writes the mail in the mail form, the invoice's PDF attached under its name", async () => {
    await openInvoiceMail(MAIL);
    expect(mailComposer.mail.composed).toHaveLength(1);
    const [mail] = mailComposer.mail.composed;
    expect(mail).toMatchObject({ subject: MAIL.subject, body: MAIL.body });
    expect(mail!.recipients).toBeUndefined();
    expect(mail!.attachments).toEqual([expect.stringMatching(/\/cache\/Invoice-2026-0004\.pdf$/)]);
    // The invoice's HTML on its A4 page (pdf-page.ts).
    expect(mail!.attached).toHaveLength(1);
    expect(mail!.attached[0]).toContain("Invoice 2026-0004");
    expect(mail!.attached[0]).toContain("@page { size: A4;");
    expect(Linking.openURL).not.toHaveBeenCalled();
  });

  it("opens the mailto: link, without the PDF, where there is no mail form", async () => {
    mailComposer.mail.available = false;
    await openInvoiceMail(MAIL);
    expect(Linking.openURL).toHaveBeenCalledWith(MAIL.mailto);
    expect(mailComposer.mail.composed).toHaveLength(0);
    // No PDF made for nothing.
    expect(print.files).toHaveLength(0);
    expect(MAIL.html).not.toHaveBeenCalled();
  });

  it("writes the mail without the PDF when it cannot be made, and says so in the journal", async () => {
    jest.spyOn(print, "printToFileAsync").mockRejectedValueOnce(new Error("No printer"));
    await openInvoiceMail(MAIL);
    expect(mailComposer.mail.composed).toHaveLength(1);
    expect(mailComposer.mail.composed[0]!.attachments).toEqual([]);
    expect(readLog().entries.map((entry) => entry.event)).toContain(
      "Making the invoice's PDF for its mail failed"
    );
  });

  it("rejects when the mail form fails, for its caller to say so", async () => {
    jest.spyOn(mailComposer, "composeAsync").mockRejectedValueOnce(new Error("No activity"));
    await expect(openInvoiceMail(MAIL)).rejects.toThrow("No activity");
  });
});

describe("openInvoiceMail on the web", () => {
  it("opens the mailto: link, which no file can go with", async () => {
    await openInvoiceMailWeb(MAIL);
    expect(Linking.openURL).toHaveBeenCalledWith(MAIL.mailto);
    expect(mailComposer.mail.composed).toHaveLength(0);
    expect(print.files).toHaveLength(0);
    expect(MAIL.html).not.toHaveBeenCalled();
  });
});
