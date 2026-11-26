import { waitFor } from "@testing-library/react-native";
import * as SecureStore from "expo-secure-store";

import { openMerchantAccount } from "../../jest/account";
import { taprootAddress } from "../../jest/bitcoin";
import type * as MempoolFake from "../../jest/mempool";
import { MEMPOOL_API_URL, ONCHAIN_CHECK_WAIT_MS, ONCHAIN_POOL_SIZE } from "../config/onchain";
import { closeAccount, updateAccount } from "../features/account/session";
import { activateTerminal } from "../features/terminal/activate";
import {
  prepareOnchainAddress,
  recycleOnchainAddress,
  releaseOnchainAddress,
  syncOnchainPool,
  takeOnchainAddress,
  topUpOnchainPool,
  walletPool
} from "../features/terminal/onchain-pool";
import {
  connectWallet,
  disconnectWallet,
  getWalletConnectionId,
  newDepositAddress,
  subscribeWallet
} from "../lib/breez/wallet";
import { parseOnchainPool } from "../lib/terminal/model";
import { loadOnchainPool, saveOnchainPool } from "../lib/terminal/profile";

jest.mock("../lib/breez/wallet", () => ({
  checkWalletConfig: jest.fn(),
  connectWallet: jest.fn(async () => undefined),
  getWalletConnectionId: jest.fn(() => null),
  getWalletId: jest.fn(async () => WALLET),
  getWalletLightningAddress: jest.fn(async () => "sattleme02c6047f94@breez.tips"),
  newDepositAddress: jest.fn(),
  disconnectWallet: jest.fn(async () => undefined),
  subscribeWallet: jest.fn(() => () => undefined)
}));
const mockNetwork = jest.fn(() => "mainnet");
jest.mock("../lib/breez/config", () => ({
  ...jest.requireActual("../lib/breez/config"),
  getBreezNetwork: () => mockNetwork()
}));

// The explorers' chain of jest.setup.ts, emptied before each test.
const mempool = jest.requireMock<typeof MempoolFake>("../lib/onchain/esplora");

// Before the mocks below: jest.mock factories are hoisted, the constants they read are not.
const WALLET = "02c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5";
const OTHER_WALLET = "02f9308a019258c31049344f85f89d5229b531c845836f99b08601f113bce036f9";

/** taprootAddress(from), …, taprootAddress(to). */
const fills = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => taprootAddress(from + i));

/** What takeOnchainAddress gives for a sale that shows `address`. */
const shows = (address: string) => ({ address, unavailable: null });
/** What takeOnchainAddress gives for a sale left Lightning only, and why. */
const none = (unavailable: "explorer" | "empty" | "error" | null) => ({
  address: null,
  unavailable
});

/** The wallet hands out taprootAddress(1), (2), … in turn. */
function walletAddresses(failAfter = Infinity) {
  let next = 0;
  jest.mocked(newDepositAddress).mockImplementation(async () => {
    if (next >= failAfter) throw new Error("ResourceExhausted");
    next += 1;
    return taprootAddress(next);
  });
}

describe("on-chain addresses of the device", () => {
  beforeEach(() => {
    jest.mocked(newDepositAddress).mockReset();
    mockNetwork.mockReturnValue("mainnet");
    // Failures are part of these tests: their warnings are expected.
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  it("is filled up to 20 by the connected wallet, then hands them out in order", async () => {
    walletAddresses();
    // Not filled yet: the sale says why it is Lightning only.
    await expect(takeOnchainAddress(walletPool(WALLET))).resolves.toEqual(none("empty"));

    // As many as an employee's lot.
    expect(ONCHAIN_POOL_SIZE).toBe(20);
    await expect(topUpOnchainPool(WALLET)).resolves.toBe(20);
    expect(newDepositAddress).toHaveBeenCalledTimes(20);
    expect(newDepositAddress).toHaveBeenCalledWith(WALLET);
    await expect(takeOnchainAddress(walletPool(WALLET))).resolves.toEqual(shows(taprootAddress(1)));
    await expect(takeOnchainAddress(walletPool(WALLET))).resolves.toEqual(shows(taprootAddress(2)));

    // Only what is missing is asked for again.
    await expect(topUpOnchainPool(WALLET)).resolves.toBe(2);
    expect(newDepositAddress).toHaveBeenCalledTimes(22);
    expect((await loadOnchainPool("mainnet"))?.addresses).toEqual(fills(3, 22));
  });

  it("never gives the same address to two sales, even at once", async () => {
    walletAddresses();
    await topUpOnchainPool(WALLET);

    const taken = await Promise.all(
      Array.from({ length: 22 }, () => takeOnchainAddress(walletPool(WALLET)))
    );

    const addresses = taken.flatMap(({ address }) => (address === null ? [] : [address]));
    expect(new Set(addresses).size).toBe(20);
    // The last two found the pool empty, and say so.
    expect(taken.filter(({ address }) => address === null)).toEqual([none("empty"), none("empty")]);
  });

  it("takes back an address, last, once (an invoice paid over Lightning)", async () => {
    walletAddresses();
    await topUpOnchainPool(WALLET);
    const first = (await takeOnchainAddress(walletPool(WALLET))).address;

    await releaseOnchainAddress(walletPool(WALLET), first!);
    await releaseOnchainAddress(walletPool(WALLET), first!);

    const addresses = (await loadOnchainPool("mainnet"))?.addresses ?? [];
    expect(addresses).toHaveLength(20);
    expect(addresses[19]).toBe(first);
  });

  it('checks an address with the explorer from "Charge" on, once for the sale', async () => {
    walletAddresses();
    await topUpOnchainPool(WALLET);
    const asked = () =>
      mempool.chain.calls.filter(({ path }) => path === `/address/${taprootAddress(1)}/txs`);

    prepareOnchainAddress(walletPool(WALLET));
    await waitFor(() => expect(asked()).toHaveLength(1));
    // The answer is still fresh when the invoice is ready: not asked again.
    await expect(takeOnchainAddress(walletPool(WALLET))).resolves.toEqual(shows(taprootAddress(1)));
    expect(asked()).toHaveLength(1);
  });

  it("drops an address paid already and takes the next one", async () => {
    walletAddresses();
    await topUpOnchainPool(WALLET);
    mempool.pay(taprootAddress(1), 5_000n);
    mempool.pay(taprootAddress(2), 5_000n);

    await expect(takeOnchainAddress(walletPool(WALLET))).resolves.toEqual(shows(taprootAddress(3)));
    expect((await loadOnchainPool("mainnet"))?.addresses).toEqual(fills(4, 20));
    // Never put back either.
    await recycleOnchainAddress(walletPool(WALLET), taprootAddress(1));
    expect((await loadOnchainPool("mainnet"))?.addresses).not.toContain(taprootAddress(1));
  });

  it("says the pool is empty once every address it checked was paid already", async () => {
    walletAddresses();
    await topUpOnchainPool(WALLET);
    for (const address of fills(1, 20)) mempool.pay(address, 5_000n);

    await expect(takeOnchainAddress(walletPool(WALLET))).resolves.toEqual(none("empty"));
    expect((await loadOnchainPool("mainnet"))?.addresses).toEqual([]);
  });

  it("gives none when the explorer cannot tell in time, and keeps the address", async () => {
    walletAddresses();
    await topUpOnchainPool(WALLET);
    mempool.chain.down.add(MEMPOOL_API_URL);
    await expect(takeOnchainAddress(walletPool(WALLET))).resolves.toEqual(none("explorer"));
    mempool.chain.down.clear();

    // An explorer that does not answer: the sale waits ONCHAIN_CHECK_WAIT_MS at most, 10 s.
    expect(ONCHAIN_CHECK_WAIT_MS).toBe(10_000);
    jest.useFakeTimers();
    const silent = jest
      .spyOn(mempool, "fetchAddressTxs")
      .mockReturnValue(new Promise(() => undefined));
    try {
      let taken: Awaited<ReturnType<typeof takeOnchainAddress>> | undefined;
      void takeOnchainAddress(walletPool(WALLET)).then((result) => {
        taken = result;
      });
      await jest.advanceTimersByTimeAsync(ONCHAIN_CHECK_WAIT_MS - 1);
      expect(taken).toBeUndefined();
      await jest.advanceTimersByTimeAsync(1);
      expect(taken).toEqual(none("explorer"));
    } finally {
      silent.mockRestore();
      jest.useRealTimers();
    }
    expect((await loadOnchainPool("mainnet"))?.addresses).toHaveLength(20);
  });

  it("says the stored addresses failed when the pool cannot be written, and keeps the address", async () => {
    // Addresses no other test checked: the explorer's answers are kept by address.
    await saveOnchainPool({ version: 1, walletId: WALLET, addresses: fills(31, 33) });
    jest.mocked(SecureStore.setItemAsync).mockRejectedValueOnce(new Error("Keychain locked"));

    await expect(takeOnchainAddress(walletPool(WALLET))).resolves.toEqual(none("error"));
    expect((await loadOnchainPool("mainnet"))?.addresses).toEqual(fills(31, 33));
  });

  it("says an employee's lot is empty, or failed when it cannot be read", async () => {
    const lot = { kind: "team" as const, team: "a".repeat(64) };
    // No lot given yet (src/features/team/member-addresses.ts).
    await expect(takeOnchainAddress(lot)).resolves.toEqual(none("empty"));
    jest.mocked(SecureStore.getItemAsync).mockResolvedValueOnce("{damaged");
    await expect(takeOnchainAddress(lot)).resolves.toEqual(none("error"));
  });

  it("gives none, and no reason, on a network without an explorer", async () => {
    walletAddresses();
    await topUpOnchainPool(WALLET);
    // Regtest: on-chain payments are not offered at all (src/config/onchain.ts).
    mockNetwork.mockReturnValue("regtest");

    await expect(takeOnchainAddress(walletPool(WALLET))).resolves.toEqual(none(null));
  });

  it("keeps what it got when the wallet stops answering", async () => {
    walletAddresses(4);

    await expect(topUpOnchainPool(WALLET)).resolves.toBe(4);
    expect(newDepositAddress).toHaveBeenCalledTimes(5);
    expect((await loadOnchainPool("mainnet"))?.addresses).toHaveLength(4);
  });

  it("runs one top-up at a time", async () => {
    walletAddresses();

    const [first, second] = await Promise.all([topUpOnchainPool(WALLET), topUpOnchainPool(WALLET)]);

    expect(first).toBe(20);
    expect(second).toBe(20);
    expect(newDepositAddress).toHaveBeenCalledTimes(20);
  });

  it("never shows another account's addresses", async () => {
    walletAddresses();
    await topUpOnchainPool(OTHER_WALLET);

    await expect(takeOnchainAddress(walletPool(WALLET))).resolves.toEqual(none("empty"));
    await topUpOnchainPool(WALLET);
    const pool = await loadOnchainPool("mainnet");
    expect(pool?.walletId).toBe(WALLET);
    expect(pool?.addresses).toEqual(fills(21, 40));
  });

  it("stops at an address handed out again, and saves each one as it comes", async () => {
    // Its fourth address is its third again: the wallet gives no new one now.
    let next = 0;
    jest.mocked(newDepositAddress).mockImplementation(async () => {
      next += 1;
      return taprootAddress(Math.min(next, 3));
    });

    await expect(topUpOnchainPool(WALLET)).resolves.toBe(3);
    expect(newDepositAddress).toHaveBeenCalledTimes(4);
    expect((await loadOnchainPool("mainnet"))?.addresses).toEqual(fills(1, 3));
  });

  it("is not filled at activation: the wallet's keys go at once", async () => {
    // The test account's wallet is WALLET (jest/account.ts).
    await openMerchantAccount();
    walletAddresses();
    jest.mocked(disconnectWallet).mockClear();
    jest.mocked(connectWallet).mockClear();

    await activateTerminal({ businessName: "Business 9EE5", displayCurrency: "CHF" });

    // The addresses come in the background once the account is open (syncOnchainPool).
    expect(newDepositAddress).not.toHaveBeenCalled();
    // Connected for the profile only (another flow's connection closed first), then disconnected.
    expect(connectWallet).toHaveBeenCalledTimes(1);
    expect(disconnectWallet).toHaveBeenCalledTimes(2);
    expect(jest.mocked(disconnectWallet).mock.invocationCallOrder[1]).toBeGreaterThan(
      jest.mocked(connectWallet).mock.invocationCallOrder[0]!
    );
    closeAccount();
  });

  it("is kept in the secure store, out of the device backups", async () => {
    walletAddresses(1);
    await topUpOnchainPool(WALLET);

    expect(SecureStore.setItemAsync).toHaveBeenLastCalledWith(
      "terminal-onchain-addresses",
      JSON.stringify({ version: 1, walletId: WALLET, addresses: [taprootAddress(1)] }),
      { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY }
    );
  });

  it("refuses a stored pool it cannot trust", async () => {
    expect(
      parseOnchainPool(
        {
          version: 1,
          walletId: WALLET,
          addresses: [taprootAddress(1), taprootAddress(1).toUpperCase(), taprootAddress(2)]
        },
        "mainnet"
      )?.addresses
    ).toEqual([taprootAddress(1), taprootAddress(2)]);
    expect(parseOnchainPool({ version: 2, walletId: WALLET, addresses: [] }, "mainnet")).toBeNull();
    expect(parseOnchainPool({ version: 1, walletId: "x", addresses: [] }, "mainnet")).toBeNull();
    expect(
      parseOnchainPool(
        { version: 1, walletId: WALLET, addresses: [taprootAddress(1, "bcrt")] },
        "mainnet"
      )
    ).toBeNull();
    expect(
      parseOnchainPool(
        {
          version: 1,
          walletId: WALLET,
          addresses: ["bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4"]
        },
        "mainnet"
      )
    ).toBeNull();

    await saveOnchainPool({ version: 1, walletId: WALLET, addresses: [taprootAddress(1)] });
    jest.mocked(SecureStore.getItemAsync).mockResolvedValueOnce("{damaged");
    await expect(loadOnchainPool("mainnet")).resolves.toBeNull();
  });
});

describe("the point of sale's addresses, filled in the background once the account is open", () => {
  /** The fake wallet's connection: 1 while connected by a background task. */
  let connection: number | null = null;

  beforeEach(async () => {
    closeAccount();
    jest.mocked(newDepositAddress).mockReset();
    jest
      .mocked(connectWallet)
      .mockReset()
      .mockImplementation(async () => {
        connection = 1;
      });
    jest
      .mocked(disconnectWallet)
      .mockReset()
      .mockImplementation(async () => {
        connection = null;
      });
    jest.mocked(getWalletConnectionId).mockImplementation(() => connection);
    jest.mocked(subscribeWallet).mockImplementation((listener) => {
      const timer = setTimeout(listener, 0);
      return () => clearTimeout(timer);
    });
    connection = null;
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    await saveOnchainPool({ version: 1, walletId: WALLET, addresses: [] });
    // The test account's wallet is WALLET (jest/account.ts); its settings stay on the device
    // from one test to the next.
    await openMerchantAccount({ onchainPayments: true });
  });

  afterEach(() => {
    closeAccount();
  });

  it("fills the pool up to 20 as soon as one is missing, the wallet connected for that only", async () => {
    await saveOnchainPool({ version: 1, walletId: WALLET, addresses: fills(1, 19) });
    let next = 19;
    jest.mocked(newDepositAddress).mockImplementation(async () => taprootAddress(++next));

    await syncOnchainPool(WALLET);

    expect((await loadOnchainPool("mainnet"))?.addresses).toEqual(fills(1, 20));
    expect(connectWallet).toHaveBeenCalledTimes(1);
    expect(connection).toBeNull();
  });

  it("asks the wallet for as long as it takes: no time limit", async () => {
    // From its second address on, the wallet answers ten minutes after the filling began.
    const start = Date.now();
    const clock = jest.spyOn(Date, "now");
    let next = 0;
    jest.mocked(newDepositAddress).mockImplementation(async () => {
      if (next >= 1) {
        clock.mockReturnValue(start + 10 * 60 * 1000);
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      return taprootAddress(++next);
    });
    try {
      await syncOnchainPool(WALLET);
    } finally {
      clock.mockRestore();
    }

    expect((await loadOnchainPool("mainnet"))?.addresses).toEqual(fills(1, 20));
  });

  it("stops once a wallet screen takes the connection, keeping what the wallet gave", async () => {
    let next = 0;
    jest.mocked(newDepositAddress).mockImplementation(async () => {
      next += 1;
      // After five addresses, a wallet screen connects the wallet again, for itself.
      if (next === 5) connection = 2;
      return taprootAddress(next);
    });

    await syncOnchainPool(WALLET);

    expect((await loadOnchainPool("mainnet"))?.addresses).toEqual(fills(1, 5));
    // Its connection stays: the filling does not disconnect it.
    expect(disconnectWallet).not.toHaveBeenCalled();
  });

  it("connects nothing while the pool is full", async () => {
    await saveOnchainPool({ version: 1, walletId: WALLET, addresses: fills(1, 20) });
    await syncOnchainPool(WALLET);
    expect(connectWallet).not.toHaveBeenCalled();
    expect(newDepositAddress).not.toHaveBeenCalled();
  });

  it("fills it while the point of sale takes Lightning only: the invoices take their addresses there", async () => {
    // "On-chain payments" off: the point of sale's only, the
    // invoices of "New invoice" still offer an on-chain address.
    await updateAccount({ onchainPayments: false });
    let next = 0;
    jest.mocked(newDepositAddress).mockImplementation(async () => taprootAddress(++next));

    await syncOnchainPool(WALLET);

    expect((await loadOnchainPool("mainnet"))?.addresses).toEqual(fills(1, 20));
    expect(connectWallet).toHaveBeenCalledTimes(1);
    expect(connection).toBeNull();
  });

  it("fills nothing for another account's point of sale", async () => {
    await syncOnchainPool(OTHER_WALLET);

    expect(connectWallet).not.toHaveBeenCalled();
    expect(newDepositAddress).not.toHaveBeenCalled();
  });

  it("keeps what the wallet gave when it fails, and never rejects", async () => {
    walletAddresses(4);

    await expect(syncOnchainPool(WALLET)).resolves.toBeUndefined();

    expect((await loadOnchainPool("mainnet"))?.addresses).toEqual(fills(1, 4));
    expect(connection).toBeNull();
  });

  it("fills the pool again after each address taken, while the account stays open", async () => {
    // A long session never runs out of addresses.
    await saveOnchainPool({ version: 1, walletId: WALLET, addresses: fills(41, 60) });
    let next = 60;
    jest.mocked(newDepositAddress).mockImplementation(async () => taprootAddress(++next));

    await expect(takeOnchainAddress(walletPool(WALLET))).resolves.toEqual(
      shows(taprootAddress(41))
    );
    // The filling the take started, in the background.
    await waitFor(async () =>
      expect((await loadOnchainPool("mainnet"))?.addresses).toEqual(fills(42, 61))
    );
    await waitFor(() => expect(connection).toBeNull());
    expect(connectWallet).toHaveBeenCalledTimes(1);

    // An address paid already, dropped: replaced as well, with the one the sale shows.
    mempool.pay(taprootAddress(42), 5_000n);
    await expect(takeOnchainAddress(walletPool(WALLET))).resolves.toEqual(
      shows(taprootAddress(43))
    );
    await waitFor(async () =>
      expect((await loadOnchainPool("mainnet"))?.addresses).toEqual(fills(44, 63))
    );
    await waitFor(() => expect(connection).toBeNull());
  });

  it("fills an empty pool again at the next take: an earlier filling could not", async () => {
    // Offline at the unlocking: nothing came.
    jest.mocked(newDepositAddress).mockRejectedValue(new Error("offline"));
    await syncOnchainPool(WALLET);
    expect((await loadOnchainPool("mainnet"))?.addresses).toEqual([]);

    let next = 63;
    jest.mocked(newDepositAddress).mockImplementation(async () => taprootAddress(++next));
    await expect(takeOnchainAddress(walletPool(WALLET))).resolves.toEqual(none("empty"));
    await waitFor(async () =>
      expect((await loadOnchainPool("mainnet"))?.addresses).toEqual(fills(64, 83))
    );
    await waitFor(() => expect(connection).toBeNull());
  });

  it("fills what a take used during a filling once that filling ends", async () => {
    await saveOnchainPool({ version: 1, walletId: WALLET, addresses: fills(84, 102) });
    let next = 102;
    let open: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      open = resolve;
    });
    jest.mocked(newDepositAddress).mockImplementation(async () => {
      await held;
      return taprootAddress(++next);
    });

    // The filling counted one address missing; a sale takes another while it waits.
    const filling = syncOnchainPool(WALLET);
    await waitFor(() => expect(newDepositAddress).toHaveBeenCalledTimes(1));
    await expect(takeOnchainAddress(walletPool(WALLET))).resolves.toEqual(
      shows(taprootAddress(84))
    );
    open();
    await filling;

    await waitFor(async () =>
      expect((await loadOnchainPool("mainnet"))?.addresses).toEqual(fills(85, 104))
    );
    await waitFor(() => expect(connection).toBeNull());
    expect(newDepositAddress).toHaveBeenCalledTimes(2);
  });

  it("connects nothing after a take in till mode, nor for an employee's lot", async () => {
    await saveOnchainPool({ version: 1, walletId: WALLET, addresses: fills(105, 124) });
    jest.mocked(newDepositAddress).mockImplementation(async () => taprootAddress(200));
    // "Switch to till mode": the account closed, its wallet out of reach.
    closeAccount();

    await expect(takeOnchainAddress(walletPool(WALLET))).resolves.toEqual(
      shows(taprootAddress(105))
    );
    // The filling the take started, if any, shared: it ends without connecting.
    await syncOnchainPool(WALLET);
    // A lot is the owner's to fill (owner-addresses.ts).
    await expect(takeOnchainAddress({ kind: "team", team: "a".repeat(64) })).resolves.toEqual(
      none("empty")
    );
    await syncOnchainPool(WALLET);

    expect(connectWallet).not.toHaveBeenCalled();
    expect(newDepositAddress).not.toHaveBeenCalled();
    expect((await loadOnchainPool("mainnet"))?.addresses).toEqual(fills(106, 124));
  });
});

describe("on-chain addresses in the browser", () => {
  const store = new Map<string, string>();
  const localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key)
  };

  beforeAll(() => {
    (globalThis as unknown as { localStorage: unknown }).localStorage = localStorage;
  });
  afterAll(() => {
    delete (globalThis as unknown as { localStorage?: unknown }).localStorage;
  });

  it("are kept in localStorage under the same key", async () => {
    const web = jest.requireActual<typeof import("../lib/terminal/profile.web")>(
      "../lib/terminal/profile.web"
    );
    const pool = { version: 1 as const, walletId: WALLET, addresses: [taprootAddress(5)] };

    await web.saveOnchainPool(pool);

    expect(JSON.parse(store.get("terminal-onchain-addresses")!)).toEqual(pool);
    await expect(web.loadOnchainPool("mainnet")).resolves.toEqual(pool);
    store.set("terminal-onchain-addresses", "{damaged");
    await expect(web.loadOnchainPool("mainnet")).resolves.toBeNull();
  });
});
