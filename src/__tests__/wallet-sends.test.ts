import { schnorr } from "@noble/curves/secp256k1.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

import { DEFAULT_RELAYS } from "@/config/relays";
import { closeAccount, getAccountTeamKeys } from "@/features/account/session";
import { readWalletPayments } from "@/features/wallet/payments-history";
import {
  copyWalletSends,
  holdWalletSends,
  recordWalletSends
} from "@/features/wallet/wallet-sends";
import { encodeWalletSecret } from "@/lib/breez/secret";
import type { WalletPayment } from "@/lib/breez/types";
import { publishToRelays } from "@/lib/nostr/pool";
import { NewerRecordError, sealRecord } from "@/lib/nostr/record";
import { deriveTeamKeys, deriveWalletSendKeys, type TeamKeys } from "@/lib/team/keys";
import {
  parseWalletSend,
  walletSendAddress,
  walletSendEvent,
  walletSendOf,
  walletSendsOf,
  type WalletSend
} from "@/lib/wallet-sends/record";

import { openTestAccount } from "../../jest/account";
import type * as RelaysFake from "../../jest/nostr-relays";

/*
 * Each payment the wallet sent, published by the owner's app for the assistants' export
 * (src/lib/wallet-sends/, src/features/wallet/wallet-sends.ts).
 */

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
const keys = deriveWalletSendKeys(team);

/** 24.10.2026 at 14:32 UTC. */
const NOW = Date.UTC(2026, 9, 24, 14, 32) / 1000;

function payment(overrides: Partial<WalletPayment> = {}): WalletPayment {
  return {
    id: "p",
    direction: "send",
    status: "completed",
    amountSats: 150_000n,
    feeSats: 12n,
    timestamp: NOW - 3600,
    network: "lightning",
    paymentHash: "f6".repeat(32),
    ...overrides
  };
}

const toAddress = payment({ id: "to-address", lightningAddress: "supplier@wallet.example" });
const withdrawal = payment({
  id: "withdrawal",
  timestamp: NOW - 7200,
  network: "bitcoin",
  amountSats: 80_000n,
  feeSats: 450n,
  paymentHash: undefined,
  txId: "07".repeat(32),
  description: "never a label"
});
const received = payment({ id: "received", direction: "receive", feeSats: 0n });
const pending = payment({ id: "pending", status: "pending" });

describe("wallet send keys", () => {
  it("derive from the team's root under their own info strings: never change them", () => {
    const derive = (info: string) =>
      hkdf(sha256, team.root, utf8ToBytes("sattle.me/team"), utf8ToBytes(info), 32);
    expect(keys.encryptionKey).toEqual(derive("wallet-sends/encryption-key/v1"));
    expect(keys.addressKey).toEqual(derive("wallet-sends/address-key/v1"));
    expect(keys.nostr.secretKey).toEqual(derive("wallet-sends/author/v1"));
    expect(keys.nostr.publicKey).toBe(
      bytesToHex(schnorr.getPublicKey(derive("wallet-sends/author/v1")))
    );
    // Test vector: a payment's address, an HMAC-SHA256 of its id under the address key.
    expect(walletSendAddress(keys, "019a1b2c")).toBe(
      bytesToHex(
        hmac(sha256, derive("wallet-sends/address-key/v1"), utf8ToBytes("wallet-send/019a1b2c"))
      )
    );
  });
});

describe("a sending's record", () => {
  it('is made of a payment sent and done only, labelled as "Wallet" labels it', () => {
    expect(walletSendOf(toAddress)).toEqual({
      payment: "to-address",
      at: NOW - 3600,
      sats: 150_000n,
      feeSats: 12n,
      network: "lightning",
      reference: "f6".repeat(32),
      text: "supplier@wallet.example"
    });
    // On-chain: "Withdrawal", whatever its description; its transaction as reference.
    expect(walletSendOf(withdrawal)).toMatchObject({
      network: "bitcoin",
      reference: "07".repeat(32),
      text: null
    });
    // An invoice's description; a Spark transfer without any text and its wallet id.
    expect(walletSendOf(payment({ description: "  Invoice 12  " }))?.text).toBe("Invoice 12");
    expect(
      walletSendOf(payment({ id: "spark-1", network: "spark", paymentHash: undefined }))
    ).toMatchObject({ reference: "spark-1", text: null });
    // A withdrawal without its transaction yet (Breez 0.28's storage migration drops it until the
    // next sync): no record, which would keep the wallet's id as its reference for good.
    expect(walletSendOf({ ...withdrawal, txId: undefined })).toBeNull();
    expect(walletSendOf(received)).toBeNull();
    expect(walletSendOf(pending)).toBeNull();
    expect(walletSendOf(payment({ status: "failed" }))).toBeNull();
  });

  it("reads back as written, dated by its payment, at an opaque address", () => {
    const send = walletSendOf(toAddress)!;
    const event = walletSendEvent(keys, send);
    expect(event.created_at).toBe(send.at);
    expect(event.pubkey).toBe(keys.nostr.publicKey);
    expect(event.tags).toContainEqual(["d", walletSendAddress(keys, "to-address")]);
    expect(event.content).not.toContain("supplier");
    expect(walletSendsOf(keys, [event]).sends.get("to-address")).toEqual(send);
  });

  it("is refused at another payment's address, dated otherwise, or signed by another key", () => {
    const send = walletSendOf(toAddress)!;
    const value = {
      version: 1,
      payment: send.payment,
      at: send.at,
      sats: "150000",
      feeSats: "12",
      network: "lightning",
      reference: send.reference,
      text: send.text
    };
    const seal = (address: string, createdAt: number, signer = keys.nostr.secretKey) =>
      sealRecord({
        type: "wallet-send",
        value,
        signer,
        encryptionKey: keys.encryptionKey,
        address,
        createdAt
      });
    expect(walletSendsOf(keys, [seal(walletSendAddress(keys, "other"), send.at)]).sends.size).toBe(
      0
    );
    expect(
      walletSendsOf(keys, [seal(walletSendAddress(keys, send.payment), send.at + 1)]).sends.size
    ).toBe(0);
    const stranger = deriveWalletSendKeys(
      deriveTeamKeys(
        encodeWalletSecret({
          mnemonic: "legal winner thank year wave sausage worth useful legal winner thank yellow"
        })
      )
    );
    expect(
      walletSendsOf(keys, [
        seal(walletSendAddress(keys, send.payment), send.at, stranger.nostr.secretKey)
      ]).sends.size
    ).toBe(0);
  });

  it("refuses what the app never writes, and tells a newer format", () => {
    const valid = {
      version: 1,
      payment: "p",
      at: 1,
      sats: "1",
      feeSats: "0",
      network: "spark",
      reference: "p",
      text: null
    };
    expect(parseWalletSend(valid)).not.toBeNull();
    expect(parseWalletSend({ ...valid, sats: "-1" })).toBeNull();
    expect(parseWalletSend({ ...valid, sats: 1 })).toBeNull();
    expect(parseWalletSend({ ...valid, feeSats: "1.5" })).toBeNull();
    expect(parseWalletSend({ ...valid, network: "card" })).toBeNull();
    expect(parseWalletSend({ ...valid, text: "" })).toBeNull();
    expect(parseWalletSend({ ...valid, payment: "" })).toBeNull();
    expect(() => parseWalletSend({ ...valid, version: 2 })).toThrow(NewerRecordError);
  });
});

describe("publishing the sendings", () => {
  let account: TeamKeys;

  beforeEach(async () => {
    closeAccount();
    relays.resetRelays();
    walletPayments.mockReset();
    await openTestAccount({ signUp: "done", usage: "merchant" });
    account = getAccountTeamKeys()!;
  });

  afterEach(() => closeAccount());

  const accountKeys = () => deriveWalletSendKeys(account);
  const published = () =>
    relays.calls.filter(
      (call) => call.operation === "publish" && call.event?.pubkey === accountKeys().nostr.publicKey
    ).length;
  const sendsOn = (relay: string): WalletSend[] =>
    [...walletSendsOf(accountKeys(), relays.stored.get(relay) ?? []).sends.values()].sort(
      (a, b) => a.at - b.at
    );

  it("publishes each sending done once, the whole history the first time", async () => {
    walletPayments.mockResolvedValue([toAddress, withdrawal, received, pending]);
    await expect(recordWalletSends([])).resolves.toBe("done");
    expect(walletPayments).toHaveBeenCalledWith(0);
    for (const relay of DEFAULT_RELAYS) {
      expect(sendsOn(relay).map(({ payment: id }) => id)).toEqual(["withdrawal", "to-address"]);
    }

    // Then only what "Wallet" shows; nothing written again.
    walletPayments.mockClear();
    const before = published();
    await expect(recordWalletSends([toAddress, withdrawal])).resolves.toBe("done");
    expect(walletPayments).not.toHaveBeenCalled();
    expect(published()).toBe(before);

    // A sending done since: published at once.
    const later = payment({ id: "later", timestamp: NOW - 60, lightningAddress: "a@b.c" });
    await expect(recordWalletSends([later, toAddress])).resolves.toBe("done");
    expect(sendsOn(DEFAULT_RELAYS[0]!).map(({ payment: id }) => id)).toEqual([
      "withdrawal",
      "to-address",
      "later"
    ]);
  });

  it("writes nothing another device published, nor anything without a majority's read", async () => {
    const call = {
      relays: DEFAULT_RELAYS,
      channel: "account" as const,
      timeoutMs: 1000,
      authKey: accountKeys().nostr.secretKey
    };
    await publishToRelays(walletSendEvent(accountKeys(), walletSendOf(toAddress)!), call);
    relays.calls.length = 0;
    walletPayments.mockResolvedValue([toAddress]);
    await expect(recordWalletSends([])).resolves.toBe("done");
    expect(published()).toBe(0);

    // A majority out of reach: nothing is written, the round is left for later.
    closeAccount();
    await openTestAccount({ signUp: "done", usage: "merchant" });
    account = getAccountTeamKeys()!;
    for (const relay of DEFAULT_RELAYS.slice(0, Math.ceil(DEFAULT_RELAYS.length / 2))) {
      relays.unreachable.add(relay);
    }
    relays.calls.length = 0;
    walletPayments.mockResolvedValue([withdrawal]);
    await expect(recordWalletSends([])).resolves.toBe("left");
    expect(published()).toBe(0);
  });

  it("never writes over a record a newer app wrote", async () => {
    const call = {
      relays: DEFAULT_RELAYS,
      channel: "account" as const,
      timeoutMs: 1000,
      authKey: accountKeys().nostr.secretKey
    };
    const newer = sealRecord({
      type: "wallet-send",
      value: { version: 2, payment: "to-address" },
      signer: accountKeys().nostr.secretKey,
      encryptionKey: accountKeys().encryptionKey,
      address: walletSendAddress(accountKeys(), "to-address"),
      createdAt: toAddress.timestamp
    });
    await publishToRelays(newer, call);
    relays.calls.length = 0;
    walletPayments.mockResolvedValue([toAddress, withdrawal]);
    await expect(recordWalletSends([])).resolves.toBe("done");
    // The withdrawal only: the newer record stays as it is.
    expect(published()).toBe(DEFAULT_RELAYS.length);
    expect(sendsOn(DEFAULT_RELAYS[0]!).map(({ payment: id }) => id)).toEqual(["withdrawal"]);
  });

  it("stops writing while the account is being deleted, and goes on if the deletion fails", async () => {
    walletPayments.mockResolvedValue([toAddress, withdrawal]);
    const resume = await holdWalletSends();
    await expect(recordWalletSends([])).resolves.toBe("left");
    expect(published()).toBe(0);
    resume();
    await expect(recordWalletSends([])).resolves.toBe("done");
    expect(sendsOn(DEFAULT_RELAYS[0]!)).toHaveLength(2);
  });

  it("copies the sendings to new relays", async () => {
    walletPayments.mockResolvedValue([toAddress, withdrawal]);
    await recordWalletSends([]);
    const fresh = "wss://new.example";
    await copyWalletSends(account, DEFAULT_RELAYS, [...DEFAULT_RELAYS, fresh]);
    expect(sendsOn(fresh)).toHaveLength(2);
  });
});
