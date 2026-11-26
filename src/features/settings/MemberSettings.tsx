import { Redirect, useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";

import { useIsDesktop } from "@/components/layout/useIsDesktop";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Tabs } from "@/components/ui/Tabs";
import { useThemePreferenceChoice } from "@/features/appearance/theme-preference";
import { rememberImage, useImageUri } from "@/features/media/images";
import { pickSquareImage } from "@/features/media/pick-image";
import { DockScrollView } from "@/features/navigation/dock-area";
import { useNotifications } from "@/features/notifications/NotificationsProvider";
import { ReadOnlyRelays, useTestOnce } from "@/features/relays/RelaysEditor";
import { InstallSetting } from "@/features/install/InstallSetting";
import { useDeviceRelays } from "@/features/relays/device-relays";
import { SupportPanel } from "@/features/support/SupportSettings";
import { LeaveError, setOwnAvatar } from "@/features/team/member";
import { useBranding } from "@/features/terminal/branding";
import { PosFrame } from "@/features/terminal/PosFrame";
import { usePos } from "@/features/terminal/pos";
import { logFailure } from "@/lib/log/log";
import { isMemberProfile, type MemberTerminalProfile } from "@/lib/terminal/model";
import { cardInset, makeStyles, radius, sans, space, type, useTheme } from "@/theme";

import { SettingBlock } from "./fields";
import { ThemeSetting, themeSummary } from "./ThemeSetting";
import {
  AvatarBusy,
  BusinessIdentity,
  DesktopPage,
  GroupLabel,
  MobileFooter,
  SettingsPage,
  SettingsTiles,
  TabPanel,
  TextAction,
  useSettingsFailure,
  useSettingsSaved
} from "./parts";
import { leaveBusiness } from "./sign-out";

/*
 * "Settings" of an employee (laid out as the owner's: tabs on a computer, cards on a phone): the
 * business's logo and name, read only; the employee's photo, which it changes or removes, under
 * its name, which the owner set; the business's relays with their lights, read only; "Help";
 * "Leave the business" (in place of "Log out"), confirmed. A photo
 * is saved once a relay took the profile naming it: its loader
 * until then, then a notification says it is saved, or why not (the photo before back).
 */

export type MemberRubric = "profile" | "display" | "network" | "help" | "account";

const MEMBER_RUBRICS: readonly MemberRubric[] = [
  "profile",
  "display",
  "network",
  "help",
  "account"
];

const MEMBER_ICONS: Record<MemberRubric, IconName> = {
  profile: "users",
  display: "eye",
  network: "circle-nodes",
  help: "circle-info",
  account: "user-lock"
};

const MEMBER_LABELS = {
  profile: "settings.yourProfile",
  display: "settings.groups.display",
  network: "settings.groups.network",
  help: "settings.support.group",
  account: "settings.groups.account"
} as const satisfies Record<MemberRubric, string>;

export function MemberSettings({ profile }: { profile: MemberTerminalProfile }) {
  const desktop = useIsDesktop();
  return desktop ? <MemberDesktop profile={profile} /> : <MemberHub profile={profile} />;
}

function MemberDesktop({ profile }: { profile: MemberTerminalProfile }) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<MemberRubric>("profile");
  return (
    <DesktopPage
      title={t("settings.title")}
      tabs={
        <Tabs
          items={MEMBER_RUBRICS.map((rubric) => ({
            value: rubric,
            label: t(MEMBER_LABELS[rubric]),
            icon: MEMBER_ICONS[rubric],
            testID: `settings-tab-${rubric}`
          }))}
          value={tab}
          onChange={setTab}
          label={t("settings.title")}
          testID="settings-tabs"
        />
      }
      testID="settings"
    >
      <TabPanel label={t(MEMBER_LABELS[tab])} testID={`settings-panel-${tab}`}>
        {tab === "profile" ? <MemberProfileRubric profile={profile} /> : null}
        {tab === "display" ? (
          <>
            <ThemeSetting />
            <InstallSetting />
          </>
        ) : null}
        {tab === "network" ? <MemberNetworkRubric /> : null}
        {tab === "help" ? <SupportPanel /> : null}
        {tab === "account" ? <LeaveAction profile={profile} /> : null}
      </TabPanel>
    </DesktopPage>
  );
}

function MemberHub({ profile }: { profile: MemberTerminalProfile }) {
  const styles = useStyles();
  const { t } = useTranslation();
  const router = useRouter();
  const branding = useBranding(profile);
  const photo = useImageUri(branding?.avatar ?? null);
  const relays = useDeviceRelays();
  const theme = useThemePreferenceChoice();
  return (
    <PosFrame title={t("settings.title")}>
      <DockScrollView
        style={styles.scroll}
        contentContainerStyle={styles.mobileBody}
        showsVerticalScrollIndicator={false}
        testID="settings"
      >
        <BusinessIdentity profile={profile} size={56} />
        <SettingsTiles
          items={[
            {
              key: "profile",
              title: t("settings.yourProfile"),
              summary: profile.memberName,
              icon: MEMBER_ICONS.profile,
              leading: (
                <View style={styles.tileAvatar}>
                  <Avatar name={profile.memberName} image={photo} size={40} />
                </View>
              ),
              onPress: () => router.push("/settings/profile"),
              testID: "settings-card-profile"
            },
            {
              key: "display",
              title: t("settings.groups.display"),
              summary: themeSummary(t, theme),
              icon: MEMBER_ICONS.display,
              onPress: () => router.push("/settings/display"),
              testID: "settings-card-display"
            },
            {
              key: "network",
              title: t("settings.groups.network"),
              summary: t("settings.relaysCount", { count: relays.length }),
              icon: MEMBER_ICONS.network,
              onPress: () => router.push("/settings/network"),
              testID: "settings-card-network"
            },
            {
              key: "help",
              title: t("settings.support.group"),
              summary: t("settings.support.contact"),
              icon: MEMBER_ICONS.help,
              onPress: () => router.push("/settings/help"),
              testID: "settings-card-help"
            }
          ]}
        />
        <View style={styles.push} />
        <MobileFooter>
          <View style={styles.account}>
            <GroupLabel>{t("settings.groups.account")}</GroupLabel>
            <LeaveAction profile={profile} />
          </View>
        </MobileFooter>
      </DockScrollView>
    </PosFrame>
  );
}

/** An employee's rubric on a phone: its page, opened from its card. */
export function MemberRubricScreen({ rubric }: { rubric: "profile" | "display" | "network" }) {
  const { t } = useTranslation();
  const desktop = useIsDesktop();
  const { profile } = usePos();
  if (desktop || !isMemberProfile(profile)) return <Redirect href="/settings" />;
  return (
    <SettingsPage title={t(MEMBER_LABELS[rubric])} testID={`settings-page-${rubric}`}>
      {rubric === "profile" ? <MemberProfileRubric profile={profile} /> : null}
      {rubric === "display" ? (
        <>
          <ThemeSetting />
          <InstallSetting />
        </>
      ) : null}
      {rubric === "network" ? <MemberNetworkRubric /> : null}
    </SettingsPage>
  );
}

/** "Your profile": the business, then the employee's photo, under its name set by the owner. */
function MemberProfileRubric({ profile }: { profile: MemberTerminalProfile }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const desktop = useIsDesktop();
  const fail = useSettingsFailure();
  const saved = useSettingsSaved();
  const branding = useBranding(profile);
  // Read again once a photo is saved (branding.ts tells the screens).
  const photo = useImageUri(branding?.avatar ?? null);
  const hasPhoto = (branding?.avatar ?? null) !== null;
  // A photo being sent: the loader, and no other change meanwhile. Only then:
  // a sync of the channel writing the branding meanwhile makes the photo wait (withOwnBranding).
  const [busy, setBusy] = useState(false);

  const pick = async () => {
    if (busy) return;
    try {
      const bytes = await pickSquareImage();
      if (!bytes) return;
      setBusy(true);
      const avatar = await setOwnAvatar(bytes);
      if (avatar) rememberImage(avatar, bytes);
      saved("settings-photo", t("settings.photoSavedTitle"));
    } catch (error) {
      fail(error, "settings-photo");
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await setOwnAvatar(null);
      saved("settings-photo", t("settings.photoRemovedTitle"));
    } catch (error) {
      fail(error, "settings-photo");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {/* On a phone, "Settings" shows the business above the cards already. */}
      {desktop ? <BusinessIdentity profile={profile} size={64} /> : null}
      <View style={[styles.card, desktop && styles.cardDesktop]}>
        <View style={styles.profileRow}>
          <View>
            <Avatar
              name={profile.memberName}
              image={photo}
              size={52}
              badge
              onPress={() => void pick()}
              disabled={busy}
              accessibilityLabel={hasPhoto ? t("settings.changePhoto") : t("settings.addPhoto")}
              testID="member-photo"
            />
            {busy ? <AvatarBusy size={52} /> : null}
          </View>
          <View style={styles.profileTexts}>
            <Text numberOfLines={1} style={styles.memberName} testID="member-name">
              {profile.memberName}
            </Text>
            <View style={styles.lockedName}>
              <Icon name="lock" size={10} color={colors.text.secondary} />
              <Text style={styles.lockedText}>{t("settings.nameLocked")}</Text>
            </View>
          </View>
        </View>
        <View style={styles.photoActions}>
          <TextAction
            label={hasPhoto ? t("settings.changePhoto") : t("settings.addPhoto")}
            icon={hasPhoto ? "camera" : "plus"}
            onPress={() => void pick()}
            disabled={busy}
            testID="pick-photo"
          />
          {hasPhoto ? (
            <TextAction
              label={t("settings.removePhoto")}
              onPress={() => void remove()}
              disabled={busy}
              testID="remove-photo"
            />
          ) : null}
        </View>
      </View>
    </>
  );
}

/** "Network": the business's relays with their lights, read only (the owner sets them). */
function MemberNetworkRubric() {
  const { colors } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const relays = useDeviceRelays();
  useTestOnce(relays);
  return (
    <SettingBlock title={t("settings.relays")} description={t("settings.relaysDescription")}>
      <ReadOnlyRelays relays={relays} style={styles.relays} testID="member-relays" />
      <View style={styles.locked}>
        <Icon name="lock" size={10} color={colors.text.secondary} />
        <Text style={styles.lockedText}>{t("settings.relaysLocked")}</Text>
      </View>
    </SettingBlock>
  );
}

/** "Leave the business", confirmed: its departure published, then the welcome screen. */
function LeaveAction({ profile }: { profile: MemberTerminalProfile }) {
  const styles = useStyles();
  const { t } = useTranslation();
  const desktop = useIsDesktop();
  const { notify } = useNotifications();
  const [confirming, setConfirming] = useState(false);
  // The departure being published (publishDeparture): the button waits, then the welcome screen.
  const [leaving, setLeaving] = useState(false);
  const leave = () => {
    setConfirming(false);
    if (leaving) return;
    setLeaving(true);
    leaveBusiness().catch((error: unknown) => {
      logFailure("Leaving the business failed", error);
      setLeaving(false);
      notify({
        tone: "error",
        title: t("settings.failedTitle"),
        body: t(
          error instanceof LeaveError
            ? "settings.errors.leaveUnreachable"
            : "settings.errors.leaveFailed"
        ),
        key: "settings"
      });
    });
  };
  const button = (
    <Button
      variant="destructiveSolid"
      size="md"
      icon="arrow-right-from-bracket"
      fullWidth={!desktop}
      onPress={() => setConfirming(true)}
      loading={leaving}
      style={desktop ? styles.leaveDesktop : undefined}
      testID="leave-business"
    >
      {t("settings.leave")}
    </Button>
  );
  return (
    <>
      {desktop ? (
        <SettingBlock title={t("settings.leave")} description={t("settings.leaveBody")}>
          <View style={styles.leaveRow}>{button}</View>
        </SettingBlock>
      ) : (
        button
      )}
      <ConfirmDialog
        visible={confirming}
        title={t("settings.leaveTitle", { business: profile.businessName })}
        body={t("settings.leaveBody")}
        confirmLabel={t("settings.leave")}
        cancelLabel={t("settings.back")}
        onConfirm={leave}
        onCancel={() => setConfirming(false)}
        testID="leave-dialog"
        confirmTestID="leave-confirm"
      />
    </>
  );
}

const useStyles = makeStyles(({ colors, shadow }) => ({
  scroll: { flex: 1 },
  mobileBody: { flexGrow: 1, gap: 26, paddingTop: space[3], paddingBottom: space[6] },
  push: { flexGrow: 1 },
  account: { gap: space[4] },
  tileAvatar: { marginBottom: space[4] },
  card: {
    backgroundColor: colors.background.surface,
    borderRadius: radius.lg,
    boxShadow: shadow.card,
    paddingHorizontal: cardInset
  },
  cardDesktop: { paddingHorizontal: 22 },
  profileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    height: 84,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle
  },
  profileTexts: { flex: 1, minWidth: 0, gap: 5 },
  memberName: {
    ...sans(700),
    fontSize: 16,
    color: colors.text.primary
  },
  locked: { flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 4 },
  lockedName: { flexDirection: "row", alignItems: "center", gap: 7 },
  lockedText: {
    ...sans(500),
    flexShrink: 1,
    fontSize: type.caption,
    color: colors.text.secondary
  },
  photoActions: { flexDirection: "row", alignItems: "center", gap: 22, height: 56 },
  relays: { paddingVertical: 10, paddingHorizontal: 18 },
  leaveRow: { flexDirection: "row" },
  leaveDesktop: { minWidth: 200 }
}));
