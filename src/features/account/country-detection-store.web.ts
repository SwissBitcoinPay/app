import { logFailure } from "@/lib/log/log";

import {
  COUNTRY_DETECTION_KEY,
  parseCountryDetection,
  serializeCountryDetection
} from "./country-detection-format";

/** Same API as country-detection-store.ts, in this browser's `localStorage`. */

export async function readCountryDetection(): Promise<boolean | null> {
  try {
    return parseCountryDetection(localStorage.getItem(COUNTRY_DETECTION_KEY));
  } catch (error) {
    logFailure("Reading the country detection's choice failed", error);
    return null;
  }
}

export async function writeCountryDetection(detect: boolean): Promise<void> {
  localStorage.setItem(COUNTRY_DETECTION_KEY, serializeCountryDetection(detect));
}
