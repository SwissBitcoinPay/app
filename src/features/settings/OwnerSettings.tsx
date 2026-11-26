import { useRouter, type Href } from "expo-router";
import { useTranslation } from "react-i18next";
import { StyleSheet, View } from "react-native";

import { useIsDesktop } from "@/components/layout/useIsDesktop";
import { Avatar } from "@/components/ui/Avatar";
import type { IconName } from "@/components/ui/Icon";
import { Tabs } from "@/components/ui/Tabs";
import { useThemePreferenceChoice } from "@/features/appearance/theme-preference";
import { useImageUri } from "@/features/media/images";
import { DockScrollView } from "@/features/navigation/dock-area";
import { useHeaderNavigation } from "@/features/navigation/header-navigation";
import { SupportPanel } from "@/features/support/SupportSettings";
import { PosFrame } from "@/features/terminal/PosFrame";
import type { MerchantSettings } from "@/lib/settings/merchant";
import { space } from "@/theme";

import {
  AccountActions,
  BusinessRubric,
  ChargingRubric,
  DisplayRubric,
  LogoutButton,
  MerchantProfileBlock,
  NetworkRubric,
  PayoutsRubric,
  SecurityRubric,
  rubricSummary,
  type OwnerRubric
} from "./OwnerRubrics";
import {
  DesktopPage,
  GroupLabel,
  MobileFooter,
  SettingsTiles,
  TabPanel,
  useLanguageTag,
  type SettingsTileItem
} from "./parts";

/** A rubric's tab and card: its icon. */
export const RUBRIC_ICONS: Record<OwnerRubric, IconName> = {
  business: "store",
  display: "eye",
  charging: "coins",
  payouts: "landmark",
  network: "circle-nodes",
  security: "shield-halved",
  help: "circle-info",
  account: "user-lock"
};

/** A rubric's tab and card: its name. */
export const RUBRIC_LABELS = {
  business: "settings.business",
  display: "settings.groups.display",
  charging: "settings.groups.charging",
  payouts: "settings.groups.payouts",
  network: "settings.groups.network",
  security: "settings.recovery.group",
  help: "settings.support.group",
  account: "settings.groups.account"
} as const satisfies Record<OwnerRubric, string>;

/** Where a rubric's card leads on a phone: its page. */
const RUBRIC_PAGES: Partial<Record<OwnerRubric, Href>> = {
  business: "/settings/business",
  display: "/settings/display",
  charging: "/settings/charging",
  payouts: "/settings/payouts",
  network: "/settings/network",
  security: "/settings/security",
  help: "/settings/help"
};

/**
 * The rubrics of a merchant's account, and of a card holder's (no business: OwnerRubrics.tsx), its
 * "Security" its recovery phrase and its check only.
 */
export function ownerRubrics(cardHolder: boolean): OwnerRubric[] {
  return cardHolder
    ? ["display", "network", "security", "help", "account"]
    : ["business", "display", "charging", "payouts", "network", "security", "help", "account"];
}

/**
 * "Settings" of the owner. A computer: tabs,
 * each a rubric's settings in a column. A phone: the
 * rubrics as cards, two a row, each opening its page, then "Account" always at the bottom,
 * and "Log out" under it. A computer has "Log out" at the title's right. The rubrics themselves
 * are OwnerRubrics.tsx. `tab`: the computer's tab shown
 * (null: the first), kept by SettingsScreen.
 */
export function OwnerSettings({
  settings,
  cardHolder = false,
  tab,
  onTab
}: {
  settings: MerchantSettings;
  cardHolder?: boolean;
  tab: OwnerRubric | null;
  onTab: (tab: OwnerRubric) => void;
}) {
  const desktop = useIsDesktop();
  return desktop ? (
    <OwnerDesktop settings={settings} cardHolder={cardHolder} chosen={tab} onTab={onTab} />
  ) : (
    <OwnerHub settings={settings} cardHolder={cardHolder} />
  );
}

function OwnerDesktop({
  settings,
  cardHolder,
  chosen,
  onTab
}: {
  settings: MerchantSettings;
  cardHolder: boolean;
  chosen: OwnerRubric | null;
  onTab: (tab: OwnerRubric) => void;
}) {
  const { t } = useTranslation();
  const rubrics = ownerRubrics(cardHolder);
  // A card holder who became a merchant: its first tab, not one it no longer has.
  const tab = chosen !== null && rubrics.includes(chosen) ? chosen : rubrics[0];
  return (
    <DesktopPage
      title={t("settings.title")}
      // Where the till's "Unlock" is, whatever the tab.
      aside={<LogoutButton cardHolder={cardHolder} />}
      tabs={
        <Tabs
          items={rubrics.map((rubric) => ({
            value: rubric,
            label: t(RUBRIC_LABELS[rubric]),
            icon: RUBRIC_ICONS[rubric],
            testID: `settings-tab-${rubric}`
          }))}
          value={tab}
          onChange={onTab}
          label={t("settings.title")}
          testID="settings-tabs"
        />
      }
      testID="settings"
    >
      <TabPanel label={t(RUBRIC_LABELS[tab])} testID={`settings-panel-${tab}`}>
        <RubricContent rubric={tab} settings={settings} cardHolder={cardHolder} />
      </TabPanel>
    </DesktopPage>
  );
}

/** A rubric's settings: a computer's tab, a phone's page (RubricScreen.tsx). */
export function RubricContent({
  rubric,
  settings,
  cardHolder
}: {
  rubric: OwnerRubric;
  settings: MerchantSettings;
  cardHolder: boolean;
}) {
  const desktop = useIsDesktop();
  switch (rubric) {
    case "business":
      return <BusinessRubric settings={settings} />;
    case "display":
      return (
        <>
          {/* A card holder's: on a phone, "Create my merchant profile" tops the cards instead. */}
          {desktop && cardHolder ? <MerchantProfileBlock /> : null}
          <DisplayRubric settings={settings} cardHolder={cardHolder} />
        </>
      );
    case "charging":
      return <ChargingRubric settings={settings} />;
    case "payouts":
      return <PayoutsRubric settings={settings} />;
    case "network":
      return <NetworkRubric settings={settings} cardHolder={cardHolder} />;
    case "security":
      return <SecurityRubric cardHolder={cardHolder} />;
    case "help":
      return <SupportPanel />;
    case "account":
      return <AccountActions cardHolder={cardHolder} />;
  }
}

function OwnerHub({ settings, cardHolder }: { settings: MerchantSettings; cardHolder: boolean }) {
  const { t } = useTranslation();
  const router = useRouter();
  const languageTag = useLanguageTag();
  // A card holder's phone, without a dock: back to "Cards" from the header.
  const headerNavigation = useHeaderNavigation();
  const logo = useImageUri(settings.logo);
  const theme = useThemePreferenceChoice();
  const items: SettingsTileItem[] = ownerRubrics(cardHolder)
    .filter((rubric) => rubric !== "account")
    .map((rubric) => {
      const page = RUBRIC_PAGES[rubric];
      return {
        key: rubric,
        title: t(RUBRIC_LABELS[rubric]),
        summary: rubricSummary(t, rubric, settings, languageTag, { cardHolder, theme }),
        icon: RUBRIC_ICONS[rubric],
        leading:
          rubric === "business" ? (
            <View style={styles.tileLogo}>
              <Avatar name={settings.businessName} image={logo} size={40} />
            </View>
          ) : undefined,
        onPress: () => {
          if (page) router.push(page);
        },
        testID: `settings-card-${rubric}`
      };
    });
  return (
    <PosFrame title={t("settings.title")} leading={headerNavigation?.cards}>
      <DockScrollView
        style={styles.scroll}
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        testID="settings"
      >
        {cardHolder ? <MerchantProfileBlock /> : null}
        <SettingsTiles items={items} />
        <View style={styles.push} />
        <MobileFooter>
          <View style={styles.account}>
            <GroupLabel>{t("settings.groups.account")}</GroupLabel>
            <AccountActions cardHolder={cardHolder} />
          </View>
          {/* Apart from "Account", as on a computer, at the very bottom, over the version line. */}
          <LogoutButton cardHolder={cardHolder} />
        </MobileFooter>
      </DockScrollView>
    </PosFrame>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  body: { flexGrow: 1, gap: 26, paddingTop: space[3], paddingBottom: space[6] },
  push: { flexGrow: 1 },
  account: { gap: space[4] },
  tileLogo: { marginBottom: space[4] }
});
