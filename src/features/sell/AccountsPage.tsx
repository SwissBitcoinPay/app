import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";

import { Lead } from "@/components/ui/Heading";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Icon } from "@/components/ui/Icon";
import { ListRow } from "@/components/ui/ListRow";
import { StatusPill } from "@/components/ui/StatusPill";
import { getAccountSettings } from "@/features/account/session";
import { maskedIban, ownerNameText } from "@/lib/mtpelerin/accounts";
import { makeStyles, sans, useTheme } from "@/theme";

import { Card, Iban, IncompleteAddress, SellBody, Waiting, busyText } from "./parts";
import { useSellNav } from "./SellSheet";

/*
 * "Bank accounts", a page of "Sell"'s panel: the bank accounts Mt Pelerin
 * wires the sales to, "Add an account". An account pressed opens "Edit the account"
 * (its holder and address, AccountFormPage; the row's chevron as "Settings"'s lines). None is
 * removed: Mt Pelerin refuses it (seen on dev/test). The settings' account says so ("Settings");
 * one not active yet says "Pending".
 * Accounts Mt Pelerin listed that the app cannot read (guards.ts) are not offered: a note under the
 * list says how many.
 */
export function AccountsPage() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { flow, state, push } = useSellNav();
  const editing = state.busy === "savingAccount";
  const accounts = flow.bankAccounts();
  const unreadable = flow.unreadableBankCount();
  const settingsId = getAccountSettings()?.payoutAccountId ?? null;
  return (
    <SellBody
      footer={
        <Button
          variant="secondary"
          icon="plus"
          onPress={() => push({ name: "accountForm" })}
          testID="sell-accounts-add"
        >
          {t("sell.accounts.add")}
        </Button>
      }
      testID="sell-accounts"
    >
      <Lead style={styles.lead}>{t("sell.accounts.lead")}</Lead>
      <View>
        {accounts === null ? (
          <Waiting label={busyText(t, state.busy ?? "reading")} />
        ) : (
          <Card>
            {accounts.map((account, index) => (
              <ListRow
                inset={0}
                key={account.id}
                accessibilityRole="button"
                accessibilityHint={t("sell.accounts.editHint")}
                disabled={editing}
                onPress={() => push({ name: "accountEdit", account })}
                testID={`sell-bank-${index}`}
              >
                <View style={[styles.row, index > 0 && styles.divided]}>
                  <Icon name="landmark" size={18} color={colors.text.accent} />
                  <View style={styles.texts}>
                    <Text style={styles.name}>{ownerNameText(account.owner.name)}</Text>
                    <Iban>{`${maskedIban(account.iban)} · ${account.currency}`}</Iban>
                    <IncompleteAddress account={account} />
                  </View>
                  {account.status !== "active" ? (
                    <StatusPill state="open" label={t("sell.accounts.pending")} size="sm" />
                  ) : account.id === settingsId ? (
                    <StatusPill state="draft" label={t("sell.accounts.fromSettings")} size="sm" />
                  ) : null}
                  <Icon name="chevron-right" size={14} color={colors.text.secondary} />
                </View>
              </ListRow>
            ))}
          </Card>
        )}
      </View>
      {accounts !== null && unreadable > 0 ? (
        <Callout tone="warning" testID="sell-accounts-unreadable">
          {t("sell.accounts.unreadable", { count: unreadable })}
        </Callout>
      ) : null}
    </SellBody>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  lead: { marginTop: 0 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 64, paddingVertical: 10 },
  divided: { borderTopWidth: 1, borderTopColor: colors.border.subtle },
  texts: { flex: 1, gap: 3 },
  name: { ...sans(600), fontSize: 15, color: colors.text.primary }
}));
