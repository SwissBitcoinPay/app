import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";

import { SatsAmount } from "@/components/ui/AmountBlock";
import { Icon } from "@/components/ui/Icon";
import type { SaleReceipt } from "@/features/terminal/useSale";
import type { PayerNode } from "@/lib/onchain/node";
import { formatDate } from "@/lib/locale/date";
import { formatInteger } from "@/lib/locale/format";
import { formatFiat, formatSatsGrouped, splitFiat, splitFiatShares } from "@/lib/terminal/amount";
import { makeStyles, radius, sans, useTheme } from "@/theme";

import { TxLink } from "./TxLink";

/** A received step: its sats, and what it was (null: the total received, as before receipts). */
type Step = { key: string; sats: bigint; receipt: SaleReceipt | null };

/**
 * The receipts as steps, in the order they came: the transactions whose time is known by that
 * time, then the others, then what came over Lightning (no time). None when they do not add up to
 * `received` (they always should): the total alone then, never a figure the card cannot prove.
 */
function stepsOf(received: bigint, receipts: readonly SaleReceipt[] | undefined): Step[] {
  const total: Step[] = [{ key: "received", sats: received, receipt: null }];
  const paying = (receipts ?? []).filter((receipt) => receipt.sats > 0n);
  if (paying.length === 0) return total;
  if (paying.reduce((sum, receipt) => sum + receipt.sats, 0n) !== received) return total;
  const rank = (receipt: SaleReceipt) =>
    receipt.kind === "lightning" ? 2 : timeOf(receipt) === null ? 1 : 0;
  return paying
    .map((receipt, index) => ({ receipt, index }))
    .sort(
      (a, b) =>
        rank(a.receipt) - rank(b.receipt) ||
        (timeOf(a.receipt) ?? 0) - (timeOf(b.receipt) ?? 0) ||
        a.index - b.index
    )
    .map(({ receipt }) => ({
      key: receipt.kind === "onchain" ? `tx-${receipt.txid}` : `ln-${receipt.paymentHash}`,
      sats: receipt.sats,
      receipt
    }));
}

/** When a transaction was received (Unix ms), null when it is not known. */
function timeOf(receipt: SaleReceipt): number | null {
  return receipt.kind === "onchain" &&
    receipt.receivedAt !== null &&
    Number.isFinite(receipt.receivedAt)
    ? receipt.receivedAt
    : null;
}

/**
 * `ms` written in `languageTag`: its time, with its date when it is not the day of `now` (Unix
 * seconds; a payment link's sale lasts up to a year), or when today is not known.
 */
function receivedOn(ms: number, now: number | undefined, languageTag: string): string {
  const date = new Date(ms);
  const today = now !== undefined && date.toDateString() === new Date(now * 1000).toDateString();
  return formatDate(
    date,
    languageTag,
    today ? { timeStyle: "short" } : { dateStyle: "short", timeStyle: "short" }
  );
}

/**
 * The chain card: what was received (settled steps) linked to the rest to pay (an ochre
 * ring), each in sats and in its share of the fiat amount (`splitFiat`: the received share rounded
 * down, the rest up). Shown at the point of sale and on the payer's pages.
 * `sats` and `fiat` are the whole sale's. Past the sale's end, the rest is what is missing
 * (`ended`): it is no longer asked.
 *
 * With `receipts`, each payment is its own "Received" step, as tall as the single one: its time
 * and its transaction, linked to its page on the explorer the screen
 * reads (`node`, else mempool.space: TxLink), on the left of its fiat share (`splitFiatShares`: they
 * add up to the received share); "Lightning" for an invoice.
 */
export function UnderpaidChain({
  received,
  rest,
  sats,
  fiat,
  languageTag,
  ended = false,
  receipts,
  now,
  node
}: {
  received: bigint;
  rest: bigint;
  sats: bigint;
  /** Null for an amount in sats alone (a checkout link's order priced in sats): no fiat lines. */
  fiat: { minor: number; digits: number; currency: string } | null;
  languageTag: string;
  ended?: boolean;
  /** Each payment received, whose sats add up to `received`. */
  receipts?: readonly SaleReceipt[];
  /** Unix seconds (nowUnix): a payment received another day is written with its date. */
  now?: number;
  /**
   * The merchant's node the screen reads the chain on, where its transactions' links lead; null for
   * mempool.space.
   */
  node: PayerNode | null;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const { restMinor } = splitFiat(fiat?.minor ?? 0, sats, received);
  const steps = stepsOf(received, receipts);
  // Each step's fiat share (of the total alone: splitFiat's received share).
  const shares = splitFiatShares(
    fiat?.minor ?? 0,
    sats,
    steps.map((step) => step.sats)
  );
  const satsLabel = (value: bigint) =>
    t("pos.satsLabel", { sats: formatInteger(value, languageTag) });
  const fiatText = (minor: number) =>
    fiat ? `${formatFiat(minor, fiat.digits, languageTag)} ${fiat.currency}` : null;
  return (
    <View style={styles.chain} testID="underpaid-chain">
      {steps.map((step, index) => (
        <View key={step.key} style={styles.row} testID="underpaid-received">
          <View style={styles.rail}>
            <View style={styles.done}>
              <Icon name="check" size={13} color={colors.text.onAccent} />
            </View>
            <View style={styles.link} />
          </View>
          <View style={[styles.text, styles.textReceived]}>
            <View style={styles.line}>
              <Text style={[styles.title, { color: colors.state.settled.fg }]}>
                {t("pos.underpaid.received")}
              </Text>
              <SatsAmount
                value={formatSatsGrouped(step.sats)}
                size={13}
                accessibilityLabel={satsLabel(step.sats)}
              />
            </View>
            <Details
              receipt={step.receipt}
              fiat={fiatText(shares[index])}
              now={now}
              languageTag={languageTag}
              node={node}
            />
          </View>
        </View>
      ))}
      <View style={styles.row}>
        <View style={styles.rest} />
        <View style={styles.text}>
          <View style={styles.line}>
            <Text style={[styles.title, { color: colors.warning.fg }]}>
              {t(ended ? "pos.underpaidEnded.missing" : "pos.underpaid.restToPay")}
            </Text>
            <SatsAmount
              value={formatSatsGrouped(rest)}
              size={13}
              accessibilityLabel={satsLabel(rest)}
            />
          </View>
          {fiat ? <Text style={styles.fiat}>{fiatText(restMinor)}</Text> : null}
        </View>
      </View>
    </View>
  );
}

/**
 * A received step's second line: what the payment was on the left (in the room the fiat share
 * leaves, so the step keeps its height), its fiat share on the right.
 */
function Details({
  receipt,
  fiat,
  now,
  languageTag,
  node
}: {
  receipt: SaleReceipt | null;
  fiat: string | null;
  now: number | undefined;
  languageTag: string;
  node: PayerNode | null;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  if (receipt === null) return fiat ? <Text style={styles.fiat}>{fiat}</Text> : null;
  const time = timeOf(receipt);
  return (
    <View style={styles.details}>
      <View style={styles.what}>
        {receipt.kind === "lightning" ? (
          <Text style={styles.meta} numberOfLines={1}>
            {t("pos.networks.lightning")}
          </Text>
        ) : (
          <>
            {time !== null ? (
              <Text style={styles.meta} numberOfLines={1}>
                {`${receivedOn(time, now, languageTag)} ·`}
              </Text>
            ) : null}
            {/* Its first and last 4 characters. */}
            <TxLink txid={receipt.txid} node={node} cut={4} fontSize={12} />
          </>
        )}
      </View>
      {fiat ? <Text style={styles.fiatInline}>{fiat}</Text> : null}
    </View>
  );
}

const useStyles = makeStyles(({ colors, shadow }) => ({
  chain: {
    alignSelf: "stretch",
    backgroundColor: colors.background.surface,
    borderRadius: radius.lg,
    boxShadow: shadow.card,
    paddingVertical: 12,
    paddingHorizontal: 16
  },
  row: { flexDirection: "row", gap: 14 },
  rail: { width: 30, alignItems: "center" },
  done: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    backgroundColor: colors.state.settled.dot,
    alignItems: "center",
    justifyContent: "center"
  },
  link: { flex: 1, width: 3, minHeight: 8, backgroundColor: colors.state.settled.dot },
  rest: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    borderWidth: 3,
    borderColor: colors.warning.solid,
    backgroundColor: colors.warning.bg
  },
  text: { flex: 1, gap: 2, paddingTop: 4 },
  textReceived: { paddingBottom: 8 },
  line: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { ...sans(700), fontSize: 15 },
  fiat: {
    ...sans(500),
    alignSelf: "flex-end",
    fontSize: 13,
    color: colors.text.secondary,
    fontVariant: ["tabular-nums"]
  },
  details: { flexDirection: "row", alignItems: "center", gap: 8 },
  // The space after "·" as a gap: a text's trailing space is dropped on the web.
  what: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 4 },
  meta: { ...sans(500), flexShrink: 1, fontSize: 12.5, color: colors.text.secondary },
  fiatInline: {
    ...sans(500),
    fontSize: 13,
    color: colors.text.secondary,
    fontVariant: ["tabular-nums"]
  }
}));
