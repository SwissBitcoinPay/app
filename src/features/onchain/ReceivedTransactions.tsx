import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";

import { SatsAmount } from "@/components/ui/AmountBlock";
import { Icon } from "@/components/ui/Icon";
import { Spinner } from "@/components/ui/Spinner";
import { REQUIRED_CONFIRMATIONS } from "@/config/onchain";
import type { SaleTransaction } from "@/features/terminal/useSale";
import { formatDate } from "@/lib/locale/date";
import { formatInteger } from "@/lib/locale/format";
import type { PayerNode } from "@/lib/onchain/node";
import { formatSatsGrouped } from "@/lib/terminal/amount";
import { makeStyles, palette, radius, sans, stroke, tracked, type, useTheme } from "@/theme";

import { TxLink } from "./TxLink";

/** When a transaction was received (Unix ms), as a date and a time of `languageTag`. */
function receivedOn(ms: number, languageTag: string): string {
  return formatDate(new Date(ms), languageTag, { dateStyle: "short", timeStyle: "short" });
}

/**
 * What an underpaid sale received by its end: each transaction that paid
 * its address, with when it was sent (broadcast-time.ts; on a checkout link's page, when the page
 * saw it while the address was leased, else BlockCypher's time), its id (linked to its page on the
 * explorer the screen reads, `node` else mempool.space: TxLink) and whether
 * it is confirmed, then what came over Lightning. Composed of the chain card's
 * pieces (UnderpaidChain). Shown at the point of sale and on the payer's page.
 */
export function ReceivedTransactions({
  transactions,
  lightning,
  languageTag,
  node
}: {
  transactions: readonly SaleTransaction[];
  /** Sats received over Lightning, 0 for none. */
  lightning: bigint;
  languageTag: string;
  /**
   * The merchant's node the screen reads the chain on, where its transactions' links lead; null for
   * mempool.space.
   */
  node: PayerNode | null;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const satsLabel = (value: bigint) =>
    t("pos.satsLabel", { sats: formatInteger(value, languageTag) });
  const sorted = [...transactions].sort((a, b) => a.receivedAt - b.receivedAt);
  const rows = [
    ...sorted.map((tx) => {
      const confirmed = tx.confirmations >= REQUIRED_CONFIRMATIONS;
      return (
        <View key={tx.txid} style={styles.row} testID="received-transaction">
          <Icon name="bitcoin" size={15} color={palette.orange} style={styles.icon} />
          <View style={styles.text}>
            <View style={styles.line}>
              <Text style={styles.title}>{receivedOn(tx.receivedAt, languageTag)}</Text>
              <SatsAmount
                value={formatSatsGrouped(tx.sats)}
                size={13}
                showIcon={false}
                accessibilityLabel={satsLabel(tx.sats)}
              />
            </View>
            {/* Cut in its middle: its start and end, as explorers show them. */}
            <TxLink
              txid={tx.txid}
              node={node}
              cut={8}
              fontSize={type.caption}
              style={styles.txid}
            />
            <View style={styles.statusLine}>
              {/* Still waiting on the network: smaller than its line. */}
              {confirmed ? null : <Spinner size={12} testID="received-transaction-confirming" />}
              <Text
                style={[
                  styles.status,
                  { color: confirmed ? colors.state.settled.fg : colors.state.unconfirmed.fg }
                ]}
              >
                {confirmed
                  ? t("pos.underpaidEnded.confirmed")
                  : t("pos.underpaidEnded.confirming", {
                      done: tx.confirmations,
                      required: REQUIRED_CONFIRMATIONS
                    })}
              </Text>
            </View>
          </View>
        </View>
      );
    }),
    ...(lightning > 0n
      ? [
          <View key="lightning" style={styles.row} testID="received-lightning">
            <Icon name="bolt" size={14} color={palette.orange} style={styles.icon} />
            <View style={[styles.text, styles.line]}>
              <Text style={styles.title}>{t("pos.networks.lightning")}</Text>
              <SatsAmount
                value={formatSatsGrouped(lightning)}
                size={13}
                showIcon={false}
                accessibilityLabel={satsLabel(lightning)}
              />
            </View>
          </View>
        ]
      : [])
  ];

  return (
    <View style={styles.card} testID="received-transactions">
      <Text style={styles.heading}>{t("pos.underpaidEnded.received")}</Text>
      {rows.flatMap((row, i) =>
        i === 0 ? [row] : [<View key={`rule-${i}`} style={styles.rule} />, row]
      )}
    </View>
  );
}

const useStyles = makeStyles(({ colors, shadow }) => ({
  card: {
    alignSelf: "stretch",
    backgroundColor: colors.background.surface,
    borderRadius: radius.lg,
    boxShadow: shadow.card,
    paddingVertical: 12,
    paddingHorizontal: 16
  },
  heading: {
    ...sans(700),
    fontSize: type.label,
    letterSpacing: tracked.label,
    color: colors.text.primary,
    marginBottom: 4
  },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 8 },
  icon: { marginTop: 2 },
  text: { flex: 1, minWidth: 0, gap: 2 },
  line: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  title: {
    ...sans(600),
    fontSize: type.label,
    letterSpacing: tracked.label,
    color: colors.text.primary
  },
  // As wide as its text: the rest of its line takes no tap.
  txid: { alignSelf: "flex-start" },
  statusLine: { flexDirection: "row", alignItems: "center", gap: 6 },
  status: { ...sans(600), fontSize: type.caption },
  rule: { height: stroke.hairline, backgroundColor: colors.border.faint }
}));
