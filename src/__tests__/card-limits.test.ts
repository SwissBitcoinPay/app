import { cardLimitBreach, cardLimitUsage } from "@/lib/card/card-limits";
import type { CardPaymentEntry, CardPaymentOutcome } from "@/lib/card/payment-log";

const CARD = "0123456789abcdef0123456789abcdef";
const OTHER_CARD = "fedcba9876543210fedcba9876543210";
const NOW = Date.UTC(2026, 9, 14, 12, 0, 0);
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** The defaults of a card at its pairing (src/config/card.ts). */
const card = {
  cardId: CARD,
  walletGeneration: 1,
  suspended: false,
  maxPaymentSats: 20_000n,
  maxDaySats: 50_000n,
  maxPaymentsPerHour: 5
};

let next = 0;
function hash(): string {
  next += 1;
  return next.toString(16).padStart(64, "0");
}

function entry(
  amountSats: bigint,
  ago: number,
  outcome: CardPaymentOutcome = "sent",
  cardId = CARD,
  walletGeneration = 1
): CardPaymentEntry {
  next += 1;
  return {
    id: next.toString(16),
    cardId,
    walletGeneration,
    at: NOW - ago,
    amountSats,
    paymentHash: hash(),
    description: null,
    outcome,
    reason: null,
    pr: "lnbc1",
    payee: null,
    preimage: null,
    value: null
  };
}

const invoice = (amountSats: bigint) => ({ amountSats, paymentHash: hash() });

describe("cardLimitBreach", () => {
  it("lets a payment within every limit through", () => {
    expect(cardLimitBreach(card, invoice(20_000n), [], NOW)).toBeNull();
    expect(cardLimitBreach(card, invoice(1n), [], NOW)).toBeNull();
  });

  it("refuses everything while the card is suspended", () => {
    expect(cardLimitBreach({ ...card, suspended: true }, invoice(1n), [], NOW)).toBe("suspended");
  });

  it("refuses above the ceiling per payment, and above the highest ceiling whatever the card says", () => {
    expect(cardLimitBreach(card, invoice(20_001n), [], NOW)).toBe("aboveLimit");
    // A record saying more than the highest ceiling (1 BTC): the highest ceiling holds.
    const loose = { ...card, maxPaymentSats: 200_000_000n, maxDaySats: 300_000_000n };
    expect(cardLimitBreach(loose, invoice(100_000_000n), [], NOW)).toBeNull();
    expect(cardLimitBreach(loose, invoice(100_000_001n), [], NOW)).toBe("aboveLimit");
  });

  it("never pays an invoice twice, whichever card paid it or may have", () => {
    for (const outcome of ["sending", "sent", "uncertain"] as const) {
      const paid = entry(1_000n, MINUTE, outcome, OTHER_CARD);
      expect(
        cardLimitBreach(card, { amountSats: 1_000n, paymentHash: paid.paymentHash }, [paid], NOW)
      ).toBe("alreadyPaid");
    }
    // Refused or failed: nothing left, it may be paid.
    for (const outcome of ["declined", "failed"] as const) {
      const refused = entry(1_000n, MINUTE, outcome);
      expect(
        cardLimitBreach(
          card,
          { amountSats: 1_000n, paymentHash: refused.paymentHash },
          [refused],
          NOW
        )
      ).toBeNull();
    }
  });

  it("counts 24 sliding hours, payments being sent or maybe sent included", () => {
    const log = [
      entry(20_000n, 23 * HOUR + 59 * MINUTE),
      entry(20_000n, 12 * HOUR, "uncertain"),
      entry(5_000n, 2 * HOUR, "sending")
    ];
    // 45 000 spent: 5 000 more reach the limit exactly, one sat more breaks it.
    expect(cardLimitBreach(card, invoice(5_000n), log, NOW)).toBeNull();
    expect(cardLimitBreach(card, invoice(5_001n), log, NOW)).toBe("dayLimit");
    // A minute later, the oldest left the window.
    expect(cardLimitBreach(card, invoice(20_000n), log, NOW + MINUTE)).toBeNull();
  });

  it("leaves out refusals, failures and the other cards' payments", () => {
    const log = [
      entry(20_000n, HOUR, "declined"),
      entry(20_000n, HOUR, "failed"),
      entry(20_000n, HOUR, "sent", OTHER_CARD),
      entry(20_000n, HOUR, "sent", OTHER_CARD),
      entry(20_000n, HOUR, "sent", OTHER_CARD)
    ];
    expect(cardLimitBreach(card, invoice(20_000n), log, NOW)).toBeNull();
  });

  it("counts the card's current wallet only: a card added again is a new card", () => {
    // The card's first wallet's payments (deleted, then added again within the day).
    const before = [entry(20_000n, HOUR), entry(20_000n, HOUR), entry(9_000n, HOUR)];
    const again = { ...card, walletGeneration: 2 };
    expect(cardLimitBreach(again, invoice(20_000n), before, NOW)).toBeNull();
    expect(cardLimitUsage(again, before, NOW).daySats).toBe(0n);
    // Its own count, as any card's.
    const own = [...before, entry(40_000n, HOUR, "sent", CARD, 2)];
    expect(cardLimitBreach(again, invoice(10_001n), own, NOW)).toBe("dayLimit");
    // An invoice is never paid twice, whatever wallet paid it.
    expect(
      cardLimitBreach(again, { amountSats: 1n, paymentHash: before[0].paymentHash }, before, NOW)
    ).toBe("alreadyPaid");
  });

  it("refuses the payment past the most per hour", () => {
    const log = [1, 2, 3, 4, 5].map((minutes) => entry(100n, minutes * 10 * MINUTE));
    expect(cardLimitBreach({ ...card, maxPaymentsPerHour: 6 }, invoice(100n), log, NOW)).toBeNull();
    expect(cardLimitBreach(card, invoice(100n), log, NOW)).toBe("hourLimit");
    // Ten minutes later, the oldest is more than an hour old.
    expect(cardLimitBreach(card, invoice(100n), log, NOW + 10 * MINUTE)).toBeNull();
  });

  it("leaves out the entry of the tap checked again before sending", () => {
    const self = entry(20_000n, 0, "sending");
    const log = [entry(30_000n, HOUR), self];
    expect(
      cardLimitBreach(
        card,
        { amountSats: 20_000n, paymentHash: self.paymentHash },
        log,
        NOW,
        self.id
      )
    ).toBeNull();
    expect(
      cardLimitBreach(card, { amountSats: 20_000n, paymentHash: self.paymentHash }, log, NOW)
    ).toBe("alreadyPaid");
  });

  it("counts payments dated after now (the phone's clock set back)", () => {
    const log = [entry(50_000n, -2 * HOUR)];
    expect(cardLimitBreach(card, invoice(1n), log, NOW)).toBe("dayLimit");
  });
});

describe("cardLimitUsage", () => {
  it("counts what cardLimitBreach counts: 24 sliding hours, the last hour", () => {
    const log = [
      entry(3_500n, 20 * HOUR),
      entry(8_900n, 2 * HOUR, "uncertain"),
      entry(600n, 10 * MINUTE, "sending"),
      entry(40_000n, 5 * MINUTE, "declined"),
      entry(1_000n, 5 * MINUTE, "failed"),
      entry(7_000n, 5 * MINUTE, "sent", OTHER_CARD),
      // Out of the 24 hours.
      entry(2_000n, 25 * HOUR)
    ];
    expect(cardLimitUsage(card, log, NOW)).toEqual({
      daySats: 13_000n,
      dayRelease: { at: NOW - 20 * HOUR + 24 * HOUR, sats: 3_500n },
      dayFreeAt: null,
      hourCount: 1,
      hourRelease: { paidAt: NOW - 10 * MINUTE, at: NOW - 10 * MINUTE + HOUR },
      hourFreeAt: null
    });
    // Its numbers agree with the breach: 37 000 sats left over 24 hours.
    expect(cardLimitBreach(card, invoice(20_000n), log, NOW)).toBeNull();
    expect(cardLimitBreach({ ...card, maxPaymentSats: 50_000n }, invoice(37_001n), log, NOW)).toBe(
      "dayLimit"
    );
  });

  it("says nothing frees up when nothing was spent", () => {
    expect(cardLimitUsage(card, [entry(5_000n, MINUTE, "declined")], NOW)).toEqual({
      daySats: 0n,
      dayRelease: null,
      dayFreeAt: null,
      hourCount: 0,
      hourRelease: null,
      hourFreeAt: null
    });
  });

  it("adds up the payments that leave at the same instant", () => {
    const log = [entry(1_000n, 3 * HOUR), entry(2_500n, 3 * HOUR), entry(4_000n, 2 * HOUR)];
    expect(cardLimitUsage(card, log, NOW).dayRelease).toEqual({
      at: NOW - 3 * HOUR + 24 * HOUR,
      sats: 3_500n
    });
  });

  it("says when the card pays again once the hour is full, its limit lowered below it included", () => {
    const log = [10, 20, 30, 40, 50].map((ago) => entry(100n, ago * MINUTE));
    const full = cardLimitUsage(card, log, NOW);
    expect(full.hourCount).toBe(5);
    // The oldest leaves first: then a sixth fits.
    expect(full.hourFreeAt).toBe(NOW - 50 * MINUTE + HOUR);
    expect(cardLimitBreach(card, invoice(1n), log, NOW)).toBe("hourLimit");
    expect(cardLimitBreach(card, invoice(1n), log, full.hourFreeAt!)).toBeNull();
    expect(cardLimitBreach(card, invoice(1n), log, full.hourFreeAt! - 1)).toBe("hourLimit");
    // Three an hour now: three must leave first.
    const lowered = cardLimitUsage({ ...card, maxPaymentsPerHour: 3 }, log, NOW);
    expect(lowered.hourFreeAt).toBe(NOW - 30 * MINUTE + HOUR);
    expect(
      cardLimitBreach({ ...card, maxPaymentsPerHour: 3 }, invoice(1n), log, lowered.hourFreeAt!)
    ).toBeNull();
    // One short of full: nothing to wait for.
    expect(cardLimitUsage(card, log.slice(1), NOW).hourFreeAt).toBeNull();
  });

  it("says when the card pays again once the 24 hours are full, its limit lowered below them included", () => {
    const ceiling = { ...card, maxPaymentSats: 50_000n };
    const log = [entry(20_000n, 20 * HOUR), entry(20_000n, 10 * HOUR), entry(10_000n, 2 * HOUR)];
    const full = cardLimitUsage(card, log, NOW);
    expect(full.daySats).toBe(50_000n);
    // The oldest leaves first: then 20 000 sats fit again, one sat at least.
    expect(full.dayFreeAt).toBe(NOW - 20 * HOUR + 24 * HOUR);
    expect(cardLimitBreach(ceiling, invoice(1n), log, NOW)).toBe("dayLimit");
    expect(cardLimitBreach(ceiling, invoice(1n), log, full.dayFreeAt! - 1)).toBe("dayLimit");
    expect(cardLimitBreach(ceiling, invoice(20_000n), log, full.dayFreeAt!)).toBeNull();
    // 30 000 sats over 24 hours now: two must leave before one sat fits under it.
    const lowered = cardLimitUsage({ ...card, maxDaySats: 30_000n }, log, NOW);
    expect(lowered.dayFreeAt).toBe(NOW - 10 * HOUR + 24 * HOUR);
    const at30k = { ...ceiling, maxDaySats: 30_000n };
    expect(cardLimitBreach(at30k, invoice(1n), log, lowered.dayFreeAt! - 1)).toBe("dayLimit");
    expect(cardLimitBreach(at30k, invoice(1n), log, lowered.dayFreeAt!)).toBeNull();
    // One sat short of full: nothing to wait for.
    expect(cardLimitUsage({ ...card, maxDaySats: 50_001n }, log, NOW).dayFreeAt).toBeNull();
  });

  it("frees the 24 hours of payments made at the same instant together", () => {
    const log = [entry(30_000n, 5 * HOUR), entry(20_000n, 5 * HOUR), entry(5_000n, 1 * HOUR)];
    // 55 000 sats, five over the limit: the first two leave together.
    expect(cardLimitUsage(card, log, NOW).dayFreeAt).toBe(NOW - 5 * HOUR + 24 * HOUR);
  });

  it("counts payments dated after now (the phone's clock set back), as the breach does", () => {
    const usage = cardLimitUsage(card, [entry(50_000n, -2 * HOUR)], NOW);
    expect(usage.daySats).toBe(50_000n);
    expect(usage.dayRelease).toEqual({ at: NOW + 2 * HOUR + 24 * HOUR, sats: 50_000n });
    expect(usage.dayFreeAt).toBe(NOW + 2 * HOUR + 24 * HOUR);
  });
});
