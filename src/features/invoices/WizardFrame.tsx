import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useIsDesktop } from "@/components/layout/useIsDesktop";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { ProgressDots } from "@/components/ui/ProgressDots";
import {
  gutter,
  makeStyles,
  palette,
  sans,
  space,
  stroke,
  tracked,
  type,
  useTheme,
  type ThemeColors
} from "@/theme";

/** The wizard's five steps. */
export const WIZARD_STEPS = 5;

/**
 * Desktop: the width of every step's content, "Continue" included. The same from one step to the
 * next (widths from 984 to 620 would make the screen jump);
 * the first step's form and PDF preview fit it side by side (RecipientStep).
 */
export const WIZARD_DESKTOP_WIDTH = 880;

type WizardFrameProps = {
  step: number;
  onBack: () => void;
  /** "Save as draft"; null hides it. */
  onSaveDraft: (() => void) | null;
  /** The draft being saved: the action waits (its loader on desktop), the back button too. */
  saving: boolean;
  /** Nothing can be pressed (an invoice being sent). */
  busy: boolean;
  /** The screen's action, pinned to the bottom on mobile, under the content on desktop. */
  footer: ReactNode;
  children: ReactNode;
  testID?: string;
};

/**
 * The frame of the wizard. Mobile: a 64 px header, the back arrow in orange on the left, the dots
 * centred, "Save as draft" as a floppy disk in umber on the right; the content in the 22 px gutter,
 * the action pinned to the bottom; no dock (the dock hides over the wizard,
 * src/features/navigation/destinations.ts). Desktop: the side bar stays; a header in three parts
 * (the back arrow and "New invoice", the dots, "Save as draft" on a white fill) over a hairline,
 * the content centred on the cream at one width for every step, no card around it.
 */
export function WizardFrame({
  step,
  onBack,
  onSaveDraft,
  saving,
  busy,
  footer,
  children,
  testID
}: WizardFrameProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const desktop = useIsDesktop();
  const insets = useSafeAreaInsets();
  const dots = <ProgressDots count={WIZARD_STEPS} current={step} />;
  const back = (
    <IconButton
      icon="arrow-left"
      label={t("invoices.back")}
      color={palette.orange}
      overhang={desktop ? undefined : "left"}
      onPress={onBack}
      disabled={saving || busy}
      testID="invoice-back"
    />
  );

  if (desktop) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]} testID={testID}>
        <View style={styles.desktopHeader}>
          <View style={styles.desktopStart}>
            {back}
            <Text accessibilityRole="header" style={styles.desktopTitle}>
              {t("invoices.title")}
            </Text>
          </View>
          {dots}
          <View style={styles.desktopEnd}>
            {onSaveDraft ? (
              <Button
                variant="secondary"
                size="sm"
                icon="floppy-disk"
                fullWidth={false}
                loading={saving}
                disabled={busy}
                onPress={onSaveDraft}
                testID="invoice-save-draft"
              >
                {t("invoices.saveDraft")}
              </Button>
            ) : null}
          </View>
        </View>
        <KeyboardAwareScrollView
          contentContainerStyle={[
            styles.desktopBody,
            { paddingBottom: Math.max(insets.bottom, 40) }
          ]}
          keyboardShouldPersistTaps="handled"
          bottomOffset={gutter}
        >
          <View style={styles.desktopColumn}>
            {children}
            <View style={styles.push} />
            <View style={styles.desktopFooter}>{footer}</View>
          </View>
        </KeyboardAwareScrollView>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]} testID={testID}>
      <View style={styles.mobileHeader}>
        {back}
        {dots}
        {onSaveDraft ? (
          <IconButton
            icon="floppy-disk"
            label={t("invoices.saveDraft")}
            color={colors.button.text.label}
            overhang="right"
            onPress={onSaveDraft}
            disabled={saving || busy}
            testID="invoice-save-draft"
          />
        ) : (
          <View style={styles.spacer} />
        )}
      </View>
      <KeyboardAwareScrollView
        contentContainerStyle={styles.mobileBody}
        keyboardShouldPersistTaps="handled"
        bottomOffset={gutter}
      >
        {children}
        <View style={styles.push} />
        <View style={styles.mobileFooter}>{footer}</View>
      </KeyboardAwareScrollView>
    </View>
  );
}

/** A step's title: 24 px on mobile, 30 px on desktop. */
export function StepTitle({ children }: { children: ReactNode }) {
  const styles = useStyles();
  const desktop = useIsDesktop();
  return (
    <Text accessibilityRole="header" style={desktop ? styles.titleDesktop : styles.titleMobile}>
      {children}
    </Text>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  screen: { flex: 1, backgroundColor: colors.background.app },
  mobileHeader: {
    height: 64,
    paddingHorizontal: gutter,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  spacer: { width: 32 },
  // The bottom safe area is the shell's, below the screen once the dock left (ShellMain): the action
  // keeps only its margin above it.
  mobileBody: { flexGrow: 1, paddingHorizontal: gutter, paddingBottom: space[5] },
  mobileFooter: { paddingTop: 12 },
  push: { flexGrow: 1 },
  desktopHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 26,
    paddingHorizontal: 38,
    borderBottomWidth: stroke.hairline,
    borderBottomColor: colors.border.subtle
  },
  desktopStart: { flex: 1, flexDirection: "row", alignItems: "center", gap: 14 },
  desktopTitle: {
    ...sans(700),
    fontSize: type.title,
    letterSpacing: tracked.title,
    color: colors.text.primary
  },
  desktopEnd: { flex: 1, flexDirection: "row", justifyContent: "flex-end" },
  desktopBody: { flexGrow: 1, alignItems: "center", paddingTop: 40, paddingHorizontal: 38 },
  desktopColumn: { width: WIZARD_DESKTOP_WIDTH, maxWidth: "100%", flexGrow: 1 },
  desktopFooter: { paddingTop: 30 },
  titleMobile: { ...titleStylesBase(colors, 24, 1.15), marginTop: 6 },
  titleDesktop: titleStylesBase(colors, 30, 1.1)
}));

function titleStylesBase(colors: ThemeColors, size: number, leading: number) {
  return {
    ...sans(700),
    fontSize: size,
    lineHeight: size * leading,
    color: colors.text.primary
  };
}
