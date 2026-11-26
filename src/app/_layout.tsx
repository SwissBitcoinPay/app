import "@/i18n";

import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { LogRenderErrors } from "@/components/LogRenderErrors";
import { AppLock } from "@/features/app-lock/AppLock";
import { ThemeProvider } from "@/features/appearance/ThemeProvider";
import { useThemePreferenceChoice } from "@/features/appearance/theme-preference";
import { showNoNotificationInFront } from "@/features/card/paid-notice";
import { useCardSync } from "@/features/card/sync";
import { followInstallPrompt } from "@/features/install/install-offer";
import { loadDeviceRelays } from "@/features/relays/device-relays";
import { removeRescueTraces } from "@/features/rescue/traces";
import { getAppInfo } from "@/lib/app-info";
import { startAppLog } from "@/lib/log/lifecycle";
import { markObservedFirstRender, startObserve } from "@/lib/observe/observe";
import { useTheme } from "@/theme";
import { useAppFonts } from "@/theme/useAppFonts";

// A screen of the web app whose code could not be fetched: a reload, never a blank page.
export { ScreenLoadFailure as ErrorBoundary } from "@/features/navigation/ScreenLoadFailure";

const appInfo = getAppInfo();
// Expo Observe (src/lib/observe/): first, its handler of uncaught errors under the journal's.
startObserve(appInfo.variant);
// The app's journal (src/lib/log/): its start, its comings and goings, the errors nothing caught.
startAppLog(appInfo);

// No notification shown while the app shows, until the account's screens say which (paid-notice.ts).
showNoNotificationInFront();

// The web: the browser's install prompt, which it offers once soon after the page loads, whichever
// screen shows then; "Install the app" uses it later (src/features/install/).
followInstallPrompt();

// Keep the splash screen until the design system fonts are ready: rendering
// with system fonts first would make every screen jump once they load.
// On the web, only the fonts of the welcome screen are awaited (useAppFonts.web.ts).
void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useAppFonts();
  // The device's relays (src/features/relays/device-relays.ts): nothing reads or publishes on the
  // default list meanwhile. A secure storage read, done before the fonts in practice.
  const relaysLoaded = useDeviceStorageReady();
  // This device's "Theme" (src/features/appearance/): no screen drawn in a theme it then leaves.
  const themeLoaded = useThemePreferenceChoice() !== null;
  const ready = (loaded || error !== null) && relaysLoaded && themeLoaded;

  useEffect(() => {
    if (!ready) return;
    void SplashScreen.hideAsync();
    // The first screen is drawn: the end of Expo Observe's time to first render.
    markObservedFirstRender();
  }, [ready]);

  // On a font loading error, render anyway with the fallback fonts.
  if (!ready) return null;

  return (
    // An error while rendering, noted in the app's journal before the app stops on it.
    <LogRenderErrors>
      {/* Tracks the keyboard for KeyboardAvoidingView from react-native-keyboard-controller,
          Modal windows included: with edge-to-edge, Android no longer resizes them for it. */}
      <KeyboardProvider>
        <SafeAreaProvider>
          {/* Every screen and panel in this device's theme (src/features/appearance/). */}
          <ThemeProvider>
            {/* The app's own lock over every screen and panel, the owner's choice on this device
                (src/features/app-lock/). */}
            <AppLock>
              <Screens />
            </AppLock>
            <ThemedStatusBar />
          </ThemeProvider>
          <CardSync />
        </SafeAreaProvider>
      </KeyboardProvider>
    </LogRenderErrors>
  );
}

/**
 * Whether the device's storage is ready: what a rescue the app could not close left taken back
 * first (src/features/rescue/traces.ts: its relays among it), then the device's relays read. Never
 * stays false: neither step rejects.
 */
function useDeviceStorageReady(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true;
    void removeRescueTraces()
      .then(loadDeviceRelays)
      .then(() => {
        if (alive) setReady(true);
      });
    return () => {
      alive = false;
    };
  }, []);
  return ready;
}

/** Every screen, on the theme's canvas. */
function Screens() {
  const { colors } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background.app }
      }}
    />
  );
}

/** The status bar's content dark over the light theme's canvas, light over the dark theme's. */
function ThemedStatusBar() {
  const { scheme } = useTheme();
  return <StatusBar style={scheme === "dark" ? "light" : "dark"} />;
}

/**
 * The open account's cards kept in step with their relays (src/features/card/sync.ts): mounted
 * once the device's relays are loaded, so that their records are read on the device's list.
 */
function CardSync() {
  useCardSync();
  return null;
}
