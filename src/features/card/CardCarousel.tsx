import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  Platform,
  Pressable,
  Text,
  View,
  useWindowDimensions,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  type ViewStyle
} from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming
} from "react-native-reanimated";

import { Icon } from "@/components/ui/Icon";
import type { CardState } from "@/lib/card/card-record";
import { makeStyles, radius, sans, useTheme, type ColorScheme } from "@/theme";

import { CARD_HEIGHT, CARD_WIDTH, CardFaceView, CardUnderFace } from "./CardFaceView";

/*
 * The carousel of "Cards": the account's cards side by side, the one chosen in the middle at its
 * full size, its neighbours a little smaller on each side, then a last place to add a card. A card
 * is chosen by a tap, or by sliding the row a third of a card's width (60 px); one step at a time.
 */

/** The space between two cards. */
const GAP = 12;
/** How far the row must slide to go to the next card. */
const STEP_DRAG = 60;
/** How far a finger must move sideways before the row follows it (a tap moves a little). */
const DRAG_START = 6;
/** The scale of the cards beside the chosen one. */
const ASIDE_SCALE = 0.92;
/** The ease-out (cubic-bezier(0.2, 0.8, 0.2, 1)), for the row and the scale alike. */
const EASE = Easing.bezier(0.2, 0.8, 0.2, 1);
const SLIDE_MS = 300;
const SCALE_MS = 260;
/**
 * In a browser, the page scrolls up and down under the carousel, never sideways: a slide sideways
 * stays the row's (without it, the browser takes the touch for the page's scroll and cancels it).
 * The page still zooms with two fingers over it. Web only (read as it renders): React Native's
 * types list no such style.
 */
const PAN_Y = { touchAction: "pan-y pinch-zoom" } as unknown as ViewStyle;

export type CarouselCard = {
  card: CardState;
  /** Its name, or "Card 9D81". */
  label: string;
  /** What keeps it from paying ("Paused", "Migration to finish"), null when nothing does. */
  status: string | null;
  /** In a pause: its face striped (CardFaceView). */
  paused: boolean;
};

/**
 * The cards, then the place to add one (`index` === cards.length): `onSelect` with the index a tap
 * or a slide chose.
 */
export function CardCarousel({
  cards,
  index,
  onSelect
}: {
  cards: readonly CarouselCard[];
  index: number;
  onSelect: (index: number) => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const window = useWindowDimensions();
  const [measured, setMeasured] = useState<number | null>(null);
  const width = measured ?? window.width;
  const reduceMotion = useReducedMotion();
  const last = cards.length;
  const target = (width - CARD_WIDTH) / 2 - index * (CARD_WIDTH + GAP);
  const offset = useSharedValue(target);
  const drag = useSharedValue(0);
  // The row slides to a card chosen; it is set in place when only the width changed (its layout).
  const shownIndex = useRef(index);
  useEffect(() => {
    const moved = shownIndex.current !== index;
    shownIndex.current = index;
    offset.set(
      moved && !reduceMotion ? withTiming(target, { duration: SLIDE_MS, easing: EASE }) : target
    );
  }, [offset, target, index, reduceMotion]);

  // Where the finger went down, then whether the row follows it: read by the gesture's handlers only.
  const touch = useRef<{ x: number; y: number; dragging: boolean } | null>(null);
  const settle = () => drag.set(withTiming(0, { duration: SLIDE_MS, easing: EASE }));
  const gesture = {
    // Never takes a touch as it begins (a tap is a card's), only notes where it began. A second
    // finger while the row follows the first keeps the first's start (the row would jump).
    onStartShouldSetResponderCapture: (event: GestureResponderEvent) => {
      if (touch.current?.dragging) return false;
      touch.current = { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY, dragging: false };
      return false;
    },
    // Asked before the cards (their presses): a slide sideways is the row's, a tap the card's.
    onMoveShouldSetResponderCapture: (event: GestureResponderEvent) => {
      const from = touch.current;
      if (!from) return false;
      const dx = event.nativeEvent.pageX - from.x;
      const dy = event.nativeEvent.pageY - from.y;
      return Math.abs(dx) > DRAG_START && Math.abs(dx) > Math.abs(dy);
    },
    onResponderGrant: () => {
      if (touch.current) touch.current.dragging = true;
      // True: the screen's native scroll (Android's) never takes the slide over once the row
      // follows the finger, however it drifts up or down (React Native's responder: blocks the host
      // one; as SortableTrack.tsx). iOS's scroll yields to the responder by itself.
      return true;
    },
    // Once the row follows a finger, a vertical scroll does not take it back.
    onResponderTerminationRequest: () => false,
    onResponderMove: (event: GestureResponderEvent) => {
      if (touch.current) drag.set(event.nativeEvent.pageX - touch.current.x);
    },
    onResponderRelease: (event: GestureResponderEvent) => {
      const from = touch.current;
      touch.current = null;
      settle();
      if (!from) return;
      const dx = event.nativeEvent.pageX - from.x;
      const step = dx < -STEP_DRAG ? 1 : dx > STEP_DRAG ? -1 : 0;
      const next = Math.max(0, Math.min(last, index + step));
      if (next !== index) onSelect(next);
    },
    onResponderTerminate: () => {
      touch.current = null;
      settle();
    }
  };

  const track = useAnimatedStyle(() => ({
    transform: [{ translateX: offset.get() + drag.get() }]
  }));

  return (
    <View
      accessibilityLabel={t("cards.carousel")}
      onLayout={(event: LayoutChangeEvent) => setMeasured(event.nativeEvent.layout.width)}
      style={[styles.carousel, Platform.OS === "web" && PAN_Y]}
      testID="cards-carousel"
      {...gesture}
    >
      <Animated.View style={[styles.track, track]}>
        {cards.map((item, position) => (
          <Slot
            key={item.card.cardId}
            chosen={position === index}
            reduceMotion={reduceMotion}
            accessibilityLabel={
              t("cards.slot", { n: position + 1, count: cards.length, label: item.label }) +
              (item.card.issuer ? `, ${item.card.issuer.number}` : "") +
              (item.status ? `, ${item.status.toLocaleLowerCase()}` : "")
            }
            onPress={() => onSelect(position)}
            testID={`card-slot-${item.card.cardId}`}
          >
            <View>
              <CardFaceView
                card={item.card}
                label={item.label}
                paused={item.paused}
                testID="card-face"
              />
              <CardUnderFace number={item.card.issuer?.number ?? null} status={item.status} />
            </View>
          </Slot>
        ))}
        <Slot
          chosen={index === last}
          reduceMotion={reduceMotion}
          accessibilityLabel={t("cards.add")}
          onPress={() => onSelect(last)}
          testID="card-slot-add"
        >
          <View style={styles.add}>
            <View style={styles.addCircle}>
              <Icon name="plus" size={18} color={colors.text.accent} />
            </View>
            <Text style={styles.addLabel}>{t("cards.add")}</Text>
          </View>
        </Slot>
      </Animated.View>
    </View>
  );
}

function Slot({
  chosen,
  reduceMotion,
  accessibilityLabel,
  onPress,
  testID,
  children
}: {
  chosen: boolean;
  reduceMotion: boolean;
  accessibilityLabel: string;
  onPress: () => void;
  testID: string;
  children: ReactNode;
}) {
  const scale = useSharedValue(chosen ? 1 : ASIDE_SCALE);
  useEffect(() => {
    const value = chosen ? 1 : ASIDE_SCALE;
    scale.set(reduceMotion ? value : withTiming(value, { duration: SCALE_MS, easing: EASE }));
  }, [scale, chosen, reduceMotion]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: chosen }}
      onPress={onPress}
      testID={testID}
    >
      <Animated.View style={style}>{children}</Animated.View>
    </Pressable>
  );
}

/**
 * The dots under the carousel: one per card, the chosen one longer, then a "+" for the last place.
 */
export function CarouselDots({ count, index }: { count: number; index: number }) {
  const { colors, scheme } = useTheme();
  const styles = useStyles();
  const reduceMotion = useReducedMotion();
  return (
    <View
      aria-hidden
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.dots}
    >
      {Array.from({ length: count }, (_, position) => (
        <Dot key={position} chosen={position === index} reduceMotion={reduceMotion} />
      ))}
      <Icon
        name="plus"
        size={10}
        color={index === count ? colors.text.primary : DOT_COLOR[scheme]}
        style={styles.plus}
      />
    </View>
  );
}

// The primary text at 22 %, in each theme (as the borders' 10, 14 and 35 %, tokens.ts).
const DOT_COLOR: Readonly<Record<ColorScheme, string>> = {
  light: "rgba(11, 26, 51, 0.22)",
  dark: "rgba(244, 239, 230, 0.22)"
};

function Dot({ chosen, reduceMotion }: { chosen: boolean; reduceMotion: boolean }) {
  const { colors, scheme } = useTheme();
  const styles = useStyles();
  const length = useSharedValue(chosen ? 18 : 6);
  useEffect(() => {
    const value = chosen ? 18 : 6;
    length.set(reduceMotion ? value : withTiming(value, { duration: SCALE_MS }));
  }, [length, chosen, reduceMotion]);
  const style = useAnimatedStyle(() => ({ width: length.get() }));
  return (
    <Animated.View
      style={[
        styles.dot,
        { backgroundColor: chosen ? colors.text.primary : DOT_COLOR[scheme] },
        style
      ]}
    />
  );
}

const useStyles = makeStyles(({ colors, shadow }) => ({
  // 14 px under the faces (the dots right under it, CardsScreen.tsx): a v2 card's number and a
  // card's status show there (CardUnderFace), never clipped.
  carousel: { overflow: "hidden", paddingTop: 8, paddingBottom: 14, userSelect: "none" },
  track: { flexDirection: "row", gap: GAP },
  add: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: 16,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: colors.border.strong,
    alignItems: "center",
    justifyContent: "center",
    gap: 12
  },
  addCircle: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: colors.background.surface,
    boxShadow: shadow.card,
    alignItems: "center",
    justifyContent: "center"
  },
  addLabel: { ...sans(600), fontSize: 15, color: colors.text.primary },
  dots: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: 16
  },
  dot: { height: 6, borderRadius: radius.pill },
  plus: { lineHeight: 10 }
}));
