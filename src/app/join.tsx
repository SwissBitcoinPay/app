import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Platform, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Logo } from "@/components/layout/Logo";
import { useIsDesktop } from "@/components/layout/useIsDesktop";
import { BusinessMark } from "@/components/ui/BusinessMark";
import { Button } from "@/components/ui/Button";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { Lead, ScreenTitle } from "@/components/ui/Heading";
import { Icon } from "@/components/ui/Icon";
import { Spinner } from "@/components/ui/Spinner";
import { TextField } from "@/components/ui/TextField";
import { WaitingIndicator } from "@/components/ui/WaitingIndicator";
import { useUrlFragment } from "@/features/linking/useUrlFragment";
import { useImageUri } from "@/features/media/images";
import { InviteScanner, canScanInApp } from "@/features/team/InviteScanner";
import type { InvitePreview } from "@/features/team/member";
import { useJoin } from "@/features/team/useJoin";
import { currentRelays } from "@/lib/relays/current";
import { unionRelays } from "@/lib/relays/list";
import { gutter, makeStyles, proseLineHeight, sans, tracked, type, useTheme } from "@/theme";

const SCANNER_SIZE = 260;
const BUSINESS_DISC_SIZE = 88;

/**
 * Joining a team: `/join#<id>.<key>`, the link of the QR code the owner
 * shows (src/lib/team/invite.ts), opened by the phone's camera, in the app (universal links) or in
 * the browser; or scanned and pasted here. Composed of the app's pieces. The
 * invitation is read and shown first, used only once the employee confirms.
 */
export default function JoinScreen() {
  const fragment = useUrlFragment();
  // Another link opened meanwhile starts afresh.
  return <Join key={fragment} fragment={fragment} />;
}

function Join({ fragment }: { fragment: string }) {
  const styles = useStyles();
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const desktop = useIsDesktop();
  const { state, submit, confirm, restart } = useJoin(fragment);

  useEffect(() => {
    // The point of sale replaces the whole history, as at the end of a sign-up (useFinishSignUp):
    // "back" must lead neither to this page nor to the welcome screen below it, whose "Log in"
    // would prepare the device as an account's own point of sale.
    if (state.phase !== "joined") return;
    router.dismissTo("/");
    router.replace("/pos");
  }, [state.phase, router]);

  const leave = () => (router.canGoBack() ? router.back() : router.replace("/"));

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.body,
        {
          paddingTop: insets.top + (desktop ? 40 : 20),
          paddingBottom: Math.max(insets.bottom, desktop ? 40 : 24)
        }
      ]}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.column}>
        <View style={styles.logo}>
          <Logo width={desktop ? 168 : 150} />
        </View>
        {(() => {
          switch (state.phase) {
            case "scan":
              return <Scan invalid={state.invalid} onSubmit={submit} onLeave={leave} />;
            case "checking":
            case "joined":
              return <Waiting label={t("team.join.checking")} />;
            case "joining":
              return <Waiting label={t("team.join.joining")} />;
            case "preview":
              return <Preview preview={state.preview} onConfirm={confirm} onCancel={restart} />;
            case "failed":
              return (
                <View style={styles.section}>
                  <ScreenTitle>{t("team.join.title")}</ScreenTitle>
                  <ErrorMessage testID="join-failure">
                    {t(`team.join.errors.${state.failure}`)}
                  </ErrorMessage>
                  <Button icon="qrcode" onPress={restart} testID="join-restart">
                    {t("team.join.scanAnother")}
                  </Button>
                  <Button variant="text" size="md" onPress={leave}>
                    {t("common.back")}
                  </Button>
                </View>
              );
          }
        })()}
      </View>
    </ScrollView>
  );
}

function Waiting({ label }: { label: string }) {
  const styles = useStyles();
  return (
    <View style={styles.waiting}>
      <Spinner testID="join-spinner" />
      <WaitingIndicator label={label} />
    </View>
  );
}

/** The scanner (where the platform has one), and a field for a link pasted. */
function Scan({
  invalid,
  onSubmit,
  onLeave
}: {
  invalid: boolean;
  onSubmit: (text: string) => void;
  onLeave: () => void;
}) {
  const { t } = useTranslation();
  const styles = useStyles();
  const [link, setLink] = useState("");
  const scanning = canScanInApp();
  return (
    <View style={styles.section}>
      <ScreenTitle>{t("team.join.title")}</ScreenTitle>
      <Lead>{t(scanning ? "team.join.scanLead" : "team.join.cameraAppLead")}</Lead>
      {scanning ? <InviteScanner onScan={onSubmit} size={SCANNER_SIZE} /> : null}
      <TextField
        label={t("team.join.pasteLabel")}
        value={link}
        onChangeText={setLink}
        placeholder="https://…/join#…"
        icon="link"
        // The link holds the member's secret: Android's keyboards would learn it, but in a
        // password's field.
        keyboardType={Platform.OS === "android" ? "visible-password" : "default"}
        error={invalid ? t("team.join.errors.invalid") : null}
        testID="join-link"
      />
      <Button
        variant="secondary"
        size="md"
        onPress={() => onSubmit(link)}
        disabled={link.trim() === ""}
        testID="join-submit"
      >
        {t("common.continue")}
      </Button>
      <Button variant="text" size="md" onPress={onLeave}>
        {t("common.back")}
      </Button>
    </View>
  );
}

/** The team the invitation leads to, before the device joins it. */
function Preview({
  preview,
  onConfirm,
  onCancel
}: {
  preview: InvitePreview;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useStyles();
  const { channel, link } = preview;
  const business = channel.profile.businessName;
  // The business's logo ("Settings"), read on the business's relays, those joinTeam publishes to:
  // the channel's and the link's (the logo is copied to a new list in the background after a
  // change of relays). This device's own list may not hold it. The shop's icon while it is read,
  // and without one.
  const logo = useImageUri(
    channel.profile.logo,
    unionRelays(channel.relays, link.relays ?? currentRelays())
  );
  return (
    <View style={styles.section}>
      <BusinessMark
        name={business}
        image={logo}
        size={BUSINESS_DISC_SIZE}
        style={styles.mark}
        testID="join"
      />
      <Text accessibilityRole="header" style={styles.business} testID="join-business">
        {business}
      </Text>
      <Text style={styles.as}>{t("team.join.as", { business, name: channel.name })}</Text>
      <View style={styles.notice}>
        <Icon
          name="circle-info"
          size={15}
          color={colors.text.secondary}
          style={styles.noticeIcon}
        />
        <Text style={styles.noticeText}>{t("team.join.rights", { business })}</Text>
      </View>
      <Button icon="user-plus" onPress={onConfirm} testID="join-confirm">
        {t("team.join.confirm")}
      </Button>
      <Button variant="text" size="md" onPress={onCancel} testID="join-cancel">
        {t("common.cancel")}
      </Button>
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  screen: { flex: 1, backgroundColor: colors.background.app },
  body: { flexGrow: 1, alignItems: "center", paddingHorizontal: gutter },
  column: { width: 440, maxWidth: "100%", flexGrow: 1 },
  logo: { alignItems: "center", marginBottom: 28 },
  section: { gap: 18 },
  waiting: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 20,
    paddingBottom: 80
  },
  mark: { alignSelf: "center" },
  business: {
    ...sans(700),
    fontSize: type.title,
    letterSpacing: tracked.title,
    color: colors.text.primary,
    textAlign: "center"
  },
  as: {
    ...sans(500),
    fontSize: type.body,
    lineHeight: type.body * 1.5,
    color: colors.text.secondary,
    textAlign: "center"
  },
  notice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    borderRadius: 16,
    paddingVertical: 15,
    paddingHorizontal: 17,
    backgroundColor: colors.background.subtle
  },
  noticeIcon: { marginTop: (proseLineHeight - 15 * 1.15) / 2 },
  noticeText: {
    ...sans(500),
    flex: 1,
    fontSize: type.prose,
    lineHeight: proseLineHeight,
    color: colors.text.secondary
  }
}));
