import type { ImageCrop } from "@/features/media/pick-image";
import { meanLight, type ImageArea, type LightMap } from "@/lib/media/luminance";

import { CARD_NAME_ZONE, inkOver } from "./card-look";

/*
 * The geometry of "Frame the image" (CardImageFramer.tsx): an
 * image under a window of the card's shape, which it always covers, zoomed from 1 (the smallest
 * that covers the window) to MAX_ZOOM and moved under it; the part the window shows becomes the
 * card's image (cardJpeg), the name written over it in the ink of the light where it goes.
 */

/** From the image covering the card's window to three times that (its buttons). */
export const MIN_ZOOM = 1;
export const MAX_ZOOM = 3;
/** One press of "Zoom in" or "Zoom out". */
export const ZOOM_STEP = 0.25;

type Size = { width: number; height: number };

/** Where the image is under the window: its zoom, and how far its middle is from the window's. */
export type Framing = { zoom: number; x: number; y: number };

/** The image covering the window, its middle under the window's: where framing starts. */
export const CENTRED: Framing = { zoom: MIN_ZOOM, x: 0, y: 0 };

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

/** The scale of the image (window's units per pixel) at zoom 1: the smallest that covers it. */
export function coverScale(image: Size, window: Size): number {
  return Math.max(window.width / image.width, window.height / image.height);
}

/** `framing` within bounds: its zoom between MIN_ZOOM and MAX_ZOOM, the window covered. */
export function clampFraming(image: Size, window: Size, framing: Framing): Framing {
  const zoom = clamp(Number.isFinite(framing.zoom) ? framing.zoom : MIN_ZOOM, MIN_ZOOM, MAX_ZOOM);
  const scale = coverScale(image, window) * zoom;
  const maxX = Math.max(0, (image.width * scale - window.width) / 2);
  const maxY = Math.max(0, (image.height * scale - window.height) / 2);
  return {
    zoom,
    x: clamp(Number.isFinite(framing.x) ? framing.x : 0, -maxX, maxX),
    y: clamp(Number.isFinite(framing.y) ? framing.y : 0, -maxY, maxY)
  };
}

/** `framing` zoomed to `zoom`, the point of the image under the window's middle kept there. */
export function zoomTo(image: Size, window: Size, framing: Framing, zoom: number): Framing {
  const next = clamp(zoom, MIN_ZOOM, MAX_ZOOM);
  const ratio = next / framing.zoom;
  return clampFraming(image, window, { zoom: next, x: framing.x * ratio, y: framing.y * ratio });
}

/** The part of the image the window shows: whole pixels, within the image. */
export function cropOf(image: Size, window: Size, framing: Framing): ImageCrop {
  const scale = coverScale(image, window) * framing.zoom;
  const width = clamp(Math.round(window.width / scale), 1, image.width);
  const height = clamp(Math.round(window.height / scale), 1, image.height);
  const middleX = image.width / 2 - framing.x / scale;
  const middleY = image.height / 2 - framing.y / scale;
  return {
    originX: clamp(Math.round(middleX - width / 2), 0, image.width - width),
    originY: clamp(Math.round(middleY - height / 2), 0, image.height - height),
    width,
    height
  };
}

/** Where the name goes over `crop` of the image (CARD_NAME_ZONE): fractions of the whole image. */
export function nameAreaOf(image: Size, crop: ImageCrop): ImageArea {
  return {
    left: (crop.originX + CARD_NAME_ZONE.left * crop.width) / image.width,
    right: (crop.originX + CARD_NAME_ZONE.right * crop.width) / image.width,
    top: (crop.originY + CARD_NAME_ZONE.top * crop.height) / image.height,
    bottom: (crop.originY + CARD_NAME_ZONE.bottom * crop.height) / image.height
  };
}

/** The ink of the name over `crop` of the image whose light is `light`. */
export function inkOverCrop(image: Size, light: LightMap, crop: ImageCrop): "dark" | "light" {
  return inkOver(meanLight(light, nameAreaOf(image, crop)));
}
