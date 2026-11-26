import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { useEffect, useMemo, useRef, useState } from "react";

import { logFailure } from "@/lib/log/log";
import { readSaleAcceptances, type SaleAcceptance } from "@/lib/registry/sale-acceptance";
import { deriveSaleKeys } from "@/lib/registry/registry";

/** How often a sale shown "Underpaid" looks for its owner's acceptance. */
export const SALE_ACCEPTANCE_POLL_MS = 15_000;

/** A sale whose acceptance is looked for: its own key, its business's link owner key, its relays. */
export type AcceptanceWatch = {
  saleKey: Uint8Array;
  /** Hex: the business's link owner key (its registry's `owner`). */
  owner: string;
  relays: readonly string[];
};

/**
 * The owner's acceptance of `sale` (src/lib/registry/sale-acceptance.ts), looked for every
 * SALE_ACCEPTANCE_POLL_MS while `active` (the sale shows "Underpaid"
 * on the point of sale or on its payer's page): null until one is read. Once read it stays (an
 * acceptance is final); whether it covers what the sale received now is its caller's to tell.
 */
export function useSaleAcceptance(
  sale: AcceptanceWatch | null,
  active: boolean
): SaleAcceptance | null {
  const [found, setFound] = useState<{ sale: string; acceptance: SaleAcceptance } | null>(null);
  // Its registry identity, derived once per sale (the screens showing it render every second).
  const keyHex = sale ? bytesToHex(sale.saleKey) : null;
  const author = useMemo(
    () => (keyHex === null ? null : deriveSaleKeys(hexToBytes(keyHex)).nostr.publicKey),
    [keyHex]
  );
  const watched = active && sale !== null && found?.sale !== author;
  // The sale by its identity and relays, not by the object passed at each render.
  const relaysKey = sale ? `${sale.owner}|${sale.relays.join(",")}` : "";
  const latest = useRef(sale);
  useEffect(() => {
    latest.current = sale;
  });
  useEffect(() => {
    if (!watched || author === null) return;
    let alive = true;
    let reading = false;
    const read = () => {
      const watchedSale = latest.current;
      if (reading || !watchedSale) return;
      reading = true;
      readSaleAcceptances(
        [{ saleKey: watchedSale.saleKey, relays: watchedSale.relays }],
        watchedSale.owner
      )
        .then(
          (reads) => {
            const read = reads.get(author);
            if (alive && read?.kind === "accepted") {
              setFound({ sale: author, acceptance: read.acceptance });
            }
          },
          (error: unknown) => logFailure("Reading a sale's acceptance failed", error)
        )
        .finally(() => {
          reading = false;
        });
    };
    read();
    const timer = setInterval(read, SALE_ACCEPTANCE_POLL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [watched, author, relaysKey]);
  return found && found.sale === author ? found.acceptance : null;
}
