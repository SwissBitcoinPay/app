import { Stack, useRouter } from "expo-router";
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Keyboard, Pressable, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { LegalLinks } from "@/components/LegalLinks";
import { Avatar } from "@/components/ui/Avatar";
import { Icon, type IconName } from "@/components/ui/Icon";
import { ListRow } from "@/components/ui/ListRow";
import { Spinner } from "@/components/ui/Spinner";
import { useHover } from "@/components/ui/useHover";
import { VersionLabel } from "@/components/VersionLabel";
import { useImageUri } from "@/features/media/images";
import { PickImageError } from "@/features/media/pick-image";
import { useNotifications } from "@/features/notifications/NotificationsProvider";
import { AvatarError } from "@/features/team/member";
import { TeamError } from "@/features/team/owner";
import { useBranding } from "@/features/terminal/branding";
import { PosFrame } from "@/features/terminal/PosFrame";
import { getDeviceLocale } from "@/lib/locale/device";
import { logFailure } from "@/lib/log/log";
import type { TerminalProfile } from "@/lib/terminal/model";
import {
  cardInset,
  makeStyles,
  radius,
  sans,
  space,
  stroke,
  TITLE_EM,
  tracked,
  tracking,
  type,
  useTheme
} from "@/theme";

import { SettingsError } from "./account-settings";

/*
 * The pieces of the screens "Settings": on a
 * phone, the rubrics as cards, two a row, each opening its page of settings; on a computer, tabs
 * over a column of settings. Rows of a white card (SettingsRow) inside them.
 */

/**
 * Mobile: the screen's last button ("Log out", "Leave the business"), then the terms and the
 * privacy policy (LegalLinks) and the version chip under them (VersionLabel), as on the welcome
 * screen: every account's "Settings" reaches them, till mode's included. Desktop shows them in
 * the side bar.
 */
export function MobileFooter({ children }: { children: ReactNode }) {
  const styles = useStyles();
  return (
    <View style={styles.footer}>
      {children}
      {/* The links' touch height (44 px) parts them from the chip. */}
      <View>
        <LegalLinks testID="settings-legal" />
        <VersionLabel style={styles.version} testID="settings-version" />
      </View>
    </View>
  );
}

/** The device's locale, for numbers and percentages (never the UI language). */
export function useLanguageTag(): string {
  const [languageTag] = useState(() => getDeviceLocale().languageTag);
  return languageTag;
}

/** Mobile: a group's label ("Payments"), then its card. */
export function SettingsGroup({ label, children }: { label: string; children: ReactNode }) {
  const styles = useStyles();
  return (
    <View style={styles.group}>
      <Text accessibilityRole="header" style={styles.groupLabel}>
        {label}
      </Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

/**
 * A group's card without its label (rows of a panel, "Cards"). `outlined`: ringed rather than
 * raised, on a dialog's white (as OptionCard's `outlined`): a raised white card does not lift off
 * white, and a scrolling dialog clips its shadow.
 */
export function SettingsCard({
  outlined = false,
  testID,
  children
}: {
  outlined?: boolean;
  testID?: string;
  children: ReactNode;
}) {
  const styles = useStyles();
  return (
    <View style={[styles.card, outlined && styles.cardOutlined]} testID={testID}>
      {children}
    </View>
  );
}

/** Mobile: the label of a group whose content is not a card (a read-only list). */
export function GroupLabel({ children }: { children: string }) {
  const styles = useStyles();
  return (
    <Text accessibilityRole="header" style={styles.groupLabel}>
      {children}
    </Text>
  );
}

/**
 * Mobile: one row of a group's card: its icon, its label (and caption), then its value and a
 * chevron when it opens something, or a control of its own (`trailing`: a switch waits in its knob,
 * Switch's `loading`). `disabled` (till mode: LockedSettings.tsx), greyed, opening nothing.
 * `wrap`: its label and caption whole, on several lines, the row as tall as they need.
 * `captionWarning`: the caption is a warning, the yellow triangle at its left (as CardRows' caption
 * warning), on its first line.
 */
export function SettingsRow({
  icon,
  label,
  caption,
  captionWarning = false,
  value,
  trailing,
  onPress,
  disabled = false,
  wrap = false,
  separated = false,
  accessibleLabel,
  testID
}: {
  icon: IconName;
  label: string;
  caption?: string;
  captionWarning?: boolean;
  value?: string;
  trailing?: ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  wrap?: boolean;
  separated?: boolean;
  /** What a screen reader says for `label` when the row reads as one (disabled), if it differs. */
  accessibleLabel?: string;
  testID?: string;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const content = (
    <>
      <View style={styles.rowIcon}>
        <Icon
          name={icon}
          size={icon === "bitcoin" ? 15 : 14}
          color={disabled ? colors.text.tertiary : colors.text.secondary}
        />
      </View>
      <View style={styles.rowTexts}>
        <Text
          numberOfLines={wrap ? undefined : 1}
          style={[styles.rowLabel, disabled && styles.rowLabelDisabled]}
        >
          {label}
        </Text>
        {caption && captionWarning ? (
          <View style={styles.rowCaptionLine}>
            <View style={styles.rowCaptionIcon} testID={testID && `${testID}-warning`}>
              <Icon name="triangle-exclamation" size={11} color={colors.warning.solid} />
            </View>
            <Text
              numberOfLines={wrap ? undefined : 1}
              style={[styles.rowCaption, styles.rowCaptionWarned]}
            >
              {caption}
            </Text>
          </View>
        ) : caption ? (
          <Text numberOfLines={wrap ? undefined : 1} style={styles.rowCaption}>
            {caption}
          </Text>
        ) : null}
      </View>
      {value !== undefined ? (
        <Text numberOfLines={1} style={styles.rowValue}>
          {value}
        </Text>
      ) : null}
      {trailing}
      {onPress && !disabled ? (
        <Icon name="chevron-right" size={12} color={colors.text.tertiary} />
      ) : null}
    </>
  );
  const style = [
    styles.row,
    caption ? styles.rowTall : null,
    wrap && styles.rowWrap,
    separated && styles.separated
  ];
  if (!onPress || disabled) {
    return (
      <View
        style={styles.rowInset}
        accessible={disabled}
        // Read as one: its value and caption too (the till's "Ask for biometrics…" says by
        // its caption whether it is on, its switch out of reach).
        accessibilityLabel={
          disabled
            ? [accessibleLabel ?? label, value, caption].filter((text) => text).join(", ")
            : undefined
        }
        accessibilityState={disabled ? { disabled: true } : undefined}
        testID={testID}
      >
        <View style={style}>{content}</View>
      </View>
    );
  }
  return (
    <ListRow
      inset={cardInset}
      cornerRadius={radius.lg}
      accessibilityRole="button"
      accessibilityLabel={value ? `${label}, ${value}` : label}
      onPress={onPress}
      style={style}
      testID={testID}
    >
      {content}
    </ListRow>
  );
}

/**
 * Desktop: "Settings": its title over its tabs, then the chosen
 * tab's column (`TabPanel`) scrolling below. At the title's right (`aside`): the owner's
 * "Log out"; in till mode (LockedSettings.tsx), a line under the title and
 * "Unlock" there instead.
 */
export function DesktopPage({
  title,
  subtitle,
  aside,
  tabs,
  children,
  testID
}: {
  title: string;
  subtitle?: string;
  aside?: ReactNode;
  tabs: ReactNode;
  children: ReactNode;
  testID?: string;
}) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.desktop, { paddingTop: insets.top }]}>
      <View style={styles.desktopHeader}>
        <View style={styles.desktopTitleRow}>
          <View style={styles.desktopTitles}>
            <Text accessibilityRole="header" style={styles.desktopTitle}>
              {title}
            </Text>
            {subtitle ? <Text style={styles.desktopSubtitle}>{subtitle}</Text> : null}
          </View>
          {aside}
        </View>
        {tabs}
      </View>
      <KeyboardAwareScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.desktopBody, { paddingBottom: Math.max(insets.bottom, 22) }]}
        keyboardShouldPersistTaps="handled"
        testID={testID}
      >
        {children}
      </KeyboardAwareScrollView>
    </View>
  );
}

/** Desktop: the chosen tab's settings, one column under the tabs. */
export function TabPanel({
  label,
  children,
  testID
}: {
  label: string;
  children: ReactNode;
  testID?: string;
}) {
  const styles = useStyles();
  return (
    <View role="tabpanel" accessibilityLabel={label} style={styles.tabPanel} testID={testID}>
      {children}
    </View>
  );
}

/**
 * Mobile: a rubric of "Settings" over the whole window (an `isFullScreenRoute`), back to the
 * cards from its header; its settings in a column that the keyboard keeps in view.
 */
export function SettingsPage({
  title,
  children,
  testID
}: {
  title: string;
  children: ReactNode;
  testID?: string;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  const router = useRouter();
  const back = () => {
    // A field still focused saves when it is left (fields.tsx): leave it before the page goes, or
    // its blur reaches a page already gone and what was typed is lost (iOS's decimal pad has no
    // "Done" to leave it first).
    Keyboard.dismiss();
    if (router.canGoBack()) router.back();
    else router.replace("/settings");
  };
  return (
    <PosFrame
      title={title}
      leading={{
        icon: "arrow-left",
        label: t("common.back"),
        onPress: back,
        testID: "settings-page-back"
      }}
    >
      {/* No iOS swipe off the screen's edge: it leaves without `back`, a focused field's blur would
          reach a page already gone. Android's back button
          first closes the keyboard, which saves the field. */}
      <Stack.Screen options={{ gestureEnabled: false }} />
      <KeyboardAwareScrollView
        style={styles.scroll}
        contentContainerStyle={styles.pageBody}
        keyboardShouldPersistTaps="handled"
        bottomOffset={space[6]}
        showsVerticalScrollIndicator={false}
        testID={testID}
      >
        {children}
      </KeyboardAwareScrollView>
    </PosFrame>
  );
}

export type SettingsTileItem = {
  key: string;
  title: string;
  /** What it holds now ("5 relays"): shown under its title. */
  summary?: string;
  icon: IconName;
  /** In place of its icon (the business's logo). */
  leading?: ReactNode;
  onPress: () => void;
  /**
   * Till mode: what needs the account, its card in sand, without press; its summary only what the
   * till shows anyway (the display currency, this device's lock).
   */
  disabled?: boolean;
  testID?: string;
};

/**
 * Mobile: "Settings" opens on its rubrics as cards, two a row,
 * each its icon, its title and what it holds now; a card opens its rubric's page.
 */
export function SettingsTiles({ items }: { items: readonly SettingsTileItem[] }) {
  const styles = useStyles();
  const rows: SettingsTileItem[][] = [];
  for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2));
  return (
    <View style={styles.tiles}>
      {rows.map((row) => (
        <View key={row.map((item) => item.key).join("|")} style={styles.tilesRow}>
          {/* Each tile in a cell without padding, the lone tile's empty neighbour such a cell too:
              Yoga never starts a flex item below its padding, so a padded tile beside an empty
              spacer took its padding's width more than half the row ("Help" alone, Android). */}
          {row.map((item) => (
            <View key={item.key} style={styles.tileCell}>
              <SettingsTile item={item} />
            </View>
          ))}
          {row.length === 1 ? <View style={styles.tileCell} /> : null}
        </View>
      ))}
    </View>
  );
}

function SettingsTile({ item }: { item: SettingsTileItem }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { hovered, hoverProps } = useHover();
  const disabled = item.disabled ?? false;
  const ink = disabled ? colors.text.disabled : colors.text.primary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={item.summary ? `${item.title}, ${item.summary}` : item.title}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={item.onPress}
      {...hoverProps}
      style={({ pressed }) => [
        styles.tile,
        disabled ? styles.tileDisabled : (hovered || pressed) && styles.tileActive
      ]}
      testID={item.testID}
    >
      {item.leading ?? (
        <View style={styles.tileIcon}>
          <Icon name={item.icon} size={16} color={ink} />
        </View>
      )}
      <Text numberOfLines={1} style={[styles.tileTitle, { color: ink }]}>
        {item.title}
      </Text>
      {item.summary ? (
        <Text numberOfLines={2} style={styles.tileSummary}>
          {item.summary}
        </Text>
      ) : null}
    </Pressable>
  );
}

/**
 * The business as its point of sale shows it, read only (till mode, an employee's device): its
 * logo and its name.
 */
export function BusinessIdentity({ profile, size }: { profile: TerminalProfile; size: number }) {
  const styles = useStyles();
  const { t } = useTranslation();
  const logo = useImageUri(useBranding(profile)?.logo ?? null);
  return (
    <View style={styles.identity}>
      <Avatar
        name={profile.businessName}
        image={logo}
        size={size}
        accessibilityLabel={t("settings.logo")}
        testID="business-logo"
      />
      <Text numberOfLines={1} style={styles.businessName} testID="business-name">
        {profile.businessName}
      </Text>
    </View>
  );
}

/** A text action in umber ("Edit the name", "Add a photo"), 44 pt high. */
export function TextAction({
  label,
  icon,
  onPress,
  disabled = false,
  testID
}: {
  label: string;
  icon?: IconName;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { hovered, hoverProps } = useHover();
  const color = disabled
    ? colors.text.secondary
    : hovered
      ? colors.button.text.labelHover
      : colors.text.accent;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      {...hoverProps}
      style={styles.textAction}
      testID={testID}
    >
      {icon ? <Icon name={icon} size={icon === "pen" ? 10 : 12} color={color} /> : null}
      <Text style={[styles.textActionLabel, { color }]}>{label}</Text>
    </Pressable>
  );
}

/**
 * A spinner over an avatar while its new image is saved: sent to the relays, then written once a
 * sync writing the same record is through (an employee's photo, src/features/team/member.ts).
 */
export function AvatarBusy({ size }: { size: number }) {
  const styles = useStyles();
  return (
    <View
      style={[styles.avatarBusy, { width: size, height: size, borderRadius: size / 2 }]}
      testID="avatar-busy"
    >
      <Spinner size={Math.round(size / 2.4)} />
    </View>
  );
}

/** The size of `Spinner` in a field whose change is being saved (a button's, md). */
export const SAVING_SPINNER = 16;

/** Why a change of the settings failed, in words (settings.errors). */
export function useSettingsErrorMessage(): (error: unknown) => string {
  const { t } = useTranslation();
  return (error) => {
    let code: string = "saveFailed";
    if (error instanceof SettingsError) code = error.code;
    else if (error instanceof PickImageError) code = error.code;
    // The team's move at a change of relays: no majority of the relays left took a channel.
    else if (error instanceof TeamError && error.code === "unreachable") code = "unreachable";
    else if (error instanceof AvatarError)
      code = error.code === "notMember" ? "saveFailed" : error.code;
    else logFailure("Saving a setting failed", error);
    return t(`settings.errors.${code}` as "settings.errors.saveFailed");
  };
}

/**
 * Notifies why a change of the settings failed (an error notification, "Error while
 * saving"). `key`: the notification it replaces, the
 * same field's success or failure (useSettingsSaved).
 */
export function useSettingsFailure(): (error: unknown, key?: string) => void {
  const { t } = useTranslation();
  const { notify } = useNotifications();
  const message = useSettingsErrorMessage();
  return (error, key = "settings") => {
    notify({
      tone: "error",
      title: t("settings.saveFailedTitle"),
      body: message(error),
      key
    });
  };
}

/**
 * Notifies that a change of the settings is saved: a relay took it (a success notification).
 * `key` as useSettingsFailure's.
 */
export function useSettingsSaved(): (
  key: string,
  title: string,
  body?: string,
  options?: { verbatim?: boolean }
) => void {
  const { notify } = useNotifications();
  return (key, title, body, options) =>
    notify(
      options?.verbatim && body !== undefined
        ? // The merchant's own text (a name): shown as typed, its final period included
          // (Notification drops that of plain text only).
          { tone: "success", title, body: <>{body}</>, bodyLabel: body, key }
        : { tone: "success", title, body, key }
    );
}

/** A warned caption's line height, as CardRows' captions: its triangle sits on the first line. */
const CAPTION_LINE = 18;

const useStyles = makeStyles(({ colors, shadow }) => ({
  footer: { gap: space[6] },
  version: { alignSelf: "center" },
  group: { gap: space[4] },
  groupLabel: {
    ...sans(600),
    paddingHorizontal: 4,
    fontSize: type.fieldLabel,
    color: colors.text.secondary
  },
  // Its padding is its rows' (cardInset: ListRow, pressed up to its edges), clipped to its corners.
  card: {
    backgroundColor: colors.background.surface,
    borderRadius: radius.lg,
    overflow: "hidden",
    boxShadow: shadow.card
  },
  cardOutlined: {
    boxShadow: "none",
    borderWidth: stroke.control,
    borderColor: colors.border.subtle
  },
  rowInset: { paddingHorizontal: cardInset },
  row: { flexDirection: "row", alignItems: "center", gap: 12, height: 60 },
  rowTall: { height: 64 },
  rowWrap: { height: "auto", minHeight: 64, paddingVertical: 12 },
  separated: { borderBottomWidth: 1, borderBottomColor: colors.border.subtle },
  rowIcon: { width: 18, alignItems: "center" },
  rowTexts: { flex: 1, minWidth: 0, gap: 2 },
  rowLabel: {
    ...sans(600),
    fontSize: 15,
    color: colors.text.primary
  },
  rowLabelDisabled: { color: colors.text.disabled },
  rowCaption: { ...sans(500), fontSize: type.caption, color: colors.text.secondary },
  rowCaptionLine: { flexDirection: "row", alignItems: "flex-start", gap: 6 },
  // As tall as the caption's line: the triangle centred on its first line when it wraps.
  rowCaptionIcon: { height: CAPTION_LINE, justifyContent: "center" },
  rowCaptionWarned: { flexShrink: 1, lineHeight: CAPTION_LINE },
  rowValue: {
    ...sans(500),
    flexShrink: 1,
    maxWidth: "45%",
    fontSize: 14,
    color: colors.text.secondary
  },
  desktop: { flex: 1, backgroundColor: colors.background.app },
  desktopTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 24
  },
  desktopTitles: { flexShrink: 1, gap: 4 },
  desktopTitle: {
    ...sans(700),
    fontSize: 26,
    letterSpacing: tracking(TITLE_EM, 26),
    color: colors.text.primary
  },
  // As the point of sale's header line (PosFrame).
  desktopSubtitle: { ...sans(500), fontSize: 14, color: colors.text.secondary },
  scroll: { flex: 1 },
  desktopBody: { paddingHorizontal: 38 },
  desktopHeader: { gap: space[7], paddingTop: 30, paddingHorizontal: 38 },
  tabPanel: { width: "100%", maxWidth: 640, gap: 34, paddingTop: 30 },
  pageBody: { flexGrow: 1, gap: 30, paddingTop: space[3], paddingBottom: space[9] },
  tiles: { gap: space[5] },
  tilesRow: { flexDirection: "row", gap: space[5] },
  tileCell: { flex: 1, minWidth: 0 },
  // Grows to its cell's height: a row's two tiles stay as high as each other.
  tile: {
    flexGrow: 1,
    minHeight: 116,
    gap: 3,
    padding: space[6],
    borderRadius: radius.lg,
    backgroundColor: colors.background.surface,
    boxShadow: shadow.card
  },
  tileActive: { backgroundColor: colors.button.secondary.bgHover },
  // Disabled = sand, not opacity; no shadow: it does not lift off the page.
  tileDisabled: { backgroundColor: colors.background.subtle, boxShadow: "none" },
  tileIcon: {
    width: 40,
    height: 40,
    marginBottom: space[4],
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: colors.border.subtle
  },
  tileTitle: { ...sans(700), fontSize: 15 },
  tileSummary: {
    ...sans(500),
    fontSize: type.caption,
    lineHeight: 17,
    color: colors.text.secondary
  },
  identity: { flexDirection: "row", alignItems: "center", gap: 16 },
  businessName: {
    ...sans(700),
    flex: 1,
    minWidth: 0,
    fontSize: 20,
    color: colors.text.primary
  },
  textAction: { flexDirection: "row", alignItems: "center", gap: 7, minHeight: 44 },
  textActionLabel: { ...sans(600), fontSize: type.label, letterSpacing: tracked.label },
  avatarBusy: {
    position: "absolute",
    left: 0,
    top: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background.subtle
  }
}));
