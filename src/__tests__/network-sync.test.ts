import { createWalletConnection } from "@/lib/breez/connection";
import { WalletError } from "@/lib/breez/errors";
import { createNetworkSync } from "@/lib/breez/network-sync";

/*
 * The proof that a connection's sync reached the network (network-sync.ts, Wallet.waitNetworkSync):
 * the first `Synced` its SDK instance tells, over the real connection (connection.ts) and SDK
 * instances of the test, which tell it when the test says so.
 */

/** An SDK instance of the test: `tell` is what its listener calls on a `Synced`. */
type TestSdk = { disconnect: () => Promise<void>; tell: (() => void) | null };

function setup() {
  const destroyed: TestSdk[] = [];
  const connection = createWalletConnection<TestSdk>((sdk) => destroyed.push(sdk));
  const networkSync = createNetworkSync(connection);
  /** Connects an instance, listened to as wallet.ts does; `listen` fails when `refused`. */
  const connect = async (refused = false): Promise<TestSdk> => {
    const sdk: TestSdk = { disconnect: async () => undefined, tell: null };
    await connection.open(async () => {
      await networkSync.watch(sdk, async (onSynced) => {
        if (refused) throw new Error("Listener refused");
        sdk.tell = onSynced;
      });
      return sdk;
    });
    return sdk;
  };
  return { connection, networkSync, connect, destroyed };
}

/** Whether `promise` settled once every turn pending ran (a timer's), and how. */
async function outcome(promise: Promise<void>): Promise<"resolved" | "rejected" | "waiting"> {
  let state: "resolved" | "rejected" | "waiting" = "waiting";
  promise.then(
    () => {
      state = "resolved";
    },
    () => {
      state = "rejected";
    }
  );
  await new Promise((resolve) => setTimeout(resolve, 0));
  return state;
}

describe("the proof that a connection's sync reached the network", () => {
  it("comes with its instance's first Synced, at once for a wait after it", async () => {
    const { networkSync, connect } = setup();
    const sdk = await connect();
    const waiting = networkSync.wait();
    expect(await outcome(waiting)).toBe("waiting");

    sdk.tell?.();
    expect(await outcome(waiting)).toBe("resolved");
    expect(await outcome(networkSync.wait())).toBe("resolved");
  });

  it("ends a wait with notConnected as the connection ends, never keeping its instance", async () => {
    const { connection, networkSync, connect, destroyed } = setup();
    const sdk = await connect();
    const waiting = networkSync.wait();
    // Waiting past its read of the instance: the connection's end alone ends it.
    expect(await outcome(waiting)).toBe("waiting");
    const ended = expect(waiting).rejects.toEqual(
      new WalletError("notConnected", "The wallet was disconnected")
    );

    await connection.close();
    await ended;
    // Destroyed at once: the wait held no call on it.
    expect(destroyed).toEqual([sdk]);
    // A wait without a connection fails at once.
    await expect(networkSync.wait()).rejects.toMatchObject({ code: "notConnected" });
  });

  it("is each connection's own: an earlier one's proves nothing of the next", async () => {
    const { connection, networkSync, connect } = setup();
    const first = await connect();
    first.tell?.();
    await connection.close();

    const next = await connect();
    const waiting = networkSync.wait();
    expect(await outcome(waiting)).toBe("waiting");
    // The earlier instance tells again (a late event): still nothing of this one.
    first.tell?.();
    expect(await outcome(waiting)).toBe("waiting");
    next.tell?.();
    expect(await outcome(waiting)).toBe("resolved");
  });

  it("never comes when its instance could not be listened to, the failure logged", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const { connection, networkSync, connect } = setup();
      await connect(true);
      expect(warn).toHaveBeenCalledWith(
        "Listening to the wallet's syncs failed",
        expect.any(Error)
      );
      const waiting = networkSync.wait();
      expect(await outcome(waiting)).toBe("waiting");
      const ended = expect(waiting).rejects.toMatchObject({ code: "notConnected" });
      await connection.close();
      await ended;
    } finally {
      warn.mockRestore();
    }
  });
});
