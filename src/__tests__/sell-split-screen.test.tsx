import "@/i18n";

import { Slot } from "expo-router";
import { act, fireEvent, renderRouter, screen, waitFor } from "expo-router/testing-library";
import { useState } from "react";
import { Pressable } from "react-native";

import AppLayout from "@/app/(app)/_layout";
import WalletLayout from "@/app/(app)/wallet/_layout";
import LaunchScreen from "@/app/index";
import { openExternal } from "@/components/ui/external-link";
import {
  closeAccount,
  getAccountBackupKey,
  getAccountSettings,
  updateAccount
} from "@/features/account/session";
import { SellSheet } from "@/features/sell/SellSheet";
import { resetSplitSale, useSplitSale } from "@/features/sell/SplitSale";
import { resetTerminalProfileCache } from "@/features/terminal/profile-cache";
import { getAppInfo, type AppInfo } from "@/lib/app-info";
import type { WalletPayment } from "@/lib/breez/types";
import { getDeviceLocale } from "@/lib/locale/device";
import { formatInteger } from "@/lib/locale/format";
import { maskedIban } from "@/lib/mtpelerin/accounts";
import type * as Sale from "@/lib/mtpelerin/sale";
import { splitOid } from "@/lib/mtpelerin/split";
import { formatFiat } from "@/lib/terminal/amount";
import type { SavedTerminalProfile } from "@/lib/terminal/model";
import { saveTerminalProfile } from "@/lib/terminal/profile";

import { TEST_WALLET_ID, openMerchantAccount } from "../../jest/account";
import { SCENARIO_IBAN } from "../../jest/mtpelerin-fake/scenarios";
import { ORDER_LOCK_MS } from "../../jest/mtpelerin-fake/server";
import type * as MtPelerinFake from "../../jest/mtpelerin";
import type * as FileSystemFake from "../../jest/expo-file-system";
import type * as RelaysFake from "../../jest/nostr-relays";

/*
 * The split's sale as the merchant meets it in "Wallet" (src/features/sell/SplitSale.tsx): its
 * notice, its panel that opens by itself, the sale made in
 * one gesture, and what it says when less than the share can be sold. Against the fake Mt Pelerin
 * of the tests (84 318 CHF a bitcoin, 1.3 % of fees), in the production app (its SMS login). The
 * wallet's payments are the test's, its payer mocked below.
 */

jest.mock("../lib/app-info", () => ({
  ...jest.requireActual("../lib/app-info"),
  getAppInfo: jest.fn()
}));
jest.mock("../lib/breez/config", () => ({
  ...jest.requireActual("../lib/breez/config"),
  getBreezNetwork: () => "mainnet"
}));
jest.mock("../features/terminal/useRate", () => ({
  useRate: () => ({ rate: 100000, loading: false, current: () => 100000 })
}));
jest.mock("../components/ui/external-link", () => ({
  ...jest.requireActual("../components/ui/external-link"),
  openExternal: jest.fn()
}));
// The account's wallet: `mockBalance` sats, 1 sat of fees a payment, paid to the fake Mt Pelerin
// and kept among its payments (`mockPayments`); the passkey's answer, `mockConfirm`'s.
let mockBalance = 0n;
let mockConfirm = async () => true;
jest.mock("@/features/sell/wallet-payer", () => ({
  walletPayer: () => ({
    quote: async (invoice: { amountSats: bigint }) => ({
      amountSats: invoice.amountSats,
      feeSats: BigInt(1)
    }),
    covers: async (quote: { amountSats: bigint; feeSats: bigint }) =>
      mockBalance >= quote.amountSats + quote.feeSats,
    balance: async () => mockBalance,
    paidSince: async (since: number) =>
      jest
        .requireActual<typeof Sale>("@/lib/mtpelerin/sale")
        .salePayments(mockPayments.filter((payment) => payment.timestamp >= since)),
    confirm: () => mockConfirm(),
    pay: async (quote: {
      invoice: { pr: string; paymentHash: string };
      amountSats: bigint;
      feeSats: bigint;
    }) => {
      const mtp = jest.requireMock<typeof MtPelerinFake>("@/lib/mtpelerin/transport");
      if (!mtp.mtPelerin().payInvoice(quote.invoice.pr)) throw new Error("Unknown invoice");
      mockBalance -= quote.amountSats + quote.feeSats;
      mockPayments.push({
        id: `sent-${mockPayments.length}`,
        direction: "send",
        status: "completed",
        amountSats: quote.amountSats,
        feeSats: quote.feeSats,
        timestamp: Math.floor(Date.now() / 1000),
        network: "lightning",
        paymentHash: quote.invoice.paymentHash
      });
    }
  })
}));
// The wallet's payments: the test's.
let mockPayments: WalletPayment[] = [];
jest.mock("@/features/wallet/payments-history", () => ({
  readWalletPayments: async (since: number) =>
    mockPayments.filter((payment) => payment.timestamp >= since)
}));

const fake = jest.requireMock<typeof MtPelerinFake>("@/lib/mtpelerin/transport");
const relays = jest.requireMock<typeof RelaysFake>("@/lib/nostr/relay");
const fileSystem = jest.requireMock<typeof FileSystemFake>("expo-file-system");
const ADDRESS = "sattleme02c6047f94@breez.tips";
const SLOW = { timeout: 5000 };
const onSold = jest.fn();

const PRODUCTION: AppInfo = {
  variant: "production",
  version: "3.0.0",
  buildNumber: "3000000",
  commit: null,
  updates: null
};

/** "Wallet", as far as the split's sale goes: its notice, its panel, "Sell"'s. */
function SplitHost() {
  const [selling, setSelling] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const split = useSplitSale({
    enabled,
    openWallet: async () => undefined,
    onSold,
    openSell: () => setSelling(true)
  });
  return (
    <>
      <Pressable accessibilityRole="button" onPress={() => setSelling(true)} testID="open-sell" />
      <Pressable accessibilityRole="button" onPress={() => setSelling(false)} testID="close-sell" />
      <Pressable accessibilityRole="button" onPress={() => setEnabled(true)} testID="show-wallet" />
      <Pressable
        accessibilityRole="button"
        onPress={() => setEnabled(false)}
        testID="hide-wallet"
      />
      {split.notice}
      <SellSheet
        visible={selling}
        onClose={() => setSelling(false)}
        openWallet={async () => undefined}
        onSold={onSold}
      />
      {split.sheet}
    </>
  );
}

const routes = {
  index: LaunchScreen,
  "(app)/_layout": AppLayout,
  "(app)/pos/_layout": () => <Slot />,
  "(app)/pos/index": () => null,
  "(app)/wallet/_layout": WalletLayout,
  "(app)/wallet/index": SplitHost
};

const nowSeconds = () => Math.floor(Date.now() / 1000);

/** The owner's device, unlocked: a merchant's account that keeps `bitcoinPercent` in bitcoin. */
async function merchantDevice(bitcoinPercent = 80) {
  // No Mt Pelerin account chosen yet: the split's sale goes to the first in the payout currency
  // (SalePage.tsx `saleAccount`), the scenario's.
  await openMerchantAccount({ bitcoinPercent });
  // The split set an hour ago: what the wallet received since counts.
  await updateAccount({ splitSince: nowSeconds() - 3600 });
  const profile: SavedTerminalProfile = {
    version: 2,
    walletId: TEST_WALLET_ID,
    backupKey: getAccountBackupKey()!,
    lightningAddress: ADDRESS,
    businessName: getAccountSettings()?.businessName ?? "",
    currency: "CHF"
  };
  await saveTerminalProfile(profile);
  resetTerminalProfileCache();
}

/** A receipt of the wallet's, a few minutes old. */
function receive(amountSats: bigint, patch: Partial<WalletPayment> = {}): void {
  mockPayments.push({
    id: `payment-${mockPayments.length + 1}`,
    direction: "receive",
    status: "completed",
    amountSats,
    feeSats: 0n,
    timestamp: nowSeconds() - 300 + mockPayments.length,
    network: "lightning",
    ...patch
  });
}

const press = async (testID: string) =>
  fireEvent.press(await screen.findByTestId(testID, {}, SLOW));

const type = async (testID: string, text: string) =>
  fireEvent.changeText(await screen.findByTestId(testID, {}, SLOW), text);

const tag = () => getDeviceLocale().languageTag;
const chf = (cents: number) => `${formatFiat(cents, 2, tag())} CHF`;
const sats = (count: number) => `${formatInteger(BigInt(count), tag())} sats`;
/** `text` anywhere in an element's text (toHaveTextContent reads every space as " "). */
const has = (text: string) =>
  new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s/g, "\\s"));

/** "Wallet" rendered, Mt Pelerin logged in by SMS in `scenario`'s state, its panel closed. */
async function loggedIn(scenario: Parameters<typeof fake.startScenario>[0] = "ready") {
  const server = fake.startScenario(scenario, ADDRESS);
  await renderRouter(routes, { initialUrl: "/wallet" });
  await press("open-sell");
  await type("sell-phone", "79 123 45 67");
  await press("sell-send-code");
  await type("sell-code", server.smsCode);
  await press("sell-submit-code");
  await screen.findByTestId("sell-sale", {}, SLOW);
  await press("close-sell");
  return server;
}

jest.setTimeout(60_000);

beforeEach(() => {
  closeAccount();
  fileSystem.resetFileSystem();
  relays.resetRelays();
  resetSplitSale();
  mockBalance = 10_000_000n;
  mockConfirm = async () => true;
  mockPayments = [];
  onSold.mockClear();
  jest.mocked(openExternal).mockClear();
  jest.mocked(getAppInfo).mockReturnValue(PRODUCTION);
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  closeAccount();
  jest.restoreAllMocks();
});

describe('the split\'s sale in "Wallet"', () => {
  it("makes the sale's order as its panel opens, shows its figures, and pays it in one gesture", async () => {
    await merchantDevice();
    const server = await loggedIn();
    receive(60_000n);
    receive(40_000n);
    await press("show-wallet");

    // Its panel opens by itself and makes the order at once: its rate locked (from the first
    // frame its figures show: never "expired" meanwhile), its figures exact.
    await screen.findByTestId("split-receive", {}, SLOW);
    expect(screen.queryByTestId("split-expired")).toBeNull();
    expect(screen.queryByTestId("split-renew")).toBeNull();
    expect(screen.getByTestId("split-locked")).toHaveTextContent(/Rate guaranteed until/);
    expect(screen.getByTestId("split-offer")).toHaveTextContent(
      has(`your wallet has received ${sats(100_000)}`)
    );
    expect(screen.getByTestId("split-offer")).not.toHaveTextContent(/about/);
    // The receipts as the split shares them: 80 % kept in bitcoin, 20 % to sell.
    expect(screen.getByTestId("split-kept")).toHaveTextContent(has("Kept in bitcoin (80"));
    expect(screen.getByTestId("split-kept")).toHaveTextContent(has(sats(80_000)));
    expect(screen.getByTestId("split-share")).toHaveTextContent(has("Share to sell (20"));
    expect(screen.getByTestId("split-share")).toHaveTextContent(has(sats(20_000)));
    expect(screen.getByTestId("split-receive")).toHaveTextContent(has(chf(1_664)));
    // A deferred sale names no account: it is wired later, to the
    // account as it is then.
    expect(screen.queryByTestId("split-account")).toBeNull();
    expect(screen.getByTestId("split-offer")).not.toHaveTextContent(has(maskedIban(SCENARIO_IBAN)));
    expect(screen.getByTestId("split-fee")).toHaveTextContent(has("Sale fees"));
    expect(screen.getByTestId("split-fee")).toHaveTextContent(has(sats(260)));
    expect(screen.getByTestId("split-lightning-fee")).toHaveTextContent(
      has("Lightning fees, on top")
    );
    expect(screen.getByTestId("split-lightning-fee")).toHaveTextContent(/CHF\s?1\ssat$/);
    // The whole share: nothing to explain.
    expect(screen.queryByTestId("split-now")).toBeNull();
    expect(screen.queryByTestId("split-limit")).toBeNull();
    expect(screen.queryByTestId("split-identify")).toBeNull();
    // The next transfer: nothing held yet at Mt Pelerin, this sale, what is left before it.
    const payout = await screen.findByTestId("split-payout", {}, SLOW);
    expect(payout).toHaveTextContent(/^Next transfer/);
    expect(payout).toHaveTextContent(has(`from ${chf(5_000)}`));
    expect(screen.getByTestId("split-payout-held")).toHaveTextContent(has(chf(0)));
    expect(screen.getByTestId("split-payout-sale")).toHaveTextContent(has(chf(1_664)));
    expect(screen.getByTestId("split-payout-left")).toHaveTextContent(
      has(`${chf(3_336)} more in sales, then it will all be wired to your bank account.`)
    );
    expect(screen.getByTestId("split-payout-gauge").props.accessibilityValue).toEqual({
      min: 0,
      max: 5_000,
      now: 1_664
    });
    expect(screen.queryByTestId("sell-deferred")).toBeNull();
    // The panel names Mt Pelerin only beside its logo.
    expect(screen.getByTestId("split-offer")).not.toHaveTextContent(/Mt Pelerin/);
    // One order, a deferred sell that carries the checkpoint of what it counted (the latest
    // receipt); nothing paid yet.
    const orders = () => server.requests.filter(({ path }) => path === "/orders/create");
    expect(orders()).toHaveLength(1);
    expect(orders()[0]?.body).toMatchObject({
      amount_in: 20_000,
      withdraw: "manual",
      oid: splitOid(mockPayments[1]!.timestamp)
    });
    expect(mockBalance).toBe(10_000_000n);

    // "Sell" pays that very order: no other is made.
    expect(screen.getByTestId("split-sell")).toHaveTextContent(has(`Sell ${sats(20_000)}`));
    await press("split-sell");
    const sold = await screen.findByTestId("split-sold", {}, SLOW);
    expect(sold).toHaveTextContent(has("Sold successfully"));
    expect(sold).toHaveTextContent(has(chf(1_664)));
    expect(orders()).toHaveLength(1);
    expect(mockBalance).toBe(10_000_000n - 20_001n);
    expect(onSold).toHaveBeenCalledTimes(1);
    // What Mt Pelerin now holds for the bank account.
    expect(screen.getByTestId("split-held")).toHaveTextContent(has(chf(1_664)));

    // Closed: read again, nothing left to propose.
    await press("split-done");
    await waitFor(() => expect(screen.queryByTestId("split-sold")).toBeNull(), SLOW);
    await waitFor(() => expect(screen.queryByTestId("split-notice")).toBeNull(), SLOW);
    expect(server.requests.filter(({ path }) => path === "/orders/create")).toHaveLength(1);
  });

  it("counts in the next transfer what Mt Pelerin holds from an earlier sale", async () => {
    await merchantDevice();
    await loggedIn();
    receive(100_000n);
    await press("show-wallet");
    await press("split-sell");
    await screen.findByTestId("split-sold", {}, SLOW);
    await press("split-done");
    await waitFor(() => expect(screen.queryByTestId("split-sold")).toBeNull(), SLOW);

    // Received since: the panel opens again, the balance read again with the first sale in it.
    receive(50_000n);
    await press("hide-wallet");
    await press("show-wallet");
    await screen.findByTestId("split-payout", {}, SLOW);
    expect(screen.getByTestId("split-share")).toHaveTextContent(has(sats(10_000)));
    expect(screen.getByTestId("split-payout-held")).toHaveTextContent(has(chf(1_664)));
    const gauge = screen.getByTestId("split-payout-gauge").props.accessibilityValue as {
      now: number;
    };
    // What is held and this sale, never more than the threshold.
    expect(gauge.now).toBeGreaterThan(1_664);
    expect(gauge.now).toBeLessThan(5_000);
    expect(screen.getByTestId("split-payout-left")).toHaveTextContent(
      has(`${chf(5_000 - gauge.now)} more in sales`)
    );
  });

  it("tells the transfer in words, without a gauge, when the balance cannot be read", async () => {
    await merchantDevice();
    const server = await loggedIn();
    // The bank account's balance, as "Sell" read it at the login: refused at the next read.
    const read = server.requests.find(({ path }) => path.endsWith("/balances"));
    server.failNext(`GET ${read!.path}`, 500);
    receive(100_000n);
    await press("show-wallet");
    await screen.findByTestId("split-locked", {}, SLOW);
    await waitFor(
      () =>
        expect(
          server.requests.filter(({ path }) => path.endsWith("/balances")).length
        ).toBeGreaterThan(0),
      SLOW
    );
    expect(await screen.findByTestId("sell-deferred", {}, SLOW)).toHaveTextContent(
      has(
        `Deferred sales are grouped and will be wired at once, as soon as they reach ${chf(5_000)}.`
      )
    );
    // Never a gauge from a balance not read: neither 0 nor a guess.
    expect(screen.queryByTestId("split-payout")).toBeNull();
  });

  it("keeps its notice once its panel is closed, and does not open by itself again", async () => {
    await merchantDevice();
    await loggedIn();
    receive(100_000n);
    await press("show-wallet");
    await screen.findByTestId("split-offer", {}, SLOW);
    // Closed by its ✕ only: no "Later" under "Sell".
    await screen.findByTestId("split-sell", {}, SLOW);
    expect(screen.getByTestId("split-offer")).not.toHaveTextContent(/Later/);
    await press("sheet-close");
    await waitFor(() => expect(screen.queryByTestId("split-offer")).toBeNull(), SLOW);
    expect(screen.getByTestId("split-notice-text")).toHaveTextContent(
      has(`Split: ${sats(20_000)} to sell, about ${chf(1_664)}`)
    );
    // "Wallet" left and shown again: read again, its panel stays closed.
    await press("hide-wallet");
    await waitFor(() => expect(screen.queryByTestId("split-notice")).toBeNull(), SLOW);
    await press("show-wallet");
    await screen.findByTestId("split-notice", {}, SLOW);
    expect(screen.queryByTestId("split-offer")).toBeNull();
    // The notice's gesture opens it.
    await press("split-notice-action");
    expect(await screen.findByTestId("split-offer", {}, SLOW)).toBeTruthy();
    // New receipts: proposed by itself again.
    await press("sheet-close");
    await waitFor(() => expect(screen.queryByTestId("split-offer")).toBeNull(), SLOW);
    await press("hide-wallet");
    receive(50_000n, { timestamp: nowSeconds() - 2 });
    await press("show-wallet");
    expect(await screen.findByTestId("split-offer", {}, SLOW)).toBeTruthy();
    expect(screen.getByTestId("split-share")).toHaveTextContent(has(sats(30_000)));
  });

  it("says why less than the share is sold, and lets the merchant be identified first", async () => {
    await merchantDevice();
    // 420.01 CHF sold this month: 578.99 CHF left of the month's 999.
    const server = await loggedIn("readyWithSales");
    receive(5_000_000n);
    await press("show-wallet");
    await screen.findByTestId("split-offer", {}, SLOW);
    expect(screen.getByTestId("split-share")).toHaveTextContent(has(sats(1_000_000)));
    expect(screen.getByTestId("split-now")).toHaveTextContent(has(sats(686_674)));
    expect(screen.getByTestId("split-limit")).toHaveTextContent(has(chf(99_900)));
    expect(screen.getByTestId("split-limit")).toHaveTextContent(has(sats(686_674)));
    // More than the transfer's threshold with what Mt Pelerin holds: the transfer is told reached.
    expect(await screen.findByTestId("split-payout-left", {}, SLOW)).toHaveTextContent(
      has("The threshold is reached: it will all be wired to your bank account.")
    );
    // Two choices: what the limits leave now, or the identity first, at Mt Pelerin's.
    expect(await screen.findByTestId("split-sell", {}, SLOW)).toHaveTextContent(
      has(`Sell ${sats(686_674)}`)
    );
    await press("split-identify");
    expect(openExternal).toHaveBeenCalledWith("https://app.mtpelerin.com");
    // The order made as the panel opened, of what the limits leave; paid by "Sell".
    expect(server.requests.filter(({ path }) => path === "/orders/create")).toHaveLength(1);
    await press("split-sell");
    await screen.findByTestId("split-sold", {}, SLOW);
    expect(mockBalance).toBe(10_000_000n - 686_675n);
  });

  it("shows the same order when opened again while its rate is locked, another once it is over", async () => {
    await merchantDevice();
    const server = await loggedIn();
    receive(100_000n);
    await press("show-wallet");
    await screen.findByTestId("split-locked", {}, SLOW);
    // The orders Mt Pelerin made (a request refused for an expired session made none).
    const orders = () => server.ordersOfUser();
    expect(orders()).toHaveLength(1);
    // Closed, then opened from the notice: the same order, none made again.
    await press("sheet-close");
    await waitFor(() => expect(screen.queryByTestId("split-offer")).toBeNull(), SLOW);
    await press("split-notice-action");
    await screen.findByTestId("split-locked", {}, SLOW);
    expect(orders()).toHaveLength(1);

    // An hour later its rate is no longer locked: "Refresh the quote" makes another.
    const start = Date.now();
    const clock = jest.spyOn(Date, "now").mockReturnValue(start + 3_600_000);
    server.now = () => start + 3_600_000;
    await press("split-sell");
    expect(await screen.findByTestId("split-expired", {}, SLOW)).toHaveTextContent(
      /The rate has expired/
    );
    expect(mockBalance).toBe(10_000_000n);
    await press("split-renew");
    await screen.findByTestId("split-locked", {}, SLOW);
    expect(orders()).toHaveLength(2);
    await press("split-sell");
    await screen.findByTestId("split-sold", {}, SLOW);
    expect(mockBalance).toBe(10_000_000n - 20_001n);
    clock.mockRestore();
  });

  it("makes no other order by itself once the passkey is dismissed near the rate's end", async () => {
    await merchantDevice();
    const server = await loggedIn();
    receive(100_000n);
    const opened = Date.now();
    await press("show-wallet");
    await screen.findByTestId("split-sell", {}, SLOW);
    const orders = () => server.ordersOfUser();
    expect(orders()).toHaveLength(1);
    // 70 s left to its rate; the passkey's prompt open 15 s, then dismissed.
    const clock = jest.spyOn(Date, "now").mockReturnValue(opened + ORDER_LOCK_MS - 70_000);
    mockConfirm = async () => {
      clock.mockReturnValue(opened + ORDER_LOCK_MS - 55_000);
      return false;
    };
    await press("split-sell");
    // The prompt answered: "Sell" is no longer busy.
    await waitFor(
      () =>
        expect(screen.getByTestId("split-sell")).toHaveProp(
          "accessibilityState",
          expect.objectContaining({ busy: false })
        ),
      SLOW
    );
    // The same order shows: none made under the merchant's finger.
    expect(orders()).toHaveLength(1);
    expect(screen.queryByTestId("split-quoting")).toBeNull();
    // "Sell" again: its rate's lock too short now, nothing paid; "Refresh the quote".
    await press("split-sell");
    await screen.findByTestId("split-renew", {}, SLOW);
    expect(orders()).toHaveLength(1);
    expect(mockBalance).toBe(10_000_000n);
    clock.mockRestore();
  });

  it("keeps the order made for what the limits leave while the rate moves, unless they leave less", async () => {
    await merchantDevice();
    // 420.01 CHF sold this month: 578.99 CHF left of the month's 999.
    const server = await loggedIn("readyWithSales");
    receive(5_000_000n);
    await press("show-wallet");
    expect(await screen.findByTestId("split-sell", {}, SLOW)).toHaveTextContent(
      has(`Sell ${sats(686_674)}`)
    );
    const creates = () => server.requests.filter(({ path }) => path === "/orders/create").length;
    expect(creates()).toBe(1);
    await press("sheet-close");

    // Back on "Wallet", the bitcoin a little cheaper: the limits leave a few sats more (the
    // order made and unpaid counts in none). The same order shows, as it is.
    server.chfPerBtc = 84_300n;
    await press("hide-wallet");
    await press("show-wallet");
    await waitFor(() => expect(screen.getByTestId("split-notice-text")).toBeTruthy(), SLOW);
    await press("split-notice-action");
    expect(await screen.findByTestId("split-sell", {}, SLOW)).toHaveTextContent(
      has(`Sell ${sats(686_674)}`)
    );
    expect(screen.getByTestId("split-now")).toHaveTextContent(has(sats(686_674)));
    expect(creates()).toBe(1);
    await press("sheet-close");

    // Dearer: the limits leave less than that order: another, of what they leave.
    server.chfPerBtc = 84_400n;
    await press("hide-wallet");
    await press("show-wallet");
    await waitFor(() => expect(screen.getByTestId("split-notice-text")).toBeTruthy(), SLOW);
    await press("split-notice-action");
    await waitFor(() => expect(creates()).toBe(2), SLOW);
    const sell = await screen.findByTestId("split-sell", {}, SLOW);
    expect(sell).not.toHaveTextContent(has(sats(686_674)));
  });

  it("says why Mt Pelerin refused the order, and tries again", async () => {
    await merchantDevice();
    const server = await loggedIn();
    receive(100_000n);
    server.failNext("POST /orders/create", 500);
    await press("show-wallet");
    expect(await screen.findByTestId("split-issue", {}, SLOW)).toBeTruthy();
    expect(screen.queryByTestId("split-sell")).toBeNull();
    await press("split-retry");
    expect(await screen.findByTestId("split-sell", {}, SLOW)).toBeTruthy();
  });

  it("says the balance when the share was spent", async () => {
    await merchantDevice();
    await loggedIn();
    receive(100_000n);
    mockBalance = 5_000n;
    await press("show-wallet");
    await screen.findByTestId("split-offer", {}, SLOW);
    expect(screen.getByTestId("split-now")).toHaveTextContent(has(sats(4_950)));
    expect(screen.getByTestId("split-balance")).toHaveTextContent(has(sats(4_950)));
    expect(screen.queryByTestId("split-identify")).toBeNull();
  });

  it("invites to set the sale up when the split has a fiat share and no Mt Pelerin session", async () => {
    await merchantDevice();
    fake.startScenario("newCustomer", ADDRESS);
    await renderRouter(routes, { initialUrl: "/wallet" });
    receive(100_000n);
    await press("show-wallet");
    const notice = await screen.findByTestId("split-notice-text", {}, SLOW);
    expect(notice).toHaveTextContent(/Your split puts 20\s?% in CHF/);
    expect(screen.queryByTestId("split-offer")).toBeNull();
    // "Set up selling" opens "Sell".
    await press("split-notice-action");
    expect(await screen.findByTestId("sell-phone", {}, SLOW)).toBeTruthy();
  });

  it("asks nothing of Mt Pelerin for an account all in bitcoin", async () => {
    await merchantDevice(100);
    const server = fake.startScenario("ready", ADDRESS);
    await renderRouter(routes, { initialUrl: "/wallet" });
    receive(100_000n);
    await press("show-wallet");
    // Whatever it would have started has run.
    for (let turn = 0; turn < 10; turn++) await act(async () => Promise.resolve());
    expect(screen.queryByTestId("split-notice")).toBeNull();
    expect(server.requests).toHaveLength(0);
  });
});
