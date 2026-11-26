import type * as BreezFake from "../../jest/breez-sdk";
import type * as WebFake from "../../jest/breez-sdk-web";
import type { WalletSeed } from "../lib/breez/types";
import type * as WalletModule from "../lib/breez/wallet";

// An opaque stand-in: the wallet layer passes the seed through without reading it.
const seed = { tag: "test-seed" } as unknown as WalletSeed;

const apiKey = process.env.EXPO_PUBLIC_BREEZ_API_KEY;

beforeEach(() => {
  process.env.EXPO_PUBLIC_BREEZ_API_KEY = "test-api-key";
});

afterEach(() => {
  process.env.EXPO_PUBLIC_BREEZ_API_KEY = apiKey;
});

function mockConfig() {
  jest.doMock("expo-constants", () => ({
    __esModule: true,
    default: { expoConfig: { extra: { breezNetwork: "mainnet" } } }
  }));
}

/* eslint-disable @typescript-eslint/no-require-imports -- fresh module graph per test */
function loadNative() {
  jest.resetModules();
  mockConfig();
  const fake = require("@breeztech/breez-sdk-spark-react-native") as typeof BreezFake;
  fake.resetFakeWallet();
  return { fake, ...(require("../lib/breez/wallet") as typeof WalletModule) };
}

function loadWeb() {
  jest.resetModules();
  mockConfig();
  const fake = require("../../jest/breez-sdk-web") as typeof WebFake;
  fake.resetFakeWallet();
  jest.doMock("../lib/breez/web-sdk", () => ({
    loadBreezWeb: async () => ({ sdk: fake, passkeys: fake }),
    isBreezWebLoaded: () => true
  }));
  return {
    fake, // Same API as wallet.ts (AGENTS.md: platform files export the same API).
    ...(require("../lib/breez/wallet.web") as typeof WalletModule)
  };
}
/* eslint-enable @typescript-eslint/no-require-imports */

describe("native wallet: balance and payments", () => {
  it("reads the balance as a bigint", async () => {
    const { fake, connectWallet, getWalletBalance, disconnectWallet } = loadNative();
    fake.fakeWallet.balanceSats = BigInt(1284530);
    await connectWallet(seed);
    await expect(getWalletBalance(false)).resolves.toBe(BigInt(1284530));
    await disconnectWallet();
  });

  it("reads each kind of payment and leaves token payments out", async () => {
    const { fake, connectWallet, listWalletPayments, disconnectWallet } = loadNative();
    const { PaymentType, PaymentStatus, PaymentMethod, PaymentDetails_Tags } = fake;
    fake.fakeWallet.payments = [
      {
        id: "send-ln",
        paymentType: PaymentType.Send,
        status: PaymentStatus.Completed,
        amount: BigInt(150000),
        fees: BigInt(12),
        timestamp: BigInt(1790950000),
        method: PaymentMethod.Lightning,
        details: {
          tag: PaymentDetails_Tags.Lightning,
          inner: {
            description: "Flour",
            invoice: "lnbc1",
            destinationPubkey: "02ab",
            htlcDetails: { paymentHash: "a3f91c07", preimage: undefined },
            lnurlPayInfo: { lnAddress: "bakehouse@wallet.example" }
          }
        }
      },
      {
        id: "receive-address",
        paymentType: PaymentType.Receive,
        status: PaymentStatus.Completed,
        amount: BigInt(50),
        fees: BigInt(0),
        timestamp: BigInt(1790945000),
        method: PaymentMethod.Lightning,
        details: {
          tag: PaymentDetails_Tags.Lightning,
          inner: {
            description: undefined,
            invoice: "lnbc2",
            destinationPubkey: "02ab",
            htlcDetails: { paymentHash: "5b0e7d21", preimage: undefined },
            lnurlPayInfo: undefined,
            // Received at the wallet's Lightning address, with its payer's comment (LUD-12).
            lnurlReceiveMetadata: {
              nostrZapRequest: undefined,
              nostrZapReceipt: undefined,
              senderComment: "For the coffee"
            }
          }
        }
      },
      {
        id: "withdraw",
        paymentType: PaymentType.Send,
        status: PaymentStatus.Pending,
        amount: BigInt(400000),
        fees: BigInt(1840),
        timestamp: BigInt(1790940000),
        method: PaymentMethod.Withdraw,
        // Upper case, as an SDK might give it: lowercased, as every reader matches it. Its address
        // too, as explorers print it.
        details: {
          tag: PaymentDetails_Tags.Withdraw,
          inner: {
            txId: "8E2D6B3A",
            vout: 0,
            destinationAddress: "BC1QW508D6QEJXTDG4Y5R3ZARVARY0C5XW7KV8F3T4"
          }
        }
      },
      {
        id: "withdraw-unproven",
        paymentType: PaymentType.Send,
        status: PaymentStatus.Completed,
        amount: BigInt(30000),
        fees: BigInt(900),
        timestamp: BigInt(1790935000),
        method: PaymentMethod.Withdraw,
        // An address that is none (its checksum wrong): never shown.
        details: {
          tag: PaymentDetails_Tags.Withdraw,
          inner: {
            txId: "9f3e7c4b",
            vout: 1,
            destinationAddress: "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t5"
          }
        }
      },
      {
        id: "withdraw-stored-before",
        paymentType: PaymentType.Send,
        status: PaymentStatus.Completed,
        amount: BigInt(20000),
        fees: BigInt(700),
        timestamp: BigInt(1790932000),
        method: PaymentMethod.Withdraw,
        // Stored before Breez 0.28, its details not filled in again yet: no address, none read.
        details: { tag: PaymentDetails_Tags.Withdraw, inner: { txId: "7d1c2b3a" } }
      },
      {
        id: "token",
        paymentType: PaymentType.Receive,
        status: PaymentStatus.Completed,
        amount: BigInt(5),
        fees: BigInt(0),
        timestamp: BigInt(1790930000),
        method: PaymentMethod.Token,
        details: undefined
      },
      {
        id: "failed-receive",
        paymentType: PaymentType.Receive,
        status: PaymentStatus.Failed,
        amount: BigInt(1000),
        fees: BigInt(0),
        timestamp: BigInt(1790920000),
        method: PaymentMethod.Spark,
        details: undefined
      }
    ];
    await connectWallet(seed);
    await expect(listWalletPayments()).resolves.toEqual([
      {
        id: "send-ln",
        direction: "send",
        status: "completed",
        amountSats: BigInt(150000),
        feeSats: BigInt(12),
        timestamp: 1790950000,
        network: "lightning",
        description: "Flour",
        lightningAddress: "bakehouse@wallet.example",
        paymentHash: "a3f91c07",
        txId: undefined
      },
      {
        id: "receive-address",
        direction: "receive",
        status: "completed",
        amountSats: BigInt(50),
        feeSats: BigInt(0),
        timestamp: 1790945000,
        network: "lightning",
        description: undefined,
        lightningAddress: undefined,
        senderComment: "For the coffee",
        paymentHash: "5b0e7d21",
        txId: undefined
      },
      {
        id: "withdraw",
        direction: "send",
        status: "pending",
        amountSats: BigInt(400000),
        feeSats: BigInt(1840),
        timestamp: 1790940000,
        network: "bitcoin",
        description: undefined,
        lightningAddress: undefined,
        paymentHash: undefined,
        txId: "8e2d6b3a",
        destinationAddress: "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4"
      },
      {
        id: "withdraw-unproven",
        direction: "send",
        status: "completed",
        amountSats: BigInt(30000),
        feeSats: BigInt(900),
        timestamp: 1790935000,
        network: "bitcoin",
        description: undefined,
        lightningAddress: undefined,
        paymentHash: undefined,
        txId: "9f3e7c4b",
        destinationAddress: undefined
      },
      {
        id: "withdraw-stored-before",
        direction: "send",
        status: "completed",
        amountSats: BigInt(20000),
        feeSats: BigInt(700),
        timestamp: 1790932000,
        network: "bitcoin",
        description: undefined,
        lightningAddress: undefined,
        paymentHash: undefined,
        txId: "7d1c2b3a"
      },
      {
        id: "failed-receive",
        direction: "receive",
        status: "failed",
        amountSats: BigInt(1000),
        feeSats: BigInt(0),
        timestamp: 1790920000,
        network: "spark",
        description: undefined,
        lightningAddress: undefined,
        paymentHash: undefined,
        txId: undefined
      }
    ]);
    // `since` and `limit` go to the SDK as its own filters.
    const since = await listWalletPayments({ since: 1790940000 });
    expect(since.map((p) => p.id)).toEqual(["send-ln", "receive-address", "withdraw"]);
    const limited = await listWalletPayments({ limit: 1 });
    expect(limited.map((p) => p.id)).toEqual(["send-ln"]);
    await disconnectWallet();
  });

  it("pages through the payments, telling how many the SDK listed, token payments included", async () => {
    const { fake, connectWallet, listWalletPaymentsPage, disconnectWallet } = loadNative();
    const { PaymentType, PaymentStatus, PaymentMethod, PaymentDetails_Tags } = fake;
    const lightning = (id: string, timestamp: number) => ({
      id,
      paymentType: PaymentType.Receive,
      status: PaymentStatus.Completed,
      amount: BigInt(1000),
      fees: BigInt(0),
      timestamp: BigInt(timestamp),
      method: PaymentMethod.Lightning,
      details: {
        tag: PaymentDetails_Tags.Lightning,
        inner: {
          description: undefined,
          invoice: "lnbc1",
          destinationPubkey: "02ab",
          htlcDetails: { paymentHash: id }
        }
      }
    });
    fake.fakeWallet.payments = [
      lightning("c3", 1790950000),
      { ...lightning("token", 1790940000), method: PaymentMethod.Token, details: undefined },
      lightning("b2", 1790930000),
      lightning("a1", 1790920000)
    ];
    await connectWallet(seed);
    const first = await listWalletPaymentsPage({ offset: 0, limit: 2 });
    expect([first.payments.map((p) => p.id), first.listed]).toEqual([["c3"], 2]);
    const second = await listWalletPaymentsPage({ offset: 2, limit: 2 });
    expect([second.payments.map((p) => p.id), second.listed]).toEqual([["b2", "a1"], 2]);
    const last = await listWalletPaymentsPage({ offset: 4, limit: 2 });
    expect([last.payments, last.listed]).toEqual([[], 0]);
    await disconnectWallet();
  });

  it("reads a transfer the SDK cannot tell as unknown, nothing of its details believed", async () => {
    const { fake, connectWallet, listWalletPayments, getWalletPayment, disconnectWallet } =
      loadNative();
    fake.fakeWallet.payments = [
      // As spark-sdk 0.27.0 on stores a completed transfer of a type it does not know, with a
      // Lightning receipt's details (a description, a hash, a preimage).
      fake.unknownMethodPayment({ id: "unknown-in", amount: BigInt(21000), timestamp: 1790950000 }),
      fake.unknownMethodPayment({
        id: "unknown-out",
        send: true,
        status: fake.PaymentStatus.Pending,
        amount: BigInt(5000),
        fees: BigInt(7),
        timestamp: 1790940000,
        details: { tag: fake.PaymentDetails_Tags.Withdraw, inner: { txId: "8E2D6B3A" } }
      }),
      // A method of a newer SDK: never read as Lightning.
      {
        ...fake.unknownMethodPayment({ id: "newer", amount: BigInt(1), timestamp: 1790930000 }),
        method: 99
      }
    ];
    await connectWallet(seed);
    const read = await listWalletPayments();
    expect(read).toEqual([
      {
        id: "unknown-in",
        direction: "receive",
        status: "completed",
        amountSats: BigInt(21000),
        feeSats: BigInt(0),
        timestamp: 1790950000,
        network: "unknown"
      },
      {
        id: "unknown-out",
        direction: "send",
        status: "pending",
        amountSats: BigInt(5000),
        feeSats: BigInt(7),
        timestamp: 1790940000,
        network: "unknown"
      },
      {
        id: "newer",
        direction: "receive",
        status: "completed",
        amountSats: BigInt(1),
        feeSats: BigInt(0),
        timestamp: 1790930000,
        network: "unknown"
      }
    ]);
    // Not even undefined: none of the fields that would tie it to a sale, an invoice or a deposit.
    for (const payment of read) {
      for (const field of [
        "description",
        "lightningAddress",
        "senderComment",
        "paymentHash",
        "preimage",
        "txId",
        "destinationAddress"
      ]) {
        expect(payment).not.toHaveProperty(field);
      }
    }
    await expect(getWalletPayment("unknown-in")).resolves.toEqual(read[0]);
    await disconnectWallet();
  });

  it("refuses to read once the wallet is disconnected", async () => {
    const { connectWallet, listWalletPayments, getWalletBalance, disconnectWallet } = loadNative();
    await connectWallet(seed);
    await disconnectWallet();
    await expect(listWalletPayments()).rejects.toMatchObject({ code: "notConnected" });
    await expect(getWalletBalance(false)).rejects.toMatchObject({ code: "notConnected" });
  });
});

describe("web wallet: balance and payments", () => {
  it("reads the balance's number as a bigint, and refuses an inexact one", async () => {
    const { fake, connectWallet, getWalletBalance, disconnectWallet } = loadWeb();
    fake.fakeWallet.balanceSats = 1284530;
    await connectWallet(seed);
    await expect(getWalletBalance(true)).resolves.toBe(BigInt(1284530));
    fake.fakeWallet.balanceSats = 2 ** 53;
    await expect(getWalletBalance(true)).rejects.toMatchObject({ code: "requestFailed" });
    await disconnectWallet();
  });

  it("reads the web build's payments like the native ones", async () => {
    const { fake, connectWallet, listWalletPayments, listWalletPaymentsPage, disconnectWallet } =
      loadWeb();
    fake.fakeWallet.payments = [
      {
        id: "receive-ln",
        paymentType: "receive",
        status: "completed",
        amount: BigInt(18420),
        fees: BigInt(0),
        timestamp: 1790950000,
        method: "lightning",
        details: {
          type: "lightning",
          description: "",
          invoice: "lnbc1",
          destinationPubkey: "02ab",
          htlcDetails: { paymentHash: "7f2c04b1" },
          lnurlReceiveMetadata: { senderComment: "For the coffee" }
        }
      },
      {
        id: "deposit",
        paymentType: "receive",
        status: "completed",
        amount: BigInt(250000),
        fees: BigInt(0),
        timestamp: 1790940000,
        method: "deposit",
        // Upper case, as an SDK might give it: lowercased, as every reader matches it.
        details: { type: "deposit", txId: "19AB3E5C", vout: 0 }
      },
      {
        id: "token",
        paymentType: "send",
        status: "completed",
        amount: BigInt(1),
        fees: BigInt(0),
        timestamp: 1790930000,
        method: "token"
      },
      {
        id: "withdraw",
        paymentType: "send",
        status: "pending",
        amount: BigInt(400000),
        fees: BigInt(1840),
        timestamp: 1790920000,
        method: "withdraw",
        // Its address checked, in lowercase, as the native build reads it.
        details: {
          type: "withdraw",
          txId: "8E2D6B3A",
          vout: 0,
          destinationAddress: "BC1QW508D6QEJXTDG4Y5R3ZARVARY0C5XW7KV8F3T4"
        }
      }
    ];
    await connectWallet(seed);
    await expect(listWalletPayments()).resolves.toEqual([
      {
        id: "receive-ln",
        direction: "receive",
        status: "completed",
        amountSats: BigInt(18420),
        feeSats: BigInt(0),
        timestamp: 1790950000,
        network: "lightning",
        // An empty description is no description.
        description: undefined,
        lightningAddress: undefined,
        senderComment: "For the coffee",
        paymentHash: "7f2c04b1",
        txId: undefined
      },
      {
        id: "deposit",
        direction: "receive",
        status: "completed",
        amountSats: BigInt(250000),
        feeSats: BigInt(0),
        timestamp: 1790940000,
        network: "bitcoin",
        description: undefined,
        lightningAddress: undefined,
        paymentHash: undefined,
        txId: "19ab3e5c"
      },
      {
        id: "withdraw",
        direction: "send",
        status: "pending",
        amountSats: BigInt(400000),
        feeSats: BigInt(1840),
        timestamp: 1790920000,
        network: "bitcoin",
        description: undefined,
        lightningAddress: undefined,
        paymentHash: undefined,
        txId: "8e2d6b3a",
        destinationAddress: "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4"
      }
    ]);
    // Paged as the native build (`offset`, `limit`), the token payment counted as listed.
    const page = await listWalletPaymentsPage({ offset: 1, limit: 2 });
    expect([page.payments.map((p) => p.id), page.listed]).toEqual([["deposit"], 2]);
    await disconnectWallet();
  });

  it("reads a transfer the SDK cannot tell as the native build does", async () => {
    const { fake, connectWallet, listWalletPayments, disconnectWallet } = loadWeb();
    fake.fakeWallet.payments = [
      fake.unknownMethodPayment({ id: "unknown-in", amount: 21000, timestamp: 1790950000 }),
      fake.unknownMethodPayment({
        id: "unknown-out",
        send: true,
        status: "failed",
        amount: 5000,
        timestamp: 1790940000,
        details: { type: "deposit", txId: "19AB3E5C", vout: 0 }
      }),
      // A method of a newer SDK: never read as Lightning.
      {
        ...fake.unknownMethodPayment({ id: "newer", amount: 1, timestamp: 1790930000 }),
        method: "crossChain"
      }
    ];
    await connectWallet(seed);
    const read = await listWalletPayments();
    expect(read).toEqual([
      {
        id: "unknown-in",
        direction: "receive",
        status: "completed",
        amountSats: BigInt(21000),
        feeSats: BigInt(0),
        timestamp: 1790950000,
        network: "unknown"
      },
      {
        id: "unknown-out",
        direction: "send",
        status: "failed",
        amountSats: BigInt(5000),
        feeSats: BigInt(0),
        timestamp: 1790940000,
        network: "unknown"
      },
      {
        id: "newer",
        direction: "receive",
        status: "completed",
        amountSats: BigInt(1),
        feeSats: BigInt(0),
        timestamp: 1790930000,
        network: "unknown"
      }
    ]);
    for (const payment of read) {
      for (const field of [
        "description",
        "lightningAddress",
        "senderComment",
        "paymentHash",
        "preimage",
        "txId",
        "destinationAddress"
      ]) {
        expect(payment).not.toHaveProperty(field);
      }
    }
    await disconnectWallet();
  });
});
