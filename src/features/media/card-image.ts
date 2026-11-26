import * as ImageManipulator from "expo-image-manipulator";

import { base64ToBytes } from "@/lib/base64";
import { lightMapOf, type LightMap } from "@/lib/media/luminance";
import { readPng } from "@/lib/media/png";

import { PickImageError, pickImage, type ImageSource } from "./pick-image";

/*
 * An image a card's holder imports ("Customize" and "Frame the image"): picked as it is
 * (pickImage), decoded once at WORKING_SIDE at most (a photo of 50 megapixels would otherwise stay
 * decoded the whole framing; the card's JPEG, 640 px wide at most, comes from a part of it a third
 * of its width at the largest zoom), shown from a JPEG of that copy (the pixels framed are the
 * pixels shown, whatever the photo's orientation), and measured for its light (`light`,
 * luminance.ts): the name over it is written in black or in white by how light it is where the name
 * goes. Neither Hermes nor expo-image-manipulator gives pixels: a copy of LIGHT_SIDE px is saved as
 * a PNG and read (png.ts).
 */

/** The longest side the image is worked at. */
const WORKING_SIDE = 2048;

/**
 * The longest side of the light map: a name's line on the card's face is an eighth of its height,
 * so 7 cells tall or more at the smallest zoom, 2 at the largest, wide and averaged by area.
 */
const LIGHT_SIDE = 96;

/** How the copy to show is compressed: it is only seen, a moment, on the device. */
const SHOWN_COMPRESS = 0.85;

/** An image being framed for a card: release it (`release`) once done with. */
export type CardImageSource = {
  /** The image, decoded at WORKING_SIDE at most: what "Use this image" cuts (cardJpeg). */
  image: ImageManipulator.ImageRef;
  width: number;
  height: number;
  /** A file of it to show while it is framed. */
  uri: string;
  /** How light it is, place by place. */
  light: LightMap;
  /** Frees the decoded image (native memory, collected late otherwise). */
  release: () => void;
};

/** `width` × `height` made to fit `side` on its longest side, never enlarged; 1 px at least. */
export function fitWithin(
  width: number,
  height: number,
  side: number
): { width: number; height: number } {
  const scale = Math.min(1, side / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale))
  };
}

/**
 * Lets the user pick an image from `source` for a card, and gives it ready to be framed; null when
 * the picker or the camera was closed without one. Rejects with a PickImageError.
 */
export async function openCardImage(source: ImageSource): Promise<CardImageSource | null> {
  const picked = await pickImage(source);
  if (!picked) return null;
  let image: ImageManipulator.ImageRef | null = null;
  try {
    image = await workingCopy(picked.uri, picked.width, picked.height);
    const light = await lightOf(image);
    const shown = await image.saveAsync({
      format: ImageManipulator.SaveFormat.JPEG,
      compress: SHOWN_COMPRESS
    });
    const kept = image;
    return {
      image: kept,
      width: kept.width,
      height: kept.height,
      uri: shown.uri,
      light,
      release: () => kept.release()
    };
  } catch (error) {
    image?.release();
    if (error instanceof PickImageError) throw error;
    throw new PickImageError("unreadable", error instanceof Error ? error.message : String(error));
  }
}

/** The picked image decoded at WORKING_SIDE at most (`width` × `height`, 0 when unknown). */
async function workingCopy(
  uri: string,
  width: number,
  height: number
): Promise<ImageManipulator.ImageRef> {
  const context = ImageManipulator.ImageManipulator.manipulate(uri);
  try {
    if (width > 0 && height > 0 && Math.max(width, height) > WORKING_SIDE) {
      context.resize(fitWithin(width, height, WORKING_SIDE));
    }
    const image = await context.renderAsync();
    if (Math.max(image.width, image.height) <= WORKING_SIDE) return image;
    // Its size unknown before it was decoded: made smaller now.
    try {
      const smaller = ImageManipulator.ImageManipulator.manipulate(image);
      try {
        return await smaller
          .resize(fitWithin(image.width, image.height, WORKING_SIDE))
          .renderAsync();
      } finally {
        smaller.release();
      }
    } finally {
      image.release();
    }
  } finally {
    context.release();
  }
}

/**
 * How light `image` is, place by place: halved until under twice the map's size, then made the
 * map's size, saved as a PNG and read. Each halving averages 2 × 2 pixels; one step from the whole
 * image would not (Android's and iOS's filters weigh the few pixels nearest each one made).
 */
async function lightOf(image: ImageManipulator.ImageRef): Promise<LightMap> {
  const target = fitWithin(image.width, image.height, LIGHT_SIDE);
  const context = ImageManipulator.ImageManipulator.manipulate(image);
  let small: ImageManipulator.ImageRef | null = null;
  try {
    let { width, height } = image;
    while (width >= 2 * target.width && height >= 2 * target.height) {
      width = Math.round(width / 2);
      height = Math.round(height / 2);
      context.resize({ width, height });
    }
    if (width !== target.width || height !== target.height) context.resize(target);
    small = await context.renderAsync();
    const saved = await small.saveAsync({ format: ImageManipulator.SaveFormat.PNG, base64: true });
    const bytes = saved.base64 ? base64ToBytes(saved.base64.replace(/\s+/g, "")) : null;
    // LIGHT_SIDE × LIGHT_SIDE at most: within what readPng reads (MAX_PNG_PIXELS).
    const png = bytes ? readPng(bytes) : null;
    if (!png) throw new PickImageError("unreadable", "The image's light could not be read");
    return lightMapOf(png.pixels, png.width, png.height);
  } finally {
    context.release();
    small?.release();
  }
}
