import "@/i18n";

import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { router as expoRouter } from "expo-router";
import { render } from "@testing-library/react-native";
import { act, fireEvent, renderRouter, screen, waitFor } from "expo-router/testing-library";
import { Directory, File, Paths } from "expo-file-system";

import AppLayout from "@/app/(app)/_layout";
import ChargeScreen from "@/app/(app)/pos/charge";
import AmountScreen from "@/app/(app)/pos/index";
import PosLayout from "@/app/(app)/pos/_layout";
import LaunchScreen from "@/app/index";
import { DEFAULT_RELAYS } from "@/config/relays";
import { wipeDevice } from "@/features/settings/device-wipe";
import { resetOwnerDeviceCache } from "@/features/team/owner-device";
import { resetPayRequests } from "@/features/terminal/invoice";
import { saveBusinessRegistry } from "@/features/terminal/registry-key";
import {
  forgetAccountSales,
  loadFollowedSales,
  resetFollowedMarks,
  saveFollowedSale,
  saleIdOf
} from "@/features/terminal/sale-follow";
import {
  SALES_FOLLOW_INTERVAL_MS,
  SalesFollower,
  recordVerdict
} from "@/features/terminal/SalesFollower";
import type { Settlement } from "@/features/terminal/useSale";
import { decodeBolt11 } from "@/lib/lightning/bolt11";
import { encodeWalletSecret } from "@/lib/breez/secret";
import { ownerOnchainPaymentsOf } from "@/lib/registry/onchain-payments";
import {
  deriveMemberKeys,
  deriveRegistryReader,
  deriveTeamKeys,
  ownerDeviceSecret,
  ownerDevicesSecret
} from "@/lib/team/keys";
import { fetchSales, type SaleUnderpaid } from "@/lib/team/member-records";
import {
  FOLLOWED_SALES_LIMIT,
  parseFollowedSales,
  serializeFollowedSales,
  type FollowedSale
} from "@/lib/terminal/followed-sales";
import { FOLLOWED_SALES_DIR_NAME } from "@/lib/terminal/followed-sales-store";
import { loadTerminalProfile, saveOnchainPool, saveTerminalProfile } from "@/lib/terminal/profile";
import { saveOwnerDeviceRecord } from "@/lib/team/owner-device-store";

import { taprootAddress } from "../../jest/bitcoin";
import { makeInvoice, metadataHash, preimagePair } from "../../jest/lightning";
import type * as MempoolFake from "../../jest/mempool";
import type * as RelaysFake from "../../jest/nostr-relays";

/*
 * The point of sale's sales kept for their verdict (src/features/terminal/sale-follow.ts): what the
 * device keeps of them, how their verdict is recorded once their screen is gone, and a sale whose
 * web page was reloaded "Confirming". The rest of the scenario, the
 * screen left with "Back to the Point of Sale", is in pos-flow.test.tsx.
 */

// 69 400 CHF per bitcoin at every hour: 2.00 CHF is 2 882 sats.
jest.mock("../features/terminal/useRate", () => ({
  useRate: () => ({ rate: 69_400, hour: mockHour(), loading: false, current: () => 69_400 })
}));
const mockHour = () =>
  jest
    .requireActual<typeof import("../lib/rates/sources")>("../lib/rates/sources")
    .pointHourOf(Math.floor(Date.now() / 1000));
jest.mock("../lib/rates/sources", () => ({
  ...jest.requireActual("../lib/rates/sources"),
  fetchHourPoint: async () => 69_400,
  fetchHourPoints: async (_currency: string, from: number, to: number) => {
    const points = new Map<number, number>();
    for (let hour = from; hour <= to; hour += 3600) points.set(hour, 69_400);
    return points;
  }
}));
jest.mock("../lib/breez/config", () => ({
  ...jest.requireActual("../lib/breez/config"),
  getBreezNetwork: () => "mainnet"
}));
jest.mock("../config/payment-links", () => ({
  ...jest.requireActual("../config/payment-links"),
  getPaymentLinkOrigin: () => "https://web.example"
}));
jest.mock("../lib/nfc/boltcard", () => ({
  getCardReading: async () => "none",
  isReadCancelled: () => false,
  readCard: jest.fn()
}));

const relays = jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");
const mempool = jest.requireMock<typeof MempoolFake>("../lib/onchain/esplora");

const WALLET = "02c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5";
const ADDRESS = "sattleme02c6047f94@breez.tips";
const METADATA = `[["text/plain","Fine Bakery"],["text/identifier","${ADDRESS}"]]`;
// The test team of team.test.ts, and this device among the owner's devices.
const TEAM = deriveTeamKeys(
  encodeWalletSecret({
    mnemonic:
      "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about"
  })
);
const DEVICE = "ab".repeat(16);
const DEVICE_KEYS = deriveMemberKeys(ownerDeviceSecret(TEAM, DEVICE));
const PROFILE = {
  version: 2 as const,
  walletId: WALLET,
  backupKey: "ab".repeat(32),
  lightningAddress: ADDRESS,
  businessName: "Fine Bakery",
  currency: "CHF"
};
const BUSINESS = {
  key: hexToBytes("cd".repeat(32)),
  reader: "52d64e4fbc5670d62bad80c169aac897172117ce88c4978506f0c7dd9675ff18",
  owner: "755748c663a1eb5ab3e6810507b1bbd0bcbd2acd02dcd2eb9cf3b5acba99e426"
};
/** 13:10:30 UTC: a sale priced by the point of 13:00. */
const START = Date.UTC(2026, 9, 3, 13, 10, 30);
const NOW = START / 1000;
const TX = (n: number) => n.toString(16).padStart(64, "0");

/** A sale kept for its verdict, as its screen keeps it (useSaleRecord). */
function followed(over: Partial<FollowedSale> = {}): FollowedSale {
  const hash = preimagePair(1).paymentHash;
  return {
    account: WALLET,
    saleKey: "11".repeat(32),
    relays: DEFAULT_RELAYS,
    lightningAddress: ADDRESS,
    fiat: { minor: 200, digits: 2, currency: "CHF" },
    note: "Table 4",
    startsAt: NOW,
    endsAt: NOW + 600,
    address: taprootAddress(1),
    tolerance: 0,
    taker: null,
    declared: true,
    invoice: {
      paymentHash: hash,
      sats: "2882",
      verifyUrl: `https://breez.tips/verify/${hash}`,
      createdAt: NOW,
      expiresAt: NOW + 600
    },
    recordedAt: NOW,
    underpaid: null,
    settled: false,
    ...over
  };
}

/** What following a sale found, of `status`. */
function settlement(over: Partial<Settlement> & Pick<Settlement, "status">): Settlement {
  return {
    received: 2_882n,
    accepted: false,
    due: 2_882n,
    point: { hour: NOW - 630, rate: 69_400 },
    lightning: [],
    onchain: {
      address: taprootAddress(1),
      transactions: [{ txid: TX(1), receivedAt: START, sats: 2_882n }],
      sats: 2_882n
    },
    finalFrom: NOW,
    ...over
  };
}

/** This device among the owner's devices: it signs its sales' records (recordSigner). */
async function asOwnerDevice() {
  await saveOwnerDeviceRecord({
    version: 1,
    account: WALLET,
    id: DEVICE,
    secret: bytesToHex(ownerDeviceSecret(TEAM, DEVICE)),
    shared: bytesToHex(ownerDevicesSecret(TEAM))
  });
  resetOwnerDeviceCache();
}

beforeEach(() => {
  relays.resetRelays();
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

describe("the sales kept for their verdict", () => {
  it("keeps each sale once, the latest given, and the ones that end last beyond the limit", () => {
    const sales = Array.from({ length: FOLLOWED_SALES_LIMIT + 2 }, (_, i) =>
      followed({ saleKey: (i + 1).toString(16).padStart(64, "0"), endsAt: NOW + 600 + i })
    );
    const stored = parseFollowedSales(
      serializeFollowedSales([...sales, { ...sales[5]!, note: "Changed" }])
    );
    expect(stored).toHaveLength(FOLLOWED_SALES_LIMIT);
    expect(stored.map(({ saleKey }) => saleKey)).not.toContain(sales[0]!.saleKey);
    expect(stored.find(({ saleKey }) => saleKey === sales[5]!.saleKey)?.note).toBe("Changed");
  });

  it("leaves out what does not pass its checks, as anything stored", () => {
    const valid = followed();
    const record = (sales: unknown[]) => JSON.stringify({ version: 1, sales });
    expect(parseFollowedSales(record([valid]))).toEqual([valid]);
    for (const broken of [
      { ...valid, address: "bc1qnotataprootaddress" },
      { ...valid, fiat: { ...valid.fiat, minor: 1.5 } },
      { ...valid, relays: [] },
      { ...valid, endsAt: valid.startsAt },
      { ...valid, recordedAt: valid.invoice.createdAt - 1 },
      // An underpayment dated before its invoice, or after the record's last version.
      { ...valid, underpaid: { at: NOW - 1, received: "1", due: null, transactions: [] } },
      {
        ...valid,
        recordedAt: NOW,
        underpaid: { at: NOW + 5, received: "1", due: null, transactions: [] }
      },
      { ...valid, settled: "yes" }
    ]) {
      expect(parseFollowedSales(record([broken, valid]))).toEqual([valid]);
    }
    expect(parseFollowedSales("{not json")).toEqual([]);
    expect(parseFollowedSales(null)).toEqual([]);
  });

  it("writes version 2 only while a sale showed its address alone, and reads both", () => {
    // Above the most the Lightning address accepts, the hour's address alone (useSale.ts).
    const alone = followed({
      saleKey: "33".repeat(32),
      invoice: {
        paymentHash: null,
        verifyUrl: null,
        hour: NOW - (NOW % 3600),
        sats: "2882",
        createdAt: NOW,
        expiresAt: NOW + 600
      }
    });
    const invoiceOnly = serializeFollowedSales([followed()]);
    // An app from before reads it, and keeps following its sales.
    expect(JSON.parse(invoiceOnly).version).toBe(1);
    expect(parseFollowedSales(invoiceOnly)).toEqual([followed()]);
    const both = serializeFollowedSales([followed(), alone]);
    expect(JSON.parse(both).version).toBe(2);
    expect(parseFollowedSales(both)).toEqual([followed(), alone]);
    // Version 1 never held one: left out there, as anything that does not pass its checks.
    expect(parseFollowedSales(JSON.stringify({ version: 1, sales: [alone, followed()] }))).toEqual([
      followed()
    ]);
    // Without its hour, or with a verify URL: left out.
    for (const broken of [
      { ...alone, invoice: { ...alone.invoice, hour: NOW } },
      { ...alone, invoice: { ...alone.invoice, verifyUrl: "https://breez.tips/verify/x" } }
    ]) {
      expect(parseFollowedSales(JSON.stringify({ version: 2, sales: [broken] }))).toEqual([]);
    }
  });

  it("never writes over a newer app's record", async () => {
    const directory = new Directory(Paths.document, FOLLOWED_SALES_DIR_NAME);
    directory.create({ intermediates: true, idempotent: true });
    const file = new File(directory, "sales.json");
    const newer = JSON.stringify({ version: 3, sales: [] });
    file.writeSync(newer);
    await saveFollowedSale(followed());
    expect(await file.text()).toBe(newer);
    expect(await loadFollowedSales()).toEqual([]);
    file.delete();
  });

  it("forgets an account's sales when its employee leaves, and all of them at log out", async () => {
    await saveFollowedSale(followed());
    await saveFollowedSale(followed({ account: "aa".repeat(32), saleKey: "22".repeat(32) }));
    await forgetAccountSales("aa".repeat(32));
    expect((await loadFollowedSales()).map(({ saleKey }) => saleKey)).toEqual(["11".repeat(32)]);
    await wipeDevice();
    expect(new Directory(Paths.document, FOLLOWED_SALES_DIR_NAME).exists).toBe(false);
    expect(await loadFollowedSales()).toEqual([]);
  });
});

describe("recordVerdict", () => {
  beforeEach(asOwnerDevice);
  afterEach(() => resetOwnerDeviceCache());

  const records = () => fetchSales(DEVICE_KEYS, 0, DEFAULT_RELAYS);

  it("records the sale paid on its record, later than its last version, and forgets it", async () => {
    const underpaid: SaleUnderpaid = {
      at: NOW + 20,
      received: "1500",
      due: "2882",
      transactions: [TX(1)]
    };
    const sale = followed({ recordedAt: NOW + 20, underpaid });
    await saveFollowedSale(sale);
    await expect(
      recordVerdict(PROFILE, sale, settlement({ status: "paid" }), NOW + 5)
    ).resolves.toBe("done");
    expect(await records()).toEqual([
      expect.objectContaining({
        paymentHash: sale.invoice.paymentHash,
        paidAt: NOW + 21,
        // Its underpayment stays in it: its date never goes back.
        underpaid,
        onchainAddress: sale.address,
        sale: saleIdOf(sale.saleKey)
      })
    ]);
    expect(await loadFollowedSales()).toEqual([]);
  });

  it("records a sale that showed its address alone paid on that hour's record", async () => {
    const hour = NOW - (NOW % 3600);
    const sale = followed({
      invoice: {
        paymentHash: null,
        verifyUrl: null,
        hour,
        sats: "2882",
        createdAt: NOW,
        expiresAt: NOW + 600
      }
    });
    await saveFollowedSale(sale);
    await expect(
      recordVerdict(PROFILE, sale, settlement({ status: "paid" }), NOW + 5)
    ).resolves.toBe("done");
    expect(await records()).toEqual([
      expect.objectContaining({
        paymentHash: null,
        verifyUrl: null,
        hour,
        paidAt: NOW + 1,
        onchainAddress: sale.address,
        sale: saleIdOf(sale.saleKey)
      })
    ]);
    expect(await loadFollowedSales()).toEqual([]);
  });

  it("records an underpayment past the sale's end once, dated after what its device saw", async () => {
    const sale = followed();
    await saveFollowedSale(sale);
    const short = settlement({
      status: "underpaid",
      received: 1_600n,
      onchain: {
        address: sale.address,
        transactions: [
          { txid: TX(1), receivedAt: START, sats: 1_500n },
          { txid: TX(2), receivedAt: START, sats: 100n }
        ],
        sats: 1_600n
      },
      finalFrom: NOW + 600 + 3 * 3600
    });
    const at = NOW + 1000;
    await expect(recordVerdict(PROFILE, sale, short, at)).resolves.toBe("later");
    const [recorded] = (await records()) ?? [];
    expect(recorded?.paidAt).toBeNull();
    expect(recorded?.underpaid).toEqual({
      at: at + 60,
      received: "1600",
      due: "2882",
      transactions: [TX(1), TX(2)]
    });
    const [kept] = await loadFollowedSales();
    expect(kept).toMatchObject({ settled: true, recordedAt: at + 60 });

    // The same verdict at its end: not recorded again, the sale forgotten.
    const calls = relays.calls.length;
    await expect(recordVerdict(PROFILE, kept!, short, NOW + 600 + 3 * 3600)).resolves.toBe("done");
    expect(relays.calls.slice(calls).some(({ operation }) => operation === "publish")).toBe(false);
    expect(await loadFollowedSales()).toEqual([]);
  });

  it("keeps the sale when no majority takes its verdict, its date moved on all the same", async () => {
    const sale = followed();
    await saveFollowedSale(sale);
    for (const relay of DEFAULT_RELAYS.slice(0, 3)) relays.readOnly.add(relay);
    await expect(
      recordVerdict(PROFILE, sale, settlement({ status: "paid" }), NOW + 30)
    ).resolves.toBe("failed");
    expect(await loadFollowedSales()).toEqual([
      // Paid when its transaction came (NOW), dated after the record's last version all the same.
      expect.objectContaining({ saleKey: sale.saleKey, recordedAt: NOW + 1 })
    ]);
  });

  it("records the sale paid on the Lightning invoice that paid it, when it is not the last shown", async () => {
    const sale = followed();
    await saveFollowedSale(sale);
    // The previous hour's invoice, paid in its last seconds once the next one showed.
    const { paymentHash } = preimagePair(7);
    const pr = makeInvoice({
      amountMsat: 2_900_000n,
      paymentHash,
      descriptionHash: metadataHash(METADATA),
      timestamp: NOW - 400,
      expirySeconds: 600
    });
    const paid = {
      pr,
      decoded: decodeBolt11(pr)!,
      verifyUrl: `https://breez.tips/verify/${paymentHash}`
    };
    await expect(
      recordVerdict(
        PROFILE,
        sale,
        settlement({
          status: "paid",
          onchain: null,
          lightning: [{ invoice: paid, preimage: preimagePair(7).preimage }]
        }),
        NOW + 50
      )
    ).resolves.toBe("done");
    expect(await records()).toEqual([
      expect.objectContaining({
        paymentHash,
        sats: "2900",
        paidAt: NOW + 50,
        sale: saleIdOf(sale.saleKey),
        // The proof of its payment, for an assistant's export.
        lightning: [{ invoice: pr, preimage: preimagePair(7).preimage }]
      })
    ]);
  });

  it("names the first transactions of an underpayment only, as every reader takes", async () => {
    const sale = followed();
    await saveFollowedSale(sale);
    const transactions = Array.from({ length: 25 }, (_, i) => ({
      txid: TX(i + 1),
      receivedAt: START,
      sats: 10n
    }));
    const short = settlement({
      status: "underpaid",
      received: 250n,
      onchain: { address: sale.address, transactions, sats: 250n },
      finalFrom: NOW + 99_999
    });
    await expect(recordVerdict(PROFILE, sale, short, NOW + 900)).resolves.toBe("later");
    const [recorded] = (await records()) ?? [];
    expect(recorded?.underpaid?.transactions).toEqual(
      transactions.slice(0, 20).map(({ txid }) => txid)
    );
    // Kept on the device as it is: never dropped for what it holds.
    expect(await loadFollowedSales()).toEqual([expect.objectContaining({ settled: true })]);
  });

  it("records an undeclared sale paid on-chain, never underpaid: its Lightning payments are unknown", async () => {
    const sale = followed({ declared: false });
    await saveFollowedSale(sale);
    const short = settlement({ status: "underpaid", received: 1_500n, finalFrom: NOW + 99_999 });
    await expect(recordVerdict(PROFILE, sale, short, NOW + 900)).resolves.toBe("later");
    expect(await records()).toEqual([]);
    await expect(
      recordVerdict(PROFILE, sale, settlement({ status: "paid" }), NOW + 900)
    ).resolves.toBe("done");
    expect((await records())?.map(({ paidAt }) => paidAt)).toEqual([NOW + 1]);
  });

  it("forgets an expired sale without recording anything, and a sale nothing signs", async () => {
    await saveFollowedSale(followed());
    await expect(
      recordVerdict(PROFILE, followed(), settlement({ status: "expired", due: null }), NOW + 900)
    ).resolves.toBe("done");
    expect(await records()).toEqual([]);
    expect(await loadFollowedSales()).toEqual([]);

    // Without keys to sign (the account never opened on this device), nothing is ever recorded.
    resetOwnerDeviceCache();
    await saveFollowedSale(followed());
    const other = { ...PROFILE, walletId: `03${WALLET.slice(2)}` };
    const short = settlement({ status: "underpaid", received: 1_500n, finalFrom: NOW + 99_999 });
    await expect(recordVerdict(other, followed(), short, NOW + 900)).resolves.toBe("done");
    expect(await loadFollowedSales()).toEqual([]);
  });
});

describe("a sale followed once its screen is gone", () => {
  const routes = {
    index: LaunchScreen,
    "(app)/_layout": AppLayout,
    "(app)/pos/_layout": PosLayout,
    "(app)/pos/index": AmountScreen,
    "(app)/pos/charge": ChargeScreen
  };

  /** Breez's LNURL server: its invoices, never paid. */
  function lnurlService() {
    let next = 1;
    const made = new Map<string, string>();
    jest.mocked(globalThis.fetch).mockImplementation(async (input) => {
      const url = new URL(String(input));
      const json = (body: unknown) =>
        ({ ok: true, status: 200, json: async () => body }) as Response;
      if (url.pathname === "/.well-known/lnurlp/sattleme02c6047f94") {
        return json({
          tag: "payRequest",
          callback: "https://breez.tips/lnurlp/sattleme02c6047f94/invoice",
          minSendable: 1000,
          maxSendable: 4_000_000_000,
          metadata: METADATA,
          commentAllowed: 255
        });
      }
      if (url.pathname === "/lnurlp/sattleme02c6047f94/invoice") {
        const { paymentHash } = preimagePair(next++);
        const pr = makeInvoice({
          amountMsat: BigInt(url.searchParams.get("amount")!),
          paymentHash,
          descriptionHash: metadataHash(METADATA),
          timestamp: Math.floor(Date.now() / 1000),
          expirySeconds: Number(url.searchParams.get("expiry"))
        });
        expect(decodeBolt11(pr)).not.toBeNull();
        made.set(paymentHash, pr);
        return json({ pr, verify: `https://breez.tips/verify/${paymentHash}` });
      }
      if (url.pathname.startsWith("/verify/")) {
        const hash = url.pathname.slice("/verify/".length);
        return json({ status: "OK", settled: false, preimage: null, pr: made.get(hash) });
      }
      throw new TypeError("Network request failed");
    });
  }

  beforeEach(async () => {
    resetPayRequests();
    jest.useFakeTimers();
    jest.setSystemTime(START);
    await asOwnerDevice();
    await saveTerminalProfile(PROFILE);
    await saveBusinessRegistry(WALLET, BUSINESS);
    await saveOnchainPool({
      version: 1,
      walletId: WALLET,
      addresses: [taprootAddress(1), taprootAddress(2), taprootAddress(3)]
    });
  });
  afterEach(() => resetOwnerDeviceCache());

  it("declares and records a sale its screen left open, paid after", async () => {
    lnurlService();
    const router = await renderRouter(routes, { initialUrl: "/" });
    await waitFor(() => expect(router.getPathname()).toBe("/pos"));
    for (const key of ["2", "0", "0"]) await fireEvent.press(screen.getByTestId(`key-${key}`));
    await fireEvent.press(screen.getByTestId("charge"));
    expect(await screen.findByText("Waiting for the payment")).toBeTruthy();
    // "Back": the invoice stays payable, its address too, nothing shows the sale any more.
    await fireEvent.press(screen.getByTestId("charge-back"));
    await waitFor(() => expect(router.getPathname()).toBe("/pos"));

    let txid = "";
    await act(async () => {
      txid = mempool.pay(taprootAddress(1), 2_882n);
    });
    await act(async () => mempool.mine(3));
    await act(async () => jest.advanceTimersByTimeAsync(SALES_FOLLOW_INTERVAL_MS));
    for (let second = 0; (await loadFollowedSales()).length > 0 && second < 60; second += 1) {
      await act(async () => jest.advanceTimersByTimeAsync(1000));
    }
    expect(await loadFollowedSales()).toEqual([]);
    const sales = (await fetchSales(DEVICE_KEYS, 0, DEFAULT_RELAYS)) ?? [];
    expect(sales.filter((sale) => sale.paidAt !== null)).toHaveLength(1);
    // Its transaction declared in the registry, marked as one of the owner's devices' sale.
    const read = await ownerOnchainPaymentsOf(
      { key: BUSINESS.key, reader: deriveRegistryReader(TEAM) },
      [txid],
      "bc",
      { relays: DEFAULT_RELAYS }
    );
    expect(read?.declared.get(txid)).toEqual([
      expect.objectContaining({
        address: taprootAddress(1),
        fiat: { minor: 200, digits: 2, currency: "CHF" },
        taker: expect.stringMatching(/^[0-9a-f]{32}$/)
      })
    ]);
  });

  // Last of the file: the router unmounted by hand leaves the next one's test store unusable.
  it("is recorded paid by the app started again, from what the device kept", async () => {
    lnurlService();
    const router = await renderRouter(routes, { initialUrl: "/" });
    await waitFor(() => expect(router.getPathname()).toBe("/pos"));
    for (const key of ["2", "0", "0"]) await fireEvent.press(screen.getByTestId(`key-${key}`));
    await fireEvent.press(screen.getByTestId("charge"));
    expect(await screen.findByText("Waiting for the payment")).toBeTruthy();
    await act(async () => {
      mempool.pay(taprootAddress(1), 1_500n);
    });
    expect(await screen.findByText("Left to pay")).toBeTruthy();
    await act(async () => {
      mempool.pay(taprootAddress(1), 1_382n);
    });
    expect(await screen.findByText("Confirming")).toBeTruthy();
    expect(await loadFollowedSales()).toHaveLength(1);

    // Reloaded: nothing is left of the app but what the device kept. It starts again with its
    // follower of sales (AppLayout), without the sale (PosProvider) nor its screen.
    await act(async () => expoRouter.dismissTo("/pos"));
    const shown = await router;
    await act(async () => shown.unmount());
    resetFollowedMarks();
    const profile = await loadTerminalProfile();
    await render(<SalesFollower profile={profile!} />);

    await act(async () => mempool.mine(3));
    await act(async () => jest.advanceTimersByTimeAsync(SALES_FOLLOW_INTERVAL_MS));
    for (let second = 0; (await loadFollowedSales()).length > 0 && second < 60; second += 1) {
      await act(async () => jest.advanceTimersByTimeAsync(1000));
    }
    expect(await loadFollowedSales()).toEqual([]);
    const sales = (await fetchSales(DEVICE_KEYS, 0, DEFAULT_RELAYS)) ?? [];
    expect(sales.filter((sale) => sale.paidAt !== null)).toEqual([
      expect.objectContaining({ fiat: { minor: 200, digits: 2, currency: "CHF" } })
    ]);
  });
});
