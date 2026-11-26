import type { Rgb } from "./png";

/*
 * How light an image is, place by place ("Frame the image": the name over an imported image in
 * black or in white, by how light the image is where the name
 * is written): the relative luminance of WCAG 2.x, the one its contrast ratios are worked out from,
 * cell by cell of a small copy of the image (card-image.ts), then averaged over a part of it, each
 * cell by the share of it the part covers. Linear light, so that an average is the light the eye
 * gets from the part as a whole.
 */

/** The relative luminance (WCAG 2.x) of an sRGB colour of 8 bits a channel: 0 black, 1 white. */
export function relativeLuminance({ r, g, b }: Rgb): number {
  const linear = (channel: number) => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** The relative luminance of a colour written `#RRGGBB`. */
export function hexLuminance(hex: string): number {
  const value = /^#([0-9a-f]{6})$/i.exec(hex)?.[1];
  if (!value) throw new Error("Not a colour of six hex digits");
  const channel = (at: number) => Number.parseInt(value.slice(at, at + 2), 16);
  return relativeLuminance({ r: channel(0), g: channel(2), b: channel(4) });
}

/** The contrast ratio (WCAG 2.x) of two relative luminances: 1 to 21. */
export function contrastRatio(a: number, b: number): number {
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** How light an image is, cell by cell, row by row: `width` × `height` relative luminances. */
export type LightMap = { width: number; height: number; light: Float64Array };

/** The light map of pixels `width` × `height`, row by row (pngPixels). */
export function lightMapOf(pixels: readonly Rgb[], width: number, height: number): LightMap {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new Error("Not an image's size");
  }
  if (pixels.length !== width * height) throw new Error("Not as many pixels as the size says");
  return { width, height, light: Float64Array.from(pixels, relativeLuminance) };
}

/** A part of an image, its edges as fractions of the image's width and height (0 to 1). */
export type ImageArea = { left: number; top: number; right: number; bottom: number };

/**
 * The mean light of `area` of the image `map` is the light map of: each cell weighted by how much
 * of it the area covers (the area kept within the image). Throws for an area of nothing.
 */
export function meanLight(map: LightMap, area: ImageArea): number {
  const clamp = (value: number) => Math.min(1, Math.max(0, value));
  const left = clamp(area.left) * map.width;
  const right = clamp(area.right) * map.width;
  const top = clamp(area.top) * map.height;
  const bottom = clamp(area.bottom) * map.height;
  if (!(right > left) || !(bottom > top)) throw new Error("An area of nothing");
  let sum = 0;
  let weights = 0;
  for (let y = Math.floor(top); y < Math.ceil(bottom); y++) {
    const rows = Math.min(bottom, y + 1) - Math.max(top, y);
    for (let x = Math.floor(left); x < Math.ceil(right); x++) {
      const weight = rows * (Math.min(right, x + 1) - Math.max(left, x));
      sum += weight * map.light[y * map.width + x]!;
      weights += weight;
    }
  }
  return sum / weights;
}
