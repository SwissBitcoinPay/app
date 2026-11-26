import { hasLoneSurrogate, wellFormed } from "@/lib/text";

describe("lone surrogates", () => {
  const BREAD = "🍞"; // 🍞, a whole pair

  it("finds half a pair, wherever it is, never a whole pair", () => {
    for (const text of ["", "Order 1042", "Zürich", BREAD, `${BREAD}${BREAD}`, "�"]) {
      expect(hasLoneSurrogate(text)).toBe(false);
      expect(wellFormed(text)).toBe(text);
    }
    for (const text of [
      "\uD83C",
      "\uDF5E",
      "a\uD83Cb",
      "a\uDF5Eb",
      "\uDF5E\uD83C",
      `${BREAD}\uD83C`
    ]) {
      expect(hasLoneSurrogate(text)).toBe(true);
    }
  });

  it("writes each one as U+FFFD, as a UTF-8 encoder does, and keeps the pairs", () => {
    const text = `\uDF5E${BREAD}\uD83C a \uD83C\uD83C${BREAD}`;
    const expected = `�${BREAD}� a ��${BREAD}`;
    expect(wellFormed(text)).toBe(expected);
    expect(new TextDecoder().decode(new TextEncoder().encode(text))).toBe(expected);
    // Twice in a row: no state kept between calls (a global regular expression's lastIndex).
    expect(wellFormed(text)).toBe(expected);
    expect(hasLoneSurrogate(text)).toBe(true);
    expect(hasLoneSurrogate(text)).toBe(true);
    expect(() => encodeURIComponent(wellFormed(text))).not.toThrow();
  });
});
