import {
  cardAskNotice,
  cardHandedOverNotice,
  cardPaidNotice,
  cardRefusedNotice
} from "@/features/card/card-notices";
import type { PaidCard } from "@/features/card/payment";
import i18n from "@/i18n";
import type { CardInvoice } from "@/lib/card/card-invoice";
import type { CardPayeeView } from "@/lib/card/payee-decision";

/*
 * The words of the card payments' notifications: the amount and the
 * merchant named as the payment's panel names it, a name it declared in quotation marks, never its
 * status.
 */

const t = i18n.t;
const LANGUAGE = "en-CH";
const NODE = `02${"ab".repeat(32)}`;

function payee(view: Partial<CardPayeeView>): CardPayeeView {
  return {
    status: "approved",
    name: "Lakeside Coffee",
    by: "address",
    node: null,
    approvedAt: Date.UTC(2026, 9, 20),
    localName: null,
    formerName: null,
    homonym: false,
    ...view
  };
}

function invoice(amountSats: bigint): CardInvoice {
  return {
    pr: "lnbc1",
    amountSats,
    paymentHash: "00".repeat(32),
    descriptionHash: null,
    description: null,
    expiresAt: 2_000_000_000,
    payeeNode: null
  };
}

const EVERYDAY: PaidCard = { cardId: "c".repeat(32), name: "Everyday", look: null, issuer: null };

describe("the notice of a card payment that left", () => {
  it("tells the amount, then the amount and the merchant's declared name, never its status", () => {
    expect(
      cardPaidNotice(
        { amountSats: 900n, payee: payee({ status: "new" }), status: "completed" },
        t,
        LANGUAGE
      )
    ).toEqual({ title: "Card payment: 900 sats", body: "900 sats to “Lakeside Coffee”" });
  });

  it("names the amount exactly, in the device locale's grouping", () => {
    const { title, body } = cardPaidNotice(
      { amountSats: 12_500n, payee: payee({}), status: "pending" },
      t,
      LANGUAGE
    );
    expect(title).toMatch(/^Card payment: 12.500 sats$/);
    expect(body).toMatch(/^12.500 sats to “Lakeside Coffee”$/);
  });

  it('names a node without an alias by its key, shortened, and an unidentified payee "Unknown name", unquoted: the app\'s words', () => {
    expect(
      cardPaidNotice(
        {
          amountSats: 900n,
          payee: payee({ status: "new", name: null, by: "node", node: NODE }),
          status: "completed"
        },
        t,
        LANGUAGE
      ).body
    ).toBe("900 sats to Node 02ababab…abababab");
    expect(
      cardPaidNotice(
        {
          amountSats: 900n,
          payee: payee({ status: "unchecked", name: null, by: null }),
          status: "completed"
        },
        t,
        LANGUAGE
      ).body
    ).toBe("900 sats to Unknown name");
  });

  it("quotes a node's alias, the name it announces", () => {
    expect(
      cardPaidNotice(
        {
          amountSats: 900n,
          payee: payee({ name: "LNBank", by: "node", node: NODE }),
          status: "completed"
        },
        t,
        LANGUAGE
      ).body
    ).toBe("900 sats to “LNBank”");
  });
});

describe("the notice of a card payment to confirm", () => {
  it("waits in its title, and tells the amount and the merchant in its body", () => {
    expect(
      cardAskNotice({ invoice: invoice(800n), payee: payee({ status: "new" }) }, t, LANGUAGE)
    ).toEqual({
      title: "Pending: Card payment",
      body: "800 sats to “Lakeside Coffee”. Click to confirm, the till is waiting."
    });
  });
});

describe("the notice of a card payment handed over to the app (the iOS extension's)", () => {
  it("asks as the app asks once its merchant was checked", () => {
    expect(
      cardHandedOverNotice({ invoice: invoice(800n), payee: payee({ status: "new" }) }, t, LANGUAGE)
    ).toEqual(
      cardAskNotice({ invoice: invoice(800n), payee: payee({ status: "new" }) }, t, LANGUAGE)
    );
  });

  it("tells its amount alone before its merchant was checked, nothing before its invoice", () => {
    expect(cardHandedOverNotice({ invoice: invoice(800n), payee: null }, t, LANGUAGE)).toEqual({
      title: "Pending: Card payment",
      body: "800 sats. Click to confirm, the till is waiting."
    });
    expect(cardHandedOverNotice({ invoice: null, payee: null }, t, LANGUAGE)).toEqual({
      title: "Pending: Card payment",
      body: "Click to confirm, the till is waiting."
    });
  });
});

describe("the notice of a card payment refused", () => {
  it("tells no amount for an invoice refused as it was read", () => {
    expect(
      cardRefusedNotice(
        { invoice: null, failure: "aboveLimit", answerMs: 25_000, payee: null, card: null },
        t,
        LANGUAGE
      )
    ).toEqual({
      title: "Refused: Card payment",
      body: "The amount is above your card's limit. Nothing was paid."
    });
  });

  it("names the merchant checked in its title, and why in its body", () => {
    expect(
      cardRefusedNotice(
        {
          invoice: invoice(800n),
          failure: "newPayee",
          answerMs: 25_000,
          payee: payee({ status: "new" }),
          card: EVERYDAY
        },
        t,
        LANGUAGE
      )
    ).toEqual({
      title: "Refused: Card payment (800 sats to “Lakeside Coffee”)",
      body: "No confirmation within 25 seconds: nothing was paid. The till was told that this new merchant must be approved in the app."
    });
  });

  it('names no merchant before it was checked: never "Unknown name" for a payee not read', () => {
    expect(
      cardRefusedNotice(
        { invoice: invoice(900n), failure: "outOfBounds", answerMs: null, payee: null, card: null },
        t,
        LANGUAGE
      )
    ).toEqual({
      title: "Refused: Card payment (900 sats)",
      body: "The amount is outside the limits of a card payment. Nothing was paid."
    });
  });

  it("names a card in pause once its tap told which it is", () => {
    expect(
      cardRefusedNotice(
        {
          invoice: invoice(900n),
          failure: "suspended",
          answerMs: null,
          payee: null,
          card: EVERYDAY
        },
        t,
        LANGUAGE
      ).body
    ).toBe("Everyday is paused. Nothing was paid.");
    expect(
      cardRefusedNotice(
        { invoice: invoice(900n), failure: "suspended", answerMs: null, payee: null, card: null },
        t,
        LANGUAGE
      ).body
    ).toBe("This card is paused. Nothing was paid.");
  });
});

describe("the quotation marks of the merchant's name", () => {
  it("follow the language: a name in English is quoted as English quotes it", () => {
    const en = i18n.getFixedT("en");
    expect(
      cardPaidNotice({ amountSats: 900n, payee: payee({}), status: "completed" }, en, "en-GB").body
    ).toBe("900 sats to “Lakeside Coffee”");
  });
});
