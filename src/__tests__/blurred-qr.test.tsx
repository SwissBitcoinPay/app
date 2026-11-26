import { render, screen } from "@testing-library/react-native";
import { Platform } from "react-native";

import { BlurredQr } from "@/components/ui/BlurredQr";
import { qrRuns } from "@/components/ui/qr-modules";
import { palette, qr } from "@/theme";

import { drawn, svgColour } from "../../jest/svg";

const VALUE = "lightning:lnbc490u1p5test";

describe("BlurredQr", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("draws every dark module of the code, inside its plate's quiet zone, in one blurred path", async () => {
    await render(<BlurredQr value={VALUE} size={216} />);
    const { count, rows } = qrRuns(VALUE);
    const [path] = drawn("RNSVGPath");
    const d = String(path.props.d);
    // One part per run of dark modules, as QrPlate draws them.
    expect(d.match(/M/g)).toHaveLength(rows.flat().length);
    // The top left finder pattern starts the first row, at the quiet zone.
    expect(d.startsWith(`M${qr.quietZone} ${qr.quietZone}h`)).toBe(true);
    for (const [, x, y] of d.matchAll(/M([\d.]+) ([\d.]+)/g)) {
      expect(Number(x)).toBeGreaterThanOrEqual(qr.quietZone);
      expect(Number(y)).toBeGreaterThanOrEqual(qr.quietZone);
      expect(Number(x)).toBeLessThan(qr.quietZone + 216);
      expect(Number(y)).toBeLessThan(qr.quietZone + 216);
    }
    // Blurred by its own filter, by one module.
    const [filter] = drawn("RNSVGFilter");
    expect(path.props.filter).toBe(filter.props.name);
    const [blur] = drawn("RNSVGFeGaussianBlur");
    expect(blur.props.stdDeviationX).toBeCloseTo(216 / count);
    expect(blur.props.stdDeviationY).toBeCloseTo(216 / count);
  });

  it("veils the modules at the ink's 35 %, on a plate of the code's size and quiet zone", async () => {
    await render(<BlurredQr value={VALUE} size={340} />);
    const [svg] = drawn("RNSVGSvgView");
    expect(svg.props.width).toBe(340 + qr.quietZone * 2);
    expect(svg.props.height).toBe(340 + qr.quietZone * 2);
    const [path] = drawn("RNSVGPath");
    expect(svgColour(path.props.fill)).toEqual({
      rgb: palette.ink,
      alpha: Math.round(0.35 * 255) / 255
    });
  });

  it("gives Android the strongest blur its renderer draws", async () => {
    jest.replaceProperty(Platform, "OS", "android");
    await render(<BlurredQr value={VALUE} size={216} />);
    const [blur] = drawn("RNSVGFeGaussianBlur");
    // A RenderScript radius of twice the deviation in device pixels, capped at 25.
    expect(blur.props.stdDeviationX).toBe(12.5);
  });

  it("names each drawing's filter apart: on the web, a page's SVGs share their ids", async () => {
    await render(
      <>
        <BlurredQr value={VALUE} size={216} />
        <BlurredQr value={VALUE} size={340} />
      </>
    );
    const names = drawn("RNSVGFilter").map((filter) => filter.props.name as string);
    expect(new Set(names).size).toBe(2);
    for (const name of names) expect(name).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(drawn("RNSVGPath").map((path) => path.props.filter)).toEqual(names);
  });

  it("is decorative: screen readers skip it", async () => {
    await render(<BlurredQr value={VALUE} size={216} />);
    expect(screen.toJSON()).toMatchObject({ props: { "aria-hidden": true } });
  });
});
