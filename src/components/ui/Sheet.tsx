import { useCallback, useEffect, useRef, useState, type ComponentRef, type ReactNode } from "react";
import {
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import Animated, {
  clamp,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useIsDesktop } from "@/components/layout/useIsDesktop";
import {
  gutter,
  makeStyles,
  radius,
  sans,
  space,
  type ThemeColors,
  tracked,
  type,
  useTheme
} from "@/theme";

import { SHEET_EASING } from "./easing";
import { IconButton } from "./IconButton";
import { ProgressDots } from "./ProgressDots";
import { DIALOG_EASING, DIALOG_RISE, OverlayModal, Scrim, useOverlay } from "./overlay";
import { outOfReach } from "./reach";
import { RichText } from "./RichText";
import { useSheetLayout } from "./sheet-layout";
import {
  PAGE_TRANSITION,
  SheetPages,
  SheetPagesContext,
  usePageFade,
  useSwap,
  type SheetPageKey
} from "./sheet-pages";

// Mobile: the sheet decelerates into place like the iOS sheets (SHEET_EASING), and accelerates on
// its way out. Desktop: the dialog fades in while rising (DIALOG_RISE), and sinks back as it fades
// out.
const DIALOG_WIDTH = 440;
/** The dialog's horizontal padding (desktop); the bottom sheet's is the screen's gutter. */
const DIALOG_INSET = 24;
/** The dialog's most height (desktop), unless it asks for more (`dialogMaxHeight`). */
const DIALOG_MAX_HEIGHT = 640;
/** Between the panel's header and the sheet's children, and between those children. */
export const SHEET_GAP = space[5];
/** The panel's title as drawn: what a header's action measures it with ("New integration"). */
export const SHEET_TITLE_FONT = {
  ...sans(700),
  fontSize: type.title,
  letterSpacing: tracked.title
} satisfies TextStyle;

type SheetProps = {
  title: string;
  /**
   * Whether `title` carries RichText's spans ("Top up Daily": the card's name in orange).
   * Off by default. A value typed by a user goes in through `escapeRichText`: shown as it is.
   */
  titleMarkup?: boolean;
  /** Under the title, what the panel is of ("Payments without confirmation": "Card Daily"). */
  subtitle?: string;
  /**
   * The subtitle's tone: what it says may turn to a warning or an alarm ("Card payment":
   * "Answer within 9 s", "Time is up").
   */
  subtitleTone?: "secondary" | "warning" | "danger";
  /** Accessible name of the close button and of the scrim. */
  closeLabel: string;
  visible: boolean;
  onClose: () => void;
  /** Mounted while the sheet shows: their state starts afresh at each opening. */
  children: ReactNode;
  /**
   * False while the panel must stay (a payment being sent): its close button and its `back` are
   * shown disabled (the whole panel disabled while a payment is sent, the
   * cross included, rather than gone), and neither the scrim nor the system's back closes it.
   */
  dismissible?: boolean;
  /** Desktop: the dialog's width, 440 by default ("Send" takes 560). */
  dialogWidth?: number;
  /**
   * Desktop: the dialog's most height, for a dialog that says more than 640 (DIALOG_MAX_HEIGHT)
   * allows ("Invite an employee"), or whose content may outgrow any window ("Nostr relays",
   * 640 still). Such a dialog also shrinks to the room it is left, by the
   * window and by the keyboard (an iPad's, its layout a computer's): its content must then scroll
   * within it (a ScrollView that may shrink). Without it, 640, and the dialog never shrinks.
   */
  dialogMaxHeight?: number;
  /** Drawn in the header, before the close button ("Scan" of "New item"). */
  headerAction?: ReactNode;
  /**
   * A step back inside the panel, an arrow before the title ("New integration": from a
   * guide to its list). Not the system's back, which closes the panel as its close button does.
   */
  back?: { label: string; onPress: () => void };
  /**
   * A panel shown over this one, in a Modal of its own nested in this one's ("Frame the image"
   * over "Customize"): iOS presents a Modal only from the one presented last, so one opened
   * beside this one while it leaves would never show. Meanwhile this panel stays as it is, out of
   * reach, its keyboard closed.
   */
  over?: ReactNode;
  /**
   * A path of steps inside the panel ("Sell"'s three steps): their dots under the title, both
   * centred between the back arrow and the actions.
   */
  steps?: { count: number; current: number };
  /** The title (and `steps`) centred between the header's ends, without steps too. */
  centered?: boolean;
  /**
   * Once the panel is out of sight after closing (its exit animation done): a caller that shows it
   * as another panel's `over` takes it away then, not before, or it would leave without moving.
   */
  onHidden?: () => void;
  /**
   * The page shown, for a panel that goes from one to another ("Sell": its steps, then each
   * page pushed over the sale). At a change, the header stays (the steps' dots move), the page left
   * fades out, the new one fades in, mounted afresh, and the panel takes its new height. Without it, the content changes in place, its state kept.
   */
  page?: SheetPageKey;
  /** Of the panel. */
  testID?: string;
};

/**
 * The panel's horizontal padding: a list whose rows are pressed up to the panel's edges leaves it
 * out (`marginHorizontal: -inset`), and its rows take it back (ListRow's `inset`).
 */
export function useSheetInset(): number {
  return useIsDesktop() ? DIALOG_INSET : gutter;
}

/**
 * A titled panel over the screen: a bottom sheet that slides up on mobile, a centred dialog that
 * fades in while rising slightly on desktop. With Reduce Motion, both only fade. Its height
 * follows a change of its content smoothly (sheet-layout.ts; on the web, sheet-layout.web.ts), and
 * its pages fade into each other (`page`, SheetPages deeper in its content).
 */
export function Sheet({
  title,
  titleMarkup = false,
  subtitle,
  subtitleTone = "secondary",
  closeLabel,
  visible,
  onClose,
  children,
  dismissible = true,
  dialogWidth = DIALOG_WIDTH,
  dialogMaxHeight,
  headerAction,
  back,
  over,
  onHidden,
  steps,
  centered = steps !== undefined,
  page,
  testID
}: SheetProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  const close = dismissible ? onClose : () => undefined;
  const covered = over !== undefined && over !== null;
  const desktop = useIsDesktop();
  const insets = useSafeAreaInsets();
  const dialogHeight =
    dialogMaxHeight === undefined ? null : { maxHeight: dialogMaxHeight, flexShrink: 1 };
  const reduceMotion = useReducedMotion();
  const panel = useRef<ComponentRef<typeof View>>(null);
  const layout = useSheetLayout(panel);
  // The sheet travels its own height; it stays transparent until it has been measured. A shared
  // value: the height follows the keyboard frame by frame, which must not re-render the sheet.
  const height = useSharedValue(0);
  const [measured, setMeasured] = useState(false);
  // Outlives `visible` by the exit animation: the modal closes once the panel is out of sight.
  const { mounted, progress } = useOverlay(
    visible,
    desktop ? DIALOG_EASING : SHEET_EASING,
    measured,
    undefined,
    onHidden
  );
  // Measured again at the next opening.
  if (!mounted && measured) setMeasured(false);
  // A page changing (SheetPages, here or deeper in the content): the panel clipped meanwhile.
  const [pageChanges, setPageChanges] = useState(0);
  const pageChanged = useCallback(() => setPageChanges((count) => count + 1), []);
  useEffect(() => {
    if (pageChanges === 0) return;
    const timer = setTimeout(() => setPageChanges(0), PAGE_TRANSITION);
    return () => clearTimeout(timer);
  }, [pageChanges]);
  // Mobile: the sheet's bottom padding, the safe area (home indicator, navigation bar) and its
  // margin. With the keyboard open, its margin alone stays above the keyboard: the keyboard
  // covers the safe area, which the avoiding view leaves under it (see
  // keyboardVerticalOffset below), so the sheet's last element is space[5] above the keyboard.
  const sheetBottom = insets.bottom + space[5];
  const keyboardOffset = desktop ? 0 : -insets.bottom;

  useEffect(() => {
    if ((mounted && !visible) || covered) Keyboard.dismiss();
  }, [mounted, visible, covered]);

  // With Reduce Motion, the panel still fades: only movement is dropped. Clamped: on the web, the
  // first frame of an animation can come out slightly below 0.
  const panelStyle = useAnimatedStyle(() => {
    const shown = clamp(progress.get(), 0, 1);
    if (reduceMotion) return { opacity: shown };
    if (desktop) return { opacity: shown, transform: [{ translateY: (1 - shown) * DIALOG_RISE }] };
    return { opacity: measured ? 1 : 0, transform: [{ translateY: (1 - shown) * height.get() }] };
  }, [reduceMotion, desktop, measured]);

  return (
    <OverlayModal mounted={mounted} visible={visible} onRequestClose={close}>
      <Scrim progress={progress} />
      {/* Neither iOS nor Android (edge-to-edge) resizes a modal for the keyboard: without this, a
          search field and the few results of a query slide under the keyboard as the bottom sheet
          shrinks. On Android, React Native's keyboard events come from the activity's root view,
          not from the Modal's own window; react-native-keyboard-controller also follows Modal
          windows (KeyboardProvider, root layout). On the web, there is no keyboard to follow.
          Mobile: the keyboard's height includes the safe area at the screen's bottom (iOS's
          keyboard frame, Android's IME inset with edge-to-edge), so the avoiding view rises that
          much less than the keyboard, at every frame of its movement: the sheet's margin stays
          above the keyboard, its safe area under it. */}
      <KeyboardAvoidingView
        behavior="padding"
        keyboardVerticalOffset={keyboardOffset}
        style={[styles.layer, { pointerEvents: visible ? "auto" : "none" }]}
      >
        {/* The avoiding view always sets its bottom padding (0 without a keyboard), which would
            override the layer's own: that one goes on this inner view. */}
        {/* Its accessibility follows `over` while the Modal shows: never flattened by Fabric, or
            the change would insert a view (Android: addViewAt failed). */}
        <View
          {...outOfReach(covered)}
          collapsable={false}
          style={[styles.layer, desktop ? styles.layerCentered : styles.layerBottom]}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            accessibilityLabel={dismissible ? closeLabel : undefined}
            accessible={dismissible}
            onPress={close}
          />
          {/* Clipped while a page changes: neither the page left nor the new one shows outside the
              panel as its height eases. Never flattened by Fabric (Android: addViewAt failed). */}
          <Animated.View
            ref={panel}
            testID={testID}
            collapsable={false}
            layout={layout}
            onLayout={(event) => {
              const measuredHeight = event.nativeEvent.layout.height;
              height.set(measuredHeight);
              if (measuredHeight > 0 && !measured) setMeasured(true);
            }}
            style={[
              styles.panel,
              desktop
                ? [styles.dialog, { maxWidth: dialogWidth }, dialogHeight]
                : [styles.sheet, { paddingBottom: sheetBottom }],
              pageChanges > 0 && styles.clipped,
              panelStyle
            ]}
          >
            {centered ? (
              <CenteredHeader
                title={title}
                titleMarkup={titleMarkup}
                steps={steps}
                back={back}
                headerAction={headerAction}
                closeLabel={closeLabel}
                onClose={onClose}
                dismissible={dismissible}
              />
            ) : (
              <View style={styles.header}>
                {back ? (
                  <IconButton
                    icon="arrow-left"
                    label={back.label}
                    overhang="left"
                    onPress={back.onPress}
                    disabled={!dismissible}
                    testID="sheet-back"
                  />
                ) : null}
                {/* One view with or without its subtitle: the title fades from one to the next. */}
                <View style={[styles.titles, back && styles.titleAfterBack]}>
                  <SheetTitle
                    title={title}
                    markup={titleMarkup}
                    centered={false}
                    style={styles.title}
                  />
                  {subtitle ? (
                    <Text
                      style={[styles.subtitle, subtitleTones(colors)[subtitleTone]]}
                      testID="sheet-subtitle"
                    >
                      {subtitle}
                    </Text>
                  ) : null}
                </View>
                {headerAction ? <View style={styles.headerAction}>{headerAction}</View> : null}
                <IconButton
                  icon="xmark"
                  label={closeLabel}
                  overhang="right"
                  onPress={onClose}
                  disabled={!dismissible}
                />
              </View>
            )}
            <SheetPagesContext.Provider value={pageChanged}>
              <SheetPages page={page ?? 0} style={styles.pages}>
                {children}
              </SheetPages>
            </SheetPagesContext.Provider>
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
      {over}
    </OverlayModal>
  );
}

/**
 * The header with its title in the middle: the back arrow (or nothing) on the left, the actions and
 * the close button on the right, both ends as wide so that the title stays centred.
 */
function CenteredHeader({
  title,
  titleMarkup,
  steps,
  back,
  headerAction,
  closeLabel,
  onClose,
  dismissible
}: Pick<
  SheetProps,
  "title" | "titleMarkup" | "steps" | "back" | "headerAction" | "closeLabel" | "onClose"
> & { dismissible: boolean }) {
  const styles = useStyles();
  return (
    <View style={styles.header}>
      <View style={styles.headerEnd}>
        {back ? (
          <IconButton
            icon="arrow-left"
            label={back.label}
            overhang="left"
            onPress={back.onPress}
            disabled={!dismissible}
            testID="sheet-back"
          />
        ) : null}
      </View>
      <View style={styles.centeredTitles}>
        <SheetTitle
          title={title}
          markup={titleMarkup ?? false}
          centered
          style={[styles.title, styles.centeredTitle]}
        />
        {steps ? <ProgressDots count={steps.count} current={steps.current} /> : null}
      </View>
      <View style={[styles.headerEnd, styles.headerEndRight]}>
        {headerAction}
        <IconButton
          icon="xmark"
          label={closeLabel}
          overhang="right"
          onPress={onClose}
          disabled={!dismissible}
          testID="sheet-close"
        />
      </View>
    </View>
  );
}

/**
 * The panel's title. A new one fades in as the one before fades out over it, at its place and its
 * width, as the panel's pages do (sheet-pages.tsx); the one before
 * is out of reach, the new one the panel's header at once.
 */
function SheetTitle({
  title,
  markup,
  centered,
  style
}: {
  title: string;
  markup: boolean;
  centered: boolean;
  style: StyleProp<TextStyle>;
}) {
  const titles = useSwap(title, title);
  const Title = markup ? RichText : Text;
  return (
    <View collapsable={false}>
      {titles.map((entry) => (
        <TitleView key={entry.id} enters={entry.id > 0} leaving={entry.leaving} centered={centered}>
          <Title accessibilityRole={entry.leaving ? undefined : "header"} style={style}>
            {entry.value}
          </Title>
        </TitleView>
      ))}
    </View>
  );
}

/** A title: shown, in its place; left, over the new one at the width it had, fading out. */
function TitleView({
  enters,
  leaving,
  centered,
  children
}: {
  enters: boolean;
  leaving: boolean;
  centered: boolean;
  children: ReactNode;
}) {
  const styles = useStyles();
  const fade = usePageFade(enters, leaving);
  const [measured, setMeasured] = useState<number | null>(null);
  // A pixel more than measured: on the web, a layout's width is rounded to a whole pixel
  // (react-native-web 0.21 reads offsetWidth), so "Limits", 82.09 px wide, measured 82, broke
  // onto a second line as it faded. A title on several lines keeps
  // them: no word fits in the pixel and a half at most added.
  const width = measured === null ? null : measured + 1;
  const left: ViewStyle =
    width === null
      ? styles.titleLeft
      : centered
        ? { ...styles.titleLeft, right: undefined, width, left: "50%", marginLeft: -width / 2 }
        : { ...styles.titleLeft, right: undefined, width };
  return (
    // Its props change while the Modal shows: never flattened by Fabric (Android: addViewAt
    // failed).
    <Animated.View
      collapsable={false}
      {...outOfReach(leaving)}
      onLayout={(event) => {
        if (leaving) return;
        const next = event.nativeEvent.layout.width;
        if (next !== measured) setMeasured(next);
      }}
      style={[leaving ? left : styles.titleShown, fade]}
    >
      {children}
    </Animated.View>
  );
}

/** The subtitle's colour by tone: readable on the panel's surface (warning and danger inks). */
function subtitleTones(colors: ThemeColors) {
  return {
    secondary: { color: colors.text.secondary },
    warning: { color: colors.warning.fg },
    danger: { color: colors.danger.fg }
  } as const;
}

const useStyles = makeStyles(({ colors, shadow }) => ({
  layer: { flex: 1 },
  layerBottom: { justifyContent: "flex-end" },
  layerCentered: { justifyContent: "center", alignItems: "center", padding: space[7] },
  panel: { backgroundColor: colors.background.surface, gap: SHEET_GAP },
  sheet: {
    maxHeight: "85%",
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingTop: space[5],
    paddingHorizontal: gutter
  },
  dialog: {
    width: "100%",
    maxHeight: DIALOG_MAX_HEIGHT,
    borderRadius: radius.lg,
    boxShadow: shadow.card,
    paddingTop: space[5],
    paddingBottom: space[7],
    paddingHorizontal: DIALOG_INSET
  },
  clipped: { overflow: "hidden" },
  // The children laid out as the panel's own, with its gap.
  pages: { gap: SHEET_GAP },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerAction: { marginLeft: "auto", marginRight: space[2] },
  title: { ...SHEET_TITLE_FONT, flexShrink: 1, color: colors.text.primary },
  titles: { flexShrink: 1 },
  subtitle: { ...sans(500), fontSize: type.caption, color: colors.text.secondary },
  headerEnd: { flex: 1, flexBasis: 0, flexDirection: "row", alignItems: "center" },
  headerEndRight: { justifyContent: "flex-end", gap: space[2] },
  centeredTitles: { flexShrink: 1, alignItems: "center", gap: space[2] },
  centeredTitle: { textAlign: "center" },
  titleShown: { pointerEvents: "auto" },
  titleLeft: { position: "absolute", top: 0, left: 0, right: 0, pointerEvents: "none" },
  // After the back arrow, the title takes the room up to the close button.
  titleAfterBack: { flex: 1, marginLeft: space[2] }
}));
