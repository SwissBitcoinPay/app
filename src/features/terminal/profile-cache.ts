import { useEffect, useState } from "react";

import type { TerminalProfile } from "@/lib/terminal/model";
import { loadTerminalProfile } from "@/lib/terminal/profile";

/**
 * The point of sale's profile of this device, in memory once read: the launch reads it to decide
 * between the welcome screen and the point of sale, the point of sale reads it to take payments.
 */
let cached: TerminalProfile | null | undefined;
let loading: Promise<TerminalProfile | null> | null = null;
const listeners = new Set<(profile: TerminalProfile | null) => void>();

/** Makes `profile` the current one (just saved by activateTerminal). */
export function publishTerminalProfile(profile: TerminalProfile | null): void {
  cached = profile;
  for (const listener of listeners) listener(profile);
}

/** The stored profile (read once, then from memory). */
export function getTerminalProfile(): Promise<TerminalProfile | null> {
  if (cached !== undefined) return Promise.resolve(cached);
  loading ??= loadTerminalProfile().then((profile) => {
    // A profile saved while the device's copy was read wins over it.
    if (cached === undefined) publishTerminalProfile(profile);
    loading = null;
    return cached ?? null;
  });
  return loading;
}

/**
 * The profile, `undefined` while it is being read. `follow: false` reads it once: the launch
 * screen decides where to go at launch only, a profile saved later (login, end of the sign-up) is
 * followed by the screen that saved it, which navigates itself.
 */
export function useTerminalProfile({ follow = true }: { follow?: boolean } = {}):
  TerminalProfile | null | undefined {
  const [profile, setProfile] = useState(cached);
  useEffect(() => {
    let alive = true;
    const update = (next: TerminalProfile | null) => {
      if (alive) setProfile(next);
    };
    if (follow) listeners.add(update);
    void getTerminalProfile().then(update);
    return () => {
      alive = false;
      listeners.delete(update);
    };
  }, [follow]);
  return profile;
}

/** Tests only: forgets what was read. */
export function resetTerminalProfileCache(): void {
  cached = undefined;
  loading = null;
}
