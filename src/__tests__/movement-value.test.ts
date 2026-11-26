import { parseMovementValue } from "@/lib/card/movement-value";

/*
 * What a card's movement was worth when it happened: kept with it,
 * checked whole wherever it is read (the phone's log, the account's relays).
 */

const VALUE = { minor: 2540, digits: 2, currency: "CHF", hour: 1_792_054_800 };

describe("a movement's value", () => {
  it("is read back as written, or none", () => {
    expect(parseMovementValue(VALUE)).toEqual(VALUE);
    expect(parseMovementValue({ ...VALUE, minor: 0, digits: 0, currency: "JPY" })).toEqual({
      ...VALUE,
      minor: 0,
      digits: 0,
      currency: "JPY"
    });
    expect(parseMovementValue({ ...VALUE, more: true })).toEqual(VALUE);
    expect(parseMovementValue(null)).toBeNull();
  });

  it("is out of shape for anything but whole minor units of a fiat currency at an hour's point", () => {
    for (const wrong of [
      undefined,
      "25,40 CHF",
      [VALUE],
      { ...VALUE, minor: 25.4 },
      { ...VALUE, minor: -1 },
      { ...VALUE, minor: Number.MAX_SAFE_INTEGER + 1 },
      { ...VALUE, minor: "2540" },
      { ...VALUE, digits: -1 },
      { ...VALUE, digits: 1.5 },
      { ...VALUE, digits: 5 },
      { ...VALUE, currency: "chf" },
      { ...VALUE, currency: "BTC" },
      { ...VALUE, currency: "CHFF" },
      { ...VALUE, hour: VALUE.hour + 60 },
      { ...VALUE, hour: -3600 }
    ]) {
      expect(parseMovementValue(wrong)).toBeUndefined();
    }
  });
});
