import { useEffect, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";

import { useNotifications } from "@/features/notifications/NotificationsProvider";
import { followWebUpdate, webUpdateReady } from "@/lib/web-update/watch";

/**
 * "New version available": the web app deployed
 * again while this page is open (src/lib/web-update/). A notification until the page reloads, as
 * its "Update" does: then the whole new version runs, no screen of the former one is left
 * asking for code the host no longer has. When to reload is the user's call, a sale being made
 * goes on meanwhile. Inside a NotificationsProvider; nothing on the apps.
 */
export function WebUpdateNotice() {
  const { t } = useTranslation();
  const { notify } = useNotifications();
  const ready = useSyncExternalStore(followWebUpdate, webUpdateReady);

  useEffect(() => {
    if (!ready) return;
    notify({
      tone: "info",
      title: t("navigation.update.title"),
      body: t("navigation.update.body"),
      action: {
        label: t("navigation.update.action"),
        icon: "arrow-rotate-right",
        onPress: () => globalThis.location.reload()
      },
      key: "web-update",
      duration: null
    });
  }, [ready, notify, t]);

  return null;
}
