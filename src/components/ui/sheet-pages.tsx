import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
  type ReactNode
} from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming
} from "react-native-reanimated";

import { motion } from "@/theme";

import { outOfReach } from "./reach";

/** What tells a panel's pages apart (Sheet's `page`, SheetPages' `page`). */
export type SheetPageKey = string | number;

/**
 * How long a page left stays over the next one: it fades out first (motion.sheetPageOut), then
 * stays, out of sight, until the new page has faded in and the panel's height has eased
 * (motion.sheet): the panel keeps its content clipped meanwhile.
 */
export const PAGE_TRANSITION = Math.max(
  motion.sheetPageOut,
  motion.sheetPageInDelay + motion.sheetPageIn,
  motion.sheet
);

/**
 * Given by a panel (Sheet) to the pages in it: told, before the frame is painted, that a page
 * changed, it clips its content and eases its height (sheet-layout.web.ts) for PAGE_TRANSITION.
 */
export const SheetPagesContext = createContext<(() => void) | null>(null);

/**
 * One of what follows one another in a panel (a page, a title): `id` tells each one shown apart,
 * one shown again included; `leaving`, it was left and fades out over the one shown.
 */
export type Swapped<T> = { id: number; value: T; leaving: boolean };

type Entry<T> = { id: number; key: SheetPageKey; value: T };

/**
 * What follows one another (SheetPages, the panel's title): at a change of `key`, the one shown so
 * far, as it last rendered (`value`), is left, kept for PAGE_TRANSITION after the last change; the
 * one shown is last. One list, so that the one shown, once left, stays the same view (never
 * mounted again).
 */
export function useSwap<T>(key: SheetPageKey, value: T): Swapped<T>[] {
  const [shown, setShown] = useState<Entry<T>>({ id: 0, key, value });
  const [left, setLeft] = useState<Entry<T>[]>([]);
  if (key !== shown.key) {
    setLeft([...left, shown]);
    setShown({ id: shown.id + 1, key, value });
  } else if (value !== shown.value) {
    setShown({ ...shown, value });
  }

  useEffect(() => {
    if (left.length === 0) return;
    const timer = setTimeout(() => setLeft([]), PAGE_TRANSITION);
    return () => clearTimeout(timer);
  }, [left]);

  return [
    ...left.map((entry) => ({ id: entry.id, value: entry.value, leaving: true })),
    { id: shown.id, value, leaving: false }
  ];
}

/**
 * Pages that follow one another in a panel: at a change of `page`, the page left fades
 * out while the new one, mounted afresh, fades in a little after; what is around (the panel's
 * header and its steps, a part shared by the pages) stays. Sheet's `page` for a panel's whole
 * content; around the part that changes when the pages are chosen deeper (a form, its scanner and
 * its outcome), so that their owner and its state stay.
 *
 * The page left is its last render, kept as it was: its element, so its props and any context
 * provided within it ("Sell"'s), never drawn again with what came since; it stays mounted,
 * out of reach and of sight, for PAGE_TRANSITION, then goes. `style`: each page's, laid out as the
 * part would be without them (its gap).
 */
export function SheetPages({
  page,
  style,
  children
}: {
  page: SheetPageKey;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const pages = useSwap(page, children);

  // Before the new page is painted: its panel clips and eases its height from this frame on.
  // Sheet's is stable: a new page is told once.
  const changed = useContext(SheetPagesContext);
  const pageId = pages[pages.length - 1].id;
  useLayoutEffect(() => {
    if (pageId > 0) changed?.();
  }, [pageId, changed]);

  const pageStyle = style ? [styles.shrink, style] : styles.shrink;
  return (
    // The pages left, absolute, over the page shown (below them in the flow).
    <View collapsable={false} style={styles.shrink}>
      {pages.map((entry) => (
        <PageView key={entry.id} enters={entry.id > 0} leaving={entry.leaving} style={pageStyle}>
          {entry.value}
        </PageView>
      ))}
    </View>
  );
}

// Fades only: kept with Reduce Motion.
const FADE_OUT = {
  duration: motion.sheetPageOut,
  easing: Easing.out(Easing.quad),
  reduceMotion: ReduceMotion.Never
};
const FADE_IN = {
  duration: motion.sheetPageIn,
  easing: Easing.out(Easing.quad),
  reduceMotion: ReduceMotion.Never
};

/**
 * The opacity of a page, or a title: `enters` (fixed as it mounts: shown after another), it fades
 * in once the one left is mostly gone; `leaving`, it fades out.
 */
export function usePageFade(enters: boolean, leaving: boolean) {
  const [fadesIn] = useState(enters);
  const opacity = useSharedValue(fadesIn ? 0 : 1);

  useEffect(() => {
    if (fadesIn) opacity.set(withDelay(motion.sheetPageInDelay, withTiming(1, FADE_IN)));
  }, [fadesIn, opacity]);

  useEffect(() => {
    if (leaving) opacity.set(withTiming(0, FADE_OUT));
  }, [leaving, opacity]);

  return useAnimatedStyle(() => ({ opacity: opacity.get() }));
}

/**
 * A page. Shown, it lays its content out as the part would (`style`). Left, it keeps its place and
 * its size over the new page, out of reach, and fades out. `enters`: shown after another page, it
 * fades in.
 */
function PageView({
  enters,
  leaving,
  style,
  children
}: {
  enters: boolean;
  leaving: boolean;
  style: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const fade = usePageFade(enters, leaving);
  // Its height as it last showed, which it keeps once left: a list in it keeps its size instead of
  // growing to its whole content.
  const [height, setHeight] = useState<number | null>(null);

  return (
    // Its props change while the Modal shows: never flattened by Fabric (Android: addViewAt
    // failed).
    <Animated.View
      collapsable={false}
      {...outOfReach(leaving)}
      onLayout={(event) => {
        if (leaving) return;
        const measured = event.nativeEvent.layout.height;
        if (measured !== height) setHeight(measured);
      }}
      style={[style, leaving ? [styles.left, { height: height ?? undefined }] : styles.shown, fade]}
    >
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // Shrinks with the panel to its greatest height (a list in it scrolls).
  shrink: { flexShrink: 1 },
  shown: { pointerEvents: "auto" },
  left: { position: "absolute", top: 0, left: 0, right: 0, pointerEvents: "none" }
});
