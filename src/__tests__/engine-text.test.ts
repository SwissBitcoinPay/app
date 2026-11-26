// The extension engine's UTF-8 (src/lib/engine/text.ts, polyfills.ts): the same bytes and the same
// text as Node's TextEncoder and TextDecoder, which follow the Encoding Standard too, on every kind
// of input, valid or not.
import { Utf8Decoder, Utf8Encoder } from "@/lib/engine/polyfills";
import { decodeUtf8, encodeUtf8 } from "@/lib/engine/text";

const { TextDecoder: NodeTextDecoder, TextEncoder: NodeTextEncoder } = jest.requireActual<{
  TextDecoder: typeof TextDecoder;
  TextEncoder: typeof TextEncoder;
}>("util");

const nodeEncode = (text: string) => new NodeTextEncoder().encode(text);
const nodeDecode = (bytes: Uint8Array, fatal = false) =>
  new NodeTextDecoder("utf-8", { fatal }).decode(bytes);

/** A deterministic pseudo-random source (tests only): xorshift32. */
function generator(seed: number) {
  let state = seed >>> 0 || 1;
  return (bound: number) => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) % bound;
  };
}

describe("encodeUtf8", () => {
  it("writes what TextEncoder writes, lone surrogates as U+FFFD", () => {
    const texts = [
      "",
      "Card payment",
      "Zürich · São Paulo · Kraków · Ørsted",
      "€ 12.50 — “1=1”",
      "😀🥐👩‍👩‍👧",
      "\u0000\u007f\u0080߿ࠀ￿",
      "\ud800",
      "\udc00",
      "a\ud800b",
      "􏿿",
      "😀\ud83d"
    ];
    for (const text of texts) expect([text, encodeUtf8(text)]).toEqual([text, nodeEncode(text)]);
  });

  it("writes what TextEncoder writes, for any UTF-16", () => {
    const next = generator(7);
    for (let i = 0; i < 2000; i++) {
      const units = Array.from(
        { length: next(12) },
        () =>
          // Biased towards the edges: ASCII, the surrogates, the BMP's end.
          [next(0x80), 0xd800 + next(0x800), 0x80 + next(0xff80), 0xfff0 + next(0x10)][next(4)]
      );
      const text = String.fromCharCode(...units);
      expect(encodeUtf8(text)).toEqual(nodeEncode(text));
    }
  });
});

describe("decodeUtf8", () => {
  it("reads what TextDecoder reads, a leading BOM removed and ill-formed bytes replaced", () => {
    const inputs = [
      [],
      [0xef, 0xbb, 0xbf, 0x41],
      [0x41, 0xef, 0xbb, 0xbf],
      [0xc0, 0x80],
      [0xe0, 0x80, 0x80],
      [0xed, 0xa0, 0x80],
      [0xf4, 0x90, 0x80, 0x80],
      [0xf0, 0x9f, 0x98],
      [0xf0, 0x9f, 0x98, 0x41],
      [0xff, 0xfe],
      [0x80, 0x80],
      [0xe2, 0x82, 0xac]
    ].map((bytes) => Uint8Array.from(bytes));
    for (const bytes of inputs) {
      expect([Array.from(bytes), decodeUtf8(bytes)]).toEqual([
        Array.from(bytes),
        nodeDecode(bytes)
      ]);
    }
  });

  it("reads what TextDecoder reads, for any bytes", () => {
    const next = generator(11);
    for (let i = 0; i < 5000; i++) {
      const bytes = Uint8Array.from(
        { length: next(10) },
        () =>
          // Biased towards the bytes that start or continue a sequence.
          [next(0x80), 0x80 + next(0x40), 0xc0 + next(0x40), next(0x100)][next(4)]
      );
      expect([Array.from(bytes), decodeUtf8(bytes)]).toEqual([
        Array.from(bytes),
        nodeDecode(bytes)
      ]);
    }
  });

  it("fatal: throws where TextDecoder throws, and only there", () => {
    const next = generator(13);
    for (let i = 0; i < 3000; i++) {
      const bytes = Uint8Array.from({ length: next(8) }, () => next(0x100));
      let expected: string | "throws";
      try {
        expected = nodeDecode(bytes, true);
      } catch {
        expected = "throws";
      }
      let got: string | "throws";
      try {
        got = decodeUtf8(bytes, { fatal: true });
      } catch (error) {
        expect(error).toBeInstanceOf(TypeError);
        got = "throws";
      }
      expect([Array.from(bytes), got]).toEqual([Array.from(bytes), expected]);
    }
  });

  it("reads a long text whole", () => {
    const text = "Kartenzahlung 😀 ".repeat(5000);
    expect(decodeUtf8(nodeEncode(text))).toBe(text);
  });
});

describe("the engine's TextEncoder and TextDecoder", () => {
  it("take what @noble gives them, and refuse what they do not support", () => {
    expect(new Utf8Encoder().encode("é")).toEqual(Uint8Array.of(0xc3, 0xa9));
    const decoder = new Utf8Decoder();
    expect(decoder.decode(Uint8Array.of(0xc3, 0xa9))).toBe("é");
    expect(decoder.decode(Uint8Array.of(0, 0xc3, 0xa9).subarray(1))).toBe("é");
    expect(decoder.decode(Uint8Array.of(0xc3, 0xa9).buffer)).toBe("é");
    expect(decoder.decode()).toBe("");
    expect(new Utf8Decoder("UTF8").encoding).toBe("utf-8");
    expect(() => new Utf8Decoder("utf-16le")).toThrow(RangeError);
    expect(() => new Utf8Decoder("utf-8", { ignoreBOM: true })).toThrow(RangeError);
    expect(() => decoder.decode(Uint8Array.of(0x41), { stream: true })).toThrow(RangeError);
    expect(() => decoder.decode("é" as unknown as Uint8Array)).toThrow(TypeError);
    expect(() => new Utf8Decoder("utf-8", { fatal: true }).decode(Uint8Array.of(0xff))).toThrow(
      TypeError
    );
  });
});
