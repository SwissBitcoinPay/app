import { Redirect } from "expo-router";
import { useTranslation } from "react-i18next";

import { useIsDesktop } from "@/components/layout/useIsDesktop";
import { useUnlocked } from "@/features/navigation/lock";
import { SupportPanel } from "@/features/support/SupportSettings";
import { usePos } from "@/features/terminal/pos";
import { isCardHolderProfile, isMemberProfile } from "@/lib/terminal/model";

import { ownerRubrics, RUBRIC_LABELS, RubricContent } from "./OwnerSettings";
import type { OwnerRubric } from "./OwnerRubrics";
import { SettingsPage } from "./parts";
import { useAccountSettings } from "./useAccountSettings";

/**
 * A rubric of the owner's "Settings" on a phone: its page, over
 * the whole window, opened from its card. A computer shows it as a tab of "Settings"; a link to
 * it there, or to a rubric the account has not (a card holder's "Business"), or with the account
 * closed (till mode), leads back to "Settings".
 */
export function OwnerRubricScreen({
  rubric
}: {
  rubric: Exclude<OwnerRubric, "help" | "account">;
}) {
  const { t } = useTranslation();
  const desktop = useIsDesktop();
  const { profile } = usePos();
  const settings = useAccountSettings();
  const unlocked = useUnlocked(isMemberProfile(profile) ? "" : profile.walletId);
  if (
    desktop ||
    isMemberProfile(profile) ||
    !unlocked ||
    !settings ||
    settings.signUp !== "done" ||
    !ownerRubrics(isCardHolderProfile(profile)).includes(rubric)
  ) {
    return <Redirect href="/settings" />;
  }
  return (
    <SettingsPage title={t(RUBRIC_LABELS[rubric])} testID={`settings-page-${rubric}`}>
      <RubricContent
        rubric={rubric}
        settings={settings}
        cardHolder={isCardHolderProfile(profile)}
      />
    </SettingsPage>
  );
}

/**
 * "Help" on a phone: the owner's, a card holder's, an employee's, and in till mode ("Send crash
 * reports" greyed there: changed only unlocked). The app's journal is the device's.
 */
export function HelpScreen() {
  const { t } = useTranslation();
  const desktop = useIsDesktop();
  const { profile } = usePos();
  const unlocked = useUnlocked(isMemberProfile(profile) ? "" : profile.walletId);
  if (desktop) return <Redirect href="/settings" />;
  return (
    <SettingsPage title={t("settings.support.group")} testID="settings-page-help">
      <SupportPanel reportsEditable={isMemberProfile(profile) || unlocked} />
    </SettingsPage>
  );
}
