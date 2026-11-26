import type { TFunction } from "i18next";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Platform,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type GestureResponderHandlers,
  type ViewStyle
} from "react-native";
import Animated, { type AnimatedStyle } from "react-native-reanimated";

import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Sheet, useSheetInset } from "@/components/ui/Sheet";
import { makeStyles, radius, sans, space, type, useTheme } from "@/theme";

import type { CarouselCard } from "./CardCarousel";
import { CardMini } from "./CardFaceView";
import { SortableTrack, type SortableLift } from "./SortableTrack";
import { withCurrentIds } from "./reorder";
import { useKeyboardMoves, type KeyboardMoveProps } from "./useKeyboardMoves";

/*
 * "Card order", opened by "Organise" at the top of "Cards" on a phone: the account's cards, first
 * to last, each taken by its handle and dragged to its place (SortableTrack.tsx); with a screen
 * reader, "Move up" and "Move down" on each row; on the web, ↑ ↓ on the row that has the focus.
 * "Save" saves the order (on a majority of the account's relays, states.ts: the same on every
 * device), then closes; nothing is saved before.
 */

/** The pointer over a handle (web only: React Native's types list no such cursor). */
const GRAB = Platform.OS === "web" ? ({ cursor: "grab" } as unknown as ViewStyle) : null;

/** A row's height: the touch floor and the card's name and status on two lines. */
const ROW_HEIGHT = 60;
/** Within this of the list's ends, a dragged row scrolls it. */
const EDGE = 40;
/** What the panel takes besides the list (its header, its lead, its button, its margins). */
const AROUND_LIST = 260;
/**
 * A row taken lifts without leaning, still or carried (on a phone, a tilted row reads as a fault);
 * only its shadow and its width say it is held.
 */
export const ORDER_ROW_LIFT: SortableLift = { tilt: 0, sway: 0, scale: 1 };

export function CardOrderSheet({
  visible,
  cards,
  onSave,
  onClose
}: {
  visible: boolean;
  /** The cards, in their order now. */
  cards: readonly CarouselCard[];
  /** Saves the order (the cards' ids, first to last); resolves whether it was saved. */
  onSave: (ids: string[]) => Promise<boolean>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);
  return (
    <Sheet
      title={t("cards.order.title")}
      closeLabel={t("cards.order.close")}
      visible={visible}
      onClose={onClose}
      // A write in progress: it ends before the panel goes.
      dismissible={!saving}
      testID="card-order-sheet"
    >
      <OrderList
        cards={cards}
        saving={saving}
        onClose={onClose}
        onSave={(ids) => {
          setSaving(true);
          void onSave(ids).then((saved) => {
            setSaving(false);
            if (saved) onClose();
          });
        }}
        t={t}
      />
    </Sheet>
  );
}

/** The panel's content, mounted while it shows: the order being chosen starts as it is. */
function OrderList({
  cards,
  saving,
  onClose,
  onSave,
  t
}: {
  cards: readonly CarouselCard[];
  saving: boolean;
  /** "Save" with the order as it was: nothing to save. */
  onClose: () => void;
  onSave: (ids: string[]) => void;
  t: TFunction;
}) {
  const styles = useStyles();
  const window = useWindowDimensions();
  const inset = useSheetInset();
  const [draft, setDraft] = useState(() => cards.map(({ card }) => card.cardId));
  const [dragging, setDragging] = useState(false);
  const byId = new Map(cards.map((item) => [item.card.cardId, item]));
  const current = cards.map(({ card }) => card.cardId);
  // A card gone meanwhile (deleted elsewhere) leaves the list; one added comes last.
  const ids = withCurrentIds(draft, current);
  // ↑ ↓ (web) and a screen reader's actions move a row too; being saved, nothing moves (the
  // panel closes on the order saved).
  const keyboard = useKeyboardMoves({
    axis: "y",
    ids,
    enabled: !saving,
    onMove: setDraft,
    labelOf: (id) => byId.get(id)?.label ?? "",
    t
  });
  const unchanged = ids.join() === current.join();
  return (
    <View style={styles.body}>
      <Text style={styles.lead}>{t("cards.order.lead")}</Text>
      {/* The list takes the panel's padding (Sheet.tsx): a scroll clips what goes past it
          (Android), and a row taken is wider than its place and casts a shadow around it. Its rows
          take the padding back. */}
      <View style={{ marginHorizontal: -inset }} testID="card-order-bleed">
        <SortableTrack
          axis="y"
          ids={ids}
          itemSize={ROW_HEIGHT}
          gap={0}
          enabled={!saving}
          edge={EDGE}
          lift={ORDER_ROW_LIFT}
          onMove={setDraft}
          onDragging={setDragging}
          scrollStyle={{
            flexShrink: 1,
            maxHeight: Math.max(3 * ROW_HEIGHT, window.height * 0.85 - AROUND_LIST)
          }}
          contentStyle={{ paddingHorizontal: inset }}
          accessibilityLabel={t("cards.carousel")}
          testID="card-order-list"
          renderItem={(id, { dragged, handle, lifted, shadow }) => {
            return (
              <OrderRow
                item={byId.get(id)!}
                dragged={dragged}
                handle={handle}
                lifted={lifted}
                shadow={shadow}
                keyboard={keyboard(id)}
                t={t}
              />
            );
          }}
        />
      </View>
      <Button
        size="lg"
        loading={saving}
        disabled={dragging}
        onPress={() => (unchanged ? onClose() : onSave(ids))}
        testID="card-order-save"
      >
        {t("cards.order.save")}
      </Button>
    </View>
  );
}

function OrderRow({
  item,
  dragged,
  handle,
  lifted,
  shadow,
  keyboard,
  t
}: {
  item: CarouselCard;
  dragged: boolean;
  handle: GestureResponderHandlers;
  /** What follows the finger: the whole row. */
  lifted: AnimatedStyle<ViewStyle>;
  /** Its shadow's opacity: faded in once taken, out as it settles (SortableTrack's `shadow`). */
  shadow: AnimatedStyle<ViewStyle>;
  /** Its focus, its name and its moves without dragging. */
  keyboard: KeyboardMoveProps;
  t: TFunction;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const id = item.card.cardId;
  return (
    <View
      {...keyboard}
      accessibilityHint={item.status ?? undefined}
      collapsable={false}
      style={styles.place}
      testID={`card-order-row-${id}`}
    >
      <Animated.View style={[styles.row, dragged && styles.rowDragged, lifted]}>
        {/* First, under the row's content: a shadow set on the row itself would show at once.
            Clipped out of its own box (React Native's boxShadow),
            it has the row's background: no faint edge inside the row (Android clips 0.4 px in). */}
        <Animated.View
          collapsable={false}
          style={[StyleSheet.absoluteFill, styles.rowShadow, shadow]}
          testID={`card-order-row-shadow-${id}`}
        />
        <CardMini card={item.card} />
        <View style={styles.texts}>
          <Text numberOfLines={1} style={styles.name}>
            {item.label}
          </Text>
          <Text numberOfLines={1} style={styles.caption}>
            {item.status ?? t("cards.status.active")}
          </Text>
        </View>
        <View {...handle} style={[styles.grip, GRAB]} testID={`card-order-grip-${id}`}>
          <Icon
            name="grip-vertical"
            size={16}
            color={dragged ? colors.text.primary : colors.text.tertiary}
          />
        </View>
      </Animated.View>
    </View>
  );
}

const useStyles = makeStyles(({ colors, shadow }) => ({
  body: { gap: space[5], flexShrink: 1 },
  lead: {
    ...sans(500),
    fontSize: type.caption,
    lineHeight: 18,
    color: colors.text.secondary
  },
  place: { height: ROW_HEIGHT },
  row: {
    height: ROW_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingLeft: 4,
    borderRadius: radius.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border.subtle,
    backgroundColor: colors.background.surface,
    userSelect: "none"
  },
  rowDragged: {
    borderBottomColor: "transparent",
    paddingLeft: 12,
    marginHorizontal: -8
  },
  rowShadow: {
    borderRadius: radius.md,
    backgroundColor: colors.background.surface,
    boxShadow: shadow.held
  },
  texts: { flex: 1, minWidth: 0, gap: 1 },
  name: { ...sans(600), fontSize: 15, color: colors.text.primary },
  caption: {
    ...sans(500),
    fontSize: type.caption,
    lineHeight: 18,
    color: colors.text.secondary
  },
  grip: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center"
  }
}));
