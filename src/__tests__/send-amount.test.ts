import {
  convertAmountText,
  fiatPlaceholder,
  formatSats,
  parseFiatMinor,
  parseSats
} from "@/features/wallet/send/amount";
import { quoteRenewTime } from "@/features/wallet/send/useSend";
import { SendError, WalletError } from "@/lib/breez/errors";
import {
  checkFeesExcluded,
  checkNotExpired,
  checkQuotedAmount,
  invoiceSats,
  isCashtag,
  isLnurl,
  maxSendableSats,
  minSendableSats,
  normalizeSendInput,
  parseFailure
} from "@/lib/breez/send-input";
import type { PreparedSend, SendQuote } from "@/lib/breez/types";
import { randomUuid } from "@/lib/random";
import { fiatToSats } from "@/lib/terminal/amount";

import { encodeBech32, encodeLnurl } from "../../jest/lightning";

describe("parseFiatMinor", () => {
  it("reads francs with a comma or a dot, grouped or not, as integer cents", () => {
    expect(parseFiatMinor("142,20", 2)).toBe(14220);
    expect(parseFiatMinor("142.2", 2)).toBe(14220);
    expect(parseFiatMinor("1 217,74", 2)).toBe(121774);
    expect(parseFiatMinor("1'217.74", 2)).toBe(121774);
    expect(parseFiatMinor(",5", 2)).toBe(50);
    expect(parseFiatMinor("12", 2)).toBe(1200);
    expect(parseFiatMinor("500", 0)).toBe(500);
  });

  it("refuses what is not an amount, too many decimals, and more than the keypad's maximum", () => {
    for (const text of ["", ",", "abc", "1,2,3", "1.234", "-5", "1e3"]) {
      expect(parseFiatMinor(text, 2)).toBeNull();
    }
    expect(parseFiatMinor("5,5", 0)).toBeNull();
    expect(parseFiatMinor("99999,99", 2)).toBe(9_999_999);
    expect(parseFiatMinor("100000", 2)).toBeNull();
  });
});

describe("parseSats", () => {
  it("reads whole sats, grouped or not, up to 21 million bitcoins", () => {
    expect(parseSats("15000")).toBe(BigInt(15000));
    expect(parseSats("15 000")).toBe(BigInt(15000));
    expect(parseSats("2100000000000000")).toBe(BigInt("2100000000000000"));
    for (const text of ["", "1,5", "1.5", "-1", "2100000000000001"]) {
      expect(parseSats(text)).toBeNull();
    }
  });
});

describe("convertAmountText", () => {
  // 1 BTC = 100 000 CHF: 1 sat = 0,1 cent.
  const options = {
    digits: 2,
    languageTag: "fr-CH",
    rate: 100000,
    toSats: (minor: number) => fiatToSats(minor, 2, 100000)
  };

  it("turns francs into the sats they are sent as, rounded up, and sats into francs", () => {
    expect(convertAmountText("142,20", "fiat", options)).toBe("142200");
    expect(convertAmountText("0,01", "fiat", options)).toBe("10");
    expect(convertAmountText("142205", "sats", options)).toBe("142,21");
    expect(convertAmountText("", "sats", options)).toBe("");
    expect(convertAmountText("abc", "fiat", options)).toBe("");
  });

  it("writes the placeholder and sats in the device locale", () => {
    expect(fiatPlaceholder(2, "fr-CH")).toBe("0,00");
    expect(fiatPlaceholder(0, "fr-CH")).toBe("0");
    expect(formatSats(BigInt(1500), "en-US")).toBe("1,500 sats");
  });
});

describe("send input helpers", () => {
  it("cleans the text for the SDK", () => {
    expect(normalizeSendInput("  lightning:LNBC1 \n")).toBe("LNBC1");
    expect(normalizeSendInput("bakehouse@wallet.example")).toBe("bakehouse@wallet.example");
  });

  it("converts LNURL bounds and invoice amounts from millisats without rounding money", () => {
    expect(minSendableSats(BigInt(1001))).toBe(BigInt(2));
    expect(maxSendableSats(BigInt(1999))).toBe(BigInt(1));
    expect(invoiceSats(BigInt(25_000_000))).toBe(BigInt(25_000));
    expect(() => invoiceSats(BigInt(1500))).toThrow(SendError);
  });

  it("tells an unreachable Lightning address from text it does not know", () => {
    expect(parseFailure("a@b.example", new Error()).code).toBe("unreachable");
    expect(parseFailure("hello", new Error()).code).toBe("unrecognized");
  });

  it("tells an LNURL whose service did not answer as the SDK's parse tells an LNURL", () => {
    const lnurl = encodeLnurl("https://pay.example.com/lnurlp/bakehouse");
    // LUD-01, either case; LUD-17 schemes, with or without //, any case; LUD-01 inside a URL.
    for (const input of [
      lnurl,
      lnurl.toLowerCase(),
      "lnurlp://pay.example.com/lnurlp/bakehouse",
      "LNURLW:pay.example.com/withdraw",
      "keyauth://pay.example.com/auth?tag=login&k1=00",
      `https://shop.example.com/redeem?id=1&LIGHTNING=${lnurl}`,
      // An address's shape, but an LNURL.
      "lnurlp://bakehouse@pay.example.com/x"
    ]) {
      expect(isLnurl(input)).toBe(true);
      expect(parseFailure(input, new Error()).code).toBe("lnurlUnreachable");
    }
    // A bad checksum, another bech32 prefix, mixed case, an URL without an LNURL, lnurlc (not
    // resolved by the SDK): not an LNURL to it.
    const corrupt = lnurl.slice(0, -1) + (lnurl.endsWith("Q") ? "P" : "Q");
    for (const input of [
      corrupt,
      encodeBech32("lnbc", [1, 2, 3, 4, 5, 6, 7, 8]),
      lnurl.slice(0, 20) + lnurl.slice(20).toLowerCase(),
      "https://shop.example.com/redeem?id=1",
      "https://shop.example.com/redeem?lightning=",
      "lnurlc://pay.example.com/channel"
    ]) {
      expect(isLnurl(input)).toBe(false);
      expect(parseFailure(input, new Error()).code).toBe("unrecognized");
    }
  });

  it("tells a cashtag, which the SDK would resolve at cash.app, from anything else", () => {
    for (const input of ["$alice", "$alice@cash.app", "$Alice@CASH.APP", "$", "$1"]) {
      expect(isCashtag(input)).toBe(true);
    }
    for (const input of ["alice@cash.app", "alice", "lnbc1", "bc1q", "₿alice@example.com"]) {
      expect(isCashtag(input)).toBe(false);
    }
  });

  it("refuses an expired invoice", () => {
    expect(() => checkNotExpired(100, 100)).toThrow(SendError);
    expect(() => checkNotExpired(101, 100)).not.toThrow();
  });

  it("refuses a quote for another amount than the invoice's or the one asked", () => {
    const quote = (amountSats: bigint): SendQuote => ({
      kind: "bolt11",
      amountSats,
      fees: { onchain: false, feeSats: BigInt(1) },
      expiresAt: null,
      prepared: {} as PreparedSend
    });
    const invoice = {
      kind: "bolt11" as const,
      request: "lnbc",
      amountSats: BigInt(500),
      expiresAt: 0
    };
    expect(() => checkQuotedAmount(quote(BigInt(500)), invoice, null)).not.toThrow();
    expect(() => checkQuotedAmount(quote(BigInt(501)), invoice, null)).toThrow(WalletError);
    const open = { ...invoice, amountSats: null };
    expect(() => checkQuotedAmount(quote(BigInt(700)), open, BigInt(700))).not.toThrow();
    expect(() => checkQuotedAmount(quote(BigInt(700)), open, BigInt(699))).toThrow(WalletError);
    expect(() => checkQuotedAmount(quote(BigInt(0)), open, BigInt(0))).toThrow(WalletError);
  });

  it("refuses a quote whose fees would come out of the amount", () => {
    expect(() => checkFeesExcluded(true)).not.toThrow();
    expect(() => checkFeesExcluded(false)).toThrow();
  });
});

describe("quoteRenewTime", () => {
  const now = 1_700_000_000_000;
  it("renews a quote 30 s before its end, never sooner than a minute after it came", () => {
    expect(quoteRenewTime({ expiresAt: null }, now)).toBeNull();
    expect(quoteRenewTime({ expiresAt: now / 1000 + 600 }, now)).toBe(now + 570_000);
    // A short quote, or a device clock past its end: a minute, not again and again.
    expect(quoteRenewTime({ expiresAt: now / 1000 + 45 }, now)).toBe(now + 60_000);
    expect(quoteRenewTime({ expiresAt: now / 1000 - 3600 }, now)).toBe(now + 60_000);
  });
});

describe("randomUuid", () => {
  it("is a version 4 UUID, a new one each time", () => {
    const first = randomUuid();
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(randomUuid()).not.toBe(first);
  });
});
