import { useEffect, useState } from "react";

import { sendableSats } from "@/lib/lightning/lnurl";
import { logFailure } from "@/lib/log/log";

import { payRequestOf } from "./invoice";

/**
 * The most a sale's invoice may ask from `lightningAddress`, in whole sats (its `maxSendable`,
 * sendableSats): above it, a sale is paid on-chain only
 * (useSale.ts). Read from the address, never a fixed ceiling, through the
 * parameters the point of sale reads once per session (payRequestOf): no request when a sale read
 * them already, and none at the next showing. Undefined while read, null when they could not be
 * read (read again at the next showing) or without an address.
 */
export function useLightningMax(lightningAddress: string | null): bigint | null | undefined {
  const [held, setHeld] = useState<{ address: string; max: bigint | null } | null>(null);
  useEffect(() => {
    if (lightningAddress === null) return;
    let alive = true;
    payRequestOf(lightningAddress).then(
      (pay) => {
        if (alive) setHeld({ address: lightningAddress, max: sendableSats(pay).max });
      },
      (error: unknown) => {
        logFailure("Reading the Lightning address's bounds failed", error);
        if (alive) setHeld({ address: lightningAddress, max: null });
      }
    );
    return () => {
      alive = false;
    };
  }, [lightningAddress]);
  if (lightningAddress === null) return null;
  return held?.address === lightningAddress ? held.max : undefined;
}
