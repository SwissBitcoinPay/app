/*
 * Inflate (RFC 1951) and its zlib wrapping (RFC 1950), for the pixels of a small PNG the device's
 * own image library wrote (png.ts): neither Hermes nor expo-image-manipulator gives an image's
 * pixels. The canonical decoding of zlib's own "puff" (Mark Adler), bounded: every read checked
 * against the input, the output never past `maxOutput` bytes, any code the RFC does not allow
 * refused. Checked against Node's zlib (inflate.test.ts).
 */

/** An input inflate refuses: not deflate data, damaged, or larger than asked for. */
export class InflateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InflateError";
  }
}

/** The longest code of a Huffman table (RFC 1951 § 3.2.7). */
const MAX_BITS = 15;

/** Lengths 3..258: their base and their extra bits, by symbol 257..285. */
const LENGTH_BASE = [
  3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131,
  163, 195, 227, 258
];
const LENGTH_EXTRA = [
  0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0
];
/** Distances 1..32768: their base and their extra bits, by symbol 0..29. */
const DISTANCE_BASE = [
  1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049,
  3073, 4097, 6145, 8193, 12289, 16385, 24577
];
const DISTANCE_EXTRA = [
  0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13
];
/** The order the code lengths' code lengths come in (§ 3.2.7). */
const CODE_LENGTH_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

/** A canonical Huffman code: how many codes of each length, and its symbols by code. */
type Huffman = { count: Uint16Array; symbol: Uint16Array };

/** The code of these code lengths (0: no code); refused when over-subscribed. */
function huffman(lengths: ArrayLike<number>): Huffman {
  const count = new Uint16Array(MAX_BITS + 1);
  for (let i = 0; i < lengths.length; i++) count[lengths[i]!]! += 1;
  count[0] = 0;
  // Codes left at each length: never below zero (more codes than the length allows).
  let left = 1;
  for (let length = 1; length <= MAX_BITS; length++) {
    left = left * 2 - count[length]!;
    if (left < 0) throw new InflateError("Over-subscribed code");
  }
  const offsets = new Uint16Array(MAX_BITS + 1);
  for (let length = 1; length < MAX_BITS; length++) {
    offsets[length + 1] = offsets[length]! + count[length]!;
  }
  const symbol = new Uint16Array(lengths.length);
  for (let i = 0; i < lengths.length; i++) {
    const length = lengths[i]!;
    if (length !== 0) symbol[offsets[length]!++] = i;
  }
  return { count, symbol };
}

const FIXED_LITERALS = huffman(
  Array.from({ length: 288 }, (_, i) => (i < 144 ? 8 : i < 256 ? 9 : i < 280 ? 7 : 8))
);
const FIXED_DISTANCES = huffman(Array.from({ length: 30 }, () => 5));

class Inflater {
  private position: number;
  /** Bits read ahead, lowest first, and how many. */
  private buffer = 0;
  private buffered = 0;
  private output: Uint8Array;
  private written = 0;

  constructor(
    private readonly input: Uint8Array,
    start: number,
    private readonly end: number,
    private readonly maxOutput: number
  ) {
    this.position = start;
    this.output = new Uint8Array(Math.min(maxOutput, 1024));
  }

  /** Where the data ended: the first byte after the last block's (its bits rounded up). */
  get consumed(): number {
    return this.position;
  }

  private bits(count: number): number {
    while (this.buffered < count) {
      if (this.position >= this.end) throw new InflateError("Truncated data");
      this.buffer |= this.input[this.position++]! << this.buffered;
      this.buffered += 8;
    }
    const value = this.buffer & ((1 << count) - 1);
    this.buffer >>>= count;
    this.buffered -= count;
    return value;
  }

  /** Room for `count` more bytes, within `maxOutput`. */
  private reserve(count: number): void {
    const needed = this.written + count;
    if (needed > this.maxOutput) throw new InflateError("Larger than allowed");
    if (needed <= this.output.length) return;
    let size = Math.max(this.output.length, 1);
    while (size < needed) size *= 2;
    const grown = new Uint8Array(Math.min(this.maxOutput, size));
    grown.set(this.output.subarray(0, this.written));
    this.output = grown;
  }

  private emit(byte: number): void {
    this.reserve(1);
    this.output[this.written++] = byte;
  }

  /** The next symbol of `code`, its bits read one at a time (puff's canonical decoding). */
  private decode(code: Huffman): number {
    let value = 0;
    let first = 0;
    let index = 0;
    for (let length = 1; length <= MAX_BITS; length++) {
      value |= this.bits(1);
      const count = code.count[length]!;
      if (value - count < first) return code.symbol[index + (value - first)]!;
      index += count;
      first = (first + count) << 1;
      value <<= 1;
    }
    throw new InflateError("Invalid code");
  }

  private stored(): void {
    // Its length starts at the next byte.
    this.buffer = 0;
    this.buffered = 0;
    if (this.position + 4 > this.end) throw new InflateError("Truncated data");
    const length = this.input[this.position]! | (this.input[this.position + 1]! << 8);
    const check = this.input[this.position + 2]! | (this.input[this.position + 3]! << 8);
    this.position += 4;
    if (length !== (~check & 0xffff)) throw new InflateError("Stored length mismatch");
    if (this.position + length > this.end) throw new InflateError("Truncated data");
    this.reserve(length);
    this.output.set(this.input.subarray(this.position, this.position + length), this.written);
    this.written += length;
    this.position += length;
  }

  private codes(literals: Huffman, distances: Huffman): void {
    for (;;) {
      const symbol = this.decode(literals);
      if (symbol < 256) {
        this.emit(symbol);
        continue;
      }
      if (symbol === 256) return;
      const lengthCode = symbol - 257;
      if (lengthCode >= LENGTH_BASE.length) throw new InflateError("Invalid length");
      const length = LENGTH_BASE[lengthCode]! + this.bits(LENGTH_EXTRA[lengthCode]!);
      const distanceCode = this.decode(distances);
      if (distanceCode >= DISTANCE_BASE.length) throw new InflateError("Invalid distance");
      const distance = DISTANCE_BASE[distanceCode]! + this.bits(DISTANCE_EXTRA[distanceCode]!);
      if (distance > this.written) throw new InflateError("Distance too far back");
      this.reserve(length);
      // Byte by byte: a copy may overlap the bytes it writes (a run).
      const output = this.output;
      for (let i = 0; i < length; i++, this.written++) {
        output[this.written] = output[this.written - distance]!;
      }
    }
  }

  private dynamic(): void {
    const literalCount = this.bits(5) + 257;
    const distanceCount = this.bits(5) + 1;
    const lengthCount = this.bits(4) + 4;
    if (literalCount > 286 || distanceCount > 30) throw new InflateError("Too many codes");
    const lengthLengths = new Uint8Array(19);
    for (let i = 0; i < lengthCount; i++) lengthLengths[CODE_LENGTH_ORDER[i]!] = this.bits(3);
    const lengthCode = huffman(lengthLengths);
    const lengths = new Uint8Array(literalCount + distanceCount);
    for (let i = 0; i < lengths.length;) {
      const symbol = this.decode(lengthCode);
      if (symbol < 16) {
        lengths[i++] = symbol;
        continue;
      }
      let repeat: number;
      let value = 0;
      if (symbol === 16) {
        if (i === 0) throw new InflateError("Repeat without a length");
        value = lengths[i - 1]!;
        repeat = 3 + this.bits(2);
      } else if (symbol === 17) {
        repeat = 3 + this.bits(3);
      } else {
        repeat = 11 + this.bits(7);
      }
      if (i + repeat > lengths.length) throw new InflateError("Too many lengths");
      lengths.fill(value, i, i + repeat);
      i += repeat;
    }
    if (lengths[256] === 0) throw new InflateError("No end-of-block code");
    this.codes(huffman(lengths.subarray(0, literalCount)), huffman(lengths.subarray(literalCount)));
  }

  run(): Uint8Array {
    let last = 0;
    while (!last) {
      last = this.bits(1);
      const type = this.bits(2);
      if (type === 0) this.stored();
      else if (type === 1) this.codes(FIXED_LITERALS, FIXED_DISTANCES);
      else if (type === 2) this.dynamic();
      else throw new InflateError("Invalid block type");
    }
    return this.output.slice(0, this.written);
  }
}

/** The raw deflate data of `input` (RFC 1951) inflated: `maxOutput` bytes at most. */
export function inflate(input: Uint8Array, maxOutput: number): Uint8Array {
  return new Inflater(input, 0, input.length, maxOutput).run();
}

/** Adler-32 of `bytes` (RFC 1950 § 8). */
function adler32(bytes: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (let i = 0; i < bytes.length; i++) {
    a = (a + bytes[i]!) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

/**
 * The zlib data of `input` (RFC 1950: a deflate stream, no preset dictionary) inflated, its
 * Adler-32 checked: `maxOutput` bytes at most.
 */
export function zlibInflate(input: Uint8Array, maxOutput: number): Uint8Array {
  if (input.length < 6) throw new InflateError("Truncated data");
  const method = input[0]!;
  const flags = input[1]!;
  if ((method & 0x0f) !== 8 || method >> 4 > 7) throw new InflateError("Not deflate data");
  if (((method << 8) | flags) % 31 !== 0) throw new InflateError("Damaged header");
  if (flags & 0x20) throw new InflateError("Preset dictionary");
  const at = input.length - 4;
  const inflater = new Inflater(input, 2, at, maxOutput);
  const output = inflater.run();
  // Its checksum right after the last block: nothing in between.
  if (inflater.consumed !== at) throw new InflateError("Trailing data");
  const expected =
    ((input[at]! << 24) | (input[at + 1]! << 16) | (input[at + 2]! << 8) | input[at + 3]!) >>> 0;
  if (adler32(output) !== expected) throw new InflateError("Checksum mismatch");
  return output;
}
