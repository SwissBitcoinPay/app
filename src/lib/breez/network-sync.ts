import { logFailure } from "@/lib/log/log";

import { WalletError } from "./errors";

/** What the proof of a sync needs of a wallet's connection (connection.ts). */
type Connection<Sdk> = {
  use<T>(call: (sdk: Sdk, current: () => boolean) => Promise<T>): Promise<T>;
  subscribe(listener: () => void): () => void;
};

/**
 * Whether the SDK reached the network since a connection (Wallet.waitNetworkSync), per instance:
 * the end of its first sync proves nothing of it (Wallet.getBalance), its first `Synced` event
 * does. wallet.ts and wallet.web.ts only differ by how they listen to that event.
 */
export function createNetworkSync<Sdk extends object>(connection: Connection<Sdk>) {
  const proofs = new WeakMap<Sdk, Promise<void>>();

  return {
    /**
     * Listens to `sdk`, just built, before anything else uses it: `listen` adds the SDK's listener
     * that calls `onSynced` on its `Synced`. Removed with the instance (`disconnect` "also
     * unregisters all event listeners", 0.28.4). Its failure is logged: this connection's sync is
     * then never proven, never shown as such.
     */
    async watch(sdk: Sdk, listen: (onSynced: () => void) => Promise<unknown>): Promise<void> {
      let told!: () => void;
      proofs.set(
        sdk,
        new Promise<void>((resolve) => {
          told = resolve;
        })
      );
      try {
        await listen(() => told());
      } catch (error) {
        logFailure("Listening to the wallet's syncs failed", error);
      }
    },

    /**
     * Resolves once the connected instance told its first `Synced`, at once when it did already.
     * Rejects with `notConnected` once its connection ends. Read while the instance is used, waited
     * after: a wait that may last (offline) never keeps the instance from being destroyed.
     */
    async wait(): Promise<void> {
      const { proof, current } = await connection.use(async (sdk, current) => ({
        proof: proofs.get(sdk),
        current
      }));
      await new Promise<void>((resolve, reject) => {
        const ended = () => {
          if (current()) return false;
          stop();
          reject(new WalletError("notConnected", "The wallet was disconnected"));
          return true;
        };
        const stop = connection.subscribe(ended);
        if (ended()) return;
        // An instance not watched (none is): never proven.
        void proof?.then(() => {
          stop();
          resolve();
        });
      });
    }
  };
}
