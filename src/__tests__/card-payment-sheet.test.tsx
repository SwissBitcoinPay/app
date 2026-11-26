import "@/i18n";

import {
  act,
  fireEvent,
  renderHook,
  renderRouter,
  screen,
  waitFor,
  within
} from "expo-router/testing-library";
import { AppState, StyleSheet, type AppStateStatus } from "react-native";

import AppLayout from "@/app/(app)/_layout";
import AmountScreen from "@/app/(app)/pos/index";
import PosLayout from "@/app/(app)/pos/_layout";
import LaunchScreen from "@/app/index";
import { DEFAULT_CARD_RELAY_HOST } from "@/config/card";
import { closeAccount, getAccountWalletId } from "@/features/account/session";
import { pairCard } from "@/features/card/pairing";
import { currentCardPayment, resetCardPayments } from "@/features/card/payments";
import { resetCardStates } from "@/features/card/states";
import { syncAccountCards } from "@/features/card/sync";
import { notificationTimeMs, useCardWakes } from "@/features/card/useCardWakes";
import {
  CARD_PAID_NOTICE,
  CARD_TEXT_TEST_KEY,
  cardNotificationBehavior
} from "@/features/card/paid-notice";
import { signInWithPasskey } from "@/lib/breez/passkey";
import { forgetDeviceKey } from "@/lib/card/device-key";
import { approveCardPayee, loadCardPayees } from "@/lib/card/payees";
import { saveTerminalProfile } from "@/lib/terminal/profile";

import { TEST_WALLET_ID, openTestAccount, testBackupKey, testSeed } from "../../jest/account";
import type * as BreezFake from "../../jest/breez-sdk";
import {
  breezTips,
  breezTipsFetch,
  breezTipsMetadata,
  breezTipsVerifyUrl,
  resetBreezTips
} from "../../jest/breez-tips";
import {
  addRelay,
  fetchRelays,
  posCallback,
  posWithdraw,
  type FakeCardRelay
} from "../../jest/card-relay";
import type * as NotificationsFake from "../../jest/expo-notifications";
import { makeInvoice, metadataHash, preimagePair, testNode } from "../../jest/lightning";
import { nodeAliases } from "../../jest/node-aliases";
import type * as FileSystemFake from "../../jest/expo-file-system";
import type * as NfcFake from "../../jest/nfc-manager";
import type * as RelaysFake from "../../jest/nostr-relays";
import { FakeNtag424 } from "../../jest/ntag424";

// eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories are synchronous
jest.mock("react-native-nfc-manager", () => require("../../jest/nfc-manager"));
jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    expoConfig: {
      extra: {
        breezNetwork: "mainnet",
        eas: { projectId: "00000000-0000-4000-8000-000000000000" }
      }
    }
  }
}));
jest.mock("../lib/breez/passkey", () => ({
  createPasskeyWallet: jest.fn(),
  preparePasskeys: jest.fn(async () => undefined),
  passkeysReady: jest.fn(() => true),
  signInWithPasskey: jest.fn()
}));
// 1 BTC = 100,000 CHF: 1 sat = 0.1 cent.
jest.mock("../features/terminal/useRate", () => ({
  useRate: () => ({
    rate: 100000,
    hour: jest
      .requireActual<typeof import("../lib/rates/sources")>("../lib/rates/sources")
      .pointHourOf(Math.floor(Date.now() / 1000)),
    loading: false,
    current: () => 100000
  })
}));
jest.mock("@/components/layout/useIsDesktop", () => ({
  ...jest.requireActual("@/components/layout/useIsDesktop"),
  useIsDesktop: () => false
}));

const nfc = jest.requireMock<typeof NfcFake>("react-native-nfc-manager");
const nostr = jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");
const sdk = jest.requireMock<typeof BreezFake>("@breeztech/breez-sdk-spark-react-native");
const notifications = jest.requireMock<typeof NotificationsFake>("expo-notifications");
const signIn = jest.mocked(signInWithPasskey);

const routes = {
  index: LaunchScreen,
  "(app)/_layout": AppLayout,
  "(app)/pos/_layout": PosLayout,
  "(app)/pos/index": AmountScreen
};

const SLOW = { timeout: 8000 };
const apiKey = process.env.EXPO_PUBLIC_BREEZ_API_KEY;

let relay: FakeCardRelay;
let card: FakeNtag424;
let cardId: string;

/**
 * The point of sale's invoice of `sats` ("Lakeside Bakery"), as the wallet reads it too; with
 * `descriptionHash`, an invoice of a Lightning address instead (its metadata's hash). `seed` makes
 * its payment hash (preimagePair); `signWith`, a node's key (testNode) signing it.
 */
function posInvoice(
  sats: bigint,
  descriptionHash?: string,
  seed = 7,
  signWith?: Uint8Array
): string {
  const { paymentHash } = preimagePair(seed);
  const timestamp = Math.floor(Date.now() / 1000);
  const description = descriptionHash ? undefined : "Lakeside Bakery";
  const pr = makeInvoice({
    amountMsat: sats * 1000n,
    paymentHash,
    ...(descriptionHash ? { descriptionHash } : { description }),
    timestamp,
    signWith
  });
  sdk.fakeSend.inputs.set(pr, {
    tag: sdk.InputType_Tags.Bolt11Invoice,
    inner: [
      {
        amountMsat: sats * 1000n,
        description,
        descriptionHash,
        expiry: BigInt(3600),
        invoice: { bolt11: pr, source: {} },
        minFinalCltvExpiryDelta: BigInt(18),
        network: sdk.BitcoinNetwork.Bitcoin,
        payeePubkey: "02ab",
        paymentHash,
        paymentSecret: "00",
        routingHints: [],
        timestamp: BigInt(timestamp)
      }
    ]
  });
  return pr;
}

/** A merchant's invoice on breez.tips with its point of sale's proof (card-payment.test.ts). */
function merchantInvoice(sats: bigint, username: string, name: string, seed = 7) {
  const metadata = breezTipsMetadata(username, name);
  const pr = posInvoice(sats, metadataHash(metadata), seed);
  const { paymentHash } = preimagePair(seed);
  breezTips.invoices.set(paymentHash, { pr, settled: false });
  return { pr, proof: { metadata, verify: breezTipsVerifyUrl(paymentHash) } };
}

/** The owner's device in till mode, on the point of sale. */
async function openApp() {
  const router = await renderRouter(routes, { initialUrl: "/" });
  await waitFor(() => expect(router.getPathname()).toBe("/pos"), SLOW);
  return router;
}

/**
 * "Done" counts down in its ring (the point of sale's AutoReturnRing), its seconds in its
 * name for screen readers.
 */
function expectClosesIn(seconds: number) {
  const done = screen.getByTestId("card-payment-done");
  expect(done).toHaveTextContent(`Done${seconds}`);
  expect(done).toHaveAccessibleName(`Done (${seconds} s)`);
}

jest.setTimeout(30_000);

beforeEach(async () => {
  // The phone's log of card payments (payment-log.ts) starts empty.
  jest.requireMock<typeof FileSystemFake>("expo-file-system").resetFileSystem();
  // breez.tips answers the payees' verify URLs; the card relay the rest.
  resetBreezTips();
  jest
    .mocked(globalThis.fetch)
    .mockImplementation((input: RequestInfo | URL, init?: RequestInit) =>
      new URL(String(input)).host === "breez.tips"
        ? breezTipsFetch(input)
        : fetchRelays(input, init)
    );
  process.env.EXPO_PUBLIC_BREEZ_API_KEY = "test-api-key";
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
  nostr.resetRelays();
  nfc.resetNfcManager();
  resetCardStates();
  resetCardPayments();
  forgetDeviceKey();
  signIn.mockReset().mockResolvedValue({ seed: testSeed(), credentialId: null });
  sdk.fakeWallet.balanceSats = 500_000n;
  relay = addRelay(DEFAULT_CARD_RELAY_HOST);
  await saveTerminalProfile({
    version: 2,
    walletId: TEST_WALLET_ID,
    backupKey: testBackupKey(),
    lightningAddress: "sattleme02c6047f94@breez.tips",
    businessName: "Fine Bakery",
    currency: "CHF"
  });
  // The card paired earlier, then the app closed: it starts in till mode.
  await openTestAccount({ usage: "card", signUp: "card" });
  card = new FakeNtag424();
  nfc.holdCard(card);
  const paired = await pairCard({
    relayHost: DEFAULT_CARD_RELAY_HOST,
    channelName: "Card payments",
    messages: { alert: "Hold the card to the phone" }
  });
  cardId = paired.state.cardId;
  // The card pays from its own wallet (card-wallet.ts), recharged earlier.
  sdk.fakeCardWallet(cardId).balanceSats = 100_000n;
  closeAccount();
});

afterEach(() => {
  resetCardPayments();
  closeAccount();
  process.env.EXPO_PUBLIC_BREEZ_API_KEY = apiKey;
  jest.restoreAllMocks();
});

describe('"Card payment"', () => {
  it("opens from the tapped notification, in till mode, and pays with one passkey", async () => {
    const request = await posWithdraw(card.tap());
    const push = relay.pushes[relay.pushes.length - 1];
    // The app was not running: the user taps the notification, which starts it.
    notifications.tap(notifications.notification({ cr: push.data.cr }));
    await openApp();

    expect(await screen.findByTestId("card-payment-waiting", {}, SLOW)).toBeTruthy();
    const answer = posCallback(request, posInvoice(12_500n));
    // The receipt: the time to answer, the amount, who it pays, the point of sale's
    // note; the card's row once its tap is checked (here, the app locked, after the passkey).
    expect(await screen.findByTestId("card-payment-pay", {}, SLOW)).toHaveTextContent(
      /Pay 12.50 CHF$/
    );
    expect(screen.getByTestId("sheet-subtitle")).toHaveTextContent(/^Answer within \d+ s$/);
    expect(screen.getByTestId("card-payment-time").props.accessibilityValue).toMatchObject({
      min: 0,
      max: 25
    });
    expect(screen.getByTestId("card-payment-amount")).toHaveTextContent("12.50 CHF");
    expect(screen.getByTestId("card-payment-amount-line")).toHaveTextContent(/^12.500 sats$/);
    expect(screen.getByTestId("card-payment-payee-name")).toHaveTextContent("Unknown name");
    // The chip's icon is a glyph of its own: its text is matched at the end.
    expect(screen.getByTestId("card-payment-payee-status")).toHaveTextContent(
      /Unidentified merchant$/
    );
    expect(screen.getByTestId("card-payment-note")).toHaveTextContent(/Lakeside Bakery$/);
    expect(screen.queryByTestId("card-payment-card")).toBeNull();
    // A line between its two rows, none under the last (nor for the card's row left out).
    expect(screen.getAllByTestId("card-payment-divider")).toHaveLength(1);
    // Not identified: nothing to approve.
    expect(screen.queryByTestId("card-payment-approve")).toBeNull();
    expect(screen.getByTestId("card-payment-ask")).toHaveTextContent(
      "The till did not prove who receives this payment: check the amount with the merchant."
    );
    // Taken: the next start does not show it again.
    expect(notifications.getLastNotificationResponse()).toBeNull();

    await act(async () => {
      fireEvent.press(screen.getByTestId("card-payment-pay"));
    });
    expect(await screen.findByTestId("card-payment-completed", {}, SLOW)).toBeTruthy();
    expect(screen.getByText("12.50 CHF paid with your card.")).toBeTruthy();
    // Its rows: who, the exact amount, the card, now known.
    expect(screen.getByTestId("card-payment-payee-name")).toHaveTextContent("Unknown name");
    expect(screen.getByTestId("card-payment-exact")).toHaveTextContent(/12.500 sats$/);
    // Its label, then the card's own ("Card 9D81", unnamed).
    expect(screen.getByTestId("card-payment-card")).toHaveTextContent(
      new RegExp(`^Card.*Card ${cardId.slice(-4).toUpperCase()}$`)
    );
    // Two lines between its three rows: none under the card's, the last.
    expect(screen.getAllByTestId("card-payment-divider")).toHaveLength(2);
    const shown = screen.getByTestId("card-payment-details").children;
    const last = shown[shown.length - 1];
    expect(typeof last === "string" ? last : last.props.testID).toBe("card-payment-card");
    // Nor drawn by a row itself, under it.
    for (const row of shown) {
      if (typeof row !== "string") {
        expect(StyleSheet.flatten(row.props.style)).not.toHaveProperty("borderBottomWidth");
      }
    }
    await expect(answer).resolves.toEqual({ status: "OK" });
    expect(signIn).toHaveBeenCalledTimes(1);
    // From the card's own wallet, the invoice and its fee; the main balance untouched.
    expect(sdk.fakeCardWallet(cardId).balanceSats).toBe(
      100_000n - 12_500n - sdk.fakeSend.lightningFeeSats
    );
    expect(sdk.fakeWallet.balanceSats).toBe(500_000n);
    // Still in till mode.
    expect(getAccountWalletId()).toBeNull();
    // "Done" stays in sight under the receipt, which scrolls.
    expect(
      within(screen.getByTestId("card-payment-scroll")).queryByTestId("card-payment-done")
    ).toBeNull();

    await act(async () => {
      fireEvent.press(screen.getByTestId("card-payment-done"));
    });
    await waitFor(() => expect(screen.queryByTestId("card-payment-completed")).toBeNull());
  });

  it('shows "Sending the payment" until the payment completes, then "Payment made", which closes itself after 10 s', async () => {
    sdk.fakeSend.sentStatus = sdk.PaymentStatus.Pending;
    await openApp();
    const request = await posWithdraw(card.tap());
    notifications.receive(
      notifications.notification({ cr: relay.pushes[relay.pushes.length - 1].data.cr })
    );
    const answer = posCallback(request, posInvoice(12_500n));
    await act(async () => {
      fireEvent.press(await screen.findByTestId("card-payment-pay", {}, SLOW));
    });
    // Left, still pending: the point of sale has its answer, the holder sees it still being sent.
    await expect(answer).resolves.toEqual({ status: "OK" });
    expect(await screen.findByTestId("card-payment-paying", {}, SLOW)).toHaveTextContent(
      "Sending the payment…"
    );
    expect(screen.queryByTestId("card-payment-pending")).toBeNull();
    await act(() => jest.advanceTimersByTimeAsync(3000));
    expect(screen.getByTestId("card-payment-paying")).toBeTruthy();

    sdk.fakeCardWallet(cardId).payments[0].status = sdk.PaymentStatus.Completed;
    await act(() => jest.advanceTimersByTimeAsync(3000));
    expect(screen.getByTestId("card-payment-completed")).toHaveTextContent(
      /Payment made.*12\.50 CHF paid with your card\./
    );
    expect(screen.queryByTestId("card-payment-paying")).toBeNull();
    expectClosesIn(10);
    await act(() => jest.advanceTimersByTimeAsync(9000));
    expectClosesIn(1);
    expect(currentCardPayment()).not.toBeNull();
    await act(() => jest.advanceTimersByTimeAsync(1000));
    expect(currentCardPayment()).toBeNull();
    await waitFor(() => expect(screen.queryByTestId("card-payment-completed")).toBeNull());
  });

  it('counts the 10 s of "Payment made" only while the app is in sight', async () => {
    const listeners = new Set<(state: AppStateStatus) => void>();
    jest.spyOn(AppState, "addEventListener").mockImplementation((type, listener) => {
      const changed = listener as (state: AppStateStatus) => void;
      if (type === "change") listeners.add(changed);
      return { remove: () => listeners.delete(changed) } as ReturnType<
        typeof AppState.addEventListener
      >;
    });
    const appState = AppState as unknown as { currentState: AppStateStatus };
    const before = appState.currentState;
    try {
      await openApp();
      const request = await posWithdraw(card.tap());
      notifications.receive(
        notifications.notification({ cr: relay.pushes[relay.pushes.length - 1].data.cr })
      );
      const answer = posCallback(request, posInvoice(12_500n));
      await act(async () => {
        fireEvent.press(await screen.findByTestId("card-payment-pay", {}, SLOW));
      });
      expect(await screen.findByTestId("card-payment-completed", {}, SLOW)).toBeTruthy();
      await expect(answer).resolves.toEqual({ status: "OK" });
      await act(() => jest.advanceTimersByTimeAsync(4000));
      expectClosesIn(6);

      // In the background: it waits for the holder, however long.
      appState.currentState = "background";
      await act(async () => listeners.forEach((listener) => listener("background")));
      await act(() => jest.advanceTimersByTimeAsync(60_000));
      expect(currentCardPayment()).not.toBeNull();

      // Back in sight: its whole time again.
      appState.currentState = "active";
      await act(async () => listeners.forEach((listener) => listener("active")));
      expectClosesIn(10);
      await act(() => jest.advanceTimersByTimeAsync(9999));
      expect(currentCardPayment()).not.toBeNull();
      await act(() => jest.advanceTimersByTimeAsync(1));
      expect(currentCardPayment()).toBeNull();
    } finally {
      appState.currentState = before;
    }
  });

  it("says the payment left, without closing itself, when it is still pending after 2 minutes", async () => {
    sdk.fakeSend.sentStatus = sdk.PaymentStatus.Pending;
    await openApp();
    const request = await posWithdraw(card.tap());
    notifications.receive(
      notifications.notification({ cr: relay.pushes[relay.pushes.length - 1].data.cr })
    );
    const answer = posCallback(request, posInvoice(12_500n));
    await act(async () => {
      fireEvent.press(await screen.findByTestId("card-payment-pay", {}, SLOW));
    });
    await expect(answer).resolves.toEqual({ status: "OK" });
    expect(await screen.findByTestId("card-payment-paying", {}, SLOW)).toBeTruthy();
    // Never shown paid: once no longer followed, what is known, its state in the list.
    await act(() => jest.advanceTimersByTimeAsync(123_000));
    expect(screen.getByTestId("card-payment-pending")).toHaveTextContent(
      /Payment sent.*The payment of 12\.50 CHF has left\./
    );
    expect(screen.queryByTestId("card-payment-completed")).toBeNull();
    expect(screen.getByTestId("card-payment-done")).toHaveTextContent(/^Done$/);
    await act(() => jest.advanceTimersByTimeAsync(30_000));
    expect(screen.getByTestId("card-payment-pending")).toBeTruthy();
  });

  it("takes a card notification left in the tray when the app starts", async () => {
    const request = await posWithdraw(card.tap());
    const push = relay.pushes[relay.pushes.length - 1];
    const other = notifications.notification({ promo: "1" }, Date.now(), "Other");
    notifications.leaveInTray(other);
    notifications.leaveInTray(notifications.notification({ cr: push.data.cr }));
    await openApp();
    expect(await screen.findByTestId("card-payment-waiting", {}, SLOW)).toBeTruthy();
    void posCallback(request, posInvoice(800n));
    expect(await screen.findByTestId("card-payment-pay", {}, SLOW)).toBeTruthy();
    // Taken from the tray; any other notification stays.
    await expect(notifications.getPresentedNotificationsAsync()).resolves.toEqual([other]);
    await act(async () => {
      fireEvent.press(screen.getByTestId("card-payment-decline"));
    });
    expect(await screen.findByTestId("card-payment-declined", {}, SLOW)).toBeTruthy();
  });

  it("takes a notification received while the app shows, and declines", async () => {
    await openApp();
    const request = await posWithdraw(card.tap());
    const push = relay.pushes[relay.pushes.length - 1];
    notifications.receive(notifications.notification({ cr: push.data.cr }));
    expect(await screen.findByTestId("card-payment-waiting", {}, SLOW)).toBeTruthy();
    const answer = posCallback(request, posInvoice(800n));
    expect(await screen.findByTestId("card-payment-decline", {}, SLOW)).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByTestId("card-payment-decline"));
    });
    expect(await screen.findByTestId("card-payment-declined", {}, SLOW)).toBeTruthy();
    await expect(answer).resolves.toEqual({
      status: "ERROR",
      reason: "Payment declined by the cardholder."
    });
    expect(signIn).not.toHaveBeenCalled();
  });

  it("gives the holder a minute with a relay of 2.1.0, and says so", async () => {
    relay.answerWaitMs = 65_000;
    await openApp();
    const request = await posWithdraw(card.tap());
    const push = relay.pushes[relay.pushes.length - 1];
    notifications.receive(notifications.notification({ cr: push.data.cr }));
    const answer = posCallback(request, posInvoice(800n));
    expect(await screen.findByTestId("card-payment-time", {}, SLOW)).toBeTruthy();
    expect(screen.getByTestId("card-payment-time").props.accessibilityValue).toMatchObject({
      min: 0,
      max: 60
    });
    expect(screen.getByTestId("sheet-subtitle")).toHaveTextContent(/^Answer within (60|59) s$/);
    await act(async () => {
      fireEvent.press(screen.getByTestId("card-payment-decline"));
    });
    await expect(answer).resolves.toEqual({
      status: "ERROR",
      reason: "Payment declined by the cardholder."
    });
  });

  it("shows who it pays: the name the merchant declared, its status, a homonym; then tells it", async () => {
    await approveCardPayee(
      TEST_WALLET_ID,
      { cardId, walletGeneration: 1 },
      { id: "sattleme01@breez.tips", name: "Lakeside Bakery" },
      Date.now()
    );
    await openApp();
    const request = await posWithdraw(card.tap());
    const push = relay.pushes[relay.pushes.length - 1];
    notifications.receive(notifications.notification({ cr: push.data.cr }));
    const homonym = merchantInvoice(12_500n, "sattleme99", "LAKESIDE BAKERY");
    const answer = posCallback(request, homonym.pr, homonym.proof);
    expect(await screen.findByTestId("card-payment-payee-name", {}, SLOW)).toHaveTextContent(
      "LAKESIDE BAKERY"
    );
    expect(screen.getByTestId("card-payment-payee").props.accessibilityLabel).toBe(
      "Merchant, LAKESIDE BAKERY, name declared by the merchant, identified by its Lightning address, New merchant"
    );
    // The mark of a merchant its Lightning address names; no warning about nodes.
    expect(screen.getByTestId("payee-mark-address")).toBeTruthy();
    expect(screen.queryByTestId("card-payment-node-warning")).toBeNull();
    expect(screen.getByTestId("card-payment-payee-status")).toHaveTextContent(/New merchant$/);
    // The callout's icon is a glyph of its own: its text is matched apart.
    expect(screen.getByTestId("card-payment-homonym")).toBeTruthy();
    expect(
      screen.getByText(
        "Same name as an approved merchant, but a different account: check before paying."
      )
    ).toBeTruthy();
    expect(screen.getByTestId("card-payment-ask")).toHaveTextContent(
      "New merchant: check the amount and the name before paying."
    );
    // Never the merchant's address.
    expect(screen.queryByText(/@breez\.tips/)).toBeNull();
    // Approved only if the holder ticks it: unticked at first.
    const approve = screen.getByTestId("card-payment-approve");
    expect(approve.props.accessibilityState).toMatchObject({ checked: false });
    await act(async () => {
      fireEvent.press(approve);
    });
    expect(screen.getByTestId("card-payment-approve").props.accessibilityState).toMatchObject({
      checked: true
    });

    await act(async () => {
      fireEvent.press(screen.getByTestId("card-payment-pay"));
    });
    expect(await screen.findByTestId("card-payment-completed", {}, SLOW)).toBeTruthy();
    expect(screen.getByTestId("card-payment-approved")).toHaveTextContent(
      /This merchant is now one of your approved merchants\.$/
    );
    await expect(answer).resolves.toEqual({ status: "OK" });
    // The holder is told by a notification: the amount, and the merchant's name.
    await waitFor(() => expect(notifications.notifications.scheduled).toHaveLength(1));
    const [notice] = notifications.notifications.scheduled;
    expect(notice).toEqual({
      content: {
        title: expect.stringMatching(/^Card payment: 12.500 sats$/),
        body: expect.stringMatching(/^12.500 sats to “LAKESIDE BAKERY”$/),
        data: { kind: CARD_PAID_NOTICE }
      },
      trigger: { channelId: "card-payments" }
    });
    // While the app shows: to the notification centre, no banner over the panel; a card's wake
    // packet, as before, not shown.
    const handler = notifications.notifications.handler as {
      handleNotification: (n: unknown) => Promise<unknown>;
    };
    await expect(
      handler.handleNotification(notifications.notification({ kind: CARD_PAID_NOTICE }))
    ).resolves.toEqual({
      shouldShowBanner: false,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false
    });
    expect(
      cardNotificationBehavior(
        notifications.notification({ cr: push.data.cr }) as unknown as Parameters<
          typeof cardNotificationBehavior
        >[0]
      )
    ).toEqual({
      shouldShowBanner: false,
      shouldShowList: false,
      shouldPlaySound: false,
      shouldSetBadge: false
    });
    // The iOS extension's test of a card push's text: shown, its title being what is tested.
    expect(
      cardNotificationBehavior(
        notifications.notification({ [CARD_TEXT_TEST_KEY]: true }) as unknown as Parameters<
          typeof cardNotificationBehavior
        >[0]
      )
    ).toEqual({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false
    });
    expect(
      cardNotificationBehavior(
        notifications.notification({ [CARD_TEXT_TEST_KEY]: "true" }) as unknown as Parameters<
          typeof cardNotificationBehavior
        >[0]
      )
    ).toMatchObject({ shouldShowBanner: false, shouldShowList: false });
  });

  it("names a merchant by its node without a proof, and says what approving it means", async () => {
    // Another point of sale: no proof, its invoice signed by its node.
    const node = testNode(9);
    await openApp();
    const request = await posWithdraw(card.tap());
    notifications.receive(
      notifications.notification({ cr: relay.pushes[relay.pushes.length - 1].data.cr })
    );
    const answer = posCallback(request, posInvoice(12_500n, undefined, 7, node.secretKey));
    const shown = `Node ${node.nodeId.slice(0, 8)}…${node.nodeId.slice(-8)}`;
    expect(await screen.findByTestId("card-payment-payee-name", {}, SLOW)).toHaveTextContent(shown);
    expect(screen.getByTestId("payee-mark-node")).toBeTruthy();
    expect(screen.queryByTestId("payee-mark-address")).toBeNull();
    expect(screen.getByTestId("card-payment-payee").props.accessibilityLabel).toBe(
      `Merchant, ${shown}, identified by its Lightning node, New merchant`
    );
    expect(screen.getByTestId("card-payment-payee-status")).toHaveTextContent(/New merchant$/);
    // Its note, as the point of sale wrote it, apart from its name.
    expect(screen.getByTestId("card-payment-note")).toHaveTextContent(/Lakeside Bakery$/);
    // Approvable, the box unticked, and what it means said before the holder chooses.
    expect(screen.getByTestId("card-payment-approve").props.accessibilityState).toMatchObject({
      checked: false
    });
    expect(screen.getByTestId("card-payment-node-warning")).toBeTruthy();
    expect(
      screen.getByText(
        "This merchant is identified by its Lightning node, not by its address. If this node is shared (Spark, Wallet of Satoshi, Strike…), approving it also approves all its other users: they would be paid without confirmation, within the card's limits."
      )
    ).toBeTruthy();
    // The receipt and its warnings scroll, "Pay" and "Decline" stay in sight under them: the
    // warning would take them off the screen of a phone.
    const receipt = within(screen.getByTestId("card-payment-scroll"));
    expect(receipt.getByTestId("card-payment-node-warning")).toBeTruthy();
    expect(receipt.getByTestId("card-payment-approve")).toBeTruthy();
    expect(receipt.queryByTestId("card-payment-pay")).toBeNull();
    expect(receipt.queryByTestId("card-payment-decline")).toBeNull();
    expect(receipt.queryByTestId("card-payment-time")).toBeNull();
    // The warning comes before the box: in sight whenever the box is, the receipt scrolling from
    // its top.
    const order = JSON.stringify(screen.toJSON());
    expect(order.indexOf('"card-payment-node-warning"')).toBeGreaterThan(-1);
    expect(order.indexOf('"card-payment-node-warning"')).toBeLessThan(
      order.indexOf('"card-payment-approve"')
    );
    await act(async () => {
      fireEvent.press(screen.getByTestId("card-payment-approve"));
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId("card-payment-pay"));
    });
    expect(await screen.findByTestId("card-payment-completed", {}, SLOW)).toBeTruthy();
    expect(screen.getByTestId("card-payment-approved")).toBeTruthy();
    await expect(answer).resolves.toEqual({ status: "OK" });
    // Approved by its whole key, for this card.
    const { approved } = await loadCardPayees(TEST_WALLET_ID, { cardId, walletGeneration: 1 });
    expect(approved).toMatchObject([{ id: node.nodeId, by: "node", approvedName: "" }]);
    await waitFor(() => expect(notifications.notifications.scheduled).toHaveLength(1));
    expect(notifications.notifications.scheduled[0]).toMatchObject({
      content: { body: expect.stringMatching(new RegExp(`^12.500 sats to ${shown}$`)) }
    });
  });

  it("names a node by the alias it announces, its key under it", async () => {
    const node = testNode(10);
    nodeAliases.aliases.set(node.nodeId, "LNBank");
    await openApp();
    const request = await posWithdraw(card.tap());
    notifications.receive(
      notifications.notification({ cr: relay.pushes[relay.pushes.length - 1].data.cr })
    );
    const answer = posCallback(request, posInvoice(12_500n, undefined, 7, node.secretKey));
    const key = `Node ${node.nodeId.slice(0, 8)}…${node.nodeId.slice(-8)}`;
    expect(await screen.findByTestId("card-payment-payee-name", {}, SLOW)).toHaveTextContent(
      "LNBank"
    );
    expect(screen.getByTestId("card-payment-payee-node")).toHaveTextContent(key);
    expect(screen.getByTestId("payee-mark-node")).toBeTruthy();
    expect(screen.getByTestId("card-payment-payee").props.accessibilityLabel).toBe(
      `Merchant, LNBank, name declared by the node, ${key}, identified by its Lightning node, New merchant`
    );
    expect(screen.getByTestId("card-payment-node-warning")).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByTestId("card-payment-approve"));
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId("card-payment-pay"));
    });
    expect(await screen.findByTestId("card-payment-completed", {}, SLOW)).toBeTruthy();
    await expect(answer).resolves.toEqual({ status: "OK" });
    expect(
      (await loadCardPayees(TEST_WALLET_ID, { cardId, walletGeneration: 1 })).approved
    ).toMatchObject([{ id: node.nodeId, approvedName: "LNBank" }]);
    await waitFor(() => expect(notifications.notifications.scheduled).toHaveLength(1));
    expect(notifications.notifications.scheduled[0]).toMatchObject({
      content: { body: expect.stringMatching(/^12.500 sats to “LNBank”$/) }
    });
  });

  it("pays a new merchant without approving it when the holder leaves the box unticked", async () => {
    await openApp();
    const request = await posWithdraw(card.tap());
    const push = relay.pushes[relay.pushes.length - 1];
    notifications.receive(notifications.notification({ cr: push.data.cr }));
    const merchant = merchantInvoice(12_500n, "sattleme42", "Harbour Coffee");
    const answer = posCallback(request, merchant.pr, merchant.proof);
    expect(await screen.findByTestId("card-payment-approve", {}, SLOW)).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByTestId("card-payment-pay"));
    });
    expect(await screen.findByTestId("card-payment-completed", {}, SLOW)).toBeTruthy();
    expect(screen.queryByTestId("card-payment-approved")).toBeNull();
    await expect(answer).resolves.toEqual({ status: "OK" });
  });

  it('never carries "Approve this merchant" to the next payment the panel shows', async () => {
    await openApp();
    const first = await posWithdraw(card.tap());
    notifications.receive(
      notifications.notification({ cr: relay.pushes[relay.pushes.length - 1].data.cr })
    );
    const port = merchantInvoice(12_500n, "sattleme42", "Harbour Coffee");
    const firstAnswer = posCallback(first, port.pr, port.proof);
    expect(await screen.findByTestId("card-payment-approve", {}, SLOW)).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByTestId("card-payment-approve"));
    });
    expect(screen.getByTestId("card-payment-approve").props.accessibilityState).toMatchObject({
      checked: true
    });
    const ticked = currentCardPayment();

    // A newer tap, at another new merchant, takes the panel before the first one is answered.
    const second = await posWithdraw(card.tap());
    notifications.receive(
      notifications.notification({ cr: relay.pushes[relay.pushes.length - 1].data.cr })
    );
    await waitFor(() => expect(currentCardPayment()).not.toBe(ticked), SLOW);
    await expect(firstAnswer).resolves.toMatchObject({ status: "ERROR" });
    const quay = merchantInvoice(800n, "sattleme77", "Quay Bar", 8);
    const secondAnswer = posCallback(second, quay.pr, quay.proof);
    await waitFor(
      () => expect(screen.getByTestId("card-payment-payee-name")).toHaveTextContent("Quay Bar"),
      SLOW
    );
    // Unticked, as every payment starts: paying it approves nobody.
    expect(screen.getByTestId("card-payment-approve").props.accessibilityState).toMatchObject({
      checked: false
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId("card-payment-pay"));
    });
    expect(await screen.findByTestId("card-payment-completed", {}, SLOW)).toBeTruthy();
    expect(screen.queryByTestId("card-payment-approved")).toBeNull();
    await expect(secondAnswer).resolves.toEqual({ status: "OK" });
    expect(
      (await loadCardPayees(TEST_WALLET_ID, { cardId, walletGeneration: 1 })).approved
    ).toEqual([]);
  });

  it("says, the time run out, what the point of sale was told, the receipt kept", async () => {
    await openApp();
    const request = await posWithdraw(card.tap());
    const push = relay.pushes[relay.pushes.length - 1];
    notifications.receive(notifications.notification({ cr: push.data.cr }));
    const merchant = merchantInvoice(12_500n, "sattleme42", "Harbour Coffee");
    const answer = posCallback(request, merchant.pr, merchant.proof);
    expect(await screen.findByTestId("card-payment-pay", {}, SLOW)).toBeTruthy();
    // Nobody answers: past its 25 s (renderRouter's fake clock), the payment is refused.
    await act(() => jest.advanceTimersByTimeAsync(25_000));
    await expect(answer).resolves.toMatchObject({ status: "ERROR" });
    expect(await screen.findByTestId("card-payment-failure", {}, SLOW)).toHaveTextContent(
      /No confirmation within 25 seconds: nothing was paid\. The till was told that this new merchant must be approved in the app\./
    );
    expect(screen.getByTestId("sheet-subtitle")).toHaveTextContent("Time is up");
    expect(screen.getByTestId("card-payment-payee-name")).toHaveTextContent("Harbour Coffee");
    expect(screen.queryByTestId("card-payment-pay")).toBeNull();
    expect(screen.getByTestId("card-payment-done")).toBeTruthy();
  });

  it("shows no empty receipt when the time ran out before the payee was known", async () => {
    // The point of sale waits 8 s (relay 2.1.0): 3 s to answer (cardAnswerMs).
    relay.answerWaitMs = 8_000;
    // breez.tips does not answer the verify URL in time: the payee is still being checked.
    jest
      .mocked(globalThis.fetch)
      .mockImplementation((input: RequestInfo | URL, init?: RequestInit) =>
        new URL(String(input)).host === "breez.tips"
          ? new Promise<Response>((_, reject) => {
              init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
            })
          : fetchRelays(input, init)
      );
    await openApp();
    const request = await posWithdraw(card.tap());
    const push = relay.pushes[relay.pushes.length - 1];
    notifications.receive(notifications.notification({ cr: push.data.cr }));
    // A merchant's invoice: its description hash only, no note.
    const merchant = merchantInvoice(12_500n, "sattleme42", "Harbour Coffee");
    const answer = posCallback(request, merchant.pr, merchant.proof);
    expect(await screen.findByTestId("card-payment-checking", {}, SLOW)).toBeTruthy();
    await act(() => jest.advanceTimersByTimeAsync(3_000));
    await expect(answer).resolves.toMatchObject({ status: "ERROR" });
    expect(await screen.findByTestId("card-payment-failure", {}, SLOW)).toBeTruthy();
    expect(screen.getByTestId("sheet-subtitle")).toHaveTextContent("Time is up");
    expect(screen.getByTestId("card-payment-amount")).toHaveTextContent("12.50 CHF");
    // No merchant, no note, no card (the app locked): no rows, and no box for them.
    expect(screen.queryByTestId("card-payment-payee")).toBeNull();
    expect(screen.queryByTestId("card-payment-details")).toBeNull();
  });

  it("explains a refusal, and that nothing was paid", async () => {
    await openApp();
    const request = await posWithdraw(card.tap());
    const push = relay.pushes[relay.pushes.length - 1];
    notifications.receive(notifications.notification({ cr: push.data.cr }));
    // Above the card's ceiling (20,000 sats at its pairing).
    const answer = posCallback(request, posInvoice(50_000n));
    expect(
      await screen.findByText("The amount is above your card's limit. Nothing was paid.", {}, SLOW)
    ).toBeTruthy();
    await expect(answer).resolves.toEqual({
      status: "ERROR",
      reason: "Amount above the card's limit per payment."
    });
  });

  it("says when the card's own wallet holds too little, and where to recharge it", async () => {
    // Its wallet holds less than the invoice and its fee: the main balance never pays for it.
    sdk.fakeCardWallet(cardId).balanceSats = 12_000n;
    const request = await posWithdraw(card.tap());
    const push = relay.pushes[relay.pushes.length - 1];
    notifications.tap(notifications.notification({ cr: push.data.cr }));
    await openApp();
    const answer = posCallback(request, posInvoice(12_500n));
    await act(async () => {
      fireEvent.press(await screen.findByTestId("card-payment-pay", {}, SLOW));
    });
    expect(await screen.findByTestId("card-payment-failure", {}, SLOW)).toHaveTextContent(
      /Your card's balance does not cover this payment and its fee\. Nothing was paid: top up the card in “Cards”\./
    );
    await expect(answer).resolves.toEqual({
      status: "ERROR",
      reason: "Insufficient card balance."
    });
    expect(sdk.fakeCardWallet(cardId).balanceSats).toBe(12_000n);
    expect(sdk.fakeWallet.balanceSats).toBe(500_000n);
  });
});

describe("open-app mode", () => {
  it("reads the pending packets every 5 s while the account is open without notifications", async () => {
    jest.useFakeTimers({ now: Date.now(), doNotFake: ["queueMicrotask", "nextTick"] });
    try {
      await openTestAccount();
      notifications.notifications.permission = "denied";
      const { unmount } = await renderHook(() => useCardWakes(TEST_WALLET_ID));
      await act(() => jest.advanceTimersByTimeAsync(0));
      const reads = () => relay.requests.filter((r) => r === "GET /v1/channel/pending").length;
      const before = reads();
      await posWithdraw(card.tap());
      await act(() => jest.advanceTimersByTimeAsync(5000));
      expect(reads()).toBe(before + 1);
      expect(currentCardPayment()).not.toBeNull();
      // Account closed (till mode): no channel secret, nothing read.
      closeAccount();
      await act(() => jest.advanceTimersByTimeAsync(15_000));
      expect(reads()).toBe(before + 1);
      await unmount();
    } finally {
      jest.useRealTimers();
    }
  });

  it("reads them too, notifications allowed, once the card's taps carry no push token", async () => {
    jest.useFakeTimers({ now: Date.now(), doNotFake: ["queueMicrotask", "nextTick"] });
    try {
      await openTestAccount();
      const { unmount } = await renderHook(() => useCardWakes(TEST_WALLET_ID));
      await act(() => jest.advanceTimersByTimeAsync(0));
      const reads = () => relay.requests.filter((r) => r === "GET /v1/channel/pending").length;
      // Its token sealed: the notification tells each tap, nothing read meanwhile.
      const before = reads();
      await act(() => jest.advanceTimersByTimeAsync(15_000));
      expect(reads()).toBe(before);
      // A sync without a token (an iPhone whose token did not come), the app shown.
      notifications.notifications.token = null;
      await act(() => syncAccountCards("Card payments"));
      await posWithdraw(card.tap());
      await act(() => jest.advanceTimersByTimeAsync(5000));
      expect(reads()).toBeGreaterThan(before);
      expect(currentCardPayment()).not.toBeNull();
      await unmount();
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("notificationTimeMs", () => {
  it("reads iOS's seconds and Android's milliseconds", () => {
    expect(notificationTimeMs(1_792_000_000)).toBe(1_792_000_000_000);
    expect(notificationTimeMs(1_792_000_000_123)).toBe(1_792_000_000_123);
    expect(notificationTimeMs(undefined)).toBeNaN();
    expect(notificationTimeMs(Number.POSITIVE_INFINITY)).toBeNaN();
  });
});
