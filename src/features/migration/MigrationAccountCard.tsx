import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";

import { isPayoutCurrency } from "@/config/payout-currencies";
import type { MigrationPlan } from "@/features/migration/plan";
import { getDeviceLocale } from "@/lib/locale/device";
import { formatPercent } from "@/lib/locale/format";
import { maskedIban } from "@/lib/mtpelerin/accounts";
import { compactIban } from "@/lib/iban";
import {
  currencyColors,
  makeStyles,
  palette,
  proseLineHeight,
  radius,
  sans,
  stroke,
  tracked,
  type,
  useTheme
} from "@/theme";

/**
 * What the card says of how the v2 account was paid out: the new account's settings once the v2
 * server read it (`read`, migrationPlan); before, only that it is being read (`reading`, with the
 * v2 app's session) or that the password reads it (`password`). Never a share nor a bank account
 * before the v2 server said them: "not read yet" is no "all in bitcoin"; read but not whole, "to
 * choose" (the split asked once the account is created, plan.ts).
 */
export type MigrationPayouts =
  { kind: "read"; plan: MigrationPlan } | { kind: "reading" } | { kind: "password" };

/**
 * The v2 account's card, shown first: its business, its owner's e-mail, its currency, then how it
 * was paid out as sattle.me takes it: the split between bitcoin and bank, the bank account masked,
 * its holder. White, the card's shadow and ring, as "Cards"'s options (RelayPanel.tsx). `footer`:
 * what is said under it (that it was read, that the money follows).
 */
export function MigrationAccountCard({
  name,
  email,
  currency,
  payouts,
  footer
}: {
  name: string | null;
  email: string | null;
  currency: string | null;
  payouts: MigrationPayouts;
  footer?: ReactNode;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const [languageTag] = useState(() => getDeviceLocale().languageTag);
  const patch = payouts.kind === "read" ? payouts.plan.patch : null;
  // The v2 bank account, prefilled at the bank step (plan.ts): its IBAN and holder as read.
  const bank = payouts.kind === "read" ? payouts.plan.bankDraft : null;
  // The split to choose after the creation when the v2 server did not say it whole (plan.ts): no
  // share shown then, not even the v2 one the split starts from.
  const toChoose = patch?.signUp === "split";
  const percent = toChoose ? null : (patch?.bitcoinPercent ?? null);
  const payout = patch?.payoutCurrency ?? null;
  const fiatColor =
    payout && isPayoutCurrency(payout) ? currencyColors[payout].fill : colors.text.primary;
  // Once read, the currency the new account takes (plan.ts: a currency sattle.me counts in), never
  // one it left out; before, the v2 app's own.
  const shownCurrency = patch ? (patch.displayCurrency ?? null) : currency;

  return (
    <View style={styles.card} testID="migration-confirm-card">
      {name || email ? (
        <>
          <View style={styles.identity}>
            {name ? (
              <Text style={styles.name} testID="migration-confirm-name">
                {name}
              </Text>
            ) : null}
            {email ? (
              <Text style={styles.email} testID="migration-confirm-email">
                {email}
              </Text>
            ) : null}
          </View>
          <View style={styles.divider} />
        </>
      ) : null}
      {shownCurrency ? (
        <Row label={t("migration.confirm.currency")} testID="migration-confirm-currency">
          <Text style={styles.value}>{shownCurrency}</Text>
        </Row>
      ) : null}
      {percent !== null ? (
        <View style={styles.split}>
          <Row label={t("migration.confirm.payouts")} testID="migration-confirm-split">
            <Text style={styles.value}>
              {percent === 100
                ? t("migration.confirm.allBitcoin", { percent: formatPercent(100, languageTag) })
                : t("migration.confirm.split", {
                    bitcoin: formatPercent(percent, languageTag),
                    bank: formatPercent(100 - percent, languageTag)
                  })}
            </Text>
          </Row>
          <View
            style={styles.bar}
            accessible={false}
            importantForAccessibility="no-hide-descendants"
          >
            {percent > 0 ? (
              <View style={[styles.block, { flex: percent, backgroundColor: palette.orange }]} />
            ) : null}
            {percent < 100 ? (
              <View style={[styles.block, { flex: 100 - percent, backgroundColor: fiatColor }]} />
            ) : null}
          </View>
        </View>
      ) : toChoose ? (
        <Row label={t("migration.confirm.payouts")} testID="migration-confirm-to-choose">
          <Text style={[styles.value, styles.pending]}>
            {t("migration.confirm.payoutsToChoose")}
          </Text>
        </Row>
      ) : (
        <Row label={t("migration.confirm.payouts")} testID="migration-confirm-pending">
          <Text style={[styles.value, styles.pending]}>
            {t(
              payouts.kind === "reading"
                ? "migration.home.payoutsReading"
                : "migration.home.payoutsAfterPassword"
            )}
          </Text>
        </Row>
      )}
      {bank ? (
        <>
          <Row label={t("migration.confirm.bank")} testID="migration-confirm-iban">
            <Text style={styles.value}>{maskedIban(compactIban(bank.iban))}</Text>
          </Row>
          {bank.companyName.trim() !== "" ? (
            <Row label={t("migration.confirm.holder")} testID="migration-confirm-holder">
              <Text style={styles.value}>{bank.companyName.trim()}</Text>
            </Row>
          ) : null}
        </>
      ) : null}
      {footer}
    </View>
  );
}

function Row({ label, children, testID }: { label: string; children: ReactNode; testID?: string }) {
  const styles = useStyles();
  return (
    <View style={styles.row} testID={testID}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

const useStyles = makeStyles(({ colors, shadow }) => ({
  card: {
    backgroundColor: colors.background.surface,
    borderRadius: radius.lg,
    boxShadow: `${shadow.card}, inset 0 0 0 1px ${colors.border.faint}`,
    padding: 18,
    gap: 14
  },
  identity: { gap: 4 },
  name: {
    ...sans(700),
    fontSize: type.title,
    letterSpacing: tracked.title,
    color: colors.text.primary
  },
  email: { ...sans(500), fontSize: type.body, color: colors.text.secondary },
  divider: { height: stroke.hairline, backgroundColor: colors.border.subtle },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    flexWrap: "wrap",
    gap: 12
  },
  label: { ...sans(500), fontSize: type.body, color: colors.text.secondary },
  value: {
    ...sans(700),
    flexShrink: 1,
    fontSize: type.body,
    lineHeight: proseLineHeight,
    color: colors.text.primary,
    textAlign: "right"
  },
  pending: { ...sans(500), color: colors.text.secondary },
  split: { gap: 8 },
  bar: { flexDirection: "row", height: 10, borderRadius: 5, overflow: "hidden", gap: 2 },
  block: { height: 10 }
}));
