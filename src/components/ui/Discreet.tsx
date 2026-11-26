import { createContext, useContext, useId, useState, type ReactNode } from "react";
import {
  PixelRatio,
  Platform,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle
} from "react-native";
import Svg, { Defs, FeGaussianBlur, Filter, G, Rect } from "react-native-svg";

import { useTheme } from "@/theme";

/**
 * The discreet mode of a screen ("Discreet", the wallet screen only):
 * whether its amounts are hidden, and what screen readers say in their place. No provider (every
 * other screen): `Masked` draws its content as it is, without a box of its own.
 */
export type DiscreetMode = { hidden: boolean; label: string };

const DiscreetContext = createContext<DiscreetMode | null>(null);

export const DiscreetProvider = DiscreetContext.Provider;

/** The screen's discreet mode, null outside a screen that has one. */
export function useDiscreet(): DiscreetMode | null {
  return useContext(DiscreetContext);
}

/** What screen readers say for an amount: the mode's label while it hides the amounts. */
export function spokenAmount(mode: DiscreetMode | null, text: string): string {
  return mode?.hidden ? mode.label : text;
}

/**
 * The glyphs drawn in place of a value, as fractions of its line's height: about the height and
 * the advance of a digit of Plus Jakarta Sans or JetBrains Mono (in lines about 1.4 times their size),
 * blurred so that they read as a figure out of focus, not as a figure.
 */
const GLYPH_HEIGHT = 0.5;
const GLYPH_WIDTH = 0.34;
const GLYPH_PITCH = 0.42;
/** Each glyph a little shorter or taller, in turn, as digits of different shapes once blurred. */
const GLYPH_HEIGHTS = [1, 0.86, 0.96, 0.8, 1, 0.9];
const BLUR = 0.17;
/**
 * Room above and below the line for the blur to fade out (3 deviations), as a fraction of the
 * line: rows leave that room around a value.
 */
const BLEED = 0.55;
/**
 * The glyphs' distance from the value's ends, in deviations of the blur: there it has faded to 2 %
 * (of the glyphs' 55 %), so the blur stays within the value's own box. Beyond it, the containers
 * that clip (a fold, a scroll view) and hold a value flush with their edge cut it with a hard edge:
 * the rows' amounts on the right, the balance and a movement's amount on the left.
 */
const END_INSET = 2;

/**
 * react-native-svg 15.15.4 scales FeGaussianBlur differently on each platform (see BlurredQr): the
 * web in CSS pixels and iOS in points, as asked; Android with a RenderScript radius of twice the
 * deviation in device pixels, capped at 25, whose sigma is 0.4 × radius + 0.6 (its
 * ScriptIntrinsicBlur). Not seen on a device yet. Re-check on every react-native-svg upgrade.
 */
function deviationFor(points: number): number {
  if (Platform.OS !== "android") return points;
  const radius = (points * PixelRatio.get() - 0.6) / 0.4;
  return Math.min(25, Math.max(0.5, radius)) / 2;
}

type MaskedProps = {
  children: ReactNode;
  /** The glyphs' colour: the value's own (grey for a value not received). */
  color?: string;
  /** Of the box around the value: its place in its row (margins, shrinking). */
  style?: StyleProp<ViewStyle>;
};

/**
 * A value hidden by the screen's discreet mode: drawn as blurred glyphs over its own place, so
 * that nothing moves when the mode changes. The value itself stays laid out, invisible and out of
 * reach of screen readers, which read the mode's label instead; on the web it cannot be selected
 * either. Its box is there in both states (no jump when the mode changes) and measured ahead, so
 * that the glyphs show at once. Outside a screen with a discreet mode, the value as it is.
 */
export function Masked({ children, color, style }: MaskedProps) {
  const { colors } = useTheme();
  const mode = useDiscreet();
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  if (!mode) return children;
  const { hidden, label } = mode;
  return (
    <View
      style={style}
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        if (width !== size?.width || height !== size?.height) setSize({ width, height });
      }}
      // Screen readers read the label in place of the value: on its own, or in a row's name.
      accessible={hidden}
      role={hidden ? "img" : undefined}
      aria-label={hidden ? label : undefined}
    >
      <View aria-hidden={hidden} style={hidden ? styles.hidden : null}>
        {children}
      </View>
      {hidden && size ? <BlurredGlyphs {...size} color={color ?? colors.text.primary} /> : null}
    </View>
  );
}

function BlurredGlyphs({ width, height, color }: { width: number; height: number; color: string }) {
  // An id per drawing: on the web, every SVG of the page shares one namespace of ids.
  const filterId = `discreet-${useId().replace(/[^A-Za-z0-9_-]/g, "")}`;
  if (width <= 0 || height <= 0) return null;
  const bleed = height * BLEED;
  const glyphHeight = height * GLYPH_HEIGHT;
  const glyphWidth = height * GLYPH_WIDTH;
  const inset = height * BLUR * END_INSET;
  // The span the glyphs cover: the value's width, less the room for the blur at both ends.
  const span = Math.max(0, width - inset * 2);
  const fits = Math.max(1, Math.round(width / (height * GLYPH_PITCH)));
  // Spread over that span, the first and last glyphs at its ends; one glyph (or too little room
  // for two: a single one, not several drawn over each other) in the middle of the value.
  const spread = fits > 1 && span > glyphWidth;
  const count = spread ? fits : 1;
  const step = spread ? (span - glyphWidth) / (count - 1) : 0;
  const left = spread ? inset : (width - glyphWidth) / 2;
  const middle = bleed + height / 2;
  // As wide as the value: nothing drawn past its ends. Taller, for the blur above and below.
  const canvas = { width, height: height + bleed * 2 };
  return (
    <View aria-hidden style={[styles.glyphs, { left: 0, top: -bleed }, canvas]}>
      <Svg {...canvas}>
        <Defs>
          <Filter id={filterId} filterUnits="userSpaceOnUse" x={0} y={0} {...canvas}>
            <FeGaussianBlur stdDeviation={deviationFor(height * BLUR)} />
          </Filter>
        </Defs>
        <G filter={`url(#${filterId})`} opacity={0.55}>
          {Array.from({ length: count }, (_, index) => {
            const tall = glyphHeight * GLYPH_HEIGHTS[index % GLYPH_HEIGHTS.length]!;
            return (
              <Rect
                key={index}
                x={left + index * step}
                y={middle - tall / 2}
                width={glyphWidth}
                height={tall}
                rx={glyphWidth / 3}
                fill={color}
              />
            );
          })}
        </G>
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  // Invisible, still laid out; on the web, neither selected nor copied with the page.
  hidden: { opacity: 0, ...Platform.select({ web: { userSelect: "none" } as ViewStyle }) },
  glyphs: { position: "absolute", pointerEvents: "none" }
});
