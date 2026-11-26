import "@/i18n";

import { render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";

import { SELL_TRANSFER_FEE, SPLIT_PAYOUT_THRESHOLD_CHF_MINOR } from "@/config/mtpelerin";
import {
  BITCOIN_FEE_FREE_UNTIL,
  SplitFees,
  bitcoinFeeFreeUntilText,
  bitcoinFeeWaived
} from "@/features/onboarding/SplitFees";

/*
 * The fees card of "Split": sattle.me's fee on everything taken in, converted or not, struck
 * through with 0 % after it until the 31 December 2026 is over in Switzerland, then shown as it is;
 * then the conversion's, Mt Pelerin's own range with its "+", on the share converted only.
 */

afterEach(() => {
  jest.restoreAllMocks();
});

describe('the fees of "Split"', () => {
  it("waives the bitcoin fee until the 31 December 2026 is over in Switzerland", () => {
    // 1 January 2027, 0:00 in Zurich (UTC+1 in winter).
    expect(BITCOIN_FEE_FREE_UNTIL).toBe(Date.UTC(2026, 11, 31, 23));
    expect(bitcoinFeeWaived(Date.UTC(2026, 10, 15))).toBe(true);
    expect(bitcoinFeeWaived(Date.UTC(2026, 11, 31, 22, 59, 59))).toBe(true);
    expect(bitcoinFeeWaived(Date.UTC(2026, 11, 31, 23))).toBe(false);
    expect(bitcoinFeeWaived(Date.UTC(2027, 5, 1))).toBe(false);
    // Its last day, in the device's locale.
    expect(bitcoinFeeFreeUntilText("en-CH")).toBe("31 December 2026");
    expect(bitcoinFeeFreeUntilText("en-US")).toBe("December 31, 2026");
    expect(bitcoinFeeFreeUntilText("de-CH")).toBe("31. Dezember 2026");
  });

  it("says sattle.me's fee is on everything, struck through to 0 % while waived, then Mt Pelerin's on top", async () => {
    jest.spyOn(Date, "now").mockReturnValue(Date.UTC(2026, 10, 15));
    await render(<SplitFees payoutCurrency="CHF" hasFiat languageTag="en-CH" />);

    expect(screen.getByTestId("sattle-fee")).toHaveTextContent(
      /^sattle\.me feeOn everything you take in, converted or notFree until 31 December 20261%0%$/
    );
    expect(screen.getByText("1%")).toHaveStyle({ textDecorationLine: "line-through" });
    expect(screen.getByText("0%")).not.toHaveStyle({ textDecorationLine: "line-through" });
    // In the waiver's green, as "Free until …".
    expect(screen.getByText("0%")).toHaveStyle({
      color: StyleSheet.flatten(screen.getByText("Free until 31 December 2026").props.style).color
    });
    // Read as one by screen readers.
    expect(screen.getByLabelText("0% instead of 1%")).toBeTruthy();
    expect(screen.getByTestId("conversion-fee")).toHaveTextContent(
      /^Conversion to Swiss francsMt Pelerin's sale fees, only on the share converted\+ 0\.5% to 1\.3%.?Free transfer/
    );
  });

  it("tells, under Mt Pelerin's fees, that a transfer is free from 50 CHF, a smaller sale grouped or wired for its fee", async () => {
    // One threshold for both: the grouped transfer's and the transfer fee's, as the line says.
    expect(SPLIT_PAYOUT_THRESHOLD_CHF_MINOR).toBe(SELL_TRANSFER_FEE.belowChfMinor);
    await render(<SplitFees payoutCurrency="CHF" hasFiat languageTag="en-CH" />);
    expect(screen.getByTestId("conversion-fee")).toHaveTextContent(
      /^Conversion to Swiss francsMt Pelerin's sale fees, only on the share converted\+ 0\.5% to 1\.3%.?Free transfer from 50\.00 CHF\. Below it, your sales are grouped until they reach it, or transferred at once for 1\.00 CHF\.$/
    );
    expect(screen.queryByTestId("transfer-fee")).toBeNull();
  });

  it("tells the transfer fee as 1 euro in euros, as the equivalent of 1 CHF in other currencies", async () => {
    const { rerender } = await render(
      <SplitFees payoutCurrency="EUR" hasFiat languageTag="en-CH" />
    );
    expect(screen.getByTestId("conversion-fee")).toHaveTextContent(
      /Free transfer from the equivalent of 50\.00 CHF\. .* for 1\.00 EUR\./
    );

    await rerender(<SplitFees payoutCurrency="USD" hasFiat languageTag="en-CH" />);
    expect(screen.getByTestId("conversion-fee")).toHaveTextContent(
      /Free transfer from the equivalent of 50\.00 CHF\. .* for the equivalent of 1\.00 CHF\./
    );
  });

  it("shows sattle.me's fee as it is once its waiver is over", async () => {
    jest.spyOn(Date, "now").mockReturnValue(Date.UTC(2027, 0, 2));
    await render(<SplitFees payoutCurrency="EUR" hasFiat={false} languageTag="de-DE" />);

    expect(screen.getByTestId("sattle-fee")).toHaveTextContent(
      /^sattle\.me feeOn everything you take in, converted or not1 %$/
    );
    expect(screen.getByText("1 %")).not.toHaveStyle({ textDecorationLine: "line-through" });
    expect(screen.queryByText(/Free until/)).toBeNull();
    expect(screen.queryByLabelText(/instead of/)).toBeNull();
    // No share sold: no transfer, no warning about it.
    expect(screen.queryByText(/Free transfer/)).toBeNull();
    expect(screen.getByTestId("conversion-fee")).toHaveTextContent(
      /^Conversion to eurosMt Pelerin's sale fees, only on the share converted\+ 0,5 % to 1,3 %$/
    );
  });
});
