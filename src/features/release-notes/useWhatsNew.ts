import { useState } from "react";

import { getAppInfo } from "@/lib/app-info";

import { shownReleases } from "./releases";
import { markReleaseNotesSeen, useSeenReleaseNotes } from "./seen";

/**
 * "What's new" from a version's label: whether the latest notes this app shows were never opened
 * on this device (its dot), and the window. Unknown until the store is read: no dot meanwhile.
 * Opening the window marks those notes as read; the window keeps showing them as new
 * (`fresh`) until it closes.
 */
export function useWhatsNew(): {
  unread: boolean;
  visible: boolean;
  /** The notes shown as new in the window, opened while unread. */
  fresh: string | null;
  open: () => void;
  close: () => void;
} {
  const [latest] = useState(() => shownReleases(getAppInfo())[0]?.key ?? null);
  const seen = useSeenReleaseNotes();
  const unread = latest !== null && seen !== undefined && seen !== latest;
  const [visible, setVisible] = useState(false);
  const [fresh, setFresh] = useState<string | null>(null);
  return {
    unread,
    visible,
    fresh,
    open: () => {
      setFresh(unread ? latest : null);
      setVisible(true);
      if (latest !== null) markReleaseNotesSeen(latest);
    },
    close: () => setVisible(false)
  };
}
