import * as Clipboard from "expo-clipboard";
import type { TFunction } from "i18next";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Platform } from "react-native";

import { getAccountSettings } from "@/features/account/session";
import { useNotifications } from "@/features/notifications/NotificationsProvider";
import { reportFontFaces } from "@/features/wallet/export/report-fonts";
import { documentLocale, toLanguage, type Language } from "@/i18n/languages";
import { invoiceTotals } from "@/lib/invoice/amounts";
import { formatInvoiceNumber, type Invoice } from "@/lib/invoice/record";
import { getDeviceLocale } from "@/lib/locale/device";
import { logFailure } from "@/lib/log/log";
import { canCopyText, copyText, shareUrl } from "@/lib/payment-link/device";

import { dueDateLabel, moneyWithCurrency } from "./format";
import { INVOICE_MARGINS, invoiceFileName, invoiceHtml } from "./invoice-html";
import { openInvoiceMail } from "./invoice-mail";
import { sharePdf } from "./pdf";

/*
 * What can be done with an invoice sent (its details, and the screen after its creation): send it
 * by mail ("Send by email", the device's mail client with the mail written, the recipient to fill;
 * its PDF attached in the apps, invoice-mail.ts), copy its payment link, share it, download its
 * PDF, the mail and the PDF in the language the merchant picks (the app's at first). A failure says
 * what to do in a notification (no final period).
 */

type MailContext = { businessName: string; languageTag: string; t: TFunction };

/** The subject and the body of an invoice's mail. */
export function invoiceMailText(
  invoice: Invoice,
  { businessName, languageTag, t }: MailContext
): { subject: string; body: string } {
  const number = formatInvoiceNumber(invoice.number);
  const { totalMinor } = invoiceTotals(invoice.lines);
  return {
    subject: t("invoices.mail.subject", { number, business: businessName }),
    body: t("invoices.mail.body", {
      number,
      business: businessName,
      amount: moneyWithCurrency(totalMinor, invoice.currency, languageTag),
      date: invoice.dueDate ? dueDateLabel(invoice.dueDate, languageTag, "long") : "",
      url: invoice.sent?.link.url ?? ""
    })
  };
}

/**
 * The `mailto:` of an invoice: no recipient (the wizard asks for no email), the subject and the
 * body written. Line breaks as CRLF (RFC 6068).
 */
export function invoiceMailto(invoice: Invoice, context: MailContext): string {
  const { subject, body } = invoiceMailText(invoice, context);
  const text = body.replace(/\r?\n/g, "\r\n");
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
}

/**
 * An invoice's actions, its documents (its PDF, its mail and the PDF attached) in `language`: the
 * app's until the merchant picks another (DocumentLanguageChip), for both, their numbers and dates
 * in that language in the merchant's region (documentLocale). Notifications stay in the app's.
 */
export function useInvoiceActions(invoice: Invoice | null, businessName: string) {
  const { t, i18n } = useTranslation();
  const { notify } = useNotifications();
  const [deviceTag] = useState(() => getDeviceLocale().languageTag);
  const [language, setLanguage] = useState<Language>(() => toLanguage(i18n.language));
  const [pdfBusy, setPdfBusy] = useState(false);
  // The documents' words and locale.
  const dt = i18n.getFixedT(language);
  const languageTag = documentLocale(language, deviceTag);
  // Its PDF made before the mail form shows: a second tap meanwhile never opens a second form (on
  // Android, the first one's promise would never settle).
  const mailing = useRef(false);
  const url = invoice?.sent?.link.url ?? null;
  const fail = (title: string) => notify({ tone: "error", title, key: "invoice-action" });

  // Its HTML in Plus Jakarta Sans (the statement's faces, read once), with the business's address
  // and numbers as the account's settings hold them then: made when a PDF is.
  const html = async () =>
    invoice
      ? invoiceHtml(invoice, {
          businessName,
          language,
          languageTag,
          t: dt,
          business: getAccountSettings(),
          fontFaces: await reportFontFaces()
        })
      : "";

  return {
    /** The documents' language, and its choice. */
    language,
    setLanguage,
    pdfBusy,
    /** Opens the device's mail client with the mail written, its PDF attached in the apps. */
    mail: () => {
      if (!invoice || mailing.current) return;
      mailing.current = true;
      const context = { businessName, languageTag, t: dt };
      openInvoiceMail({
        ...invoiceMailText(invoice, context),
        mailto: invoiceMailto(invoice, context),
        html,
        fileName: invoiceFileName(invoice, dt)
      })
        .catch((error: unknown) => {
          logFailure("Opening the mail client failed", error);
          fail(t("invoices.errors.mailFailed"));
        })
        .finally(() => {
          mailing.current = false;
        });
    },
    /** Copies the payment link: true once copied. */
    copy: async (): Promise<boolean> => {
      if (!url) return false;
      try {
        if (Platform.OS === "web") {
          if (!canCopyText()) throw new Error("No clipboard");
          await copyText(url);
        } else {
          await Clipboard.setStringAsync(url);
        }
        notify({ tone: "success", title: t("invoices.sent.copied"), key: "invoice-action" });
        return true;
      } catch (error) {
        logFailure("Copying the payment link failed", error);
        fail(t("invoices.errors.copyFailed"));
        return false;
      }
    },
    /** The system's share sheet with the payment link (call it within the tap, before any await). */
    share: () => {
      if (!url) return;
      shareUrl(url).then(
        (outcome) => {
          if (outcome === "copied") {
            notify({ tone: "success", title: t("invoices.sent.copied"), key: "invoice-action" });
          }
        },
        (error: unknown) => {
          logFailure("Sharing the payment link failed", error);
          fail(t("invoices.errors.copyFailed"));
        }
      );
    },
    /** "Download the PDF": the share sheet with the PDF (the print dialog on the web). */
    pdf: () => {
      if (!invoice || pdfBusy) return;
      setPdfBusy(true);
      html()
        .then((made) =>
          sharePdf(
            made,
            dt("invoices.pdf.title", { number: formatInvoiceNumber(invoice.number) }),
            invoiceFileName(invoice, dt),
            INVOICE_MARGINS
          )
        )
        .catch((error: unknown) => {
          logFailure("Making the invoice's PDF failed", error);
          fail(t("invoices.errors.pdfFailed"));
        })
        .finally(() => setPdfBusy(false));
    }
  };
}
