import {
  Redirect,
  useFocusEffect,
  useNavigation,
  useRouter,
  type NativeStackNavigationProp
} from "expo-router";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Image, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import Animated, {
  cancelAnimation,
  clamp,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { LegalLinks } from "@/components/LegalLinks";
import { Logo } from "@/components/layout/Logo";
import { useIsDesktop } from "@/components/layout/useIsDesktop";
import { BusinessMark } from "@/components/ui/BusinessMark";
import { Button } from "@/components/ui/Button";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { openExternal } from "@/components/ui/external-link";
import { Icon, type IconName } from "@/components/ui/Icon";
import { IconButton } from "@/components/ui/IconButton";
import { ListRow } from "@/components/ui/ListRow";
import { RichText } from "@/components/ui/RichText";
import { Spinner } from "@/components/ui/Spinner";
import { WaitingIndicator } from "@/components/ui/WaitingIndicator";
import { VersionLabel } from "@/components/VersionLabel";
import { LEGAL_URLS } from "@/config/legal";
import {
  accountFailureMessage,
  usePasskeyAccount,
  type AccountBusiness,
  type AccountProgress
} from "@/features/account/usePasskeyAccount";
import { BoltCardAppSheet } from "@/features/card/BoltCardAppSheet";
import { useBoltCardImage } from "@/features/card/boltcard-image";
import { readsCards } from "@/features/card/useReadsCards";
import { useInstallBanner } from "@/features/install/InstallBanner";
import { useImageUri } from "@/features/media/images";
import { forgetLegacy, useLegacyState } from "@/features/migration/legacy-state";
import { MigrateAccountEntry } from "@/features/migration/MigrateAccountEntry";
import { rescueOffered } from "@/features/rescue/offer";
import { WebUpdateNotice } from "@/features/navigation/WebUpdateNotice";
import {
  NotificationsProvider,
  useNotifications
} from "@/features/notifications/NotificationsProvider";
import { accountHome, accountRoutes } from "@/features/onboarding/steps";
import { getDeletedAccountNotice } from "@/features/settings/deleted-elsewhere";
import { onAccountDeleted } from "@/features/settings/deleted-here";
import { getRemovalNotice } from "@/features/team/member";
import { useTerminalProfile } from "@/features/terminal/profile-cache";
import {
  desktopHeadlineSize,
  headlineLineHeight,
  mobileHeadlineSize
} from "@/features/welcome/headline";
import { isHandheld } from "@/lib/handheld";
import type { SettingsPatch } from "@/lib/settings/merchant";
import { isCardHolderProfile } from "@/lib/terminal/model";
import {
  cardInset,
  control,
  gutter,
  makeStyles,
  motion,
  palette,
  radius,
  sans,
  TITLE_EM,
  tracked,
  tracking,
  type,
  useTheme
} from "@/theme";

/** The guarantees under the welcome screen's line, in a row. */
const GUARANTEES: { icon: IconName; key: GuaranteeKey }[] = [
  { icon: "lock", key: "nonCustodial" },
  { icon: "shield-halved", key: "noKyc" },
  { icon: "clock", key: "oneMinute" }
];
type GuaranteeKey = "nonCustodial" | "noKyc" | "oneMinute";

/**
 * The welcome screen's two ways to create an account, each with its usage (no usage step:
 * src/features/onboarding/steps.ts). "Create my account": a merchant's, on to the split. "A
 * BoltCard": a card holder's, on to the card's pairing, only on a device that programs cards:
 * elsewhere the app's stores (BoltCardAppSheet.tsx). "Back" from either leads here.
 */
const MERCHANT_SIGN_UP: SettingsPatch = { usage: "merchant", signUp: "split" };
const BOLTCARD_SIGN_UP: SettingsPatch = { usage: "card", signUp: "card" };

/**
 * Launch: the point of sale when this device was prepared for an account (its profile, saved once
 * the sign-up is done), no passkey needed; "Cards" on a card holder's device, which asks it. Else
 * the welcome screen.
 */
export default function LaunchScreen() {
  const styles = useStyles();
  const profile = useTerminalProfile({ follow: false });
  // What the v2 app (Swiss Bitcoin Pay) left on this device, on a device without a point of sale:
  // its owner, or its till, is led to the migration instead (src/app/migration/).
  const legacy = useLegacyState(profile === null);
  // A device that moved on (its account created, its till joined a team): the v2 app's session
  // and role go (forgetLegacy), the migration shows no more.
  useEffect(() => {
    if (profile) void forgetLegacy();
  }, [profile]);
  // Read from the device's storage: an instant, the splash screen's background stays meanwhile.
  if (profile === undefined) return <View style={styles.screen} />;
  if (profile) return <Redirect href={isCardHolderProfile(profile) ? "/cards" : "/pos"} />;
  if (legacy === undefined) return <View style={styles.screen} />;
  if (legacy) {
    return <Redirect href={legacy.role === "owner" ? "/migration" : "/migration/employee"} />;
  }
  return (
    // The notifications of the welcome screen and its login loading screen.
    <NotificationsProvider>
      <WelcomeScreen />
      <WebUpdateNotice />
    </NotificationsProvider>
  );
}

/**
 * The welcome screen ("I already have" centred; on a desktop, ink and cream halves). One filled
 * button for whoever starts: "Create my account". Then "I already have", what one may already
 * have, each a row of one card: a sattle.me account ("Log in"), an invitation ("Join by
 * invitation"), a BoltCard ("Manage my BoltCard": an account made for the card, BOLTCARD_SIGN_UP,
 * on a device that programs cards; elsewhere the app on the phone, BoltCardAppSheet.tsx); then the
 * v2 owner's ink "Migrate my Swiss Bitcoin Pay account", under the card.
 *
 * Creating an account and logging in both go through a passkey. Creation continues with the
 * account usage (or the card's pairing); login resumes an unfinished sign-up where it stopped, or
 * opens the account's home (accountHome: the point of sale, "Cards" for a card holder), or
 * "No account found" when the passkey's account is on none of the device's relays.
 */
function WelcomeScreen() {
  const { t } = useTranslation();
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const desktop = useIsDesktop();
  const insets = useSafeAreaInsets();
  const dimensions = useWindowDimensions();
  const boltCard = useBoltCardImage();
  // "Install the app" across the top (the web only, src/features/install/): it takes the status
  // bar's inset, the screen then starts under it.
  const installBanner = useInstallBanner({ desktop, topInset: insets.top });
  const topInset = installBanner ? 0 : insets.top;
  // A phone of little height (360 × 640 and the like): what is asked fits its first screen, the
  // terms under it as on a taller phone.
  const space = !desktop && dimensions.height < COMPACT_HEIGHT ? COMPACT : REGULAR;

  // A login done: its loading screen stays while the next screen opens over this one, so that the
  // welcome does not show again under the transition. Once this screen is covered (native stack:
  // `transitionEnd` closing, at react-native-screens' onDisappear), the welcome is back under the
  // sign-up steps: a back swipe uncovers it, never a loading that no longer runs. On the web (no
  // transition events), when this screen is focused again.
  const [opening, setOpening] = useState<AccountProgress | null>(null);
  const navigation = useNavigation<NativeStackNavigationProp<Record<string, undefined>>>();
  useEffect(
    () =>
      navigation.addListener("transitionEnd", (event) => {
        if (event.data.closing) setOpening(null);
      }),
    [navigation]
  );
  useFocusEffect(useCallback(() => setOpening(null), []));

  const account = usePasskeyAccount(
    (settings, reached) => {
      // The account's home replaces the welcome screen: "back" must not lead to it.
      if (settings.signUp === "done") router.replace(accountHome(settings));
      else for (const route of accountRoutes(settings)) router.push(route);
      // Once the navigation is under way: if it throws, the welcome shows again with its failure.
      if (reached.action === "logIn") setOpening(reached);
    },
    // Over the welcome screen, which "Back" and the relays' saving come back to.
    () => router.push("/no-account")
  );
  const busy = account.progress !== null;
  // "Manage my BoltCard" where no card can be programmed (the web app, an iPad): the app on the
  // phone, where the account is created, never an account here (BoltCardAppSheet.tsx).
  const [boltCardApp, setBoltCardApp] = useState(false);
  const manageBoltCard = () => {
    // Known at once after the first ask (the web app: at once); never rejects.
    void readsCards().then((reads) => {
      if (reads) account.create(BOLTCARD_SIGN_UP);
      else setBoltCardApp(true);
    });
  };
  const loggingIn = account.progress?.action === "logIn" ? account.progress : opening;

  // An employee's device the owner just removed from the team (src/features/team/member.ts).
  const [removedFrom] = useState(getRemovalNotice);
  // An owner's device whose account was deleted on another one (deleted-elsewhere.ts).
  const [deletedAccount] = useState(getDeletedAccountNotice);
  // The account just deleted on this device ("Delete account", deleted-here.ts).
  const { notify } = useNotifications();
  useEffect(
    () =>
      onAccountDeleted(() =>
        notify({ tone: "success", title: t("settings.delete.deleted"), key: "account-deleted" })
      ),
    [notify, t]
  );

  if (loggingIn) {
    return <LoginLoading progress={loggingIn} desktop={desktop} />;
  }

  // Over the ink of a desktop, the line and the guarantees in its light text.
  const pitch = (onInk: boolean) => (
    <>
      <RichText
        accessibilityRole="header"
        style={[
          styles.headline,
          headlineStyle(
            onInk ? desktopHeadlineSize(dimensions.width) : mobileHeadlineSize(dimensions.width)
          ),
          onInk ? styles.headlineOnInk : { marginTop: space.headline }
        ]}
      >
        {t("welcome.headline")}
      </RichText>
      <Text
        style={[
          styles.lead,
          onInk ? styles.leadOnInk : { marginTop: space.lead, color: colors.text.secondary }
        ]}
      >
        {t("welcome.lead")}
      </Text>
      <View
        style={[
          styles.guarantees,
          { marginTop: onInk ? DESKTOP_GUARANTEES_GAP : space.guarantees }
        ]}
      >
        {GUARANTEES.map(({ icon, key }) => (
          <View key={key} style={styles.guarantee}>
            <Icon name={icon} size={13} color={palette.orange} />
            <Text
              style={[
                styles.guaranteeText,
                { color: onInk ? colors.onDark.text : colors.text.primary }
              ]}
            >
              {t(`welcome.guarantees.${key}`)}
            </Text>
          </View>
        ))}
      </View>
    </>
  );

  const status = account.progress ? (
    <View style={styles.status}>
      <WaitingIndicator label={t(progressLabel(account.progress))} />
    </View>
  ) : account.failure ? (
    <View style={[styles.status, styles.failure]}>
      <ErrorMessage>{accountFailureMessage(account.failure, t)}</ErrorMessage>
      {/* A passkey that no longer opens the account: its 12 words still do (src/features/rescue/). */}
      {rescueOffered(account.failure) ? (
        <Button
          variant="text"
          size="md"
          icon="key"
          fullWidth={false}
          onPress={() => router.push("/rescue")}
          testID="rescue-offer"
        >
          {t("rescue.entry")}
        </Button>
      ) : null}
    </View>
  ) : removedFrom ? (
    <ErrorMessage style={styles.status} testID="team-removed">
      {t("team.removedNotice", { business: removedFrom })}
    </ErrorMessage>
  ) : deletedAccount ? (
    <ErrorMessage style={styles.status} testID="account-deleted">
      {t("settings.delete.deletedElsewhere", { business: deletedAccount })}
    </ErrorMessage>
  ) : null;

  const actions = (
    <View>
      {status}
      <Button
        icon="user-plus"
        onPress={() => account.create(MERCHANT_SIGN_UP)}
        disabled={busy}
        testID="create-account"
      >
        {t("welcome.createAccount")}
      </Button>
      <Text accessibilityRole="header" style={[styles.listLabel, { marginTop: space.listLabel }]}>
        {t("welcome.alreadyHave")}
      </Text>
      <View style={styles.card}>
        <WelcomeRow
          leading={<Icon name="key" size={16} color={colors.text.primary} />}
          title={t("welcome.have.account")}
          action={t("welcome.login")}
          onPress={account.logIn}
          disabled={busy}
          minHeight={space.row}
          first
          testID="login"
        />
        {/* The icon says how the invitation comes, by the device (not the width): its QR code on
            a phone or a tablet, its link on a computer. */}
        <WelcomeRow
          leading={
            <Icon name={isHandheld() ? "qrcode" : "link"} size={16} color={colors.text.primary} />
          }
          title={t("welcome.have.invitation")}
          action={t("welcome.joinInvitation")}
          onPress={() => router.push("/join")}
          disabled={busy}
          minHeight={space.row}
          testID="join-team"
        />
        <WelcomeRow
          leading={
            <Image source={boltCard} accessibilityIgnoresInvertColors style={styles.boltCard} />
          }
          title={t("welcome.have.boltCard")}
          action={t("welcome.manageBoltCard")}
          onPress={manageBoltCard}
          disabled={busy}
          minHeight={space.row}
          testID="boltcard-entry"
        />
      </View>
      {/* A v2 owner whose device holds nothing of the v2 app. */}
      <MigrateAccountEntry
        onPress={() => router.push({ pathname: "/migration", params: { manual: "1" } })}
        disabled={busy}
        style={{ marginTop: space.migrate }}
      />
      <Text style={[styles.terms, { marginTop: 18 }]}>{t("account.passkeyWarning")}</Text>
      <RichText
        style={[styles.terms, { marginTop: 6 }]}
        onLinkPress={() => openExternal(LEGAL_URLS.terms)}
      >
        {t("welcome.terms")}
      </RichText>
      {/* The privacy policy, under the terms that link their own (LegalLinks.tsx). */}
      <LegalLinks documents={["privacy"]} testID="welcome-legal" />
      <VersionLabel style={styles.version} testID="version" />
      {/* A panel over the screen, whichever layout holds these actions. */}
      <BoltCardAppSheet visible={boltCardApp} onClose={() => setBoltCardApp(false)} />
    </View>
  );

  // "Advanced settings": the relays where the sign-in looks for the
  // account, before any. A small action in the top right corner, not while a passkey runs.
  const advanced = desktop ? (
    <Button
      variant="text"
      icon="gear"
      fullWidth={false}
      disabled={busy}
      onPress={() => router.push("/advanced")}
      testID="advanced-settings"
    >
      {t("relays.advanced")}
    </Button>
  ) : (
    <IconButton
      icon="gear"
      label={t("relays.advanced")}
      overhang="right"
      disabled={busy}
      onPress={() => router.push("/advanced")}
      testID="advanced-settings"
    />
  );

  if (desktop) {
    // Tablets wide enough for the desktop layout have a status bar and a navigation bar (or home
    // indicator): each half's header starts under the first, like the steps' header (StepHeader);
    // the content ends above the second.
    return (
      <View style={styles.screen}>
        {installBanner}
        <View style={styles.split}>
          <View style={[styles.brandHalf, { paddingTop: topInset }]}>
            <View style={styles.desktopHeader}>
              <Logo width={DESKTOP_LOGO_WIDTH} tone="light" />
            </View>
            {/* In the middle of the half under its header, as the actions beside it. */}
            <View style={[styles.pitch, { paddingBottom: insets.bottom }]}>{pitch(true)}</View>
          </View>
          <View style={[styles.actionsHalf, { paddingTop: topInset }]}>
            {/* The text button is as wide as its label, at its row's top (alignSelf): its own
                row, in the middle of the header's, level with the logo. */}
            <View style={[styles.desktopHeader, styles.desktopCorner]}>
              <View>{advanced}</View>
            </View>
            <ScrollView
              contentContainerStyle={[
                styles.desktopBody,
                { paddingBottom: Math.max(insets.bottom, DESKTOP_PADDING) }
              ]}
            >
              <View style={styles.desktopColumn}>{actions}</View>
            </ScrollView>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {installBanner}
      <ScrollView
        style={styles.mobileScroll}
        contentContainerStyle={[
          styles.mobileBody,
          { paddingTop: topInset + 8, paddingBottom: Math.max(insets.bottom, 30) }
        ]}
      >
        <View style={styles.mobileTop}>
          <Logo width={MOBILE_LOGO_WIDTH} />
          <View style={styles.mobileCorner}>{advanced}</View>
        </View>
        {pitch(false)}
        <View style={[styles.push, { minHeight: space.push }]} />
        {actions}
      </ScrollView>
    </View>
  );
}

/**
 * One row of "I already have": a disc with what one has (an icon, the BoltCard's logo), what it is in
 * bold, what it does under it, a chevron. Its line runs under its texts, from the second row on.
 * Not a settings row (SettingsRow): no value, a disc, two lines always.
 */
function WelcomeRow({
  leading,
  title,
  action,
  onPress,
  disabled,
  minHeight,
  first = false,
  testID
}: {
  leading: ReactNode;
  title: string;
  action: string;
  onPress: () => void;
  disabled: boolean;
  minHeight: number;
  first?: boolean;
  testID: string;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <ListRow
      inset={cardInset}
      cornerRadius={radius.lg}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${action}`}
      accessibilityState={{ disabled }}
      onPress={onPress}
      disabled={disabled}
      style={[styles.row, { minHeight }]}
      testID={testID}
    >
      <View style={styles.rowDisc}>{leading}</View>
      <View style={[styles.rowBody, !first && styles.rowSeparated]}>
        <View style={styles.rowTexts}>
          <Text style={[styles.rowTitle, disabled && styles.rowDisabled]}>{title}</Text>
          <Text style={styles.rowAction}>{action}</Text>
        </View>
        <Icon name="chevron-right" size={12} color={colors.text.tertiary} />
      </View>
    </ListRow>
  );
}

/**
 * "Log in": a blank screen while the passkey, the wallet, the account
 * and the point of sale are on their way, only the spinner and what is being done in the middle of
 * the screen. The logo stays where the welcome screen has it: centred on a phone; on a desktop,
 * at the top left of the ink half, the spinner in the middle of the other, where the actions were. Once the
 * account's settings are known, the business above the spinner.
 */
function LoginLoading({ progress, desktop }: { progress: AccountProgress; desktop: boolean }) {
  const styles = useStyles();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const label = t(progressLabel(progress));
  // The height above the spinner, for the business (undefined until laid out).
  const [room, setRoom] = useState<number>();
  // The logo's band under the top inset: the desktop header's height, or loadingLogo's margin and
  // height.
  const logoBand = desktop ? DESKTOP_HEADER_HEIGHT : 8 + control.min;
  // In the middle of its space, whatever the logo's height. The spinner alone: no pending dot
  // (WaitingIndicator) beside the words. Two equal spaces around it: the business comes in at the
  // bottom of the first, the spinner does not move. The logo's band is kept out of both (the same
  // on each side, the spinner stays in the middle): on a short screen (a phone's web app in
  // landscape) the business drops its logo (LoginBusiness), and what still does not fit is cut
  // above, never drawn over the app's logo.
  const loading = (
    <View
      style={[
        StyleSheet.absoluteFill,
        styles.loading,
        { paddingTop: insets.top + logoBand, paddingBottom: insets.bottom + logoBand }
      ]}
    >
      <View
        style={styles.loadingAbove}
        testID="login-business-room"
        onLayout={(event) => setRoom(event.nativeEvent.layout.height)}
      >
        {progress.business ? <LoginBusiness business={progress.business} room={room} /> : null}
      </View>
      {/* The accessible element as big as what it shows: a screen reader exploring by touch still
          reaches the logo, under the full-screen layer. */}
      <View
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={label}
        style={styles.loadingContent}
      >
        <Spinner testID="login-spinner" />
        <Text style={styles.loadingLabel}>{label}</Text>
      </View>
      <View style={styles.loadingBelow} />
    </View>
  );
  if (desktop) {
    return (
      <View style={[styles.screen, styles.split]} testID="login-loading">
        <View style={[styles.brandHalf, { paddingTop: insets.top }]}>
          <View style={styles.desktopHeader}>
            <Logo width={DESKTOP_LOGO_WIDTH} tone="light" />
          </View>
        </View>
        <View style={styles.actionsHalf}>{loading}</View>
      </View>
    );
  }
  return (
    <View style={styles.screen} testID="login-loading">
      <View style={[styles.loadingLogo, { marginTop: insets.top + 8 }]}>
        <Logo width={MOBILE_LOGO_WIDTH} />
      </View>
      {loading}
    </View>
  );
}

/**
 * The business being opened: its logo ("Settings", BusinessMark), read on the account's relays
 * (openAccount made them the device's), then its name. It fades in, with Reduce Motion too (a fade only).
 * Where they do not both fit in `room` (a short screen), the name alone: never half a logo.
 */
function LoginBusiness({ business, room }: { business: AccountBusiness; room?: number }) {
  const styles = useStyles();
  const logo = useImageUri(business.logo);
  const [nameHeight, setNameHeight] = useState<number>();
  const discFits =
    room === undefined ||
    nameHeight === undefined ||
    room >= BUSINESS_DISC_SIZE + BUSINESS_GAP + nameHeight + BUSINESS_MARGIN;
  const shown = useSharedValue(0);
  useEffect(() => {
    shown.set(withTiming(1, { duration: motion.loginBusiness, reduceMotion: ReduceMotion.Never }));
    return () => cancelAnimation(shown);
  }, [shown]);
  // Clamped: on the web, the first frame of an animation can come out slightly below 0.
  const fade = useAnimatedStyle(() => ({ opacity: clamp(shown.get(), 0, 1) }));
  return (
    <Animated.View style={[styles.business, fade]} testID="login-business">
      {discFits ? (
        <BusinessMark
          name={business.name}
          image={logo}
          size={BUSINESS_DISC_SIZE}
          testID="login-business"
        />
      ) : null}
      <Text
        numberOfLines={2}
        style={styles.businessName}
        onLayout={(event) => setNameHeight(event.nativeEvent.layout.height)}
      >
        {business.name}
      </Text>
    </Animated.View>
  );
}

function progressLabel({ action, step }: AccountProgress) {
  switch (step) {
    case "passkey":
      return action === "create" ? "account.progress.creating" : "account.progress.signingIn";
    case "account":
      return action === "create" ? "account.progress.preparing" : "account.progress.restoring";
    case "terminal":
      return "account.progress.terminal";
  }
}

/** The headline at a size (src/features/welcome/headline.ts), at the titles' tracking. */
function headlineStyle(size: number) {
  return {
    fontSize: size,
    letterSpacing: tracking(TITLE_EM, size),
    lineHeight: headlineLineHeight(size)
  };
}

/** The welcome screen's spaces on a phone, and on a low one. */
type Spacing = {
  /** From the logo's row to the headline. */
  headline: number;
  /** From the headline to its line. */
  lead: number;
  /** From the line to the guarantees. */
  guarantees: number;
  /** The least space before "Create my account" (the rest of the screen's height above it). */
  push: number;
  /** From "Create my account" to "I already have". */
  listLabel: number;
  /** A row of "I already have": above the 44 px touch floor in both. */
  row: number;
  /** From the card to "Migrate my Swiss Bitcoin Pay account". */
  migrate: number;
};
const REGULAR: Spacing = {
  headline: 42,
  lead: 8,
  guarantees: 14,
  push: 20,
  listLabel: 26,
  row: 62,
  migrate: 12
};
/**
 * Below COMPACT_HEIGHT: on a 360 × 640 Android (24 px of status bar, 48 of navigation bar), every
 * action whole above the navigation bar, "Migrate" included (7 px above it).
 */
const COMPACT: Spacing = {
  headline: 30,
  lead: 6,
  guarantees: 12,
  push: 22,
  listLabel: 20,
  row: 58,
  migrate: 10
};
/** The window's height under which a phone takes the COMPACT spaces (an iPhone SE is 667). */
const COMPACT_HEIGHT = 700;

/** The logo on a phone: centred above the headline. */
const MOBILE_LOGO_WIDTH = 168;
/**
 * The logo on a desktop: in white, at the top left of the ink half, where the steps' header has it
 * (StepHeader: 84 px high, 40 px in): it stays in place from the welcome screen to the sign-up's
 * steps.
 */
const DESKTOP_LOGO_WIDTH = 168;

/** Around the desktop content; below, the navigation bar's height when it is taller. */
const DESKTOP_PADDING = 40;

/** The desktop header's height, with the logo. */
const DESKTOP_HEADER_HEIGHT = 84;

/**
 * On a desktop, from the headline to its line, then to the guarantees.
 */
const DESKTOP_LEAD_GAP = 72;
const DESKTOP_GUARANTEES_GAP = 26;

/** The business's logo, or its shop icon, on the login's loading screen. */
const BUSINESS_DISC_SIZE = 72;
/** Between that logo and the business's name; under the name, to the spinner. */
const BUSINESS_GAP = 12;
const BUSINESS_MARGIN = 32;

const useStyles = makeStyles(({ colors, shadow }) => ({
  screen: { flex: 1, backgroundColor: colors.background.app },
  mobileScroll: { flex: 1 },
  mobileBody: { flexGrow: 1, paddingHorizontal: gutter },
  push: { flexGrow: 1 },
  headline: {
    ...sans(700),
    color: colors.text.primary,
    textAlign: "center"
  },
  headlineOnInk: { color: colors.onDark.text },
  lead: {
    ...sans(500),
    fontSize: type.body,
    lineHeight: type.body * 1.5,
    textAlign: "center"
  },
  leadOnInk: {
    marginTop: DESKTOP_LEAD_GAP,
    fontSize: type.action,
    lineHeight: type.action * 1.5,
    color: colors.onDark.secondary
  },
  guarantees: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    columnGap: 16,
    rowGap: 6
  },
  guarantee: { flexDirection: "row", alignItems: "center", gap: 7 },
  guaranteeText: {
    ...sans(600),
    fontSize: type.label,
    lineHeight: 20,
    letterSpacing: tracked.label
  },
  status: { marginBottom: 14 },
  failure: { gap: 6, alignItems: "flex-start" },
  listLabel: {
    ...sans(600),
    fontSize: type.label,
    letterSpacing: tracked.label,
    color: colors.text.secondary,
    textAlign: "center",
    marginBottom: 8
  },
  // A card of rows, raised as "Settings"' (SettingsCard): its rows clipped to its corners.
  card: {
    backgroundColor: colors.background.surface,
    borderRadius: radius.lg,
    boxShadow: shadow.card,
    overflow: "hidden"
  },
  row: { flexDirection: "row", alignItems: "center", gap: 14 },
  rowDisc: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.background.app,
    alignItems: "center",
    justifyContent: "center"
  },
  rowBody: {
    flex: 1,
    alignSelf: "stretch",
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  rowSeparated: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border.faint },
  // Under COMPACT's 58 px with its two lines (55.5 px): the row's height is its own, every row the
  // same (10 px made them 59 and 60 px, "Migrate" under the navigation bar).
  rowTexts: { flex: 1, gap: 2, paddingVertical: 8 },
  rowTitle: {
    ...sans(600),
    fontSize: type.body,
    lineHeight: type.body * 1.3,
    color: colors.text.primary
  },
  rowDisabled: { color: colors.text.tertiary },
  rowAction: {
    ...sans(500),
    fontSize: type.caption,
    lineHeight: type.caption * 1.4,
    color: colors.text.secondary
  },
  boltCard: { width: 24, height: 24 },
  terms: {
    ...sans(500),
    fontSize: type.caption,
    lineHeight: type.caption * 1.5,
    color: colors.text.secondary,
    textAlign: "center"
  },
  // Under the privacy policy's link, whose touch height (44 px) leaves 12.6 px above the chip.
  version: { alignSelf: "center" },
  mobileTop: {
    minHeight: control.min,
    alignItems: "center",
    justifyContent: "center"
  },
  // The gear at the right of the centred logo, its target overhanging the gutter (IconButton).
  mobileCorner: { position: "absolute", right: 0, top: 0, bottom: 0, justifyContent: "center" },
  split: { flex: 1, flexDirection: "row" },
  // The brand on the ink of the desktop side bar, deeper in the dark theme: an exception to the
  // two backgrounds per screen, as the side bar.
  brandHalf: { flex: 1, backgroundColor: colors.sidebar.bg },
  pitch: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: DESKTOP_PADDING
  },
  actionsHalf: { flex: 1, backgroundColor: colors.background.app },
  desktopHeader: {
    height: DESKTOP_HEADER_HEIGHT,
    paddingHorizontal: DESKTOP_PADDING,
    flexDirection: "row",
    alignItems: "center"
  },
  desktopCorner: { justifyContent: "flex-end" },
  // As much space above as below (DESKTOP_PADDING, or the navigation bar's): the column in the
  // middle of the half under its header, level with the brand's.
  desktopBody: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: DESKTOP_PADDING,
    paddingTop: DESKTOP_PADDING
  },
  // The content's column, narrower when the half is.
  desktopColumn: { width: 420, maxWidth: "100%" },
  loading: { alignItems: "center", paddingHorizontal: gutter },
  loadingAbove: {
    flex: 1,
    alignSelf: "stretch",
    justifyContent: "flex-end",
    alignItems: "center",
    overflow: "hidden"
  },
  loadingBelow: { flex: 1 },
  loadingContent: { alignItems: "center", gap: 20 },
  business: {
    alignItems: "center",
    gap: BUSINESS_GAP,
    maxWidth: 420,
    marginBottom: BUSINESS_MARGIN
  },
  businessName: {
    ...sans(700),
    fontSize: type.title,
    letterSpacing: tracked.title,
    color: colors.text.primary,
    textAlign: "center"
  },
  // As WaitingIndicator's label.
  loadingLabel: {
    ...sans(500),
    fontSize: type.label,
    letterSpacing: tracked.label,
    color: colors.text.secondary,
    textAlign: "center"
  },
  // The height of the welcome's top row (its gear button): the logo does not move.
  loadingLogo: {
    minHeight: control.min,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: gutter
  }
}));
