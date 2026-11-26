import { CameraView } from "expo-camera";
import { useEffect, useState } from "react";

import { logFailure } from "@/lib/log/log";

/** The last answer of the browser, shared by every screen asking (one enumeration at a time). */
let known: boolean | null = null;
let asking: Promise<boolean> | null = null;

function askBrowser(): Promise<boolean> {
  asking ??= CameraView.isAvailableAsync()
    .catch((error: unknown) => {
      logFailure("Listing the browser's cameras failed", error);
      return false;
    })
    .then((available) => {
      known = available;
      asking = null;
      return available;
    });
  return asking;
}

/**
 * The web app: the scan where the browser has a camera, a phone's or a computer's webcam, as it
 * lists its video inputs (expo-camera's `isAvailableAsync`, which asks no permission). False until
 * the browser answered, and when it cannot tell. Asked again when a camera is plugged in or out
 * (`devicechange`).
 */
export function useCanScanBarcodes(): boolean {
  const [available, setAvailable] = useState(known ?? false);
  useEffect(() => {
    let alive = true;
    const ask = () => {
      void askBrowser().then((answer) => {
        if (alive) setAvailable(answer);
      });
    };
    ask();
    const devices = typeof navigator === "undefined" ? undefined : navigator.mediaDevices;
    devices?.addEventListener?.("devicechange", ask);
    return () => {
      alive = false;
      devices?.removeEventListener?.("devicechange", ask);
    };
  }, []);
  return available;
}
