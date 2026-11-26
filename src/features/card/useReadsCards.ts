import { useEffect, useState } from "react";
import { Platform } from "react-native";

import { hasNfc } from "@/lib/card/nfc-session";

/*
 * Whether this device reads a card held to it, to program it: the app on a device with NFC, on or
 * off (off, its steps say to turn it on: AddCardSteps.tsx). Neither the web app
 * (nfc-session.web.ts) nor an iPad (Core NFC reads on an iPhone only) nor a phone without NFC:
 * those show what a computer shows where the card must be held (a code the phone scans), said of
 * "this device". A device's NFC does not come and go: asked once.
 */

let asked: Promise<boolean> | null = null;
let known: boolean | null = null;

/** Whether this device reads cards (see above). Never rejects: hasNfc says false on a failure. */
export function readsCards(): Promise<boolean> {
  // The web app reads none, said at once, as useReadsCards says it.
  if (Platform.OS === "web") return Promise.resolve(false);
  asked ??= hasNfc().then((present) => {
    known = present;
    return present;
  });
  return asked;
}

/** readsCards, null while not known: at once on the web app, which reads none. */
export function useReadsCards(): boolean | null {
  const [reads, setReads] = useState(() => (Platform.OS === "web" ? false : known));
  useEffect(() => {
    if (reads !== null) return;
    let live = true;
    void readsCards().then((present) => {
      if (live) setReads(present);
    });
    return () => {
      live = false;
    };
  }, [reads]);
  return reads;
}

/** Forgets what was asked (tests: each its own device). */
export function resetReadsCards(): void {
  asked = null;
  known = null;
}
