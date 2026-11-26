/**
 * Test helpers: what react-native-svg draws, read from the rendered tree, where it shows as its
 * native host components (RNSVGCircle, RNSVGPath…).
 */
import { screen } from "@testing-library/react-native";
import type { TestInstance } from "test-renderer";

/** The host elements of `type` in `root` (the whole screen, or an element found), in order. */
export function drawn(type: string, root: TestInstance = screen.container): TestInstance[] {
  return root.queryAll((node) => node.type === type, { includeSelf: true });
}

/**
 * A colour as react-native-svg passes it on (a brush of type 0 and an ARGB integer): #RRGGBB, as
 * the theme writes colours, and the colour's own opacity, 0 to 1 (not `strokeOpacity`, nor
 * `fillOpacity`). Anything else (`none`, `currentColor`, a gradient's `url(#…)`) fails the test.
 */
export function svgColour(value: unknown): { rgb: string; alpha: number } {
  const brush = value as { type?: unknown; payload?: unknown } | null | undefined;
  if (brush?.type !== 0 || typeof brush.payload !== "number") {
    throw new Error(`Not a colour as react-native-svg draws one: ${JSON.stringify(value)}`);
  }
  const argb = brush.payload >>> 0;
  return {
    rgb: `#${(argb & 0xffffff).toString(16).toUpperCase().padStart(6, "0")}`,
    alpha: (argb >>> 24) / 255
  };
}

/**
 * Whether a shape's stroke is drawn in dashes: react-native-svg passes a whole stroke as no
 * `strokeDasharray`, or as null (`none`).
 */
export function dashed(shape: TestInstance): boolean {
  const dashes: unknown = shape.props.strokeDasharray;
  return Array.isArray(dashes) && dashes.length > 0;
}
