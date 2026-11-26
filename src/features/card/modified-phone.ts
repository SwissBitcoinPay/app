import { useEffect, useState, useSyncExternalStore } from "react";

import { phoneRiskSignals, type PhoneRiskSignal } from "@/lib/device-integrity";

import { cardPassesKept, subscribeCardPassesKept } from "./card-passes";

/*
 * "This phone is less safe": where this phone keeps passes of cards that pay with the app closed
 * (card-passes.ts), and its system shows signs of a modification (root, hooks:
 * src/lib/device-integrity.ts), the holder is warned that those cards are less protected there: in
 * "Payments without confirmation" of each card whose mode pays without asking (PayeesPanel.tsx), a
 * warning before that row's title and before "Advanced settings", which leads to it (CardRows.tsx).
 * Only a warning: nothing is
 * refused, and a phone that hides its root shows nothing.
 */

/**
 * Whether "Cards" warns that this phone, which keeps passes of `walletId`'s cards, looks modified.
 */
export function useModifiedPhoneWarning(walletId: string | null): boolean {
  const kept = useSyncExternalStore(
    subscribeCardPassesKept,
    () => walletId !== null && cardPassesKept(walletId) === true
  );
  const [signals, setSignals] = useState<PhoneRiskSignal[] | null>(null);
  useEffect(() => {
    if (!kept) return;
    let current = true;
    // Never rejects: a failed read says none.
    void phoneRiskSignals().then((found) => {
      if (current) setSignals(found);
    });
    return () => {
      current = false;
    };
  }, [kept]);
  return kept && signals !== null && signals.length > 0;
}
