import { useId, useState, type ReactNode } from "react";
import {
  ScrollView,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type StyleProp,
  type ViewStyle
} from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

/*
 * What tells that a panel's content goes on below its fold: the scroll bar while it scrolls, and the
 * content fading into the panel at its bottom edge while some of it is below; the fade goes once
 * the end is in sight.
 */

/** How tall the fade is, in px: about a line of details. */
export const SCROLL_FADE_HEIGHT = 40;

/** Less than this left below (px): the end is in sight, no fade. */
const END_SLACK = 4;

/**
 * Whether a ScrollView's content goes on below what shows, and the handlers that tell it. Its
 * state belongs to that ScrollView: a hook of the component that renders it, mounted and unmounted
 * with it (FoldScrollView), never kept across two of them (a new one starts at its top).
 */
export function useMoreBelow() {
  const [viewport, setViewport] = useState(0);
  const [content, setContent] = useState(0);
  const [offset, setOffset] = useState(0);
  return {
    moreBelow: viewport > 0 && content - (offset + viewport) > END_SLACK,
    onLayout: (event: LayoutChangeEvent) => setViewport(event.nativeEvent.layout.height),
    onContentSizeChange: (_width: number, height: number) => setContent(height),
    onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) =>
      setOffset(event.nativeEvent.contentOffset.y),
    /** As often as the fade needs: it follows the scroll, it draws no frame of its own. */
    scrollEventThrottle: 32
  };
}

/**
 * A ScrollView whose fold shows (above): its bar, and the fade over its bottom edge in `fadeColor`
 * (the panel's own) while more is below. `boxStyle`: of the box holding both, which takes the
 * ScrollView's place in its parent; inside a Modal it keeps its own view whether the fade shows or
 * not (Fabric: collapsable).
 */
export function FoldScrollView({
  style,
  boxStyle,
  fadeColor,
  testID,
  fadeTestID,
  children
}: {
  style?: StyleProp<ViewStyle>;
  boxStyle?: StyleProp<ViewStyle>;
  fadeColor: string;
  testID?: string;
  fadeTestID?: string;
  children: ReactNode;
}) {
  const fold = useMoreBelow();
  return (
    <View style={boxStyle} collapsable={false}>
      <ScrollView
        style={style}
        showsVerticalScrollIndicator
        onLayout={fold.onLayout}
        onContentSizeChange={fold.onContentSizeChange}
        onScroll={fold.onScroll}
        scrollEventThrottle={fold.scrollEventThrottle}
        testID={testID}
      >
        {children}
      </ScrollView>
      {fold.moreBelow ? <ScrollFade color={fadeColor} testID={fadeTestID} /> : null}
    </View>
  );
}

/**
 * The fade over a ScrollView's bottom edge, from transparent to `color`: placed by its parent over
 * the ScrollView's bottom, it takes no touch.
 */
export function ScrollFade({ color, testID }: { color: string; testID?: string }) {
  // One gradient per fade: on the web, two with one id would share the first's.
  const id = `scroll-fade-${useId().replace(/[^A-Za-z0-9_-]/g, "")}`;
  return (
    <View pointerEvents="none" style={styles.fade} testID={testID}>
      <Svg width="100%" height={SCROLL_FADE_HEIGHT} preserveAspectRatio="none">
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={color} stopOpacity={0} />
            <Stop offset="1" stopColor={color} stopOpacity={1} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height={SCROLL_FADE_HEIGHT} fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  fade: { position: "absolute", left: 0, right: 0, bottom: 0, height: SCROLL_FADE_HEIGHT }
});
