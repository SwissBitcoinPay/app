import type { ErrorBoundaryProps } from "expo-router";
import { useTranslation } from "react-i18next";
import { Platform, Text, View } from "react-native";

import { useIsDesktop } from "@/components/layout/useIsDesktop";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { ThemeProvider } from "@/features/appearance/ThemeProvider";
import { makeStyles, sans, space, TITLE_EM, tracking, useTheme } from "@/theme";

/*
 * The web app is split by route (app.config.ts, async routes): a screen's code is fetched when it is
 * first opened. Offline, or after a new deployment (an open page asks for files the new one no longer
 * has), that fetch fails: expo's AsyncRequireError. React keeps the failure of the screen it was for
 * (React.lazy), so only a reload of the page brings it. This is what the root layout shows then (its
 * ErrorBoundary, src/app/_layout.tsx) instead of a blank page; any other error goes on as before
 * (LogRenderErrors: a crash stays a crash), and so does everything on the apps, which are not split.
 */

/** Whether `error` is a screen's code that could not be fetched (expo's AsyncRequireError). */
export function isScreenLoadFailure(error: unknown): boolean {
  return error instanceof Error && error.name === "AsyncRequireError";
}

export function ScreenLoadFailure({ error }: ErrorBoundaryProps) {
  if (Platform.OS !== "web" || !isScreenLoadFailure(error)) throw error;
  // Drawn outside the root layout's ThemeProvider: its own, in this device's "Theme".
  return (
    <ThemeProvider>
      <LoadFailure />
    </ThemeProvider>
  );
}

function LoadFailure() {
  const { colors } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const desktop = useIsDesktop();
  return (
    <View style={styles.cover} testID="screen-load-failure">
      {/* A phone: the button at the bottom, as the app's lock (AppLock.tsx); a computer: under the
          message, at a phone's width. */}
      <View style={[styles.column, desktop && styles.columnDesktop]}>
        <View style={[styles.middle, desktop && styles.middleDesktop]}>
          <View style={styles.badge}>
            <Icon name="circle-exclamation" size={28} color={colors.text.primary} />
          </View>
          <Text accessibilityRole="header" style={styles.title}>
            {t("navigation.loadFailure.title")}
          </Text>
          <Text style={styles.body}>{t("navigation.loadFailure.body")}</Text>
        </View>
        <Button
          icon="arrows-rotate"
          onPress={() => globalThis.location.reload()}
          testID="screen-load-failure-reload"
        >
          {t("navigation.loadFailure.reload")}
        </Button>
      </View>
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  cover: {
    flex: 1,
    padding: space[6],
    alignItems: "center",
    backgroundColor: colors.background.app
  },
  column: { flex: 1, width: "100%", maxWidth: 440, justifyContent: "space-between" },
  columnDesktop: { justifyContent: "center", gap: space[6] },
  middle: { flex: 1, alignItems: "center", justifyContent: "center", gap: space[3] },
  middleDesktop: { flexGrow: 0, flexBasis: "auto" },
  badge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background.surface
  },
  title: {
    ...sans(700),
    fontSize: 22,
    letterSpacing: tracking(TITLE_EM, 22),
    color: colors.text.primary,
    textAlign: "center"
  },
  body: {
    ...sans(500),
    fontSize: 15,
    lineHeight: 22,
    color: colors.text.secondary,
    textAlign: "center"
  }
}));
