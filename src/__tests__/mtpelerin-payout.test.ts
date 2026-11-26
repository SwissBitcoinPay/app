import { SPLIT_PAYOUT_THRESHOLD_CHF_MINOR } from "@/config/mtpelerin";
import { payoutProgress } from "@/lib/mtpelerin/payout";

/*
 * The deferred sells' way to their one transfer (src/lib/mtpelerin/payout.ts): what Mt Pelerin
 * holds and a sale adds, against the threshold of 50 CHF, in CHF only.
 */

describe("payoutProgress", () => {
  it("tells what is held, the sale, and what is left before the transfer, in centimes", () => {
    expect(payoutProgress(1_230, 50, "CHF")).toEqual({
      thresholdMinor: SPLIT_PAYOUT_THRESHOLD_CHF_MINOR,
      totalMinor: 1_280,
      leftMinor: 3_720,
      heldShare: 1_230 / 5_000,
      saleShare: 50 / 5_000
    });
  });

  it("says nothing is left once the threshold is reached, and never draws past the track", () => {
    const reached = payoutProgress(4_000, 2_500, "CHF");
    expect(reached).toMatchObject({ totalMinor: 6_500, leftMinor: 0, heldShare: 0.8 });
    expect(reached!.heldShare + reached!.saleShare).toBeCloseTo(1);
    expect(payoutProgress(5_000, 0, "CHF")).toMatchObject({ leftMinor: 0 });
    expect(payoutProgress(9_000, 100, "CHF")).toMatchObject({ heldShare: 1, saleShare: 0 });
  });

  it("starts from nothing held", () => {
    expect(payoutProgress(0, 1_664, "CHF")).toMatchObject({ totalMinor: 1_664, leftMinor: 3_336 });
  });

  it("tells no progress in another currency: its threshold is the equivalent of 50 CHF", () => {
    expect(payoutProgress(1_000, 100, "EUR")).toBeNull();
    expect(payoutProgress(0, 0, "GBP")).toBeNull();
  });

  it("refuses amounts that are not whole, non-negative minor units", () => {
    expect(payoutProgress(-1, 100, "CHF")).toBeNull();
    expect(payoutProgress(10.5, 100, "CHF")).toBeNull();
    expect(payoutProgress(100, Number.NaN, "CHF")).toBeNull();
    expect(payoutProgress(Number.MAX_SAFE_INTEGER, 1, "CHF")).toBeNull();
  });
});
