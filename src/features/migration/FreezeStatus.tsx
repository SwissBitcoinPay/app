import { useTranslation } from "react-i18next";
import { StyleSheet, View } from "react-native";

import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { WaitingIndicator } from "@/components/ui/WaitingIndicator";
import { SUPPORT_EMAIL } from "@/config/support";

import type { LegacyFreeze } from "./freeze";

/**
 * Where the v2 account's freeze stands (useLegacyFreeze), on "Your account is up to date": never
 * "frozen" before the v2 server said so. Its money in a few words, never the Lightning address it
 * went to (funds moved to the new sattle.me wallet).
 * "Try again" only with `onRetry` ("Your account is up to date" offers nothing while a step runs).
 * Callouts, as the transfer's.
 */
export function FreezeStatus({ freeze, onRetry }: { freeze: LegacyFreeze; onRetry?: () => void }) {
  const { t } = useTranslation();
  switch (freeze.phase) {
    case "running":
      return <WaitingIndicator label={t("migration.freeze.running")} />;
    case "done":
      return (
        <Callout tone="success" testID="migration-freeze-done">
          {t(
            freeze.payout === "sent"
              ? "migration.freeze.done"
              : freeze.payout === "none"
                ? "migration.freeze.doneNone"
                : "migration.freeze.donePending"
          )}
        </Callout>
      );
    case "conflict":
      return (
        <Callout tone="warning" testID="migration-freeze-conflict">
          {t("migration.freeze.conflict", { email: SUPPORT_EMAIL })}
        </Callout>
      );
    case "rejected":
      return (
        <Callout tone="error" testID="migration-freeze-rejected">
          {t("migration.freeze.rejected", { email: SUPPORT_EMAIL })}
        </Callout>
      );
    case "failed":
      return freeze.retry ? (
        <View style={styles.failed}>
          <Callout tone="error" testID="migration-freeze-failed">
            {t("migration.freeze.failed")}
          </Callout>
          {onRetry ? (
            <Button
              variant="secondary"
              size="sm"
              fullWidth={false}
              icon="arrows-rotate"
              onPress={onRetry}
              testID="migration-freeze-retry"
            >
              {t("migration.transfer.retry")}
            </Button>
          ) : null}
        </View>
      ) : (
        <Callout tone="error" testID="migration-freeze-failed">
          {t("migration.freeze.lost", { email: SUPPORT_EMAIL })}
        </Callout>
      );
  }
}

const styles = StyleSheet.create({
  failed: { gap: 10, alignItems: "flex-start" }
});
