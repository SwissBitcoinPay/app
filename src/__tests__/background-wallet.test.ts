import { closeAccount } from "@/features/account/session";
import { withAccountWallet } from "@/features/account/background-wallet";
import { WalletError } from "@/lib/breez/errors";
import {
  connectWallet,
  disconnectWallet,
  getWalletConnectionId,
  getWalletId,
  subscribeWallet
} from "@/lib/breez/wallet";

import { openTestAccount } from "../../jest/account";

/*
 * The wallet connected in the background (src/features/account/background-wallet.ts): the
 * account's background tasks share one connection, so that one without a time limit (the
 * integrations' lots) never holds back the others (the copies of the declarations); the account's
 * deletion alone waits for it to be free, and asks its tasks to stop.
 */

jest.mock("../lib/breez/wallet", () => ({
  checkWalletConfig: jest.fn(),
  connectWallet: jest.fn(),
  disconnectWallet: jest.fn(),
  getWalletConnectionId: jest.fn(),
  getWalletId: jest.fn(),
  getWalletLightningAddress: jest.fn(),
  newDepositAddress: jest.fn(),
  subscribeWallet: jest.fn()
}));

const WALLET = "02c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5";

/** The fake wallet: its connection (an id, null when disconnected), and who listens to it. */
const wallet = { connection: null as number | null, next: 0, listeners: new Set<() => void>() };

function change(connection: number | null) {
  wallet.connection = connection;
  for (const listener of [...wallet.listeners]) listener();
}

/** A promise and the function that settles it. */
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

/** Lets the pending promises run. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(async () => {
  jest.clearAllMocks();
  closeAccount();
  Object.assign(wallet, { connection: null, next: 0 });
  wallet.listeners.clear();
  jest.mocked(connectWallet).mockImplementation(async () => {
    if (wallet.connection !== null) {
      throw new WalletError("alreadyConnected", "A wallet is connected");
    }
    wallet.next += 1;
    change(wallet.next);
  });
  jest.mocked(disconnectWallet).mockImplementation(async () => change(null));
  jest.mocked(getWalletConnectionId).mockImplementation(() => wallet.connection);
  jest.mocked(getWalletId).mockResolvedValue(WALLET);
  jest.mocked(subscribeWallet).mockImplementation((listener) => {
    wallet.listeners.add(listener);
    return () => wallet.listeners.delete(listener);
  });
  await openTestAccount({ usage: "merchant", signUp: "done" });
});

const FAR = () => Date.now() + 60_000;

it("shares one connection between background tasks, and disconnects after the last", async () => {
  const fill = deferred();
  const filling = withAccountWallet(FAR(), async () => {
    await fill.promise;
    return "lots";
  });
  await settle();
  expect(wallet.connection).toBe(1);

  // The copy of the declarations, while the lots are filled: no wait, the same connection.
  const copied = await withAccountWallet(FAR(), async (_, own) => {
    expect(own()).toBe(true);
    return "copied";
  });
  expect(copied).toBe("copied");
  expect(connectWallet).toHaveBeenCalledTimes(1);
  // Still connected for the lots.
  expect(wallet.connection).toBe(1);
  expect(disconnectWallet).not.toHaveBeenCalled();

  fill.resolve();
  await expect(filling).resolves.toBe("lots");
  expect(disconnectWallet).toHaveBeenCalledTimes(1);
  expect(wallet.connection).toBeNull();
});

it("never joins a connection a wallet screen made, and waits for it", async () => {
  // A wallet screen's connection (not a background task's).
  change(7);
  let ran = false;
  const task = withAccountWallet(FAR(), async () => {
    ran = true;
  });
  await settle();
  expect(ran).toBe(false);
  change(null);
  await task;
  expect(ran).toBe(true);
  expect(connectWallet).toHaveBeenCalledTimes(2);
});

it("gives an exclusive task the wallet alone: the shared tasks asked to stop, none joining", async () => {
  const stop = deferred();
  let asked = false;
  // The lots, filled until asked to stop.
  const filling = withAccountWallet(FAR(), async (_, own) => {
    while (own()) await Promise.race([stop.promise, settle()]);
    asked = true;
  });
  await settle();
  expect(wallet.connection).toBe(1);

  let deleting = false;
  const deletion = withAccountWallet(
    FAR(),
    async (_, own) => {
      deleting = true;
      expect(own()).toBe(true);
    },
    { exclusive: true }
  );
  // A copy started meanwhile does not join: it waits after the deletion.
  let copying = false;
  const copy = withAccountWallet(FAR(), async () => {
    copying = true;
  });
  await filling;
  expect(asked).toBe(true);
  await deletion;
  expect(deleting).toBe(true);
  await copy;
  expect(copying).toBe(true);
  // Three connections: the lots', then the deletion's alone, then the copy's.
  expect(wallet.next).toBe(3);
  expect(wallet.connection).toBeNull();
});

it("never shares a connection whose wallet is not the account's", async () => {
  jest.mocked(getWalletId).mockResolvedValue("03" + "ab".repeat(32));
  await expect(withAccountWallet(FAR(), async () => "never")).rejects.toThrow(
    "Another wallet is connected"
  );
  expect(wallet.connection).toBeNull();
  jest.mocked(getWalletId).mockResolvedValue(WALLET);
  await expect(withAccountWallet(FAR(), async () => "ok")).resolves.toBe("ok");
});

it("gives a freed wallet to the exclusive task before a task that waited longer", async () => {
  // A wallet screen's connection: a copy waits for it, then the deletion.
  change(7);
  const order: string[] = [];
  const copy = withAccountWallet(FAR(), async () => {
    order.push("copy");
  });
  await settle();
  const deletion = withAccountWallet(
    FAR(),
    async () => {
      order.push("deletion");
    },
    { exclusive: true }
  );
  await settle();
  // Both wake at the release: the copy, waiting first, still lets the deletion go first.
  change(null);
  await Promise.all([copy, deletion]);
  expect(order).toEqual(["deletion", "copy"]);
  expect(wallet.connection).toBeNull();
});

it("never connects the wallet of an account that has none: a card holder's, a sign-up not done", async () => {
  for (const settings of [
    { usage: "card", signUp: "done" },
    { usage: "merchant", signUp: "split" },
    { usage: null, signUp: "usage" }
  ] as const) {
    closeAccount();
    await openTestAccount(settings);
    const task = jest.fn(async () => "done");
    await expect(withAccountWallet(FAR(), task)).resolves.toBeNull();
    await expect(withAccountWallet(FAR(), task, { exclusive: true })).resolves.toBeNull();
    expect(task).not.toHaveBeenCalled();
  }
  expect(connectWallet).not.toHaveBeenCalled();
});
