import "@/i18n";

import { DEFAULT_RELAYS } from "@/config/relays";
import { fireEvent, renderRouter, screen, waitFor, within } from "expo-router/testing-library";

import AppLayout from "@/app/(app)/_layout";
import PosLayout from "@/app/(app)/pos/_layout";
import AmountScreen from "@/app/(app)/pos/index";
import WalletRoute from "@/app/(app)/wallet";
import LaunchScreen from "@/app/index";

import { closeAccount, getAccountTeamKeys, getAccountWalletId } from "@/features/account/session";
import { dueDateLabel } from "@/features/invoices/format";
import { calendarDate } from "@/features/invoices/invoices";
import { periodDays, periodGlyph } from "@/features/wallet/export/period";
import { signInWithPasskey } from "@/lib/breez/passkey";
import { walletSecret } from "@/lib/breez/seed";
import { decodeBolt11 } from "@/lib/lightning/bolt11";
import { getDeviceLocale } from "@/lib/locale/device";
import { formatDate } from "@/lib/locale/date";
import { publishToRelays } from "@/lib/nostr/pool";
import { paymentRatesOf } from "@/lib/rates/payment-rates";
import { fundsRecoveriesEvent } from "@/lib/recovery/record";
import { pointHourOf } from "@/lib/rates/sources";
import { declareInvoice, saleRegistry, takerTag } from "@/lib/registry/registry";
import type { MerchantSettings } from "@/lib/settings/merchant";
import { saveMerchantSettings } from "@/lib/settings/store";
import {
  deriveBusinessRegistry,
  deriveFundsRecoveryKeys,
  derivePaymentRateKeys,
  deriveTeamKeys,
  ownerDevicesSecret,
  ownerTakerKey
} from "@/lib/team/keys";
import { saveTerminalProfile } from "@/lib/terminal/profile";

import { TEST_WALLET_ID, testBackupKey, testSeed } from "../../jest/account";
import { coingecko, setCoingeckoPrice } from "../../jest/coingecko";
import { makeInvoice, preimagePair } from "../../jest/lightning";
import type * as BreezFake from "../../jest/breez-sdk";
import type * as DatePickerFake from "../../jest/datetimepicker";
import type * as FileSystemFake from "../../jest/expo-file-system";
import type * as PrintFake from "../../jest/expo-print";
import type * as RelaysFake from "../../jest/nostr-relays";
import type * as SharingFake from "../../jest/expo-sharing";

jest.mock("../lib/breez/config", () => ({
  ...jest.requireActual("../lib/breez/config"),
  getWalletConfig: () => ({ network: "mainnet", apiKey: "test-api-key" }),
  getBreezNetwork: () => "mainnet"
}));
// The passkey prompt is the test's; the wallet layer is the real one, over the fake SDK.
jest.mock("../lib/breez/passkey", () => ({
  createPasskeyWallet: jest.fn(),
  preparePasskeys: jest.fn(async () => undefined),
  passkeysReady: jest.fn(() => true),
  signInWithPasskey: jest.fn()
}));
// The point of sale's current rate (the list's francs): 1 BTC = 100 000 CHF.
jest.mock("../features/terminal/useRate", () => ({
  useRate: () => ({ rate: 100000, loading: false, current: () => 100000 })
}));
jest.mock("../config/payment-links", () => ({
  ...jest.requireActual("../config/payment-links"),
  getPaymentLinkOrigin: () => "https://web.example"
}));
const mockDesktop = jest.fn(() => false);
jest.mock("@/components/layout/useIsDesktop", () => ({
  ...jest.requireActual("@/components/layout/useIsDesktop"),
  useIsDesktop: () => mockDesktop()
}));

const signIn = jest.mocked(signInWithPasskey);
const relays = jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");
const sdk = jest.requireMock<typeof BreezFake>("@breeztech/breez-sdk-spark-react-native");
const sharing = jest.requireMock<typeof SharingFake>("expo-sharing");
const print = jest.requireMock<typeof PrintFake>("expo-print");
const fileSystem = jest.requireMock<typeof FileSystemFake>("expo-file-system");
const datePicker = jest.requireMock<typeof DatePickerFake>(
  "@react-native-community/datetimepicker"
);

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
  "(app)/wallet": WalletRoute
};

/**
 * Now minus `minutes`, in Unix seconds: today's payments, the newest first. Just after midnight,
 * they stay today (a few seconds after it), in the same order.
 */
const minutesAgo = (minutes: number) => {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 1000;
  return Math.max(Math.floor(now.getTime() / 1000) - minutes * 60, startOfDay + 10 - minutes);
};

/** The CSV's date and time of `timestamp`, as the device writes them. */
const csvDate = (timestamp: number) =>
  formatDate(new Date(timestamp * 1000), getDeviceLocale().languageTag, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });

/** "YYYY-MM-DD" of `date`, in the device's calendar. */
const day = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const SALE_AT = minutesAgo(4);
const TIP_AT = minutesAgo(3);
const SENT_AT = minutesAgo(2);

/**
 * The wallet of the month: a sale of the point of sale marked by one of the owner's devices
 * (18 420 sats, "Table 12", 17.46 CHF typed), a tip received over Lightning (5 000 sats), 150 000
 * sats sent to a Lightning address (12 sats of fees), a withdrawal still being confirmed, and a
 * payment received 40 days ago, before the month.
 */
async function fillWallet() {
  const team = deriveTeamKeys(walletSecret(testSeed()));
  const { paymentHash } = preimagePair(7);
  const pr = makeInvoice({
    amountMsat: 18_420_000n,
    paymentHash,
    timestamp: SALE_AT - 60,
    expirySeconds: 600
  });
  const sale = saleRegistry(deriveBusinessRegistry(team), new Uint8Array(32).fill(7));
  await declareInvoice(
    {
      ...sale,
      taker: takerTag(ownerTakerKey(ownerDevicesSecret(team)), sale.saleKeys.nostr.publicKey)
    },
    { pr, decoded: decodeBolt11(pr)!, verifyUrl: "https://breez.tips/verify/x" },
    { fiat: { minor: 1746, digits: 2, currency: "CHF" }, note: "Table 12" }
  );
  const lightning = (hash: string, extra: Record<string, unknown> = {}) => ({
    tag: sdk.PaymentDetails_Tags.Lightning,
    inner: {
      invoice: "lnbc1",
      destinationPubkey: "02ab",
      htlcDetails: { paymentHash: hash },
      ...extra
    }
  });
  sdk.fakeWallet.balanceSats = BigInt(1_000_000);
  sdk.fakeWallet.payments = [
    {
      id: "withdrawal",
      paymentType: sdk.PaymentType.Send,
      status: sdk.PaymentStatus.Pending,
      amount: BigInt(400000),
      fees: BigInt(1840),
      timestamp: BigInt(minutesAgo(1)),
      method: sdk.PaymentMethod.Withdraw,
      details: { tag: sdk.PaymentDetails_Tags.Withdraw, inner: { txId: "8e2d6b3acccccccc41fa" } }
    },
    {
      id: "sent",
      paymentType: sdk.PaymentType.Send,
      status: sdk.PaymentStatus.Completed,
      amount: BigInt(150000),
      fees: BigInt(12),
      timestamp: BigInt(SENT_AT),
      method: sdk.PaymentMethod.Lightning,
      details: lightning("b".repeat(64), {
        lnurlPayInfo: { lnAddress: "bakehouse@wallet.example" }
      })
    },
    {
      id: "tip",
      paymentType: sdk.PaymentType.Receive,
      status: sdk.PaymentStatus.Completed,
      amount: BigInt(5000),
      fees: BigInt(0),
      timestamp: BigInt(TIP_AT),
      method: sdk.PaymentMethod.Lightning,
      details: lightning("c".repeat(64), { description: "Tip" })
    },
    {
      id: "sale",
      paymentType: sdk.PaymentType.Receive,
      status: sdk.PaymentStatus.Completed,
      amount: BigInt(18420),
      fees: BigInt(0),
      timestamp: BigInt(SALE_AT),
      method: sdk.PaymentMethod.Lightning,
      details: lightning(paymentHash)
    },
    {
      id: "old",
      paymentType: sdk.PaymentType.Receive,
      status: sdk.PaymentStatus.Completed,
      amount: BigInt(7777),
      fees: BigInt(0),
      timestamp: BigInt(Math.floor(Date.now() / 1000) - 40 * 86_400),
      method: sdk.PaymentMethod.Lightning,
      details: lightning("d".repeat(64), { description: "Old" })
    }
  ];
  return { sale };
}

/** 1 BTC = 100 000 CHF at each hour of the last two days, as CoinGecko publishes it. */
function priceTheLastDays() {
  const last = pointHourOf(Math.floor(Date.now() / 1000));
  for (let hour = last - 48 * 3600; hour <= last; hour += 3600) {
    setCoingeckoPrice("CHF", hour, 100_000);
  }
}

/** The app of a prepared device, unlocked, then on the wallet screen, its list shown. */
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
  await fireEvent.press(screen.getByTestId(mockDesktop() ? "sidebar-wallet" : "dock-unlock"));
  await waitFor(() => expect(getAccountWalletId()).toBe(TEST_WALLET_ID));
  if (!mockDesktop()) await fireEvent.press(await screen.findByLabelText("Wallet"));
  await waitFor(() => expect(router.getPathname()).toBe("/wallet"));
  expect(await screen.findByText("Table 12")).toBeTruthy();
  return { router };
}

/** How many payments' rates "Wallet" recorded (src/features/wallet/payment-rates.ts). */
function ratesRecorded(): number {
  const keys = derivePaymentRateKeys(getAccountTeamKeys()!);
  return paymentRatesOf(keys, relays.stored.get(DEFAULT_RELAYS[0]!) ?? []).rates.size;
}

/** "Export" opened, once the wallet's first sync is done. */
async function openExport() {
  const button = screen.getByTestId("wallet-export-open");
  await waitFor(() => expect(button).toBeEnabled());
  await fireEvent.press(button);
  return within(await screen.findByTestId("wallet-export"));
}

/** The text of the file shared last (its URI in the fake file system). */
function sharedText(): string {
  const last = sharing.shared[sharing.shared.length - 1];
  if (!last) throw new Error("Nothing shared");
  const text = fileSystem.files.get(last.url);
  if (text === undefined) throw new Error(`No file at ${last.url}`);
  return text;
}

describe('"Export" of "Wallet"', () => {
  beforeEach(async () => {
    closeAccount();
    relays.resetRelays();
    mockDesktop.mockReturnValue(false);
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    signIn.mockReset().mockResolvedValue({ seed: testSeed(), credentialId: null });
    await saveMerchantSettings(TEST_WALLET_ID, settings);
  });

  it("shares the month's transactions done as a CSV, with the columns ticked", async () => {
    await fillWallet();
    priceTheLastDays();
    await openWalletScreen();
    const sheet = await openExport();
    expect(sheet.getByText("Export transactions")).toBeTruthy();

    await fireEvent.press(sheet.getByTestId("wallet-export-format-csv"));
    // "By" ticked, "Reference" unticked.
    await fireEvent.press(sheet.getByTestId("wallet-export-column-by"));
    await fireEvent.press(sheet.getByTestId("wallet-export-column-reference"));
    expect(sheet.getByTestId("wallet-export-column-by")).toBeChecked();
    expect(sheet.getByTestId("wallet-export-column-reference")).not.toBeChecked();
    await fireEvent.press(sheet.getByTestId("wallet-export-submit"));

    await waitFor(() => expect(sharing.shared).toHaveLength(1));
    const today = new Date();
    const first = day(new Date(today.getFullYear(), today.getMonth(), 1));
    expect(sharing.shared[0]!.url).toMatch(
      new RegExp(`/Fine-Bakery_${first}_${day(today)}\\.csv$`)
    );
    expect(sharing.shared[0]!.options).toEqual({
      mimeType: "text/csv",
      UTI: "public.comma-separated-values-text",
      dialogTitle: "Export transactions"
    });
    // en-CH: decimal points, "," between columns, a date holding one quoted. The withdrawal being
    // confirmed and the payment of 40 days ago are not in it.
    expect(sharedText()).toBe(
      "﻿" +
        [
          // "Remark" ticked too, empty for lines with nothing to say.
          "Date and time,Description,Source,By,Amount in BTC,Amount in CHF,Remark",
          `"${csvDate(SALE_AT)}",Table 12,Point of sale,You,0.00018420,17.46,`,
          `"${csvDate(TIP_AT)}",Tip,Received,,0.00005000,5.00,`,
          `"${csvDate(SENT_AT)}",bakehouse@wallet.example,Sent,,-0.00150000,-150.00,`,
          ""
        ].join("\r\n")
    );
    // Done: the sheet closes.
    await waitFor(() => expect(screen.queryByTestId("wallet-export")).toBeNull());
  });

  it("makes the PDF statement in francs, its totals the sums of its lines, then in BTC", async () => {
    await fillWallet();
    priceTheLastDays();
    await openWalletScreen();
    let sheet = await openExport();
    // "Simple (PDF)" in francs when it opens.
    expect(sheet.getByTestId("wallet-export-format-pdf")).toBeChecked();
    expect(sheet.getByTestId("wallet-export-unit-fiat")).toBeChecked();
    // The rates come from what "Wallet" recorded at each payment done (the sale, the tip,
    // the sending), never from CoinGecko.
    await waitFor(() => expect(ratesRecorded()).toBe(3));
    const asked = coingecko.requests.length;
    await fireEvent.press(sheet.getByTestId("wallet-export-submit"));

    await waitFor(() => expect(print.files).toHaveLength(1));
    expect(coingecko.requests).toHaveLength(asked);
    const html = print.files[0]!.html;
    expect(html).toContain("Fine Bakery");
    expect(html).toContain("Transactions report");
    const cell = (label: string) =>
      new RegExp(`<td>${label}</td><td class="num">([^<]*)</td>`).exec(html)?.[1];
    expect(cell("Number of transactions")).toBe("3");
    expect(cell("of which point of sale")).toBe("1");
    expect(cell("of which received")).toBe("1");
    expect(cell("of which sent")).toBe("1");
    // 17.46 CHF typed + 5 000 sats at 100 000 CHF; 150 000 sats sent, 12 sats of fees (0.012 CHF).
    expect(cell("Total received")).toBe("+22.46 CHF");
    expect(cell("Total sent")).toBe("−150.00 CHF");
    expect(cell("Sending fees")).toBe("−0.01 CHF");
    expect(html).toContain("Table 12");
    expect(html).not.toContain("Old");
    await waitFor(() => expect(sharing.shared).toHaveLength(1));
    expect(sharing.shared[0]!.url).toMatch(/\/Fine-Bakery_[\d-]+_[\d-]+\.pdf$/);
    await waitFor(() => expect(screen.queryByTestId("wallet-export")).toBeNull());

    sheet = await openExport();
    await fireEvent.press(sheet.getByTestId("wallet-export-unit-btc"));
    await fireEvent.press(sheet.getByTestId("wallet-export-submit"));
    await waitFor(() => expect(print.files).toHaveLength(2));
    const btc = print.files[1]!.html;
    expect(btc).toContain("+0.00023420 BTC");
    expect(btc).toContain("−0.00150000 BTC");
    expect(btc).not.toContain("CoinGecko");
  });

  it('writes the file in the language picked beside "Export", the app\'s at first', async () => {
    await fillWallet();
    priceTheLastDays();
    await openWalletScreen();
    let sheet = await openExport();
    // At the end of "Export" (a split button), named for what it is the language of.
    const chip = sheet.getByTestId("wallet-export-language");
    expect(within(chip).getByText("EN")).toBeTruthy();
    expect(chip.props.accessibilityLabel).toBe("Export language: English. Change");
    await fireEvent.press(chip);
    const menu = await screen.findByTestId("wallet-export-language-menu");
    expect(within(menu).getByText("Export language")).toBeTruthy();
    await fireEvent.press(within(menu).getByTestId("wallet-export-language-de-CH"));
    expect(within(sheet.getByTestId("wallet-export-language")).getByText("DE-CH")).toBeTruthy();
    await waitFor(() => expect(ratesRecorded()).toBe(3));
    await fireEvent.press(sheet.getByTestId("wallet-export-submit"));
    await waitFor(() => expect(print.files).toHaveLength(1));
    const html = print.files[0]!.html;
    expect(html).toContain('<html lang="de-CH">');
    expect(html).toContain("Transaktionsbericht");
    expect(html).toContain("Total eingenommen");
    // Its amounts as Switzerland writes them.
    expect(html).toContain("+22.46 CHF");
    await waitFor(() => expect(screen.queryByTestId("wallet-export")).toBeNull());

    // Opened again: the app's language again; a CSV in German, its share sheet in the app's.
    sheet = await openExport();
    expect(within(sheet.getByTestId("wallet-export-language")).getByText("EN")).toBeTruthy();
    await fireEvent.press(sheet.getByTestId("wallet-export-format-csv"));
    await fireEvent.press(sheet.getByTestId("wallet-export-language"));
    await fireEvent.press(await screen.findByTestId("wallet-export-language-de-CH"));
    await fireEvent.press(sheet.getByTestId("wallet-export-submit"));
    await waitFor(() => expect(sharing.shared).toHaveLength(2));
    expect(sharing.shared[1]!.options).toMatchObject({ dialogTitle: "Export transactions" });
    const [header] = sharedText().replace("\ufeff", "").split("\r\n");
    expect(header!.startsWith("Datum und Uhrzeit,")).toBe(true);
  });

  it('leaves out "Funds recovered", read from a majority of the relays first', async () => {
    await fillWallet();
    priceTheLastDays();
    // The merchant's own funds back in the balance: a deposit its recovery record names.
    const txid = "e".repeat(64);
    sdk.fakeWallet.payments = [
      {
        id: "recovered",
        paymentType: sdk.PaymentType.Receive,
        status: sdk.PaymentStatus.Completed,
        amount: BigInt(49000),
        fees: BigInt(0),
        timestamp: BigInt(minutesAgo(5)),
        method: sdk.PaymentMethod.Deposit,
        details: { tag: sdk.PaymentDetails_Tags.Deposit, inner: { txId: txid } }
      },
      ...sdk.fakeWallet.payments
    ];
    const keys = deriveFundsRecoveryKeys(deriveTeamKeys(walletSecret(testSeed())));
    await publishToRelays(
      fundsRecoveriesEvent(
        keys,
        {
          subject: { kind: "account" },
          walletId: TEST_WALLET_ID,
          destination: null,
          recoveries: [{ txid, valueSats: 50_000n, at: minutesAgo(30) }]
        },
        minutesAgo(30)
      ),
      { relays: DEFAULT_RELAYS, channel: "account", timeoutMs: 1000, authKey: keys.nostr.secretKey }
    );
    await openWalletScreen();
    const sheet = await openExport();
    await fireEvent.press(sheet.getByTestId("wallet-export-format-csv"));
    // Without a majority's read of the recoveries, the deposit could be told a reception.
    const answers = relays.queryEvents;
    const author = keys.nostr.publicKey;
    const spy = jest
      .spyOn(relays, "queryEvents")
      .mockImplementation(async (url, filter, options) => {
        if (filter.authors?.includes(author) && url !== DEFAULT_RELAYS[0]) {
          throw new Error(`${url}: no answer in time`);
        }
        return answers(url, filter, options);
      });
    await fireEvent.press(sheet.getByTestId("wallet-export-submit"));
    expect(
      await sheet.findByText(
        "Your sales could not be read. Check your internet connection, then try again."
      )
    ).toBeTruthy();
    spy.mockRestore();
    await fireEvent.press(sheet.getByTestId("wallet-export-submit"));
    await waitFor(() => expect(sharing.shared).toHaveLength(1));
    const lines = sharedText().split("\r\n");
    // The header, the sale, the tip, the sending: never the deposit.
    expect(lines).toHaveLength(5);
    expect(sharedText()).not.toContain("0.00049000");
  });

  it("says why when the relays do not answer, and exports once they do", async () => {
    await fillWallet();
    priceTheLastDays();
    await openWalletScreen();
    const sheet = await openExport();
    for (const relay of DEFAULT_RELAYS) relays.unreachable.add(relay);
    await fireEvent.press(sheet.getByTestId("wallet-export-submit"));

    expect(
      await sheet.findByText(
        "Your sales could not be read. Check your internet connection, then try again."
      )
    ).toBeTruthy();
    expect(sharing.shared).toHaveLength(0);
    expect(screen.getByTestId("wallet-export")).toBeTruthy();

    relays.unreachable.clear();
    await fireEvent.press(sheet.getByTestId("wallet-export-submit"));
    await waitFor(() => expect(sharing.shared).toHaveLength(1));
  });

  it("never asks CoinGecko: a line without a rate recorded tells bitcoin", async () => {
    await fillWallet();
    // CoinGecko out of reach while "Wallet" showed: no rate was recorded.
    coingecko.down = true;
    await openWalletScreen();
    let sheet = await openExport();
    await waitFor(() => expect(coingecko.requests.length).toBeGreaterThan(0));
    const asked = coingecko.requests.length;
    await fireEvent.press(sheet.getByTestId("wallet-export-submit"));
    await waitFor(() => expect(print.files).toHaveLength(1));
    const html = print.files[0]!.html;
    // The sale in the francs typed; the tip and the sending in bitcoin, each total apart.
    expect(html).toContain('<td class="num">+17.46 CHF</td>');
    expect(html).toContain('<td class="num">+0.00005000 BTC</td>');
    expect(html).toContain('<tr class="lead"><td></td><td class="num">+0.00005000 BTC</td></tr>');
    expect(html).toContain('<th class="num">Amount</th>');
    expect(coingecko.requests).toHaveLength(asked);
    await waitFor(() => expect(screen.queryByTestId("wallet-export")).toBeNull());

    // A CSV in francs: their cells stay empty for those lines.
    sheet = await openExport();
    await fireEvent.press(sheet.getByTestId("wallet-export-format-csv"));
    await fireEvent.press(sheet.getByTestId("wallet-export-submit"));
    await waitFor(() => expect(sharing.shared).toHaveLength(2));
    expect(sharedText()).toContain(`"${csvDate(SALE_AT)}",Table 12,Point of sale,`);
    expect(sharedText()).toContain(",0.00005000,,\r\n");
    expect(coingecko.requests).toHaveLength(asked);
  });

  it("draws the presets as calendar pages, the period's days once, and counts the columns", async () => {
    await fillWallet();
    priceTheLastDays();
    await openWalletScreen();
    const sheet = await openExport();
    // What it exports, under the title.
    expect(sheet.getByTestId("sheet-subtitle")).toHaveTextContent(
      "The period's completed transactions: paid sales, received and sent payments."
    );
    const { languageTag } = getDeviceLocale();
    const today = new Date();
    const custom = { first: calendarDate(today), last: calendarDate(today) };
    const span = (period: "thisMonth" | "lastMonth") => periodDays(period, today, custom);
    const spanText = (period: "thisMonth" | "lastMonth") =>
      `${dueDateLabel(span(period).first, languageTag, "numeric")} – ${dueDateLabel(span(period).last, languageTag, "numeric")}`;

    // "This month" when it opens: its page says its month, its days show once, under the tiles.
    expect(sheet.getByTestId("wallet-export-period-thisMonth")).toBeChecked();
    expect(sheet.getByTestId("wallet-export-period-custom")).not.toBeChecked();
    expect(
      within(sheet.getByTestId("wallet-export-period-thisMonth")).getByText(
        periodGlyph("thisMonth", span("thisMonth"), languageTag),
        { includeHiddenElements: true }
      )
    ).toBeTruthy();
    expect(sheet.getByTestId("wallet-export-days")).toHaveTextContent(spanText("thisMonth"));
    expect(sheet.getByLabelText(`Last month, ${spanText("lastMonth")}`)).toBeTruthy();

    await fireEvent.press(sheet.getByTestId("wallet-export-period-lastMonth"));
    expect(sheet.getByTestId("wallet-export-period-lastMonth")).toBeChecked();
    expect(sheet.getByTestId("wallet-export-period-thisMonth")).not.toBeChecked();
    expect(sheet.getByTestId("wallet-export-days")).toHaveTextContent(spanText("lastMonth"));

    // "Detailed (CSV)": v2's six columns and "Remark", of fourteen, the count following each
    // tick.
    await fireEvent.press(sheet.getByTestId("wallet-export-format-csv"));
    expect(sheet.getByTestId("wallet-export-columns-ticked")).toHaveTextContent("7 of 14");
    await fireEvent.press(sheet.getByTestId("wallet-export-column-by"));
    expect(sheet.getByTestId("wallet-export-columns-ticked")).toHaveTextContent("8 of 14");
  });

  it("exports the days chosen, each picker kept within the other's day", async () => {
    await fillWallet();
    priceTheLastDays();
    await openWalletScreen();
    const sheet = await openExport();
    await fireEvent.press(sheet.getByTestId("wallet-export-period-custom"));
    expect(sheet.getByTestId("wallet-export-period-custom")).toBeChecked();
    expect(sheet.getByTestId("wallet-export-period-thisMonth")).not.toBeChecked();
    // From the month's first day to today when it is chosen.
    expect(sheet.getByText("From", { includeHiddenElements: true })).toBeTruthy();
    expect(sheet.getByText("To", { includeHiddenElements: true })).toBeTruthy();
    const today = new Date();
    const at = (daysAgo: number) =>
      new Date(today.getFullYear(), today.getMonth(), today.getDate() - daysAgo, 12);
    const pick = async (testID: string, date: Date) =>
      await fireEvent(
        sheet.getByTestId(testID),
        "valueChange",
        { nativeEvent: { timestamp: date.getTime(), utcOffset: 0 } },
        date
      );
    // The payment of 40 days ago alone: from 41 days ago to 39.
    await pick("wallet-export-from-picker", at(41));
    await pick("wallet-export-to-picker", at(39));
    // "To", drawn last: from "From"'s day to today, as Apple's picker would offer them.
    expect(datePicker.shownPicker()).toMatchObject({
      minimumDate: new Date(at(41).setHours(0)),
      maximumDate: new Date(at(0).setHours(0))
    });
    expect(() => datePicker.pickDate(at(42))).toThrow("Before minimum");

    await fireEvent.press(sheet.getByTestId("wallet-export-format-csv"));
    await fireEvent.press(sheet.getByTestId("wallet-export-submit"));
    await waitFor(() => expect(sharing.shared).toHaveLength(1));
    expect(sharing.shared[0]!.url).toMatch(
      new RegExp(`/Fine-Bakery_${day(at(41))}_${day(at(39))}\\.csv$`)
    );
    const lines = sharedText().split("\r\n");
    expect(lines).toHaveLength(3);
    expect(lines[1]).toMatch(/,Old,Received,/);
  });

  it("waits for the wallet's first sync: newer payments may be missing until then", async () => {
    await fillWallet();
    const release = sdk.holdFirstSync();
    await openWalletScreen();
    expect(screen.getByTestId("wallet-export-open")).toBeDisabled();
    release();
    await waitFor(() => expect(screen.getByTestId("wallet-export-open")).toBeEnabled());
  });

  it('offers "Export" beside "New invoice" on desktop', async () => {
    mockDesktop.mockReturnValue(true);
    await fillWallet();
    priceTheLastDays();
    await openWalletScreen();
    expect(screen.getByTestId("wallet-new-invoice")).toBeTruthy();
    const sheet = await openExport();
    await fireEvent.press(sheet.getByTestId("wallet-export-submit"));
    await waitFor(() => expect(print.files).toHaveLength(1));
  });
});
