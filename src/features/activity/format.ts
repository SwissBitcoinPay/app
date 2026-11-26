import { useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";

import type { CalloutStep } from "@/components/ui/Callout";
import type { IconName } from "@/components/ui/Icon";
import type { PillSign } from "@/components/ui/StatusPill";
import { usePos } from "@/features/terminal/pos";
import { useWalletFormat } from "@/features/wallet/format";
import {
  dayOf,
  formatSignedFiat,
  recipientOf,
  satsToFiatMinor,
  type Sign
} from "@/features/wallet/model";
import { followPaymentRates, knownPaymentRates } from "@/features/wallet/payment-rates";
import { MAX_DEPOSIT_CLAIM_FEE_SATS } from "@/lib/breez/config";
import { formatDate } from "@/lib/locale/date";
import { formatInteger } from "@/lib/locale/format";
import type { PaymentRate } from "@/lib/rates/payment-rates";
import { currencyDigits, formatSatsGrouped } from "@/lib/terminal/amount";
import type { PaymentState } from "@/theme";

import {
  followUpAmount,
  type ActivityItem,
  type ActivitySource,
  type ActivityState,
  type Fiat,
  type FollowUp
} from "./model";

export const SOURCE_ICONS: Record<ActivitySource, IconName> = {
  pos: "calculator",
  link: "file-invoice",
  // As "Integrations" in the navigation.
  integration: "plug",
  receive: "arrow-down",
  send: "arrow-up",
  // Funds the operators' watchtower defended, back in the balance.
  recovered: "shield-halved"
};

/**
 * The pill of each state (theme `colors.state`): "Failed" and "Canceled" in the canceled red, as
 * the wallet.
 */
const PILL_STATES: Record<ActivityState, PaymentState> = {
  draft: "draft",
  open: "open",
  underpaid: "underpaid",
  unconfirmed: "unconfirmed",
  expired: "expired",
  canceled: "canceled",
  inProgress: "open",
  failed: "canceled"
};

/**
 * The sign of a state's pill: "Open" the open state's pulsing dot, "Underpaid" the warning
 * triangle; in "To follow up" as on the rows and in their details. "Confirming" has its own
 * (StatusPill's ChainLoader), which a sign here would replace.
 */
export const PILL_SIGNS: Partial<Record<ActivityState, PillSign>> = {
  open: "pulse",
  underpaid: "warning"
};

/**
 * The sign of a row "Paid" ("Wallet", an invoice's details): the warning's triangle, in the settled
 * green, when it is paid because the owner accepted what it received, short of its amount
 * (something out of the ordinary happened; its details say what); none otherwise.
 */
export function paidSign(item: Pick<ActivityItem, "acceptance"> | null): PillSign | undefined {
  return item?.acceptance?.status === "accepted" ? "warning" : undefined;
}

/** A row's pill: its state's colours, its label, and its sign. */
export type ActivityPill = { state: PaymentState; label: string; sign?: PillSign };

/** What a row done says of itself, by its source. */
const DONE = {
  pos: "paid",
  link: "paid",
  integration: "paid",
  receive: "received",
  send: "sent",
  recovered: "received"
} as const;

/**
 * What a row's "Status" is, whatever the app's language: its state, else what is done (`done:paid`,
 * `done:received`, `done:sent`). One key per label of `status`: the desktop table's filter of
 * "Status" keeps a value hidden across a change of language.
 */
export function statusKey(item: ActivityItem): StatusKey {
  return item.state ?? `done:${DONE[item.source]}`;
}

export type StatusKey = ActivityState | `done:${(typeof DONE)[ActivitySource]}`;

/** The colour of a row's amount (`tone`). */
export type AmountTone = "muted" | "received" | "plain";

/** An empty cell: a sale without a note's "Description", "By" for nobody. */
export const EMPTY_CELL = "—";

/** States whose amount was not received (a grey, unsigned amount). */
const UNPAID: readonly (ActivityState | null)[] = [
  "draft",
  "open",
  "expired",
  "canceled",
  "failed"
];

/** A row's value in minor units of `currency` (exact, unsigned): what `amount` writes. */
export type RowValue = { minor: bigint; digits: number; currency: string };

/**
 * The rate recorded at a row's payment (src/features/wallet/payment-rates.ts): its latest done, the
 * one the row is dated by (model.ts), as "Export" takes it (export/rows.ts' rowRate); null when
 * none is known.
 */
export function paidRate(
  item: ActivityItem,
  rates: ReadonlyMap<string, PaymentRate>
): PaymentRate | null {
  // A row copied from the v2 account (model.ts, `imported`): the price the v2 server recorded
  // nearest its date, never one of the wallet's own payments (it has none).
  if (item.imported) return item.imported.rate;
  let latest: ActivityItem["payments"][number] | null = null;
  for (const payment of item.payments) {
    if (payment.status !== "completed") continue;
    if (!latest || payment.timestamp > latest.timestamp) latest = payment;
  }
  return (latest && rates.get(latest.id)) ?? null;
}

/**
 * What the activity's rows write (model.ts), in the app's language and the device's number format.
 * A sale's amount is the one typed at the keypad, in its currency. What nobody typed in francs (a
 * transfer, a sale in sats alone) is valued at its payment once done (its value in fiat at the time
 * of payment): its sats at the rate recorded then (payment-rates.ts), in that rate's currency, none
 * while it is not known (its sats alone); still on its way, at the current rate of the point of
 * sale (wallet/format.ts), none during a rate outage.
 */
export function useActivityFormat() {
  const { t } = useTranslation();
  const wallet = useWalletFormat();
  const { languageTag, digits, rate } = usePos();
  const rates = useSyncExternalStore(followPaymentRates, knownPaymentRates);

  const fiatText = (fiat: Fiat, sign: Sign = ""): string =>
    `${formatSignedFiat(BigInt(fiat.minor), fiat.digits, languageTag, sign)} ${fiat.currency}`;

  /** "17,46 CHF", signed `sign`. */
  const valueText = (value: RowValue, sign: Sign = ""): string =>
    `${formatSignedFiat(value.minor, value.digits, languageTag, sign)} ${value.currency}`;

  /**
   * What was sent is signed "−"; what came in is not signed: its amount is green once received
   * (`tone`).
   */
  const sign = (item: ActivityItem): Sign => {
    if (UNPAID.includes(item.state)) return "";
    return item.source === "send" ? "−" : "";
  };

  /**
   * The rate a row's sats are valued at (see above): done, the rate recorded at its payment; else
   * the current rate. Null when none is known.
   */
  const rateOf = (
    item: ActivityItem
  ): { rate: number; digits: number; currency: string } | null => {
    if (item.state === null) {
      const paid = paidRate(item, rates);
      if (paid === null) return null;
      return { rate: paid.rate, digits: currencyDigits(paid.currency), currency: paid.currency };
    }
    if (rate.rate === undefined) return null;
    return { rate: rate.rate, digits, currency: wallet.currency };
  };

  /**
   * A row's value (see above): the sale's amount; else its sats at the rate they are valued at
   * (rateOf). Null when none is known.
   */
  const value = (item: ActivityItem): RowValue | null => {
    if (item.fiat) {
      return {
        minor: BigInt(item.fiat.minor),
        digits: item.fiat.digits,
        currency: item.fiat.currency
      };
    }
    if (item.sats === null) return null;
    const at = rateOf(item);
    if (at === null) return null;
    return {
      minor: satsToFiatMinor(item.sats, at.digits, at.rate),
      digits: at.digits,
      currency: at.currency
    };
  };

  /**
   * "0,75 CHF": a send's fees, `sats`, at the rate its sats are valued at (rateOf), as `amount`
   * writes a value ("< 0,01 CHF" for less than half a minor unit); null when no rate is known. A
   * sale typed in francs too: its fees were never typed.
   */
  const feeText = (item: ActivityItem, sats: bigint): string | null => {
    const at = rateOf(item);
    if (at === null) return null;
    const shown = {
      minor: satsToFiatMinor(sats, at.digits, at.rate),
      digits: at.digits,
      currency: at.currency
    };
    if (shown.minor > 0n || sats === 0n) return valueText(shown);
    return `< ${valueText({ ...shown, minor: 1n })}`;
  };

  /**
   * "17,46 CHF", "−142,20 CHF": the row's value (`value`); null without one. Sats worth less than
   * half a minor unit would read "0,00": "< 0,01 CHF" ("−< 0,01 CHF" sent), never a value that says
   * nothing moved; their sats, exact, under it or in its details. `as`: its sign, unless written
   * another way (unsigned, under its sats).
   */
  const amount = (item: ActivityItem, as: Sign = sign(item)): string | null => {
    const shown = value(item);
    if (shown === null) return null;
    if (item.fiat || shown.minor > 0n || item.sats === 0n) return valueText(shown, as);
    return `${as}< ${valueText({ ...shown, minor: 1n })}`;
  };

  /**
   * The amount `amount` writes, in minor units of the display currency, signed (sent: negative), to
   * sort the table by: exact (hard rule 3). null when it writes none, or in another currency (a
   * sale typed in it, a rate recorded in a former display currency): such rows come last.
   */
  const amountMinor = (item: ActivityItem): bigint | null => {
    const shown = value(item);
    if (shown === null || shown.currency !== wallet.currency || shown.digits !== digits)
      return null;
    return sign(item) === "−" ? -shown.minor : shown.minor;
  };

  /** Not received: the amount in grey, without a sign. */
  const muted = (item: ActivityItem): boolean => UNPAID.includes(item.state);

  /**
   * The colour of a row's amount: grey when not received (`muted`), green once received (what its
   * pill says "Paid" or "Received" of, in the same green: a state proven, never one in progress),
   * else the text's own (what was sent, what is still on its way).
   */
  const tone = (item: ActivityItem): AmountTone => {
    if (muted(item)) return "muted";
    if (item.state === null && item.source !== "send") return "received";
    return "plain";
  };

  /**
   * "Description": the note (an integration's: its note, else its order's reference); a sale of the
   * point of sale or of an integration without one is "—", as "By" for nobody.
   */
  const title = (item: ActivityItem): string => {
    // An invoice of "New invoice": its recipient.
    if (item.invoice) return item.invoice.recipient || item.invoice.number;
    if (item.note) return item.note;
    if (item.source === "pos" || item.source === "integration") return EMPTY_CELL;
    if (item.source === "link") return t("activity.titles.link");
    if (item.source === "recovered") return t("activity.titles.recovered");
    // A sale to Mt Pelerin (its record read): "Sale in CHF", its currency, not the memo of its
    // invoice, Mt Pelerin's.
    if (item.mtpSale) {
      return t("activity.titles.mtpSale", { currency: item.mtpSale.received.currency });
    }
    if (item.imported?.kind === "withdraw") return t("activity.titles.payout");
    if (item.imported?.kind === "referral") return t("activity.titles.referral");
    const [payment] = item.payments;
    return payment ? wallet.title(payment) : t(`activity.sources.${item.source}`);
  };

  /**
   * The title under a row's pill in its details: `title`, but none for a payment sent whose
   * "Recipient" says it already (recipientOf: the Lightning address paid, or "Withdrawal" beside the
   * address it paid). A title of its own (a sale to Mt Pelerin's) stays.
   */
  const detailTitle = (item: ActivityItem): string | null => {
    const text = title(item);
    const [payment] = item.payments;
    if (
      item.source === "send" &&
      item.payments.length === 1 &&
      payment &&
      recipientOf(payment) !== null &&
      text === wallet.title(payment)
    ) {
      return null;
    }
    return text;
  };

  const source = (item: ActivityItem): string => t(`activity.sources.${item.source}`);

  const by = (item: ActivityItem): string | null => {
    if (!item.by) return null;
    return item.by.kind === "you" ? t("activity.you") : item.by.name;
  };

  const pill = (item: ActivityItem): ActivityPill | null =>
    item.state === null
      ? null
      : {
          state: PILL_STATES[item.state],
          label: t(`activity.states.${item.state}`),
          sign: PILL_SIGNS[item.state]
        };

  /**
   * The desktop table's "Status" and a row's details: its pill, else what is done, in green: "Paid"
   * for a sale or a link, "Received" for the wallet's own receptions, "Sent" for what it sent, with
   * a triangle when the owner accepted it paid short (paidSign). A mobile row keeps its second line
   * for its time and who took it (`pill`, `meta`).
   */
  const status = (item: ActivityItem): ActivityPill =>
    pill(item) ?? {
      state: "settled",
      label: t(`activity.done.${DONE[item.source]}`),
      sign: paidSign(item)
    };

  /**
   * The second line of a mobile row, on one line: its time, then who took it (the device's name,
   * the integration's, "You"), its time alone when no record names one. Not where it comes from
   * ("Point of sale"…): its icon says it, its details too.
   */
  const meta = (item: ActivityItem): string => {
    const [payment] = item.payments;
    if ((item.source === "receive" || item.source === "send") && payment) {
      const kind = wallet.kind(payment);
      // No kind said (a transfer the SDK cannot tell): its time alone.
      if (kind === null) return wallet.time(item.timestamp);
      return t("wallet.meta", { time: wallet.time(item.timestamp), kind });
    }
    const taker = by(item);
    return taker === null
      ? wallet.time(item.timestamp)
      : `${wallet.time(item.timestamp)} · ${taker}`;
  };

  /**
   * The desktop table's date: "Today · 14:32", "Yesterday · 18:20", "30.09 · 17:40", in the device
   * locale (wallet/format.ts' `day`).
   */
  const stamp = (item: ActivityItem, now: Date): string => {
    // Calendar days, as the list's (wallet/model.ts): a day of 23 or 25 hours stays one.
    const when = dayOf(item.timestamp, now);
    let day: string;
    if (when === "today" || when === "yesterday") day = wallet.day(when);
    else {
      const options: Intl.DateTimeFormatOptions = { day: "2-digit", month: "2-digit" };
      if (when.getFullYear() !== now.getFullYear()) options.year = "2-digit";
      day = formatDate(when, languageTag, options);
    }
    return t("activity.stamp", { day, time: wallet.time(item.timestamp) });
  };

  /**
   * The total of a state of "To follow up" (followUpAmount): in the display currency, the sats of a
   * transfer at the current rate. Sats when none of them has a fiat amount and there is no rate;
   * null when they cannot be added up (another currency, no rate for a transfer).
   */
  const total = (state: FollowUp, items: readonly ActivityItem[]): string | null => {
    // Nothing to add up: its count (0) says it.
    if (items.length === 0) return null;
    let minor = 0n;
    let sats = 0n;
    let fiatCount = 0;
    let convertible = true;
    for (const item of items) {
      const value = followUpAmount(item);
      if (!value) continue;
      if ("fiat" in value) {
        fiatCount += 1;
        if (value.fiat.currency !== wallet.currency || value.fiat.digits !== digits) {
          convertible = false;
        } else minor += BigInt(value.fiat.minor);
      } else {
        sats += value.sats;
        if (rate.rate === undefined) convertible = false;
        else minor += satsToFiatMinor(value.sats, digits, rate.rate);
      }
    }
    let text: string | null;
    if (convertible) text = fiatText({ minor: Number(minor), digits, currency: wallet.currency });
    else if (fiatCount === 0) text = `${formatSatsGrouped(sats)} sats`;
    else text = null;
    return text !== null && state === "underpaid" ? t("activity.rest", { amount: text }) : text;
  };

  /**
   * Why a sale paid on-chain is not in the balance yet (pendingCredit), for its details' callout:
   * received and confirmed (deep enough to claim: as many confirmations as that, or more, never
   * told as an exact count), then its credit, waiting; then why, with the claim's ceiling in the
   * device locale's grouping ("300 sats"): the most its claim will take from it, or the limit its
   * claim's price is above ("fees"), with that price when the row tells it (pendingCreditFeeSats,
   * "feesQuoted"). Null for any other row.
   */
  const creditCallout = (item: ActivityItem): { steps: CalloutStep[]; text: string } | null =>
    item.pendingCredit
      ? {
          steps: [
            {
              label: t("activity.pendingCredit.received"),
              detail: t("activity.pendingCredit.confirmed"),
              done: true
            },
            {
              label: t("activity.pendingCredit.credit"),
              detail: t("activity.pendingCredit.waiting"),
              done: false
            }
          ],
          text:
            item.pendingCredit === "fees" && item.pendingCreditFeeSats !== undefined
              ? t("activity.pendingCredit.feesQuoted", {
                  price: `${formatInteger(item.pendingCreditFeeSats, languageTag)} sats`,
                  fee: `${formatInteger(MAX_DEPOSIT_CLAIM_FEE_SATS, languageTag)} sats`
                })
              : t(`activity.pendingCredit.${item.pendingCredit}`, {
                  fee: `${formatInteger(MAX_DEPOSIT_CLAIM_FEE_SATS, languageTag)} sats`
                })
        }
      : null;

  return {
    ...wallet,
    fiatText,
    valueText,
    sign,
    value,
    amount,
    feeText,
    amountMinor,
    muted,
    tone,
    title,
    detailTitle,
    source,
    by,
    pill,
    status,
    meta,
    stamp,
    total,
    creditCallout
  };
}

export type ActivityFormat = ReturnType<typeof useActivityFormat>;
