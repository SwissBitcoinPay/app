import {
  clockOffsetSeconds,
  expectedInvoiceDate,
  invoiceRequestDelayMs,
  issuerSeconds,
  nowUnix,
  observeInvoiceDate,
  resetClock,
  subscribeClock
} from "@/lib/clock";

/** 2026-10-04 10:06:23 UTC, in milliseconds. */
const T = 1_791_108_383_000;
const S = T / 1000;

describe("clock", () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: T });
    resetClock();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("keeps this device's clock while an invoice's date fits it", () => {
    // A measured exchange: sent at 10:06:23.341, answered at 10:06:24.436, dated 10:06:23.
    expect(observeInvoiceDate(S, T + 341, T + 1436)).toBe(false);
    expect(clockOffsetSeconds()).toBe(0);
    expect(nowUnix()).toBe(S);
  });

  it("takes the issuer's time from a date that does not fit it, within the request's bounds", () => {
    // Dated 20 s before the request was sent: this device is about 20 s ahead.
    const listener = jest.fn();
    const unsubscribe = subscribeClock(listener);
    expect(observeInvoiceDate(S - 20, T, T + 800)).toBe(true);
    // Between dated - received (-20.8 s) and dated + 1 - sent (-19 s): their middle.
    expect(clockOffsetSeconds()).toBeCloseTo(-19.9);
    expect(nowUnix()).toBe(S - 20);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();

    // Behind instead, the clock set since: bounds that do not meet the earlier ones start over.
    expect(observeInvoiceDate(S + 240, T + 60_000, T + 60_000)).toBe(true);
    expect(clockOffsetSeconds()).toBeCloseTo(180.5);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("narrows the bounds invoice after invoice, and predicts the next date within them", () => {
    // Dated 10:06:23 for a request from 10:06:23.0 to .8: offset in [-0.8, +1].
    observeInvoiceDate(S, T, T + 800);
    // Dated 10:06:31 for a request from 10:06:30.6 to .8: offset in [+0.2, +1.4]; with the first,
    // [+0.2, +1]. The correction (0) is out of them: their middle, 0.6.
    expect(observeInvoiceDate(S + 8, T + 7600, T + 7800)).toBe(true);
    expect(clockOffsetSeconds()).toBeCloseTo(0.6);
    // A request sent at 10:06:40.0 is dated at 10:06:40.0 + 0.6 + 0.1 (half its round trip).
    expect(expectedInvoiceDate(T + 17_000)).toBe(S + 17);
    expect(expectedInvoiceDate(T + 17_400)).toBe(S + 18);
  });

  it("asks an invoice when its issuer dates it in the middle of a second", () => {
    // No invoice yet: this device's clock, from 10:06:23.000 to .5.
    expect(invoiceRequestDelayMs(T)).toBe(500);
    expect(invoiceRequestDelayMs(T + 500)).toBe(0);
    expect(invoiceRequestDelayMs(T + 700)).toBe(800);
    // Offset in [0, +1.4], then in [-1.2, +0.2]: in [0, +0.2], 0.1 at best. Round trips of 0.4 s:
    // dated 0.2 s after its sending. Sent at 10:06:23.2, it is dated at 10:06:23.5 there.
    observeInvoiceDate(S, T - 400, T);
    observeInvoiceDate(S + 1, T + 1800, T + 2200);
    expect(invoiceRequestDelayMs(T)).toBe(200);
  });

  it("gives a moment of this device's clock in the issuer's seconds", () => {
    expect(issuerSeconds(T + 999, 0)).toBe(S);
    expect(issuerSeconds(T + 999, -20)).toBe(S - 20);
    expect(issuerSeconds(T, 0.5)).toBe(S);
  });

  it("ignores what cannot bound the offset", () => {
    expect(observeInvoiceDate(Number.NaN, T, T)).toBe(false);
    expect(observeInvoiceDate(S + 600, T + 10, T)).toBe(false);
    expect(clockOffsetSeconds()).toBe(0);
  });
});
