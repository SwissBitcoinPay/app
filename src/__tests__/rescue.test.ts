import "@/i18n";

import { waitFor } from "@testing-library/react-native";
import { t } from "i18next";

import { DEFAULT_CARD_RELAY_HOST } from "@/config/card";
import {
  closeAccount,
  getAccountWalletId,
  isAccountOpenedByWords
} from "@/features/account/session";
import { toUnlockFailure, unlockFailureMessage } from "@/features/account/usePasskeyAccount";
import { accountUnlocked } from "@/features/navigation/lock";
import {
  RescueClosedError,
  closeRescue,
  isRescueOpen,
  openRescue,
  readRescueWalletFunds,
  readRecoveryWords,
  readRescueCardFunds,
  rescueCardWallets,
  rescueWalletSource,
  walletOnlyRescueSeed,
  wordsProblem
} from "@/features/rescue/rescue";
import { deriveBackupKeys } from "@/lib/backup/keys";
import { fetchBackup } from "@/lib/backup/settings-backup";
import { walletSecret } from "@/lib/breez/seed";
import { cardWallet, disconnectWallet, isWalletConnected } from "@/lib/breez/wallet";
import type { CardState } from "@/lib/card/card-record";

import { TEST_MNEMONIC, TEST_WALLET_ID, openMerchantAccount, testSeed } from "../../jest/account";
import type * as BreezFake from "../../jest/breez-sdk";
import type * as FileSystemFake from "../../jest/expo-file-system";
import type * as RelaysFake from "../../jest/nostr-relays";

/*
 * "Open with my 12 words" (src/features/rescue/rescue.ts): the words typed, the account or its
 * wallet alone opened with them, never the app unlocked; each card's wallets found.
 */

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { extra: { breezNetwork: "mainnet" } } }
}));

const sdk = jest.requireMock<typeof BreezFake>("@breeztech/breez-sdk-spark-react-native");
const fileSystem = jest.requireMock<typeof FileSystemFake>("expo-file-system");
const relays = jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");
const apiKey = process.env.EXPO_PUBLIC_BREEZ_API_KEY;

const WORDS = TEST_MNEMONIC.split(" ");
const BTC_ADDRESS = "bc1qm4tz8s0xk7v9yfh3e5c2nq6wjr8ad2wz9";

/** The fake SDK reads BTC_ADDRESS as a Bitcoin address. */
function knowAddress() {
  sdk.fakeSend.inputs.set(BTC_ADDRESS, {
    tag: sdk.InputType_Tags.BitcoinAddress,
    inner: [{ address: BTC_ADDRESS, network: sdk.BitcoinNetwork.Bitcoin, source: {} }]
  });
}
const CARD = "30c19d9bfae333c1cb42a5ce6e20debb";
const OTHER_CARD = "0123456789abcdef0123456789abcdef";

/** A state of the card `cardId`, `status`, at its wallet's `walletGeneration`. */
function state(
  cardId: string,
  status: CardState["status"],
  walletGeneration: number,
  name = ""
): CardState {
  return {
    cardId,
    uid: "04996c6a926980",
    keyVersion: 1,
    status,
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
    walletGeneration,
    updatedAt: 1
  };
}

/** A merchant's account backed up on the relays, unknown to this device (as a new phone). */
async function accountOnRelaysOnly(): Promise<void> {
  const keys = deriveBackupKeys(walletSecret(testSeed()));
  await openMerchantAccount({ businessName: "Fine Bakery" });
  await waitFor(async () => expect((await fetchBackup(keys)).newest).not.toBeNull());
  closeAccount();
  fileSystem.resetFileSystem();
}

beforeEach(() => {
  process.env.EXPO_PUBLIC_BREEZ_API_KEY = "test-api-key";
  sdk.resetFakeWallet();
  sdk.resetFakeSend();
  fileSystem.resetFileSystem();
  relays.resetRelays();
  closeAccount();
});

afterEach(async () => {
  await closeRescue();
  process.env.EXPO_PUBLIC_BREEZ_API_KEY = apiKey;
  jest.restoreAllMocks();
});

describe("the words typed", () => {
  it("are read whatever their spacing, case and numbering", () => {
    expect(readRecoveryWords("  Legal\n winner\tTHANK  ")).toEqual(["legal", "winner", "thank"]);
    // As written down from "Recovery phrase", numbered.
    expect(readRecoveryWords("1. legal 2) winner 3:thank 10 year")).toEqual([
      "legal",
      "winner",
      "thank",
      "year"
    ]);
    expect(readRecoveryWords("   ")).toEqual([]);
  });

  it("are the app's phrase only: 12 words of the list, their checksum held", () => {
    expect(wordsProblem(WORDS)).toBeNull();
    expect(wordsProblem(WORDS.slice(0, 11))).toEqual({ code: "count", count: 11 });
    expect(wordsProblem([...WORDS, "about"])).toEqual({ code: "count", count: 13 });
    // 24 words are another wallet's, never this app's account.
    expect(wordsProblem([...WORDS, ...WORDS])).toEqual({ code: "count", count: 24 });
    const misspelt = [...WORDS];
    misspelt[4] = "abandonn";
    expect(wordsProblem(misspelt)).toEqual({ code: "unknown", position: 5 });
    // A word of the list in the wrong place: its checksum fails.
    const wrong = [...WORDS];
    wrong[11] = "abandon";
    expect(wordsProblem(wrong)).toEqual({ code: "checksum" });
  });
});

describe("opening the rescue", () => {
  it("opens the account of the words, which never unlocks the app", async () => {
    await accountOnRelaysOnly();

    const opened = await openRescue(WORDS, "Merchant");

    expect(opened).toMatchObject({ kind: "account", walletId: TEST_WALLET_ID });
    expect(opened.kind === "account" && opened.settings.businessName).toBe("Fine Bakery");
    expect(isAccountOpenedByWords()).toBe(true);
    expect(isRescueOpen()).toBe(true);
    expect(accountUnlocked(TEST_WALLET_ID)).toBe(false);
    await expect(rescueWalletSource(TEST_WALLET_ID).confirm()).resolves.toBeUndefined();

    await closeRescue();
    expect(getAccountWalletId()).toBeNull();
    expect(isRescueOpen()).toBe(false);
    // The words no longer confirm anything once it closed.
    await expect(rescueWalletSource(TEST_WALLET_ID).confirm()).rejects.toBeInstanceOf(
      RescueClosedError
    );
  });

  it("opens the wallet of the words alone when no relay holds the account", async () => {
    const opened = await openRescue(WORDS, "Merchant");

    expect(opened).toEqual({ kind: "walletOnly", walletId: TEST_WALLET_ID });
    expect(getAccountWalletId()).toBeNull();
    expect(walletOnlyRescueSeed()).not.toBeNull();
    expect(isRescueOpen()).toBe(true);
    await expect(rescueWalletSource(TEST_WALLET_ID).confirm()).resolves.toBeUndefined();

    await closeRescue();
    expect(walletOnlyRescueSeed()).toBeNull();
    expect(isRescueOpen()).toBe(false);
  });

  it("refuses what is not the app's phrase, and opens nothing", async () => {
    await expect(openRescue(WORDS.slice(1), "Merchant")).rejects.toThrow(
      "Not a recovery phrase of the app"
    );
    expect(isRescueOpen()).toBe(false);
  });

  it("opens nothing in a build without its wallet's configuration", async () => {
    delete process.env.EXPO_PUBLIC_BREEZ_API_KEY;

    await expect(openRescue(WORDS, "Merchant")).rejects.toMatchObject({ code: "notConfigured" });
    expect(isRescueOpen()).toBe(false);
  });

  it("leaves a passkey's account alone when it closes", async () => {
    await openMerchantAccount();

    await closeRescue();

    expect(getAccountWalletId()).toBe(TEST_WALLET_ID);
  });
});

describe("the cards' wallets found", () => {
  it("are each card's current one, then its earlier ones; a deleted card's are all earlier", () => {
    expect(
      rescueCardWallets([
        state(CARD, "active", 3, "Groceries"),
        state(OTHER_CARD, "deleted", 1, "Travel")
      ])
    ).toEqual([
      { wallet: { cardId: CARD, walletGeneration: 3 }, name: "Groceries", current: true },
      { wallet: { cardId: CARD, walletGeneration: 2 }, name: "Groceries", current: false },
      { wallet: { cardId: CARD, walletGeneration: 1 }, name: "Groceries", current: false },
      { wallet: { cardId: OTHER_CARD, walletGeneration: 1 }, name: "Travel", current: false }
    ]);
    // A card whose programming stopped still pays from its current wallet once added again.
    expect(rescueCardWallets([state(CARD, "reset", 2)])[0]).toMatchObject({ current: true });
  });

  it("are read once synced, their deposits on their way told apart", async () => {
    await accountOnRelaysOnly();
    await openRescue(WORDS, "Merchant");
    sdk.fakeCardWallet(CARD).balanceSats = 2_100n;
    sdk.fakeCardWallet(CARD).unclaimedDeposits = [
      {
        txid: "ab".repeat(32),
        vout: 0,
        amountSats: 30_000n,
        isMature: false,
        refundTx: undefined,
        refundTxId: undefined,
        claimError: undefined,
        instantClaimStatus: undefined
      }
    ];

    await expect(readRescueCardFunds({ cardId: CARD, walletGeneration: 1 })).resolves.toEqual({
      sats: 2_100n,
      arrivingSats: 30_000n
    });
    // Released once read.
    expect(cardWallet(CARD, 1).isConnected()).toBe(false);
  });

  it("are never told empty when they could not be read", async () => {
    await accountOnRelaysOnly();
    await openRescue(WORDS, "Merchant");
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    // Its wallet does not connect (offline, the SDK refusing).
    sdk.connect.mockRejectedValueOnce(new Error("offline"));

    await expect(readRescueCardFunds({ cardId: CARD, walletGeneration: 1 })).resolves.toBeNull();
  });
});

describe("the wallet of the words", () => {
  it("is read once synced, the account's own for a merchant", async () => {
    await accountOnRelaysOnly();
    await openRescue(WORDS, "Merchant");
    sdk.fakeWallet.balanceSats = 120_000n;

    await expect(readRescueWalletFunds(TEST_WALLET_ID)).resolves.toEqual({
      sats: 120_000n,
      arrivingSats: 0n
    });
    expect(isWalletConnected()).toBe(true);
  });

  it("is read without account when no relay holds it", async () => {
    await openRescue(WORDS, "Merchant");
    sdk.fakeWallet.balanceSats = 7_000n;

    await expect(readRescueWalletFunds(TEST_WALLET_ID)).resolves.toEqual({
      sats: 7_000n,
      arrivingSats: 0n
    });
  });

  it("is never connected for another wallet than the words'", async () => {
    await openRescue(WORDS, "Merchant");

    await expect(readRescueWalletFunds(`03${"ab".repeat(32)}`)).rejects.toMatchObject({
      code: "notConnected"
    });
    expect(isWalletConnected()).toBe(false);
  });

  it("sends its whole balance away, connected again when it was closed meanwhile", async () => {
    knowAddress();
    await openRescue(WORDS, "Merchant");
    sdk.fakeWallet.balanceSats = 50_000n;
    const source = rescueWalletSource(TEST_WALLET_ID);
    const destination = await source.parseSendInput(BTC_ADDRESS);
    // "Export" closed it, as its sheet does once it closes.
    await disconnectWallet();

    const quote = await source.prepareDrain(destination, 50_000n);
    await source.confirm();
    await source.sendPrepared(quote, {
      speed: "slow",
      idempotencyKey: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d"
    });

    expect(sdk.fakeWallet.balanceSats).toBe(0n);
  });

  it("sends nothing once the rescue closed", async () => {
    knowAddress();
    await openRescue(WORDS, "Merchant");
    const source = rescueWalletSource(TEST_WALLET_ID);
    await closeRescue();

    const error = await source.confirm().catch((thrown: unknown) => thrown);
    expect(error).toBeInstanceOf(RescueClosedError);
    await expect(source.parseSendInput(BTC_ADDRESS)).rejects.toBeInstanceOf(RescueClosedError);
    // Said as such, never as a passkey's failure: none is asked in this mode.
    expect(unlockFailureMessage(toUnlockFailure(error)!, t)).toBe(
      "Rescue mode closed: nothing was sent. Open it again with your 12 words."
    );
  });
});
