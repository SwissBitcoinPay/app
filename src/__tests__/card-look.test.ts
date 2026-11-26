import {
  CARD_ASPECT,
  CARD_FACE,
  CARD_PALETTE,
  CARD_PAUSE,
  cardFace,
  pauseStripesPath
} from "@/features/card/card-look";
import { CARD_COLORS, defaultCardColor } from "@/lib/card/card-record";
import { palette } from "@/theme";

/** WCAG 2.x relative luminance of a #RRGGBB colour. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((at) => {
    const channel = Number.parseInt(hex.slice(at, at + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

/** `top` at `opacity` over `bottom`, both #RRGGBB, as the screen composes them. */
function over(bottom: string, top: string, opacity: number): string {
  return `#${[1, 3, 5]
    .map((at) => {
      const under = Number.parseInt(bottom.slice(at, at + 2), 16);
      const above = Number.parseInt(top.slice(at, at + 2), 16);
      return Math.round(under * (1 - opacity) + above * opacity)
        .toString(16)
        .padStart(2, "0");
    })
    .join("")}`;
}

const CARD_ID = "30c19d9bfae333c1cb42a5ce6e20debb";
const IMAGE = { key: "11".repeat(32), hash: "22".repeat(32) };

describe("the cards' palette", () => {
  it("has every colour a record may name, its name readable over it (4.5:1 at least)", () => {
    expect(Object.keys(CARD_PALETTE).sort()).toEqual([...CARD_COLORS].sort());
    for (const color of CARD_COLORS) {
      const { fill, ink } = CARD_PALETTE[color];
      expect(fill).toMatch(/^#[0-9A-F]{6}$/);
      expect(contrast(fill, ink)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("keeps a paused card's name readable over its stripes, on every colour (4.5:1 at least)", () => {
    for (const color of CARD_COLORS) {
      const { fill, ink } = CARD_PALETTE[color];
      // The stripes are drawn in the name's own ink: over them, the name contrasts the least.
      expect(contrast(over(fill, ink, CARD_PAUSE.opacity), ink)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("draws a card the shape of a bank card", () => {
    expect(CARD_ASPECT).toBeCloseTo(1.586, 3);
  });
});

describe("a card's face", () => {
  it("shows its issuer's visual first, its name in black over a light one", () => {
    const issuer = { image: IMAGE, number: "4821-0937-5530-1186", white: true };
    expect(cardFace({ cardId: CARD_ID, look: { kind: "color", color: "plum" }, issuer })).toEqual({
      kind: "issuer",
      image: IMAGE,
      ink: palette.ink
    });
    expect(cardFace({ cardId: CARD_ID, look: null, issuer: { ...issuer, white: false } })).toEqual({
      kind: "issuer",
      image: IMAGE,
      ink: palette.white
    });
  });

  it("shows the look its holder chose, else the colour drawn for it", () => {
    expect(
      cardFace({
        cardId: CARD_ID,
        look: { kind: "image", image: IMAGE, ink: "dark" },
        issuer: null
      })
    ).toEqual({ kind: "image", image: IMAGE, ink: palette.ink });
    expect(
      cardFace({
        cardId: CARD_ID,
        look: { kind: "image", image: IMAGE, ink: "light" },
        issuer: null
      })
    ).toEqual({ kind: "image", image: IMAGE, ink: palette.white });
    expect(
      cardFace({ cardId: CARD_ID, look: { kind: "color", color: "bitcoin" }, issuer: null })
    ).toEqual({ kind: "color", color: "bitcoin", ...CARD_PALETTE.bitcoin });
    expect(cardFace({ cardId: CARD_ID, look: null, issuer: null })).toEqual({
      kind: "color",
      color: defaultCardColor(CARD_ID),
      ...CARD_PALETTE[defaultCardColor(CARD_ID)]
    });
  });
});

describe("a paused card's stripes", () => {
  /** Each stripe of a path: its four corners. */
  function stripes(path: string): number[][][] {
    return path
      .split("Z")
      .filter(Boolean)
      .map((stripe) =>
        stripe
          .slice(1)
          .split("L")
          .map((corner) => corner.split(" ").map(Number))
      );
  }

  it("crosses the whole face at 45°, the same width apart, from beyond each edge", () => {
    const [width, height] = [CARD_FACE.width, 189];
    const drawn = stripes(pauseStripesPath(width, height, 1));
    const band = CARD_PAUSE.band * Math.SQRT2;
    const step = (CARD_PAUSE.band + CARD_PAUSE.gap) * Math.SQRT2;
    for (const [index, [a, b, c, d]] of drawn.entries()) {
      // From the bottom edge to the top one, rising to the right at 45°.
      expect([a[1], b[1], c[1], d[1]]).toEqual([height, height, 0, 0]);
      expect(b[0] - a[0]).toBeCloseTo(band, 1);
      expect(c[0] - b[0]).toBeCloseTo(height, 1);
      expect(d[0] - a[0]).toBeCloseTo(height, 1);
      expect(a[0]).toBeCloseTo(-height + index * step, 1);
    }
    // From the left edge, at the top as at the bottom, to the right one: the next would start
    // beyond it.
    expect(drawn[0][3][0]).toBeLessThanOrEqual(0);
    const last = drawn.at(-1)?.[0][0] ?? Number.NaN;
    expect(last).toBeLessThan(width);
    expect(last + step).toBeGreaterThanOrEqual(width);
  });

  it("draws nothing on a face without size, rather than never ending", () => {
    expect(pauseStripesPath(0, 0, 0)).toBe("");
    expect(pauseStripesPath(Number.POSITIVE_INFINITY, 95, 0.5)).toBe("");
    expect(pauseStripesPath(150, 95, Number.NaN)).toBe("");
  });

  it("scales with the face, as everything on it", () => {
    const half = stripes(pauseStripesPath(150, 95, 0.5));
    expect(half[1][0][0] - half[0][0][0]).toBeCloseTo(
      ((CARD_PAUSE.band + CARD_PAUSE.gap) * Math.SQRT2) / 2,
      1
    );
  });
});
