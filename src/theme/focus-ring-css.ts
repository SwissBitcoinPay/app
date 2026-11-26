import type { Theme } from "./theme";
import { stroke } from "./tokens";

/**
 * The design system's keyboard focus ("Focus: 1.5 px orange border + 4 px apricot halo. Never the
 * browser outline."), for the web, where the keyboard moves the focus. On whatever
 * the keyboard reaches: buttons, rows, links, switches. The ring is an outline drawn over the
 * element's own edge (its offset, the stroke's width inward), so that it takes the place of a
 * button's ring and follows its corners; the halo is the focus shadow, which takes the place of
 * the element's own shadows while it is focused (inline styles: hence `!important`). A row that
 * draws the ring further inside (ListRow, in a card that clips its rows) keeps its own offset; its
 * card then clips the halo, the ring stays. In the theme drawn: the dark theme's halo is its own.
 *
 * Fields are left out: a text field shows its focus on its frame, in orange, without a halo (the
 * design system's TextField), and hides the browser's ring on its input (TextField.tsx).
 */
export function focusRingCss({ colors, shadow }: Theme): string {
  return (
    ":focus-visible:not(input):not(textarea){" +
    `outline:${stroke.control}px solid ${colors.border.accent};` +
    `outline-offset:-${stroke.control}px;` +
    `box-shadow:${shadow.focusRing} !important}`
  );
}
