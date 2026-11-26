import { InflateError, inflate, zlibInflate } from "@/lib/media/inflate";

/** What these tests use of Node's zlib (the app's TypeScript has no Node types). */
type Zlib = {
  deflateSync(data: Uint8Array, options?: { level?: number; strategy?: number }): Uint8Array;
  deflateRawSync(data: Uint8Array, options?: { level?: number; strategy?: number }): Uint8Array;
  constants: Record<
    "Z_DEFAULT_STRATEGY" | "Z_FIXED" | "Z_HUFFMAN_ONLY" | "Z_RLE" | "Z_FILTERED",
    number
  >;
};
const { constants, deflateRawSync, deflateSync } = jest.requireActual<Zlib>("zlib");

/*
 * The inflate the app reads small PNGs with (src/lib/media/png.ts), against Node's zlib: every
 * kind of block zlib writes, and what a damaged or oversized stream must never get through.
 */

/** Bytes of a fixed pseudo-random sequence (a test's own, not a secret). */
function noise(length: number, seed: number): Uint8Array {
  const bytes = new Uint8Array(length);
  let state = seed;
  for (let i = 0; i < length; i++) {
    state = (state * 1103515245 + 12345) >>> 0;
    bytes[i] = state >>> 24;
  }
  return bytes;
}

/** Text-like bytes: long repeats, for back references of every length and distance. */
function repetitive(length: number): Uint8Array {
  const words = ["card", "payment", "relay", "sats", "merchant", "Zürich", " "];
  const bytes = new Uint8Array(length);
  for (let i = 0, w = 0; i < length; w++) {
    const word = new TextEncoder().encode(words[(w * 7) % words.length]!);
    for (let j = 0; j < word.length && i < length; j++) bytes[i++] = word[j]!;
  }
  return bytes;
}

/** Whether `a` holds the bytes of `b` (Jest's own equality walks large arrays slowly). */
function same(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((byte, i) => byte === b[i]);
}

const inputs: [string, Uint8Array][] = [
  ["empty", new Uint8Array(0)],
  ["one byte", new Uint8Array([42])],
  ["a pixel's row", new Uint8Array([0, 200, 180, 160, 255])],
  ["noise", noise(70_000, 7)],
  ["repetitive", repetitive(100_000)],
  // Longer than the 32 KB window: references at its far end.
  ["zeros", new Uint8Array(40_000)]
];

describe("inflate", () => {
  it.each(inputs)("reads back what zlib wrote at every level and strategy: %s", (_, data) => {
    for (const level of [0, 1, 6, 9]) {
      for (const strategy of [
        constants.Z_DEFAULT_STRATEGY,
        constants.Z_FIXED,
        constants.Z_HUFFMAN_ONLY,
        constants.Z_RLE,
        constants.Z_FILTERED
      ]) {
        const raw = deflateRawSync(data, { level, strategy });
        expect(same(inflate(new Uint8Array(raw), data.length), data)).toBe(true);
        const wrapped = deflateSync(data, { level, strategy });
        expect(same(zlibInflate(new Uint8Array(wrapped), data.length), data)).toBe(true);
      }
    }
  });

  it("never writes past what it is allowed", () => {
    const data = repetitive(10_000);
    const wrapped = new Uint8Array(deflateSync(data));
    expect(() => zlibInflate(wrapped, data.length - 1)).toThrow(InflateError);
    // A small stream that inflates to much (a "zip bomb"): stopped at the limit.
    const bomb = new Uint8Array(deflateSync(new Uint8Array(10_000_000)));
    expect(bomb.length).toBeLessThan(20_000);
    expect(() => zlibInflate(bomb, 1024)).toThrow("Larger than allowed");
  });

  it("refuses a damaged stream, never giving other bytes", () => {
    const data = noise(5_000, 3);
    const wrapped = new Uint8Array(deflateSync(data));
    // Its checksum.
    const checksum = wrapped.slice();
    checksum[checksum.length - 1]! ^= 1;
    expect(() => zlibInflate(checksum, data.length)).toThrow("Checksum mismatch");
    // Its header: not deflate, or its check bits wrong, or a preset dictionary.
    for (const header of [
      [0x79, 0x9c],
      [0x78, 0x9d],
      [0x78, 0xbb]
    ]) {
      const changed = wrapped.slice();
      changed.set(header, 0);
      expect(() => zlibInflate(changed, data.length)).toThrow(InflateError);
    }
    // Cut short, anywhere.
    for (const cut of [2, 10, wrapped.length >> 1, wrapped.length - 5]) {
      expect(() => zlibInflate(wrapped.slice(0, cut), data.length)).toThrow(InflateError);
    }
    // A byte between the last block and the checksum.
    const padded = new Uint8Array(wrapped.length + 1);
    padded.set(wrapped.subarray(0, wrapped.length - 4));
    padded.set(wrapped.subarray(wrapped.length - 4), wrapped.length - 3);
    expect(() => zlibInflate(padded, data.length)).toThrow(InflateError);
  });

  it("refuses what the RFC does not allow", () => {
    // Block type 3.
    expect(() => inflate(new Uint8Array([0x07]), 10)).toThrow("Invalid block type");
    // A stored block whose length and its complement disagree.
    expect(() => inflate(new Uint8Array([0x01, 0x02, 0x00, 0x00, 0x00, 1, 2]), 10)).toThrow(
      "Stored length mismatch"
    );
    // A back reference before the first byte: fixed block, length 3 (code 257), distance 1.
    expect(() => inflate(new Uint8Array([0x03, 0x02]), 10)).toThrow(InflateError);
  });

  it("never throws anything but an InflateError on random input", () => {
    for (let seed = 1; seed <= 300; seed++) {
      const data = noise(1 + (seed % 64), seed);
      try {
        inflate(data, 4096);
      } catch (error) {
        expect(error).toBeInstanceOf(InflateError);
      }
    }
  });
});
