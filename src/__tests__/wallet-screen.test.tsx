import "@/i18n";

import { DEFAULT_RELAYS } from "@/config/relays";
import { router } from "expo-router";
import { act, fireEvent, renderRouter, screen, waitFor, within } from "expo-router/testing-library";

import AppLayout from "@/app/(app)/_layout";
import SettingsScreen from "@/app/(app)/settings";
import SettingsLayout from "@/app/(app)/settings/_layout";
import AmountScreen from "@/app/(app)/pos/index";
import PosLayout from "@/app/(app)/pos/_layout";
import WalletRoute from "@/app/(app)/wallet";
import WalletLayout from "@/app/(app)/wallet/_layout";
import LaunchScreen from "@/app/index";
import PaymentLinkScreen from "@/app/pay";
import * as Clipboard from "expo-clipboard";
import { StyleSheet } from "react-native";

import { bytesToHex } from "@noble/hashes/utils.js";

import { closeAccount, getAccountWalletId } from "@/features/account/session";
import { rememberImage } from "@/features/media/images";
import { AUTO_LOCK_AFTER_MS } from "@/features/navigation/auto-lock";
import { DISCREET_STORE_KEY, parseStoredDiscreet } from "@/features/wallet/discreet-format";
import { saveDiscreet } from "@/features/wallet/discreet-store";
import { FOLLOW_FOR_MS, FOLLOW_INTERVAL_MS } from "@/features/wallet/send/useSend";
import { WALLET_SYNC_LATE_MS } from "@/features/wallet/useWalletData";
import { getTerminalProfile, publishTerminalProfile } from "@/features/terminal/profile-cache";
import { idleMs } from "@/lib/activity";
import { PasskeyError } from "@/lib/breez/errors";
import { walletSecret } from "@/lib/breez/seed";
import { deriveIntegrationKeys } from "@/lib/integrations/keys";
import { lateAcceptanceAddress } from "@/lib/integrations/late-acceptance";
import { orderAcceptanceEvent } from "@/lib/integrations/onchain-acceptance";
import { decodeBolt11 } from "@/lib/lightning/bolt11";
import { mtpSaleEvent, mtpSaleRecordOf } from "@/lib/mtpelerin/sale-record";
import { createPaymentLink, publishPaymentLink } from "@/lib/payment-link/link";
import {
  SATS_CURRENCY,
  declareInvoice,
  deriveSaleKeys,
  saleRegistry,
  takerTag
} from "@/lib/registry/registry";
import { signInWithPasskey } from "@/lib/breez/passkey";
import * as deviceLocale from "@/lib/locale/device";
import * as relativeDay from "@/lib/locale/relative-day";
import { getDeviceLocale } from "@/lib/locale/device";
import type { MerchantSettings } from "@/lib/settings/merchant";
import { createImage } from "@/lib/media/image";
import { saveMerchantSettings } from "@/lib/settings/store";
import { formatFiat } from "@/lib/terminal/amount";
import { formatInteger } from "@/lib/locale/format";
import { saveAmountUnit } from "@/features/settings/amount-unit";
import { markNotificationsOffered } from "@/features/notification-offer/offer";
import {
  deriveBusinessRegistry,
  deriveLateAcceptanceKeys,
  deriveMemberKeys,
  deriveMtpSaleKeys,
  deriveTeamKeys,
  integrationSecretKey,
  memberSecret,
  memberTakerKey,
  ownerDevicesSecret,
  ownerTakerKey
} from "@/lib/team/keys";
import {
  linkEvent,
  profileEvent,
  publishMemberRecord,
  saleEvent,
  saleTxEvent,
  type MemberSale
} from "@/lib/team/member-records";
import type { TeamMember } from "@/lib/team/roster";
import { saveTerminalProfile } from "@/lib/terminal/profile";
import { witnessEvent } from "@/lib/integrations/onchain-witness";
import { publishToRelays } from "@/lib/nostr/pool";
import { leaseEvent } from "@/lib/registry/onchain";
import { onchainPaymentEvent } from "@/lib/registry/onchain-payments";
import { saleAcceptanceAddress } from "@/lib/registry/sale-acceptance";
import { pointHourOf } from "@/lib/rates/sources";
import { lightColors as colors, control, type } from "@/theme";

import { TEST_WALLET_ID, testBackupKey, testSeed } from "../../jest/account";
import { coingecko, setCoingeckoPrice } from "../../jest/coingecko";
import { taprootAddress } from "../../jest/bitcoin";
import { encodeLnurl, makeInvoice, preimagePair } from "../../jest/lightning";
import { publishIntegration, publishMember, publishRemoved } from "../../jest/roster";
import type * as BreezFake from "../../jest/breez-sdk";
import type * as MempoolFake from "../../jest/mempool";
import type * as SecureStoreFake from "../../jest/expo-secure-store";
import type * as RelaysFake from "../../jest/nostr-relays";

jest.mock("../lib/breez/config", () => ({
  ...jest.requireActual("../lib/breez/config"),
  getWalletConfig: () => ({ network: "mainnet", apiKey: "test-api-key" }),
  // As the app config under Jest (none) unless a test sets it: with a network, the unlock also
  // fills the point of sale's on-chain addresses (another connection of the wallet).
  getBreezNetwork: () => mockNetwork()
}));
const mockNetwork = jest.fn((): string => {
  throw new Error("No network in the app config under Jest");
});
// The passkey prompt is the test's; the wallet layer is the real one, over the fake SDK.
jest.mock("../lib/breez/passkey", () => ({
  createPasskeyWallet: jest.fn(),
  preparePasskeys: jest.fn(async () => undefined),
  passkeysReady: jest.fn(() => true),
  signInWithPasskey: jest.fn()
}));
// 1 BTC = 100 000 CHF: 1 sat = 0.1 cent. Undefined: a rate outage. setMockRate also renders the
// hooks that read it again, as a rate refreshed (or turned stale) does.
let mockRate: number | undefined = 100000;
const mockRateListeners = new Set<() => void>();
function setMockRate(rate: number | undefined) {
  mockRate = rate;
  for (const listener of mockRateListeners) listener();
}
jest.mock("../features/terminal/useRate", () => {
  const { useEffect, useReducer } = jest.requireActual<typeof import("react")>("react");
  return {
    useRate: () => {
      const [, rerender] = useReducer((n: number) => n + 1, 0);
      useEffect(() => {
        mockRateListeners.add(rerender);
        return () => {
          mockRateListeners.delete(rerender);
        };
      }, []);
      return { rate: mockRate, loading: false, current: () => mockRate };
    }
  };
});
jest.mock("expo-clipboard", () => ({
  getStringAsync: jest.fn(),
  setStringAsync: jest.fn(async () => true)
}));
// The staging web app receives the payment links (the app config has no variant under Jest).
jest.mock("../config/payment-links", () => ({
  ...jest.requireActual("../config/payment-links"),
  getPaymentLinkOrigin: () => "https://web.example"
}));
// The camera: a view that hands the test's QR code over as soon as it is shown.
let mockScanned = "";
jest.mock("expo-camera", () => {
  const { useEffect } = jest.requireActual<typeof import("react")>("react");
  return {
    useCameraPermissions: () => [{ granted: true, canAskAgain: true }, jest.fn()],
    CameraView: ({ onBarcodeScanned }: { onBarcodeScanned: (r: { data: string }) => void }) => {
      useEffect(() => {
        onBarcodeScanned({ data: mockScanned });
        onBarcodeScanned({ data: mockScanned });
      }, [onBarcodeScanned]);
      return null;
    }
  };
});
const mockDesktop = jest.fn(() => false);
jest.mock("@/components/layout/useIsDesktop", () => ({
  ...jest.requireActual("@/components/layout/useIsDesktop"),
  useIsDesktop: () => mockDesktop()
}));

const signIn = jest.mocked(signInWithPasskey);
const relays = jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");
const sdk = jest.requireMock<typeof BreezFake>("@breeztech/breez-sdk-spark-react-native");
const mempool = jest.requireMock<typeof MempoolFake>("../lib/onchain/esplora");
const secureStore = jest.requireMock<typeof SecureStoreFake>("expo-secure-store");
/** "Discreet" as saved on the device (discreet-store.ts). */
const storedDiscreet = () => parseStoredDiscreet(secureStore.items.get(DISCREET_STORE_KEY) ?? null);

const settings: MerchantSettings = {
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
  businessName: "Fine Bakery",
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

const routes = {
  index: LaunchScreen,
  "(app)/_layout": AppLayout,
  "(app)/pos/_layout": PosLayout,
  "(app)/pos/index": AmountScreen,
  "(app)/settings/_layout": SettingsLayout,
  "(app)/settings/index": SettingsScreen,
  "(app)/wallet/_layout": WalletLayout,
  "(app)/wallet/index": WalletRoute,
  pay: PaymentLinkScreen
};

/** "18'420 sats" in the test device's locale. */
function satsOf(sats: number, sign = ""): string {
  return `${sign}${formatInteger(BigInt(sats), getDeviceLocale().languageTag)} sats`;
}

/** "1'234.50 CHF" in the test device's locale, from cents. */
function chf(cents: number, sign = ""): string {
  return `${sign}${formatFiat(cents, 2, getDeviceLocale().languageTag)} CHF`;
}

/**
 * Now minus `minutes`, in Unix seconds: today's payments, the newest first. Just after midnight,
 * they stay today (a few seconds after it), in the same order.
 */
const minutesAgo = (minutes: number) => {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 1000;
  return Math.max(Math.floor(now.getTime() / 1000) - minutes * 60, startOfDay + 10 - minutes);
};

function fillWallet() {
  sdk.fakeWallet.balanceSats = BigInt(1284530);
  sdk.fakeWallet.payments = [
    {
      id: "p1",
      paymentType: sdk.PaymentType.Receive,
      status: sdk.PaymentStatus.Completed,
      amount: BigInt(18420),
      fees: BigInt(0),
      timestamp: BigInt(minutesAgo(1)),
      method: sdk.PaymentMethod.Lightning,
      details: {
        tag: sdk.PaymentDetails_Tags.Lightning,
        inner: {
          description: "Till B",
          invoice: "lnbc1",
          destinationPubkey: "02ab",
          htlcDetails: { paymentHash: "7f2c04b1aaaaaaaaaaaae91a" }
        }
      }
    },
    {
      id: "p2",
      paymentType: sdk.PaymentType.Send,
      status: sdk.PaymentStatus.Completed,
      amount: BigInt(150000),
      fees: BigInt(12),
      timestamp: BigInt(minutesAgo(2)),
      method: sdk.PaymentMethod.Lightning,
      details: {
        tag: sdk.PaymentDetails_Tags.Lightning,
        inner: {
          description: undefined,
          invoice: "lnbc2",
          destinationPubkey: "02cd",
          htlcDetails: { paymentHash: "a3f91c07bbbbbbbbbbbb7c21" },
          lnurlPayInfo: { lnAddress: "bakehouse@wallet.example" }
        }
      }
    },
    {
      id: "p3",
      paymentType: sdk.PaymentType.Send,
      status: sdk.PaymentStatus.Pending,
      amount: BigInt(400000),
      fees: BigInt(1840),
      timestamp: BigInt(minutesAgo(3)),
      method: sdk.PaymentMethod.Withdraw,
      details: { tag: sdk.PaymentDetails_Tags.Withdraw, inner: { txId: "8e2d6b3acccccccc41fa" } }
    }
  ];
}

/**
 * 1 BTC = 100 000 CHF at each hour of the last ten days, as CoinGecko publishes it: the rate
 * "Wallet" records at each payment done (payment-rates.ts), which values its transfers.
 */
function priceTheLastDays(price = 100_000) {
  const last = pointHourOf(Math.floor(Date.now() / 1000));
  for (let hour = last - 10 * 24 * 3600; hour <= last; hour += 3600) {
    setCoingeckoPrice("CHF", hour, price);
  }
}

/** The app of a prepared device, unlocked, then on the wallet screen. */
async function openWalletScreen() {
  await saveTerminalProfile({
    version: 2,
    walletId: TEST_WALLET_ID,
    backupKey: testBackupKey(),
    lightningAddress: "sattleme02c6047f94@breez.tips",
    businessName: "Fine Bakery",
    currency: "CHF"
  });
  const router = await renderRouter(routes, { initialUrl: "/" });
  await waitFor(() => expect(router.getPathname()).toBe("/pos"));
  // Desktop: the locked row, whose screen shows once unlocked; mobile: the dock's padlock, then
  // its slot.
  await fireEvent.press(screen.getByTestId(mockDesktop() ? "sidebar-wallet" : "dock-unlock"));
  await waitFor(() => expect(getAccountWalletId()).toBe(TEST_WALLET_ID));
  if (!mockDesktop()) await fireEvent.press(await screen.findByLabelText("Wallet"));
  await waitFor(() => expect(router.getPathname()).toBe("/wallet"));
  return { router };
}

/**
 * Two payment links Erin Grant, an employee, shared: one still payable ("Bastion Coffee"), one
 * whose sale ended without anything received ("Table 3", expired). `withOpen` false: the expired
 * one only.
 */
async function publishErinLinks(withOpen = true) {
  mockNetwork.mockReturnValue("mainnet");
  const team = deriveTeamKeys(walletSecret(testSeed()));
  const MEMBER = "0123456789abcdef0123456789abcdef";
  await publishMember(team, {
    id: MEMBER,
    name: "Erin Grant",
    role: "employee",
    invitedAt: 1789990000
  });
  const keys = deriveMemberKeys(memberSecret(team, MEMBER));
  const registry = deriveBusinessRegistry(team);
  const now = Math.floor(Date.now() / 1000);
  const share = async (fill: number, note: string, createdAt: number, endsAt: number) => {
    const saleKey = new Uint8Array(32).fill(fill);
    const link = createPaymentLink(
      {
        version: 3,
        businessName: "Fine Bakery",
        lightningAddress: "sattleme02c6047f94@breez.tips",
        fiat: { minor: 4200, digits: 2, currency: "CHF" },
        note,
        onchainAddress: null,
        endsAt,
        registryKey: bytesToHex(registry.key),
        registryReader: registry.reader,
        owner: registry.owner
      },
      "https://web.example",
      createdAt,
      saleKey
    );
    await publishPaymentLink(link);
    await publishMemberRecord(
      keys,
      linkEvent(keys, {
        version: 1,
        link: link.id,
        saleKey: bytesToHex(saleKey),
        createdAt,
        onchainTag: null,
        relays: [...link.relays],
        sealedKey: "A".repeat(200)
      })
    );
    return link;
  };
  const open = withOpen ? await share(8, "Bastion Coffee", now - 60, now + 3600) : null;
  const expired = await share(9, "Table 3", now - 1200, now - 600);
  return { open, expired };
}

/** Font Awesome's clock (Icon.tsx, `clock-regular`). */
const CLOCK = String.fromCodePoint(0xf017);

/**
 * An order of the integration "Online shop" paid on-chain (1 500 sats, "CMD-2001"): its
 * server leased an address of its lot and saw it paid (its witness); the wallet holds the deposit
 * at 3 confirmations, its claim refused for its fee. The row of its sale.
 */
async function payIntegrationOrderOnchain() {
  mockNetwork.mockReturnValue("mainnet");
  const team = deriveTeamKeys(walletSecret(testSeed()));
  const now = Math.floor(Date.now() / 1000);
  const INTEGRATION = "00112233445566778899aabbccddeeff";
  await publishIntegration(team, {
    id: INTEGRATION,
    name: "Online shop",
    createdAt: now - 86_400,
    platform: "node"
  });
  // Its server leased an address of its lot for the order, then saw it paid (its witness).
  const integrationKey = integrationSecretKey(team, INTEGRATION);
  const keys = deriveIntegrationKeys(integrationKey);
  const sale = saleRegistry(deriveBusinessRegistry(team), new Uint8Array(32).fill(9));
  const order = { ...sale, taker: takerTag(keys.takerKey, sale.saleKeys.nostr.publicKey) };
  const address = taprootAddress(4);
  const TX = "9c".repeat(32);
  await publishToRelays(
    leaseEvent(
      order,
      {
        address,
        sats: 1500n,
        invoice: null,
        createdAt: now - 3600,
        expiresAt: now - 1800,
        confirmed: true
      },
      { fiat: { minor: 150, digits: 2, currency: "CHF" }, note: "CMD-2001" },
      now - 3600
    ),
    { relays: DEFAULT_RELAYS, channel: "anonymous", timeoutMs: 1000 }
  );
  const PAID_AT = now - 3000;
  await publishToRelays(
    witnessEvent(
      keys,
      {
        address,
        txid: TX,
        sale: sale.saleKeys.nostr.publicKey,
        sats: 1500n,
        inputs: [],
        replacement: false,
        expiresAt: now - 1800
      },
      PAID_AT
    ),
    {
      relays: DEFAULT_RELAYS,
      channel: "anonymous",
      timeoutMs: 1000,
      authKey: keys.seen.nostr.secretKey
    }
  );
  // 3 confirmations, its claim refused: the provider asked more than the app pays (300 sats).
  sdk.fakeWallet.unclaimedDeposits = [
    {
      txid: TX,
      vout: 0,
      amountSats: BigInt(1500),
      isMature: true,
      claimError: {
        tag: sdk.DepositClaimError_Tags.MaxDepositClaimFeeExceeded,
        inner: { tx: TX, vout: 0, requiredFeeSats: BigInt(450) }
      }
    }
  ];

  return { rowId: `sale:${sale.saleKeys.nostr.publicKey}` };
}

jest.setTimeout(20_000);

// "Stay informed" answered on this device, as on any past its first opening: its panel would
// cover this file's screens (notifications-offer.test.tsx tests it).
beforeEach(async () => {
  await markNotificationsOffered(0);
});

describe("wallet screen", () => {
  beforeEach(async () => {
    mockNetwork.mockReset().mockImplementation(() => {
      throw new Error("No network in the app config under Jest");
    });
    closeAccount();
    relays.resetRelays();
    mockDesktop.mockReturnValue(false);
    mockRate = 100000;
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    signIn.mockReset().mockResolvedValue({ seed: testSeed(), credentialId: null });
    sdk.connect.mockClear();
    await saveMerchantSettings(TEST_WALLET_ID, settings);
    fillWallet();
    priceTheLastDays();
  });

  it("tells each row's fold from its top, whatever the row read before", async () => {
    await openWalletScreen();
    const fold = async (rowId: string, content: number, scrolled: number) => {
      await fireEvent.press(await screen.findByTestId(rowId));
      const sheet = within(await screen.findByTestId("activity-detail-sheet"));
      const scroll = sheet.getByTestId("activity-detail");
      await fireEvent(scroll, "layout", {
        nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 500 } }
      });
      await fireEvent(scroll, "contentSizeChange", 390, content);
      const shown = sheet.queryByTestId("activity-detail-more") !== null;
      if (scrolled > 0) {
        await fireEvent.scroll(scroll, {
          nativeEvent: {
            contentOffset: { x: 0, y: scrolled },
            contentSize: { width: 390, height: content },
            layoutMeasurement: { width: 390, height: 500 }
          }
        });
      }
      await fireEvent.press(screen.getByRole("button", { name: "Close" }));
      await waitFor(() => expect(screen.queryByTestId("activity-detail-sheet")).toBeNull());
      return shown;
    };
    // A long row read to its end, then another: the next opens at its top, its fold told.
    expect(await fold("activity-row-payment:p2", 900, 400)).toBe(true);
    expect(await fold("activity-row-payment:p1", 800, 0)).toBe(true);
    // A row that fits: no fade.
    expect(await fold("activity-row-payment:p2", 480, 0)).toBe(false);
  });

  it("shows a sale to Mt Pelerin as such, with what it kept of the sale", async () => {
    // "Sell" checks Mt Pelerin's invoices against this build's network (mainnet).
    mockNetwork.mockReturnValue("mainnet");
    // "Sell" paid Mt Pelerin's invoice (its memo Mt Pelerin's), its record written before.
    const saleHash = "5d".repeat(32);
    const [, sent, ...rest] = sdk.fakeWallet.payments;
    const details = sent.details as { tag: string; inner: Record<string, unknown> };
    sdk.fakeWallet.payments = [
      sdk.fakeWallet.payments[0],
      {
        ...sent,
        details: {
          ...details,
          inner: {
            ...details.inner,
            description: "1.2 CHF for 64a0c0de0000000000000006",
            htlcDetails: { paymentHash: saleHash },
            lnurlPayInfo: undefined
          }
        }
      },
      ...rest
    ];
    const team = deriveTeamKeys(walletSecret(testSeed()));
    const sale = mtpSaleRecordOf({
      order: {
        id: "64a0c0de0000000000000006",
        shortId: "X7K2P9",
        status: "validated",
        sourceCurrency: "sat",
        sourceAmount: { units: 150_000n, scale: 0 },
        destCurrency: "CHF",
        destAmount: { units: 14_765n, scale: 2 },
        expiresAt: minutesAgo(2) + 3600,
        rate: { units: 99_000n, scale: 8 },
        beneficiaryId: "acc-1",
        invoice: "lnbc2",
        estimate: {
          sourceAmount: { units: 150_000n, scale: 0 },
          fees: { total: { units: 1_350n, scale: 0 }, currency: "sat" }
        }
      },
      account: {
        kind: "bank",
        id: "acc-1",
        status: "active",
        iban: "CH9300762011623852957",
        currency: "CHF",
        label: null,
        owner: {
          name: { kind: "company", name: "Fine Bakery LLC" },
          street: null,
          postcode: null,
          city: null,
          country: "CH"
        }
      },
      sats: 150_000n,
      paymentHash: saleHash,
      deferred: true,
      transferFeeMinor: 0,
      reference: "SATTLE SALE 16-11",
      oid: "sattle-split-1:1763290000",
      at: minutesAgo(2) - 5
    });
    const keys = deriveMtpSaleKeys(team);
    await publishToRelays(mtpSaleEvent(keys, sale), {
      relays: DEFAULT_RELAYS,
      channel: "account",
      timeoutMs: 1000,
      authKey: keys.nostr.secretKey
    });

    await openWalletScreen();
    const row = await screen.findByTestId("activity-row-payment:p2");
    // Its currency, not Mt Pelerin's memo.
    expect(await within(row).findByText("Sale in CHF")).toBeTruthy();
    expect(within(row).queryByText(/6ae08d6e/)).toBeNull();
    await fireEvent.press(row);
    const detail = within(await screen.findByTestId("activity-detail-sheet"));
    // "Sent" over its title, as any sending's details.
    expect(detail.getByRole("header", { name: "Sent" })).toBeTruthy();
    expect(detail.getByText("Sale in CHF")).toBeTruthy();
    expect(detail.queryByText(/6ae08d6e/)).toBeNull();
    const languageTag = getDeviceLocale().languageTag;
    // What Mt Pelerin wires, its rate for 1 BTC, its fees in sats and at its rate, the account.
    expect(detail.getByText("You receive")).toBeTruthy();
    expect(detail.getByTestId("activity-sale-received")).toHaveTextContent(
      `${formatFiat(14765, 2, languageTag)} CHF`
    );
    expect(detail.getByTestId("activity-sale-rate")).toHaveTextContent(
      `1 BTC = ${formatInteger(99_000n, languageTag)} CHF`
    );
    expect(detail.getByTestId("activity-sale-fee")).toHaveTextContent(
      `${formatFiat(134, 2, languageTag)} CHF · ${formatInteger(1350n, languageTag)} sats`
    );
    // In its own section. A deferred sale names no account: it is wired later, to the account as
    // it is then.
    expect(detail.getByRole("header", { name: "Sale" })).toBeTruthy();
    expect(detail.queryByTestId("activity-sale-account")).toBeNull();
    expect(detail.queryByText(/CH93/)).toBeNull();
    // "Deferred", and what it means.
    expect(detail.getByTestId("activity-sale-transfer")).toHaveTextContent("Deferred");
    expect(detail.getByTestId("activity-sale-transfer-detail")).toHaveTextContent(
      `In a grouped transfer with your other sales, from ${formatFiat(5_000, 2, languageTag)} CHF`
    );
    // "Sending fees" for what the wallet paid on top.
    expect(detail.getByText("Sending fees")).toBeTruthy();

    // Its fold told: a fade at the bottom while more of the
    // details is below, gone once their end is in sight.
    const scroll = detail.getByTestId("activity-detail");
    expect(detail.queryByTestId("activity-detail-more")).toBeNull();
    await fireEvent(scroll, "layout", {
      nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 500 } }
    });
    await fireEvent(scroll, "contentSizeChange", 390, 900);
    expect(detail.getByTestId("activity-detail-more")).toBeTruthy();
    await fireEvent.scroll(scroll, {
      nativeEvent: {
        contentOffset: { x: 0, y: 400 },
        contentSize: { width: 390, height: 900 },
        layoutMeasurement: { width: 390, height: 500 }
      }
    });
    expect(detail.queryByTestId("activity-detail-more")).toBeNull();

    // "Track the sale", under the order's number: the details close, "Sell" opens.
    const follow = detail.getByRole("button", { name: "Order X7K2P9, track the sale" });
    expect(within(follow).getByTestId("activity-sale-order")).toHaveTextContent("X7K2P9");
    expect(within(follow).getByText("Track the sale")).toBeTruthy();
    await fireEvent.press(follow);
    await waitFor(() => expect(screen.queryByTestId("activity-detail-sheet")).toBeNull());
    expect(await screen.findByTestId("sell-sheet")).toBeTruthy();
  });

  it('opens on arrival without the passkey, then shows the balance, "To follow up" and the movements', async () => {
    await openWalletScreen();

    // 1 284 530 sats at 100 000 CHF = 1 284.53 CHF.
    expect(
      await screen.findByText(formatFiat(128453, 2, getDeviceLocale().languageTag))
    ).toBeTruthy();
    // The unlock's passkey only: the wallet connects with the open account's seed.
    expect(signIn).toHaveBeenCalledTimes(1);
    expect(sdk.connect).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Balance")).toBeTruthy();
    // Nothing waits to be credited: no line under the balance.
    expect(screen.queryByTestId("wallet-pending-balance")).toBeNull();
    // No totals of the last 30 days: each amount is its row's. A transfer's at the rate
    // recorded at its payment, once read (payment-rates.ts).
    expect(await screen.findAllByText(chf(1842))).toHaveLength(1);
    expect(screen.getAllByText(chf(15000, "−"))).toHaveLength(1);
    expect(screen.getByText("Send")).toBeTruthy();

    // "To follow up": the withdrawal being confirmed (400 000 sats = 400.00 CHF); nothing open.
    expect(screen.getByText("To follow up")).toBeTruthy();
    const confirming = screen.getByTestId("activity-follow-up-unconfirmed");
    expect(within(confirming).getByText("1")).toBeTruthy();
    expect(within(confirming).getByText(chf(40000))).toBeTruthy();
    // Only the states that have a row: no tile counting 0.
    expect(screen.queryByTestId("activity-follow-up-open")).toBeNull();
    expect(screen.queryByTestId("activity-follow-up-underpaid")).toBeNull();

    expect(screen.getByText("Transactions")).toBeTruthy();
    expect(screen.getByText("Today")).toBeTruthy();
    expect(screen.getByText("Till B")).toBeTruthy();
    expect(screen.getByText("bakehouse@wallet.example")).toBeTruthy();
    expect(screen.getByText("Withdrawal")).toBeTruthy();
    // Its state in "To follow up", and on its row after its time, in the state's colour.
    expect(screen.getAllByText("Confirming")).toHaveLength(1);
    const withdrawal = screen.getByTestId("activity-row-payment:p3");
    expect(within(withdrawal).getByText(/^\d{2}:\d{2} · Confirming$/)).toHaveStyle({
      color: colors.state.unconfirmed.fg
    });
    expect(screen.getByText(chf(40000, "−"))).toBeTruthy();
    expect(screen.getByText(/· Lightning receipt$/)).toBeTruthy();
    expect(screen.getByText(/· Lightning address$/)).toBeTruthy();
  });

  it("shows a payment received as soon as the SDK tells it, and stops listening once left", async () => {
    await openWalletScreen();
    expect(await screen.findByText("Till B")).toBeTruthy();
    // The screen listens to the account's wallet (besides the wallet layer's own listener).
    await waitFor(() => expect(sdk.sdkListenerCount(sdk.fakeWallet)).toBe(1));

    // Received now: the SDK stores it and its balance, then tells it (utils/payments.rs, 0.28.4).
    const received = {
      ...sdk.fakeWallet.payments[0]!,
      id: "p-received",
      amount: BigInt(2500),
      timestamp: BigInt(Math.floor(Date.now() / 1000)),
      details: {
        tag: sdk.PaymentDetails_Tags.Lightning,
        inner: {
          description: "Table 7",
          invoice: "lnbc7",
          destinationPubkey: "02ef",
          htlcDetails: { paymentHash: "c4d2e8f0cccccccccccc0a17" }
        }
      }
    };
    sdk.fakeWallet.payments = [received, ...sdk.fakeWallet.payments];
    sdk.fakeWallet.balanceSats += BigInt(2500);
    await act(() => sdk.emitSdkEvent(sdk.fakeWallet, sdk.SdkEvent_Tags.PaymentSucceeded, received));
    // Within waitFor's own second, far from any timer's 15 s.
    expect(await screen.findByText("Table 7")).toBeTruthy();
    // 1 287 030 sats at 100 000 CHF = 1 287.03 CHF.
    expect(
      await screen.findByText(formatFiat(128703, 2, getDeviceLocale().languageTag))
    ).toBeTruthy();

    await act(() => router.push("/pos"));
    await waitFor(() => expect(sdk.sdkListenerCount(sdk.fakeWallet)).toBe(0));
  });

  it("writes the days in the device locale, not the app's language", async () => {
    // A device in German (Switzerland) with the app in English: the day's title is German, as the
    // times and the desktop table's dates, today's word the device's own (its native module,
    // absent from Jest: given here as ICU writes it). A row's details write its date and time in
    // one German sentence, never with the app's "at" between them.
    const locale = jest
      .spyOn(deviceLocale, "getDeviceLocale")
      .mockReturnValue({ ...getDeviceLocale(), languageTag: "de-CH" });
    const words = jest
      .spyOn(relativeDay, "relativeDayWord")
      .mockImplementation((languageTag, offset) =>
        languageTag === "de-CH" ? (offset === 0 ? "Heute" : "Gestern") : null
      );
    try {
      sdk.fakeWallet.payments = [
        ...sdk.fakeWallet.payments,
        {
          ...sdk.fakeWallet.payments[0],
          id: "p4",
          timestamp: BigInt(Math.floor(Date.now() / 1000) - 5 * 86400),
          details: {
            tag: sdk.PaymentDetails_Tags.Lightning,
            inner: {
              description: "Till C",
              invoice: "lnbc4",
              destinationPubkey: "02ef",
              htlcDetails: { paymentHash: "c4d2e8f1dddddddddddd03b7" }
            }
          }
        }
      ];
      await openWalletScreen();
      await screen.findByText("Heute");
      expect(screen.queryByText("Today")).toBeNull();
      expect(
        screen.getByText(
          /^(Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonntag), \d{1,2}\. /
        )
      ).toBeTruthy();
      expect(
        screen.queryByText(/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),? /)
      ).toBeNull();

      await fireEvent.press(screen.getByTestId("activity-row-payment:p4"));
      expect(
        await screen.findByText(
          /^(Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonntag), \d{1,2}\. \S+( \d{4})? um \d{2}:\d{2}$/
        )
      ).toBeTruthy();
      expect(screen.queryByText(/ at \d{2}:\d{2}$/)).toBeNull();
    } finally {
      locale.mockRestore();
      words.mockRestore();
    }
  });

  it('keeps the movements to the state chosen in "To follow up", then shows them all again', async () => {
    await openWalletScreen();
    await screen.findByText("Till B");

    await fireEvent.press(screen.getByTestId("activity-follow-up-unconfirmed"));
    // The list's title gives way to the state chosen, which shows everything again.
    expect(screen.getByLabelText("Confirming, clear the filter")).toBeTruthy();
    expect(screen.getByTestId("activity-row-payment:p3")).toBeTruthy();
    // The other rows fold away, out of reach.
    expect(screen.queryByTestId("activity-row-payment:p1")).toBeNull();
    expect(screen.queryByTestId("activity-row-payment:p2")).toBeNull();

    await fireEvent.press(screen.getByTestId("activity-clear-filter"));
    expect(await screen.findByTestId("activity-row-payment:p1")).toBeTruthy();
    expect(screen.getByTestId("activity-row-payment:p2")).toBeTruthy();
  });

  it("leaves expired invoices out of the list until shown, then hides them again", async () => {
    const { open, expired } = await publishErinLinks();
    if (!open) throw new Error("no open link");
    await openWalletScreen();
    expect(await screen.findByTestId(`activity-row-link:${open.id}`)).toBeTruthy();
    expect(screen.queryByTestId(`activity-row-link:${expired.id}`)).toBeNull();
    expect(screen.queryByText("Table 3")).toBeNull();

    // A state of "To follow up" chosen: its rows are none of them, no button meanwhile.
    await fireEvent.press(screen.getByTestId("activity-follow-up-open"));
    expect(screen.queryByTestId("activity-expired-toggle")).toBeNull();
    await fireEvent.press(screen.getByTestId("activity-clear-filter"));

    const toggle = screen.getByTestId("activity-expired-toggle");
    expect(toggle).toHaveTextContent("Show expired (1)");
    // Small and quiet: the caption's grey text, on a 44 px target.
    expect(StyleSheet.flatten(toggle.props.style)).toMatchObject({ minHeight: control.min });
    expect(within(toggle).getByText("Show expired (1)")).toHaveStyle({
      fontSize: type.caption,
      color: colors.text.secondary
    });
    await fireEvent.press(toggle);
    const row = await screen.findByTestId(`activity-row-link:${expired.id}`);
    expect(within(row).getByText("Table 3")).toBeTruthy();
    expect(within(row).getByText(/ · Expired$/)).toBeTruthy();
    expect(screen.getByTestId(`activity-row-link:${open.id}`)).toBeTruthy();

    expect(screen.getByTestId("activity-expired-toggle")).toHaveTextContent("Hide expired");
    await fireEvent.press(screen.getByTestId("activity-expired-toggle"));
    await waitFor(() => expect(screen.queryByTestId(`activity-row-link:${expired.id}`)).toBeNull());
    expect(screen.getByTestId(`activity-row-link:${open.id}`)).toBeTruthy();
  });

  it('never says "No transactions" while expired invoices only are left out', async () => {
    sdk.fakeWallet.payments = [];
    const { expired } = await publishErinLinks(false);
    await openWalletScreen();
    expect(await screen.findByTestId("activity-expired-toggle")).toHaveTextContent(
      "Show expired (1)"
    );
    expect(screen.queryByTestId("wallet-empty")).toBeNull();
    await fireEvent.press(screen.getByTestId("activity-expired-toggle"));
    expect(await screen.findByTestId(`activity-row-link:${expired.id}`)).toBeTruthy();
  });

  it("shows no button for expired invoices while none is", async () => {
    await openWalletScreen();
    await screen.findByTestId("activity-row-payment:p3");
    expect(screen.queryByTestId("activity-expired-toggle")).toBeNull();
  });

  describe("each row's amount", () => {
    /** A Lightning payment of `sats`, `minutes` ago. */
    const lightning = (
      id: string,
      paymentType: BreezFake.PaymentType,
      status: BreezFake.PaymentStatus,
      sats: number,
      minutes: number
    ) => ({
      id,
      paymentType,
      status,
      amount: BigInt(sats),
      fees: BigInt(0),
      timestamp: BigInt(minutesAgo(minutes)),
      method: sdk.PaymentMethod.Lightning,
      details: {
        tag: sdk.PaymentDetails_Tags.Lightning,
        inner: {
          description: `Payment ${id}`,
          invoice: `lnbc${id}`,
          destinationPubkey: "02ab",
          htlcDetails: { paymentHash: `${id}`.padEnd(24, "0") }
        }
      }
    });
    const colorOf = (node: ReturnType<typeof screen.getByText>) =>
      StyleSheet.flatten(node.props.style).color;

    beforeEach(() => {
      // At 100 000 CHF, 1 sat is 0.001 CHF: 4 sats round to 0.00, 5 sats to 0.01 (half up).
      sdk.fakeWallet.payments = [
        ...sdk.fakeWallet.payments,
        lightning("t1", sdk.PaymentType.Receive, sdk.PaymentStatus.Completed, 4, 4),
        lightning("t2", sdk.PaymentType.Send, sdk.PaymentStatus.Completed, 3, 5),
        lightning("t3", sdk.PaymentType.Receive, sdk.PaymentStatus.Completed, 5, 6),
        lightning("t4", sdk.PaymentType.Send, sdk.PaymentStatus.Failed, 2000, 7)
      ];
    });

    it.each([false, true])(
      "writes received ones unsigned in green, sent ones with a minus in the text's colour (desktop: %s)",
      async (desktop) => {
        mockDesktop.mockReturnValue(desktop);
        await openWalletScreen();
        // A transfer's value once the rate recorded at its payment is read (payment-rates.ts).
        const amountIn = async (id: string, text: string) =>
          within(await screen.findByTestId(`activity-row-payment:${id}`)).findByText(text);

        // Received: no "+", in the green of its "Received" pill.
        expect(colorOf(await amountIn("p1", chf(1842)))).toBe(colors.state.settled.fg);
        expect(screen.queryByText(chf(1842, "+"))).toBeNull();
        // Sent: "−", in the text's colour; still on its way ("Confirming"): not green.
        expect(colorOf(await amountIn("p2", chf(15000, "−")))).toBe(colors.text.primary);
        expect(colorOf(await amountIn("p3", chf(40000, "−")))).toBe(colors.text.primary);
        // Failed: nothing moved, grey and unsigned.
        expect(colorOf(await amountIn("t4", chf(200)))).toBe(colors.text.secondary);

        // Worth less than half a centime: never "0.00", a ceiling instead.
        expect(colorOf(await amountIn("t1", `< ${chf(1)}`))).toBe(colors.state.settled.fg);
        expect(colorOf(await amountIn("t2", `−< ${chf(1)}`))).toBe(colors.text.primary);
        expect(screen.queryByText(chf(0))).toBeNull();
        expect(screen.queryByText(chf(0, "−"))).toBeNull();
        // Half a centime rounds up to the centime: a value, not a ceiling.
        expect(colorOf(await amountIn("t3", chf(1)))).toBe(colors.state.settled.fg);
      }
    );

    it("shows a received amount in green in its details, its exact sats under a ceiling", async () => {
      await openWalletScreen();
      await fireEvent.press(await screen.findByTestId("activity-row-payment:t1"));
      const detail = within(await screen.findByTestId("activity-detail-sheet"));
      expect(colorOf(detail.getByText(`< ${chf(1)}`))).toBe(colors.state.settled.fg);
      expect(detail.getByText("4")).toBeTruthy();
      expect(detail.queryByText("+")).toBeNull();
    });
  });

  it('masks the screen\'s amounts with "Discreet", their details included, then shows them again', async () => {
    await openWalletScreen();
    const balance = formatFiat(128453, 2, getDeviceLocale().languageTag);
    expect(await screen.findByText(balance)).toBeTruthy();
    // Its icon alone: a switch named "Discreet" for screen readers, no text on screen.
    // The transfers valued at their payment (payment-rates.ts) before they are masked.
    expect(await screen.findByText(chf(1842))).toBeTruthy();
    const toggle = screen.getByRole("switch", { name: "Discreet" });
    expect(toggle).toBe(screen.getByTestId("wallet-discreet"));
    expect(screen.queryByText("Discreet")).toBeNull();
    expect(toggle).not.toBeChecked();

    await fireEvent.press(toggle);
    expect(toggle).toBeChecked();
    // The balance (francs and sats), the total of "To follow up" and the rows' amounts: still laid
    // out, out of reach of screen readers, which read "Amount hidden" in their place.
    for (const amount of [balance, chf(1842), chf(15000, "−"), chf(40000)]) {
      expect(screen.queryByText(amount)).toBeNull();
      expect(screen.getAllByText(amount, { includeHiddenElements: true }).length).toBeGreaterThan(
        0
      );
    }
    // The balance in francs and in sats (each its row and its figure), "To follow up"'s total, the
    // day's net (read as "Day's net: Amount hidden"), then each row's
    // francs and sats.
    expect(screen.getAllByLabelText("Amount hidden")).toHaveLength(2 * 2 + 1 + 1 + 3 * 2);
    expect(screen.getByLabelText("Day's net: Amount hidden")).toBeTruthy();
    const confirming = screen.getByTestId("activity-follow-up-unconfirmed");
    expect(confirming).toHaveAccessibleName(/Amount hidden/);
    expect(confirming).not.toHaveAccessibleName(/400/);
    // What is not an amount stays: titles, counts, states.
    expect(screen.getByText("Till B")).toBeTruthy();
    expect(within(confirming).getByText("1")).toBeTruthy();

    // A row's details too: its amount, its sats, and its fees in francs and in sats.
    await fireEvent.press(screen.getByTestId("activity-row-payment:p2"));
    const detail = within(await screen.findByTestId("activity-detail"));
    expect(detail.queryByText(chf(15000, "−"))).toBeNull();
    expect(detail.queryByText(chf(1))).toBeNull();
    expect(detail.getAllByLabelText("Amount hidden")).toHaveLength(4);
    expect(detail.getByText("bakehouse@wallet.example")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByTestId("activity-detail-sheet")).toBeNull());

    await fireEvent.press(screen.getByTestId("wallet-discreet"));
    expect(screen.getByTestId("wallet-discreet")).not.toBeChecked();
    expect(screen.getByText(balance)).toBeTruthy();
    expect(screen.getByText(chf(1842))).toBeTruthy();
    expect(screen.queryByLabelText("Amount hidden")).toBeNull();
  });

  it('remembers "Discreet" on the device', async () => {
    await openWalletScreen();
    expect(await screen.findByText("Till B")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("wallet-discreet"));
    await waitFor(() => expect(storedDiscreet()).toBe(true));
    await fireEvent.press(screen.getByTestId("wallet-discreet"));
    await waitFor(() => expect(storedDiscreet()).toBe(false));
  });

  it('masks the amounts from the start when "Discreet" was left on', async () => {
    await saveDiscreet(true);
    await openWalletScreen();
    // The movements read (the wallet synced): the balance shows too.
    expect(await screen.findByText("Till B")).toBeTruthy();
    const balance = formatFiat(128453, 2, getDeviceLocale().languageTag);
    expect(screen.getByText(balance, { includeHiddenElements: true })).toBeTruthy();
    expect(screen.queryByText(balance)).toBeNull();
    expect(screen.getByTestId("wallet-discreet")).toBeChecked();

    await fireEvent.press(screen.getByTestId("wallet-discreet"));
    expect(screen.getByText(balance)).toBeTruthy();
    await waitFor(() => expect(storedDiscreet()).toBe(false));
  });

  it('masks the balance and the table\'s amounts with "Discreet" on desktop', async () => {
    mockDesktop.mockReturnValue(true);
    await openWalletScreen();
    const balance = chf(128453);
    expect(await screen.findByText(balance)).toBeTruthy();

    await fireEvent.press(screen.getByTestId("wallet-discreet"));
    expect(screen.queryByText(balance)).toBeNull();
    expect(screen.queryByText(chf(1842))).toBeNull();
    expect(screen.queryByText(chf(15000, "−"))).toBeNull();
    // The header's "Send" stays.
    expect(screen.getByTestId("wallet-send")).toHaveTextContent(/Send$/);
    expect(screen.getAllByLabelText("Amount hidden").length).toBeGreaterThan(0);
  });

  describe("the balance", () => {
    const languageTag = () => getDeviceLocale().languageTag;
    const fontOf = (node: ReturnType<typeof screen.getByText>) =>
      StyleSheet.flatten(node.props.style).fontFamily as string;

    it("writes its francs first, large, its sats under them, centred, both in Plus Jakarta Sans", async () => {
      await openWalletScreen();
      const balance = within(await screen.findByTestId("wallet-balance"));
      const francs = await balance.findByText(formatFiat(128453, 2, languageTag()));
      expect(francs).toHaveStyle({ fontSize: type.amountLarge });
      const second = within(balance.getByTestId("wallet-balance-second"));
      const sats = second.getByText(formatInteger(BigInt(1284530), languageTag()));
      expect(second.getByText("sats")).toBeTruthy();
      expect(balance.getByTestId("wallet-balance-second")).toHaveAccessibleName(satsOf(1284530));
      // No figure in JetBrains Mono any more.
      for (const node of [francs, sats]) expect(fontOf(node)).toMatch(/^PlusJakartaSans-/);
      expect(balance.queryByText(/^0\.0/)).toBeNull();
      // Centred: the amounts' column.
      expect(screen.getByTestId("wallet-balance-second").parent).toHaveStyle({
        alignItems: "center"
      });
    });

    it('centres "Balance" over the amounts, "Discreet" on the right edge', async () => {
      await openWalletScreen();
      const balance = within(await screen.findByTestId("wallet-balance"));
      const title = balance.getByRole("header", { name: "Balance" });
      expect(title.parent).toHaveStyle({ alignItems: "center" });
      // "Discreet" out of the flow: it does not push the title off the centre.
      expect(balance.getByTestId("wallet-discreet").parent).toHaveStyle({
        position: "absolute",
        right: 0
      });
    });

    it("writes its sats first, large, its francs under them, once this device chose so", async () => {
      await saveAmountUnit("sats");
      await openWalletScreen();
      const balance = within(await screen.findByTestId("wallet-balance"));
      const sats = await balance.findByText(formatInteger(BigInt(1284530), languageTag()));
      expect(sats).toHaveStyle({ fontSize: type.amountLarge });
      expect(fontOf(sats)).toMatch(/^PlusJakartaSans-/);
      const second = balance.getByTestId("wallet-balance-second");
      expect(second).toHaveAccessibleName(chf(128453));
      const francs = within(second).getByText(formatFiat(128453, 2, languageTag()));
      expect(fontOf(francs)).toMatch(/^PlusJakartaSans-/);
      expect(within(second).getByText("CHF")).toBeTruthy();

      // Back to the francs first: the screen follows the choice at once.
      await act(async () => saveAmountUnit("fiat"));
      expect(within(balance.getByTestId("wallet-balance-second")).getByText("sats")).toBeTruthy();
    });

    it("writes its sats alone, large, during a rate outage", async () => {
      mockRate = undefined;
      await openWalletScreen();
      const balance = within(await screen.findByTestId("wallet-balance"));
      const sats = await balance.findByText(formatInteger(BigInt(1284530), languageTag()));
      expect(sats).toHaveStyle({ fontSize: type.amountLarge });
      expect(balance.queryByTestId("wallet-balance-second")).toBeNull();
      expect(balance.queryByText(/CHF$/)).toBeNull();
    });

    it("follows the same choice on desktop, both in Plus Jakarta Sans", async () => {
      mockDesktop.mockReturnValue(true);
      await saveAmountUnit("sats");
      await openWalletScreen();
      const balance = within(await screen.findByTestId("wallet-balance"));
      const first = await balance.findByText(satsOf(1284530));
      expect(fontOf(first)).toMatch(/^PlusJakartaSans-/);
      const second = balance.getByTestId("wallet-balance-second");
      expect(second).toHaveTextContent(chf(128453));
      expect(fontOf(second)).toMatch(/^PlusJakartaSans-/);

      await act(async () => saveAmountUnit("fiat"));
      expect(await balance.findByText(chf(128453))).toBeTruthy();
      expect(balance.getByTestId("wallet-balance-second")).toHaveTextContent(satsOf(1284530));
    });
  });

  it("shows on desktop the tiles of the states that have a row only, at their usual width", async () => {
    mockDesktop.mockReturnValue(true);
    await openWalletScreen();
    const tiles = await screen.findByTestId("activity-follow-ups");
    // The withdrawal being confirmed: its tile alone…
    expect(within(tiles).getByTestId("activity-follow-up-unconfirmed")).toBeTruthy();
    expect(within(tiles).queryByTestId("activity-follow-up-open")).toBeNull();
    expect(within(tiles).queryByTestId("activity-follow-up-underpaid")).toBeNull();
    expect(within(tiles).queryByTestId("activity-follow-up-draft")).toBeNull();
    // …then the places of the three others (drafts of invoices included), empty: a quarter of the
    // row, as with every state.
    expect(tiles.children).toHaveLength(4);
    expect(within(tiles).getAllByRole("button")).toHaveLength(1);
  });

  it('shows no "To follow up" while nothing is to follow', async () => {
    // The withdrawal confirmed: no transfer being confirmed, no payment link.
    sdk.fakeWallet.payments = sdk.fakeWallet.payments.map((payment) => ({
      ...payment,
      status: sdk.PaymentStatus.Completed
    }));
    await openWalletScreen();
    expect(await screen.findByTestId("activity-row-payment:p3")).toBeTruthy();
    expect(screen.getByText("Balance")).toBeTruthy();
    expect(screen.getByText("Transactions")).toBeTruthy();
    expect(screen.queryByText("To follow up")).toBeNull();
    expect(screen.queryByTestId("activity-follow-ups")).toBeNull();
  });

  describe("live", () => {
    const MEMBER = "0123456789abcdef0123456789abcdef";

    /** Erin Grant, an employee; the screen open, watching her records. Her keys. */
    async function openWatchingErin() {
      mockNetwork.mockReturnValue("mainnet");
      const team = deriveTeamKeys(walletSecret(testSeed()));
      await publishMember(team, {
        id: MEMBER,
        name: "Erin Grant",
        role: "employee",
        invitedAt: 1789990000
      });
      const keys = deriveMemberKeys(memberSecret(team, MEMBER));
      await openWalletScreen();
      expect(await screen.findByTestId("activity-row-payment:p1")).toBeTruthy();
      // Once the records' read gave the roster, the watch listens to her records too.
      await waitFor(() =>
        expect(
          relays.calls.some(
            ({ operation, filter }) =>
              operation === "watch" && filter?.authors?.includes(keys.nostr.publicKey)
          )
        ).toBe(true)
      );
      return keys;
    }

    /** A sale Erin shows at her point of sale, open: its row's id. */
    async function showLeaSale(keys: ReturnType<typeof deriveMemberKeys>, note: string) {
      const now = Math.floor(Date.now() / 1000);
      const { paymentHash } = preimagePair(31);
      await publishMemberRecord(
        keys,
        saleEvent(keys, {
          version: 1,
          paymentHash,
          sats: "5000",
          fiat: { minor: 500, digits: 2, currency: "CHF" },
          note,
          verifyUrl: "https://breez.tips/verify/live",
          createdAt: now,
          expiresAt: now + 600,
          paidAt: null,
          onchainAddress: null,
          onchainTag: null,
          sale: "e2".repeat(32)
        })
      );
      return `activity-row-sale:${paymentHash}`;
    }

    const glows = () =>
      screen.queryAllByTestId("activity-arrival-glow", { includeHiddenElements: true });

    it("shows a sale as soon as its record reaches a relay, lit as it arrives", async () => {
      const keys = await openWatchingErin();
      // The rows of the first list never arrive.
      expect(glows()).toHaveLength(0);

      const rowId = await showLeaSale(keys, "Croissant");
      // Well before the next read (ACTIVITY_REFRESH_MS, a minute).
      const row = await screen.findByTestId(rowId, {}, { timeout: 4000 });
      expect(within(row).getByText("Croissant")).toBeTruthy();
      expect(glows()).toHaveLength(1);
    });

    it("keeps an arrival out of the list scrolled down, told by a pill that scrolls back up", async () => {
      const keys = await openWatchingErin();
      // Scrolled down past the list's top (Jest has no layout: the list starts at 0).
      await fireEvent.scroll(screen.getByTestId("activity-scroll"), {
        nativeEvent: { contentOffset: { x: 0, y: 500 } }
      });

      const rowId = await showLeaSale(keys, "Croissant");
      const pill = await screen.findByTestId("activity-arrivals", {}, { timeout: 4000 });
      expect(pill).toHaveAccessibleName("1 new transaction");
      // Nothing moved in the list.
      expect(screen.queryByTestId(rowId)).toBeNull();

      await fireEvent.press(pill);
      expect(await screen.findByTestId(rowId)).toBeTruthy();
      expect(glows()).toHaveLength(1);
    });
  });

  it("names who took each sale, and follows an employee's payment link still open", async () => {
    // Invoices of "bc": the activity reads the registry and the payment links of this network.
    mockNetwork.mockReturnValue("mainnet");
    const team = deriveTeamKeys(walletSecret(testSeed()));
    const MEMBER = "0123456789abcdef0123456789abcdef";
    const member: TeamMember = {
      id: MEMBER,
      name: "Erin Grant",
      role: "employee",
      invitedAt: 1789990000
    };
    await saveMerchantSettings(TEST_WALLET_ID, settings);
    await publishMember(team, member);
    const keys = deriveMemberKeys(memberSecret(team, MEMBER));
    const now = Math.floor(Date.now() / 1000);
    const fiat = { minor: 1746, digits: 2, currency: "CHF" };

    // A sale Erin took at the point of sale: declared, recorded as hers, paid into the wallet.
    const { paymentHash } = preimagePair(7);
    const pr = makeInvoice({
      amountMsat: 18_420_000n,
      paymentHash,
      timestamp: now - 300,
      expirySeconds: 600
    });
    const shown = { pr, decoded: decodeBolt11(pr)!, verifyUrl: `https://breez.tips/verify/x` };
    const registry = deriveBusinessRegistry(team);
    await declareInvoice(saleRegistry(registry, new Uint8Array(32).fill(7)), shown, {
      fiat,
      note: "Table 12"
    });
    await publishMemberRecord(
      keys,
      saleEvent(keys, {
        version: 1,
        paymentHash,
        sats: "18420",
        fiat,
        note: "Table 12",
        verifyUrl: shown.verifyUrl,
        createdAt: now - 300,
        expiresAt: now + 300,
        paidAt: now - 240,
        onchainAddress: null,
        onchainTag: null,
        sale: "e1".repeat(32)
      })
    );
    const [first] = sdk.fakeWallet.payments;
    const details = first.details as { tag: string; inner: Record<string, unknown> };
    sdk.fakeWallet.payments = [
      {
        ...first,
        id: "erin",
        timestamp: BigInt(now - 240),
        details: { ...details, inner: { ...details.inner, htlcDetails: { paymentHash } } }
      },
      ...sdk.fakeWallet.payments.slice(1)
    ];

    // A payment link Erin shared, not paid yet: 250.00 CHF until its sale's end.
    const saleKey = new Uint8Array(32).fill(8);
    const link = createPaymentLink(
      {
        version: 3,
        businessName: "Fine Bakery",
        lightningAddress: "sattleme02c6047f94@breez.tips",
        fiat: { minor: 25000, digits: 2, currency: "CHF" },
        note: "Bastion Coffee",
        onchainAddress: null,
        endsAt: now + 3600,
        registryKey: bytesToHex(registry.key),
        registryReader: registry.reader,
        owner: registry.owner
      },
      "https://web.example",
      now - 60,
      saleKey
    );
    await publishPaymentLink(link);
    await publishMemberRecord(
      keys,
      linkEvent(keys, {
        version: 1,
        link: link.id,
        saleKey: bytesToHex(saleKey),
        createdAt: now - 60,
        onchainTag: null,
        relays: [...link.relays],
        sealedKey: "A".repeat(200)
      })
    );

    const { router } = await openWalletScreen();
    // The sale: its note and amount as typed, who took it.
    const sale = await screen.findByTestId(
      `activity-row-sale:${deriveSaleKeys(new Uint8Array(32).fill(7)).nostr.publicKey}`
    );
    expect(within(sale).getByText("Table 12")).toBeTruthy();
    // Its time and who took it, on one line, never where it comes from.
    expect(within(sale).getByText(/^\d\d:\d\d · Erin Grant$/).props.numberOfLines).toBe(1);
    expect(within(sale).getByText(chf(1746))).toBeTruthy();
    // The link, open: in "To follow up" with its amount, grey and unsigned on its row.
    const open = screen.getByTestId("activity-follow-up-open");
    expect(within(open).getByText("1")).toBeTruthy();
    expect(within(open).getByText(chf(25000))).toBeTruthy();
    // "Open" with the open state's pulsing dot; on its row, "Open" after its time, in the open
    // state's colour.
    expect(
      within(open).getByTestId("status-pill-pulse", { includeHiddenElements: true })
    ).toBeTruthy();
    const row = screen.getByTestId(`activity-row-link:${link.id}`);
    expect(within(row).getByText("Bastion Coffee")).toBeTruthy();
    expect(within(row).getByText(/ · Open$/)).toHaveStyle({ color: colors.state.open.fg });
    expect(within(row).getByText(chf(25000))).toBeTruthy();

    await fireEvent.press(row);
    const detail = within(await screen.findByTestId("activity-detail-sheet"));
    expect(detail.getByRole("header")).toHaveTextContent("Invoice");
    expect(detail.getByText("Created by")).toBeTruthy();
    expect(detail.getByText("Erin Grant")).toBeTruthy();
    expect(detail.getByText("Payable until")).toBeTruthy();

    // Its page, by the link as it was shared: copied, then opened over
    // the wallet, the sheet closed.
    expect(detail.getByText("Payment link")).toBeTruthy();
    await fireEvent.press(detail.getByLabelText("Copy the link"));
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith(link.url);
    expect(await detail.findByLabelText("Link copied")).toBeTruthy();
    await fireEvent.press(detail.getByRole("link", { name: "Open the invoice" }));
    await waitFor(() => expect(router.getPathname()).toBe("/pay"));
    expect(router.getSearchParams()["#"]).toBe(link.url.slice(link.url.indexOf("#") + 1));
    await waitFor(() => expect(screen.queryByTestId("activity-detail-sheet")).toBeNull());
  });

  describe("an employee's sale paid on-chain in two times", () => {
    // 2.00 CHF, 2 882 sats due: 1 500 sats, then 1 382 sats to the same address.
    const MEMBER = "0123456789abcdef0123456789abcdef";
    const SALE_KEY = new Uint8Array(32).fill(5);
    const ADDRESS_PAID = taprootAddress(5);
    const TX1 = "b1".repeat(32);
    const TX2 = "b2".repeat(32);

    /**
     * What Erin's point of sale published: the sale underpaid with the first transaction, both
     * transactions seen paying its address, and, when `paid`, the sale paid. The wallet holds
     * both deposits.
     */
    async function publishSale({ paid }: { paid: boolean }) {
      mockNetwork.mockReturnValue("mainnet");
      const team = deriveTeamKeys(walletSecret(testSeed()));
      await publishMember(team, {
        id: MEMBER,
        name: "Erin Grant",
        role: "employee",
        invitedAt: 1789990000
      });
      const keys = deriveMemberKeys(memberSecret(team, MEMBER));
      const now = Math.floor(Date.now() / 1000);
      const record = (
        n: number,
        over: Partial<Extract<MemberSale, { paymentHash: string }>>
      ): MemberSale => {
        const { paymentHash } = preimagePair(n);
        return {
          version: 1,
          paymentHash,
          sats: "2882",
          fiat: { minor: 200, digits: 2, currency: "CHF" },
          note: "Table 4",
          verifyUrl: `https://breez.tips/verify/${paymentHash}`,
          createdAt: now - 600,
          expiresAt: now,
          paidAt: null,
          onchainAddress: ADDRESS_PAID,
          onchainTag: null,
          sale: deriveSaleKeys(SALE_KEY).nostr.publicKey,
          ...over
        };
      };
      await publishMemberRecord(
        keys,
        saleEvent(
          keys,
          record(21, {
            underpaid: { at: now - 590, received: "1500", due: "2882", transactions: [TX1] }
          })
        )
      );
      await publishMemberRecord(keys, saleTxEvent(keys, ADDRESS_PAID, TX1, now - 590));
      await publishMemberRecord(keys, saleTxEvent(keys, ADDRESS_PAID, TX2, now - 560));
      if (paid) {
        await publishMemberRecord(
          keys,
          saleEvent(keys, record(22, { sats: "1382", createdAt: now - 580, paidAt: now - 10 }))
        );
      }
      const deposit = (id: string, txId: string, sats: number, minutes: number) => ({
        id,
        paymentType: sdk.PaymentType.Receive,
        status: sdk.PaymentStatus.Completed,
        amount: BigInt(sats),
        fees: BigInt(0),
        timestamp: BigInt(minutesAgo(minutes)),
        method: sdk.PaymentMethod.Deposit,
        details: { tag: sdk.PaymentDetails_Tags.Deposit, inner: { txId } }
      });
      sdk.fakeWallet.payments = [
        deposit("dep-2", TX2, 1382, 1),
        deposit("dep-1", TX1, 1500, 2),
        ...sdk.fakeWallet.payments
      ];
      return `activity-row-sale:${deriveSaleKeys(SALE_KEY).nostr.publicKey}`;
    }

    it('lets the owner accept what it received, for good: "Paid", the difference told', async () => {
      // Erin's point of sale saw 1 500 of its 2 882 sats paid,
      // and recorded the sale's own key (the acceptance is found by it).
      mockNetwork.mockReturnValue("mainnet");
      const team = deriveTeamKeys(walletSecret(testSeed()));
      await publishMember(team, {
        id: MEMBER,
        name: "Erin Grant",
        role: "employee",
        invitedAt: 1789990000
      });
      const keys = deriveMemberKeys(memberSecret(team, MEMBER));
      const now = Math.floor(Date.now() / 1000);
      const { paymentHash } = preimagePair(21);
      const author = deriveSaleKeys(SALE_KEY).nostr.publicKey;
      await publishMemberRecord(
        keys,
        saleEvent(keys, {
          version: 1,
          paymentHash,
          sats: "2882",
          fiat: { minor: 200, digits: 2, currency: "CHF" },
          note: "Table 4",
          verifyUrl: `https://breez.tips/verify/${paymentHash}`,
          createdAt: now - 600,
          expiresAt: now,
          paidAt: null,
          onchainAddress: ADDRESS_PAID,
          onchainTag: null,
          sale: author,
          saleKey: bytesToHex(SALE_KEY),
          underpaid: { at: now - 590, received: "1500", due: "2882", transactions: [TX1] }
        })
      );
      await publishMemberRecord(keys, saleTxEvent(keys, ADDRESS_PAID, TX1, now - 590));
      sdk.fakeWallet.payments = [
        {
          id: "dep-1",
          paymentType: sdk.PaymentType.Receive,
          status: sdk.PaymentStatus.Completed,
          amount: BigInt(1500),
          fees: BigInt(0),
          timestamp: BigInt(minutesAgo(2)),
          method: sdk.PaymentMethod.Deposit,
          details: { tag: sdk.PaymentDetails_Tags.Deposit, inner: { txId: TX1 } }
        },
        ...sdk.fakeWallet.payments
      ];
      await openWalletScreen();
      const rowId = `activity-row-sale:${author}`;
      expect(within(await screen.findByTestId(rowId)).getByText(/ · Underpaid$/)).toBeTruthy();

      await fireEvent.press(screen.getByTestId(rowId));
      const sheet = within(await screen.findByTestId("activity-detail-sheet"));
      // Offered once its acceptance was read and is none.
      await fireEvent.press(await sheet.findByTestId("activity-accept"));
      // 1 500 of 2 882 sats: 1.04 of its 2.00 CHF received, 0.96 CHF no longer asked (splitFiat).
      const dialog = within(await screen.findByTestId("activity-accept-dialog"));
      expect(
        dialog.getByText(
          `The sale will be paid at ${chf(104)}. The difference of ${chf(96)} will no longer be asked for. This is final.`
        )
      ).toBeTruthy();
      await fireEvent.press(screen.getByTestId("activity-accept-confirm"));
      expect(await screen.findByText("Amount received accepted")).toBeTruthy();

      // "Paid", at what it received: out of "To follow up", never offered again.
      await waitFor(() =>
        expect(within(screen.getByTestId(rowId)).queryByText(/Underpaid/)).toBeNull()
      );
      expect(within(screen.getByTestId(rowId)).getByText(chf(104))).toBeTruthy();
      expect(screen.queryByTestId("activity-follow-up-underpaid")).toBeNull();
      const detail = within(screen.getByTestId("activity-detail-sheet"));
      expect(detail.getByText("Paid")).toBeTruthy();
      // Paid short, the owner having accepted it: the warning's triangle beside "Paid", in the
      // settled state's colour.
      expect(
        detail.getByTestId("status-pill-warning", { includeHiddenElements: true })
      ).toBeTruthy();
      expect(detail.getByText("Accepted on")).toBeTruthy();
      expect(detail.getByTestId("activity-detail-difference")).toHaveTextContent(chf(96));
      expect(detail.queryByTestId("activity-accept")).toBeNull();
      // On a majority of the relays, signed by the owner's key of that sale: its point of sale and
      // its payer's page read it too (sale-acceptance.test.ts).
      const holders = DEFAULT_RELAYS.filter((relay) =>
        (relays.stored.get(relay) ?? []).some(({ tags }) =>
          tags.some(([name, value]) => name === "d" && value === saleAcceptanceAddress(SALE_KEY))
        )
      );
      expect(holders.length).toBeGreaterThanOrEqual(3);
    });

    it('is paid with both its deposits, never "Underpaid", once its point of sale says so', async () => {
      const rowId = await publishSale({ paid: true });
      await openWalletScreen();
      const row = await screen.findByTestId(rowId);
      expect(within(row).getByText("Table 4")).toBeTruthy();
      expect(within(row).getByText(/^\d\d:\d\d · Erin Grant$/)).toBeTruthy();
      expect(within(row).getByText(chf(200))).toBeTruthy();
      expect(screen.queryByText("Underpaid")).toBeNull();
      expect(screen.queryByTestId("activity-follow-up-underpaid")).toBeNull();
      // Its deposits are its own: no anonymous "Deposit" row of them.
      expect(screen.queryByTestId("activity-row-payment:dep-1")).toBeNull();
      expect(screen.queryByTestId("activity-row-payment:dep-2")).toBeNull();

      await fireEvent.press(row);
      const detail = within(await screen.findByTestId("activity-detail-sheet"));
      expect(detail.getByText("Paid")).toBeTruthy();
      // Paid in full: nothing out of the ordinary, no triangle beside "Paid".
      expect(
        detail.queryByTestId("status-pill-warning", { includeHiddenElements: true })
      ).toBeNull();
      expect(detail.getByText("Payments")).toBeTruthy();
      expect(detail.getByText("2")).toBeTruthy();
    });

    it("is told by its declarations in the registry once its records are no longer read", async () => {
      mockNetwork.mockReturnValue("mainnet");
      const team = deriveTeamKeys(walletSecret(testSeed()));
      await publishMember(team, {
        id: MEMBER,
        name: "Erin Grant",
        role: "employee",
        invitedAt: 1789990000
      });
      // No record of Erin's (over a month old): her point of sale declared both transactions.
      const sale = saleRegistry(deriveBusinessRegistry(team), SALE_KEY);
      const marked = {
        ...sale,
        taker: takerTag(memberTakerKey(memberSecret(team, MEMBER)), sale.saleKeys.nostr.publicKey)
      };
      for (const txid of [TX1, TX2]) {
        await publishToRelays(
          onchainPaymentEvent(
            marked,
            { txid, address: ADDRESS_PAID },
            { fiat: { minor: 200, digits: 2, currency: "CHF" }, note: "Table 4" }
          ),
          { relays: DEFAULT_RELAYS, channel: "anonymous", timeoutMs: 1000 }
        );
      }
      const deposit = (id: string, txId: string, sats: number, minutes: number) => ({
        id,
        paymentType: sdk.PaymentType.Receive,
        status: sdk.PaymentStatus.Completed,
        amount: BigInt(sats),
        fees: BigInt(0),
        timestamp: BigInt(minutesAgo(minutes)),
        method: sdk.PaymentMethod.Deposit,
        details: { tag: sdk.PaymentDetails_Tags.Deposit, inner: { txId } }
      });
      sdk.fakeWallet.payments = [
        deposit("dep-2", TX2, 1382, 1),
        deposit("dep-1", TX1, 1500, 2),
        ...sdk.fakeWallet.payments
      ];
      await openWalletScreen();
      const row = await screen.findByTestId(
        `activity-row-sale:${deriveSaleKeys(SALE_KEY).nostr.publicKey}`
      );
      expect(within(row).getByText("Table 4")).toBeTruthy();
      expect(within(row).getByText(/^\d\d:\d\d · Erin Grant$/)).toBeTruthy();
      expect(within(row).getByText(chf(200))).toBeTruthy();
      expect(screen.queryByTestId("activity-row-payment:dep-1")).toBeNull();
    });

    it('shows a sale "Show more" brings once its declarations are read, never as a reception', async () => {
      mockNetwork.mockReturnValue("mainnet");
      const team = deriveTeamKeys(walletSecret(testSeed()));
      await publishMember(team, {
        id: MEMBER,
        name: "Erin Grant",
        role: "employee",
        invitedAt: 1789990000
      });
      const sale = saleRegistry(deriveBusinessRegistry(team), SALE_KEY);
      const marked = {
        ...sale,
        taker: takerTag(memberTakerKey(memberSecret(team, MEMBER)), sale.saleKeys.nostr.publicKey)
      };
      for (const txid of [TX1, TX2]) {
        await publishToRelays(
          onchainPaymentEvent(
            marked,
            { txid, address: ADDRESS_PAID },
            { fiat: { minor: 200, digits: 2, currency: "CHF" }, note: "Table 4" }
          ),
          { relays: DEFAULT_RELAYS, channel: "anonymous", timeoutMs: 1000 }
        );
      }
      const deposit = (id: string, txId: string, sats: number, minutes: number) => ({
        id,
        paymentType: sdk.PaymentType.Receive,
        status: sdk.PaymentStatus.Completed,
        amount: BigInt(sats),
        fees: BigInt(0),
        timestamp: BigInt(minutesAgo(minutes)),
        method: sdk.PaymentMethod.Deposit,
        details: { tag: sdk.PaymentDetails_Tags.Deposit, inner: { txId } }
      });
      // 100 payments newer than the sale's deposits: those come with "Show more" only.
      const newest = minutesAgo(0);
      const busy = Array.from({ length: 100 }, (_, i) => ({
        id: `busy-${i}`,
        paymentType: sdk.PaymentType.Receive,
        status: sdk.PaymentStatus.Completed,
        amount: BigInt(1000),
        fees: BigInt(0),
        timestamp: BigInt(newest - i),
        method: sdk.PaymentMethod.Spark,
        details: undefined
      }));
      sdk.fakeWallet.payments = [
        ...busy,
        deposit("dep-2", TX2, 1382, 10),
        deposit("dep-1", TX1, 1500, 11)
      ];
      await openWalletScreen();
      expect(await screen.findByTestId("activity-row-payment:busy-0")).toBeTruthy();
      const saleRow = `activity-row-sale:${deriveSaleKeys(SALE_KEY).nostr.publicKey}`;
      expect(screen.queryByTestId(saleRow)).toBeNull();

      // The relays hold their answers: the deposits read, their sale not yet.
      const release = relays.holdQueries();
      await fireEvent.press(screen.getByTestId("activity-more"));
      await waitFor(() =>
        expect(screen.getByTestId("activity-more").props.accessibilityState).toMatchObject({
          busy: true
        })
      );
      // The list as it was meanwhile: never the deposits as receptions, to become a sale.
      expect(screen.queryByTestId("activity-row-payment:dep-1")).toBeNull();
      expect(screen.queryByTestId("activity-row-payment:dep-2")).toBeNull();
      expect(screen.getAllByTestId(/^activity-row-/)).toHaveLength(100);

      await act(async () => release());
      const row = await screen.findByTestId(saleRow);
      expect(within(row).getByText("Table 4")).toBeTruthy();
      expect(screen.queryByTestId("activity-row-payment:dep-1")).toBeNull();
      // All of them listed now.
      expect(screen.queryByTestId("activity-more")).toBeNull();
    });

    it('is "Confirming" while a payment its point of sale saw is not judged yet', async () => {
      const rowId = await publishSale({ paid: false });
      await openWalletScreen();
      const row = await screen.findByTestId(rowId);
      expect(within(row).getByText(/ · Confirming$/)).toBeTruthy();
      expect(screen.queryByText("Underpaid")).toBeNull();
      expect(screen.queryByText("Paid")).toBeNull();
      expect(screen.queryByTestId("activity-follow-up-underpaid")).toBeNull();
    });
  });

  it("names a removed employee for its sale paid before, and ignores what nobody vouches for", async () => {
    mockNetwork.mockReturnValue("mainnet");
    const team = deriveTeamKeys(walletSecret(testSeed()));
    const now = Math.floor(Date.now() / 1000);
    const fiat = { minor: 1746, digits: 2, currency: "CHF" };
    // An employee removed since (its record keeps its name and the date of its removal), whose
    // records are no longer read: its sale paid before its removal stays its own, by its name
    // (never "You").
    const REMOVED = "fedcba9876543210fedcba9876543210";
    await saveMerchantSettings(TEST_WALLET_ID, settings);
    await publishRemoved(
      team,
      { id: REMOVED, name: "Bob Little", role: "employee", invitedAt: now - 86_400 },
      now - 60
    );
    const pay = (n: number, at: number) => {
      const { paymentHash } = preimagePair(n);
      const pr = makeInvoice({
        amountMsat: 18_420_000n,
        paymentHash,
        timestamp: at - 60,
        expirySeconds: 600
      });
      return { pr, decoded: decodeBolt11(pr)!, verifyUrl: `https://breez.tips/verify/${n}` };
    };
    const shown = pay(7, now - 240);
    const sale = saleRegistry(deriveBusinessRegistry(team), new Uint8Array(32).fill(7));
    const mark = takerTag(
      memberTakerKey(memberSecret(team, REMOVED)),
      sale.saleKeys.nostr.publicKey
    );
    await declareInvoice({ ...sale, taker: mark }, shown, { fiat, note: "Table 12" });
    // A declaration with no mark nor record (anyone holding the registry key could make it): the
    // wallet's payment, never its claimed amount and note.
    const claimed = pay(8, now - 200);
    await declareInvoice(
      saleRegistry(deriveBusinessRegistry(team), new Uint8Array(32).fill(8)),
      claimed,
      { fiat: { minor: 9_999_900, digits: 2, currency: "CHF" }, note: "Fake sale" }
    );
    const [first] = sdk.fakeWallet.payments;
    const details = first.details as { tag: string; inner: Record<string, unknown> };
    const received = (id: string, at: number, paymentHash: string) => ({
      ...first,
      id,
      timestamp: BigInt(at),
      details: { ...details, inner: { ...details.inner, htlcDetails: { paymentHash } } }
    });
    sdk.fakeWallet.payments = [
      received("removed", now - 240, shown.decoded.paymentHash),
      received("claimed", now - 200, claimed.decoded.paymentHash),
      ...sdk.fakeWallet.payments.slice(1)
    ];

    await openWalletScreen();
    expect(await screen.findByTestId("activity-row-payment:claimed")).toBeTruthy();
    expect(screen.queryByText("Fake sale")).toBeNull();
    const row = await screen.findByTestId(
      `activity-row-sale:${deriveSaleKeys(new Uint8Array(32).fill(7)).nostr.publicKey}`
    );
    expect(within(row).getByText("Table 12")).toBeTruthy();
    expect(within(row).getByText(/^\d\d:\d\d · Bob Little$/)).toBeTruthy();
    expect(within(row).queryByText(/You/)).toBeNull();

    await fireEvent.press(row);
    const detail = within(await screen.findByTestId("activity-detail-sheet"));
    expect(detail.getByText("Table 12")).toBeTruthy();
    expect(detail.getByText("Taken by")).toBeTruthy();
    expect(detail.getByText("Bob Little")).toBeTruthy();
    expect(detail.queryByText("You")).toBeNull();
  });

  it('writes "—" as the "Description" of a sale without a note', async () => {
    mockNetwork.mockReturnValue("mainnet");
    const team = deriveTeamKeys(walletSecret(testSeed()));
    const now = Math.floor(Date.now() / 1000);
    // Not a generic label ("Payment").
    const { paymentHash } = preimagePair(7);
    const pr = makeInvoice({
      amountMsat: 18_420_000n,
      paymentHash,
      timestamp: now - 300,
      expirySeconds: 600
    });
    const shown = { pr, decoded: decodeBolt11(pr)!, verifyUrl: `https://breez.tips/verify/x` };
    // Marked by one of the owner's devices: a sale the owner vouches for.
    const sale = saleRegistry(deriveBusinessRegistry(team), new Uint8Array(32).fill(7));
    await declareInvoice(
      {
        ...sale,
        taker: takerTag(ownerTakerKey(ownerDevicesSecret(team)), sale.saleKeys.nostr.publicKey)
      },
      shown,
      { fiat: { minor: 1746, digits: 2, currency: "CHF" }, note: "" }
    );
    const [first] = sdk.fakeWallet.payments;
    const details = first.details as { tag: string; inner: Record<string, unknown> };
    sdk.fakeWallet.payments = [
      {
        ...first,
        id: "plain",
        timestamp: BigInt(now - 240),
        details: { ...details, inner: { ...details.inner, htlcDetails: { paymentHash } } }
      },
      ...sdk.fakeWallet.payments.slice(1)
    ];

    await openWalletScreen();
    const row = await screen.findByTestId(`activity-row-sale:${sale.saleKeys.nostr.publicKey}`);
    expect(within(row).getByText("—")).toBeTruthy();
    expect(within(row).getByText(/^\d\d:\d\d · You$/)).toBeTruthy();
    expect(screen.queryByText("Payment")).toBeNull();
  });

  it("names You for a sale one of the owner's devices marked, without any of its records", async () => {
    mockNetwork.mockReturnValue("mainnet");
    const team = deriveTeamKeys(walletSecret(testSeed()));
    const now = Math.floor(Date.now() / 1000);
    // Older than the records read (a month), or its records lost: its declaration's mark says it.
    const { paymentHash } = preimagePair(7);
    const pr = makeInvoice({
      amountMsat: 18_420_000n,
      paymentHash,
      timestamp: now - 300,
      expirySeconds: 600
    });
    const shown = { pr, decoded: decodeBolt11(pr)!, verifyUrl: `https://breez.tips/verify/x` };
    const sale = saleRegistry(deriveBusinessRegistry(team), new Uint8Array(32).fill(7));
    await declareInvoice(
      {
        ...sale,
        taker: takerTag(ownerTakerKey(ownerDevicesSecret(team)), sale.saleKeys.nostr.publicKey)
      },
      shown,
      { fiat: { minor: 1746, digits: 2, currency: "CHF" }, note: "Table 12" }
    );
    const [first] = sdk.fakeWallet.payments;
    const details = first.details as { tag: string; inner: Record<string, unknown> };
    sdk.fakeWallet.payments = [
      {
        ...first,
        id: "mine",
        timestamp: BigInt(now - 240),
        details: { ...details, inner: { ...details.inner, htlcDetails: { paymentHash } } }
      },
      ...sdk.fakeWallet.payments.slice(1)
    ];

    await openWalletScreen();
    const row = await screen.findByTestId(`activity-row-sale:${sale.saleKeys.nostr.publicKey}`);
    expect(within(row).getByText(/^\d\d:\d\d · You$/)).toBeTruthy();
  });

  it('shows a transfer the SDK cannot tell as "Deposit" or "Withdrawal", never the sale it names', async () => {
    mockNetwork.mockReturnValue("mainnet");
    const team = deriveTeamKeys(walletSecret(testSeed()));
    const now = Math.floor(Date.now() / 1000);
    // A sale declared and vouched for, as in the test above.
    const { paymentHash, preimage } = preimagePair(7);
    const pr = makeInvoice({
      amountMsat: 18_420_000n,
      paymentHash,
      timestamp: now - 300,
      expirySeconds: 600
    });
    const shown = { pr, decoded: decodeBolt11(pr)!, verifyUrl: `https://breez.tips/verify/x` };
    const sale = saleRegistry(deriveBusinessRegistry(team), new Uint8Array(32).fill(7));
    await declareInvoice(
      {
        ...sale,
        taker: takerTag(ownerTakerKey(ownerDevicesSecret(team)), sale.saleKeys.nostr.publicKey)
      },
      shown,
      { fiat: { minor: 1746, digits: 2, currency: "CHF" }, note: "Table 12" }
    );
    // As spark-sdk 0.27.0 on stores transfers of a type it does not know: the received one with
    // the details of that sale's receipt (its hash and preimage), which prove nothing of it.
    sdk.fakeWallet.payments = [
      sdk.unknownMethodPayment({
        id: "unknown-in",
        amount: BigInt(18420),
        timestamp: now - 240,
        details: {
          tag: sdk.PaymentDetails_Tags.Lightning,
          inner: {
            description: "Table 12",
            invoice: pr,
            destinationPubkey: "02ab",
            htlcDetails: { paymentHash, preimage }
          }
        }
      }),
      sdk.unknownMethodPayment({
        id: "unknown-out",
        send: true,
        amount: BigInt(5000),
        fees: BigInt(7),
        timestamp: now - 360
      })
    ];

    await openWalletScreen();
    const received = await screen.findByTestId("activity-row-payment:unknown-in");
    expect(screen.queryByTestId(`activity-row-sale:${sale.saleKeys.nostr.publicKey}`)).toBeNull();
    expect(within(received).getByText("Deposit")).toBeTruthy();
    // Its time alone under it: no kind is said.
    expect(within(received).getByText(/^\d\d:\d\d$/)).toBeTruthy();
    expect(within(received).queryByText(/Lightning receipt|Table 12/)).toBeNull();
    const sent = screen.getByTestId("activity-row-payment:unknown-out");
    expect(within(sent).getByText("Withdrawal")).toBeTruthy();

    // Its details: neither its type, its network nor its fee; its reference is the wallet's id.
    await fireEvent.press(sent);
    const sheet = await screen.findByTestId("activity-detail-sheet");
    expect(within(sheet).getByRole("header")).toHaveTextContent("Sent");
    const detail = within(sheet).getByTestId("activity-detail");
    expect(detail).toHaveTextContent(/Withdrawal/);
    expect(detail).toHaveTextContent(/unknown-out/);
    for (const label of ["Type", "Payment type", "Fees", "Sending fees"]) {
      expect(within(detail).queryByText(label)).toBeNull();
    }
  });

  it.each([
    // The logo of the platform it was created for, removed since or not.
    ["the logo of its platform", "pretix", false, "integration-avatar-pretix"],
    ["the logo of its platform, removed since", "pretix", true, "integration-avatar-pretix"],
    ["its code icon, of a platform a newer app offers", "newer-shop", false, "integration-avatar"]
  ] as const)(
    "shows an integration's sale as Integration, by its name and %s",
    async (_, platform, removed, avatar) => {
      mockNetwork.mockReturnValue("mainnet");
      const team = deriveTeamKeys(walletSecret(testSeed()));
      const now = Math.floor(Date.now() / 1000);
      const INTEGRATION = "00112233445566778899aabbccddeeff";
      await saveMerchantSettings(TEST_WALLET_ID, settings);
      const integration = {
        id: INTEGRATION,
        name: "Online shop",
        createdAt: now - 86_400,
        platform
      };
      await publishIntegration(team, integration);
      // Removed after its sale was paid: still its sale, by the name and the logo its record keeps.
      if (removed) await publishRemoved(team, integration, now - 60);
      // A sale of its server (docs/integrations.md): asked in sats alone, its order's reference as
      // its note, marked with its secret key; no record of it anywhere.
      const { paymentHash } = preimagePair(7);
      const pr = makeInvoice({
        amountMsat: 18_420_000n,
        paymentHash,
        timestamp: now - 300,
        expirySeconds: 600
      });
      const shown = { pr, decoded: decodeBolt11(pr)!, verifyUrl: `https://breez.tips/verify/x` };
      const sale = saleRegistry(deriveBusinessRegistry(team), new Uint8Array(32).fill(7));
      const { takerKey } = deriveIntegrationKeys(integrationSecretKey(team, INTEGRATION));
      await declareInvoice(
        { ...sale, taker: takerTag(takerKey, sale.saleKeys.nostr.publicKey) },
        shown,
        { fiat: { minor: 18_420, digits: 0, currency: SATS_CURRENCY }, note: "CMD-1042" }
      );
      const [first] = sdk.fakeWallet.payments;
      const details = first.details as { tag: string; inner: Record<string, unknown> };
      sdk.fakeWallet.payments = [
        {
          ...first,
          id: "shop",
          timestamp: BigInt(now - 240),
          details: { ...details, inner: { ...details.inner, htlcDetails: { paymentHash } } }
        },
        ...sdk.fakeWallet.payments.slice(1)
      ];

      await openWalletScreen();
      const row = await screen.findByTestId(`activity-row-sale:${sale.saleKeys.nostr.publicKey}`);
      expect(within(row).getByText("CMD-1042")).toBeTruthy();
      expect(within(row).getByText(/^\d\d:\d\d · Online shop$/)).toBeTruthy();
      // Its sats at the rate recorded at its payment (100 000 CHF, payment-rates.ts), never an
      // amount of a currency "SAT".
      expect(await within(row).findByText(chf(1842))).toBeTruthy();
      expect(within(row).queryByText(/SAT\b/)).toBeNull();

      await fireEvent.press(row);
      const detail = within(await screen.findByTestId("activity-detail-sheet"));
      expect(detail.getByRole("header")).toHaveTextContent("Integration");
      expect(detail.getByText("Taken by")).toBeTruthy();
      expect(detail.getByText("Online shop")).toBeTruthy();
      expect(
        detail
          .getAllByTestId(/^integration-avatar/, { includeHiddenElements: true })
          .map((node) => node.props.testID as string)
      ).toEqual([avatar]);
    }
  );

  it("shows an integration's order paid on-chain as Confirming until credited, and why", async () => {
    const { rowId } = await payIntegrationOrderOnchain();
    await openWalletScreen();
    const row = await screen.findByTestId(`activity-row-${rowId}`);
    expect(within(row).getByText("CMD-2001")).toBeTruthy();
    // "Paid" only once its sats are in the balance: "Confirming" until then, in "To follow up"
    // with the withdrawal being confirmed.
    expect(within(row).getByText(/ · Confirming$/)).toBeTruthy();
    expect(
      within(screen.getByTestId("activity-follow-up-unconfirmed")).getByText("2")
    ).toBeTruthy();
    // A clock, its francs in grey, "not in balance yet" in place of its sats.
    const amount = within(row).getByTestId(`activity-pending-amount-${rowId}`);
    expect(StyleSheet.flatten(within(amount).getByText(chf(150)).props.style).color).toBe(
      colors.text.secondary
    );
    expect(within(amount).getByText(CLOCK, { includeHiddenElements: true })).toBeTruthy();
    // Read with the row's other texts: no hint saying it again.
    expect(within(row).getByText("not in balance yet")).toBeTruthy();
    expect(row.props.accessibilityHint).toBeUndefined();

    await fireEvent.press(row);
    const detail = within(await screen.findByTestId("activity-detail-sheet"));
    expect(detail.getAllByText("Confirming").length).toBeGreaterThan(0);
    expect(detail.queryByText("Paid")).toBeNull();
    expect(detail.getByText("Online shop")).toBeTruthy();
    // Its callout: received, then its credit, waiting; then why.
    const callout = within(detail.getByTestId("activity-pending-credit"));
    expect(callout.getByLabelText("Payment received, confirmed")).toBeTruthy();
    expect(callout.getByLabelText("Added to your balance, pending")).toBeTruthy();
    expect(
      callout.getByText(
        "Crediting this payment to your balance currently costs 450 sats, more than our limit of 300 sats. It will happen automatically once that cost no longer exceeds it, when you open your wallet."
      )
    ).toBeTruthy();
    expect(detail.getByText("9c9c9c9c…9c9c")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByTestId("activity-detail-sheet")).toBeNull());

    // Under the balance: what is not credited yet, read as one sentence.
    const pending = screen.getByTestId("wallet-pending-balance");
    expect(within(screen.getByTestId("wallet-balance")).getByTestId("wallet-pending-balance")).toBe(
      pending
    );
    // At least 1 500 − 300 = 1 200 sats (300 sats: the most its claim takes), 1.20 CHF.
    expect(within(pending).getByText("at least")).toBeTruthy();
    expect(within(pending).getByText(chf(120, "+"))).toBeTruthy();
    expect(within(pending).getByText("not in balance yet")).toBeTruthy();
    expect(within(pending).getByText(CLOCK, { includeHiddenElements: true })).toBeTruthy();
    expect(pending.props.accessibilityLabel).toBe(`at least ${chf(120, "+")} not in balance yet`);
  });

  it("tells the price of a deposit's claim only once the first sync tried the claim again", async () => {
    const { rowId } = await payIntegrationOrderOnchain();
    const release = sdk.holdFirstSync();
    await openWalletScreen();
    await fireEvent.press(await screen.findByTestId(`activity-row-${rowId}`));
    const detail = within(await screen.findByTestId("activity-detail-sheet"));
    // Before it, the price the SDK kept may be days old: its limit only.
    const callout = within(detail.getByTestId("activity-pending-credit"));
    expect(
      callout.getByText(
        "Crediting this payment to your balance currently costs more than 300 sats, our limit. It will happen automatically once that cost no longer exceeds it, when you open your wallet."
      )
    ).toBeTruthy();
    expect(callout.queryByText(/450 sats/)).toBeNull();

    // The sync's attempt was refused again, at a new price.
    sdk.fakeWallet.unclaimedDeposits = sdk.fakeWallet.unclaimedDeposits.map((deposit) => ({
      ...deposit,
      claimError: {
        tag: sdk.DepositClaimError_Tags.MaxDepositClaimFeeExceeded,
        inner: { tx: deposit.txid, vout: 0, requiredFeeSats: BigInt(1234) }
      }
    }));
    await act(async () => release());
    expect(
      await within(screen.getByTestId("activity-pending-credit")).findByText(
        /^Crediting this payment to your balance currently costs 1.234 sats, more than our limit of 300 sats\./
      )
    ).toBeTruthy();
  });

  it("counts under the balance every confirmed deposit not credited yet, and only those", async () => {
    // Paid by nothing the activity names, then one not confirmed yet.
    sdk.fakeWallet.unclaimedDeposits = [
      { txid: "a1".repeat(32), vout: 0, amountSats: BigInt(2000), isMature: true },
      { txid: "a2".repeat(32), vout: 0, amountSats: BigInt(9000), isMature: false }
    ];
    await openWalletScreen();
    const pending = await screen.findByTestId("wallet-pending-balance");
    // 2 000 − 300 = 1 700 sats: 1.70 CHF.
    expect(within(pending).getByText(chf(170, "+"))).toBeTruthy();
    // No row of its own: it names no sale.
    expect(screen.queryByTestId(/^activity-pending-amount-/)).toBeNull();
  });

  it("follows an integration's orders paid on-chain: underpaid, then being confirmed", async () => {
    mockNetwork.mockReturnValue("mainnet");
    const team = deriveTeamKeys(walletSecret(testSeed()));
    const now = Math.floor(Date.now() / 1000);
    const INTEGRATION = "00112233445566778899aabbccddeeff";
    await publishIntegration(team, {
      id: INTEGRATION,
      name: "Online shop",
      createdAt: now - 86_400,
      platform: "node"
    });
    const keys = deriveIntegrationKeys(integrationSecretKey(team, INTEGRATION));
    // Two orders of its server, their leases ended: one paid 20 000 of its 49 000 sats in time,
    // one paid in full, not confirmed yet. The wallet knows nothing of either.
    const order = async (fill: number, ref: string, paid: bigint) => {
      const address = taprootAddress(fill);
      const sale = saleRegistry(deriveBusinessRegistry(team), new Uint8Array(32).fill(fill));
      const marked = { ...sale, taker: takerTag(keys.takerKey, sale.saleKeys.nostr.publicKey) };
      await publishToRelays(
        leaseEvent(
          marked,
          {
            address,
            sats: 49_000n,
            invoice: null,
            createdAt: now - 9000,
            expiresAt: now - 8000,
            confirmed: true
          },
          { fiat: { minor: 2450, digits: 2, currency: "CHF" }, note: ref },
          now - 9000
        ),
        { relays: DEFAULT_RELAYS, channel: "anonymous", timeoutMs: 1000 }
      );
      const txid = mempool.pay(address, paid);
      await publishToRelays(
        witnessEvent(
          keys,
          {
            address,
            txid,
            sale: sale.saleKeys.nostr.publicKey,
            sats: paid,
            inputs: [],
            replacement: false,
            expiresAt: now - 8000
          },
          now - 8500
        ),
        {
          relays: DEFAULT_RELAYS,
          channel: "account",
          timeoutMs: 1000,
          authKey: keys.seen.nostr.secretKey
        }
      );
      return sale.saleKeys.nostr.publicKey;
    };
    const underpaid = await order(7, "CMD-1042", 20_000n);
    const confirming = await order(8, "CMD-1043", 49_000n);

    await openWalletScreen();
    const row = await screen.findByTestId(`activity-row-sale:${underpaid}`);
    expect(within(row).getByText("CMD-1042")).toBeTruthy();
    // Its state in place of its source, as an underpaid sale of the point of sale; its sats
    // received.
    expect(within(row).getByText(/ · Underpaid$/)).toBeTruthy();
    expect(within(row).getByText("20'000 sats")).toBeTruthy();
    const other = screen.getByTestId(`activity-row-sale:${confirming}`);
    expect(within(other).getByText("CMD-1043")).toBeTruthy();
    expect(within(other).getByText(/ · Confirming$/)).toBeTruthy();
    // "To follow up": the order underpaid, by its rest (29 000 of 49 000 sats: 14.50 of 24.50 CHF),
    // and the order being confirmed beside the wallet's withdrawal.
    const tile = screen.getByTestId("activity-follow-up-underpaid");
    expect(within(tile).getByText("1")).toBeTruthy();
    expect(within(tile).getByText(new RegExp(chf(1450)))).toBeTruthy();
    expect(
      within(screen.getByTestId("activity-follow-up-unconfirmed")).getByText("2")
    ).toBeTruthy();
  });

  it("lets the owner accept an integration's order paid short after its invoice's end, its shop not told", async () => {
    // Its server keeps the order expired (an acceptance dated after
    // the lease's end counts for nothing there), so the owner is warned before and after.
    mockNetwork.mockReturnValue("mainnet");
    const team = deriveTeamKeys(walletSecret(testSeed()));
    const now = Math.floor(Date.now() / 1000);
    const INTEGRATION = "00112233445566778899aabbccddeeff";
    await publishIntegration(team, {
      id: INTEGRATION,
      name: "Online shop",
      createdAt: now - 86_400,
      platform: "node"
    });
    const keys = deriveIntegrationKeys(integrationSecretKey(team, INTEGRATION));
    const address = taprootAddress(7);
    const sale = saleRegistry(deriveBusinessRegistry(team), new Uint8Array(32).fill(7));
    const marked = { ...sale, taker: takerTag(keys.takerKey, sale.saleKeys.nostr.publicKey) };
    const expiresAt = now - 8000;
    await publishToRelays(
      leaseEvent(
        marked,
        {
          address,
          sats: 49_000n,
          invoice: null,
          createdAt: now - 9000,
          expiresAt,
          confirmed: true
        },
        { fiat: { minor: 2450, digits: 2, currency: "CHF" }, note: "CMD-1042" },
        now - 9000
      ),
      { relays: DEFAULT_RELAYS, channel: "anonymous", timeoutMs: 1000 }
    );
    const txid = mempool.pay(address, 20_000n);
    await publishToRelays(
      witnessEvent(
        keys,
        {
          address,
          txid,
          sale: sale.saleKeys.nostr.publicKey,
          sats: 20_000n,
          inputs: [],
          replacement: false,
          expiresAt
        },
        now - 8500
      ),
      {
        relays: DEFAULT_RELAYS,
        channel: "account",
        timeoutMs: 1000,
        authKey: keys.seen.nostr.secretKey
      }
    );
    const rowId = `activity-row-sale:${sale.saleKeys.nostr.publicKey}`;

    await openWalletScreen();
    expect(within(await screen.findByTestId(rowId)).getByText(/ · Underpaid$/)).toBeTruthy();
    await fireEvent.press(screen.getByTestId(rowId));
    const sheet = within(await screen.findByTestId("activity-detail-sheet"));
    // Offered, under the warning that its shop keeps the order expired, by its name.
    await sheet.findByTestId("activity-accept");
    // Under the details, never inside what scrolls: a dialog's 640 on a computer would hide it
    // below them.
    const details = within(sheet.getByTestId("activity-detail"));
    expect(details.queryByTestId("activity-accept")).toBeNull();
    expect(details.queryByTestId("activity-accept-late")).toBeNull();
    const warning = within(sheet.getByTestId("activity-accept-late"));
    expect(warning.getByText("This order's invoice has ended")).toBeTruthy();
    expect(
      warning.getByText(
        "The order stays expired for Online shop, which will not see your acceptance. If you accept it here, also mark it as paid in its back office."
      )
    ).toBeTruthy();
    await fireEvent.press(sheet.getByTestId("activity-accept"));
    // 20 000 of 49 000 sats of 24.50 CHF: 10.00 received, 14.50 no longer asked (splitFiat).
    const dialog = within(await screen.findByTestId("activity-accept-dialog"));
    expect(
      dialog.getByText(
        `The order will be paid at ${chf(1000)} and the difference of ${chf(1450)} will no longer be asked for. This acceptance is not passed on to Online shop, which keeps the order expired: also mark it as paid in its back office. This is final.`
      )
    ).toBeTruthy();
    await fireEvent.press(screen.getByTestId("activity-accept-confirm"));
    expect(await screen.findByText("Amount received accepted")).toBeTruthy();

    // Accepted: no longer underpaid ("Confirming" while the wallet has not credited its
    // deposit), never offered again, the warning kept.
    await waitFor(() =>
      expect(within(screen.getByTestId(rowId)).queryByText(/Underpaid/)).toBeNull()
    );
    const detail = within(screen.getByTestId("activity-detail-sheet"));
    expect(detail.queryByTestId("activity-accept")).toBeNull();
    expect(detail.getByText("Accepted on")).toBeTruthy();
    expect(
      within(detail.getByTestId("activity-detail")).queryByTestId("activity-accepted-late")
    ).toBeNull();
    expect(
      within(detail.getByTestId("activity-accepted-late")).getByText(
        "Accepted too late to be sent to Online shop, which keeps the order expired. Check that it is marked paid in its back office."
      )
    ).toBeTruthy();
    // The owner's own record, never the one its server reads.
    const lateAddress = lateAcceptanceAddress(deriveLateAcceptanceKeys(team), INTEGRATION, {
      sale: sale.saleKeys.nostr.publicKey,
      address,
      expiresAt
    });
    const holders = DEFAULT_RELAYS.filter((relay) =>
      (relays.stored.get(relay) ?? []).some(({ tags }) =>
        tags.some(([name, value]) => name === "d" && value === lateAddress)
      )
    );
    expect(holders.length).toBeGreaterThanOrEqual(3);
  });

  /**
   * An order of integration "Online shop" paid 20 000 of its 49 000 sats, its invoice
   * ending at `expiresAt`: the id of its row.
   */
  async function underpaidOrder(
    team: ReturnType<typeof deriveTeamKeys>,
    fill: number,
    expiresAt: number
  ): Promise<{ rowId: string; sale: string; address: string }> {
    const keys = deriveIntegrationKeys(
      integrationSecretKey(team, "00112233445566778899aabbccddeeff")
    );
    const address = taprootAddress(fill);
    const sale = saleRegistry(deriveBusinessRegistry(team), new Uint8Array(32).fill(fill));
    const marked = { ...sale, taker: takerTag(keys.takerKey, sale.saleKeys.nostr.publicKey) };
    await publishToRelays(
      leaseEvent(
        marked,
        {
          address,
          sats: 49_000n,
          invoice: null,
          createdAt: expiresAt - 1000,
          expiresAt,
          confirmed: true
        },
        { fiat: { minor: 2450, digits: 2, currency: "CHF" }, note: `CMD-${fill}` },
        expiresAt - 1000
      ),
      { relays: DEFAULT_RELAYS, channel: "anonymous", timeoutMs: 1000 }
    );
    const txid = mempool.pay(address, 20_000n);
    await publishToRelays(
      witnessEvent(
        keys,
        {
          address,
          txid,
          sale: sale.saleKeys.nostr.publicKey,
          sats: 20_000n,
          inputs: [],
          replacement: false,
          expiresAt
        },
        expiresAt - 500
      ),
      {
        relays: DEFAULT_RELAYS,
        channel: "account",
        timeoutMs: 1000,
        authKey: keys.seen.nostr.secretKey
      }
    );
    return {
      rowId: `activity-row-sale:${sale.saleKeys.nostr.publicKey}`,
      sale: sale.saleKeys.nostr.publicKey,
      address
    };
  }

  it('never shows an order "Paid" by an acceptance fewer than a majority held at its end', async () => {
    // Checkout-spec SPEC.md §31: its server counts the merchant's acceptance only when a majority
    // of the relays sent it; nothing sends it from 5 minutes before the invoice's end. Made in
    // time, it reached two relays of five: not made, the owner may accept it late, told why.
    mockNetwork.mockReturnValue("mainnet");
    const team = deriveTeamKeys(walletSecret(testSeed()));
    const now = Math.floor(Date.now() / 1000);
    const INTEGRATION = "00112233445566778899aabbccddeeff";
    await publishIntegration(team, {
      id: INTEGRATION,
      name: "Online shop",
      createdAt: now - 86_400,
      platform: "node"
    });
    const expiresAt = now - 8000;
    const { rowId, sale, address } = await underpaidOrder(team, 9, expiresAt);
    const integrationKey = integrationSecretKey(team, INTEGRATION);
    const acceptance = orderAcceptanceEvent(
      team,
      deriveIntegrationKeys(integrationKey),
      integrationKey,
      { sale, address, expiresAt, sats: 49_000n },
      20_000n,
      expiresAt - 400
    );
    for (const relay of DEFAULT_RELAYS.slice(0, 2)) {
      relays.stored.set(relay, [...(relays.stored.get(relay) ?? []), acceptance]);
    }

    await openWalletScreen();
    await fireEvent.press(await screen.findByTestId(rowId));
    const sheet = within(await screen.findByTestId("activity-detail-sheet"));
    const warning = within(await sheet.findByTestId("activity-accept-late"));
    expect(warning.getByText("This order's invoice has ended")).toBeTruthy();
    expect(
      warning.getByText(
        "Your acceptance did not reach a majority of your relays before the invoice ended: Online shop will not see it. If you accept it here, also mark it as paid in its back office."
      )
    ).toBeTruthy();
    // "Underpaid", as its payments tell it; offered late only.
    expect(within(screen.getByTestId(rowId)).getByText(/ · Underpaid$/)).toBeTruthy();
    expect(sheet.queryByText("Accepted on")).toBeNull();
    expect(sheet.getByTestId("activity-accept")).toBeTruthy();
    // Never sent to the other relays.
    expect(
      relays.calls.filter(
        ({ operation, event }) => operation === "publish" && event?.id === acceptance.id
      )
    ).toEqual([]);
  });

  it("says why an order cannot be accepted while its acceptance is not read on a majority", async () => {
    // The owner's late acceptance, read on two relays of five only (three cut short): it may be
    // made already, on another device. No action, nor nothing: told why.
    mockNetwork.mockReturnValue("mainnet");
    const team = deriveTeamKeys(walletSecret(testSeed()));
    const now = Math.floor(Date.now() / 1000);
    const INTEGRATION = "00112233445566778899aabbccddeeff";
    await publishIntegration(team, {
      id: INTEGRATION,
      name: "Online shop",
      createdAt: now - 86_400,
      platform: "node"
    });
    const expiresAt = now - 3 * 86_400;
    const { rowId, sale, address } = await underpaidOrder(team, 13, expiresAt);
    const lateAddress = lateAcceptanceAddress(deriveLateAcceptanceKeys(team), INTEGRATION, {
      sale,
      address,
      expiresAt
    });
    for (const relay of DEFAULT_RELAYS.slice(0, 3)) {
      relays.failingTags.set(relay, new Set([lateAddress]));
    }

    await openWalletScreen();
    await fireEvent.press(await screen.findByTestId(rowId));
    const sheet = within(await screen.findByTestId("activity-detail-sheet"));
    // Read on every relay (three cut short): the reason stays once the read is done, not only
    // while it runs.
    await waitFor(() =>
      expect(
        relays.calls.filter(
          ({ operation, filter }) => operation === "query" && filter?.["#d"]?.includes(lateAddress)
        ).length
      ).toBeGreaterThanOrEqual(DEFAULT_RELAYS.length)
    );
    for (let flush = 0; flush < 20; flush += 1) await act(async () => {});
    const reason = within(sheet.getByTestId("activity-accept-blocked-unread"));
    expect(
      reason.getByText(
        "The app has not yet been able to check with a majority of your relays whether the amount received has already been accepted. “Accept the amount received” will appear here once this check is done. If it lasts, use “Test the connection” in “Nostr relays”."
      )
    ).toBeTruthy();
    expect(within(screen.getByTestId(rowId)).getByText(/ · Underpaid$/)).toBeTruthy();
    expect(sheet.queryByTestId("activity-accept")).toBeNull();
    expect(sheet.queryByTestId("activity-accept-late")).toBeNull();
  });

  it("says why an order accepted at more than it received now is not offered again", async () => {
    // Accepted in time at 25 000 sats; its payments now tell 20 000 (one replaced since): its
    // acceptance does not count, and is never made twice.
    mockNetwork.mockReturnValue("mainnet");
    const team = deriveTeamKeys(walletSecret(testSeed()));
    const now = Math.floor(Date.now() / 1000);
    const INTEGRATION = "00112233445566778899aabbccddeeff";
    await publishIntegration(team, {
      id: INTEGRATION,
      name: "Online shop",
      createdAt: now - 86_400,
      platform: "node"
    });
    const expiresAt = now - 8000;
    const { rowId, sale, address } = await underpaidOrder(team, 14, expiresAt);
    const integrationKey = integrationSecretKey(team, INTEGRATION);
    const acceptance = orderAcceptanceEvent(
      team,
      deriveIntegrationKeys(integrationKey),
      integrationKey,
      { sale, address, expiresAt, sats: 49_000n },
      25_000n,
      expiresAt - 400
    );
    for (const relay of DEFAULT_RELAYS) {
      relays.stored.set(relay, [...(relays.stored.get(relay) ?? []), acceptance]);
    }

    await openWalletScreen();
    await fireEvent.press(await screen.findByTestId(rowId));
    const sheet = within(await screen.findByTestId("activity-detail-sheet"));
    const reason = within(await sheet.findByTestId("activity-accept-blocked-unmet"));
    // 24.50 CHF for 49 000 sats: 12.50 CHF at 25 000, as the point of sale splits it.
    expect(
      reason.getByText(
        /^The amount received was accepted when it was .*12\.50.*, but the app sees less today, for example after a transaction was replaced\. The acceptance counts again as soon as this amount is reached: it is not made twice\.$/
      )
    ).toBeTruthy();
    expect(within(screen.getByTestId(rowId)).getByText(/ · Underpaid$/)).toBeTruthy();
    expect(sheet.queryByTestId("activity-accept")).toBeNull();
    expect(sheet.queryByText("Accepted on")).toBeNull();
  });

  it("tells an order's acceptance a minority holds while its invoice runs: being sent, not Paid", async () => {
    mockNetwork.mockReturnValue("mainnet");
    const team = deriveTeamKeys(walletSecret(testSeed()));
    const now = Math.floor(Date.now() / 1000);
    const INTEGRATION = "00112233445566778899aabbccddeeff";
    await publishIntegration(team, {
      id: INTEGRATION,
      name: "Online shop",
      createdAt: now - 86_400,
      platform: "node"
    });
    const expiresAt = now + 1800;
    const { rowId, sale, address } = await underpaidOrder(team, 12, expiresAt);
    const integrationKey = integrationSecretKey(team, INTEGRATION);
    const acceptance = orderAcceptanceEvent(
      team,
      deriveIntegrationKeys(integrationKey),
      integrationKey,
      { sale, address, expiresAt, sats: 49_000n },
      20_000n,
      now - 60
    );
    for (const relay of DEFAULT_RELAYS.slice(0, 2)) {
      relays.stored.set(relay, [...(relays.stored.get(relay) ?? []), acceptance]);
    }
    // The others' writes held: still a minority's while the row shows.
    const release = relays.holdPublishes();

    await openWalletScreen();
    await fireEvent.press(await screen.findByTestId(rowId));
    const sheet = within(await screen.findByTestId("activity-detail-sheet"));
    expect(
      within(await sheet.findByTestId("activity-acceptance-pending")).getByText(
        "Acceptance being saved: it will count once a majority of your relays have received it, before the invoice ends."
      )
    ).toBeTruthy();
    expect(within(screen.getByTestId(rowId)).getByText(/ · Underpaid$/)).toBeTruthy();
    expect(sheet.queryByText("Accepted on")).toBeNull();
    expect(sheet.queryByTestId("activity-accept")).toBeNull();
    // Being sent to the three others.
    await waitFor(() =>
      expect(
        relays.calls.filter(
          ({ operation, event }) => operation === "publish" && event?.id === acceptance.id
        )
      ).toHaveLength(3)
    );
    await act(async () => release());
  });

  it("offers an order in its invoice's last 5 minutes late only, its shop not told", async () => {
    // ACCEPTANCE_CLOCK_MARGIN_SECONDS (onchain-acceptance.ts): this app's clock may run behind, the
    // acceptance its server reads must reach the relays before the invoice's end (SPEC.md §31).
    mockNetwork.mockReturnValue("mainnet");
    const team = deriveTeamKeys(walletSecret(testSeed()));
    const now = Math.floor(Date.now() / 1000);
    await publishIntegration(team, {
      id: "00112233445566778899aabbccddeeff",
      name: "Online shop",
      createdAt: now - 86_400,
      platform: "node"
    });
    const { rowId: closing } = await underpaidOrder(team, 10, now + 120);
    const { rowId: open } = await underpaidOrder(team, 11, now + 1800);

    await openWalletScreen();
    await fireEvent.press(await screen.findByTestId(open));
    let sheet = within(await screen.findByTestId("activity-detail-sheet"));
    expect(await sheet.findByTestId("activity-accept")).toBeTruthy();
    expect(sheet.queryByTestId("activity-accept-late")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByTestId("activity-detail-sheet")).toBeNull());

    await fireEvent.press(screen.getByTestId(closing));
    sheet = within(await screen.findByTestId("activity-detail-sheet"));
    const warning = within(await sheet.findByTestId("activity-accept-late"));
    expect(warning.getByText("This order's invoice is ending")).toBeTruthy();
    expect(
      warning.getByText(
        "It is too late for Online shop to receive your acceptance. If you accept it here, also mark it as paid in its back office."
      )
    ).toBeTruthy();
    await fireEvent.press(sheet.getByTestId("activity-accept"));
    expect(
      within(await screen.findByTestId("activity-accept-dialog")).getByText(
        /^The order will be paid at .* This acceptance is not passed on to Online shop/
      )
    ).toBeTruthy();
  });

  it('opens "Send" over the wallet, the recipient alone first', async () => {
    const { router } = await openWalletScreen();
    await screen.findByText("Till B");
    await fireEvent.press(screen.getByTestId("wallet-send"));
    expect(router.getPathname()).toBe("/wallet");
    expect(await screen.findByTestId("send-sheet")).toBeTruthy();
    expect(screen.getByLabelText("Recipient")).toBeTruthy();
    // "Paste" and "Scan a QR code" in the field, icons only.
    expect(screen.getByLabelText("Paste")).toBe(screen.getByTestId("send-paste"));
    expect(screen.getByLabelText("Scan a QR code")).toBe(screen.getByTestId("send-scan"));
    expect(screen.queryByText("Paste")).toBeNull();
    expect(screen.queryByLabelText("Amount")).toBeNull();
  });

  it('disables "Send" while the balance is 0 sats', async () => {
    sdk.fakeWallet.balanceSats = BigInt(0);
    await openWalletScreen();
    await screen.findByText("Till B");
    expect(screen.getByTestId("wallet-send")).toBeDisabled();
    await fireEvent.press(screen.getByTestId("wallet-send"));
    expect(screen.queryByTestId("send-sheet")).toBeNull();
  });

  it('grays "Sell" under 10 sats, "from 10 sats" in it', async () => {
    sdk.fakeWallet.balanceSats = BigInt(9);
    const { router } = await openWalletScreen();
    await screen.findByText("Till B");
    const sell = screen.getByTestId("wallet-sell");
    expect(sell).toBeDisabled();
    expect(sell).toHaveTextContent(/^.?Sell.?from 10 sats$/);
    await fireEvent.press(sell);
    expect(router.getPathname()).toBe("/wallet");
    expect(screen.queryByTestId("sell-sheet")).toBeNull();
  });

  it("opens Sell's panel from 10 sats, beside New invoice", async () => {
    sdk.fakeWallet.balanceSats = BigInt(10);
    // Its Mt Pelerin invoices are checked against the build's network.
    mockNetwork.mockReturnValue("mainnet");
    const { router } = await openWalletScreen();
    await screen.findByText("Till B");
    const sell = screen.getByTestId("wallet-sell");
    expect(sell).not.toBeDisabled();
    expect(sell).toHaveTextContent(/^.?Sell$/);
    expect(screen.getByTestId("wallet-new-invoice")).toBeTruthy();
    await fireEvent.press(sell);
    // Its panel over "Wallet" (sell-screen.test.tsx goes through its steps).
    expect(await screen.findByTestId("sell-sheet")).toBeTruthy();
    expect(router.getPathname()).toBe("/wallet");
    await fireEvent.press(screen.getByTestId("sheet-close"));
    await waitFor(() => expect(screen.queryByTestId("sell-sheet")).toBeNull());
  });

  it('says so when the wallet does not open, and opens it with "Try again"', async () => {
    sdk.connect.mockRejectedValueOnce(new Error("Offline"));
    await openWalletScreen();
    expect(await screen.findByTestId("wallet-open-failed")).toBeTruthy();
    expect(
      screen.getByText(
        "Your wallet could not be opened. Check your internet connection, then try again."
      )
    ).toBeTruthy();
    // Tried once on arrival, not again on its own.
    expect(sdk.connect).toHaveBeenCalledTimes(1);

    await fireEvent.press(screen.getByTestId("wallet-open-retry"));
    expect(await screen.findByText("Till B")).toBeTruthy();
    expect(screen.queryByTestId("wallet-open-failed")).toBeNull();
    expect(signIn).toHaveBeenCalledTimes(1);
  });

  it("shows that it opens while the wallet connects", async () => {
    let connected!: () => void;
    const connecting = new Promise<void>((resolve) => (connected = resolve));
    const connect = sdk.connect.getMockImplementation()!;
    sdk.connect.mockImplementationOnce(async (...args: unknown[]) => {
      await connecting;
      return connect(...args);
    });
    await openWalletScreen();
    expect(await screen.findByText("Opening your wallet…")).toBeTruthy();
    expect(screen.getByTestId("wallet-opening", { includeHiddenElements: true })).toBeTruthy();
    // Nothing to tap: no passkey, no button.
    expect(screen.queryByTestId("wallet-open-retry")).toBeNull();

    await act(async () => connected());
    expect(await screen.findByText("Till B")).toBeTruthy();
  });

  it("opens again, without a failure, when left and shown again while it connects", async () => {
    let connected!: () => void;
    const connecting = new Promise<void>((resolve) => (connected = resolve));
    const connect = sdk.connect.getMockImplementation()!;
    sdk.connect.mockImplementationOnce(async (...args: unknown[]) => {
      await connecting;
      return connect(...args);
    });
    const { router } = await openWalletScreen();
    await waitFor(() => expect(sdk.connect).toHaveBeenCalledTimes(1));

    await fireEvent.press(screen.getByLabelText("Settings"));
    await waitFor(() => expect(router.getPathname()).toBe("/settings"));
    await fireEvent.press(screen.getByLabelText("Wallet"));
    await waitFor(() => expect(router.getPathname()).toBe("/wallet"));
    // The connection of the first visit ends closed (the screen was left): this visit's own.
    await act(async () => connected());

    expect(await screen.findByText("Till B")).toBeTruthy();
    expect(screen.queryByTestId("wallet-open-failed")).toBeNull();
    expect(sdk.connect).toHaveBeenCalledTimes(2);
    expect(signIn).toHaveBeenCalledTimes(1);
  });

  describe("the movements by day", () => {
    const colorOf = (node: ReturnType<typeof screen.getByText>) =>
      StyleSheet.flatten(node.props.style).color;
    const net = (text: string) => screen.queryByLabelText(`Day's net: ${text}`);

    it("writes each day's net of what is done, signed, none while To follow up keeps its rows", async () => {
      await openWalletScreen();
      // 18.42 received, 150.00 sent; the withdrawal being confirmed is not proven yet.
      await waitFor(() => expect(net(chf(13158, "−"))).toBeTruthy());
      expect(screen.getByText(chf(13158, "−"))).toBeTruthy();

      // "Confirming" chosen: its rows only, no net that would add up the others.
      await fireEvent.press(screen.getByTestId("activity-follow-up-unconfirmed"));
      expect(screen.queryByLabelText(/^Day's net/)).toBeNull();
      await fireEvent.press(screen.getByTestId("activity-clear-filter"));
      expect(net(chf(13158, "−"))).toBeTruthy();
    });

    it("writes the sats first, then the francs, once this device chose so", async () => {
      await saveAmountUnit("sats");
      await openWalletScreen();
      const received = within(await screen.findByTestId("activity-row-payment:p1"));
      // Received: unsigned, in green; its value at its payment unsigned under it.
      expect(colorOf(received.getByText(satsOf(18420)))).toBe(colors.state.settled.fg);
      expect(await received.findByText(chf(1842))).toBeTruthy();
      const sent = within(screen.getByTestId("activity-row-payment:p2"));
      expect(colorOf(sent.getByText(satsOf(150000, "−")))).toBe(colors.text.primary);
      expect(sent.getByText(chf(15000))).toBeTruthy();
      // On its way: at the current rate, under its sats.
      const withdrawal = within(screen.getByTestId("activity-row-payment:p3"));
      expect(withdrawal.getByText(satsOf(400000, "−"))).toBeTruthy();
      expect(withdrawal.getByText(chf(40000))).toBeTruthy();
      // The day's net in sats too.
      expect(net(satsOf(131580, "−"))).toBeTruthy();
      // Its details as well: its sats first, large; its value unsigned under them.
      await fireEvent.press(screen.getByTestId("activity-row-payment:p2"));
      const detail = within(await screen.findByTestId("activity-detail-sheet"));
      expect(detail.getByTestId("activity-detail-value")).toHaveTextContent(chf(15000));
      expect(detail.queryByText(chf(15000, "−"))).toBeNull();
      expect(detail.getByText("−")).toBeTruthy();
    });

    it("values a transfer done at the rate recorded at its payment, never at the current one", async () => {
      // 80 000 CHF at the payments' hours; 100 000 CHF now (mockRate).
      priceTheLastDays(80_000);
      await openWalletScreen();
      const received = within(await screen.findByTestId("activity-row-payment:p1"));
      // 18 420 sats at 80 000 CHF: 14.736 → 14.74 CHF, its sats under it.
      expect(await received.findByText(chf(1474))).toBeTruthy();
      expect(received.getByText(satsOf(18420))).toBeTruthy();
      expect(screen.queryByText(chf(1842))).toBeNull();
      // The withdrawal still on its way: at the current rate, in "To follow up" as on its row.
      expect(screen.getByText(chf(40000, "−"))).toBeTruthy();
      // Its details tell the same value.
      await fireEvent.press(screen.getByTestId("activity-row-payment:p1"));
      const detail = within(await screen.findByTestId("activity-detail-sheet"));
      expect(detail.getByText(chf(1474))).toBeTruthy();
    });

    it("writes a transfer whose rate is not recorded in sats alone, and the day's net in sats", async () => {
      // CoinGecko out of reach: no rate recorded at the payments (payment-rates.ts).
      coingecko.down = true;
      await openWalletScreen();
      const received = within(await screen.findByTestId("activity-row-payment:p1"));
      expect(colorOf(received.getByText(satsOf(18420)))).toBe(colors.state.settled.fg);
      expect(received.queryByText(/CHF$/)).toBeNull();
      expect(
        within(screen.getByTestId("activity-row-payment:p2")).getByText(satsOf(150000, "−"))
      ).toBeTruthy();
      await waitFor(() => expect(net(satsOf(131580, "−"))).toBeTruthy());
      expect(screen.queryByText(chf(13158, "−"))).toBeNull();
    });
  });

  it("shows in sats only what the current rate values during a rate outage", async () => {
    mockRate = undefined;
    await openWalletScreen();
    expect(await screen.findByText("Till B")).toBeTruthy();
    expect(screen.getByText("Exchange rate unavailable: some amounts in sats only.")).toBeTruthy();
    // The transfers done keep their value at their payment (payment-rates.ts), first, their sats
    // under it.
    const received = screen.getByTestId("activity-row-payment:p1");
    expect(await within(received).findByText(chf(1842))).toBeTruthy();
    expect(within(received).getByText("18'420 sats")).toBeTruthy();
    // The withdrawal being confirmed, valued at the current rate: its sats alone, signed.
    const withdrawal = screen.getByTestId("activity-row-payment:p3");
    expect(within(withdrawal).getByText("−400'000 sats")).toBeTruthy();
    expect(within(withdrawal).queryByText(/CHF$/)).toBeNull();
    // The balance too: in sats alone.
    expect(within(screen.getByTestId("wallet-balance")).queryByText(/CHF$/)).toBeNull();
  });

  it("lists the 100 newest payments of a busy month", async () => {
    // At midday, the 120 payments (two minutes) all of one day: from the real clock, just after
    // midnight, the newest 100 would cover the whole new day, which would then show its net.
    const NOON = new Date(2026, 9, 21, 12, 0);
    jest.useFakeTimers({ advanceTimers: true, now: NOON });
    try {
      const newest = NOON.getTime() / 1000;
      sdk.fakeWallet.payments = Array.from({ length: 120 }, (_, i) => ({
        id: `busy-${i}`,
        paymentType: sdk.PaymentType.Receive,
        status: sdk.PaymentStatus.Completed,
        amount: BigInt(1000),
        fees: BigInt(0),
        timestamp: BigInt(newest - i),
        method: sdk.PaymentMethod.Spark,
        details: undefined
      }));
      await openWalletScreen();
      expect(await screen.findByTestId("activity-row-payment:busy-0")).toBeTruthy();
      expect(screen.getAllByTestId(/^activity-row-/)).toHaveLength(100);
      expect(screen.queryByTestId("activity-row-payment:busy-100")).toBeNull();
      // A day shown in part (its older payments beyond the 100): no net.
      expect(screen.queryByLabelText(/^Day's net/)).toBeNull();

      // "Show more": the older ones, then nothing more to see.
      await fireEvent.press(screen.getByTestId("activity-more"));
      expect(await screen.findByTestId("activity-row-payment:busy-119")).toBeTruthy();
      expect(screen.getAllByTestId(/^activity-row-/)).toHaveLength(120);
      expect(screen.queryByTestId("activity-more")).toBeNull();
      // The whole day listed: its net.
      expect(await screen.findByLabelText(/^Day's net: /)).toBeTruthy();
    } finally {
      jest.useRealTimers();
    }
  });

  it('offers no "Show more" while every movement shows', async () => {
    await openWalletScreen();
    expect(await screen.findByTestId("activity-row-payment:p1")).toBeTruthy();
    expect(screen.queryByTestId("activity-more")).toBeNull();
  });

  it("says when there is no payment yet, and how payments come, step by step", async () => {
    sdk.fakeWallet.payments = [];
    await openWalletScreen();
    const guide = await screen.findByTestId("wallet-empty");
    expect(guide).toHaveTextContent(/^No transactions yet\. Here is how they come in:/);
    // Each step one item for screen readers: its number, its title, what it says.
    expect(
      within(guide).getByLabelText(
        "1. Take a payment, Enter an amount at the point of sale: your customer scans the QR code and pays."
      )
    ).toBeTruthy();
    expect(within(guide).getByLabelText(/^2\. Receive, /)).toBeTruthy();
    expect(within(guide).getByLabelText(/^3\. Follow and send, /)).toBeTruthy();
  });

  it("shows this device's payments while the first sync runs, then the newer ones", async () => {
    const release = sdk.holdFirstSync();
    await openWalletScreen();
    expect(await screen.findByText("Till B")).toBeTruthy();
    expect(screen.getByTestId("wallet-syncing")).toHaveTextContent("Updating…");
    expect(screen.getByTestId("wallet-send")).toBeTruthy();
    // Newer payments may come: no day's net yet.
    expect(screen.queryByLabelText(/^Day's net/)).toBeNull();

    // The sync brings a payment this device had not seen.
    sdk.fakeWallet.payments = [
      {
        ...sdk.fakeWallet.payments[0],
        id: "p0",
        details: undefined,
        method: sdk.PaymentMethod.Spark
      },
      ...sdk.fakeWallet.payments
    ];
    await act(async () => release());
    expect(await screen.findByTestId("activity-row-payment:p0")).toBeTruthy();
    // The pill fades out, then goes; synced, the day's net shows.
    await waitFor(() => expect(screen.queryByTestId("wallet-syncing")).toBeNull());
    expect(await screen.findByLabelText(/^Day's net: /)).toBeTruthy();
  });

  it('keeps the sync pill beside the state chosen in "To follow up", one at a time', async () => {
    const release = sdk.holdFirstSync();
    await openWalletScreen();
    expect(await screen.findByText("Till B")).toBeTruthy();
    expect(screen.getByTestId("wallet-syncing")).toBeTruthy();

    await fireEvent.press(screen.getByTestId("activity-follow-up-unconfirmed"));
    expect(screen.getByLabelText("Confirming, clear the filter")).toBeTruthy();
    // The pill of "Transactions" goes with its title: only the state's stays.
    await waitFor(() =>
      expect(screen.getAllByTestId("wallet-syncing", { includeHiddenElements: true })).toHaveLength(
        1
      )
    );
    // Its spinner alone, beside the state's name: its words for screen readers only.
    expect(screen.getByTestId("wallet-syncing")).toHaveAccessibleName("Updating…");
    expect(screen.getByTestId("wallet-syncing")).not.toHaveTextContent("Updating…");

    await act(async () => release());
    await waitFor(() =>
      expect(screen.queryByTestId("wallet-syncing", { includeHiddenElements: true })).toBeNull()
    );
  });

  it("waits for the first sync on a device without any of the wallet, never showing it empty", async () => {
    const { balanceSats, payments } = sdk.fakeWallet;
    sdk.fakeWallet.balanceSats = BigInt(0);
    sdk.fakeWallet.payments = [];
    const release = sdk.holdFirstSync();
    await openWalletScreen();
    // This device's storage read (blank); the read after a sync that reached the network waits.
    const instance = await walletInstance();
    await waitFor(() => expect(instance.getInfo).toHaveBeenCalledWith({ ensureSynced: false }));
    expect(screen.getByText("Syncing your wallet…")).toBeTruthy();
    expect(screen.queryByText("Balance")).toBeNull();
    expect(screen.queryByTestId("wallet-empty")).toBeNull();
    expect(screen.queryByTestId("wallet-send")).toBeNull();

    sdk.fakeWallet.balanceSats = balanceSats;
    sdk.fakeWallet.payments = payments;
    await act(async () => release());
    expect(await screen.findByText("Till B")).toBeTruthy();
    expect(screen.getByText("Balance")).toBeTruthy();
    expect(screen.queryByText("Syncing your wallet…")).toBeNull();
  });

  it("says when the read after the first sync fails on a device without any of the wallet", async () => {
    const { balanceSats, payments } = sdk.fakeWallet;
    sdk.fakeWallet.balanceSats = BigInt(0);
    sdk.fakeWallet.payments = [];
    const release = sdk.holdFirstSync();
    await openWalletScreen();
    const instance = await walletInstance();
    await waitFor(() => expect(instance.getInfo).toHaveBeenCalledWith({ ensureSynced: false }));
    expect(screen.getByText("Syncing your wallet…")).toBeTruthy();

    // A storage error as the read after the sync lists the payments: never an endless wait.
    instance.listPayments.mockRejectedValueOnce(new Error("Storage error"));
    await act(async () => release());
    expect(await screen.findByText(/Your wallet could not be read/)).toBeTruthy();
    expect(screen.queryByText("Syncing your wallet…")).toBeNull();

    sdk.fakeWallet.balanceSats = balanceSats;
    sdk.fakeWallet.payments = payments;
    await fireEvent.press(screen.getByText("Try again"));
    expect(await screen.findByText("Till B")).toBeTruthy();
    expect(screen.getByText("Balance")).toBeTruthy();
  });

  it('says "None" for a send that cost no fee, its amount otherwise', async () => {
    sdk.fakeWallet.payments.push({
      id: "spark-send",
      paymentType: sdk.PaymentType.Send,
      status: sdk.PaymentStatus.Completed,
      amount: BigInt(740),
      fees: BigInt(0),
      timestamp: BigInt(minutesAgo(3)),
      method: sdk.PaymentMethod.Spark,
      details: undefined
    });
    await openWalletScreen();
    await fireEvent.press(await screen.findByTestId("activity-row-payment:spark-send"));
    const free = within(await screen.findByTestId("activity-detail-sheet")).getByTestId(
      "activity-detail"
    );
    // "Sending fees".
    expect(within(free).getByText("Sending fees")).toBeTruthy();
    expect(within(free).getByText("None")).toBeTruthy();

    await fireEvent.press(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByTestId("activity-detail-sheet")).toBeNull());
    await fireEvent.press(screen.getByTestId("activity-row-payment:p2"));
    const paid = within(await screen.findByTestId("activity-detail-sheet")).getByTestId(
      "activity-detail"
    );
    expect(within(paid).getByText("Sending fees")).toBeTruthy();
    expect(within(paid).queryByText("None")).toBeNull();
  });

  it("opens a payment tapped in a sheet, with its details", async () => {
    const { router } = await openWalletScreen();
    await fireEvent.press(await screen.findByTestId("activity-row-payment:p2"));
    const sheet = await screen.findByTestId("activity-detail-sheet");
    expect(router.getPathname()).toBe("/wallet");
    // The sheet's title is the direction; the payment's own title scrolls with its details.
    expect(within(sheet).getByRole("header")).toHaveTextContent("Sent");
    const detail = within(sheet).getByTestId("activity-detail");
    // "Recipient": the Lightning address paid, once (no title above it saying it again).
    expect(within(detail).getByText("Recipient")).toBeTruthy();
    expect(within(detail).getByTestId("wallet-recipient")).toHaveTextContent(
      "bakehouse@wallet.example"
    );
    expect(within(detail).getAllByText("bakehouse@wallet.example")).toHaveLength(1);
    // "Network": its network, once.
    expect(within(detail).getByText("Network")).toBeTruthy();
    expect(within(detail).getByText("Lightning")).toBeTruthy();
    expect(detail).not.toHaveTextContent(/Lightning address|Payment type/);
    expect(detail).toHaveTextContent(/Fees|fees/);
    expect(detail).toHaveTextContent(/a3f91c07…7c21/);

    await fireEvent.press(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByTestId("activity-detail-sheet")).toBeNull());

    // A pending withdrawal: its state above its title.
    await fireEvent.press(screen.getByTestId("activity-row-payment:p3"));
    const pending = await screen.findByTestId("activity-detail-sheet");
    expect(within(pending).getByRole("header")).toHaveTextContent("Sent");
    const pendingDetail = within(pending).getByTestId("activity-detail");
    expect(pendingDetail).toHaveTextContent(/Confirming/);
    expect(pendingDetail).toHaveTextContent(/Withdrawal/);
    expect(pendingDetail).toHaveTextContent(/8e2d6b3a…41fa/);
  });

  it("shows a withdrawal's address whole, its fees in francs, and links its transaction", async () => {
    const txId = `1a09f803${"c".repeat(52)}9f32`;
    const address = "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4";
    sdk.fakeWallet.payments.push({
      id: "w1",
      paymentType: sdk.PaymentType.Send,
      status: sdk.PaymentStatus.Completed,
      amount: BigInt(43986),
      fees: BigInt(1470),
      timestamp: BigInt(minutesAgo(4)),
      method: sdk.PaymentMethod.Withdraw,
      details: {
        tag: sdk.PaymentDetails_Tags.Withdraw,
        // As the SDK may give it: in capitals, read in lowercase as explorers print it.
        inner: { txId, vout: 0, destinationAddress: address.toUpperCase() }
      }
    });
    await openWalletScreen();
    await fireEvent.press(await screen.findByTestId("activity-row-payment:w1"));
    const detail = within(
      within(await screen.findByTestId("activity-detail-sheet")).getByTestId("activity-detail")
    );
    // Its address whole, in groups of 4, in place of the title "Withdrawal" it would repeat.
    expect(detail.getByTestId("wallet-recipient")).toHaveTextContent(
      "bc1q w508 d6qe jxtd g4y5 r3za rvar y0c5 xw7k v8f3 t4"
    );
    expect(detail.queryByText("Withdrawal")).toBeNull();
    expect(detail.getByText("Network")).toBeTruthy();
    expect(detail.getByText("Bitcoin")).toBeTruthy();
    // Its amount and its fees at the rate of its payment (1 BTC = 100 000 CHF), the fees' sats under.
    expect(detail.getByText(chf(4399, "−"))).toBeTruthy();
    expect(detail.getByText(chf(147))).toBeTruthy();
    expect(detail.getByText("1 470")).toBeTruthy();
    // Its transaction, linked to its page on mempool.space (the account names no node).
    expect(detail.getByTestId("tx-link")).toHaveProp(
      "accessibilityLabel",
      "View transaction 1a09f803…9f32 on mempool.space"
    );
    // The copy icon copies the address itself, without the groups' spaces.
    jest.mocked(Clipboard.setStringAsync).mockClear();
    await fireEvent.press(detail.getByTestId("wallet-copy-address"));
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith(address);
    expect(await detail.findByLabelText("Address copied")).toBeTruthy();
    // Its reference, a link that cannot be selected: its copy icon copies the whole transaction id.
    await fireEvent.press(detail.getByTestId("wallet-copy-reference"));
    expect(Clipboard.setStringAsync).toHaveBeenLastCalledWith(txId);
  });

  it("keeps a payment's long description out of the sheet's title, where it would not scroll", async () => {
    // A BOLT11 description holds up to 639 characters.
    const description = "Flour, yeast and salt for the week. ".repeat(16).trim();
    const [first] = sdk.fakeWallet.payments;
    const details = first.details as { tag: string; inner: Record<string, unknown> };
    sdk.fakeWallet.payments = [
      { ...first, id: "long", details: { ...details, inner: { ...details.inner, description } } }
    ];
    await openWalletScreen();
    await fireEvent.press(await screen.findByTestId("activity-row-payment:long"));
    const sheet = await screen.findByTestId("activity-detail-sheet");
    expect(within(sheet).getByRole("header")).toHaveTextContent("Received");
    expect(
      within(within(sheet).getByTestId("activity-detail")).getByText(description)
    ).toBeTruthy();
  });

  it("disconnects the wallet once left", async () => {
    const { router } = await openWalletScreen();
    await screen.findByText("Till B");
    const { results } = sdk.connect.mock;
    const instance = (await results[results.length - 1].value) as { uniffiDestroy: jest.Mock };

    await fireEvent.press(screen.getByLabelText("Settings"));
    await waitFor(() => expect(router.getPathname()).toBe("/settings"));
    await waitFor(() => expect(instance.uniffiDestroy).toHaveBeenCalledTimes(1));
  });

  it("disconnects the wallet once left during the first sync", async () => {
    sdk.holdFirstSync();
    const { router } = await openWalletScreen();
    await screen.findByText("Till B");
    const instance = await walletInstance();
    await waitFor(() => expect(instance.getInfo).toHaveBeenCalledWith({ ensureSynced: false }));
    expect(screen.getByTestId("wallet-syncing")).toBeTruthy();

    await fireEvent.press(screen.getByLabelText("Settings"));
    await waitFor(() => expect(router.getPathname()).toBe("/settings"));
    // The wait for a sync that reached the network ends with the disconnection: nothing keeps the
    // wallet's keys.
    await waitFor(() => expect(instance.uniffiDestroy).toHaveBeenCalledTimes(1));
  });

  it("says past a minute that this device's copy shows, never synced, until a sync reaches the network", async () => {
    jest.useFakeTimers({ advanceTimers: true });
    try {
      // The Spark operators unreachable: the SDK's syncs end, having read nothing.
      sdk.setSparkReachable(false);
      await openWalletScreen();
      expect(await screen.findByText("Till B")).toBeTruthy();
      expect(screen.getByTestId("wallet-syncing")).toHaveTextContent("Updating…");
      await act(() => jest.advanceTimersByTimeAsync(WALLET_SYNC_LATE_MS - 1000));
      expect(screen.queryByTestId("wallet-sync-late")).toBeNull();

      await act(() => jest.advanceTimersByTimeAsync(1000));
      expect(
        within(screen.getByTestId("wallet-sync-late")).getByText(
          "Your wallet could not be updated: the balance and payments shown are this device's and may be incomplete. Check your internet connection."
        )
      ).toBeTruthy();
      // Still syncing: this device's copy is never told synced.
      expect(screen.getByTestId("wallet-syncing")).toBeTruthy();
      expect(screen.getByText("Till B")).toBeTruthy();

      // "Try again", still unreachable: a sync that read nothing, the notice stays.
      const instance = await walletInstance();
      await fireEvent.press(screen.getByTestId("wallet-sync-retry"));
      await waitFor(() => expect(instance.syncWallet).toHaveBeenCalledTimes(1));
      await act(async () => undefined);
      expect(screen.getByTestId("wallet-sync-late")).toBeTruthy();
      expect(screen.getByTestId("wallet-syncing")).toBeTruthy();

      // Reachable again: the next sync reaches the network.
      sdk.setSparkReachable(true);
      await fireEvent.press(screen.getByTestId("wallet-sync-retry"));
      await waitFor(() => expect(screen.queryByTestId("wallet-sync-late")).toBeNull());
      await waitFor(() => expect(screen.queryByTestId("wallet-syncing")).toBeNull());
    } finally {
      jest.useRealTimers();
    }
  });

  it("says past a minute that a wallet this device holds nothing of could not be synced", async () => {
    jest.useFakeTimers({ advanceTimers: true });
    try {
      const { balanceSats, payments } = sdk.fakeWallet;
      sdk.fakeWallet.balanceSats = BigInt(0);
      sdk.fakeWallet.payments = [];
      sdk.setSparkReachable(false);
      await openWalletScreen();
      expect(await screen.findByText("Syncing your wallet…")).toBeTruthy();

      await act(() => jest.advanceTimersByTimeAsync(WALLET_SYNC_LATE_MS));
      expect(
        within(screen.getByTestId("wallet-sync-late")).getByText(
          "Your wallet could not be synced. Check your internet connection, then try again."
        )
      ).toBeTruthy();
      // Never shown empty.
      expect(screen.queryByText("Balance")).toBeNull();
      expect(screen.queryByText("No transactions yet.")).toBeNull();

      sdk.fakeWallet.balanceSats = balanceSats;
      sdk.fakeWallet.payments = payments;
      sdk.setSparkReachable(true);
      // "Try again" waits while the sync it asked for runs.
      const release = sdk.holdAccountSync();
      await fireEvent.press(screen.getByTestId("wallet-sync-retry"));
      await waitFor(() =>
        expect(screen.getByTestId("wallet-sync-retry").props.accessibilityState.busy).toBe(true)
      );
      await act(async () => release());
      expect(await screen.findByText("Till B")).toBeTruthy();
      expect(screen.getByText("Balance")).toBeTruthy();
      expect(screen.queryByTestId("wallet-sync-late")).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  describe("desktop", () => {
    beforeEach(() => mockDesktop.mockReturnValue(true));

    it("shows a spinner in the table while the first sync runs with no payment yet, then says so", async () => {
      sdk.fakeWallet.payments = [];
      const release = sdk.holdFirstSync();
      await openWalletScreen();
      expect(
        await screen.findByTestId("activity-table-loading", { includeHiddenElements: true })
      ).toBeTruthy();
      expect(screen.queryByTestId("wallet-empty")).toBeNull();

      await act(async () => release());
      expect(await screen.findByTestId("wallet-empty")).toBeTruthy();
      expect(
        screen.queryByTestId("activity-table-loading", { includeHiddenElements: true })
      ).toBeNull();
    });

    it('shows an integration\'s order paid on-chain "Confirming", its amount waiting', async () => {
      const { rowId } = await payIntegrationOrderOnchain();
      await openWalletScreen();
      const row = await screen.findByTestId(`activity-row-${rowId}`);
      expect(within(row).getByText("CMD-2001")).toBeTruthy();
      // "Paid" only once its sats are in the balance.
      expect(within(row).getByText("Confirming")).toBeTruthy();
      expect(within(row).queryByText("Paid")).toBeNull();
      const amount = within(row).getByTestId(`activity-pending-amount-${rowId}`);
      expect(within(amount).getByText(chf(150))).toBeTruthy();
      expect(within(amount).getByText(CLOCK, { includeHiddenElements: true })).toBeTruthy();
      // Without the "sats" column (under 1440 px; Jest has no layout): its caption under it.
      expect(within(row).getByText("not in balance yet")).toBeTruthy();
      // The wallet's other rows have none.
      const other = screen.getByTestId("activity-row-payment:p1");
      expect(within(other).queryByTestId("activity-pending-amount-payment:p1")).toBeNull();
      // Under the balance in the header.
      const pending = within(screen.getByTestId("wallet-balance")).getByTestId(
        "wallet-pending-balance"
      );
      expect(within(pending).getByText(chf(120, "+"))).toBeTruthy();
      expect(within(pending).getByText("not in balance yet")).toBeTruthy();
    });

    it('disables "Send" while the balance is 0 sats', async () => {
      sdk.fakeWallet.balanceSats = BigInt(0);
      await openWalletScreen();
      await screen.findByTestId("activity-row-payment:p2");
      expect(screen.getByTestId("wallet-send")).toBeDisabled();
    });

    it('shows the balance in the header, "To follow up" in tiles and the movements in a table', async () => {
      await openWalletScreen();
      const row = await screen.findByTestId("activity-row-payment:p2");
      // The balance in the header, in francs, beside "Send".
      expect(screen.getByText(chf(128453))).toBeTruthy();
      expect(screen.getByTestId("wallet-send")).toBeTruthy();
      // "To follow up", a section's title as "All transactions" (one size, one style).
      const followUp = screen.getByText("To follow up");
      expect(followUp).toHaveProp("accessibilityRole", "header");
      expect(StyleSheet.flatten(followUp.props.style)).toEqual(
        StyleSheet.flatten(screen.getByText("All transactions").props.style)
      );
      // The table's columns, "By" included (the owner's view).
      for (const column of ["Date", "Description", "Source", "By", "Status", "Amount"]) {
        expect(screen.getByText(column)).toBeTruthy();
      }
      expect(within(row).getByText("bakehouse@wallet.example")).toBeTruthy();
      // "Sent" twice in English: its source, and its state ("Status" says what is done too, not
      // only what is to follow).
      expect(within(row).getAllByText("Sent")).toHaveLength(2);
      // Its source and its state, both "Received" in English.
      expect(
        within(screen.getByTestId("activity-row-payment:p1")).getAllByText("Received")
      ).toHaveLength(2);
      expect(
        within(screen.getByTestId("activity-row-payment:p3")).getByText("Confirming")
      ).toBeTruthy();

      // A row clicked opens its details.
      await fireEvent.press(row);
      const sent = within(await screen.findByTestId("activity-detail-sheet")).getByTestId(
        "activity-detail"
      );
      expect(sent).toHaveTextContent(/bakehouse@wallet\.example/);
      expect(sent).toHaveTextContent(/Fees|fees/);
      expect(sent).toHaveTextContent(/a3f91c07…7c21/);
    });

    it('lists an employee\'s invoice still shown, "By" with her photo', async () => {
      mockNetwork.mockReturnValue("mainnet");
      const team = deriveTeamKeys(walletSecret(testSeed()));
      const MEMBER = "0123456789abcdef0123456789abcdef";
      const member: TeamMember = {
        id: MEMBER,
        name: "Erin Grant",
        role: "employee",
        invitedAt: 1789990000
      };
      await saveMerchantSettings(TEST_WALLET_ID, settings);
      await publishMember(team, member);
      const keys = deriveMemberKeys(memberSecret(team, MEMBER));
      const now = Math.floor(Date.now() / 1000);
      // Her photo, in her profile ("Settings" of her device), already read by this launch.
      const photo = createImage(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), now - 600);
      rememberImage(photo.ref, new Uint8Array([0xff, 0xd8, 0xff, 0xd9]));
      await publishMemberRecord(
        keys,
        profileEvent(keys, { version: 1, avatar: photo.ref, updatedAt: now - 600 })
      );
      // An invoice her point of sale shows, 9 minutes left, not paid yet.
      const { paymentHash } = preimagePair(9);
      await publishMemberRecord(
        keys,
        saleEvent(keys, {
          version: 1,
          paymentHash,
          sats: "24000",
          fiat: { minor: 1200, digits: 2, currency: "CHF" },
          note: "Table 3",
          verifyUrl: "https://breez.tips/lnurlp/verify/x",
          createdAt: now - 60,
          expiresAt: now + 540,
          paidAt: null,
          onchainAddress: null,
          onchainTag: null,
          sale: "e2".repeat(32)
        })
      );

      await openWalletScreen();
      const row = await screen.findByTestId(`activity-row-sale:${paymentHash}`);
      expect(within(row).getByText("Table 3")).toBeTruthy();
      expect(within(row).getByText("Open")).toBeTruthy();
      expect(within(row).getByText("Erin Grant")).toBeTruthy();
      expect(within(row).getByText(chf(1200))).toBeTruthy();
      await waitFor(() =>
        expect(
          within(row).getByTestId("activity-by-avatar-image", { includeHiddenElements: true })
        ).toBeTruthy()
      );
      // In "To follow up": one invoice open.
      const open = screen.getByTestId("activity-follow-up-open");
      expect(within(open).getByText("1")).toBeTruthy();
      expect(within(open).getByText(chf(1200))).toBeTruthy();
    });

    it('leaves "Source" out of a narrower table, rather than overflowing', async () => {
      await openWalletScreen();
      const list = await screen.findByTestId("activity-list");
      const head = () => within(screen.getByTestId("activity-table-head"));
      const layout = (width: number) => ({
        nativeEvent: { layout: { x: 0, y: 0, width, height: 600 } }
      });
      // 1440 px and 1280 px: every column, "sats" in "Amount" (no column).
      for (const width of [1116, 956]) {
        await fireEvent(list, "layout", layout(width));
        expect(head().getByText("Source")).toBeTruthy();
        expect(head().getByText("Amount")).toBeTruthy();
        expect(head().queryByText("sats")).toBeNull();
      }
      // 1024 px: no "Source" either; "By" stays (the owner's view).
      await fireEvent(list, "layout", layout(700));
      expect(head().queryByText("Source")).toBeNull();
      expect(head().getByText("By")).toBeTruthy();
      expect(await screen.findByText(chf(15000, "−"))).toBeTruthy();
    });

    it('writes "Amount" as a mobile row, its sats under it, or first once this device chose so', async () => {
      await openWalletScreen();
      const sent = within(await screen.findByTestId("activity-row-payment:p2"));
      // One column for both: the francs, signed, the sats unsigned under them.
      const cell = within(sent.getByTestId("activity-amount-cell-payment:p2"));
      expect(cell.getByText(chf(15000, "−"))).toBeTruthy();
      expect(cell.getByText(satsOf(150000))).toBeTruthy();
      expect(screen.queryByTestId("activity-column-sats")).toBeNull();

      await act(async () => saveAmountUnit("sats"));
      expect(await sent.findByText(satsOf(150000, "−"))).toBeTruthy();
      expect(sent.getByText(chf(15000))).toBeTruthy();
      // Sorted by the sats it writes first, signed.
      const order = () =>
        screen.getAllByTestId(/^activity-row-/).map(({ props }) => props.testID.slice(21));
      await fireEvent.press(screen.getByTestId("activity-column-amount"));
      await fireEvent.press(screen.getByTestId("activity-column-amount-menu-ascending"));
      expect(order()).toEqual(["p3", "p2", "p1"]);
    });

    it('keeps the table to the tile chosen, "All transactions" showing everything again', async () => {
      await openWalletScreen();
      await screen.findByTestId("activity-row-payment:p1");
      await fireEvent.press(screen.getByTestId("activity-follow-up-unconfirmed"));
      expect(screen.getByTestId("activity-follow-up-unconfirmed")).toBeSelected();
      expect(screen.queryByTestId("activity-row-payment:p1")).toBeNull();
      expect(screen.getByTestId("activity-row-payment:p3")).toBeTruthy();

      await fireEvent.press(screen.getByTestId("activity-clear-filter"));
      expect(await screen.findByTestId("activity-row-payment:p1")).toBeTruthy();
      expect(screen.getByTestId("activity-follow-up-unconfirmed")).not.toBeSelected();
    });

    it("sorts the movements by a column and filters them by its values", async () => {
      await openWalletScreen();
      await screen.findByTestId("activity-row-payment:p3");
      const order = () =>
        screen.getAllByTestId(/^activity-row-/).map(({ props }) => props.testID.slice(21));
      const outside = (column: string) =>
        screen.getByTestId(`activity-column-${column}-menu-outside`, {
          includeHiddenElements: true
        });
      expect(order()).toEqual(["p1", "p2", "p3"]);

      // "Amount" as it shows it: signed, what was sent below what was received.
      await fireEvent.press(screen.getByTestId("activity-column-amount"));
      await fireEvent.press(screen.getByTestId("activity-column-amount-menu-ascending"));
      expect(order()).toEqual(["p3", "p2", "p1"]);
      await fireEvent.press(outside("amount"));

      await fireEvent.press(screen.getByTestId("activity-column-source"));
      const sources = within(screen.getByTestId("activity-column-source-menu"));
      await fireEvent.press(sources.getByLabelText("Sent, 2"));
      expect(order()).toEqual(["p1"]);
      expect(screen.getByTestId("activity-column-source")).toHaveProp(
        "accessibilityLabel",
        "Source, filtered"
      );
      // The tiles of "To follow up" keep counting every row: the table's filters are its own.
      expect(
        within(screen.getByTestId("activity-follow-up-unconfirmed")).getByText("1")
      ).toBeTruthy();
      await fireEvent.press(sources.getByLabelText("Received, 1"));
      expect(screen.queryAllByTestId(/^activity-row-/)).toEqual([]);
      expect(screen.getByText("No transactions match the filters.")).toBeTruthy();
      await fireEvent.press(outside("source"));

      await fireEvent.press(screen.getByTestId("activity-clear-filters"));
      expect(order()).toEqual(["p3", "p2", "p1"]);
      expect(screen.queryByTestId("activity-no-match")).toBeNull();
    });

    it('lists periods for "Date", each value as the table draws it, and no values for amounts', async () => {
      // One payment 40 days ago: last month's, or older.
      const old = sdk.fakeWallet.payments[2]!;
      sdk.fakeWallet.payments[2] = {
        ...old,
        timestamp: BigInt(Math.floor(Date.now() / 1000) - 40 * 86400)
      };
      await openWalletScreen();
      await screen.findByTestId("activity-row-payment:p3");
      const outside = (column: string) =>
        screen.getByTestId(`activity-column-${column}-menu-outside`, {
          includeHiddenElements: true
        });
      const hidden = { includeHiddenElements: true };

      await fireEvent.press(screen.getByTestId("activity-column-date"));
      const dates = within(screen.getByTestId("activity-column-date-menu"));
      expect(dates.getByText("Newest to oldest")).toBeTruthy();
      // Two payments of today (the device's word for it, else the app's), the most recent first.
      const values = dates.getAllByRole("checkbox").slice(1);
      expect(values[0]).toHaveProp("testID", "activity-column-date-menu-value-today");
      expect(values[0]!.props.accessibilityLabel).toMatch(/, 2$/);
      expect(values).toHaveLength(2);
      expect(values[1]!.props.testID).toMatch(/-value-(lastMonth|thisYear|lastYear)$/);
      await fireEvent.press(values[1]!);
      expect(screen.queryByTestId("activity-row-payment:p3")).toBeNull();
      expect(screen.getByTestId("activity-row-payment:p1")).toBeTruthy();
      await fireEvent.press(outside("date"));

      // "Source": each value after its icon (a reception's arrow down).
      await fireEvent.press(screen.getByTestId("activity-column-source"));
      const reception = screen.getByTestId("activity-column-source-menu-value-receive");
      expect(reception.props.accessibilityLabel).toBe("Received, 1");
      expect(within(reception).getByText(String.fromCodePoint(0xf063), hidden)).toBeTruthy();
      await fireEvent.press(outside("source"));

      // "Status": its pills.
      await fireEvent.press(screen.getByTestId("activity-column-state"));
      const sent = screen.getByTestId("activity-column-state-menu-value-done:sent");
      expect(within(sent).getByText("Sent", hidden)).toBeTruthy();
      await fireEvent.press(outside("state"));

      // "By": the wallet's transfers, nobody took them, "—" read "Empty"; counted over every
      // row, whatever "Date" hides.
      await fireEvent.press(screen.getByTestId("activity-column-by"));
      expect(
        within(screen.getByTestId("activity-column-by-menu")).getByLabelText("Empty, 3")
      ).toBeTruthy();
      await fireEvent.press(outside("by"));

      // "Amount": sorted only.
      for (const column of ["amount"]) {
        await fireEvent.press(screen.getByTestId(`activity-column-${column}`));
        const menu = within(screen.getByTestId(`activity-column-${column}-menu`));
        expect(menu.getByText("Sort")).toBeTruthy();
        expect(menu.queryByText("Show")).toBeNull();
        expect(menu.queryAllByRole("checkbox")).toEqual([]);
        await fireEvent.press(outside(column));
      }
    });

    it('hides expired invoices by default, unchecked in "Status" but no filter', async () => {
      const { open, expired } = await publishErinLinks();
      if (!open) throw new Error("no open link");
      await openWalletScreen();
      expect(await screen.findByTestId(`activity-row-link:${open.id}`)).toBeTruthy();
      expect(screen.queryByTestId(`activity-row-link:${expired.id}`)).toBeNull();
      expect(screen.queryByTestId("activity-expired-toggle")).toBeNull();
      // The table's normal state: "Status" says nothing filtered, nothing to clear.
      expect(screen.getByTestId("activity-column-state")).toHaveProp(
        "accessibilityLabel",
        "Status"
      );
      expect(screen.queryByTestId("activity-clear-filters")).toBeNull();
      // Its menu lists them, unchecked.
      await fireEvent.press(screen.getByTestId("activity-column-state"));
      const value = screen.getByTestId("activity-column-state-menu-value-expired");
      expect(value).toHaveProp("accessibilityLabel", "Expired, 1");
      expect(value).not.toBeChecked();
      expect(screen.getByTestId("activity-column-state-menu-value-open")).toBeChecked();

      // Checked: their rows show, still nothing filtered.
      await fireEvent.press(value);
      const row = await screen.findByTestId(`activity-row-link:${expired.id}`);
      expect(within(row).getByText("Expired")).toBeTruthy();
      expect(screen.getByTestId("activity-column-state")).toHaveProp(
        "accessibilityLabel",
        "Status"
      );
      // Unchecked again: they fold away.
      await fireEvent.press(screen.getByTestId("activity-column-state-menu-value-expired"));
      await waitFor(() =>
        expect(screen.queryByTestId(`activity-row-link:${expired.id}`)).toBeNull()
      );
      expect(screen.getByTestId(`activity-row-link:${open.id}`)).toBeTruthy();
    });

    it('says "filtered" for other states only, "Clear filters" keeping expired hidden', async () => {
      sdk.fakeWallet.payments = [];
      const { open, expired } = await publishErinLinks();
      if (!open) throw new Error("no open link");
      await openWalletScreen();
      await screen.findByTestId(`activity-row-link:${open.id}`);
      await fireEvent.press(screen.getByTestId("activity-column-state"));
      await fireEvent.press(screen.getByTestId("activity-column-state-menu-value-open"));
      await waitFor(() => expect(screen.queryByTestId(`activity-row-link:${open.id}`)).toBeNull());
      expect(screen.getByTestId("activity-column-state")).toHaveProp(
        "accessibilityLabel",
        "Status, filtered"
      );
      await fireEvent.press(
        screen.getByTestId("activity-column-state-menu-outside", { includeHiddenElements: true })
      );
      // A filter leaves no row: it says so, not that expired invoices are hidden.
      expect(screen.getByText("No transactions match the filters.")).toBeTruthy();
      expect(screen.queryByTestId("activity-expired-hidden")).toBeNull();

      // Back to the normal state: "Open" shows again, the expired ones stay hidden.
      await fireEvent.press(screen.getByTestId("activity-clear-filters"));
      expect(await screen.findByTestId(`activity-row-link:${open.id}`)).toBeTruthy();
      expect(screen.queryByTestId(`activity-row-link:${expired.id}`)).toBeNull();
      expect(screen.queryByTestId("activity-no-match")).toBeNull();
      expect(screen.getByTestId("activity-column-state")).toHaveProp(
        "accessibilityLabel",
        "Status"
      );
    });

    it('says expired invoices are hidden, not "No transactions", while they are all there is', async () => {
      sdk.fakeWallet.payments = [];
      const { expired } = await publishErinLinks(false);
      await openWalletScreen();
      expect(await screen.findByText("Expired invoices are hidden.")).toBeTruthy();
      expect(screen.queryByTestId("wallet-empty")).toBeNull();
      expect(screen.queryByTestId("activity-no-match")).toBeNull();
      const show = screen.getByTestId("activity-show-expired");
      expect(show).toHaveTextContent("Show expired (1)");
      await fireEvent.press(show);
      expect(await screen.findByTestId(`activity-row-link:${expired.id}`)).toBeTruthy();
      expect(screen.queryByTestId("activity-expired-hidden")).toBeNull();
      expect(screen.getByTestId("activity-column-state")).toHaveProp(
        "accessibilityLabel",
        "Status"
      );
    });

    it('shows no "To follow up" tiles while nothing is to follow', async () => {
      sdk.fakeWallet.payments = sdk.fakeWallet.payments.map((payment) => ({
        ...payment,
        status: sdk.PaymentStatus.Completed
      }));
      await openWalletScreen();
      expect(await screen.findByTestId("activity-row-payment:p3")).toBeTruthy();
      expect(screen.getByText("All transactions")).toBeTruthy();
      expect(screen.queryByText("To follow up")).toBeNull();
      expect(screen.queryByTestId("activity-follow-ups")).toBeNull();
    });

    it("says it syncs beside the list's title until the first sync is done", async () => {
      const release = sdk.holdFirstSync();
      await openWalletScreen();
      expect(await screen.findByTestId("activity-list")).toBeTruthy();
      expect(screen.getByTestId("wallet-syncing")).toBeTruthy();
      await act(async () => release());
      await waitFor(() => expect(screen.queryByTestId("wallet-syncing")).toBeNull());
    });

    it("says past a minute, under its header, that this device's copy shows", async () => {
      jest.useFakeTimers({ advanceTimers: true });
      try {
        sdk.setSparkReachable(false);
        await openWalletScreen();
        expect(await screen.findByTestId("activity-list")).toBeTruthy();
        await act(() => jest.advanceTimersByTimeAsync(WALLET_SYNC_LATE_MS));
        expect(
          within(screen.getByTestId("wallet-sync-late")).getByText(
            "Your wallet could not be updated: the balance and payments shown are this device's and may be incomplete. Check your internet connection."
          )
        ).toBeTruthy();
        expect(screen.getByTestId("wallet-syncing")).toBeTruthy();

        sdk.setSparkReachable(true);
        await fireEvent.press(screen.getByTestId("wallet-sync-retry"));
        await waitFor(() => expect(screen.queryByTestId("wallet-sync-late")).toBeNull());
      } finally {
        jest.useRealTimers();
      }
    });
  });
});

const ADDRESS = "bakehouse@wallet.example";
const INVOICE = "lnbc250u1pfake";
const BTC_ADDRESS = "bc1qm4tz8s0xk7v9yfh3e5c2nq6wjr8ad2wz9";
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** What the fake SDK's `parse` reads in these tests (see jest/breez-sdk.ts). */
function addSendInputs() {
  sdk.fakeSend.inputs.set(ADDRESS, {
    tag: sdk.InputType_Tags.LightningAddress,
    inner: [
      {
        address: ADDRESS,
        payRequest: {
          callback: "https://wallet.example/cb",
          minSendable: BigInt(1000),
          maxSendable: BigInt(1_000_000_000),
          metadataStr: "[]",
          commentAllowed: 0,
          domain: "wallet.example",
          url: "https://wallet.example",
          address: ADDRESS
        }
      }
    ]
  });
  sdk.fakeSend.inputs.set(INVOICE, {
    tag: sdk.InputType_Tags.Bolt11Invoice,
    inner: [
      {
        amountMsat: BigInt(25_000_000),
        description: "Flour T45, 25 kg",
        expiry: BigInt(3600),
        invoice: { bolt11: INVOICE, source: {} },
        network: sdk.BitcoinNetwork.Bitcoin,
        paymentHash: "9c1f",
        timestamp: BigInt(Math.floor(Date.now() / 1000) - 60)
      }
    ]
  });
  sdk.fakeSend.inputs.set(BTC_ADDRESS, {
    tag: sdk.InputType_Tags.BitcoinAddress,
    inner: [{ address: BTC_ADDRESS, network: sdk.BitcoinNetwork.Bitcoin, source: {} }]
  });
}

/** The SDK object of the wallet screen's connection: the calls "Send" made. */
async function walletInstance(): Promise<Record<string, jest.Mock>> {
  const { results } = sdk.connect.mock;
  return (await results[results.length - 1].value) as Record<string, jest.Mock>;
}

async function openSend() {
  const opened = await openWalletScreen();
  // Desktop: in the list and in the payment's card.
  await screen.findAllByText("Till B");
  await fireEvent.press(screen.getByTestId("wallet-send"));
  await screen.findByTestId("send-sheet");
  return opened;
}

/**
 * Waits for the quote (after the pauses in typing): "Send", named with its amount, becomes
 * possible.
 */
async function quoted(label: string) {
  await screen.findByText(label, {}, { timeout: 4000 });
  const button = screen.getByTestId("send-confirm");
  await waitFor(() => expect(button).toBeEnabled(), { timeout: 4000 });
  return button;
}

/**
 * Another display currency for this device's point of sale, as "Settings" or the account's sync
 * (another device's change) saves it.
 */
async function changeCurrency(currency: string) {
  const profile = await getTerminalProfile();
  await act(async () => publishTerminalProfile({ ...profile!, currency }));
}

describe('"Send"', () => {
  beforeEach(async () => {
    closeAccount();
    relays.resetRelays();
    mockDesktop.mockReturnValue(false);
    mockRate = 100000;
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    signIn.mockReset().mockResolvedValue({ seed: testSeed(), credentialId: null });
    sdk.connect.mockClear();
    jest.mocked(Clipboard.getStringAsync).mockReset();
    await saveMerchantSettings(TEST_WALLET_ID, settings);
    fillWallet();
    addSendInputs();
  });

  it("sends francs to a Lightning address after the passkey, once", async () => {
    await openSend();
    expect(screen.getByTestId("send-intro")).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText("Recipient"), ADDRESS);
    expect(await screen.findByText("Lightning address", {}, { timeout: 4000 })).toBeTruthy();
    // The recipient read, its form takes the intro's place.
    expect(screen.queryByTestId("send-intro")).toBeNull();
    // 142.20 CHF at 100 000 CHF per BTC: 142 200 sats, fees 3 sats on top.
    await fireEvent.changeText(screen.getByLabelText("Amount"), "142.20");
    const send = await quoted(`Send ${chf(14220)}`);
    // The unlock's passkey only: the wallet opened without it.
    expect(signIn).toHaveBeenCalledTimes(1);

    await fireEvent.press(send);
    const result = await screen.findByTestId("send-result-completed");
    // The amount sent and its recipient under the title, nothing more to read.
    expect(within(result).getByText("Payment sent")).toBeTruthy();
    expect(within(result).getByText(chf(14220))).toBeTruthy();
    expect(within(result).getByText(`to ${ADDRESS}`)).toBeTruthy();
    // Done: the filled "Done".
    expect(screen.getByTestId("send-done")).toHaveTextContent("Done");
    // The passkey again, for this payment.
    expect(signIn).toHaveBeenCalledTimes(2);
    const instance = await walletInstance();
    expect(instance.lnurlPay).toHaveBeenCalledTimes(1);
    const [{ prepareResponse, idempotencyKey }] = instance.lnurlPay.mock.calls[0] as [
      { prepareResponse: { amountSats: bigint }; idempotencyKey: string }
    ];
    expect(prepareResponse.amountSats).toBe(BigInt(142_200));
    expect(idempotencyKey).toMatch(UUID_V4);
    expect(sdk.fakeWallet.balanceSats).toBe(BigInt(1_284_530 - 142_203));

    await fireEvent.press(screen.getByTestId("send-done"));
    await waitFor(() => expect(screen.queryByTestId("send-sheet")).toBeNull());
  });

  it("sends nothing when the passkey is dismissed or another account's", async () => {
    await openSend();
    await fireEvent.changeText(screen.getByLabelText("Recipient"), ADDRESS);
    await screen.findByText("Lightning address", {}, { timeout: 4000 });
    await fireEvent.press(screen.getByTestId("send-unit"));
    await fireEvent.changeText(screen.getByLabelText("Amount"), "5000");
    const send = await quoted("Send 5'000 sats");

    signIn.mockRejectedValueOnce(new PasskeyError("cancelled", "Dismissed"));
    await fireEvent.press(send);
    await waitFor(() => expect(signIn).toHaveBeenCalledTimes(2));
    expect(await screen.findByTestId("send-confirm")).toBeEnabled();
    expect(screen.queryByTestId("send-failure")).toBeNull();

    signIn.mockResolvedValueOnce({
      seed: testSeed("zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo wrong"),
      credentialId: null
    });
    await fireEvent.press(screen.getByTestId("send-confirm"));
    expect(await screen.findByTestId("send-failure")).toBeTruthy();
    const instance = await walletInstance();
    expect(instance.lnurlPay).not.toHaveBeenCalled();
    expect(sdk.fakeWallet.balanceSats).toBe(BigInt(1_284_530));
  });

  it("keeps the auto-lock away while the passkey is asked and the payment sent", async () => {
    await openSend();
    await fireEvent.changeText(screen.getByLabelText("Recipient"), ADDRESS);
    await screen.findByText("Lightning address", {}, { timeout: 4000 });
    await fireEvent.press(screen.getByTestId("send-unit"));
    await fireEvent.changeText(screen.getByLabelText("Amount"), "5000");
    const send = await quoted("Send 5'000 sats");

    // The passkey's prompt stays open for minutes (another device's passkey), without a touch of
    // the app: past the auto-lock's delay, the account stays open and the sheet with it.
    let answer!: () => void;
    signIn.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          answer = () => resolve({ seed: testSeed(), credentialId: null });
        })
    );
    await fireEvent.press(send);
    await waitFor(() => expect(signIn).toHaveBeenCalledTimes(2));
    await act(() => jest.advanceTimersByTimeAsync(AUTO_LOCK_AFTER_MS + 60_000));
    expect(idleMs()).toBe(0);
    expect(getAccountWalletId()).toBe(TEST_WALLET_ID);

    await act(async () => answer());
    expect(await screen.findByTestId("send-result-completed")).toBeTruthy();
    // The outcome shown: the time counts again.
    await act(() => jest.advanceTimersByTimeAsync(1000));
    expect(idleMs()).toBeGreaterThan(0);
  });

  it("tries a failed send again with the same idempotency key", async () => {
    await openSend();
    await fireEvent.changeText(screen.getByLabelText("Recipient"), ADDRESS);
    await screen.findByText("Lightning address", {}, { timeout: 4000 });
    await fireEvent.changeText(screen.getByLabelText("Amount"), "10");
    const send = await quoted(`Send ${chf(1000)}`);

    sdk.fakeSend.sendError = new Error("NetworkError");
    await fireEvent.press(send);
    expect(await screen.findByTestId("send-failure")).toBeTruthy();
    sdk.fakeSend.sendError = null;
    await fireEvent.press(screen.getByTestId("send-confirm"));
    expect(await screen.findByTestId("send-result-completed")).toBeTruthy();

    const instance = await walletInstance();
    const keys = (instance.lnurlPay.mock.calls as [{ idempotencyKey: string }][]).map(
      ([request]) => request.idempotencyKey
    );
    expect(keys).toHaveLength(2);
    expect(keys[1]).toBe(keys[0]);
  });

  it("keeps the sats of the francs for a retry, though the rate changed after the failure", async () => {
    await openSend();
    await fireEvent.changeText(screen.getByLabelText("Recipient"), ADDRESS);
    await screen.findByText("Lightning address", {}, { timeout: 4000 });
    await fireEvent.changeText(screen.getByLabelText("Amount"), "10");
    const send = await quoted(`Send ${chf(1000)}`);

    sdk.fakeSend.sendError = new Error("NetworkError");
    await fireEvent.press(send);
    expect(await screen.findByTestId("send-failure")).toBeTruthy();
    // The rate refreshed: the attempt may have left, the same payment is tried again.
    await act(async () => setMockRate(90000));
    sdk.fakeSend.sendError = null;
    await waitFor(() => expect(screen.getByTestId("send-confirm")).toBeEnabled());
    await fireEvent.press(screen.getByTestId("send-confirm"));
    expect(await screen.findByTestId("send-result-completed")).toBeTruthy();

    const instance = await walletInstance();
    expect(instance.prepareLnurlPay).toHaveBeenCalledTimes(1);
    const calls = instance.lnurlPay.mock.calls as [
      { idempotencyKey: string; prepareResponse: { amountSats: bigint } }
    ][];
    expect(calls).toHaveLength(2);
    expect(calls[1][0].idempotencyKey).toBe(calls[0][0].idempotencyKey);
    // 10.00 CHF at 100 000 CHF per BTC.
    expect(calls[1][0].prepareResponse.amountSats).toBe(BigInt(10_000));
  });

  it("pays a pasted invoice its own amount (desktop)", async () => {
    mockDesktop.mockReturnValue(true);
    jest.mocked(Clipboard.getStringAsync).mockResolvedValue(` lightning:${INVOICE} `);
    await openSend();
    await fireEvent.press(screen.getByTestId("send-paste"));
    expect(await screen.findByText("Lightning invoice")).toBeTruthy();
    expect(screen.getByText("Flour T45, 25 kg")).toBeTruthy();
    expect(screen.getByText("Expires in")).toBeTruthy();
    // No amount to type: 25 000 sats, 25.00 CHF. In the sheet: the table's "Amount" under it
    // is its column's button (sorting and filtering).
    expect(within(screen.getByTestId("send-sheet")).queryByLabelText("Amount")).toBeNull();
    const pay = await quoted(`Pay ${chf(2500)}`);
    expect(screen.getByText("Balance after sending")).toBeTruthy();
    await fireEvent.press(pay);
    expect(await screen.findByTestId("send-result-completed")).toBeTruthy();
    const instance = await walletInstance();
    const [{ options }] = instance.sendPayment.mock.calls[0] as [
      { options: { tag: string; inner: { preferSpark: boolean } } }
    ];
    expect(options.tag).toBe("Bolt11Invoice");
  });

  it("sends sats to a scanned or typed Spark address, by a free transfer", async () => {
    const address = sdk.fakeSparkAddress(`02${"cd".repeat(32)}`);
    await openSend();
    // The intro names it among what "Send" pays.
    expect(screen.getByTestId("send-intro")).toHaveTextContent(/a Spark address\.$/);
    await fireEvent.changeText(screen.getByLabelText("Recipient"), address);
    expect(await screen.findByText("Spark address", {}, { timeout: 4000 })).toBeTruthy();
    await fireEvent.press(screen.getByTestId("send-unit"));
    await fireEvent.changeText(screen.getByLabelText("Amount"), "21000");
    const send = await quoted("Send 21'000 sats");
    await fireEvent.press(send);
    const result = await screen.findByTestId("send-result-completed");
    expect(within(result).getByText("21'000 sats")).toBeTruthy();
    // Named shortened, as a Bitcoin address.
    expect(within(result).getByText(`to ${address.slice(0, 8)}…${address.slice(-6)}`)).toBeTruthy();
    const instance = await walletInstance();
    const [{ options }] = instance.sendPayment.mock.calls[0] as [{ options: { tag: string } }];
    expect(options.tag).toBe("SparkAddress");
    expect(sdk.fakeWallet.balanceSats).toBe(BigInt(1_284_530 - 21_000));
  });

  it("prepares an invoice's payment again after its quote failed", async () => {
    // The SDK quotes another amount: refused, the quote failed.
    sdk.fakeSend.quotedAmount = BigInt(1);
    jest.mocked(Clipboard.getStringAsync).mockResolvedValue(INVOICE);
    await openSend();
    await fireEvent.press(screen.getByTestId("send-paste"));
    // No amount field to change for an invoice of its own amount: a button asks again.
    const retry = await screen.findByTestId("send-quote-retry", {}, { timeout: 4000 });
    expect(screen.getByTestId("send-confirm")).toBeDisabled();
    sdk.fakeSend.quotedAmount = null;
    await fireEvent.press(retry);
    await quoted(`Pay ${chf(2500)}`);
  });

  it("shows the balance available in the unit being typed", async () => {
    await openSend();
    await fireEvent.changeText(screen.getByLabelText("Recipient"), ADDRESS);
    await screen.findByText("Lightning address", {}, { timeout: 4000 });
    // 1 284 530 sats at 100 000 CHF per BTC: 1 284.53 CHF.
    // The locale groups digits with a no-break space: compared as plain spaces.
    const available = () =>
      (screen.getByTestId("send-available").props.children as string).replace(/\s/g, " ");
    expect(available()).toBe(`Available: ${chf(128453)}`.replace(/\s/g, " "));
    await fireEvent.press(screen.getByTestId("send-unit"));
    expect(available()).toBe("Available: 1'284'530 sats");
    await fireEvent.press(screen.getByTestId("send-unit"));
    expect(available()).toBe(`Available: ${chf(128453)}`.replace(/\s/g, " "));
  });

  it("shows the balance after the payment in the unit being typed (desktop)", async () => {
    mockDesktop.mockReturnValue(true);
    await openSend();
    await fireEvent.changeText(screen.getByLabelText("Recipient"), ADDRESS);
    await screen.findByText("Lightning address", {}, { timeout: 4000 });
    await fireEvent.press(screen.getByTestId("send-unit"));
    // The table's "Amount" column is labelled too, on desktop.
    await fireEvent.changeText(screen.getByTestId("send-amount"), "5000");
    await quoted("Send 5'000 sats");
    const after = () =>
      (screen.getByTestId("send-balance-after").props.children as string).replace(/\s/g, " ");
    // 1 284 530 sats, less 5 000 sats and 3 sats of fees.
    expect(after()).toBe("1'279'527 sats");
    await fireEvent.press(screen.getByTestId("send-unit"));
    await quoted(`Send ${chf(500)}`);
    // At 100 000 CHF per BTC, rounded down: 1 279.52 CHF.
    expect(after()).toBe(chf(127952).replace(/\s/g, " "));
  });

  it("rounds the francs available down: typing them never goes above the balance", async () => {
    // 1 284 536 sats at 100 000 CHF per BTC: 1 284.536 CHF, 1 284.53 CHF available, not 1 284.54.
    sdk.fakeWallet.balanceSats = BigInt(1_284_536);
    await openSend();
    await fireEvent.changeText(screen.getByLabelText("Recipient"), ADDRESS);
    await screen.findByText("Lightning address", {}, { timeout: 4000 });
    const available = (screen.getByTestId("send-available").props.children as string).replace(
      /\s/g,
      " "
    );
    expect(available).toBe(`Available: ${chf(128453)}`.replace(/\s/g, " "));
  });

  it("switches the unit back to the text typed, not to a conversion of a conversion", async () => {
    await openSend();
    await fireEvent.changeText(screen.getByLabelText("Recipient"), ADDRESS);
    await screen.findByText("Lightning address", {}, { timeout: 4000 });
    await fireEvent.press(screen.getByTestId("send-unit"));
    await fireEvent.changeText(screen.getByLabelText("Amount"), "5000");
    await fireEvent.press(screen.getByTestId("send-unit"));
    // 5 000 sats at 100 000 CHF per BTC: 5.00 CHF.
    expect(screen.getByLabelText("Amount").props.value).not.toBe("5000");
    await fireEvent.press(screen.getByTestId("send-unit"));
    expect(screen.getByLabelText("Amount").props.value).toBe("5000");
    await quoted("Send 5'000 sats");
  });

  it("keeps the francs being sent in their currency when the display currency changes meanwhile", async () => {
    await openSend();
    await fireEvent.changeText(screen.getByLabelText("Recipient"), ADDRESS);
    await screen.findByText("Lightning address", {}, { timeout: 4000 });
    await fireEvent.changeText(screen.getByLabelText("Amount"), "10");
    const send = await quoted(`Send ${chf(1000)}`);

    let answer!: () => void;
    signIn.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          answer = () => resolve({ seed: testSeed(), credentialId: null });
        })
    );
    await fireEvent.press(send);
    await waitFor(() => expect(signIn).toHaveBeenCalledTimes(2));
    // While the passkey is asked, another device's change of currency reaches this one (the
    // account's sync): the sheet stays open, the francs confirmed stay francs.
    await changeCurrency("EUR");
    expect(screen.getByLabelText("Amount").props.value).toBe("10");
    expect(within(screen.getByTestId("send-unit")).getByText("CHF")).toBeTruthy();

    await act(async () => answer());
    const result = await screen.findByTestId("send-result-completed");
    expect(within(result).getByText(chf(1000))).toBeTruthy();
    expect(within(result).getByText(`to ${ADDRESS}`)).toBeTruthy();
    // The sats quoted for 10.00 CHF at 100 000 CHF per BTC, confirmed at the tap.
    const instance = await walletInstance();
    const [{ prepareResponse }] = instance.lnurlPay.mock.calls[0] as [
      { prepareResponse: { amountSats: bigint } }
    ];
    expect(prepareResponse.amountSats).toBe(BigInt(10_000));
  });

  it("drops the francs typed when the display currency changes: never read in another one", async () => {
    await openSend();
    await fireEvent.changeText(screen.getByLabelText("Recipient"), ADDRESS);
    await screen.findByText("Lightning address", {}, { timeout: 4000 });
    await fireEvent.changeText(screen.getByLabelText("Amount"), "10");
    await quoted(`Send ${chf(1000)}`);

    await changeCurrency("EUR");
    expect(screen.getByLabelText("Amount").props.value).toBe("");
    await fireEvent.changeText(screen.getByLabelText("Amount"), "10");
    await quoted(`Send ${formatFiat(1000, 2, getDeviceLocale().languageTag)} EUR`);
  });

  it("starts the amount again in sats when the rate goes: francs are never read as sats", async () => {
    await openSend();
    await fireEvent.changeText(screen.getByLabelText("Recipient"), ADDRESS);
    await screen.findByText("Lightning address", {}, { timeout: 4000 });
    await fireEvent.changeText(screen.getByLabelText("Amount"), "5000");
    expect(screen.getByLabelText("Enter in sats")).toBeTruthy();
    // The rate goes: the francs typed go with it, the field is in sats.
    await act(async () => setMockRate(undefined));
    expect(screen.getByLabelText("Amount").props.value).toBe("");
    expect(screen.getByLabelText("Enter in CHF")).toBeTruthy();
    // Back with the rate, sats typed meanwhile stay sats.
    await act(async () => setMockRate(100000));
    await fireEvent.changeText(screen.getByLabelText("Amount"), "5000");
    await quoted("Send 5'000 sats");
  });

  it("says what to copy when the clipboard is empty", async () => {
    jest.mocked(Clipboard.getStringAsync).mockResolvedValue("");
    await openSend();
    await fireEvent.press(screen.getByTestId("send-paste"));
    expect(await screen.findByText("Copy an address or an invoice first")).toBeTruthy();
  });

  it("reads a scanned code, and withdraws to a Bitcoin address at the speed chosen", async () => {
    sdk.fakeSend.sentStatus = sdk.PaymentStatus.Pending;
    mockScanned = `bitcoin:${BTC_ADDRESS}`;
    sdk.fakeSend.inputs.set(mockScanned, sdk.fakeSend.inputs.get(BTC_ADDRESS)!);
    await openSend();
    await fireEvent.press(screen.getByTestId("send-scan"));
    expect(await screen.findByText("Bitcoin address")).toBeTruthy();
    expect(screen.queryByTestId("send-scanner")).toBeNull();

    // More than the balance: said in the field, nothing prepared.
    await fireEvent.changeText(screen.getByLabelText("Amount"), "5000");
    expect(await screen.findByText("Enter at most the available balance")).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText("Amount"), "400");
    // The three speeds share the sheet's width, each with its icon.
    expect(StyleSheet.flatten(screen.getByTestId("send-speed-group").props.style).alignSelf).toBe(
      "stretch"
    );
    for (const [speed, glyph] of [
      ["fast", 0xf135],
      ["medium", 0xf624],
      ["slow", 0xf4d3]
    ] as const) {
      expect(
        within(screen.getByTestId(`send-speed-${speed}`)).getByText(String.fromCodePoint(glyph))
      ).toBeTruthy();
    }
    await fireEvent.press(screen.getByTestId("send-speed-slow"));
    await quoted(`Send ${chf(40000)}`);
    await fireEvent.press(screen.getByTestId("send-confirm"));
    // Returned pending, yet sent: Spark's provider took the payout on (SendSheet's outcomeOf).
    const result = await screen.findByTestId("send-result-onchain");
    expect(within(result).getByText("Payment sent")).toBeTruthy();
    expect(within(result).getByText(chf(40000))).toBeTruthy();
    expect(within(result).getByText("to bc1qm4tz…ad2wz9")).toBeTruthy();
    expect(
      within(result).getByText(
        "The Bitcoin network still has to confirm the transaction: its status shows in the list of transactions."
      )
    ).toBeTruthy();
    expect(screen.queryByText("Payment in progress")).toBeNull();
    const instance = await walletInstance();
    const [{ options }] = instance.sendPayment.mock.calls[0] as [
      { options: { inner: { confirmationSpeed: number } } }
    ];
    expect(options.inner.confirmationSpeed).toBe(sdk.OnchainConfirmationSpeed.Slow);
  });

  // While the passkey or the payment runs, the whole form is disabled.
  it("disables the whole sheet, its cross included, while a payment is confirmed", async () => {
    await openSend();
    await fireEvent.changeText(screen.getByLabelText("Recipient"), BTC_ADDRESS);
    expect(await screen.findByText("Bitcoin address", {}, { timeout: 4000 })).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText("Amount"), "400");
    const send = await quoted(`Send ${chf(40000)}`);
    expect(screen.getByRole("button", { name: "Close" })).toBeEnabled();

    let answer!: () => void;
    signIn.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          answer = () => resolve({ seed: testSeed(), credentialId: null });
        })
    );
    await fireEvent.press(send);
    await waitFor(() => expect(signIn).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("button", { name: "Close" })).toBeDisabled();
    expect(screen.getByLabelText("Recipient")).toBeDisabled();
    expect(screen.getByLabelText("Amount")).toBeDisabled();
    expect(screen.getByTestId("send-unit")).toBeDisabled();
    for (const speed of ["fast", "medium", "slow"]) {
      expect(screen.getByTestId(`send-speed-${speed}`)).toBeDisabled();
    }

    await act(async () => answer());
    // Completed or not, an on-chain send says the same: its confirmation is still to come.
    expect(await screen.findByTestId("send-result-onchain")).toBeTruthy();
    expect(screen.getByText("Payment sent")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Close" })).toBeEnabled();
  });

  it("says an on-chain send that fails afterwards failed", async () => {
    sdk.fakeSend.sentStatus = sdk.PaymentStatus.Pending;
    await openSend();
    await fireEvent.changeText(screen.getByLabelText("Recipient"), BTC_ADDRESS);
    expect(await screen.findByText("Bitcoin address", {}, { timeout: 4000 })).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText("Amount"), "400");
    await fireEvent.press(await quoted(`Send ${chf(40000)}`));
    expect(await screen.findByTestId("send-result-onchain")).toBeTruthy();

    // Spark's provider gave the payout up: the payment, read again, failed.
    const sent = sdk.fakeWallet.payments[0];
    expect(sent.method).toBe(sdk.PaymentMethod.Withdraw);
    sent.status = sdk.PaymentStatus.Failed;
    expect(
      await screen.findByTestId("send-result-failed", {}, { timeout: FOLLOW_INTERVAL_MS + 2000 })
    ).toBeTruthy();
    expect(screen.getByText("The payment failed")).toBeTruthy();
    expect(screen.queryByText("Payment sent")).toBeNull();
  });

  it("follows a Lightning payment still on its way until it completes, in the same frame", async () => {
    sdk.fakeSend.sentStatus = sdk.PaymentStatus.Pending;
    await openSend();
    await fireEvent.changeText(screen.getByLabelText("Recipient"), ADDRESS);
    expect(await screen.findByText("Lightning address", {}, { timeout: 4000 })).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText("Amount"), "142.20");
    await fireEvent.press(await quoted(`Send ${chf(14220)}`));
    // Not paid yet, and it may still fail: neither green nor "sent". What leaves and to whom, the
    // spinner turning while it is followed, and closing said to cancel nothing.
    const pending = await screen.findByTestId("send-result-pending");
    expect(within(pending).getByText("Payment in progress")).toBeTruthy();
    expect(within(pending).getByText(chf(14220))).toBeTruthy();
    expect(within(pending).getByText(`to ${ADDRESS}`)).toBeTruthy();
    expect(
      within(pending).getByText(
        "The payment is on its way. This window updates by itself; closing it does not cancel the payment."
      )
    ).toBeTruthy();
    expect(within(pending).getByTestId("send-result-following")).toBeTruthy();
    expect(screen.queryByTestId("send-result-stalled")).toBeNull();
    // Nothing finished: "Close", not the filled "Done".
    expect(screen.getByTestId("send-done")).toHaveTextContent("Close");
    expect(screen.queryByText("Done")).toBeNull();

    // Read again: completed. Only the disc, the title, the note and the button change.
    sdk.fakeWallet.payments[0].status = sdk.PaymentStatus.Completed;
    const completed = await screen.findByTestId(
      "send-result-completed",
      {},
      { timeout: FOLLOW_INTERVAL_MS + 2000 }
    );
    expect(within(completed).getByText("Payment sent")).toBeTruthy();
    expect(within(completed).getByText(chf(14220))).toBeTruthy();
    expect(within(completed).getByText(`to ${ADDRESS}`)).toBeTruthy();
    expect(screen.queryByTestId("send-result-following")).toBeNull();
    expect(screen.getByTestId("send-done")).toHaveTextContent("Done");
    await fireEvent.press(screen.getByTestId("send-done"));
    await waitFor(() => expect(screen.queryByTestId("send-sheet")).toBeNull());
  });

  it("says a failed Lightning payment failed, with what it was", async () => {
    sdk.fakeSend.sentStatus = sdk.PaymentStatus.Pending;
    await openSend();
    await fireEvent.changeText(screen.getByLabelText("Recipient"), ADDRESS);
    expect(await screen.findByText("Lightning address", {}, { timeout: 4000 })).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText("Amount"), "142.20");
    await fireEvent.press(await quoted(`Send ${chf(14220)}`));
    expect(await screen.findByTestId("send-result-pending")).toBeTruthy();

    sdk.fakeWallet.payments[0].status = sdk.PaymentStatus.Failed;
    const failed = await screen.findByTestId(
      "send-result-failed",
      {},
      { timeout: FOLLOW_INTERVAL_MS + 2000 }
    );
    expect(within(failed).getByText("The payment failed")).toBeTruthy();
    expect(within(failed).getByText(chf(14220))).toBeTruthy();
    expect(within(failed).getByText(`to ${ADDRESS}`)).toBeTruthy();
    expect(
      within(failed).getByText("Check the recipient and the balance, then try again.")
    ).toBeTruthy();
    expect(screen.queryByTestId("send-result-following")).toBeNull();
  });

  it("says once it stops following a payment still pending where its outcome will show", async () => {
    jest.useFakeTimers({ advanceTimers: true });
    try {
      sdk.fakeSend.sentStatus = sdk.PaymentStatus.Pending;
      await openSend();
      await fireEvent.changeText(screen.getByLabelText("Recipient"), ADDRESS);
      expect(await screen.findByText("Lightning address", {}, { timeout: 4000 })).toBeTruthy();
      await fireEvent.changeText(screen.getByLabelText("Amount"), "142.20");
      await fireEvent.press(await quoted(`Send ${chf(14220)}`));
      expect(await screen.findByTestId("send-result-following")).toBeTruthy();
      const instance = await walletInstance();

      // Within FOLLOW_FOR_MS, still followed.
      await act(() => jest.advanceTimersByTimeAsync(FOLLOW_FOR_MS - FOLLOW_INTERVAL_MS));
      expect(screen.getByTestId("send-result-following")).toBeTruthy();
      expect(screen.queryByTestId("send-result-stalled")).toBeNull();

      await act(() => jest.advanceTimersByTimeAsync(2 * FOLLOW_INTERVAL_MS));
      const pending = screen.getByTestId("send-result-pending");
      expect(within(pending).getByTestId("send-result-stalled")).toBeTruthy();
      expect(screen.queryByTestId("send-result-following")).toBeNull();
      expect(within(pending).getByText("Still in progress")).toBeTruthy();
      expect(within(pending).getByText(chf(14220))).toBeTruthy();
      expect(within(pending).getByText(`to ${ADDRESS}`)).toBeTruthy();
      expect(
        within(pending).getByText("Its final status will show in the list of transactions.")
      ).toBeTruthy();
      // No longer read: the sheet never says more than it knows.
      const reads = instance.getPayment.mock.calls.length;
      await act(() => jest.advanceTimersByTimeAsync(5 * FOLLOW_INTERVAL_MS));
      expect(instance.getPayment.mock.calls.length).toBe(reads);
      expect(screen.getByTestId("send-done")).toHaveTextContent("Close");
    } finally {
      jest.useRealTimers();
    }
  });

  it("says when a recipient is not something it pays", async () => {
    await openSend();
    await fireEvent.changeText(screen.getByLabelText("Recipient"), "hello");
    expect(
      await screen.findByText("Enter an address or an invoice", {}, { timeout: 4000 })
    ).toBeTruthy();
    expect(screen.queryByLabelText("Amount")).toBeNull();
  });

  it("says when an LNURL's service does not answer, not that it is no payment request", async () => {
    await openSend();
    await fireEvent.changeText(
      screen.getByLabelText("Recipient"),
      encodeLnurl("https://pay.example.com/lnurlp/bakehouse")
    );
    expect(
      await screen.findByText("Try again: the LNURL link is not responding", {}, { timeout: 4000 })
    ).toBeTruthy();
    expect(screen.queryByLabelText("Amount")).toBeNull();
  });
});
