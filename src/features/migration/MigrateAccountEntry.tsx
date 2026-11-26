import { useTranslation } from "react-i18next";
import { View } from "react-native";
import Svg, { Path } from "react-native-svg";

import { Button } from "@/components/ui/Button";
import { palette } from "@/theme";

import {
  SBP_LOGO_CROSS,
  SBP_LOGO_HEIGHT,
  SBP_LOGO_TILE,
  SBP_LOGO_TILE_FILL,
  SBP_LOGO_WIDTH,
  SBP_LOGO_WORDMARK
} from "./swiss-bitcoin-pay-logo";

/** The logo's height in the label: its wordmark's capitals the size of the label's. */
const LOGO_HEIGHT = 20;
const LOGO_WIDTH = Math.round((LOGO_HEIGHT * SBP_LOGO_WIDTH) / SBP_LOGO_HEIGHT);

/**
 * "Migrate from [Swiss Bitcoin Pay]" on the welcome screen: a v2 owner whose device holds nothing
 * of the v2 app (another phone, the web app, the v2 app logged out) reaches the migration
 * (src/app/migration/, `manual`). An ink button, its icon on the left, the v2 brand's logo in its
 * sentence (swiss-bitcoin-pay-logo.ts), so that its owner finds it. The wordmark takes the label's
 * colour (disabled too); the tile keeps its red and its white cross. A short sentence before it:
 * "Migrate my account" and the wordmark do not fit a 360 px wide phone (measured on the web), the
 * label cut. Screen readers say the whole sentence ("Migrate my Swiss Bitcoin Pay account").
 */
export function MigrateAccountEntry({
  onPress,
  disabled,
  fullWidth,
  style
}: {
  onPress: () => void;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: Parameters<typeof Button>[0]["style"];
}) {
  const { t } = useTranslation();
  return (
    <Button
      variant="ink"
      size="sm"
      icon="arrow-right-arrow-left"
      fullWidth={fullWidth}
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={t("migration.entry")}
      accessory={(color) => (
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Svg
            width={LOGO_WIDTH}
            height={LOGO_HEIGHT}
            viewBox={`0 0 ${SBP_LOGO_WIDTH} ${SBP_LOGO_HEIGHT}`}
          >
            <Path fill={SBP_LOGO_TILE_FILL} d={SBP_LOGO_TILE} />
            <Path fill={palette.white} d={SBP_LOGO_CROSS} />
            <Path fill={color} d={SBP_LOGO_WORDMARK} />
          </Svg>
        </View>
      )}
      style={style}
      testID="migrate-account"
    >
      {t("migration.entryLead")}
    </Button>
  );
}
