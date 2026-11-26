import { useEffect } from "react";
import { AppState } from "react-native";

import { IOS_EXTENSION_PAYS_CARDS } from "@/config/card";
import { APP_FRONT_REFRESH_MS, clearAppInFront, markAppInFront } from "@/lib/card/app-front";
import { logFailure } from "@/lib/log/log";

/*
 * Keeps the marker of the app in front (src/lib/card/app-front.ts) while the app is active and
 * takes its cards' wakes (useCardWakes.ts, mounted with it): the iOS notification service extension
 * then leaves a wake to it. Only while the extension pays cards (IOS_EXTENSION_PAYS_CARDS); a no-op
 * where there is no app group (Android, a build without the extension).
 */

function attempt(run: () => void): void {
  try {
    run();
  } catch (error) {
    // The extension then takes the wake itself: the relay gives its session to one taker only.
    logFailure("Writing the app's in-front marker failed", error);
  }
}

export function useAppFrontMarker(): void {
  useEffect(() => {
    if (!IOS_EXTENSION_PAYS_CARDS) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
      attempt(clearAppInFront);
    };
    const start = () => {
      attempt(() => markAppInFront(Date.now()));
      timer ??= setInterval(() => attempt(() => markAppInFront(Date.now())), APP_FRONT_REFRESH_MS);
    };
    if (AppState.currentState === "active") start();
    const appState = AppState.addEventListener("change", (state) => {
      if (state === "active") start();
      else stop();
    });
    return () => {
      appState.remove();
      stop();
    };
  }, []);
}
