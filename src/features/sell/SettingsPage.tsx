import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";

import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Icon, type IconName } from "@/components/ui/Icon";
import { ListRow } from "@/components/ui/ListRow";
import { usePos } from "@/features/terminal/pos";
import { SELL_LIMITS_IDENTIFIED_CHF_MINOR } from "@/config/mtpelerin";
import { chfLeftMinor, isIdentified, sellLimits } from "@/lib/mtpelerin/limits";
import { isLightningSale } from "@/lib/mtpelerin/sale";
import { makeStyles, sans, useTheme } from "@/theme";

import { Card, Failure, SellBody, fiatText } from "./parts";
import { useSellNav } from "./SellSheet";
import { ofTheYear, useOrders } from "./useOrders";

/*
 * "Sale settings", a page of "Sell"'s panel: the
 * Mt Pelerin account (its e-mail, how it logs in), the Lightning address and its proof, then the
 * bank accounts, the limits (what is left to sell; a sale's limit once the identity is verified)
 * and the year's sales, each a page of the panel; "Log out of Mt Pelerin", on every device
 * of the account (session-sync.ts), confirmed first, back to the panel's first page. A figure not
 * read yet is "—", never "0".
 */
export function SettingsPage() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { flow, state, push } = useSellNav();
  const { languageTag } = usePos();
  const [confirming, setConfirming] = useState(false);
  // A logout asked here: its failure says so on this page.
  const [loggingOut, setLoggingOut] = useState(false);
  const { read } = useOrders(flow);
  const known = flow.profile();
  const accounts = flow.bankAccounts();
  const lightning = known?.lightning ?? null;
  const asset = state.view.name === "ready" ? state.view.ready.asset : null;
  // "Your sales": the year's, not the month's of December the limits read in January too.
  const orders =
    read.state === "ready" && read.orders !== null ? ofTheYear(read.orders, read.readAt) : null;
  // Identified at Mt Pelerin: a sale's limit only, never what an unverified month leaves.
  const person = known?.person ?? null;
  const identified = person !== null && isIdentified(person);
  const left =
    read.state === "ready" ? chfLeftMinor(sellLimits(read.orders, new Date(read.readAt))) : null;
  const sales =
    orders && asset ? orders.filter((order) => isLightningSale(order, asset)).length : null;
  const logout = async () => {
    setConfirming(false);
    setLoggingOut(true);
    // Done, the panel goes back to its first page by itself (no longer ready, SellSheet.tsx);
    // failed, this page stays with its failure and retry.
    await flow.logout();
  };

  return (
    <SellBody
      footer={
        <Button
          variant="destructive"
          icon="arrow-right-from-bracket"
          loading={state.busy === "loggingOut"}
          onPress={() => setConfirming(true)}
          testID="sell-logout"
        >
          {t("sell.settings.logout")}
        </Button>
      }
      testID="sell-settings"
    >
      <Card>
        <Line
          icon="envelope"
          title={known?.person.email ?? "—"}
          sub={flow.loginKind() === "sms" ? t("sell.settings.account") : t("sell.settings.byKey")}
        />
        <Line
          icon="bolt"
          title={lightning?.cryptoAddress ?? "—"}
          sub={
            <Text style={styles.sub}>
              {t("sell.settings.lightning")}
              {/* Its state once read only: never "pending" for an address not read. */}
              {lightning === null ? null : lightning.status === "active" ? (
                <>
                  {" · "}
                  <Text style={styles.verified} testID="sell-settings-verified">
                    <Icon name="check" size={11} color={colors.success.fg} />
                    {` ${t("sell.settings.verified")}`}
                  </Text>
                </>
              ) : (
                ` · ${t("sell.settings.pendingValidation")}`
              )}
            </Text>
          }
          divided
        />
      </Card>
      <Card>
        <Line
          icon="landmark"
          title={t("sell.settings.banks")}
          sub={accounts === null ? "—" : t("sell.settings.banksCount", { count: accounts.length })}
          onPress={() => push({ name: "accounts" })}
          testID="sell-settings-accounts"
        />
        <Line
          icon="gauge"
          title={t("sell.settings.limits")}
          sub={
            identified
              ? t("sell.settings.perSale", {
                  amount: fiatText(SELL_LIMITS_IDENTIFIED_CHF_MINOR.sale, "CHF", languageTag)
                })
              : left === null
                ? "—"
                : t("sell.settings.left", { amount: fiatText(left, "CHF", languageTag) })
          }
          onPress={() => push({ name: "limits" })}
          divided
          testID="sell-settings-limits"
        />
        <Line
          icon="receipt"
          title={t("sell.settings.history")}
          sub={sales === null ? "—" : t("sell.settings.salesCount", { count: sales })}
          onPress={() => push({ name: "history" })}
          divided
          testID="sell-settings-history"
        />
      </Card>
      {loggingOut && state.failure ? (
        <Failure failure={state.failure} testID="sell-settings-failure" />
      ) : null}
      <ConfirmDialog
        visible={confirming}
        title={t("sell.settings.logoutTitle")}
        body={t("sell.settings.logoutBody")}
        confirmLabel={t("sell.settings.logoutConfirm")}
        tone="destructive"
        cancelLabel={t("sell.settings.cancel")}
        onConfirm={() => void logout()}
        onCancel={() => setConfirming(false)}
        confirmTestID="sell-logout-confirm"
      />
    </SellBody>
  );
}

function Line({
  icon,
  title,
  sub,
  onPress,
  divided = false,
  testID
}: {
  icon: IconName;
  title: string;
  sub: ReactNode;
  onPress?: () => void;
  divided?: boolean;
  testID?: string;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const content = (
    <View style={[styles.line, divided && styles.divided]}>
      <Icon name={icon} size={18} color={colors.text.accent} />
      <View style={styles.texts}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {typeof sub === "string" ? <Text style={styles.sub}>{sub}</Text> : sub}
      </View>
      {onPress ? <Icon name="chevron-right" size={14} color={colors.text.secondary} /> : null}
    </View>
  );
  return onPress ? (
    <ListRow inset={0} onPress={onPress} testID={testID}>
      {content}
    </ListRow>
  ) : (
    <View testID={testID}>{content}</View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  line: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 64, paddingVertical: 10 },
  divided: { borderTopWidth: 1, borderTopColor: colors.border.subtle },
  texts: { flex: 1, gap: 3 },
  title: { ...sans(600), fontSize: 15, color: colors.text.primary },
  sub: { ...sans(500), fontSize: 12.5, color: colors.text.secondary },
  verified: { ...sans(600), color: colors.success.fg }
}));
