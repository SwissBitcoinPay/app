import type { CardWalletLease, leaseCardWallet } from "@/features/card/card-wallet";
import { CARD_WALLETS_NAME, cardWalletPath } from "@/lib/breez/card-wallet-names";
import { WalletError } from "@/lib/breez/errors";
import type { Wallet } from "@/lib/breez/types";
import { isPassOf } from "@/lib/card/card-pass";
import { walletPhraseOf } from "@/lib/card/keys";
import { logFailure } from "@/lib/log/log";

import { engineSeed, engineWallet } from "./wallet";

/*
 * The card payment core's `leaseWallet` in the iOS extension's engine (payment-core.ts): the wallet
 * a card pays from, connected with its pass (card-pass.ts), the only key the extension holds. As
 * the app's (src/features/card/card-wallet.ts, leaseCardWallet): one SDK instance per card's
 * wallet, shared by its leases, disconnected by the last one released, its SDK object, which holds
 * its keys, let go then (connection.ts).
 *
 * Its SDK storage is the extension's own, never the app's: the two may run at once, and two SDK
 * instances never share a storage (connection.ts). Below the extension's directory of the SDK, by
 * the app's names (card-wallet-names.ts).
 */

/** Where the host keeps the SDK storage of the card's wallet `cardId`/`generation`. */
export function engineCardWalletStorage(cardId: string, generation: number): string {
  return `${CARD_WALLETS_NAME}/${cardWalletPath(cardId, generation)}`;
}

type Entry = {
  wallet: Wallet;
  users: number;
  connecting: Promise<void> | null;
  closing: Promise<void> | null;
};

const entries = new Map<string, Entry>();

export const leaseEngineCardWallet: typeof leaseCardWallet = async (source, card) => {
  if (!("ownSecret" in source)) {
    throw new WalletError("unavailable", "The extension pays with a card's pass only");
  }
  if (!isPassOf(source, card)) throw new Error("The pass of another card's wallet");
  const { cardId, walletGeneration: generation } = card;
  const storage = engineCardWalletStorage(cardId, generation);
  let entry = entries.get(storage);
  if (!entry) {
    entry = { wallet: engineWallet(storage), users: 0, connecting: null, closing: null };
    entries.set(storage, entry);
  }
  const held = entry;
  const { wallet } = held;
  held.users += 1;
  if (held.connecting === null && !wallet.isConnected()) {
    // Its words now: the pass is wiped once its payment is done. A JavaScript string cannot be
    // wiped: this one goes with the connection's closure.
    const seed = engineSeed(walletPhraseOf(source.walletEntropy));
    const closing = held.closing;
    const connecting = (async () => {
      // Its last user's disconnection first: one SDK instance per storage (connection.ts).
      if (closing) await closing;
      await wallet.connect(seed);
    })();
    held.connecting = connecting;
    void connecting
      .catch(() => undefined)
      .finally(() => {
        if (held.connecting === connecting) held.connecting = null;
      });
  }
  let released = false;
  const release = async (): Promise<void> => {
    if (released) return;
    released = true;
    held.users -= 1;
    if (held.users > 0) return;
    const closing = wallet.disconnect().catch((error: unknown) => {
      // Let go anyway (connection.ts).
      logFailure("Disconnecting a card's wallet failed", error);
    });
    held.closing = closing;
    await closing;
    if (held.closing === closing) held.closing = null;
  };
  try {
    if (held.connecting) await held.connecting;
    if (!wallet.isConnected()) {
      throw new WalletError("notConnected", "The card's wallet was disconnected");
    }
    const lease: CardWalletLease = {
      cardId,
      generation,
      wallet,
      walletId: (await wallet.getId()).toLowerCase(),
      release
    };
    return lease;
  } catch (error) {
    await release();
    throw error;
  }
};
