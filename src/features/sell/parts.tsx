import type { TFunction } from "i18next";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, Text, View } from "react-native";

import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { Spinner } from "@/components/ui/Spinner";
import { StatusPill } from "@/components/ui/StatusPill";
import { SPLIT_PAYOUT_THRESHOLD_CHF_MINOR } from "@/config/mtpelerin";
import { usePos } from "@/features/terminal/pos";
import { formatDate } from "@/lib/locale/date";
import { formatInteger } from "@/lib/locale/format";
import { hasIncompleteAddress } from "@/lib/mtpelerin/accounts";
import { decimalToInteger, decimalToMinor, type MtpDecimal } from "@/lib/mtpelerin/decimal";
import { receivedMinor } from "@/lib/mtpelerin/transfer-fee";
import type { MtpBankAccount } from "@/lib/mtpelerin/types";
import { currencyDigits, formatFiat } from "@/lib/terminal/amount";
import { makeStyles, mono, radius, sans, type } from "@/theme";

import type { SellBusy, SellFailure } from "./flow";
import { PoweredByMtPelerin } from "./MtPelerinLogo";
import { SaleRecordError } from "./sale-records";

/*
 * What "Sell"'s pages share: their body in the panel, the lines
 * of label and value, the framed group, the wait and the failure with its retry, and how Mt
 * Pelerin's amounts read: "493,50 CHF" with the device's separators, never more than Mt Pelerin
 * wires (decimal.ts, rounded down), the fees never less (rounded up).
 */

/** "493,50 CHF": a whole amount in minor units. */
export function fiatText(minor: number, currency: string, languageTag: string): string {
  return `${formatFiat(minor, currencyDigits(currency), languageTag)} ${currency}`;
}

/** Mt Pelerin's `decimal` of `currency`, rounded `rounding` to its minor units; null past range. */
export function decimalText(
  decimal: MtpDecimal,
  currency: string,
  languageTag: string,
  rounding: "down" | "up"
): string | null {
  const minor = decimalToMinor(decimal, currencyDigits(currency), rounding);
  return minor === null ? null : fiatText(minor, currency, languageTag);
}

/**
 * `sats` in `currency` at Mt Pelerin's `rate` (its price of 1 sat, before fees), rounded
 * `rounding`: what a figure in sats is worth, shown next to it; null past range.
 */
export function satsAtRate(
  sats: bigint,
  rate: MtpDecimal,
  currency: string,
  languageTag: string,
  rounding: "down" | "up"
): string | null {
  return decimalText(
    { units: sats * rate.units, scale: rate.scale },
    currency,
    languageTag,
    rounding
  );
}

/**
 * Mt Pelerin's fees (`fees.total` in `fees.currency`) in the sale's currency and in sats: in sats
 * when it takes them in the sold asset, their value at `rate` beside (rounded up); in the sale's
 * currency, as they are. Never in another unit (not shown converted).
 */
export function feeTexts(
  fees: { total: MtpDecimal; currency: string },
  {
    currency,
    sourceCurrency,
    rate
  }: { currency: string; sourceCurrency: string; rate: MtpDecimal | null },
  languageTag: string
): { fiat: string | null; sats: string | null } {
  if (fees.currency === currency) {
    return { fiat: decimalText(fees.total, currency, languageTag, "up"), sats: null };
  }
  if (fees.currency !== sourceCurrency) return { fiat: null, sats: null };
  const sats = decimalToInteger(fees.total);
  if (sats === null) return { fiat: null, sats: null };
  return {
    fiat: rate === null ? null : satsAtRate(sats, rate, currency, languageTag, "up"),
    sats: satsText(sats, languageTag)
  };
}

/**
 * What the merchant receives of `wired` (Mt Pelerin's `dest_amount`) once its transfer fee of
 * `feeMinor` is taken (transfer-fee.ts), rounded down; null past range.
 */
export function receivedText(
  wired: MtpDecimal,
  currency: string,
  feeMinor: number,
  languageTag: string
): string | null {
  const minor = receivedMinor(wired, currency, feeMinor);
  return minor === null ? null : fiatText(minor, currency, languageTag);
}

/**
 * "50 CHF", "the equivalent of 50 CHF": one of Mt Pelerin's thresholds in francs, `chfMinor`
 * centimes (the deferred sells' transfer by default).
 */
export function transferThresholdText(
  t: TFunction,
  currency: string,
  languageTag: string,
  chfMinor: number = SPLIT_PAYOUT_THRESHOLD_CHF_MINOR
): string {
  const amount = fiatText(chfMinor, "CHF", languageTag);
  return currency === "CHF" ? amount : t("sell.sale.equivalentOf", { amount });
}

/**
 * "Sales are grouped…": when the francs of a deferred sell of `currency` are wired
 * (with the bank account's other deferred sells, once they reach Mt Pelerin's threshold:
 * "50.00 CHF", "the equivalent of 50.00 CHF" in another currency, transferThresholdText).
 */
export function DeferredNote({ currency }: { currency: string }) {
  const { t } = useTranslation();
  const { languageTag } = usePos();
  return (
    <Callout tone="success" icon="circle-info" testID="sell-deferred">
      {t("sell.split.deferred", { threshold: transferThresholdText(t, currency, languageTag) })}
    </Callout>
  );
}

/** "592 993 sats", "1 sat". */
export function satsText(sats: bigint, languageTag: string): string {
  return `${formatInteger(sats, languageTag)} ${sats === 1n ? "sat" : "sats"}`;
}

/** "11:42", the device's locale. */
export function timeText(seconds: number, languageTag: string): string {
  return formatDate(new Date(seconds * 1000), languageTag, { hour: "2-digit", minute: "2-digit" });
}

/** What a failure says. */
/**
 * Why a sale's payment did not leave (flow.ts `paySale` rejected): its record not taken by the
 * account's relays (nothing sold), else the payment itself.
 */
export function salePaymentFailureText(t: TFunction, error: unknown): string {
  return t(error instanceof SaleRecordError ? "sell.failures.record" : "sell.failures.payment");
}

export function failureText(t: TFunction, failure: SellFailure): string {
  return t(`sell.failures.${failure.kind}`);
}

/** What a wait says. */
export function busyText(t: TFunction, busy: SellBusy): string {
  return t(`sell.busy.${busy}`);
}

/**
 * A page of "Sell"'s panel (SellSheet.tsx): its content, scrolled when the panel cannot hold it,
 * then its buttons, pinned under it, and "Powered by" Mt Pelerin's logo. The panel draws the
 * header (title, steps, back, close).
 */
export function SellBody({
  children,
  footer,
  testID
}: {
  children: ReactNode;
  footer?: ReactNode;
  testID?: string;
}) {
  const styles = useStyles();
  return (
    <View style={styles.body} testID={testID}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
      {footer ? <View style={styles.footer}>{footer}</View> : null}
      <PoweredByMtPelerin />
    </View>
  );
}

/**
 * An amount in the sale's currency, its sats under it, as
 * "Wallet"'s movements; the one known alone, "—" without either.
 */
export function Dual({ fiat, sats }: { fiat: string | null; sats: string | null }) {
  const styles = useStyles();
  if (fiat === null || sats === null) {
    return <Text style={styles.rowValue}>{fiat ?? sats ?? "—"}</Text>;
  }
  return (
    <View style={styles.dual}>
      <Text style={styles.rowValue}>{fiat}</Text>
      <Text style={styles.dualSats}>{sats}</Text>
    </View>
  );
}

/**
 * A label and its value, as the lines of "Send"'s fees; `danger`: a text value in the danger
 * colour, a value that stops what the page does (its reason told under the rows).
 */
export type SellRow = { label: string; value: ReactNode; danger?: boolean; testID?: string };

export function Rows({ rows }: { rows: readonly SellRow[] }) {
  const styles = useStyles();
  return (
    <View>
      {rows.map(({ label, value, danger = false, testID }) => (
        <View key={label} style={styles.row} testID={testID}>
          <Text style={styles.rowLabel}>{label}</Text>
          {typeof value === "string" ? (
            <Text style={[styles.rowValue, danger && styles.rowValueDanger]}>{value}</Text>
          ) : (
            value
          )}
        </View>
      ))}
    </View>
  );
}

/** A framed group of rows. */
export function Card({ children, testID }: { children: ReactNode; testID?: string }) {
  const styles = useStyles();
  return (
    <View style={styles.card} testID={testID}>
      {children}
    </View>
  );
}

/**
 * "Incomplete address" under a bank account Mt Pelerin lacks a line of its holder's address for
 * (offered all the same, said so); nothing otherwise.
 */
export function IncompleteAddress({ account }: { account: MtpBankAccount }) {
  const styles = useStyles();
  const { t } = useTranslation();
  if (!hasIncompleteAddress(account)) return null;
  return (
    <View style={styles.pillStart} testID={`sell-incomplete-address-${account.id}`}>
      <StatusPill state="open" label={t("sell.accounts.incompleteAddress")} size="xs" />
    </View>
  );
}

/** A monospaced figure: an order's reference. */
export function Mono({ children }: { children: string }) {
  const styles = useStyles();
  return <Text style={styles.mono}>{children}</Text>;
}

/** A bank account's masked IBAN, with its currency when given, in the sans as every text read. */
export function Iban({ children }: { children: string }) {
  const styles = useStyles();
  return <Text style={styles.iban}>{children}</Text>;
}

/** A wait: the spinner and what runs. */
export function Waiting({ label, testID }: { label: string; testID?: string }) {
  const styles = useStyles();
  return (
    <View style={styles.waiting} testID={testID}>
      <Spinner size={20} />
      <Text style={styles.waitingText}>{label}</Text>
    </View>
  );
}

/** A failure, and "Try again" when it may be tried again. */
export function Failure({ failure, testID }: { failure: SellFailure; testID?: string }) {
  const styles = useStyles();
  const { t } = useTranslation();
  return (
    <View style={styles.failure} testID={testID}>
      <ErrorMessage>{failureText(t, failure)}</ErrorMessage>
      {failure.retry ? (
        <Button
          variant="secondary"
          size="md"
          fullWidth={false}
          onPress={failure.retry}
          testID="sell-retry"
        >
          {t("sell.retry")}
        </Button>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  body: { flexShrink: 1, gap: 14 },
  pillStart: { alignSelf: "flex-start" },
  scroll: { flexGrow: 0, flexShrink: 1 },
  content: { gap: 20, paddingBottom: 4 },
  footer: { gap: 8 },
  dual: { alignItems: "flex-end", gap: 2, flexShrink: 1 },
  dualSats: { ...mono(500), fontSize: 12, color: colors.text.secondary },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    minHeight: 48,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border.subtle
  },
  rowLabel: { ...sans(500), fontSize: 13.5, color: colors.text.secondary },
  rowValue: {
    ...sans(600),
    flexShrink: 1,
    textAlign: "right",
    fontSize: 14.5,
    fontVariant: ["tabular-nums"],
    color: colors.text.primary
  },
  rowValueDanger: { color: colors.danger.fg },
  // On the panel's own surface: a hairline frame, no second background.
  card: {
    borderWidth: 1.5,
    borderColor: colors.border.subtle,
    borderRadius: radius.lg,
    paddingHorizontal: 16
  },
  mono: { ...mono(500), fontSize: 13, color: colors.text.primary },
  iban: { ...sans(500), fontSize: 13, color: colors.text.primary },
  waiting: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12 },
  waitingText: { ...sans(500), fontSize: type.prose, color: colors.text.secondary },
  failure: { gap: 12, alignItems: "flex-start" }
}));
