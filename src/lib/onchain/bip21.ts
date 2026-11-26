/**
 * BIP-21 payment URIs: the invoice's QR as one code for both networks (`bitcoin:` with the
 * Lightning invoice in `lightning=`, the "unified QR" wallets read), or the on-chain part alone.
 */

import { wellFormed } from "@/lib/text";

const SATS_PER_BTC = 100_000_000n;

/**
 * Sats as BIP-21's `amount`, a decimal number of bitcoins, exact (integers only, hard rule 3) and
 * without trailing zeros: 46918n → "0.00046918", 100000000n → "1".
 */
export function formatBtcAmount(sats: bigint): string {
  if (sats <= 0n) throw new Error(`Invalid amount: ${sats}`);
  const whole = sats / SATS_PER_BTC;
  const fraction = (sats % SATS_PER_BTC).toString().padStart(8, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

/**
 * `bitcoin:<address>?amount=<BTC>`, with `&lightning=<invoice>` when there is one.
 *
 * `title`, the sale's (its note), for the payer's wallet only, never the QR (it would make the code
 * denser): as `label` and `message`, which wallets read one or the other when paid on-chain (Core,
 * Electrum, Muun, Phoenix: `message`; Sparrow, BlueWallet: `label`). Paid over Lightning, they show
 * the invoice's description instead. Before `lightning`: BlueWallet keeps only what comes before
 * it. Percent-encoded UTF-8, a space as `%20` (Core and the Breez SDK read `+` as a plus): wallets
 * refuse a raw `;` or space, and split on a raw `?` or `:`. Left out when empty.
 */
export function paymentUri({
  address,
  sats,
  invoice,
  title
}: {
  address: string;
  sats: bigint;
  invoice?: string | null;
  title?: string;
}): string {
  const query = [`amount=${formatBtcAmount(sats)}`];
  const text = title ? uriText(title) : "";
  if (text) {
    const encoded = encodeURIComponent(text);
    query.push(`label=${encoded}`, `message=${encoded}`);
  }
  // A BOLT11 invoice is bech32: letters and digits only, nothing to escape.
  if (invoice) query.push(`lightning=${invoice}`);
  return `bitcoin:${address}?${query.join("&")}`;
}

/**
 * `text` on one line, as a wallet shows it: line breaks, tabs and other control characters as one
 * space, lone surrogates as U+FFFD, trimmed. A sale's note is free text of the merchant (or of an
 * integration's server).
 */
function uriText(text: string): string {
  // `encodeURIComponent` throws on a lone surrogate.
  return wellFormed(text)
    .replace(/[\s\u0000-\u001f\u007f-\u009f]+/g, " ")
    .trim();
}
