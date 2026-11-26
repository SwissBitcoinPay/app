/** Where an element sits across the window, for the tests of screens' margins (Jest has no layout). */
import { StyleSheet, type ViewStyle } from "react-native";

import { getAnimatedStyle } from "./animated-style";

type Node = {
  type: unknown;
  props: { style?: unknown; contentContainerStyle?: unknown };
  parent: Node | null;
};

/** The first of `keys` a style sets, in points; a value that is not fails the test. */
function firstOf(style: ViewStyle, keys: (keyof ViewStyle)[]): number {
  for (const key of keys) {
    const found = style[key];
    if (found === undefined) continue;
    if (typeof found !== "number") throw new Error(`${key}: ${String(found)} is not in points`);
    return found;
  }
  return 0;
}

/**
 * One side's paddings and margins of a style, in points, in a left-to-right layout. The first key
 * set wins, as Yoga resolves them (start before left, then horizontal, then all); a value that is
 * not in points (a percentage, "auto") fails the test rather than counting as none.
 */
function sideOf(style: ViewStyle, side: "Left" | "Right"): number {
  const start = side === "Left" ? "Start" : "End";
  const value = (...keys: (keyof ViewStyle)[]) => firstOf(style, keys);
  return (
    value(
      `padding${start}`,
      `paddingInline${start}`,
      `padding${side}`,
      "paddingHorizontal",
      "paddingInline",
      "padding"
    ) +
    value(
      `margin${start}`,
      `marginInline${start}`,
      `margin${side}`,
      "marginHorizontal",
      "marginInline",
      "margin"
    )
  );
}

/**
 * The paddings and margins of everything `element` is drawn in, on its left and on its right: how
 * far from the window's edges it starts and ends, the views around it as wide as the window.
 */
export function sideInsetsOf(element: Node): { left: number; right: number } {
  let left = 0;
  let right = 0;
  for (let node = element.parent; node; node = node.parent) {
    // The views drawn (host components), not the components passing their style down to them.
    if (typeof node.type !== "string") continue;
    // A scroll view's content too, which its fake draws in no view of its own.
    for (const each of [node.props.style, node.props.contentContainerStyle]) {
      const style = StyleSheet.flatten(each as ViewStyle | undefined) ?? {};
      left += sideOf(style, "Left");
      right += sideOf(style, "Right");
    }
  }
  return { left, right };
}

/**
 * The bottom paddings and margins of everything `element` is drawn in, the animated ones as they
 * stand now (Reanimated's, the shell's band below a hidden dock): how far above the window's bottom
 * edge it ends, when it is the last of each view around it (a screen's pinned actions).
 */
export function bottomInsetOf(element: Node): number {
  let bottom = 0;
  for (let node = element.parent; node; node = node.parent) {
    if (typeof node.type !== "string") continue;
    const animated =
      "jestAnimatedStyle" in node.props
        ? getAnimatedStyle(node as unknown as { props: Record<string, unknown> })
        : {};
    const styles = [
      { ...StyleSheet.flatten(node.props.style as ViewStyle | undefined), ...animated },
      StyleSheet.flatten(node.props.contentContainerStyle as ViewStyle | undefined) ?? {}
    ];
    for (const style of styles) {
      bottom +=
        firstOf(style as ViewStyle, [
          "paddingBottom",
          "paddingBlockEnd",
          "paddingVertical",
          "paddingBlock",
          "padding"
        ]) +
        firstOf(style as ViewStyle, [
          "marginBottom",
          "marginBlockEnd",
          "marginVertical",
          "marginBlock",
          "margin"
        ]);
    }
  }
  return bottom;
}
