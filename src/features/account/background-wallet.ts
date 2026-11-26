import { hasMainWallet } from "@/features/account/main-wallet";
import { getAccountSeed, getAccountWalletId } from "@/features/account/session";
import { releaseWallet } from "@/features/terminal/activate";
import { WalletError } from "@/lib/breez/errors";
import {
  checkWalletConfig,
  connectWallet,
  getWalletConnectionId,
  getWalletId,
  subscribeWallet
} from "@/lib/breez/wallet";

/*
 * The open account's wallet, connected in the background for a task that needs it (the employees'
 * lots of on-chain addresses, owner-addresses.ts; the integrations' lots, integration-addresses.ts;
 * the copy of the registry's declarations at a change of relays,
 * src/features/settings/declarations-copy.ts; the owner's copy of a month of them once it is a year
 * old, src/features/activity/archive.ts; the account's deletion), then disconnected: the wallet's
 * keys are loaded only while something needs them.
 */

/** Resolves at the wallet's next change (connected, disconnected), or after `ms`. */
export function walletChange(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(done, Math.max(0, ms));
    const unsubscribe = subscribeWallet(done);
    function done() {
      clearTimeout(timer);
      unsubscribe();
      resolve();
    }
  });
}

/** A background connection of the account's wallet, shared by the tasks that use it now. */
type Shared = { walletId: string; connection: number; users: number };

/** The background connection tasks join (withAccountWallet), null without one. */
let shared: Shared | null = null;

/**
 * Exclusive tasks waiting for the wallet (the account's deletion): no task joins a shared connection
 * meanwhile, and those on one are asked to stop (`own()` false), so that the wallet frees.
 */
let exclusiveWaiting = 0;

/**
 * Runs `task` with the open account's wallet connected for it, by `deadline` (Unix ms). Background
 * tasks of the account share one connection: one that finds the wallet connected by another joins
 * it rather than waiting (the integrations' lots, filled without a time limit, would hold back the
 * copies of the declarations), and the last one to end disconnects it. The SDK takes concurrent
 * calls on one connection (connection.ts, `use`). An `exclusive` task (the account's deletion:
 * nothing may publish meanwhile) never shares: it waits for the shared connection to end, asking
 * its tasks to stop. Otherwise the wallet may be busy (the activation at login, a wallet screen):
 * it is waited for. `own()` tells the task whether the connection is still its own: a wallet screen
 * opened meanwhile replaces it (wallet-access.ts), an exclusive task asks it back. Disconnected
 * afterwards, unless another flow replaced the connection. Resolves with the task's value; null
 * when the account closed, has no wallet of its own (a card holder's, main-wallet.ts) or the build
 * gave no connection. Rejects when the wallet stayed busy past `deadline`, or with the task's
 * failure.
 */
export async function withAccountWallet<T>(
  deadline: number,
  task: (walletId: string, own: () => boolean) => Promise<T>,
  { exclusive = false }: { exclusive?: boolean } = {}
): Promise<T | null> {
  const walletId = getAccountWalletId();
  const seed = getAccountSeed();
  if (!walletId || !seed) return null;
  // A card holder's account has no wallet of its own (main-wallet.ts): nothing to connect.
  if (!hasMainWallet()) return null;
  checkWalletConfig();
  let mine: number | null = null;
  let joined: Shared | null = null;
  if (exclusive) exclusiveWaiting += 1;
  try {
    while (mine === null) {
      if (getAccountWalletId() !== walletId) return null;
      // Another background task's connection of this account: shared, never waited for.
      const open = shared;
      if (
        !exclusive &&
        exclusiveWaiting === 0 &&
        open &&
        open.walletId === walletId &&
        getWalletConnectionId() === open.connection
      ) {
        open.users += 1;
        joined = open;
        mine = open.connection;
        break;
      }
      // An exclusive task waits for the wallet: it gets it first, never another background task
      // that would hold it again (both wake at the same release).
      if (!exclusive && exclusiveWaiting > 0) {
        if (Date.now() >= deadline) {
          throw new WalletError("alreadyConnected", "An exclusive task waits for the wallet");
        }
        await walletChange(Math.min(5000, deadline - Date.now()));
        continue;
      }
      try {
        await connectWallet(seed);
        mine = getWalletConnectionId();
        if (mine === null) return null;
      } catch (error) {
        const busy = error instanceof WalletError && error.code === "alreadyConnected";
        if (!busy || Date.now() >= deadline) throw error;
        await walletChange(Math.min(5000, deadline - Date.now()));
      }
    }
  } finally {
    if (exclusive) exclusiveWaiting -= 1;
  }
  const connection = mine;
  const own = () => getWalletConnectionId() === connection && (exclusive || exclusiveWaiting === 0);
  try {
    if (!joined) {
      if ((await getWalletId()).toLowerCase() !== walletId.toLowerCase()) {
        throw new Error("Another wallet is connected");
      }
      // Checked: the next background tasks may join it.
      if (!exclusive) {
        joined = { walletId, connection, users: 1 };
        shared = joined;
      }
    }
    return await task(walletId, own);
  } finally {
    if (joined) joined.users -= 1;
    if (!joined || joined.users === 0) {
      if (shared === joined) shared = null;
      // A wallet screen opened meanwhile replaced this connection: its own stays.
      if (getWalletConnectionId() === connection) await releaseWallet();
    }
  }
}
