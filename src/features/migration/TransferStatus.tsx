import { useState } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, View } from "react-native";

import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { WaitingIndicator } from "@/components/ui/WaitingIndicator";
import { LEGACY_CARD_SERVICE_END, LEGACY_MERCHANT_SERVICE_END } from "@/config/legacy-v2";
import { getDeviceLocale } from "@/lib/locale/device";
import { formatDate } from "@/lib/locale/date";

import type { LegacyTransferPhase } from "./useLegacyTransfer";

const LONG_DATE: Intl.DateTimeFormatOptions = { day: "numeric", month: "long", year: "numeric" };

/** The last days of the v2 service (LEGACY_*_SERVICE_END), in the device's locale. */
export function useServiceEnds(): { merchant: string; card: string } {
  const [languageTag] = useState(() => getDeviceLocale().languageTag);
  // Noon UTC: the same calendar day in every time zone.
  const day = (iso: string) => formatDate(new Date(`${iso}T12:00:00Z`), languageTag, LONG_DATE);
  return { merchant: day(LEGACY_MERCHANT_SERVICE_END), card: day(LEGACY_CARD_SERVICE_END) };
}

/**
 * Where a transfer of the v2 wallet stands (useLegacyTransfer), in words: running, what it moved
 * ("on its way" until the account's wallet is credited: never "received"), or why nothing moved,
 * with "Try again" where trying again can help (`onRetry`; none on "Type my 12 words", whose field
 * stays). Words the phone could not read offer to type them (`onTypeWords`). `amount` says sats as
 * the migration does (useMigrationAmount). Callouts, as the wallet's other notices.
 */
export function TransferStatus({
  state,
  amount,
  onRetry,
  onTypeWords
}: {
  state: LegacyTransferPhase;
  amount: (sats: bigint) => string;
  onRetry?: () => void;
  onTypeWords?: () => void;
}) {
  const { t } = useTranslation();
  if (state.phase === "idle" || state.phase === "invalid") return null;
  if (state.phase === "running") {
    return <WaitingIndicator label={t("migration.transfer.running")} />;
  }
  const { outcome } = state;
  // The words the v2 app left on this device, erased after the transfer (transfer.ts).
  const erased = (text: string) =>
    "erased" in outcome && outcome.erased ? `${text} ${t("migration.transfer.erased")}` : text;
  const retry = onRetry ? (
    <Button
      variant="secondary"
      size="sm"
      fullWidth={false}
      icon="arrows-rotate"
      onPress={onRetry}
      testID="migration-transfer-retry"
    >
      {t("migration.transfer.retry")}
    </Button>
  ) : null;
  switch (outcome.status) {
    case "sent":
      return (
        <View style={styles.block}>
          <Callout
            tone="success"
            title={t("migration.transfer.sentTitle", { amount: amount(outcome.outputSats) })}
            testID="migration-transfer-sent"
          >
            {erased(t("migration.transfer.sent", { fee: amount(outcome.feeSats) }))}
          </Callout>
          {outcome.waitingSats > 0n ? (
            <Callout tone="warning" icon="clock-regular" testID="migration-transfer-more">
              {t("migration.transfer.more", { amount: amount(outcome.waitingSats) })}
            </Callout>
          ) : null}
        </View>
      );
    case "empty":
      return (
        <Callout tone="success" testID="migration-transfer-empty">
          {erased(t("migration.transfer.empty"))}
        </Callout>
      );
    case "waiting":
      return (
        <Callout tone="warning" icon="clock-regular" testID="migration-transfer-waiting">
          {t("migration.transfer.waiting", { amount: amount(outcome.waitingSats) })}
        </Callout>
      );
    case "tooSmall":
      return (
        <Callout tone="warning" testID="migration-transfer-small">
          {outcome.erased
            ? erased(t("migration.transfer.tooSmallErased", { amount: amount(outcome.sats) }))
            : t("migration.transfer.tooSmall", { amount: amount(outcome.sats) })}
        </Callout>
      );
    case "absent":
    // Said on the words' field ("Type my 12 words"), which stays.
    case "unused":
    case "mismatch":
      return null;
    case "unreadable":
      return (
        <View style={styles.block}>
          <Callout tone="error" testID="migration-transfer-unreadable">
            {t("migration.transfer.unreadable")}
          </Callout>
          {retry}
          {onTypeWords ? (
            <Button
              variant="secondary"
              size="sm"
              fullWidth={false}
              icon="keyboard"
              onPress={onTypeWords}
              testID="migration-transfer-type-words"
            >
              {t("migration.words.open")}
            </Button>
          ) : null}
        </View>
      );
    case "failed":
      return (
        <View style={styles.block}>
          <Callout tone="error" testID="migration-transfer-failed">
            {t("migration.transfer.failed")}
          </Callout>
          {retry}
        </View>
      );
  }
}

const styles = StyleSheet.create({
  block: { gap: 10, alignItems: "flex-start" }
});
