import { useCallback, useEffect, useRef, useState } from "react";

import type { LegacySession } from "@/lib/legacy-v2/server";

import { freezeLegacyAccount, type LegacyFreeze } from "./freeze";
import { startMigratedHistory } from "./history-import";
import { takeLegacySession } from "./legacy-session";

/**
 * The v2 account's freeze on "Your account is up to date" (freeze.ts), then the copy of its history
 * (history-import.ts) with the same session, which the copy closes. Asked once, as the screen
 * opens. A freeze that may be tried again keeps the session for "Try again"; leaving the screen
 * (`release`, or the screen gone) hands it to the copy of the history all the same: the history is
 * never left behind for the freeze.
 *
 * `historyCopy`: `waiting` while the session is not handed on (the freeze runs, or keeps it for
 * "Try again"), `running` from the moment it is until the copy of the history ended
 * (startMigratedHistory settled), then `ended`: the screen never sees a gap between the freeze's
 * end and the copy's start (the copy's own status says "running" only once it read the device's
 * notes). Ended without a copy's status: there was no session to copy with ("Settings" offers it).
 */
export type HistoryCopy = "waiting" | "running" | "ended";

export function useLegacyFreeze(): {
  freeze: LegacyFreeze;
  historyCopy: HistoryCopy;
  retry: () => void;
  release: () => void;
} {
  const [freeze, setFreeze] = useState<LegacyFreeze>({ phase: "running" });
  const [historyCopy, setHistoryCopy] = useState<HistoryCopy>("waiting");
  // The session between two attempts: undefined before the first, null once handed on.
  const session = useRef<LegacySession | null | undefined>(undefined);
  const running = useRef(false);
  // Whether the screen still shows (set again by a remount: React's StrictMode remounts at once).
  const shown = useRef(false);

  const handOn = useCallback(() => {
    if (session.current === null) return;
    const held = session.current ?? takeLegacySession();
    session.current = null;
    setHistoryCopy("running");
    // Never rejects (history-import.ts).
    void startMigratedHistory(held).finally(() => setHistoryCopy("ended"));
  }, []);

  const attempt = useCallback(async () => {
    if (running.current || session.current === null) return;
    running.current = true;
    setFreeze({ phase: "running" });
    try {
      const outcome = await freezeLegacyAccount(session.current ?? takeLegacySession());
      session.current = outcome.session;
      setFreeze(outcome.freeze);
      const again = outcome.freeze.phase === "failed" && outcome.freeze.retry && outcome.session;
      if (!again || !shown.current) handOn();
    } finally {
      running.current = false;
    }
  }, [handOn]);

  const started = useRef(false);
  useEffect(() => {
    shown.current = true;
    if (!started.current) {
      started.current = true;
      void attempt();
    }
    return () => {
      shown.current = false;
      // While an attempt runs, its end hands the session on.
      if (!running.current) handOn();
    };
  }, [attempt, handOn]);

  const release = useCallback(() => {
    shown.current = false;
    if (!running.current) handOn();
  }, [handOn]);

  return { freeze, historyCopy, retry: () => void attempt(), release };
}
