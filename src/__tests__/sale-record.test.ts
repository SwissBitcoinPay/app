import { bytesToHex } from "@noble/hashes/utils.js";
import { renderHook, waitFor } from "@testing-library/react-native";

import type { PointOfSaleProfile, Sale } from "@/features/terminal/pos";
import type { ChargeState } from "@/features/terminal/useCharge";
import { useSaleRecord } from "@/features/team/useSaleRecord";
import { decodeBolt11 } from "@/lib/lightning/bolt11";
import type { Invoice } from "@/lib/lightning/lnurl";
import { deriveSaleKeys } from "@/lib/registry/registry";
import { deriveMemberKeys } from "@/lib/team/keys";
import {
  memberRecordsOf,
  saleEvent,
  saleRecordKey,
  type MemberSale
} from "@/lib/team/member-records";

import { loadFollowedSales, resetFollowedSales } from "@/features/terminal/sale-follow";

import { taprootAddress } from "../../jest/bitcoin";
import { makeInvoice, preimagePair } from "../../jest/lightning";

jest.mock("../features/team/member", () => ({
  recordSale: jest.fn(),
  recordSaleVerdict: jest.fn(async () => "published")
}));
const { recordSale, recordSaleVerdict } = jest.requireMock<{
  recordSale: jest.Mock;
  recordSaleVerdict: jest.Mock;
}>("../features/team/member");

const NOW = 1_790_000_000;
const TXID = "ab".repeat(32);
const profile = {
  version: 2,
  walletId: "02".padEnd(66, "1"),
  backupKey: "aa".repeat(32),
  lightningAddress: "sattleme02c6047f94@breez.tips",
  businessName: "Fine Bakery",
  currency: "CHF"
} as PointOfSaleProfile;
const sale: Sale = {
  minor: 500,
  sats: 10_000n,
  note: "Table 4",
  tappedAt: NOW * 1000,
  key: new Uint8Array(32).fill(5),
  relays: [],
  basket: null
};

function invoice(n: number, timestamp = NOW): Invoice {
  const pr = makeInvoice({
    amountMsat: 10_000_000n,
    paymentHash: preimagePair(n).paymentHash,
    timestamp,
    expirySeconds: 600
  });
  return { pr, decoded: decodeBolt11(pr)!, verifyUrl: "https://breez.tips/lnurlp/verify/x" };
}

/** The sale's terms besides its amount: its digits, start, end and tolerance. */
const TERMS = {
  digits: 2,
  startsAt: NOW,
  endsAt: NOW + 600,
  tolerance: 0,
  declared: true,
  taker: null
};

const open = (shown: Invoice): ChargeState => ({
  phase: "open",
  invoice: shown,
  hour: NOW - (NOW % 3600),
  sats: 10_000n,
  invoiceExpiresAt: NOW + 600,
  endsAt: NOW + 600,
  address: null,
  onchainUnavailable: null
});

beforeEach(() => {
  recordSale.mockClear();
  recordSaleVerdict.mockClear();
  jest.useFakeTimers({ now: NOW * 1000 });
});
afterEach(() => jest.useRealTimers());

describe("useSaleRecord", () => {
  it("names the sale in its records, and records an underpayment as the sale sees it", async () => {
    const first = invoice(1);
    const { rerender } = await renderHook(
      (state: ChargeState) => useSaleRecord({ state, sale, profile, ...TERMS }),
      { initialProps: open(first) }
    );
    const saleId = deriveSaleKeys(sale.key).nostr.publicKey;
    expect(recordSale).toHaveBeenCalledTimes(1);
    expect(recordSale.mock.calls[0][1]).toMatchObject({
      paymentHash: first.decoded.paymentHash,
      paidAt: null,
      sale: saleId
    });
    expect(recordSale.mock.calls[0][1].underpaid).toBeUndefined();

    // 4 000 sats on-chain: underpaid, its rest not known yet, then known.
    const underpaid = (rest: bigint | null): ChargeState => ({
      phase: "underpaid",
      address: null,
      received: 4_000n,
      rest,
      topUp: null,
      txids: [TXID],
      receipts: [{ kind: "onchain", txid: TXID, sats: 4_000n, receivedAt: null }]
    });
    await rerender(underpaid(null));
    expect(recordSale).toHaveBeenCalledTimes(2);
    const seen = recordSale.mock.calls[1][1];
    expect(seen).toMatchObject({
      paymentHash: first.decoded.paymentHash,
      paidAt: null,
      sale: saleId,
      underpaid: { received: "4000", due: null, transactions: [TXID] }
    });
    // The same again: nothing more published.
    await rerender(underpaid(null));
    expect(recordSale).toHaveBeenCalledTimes(2);
    await rerender(underpaid(6_000n));
    expect(recordSale).toHaveBeenCalledTimes(3);
    const known = recordSale.mock.calls[2][1];
    expect(known.underpaid).toMatchObject({ received: "4000", due: "10000" });
    // Dated after the record it replaces.
    expect(known.underpaid.at).toBeGreaterThan(seen.underpaid.at);

    // Past the sale's end: the amount the payments fell short of (the lowest of its hours).
    await rerender({
      phase: "underpaidEnded",
      received: 4_000n,
      due: 9_500n,
      lightning: 0n,
      transactions: [{ txid: TXID, sats: 4_000n, receivedAt: NOW * 1000, confirmations: 1 }]
    });
    expect(recordSale).toHaveBeenCalledTimes(4);
    expect(recordSale.mock.calls[3][1].underpaid).toMatchObject({
      received: "4000",
      due: "9500",
      transactions: [TXID]
    });
  });

  it("publishes every record of the sale valid, each later than the one it replaces", async () => {
    const KEYS = deriveMemberKeys(new Uint8Array(32).fill(7));
    const first = invoice(1);
    const { rerender } = await renderHook(
      (state: ChargeState) => useSaleRecord({ state, sale, profile, ...TERMS }),
      { initialProps: open(first) }
    );
    // Seen underpaid in the second its invoice was shown: on its record.
    const underpaid = (topUp: Invoice | null): ChargeState => ({
      phase: "underpaid",
      address: null,
      received: 4_000n,
      rest: 6_000n,
      topUp,
      txids: [TXID],
      receipts: [{ kind: "onchain", txid: TXID, sats: 4_000n, receivedAt: null }]
    });
    await rerender(underpaid(null));
    // The rest's invoice, asked a few seconds later: a record of its own.
    jest.setSystemTime((NOW + 5) * 1000);
    const rest = invoice(2, NOW + 5);
    await rerender(underpaid(rest));
    // Paid on-chain: the rest's record says so.
    jest.setSystemTime((NOW + 9) * 1000);
    await rerender({
      phase: "paid",
      method: "onchain",
      paidAt: new Date(NOW * 1000),
      received: 10_000n,
      invoice: null,
      transactions: [],
      onchainConfirmed: true
    });

    const published: MemberSale[] = [...recordSale.mock.calls, ...recordSaleVerdict.mock.calls].map(
      ([, value]) => ({ version: 1, onchainTag: null, ...value }) as MemberSale
    );
    expect(published.some((record) => record.paidAt !== null)).toBe(true);
    // In the order published, each record at its address is later than the one before it there
    // (a relay keeps the latest, and of two as old the lowest id), and every reader accepts it.
    const latest = new Map<string, number>();
    for (const record of published) {
      const event = saleEvent(KEYS, record);
      expect(event.created_at).toBeGreaterThan(latest.get(saleRecordKey(record)) ?? 0);
      latest.set(saleRecordKey(record), event.created_at);
      expect(memberRecordsOf(KEYS, [event]).sales).toEqual([record]);
    }
  });

  it("carries the proofs of its Lightning payments on its paid record only", async () => {
    const KEYS = deriveMemberKeys(new Uint8Array(32).fill(7));
    const first = invoice(1);
    const proof = { invoice: first.pr, preimage: preimagePair(1).preimage };
    const { rerender } = await renderHook(
      (state: ChargeState) =>
        useSaleRecord({ state, sale, profile, ...TERMS, lightningProofs: [proof] }),
      { initialProps: open(first) }
    );
    // Shown: no proof yet, whatever the sale already knows.
    expect(recordSale.mock.calls[0][1].lightning).toBeUndefined();
    await rerender({
      phase: "paid",
      method: "lightning",
      paidAt: new Date((NOW + 30) * 1000),
      received: 10_000n,
      invoice: first,
      transactions: [],
      onchainConfirmed: false
    });
    await waitFor(() => expect(recordSaleVerdict).toHaveBeenCalledTimes(1));
    const paid = recordSaleVerdict.mock.calls[0][1];
    expect(paid).toMatchObject({ paymentHash: first.decoded.paymentHash, lightning: [proof] });
    // As every reader reads it back.
    const record = { version: 1, onchainTag: null, ...paid } as MemberSale;
    expect(memberRecordsOf(KEYS, [saleEvent(KEYS, record)]).sales).toEqual([record]);
  });

  it("reads a record's proofs only as written: on a paid record, each once, 64 hex digits", () => {
    const KEYS = deriveMemberKeys(new Uint8Array(32).fill(7));
    const first = invoice(1);
    const base = {
      version: 1,
      sats: "10000",
      fiat: { minor: 500, digits: 2, currency: "CHF" },
      note: "",
      createdAt: NOW,
      expiresAt: NOW + 600,
      paidAt: NOW + 30,
      onchainTag: null,
      sale: deriveSaleKeys(sale.key).nostr.publicKey,
      paymentHash: first.decoded.paymentHash,
      verifyUrl: first.verifyUrl,
      onchainAddress: null
    } as MemberSale;
    const proof = { invoice: first.pr, preimage: preimagePair(1).preimage };
    const read = (record: unknown) =>
      memberRecordsOf(KEYS, [saleEvent(KEYS, record as MemberSale)]).sales;
    expect(read({ ...base, lightning: [proof] })).toHaveLength(1);
    // An older app's record has none; a record of a sale not paid never has one.
    expect(read(base)).toHaveLength(1);
    expect(read({ ...base, paidAt: null, lightning: [proof] })).toEqual([]);
    expect(read({ ...base, lightning: [proof, proof] })).toEqual([]);
    expect(read({ ...base, lightning: [{ ...proof, preimage: "AB".repeat(32) }] })).toEqual([]);
    expect(read({ ...base, lightning: [{ invoice: "", preimage: proof.preimage }] })).toEqual([]);
    expect(read({ ...base, lightning: Array(51).fill(proof) })).toEqual([]);
  });

  describe("an hour shown with the address alone", () => {
    const KEYS = deriveMemberKeys(new Uint8Array(32).fill(7));
    const ADDRESS = taprootAddress(1);
    const HOUR = NOW - (NOW % 3600);
    // Kept for its verdict with the relays of its declarations.
    const shared: Sale = { ...sale, relays: ["wss://relay.example.com"] };

    const alone = (hour = HOUR, sats = 10_000n, expiresAt = NOW + 600): ChargeState => ({
      phase: "open",
      invoice: null,
      hour,
      sats,
      invoiceExpiresAt: expiresAt,
      endsAt: NOW + 600,
      address: ADDRESS,
      onchainUnavailable: null
    });

    /** Every record published, as its device signs it. */
    const published = (): MemberSale[] =>
      [...recordSale.mock.calls, ...recordSaleVerdict.mock.calls].map(
        ([, value]) => ({ version: 1, onchainTag: null, ...value }) as MemberSale
      );

    beforeEach(async () => {
      await resetFollowedSales();
    });

    it("publishes it as a record of its own, keeps the sale for its verdict, then records it paid", async () => {
      const { rerender } = await renderHook(
        (state: ChargeState) => useSaleRecord({ state, sale: shared, profile, ...TERMS }),
        { initialProps: alone() }
      );
      const saleId = deriveSaleKeys(sale.key).nostr.publicKey;
      expect(recordSale).toHaveBeenCalledTimes(1);
      expect(recordSale.mock.calls[0][1]).toEqual({
        paymentHash: null,
        verifyUrl: null,
        hour: HOUR,
        sats: "10000",
        fiat: { minor: 500, digits: 2, currency: "CHF" },
        note: "Table 4",
        createdAt: NOW,
        expiresAt: NOW + 600,
        paidAt: null,
        onchainAddress: ADDRESS,
        sale: saleId,
        // Its own key: the owner's acceptance of it is found by it (sale-acceptance.ts).
        saleKey: bytesToHex(sale.key)
      });
      // Kept for its verdict, as a sale with an invoice is.
      await waitFor(async () => expect(await loadFollowedSales()).toHaveLength(1));
      const [followed] = await loadFollowedSales();
      expect(followed.address).toBe(ADDRESS);
      expect(followed.invoice).toEqual({
        paymentHash: null,
        verifyUrl: null,
        hour: HOUR,
        sats: "10000",
        createdAt: NOW,
        expiresAt: NOW + 600
      });

      // 4 000 sats on-chain: underpaid, on the same record.
      jest.setSystemTime((NOW + 5) * 1000);
      await rerender({
        phase: "underpaid",
        address: ADDRESS,
        received: 4_000n,
        rest: 6_000n,
        topUp: null,
        txids: [TXID],
        receipts: [{ kind: "onchain", txid: TXID, sats: 4_000n, receivedAt: null }]
      });
      expect(recordSale).toHaveBeenCalledTimes(2);
      expect(recordSale.mock.calls[1][1]).toMatchObject({
        paymentHash: null,
        hour: HOUR,
        underpaid: { received: "4000", due: "10000", transactions: [TXID] }
      });

      // Paid on-chain: on the same record again.
      jest.setSystemTime((NOW + 9) * 1000);
      await rerender({
        phase: "paid",
        method: "onchain",
        paidAt: new Date((NOW + 8) * 1000),
        received: 10_000n,
        invoice: null,
        transactions: [],
        onchainConfirmed: true
      });
      await waitFor(() => expect(recordSaleVerdict).toHaveBeenCalledTimes(1));
      expect(recordSaleVerdict.mock.calls[0][1]).toMatchObject({
        paymentHash: null,
        hour: HOUR,
        onchainAddress: ADDRESS
      });
      expect(recordSaleVerdict.mock.calls[0][1].paidAt).toBeGreaterThan(NOW + 5);
      // Recorded: nothing more to follow.
      await waitFor(async () => expect(await loadFollowedSales()).toHaveLength(0));

      // One address, each version later than the one before it there, every reader taking it.
      const latest = new Map<string, number>();
      for (const record of published()) {
        const event = saleEvent(KEYS, record);
        expect(event.created_at).toBeGreaterThan(latest.get(saleRecordKey(record)) ?? 0);
        latest.set(saleRecordKey(record), event.created_at);
        expect(memberRecordsOf(KEYS, [event]).sales).toEqual([record]);
      }
      expect(latest.size).toBe(1);
    });

    it("gives each hour its own record, an invoice's and the address alone's apart", async () => {
      const first = invoice(1);
      const { rerender } = await renderHook(
        (state: ChargeState) => useSaleRecord({ state, sale: shared, profile, ...TERMS }),
        { initialProps: { ...open(first), address: ADDRESS } as ChargeState }
      );
      // The next hour: above the most the Lightning address accepts.
      jest.setSystemTime((NOW + 300) * 1000);
      await rerender(alone(HOUR + 3600, 12_500n));
      // The same again: nothing more.
      await rerender(alone(HOUR + 3600, 12_500n));

      expect(recordSale).toHaveBeenCalledTimes(2);
      const [invoiceRecord, aloneRecord] = published();
      expect(invoiceRecord.paymentHash).toBe(first.decoded.paymentHash);
      expect(aloneRecord).toMatchObject({ paymentHash: null, hour: HOUR + 3600, sats: "12500" });
      const events = published().map((record) => saleEvent(KEYS, record));
      expect(
        new Set(events.map((event) => event.tags.find(([name]) => name === "d")?.[1])).size
      ).toBe(2);
      expect(memberRecordsOf(KEYS, events).sales).toHaveLength(2);
      // The sale followed on the hour shown last.
      await waitFor(async () =>
        expect((await loadFollowedSales())[0]?.invoice).toMatchObject({ paymentHash: null })
      );
    });
  });
});
