import {
  dayListedWhole,
  dayNet,
  dayNetText,
  localDayStart,
  type NetPart
} from "@/features/activity/day-net";
import { rowNetPart } from "@/features/card/history-format";
import type { CardHistoryRow } from "@/features/card/history-view";
import type { CardMovement, UnidentifiedMovement } from "@/lib/card/card-movement";
import type { CardPaymentEntry } from "@/lib/card/payment-entry";

const CHF = (minor: number) => ({ minor: BigInt(minor), digits: 2, currency: "CHF" });
const part = (way: "in" | "out", sats: number, value: NetPart["value"]): NetPart => ({
  way,
  sats: BigInt(sats),
  value
});

describe("a day's net", () => {
  it("adds what came in and takes what left, in the display currency when each has a value", () => {
    expect(dayNet([part("in", 27_700, CHF(2450)), part("in", 56_530, CHF(5000))], "fiat")).toEqual({
      unit: "fiat",
      minor: 7450n,
      digits: 2,
      currency: "CHF"
    });
    expect(
      dayNet([part("in", 10_060, CHF(890)), part("out", 226_120, CHF(20_000))], "fiat")
    ).toEqual({ unit: "fiat", minor: -19_110n, digits: 2, currency: "CHF" });
  });

  it("adds sats when they are chosen, or when a value is missing or in another currency", () => {
    const parts = [part("in", 27_700, CHF(2450)), part("out", 3_400, CHF(301))];
    expect(dayNet(parts, "sats")).toEqual({ unit: "sats", sats: 24_300n });
    expect(dayNet([...parts, part("in", 100, null)], "fiat")).toEqual({
      unit: "sats",
      sats: 24_400n
    });
    expect(
      dayNet([...parts, part("out", 2_000, { minor: 289n, digits: 2, currency: "EUR" })], "fiat")
    ).toEqual({ unit: "sats", sats: 22_300n });
    // The same code with other decimals is not the same unit either.
    expect(
      dayNet([part("in", 1_000, CHF(100)), part("in", 1_000, { ...CHF(1), digits: 0 })], "fiat")
    ).toEqual({ unit: "sats", sats: 2_000n });
  });

  it("tells none for a day without anything proven", () => {
    expect(dayNet([], "fiat")).toBeNull();
    expect(dayNet([], "sats")).toBeNull();
  });

  it('writes the net signed "+" or "−", never a sign for nothing', () => {
    expect(dayNetText({ unit: "fiat", minor: 7450n, digits: 2, currency: "CHF" }, "fr-CH")).toMatch(
      /^\+74.50 CHF$/
    );
    expect(
      dayNetText({ unit: "fiat", minor: -19_110n, digits: 2, currency: "CHF" }, "fr-CH")
    ).toMatch(/^−191.10 CHF$/);
    expect(dayNetText({ unit: "fiat", minor: 0n, digits: 2, currency: "CHF" }, "fr-CH")).toMatch(
      /^0.00 CHF$/
    );
    expect(dayNetText({ unit: "sats", sats: 84_230n }, "de-CH")).toMatch(/^\+84.230 sats$/);
    expect(dayNetText({ unit: "sats", sats: -3_400n }, "de-CH")).toMatch(/^−3.400 sats$/);
    expect(dayNetText({ unit: "sats", sats: 0n }, "de-CH")).toBe("0 sats");
  });

  it("knows a day whole only from when the list holds every movement", () => {
    const start = localDayStart(new Date(2026, 9, 28, 14, 32).getTime());
    expect(start).toBe(new Date(2026, 9, 28).getTime());
    expect(dayListedWhole(start, start)).toBe(true);
    expect(dayListedWhole(start, 0)).toBe(true);
    // A day begun before the list's horizon shows in part.
    expect(dayListedWhole(start, start + 1)).toBe(false);
    // Nothing known whole (a list still read, or read in part).
    expect(dayListedWhole(start, null)).toBe(false);
  });
});

describe("what a card's row adds to its day's net", () => {
  const VALUE = { minor: 289, digits: 2, currency: "CHF", hour: 1_793_000_000 };
  const entry = (fields: Partial<CardPaymentEntry>): CardPaymentEntry => ({
    id: "a1",
    cardId: "0123456789abcdef0123456789abcdef",
    walletGeneration: 1,
    at: 1_793_000_000_000,
    amountSats: 3_400n,
    paymentHash: "a1".padStart(64, "0"),
    description: "Coffee Shop",
    outcome: "sent",
    reason: null,
    pr: "lnbc1",
    payee: null,
    preimage: null,
    value: VALUE,
    ...fields
  });
  const tap = (fields: Partial<CardPaymentEntry>): CardHistoryRow => ({
    kind: "tap",
    key: "t/a1",
    at: 1_793_000_000_000,
    entry: entry(fields)
  });
  const movement = (fields: Partial<CardMovement>): CardHistoryRow => ({
    kind: "movement",
    key: "m/r1",
    at: 1_793_000_000_000,
    movement: {
      id: "r1",
      cardId: "0123456789abcdef0123456789abcdef",
      walletGeneration: 1,
      kind: "recharge",
      way: "main",
      at: 1_793_000_000_000,
      amountSats: 20_000n,
      feeSats: 0n,
      txid: null,
      description: null,
      value: null,
      ...fields
    }
  });
  const unidentified = (direction: UnidentifiedMovement["direction"]): CardHistoryRow => ({
    kind: "unidentified",
    key: "u/x",
    at: 1_793_000_000_000,
    movement: {
      kind: "unidentified",
      id: "x",
      cardId: "0123456789abcdef0123456789abcdef",
      walletGeneration: 1,
      direction,
      at: 1_793_000_000_000,
      amountSats: 21_000n
    }
  });

  it("counts a payment sent, with its value as kept", () => {
    expect(rowNetPart(tap({}))).toEqual({ way: "out", sats: 3_400n, value: CHF(289) });
    expect(rowNetPart(tap({ value: null }))).toEqual({ way: "out", sats: 3_400n, value: null });
  });

  it("never counts a payment refused, failed, being sent or uncertain", () => {
    for (const outcome of ["declined", "failed", "sending", "uncertain"] as const) {
      expect(rowNetPart(tap({ outcome }))).toBeNull();
    }
  });

  it("counts a recharge in, a return out, and what the SDK cannot tell by its way, without value", () => {
    expect(rowNetPart(movement({ value: VALUE }))).toEqual({
      way: "in",
      sats: 20_000n,
      value: CHF(289)
    });
    expect(rowNetPart(movement({ kind: "return", way: null }))).toEqual({
      way: "out",
      sats: 20_000n,
      value: null
    });
    expect(rowNetPart(unidentified("receive"))).toEqual({ way: "in", sats: 21_000n, value: null });
    expect(rowNetPart(unidentified("send"))).toEqual({ way: "out", sats: 21_000n, value: null });
  });

  it("counts a withdrawal to another wallet out, as a return: it left the card", () => {
    expect(rowNetPart(movement({ kind: "withdrawal", way: "address", value: VALUE }))).toEqual({
      way: "out",
      sats: 20_000n,
      value: CHF(289)
    });
  });

  it("counts a row of the card's v2 history by its way, with its value as its copy kept it", () => {
    const legacy = (kind: "payment" | "recharge"): CardHistoryRow => ({
      kind: "legacy",
      key: "l/x",
      at: 1_793_000_000_000,
      row: {
        ref: "a".repeat(64),
        kind,
        at: 1_793_000_000,
        sats: 2_500n,
        feeMsat: 1_000n,
        value: { minor: 168, digits: 2, currency: "CHF" },
        note: ""
      }
    });
    expect(rowNetPart(legacy("payment"))).toEqual({ way: "out", sats: 2_500n, value: CHF(168) });
    expect(rowNetPart(legacy("recharge"))).toEqual({ way: "in", sats: 2_500n, value: CHF(168) });
  });
});
