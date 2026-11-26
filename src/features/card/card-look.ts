import { defaultCardColor, type CardColor, type CardState } from "@/lib/card/card-record";
import type { ImageRef } from "@/lib/media/image";
import { contrastRatio, hexLuminance, type ImageArea } from "@/lib/media/luminance";
import { lightColors, palette } from "@/theme";

/*
 * How a card shows in "Cards": a v2 card its issuer's visual, with the name its holder gave it
 * only, never "Card 9D81" (CardFaceView.tsx; its printed number goes under it, CardUnderFace); any
 * other card a colour of the palette (the one drawn for it, until its holder chooses another) or an
 * image its holder imported, with its name only. The name's ink keeps a contrast of 4.5:1 at least
 * over each colour (card-look.test.ts).
 */

/** A card's shape, width over height: ISO/IEC 7810 ID-1 (85.60 × 53.98 mm), a BoltCard's. */
export const CARD_ASPECT = 85.6 / 53.98;

/**
 * A card's face as "Cards" draws it (CardFaceView.tsx), at its width there: its padding, and its
 * name's size and line (1.5 times its size, Poppins' line and Plus Jakarta Sans' own, `fonts.ts`).
 * Every other drawing of a face ("Customize", "Frame the image") scales it.
 */
export const CARD_FACE = {
  width: 300,
  paddingTop: 16,
  paddingSide: 18,
  nameSize: 16,
  nameLine: 24,
  numberSize: 13,
  radius: 16
} as const;

/**
 * A card in a pause as "Cards" draws it, at CARD_FACE's width: its face crossed with diagonal
 * stripes in the ink of its name (`band` wide, `gap` apart, at `opacity`: its name keeps 4.5:1 over
 * them on every colour of the palette, card-look.test.ts), and, on the phone's carousel, a white
 * pause badge in its lower right corner (a desktop's faces have none, CardFaceView.tsx).
 */
export const CARD_PAUSE = {
  band: 9,
  gap: 9,
  opacity: 0.14,
  badge: 34,
  /** The badge's distance to the face's right and bottom edges. */
  badgeInset: 14,
  icon: 12
} as const;

/**
 * The stripes of a face `width` × `height` in a pause, `scale` times CARD_FACE's: one path of
 * parallelograms rising to the right at 45°, from beyond its left edge to beyond its right one (the
 * face clips them).
 */
export function pauseStripesPath(width: number, height: number, scale: number): string {
  const band = CARD_PAUSE.band * scale * Math.SQRT2;
  const step = (CARD_PAUSE.band + CARD_PAUSE.gap) * scale * Math.SQRT2;
  // A face without size draws nothing: a step of 0 would never reach its right edge.
  if (!(step > 0) || !Number.isFinite(width) || !Number.isFinite(height)) return "";
  const at = (value: number) => Number(value.toFixed(2));
  const parts: string[] = [];
  for (let x = -height; x < width; x += step) {
    parts.push(
      `M${at(x)} ${at(height)}L${at(x + band)} ${at(height)}L${at(x + band + height)} 0L${at(x + height)} 0Z`
    );
  }
  return parts.join("");
}

/**
 * Where a card's name is written on its face, as fractions of it: its whole line, whatever the
 * name's length (a card is renamed without its look being chosen again).
 */
export const CARD_NAME_ZONE: ImageArea = {
  left: CARD_FACE.paddingSide / CARD_FACE.width,
  right: 1 - CARD_FACE.paddingSide / CARD_FACE.width,
  top: (CARD_FACE.paddingTop * CARD_ASPECT) / CARD_FACE.width,
  bottom: ((CARD_FACE.paddingTop + CARD_FACE.nameLine) * CARD_ASPECT) / CARD_FACE.width
};

const INK_LIGHT = hexLuminance(palette.ink);
const WHITE_LIGHT = hexLuminance(palette.white);

/**
 * The ink of a name written over an image whose light there is `light` (relative luminance,
 * luminance.ts): "dark" (the app's ink) where it contrasts more than white would, else "light":
 * black or white, by how light the image is where the name is.
 */
export function inkOver(light: number): "dark" | "light" {
  return contrastRatio(light, INK_LIGHT) >= contrastRatio(light, WHITE_LIGHT) ? "dark" : "light";
}

/** Each colour of the palette (CARD_COLORS): its fill, and the ink of the name over it. */
export const CARD_PALETTE: Readonly<Record<CardColor, { fill: string; ink: string }>> = {
  ink: { fill: palette.ink, ink: palette.white },
  night: { fill: lightColors.cardFace.night, ink: palette.white },
  plum: { fill: lightColors.cardFace.plum, ink: palette.white },
  bordeaux: { fill: lightColors.cardFace.bordeaux, ink: palette.white },
  fir: { fill: lightColors.cardFace.fir, ink: palette.white },
  lagoon: { fill: lightColors.cardFace.lagoon, ink: palette.white },
  copper: { fill: lightColors.cardFace.copper, ink: palette.white },
  bitcoin: { fill: palette.orange, ink: palette.ink }
};

/** What a card's face shows, and the ink of what is written on it. */
export type CardFace =
  /** A v2 card's visual: the name its holder gave it over it, if any. */
  | { kind: "issuer"; image: ImageRef; ink: string }
  /** An image its holder imported: its name over it. */
  | { kind: "image"; image: ImageRef; ink: string }
  | { kind: "color"; color: CardColor; fill: string; ink: string };

/** The ink of what is written on a v2 card's visual: the app's ink on a light card, else white. */
export function issuerInk(white: boolean): string {
  return white ? palette.ink : palette.white;
}

/** The face of the card `state`: its issuer's visual first, else its look, else its colour. */
export function cardFace(state: Pick<CardState, "cardId" | "look" | "issuer">): CardFace {
  if (state.issuer) {
    return {
      kind: "issuer",
      image: state.issuer.image,
      ink: issuerInk(state.issuer.white)
    };
  }
  if (state.look?.kind === "image") {
    return {
      kind: "image",
      image: state.look.image,
      ink: state.look.ink === "dark" ? palette.ink : palette.white
    };
  }
  const color = state.look?.kind === "color" ? state.look.color : defaultCardColor(state.cardId);
  return { kind: "color", color, ...CARD_PALETTE[color] };
}
