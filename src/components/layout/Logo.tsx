import { View } from "react-native";
import Svg, { Path } from "react-native-svg";

import { palette, useTheme } from "@/theme";

import { LOGO_HEIGHT, LOGO_PATHS, LOGO_WIDTH } from "./logo-paths";

/**
 * The horizontal brand logo, a vector: sharp at any density, no image file to load on the web.
 * `light`, over ink (the desktop side bar): "sattle" in white, ".me" keeps
 * its orange, as the brand kit's dark icon draws its "s." (white on ink). Without a `tone`, the
 * theme's: `light` in the dark theme.
 */
export function Logo({ width, tone: toneProp }: { width: number; tone?: "dark" | "light" }) {
  const { scheme } = useTheme();
  const tone = toneProp ?? (scheme === "dark" ? "light" : "dark");
  const height = (width * LOGO_HEIGHT) / LOGO_WIDTH;
  return (
    <View
      accessible
      accessibilityLabel="sattle.me"
      accessibilityRole="image"
      style={{ width, height }}
    >
      <Svg width={width} height={height} viewBox={`0 0 ${LOGO_WIDTH} ${LOGO_HEIGHT}`}>
        {LOGO_PATHS.map(({ fill, d }, index) => (
          <Path
            key={index}
            fill={tone === "light" && fill === palette.ink ? palette.white : fill}
            d={d}
          />
        ))}
      </Svg>
    </View>
  );
}
