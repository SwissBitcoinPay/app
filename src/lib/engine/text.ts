/*
 * UTF-8 as the Encoding Standard defines it (https://encoding.spec.whatwg.org/, "UTF-8 encode",
 * "UTF-8 decoder"), for the extension's JavaScriptCore, which has no TextEncoder nor TextDecoder:
 * @noble's utf8ToBytes and bytesToUtf8 use them. Installed by polyfills.ts only where they are
 * missing; tested against Node's own on every kind of input (engine-text.test.ts).
 */

const REPLACEMENT = 0xfffd;

/** UTF-8 of `text`; a lone surrogate is written as U+FFFD, as TextEncoder does. */
export function encodeUtf8(text: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < text.length; i++) {
    let point = text.charCodeAt(i);
    if (point >= 0xd800 && point <= 0xdbff) {
      const next = i + 1 < text.length ? text.charCodeAt(i + 1) : 0;
      if (next >= 0xdc00 && next <= 0xdfff) {
        point = 0x10000 + ((point - 0xd800) << 10) + (next - 0xdc00);
        i++;
      } else {
        point = REPLACEMENT;
      }
    } else if (point >= 0xdc00 && point <= 0xdfff) {
      point = REPLACEMENT;
    }
    if (point < 0x80) {
      out.push(point);
    } else if (point < 0x800) {
      out.push(0xc0 | (point >> 6), 0x80 | (point & 0x3f));
    } else if (point < 0x10000) {
      out.push(0xe0 | (point >> 12), 0x80 | ((point >> 6) & 0x3f), 0x80 | (point & 0x3f));
    } else {
      out.push(
        0xf0 | (point >> 18),
        0x80 | ((point >> 12) & 0x3f),
        0x80 | ((point >> 6) & 0x3f),
        0x80 | (point & 0x3f)
      );
    }
  }
  return Uint8Array.from(out);
}

/**
 * The text of UTF-8 `bytes`, as TextDecoder("utf-8") decodes them whole: a leading BOM removed,
 * each ill-formed subsequence replaced by one U+FFFD (the Standard's decoder), or, `fatal`, a
 * TypeError at the first one.
 */
export function decodeUtf8(bytes: Uint8Array, { fatal = false }: { fatal?: boolean } = {}): string {
  const points: number[] = [];
  let point = 0;
  let needed = 0;
  let seen = 0;
  let lower = 0x80;
  let upper = 0xbf;
  const error = () => {
    if (fatal) throw new TypeError("The encoded data was not valid utf-8");
    points.push(REPLACEMENT);
  };
  const start = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  for (let i = start ? 3 : 0; i < bytes.length; i++) {
    const byte = bytes[i];
    if (needed === 0) {
      if (byte <= 0x7f) {
        points.push(byte);
      } else if (byte >= 0xc2 && byte <= 0xdf) {
        needed = 1;
        point = byte & 0x1f;
      } else if (byte >= 0xe0 && byte <= 0xef) {
        if (byte === 0xe0) lower = 0xa0;
        if (byte === 0xed) upper = 0x9f;
        needed = 2;
        point = byte & 0x0f;
      } else if (byte >= 0xf0 && byte <= 0xf4) {
        if (byte === 0xf0) lower = 0x90;
        if (byte === 0xf4) upper = 0x8f;
        needed = 3;
        point = byte & 0x07;
      } else {
        error();
      }
      continue;
    }
    if (byte < lower || byte > upper) {
      point = 0;
      needed = 0;
      seen = 0;
      lower = 0x80;
      upper = 0xbf;
      error();
      // The byte starts over: it may begin the next sequence.
      i--;
      continue;
    }
    lower = 0x80;
    upper = 0xbf;
    point = (point << 6) | (byte & 0x3f);
    seen++;
    if (seen === needed) {
      points.push(point);
      point = 0;
      needed = 0;
      seen = 0;
    }
  }
  if (needed !== 0) error();
  let text = "";
  // In slices: String.fromCodePoint takes its arguments on the stack.
  for (let i = 0; i < points.length; i += 4096) {
    text += String.fromCodePoint(...points.slice(i, i + 4096));
  }
  return text;
}

/** The bytes of what TextDecoder takes: a typed array, a DataView or an ArrayBuffer. */
export function bytesOf(input: unknown): Uint8Array {
  if (input === undefined) return new Uint8Array(0);
  if (input instanceof Uint8Array) return input;
  if (ArrayBuffer.isView(input)) {
    return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  }
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  throw new TypeError("Not a BufferSource");
}
