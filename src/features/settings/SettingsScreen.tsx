import { useState } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, View } from "react-native";

import { Spinner } from "@/components/ui/Spinner";
import { useHeaderNavigation } from "@/features/navigation/header-navigation";
import { useUnlocked } from "@/features/navigation/lock";
import { useShellUnlock } from "@/features/navigation/unlock-context";
import { PosFrame } from "@/features/terminal/PosFrame";
import { usePos } from "@/features/terminal/pos";
import { isCardHolderProfile, isMemberProfile } from "@/lib/terminal/model";

import { LockedSettings } from "./LockedSettings";
import { MemberSettings } from "./MemberSettings";
import type { OwnerRubric } from "./OwnerRubrics";
import { OwnerSettings } from "./OwnerSettings";
import { useAccountSettings } from "./useAccountSettings";

/**
 * "Settings": the owner's on a device of the account (its settings, open once unlocked; in till
 * mode, a reduced version: LockedSettings), a card holder's on its device (the same, without a
 * business, with "Create my merchant profile"), the employee's on a device of the team.
 */
export function SettingsScreen() {
  const { t } = useTranslation();
  const { profile } = usePos();
  const settings = useAccountSettings();
  const headerNavigation = useHeaderNavigation();
  // Followed for an owner's device only (an employee's holds no account of its own).
  const unlocked = useUnlocked(isMemberProfile(profile) ? "" : profile.walletId);
  const shell = useShellUnlock();
  // The computer's tab of the open account (OwnerSettings; null: the first), kept here: it is the
  // one till mode unlocked from (LockedSettings.tsx), the last asked while the prompt is open, and
  // it stays as the window crosses the desktop width. Forgotten when the prompt ends without
  // opening the account (dismissed, refused, failed) and as the app locks again: a later unlock,
  // from anywhere, opens on the first tab.
  const [tab, setTab] = useState<OwnerRubric | null>(null);
  if (tab !== null && !unlocked && !(shell?.unlocking ?? false)) setTab(null);
  if (isMemberProfile(profile)) return <MemberSettings profile={profile} />;
  // Till mode: nothing of the account is open.
  if (!unlocked) {
    return (
      <LockedSettings
        profile={profile}
        unlock={(asked) => {
          // With the prompt's start, in the same render: never forgotten before it is asked.
          setTab(asked);
          shell?.unlock("settings");
        }}
      />
    );
  }
  const cardHolder = isCardHolderProfile(profile);
  if (!settings || settings.signUp !== "done") {
    // The account opens as the app is unlocked: a moment, then the settings.
    return (
      <PosFrame
        title={t("settings.title")}
        desktopTitle={t("settings.title")}
        leading={headerNavigation?.cards}
      >
        <View style={styles.waiting}>
          <Spinner />
        </View>
      </PosFrame>
    );
  }
  return <OwnerSettings settings={settings} cardHolder={cardHolder} tab={tab} onTab={setTab} />;
}

const styles = StyleSheet.create({
  waiting: { flex: 1, alignItems: "center", justifyContent: "center" }
});
