import { logFailure } from "@/lib/log/log";
import { fetchLegacyWalletBalance, type LegacyServerOptions } from "@/lib/legacy-v2/server";
import {
  couldCoverLeastFees,
  legacyWatchKey,
  parseLegacyAccountPublicKey
} from "@/lib/legacy-v2/wallet";
import { loadLegacyWatch, saveLegacyWatch } from "@/lib/legacy-v2/watch-store";

import { getMigration } from "./flow";

/*
 * Whether "Your account is up to date" asks for the v2 wallet's 12 words, on a device without them:
 * only when they would move money.
 *
 * - The v2 account was read on the v2 server, and lists among the payout destinations the merchant
 *   proved an on-chain wallet the v2 app created (LegacyAccount's `localWallets`): otherwise, never
 *   (a v2 account not read says nothing: no words asked).
 * - That wallet holds more than dust, by the v2 server's own index of the chain
 *   (`xpub-balance`, fetchLegacyWalletBalance): an empty wallet needs no words. A balance not
 *   proven (the server's index down, its scan stopped on a bound, a wallet listed without its key)
 *   is not proven empty: the words are asked.
 *
 * The device keeps that wallet's public key (watch-store.ts), unless it watches one already: what
 * the v2 service still pays it later shows in "Wallet", which asks for the words then.
 */
export async function legacyWordsNeeded(options: LegacyServerOptions = {}): Promise<WordsNeeded> {
  const wallets = getMigration()?.account?.localWallets;
  if (!wallets || wallets.length === 0) return { status: "none" };
  const listed = wallets.flatMap(({ key }) => (key ? [key] : []));
  const keys = [...new Set(listed)];
  // The last listed, even when listed before too (a wallet proved again: the one paid now); none
  // when the last entry names no key (never an earlier wallet in its place).
  await watchLastWallet(wallets.at(-1)?.key ?? undefined);
  // An entry without its key: a wallet whose balance cannot be read (one listed twice is not).
  if (listed.length < wallets.length) return { status: "unknown" };
  let sats = 0n;
  for (const key of keys) {
    try {
      const balance = await fetchLegacyWalletBalance(key, options);
      if (!balance.complete) return { status: "unknown" };
      const total = balance.confirmedSats + balance.unconfirmedSats;
      if (couldCoverLeastFees(total)) sats += total;
    } catch (error) {
      logFailure("Reading the v2 wallet's balance failed", error);
      return { status: "unknown" };
    }
  }
  return sats > 0n ? { status: "funds", sats } : { status: "none" };
}

/** legacyWordsNeeded's answer. Amounts exact, in sats. */
export type WordsNeeded =
  /** No words to ask: no v2 account read, no wallet of the v2 app, or only empty ones (or dust). */
  | { status: "none" }
  /** What its wallets hold (confirmed and on their way), more than dust. */
  | { status: "funds"; sats: bigint }
  /** A wallet of the v2 app whose balance could not be proven: the words are asked. */
  | { status: "unknown" };

/**
 * Keeps the public key `last` of the last wallet listed (the server appends each new destination:
 * the last is the one the v2 service pays), unless this device watches one already.
 */
async function watchLastWallet(last: string | undefined): Promise<void> {
  const account = last ? parseLegacyAccountPublicKey(last) : null;
  if (!account) return;
  const { watch, newer } = await loadLegacyWatch();
  if (watch || newer) return;
  await saveLegacyWatch({ xpub: legacyWatchKey(account), from: { 0: 0, 1: 0 }, checkedAt: 0 });
}

/**
 * What the v2 app's wallet holds by the v2 server's index (confirmed and on their way), for the
 * panel that offers to transfer it from this device (LegacyTransferSheet.tsx), before the words are
 * read: only when the v2 account lists exactly one wallet the v2 app created, its balance proven
 * (`complete`). Null otherwise (none listed, several, its index down): the panel says no amount,
 * never one that could be another wallet's. The transfer reads the wallet of the words itself, and
 * says what it moved. Never rejects.
 */
export async function listedWalletBalance(
  options: LegacyServerOptions = {}
): Promise<bigint | null> {
  const wallets = getMigration()?.account?.localWallets;
  if (!wallets || wallets.length === 0) return null;
  const keys = new Set(wallets.map(({ key }) => key));
  const [key] = keys;
  if (keys.size !== 1 || !key) return null;
  try {
    const balance = await fetchLegacyWalletBalance(key, options);
    return balance.complete ? balance.confirmedSats + balance.unconfirmedSats : null;
  } catch (error) {
    logFailure("Reading the v2 wallet's balance failed", error);
    return null;
  }
}
