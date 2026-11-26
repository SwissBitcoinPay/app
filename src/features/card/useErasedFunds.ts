import { useEffect, useState } from "react";

import { getAccountWalletId, subscribeAccount } from "@/features/account/session";
import type { CardState } from "@/lib/card/card-record";
import { sameCardWallet, type CardWalletOf } from "@/lib/card/keys";
import { logFailure } from "@/lib/log/log";

import { erasedWallets, readErasedFunds, resetWallets, type ErasedFunds } from "./erased-funds";
import { withCardAccess } from "./states";

/**
 * A wallet no card shows any more is read at most once per this long while the app runs: each read
 * connects and syncs it, and what reaches it after its card's deletion is rare (erased-funds.ts).
 */
export const ERASED_FUNDS_READ_INTERVAL_MS = 3600 * 1000;

/**
 * By `<account's wallet id>/<card id>/<generation>/<why no card shows it>` (keyOf): when each was
 * read, and what it held.
 */
const reads = new Map<string, { at: number; funds: ErasedFunds | null }>();
/** The reads running, by the same key: one at a time for a wallet, shared. */
const reading = new Map<string, Promise<void>>();

/** What every key of `wallet` starts with (keyOf). */
function walletPrefix(walletId: string, wallet: CardWalletOf): string {
  return `${walletId.toLowerCase()}/${wallet.cardId}/${wallet.walletGeneration}/`;
}

/**
 * The key of what was read of `wallet` while no card showed it for that reason: `erased` (a
 * deleted card's, a card's earlier one: never in service again, erased-funds.ts), else the stop of
 * its card's programming at `stopped`'s keys. A card in service again, then stopped again, is at
 * other keys (keyVersionFor: one more each time it is programmed from a stop): what was read of its
 * wallet before, even an hour ago, is not what it holds now, and is read again. So is it once its
 * card is deleted.
 */
function keyOf(walletId: string, wallet: CardWalletOf, stopped: CardState | null): string {
  const why = stopped === null ? "erased" : `reset-${stopped.keyVersion}`;
  return `${walletPrefix(walletId, wallet)}${why}`;
}

/** A wallet "Cards" reads: why no card shows it (keyOf), and the stopped card it is of. */
type Watched = { wallet: CardWalletOf; key: string; stopped: CardState | null };

function watchedOf(walletId: string, states: readonly CardState[]): Watched[] {
  const stopped = states.filter((state) => state.status === "reset");
  return [
    ...erasedWallets(states).map((wallet) => ({
      wallet,
      key: keyOf(walletId, wallet, null),
      stopped: null
    })),
    ...resetWallets(states).map((wallet) => {
      const card = stopped.find((state) => sameCardWallet(state, wallet)) ?? null;
      return { wallet, key: keyOf(walletId, wallet, card), stopped: card };
    })
  ];
}

// The account closed (or another one opened): what was read of its wallets goes with it, and a
// read still running keeps nothing.
subscribeAccount(() => {
  const open = getAccountWalletId()?.toLowerCase() ?? null;
  for (const known of [reads, reading]) {
    for (const key of known.keys()) {
      if (open === null || !key.startsWith(`${open}/`)) known.delete(key);
    }
  }
});

/**
 * Reads the wallet `watched` of the account `walletId` (readErasedFunds), its result kept, unless a
 * read of it is running already: that one, shared. Rejects as withCardAccess (no account open).
 */
function readOnce(walletId: string, { wallet, key }: Watched): Promise<void> {
  const running = reading.get(key);
  if (running) return running;
  const read: Promise<void> = withCardAccess(async (access) => {
    // The account changed meanwhile: its wallets are another's.
    if (access.walletId.toLowerCase() !== walletId.toLowerCase()) return;
    const funds = await readErasedFunds(access, wallet);
    // Asked again meanwhile (its sats moved): this read is not the latest.
    if (reading.get(key) === read) reads.set(key, { at: Date.now(), funds });
  }).finally(() => {
    if (reading.get(key) === read) reading.delete(key);
  });
  reading.set(key, read);
  return read;
}

/** What a wallet no card shows holds; `stopped`, the card whose programming stopped it is of. */
export type HiddenFunds = ErasedFunds & { stopped: CardState | null };

/**
 * What `watched` hold as last read, those holding something only, in their order: a stopped card's
 * wallet (resetWallets) only with sats in it, its deposits on their way said once added.
 */
function knownFunds(watched: readonly Watched[]): HiddenFunds[] {
  return watched.flatMap(({ key, stopped }) => {
    const funds = reads.get(key)?.funds ?? null;
    if (funds === null) return [];
    return stopped !== null && funds.sats === 0n ? [] : [{ ...funds, stopped }];
  });
}

/**
 * The wallets of `states` no card shows any more (erased-funds.ts) that hold sats or receive some,
 * and those of its cards whose programming stopped that hold sats (resetWallets), for "Cards":
 * each read once the screen shows it, one after the other, at most once per
 * ERASED_FUNDS_READ_INTERVAL_MS while the app runs; `reread(wallet)` reads one again at once
 * (after its sats moved). Nothing is said of a wallet not read yet, nor of one that could not be
 * read. `paused` (a card being deleted or reprogrammed): no read starts meanwhile, to keep a
 * wallet's connection and sync off the reset of a card held to the phone, recorded deleted or reset
 * from its start; one begun before ends, and the reads go on after.
 */
export function useErasedFunds(
  states: readonly CardState[],
  paused = false
): {
  funds: HiddenFunds[];
  reread: (wallet: CardWalletOf) => void;
} {
  const walletId = getAccountWalletId();
  const [round, setRound] = useState(0);
  const [shown, setShown] = useState<{ walletId: string; funds: HiddenFunds[] } | null>(null);

  useEffect(() => {
    if (walletId === null || paused) return;
    const watched = watchedOf(walletId, states);
    let alive = true;
    const show = () => {
      if (alive) setShown({ walletId, funds: knownFunds(watched) });
    };
    show();
    void (async () => {
      for (const wallet of watched) {
        const kept = reads.get(wallet.key);
        if (kept && Date.now() - kept.at < ERASED_FUNDS_READ_INTERVAL_MS) continue;
        if (!alive) return;
        try {
          await readOnce(walletId, wallet);
        } catch (error) {
          // The account closed: read when "Cards" shows again.
          logFailure("Reading a deleted card's wallet failed", error);
          return;
        }
        show();
      }
    })();
    return () => {
      alive = false;
    };
  }, [walletId, states, round, paused]);

  return {
    funds: walletId !== null && shown?.walletId === walletId ? shown.funds : [],
    reread: (wallet) => {
      if (walletId === null) return;
      const prefix = walletPrefix(walletId, wallet);
      for (const known of [reads, reading]) {
        for (const key of known.keys()) if (key.startsWith(prefix)) known.delete(key);
      }
      setShown((current) =>
        current === null
          ? current
          : {
              ...current,
              funds: current.funds.filter((funds) => !sameCardWallet(funds.wallet, wallet))
            }
      );
      setRound((value) => value + 1);
    }
  };
}

/** Forgets the reads (tests). */
export function resetErasedFunds(): void {
  reads.clear();
  reading.clear();
}
