import { describe, expect, it } from "@jest/globals";
import { parseActivationLink } from "./parseActivationLink";

const activationKey = "8352a38d554440199b2f0898c5c6a844";

describe("parseActivationLink", () => {
  it("accepts an activation link without parameters", () => {
    expect(
      parseActivationLink(
        `https://app.swiss-bitcoin-pay.ch/connect/${activationKey}`
      )
    ).toEqual({
      activationKey,
      deviceName: undefined,
      hmac: undefined,
      isGuest: false
    });
  });

  // React Native's `URL` returns this path with a trailing `/`.
  it("tolerates a trailing `/` after the key", () => {
    expect(
      parseActivationLink(
        `https://app.swiss-bitcoin-pay.ch/connect/${activationKey}/`
      )?.activationKey
    ).toBe(activationKey);
  });

  it("accepts the legacy checkout domain", () => {
    expect(
      parseActivationLink(
        `https://checkout.swiss-bitcoin-pay.ch/connect/${activationKey}`
      )?.activationKey
    ).toBe(activationKey);
  });

  it("ignores whitespace and line breaks around the QR code value", () => {
    expect(
      parseActivationLink(
        ` https://app.swiss-bitcoin-pay.ch/connect/${activationKey}\n`
      )?.activationKey
    ).toBe(activationKey);
  });

  it("reads the deviceName, hmac and isGuest parameters", () => {
    expect(
      parseActivationLink(
        `https://app.swiss-bitcoin-pay.ch/connect/${activationKey}/?deviceName=Caisse+1%20bis&hmac=abc%3D%3D&isGuest`
      )
    ).toEqual({
      activationKey,
      deviceName: "Caisse 1 bis",
      hmac: "abc==",
      isGuest: true
    });
  });

  it("keeps an unencoded `=` in a parameter value", () => {
    expect(
      parseActivationLink(
        `https://app.swiss-bitcoin-pay.ch/connect/${activationKey}?hmac=abc==`
      )?.hmac
    ).toBe("abc==");
  });

  it("ignores the fragment", () => {
    expect(
      parseActivationLink(
        `https://app.swiss-bitcoin-pay.ch/connect/${activationKey}?deviceName=Caisse#isGuest`
      )
    ).toEqual({
      activationKey,
      deviceName: "Caisse",
      hmac: undefined,
      isGuest: false
    });
  });

  it.each([
    ["empty segment", "https://app.swiss-bitcoin-pay.ch/connect/"],
    ["no segment", "https://app.swiss-bitcoin-pay.ch/connect"],
    [
      "sub-path",
      `https://app.swiss-bitcoin-pay.ch/connect/${activationKey}/extra`
    ],
    ["other route", `https://app.swiss-bitcoin-pay.ch/invoice/${activationKey}`],
    ["unknown domain", `https://evil.example.com/connect/${activationKey}`],
    [
      "suffixed domain",
      `https://app.swiss-bitcoin-pay.ch.evil.com/connect/${activationKey}`
    ],
    [
      "credentials in the URL",
      `https://app.swiss-bitcoin-pay.ch@evil.com/connect/${activationKey}`
    ],
    ["bare key", activationKey],
    ["invalid encoding", "https://app.swiss-bitcoin-pay.ch/connect/%E0%A4%A"]
  ])("rejects an invalid link (%s)", (_, value) => {
    expect(parseActivationLink(value)).toBeUndefined();
  });
});
