import * as FLAGS from "country-flag-icons/string/3x2";
import { StyleSheet, View } from "react-native";
import { SvgXml } from "react-native-svg";

import { makeStyles, stroke } from "@/theme";

const SVG: Partial<Record<string, string>> = FLAGS;

/** Whether `code` (ISO 3166-1 alpha-2, upper case) has a flag. */
export function hasFlag(code: string): boolean {
  return SVG[code] !== undefined;
}

type FlagProps = {
  /** ISO 3166-1 alpha-2 code, upper case. */
  code: string;
  /** Width in points; flags are 3:2. */
  width?: number;
};

/**
 * A country's flag (country-flag-icons, 3:2; also the EU's, for the euro), decorative: it always
 * sits next to the name of what it stands for (a country, a currency), so screen readers skip it.
 * The outline keeps white flags visible on white.
 */
export function Flag({ code, width = 24 }: FlagProps) {
  const styles = useStyles();
  const height = (width * 2) / 3;
  const xml = SVG[code];
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.frame, { width, height }]}
    >
      {xml ? <SvgXml xml={xml} width={width} height={height} /> : null}
      <View style={styles.outline} />
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  frame: { borderRadius: 3, overflow: "hidden" },
  outline: {
    ...StyleSheet.absoluteFill,
    borderRadius: 3,
    borderWidth: stroke.hairline,
    borderColor: colors.border.faint
  }
}));
