import type { TFunction } from "i18next";

import { CARD_ANSWER_MS } from "@/config/card";
import { formatSats } from "@/features/wallet/send/amount";
import type { CardInvoice } from "@/lib/card/card-invoice";
import type { CardPayeeView } from "@/lib/card/payee-decision";

import { cardLabel } from "./card-label";
import { payeeName } from "./payee-label";
import type { CardPaid, CardPaymentFailure, PaidCard } from "./payment-core";

/*
 * The words of a card payment's notification, the app's (paid-notice.ts, background-wake.ts) and
 * the iOS notification service extension's (src/lib/engine/card-notice.ts): one text for one
 * outcome, whichever tells it. Words in the app's language (`t`), amounts in the device locale
 * (src/lib/locale/): those of the point of sale's provider, which reads the same. Amounts in whole
 * sats (exact), never a converted price. Pure: no React Native, so that the engine bundles it.
 */

/** `data.kind` of the notice of a payment that left: it carries no wake packet (`cr`, useCardWakes.ts). */
export const CARD_PAID_NOTICE = "cardPaid";
/** `data.kind` of a payment's notice (to confirm, refused): it carries no wake packet either. */
export const CARD_WAKE_NOTICE = "cardWake";

/**
 * Whom a payment pays, in a notice: as the payment's panel names it, a name the merchant declared
 * (its node's alias for a node) in quotation marks: the merchant
 * chose it, never the app.
 */
function noticeName(payee: CardPayeeView, t: TFunction): string {
  return payee.name === null ? payeeName(payee, t) : t("card.payee.quoted", { name: payee.name });
}

/** The notice of a payment that left: its amount, and whom it paid. */
export function cardPaidNotice(
  paid: CardPaid,
  t: TFunction,
  languageTag: string
): { title: string; body: string } {
  const amount = formatSats(paid.amountSats, languageTag);
  return {
    title: t("card.notice.title", { amount }),
    body: t("card.notice.body", { amount, name: noticeName(paid.payee, t) })
  };
}

/** A payment the holder is asked to confirm in the app, the app not shown (background-wake.ts). */
export function cardAskNotice(
  asked: { invoice: CardInvoice; payee: CardPayeeView },
  t: TFunction,
  languageTag: string
): { title: string; body: string } {
  return {
    title: t("card.notice.askTitle"),
    body: t("card.notice.askBody", {
      amount: formatSats(asked.invoice.amountSats, languageTag),
      name: noticeName(asked.payee, t)
    })
  };
}

/**
 * A payment handed over to the app (the iOS extension's, src/lib/engine/card-wake.ts): to confirm
 * there, as cardAskNotice says it; its amount alone while its payee is not checked; neither while
 * its invoice has not come.
 */
export function cardHandedOverNotice(
  handedOver: { invoice: CardInvoice | null; payee: CardPayeeView | null },
  t: TFunction,
  languageTag: string
): { title: string; body: string } {
  const { invoice, payee } = handedOver;
  if (invoice && payee) return cardAskNotice({ invoice, payee }, t, languageTag);
  return {
    title: t("card.notice.askTitle"),
    body: invoice
      ? t("card.notice.askBodyUnchecked", { amount: formatSats(invoice.amountSats, languageTag) })
      : t("card.notice.askBodyNoInvoice")
  };
}

/**
 * The answer's time of a card payment in words ("within a minute"): a minute, or the seconds the
 * relay left (a relay of before 2.1.0, a phone that connected late, payment.ts cardAnswerMs), never
 * a time the payment does not have. `answerMs` null: not known yet, a minute.
 */
export function answerDelay(answerMs: number | null, t: TFunction): string {
  const seconds = Math.round((answerMs ?? CARD_ANSWER_MS) / 1000);
  return seconds >= CARD_ANSWER_MS / 1000
    ? t("card.payment.delay.minute")
    : t("card.payment.delay.seconds", { count: seconds });
}

/**
 * A payment refused, the app not shown (background-wake.ts): its amount and whom it would have paid,
 * once checked (before, the payee is not named: it would read as "Unknown name", which it is not);
 * why, in the panel's words; a card in pause named ("Daily is paused"), once its tap told which it
 * is. An invoice refused as it was read (above the card's ceiling, expired…) has no amount told.
 */
export function cardRefusedNotice(
  refused: {
    invoice: CardInvoice | null;
    failure: CardPaymentFailure;
    answerMs: number | null;
    payee: CardPayeeView | null;
    card: PaidCard | null;
  },
  t: TFunction,
  languageTag: string
): { title: string; body: string } {
  const amount = refused.invoice && formatSats(refused.invoice.amountSats, languageTag);
  return {
    title:
      amount === null
        ? t("card.notice.refusedTitleNoInvoice")
        : refused.payee === null
          ? t("card.notice.refusedTitleUnchecked", { amount })
          : t("card.notice.refusedTitle", { amount, name: noticeName(refused.payee, t) }),
    body:
      refused.failure === "suspended" && refused.card
        ? t("card.notice.pausedBody", { card: cardLabel(refused.card, t) })
        : t(`card.payment.failure.${refused.failure}`, {
            delay: answerDelay(refused.answerMs, t)
          })
  };
}
