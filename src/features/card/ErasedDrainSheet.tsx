import { useState } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, View } from "react-native";

import { useIsDesktop } from "@/components/layout/useIsDesktop";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Sheet } from "@/components/ui/Sheet";
import { Spinner } from "@/components/ui/Spinner";

import { CardDrain } from "./CardDrain";
import { cardSendSource, type CardWalletOf } from "./card-wallet";
import { useCardWallet } from "./CardWalletPanel";
import { cardWithdrawalSource } from "./withdrawal-source";

/**
 * The sats of a wallet no card shows any more (erased-funds.ts), on a card holder's device (no main
 * balance to send them back to): "Empty the card" (CardDrain) of that wallet, connected while the
 * sheet shows. `noted`: the wallet of a card
 * whose programming stopped, which pays from it again once added again: its withdrawal is noted for
 * its history (withdrawal-source.ts); an erased wallet's never is (nothing of it shows again).
 * `onClose(changed)`: the wallet is read again when something may have left it.
 */
export function ErasedDrainSheet({
  wallet,
  noted,
  onClose
}: {
  wallet: CardWalletOf | null;
  noted: boolean;
  onClose: (changed: boolean) => void;
}) {
  const { t } = useTranslation();
  const desktop = useIsDesktop();
  const { loaded, retry } = useCardWallet(wallet);
  // The passkey or the payment running: the sheet cannot be closed.
  const [busy, setBusy] = useState(false);
  return (
    <Sheet
      title={t("cards.wallet.emptyCard")}
      closeLabel={t("cards.sheet.close")}
      visible={wallet !== null}
      onClose={() => onClose(false)}
      dismissible={!busy}
      dialogWidth={560}
      testID="erased-drain-sheet"
    >
      {loaded.status === "ready" ? (
        <CardDrain
          // Another wallet, or the same one leased again: its form afresh.
          key={`${loaded.lease.cardId}/${loaded.lease.generation}`}
          source={noted ? cardWithdrawalSource(loaded.lease) : cardSendSource(loaded.lease)}
          readBalance={() => loaded.lease.wallet.getBalance(true)}
          desktop={desktop}
          onBusy={setBusy}
          onDone={onClose}
        />
      ) : loaded.status === "failed" ? (
        <View style={styles.content}>
          <Callout tone="error" testID="erased-drain-failed">
            {t("cards.wallet.failed")}
          </Callout>
          <Button variant="secondary" onPress={retry} testID="erased-drain-retry">
            {t("card.retry")}
          </Button>
        </View>
      ) : (
        <View style={styles.waiting} testID="erased-drain-loading">
          <Spinner size={18} />
        </View>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  content: { gap: 14 },
  waiting: { alignItems: "center", paddingVertical: 24 }
});
