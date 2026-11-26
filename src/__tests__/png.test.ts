import { MAX_PNG_PIXELS, readPng, type Rgb } from "@/lib/media/png";

/** The pixels of the PNG `bytes`, null when refused. */
function pngPixels(bytes: Uint8Array): Rgb[] | null {
  return readPng(bytes)?.pixels ?? null;
}

/*
 * The pixels of the small PNGs the device's image library writes (src/lib/media/png.ts): built
 * here byte by byte, as libpng would (Node's zlib for their data), and damaged on purpose.
 */

type Zlib = {
  deflateSync(data: Uint8Array, options?: { level?: number }): Uint8Array;
  crc32?: (data: Uint8Array) => number;
};
const { deflateSync } = jest.requireActual<Zlib>("zlib");

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

/** Channels of each colour type. */
const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 4: 2, 6: 4 };

/**
 * A PNG of `width` × `height` of colour type `colour`, `depth` bits per channel, its rows filtered
 * with `filter` (each byte as the filter would leave it), `pixels` its bytes row by row (a channel
 * of 16 bits as two, high first).
 */
function png(
  width: number,
  height: number,
  colour: number,
  pixels: number[],
  {
    filter = 0,
    depth = 8,
    interlace = 0,
    extra = []
  }: { filter?: number; depth?: number; interlace?: number; extra?: number[][] } = {}
): Uint8Array {
  const step = CHANNELS[colour]! * (depth === 16 ? 2 : 1);
  const stride = width * step;
  const raw: number[] = [];
  for (let y = 0; y < height; y++) {
    raw.push(filter);
    for (let x = 0; x < stride; x++) {
      const value = pixels[y * stride + x]!;
      const left = x >= step ? pixels[y * stride + x - step]! : 0;
      const up = y > 0 ? pixels[(y - 1) * stride + x]! : 0;
      const upLeft = x >= step && y > 0 ? pixels[(y - 1) * stride + x - step]! : 0;
      const p = left + up - upLeft;
      const paeth =
        Math.abs(p - left) <= Math.abs(p - up) && Math.abs(p - left) <= Math.abs(p - upLeft)
          ? left
          : Math.abs(p - up) <= Math.abs(p - upLeft)
            ? up
            : upLeft;
      const predicted = [0, left, up, (left + up) >> 1, paeth][filter]!;
      raw.push((value - predicted) & 0xff);
    }
  }
  return new Uint8Array([
    137,
    80,
    78,
    71,
    13,
    10,
    26,
    10,
    ...chunk("IHDR", [...u32(width), ...u32(height), depth, colour, 0, 0, interlace]),
    ...extra.flat(),
    ...chunk("IDAT", Array.from(deflateSync(new Uint8Array(raw)))),
    ...chunk("IEND", [])
  ]);
}

const rgb = (r: number, g: number, b: number): Rgb => ({ r, g, b });

describe("readPng", () => {
  it("gives the image's size with its pixels", () => {
    expect(readPng(png(3, 2, 0, [1, 2, 3, 4, 5, 6]))).toEqual({
      width: 3,
      height: 2,
      pixels: [1, 2, 3, 4, 5, 6].map((value) => rgb(value, value, value))
    });
  });

  it("reads a pixel as the device's library writes one: RGBA, RGB, grey", () => {
    expect(pngPixels(png(1, 1, 6, [200, 180, 160, 255]))).toEqual([rgb(200, 180, 160)]);
    expect(pngPixels(png(1, 1, 2, [12, 34, 56]))).toEqual([rgb(12, 34, 56)]);
    expect(pngPixels(png(1, 1, 0, [99]))).toEqual([rgb(99, 99, 99)]);
    expect(pngPixels(png(1, 1, 4, [77, 255]))).toEqual([rgb(77, 77, 77)]);
    // A one-pixel image written interlaced (Adam7): the same bytes.
    expect(pngPixels(png(1, 1, 6, [1, 2, 3, 255], { interlace: 1 }))).toEqual([rgb(1, 2, 3)]);
  });

  it("gives a pixel that is not opaque over black, as a JPEG of it shows it", () => {
    // A logo's white background at 30 %: the card shows it dark grey, never white.
    expect(pngPixels(png(1, 1, 6, [255, 255, 255, 77]))).toEqual([rgb(77, 77, 77)]);
    expect(pngPixels(png(1, 1, 6, [255, 128, 0, 0]))).toEqual([rgb(0, 0, 0)]);
    expect(pngPixels(png(1, 1, 6, [200, 100, 50, 128]))).toEqual([rgb(100, 50, 25)]);
    expect(pngPixels(png(1, 1, 4, [200, 128]))).toEqual([rgb(100, 100, 100)]);
    // 16 bits: the high bytes of the colour and of its alpha.
    expect(pngPixels(png(1, 1, 6, [255, 9, 255, 9, 255, 9, 77, 200], { depth: 16 }))).toEqual([
      rgb(77, 77, 77)
    ]);
    expect(pngPixels(png(1, 1, 4, [200, 1, 128, 255], { depth: 16 }))).toEqual([
      rgb(100, 100, 100)
    ]);
  });

  it("reads 16 bits a channel by their high byte, as an iPhone may draw", () => {
    expect(pngPixels(png(1, 1, 6, [200, 7, 180, 9, 160, 1, 255, 255], { depth: 16 }))).toEqual([
      rgb(200, 180, 160)
    ]);
    expect(pngPixels(png(1, 1, 0, [99, 250], { depth: 16 }))).toEqual([rgb(99, 99, 99)]);
    // Filtered by whole pixels of 6 bytes: the second pixel from the first.
    const bytes = [10, 1, 20, 2, 30, 3, 40, 4, 50, 5, 60, 6];
    for (const filter of [1, 4]) {
      expect(pngPixels(png(2, 1, 2, bytes, { depth: 16, filter }))).toEqual([
        rgb(10, 20, 30),
        rgb(40, 50, 60)
      ]);
    }
  });

  it.each([0, 1, 2, 3, 4])("undoes the filter %i, row by row", (filter) => {
    const width = 5;
    const height = 4;
    const bytes = (channels: number) =>
      Array.from({ length: width * height * channels }, (_, i) => (i * 37 + 11) % 256);
    // RGB: every byte as written.
    const opaque = bytes(3);
    expect(pngPixels(png(width, height, 2, opaque, { filter }))).toEqual(
      Array.from({ length: width * height }, (_, i) =>
        rgb(opaque[i * 3]!, opaque[i * 3 + 1]!, opaque[i * 3 + 2]!)
      )
    );
    // RGBA, pixels of 4 bytes: each over black by its alpha, the fourth.
    const pixels = bytes(4);
    const over = (i: number, channel: number) =>
      Math.round((pixels[i * 4 + channel]! * pixels[i * 4 + 3]!) / 255);
    expect(pngPixels(png(width, height, 6, pixels, { filter }))).toEqual(
      Array.from({ length: width * height }, (_, i) => rgb(over(i, 0), over(i, 1), over(i, 2)))
    );
  });

  it("reads past the chunks it does not need, a suggested palette included", () => {
    const extra = [
      chunk("tEXt", new TextEncoder().encode("Software\0test")),
      chunk("PLTE", [0, 0, 0])
    ];
    expect(pngPixels(png(1, 1, 2, [5, 6, 7], { extra }))).toEqual([rgb(5, 6, 7)]);
  });

  it("refuses what it does not read, never guessing", () => {
    // 4 bits per channel; a palette; interlaced past one pixel; too many pixels.
    expect(pngPixels(png(1, 1, 0, [1], { depth: 4 }))).toBeNull();
    expect(
      pngPixels(
        png(
          2,
          2,
          6,
          Array.from({ length: 16 }, () => 9),
          { interlace: 1 }
        )
      )
    ).toBeNull();
    const side = Math.sqrt(MAX_PNG_PIXELS) + 1;
    expect(
      pngPixels(
        png(
          side,
          side,
          0,
          Array.from({ length: side * side }, () => 0)
        )
      )
    ).toBeNull();
    // An unknown critical chunk.
    expect(pngPixels(png(1, 1, 2, [1, 2, 3], { extra: [chunk("ZZZZ", [1])] }))).toBeNull();
  });

  it("refuses a damaged file", () => {
    const good = png(
      2,
      2,
      6,
      Array.from({ length: 16 }, (_, i) => i * 10)
    );
    expect(pngPixels(good)).not.toBeNull();
    // Each byte changed in turn: never other pixels than its own.
    for (let at = 0; at < good.length; at++) {
      const damaged = good.slice();
      damaged[at]! ^= 0x10;
      const read = pngPixels(damaged);
      if (read !== null) expect(read).toEqual(pngPixels(good));
    }
    // Cut short anywhere.
    for (let cut = 0; cut < good.length; cut++) expect(pngPixels(good.slice(0, cut))).toBeNull();
    expect(pngPixels(new Uint8Array(0))).toBeNull();
  });
});
