import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, View } from "react-native";
import type { TFunction } from "i18next";

import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useNotifications } from "@/features/notifications/NotificationsProvider";
import { openTeam } from "@/features/team/owner";
import { usePos } from "@/features/terminal/pos";
import { nowUnix } from "@/lib/clock";
import { logFailure } from "@/lib/log/log";
import { formatInteger } from "@/lib/locale/format";

import {
  AcceptanceError,
  acceptBlockOf,
  acceptRow,
  acceptanceAmounts,
  acceptanceOf,
  type Acceptance,
  type AmountTexts
} from "./acceptance";
import type { ActivityFormat } from "./format";
import type { ActivityItem, Fiat } from "./model";

/**
 * "Accept the amount received": what the owner may accept of `item` (a row "Underpaid" of its list:
 * acceptanceOf), and the dialog that confirms it, the difference told, before it is published
 * (acceptance.ts). The rows are read again once it is (subscribeAcceptances); `onAccepted` runs
 * too. Its amounts written with `texts`. An integration's order whose invoice ended (`late`) says
 * that its shop is not told, and to mark the order paid in its back-office too.
 */
export function useAcceptDialog(
  item: ActivityItem | null,
  texts: AmountTexts,
  onAccepted?: () => void
): { acceptance: Acceptance | null; open: () => void; dialog: ReactNode } {
  const { t } = useTranslation();
  const { notify } = useNotifications();
  // What the dialog shows, as it opened: confirmed as shown, whatever the row reads meanwhile.
  const [confirming, setConfirming] = useState<Acceptance | null>(null);
  const [working, setWorking] = useState(false);
  const acceptance = item ? acceptanceOf(item, nowUnix()) : null;
  const shown = confirming ?? acceptance;
  const amounts = shown ? acceptanceAmounts(texts, item?.fiat ?? null, shown) : null;
  const confirm = () => {
    const accepting = confirming;
    if (working || !accepting) return;
    setWorking(true);
    let account: ReturnType<typeof openTeam>;
    try {
      account = openTeam();
    } catch (error) {
      // The account closed meanwhile: nothing to accept with.
      logFailure("Accepting a sale failed: no account", error);
      setWorking(false);
      setConfirming(null);
      return;
    }
    acceptRow(accepting, account.team, account.settings.relays, nowUnix).then(
      () => {
        setWorking(false);
        setConfirming(null);
        notify({ tone: "success", title: t("activity.accept.done"), key: "acceptance" });
        onAccepted?.();
      },
      (error: unknown) => {
        setWorking(false);
        setConfirming(null);
        const code = error instanceof AcceptanceError ? error.code : "network";
        if (code === "network") logFailure("Accepting a sale failed", error);
        notify({ tone: "error", title: t(`activity.accept.errors.${code}`), key: "acceptance" });
        // Accepted meanwhile on another device, or too late for its shop (not made): read again.
        if (code !== "network") onAccepted?.();
      }
    );
  };
  const dialog = (
    <ConfirmDialog
      visible={confirming !== null}
      title={t("activity.accept.dialog.title")}
      body={
        amounts
          ? t(
              shown?.target.kind !== "order"
                ? "activity.accept.dialog.body"
                : shown.late
                  ? "activity.accept.dialog.bodyLate"
                  : "activity.accept.dialog.bodyOrder",
              { ...amounts, integration: shopOf(item, t) }
            )
          : ""
      }
      confirmLabel={t("activity.accept.dialog.confirm")}
      tone="primary"
      cancelLabel={t("activity.accept.dialog.cancel")}
      onConfirm={confirm}
      working={working}
      onCancel={() => setConfirming(null)}
      testID="activity-accept-dialog"
      confirmTestID="activity-accept-confirm"
    />
  );
  return { acceptance, open: () => setConfirming(acceptance), dialog };
}

/**
 * What a sentence calls the shop of `item`, an integration's order: its integration's name, else
 * "your shop".
 */
export function shopOf(item: ActivityItem | null, t: TFunction): string {
  return item?.by?.kind === "integration" ? item.by.name : t("activity.accept.late.yourShop");
}

/**
 * The texts of an acceptance's amounts: the sale's currency with `fiat`, else sats as prose writes
 * them, grouped in the device locale (`languageTag`): "1 000 sats", never the bitcoin figure "0.00
 * 001 000" of the amounts drawn (formatSatsGrouped), unreadable in a sentence.
 */
export function acceptanceTexts(fiat: (fiat: Fiat) => string, languageTag: string): AmountTexts {
  return { fiat, sats: (sats) => `${formatInteger(sats, languageTag)} sats` };
}

/**
 * The action under a row's details (ActivitySheet): a secondary button (the sheet has no filled
 * button), and its dialog. A row "Underpaid" that cannot be accepted now says why in its place
 * (acceptBlockOf); any other, nothing. An integration's order accepted late (from acceptanceCutoff,
 * acceptance.ts): a warning above it first, that its shop will not see it: its invoice ending in a
 * few minutes, or ended, or the acceptance its server reads not made (lapsed).
 */
export function AcceptAction({
  item,
  format,
  onAccepted
}: {
  item: ActivityItem;
  format: ActivityFormat;
  onAccepted: () => void;
}) {
  const { t } = useTranslation();
  const { languageTag } = usePos();
  const { acceptance, open, dialog } = useAcceptDialog(
    item,
    acceptanceTexts((fiat) => format.fiatText(fiat), languageTag),
    onAccepted
  );
  if (!acceptance) {
    const block = acceptBlockOf(item, nowUnix());
    if (!block) return null;
    // Why there is no action, rather than nothing: the owner would look for it.
    return (
      <Callout
        tone="warning"
        icon={block.kind === "unread" ? "clock-regular" : undefined}
        testID={`activity-accept-blocked-${block.kind}`}
      >
        {block.kind === "unmet"
          ? t("activity.accept.blocked.unmet", {
              received: acceptanceAmounts(
                acceptanceTexts((fiat) => format.fiatText(fiat), languageTag),
                item.fiat,
                block
              ).received
            })
          : t(`activity.accept.blocked.${block.kind}`)}
      </Callout>
    );
  }
  const integration = shopOf(item, t);
  const closing =
    acceptance.target.kind === "order" && nowUnix() < acceptance.target.invoice.expiresAt;
  return (
    <View style={styles.action}>
      {acceptance.late ? (
        <Callout
          tone="warning"
          title={t(closing ? "activity.accept.late.closingTitle" : "activity.accept.late.title")}
          testID="activity-accept-late"
        >
          {item.acceptance?.status === "lapsed"
            ? t("activity.accept.late.lapsedBody", { integration })
            : closing
              ? t("activity.accept.late.closingBody", { integration })
              : t("activity.accept.late.body", { integration })}
        </Callout>
      ) : null}
      <Button variant="secondary" icon="circle-check" onPress={open} testID="activity-accept">
        {t("activity.accept.action")}
      </Button>
      {dialog}
    </View>
  );
}

const styles = StyleSheet.create({
  // Under the sheet's details, its gap from them the sheet's own (SHEET_GAP).
  action: { gap: 16 }
});
