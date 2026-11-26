import { act, renderHook, waitFor } from "@testing-library/react-native";

import { useRate } from "@/features/terminal/useRate";
import {
  RATE_RETRY_INTERVAL_SEC,
  RATE_RETRY_SOON_SEC,
  type RateSnapshot
} from "@/lib/rates/snapshot";
import { HOUR_SECONDS, pointEnd } from "@/lib/rates/sources";

/** 2026-10-03 16:00:00 UTC, and 16:10, in the period of its point (16:05 to 17:05). */
const H = 1_791_043_200;
const T0 = H + 600;

const point = (hour: number, rate: number, currency = "CHF"): RateSnapshot => ({
  hour,
  currency,
  source: "coingecko",
  rate
});

const mockUpdate = jest.fn<Promise<RateSnapshot | null>, []>();
jest.mock("@/lib/rates/snapshot", () => ({
  ...jest.requireActual("@/lib/rates/snapshot"),
  createRateStore: () => ({ update: mockUpdate })
}));

describe("useRate", () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: T0 * 1000 });
    mockUpdate.mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("never gives the point of an ended period to fix an amount, even before the screen shows it", async () => {
    mockUpdate.mockResolvedValueOnce(point(H, 50000)).mockResolvedValue(null);
    const { result } = await renderHook(() => useRate("CHF"));
    await waitFor(() => expect(result.current.rate).toBe(50000));
    expect(result.current.hour).toBe(H);
    expect(result.current.current()).toBe(50000);

    // 17:05, before the freshness tick re-renders: the last render still shows the rate.
    jest.setSystemTime(pointEnd(H) * 1000);
    expect(result.current.rate).toBe(50000);
    let fixedWith: number | undefined = 0;
    await act(async () => {
      fixedWith = result.current.current();
    });
    expect(fixedWith).toBeUndefined();
    // And the screen shows it at once.
    expect(result.current.rate).toBeUndefined();
    expect(result.current.hour).toBeUndefined();
  });

  it("reads the next point at HH:05, then every 15 s until it is published", async () => {
    mockUpdate
      .mockResolvedValueOnce(point(H, 50000))
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(point(H + HOUR_SECONDS, 51000));
    const { result } = await renderHook(() => useRate("CHF"));
    await waitFor(() => expect(result.current.rate).toBe(50000));
    expect(mockUpdate).toHaveBeenCalledTimes(1);

    // Nothing more during its period, nor at 17:00.
    await act(async () => {
      jest.advanceTimersByTime((pointEnd(H) - T0 - 1) * 1000);
    });
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(result.current.rate).toBe(50000);

    // At 17:05: the point of 17:00 is late, an outage.
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    expect(mockUpdate).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(result.current.rate).toBeUndefined());

    // 15 s later: there.
    await act(async () => {
      jest.advanceTimersByTime(RATE_RETRY_SOON_SEC * 1000);
    });
    expect(mockUpdate).toHaveBeenCalledTimes(3);
    await waitFor(() => expect(result.current.rate).toBe(51000));
    expect(result.current.hour).toBe(H + HOUR_SECONDS);
  });

  it("asks again every minute while the source fails", async () => {
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    mockUpdate.mockRejectedValueOnce(new Error("Offline")).mockResolvedValue(point(H, 50000));
    const { result } = await renderHook(() => useRate("CHF"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.rate).toBeUndefined();
    await act(async () => {
      jest.advanceTimersByTime(RATE_RETRY_INTERVAL_SEC * 1000);
    });
    await waitFor(() => expect(result.current.rate).toBe(50000));
  });

  it("is loading again for another currency, never priced with the point of the former", async () => {
    let answerEur: (snapshot: RateSnapshot) => void = () => undefined;
    mockUpdate.mockResolvedValueOnce(point(H, 50000)).mockReturnValueOnce(
      new Promise<RateSnapshot>((resolve) => {
        answerEur = resolve;
      })
    );
    const { result, rerender } = await renderHook(
      ({ currency }: { currency: string }) => useRate(currency),
      { initialProps: { currency: "CHF" } }
    );
    await waitFor(() => expect(result.current.rate).toBe(50000));
    expect(result.current.loading).toBe(false);

    // "Settings": the point of sale's currency changes, its provider stays mounted.
    await rerender({ currency: "EUR" });
    // Its first read has not answered: not an outage yet, and no amount can be fixed.
    expect(result.current.loading).toBe(true);
    expect(result.current.rate).toBeUndefined();
    expect(result.current.current()).toBeUndefined();

    await act(async () => answerEur(point(H, 46000, "EUR")));
    await waitFor(() => expect(result.current.rate).toBe(46000));
    expect(result.current.loading).toBe(false);
    expect(result.current.hour).toBe(H);
  });
});
