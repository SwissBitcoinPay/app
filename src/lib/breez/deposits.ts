import { MAX_DEPOSIT_CLAIM_FEE_SATS } from "./config";
import type { PendingDeposit } from "./types";

const TXID = /^[0-9a-f]{64}$/i;

/**
 * A deposit of `listUnclaimedDeposits` as the app reads it (wallet.ts, wallet.web.ts): its
 * transaction id in lowercase, as every reader matches it (witnesses, payments' `txId`); its value
 * in sats, a `bigint` (native) or a `number` taken only when an exact integer (web, hard rule 3).
 * Null when out of shape.
 */
export function readDeposit(
  txid: unknown,
  vout: unknown,
  amountSats: unknown,
  mature: unknown
): Omit<PendingDeposit, "waitsForFees" | "claimFeeSats"> | null {
  if (typeof txid !== "string" || !TXID.test(txid)) return null;
  if (typeof vout !== "number" || !Number.isSafeInteger(vout) || vout < 0) return null;
  if (typeof mature !== "boolean") return null;
  let sats: bigint;
  if (typeof amountSats === "bigint") sats = amountSats;
  else if (typeof amountSats === "number" && Number.isSafeInteger(amountSats)) {
    sats = BigInt(amountSats);
  } else return null;
  if (sats <= 0n) return null;
  return { txid: txid.toLowerCase(), vout, amountSats: sats, mature };
}

/**
 * What a deposit's claim refused for its price at maturity (`MaxDepositClaimFeeExceeded`) says of
 * it (PendingDeposit.waitsForFees, claimFeeSats), from the provider's price (`requiredFeeSats`): a
 * `bigint` (native) or a `number` taken only when an exact integer (web, hard rule 3).
 * - Within MAX_DEPOSIT_CLAIM_FEE_SATS: refused under a lower ceiling (99 sats in older apps),
 *   the next sync claims it; it does not wait.
 * - Out of shape, or above the deposit's value (the SDK reckons it as that value less the credit):
 *   refused all the same, it waits, its price not told (never shown as being credited).
 * - Else it waits for a lower price, told.
 */
export function readRefusedClaim(
  required: unknown,
  amountSats: bigint
): Pick<PendingDeposit, "waitsForFees" | "claimFeeSats"> {
  let sats: bigint;
  if (typeof required === "bigint") sats = required;
  else if (typeof required === "number" && Number.isSafeInteger(required)) sats = BigInt(required);
  else return { waitsForFees: true };
  if (sats <= MAX_DEPOSIT_CLAIM_FEE_SATS) return { waitsForFees: false };
  if (sats > amountSats) return { waitsForFees: true };
  return { waitsForFees: true, claimFeeSats: sats };
}
