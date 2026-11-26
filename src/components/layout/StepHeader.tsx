import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { IconButton } from "@/components/ui/IconButton";
import { ProgressDots, type ProgressDotsProps } from "@/components/ui/ProgressDots";
import { gutter, makeStyles } from "@/theme";

import { Logo } from "./Logo";
import { STEP_CONTENT_WIDTH } from "./StepScreen";
import { useIsDesktop } from "./useIsDesktop";

type StepHeaderProps = {
  /** Dots of the current path. */
  steps: ProgressDotsProps;
  onBack: () => void;
  /** Greyed while the screen waits for a service (a check). */
  backDisabled?: boolean;
};

/**
 * Header of the steps after the welcome screen. Their layout draws it once above its stack, so
 * that it stays in place while the steps change under it, and its dots animate from one step to
 * the next.
 * Mobile: 64 px (back, dots, 32 px spacer). Desktop: 84 px, logo in the corner; back button and
 * dots in a band as wide as the content column (STEP_CONTENT_WIDTH). Both start under the status
 * bar: tablets wide enough for the desktop layout have one too (the welcome screen's desktop
 * header does the same, so that the logo stays in place).
 */
export function StepHeader({ steps, onBack, backDisabled = false }: StepHeaderProps) {
  const { t } = useTranslation();
  const styles = useStyles();
  const desktop = useIsDesktop();
  const insets = useSafeAreaInsets();
  const back = (
    <IconButton
      icon="arrow-left"
      label={t("common.back")}
      overhang="left"
      onPress={onBack}
      disabled={backDisabled}
    />
  );
  const dots = <ProgressDots {...steps} />;

  return (
    <View style={{ paddingTop: insets.top }}>
      {desktop ? (
        <View style={styles.desktopHeader}>
          <View style={styles.desktopSide}>
            <Logo width={168} />
          </View>
          <View style={styles.desktopBand}>
            <View style={styles.desktopBack}>{back}</View>
            {dots}
          </View>
          <View style={styles.desktopSide} />
        </View>
      ) : (
        <View style={styles.mobileHeader}>
          {back}
          {dots}
          <View style={styles.spacer} />
        </View>
      )}
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  mobileHeader: {
    height: 64,
    paddingTop: 10,
    paddingHorizontal: gutter,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.background.app
  },
  spacer: { width: 32 },
  desktopHeader: {
    height: 84,
    paddingHorizontal: 40,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.background.app
  },
  desktopSide: { flex: 1 },
  desktopBand: {
    position: "relative",
    width: STEP_CONTENT_WIDTH,
    alignItems: "center",
    justifyContent: "center",
    height: 44
  },
  desktopBack: { position: "absolute", left: 0, top: 0 }
}));
