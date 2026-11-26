import { CARD_ASPECT, CARD_NAME_ZONE, inkOver } from "@/features/card/card-look";
import {
  CENTRED,
  MAX_ZOOM,
  clampFraming,
  coverScale,
  cropOf,
  inkOverCrop,
  nameAreaOf,
  zoomTo,
  type Framing
} from "@/features/card/image-frame";
import { hexLuminance, lightMapOf, relativeLuminance } from "@/lib/media/luminance";

/** The design's window: 330 × 208, a card's shape (ApparenceCadrage.dc.html). */
const WINDOW = { width: 330, height: 330 / CARD_ASPECT };
const LANDSCAPE = { width: 2048, height: 1536 };
const PORTRAIT = { width: 1536, height: 2048 };

/** Where the window's middle falls in the image, in its pixels. */
function middleOf(image: typeof LANDSCAPE, framing: Framing) {
  const scale = coverScale(image, WINDOW) * framing.zoom;
  return { x: image.width / 2 - framing.x / scale, y: image.height / 2 - framing.y / scale };
}

describe("framing an image under the card's window", () => {
  it("starts with the image covering the window, its middle under it", () => {
    // A landscape photo, wider than tall but less than a card: as wide as the window.
    const crop = cropOf(LANDSCAPE, WINDOW, CENTRED);
    expect(crop.width).toBe(2048);
    expect(crop.width / crop.height).toBeCloseTo(CARD_ASPECT, 2);
    expect(crop.originX).toBe(0);
    expect(crop.originY * 2 + crop.height).toBeGreaterThanOrEqual(1535);
    expect(crop.originY * 2 + crop.height).toBeLessThanOrEqual(1537);
    // A portrait one: as wide as the window too, its middle band.
    const tall = cropOf(PORTRAIT, WINDOW, CENTRED);
    expect(tall.width).toBe(1536);
    expect(tall.originY).toBe(Math.round((2048 - tall.height) / 2));
  });

  it("never moves the image off the window, nor zooms past its bounds", () => {
    // At zoom 1, a landscape photo moves up and down only, as far as it covers the window.
    expect(clampFraming(LANDSCAPE, WINDOW, { zoom: 1, x: 500, y: -500 })).toEqual({
      zoom: 1,
      x: 0,
      y: -(1536 * coverScale(LANDSCAPE, WINDOW) - WINDOW.height) / 2
    });
    expect(clampFraming(LANDSCAPE, WINDOW, { zoom: 0.2, x: 0, y: 0 }).zoom).toBe(1);
    expect(clampFraming(LANDSCAPE, WINDOW, { zoom: 9, x: 0, y: 0 }).zoom).toBe(MAX_ZOOM);
    expect(clampFraming(LANDSCAPE, WINDOW, { zoom: Number.NaN, x: Number.NaN, y: 1 })).toEqual({
      zoom: 1,
      x: 0,
      y: 1
    });
    // However it was moved and zoomed: a part of the image of the window's shape.
    for (let n = 0; n < 200; n++) {
      const framing = clampFraming(LANDSCAPE, WINDOW, {
        zoom: 1 + ((n * 7) % 21) / 10,
        x: ((n * 37) % 2001) - 1000,
        y: ((n * 53) % 2001) - 1000
      });
      const crop = cropOf(LANDSCAPE, WINDOW, framing);
      expect(crop.originX).toBeGreaterThanOrEqual(0);
      expect(crop.originY).toBeGreaterThanOrEqual(0);
      expect(crop.originX + crop.width).toBeLessThanOrEqual(LANDSCAPE.width);
      expect(crop.originY + crop.height).toBeLessThanOrEqual(LANDSCAPE.height);
      expect(crop.width / crop.height).toBeCloseTo(CARD_ASPECT, 1);
    }
  });

  it("zooms about the window's middle, the point under it staying there", () => {
    const moved = clampFraming(LANDSCAPE, WINDOW, { zoom: 2, x: 120, y: -40 });
    const before = middleOf(LANDSCAPE, moved);
    const zoomed = zoomTo(LANDSCAPE, WINDOW, moved, 2.75);
    expect(zoomed.zoom).toBe(2.75);
    const after = middleOf(LANDSCAPE, zoomed);
    expect(after.x).toBeCloseTo(before.x, 9);
    expect(after.y).toBeCloseTo(before.y, 9);
    // Zoomed out to 1: kept covering the window.
    expect(zoomTo(LANDSCAPE, WINDOW, zoomed, 1)).toEqual(
      clampFraming(LANDSCAPE, WINDOW, { zoom: 1, x: 0, y: zoomed.y / 2.75 })
    );
    // At 3 times at most: a third of the image's width, sharp enough for the card (640 px).
    const closest = cropOf(LANDSCAPE, WINDOW, zoomTo(LANDSCAPE, WINDOW, CENTRED, 10));
    expect(closest.width).toBe(Math.round(2048 / 3));
  });
});

describe("the ink of the name over the image", () => {
  it("is black over a light image, white over a dark one", () => {
    expect(inkOver(1)).toBe("dark");
    expect(inkOver(0)).toBe("light");
    // Where both contrast alike: sqrt(1.05 × (L(ink) + 0.05)) − 0.05.
    const even = Math.sqrt(1.05 * (hexLuminance("#0B1A33") + 0.05)) - 0.05;
    expect(inkOver(even + 1e-6)).toBe("dark");
    expect(inkOver(even - 1e-6)).toBe("light");
    // Mid-grey (sRGB 128, 21.6 % of white's light) is light enough for black.
    expect(inkOver(relativeLuminance({ r: 128, g: 128, b: 128 }))).toBe("dark");
    expect(inkOver(relativeLuminance({ r: 110, g: 110, b: 110 }))).toBe("light");
  });

  it("follows the image where the name goes, the top band of the window", () => {
    // A light sky over dark dunes: its top quarter white, the rest black (16 × 12 cells).
    const width = 16;
    const height = 12;
    const light = lightMapOf(
      Array.from({ length: width * height }, (_, index) => {
        const value = Math.floor(index / width) < 3 ? 255 : 0;
        return { r: value, g: value, b: value };
      }),
      width,
      height
    );
    const image = LANDSCAPE;
    // The window at the top of the image: the name over the sky.
    const top = clampFraming(image, WINDOW, { zoom: 1, x: 0, y: 1000 });
    expect(inkOverCrop(image, light, cropOf(image, WINDOW, top))).toBe("dark");
    // Lower down, zoomed: over the dunes.
    const low = clampFraming(image, WINDOW, { zoom: 2, x: 0, y: -1000 });
    expect(inkOverCrop(image, light, cropOf(image, WINDOW, low))).toBe("light");
    // The name's band, inside the crop: the card's face's own.
    const crop = cropOf(image, WINDOW, low);
    const area = nameAreaOf(image, crop);
    expect(area.left * image.width).toBeCloseTo(crop.originX + CARD_NAME_ZONE.left * crop.width);
    expect(area.bottom * image.height).toBeCloseTo(
      crop.originY + CARD_NAME_ZONE.bottom * crop.height
    );
    expect(CARD_NAME_ZONE.top).toBeCloseTo(16 / 189, 2);
    expect(CARD_NAME_ZONE.bottom).toBeCloseTo(40 / 189, 2);
  });
});
