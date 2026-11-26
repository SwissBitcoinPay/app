import {
  contrastRatio,
  hexLuminance,
  lightMapOf,
  meanLight,
  relativeLuminance
} from "@/lib/media/luminance";
import type { Rgb } from "@/lib/media/png";

const grey = (value: number): Rgb => ({ r: value, g: value, b: value });

describe("relativeLuminance", () => {
  it("is WCAG 2.x's: 0 for black, 1 for white, linear in between", () => {
    expect(relativeLuminance(grey(0))).toBe(0);
    expect(relativeLuminance(grey(255))).toBeCloseTo(1, 12);
    // sRGB 128 is about 21.6 % of the light of white; 10 is under the linear segment's knee.
    expect(relativeLuminance(grey(128))).toBeCloseTo(0.2158605, 6);
    expect(relativeLuminance(grey(10))).toBeCloseTo(10 / 255 / 12.92, 12);
    // Green weighs most, blue least.
    expect(relativeLuminance({ r: 0, g: 255, b: 0 })).toBeCloseTo(0.7152, 12);
    expect(relativeLuminance({ r: 0, g: 0, b: 255 })).toBeCloseTo(0.0722, 12);
  });

  it("gives the contrast ratios of the design's inks", () => {
    expect(contrastRatio(hexLuminance("#FFFFFF"), hexLuminance("#000000"))).toBeCloseTo(21, 10);
    // The app's ink on white: 17.4:1 (its contrast checked elsewhere, card-look.test.ts).
    expect(contrastRatio(hexLuminance("#0B1A33"), 1)).toBeCloseTo(17.36, 2);
    expect(contrastRatio(0.2, 0.2)).toBe(1);
    expect(() => hexLuminance("#FFF")).toThrow();
    expect(() => hexLuminance("rgba(0, 0, 0, 1)")).toThrow();
  });
});

describe("meanLight", () => {
  // 4 × 2: a white left half, a black right half; the bottom row half as light.
  const map = lightMapOf(
    [grey(255), grey(255), grey(0), grey(0), grey(255), grey(255), grey(0), grey(0)].map(
      (pixel, index) => (index >= 4 && pixel.r === 255 ? grey(188) : pixel)
    ),
    4,
    2
  );
  const half = relativeLuminance(grey(188));

  it("averages the cells of the area, each by the share of it the area covers", () => {
    expect(meanLight(map, { left: 0, top: 0, right: 1, bottom: 1 })).toBeCloseTo(
      (2 + 2 * half) / 8,
      12
    );
    expect(meanLight(map, { left: 0, top: 0, right: 0.5, bottom: 0.5 })).toBeCloseTo(1, 12);
    expect(meanLight(map, { left: 0.5, top: 0, right: 1, bottom: 1 })).toBe(0);
    // Three quarters of a white cell and one quarter of a black one.
    expect(meanLight(map, { left: 0.3125, top: 0, right: 0.5625, bottom: 0.5 })).toBeCloseTo(
      0.75,
      12
    );
    // A part of one cell: that cell.
    expect(meanLight(map, { left: 0.05, top: 0.6, right: 0.1, bottom: 0.7 })).toBeCloseTo(half, 12);
  });

  it("keeps the area within the image, and refuses an area of nothing", () => {
    expect(meanLight(map, { left: -1, top: -1, right: 0.5, bottom: 0.5 })).toBeCloseTo(1, 12);
    expect(() => meanLight(map, { left: 0.5, top: 0, right: 0.5, bottom: 1 })).toThrow();
    expect(() => meanLight(map, { left: 1.2, top: 0, right: 1.5, bottom: 1 })).toThrow();
    expect(() => meanLight(map, { left: 0, top: 0, right: Number.NaN, bottom: 1 })).toThrow();
  });

  it("refuses pixels of another size than the one given", () => {
    expect(() => lightMapOf([grey(0)], 2, 1)).toThrow();
    expect(() => lightMapOf([], 0, 0)).toThrow();
    expect(() => lightMapOf([grey(0)], 0.5, 2)).toThrow();
  });
});
