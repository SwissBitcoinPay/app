import { act, renderHook } from "@testing-library/react-native";

import {
  accountRecord,
  loadAccountRecord,
  saveAccountRecord,
  useAccountRecord
} from "@/features/terminal/account-record";
import type { OwnerTerminalProfile } from "@/lib/terminal/model";

const WALLET = "02c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5";
const OTHER = "02f9308a019258c31049344f85f89d5229b531c845836f99b08601f113bce036f9";

const profile: OwnerTerminalProfile = {
  version: 2,
  walletId: WALLET,
  backupKey: "5f".repeat(32),
  lightningAddress: "sattleme02c6047f94@breez.tips",
  businessName: "Bakery 1a2b",
  currency: "CHF"
};

type Stored = { account: string; value: number } | null;

/** A record kept in memory, as the device's storage keeps one. */
function memoryRecord() {
  let stored: Stored = null;
  const write = jest.fn(async (account: string, value: number) => {
    stored = { account, value };
  });
  const record = accountRecord<number>({
    read: async () => stored,
    write,
    same: (a, b) => a === b
  });
  return { record, write };
}

describe("records kept per account (account-record.ts)", () => {
  it("saves a value only when it changes, and gives none for another account", async () => {
    const { record, write } = memoryRecord();
    await expect(loadAccountRecord(record, profile)).resolves.toBeNull();

    await saveAccountRecord(record, WALLET, 1);
    await saveAccountRecord(record, WALLET, 1);
    expect(write).toHaveBeenCalledTimes(1);
    await expect(loadAccountRecord(record, profile)).resolves.toBe(1);

    await saveAccountRecord(record, OTHER, 1);
    expect(write).toHaveBeenCalledTimes(2);
    await expect(loadAccountRecord(record, profile)).resolves.toBeNull();
  });

  it("reads it again for the screens after each save", async () => {
    const { record } = memoryRecord();
    const { result } = await renderHook(() => useAccountRecord(record, profile));
    // None saved: null.
    expect(result.current).toBeNull();

    await act(() => saveAccountRecord(record, WALLET, 7));
    expect(result.current).toBe(7);
  });

  it("keeps the latest read when an earlier one answers last", async () => {
    const answers: ((stored: Stored) => void)[] = [];
    const record = accountRecord<number>({
      read: () => new Promise<Stored>((resolve) => answers.push(resolve)),
      write: async () => undefined,
      same: (a, b) => a === b
    });
    const { result } = await renderHook(() => useAccountRecord(record, profile));
    // Undefined while it is read.
    expect(answers).toHaveLength(1);
    expect(result.current).toBeUndefined();
    // A save meanwhile: the screen reads the record again.
    await act(async () => {
      for (const listener of record.listeners) listener();
    });
    expect(answers).toHaveLength(2);

    await act(async () => answers[1]({ account: WALLET, value: 2 }));
    expect(result.current).toBe(2);
    // The first read answers last, with the value from before the save: it no longer counts.
    await act(async () => answers[0]({ account: WALLET, value: 1 }));
    expect(result.current).toBe(2);
  });
});
