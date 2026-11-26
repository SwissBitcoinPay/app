import type { TextStyle } from "react-native";

/**
 * Two families: Plus Jakarta Sans for everything read (the brand kit's, in place of the design
 * system's Poppins), JetBrains Mono for everything counted or copied (amounts, sats,
 * timers, IBAN).
 *
 * Custom fonts are registered once per weight (see `fonts.ts`): React Native
 * does not synthesise weights for custom families on Android, so a weight is
 * selected by picking its family, never with `fontWeight`.
 */
export type Weight = 400 | 500 | 600 | 700;

/**
 * The design's weights, set in Poppins, drawn one weight heavier in Plus Jakarta Sans: at the same
 * weight, its strokes are thinner for their x-height (stem of "l" over x-height: Poppins 400,
 * 500, 600, 700 at 0.17, 0.21, 0.25, 0.31; Plus Jakarta Sans 500, 600, 700, 800 at 0.17, 0.21,
 * 0.24, 0.28), and text drawn at the design's own weights reads too light.
 */
const SANS: Record<Weight, string> = {
  400: "PlusJakartaSans-Medium",
  500: "PlusJakartaSans-SemiBold",
  600: "PlusJakartaSans-Bold",
  700: "PlusJakartaSans-ExtraBold"
};

const MONO: Record<Weight, string> = {
  400: "JetBrainsMono-Regular",
  500: "JetBrainsMono-Medium",
  // The design never sets mono at 600: fall back to the closest shipped weight.
  600: "JetBrainsMono-Bold",
  700: "JetBrainsMono-Bold"
};

/**
 * Without the font's padding on Android: it would add room above and below the line for the
 * tallest glyph of the font (Vietnamese capitals, up to 1294 units above the baseline), more
 * above than below, and text centred in a box would sit low there too. The line is then the
 * font's own, 1.5 em with the capitals in its middle (`fonts.ts`), as on iOS and the web; no
 * glyph of the app's languages reaches beyond it.
 */
export function sans(weight: Weight): TextStyle {
  return { fontFamily: SANS[weight], includeFontPadding: false };
}

export function mono(weight: Weight): TextStyle {
  return { fontFamily: MONO[weight], fontVariant: ["tabular-nums"] };
}

/** CSS letter-spacing in `em` converted to React Native points. */
export function tracking(em: number, fontSize: number): number {
  return Math.round(em * fontSize * 100) / 100;
}

/** Role-named sizes from tokens/typography.css. */
export const type = {
  amountDisplay: 76,
  amountLarge: 52,
  keypad: 28,
  title: 19,
  action: 17,
  body: 15,
  prose: 14,
  label: 13.5,
  caption: 12.5,
  fieldLabel: 12.5,
  tabLabel: 11.5,
  overline: 11,
  sats: 14.5,
  timer: 16,
  meta: 11.5
} as const;

/**
 * The design system's letter-spacing of the roles it tightens (`type-*-tracking`), as React Native
 * points: the amounts −0.05 em, the titles −0.02 em, the actions (every button's label) and the
 * labels −0.01 em. Set wherever
 * the role is, in the sans family only (mono figures keep their own spacing). A title or an amount
 * of another size takes its role's em through `tracking` (TITLE_EM, AMOUNT_EM).
 */
export const AMOUNT_EM = -0.05;
export const TITLE_EM = -0.02;
const ACTION_EM = -0.01;
const LABEL_EM = -0.01;

export const tracked = {
  amountDisplay: tracking(AMOUNT_EM, type.amountDisplay),
  amountLarge: tracking(AMOUNT_EM, type.amountLarge),
  title: tracking(TITLE_EM, type.title),
  action: tracking(ACTION_EM, type.action),
  label: tracking(LABEL_EM, type.label)
} as const;

/** Prose is the only role with generous leading (1.5). */
export const proseLineHeight = type.prose * 1.5;
