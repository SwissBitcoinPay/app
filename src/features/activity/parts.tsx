import * as Clipboard from "expo-clipboard";
import type { TFunction } from "i18next";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
  type SharedValue
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import { SatsAmount } from "@/components/ui/AmountBlock";
import { Avatar as PersonAvatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { ColumnHeader, ColumnValueText } from "@/components/ui/ColumnHeader";
import { Masked, spokenAmount, useDiscreet } from "@/components/ui/Discreet";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { Icon, type IconName } from "@/components/ui/Icon";
import { IconButton } from "@/components/ui/IconButton";
import { ListRow } from "@/components/ui/ListRow";
import { LoadingScene, type LoadingSceneKind } from "@/components/ui/LoadingScene";
import { outOfReach } from "@/components/ui/reach";
import { FoldScrollView } from "@/components/ui/scroll-fade";
import { Sheet } from "@/components/ui/Sheet";
import { Spinner } from "@/components/ui/Spinner";
import { StatusPill, StatusPillBox } from "@/components/ui/StatusPill";
import { TableCard, TableRow } from "@/components/ui/TableCard";
import { TableNoMatch } from "@/components/ui/TableNoMatch";
import { useHover } from "@/components/ui/useHover";
import { useTableView, type ViewColumn } from "@/components/ui/useTableView";
import { IntegrationAvatar } from "@/features/integrations/IntegrationAvatar";
import { useEased } from "@/features/navigation/motion";
import { useImageUri } from "@/features/media/images";
import { useAmountUnit } from "@/features/settings/amount-unit";
import type { AmountUnit } from "@/features/settings/amount-unit-format";
import { usePeriodLabel } from "@/features/table/period-label";
import { initialsOf } from "@/features/team/EmployeesScreen";
import { mtpSaleLines } from "@/features/sell/sale-detail";
import { useBranding } from "@/features/terminal/branding";
import { usePos } from "@/features/terminal/pos";
import { TxLink } from "@/features/onchain/TxLink";
import { useAccountSettings } from "@/features/settings/useAccountSettings";
import {
  addressGroups,
  dayKey,
  dayOf,
  recipientOf,
  referenceOf,
  shortReference,
  type DayGroup,
  type SentRecipient
} from "@/features/wallet/model";
import { getPaymentLinkOrigin } from "@/config/payment-links";
import { logFailure } from "@/lib/log/log";
import type { MtpSaleRecord } from "@/lib/mtpelerin/sale-record";
import { PAYMENT_LINK_PATH, paymentLinkFragment } from "@/lib/payment-link/link";
import { datePeriodOf } from "@/lib/date-periods";
import { formatInteger } from "@/lib/locale/format";
import type { ColumnValue, TableFilters } from "@/lib/table";
import { formatSatsGrouped } from "@/lib/terminal/amount";
import {
  AMOUNT_EM,
  cardInset,
  makeStyles,
  mono,
  motion,
  palette,
  radius,
  sans,
  space,
  type ThemeColors,
  tracked,
  tracking,
  type,
  useTheme
} from "@/theme";

import {
  EMPTY_CELL,
  PILL_SIGNS,
  SOURCE_ICONS,
  statusKey,
  type ActivityFormat,
  type AmountTone,
  type StatusKey
} from "./format";
import { AcceptAction, acceptanceTexts, shopOf } from "./AcceptAction";
import { acceptanceAmounts } from "./acceptance";
import { dayListedWhole, dayNet, dayNetText, localDayStart, type NetPart } from "./day-net";
import type { ActivityBy, ActivityItem, FollowUp } from "./model";
import {
  MovementAmounts,
  MovementDay,
  MovementRow,
  WaitingCaption,
  type MovementIcon
} from "./MovementList";
import { openPaymentLinkPage } from "./open-link";

/** The ease of the folds (cubic-bezier(0.2, 0, 0, 1)) and of the fades. */
const FOLD_EASING = Easing.bezier(0.2, 0, 0, 1);
const FADE_EASING = Easing.ease;
/** How long "Copy the reference" shows its check. */
const COPIED_MS = 2000;

/** No row arrived (arrivals.ts). */
const NO_ARRIVALS: ReadonlySet<string> = new Set();

/** Desktop: a section title's row height (the breadcrumb, "To follow up" above the tiles). */
export const DESKTOP_TITLE_ROW = 56;
/** "To follow up", mobile: the card's 2 px above and below (`padding: 2px 16px`). */
const CARD_EDGE = 2;

/** A fold's height (or width) easing to `target`; at once when `animate` is false. */
function useFolded(target: number, animate: boolean): SharedValue<number> {
  return useEased(target, { duration: motion.activityFold, easing: FOLD_EASING, animate });
}

/** A fade of the activity's titles and states (motion.activityFade). */
function useFade(shown: boolean): SharedValue<number> {
  return useEased(shown ? 1 : 0, { duration: motion.activityFade, easing: FADE_EASING });
}

/**
 * Its content folds in or out (as `grid-template-rows` 0fr ↔ 1fr, 260 ms, and a 200 ms fade): its
 * height follows, at once with Reduce Motion, where only the fade stays. Folded, it is out of reach
 * of screen readers, the keyboard and touches. `enter` (a row arrived live, arrivals.ts): mounted
 * folded, it folds in once its content is measured; within reach meanwhile, as what it holds is
 * there.
 */
export function Fold({
  open,
  enter = false,
  children,
  style
}: {
  open: boolean;
  enter?: boolean;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const styles = useStyles();
  const reduceMotion = useReducedMotion();
  const [height, setHeight] = useState<number | null>(null);
  // Read at its mount only: a row already shown never folds in again.
  const [entering, setEntering] = useState(enter);
  const shown = open && !entering;
  const unfolded = useFolded(shown ? 1 : 0, !reduceMotion);
  const opacity = useFade(shown);
  const animated = useAnimatedStyle(
    () =>
      height === null
        ? { opacity: opacity.get() }
        : { opacity: opacity.get(), height: unfolded.get() * height },
    [height]
  );
  return (
    <Animated.View
      style={[
        styles.fold,
        height === null && !shown && styles.folded,
        { pointerEvents: open ? "auto" : "none" },
        animated
      ]}
      {...outOfReach(!open)}
    >
      <View
        style={style}
        onLayout={(event) => {
          const measured = event.nativeEvent.layout.height;
          if (measured > 0 && measured !== height) setHeight(measured);
          if (measured > 0 && entering) setEntering(false);
        }}
      >
        {children}
      </View>
    </Animated.View>
  );
}

/** `children` fading in or out, its place kept (another layer shows in it meanwhile). */
function FadeLayer({
  shown,
  children,
  style
}: {
  shown: boolean;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const opacity = useFade(shown);
  const animated = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  return (
    <Animated.View
      style={[style, { pointerEvents: shown ? "auto" : "none" }, animated]}
      {...outOfReach(!shown)}
    >
      {children}
    </Animated.View>
  );
}

/**
 * A row arrived live (arrivals.ts): lit in apricot under its content as it folds in, as the article
 * scanned at the point of sale, the glow held (motion.arrivalGlowHold), then fading back to white
 * (motion.arrivalGlowFade). A colour, not a movement: kept with Reduce Motion. Read at its mount
 * only; any other row as it is.
 */
export function ArrivalGlow({ arriving, children }: { arriving: boolean; children: ReactNode }) {
  const styles = useStyles();
  const [lit] = useState(arriving);
  const glow = useSharedValue(lit ? 1 : 0);
  useEffect(() => {
    if (!lit) return;
    glow.set(
      withDelay(
        motion.arrivalGlowHold,
        withTiming(0, {
          duration: motion.arrivalGlowFade,
          easing: Easing.out(Easing.ease),
          reduceMotion: ReduceMotion.Never
        }),
        ReduceMotion.Never
      )
    );
    return () => cancelAnimation(glow);
  }, [lit, glow]);
  const glowStyle = useAnimatedStyle(() => ({ opacity: glow.get() }));
  if (!lit) return children;
  return (
    <View collapsable={false}>
      <Animated.View
        aria-hidden
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[styles.arrivalGlow, glowStyle]}
        testID="activity-arrival-glow"
      />
      {children}
    </View>
  );
}

function Centered({ desktop, children }: { desktop: boolean; children: ReactNode }) {
  const styles = useStyles();
  return <View style={[styles.centered, desktop && styles.centeredDesktop]}>{children}</View>;
}

/** Nothing to show yet: the screen's loading scene and what it waits for. */
export function Waiting({
  desktop,
  scene,
  label,
  testID,
  leaving = false
}: {
  desktop: boolean;
  scene: LoadingSceneKind;
  label: string;
  testID?: string;
  /** Read: it fades out (useLoadingScene). */
  leaving?: boolean;
}) {
  return (
    <Centered desktop={desktop}>
      <LoadingScene scene={scene} label={label} testID={testID} leaving={leaving} />
    </Centered>
  );
}

/** It could not be shown: why, and "Try again" (waiting while `retrying`). */
export function Failed({
  desktop,
  message,
  onRetry,
  retrying = false,
  testID,
  retryTestID
}: {
  desktop: boolean;
  message: string;
  onRetry: () => void;
  retrying?: boolean;
  testID?: string;
  retryTestID?: string;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  return (
    <Centered desktop={desktop}>
      <ErrorMessage style={styles.centeredError} testID={testID}>
        {message}
      </ErrorMessage>
      <Button
        variant="secondary"
        size="md"
        fullWidth={false}
        loading={retrying}
        onPress={onRetry}
        testID={retryTestID}
      >
        {t("wallet.retry")}
      </Button>
    </Centered>
  );
}

/**
 * While no sync of the wallet reached the network (`syncing`, useWalletData): what shows is this
 * device's copy, above which newer payments may come. A sand pill beside the list's title
 * ("Updating…": a line above the table would read as one of its column labels on desktop). Then it
 * fades out, and goes: in the title's row, the list never moves. `compact`: its spinner alone, its
 * words for screen readers only (beside the state chosen on mobile, whose name would otherwise give
 * way to them).
 */
export function SyncStatus({ syncing, compact = false }: { syncing: boolean; compact?: boolean }) {
  const styles = useStyles();
  const { t } = useTranslation();
  // Outlives `syncing` by the fade.
  const [mounted, setMounted] = useState(syncing);
  if (syncing && !mounted) setMounted(true);
  const shown = useSharedValue(syncing ? 1 : 0);

  useEffect(() => {
    if (!mounted) return;
    shown.set(
      withTiming(
        syncing ? 1 : 0,
        {
          duration: motion.syncFade,
          easing: Easing.out(Easing.cubic),
          reduceMotion: ReduceMotion.Never
        },
        (finished) => {
          if (finished && !syncing) scheduleOnRN(setMounted, false);
        }
      )
    );
    return () => cancelAnimation(shown);
  }, [mounted, syncing, shown]);

  const style = useAnimatedStyle(() => ({ opacity: shown.get() }));

  if (!mounted) return null;
  return (
    <Animated.View
      style={[styles.syncPill, compact && styles.syncPillCompact, style]}
      accessibilityLiveRegion="polite"
      // iOS reads a View's label only when it is an accessibility element.
      accessible={compact}
      accessibilityRole={compact ? "progressbar" : undefined}
      accessibilityLabel={compact ? t("wallet.syncing") : undefined}
      testID="wallet-syncing"
    >
      <Spinner size={12} />
      {compact ? null : (
        <Text numberOfLines={1} style={styles.syncText}>
          {t("wallet.syncing")}
        </Text>
      )}
    </Animated.View>
  );
}

/** The rows of each state of "To follow up", and what the screen offers of them. */
export type FollowUpsView = {
  /** The states the screen follows, in their order. */
  states: readonly FollowUp[];
  /**
   * Those that have a row: only those show, a tile or a row each (never a disabled tile counting
   * 0).
   */
  withRows: readonly FollowUp[];
  groups: Record<FollowUp, ActivityItem[]>;
  /** The state chosen: the list keeps its rows only. */
  filter: FollowUp | null;
  onPick: (state: FollowUp | null) => void;
};

/** A section's title ("Balance", "To follow up" and "Transactions" at one level). */
export function SectionTitle({ children }: { children: string }) {
  const styles = useStyles();
  return (
    <Text accessibilityRole="header" style={styles.sectionTitle}>
      {children}
    </Text>
  );
}

/**
 * Mobile: "To follow up" in a card, a row per state that has one, with its count and total. Tapping
 * one keeps it alone (the others fold away, its chevron turns into a cross), and the list below
 * keeps its rows; tapping it again shows everything.
 */
export function FollowUpCard({ view, format }: { view: FollowUpsView; format: ActivityFormat }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const discreet = useDiscreet();
  const { withRows: shown, groups, filter, onPick } = view;
  return (
    <View style={styles.card} testID="activity-follow-ups">
      {shown.map((state, index) => {
        const rows = groups[state];
        const on = filter === state;
        const total = format.total(state, rows);
        const name = t(`activity.followUps.${state}`);
        const separated = filter === null && index < shown.length - 1;
        // The card's 2 px above and below are its first and last rows' own, under their pressed
        // tint: the chosen state's row alone while the others are folded away.
        const first = filter === null ? index === 0 : on;
        const last = filter === null ? index === shown.length - 1 : on;
        return (
          <Fold key={state} open={filter === null || on}>
            <ListRow
              inset={cardInset}
              cornerRadius={radius.lg}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={t("activity.followUpLabel", {
                name,
                count: rows.length,
                total: total === null ? "" : spokenAmount(discreet, total)
              })}
              onPress={() => onPick(on ? null : state)}
              containerStyle={{
                paddingTop: first ? CARD_EDGE : 0,
                paddingBottom: last ? CARD_EDGE : 0
              }}
              style={[
                styles.followUpRow,
                { borderBottomColor: separated ? colors.border.subtle : "transparent" }
              ]}
              testID={`activity-follow-up-${state}`}
            >
              <StatusPillBox>
                <StatusPill state={state} label={name} sign={PILL_SIGNS[state]} size="sm" />
              </StatusPillBox>
              <Text style={styles.followUpCount}>{rows.length}</Text>
              {total !== null ? (
                <Masked style={styles.followUpTotalBox}>
                  <Text numberOfLines={1} style={styles.followUpTotal}>
                    {total}
                  </Text>
                </Masked>
              ) : null}
              <View style={styles.followUpSign}>
                <FadeLayer shown={!on} style={styles.followUpGlyph}>
                  <Icon name="chevron-right" size={11} color={colors.text.secondary} />
                </FadeLayer>
                <FadeLayer shown={on} style={styles.followUpGlyph}>
                  <Icon name="xmark" size={13} color={colors.text.secondary} />
                </FadeLayer>
              </View>
            </ListRow>
          </Fold>
        );
      })}
    </View>
  );
}

/**
 * Desktop: "To follow up" as tiles, one per state that has a row: its count and total. Clicking one
 * keeps the table to its rows, its orange ring fading in; clicking it again shows everything. Each
 * tile keeps the width it has when every state shows: the places of the states left out stay empty,
 * at the end.
 */
export function FollowUpTiles({ view, format }: { view: FollowUpsView; format: ActivityFormat }) {
  const styles = useStyles();
  const { t } = useTranslation();
  const discreet = useDiscreet();
  const { states, withRows: shown, groups, filter, onPick } = view;
  return (
    <View style={styles.tiles} testID="activity-follow-ups">
      {shown.map((state) => {
        const rows = groups[state];
        const on = filter === state;
        const total = format.total(state, rows);
        const name = t(`activity.followUps.${state}`);
        return (
          <Tile
            key={state}
            on={on}
            label={t("activity.followUpLabel", {
              name,
              count: rows.length,
              total: total === null ? "" : spokenAmount(discreet, total)
            })}
            onPress={() => onPick(on ? null : state)}
            testID={`activity-follow-up-${state}`}
          >
            <View style={styles.tileHead}>
              <StatusPill state={state} label={name} sign={PILL_SIGNS[state]} size="sm" />
              <Text style={styles.tileCount}>{rows.length}</Text>
            </View>
            {total !== null ? (
              // Its place in its own box: Masked has none outside a discreet mode ("My activity").
              <View style={styles.tileTotalBox}>
                <Masked>
                  <Text numberOfLines={1} style={styles.tileTotal}>
                    {total}
                  </Text>
                </Masked>
              </View>
            ) : (
              // A no-break space keeps the line: the web collapses a plain one (`nowrap`).
              <Text style={[styles.tileTotal, styles.tileTotalBox]}>{"\u00a0"}</Text>
            )}
          </Tile>
        );
      })}
      {states.slice(shown.length).map((_, index) => (
        <View key={`place-${index}`} style={styles.tile} />
      ))}
    </View>
  );
}

function Tile({
  on,
  label,
  onPress,
  testID,
  children
}: {
  on: boolean;
  label: string;
  onPress: () => void;
  testID: string;
  children: ReactNode;
}) {
  const styles = useStyles();
  const { hovered, hoverProps } = useHover();
  const ring = useFade(on);
  const ringStyle = useAnimatedStyle(() => ({ opacity: ring.get() }));
  return (
    <Pressable
      {...hoverProps}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      accessibilityLabel={label}
      onPress={onPress}
      style={styles.tile}
      testID={testID}
    >
      <View style={[styles.tileCard, hovered && styles.tileHovered]}>{children}</View>
      <Animated.View style={[styles.tileRing, ringStyle, styles.passThrough]} />
    </Pressable>
  );
}

/**
 * Mobile: the list's title ("Transactions"), which gives way, fading, to the state chosen in umber
 * with a cross: tapping it shows everything again. While the wallet syncs (`syncing`), its pill
 * follows the title shown: each layer has its own, which fades with it; beside the state, its
 * spinner alone.
 */
export function ListTitle({
  root,
  view,
  syncing = false
}: {
  root: string;
  view: FollowUpsView;
  syncing?: boolean;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  // The state shown while its title fades out.
  const [last, setLast] = useState<FollowUp>(view.filter ?? "open");
  if (view.filter !== null && view.filter !== last) setLast(view.filter);
  const name = t(`activity.followUpTitles.${view.filter ?? last}`);
  return (
    <View style={styles.listTitle}>
      <FadeLayer shown={view.filter === null} style={styles.titleRow}>
        <View style={styles.shrink}>
          <SectionTitle>{root}</SectionTitle>
        </View>
        <SyncStatus syncing={syncing && view.filter === null} />
      </FadeLayer>
      <FadeLayer
        shown={view.filter !== null}
        style={[styles.stacked, styles.stackedRow, styles.titleRow]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("activity.clearFilter", { name })}
          onPress={() => view.onPick(null)}
          style={[styles.crumbClear, styles.shrink]}
          testID="activity-clear-filter"
        >
          <Text numberOfLines={1} style={[styles.sectionTitle, styles.accent, styles.shrink]}>
            {name}
          </Text>
          <Icon name="xmark" size={15} color={colors.text.accent} />
        </Pressable>
        <SyncStatus syncing={syncing && view.filter !== null} compact />
      </FadeLayer>
    </View>
  );
}

/**
 * Desktop: "All transactions", then "› Open invoices" sliding in once a state is chosen; the first
 * part turns umber and shows everything again. While the wallet syncs (`syncing`), its pill comes
 * last, and follows the crumb as it slides.
 */
export function Breadcrumb({
  root,
  view,
  syncing = false
}: {
  root: string;
  view: FollowUpsView;
  syncing?: boolean;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const [last, setLast] = useState<FollowUp>(view.filter ?? "open");
  if (view.filter !== null && view.filter !== last) setLast(view.filter);
  const on = view.filter !== null;
  const [width, setWidth] = useState(0);
  const unfolded = useFolded(on ? 1 : 0, !reduceMotion);
  const opacity = useFade(on);
  const crumbStyle = useAnimatedStyle(
    () => ({ opacity: opacity.get(), width: unfolded.get() * width }),
    [width]
  );
  const { hovered, hoverProps } = useHover();
  return (
    <View style={styles.breadcrumb}>
      <Pressable
        {...hoverProps}
        accessibilityRole={on ? "button" : "header"}
        disabled={!on}
        onPress={() => view.onPick(null)}
        testID="activity-clear-filter"
      >
        <Text
          numberOfLines={1}
          style={[styles.sectionTitle, on && styles.accent, on && hovered && styles.accentHover]}
        >
          {root}
        </Text>
      </Pressable>
      <Animated.View style={[styles.crumb, crumbStyle]} {...outOfReach(!on)}>
        <View
          style={styles.crumbInner}
          onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        >
          <Icon name="chevron-right" size={12} color={colors.text.secondary} />
          <Text accessibilityRole="header" numberOfLines={1} style={styles.sectionTitle}>
            {t(`activity.followUpTitles.${view.filter ?? last}`)}
          </Text>
        </View>
      </Animated.View>
      <View style={styles.crumbSync}>
        <SyncStatus syncing={syncing} />
      </View>
    </View>
  );
}

/** Whether a row stays while `filter` is chosen. */
function visible(item: ActivityItem, filter: FollowUp | null): boolean {
  return filter === null || item.state === filter;
}

type DayRows = { key: string; when: DayGroup["when"]; items: ActivityItem[] };

/** The rows (the newest first) grouped by local calendar day, in their order. */
function byDay(items: readonly ActivityItem[], now: Date): DayRows[] {
  const groups: DayRows[] = [];
  for (const item of items) {
    const key = dayKey(new Date(item.timestamp * 1000));
    const last = groups[groups.length - 1];
    if (last?.key === key) last.items.push(item);
    else groups.push({ key, when: dayOf(item.timestamp, now), items: [item] });
  }
  return groups;
}

/**
 * The colour of an amount by its tone (format.ts): received in the green of its "Paid" / "Received"
 * pill, sent in the text's own, not received in grey.
 */
function amountColors(colors: ThemeColors): Record<AmountTone, string> {
  return {
    muted: colors.text.secondary,
    received: colors.state.settled.fg,
    plain: colors.text.primary
  };
}

/** Sats with their sign in front, for a value without francs (no rate). */
export function SignedSats({ sign, sats, size }: { sign: string; sats: bigint; size: number }) {
  const styles = useStyles();
  return (
    <View style={styles.signedSats}>
      {sign ? <Text style={[styles.sign, { fontSize: size }]}>{sign}</Text> : null}
      <SatsAmount value={formatSatsGrouped(sats)} size={size} showIcon={false} />
    </View>
  );
}

/**
 * The glyph of a row in a state that tells itself by it (as the cards' "History": refused, failed,
 * being confirmed, underpaid); any other, its source's.
 */
const STATE_GLYPHS: Partial<Record<NonNullable<ActivityItem["state"]>, IconName>> = {
  canceled: "ban",
  failed: "ban",
  underpaid: "triangle-exclamation",
  unconfirmed: "clock"
};

/**
 * A mobile row's round icon: in its state's colours while it has one; done, green when it came in,
 * sand when it left.
 */
function rowIcon(item: ActivityItem, format: ActivityFormat, colors: ThemeColors): MovementIcon {
  const pill = format.pill(item);
  if (pill === null || item.state === null) {
    return item.source === "send"
      ? { name: SOURCE_ICONS.send, bg: colors.background.subtle, fg: colors.text.primary }
      : { name: SOURCE_ICONS[item.source], bg: colors.success.bg, fg: colors.success.fg };
  }
  const state = colors.state[pill.state];
  return {
    name: STATE_GLYPHS[item.state] ?? SOURCE_ICONS[item.source],
    bg: state.bg,
    fg: state.fg
  };
}

/**
 * A mobile row's line under its name: its time, then its state in the state's colour; done, its
 * time, then where it comes from and who took it, or its kind (format.ts' `meta`), in grey.
 */
function rowCaption(
  item: ActivityItem,
  format: ActivityFormat,
  t: TFunction,
  colors: ThemeColors
): { text: string; color: string } {
  const pill = format.pill(item);
  if (pill === null) return { text: format.meta(item), color: colors.text.secondary };
  return {
    text: t("wallet.meta", { time: format.time(item.timestamp), kind: pill.label }),
    color: colors.state[pill.state].fg
  };
}

/**
 * A mobile row's amounts: the one "Currency shown first" chooses (`unit`, settings/amount-unit.ts),
 * its value (francs) or its sats, signed "−" when sent, in the colour of its tone; the other
 * unsigned under it. Its value unknown (a rate outage, a transfer whose rate is not read yet), its
 * sats alone; nothing moved yet (an invoice open), its amount alone. Paid but not credited
 * (pendingCredit): after a clock, in grey, "not in balance yet" under it.
 */
function RowAmounts({
  item,
  format,
  unit
}: {
  item: ActivityItem;
  format: ActivityFormat;
  unit: AmountUnit;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { languageTag } = usePos();
  const sign = format.sign(item);
  const sats = item.sats === null ? null : `${formatInteger(item.sats, languageTag)} sats`;
  const value = format.amount(item);
  const testID = `${item.pendingCredit ? "activity-pending-amount" : "activity-amount"}-${item.id}`;
  if (item.pendingCredit) {
    const primary = value ?? (sats === null ? null : `${sign}${sats}`);
    return primary === null ? null : (
      <MovementAmounts
        primary={primary}
        color={colors.text.secondary}
        waiting
        secondary={<WaitingCaption>{t("activity.pendingCredit.awaiting")}</WaitingCaption>}
        testID={testID}
      />
    );
  }
  const color = amountColors(colors)[format.tone(item)];
  if (value !== null && (unit === "fiat" || sats === null)) {
    return (
      <MovementAmounts
        primary={value}
        color={color}
        secondary={sats ?? undefined}
        testID={testID}
      />
    );
  }
  if (sats === null) return null;
  return (
    <MovementAmounts
      primary={`${sign}${sats}`}
      color={color}
      secondary={format.amount(item, "") ?? undefined}
      testID={testID}
    />
  );
}

/**
 * What a row adds to its day's net (day-net.ts): only what is proven, done and credited (no state,
 * no credit waiting), received ("+") or sent ("−"), its sats and its value.
 */
function netPartOf(item: ActivityItem, format: ActivityFormat): NetPart | null {
  if (item.state !== null || item.pendingCredit || item.sats === null) return null;
  return { way: item.source === "send" ? "out" : "in", sats: item.sats, value: format.value(item) };
}

/**
 * Mobile (as the cards' "History"):
 * the rows by day, each day's rows in a card under its title, its net at the title's right. A state
 * chosen in "To follow up" folds the other rows away, and the days left without any; their nets go
 * meanwhile (they would add up rows not shown). A day's net only when all of it is listed
 * (`listedFrom`, Unix seconds: every movement since then is; null: none is told, a list still read
 * or partly read). `inset`: the screen's gutter, the list's sides. The rows of `arriving`
 * (arrivals.ts) fold in lit (ArrivalGlow); a day all of whose rows arrive folds in whole.
 */
export function ActivityList({
  items,
  filter,
  format,
  onOpen,
  empty,
  emptyGuide,
  inset,
  listedFrom,
  arriving = NO_ARRIVALS
}: {
  items: readonly ActivityItem[];
  filter: FollowUp | null;
  format: ActivityFormat;
  onOpen: (item: ActivityItem) => void;
  empty: boolean;
  /** In place of "No transactions yet.": how movements come (the owner's). */
  emptyGuide?: ReactNode;
  inset: number;
  listedFrom: number | null;
  /** The rows that just arrived (arrivals.ts). */
  arriving?: ReadonlySet<string>;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const { languageTag } = usePos();
  const unit = useAmountUnit();
  const groups = byDay(items, new Date());
  const padded = { paddingHorizontal: inset };
  const netOf = (group: DayRows): string | null => {
    if (filter !== null || listedFrom === null) return null;
    const start = localDayStart(group.items[0]!.timestamp * 1000);
    if (!dayListedWhole(start, listedFrom * 1000)) return null;
    const parts = group.items.flatMap((item) => netPartOf(item, format) ?? []);
    const net = dayNet(parts, unit);
    return net === null ? null : dayNetText(net, languageTag);
  };
  return (
    <View style={padded} testID="activity-list">
      {groups.length === 0 && empty ? (
        emptyGuide ? (
          <View style={styles.emptyGuide}>{emptyGuide}</View>
        ) : (
          <Text style={styles.empty}>{t("activity.empty")}</Text>
        )
      ) : null}
      {groups.map((group, index) => {
        const shown = group.items.filter((item) => visible(item, filter));
        const dayArrives = group.items.every((item) => arriving.has(item.id));
        return (
          <Fold
            key={group.key}
            open={shown.length > 0}
            enter={dayArrives}
            style={index === 0 ? styles.firstDay : styles.nextDay}
          >
            <MovementDay
              label={format.day(group.when)}
              net={netOf(group)}
              testID={`activity-day-${group.key}`}
            >
              {group.items.map((item) => {
                const caption = rowCaption(item, format, t, colors);
                const place = shown.indexOf(item);
                const arrives = arriving.has(item.id);
                return (
                  <Fold key={item.id} open={place >= 0} enter={arrives && !dayArrives}>
                    <ArrivalGlow arriving={arrives}>
                      <MovementRow
                        icon={rowIcon(item, format, colors)}
                        title={format.title(item)}
                        caption={caption.text}
                        captionColor={caption.color}
                        amounts={<RowAmounts item={item} format={format} unit={unit} />}
                        separated={place >= 0 && place < shown.length - 1}
                        onPress={() => onOpen(item)}
                        testID={`activity-row-${item.id}`}
                      />
                    </ArrivalGlow>
                  </Fold>
                );
              })}
            </MovementDay>
          </Fold>
        );
      })}
    </View>
  );
}

/** Widths of the desktop table's columns; null: left out. The title takes the rest. */
type Columns = {
  date: number;
  source: number | null;
  by: number | null;
  state: number;
  amount: number;
};

const CELL_GAP = 16;
/** The rows' side paddings, in the table's card. */
const ROW_SIDES = 44;
/**
 * The title keeps 164 px at 1440 px, in the card: a little less before a column goes (160 before
 * the card, whose wider sides took 12 px from it; "Source" still goes under 1280 px).
 */
const MIN_TITLE = 148;

/**
 * The table's columns for its width: the widest (1440 px wide; without "By" for an employee), its
 * "Amount" and "sats" one column, as the other screens write a movement (the unit "Currency shown
 * first" chooses first, the other under it), then, on narrower desktops (from 1024 px, side bar
 * included), without "Source" (in a row's details), then tighter, rather than overflowing. The
 * date's column is 24 px wider than the widest's, taken from "Source", and never tightens: it holds
 * the device's word for today ("Yesterday · 02:32 PM", 130 px in Plus Jakarta Sans SemiBold 13,
 * `sans(500)`, the hour having two digits) unabbreviated.
 * "Source" keeps room for its longest label, icon included ("Ponto de venda", 126 px in Poppins,
 * wider than Plus Jakarta Sans).
 */
function columnsFor(width: number, showBy: boolean): Columns {
  const widest: Columns = showBy
    ? { date: 136, source: 136, by: 120, state: 160, amount: 130 }
    : { date: 136, source: 156, by: null, state: 170, amount: 130 };
  const steps: Columns[] = [
    widest,
    { ...widest, source: null },
    { date: 136, source: null, by: showBy ? 110 : null, state: 140, amount: 120 }
  ];
  const needs = (columns: Columns) => {
    const widths = Object.values(columns).filter((value): value is number => value !== null);
    return widths.reduce((sum, value) => sum + value + CELL_GAP, ROW_SIDES + MIN_TITLE);
  };
  if (width === 0) return widest;
  return steps.find((columns) => needs(columns) <= width) ?? steps[steps.length - 1]!;
}

/**
 * The table's columns as its header sorts and filters them (useTableView), each by what it shows:
 * "Date" by the time, its values the periods (today, yesterday, this week…
 * src/lib/date-periods.ts);
 * "Description", "Source", "By" and "Status" by their words, "—" last, their values drawn as the
 * table draws them: the source's icon, who took it with their avatar, the state's pill, "Status"'s
 * told apart by `statusKey` (one per label, in any language); "Amount" by the unit it writes first
 * (`unit`): the amount in the display currency, signed (a sale typed in another currency last), or
 * the sats, sorted only (no "Show"). Only those `columns` shows.
 */
function useTableColumns(
  columns: Columns,
  unit: AmountUnit,
  format: ActivityFormat,
  business: BusinessFace,
  languageTag: string
): ViewColumn<ActivityItem>[] {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const periodLabel = usePeriodLabel(languageTag);
  const empty: ColumnValue = { key: "", label: EMPTY_CELL, spoken: t("table.emptyValue") };
  /** What a column of words shows: null for "—" (`EMPTY_CELL`, or null). */
  const shownWords = (text: (item: ActivityItem) => string | null) => (item: ActivityItem) => {
    const value = text(item);
    return value === null || value === EMPTY_CELL ? null : value;
  };
  /** A column of words: by its words, "—" empty. */
  const words = (
    id: string,
    label: string,
    text: (item: ActivityItem) => string | null
  ): ViewColumn<ActivityItem> => {
    const shown = shownWords(text);
    return {
      id,
      label,
      sort: { kind: "text", key: shown },
      value: (item) => {
        const value = shown(item);
        return value === null ? empty : { key: value, label: value };
      }
    };
  };
  const byName = shownWords(format.by);
  const all: (ViewColumn<ActivityItem> | null)[] = [
    {
      id: "date",
      label: t("activity.columns.date"),
      sort: { kind: "date", key: (item) => item.timestamp },
      value: (item) => {
        // Read when asked (filtering, its menu): "Today" never stays past midnight.
        const period = datePeriodOf(item.timestamp, new Date());
        return { key: period, label: periodLabel(period) };
      },
      valuesOrder: "descending"
    },
    words("label", t("activity.columns.label"), format.title),
    columns.source !== null
      ? {
          id: "source",
          label: t("activity.columns.source"),
          sort: { kind: "text", key: format.source },
          value: (item) => ({ key: item.source, label: format.source(item) }),
          renderValue: (item) => (
            <>
              <Icon name={SOURCE_ICONS[item.source]} size={11} color={colors.text.secondary} />
              <ColumnValueText>{format.source(item)}</ColumnValueText>
            </>
          )
        }
      : null,
    columns.by !== null
      ? {
          id: "by",
          label: t("activity.columns.by"),
          sort: { kind: "text", key: byName },
          // Who, not their name: two employees of one name stay two values.
          value: (item) => {
            const name = byName(item);
            if (!item.by || name === null) return empty;
            return {
              key: item.by.kind === "you" ? "you" : `${item.by.kind}:${item.by.id}`,
              label: name
            };
          },
          // Nobody ("—"): its label, as text.
          renderValue: (item) => {
            const name = byName(item);
            return item.by && name !== null ? (
              <>
                <ByAvatar by={item.by} business={business} size={24} />
                <ColumnValueText>{name}</ColumnValueText>
              </>
            ) : null;
          }
        }
      : null,
    {
      id: "state",
      label: t("activity.columns.state"),
      sort: { kind: "text", key: (item) => format.status(item).label },
      value: (item) => ({ key: statusKey(item), label: format.status(item).label }),
      renderValue: (item) => {
        const status = format.status(item);
        return (
          <StatusPillBox>
            <StatusPill state={status.state} label={status.label} sign={status.sign} size="sm" />
          </StatusPillBox>
        );
      }
    },
    {
      id: "amount",
      label: t("activity.columns.amount"),
      sort: {
        kind: "number",
        key:
          unit === "fiat"
            ? format.amountMinor
            : (item) =>
                item.sats === null ? null : format.sign(item) === "−" ? -item.sats : item.sats
      }
    }
  ];
  return all.filter((column) => column !== null);
}

/** An expired invoice's "Status" (statusKey). */
const EXPIRED: StatusKey = "expired";

/**
 * Expired invoices: hidden by default, the table's normal state, not a filter (no button under the
 * table): unchecked in "Status", whose header does not say "filtered" for them; "Clear filters"
 * leaves them hidden. Checked, they show. A table of expired invoices only says they are hidden,
 * with "Show expired (N)". An expired invoice received nothing (payment-link/final.ts, model.ts'
 * linkItem): leaving it out hides no money.
 */
const EXPIRED_HIDDEN: TableFilters = { state: [EXPIRED] };

/**
 * Desktop: the rows in a table in a white card (head and rows in the card, the breadcrumb above
 * it): Date, Description, Source, By (the owner's view), Status, Amount (its sats under it, or over
 * it). A row clicked opens its details. Each column's header sorts the table by it and filters its
 * values (ColumnHeader); a filter that leaves no row says so, with "Clear filters". Expired
 * invoices are hidden by default (EXPIRED_HIDDEN). Rows filtered out fold away, as those of a state
 * of "To follow up". The rows of `arriving` (arrivals.ts) fold in lit (ArrivalGlow), where the
 * table's order puts them.
 */
export function ActivityTable({
  items,
  filter,
  format,
  showBy,
  onOpen,
  empty,
  emptyGuide,
  arriving = NO_ARRIVALS
}: {
  items: readonly ActivityItem[];
  filter: FollowUp | null;
  format: ActivityFormat;
  showBy: boolean;
  onOpen: (item: ActivityItem) => void;
  empty: boolean;
  /** In place of "No transactions yet.", under the head: as ActivityList's. */
  emptyGuide?: ReactNode;
  /** The rows that just arrived (arrivals.ts). */
  arriving?: ReadonlySet<string>;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  const { languageTag } = usePos();
  // Measured: the columns that fit (columnsFor).
  const [width, setWidth] = useState(0);
  const columns = columnsFor(width, showBy);
  const business = useBusinessFace();
  const unit = useAmountUnit();
  const sortable = useTableColumns(columns, unit, format, business, languageTag);
  const table = useTableView(items, sortable, languageTag, EXPIRED_HIDDEN);
  const widths: Record<string, StyleProp<ViewStyle>> = {
    date: { width: columns.date },
    label: styles.flexCell,
    source: { width: columns.source ?? 0 },
    by: { width: columns.by ?? 0 },
    state: { width: columns.state },
    amount: { width: columns.amount }
  };
  // Each row's filters read once a render (a column's value may format its label).
  const shown = new Set(table.rows.filter((item) => visible(item, filter) && table.shown(item)));
  // Rows, none shown, no filter: the expired invoices, hidden by default, are all there is.
  const expiredOnly = items.length > 0 && shown.size === 0 && !table.filtering;
  const expiredCount = expiredOnly ? items.filter((item) => statusKey(item) === EXPIRED).length : 0;
  const state = sortable.find((column) => column.id === "state");
  return (
    <TableCard
      testID="activity-list"
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      headTestID="activity-table-head"
      head={sortable.map((column) => (
        <ColumnHeader
          key={column.id}
          control={table.header(column)}
          align={column.id === "amount" ? "end" : "start"}
          style={widths[column.id]}
          testID={`activity-column-${column.id}`}
        />
      ))}
    >
      {items.length === 0 && empty ? (
        emptyGuide ? (
          <View style={styles.emptyGuideDesktop}>{emptyGuide}</View>
        ) : (
          <Text style={[styles.empty, styles.emptyDesktop]}>{t("activity.empty")}</Text>
        )
      ) : null}
      {items.length === 0 && !empty ? (
        // Nothing yet, the sync running: a spinner under the head rather than the card ending on
        // its line. Its words are the sync pill's, beside the title.
        <View style={styles.loadingDesktop}>
          <Spinner size={24} testID="activity-table-loading" />
        </View>
      ) : null}
      {items.length > 0 && table.filtering && shown.size === 0 ? (
        <TableNoMatch
          message={t("activity.noMatch")}
          onClear={table.clearFilters}
          testID="activity-no-match"
          clearTestID="activity-clear-filters"
        />
      ) : null}
      {expiredCount > 0 && state ? (
        <TableNoMatch
          message={t("activity.expiredHidden")}
          actionLabel={t("activity.showExpired", { count: expiredCount })}
          onClear={() => table.header(state).show([EXPIRED], true)}
          testID="activity-expired-hidden"
          clearTestID="activity-show-expired"
        />
      ) : null}
      {table.rows.map((item) => (
        <Fold key={item.id} open={shown.has(item)} enter={arriving.has(item.id)}>
          <ArrivalGlow arriving={arriving.has(item.id)}>
            <ActivityTableRow
              item={item}
              format={format}
              columns={columns}
              unit={unit}
              business={business}
              onPress={() => onOpen(item)}
            />
          </ArrivalGlow>
        </Fold>
      ))}
    </TableCard>
  );
}

function ActivityTableRow({
  item,
  format,
  columns,
  unit,
  business,
  onPress
}: {
  item: ActivityItem;
  format: ActivityFormat;
  columns: Columns;
  unit: AmountUnit;
  business: BusinessFace;
  onPress: () => void;
}) {
  // Read with the row (each new list makes new rows): a date alone, the React Compiler would keep
  // the first one for as long as the table stays mounted, and "Today" would stay past midnight.
  const { colors } = useTheme();
  const styles = useStyles();
  const stamp = format.stamp(item, new Date());
  const status = format.status(item);
  return (
    <TableRow height={52} onPress={onPress} testID={`activity-row-${item.id}`}>
      <Text style={[styles.cellMuted, { width: columns.date }]}>{stamp}</Text>
      <Text numberOfLines={1} style={[styles.cellTitle, styles.flexCell]}>
        {format.title(item)}
      </Text>
      {columns.source !== null ? (
        <View style={[styles.cellSource, { width: columns.source }]}>
          <Icon name={SOURCE_ICONS[item.source]} size={11} color={colors.text.secondary} />
          <Text numberOfLines={1} style={styles.cellMutedText}>
            {format.source(item)}
          </Text>
        </View>
      ) : null}
      {columns.by !== null ? (
        <View style={[styles.cellBy, { width: columns.by }]}>
          {item.by ? <ByAvatar by={item.by} business={business} size={24} /> : null}
          <Text numberOfLines={1} style={[styles.cellMuted, styles.shrink]}>
            {format.by(item) ?? EMPTY_CELL}
          </Text>
        </View>
      ) : null}
      <View style={[styles.cellState, { width: columns.state }]}>
        <StatusPill state={status.state} label={status.label} sign={status.sign} size="sm" />
      </View>
      {/* As a mobile row writes it (RowAmounts): the unit chosen first, the other under it. */}
      <View
        style={[styles.cellAmounts, { width: columns.amount }]}
        testID={`activity-amount-cell-${item.id}`}
      >
        <RowAmounts item={item} format={format} unit={unit} />
      </View>
    </TableRow>
  );
}

/**
 * A row opened, in a sheet (mobile) or a dialog (desktop): its state, title and amount, then its
 * date, who took it (the owner's view), what is left to pay, until when a link is payable, the link
 * to a payment link's page whatever its state, and for a transfer the wallet's details (type,
 * network, fees, reference).
 */
export function ActivitySheet({
  item,
  format,
  showBy,
  onClose,
  onAccepted,
  onFollowSale
}: {
  /** null: closed. */
  item: ActivityItem | null;
  format: ActivityFormat;
  showBy: boolean;
  onClose: () => void;
  /**
   * A sale to Mt Pelerin's order pressed ("Track the sale"): its progress, in "Sell"'s panel (the
   * owner's list). Absent: its order is not pressable.
   */
  onFollowSale?: (sale: MtpSaleRecord) => void;
  /**
   * The owner's list: a row "Underpaid" offers "Accept the amount received" (AcceptAction), and
   * this reads the acceptances again once one is made. Absent: no such offer (an employee's list).
   */
  onAccepted?: () => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const { languageTag } = usePos();
  // While the sheet closes, the row it showed stays in it.
  const [last, setLast] = useState(item);
  if (item !== null && item !== last) setLast(item);
  const shown = item ?? last;
  const business = useBusinessFace();
  const status = shown ? format.status(shown) : null;
  // As the list writes it ("Currency shown first"): the sats first once chosen, its value unsigned
  // under them; else its value first, its sats under it.
  const satsFirst = useAmountUnit() === "sats" && shown?.sats !== null && shown?.sats !== undefined;
  const amount = shown ? format.amount(shown, satsFirst ? "" : format.sign(shown)) : null;
  const [payment] = shown?.payments ?? [];
  const single = shown?.payments.length === 1 ? payment : undefined;
  const reference = single ? referenceOf(single) : null;
  // Where a payment sent went ("Recipient"), first of its details: in place of the title it was.
  const recipient = single && shown?.source === "send" ? recipientOf(single) : null;
  const title = shown ? format.detailTitle(shown) : null;
  // A withdrawal's transaction, linked to its page on the explorer this device reads the chain on:
  // the account's own node when it names one, else mempool.space (TxLink).
  const chainNode = useAccountSettings()?.bitcoinNode ?? null;
  const txId = single?.network === "bitcoin" ? single.txId : undefined;
  const by = shown && showBy ? format.by(shown) : null;
  const page = shown ? linkPageOf(shown) : null;
  const credit = shown ? format.creditCallout(shown) : null;
  // "Track the sale" (a sale to Mt Pelerin): the sheet closes, then, once out of sight, the sale's
  // panel opens on its order (onFollowSale). Two panels never show at once.
  const following = useRef<MtpSaleRecord | null>(null);
  const follow = (sale: MtpSaleRecord) => {
    following.current = sale;
    onClose();
  };
  const onHidden = () => {
    const sale = following.current;
    following.current = null;
    if (sale && onFollowSale) onFollowSale(sale);
  };
  // The owner's acceptance of the sale (acceptance.ts): when, and the difference it accepted.
  const acceptance = shown?.acceptance;
  const accepted =
    shown && acceptance?.status === "accepted"
      ? {
          at: acceptance.at,
          late: acceptance.late === true,
          difference: acceptanceAmounts(
            acceptanceTexts((fiat) => format.fiatText(fiat), languageTag),
            acceptance.fiat,
            { received: shown.sats ?? acceptance.received, due: acceptance.due }
          ).difference
        }
      : null;
  return (
    <Sheet
      title={shown ? format.source(shown) : ""}
      closeLabel={t("wallet.detail.close")}
      visible={item !== null}
      onClose={onClose}
      onHidden={onHidden}
      testID="activity-detail-sheet"
    >
      {shown ? (
        <>
          {/* Its fold told: the bar while it scrolls, and a fade at
            the bottom while more of it is below (scroll-fade.tsx). One per row shown, each opening
            at its top. */}
          <FoldScrollView
            key={shown.id}
            boxStyle={styles.sheetScrollBox}
            style={styles.sheetScroll}
            fadeColor={colors.background.surface}
            testID="activity-detail"
            fadeTestID="activity-detail-more"
          >
            {status ? (
              <View style={styles.sheetPill}>
                <StatusPill
                  state={status.state}
                  label={status.label}
                  sign={status.sign}
                  size="sm"
                />
              </View>
            ) : null}
            {title !== null ? <Text style={styles.detailTitle}>{title}</Text> : null}
            {satsFirst && shown.sats !== null ? (
              <>
                <View style={[styles.detailSats, styles.detailSatsAlone]}>
                  <SignedSats sign={format.sign(shown)} sats={shown.sats} size={24} />
                </View>
                {amount !== null ? (
                  <View style={styles.detailValueUnder}>
                    <Masked color={colors.text.secondary}>
                      <Text style={styles.detailValueSmall} testID="activity-detail-value">
                        {amount}
                      </Text>
                    </Masked>
                  </View>
                ) : null}
              </>
            ) : (
              <>
                {amount !== null ? (
                  // Its place in its own box: Masked has none outside a discreet mode ("My
                  // activity").
                  <View style={styles.detailAmountBox}>
                    <Masked color={amountColors(colors)[format.tone(shown)]}>
                      <Text
                        style={[
                          styles.detailAmount,
                          { color: amountColors(colors)[format.tone(shown)] }
                        ]}
                      >
                        {amount}
                      </Text>
                    </Masked>
                  </View>
                ) : null}
                {shown.sats !== null ? (
                  <View style={[styles.detailSats, amount === null && styles.detailSatsAlone]}>
                    <SignedSats
                      sign={format.sign(shown)}
                      sats={shown.sats}
                      size={amount !== null ? 14.5 : 24}
                    />
                  </View>
                ) : null}
              </>
            )}
            {credit ? (
              <View style={styles.detailCallout}>
                <Callout tone="warning" steps={credit.steps} testID="activity-pending-credit">
                  {credit.text}
                </Callout>
              </View>
            ) : null}
            {/* An order's acceptance a minority of the relays hold yet, being sent (acceptance.ts):
              not "Paid", told why. */}
            {acceptance?.status === "pending" ? (
              <View style={styles.detailCallout}>
                <Callout tone="warning" icon="clock-regular" testID="activity-acceptance-pending">
                  {t("activity.accept.pending")}
                </Callout>
              </View>
            ) : null}
            <View style={styles.detailRows}>
              {recipient !== null ? (
                <DetailRow label={t("wallet.detail.recipient")} top>
                  <Recipient recipient={recipient} />
                </DetailRow>
              ) : null}
              <DetailRow label={t("activity.detail.date")}>
                <Text style={styles.detailValue}>{format.dateTime(shown.timestamp)}</Text>
              </DetailRow>
              {by !== null ? (
                <DetailRow
                  label={
                    shown.source === "link"
                      ? t("activity.detail.madeBy")
                      : t("activity.detail.takenBy")
                  }
                >
                  <View style={styles.detailBy}>
                    {shown.by ? <ByAvatar by={shown.by} business={business} size={28} /> : null}
                    <Text style={styles.detailValue}>{by}</Text>
                  </View>
                </DetailRow>
              ) : null}
              {shown.rest && shown.fiat ? (
                <DetailRow label={t("activity.detail.rest")}>
                  <Masked style={styles.shrink}>
                    <Text style={styles.detailValue}>
                      {format.fiatText({ ...shown.fiat, minor: shown.rest.minor })}
                    </Text>
                  </Masked>
                </DetailRow>
              ) : shown.rest ? (
                // An integration's order in sats alone: its rest in sats.
                <DetailRow label={t("activity.detail.rest")}>
                  <Masked style={styles.shrink}>
                    <SatsAmount
                      value={formatSatsGrouped(shown.rest.sats)}
                      size={14.5}
                      showIcon={false}
                    />
                  </Masked>
                </DetailRow>
              ) : null}
              {accepted ? (
                <>
                  <DetailRow label={t("activity.detail.accepted")}>
                    <Text style={styles.detailValue}>{format.dateTime(accepted.at)}</Text>
                  </DetailRow>
                  <DetailRow label={t("activity.detail.difference")}>
                    <Masked style={styles.shrink}>
                      <Text style={styles.detailValue} testID="activity-detail-difference">
                        {accepted.difference}
                      </Text>
                    </Masked>
                  </DetailRow>
                </>
              ) : null}
              {shown.link && shown.state === "open" ? (
                <DetailRow label={t("activity.detail.endsAt")}>
                  <Text style={styles.detailValue}>{format.dateTime(shown.link.endsAt)}</Text>
                </DetailRow>
              ) : null}
              {page !== null ? (
                <DetailRow label={t("activity.detail.link")}>
                  <LinkPage key={page.url} page={page} onLeave={onClose} />
                </DetailRow>
              ) : null}
              {single &&
              (shown.source === "receive" ||
                shown.source === "send" ||
                shown.source === "recovered") &&
              // A transfer the SDK cannot tell: neither its type, its network nor its fee is known
              // ("Deposit" or "Withdrawal", simply).
              single.network !== "unknown" ? (
                <>
                  {/* Its network: "Lightning", "Bitcoin"… */}
                  <DetailRow label={t("wallet.detail.network")}>
                    <View style={styles.detailNetwork}>
                      <Icon
                        name={networkIcon(single.network)}
                        size={12}
                        color={colors.text.secondary}
                        style={styles.netIcon}
                      />
                      <Text style={styles.detailValue}>
                        {t(`wallet.networks.${single.network}`)}
                      </Text>
                    </View>
                  </DetailRow>
                  {single.direction === "send" ? (
                    // "Sending fees": what the wallet paid on top of what it sent, whatever it
                    // sent.
                    <DetailRow label={t("wallet.detail.sendFee")}>
                      {/* No fee at all says so in words. */}
                      {single.feeSats === 0n ? (
                        <Text style={styles.detailValue}>{t("wallet.detail.noFee")}</Text>
                      ) : (
                        <SendFee
                          sats={single.feeSats}
                          fiat={format.feeText(shown, single.feeSats)}
                          satsFirst={satsFirst}
                        />
                      )}
                    </DetailRow>
                  ) : shown.recovery && shown.recovery.feeSats !== null ? (
                    // What its recovery cost in all: the network's fees and the deposit's claim.
                    <DetailRow label={t("wallet.detail.fee")}>
                      <SatsAmount
                        value={formatSatsGrouped(shown.recovery.feeSats)}
                        size={14.5}
                        showIcon={false}
                      />
                    </DetailRow>
                  ) : null}
                </>
              ) : null}
              {shown.payments.length > 1 ? (
                <DetailRow label={t("activity.detail.payments")}>
                  <Text style={styles.detailValue}>{shown.payments.length}</Text>
                </DetailRow>
              ) : null}
              {reference !== null ? (
                <DetailRow label={t("wallet.detail.reference")}>
                  <View style={styles.reference}>
                    {txId ? (
                      <TxLink
                        txid={txId}
                        node={chainNode}
                        cut={8}
                        tail={4}
                        fontSize={14.5}
                        face="sans"
                      />
                    ) : (
                      <Text style={styles.referenceText} selectable>
                        {shortReference(reference)}
                      </Text>
                    )}
                    <CopyReference key={reference} reference={reference} />
                  </View>
                </DetailRow>
              ) : null}
            </View>
            {shown.mtpSale ? (
              <SaleSection
                sale={shown.mtpSale}
                onFollow={onFollowSale ? () => follow(shown.mtpSale!) : undefined}
              />
            ) : null}
          </FoldScrollView>
          {/* Under the details, never scrolled away (as "Export"'s button): a sheet's details
            may outgrow its height (the dialog's 640 on a computer), which would hide this action
            under them. */}
          {accepted?.late ? (
            // Accepted late, from acceptanceCutoff: its shop was not told, for as long as the row
            // shows.
            <Callout tone="warning" testID="activity-accepted-late">
              {t("activity.detail.acceptedLate", { integration: shopOf(shown, t) })}
            </Callout>
          ) : null}
          {onAccepted ? (
            <AcceptAction item={shown} format={format} onAccepted={onAccepted} />
          ) : null}
        </>
      ) : null}
    </Sheet>
  );
}

/**
 * A sale to Mt Pelerin, under the wallet's details: its title, then a card of its lines
 * (sale-detail.ts), the order last. The order is a row pressed as a whole when `onFollow` is given:
 * "Track the sale", on a second line under its number, opens its progress.
 */
function SaleSection({ sale, onFollow }: { sale: MtpSaleRecord; onFollow?: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { languageTag } = usePos();
  const lines = mtpSaleLines(sale, t, languageTag);
  return (
    <View style={styles.sale} testID="activity-sale">
      <Text style={styles.saleTitle} accessibilityRole="header">
        {t("activity.mtpSale.section")}
      </Text>
      <View style={styles.saleCard}>
        {lines.map((line, index) => {
          const value = (
            <View style={styles.saleValue}>
              <Text style={styles.saleValueText} testID={`activity-sale-${line.key}`}>
                {line.value}
              </Text>
              {line.detail ? (
                <Text
                  style={[styles.saleDetail, line.detailMono && styles.saleDetailMono]}
                  testID={`activity-sale-${line.key}-detail`}
                >
                  {line.detail}
                </Text>
              ) : null}
            </View>
          );
          const row = [styles.saleRow, index > 0 && styles.saleRowDivided];
          if (line.key === "order" && onFollow) {
            return (
              <ListRow
                key={line.key}
                inset={SALE_CARD_INSET}
                cornerRadius={SALE_CARD_RADIUS}
                style={row}
                accessibilityRole="button"
                accessibilityLabel={t("activity.mtpSale.followLabel", { order: line.value })}
                onPress={onFollow}
                testID="activity-sale-follow"
              >
                <Text style={styles.saleLabel}>{line.label}</Text>
                <View style={styles.saleValue}>
                  <Text style={styles.saleOrder} testID="activity-sale-order">
                    {line.value}
                  </Text>
                  <View style={styles.saleFollow}>
                    <Text style={styles.saleFollowText}>{t("activity.mtpSale.follow")}</Text>
                    <Icon name="chevron-right" size={11} color={colors.text.accent} />
                  </View>
                </View>
              </ListRow>
            );
          }
          return (
            <View key={line.key} style={[row, styles.saleRowInset]}>
              <Text style={styles.saleLabel}>{line.label}</Text>
              {line.masked ? <Masked style={styles.shrink}>{value}</Masked> : value}
            </View>
          );
        })}
      </View>
    </View>
  );
}

/** The sale's card: its rows' horizontal room, which a pressed row takes back (ListRow). */
const SALE_CARD_INSET = 16;
const SALE_CARD_RADIUS = 16;

/** A payment link's page: its URL, and its fragment (`#<author>.<key>.<relays>`). */
type LinkPageRef = { url: string; fragment: `#${string}` };

/** An author as a link's URL names it: a 32-byte public key, in hex. */
const LINK_AUTHOR = /^[0-9a-f]{64}$/;

/**
 * The page of a payment link's row, as its URL was shared (paymentLinkUrl); null for another row,
 * or a build without a web app for the links (no RP ID: getPaymentLinkOrigin).
 */
function linkPageOf(item: ActivityItem): LinkPageRef | null {
  const origin = getPaymentLinkOrigin();
  if (item.link === null || origin === null || !LINK_AUTHOR.test(item.link.id)) return null;
  const fragment = paymentLinkFragment(item.link.id, item.link.key, item.link.relays);
  // paymentLinkUrl, from the fragment made once.
  return { url: `${origin}${PAYMENT_LINK_PATH}${fragment}`, fragment };
}

/**
 * "Open the invoice": the payer's page of the link (src/app/pay.tsx), which shows its sale as it
 * stands (open, paid, underpaid or expired); then the copy icon, to send it again. `onLeave` runs
 * first when the page opens over this screen (the apps: open-link.ts).
 */
function LinkPage({ page, onLeave }: { page: LinkPageRef; onLeave: () => void }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const { hovered, hoverProps } = useHover();
  return (
    <View style={styles.reference}>
      <Pressable
        {...hoverProps}
        accessibilityRole="link"
        accessibilityLabel={t("activity.detail.openLink")}
        onPress={() => openPaymentLinkPage(page.url, page.fragment, onLeave)}
        style={styles.linkPage}
        testID="activity-open-link"
      >
        <Icon name="link" size={12} color={colors.text.accent} />
        <Text
          numberOfLines={1}
          style={[styles.detailValue, styles.accent, hovered && styles.accentHover]}
        >
          {t("activity.detail.openLink")}
        </Text>
      </Pressable>
      <CopyButton
        copy={() => Clipboard.setStringAsync(page.url)}
        label={t("activity.detail.copyLink")}
        copiedLabel={t("activity.detail.linkCopied")}
        what="the payment link"
        testID="activity-copy-link"
      />
    </View>
  );
}

function networkIcon(network: "lightning" | "bitcoin" | "spark"): IconName {
  return network === "bitcoin" ? "bitcoin" : network === "spark" ? "right-left" : "bolt";
}

/**
 * A row of details: its label, then its value. `top`: a value of several lines, its label beside
 * its first.
 */
function DetailRow({
  label,
  top = false,
  children
}: {
  label: string;
  top?: boolean;
  children: ReactNode;
}) {
  const styles = useStyles();
  return (
    <View style={[styles.detailRow, top && styles.detailRowTop]}>
      <Text style={[styles.detailLabel, top && styles.detailLabelTop]}>{label}</Text>
      <View style={styles.detailCell}>{children}</View>
    </View>
  );
}

/**
 * "Recipient": a Bitcoin address whole, in groups of 4 (addressGroups), or the Lightning address
 * paid, then its copy icon. Not selectable: a selection would copy the groups' spaces; the icon
 * copies the address itself, on every platform.
 */
function Recipient({ recipient }: { recipient: SentRecipient }) {
  const styles = useStyles();
  const { t } = useTranslation();
  const { address, network } = recipient;
  return (
    <View style={styles.recipient}>
      <Text style={[styles.detailValue, styles.recipientText]} testID="wallet-recipient">
        {network === "bitcoin" ? addressGroups(address) : address}
      </Text>
      <CopyButton
        key={address}
        copy={() => Clipboard.setStringAsync(address)}
        label={t("wallet.detail.copyAddress")}
        copiedLabel={t("wallet.detail.addressCopied")}
        what="the recipient's address"
        testID="wallet-copy-address"
        top
      />
    </View>
  );
}

/**
 * "Sending fees": in the unit shown first (as the amount above, "Currency shown first"), the other
 * under it, smaller; its sats alone while no rate values them (feeText).
 */
function SendFee({
  sats,
  fiat,
  satsFirst
}: {
  sats: bigint;
  fiat: string | null;
  satsFirst: boolean;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const figure = formatSatsGrouped(sats);
  if (fiat === null) return <SatsAmount value={figure} size={14.5} showIcon={false} />;
  return (
    <View style={styles.feeStack}>
      {satsFirst ? (
        <>
          <SatsAmount value={figure} size={14.5} showIcon={false} />
          <Masked color={colors.text.secondary} style={styles.shrink}>
            <Text style={styles.feeUnder}>{fiat}</Text>
          </Masked>
        </>
      ) : (
        <>
          <Masked style={styles.shrink}>
            <Text style={styles.detailValue}>{fiat}</Text>
          </Masked>
          <SatsAmount value={figure} size={12.5} showIcon={false} />
        </>
      )}
    </View>
  );
}

/**
 * The copy icon after the reference, on every platform: beside a withdrawal's transaction, a link
 * that cannot be selected, as beside a reference that can. An IconButton: its 44 px target is its
 * own size, react-native-web ignores `hitSlop`.
 */
function CopyReference({ reference }: { reference: string }) {
  const { t } = useTranslation();
  return (
    <CopyButton
      copy={() => Clipboard.setStringAsync(reference)}
      label={t("wallet.detail.copy")}
      copiedLabel={t("wallet.detail.copied")}
      what="the reference"
      testID="wallet-copy-reference"
    />
  );
}

/**
 * A copy icon that turns into a check for COPIED_MS once `copy` resolved (unless it resolved
 * false: nothing copied). Each copy shows its check for the whole time, and none is left to run
 * once the button is gone.
 */
function CopyButton({
  copy,
  label,
  copiedLabel,
  what,
  testID,
  top = false
}: {
  copy: () => Promise<boolean | void>;
  label: string;
  copiedLabel: string;
  /** What is copied, for the development log of a failure. */
  what: string;
  testID: string;
  /** Beside the first line of a value of several lines (DetailRow's `top`). */
  top?: boolean;
}) {
  // The copies made, 0 once the check is gone: each one restarts its time. The timer lives in an
  // effect, so a copy that resolves once the button is gone starts none.
  const { colors } = useTheme();
  const styles = useStyles();
  const [copies, setCopies] = useState(0);
  useEffect(() => {
    if (copies === 0) return;
    const timer = setTimeout(() => setCopies(0), COPIED_MS);
    return () => clearTimeout(timer);
  }, [copies]);
  const copied = copies > 0;
  return (
    <IconButton
      icon={copied ? "check" : "copy-regular"}
      label={copied ? copiedLabel : label}
      size={14}
      color={colors.text.accent}
      style={[styles.copy, top && styles.copyTop]}
      onPress={() => {
        copy().then(
          (done) => {
            if (done !== false) setCopies((count) => count + 1);
          },
          (error: unknown) => {
            logFailure(`Copying ${what} failed`, error);
          }
        );
      }}
      testID={testID}
    />
  );
}

/** The business, as "You" shows it: its name, and its logo once read. */
type BusinessFace = { name: string; image: string | null };

/** Read once by the table and the details, not by each row (the branding is a stored record). */
function useBusinessFace(): BusinessFace {
  const { profile } = usePos();
  const image = useImageUri(useBranding(profile)?.logo ?? null);
  return { name: profile.businessName, image };
}

/**
 * Who took a sale ("By", "Taken by"): an employee's photo, else its initials in sand (as on
 * "Employees"); "You", the business's logo, else its initials in orange (as the side bar's business
 * card); an integration, the logo of its platform, else its code icon in sand (as on
 * "Integrations", IntegrationAvatar). Hidden from screen readers: the name follows it.
 */
function ByAvatar({
  by,
  business,
  size
}: {
  by: ActivityBy;
  business: BusinessFace;
  size: number;
}) {
  const member = by.kind === "member";
  const photo = useImageUri(member ? (by.avatar ?? null) : null);
  return (
    <View aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {by.kind === "integration" ? (
        <IntegrationAvatar size={size} platform={by.platform} />
      ) : (
        <PersonAvatar
          name={member ? by.name : business.name}
          image={member ? photo : business.image}
          size={size}
          tone={member ? "subtle" : "accent"}
          testID="activity-by-avatar"
        />
      )}
    </View>
  );
}

/** An employee's initials in the orange disc (as on "Employees"). */
function Avatar({ name }: { name: string }) {
  const styles = useStyles();
  return (
    <View style={styles.avatar}>
      <Text style={styles.initials}>{initialsOf(name)}</Text>
    </View>
  );
}

/** "View limited to your own transactions", after its padlock. */
function Limited({ align }: { align: "left" | "right" }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  return (
    <View style={[styles.limited, align === "right" && styles.limitedRight]}>
      <Icon name="user-lock" size={12} color={colors.text.accent} />
      <Text style={styles.limitedText}>{t("activity.limited")}</Text>
    </View>
  );
}

/** Mobile: the employee, in place of the balance, and what the screen is limited to. */
export function IdentityMobile({ name }: { name: string }) {
  const styles = useStyles();
  return (
    <View style={styles.identity} testID="activity-identity">
      <Avatar name={name} />
      <View style={styles.identityText}>
        <Text numberOfLines={1} style={styles.identityName}>
          {name}
        </Text>
        <Limited align="left" />
      </View>
    </View>
  );
}

/** Desktop: the same, on the header's right. */
export function IdentityDesktop({ name }: { name: string }) {
  const styles = useStyles();
  return (
    <View style={styles.identityDesktop} testID="activity-identity">
      <View style={styles.identityDesktopText}>
        <Text numberOfLines={1} style={styles.identityNameDesktop}>
          {name}
        </Text>
        <Limited align="right" />
      </View>
      <Avatar name={name} />
    </View>
  );
}

const useStyles = makeStyles(({ colors, shadow }) => ({
  fold: { overflow: "hidden" },
  folded: { height: 0 },
  arrivalGlow: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.background.accentSubtle,
    pointerEvents: "none"
  },
  passThrough: { pointerEvents: "none" },
  stacked: { position: "absolute", top: 0, left: 0, bottom: 0, justifyContent: "center" },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: 22 },
  centeredDesktop: { paddingHorizontal: 38 },
  centeredError: { maxWidth: 420 },
  syncPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    flexShrink: 0,
    height: 26,
    paddingLeft: 8,
    paddingRight: 11,
    borderRadius: radius.pill,
    backgroundColor: colors.background.subtle
  },
  syncPillCompact: { width: 26, justifyContent: "center", paddingLeft: 0, paddingRight: 0 },
  syncText: { ...sans(600), fontSize: type.fieldLabel, color: colors.text.note },
  sectionTitle: {
    ...sans(700),
    fontSize: type.title,
    letterSpacing: tracked.title,
    color: colors.text.primary
  },
  accent: { color: colors.text.accent },
  accentHover: { color: colors.text.primary },

  // "To follow up", mobile: a card (`padding: 2px 16px`, its rows' own: cardInset, CARD_EDGE), 50
  // px rows, clipped to its corners.
  card: {
    backgroundColor: colors.background.surface,
    borderRadius: radius.lg,
    overflow: "hidden",
    boxShadow: shadow.card
  },
  followUpRow: {
    height: 50,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderBottomWidth: 1
  },
  // The room between the pill and the total, never narrower than its figures ("12" would break on
  // two lines when the pill took the row): the pill's label ends in "…" first.
  followUpCount: {
    ...mono(700),
    flexGrow: 1,
    flexShrink: 0,
    fontSize: type.caption,
    color: colors.text.secondary
  },
  followUpTotalBox: { flexShrink: 0 },
  followUpTotal: {
    ...sans(700),
    flexShrink: 0,
    fontSize: 15,
    fontVariant: ["tabular-nums"],
    color: colors.text.primary
  },
  followUpSign: { width: 12, height: 14 },
  followUpGlyph: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center" },

  // "To follow up", desktop: tiles (`padding: 16px 18px`), a ring when chosen.
  tiles: { flexDirection: "row", gap: 14 },
  tile: { flex: 1, minWidth: 0 },
  // Fills its tile, stretched to the row's tallest: every card (and its ring) one height.
  tileCard: {
    flexGrow: 1,
    backgroundColor: colors.background.surface,
    borderRadius: radius.lg,
    paddingVertical: 16,
    paddingHorizontal: 18,
    boxShadow: shadow.card
  },
  tileHovered: { backgroundColor: colors.background.app },
  tileRing: {
    position: "absolute",
    top: -1.5,
    left: -1.5,
    right: -1.5,
    bottom: -1.5,
    borderRadius: radius.xl,
    borderWidth: 1.5,
    borderColor: palette.orange
  },
  tileHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10
  },
  // Never narrower than its figures: a pill too long for the tile ends in "…" (StatusPill).
  tileCount: { ...mono(700), flexShrink: 0, fontSize: 13, color: colors.text.secondary },
  // Its own place, as wide as the total: the glyphs of the discreet mode (Masked) cover it alone.
  tileTotalBox: { marginTop: 14, alignSelf: "flex-start", maxWidth: "100%" },
  tileTotal: {
    ...sans(700),
    fontSize: 20,
    fontVariant: ["tabular-nums"],
    color: colors.text.primary
  },

  listTitle: { justifyContent: "center", minWidth: 0 },
  // The title and, while the wallet syncs, its pill (SyncStatus): a title too long ("Unterbezahlte
  // Rechnungen" at 360 pt) gives way, the pill never does.
  titleRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  // Its width bounded, so that the title gives way; in a row, `stacked`'s centring would centre it.
  stackedRow: { right: 0, justifyContent: "flex-start" },
  crumbClear: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 44 },
  breadcrumb: {
    flexDirection: "row",
    alignItems: "center",
    height: DESKTOP_TITLE_ROW,
    minWidth: 0
  },
  crumb: { overflow: "hidden", alignSelf: "stretch" },
  crumbInner: {
    position: "absolute",
    top: 0,
    left: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingLeft: 12
  },
  // The crumb's own 12 px (crumbInner) after "All transactions".
  crumbSync: { paddingLeft: 12 },

  empty: {
    ...sans(500),
    paddingTop: 22,
    fontSize: type.prose,
    color: colors.text.secondary
  },
  // In the table's card: 22 px below too (the card has no padding under its body).
  emptyDesktop: { paddingHorizontal: 22, paddingBottom: 22 },
  // Under the list's title, as the text it replaces.
  emptyGuide: { paddingTop: space[2], paddingBottom: space[5] },
  emptyGuideDesktop: { paddingTop: 24, paddingHorizontal: 22, paddingBottom: 28 },
  loadingDesktop: { alignItems: "center", paddingVertical: 22 },
  // Each day of the list over the one before it (20 between the cards' days), the first under the
  // list's title; inside its fold, which takes it along as it folds.
  firstDay: { paddingTop: space[5] },
  nextDay: { paddingTop: space[7] },
  shrink: { flexShrink: 1, minWidth: 0 },
  signedSats: { flexDirection: "row", alignItems: "baseline" },
  sign: { ...mono(700), color: colors.text.primary },

  // Desktop table (in a TableCard as "Employees"'): 52 px rows.
  flexCell: { flex: 1, minWidth: 0 },
  cellMuted: {
    ...sans(500),
    fontSize: 13,
    fontVariant: ["tabular-nums"],
    color: colors.text.secondary
  },
  cellMutedText: {
    ...sans(500),
    flexShrink: 1,
    fontSize: type.label,
    letterSpacing: tracked.label,
    color: colors.text.secondary
  },
  cellTitle: {
    ...sans(600),
    fontSize: 14.5,
    color: colors.text.primary
  },
  cellSource: { flexDirection: "row", alignItems: "center", gap: 8 },
  cellBy: { flexDirection: "row", alignItems: "center", gap: 8 },
  cellState: { flexDirection: "row" },
  cellAmounts: { alignItems: "flex-end", gap: 1, minWidth: 0 },

  sheetScroll: { flexGrow: 0, flexShrink: 1 },
  sheetScrollBox: { flexGrow: 0, flexShrink: 1, minHeight: 0 },
  sheetPill: { flexDirection: "row" },
  detailTitle: {
    ...sans(700),
    marginTop: 6,
    fontSize: type.title,
    letterSpacing: tracked.title,
    color: colors.text.primary
  },
  // Its own place, as wide as the amount: the glyphs of the discreet mode (Masked) cover it alone.
  detailAmountBox: { marginTop: 22, alignSelf: "flex-start", maxWidth: "100%" },
  detailAmount: {
    ...sans(700),
    fontSize: 40,
    letterSpacing: tracking(AMOUNT_EM, 40),
    lineHeight: 40,
    fontVariant: ["tabular-nums"],
    color: colors.text.primary
  },
  detailSats: { marginTop: 10, flexDirection: "row" },
  detailSatsAlone: { marginTop: 22 },
  // Under the sats written first: the value, unsigned, in grey ("Currency shown first").
  detailValueUnder: { marginTop: 10, alignSelf: "flex-start", maxWidth: "100%" },
  detailValueSmall: {
    ...sans(600),
    fontSize: 14.5,
    fontVariant: ["tabular-nums"],
    color: colors.text.secondary
  },
  detailRows: { marginTop: 28 },
  // A sale to Mt Pelerin (SaleSection): its title, then its card, in the sheet's sand.
  sale: { marginTop: 22 },
  saleTitle: {
    ...sans(700),
    marginBottom: 8,
    fontSize: 12,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: colors.text.secondary
  },
  saleCard: {
    borderRadius: SALE_CARD_RADIUS,
    backgroundColor: colors.background.subtle,
    overflow: "hidden"
  },
  saleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
    minHeight: 48,
    paddingVertical: 13
  },
  saleRowInset: { paddingHorizontal: SALE_CARD_INSET },
  saleRowDivided: { borderTopWidth: 1, borderTopColor: colors.border.faint },
  saleLabel: { ...sans(500), flexShrink: 0, fontSize: 13.5, color: colors.text.secondary },
  saleValue: { flexShrink: 1, alignItems: "flex-end", gap: 3 },
  saleValueText: { ...sans(600), fontSize: 14.5, textAlign: "right", color: colors.text.primary },
  saleDetail: { ...sans(500), fontSize: 12.5, textAlign: "right", color: colors.text.secondary },
  saleDetailMono: { ...mono(500), fontSize: 13 },
  saleOrder: { ...mono(600), fontSize: 14, color: colors.text.primary },
  saleFollow: { flexDirection: "row", alignItems: "center", gap: 6 },
  saleFollowText: { ...sans(700), fontSize: 13, color: colors.text.accent },
  // The callout of a sale paid, not in the balance yet, where its warning would be.
  detailCallout: { marginTop: 22 },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    minHeight: 52,
    borderTopWidth: 1,
    borderTopColor: colors.border.subtle
  },
  // The longest label ("Commissioni", "Riferimento") on one line on a phone.
  detailLabel: { ...sans(500), width: 120, fontSize: 13.5, color: colors.text.secondary },
  // A value of several lines (the recipient's address): the label on its first line.
  detailRowTop: { alignItems: "flex-start", paddingVertical: 15 },
  detailLabelTop: { lineHeight: 22 },
  detailCell: { flex: 1, minWidth: 0, flexDirection: "row" },
  detailValue: { ...sans(600), flexShrink: 1, fontSize: 14.5, color: colors.text.primary },
  detailNetwork: { flexDirection: "row", alignItems: "center", gap: 8 },
  detailBy: { flexDirection: "row", alignItems: "center", gap: 10, flexShrink: 1, minWidth: 0 },
  netIcon: { width: 14 },
  reference: { flexDirection: "row", alignItems: "center", gap: 12 },
  copy: { marginLeft: -12, marginRight: -15 },
  // Centred on a first line of 22 px: its 44 px target over the row's padding.
  copyTop: { marginVertical: -11 },
  referenceText: { ...sans(600), fontSize: 14.5, color: colors.text.primary },
  recipient: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "flex-start", gap: 12 },
  recipientText: { flex: 1, lineHeight: 22 },
  feeStack: { flexShrink: 1, gap: 3 },
  feeUnder: {
    ...sans(600),
    fontSize: 12.5,
    fontVariant: ["tabular-nums"],
    color: colors.text.secondary
  },
  // The row's own height: a 44 px target.
  linkPage: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 44, flexShrink: 1 },

  // An employee's identity.
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.orange
  },
  initials: {
    ...sans(700),
    fontSize: 15,
    color: colors.text.onAccent
  },
  identity: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingTop: 6,
    paddingBottom: 18,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle
  },
  identityText: { flex: 1, minWidth: 0, gap: 4 },
  identityName: {
    ...sans(700),
    fontSize: 16,
    color: colors.text.primary
  },
  identityDesktop: { flexDirection: "row", alignItems: "center", gap: 12 },
  identityDesktopText: { alignItems: "flex-end", gap: 4 },
  identityNameDesktop: {
    ...sans(700),
    fontSize: 15,
    color: colors.text.primary
  },
  limited: { flexDirection: "row", alignItems: "center", gap: 7 },
  limitedRight: { justifyContent: "flex-end" },
  limitedText: { ...sans(500), fontSize: 13, color: colors.text.secondary }
}));
