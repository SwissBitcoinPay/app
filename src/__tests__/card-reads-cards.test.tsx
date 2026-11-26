import { act, renderHook } from "@testing-library/react-native";
import { Platform } from "react-native";

import { readsCards, resetReadsCards, useReadsCards } from "@/features/card/useReadsCards";

import type * as NfcFake from "../../jest/nfc-manager";

// eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories are synchronous
jest.mock("react-native-nfc-manager", () => require("../../jest/nfc-manager"));
const nfc = jest.requireMock<typeof NfcFake>("react-native-nfc-manager");

beforeEach(() => {
  nfc.resetNfcManager();
});

describe("whether this device reads cards (useReadsCards.ts)", () => {
  it("is a device with NFC, on or off: off, its steps say to turn it on", async () => {
    nfc.turnNfcOff();
    await expect(readsCards()).resolves.toBe(true);
  });

  it("is not a device without NFC (an iPad), and asks once: NFC does not come and go", async () => {
    nfc.removeNfc();
    await expect(readsCards()).resolves.toBe(false);
    const asked = jest.spyOn(jest.requireMock("react-native-nfc-manager").default, "isSupported");
    await expect(readsCards()).resolves.toBe(false);
    expect(asked).not.toHaveBeenCalled();
    resetReadsCards();
    nfc.resetNfcManager();
    await expect(readsCards()).resolves.toBe(true);
  });

  it("says not known until asked, then what was asked, at once for the next ones", async () => {
    nfc.removeNfc();
    const first: (boolean | null)[] = [];
    await renderHook(() => {
      const reads = useReadsCards();
      first.push(reads);
      return reads;
    });
    await act(async () => {
      await readsCards();
    });
    expect(first[0]).toBeNull();
    expect(first.at(-1)).toBe(false);
    const next: (boolean | null)[] = [];
    await renderHook(() => {
      const reads = useReadsCards();
      next.push(reads);
      return reads;
    });
    expect(next).toEqual([false]);
  });

  it("is never the web app, said at once", async () => {
    const web = jest.replaceProperty(Platform, "OS", "web");
    try {
      const { result } = await renderHook(() => useReadsCards());
      expect(result.current).toBe(false);
    } finally {
      web.restore();
    }
  });

  it('is never the web app when asked, without asking NFC ("Manage my BoltCard")', async () => {
    const asked = jest.spyOn(jest.requireMock("react-native-nfc-manager").default, "isSupported");
    const web = jest.replaceProperty(Platform, "OS", "web");
    try {
      await expect(readsCards()).resolves.toBe(false);
      expect(asked).not.toHaveBeenCalled();
    } finally {
      web.restore();
      asked.mockRestore();
    }
    // Nothing kept of it: the app asks its own NFC.
    await expect(readsCards()).resolves.toBe(true);
  });
});
