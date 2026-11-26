import { SELL_CURRENCIES, SELL_LIMITS_CHF_MINOR, SELL_REFERENCE } from "@/config/mtpelerin";
import { ofTheYear } from "@/features/sell/useOrders";
import { PAYOUT_CURRENCIES } from "@/config/payout-currencies";
import type { WalletPayment } from "@/lib/breez/types";
import {
  bankAccountChange,
  bankAccountsOf,
  changeApplied,
  knownBankAccount,
  lightningAccountsOf,
  maskedIban,
  newBankAccount,
  newLightningAccount,
  ownerNameText,
  type BankAccountInput
} from "@/lib/mtpelerin/accounts";
import {
  decimalToInteger,
  decimalToMinor,
  minorToSats,
  readDecimal,
  type MtpDecimal
} from "@/lib/mtpelerin/decimal";
import {
  INVOICE_MIN_LIFE_SECONDS,
  readExactInvoice,
  readValidationInvoice,
  validationComment
} from "@/lib/mtpelerin/invoice";
import {
  chfLeftMinor,
  countsAgainstLimits,
  grossChfMinor,
  limitsFrom,
  periodStarts,
  productMinor,
  sellLimits
} from "@/lib/mtpelerin/limits";
import {
  awaitsFunds,
  checkSellOrder,
  deferredSellFunded,
  isLightningSale,
  newSellOrder,
  orderOutcome,
  salePayments,
  saleProgress,
  sellAccountsOf,
  sellAssetOf,
  proposedSellCurrency,
  transferRoute
} from "@/lib/mtpelerin/sale";
import { wiresSomething } from "@/lib/mtpelerin/transfer-fee";
import type {
  MtpBankAccount,
  MtpConfig,
  MtpOrder,
  MtpSellOrder,
  MtpTransactionStatus
} from "@/lib/mtpelerin/types";

import { fakeInvoice } from "../../jest/mtpelerin-fake/invoice";

/*
 * The pure logic of "Sell" (src/lib/mtpelerin/): amounts read exactly, Mt Pelerin's invoices and
 * orders checked before anything is paid, a sale's progress, Mt Pelerin's limits and the accounts
 * the app creates. Mt Pelerin's figures are its dev/test environment's.
 */

const NOW = Math.floor(Date.parse("2026-10-26T17:16:13Z") / 1000);
const dec = (text: string): MtpDecimal => readDecimal(text)!;

/** An invoice of `sats` on `network`, made `age` seconds ago, 1 hour long. */
function invoice(sats: bigint, { network = "bc", age = 0 } = {}): string {
  return fakeInvoice({
    amountMsat: Number(sats * 1000n),
    network,
    description: "I hereby certify owning merchant@breez.tips",
    timestamp: NOW - age,
    expirySeconds: 3600
  }).pr;
}

const ASSET = { network: "lightning_mainnet", currency: "sat" };

const ACCOUNT: MtpBankAccount = {
  kind: "bank",
  id: "64a0c0de0000000000000004",
  status: "pending_validation",
  iban: "CH9300762011623852957",
  currency: "CHF",
  label: "Example Studio",
  owner: {
    name: { kind: "company", name: "Example Studio" },
    street: "1 Example Street",
    postcode: "1000",
    city: "Lausanne",
    country: "CH"
  }
};

/** Dev/test's order of 10 000 sats (mtpelerin-api.test.ts), its invoice the fake's. */
function sellOrder(patch: Partial<MtpSellOrder> = {}): MtpSellOrder {
  return {
    id: "5a1e0dd3000000000000000000000001",
    shortId: "Kq3Vw9Lm",
    status: "validated",
    sourceCurrency: "sat",
    sourceAmount: dec("9993.07708515"),
    destCurrency: "CHF",
    destAmount: dec("6.64"),
    expiresAt: NOW + 3600,
    rate: dec("0.00066446"),
    beneficiaryId: ACCOUNT.id,
    invoice: invoice(10_000n),
    estimate: { sourceAmount: dec("10000"), fees: { total: dec("0"), currency: "sat" } },
    ...patch
  };
}

/** A sale of the list. */
function order(patch: Partial<MtpOrder> = {}): MtpOrder {
  return {
    id: "o1",
    shortId: "Sa1B2c3D4",
    type: "fixing",
    status: "validated",
    sourceCurrency: "sat",
    sourceAmount: dec("9993.07708515"),
    destCurrency: "CHF",
    destAmount: dec("6.64"),
    sourceWithFees: dec("10043.29355292"),
    rate: dec("0.00066446"),
    network: "lightning_mainnet",
    beneficiaryId: ACCOUNT.id,
    createdAt: NOW,
    expiresAt: NOW + 3600,
    transactionStatus: "finished",
    oid: null,
    paymentHash: null,
    ...patch
  };
}

describe("Mt Pelerin's amounts (decimal.ts)", () => {
  it("reads numbers and texts as exact decimals, never as floats", () => {
    expect(readDecimal(2785.4)).toEqual({ units: 27_854n, scale: 1 });
    expect(readDecimal("13.00")).toEqual({ units: 1300n, scale: 2 });
    expect(readDecimal(" 0.00066446 ")).toEqual({ units: 66_446n, scale: 8 });
    expect(readDecimal(0)).toEqual({ units: 0n, scale: 0 });
    // 18 decimals: an asset's.
    expect(readDecimal("0.000000000000000001")).toEqual({ units: 1n, scale: 18 });
    for (const value of [
      -1,
      "-1",
      Number.NaN,
      Infinity,
      1e21,
      1e-7,
      "1e3",
      "",
      "1.",
      ".5",
      "1,5",
      null,
      {}
    ]) {
      expect(readDecimal(value)).toBeNull();
    }
    expect(readDecimal("0.0000000000000000001")).toBeNull();
  });

  it("gives minor units rounded the way asked, sats only when whole", () => {
    expect(decimalToMinor(dec("6.64"), 2, "down")).toBe(664);
    expect(decimalToMinor(dec("6.6"), 2, "down")).toBe(660);
    expect(decimalToMinor(dec("6.649"), 2, "down")).toBe(664);
    expect(decimalToMinor(dec("6.641"), 2, "up")).toBe(665);
    expect(decimalToMinor(dec("6.640"), 2, "up")).toBe(664);
    expect(decimalToMinor(dec("123456789012345"), 2, "down")).toBeNull();
    expect(decimalToInteger(dec("10000"))).toBe(10_000n);
    expect(decimalToInteger(dec("10000.000"))).toBe(10_000n);
    expect(decimalToInteger(dec("9993.07708515"))).toBeNull();
  });

  it("converts an amount typed to the sats it is worth at Mt Pelerin's rate, rounded up", () => {
    // A price of 1 sat on dev/test: 1.30 CHF is 2 392.6… sats, so 2 393, worth
    // 1.30021 CHF: never less than typed, 1.30 CHF once rounded down for display.
    const rate = dec("0.00054334");
    expect(minorToSats(130, 2, rate)).toBe(2393n);
    expect(decimalToMinor({ units: 2393n * rate.units, scale: rate.scale }, 2, "down")).toBe(130);
    // Exactly whole: no sat more.
    expect(minorToSats(1000, 2, dec("0.001"))).toBe(10_000n);
    // A currency without decimals (JPY), and 0.
    expect(minorToSats(10, 0, dec("0.084318"))).toBe(119n);
    expect(minorToSats(0, 2, rate)).toBe(0n);
    // A rate of 0 converts nothing; an amount that is not a whole number of minor units throws.
    expect(minorToSats(130, 2, dec("0.00000000"))).toBeNull();
    expect(() => minorToSats(1.5, 2, rate)).toThrow();
    expect(() => minorToSats(-1, 2, rate)).toThrow();
  });
});

describe("Mt Pelerin's invoices (invoice.ts)", () => {
  it("takes an invoice of the network and of exactly the sats expected, long enough to pay", () => {
    const pr = invoice(1n);
    expect(readValidationInvoice(pr, { network: "bc", nowSeconds: NOW })).toEqual({
      ok: true,
      invoice: {
        pr,
        amountSats: 1n,
        paymentHash: expect.stringMatching(/^[0-9a-f]{64}$/),
        description: "I hereby certify owning merchant@breez.tips",
        expiresAt: NOW + 3600
      }
    });
    expect(validationComment("merchant@breez.tips")).toBe(
      "I hereby certify owning merchant@breez.tips"
    );
  });

  it("refuses another network, another amount, an invoice about to end, or no invoice", () => {
    const read = (pr: unknown, sats = 10_000n) =>
      readExactInvoice(pr, { network: "bc", nowSeconds: NOW, amountSats: sats });
    expect(read(invoice(10_000n, { network: "tb" }))).toEqual({ ok: false, issue: "otherNetwork" });
    expect(read(invoice(10_001n))).toEqual({ ok: false, issue: "otherAmount" });
    // Mt Pelerin's documentation: "An amount other than 1 sat is treated as a normal payment".
    expect(readValidationInvoice(invoice(2n), { network: "bc", nowSeconds: NOW })).toEqual({
      ok: false,
      issue: "otherAmount"
    });
    expect(read(invoice(10_000n, { age: 3600 - INVOICE_MIN_LIFE_SECONDS + 1 }))).toEqual({
      ok: false,
      issue: "expired"
    });
    expect(read(invoice(10_000n, { age: 3600 - INVOICE_MIN_LIFE_SECONDS })).ok).toBe(true);
    expect(read("lnbc10n1nothing")).toEqual({ ok: false, issue: "malformed" });
    expect(read(42)).toEqual({ ok: false, issue: "malformed" });
    expect(read(`lnbc1${"q".repeat(3000)}`)).toEqual({ ok: false, issue: "malformed" });
  });
});

describe("a sale (sale.ts)", () => {
  const config = (decimals: number, symbol = "sat"): MtpConfig => ({
    networks: [
      {
        id: "lightning_mainnet",
        name: "Bitcoin Lightning",
        family: "lightning",
        accountType: "lightning",
        assets: [{ asset: "080", symbol, decimals }]
      }
    ]
  });

  it("sells sats on Lightning, whatever decimals Mt Pelerin counts them in, nothing else", () => {
    // dev/test's `decimals: 3`, millisats: `amount_in` is still whole sats.
    expect(sellAssetOf(config(3))).toEqual(ASSET);
    expect(sellAssetOf(config(0))).toEqual(ASSET);
    expect(sellAssetOf(config(8, "BTC"))).toBeNull();
    expect(sellAssetOf({ networks: [] })).toBeNull();
    expect(
      sellAssetOf({
        networks: [
          { ...config(3).networks[0]!, assets: [{ asset: "002", symbol: "sat", decimals: 3 }] }
        ]
      })
    ).toBeNull();
  });

  it("offers the bank accounts in a currency Mt Pelerin wires, pending ones included", () => {
    // Rated by Mt Pelerin's dev/test, never wired.
    const other = { ...ACCOUNT, id: "b2", currency: "BRL" };
    const locked = { ...ACCOUNT, id: "b3", status: "locked" };
    const active = { ...ACCOUNT, id: "b4", status: "active", currency: "EUR" };
    const swift = { ...ACCOUNT, id: "b5", currency: "USD" };
    expect(sellAccountsOf([ACCOUNT, other, locked, active, swift]).map(({ id }) => id)).toEqual([
      ACCOUNT.id,
      "b4",
      "b5"
    ]);
  });

  it('sells in the 18 currencies of the "Sell crypto" page of Mt Pelerin', () => {
    // "withdraw funds in 18 fiat currencies".
    expect([...SELL_CURRENCIES]).toEqual([
      "AUD",
      "CAD",
      "CHF",
      "CZK",
      "DKK",
      "EUR",
      "GBP",
      "HKD",
      "HUF",
      "JPY",
      "MXN",
      "NOK",
      "NZD",
      "PLN",
      "SEK",
      "SGD",
      "USD",
      "ZAR"
    ]);
    // Each has its flag and its name in the currencies' list.
    for (const code of SELL_CURRENCIES) expect(PAYOUT_CURRENCIES).toContain(code);
  });

  it("proposes the payout currency, else the display currency, else the IBAN's", () => {
    const iban = "CH9300762011623852957";
    expect(proposedSellCurrency({ payout: "USD", display: "CHF", iban })).toBe("USD");
    expect(proposedSellCurrency({ payout: null, display: "GBP", iban })).toBe("GBP");
    // Neither wired by Mt Pelerin: the IBAN's country decides, CHF without one.
    expect(proposedSellCurrency({ payout: "BRL", display: "BRL", iban })).toBe("CHF");
    expect(
      proposedSellCurrency({ payout: "BRL", display: "BRL", iban: "li21 0881 0000 2324 013a a" })
    ).toBe("CHF");
    expect(
      proposedSellCurrency({ payout: "BRL", display: "BRL", iban: "DE89370400440532013000" })
    ).toBe("EUR");
    expect(proposedSellCurrency({ payout: null, display: "BRL", iban: null })).toBe("CHF");
  });

  it("wires francs in Switzerland, euros by SEPA, any other currency by SWIFT", () => {
    expect(transferRoute("CHF")).toBe("swiss");
    expect(transferRoute("EUR")).toBe("sepa");
    for (const code of SELL_CURRENCIES.filter((code) => code !== "CHF" && code !== "EUR")) {
      expect(transferRoute(code)).toBe("swift");
    }
  });

  it("asks for a sale of whole sats with its reference", () => {
    expect(SELL_REFERENCE).toMatch(/^[A-Z0-9 /-]{1,35}$/);
    expect(
      newSellOrder({
        sats: 10_000n,
        account: ACCOUNT,
        asset: ASSET,
        reference: "SATTLEME",
        oid: "6f1d2c3b-4a59-4e68-9d7c-8b6a5f4e3d2c"
      })
    ).toEqual({
      beneficiary_id: ACCOUNT.id,
      currency_in: "sat",
      currency_out: "CHF",
      amount_in: 10_000,
      network_in: "lightning_mainnet",
      reference: "SATTLEME",
      oid: "6f1d2c3b-4a59-4e68-9d7c-8b6a5f4e3d2c",
      // "Send it on every order": the integration's token, as Mt Pelerin gives it.
      wid: "354c5694-8798-400c-9139-d4d4e9715fde"
    });
    // The split's sale: a deferred sell, its checkpoint as its reference.
    expect(
      newSellOrder({
        sats: 10_000n,
        account: ACCOUNT,
        asset: ASSET,
        reference: "SATTLEME",
        oid: "sattle-split-1:1763168400",
        deferred: true
      })
    ).toMatchObject({ oid: "sattle-split-1:1763168400", withdraw: "manual" });
    const order = (sats: bigint) => () =>
      newSellOrder({ sats, account: ACCOUNT, asset: ASSET, reference: "R", oid: "o" });
    expect(order(1n)()).not.toHaveProperty("withdraw");
    expect(order(0n)).toThrow(RangeError);
    expect(order(BigInt(Number.MAX_SAFE_INTEGER) + 1n)).toThrow(RangeError);
  });

  it("pays an order only as asked: its account, its currencies, its sats, its invoice", () => {
    const check = (sell: MtpSellOrder, sats = 10_000n, nowSeconds = NOW) =>
      checkSellOrder(sell, {
        sats,
        account: ACCOUNT,
        asset: ASSET,
        network: "bc",
        nowSeconds,
        transferFeeMinor: 0
      });
    // dev/test's: `source_amount` recomputed, the estimate and the invoice exact.
    expect(check(sellOrder())).toMatchObject({ ok: true, invoice: { amountSats: 10_000n } });
    // Without an estimate, the invoice alone tells the sats.
    expect(check(sellOrder({ estimate: null })).ok).toBe(true);
    const otherOrder = { ok: false, issue: "otherOrder" };
    expect(check(sellOrder({ beneficiaryId: "someone-else" }))).toEqual(otherOrder);
    expect(check(sellOrder({ destCurrency: "EUR" }))).toEqual(otherOrder);
    expect(check(sellOrder({ sourceCurrency: "BTC" }))).toEqual(otherOrder);
    expect(
      check(
        sellOrder({
          estimate: { sourceAmount: dec("10001"), fees: { total: dec("0"), currency: "sat" } }
        })
      )
    ).toEqual(otherOrder);
    expect(check(sellOrder({ invoice: invoice(10_001n) }))).toEqual({
      ok: false,
      issue: "otherAmount"
    });
    expect(check(sellOrder({ invoice: invoice(10_000n, { network: "tb" }) }))).toEqual({
      ok: false,
      issue: "otherNetwork"
    });
    // Its rate no longer locked.
    expect(check(sellOrder(), 10_000n, NOW + 3600)).toEqual({ ok: false, issue: "orderExpired" });
    // Locked for less than a payment's margin, its invoice still long: never paid in its last
    // seconds, which would reach Mt Pelerin once the lock ended.
    const later = sellOrder({ invoice: invoice(10_000n, { age: -3600 }) });
    expect(check(later, 10_000n, NOW + 3600 - INVOICE_MIN_LIFE_SECONDS).ok).toBe(true);
    expect(check(later, 10_000n, NOW + 3600 - INVOICE_MIN_LIFE_SECONDS + 1)).toEqual({
      ok: false,
      issue: "orderExpired"
    });
  });

  it("never sells for nothing: a sale wires at least the currency's smallest unit", () => {
    // What is received is rounded down, as it is shown: 0.009 CHF is nothing.
    expect(wiresSomething(dec("0.01"), "CHF", 0)).toBe(true);
    expect(wiresSomething(dec("0.019"), "EUR", 0)).toBe(true);
    expect(wiresSomething(dec("0"), "CHF", 0)).toBe(false);
    expect(wiresSomething(dec("0.00"), "EUR", 0)).toBe(false);
    expect(wiresSomething(dec("0.009999"), "CHF", 0)).toBe(false);
    // A currency without decimals: its unit.
    expect(wiresSomething(dec("1"), "JPY", 0)).toBe(true);
    expect(wiresSomething(dec("0.99"), "JPY", 0)).toBe(false);
    // Past what a number holds: something.
    expect(wiresSomething(dec("999999999999999"), "CHF", 0)).toBe(true);
    // Mt Pelerin's transfer fee taken (transfer-fee.ts): 1.01 CHF wired at once leaves 0.01 CHF.
    expect(wiresSomething(dec("1.01"), "CHF", 100)).toBe(true);
    expect(wiresSomething(dec("1.009"), "CHF", 100)).toBe(false);
    expect(wiresSomething(dec("0.80"), "CHF", 100)).toBe(false);

    // dev/test takes an order of 1 sat for 0 CHF: its invoice is exact, never paid.
    const check = (sell: MtpSellOrder, sats: bigint, transferFeeMinor = 0) =>
      checkSellOrder(sell, {
        sats,
        account: ACCOUNT,
        asset: ASSET,
        network: "bc",
        nowSeconds: NOW,
        transferFeeMinor
      });
    const tiny = (destAmount: string) =>
      sellOrder({
        destAmount: dec(destAmount),
        invoice: invoice(1n),
        estimate: { sourceAmount: dec("1"), fees: { total: dec("0"), currency: "sat" } }
      });
    expect(check(tiny("0"), 1n)).toEqual({ ok: false, issue: "nothingWired" });
    expect(check(tiny("0.004"), 1n)).toEqual({ ok: false, issue: "nothingWired" });
    expect(check(tiny("0.01"), 1n)).toMatchObject({ ok: true, invoice: { amountSats: 1n } });
    // Wired at once below Mt Pelerin's threshold: never paid when its transfer fee takes it all.
    expect(check(tiny("1.00"), 1n, 100)).toEqual({ ok: false, issue: "nothingWired" });
    expect(check(tiny("1.01"), 1n, 100)).toMatchObject({ ok: true });
    // Another order is told first: an order not asked for is not read further.
    expect(check(tiny("0"), 2n)).toEqual({ ok: false, issue: "otherOrder" });
  });

  const status = (patch: Partial<MtpTransactionStatus> = {}): MtpTransactionStatus => ({
    orderId: "o1",
    orderStatus: "validated",
    orderType: "fixing",
    groupId: "abc123",
    currentStatus: "pending",
    inStatus: "pending",
    forexStatus: null,
    outStatus: null,
    destAmount: null,
    destCurrency: null,
    destIdentifier: null,
    ...patch
  });

  it("reads a sale's progress as the widget's status page does", () => {
    const at = { expiresAt: NOW + 3600, nowSeconds: NOW };
    // No funds yet: `{ "order": … }` alone. Nothing told as being received.
    const none = status({ groupId: null, currentStatus: null, inStatus: null });
    expect(saleProgress(none, at)).toEqual({
      outcome: "awaitingPayment",
      received: "todo",
      converted: "todo",
      transferred: "todo"
    });
    expect(saleProgress(none, { ...at, nowSeconds: NOW + 3600 })).toMatchObject({
      outcome: "expired",
      received: "failed"
    });
    expect(saleProgress({ ...none, orderStatus: "cancelled" }, at).outcome).toBe("failed");
    // The order finished without a transaction: wired, as the list reads it.
    expect(
      saleProgress({ ...none, orderStatus: "finished" }, { ...at, nowSeconds: NOW + 3600 })
    ).toEqual({ outcome: "sent", received: "done", converted: "done", transferred: "done" });
    expect(saleProgress(status({ inStatus: "finished", forexStatus: "pending" }), at)).toEqual({
      outcome: "inProgress",
      received: "done",
      converted: "now",
      transferred: "todo"
    });
    expect(
      saleProgress(
        status({ inStatus: "finished", forexStatus: "finished", outStatus: "delayed" }),
        at
      )
    ).toMatchObject({ outcome: "delayed", transferred: "now" });
    expect(saleProgress(status({ inStatus: "onhold" }), at).outcome).toBe("held");
    expect(saleProgress(status({ currentStatus: "waiting_refund" }), at).outcome).toBe("refunded");
    expect(saleProgress(status({ currentStatus: "rejected" }), at).outcome).toBe("failed");
    // Done: every step done, whatever the steps' own words.
    expect(saleProgress(status({ currentStatus: "finished", outStatus: "validated" }), at)).toEqual(
      {
        outcome: "sent",
        received: "done",
        converted: "done",
        transferred: "done"
      }
    );
  });

  it("reads a deferred sell paid as received, though it never has a transaction", () => {
    // Production's answer for a deferred sell paid: `{ "order": … }` alone, the order
    // `type: "spot"`, `status: "validated"`, read after its rate's deadline.
    const paid = status({
      orderType: "spot",
      groupId: null,
      currentStatus: null,
      inStatus: null
    });
    const late = { expiresAt: NOW + 3600, nowSeconds: NOW + 7200 };
    const held = {
      outcome: "inProgress",
      received: "done",
      converted: "done",
      transferred: "todo"
    };
    expect(saleProgress(paid, late)).toEqual(held);
    expect(saleProgress(paid, { ...late, nowSeconds: NOW })).toEqual(held);
    // Created `pending`: nothing received yet, then nothing sold once its rate ended.
    const unpaid = { ...paid, orderStatus: "pending" };
    expect(saleProgress(unpaid, { ...late, nowSeconds: NOW })).toMatchObject({
      outcome: "awaitingPayment",
      received: "todo"
    });
    expect(saleProgress(unpaid, late)).toMatchObject({ outcome: "expired", received: "failed" });
    // A sell wired at once is `validated` from its creation: its status alone proves nothing.
    expect(saleProgress({ ...paid, orderType: "fixing" }, late).outcome).toBe("expired");
    expect(saleProgress({ ...paid, orderType: null }, late).outcome).toBe("expired");
    expect(deferredSellFunded({ type: "spot", status: "validated" })).toBe(true);
    expect(deferredSellFunded({ type: "spot", status: "pending" })).toBe(false);
    expect(deferredSellFunded({ type: "spot", status: "cancelled" })).toBe(false);
    expect(deferredSellFunded({ type: "fixing", status: "validated" })).toBe(false);
    expect(deferredSellFunded({ type: null, status: "validated" })).toBe(false);
  });

  it("reads a sale Mt Pelerin tells no funds of from the wallet's payment of its invoice", () => {
    const pending = status({
      orderStatus: "pending",
      orderType: "spot",
      groupId: null,
      currentStatus: null,
      inStatus: null
    });
    const at = { expiresAt: NOW + 3600, nowSeconds: NOW };
    // Sent: the sats received (the payment's preimage), their processing begun; after its rate's
    // deadline too: never "expired" once they left.
    const sent = { outcome: "inProgress", received: "done", converted: "now", transferred: "todo" };
    expect(saleProgress(pending, { ...at, walletPayment: "completed" })).toEqual(sent);
    expect(
      saleProgress(pending, { ...at, nowSeconds: NOW + 7200, walletPayment: "completed" })
    ).toEqual(sent);
    // On its way: being received, never told received.
    expect(saleProgress(pending, { ...at, walletPayment: "pending" })).toEqual({
      outcome: "inProgress",
      received: "now",
      converted: "todo",
      transferred: "todo"
    });
    // No payment of the wallet's: as Mt Pelerin tells it.
    expect(saleProgress(pending, { ...at, walletPayment: null }).outcome).toBe("awaitingPayment");
    // Refused by Mt Pelerin: its word, whatever the wallet sent.
    expect(
      saleProgress({ ...pending, orderStatus: "cancelled" }, { ...at, walletPayment: "completed" })
        .outcome
    ).toBe("failed");
    // Mt Pelerin's own word on its funds comes first.
    expect(
      saleProgress({ ...pending, orderStatus: "validated" }, { ...at, walletPayment: "pending" })
    ).toEqual({ outcome: "inProgress", received: "done", converted: "done", transferred: "todo" });
    expect(
      saleProgress(status({ currentStatus: "refunded" }), { ...at, walletPayment: "completed" })
        .outcome
    ).toBe("refunded");

    const listed = order({ type: "spot", status: "pending", transactionStatus: null });
    expect(orderOutcome(listed, NOW, "completed")).toBe("inProgress");
    expect(orderOutcome(listed, NOW + 3600, "completed")).toBe("inProgress");
    expect(orderOutcome(listed, NOW, "pending")).toBe("inProgress");
    expect(orderOutcome(listed, NOW, null)).toBe("awaitingPayment");
    expect(orderOutcome({ ...listed, status: "rejected" }, NOW, "completed")).toBe("failed");

    expect(awaitsFunds(listed)).toBe(true);
    expect(awaitsFunds(order({ transactionStatus: null }))).toBe(true);
    expect(awaitsFunds({ ...listed, status: "validated" })).toBe(false);
    expect(awaitsFunds({ ...listed, status: "finished" })).toBe(false);
    expect(awaitsFunds({ ...listed, status: "cancelled" })).toBe(false);
    expect(awaitsFunds({ ...listed, transactionStatus: "pending" })).toBe(false);
  });

  it("reads the wallet's payments sent by payment hash, a failed one as none", () => {
    const hash = (digit: string) => digit.repeat(64);
    let ids = 0;
    const payment = (patch: Partial<WalletPayment>): WalletPayment => ({
      id: `p${++ids}`,
      direction: "send",
      status: "completed",
      amountSats: 100n,
      feeSats: 1n,
      timestamp: NOW,
      network: "lightning",
      paymentHash: hash("a"),
      ...patch
    });
    const sent = salePayments([
      payment({ paymentHash: hash("A") }),
      payment({ paymentHash: hash("b"), status: "pending" }),
      payment({ paymentHash: hash("c"), status: "failed" }),
      payment({ paymentHash: hash("d"), direction: "receive" }),
      payment({ paymentHash: undefined }),
      // A retry of one invoice: the payment sent, whatever their order.
      payment({ paymentHash: hash("e"), status: "completed" }),
      payment({ paymentHash: hash("e"), status: "pending" }),
      payment({ paymentHash: hash("f"), status: "failed" }),
      payment({ paymentHash: hash("f"), status: "pending" })
    ]);
    expect([...sent.entries()]).toEqual([
      [hash("a"), "completed"],
      [hash("b"), "pending"],
      [hash("e"), "completed"],
      [hash("f"), "pending"]
    ]);
  });

  it('reads a sale of the list, and tells the sales of "Sell" from the other orders of the profile', () => {
    expect(orderOutcome(order(), NOW)).toBe("sent");
    expect(orderOutcome(order({ transactionStatus: "onhold" }), NOW)).toBe("held");
    expect(orderOutcome(order({ transactionStatus: "refunded" }), NOW)).toBe("refunded");
    expect(orderOutcome(order({ transactionStatus: "pending" }), NOW)).toBe("inProgress");
    // `validated` from its creation (dev/test): without funds, its rate's end tells.
    expect(orderOutcome(order({ transactionStatus: null }), NOW)).toBe("awaitingPayment");
    expect(orderOutcome(order({ transactionStatus: null }), NOW + 3600)).toBe("expired");
    expect(orderOutcome(order({ transactionStatus: null, status: "rejected" }), NOW)).toBe(
      "failed"
    );
    // A deferred sell paid has no transaction: in progress, after its rate's deadline too.
    const deferred = order({ type: "spot", transactionStatus: null });
    expect(orderOutcome(deferred, NOW + 3600)).toBe("inProgress");
    expect(orderOutcome({ ...deferred, status: "pending" }, NOW)).toBe("awaitingPayment");
    expect(orderOutcome({ ...deferred, status: "pending" }, NOW + 3600)).toBe("expired");
    expect(isLightningSale(order(), ASSET)).toBe(true);
    expect(isLightningSale(order({ network: null }), ASSET)).toBe(true);
    expect(isLightningSale(order({ type: "buy" }), ASSET)).toBe(false);
    expect(isLightningSale(order({ sourceCurrency: "CHF", destCurrency: "sat" }), ASSET)).toBe(
      false
    );
    expect(isLightningSale(order({ network: "mainnet" }), ASSET)).toBe(false);
  });
});

describe("Mt Pelerin's limits (limits.ts)", () => {
  it("counts an order's gross in centimes, fees included, never less than was exchanged", () => {
    // dev/test's: 10 043.29… sats with fees at 0.00066446 CHF: 6.6733… CHF, rounded up.
    expect(grossChfMinor(order())).toBe(668);
    // Without the fees' figure, the source: 6.63999… CHF, rounded up.
    expect(grossChfMinor(order({ sourceWithFees: null }))).toBe(664);
    // The larger of the two.
    expect(grossChfMinor(order({ sourceWithFees: dec("1") }))).toBe(664);
    // A buy in CHF: its source.
    expect(
      grossChfMinor(order({ sourceCurrency: "CHF", sourceAmount: dec("250"), destCurrency: "sat" }))
    ).toBe(25_000);
    // Neither in CHF, or no rate: unknown.
    expect(grossChfMinor(order({ destCurrency: "EUR" }))).toBeNull();
    expect(grossChfMinor(order({ rate: null }))).toBeNull();
    expect(productMinor(dec("498117"), dec("0.00084318"))).toBe(42_001);
    expect(productMinor(dec("1"), dec("0.01"))).toBe(1);
  });

  it("counts what may still be paid, never a refused order or a quote that ended unpaid", () => {
    expect(countsAgainstLimits(order(), NOW)).toBe(true);
    expect(countsAgainstLimits(order({ status: "cancelled" }), NOW)).toBe(false);
    expect(countsAgainstLimits(order({ transactionStatus: "rejected" }), NOW)).toBe(false);
    expect(countsAgainstLimits(order({ transactionStatus: "pending" }), NOW)).toBe(true);
    const unpaid = order({ transactionStatus: null });
    expect(countsAgainstLimits(unpaid, NOW)).toBe(true);
    expect(countsAgainstLimits(unpaid, NOW + 3600)).toBe(false);
    expect(countsAgainstLimits({ ...unpaid, expiresAt: null }, NOW + 3600)).toBe(true);
    expect(countsAgainstLimits({ ...unpaid, status: "finished" }, NOW + 3600)).toBe(true);
    // A deferred sell paid (no transaction, ever) counts after its rate's deadline; unpaid, not.
    const deferred = order({ type: "spot", transactionStatus: null });
    expect(countsAgainstLimits(deferred, NOW + 3600)).toBe(true);
    expect(countsAgainstLimits({ ...deferred, status: "pending" }, NOW)).toBe(true);
    expect(countsAgainstLimits({ ...deferred, status: "pending" }, NOW + 3600)).toBe(false);
  });

  it("sums the last 30 days' and this year's, in the device's time zone", () => {
    const now = new Date(2026, 9, 26, 18, 0);
    const starts = periodStarts(now);
    // The month: from midnight 30 days before today (the calendar month within it); the year: the
    // calendar year.
    expect(starts).toEqual({
      month: new Date(2026, 8, 26).getTime() / 1000,
      year: new Date(2026, 0, 1).getTime() / 1000
    });
    expect(limitsFrom(now)).toBe(starts.year);
    const nowSeconds = Math.floor(now.getTime() / 1000);
    const at = (seconds: number) => ({ createdAt: seconds, expiresAt: seconds + 3600 });
    const limits = sellLimits(
      [
        order({ ...at(nowSeconds - 60), sourceWithFees: null }),
        order({ ...at(starts.month), sourceWithFees: null }),
        order({ ...at(starts.month - 1), sourceWithFees: null }),
        order({ ...at(starts.year - 1), sourceWithFees: null }),
        order({ ...at(nowSeconds - 60), status: "cancelled" })
      ],
      now
    );
    expect(limits).toEqual({
      sale: SELL_LIMITS_CHF_MINOR.sale,
      month: { usedMinor: 1328, limitMinor: 99_900 },
      year: { usedMinor: 1992, limitMinor: 1_198_800 }
    });
    expect(chfLeftMinor(limits)).toBe(99_900 - 1328);
    // The year spent: nothing left, never less than 0.
    expect(chfLeftMinor({ ...limits, year: { usedMinor: 1_300_000, limitMinor: 1_198_800 } })).toBe(
      0
    );
  });

  it("counts a sale 30 days whichever month it was made in, the year from January 1st", () => {
    const at = (date: Date) => {
      const seconds = Math.floor(date.getTime() / 1000);
      return order({ createdAt: seconds, expiresAt: seconds + 3600, sourceWithFees: null });
    };
    // Sold on October 28th: still the month's on November 5th, no longer on November 28th.
    const sold = [at(new Date(2026, 9, 28, 9, 0))];
    expect(sellLimits(sold, new Date(2026, 10, 5, 12, 0)).month.usedMinor).toBe(664);
    expect(sellLimits(sold, new Date(2026, 10, 27, 12, 0)).month.usedMinor).toBe(664);
    expect(sellLimits(sold, new Date(2026, 10, 28, 12, 0)).month.usedMinor).toBe(0);
    // A month of 31 days: its 1st counts on its 31st, though more than 30 days back.
    expect(periodStarts(new Date(2026, 9, 31, 23, 0)).month).toBe(
      new Date(2026, 9, 1).getTime() / 1000
    );
    // Sold on December 20th: the month's on January 5th, never the new year's.
    const now = new Date(2027, 0, 5, 12, 0);
    const december = sellLimits([at(new Date(2026, 11, 20, 9, 0))], now);
    expect(december.month.usedMinor).toBe(664);
    expect(december.year.usedMinor).toBe(0);
    expect(limitsFrom(now)).toBe(new Date(2026, 11, 6).getTime() / 1000);
    // March: the 30 days reach back into February, past the 1st.
    expect(periodStarts(new Date(2027, 2, 2, 8, 0)).month).toBe(
      new Date(2027, 0, 31).getTime() / 1000
    );
  });

  it("lists this year's sales only, though the limits read December's in January", () => {
    const at = (date: Date) => order({ createdAt: Math.floor(date.getTime() / 1000) });
    const december = at(new Date(2026, 11, 20, 9, 0));
    const january = at(new Date(2027, 0, 2, 9, 0));
    expect(ofTheYear([january, december], new Date(2027, 0, 5, 12, 0).getTime())).toEqual([
      january
    ]);
  });

  it("says nothing of a period it cannot count whole", () => {
    const now = new Date(2026, 9, 26, 18, 0);
    const created = Math.floor(now.getTime() / 1000) - 60;
    const unknown = sellLimits(
      [order({ createdAt: created, expiresAt: created + 3600, destCurrency: "EUR" })],
      now
    );
    expect(unknown.month.usedMinor).toBeNull();
    expect(unknown.year.usedMinor).toBeNull();
    expect(chfLeftMinor(unknown)).toBeNull();
    // Not every order read.
    expect(sellLimits(null, now).month.usedMinor).toBeNull();
    // An order of another currency last year changes nothing of this year.
    const old = new Date(2025, 5, 1).getTime() / 1000;
    expect(sellLimits([order({ createdAt: old, destCurrency: "EUR" })], now).year.usedMinor).toBe(
      0
    );
  });
});

describe('the accounts "Sell" creates (accounts.ts)', () => {
  const input: BankAccountInput = {
    holder: { kind: "company", name: " Example Studio " },
    iban: "ch93 0076 2011 6238 5295 7",
    street: " 1 Example Street",
    postcode: "1000 ",
    city: "Lausanne",
    country: "CH",
    currency: "CHF"
  };

  it("creates the Lightning address as the merchant's own, with its code", () => {
    expect(newLightningAccount("merchant@breez.tips", "4821")).toEqual({
      type: "lightning",
      bank_code: "BTC",
      bank_name: "Lightning",
      currency: "BTC",
      crypto_address: "merchant@breez.tips",
      verification_code: "4821",
      user_is_owner: true
    });
  });

  it("creates a bank account as the merchant's own, a company's included", () => {
    expect(newBankAccount(input)).toEqual({
      type: "external",
      reference: "Example Studio",
      iban: "CH9300762011623852957",
      currency: "CHF",
      owner_companyname: "Example Studio",
      owner_street: "1 Example Street",
      owner_postcode: "1000",
      owner_city: "Lausanne",
      owner_country: "CH",
      // As Mt Pelerin answers: a company's account too.
      user_is_owner: true
    });
    expect(
      newBankAccount({
        ...input,
        holder: { kind: "person", firstname: "Alice ", lastname: "Example" }
      })
    ).toMatchObject({
      owner_firstname: "Alice",
      owner_lastname: "Example",
      reference: "Alice Example"
    });
  });

  it("sends nothing while a field is missing or wrong", () => {
    expect(newBankAccount({ ...input, holder: { kind: "company", name: " " } })).toBeNull();
    expect(
      newBankAccount({ ...input, holder: { kind: "person", firstname: "Alice", lastname: "" } })
    ).toBeNull();
    expect(newBankAccount({ ...input, iban: "CH9300762011623852958" })).toBeNull();
    expect(newBankAccount({ ...input, street: "" })).toBeNull();
    expect(newBankAccount({ ...input, country: null })).toBeNull();
    expect(newBankAccount({ ...input, country: "ch" })).toBeNull();
    expect(newBankAccount({ ...input, currency: "BRL" })).toBeNull();
    expect(newBankAccount({ ...input, currency: "chf" })).toBeNull();
  });

  it("creates a bank account in any currency Mt Pelerin wires", () => {
    for (const currency of SELL_CURRENCIES) {
      expect(newBankAccount({ ...input, currency })).toMatchObject({ currency });
    }
  });

  it("changes a holder and address only, the other kind's names cleared", () => {
    const person = {
      holder: { kind: "person" as const, firstname: " Alice", lastname: "Example " },
      street: "Hauptstrasse 9 ",
      postcode: "8001",
      city: "Zürich",
      country: "CH"
    };
    const change = bankAccountChange(ACCOUNT, person);
    expect(change?.request).toEqual({
      owner_firstname: "Alice",
      owner_lastname: "Example",
      owner_companyname: null,
      owner_street: "Hauptstrasse 9",
      owner_postcode: "8001",
      owner_city: "Zürich",
      owner_country: "CH",
      // The label was the holder's name, as the app gives it: it follows.
      reference: "Alice Example"
    });
    // No IBAN, currency, status nor `user_is_owner`: another one is another account.
    for (const key of ["iban", "currency", "status", "user_is_owner", "type"]) {
      expect(change?.request).not.toHaveProperty(key);
    }
    // A label of the merchant's stays; no label: the holder's name.
    expect(
      bankAccountChange({ ...ACCOUNT, label: "Current account" }, person)?.request
    ).not.toHaveProperty("reference");
    expect(bankAccountChange({ ...ACCOUNT, label: null }, person)?.request).toMatchObject({
      reference: "Alice Example"
    });
    const company = { ...person, holder: { kind: "company" as const, name: "Studio Two" } };
    expect(
      bankAccountChange(
        {
          ...ACCOUNT,
          owner: { ...ACCOUNT.owner, name: { kind: "person", firstname: "A", lastname: "B" } }
        },
        company
      )?.request
    ).toMatchObject({
      owner_firstname: null,
      owner_lastname: null,
      owner_companyname: "Studio Two"
    });
  });

  it("changes nothing that is the same, incomplete or wrong", () => {
    const same = {
      holder: { kind: "company" as const, name: " Example Studio" },
      street: "1 Example Street ",
      postcode: "1000",
      city: "Lausanne",
      country: "CH"
    };
    expect(bankAccountChange(ACCOUNT, same)).toBeNull();
    expect(bankAccountChange(ACCOUNT, { ...same, city: "Geneva" })).not.toBeNull();
    expect(bankAccountChange(ACCOUNT, { ...same, street: " " })).toBeNull();
    expect(bankAccountChange(ACCOUNT, { ...same, country: null })).toBeNull();
    expect(bankAccountChange(ACCOUNT, { ...same, country: "che" })).toBeNull();
    expect(
      bankAccountChange(ACCOUNT, {
        ...same,
        holder: { kind: "person", firstname: "", lastname: "B" }
      })
    ).toBeNull();
    // A line Mt Pelerin lacks ("its lines may be missing") filled in is a change.
    expect(
      bankAccountChange({ ...ACCOUNT, owner: { ...ACCOUNT.owner, street: null } }, same)
    ).not.toBeNull();
  });

  it("tells a change done only from the same account holding what was sent", () => {
    const input = {
      holder: { kind: "company" as const, name: "Studio Two" },
      street: "2 Second Street",
      postcode: "1000",
      city: "Lausanne",
      country: "CH"
    };
    const change = bankAccountChange(ACCOUNT, input)!;
    const changed: MtpBankAccount = {
      ...ACCOUNT,
      owner: {
        ...ACCOUNT.owner,
        name: { kind: "company", name: "Studio Two" },
        street: "2 Second Street"
      }
    };
    expect(changeApplied(changed, ACCOUNT, change)).toBe(true);
    expect(changeApplied(ACCOUNT, ACCOUNT, change)).toBe(false);
    expect(changeApplied({ ...changed, id: "other" }, ACCOUNT, change)).toBe(false);
    expect(changeApplied({ ...changed, iban: "CH6600762011623852958" }, ACCOUNT, change)).toBe(
      false
    );
    expect(changeApplied({ ...changed, currency: "EUR" }, ACCOUNT, change)).toBe(false);
    expect(
      changeApplied(
        { kind: "other", id: ACCOUNT.id, type: "proxy", status: "active" },
        ACCOUNT,
        change
      )
    ).toBe(false);
  });

  it("knows an IBAN in a currency among the accounts a sale may go to", () => {
    const key = { iban: ACCOUNT.iban, currency: "CHF" };
    expect(knownBankAccount([ACCOUNT], key)).toBe(ACCOUNT);
    expect(knownBankAccount([{ ...ACCOUNT, status: "active" }], key)).not.toBeNull();
    expect(knownBankAccount([ACCOUNT], { ...key, currency: "EUR" })).toBeNull();
    expect(knownBankAccount([ACCOUNT], { ...key, iban: "CH6600762011623852958" })).toBeNull();
    // One Mt Pelerin rejected is created again.
    expect(knownBankAccount([{ ...ACCOUNT, status: "rejected" }], key)).toBeNull();
  });

  it("names and masks the accounts as the rows show them", () => {
    expect(ownerNameText({ kind: "person", firstname: "Alice", lastname: "Example" })).toBe(
      "Alice Example"
    );
    expect(maskedIban("CH93 0076 2011 6238 5295 7")).toBe("CH93 •••• 2957");
    const lightning = {
      kind: "lightning" as const,
      id: "a1",
      status: "active",
      cryptoAddress: "merchant@breez.tips",
      scopeId: null
    };
    const other = { kind: "other" as const, id: "p1", type: "proxy", status: "active" };
    expect(lightningAccountsOf([ACCOUNT, lightning, other])).toEqual([lightning]);
    expect(bankAccountsOf([ACCOUNT, lightning, other])).toEqual([ACCOUNT]);
  });
});
