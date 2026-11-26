import type { TFunction } from "i18next";
import { useRef } from "react";
import {
  AccessibilityInfo,
  Platform,
  type AccessibilityActionEvent,
  type KeyDownEvent,
  type ViewInstance
} from "react-native";

import { moveId } from "./reorder";

/*
 * "Organise" of "Cards" without dragging, the same for the phone's panel (a column) and the
 * desktop's row: with a screen reader, each card's actions move it one place back or on ("Move up"
 * / "Move down" in a column, "Move left" / "Move right" in a row: native only); on the web, the
 * arrow keys of its axis move the card that has the focus. Each move is announced (its new place),
 * and the card keeps the focus once drawn at its new place (the web moves its view: it blurs).
 */

/** Spread on the view that stands for a card (its focus, its name, its actions). */
export type KeyboardMoveProps = {
  ref: (view: ViewInstance | null) => void;
  accessible: true;
  accessibilityLabel: string;
  accessibilityActions: { name: string; label: string }[];
  onAccessibilityAction: (event: AccessibilityActionEvent) => void;
  /**
   * Web only: react-native-web forwards both to the element, whose React event carries the
   * browser's in `nativeEvent` (as SplitBar.tsx).
   */
  tabIndex?: 0;
  onKeyDown?: (event: KeyDownEvent) => void;
};

/** What a move is called and taken from, along each axis: back (-1), then on (+1). */
const AXES = {
  x: {
    actions: ["moveLeft", "moveRight"],
    labels: ["cards.order.moveLeft", "cards.order.moveRight"],
    keys: ["ArrowLeft", "ArrowRight"]
  },
  y: {
    actions: ["moveUp", "moveDown"],
    labels: ["cards.order.moveUp", "cards.order.moveDown"],
    keys: ["ArrowUp", "ArrowDown"]
  }
} as const;

/**
 * The props of each card's view (`propsOf(id)`): `ids` the order shown, `onMove` its change, none
 * while `enabled` is false (being saved), `labelOf` a card's name.
 */
export function useKeyboardMoves({
  axis,
  ids,
  enabled,
  onMove,
  labelOf,
  t
}: {
  axis: "x" | "y";
  ids: readonly string[];
  enabled: boolean;
  onMove: (ids: string[]) => void;
  labelOf: (id: string) => string;
  t: TFunction;
}): (id: string) => KeyboardMoveProps {
  const views = useRef(new Map<string, ViewInstance>());
  const { actions, labels, keys } = AXES[axis];
  const count = ids.length;

  const move = (id: string, to: number) => {
    if (!enabled) return;
    const next = moveId(ids, id, to);
    onMove(next);
    AccessibilityInfo.announceForAccessibility(
      t("cards.order.moved", { label: labelOf(id), n: next.indexOf(id) + 1, count })
    );
    setTimeout(() => views.current.get(id)?.focus(), 0);
  };

  return (id) => {
    const position = ids.indexOf(id);
    // A step back (-1) or on (+1), within the line only.
    const can = (step: -1 | 1) => (step < 0 ? position > 0 : position < count - 1);
    const stepOf = (found: string, among: readonly [string, string]): -1 | 1 | 0 =>
      found === among[0] ? -1 : found === among[1] ? 1 : 0;
    return {
      ref: (view) => {
        if (view) views.current.set(id, view);
        else views.current.delete(id);
      },
      accessible: true,
      accessibilityLabel: t("cards.order.row", { label: labelOf(id), n: position + 1, count }),
      accessibilityActions: ([-1, 1] as const)
        .filter(can)
        .map((step) => ({ name: actions[step < 0 ? 0 : 1], label: t(labels[step < 0 ? 0 : 1]) })),
      onAccessibilityAction: (event) => {
        const step = stepOf(event.nativeEvent.actionName, actions);
        if (step !== 0 && can(step)) move(id, position + step);
      },
      ...(Platform.OS === "web"
        ? {
            tabIndex: 0 as const,
            onKeyDown: (event: KeyDownEvent) => {
              const step = stepOf(event.nativeEvent.key, keys);
              if (step === 0 || !can(step)) return;
              event.preventDefault();
              move(id, position + step);
            }
          }
        : null)
    };
  };
}
