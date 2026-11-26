/*
 * The welcome screen's headline, "Payments in bitcoin." (src/app/index.tsx): its size follows
 * the window's width so that it fits one line. The
 * ratios were measured with the app's Plus Jakarta Sans ExtraBold at the titles'
 * tracking: the French headline is 10.15 times its size wide. A longer translation (Portuguese,
 * 11.5 times) wraps on two lines, never cut.
 */

/**
 * On a phone: 32 px, smaller on a narrower one (8.2 % of the window's width, by half pixels):
 * 29.5 px at 360 px, where the line is 300 px of its 316 px; 32 px from 390 px.
 */
export function mobileHeadlineSize(width: number): number {
  return Math.min(32, Math.round(width * 0.082 * 2) / 2);
}

/**
 * On a desktop, in the ink half: 3.9 % of the window's width, between 36 and 56 px (40 px at
 * 1024 px, where the line is 406 px of the half's 432 px; 56 px from 1440 px).
 */
export function desktopHeadlineSize(width: number): number {
  return Math.max(36, Math.min(56, Math.round(width * 0.039)));
}

/** The headline at a size: the titles' line, 1.14 em, tighter (1.08 em) from 40 px. */
export function headlineLineHeight(size: number): number {
  return Math.round(size * (size >= 40 ? 1.08 : 1.14));
}
