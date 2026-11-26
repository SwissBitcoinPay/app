import { walletSecret } from "@/lib/breez/seed";
import {
  ORDERS_PAGE_SIZE,
  createMtPelerinApi,
  type MtpRequest,
  type MtpResponse
} from "@/lib/mtpelerin/api";
import { MtPelerinError, isDuplicateAccount } from "@/lib/mtpelerin/errors";
import { testLoginSigner } from "@/lib/mtpelerin/evm-login";
import {
  readAccount,
  readAccounts,
  readBalances,
  readConfig,
  readDevice,
  readEstimate,
  readLightningInvoice,
  readOrdersPage,
  readPerson,
  readSellOrder,
  readSmsSent,
  readTokens,
  readTransactionStatus
} from "@/lib/mtpelerin/guards";
import { mtPelerinTransport } from "@/lib/mtpelerin/transport";
import { describeError } from "@/lib/log/entry";
import { deriveTeamKeys } from "@/lib/team/keys";

import { testSeed } from "../../jest/account";
import { scenarioServer } from "../../jest/mtpelerin-fake/scenarios";
import { FAKE_ADOPTED_PHONE, FakeMtPelerin } from "../../jest/mtpelerin-fake/server";

import type * as MtPelerinFake from "../../jest/mtpelerin";

/*
 * Mt Pelerin's API as "Sell" uses it (api.ts, guards.ts): its requests as the API takes
 * them, and its answers as Mt Pelerin's dev/test environment gave them
 * (jest/live/mtpelerin-sell.live.ts), fictitious data, cut to what is read plus a few fields
 * that are not.
 */

const fake = jest.requireMock<typeof MtPelerinFake>("@/lib/mtpelerin/transport");
const ADDRESS = "sbp02c6047f94@breez.tips";

/** `PUT /persons` on dev/test. */
const PERSON = {
  user_id: "0b6f3c1e-2d4a-4e5b-8c7d-9e0f1a2b3c4d",
  scope_id: "0b6f3c1e-2d4a-4e5b-8c7d-9e0f1a2b3c4d",
  short_id: "Pq7RsT2u",
  type: "user",
  email: "sell.live@example.com",
  language: "fr",
  phone: "+41790000000",
  kyc: "pending_validation",
  kycLevel: 0,
  transfer_allowance: 0,
  monthly_allowance: 0,
  yearly_allowance: 0,
  id: "64a0c0de0000000000000001",
  creation_date: "2026-10-26T17:16:05.903Z"
};

/** `PUT /accounts` of the Lightning address, then of a bank account, on dev/test. */
const LIGHTNING = {
  type: "lightning",
  status: "pending_validation",
  bank_code: "BTC",
  bank_name: "Lightning",
  currency: "BTC",
  crypto_address: "seller@breez.tips",
  verification_code: "4368",
  user_id: "0b6f3c1e-2d4a-4e5b-8c7d-9e0f1a2b3c4d",
  scope_id: "0b6f3c1e-2d4a-4e5b-8c7d-9e0f1a2b3c4d",
  user_is_owner: true,
  linked_accounts: [],
  id: "64a0c0de0000000000000003"
};
const BANK = {
  type: "external",
  status: "pending_validation",
  currency: "CHF",
  iban: "CH9300762011623852957",
  owner_companyname: "Example Studio",
  owner_street: "1 Example Street",
  owner_postcode: "1000",
  owner_city: "Lausanne",
  owner_country: "CH",
  reference: "Example Studio",
  user_is_owner: true,
  id: "64a0c0de0000000000000004"
};

/** `GET /forms/mtp-config` on dev/test, its networks cut to two. */
const CONFIG = {
  personalIban: { currencies: [{ currency: "CHF", termsUrl: null }] },
  networks: [
    {
      id: "mainnet",
      name: "Ethereum",
      family: "evm",
      chainId: 1,
      accountType: "ethereum",
      assets: [{ asset: "001", symbol: "ETH", name: "Ether", decimals: 18, native: true }]
    },
    {
      id: "lightning_mainnet",
      name: "Bitcoin Lightning",
      family: "lightning",
      chainId: null,
      accountType: "lightning",
      assets: [{ asset: "080", symbol: "sat", name: "Bitcoin", decimals: 3, native: true }]
    }
  ]
};

const FEES = {
  total: "0",
  currency: "sat",
  side: "in",
  rate: 0,
  fix: "0",
  networkFee: "0",
  discount: 0
};

/** `POST /orders/estimate` of 10 000 sats into CHF on dev/test. */
const ESTIMATE = {
  type: "sell",
  sourceCurrency: "sat",
  sourceNetwork: "lightning_mainnet",
  destCurrency: "CHF",
  destNetwork: "fiat",
  sourceAmount: "10000",
  destAmount: "6.64",
  exchangeRate: { mid: "0.00066446", effective: "0.00066446" },
  fees: FEES,
  user: { previousVolume: 0, feeLevel: 0, maxFreeAmount: 500 }
};

/** `POST /orders/create` of that sale on dev/test, its invoice's text cut. */
const SELL_ORDER = {
  id: "5a1e0dd3000000000000000000000001",
  short_id: "Kq3Vw9Lm",
  type: "fixing",
  status: "validated",
  source_amount: "9993.07708515",
  source_amount_with_fees: "10043.29355292",
  source_currency: "sat",
  dest_amount: "6.64",
  dest_currency: "CHF",
  rate: "0.00066446",
  comment: "LIB FEES: 0 sat",
  expiration_date: "2026-10-26T18:16:12.608Z",
  beneficiary_id: "64a0c0de0000000000000004",
  reference: "SATTLEME",
  network: "lightning_mainnet",
  options: { oid: "6f1d2c3b-4a59-4e68-9d7c-8b6a5f4e3d2c", estimate: { fees: FEES } },
  creation_date: "2026-10-26T17:16:13.837Z",
  rampAddr: "mtpelerin@ln.mtpelerin.com",
  estimate: ESTIMATE,
  invoice: "lnbc100u1p4dlzkapp5njmjt98m3alnph2r4mufqp2c095q55hlr45edva3dmapgt8nxqfq"
};

/** A sell of the list, with its transaction. */
const LISTED = {
  id: "8f3c1a2e-7b04-4d51-9f6b-1c2d3e4f5a6b",
  short_id: "Sa1B2c3D4",
  type: "fixing",
  status: "finished",
  source_amount: "9993.07708515",
  source_amount_with_fees: "10043.29355292",
  source_currency: "sat",
  dest_amount: 6.64,
  dest_currency: "CHF",
  rate: 0.00066446,
  network: "lightning_mainnet",
  beneficiary_id: "65b1f2e8c9f1a2b3c4d5e6f7",
  expiration_date: "2026-05-22T11:23:01.000Z",
  creation_date: "2026-05-22T11:08:01.000Z",
  transaction_group_id: "abc123",
  transaction: { status: "finished", transaction_group_id: "abc123" }
};

const malformed = expect.objectContaining({ name: "MtPelerinError", code: "malformed" });

describe("the guards of Mt Pelerin's answers", () => {
  it("reads a profile as dev/test gives it, its allowances left out", () => {
    expect(readPerson(PERSON)).toEqual({
      id: PERSON.id,
      userId: PERSON.user_id,
      scopeId: PERSON.scope_id,
      type: "user",
      email: "sell.live@example.com",
      phone: "+41790000000",
      language: "fr",
      kycLevel: 0
    });
    // The identity approved (2 for a person, 4 for a company); never more than it says.
    expect(readPerson({ ...PERSON, kycLevel: 2 }).kycLevel).toBe(2);
    expect(readPerson({ ...PERSON, type: "company", kycLevel: 4 }).kycLevel).toBe(4);
    for (const kycLevel of [undefined, null, "2", 2.5, -1, 100, Number.NaN]) {
      expect(readPerson({ ...PERSON, kycLevel }).kycLevel).toBe(0);
    }
    // "`email` will be `null` until you set it".
    expect(readPerson({ ...PERSON, email: null }).email).toBeNull();
    // A number that is no E.164 is none: the profile still needs one.
    expect(readPerson({ ...PERSON, phone: "079 123 45 67" }).phone).toBeNull();
  });

  it("refuses a profile without its ids, or of another type", () => {
    // Its failure names the field it could not read, never its value.
    expect(() => readPerson({ ...PERSON, user_id: "auth0|123" })).toThrow(
      expect.objectContaining({ code: "malformed", field: "user_id" })
    );
    expect(() => readPerson({ ...PERSON, language: "English (Switzerland)" })).toThrow(
      expect.objectContaining({ code: "malformed", field: "language" })
    );
    expect(() => readPerson({ ...PERSON, id: undefined })).toThrow(malformed);
    expect(() => readPerson({ ...PERSON, scope_id: "65b1-...-e6aa" })).toThrow(malformed);
    expect(() => readPerson({ ...PERSON, type: "admin" })).toThrow(malformed);
    expect(() => readPerson(null)).toThrow(malformed);
    expect(() => readPerson([PERSON])).toThrow(malformed);
  });

  it("reads the device, the SMS sent and the tokens, nothing else", () => {
    const device = {
      id: "64a0c0de0000000000000005",
      userId: "0b6f3c1e-2d4a-4e5b-8c7d-9e0f1a2b3c4d"
    };
    // Mt Pelerin's answer, with its `status`.
    expect(
      readDevice({
        user_id: "0b6f3c1e-2d4a-4e5b-8c7d-9e0f1a2b3c4d",
        type: "mobile",
        status: "new",
        identifier_type: "address",
        id: "64a0c0de0000000000000005"
      })
    ).toEqual(device);
    // A dev/test answer: no `status`. Refusing it ended the login.
    expect(
      readDevice({
        user_id: "0b6f3c1e-2d4a-4e5b-8c7d-9e0f1a2b3c4d",
        type: "mobile",
        identifier_type: "address",
        identifier: "0x5E7239681917Ff51049AC58fd0D49Ad7eA490624",
        deviceInfo: { platform: "sattle.me", version: "3.0.0" },
        confirmed: false,
        locked: false,
        revoked: false,
        id: "64a0c0de0000000000000005",
        creation_date: "2026-11-14T23:48:43.628Z",
        modification_date: "2026-11-14T23:48:43.628Z",
        created_by: "public",
        modified_by: "public",
        phone: null
      })
    ).toEqual(device);
    expect(() => readDevice({ user_id: device.userId, status: "new" })).toThrow(malformed);
    expect(() => readDevice({ id: device.id, status: "new" })).toThrow(malformed);
    expect(() => readSmsSent({ status: "SUCCESS" })).not.toThrow();
    expect(() => readSmsSent({ status: "FAILED" })).toThrow(malformed);
    const tokens = { access_token: "a".repeat(40), refresh_token: "b".repeat(40) };
    expect(readTokens(tokens)).toEqual({
      accessToken: "a".repeat(40),
      refreshToken: "b".repeat(40)
    });
    expect(() => readTokens({ access_token: "short", refresh_token: "b".repeat(40) })).toThrow(
      malformed
    );
    expect(() => readTokens({ access_token: "a".repeat(40) })).toThrow(malformed);
    expect(() => readTokens({ ...tokens, refresh_token: `${"b".repeat(40)} x` })).toThrow(
      malformed
    );
  });

  it("reads the accounts: the Lightning address, the bank accounts, the others by type", () => {
    const accounts = readAccounts([
      { ...LIGHTNING, crypto_address: " Seller@Breez.Tips " },
      BANK,
      {
        ...BANK,
        id: "b2",
        status: "active",
        currency: "EUR",
        iban: "CH93 0076 2011 6238 5295 7",
        owner_companyname: undefined,
        owner_firstname: "Alice",
        owner_lastname: "Example",
        owner_country: undefined,
        reference: ""
      },
      { id: "p1", type: "proxy", status: "active", currency: "CHF" }
    ]);
    expect(accounts).toEqual([
      {
        kind: "lightning",
        id: LIGHTNING.id,
        status: "pending_validation",
        cryptoAddress: "seller@breez.tips",
        scopeId: LIGHTNING.scope_id
      },
      {
        kind: "bank",
        id: BANK.id,
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
      },
      {
        kind: "bank",
        id: "b2",
        status: "active",
        iban: "CH9300762011623852957",
        currency: "EUR",
        label: null,
        owner: {
          name: { kind: "person", firstname: "Alice", lastname: "Example" },
          street: "1 Example Street",
          postcode: "1000",
          city: "Lausanne",
          country: null
        }
      },
      { kind: "other", id: "p1", type: "proxy", status: "active" }
    ]);
  });

  it("refuses an account it cannot show as it is, naming the field it could not read", () => {
    /** The field `readAccount` names for `account`, refused as malformed. */
    const fieldOf = (account: unknown) => {
      try {
        readAccount(account);
      } catch (error) {
        expect(error).toEqual(malformed);
        return (error as MtPelerinError).field;
      }
      throw new Error("The account was read");
    };
    // Its checksum wrong: never offered to be wired to.
    expect(fieldOf({ ...BANK, iban: "CH9300762011623852958" })).toBe("iban");
    expect(fieldOf({ ...BANK, iban: null })).toBe("iban");
    expect(fieldOf({ ...BANK, currency: "chf" })).toBe("currency");
    expect(fieldOf({ ...BANK, owner_country: "Switzerland" })).toBe("owner_country");
    // Without its holder's name: the person's names asked for in place of the company's.
    expect(fieldOf({ ...BANK, owner_companyname: undefined })).toBe("owner_firstname");
    expect(fieldOf({ ...BANK, reference: "x".repeat(129) })).toBe("reference");
    expect(fieldOf({ ...BANK, status: null })).toBe("status");
    expect(fieldOf({ ...BANK, id: "a/b" })).toBe("id");
    expect(fieldOf({ ...LIGHTNING, crypto_address: "nobody" })).toBe("crypto_address");
    expect(fieldOf({ ...LIGHTNING, type: 7 })).toBe("type");
    // No object at all: no field to name.
    expect(fieldOf("account")).toBeNull();
  });

  it("reads a holder Mt Pelerin wrote as one name, without an address, not saying its kind", () => {
    // As production lists accounts registered elsewhere than in the app: the whole
    // name in `owner_firstname`, no `owner_lastname`, no address.
    const oneName = {
      id: "64a0c0de0000000000000002",
      type: "external",
      status: "pending_validation",
      iban: "CH9300762011623852957",
      currency: "CHF",
      owner_firstname: " EXAMPLE STUDIO LTD "
    };
    expect(readAccount(oneName)).toEqual({
      kind: "bank",
      id: oneName.id,
      status: "pending_validation",
      iban: "CH9300762011623852957",
      currency: "CHF",
      label: null,
      owner: {
        name: { kind: "unsaid", name: "EXAMPLE STUDIO LTD" },
        street: null,
        postcode: null,
        city: null,
        country: null
      }
    });
    // The last name alone, as well.
    expect(
      readAccount({ ...oneName, owner_firstname: undefined, owner_lastname: "Smith" })
    ).toMatchObject({ owner: { name: { kind: "unsaid", name: "Smith" } } });
    // No name at all, or a blank one: refused.
    expect(() => readAccount({ ...oneName, owner_firstname: "  " })).toThrow(
      expect.objectContaining({ code: "malformed", field: "owner_firstname" })
    );
    // Without an IBAN (also seen in production): never an account a sale is wired to.
    expect(() =>
      readAccount({ ...oneName, iban: undefined, owner_companyname: "Example Studio" })
    ).toThrow(expect.objectContaining({ code: "malformed", field: "iban" }));
  });

  it("keeps an account of the list it cannot read apart, never as one of the others", () => {
    expect(
      readAccounts([
        BANK,
        { ...BANK, id: "b2", owner_companyname: null },
        { ...LIGHTNING, crypto_address: "nobody" },
        null
      ])
    ).toEqual([
      expect.objectContaining({ kind: "bank", id: BANK.id }),
      // Its field only: nothing of what Mt Pelerin wrote, not even its id.
      { kind: "unreadable", field: "owner_firstname" },
      { kind: "unreadable", field: "crypto_address" },
      { kind: "unreadable", field: null }
    ]);
    // What is no list of accounts is refused whole.
    expect(() => readAccounts({ accounts: [] })).toThrow(malformed);
    expect(() => readAccounts(Array.from({ length: 501 }, () => BANK))).toThrow(malformed);
  });

  it("reads the configuration: its networks and their assets, the rest left", () => {
    expect(readConfig(CONFIG)).toEqual({
      networks: [
        {
          id: "mainnet",
          name: "Ethereum",
          family: "evm",
          accountType: "ethereum",
          assets: [{ asset: "001", symbol: "ETH", decimals: 18 }]
        },
        {
          id: "lightning_mainnet",
          name: "Bitcoin Lightning",
          family: "lightning",
          accountType: "lightning",
          assets: [{ asset: "080", symbol: "sat", decimals: 3 }]
        }
      ]
    });
    expect(() => readConfig({ networks: "all" })).toThrow(malformed);
    const decimals = (value: unknown) =>
      readConfig({
        networks: [
          { ...CONFIG.networks[1], assets: [{ asset: "080", symbol: "sat", decimals: value }] }
        ]
      });
    expect(() => decimals(-1)).toThrow(malformed);
    expect(() => decimals(1.5)).toThrow(malformed);
    expect(() => decimals("3")).toThrow(malformed);
  });

  it("reads the 1-sat invoice's answer, checked as an invoice later", () => {
    expect(
      readLightningInvoice({
        payment_hash: "7d3236b37e3cf497d8e4658e97d5113ae11d99dd695dbcc3a9790b436f25dcc4",
        payment_request: "lnbc10n1x",
        lnurl_response: null
      })
    ).toEqual({ paymentRequest: "lnbc10n1x" });
    expect(() => readLightningInvoice({ invoice: "lnbc10n1x" })).toThrow(malformed);
  });

  it("reads an estimate exactly: its amounts and rate as texts, its fees in sats", () => {
    expect(readEstimate(ESTIMATE)).toEqual({
      sourceCurrency: "sat",
      destCurrency: "CHF",
      sourceAmount: { units: 10_000n, scale: 0 },
      destAmount: { units: 664n, scale: 2 },
      fees: { total: { units: 0n, scale: 0 }, currency: "sat" },
      rate: { units: 66_446n, scale: 8 }
    });
    // Mt Pelerin's numbers read the same.
    expect(
      readEstimate({ ...ESTIMATE, destAmount: 6.64, exchangeRate: { mid: 0.00066446 } })
    ).toMatchObject({
      destAmount: { units: 664n, scale: 2 },
      rate: { units: 66_446n, scale: 8 }
    });
    expect(readEstimate({ ...ESTIMATE, exchangeRate: undefined }).rate).toBeNull();
    // An amount that is no exact decimal, a rate of 0, fees in no currency: refused.
    expect(() => readEstimate({ ...ESTIMATE, destAmount: "-6.64" })).toThrow(malformed);
    expect(() => readEstimate({ ...ESTIMATE, destAmount: 1e21 })).toThrow(malformed);
    expect(() => readEstimate({ ...ESTIMATE, exchangeRate: { mid: "0" } })).toThrow(malformed);
    expect(() => readEstimate({ ...ESTIMATE, fees: { total: "0" } })).toThrow(malformed);
  });

  it("reads a sell order as dev/test creates it: its invoice and its estimate", () => {
    expect(readSellOrder(SELL_ORDER)).toEqual({
      id: SELL_ORDER.id,
      shortId: "Kq3Vw9Lm",
      status: "validated",
      sourceCurrency: "sat",
      // Mt Pelerin's own, back from the francs: not what was asked.
      sourceAmount: { units: 999_307_708_515n, scale: 8 },
      destCurrency: "CHF",
      destAmount: { units: 664n, scale: 2 },
      expiresAt: Math.floor(Date.parse("2026-10-26T18:16:12.608Z") / 1000),
      rate: { units: 66_446n, scale: 8 },
      beneficiaryId: BANK.id,
      invoice: SELL_ORDER.invoice,
      // What was asked.
      estimate: {
        sourceAmount: { units: 10_000n, scale: 0 },
        fees: { total: { units: 0n, scale: 0 }, currency: "sat" }
      }
    });
    expect(readSellOrder({ ...SELL_ORDER, estimate: undefined }).estimate).toBeNull();
    // On Lightning, no order without its invoice.
    expect(() => readSellOrder({ ...SELL_ORDER, invoice: undefined })).toThrow(malformed);
    expect(() => readSellOrder({ ...SELL_ORDER, expiration_date: "tomorrow" })).toThrow(malformed);
    expect(() => readSellOrder({ ...SELL_ORDER, beneficiary_id: null })).toThrow(malformed);
  });

  it("reads a page of orders, with or without their transaction, 20 at most", () => {
    const { orders } = readOrdersPage({
      filters: { skip: 0, limit: 20 },
      orders: [LISTED, { ...LISTED, id: "o2", transaction: undefined, network: null }]
    });
    expect(orders[0]).toEqual({
      id: LISTED.id,
      shortId: "Sa1B2c3D4",
      type: "fixing",
      status: "finished",
      sourceCurrency: "sat",
      sourceAmount: { units: 999_307_708_515n, scale: 8 },
      destCurrency: "CHF",
      destAmount: { units: 664n, scale: 2 },
      sourceWithFees: { units: 1_004_329_355_292n, scale: 8 },
      rate: { units: 66_446n, scale: 8 },
      network: "lightning_mainnet",
      beneficiaryId: LISTED.beneficiary_id,
      createdAt: Date.parse(LISTED.creation_date) / 1000,
      expiresAt: Date.parse(LISTED.expiration_date) / 1000,
      transactionStatus: "finished",
      oid: null,
      paymentHash: null
    });
    expect(orders[1]).toMatchObject({ id: "o2", network: null, transactionStatus: null });
    // The app's reference and the payment hash of the order's invoice, as dev/test's list gave
    // them: what the split's sale is found by (split.ts).
    const hash = "6BD41F384F208C4DF7AF8E7D3FDA73217BFF2A83D93DA28A96D633E6E963A858";
    const [told] = readOrdersPage({
      orders: [
        {
          ...LISTED,
          type: "spot",
          status: "pending",
          hash,
          options: { oid: "sattle-split-1:1763168400", wid: "354c5694", estimate: {} }
        }
      ]
    }).orders;
    expect(told).toMatchObject({
      type: "spot",
      oid: "sattle-split-1:1763168400",
      paymentHash: hash.toLowerCase()
    });
    // Out of shape: none, and the list is still read (an order of another integration).
    for (const options of [
      undefined,
      null,
      "oid",
      [],
      {},
      { oid: 42 },
      { oid: "" },
      { oid: "a b" }
    ]) {
      expect(readOrdersPage({ orders: [{ ...LISTED, options }] }).orders[0]?.oid).toBeNull();
    }
    for (const bad of [undefined, null, 42, "abc", hash.slice(1), `${hash}0`]) {
      const [row] = readOrdersPage({ orders: [{ ...LISTED, hash: bad }] }).orders;
      expect(row?.paymentHash).toBeNull();
    }
    // More than the page can hold, or one order unreadable: the page is.
    expect(() => readOrdersPage({ orders: Array.from({ length: 21 }, () => LISTED) })).toThrow(
      malformed
    );
    expect(() => readOrdersPage({ orders: [LISTED, { ...LISTED, dest_amount: "a lot" }] })).toThrow(
      malformed
    );
    expect(() =>
      readOrdersPage({ orders: [{ ...LISTED, transaction: { status: "Done!" } }] })
    ).toThrow(malformed);
    expect(() => readOrdersPage([LISTED])).toThrow(malformed);
  });

  it("reads a sale's progress: the order alone before any funds, then its steps", () => {
    expect(
      readTransactionStatus({ order: { id: "o1", type: "fixing", status: "validated" } })
    ).toEqual({
      orderId: "o1",
      orderStatus: "validated",
      orderType: "fixing",
      groupId: null,
      currentStatus: null,
      inStatus: null,
      forexStatus: null,
      outStatus: null,
      destAmount: null,
      destCurrency: null,
      destIdentifier: null
    });
    expect(
      readTransactionStatus({
        order: { id: "o1", type: "fixing", status: "validated" },
        transaction_group_id: "abc123",
        dest_amount: 6.64,
        dest_currency: "CHF",
        dest_identifier: BANK.id,
        current_status: "pending",
        in_status: "finished",
        forex_status: "finished",
        out_status: "delayed"
      })
    ).toMatchObject({
      groupId: "abc123",
      currentStatus: "pending",
      inStatus: "finished",
      outStatus: "delayed",
      destAmount: { units: 664n, scale: 2 },
      destCurrency: "CHF",
      destIdentifier: BANK.id
    });
    // A deferred sell paid, as production answers it: the order alone, `spot` and `validated`
    // (fictitious figures and ids).
    expect(
      readTransactionStatus({
        order: {
          id: "5f0c2a9e7d1b4c3a8e6f0b2d4a6c8e01",
          short_id: "Ab12Cd34",
          type: "spot",
          status: "validated",
          source_amount: 2000,
          source_currency: "sat",
          dest_amount: 1.01,
          dest_currency: "CHF",
          transaction_group_id: null,
          transaction_id: null
        }
      })
    ).toMatchObject({ orderStatus: "validated", orderType: "spot", groupId: null });
    // No `type`: none read, never a guess.
    expect(
      readTransactionStatus({ order: { id: "o1", status: "validated" } }).orderType
    ).toBeNull();
    expect(() => readTransactionStatus({ transaction_group_id: "abc123" })).toThrow(malformed);
  });
});

describe("Mt Pelerin's API: its requests and its statuses", () => {
  /** An API over a transport that answers `answer` and keeps the requests. */
  function stub(answer: MtpResponse | Error) {
    const requests: MtpRequest[] = [];
    const api = createMtPelerinApi(async (request) => {
      requests.push(request);
      if (answer instanceof Error) throw answer;
      return answer;
    });
    return { api, requests };
  }

  it("asks for the 1-sat invoice and the accounts as the API takes them", async () => {
    const { api, requests } = stub({ status: 200, body: { payment_request: "lnbc10n1x" } });
    await api.validationInvoice({
      comment: `I hereby certify owning ${ADDRESS}`,
      scopeId: "s-1",
      accountId: "a1"
    });
    // 1000 millisatoshis, tied to the account by `extra`.
    expect(requests).toEqual([
      {
        method: "POST",
        path: "/ethereum/ln/pr",
        body: {
          amount: 1000,
          comment: `I hereby certify owning ${ADDRESS}`,
          extra: { uid: "s-1", from: "a1" }
        }
      }
    ]);
    const list = stub({ status: 200, body: [] });
    await list.api.listAccounts("token", { type: "external" });
    expect(list.requests[0]).toEqual({
      method: "GET",
      path: "/accounts",
      token: "token",
      query: { filter: '{"where":{"type":"external"}}' }
    });
  });

  it("asks for an estimate, an order, a sale's progress and the orders as the API takes them", async () => {
    const estimate = stub({ status: 200, body: ESTIMATE });
    await estimate.api.estimateSell("jwt", {
      currencyIn: "sat",
      networkIn: "lightning_mainnet",
      currencyOut: "CHF",
      amountIn: "10000"
    });
    expect(estimate.requests[0]).toEqual({
      method: "POST",
      path: "/orders/estimate",
      token: "jwt",
      body: {
        source_currency: "sat",
        source_network: "lightning_mainnet",
        dest_currency: "CHF",
        amount_in: "10000"
      }
    });
    const order = stub({ status: 200, body: SELL_ORDER });
    const body = {
      beneficiary_id: BANK.id,
      currency_in: "sat",
      currency_out: "CHF",
      amount_in: 10_000,
      network_in: "lightning_mainnet",
      reference: "SATTLEME",
      oid: "6f1d2c3b-4a59-4e68-9d7c-8b6a5f4e3d2c",
      wid: "354c5694-8798-400c-9139-d4d4e9715fde"
    };
    await order.api.createSellOrder("jwt", body);
    expect(order.requests[0]).toEqual({
      method: "POST",
      path: "/orders/create",
      token: "jwt",
      body
    });
    const status = stub({ status: 200, body: { order: { id: "o1", status: "validated" } } });
    await status.api.transactionStatus("jwt", "o1", "s-1");
    // `scopeId` with `orderId`: production refuses the call without it (400 "scopeId must be
    // provided"), whatever the documented example shows.
    expect(status.requests[0]).toEqual({
      method: "GET",
      path: "/transactions/status",
      token: "jwt",
      query: { orderId: "o1", scopeId: "s-1" }
    });
    const orders = stub({ status: 200, body: { orders: [] } });
    await orders.api.listOrders("jwt", { fromDate: "2025-12-31", toDate: "2026-10-28", skip: 40 });
    expect(ORDERS_PAGE_SIZE).toBe(20);
    expect(orders.requests[0]).toEqual({
      method: "GET",
      path: "/orders/status",
      token: "jwt",
      query: { fromDate: "2025-12-31", toDate: "2026-10-28", skip: "40", limit: "20" }
    });
  });

  it("tells a 404 of findOne as no profile yet, never as a failure", async () => {
    // As dev/test answers it.
    const { api } = stub({
      status: 404,
      body: { error: { statusCode: 404, message: 'Unknown "person" id "undefined".' } }
    });
    await expect(api.findPerson("token")).resolves.toBeNull();
    // Elsewhere a 404 is one.
    await expect(api.config()).rejects.toMatchObject({ code: "notFound", status: 404 });
  });

  it("tells a 401 `token expired` from another 401", async () => {
    await expect(
      stub({ status: 401, body: { exp: "token expired" } }).api.findPerson("token")
    ).rejects.toMatchObject({ code: "tokenExpired" });
    await expect(
      stub({ status: 401, body: { error: { message: "Unauthorized" } } }).api.findPerson("token")
    ).rejects.toMatchObject({ code: "unauthorized" });
  });

  it('tells "Duplicate account" among the 409s', async () => {
    const duplicate = stub({ status: 409, body: { error: { message: "Duplicate account" } } });
    const error = await duplicate.api.listAccounts("token", {}).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(MtPelerinError);
    expect(isDuplicateAccount(error)).toBe(true);
    const exists = stub({
      status: 409,
      body: { error: { message: "A person with this scope_id already exists" } }
    });
    const other = await exists.api
      .createPerson("token", { type: "user" })
      .catch((caught: unknown) => caught);
    expect(other).toMatchObject({ code: "conflict" });
    expect(isDuplicateAccount(other)).toBe(false);
  });

  it("names the other statuses, and no answer as offline", async () => {
    const codeOf = (answer: MtpResponse | Error) =>
      stub(answer)
        .api.config()
        .catch((error: unknown) => (error as MtPelerinError).code);
    await expect(codeOf({ status: 403, body: null })).resolves.toBe("forbidden");
    await expect(codeOf({ status: 422, body: null })).resolves.toBe("refused");
    await expect(codeOf({ status: 400, body: null })).resolves.toBe("refused");
    await expect(codeOf({ status: 502, body: null })).resolves.toBe("server");
    await expect(codeOf(new TypeError("Network request failed"))).resolves.toBe("offline");
    // A 2xx the guard refuses.
    await expect(codeOf({ status: 200, body: { networks: "all" } })).resolves.toBe("malformed");
  });

  it("names the call that failed, and the field of an answer it could not read", async () => {
    const failureOf = (
      answer: MtpResponse | Error,
      call: (api: ReturnType<typeof stub>["api"]) => Promise<unknown>
    ) => call(stub(answer).api).catch((error: unknown) => error as MtPelerinError);
    await expect(
      failureOf({ status: 200, body: { ...PERSON, scope_id: null } }, (api) =>
        api.findPerson("token")
      )
    ).resolves.toMatchObject({ code: "malformed", call: "findPerson", field: "scope_id" });
    await expect(
      failureOf({ status: 200, body: { networks: "all" } }, (api) => api.config())
    ).resolves.toMatchObject({ code: "malformed", call: "config", field: null });
    // A status, no answer: the call too.
    await expect(
      failureOf({ status: 502, body: null }, (api) => api.listAccounts("token", {}))
    ).resolves.toMatchObject({ code: "server", call: "listAccounts", field: null });
    await expect(
      failureOf(new TypeError("Network request failed"), (api) => api.balances("token", "b1"))
    ).resolves.toMatchObject({ code: "offline", call: "balances" });
    // A 404 of findOne is still no profile.
    await expect(stub({ status: 404, body: null }).api.findPerson("token")).resolves.toBeNull();
  });

  it("gives the journal the call and the field as the error's causes, never a value", async () => {
    const error = await stub({ status: 200, body: { ...PERSON, user_id: "Alice Example" } })
      .api.findPerson("token")
      .catch((caught: unknown) => caught);
    // What logFailure keeps of it in "Sell" (src/lib/log/entry.ts, without messages).
    expect(describeError(error, false)).toEqual({
      kind: "MtPelerinError",
      code: "malformed",
      message: null,
      cause: {
        kind: "MtpCall",
        code: "findPerson",
        message: null,
        cause: { kind: "MtpField", code: "user_id", message: null, cause: null }
      }
    });
    expect(JSON.stringify(describeError(error, true))).not.toContain("Alice");
  });

  it("goes through the fake Mt Pelerin of the tests (jest/mtpelerin.ts) for the app's transport", async () => {
    const api = createMtPelerinApi(mtPelerinTransport("production"));
    const config = await api.config();
    expect(config.networks.map(({ id }) => id)).toContain("lightning_mainnet");
    expect(fake.mtPelerin().requests).toEqual([{ method: "GET", path: "/forms/mtp-config" }]);
    fake.mtPelerin().offline = true;
    await expect(api.config()).rejects.toMatchObject({ code: "offline" });
  });

  it("takes a session another device's fake issued, never one it spent", async () => {
    // Each device's fake is its own (transport.ts): another device of the account shares its token
    // through the relays.
    const login = async (server: FakeMtPelerin) => {
      const api = createMtPelerinApi((request) => server.handle(request));
      const device = await api.addPhoneDevice("+41791234567", "3.0.0");
      await api.sendSms(device.id);
      return { api, tokens: await api.authenticate(device.id, server.smsCode) };
    };
    const other = scenarioServer("ready", ADDRESS);
    const { tokens } = await login(other);
    const here = scenarioServer("ready", ADDRESS);
    const api = createMtPelerinApi((request) => here.handle(request));
    const pair = await api.refresh(tokens.refreshToken);
    expect(pair.refreshToken).toBe(tokens.refreshToken);
    // A first login of a fictitious number: the scenario's profile and accounts.
    await expect(api.findPerson(pair.accessToken)).resolves.toMatchObject({
      phone: FAKE_ADOPTED_PHONE
    });
    await expect(api.listAccounts(pair.accessToken, { type: "external" })).resolves.toHaveLength(1);
    // Its own, revoked: refused, as Mt Pelerin would.
    const own = await login(here);
    here.revokeSessions();
    await expect(own.api.refresh(own.tokens.refreshToken)).rejects.toMatchObject({
      code: "unauthorized"
    });
    await expect(api.refresh(tokens.refreshToken)).rejects.toMatchObject({ code: "unauthorized" });
    // Nor anything but a fake's token.
    await expect(api.refresh("eyJhbGciOiJIUzI1NiJ9.e30.x")).rejects.toMatchObject({
      code: "unauthorized"
    });
  });
});

describe("the balance Mt Pelerin holds from deferred sells", () => {
  it("reads what is held by currency, nothing held as none", () => {
    expect(readBalances({})).toEqual([]);
    expect(
      readBalances({
        CHF: { total: "137.50", by_source_currency: { sat: "125.00", USDC: "12.50" } },
        EUR: { total: "3" }
      })
    ).toEqual([
      { currency: "CHF", total: { units: 13_750n, scale: 2 } },
      { currency: "EUR", total: { units: 3n, scale: 0 } }
    ]);
    for (const bad of [null, [], "CHF", { chf: { total: "1" } }, { CHF: "1" }, { CHF: {} }]) {
      expect(() => readBalances(bad)).toThrow(malformed);
    }
    expect(() => readBalances({ CHF: { total: "-1" } })).toThrow(malformed);
  });

  it("asks for the balance of a bank account, with the session's token", async () => {
    const requests: MtpRequest[] = [];
    const api = createMtPelerinApi(async (request) => {
      requests.push(request);
      return { status: 200, body: { CHF: { total: "42.10" } } };
    });
    await expect(api.balances("jwt", BANK.id)).resolves.toEqual([
      { currency: "CHF", total: { units: 4_210n, scale: 2 } }
    ]);
    expect(requests).toEqual([
      { method: "GET", path: `/orders/${BANK.id}/balances`, token: "jwt" }
    ]);
  });
});

describe("the wallet login of Mt Pelerin's dev/test environment", () => {
  it("registers a wallet's device, its address and no phone", async () => {
    const requests: MtpRequest[] = [];
    const api = createMtPelerinApi(async (request) => {
      requests.push(request);
      return {
        status: 200,
        body: { id: "64a0c0de0000000000000005", user_id: "u-1", status: "new" }
      };
    });
    await api.addWalletDevice("0x7aBdeA04461BfDfB36e25364e45c3D56845769c8", "3.0.0");
    expect(requests[0]).toEqual({
      method: "POST",
      path: "/devices/add",
      body: {
        identifier_type: "address",
        address: "0x7aBdeA04461BfDfB36e25364e45c3D56845769c8",
        deviceInfo: { platform: "sattle.me", version: "3.0.0" }
      }
    });
  });

  it("logs in the test environment's way: the device id signed, the same profile each time", async () => {
    const server = new FakeMtPelerin();
    const api = createMtPelerinApi((request) => server.handle(request));
    const signer = testLoginSigner(deriveTeamKeys(walletSecret(testSeed())));
    const first = await api.addWalletDevice(signer.address, "3.0.0");
    const tokens = await api.authenticate(first.id, signer.signDevice(first.id));
    const person = await api.createPerson(tokens.accessToken, { type: "user" });
    // Another device of the account, or the same later: the same user, the same profile.
    const device = await api.addWalletDevice(signer.address, "3.0.0");
    expect(device.id).not.toBe(first.id);
    expect(device.userId).toBe(first.userId);
    const again = await api.authenticate(device.id, signer.signDevice(device.id));
    await expect(api.findPerson(again.accessToken)).resolves.toMatchObject({ id: person.id });
    // Another device id's signature, or no signature: "HTTP 500".
    const next = await api.addWalletDevice(signer.address, "3.0.0");
    await expect(api.authenticate(next.id, signer.signDevice(device.id))).rejects.toMatchObject({
      code: "server",
      status: 500
    });
    await expect(api.authenticate(next.id, "not base64")).rejects.toMatchObject({ status: 500 });
    // Past 15 minutes, the device is registered again.
    const late = await api.addWalletDevice(signer.address, "3.0.0");
    const start = Date.now();
    server.now = () => start + 16 * 60_000;
    await expect(api.authenticate(late.id, signer.signDevice(late.id))).rejects.toMatchObject({
      code: "forbidden"
    });
    await expect(api.addWalletDevice("0x1234", "3.0.0")).rejects.toMatchObject({
      code: "refused"
    });
  });
});
