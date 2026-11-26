import { useId } from "react";
import { View } from "react-native";
import { SvgXml } from "react-native-svg";

import { Icon } from "@/components/ui/Icon";
import { isIntegrationOptionId } from "@/config/integration-catalog";
import { makeStyles, stroke, useTheme } from "@/theme";

import { integrationLogo, scopeLogoIds } from "./logos";

/**
 * A logo's side in its disc: a logo that fills its square (Ruby's, pretix's) keeps its corners
 * inside the circle, with room around them (seen at 24 to 40 px); 22 px in the 40 px disc of
 * "Integrations", about as in "New integration" (21 px).
 */
const LOGO_SHARE = 0.55;

/**
 * An integration where a person's avatar goes: "Integrations", and who took a sale in "Wallet". The
 * logo of the platform it was created for, in a disc of the surface's colour with a hairline, as
 * IntegrationLogo frames it: a logo keeps its own colours, its brand's version for dark backgrounds
 * in the dark theme. Else (its platform not known where it shows, as for a sale of the owner's copy
 * of a month, which names none; or an option of a newer app's catalogue) its code icon, `</>`, in a
 * sand disc. Decorative, as IntegrationLogo: its name always sits next to it, so screen readers
 * skip it.
 */
export function IntegrationAvatar({ size, platform }: { size: number; platform?: string }) {
  const { colors, scheme } = useTheme();
  // Ids of its own (scopeLogoIds): on the web, every SVG of the page shares one namespace of ids.
  const scope = useId().replace(/[^A-Za-z0-9_-]/g, "");
  const styles = useStyles();
  const logo =
    platform !== undefined && isIntegrationOptionId(platform)
      ? scopeLogoIds(integrationLogo(platform, scheme), scope)
      : null;
  const mark = Math.round(size * LOGO_SHARE);
  return (
    // Its background, border and testID change when the roster's platform arrives, in the sheets of
    // "Wallet" too (a Modal): never flattened, whichever it draws.
    <View
      collapsable={false}
      aria-hidden
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.disc,
        logo ? styles.logo : styles.code,
        { width: size, height: size, borderRadius: size / 2 }
      ]}
      testID={logo ? `integration-avatar-${platform}` : "integration-avatar"}
    >
      {logo ? (
        <SvgXml xml={logo} width={mark} height={mark} />
      ) : (
        <Icon name="code" size={Math.round(size * 0.4)} color={colors.text.primary} />
      )}
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  disc: { alignItems: "center", justifyContent: "center" },
  logo: {
    borderWidth: stroke.hairline,
    borderColor: colors.border.faint,
    backgroundColor: colors.background.surface
  },
  code: { backgroundColor: colors.background.subtle }
}));
