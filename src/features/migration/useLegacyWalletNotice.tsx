import { router } from "expo-router";
import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, View } from "react-native";

import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { getAccountWalletId } from "@/features/account/session";
import { loadLegacyWatch } from "@/lib/legacy-v2/watch-store";

import { checkLegacyWallet, subscribeLegacyTransfers, type LegacyWalletCheck } from "./transfer";
import { TransferStatus } from "./TransferStatus";
import { useLegacyTransfer, useMigrationAmount } from "./useLegacyTransfer";
import { ownsLegacyWallet } from "./wallet-owner";

/**
 * In "Wallet" (its notice, under the balance): the v2 wallet (Swiss Bitcoin Pay), once the
 * migration moved its money (transfer.ts). What the v2 service pays it since (its last payouts, a
 * till still on the v2 app, an online shop still on the v2 service) is looked for without asking
 * anything (its public key, checkLegacyWallet), and "Move" moves it: with the device's biometrics
 * where the v2 app left its words on this phone, else with the words typed again ("Type my 12
 * words", src/app/migration/words.tsx: the device watches a wallet whose words were typed, the web
 * app's included). A phone whose v2 wallet was never looked at with its words (its account opened
 * from the migration, the v2 account migrated from another device) offers to look. The v2 app's
 * words count only for the account that migrated from them (wallet-owner.ts): another account
 * opened on this phone ("Log out" since) never sees them. Nothing shows without a v2 wallet on the
 * phone for this account nor one watched, nor while nothing is known. A Callout and a secondary
 * button under it, as the wallet's other notices.
 */
export function useLegacyWalletNotice({
  enabled,
  currency,
  openWallet
}: {
  /** Once the wallet's data shows: nothing is looked for before. */
  enabled: boolean;
  /** The point of sale's currency: amounts are said in it too. */
  currency: string;
  /** Connects the account's wallet and says whether it is (the screen's own connection). */
  openWallet: () => Promise<boolean>;
}): ReactNode | null {
  const { t } = useTranslation();
  const [check, setCheck] = useState<LegacyWalletCheck | null>(null);
  // Whether the v2 app's words are on this device (the biometrics open them), else typed again.
  const [onDevice, setOnDevice] = useState(false);
  const { state, start } = useLegacyTransfer(openWallet);
  const amount = useMigrationAmount(currency);

  // A transfer done elsewhere ("Type my 12 words"): looked at again.
  const [transfers, setTransfers] = useState(0);
  useEffect(() => subscribeLegacyTransfers(() => setTransfers((count) => count + 1)), []);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    void (async () => {
      const [held, watched] = await Promise.all([
        ownsLegacyWallet(getAccountWalletId()),
        loadLegacyWatch()
      ]);
      if (!held && !watched.watch) return;
      const found = await checkLegacyWallet();
      if (!active) return;
      setOnDevice(held);
      setCheck(found);
    })();
    return () => {
      active = false;
    };
  }, [enabled, transfers]);

  if (!enabled) return null;
  const typeWords = () => router.push("/migration/words");

  if (state.phase !== "idle") {
    return (
      <View style={styles.block} testID="legacy-wallet-notice">
        <TransferStatus state={state} amount={amount} onRetry={start} onTypeWords={typeWords} />
      </View>
    );
  }
  if (!check) return null;
  const transfer = (label: string) => (
    <Button
      variant="secondary"
      size="sm"
      fullWidth={false}
      icon="arrow-right"
      onPress={onDevice ? start : typeWords}
      testID="legacy-wallet-transfer"
    >
      {label}
    </Button>
  );
  switch (check.status) {
    case "unchecked":
      return (
        <View style={styles.block} testID="legacy-wallet-notice">
          <Callout tone="warning" icon="wallet" testID="legacy-wallet-unchecked">
            {t("migration.wallet.unchecked")}
          </Callout>
          {transfer(t("migration.wallet.check"))}
        </View>
      );
    case "funds":
      return (
        <View style={styles.block} testID="legacy-wallet-notice">
          {check.confirmedSats > 0n ? (
            <>
              <Callout tone="warning" icon="wallet" testID="legacy-wallet-funds">
                {t("migration.wallet.funds", { amount: amount(check.confirmedSats) })}
              </Callout>
              {transfer(t("migration.wallet.transfer"))}
            </>
          ) : (
            <Callout tone="warning" icon="clock-regular" testID="legacy-wallet-incoming">
              {t("migration.wallet.incoming", { amount: amount(check.waitingSats) })}
            </Callout>
          )}
        </View>
      );
    case "none":
    case "unknown":
      return null;
  }
}

const styles = StyleSheet.create({
  block: { gap: 10, alignItems: "flex-start" }
});
