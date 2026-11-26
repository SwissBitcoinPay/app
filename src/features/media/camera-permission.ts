import { useCameraPermissions } from "expo-camera";
import { useEffect, useRef } from "react";

import { logFailure } from "@/lib/log/log";
import { withSystemUi } from "@/lib/system-ui";

/** The camera's permission, null until known. */
export type CameraPermission = ReturnType<typeof useCameraPermissions>[0];

/**
 * The camera's permission for a scanner: asked as it shows, then by its button (`ask`). The
 * system's prompt puts the app in the background on Android, which the app's lock must not take
 * for its holder leaving it (src/lib/system-ui.ts): asked here, never by expo-camera's own
 * `request` option.
 */
export function useCameraAsked(): [CameraPermission, () => void] {
  // Neither read nor asked by the hook itself: asked below.
  const [permission, requestPermission] = useCameraPermissions({ get: false });
  const ask = () => {
    withSystemUi(requestPermission).catch((error: unknown) =>
      logFailure("Asking for the camera failed", error)
    );
  };
  // Once as the scanner shows (expo-camera's `request` option did the same).
  const asked = useRef(false);
  useEffect(() => {
    if (asked.current) return;
    asked.current = true;
    ask();
  });
  return [permission, ask];
}
