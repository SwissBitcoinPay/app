import { getAccountSettings, getAccountWalletId } from "@/features/account/session";
import { getTerminalProfile } from "@/features/terminal/profile-cache";
import { satsToFiatMinor } from "@/features/wallet/model";
import type { MovementValue } from "@/lib/card/movement-value";
import { loadCardPaymentsToValue, setCardPaymentValues } from "@/lib/card/payment-log";
import { logFailure } from "@/lib/log/log";
import { HISTORY_DAYS, HOUR_SECONDS, fetchHourPoints, pointHourOf } from "@/lib/rates/sources";
import { currencyDigits } from "@/lib/terminal/amount";
import { accountProfile } from "@/lib/terminal/model";

/*
 * What each movement of a card was worth when it happened (src/lib/card/movement-value.ts), worked
 * out once from CoinGecko's hourly points (src/lib/rates/): the
 * point of the hour that priced its time (pointHourOf, as every amount of the app), in the
 * account's currency of the moment it is worked out. Kept with the movement and never worked out
 * again: a change of currency leaves the past values as they were. CoinGecko down, or a movement
 * older than the history it keeps (HISTORY_DAYS): no value, the sats only.
 */

/** Something to value: its id, its sats, and when it happened (ms). */
export type ToValue = { id: string; sats: bigint; at: number };

/**
 * The account's currency for a value: the open account's "Reference currency", else (the
 * account closed: a card payment of the app closed) this device's point of sale's, of the same
 * wallet. Null when none is known.
 */
export async function valueCurrency(walletId: string): Promise<string | null> {
  const same = (id: string) => id.toLowerCase() === walletId.toLowerCase();
  const open = getAccountWalletId();
  if (open && same(open)) {
    const currency = getAccountSettings()?.displayCurrency;
    if (currency) return currency;
  }
  const profile = accountProfile(await getTerminalProfile());
  return profile && same(profile.walletId) ? profile.currency : null;
}

/** The oldest time (ms) CoinGecko still prices at `now` (ms). */
export function oldestValued(now: number): number {
  return (Math.floor(now / 1000) - (HISTORY_DAYS - 1) * 24 * HOUR_SECONDS) * 1000;
}

/**
 * The values of `items` in `currency`, by id: those whose hour CoinGecko prices (published, within
 * its history). Never rejects: CoinGecko unreachable or refusing, none.
 */
export async function valuesOf(
  items: readonly ToValue[],
  currency: string,
  now: number = Date.now()
): Promise<Map<string, MovementValue>> {
  const values = new Map<string, MovementValue>();
  if (items.length === 0) return values;
  const hours = items.map((item) => pointHourOf(Math.floor(item.at / 1000)));
  let points: ReadonlyMap<number, number>;
  try {
    points = await fetchHourPoints(
      currency,
      Math.min(...hours),
      Math.max(...hours),
      Math.floor(now / 1000)
    );
  } catch (error) {
    logFailure("Reading the rates of card movements failed", error);
    return values;
  }
  const digits = currencyDigits(currency);
  items.forEach((item, index) => {
    const hour = hours[index];
    const rate = points.get(hour);
    if (rate === undefined || item.sats < 0n) return;
    const minor = satsToFiatMinor(item.sats, digits, rate);
    // Beyond what a JSON number holds exactly: no value rather than a wrong one.
    if (minor > BigInt(Number.MAX_SAFE_INTEGER)) return;
    values.set(item.id, { minor: Number(minor), digits, currency, hour });
  });
  return values;
}

/**
 * Works out the values of the phone's card payments that left without one yet (payment-log.ts),
 * each kept as its entry's next revision, published with it (history-sync.ts). Never rejects.
 */
export async function valueCardPayments(walletId: string, now: number = Date.now()): Promise<void> {
  try {
    const currency = await valueCurrency(walletId);
    if (!currency) return;
    const entries = await loadCardPaymentsToValue(oldestValued(now));
    const values = await valuesOf(
      entries.map((entry) => ({ id: entry.id, sats: entry.amountSats, at: entry.at })),
      currency,
      now
    );
    await setCardPaymentValues(values);
  } catch (error) {
    // The log unreadable (a newer app's): its entries keep no value.
    logFailure("Keeping the values of card payments failed", error);
  }
}
