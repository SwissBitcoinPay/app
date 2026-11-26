import { schnorr } from "@noble/curves/secp256k1.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

import { DEFAULT_RELAYS } from "@/config/relays";
import { closeAccount, getAccountTeamKeys } from "@/features/account/session";
import { valuesOf } from "@/features/wallet/export/run";
import { exportRows } from "@/features/wallet/export/rows";
import {
  copyPaymentRates,
  followPaymentRates,
  holdPaymentRates,
  knownPaymentRates,
  paymentRatesWritten,
  paymentsToPrice,
  pointSpans,
  readPaymentRates,
  readSpans,
  recordPaymentRates
} from "@/features/wallet/payment-rates";
import { readWalletPayments } from "@/features/wallet/payments-history";
import { encodeWalletSecret } from "@/lib/breez/secret";
import type { WalletPayment } from "@/lib/breez/types";
import { publishToRelays } from "@/lib/nostr/pool";
import { NewerRecordError, sealRecord } from "@/lib/nostr/record";
import {
  PAYMENT_RATE_VERSION,
  fetchPaymentRates,
  parsePaymentRate,
  paymentRateAddress,
  paymentRateEvent,
  paymentRatesOf,
  type PaymentRate
} from "@/lib/rates/payment-rates";
import { hourOf, pointHourOf } from "@/lib/rates/sources";
import {
  derivePaymentRateKeys,
  deriveTeamKeys,
  wipeTeamKeys,
  type TeamKeys
} from "@/lib/team/keys";

import { openTestAccount } from "../../jest/account";
import { coingecko, setCoingeckoPrice } from "../../jest/coingecko";
import type * as RelaysFake from "../../jest/nostr-relays";

jest.mock("../features/wallet/payments-history", () => ({
  ...jest.requireActual("../features/wallet/payments-history"),
  readWalletPayments: jest.fn()
}));

const relays = jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");
const walletPayments = jest.mocked(readWalletPayments);

/** BIP-39 test mnemonic (all-zero entropy), never a real wallet's. */
const MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const team = deriveTeamKeys(encodeWalletSecret({ mnemonic: MNEMONIC }));
const keys = derivePaymentRateKeys(team);

/** 24.10.2026 at 14:32 UTC. */
const NOW = Date.UTC(2026, 9, 24, 14, 32) / 1000;
const DAY = 24 * 3600;

function rateAt(payment: string, at: number, rate = 69_400.5, currency = "CHF"): PaymentRate {
  return { payment, at, currency, hour: pointHourOf(at), rate };
}

function payment(overrides: Partial<WalletPayment> = {}): WalletPayment {
  return {
    id: "p",
    direction: "receive",
    status: "completed",
    amountSats: 10_000n,
    feeSats: 0n,
    timestamp: NOW - 3600,
    network: "lightning",
    paymentHash: "aa".repeat(32),
    ...overrides
  };
}

describe("payment rate keys", () => {
  it("derive from the team's root under their own info strings: never change them", () => {
    const derive = (info: string) =>
      hkdf(sha256, team.root, utf8ToBytes("sattle.me/team"), utf8ToBytes(info), 32);
    expect(keys.encryptionKey).toEqual(derive("payment-rates/encryption-key/v1"));
    expect(keys.addressKey).toEqual(derive("payment-rates/address-key/v1"));
    expect(keys.nostr.secretKey).toEqual(derive("payment-rates/author/v1"));
    expect(keys.nostr.publicKey).toBe(
      bytesToHex(schnorr.getPublicKey(derive("payment-rates/author/v1")))
    );
    // Test vector: a payment's address, an HMAC-SHA256 of its id under the address key.
    expect(paymentRateAddress(keys, "019a1b2c")).toBe(
      bytesToHex(
        hmac(sha256, derive("payment-rates/address-key/v1"), utf8ToBytes("payment-rate/019a1b2c"))
      )
    );
  });

  it("are refused once the account closes", () => {
    const closing = deriveTeamKeys(encodeWalletSecret({ mnemonic: MNEMONIC }));
    wipeTeamKeys(closing);
    expect(() => derivePaymentRateKeys(closing)).toThrow();
  });
});

describe("payment rate records", () => {
  const rate = rateAt("p", NOW - 3600);
  const written = { version: PAYMENT_RATE_VERSION, ...rate };

  it("read back what they hold, checked whole", () => {
    expect(parsePaymentRate(written)).toEqual(rate);
    const invalid: unknown[] = [
      null,
      [],
      { ...written, version: 0 },
      { ...written, payment: "" },
      { ...written, payment: "x".repeat(201) },
      { ...written, at: -1 },
      { ...written, at: 1.5 },
      { ...written, currency: "chf" },
      { ...written, currency: "BTC" },
      // Its hour is the one that prices its time, never another.
      { ...written, hour: rate.hour + 3600 },
      { ...written, hour: rate.hour + 1 },
      { ...written, rate: 0 },
      { ...written, rate: -1 },
      { ...written, rate: Number.POSITIVE_INFINITY },
      { ...written, rate: "69400" }
    ];
    for (const value of invalid) expect(parsePaymentRate(value)).toBeNull();
    expect(() => parsePaymentRate({ ...written, version: PAYMENT_RATE_VERSION + 1 })).toThrow(
      NewerRecordError
    );
  });

  it("go to an opaque address, dated by their payment, and open with their keys only", () => {
    const event = paymentRateEvent(keys, rate);
    expect(event.created_at).toBe(rate.at);
    expect(event.pubkey).toBe(keys.nostr.publicKey);
    expect(event.tags).toEqual([["d", paymentRateAddress(keys, "p")]]);
    expect(event.content).not.toContain("69400");
    expect(paymentRatesOf(keys, [event]).rates.get("p")).toEqual(rate);
    // Another account's keys open nothing.
    const other = derivePaymentRateKeys(
      deriveTeamKeys(
        encodeWalletSecret({
          mnemonic: "legal winner thank year wave sausage worth useful legal winner thank yellow"
        })
      )
    );
    expect(paymentRatesOf(other, [event]).rates.size).toBe(0);
  });

  it("refuse a record at another payment's address", () => {
    const moved = sealRecord({
      type: "payment-rate",
      value: written,
      signer: keys.nostr.secretKey,
      encryptionKey: keys.encryptionKey,
      address: paymentRateAddress(keys, "other"),
      createdAt: rate.at
    });
    expect(paymentRatesOf(keys, [moved]).rates.size).toBe(0);
  });

  it("keep the copy relays keep of two written at once, and leave a newer format alone", () => {
    const francs = paymentRateEvent(keys, rate);
    const euros = paymentRateEvent(keys, { ...rate, currency: "EUR", rate: 60_000 });
    const lower = francs.id < euros.id ? rate : { ...rate, currency: "EUR", rate: 60_000 };
    expect(paymentRatesOf(keys, [francs, euros]).rates.get("p")).toEqual(lower);
    expect(paymentRatesOf(keys, [euros, francs]).rates.get("p")).toEqual(lower);

    const newer = sealRecord({
      type: "payment-rate",
      value: { ...written, version: PAYMENT_RATE_VERSION + 1 },
      signer: keys.nostr.secretKey,
      encryptionKey: keys.encryptionKey,
      address: paymentRateAddress(keys, "p"),
      createdAt: rate.at
    });
    const read = paymentRatesOf(keys, [francs, newer]);
    expect(read.rates.size).toBe(0);
    expect(read.newer).toEqual(new Set([paymentRateAddress(keys, "p")]));
    // Alone at its address too: its address is told all the same.
    expect(paymentRatesOf(keys, [newer]).newer).toEqual(new Set([paymentRateAddress(keys, "p")]));
  });

  it("are read page by page, between two dates", async () => {
    const call = {
      relays: DEFAULT_RELAYS,
      channel: "account" as const,
      timeoutMs: 1000,
      authKey: keys.nostr.secretKey
    };
    for (let n = 0; n < 130; n += 1) {
      await publishToRelays(paymentRateEvent(keys, rateAt(`p${n}`, NOW - 7 * DAY + n * 60)), call);
    }
    const all = await fetchPaymentRates(keys, call, NOW - 8 * DAY);
    expect(all.answered).toBe(DEFAULT_RELAYS.length);
    expect(all.rates.size).toBe(130);
    const some = await fetchPaymentRates(keys, call, NOW - 7 * DAY + 60, NOW - 7 * DAY + 120);
    expect([...some.rates.keys()].sort()).toEqual(["p1", "p2"]);
  });
});

describe("recording the rates", () => {
  const sale = payment({ id: "sale", timestamp: NOW - 3600 });
  const sent = payment({ id: "sent", direction: "send", timestamp: NOW - 2 * DAY });
  const pending = payment({ id: "pending", status: "pending", timestamp: NOW - 600 });
  const failed = payment({ id: "failed", status: "failed", timestamp: NOW - 700 });
  // Older than the history CoinGecko keeps: no rate.
  const old = payment({ id: "old", timestamp: NOW - 400 * DAY });
  let account: TeamKeys;

  beforeEach(async () => {
    jest.useFakeTimers({ advanceTimers: true, now: NOW * 1000 });
    closeAccount();
    relays.resetRelays();
    walletPayments.mockReset();
    await openTestAccount({ signUp: "done", usage: "merchant", displayCurrency: "CHF" });
    account = getAccountTeamKeys()!;
    setCoingeckoPrice("CHF", pointHourOf(sale.timestamp), 69_400.25);
    setCoingeckoPrice("CHF", pointHourOf(sent.timestamp), 70_100);
  });

  afterEach(() => {
    closeAccount();
    jest.useRealTimers();
  });

  // The rate records published, whatever else the account publishes (its settings' backup).
  const ratesPublished = () =>
    relays.calls.filter(
      (call) =>
        call.operation === "publish" &&
        call.event?.pubkey === derivePaymentRateKeys(account).nostr.publicKey
    ).length;

  const ofAccount = () =>
    [
      ...paymentRatesOf(
        derivePaymentRateKeys(account),
        relays.stored.get(DEFAULT_RELAYS[0]!) ?? []
      ).rates.values()
    ].sort((a, b) => a.at - b.at);

  it("records each payment done once, at the point of its hour, the year read the first time", async () => {
    walletPayments.mockResolvedValue([sale, pending, failed, sent, old]);
    await expect(recordPaymentRates("CHF", [])).resolves.toBe("done");
    // The wallet's year: the oldest hour CoinGecko still prices.
    expect(walletPayments).toHaveBeenCalledWith(hourOf(NOW - 364 * DAY));
    expect(ofAccount()).toEqual([
      rateAt("sent", sent.timestamp, 70_100),
      rateAt("sale", sale.timestamp, 69_400.25)
    ]);
    // On every relay.
    for (const relay of DEFAULT_RELAYS) {
      expect(
        paymentRatesOf(derivePaymentRateKeys(account), relays.stored.get(relay) ?? []).rates.size
      ).toBe(2);
    }

    // Then only what "Wallet" shows; nothing asked again of what is recorded.
    walletPayments.mockClear();
    const asked = coingecko.requests.length;
    const published = ratesPublished();
    await expect(recordPaymentRates("CHF", [sale, sent])).resolves.toBe("done");
    expect(walletPayments).not.toHaveBeenCalled();
    expect(coingecko.requests).toHaveLength(asked);
    expect(ratesPublished()).toBe(published);

    // A payment done since: its rate, the others left as they are.
    const later = payment({ id: "later", timestamp: NOW - 120, direction: "send" });
    setCoingeckoPrice("CHF", pointHourOf(later.timestamp), 69_800);
    await expect(recordPaymentRates("EUR", [later, sale])).resolves.toBe("left");
    // In the account's currency of the moment: CoinGecko has no euro point here.
    expect(ofAccount()).toHaveLength(2);
    setCoingeckoPrice("EUR", pointHourOf(later.timestamp), 60_000);
    await expect(recordPaymentRates("EUR", [later, sale])).resolves.toBe("done");
    expect(ofAccount().map(({ payment: id, currency }) => [id, currency])).toEqual([
      ["sent", "CHF"],
      ["sale", "CHF"],
      ["later", "EUR"]
    ]);
  });

  it("writes nothing another device recorded, nor anything without a majority's read", async () => {
    const call = {
      relays: DEFAULT_RELAYS,
      channel: "account" as const,
      timeoutMs: 1000,
      authKey: derivePaymentRateKeys(account).nostr.secretKey
    };
    const theirs = rateAt("sale", sale.timestamp, 1234, "EUR");
    await publishToRelays(paymentRateEvent(derivePaymentRateKeys(account), theirs), call);
    walletPayments.mockResolvedValue([sale]);
    await expect(recordPaymentRates("CHF", [])).resolves.toBe("done");
    expect(ofAccount()).toEqual([theirs]);
    expect(coingecko.requests).toEqual([]);

    // A majority out of reach: nothing is written, the round is left for later.
    closeAccount();
    await openTestAccount({ signUp: "done", usage: "merchant" });
    account = getAccountTeamKeys()!;
    for (const relay of DEFAULT_RELAYS.slice(0, Math.ceil(DEFAULT_RELAYS.length / 2))) {
      relays.unreachable.add(relay);
    }
    relays.calls.length = 0;
    walletPayments.mockResolvedValue([sent]);
    await expect(recordPaymentRates("CHF", [])).resolves.toBe("left");
    expect(ratesPublished()).toBe(0);
  });

  it("leaves for later what CoinGecko or the relays do not give, and goes on once they do", async () => {
    walletPayments.mockResolvedValue([sale]);
    coingecko.down = true;
    await expect(recordPaymentRates("CHF", [])).resolves.toBe("left");
    expect(ofAccount()).toEqual([]);
    coingecko.down = false;
    // Taken by too few relays: not learnt, the same record published again at the next round.
    for (const relay of DEFAULT_RELAYS.slice(1)) relays.readOnly.add(relay);
    await expect(recordPaymentRates("CHF", [])).resolves.toBe("left");
    const [first] = relays.stored
      .get(DEFAULT_RELAYS[0]!)!
      .filter((event) => event.pubkey === derivePaymentRateKeys(account).nostr.publicKey);
    relays.readOnly.clear();
    const asked = coingecko.requests.length;
    await expect(recordPaymentRates("CHF", [])).resolves.toBe("done");
    expect(coingecko.requests).toHaveLength(asked);
    for (const relay of DEFAULT_RELAYS) {
      expect(relays.stored.get(relay)!.filter((event) => event.id === first!.id)).toHaveLength(1);
    }
    expect(ofAccount()).toEqual([rateAt("sale", sale.timestamp, 69_400.25)]);
    // The first round ended "done" only now: the year is read until then.
    expect(walletPayments).toHaveBeenCalledTimes(3);
  });

  it("never writes over a rate a newer app recorded", async () => {
    const rateKeys = derivePaymentRateKeys(account);
    const newer = sealRecord({
      type: "payment-rate",
      value: { ...rateAt("sale", sale.timestamp), version: PAYMENT_RATE_VERSION + 1 },
      signer: rateKeys.nostr.secretKey,
      encryptionKey: rateKeys.encryptionKey,
      address: paymentRateAddress(rateKeys, "sale"),
      createdAt: sale.timestamp
    });
    await publishToRelays(newer, {
      relays: DEFAULT_RELAYS,
      channel: "account",
      timeoutMs: 1000,
      authKey: rateKeys.nostr.secretKey
    });
    walletPayments.mockResolvedValue([sale]);
    relays.calls.length = 0;
    await expect(recordPaymentRates("CHF", [])).resolves.toBe("done");
    expect(ratesPublished()).toBe(0);
    // Nor does "Export" tell it.
    await expect(readPaymentRates(NOW - DAY, NOW)).resolves.toEqual(new Map());
  });

  it("counts a relay whose pages stopped before the end as one that did not answer", async () => {
    walletPayments.mockResolvedValue([sale]);
    const query = relays.queryEvents;
    const broken = DEFAULT_RELAYS.slice(0, Math.ceil(DEFAULT_RELAYS.length / 2));
    const author = derivePaymentRateKeys(account).nostr.publicKey;
    // Each read of the rates: a first page full, then nothing more in time.
    const pages = new Map<string, number>();
    const spy = jest
      .spyOn(relays, "queryEvents")
      .mockImplementation(async (url, filter, options) => {
        if (!broken.includes(url) || !filter.authors?.includes(author)) {
          return query(url, filter, options);
        }
        const key = `${url}|${filter.since}`;
        const page = pages.get(key) ?? 0;
        pages.set(key, page + 1);
        if (page > 0) throw new Error(`${url}: no answer in time`);
        return [
          ...(await query(url, filter, options)),
          ...Array.from({ length: relays.MAX_EVENTS_PER_FILTER }, (_, n) =>
            paymentRateEvent(derivePaymentRateKeys(account), rateAt(`x${n}`, filter.since!))
          )
        ];
      });
    try {
      relays.calls.length = 0;
      await expect(recordPaymentRates("CHF", [])).resolves.toBe("left");
      expect(ratesPublished()).toBe(0);
      await expect(readPaymentRates(NOW - DAY, NOW)).resolves.toBeNull();
    } finally {
      spy.mockRestore();
    }
  });

  it("stops writing while the account is being deleted, and goes on if the deletion fails", async () => {
    walletPayments.mockResolvedValue([sale, sent]);
    const release = relays.holdPublishes();
    const round = recordPaymentRates("CHF", []);
    // The round's first batch on its way.
    for (let tries = 0; ratesPublished() === 0 && tries < 100; tries += 1) {
      await jest.advanceTimersByTimeAsync(10);
    }
    expect(ratesPublished()).toBeGreaterThan(0);
    let stopped = false;
    const hold = holdPaymentRates().then((resume) => {
      stopped = true;
      return resume;
    });
    await jest.advanceTimersByTimeAsync(100);
    // It waits for the batch on its way.
    expect(stopped).toBe(false);
    release();
    const resume = await hold;
    await round;
    relays.calls.length = 0;
    await expect(recordPaymentRates("CHF", [])).resolves.toBe("left");
    expect(ratesPublished()).toBe(0);
    resume();
    await expect(recordPaymentRates("CHF", [])).resolves.toBe("done");
    expect(ofAccount()).toHaveLength(2);
  });

  it("runs one round at a time, the next one with the payments asked meanwhile", async () => {
    walletPayments.mockResolvedValue([sale]);
    const later = payment({ id: "later", timestamp: NOW - 120 });
    setCoingeckoPrice("CHF", pointHourOf(later.timestamp), 69_800);
    const first = recordPaymentRates("CHF", []);
    const second = recordPaymentRates("CHF", [later]);
    expect(second).toBe(first);
    let written = false;
    void paymentRatesWritten().then(() => (written = true));
    await expect(first).resolves.toBe("done");
    expect(written).toBe(true);
    expect(ofAccount().map(({ payment: id }) => id)).toEqual(["sale", "later"]);
  });

  it('lets "Export" wait for the rates being written', async () => {
    walletPayments.mockResolvedValue([sale]);
    const release = relays.holdPublishes();
    const round = recordPaymentRates("CHF", []);
    let waited = false;
    void paymentRatesWritten().then(() => (waited = true));
    await jest.advanceTimersByTimeAsync(60_000);
    expect(waited).toBe(false);
    release();
    await expect(round).resolves.toBe("done");
    await jest.advanceTimersByTimeAsync(0);
    expect(waited).toBe(true);
    expect(ofAccount()).toHaveLength(1);
    // Nothing running: no wait.
    await expect(paymentRatesWritten()).resolves.toBeUndefined();
  });

  it("tells the screens the rates it learns, and none once the account closes", async () => {
    const theirs = rateAt("sale", sale.timestamp, 1234, "EUR");
    await publishToRelays(paymentRateEvent(derivePaymentRateKeys(account), theirs), {
      relays: DEFAULT_RELAYS,
      channel: "account",
      timeoutMs: 1000,
      authKey: derivePaymentRateKeys(account).nostr.secretKey
    });
    const heard = jest.fn();
    const stop = followPaymentRates(heard);
    const before = knownPaymentRates();
    expect(before.size).toBe(0);
    // The same copy until they change: screens re-render only then.
    expect(knownPaymentRates()).toBe(before);

    walletPayments.mockResolvedValue([sale, sent]);
    await expect(recordPaymentRates("CHF", [])).resolves.toBe("done");
    // The one another device wrote, then the one this round wrote.
    expect(heard).toHaveBeenCalledTimes(2);
    expect(knownPaymentRates()).not.toBe(before);
    expect(knownPaymentRates().get("sale")).toEqual(theirs);
    expect(knownPaymentRates().get("sent")).toEqual(rateAt("sent", sent.timestamp, 70_100));

    // Nothing new: nobody told.
    await expect(recordPaymentRates("CHF", [sale, sent])).resolves.toBe("done");
    expect(heard).toHaveBeenCalledTimes(2);

    closeAccount();
    expect(heard).toHaveBeenCalledTimes(3);
    expect(knownPaymentRates().size).toBe(0);
    stop();
  });

  it("forgets the rates of an account once it closes", async () => {
    walletPayments.mockResolvedValue([sale]);
    await recordPaymentRates("CHF", []);
    closeAccount();
    await expect(recordPaymentRates("CHF", [sale])).resolves.toBe("left");
    await expect(readPaymentRates(0, NOW)).rejects.toThrow();
  });

  it('gives "Export" the period\'s rates from a majority of the relays, never CoinGecko', async () => {
    walletPayments.mockResolvedValue([sale, sent]);
    await recordPaymentRates("CHF", []);
    const asked = coingecko.requests.length;
    const rates = await readPaymentRates(NOW - DAY, NOW);
    expect([...rates!.keys()]).toEqual(["sale"]);
    // The export's values: the sale's own amount; the transfer at its rate.
    const items = [
      {
        id: "payment:sent",
        source: "send" as const,
        timestamp: sent.timestamp,
        note: "",
        fiat: null,
        sats: 10_000n,
        state: null,
        rest: null,
        by: null,
        payments: [sent],
        link: null
      }
    ];
    const lines = exportRows(items, { start: 0, end: NOW });
    const [value] = await valuesOf(lines);
    // 10,000 sats at 70,100 CHF: 7.01 CHF, sent.
    expect(value).toMatchObject({ minor: -701n, currency: "CHF", own: false });
    expect(coingecko.requests).toHaveLength(asked);

    for (const relay of DEFAULT_RELAYS.slice(0, Math.ceil(DEFAULT_RELAYS.length / 2))) {
      relays.unreachable.add(relay);
    }
    await expect(readPaymentRates(NOW - DAY, NOW)).resolves.toBeNull();
    await expect(valuesOf(lines)).rejects.toMatchObject({ failure: "unread" });
  });

  it("copies the rates to new relays", async () => {
    walletPayments.mockResolvedValue([sale, sent]);
    await recordPaymentRates("CHF", []);
    const fresh = "wss://new.example";
    await copyPaymentRates(account, DEFAULT_RELAYS, [...DEFAULT_RELAYS, fresh]);
    expect(
      paymentRatesOf(derivePaymentRateKeys(account), relays.stored.get(fresh) ?? []).rates.size
    ).toBe(2);
  });
});

describe("the payments to price", () => {
  it("are those done, of an hour CoinGecko still prices, without a rate known", () => {
    const state = {
      rates: new Map([["known", rateAt("known", NOW - 60)]]),
      newer: new Set([paymentRateAddress(keys, "newer")])
    };
    const due = payment({ id: "due" });
    const listed = [
      payment({ id: "known" }),
      payment({ id: "newer" }),
      payment({ id: "pending", status: "pending" }),
      payment({ id: "future", timestamp: NOW + 60 }),
      payment({ id: "old", timestamp: NOW - 365 * DAY }),
      payment({ id: "earlier", timestamp: NOW - 2 * DAY }),
      due,
      due
    ];
    // Each once, the oldest first.
    expect(paymentsToPrice(state, keys, listed, NOW).map(({ id }) => id)).toEqual([
      "earlier",
      "due"
    ]);
  });

  it("are read a week at a time", () => {
    expect(readSpans(0, 7 * DAY)).toEqual([
      { since: 0, until: 7 * DAY - 1 },
      { since: 7 * DAY, until: 7 * DAY }
    ]);
    expect(readSpans(100, 200)).toEqual([{ since: 100, until: 200 }]);
    expect(readSpans(NOW - 365 * DAY, NOW)).toHaveLength(53);
  });

  it("are priced in spans of 89 days at most, one request each", () => {
    const hour = 3600;
    expect(pointSpans([0, hour, 89 * DAY, 89 * DAY + hour, 200 * DAY])).toEqual([
      { from: 0, to: 89 * DAY },
      { from: 89 * DAY + hour, to: 89 * DAY + hour },
      { from: 200 * DAY, to: 200 * DAY }
    ]);
    expect(pointSpans([])).toEqual([]);
  });
});
