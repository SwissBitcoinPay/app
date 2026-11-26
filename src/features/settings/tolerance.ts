import { TOLERANCE_STEP } from "@/config/onchain";
import { vatText } from "@/features/invoices/form";
import { parseScaled } from "@/lib/invoice/amounts";
import { formatPercent } from "@/lib/locale/format";
import { MAX_ONCHAIN_TOLERANCE } from "@/lib/onchain/tolerance";

/*
 * "Underpayment tolerance" in "Settings" (src/lib/onchain/tolerance.ts): typed in percent, by
 * tenths, from 0 to 10 %; kept in basis points.
 */

/**
 * A tolerance typed in percent ("2,5", "2,50", "5", "5 %"), in basis points; "" is 0 (none). Null
 * when it is not one of 0 to 10 % by tenths.
 */
export function parseToleranceText(text: string): number | null {
  const cleaned = text.replace(/%/g, "").trim();
  if (cleaned === "") return 0;
  // Hundredths of a percent are basis points, kept by tenths only: "2,50" is "2,5", "2,55"
  // is none. Never more decimals: "1,000" may be a thousand (en-US), refused rather than 1 %.
  const points = parseScaled(cleaned, 2, MAX_ONCHAIN_TOLERANCE);
  return points !== null && points % TOLERANCE_STEP === 0 ? points : null;
}

/** A tolerance as its field shows it, without the sign: 250 → "2,5", 500 → "5", 0 → "". */
export function toleranceText(tolerance: number, languageTag: string): string {
  return tolerance === 0 ? "" : vatText(tolerance, languageTag);
}

/** A tolerance as a value: "2,5 %" in the device's locale; null for none. */
export function toleranceLabel(tolerance: number, languageTag: string): string | null {
  return tolerance === 0 ? null : formatPercent(tolerance / 100, languageTag);
}
