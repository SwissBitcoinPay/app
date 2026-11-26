import "@/i18n";

import { act, fireEvent, renderRouter, screen, waitFor, within } from "expo-router/testing-library";
import { AppState, type AppStateStatus } from "react-native";

import WelcomeScreen from "@/app/index";
import RescueRoute from "@/app/rescue";
import { DEFAULT_CARD_RELAY_HOST } from "@/config/card";
import {
  closeAccount,
  getAccountWalletId,
  isAccountOpenedByWords
} from "@/features/account/session";
import { recordCardState, withCardAccess } from "@/features/card/states";
import { AUTO_LOCK_WARNING_MS } from "@/features/navigation/auto-lock";
import { closeRescue, isRescueOpen, RESCUE_IDLE_CLOSE_MS } from "@/features/rescue/rescue";
import { deriveBackupKeys } from "@/lib/backup/keys";
import { fetchBackup } from "@/lib/backup/settings-backup";
import { PasskeyError } from "@/lib/breez/errors";
import { signInWithPasskey } from "@/lib/breez/passkey";
import { walletSecret } from "@/lib/breez/seed";
import type { CardState } from "@/lib/card/card-record";

import {
  TEST_MNEMONIC,
  openCardHolderAccount,
  openMerchantAccount,
  testSeed
} from "../../jest/account";
import type * as BreezFake from "../../jest/breez-sdk";
import type * as FileSystemFake from "../../jest/expo-file-system";
import type * as RelaysFake from "../../jest/nostr-relays";

/*
 * "Open with my 12 words" (src/features/rescue/): offered once the passkey no longer opens the
 * account, the words typed and checked, then each wallet they open, emptied to one recipient; all
 * of it gone once the screen closes.
 */

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { extra: { breezNetwork: "mainnet" } } }
}));
// The passkey prompt is the test's; the wallet layer is the real one, over the fake SDK.
jest.mock("../lib/breez/passkey", () => ({
  createPasskeyWallet: jest.fn(),
  preparePasskeys: jest.fn(async () => undefined),
  passkeysReady: jest.fn(() => true),
  signInWithPasskey: jest.fn()
}));

const sdk = jest.requireMock<typeof BreezFake>("@breeztech/breez-sdk-spark-react-native");
const fileSystem = jest.requireMock<typeof FileSystemFake>("expo-file-system");
const relays = jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");
const signIn = jest.mocked(signInWithPasskey);
const apiKey = process.env.EXPO_PUBLIC_BREEZ_API_KEY;
const SLOW = { timeout: 10_000 };

const BTC_ADDRESS = "bc1qm4tz8s0xk7v9yfh3e5c2nq6wjr8ad2wz9";
const CARD = "30c19d9bfae333c1cb42a5ce6e20debb";

const routes = { index: WelcomeScreen, rescue: RescueRoute };

/** A card in service, named `name`, at its first wallet. */
function card(name: string): Omit<CardState, "updatedAt"> {
  return {
    cardId: CARD,
    uid: "04996c6a926980",
    keyVersion: 1,
    status: "active",
    relayHost: DEFAULT_CARD_RELAY_HOST,
    lastCounter: 0,
    depositedThrough: 0,
    maxPaymentSats: 20_000n,
    maxDaySats: 50_000n,
    maxPaymentsPerHour: 5,
    suspended: false,
    name,
    look: null,
    issuer: null,
    settingsAt: 1,
    walletGeneration: 1
  };
}

/**
 * The account opened by `open` backed up on the relays (`more` written while it is open), then
 * forgotten by this device: a new phone, where its owner types the words.
 */
async function accountOnRelaysOnly(open: () => Promise<void>, more?: () => Promise<void>) {
  const keys = deriveBackupKeys(walletSecret(testSeed()));
  await open();
  await more?.();
  await waitFor(async () => expect((await fetchBackup(keys)).newest).not.toBeNull());
  closeAccount();
  fileSystem.resetFileSystem();
}

/** The words typed, then "Open my account". */
async function typeWords(words = TEST_MNEMONIC) {
  await fireEvent.changeText(await screen.findByTestId("rescue-words-field"), words);
  await fireEvent.press(screen.getByTestId("rescue-words-submit"));
}

beforeEach(() => {
  process.env.EXPO_PUBLIC_BREEZ_API_KEY = "test-api-key";
  sdk.resetFakeWallet();
  sdk.resetFakeSend();
  sdk.fakeSend.inputs.set(BTC_ADDRESS, {
    tag: sdk.InputType_Tags.BitcoinAddress,
    inner: [{ address: BTC_ADDRESS, network: sdk.BitcoinNetwork.Bitcoin, source: {} }]
  });
  fileSystem.resetFileSystem();
  relays.resetRelays();
  closeAccount();
  signIn.mockReset();
  // The account's backup finds no relay of a test that wrote none: said in development only.
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(async () => {
  await closeRescue();
  process.env.EXPO_PUBLIC_BREEZ_API_KEY = apiKey;
  jest.restoreAllMocks();
});

describe("the offer", () => {
  it("shows on the welcome screen once the passkey no longer opens the account", async () => {
    signIn.mockRejectedValue(new PasskeyError("notAssociated", "Not associated"));
    const router = await renderRouter(routes, { initialUrl: "/" });

    await fireEvent.press(await screen.findByTestId("login"));
    await fireEvent.press(await screen.findByTestId("rescue-offer", {}, SLOW));

    expect(await screen.findByTestId("rescue-words")).toBeTruthy();
    expect(router).toHavePathname("/rescue");
  });

  it("is not shown for a dismissed prompt, which another try mends", async () => {
    signIn.mockRejectedValue(new PasskeyError("cancelled", "Dismissed"));
    await renderRouter(routes, { initialUrl: "/" });

    await fireEvent.press(await screen.findByTestId("login"));
    await waitFor(() => expect(signIn).toHaveBeenCalled());

    expect(screen.queryByTestId("rescue-offer")).toBeNull();
  });
});

describe("the words", () => {
  it("are counted as they are typed, then checked once 12 are there", async () => {
    await renderRouter(routes, { initialUrl: "/rescue" });
    const field = await screen.findByTestId("rescue-words-field");
    const words = TEST_MNEMONIC.split(" ");

    await fireEvent.changeText(field, words.slice(0, 5).join(" "));
    expect(screen.getByTestId("rescue-words-count")).toHaveTextContent("5 words of 12");
    expect(screen.getByTestId("rescue-words-submit")).toBeDisabled();

    await fireEvent.changeText(field, [...words.slice(0, 11), "abandon"].join(" "));
    // The icon's glyph before the text.
    expect(screen.getByTestId("rescue-words-problem")).toHaveTextContent(
      /These 12 words do not form a valid phrase: check each of them and their order/
    );
    expect(screen.getByTestId("rescue-words-submit")).toBeDisabled();

    await fireEvent.changeText(field, [...words.slice(0, 11), "abandn"].join(" "));
    expect(screen.getByTestId("rescue-words-problem")).toHaveTextContent(
      /Word 12 is not on the list: check its spelling/
    );

    await fireEvent.changeText(field, `1. ${words.join("  ").toUpperCase()}`);
    expect(screen.getByTestId("rescue-words-valid")).toBeTruthy();
    expect(screen.getByTestId("rescue-words-submit")).toBeEnabled();
  });
});

describe("a merchant's funds", () => {
  it("shows the account's wallet, and sends its whole balance to one address", async () => {
    await accountOnRelaysOnly(() => openMerchantAccount({ businessName: "Fine Bakery" }));
    sdk.fakeWallet.balanceSats = 50_000n;
    await renderRouter(routes, { initialUrl: "/rescue" });

    await typeWords();

    expect(await screen.findByTestId("rescue-funds", {}, SLOW)).toBeTruthy();
    expect(isAccountOpenedByWords()).toBe(true);
    expect(await screen.findByTestId("rescue-line-wallet-amount", {}, SLOW)).toHaveTextContent(
      /50.000 sats/
    );
    // A merchant's history can be exported.
    expect(screen.getByTestId("rescue-export")).toBeTruthy();

    await fireEvent.press(screen.getByTestId("rescue-line-wallet-drain"));
    const sheet = within(await screen.findByTestId("rescue-drain-sheet"));
    await fireEvent.changeText(
      await sheet.findByTestId("card-drain-recipient", {}, SLOW),
      BTC_ADDRESS
    );
    await fireEvent.press(await sheet.findByTestId("card-drain-confirm", {}, SLOW));
    expect(await sheet.findByTestId("card-drain-done", {}, SLOW)).toBeTruthy();
    expect(sdk.fakeWallet.balanceSats).toBe(0n);
    // No passkey asked: the words confirm it.
    expect(signIn).not.toHaveBeenCalled();

    await fireEvent.press(sheet.getByTestId("card-drain-finish"));
    expect(await screen.findByTestId("rescue-line-wallet-empty", {}, SLOW)).toBeTruthy();
  });

  it("opens \"Wallet\"'s export of the account's history", async () => {
    await accountOnRelaysOnly(() => openMerchantAccount({ businessName: "Fine Bakery" }));
    await renderRouter(routes, { initialUrl: "/rescue" });
    await typeWords();
    await fireEvent.press(await screen.findByTestId("rescue-export", {}, SLOW));

    const sheet = within(await screen.findByTestId("wallet-export", {}, SLOW));
    // Its activity read with no Lightning address known: the form shows once it is.
    expect(await sheet.findByTestId("wallet-export-form", {}, SLOW)).toBeTruthy();
    expect(sheet.getByTestId("wallet-export-submit")).toBeTruthy();
  });

  it("forgets everything the words opened once closed", async () => {
    await accountOnRelaysOnly(() => openMerchantAccount());
    const router = await renderRouter(routes, { initialUrl: "/rescue" });
    await typeWords();
    expect(await screen.findByTestId("rescue-funds", {}, SLOW)).toBeTruthy();

    await fireEvent.press(screen.getByTestId("rescue-close"));

    await waitFor(() => expect(getAccountWalletId()).toBeNull());
    expect(isRescueOpen()).toBe(false);
    expect(router).toHavePathname("/");
  });
});

describe("a card holder's funds", () => {
  it("shows each card's wallet, never a wallet of the account's own", async () => {
    await accountOnRelaysOnly(
      () => openCardHolderAccount(),
      () =>
        withCardAccess(async (access) => void (await recordCardState(access, card("Groceries"))))
    );
    sdk.fakeCardWallet(CARD).balanceSats = 2_100n;
    await renderRouter(routes, { initialUrl: "/rescue" });

    await typeWords();

    const line = await screen.findByTestId(`rescue-line-${CARD}/1`, {}, SLOW);
    expect(line).toHaveTextContent(/Card “Groceries”/);
    expect(await screen.findByTestId(`rescue-line-${CARD}/1-amount`, {}, SLOW)).toHaveTextContent(
      /2.100 sats/
    );
    expect(screen.queryByTestId("rescue-line-wallet")).toBeNull();
    expect(screen.queryByTestId("rescue-export")).toBeNull();
    expect(sdk.accountConnections.count).toBe(0);
  });
});

describe("the wallet of the words alone", () => {
  it("opens when no relay holds the account, and says where its cards are", async () => {
    sdk.fakeWallet.balanceSats = 7_000n;
    await renderRouter(routes, { initialUrl: "/rescue" });

    await typeWords();

    expect(await screen.findByTestId("rescue-funds", {}, SLOW)).toHaveTextContent(
      /No relay of this device knows your account/
    );
    expect(await screen.findByTestId("rescue-line-wallet-amount", {}, SLOW)).toHaveTextContent(
      /7.000 sats/
    );
    expect(screen.queryByTestId("rescue-export")).toBeNull();
    expect(getAccountWalletId()).toBeNull();
  });
});

describe("leaving the screen", () => {
  it("closes what the words opened, whatever way it is left", async () => {
    await accountOnRelaysOnly(() => openMerchantAccount());
    const rendered = await renderRouter(routes, { initialUrl: "/rescue" });
    await typeWords();
    expect(await screen.findByTestId("rescue-funds", {}, SLOW)).toBeTruthy();

    await act(async () => {
      rendered.unmount();
    });

    await waitFor(() => expect(isRescueOpen()).toBe(false));
    expect(getAccountWalletId()).toBeNull();
  });
});

describe("left alone", () => {
  /** The app's AppState listeners: the tests say when it goes to the background and comes back. */
  const appStateListeners = new Set<(state: AppStateStatus) => void>();
  async function appState(state: AppStateStatus) {
    await act(async () => {
      for (const listener of [...appStateListeners]) listener(state);
    });
  }
  async function advance(ms: number) {
    await act(async () => jest.advanceTimersByTimeAsync(ms));
  }
  const UNTIL_WARNING = RESCUE_IDLE_CLOSE_MS - AUTO_LOCK_WARNING_MS;
  const FEW_WORDS = TEST_MNEMONIC.split(" ").slice(0, 3).join(" ");

  beforeEach(() => {
    jest.useFakeTimers();
    appStateListeners.clear();
    jest.spyOn(AppState, "addEventListener").mockImplementation((type, listener) => {
      if (type !== "change") return { remove: () => undefined };
      const changed = listener as (state: AppStateStatus) => void;
      appStateListeners.add(changed);
      return { remove: () => appStateListeners.delete(changed) };
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("closes after 5 minutes without activity", () => {
    expect(RESCUE_IDLE_CLOSE_MS).toBe(5 * 60 * 1000);
  });

  it("counts nothing while the field is empty", async () => {
    await renderRouter(routes, { initialUrl: "/rescue" });
    expect(await screen.findByTestId("rescue-words-field")).toBeTruthy();

    await advance(2 * RESCUE_IDLE_CLOSE_MS);

    expect(screen.queryByTestId("notification")).toBeNull();
    expect(screen.queryByTestId("rescue-idle-closed")).toBeNull();
  });

  it("forgets the words typed, with a warning 30 s before", async () => {
    await renderRouter(routes, { initialUrl: "/rescue" });
    await fireEvent.changeText(await screen.findByTestId("rescue-words-field"), FEW_WORDS);

    await advance(UNTIL_WARNING - 1000);
    expect(screen.queryByTestId("notification")).toBeNull();
    await advance(1000);
    expect(screen.getByText("Closing in 30 s")).toBeTruthy();
    expect(
      screen.getByText(/Without activity, rescue mode closes and forgets your 12 words/)
    ).toBeTruthy();
    expect(screen.getByTestId("rescue-words-field").props.value).toBe(FEW_WORDS);

    await advance(AUTO_LOCK_WARNING_MS);

    expect(screen.getByTestId("rescue-words-field").props.value).toBe("");
    expect(screen.getByTestId("rescue-idle-closed")).toHaveTextContent(
      /Rescue mode closed after 5 minutes without activity/
    );
    await waitFor(() => expect(screen.queryByTestId("notification")).toBeNull());
    // Said until a word is typed again; from then the time counts again.
    await fireEvent.changeText(screen.getByTestId("rescue-words-field"), "legal");
    expect(screen.queryByTestId("rescue-idle-closed")).toBeNull();
  });

  it("starts the time again at each activity", async () => {
    await renderRouter(routes, { initialUrl: "/rescue" });
    const field = await screen.findByTestId("rescue-words-field");
    await fireEvent.changeText(field, FEW_WORDS);
    await advance(UNTIL_WARNING + 10_000);
    expect(screen.getByTestId("notification")).toBeTruthy();

    // A touch anywhere on the screen (its ActivityDetector) takes the warning away.
    const detector = screen.getByTestId("activity-detector");
    await act(async () => {
      detector.props.onStartShouldSetResponderCapture();
    });
    await waitFor(() => expect(screen.queryByTestId("notification")).toBeNull());
    await advance(UNTIL_WARNING - 1000);

    expect(screen.queryByTestId("notification")).toBeNull();
    expect(screen.getByTestId("rescue-words-field").props.value).toBe(FEW_WORDS);
  });

  it("closes what the words opened, the time in the background included", async () => {
    sdk.fakeWallet.balanceSats = 7_000n;
    await renderRouter(routes, { initialUrl: "/rescue" });
    await typeWords();
    expect(await screen.findByTestId("rescue-line-wallet-drain", {}, SLOW)).toBeTruthy();
    expect(isRescueOpen()).toBe(true);
    // "Empty" open, a recipient typed, not confirmed.
    await fireEvent.press(screen.getByTestId("rescue-line-wallet-drain"));
    const sheet = within(await screen.findByTestId("rescue-drain-sheet"));
    await fireEvent.changeText(
      await sheet.findByTestId("card-drain-recipient", {}, SLOW),
      BTC_ADDRESS
    );

    // The device left in the background, then picked up 6 minutes later: its timers stood still,
    // its clock did not.
    await appState("background");
    jest.setSystemTime(Date.now() + RESCUE_IDLE_CLOSE_MS + 60_000);
    await appState("active");

    await waitFor(() => expect(isRescueOpen()).toBe(false));
    expect(await screen.findByTestId("rescue-idle-closed")).toBeTruthy();
    expect(screen.getByTestId("rescue-words-field").props.value).toBe("");
    expect(screen.queryByTestId("rescue-funds")).toBeNull();
    expect(screen.queryByTestId("card-drain-confirm")).toBeNull();
    expect(sdk.fakeWallet.balanceSats).toBe(7_000n);
  });
});
