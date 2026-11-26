import { SPLIT_PAYOUT_THRESHOLD_CHF_MINOR } from "@/config/mtpelerin";

/**
 * The deferred sells' way to their one transfer: what Mt Pelerin already holds for a bank
 * account (`heldMinor`, its balance read now: only `validated` deferred sells are counted) and
 * what a sale adds (`saleMinor`, its order's `dest_amount`), against the threshold of the transfer
 * (SPLIT_PAYOUT_THRESHOLD_CHF_MINOR). Amounts in integer minor units of the account's currency.
 */
export type PayoutProgress = {
  thresholdMinor: number;
  totalMinor: number;
  /** What is still to sell before the transfer: 0 once the threshold is reached. */
  leftMinor: number;
  /** The track's shares, for its drawing only (0 to 1): never an amount. */
  heldShare: number;
  saleShare: number;
};

/**
 * The progress of `heldMinor` and `saleMinor` towards the transfer, in CHF only: in another
 * currency Mt Pelerin's threshold is the equivalent of 50 CHF at a rate it does not say, so
 * no progress is told (null), as for amounts that are not whole, non-negative minor units.
 */
export function payoutProgress(
  heldMinor: number,
  saleMinor: number,
  currency: string
): PayoutProgress | null {
  if (currency !== "CHF") return null;
  if (!isMinor(heldMinor) || !isMinor(saleMinor) || !isMinor(heldMinor + saleMinor)) return null;
  const thresholdMinor = SPLIT_PAYOUT_THRESHOLD_CHF_MINOR;
  const totalMinor = heldMinor + saleMinor;
  const heldShare = Math.min(1, heldMinor / thresholdMinor);
  return {
    thresholdMinor,
    totalMinor,
    leftMinor: Math.max(0, thresholdMinor - totalMinor),
    heldShare,
    saleShare: Math.min(1 - heldShare, saleMinor / thresholdMinor)
  };
}

function isMinor(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}
