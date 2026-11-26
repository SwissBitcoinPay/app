/*
 * The arithmetic of "Organise" (SortableTrack.tsx): cards of one size in a line, one dragged
 * along it. Pure, so that it is tested apart from the gestures.
 */

/** `ids` with `id` moved to the place `to` (clamped to the list), the others in their order. */
export function moveId(ids: readonly string[], id: string, to: number): string[] {
  const from = ids.indexOf(id);
  if (from < 0) return [...ids];
  const rest = ids.filter((other) => other !== id);
  const at = Math.max(0, Math.min(rest.length, to));
  return [...rest.slice(0, at), id, ...rest.slice(at)];
}

/**
 * An order chosen (`draft`) kept in step with the cards there are now (`current`): a card gone
 * meanwhile (deleted elsewhere) leaves it, one added comes last, in `current`'s order.
 */
export function withCurrentIds(draft: readonly string[], current: readonly string[]): string[] {
  const now = new Set(current);
  const chosen = new Set(draft);
  return [...draft.filter((id) => now.has(id)), ...current.filter((id) => !chosen.has(id))];
}

/**
 * The place a card dragged from `from` by `delta` points along the line (each place `pitch`
 * apart): the nearest one, within the `count` places.
 */
export function targetIndex(from: number, delta: number, pitch: number, count: number): number {
  if (count <= 0 || pitch <= 0) return 0;
  return Math.max(0, Math.min(count - 1, from + Math.round(delta / pitch)));
}

/**
 * How far the line scrolls at each step while a card is dragged near one of its ends: `-step`
 * (back) when the card's start is within `edge` of the visible part's start, `step` (on) when its
 * end is within `edge` of the visible part's end, 0 otherwise. `start` is the card's position in
 * the visible part, `size` its length, `visible` the visible part's length.
 */
export function edgeScroll(
  start: number,
  size: number,
  visible: number,
  edge: number,
  step: number
): number {
  if (visible <= 0) return 0;
  if (start < edge) return -step;
  if (start + size > visible - edge) return step;
  return 0;
}

/**
 * How far an arrow scrolls the line: what it shows of whole cards, one card less, so that the
 * last card seen stays as a landmark; one card at least.
 */
export function pageScroll(visible: number, pitch: number): number {
  if (pitch <= 0) return 0;
  return Math.max(1, Math.floor(visible / pitch) - 1) * pitch;
}

/**
 * The pointer's speed (points a ms) at which a dragged card leans its most: a card carried at an
 * unhurried pace (300 points a second) leans half of it. At 1.2, it hardly leans.
 */
export const FULL_SWAY_SPEED = 0.6;

/**
 * How far a dragged card leans (degrees) as the pointer carries it at `speed` (points a ms, signed
 * along the line): with its movement, in proportion, `max` at most either way. Its body lags behind
 * what holds it, as a card held by one point would.
 */
export function swayOf(speed: number, max: number): number {
  if (!Number.isFinite(speed) || max <= 0) return 0;
  return Math.max(-max, Math.min(max, (speed / FULL_SWAY_SPEED) * max));
}
