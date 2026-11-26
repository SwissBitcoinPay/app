import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";

import { base64ToBytes } from "@/lib/base64";
import { MAX_AVATAR_BYTES, MAX_IMAGE_BYTES } from "@/lib/media/image";
import { withSystemUi } from "@/lib/system-ui";

/*
 * Picking a logo or a photo: the system's photo library (expo-image-picker, the browser's file
 * picker on the web), or, for an article's in the apps, a photo taken with the system's camera app
 * (Android's photo picker offers no camera); cropped to a square (by the system's editor in the
 * apps, in the middle on the web, which has none), then made small enough for one record on the
 * relays (src/lib/media/image.ts): a JPEG of 256 px for a logo or a person's photo, of 512 px for
 * an article's when it fits, else 384 px; less compressed first. A card's image (cardJpeg) keeps
 * the card's shape instead.
 */

/** What the image is for: its sizes and its largest weight. */
export type ImageUse = "avatar" | "article";

type Profile = {
  maxBytes: number;
  attempts: readonly { side: number; compress: number }[];
  /** Never enlarged past its own square: a bigger file, no sharper (Open Food Facts: 400 px). */
  noUpscale?: boolean;
};

const PROFILES: Record<ImageUse, Profile> = {
  // Twice the largest avatar drawn (88 pt, the business's logo on the invitation's screen,
  // src/app/join.tsx), and some. MAX_AVATAR_BYTES: older apps read these.
  avatar: {
    maxBytes: MAX_AVATAR_BYTES,
    attempts: [
      { side: 256, compress: 0.8 },
      { side: 256, compress: 0.6 },
      { side: 256, compress: 0.4 },
      { side: 192, compress: 0.5 },
      { side: 128, compress: 0.5 }
    ]
  },
  // An article's photo: 168 px high on a desktop card about 280 px wide, so 512 px for a sharp card
  // on a 2× screen, when it fits one record (MAX_IMAGE_BYTES). Measured on 10 sample photos
  // (libjpeg): 512 px weighs 32 to 66 KB at quality 0.8, 16 to 33 KB at 0.4; 384 px, 13 to 25 KB at
  // 0.6. A busy photo comes out at 384 px.
  article: {
    maxBytes: MAX_IMAGE_BYTES,
    noUpscale: true,
    attempts: [
      { side: 512, compress: 0.7 },
      { side: 512, compress: 0.6 },
      { side: 512, compress: 0.5 },
      { side: 384, compress: 0.7 },
      { side: 384, compress: 0.6 },
      { side: 256, compress: 0.6 },
      { side: 192, compress: 0.5 }
    ]
  }
};

/** Where the image comes from: the photo library, or a photo taken with the system's camera app. */
export type ImageSource = "library" | "camera";

export type PickImageErrorCode =
  /** The photo library was refused (iOS asks; Android's picker needs no permission). */
  | "denied"
  /**
   * The camera did not open: refused (both systems ask; Android 9 asks for the storage too,
   * expo-image-picker 57.0.20), or none on the device.
   */
  | "cameraDenied"
  /** The image could not be read or made small enough. */
  | "unreadable";

export class PickImageError extends Error {
  readonly code: PickImageErrorCode;

  constructor(code: PickImageErrorCode, message: string) {
    super(message);
    this.name = "PickImageError";
    this.code = code;
  }
}

/**
 * Lets the user pick an image from `source`, and gives its bytes as a square JPEG for `use` (its
 * profile's weight at most); null when the picker or the camera was closed without one. Rejects
 * with a PickImageError.
 */
export async function pickSquareImage(
  use: ImageUse = "avatar",
  source: ImageSource = "library"
): Promise<Uint8Array | null> {
  const picked = await pickImageToSquare(use, source);
  return picked ? picked.bytes : null;
}

/** An image picked, being made a square JPEG: `bytes` settles once it is made. */
export type SquaringImage = { bytes: Promise<Uint8Array> };

/**
 * pickSquareImage in its two steps, for a form that must wait for the image (an article's): null
 * when the picker or the camera was closed without one; as soon as it gave one, its square JPEG
 * being made (squareJpeg: decoded, cropped, resized, encoded again until it fits, not at once),
 * whose `bytes` reject with a PickImageError ("unreadable"). The picker's own failures reject this
 * promise, as pickSquareImage's.
 */
export async function pickImageToSquare(
  use: ImageUse,
  source: ImageSource = "library"
): Promise<SquaringImage | null> {
  const asset = await pickImage(source, true);
  if (!asset) return null;
  return { bytes: squareJpeg(asset.uri, asset.width, asset.height, use) };
}

/** An image picked: its URI, and its size in pixels (0 when the system does not say). */
export type PickedImage = { uri: string; width: number; height: number };

/**
 * Lets the user pick an image from `source`: cropped to a square by the system's editor first
 * (`square`, the apps; the web has none), else as it is (a card's, framed by the app,
 * CardImageFramer.tsx). Null when the picker or the camera was closed without one. Rejects with a
 * PickImageError.
 */
export async function pickImage(source: ImageSource, square = false): Promise<PickedImage | null> {
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ["images"],
    allowsEditing: square,
    aspect: square ? [1, 1] : undefined,
    quality: 1
  };
  let result: ImagePicker.ImagePickerResult;
  try {
    // The system's picker, camera and permission over the app: coming back is not leaving it
    // (src/lib/system-ui.ts).
    result = await withSystemUi(async () => {
      if (source !== "camera") return ImagePicker.launchImageLibraryAsync(options);
      // iOS opens the camera only once it is allowed (launchCameraAsync rejects otherwise,
      // 57.0.20); Android asks for it as it opens, so this is the same prompt there.
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        throw new PickImageError("cameraDenied", "The camera was not allowed");
      }
      return ImagePicker.launchCameraAsync(options);
    });
  } catch (error) {
    if (error instanceof PickImageError) throw error;
    throw new PickImageError(
      source === "camera" ? "cameraDenied" : "denied",
      error instanceof Error ? error.message : String(error)
    );
  }
  const asset = result.canceled ? undefined : result.assets[0];
  return asset ? { uri: asset.uri, width: asset.width, height: asset.height } : null;
}

/**
 * The image `source` (`width` × `height`, 0 when unknown) as a square JPEG for `use`: its middle
 * square, then the first of its profile's attempts that fits its weight. `source` is a URI, or an
 * image already decoded (renderAsync), whose pixels are then used again without reading its file
 * (Android, iOS; the web decodes its PNG again): the caller releases it.
 */
export async function squareJpeg(
  source: string | ImageManipulator.ImageRef,
  width: number,
  height: number,
  use: ImageUse = "avatar"
): Promise<Uint8Array> {
  const { maxBytes, attempts, noUpscale } = PROFILES[use];
  // Rendered once per side, then saved at each quality of that side; released once done with
  // (SharedObject.release: native memory, GC'd late otherwise).
  let image: ImageManipulator.ImageRef | null = null;
  try {
    const side = Math.min(width, height);
    let renderedSide = 0;
    // A small image is never enlarged: attempts of larger sides then come to the same one.
    const tried = new Set<string>();
    for (const attempt of attempts) {
      const target = noUpscale && side > 0 ? Math.min(attempt.side, side) : attempt.side;
      const key = `${target}/${attempt.compress}`;
      if (tried.has(key)) continue;
      tried.add(key);
      if (image === null || renderedSide !== target) {
        image?.release();
        image = null;
        const context = ImageManipulator.ImageManipulator.manipulate(source);
        try {
          // Already square from the system's editor; the web's picker has none.
          if (side > 0 && width !== height) {
            context.crop({
              originX: Math.floor((width - side) / 2),
              originY: Math.floor((height - side) / 2),
              width: side,
              height: side
            });
          }
          context.resize({ width: target, height: target });
          image = await context.renderAsync();
        } finally {
          context.release();
        }
        renderedSide = target;
      }
      const saved = await image.saveAsync({
        format: ImageManipulator.SaveFormat.JPEG,
        compress: attempt.compress,
        base64: true
      });
      const bytes = saved.base64 ? base64ToBytes(saved.base64.replace(/\s+/g, "")) : null;
      if (bytes && bytes.length > 0 && bytes.length <= maxBytes) return bytes;
    }
  } catch (error) {
    throw new PickImageError("unreadable", error instanceof Error ? error.message : String(error));
  } finally {
    image?.release();
  }
  throw new PickImageError("unreadable", "The image could not be made small enough");
}

/**
 * A card's image ("Look", a v2 card's visual): drawn 300 pt wide at most (the carousel of "Cards"),
 * so 640 px wide when it fits one record (MAX_IMAGE_BYTES), less compressed first; a busy image
 * comes out narrower. Not measured on real images yet.
 */
const CARD_ATTEMPTS: readonly { width: number; compress: number }[] = [
  { width: 640, compress: 0.7 },
  { width: 640, compress: 0.6 },
  { width: 640, compress: 0.5 },
  { width: 512, compress: 0.6 },
  { width: 512, compress: 0.5 },
  { width: 384, compress: 0.5 }
];

/** A part of an image, in its pixels. */
export type ImageCrop = { originX: number; originY: number; width: number; height: number };

/**
 * The largest part of a `width` × `height` image of the shape `aspect` (width over height), in its
 * middle.
 */
export function centredCrop(width: number, height: number, aspect: number): ImageCrop {
  const cropWidth = Math.min(width, Math.floor(height * aspect));
  const cropHeight = Math.min(height, Math.floor(width / aspect));
  return {
    originX: Math.floor((width - cropWidth) / 2),
    originY: Math.floor((height - cropHeight) / 2),
    width: cropWidth,
    height: cropHeight
  };
}

/**
 * The part `crop` of the image `source` (a URI, or an image already decoded, which the caller
 * releases) as a JPEG of the crop's shape, of one record at most (MAX_IMAGE_BYTES): the first
 * attempt that fits, never wider than the crop itself. Rejects with a PickImageError
 * ("unreadable").
 */
export async function cardJpeg(
  source: string | ImageManipulator.ImageRef,
  crop: ImageCrop
): Promise<Uint8Array> {
  if (crop.width < 1 || crop.height < 1) {
    throw new PickImageError("unreadable", "Nothing to crop");
  }
  let image: ImageManipulator.ImageRef | null = null;
  try {
    let renderedWidth = 0;
    const tried = new Set<string>();
    for (const attempt of CARD_ATTEMPTS) {
      const width = Math.min(attempt.width, crop.width);
      const key = `${width}/${attempt.compress}`;
      if (tried.has(key)) continue;
      tried.add(key);
      if (image === null || renderedWidth !== width) {
        image?.release();
        image = null;
        const context = ImageManipulator.ImageManipulator.manipulate(source);
        try {
          context.crop(crop);
          context.resize({
            width,
            height: Math.max(1, Math.round((width * crop.height) / crop.width))
          });
          image = await context.renderAsync();
        } finally {
          context.release();
        }
        renderedWidth = width;
      }
      const saved = await image.saveAsync({
        format: ImageManipulator.SaveFormat.JPEG,
        compress: attempt.compress,
        base64: true
      });
      const bytes = saved.base64 ? base64ToBytes(saved.base64.replace(/\s+/g, "")) : null;
      if (bytes && bytes.length > 0 && bytes.length <= MAX_IMAGE_BYTES) return bytes;
    }
  } catch (error) {
    throw new PickImageError("unreadable", error instanceof Error ? error.message : String(error));
  } finally {
    image?.release();
  }
  throw new PickImageError("unreadable", "The image could not be made small enough");
}
