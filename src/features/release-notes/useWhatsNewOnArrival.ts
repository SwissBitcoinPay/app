import { useEffect, useState } from "react";

import { getAppInfo } from "@/lib/app-info";

import { shownReleases } from "./releases";
import { markReleaseNotesSeen, useSeenReleaseNotes } from "./seen";

/**
 * The version whose app opens "What's new" by itself: its first, with the new app's notes. Any
 * other version only marks its label with a dot (useWhatsNew.ts).
 */
export const OPENS_ON_ARRIVAL = "3.0.0";

/**
 * "What's new" opened by itself on a merchant's device's arrival at the point of sale (`arrived`:
 * the owner's shell tells it), in the app of version OPENS_ON_ARRIVAL only, and only while its
 * latest notes were never opened on this device: once shown, by itself or from the version's
 * label, never by itself again, a "Log out" included (seen.ts, device-wipe.ts): once per device. `holding`: another panel waits while
 * it is about to open or open (NotificationsOffer), so that two never show at once; for as long as
 * the notes opened are not known yet too.
 */
export function useWhatsNewOnArrival(arrived: boolean): {
  visible: boolean;
  fresh: string | null;
  close: () => void;
  holding: boolean;
} {
  const [latest] = useState(() => {
    const info = getAppInfo();
    return info.version === OPENS_ON_ARRIVAL ? (shownReleases(info)[0]?.key ?? null) : null;
  });
  const seen = useSeenReleaseNotes();
  const due = latest !== null && seen !== undefined && seen !== latest;
  // The notes it opened by itself (adjusted while rendering), and whether they were closed.
  const [opened, setOpened] = useState<string | null>(null);
  const [closed, setClosed] = useState(false);
  if (arrived && due && opened === null) setOpened(latest);
  const visible = opened !== null && !closed;

  // Opened: its dot goes from every label, and it never opens by itself again.
  useEffect(() => {
    if (opened !== null) markReleaseNotesSeen(opened);
  }, [opened]);

  return {
    visible,
    fresh: opened,
    close: () => setClosed(true),
    holding: latest !== null && (seen === undefined || visible || (due && arrived))
  };
}
