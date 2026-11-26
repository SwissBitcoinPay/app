import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import { renderHook, waitFor } from "@testing-library/react-native";

import { closeAccount } from "@/features/account/session";
import { historyRows } from "@/features/card/history-view";
import {
  tallyPayeePayments,
  usePayeePayments,
  walletSends,
  type WalletSend
} from "@/features/card/payee-payments";
import type { WalletPayment } from "@/lib/breez/types";
import type { ApprovedPayee } from "@/lib/card/payee-book";
import type { CardPaymentEntry } from "@/lib/card/payment-entry";
import * as paymentLog from "@/lib/card/payment-log";
import { readLog } from "@/lib/log/log";
import { currentRelays } from "@/lib/relays/current";

import { openTestAccount } from "../../jest/account";
import { provenCardPayee } from "../../jest/breez-tips";
import { makeInvoice, testNode } from "../../jest/lightning";
import type * as BreezFake from "../../jest/breez-sdk";
import type * as RelaysFake from "../../jest/nostr-relays";

/*
 * What "Payments without confirmation" says of each approved merchant (and its "Merchant"
 * screen): the card's payments there since its approval, said only when proven.
 */

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { extra: { breezNetwork: "mainnet" } } }
}));

const nostr = jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");
const sdk = jest.requireMock<typeof BreezFake>("@breeztech/breez-sdk-spark-react-native");
const CARD = "0123456789abcdef0123456789abcdef";
/** Its wallet: its first. */
const OF_CARD = { cardId: CARD, walletGeneration: 1 };
const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 18, 12, 0);
const HORIZON = NOW - 90 * DAY;
const APPROVED = NOW - 3 * DAY;
const CAFE = "sattleme07@breez.tips";
const GROCERY = "sattleme08@breez.tips";

function approved(id: string, approvedAt = APPROVED): ApprovedPayee {
  return {
    id,
    by: id.includes("@") ? "address" : "node",
    approvedAt,
    approvedName: "Lakeside Coffee",
    lastName: "Lakeside Coffee",
    lastSeenAt: approvedAt,
    localName: null
  };
}

/** A payment of the card at `at`, sent to `to` as the point of sale proved it (null: unproven). */
function paid(
  id: string,
  at: number,
  to: string | null,
  changes: Partial<CardPaymentEntry> = {},
  signWith?: Uint8Array
): CardPaymentEntry {
  // Its proof as the point of sale gave it and breez.tips answered it (payment.ts keeps both).
  // Some ids are not hex: its invoice's hash is that of the id's text.
  const invoiceHash = bytesToHex(sha256(utf8ToBytes(id)));
  const proof =
    to === null
      ? null
      : provenCardPayee(to.split("@")[0], "Lakeside Coffee", invoiceHash, { signWith });
  return {
    id,
    cardId: CARD,
    walletGeneration: 1,
    at,
    amountSats: 2_000n,
    paymentHash: hashOf(id),
    description: null,
    outcome: "sent",
    reason: null,
    pr: proof?.pr ?? "lnbc1",
    payee:
      proof === null
        ? { status: "unidentified", name: null, metadata: null, verify: null, verifyAnswer: null }
        : {
            status: "approved",
            name: "Lakeside Coffee",
            metadata: proof.metadata,
            verify: proof.verify,
            verifyAnswer: proof.verifyAnswer
          },
    preimage: null,
    value: null,
    ...changes
  };
}

/** The hash `paid(id, …)` gives its payment. */
function hashOf(id: string): string {
  return id.padStart(64, "0");
}

/** What the card's wallet tells of the payment `id`, made at `at`: completed, unless said. */
function sent(id: string, at: number, status: WalletSend["status"] = "completed"): WalletSend {
  return { at, paymentHash: hashOf(id), status };
}

/** The card's wallet as `entries` left it: each payment the log says sent, completed. */
function ledgerOf(entries: CardPaymentEntry[]): WalletSend[] {
  return entries
    .filter((entry) => entry.outcome === "sent")
    .map((entry) => ({ at: entry.at + 1000, paymentHash: entry.paymentHash, status: "completed" }));
}

/** As usePayeePayments: every tap known, the card's wallet's payments, read at NOW. */
function tally(
  entries: CardPaymentEntry[],
  merchants: ApprovedPayee[],
  sends: WalletSend[] = ledgerOf(entries),
  readAt = NOW
) {
  const rows = historyRows({
    card: OF_CARD,
    horizon: 0,
    own: entries,
    taps: [],
    movements: [],
    wallet: null
  });
  return tallyPayeePayments(rows, merchants, HORIZON, sends, readAt);
}

/** A payment to a merchant its node names: its invoice, signed by `node`, kept as its proof. */
function paidToNode(
  id: string,
  at: number,
  node: Uint8Array,
  status: "approved" | "new" | "unchecked" = "approved"
): CardPaymentEntry {
  const pr = makeInvoice({ amountMsat: 2_000_000n, paymentHash: hashOf(id), signWith: node });
  return paid(id, at, null, {
    pr,
    payee: { status, name: null, metadata: null, verify: null, verifyAnswer: null }
  });
}

describe("a merchant approved by its node", () => {
  const stand = testNode(21);
  const other = testNode(22);

  it("counts each payment whose invoice its node signed, whoever the point of sale said", () => {
    const tallies = tally(
      [
        paidToNode("c1", APPROVED + 60_000, stand.secretKey),
        // Paid in "Automatic" (not checked): its invoice tells all the same.
        paidToNode("c2", APPROVED + DAY, stand.secretKey, "unchecked"),
        paidToNode("c3", APPROVED + DAY + 1, other.secretKey, "new"),
        // To an address the point of sale proved: another node's.
        paid("c4", APPROVED + DAY + 2, CAFE, {}, other.secretKey)
      ],
      [approved(stand.nodeId), approved(CAFE)]
    );
    expect(tallies.get(stand.nodeId)).toEqual({ count: 2, sats: 4_000n, whole: true });
    // The address's count stays unproven: a payment named by a node may have been its own.
    expect(tallies.has(CAFE)).toBe(false);
  });

  it("never counts for an address a payment whose kept proof does not hold", () => {
    const forged = paid("e1", APPROVED + 60_000, CAFE);
    // The service's answer was about another invoice: the proof proves nothing.
    const tallies = tally(
      [
        {
          ...forged,
          payee: {
            ...forged.payee!,
            verifyAnswer: JSON.stringify({ status: "OK", settled: false, pr: "lnbc1other" })
          }
        }
      ],
      [approved(CAFE)]
    );
    expect(tallies.has(CAFE)).toBe(false);
  });

  it("says nothing while a payment's invoice names no node", () => {
    const tallies = tally(
      [paidToNode("d1", APPROVED + 60_000, stand.secretKey), paid("d2", APPROVED + DAY, null)],
      [approved(stand.nodeId)]
    );
    expect(tallies.has(stand.nodeId)).toBe(false);
  });
});

describe("each approved merchant's payments", () => {
  it("counts those the wallet shows completed since its approval, never before, nor a refusal", () => {
    const tallies = tally(
      [
        paid("a0", APPROVED - 60_000, CAFE),
        paid("a1", APPROVED + 60_000, CAFE),
        paid("a2", APPROVED + DAY, CAFE, { amountSats: 3_000n }),
        paid("a3", APPROVED + DAY + 1, CAFE, { outcome: "declined", reason: "amount above limit" }),
        paid("a4", APPROVED + DAY + 2, CAFE, { outcome: "failed" }),
        paid("b1", APPROVED + 2 * DAY, GROCERY, { amountSats: 9_000n })
      ],
      [approved(CAFE), approved(GROCERY, APPROVED + 2 * DAY + 1)]
    );
    expect(tallies.get(CAFE)).toEqual({ count: 2, sats: 5_000n, whole: true });
    // Paid there before its approval only.
    expect(tallies.get(GROCERY)).toEqual({ count: 0, sats: 0n, whole: true });
  });

  it("counts a merchant's first payment, made before the holder approved it, never", () => {
    // Identified, new: confirmed, then approved; it left the wallet once confirmed.
    const tallies = tally(
      [
        {
          ...paid("a1", APPROVED - 1, CAFE),
          payee: { ...paid("a1", 0, CAFE).payee!, status: "new" }
        },
        {
          ...paid("a2", APPROVED + 1, CAFE),
          payee: { ...paid("a2", 0, CAFE).payee!, status: "new" }
        }
      ],
      [approved(CAFE)],
      [sent("a1", APPROVED + 20_000), sent("a2", APPROVED + 21_000)]
    );
    expect(tallies.get(CAFE)).toEqual({ count: 1, sats: 2_000n, whole: true });
  });

  it("says no count where a payment since its approval may have gone: none proven there", () => {
    const tallies = tally(
      [
        paid("a1", APPROVED + 60_000, CAFE),
        paid("u1", APPROVED + DAY, null),
        // Unchecked ("Automatic"): its merchant shown, never proven.
        {
          ...paid("u2", APPROVED + DAY + 1, CAFE),
          payee: { ...paid("u2", 0, CAFE).payee!, status: "unchecked" }
        }
      ],
      [approved(CAFE), approved(GROCERY, APPROVED + 2 * DAY)]
    );
    expect(tallies.has(CAFE)).toBe(false);
    // Approved after them: nothing since may have gone there.
    expect(tallies.get(GROCERY)).toEqual({ count: 0, sats: 0n, whole: true });
  });

  it("says no count while a payment there may still leave: pending, or untold by the wallet", () => {
    const first = paid("a1", APPROVED + 60_000, CAFE);
    for (const outcome of ["sending", "uncertain", "sent"] as const) {
      const second = paid("a2", APPROVED + DAY, CAFE, { outcome });
      for (const sends of [
        [sent("a1", APPROVED + 61_000), sent("a2", APPROVED + DAY + 1000, "pending")],
        [sent("a1", APPROVED + 61_000)]
      ]) {
        const tallies = tally([first, second], [approved(CAFE), approved(GROCERY)], sends);
        expect(tallies.has(CAFE)).toBe(false);
        expect(tallies.get(GROCERY)).toEqual({ count: 0, sats: 0n, whole: true });
      }
    }
  });

  it("counts what the wallet shows completed, whatever the log could tell", () => {
    // The answer lost: the log says uncertain, the wallet paid it.
    const tallies = tally(
      [paid("a1", APPROVED + 60_000, CAFE, { outcome: "uncertain" })],
      [approved(CAFE)],
      [sent("a1", APPROVED + 61_000)]
    );
    expect(tallies.get(CAFE)).toEqual({ count: 1, sats: 2_000n, whole: true });
  });

  it("never counts a payment the wallet shows failed, though the log says sent", () => {
    // Noted sent once the wallet took it, failed on its way since (no route).
    const tallies = tally(
      [paid("a1", APPROVED + 60_000, CAFE), paid("a2", APPROVED + DAY, CAFE)],
      [approved(CAFE)],
      [sent("a1", APPROVED + 61_000), sent("a2", APPROVED + DAY + 1000, "failed")]
    );
    expect(tallies.get(CAFE)).toEqual({ count: 1, sats: 2_000n, whole: true });
  });

  it("counts once an invoice refused, then paid when the point of sale presented it again", () => {
    // The same invoice, two taps: the first refused (balance too low), the second paid.
    const refused = paid("t1", APPROVED + DAY, CAFE, {
      outcome: "declined",
      reason: "insufficient_balance",
      paymentHash: hashOf("h1")
    });
    const paidAgain = paid("t2", APPROVED + DAY + 20_000, CAFE, { paymentHash: hashOf("h1") });
    expect(
      tally([refused, paidAgain], [approved(CAFE)], [sent("h1", APPROVED + DAY + 21_000)]).get(CAFE)
    ).toEqual({ count: 1, sats: 2_000n, whole: true });
    // Only the refusal known (the payment's record not published yet): the wallet's payment of
    // that invoice is told by no record of a payment.
    expect(
      tally([refused], [approved(CAFE)], [sent("h1", APPROVED + DAY + 21_000)]).has(CAFE)
    ).toBe(false);
    // Refused before the approval, paid after it (not published yet): not proven "0" either.
    const early = { ...refused, at: APPROVED - 60_000 };
    expect(tally([early], [approved(CAFE)], [sent("h1", APPROVED + 60_000)]).has(CAFE)).toBe(false);
  });

  it("counts each invoice once", () => {
    const entries = [
      paid("a1", APPROVED + 60_000, CAFE, { outcome: "uncertain" }),
      paid("a2", APPROVED + 80_000, CAFE, { paymentHash: hashOf("a1") })
    ];
    expect(tally(entries, [approved(CAFE)], [sent("a1", APPROVED + 61_000)]).get(CAFE)).toEqual({
      count: 1,
      sats: 2_000n,
      whole: true
    });
  });

  it("counts the last 90 days only for a merchant approved before them, and says so", () => {
    const tallies = tally(
      [paid("a1", HORIZON - DAY, CAFE), paid("a2", HORIZON + DAY, CAFE)],
      [approved(CAFE, HORIZON - 30 * DAY)]
    );
    expect(tallies.get(CAFE)).toEqual({ count: 1, sats: 2_000n, whole: false });
  });

  it("says no count where the card's wallet sent a payment no record tells since its approval", () => {
    // Another phone's, not published yet: it may have gone there.
    const entries = [paid("a1", APPROVED + 60_000, CAFE)];
    const tallies = tally(
      entries,
      [approved(CAFE), approved(GROCERY, APPROVED + 2 * DAY)],
      [...ledgerOf(entries), sent("x1", APPROVED + DAY)]
    );
    expect(tallies.has(CAFE)).toBe(false);
    expect(tallies.get(GROCERY)).toEqual({ count: 0, sats: 0n, whole: true });
    // Pending, or without its hash: told by no record either.
    expect(tally([], [approved(CAFE)], [sent("x1", APPROVED + DAY, "pending")]).has(CAFE)).toBe(
      false
    );
    expect(
      tally(
        [],
        [approved(CAFE)],
        [{ at: APPROVED + DAY, paymentHash: null, status: "completed" }]
      ).has(CAFE)
    ).toBe(false);
    // Failed: nothing left.
    expect(tally([], [approved(CAFE)], [sent("x1", APPROVED + DAY, "failed")]).get(CAFE)).toEqual({
      count: 0,
      sats: 0n,
      whole: true
    });
  });

  it("counts past a payment no record tells sent before the approval, its clock aside", () => {
    const merchants = [approved(CAFE)];
    const entries = [paid("a1", APPROVED + 60_000, CAFE)];
    const counted = { count: 1, sats: 2_000n, whole: true };
    expect(
      tally(entries, merchants, [...ledgerOf(entries), sent("x1", APPROVED - 10 * 60_000)]).get(
        CAFE
      )
    ).toEqual(counted);
    // A minute before, by the wallet's clock: it may have been after, by the holder's device's.
    expect(
      tally(entries, merchants, [...ledgerOf(entries), sent("x1", APPROVED - 60_000)]).has(CAFE)
    ).toBe(false);
  });

  it("says no count for a merchant approved after the payments were read", () => {
    const tallies = tally(
      [paid("a1", APPROVED + 60_000, CAFE)],
      [approved(CAFE), approved(GROCERY, NOW + 1)]
    );
    expect(tallies.get(CAFE)).toEqual({ count: 1, sats: 2_000n, whole: true });
    expect(tallies.has(GROCERY)).toBe(false);
  });
});

describe("the card's wallet's payments at a point of sale", () => {
  function payment(changes: Partial<WalletPayment>): WalletPayment {
    return {
      id: "p1",
      direction: "send",
      status: "completed",
      amountSats: 2_000n,
      feeSats: 3n,
      timestamp: 1_760_000_000,
      network: "lightning",
      paymentHash: "AB".repeat(32),
      ...changes
    };
  }

  it("are its Lightning payments sent, as they stand, timed in ms, their hash in lowercase", () => {
    expect(
      walletSends([
        payment({}),
        payment({ id: "p2", status: "pending", paymentHash: undefined }),
        payment({ id: "p3", status: "failed" }),
        payment({ id: "p4", direction: "receive" }),
        // "Withdraw to my main balance"
        payment({ id: "p5", network: "spark", paymentHash: undefined })
      ])
    ).toEqual([
      { at: 1_760_000_000_000, paymentHash: "ab".repeat(32), status: "completed" },
      { at: 1_760_000_000_000, paymentHash: null, status: "pending" },
      { at: 1_760_000_000_000, paymentHash: "ab".repeat(32), status: "failed" }
    ]);
  });

  it("include what it sent that the SDK cannot tell, without a hash: it may have gone anywhere", () => {
    const unknown = { network: "unknown" as const, paymentHash: undefined };
    const sends = walletSends([
      payment({ id: "u1", ...unknown }),
      payment({ id: "u2", direction: "receive", ...unknown })
    ]);
    expect(sends).toEqual([{ at: 1_760_000_000_000, paymentHash: null, status: "completed" }]);
    // So no count since it is proven: it may have paid an approved merchant.
    const since = walletSends([
      payment({ id: "u1", timestamp: (APPROVED + DAY) / 1000, ...unknown })
    ]);
    expect(tally([], [approved(CAFE)], since).has(CAFE)).toBe(false);
    expect(tally([], [approved(CAFE)], []).get(CAFE)).toEqual({ count: 0, sats: 0n, whole: true });
  });
});

describe('the payments read for "Payments without confirmation"', () => {
  const apiKey = process.env.EXPO_PUBLIC_BREEZ_API_KEY;

  beforeEach(async () => {
    process.env.EXPO_PUBLIC_BREEZ_API_KEY = "test-api-key";
    nostr.resetRelays();
    await openTestAccount();
  });

  afterEach(() => {
    closeAccount();
    jest.restoreAllMocks();
    process.env.EXPO_PUBLIC_BREEZ_API_KEY = apiKey;
  });

  /** A Lightning payment the card's wallet sent at `at`, as the SDK's bindings give it. */
  function walletPayment(id: string, at: number): Record<string, unknown> {
    return {
      id,
      paymentType: sdk.PaymentType.Send,
      status: sdk.PaymentStatus.Completed,
      amount: 2_000n,
      fees: 3n,
      timestamp: BigInt(Math.floor(at / 1000)),
      method: sdk.PaymentMethod.Lightning,
      details: {
        tag: sdk.PaymentDetails_Tags.Lightning,
        inner: {
          description: undefined,
          invoice: "lnbc1fake",
          htlcDetails: { paymentHash: hashOf(id), preimage: undefined }
        }
      }
    };
  }

  it("are counted once the phone's log, a majority of the relays and the card's wallet are read", async () => {
    await paymentLog.logCardPayment(paid("a1", Date.now() - 60_000, CAFE));
    sdk.fakeCardWallet(CARD).payments = [walletPayment("a1", Date.now() - 59_000)];
    const merchants = [approved(CAFE, Date.now() - DAY)];
    const { result } = await renderHook(() => usePayeePayments(OF_CARD, merchants, 0));
    await waitFor(() => expect(result.current.status).toBe("read"));
    expect(result.current).toEqual({
      status: "read",
      tallies: new Map([[CAFE, { count: 1, sats: 2_000n, whole: true }]])
    });
  });

  it("say no count while the card's wallet sent a payment no record tells", async () => {
    await paymentLog.logCardPayment(paid("a1", Date.now() - 60_000, CAFE));
    sdk.fakeCardWallet(CARD).payments = [
      walletPayment("x1", Date.now() - 30_000),
      walletPayment("a1", Date.now() - 59_000)
    ];
    const merchants = [approved(CAFE, Date.now() - DAY)];
    const { result } = await renderHook(() => usePayeePayments(OF_CARD, merchants, 0));
    await waitFor(() => expect(result.current.status).toBe("read"));
    expect(result.current).toEqual({ status: "read", tallies: new Map() });
  });

  it("say nothing when the card's wallet cannot be read", async () => {
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    await paymentLog.logCardPayment(paid("a1", Date.now() - 60_000, CAFE));
    sdk.connect.mockRejectedValueOnce(new Error("Network error"));
    const merchants = [approved(CAFE, Date.now() - DAY)];
    const { result } = await renderHook(() => usePayeePayments(OF_CARD, merchants, 0));
    await waitFor(() => expect(result.current.status).toBe("unknown"));
    expect(
      readLog().entries.filter(
        (entry) => entry.event === "Counting a card's payments to its merchants failed"
      )
    ).toMatchObject([{ error: { kind: "WalletError", code: "connectFailed" } }]);
  });

  it("say nothing while no majority of the relays answered", async () => {
    await paymentLog.logCardPayment(paid("a1", Date.now() - 60_000, CAFE));
    for (const url of currentRelays().slice(0, 3)) nostr.unreachable.add(url);
    const merchants = [approved(CAFE, Date.now() - DAY)];
    const { result } = await renderHook(() => usePayeePayments(OF_CARD, merchants, 0));
    await waitFor(() => expect(result.current.status).toBe("unknown"), { timeout: 8000 });
  });

  it("are read again once a merchant was approved after they were: its payments since", async () => {
    await paymentLog.logCardPayment(paid("a1", Date.now() - 60_000, CAFE));
    sdk.fakeCardWallet(CARD).payments = [walletPayment("a1", Date.now() - 59_000)];
    const first = [approved(CAFE, Date.now() - DAY)];
    const { result, rerender } = await renderHook(
      ({ merchants }: { merchants: ApprovedPayee[] }) => usePayeePayments(OF_CARD, merchants, 0),
      { initialProps: { merchants: first } }
    );
    await waitFor(() => expect(result.current.status).toBe("read"));
    const queries = nostr.calls.filter((call) => call.operation === "query").length;
    // Approved meanwhile, on another device: after that read, before the next one.
    const approvedAt = Date.now() + 1;
    await new Promise((resolve) => setTimeout(resolve, 10));
    const later = [...first, approved(GROCERY, approvedAt)];
    await rerender({ merchants: later });
    await waitFor(() =>
      expect(result.current).toEqual({
        status: "read",
        tallies: new Map([
          [CAFE, { count: 1, sats: 2_000n, whole: true }],
          [GROCERY, { count: 0, sats: 0n, whole: true }]
        ])
      })
    );
    expect(nostr.calls.filter((call) => call.operation === "query").length).toBeGreaterThan(
      queries
    );
  });

  it("say nothing when this phone's log cannot be read: its payments not published may be there", async () => {
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    jest.spyOn(paymentLog, "loadCardPayments").mockRejectedValue(new Error("A newer log"));
    const merchants = [approved(CAFE, Date.now() - DAY)];
    const { result } = await renderHook(() => usePayeePayments(OF_CARD, merchants, 0));
    await waitFor(() => expect(result.current.status).toBe("unknown"));
  });
});
