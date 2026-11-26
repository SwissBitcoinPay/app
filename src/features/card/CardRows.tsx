import type { TFunction } from "i18next";
import { createContext, useContext, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, Text, View } from "react-native";

import { Icon, type IconName } from "@/components/ui/Icon";
import { ListRow } from "@/components/ui/ListRow";
import { getAccountWalletId } from "@/features/account/session";
import type { CardState } from "@/lib/card/card-record";
import type { CardWalletOf } from "@/lib/card/keys";
import { makeStyles, radius, sans, space, type, useTheme } from "@/theme";

import { useModifiedPhoneWarning } from "./modified-phone";
import { useCardPayeeMode, type CardPayeeModeShown } from "./PayeesPanel";
import type { ChannelSync } from "./relay-sync";

/*
 * The rows of a card's settings: in "Cards" (CardsScreen.tsx) and in its panel "Advanced settings"
 * (CardSheet.tsx), which shows "Payments without confirmation" and "Relay and programming".
 */

/** A group of rows ("Security", "Card"): its label, its card. */
export function Group({ label, children }: { label: string; children: ReactNode }) {
  const styles = useStyles();
  return (
    <View style={styles.group}>
      <Text accessibilityRole="header" style={styles.groupLabel}>
        {label}
      </Text>
      <RowsCard>{children}</RowsCard>
    </View>
  );
}

/**
 * Rows in their card, without a label ("Advanced settings", "Delete the card"). `ringed`: drawn on
 * a panel, a ring around it (as "Change relay", RelayPanel.tsx).
 */
export function RowsCard({ ringed = false, children }: { ringed?: boolean; children: ReactNode }) {
  const styles = useStyles();
  return <View style={[styles.card, ringed && styles.cardRinged]}>{children}</View>;
}

/** A row's round icon; sand while the row cannot be used, as a disabled button. */
export function RowIcon({
  icon,
  danger = false,
  disabled = false
}: {
  icon: IconName;
  danger?: boolean;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View
      style={[
        styles.rowIcon,
        disabled ? styles.rowIconDisabled : danger ? styles.rowIconDanger : null
      ]}
    >
      <Icon
        name={icon}
        size={15}
        color={disabled ? colors.text.secondary : danger ? colors.danger.fg : colors.text.accent}
      />
    </View>
  );
}

/**
 * A row's caption: one text, or lines of their own ("Limits": one line a limit), each kept to one
 * line (its end cut off where it cannot fit, the row's label still
 * saying it whole).
 */
export type RowCaption = string | readonly string[];

/** What a screen reader says of a caption: its lines one after the other. */
function captionText(caption: RowCaption): string {
  return typeof caption === "string" ? caption : caption.join(", ");
}

export function RowTexts({
  title,
  titleWarning = false,
  caption,
  danger = false,
  disabled = false,
  dot = null,
  warning = false,
  testID
}: {
  title: string;
  titleWarning?: boolean;
  caption: RowCaption;
  danger?: boolean;
  disabled?: boolean;
  dot?: string | null;
  warning?: boolean;
  testID?: string;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const titleText = (
    <Text
      style={[
        styles.rowTitle,
        titleWarning ? styles.rowTitleWarned : null,
        disabled ? styles.rowTitleDisabled : danger ? styles.rowTitleDanger : null
      ]}
    >
      {title}
    </Text>
  );
  return (
    <View style={styles.rowTexts}>
      {titleWarning ? (
        <View style={styles.rowTitleLine}>
          <View testID={testID && `${testID}-title-warning`}>
            <Icon name="triangle-exclamation" size={13} color={colors.warning.solid} />
          </View>
          {titleText}
        </View>
      ) : (
        titleText
      )}
      {typeof caption === "string" ? (
        <View style={styles.rowCaptionLine}>
          {warning ? (
            <View testID={testID && `${testID}-warning`}>
              <Icon name="triangle-exclamation" size={11} color={colors.warning.solid} />
            </View>
          ) : dot ? (
            <View style={[styles.rowDot, { backgroundColor: dot }]} />
          ) : null}
          <Text style={styles.rowCaption}>{caption}</Text>
        </View>
      ) : (
        <View testID={testID && `${testID}-caption`}>
          {caption.map((line, index) => (
            <Text key={index} numberOfLines={1} style={styles.rowCaption}>
              {line}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

/**
 * A row of "Cards": its round icon, its title and caption, a chevron. `disabled`: greyed, without
 * its chevron, opening nothing, its caption saying
 * why, as a row of the settings (SettingsRow).
 */
export function Row({
  icon,
  title,
  titleWarning = null,
  caption,
  danger = false,
  disabled = false,
  dot = null,
  warning = false,
  separated = false,
  onPress,
  testID
}: {
  icon: IconName;
  title: string;
  /** A warning before the title, what it says read with the row's label. */
  titleWarning?: string | null;
  caption: RowCaption;
  danger?: boolean;
  disabled?: boolean;
  /** A dot before the caption, its colour (the relay ready: green). */
  dot?: string | null;
  /** A warning before the caption, in place of its dot (the relay out of reach). */
  warning?: boolean;
  separated?: boolean;
  onPress: () => void;
  testID: string;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const said = captionText(caption);
  return (
    <ListRow
      inset={0}
      cornerRadius={radius.lg}
      accessibilityRole="button"
      accessibilityLabel={titleWarning ? `${titleWarning}, ${title}, ${said}` : `${title}, ${said}`}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={styles.row}
      testID={testID}
    >
      <RowIcon icon={icon} danger={danger} disabled={disabled} />
      <RowTexts
        title={title}
        titleWarning={titleWarning !== null}
        caption={caption}
        danger={danger}
        disabled={disabled}
        dot={dot}
        warning={warning}
        testID={testID}
      />
      {disabled ? null : <Icon name="chevron-right" size={12} color={colors.text.tertiary} />}
      {separated ? <Separator /> : null}
    </ListRow>
  );
}

/** A row's frame, for one that is not pressed as a whole ("Pause", its switch). */
export const rowStyle = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    minHeight: 72,
    paddingVertical: 12,
    paddingHorizontal: 16
  }
}).row;

/**
 * Whether the rows' separators cross their whole group (the desktop's page), or start at their
 * texts (the phone's).
 */
export const WholeSeparators = createContext(false);

/** Between two rows of a group, from their texts on (70 px from the edge). */
export function Separator() {
  const styles = useStyles();
  const whole = useContext(WholeSeparators);
  return <View style={[styles.separator, whole && styles.separatorWhole]} />;
}

/** Where a row's texts start: its padding (16), its icon (40) and the gap after it (14). */
const ROW_TEXTS_INSET = 70;

/** A card's mode as its rows say it, a change no majority of the relays took yet said after it. */
function payeeModeCaption(shown: CardPayeeModeShown, t: TFunction): string {
  switch (shown.status) {
    case "known":
      return [
        t(`cards.payees.modes.${shown.mode}.title`),
        ...(shown.pending ? [t("cards.home.payeesPending")] : [])
      ].join(" · ");
    case "reading":
      return t("cards.home.payeesReading");
    case "newer":
      return t("cards.home.payeesNewer");
    case "unread":
      return t("cards.home.payeesUnread");
  }
}

/** Whether the mode's rows mark it: a newer app's books, or a change not on the relays yet. */
function payeeModeWarned(shown: CardPayeeModeShown): boolean {
  return shown.status === "newer" || (shown.status === "known" && shown.pending);
}

/**
 * "This phone is less safe" before the title of the rows that lead to the card's mode, where this
 * phone looks modified and the mode pays without asking (modified-phone.ts): its panel says why.
 * Null: no warning.
 */
function useModifiedPhoneTitle(shown: CardPayeeModeShown, t: TFunction): string | null {
  const modifiedPhone = useModifiedPhoneWarning(getAccountWalletId());
  return modifiedPhone && shown.status === "known" && shown.mode !== "confirm"
    ? t("cards.modifiedPhone.title")
    : null;
}

/** Whether the card's relay keeps it from paying: out of reach, or refusing its channel. */
function relayInTrouble(sync: ChannelSync | undefined): boolean {
  return sync?.status === "unreachable" || sync?.status === "refused";
}

/** "Payments without confirmation", the card's mode said (read again with `round`). */
export function PayeesRow({
  card,
  round,
  separated = false,
  onPress
}: {
  card: CardWalletOf;
  round: number;
  separated?: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const shown = useCardPayeeMode(card, round);
  return (
    <Row
      icon="shield-halved"
      title={t("cards.home.payees")}
      titleWarning={useModifiedPhoneTitle(shown, t)}
      caption={payeeModeCaption(shown, t)}
      dot={payeeModeWarned(shown) ? colors.warning.solid : null}
      separated={separated}
      onPress={onPress}
      testID="card-payees"
    />
  );
}

/** "Relay and programming": the card's relay, and how its channel there was last synced. */
export function RelayRow({
  card,
  sync,
  separated = false,
  onPress
}: {
  card: CardState;
  sync: ChannelSync | undefined;
  separated?: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  return (
    <Row
      icon="circle-nodes"
      title={t("cards.home.relay")}
      caption={sync ? `${card.relayHost} · ${t(`cards.sync.${sync.status}`)}` : card.relayHost}
      dot={sync?.status === "ready" ? colors.success.solid : null}
      // The relay out of reach or refusing, a warning in place of the dot.
      warning={relayInTrouble(sync)}
      separated={separated}
      onPress={onPress}
      testID="card-relay"
    />
  );
}

/**
 * "Advanced settings" in "Cards", what its panel holds said: the card's mode, then its relay's
 * state (not its host); a relay that keeps the card from paying said first, its warning before it,
 * and the warnings of "Payments without confirmation" carried here: nothing that row would mark is
 * hidden by the panel.
 */
export function AdvancedRow({
  card,
  sync,
  round,
  onPress
}: {
  card: CardState;
  sync: ChannelSync | undefined;
  /** Bumped when the panel closes: the mode read again. */
  round: number;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const shown = useCardPayeeMode(card, round);
  const trouble = relayInTrouble(sync);
  const relay = sync
    ? sync.status === "ready"
      ? t("cards.home.advancedRelayReady")
      : t(`cards.sync.${sync.status}`)
    : null;
  const mode = payeeModeCaption(shown, t);
  const caption = relay === null ? mode : trouble ? `${relay} · ${mode}` : `${mode} · ${relay}`;
  return (
    <Row
      icon="sliders"
      title={t("cards.home.advanced")}
      titleWarning={useModifiedPhoneTitle(shown, t)}
      caption={caption}
      dot={!trouble && payeeModeWarned(shown) ? colors.warning.solid : null}
      warning={trouble}
      onPress={onPress}
      testID="card-advanced"
    />
  );
}

const useStyles = makeStyles(({ colors, shadow }) => ({
  group: { gap: space[4] },
  groupLabel: {
    ...sans(600),
    paddingHorizontal: 4,
    fontSize: type.caption,
    color: colors.text.secondary
  },
  card: {
    backgroundColor: colors.background.surface,
    borderRadius: radius.lg,
    overflow: "hidden",
    boxShadow: shadow.card
  },
  cardRinged: { boxShadow: `${shadow.card}, inset 0 0 0 1px ${colors.border.faint}` },
  row: rowStyle,
  separatorWhole: { left: 0 },
  separator: {
    position: "absolute",
    left: ROW_TEXTS_INSET,
    right: 0,
    bottom: 0,
    height: 1,
    backgroundColor: colors.border.subtle
  },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.background.accentSubtle,
    alignItems: "center",
    justifyContent: "center"
  },
  rowIconDanger: { backgroundColor: colors.danger.bg },
  rowIconDisabled: { backgroundColor: colors.background.subtle },
  rowTexts: { flex: 1, minWidth: 0, gap: 2 },
  rowTitle: { ...sans(600), fontSize: 15, color: colors.text.primary },
  rowTitleLine: { flexDirection: "row", alignItems: "center", gap: 6 },
  // Beside its warning: wraps within the line.
  rowTitleWarned: { flexShrink: 1 },
  rowTitleDanger: { color: colors.danger.fg },
  rowTitleDisabled: { color: colors.text.disabled },
  rowCaptionLine: { flexDirection: "row", alignItems: "center", gap: 6 },
  rowDot: { width: 7, height: 7, borderRadius: radius.pill },
  rowCaption: {
    ...sans(500),
    flexShrink: 1,
    fontSize: type.caption,
    lineHeight: 18,
    color: colors.text.secondary
  }
}));
