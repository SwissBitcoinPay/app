import { useIsFocused } from "expo-router";
import { useEffect, useRef } from "react";

import type { Article } from "@/lib/catalog/article";
import { secureRandomBytes } from "@/lib/random";
import { currentRelays } from "@/lib/relays/current";
import { fiatToSats } from "@/lib/terminal/amount";
import { basketTotal, unitPrice, type BasketTotal } from "@/lib/terminal/basket";

import { usePos } from "./pos";

/**
 * The basket's sale ("Items", the scan and the basket): its total at the
 * rates shown, and `charge`, which fixes the sale as "Charge" of the keypad does: the total at
 * the points of this instant (an article in another currency converted at the same hour's), its
 * sats rounded up, the note, a key of its own. `charge` returns false when no amount can be fixed
 * now (no rate, an empty basket, the screen not shown, a sale already being fixed by this screen).
 */
export function useBasketSale() {
  const pos = usePos();
  const { profile, digits, rate, basket, catalog, rateOf, currentRateOf, note, setSale } = pos;
  const to = { currency: profile.currency, digits };
  const total: BasketTotal = basketTotal(basket, catalog.articles, to, rateOf);
  const sats =
    total.status === "ok" && total.minor > 0 && rate.rate !== undefined
      ? fiatToSats(total.minor, digits, rate.rate)
      : null;
  const canCharge = sats !== null && sats > 0n;
  const focused = useIsFocused();
  // A ref: a double tap must not fix a second sale before the navigation renders again.
  const charging = useRef(false);
  useEffect(() => {
    if (focused) charging.current = false;
  }, [focused]);

  const charge = (): boolean => {
    if (!canCharge || !focused || charging.current) return false;
    // Never fixed with another hour's point (requireFreshRate): the shown one may have ended since.
    const fixed = basketTotal(basket, catalog.articles, to, currentRateOf);
    const current = currentRateOf(profile.currency);
    if (fixed.status !== "ok" || fixed.minor <= 0 || current === undefined) return false;
    const fixedSats = fiatToSats(fixed.minor, digits, current);
    if (fixedSats <= 0n) return false;
    charging.current = true;
    setSale({
      minor: fixed.minor,
      sats: fixedSats,
      note,
      tappedAt: Date.now(),
      key: secureRandomBytes(32),
      relays: currentRelays(),
      basket
    });
    return true;
  };

  /** One unit of `article` in the point of sale's currency, at the rates shown. */
  const priceOf = (article: Article): number | undefined => unitPrice(article, to, rateOf);

  return { total, sats, canCharge, charge, priceOf };
}
