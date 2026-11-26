import { act, renderHook, waitFor } from "@testing-library/react-native";

import {
  WALLET_REFRESH_MS,
  WALLET_SYNC_LATE_MS,
  useWalletData
} from "@/features/wallet/useWalletData";
import { WalletError } from "@/lib/breez/errors";
import type { PendingDeposit, WalletPayment } from "@/lib/breez/types";
import {
  getWalletBalance,
  listPendingDeposits,
  listWalletPayments,
  listWalletPaymentsPage,
  syncWallet,
  waitWalletNetworkSync,
  watchWalletChanges
} from "@/lib/breez/wallet";

// The screen shown, its wallet open: only the reads are the test's.
jest.mock("expo-router", () => ({ useIsFocused: () => true }));
const mockOpen = jest.fn(async () => undefined);
jest.mock("@/features/account/wallet-access", () => ({
  useAccountWallet: () => ({
    connected: true,
    open: mockOpen,
    opening: false,
    failure: null
  })
}));
jest.mock("@/lib/breez/wallet", () => ({
  getWalletBalance: jest.fn(),
  listPendingDeposits: jest.fn(),
  listWalletPayments: jest.fn(),
  listWalletPaymentsPage: jest.fn(),
  syncWallet: jest.fn(),
  waitWalletNetworkSync: jest.fn(),
  watchWalletChanges: jest.fn()
}));

const balance = jest.mocked(getWalletBalance);
const list = jest.mocked(listWalletPayments);
const page = jest.mocked(listWalletPaymentsPage);
const pending = jest.mocked(listPendingDeposits);
const sync = jest.mocked(syncWallet);
const networkSync = jest.mocked(waitWalletNetworkSync);
const watch = jest.mocked(watchWalletChanges);

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("useWalletData", () => {
  beforeEach(() => {
    balance.mockReset();
    list.mockReset().mockResolvedValue([]);
    page.mockReset().mockResolvedValue({ payments: [], listed: 0 });
    pending.mockReset().mockResolvedValue([]);
    sync.mockReset().mockResolvedValue(undefined);
    // A sync that reached the network, at once.
    networkSync.mockReset().mockResolvedValue(undefined);
    // Not listening yet, unless a test says otherwise: its reads are those it counts.
    watch.mockReset().mockReturnValue(new Promise(() => undefined));
  });
  afterEach(() => jest.useRealTimers());

  it("never shows a read over a later one, and the read after a sync that reached the network", async () => {
    const proof = deferred<void>();
    const olderPayments = deferred<WalletPayment[]>();
    networkSync.mockReturnValue(proof.promise);
    balance
      // From the SDK's storage at once.
      .mockResolvedValueOnce(BigInt(100))
      // A read started before a payment, then the one after it.
      .mockResolvedValueOnce(BigInt(100))
      .mockResolvedValueOnce(BigInt(90))
      // Once a sync reached the network.
      .mockResolvedValueOnce(BigInt(80));

    const { result } = await renderHook(() => useWalletData());
    await waitFor(() => expect(result.current.data?.balanceSats).toBe(BigInt(100)));
    await waitFor(() => expect(networkSync).toHaveBeenCalledTimes(1));
    // The last days, then the newest LIST_LIMIT.
    expect(list).toHaveBeenCalledTimes(1);
    expect(page).toHaveBeenCalledTimes(1);
    // This device's copy only, until a sync reached the network.
    expect(result.current.synced).toBe(false);

    // The older read has its balance, its payments come late.
    list.mockReturnValueOnce(olderPayments.promise);
    await act(async () => result.current.refresh());
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
    // The payment left: the read after it ends first.
    await act(async () => result.current.refresh());
    await waitFor(() => expect(result.current.data?.balanceSats).toBe(BigInt(90)));
    expect(list).toHaveBeenCalledTimes(3);
    expect(page).toHaveBeenCalledTimes(2);

    // The older read ends now: dropped, the payment does not disappear.
    await act(async () => olderPayments.resolve([]));
    await waitFor(() => expect(page).toHaveBeenCalledTimes(3));
    await act(async () => undefined);
    expect(result.current.data?.balanceSats).toBe(BigInt(90));

    // A sync reached the network: its read started first, but read the wallet last.
    await act(async () => proof.resolve());
    await waitFor(() => expect(result.current.data?.balanceSats).toBe(BigInt(80)));
    expect(result.current.synced).toBe(true);
    expect(result.current.loadFailed).toBe(false);
    // The end of the SDK's first sync is never waited for: it proves no read of the network.
    expect(balance.mock.calls.every(([ensureSynced]) => !ensureSynced)).toBe(true);
  });

  it("lists the newest `listLimit` payments, read again at once for more, all told only when they are", async () => {
    balance.mockResolvedValue(BigInt(100));
    const payment = (n: number) => ({ id: `p-${n}`, timestamp: 1_000_000 - n }) as WalletPayment;
    const payments = Array.from({ length: 150 }, (_, n) => payment(n));
    page.mockImplementation(async ({ limit } = {}) => {
      const listed = payments.slice(0, limit);
      return { payments: listed, listed: listed.length };
    });
    const { result, rerender } = await renderHook(
      ({ limit }: { limit: number }) => useWalletData(limit),
      { initialProps: { limit: 100 } }
    );
    await waitFor(() => expect(result.current.data?.payments).toHaveLength(100));
    expect(result.current.data).toMatchObject({ listLimit: 100, listedAll: false });
    expect(page).toHaveBeenLastCalledWith({ limit: 100 });

    // A read of 100 still running when "Show more" asks for more: its payments come late.
    const late = deferred<{ payments: WalletPayment[]; listed: number }>();
    page.mockReturnValueOnce(late.promise);
    await act(async () => result.current.refresh());
    await waitFor(() => expect(page).toHaveBeenLastCalledWith({ limit: 100 }));

    // "Show more": read again at once, not at the next WALLET_REFRESH_MS.
    const reads = page.mock.calls.length;
    await rerender({ limit: 200 });
    await waitFor(() => expect(result.current.data?.payments).toHaveLength(150));
    expect(page.mock.calls.length).toBe(reads + 1);
    expect(page).toHaveBeenLastCalledWith({ limit: 200 });
    // Fewer than asked: none older is left.
    expect(result.current.data).toMatchObject({ listLimit: 200, listedAll: true });
    // The read of 100 ends now: dropped, never the shorter list over the longer one.
    await act(async () => late.resolve({ payments: payments.slice(0, 100), listed: 100 }));
    expect(result.current.data).toMatchObject({ listLimit: 200, listedAll: true });
    expect(result.current.data?.payments).toHaveLength(150);

    // A page full of token payments (left out): never told all, older ones may be left.
    page.mockResolvedValue({ payments: payments.slice(0, 120), listed: 200 });
    await act(async () => result.current.refresh());
    await waitFor(() => expect(result.current.data?.payments).toHaveLength(120));
    expect(result.current.data?.listedAll).toBe(false);

    // A month busier than asked: its newest, never told all.
    list.mockResolvedValue(Array.from({ length: 250 }, (_, n) => payment(n)));
    await act(async () => result.current.refresh());
    await waitFor(() => expect(result.current.data?.payments).toHaveLength(200));
    expect(result.current.data?.listedAll).toBe(false);
    expect(result.current.data?.payments[199]?.id).toBe("p-199");
  });

  it("reads the deposits not credited yet before the payments, none shown when it fails", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const deposit: PendingDeposit = {
      txid: "ab".repeat(32),
      vout: 0,
      amountSats: 1500n,
      mature: true,
      waitsForFees: true
    };
    balance.mockResolvedValue(BigInt(100));
    pending.mockResolvedValue([deposit]);
    const { result } = await renderHook(() => useWalletData());
    await waitFor(() => expect(result.current.data?.deposits).toEqual([deposit]));
    // Before the payments: one claimed in between is among them, never missing from both.
    expect(pending.mock.invocationCallOrder[0]).toBeLessThan(list.mock.invocationCallOrder[0]!);
    expect(pending.mock.invocationCallOrder[0]).toBeLessThan(page.mock.invocationCallOrder[0]!);

    // Their read fails: the payments still show, the deposits are not told ("none" is not proven).
    pending.mockRejectedValue(new Error("Storage error"));
    await act(async () => result.current.refresh());
    await waitFor(() => expect(result.current.data?.deposits).toBeNull());
    expect(result.current.data?.balanceSats).toBe(BigInt(100));
    expect(result.current.loadFailed).toBe(false);
    warn.mockRestore();
  });

  it("is synced once a read after a sync that reached the network succeeds, read again after a failure", async () => {
    jest.useFakeTimers();
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    balance
      .mockResolvedValueOnce(BigInt(100))
      // The read after the sync: its storage fails once.
      .mockRejectedValueOnce(new Error("Storage error"))
      .mockResolvedValue(BigInt(120));

    const { result } = await renderHook(() => useWalletData());
    await waitFor(() => expect(networkSync).toHaveBeenCalledTimes(1));
    await act(async () => undefined);
    expect(result.current.data?.balanceSats).toBe(BigInt(100));
    expect(result.current.synced).toBe(false);
    await waitFor(() => expect(result.current.syncFailed).toBe(true));

    await act(async () => jest.advanceTimersByTime(WALLET_REFRESH_MS));
    await waitFor(() => expect(result.current.synced).toBe(true));
    expect(result.current.syncFailed).toBe(false);
    expect(networkSync).toHaveBeenCalledTimes(2);
    expect(result.current.data?.balanceSats).toBe(BigInt(120));
    warn.mockRestore();
  });

  it('says past WALLET_SYNC_LATE_MS that no sync reached the network, syncing again on "Try again"', async () => {
    jest.useFakeTimers();
    const proof = deferred<void>();
    networkSync.mockReturnValue(proof.promise);
    balance.mockResolvedValue(BigInt(100));
    const asked = deferred<void>();
    sync.mockReturnValue(asked.promise);

    const { result } = await renderHook(() => useWalletData());
    await waitFor(() => expect(result.current.data?.balanceSats).toBe(BigInt(100)));
    await act(async () => jest.advanceTimersByTime(WALLET_SYNC_LATE_MS - 1));
    expect(result.current.syncLate).toBe(false);
    await act(async () => jest.advanceTimersByTime(1));
    expect(result.current.syncLate).toBe(true);
    expect(result.current.synced).toBe(false);

    // "Try again": one sync at a time, said while it runs.
    await act(async () => result.current.retrySync());
    await act(async () => result.current.retrySync());
    expect(sync).toHaveBeenCalledTimes(1);
    expect(result.current.retryingSync).toBe(true);
    // Offline, it ends having read nothing: still said.
    await act(async () => asked.resolve());
    expect(result.current.retryingSync).toBe(false);
    expect(result.current.syncLate).toBe(true);

    // A sync reached the network (that one, or the SDK's own).
    balance.mockResolvedValue(BigInt(130));
    await act(async () => proof.resolve());
    await waitFor(() => expect(result.current.synced).toBe(true));
    expect(result.current.syncLate).toBe(false);
    expect(result.current.data?.balanceSats).toBe(BigInt(130));
  });

  it("never says the network was not reached once it was, the read after it failing", async () => {
    jest.useFakeTimers();
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      balance
        .mockResolvedValueOnce(BigInt(100))
        // Every read after the sync: its storage fails.
        .mockRejectedValue(new Error("Storage error"));

      const { result } = await renderHook(() => useWalletData());
      await waitFor(() => expect(result.current.syncFailed).toBe(true));
      await act(async () => jest.advanceTimersByTime(WALLET_SYNC_LATE_MS));
      // A storage error, not the network: no sync would mend it.
      expect(result.current.syncLate).toBe(false);
      expect(result.current.synced).toBe(false);
      expect(result.current.syncFailed).toBe(true);
    } finally {
      warn.mockRestore();
    }
  });

  it("says nothing when the wallet disconnects while it waits for a sync", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      balance.mockResolvedValue(BigInt(100));
      networkSync.mockRejectedValueOnce(
        new WalletError("notConnected", "The wallet was disconnected")
      );

      const { result } = await renderHook(() => useWalletData());
      await waitFor(() => expect(result.current.data?.balanceSats).toBe(BigInt(100)));
      await waitFor(() => expect(networkSync).toHaveBeenCalledTimes(1));
      await act(async () => undefined);
      expect(result.current.syncFailed).toBe(false);
      expect(result.current.loadFailed).toBe(false);
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
  describe("follows the SDK's events", () => {
    /** Listening as soon as asked: `changed()` is the SDK saying something moved. */
    function listening() {
      const stop = jest.fn(async () => undefined);
      let onChange: ((succeeded: WalletPayment | null) => void) | undefined;
      watch.mockImplementation(async (listener) => {
        onChange = listener;
        return stop;
      });
      return { stop, changed: () => onChange?.(null) };
    }

    it("reads again as the SDK says something moved, one read at a time, never on a timer", async () => {
      jest.useFakeTimers();
      const sdk = listening();
      balance.mockResolvedValue(BigInt(100));
      const { result, unmount } = await renderHook(() => useWalletData());
      await waitFor(() => expect(result.current.synced).toBe(true));
      expect(watch).toHaveBeenCalledTimes(1);
      // The first read, the one after the sync, and one once it listened (what moved before).
      await waitFor(() => expect(balance).toHaveBeenCalledTimes(3));
      await act(async () => undefined);

      // No event: no read, however long the screen shows.
      await act(async () => jest.advanceTimersByTime(4 * WALLET_REFRESH_MS));
      expect(balance).toHaveBeenCalledTimes(3);

      // A payment received: pending, succeeded, then synced, while the first read runs.
      const held = deferred<bigint>();
      balance.mockReturnValueOnce(held.promise).mockResolvedValue(BigInt(150));
      await act(async () => {
        sdk.changed();
        sdk.changed();
        sdk.changed();
      });
      expect(balance).toHaveBeenCalledTimes(4);
      // One more once it ends, for what it may have read before them.
      await act(async () => held.resolve(BigInt(140)));
      await waitFor(() => expect(result.current.data?.balanceSats).toBe(BigInt(150)));
      expect(balance).toHaveBeenCalledTimes(5);

      // The screen leaves: it stops listening.
      expect(sdk.stop).not.toHaveBeenCalled();
      await unmount();
      expect(sdk.stop).toHaveBeenCalledTimes(1);
      await act(async () => sdk.changed());
      expect(balance).toHaveBeenCalledTimes(5);
    });

    it("stops listening at once when it listens only after the screen left", async () => {
      const stop = jest.fn(async () => undefined);
      const listened = deferred<() => Promise<void>>();
      watch.mockReturnValue(listened.promise);
      balance.mockResolvedValue(BigInt(100));
      const { result, unmount } = await renderHook(() => useWalletData());
      await waitFor(() => expect(result.current.synced).toBe(true));
      const reads = balance.mock.calls.length;
      await unmount();
      await act(async () => listened.resolve(stop));
      expect(stop).toHaveBeenCalledTimes(1);
      expect(balance).toHaveBeenCalledTimes(reads);
    });

    it("reads again every WALLET_REFRESH_MS when it cannot listen, the journal told", async () => {
      jest.useFakeTimers();
      const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
      try {
        const failure = new WalletError("requestFailed", "Could not listen to the wallet");
        watch.mockRejectedValue(failure);
        balance.mockResolvedValue(BigInt(100));
        const { result } = await renderHook(() => useWalletData());
        await waitFor(() => expect(result.current.synced).toBe(true));
        await act(async () => undefined);
        expect(warn).toHaveBeenCalledWith("Listening to the wallet failed", failure);
        const reads = balance.mock.calls.length;

        balance.mockResolvedValue(BigInt(120));
        await act(async () => jest.advanceTimersByTime(WALLET_REFRESH_MS));
        await waitFor(() => expect(result.current.data?.balanceSats).toBe(BigInt(120)));
        expect(balance).toHaveBeenCalledTimes(reads + 1);
        await act(async () => jest.advanceTimersByTime(WALLET_REFRESH_MS));
        expect(balance).toHaveBeenCalledTimes(reads + 2);
      } finally {
        warn.mockRestore();
      }
    });

    it("says nothing and reads on no timer when the wallet disconnected before it listened", async () => {
      jest.useFakeTimers();
      const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
      try {
        watch.mockRejectedValue(new WalletError("notConnected", "The wallet was disconnected"));
        balance.mockResolvedValue(BigInt(100));
        const { result } = await renderHook(() => useWalletData());
        await waitFor(() => expect(result.current.synced).toBe(true));
        await act(async () => undefined);
        const reads = balance.mock.calls.length;
        await act(async () => jest.advanceTimersByTime(4 * WALLET_REFRESH_MS));
        expect(balance).toHaveBeenCalledTimes(reads);
        expect(warn).not.toHaveBeenCalled();
      } finally {
        warn.mockRestore();
      }
    });
  });
});
