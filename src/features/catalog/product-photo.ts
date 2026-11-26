import * as ImageManipulator from "expo-image-manipulator";
import { File, Paths } from "expo-file-system";

import { squareJpeg } from "@/features/media/pick-image";
import { bytesToHex } from "@noble/hashes/utils.js";
import { logFailure } from "@/lib/log/log";
import { secureRandomBytes } from "@/lib/random";

/**
 * The front photo of a scanned product (Open Food Facts), as an article's photo: downloaded to the
 * cache, then its middle square as a JPEG for an article (squareJpeg, 400 px at most here), as a photo
 * picked. Null when it could not be had: the article is saved without it, the owner may add one.
 * The downloaded file is deleted. The web app: product-photo.web.ts.
 */
export async function productPhoto(url: string, userAgent: string): Promise<Uint8Array | null> {
  const target = new File(Paths.cache, `product-${bytesToHex(secureRandomBytes(8))}.jpg`);
  try {
    const file = await File.downloadFileAsync(url, target, {
      headers: { "User-Agent": userAgent },
      idempotent: true
    });
    // Decoded once: its size (the square is cut from its middle), then its pixels for squareJpeg.
    const context = ImageManipulator.ImageManipulator.manipulate(file.uri);
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
    try {
      if (target.exists) target.delete();
    } catch {
      // Left in the cache, which the system empties.
    }
  }
}
