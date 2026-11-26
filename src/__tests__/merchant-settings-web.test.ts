import type { MerchantSettings } from "@/lib/settings/merchant";
import { DEFAULT_RELAYS } from "@/config/relays";
import { loadMerchantSettings, saveMerchantSettings } from "@/lib/settings/store.web";

// Same wallets and settings as merchant-settings.test.ts.
const WALLET = "02c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5";
const OTHER_WALLET = "02f9308a019258c31049344f85f89d5229b531c845836f99b08601f113bce036f9";

const allBitcoin: MerchantSettings = {
  version: 18,
  recoveryCheck: { verifiedAt: null, dueSince: null },
  bitcoinNode: null,
  productLookup: true,
  splitSince: 1790000000,
  legacyTransfers: [],
  businessAddress: null,
  companyNumber: "",
  vatNumber: "",
  vatRate: null,
  onchainTolerance: 0,
  formerAddressMetadata: [],
  updatedAt: 1790000000,
  signUp: "done",
  businessName: "Merchant 9EE5",
  usage: "merchant",
  bitcoinPercent: 100,
  payoutCurrency: "CHF",
  displayCurrency: "CHF",
  detectedCountry: "CH",
  payoutAccountId: null,
  onchainPayments: true,
  relays: [...DEFAULT_RELAYS],
  devices: [],
  logo: null
};

const halfFiat: MerchantSettings = {
  ...allBitcoin,
  bitcoinPercent: 50,
  // Mt Pelerin's id of the bank account: its details are never kept (format 18).
  payoutAccountId: "64a0c0de0000000000000004"
};

// The browser's localStorage, which Jest does not have.
const entries = new Map<string, string>();

beforeAll(() => {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => void entries.set(key, String(value))
    }
  });
});

afterAll(() => {
  delete (globalThis as { localStorage?: unknown }).localStorage;
});

beforeEach(() => entries.clear());

describe("merchant settings store on the web", () => {
  it("keeps one entry per wallet in the browser, and reads it back", async () => {
    await saveMerchantSettings(WALLET.toUpperCase(), halfFiat);

    expect([...entries.keys()]).toEqual([`merchant-settings/${WALLET}`]);
    await expect(loadMerchantSettings(WALLET)).resolves.toEqual(halfFiat);
    // Another account in the same browser sees nothing.
    await expect(loadMerchantSettings(OTHER_WALLET)).resolves.toBeNull();
  });

  it("replaces the previous settings of the wallet", async () => {
    await saveMerchantSettings(WALLET, halfFiat);
    await saveMerchantSettings(WALLET, allBitcoin);

    await expect(loadMerchantSettings(WALLET)).resolves.toEqual(allBitcoin);
    expect(entries.size).toBe(1);
  });

  it("never writes invalid settings", async () => {
    await expect(
      // A bank account at 100 % bitcoin.
      saveMerchantSettings(WALLET, { ...allBitcoin, payoutAccountId: "64a0c0de0000000000000004" })
    ).rejects.toThrow(/Invalid merchant settings/);
    expect(entries.size).toBe(0);
  });

  it("only takes hex wallet ids", async () => {
    await expect(saveMerchantSettings("../settings", allBitcoin)).rejects.toThrow(/wallet id/);
    await expect(loadMerchantSettings("")).rejects.toThrow(/wallet id/);
  });

  it("rejects an entry it cannot trust", async () => {
    entries.set(`merchant-settings/${WALLET}`, JSON.stringify({ version: 2 }));

    await expect(loadMerchantSettings(WALLET)).rejects.toThrow(/Unexpected merchant settings/);
  });

  it("rejects an entry of an older format: none is converted", async () => {
    entries.set(`merchant-settings/${WALLET}`, JSON.stringify({ ...allBitcoin, version: 11 }));

    await expect(loadMerchantSettings(WALLET)).rejects.toThrow(/Unexpected merchant settings/);
  });
});
