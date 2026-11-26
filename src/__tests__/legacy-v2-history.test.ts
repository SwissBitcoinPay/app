import {
  HISTORY_PAGE_SIZE,
  RATE_TOLERANCE_SECONDS,
  decimalToMinor,
  fetchLegacyHistoryPage,
  fetchLegacyRates,
  legacyRowRef,
  parseLegacyPayment,
  rateAt
} from "@/lib/legacy-v2/history";

import { acceptSession, legacyV2 } from "../../jest/legacy-v2-server";

/*
 * The v2 account's history as the copy reads it (history.ts): the v2 accounting export's sales, the
 * bitcoin payouts and the referral fees, page by page over the Record API `apipayments`, and the v2
 * server's prices. Over the fake v2 server.
 */

const PAID = 1_790_000_000;
/** The v2 account's name: its point of sale wrote it as each sale's title. */
const NAME = "Lakeside Bakery";

/** A row of `apipayments` as the Record API gives it: a sale of the v2 app's point of sale. */
function payment(fields: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "0192a3b4-c5d6-7e8f-9a0b-000000000001",
    status: "settled",
    tag: "invoice-tpos",
    amount_sat: 25_000,
    fee_msat: 250_000,
    created_at: PAID - 60,
    paid_at: PAID,
    title: NAME,
    description: "Croissants",
    input: { unit: "CHF", amount: 12.5 },
    webhook: { url: "https://shop.example/hook", headers: { Authorization: "secret" } },
    payout: { iban: "CH9300762011623852957" },
    ...fields
  };
}

describe("parseLegacyPayment", () => {
  it("keeps a sale's date, sats, amount asked and note, never its webhook nor its payout", () => {
    const row = parseLegacyPayment(payment(), NAME);
    expect(row).toEqual({
      ref: legacyRowRef("0192a3b4-c5d6-7e8f-9a0b-000000000001"),
      kind: "sale",
      channel: "pos",
      at: PAID,
      sats: 25_000n,
      fiat: { minor: 1250, digits: 2, currency: "CHF" },
      note: "Croissants",
      rate: null
    });
    expect(JSON.stringify(row, (_key, value: unknown) => String(value))).not.toMatch(
      /secret|shop\.example|CH93|0192a3b4/
    );
  });

  it("tells where a sale was made by its tag", () => {
    expect(parseLegacyPayment(payment({ tag: "invoice-web" }))?.channel).toBe("link");
    expect(parseLegacyPayment(payment({ tag: "woocommerce" }))?.channel).toBe("integration");
    expect(parseLegacyPayment(payment({ tag: null }))?.channel).toBe("integration");
  });

  it("keeps the export's scope, the bitcoin payouts and the referral fees, nothing else", () => {
    // Not paid, not settled, a bank transfer, another way out: left out.
    for (const fields of [
      { status: "expired" },
      { status: "open", paid_at: null },
      { paid_at: null },
      { tag: "fiat-withdraw", amount_sat: -10_000 },
      { tag: "fees", amount_sat: -100 },
      { tag: "swap", amount_sat: -5_000 }
    ]) {
      expect(parseLegacyPayment(payment(fields))).toBeNull();
    }
    expect(
      parseLegacyPayment(
        payment({
          tag: "withdraw",
          amount_sat: -48_000,
          title: null,
          description: null,
          input: null
        })
      )
    ).toMatchObject({ kind: "withdraw", channel: null, sats: 48_000n, fiat: null, note: "" });
    // Referral fees carry no date of payment on the v2 server: when they were made.
    expect(
      parseLegacyPayment(payment({ tag: "referral-fees", amount_sat: 120, paid_at: null }))
    ).toMatchObject({ kind: "referral", at: PAID - 60, sats: 120n });
  });

  it("tells money the v2 server received itself from a sale, its tag as the server compares it", () => {
    for (const tag of [
      "lightning-address-deposit",
      "deposit",
      "onchain-deposit",
      "lnurlw-qr-topup"
    ]) {
      expect(parseLegacyPayment(payment({ tag, input: null }))).toMatchObject({
        kind: "receipt",
        channel: null,
        sats: 25_000n
      });
    }
    // Compared exactly: another case is a merchant's own tag (an integration's sale).
    expect(parseLegacyPayment(payment({ tag: "Deposit" }))).toMatchObject({
      kind: "sale",
      channel: "integration"
    });
  });

  it("takes no amount asked in bitcoin, and refuses a row out of shape", () => {
    expect(
      parseLegacyPayment(payment({ input: { unit: "sat", amount: 25_000 } }))?.fiat
    ).toBeNull();
    expect(
      parseLegacyPayment(payment({ input: { unit: "BTC", amount: 0.00025 } }))?.fiat
    ).toBeNull();
    // A JSON column given as its text (an older server).
    expect(parseLegacyPayment(payment({ input: '{"unit":"EUR","amount":3.2}' }))?.fiat).toEqual({
      minor: 320,
      digits: 2,
      currency: "EUR"
    });
    for (const fields of [
      { id: "" },
      { id: 7 },
      { amount_sat: 1.5 },
      { amount_sat: "25000" },
      { paid_at: -1 },
      // Before Bitcoin's first block, or in milliseconds: no month the copy can name.
      { paid_at: 1_000_000_000 },
      { paid_at: 1_791_033_030_000 },
      { tag: 3 }
    ]) {
      expect(parseLegacyPayment(payment(fields))).toBeNull();
    }
  });
});

describe("a row's note, as the v2 apps showed it", () => {
  const noteOf = (fields: Record<string, unknown>, name: string | null = NAME) =>
    parseLegacyPayment(payment(fields), name)?.note;

  it("is a sale of the point of sale's description: its title is the account's name", () => {
    expect(noteOf({ description: " Coffee " })).toBe("Coffee");
    expect(noteOf({ description: null })).toBe("");
    expect(noteOf({ description: "   " })).toBe("");
    // Its title never, whatever it says: the account's name, an older one.
    expect(noteOf({ title: "Former name", description: null })).toBe("");
    // An older row's "<name> - <note>": its note, as the dashboard showed it.
    expect(noteOf({ title: `${NAME} - 2 coffees`, description: null })).toBe("2 coffees");
    expect(noteOf({ title: `${NAME} - 2 coffees`, description: "Table 4" })).toBe("Table 4");
    // The account's name unknown: its description only.
    expect(noteOf({ title: `${NAME} - 2 coffees`, description: null }, null)).toBe("");
  });

  it("is an invoice's or an integration's title and description, never the account's name", () => {
    const web = (fields: Record<string, unknown>, name: string | null = NAME) =>
      noteOf({ tag: "invoice-web", ...fields }, name);
    expect(web({ title: "Invoice 42", description: "October consulting" })).toBe(
      "Invoice 42 — October consulting"
    );
    expect(web({ title: "Invoice 42", description: null })).toBe("Invoice 42");
    expect(web({ title: "Invoice 42", description: "Invoice 42" })).toBe("Invoice 42");
    // The account's name is the v2 server's default title: no note of its own.
    expect(web({ title: NAME, description: null })).toBe("");
    expect(web({ title: `  ${NAME} `, description: "Consulting" })).toBe("Consulting");
    expect(web({ title: `${NAME} - Workshop`, description: null })).toBe("Workshop");
    // Its name unknown: the title as it is.
    expect(web({ title: NAME, description: null }, null)).toBe(NAME);
    expect(noteOf({ tag: "woocommerce", title: "Order #123", description: "2 T-shirts" })).toBe(
      "Order #123 — 2 T-shirts"
    );
  });

  it("is any other row's description: its title is the v2 server's label", () => {
    expect(
      noteOf({
        tag: "lightning-address-deposit",
        input: null,
        title: NAME,
        description: "Thank you!"
      })
    ).toBe("Thank you!");
    expect(
      noteOf({ tag: "onchain-deposit", input: null, title: "On-chain deposit", description: null })
    ).toBe("");
    expect(
      noteOf({ tag: "withdraw", amount_sat: -48_000, title: "Withdrawal", description: null })
    ).toBe("");
  });

  it("is cut to 200 characters, never through a character beyond the BMP", () => {
    expect(noteOf({ description: "x".repeat(500) })).toHaveLength(200);
    expect(noteOf({ description: `${"x".repeat(199)}🥐` })).toBe("x".repeat(199));
    expect(
      noteOf({ tag: "invoice-web", title: "t".repeat(150), description: "d".repeat(150) })
    ).toHaveLength(200);
  });
});

describe("decimalToMinor", () => {
  it("rounds the v2 server's decimal half up to the minor unit, on its exact digits", () => {
    expect(decimalToMinor(12.5, 2)).toBe(1250);
    // 1.005 is 1.00499999… as a float: its shortest decimal is 1.005, half up: 1.01.
    expect(decimalToMinor(1.005, 2)).toBe(101);
    expect(decimalToMinor(0.1 + 0.2, 2)).toBe(30);
    expect(decimalToMinor(2.344, 2)).toBe(234);
    expect(decimalToMinor(1500, 0)).toBe(1500);
    expect(decimalToMinor(1e-7, 2)).toBe(0);
    expect(decimalToMinor(0, 2)).toBe(0);
    expect(decimalToMinor(-1, 2)).toBeNull();
    expect(decimalToMinor(Number.NaN, 2)).toBeNull();
    expect(decimalToMinor(1e300, 2)).toBeNull();
  });
});

describe("the v2 history's pages", () => {
  const session = { authToken: "auth-of-the-owner-000001", refreshToken: null };

  it("reads every settled payment page by page, with the owner's session", async () => {
    acceptSession("refresh-unused-00000001", session.authToken);
    legacyV2.payments = Array.from({ length: HISTORY_PAGE_SIZE + 5 }, (_, at) =>
      payment({ id: `id-${String(at).padStart(6, "0")}` })
    ).concat([payment({ id: "id-zzzzzz", status: "expired" })]);

    const first = await fetchLegacyHistoryPage(session, null, NAME);
    expect(first.rows).toHaveLength(HISTORY_PAGE_SIZE);
    expect(first.cursor).toBe(`id-${String(HISTORY_PAGE_SIZE - 1).padStart(6, "0")}`);
    const second = await fetchLegacyHistoryPage(session, first.cursor, NAME);
    expect(second.rows).toHaveLength(5);
    const third = await fetchLegacyHistoryPage(session, second.cursor, NAME);
    expect(third).toEqual({ rows: [], read: 0, invalid: 0, cursor: null });

    const asked = legacyV2.calls.filter(({ path }) => path === "/api/records/v1/apipayments");
    expect(asked).toHaveLength(3);
    expect(
      asked.every(({ authorization }) => authorization === `Bearer ${session.authToken}`)
    ).toBe(true);
  });

  it("counts the rows out of shape it leaves out, never those out of the history's scope", async () => {
    acceptSession("refresh-unused-00000001", session.authToken);
    legacyV2.payments = [
      payment({ id: "id-000001" }),
      // Out of scope: a bank transfer, an invoice never paid.
      payment({ id: "id-000002", tag: "fiat-withdraw", amount_sat: -10_000 }),
      payment({ id: "id-000003", paid_at: null }),
      // Out of shape: a date in milliseconds, an amount not whole.
      payment({ id: "id-000004", paid_at: PAID * 1000 }),
      payment({ id: "id-000005", amount_sat: 1.5 })
    ];
    const page = await fetchLegacyHistoryPage(session, null, NAME);
    expect(page).toMatchObject({ read: 5, invalid: 2 });
    expect(page.rows.map(({ ref }) => ref)).toEqual([legacyRowRef("id-000001")]);
  });

  it("says a session refused, and an answer out of shape", async () => {
    await expect(fetchLegacyHistoryPage(session, null, NAME)).rejects.toMatchObject({
      code: "refused"
    });
    const fetchImpl = jest.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ records: "nope" })
    })) as unknown as typeof fetch;
    await expect(fetchLegacyHistoryPage(session, null, NAME, { fetchImpl })).rejects.toMatchObject({
      code: "invalidResponse"
    });
  });
});

describe("the v2 server's prices", () => {
  it("are read for a unit and a period, those out of shape left out", async () => {
    legacyV2.rates.set("CHF", [
      { time: PAID + 600, price: 61_000.5 },
      { time: PAID, price: 60_000 },
      { time: PAID - 3 * 86_400, price: 1 }
    ]);
    const points = await fetchLegacyRates("CHF", PAID - 86_400, PAID + 86_400);
    expect(points).toEqual([
      { time: PAID, price: 60_000 },
      { time: PAID + 600, price: 61_000.5 }
    ]);
    legacyV2.ratesDown = true;
    await expect(fetchLegacyRates("CHF", PAID, PAID)).rejects.toMatchObject({ code: "network" });
  });

  it("give a payment the price nearest its date, never one too far", () => {
    const points = [
      { time: 1_000, price: 10 },
      { time: 2_000, price: 20 },
      { time: 3_000, price: 30 }
    ];
    expect(rateAt(points, 1_400)).toBe(10);
    expect(rateAt(points, 1_600)).toBe(20);
    // As near: the earlier.
    expect(rateAt(points, 1_500)).toBe(10);
    expect(rateAt(points, 3_000 + RATE_TOLERANCE_SECONDS)).toBe(30);
    expect(rateAt(points, 3_001 + RATE_TOLERANCE_SECONDS)).toBeNull();
    expect(rateAt([], 1_000)).toBeNull();
  });
});
