import type { TFunction } from "i18next";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { getAccountWalletId } from "@/features/account/session";
import { useNotifications } from "@/features/notifications/NotificationsProvider";
import { removeAssistant } from "@/features/team/owner";
import { formatInvoiceNumber } from "@/lib/invoice/record";
import { formatInteger } from "@/lib/locale/format";
import { getDeviceLocale } from "@/lib/locale/device";
import { logFailure } from "@/lib/log/log";

import { loadDismissals, saveDismissal } from "./alert-dismissals";
import { assistantAlertKey, checkAssistants, type AssistantAlert } from "./assistant-alerts";
import { useInvoices } from "./store";

/**
 * "Wallet"'s warning about an assistant that abuses the business's numbers or floods it with
 * invoices (assistant-alerts.ts): checked once the invoices are listed, at each opening of the
 * screen. A ConfirmDialog, "Remove the assistant" (red) or "This is expected", its only answers;
 * closing it (the scrim, the system's back) is "This is expected" too. One warning at a time, the
 * most serious first.
 */
export function AssistantAlertDialog() {
  const { t } = useTranslation();
  const { notify } = useNotifications();
  // Read by "Wallet" itself (useOwnerActivity): never a read of its own.
  const invoices = useInvoices(false);
  const [alerts, setAlerts] = useState<AssistantAlert[]>([]);
  const [removing, setRemoving] = useState(false);
  const ready = invoices.status === "ready" ? invoices : null;
  // Once per opening of the screen and account: the first list read (a later one, after an
  // invoice saved, does not check again). Its outcome lands even if the list changes meanwhile.
  const checked = useRef<string | null>(null);
  const account = getAccountWalletId();
  useEffect(() => {
    if (!ready || account === null || checked.current === account) return;
    checked.current = account;
    void (async () => {
      try {
        const [found, dismissed] = await Promise.all([
          checkAssistants(ready.invoices, ready.authors),
          loadDismissals()
        ]);
        // Another account opened meanwhile: not its warnings.
        if (getAccountWalletId() !== account) return;
        setAlerts(found.filter((alert) => !dismissed.includes(assistantAlertKey(alert))));
      } catch (error) {
        logFailure("Checking the assistants failed", error);
      }
    })();
  }, [ready, account]);

  const alert = alerts[0] ?? null;
  const next = () => setAlerts((shown) => shown.slice(1));
  const dismiss = () => {
    if (!alert || removing) return;
    saveDismissal(assistantAlertKey(alert)).catch((error: unknown) =>
      logFailure("Keeping an answer to an assistant's warning failed", error)
    );
    next();
  };
  const remove = () => {
    if (!alert || removing) return;
    const { assistant } = alert;
    setRemoving(true);
    removeAssistant(assistant).then(
      () => {
        setRemoving(false);
        notify({
          tone: "success",
          title: t("integrations.assistant.removeDialog.doneTitle"),
          body: t("integrations.assistant.removeDialog.doneBody", { name: assistant.name })
        });
        // Its other warnings go with it.
        setAlerts((shown) => shown.filter((other) => other.assistant.id !== assistant.id));
      },
      (error: unknown) => {
        logFailure("Removing an assistant from its warning failed", error);
        setRemoving(false);
        notify({
          tone: "error",
          title: t("invoices.assistantAlert.removeFailedTitle"),
          body: t("invoices.assistantAlert.removeFailed", { name: assistant.name })
        });
        next();
      }
    );
  };

  return (
    <ConfirmDialog
      visible={alert !== null}
      title={alert ? titleOf(alert, t) : ""}
      body={alert ? bodyOf(alert, t) : ""}
      confirmLabel={t("invoices.assistantAlert.remove")}
      cancelLabel={t("invoices.assistantAlert.normal")}
      onConfirm={remove}
      onCancel={dismiss}
      working={removing}
      testID="assistant-alert"
      confirmTestID="assistant-alert-remove"
    />
  );
}

function titleOf(alert: AssistantAlert, t: TFunction): string {
  const name = alert.assistant.name;
  switch (alert.kind) {
    case "jump":
      return t("invoices.assistantAlert.jumpTitle", { name });
    case "blocked":
      return t("invoices.assistantAlert.blockedTitle", { name });
    case "burst":
      return t("invoices.assistantAlert.burstTitle", { name });
  }
}

function bodyOf(alert: AssistantAlert, t: TFunction): string {
  switch (alert.kind) {
    case "jump": {
      const to = formatInvoiceNumber({ year: alert.year, sequence: alert.to });
      return alert.from === 0
        ? t("invoices.assistantAlert.jumpBodyNone", { year: alert.year, to })
        : t("invoices.assistantAlert.jumpBody", {
            from: formatInvoiceNumber({ year: alert.year, sequence: alert.from }),
            to
          });
    }
    case "blocked":
      return t("invoices.assistantAlert.blockedBody");
    case "burst":
      return t("invoices.assistantAlert.burstBody", {
        invoices: formatInteger(alert.count, getDeviceLocale().languageTag)
      });
  }
}
