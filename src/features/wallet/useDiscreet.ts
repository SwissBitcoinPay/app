import { useEffect, useState } from "react";

import { logFailure } from "@/lib/log/log";

import { loadDiscreet, saveDiscreet } from "./discreet-store";

/**
 * The saves, one after the other: two taps in a row must leave the second choice stored (the
 * native store's writes may otherwise finish in any order).
 */
let saving: Promise<void> = Promise.resolve();

/**
 * "Discreet" of the wallet screen, remembered on this device. Until the stored choice is read, the
 * amounts are masked: one that was masked never shows for a moment. A choice made before the read
 * is kept, and saved. A save that fails keeps the choice for as long as the screen stays mounted.
 */
export function useDiscreetChoice(): { hidden: boolean; toggle: () => void } {
  const [chosen, setChosen] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    void loadDiscreet().then((stored) => {
      if (alive) setChosen((current) => current ?? stored ?? false);
    });
    return () => {
      alive = false;
    };
  }, []);
  const hidden = chosen ?? true;
  const toggle = () => {
    const next = !hidden;
    setChosen(next);
    saving = saving
      .then(() => saveDiscreet(next))
      .catch((error: unknown) => {
        logFailure("Saving the discreet mode failed", error);
      });
  };
  return { hidden, toggle };
}
