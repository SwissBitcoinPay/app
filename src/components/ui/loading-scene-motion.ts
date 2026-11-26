/*
 * The movements of the loading scenes (LoadingScene.tsx), as functions of a loop's position (0 to
 * 1, linear): each piece of a scene reads its place, scale or opacity from one Reanimated loop, on
 * the UI thread. `still` is Reduce Motion: nothing moves, each piece rests where it reads best.
 * Lengths are in the scenes' units (a scene is 120 units square).
 */

/** The scenes' loops (ms). */
export const WALLET_CYCLE = 1500;
export const CARDS_CYCLE = 1400;
export const TEAM_CYCLE = 1500;
export const PACKETS_CYCLE = 1000;
export const BUSY_CYCLE = 800;
export const INVOICE_CYCLE = 3200;
export const PAYMENT_CYCLE = 2400;
export const ARTICLES_CYCLE = 1800;

/** The coins, one after the other: each falls this late in the loop (ms). */
export const COIN_DELAYS = [0, 500, 1000] as const;
/** The avatars, from left to right: each jumps this late in the loop (ms). */
export const HOP_DELAYS = [0, 200, 400] as const;
/** The packets, two each way, each this late in the loop (ms). */
export const OUT_DELAYS = [0, 500] as const;
export const BACK_DELAYS = [250, 750] as const;

function clamp01(x: number): number {
  "worklet";
  return Math.min(1, Math.max(0, x));
}

function easeIn(x: number): number {
  "worklet";
  return x * x * x;
}

function easeOut(x: number): number {
  "worklet";
  return 1 - Math.pow(1 - x, 3);
}

function easeInOut(x: number): number {
  "worklet";
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

/**
 * Where a piece is in its own loop at `position` of the scene's loop, `delay` ms late in a loop of
 * `cycle` ms: 0 to 1. A position a hair outside the loop (Reanimated can start a repeat at
 * -0.001) reads as its ends.
 */
export function phaseAt(position: number, delay: number, cycle: number): number {
  "worklet";
  const local = clamp01(position) - delay / cycle;
  return local - Math.floor(local);
}

/** From `from` to `to` over the span `start`–`end` of a loop, eased, at `at`. */
function span(
  at: number,
  start: number,
  end: number,
  from: number,
  to: number,
  ease: (x: number) => number
): number {
  "worklet";
  return from + (to - from) * ease(clamp01((at - start) / (end - start)));
}

/**
 * A coin of the wallet: it falls into the wallet, speeding up (70 % of its loop), fading in at the
 * start and out once in. Its place: units below its drawing. Still: the first coin rests above
 * the wallet, the others are not drawn.
 */
export function coinAt(
  position: number,
  index: number,
  still: boolean
): { y: number; opacity: number } {
  "worklet";
  if (still) return { y: 0, opacity: index === 0 ? 1 : 0 };
  const at = phaseAt(position, COIN_DELAYS[index] ?? 0, WALLET_CYCLE);
  const y = at < 0.7 ? span(at, 0, 0.7, -34, 22, easeIn) : 22;
  const opacity = at < 0.15 ? at / 0.15 : at < 0.7 ? 1 : 1 - (at - 0.7) / 0.3;
  return { y, opacity };
}

/**
 * The beam reading the card: it sweeps the card from its top to its bottom (52 units), fading in
 * and out at the ends. Still: no beam.
 */
export function beamAt(position: number, still: boolean): { y: number; opacity: number } {
  "worklet";
  if (still) return { y: 0, opacity: 0 };
  const at = clamp01(position);
  const opacity = at < 0.12 ? at / 0.12 : at < 0.88 ? 1 : (1 - at) / 0.12;
  return { y: 52 * easeInOut(at), opacity };
}

/**
 * An avatar of the team: it crouches, jumps 16 units, lands squashed, then rests; orange while in
 * the air (a switch, never a blend of the ink and the orange). Its shadow shrinks and fades while
 * it is up. Still: at rest, in ink.
 */
export function hopAt(
  position: number,
  index: number,
  still: boolean
): {
  y: number;
  scaleX: number;
  scaleY: number;
  lit: boolean;
  shadowScale: number;
  shadowOpacity: number;
} {
  "worklet";
  const rest = { y: 0, scaleX: 1, scaleY: 1, lit: false, shadowScale: 1, shadowOpacity: 1 };
  if (still) return rest;
  const at = phaseAt(position, HOP_DELAYS[index] ?? 0, TEAM_CYCLE);
  const lit = at >= 0.14 && at < 0.42;
  const shadowScale =
    at < 0.28 ? span(at, 0, 0.28, 1, 0.55, easeInOut) : span(at, 0.28, 0.46, 0.55, 1, easeInOut);
  const shadowOpacity =
    at < 0.28 ? span(at, 0, 0.28, 1, 0.4, easeInOut) : span(at, 0.28, 0.46, 0.4, 1, easeInOut);
  if (at < 0.08) {
    return {
      y: 0,
      scaleX: span(at, 0, 0.08, 1, 1.06, easeInOut),
      scaleY: span(at, 0, 0.08, 1, 0.92, easeInOut),
      lit,
      shadowScale,
      shadowOpacity
    };
  }
  if (at < 0.28) {
    return {
      y: span(at, 0.08, 0.28, 0, -16, easeOut),
      scaleX: span(at, 0.08, 0.28, 1.06, 0.97, easeOut),
      scaleY: span(at, 0.08, 0.28, 0.92, 1.04, easeOut),
      lit,
      shadowScale,
      shadowOpacity
    };
  }
  if (at < 0.46) {
    return {
      y: span(at, 0.28, 0.46, -16, 0, easeIn),
      scaleX: span(at, 0.28, 0.46, 0.97, 1.05, easeIn),
      scaleY: span(at, 0.28, 0.46, 1.04, 0.94, easeIn),
      lit,
      shadowScale,
      shadowOpacity
    };
  }
  if (at < 0.62) {
    return {
      y: 0,
      scaleX: span(at, 0.46, 0.62, 1.05, 1, easeOut),
      scaleY: span(at, 0.46, 0.62, 0.94, 1, easeOut),
      lit,
      shadowScale,
      shadowOpacity
    };
  }
  return rest;
}

/**
 * A packet between the shop and its server: it crosses the 18 units between them, fading in and
 * out at the ends, `delay` ms late. Still: none.
 */
export function packetAt(
  position: number,
  delay: number,
  still: boolean
): { x: number; opacity: number } {
  "worklet";
  if (still) return { x: 0, opacity: 0 };
  const at = phaseAt(position, delay, PACKETS_CYCLE);
  const opacity = at < 0.2 ? at / 0.2 : at < 0.8 ? 1 : (1 - at) / 0.2;
  return { x: 18 * at, opacity };
}

/** The server's busy light: it pulses between 30 % and full. Still: lit. */
export function busyAt(position: number, still: boolean): number {
  "worklet";
  if (still) return 1;
  return 0.3 + 0.7 * ((1 - Math.cos(2 * Math.PI * clamp01(position))) / 2);
}

/**
 * The invoice's lines, then its total: each fills from its left in its own span of the loop,
 * all of them stay, then fade out together before the loop starts again.
 */
const FILLS = [
  [0.06, 0.2],
  [0.22, 0.36],
  [0.38, 0.52],
  [0.54, 0.68],
  [0.7, 0.8]
] as const;
/** The invoice's lines' lengths (units), then the total's: where the caret ends each one. */
export const LINE_LENGTHS = [44, 36, 40, 28, 24] as const;
/** The lines' rows (units below the first), then the total's: where the caret writes. */
const LINE_ROWS = [0, 10, 20, 30, 42.5] as const;
/** Where the total starts (units right of the lines' start). */
const TOTAL_START = 20;

/** Line `index` of the invoice: how much of it is drawn (0 to 1), and its opacity. Still: whole. */
export function fillAt(
  position: number,
  index: number,
  still: boolean
): { scale: number; opacity: number } {
  "worklet";
  if (still) return { scale: 1, opacity: 1 };
  const at = clamp01(position);
  const [start, end] = FILLS[index] ?? FILLS[0];
  if (at >= 0.94) return { scale: 0, opacity: 0 };
  const opacity = at < 0.86 ? 1 : 1 - (at - 0.86) / 0.08;
  return { scale: span(at, start, end, 0, 1, easeInOut), opacity };
}

/**
 * The caret writing the invoice: it moves along each line as it fills (the same easing), jumps to
 * the next one, then writes the total; it fades in at the start and out once the total is
 * written. Still: none.
 */
export function caretAt(
  position: number,
  still: boolean
): { x: number; y: number; opacity: number } {
  "worklet";
  if (still) return { x: 0, y: 0, opacity: 0 };
  const at = clamp01(position);
  const opacity = at < 0.06 ? at / 0.06 : at < 0.8 ? 1 : at < 0.86 ? 1 - (at - 0.8) / 0.06 : 0;
  for (let index = 0; index < FILLS.length; index++) {
    const [start, end] = FILLS[index];
    const from = index === FILLS.length - 1 ? TOTAL_START : 0;
    const to = index === FILLS.length - 1 ? TOTAL_START + LINE_LENGTHS[index] : LINE_LENGTHS[index];
    if (at <= end) {
      if (at < start) {
        // Between two lines: from the end of the line before to the start of this one.
        const previous = index === 0 ? null : FILLS[index - 1];
        if (previous === null) return { x: 0, y: 0, opacity };
        const back = LINE_LENGTHS[index - 1];
        return {
          x: span(at, previous[1], start, back, from, easeInOut),
          y: span(at, previous[1], start, LINE_ROWS[index - 1], LINE_ROWS[index], easeInOut),
          opacity
        };
      }
      return { x: span(at, start, end, from, to, easeInOut), y: LINE_ROWS[index], opacity };
    }
  }
  return { x: TOTAL_START + LINE_LENGTHS[4], y: LINE_ROWS[4], opacity };
}

/**
 * The loupe looking for the payment request: it circles the code, 12 units from its centre,
 * clockwise from above. Still: over the code's centre.
 */
export function loupeAt(position: number, still: boolean): { x: number; y: number } {
  "worklet";
  if (still) return { x: 0, y: 0 };
  const angle = 2 * Math.PI * clamp01(position);
  return { x: 12 * Math.sin(angle), y: -12 * Math.cos(angle) };
}

/**
 * The code's finder squares, where the loupe passes over them (a share of its loop): top right,
 * bottom left, top left.
 */
export const FINDER_PASSES = [0.125, 0.625, 0.875] as const;

/**
 * A finder square of the code: dim, lit fully as the loupe passes over it (`pass`, a share of its
 * loop), dimming back. Still: lit.
 */
export function finderAt(position: number, pass: number, still: boolean): number {
  "worklet";
  if (still) return 1;
  const at = phaseAt(position, pass * PAYMENT_CYCLE, PAYMENT_CYCLE);
  if (at < 0.22) return 1 - (0.65 * at) / 0.22;
  if (at < 0.78) return 0.35;
  return 0.35 + (0.65 * (at - 0.78)) / 0.22;
}

/** The price tag's swing, each way (degrees). */
export const SWING_DEGREES = 12;

/**
 * The price tag swinging on its pin, a pendulum: its angle (degrees, clockwise), widest at a
 * quarter and three quarters of the loop, and its shadow's shift on the ground (units), following
 * its foot. Still: hanging straight.
 */
export function swingAt(position: number, still: boolean): { angle: number; shift: number } {
  "worklet";
  if (still) return { angle: 0, shift: 0 };
  const sway = Math.sin(clamp01(position) * 2 * Math.PI);
  // Its foot, 60 units under the pin, moves sideways by sin(angle) of that.
  const angle = SWING_DEGREES * sway;
  return { angle, shift: -60 * Math.sin((angle * Math.PI) / 180) };
}
