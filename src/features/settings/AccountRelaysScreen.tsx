import { Redirect, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, View } from "react-native";

import { useIsDesktop } from "@/components/layout/useIsDesktop";
import { INTEGRATION_RELAY_MOVES } from "@/config/team";
import { useNotifications } from "@/features/notifications/NotificationsProvider";
import { RelaysScreenBody } from "@/features/relays/RelaysPanel";
import { loadIntegrations } from "@/features/team/owner";
import { PosFrame } from "@/features/terminal/PosFrame";
import { usePos } from "@/features/terminal/pos";
import { isMemberProfile } from "@/lib/terminal/model";
import { space } from "@/theme";

import { changeRelays } from "./account-settings";
import { useSettingsFailure } from "./parts";
import { useAccountSettings } from "./useAccountSettings";

/**
 * Saving the account's relays, from this screen (mobile) or the dialog of "Settings" (desktop):
 * the employees follow them (changeRelays). A notification says the relays are saved, then
 * `onSaved`.
 */
export function useAccountRelaysSave(
  onSaved: () => void = () => undefined
): (relays: readonly string[]) => Promise<void> {
  const { t } = useTranslation();
  const { notify } = useNotifications();
  const fail = useSettingsFailure();
  return (relays) =>
    changeRelays(relays).then(
      () => {
        notify({
          tone: "success",
          title: t("settings.relaysSavedTitle"),
          body: t("settings.relaysSavedBody"),
          key: "settings"
        });
        onSaved();
      },
      (error: unknown) => {
        fail(error);
        throw error;
      }
    );
}

/**
 * What the relays' editor says of the account's integrations: their server
 * follows INTEGRATION_RELAY_MOVES changes of the relays at most, and their key is never shown again
 * with the new ones. Said when the roster, read once `open`, lists an integration, or could not be
 * read in full (not read is never "none"); null otherwise, and while it is read.
 */
export function useIntegrationsRelaysNotice(open: boolean): string | null {
  const { t } = useTranslation();
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!open) return;
    let current = true;
    loadIntegrations().then(
      (view) => {
        if (current) setShown(view.integrations.length > 0 || view.roster !== "read");
      },
      // No finished account open: nothing to say.
      () => {
        if (current) setShown(false);
      }
    );
    return () => {
      current = false;
    };
  }, [open]);
  return open && shown ? t("relays.integrationsNotice", { moves: INTEGRATION_RELAY_MOVES }) : null;
}

/**
 * "Nostr relays" of the account on mobile, over the whole window: the
 * list, edited, saved by "Save", then back to "Settings" with a notification. Desktop
 * edits it in a dialog of "Settings"; an employee sees it there, read only.
 */
export function AccountRelaysScreen() {
  const router = useRouter();
  const desktop = useIsDesktop();
  const { profile } = usePos();
  const settings = useAccountSettings();
  const back = () => (router.canGoBack() ? router.back() : router.replace("/settings"));

  if (desktop || isMemberProfile(profile) || !settings) return <Redirect href="/settings" />;
  return <AccountRelaysBody saved={settings.relays} back={back} />;
}

function AccountRelaysBody({ saved, back }: { saved: readonly string[]; back: () => void }) {
  const { t } = useTranslation();
  const onSave = useAccountRelaysSave(back);
  const notice = useIntegrationsRelaysNotice(true);
  return (
    <PosFrame
      title={t("relays.title")}
      leading={{
        icon: "arrow-left",
        label: t("common.back"),
        onPress: back,
        testID: "relays-back"
      }}
    >
      <View style={styles.body} testID="relays-screen">
        <RelaysScreenBody saved={saved} onSave={onSave} notice={notice} />
      </View>
    </PosFrame>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, paddingBottom: space[6] }
});
