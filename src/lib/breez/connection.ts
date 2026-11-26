import { logFailure } from "@/lib/log/log";

import { WalletError } from "./errors";

/** What the wallet layer needs of an SDK instance, native or web. */
type SdkInstance = { disconnect(): Promise<void> };

/**
 * Longest wait of a new connection for the previous instance, still used by a call when it was
 * disconnected (a payment being sent): past it, the connection fails (`alreadyConnected`), and a
 * later attempt waits again.
 */
export const PREVIOUS_INSTANCE_TIMEOUT_MS = 30_000;

type Slot<Sdk> = {
  /** Its own id: no two connections share one (connectionId). */
  id: number;
  sdk: Promise<Sdk>;
  /** The connection succeeded. */
  ready: boolean;
  /** The disconnection, once started: no new call may use the instance. */
  closed: Promise<void> | null;
  /** Calls using the instance now (`use`). */
  uses: number;
  /** Set once disconnected: destroys the instance, as soon as no call uses it. */
  destroy: (() => void) | null;
  /** Ends the wait for the previous instances (connectAfter): disconnected before it connected. */
  abandon: () => void;
};

/**
 * The wallet connected, shared by the whole app: one SDK instance at a time (two must never share
 * the storage directory), the calls that use it, and its end. wallet.ts and wallet.web.ts only
 * differ by how they connect and destroy an instance; the instance never leaves this module, so
 * that it is known when nothing uses it any more.
 *
 * The SDK's `disconnect` only stops its background tasks (crates/breez-sdk/core/src/sdk/api.rs in
 * 0.28.4): its object, which holds the wallet's keys (the signers built from the seed), lives on
 * until destroyed, else until the garbage collector finalizes it, at an unknown time. It is
 * destroyed once disconnected, at once when no call uses it, else when the last one ends: the web
 * build cannot free an object that an async call still borrows (wasm-bindgen throws, and the
 * object is then never freed), and a call on a freed object never settles (checked with the
 * Node.js build of 0.26.0). Hence no call starts once the disconnection has started.
 *
 * Until then, the instance still uses the wallet's storage: a new connection waits for its
 * destruction before it creates its own instance, since Breez allows one instance per storage
 * directory ("If you run multiple SDK instances, each must have its own unique storage
 * directory", docs/breez-sdk/src/guide/initializing.md).
 */
export function createWalletConnection<Sdk extends SdkInstance>(destroy: (sdk: Sdk) => void) {
  let slot: Slot<Sdk> | null = null;
  let lastId = 0;
  /** Instances disconnected but not destroyed yet: each settles once destroyed. */
  const draining = new Set<Promise<void>>();
  const listeners = new Set<() => void>();
  const changed = () => {
    for (const listener of listeners) listener();
  };

  const release = (used: Slot<Sdk>) => {
    if (used.uses > 0 || !used.destroy) return;
    const run = used.destroy;
    used.destroy = null;
    run();
  };

  return {
    /**
     * Connects with `connect`, which wraps its failures in a `WalletError`. One wallet at a time:
     * rejects with `alreadyConnected` until `close()` has completed. Waits first for the previous
     * instances still used by a call (see above): `alreadyConnected` too when they are still used
     * after PREVIOUS_INSTANCE_TIMEOUT_MS; `notConnected` when closed while it waits, without
     * creating an instance.
     */
    open(connect: () => Promise<Sdk>): Promise<void> {
      if (slot) {
        return Promise.reject(new WalletError("alreadyConnected", "A wallet is already connected"));
      }
      let abandon!: () => void;
      const abandoned = new Promise<void>((resolve) => {
        abandon = resolve;
      });
      const opened: Slot<Sdk> = {
        id: ++lastId,
        sdk: connectAfter([...draining], connect, abandoned, () => opened.closed !== null),
        ready: false,
        closed: null,
        uses: 0,
        destroy: null,
        abandon
      };
      slot = opened;
      opened.sdk.then(
        () => {
          opened.ready = true;
          if (slot === opened && !opened.closed) changed();
        },
        // A failed attempt frees the slot. The caller handles the rejection itself.
        () => {
          if (slot === opened) slot = null;
        }
      );
      return opened.sdk.then(() => undefined);
    },

    /** Whether a wallet is connected: not while it connects, nor once it starts disconnecting. */
    connected(): boolean {
      return slot !== null && slot.ready && !slot.closed;
    },

    /**
     * The id of the connection now connected (as `connected()`), null when none: each connection
     * has its own, so that a caller can tell its own connection from one made elsewhere.
     */
    connectionId(): number | null {
      return slot !== null && slot.ready && !slot.closed ? slot.id : null;
    },

    /** Calls `listener` whenever `connected()` changes; returns the unsubscribe function. */
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    /**
     * Runs `call` with the instance, after the connection in progress if any. `current` tells
     * whether the instance is still the connected one, not disconnected (nor being disconnected)
     * meanwhile. Rejects with `notConnected` when no wallet is connected, or while it disconnects.
     */
    async use<T>(call: (sdk: Sdk, current: () => boolean) => Promise<T>): Promise<T> {
      const used = slot;
      if (!used || used.closed) throw new WalletError("notConnected", "No wallet is connected");
      used.uses++;
      try {
        const sdk = await used.sdk;
        // Asked for while the wallet connected, and disconnecting since: it must not start.
        if (used.closed) throw new WalletError("notConnected", "The wallet was disconnected");
        return await call(sdk, () => slot === used && !used.closed);
      } finally {
        used.uses--;
        release(used);
      }
    },

    /**
     * Disconnects the wallet, after the connection in progress if any, then destroys its instance
     * (see above). No-op when none. Called again while disconnecting, waits for that disconnection.
     */
    close(): Promise<void> {
      const closing = slot;
      if (!closing) return Promise.resolve();
      if (closing.closed) return closing.closed;
      const wasConnected = closing.ready;
      closing.closed = (async () => {
        try {
          const sdk = await closing.sdk.catch(() => null);
          if (!sdk) return;
          try {
            await sdk.disconnect();
          } finally {
            // Only once `disconnect` has returned: it borrows the instance too.
            const destroyed = new Promise<void>((resolve) => {
              closing.destroy = () => {
                try {
                  destroy(sdk);
                } catch (error) {
                  logFailure("Destroying the wallet's SDK instance failed", error);
                } finally {
                  resolve();
                }
              };
            });
            release(closing);
            // Still used by a call: the next connection waits for its destruction.
            if (closing.destroy) {
              draining.add(destroyed);
              void destroyed.then(() => draining.delete(destroyed));
            }
          }
        } finally {
          // Only now: a new connection must not open the storage while this one is still closing.
          if (slot === closing) slot = null;
        }
      })();
      // Still waiting for a previous instance: it gives up now, the disconnection does not wait.
      closing.abandon();
      if (wasConnected) changed();
      return closing.closed;
    }
  };
}

/**
 * `connect()`, once every instance of `previous` is destroyed: at once when there is none. Rejects
 * with `alreadyConnected` when they are still used after PREVIOUS_INSTANCE_TIMEOUT_MS, and with
 * `notConnected` when `closed()` meanwhile (`abandoned` then ends the wait at once): no instance
 * is created then.
 */
function connectAfter<Sdk>(
  previous: Promise<void>[],
  connect: () => Promise<Sdk>,
  abandoned: Promise<void>,
  closed: () => boolean
): Promise<Sdk> {
  if (previous.length === 0) return connect();
  return destroyedWithin(previous, PREVIOUS_INSTANCE_TIMEOUT_MS, abandoned).then(() => {
    if (closed()) throw new WalletError("notConnected", "Disconnected before it connected");
    return connect();
  });
}

/**
 * Settles once every instance of `instances` is destroyed, or once `abandoned` settles;
 * `alreadyConnected` past `timeoutMs`.
 */
async function destroyedWithin(
  instances: Promise<void>[],
  timeoutMs: number,
  abandoned: Promise<void>
): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new WalletError("alreadyConnected", "The previous connection is still in use")),
      timeoutMs
    );
  });
  try {
    await Promise.race([Promise.all(instances), abandoned, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
