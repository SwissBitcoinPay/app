import "@/i18n";

import * as Clipboard from "expo-clipboard";
import { fireEvent, renderRouter, screen, waitFor, within } from "expo-router/testing-library";

import AppLayout from "@/app/(app)/_layout";
import ExtensionTestRoute from "@/app/(app)/cards/extension-test";
import CardsLayout from "@/app/(app)/cards/_layout";
import CardsRoute from "@/app/(app)/cards/index";
import SettingsLayout from "@/app/(app)/settings/_layout";
import SettingsIndex from "@/app/(app)/settings/index";
import LaunchScreen from "@/app/index";
import { closeAccount, getAccountBackupKey, getAccountSettings } from "@/features/account/session";
import { resetCardStates } from "@/features/card/states";
import {
  launchCardTextTest,
  launchProbe,
  parsePushTicket,
  probeInvoice,
  probeReport,
  type ProbeNotificationText
} from "@/features/card/extension-probe";
import { resetTerminalProfileCache } from "@/features/terminal/profile-cache";
import { decodeBolt11 } from "@/lib/lightning/bolt11";
import * as random from "@/lib/random";
import { PROBE_DIR_NAME, readProbeRuns, type ProbeRun } from "@/lib/card/probe-store";
import { currentRelays } from "@/lib/relays/current";
import * as probeStore from "@/lib/card/probe-store";
import type { SavedTerminalProfile } from "@/lib/terminal/model";
import { saveTerminalProfile } from "@/lib/terminal/profile";
import { gutter } from "@/theme";

import { TEST_WALLET_ID, openTestAccount } from "../../jest/account";
import type * as BreezFake from "../../jest/breez-sdk";
import { breezTips, breezTipsMetadata, serveBreezTips } from "../../jest/breez-tips";
import type * as FileSystemFake from "../../jest/expo-file-system";
import type * as NotificationsFake from "../../jest/expo-notifications";
import { expoPush, serveExpoPush } from "../../jest/expo-push";
import { sideInsetsOf } from "../../jest/layout";
import { metadataHash } from "../../jest/lightning";
import type * as RelaysFake from "../../jest/nostr-relays";

const GROUP = "group.ch.swissbitcoinpay.checkout.staging.cards";
jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    expoConfig: {
      extra: {
        breezNetwork: "mainnet",
        cardAppGroup: "group.ch.swissbitcoinpay.checkout.staging.cards",
        eas: { projectId: "00000000-0000-4000-8000-000000000000" }
      }
    }
  }
}));
jest.mock("expo-clipboard", () => ({ setStringAsync: jest.fn(async () => true) }));
jest.mock("../lib/breez/passkey", () => ({
  createPasskeyWallet: jest.fn(),
  preparePasskeys: jest.fn(async () => undefined),
  passkeysReady: jest.fn(() => true),
  signInWithPasskey: jest.fn()
}));
jest.mock("../lib/app-info", () => ({
  ...jest.requireActual("../lib/app-info"),
  getAppInfo: () => ({
    variant: "staging",
    version: "3.0.0",
    buildNumber: "3000000",
    commit: "f82ecab",
    updates: null
  })
}));
jest.mock("@/components/layout/useIsDesktop", () => ({
  ...jest.requireActual("@/components/layout/useIsDesktop"),
  useIsDesktop: () => false
}));

const fileSystem = jest.requireMock<typeof FileSystemFake>("expo-file-system");
const notifications = jest.requireMock<typeof NotificationsFake>("expo-notifications");
const sdk = jest.requireMock<typeof BreezFake>("@breeztech/breez-sdk-spark-react-native");
const nostr = jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");

const API_KEY = "breez-api-key-for-tests";
const USERNAME = "sattleme02c6047f94";
const ADDRESS = `${USERNAME}@breez.tips`;
const TEXT: ProbeNotificationText = { title: "Test", body: "If this text stays…" };
const RUN_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
/** The screen reads the extension's records every 2 s. */
const READ = { timeout: 5000 };

const routes = {
  index: LaunchScreen,
  "(app)/_layout": AppLayout,
  "(app)/settings/_layout": SettingsLayout,
  "(app)/settings/index": SettingsIndex,
  "(app)/cards/_layout": CardsLayout,
  "(app)/cards/index": CardsRoute,
  "(app)/cards/extension-test": ExtensionTestRoute
};

function launch(fields: Partial<Parameters<typeof launchProbe>[0]> = {}) {
  return launchProbe({
    mode: "sync",
    profile: "light",
    lightningAddress: ADDRESS,
    text: TEXT,
    channelName: "Card payments",
    ...fields
  });
}

/** What the extension writes once it ran (CardProbe.swift). */
function writeRecord(run: string, fields: Record<string, unknown> = {}) {
  const results = new fileSystem.Directory(
    fileSystem.Paths.appleSharedContainers[GROUP],
    PROBE_DIR_NAME,
    "results"
  );
  results.create({ intermediates: true, idempotent: true });
  new fileSystem.File(results, `${run}.json`).writeSync(
    JSON.stringify({
      version: 1,
      run,
      mode: "sync",
      profile: "light",
      device: "iPhone16,1",
      system: "18.4.1",
      startedAt: Date.now() - 7_000,
      processRun: 1,
      steps: [
        { name: "start", atMs: 0, footprintBytes: 6_291_456, availableBytes: 18_874_368 },
        { name: "connect", atMs: 2_100, footprintBytes: 15_728_640, availableBytes: 9_437_184 }
      ],
      outcome: "ok",
      peakFootprintBytes: 17_825_792,
      minAvailableBytes: 7_340_032,
      limitEstimateBytes: 25_165_824,
      totalMs: 6_200,
      balanceSats: 100,
      ...fields
    })
  );
}

let previousKey: string | undefined;

beforeEach(async () => {
  closeAccount();
  nostr.resetRelays();
  fileSystem.resetFileSystem();
  fileSystem.setSharedContainers([GROUP]);
  resetCardStates();
  previousKey = process.env.EXPO_PUBLIC_BREEZ_API_KEY;
  process.env.EXPO_PUBLIC_BREEZ_API_KEY = API_KEY;
  serveBreezTips();
  serveExpoPush();
  sdk.lightningAddresses.set(USERNAME, "Fine Bakery");
  jest.mocked(Clipboard.setStringAsync).mockClear();
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  closeAccount();
  if (previousKey === undefined) delete process.env.EXPO_PUBLIC_BREEZ_API_KEY;
  else process.env.EXPO_PUBLIC_BREEZ_API_KEY = previousKey;
  jest.restoreAllMocks();
});

describe("launchProbe", () => {
  it("sends this phone an alert the extension may change, asking it for a run", async () => {
    const outcome = await launch({ profile: "standard" });
    expect(outcome).toEqual({ status: "sent", run: expect.stringMatching(RUN_ID) });
    const run = (outcome as { run: string }).run;

    expect(expoPush.messages).toEqual([
      {
        to: notifications.notifications.token,
        title: TEXT.title,
        body: TEXT.body,
        sound: "default",
        priority: "high",
        // Not delivered hours later: a test is about now.
        ttl: 300,
        mutableContent: true,
        data: { sattlemeProbe: 1, run, mode: "sync", profile: "standard" }
      }
    ]);
    // The extension has what it needs, and the run is noted as sent.
    expect(readProbeRuns()).toEqual([
      expect.objectContaining({ run, mode: "sync", profile: "standard", record: null })
    ]);
    expect(readProbeRuns()[0].ticket).toMatch(/^0000000/);
  });

  // The extension runs only a run the app noted, and may run
  // before Expo answers.
  it("notes the run before its notification goes", async () => {
    const fetchMock = jest.mocked(globalThis.fetch);
    const before = fetchMock.getMockImplementation();
    let notedWhenSent: unknown[] | null = null;
    fetchMock.mockImplementation(async (...args: Parameters<typeof fetch>) => {
      if (String(args[0]).includes("exp.host")) notedWhenSent = readProbeRuns();
      return before!(...args);
    });
    const outcome = await launch({ profile: "light" });
    const run = (outcome as { run: string }).run;
    expect(notedWhenSent).toEqual([
      expect.objectContaining({ run, mode: "sync", profile: "light", ticket: null, record: null })
    ]);
    expect(readProbeRuns()[0].sentAt).toBe((notedWhenSent![0] as { sentAt: number }).sentAt);
  });

  it("sends nothing when the run cannot be noted", async () => {
    jest.spyOn(probeStore, "recordSentProbe").mockImplementation(() => {
      throw new Error("disk full");
    });
    expect(await launch()).toMatchObject({ status: "failed", reason: "storage" });
    expect(expoPush.messages).toEqual([]);
  });

  it("gives a payment run an invoice of the account's own address, as a till's", async () => {
    const outcome = await launch({ mode: "pay" });
    expect(outcome.status).toBe("sent");
    const invoice = (expoPush.messages[0].data as { invoice: string }).invoice;
    const decoded = decodeBolt11(invoice);
    expect(decoded?.amountMsat).toBe(1000n);
    expect(decoded?.network).toBe("bc");
    expect(decoded?.descriptionHash).toBe(metadataHash(breezTipsMetadata(USERNAME, "Fine Bakery")));
  });

  it("gives the engine's payment run its invoice and the test wallet, as a payment run", async () => {
    const outcome = await launch({ mode: "enginePay" });
    expect(outcome).toEqual({ status: "sent", run: expect.stringMatching(RUN_ID) });
    const data = expoPush.messages[0].data as { mode: string; invoice: string };
    expect(data.mode).toBe("enginePay");
    expect(decodeBolt11(data.invoice)?.amountMsat).toBe(1000n);
    expect(await probeStore.probePrepared()).toBe(true);
    expect(await launch({ mode: "enginePay", lightningAddress: null })).toMatchObject({
      status: "failed",
      reason: "invoice"
    });
  });

  it("pays the address's smallest amount up to 10 sats, never more", async () => {
    breezTips.minSendableMsat = 10_000;
    await expect(probeInvoice(ADDRESS)).resolves.toMatch(/^lnbc100n1/);
    breezTips.minSendableMsat = 11_000;
    await expect(probeInvoice(ADDRESS)).rejects.toThrow(/11 to/);
    expect(await launch({ mode: "pay" })).toMatchObject({ status: "failed", reason: "invoice" });
    expect(expoPush.messages).toEqual([]);
  });

  it("says why it sent nothing", async () => {
    notifications.answerPermission("denied");
    expect(await launch()).toMatchObject({ status: "failed", reason: "notifications" });
    notifications.notifications.permission = "granted";
    // No token from Expo: no network, or a build without APNs credentials.
    notifications.notifications.token = null;
    expect(await launch()).toMatchObject({ status: "failed", reason: "pushToken" });
    notifications.notifications.token = "ExponentPushToken[fake-token-0000000000]";

    expect(await launch({ mode: "pay", lightningAddress: null })).toMatchObject({
      reason: "invoice"
    });

    delete process.env.EXPO_PUBLIC_BREEZ_API_KEY;
    expect(await launch()).toMatchObject({ status: "failed", reason: "noApiKey" });

    fileSystem.setSharedContainers([]);
    expect(await launch()).toMatchObject({ status: "failed", reason: "unavailable" });
    expect(expoPush.messages).toEqual([]);
    expect(readProbeRuns()).toEqual([]);
  });

  it("asks the engine's test of no wallet: no API key nor test seed needed", async () => {
    delete process.env.EXPO_PUBLIC_BREEZ_API_KEY;
    const outcome = await launch({ mode: "engine" });
    expect(outcome).toEqual({ status: "sent", run: expect.stringMatching(RUN_ID) });
    expect(expoPush.messages).toEqual([
      expect.objectContaining({
        mutableContent: true,
        data: expect.objectContaining({ sattlemeProbe: 1, mode: "engine" })
      })
    ]);
    expect(readProbeRuns()).toEqual([expect.objectContaining({ mode: "engine", record: null })]);
  });

  it("asks the runtime's test of no wallet, giving it the device's relays, never a seed nor a key", async () => {
    delete process.env.EXPO_PUBLIC_BREEZ_API_KEY;
    const outcome = await launch({ mode: "runtime" });
    expect(outcome).toEqual({ status: "sent", run: expect.stringMatching(RUN_ID) });
    expect(expoPush.messages).toEqual([
      expect.objectContaining({
        mutableContent: true,
        data: expect.objectContaining({ sattlemeProbe: 1, mode: "runtime" })
      })
    ]);
    const config = new fileSystem.File(
      fileSystem.Paths.appleSharedContainers[GROUP],
      PROBE_DIR_NAME,
      "config.json"
    );
    expect(JSON.parse(config.textSync())).toEqual({
      version: 1,
      relays: currentRelays().filter((relay) => relay.startsWith("wss://"))
    });
    expect(await probeStore.probePrepared()).toBe(false);
    expect(readProbeRuns()).toEqual([expect.objectContaining({ mode: "runtime", record: null })]);
  });

  it("says why Expo did not take it, and notes no run", async () => {
    expoPush.answer = "deviceNotRegistered";
    expect(await launch()).toEqual({
      status: "failed",
      reason: "push",
      detail: "DeviceNotRegistered"
    });
    expoPush.answer = "tooManyRequests";
    expect(await launch()).toMatchObject({ reason: "push", detail: "TOO_MANY_REQUESTS" });
    expoPush.answer = "unreachable";
    expect(await launch()).toMatchObject({ reason: "push", detail: "unreachable" });
    expect(readProbeRuns()).toEqual([]);
  });
});

describe("launchCardTextTest", () => {
  it("sends this phone a card's wake-up as the relay does, without a packet", async () => {
    expect(await launchCardTextTest("Card payments")).toEqual({ status: "sent" });
    expect(expoPush.messages).toEqual([
      {
        to: notifications.notifications.token,
        // The relay's title: the extension writes the app's over it.
        title: "sattle.me",
        sound: "default",
        priority: "high",
        ttl: 300,
        mutableContent: true,
        // No `cr`: nothing for the app to open, only the extension's text to show.
        data: { sattlemeCardTextTest: true }
      }
    ]);
    // Nothing noted for the measurement: this test has no run.
    expect(readProbeRuns()).toEqual([]);
  });

  it("says why it sent nothing", async () => {
    notifications.answerPermission("denied");
    expect(await launchCardTextTest("Card payments")).toEqual({
      status: "failed",
      reason: "notifications",
      detail: null
    });
    notifications.notifications.permission = "granted";
    notifications.notifications.token = null;
    expect(await launchCardTextTest("Card payments")).toMatchObject({ reason: "pushToken" });
    notifications.notifications.token = "ExponentPushToken[fake-token-0000000000]";
    expoPush.answer = "deviceNotRegistered";
    expect(await launchCardTextTest("Card payments")).toEqual({
      status: "failed",
      reason: "push",
      detail: "DeviceNotRegistered"
    });
  });
});

describe("parsePushTicket", () => {
  it("reads Expo's ticket, and why it refused", () => {
    expect(parsePushTicket(200, { data: { status: "ok", id: "abc" } })).toEqual({
      ok: true,
      id: "abc"
    });
    expect(parsePushTicket(200, { data: { status: "error", message: "No" } })).toEqual({
      ok: false,
      error: "No"
    });
    expect(parsePushTicket(400, { errors: [{ code: "VALIDATION_ERROR" }] })).toEqual({
      ok: false,
      error: "VALIDATION_ERROR"
    });
    // An "ok" under an HTTP error is not a ticket.
    expect(parsePushTicket(500, { data: { status: "ok", id: "abc" } })).toEqual({
      ok: false,
      error: "HTTP 500"
    });
    expect(parsePushTicket(502, null)).toEqual({ ok: false, error: "HTTP 502" });
    expect(parsePushTicket(200, { data: { status: "error", message: "x".repeat(500) } })).toEqual({
      ok: false,
      error: "x".repeat(120)
    });
  });
});

describe("probeReport", () => {
  it("hands the runs over with the build, sats exact, without a secret", async () => {
    const outcome = await launch();
    const run = (outcome as { run: string }).run;
    writeRecord(run, { balanceSats: 9_007_199_254_740_991, feeSats: "2" });
    const report = probeReport(readProbeRuns(), new Date("2026-10-15T12:00:00Z"));
    const parsed = JSON.parse(report) as {
      app: unknown;
      runs: { run: string; record: Record<string, unknown> }[];
    };
    expect(parsed.app).toEqual({
      variant: "staging",
      version: "3.0.0",
      buildNumber: "3000000",
      commit: "f82ecab"
    });
    expect(parsed.runs[0].run).toBe(run);
    expect(parsed.runs[0].record).toMatchObject({
      outcome: "ok",
      balanceSats: "9007199254740991",
      feeSats: "2",
      peakMB: 17,
      limitEstimateMB: 24
    });
    expect(report).not.toContain(API_KEY);
  });
});

/** The owner's device, unlocked, its point of sale prepared (the test pays its address). */
async function ownerDevice() {
  await openTestAccount({ usage: "merchant", signUp: "done" });
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

/** Renders the app on `initialUrl`; `router` also answers `getPathname()`. */
async function open(initialUrl: string) {
  const router = await renderRouter(routes, { initialUrl });
  return { router };
}

describe("iOS extension test", () => {
  jest.setTimeout(30_000);

  beforeEach(ownerDevice);

  it("opens from Cards in the iOS staging app", async () => {
    const { router } = await open("/cards");
    await fireEvent.press(await screen.findByTestId("cards-probe", {}, READ));
    await waitFor(() => expect(router.getPathname()).toBe("/cards/extension-test"));
    expect(await screen.findByTestId("probe-screen")).toBeTruthy();
    // As wide as the screen, its content at the screen's gutter.
    expect(sideInsetsOf(screen.getByTestId("probe-screen"))).toEqual({ left: 0, right: 0 });
    expect(sideInsetsOf(screen.getByTestId("probe-how"))).toEqual({ left: gutter, right: gutter });
    expect(screen.getByTestId("probe-empty")).toHaveTextContent("No test yet.");
  });

  it("is offered nowhere else", async () => {
    fileSystem.setSharedContainers([]);
    await open("/cards");
    expect(await screen.findByTestId("cards-pair", {}, READ)).toBeTruthy();
    expect(screen.queryByTestId("cards-probe")).toBeNull();
  });

  it("says where it runs when opened elsewhere", async () => {
    fileSystem.setSharedContainers([]);
    await open("/cards/extension-test");
    expect(
      await screen.findByText("This test only exists in the staging app, on iPhone.")
    ).toBeTruthy();
    expect(screen.queryByTestId("probe-launch-sync")).toBeNull();
  });

  it("runs a card holder's tests but the payment, which needs a Lightning address", async () => {
    // A card holder's account: no main wallet, no point of sale.
    await openTestAccount({ usage: "card", signUp: "done" });
    await saveTerminalProfile({
      version: 4,
      walletId: TEST_WALLET_ID,
      backupKey: getAccountBackupKey()!,
      businessName: getAccountSettings()?.businessName ?? "",
      currency: "CHF"
    });
    resetTerminalProfileCache();
    await open("/cards/extension-test");
    expect(
      await screen.findByText(
        "This test pays the account's Lightning address: a cards-only account has none."
      )
    ).toBeTruthy();
    expect(screen.getByTestId("probe-launch-pay")).toBeDisabled();
    expect(screen.getByTestId("probe-launch-sync")).toBeEnabled();
    // The card notification's test needs no address.
    await fireEvent.press(screen.getByTestId("probe-card-text"));
    expect(await screen.findByText("Card notification sent")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("probe-launch-sync"));
    expect(await screen.findByText("Test notification sent")).toBeTruthy();
    expect(expoPush.messages.map((m) => m.data)).toEqual([
      { sattlemeCardTextTest: true },
      expect.objectContaining({ sattlemeProbe: 1, mode: "sync" })
    ]);
  });

  it("launches a run, then shows what the extension recorded", async () => {
    await open("/cards/extension-test");
    await fireEvent.press(await screen.findByTestId("probe-profile-standard"));
    await fireEvent.press(screen.getByTestId("probe-launch-receive"));
    expect(await screen.findByText("Test notification sent")).toBeTruthy();
    expect(expoPush.messages[0]).toMatchObject({
      data: { mode: "receive", profile: "standard" }
    });
    const run = (expoPush.messages[0].data as { run: string }).run;
    const row = within(await screen.findByTestId(`probe-run-${run}`));
    expect(row.getByText("Receive 100 sats · Standard")).toBeTruthy();
    expect(row.getByText("Waiting")).toBeTruthy();

    writeRecord(run, { mode: "receive", profile: "standard", invoice: "lnbc1u1pfundme" });
    expect(await row.findByText("Succeeded", {}, READ)).toBeTruthy();
    expect(row.getByText("peak 17 MB · limit ≈ 24 MB · 6.2 s")).toBeTruthy();
    expect(screen.getByTestId("probe-balance")).toHaveTextContent(
      "Test wallet balance, read at the last test: 100 sats"
    );

    // Its invoice funds the test wallet, from "Send".
    await fireEvent.press(row.getByTestId(`probe-invoice-${run}`));
    expect(Clipboard.setStringAsync).toHaveBeenLastCalledWith("lnbc1u1pfundme");
    expect(await screen.findByText("Invoice copied: pay it from “Send”")).toBeTruthy();
  });

  it("sends a card's notification to test its text", async () => {
    await open("/cards/extension-test");
    await fireEvent.press(await screen.findByTestId("probe-card-text"));
    expect(await screen.findByText("Card notification sent")).toBeTruthy();
    expect(expoPush.messages).toEqual([
      expect.objectContaining({ title: "sattle.me", data: { sattlemeCardTextTest: true } })
    ]);
    expoPush.answer = "deviceNotRegistered";
    await fireEvent.press(screen.getByTestId("probe-card-text"));
    expect(await screen.findByText("Expo's notification service refused to send it")).toBeTruthy();
  });

  it('tells a run the system stopped from one still running, never "failed" before', async () => {
    const first = (await launch()) as { run: string };
    const second = (await launch()) as { run: string };
    writeRecord(first.run, {
      outcome: "running",
      startedAt: Date.now() - 60_000,
      totalMs: undefined
    });
    writeRecord(second.run, { outcome: "running", startedAt: Date.now(), totalMs: undefined });

    await open("/cards/extension-test");
    const stopped = within(await screen.findByTestId(`probe-run-${first.run}`));
    expect(stopped.getByText("Interrupted (connect)")).toBeTruthy();
    const running = within(screen.getByTestId(`probe-run-${second.run}`));
    expect(running.getByText("Running (connect)")).toBeTruthy();
  });

  it("copies the results to hand them over, then clears them", async () => {
    const { run } = (await launch()) as { run: string };
    writeRecord(run);
    await open("/cards/extension-test");
    await fireEvent.press(await screen.findByTestId("probe-copy"));
    const copied = jest.mocked(Clipboard.setStringAsync).mock.calls.at(-1)?.[0] ?? "";
    expect(JSON.parse(copied)).toMatchObject({
      report: "sattleme-ios-notification-extension",
      runs: [{ run, record: { outcome: "ok" } }]
    });
    expect(copied).not.toContain(API_KEY);
    expect(await screen.findByText("Results copied")).toBeTruthy();

    await fireEvent.press(screen.getByTestId("probe-clear"));
    expect(await screen.findByTestId("probe-empty")).toBeTruthy();
    expect(readProbeRuns()).toEqual([] as ProbeRun[]);
  });

  it("says when a run could not start for an unforeseen reason", async () => {
    jest.spyOn(random, "randomUuid").mockImplementation(() => {
      throw new Error("No secure random source");
    });
    await open("/cards/extension-test");
    await fireEvent.press(await screen.findByTestId("probe-launch-sync"));
    expect(await screen.findByText("The test could not start")).toBeTruthy();
    expect(expoPush.messages).toEqual([]);
    // The buttons are back.
    expect(screen.getByTestId("probe-launch-sync")).not.toBeDisabled();
  });

  it("says why a run could not start", async () => {
    notifications.answerPermission("denied");
    await open("/cards/extension-test");
    await fireEvent.press(await screen.findByTestId("probe-launch-sync"));
    expect(await screen.findByText("Allow notifications to start a test")).toBeTruthy();
    expect(expoPush.messages).toEqual([]);
  });
});
