import type { AmountUnit } from "@/features/settings/amount-unit-format";
import { formatSignedFiat, type Sign } from "@/features/wallet/model";
import { formatInteger } from "@/lib/locale/format";

/*
 * The net of a day of movements: at the right of the day's title, in "Wallet" and the history of a
 * card, what came in less what left, signed "+" or "−" (only there: a row's amount coming in is
 * unsigned). Only what is proven counts: a payment done, a transfer done; never an invoice open, a
 * payment being confirmed or sent, refused, failed or uncertain. Each screen says which of its rows
 * count (NetPart), and whether all of a day is listed (dayListedWhole): a day shown in part has no
 * total, as a list still read or partly read. Exact: integer sats and minor units, never a float.
 */

/** A value in minor units of `currency` (unsigned). */
export type NetValue = { minor: bigint; digits: number; currency: string };

/** A movement a day's net counts: which way it went, its sats, and its value (null: none known). */
export type NetPart = { way: "in" | "out"; sats: bigint; value: NetValue | null };

export type DayNet =
  | { unit: "fiat"; minor: bigint; digits: number; currency: string }
  | { unit: "sats"; sats: bigint };

/**
 * The net of `parts`, in `unit` when it can be: in the display currency (`fiat`) when each of them
 * has a value in one currency, else in sats, as their amounts fall back to their sats. Null without
 * any part: nothing proven that day.
 */
export function dayNet(parts: readonly NetPart[], unit: AmountUnit): DayNet | null {
  if (parts.length === 0) return null;
  const first = parts[0]!.value;
  const sameCurrency =
    first !== null &&
    parts.every(
      ({ value }) =>
        value !== null && value.currency === first.currency && value.digits === first.digits
    );
  if (unit === "fiat" && sameCurrency) {
    let minor = 0n;
    for (const { way, value } of parts) minor += way === "in" ? value!.minor : -value!.minor;
    return { unit: "fiat", minor, digits: first.digits, currency: first.currency };
  }
  let sats = 0n;
  for (const part of parts) sats += part.way === "in" ? part.sats : -part.sats;
  return { unit: "sats", sats };
}

function signOf(amount: bigint): Sign {
  return amount > 0n ? "+" : amount < 0n ? "−" : "";
}

/** "+74,50 CHF", "−191,10 CHF", "+84 230 sats", "0,00 CHF": in the device's own digits. */
export function dayNetText(net: DayNet, languageTag: string): string {
  if (net.unit === "fiat") {
    const abs = net.minor < 0n ? -net.minor : net.minor;
    return `${formatSignedFiat(abs, net.digits, languageTag, signOf(net.minor))} ${net.currency}`;
  }
  const abs = net.sats < 0n ? -net.sats : net.sats;
  return `${signOf(net.sats)}${formatInteger(abs, languageTag)} sats`;
}

/**
 * Whether the whole of the local day that starts at `dayStart` (ms) is listed, the list listing
 * every movement from `listedFrom` (ms) on: a day begun before it shows in part. Null `listedFrom`:
 * no day is known whole (a list still read, or read in part).
 */
export function dayListedWhole(dayStart: number, listedFrom: number | null): boolean {
  return listedFrom !== null && dayStart >= listedFrom;
}

/** When the local day of `at` (ms) starts, in ms. */
export function localDayStart(at: number): number {
  const date = new Date(at);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}
