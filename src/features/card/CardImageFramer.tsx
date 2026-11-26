import type { TFunction } from "i18next";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Image,
  Platform,
  StyleSheet,
  Text,
  View,
  type AccessibilityActionEvent,
  type GestureResponderEvent,
  type KeyDownEvent,
  type LayoutRectangle,
  type NativeTouchEvent,
  type ViewStyle
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { IconButton } from "@/components/ui/IconButton";
import { OverlayModal } from "@/components/ui/overlay";
import type { CardImageSource } from "@/features/media/card-image";
import { cardJpeg } from "@/features/media/pick-image";
import { usePos } from "@/features/terminal/pos";
import { formatPercent } from "@/lib/locale/format";
import { logFailure } from "@/lib/log/log";
import {
  gutter,
  makeStyles,
  palette,
  radius,
  sans,
  space,
  TITLE_EM,
  tracking,
  type
} from "@/theme";

import { CARD_ASPECT, CARD_FACE } from "./card-look";
import {
  CENTRED,
  MAX_ZOOM,
  MIN_ZOOM,
  ZOOM_STEP,
  clampFraming,
  coverScale,
  cropOf,
  inkOverCrop,
  zoomTo,
  type Framing
} from "./image-frame";

/*
 * "Frame the image" (a framing common to the imported images, at the card's shape; the name over it
 * in black or in white by how light the image is where it goes): the image over the whole screen of
 * ink, dimmed but under a window of the card's shape, which it always covers. A finger moves it
 * (the mouse on the web), two pinch it (the wheel on the web), "Zoom in" and "Zoom out" zoom it a
 * step; without dragging, a screen reader's actions move it in the apps, the arrow keys on the web.
 * The card's name is written in the window in the ink it will take (no line explaining it). "Use
 * this image" gives the part the window shows, as the card's JPEG (cardJpeg), with that ink. On a
 * desktop, the same framing in the panel's dialog (CardImageFramerDialog).
 */

/** The window's margin on each side (30 px of a 390 px screen), and its widest. */
const WINDOW_MARGIN = 30;
const MAX_WINDOW_WIDTH = 420;
/** The wheel's zoom: a notch of a mouse (100 px of `deltaY`) is a step of the buttons. */
const WHEEL_ZOOM = ZOOM_STEP / 100;
/** A step of the image moved by a screen reader's action or a key: a tenth of the window's width. */
const MOVE_STEP = 0.1;

/** The image moved without dragging, a step each way. */
const MOVES = {
  moveLeft: [-1, 0],
  moveRight: [1, 0],
  moveUp: [0, -1],
  moveDown: [0, 1]
} as const;
type Adjustment = keyof typeof MOVES | "increment" | "decrement";
const MOVE_NAMES = Object.keys(MOVES) as (keyof typeof MOVES)[];
/** The actions a screen reader may ask, by their names (nothing else is acted on). */
const ADJUSTMENTS: readonly Adjustment[] = ["increment", "decrement", ...MOVE_NAMES];

/** The web's keys: the arrows move the image, + and - zoom it. */
const KEYS: ReadonlyMap<string, Adjustment> = new Map([
  ["ArrowLeft", "moveLeft"],
  ["ArrowRight", "moveRight"],
  ["ArrowUp", "moveUp"],
  ["ArrowDown", "moveDown"],
  ["+", "increment"],
  ["=", "increment"],
  ["-", "decrement"]
]);

/** What "Use this image" gives: the card's JPEG, and the ink of its name over it. */
export type FramedImage = { bytes: Uint8Array; ink: "dark" | "light" };

/** Where the fingers went down, and the framing then: what the gesture moves from. */
type Touch =
  | { kind: "drag"; x: number; y: number; from: Framing }
  | { kind: "pinch"; distance: number; from: Framing };

type Size = { width: number; height: number };

function distanceOf(touches: readonly NativeTouchEvent[]): number {
  const [a, b] = touches;
  return a && b ? Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY) : 0;
}

/**
 * The framing of `source` in a window of `window`'s size (null: not laid out yet, nothing moves):
 * what the phone's screen and the desktop's dialog share. The gestures, the web's wheel and keys
 * and a screen reader's actions move it; `use` makes the card's JPEG of the part shown.
 */
function useFraming(
  source: CardImageSource,
  window: Size | null,
  onUse: (framed: FramedImage) => void
) {
  const image = { width: source.width, height: source.height };
  const [framing, setFraming] = useState<Framing>(CENTRED);
  const [making, setMaking] = useState(false);
  const [failed, setFailed] = useState(false);
  // The gesture under way: read by the responder's handlers only.
  const touch = useRef<Touch | null>(null);

  const shown = window ? clampFraming(image, window, framing) : CENTRED;
  const crop = window ? cropOf(image, window, shown) : null;
  const ink = crop ? inkOverCrop(image, source.light, crop) : "dark";

  // The part shown is being made into the card's image: it stays as it is.
  const move = (next: Framing) => {
    if (!making && window) setFraming(clampFraming(image, window, next));
  };
  /** The zoom at `to`, as far as it goes, about the window's middle. */
  const zoomAt = (to: number) => {
    if (window) move(zoomTo(image, window, shown, to));
  };
  const zoom = (by: number) => zoomAt(shown.zoom + by);
  /** A step of zoom (a screen reader's swipe up or down), or of the image one way. */
  const adjust = (adjustment: Adjustment) => {
    if (adjustment === "increment" || adjustment === "decrement") {
      zoom(adjustment === "increment" ? ZOOM_STEP : -ZOOM_STEP);
      return;
    }
    if (!window) return;
    const [across, down] = MOVES[adjustment];
    const step = window.width * MOVE_STEP;
    move({ ...shown, x: shown.x + across * step, y: shown.y + down * step });
  };

  const gesture = {
    onStartShouldSetResponder: () => true,
    onMoveShouldSetResponder: () => true,
    // Once the image follows a finger, nothing else takes it back.
    onResponderTerminationRequest: () => false,
    onResponderGrant: (event: GestureResponderEvent) => {
      const { touches, pageX, pageY } = event.nativeEvent;
      touch.current =
        touches.length >= 2
          ? { kind: "pinch", distance: distanceOf(touches), from: shown }
          : { kind: "drag", x: pageX, y: pageY, from: shown };
    },
    onResponderMove: (event: GestureResponderEvent) => {
      const { touches, pageX, pageY } = event.nativeEvent;
      const current = touch.current;
      if (!current || !window) return;
      if (touches.length >= 2) {
        // A second finger came down: the pinch starts from there.
        if (current.kind !== "pinch") {
          touch.current = { kind: "pinch", distance: distanceOf(touches), from: shown };
          return;
        }
        if (current.distance > 0) {
          const scaled = current.from.zoom * (distanceOf(touches) / current.distance);
          move(zoomTo(image, window, current.from, scaled));
        }
        return;
      }
      // One finger left of two: it moves the image from where it is now.
      if (current.kind !== "drag") {
        touch.current = { kind: "drag", x: pageX, y: pageY, from: shown };
        return;
      }
      move({
        ...current.from,
        x: current.from.x + pageX - current.x,
        y: current.from.y + pageY - current.y
      });
    },
    onResponderRelease: () => {
      touch.current = null;
    },
    onResponderTerminate: () => {
      touch.current = null;
    }
  };
  // The web's wheel zooms (react-native-web hands a View its `onWheel`). The keys: an adjustable
  // view is neither a tab stop there nor keyboard-operable (its accessibility actions are native
  // only); react-native-web forwards `onKeyDown` to the element, whose React event carries the
  // browser's in `nativeEvent` (as SplitBar.tsx).
  const web =
    Platform.OS === "web"
      ? {
          onWheel: (event: { deltaY: number }) => zoom(-event.deltaY * WHEEL_ZOOM),
          tabIndex: 0 as const,
          onKeyDown: (event: KeyDownEvent) => {
            const adjustment = KEYS.get(event.nativeEvent.key);
            if (!adjustment) return;
            event.preventDefault();
            adjust(adjustment);
          }
        }
      : null;

  const use = () => {
    if (!crop || making) return;
    setMaking(true);
    setFailed(false);
    cardJpeg(source.image, crop).then(
      (bytes) => onUse({ bytes, ink }),
      (error: unknown) => {
        logFailure("A card's image could not be made", error);
        setMaking(false);
        setFailed(true);
      }
    );
  };

  // The image at its framing's scale, its middle moved from the window's.
  const scale = window ? coverScale(image, window) * shown.zoom : 0;
  return {
    shown,
    ink,
    ready: crop !== null,
    making,
    failed,
    zoom,
    zoomAt,
    adjust,
    gesture,
    web,
    use,
    shownImage: { width: image.width * scale, height: image.height * scale }
  };
}

/** The framed area's accessibility: adjustable, its zoom said, moved by a screen reader's actions. */
function frameAccessibility(
  t: TFunction,
  languageTag: string,
  zoom: number,
  adjust: (adjustment: Adjustment) => void
) {
  return {
    accessible: true,
    accessibilityRole: "adjustable" as const,
    accessibilityLabel: t("cards.frame.area"),
    accessibilityValue: {
      text: t("cards.frame.zoomValue", { zoom: formatPercent(Math.round(zoom * 100), languageTag) })
    },
    accessibilityActions: [
      { name: "increment" },
      { name: "decrement" },
      ...MOVE_NAMES.map((name) => ({ name, label: t(`cards.frame.${name}`) }))
    ],
    onAccessibilityAction: (event: AccessibilityActionEvent) => {
      const adjustment = ADJUSTMENTS.find((name) => name === event.nativeEvent.actionName);
      if (adjustment) adjust(adjustment);
    }
  };
}

/**
 * The framing of `source` (null: closed), the card's name `label` in its window. `onUse` once the
 * card's image is made of the part shown; `onCancel` leaves it, nothing made.
 */
export function CardImageFramer({
  source,
  label,
  onUse,
  onCancel
}: {
  source: CardImageSource | null;
  label: string;
  onUse: (framed: FramedImage) => void;
  onCancel: () => void;
}) {
  return source ? (
    <Framer key={source.uri} source={source} label={label} onUse={onUse} onCancel={onCancel} />
  ) : null;
}

function Framer({
  source,
  label,
  onUse,
  onCancel
}: {
  source: CardImageSource;
  label: string;
  onUse: (framed: FramedImage) => void;
  onCancel: () => void;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  const { languageTag } = usePos();
  const insets = useSafeAreaInsets();
  // The room the window has (its slot, between the texts and the buttons), once laid out.
  const [slot, setSlot] = useState<LayoutRectangle | null>(null);
  const windowWidth = slot
    ? Math.max(
        1,
        Math.min(
          MAX_WINDOW_WIDTH,
          slot.width - 2 * WINDOW_MARGIN,
          (slot.height - 2 * space[6]) * CARD_ASPECT
        )
      )
    : 0;
  const window = slot ? { width: windowWidth, height: windowWidth / CARD_ASPECT } : null;
  const framer = useFraming(source, window, onUse);
  const { shown, ink, making } = framer;

  const shownWidth = framer.shownImage.width;
  const shownHeight = framer.shownImage.height;
  const windowLeft = slot && window ? slot.x + (slot.width - window.width) / 2 : 0;
  const windowTop = slot && window ? slot.y + (slot.height - window.height) / 2 : 0;
  const face = windowWidth / CARD_FACE.width;
  const nameSize = CARD_FACE.nameSize * face;
  return (
    // The system's back leaves it, but while the image is being made from what it shows.
    <OverlayModal mounted visible onRequestClose={making ? () => undefined : onCancel}>
      <View style={styles.root} testID="card-frame">
        {slot && window ? (
          <View style={styles.stage} pointerEvents="none">
            <Image
              source={{ uri: source.uri }}
              resizeMode="stretch"
              accessibilityIgnoresInvertColors
              style={{
                position: "absolute",
                left: windowLeft + window.width / 2 - shownWidth / 2 + shown.x,
                top: windowTop + window.height / 2 - shownHeight / 2 + shown.y,
                width: shownWidth,
                height: shownHeight
              }}
              testID="card-frame-image"
            />
            <View
              style={[
                styles.window,
                {
                  left: windowLeft,
                  top: windowTop,
                  width: window.width,
                  height: window.height,
                  borderRadius: CARD_FACE.radius * face,
                  paddingTop: CARD_FACE.paddingTop * face,
                  paddingHorizontal: CARD_FACE.paddingSide * face
                }
              ]}
              testID="card-frame-window"
            >
              <Text
                numberOfLines={1}
                style={[
                  styles.name,
                  {
                    fontSize: nameSize,
                    color: ink === "dark" ? palette.ink : palette.white
                  }
                ]}
                testID="card-frame-name"
              >
                {label}
              </Text>
            </View>
          </View>
        ) : null}
        <View
          style={[
            styles.column,
            { paddingTop: insets.top, paddingBottom: insets.bottom + space[10] }
          ]}
        >
          <View style={styles.header}>
            <Text accessibilityRole="header" style={styles.title}>
              {t("cards.frame.title")}
            </Text>
          </View>
          <Text style={styles.hint}>
            {t(Platform.OS === "web" ? "cards.frame.hintWeb" : "cards.frame.hint")}
          </Text>
          <View
            style={styles.slot}
            onLayout={(event) => setSlot(event.nativeEvent.layout)}
            {...frameAccessibility(t, languageTag, shown.zoom, framer.adjust)}
            testID="card-frame-slot"
            {...framer.gesture}
            {...framer.web}
          />
          <View style={styles.zoom}>
            <IconButton
              icon="minus"
              tone="onDark"
              size={16}
              label={t("cards.frame.zoomOut")}
              disabled={shown.zoom <= MIN_ZOOM}
              onPress={() => framer.zoom(-ZOOM_STEP)}
              style={styles.zoomButton}
              testID="card-frame-zoom-out"
            />
            <IconButton
              icon="plus"
              tone="onDark"
              size={16}
              label={t("cards.frame.zoomIn")}
              disabled={shown.zoom >= MAX_ZOOM}
              onPress={() => framer.zoom(ZOOM_STEP)}
              style={styles.zoomButton}
              testID="card-frame-zoom-in"
            />
          </View>
          {framer.failed ? (
            <Callout tone="error" testID="card-frame-failed">
              {t("cards.customize.errors.unreadable")}
            </Callout>
          ) : null}
          <View style={styles.actions}>
            <Button
              loading={making}
              disabled={!framer.ready}
              onPress={framer.use}
              testID="card-frame-use"
            >
              {t("cards.frame.use")}
            </Button>
            <Button
              variant="textOnDark"
              size="md"
              disabled={making}
              onPress={onCancel}
              testID="card-frame-cancel"
            >
              {t("common.cancel")}
            </Button>
          </View>
        </View>
      </View>
    </OverlayModal>
  );
}

/** The desktop's window: 420 px wide, at the card's shape. */
const DIALOG_WINDOW: Size = { width: 420, height: 420 / CARD_ASPECT };
/** The slider's track between "Zoom out" and "Zoom in" (160 px), and its thumb. */
const SLIDER_WIDTH = 160;
const SLIDER_THUMB = 18;
/** The thumb, lifted off its track. */
const THUMB_SHADOW = "0px 1px 3px 0px rgba(11, 26, 51, 0.25)";
/** The pointer over what it moves (web only: React Native's types list no such cursor). */
const GRAB = Platform.OS === "web" ? ({ cursor: "grab" } as unknown as ViewStyle) : null;
const POINTER = Platform.OS === "web" ? ({ cursor: "pointer" } as unknown as ViewStyle) : null;

/**
 * "Frame the image" on a desktop: in the
 * panel's dialog, whose title and close button it takes (CardSheet.tsx), the image under a window
 * of the card's shape, which shows it alone (no dimmed image around it, as on the phone's screen).
 * The mouse moves it, the wheel zooms it, as do the buttons and the slider between them (a
 * pointer's: keyboards and screen readers have the buttons and the window's keys and actions).
 * The name is written as "Cards" draws a card's face, scaled, so that the ink decided for its place
 * is the one shown. `onBusy` while the card's
 * image is made: the dialog cannot close then.
 */
export function CardImageFramerDialog({
  source,
  label,
  onUse,
  onCancel,
  onBusy
}: {
  source: CardImageSource;
  label: string;
  onUse: (framed: FramedImage) => void;
  onCancel: () => void;
  onBusy: (busy: boolean) => void;
}) {
  return (
    <FramerDialog
      key={source.uri}
      source={source}
      label={label}
      onUse={onUse}
      onCancel={onCancel}
      onBusy={onBusy}
    />
  );
}

function FramerDialog({
  source,
  label,
  onUse,
  onCancel,
  onBusy
}: {
  source: CardImageSource;
  label: string;
  onUse: (framed: FramedImage) => void;
  onCancel: () => void;
  onBusy: (busy: boolean) => void;
}) {
  const styles = useStyles();
  const dialogStyles = useDialogStyles();
  const { t } = useTranslation();
  const { languageTag } = usePos();
  const window = DIALOG_WINDOW;
  const framer = useFraming(source, window, onUse);
  const { shown, ink, making } = framer;
  useEffect(() => {
    if (!making) return;
    onBusy(true);
    return () => onBusy(false);
  }, [making, onBusy]);
  const face = window.width / CARD_FACE.width;
  const nameSize = CARD_FACE.nameSize * face;
  const { width: shownWidth, height: shownHeight } = framer.shownImage;
  return (
    <View style={dialogStyles.content} testID="card-frame">
      <Text style={dialogStyles.hint}>{t("cards.frame.hintWeb")}</Text>
      <View
        style={[
          dialogStyles.window,
          GRAB,
          { width: window.width, height: window.height, borderRadius: CARD_FACE.radius * face }
        ]}
        {...frameAccessibility(t, languageTag, shown.zoom, framer.adjust)}
        testID="card-frame-slot"
        {...framer.gesture}
        {...framer.web}
      >
        {/* The pointer goes through to the window: the browser never drags the image itself. */}
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <Image
            source={{ uri: source.uri }}
            resizeMode="stretch"
            accessibilityIgnoresInvertColors
            style={{
              position: "absolute",
              left: window.width / 2 - shownWidth / 2 + shown.x,
              top: window.height / 2 - shownHeight / 2 + shown.y,
              width: shownWidth,
              height: shownHeight
            }}
            testID="card-frame-image"
          />
        </View>
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            {
              paddingTop: CARD_FACE.paddingTop * face,
              paddingHorizontal: CARD_FACE.paddingSide * face
            }
          ]}
        >
          <Text
            numberOfLines={1}
            style={[
              styles.name,
              {
                fontSize: nameSize,
                color: ink === "dark" ? palette.ink : palette.white
              }
            ]}
            testID="card-frame-name"
          >
            {label}
          </Text>
        </View>
      </View>
      <View style={dialogStyles.zoom}>
        <IconButton
          icon="minus"
          tone="outline"
          size={14}
          label={t("cards.frame.zoomOut")}
          disabled={shown.zoom <= MIN_ZOOM}
          onPress={() => framer.zoom(-ZOOM_STEP)}
          testID="card-frame-zoom-out"
        />
        <ZoomSlider zoom={shown.zoom} disabled={making} onZoom={framer.zoomAt} />
        <IconButton
          icon="plus"
          tone="outline"
          size={14}
          label={t("cards.frame.zoomIn")}
          disabled={shown.zoom >= MAX_ZOOM}
          onPress={() => framer.zoom(ZOOM_STEP)}
          testID="card-frame-zoom-in"
        />
      </View>
      {framer.failed ? (
        <Callout tone="error" testID="card-frame-failed">
          {t("cards.customize.errors.unreadable")}
        </Callout>
      ) : null}
      <View style={dialogStyles.actions}>
        <Button
          variant="secondary"
          size="sm"
          fullWidth={false}
          disabled={making}
          onPress={onCancel}
          style={dialogStyles.cancel}
          testID="card-frame-cancel"
        >
          {t("common.cancel")}
        </Button>
        <Button
          size="sm"
          fullWidth={false}
          loading={making}
          disabled={!framer.ready}
          onPress={framer.use}
          style={dialogStyles.use}
          testID="card-frame-use"
        >
          {t("cards.frame.use")}
        </Button>
      </View>
    </View>
  );
}

/**
 * The zoom between its buttons: its fill and thumb say it; a press on the track sets
 * it there, a drag moves it. A pointer's only, hidden from screen readers, which zoom with the
 * buttons and the window's actions.
 */
function ZoomSlider({
  zoom,
  disabled,
  onZoom
}: {
  zoom: number;
  disabled: boolean;
  onZoom: (zoom: number) => void;
}) {
  const dialogStyles = useDialogStyles();
  const fraction = Math.min(1, Math.max(0, (zoom - MIN_ZOOM) / (MAX_ZOOM - MIN_ZOOM)));
  // Where the drag started on the track, and the fraction there: read by the handlers only.
  const drag = useRef<{ pageX: number; fraction: number } | null>(null);
  const zoomAtFraction = (at: number) =>
    onZoom(MIN_ZOOM + Math.min(1, Math.max(0, at)) * (MAX_ZOOM - MIN_ZOOM));
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      aria-hidden
      style={[dialogStyles.slider, POINTER]}
      onStartShouldSetResponder={() => !disabled}
      onMoveShouldSetResponder={() => !disabled}
      onResponderTerminationRequest={() => false}
      onResponderGrant={(event: GestureResponderEvent) => {
        // Its parts let the pointer through: `locationX` is the track's.
        const at = event.nativeEvent.locationX / SLIDER_WIDTH;
        drag.current = { pageX: event.nativeEvent.pageX, fraction: at };
        zoomAtFraction(at);
      }}
      onResponderMove={(event: GestureResponderEvent) => {
        const from = drag.current;
        if (from)
          zoomAtFraction(from.fraction + (event.nativeEvent.pageX - from.pageX) / SLIDER_WIDTH);
      }}
      onResponderRelease={() => {
        drag.current = null;
      }}
      onResponderTerminate={() => {
        drag.current = null;
      }}
      testID="card-frame-slider"
    >
      <View pointerEvents="none" style={dialogStyles.rail}>
        <View
          style={[dialogStyles.fill, { width: fraction * SLIDER_WIDTH }]}
          testID="card-frame-slider-fill"
        />
      </View>
      <View
        pointerEvents="none"
        style={[dialogStyles.thumb, { left: fraction * SLIDER_WIDTH - SLIDER_THUMB / 2 }]}
      />
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  root: { flex: 1, backgroundColor: palette.ink, overflow: "hidden" },
  stage: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
  // The image dimmed everywhere but under the window, which a white line edges.
  window: {
    position: "absolute",
    boxShadow: `0 0 0 9999px ${colors.onDark.dim}, inset 0 0 0 1.5px ${colors.onDark.frame}`
  },
  name: { ...sans(600) },
  column: { flex: 1, paddingHorizontal: gutter },
  header: { height: 64, alignItems: "center", justifyContent: "center" },
  title: {
    ...sans(700),
    fontSize: 19,
    letterSpacing: tracking(TITLE_EM, 19),
    color: colors.onDark.text
  },
  hint: {
    ...sans(500),
    fontSize: type.prose,
    lineHeight: 21,
    textAlign: "center",
    color: colors.onDark.secondary,
    paddingHorizontal: WINDOW_MARGIN - gutter
  },
  slot: { flex: 1, marginHorizontal: -gutter },
  zoom: {
    flexDirection: "row",
    justifyContent: "center",
    gap: space[6],
    marginTop: space[9],
    marginBottom: space[10]
  },
  zoomButton: { width: 48, height: 48, borderRadius: 24 },
  actions: { gap: space[3] }
}));

// The desktop's dialog: its parts 14 px apart.
const useDialogStyles = makeStyles(({ colors }) => ({
  content: { gap: 14 },
  hint: { ...sans(500), fontSize: 14, lineHeight: 21, color: colors.text.secondary },
  // The image shows inside the window only, edged by a hairline as a card's face.
  window: {
    alignSelf: "center",
    overflow: "hidden",
    backgroundColor: colors.background.subtle,
    boxShadow: `inset 0 0 0 1px ${colors.border.faint}`
  },
  zoom: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 14 },
  slider: { width: SLIDER_WIDTH, height: 44, justifyContent: "center" },
  rail: {
    height: 6,
    borderRadius: radius.pill,
    overflow: "hidden",
    backgroundColor: colors.background.subtle
  },
  fill: { height: 6, borderRadius: radius.pill, backgroundColor: palette.orange },
  thumb: {
    position: "absolute",
    top: (44 - SLIDER_THUMB) / 2,
    width: SLIDER_THUMB,
    height: SLIDER_THUMB,
    borderRadius: radius.pill,
    backgroundColor: palette.white,
    boxShadow: THUMB_SHADOW
  },
  actions: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: 10 },
  cancel: { minWidth: 120 },
  use: { minWidth: 180 }
}));
