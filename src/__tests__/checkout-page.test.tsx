import "@/i18n";

import { schnorr } from "@noble/curves/secp256k1.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { act, fireEvent, renderRouter, screen, waitFor, within } from "expo-router/testing-library";
import { Linking } from "react-native";

import PaymentLinkScreen from "@/app/pay";
import { LEASE_GRACE_SECONDS } from "@/config/onchain";
import { EXPIRY_GRACE_SECONDS } from "@/features/terminal/invoice";
import { REDIRECT_DELAY_MS } from "@/features/payment-link/useCheckoutLink";
import { FIRST_CHECK_TIMEOUT_MS } from "@/features/payment-link/useSharedInvoice";
import { bytesToBase64Url } from "@/lib/base64";
import { formatDate } from "@/lib/locale/date";
import { publishToRelays } from "@/lib/nostr/pool";
import { sealRecord } from "@/lib/nostr/record";
import { checkoutKeys, checkoutRestKeys } from "@/lib/payment-link/checkout";
import { openRedirect, openUri } from "@/lib/payment-link/device";
import { encodeRelayList } from "@/lib/relays/list";

import { taprootAddress } from "../../jest/bitcoin";
import { makeInvoice, metadataHash, preimagePair } from "../../jest/lightning";
import type * as MempoolFake from "../../jest/mempool";
import type * as RelaysFake from "../../jest/nostr-relays";

/*
 * The payer's page of an integration's checkout link (src/app/pay.tsx, useCheckoutLink, SPEC.md
 * §30 of sattleme/checkout-spec): the invoice an online shop's server declared, read from
 * the relays the URL names, its payment checked from the payer's browser (LUD-21), then the way
 * back to the shop: on its own 7 s after the payment is proven, or enough was sent on-chain in time
 * (being confirmed), at once with a tap, never on an expired, underpaid or unproven invoice.
 */

jest.mock("../lib/breez/config", () => ({
  ...jest.requireActual("../lib/breez/config"),
  getBreezNetwork: () => "mainnet"
}));
// The browser's clipboard, wallet handoff and redirection, and the tab's memory of it.
const mockRedirected = new Set<string>();
jest.mock("../lib/payment-link/device", () => ({
  canCopyText: () => true,
  copyText: jest.fn(async () => undefined),
  openUri: jest.fn(async () => undefined),
  openRedirect: jest.fn(async () => undefined),
  shareUrl: jest.fn(),
  wasRedirected: (id: string) => mockRedirected.has(id),
  rememberRedirect: (id: string) => mockRedirected.add(id)
}));
// The code's content, readable: the plate draws it as squares.
jest.mock("@/components/ui/QrPlate", () => {
  /* eslint-disable @typescript-eslint/no-require-imports -- jest.mock factories are synchronous */
  const { createElement } = require("react") as typeof import("react");
  const { Text } = require("react-native") as typeof import("react-native");
  /* eslint-enable @typescript-eslint/no-require-imports */
  return {
    QrPlate: ({ value }: { value: string }) => createElement(Text, { testID: "qr-value" }, value)
  };
});

const relays = jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");
const mempool = jest.requireMock<typeof MempoolFake>("../lib/onchain/esplora");

/** 13:10:30 UTC: every test starts then (fake timers). */
const START = Date.UTC(2026, 9, 9, 13, 10, 30);
const NOW = START / 1000;
const RELAYS = ["wss://relay.example", "wss://nos.lol"];
const ADDRESS = "sattleme02c6047f94@breez.tips";
const METADATA = `[["text/plain","Fine Bakery"],["text/identifier","${ADDRESS}"]]`;
const WAIT = { timeout: 6000 };
/** Past the relays' timeout (PAYMENT_LINK_TIMEOUT_MS), or the second look of a link not found. */
const LONG_WAIT = { timeout: 15_000 };

/** What breez.tips's verify endpoint says of each payment hash. */
type Verify = "open" | "paid" | "notFound" | "wrongPreimage" | "error";
const verify = new Map<string, Verify>();
/** The invoices it made, by payment hash: its answers name them (`pr`). */
const made = new Map<string, { pr: string; preimage: string }>();
/** Every URL the page asked, in order. */
const asked: URL[] = [];
/** How late it answers (ms of the test's clock): a slow network. */
let verifyDelayMs = 0;

function verifyService() {
  verify.clear();
  made.clear();
  asked.length = 0;
  verifyDelayMs = 0;
  jest.mocked(globalThis.fetch).mockImplementation(async (input) => {
    const url = new URL(String(input));
    asked.push(url);
    if (verifyDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, verifyDelayMs));
    const json = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;
    if (!url.pathname.startsWith("/lnurlp/verify/")) throw new TypeError("Network failed");
    const hash = url.pathname.slice("/lnurlp/verify/".length);
    const invoice = made.get(hash);
    switch (verify.get(hash) ?? "open") {
      case "notFound":
        return json({ status: "ERROR", reason: "Not found" });
      case "error":
        return json({ status: "ERROR", reason: "Internal server error" });
      case "paid":
        return json({ status: "OK", settled: true, preimage: invoice?.preimage, pr: invoice?.pr });
      case "wrongPreimage":
        return json({ status: "OK", settled: true, preimage: "00".repeat(32), pr: invoice?.pr });
      case "open":
        return json({ status: "OK", settled: false, preimage: null, pr: invoice?.pr });
    }
  });
}

/** The fragment the next `open` opens. */
let fragment = "";
/** The current link's author: its redirection is remembered by it. */
let author = "";

type Options = {
  /** The record's value, changed. */
  value?: Record<string, unknown>;
  /** Seconds the invoice lasts from now. */
  expirySeconds?: number;
  /** Signed by another key than the URL's author. */
  forged?: boolean;
  /** Published nowhere. */
  unpublished?: boolean;
};

let seed = 1;

/**
 * A checkout link as an integration's server publishes it (SPEC.md §30): an invoice of 24.50 CHF
 * (49,000 sats), the shop's redirect URL, on RELAYS. Returns its payment hash.
 */
async function newCheckout({
  value = {},
  expirySeconds = 900,
  forged = false,
  unpublished = false
}: Options = {}) {
  const { preimage, paymentHash } = preimagePair(seed++);
  const pr = makeInvoice({
    amountMsat: 49_000_000n,
    paymentHash,
    descriptionHash: metadataHash(METADATA),
    timestamp: NOW,
    expirySeconds
  });
  made.set(paymentHash, { pr, preimage });
  const key = new Uint8Array(32).fill(seed++);
  const secret = new Uint8Array(32).fill(seed++);
  author = bytesToHex(schnorr.getPublicKey(secret));
  const signer = forged ? new Uint8Array(32).fill(seed++) : secret;
  const { address, encryptionKey } = checkoutKeys(key);
  const event = sealRecord({
    type: "checkout",
    value: {
      version: 1,
      businessName: "Fine Bakery",
      invoice: pr,
      verifyUrl: `https://breez.tips/lnurlp/verify/${paymentHash}`,
      fiat: { minor: 2450, digits: 2, currency: "CHF" },
      note: "Order 1042",
      redirectUrl: "https://shop.example/orders/1042/thanks",
      ...value
    },
    signer,
    encryptionKey,
    address,
    createdAt: NOW - 1,
    expiresAt: NOW + expirySeconds + 604_800
  });
  if (!unpublished) {
    await publishToRelays(event, {
      relays: RELAYS,
      channel: "anonymous",
      timeoutMs: 1000,
      authKey: signer
    });
  }
  fragment = `#c.${bytesToBase64Url(schnorr.getPublicKey(secret))}.${bytesToBase64Url(
    key
  )}.${encodeRelayList(RELAYS)}`;
  return paymentHash;
}

async function open() {
  const router = await renderRouter({ pay: PaymentLinkScreen }, { initialUrl: `/pay${fragment}` });
  return router;
}

const shownCode = () => String(screen.getByTestId("qr-value").props.children);

/** `seconds` (Unix) as the payment's details write when the invoice was made (en-CH, jest.setup). */
const createdOn = (seconds: number) =>
  formatDate(new Date(seconds * 1000), "en-CH", { dateStyle: "short", timeStyle: "short" });

jest.setTimeout(30_000);

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(START);
  relays.resetRelays();
  mempool.resetMempool();
  verifyService();
  mockRedirected.clear();
  fragment = "";
  jest.mocked(openRedirect).mockClear();
  jest.mocked(openUri).mockClear();
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

/** The deposit address of the orders of version 2 below (SPEC.md §31). */
const DEPOSIT = taprootAddress(5);

/** A record of version 2 (SPEC.md §30): the invoice of newCheckout and DEPOSIT. */
const withAddress = (expirySeconds = 900) => ({
  version: 2,
  onchainAddress: DEPOSIT,
  sats: 49_000,
  createdAt: NOW,
  expiresAt: NOW + expirySeconds
});

describe("a checkout link with an on-chain address (version 2)", () => {
  it("shows one code for both, and opens that code in the wallet", async () => {
    const hash = await newCheckout({ value: withAddress() });
    await open();
    expect(await screen.findByText("Waiting for the payment", undefined, WAIT)).toBeTruthy();
    const pr = made.get(hash)!.pr;
    expect(shownCode()).toBe(`bitcoin:${DEPOSIT}?amount=0.00049&lightning=${pr}`);
    // Never `lightning:` alone: an on-chain-only wallet (Sparrow) claims that scheme too. The
    // wallet gets the order's note too, the QR not (a denser code).
    await fireEvent.press(screen.getByTestId("open-wallet"));
    expect(openUri).toHaveBeenCalledWith(
      `bitcoin:${DEPOSIT}?amount=0.00049&label=Order%201042&message=Order%201042&lightning=${pr}`
    );
  });

  it("goes back to the shop 7 s after the payment is in the mempool, then says it is paid at 3 confirmations", async () => {
    await newCheckout({ value: withAddress() });
    await open();
    expect(await screen.findByText("Waiting for the payment", undefined, WAIT)).toBeTruthy();
    await act(async () => void mempool.pay(DEPOSIT, 49_000n));
    expect(await screen.findByText("Confirming", undefined, WAIT)).toBeTruthy();
    // Unconfirmed, back to the shop already, as once paid: never "close this page" when it leaves
    // on its own.
    expect(
      screen.getByText(
        "Your payment has been sent. The network still has to confirm the transaction, allow about thirty minutes."
      )
    ).toBeTruthy();
    expect(screen.getByLabelText("Continue, Redirecting to shop.example")).toBeTruthy();
    expect(screen.getByText("7", { includeHiddenElements: true })).toBeTruthy();
    await act(async () => jest.advanceTimersByTimeAsync(REDIRECT_DELAY_MS - 1000));
    expect(openRedirect).not.toHaveBeenCalled();
    await act(async () => jest.advanceTimersByTimeAsync(1000));
    expect(openRedirect).toHaveBeenCalledTimes(1);
    expect(openRedirect).toHaveBeenCalledWith("https://shop.example/orders/1042/thanks");
    expect(screen.getByText("Confirming")).toBeTruthy();
    // 3 deep on mempool.space: paid (one explorer).
    await act(async () => mempool.mine(3));
    expect(await screen.findByText("Paid", undefined, WAIT)).toBeTruthy();
    // Sent back once on its own: paid, the button for a tap only.
    await act(async () => jest.advanceTimersByTimeAsync(REDIRECT_DELAY_MS * 2));
    expect(openRedirect).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("7", { includeHiddenElements: true })).toBeNull();
    await fireEvent.press(screen.getByTestId("redirect"));
    expect(openRedirect).toHaveBeenCalledTimes(2);
  });

  it("goes back at once with a tap while the payment is being confirmed", async () => {
    await newCheckout({ value: withAddress() });
    await open();
    expect(await screen.findByText("Waiting for the payment", undefined, WAIT)).toBeTruthy();
    await act(async () => void mempool.pay(DEPOSIT, 49_000n));
    expect(await screen.findByText("Confirming", undefined, WAIT)).toBeTruthy();
    await fireEvent.press(screen.getByTestId("redirect"));
    expect(openRedirect).toHaveBeenCalledTimes(1);
    await act(async () => jest.advanceTimersByTimeAsync(REDIRECT_DELAY_MS + 1000));
    expect(openRedirect).toHaveBeenCalledTimes(1);
  });

  it("shows a payer who comes back the payment being confirmed without sending them away again", async () => {
    await newCheckout({ value: withAddress() });
    void mempool.pay(DEPOSIT, 49_000n);
    mockRedirected.add(author);
    await open();
    expect(await screen.findByText("Confirming", undefined, LONG_WAIT)).toBeTruthy();
    expect(screen.getByText("Redirecting to shop.example")).toBeTruthy();
    expect(screen.queryByText("7", { includeHiddenElements: true })).toBeNull();
    await act(async () => jest.advanceTimersByTimeAsync(REDIRECT_DELAY_MS * 2));
    expect(openRedirect).not.toHaveBeenCalled();
  });

  it("says the payer can close the page while it is being confirmed, without a redirect URL", async () => {
    await newCheckout({ value: { ...withAddress(), redirectUrl: null } });
    await open();
    expect(await screen.findByText("Waiting for the payment", undefined, WAIT)).toBeTruthy();
    await act(async () => void mempool.pay(DEPOSIT, 49_000n));
    expect(await screen.findByText("Confirming", undefined, WAIT)).toBeTruthy();
    expect(
      screen.getByText(
        "Your payment has been sent. The network still has to confirm the transaction, allow about thirty minutes. You can close this page."
      )
    ).toBeTruthy();
    expect(screen.queryByTestId("redirect")).toBeNull();
    await act(async () => jest.advanceTimersByTimeAsync(REDIRECT_DELAY_MS * 2));
    expect(openRedirect).not.toHaveBeenCalled();
  });

  it("shows the order's details while it is confirmed, each transaction's confirmations on its row", async () => {
    await newCheckout({ value: withAddress() });
    await open();
    expect(await screen.findByText("Waiting for the payment", undefined, WAIT)).toBeTruthy();
    let txid = "";
    await act(async () => {
      txid = mempool.pay(DEPOSIT, 49_000n);
    });
    expect(await screen.findByText("Confirming", undefined, WAIT)).toBeTruthy();
    // Its title, and its details: no time of payment.
    expect(screen.getByTestId("outcome-note")).toHaveTextContent("Order 1042");
    const details = within(screen.getByTestId("payment-details"));
    expect(details.getByText("Fine Bakery")).toBeTruthy();
    expect(details.getByTestId("details-method")).toHaveTextContent("Bitcoin");
    expect(details.getByTestId("details-created")).toHaveTextContent(createdOn(NOW));
    const row = within(details.getByTestId("details-transaction"));
    expect(row.getByLabelText("0 confirmations of 3")).toHaveTextContent("0/3");
    // Its pill turns: the mined chain is the page's pill's alone.
    expect(row.getByTestId("status-pill-spinner", { includeHiddenElements: true })).toBeTruthy();
    expect(row.queryByTestId("chain-track", { includeHiddenElements: true })).toBeNull();
    expect(
      row.getByLabelText(`View transaction ${txid.slice(0, 6)}…${txid.slice(-6)} on mempool.space`)
    ).toBeTruthy();

    await act(async () => mempool.mine(2));
    expect(
      await within(screen.getByTestId("details-transaction")).findByLabelText(
        "2 confirmations of 3"
      )
    ).toHaveTextContent("2/3");
    // 3 deep on mempool.space: paid, "Confirmed" (one explorer).
    await act(async () => mempool.mine(1));
    expect(await screen.findByText("Paid", undefined, WAIT)).toBeTruthy();
    expect(
      within(screen.getByTestId("details-transaction")).getByLabelText("Confirmed")
    ).toHaveTextContent(/3\/3$/);
  });

  it("leaves out when the order was made when its record's time is no date", async () => {
    // A safe integer, as the record's reader checks it, but beyond what a date can be.
    await newCheckout({
      value: { ...withAddress(), invoice: null, verifyUrl: null, createdAt: -9e15 }
    });
    await open();
    expect(await screen.findByText("Waiting for the payment", undefined, WAIT)).toBeTruthy();
    await act(async () => {
      mempool.pay(DEPOSIT, 49_000n);
    });
    expect(await screen.findByText("Confirming", undefined, WAIT)).toBeTruthy();
    const details = within(screen.getByTestId("payment-details"));
    expect(details.getByTestId("details-method")).toHaveTextContent("Bitcoin");
    expect(details.queryByTestId("details-created")).toBeNull();
    expect(details.queryByText(/Invalid Date/)).toBeNull();
  });

  it("shows an order paid on-chain only, its code the address alone", async () => {
    await newCheckout({
      value: {
        ...withAddress(),
        invoice: null,
        verifyUrl: null,
        sats: 150_000_000,
        fiat: null
      }
    });
    await open();
    expect(await screen.findByText("Waiting for the payment", undefined, WAIT)).toBeTruthy();
    expect(shownCode()).toBe(`bitcoin:${DEPOSIT}?amount=1.5`);
    await fireEvent.press(screen.getByTestId("open-wallet"));
    expect(openUri).toHaveBeenCalledWith(
      `bitcoin:${DEPOSIT}?amount=1.5&label=Order%201042&message=Order%201042`
    );
    // Nothing asked of an LNURL server: there is no invoice.
    expect(asked).toEqual([]);
  });

  it("says expired once the lease ended with nothing sent, the invoice expired too", async () => {
    await newCheckout({ value: withAddress(60), expirySeconds: 60 });
    await open();
    expect(await screen.findByText("Waiting for the payment", undefined, WAIT)).toBeTruthy();
    // The invoice's end: both still checked, through the grace period and the lease's.
    await act(async () => jest.advanceTimersByTimeAsync(61_000));
    expect(await screen.findByTestId("request-ended", undefined, WAIT)).toBeTruthy();
    expect(screen.queryByText("Expired")).toBeNull();
    await act(async () =>
      jest.advanceTimersByTimeAsync(
        (Math.max(EXPIRY_GRACE_SECONDS, LEASE_GRACE_SECONDS) + 1) * 1000
      )
    );
    expect(await screen.findByText("Expired", undefined, WAIT)).toBeTruthy();
    expect(openRedirect).not.toHaveBeenCalled();
  });

  it("never asks BlockCypher about a payment it saw while the lease ran", async () => {
    await newCheckout({ value: withAddress(60), expirySeconds: 60 });
    await open();
    expect(await screen.findByText("Waiting for the payment", undefined, WAIT)).toBeTruthy();
    await act(async () => void mempool.pay(DEPOSIT, 49_000n));
    expect(await screen.findByText("Confirming", undefined, WAIT)).toBeTruthy();
    // Past the lease's end: still the order's, as the page saw it in time.
    await act(async () => jest.advanceTimersByTimeAsync((60 + LEASE_GRACE_SECONDS + 60) * 1000));
    await act(async () => mempool.mine(3));
    await act(async () => jest.advanceTimersByTimeAsync(60_000));
    expect(await screen.findByText("Paid", undefined, WAIT)).toBeTruthy();
    expect(mempool.chain.receivedAsked).toEqual([]);
  });

  it("pays with what came in time, a later transaction left out and never asked about", async () => {
    await newCheckout({ value: withAddress(60), expirySeconds: 60 });
    await open();
    expect(await screen.findByText("Waiting for the payment", undefined, WAIT)).toBeTruthy();
    await act(async () => void mempool.pay(DEPOSIT, 49_000n));
    expect(await screen.findByText("Confirming", undefined, WAIT)).toBeTruthy();
    await act(async () => jest.advanceTimersByTimeAsync((60 + LEASE_GRACE_SECONDS + 60) * 1000));
    // Sent after the lease's end, never confirmed: no part of this order's payment.
    await act(async () => mempool.mine(3));
    await act(async () => void mempool.pay(DEPOSIT, 10_000n));
    await act(async () => jest.advanceTimersByTimeAsync(60_000));
    expect(await screen.findByText("Paid", undefined, WAIT)).toBeTruthy();
    expect(mempool.chain.receivedAsked).toEqual([]);
  });

  it("shows a payer who comes back the payment sent in time, by BlockCypher's time", async () => {
    await newCheckout({ value: withAddress(60), expirySeconds: 60 });
    // Paid while the page was closed, before the lease's end; the page opened an hour later.
    jest.setSystemTime(START + 30_000);
    const txid = mempool.pay(DEPOSIT, 49_000n);
    jest.setSystemTime(START + 3600_000);
    await open();
    expect(await screen.findByText("Confirming", undefined, WAIT)).toBeTruthy();
    expect(mempool.chain.receivedAsked).toEqual([txid]);
    await act(async () => mempool.mine(3));
    await act(async () => jest.advanceTimersByTimeAsync(60_000));
    expect(await screen.findByText("Paid", undefined, WAIT)).toBeTruthy();
    await act(async () => jest.advanceTimersByTimeAsync(REDIRECT_DELAY_MS));
    expect(openRedirect).toHaveBeenCalledWith("https://shop.example/orders/1042/thanks");
  });

  it("never counts a payment received after the lease's end: expired, saying it came late", async () => {
    await newCheckout({ value: withAddress(60), expirySeconds: 60 });
    await open();
    expect(await screen.findByText("Waiting for the payment", undefined, WAIT)).toBeTruthy();
    await act(async () =>
      jest.advanceTimersByTimeAsync(
        (60 + Math.max(EXPIRY_GRACE_SECONDS, LEASE_GRACE_SECONDS) + 1) * 1000
      )
    );
    await act(async () => void mempool.pay(DEPOSIT, 49_000n));
    await act(async () => jest.advanceTimersByTimeAsync(61_000));
    expect(await screen.findByText("Expired", undefined, WAIT)).toBeTruthy();
    expect(
      screen.getByText(
        "The time to pay is over: a payment came after it ended and does not count for this order. Contact Fine Bakery."
      )
    ).toBeTruthy();
    expect(screen.queryByText("Confirming")).toBeNull();
    expect(openRedirect).not.toHaveBeenCalled();
  });

  it("says expired at once when BlockCypher does not know a transaction past the lease's end", async () => {
    await newCheckout({ value: withAddress(60), expirySeconds: 60 });
    jest.setSystemTime(START + 30_000);
    const txid = mempool.pay(DEPOSIT, 49_000n);
    jest.setSystemTime(START + 3600_000);
    // Not known to BlockCypher now: it will be received after now, so after the lease's end.
    mempool.chain.receivedUnknown = true;
    await open();
    expect(await screen.findByText("Expired", undefined, WAIT)).toBeTruthy();
    expect(
      screen.getByText(
        "The time to pay is over: a payment came after it ended and does not count for this order. Contact Fine Bakery."
      )
    ).toBeTruthy();
    // Never waited for, never asked again.
    await act(async () => jest.advanceTimersByTimeAsync(15 * 60_000));
    expect(mempool.chain.receivedAsked).toEqual([txid]);
    expect(screen.queryByText("Confirming")).toBeNull();
    expect(openRedirect).not.toHaveBeenCalled();
  });

  it("decides nothing while BlockCypher fails, then asks again", async () => {
    await newCheckout({ value: withAddress(60), expirySeconds: 60 });
    jest.setSystemTime(START + 30_000);
    const txid = mempool.pay(DEPOSIT, 49_000n);
    jest.setSystemTime(START + 3600_000);
    mempool.chain.receivedFails = true;
    await open();
    await waitFor(() => expect(mempool.chain.receivedAsked).toEqual([txid]), WAIT);
    await act(async () => jest.advanceTimersByTimeAsync(1000));
    expect(screen.getByText("Checking the payment…")).toBeTruthy();
    expect(screen.queryByTestId("request-ended")).toBeNull();
    expect(screen.queryByText("Expired")).toBeNull();
    expect(screen.queryByText("Confirming")).toBeNull();
    mempool.chain.receivedFails = false;
    // Asked again 5 s later (receivedRetryMs).
    await act(async () => jest.advanceTimersByTimeAsync(5000));
    expect(await screen.findByText("Confirming", undefined, WAIT)).toBeTruthy();
    expect(mempool.chain.receivedAsked).toEqual([txid, txid]);
  });

  it("asks BlockCypher again only of the transactions whose time it did not give", async () => {
    await newCheckout({ value: withAddress(60), expirySeconds: 60 });
    jest.setSystemTime(START + 20_000);
    const first = mempool.pay(DEPOSIT, 20_000n);
    jest.setSystemTime(START + 30_000);
    const second = mempool.pay(DEPOSIT, 29_000n);
    jest.setSystemTime(START + 3600_000);
    mempool.chain.receivedFailsFor.add(second);
    await open();
    await waitFor(() => expect(mempool.chain.receivedAsked).toHaveLength(2), WAIT);
    await act(async () => jest.advanceTimersByTimeAsync(1000));
    expect(screen.queryByText("Confirming")).toBeNull();
    mempool.chain.receivedFailsFor.clear();
    // Asked again 5 s later (receivedRetryMs): the failed one alone.
    await act(async () => jest.advanceTimersByTimeAsync(5000));
    expect(await screen.findByText("Confirming", undefined, WAIT)).toBeTruthy();
    expect([...mempool.chain.receivedAsked].sort()).toEqual([first, second, second].sort());
  });

  it("asks for the rest of an underpayment on-chain, then confirms once it is all there", async () => {
    await newCheckout({ value: withAddress() });
    await open();
    expect(await screen.findByText("Waiting for the payment", undefined, WAIT)).toBeTruthy();
    let txid = "";
    await act(async () => {
      txid = mempool.pay(DEPOSIT, 20_000n);
    });
    expect(
      await screen.findByText(
        "Your payment (20'000 sats) does not cover the whole amount. Pay the rest over Bitcoin, to the same address.",
        undefined,
        WAIT
      )
    ).toBeTruthy();
    // The rest alone, on-chain: the page cannot make a Lightning invoice of it.
    expect(shownCode()).toBe(`bitcoin:${DEPOSIT}?amount=0.00029`);
    // Underpaid: never back to the shop.
    expect(screen.queryByTestId("redirect")).toBeNull();
    await act(async () => jest.advanceTimersByTimeAsync(REDIRECT_DELAY_MS * 2));
    expect(openRedirect).not.toHaveBeenCalled();
    // Its transaction, as it came in time, linked to mempool.space.
    const chain = within(screen.getByTestId("underpaid-chain"));
    expect(chain.getAllByTestId("underpaid-received")).toHaveLength(1);
    expect(chain.getByText(/ ·$/)).toBeTruthy();
    expect(
      chain.getByLabelText(
        `View transaction ${txid.slice(0, 4)}…${txid.slice(-4)} on mempool.space`
      )
    ).toBeTruthy();
    await act(async () => void mempool.pay(DEPOSIT, 29_000n));
    expect(await screen.findByText("Confirming", undefined, WAIT)).toBeTruthy();
  });

  it("stays underpaid for good past its end, with what was received in time", async () => {
    await newCheckout({ value: withAddress(60), expirySeconds: 60 });
    await open();
    expect(await screen.findByText("Waiting for the payment", undefined, WAIT)).toBeTruthy();
    await act(async () => void mempool.pay(DEPOSIT, 20_000n));
    await act(async () =>
      jest.advanceTimersByTimeAsync(
        (60 + Math.max(EXPIRY_GRACE_SECONDS, LEASE_GRACE_SECONDS) + 1) * 1000
      )
    );
    expect(await screen.findByText("Underpaid", undefined, WAIT)).toBeTruthy();
    expect(
      screen.getByText(
        "The time to pay is over: your payment (20'000 sats) does not cover the whole amount, 29'000 sats are missing. Contact Fine Bakery about the difference."
      )
    ).toBeTruthy();
    expect(screen.getAllByTestId("received-transaction")).toHaveLength(1);
    expect(screen.queryByText("Expired")).toBeNull();
    expect(openRedirect).not.toHaveBeenCalled();
    expect(mempool.chain.receivedAsked).toEqual([]);
    // Seen in time: what it replaced changes nothing, never asked.
    expect(mempool.chain.historyAsked).toEqual([]);
  });

  it("counts a fee bump (RBF) after the lease's end of a payment it saw, never asking BlockCypher", async () => {
    await newCheckout({ value: withAddress(60), expirySeconds: 60 });
    await open();
    expect(await screen.findByText("Waiting for the payment", undefined, WAIT)).toBeTruthy();
    let txid = "";
    await act(async () => {
      txid = mempool.pay(DEPOSIT, 49_000n);
    });
    expect(await screen.findByText("Confirming", undefined, WAIT)).toBeTruthy();
    await act(async () => jest.advanceTimersByTimeAsync((60 + LEASE_GRACE_SECONDS + 60) * 1000));
    // The payer bumps its fee: another txid, the same coin, the explorers forget the first one.
    await act(async () => void mempool.replace(txid, { more: [mempool.freshCoin()] }));
    await act(async () => jest.advanceTimersByTimeAsync(1000));
    expect(screen.getByText("Confirming")).toBeTruthy();
    await act(async () => mempool.mine(3));
    await act(async () => jest.advanceTimersByTimeAsync(60_000));
    expect(await screen.findByText("Paid", undefined, WAIT)).toBeTruthy();
    expect(mempool.chain.receivedAsked).toEqual([]);
  });

  it("counts a replacement paying more only for what the payment it saw paid", async () => {
    await newCheckout({ value: withAddress(60), expirySeconds: 60 });
    await open();
    expect(await screen.findByText("Waiting for the payment", undefined, WAIT)).toBeTruthy();
    let txid = "";
    await act(async () => {
      txid = mempool.pay(DEPOSIT, 20_000n);
    });
    await act(async () => jest.advanceTimersByTimeAsync((60 + LEASE_GRACE_SECONDS + 60) * 1000));
    // After the lease's end, the replacement pays the whole amount: the rest came late.
    let bump = "";
    await act(async () => {
      bump = mempool.replace(txid, { sats: 49_000n });
    });
    await act(async () =>
      jest.advanceTimersByTimeAsync(Math.max(EXPIRY_GRACE_SECONDS, LEASE_GRACE_SECONDS) * 1000)
    );
    expect(await screen.findByText("Underpaid", undefined, WAIT)).toBeTruthy();
    expect(
      screen.getByText(
        "The time to pay is over: your payment (20'000 sats) does not cover the whole amount, 29'000 sats are missing. Contact Fine Bakery about the difference."
      )
    ).toBeTruthy();
    expect(screen.queryByText("Confirming")).toBeNull();
    expect(mempool.chain.receivedAsked).toEqual([bump]);
  });

  it("counts a replacement of a payment it never saw, named by mempool.space's history", async () => {
    await newCheckout({ value: withAddress(60), expirySeconds: 60 });
    // Paid in time and bumped an hour later while the page was closed (another browser).
    jest.setSystemTime(START + 30_000);
    const txid = mempool.pay(DEPOSIT, 49_000n);
    jest.setSystemTime(START + 3600_000);
    const bump = mempool.replace(txid, { more: [mempool.freshCoin()] });
    await open();
    // As the server, which saw the first payment: in time, being confirmed.
    expect(await screen.findByText("Confirming", undefined, WAIT)).toBeTruthy();
    expect(mempool.chain.historyAsked).toContain(bump);
    // BlockCypher told what the first one paid, spent and when; the replacement, which stands for
    // it alone, is never asked.
    expect(mempool.chain.receivedAsked).toEqual([txid]);
    expect(screen.queryByText("Expired")).toBeNull();
  });

  it("tells a replacement by its own time once mempool.space forgot what it replaced", async () => {
    await newCheckout({ value: withAddress(60), expirySeconds: 60 });
    jest.setSystemTime(START + 30_000);
    const txid = mempool.pay(DEPOSIT, 49_000n);
    jest.setSystemTime(START + 3600_000);
    const bump = mempool.replace(txid);
    // A day after it was mined, mempool.space forgets the chain.
    mempool.chain.historyForgets = true;
    await open();
    await act(async () =>
      jest.advanceTimersByTimeAsync(Math.max(EXPIRY_GRACE_SECONDS, LEASE_GRACE_SECONDS) * 1000)
    );
    // The server, which reads its witnesses, counts it; this page shows less, never more.
    expect(await screen.findByText("Expired", undefined, WAIT)).toBeTruthy();
    expect(mempool.chain.receivedAsked).toEqual([bump]);
  });

  it("decides nothing while mempool.space's history fails, then asks again", async () => {
    await newCheckout({ value: withAddress(60), expirySeconds: 60 });
    jest.setSystemTime(START + 30_000);
    const txid = mempool.pay(DEPOSIT, 49_000n);
    jest.setSystemTime(START + 3600_000);
    mempool.replace(txid, { more: [mempool.freshCoin()] });
    mempool.chain.historyFails = true;
    await open();
    await act(async () => jest.advanceTimersByTimeAsync(30_000));
    // Never "Expired" on what is not told.
    expect(screen.queryByText("Expired")).toBeNull();
    expect(screen.queryByText("Confirming")).toBeNull();

    mempool.chain.historyFails = false;
    await act(async () => jest.advanceTimersByTimeAsync(60_000));
    expect(await screen.findByText("Confirming", undefined, WAIT)).toBeTruthy();
  });

  it('shows a loader, never "Request expired", until the explorer tells of a payment in time', async () => {
    await newCheckout({ value: withAddress(60), expirySeconds: 60 });
    // Paid in time while the page was closed; opened past the invoice's end, the lease still on.
    jest.setSystemTime(START + 30_000);
    mempool.pay(DEPOSIT, 49_000n);
    jest.setSystemTime(START + 90_000);
    mempool.chain.slow.set("https://mempool.space/api", 2000);
    await open();
    expect(await screen.findByText("Checking the payment…", undefined, WAIT)).toBeTruthy();
    expect(screen.getByTestId("loading-spinner", { includeHiddenElements: true })).toBeTruthy();
    expect(screen.queryByTestId("request-ended")).toBeNull();
    expect(screen.queryByTestId("qr-value")).toBeNull();
    await act(async () => jest.advanceTimersByTimeAsync(1000));
    expect(screen.queryByTestId("request-ended")).toBeNull();
    await act(async () => jest.advanceTimersByTimeAsync(1500));
    expect(await screen.findByText("Confirming", undefined, WAIT)).toBeTruthy();
    expect(screen.queryByTestId("request-ended")).toBeNull();
  });

  it('shows "Request expired" once the explorer answered without a payment', async () => {
    await newCheckout({ value: withAddress(60), expirySeconds: 60 });
    jest.setSystemTime(START + 90_000);
    mempool.chain.slow.set("https://mempool.space/api", 2000);
    await open();
    expect(await screen.findByText("Checking the payment…", undefined, WAIT)).toBeTruthy();
    expect(screen.queryByTestId("request-ended")).toBeNull();
    await act(async () => jest.advanceTimersByTimeAsync(2500));
    expect(await screen.findByTestId("request-ended", undefined, WAIT)).toBeTruthy();
    expect(screen.queryByTestId("loading-spinner", { includeHiddenElements: true })).toBeNull();
  });

  it("shows the code only once the explorer answered", async () => {
    await newCheckout({ value: withAddress() });
    mempool.chain.slow.set("https://mempool.space/api", 2000);
    await open();
    expect(await screen.findByText("Checking the payment…", undefined, WAIT)).toBeTruthy();
    expect(screen.queryByTestId("qr-value")).toBeNull();
    await act(async () => jest.advanceTimersByTimeAsync(2500));
    expect(await screen.findByText("Waiting for the payment", undefined, WAIT)).toBeTruthy();
    expect(screen.getByTestId("qr-value")).toBeTruthy();
  });

  it("shows the code without the explorer's answer once it waited long enough", async () => {
    await newCheckout({
      value: { ...withAddress(), invoice: null, verifyUrl: null, sats: 150_000_000, fiat: null }
    });
    mempool.chain.down.add("https://mempool.space/api");
    await open();
    expect(await screen.findByText("Checking the payment…", undefined, WAIT)).toBeTruthy();
    await act(async () => jest.advanceTimersByTimeAsync(FIRST_CHECK_TIMEOUT_MS - 1000));
    expect(screen.queryByTestId("qr-value")).toBeNull();
    await act(async () => jest.advanceTimersByTimeAsync(1000));
    expect(await screen.findByText("Waiting for the payment", undefined, WAIT)).toBeTruthy();
    expect(shownCode()).toBe(`bitcoin:${DEPOSIT}?amount=1.5`);
  });

  describe("on the merchant's node, when the record names it", () => {
    const NODE = "https://node.example.ch";

    it("follows the payment on the node alone while it answers", async () => {
      await newCheckout({
        value: { ...withAddress(), bitcoinNode: { url: NODE, fallback: "mempool" } }
      });
      await open();
      expect(await screen.findByText("Waiting for the payment", undefined, WAIT)).toBeTruthy();
      expect(mempool.chain.socketUrls).toEqual([
        ["wss://node.example.ch/api/v1/ws", "wss://mempool.space/api/v1/ws"]
      ]);
      let txid = "";
      await act(async () => {
        txid = mempool.pay(DEPOSIT, 49_000n);
      });
      expect(await screen.findByText("Confirming", undefined, WAIT)).toBeTruthy();
      // Its transaction's link leads to its page on the node too, never mempool.space.
      const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
      const row = within(screen.getByTestId("details-transaction"));
      expect(
        row.getByLabelText(
          `View transaction ${txid.slice(0, 6)}…${txid.slice(-6)} on node.example.ch`
        )
      ).toBeTruthy();
      await fireEvent.press(row.getByTestId("tx-link"));
      expect(openURL).toHaveBeenCalledWith(`${NODE}/tx/${txid}`);
      openURL.mockRestore();
      await act(async () => mempool.mine(3));
      expect(await screen.findByText("Paid", undefined, WAIT)).toBeTruthy();
      const reads = mempool.chain.calls.filter(({ path }) => path.includes(DEPOSIT));
      expect(reads.length).toBeGreaterThan(0);
      expect(reads.every(({ base }) => base === `${NODE}/api`)).toBe(true);
    });

    it("reads mempool.space while the node does not answer, when the merchant allowed it", async () => {
      await newCheckout({
        value: { ...withAddress(), bitcoinNode: { url: NODE, fallback: "mempool" } }
      });
      mempool.chain.down.add(`${NODE}/api`);
      await open();
      expect(await screen.findByText("Waiting for the payment", undefined, WAIT)).toBeTruthy();
      expect(mempool.chain.calls).toContainEqual({
        base: "https://mempool.space/api",
        path: `/address/${DEPOSIT}/txs`
      });
    });

    it('never asks mempool.space for the address with "Lightning only"', async () => {
      await newCheckout({
        value: { ...withAddress(), bitcoinNode: { url: NODE, fallback: "none" } }
      });
      mempool.chain.down.add(`${NODE}/api`);
      await open();
      // Not read: neither paid nor unpaid, as when mempool.space does not answer.
      expect(await screen.findByText("Checking the payment…", undefined, WAIT)).toBeTruthy();
      await act(async () => jest.advanceTimersByTimeAsync(FIRST_CHECK_TIMEOUT_MS));
      expect(await screen.findByText("Waiting for the payment", undefined, WAIT)).toBeTruthy();
      expect(mempool.chain.socketUrls).toEqual([["wss://node.example.ch/api/v1/ws"]]);
      expect(
        mempool.chain.calls.some(
          ({ base, path }) => base === "https://mempool.space/api" && path.includes(DEPOSIT)
        )
      ).toBe(false);
    });
  });

  it("refuses a record whose amount is not its invoice's", async () => {
    await newCheckout({ value: { ...withAddress(), sats: 48_000 } });
    await open();
    expect(await screen.findByText("Payment request not found", undefined, WAIT)).toBeTruthy();
    expect(screen.queryByTestId("qr-value")).toBeNull();
  });
});

/** The rest secret of the orders below: the integration's server signs their rest records. */
const REST_SECRET = new Uint8Array(32).fill(77);
const REST = {
  author: bytesToHex(schnorr.getPublicKey(REST_SECRET)),
  key: new Uint8Array(32).fill(78)
};

/** A record of version 2 with the rest author and key (SPEC.md §31). */
const withRest = (expirySeconds = 900) => ({
  ...withAddress(expirySeconds),
  restAuthor: REST.author,
  restKey: bytesToHex(REST.key)
});

/**
 * An invoice of the rest of `sats`, as the integration's server publishes it (SPEC.md §31, "Rest
 * records"): until the invoice's end, signed by `signer` (the rest secret by default). Returns its
 * payment hash and BOLT11.
 */
async function publishRest(
  sats: bigint,
  {
    signer = REST_SECRET,
    end = NOW + 900,
    on = RELAYS
  }: { signer?: Uint8Array; end?: number; on?: string[] } = {}
) {
  const { preimage, paymentHash } = preimagePair(seed++);
  const timestamp = Math.floor(Date.now() / 1000);
  const pr = makeInvoice({
    amountMsat: sats * 1000n,
    paymentHash,
    descriptionHash: metadataHash(METADATA),
    timestamp,
    expirySeconds: end - timestamp
  });
  made.set(paymentHash, { pr, preimage });
  const keys = checkoutRestKeys(REST);
  const event = sealRecord({
    type: "checkout-rest",
    value: {
      version: 1,
      invoice: pr,
      verifyUrl: `https://breez.tips/lnurlp/verify/${paymentHash}`
    },
    signer,
    encryptionKey: keys.encryptionKey,
    address: keys.addressOf(paymentHash),
    createdAt: timestamp,
    expiresAt: end + 604_800
  });
  await publishToRelays(event, {
    relays: on,
    channel: "anonymous",
    timeoutMs: 1000,
    authKey: signer
  });
  return { paymentHash, pr };
}

describe("the rest of an underpayment in Lightning", () => {
  it("shows the invoice of the rest as soon as it is published, with the rest on-chain, in one code", async () => {
    await newCheckout({ value: withRest() });
    await open();
    expect(await screen.findByText("Waiting for the payment", undefined, WAIT)).toBeTruthy();
    await act(async () => void mempool.pay(DEPOSIT, 20_000n));
    expect(
      await screen.findByText(
        "Your payment (20'000 sats) does not cover the whole amount. Pay the rest over Lightning or Bitcoin.",
        undefined,
        WAIT
      )
    ).toBeTruthy();
    // Until the server's invoice of the rest comes: on-chain to the same address.
    expect(shownCode()).toBe(`bitcoin:${DEPOSIT}?amount=0.00029`);
    const { pr, paymentHash } = await act(async () => publishRest(29_000n));
    await waitFor(
      () => expect(shownCode()).toBe(`bitcoin:${DEPOSIT}?amount=0.00029&lightning=${pr}`),
      WAIT
    );
    await fireEvent.press(screen.getByTestId("open-wallet"));
    // The wallet's button opens the code of the QR (a Lightning wallet pays its invoice).
    expect(openUri).toHaveBeenCalledWith(
      `bitcoin:${DEPOSIT}?amount=0.00029&label=Order%201042&message=Order%201042&lightning=${pr}`
    );
    // Its payment is checked with the LNURL server (LUD-21), as the invoice's.
    expect(asked.some((url) => url.pathname === `/lnurlp/verify/${paymentHash}`)).toBe(true);
  });

  it("is being confirmed once the rest is paid, goes back to the shop, then is paid at 3 confirmations", async () => {
    await newCheckout({ value: withRest() });
    await open();
    expect(await screen.findByText("Waiting for the payment", undefined, WAIT)).toBeTruthy();
    await act(async () => void mempool.pay(DEPOSIT, 20_000n));
    const rest = await act(async () => publishRest(29_000n));
    await waitFor(() => expect(shownCode()).toContain(rest.pr), WAIT);
    verify.set(rest.paymentHash, "paid");
    await act(async () => jest.advanceTimersByTimeAsync(5000));
    expect(await screen.findByText("Confirming", undefined, WAIT)).toBeTruthy();
    // All there, being confirmed: back to the shop.
    await act(async () => jest.advanceTimersByTimeAsync(REDIRECT_DELAY_MS));
    expect(openRedirect).toHaveBeenCalledWith("https://shop.example/orders/1042/thanks");
    await act(async () => mempool.mine(3));
    await act(async () => jest.advanceTimersByTimeAsync(60_000));
    expect(await screen.findByText("Paid", undefined, WAIT)).toBeTruthy();
    expect(openRedirect).toHaveBeenCalledTimes(1);
  });

  it("takes a rest below 1,000 sats in Lightning only, nothing to pay until its invoice comes", async () => {
    await newCheckout({ value: withRest() });
    await open();
    expect(await screen.findByText("Waiting for the payment", undefined, WAIT)).toBeTruthy();
    await act(async () => void mempool.pay(DEPOSIT, 48_500n));
    expect(
      await screen.findByText(
        "Your payment (48'500 sats) does not cover the whole amount. Pay the rest over Lightning.",
        undefined,
        WAIT
      )
    ).toBeTruthy();
    expect(screen.queryByTestId("qr-value")).toBeNull();
    expect(screen.getByTestId("open-wallet")).toBeDisabled();
    const { pr } = await act(async () => publishRest(500n));
    await waitFor(() => expect(shownCode()).toBe(`lightning:${pr}`), WAIT);
    // No address on the receipt: the rest is not asked on-chain.
    expect(screen.queryByTestId("copy-address")).toBeNull();
  });

  it("shows only an invoice of exactly the rest, its rest author's", async () => {
    await newCheckout({ value: withRest() });
    await open();
    expect(await screen.findByText("Waiting for the payment", undefined, WAIT)).toBeTruthy();
    await act(async () => void mempool.pay(DEPOSIT, 20_000n));
    await screen.findByTestId("underpaid-chain", undefined, WAIT);
    // Of an earlier rest; and one signed by another key than the link's record names.
    const earlier = await act(async () => publishRest(39_000n));
    const forged = await act(async () =>
      publishRest(29_000n, { signer: new Uint8Array(32).fill(99) })
    );
    await act(async () => jest.advanceTimersByTimeAsync(3000));
    expect(shownCode()).toBe(`bitcoin:${DEPOSIT}?amount=0.00029`);
    // Neither is checked: the forged one is no record, the earlier one asks nothing of the payer.
    expect(asked.some((url) => url.pathname.endsWith(forged.paymentHash))).toBe(false);
    expect(earlier.pr).not.toBe(forged.pr);
  });

  it("never shows an invoice of the rest its verify URL answers for another one", async () => {
    await newCheckout({ value: withRest() });
    await open();
    expect(await screen.findByText("Waiting for the payment", undefined, WAIT)).toBeTruthy();
    await act(async () => void mempool.pay(DEPOSIT, 20_000n));
    await screen.findByTestId("underpaid-chain", undefined, WAIT);
    const rest = await act(async () => publishRest(29_000n));
    // The LNURL server never made it: it can never pay the merchant (told expired at once).
    made.set(rest.paymentHash, { pr: "lnbc1other", preimage: "00".repeat(32) });
    await act(async () => jest.advanceTimersByTimeAsync(5000));
    expect(asked.some((url) => url.pathname.endsWith(rest.paymentHash))).toBe(true);
    expect(shownCode()).toBe(`bitcoin:${DEPOSIT}?amount=0.00029`);
    await fireEvent.press(screen.getByTestId("open-wallet"));
    expect(openUri).toHaveBeenCalledWith(
      `bitcoin:${DEPOSIT}?amount=0.00029&label=Order%201042&message=Order%201042`
    );
  });

  it("lists each payment received, the invoices of the rest paid included", async () => {
    await newCheckout({ value: withRest() });
    void mempool.pay(DEPOSIT, 20_000n);
    // An invoice of an earlier rest, paid: 29,000 received, 20,000 left.
    const rest = await publishRest(9_000n);
    verify.set(rest.paymentHash, "paid");
    await open();
    await screen.findByTestId("underpaid-chain", undefined, LONG_WAIT);
    await waitFor(() => expect(screen.getAllByTestId("underpaid-received")).toHaveLength(2), WAIT);
    const [onchain, lightning] = screen.getAllByTestId("underpaid-received");
    expect(within(onchain!).getByLabelText("20'000 sats")).toBeTruthy();
    expect(within(lightning!).getByText("Lightning")).toBeTruthy();
    expect(within(lightning!).getByLabelText("9'000 sats")).toBeTruthy();
    expect(shownCode()).toBe(`bitcoin:${DEPOSIT}?amount=0.0002`);
  });

  it("shows a payer who comes back the rest paid, never the rest to pay again", async () => {
    await newCheckout({ value: withRest() });
    void mempool.pay(DEPOSIT, 20_000n);
    const rest = await publishRest(29_000n);
    verify.set(rest.paymentHash, "paid");
    await open();
    expect(await screen.findByText("Confirming", undefined, LONG_WAIT)).toBeTruthy();
    expect(screen.queryByTestId("rest-plate")).toBeNull();
  });

  it("tells nothing but a payment before a majority of the relays sent the rest's records", async () => {
    await newCheckout({ value: withRest() });
    void mempool.pay(DEPOSIT, 20_000n);
    // Paid, its record on one relay only (its first publication failed on the other), out of reach.
    const rest = await publishRest(29_000n, { on: [RELAYS[1]!] });
    verify.set(rest.paymentHash, "paid");
    relays.unreachable.add(RELAYS[1]!);
    await open();
    expect(await screen.findByText("Checking the payment…", undefined, WAIT)).toBeTruthy();
    // The other relay answered without it: never the 29,000 sats to pay again, however long.
    await act(async () => jest.advanceTimersByTimeAsync(FIRST_CHECK_TIMEOUT_MS + 10_000));
    expect(screen.getByText("Checking the payment…")).toBeTruthy();
    expect(screen.queryByTestId("rest-plate")).toBeNull();
    expect(screen.queryByTestId("underpaid-chain")).toBeNull();
    // Back in reach: asked again, the rest read, paid.
    relays.unreachable.delete(RELAYS[1]!);
    await act(async () => jest.advanceTimersByTimeAsync(60_000));
    expect(await screen.findByText("Confirming", undefined, LONG_WAIT)).toBeTruthy();
    expect(screen.queryByTestId("rest-plate")).toBeNull();
  });

  it("shows nothing to pay, even before any payment, until the rest's records are read", async () => {
    await newCheckout({ value: withRest() });
    relays.unreachable.add(RELAYS[1]!);
    await open();
    // Never a payment asked twice, rather a payer who waits.
    expect(await screen.findByText("Checking the payment…", undefined, WAIT)).toBeTruthy();
    await act(async () => jest.advanceTimersByTimeAsync(FIRST_CHECK_TIMEOUT_MS + 10_000));
    expect(screen.queryByTestId("qr-value")).toBeNull();
    relays.unreachable.delete(RELAYS[1]!);
    await act(async () => jest.advanceTimersByTimeAsync(60_000));
    expect(await screen.findByText("Waiting for the payment", undefined, LONG_WAIT)).toBeTruthy();
    expect(screen.getByTestId("qr-value")).toBeTruthy();
  });

  it("never ends underpaid before a majority of the relays sent the rest's records", async () => {
    await newCheckout({ value: withRest(120), expirySeconds: 120 });
    void mempool.pay(DEPOSIT, 20_000n);
    const rest = await publishRest(29_000n, { on: [RELAYS[1]!], end: NOW + 120 });
    verify.set(rest.paymentHash, "paid");
    relays.unreachable.add(RELAYS[1]!);
    // Opened past the end and the grace periods: the on-chain part is final underpaid.
    jest.setSystemTime(
      START + (120 + Math.max(EXPIRY_GRACE_SECONDS, LEASE_GRACE_SECONDS) + 1) * 1000
    );
    await open();
    expect(await screen.findByText("Checking the payment…", undefined, WAIT)).toBeTruthy();
    await act(async () => jest.advanceTimersByTimeAsync(FIRST_CHECK_TIMEOUT_MS + 10_000));
    expect(screen.queryByText("Underpaid")).toBeNull();
    expect(screen.queryByTestId("request-ended")).toBeNull();
    relays.unreachable.delete(RELAYS[1]!);
    await act(async () => jest.advanceTimersByTimeAsync(60_000));
    // 20,000 on-chain and the rest's 29,000: the whole amount, being confirmed.
    expect(await screen.findByText("Confirming", undefined, LONG_WAIT)).toBeTruthy();
  });

  it("counts the rest paid in what was received once the invoice ended underpaid", async () => {
    await newCheckout({ value: withRest(120), expirySeconds: 120 });
    await open();
    expect(await screen.findByText("Waiting for the payment", undefined, WAIT)).toBeTruthy();
    const txid = await act(async () => mempool.pay(DEPOSIT, 20_000n));
    const rest = await act(async () => publishRest(29_000n, { end: NOW + 120 }));
    await waitFor(() => expect(shownCode()).toContain(rest.pr), WAIT);
    verify.set(rest.paymentHash, "paid");
    // The on-chain payment dropped (replaced, evicted): the rest's 29,000 sats alone.
    await act(async () => void mempool.drop(txid));
    await act(async () =>
      jest.advanceTimersByTimeAsync(
        (120 + Math.max(EXPIRY_GRACE_SECONDS, LEASE_GRACE_SECONDS) + 1) * 1000
      )
    );
    expect(await screen.findByText("Underpaid", undefined, LONG_WAIT)).toBeTruthy();
    expect(
      screen.getByText(
        "The time to pay is over: your payment (29'000 sats) does not cover the whole amount, 20'000 sats are missing. Contact Fine Bakery about the difference."
      )
    ).toBeTruthy();
    expect(openRedirect).not.toHaveBeenCalled();
  });

  it("takes the rest on-chain only, whatever it is, for a record without rest keys", async () => {
    await newCheckout({ value: withAddress() });
    await open();
    expect(await screen.findByText("Waiting for the payment", undefined, WAIT)).toBeTruthy();
    await act(async () => void mempool.pay(DEPOSIT, 48_500n));
    await screen.findByTestId("underpaid-chain", undefined, WAIT);
    expect(shownCode()).toBe(`bitcoin:${DEPOSIT}?amount=0.000005`);
  });
});

/**
 * The integration's server's acceptance of a payment short of the amount (SPEC.md §31, "Acceptance
 * records"): what it received, `received` sats, never the merchant's tolerance; signed by `signer`
 * (the rest secret by default), dated `createdAt`.
 */
async function publishAcceptance(
  received: number,
  {
    signer = REST_SECRET,
    createdAt = Math.floor(Date.now() / 1000)
  }: { signer?: Uint8Array; createdAt?: number } = {}
) {
  const keys = checkoutRestKeys(REST);
  const event = sealRecord({
    type: "checkout-accepted",
    value: { version: 1, received },
    signer,
    encryptionKey: keys.encryptionKey,
    address: keys.acceptanceAddress,
    createdAt,
    expiresAt: NOW + 900 + 604_800
  });
  await publishToRelays(event, {
    relays: RELAYS,
    channel: "anonymous",
    timeoutMs: 1000,
    authKey: signer
  });
}

describe("a payment the merchant's tolerance accepted", () => {
  it("is being confirmed once the server accepts it, goes back to the shop, then is paid at 3 confirmations", async () => {
    await newCheckout({ value: withRest() });
    await open();
    expect(await screen.findByText("Waiting for the payment", undefined, WAIT)).toBeTruthy();
    // 5 % short: the page, which never knows the tolerance, asks the rest until the server says.
    await act(async () => void mempool.pay(DEPOSIT, 46_550n));
    expect(
      await screen.findByText(
        "Your payment (46'550 sats) does not cover the whole amount. Pay the rest over Lightning or Bitcoin.",
        undefined,
        WAIT
      )
    ).toBeTruthy();
    // Short of the amount, never back to the shop before the server accepts it.
    expect(openRedirect).not.toHaveBeenCalled();
    await act(async () => publishAcceptance(46_550));
    expect(await screen.findByText("Confirming", undefined, WAIT)).toBeTruthy();
    expect(screen.queryByTestId("underpaid-chain")).toBeNull();
    await act(async () => jest.advanceTimersByTimeAsync(REDIRECT_DELAY_MS));
    expect(openRedirect).toHaveBeenCalledWith("https://shop.example/orders/1042/thanks");
    await act(async () => mempool.mine(3));
    await act(async () => jest.advanceTimersByTimeAsync(60_000));
    expect(await screen.findByText("Paid", undefined, WAIT)).toBeTruthy();
    expect(openRedirect).toHaveBeenCalledTimes(1);
  });

  it("shows a payer who comes back the payment accepted, never a rest to pay", async () => {
    await newCheckout({ value: withRest() });
    void mempool.pay(DEPOSIT, 47_000n);
    await publishAcceptance(47_000);
    await open();
    expect(await screen.findByText("Confirming", undefined, LONG_WAIT)).toBeTruthy();
    expect(screen.queryByTestId("underpaid-chain")).toBeNull();
    expect(screen.queryByTestId("rest-plate")).toBeNull();
  });

  it("never counts an acceptance its rest author did not sign", async () => {
    await newCheckout({ value: withRest() });
    await open();
    expect(await screen.findByText("Waiting for the payment", undefined, WAIT)).toBeTruthy();
    await act(async () => void mempool.pay(DEPOSIT, 46_550n));
    await screen.findByTestId("underpaid-chain", undefined, WAIT);
    await act(async () => publishAcceptance(46_550, { signer: new Uint8Array(32).fill(99) }));
    await act(async () => jest.advanceTimersByTimeAsync(5000));
    expect(screen.getByTestId("underpaid-chain")).toBeTruthy();
    expect(screen.queryByText("Confirming")).toBeNull();
    expect(shownCode()).toBe(`bitcoin:${DEPOSIT}?amount=0.0000245`);
  });

  it("counts a payment only from what the server accepted on, and something on-chain", async () => {
    await newCheckout({ value: withRest() });
    await open();
    expect(await screen.findByText("Waiting for the payment", undefined, WAIT)).toBeTruthy();
    // Accepted before any payment: nothing paid yet, the whole amount still shown.
    await act(async () => publishAcceptance(46_550));
    await act(async () => jest.advanceTimersByTimeAsync(3000));
    expect(screen.getByText("Waiting for the payment")).toBeTruthy();
    // Less than it accepted: underpaid, the rest of the whole amount asked.
    await act(async () => void mempool.pay(DEPOSIT, 40_000n));
    await screen.findByTestId("underpaid-chain", undefined, WAIT);
    expect(shownCode()).toBe(`bitcoin:${DEPOSIT}?amount=0.00009`);
    expect(screen.queryByText("Confirming")).toBeNull();
    // Then what it accepted, in all.
    await act(async () => void mempool.pay(DEPOSIT, 6_550n));
    expect(await screen.findByText("Confirming", undefined, WAIT)).toBeTruthy();
  });

  it("never counts an acceptance without anything on-chain: the rest invoices alone are not enough", async () => {
    await newCheckout({ value: withRest() });
    await open();
    expect(await screen.findByText("Waiting for the payment", undefined, WAIT)).toBeTruthy();
    const txid = await act(async () => mempool.pay(DEPOSIT, 2_450n));
    const rest = await act(async () => publishRest(46_550n));
    await waitFor(() => expect(shownCode()).toContain(rest.pr), WAIT);
    verify.set(rest.paymentHash, "paid");
    await act(async () => publishAcceptance(46_550));
    expect(await screen.findByText("Confirming", undefined, WAIT)).toBeTruthy();
    // The on-chain payment dropped (replaced, evicted): 46,550 sats in Lightning only, underpaid.
    await act(async () => void mempool.drop(txid));
    await act(async () => jest.advanceTimersByTimeAsync(60_000));
    await screen.findByTestId("underpaid-chain", undefined, WAIT);
    expect(shownCode()).toBe(`bitcoin:${DEPOSIT}?amount=0.0000245`);
    expect(screen.queryByText("Confirming")).toBeNull();
  });

  it("is paid, not underpaid, past its end with what the server accepted", async () => {
    await newCheckout({ value: withRest(60), expirySeconds: 60 });
    await open();
    expect(await screen.findByText("Waiting for the payment", undefined, WAIT)).toBeTruthy();
    await act(async () => void mempool.pay(DEPOSIT, 46_550n));
    await act(async () => publishAcceptance(46_550));
    expect(await screen.findByText("Confirming", undefined, WAIT)).toBeTruthy();
    await act(async () =>
      jest.advanceTimersByTimeAsync(
        (60 + Math.max(EXPIRY_GRACE_SECONDS, LEASE_GRACE_SECONDS) + 1) * 1000
      )
    );
    await act(async () => mempool.mine(3));
    await act(async () => jest.advanceTimersByTimeAsync(60_000));
    expect(await screen.findByText("Paid", undefined, WAIT)).toBeTruthy();
    expect(screen.queryByText("Underpaid")).toBeNull();
  });
});

describe("a checkout link", () => {
  it("shows the shop's invoice, and asks the LNURL server nothing but its payment", async () => {
    const hash = await newCheckout();
    await open();
    expect(await screen.findByText("Waiting for the payment", undefined, WAIT)).toBeTruthy();
    expect(screen.getByText("24.50")).toBeTruthy();
    expect(screen.getByLabelText("49'000 sats")).toBeTruthy();
    expect(screen.getByText("Order 1042")).toBeTruthy();
    expect(screen.getByText("15:00")).toBeTruthy();
    expect(shownCode()).toBe(`lightning:${made.get(hash)!.pr}`);
    await fireEvent.press(screen.getByTestId("open-wallet"));
    expect(openUri).toHaveBeenCalledWith(`lightning:${made.get(hash)!.pr}`);
    // Its record read on the relays its URL names, its author's alone.
    const queries = relays.calls.filter((call) => call.operation === "query");
    expect(new Set(queries.map(({ relay }) => relay))).toEqual(new Set(RELAYS));
    for (const { filter } of queries) expect(filter).toMatchObject({ authors: [author] });
    // No invoice asked, no rate: the verify URL of this invoice, nothing else.
    expect(asked.length).toBeGreaterThan(0);
    expect(asked.every((url) => url.pathname === `/lnurlp/verify/${hash}`)).toBe(true);
    expect(screen.queryByTestId("redirect")).toBeNull();
  });

  it("sends the payer back to the shop 7 s after the payment is proven", async () => {
    const hash = await newCheckout();
    await open();
    expect(await screen.findByText("Waiting for the payment", undefined, WAIT)).toBeTruthy();
    verify.set(hash, "paid");
    expect(await screen.findByText("Paid", undefined, WAIT)).toBeTruthy();
    expect(screen.getByText("Fine Bakery has received your payment.")).toBeTruthy();
    expect(screen.getByText("Continue")).toBeTruthy();
    expect(screen.getByText("Redirecting to shop.example")).toBeTruthy();
    expect(screen.getByLabelText("Continue, Redirecting to shop.example")).toBeTruthy();
    // The ring counts the seconds left (unseen by screen readers: the button says it all).
    expect(screen.getByText("7", { includeHiddenElements: true })).toBeTruthy();
    await act(async () => jest.advanceTimersByTimeAsync(REDIRECT_DELAY_MS - 1000));
    expect(openRedirect).not.toHaveBeenCalled();
    await act(async () => jest.advanceTimersByTimeAsync(1000));
    expect(openRedirect).toHaveBeenCalledTimes(1);
    expect(openRedirect).toHaveBeenCalledWith("https://shop.example/orders/1042/thanks");
    // The receipt stays, and the button for a tap (a browser may refuse to leave on its own).
    expect(screen.getByText("Paid")).toBeTruthy();
    await act(async () => jest.advanceTimersByTimeAsync(30_000));
    expect(openRedirect).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByTestId("redirect"));
    expect(openRedirect).toHaveBeenCalledTimes(2);
  });

  it("goes back at once with a tap, and only once", async () => {
    const hash = await newCheckout();
    verify.set(hash, "paid");
    await open();
    expect(await screen.findByTestId("redirect", undefined, WAIT)).toBeTruthy();
    await fireEvent.press(screen.getByTestId("redirect"));
    expect(openRedirect).toHaveBeenCalledTimes(1);
    await act(async () => jest.advanceTimersByTimeAsync(REDIRECT_DELAY_MS + 1000));
    expect(openRedirect).toHaveBeenCalledTimes(1);
  });

  it("opens the shop's app with a deeplink, its scheme shown", async () => {
    const hash = await newCheckout({ value: { redirectUrl: "myshop://orders/1042" } });
    verify.set(hash, "paid");
    await open();
    expect(await screen.findByText("Redirecting to myshop://", undefined, WAIT)).toBeTruthy();
    await act(async () => jest.advanceTimersByTimeAsync(REDIRECT_DELAY_MS));
    expect(openRedirect).toHaveBeenCalledWith("myshop://orders/1042");
  });

  it("shows the receipt without sending the payer away again when they come back", async () => {
    const hash = await newCheckout();
    verify.set(hash, "paid");
    mockRedirected.add(author);
    await open();
    expect(await screen.findByText("Paid", undefined, WAIT)).toBeTruthy();
    expect(screen.getByText("Redirecting to shop.example")).toBeTruthy();
    expect(screen.queryByText("7", { includeHiddenElements: true })).toBeNull();
    await act(async () => jest.advanceTimersByTimeAsync(REDIRECT_DELAY_MS * 2));
    expect(openRedirect).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId("redirect"));
    expect(openRedirect).toHaveBeenCalledTimes(1);
  });

  it("shows the receipt alone without a redirect URL", async () => {
    const hash = await newCheckout({ value: { redirectUrl: null } });
    verify.set(hash, "paid");
    await open();
    expect(await screen.findByText("Paid", undefined, WAIT)).toBeTruthy();
    expect(screen.queryByTestId("redirect")).toBeNull();
    // Paid over Lightning: its title, how, when its invoice was made; no transaction.
    expect(screen.getByTestId("outcome-note")).toHaveTextContent("Order 1042");
    const details = within(screen.getByTestId("payment-details"));
    expect(details.getByTestId("details-method")).toHaveTextContent("Lightning");
    expect(details.getByTestId("details-created")).toHaveTextContent(createdOn(NOW));
    expect(details.queryByTestId("details-transaction")).toBeNull();
    await act(async () => jest.advanceTimersByTimeAsync(REDIRECT_DELAY_MS * 2));
    expect(openRedirect).not.toHaveBeenCalled();
  });

  it("never sends the payer away on a payment it cannot prove", async () => {
    const hash = await newCheckout();
    verify.set(hash, "wrongPreimage");
    await open();
    expect(await screen.findByText("Waiting for the payment", undefined, WAIT)).toBeTruthy();
    await act(async () => jest.advanceTimersByTimeAsync(20_000));
    expect(screen.queryByText("Paid")).toBeNull();
    expect(screen.getByText("Waiting for the payment")).toBeTruthy();
    verify.set(hash, "error");
    await act(async () => jest.advanceTimersByTimeAsync(20_000));
    expect(screen.queryByText("Paid")).toBeNull();
    expect(openRedirect).not.toHaveBeenCalled();
  });

  it("says expired, without a redirection, only once the LNURL server says so past the grace period", async () => {
    await newCheckout({ expirySeconds: 60 });
    await open();
    expect(await screen.findByText("Waiting for the payment", undefined, WAIT)).toBeTruthy();
    // Past its end: still checked, a payment of its last seconds may be reported late.
    await act(async () => jest.advanceTimersByTimeAsync(61_000));
    expect(await screen.findByTestId("request-ended", undefined, WAIT)).toBeTruthy();
    expect(screen.queryByText("Expired")).toBeNull();
    await act(async () => jest.advanceTimersByTimeAsync(EXPIRY_GRACE_SECONDS * 1000));
    expect(await screen.findByText("Expired", undefined, WAIT)).toBeTruthy();
    expect(
      screen.getByText(
        "The time to pay is over and no payment was received. Go back to Fine Bakery's shop to ask for a new one."
      )
    ).toBeTruthy();
    expect(screen.queryByTestId("redirect")).toBeNull();
    expect(openRedirect).not.toHaveBeenCalled();
  });

  it("shows an order in sats without a price", async () => {
    await newCheckout({ value: { fiat: null } });
    await open();
    expect(await screen.findByText("Waiting for the payment", undefined, WAIT)).toBeTruthy();
    // In the device's number format: grouped with a (narrow) no-break space.
    expect(screen.getByText(/^49'000$/)).toBeTruthy();
    expect(screen.getByText("sats")).toBeTruthy();
    // The receipt's unit goes BTC, sats, then BTC again: no price to show.
    expect(screen.getByTestId("receipt-amount").props.children).toBe("0.00049");
    await fireEvent.press(screen.getByTestId("amount-unit"));
    expect(screen.getByTestId("receipt-amount").props.children).toMatch(/^49'000$/);
    await fireEvent.press(screen.getByTestId("amount-unit"));
    expect(screen.getByTestId("receipt-amount").props.children).toBe("0.00049");
  });

  it("shows the sats of an order in sats once expired", async () => {
    await newCheckout({ value: { fiat: null }, expirySeconds: 60 });
    await open();
    expect(await screen.findByText("Waiting for the payment", undefined, WAIT)).toBeTruthy();
    await act(async () => jest.advanceTimersByTimeAsync(61_000 + EXPIRY_GRACE_SECONDS * 1000));
    expect(await screen.findByText("Expired", undefined, WAIT)).toBeTruthy();
    expect(screen.getByText(/^49'000$/)).toBeTruthy();
    expect(screen.getByText("sats")).toBeTruthy();
  });

  it("never shows open an invoice that ended while the relays were out of reach", async () => {
    await newCheckout({ expirySeconds: 60 });
    for (const relay of RELAYS) relays.unreachable.add(relay);
    await open();
    expect(await screen.findByText("Cannot connect", undefined, LONG_WAIT)).toBeTruthy();
    // Its end passes while the page says so: the record read on "Try again" has ended.
    await act(async () => jest.advanceTimersByTimeAsync(90_000));
    relays.unreachable.clear();
    await fireEvent.press(screen.getByTestId("retry"));
    await waitFor(() => expect(screen.queryByTestId("loading-spinner")).toBeNull(), LONG_WAIT);
    expect(screen.queryByTestId("qr-value")).toBeNull();
    expect(screen.getByTestId("request-ended")).toBeTruthy();
  });

  it("shows a loader, never the code, until the LNURL server answers, then the payment", async () => {
    const hash = await newCheckout();
    // Paid already: a payer who comes back.
    verify.set(hash, "paid");
    verifyDelayMs = 2000;
    await open();
    expect(await screen.findByText("Checking the payment…", undefined, WAIT)).toBeTruthy();
    expect(screen.queryByTestId("qr-value")).toBeNull();
    await act(async () => jest.advanceTimersByTimeAsync(2500));
    expect(await screen.findByText("Paid", undefined, WAIT)).toBeTruthy();
    expect(screen.queryByTestId("qr-value")).toBeNull();
  });

  it("shows the code once the LNURL server failed to answer", async () => {
    const hash = await newCheckout();
    verify.set(hash, "error");
    await open();
    expect(await screen.findByText("Waiting for the payment", undefined, WAIT)).toBeTruthy();
    expect(shownCode()).toBe(`lightning:${made.get(hash)!.pr}`);
  });

  it("never shows a record its author did not sign", async () => {
    await newCheckout({ forged: true });
    await open();
    expect(await screen.findByText("Payment request not found", undefined, WAIT)).toBeTruthy();
  });

  it("never shows a record with a refused redirect URL", async () => {
    await newCheckout({ value: { redirectUrl: "javascript://%0Aalert(1)" } });
    await open();
    expect(await screen.findByText("Payment request not found", undefined, WAIT)).toBeTruthy();
    expect(screen.queryByTestId("qr-value")).toBeNull();
  });

  it("asks to be updated for a record of a newer version", async () => {
    await newCheckout({ value: { version: 3 } });
    await open();
    expect(await screen.findByText("Page to update", undefined, WAIT)).toBeTruthy();
    expect(screen.queryByTestId("qr-value")).toBeNull();
  });

  it("asks to be updated for a link of a newer format, without looking for it", async () => {
    await newCheckout();
    const published = relays.calls.length;
    fragment = `#c2.${fragment.slice(3)}`;
    await open();
    expect(await screen.findByText("Page to update", undefined, WAIT)).toBeTruthy();
    expect(relays.calls).toHaveLength(published);
  });

  it("says a damaged link is incomplete, without looking for it", async () => {
    fragment = "#c.abc.def.ghi";
    await open();
    expect(
      await screen.findByText(
        "This link is incomplete. Check that it was copied in full, or ask the merchant for a new one.",
        undefined,
        WAIT
      )
    ).toBeTruthy();
    expect(relays.calls).toHaveLength(0);
  });

  it("says when no relay answers, and tries again", async () => {
    await newCheckout();
    for (const relay of RELAYS) relays.unreachable.add(relay);
    await open();
    expect(await screen.findByText("Cannot connect", undefined, LONG_WAIT)).toBeTruthy();
    relays.unreachable.clear();
    await fireEvent.press(screen.getByTestId("retry"));
    expect(await screen.findByText("Waiting for the payment", undefined, WAIT)).toBeTruthy();
  });

  it("says when the relays answer without it", async () => {
    await newCheckout({ unpublished: true });
    await open();
    expect(await screen.findByText("Payment request not found", undefined, LONG_WAIT)).toBeTruthy();
  });
});
