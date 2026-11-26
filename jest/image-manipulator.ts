import { bytesToBase64 } from "@/lib/base64";
import type { Rgb } from "@/lib/media/png";

import { binaries, files } from "./expo-file-system";

/**
 * expo-image-manipulator, faked for the tests that make an image from a file, mocked per test
 * file (`jest.mock("expo-image-manipulator", () => require("../../jest/image-manipulator"))`;
 * pick-image.test.ts keeps its own). A file of the fake file system (jest/expo-file-system.ts)
 * decodes to `imageFake.decoded` pixels, or fails to when `imageFake.unreadable`; an image already
 * decoded keeps its own size. A crop and a resize change the size as the real ones do. A JPEG saved
 * of `width` × `height` px at quality `compress` weighs about width × height × compress ×
 * `imageFake.density` bytes (a JPEG's first bytes, then zeros), so that a test says which attempt
 * fits. A PNG saved is a real one: its pixels are `imageFake.picture` (the colour at a point of the
 * whole decoded image, its edges 0 and 1 across and down, and its alpha, opaque unless said) at each
 * pixel's middle, through the crops made since the file was decoded; `imageFake.pngRefused` makes
 * it one png.ts refuses (4 bits a channel). Each render (its resizes in turn), each save, and each context and image made (released
 * or not), is recorded.
 */

type Size = { width: number; height: number };
/** A colour, and its alpha (0..255, 255: opaque, as by default). */
type Pixel = Rgb & { a?: number };
type Crop = { originX: number; originY: number; width: number; height: number };
/** A part of the decoded image, its edges as fractions of its width and height. */
type Region = { left: number; top: number; right: number; bottom: number };
type SaveOptions = { format?: string; compress?: number; base64?: boolean };

const WHOLE: Region = { left: 0, top: 0, right: 1, bottom: 1 };

export const imageFake = {
  decoded: { width: 1012, height: 638 } as Size,
  unreadable: false,
  density: 0.05,
  picture: (() => ({ r: 255, g: 255, b: 255 })) as (x: number, y: number) => Pixel,
  pngRefused: false,
  rendered: [] as ({ source: unknown; crop: Crop | null; resizes: Size[] } & Size)[],
  saved: [] as ({ format: string; region: Region } & Size)[],
  made: [] as { kind: "context" | "image"; released: boolean }[]
};

export function resetImageFake(): void {
  imageFake.decoded = { width: 1012, height: 638 };
  imageFake.unreadable = false;
  imageFake.density = 0.05;
  imageFake.picture = () => ({ r: 255, g: 255, b: 255 });
  imageFake.pngRefused = false;
  imageFake.rendered.length = 0;
  imageFake.saved.length = 0;
  imageFake.made.length = 0;
}

export const SaveFormat = { JPEG: "jpeg", PNG: "png", WEBP: "webp" };

/** A rendered image of the fake: what `manipulate` takes back as a source. */
type FakeImage = Size & {
  region: Region;
  saveAsync: (options: SaveOptions) => Promise<{ uri: string; base64?: string } & Size>;
  release: () => void;
};

function isFakeImage(source: unknown): source is FakeImage {
  return typeof source === "object" && source !== null && "saveAsync" in source;
}

function jpegBase64(size: Size, compress: number): string {
  const length = Math.max(4, Math.ceil(size.width * size.height * compress * imageFake.density));
  const bytes = new Uint8Array(length);
  bytes.set([0xff, 0xd8, 0xff, 0xe0]);
  return bytesToBase64(bytes);
}

type Zlib = { deflateSync(data: Uint8Array): Uint8Array };

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function u32(value: number): number[] {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

function chunk(type: string, data: ArrayLike<number>): number[] {
  const body = new Uint8Array([...new TextEncoder().encode(type), ...Array.from(data)]);
  return [...u32(data.length), ...body, ...u32(crc32(body))];
}

/** An RGBA PNG of `size` showing `region` of the picture, as Android's Bitmap writes one. */
function pngBase64(size: Size, region: Region): string {
  const { deflateSync } = jest.requireActual<Zlib>("zlib");
  const raw: number[] = [];
  for (let y = 0; y < size.height; y++) {
    raw.push(0);
    for (let x = 0; x < size.width; x++) {
      const {
        r,
        g,
        b,
        a = 255
      } = imageFake.picture(
        region.left + ((x + 0.5) / size.width) * (region.right - region.left),
        region.top + ((y + 0.5) / size.height) * (region.bottom - region.top)
      );
      raw.push(r, g, b, a);
    }
  }
  const depth = imageFake.pngRefused ? 4 : 8;
  return bytesToBase64(
    new Uint8Array([
      137,
      80,
      78,
      71,
      13,
      10,
      26,
      10,
      ...chunk("IHDR", [...u32(size.width), ...u32(size.height), depth, 6, 0, 0, 0]),
      ...chunk("IDAT", Array.from(deflateSync(new Uint8Array(raw)))),
      ...chunk("IEND", [])
    ])
  );
}

let savedFiles = 0;

export const ImageManipulator = {
  manipulate(source: unknown) {
    let crop: Crop | null = null;
    let size: Size | null = isFakeImage(source)
      ? { width: source.width, height: source.height }
      : null;
    let region: Region = isFakeImage(source) ? source.region : WHOLE;
    const resizes: Size[] = [];
    const made = { kind: "context" as const, released: false };
    imageFake.made.push(made);
    const context = {
      crop(next: Crop) {
        const base = size ?? imageFake.decoded;
        const across = region.right - region.left;
        const down = region.bottom - region.top;
        region = {
          left: region.left + (next.originX / base.width) * across,
          top: region.top + (next.originY / base.height) * down,
          right: region.left + ((next.originX + next.width) / base.width) * across,
          bottom: region.top + ((next.originY + next.height) / base.height) * down
        };
        crop = next;
        size = { width: next.width, height: next.height };
        return context;
      },
      resize({ width, height }: { width?: number; height?: number }) {
        const base = size ?? imageFake.decoded;
        size = {
          width: width ?? Math.round((base.width * (height ?? base.height)) / base.height),
          height: height ?? Math.round((base.height * (width ?? base.width)) / base.width)
        };
        resizes.push(size);
        return context;
      },
      async renderAsync(): Promise<FakeImage> {
        if (
          imageFake.unreadable ||
          (typeof source === "string" && !files.has(source) && !binaries.has(source))
        ) {
          throw new Error("Could not load the image");
        }
        const rendered = size ?? imageFake.decoded;
        const shown = region;
        imageFake.rendered.push({ source, crop, resizes: [...resizes], ...rendered });
        const image = { kind: "image" as const, released: false };
        imageFake.made.push(image);
        return {
          ...rendered,
          region: shown,
          saveAsync: async ({ format = SaveFormat.JPEG, compress = 1, base64 }) => {
            imageFake.saved.push({ format, region: shown, ...rendered });
            savedFiles += 1;
            const uri = `file:///cache/ImageManipulator/${savedFiles}.${format}`;
            if (!base64) return { uri, ...rendered };
            return {
              uri,
              ...rendered,
              base64:
                format === SaveFormat.PNG
                  ? pngBase64(rendered, shown)
                  : jpegBase64(rendered, compress)
            };
          },
          release: () => {
            image.released = true;
          }
        };
      },
      release() {
        made.released = true;
      }
    };
    return context;
  }
};
