import { useEffect, useRef, useState } from "react";

import type { WalletPayment } from "@/lib/breez/types";

import type { WalletData } from "./useWalletData";
import { recordWalletSends } from "./wallet-sends";

/** A round that left a sending unpublished is tried again this much later. */
export const WALLET_SENDS_RETRY_MS = 60_000;

/**
 * "Wallet" publishes each payment the wallet sent (wallet-sends.ts: as soon as the app makes it),
 * as it records the payments' rates (usePaymentRates):
 * once its list is read after the wallet's sync (`data` null before), again at each payment done
 * since, and WALLET_SENDS_RETRY_MS after a round that left one. Not at each read of the wallet
 * (every 15 s): only when what it lists done changes.
 */
export function useWalletSends(data: WalletData | null): void {
  const payments = data ? [...data.payments, ...data.lastDays] : null;
  const done = payments?.filter(({ status }) => status === "completed") ?? null;
  // What changes when a payment is done: how many, and the newest.
  const newest = done?.reduce<WalletPayment | null>(
    (found, payment) => (!found || payment.timestamp > found.timestamp ? payment : found),
    null
  );
  const key = done === null ? null : `${done.length}:${newest?.id ?? ""}`;
  // The payments of the last read, given to the round when it starts.
  const shown = useRef<readonly WalletPayment[]>([]);
  useEffect(() => {
    shown.current = payments ?? [];
  });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (key === null) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    void recordWalletSends(shown.current).then((outcome) => {
      if (alive && outcome === "left") {
        timer = setTimeout(() => setRetry((n) => n + 1), WALLET_SENDS_RETRY_MS);
      }
    });
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [key, retry]);
}
