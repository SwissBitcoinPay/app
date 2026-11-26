import * as ImageManipulator from "expo-image-manipulator";

import { squareJpeg } from "@/features/media/pick-image";
import { logFailure } from "@/lib/log/log";

/**
 * The web app's product-photo.ts (the scan on the web): the front photo of a scanned product (Open
 * Food Facts, which allows any origin), downloaded by the browser, then its middle square as a JPEG
 * for an article (squareJpeg, as a photo picked). Null when it could not be had: the article is
 * saved without it, the owner may add one. Browsers send their own User-Agent (`userAgent` is the
 * apps'); the image is only read, from a temporary object URL.
 */
export async function productPhoto(url: string, _userAgent: string): Promise<Uint8Array | null> {
  let objectUrl: string | null = null;
  try {
    const response = await fetch(url, { credentials: "omit", referrerPolicy: "no-referrer" });
    if (!response.ok) throw new Error(`The product's photo answered ${response.status}`);
    const blob = await response.blob();
    if (!blob.type.startsWith("image/")) throw new Error("The product's photo is no image");
    objectUrl = URL.createObjectURL(blob);
    // Decoded once: its size (the square is cut from its middle), then its pixels for squareJpeg.
    const context = ImageManipulator.ImageManipulator.manipulate(objectUrl);
    let image: ImageManipulator.ImageRef | null = null;
    try {
      image = await context.renderAsync();
      return await squareJpeg(image, image.width, image.height, "article");
    } finally {
      context.release();
      image?.release();
    }
  } catch (error) {
    logFailure("The product's photo could not be had", error);
    return null;
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}
