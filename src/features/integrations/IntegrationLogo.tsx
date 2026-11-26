import { useId } from "react";
import { View } from "react-native";
import { SvgXml } from "react-native-svg";

import type { IntegrationOptionId } from "@/config/integration-catalog";
import { makeStyles, radius, stroke, useTheme } from "@/theme";

import { integrationLogo, scopeLogoIds } from "./logos";

/**
 * A platform's or a language's logo (logos.ts) in a tile of the surface's colour with a hairline,
 * as Flag outlines flags: a logo keeps its own colours, its brand's version for dark backgrounds in
 * the dark theme. Without its tile (`framed` false), the mark alone, `size` wide: for what is its
 * frame already (the "Coming soon" chips of "New integration"). Decorative: its name always sits
 * next to it, so screen readers skip it.
 */
export function IntegrationLogo({
  id,
  size = 40,
  framed = true
}: {
  id: IntegrationOptionId;
  size?: number;
  framed?: boolean;
}) {
  // The small tile (40 px, radius.sm) at any size.
  const styles = useStyles();
  const { scheme } = useTheme();
  // Ids of its own (scopeLogoIds): on the web, every SVG of the page shares one namespace of ids.
  const scope = useId().replace(/[^A-Za-z0-9_-]/g, "");
  const mark = framed ? Math.round(size * 0.66) : size;
  const corner = Math.round((size * radius.sm) / 40);
  return (
    <View
      aria-hidden
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        framed ? styles.tile : styles.bare,
        { width: size, height: size },
        framed && { borderRadius: corner }
      ]}
      testID={`integration-logo-${id}`}
    >
      <SvgXml xml={scopeLogoIds(integrationLogo(id, scheme), scope)} width={mark} height={mark} />
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  tile: {
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: stroke.hairline,
    borderColor: colors.border.faint,
    backgroundColor: colors.background.surface
  },
  bare: { flexShrink: 0, alignItems: "center", justifyContent: "center" }
}));
