import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderHandlers,
  type ViewStyle
} from "react-native";
import Animated, { type AnimatedStyle } from "react-native-reanimated";

import { Icon } from "@/components/ui/Icon";
import { makeStyles, radius, sans, useTheme } from "@/theme";

import type { CarouselCard } from "./CardCarousel";
import { CardFaceView } from "./CardFaceView";
import { SortableTrack, type SortableLift } from "./SortableTrack";
import { withCurrentIds } from "./reorder";
import { useKeyboardMoves, type KeyboardMoveProps } from "./useKeyboardMoves";

/** A card's width on the page (150 px). */
const THUMB_WIDTH = 150;
/** Its face's height, ringed: the shape of a bank card, 3 px around it. */
const RING = 3;
const FACE_HEIGHT = 95;
/** A card's place on the row: its ringed face, its label under it. */
const PLACE_WIDTH = THUMB_WIDTH + 2 * RING;
const LABEL_LINE = 18;
const LABEL_GAP = 8;
/** A paused card's dot after its name: as high as the name's line. */
const PAUSE_DOT = LABEL_LINE;
const PLACE_HEIGHT = FACE_HEIGHT + 2 * RING + LABEL_GAP + LABEL_LINE;
const GAP = 18;
/** The page's gutter (PosFrame's desktop body): the cards scroll under it, to the window's edge. */
const PAGE_INSET = 38;
/** Room above and below the cards for their shadows and rings, inside the scroll. */
const ROOM_ABOVE = 8;
const ROOM_BELOW = 16;
/** Within this of the row's ends (its arrows'), a dragged card scrolls it. */
const EDGE = 72;
/** A card taken: tilted, its row being ordered. */
const LIFT: SortableLift = { tilt: -3, sway: 6, scale: 1.04 };

/**
 * The pointer over a card being organized, and no text selected by a drag (web only: React
 * Native's types list no such cursor).
 */
const GRAB =
  Platform.OS === "web" ? ({ cursor: "grab", userSelect: "none" } as unknown as ViewStyle) : null;

/*
 * The account's cards side by side on a desktop's page: each card's face and its label under it,
 * the one chosen ringed in orange; no "Add" place after them, the header's button adds a card. On
 * one line whatever their number: the row scrolls, arrows over its ends while cards are hidden
 * there. "Organise" (`organizing`) makes it the place to order them: each card dragged to its place
 * (SortableTrack.tsx), or moved by ← → once it has the focus; a click chooses no card meanwhile. A
 * dragged card's face follows the pointer, its name stays in the row, under the place it will
 * settle into. The phone's carousel (CardCarousel.tsx) slides instead.
 */
export function CardThumbnails({
  cards,
  index,
  onSelect,
  organizing
}: {
  cards: readonly CarouselCard[];
  /** The card chosen; `cards.length`: none (the phone's carousel's "Add" chosen). */
  index: number;
  onSelect: (index: number) => void;
  /**
   * "Organise": the order being chosen (the cards' ids, first to last), its change, and whether
   * it is being saved (nothing moves meanwhile).
   */
  organizing: { ids: readonly string[]; onMove: (ids: string[]) => void; saving: boolean } | null;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  const byId = new Map(cards.map((item) => [item.card.cardId, item]));
  const chosen = cards[index]?.card.cardId ?? null;
  // Organized: the order chosen so far; a card gone meanwhile leaves it, one added comes last.
  const current = cards.map(({ card }) => card.cardId);
  const ids = organizing ? withCurrentIds(organizing.ids, current) : current;
  const movable = organizing !== null && !organizing.saving;
  // Organized: ← → (web) and a screen reader's actions move a card too.
  const keyboard = useKeyboardMoves({
    axis: "x",
    ids,
    enabled: movable,
    onMove: (next) => organizing?.onMove(next),
    labelOf: (id) => byId.get(id)?.label ?? "",
    t
  });
  return (
    <View style={styles.bleed}>
      <SortableTrack
        axis="x"
        ids={ids}
        itemSize={PLACE_WIDTH}
        gap={GAP}
        crossSize={PLACE_HEIGHT}
        enabled={movable}
        onMove={(next) => organizing?.onMove(next)}
        edge={EDGE}
        lift={LIFT}
        inset={PAGE_INSET}
        contentStyle={styles.room}
        arrows={{
          previous: t("cards.order.previous"),
          next: t("cards.order.next"),
          center: ROOM_ABOVE + RING + FACE_HEIGHT / 2
        }}
        accessibilityLabel={t("cards.carousel")}
        testID="cards-thumbnails"
        renderItem={(id, { handle, lifted, shadow }) => {
          const item = byId.get(id)!;
          const position = ids.indexOf(id);
          return (
            <Thumbnail
              item={item}
              position={position}
              count={ids.length}
              chosen={!organizing && id === chosen}
              handle={handle}
              lifted={lifted}
              shadow={shadow}
              keyboard={organizing ? keyboard(id) : null}
              onSelect={() => onSelect(cards.findIndex(({ card }) => card.cardId === id))}
              t={t}
            />
          );
        }}
      />
    </View>
  );
}

/**
 * A card's place on the row: chosen by a click, or, organized, dragged and moved by ← →. Taken by
 * its whole face (the pointer's cursor says so): no handle drawn on it.
 */
function Thumbnail({
  item,
  position,
  count,
  chosen,
  handle,
  lifted,
  shadow,
  keyboard,
  onSelect,
  t
}: {
  item: CarouselCard;
  position: number;
  count: number;
  chosen: boolean;
  handle: GestureResponderHandlers;
  /** Organized: what follows the pointer (its face, not its name), and its shadow. */
  lifted: AnimatedStyle<ViewStyle>;
  shadow: AnimatedStyle<ViewStyle>;
  /** Organized (null otherwise): its focus, its name and its moves without dragging. */
  keyboard: KeyboardMoveProps | null;
  onSelect: () => void;
  t: TFunction;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const id = item.card.cardId;
  const organizing = keyboard !== null;
  const ring = (
    <View style={[styles.ring, chosen && styles.ringChosen]}>
      <View style={styles.face}>
        {organizing ? (
          <Animated.View
            collapsable={false}
            style={[StyleSheet.absoluteFill, styles.faceShadow, shadow]}
            testID={`card-order-shadow-${id}`}
          />
        ) : null}
        <CardFaceView
          card={item.card}
          label={item.label}
          width={THUMB_WIDTH}
          paused={item.paused}
          pauseBadge={false}
          testID="card-face"
        />
      </View>
    </View>
  );
  // A paused card's name followed by a dot, not a badge over its small face. Drawn only, as its
  // stripes: the slot's name says the pause, but while "Organise" orders the row (its name only,
  // useKeyboardMoves).
  const name = (
    <View style={styles.name}>
      <Text numberOfLines={1} style={styles.label}>
        {item.label}
      </Text>
      {item.paused ? (
        <View
          aria-hidden
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={styles.pauseDot}
          testID={`card-slot-paused-${id}`}
        >
          <Icon name="pause" size={8} color={colors.warning.fg} />
        </View>
      ) : null}
    </View>
  );
  if (!keyboard) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          t("cards.slot", { n: position + 1, count, label: item.label }) +
          (item.card.issuer ? `, ${item.card.issuer.number}` : "") +
          (item.status ? `, ${item.status.toLocaleLowerCase()}` : "")
        }
        accessibilityState={{ selected: chosen }}
        onPress={onSelect}
        style={styles.thumb}
        testID={`card-slot-${id}`}
      >
        {ring}
        {name}
      </Pressable>
    );
  }
  return (
    <View {...keyboard} {...handle} style={[styles.thumb, GRAB]} testID={`card-order-slot-${id}`}>
      <Animated.View style={lifted}>{ring}</Animated.View>
      {name}
    </View>
  );
}

const useStyles = makeStyles(({ colors, shadow }) => ({
  // The row goes to the window's edges, its first card where the page's content starts; it takes
  // no more height than its cards (their shadows' room is the page's gap).
  bleed: {
    marginHorizontal: -PAGE_INSET,
    marginTop: -ROOM_ABOVE,
    marginBottom: -ROOM_BELOW
  },
  room: { paddingTop: ROOM_ABOVE, paddingBottom: ROOM_BELOW },
  thumb: { gap: LABEL_GAP, borderRadius: radius.sm },
  // 3 px around the face, ringed once chosen: the faces stay where they are.
  ring: { padding: RING, borderRadius: radius.sm },
  ringChosen: { boxShadow: `inset 0 0 0 2px ${colors.border.accent}` },
  face: { borderRadius: 8 },
  // Behind the face, its shadow once taken (its opacity: SortableTrack's `shadow`).
  faceShadow: { borderRadius: 8, boxShadow: shadow.held },
  // The name and, paused, its dot: the name cut short before the dot.
  name: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    maxWidth: THUMB_WIDTH,
    paddingHorizontal: 4
  },
  label: {
    ...sans(600),
    flexShrink: 1,
    fontSize: 13,
    lineHeight: LABEL_LINE,
    color: colors.text.primary
  },
  pauseDot: {
    width: PAUSE_DOT,
    height: PAUSE_DOT,
    borderRadius: radius.pill,
    backgroundColor: colors.warning.bg,
    alignItems: "center",
    justifyContent: "center"
  }
}));
