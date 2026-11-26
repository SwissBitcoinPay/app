import { bytesToHex } from "@noble/hashes/utils.js";
import * as ImageManipulator from "expo-image-manipulator";
import { File, Paths } from "expo-file-system";
import { useEffect, useState } from "react";

import { imageUri, rememberImage } from "@/features/media/images";
import { cardJpeg, centredCrop } from "@/features/media/pick-image";
import type { CardIssuer } from "@/lib/card/card-record";
import type { LegacyVisual } from "@/lib/card/legacy-visual";
import { logFailure } from "@/lib/log/log";
import { createImage, publishImageToMajority } from "@/lib/media/image";
import { secureRandomBytes } from "@/lib/random";

import { CARD_ASPECT } from "./card-look";

/*
 * A v2 card's visual: its image downloaded once from Swiss Bitcoin Pay's CDN (the URL checked by
 * legacyVisualOf) and made a JPEG of the card's shape that fits one record (cardJpeg). "Swiss
 * Bitcoin Pay card detected" shows it as soon as the card's server named it, before the holder
 * confirms (the holder sees their card); its migration (src/features/card/migration.ts) then keeps
 * that same JPEG for good, sealed on a majority of the account's relays (src/lib/media/image.ts),
 * as any image of the account: "Cards" shows it on every device from there, never from the CDN. The
 * downloaded file is
 * deleted. Native only: a browser never migrates a card (NFC).
 */

/** The longest wait for the CDN's answer, its body included. */
const DOWNLOAD_MS = 15_000;

/** The largest file taken: a card's front, a PNG of some hundreds of KB. */
const MAX_DOWNLOAD_BYTES = 5_000_000;

/** The format of `bytes` by their first bytes, among those the platforms decode; else null. */
function formatOf(bytes: Uint8Array): "png" | "jpg" | "webp" | null {
  const starts = (prefix: readonly number[], at = 0) =>
    prefix.every((byte, index) => bytes[at + index] === byte);
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (starts([0xff, 0xd8, 0xff])) return "jpg";
  if (starts([0x52, 0x49, 0x46, 0x46]) && starts([0x57, 0x45, 0x42, 0x50], 8)) return "webp";
  return null;
}

/**
 * The image at `url`, by `DOWNLOAD_MS`, and its format: PNG, JPEG or WebP, of MAX_DOWNLOAD_BYTES at
 * most, else throws. Its type is told by its bytes, whatever the answer's headers say.
 */
async function download(url: string): Promise<{ bytes: Uint8Array; format: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DOWNLOAD_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const announced = Number(response.headers.get("Content-Length") ?? "0");
    if (announced > MAX_DOWNLOAD_BYTES) throw new Error("The visual is too large");
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length === 0 || bytes.length > MAX_DOWNLOAD_BYTES) {
      throw new Error("The visual is empty or too large");
    }
    const format = formatOf(bytes);
    if (!format) throw new Error("The visual is not an image");
    return { bytes, format };
  } finally {
    clearTimeout(timer);
  }
}

/** The JPEG of the card's shape made of the image at `url` (download): throws when it cannot be. */
async function makeJpeg(url: string): Promise<Uint8Array> {
  let file: File | null = null;
  try {
    const { bytes: downloaded, format } = await download(url);
    file = new File(Paths.cache, `card-visual-${bytesToHex(secureRandomBytes(8))}.${format}`);
    file.writeSync(downloaded);
    // Decoded once: its size gives the crop, then its pixels are cut and saved (cardJpeg).
    const context = ImageManipulator.ImageManipulator.manipulate(file.uri);
    let image: ImageManipulator.ImageRef | null = null;
    try {
      image = await context.renderAsync();
      return await cardJpeg(image, centredCrop(image.width, image.height, CARD_ASPECT));
    } finally {
      context.release();
      image?.release();
    }
  } finally {
    try {
      if (file?.exists) file.delete();
    } catch {
      // Left in the cache, which the system empties.
    }
  }
}

/**
 * The visual being made or made, not kept yet: one at a time, the card detected's. Shared by its
 * screen and its migration, so that the CDN is asked once; dropped once kept on the relays, or as
 * soon as it failed (the migration's record then asks the CDN again).
 */
let made: { url: string; jpeg: Promise<Uint8Array> } | null = null;

/** The JPEG of `visual`'s image (makeJpeg), made once for the card detected. */
function visualJpeg(visual: LegacyVisual): Promise<Uint8Array> {
  if (made?.url === visual.imageUrl) return made.jpeg;
  const entry = { url: visual.imageUrl, jpeg: makeJpeg(visual.imageUrl) };
  made = entry;
  entry.jpeg.catch(() => {
    if (made === entry) made = null;
  });
  return entry.jpeg;
}

/** What "Swiss Bitcoin Pay card detected" shows of a v2 card's visual. */
export type VisualPreview =
  /** Downloaded: its image, as a data URI. */
  | { status: "shown"; uri: string }
  /** Being downloaded. */
  | { status: "loading" }
  /** None given, or it could not be downloaded: the card shows its colour. */
  | { status: "none" };

/**
 * `visual`'s image, downloaded for "Swiss Bitcoin Pay card detected" (visualJpeg: the very JPEG
 * its migration keeps, the CDN asked once). Never throws: a failure is journaled, and shows none.
 */
export function useVisualPreview(visual: LegacyVisual | null): VisualPreview {
  const url = visual?.imageUrl ?? null;
  const [read, setRead] = useState<{ url: string; uri: string | null } | null>(null);
  useEffect(() => {
    if (!visual) return;
    let alive = true;
    visualJpeg(visual).then(
      (bytes) => {
        if (alive) setRead({ url: visual.imageUrl, uri: imageUri(bytes) });
      },
      (error: unknown) => {
        // Gone from the screen (the holder confirmed or cancelled): nothing shown, and a migration
        // awaiting the same download journals its own failure (keepIssuerVisual).
        if (!alive) return;
        logFailure("A v2 card's visual could not be shown", error);
        setRead({ url: visual.imageUrl, uri: null });
      }
    );
    return () => {
      alive = false;
    };
  }, [visual]);
  if (url === null) return { status: "none" };
  if (read?.url !== url) return { status: "loading" };
  return read.uri === null ? { status: "none" } : { status: "shown", uri: read.uri };
}

/**
 * The card's issuer visual from `visual`, its image kept on a majority of `relays`; null when it
 * could not be (the CDN, the image or the relays failing): the card then shows the colour drawn
 * for it, and its migration goes on. Never rejects.
 */
export async function keepIssuerVisual(
  visual: LegacyVisual,
  relays: readonly string[]
): Promise<CardIssuer | null> {
  try {
    const bytes = await visualJpeg(visual);
    const { ref, event } = createImage(bytes, Math.floor(Date.now() / 1000));
    await publishImageToMajority(event, ref, relays);
    // Shown at once on this device, without reading it back.
    rememberImage(ref, bytes);
    if (made?.url === visual.imageUrl) made = null;
    return { image: ref, number: visual.number, white: visual.white };
  } catch (error) {
    logFailure("A v2 card's visual could not be kept", error);
    return null;
  }
}

/** Tests only: forgets the visual made. */
export function resetIssuerVisuals(): void {
  made = null;
}
