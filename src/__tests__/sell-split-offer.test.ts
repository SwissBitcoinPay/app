import { SellFlow, type SellPayer } from "@/features/sell/flow";
import {
  quoteSplitSale,
  readSplitOffer,
  type SplitOffer,
  type SplitRead
} from "@/features/sell/split-offer";
import type { WalletPayment } from "@/lib/breez/types";
import { createMtPelerinApi } from "@/lib/mtpelerin/api";
import type { MtpSessionState } from "@/lib/mtpelerin/session-format";
import type { MtpSessionStore } from "@/lib/mtpelerin/session-sync";
import { salePayments, type SalePayment } from "@/lib/mtpelerin/sale";
import { splitOid } from "@/lib/mtpelerin/split";
import type { MtpBankAccount, MtpPerson } from "@/lib/mtpelerin/types";

import { scenarioServer, type Scenario } from "../../jest/mtpelerin-fake/scenarios";
import type { FakeMtPelerin } from "../../jest/mtpelerin-fake/server";

/*
 * The split's sale proposed (src/features/sell/split-offer.ts),
 * against the fake Mt Pelerin of the tests: what is proposed of the wallet's receipts, where the
 * last sale stands, and why less than the share is proposed. The fake's rate: 84,318 CHF a
 * bitcoin, 1.3% of fees.
 */

const ADDRESS = "merchant@breez.tips";
const PHONE = "+41791234567";
const DAY = 24 * 60 * 60_000;

function memorySessions(): MtpSessionStore {
  let state: MtpSessionState = { refreshToken: null, sessionAt: 0, paidValidations: [] };
  return {
    load: async () => state,
    keep: async (refreshToken) => {
      state = { ...state, refreshToken, sessionAt: Date.now() };
    },
    refused: async () => null,
    recordPaid: async (paid) => {
      state = { ...state, paidValidations: [...state.paidValidations, paid] };
    },
    settled: async () => undefined
  };
}

/** The account's wallet: its balance, its payments, and what it paid of the fake's invoices. */
function testWallet(server: FakeMtPelerin) {
  const wallet = { balance: 10_000_000n, payments: [] as WalletPayment[], paysMtPelerin: true };
  let next = 0;
  const add = (patch: Partial<WalletPayment>): WalletPayment => {
    next += 1;
    const payment: WalletPayment = {
      id: `payment-${next}`,
      direction: "receive",
      status: "completed",
      amountSats: 0n,
      feeSats: 0n,
      timestamp: Math.floor(server.now() / 1000) - 60,
      network: "lightning",
      ...patch
    };
    wallet.payments.push(payment);
    return payment;
  };
  const payer: SellPayer = {
    quote: async (invoice) => ({ amountSats: invoice.amountSats, feeSats: 2n }),
    covers: async (quote) => wallet.balance >= quote.amountSats + quote.feeSats,
    balance: async () => wallet.balance,
    paidSince: async (since) =>
      salePayments(wallet.payments.filter((payment) => payment.timestamp >= since)),
    confirm: async () => true,
    pay: async (quote) => {
      // Told to Mt Pelerin, or only held by the wallet (Mt Pelerin has not read it yet).
      if (wallet.paysMtPelerin && !server.payInvoice(quote.invoice.pr)) throw new Error("Refused");
      wallet.balance -= quote.amountSats + quote.feeSats;
      add({
        direction: "send",
        amountSats: quote.amountSats,
        feeSats: quote.feeSats,
        paymentHash: quote.invoice.paymentHash,
        timestamp: Math.floor(server.now() / 1000)
      });
    }
  };
  return {
    wallet,
    payer,
    receive: (amountSats: bigint, agoSeconds = 60) =>
      add({ amountSats, timestamp: Math.floor(server.now() / 1000) - agoSeconds })
  };
}

async function setUp(scenario: Scenario = "ready") {
  const server = scenarioServer(scenario, ADDRESS);
  // A fixed clock: mid-November, so that a month's sales stay in the month.
  let now = Date.UTC(2026, 10, 15, 12);
  server.now = () => now;
  const { wallet, payer, receive } = testWallet(server);
  const flow = new SellFlow({
    api: createMtPelerinApi((request) => server.handle(request)),
    sessions: memorySessions(),
    lightningAddress: ADDRESS,
    appVersion: "3.0.0",
    language: "fr",
    network: "bc",
    payer,
    recordSale: async () => undefined,
    referralCode: "",
    walletLogin: null,
    nowMs: () => server.now()
  });
  await flow.start();
  await flow.submitPhone("079 123 45 67");
  await flow.submitCode(server.smsCode);
  const view = flow.getState().view;
  if (view.name !== "ready") throw new Error(`Not ready: ${view.name}`);
  const { person, accounts } = view.ready;
  const account = accounts[0]!;
  const settings = {
    bitcoinPercent: 80,
    splitSince: Math.floor(now / 1000) - 30 * 24 * 3600,
    legacyTransfers: [] as string[]
  };
  // Since when each reading of the wallet's payments went (Unix seconds), and whether it fails.
  const walletReads: number[] = [];
  const walletRead = { fails: false };
  const read = (patch: { person?: MtpPerson; account?: MtpBankAccount } = {}) =>
    readSplitOffer({
      flow,
      person: patch.person ?? person,
      account: patch.account ?? account,
      settings,
      readPayments: async (since) => {
        if (walletRead.fails) throw new Error("Wallet closed");
        walletReads.push(since);
        return wallet.payments.filter((payment) => payment.timestamp >= since);
      },
      nowMs: () => server.now()
    });
  const offerOf = (result: SplitRead): SplitOffer => {
    if (result.kind !== "offer") throw new Error(`No offer: ${result.kind}`);
    return result.offer;
  };
  /** Sells `offer` as the panel does: its order, then its payment. */
  const sell = async (offer: SplitOffer) => {
    const quoted = await quoteSplitSale(flow, offer);
    if (!quoted.ok) throw new Error(quoted.issue);
    await expect(flow.paySale(quoted.quote)).resolves.toBe("paid");
    return quoted.quote;
  };
  return {
    server,
    flow,
    wallet,
    payer,
    walletReads,
    walletRead,
    receive,
    person,
    account,
    settings,
    read,
    offerOf,
    sell,
    later: (ms: number) => {
      now += ms;
    }
  };
}

beforeEach(() => {
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("the split's sale proposed", () => {
  it("proposes the fiat share of what the wallet received since the split was set", async () => {
    const { receive, read, offerOf, account, settings, server } = await setUp();
    receive(60_000n, 3600);
    const latest = receive(40_000n, 120);
    const offer = offerOf(await read());
    expect(offer).toMatchObject({
      since: settings.splitSince,
      fiatPercent: 20,
      due: { receivedSats: 100_000n, receipts: 2, dueSats: 20_000n, checkpoint: latest.timestamp },
      account,
      sats: 20_000n,
      short: null
    });
    // Mt Pelerin's estimate of those sats: 260 of fees, 16.64 CHF.
    expect(offer.estimate).toMatchObject({
      sourceAmount: { units: 20_000n, scale: 0 },
      destAmount: { units: 1_664n, scale: 2 },
      fees: { total: { units: 260n, scale: 0 } }
    });
    // Nothing is made at Mt Pelerin before the merchant says so.
    expect(server.requests.some(({ path }) => path === "/orders/create")).toBe(false);
  });

  it("proposes nothing without a fiat share, a receipt, or enough to wire anything", async () => {
    const { receive, read, settings, server } = await setUp();
    await expect(read()).resolves.toEqual({ kind: "none" });
    // 50 sats: a share of 10 sats, 0.00 CHF once its fees are taken.
    receive(50n);
    await expect(read()).resolves.toEqual({ kind: "none" });
    receive(100_000n);
    settings.bitcoinPercent = 100;
    const before = server.requests.length;
    await expect(read()).resolves.toEqual({ kind: "none" });
    // All in bitcoin: Mt Pelerin is not even asked.
    expect(server.requests).toHaveLength(before);
  });

  it("counts from the last sale on: sold once, the receipts are never proposed again", async () => {
    const { receive, read, offerOf, sell, server, wallet, later } = await setUp();
    receive(100_000n);
    const first = offerOf(await read());
    const quote = await sell(first);
    // A deferred sell that carries the checkpoint of what it counted.
    const body = server.requests.find(({ path }) => path === "/orders/create")?.body;
    expect(body).toMatchObject({
      amount_in: 20_000,
      oid: splitOid(first.due.checkpoint),
      withdraw: "manual"
    });
    expect(quote.deferred).toBe(true);
    expect(wallet.balance).toBe(10_000_000n - 20_002n);
    await expect(read()).resolves.toEqual({ kind: "none" });
    // What came after it is proposed, and only that.
    later(3600_000);
    receive(50_000n);
    const second = offerOf(await read());
    expect(second).toMatchObject({
      since: first.due.checkpoint,
      due: { receivedSats: 50_000n, dueSats: 10_000n },
      sats: 10_000n
    });
  });

  it("finds a sale Mt Pelerin has not read yet by its payment, and one made weeks ago", async () => {
    const { receive, read, offerOf, sell, wallet, later } = await setUp();
    receive(100_000n);
    const first = offerOf(await read());
    // Paid by the wallet, not told to Mt Pelerin: its order has no transaction yet.
    wallet.paysMtPelerin = false;
    await sell(first);
    await expect(read()).resolves.toEqual({ kind: "none" });
    // Three weeks on (beyond the first period read), the same.
    later(21 * DAY);
    await expect(read()).resolves.toEqual({ kind: "none" });
    receive(10_000n);
    expect(offerOf(await read())).toMatchObject({ since: first.due.checkpoint, sats: 2_000n });
  });

  it("reads the wallet's payments since the last sale only, never since the split's start", async () => {
    const { receive, read, offerOf, sell, wallet, walletReads, settings, later } = await setUp();
    receive(100_000n);
    // Nothing sold yet: what was received since the split's start counts.
    const first = offerOf(await read());
    expect(walletReads).toEqual([settings.splitSince]);
    await sell(first);
    // Told by Mt Pelerin (funded): the receipts since that sale only, once.
    walletReads.length = 0;
    later(3600_000);
    receive(50_000n);
    expect(offerOf(await read())).toMatchObject({ since: first.due.checkpoint });
    expect(walletReads).toEqual([first.due.checkpoint]);

    // A sale the wallet paid and Mt Pelerin has not told yet: its payment looked for from its
    // order's creation (an hour earlier for the clocks' gap), the receipts after it then.
    const second = offerOf(await read());
    wallet.paysMtPelerin = false;
    const sold = await sell(second);
    walletReads.length = 0;
    await expect(read()).resolves.toEqual({ kind: "none" });
    // Its creation: its rate's lock less the 60 minutes it lasts.
    expect(walletReads).toEqual([sold.order.expiresAt - 3600 - 3600]);
    expect(Math.min(...walletReads)).toBeGreaterThan(first.due.checkpoint);
  });

  it("proposes nothing when the wallet cannot tell whether a sale was paid", async () => {
    const { receive, read, offerOf, sell, wallet, walletRead } = await setUp();
    receive(100_000n);
    const offer = offerOf(await read());
    wallet.paysMtPelerin = false;
    await sell(offer);
    // Never "unpaid" on a reading that failed: its receipts would be proposed twice.
    walletRead.fails = true;
    await expect(read()).rejects.toThrow("Wallet closed");
  });

  it("proposes again what a sale quoted and never paid counted", async () => {
    const { receive, read, offerOf, flow } = await setUp();
    receive(100_000n);
    const offer = offerOf(await read());
    const quoted = await quoteSplitSale(flow, offer);
    expect(quoted.ok).toBe(true);
    // The passkey dismissed, the rate over: its order sold nothing.
    expect(offerOf(await read())).toMatchObject({ sats: 20_000n, since: offer.since });
  });

  it("leaves out a card's return and the v2 wallet's coins", async () => {
    const { receive, read, offerOf, wallet, settings } = await setUp();
    receive(100_000n);
    const migrated = receive(900_000n);
    migrated.network = "bitcoin";
    migrated.txId = "ab".repeat(32);
    settings.legacyTransfers = [migrated.txId];
    const returned = receive(500_000n);
    returned.network = "spark";
    expect(wallet.payments).toHaveLength(3);
    expect(offerOf(await read())).toMatchObject({
      due: { receivedSats: 100_000n, receipts: 1 },
      sats: 20_000n
    });
  });

  it("sells what Mt Pelerin's limits leave to a profile not identified, and says why", async () => {
    // 420,01 CHF sold this month: 578,99 CHF left of the month's 999.
    const { receive, read, offerOf, person, server } = await setUp("readyWithSales");
    receive(5_000_000n);
    const listed = server.requests.length;
    const offer = offerOf(await read());
    expect(offer.due.dueSats).toBe(1_000_000n);
    // The orders read to find the last sale count in the limits as they are: the year's are read
    // up to where that search began, never twice (a period up to now once).
    const lists = server.requests
      .slice(listed)
      .filter(({ path }) => path === "/orders/status")
      .map(({ query }) => query?.toDate);
    expect(lists.length).toBeGreaterThan(1);
    expect(new Set(lists).size).toBe(lists.length);
    expect(lists.slice(1).every((day) => (day ?? "") < (lists[0] ?? ""))).toBe(true);
    // 686 674 sats at 0,00084318 CHF: 578,99 CHF, fees included.
    expect(offer).toMatchObject({ sats: 686_674n, short: "limit" });
    expect(offer.estimate.sourceAmount).toEqual({ units: 686_674n, scale: 0 });
    // Identified at Mt Pelerin: the whole share.
    const identified = offerOf(await read({ person: { ...person, kycLevel: 2 } }));
    expect(identified).toMatchObject({ sats: 1_000_000n, short: null });
    // A company's file is approved at 4.
    const company = { ...person, type: "company" as const };
    expect(offerOf(await read({ person: { ...company, kycLevel: 2 } })).short).toBe("limit");
    expect(offerOf(await read({ person: { ...company, kycLevel: 4 } })).short).toBeNull();
  });

  it("asks to be identified when the limits leave nothing to sell", async () => {
    const { receive, read, server, person } = await setUp("readyWithSales");
    // The rest of the month's 999 CHF, sold today.
    server.seedSale(PHONE, { sats: 690_000n, at: server.now() - 3600_000 });
    receive(5_000_000n);
    const result = await read();
    expect(result).toMatchObject({
      kind: "identify",
      fiatPercent: 20,
      due: { dueSats: 1_000_000n }
    });
    await expect(read({ person: { ...person, kycLevel: 2 } })).resolves.toMatchObject({
      kind: "offer",
      offer: { sats: 1_000_000n, short: null }
    });
  });

  it("sells what the wallet still holds when the share was spent, and says why", async () => {
    const { receive, read, offerOf, wallet } = await setUp();
    receive(100_000n);
    // Sent elsewhere since: 5 000 sats left, 50 of them kept for the payment's fees.
    wallet.balance = 5_000n;
    expect(offerOf(await read())).toMatchObject({
      due: { dueSats: 20_000n },
      sats: 4_950n,
      short: "balance"
    });
    // A small balance keeps 10 sats at least.
    wallet.balance = 500n;
    expect(offerOf(await read())).toMatchObject({ sats: 490n, short: "balance" });
    wallet.balance = 0n;
    await expect(read()).resolves.toEqual({ kind: "none" });
  });

  it("never counts nor lists an order the panel made and nobody paid", async () => {
    // 420,01 CHF sold this month: 578,99 CHF left of the month's 999.
    const { receive, read, offerOf, flow, payer, server, later } = await setUp("readyWithSales");
    receive(5_000_000n);
    const first = offerOf(await read());
    expect(first).toMatchObject({ sats: 686_674n, short: "limit" });
    // The panel opened: its order made at Mt Pelerin, its rate locked, then closed unpaid.
    const quoted = await quoteSplitSale(flow, first);
    if (!quoted.ok) throw new Error(quoted.issue);
    const oid = splitOid(first.due.checkpoint);
    // Read again: the same limit, as if that order did not exist (it never will be paid)…
    expect(offerOf(await read())).toMatchObject({ sats: 686_674n, short: "limit" });
    // …nor among the year's sales ("Your sales", "Sale limits").
    const year = Date.UTC(2026, 0, 1);
    const listed = await flow.orders(year);
    expect(listed?.length).toBeGreaterThan(0);
    expect(listed?.some((order) => order.oid === oid)).toBe(false);
    // The wallet not read: every order kept as Mt Pelerin lists it, never a sale hidden on a guess.
    payer.paidSince = async () => {
      throw new Error("Wallet closed");
    };
    expect((await flow.orders(year))?.some((order) => order.oid === oid)).toBe(true);
    expect(server.ordersOfUser().length).toBe((listed?.length ?? 0) + 1);
    // A day after its rate's lock ended without funds it sold nothing: the wallet is no longer
    // read for it (never months of payments for the orders the panel made).
    later(26 * 3600_000);
    const asked = jest.fn(async () => new Map<string, SalePayment>());
    payer.paidSince = asked;
    expect((await flow.orders(year))?.some((order) => order.oid === oid)).toBe(false);
    expect(asked).not.toHaveBeenCalled();
  });

  it("counts a sale paid just before the share changed against the limits", async () => {
    const { receive, read, offerOf, flow, wallet, settings, later } = await setUp("readyWithSales");
    receive(5_000_000n);
    const offer = offerOf(await read());
    const quoted = await quoteSplitSale(flow, offer);
    if (!quoted.ok) throw new Error(quoted.issue);
    wallet.paysMtPelerin = false;
    await expect(flow.paySale(quoted.quote)).resolves.toBe("paid");
    // The share changed a minute later: the split counts from then on, the sale not told yet.
    later(60_000);
    settings.bitcoinPercent = 70;
    settings.splitSince = Math.floor(Date.UTC(2026, 10, 15, 12, 1) / 1000);
    later(60_000);
    receive(5_000_000n, 10);
    // That sale used what the month's limit left: the share waits for the identity.
    await expect(read()).resolves.toMatchObject({ kind: "identify" });
  });

  it("counts a sale the wallet paid and Mt Pelerin has not told yet against the limits", async () => {
    const { receive, read, offerOf, flow, wallet } = await setUp("readyWithSales");
    receive(5_000_000n);
    const offer = offerOf(await read());
    expect(offer).toMatchObject({ sats: 686_674n, short: "limit" });
    const quoted = await quoteSplitSale(flow, offer);
    if (!quoted.ok) throw new Error(quoted.issue);
    // Paid by the wallet, not told to Mt Pelerin yet: that sale's receipts are done with…
    wallet.paysMtPelerin = false;
    await expect(flow.paySale(quoted.quote)).resolves.toBe("paid");
    await expect(read()).resolves.toEqual({ kind: "none" });
    expect(
      (await flow.orders(Date.UTC(2026, 0, 1)))?.some(
        (order) => order.oid === splitOid(offer.due.checkpoint)
      )
    ).toBe(true);
    // …and it used what the month's limit left: received since, the share waits for the identity.
    receive(5_000_000n, 10);
    await expect(read()).resolves.toMatchObject({ kind: "identify" });
  });
});
