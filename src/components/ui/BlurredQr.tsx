import { useId, useMemo } from "react";
import { Platform, StyleSheet, View } from "react-native";
import Svg, { Defs, FeGaussianBlur, Filter, Path } from "react-native-svg";

import { palette, qr, radius } from "@/theme";

import { qrRuns } from "./qr-modules";

/**
 * How far the blur spreads, in modules of the code: about one module's width, so that the code no
 * longer reads while its three corner squares still show what it was. Its modules are drawn at
 * 35 % of the ink, under the spinner that goes over them: in full ink, the blurred code left the
 * spinner's rail unseen.
 */
const BLUR_MODULES = 1;

/**
 * react-native-svg 15.15.4 scales FeGaussianBlur differently on each platform: the web in CSS
 * pixels, iOS in points (the deviation times the screen's scale, RNSVGFeGaussianBlur.mm), Android
 * with a RenderScript radius of twice the deviation in device pixels, capped at 25
 * (FeGaussianBlurView.java). Android gets the cap, a radius of 25 device pixels: 7 to 12 dp at
 * densities from 3.5 to 2, about as far as a deviation of one module (3 dp on a phone) spreads.
 * Not seen on a device yet. Re-check on every react-native-svg upgrade.
 */
const ANDROID_DEVIATION = 12.5;

/**
 * The plate of `value`'s code (QrPlate, same size and quiet zone), its modules blurred: drawn over
 * the plate while its payment is being checked, so that the code shows what was asked without
 * being scanned again. Decorative: hidden from screen readers.
 */
export function BlurredQr({ value, size = qr.size }: { value: string; size?: number }) {
  // An id per drawing: on the web, every SVG of the page shares one namespace of ids.
  const filterId = `qr-blur-${useId().replace(/[^A-Za-z0-9_-]/g, "")}`;
  const { path, cell } = useMemo(() => {
    const { count, rows } = qrRuns(value);
    const module = size / count;
    const at = (n: number) => Math.round(n * 100) / 100;
    const parts: string[] = [];
    rows.forEach((runs, row) => {
      for (const run of runs) {
        const width = at(run.length * module);
        parts.push(
          `M${at(qr.quietZone + run.start * module)} ${at(qr.quietZone + row * module)}` +
            `h${width}v${at(module)}h${-width}z`
        );
      }
    });
    return { path: parts.join(""), cell: module };
  }, [value, size]);
  const plate = size + qr.quietZone * 2;
  const deviation = Platform.OS === "android" ? ANDROID_DEVIATION : cell * BLUR_MODULES;

  return (
    <View aria-hidden style={[styles.plate, { width: plate, height: plate }]}>
      <Svg width={plate} height={plate}>
        <Defs>
          <Filter id={filterId}>
            <FeGaussianBlur stdDeviation={deviation} />
          </Filter>
        </Defs>
        <Path d={path} fill={palette.ink35} filter={`url(#${filterId})`} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  plate: {
    backgroundColor: palette.white,
    borderRadius: radius.lg,
    overflow: "hidden"
  }
});
