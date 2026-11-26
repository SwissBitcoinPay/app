import type { PaymentQuote } from "@/features/sell/flow";
import {
  PaymentWalletClosedError,
  UnexpectedInvoiceError,
  walletPayer
} from "@/features/sell/wallet-payer";
import { closeAccount } from "@/features/account/session";
import {
  closeAccountWallet,
  isAccountWalletOpen,
  openAccountWallet
} from "@/features/account/wallet-access";
import { PasskeyError } from "@/lib/breez/errors";
import { signInWithPasskey } from "@/lib/breez/passkey";
import type { CheckedInvoice } from "@/lib/mtpelerin/invoice";

import { OTHER_TEST_MNEMONIC, openMerchantAccount, testSeed } from "../../jest/account";
import type * as BreezFake from "../../jest/breez-sdk";

/*
 * Mt Pelerin's invoices paid from the account's own wallet (wallet-payer.ts): its 1-sat invoice
 * and each sale's, the real wallet layer over the fake SDK, the passkey's prompt the test's.
 */

jest.mock("../lib/breez/config", () => ({
  ...jest.requireActual("../lib/breez/config"),
  getWalletConfig: () => ({ network: "mainnet", apiKey: "test-api-key" })
}));
jest.mock("../lib/breez/passkey", () => ({
  createPasskeyWallet: jest.fn(),
  preparePasskeys: jest.fn(async () => undefined),
  passkeysReady: jest.fn(() => true),
  signInWithPasskey: jest.fn()
}));

const sdk = jest.requireMock<typeof BreezFake>("@breeztech/breez-sdk-spark-react-native");
const signIn = jest.mocked(signInWithPasskey);

const PR = "lnbc100u1pfakesale";

/** Mt Pelerin's invoice of `sats` as invoice.ts checked it, and as the SDK reads it. */
function invoice(sats = BigInt(10_000), amountMsat = sats * BigInt(1000), pr = PR): CheckedInvoice {
  sdk.fakeSend.inputs.set(pr, {
    tag: sdk.InputType_Tags.Bolt11Invoice,
    inner: [
      {
        amountMsat,
        description: "Mt Pelerin order 5a1e0dd3",
        expiry: BigInt(3600),
        invoice: { bolt11: pr, source: {} },
        network: sdk.BitcoinNetwork.Bitcoin,
        paymentHash: "77aa",
        timestamp: BigInt(Math.floor(Date.now() / 1000) - 60)
      }
    ]
  });
  return {
    pr,
    amountSats: sats,
    paymentHash: "77aa",
    description: null,
    expiresAt: Math.floor(Date.now() / 1000) + 3540
  };
}

/** The payer of an open merchant account, its wallet connected as "Sell"'s screens do. */
async function openPayer() {
  await openMerchantAccount();
  const openWallet = jest.fn(() => openAccountWallet());
  return { payer: walletPayer({ openWallet }), openWallet };
}

const sends = () =>
  sdk.fakeWallet.payments.filter((payment) => payment.paymentType === sdk.PaymentType.Send);

beforeEach(() => {
  closeAccount();
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
  signIn.mockReset().mockResolvedValue({ seed: testSeed(), credentialId: null });
  sdk.fakeWallet.balanceSats = BigInt(20_000);
});

afterEach(async () => {
  await closeAccountWallet();
  closeAccount();
  jest.restoreAllMocks();
});

describe("Mt Pelerin's invoices paid from the account's wallet (wallet-payer.ts)", () => {
  it("quotes, checks the balance, asks the passkey, then pays the invoice once", async () => {
    const { payer, openWallet } = await openPayer();
    const read = invoice();
    const fees = await payer.quote(read);
    // The wallet connected for the payment (useAccountWallet's), its fees on top.
    expect(openWallet).toHaveBeenCalledTimes(1);
    expect(isAccountWalletOpen()).toBe(true);
    expect(fees).toEqual({ amountSats: BigInt(10_000), feeSats: BigInt(3) });
    const quote: PaymentQuote = { invoice: read, ...fees };
    await expect(payer.balance()).resolves.toBe(BigInt(20_000));
    await expect(payer.covers(quote)).resolves.toBe(true);
    await expect(payer.confirm()).resolves.toBe(true);
    expect(signIn).toHaveBeenCalledTimes(1);
    await payer.pay(quote);
    expect(sends()).toHaveLength(1);
    expect(sdk.fakeWallet.balanceSats).toBe(BigInt(20_000 - 10_000 - 3));
    // A retry of the same invoice (its answer lost): the same idempotency key, nothing more leaves.
    await payer.quote(read);
    await payer.pay(quote);
    expect(sends()).toHaveLength(1);
    expect(sdk.fakeWallet.balanceSats).toBe(BigInt(9997));
  });

  it("waits for the connection under way rather than calling the wallet closed", async () => {
    await openMerchantAccount();
    // useAccountWallet's `open`: returns at once while a connection of its own runs.
    let running: Promise<void> | null = null;
    const openWallet = jest.fn(async () => {
      if (running) return;
      running = openAccountWallet().finally(() => {
        running = null;
      });
      await running;
    });
    const payer = walletPayer({ openWallet });
    const read = invoice();
    // "Available" read as the sale's screen shows, its quote asked meanwhile.
    const [balance, fees] = await Promise.all([payer.balance(), payer.quote(read)]);
    expect(balance).toBe(BigInt(20_000));
    expect(fees).toEqual({ amountSats: BigInt(10_000), feeSats: BigInt(3) });
    expect(openWallet).toHaveBeenCalledTimes(1);
  });

  it("says when the balance does not cover the invoice and its fees, read now", async () => {
    const { payer } = await openPayer();
    const read = invoice();
    const quote = { invoice: read, ...(await payer.quote(read)) };
    sdk.fakeWallet.balanceSats = BigInt(10_002);
    await expect(payer.covers(quote)).resolves.toBe(false);
    sdk.fakeWallet.balanceSats = BigInt(10_003);
    await expect(payer.covers(quote)).resolves.toBe(true);
  });

  it("pays nothing but the sats checked, as the SDK reads the invoice", async () => {
    const { payer } = await openPayer();
    await expect(payer.quote(invoice(BigInt(10_000), BigInt(10_001_000)))).rejects.toBeInstanceOf(
      UnexpectedInvoiceError
    );
    // The SDK quoting another amount than the invoice's (jest/breez-sdk.ts `quotedAmount`): refused
    // by the wallet layer already, or by the payer.
    sdk.fakeSend.quotedAmount = BigInt(10_001);
    await expect(payer.quote(invoice())).rejects.toThrow();
    sdk.fakeSend.quotedAmount = null;
    // Never prepared here: never paid.
    const other = invoice(BigInt(10_000), BigInt(10_000_000), "lnbc100u1pfakeother");
    await expect(
      payer.pay({ invoice: other, amountSats: BigInt(10_000), feeSats: BigInt(3) })
    ).rejects.toBeInstanceOf(UnexpectedInvoiceError);
    expect(sends()).toHaveLength(0);
  });

  it("leaves nothing when the passkey's prompt is dismissed, and refuses another account's", async () => {
    const { payer } = await openPayer();
    await payer.quote(invoice());
    signIn.mockRejectedValueOnce(new PasskeyError("cancelled", "Dismissed"));
    await expect(payer.confirm()).resolves.toBe(false);
    signIn.mockResolvedValueOnce({ seed: testSeed(OTHER_TEST_MNEMONIC), credentialId: null });
    await expect(payer.confirm()).rejects.toMatchObject({ name: "OtherAccountError" });
    expect(sends()).toHaveLength(0);
  });

  it("pays nothing when the wallet does not open, and says a failed payment", async () => {
    await openMerchantAccount();
    const closed = walletPayer({ openWallet: async () => undefined });
    await expect(closed.quote(invoice())).rejects.toBeInstanceOf(PaymentWalletClosedError);

    const { payer } = await openPayer();
    const read = invoice();
    const quote = { invoice: read, ...(await payer.quote(read)) };
    sdk.fakeSend.sentStatus = sdk.PaymentStatus.Failed;
    await expect(payer.pay(quote)).rejects.toThrow("Mt Pelerin's payment failed");
  });
});
