import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";

import { makeStyles, palette, radius, sans, type } from "@/theme";

import { SBP_LOGO_CROSS, SBP_LOGO_TILE, SBP_LOGO_TILE_FILL } from "./swiss-bitcoin-pay-logo";

/** The tile of the Swiss Bitcoin Pay logo, cut out of its file's box (swiss-bitcoin-pay-logo.ts). */
const TILE_VIEW_BOX = "0 43 244 244";
const TILE_SIZE = 16;

/**
 * "Swiss Bitcoin Pay becomes sattle.me" under the logo of the migration's first screen: the v2
 * brand's tile, red with its white cross, so that its merchant recognises where they come from. A
 * pill ringed in ink, on the cream.
 */
export function MigrationBadge() {
  const styles = useStyles();
  const { t } = useTranslation();
  return (
    <View style={styles.badge} testID="migration-badge">
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Svg width={TILE_SIZE} height={TILE_SIZE} viewBox={TILE_VIEW_BOX}>
          <Path fill={SBP_LOGO_TILE_FILL} d={SBP_LOGO_TILE} />
          <Path fill={palette.white} d={SBP_LOGO_CROSS} />
        </Svg>
      </View>
      <Text style={styles.label}>{t("migration.home.badge")}</Text>
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  badge: {
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 6,
    paddingLeft: 8,
    paddingRight: 12,
    borderRadius: radius.pill,
    boxShadow: `inset 0 0 0 1px ${colors.border.subtle}`
  },
  label: { ...sans(600), fontSize: type.caption, color: colors.text.secondary }
}));
