import { useIsFocused } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";

import { getAccountWalletId } from "@/features/account/session";
import { useAccountWallet } from "@/features/account/wallet-access";
import { WalletError } from "@/lib/breez/errors";
import {
  getWalletBalance,
  listPendingDeposits,
  listWalletPayments,
  listWalletPaymentsPage,
  syncWallet,
  waitWalletNetworkSync,
  watchWalletChanges
} from "@/lib/breez/wallet";
import type { PendingDeposit, WalletPayment } from "@/lib/breez/types";
import { logFailure } from "@/lib/log/log";

import { recoverAccountFunds } from "./funds-recovery-sync";
import { LIST_LIMIT, TOTALS_WINDOW_SEC } from "./model";

/**
 * How often a wallet's screen reads it again (from the SDK's storage) when its SDK's events cannot
 * be listened to (useWalletData, CardWalletPanel), and useWalletData's read after a sync that
 * reached the network once it failed.
 */
export const WALLET_REFRESH_MS = 15_000;

/**
 * How long the screen says only that it syncs, from its first read: past it without a sync that
 * reached the network, it also says that what shows is this device's copy, maybe incomplete
 * (`syncLate`, after about a minute). The SDK's own first sync ends by then offline, after its 60 s
 * sync interval (Wallet.getBalance).
 */
export const WALLET_SYNC_LATE_MS = 60_000;

export type WalletData = {
  balanceSats: bigint;
  /** The newest payments, at most `listLimit`. */
  payments: WalletPayment[];
  /** How many payments the read asked for (useWalletData's `listLimit` then). */
  listLimit: number;
  /** `payments` are all the wallet has: no older one is left (everyPaymentSince). */
  listedAll: boolean;
  /** Every payment of the last 30 days, for the totals. */
  lastDays: WalletPayment[];
  /** When `lastDays` starts, in Unix seconds. */
  since: number;
  /**
   * The on-chain deposits received but not credited yet (listPendingDeposits): "Wallet" shows an
   * integration's sale they paid (src/features/activity/model.ts). Null when their read failed:
   * nothing is shown of them then, never "none". A deposit's `claimFeeSats` only once a sync of
   * this connection reached the network (withoutStaleFees).
   */
  deposits: PendingDeposit[] | null;
};

/**
 * The deposits without their claim's price: what the SDK stored of the claim's last attempt, which
 * may be days old until a sync of the connection reached the network (it claims at each sync,
 * spark-sdk 0.28.4: `check_and_claim_static_deposits`, a part of the sync of its own, which may
 * fail alone, the old price staying then). Never told as the price of now before then; their
 * waiting for fees, still true, stays.
 */
function withoutStaleFees(deposits: PendingDeposit[]): PendingDeposit[] {
  return deposits.map(({ claimFeeSats: _, ...deposit }) => deposit);
}

/**
 * The wallet of the open account for the wallet screen ("Wallet"): its balance and payments. The
 * wallet connects as soon as the screen shows, on native and on the web, with the open account's
 * seed: no passkey, no tap (useAccountWallet). After a failure, it is tried again with a tap
 * (`open`), or when the screen is shown again.
 *
 * Read first from the SDK's local storage, then again once a sync of this connection reached the
 * network (waitWalletNetworkSync), then each time the SDK says something moved while the screen
 * shows (watchWalletChanges): a payment pending, succeeded or failed, deposits found, claimed or
 * not, and after its syncs, every 60 s while a part of them succeeds (`sync_interval_secs`,
 * spark-sdk 0.28.4: `sync_wallet_internal`, `emit_synced`). The SDK stores what an event says
 * before it tells it, a payment's balance included (utils/payments.rs, `record_payment_update`),
 * and hears a payment received at once, from the Spark operators' stream (sdk/runtime/client.rs).
 * When it cannot be listened to, the screen reads it again every WALLET_REFRESH_MS instead.
 *
 * Until a sync of this connection reached the network, `synced` is false: what shows is this
 * device's copy, which newer payments may be missing from (the screen says it is syncing); past
 * WALLET_SYNC_LATE_MS, `syncLate` too, and `retrySync` asks the SDK to sync now. The end of the SDK's first sync is not waited for: it proves no read
 * of the network (Wallet.getBalance), the screen would show this device's copy as synced offline.
 *
 * `listLimit`: how many of the newest payments it lists ("Show more" adds LIST_LIMIT more); a new
 * one reads the wallet again at once, the data shown until then saying what it read
 * (`data.listLimit`).
 */
export function useWalletData(listLimit: number = LIST_LIMIT) {
  const wallet = useAccountWallet();
  const { connected, open, opening, failure } = wallet;
  const focused = useIsFocused();
  const [data, setData] = useState<WalletData | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  // The data shown was read after a sync of this connection reached the network (see above).
  const [synced, setSynced] = useState(false);
  // The last read after that sync failed (a storage error). The reads that do not wait for the
  // sync leave it as is: they would only hide it for a moment.
  const [syncFailed, setSyncFailed] = useState(false);
  // WALLET_SYNC_LATE_MS passed without a sync that reached the network (see above).
  const [syncLate, setSyncLate] = useState(false);
  // The sync `retrySync` asked for runs.
  const [retryingSync, setRetryingSync] = useState(false);
  // Bumped by "Try again" after a failed read: the reads start again.
  const [attempt, setAttempt] = useState(0);
  // Reads the wallet once more now (after a payment sent), while the reads run.
  const readNow = useRef<(() => void) | null>(null);
  // Asks the SDK to sync now (`retrySync`), while the reads run.
  const syncNow = useRef<(() => void) | null>(null);
  // What the next read lists: a read started before "Show more" keeps its own (its data says it).
  const limit = useRef(listLimit);

  // "Show more": read again at once, not at the next WALLET_REFRESH_MS.
  useEffect(() => {
    if (limit.current === listLimit) return;
    limit.current = listLimit;
    readNow.current?.();
  }, [listLimit]);

  // Shown: the wallet connects. A failure waits for "Try again" (it goes once the screen is left).
  useEffect(() => {
    if (focused && !connected && !opening && failure === null) void open();
  }, [focused, connected, opening, failure, open]);

  // Synced: the funds that left its balance go back to it, on this connection
  // (funds-recovery-sync.ts).
  useEffect(() => {
    const walletId = getAccountWalletId();
    if (focused && connected && synced && walletId) void recoverAccountFunds(walletId);
  }, [focused, connected, synced]);

  useEffect(() => {
    if (!connected || !focused) return;
    let alive = true;
    // Reads overlap (after the SDK's events, after a payment, after the first sync): numbered in
    // the order their balance came, a read never replaces the data of a later one, which may
    // already show a payment it did not see.
    let numbered = 0;
    let shown = 0;
    let syncRetry: ReturnType<typeof setTimeout> | undefined;
    // A sync of this connection reached the network: its deposits' claim prices are those of now.
    let syncedOnce = false;
    // A sync of this connection reached the network (`syncLate` false for good), read or not since.
    let reached = false;
    let retrying = false;
    const late = setTimeout(() => {
      if (alive && !reached) setSyncLate(true);
    }, WALLET_SYNC_LATE_MS);
    const read = async (proven: boolean) => {
      // Decided before the reads: one started before the sync may read the SDK's storage before it.
      const fresh = proven || syncedOnce;
      const since = Math.floor(Date.now() / 1000) - TOTALS_WINDOW_SEC;
      if (proven) {
        await waitWalletNetworkSync();
        // The network was reached: never said otherwise, even when the reads below fail (a storage
        // error, `syncFailed`), which a sync could not mend.
        reached = true;
        clearTimeout(late);
        if (alive) setSyncLate(false);
      }
      const balanceSats = await getWalletBalance(false);
      // Once that sync is done for a read that waited for it: as recent as a read starting then,
      // not as one started before the sync.
      const order = ++numbered;
      // Taken with its number: a read numbered later never lists fewer ("Show more" only adds), so
      // that the data shown never goes back to a shorter list.
      const wanted = limit.current;
      // Before the payments: a deposit claimed meanwhile is then among them too (the activity
      // matches the two by transaction), never missing from both. Its failure leaves the payments.
      const deposits = await listPendingDeposits().catch((error: unknown) => {
        logFailure("Reading the pending deposits failed", error);
        return null;
      });
      const lastDays = await listWalletPayments({ since });
      // A busy month already holds the newest `wanted` payments (all of them are newer than any
      // payment outside it): no second read of the same payments. Older ones may be left then.
      let payments: WalletPayment[];
      let listedAll: boolean;
      if (lastDays.length >= wanted) {
        payments = lastDays.slice(0, wanted);
        listedAll = false;
      } else {
        const page = await listWalletPaymentsPage({ limit: wanted });
        payments = page.payments;
        // A page shorter than asked: no older payment is left. Counted as the SDK listed them,
        // token payments included (left out of `payments`): never told all when one is not.
        listedAll = page.listed < wanted;
      }
      if (!alive) return;
      // What shows from now on read the wallet after the sync: this read, or a later one (its
      // balance came after this one's), whose data it would have replaced.
      if (proven) {
        syncedOnce = true;
        setSynced(true);
        setSyncFailed(false);
      }
      if (order < shown) return;
      shown = order;
      setData({
        balanceSats,
        payments,
        listLimit: wanted,
        listedAll,
        lastDays,
        since,
        deposits: deposits && !fresh ? withoutStaleFees(deposits) : deposits
      });
      setLoadFailed(false);
    };
    const failed = (error: unknown) => {
      logFailure("Reading the wallet failed", error);
      // Data already shown stays: only a screen without any says so.
      if (alive) setLoadFailed(true);
    };
    // The connection ended (the screen left, the wallet let go): the effect ends with it.
    const ended = (error: unknown) =>
      !alive || (error instanceof WalletError && error.code === "notConnected");
    // The read after a sync that reached the network, again after WALLET_REFRESH_MS when it failed
    // (a storage error), until one succeeds; `syncFailed` meanwhile.
    const afterSync = (): Promise<void> =>
      read(true).catch((error: unknown) => {
        if (ended(error)) return;
        failed(error);
        setSyncFailed(true);
        syncRetry = setTimeout(() => void afterSync(), WALLET_REFRESH_MS);
      });
    void read(false)
      .catch(failed)
      .then(() => (alive ? afterSync() : undefined));
    // A read asked by the SDK's events: one at a time, one more once it ends if asked meanwhile (a
    // payment's burst: pending, succeeded, then synced). Its result is that of any read.
    let following = false;
    let followAgain = false;
    const readSoon = () => {
      if (!alive) return;
      if (following) {
        followAgain = true;
        return;
      }
      following = true;
      void read(false)
        .catch(failed)
        .finally(() => {
          following = false;
          if (followAgain) {
            followAgain = false;
            readSoon();
          }
        });
    };
    let timer: ReturnType<typeof setInterval> | undefined;
    let unwatch: (() => Promise<void>) | undefined;
    watchWalletChanges(() => readSoon()).then(
      (stop) => {
        if (!alive) {
          void stop();
          return;
        }
        unwatch = stop;
        // What moved before it listened (the first read may have read before it): read once more.
        readSoon();
      },
      (error: unknown) => {
        if (ended(error)) return;
        logFailure("Listening to the wallet failed", error);
        // Not listened to: read again on a timer instead, else nothing it receives shows.
        timer = setInterval(readSoon, WALLET_REFRESH_MS);
      }
    );
    readNow.current = () => void read(false).catch(failed);
    // A sync now: one that reaches the network ends the wait of `afterSync`. Offline it ends too,
    // having read nothing (Wallet.sync): `syncLate` stays.
    syncNow.current = () => {
      if (retrying) return;
      retrying = true;
      setRetryingSync(true);
      void syncWallet()
        .catch((error: unknown) => {
          if (!ended(error)) logFailure("Syncing the wallet again failed", error);
        })
        .finally(() => {
          retrying = false;
          if (alive) setRetryingSync(false);
        });
    };
    return () => {
      alive = false;
      readNow.current = null;
      syncNow.current = null;
      clearInterval(timer);
      void unwatch?.();
      clearTimeout(syncRetry);
      clearTimeout(late);
      // The wallet's data goes with its connection (and with the screen): the next connection
      // syncs again.
      setData(null);
      setLoadFailed(false);
      setSynced(false);
      setSyncFailed(false);
      setSyncLate(false);
      setRetryingSync(false);
    };
  }, [connected, focused, attempt]);

  const retry = useCallback(() => void open(), [open]);
  const refresh = useCallback(() => readNow.current?.(), []);
  const retrySync = useCallback(() => syncNow.current?.(), []);

  return {
    connected,
    opening,
    failure,
    data,
    synced,
    syncFailed,
    syncLate,
    retryingSync,
    loadFailed,
    open: retry,
    reload: () => setAttempt((n) => n + 1),
    refresh,
    retrySync
  };
}
