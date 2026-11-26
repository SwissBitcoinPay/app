import type { TFunction } from "i18next";

import type { IconName } from "@/components/ui/Icon";
import type { NetPart, NetValue } from "@/features/activity/day-net";
import { formatSignedFiat } from "@/features/wallet/model";
import type { PendingDeposit } from "@/lib/breez/types";
import { MAX_DEPOSIT_CLAIM_FEE_SATS } from "@/lib/breez/config";
import { cleanDescription } from "@/lib/card/card-invoice";
import type { MovementValue } from "@/lib/card/movement-value";
import type { CardPaymentEntry } from "@/lib/card/payment-entry";
import { decimalSeparator, formatInteger } from "@/lib/locale/format";
import type { ThemeColors } from "@/theme";

import { refusalReasonOf, type CardHistoryRow } from "./history-view";

/*
 * What "History" writes of each movement, in the list and its details: its name, its line under it,
 * its signed amount, its value. Shared by the list and the details.
 */

/** How a row is drawn: its round icon, its colours, its texts. */
export type RowLook = {
  icon: IconName;
  iconBg: string;
  iconFg: string;
  title: string;
  caption: string;
  captionColor: string;
  /**
   * "−3,400 sats" for what left; "50,000 sats", in green, for what came in (no "+"); unsigned,
   * struck through, for what moved nothing.
   */
  amount: string;
  amountColor: string;
  /** Struck through: refused or failed, nothing moved. */
  struck: boolean;
  /** Its value then ("CHF 2.89"), unsigned; null when none is known (or nothing moved). */
  fiat: string | null;
  /** Its sats, unsigned ("3,400 sats"): under its value when the value is written first. */
  sats: string;
  /** "−" for what left (as `amount`), "" otherwise: the value's sign when it is written first. */
  sign: "−" | "";
};

/** "3,400 sats". */
export function satsText(sats: bigint, languageTag: string): string {
  return `${formatInteger(sats, languageTag)} sats`;
}

/**
 * "1.5 sats", "12 sats": millisatoshis in sats, exact (up to three decimals, the trailing zeros
 * left out), with the locale's separators: a fee of the v2 server, which counts them so.
 */
export function msatsText(msats: bigint, languageTag: string): string {
  const whole = formatInteger(msats / 1000n, languageTag);
  const fraction = (msats % 1000n).toString().padStart(3, "0").replace(/0+$/, "");
  return `${whole}${fraction === "" ? "" : `${decimalSeparator(languageTag)}${fraction}`} sats`;
}

/**
 * A value as it was kept: a movement's (movement-value.ts, its hour not shown), or a row's of the
 * card's v2 history (legacy-history.ts, at the v2 server's price).
 */
export type KeptValue = Pick<MovementValue, "minor" | "digits" | "currency">;

/** "CHF 2.89": a value as it was kept, in its own currency. */
export function valueText(value: KeptValue, languageTag: string): string {
  return `${formatSignedFiat(BigInt(value.minor), value.digits, languageTag, "")} ${value.currency}`;
}

/** The name the merchant declared (a node's: its alias), cleaned; null when none was read. */
export function declaredName(entry: CardPaymentEntry): string | null {
  return entry.payee?.name ? cleanDescription(entry.payee.name) : null;
}

/** A payment's name: the merchant's declared one, else the point of sale's text, else a word. */
export function tapTitle(entry: CardPaymentEntry, t: TFunction): string {
  return declaredName(entry) ?? entry.description ?? t("cards.history.noName");
}

/** Refused or failed: nothing left the card. */
export function nothingMoved(entry: CardPaymentEntry): boolean {
  return entry.outcome === "declined" || entry.outcome === "failed";
}

/**
 * The value a payment shows, as it was kept: once it left or may have left; none for what moved
 * nothing, nor while it is being sent.
 */
export function paymentValue(entry: CardPaymentEntry): MovementValue | null {
  return entry.outcome === "sent" || entry.outcome === "uncertain" ? entry.value : null;
}

/** The value a row shows, as it was kept (a payment's: paymentValue; none kept unidentified). */
export function shownValue(row: CardHistoryRow): KeptValue | null {
  switch (row.kind) {
    case "movement":
      return row.movement.value;
    case "unidentified":
      return null;
    case "legacy":
      return row.row.value;
    case "tap":
      return paymentValue(row.entry);
  }
}

/**
 * The name of a movement the SDK cannot tell (UnidentifiedMovement): "Deposit" or "Withdrawal", the
 * words "Wallet" uses for it.
 */
export function unidentifiedTitle(direction: "receive" | "send", t: TFunction): string {
  return t(direction === "receive" ? "wallet.titles.deposit" : "wallet.titles.withdrawal");
}

/** The row of `row`, its time written `time`, in the theme's `colors`. */
export function rowLook(
  row: CardHistoryRow,
  time: string,
  t: TFunction,
  languageTag: string,
  colors: ThemeColors
): RowLook {
  const shown = shownValue(row);
  const fiat = shown ? valueText(shown, languageTag) : null;
  if (row.kind === "legacy") {
    const sats = satsText(row.row.sats, languageTag);
    if (row.row.kind === "recharge") {
      // As a recharge's look, without its way (the v2 server's rows do not tell it): its time.
      return {
        icon: "arrow-down",
        iconBg: colors.success.bg,
        iconFg: colors.success.fg,
        title: t("cards.history.recharge"),
        caption: time,
        captionColor: colors.text.secondary,
        amount: sats,
        amountColor: colors.success.fg,
        struck: false,
        fiat,
        sats,
        sign: ""
      };
    }
    // As a payment sent, without a merchant's name (the v2 server kept none): "Card payment".
    return {
      icon: "store",
      iconBg: colors.background.subtle,
      iconFg: colors.text.primary,
      title: t("cards.history.noName"),
      caption: t("cards.history.at", { time, what: t("cards.history.paid") }),
      captionColor: colors.text.secondary,
      amount: `−${sats}`,
      amountColor: colors.text.primary,
      struck: false,
      fiat,
      sats,
      sign: "−"
    };
  }
  if (row.kind === "unidentified") {
    const { movement } = row;
    const received = movement.direction === "receive";
    const sats = satsText(movement.amountSats, languageTag);
    // As a recharge's or a return's look, without its way: its time alone (none is known).
    return {
      icon: received ? "arrow-down" : "arrow-up",
      iconBg: received ? colors.success.bg : colors.background.subtle,
      iconFg: received ? colors.success.fg : colors.text.primary,
      title: unidentifiedTitle(movement.direction, t),
      caption: time,
      captionColor: colors.text.secondary,
      amount: received ? sats : `−${sats}`,
      amountColor: received ? colors.success.fg : colors.text.primary,
      struck: false,
      fiat,
      sats,
      sign: received ? "" : "−"
    };
  }
  if (row.kind === "movement") {
    const { movement } = row;
    if (movement.kind === "return") {
      return {
        icon: "arrow-up",
        iconBg: colors.background.subtle,
        iconFg: colors.text.primary,
        title: t("cards.history.return"),
        caption: t("cards.history.at", { time, what: t("cards.history.toMain") }),
        captionColor: colors.text.secondary,
        amount: `−${satsText(movement.amountSats, languageTag)}`,
        amountColor: colors.text.primary,
        struck: false,
        fiat,
        sats: satsText(movement.amountSats, languageTag),
        sign: "−"
      };
    }
    const way =
      movement.way === "onchain" && movement.feeSats > 0n
        ? t("cards.history.ways.onchainFee", { fee: satsText(movement.feeSats, languageTag) })
        : t(`cards.history.ways.${movement.way ?? "main"}`);
    if (movement.kind === "withdrawal") {
      // As a return's look, where it went in place of the main balance ("Withdrawal · Lightning
      // address").
      return {
        icon: "arrow-up",
        iconBg: colors.background.subtle,
        iconFg: colors.text.primary,
        title: t("cards.history.return"),
        caption: t("cards.history.at", { time, what: way }),
        captionColor: colors.text.secondary,
        amount: `−${satsText(movement.amountSats, languageTag)}`,
        amountColor: colors.text.primary,
        struck: false,
        fiat,
        sats: satsText(movement.amountSats, languageTag),
        sign: "−"
      };
    }
    return {
      icon: "arrow-down",
      iconBg: colors.success.bg,
      iconFg: colors.success.fg,
      title: row.recovered ? t("cards.history.recovered") : t("cards.history.recharge"),
      caption: t("cards.history.at", { time, what: way }),
      captionColor: colors.text.secondary,
      amount: satsText(movement.amountSats, languageTag),
      amountColor: colors.success.fg,
      struck: false,
      fiat,
      sats: satsText(movement.amountSats, languageTag),
      sign: ""
    };
  }
  const { entry } = row;
  const title = tapTitle(entry, t);
  const sats = satsText(entry.amountSats, languageTag);
  switch (entry.outcome) {
    case "declined":
    case "failed": {
      const reason = refusalReasonOf(entry.reason);
      const what =
        entry.outcome === "failed"
          ? t("cards.history.failedRow")
          : reason
            ? t("cards.history.refused", { reason: t(`cards.history.reasons.${reason}`) })
            : t("cards.history.refusedPlain");
      return {
        icon: "ban",
        iconBg: colors.danger.bg,
        iconFg: colors.danger.fg,
        title,
        caption: t("cards.history.at", { time, what }),
        captionColor: colors.danger.fg,
        // Nothing moved: no sign, struck through, no value.
        amount: sats,
        amountColor: colors.text.tertiary,
        struck: true,
        fiat: null,
        sats,
        sign: ""
      };
    }
    case "uncertain":
      return {
        icon: "triangle-exclamation",
        iconBg: colors.warning.bg,
        iconFg: colors.warning.fg,
        title,
        caption: t("cards.history.at", { time, what: t("cards.history.uncertain") }),
        captionColor: colors.warning.fg,
        amount: `−${sats}`,
        amountColor: colors.text.primary,
        struck: false,
        fiat,
        sats,
        sign: "−"
      };
    case "sending":
      return {
        icon: "store",
        iconBg: colors.background.subtle,
        iconFg: colors.text.primary,
        title,
        caption: t("cards.history.at", { time, what: t("cards.history.sending") }),
        captionColor: colors.text.secondary,
        amount: `−${sats}`,
        amountColor: colors.text.primary,
        struck: false,
        fiat: null,
        sats,
        sign: "−"
      };
    case "sent":
      return {
        icon: "store",
        iconBg: colors.background.subtle,
        iconFg: colors.text.primary,
        title,
        caption: t("cards.history.at", { time, what: t("cards.history.paid") }),
        captionColor: colors.text.secondary,
        amount: `−${sats}`,
        amountColor: colors.text.primary,
        struck: false,
        fiat,
        sats,
        sign: "−"
      };
  }
}

/**
 * A deposit of "In progress": its line under "Bitcoin deposit", its icon and colours (the theme's
 * `colors`).
 */
export function depositLook(
  deposit: PendingDeposit,
  t: TFunction,
  languageTag: string,
  colors: ThemeColors
): { caption: string; captionColor: string; icon: IconName; iconBg: string; iconFg: string } {
  // "140 sats asked, 99 at most": the ceiling without its unit.
  const max = formatInteger(MAX_DEPOSIT_CLAIM_FEE_SATS, languageTag);
  if (deposit.waitsForFees) {
    return {
      caption:
        deposit.claimFeeSats !== undefined
          ? t("cards.history.depositFees", {
              asked: satsText(deposit.claimFeeSats, languageTag),
              max
            })
          : t("cards.history.depositFeesUnknown", { max }),
      captionColor: colors.warning.fg,
      icon: "hourglass-half",
      iconBg: colors.warning.bg,
      iconFg: colors.warning.fg
    };
  }
  return {
    // Mature, it is claimed at the wallet's next sync: it says so meanwhile.
    caption: t(
      deposit.mature ? "cards.history.depositClaiming" : "cards.history.depositConfirming"
    ),
    captionColor: colors.text.secondary,
    // In the colours of "Confirming", as "Wallet"'s: one state, one colour on both screens.
    icon: "clock",
    iconBg: colors.state.unconfirmed.bg,
    iconFg: colors.state.unconfirmed.fg
  };
}

function netValueOf(value: KeptValue | null): NetValue | null {
  return value === null
    ? null
    : { minor: BigInt(value.minor), digits: value.digits, currency: value.currency };
}

/**
 * What a row adds to its day's net (activity/day-net.ts): only what moved, proven (a
 * payment sent, a recharge, funds recovered, a return, a withdrawal, a movement the SDK cannot
 * tell, a row of the card's v2 history); never a payment refused, failed, being sent or uncertain.
 * Its value as it was kept (none: its sats).
 */
export function rowNetPart(row: CardHistoryRow): NetPart | null {
  switch (row.kind) {
    case "unidentified":
      return {
        way: row.movement.direction === "receive" ? "in" : "out",
        sats: row.movement.amountSats,
        value: null
      };
    case "movement":
      return {
        // A return and a withdrawal left the card; only a recharge came in.
        way: row.movement.kind === "recharge" ? "in" : "out",
        sats: row.movement.amountSats,
        value: netValueOf(row.movement.value)
      };
    case "legacy":
      return {
        way: row.row.kind === "recharge" ? "in" : "out",
        sats: row.row.sats,
        value: netValueOf(row.row.value)
      };
    case "tap":
      return row.entry.outcome === "sent"
        ? { way: "out", sats: row.entry.amountSats, value: netValueOf(row.entry.value) }
        : null;
  }
}
