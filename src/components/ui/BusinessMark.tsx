import { View, type StyleProp, type ViewStyle } from "react-native";

import { makeStyles, palette } from "@/theme";

import { Avatar } from "./Avatar";
import { Icon } from "./Icon";

type BusinessMarkProps = {
  /** The business's name, shown beside the mark. */
  name: string;
  /** Its logo (a data URI, src/features/media/images.ts): null without one, or while it is read. */
  image: string | null;
  size: number;
  /** Prefix of the parts' ids: `<testID>-logo` (its image `<testID>-logo-image`), `<testID>-store`. */
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * A business shown by its logo ("Join a team", the login's loading screen): the logo, round; the shop's icon on a sand disc without one, and while it is read. Always
 * beside the business's name, which says the same: hidden from screen readers.
 */
export function BusinessMark({ name, image, size, testID, style }: BusinessMarkProps) {
  const styles = useStyles();
  return (
    <View
      aria-hidden
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={style}
    >
      {image ? (
        <Avatar name={name} image={image} size={size} testID={testID && `${testID}-logo`} />
      ) : (
        <View
          style={[styles.disc, { width: size, height: size, borderRadius: size / 2 }]}
          testID={testID && `${testID}-store`}
        >
          {/* 34 pt in the 88 pt disc of "Join a team". */}
          <Icon name="store" size={Math.round((size * 34) / 88)} color={palette.orange} />
        </View>
      )}
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  disc: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background.subtle
  }
}));
