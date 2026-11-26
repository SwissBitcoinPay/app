import { fontAssets, type FontName } from "../theme/fonts";
import { sans, type Weight } from "../theme/typography";

// Node's types are not loaded (see app-config.test.ts): only what this test needs is typed here.
declare const __dirname: string;
const { readFileSync } = jest.requireActual<{ readFileSync(file: string): Uint8Array }>("fs");
const { join } = jest.requireActual<{ join(...segments: string[]): string }>("path");

/** The tables of a TrueType file (OpenType spec, "Table directory"), by tag. */
function tables(file: Uint8Array): Map<string, DataView> {
  const font = new DataView(file.buffer, file.byteOffset, file.byteLength);
  const found = new Map<string, DataView>();
  for (let i = 0; i < font.getUint16(4); i++) {
    const record = 12 + i * 16;
    const tag = String.fromCharCode(...file.subarray(record, record + 4));
    const offset = font.getUint32(record + 8);
    found.set(
      tag,
      new DataView(file.buffer, file.byteOffset + offset, font.getUint32(record + 12))
    );
  }
  return found;
}

/** The vertical metrics of a font file of the app (`head`, `hhea`, `OS/2` version 2 or later). */
function metricsOf(name: FontName) {
  const t = tables(readFileSync(join(__dirname, "../../assets/fonts", `${name}.ttf`)));
  const head = t.get("head")!;
  const hhea = t.get("hhea")!;
  const os2 = t.get("OS/2")!;
  return {
    unitsPerEm: head.getUint16(18),
    yMin: head.getInt16(38),
    yMax: head.getInt16(42),
    ascender: hhea.getInt16(4),
    descender: hhea.getInt16(6),
    lineGap: hhea.getInt16(8),
    useTypoMetrics: (os2.getUint16(62) & (1 << 7)) !== 0,
    typoAscender: os2.getInt16(68),
    typoDescender: os2.getInt16(70),
    typoLineGap: os2.getInt16(72),
    winAscent: os2.getUint16(74),
    winDescent: os2.getUint16(76),
    capHeight: os2.getInt16(88)
  };
}

const sansFiles = (Object.keys(fontAssets) as FontName[]).filter((name) =>
  name.startsWith("PlusJakartaSans-")
);

describe("Plus Jakarta Sans' vertical metrics (fonts.ts)", () => {
  it("are the files of every weight sans() draws", () => {
    expect(sansFiles.length).toBeGreaterThan(0);
    for (const weight of [400, 500, 600, 700] as Weight[]) {
      expect(sansFiles).toContain(sans(weight).fontFamily);
    }
  });

  it.each(sansFiles)("%s: a line of 1.5 em with the capitals in its middle", (name) => {
    const m = metricsOf(name);
    expect(m.unitsPerEm).toBe(1000);
    // The same in the tables each platform reads (iOS and Android: hhea; browsers: typo).
    expect(m.useTypoMetrics).toBe(true);
    expect([m.typoAscender, m.typoDescender, m.typoLineGap]).toEqual([
      m.ascender,
      m.descender,
      m.lineGap
    ]);
    expect(m.lineGap).toBe(0);
    expect(m.ascender - m.descender).toBe(1500);
    // The line's middle and the capitals' within one unit (a thousandth of the size).
    expect(Math.abs((m.ascender + m.descender) / 2 - m.capHeight / 2)).toBeLessThanOrEqual(1);
    // Windows clips glyphs to the win metrics: they still hold the tallest and deepest.
    expect(m.winAscent).toBeGreaterThanOrEqual(m.yMax);
    expect(m.winDescent).toBeGreaterThanOrEqual(-m.yMin);
  });
});
