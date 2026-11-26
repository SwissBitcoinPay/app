import { act, renderHook, waitFor } from "@testing-library/react-native";

import {
  amountUnitChoice,
  resetAmountUnit,
  saveAmountUnit,
  useAmountUnit,
  useAmountUnitChoice
} from "@/features/settings/amount-unit";
import {
  AMOUNT_UNIT_KEY,
  parseAmountUnit,
  serializeAmountUnit
} from "@/features/settings/amount-unit-format";
import { wipeDevice } from "@/features/settings/device-wipe";
import { readLog } from "@/lib/log/log";

import type * as SecureStoreFake from "../../jest/expo-secure-store";

/*
 * "Currency shown first" (settings/amount-unit.ts): this
 * device's choice of what the lists of movements write first, the display currency by default.
 */

const secureStore = jest.requireMock<typeof SecureStoreFake>("expo-secure-store");

describe('"Currency shown first"', () => {
  it("is stored under a key installed apps keep, in a versioned record", () => {
    // IRREVERSIBLE: installed apps keep the choice there.
    expect(AMOUNT_UNIT_KEY).toBe("amount-unit");
    expect(serializeAmountUnit("sats")).toBe('{"version":1,"unit":"sats"}');
    expect(parseAmountUnit(serializeAmountUnit("fiat"))).toBe("fiat");
    expect(parseAmountUnit(serializeAmountUnit("sats"))).toBe("sats");
  });

  it("reads nothing it does not know: absent, damaged, another unit, a newer format", () => {
    expect(parseAmountUnit(null)).toBeNull();
    expect(parseAmountUnit("{")).toBeNull();
    expect(parseAmountUnit("null")).toBeNull();
    expect(parseAmountUnit('{"version":1,"unit":"btc"}')).toBeNull();
    expect(parseAmountUnit('{"version":2,"unit":"sats"}')).toBeNull();
  });

  it("writes the display currency first by default, while nothing is chosen", async () => {
    const { result } = await renderHook(() => ({
      unit: useAmountUnit(),
      choice: useAmountUnitChoice()
    }));
    // Not read yet: the default meanwhile; read, nothing stored: the default.
    expect(result.current.unit).toBe("fiat");
    await waitFor(() => expect(result.current.choice).toBe("fiat"));
    expect(result.current.unit).toBe("fiat");
  });

  it("reads the choice stored on the device", async () => {
    secureStore.items.set(AMOUNT_UNIT_KEY, serializeAmountUnit("sats"));
    const { result } = await renderHook(() => useAmountUnitChoice());
    await waitFor(() => expect(result.current).toBe("sats"));
  });

  it("keeps the default when the stored choice cannot be read, and says so in the journal", async () => {
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    secureStore.getItemAsync.mockRejectedValueOnce(new Error("Keychain unavailable"));
    const { result } = await renderHook(() => useAmountUnitChoice());
    await waitFor(() => expect(result.current).toBe("fiat"));
    expect(readLog().entries.map((entry) => entry.event)).toContain(
      "Reading the amounts' unit failed"
    );
  });

  it("saves a choice, then tells every screen that follows it", async () => {
    const { result } = await renderHook(() => useAmountUnit());
    await waitFor(() => expect(amountUnitChoice()).toBe("fiat"));
    await act(async () => saveAmountUnit("sats"));
    expect(result.current).toBe("sats");
    expect(parseAmountUnit(secureStore.items.get(AMOUNT_UNIT_KEY) ?? null)).toBe("sats");
  });

  it("changes nothing when the choice could not be saved", async () => {
    const { result } = await renderHook(() => useAmountUnit());
    await waitFor(() => expect(amountUnitChoice()).toBe("fiat"));
    secureStore.setItemAsync.mockRejectedValueOnce(new Error("Keychain unavailable"));
    await expect(saveAmountUnit("sats")).rejects.toThrow("Keychain unavailable");
    expect(result.current).toBe("fiat");
    expect(secureStore.items.has(AMOUNT_UNIT_KEY)).toBe(false);
  });

  it("stands over a read still under way with the choice saved meanwhile", async () => {
    secureStore.items.set(AMOUNT_UNIT_KEY, serializeAmountUnit("fiat"));
    let release = () => {};
    secureStore.getItemAsync.mockImplementationOnce(
      (key: string) =>
        new Promise((resolve) => {
          release = () => resolve(secureStore.items.get(key) ?? null);
        })
    );
    const { result } = await renderHook(() => useAmountUnitChoice());
    await act(async () => saveAmountUnit("sats"));
    await act(async () => release());
    expect(result.current).toBe("sats");
  });

  it('goes with "Log out": its key removed, the default again', async () => {
    const { result } = await renderHook(() => useAmountUnit());
    await waitFor(() => expect(amountUnitChoice()).toBe("fiat"));
    await act(async () => saveAmountUnit("sats"));
    expect(result.current).toBe("sats");
    await act(async () => wipeDevice());
    expect(secureStore.items.has(AMOUNT_UNIT_KEY)).toBe(false);
    await waitFor(() => expect(amountUnitChoice()).toBe("fiat"));
    expect(result.current).toBe("fiat");
  });

  it("never applies a read begun before a reset", async () => {
    secureStore.items.set(AMOUNT_UNIT_KEY, serializeAmountUnit("sats"));
    let release = () => {};
    secureStore.getItemAsync.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve(serializeAmountUnit("sats"));
        })
    );
    const { result } = await renderHook(() => useAmountUnitChoice());
    // The device wiped while the first read ran: read again, nothing stored any more.
    secureStore.items.clear();
    await act(async () => resetAmountUnit());
    await waitFor(() => expect(result.current).toBe("fiat"));
    await act(async () => release());
    expect(result.current).toBe("fiat");
  });
});
