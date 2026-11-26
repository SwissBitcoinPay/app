import { redirectSystemPath } from "@/app/+native-intent";
import { LEGACY_CARD_LINK_HOST } from "@/config/card";
import type { CardState } from "@/lib/card/card-record";
import {
  cardOfPrintedNumber,
  isLegacyCardLinkHost,
  legacyCardLinkNumber,
  printedCardHref,
  printedScanOf
} from "@/lib/card/legacy-link";

/** The link printed on a v2 card. */
const PRINTED = "https://sbpc.ch/1709-1248-5643-8482";
const NUMBER = "1709-1248-5643-8482";

/** A card of the account; `number`: the one printed on it (its issuer's visual), null for none. */
function cardOf(
  cardId: string,
  number: string | null,
  status: CardState["status"] = "active"
): CardState {
  return {
    cardId,
    uid: "04aabbccddeeff",
    keyVersion: 1,
    status,
    relayHost: "relay.sattle.me",
    lastCounter: 0,
    depositedThrough: 0,
    maxPaymentSats: 20_000n,
    maxDaySats: 50_000n,
    maxPaymentsPerHour: 5,
    suspended: false,
    name: "",
    look: null,
    issuer:
      number === null
        ? null
        : { image: { key: "11".repeat(32), hash: "22".repeat(32) }, number, white: false },
    settingsAt: 1,
    walletGeneration: 1,
    updatedAt: 1
  };
}

describe("the link printed on the v2 cards", () => {
  it("is on the host printed on them, for good", () => {
    expect(LEGACY_CARD_LINK_HOST).toBe("sbpc.ch");
  });

  it("names the card's printed number", () => {
    expect(legacyCardLinkNumber(PRINTED)).toBe(NUMBER);
    // Letters too, in any case, as the v2 server reserves the numbers (ISSUER_NUMBER).
    expect(legacyCardLinkNumber("https://sbpc.ch/abCD-1234-efgh-5678")).toBe("abCD-1234-efgh-5678");
    // The scheme and the host in capitals, as a QR code's alphanumeric mode holds them.
    expect(legacyCardLinkNumber("HTTPS://SBPC.CH/1709-1248-5643-8482")).toBe(NUMBER);
    // A query or a fragment, read by nothing.
    expect(legacyCardLinkNumber(`${PRINTED}?utm_source=card`)).toBe(NUMBER);
    expect(legacyCardLinkNumber(`${PRINTED}#top`)).toBe(NUMBER);
  });

  it("names no card for any other address, nor another host's dressed as it", () => {
    for (const url of [
      "http://sbpc.ch/1709-1248-5643-8482",
      "sattleme://sbpc.ch/1709-1248-5643-8482",
      "https://www.sbpc.ch/1709-1248-5643-8482",
      "https://sbpc.ch.other.example/1709-1248-5643-8482",
      "https://sbpc.ch@other.example/1709-1248-5643-8482",
      "https://other.example/sbpc.ch/1709-1248-5643-8482",
      "https://other.example/?https://sbpc.ch/1709-1248-5643-8482",
      "https://sbpc.ch:443/1709-1248-5643-8482",
      "https://sbpc.ch/1709-1248-5643-8482/",
      "https://sbpc.ch/1709-1248-5643-8482/more",
      "https://sbpc.ch/cards/1709-1248-5643-8482",
      "https://sbpc.ch/1709-1248-5643-848",
      "https://sbpc.ch/1709-1248-5643-84821",
      "https://sbpc.ch/1709124856438482",
      "https://sbpc.ch/1709_1248_5643_8482",
      "https://sbpc.ch/%31709-1248-5643-8482",
      "https://sbpc.ch/1709-1248-5643-8482?a b",
      " https://sbpc.ch/1709-1248-5643-8482",
      "https://sbpc.ch/1709-1248-5643-8482\n",
      "https://sbpc.ch/",
      "https://sbpc.ch",
      ""
    ]) {
      expect(legacyCardLinkNumber(url)).toBeNull();
    }
  });

  it("tells the addresses of its host, whatever their path, from another host's", () => {
    for (const url of [PRINTED, "https://sbpc.ch", "https://sbpc.ch/", "HTTPS://SBPC.CH/x?y#z"]) {
      expect(isLegacyCardLinkHost(url)).toBe(true);
    }
    for (const url of [
      "https://sbpc.ch.other.example/",
      "https://sbpc.ch@other.example/",
      "https://www.sbpc.ch/",
      "https://sbpc.chx/",
      "http://sbpc.ch/",
      "/cards"
    ]) {
      expect(isLegacyCardLinkHost(url)).toBe(false);
    }
  });

  it('opens "Cards" with the number and which scan it is', () => {
    expect(printedCardHref(NUMBER, 7)).toBe("/cards?printed=1709-1248-5643-8482&scan=7");
    expect(printedScanOf(NUMBER, "7")).toEqual({ number: NUMBER, scan: "7" });
  });

  it('takes "Cards"\'s parameters only as the link gives them: any app can open its address', () => {
    // A key given twice comes as a list (Expo Router's search parameters).
    expect(printedScanOf([NUMBER, NUMBER], "7")).toBeNull();
    expect(printedScanOf(NUMBER, ["7", "8"])).toBeNull();
    expect(printedScanOf(undefined, "7")).toBeNull();
    expect(printedScanOf(NUMBER, undefined)).toBeNull();
    expect(printedScanOf("1709-1248-5643", "7")).toBeNull();
    expect(printedScanOf(`${NUMBER} `, "7")).toBeNull();
    expect(printedScanOf(NUMBER, "")).toBeNull();
    expect(printedScanOf(NUMBER, "-1")).toBeNull();
    expect(printedScanOf(NUMBER, "1e3")).toBeNull();
  });
});

describe("the card of a printed number", () => {
  it('is the card "Cards" shows with that number, letters in any case', () => {
    const plain = cardOf("aa", null);
    const printed = cardOf("bb", "ABCD-1234-efgh-5678");
    expect(cardOfPrintedNumber([plain, printed], "abcd-1234-EFGH-5678")).toBe(printed);
    // Being migrated, it shows ("Migration to finish").
    const migrating = cardOf("cc", NUMBER, "migrating");
    expect(cardOfPrintedNumber([plain, migrating], NUMBER)).toBe(migrating);
  });

  it("is none for a number no card shown has: a card deleted or reset keeps its visual, not its place", () => {
    expect(cardOfPrintedNumber([], NUMBER)).toBeNull();
    expect(cardOfPrintedNumber([cardOf("aa", null)], NUMBER)).toBeNull();
    expect(cardOfPrintedNumber([cardOf("aa", "1709-1248-5643-8483")], NUMBER)).toBeNull();
    expect(cardOfPrintedNumber([cardOf("aa", NUMBER, "deleted")], NUMBER)).toBeNull();
    expect(cardOfPrintedNumber([cardOf("aa", NUMBER, "reset")], NUMBER)).toBeNull();
  });

  it("is the first in the account's order should two have it", () => {
    const first = cardOf("ff", NUMBER);
    const second = cardOf("00", NUMBER.toLowerCase());
    expect(cardOfPrintedNumber([first, second], NUMBER)).toBe(first);
  });
});

describe("the links the app is opened with (+native-intent)", () => {
  it('leads a printed link to "Cards" on its card, each scan its own, whatever the clock', () => {
    const now = jest.spyOn(Date, "now").mockReturnValue(1_790_000_000_000);
    try {
      const first = redirectSystemPath({ path: PRINTED, initial: true });
      const second = redirectSystemPath({ path: PRINTED, initial: false });
      const scan = /^\/cards\?printed=1709-1248-5643-8482&scan=(\d+)$/;
      expect(first).toMatch(scan);
      expect(Number(scan.exec(second)?.[1])).toBe(Number(scan.exec(first)?.[1]) + 1);
    } finally {
      now.mockRestore();
    }
  });

  it("leads another address of that host to the start: none is a screen of the app's", () => {
    for (const path of [
      "https://sbpc.ch/",
      "https://sbpc.ch/pos",
      "https://sbpc.ch/1709-1248-5643-8482/",
      "https://sbpc.ch/.well-known/lnurlp/someone"
    ]) {
      expect(redirectSystemPath({ path, initial: true })).toBe("/");
    }
  });

  it("lets every other link go on as it came", () => {
    for (const path of [
      "https://web.example/join#abc.def",
      "https://web.example/cards/pair",
      "sattleme://pos",
      "/cards",
      "https://sbpc.ch.other.example/1709-1248-5643-8482"
    ]) {
      expect(redirectSystemPath({ path, initial: false })).toBe(path);
    }
  });
});
