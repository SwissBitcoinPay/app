import {
  CARD_HISTORY_PAGE_SIZE,
  LegacyCardHistoryError,
  fetchLegacyCardHistory,
  legacyCardRowRef,
  parseLegacyCardPayment
} from "@/lib/legacy-v2/card-history";

import { legacyV2 } from "../../jest/legacy-v2-server";

/*
 * A v2 card's history as the v2 server lists it (`GET /v1/apipayments/by-card`): read by the number printed on the
 * card, its PIN when it has one, its settled rows kept, each untrusted.
 */

const NUMBER = "9337-6937-5632-2883";
/** 15.10.2026, 12:00 UTC. */
const AT = 1_792_065_600;

function payment(id: string, fields: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    amount_sat: -2_500,
    fee_msat: 0,
    title: "🇨🇭 Swiss Bitcoin Pay Card",
    description: null,
    tag: "withdraw",
    status: "settled",
    payment_details: null,
    created_at: AT - 10,
    paid_at: AT,
    ...fields
  };
}

function card(payments: Record<string, unknown>[], pin: string | null = null) {
  legacyV2.cards.set(NUMBER, { pin, payments, wrongPins: 0 });
}

async function failure(promise: Promise<unknown>): Promise<string> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e
  );
  expect(error).toBeInstanceOf(LegacyCardHistoryError);
  return (error as LegacyCardHistoryError).code;
}

describe("a row of a v2 card's history", () => {
  it("keeps what left the card and what came to it, settled, its amount unsigned", () => {
    expect(parseLegacyCardPayment(payment("p1", { fee_msat: 1_500 }))).toEqual({
      ref: legacyCardRowRef("p1"),
      kind: "payment",
      at: AT,
      sats: 2_500n,
      feeMsat: 1_500n,
      value: null,
      note: ""
    });
    expect(
      parseLegacyCardPayment(payment("r1", { amount_sat: 30_000, tag: "lightning-deposit" }))
    ).toMatchObject({ kind: "recharge", sats: 30_000n });
  });

  it("keeps its description as its note, trimmed and cut, never its title", () => {
    const recharge = (fields: Record<string, unknown>) =>
      parseLegacyCardPayment(
        payment("r1", {
          amount_sat: 30_000,
          tag: "lightning-address-deposit",
          title: "Card 9337",
          ...fields
        })
      )?.note;
    expect(recharge({ description: "  Thanks for the meal  " })).toBe("Thanks for the meal");
    // A title alone is the v2 apps' or server's label: no note.
    expect(recharge({ description: null })).toBe("");
    expect(recharge({ description: "   " })).toBe("");
    expect(recharge({ description: 42 })).toBe("");
    expect(recharge({ description: "x".repeat(500) })).toHaveLength(200);
    // Never through a character beyond the BMP: its first half alone is no text.
    expect(recharge({ description: `${"x".repeat(199)}🎁` })).toBe("x".repeat(199));
  });

  it("is dated when it was paid, else when it was made", () => {
    expect(parseLegacyCardPayment(payment("p1", { paid_at: null }))?.at).toBe(AT - 10);
  });

  it("leaves out what is not settled, and what moved nothing", () => {
    for (const status of ["reserved", "paying", "open", "expired", "unconfirmed"]) {
      expect(parseLegacyCardPayment(payment("p1", { status }))).toBeNull();
    }
    expect(parseLegacyCardPayment(payment("p1", { amount_sat: 0 }))).toBeNull();
  });

  it("is refused out of shape, never guessed", () => {
    for (const fields of [
      { id: "" },
      { id: 42 },
      { id: "x".repeat(101) },
      { amount_sat: 1.5 },
      { amount_sat: "2500" },
      { fee_msat: -1 },
      { fee_msat: null },
      // A date in milliseconds, before Bitcoin, or out of shape: never read as another.
      { paid_at: AT * 1000 },
      { paid_at: 1_000 },
      { paid_at: "2026-10-15" },
      { paid_at: null, created_at: null }
    ]) {
      expect(parseLegacyCardPayment(payment("p1", fields))).toBeNull();
    }
    expect(parseLegacyCardPayment(null)).toBeNull();
    expect(parseLegacyCardPayment([payment("p1")])).toBeNull();
  });

  // Checked against Node's own SHA-256 (crypto.createHash): the copies keep it, released.
  it("keeps a reference that names no id of the v2 server", () => {
    expect(legacyCardRowRef("0192f0a4-7b6e-7c1d-9a3e-5b2c1d0e9f8a")).toBe(
      "65f9c050df3c8cc055efe7a33c2e49f35ef48d3c2839d833c2416e8cc742358b"
    );
  });
});

describe("the whole history of a v2 card", () => {
  it("reads every page, newest first, by the number printed on the card", async () => {
    const rows = Array.from({ length: CARD_HISTORY_PAGE_SIZE + 50 }, (_, index) =>
      payment(`p${index}`, { paid_at: AT + index })
    );
    card([...rows, payment("open", { status: "open" })]);
    const history = await fetchLegacyCardHistory(NUMBER, null);
    expect(history.invalid).toBe(0);
    expect(history.rows).toHaveLength(CARD_HISTORY_PAGE_SIZE + 50);
    expect(new Set(history.rows.map(({ ref }) => ref)).size).toBe(CARD_HISTORY_PAGE_SIZE + 50);
    // Read twice (pages of 200, then a short one), to be sure the list stood still.
    const pages = legacyV2.calls.filter(({ path }) => path === "/v1/apipayments/by-card");
    expect(pages).toHaveLength(4);
    // Never a session: the card's number is its name.
    expect(pages.every(({ authorization }) => authorization === null)).toBe(true);
    expect(legacyV2.pinsGiven).toEqual([null, null, null, null]);
  });

  it("reads an empty history as empty", async () => {
    card([]);
    await expect(fetchLegacyCardHistory(NUMBER, null)).resolves.toEqual({ rows: [], invalid: 0 });
  });

  it("counts the rows out of shape, left out", async () => {
    card([payment("p1"), payment("p2", { amount_sat: "x" })]);
    const history = await fetchLegacyCardHistory(NUMBER, null);
    expect(history.rows.map(({ ref }) => ref)).toEqual([legacyCardRowRef("p1")]);
    expect(history.invalid).toBe(1);
  });

  it("reads the list again while a row deleted meanwhile shifts its pages", async () => {
    const rows = Array.from({ length: CARD_HISTORY_PAGE_SIZE + 10 }, (_, index) =>
      payment(`p${index}`, { paid_at: AT + index })
    );
    // An abandoned tap's reservation, newest of all, deleted by the server's job once the first
    // page was read: the second page then starts one row further, one row never read.
    const reservation = payment("reserved", { status: "reserved", paid_at: AT + 1_000 });
    card([...rows, reservation]);
    let deleted = false;
    legacyV2.onByCardPage = (offset) => {
      if (offset > 0 && !deleted) {
        deleted = true;
        legacyV2.cards.get(NUMBER)!.payments = rows;
      }
    };
    const history = await fetchLegacyCardHistory(NUMBER, null);
    expect(history.rows).toHaveLength(CARD_HISTORY_PAGE_SIZE + 10);
  });

  it("gives up on a list that never stands still", async () => {
    let count = 0;
    card([payment("p0")]);
    legacyV2.onByCardPage = () => {
      count += 1;
      legacyV2.cards.get(NUMBER)!.payments.push(payment(`n${count}`));
    };
    expect(await failure(fetchLegacyCardHistory(NUMBER, null))).toBe("invalidResponse");
  });

  it("asks the PIN of a card that has one, and takes the right one", async () => {
    card([payment("p1")], "4242");
    expect(await failure(fetchLegacyCardHistory(NUMBER, null))).toBe("pinRequired");
    expect(await failure(fetchLegacyCardHistory(NUMBER, "1111"))).toBe("pinInvalid");
    const history = await fetchLegacyCardHistory(NUMBER, "4242");
    expect(history.rows).toHaveLength(1);
  });

  it("says when the v2 server locked the card's PIN", async () => {
    card([payment("p1")], "4242");
    legacyV2.cards.get(NUMBER)!.wrongPins = 5;
    expect(await failure(fetchLegacyCardHistory(NUMBER, "4242"))).toBe("pinLocked");
  });

  it("never sends a PIN the v2 portal could not have set: it would count as a wrong one", async () => {
    card([payment("p1")], "4242");
    for (const pin of ["123", "123456789", "12 4", "1234\n"]) {
      expect(await failure(fetchLegacyCardHistory(NUMBER, pin))).toBe("pinInvalid");
    }
    expect(legacyV2.pinsGiven).toEqual([]);
  });

  it("says when the v2 server knows no card of that number, or it is not one", async () => {
    expect(await failure(fetchLegacyCardHistory(NUMBER, null))).toBe("unknownCard");
    expect(await failure(fetchLegacyCardHistory("not a number", null))).toBe("unknownCard");
    // Never asked for a number out of shape.
    expect(legacyV2.calls).toHaveLength(1);
  });

  it("fails as a network failure when the server is down or limits the rate", async () => {
    card([payment("p1")]);
    legacyV2.byCardStatus = 503;
    expect(await failure(fetchLegacyCardHistory(NUMBER, null))).toBe("network");
    legacyV2.byCardStatus = 429;
    expect(await failure(fetchLegacyCardHistory(NUMBER, null))).toBe("network");
    legacyV2.byCardStatus = null;
    legacyV2.unreachable = true;
    expect(await failure(fetchLegacyCardHistory(NUMBER, null))).toBe("network");
  });
});
