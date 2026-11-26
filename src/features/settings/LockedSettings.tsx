import { useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, View } from "react-native";

import { useIsDesktop } from "@/components/layout/useIsDesktop";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Tabs } from "@/components/ui/Tabs";
import { useAppLockSwitch } from "@/features/app-lock/useAppLockSwitch";
import { DockScrollView } from "@/features/navigation/dock-area";
import { useHeaderNavigation } from "@/features/navigation/header-navigation";
import { useShellUnlock } from "@/features/navigation/unlock-context";
import { SupportPanel } from "@/features/support/SupportSettings";
import { PosFrame } from "@/features/terminal/PosFrame";
import { isCardHolderProfile, type AccountProfile } from "@/lib/terminal/model";
import { space } from "@/theme";

import { SettingBlock } from "./fields";
import type { OwnerRubric } from "./OwnerRubrics";
import { ownerRubrics, RUBRIC_ICONS, RUBRIC_LABELS } from "./OwnerSettings";
import {
  BusinessIdentity,
  DesktopPage,
  GroupLabel,
  MobileFooter,
  SettingsCard,
  SettingsRow,
  SettingsTiles,
  TabPanel
} from "./parts";

/**
 * "Settings" in till mode (opened without the passkey, a reduced
 * version, laid out as unlocked: tabs on a computer, cards on
 * a phone): "Unlock" first (a computer: at the title's right), then the rubrics without their
 * values (nothing of the business shows that the till
 * does not: its payouts, its bank account, its relays), changed once the app is unlocked. A phone's
 * cards greyed; a computer's tabs with a padlock, as the side bar's rows: a press asks the passkey,
 * then shows that tab (greyed alone, they would not read as locked). The
 * business and its display currency show as the point of sale shows them.
 * "Help" works as unlocked (the app's journal is the device's), "Send crash
 * reports" greyed: changed only unlocked. Nothing here reads nor writes the account: it is
 * closed. On a card holder's device, as unlocked (OwnerSettings'
 * `cardHolder`): no business, its display currency, relays, help and account.
 */
export function LockedSettings({
  profile,
  unlock
}: {
  profile: AccountProfile;
  /** The passkey's prompt; once it opened the account, `tab` shows (a computer's; null: the first). */
  unlock: (tab: OwnerRubric | null) => void;
}) {
  const desktop = useIsDesktop();
  return desktop ? (
    <LockedDesktop profile={profile} unlock={unlock} />
  ) : (
    <LockedHub profile={profile} unlock={() => unlock(null)} />
  );
}

/** The rubrics that need the account open: shown, a press asks the passkey. */
function needsAccount(rubric: OwnerRubric, cardHolder: boolean): boolean {
  // A merchant's "Display" (its "Theme") opens unlocked, as its other rubrics; a card
  // holder's shows its display currency in till mode too.
  if (rubric === "display") return !cardHolder;
  return rubric !== "business" && rubric !== "help" && rubric !== "account";
}

function LockedDesktop({
  profile,
  unlock
}: {
  profile: AccountProfile;
  unlock: (tab: OwnerRubric) => void;
}) {
  const { t } = useTranslation();
  const shell = useShellUnlock();
  const cardHolder = isCardHolderProfile(profile);
  const rubrics = ownerRubrics(cardHolder);
  const [tab, setTab] = useState<OwnerRubric>(rubrics[0]);
  // As "Unlock": no prompt to ask outside an owner's shell, nor while the SDK loads.
  const unlockable = shell !== null && !shell.preparing;
  return (
    <DesktopPage
      title={t("settings.title")}
      subtitle={t("settings.locked.body")}
      // Unlocked, the tab shown stays.
      aside={<UnlockButton onPress={() => unlock(tab)} />}
      tabs={
        <Tabs
          items={rubrics.map((rubric) => ({
            value: rubric,
            label: t(RUBRIC_LABELS[rubric]),
            icon: RUBRIC_ICONS[rubric],
            locked: needsAccount(rubric, cardHolder),
            disabled: needsAccount(rubric, cardHolder) && !unlockable,
            testID: `settings-tab-${rubric}`
          }))}
          value={tab}
          onChange={(rubric) =>
            needsAccount(rubric, cardHolder) ? unlock(rubric) : setTab(rubric)
          }
          label={t("settings.title")}
          testID="settings-tabs"
        />
      }
      testID="settings-locked"
    >
      <TabPanel label={t(RUBRIC_LABELS[tab])} testID={`settings-panel-${tab}`}>
        {tab === "business" || tab === "display" ? (
          <>
            {cardHolder ? <LockedMerchantBlock /> : null}
            {cardHolder ? null : (
              <SettingBlock description={t("settings.businessDescription")}>
                <BusinessIdentity profile={profile} size={72} />
              </SettingBlock>
            )}
            <SettingBlock
              title={t("settings.displayCurrency")}
              description={t(
                cardHolder
                  ? "settings.displayCurrencyCardDescription"
                  : "settings.displayCurrencyDescription"
              )}
            >
              <Select
                value={profile.currency}
                disabled
                style={styles.select}
                testID="display-currency"
              />
            </SettingBlock>
            <AppLockBlock profile={profile} />
          </>
        ) : null}
        {tab === "help" ? <SupportPanel reportsEditable={false} /> : null}
        {tab === "account" ? <GreyedAccount /> : null}
      </TabPanel>
    </DesktopPage>
  );
}

function LockedHub({ profile, unlock }: { profile: AccountProfile; unlock: () => void }) {
  const { t } = useTranslation();
  const router = useRouter();
  const cardHolder = isCardHolderProfile(profile);
  // A card holder's phone, without a dock: back to "Cards" from the header.
  const headerNavigation = useHeaderNavigation();
  // What the till shows anyway: the display currency.
  const summaryOf = (rubric: OwnerRubric): string | undefined => {
    if (rubric === "business" || (rubric === "display" && cardHolder)) return profile.currency;
    if (rubric === "help") return t("settings.support.contact");
    return undefined;
  };
  return (
    <PosFrame title={t("settings.title")} leading={headerNavigation?.cards}>
      <DockScrollView
        style={styles.scroll}
        contentContainerStyle={styles.mobileBody}
        showsVerticalScrollIndicator={false}
        testID="settings-locked"
      >
        {cardHolder ? null : <BusinessIdentity profile={profile} size={56} />}
        <SettingsCard>
          <View style={styles.lockedCard}>
            <UnlockBlock profile={profile} unlock={unlock} />
          </View>
        </SettingsCard>
        {cardHolder ? <LockedMerchantBlock /> : null}
        <SettingsTiles
          items={ownerRubrics(cardHolder)
            .filter((rubric) => rubric !== "account")
            .map((rubric) => ({
              key: rubric,
              title: t(RUBRIC_LABELS[rubric]),
              summary: summaryOf(rubric),
              icon: RUBRIC_ICONS[rubric],
              disabled: rubric !== "help",
              onPress: () => {
                if (rubric === "help") router.push("/settings/help");
              },
              testID: `settings-card-${rubric}`
            }))}
        />
        <AppLockBlock profile={profile} />
        <View style={styles.push} />
        <MobileFooter>
          <View style={styles.account}>
            <GroupLabel>{t("settings.groups.account")}</GroupLabel>
            <GreyedAccount />
          </View>
          <GreyedLogout />
        </MobileFooter>
      </DockScrollView>
    </PosFrame>
  );
}

/** A phone's "Till mode": why the settings are greyed, and "Unlock". */
function UnlockBlock({ profile, unlock }: { profile: AccountProfile; unlock: () => void }) {
  const { t } = useTranslation();
  const cardHolder = isCardHolderProfile(profile);
  return (
    <SettingBlock
      title={t(cardHolder ? "settings.locked.titleCard" : "settings.locked.title")}
      description={t("settings.locked.body")}
    >
      <View style={styles.row}>
        <UnlockButton onPress={unlock} />
      </View>
    </SettingBlock>
  );
}

/** "Unlock", which asks the passkey (the shell's prompt: unlock-context.ts). */
function UnlockButton({ onPress }: { onPress: () => void }) {
  const { t } = useTranslation();
  const desktop = useIsDesktop();
  const shell = useShellUnlock();
  return (
    <Button
      icon="lock-open"
      size="md"
      fullWidth={!desktop}
      loading={shell?.unlocking ?? false}
      disabled={shell === null || shell.preparing}
      onPress={onPress}
      testID="settings-unlock"
    >
      {t("settings.locked.unlock")}
    </Button>
  );
}

/**
 * "Ask for biometrics to unlock the app" (the apps only): this device's choice shown,
 * greyed, changed only unlocked (app-lock/preference.ts).
 */
function AppLockBlock({ profile }: { profile: AccountProfile }) {
  const { t } = useTranslation();
  const appLock = useAppLockSwitch(profile, false);
  if (!appLock.visible) return null;
  return (
    <SettingBlock
      title={t("settings.unlock.section")}
      description={t("settings.unlock.description")}
    >
      <SettingsCard>
        <SettingsRow
          icon="fingerprint"
          label={t("settings.unlock.title")}
          caption={appLock.caption}
          trailing={appLock.control}
          disabled
          wrap
          testID="unlock-asks-row"
        />
      </SettingsCard>
    </SettingBlock>
  );
}

/** "Create my merchant profile", a card holder's: shown, greyed, the passkey opens it. */
function LockedMerchantBlock() {
  const { t } = useTranslation();
  const desktop = useIsDesktop();
  return (
    <SettingBlock
      title={t("settings.merchant.section")}
      description={t("settings.merchant.description")}
    >
      <View style={styles.row}>
        <Button
          icon="store"
          size="md"
          fullWidth={!desktop}
          disabled
          onPress={() => undefined}
          testID="merchant-create"
        >
          {t("settings.merchant.create")}
        </Button>
      </View>
    </SettingBlock>
  );
}

/** "Delete account" as unlocked (AccountActions, DeleteAccount.tsx), greyed. */
function GreyedAccount() {
  const { t } = useTranslation();
  const desktop = useIsDesktop();
  return (
    <View style={desktop ? styles.row : undefined}>
      <Button
        variant="destructive"
        size="md"
        icon="trash-can"
        fullWidth={!desktop}
        disabled
        onPress={() => undefined}
        style={desktop ? styles.desktopDelete : undefined}
        testID="delete-account"
      >
        {t("settings.delete.button")}
      </Button>
    </View>
  );
}

/**
 * A phone's "Log out" as unlocked, greyed: at the very bottom, under "Account". A computer's
 * title has "Unlock" at its right instead, where "Log out" is unlocked.
 */
function GreyedLogout() {
  const { t } = useTranslation();
  return (
    <Button
      variant="destructiveSolid"
      size="md"
      icon="arrow-right-from-bracket"
      fullWidth
      disabled
      onPress={() => undefined}
      testID="logout"
    >
      {t("settings.logout")}
    </Button>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  mobileBody: { flexGrow: 1, gap: 26, paddingTop: space[3], paddingBottom: space[6] },
  push: { flexGrow: 1 },
  account: { gap: space[4] },
  // On the groups' card: the screen keeps their two backgrounds.
  lockedCard: { padding: 16 },
  row: { flexDirection: "row" },
  select: { maxWidth: 420 },
  desktopDelete: { minWidth: 260 }
});
