import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion } from "react-native-reanimated";

import { Icon } from "@/components/ui/Icon";
import { outOfReach } from "@/components/ui/reach";
import { useEased, useHeldThroughFade } from "@/features/navigation/motion";
import { control, makeStyles, motion, radius, sans, space, tracked, type, useTheme } from "@/theme";

/** How far it slides as it comes in or leaves, as a column's menu (motion.popover). */
const SLIDE = 4;

/**
 * Over a list scrolled down past its top, the movements arrived meanwhile and kept out of it
 * (arrivals.ts): "2 new transactions", in ink (one filled primary per screen: "Send"), at the top
 * of the list, centred. Pressed, the list scrolls back up, where they fold in, lit. It comes in
 * fading and sliding 4 pt from above, and leaves the same way (motion.popover): fades only with
 * Reduce Motion. Its count stays as it was while it fades out. Read by screen readers as it changes
 * (a live region).
 */
export function ArrivalsPill({
  count,
  onPress,
  top
}: {
  count: number;
  onPress: () => void;
  /** Its distance from the top of what holds the list. */
  top: number;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const shown = count > 0;
  const told = useHeldThroughFade(shown ? count : null, shown, motion.popover);
  const progress = useEased(shown ? 1 : 0, { duration: motion.popover });
  const style = useAnimatedStyle(
    () => ({
      opacity: progress.get(),
      transform: [{ translateY: reduceMotion ? 0 : (progress.get() - 1) * SLIDE }]
    }),
    [reduceMotion]
  );
  if (told === null) return null;
  const label = t("activity.arrivals", { count: told });
  return (
    <View style={[styles.place, { top }]} {...outOfReach(!shown)}>
      <Animated.View style={[styles.lift, style]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityLiveRegion="polite"
          aria-live="polite"
          hitSlop={(control.min - PILL_HEIGHT) / 2}
          disabled={!shown}
          onPress={onPress}
          style={({ pressed }) => [styles.pill, pressed && styles.pressed]}
          testID="activity-arrivals"
        >
          <View
            aria-hidden
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <Icon name="arrow-up" size={12} color={colors.button.ink.label} />
          </View>
          <Text numberOfLines={1} style={styles.label}>
            {label}
          </Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const PILL_HEIGHT = 36;

const useStyles = makeStyles(({ colors, shadow }) => ({
  // Across the list, only the pill taking touches.
  place: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    pointerEvents: "box-none"
  },
  lift: { borderRadius: radius.pill, boxShadow: shadow.held },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[4],
    height: PILL_HEIGHT,
    paddingLeft: space[6] - 2,
    paddingRight: space[6],
    borderRadius: radius.pill,
    backgroundColor: colors.button.ink.bg
  },
  pressed: { backgroundColor: colors.button.ink.bgActive },
  label: {
    ...sans(600),
    fontSize: type.label,
    letterSpacing: tracked.label,
    color: colors.button.ink.label
  }
}));
