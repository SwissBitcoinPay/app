import { act, render } from "@testing-library/react-native";

import { DEFAULT_RELAYS } from "@/config/relays";
import {
  SETTLE_TIMEOUT_MS,
  SaleSettler,
  type SettleResult
} from "@/features/payment-link/SaleSettler";
import { decodeBolt11 } from "@/lib/lightning/bolt11";
import type { Invoice } from "@/lib/lightning/lnurl";
import type { SharedSale } from "@/lib/payment-link/payload";
import { declareInvoice, saleRegistry } from "@/lib/registry/registry";
import { encodeWalletSecret } from "@/lib/breez/secret";
import {
  deriveBusinessRegistry,
  deriveLinkOwner,
  deriveRegistryKey,
  deriveRegistryReader,
  deriveTeamKeys
} from "@/lib/team/keys";

import { makeInvoice, metadataHash, preimagePair } from "../../jest/lightning";
import type * as RelaysFake from "../../jest/nostr-relays";

/*
 * A sale followed while it still lasts (a sale paid in full is settled at once, an invoice's
 * months before its end): pending as soon as nothing can have paid it, without
 * waiting for the time allowed; followed that long while an invoice declared for it is checked.
 */

jest.mock("../lib/breez/config", () => ({
  ...jest.requireActual("../lib/breez/config"),
  getWalletConfig: () => ({ network: "mainnet", apiKey: "test-api-key" }),
  // Mainnet: invoices of "bc" (the app config has no network under Jest).
  getBreezNetwork: () => "mainnet"
}));

const relays = jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");

// A BIP-39 test mnemonic (all-zero entropy), never a real wallet's.
const MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const team = deriveTeamKeys(encodeWalletSecret({ mnemonic: MNEMONIC }));
const business = deriveBusinessRegistry(team);
const ADDRESS = "sattleme02c6047f94@breez.tips";
const METADATA = `[["text/plain","Fine Bakery"],["text/identifier","${ADDRESS}"]]`;
const FIAT = { minor: 31_951, digits: 2, currency: "CHF" };
/** 13:10:30 UTC: the invoice was sent a month ago, and is due in five months. */
const NOW = Date.UTC(2026, 9, 9, 13, 10, 30) / 1000;
const DAY = 86_400;

function sale(onchainAddress: string | null = null): SharedSale {
  return {
    version: 4,
    businessName: "Fine Bakery",
    lightningAddress: ADDRESS,
    fiat: FIAT,
    note: "Invoice 2026-0042",
    onchainAddress,
    startsAt: NOW - 30 * DAY,
    endsAt: NOW + 150 * DAY,
    redirectUrl: null,
    registryKey: deriveRegistryKey(team),
    registryReader: deriveRegistryReader(team).publicKey,
    owner: deriveLinkOwner(team).publicKey,
    taker: null,
    bitcoinNode: null,
    final: null
  };
}

function invoice(n: number, at: number): Invoice {
  const { paymentHash } = preimagePair(n);
  const pr = makeInvoice({
    amountMsat: 400_000_000n,
    paymentHash,
    descriptionHash: metadataHash(METADATA),
    timestamp: at,
    expirySeconds: 600
  });
  return { pr, decoded: decodeBolt11(pr)!, verifyUrl: `https://breez.tips/verify/${paymentHash}` };
}

beforeEach(() => {
  relays.resetRelays();
  jest.useFakeTimers();
  jest.setSystemTime(NOW * 1000);
  // The merchant's Lightning address answers; its invoices are not paid. Nothing else is reached.
  jest.mocked(globalThis.fetch).mockImplementation(async (input) => {
    const url = new URL(String(input));
    const json = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;
    if (url.pathname === "/.well-known/lnurlp/sattleme02c6047f94") {
      return json({
        tag: "payRequest",
        callback: "https://breez.tips/lnurlp/sattleme02c6047f94/invoice",
        minSendable: 1000,
        maxSendable: 4_000_000_000,
        metadata: METADATA
      });
    }
    if (url.pathname.startsWith("/verify/")) {
      return json({ status: "OK", settled: false, preimage: null });
    }
    throw new TypeError("Network request failed");
  });
});

afterEach(() => {
  jest.useRealTimers();
});

async function follow(followed: SharedSale, saleKey: Uint8Array, tolerance = 0) {
  const done: SettleResult[] = [];
  await render(
    <SaleSettler
      sale={followed}
      saleKey={saleKey}
      tolerance={tolerance}
      onDone={(result) => done.push(result)}
    />
  );
  return done;
}

describe("SaleSettler, a sale that still lasts", () => {
  it("is pending at once when no invoice was declared for it", async () => {
    const done = await follow(sale(), new Uint8Array(32).fill(1));
    await act(async () => jest.advanceTimersByTimeAsync(5_000));
    expect(done).toEqual([{ kind: "pending", phase: expect.any(String) }]);
  });

  it("is followed for the time allowed while an invoice declared for it is checked", async () => {
    const saleKey = new Uint8Array(32).fill(2);
    await declareInvoice(saleRegistry(business, saleKey), invoice(1, NOW - 120), {
      fiat: FIAT,
      note: "Invoice 2026-0042"
    });
    const done = await follow(sale(), saleKey);
    await act(async () => jest.advanceTimersByTimeAsync(5_000));
    expect(done).toEqual([]);
    await act(async () => jest.advanceTimersByTimeAsync(SETTLE_TIMEOUT_MS));
    expect(done).toEqual([{ kind: "pending", phase: expect.any(String) }]);
  });

  it("is never told pending early while a majority of the relays has not answered", async () => {
    for (const relay of DEFAULT_RELAYS) relays.unreachable.add(relay);
    const done = await follow(sale(), new Uint8Array(32).fill(3));
    await act(async () => jest.advanceTimersByTimeAsync(5_000));
    expect(done).toEqual([]);
    await act(async () => jest.advanceTimersByTimeAsync(SETTLE_TIMEOUT_MS));
    expect(done).toHaveLength(1);
  });
});
