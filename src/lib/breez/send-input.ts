import { decodeBech32 } from "@/lib/lightning/bech32";

import { SendError, WalletError } from "./errors";
import type { DrainQuote, SendDestination, SendQuote } from "./types";

/**
 * What both wallet layers (wallet.ts, wallet.web.ts) do the same around the SDK's `parse` for
 * "Send": clean the text up, tell a Lightning address or an LNURL that could not be reached
 * from text that is none, and convert the LNURL bounds (millisats) to whole sats.
 */

/** The `lightning:` scheme some wallets put before an invoice or an LNURL (BOLT11, LUD-17). */
const LIGHTNING_SCHEME = /^lightning:/i;

/** user@domain.tld: the shape of a Lightning address (LUD-16), checked before asking its server. */
const LIGHTNING_ADDRESS_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The LUD-17 schemes the SDK's `parse` resolves as an LNURL, with or without `//` (0.28.4). */
const LNURL_SCHEME = /^(lnurlp|lnurlw|keyauth):/i;

/** The text to give the SDK's `parse`: trimmed, without a `lightning:` scheme. */
export function normalizeSendInput(text: string): string {
  return text.trim().replace(LIGHTNING_SCHEME, "").trim();
}

/**
 * Whether `input` is a Cash App cashtag (`$alice`, `$alice@cash.app`), which the SDK's `parse`
 * resolves as the Lightning address alice@cash.app, asking cash.app (spark-sdk 0.28.4, its input
 * parser: anything starting with `$`). Before, it refused such a text without asking anyone.
 * cash.app is not among the third parties the app reaches (AGENTS.md):
 * the wallet layers refuse it before `parse`, as `unrecognized`. Re-check on every Breez upgrade.
 */
export function isCashtag(input: string): boolean {
  return input.startsWith("$");
}

/**
 * The error for a text the SDK's `parse` refused. Parsing a Lightning address (LUD-16) or an
 * LNURL asks its server: one that did not answer, or answered with an error, is `unreachable`
 * (`lnurlUnreachable` for an LNURL); anything else `unrecognized`.
 */
export function parseFailure(input: string, cause: unknown): SendError {
  // The LNURL first: `lnurlp://user@host.tld/…` has an address's shape too.
  if (isLnurl(input)) {
    return new SendError("lnurlUnreachable", "The LNURL service could not be reached", { cause });
  }
  if (LIGHTNING_ADDRESS_SHAPE.test(input)) {
    return new SendError("unreachable", "The Lightning address could not be reached", { cause });
  }
  return new SendError("unrecognized", "Not a destination the wallet can pay", { cause });
}

/**
 * Whether the SDK's `parse` takes `input` for an LNURL, and so asks its server (`parse_lnurl` of
 * its input parser, 0.28.4): a bech32 string of HRP `lnurl` (LUD-01) or a LUD-17 scheme, on its own
 * or as the `lightning` parameter of an http(s) URL (LUD-01). Re-check on every Breez upgrade.
 */
export function isLnurl(input: string): boolean {
  const text = lud01LightningParam(input) ?? input;
  return decodeBech32(text)?.hrp === "lnurl" || LNURL_SCHEME.test(text);
}

/** The non-empty `lightning` parameter of an http(s) URL (any case of its name), else null. */
function lud01LightningParam(input: string): string | null {
  if (!/^https?:\/\//i.test(input)) return null;
  try {
    for (const [name, value] of new URL(input).searchParams) {
      if (name.toLowerCase() === "lightning" && value !== "") return value;
    }
  } catch {
    // Not a URL, or a parameter that does not decode (React Native's URLSearchParams throws).
  }
  return null;
}

const MSAT_PER_SAT = 1000n;

/** The smallest whole sats an LNURL-pay endpoint accepts: its minimum in msat, rounded up. */
export function minSendableSats(msat: bigint): bigint {
  return (msat + MSAT_PER_SAT - 1n) / MSAT_PER_SAT;
}

/** The largest whole sats an LNURL-pay endpoint accepts: its maximum in msat, rounded down. */
export function maxSendableSats(msat: bigint): bigint {
  return msat / MSAT_PER_SAT;
}

/**
 * An invoice's amount in whole sats. An amount that is not whole sats cannot be paid exactly by
 * the wallet: refused rather than rounded (hard rule 3).
 */
export function invoiceSats(msat: bigint): bigint {
  if (msat % MSAT_PER_SAT !== 0n) {
    throw new SendError("unsupported", "The invoice asks for a fraction of a sat");
  }
  return msat / MSAT_PER_SAT;
}

/** Throws `expired` for an invoice whose expiry (Unix seconds) has passed. */
export function checkNotExpired(expiresAt: number, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (expiresAt <= nowSeconds) throw new SendError("expired", "The invoice has expired");
}

/**
 * How long `sendPrepared` lets the SDK wait for a Lightning invoice to be paid before it returns
 * the payment as pending (`completionTimeoutSecs`; the SDK returns at once without it). The send
 * sheet then follows the payment (`getWalletPayment`).
 */
export const SEND_COMPLETION_TIMEOUT_SECS = 20;

/**
 * Refuses a quote whose fees would come out of the amount (`FeesIncluded`): the SDK reports the
 * fee policy it actually applied, which may differ from the one asked (0.28.4). The sheet promises
 * the recipient the amount shown, fees on top.
 */
export function checkFeesExcluded(feesExcluded: boolean): void {
  if (!feesExcluded) throw new Error("The SDK prepared the payment with the fees included");
}

/**
 * Refuses a drain (prepareDrain) the SDK did not prepare with the fees taken from its amount
 * (`FeesIncluded`): it would spend more than the wallet's balance, or leave some of it.
 */
export function checkFeesIncluded(feesIncluded: boolean): void {
  if (!feesIncluded) throw new Error("The SDK prepared the drain without the fees included");
}

/**
 * Refuses a drain whose figures do not add up: it spends exactly `totalSats`, and the recipient of
 * a Lightning payment gets exactly what is left after its fee (the LNURL service's invoice).
 */
export function checkDrain(quote: DrainQuote, totalSats: bigint): void {
  const fees = quote.fees;
  const fine =
    quote.totalSats === totalSats &&
    totalSats > 0n &&
    (fees.onchain
      ? Object.values(fees.bySpeed).every((fee) => fee >= 0n)
      : fees.feeSats >= 0n &&
        fees.receivedSats > 0n &&
        fees.receivedSats + fees.feeSats === totalSats);
  if (!fine) {
    throw new WalletError("requestFailed", "The drain was not prepared for the wallet's balance");
  }
}

/**
 * Refuses a quote whose amount is not the one asked: the invoice's own, else `amountSats`. The
 * merchant confirms the amount shown; the wallet must never send another one (hard rule 3).
 */
export function checkQuotedAmount(
  quote: SendQuote,
  destination: SendDestination,
  amountSats: bigint | null
): void {
  const expected =
    destination.kind === "bolt11" && destination.amountSats !== null
      ? destination.amountSats
      : amountSats;
  if (expected === null || quote.amountSats !== expected || quote.amountSats <= 0n) {
    throw new WalletError(
      "requestFailed",
      `The payment was prepared for ${quote.amountSats} sats, not ${String(expected)}`
    );
  }
}
