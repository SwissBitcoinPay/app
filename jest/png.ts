/**
 * Test helper: the pixels of a PNG file, as the tests of the app's icons read them
 * (app-config.test.ts, web-manifest.test.ts). Node's types are not loaded (tsconfig `types` only
 * lists jest): only what this helper needs is typed here.
 */
const { readFileSync } = jest.requireActual<{ readFileSync(file: string): Uint8Array }>("fs");
const { inflateSync } = jest.requireActual<{ inflateSync(data: Uint8Array): Uint8Array }>("zlib");

/** PNG filter predictor, for filter types 0 to 4 (https://www.w3.org/TR/png-3/#9Filter-types). */
function predict(filter: number, left: number, up: number, upLeft: number): number {
  switch (filter) {
    case 0:
      return 0;
    case 1:
      return left;
    case 2:
      return up;
    case 3:
      return (left + up) >> 1;
    default: {
      // 4: Paeth.
      const p = left + up - upLeft;
      const pa = Math.abs(p - left);
      const pb = Math.abs(p - up);
      const pc = Math.abs(p - upLeft);
      return pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
    }
  }
}

/** Pixels of an 8-bit, non-interlaced RGB or RGBA PNG (the format of the app icons). */
export function readPng(file: string) {
  const png = readFileSync(file);
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  // IHDR: bit depth, colour type (2 = RGB, 6 = RGBA), interlace method.
  const channels = png[25] === 6 ? 4 : png[25] === 2 ? 3 : 0;
  if (png[24] !== 8 || channels === 0 || png[28] !== 0) {
    throw new Error(`${file}: expected an 8-bit, non-interlaced RGB or RGBA PNG`);
  }
  const compressed: number[] = [];
  for (let offset = 8; offset < png.length; offset += view.getUint32(offset) + 12) {
    if (String.fromCharCode(...png.subarray(offset + 4, offset + 8)) === "IDAT") {
      for (const byte of png.subarray(offset + 8, offset + 8 + view.getUint32(offset))) {
        compressed.push(byte);
      }
    }
  }
  const data = inflateSync(Uint8Array.from(compressed));
  const stride = width * channels;
  // Missing bytes would decode as 0, i.e. as transparent pixels.
  if (data.length !== height * (stride + 1)) {
    throw new Error(`${file}: ${data.length} bytes of image data for ${width}x${height} pixels`);
  }
  const pixels = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = data[y * (stride + 1)];
    if (filter > 4) throw new Error(`${file}: invalid PNG filter ${filter}`);
    for (let i = 0; i < stride; i++) {
      const left = i >= channels ? pixels[y * stride + i - channels] : 0;
      const up = y > 0 ? pixels[(y - 1) * stride + i] : 0;
      const upLeft = i >= channels && y > 0 ? pixels[(y - 1) * stride + i - channels] : 0;
      const raw = data[y * (stride + 1) + 1 + i];
      pixels[y * stride + i] = (raw + predict(filter, left, up, upLeft)) & 0xff;
    }
  }
  const at = (x: number, y: number) => y * stride + x * channels;
  return {
    width,
    height,
    rgb: (x: number, y: number) => Array.from(pixels.subarray(at(x, y), at(x, y) + 3)),
    /** The colour of a pixel as one number, 0xRRGGBB: for loops over every pixel, no allocation. */
    rgbValue: (x: number, y: number) => {
      const i = at(x, y);
      return (pixels[i] << 16) | (pixels[i + 1] << 8) | pixels[i + 2];
    },
    alpha: (x: number, y: number) => (channels === 4 ? pixels[at(x, y) + 3] : 255)
  };
}
