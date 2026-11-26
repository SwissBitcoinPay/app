import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, View } from "react-native";

import { useIsDesktop } from "@/components/layout/useIsDesktop";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { getAccountWalletId } from "@/features/account/session";
import { SettingBlock } from "@/features/settings/fields";
import { logOutLegacy, type LegacySession } from "@/lib/legacy-v2/server";

import { freezeLegacyAccount, isFreezeOwed, type LegacyFreeze } from "./freeze";
import { FreezeStatus } from "./FreezeStatus";
import { LEGACY_HISTORY_DEADLINE, LegacyPasswordForm } from "./LegacyHistorySetting";

/**
 * "Old Swiss Bitcoin Pay account" of "Settings" ("Account"): the v2 account's freeze asked again
 * (freeze.ts), its owner's v2 password asked once, when the end of the migration on this device
 * could not (offline, the v2 server down, the app closed before). Shown while this device keeps the
 * freeze owed for the open account, until the end of the v2 service; gone once the v2 server
 * answered for good. A setting's block and a panel of "Settings", as the history's
 * (LegacyHistorySetting.tsx).
 */
export function LegacyFreezeSetting({ now = Date.now }: { now?: () => number } = {}) {
  const { t } = useTranslation();
  const desktop = useIsDesktop();
  const [owed, setOwed] = useState(false);
  const [asking, setAsking] = useState(false);
  const [freeze, setFreeze] = useState<LegacyFreeze | null>(null);
  // A ref: one freeze at a time, whatever the taps.
  const running = useRef(false);
  const [open] = useState(() => now() <= LEGACY_HISTORY_DEADLINE);
  useEffect(() => {
    const walletId = getAccountWalletId();
    if (!open || !walletId) return;
    let live = true;
    void isFreezeOwed(walletId).then((answer) => {
      if (live) setOwed(answer);
    });
    return () => {
      live = false;
    };
  }, [open]);

  const run = async (session: LegacySession) => {
    setAsking(false);
    if (running.current) {
      void logOutLegacy(session);
      return;
    }
    running.current = true;
    setFreeze({ phase: "running" });
    try {
      const outcome = await freezeLegacyAccount(session);
      setFreeze(outcome.freeze);
      // Nothing else needs the session here: "Swiss Bitcoin Pay history" asks its own.
      if (outcome.session) void logOutLegacy(outcome.session);
    } finally {
      running.current = false;
    }
  };

  if (!owed && freeze === null) return null;
  const startable = freeze === null || freeze.phase === "failed";
  return (
    <SettingBlock
      title={t("migration.freeze.settingTitle")}
      description={t("migration.freeze.settingDescription")}
      testID="legacy-freeze-setting"
    >
      {freeze ? <FreezeStatus freeze={freeze} onRetry={() => setAsking(true)} /> : null}
      {startable && !(freeze?.phase === "failed" && freeze.retry) ? (
        <View style={styles.row}>
          <Button
            variant="secondary"
            size="md"
            icon="lock"
            fullWidth={!desktop}
            onPress={() => setAsking(true)}
            testID="legacy-freeze-open"
          >
            {t("migration.freeze.settingStart")}
          </Button>
        </View>
      ) : null}
      <Sheet
        title={t("migration.freeze.settingTitle")}
        closeLabel={t("common.cancel")}
        visible={asking}
        onClose={() => setAsking(false)}
      >
        <LegacyPasswordForm
          lead={t("migration.freeze.settingLead")}
          submitLabel={t("migration.freeze.settingStart")}
          testIDPrefix="legacy-freeze"
          onSession={(session) => void run(session)}
        />
      </Sheet>
    </SettingBlock>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row" }
});
