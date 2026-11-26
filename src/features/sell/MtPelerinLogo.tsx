import { Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { useTranslation } from "react-i18next";

import { makeStyles, sans, useTheme } from "@/theme";

import {
  MTPELERIN_LOGO_DARK_PATHS,
  MTPELERIN_LOGO_DARK_VIEWBOX,
  MTPELERIN_LOGO_HEIGHT,
  MTPELERIN_LOGO_PATHS,
  MTPELERIN_LOGO_WIDTH
} from "./mtpelerin-logo-paths";

/**
 * Mt Pelerin's logo, `height` high: a vector, as the app's own (Logo.tsx). In the dark theme, its
 * brand kit's version for a dark background.
 */
export function MtPelerinLogo({ height }: { height: number }) {
  const { scheme } = useTheme();
  const dark = scheme === "dark";
  const paths = dark ? MTPELERIN_LOGO_DARK_PATHS : MTPELERIN_LOGO_PATHS;
  const width = (height * MTPELERIN_LOGO_WIDTH) / MTPELERIN_LOGO_HEIGHT;
  return (
    <View
      accessible
      accessibilityLabel="Mt Pelerin"
      accessibilityRole="image"
      style={{ width, height }}
    >
      <Svg
        width={width}
        height={height}
        viewBox={
          dark
            ? MTPELERIN_LOGO_DARK_VIEWBOX
            : `0 0 ${MTPELERIN_LOGO_WIDTH} ${MTPELERIN_LOGO_HEIGHT}`
        }
      >
        {paths.map(({ fill, d }, index) => (
          <Path key={index} fill={fill} d={d} />
        ))}
      </Svg>
    </View>
  );
}

/**
 * "Powered by" and Mt Pelerin's logo, discreet, at the bottom of each of "Sell"'s panels.
 */
export function PoweredByMtPelerin() {
  const styles = useStyles();
  const { t } = useTranslation();
  return (
    <View style={styles.row} testID="sell-powered-by">
      <Text style={styles.label}>{t("sell.poweredBy")}</Text>
      <MtPelerinLogo height={18} />
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  label: { ...sans(600), fontSize: 11.5, color: colors.text.secondary }
}));
