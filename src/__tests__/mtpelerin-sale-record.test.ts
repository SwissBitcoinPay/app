import { schnorr } from "@noble/curves/secp256k1.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

import { DEFAULT_RELAYS } from "@/config/relays";
import { closeAccount, getAccountTeamKeys } from "@/features/account/session";
import {
  SaleRecordError,
  copyMtpSales,
  readMtpSales,
  recordMtpSale
} from "@/features/sell/sale-records";
import { encodeWalletSecret } from "@/lib/breez/secret";
import { decimalString, readDecimal } from "@/lib/mtpelerin/decimal";
import {
  fetchMtpSales,
  mtpSaleAddress,
  mtpSaleEvent,
  mtpSaleRecordOf,
  mtpSaleValue,
  mtpSalesOf,
  parseMtpSale,
  type MtpSaleRecord
} from "@/lib/mtpelerin/sale-record";
import type { MtpBankAccount, MtpSellOrder } from "@/lib/mtpelerin/types";
import { NewerRecordError, sealRecord } from "@/lib/nostr/record";
import { mtpSaleLines, saleOrderTarget } from "@/features/sell/sale-detail";
import i18n from "@/i18n";
import { formatFiat } from "@/lib/terminal/amount";
import { formatInteger } from "@/lib/locale/format";
import { deriveMtpSaleKeys, deriveTeamKeys, type TeamKeys } from "@/lib/team/keys";

import { openTestAccount } from "../../jest/account";
import { fakeIban } from "../../jest/mtpelerin-fake/server";
import type * as RelaysFake from "../../jest/nostr-relays";

/*
 * The record of each sale to Mt Pelerin (src/lib/mtpelerin/sale-record.ts,
 * src/features/sell/sale-records.ts): its rate, what it wires, its fees, its bank account, kept on
 * the account's relays before its payment leaves.
 */

const relays = jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");

/** BIP-39 test mnemonic (all-zero entropy), never a real wallet's. */
const MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const team = deriveTeamKeys(encodeWalletSecret({ mnemonic: MNEMONIC }));
const keys = deriveMtpSaleKeys(team);

/** 16.11.2026 at 12:31 UTC. */
const AT = Date.UTC(2026, 10, 16, 12, 31) / 1000;
const HASH = "5d".repeat(32);
/** A fictitious IBAN of the fake Mt Pelerin (its checksum valid). */
const IBAN = fakeIban(2957);

const dec = (text: string) => readDecimal(text)!;

const order: MtpSellOrder = {
  id: "64a0c0de0000000000000006",
  shortId: "X7K2P9",
  status: "validated",
  sourceCurrency: "sat",
  sourceAmount: dec("2213"),
  destCurrency: "CHF",
  destAmount: dec("1.20"),
  expiresAt: AT + 3600,
  rate: dec("0.00054231"),
  beneficiaryId: "acc-1",
  invoice: "lnbc…",
  estimate: { sourceAmount: dec("2213"), fees: { total: dec("29"), currency: "sat" } }
};

const account: MtpBankAccount = {
  kind: "bank",
  id: "acc-1",
  status: "active",
  iban: IBAN,
  currency: "CHF",
  label: "Current account",
  owner: {
    name: { kind: "person", firstname: "Heidi", lastname: "Example" },
    street: null,
    postcode: null,
    city: null,
    country: "CH"
  }
};

const sale: MtpSaleRecord = mtpSaleRecordOf({
  order,
  account,
  sats: 2213n,
  paymentHash: HASH,
  deferred: false,
  // Wired at once, under 50 CHF: Mt Pelerin's 1 CHF (transfer-fee.ts).
  transferFeeMinor: 100,
  reference: "SATTLEME",
  oid: "6f1d2c3b-4a59-4e68-9d7c-8b6a5f4e3d2c",
  at: AT
});

describe("the sales' keys", () => {
  it("derive from the team's root under their own info strings: never change them", () => {
    const derive = (info: string) =>
      hkdf(sha256, team.root, utf8ToBytes("sattle.me/team"), utf8ToBytes(info), 32);
    expect(keys.encryptionKey).toEqual(derive("mtpelerin-sales/encryption-key/v1"));
    expect(keys.addressKey).toEqual(derive("mtpelerin-sales/address-key/v1"));
    expect(keys.nostr.secretKey).toEqual(derive("mtpelerin-sales/author/v1"));
    expect(keys.nostr.publicKey).toBe(
      bytesToHex(schnorr.getPublicKey(derive("mtpelerin-sales/author/v1")))
    );
    // Test vector: a sale's address, an HMAC-SHA256 of its payment hash under the address key.
    expect(mtpSaleAddress(keys, HASH)).toBe(
      bytesToHex(
        hmac(
          sha256,
          derive("mtpelerin-sales/address-key/v1"),
          utf8ToBytes(`mtpelerin-sale/${HASH}`)
        )
      )
    );
  });
});

describe("a sale's record", () => {
  it("keeps the order's figures as Mt Pelerin gave them, and the account it is wired to", () => {
    expect(sale).toEqual({
      paymentHash: HASH,
      at: AT,
      orderId: "64a0c0de0000000000000006",
      shortId: "X7K2P9",
      sats: 2213n,
      received: { amount: { units: 120n, scale: 2 }, currency: "CHF" },
      rate: { units: 54231n, scale: 8 },
      fees: { total: { units: 29n, scale: 0 }, currency: "sat" },
      transferFeeMinor: 100,
      deferred: false,
      reference: "SATTLEME",
      oid: "6f1d2c3b-4a59-4e68-9d7c-8b6a5f4e3d2c",
      account: {
        id: "acc-1",
        iban: IBAN,
        currency: "CHF",
        label: "Current account",
        holder: "Heidi Example"
      }
    });
    // Format 2, as written: the decimals as exact texts (their scale kept), the sats in base 10.
    expect(mtpSaleValue(sale)).toEqual({
      version: 2,
      paymentHash: HASH,
      at: AT,
      orderId: "64a0c0de0000000000000006",
      shortId: "X7K2P9",
      sats: "2213",
      received: { amount: "1.20", currency: "CHF" },
      rate: "0.00054231",
      fees: { total: "29", currency: "sat" },
      transferFeeMinor: 100,
      deferred: false,
      reference: "SATTLEME",
      oid: "6f1d2c3b-4a59-4e68-9d7c-8b6a5f4e3d2c",
      account: {
        id: "acc-1",
        iban: IBAN,
        currency: "CHF",
        label: "Current account",
        holder: "Heidi Example"
      }
    });
  });

  it("names no account for a deferred sale: only its id and currency (format 2)", () => {
    const deferred = mtpSaleRecordOf({
      order,
      account,
      sats: 2213n,
      paymentHash: HASH,
      deferred: true,
      transferFeeMinor: 0,
      reference: "SATTLEME",
      oid: "6f1d2c3b-4a59-4e68-9d7c-8b6a5f4e3d2c",
      at: AT
    });
    // Its transfer is made later, grouped, to the account as it is then: neither its IBAN, nor its
    // label, nor its holder of now.
    expect(deferred.account).toEqual({
      id: "acc-1",
      iban: null,
      currency: "CHF",
      label: null,
      holder: null
    });
    const event = mtpSaleEvent(keys, deferred);
    expect(mtpSalesOf(keys, [event]).get(HASH)).toEqual(deferred);
    expect(JSON.stringify(mtpSaleValue(deferred))).not.toMatch(/Heidi|Current account|CH\d\d/);
  });

  it("writes decimals back to the very text it reads", () => {
    for (const text of ["0", "1", "1.20", "0.005", "0.00054231", "2785.4", "123456789012345.5"]) {
      expect(decimalString(dec(text))).toBe(text);
    }
  });

  it("reads back as written, dated by the sale, at an opaque address, its IBAN unseen", () => {
    const event = mtpSaleEvent(keys, sale);
    expect(event.created_at).toBe(AT);
    expect(event.pubkey).toBe(keys.nostr.publicKey);
    expect(event.tags).toEqual([["d", mtpSaleAddress(keys, HASH)]]);
    expect(event.content).not.toContain(IBAN);
    expect(event.content).not.toContain("Example");
    expect(mtpSalesOf(keys, [event]).get(HASH)).toEqual(sale);
  });

  it("is refused at another sale's address, dated otherwise, or signed by another key", () => {
    const seal = (address: string, createdAt: number, signer = keys.nostr.secretKey) =>
      sealRecord({
        type: "mtpelerin-sale",
        value: mtpSaleValue(sale),
        signer,
        encryptionKey: keys.encryptionKey,
        address,
        createdAt
      });
    expect(mtpSalesOf(keys, [seal(mtpSaleAddress(keys, "ab".repeat(32)), AT)]).size).toBe(0);
    expect(mtpSalesOf(keys, [seal(mtpSaleAddress(keys, HASH), AT + 1)]).size).toBe(0);
    const stranger = deriveMtpSaleKeys(
      deriveTeamKeys(
        encodeWalletSecret({
          mnemonic: "legal winner thank year wave sausage worth useful legal winner thank yellow"
        })
      )
    );
    expect(
      mtpSalesOf(keys, [seal(mtpSaleAddress(keys, HASH), AT, stranger.nostr.secretKey)]).size
    ).toBe(0);
    expect(mtpSalesOf(keys, [seal(mtpSaleAddress(keys, HASH), AT)]).get(HASH)).toEqual(sale);
  });

  it("refuses what the app never writes, and tells a newer format", () => {
    const valid = mtpSaleValue(sale) as Record<string, unknown>;
    const accountOf = valid.account as Record<string, unknown>;
    expect(parseMtpSale(valid)).toEqual(sale);
    expect(parseMtpSale({ ...valid, rate: null, fees: null })).toMatchObject({
      rate: null,
      fees: null
    });
    expect(parseMtpSale({ ...valid, account: { ...accountOf, label: null } })).toMatchObject({
      account: { label: null }
    });
    for (const broken of [
      { ...valid, paymentHash: HASH.toUpperCase() },
      { ...valid, sats: "0" },
      { ...valid, sats: 2213 },
      { ...valid, at: -1 },
      { ...valid, received: { amount: 1.2, currency: "CHF" } },
      { ...valid, received: { amount: "-1.20", currency: "CHF" } },
      { ...valid, received: { amount: " 1.20", currency: "CHF" } },
      { ...valid, received: { amount: "1e3", currency: "CHF" } },
      { ...valid, rate: "" },
      { ...valid, fees: { total: "29" } },
      { ...valid, deferred: "no" },
      { ...valid, transferFeeMinor: -1 },
      { ...valid, transferFeeMinor: 1.5 },
      { ...valid, transferFeeMinor: "100" },
      { ...valid, reference: "" },
      { ...valid, shortId: "" },
      { ...valid, account: { ...accountOf, iban: "ch93 0076" } },
      { ...valid, account: { ...accountOf, holder: "" } },
      { ...valid, account: null },
      { ...valid, version: 0 }
    ]) {
      expect(parseMtpSale(broken)).toBeNull();
    }
    expect(() => parseMtpSale({ ...valid, version: 3 })).toThrow(NewerRecordError);

    // Format 1 is still read: every account with its details, a deferred sale's too.
    expect(parseMtpSale({ ...valid, version: 1 })).toEqual(sale);
    expect(parseMtpSale({ ...valid, version: 1, deferred: true })).toEqual({
      ...sale,
      deferred: true
    });
    expect(
      parseMtpSale({
        ...valid,
        version: 1,
        account: { ...accountOf, iban: null, label: null, holder: null }
      })
    ).toBeNull();
    // Format 2: a deferred sale's account has none of its details, any other all of them.
    const bare = { ...accountOf, iban: null, label: null, holder: null };
    expect(parseMtpSale({ ...valid, deferred: true, account: bare })).toMatchObject({
      deferred: true,
      account: { id: "acc-1", iban: null, holder: null }
    });
    expect(parseMtpSale({ ...valid, deferred: true })).toBeNull();
    expect(parseMtpSale({ ...valid, deferred: true, account: { ...bare, label: "A" } })).toBeNull();
    expect(parseMtpSale({ ...valid, account: bare })).toBeNull();
    expect(() => mtpSaleEvent(keys, { ...sale, account: { ...sale.account, iban: null } })).toThrow(
      RangeError
    );
    // Never written out of shape.
    expect(() => mtpSaleEvent(keys, { ...sale, sats: 0n })).toThrow(RangeError);
  });

  it("reads only the sales asked for, by their addresses", async () => {
    const call = {
      relays: DEFAULT_RELAYS,
      channel: "account" as const,
      timeoutMs: 1000,
      authKey: keys.nostr.secretKey
    };
    const other = { ...sale, paymentHash: "ab".repeat(32), orderId: "other-order" };
    for (const relay of DEFAULT_RELAYS) {
      relays.stored.set(relay, [mtpSaleEvent(keys, sale), mtpSaleEvent(keys, other)]);
    }
    const read = await fetchMtpSales(keys, call, [HASH, "not a hash"]);
    expect(read.answered).toBe(DEFAULT_RELAYS.length);
    expect([...read.sales.keys()]).toEqual([HASH]);
    relays.resetRelays();
  });
});

describe("a sale in its row's details (sale-detail.ts)", () => {
  const tag = "en-CH";
  const t = i18n.getFixedT("en");
  const chf = (minor: number) => `${formatFiat(minor, 2, tag)} CHF`;

  it("says what the merchant receives once the transfer fee is taken, and that fee", () => {
    expect(
      mtpSaleLines(sale, t, tag).map(({ key, label, value, detail, masked }) => [
        key,
        label,
        value,
        detail ?? null,
        masked
      ])
    ).toEqual([
      // 1.20 CHF wired less 1 CHF of transfer fee.
      ["received", "You receive", chf(20), null, true],
      ["rate", "Rate", `1 BTC = ${formatInteger(54_231n, tag)} CHF`, null, false],
      // 29 sats of fees, and their francs at the sale's rate, rounded up.
      ["fee", "Sale fees", `${chf(2)} · 29 sats`, null, true],
      ["transferFee", "Transfer fee", chf(100), null, true],
      // Its holder, then its IBAN masked under it.
      [
        "account",
        "To the account",
        "Heidi Example",
        `${IBAN.slice(0, 4)} •••• ${IBAN.slice(-4)}`,
        false
      ],
      // "Immediate", and what it means.
      [
        "transfer",
        "Transfer",
        "Immediate",
        "Transferred on its own, without waiting for your other sales",
        false
      ],
      ["order", "Order number", "X7K2P9", null, false]
    ]);
  });

  it("says a deferred sale's grouped transfer, and fees of 0 in words", () => {
    const lines = mtpSaleLines(
      { ...sale, fees: { total: dec("0"), currency: "sat" }, transferFeeMinor: 0, deferred: true },
      t,
      tag
    ).map(({ key, value, detail }) => [key, value, detail ?? null]);
    expect(lines).toEqual([
      ["received", chf(120), null],
      ["rate", expect.any(String), null],
      // "None", as the wallet's own fees (not "0.00 CHF · 0 sats"); no transfer fee line.
      ["fee", "None", null],
      // No account: wired later, to the account as it is then; a record of format 1, which still
      // holds one, included.
      ["transfer", "Deferred", `In a grouped transfer with your other sales, from ${chf(5_000)}`],
      ["order", "X7K2P9", null]
    ]);
    // In another currency: the threshold's equivalent.
    const eur = mtpSaleLines(
      { ...sale, received: { amount: dec("1.20"), currency: "EUR" }, deferred: true },
      t,
      tag
    ).find(({ key }) => key === "transfer");
    expect(eur?.detail).toBe(
      `In a grouped transfer with your other sales, from the equivalent of ${chf(5_000)}`
    );
  });

  it("follows its very order, looked for since the sale was made", () => {
    expect(saleOrderTarget(sale)).toEqual({
      orderId: "64a0c0de0000000000000006",
      fromMs: AT * 1000
    });
  });

  it("leaves out what Mt Pelerin did not give", () => {
    const keys = mtpSaleLines({ ...sale, rate: null, fees: null, transferFeeMinor: 0 }, t, tag).map(
      ({ key }) => key
    );
    expect(keys).toEqual(["received", "account", "transfer", "order"]);
  });
});

describe("the account's sales on its relays", () => {
  let accountTeam: TeamKeys;

  beforeEach(async () => {
    closeAccount();
    relays.resetRelays();
    await openTestAccount({ signUp: "done", usage: "merchant" });
    accountTeam = getAccountTeamKeys()!;
  });

  afterEach(() => closeAccount());

  const accountKeys = () => deriveMtpSaleKeys(accountTeam);
  const salesOn = (relay: string) => mtpSalesOf(accountKeys(), relays.stored.get(relay) ?? []);

  it("writes a sale to a majority of them, then reads it back", async () => {
    await recordMtpSale(sale);
    const holding = DEFAULT_RELAYS.filter((relay) => salesOn(relay).has(HASH));
    expect(holding.length).toBeGreaterThanOrEqual(Math.floor(DEFAULT_RELAYS.length / 2) + 1);
    await expect(readMtpSales([HASH, "ab".repeat(32)])).resolves.toEqual({
      sales: new Map([[HASH, sale]]),
      complete: true
    });
  });

  it("refuses a sale no majority took: its payment never leaves", async () => {
    for (const relay of DEFAULT_RELAYS.slice(0, Math.ceil(DEFAULT_RELAYS.length / 2))) {
      relays.unreachable.add(relay);
    }
    await expect(recordMtpSale(sale)).rejects.toBeInstanceOf(SaleRecordError);
    // Read without a majority's answer: an absence is not told.
    await expect(readMtpSales([HASH])).resolves.toMatchObject({ complete: false });
  });

  it("copies the sales to new relays", async () => {
    await recordMtpSale(sale);
    const fresh = "wss://new.example";
    await expect(
      copyMtpSales(accountTeam, DEFAULT_RELAYS, [...DEFAULT_RELAYS, fresh])
    ).resolves.toBe(true);
    expect(salesOn(fresh).get(HASH)).toEqual(sale);
  });
});
