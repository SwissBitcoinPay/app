import { zlibInflate } from "./inflate";

/*
 * The pixels of a small PNG (ISO/IEC 15948), as the device's own image library writes one
 * (expo-image-manipulator: Android's Bitmap, iOS's ImageIO, a browser's canvas): the only way to
 * read an image's pixels in the app (inflate.ts). Only what those write is read: 8 or 16 bits per
 * channel (an iPhone may draw in 16), grey or RGB, with alpha or not, not interlaced; each chunk's
 * CRC checked; at most MAX_PNG_PIXELS pixels. Anything else is refused (null), never guessed.
 */

/** The most pixels read: a small image made for its light (card-image.ts), never a photo. */
export const MAX_PNG_PIXELS = 96 * 96;

/**
 * The colour channels of a pixel, 0..255 (of 16 bits, their high byte). One not opaque is given
 * over black, as a JPEG of it shows it: a JPEG has no alpha, and the platforms' encoders write a
 * pixel's colour by its alpha (Android's and iOS's bitmaps premultiplied, a browser's canvas).
 */
export type Rgb = { r: number; g: number; b: number };

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

/** Channels per pixel, by colour type: grey, RGB, grey and alpha, RGBA. */
const CHANNELS: Readonly<Record<number, number>> = { 0: 1, 2: 3, 4: 2, 6: 4 };

let crcTable: Uint32Array | null = null;

/** The CRC-32 of a chunk's type and data (ISO 3309, as PNG's annex D). */
function crc32(bytes: Uint8Array, start: number, end: number): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = start; i < end; i++) c = crcTable[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function uint32(bytes: Uint8Array, at: number): number {
  return (
    ((bytes[at]! << 24) | (bytes[at + 1]! << 16) | (bytes[at + 2]! << 8) | bytes[at + 3]!) >>> 0
  );
}

/** Paeth's predictor (PNG § 9.4). */
function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/** A PNG read: its size, and its pixels row by row, each as its RGB. */
export type PngImage = { width: number; height: number; pixels: Rgb[] };

/** The PNG `bytes`; null when it is not one read here. */
export function readPng(bytes: Uint8Array): PngImage | null {
  try {
    return decode(bytes);
  } catch {
    return null;
  }
}

function decode(bytes: Uint8Array): PngImage | null {
  if (bytes.length < 8 || SIGNATURE.some((byte, i) => bytes[i] !== byte)) return null;
  let at = 8;
  let header: { width: number; height: number; channels: number; bytes: number } | null = null;
  const data: Uint8Array[] = [];
  let ended = false;
  while (!ended) {
    if (at + 12 > bytes.length) return null;
    const length = uint32(bytes, at);
    const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
    const end = at + 8 + length;
    if (length > bytes.length || end + 4 > bytes.length) return null;
    if (crc32(bytes, at + 4, end) !== uint32(bytes, end)) return null;
    const chunk = bytes.subarray(at + 8, end);
    if (type === "IHDR") {
      if (header || length !== 13) return null;
      const width = uint32(chunk, 0);
      const height = uint32(chunk, 4);
      const [depth, colour, compression, filter, interlace] = chunk.subarray(8, 13);
      const channels = CHANNELS[colour!];
      if (depth !== 8 && depth !== 16) return null;
      if (channels === undefined || compression !== 0 || filter !== 0) return null;
      // Adam7 of one pixel is that pixel, as the image's one row.
      if (interlace !== 0 && !(interlace === 1 && width === 1 && height === 1)) return null;
      if (width < 1 || height < 1 || width * height > MAX_PNG_PIXELS) return null;
      header = { width, height, channels, bytes: depth / 8 };
    } else if (type === "IDAT") {
      if (!header) return null;
      data.push(chunk);
    } else if (type === "IEND") {
      ended = true;
    } else if (type !== "PLTE" && (bytes[at + 4]! & 0x20) === 0) {
      // A critical chunk this reader does not know (its type's first letter upper case); a PLTE
      // only suggests a palette for RGB.
      return null;
    }
    at = end + 4;
  }
  if (!header || data.length === 0) return null;
  const { width, height, channels, bytes: sampleBytes } = header;
  // A pixel's bytes: what the filters reach back by (PNG § 9.2).
  const pixelBytes = channels * sampleBytes;
  const stride = width * pixelBytes;
  const size = data.reduce((sum, chunk) => sum + chunk.length, 0);
  const stream = new Uint8Array(size);
  let offset = 0;
  for (const chunk of data) {
    stream.set(chunk, offset);
    offset += chunk.length;
  }
  const raw = zlibInflate(stream, height * (stride + 1));
  if (raw.length !== height * (stride + 1)) return null;
  // Unfiltered row by row (PNG § 9.2): each byte from the one a pixel before it and above it.
  const pixels = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!;
    if (filter > 4) return null;
    for (let x = 0; x < stride; x++) {
      const value = raw[y * (stride + 1) + 1 + x]!;
      const left = x >= pixelBytes ? pixels[y * stride + x - pixelBytes]! : 0;
      const up = y > 0 ? pixels[(y - 1) * stride + x]! : 0;
      const upLeft = x >= pixelBytes && y > 0 ? pixels[(y - 1) * stride + x - pixelBytes]! : 0;
      const predicted =
        filter === 0
          ? 0
          : filter === 1
            ? left
            : filter === 2
              ? up
              : filter === 3
                ? (left + up) >> 1
                : paeth(left, up, upLeft);
      pixels[y * stride + x] = (value + predicted) & 0xff;
    }
  }
  // A channel of 16 bits by its high byte (big-endian, its first).
  const channel = (pixel: number, index: number) =>
    pixels[pixel * pixelBytes + index * sampleBytes]!;
  // Alpha, when there is one, is the last channel (grey and alpha, RGBA).
  const alpha = channels === 2 || channels === 4 ? channels - 1 : null;
  const rgb: Rgb[] = [];
  for (let i = 0; i < width * height; i++) {
    const a = alpha === null ? 255 : channel(i, alpha);
    const over = (value: number) => Math.round((value * a) / 255);
    rgb.push(
      channels < 3
        ? { r: over(channel(i, 0)), g: over(channel(i, 0)), b: over(channel(i, 0)) }
        : { r: over(channel(i, 0)), g: over(channel(i, 1)), b: over(channel(i, 2)) }
    );
  }
  return { width, height, pixels: rgb };
}
