import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Callout } from "@/components/ui/Callout";
import { WaitingIndicator } from "@/components/ui/WaitingIndicator";
import { getDeviceLocale } from "@/lib/locale/device";
import { formatInteger } from "@/lib/locale/format";

import type { HistoryImportStatus } from "./history-import";

/**
 * Where the copy of the v2 account's history stands (history-import.ts), in one line: copying (how
 * far), copied (how many movements), or not ("Settings" starts it again). Nothing while none
 * started, nor for a history without any movement.
 * The migration's Callouts.
 */
export function HistoryImportLine({ status }: { status: HistoryImportStatus }) {
  const { t } = useTranslation();
  const [languageTag] = useState(() => getDeviceLocale().languageTag);
  switch (status.phase) {
    case "idle":
      return null;
    case "running":
      // The v2 server tells no total: the rows read, then those written of every row read.
      if (status.step === "reading") {
        if (status.rows === 0) return <WaitingIndicator label={t("migration.history.running")} />;
        return (
          <WaitingIndicator
            label={t("migration.history.reading", {
              count: status.rows,
              formatted: formatInteger(status.rows, languageTag)
            })}
          />
        );
      }
      if (status.total === 0) return <WaitingIndicator label={t("migration.history.running")} />;
      return (
        <WaitingIndicator
          label={t("migration.history.writing", {
            count: status.total,
            copied: formatInteger(status.copied, languageTag),
            total: formatInteger(status.total, languageTag)
          })}
          progress={{ now: status.copied, max: status.total }}
        />
      );
    case "done":
      // An account without any movement to copy: nothing to say.
      if (status.rows === 0) return null;
      return (
        <Callout tone="success" testID="migration-history-done">
          {t("migration.history.done", {
            count: status.rows,
            formatted: formatInteger(status.rows, languageTag)
          })}
        </Callout>
      );
    case "failed":
      return (
        <Callout tone="warning" testID="migration-history-failed">
          {t("migration.history.failed")}
        </Callout>
      );
  }
}
