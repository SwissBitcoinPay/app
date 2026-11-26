import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";

import { ListRow } from "@/components/ui/ListRow";
import { StatusPill } from "@/components/ui/StatusPill";
import { usePos } from "@/features/terminal/pos";
import { formatDate, formatDateCapitalized } from "@/lib/locale/date";
import { decimalToInteger } from "@/lib/mtpelerin/decimal";
import { isLightningSale, orderOutcome, type SellAsset } from "@/lib/mtpelerin/sale";
import type { MtpOrder } from "@/lib/mtpelerin/types";
import { makeStyles, sans } from "@/theme";

import { OUTCOME_PILL } from "./OrderPage";
import { Card, Failure, SellBody, Waiting, busyText, decimalText, satsText } from "./parts";
import { useSellNav } from "./SellSheet";
import { ofTheYear, useOrders, useWalletPayments } from "./useOrders";

/*
 * "Your sales", a page of "Sell"'s panel: this year's sales from the
 * merchant's Lightning wallet, newest first, by month, each with what Mt Pelerin says of it
 * (sale.ts), and the wallet while Mt Pelerin tells no funds of it (its invoice paid or being paid).
 * A sale opens its progress (OrderPage).
 */
export function HistoryPage() {
  const styles = useStyles();
  const { t } = useTranslation();
  const { flow, state, push } = useSellNav();
  const { languageTag } = usePos();
  const { read, retry } = useOrders(flow);
  const walletPayments = useWalletPayments(flow, read.state === "ready" ? read.orders : null);
  const asset = state.view.name === "ready" ? state.view.ready.asset : null;
  const sales =
    read.state === "ready" && read.orders && asset
      ? salesOf(ofTheYear(read.orders, read.readAt), asset)
      : null;
  const nowSeconds = read.state === "ready" ? Math.floor(read.readAt / 1000) : 0;

  return (
    <SellBody testID="sell-history">
      {read.state === "loading" || (read.state === "ready" && read.orders && !walletPayments) ? (
        <Waiting label={busyText(t, "reading")} />
      ) : read.state === "failed" ? (
        <Failure failure={{ kind: "offline", retry }} />
      ) : read.orders === null ? (
        <Text style={styles.empty}>{t("sell.history.unreadable")}</Text>
      ) : sales === null || sales.length === 0 ? (
        <Text style={styles.empty} testID="sell-history-empty">
          {t("sell.history.empty")}
        </Text>
      ) : (
        byMonth(sales).map(({ month, orders }) => (
          <View key={month} style={styles.month}>
            <Text style={styles.monthTitle}>
              {formatDateCapitalized(new Date(orders[0]!.createdAt * 1000), languageTag, {
                month: "long",
                year: "numeric"
              })}
            </Text>
            <Card>
              {orders.map((order, index) => {
                const outcome = orderOutcome(
                  order,
                  nowSeconds,
                  order.paymentHash === null
                    ? null
                    : (walletPayments?.get(order.paymentHash) ?? null)
                );
                const sats = decimalToInteger(order.sourceAmount);
                const amount =
                  decimalText(order.destAmount, order.destCurrency, languageTag, "down") ?? "—";
                const day = formatDate(new Date(order.createdAt * 1000), languageTag, {
                  day: "numeric",
                  month: "short"
                });
                return (
                  <ListRow
                    inset={0}
                    key={order.id}
                    onPress={() => push({ name: "order", orderId: order.id })}
                    testID={`sell-sale-${order.id}`}
                  >
                    <View style={[styles.row, index > 0 && styles.divided]}>
                      <View style={styles.texts}>
                        <Text style={styles.amount}>{amount}</Text>
                        <Text style={styles.sub}>
                          {sats === null ? day : `${day} · ${satsText(sats, languageTag)}`}
                        </Text>
                      </View>
                      <StatusPill
                        state={OUTCOME_PILL[outcome]}
                        label={t(`sell.order.outcomes.${outcome}`)}
                        size="sm"
                      />
                    </View>
                  </ListRow>
                );
              })}
            </Card>
          </View>
        ))
      )}
    </SellBody>
  );
}

/** "Sell"'s sales among `orders` (sale.ts): its asset's, never a buy. */
function salesOf(orders: readonly MtpOrder[], asset: SellAsset): MtpOrder[] {
  return orders.filter((order) => isLightningSale(order, asset));
}

/** `orders` (newest first) by their month, in the device's time zone. */
function byMonth(orders: readonly MtpOrder[]): { month: string; orders: MtpOrder[] }[] {
  const months: { month: string; orders: MtpOrder[] }[] = [];
  for (const order of orders) {
    const date = new Date(order.createdAt * 1000);
    const month = `${date.getFullYear()}-${date.getMonth()}`;
    const last = months[months.length - 1];
    if (last?.month === month) last.orders.push(order);
    else months.push({ month, orders: [order] });
  }
  return months;
}

const useStyles = makeStyles(({ colors }) => ({
  empty: { ...sans(500), fontSize: 14, color: colors.text.secondary },
  month: { gap: 10 },
  monthTitle: { ...sans(700), fontSize: 15, color: colors.text.secondary },
  row: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 64, paddingVertical: 10 },
  divided: { borderTopWidth: 1, borderTopColor: colors.border.subtle },
  texts: { flex: 1, gap: 3 },
  amount: { ...sans(700), fontSize: 15, color: colors.text.primary },
  sub: { ...sans(500), fontSize: 12.5, color: colors.text.secondary }
}));
