import "@/i18n";

import * as Clipboard from "expo-clipboard";
import { fireEvent, renderRouter, screen, waitFor, within } from "expo-router/testing-library";
import { Platform } from "react-native";

import AppLayout from "@/app/(app)/_layout";
import CardsLayout from "@/app/(app)/cards/_layout";
import CardsRoute from "@/app/(app)/cards/index";
import WakeJournalRoute from "@/app/(app)/cards/wake-journal";
import SettingsLayout from "@/app/(app)/settings/_layout";
import SettingsIndex from "@/app/(app)/settings/index";
import LaunchScreen from "@/app/index";
import { closeAccount, getAccountBackupKey, getAccountSettings } from "@/features/account/session";
import * as socketFeature from "@/features/card/socket";
import { resetCardStates } from "@/features/card/states";
import { cardWakesReport, longestSilenceMs, wakeOutcome } from "@/features/card/wake-report";
import { resetTerminalProfileCache } from "@/features/terminal/profile-cache";
import { CARD_WAKE_MAX_MS } from "@/config/card";
import { markPushToken } from "@/lib/card/push-marks";
import {
  CARD_WAKES_DIR_NAME,
  addCardWakeStep,
  beginCardWake,
  endCardWake,
  loadCardWakes,
  type CardWakeEntry,
  type WakeStep
} from "@/lib/card/wake-journal";
import { readLog } from "@/lib/log/log";
import type { SavedTerminalProfile } from "@/lib/terminal/model";
import { saveTerminalProfile } from "@/lib/terminal/profile";
import { gutter } from "@/theme";

import { TEST_WALLET_ID, openTestAccount } from "../../jest/account";
import { cardSocketState } from "../../jest/card-socket";
import { sideInsetsOf } from "../../jest/layout";
import type * as FileSystemFake from "../../jest/expo-file-system";
import type * as RelaysFake from "../../jest/nostr-relays";

/*
 * "Wake journal" (src/features/card/WakeJournalScreen.tsx): the card wakes' journal as the
 * Android staging app shows it, and the report "Copy the journal" hands over.
 */

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
jest.mock("expo-clipboard", () => ({ setStringAsync: jest.fn(async () => true) }));
jest.mock("../lib/breez/passkey", () => ({
  createPasskeyWallet: jest.fn(),
  preparePasskeys: jest.fn(async () => undefined),
  passkeysReady: jest.fn(() => true),
  signInWithPasskey: jest.fn()
}));
const build = { variant: "staging" };
jest.mock("../lib/app-info", () => ({
  ...jest.requireActual("../lib/app-info"),
  getAppInfo: () => ({
    variant: build.variant,
    version: "3.0.0",
    buildNumber: "3000000",
    commit: "f82ecab",
    updates: { channel: "staging", runtimeVersion: "abc", updateId: "0193" }
  })
}));
jest.mock("@/components/layout/useIsDesktop", () => ({
  ...jest.requireActual("@/components/layout/useIsDesktop"),
  useIsDesktop: () => false
}));

const fileSystem = jest.requireMock<typeof FileSystemFake>("expo-file-system");
const nostr = jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");

const ADDRESS = "sattleme02c6047f94@breez.tips";
const CARD_A = "0123456789abcdef0123456789abcdef";
const CARD_B = "fedcba9876543210fedcba9876543210";
const TOKEN = "ExponentPushToken[AAAAAAAAAAAAAAAAAAAAAA]";
/** The screen reads the journal every 2 s. */
const READ = { timeout: 5000 };

const routes = {
  index: LaunchScreen,
  "(app)/_layout": AppLayout,
  "(app)/settings/_layout": SettingsLayout,
  "(app)/settings/index": SettingsIndex,
  "(app)/cards/_layout": CardsLayout,
  "(app)/cards/index": CardsRoute,
  "(app)/cards/wake-journal": WakeJournalRoute
};

/** A wake written as the task writes it (background-wake.ts). */
async function journal(
  n: number,
  fields: Partial<Omit<CardWakeEntry, "steps" | "tapCheck" | "endedAtMs">>,
  steps: [string, number, string | null][],
  end: { atMs: number; tapCheck: CardWakeEntry["tapCheck"] } | null
): Promise<string> {
  const id = n.toString(16).padStart(16, "0");
  const startedAt = Date.now() - 60_000 + n;
  await beginCardWake({
    id,
    startedAt,
    receivedAt: startedAt - 1_200,
    jsAgeMs: 800,
    appState: "background",
    accountOpen: false,
    ...fields
  });
  for (const [name, atMs, detail] of steps) {
    await addCardWakeStep(id, { name, atMs, detail } satisfies WakeStep);
  }
  if (end) await endCardWake(id, end.atMs, end.tapCheck);
  return id;
}

/** The owner's device, unlocked, its point of sale prepared. */
async function ownerDevice() {
  await openTestAccount({ usage: "card", signUp: "done" });
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

async function open(initialUrl: string) {
  const router = await renderRouter(routes, { initialUrl });
  return { router };
}

beforeEach(async () => {
  closeAccount();
  nostr.resetRelays();
  fileSystem.resetFileSystem();
  resetCardStates();
  build.variant = "staging";
  jest.mocked(Clipboard.setStringAsync).mockClear();
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  closeAccount();
  jest.restoreAllMocks();
});

describe("wakeOutcome", () => {
  const base: CardWakeEntry = {
    id: "0000000000000001",
    startedAt: 1_000_000,
    receivedAt: 998_800,
    jsAgeMs: 800,
    appState: "background",
    accountOpen: false,
    steps: [],
    tapCheck: null,
    endedAtMs: null
  };
  const step = (name: string, atMs: number, detail: string | null = null) => ({
    name,
    atMs,
    detail
  });

  it("tells how a wake went, from its last steps", () => {
    const ended = { ...base, endedAtMs: 9_000 };
    expect(wakeOutcome({ ...ended, steps: [step("sent", 5_000, "completed")] }, 0)).toEqual({
      kind: "paid"
    });
    // Left, its settlement not seen before the task ended: never "Paid".
    expect(wakeOutcome({ ...ended, steps: [step("sent", 5_000, "pending")] }, 0)).toEqual({
      kind: "pending"
    });
    expect(wakeOutcome({ ...ended, steps: [step("sent", 5_000)] }, 0)).toEqual({
      kind: "pending"
    });
    expect(
      wakeOutcome(
        { ...ended, steps: [step("sent", 5_000, "pending"), step("sent", 8_000, "completed")] },
        0
      )
    ).toEqual({ kind: "paid" });
    // Followed while pending, then failed: never "Paid".
    expect(
      wakeOutcome(
        { ...ended, steps: [step("sent", 5_000, "pending"), step("sent", 8_000, "failed")] },
        0
      )
    ).toEqual({ kind: "failed", reason: "sendFailed" });
    expect(wakeOutcome({ ...ended, steps: [step("declined", 5_000)] }, 0)).toEqual({
      kind: "declined"
    });
    expect(wakeOutcome({ ...ended, steps: [step("failed", 5_000, "ended")] }, 0)).toEqual({
      kind: "failed",
      reason: "ended"
    });
    expect(wakeOutcome({ ...ended, steps: [step("notTaken", 3)] }, 0)).toEqual({
      kind: "notTaken"
    });
    expect(
      wakeOutcome({ ...ended, steps: [step("paying", 4_000), step("letGo", 240_000)] }, 0)
    ).toEqual({ kind: "letGo", step: "letGo" });
    expect(wakeOutcome({ ...ended, steps: [step("waiting", 100)] }, 0)).toEqual({
      kind: "ended",
      step: "waiting"
    });
  });

  it('tells a task still running from one the system stopped, never "failed" before', () => {
    const running = { ...base, steps: [step("taken", 40), step("paying", 3_000, "automatic")] };
    expect(wakeOutcome(running, base.startedAt + 10_000)).toEqual({
      kind: "running",
      step: "paying"
    });
    expect(wakeOutcome(running, base.startedAt + CARD_WAKE_MAX_MS + 61_000)).toEqual({
      kind: "stopped",
      step: "paying"
    });
    expect(wakeOutcome(base, base.startedAt + CARD_WAKE_MAX_MS + 61_000)).toEqual({
      kind: "stopped",
      step: "start"
    });
  });
});

describe("longestSilenceMs", () => {
  const base: CardWakeEntry = {
    id: "0000000000000001",
    startedAt: 1_000_000,
    receivedAt: 998_800,
    jsAgeMs: 800,
    appState: "background",
    accountOpen: false,
    steps: [],
    tapCheck: null,
    endedAtMs: null
  };
  const step = (name: string, atMs: number, detail: string | null = null) => ({
    name,
    atMs,
    detail
  });

  it("counts the gaps where the payment works, never its waits for others", () => {
    // The holder asked 25 s, a payment settled after being followed: no frozen process.
    expect(
      longestSilenceMs({
        ...base,
        steps: [
          step("taken", 40),
          step("waiting", 50),
          step("checking", 1_900),
          step("ready", 2_500, "newPayee"),
          step("confirming", 20_000),
          step("paying", 26_000, "confirmed"),
          step("sent", 27_000, "pending"),
          step("sent", 39_000, "completed")
        ],
        endedAtMs: 39_400
      })
    ).toBe(1_000);
    // A send that took 9 s, an end long after the last step: silences.
    expect(
      longestSilenceMs({
        ...base,
        steps: [step("taken", 40), step("paying", 1_000, "automatic"), step("sent", 10_000)],
        endedAtMs: 10_500
      })
    ).toBe(9_000);
    expect(longestSilenceMs({ ...base, steps: [step("failed", 600)], endedAtMs: 7_600 })).toBe(
      7_000
    );
    expect(longestSilenceMs(base)).toBe(0);
  });
});

describe("cardWakesReport", () => {
  it("hands the wakes over with the build and the phone, never a token, card nor key", async () => {
    jest.replaceProperty(Platform, "OS", "android");
    jest.spyOn(Platform, "Version", "get").mockReturnValue(35);
    jest.spyOn(Platform, "constants", "get").mockReturnValue({
      ...Platform.constants,
      Release: "15",
      Manufacturer: "Google",
      Model: "Pixel 8",
      Serial: "SERIAL-123",
      Fingerprint: "google/shiba/shiba:15/AP3A"
    } as typeof Platform.constants);
    // Cards of this phone (an iPhone's token, say): nothing of them goes into the report.
    await markPushToken(CARD_A, TOKEN);
    await markPushToken(CARD_B, null);
    const id = await journal(
      1,
      {},
      [
        ["taken", 40, null],
        ["checking", 2_100, null],
        ["paying", 3_000, "automatic"],
        ["sent", 190_000, "completed"]
      ],
      { atMs: 191_000, tapCheck: "cardRoot" }
    );
    const report = cardWakesReport(await loadCardWakes(), null, new Date("2026-10-15T12:00:00Z"));
    const parsed = JSON.parse(report) as Record<string, unknown> & {
      wakes: Record<string, unknown>[];
    };
    expect(parsed).toMatchObject({
      report: "sattleme-android-card-wakes",
      version: 3,
      exportedAt: "2026-10-15T12:00:00.000Z",
      app: {
        variant: "staging",
        version: "3.0.0",
        buildNumber: "3000000",
        commit: "f82ecab",
        updateId: "0193"
      },
      phone: { os: "android", api: 35, release: "15", manufacturer: "Google", model: "Pixel 8" },
      socket: null
    });
    // Nothing of a push any more (version 3): Android is woken by its card socket only.
    for (const field of ["asks", "sealed"]) expect(parsed).not.toHaveProperty(field);
    for (const field of ["via", "sentAt", "originalPriority", "priority"]) {
      expect(parsed.wakes[0]).not.toHaveProperty(field);
    }
    expect(parsed.wakes[0]).toMatchObject({
      id,
      deliveryMs: 1_200,
      longestSilenceMs: 187_000,
      tapCheck: "cardRoot",
      outcome: { kind: "paid" }
    });
    expect(typeof parsed.wakes[0]!.startedAt).toBe("string");
    expect(typeof parsed.wakes[0]!.receivedAt).toBe("string");
    for (const secret of [TOKEN, CARD_A, CARD_B, "SERIAL-123", "shiba"]) {
      expect(report).not.toContain(secret);
    }
  });
});

describe('"Wake journal"', () => {
  jest.setTimeout(30_000);

  beforeEach(ownerDevice);

  it('opens from "Cards" in the Android staging app', async () => {
    jest.replaceProperty(Platform, "OS", "android");
    const { router } = await open("/cards");
    await fireEvent.press(await screen.findByTestId("cards-wakes", {}, READ));
    await waitFor(() => expect(router.getPathname()).toBe("/cards/wake-journal"));
    expect(await screen.findByTestId("wakes-screen")).toBeTruthy();
    // As wide as the screen, its content at the screen's gutter.
    expect(sideInsetsOf(screen.getByTestId("wakes-screen"))).toEqual({ left: 0, right: 0 });
    expect(sideInsetsOf(screen.getByTestId("wakes-how"))).toEqual({ left: gutter, right: gutter });
    expect(screen.getByTestId("wakes-empty")).toHaveTextContent("No wake yet.");
    // The card socket wakes this phone: its section says how.
    expect(screen.getByTestId("socket-row")).toBeTruthy();
    expect(screen.getByTestId("wakes-copy")).toBeDisabled();
  });

  it("shows the journal alone in a build without the card socket", async () => {
    jest.replaceProperty(Platform, "OS", "android");
    jest.spyOn(socketFeature, "cardSocketOffered").mockReturnValue(false);
    await open("/cards/wake-journal");
    expect(await screen.findByTestId("wakes-empty", {}, READ)).toBeTruthy();
    expect(screen.queryByTestId("socket-row")).toBeNull();
  });

  it("is offered nowhere else: not on an iPhone", async () => {
    await open("/cards");
    expect(await screen.findByTestId("cards-pair", {}, READ)).toBeTruthy();
    expect(screen.queryByTestId("cards-wakes")).toBeNull();
  });

  it("is offered nowhere else: not in the production app", async () => {
    jest.replaceProperty(Platform, "OS", "android");
    build.variant = "production";
    await open("/cards");
    expect(await screen.findByTestId("cards-pair", {}, READ)).toBeTruthy();
    expect(screen.queryByTestId("cards-wakes")).toBeNull();
  });

  it("says where it runs when opened elsewhere", async () => {
    await open("/cards/wake-journal");
    expect(
      await screen.findByText("This journal only exists in the staging app, on Android.")
    ).toBeTruthy();
    expect(screen.queryByTestId("wakes-copy")).toBeNull();
  });

  it("shows each wake: when, how it went, its measures and steps", async () => {
    jest.replaceProperty(Platform, "OS", "android");
    const paid = await journal(
      1,
      {},
      [
        ["taken", 40, null],
        ["checking", 2_100, null],
        ["paying", 3_000, "automatic"],
        ["sent", 190_000, "completed"]
      ],
      { atMs: 191_000, tapCheck: "cardRoot" }
    );
    const refused = await journal(
      2,
      {},
      [
        ["taken", 40, null],
        ["ready", 2_500, "newPayee"],
        ["failed", 27_500, "newPayee"]
      ],
      { atMs: 27_600, tapCheck: "cardRoot" }
    );
    const ignored = await journal(3, {}, [["notTaken", 30, null]], {
      atMs: 31,
      tapCheck: null
    });
    // Its task never wrote its end, long ago: the system stopped it.
    const stopped = await journal(
      4,
      { startedAt: Date.now() - CARD_WAKE_MAX_MS - 120_000 },
      [["paying", 3_000, "automatic"]],
      null
    );
    await open("/cards/wake-journal");

    const paidRow = within(await screen.findByTestId(`wake-${paid}`, {}, READ));
    expect(paidRow.getByText("Paid")).toBeTruthy();
    expect(
      paidRow.getByText(
        "task started 1.2 s after receipt · JS started 0.8 s before · longest silence 187 s"
      )
    ).toBeTruthy();
    expect(
      paidRow.getByText(
        "taken 0 · checking 2.1 · paying(automatic) 3 · sent(completed) 190 · tap(cardRoot)"
      )
    ).toBeTruthy();
    const refusedRow = within(screen.getByTestId(`wake-${refused}`));
    expect(refusedRow.getByText("Failed (newPayee)")).toBeTruthy();
    expect(within(screen.getByTestId(`wake-${ignored}`)).getByText("Ignored")).toBeTruthy();
    expect(
      within(screen.getByTestId(`wake-${stopped}`)).getByText("Interrupted (paying)")
    ).toBeTruthy();
  });

  it("copies the journal to hand it over, then clears it", async () => {
    jest.replaceProperty(Platform, "OS", "android");
    const id = await journal(1, {}, [["taken", 40, null]], { atMs: 50, tapCheck: null });
    await open("/cards/wake-journal");
    await fireEvent.press(await screen.findByTestId("wakes-copy", {}, READ));
    const copied = jest.mocked(Clipboard.setStringAsync).mock.calls.at(-1)?.[0] ?? "";
    expect(JSON.parse(copied)).toMatchObject({
      report: "sattleme-android-card-wakes",
      version: 3,
      wakes: [{ id, steps: [{ name: "taken" }] }]
    });
    expect(await screen.findByText("Journal copied")).toBeTruthy();

    await fireEvent.press(screen.getByTestId("wakes-clear"));
    expect(await screen.findByTestId("wakes-empty")).toBeTruthy();
    expect(await loadCardWakes()).toEqual([]);
  });

  it("says when the copy failed", async () => {
    jest.replaceProperty(Platform, "OS", "android");
    await journal(1, {}, [["taken", 40, null]], { atMs: 50, tapCheck: null });
    jest.mocked(Clipboard.setStringAsync).mockResolvedValueOnce(false);
    await open("/cards/wake-journal");
    await fireEvent.press(await screen.findByTestId("wakes-copy", {}, READ));
    expect(await screen.findByText("The copy failed")).toBeTruthy();
  });

  it("says when a newer app wrote the journal, and leaves it as it is", async () => {
    jest.replaceProperty(Platform, "OS", "android");
    const uri = `file:///data/user/0/ch.swissbitcoinpay.checkout.staging/files/${CARD_WAKES_DIR_NAME}/journal.json`;
    const newer = JSON.stringify({ version: 4, wakes: [] });

    fileSystem.files.set(uri, newer);
    await open("/cards/wake-journal");
    expect(await screen.findByTestId("wakes-failed", {}, READ)).toHaveTextContent(
      /This journal was written by a newer version of the app\./
    );
    expect(screen.queryByTestId("wakes-copy")).toBeNull();
    expect(fileSystem.files.get(uri)).toBe(newer);
  });
});

describe('"Persistent connection" (the card socket)', () => {
  jest.setTimeout(30_000);

  beforeEach(ownerDevice);

  /** A connection as the service holds it (CardSocketStatus.kt). */
  function connection(
    fields: Partial<typeof cardSocketState.connections extends Map<string, infer C> ? C : never>
  ) {
    return {
      host: "relay.sattle.me",
      state: "open" as const,
      stateSince: Date.now() - 120_000,
      lastMessageAt: Date.now() - 12_000,
      heartbeatSeconds: 240,
      opened: 1,
      failures: 0,
      lastFailure: null,
      nextAttemptAt: null,
      wakes: 0,
      lastWakeAt: null,
      ...fields
    };
  }

  it("is on by default, with how the phone's battery optimisation stands", async () => {
    jest.replaceProperty(Platform, "OS", "android");
    await open("/cards/wake-journal");
    const row = within(await screen.findByTestId("socket-row", {}, READ));
    expect(row.getByText("Persistent connection")).toBeTruthy();
    expect(row.getByText("On")).toBeTruthy();
    expect(screen.getByTestId("socket-switch")).toHaveProp("accessibilityState", {
      checked: true,
      disabled: false,
      busy: false
    });
    // No card yet: no relay to listen to, and no notification shown yet.
    expect(screen.getByTestId("socket-no-relay")).toHaveTextContent(
      "None of your cards' relays offers this connection yet."
    );
    expect(screen.queryByTestId("socket-notification")).toBeNull();
    expect(screen.getByTestId("socket-battery")).toHaveTextContent(
      "Battery optimisation applies to the app: Android may cut the connection."
    );
    await fireEvent.press(screen.getByTestId("socket-battery-settings"));
    await waitFor(() => expect(cardSocketState.batterySettingsOpened).toBe(1));
  });

  it("is turned off and on by its holder, the cards synced at once, in the app's language", async () => {
    jest.replaceProperty(Platform, "OS", "android");
    await open("/cards/wake-journal");
    await fireEvent.press(await screen.findByTestId("socket-switch", {}, READ));
    await waitFor(() => expect(cardSocketState.enabled).toBe(false));
    expect(await within(screen.getByTestId("socket-row")).findByText("Off", {}, READ)).toBeTruthy();
    await fireEvent.press(screen.getByTestId("socket-switch"));
    await waitFor(() => expect(cardSocketState.enabled).toBe(true));
    // The sync gave the service its relays (none yet) and the notification's texts.
    await waitFor(() =>
      expect(cardSocketState.texts).toEqual({
        channelName: "Card connection",
        title: "Card payments enabled",
        text: "Connected to your cards' relay to pay with the app closed",
        stop: "Stop"
      })
    );
    expect(await within(screen.getByTestId("socket-row")).findByText("On", {}, READ)).toBeTruthy();
  });

  it("offers to hide its notification once the service showed it, and says when it is hidden", async () => {
    jest.replaceProperty(Platform, "OS", "android");
    cardSocketState.relays = [{ host: "relay.sattle.me", heartbeatSeconds: 240 }];
    cardSocketState.texts = {
      channelName: "Card connection",
      title: "Card payments enabled",
      text: "Connected to your cards' relay to pay with the app closed",
      stop: "Stop"
    };
    cardSocketState.notification = "shown";
    await open("/cards/wake-journal");
    expect(await screen.findByTestId("socket-notification", {}, READ)).toHaveTextContent(
      "Android shows a notification while the connection is on. To hide it, turn off “Card connection” in the settings that open: the connection goes on."
    );
    const settings = screen.getByTestId("socket-notification-settings");
    expect(settings).toHaveTextContent("Hide the notification");
    await fireEvent.press(settings);
    await waitFor(() => expect(cardSocketState.notificationSettingsOpened).toBe(1));
  });

  it("says its notification is hidden, the connection going on", async () => {
    jest.replaceProperty(Platform, "OS", "android");
    cardSocketState.relays = [{ host: "relay.sattle.me", heartbeatSeconds: 240 }];
    cardSocketState.notification = "hidden";
    await open("/cards/wake-journal");
    expect(await screen.findByTestId("socket-notification", {}, READ)).toHaveTextContent(
      "Notification hidden: the connection goes on."
    );
    expect(screen.getByTestId("socket-notification-settings")).toHaveTextContent(
      "Notification settings"
    );
  });

  it("shows each relay's connection as the service holds it", async () => {
    jest.replaceProperty(Platform, "OS", "android");
    cardSocketState.relays = [{ host: "relay.sattle.me", heartbeatSeconds: 240 }];
    cardSocketState.texts = {
      channelName: "Card connection",
      title: "Card payments enabled",
      text: "Connected to your cards' relay to pay with the app closed",
      stop: "Stop"
    };
    cardSocketState.ignoringBatteryOptimizations = true;
    cardSocketState.connections.set(
      "relay.sattle.me",
      connection({ opened: 3, failures: 2, lastFailure: "closed1012", wakes: 4 })
    );
    await open("/cards/wake-journal");
    const line = await screen.findByTestId("socket-relay.sattle.me", {}, READ);
    expect(line).toHaveTextContent(/^relay\.sattle\.me · connected since /);
    expect(line).toHaveTextContent(
      / · last message 1\d s ago · 3 connections, 2 drops · last drop: closed1012 · 4 wakes$/
    );
    expect(screen.getByTestId("socket-service")).toHaveTextContent(
      "Service running (started: app)"
    );
    expect(screen.getByTestId("socket-battery")).toHaveTextContent(
      "Battery optimisation is off for the app."
    );
  });

  it("counts a single connection, cut and wake in the singular", async () => {
    jest.replaceProperty(Platform, "OS", "android");
    cardSocketState.relays = [{ host: "relay.sattle.me", heartbeatSeconds: 240 }];
    cardSocketState.connections.set(
      "relay.sattle.me",
      connection({ opened: 1, failures: 1, lastFailure: "network", wakes: 1 })
    );
    await open("/cards/wake-journal");
    const line = await screen.findByTestId("socket-relay.sattle.me", {}, READ);
    expect(line).toHaveTextContent(/ · 1 connection, 1 drop · last drop: network · 1 wake$/);
  });

  it("says its service does not run, never that no relay offers the connection", async () => {
    jest.replaceProperty(Platform, "OS", "android");
    cardSocketState.relays = [{ host: "relay.sattle.me", heartbeatSeconds: 240 }];
    // Android refused to start it: no connection in this process.
    cardSocketState.serviceDown = true;
    await open("/cards/wake-journal");
    expect(await screen.findByTestId("socket-service", {}, READ)).toHaveTextContent(
      "Service stopped"
    );
    expect(screen.queryByTestId("socket-no-relay")).toBeNull();
  });

  it("waits with the loader in its switch, none beside it, until it is turned off", async () => {
    jest.replaceProperty(Platform, "OS", "android");
    const setCardSocket = socketFeature.setCardSocket;
    let release!: () => void;
    const held = jest.spyOn(socketFeature, "setCardSocket").mockImplementationOnce(async (on) => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return setCardSocket(on);
    });
    try {
      await open("/cards/wake-journal");
      await fireEvent.press(await screen.findByTestId("socket-switch", {}, READ));
      const hidden = { includeHiddenElements: true };
      expect(await screen.findByTestId("socket-switch-spinner", hidden)).toBeTruthy();
      expect(screen.queryByTestId("socket-row-saving", hidden)).toBeNull();
      // Still on as it stands: turned off once the service is.
      expect(screen.getByTestId("socket-switch")).toHaveProp("accessibilityState", {
        checked: true,
        disabled: true,
        busy: true
      });
      release();
      await waitFor(() => expect(cardSocketState.enabled).toBe(false));
      expect(
        await within(screen.getByTestId("socket-row")).findByText("Off", {}, READ)
      ).toBeTruthy();
      await waitFor(() => expect(screen.queryByTestId("socket-switch-spinner", hidden)).toBeNull());
      expect(screen.getByTestId("socket-switch")).toHaveProp("accessibilityState", {
        checked: false,
        disabled: false,
        busy: false
      });
    } finally {
      held.mockRestore();
    }
  });

  it("says when it could not be turned off, and stays on", async () => {
    jest.replaceProperty(Platform, "OS", "android");
    cardSocketState.refusal = "State written by a newer app";
    await open("/cards/wake-journal");
    await fireEvent.press(await screen.findByTestId("socket-switch", {}, READ));
    expect(
      await screen.findByText("The persistent connection could not be changed", {}, READ)
    ).toBeTruthy();
    expect(cardSocketState.enabled).toBe(true);
    expect(within(screen.getByTestId("socket-row")).getByText("On")).toBeTruthy();
    expect(screen.getByTestId("socket-switch")).toHaveProp("accessibilityState", {
      checked: true,
      disabled: false,
      busy: false
    });
    expect(readLog().entries.map(({ event }) => event)).toContain(
      "Turning the card socket on or off failed"
    );
  });

  it("is offered nowhere else: not in the production app", async () => {
    jest.replaceProperty(Platform, "OS", "android");
    build.variant = "production";
    await open("/cards/wake-journal");
    expect(
      await screen.findByText("This journal only exists in the staging app, on Android.")
    ).toBeTruthy();
    expect(screen.queryByTestId("socket-row")).toBeNull();
  });
});
