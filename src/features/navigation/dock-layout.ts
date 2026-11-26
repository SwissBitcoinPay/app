import { DOCK_SLOTS, type Destination } from "./destinations";

/** The dock: a 6 px white pill around 48 px tall items. */
export const DOCK = {
  item: 48,
  padding: 6,
  /** Till mode's padlock. */
  lock: 56,
  /**
   * "More" shared with the screen shown when it is out of the dock (its icon, a hairline, the
   * menu).
   */
  split: 92,
  /** The touch floor: no slot is narrower. */
  minSlot: 44,
  /** Tablets in the mobile layout: the dock stays this wide at most. */
  maxWidth: 400,
  /** How close to the screen's edges the dock may come when a name needs it (screen gutter otherwise). */
  edge: 12
} as const;

/** The pill's height. */
export const DOCK_HEIGHT = DOCK.item + DOCK.padding * 2;
/** Above the dock, between it and the end of the screen's content. */
export const DOCK_TOP = 14;

/**
 * The slot of the screen shown: its icon and name, centred, like "Charge" in till mode. `pad`
 * on each side, `gap` between the icon and the name.
 */
export type PillSpacing = { pad: number; gap: number };
export const PILL: PillSpacing = { pad: 17, gap: 8 };
/** Tighter, when the longest name of the dock does not fit otherwise (narrow screens). */
export const COMPACT_PILL: PillSpacing = { pad: 12, gap: 6 };

/** Measured widths of a destination's icon and name in the dock. */
export type PillSizes = { icon: number; label: number };

/** Where a slot (or "More") goes: from the dock's inner left edge (after its padding). */
export type Place = { left: number; width: number };

export type DockLayoutInput = {
  windowWidth: number;
  gutter: number;
  dock: readonly Destination[];
  /** The slot of the screen shown, -1 when it is not in the dock. */
  active: number;
  /** "More" is shared with the screen shown (unlocked, out of the dock). */
  split: boolean;
  /** Every destination's measured sizes; null until they are known (no name shown then). */
  sizes: Readonly<Record<Destination, PillSizes>> | null;
};

export type DockLayout = {
  /** Of the unlocked dock. */
  width: number;
  /** The slots touch each other. */
  slots: Place[];
  plus: Place;
  /** The slot showing its name, -1 when none. */
  labelled: number;
  pill: PillSpacing;
  /** Room for the name in the labelled slot: less than the name when it is cut ("…"). */
  labelWidth: number;
};

function pillWidth(sizes: PillSizes, pill: PillSpacing): number {
  return 2 * pill.pad + sizes.icon + pill.gap + sizes.label;
}

/**
 * Where the unlocked dock's slots go. The slot of the screen shown widens
 * to show its name; the other slots and "More" share the rest, never under 44 px. The dock is as
 * wide as the screen's gutters (400 px at most), wider only when the longest name of its
 * destinations needs it, down to 12 px from the edges; then the pill gets tighter; a name that
 * still does not fit is cut. Its width depends on the dock's destinations, not on the screen
 * shown: it does not change from one screen to another.
 */
export function dockLayout({
  windowWidth,
  gutter,
  dock,
  active,
  split,
  sizes
}: DockLayoutInput): DockLayout {
  const others = DOCK_SLOTS * DOCK.minSlot + 2 * DOCK.padding;
  const widest = (pill: PillSpacing) =>
    Math.max(DOCK.split, ...(sizes ? dock.map((d) => pillWidth(sizes[d], pill)) : []));
  const base = Math.min(windowWidth - 2 * gutter, DOCK.maxWidth);
  const needed = others + widest(PILL);
  const width = needed <= base ? base : Math.min(needed, windowWidth - 2 * DOCK.edge);
  const pill = needed <= width ? PILL : COMPACT_PILL;
  const inner = width - 2 * DOCK.padding;

  let widths: number[];
  let plusWidth: number;
  let labelled = -1;
  let labelWidth = 0;
  if (split) {
    plusWidth = DOCK.split;
    widths = dock.map(() => (inner - DOCK.split) / DOCK_SLOTS);
  } else if (active !== -1 && sizes) {
    const own = sizes[dock[active]!];
    const activeWidth = Math.min(pillWidth(own, pill), inner - DOCK_SLOTS * DOCK.minSlot);
    plusWidth = (inner - activeWidth) / DOCK_SLOTS;
    widths = dock.map((_, i) => (i === active ? activeWidth : plusWidth));
    labelled = active;
    labelWidth = Math.max(0, Math.min(own.label, activeWidth - 2 * pill.pad - own.icon - pill.gap));
  } else {
    plusWidth = inner / (DOCK_SLOTS + 1);
    widths = dock.map(() => plusWidth);
  }

  let left = 0;
  const slots = widths.map((slotWidth) => {
    const slot = { left, width: slotWidth };
    left += slotWidth;
    return slot;
  });
  return { width, slots, plus: { left, width: plusWidth }, labelled, pill, labelWidth };
}

/**
 * An employee's dock (MemberNavigation): its slots side by side, `between` apart. The slot of the
 * screen shown fits its icon and its name, `pad` on each side and `gap` between them, like
 * "Charge" in the owner's till mode; the others are `slot` wide.
 */
export const MEMBER_DOCK = { slot: 54, pad: 18, gap: 8, between: 4 } as const;

export type MemberDockLayout = {
  /** Of the whole dock, its padding included: it fits its slots. */
  width: number;
  slots: Place[];
  /** The slot showing its name, -1 when none. */
  labelled: number;
  /** Room for the name in the labelled slot: less than the name when it is cut ("…"). */
  labelWidth: number;
};

/**
 * Where an employee's dock places its slots. `sizes` (the screen's icon as the slot shown draws it,
 * and its name, per slot) are null until measured: no name shows then. Unlike the owner's, the dock
 * is as wide as its slots: its width follows the name of the screen shown, up to `maxWidth` (the
 * window, 12 px from its edges), past which the name is cut, as in the owner's dock.
 */
export function memberDockLayout(
  count: number,
  active: number,
  sizes: readonly PillSizes[] | null,
  maxWidth = Infinity
): MemberDockLayout {
  const labelled = sizes && active >= 0 && active < count ? active : -1;
  // What the other slots, the room between the slots and the dock's padding leave to the one shown.
  const others = (count - 1) * (MEMBER_DOCK.slot + MEMBER_DOCK.between) + 2 * DOCK.padding;
  let labelWidth = 0;
  let left = 0;
  const slots: Place[] = [];
  for (let index = 0; index < count; index++) {
    let width: number = MEMBER_DOCK.slot;
    if (index === labelled) {
      const own = sizes![index]!;
      const frame = 2 * MEMBER_DOCK.pad + own.icon + MEMBER_DOCK.gap;
      width = Math.max(MEMBER_DOCK.slot, Math.min(frame + own.label, maxWidth - others));
      labelWidth = Math.max(0, Math.min(own.label, width - frame));
    }
    slots.push({ left, width });
    left += width + MEMBER_DOCK.between;
  }
  const inner = count > 0 ? left - MEMBER_DOCK.between : 0;
  return { width: inner + 2 * DOCK.padding, slots, labelled, labelWidth };
}
