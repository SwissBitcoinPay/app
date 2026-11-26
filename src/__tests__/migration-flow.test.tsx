import "@/i18n";

import { router as appRouter } from "expo-router";
import { act, fireEvent, renderRouter, screen, waitFor } from "expo-router/testing-library";
import { Platform } from "react-native";

import LaunchScreen from "@/app/index";
import JoinScreen from "@/app/join";
import MigrationLayout from "@/app/migration/_layout";
import MigrationChangesScreen from "@/app/migration/changes";
import MigrationDoneScreen from "@/app/migration/done";
import MigrationEmployeeScreen from "@/app/migration/employee";
import MigrationForgotScreen from "@/app/migration/forgot";
import MigrationScreen from "@/app/migration/index";
import MigrationPasswordScreen from "@/app/migration/password";
import MigrationWordsScreen from "@/app/migration/words";
import OnboardingLayout from "@/app/onboarding/_layout";
import BankScreen from "@/app/onboarding/bank";
import SetupScreen from "@/app/onboarding/setup";
import SplitScreen from "@/app/onboarding/split";
import PendingScreen from "@/app/pending";
import { closeAccount } from "@/features/account/session";
import { resetMigration } from "@/features/migration/flow";
import { isFreezeOwed } from "@/features/migration/freeze";
import { parseHistoryOwed } from "@/lib/legacy-v2/history-owed-format";
import { readHistoryOwedText } from "@/lib/legacy-v2/history-owed-store";
import { resetLegacyState } from "@/features/migration/legacy-state";
import {
  eraseLegacyWallet,
  transferLegacyWallet,
  transferTypedWords
} from "@/features/migration/transfer";
import { ownsLegacyWallet } from "@/features/migration/wallet-owner";
import { LEGACY_KEYS } from "@/lib/legacy-v2/data";
import { getWalletLightningAddress } from "@/lib/breez/wallet";
import { signInWithPasskey } from "@/lib/breez/passkey";
import { loadMerchantSettings } from "@/lib/settings/store";

import { acceptPassword, acceptSession, hold, legacyV2 } from "../../jest/legacy-v2-server";
import type * as FileSystemFake from "../../jest/expo-file-system";
import type * as MtPelerinFake from "../../jest/mtpelerin";
import type * as RelaysFake from "../../jest/nostr-relays";
import { keychain, putLegacyValue } from "../../jest/react-native-keychain";

/*
 * The migration of a device the v2 app (Swiss Bitcoin Pay) used, screen by screen
 * (src/app/migration/): over the v2 app's keychain (jest/react-native-keychain.ts) and the fake v2
 * server (jest/legacy-v2-server.ts). The passkey and the wallet are mocked as in
 * signup-flow.test.tsx; the v2 wallet's transfer is migration-transfer.test.ts's.
 */

jest.mock("../lib/breez/passkey", () => ({
  createPasskeyWallet: jest.fn(async () => ({
    seed: { tag: "Mnemonic", inner: { mnemonic: "test seed", passphrase: undefined } },
    credentialId: null
  })),
  signInWithPasskey: jest.fn(async () => ({
    seed: { tag: "Mnemonic", inner: { mnemonic: "test seed", passphrase: undefined } },
    credentialId: null
  })),
  preparePasskeys: jest.fn(async () => undefined),
  passkeysReady: jest.fn(() => true)
}));
const WALLET = "02c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5";
jest.mock("../lib/breez/wallet", () => ({
  checkWalletConfig: jest.fn(),
  connectWallet: jest.fn(async () => ({})),
  disconnectWallet: jest.fn(async () => undefined),
  getWalletId: jest.fn(async () => WALLET),
  getWalletLightningAddress: jest.fn(async () => "sattleme02c6047f94@breez.tips"),
  newDepositAddress: jest.fn(),
  walletIdOf: jest.fn(async () => WALLET)
}));
jest.mock("../features/migration/transfer", () => ({
  transferLegacyWallet: jest.fn(),
  eraseLegacyWallet: jest.fn(async () => true),
  transferTypedWords: jest.fn(),
  typedLegacyWords: jest.requireActual("../features/migration/transfer").typedLegacyWords,
  subscribeLegacyTransfers: jest.fn(() => () => undefined),
  checkLegacyWallet: jest.fn(async () => ({ status: "none" })),
  resetLegacyWalletCheck: jest.fn()
}));
// The done screen connects the account's wallet for the transfer: here, at once.
jest.mock("../features/account/wallet-access", () => ({
  ...jest.requireActual("../features/account/wallet-access"),
  useAccountWallet: () => ({ connected: true, open: async () => undefined, failure: null }),
  isAccountWalletOpen: () => true
}));

const fileSystem = jest.requireMock<typeof FileSystemFake>("expo-file-system");
const relays = jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");

const routes = {
  index: LaunchScreen,
  join: JoinScreen,
  pending: PendingScreen,
  "pos/index": PendingScreen,
  employees: PendingScreen,
  integrations: PendingScreen,
  "cards/index": PendingScreen,
  "migration/_layout": MigrationLayout,
  "migration/index": MigrationScreen,
  "migration/forgot": MigrationForgotScreen,
  "migration/password": MigrationPasswordScreen,
  "migration/done": MigrationDoneScreen,
  "migration/changes": MigrationChangesScreen,
  "migration/employee": MigrationEmployeeScreen,
  "migration/words": MigrationWordsScreen,
  "onboarding/_layout": OnboardingLayout,
  "onboarding/split": SplitScreen,
  "onboarding/bank": BankScreen,
  "onboarding/setup": SetupScreen
};

/** Mt Pelerin's login and the bank step: several screens and panels. */
const SLOW = { timeout: 5000 };

const ACCOUNT_ID = "0192a3b4-c5d6-7e8f-9a0b-1c2d3e4f5a6b";
const IBAN = "CH9300762011623852957";
const REFRESH = "refresh-of-the-v2-app-0001";
const WORDS = "legal winner thank year wave sausage worth useful legal winner thank yellow";
/** The new account's Lightning address (the wallet's mock above). */
const LIGHTNING_ADDRESS = "sattleme02c6047f94@breez.tips";
/** A reset link's code, as the v2 server makes them (a UUID v7). */
const RESET_CODE = "0192a3b4-c5d6-7e8f-9a0b-1c2d3e4f5a00";

/** What the v2 app 2.7 left on an owner's phone. */
function v2Owner({ wallet = true, mail }: { wallet?: boolean; mail?: string } = {}) {
  putLegacyValue(LEGACY_KEYS.userType, "admin");
  putLegacyValue(
    LEGACY_KEYS.accountConfig,
    JSON.stringify({
      id: ACCOUNT_ID,
      name: "Lakeside Bakery",
      currency: "CHF",
      is_onchain_available: true,
      invoice_key: "k".repeat(32),
      ...(mail ? { mail } : {})
    })
  );
  putLegacyValue(
    LEGACY_KEYS.tokens,
    JSON.stringify({ auth_token: "expired-token-of-the-v2-app", refresh_token: REFRESH })
  );
  if (wallet) putLegacyValue(LEGACY_KEYS.mnemonic, WORDS, true);
}

/** BIP-84's "Account 0 root" of "abandon … about", as the v2 app gave it to the v2 server. */
const LOCAL_ZPUB =
  "zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs";

/**
 * The full answer of the v2 server's GET /account: 40 % bitcoin, the rest to a bank; the bitcoin
 * to a wallet the v2 app created (`local`), unless `wallets` says otherwise, which holds
 * `walletSats` by the v2 server's index (`xpub-balance`).
 */
function v2Account({
  wallets = [{ address: LOCAL_ZPUB, walletConfig: { type: "local", zpub: LOCAL_ZPUB } }],
  walletSats = 70_000
}: { wallets?: unknown[]; walletSats?: number } = {}) {
  legacyV2.balances.set(LOCAL_ZPUB, {
    confirmed_sat: walletSats,
    unconfirmed_sat: 0,
    complete: true
  });
  legacyV2.account = {
    id: ACCOUNT_ID,
    name: "Lakeside Bakery",
    currency: "CHF",
    bank_currency: "CHF",
    btc_percent: 40,
    is_onchain_available: true,
    iban: IBAN,
    owner_name: "Carol Smith",
    owner_address: "1 Lake Street",
    owner_complement: null,
    owner_city: "Lausanne",
    owner_country: "CH",
    owner_zip: "1003",
    bank_reference: null,
    mail: "carol@example.com",
    verified_addresses: wallets
  };
}

/**
 * "Your account is up to date"'s offer of the v2 wallet on this device (LegacyTransferSheet.tsx),
 * then "Move".
 */
async function startTransfer() {
  await showTransferSheet();
  await fireEvent.press(screen.getByTestId("migration-transfer-start"));
}

/**
 * The offer's panel once it shows: measured (Jest has no layout), the bottom sheet stays
 * transparent until then (Sheet.tsx).
 */
async function showTransferSheet() {
  await waitFor(() =>
    expect(
      screen.getByTestId("migration-transfer-sheet", { includeHiddenElements: true })
    ).toBeTruthy()
  );
  await fireEvent(
    screen.getByTestId("migration-transfer-sheet", { includeHiddenElements: true }),
    "layout",
    { nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 560 } } }
  );
  await waitFor(() => expect(screen.getByTestId("migration-transfer-start")).toBeTruthy());
}

/**
 * The v2 account's card read (its payouts on it), then "Migrate", then the bank step when the v2
 * share has one (confirmBankStep).
 */
async function migrate() {
  await waitFor(() => expect(screen.getByTestId("migration-confirm-split")).toBeTruthy());
  await waitFor(() => expect(screen.getByTestId("migration-migrate")).toBeEnabled());
  await fireEvent.press(screen.getByTestId("migration-migrate"));
  // Where the creation leads: the done screen, the bank step, the split, or a failure on the card.
  await waitFor(
    () =>
      expect(
        screen.queryByTestId("migration-done") ??
          screen.queryByTestId("mtpelerin-create") ??
          screen.queryByTestId("split-slider") ??
          screen.queryByTestId("migration-failure")
      ).toBeTruthy(),
    SLOW
  );
  if (screen.queryByTestId("mtpelerin-create")) await confirmBankStep();
}

/**
 * The bank step of a v2 share in a bank (plan.ts): Mt Pelerin's
 * login (the staging app's under Jest: the account's key, then a fictitious e-mail and number),
 * then the v2 bank account, prefilled, its holder's kind chosen (the v2 server said one name).
 */
async function confirmBankStep() {
  await fireEvent.press(await screen.findByTestId("mtpelerin-create", {}, SLOW));
  await fireEvent.changeText(
    await screen.findByTestId("sell-email", {}, SLOW),
    "carol@example.com"
  );
  await fireEvent.changeText(screen.getByTestId("sell-profile-phone"), "79 000 00 00");
  await fireEvent.press(screen.getByTestId("sell-save-profile"));
  await screen.findByTestId("mtpelerin-connected", {}, SLOW);
  await fireEvent.press(screen.getByTestId("bank-holder-person"));
  await fireEvent.press(screen.getByTestId("bank-submit"));
}

/** After "Migrate": the bank step when the v2 share has one, then the done screen. */
async function reachDone(router: { getPathname(): string }) {
  await waitFor(
    () => expect(["/onboarding/bank", "/migration/done"]).toContain(router.getPathname()),
    SLOW
  );
  if (router.getPathname() === "/onboarding/bank") await confirmBankStep();
  await waitFor(() => expect(router.getPathname()).toBe("/migration/done"), SLOW);
}

/** The password asked on the card, the v2 app's session not serving (or none). */
async function passwordAsked() {
  await waitFor(() => expect(screen.getByTestId("migration-password")).toBeTruthy());
}

async function savedSettings() {
  const settings = await loadMerchantSettings(WALLET);
  if (!settings) return null;
  const { updatedAt: _at, ...rest } = settings;
  return rest;
}

beforeEach(() => {
  fileSystem.resetFileSystem();
  relays.resetRelays();
  closeAccount();
  resetLegacyState();
  resetMigration();
  jest.mocked(transferLegacyWallet).mockResolvedValue({
    status: "sent",
    txid: "a".repeat(64),
    outputSats: 49_000n,
    feeSats: 1_000n,
    waitingSats: 0n
  });
  jest.mocked(transferTypedWords).mockResolvedValue({
    status: "sent",
    txid: "b".repeat(64),
    outputSats: 70_000n,
    feeSats: 1_000n,
    waitingSats: 0n
  });
});

describe("an owner's device", () => {
  it("opens on the migration in place of the welcome screen", async () => {
    v2Owner();
    const router = await renderRouter(routes, { initialUrl: "/" });
    await waitFor(() => expect(router.getPathname()).toBe("/migration"));

    // What the v2 app left, at once: the business, the brand it comes from, the money following.
    expect(screen.getByText("Hello, Lakeside Bakery")).toBeTruthy();
    expect(screen.getByTestId("migration-badge")).toHaveTextContent(
      /Swiss\sBitcoin\sPay becomes sattle\.me/
    );
    expect(screen.getByTestId("migration-confirm-name")).toHaveTextContent("Lakeside Bakery");
    expect(screen.getByTestId("migration-confirm-currency")).toHaveTextContent(/CHF/);
    expect(screen.getByTestId("migration-home-money")).toBeTruthy();
    expect(screen.queryByTestId("create-account")).toBeNull();
    // Its session refused here: the password, on the card, before any payout is said.
    await passwordAsked();
    expect(screen.getByTestId("migration-confirm-pending")).toHaveTextContent(
      /After your password/
    );
    expect(screen.queryByTestId("migration-confirm-split")).toBeNull();
    expect(screen.queryByTestId("migration-migrate")).toBeNull();
  });

  it("does not promise the money without a wallet of the v2 app on the device", async () => {
    v2Owner({ wallet: false });
    await renderRouter(routes, { initialUrl: "/migration" });
    await waitFor(() => expect(screen.getByTestId("migration-confirm-card")).toBeTruthy());
    expect(screen.queryByTestId("migration-home-money")).toBeNull();
  });

  it("updates: the account read with the v2 session and confirmed, created done, the v2 account frozen, the money moved", async () => {
    v2Owner();
    v2Account();
    acceptSession(REFRESH);
    const releaseAccount = hold("/account");
    const router = await renderRouter(routes, { initialUrl: "/migration" });
    // The card at once, from the v2 app's copy; the v2 account read meanwhile, without a tap.
    await waitFor(() => expect(screen.getByTestId("migration-confirm-pending")).toBeTruthy());
    expect(screen.getByTestId("migration-confirm-name")).toHaveTextContent("Lakeside Bakery");
    expect(screen.getByTestId("migration-confirm-pending")).toHaveTextContent(/Reading…/);
    // Nothing said of the payouts nor offered before the v2 server answers.
    expect(screen.queryByTestId("migration-confirm-split")).toBeNull();
    expect(screen.queryByTestId("migration-confirm-freeze")).toBeNull();
    expect(screen.getByTestId("migration-migrate")).toBeDisabled();
    expect(screen.queryByTestId("migration-confirm-other")).toBeNull();
    expect(screen.queryByTestId("migration-password")).toBeNull();
    // No "Account already updated": a migrated account is said once read.
    expect(screen.queryByTestId("migration-already")).toBeNull();

    await act(async () => releaseAccount());
    await waitFor(() => expect(screen.getByTestId("migration-confirm-split")).toBeTruthy());
    expect(router.getPathname()).toBe("/migration");
    expect(screen.getByTestId("migration-home-read")).toHaveTextContent(
      /Read from your Swiss\sBitcoin\sPay account/
    );
    // What sattle.me takes of it, to be recognised; the freeze said before the passkey.
    expect(screen.getByTestId("migration-confirm-name")).toHaveTextContent("Lakeside Bakery");
    expect(screen.getByTestId("migration-confirm-email")).toHaveTextContent("carol@example.com");
    expect(screen.getByTestId("migration-confirm-currency")).toHaveTextContent(/CHF/);
    expect(screen.getByTestId("migration-confirm-split")).toHaveTextContent(
      /40\s?%\sbitcoin · 60\s?%\sbank/
    );
    expect(screen.getByTestId("migration-confirm-iban")).toHaveTextContent(/CH93 •••• 2957/);
    expect(screen.getByTestId("migration-confirm-holder")).toHaveTextContent(/Carol Smith/);
    expect(screen.getByTestId("migration-confirm-freeze")).toHaveTextContent(
      /stops accepting payments/
    );
    // Nothing asked of the v2 server's migration before the account exists.
    expect(legacyV2.migratedTo).toBeNull();

    // One tap: "Migrate" asks for the passkey at once.
    await fireEvent.press(screen.getByTestId("migration-migrate"));
    await reachDone(router);

    // The account, created with the v2 account's business and payout, its sign-up done.
    expect(await savedSettings()).toMatchObject({
      signUp: "done",
      usage: "merchant",
      businessName: "Lakeside Bakery",
      displayCurrency: "CHF",
      payoutCurrency: "CHF",
      bitcoinPercent: 40,
      onchainPayments: true,
      // Mt Pelerin's id of the v2 account registered there (its kind chosen at the bank step, the
      // v2 name split as typed, plan.ts): never its details.
      payoutAccountId: jest
        .requireMock<typeof MtPelerinFake>("@/lib/mtpelerin/transport")
        .testMtPelerin()
        .accountsOfUser()
        .find((account) => account.iban === IBAN)?.id
    });
    expect(await savedSettings()).not.toHaveProperty("bank");
    // The v2 session: renewed, the account read, then frozen for the new account's Lightning
    // address, its history copied (the account's name read again first: its notes), then
    // closed; never with an API key.
    await waitFor(() => expect(legacyV2.loggedOut).toEqual([REFRESH]));
    // The wallet's balance read beside, anonymously, for the offer of its transfer.
    const calls = legacyV2.calls.map(({ method, path }) => `${method} ${path}`);
    expect(calls.filter((call) => call !== "GET /v1/accounts/xpub-balance")).toEqual([
      "POST /api/auth/v1/refresh",
      "GET /account",
      "POST /v1/accounts/migrate",
      "GET /account",
      "GET /api/records/v1/apipayments",
      "POST /api/auth/v1/logout"
    ]);
    expect(calls.filter((call) => call === "GET /v1/accounts/xpub-balance")).toHaveLength(1);
    expect(legacyV2.migratedTo).toBe(LIGHTNING_ADDRESS);
    // Noted owed at the account's creation, forgotten once frozen: "Settings" offers nothing.
    await expect(isFreezeOwed(WALLET)).resolves.toBe(false);
    expect(screen.getByTestId("migration-freeze-done")).toHaveTextContent(
      /Old account frozenIt no longer accepts payments\. Funds transferred to your new sattle\.me wallet\.$/
    );
    // In a few words: never the Lightning address the money went to.
    expect(screen.getByTestId("migration-freeze-done")).not.toHaveTextContent(/breez\.tips/);
    // The v2 app's session and role forgotten on the device, its wallet's words kept.
    await waitFor(() => expect([...keychain.entries.keys()]).toEqual([LEGACY_KEYS.mnemonic]));

    // The words the v2 app left go to this account only (wallet-owner.ts).
    await expect(ownsLegacyWallet(WALLET)).resolves.toBe(true);
    // Their transfer offered at once, with what the v2 server's index says the wallet holds, and
    // that the words go from the phone in any case; nothing asked of the words before a tap.
    await showTransferSheet();
    expect(screen.getByTestId("migration-transfer-sheet")).toHaveTextContent(
      /Move your old wallet\?/
    );
    expect(screen.getByTestId("migration-transfer-amount")).toHaveTextContent(/70.000 sats/);
    expect(screen.getByTestId("migration-transfer-erase-note")).toHaveTextContent(
      /The 12 words are then erased from this phone's memory, moved or not\./
    );
    expect(transferLegacyWallet).not.toHaveBeenCalled();
    expect(screen.queryByTestId("migration-finish")).toBeNull();
    await fireEvent.press(screen.getByTestId("migration-transfer-start"));

    // The money moved, with the app's prompt over the words.
    await waitFor(() => expect(screen.getByTestId("migration-transfer-sent")).toBeTruthy());
    expect(transferLegacyWallet).toHaveBeenCalledTimes(1);
    expect(jest.mocked(transferLegacyWallet).mock.calls[0]![0]).toEqual({
      title: "Open your old wallet",
      cancel: "Cancel"
    });
    expect(screen.getByTestId("migration-transfer-sent")).toHaveTextContent(
      /0\.00049 BTC on its way to your new account/
    );
    // English quotes, no spaces inside them (the app's typography).
    expect(screen.getByTestId("migration-done-business")).toHaveTextContent(
      /sattle\.me account created“Lakeside Bakery” is ready to accept payments\.$/
    );

    await fireEvent.press(screen.getByTestId("migration-finish"));
    await waitFor(() => expect(router.getPathname()).toBe("/pos"));
  });

  it("asks the split after the creation when the v2 server did not say the share, then ends the migration", async () => {
    // The split as a new merchant's sign-up.
    v2Owner();
    v2Account();
    legacyV2.account = { ...legacyV2.account!, btc_percent: null };
    acceptSession(REFRESH);
    const router = await renderRouter(routes, { initialUrl: "/migration" });
    await waitFor(() => expect(screen.getByTestId("migration-confirm-to-choose")).toBeTruthy());
    expect(screen.getByTestId("migration-confirm-to-choose")).toHaveTextContent(
      /To choose once the account is created/
    );
    // No share said as if it were final; the v2 bank account read, for the bank step's form.
    expect(screen.queryByTestId("migration-confirm-split")).toBeNull();
    expect(screen.getByTestId("migration-confirm-iban")).toHaveTextContent(/CH93 •••• 2957/);
    await waitFor(() => expect(screen.getByTestId("migration-migrate")).toBeEnabled());

    await fireEvent.press(screen.getByTestId("migration-migrate"));

    await waitFor(() => expect(router.getPathname()).toBe("/onboarding/split"));
    expect(await savedSettings()).toMatchObject({
      signUp: "split",
      usage: "merchant",
      bitcoinPercent: 100,
      payoutAccountId: null
    });
    expect(screen.getByTestId("split-slider").props.accessibilityValue.text).toBe(
      "100% in bitcoin, 0% in Swiss francs"
    );
    // Half in francs: the bank step, Mt Pelerin first, then the v2 bank account prefilled.
    const bar = screen.getByTestId("split-slider");
    await fireEvent(bar, "layout", {
      nativeEvent: { layout: { x: 0, y: 0, width: 200, height: 96 } }
    });
    await fireEvent(bar, "responderGrant", { nativeEvent: { pageX: 100, locationX: 100 } });
    await fireEvent(bar, "responderRelease", { nativeEvent: { pageX: 100, locationX: 100 } });
    await fireEvent.press(screen.getByTestId("split-continue"));
    await waitFor(() => expect(router.getPathname()).toBe("/onboarding/bank"));
    // Not frozen before the sign-up's end.
    expect(legacyV2.migratedTo).toBeNull();
    await fireEvent.press(await screen.findByTestId("mtpelerin-create", {}, SLOW));
    await fireEvent.changeText(
      await screen.findByTestId("sell-email", {}, SLOW),
      "carol@example.com"
    );
    await fireEvent.changeText(screen.getByTestId("sell-profile-phone"), "79 000 00 00");
    await fireEvent.press(screen.getByTestId("sell-save-profile"));
    await screen.findByTestId("mtpelerin-connected", {}, SLOW);
    expect(screen.getByTestId("bank-iban").props.value).toBe("CH93 0076 2011 6238 5295 7");
    expect(screen.getByTestId("bank-city").props.value).toBe("Lausanne");
    await fireEvent.press(screen.getByTestId("bank-holder-person"));
    await fireEvent.press(screen.getByTestId("bank-submit"));

    await reachDone(router);
    // Registered at Mt Pelerin as a person's; the settings keep its id only.
    const registered = jest
      .requireMock<typeof MtPelerinFake>("@/lib/mtpelerin/transport")
      .testMtPelerin()
      .accountsOfUser()
      .find((account) => account.iban === IBAN);
    expect(registered).toMatchObject({ owner_firstname: "Carol", owner_lastname: "Smith" });
    expect(await savedSettings()).toMatchObject({
      signUp: "done",
      bitcoinPercent: 50,
      payoutAccountId: registered?.id
    });
    await waitFor(() => expect(legacyV2.migratedTo).toBe(LIGHTNING_ADDRESS));
  });

  it("asks Mt Pelerin then confirms the v2 bank account, prefilled, never a 1-sat invoice", async () => {
    // As a new account, Mt Pelerin's login at once; the v2 bank
    // account registered there under the merchant's own profile.
    v2Owner({ wallet: false });
    v2Account();
    // The v2 server without the bank account's city (its Mt Pelerin gave none): the rest prefilled.
    legacyV2.account = { ...legacyV2.account!, owner_city: null };
    acceptSession(REFRESH);
    const router = await renderRouter(routes, { initialUrl: "/migration" });
    await waitFor(() => expect(screen.getByTestId("migration-confirm-iban")).toBeTruthy());
    await fireEvent.press(screen.getByTestId("migration-migrate"));

    await waitFor(() => expect(router.getPathname()).toBe("/onboarding/bank"), SLOW);
    expect(await savedSettings()).toMatchObject({
      signUp: "bank",
      bitcoinPercent: 40,
      payoutAccountId: null
    });
    expect(await screen.findByTestId("mtpelerin-intro", {}, SLOW)).toBeTruthy();
    expect(screen.queryByTestId("bank-iban")).toBeNull();
    await fireEvent.press(screen.getByTestId("mtpelerin-create"));
    await fireEvent.changeText(
      await screen.findByTestId("sell-email", {}, SLOW),
      "carol@example.com"
    );
    await fireEvent.changeText(screen.getByTestId("sell-profile-phone"), "79 000 00 00");
    await fireEvent.press(screen.getByTestId("sell-save-profile"));
    await screen.findByTestId("mtpelerin-connected", {}, SLOW);

    // What the v2 server gave, the city to type, the holder's kind to choose.
    expect(screen.getByTestId("bank-iban").props.value).toBe("CH93 0076 2011 6238 5295 7");
    expect(screen.getByTestId("bank-address").props.value).toBe("1 Lake Street");
    expect(screen.getByTestId("bank-postal-code").props.value).toBe("1003");
    expect(screen.getByTestId("bank-city").props.value).toBe("");
    expect(screen.getByTestId("bank-submit")).toBeDisabled();
    await fireEvent.press(screen.getByTestId("bank-holder-person"));
    expect(screen.getByTestId("bank-firstname").props.value).toBe("Carol");
    expect(screen.getByTestId("bank-lastname").props.value).toBe("Smith");
    await fireEvent.changeText(screen.getByTestId("bank-city"), "Lausanne");
    await fireEvent.press(screen.getByTestId("bank-submit"));

    await reachDone(router);
    // Registered at Mt Pelerin, never a Lightning account nor its 1-sat invoice.
    const mtp = jest.requireMock<typeof MtPelerinFake>("@/lib/mtpelerin/transport").testMtPelerin();
    expect(mtp.accountsOfUser()).toEqual([
      expect.objectContaining({ type: "external", iban: IBAN, currency: "CHF" })
    ]);
    expect(mtp.requests.some(({ path }) => path.includes("/ln/"))).toBe(false);
    expect(await savedSettings()).toMatchObject({ signUp: "done", bitcoinPercent: 40 });
    await waitFor(() => expect(legacyV2.migratedTo).toBe(LIGHTNING_ADDRESS));
  });

  it("offers nothing to press until the freeze and the history's copy ended", async () => {
    v2Owner({ wallet: false });
    v2Account({ wallets: [] });
    acceptSession(REFRESH);
    legacyV2.payments = [
      {
        id: "id-0001",
        status: "settled",
        tag: "invoice-tpos",
        amount_sat: 10_000,
        created_at: 1_790_000_001,
        paid_at: 1_790_000_061,
        title: "Sale 1",
        input: { unit: "CHF", amount: 5 }
      }
    ];
    const releaseFreeze = hold("/v1/accounts/migrate");
    const releaseHistory = hold("/api/records/v1/apipayments");
    const router = await renderRouter(routes, { initialUrl: "/migration" });
    await migrate();
    await reachDone(router);
    const nothingToPress = () => {
      expect(screen.queryByTestId("migration-done-next")).toBeNull();
      expect(screen.queryByTestId("migration-finish")).toBeNull();
      expect(screen.queryByTestId("migration-todo-employees")).toBeNull();
      expect(screen.queryByTestId("migration-todo-shop")).toBeNull();
      expect(screen.queryByTestId("migration-changes-open")).toBeNull();
    };
    await waitFor(() =>
      expect(legacyV2.calls.some(({ path }) => path === "/v1/accounts/migrate")).toBe(true)
    );
    nothingToPress();
    // The steps one under the other, the history's waiting for the freeze.
    expect(screen.getByText("Updating your account")).toBeTruthy();
    expect(screen.getByText("Usually a few seconds.")).toBeTruthy();
    expect(screen.getByText("Closing your old account…")).toBeTruthy();
    expect(screen.getByText("As soon as your old account is frozen.")).toBeTruthy();

    // Frozen: the copy of the history follows at once, and nothing shows in between.
    await act(async () => releaseFreeze());
    await waitFor(() => expect(screen.getByTestId("migration-freeze-done")).toBeTruthy());
    nothingToPress();
    await waitFor(() =>
      expect(legacyV2.calls.some(({ path }) => path === "/api/records/v1/apipayments")).toBe(true)
    );
    nothingToPress();

    await act(async () => releaseHistory());
    await waitFor(() => expect(screen.getByTestId("migration-history-done")).toBeTruthy());
    await waitFor(() => expect(screen.getByTestId("migration-finish")).toBeTruthy());
    expect(screen.getByTestId("migration-todo-employees")).toBeTruthy();
    expect(screen.getByTestId("migration-todo-shop")).toBeTruthy();
    expect(screen.getByTestId("migration-changes-open")).toBeTruthy();
    expect(screen.getByText("Your account is up to date")).toBeTruthy();
    expect(screen.queryByText("Updating your account")).toBeNull();
    expect(screen.queryByText("Usually a few seconds.")).toBeNull();
  });

  it('offers nothing to press while the v2 wallet moves, not even a failed freeze\'s "Try again"', async () => {
    v2Owner();
    v2Account();
    acceptSession(REFRESH);
    legacyV2.migrateStatus = 503;
    let moved: (outcome: Awaited<ReturnType<typeof transferLegacyWallet>>) => void = () => {};
    jest.mocked(transferLegacyWallet).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          moved = resolve;
        })
    );
    await renderRouter(routes, { initialUrl: "/migration" });
    await migrate();
    await waitFor(() => expect(screen.getByTestId("migration-freeze-failed")).toBeTruthy());
    await startTransfer();
    await waitFor(() => expect(transferLegacyWallet).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId("migration-freeze-retry")).toBeNull();
    expect(screen.queryByTestId("migration-finish")).toBeNull();
    expect(screen.queryByTestId("migration-done-next")).toBeNull();

    await act(async () =>
      moved({
        status: "sent",
        txid: "c".repeat(64),
        outputSats: 49_000n,
        feeSats: 1_000n,
        waitingSats: 0n
      })
    );
    await waitFor(() => expect(screen.getByTestId("migration-transfer-sent")).toBeTruthy());
    expect(screen.getByTestId("migration-freeze-retry")).toBeTruthy();
    expect(screen.getByTestId("migration-finish")).toBeTruthy();
  });

  it("offers to type the 12 words when the phone cannot open the v2 wallet", async () => {
    v2Owner();
    v2Account();
    acceptSession(REFRESH);
    jest.mocked(transferLegacyWallet).mockResolvedValueOnce({ status: "unreadable" });
    const router = await renderRouter(routes, { initialUrl: "/migration" });
    await migrate();
    await startTransfer();
    await waitFor(() => expect(screen.getByTestId("migration-transfer-unreadable")).toBeTruthy());
    expect(screen.getByTestId("migration-transfer-unreadable")).toHaveTextContent(
      /Try again, or type its 12 words\./
    );

    await fireEvent.press(screen.getByTestId("migration-transfer-type-words"));
    await waitFor(() => expect(router.getPathname()).toBe("/migration/words"));
  });

  it("erases the words without a transfer once their owner confirms they wrote them down", async () => {
    v2Owner();
    v2Account();
    acceptSession(REFRESH);
    await renderRouter(routes, { initialUrl: "/migration" });
    await migrate();
    await showTransferSheet();

    // "Don't move" asks once more, saying what the wallet holds and what is lost.
    await fireEvent.press(screen.getByTestId("migration-transfer-skip"));
    await waitFor(() => expect(screen.getByTestId("migration-transfer-skip-dialog")).toBeTruthy());
    expect(screen.getByTestId("migration-transfer-skip-dialog")).toHaveTextContent(
      /Erase without moving\?The 12 words of your Swiss Bitcoin Pay wallet will be erased from your phone's memory\. The 70.000 sats it holds can then only be recovered with your 12 words written on paper\./
    );
    expect(screen.getByTestId("migration-transfer-erase")).toHaveTextContent(
      /I have the 12 words,\serase without moving/
    );
    // "Back": the offer again, nothing erased.
    await fireEvent.press(screen.getByText("Back"));
    await waitFor(() => expect(screen.queryByTestId("migration-transfer-skip-dialog")).toBeNull());
    expect(screen.getByTestId("migration-transfer-start")).toBeTruthy();
    expect(eraseLegacyWallet).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId("migration-transfer-skip"));
    await waitFor(() => expect(screen.getByTestId("migration-transfer-erase")).toBeTruthy());
    await fireEvent.press(screen.getByTestId("migration-transfer-erase"));
    await waitFor(() => expect(screen.getByTestId("migration-transfer-skipped")).toBeTruthy());
    expect(eraseLegacyWallet).toHaveBeenCalledTimes(1);
    expect(transferLegacyWallet).not.toHaveBeenCalled();
    expect(screen.getByTestId("migration-transfer-skipped")).toHaveTextContent(
      /The 12 words were erased from this phone, without a transfer\./
    );
    // The panel gone (its exit animation done).
    await waitFor(() => expect(screen.queryByTestId("migration-transfer-sheet")).toBeNull());
    // Their owner may still type them here, and finish.
    expect(screen.getByTestId("migration-transfer-type-words")).toBeTruthy();
    expect(screen.getByTestId("migration-finish")).toBeTruthy();
  });

  it("says words the phone could not erase, and erases them again", async () => {
    v2Owner();
    v2Account();
    acceptSession(REFRESH);
    jest.mocked(eraseLegacyWallet).mockResolvedValueOnce(false);
    await renderRouter(routes, { initialUrl: "/migration" });
    await migrate();
    await showTransferSheet();
    await fireEvent.press(screen.getByTestId("migration-transfer-skip"));
    await waitFor(() => expect(screen.getByTestId("migration-transfer-erase")).toBeTruthy());
    await fireEvent.press(screen.getByTestId("migration-transfer-erase"));
    await waitFor(() => expect(screen.getByTestId("migration-transfer-erase-failed")).toBeTruthy());
    expect(screen.getByTestId("migration-transfer-erase-failed")).toHaveTextContent(
      /The 12 words could not be erased from this phone\. Try again\./
    );
    await fireEvent.press(screen.getByTestId("migration-transfer-erase-retry"));
    await waitFor(() => expect(screen.getByTestId("migration-transfer-skipped")).toBeTruthy());
    expect(eraseLegacyWallet).toHaveBeenCalledTimes(2);
    expect(transferLegacyWallet).not.toHaveBeenCalled();
  });

  it("never offers the phone's words to an account migrated from another v2 account", async () => {
    v2Owner();
    v2Account();
    acceptSession(REFRESH);
    acceptPassword("carol@example.com", "the-right-one");
    const router = await renderRouter(routes, { initialUrl: "/migration" });
    await waitFor(() => expect(screen.getByTestId("migration-confirm-split")).toBeTruthy());
    // "This is not my account": the words the v2 app left here are another person's.
    await fireEvent.press(screen.getByTestId("migration-confirm-other"));
    await passwordAsked();
    await fireEvent.changeText(screen.getByTestId("migration-email"), "carol@example.com");
    await fireEvent.changeText(screen.getByTestId("migration-password"), "the-right-one");
    await fireEvent.press(screen.getByTestId("migration-login-submit"));
    await migrate();
    await reachDone(router);
    await waitFor(() => expect(screen.getByTestId("migration-finish")).toBeTruthy(), SLOW);
    expect(
      screen.queryByTestId("migration-transfer-sheet", { includeHiddenElements: true })
    ).toBeNull();
    expect(transferLegacyWallet).not.toHaveBeenCalled();
    await expect(ownsLegacyWallet(WALLET)).resolves.toBe(false);
  });

  it("copies the v2 account's history in the background, and says how much", async () => {
    v2Owner({ wallet: false });
    v2Account();
    acceptSession(REFRESH);
    legacyV2.payments = [1, 2].map((n) => ({
      id: `id-000${n}`,
      status: "settled",
      tag: "invoice-tpos",
      amount_sat: 10_000 * n,
      created_at: 1_790_000_000 + n,
      paid_at: 1_790_000_060 + n,
      title: `Sale ${n}`,
      input: { unit: "CHF", amount: 5 * n }
    }));
    const router = await renderRouter(routes, { initialUrl: "/migration" });
    await migrate();
    await reachDone(router);
    await waitFor(() => expect(screen.getByTestId("migration-history-done")).toBeTruthy());
    expect(screen.getByTestId("migration-history-done")).toHaveTextContent(
      /History copied2 movements, shown in “Wallet”\.$/
    );
    expect(legacyV2.loggedOut).toEqual([REFRESH]);
  });

  it("asks the v2 password once the session ended, and moves on with it", async () => {
    v2Owner({ wallet: false });
    v2Account();
    acceptPassword("carol@example.com", "the-right-one");
    const router = await renderRouter(routes, { initialUrl: "/migration" });

    await passwordAsked();
    expect(
      screen.getByText(
        "We found your account. To carry over your payouts, your Swiss\u00a0Bitcoin\u00a0Pay password, one last time:"
      )
    ).toBeTruthy();
    // The v2 app's copy kept no e-mail: asked with the password.
    await fireEvent.changeText(screen.getByTestId("migration-email"), " carol@example.com ");
    await fireEvent.changeText(screen.getByTestId("migration-password"), "the-right-one");
    await fireEvent.press(screen.getByTestId("migration-login-submit"));
    // Read: on the same card, "Migrate" the next tap.
    await migrate();
    await reachDone(router);

    expect(await savedSettings()).toMatchObject({ signUp: "done", bitcoinPercent: 40 });
    // No v2 wallet on this phone: nothing to move, no prompt; its words asked, its money said.
    expect(transferLegacyWallet).not.toHaveBeenCalled();
    expect(screen.queryByTestId("migration-transfer-sent")).toBeNull();
    await waitFor(() => expect(screen.getByTestId("migration-done-words")).toBeTruthy());
    expect(screen.getByTestId("migration-done-words")).toHaveTextContent(
      /0\.0007 BTC is left on your old Swiss\sBitcoin\sPay wallet\./
    );
  });

  it("stops asking before the v2 server locks the account, and has a new password chosen instead", async () => {
    v2Owner({ wallet: false });
    v2Account();
    acceptPassword("carol@example.com", "the-right-one");
    legacyV2.resetCodes.add(RESET_CODE);
    const router = await renderRouter(routes, { initialUrl: "/migration/forgot" });
    // Opened without a migration under way: back to its start.
    await waitFor(() => expect(router.getPathname()).toBe("/migration"));
    await passwordAsked();

    for (let attempt = 0; attempt < 2; attempt++) {
      await fireEvent.changeText(screen.getByTestId("migration-email"), "carol@example.com");
      await fireEvent.changeText(screen.getByTestId("migration-password"), "wrong");
      await fireEvent.press(screen.getByTestId("migration-login-submit"));
      await waitFor(() =>
        expect(
          screen.queryByText("Wrong email or password") ??
            screen.queryByTestId("migration-login-stopped")
        ).toBeTruthy()
      );
    }
    expect(screen.getByTestId("migration-login-stopped")).toBeTruthy();
    expect(screen.queryByTestId("migration-password")).toBeNull();
    expect(legacyV2.calls.filter(({ path }) => path === "/api/auth/v1/login")).toHaveLength(2);
    // Never without the v2 account: no "Continue without".
    expect(screen.queryByTestId("migration-without")).toBeNull();

    // "Choose a new password": the e-mail typed, the link asked for this app.
    await fireEvent.press(screen.getByTestId("migration-forgot-open"));
    await waitFor(() => expect(router.getPathname()).toBe("/migration/forgot"));
    expect(screen.getByTestId("migration-forgot-email")).toHaveDisplayValue("carol@example.com");
    await fireEvent.press(screen.getByTestId("migration-forgot-send"));
    await waitFor(() => expect(screen.getByTestId("migration-forgot-sent")).toBeTruthy());
    expect(legacyV2.resetRequests).toEqual([
      { email: "carol@example.com", lang: "en", target: "sattleme" }
    ]);
    expect(screen.getByTestId("migration-forgot-sent")).toHaveTextContent(
      /If a Swiss\sBitcoin\sPay account uses carol@example\.com/
    );

    // The e-mail's link opens "New password", its code in the fragment.
    await act(() => appRouter.push(`/migration/password#${RESET_CODE}`));
    await waitFor(() => expect(screen.getByTestId("migration-password-field")).toBeTruthy());
    await fireEvent.changeText(screen.getByTestId("migration-password-field"), "newpass");
    expect(screen.getByTestId("migration-password-save")).toBeDisabled();
    expect(screen.getByTestId("migration-password-rule-letter-met")).toBeTruthy();
    expect(screen.getByTestId("migration-password-rule-digit")).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId("migration-password-field"), "new-word-2");
    await fireEvent.press(screen.getByTestId("migration-password-save"));
    await waitFor(() => expect(screen.getByTestId("migration-password-done")).toBeTruthy());
    expect(legacyV2.credentials?.password).toBe("new-word-2");

    // Back to the card: one more try, for the new password.
    await fireEvent.press(screen.getByTestId("migration-password-continue"));
    await waitFor(() => expect(router.getPathname()).toBe("/migration"));
    await passwordAsked();
    expect(screen.getByTestId("migration-email")).toHaveDisplayValue("carol@example.com");
    await fireEvent.changeText(screen.getByTestId("migration-password"), "new-word-2");
    await fireEvent.press(screen.getByTestId("migration-login-submit"));
    await migrate();
    await reachDone(router);
    expect(await savedSettings()).toMatchObject({ signUp: "done", bitcoinPercent: 40 });
    await waitFor(() => expect(screen.getByTestId("migration-freeze-done")).toBeTruthy());
  });

  it("says a reset link no longer valid, and asks for a new one", async () => {
    acceptPassword("carol@example.com", "the-right-one");
    const router = await renderRouter(routes, { initialUrl: `/migration/password#${RESET_CODE}` });
    await waitFor(() => expect(screen.getByTestId("migration-password-field")).toBeTruthy());
    await fireEvent.changeText(screen.getByTestId("migration-password-field"), "new-word-2");
    await fireEvent.press(screen.getByTestId("migration-password-save"));
    await waitFor(() => expect(screen.getByTestId("migration-password-expired")).toBeTruthy());
    expect(legacyV2.credentials?.password).toBe("the-right-one");

    // No migration under way (the app opened by the link): its start, any device's.
    await fireEvent.press(screen.getByTestId("migration-password-again"));
    await waitFor(() => expect(router.getPathname()).toBe("/migration"));
    await passwordAsked();
    expect(screen.getByTestId("migration-email")).toBeTruthy();
  });

  it("never sends a link's fragment that is no code", async () => {
    await renderRouter(routes, { initialUrl: "/migration/password#nope" });
    await waitFor(() => expect(screen.getByTestId("migration-password-expired")).toBeTruthy());
    expect(legacyV2.calls).toEqual([]);
  });

  it('says an e-mail the v2 server refuses on "Forgot your password"', async () => {
    v2Owner({ wallet: false });
    await renderRouter(routes, { initialUrl: "/migration" });
    await passwordAsked();
    await fireEvent.press(screen.getByTestId("migration-forgot-open"));
    await waitFor(() => expect(screen.getByTestId("migration-forgot-email")).toBeTruthy());
    await fireEvent.changeText(screen.getByTestId("migration-forgot-email"), "carol");
    await fireEvent.press(screen.getByTestId("migration-forgot-send"));
    await waitFor(() => expect(screen.getByText("This email address is not valid")).toBeTruthy());
    expect(screen.queryByTestId("migration-forgot-sent")).toBeNull();
  });

  it("gives one more try for a password changed elsewhere, once", async () => {
    v2Owner({ wallet: false });
    v2Account();
    acceptPassword("carol@example.com", "the-right-one");
    await renderRouter(routes, { initialUrl: "/migration" });
    await passwordAsked();
    for (let attempt = 0; attempt < 2; attempt++) {
      await fireEvent.changeText(screen.getByTestId("migration-email"), "carol@example.com");
      await fireEvent.changeText(screen.getByTestId("migration-password"), "wrong");
      await fireEvent.press(screen.getByTestId("migration-login-submit"));
      await waitFor(() =>
        expect(legacyV2.calls.filter(({ path }) => path === "/api/auth/v1/login")).toHaveLength(
          attempt + 1
        )
      );
    }
    await waitFor(() => expect(screen.getByTestId("migration-login-changed")).toBeTruthy());

    // Chosen on a computer: this phone never saw the page, its owner says so.
    acceptPassword("carol@example.com", "new-word-2");
    await fireEvent.press(screen.getByTestId("migration-login-changed"));
    await waitFor(() => expect(screen.getByTestId("migration-password")).toBeTruthy());
    expect(screen.queryByTestId("migration-login-changed")).toBeNull();
    await fireEvent.changeText(screen.getByTestId("migration-password"), "wrong-again");
    await fireEvent.press(screen.getByTestId("migration-login-submit"));
    // One try only: stopped again, the button gone (TrailBase locks at the fourth try).
    await waitFor(() => expect(screen.getByTestId("migration-login-stopped")).toBeTruthy());
    expect(screen.queryByTestId("migration-login-changed")).toBeNull();
    expect(screen.queryByTestId("migration-password")).toBeNull();
    expect(legacyV2.calls.filter(({ path }) => path === "/api/auth/v1/login")).toHaveLength(3);
  });

  it("never asks the password again in the same run once it stopped, whatever screen asks", async () => {
    v2Owner({ wallet: false });
    v2Account();
    acceptPassword("carol@example.com", "the-right-one");
    await renderRouter(routes, { initialUrl: "/migration" });
    await passwordAsked();
    for (let attempt = 0; attempt < 2; attempt++) {
      await fireEvent.changeText(screen.getByTestId("migration-email"), "carol@example.com");
      await fireEvent.changeText(screen.getByTestId("migration-password"), "wrong");
      await fireEvent.press(screen.getByTestId("migration-login-submit"));
      await waitFor(() =>
        expect(legacyV2.calls.filter(({ path }) => path === "/api/auth/v1/login")).toHaveLength(
          attempt + 1
        )
      );
    }
    await waitFor(() => expect(screen.getByTestId("migration-login-stopped")).toBeTruthy());

    // The app's launch again, the card drawn anew: the password still not asked.
    await act(() => appRouter.replace("/"));
    await waitFor(() => expect(screen.getByTestId("migration-login-stopped")).toBeTruthy());
    expect(screen.queryByTestId("migration-password")).toBeNull();
    expect(legacyV2.calls.filter(({ path }) => path === "/api/auth/v1/login")).toHaveLength(2);
  });

  it("forgets the v2 session as soon as the account exists, its point of sale prepared or not", async () => {
    v2Owner({ wallet: false });
    v2Account();
    // All in bitcoin: the point of sale is prepared as the account is created (with a share in a
    // bank, at the end of its bank step).
    legacyV2.account = { ...legacyV2.account!, btc_percent: 100 };
    acceptSession(REFRESH);
    jest.mocked(getWalletLightningAddress).mockRejectedValueOnce(new Error("offline"));
    const router = await renderRouter(routes, { initialUrl: "/migration" });
    await migrate();
    await waitFor(() => expect(screen.getByTestId("migration-failure")).toBeTruthy());
    expect(router.getPathname()).toBe("/migration");
    // The account exists, its settings the v2 account's; the v2 app's session and role are gone.
    expect(await savedSettings()).toMatchObject({ signUp: "done", bitcoinPercent: 100 });
    await waitFor(() => expect(keychain.entries.size).toBe(0));
    // Not frozen yet: the v2 account is, once "Your account is up to date" shows. Both the freeze
    // and the history's copy are owed from now: an app closed here still has "Settings" offer them.
    expect(legacyV2.migratedTo).toBeNull();
    await expect(isFreezeOwed(WALLET)).resolves.toBe(true);
    expect(parseHistoryOwed(await readHistoryOwedText())).toEqual([WALLET]);

    // Tried again: the passkey opens that account, never a second one.
    await fireEvent.press(screen.getByTestId("migration-migrate"));
    await waitFor(() => expect(router.getPathname()).toBe("/pos"));
    expect(signInWithPasskey).toHaveBeenCalledTimes(1);
  });

  it("logs in instead when the v2 account was already migrated, from another device", async () => {
    v2Owner({ wallet: false });
    v2Account();
    legacyV2.account!.migrated_at = 1_793_000_000;
    acceptSession(REFRESH);
    // The account exists: created and saved on this device's storage earlier.
    const { openTestAccount } =
      jest.requireActual<typeof import("../../jest/account")>("../../jest/account");
    await openTestAccount({ signUp: "done", usage: "merchant", businessName: "Studio" });
    closeAccount();
    const router = await renderRouter(routes, { initialUrl: "/migration" });
    await waitFor(() => expect(screen.getByTestId("migration-confirm-migrated")).toBeTruthy());
    expect(screen.getByTestId("migration-confirm-migrated")).toHaveTextContent(
      /Lakeside Bakery” moved to sattle\.me on/
    );
    expect(screen.queryByTestId("migration-migrate")).toBeNull();

    await fireEvent.press(screen.getByTestId("migration-confirm-login"));
    await waitFor(() => expect(router.getPathname()).toBe("/pos"));
    // Nothing created nor migrated again: the v2 session forgotten.
    expect(legacyV2.calls.some(({ path }) => path === "/v1/accounts/migrate")).toBe(false);
    expect((await savedSettings())?.businessName).toBe("Studio");
    await waitFor(() => expect(keychain.entries.size).toBe(0));
  });

  it("gives the phone's words to the account its owner opens from the migration", async () => {
    v2Owner();
    v2Account();
    legacyV2.account!.migrated_at = 1_793_000_000;
    acceptSession(REFRESH);
    const { openTestAccount } =
      jest.requireActual<typeof import("../../jest/account")>("../../jest/account");
    await openTestAccount({ signUp: "done", usage: "merchant", businessName: "Studio" });
    closeAccount();
    const router = await renderRouter(routes, { initialUrl: "/migration" });
    await waitFor(() => expect(screen.getByTestId("migration-confirm-login")).toBeTruthy());
    await fireEvent.press(screen.getByTestId("migration-confirm-login"));
    await waitFor(() => expect(router.getPathname()).toBe("/pos"));
    // The session forgotten, the words kept for "Wallet", for this account only.
    await waitFor(() => expect([...keychain.entries.keys()]).toEqual([LEGACY_KEYS.mnemonic]));
    await expect(ownsLegacyWallet(WALLET)).resolves.toBe(true);
  });

  it("asks the password alone when the v2 app kept the e-mail, shown on the card", async () => {
    v2Owner({ wallet: false, mail: "carol@example.com" });
    v2Account();
    acceptPassword("carol@example.com", "the-right-one");
    const router = await renderRouter(routes, { initialUrl: "/migration" });
    await passwordAsked();
    expect(screen.getByTestId("migration-confirm-email")).toHaveTextContent("carol@example.com");
    expect(screen.queryByTestId("migration-email")).toBeNull();

    await fireEvent.changeText(screen.getByTestId("migration-password"), "the-right-one");
    await fireEvent.press(screen.getByTestId("migration-login-submit"));
    await migrate();
    await reachDone(router);
    expect(legacyV2.calls.filter(({ path }) => path === "/api/auth/v1/login")).toHaveLength(1);
    // The session of the password closed once the history copied, within this test.
    await waitFor(() => expect(legacyV2.loggedOut).toHaveLength(1));
  });

  it("tries the v2 app's session again when the v2 server did not answer, the password possible", async () => {
    v2Owner({ wallet: false });
    v2Account();
    acceptSession(REFRESH);
    legacyV2.unreachable = true;
    await renderRouter(routes, { initialUrl: "/migration" });
    await waitFor(() => expect(screen.getByTestId("migration-session-unreachable")).toBeTruthy());
    expect(screen.getByTestId("migration-password")).toBeTruthy();
    expect(screen.queryByTestId("migration-confirm-split")).toBeNull();

    // Back online: the same session reads the account, no password typed.
    legacyV2.unreachable = false;
    await fireEvent.press(screen.getByTestId("migration-session-retry"));
    await migrate();
    expect(screen.queryByTestId("migration-session-unreachable")).toBeNull();
    expect(legacyV2.calls.some(({ path }) => path === "/api/auth/v1/login")).toBe(false);
  });

  it('asks the e-mail again when "Forgot your password" changed it, never sent unseen', async () => {
    v2Owner({ wallet: false, mail: "carol@example.com" });
    await renderRouter(routes, { initialUrl: "/migration" });
    await passwordAsked();
    expect(screen.queryByTestId("migration-email")).toBeNull();

    await fireEvent.press(screen.getByTestId("migration-forgot-open"));
    await waitFor(() => expect(screen.getByTestId("migration-forgot-email")).toBeTruthy());
    await fireEvent.changeText(screen.getByTestId("migration-forgot-email"), "frank@example.com");
    await fireEvent.press(screen.getByTestId("migration-forgot-send"));
    await waitFor(() => expect(screen.getByTestId("migration-forgot-sent")).toBeTruthy());

    // The card drawn anew (as after "New password"): the address the password goes with.
    await act(() => appRouter.replace("/migration"));
    await passwordAsked();
    expect(screen.getByTestId("migration-email")).toHaveDisplayValue("frank@example.com");
  });

  it("forgets the v2 app's account before it was read, when it is not the owner's", async () => {
    v2Owner({ mail: "carol@example.com" });
    v2Account();
    acceptPassword("frank@example.com", "their-own");
    legacyV2.account!.mail = "frank@example.com";
    await renderRouter(routes, { initialUrl: "/migration" });
    await passwordAsked();
    expect(screen.getByTestId("migration-home-money")).toBeTruthy();

    await fireEvent.press(screen.getByTestId("migration-confirm-other"));
    // Nothing of that account left: neither its card, its e-mail, nor its wallet's promise.
    await waitFor(() => expect(screen.queryByTestId("migration-confirm-card")).toBeNull());
    expect(screen.getByText("Migrate your Swiss\u00a0Bitcoin\u00a0Pay account")).toBeTruthy();
    expect(screen.getByTestId("migration-email")).toHaveDisplayValue("");

    await fireEvent.changeText(screen.getByTestId("migration-email"), "frank@example.com");
    await fireEvent.changeText(screen.getByTestId("migration-password"), "their-own");
    await fireEvent.press(screen.getByTestId("migration-login-submit"));
    await waitFor(() => expect(screen.getByTestId("migration-confirm-split")).toBeTruthy());
    expect(screen.getByTestId("migration-confirm-email")).toHaveTextContent("frank@example.com");
    expect(screen.queryByTestId("migration-home-money")).toBeNull();
    // Given up here: the session read closed within this test, not the next one's.
    resetMigration();
    await waitFor(() => expect(legacyV2.loggedOut).toHaveLength(1));
  });

  it("reads another account when the one found is not the owner's", async () => {
    v2Owner({ wallet: false });
    v2Account();
    acceptSession(REFRESH);
    acceptPassword("carol@example.com", "the-right-one");
    const router = await renderRouter(routes, { initialUrl: "/migration" });
    await waitFor(() => expect(screen.getByTestId("migration-confirm-split")).toBeTruthy());

    await fireEvent.press(screen.getByTestId("migration-confirm-other"));
    await passwordAsked();
    expect(router.getPathname()).toBe("/migration");
    // The session of the account found closed at once; nothing created, nothing of it shown.
    await waitFor(() => expect(legacyV2.loggedOut).toHaveLength(1));
    expect(await savedSettings()).toBeNull();
    expect(screen.queryByTestId("migration-confirm-card")).toBeNull();
    expect(screen.queryByText(/Lakeside Bakery/)).toBeNull();
    expect(screen.getByTestId("migration-email")).toHaveDisplayValue("");

    await fireEvent.changeText(screen.getByTestId("migration-email"), "carol@example.com");
    await fireEvent.changeText(screen.getByTestId("migration-password"), "the-right-one");
    await fireEvent.press(screen.getByTestId("migration-login-submit"));
    await migrate();
    await reachDone(router);
  });

  it("says a freeze that failed, and tries it again with the same session", async () => {
    v2Owner({ wallet: false });
    v2Account();
    acceptSession(REFRESH);
    legacyV2.migrateStatus = 503;
    await renderRouter(routes, { initialUrl: "/migration" });
    await migrate();
    await waitFor(() => expect(screen.getByTestId("migration-freeze-failed")).toBeTruthy());
    expect(screen.getByTestId("migration-freeze-failed")).toHaveTextContent(
      /it still accepts payments/
    );
    // The history waits for the freeze: the session kept for "Try again".
    expect(legacyV2.loggedOut).toEqual([]);

    legacyV2.migrateStatus = null;
    await fireEvent.press(screen.getByTestId("migration-freeze-retry"));
    await waitFor(() => expect(screen.getByTestId("migration-freeze-done")).toBeTruthy());
    expect(legacyV2.migratedTo).toBe(LIGHTNING_ADDRESS);
    await waitFor(() => expect(legacyV2.loggedOut).toHaveLength(1));
  });

  it("hands the session to the history when the owner leaves before the freeze", async () => {
    v2Owner({ wallet: false });
    v2Account();
    acceptSession(REFRESH);
    legacyV2.migrateStatus = 503;
    const router = await renderRouter(routes, { initialUrl: "/migration" });
    await migrate();
    await waitFor(() => expect(screen.getByTestId("migration-freeze-failed")).toBeTruthy());
    await fireEvent.press(screen.getByTestId("migration-finish"));
    await waitFor(() => expect(router.getPathname()).toBe("/pos"));
    await waitFor(() => expect(legacyV2.loggedOut).toHaveLength(1));
    expect(legacyV2.calls.some(({ path }) => path === "/api/records/v1/apipayments")).toBe(true);
    // Still owed: "Settings" offers it (LegacyFreezeSetting.tsx).
    await expect(isFreezeOwed(WALLET)).resolves.toBe(true);
  });

  it("says a v2 account migrated to another sattle.me account, never to this one", async () => {
    v2Owner({ wallet: false });
    v2Account();
    acceptSession(REFRESH);
    legacyV2.migratedTo = "someone-else@breez.tips";
    await renderRouter(routes, { initialUrl: "/migration" });
    await migrate();
    await waitFor(() => expect(screen.getByTestId("migration-freeze-conflict")).toBeTruthy());
    expect(screen.getByTestId("migration-freeze-conflict")).toHaveTextContent(/support@sattle\.me/);
    expect(legacyV2.migratedTo).toBe("someone-else@breez.tips");
  });

  it("lists what is left to do, and explains what changes", async () => {
    v2Owner({ wallet: false });
    v2Account();
    acceptSession(REFRESH);
    const router = await renderRouter(routes, { initialUrl: "/migration" });
    await migrate();
    await reachDone(router);
    // The online shop without a date; the cards are "Cards"'.
    expect(screen.getByTestId("migration-todo-shop")).toHaveTextContent(
      /Move your online shop's integration/
    );
    expect(screen.getByTestId("migration-todo-shop")).not.toHaveTextContent(/December/);
    expect(screen.queryByTestId("migration-todo-cards")).toBeNull();
    await fireEvent.press(screen.getByTestId("migration-changes-open"));
    await waitFor(() => expect(router.getPathname()).toBe("/migration/changes"));
    expect(screen.getByTestId("migration-changes-frozen")).toHaveTextContent(
      /Once frozen, your old Swiss\sBitcoin\sPay account no longer accepts any payment, at the till, online or on its Lightning address/
    );
    expect(
      screen.getByText(
        /if the transfer does not go through, it is tried again every night at 0:00\sUTC/
      )
    ).toBeTruthy();
    expect(screen.getByText(/keeps working until 31\sDecember\s2027/)).toBeTruthy();
    expect(
      screen.getByText(
        /there are no longer any limits or restrictions tied to identity verification/
      )
    ).toBeTruthy();
    // The old dashboard stays open for the old account's history and its export until the v2
    // service ends.
    expect(
      screen.getByText(
        /Your old account's history stays available to view and export on dashboard\.swiss-bitcoin-pay\.ch until 31\sDecember\s2026\./
      )
    ).toBeTruthy();
    expect(screen.queryByText(/contact support/)).toBeNull();
    expect(screen.queryByText(/before 31\sDecember\s2026/)).toBeNull();

    await fireEvent.press(screen.getByTestId("migration-changes-back"));
    await reachDone(router);
    await fireEvent.press(screen.getByTestId("migration-todo-shop"));
    await waitFor(() => expect(router.getPathname()).toBe("/integrations"));
  });
});

describe("a till's device", () => {
  function v2Till() {
    putLegacyValue(LEGACY_KEYS.userType, "employee");
    putLegacyValue(
      LEGACY_KEYS.accountConfig,
      JSON.stringify({ id: ACCOUNT_ID, name: "Lakeside Bakery", apiKey: "k".repeat(32) })
    );
  }

  it("asks for a new invitation, and lets its owner update instead", async () => {
    v2Till();
    const router = await renderRouter(routes, { initialUrl: "/" });
    await waitFor(() => expect(router.getPathname()).toBe("/migration/employee"));
    expect(screen.getByText(/This device accepted payments for “Lakeside Bakery”/)).toBeTruthy();

    await fireEvent.press(screen.getByTestId("migration-employee-owner"));
    await waitFor(() => expect(router.getPathname()).toBe("/migration"));
    // No session on a till's device: the card of its account, and the owner's password.
    expect(screen.getByTestId("migration-confirm-name")).toHaveTextContent("Lakeside Bakery");
    await passwordAsked();
  });

  it("leads to the invitation's page", async () => {
    v2Till();
    const router = await renderRouter(routes, { initialUrl: "/migration/employee" });
    await waitFor(() => expect(screen.getByTestId("migration-employee-join")).toBeTruthy());
    await fireEvent.press(screen.getByTestId("migration-employee-join"));
    expect(router.getPathname()).toBe("/join");
  });

  it("never opens the owner's migration by itself", async () => {
    v2Till();
    const router = await renderRouter(routes, { initialUrl: "/migration" });
    await waitFor(() => expect(router.getPathname()).toBe("/migration/employee"));
  });
});

describe('a device without the v2 app ("Migrate my Swiss Bitcoin Pay account")', () => {
  /** Once "Your account is up to date" knows whether to ask for the words (words-needed.ts). */
  async function waitForWordsChecked() {
    await waitFor(() => expect(screen.queryByText("Checking your old wallet…")).toBeNull());
  }

  /** `account`: the default v2 account set here; `confirm`: "Migrate" pressed. */
  async function migrateFromWelcome({ account = true, confirm = true } = {}) {
    if (account) v2Account();
    acceptPassword("carol@example.com", "the-right-one");
    const router = await renderRouter(routes, { initialUrl: "/" });
    await waitFor(() => expect(screen.getByTestId("migrate-account")).toBeTruthy());
    // "Migrate from" and the brand's wordmark; the whole sentence for screen readers.
    expect(screen.getByTestId("migrate-account")).toHaveTextContent(/Migrate\sfrom/);
    expect(screen.getByTestId("migrate-account")).toHaveAccessibleName(
      /^Migrate\smy\sSwiss\sBitcoin\sPay\saccount$/
    );

    await fireEvent.press(screen.getByTestId("migrate-account"));
    await waitFor(() => expect(router.getPathname()).toBe("/migration"));
    expect(screen.getByText("Migrate your Swiss\u00a0Bitcoin\u00a0Pay account")).toBeTruthy();
    // Nothing of the v2 app here: no card yet, no money promised before the v2 server says.
    expect(screen.queryByTestId("migration-confirm-card")).toBeNull();
    expect(screen.queryByTestId("migration-home-money")).toBeNull();

    // No session to try: the v2 server not asked before the password.
    await passwordAsked();
    expect(legacyV2.calls).toEqual([]);
    await fireEvent.changeText(screen.getByTestId("migration-email"), "carol@example.com");
    await fireEvent.changeText(screen.getByTestId("migration-password"), "the-right-one");
    await fireEvent.press(screen.getByTestId("migration-login-submit"));
    // The account read: its card on the same screen.
    await waitFor(() => expect(screen.getByTestId("migration-confirm-split")).toBeTruthy());
    expect(screen.getByText("Hello, Lakeside Bakery")).toBeTruthy();
    expect(screen.queryByTestId("migration-password")).toBeNull();
    if (confirm) await migrate();
    return router;
  }

  it("migrates with the v2 password, then moves the v2 wallet with its 12 words typed", async () => {
    const router = await migrateFromWelcome();
    await reachDone(router);
    expect(await savedSettings()).toMatchObject({
      signUp: "done",
      businessName: "Lakeside Bakery",
      bitcoinPercent: 40
    });

    await waitFor(() => expect(screen.getByTestId("migration-done-type-words")).toBeTruthy());
    await fireEvent.press(screen.getByTestId("migration-done-type-words"));
    await waitFor(() => expect(router.getPathname()).toBe("/migration/words"));
    expect(screen.getByTestId("migration-words-only")).toHaveTextContent(/Ledger, Trezor, BitBox/);

    // Words of no wallet: said, kept to be corrected, nothing connected nor sent.
    const wrong = WORDS.replace("yellow", "zoo");
    await fireEvent.changeText(screen.getByTestId("migration-words-field"), wrong);
    await fireEvent.press(screen.getByTestId("migration-words-submit"));
    expect(
      screen.getByText("These words do not make a wallet: check each of them and their order")
    ).toBeTruthy();
    expect(screen.getByTestId("migration-words-field")).toHaveDisplayValue(wrong);
    expect(transferTypedWords).not.toHaveBeenCalled();

    // In capitals, across lines: the wallet's words, forgotten by the field as the transfer starts.
    await fireEvent.changeText(
      screen.getByTestId("migration-words-field"),
      ` ${WORDS.toUpperCase().split(" ").slice(0, 6).join(" ")}\n${WORDS.split(" ").slice(6).join("  ")} `
    );
    await fireEvent.press(screen.getByTestId("migration-words-submit"));
    await waitFor(() => expect(screen.getByTestId("migration-transfer-sent")).toBeTruthy());
    expect(transferTypedWords).toHaveBeenCalledTimes(1);
    // The words as checked: lowercase, one each (the real transfer empties them once used).
    expect(jest.mocked(transferTypedWords).mock.calls[0]![0]).toEqual(WORDS.split(" "));
    expect(screen.queryByTestId("migration-words-field")).toBeNull();
    expect(screen.getByTestId("migration-transfer-sent")).toHaveTextContent(
      /0\.0007 BTC on its way to your new account/
    );

    await fireEvent.press(screen.getByTestId("migration-words-done"));
    await reachDone(router);
  });

  it("asks no words when the v2 server lists no wallet the v2 app created", async () => {
    v2Account({
      wallets: [
        { address: "carol@wallet.example", walletConfig: { type: "local" } },
        { address: LOCAL_ZPUB, walletConfig: { type: "ledger", zpub: LOCAL_ZPUB } }
      ]
    });
    const router = await migrateFromWelcome({ account: false });
    await reachDone(router);
    await waitForWordsChecked();
    expect(screen.queryByTestId("migration-done-words")).toBeNull();
  });

  it.each([
    ["an empty wallet", 0],
    ["dust", 700]
  ])("asks no words for %s", async (_name, walletSats) => {
    v2Account({ walletSats });
    const router = await migrateFromWelcome({ account: false });
    await reachDone(router);
    await waitForWordsChecked();
    expect(screen.queryByTestId("migration-done-words")).toBeNull();
  });

  it("asks the words of a wallet whose balance could not be read, saying so", async () => {
    v2Account();
    legacyV2.balanceDown = true;
    const router = await migrateFromWelcome({ account: false });
    await reachDone(router);
    await waitFor(() => expect(screen.getByTestId("migration-done-words")).toBeTruthy());
    expect(screen.getByTestId("migration-done-words")).toHaveTextContent(/could not be checked/);
  });

  it("types the words again after a transfer that failed", async () => {
    await migrateFromWelcome();
    await waitFor(() => expect(screen.getByTestId("migration-done-type-words")).toBeTruthy());
    await fireEvent.press(screen.getByTestId("migration-done-type-words"));
    await waitFor(() => expect(screen.getByTestId("migration-words-field")).toBeTruthy());
    jest.mocked(transferTypedWords).mockResolvedValueOnce({ status: "failed" });
    await fireEvent.changeText(screen.getByTestId("migration-words-field"), WORDS);
    await fireEvent.press(screen.getByTestId("migration-words-submit"));
    await waitFor(() => expect(screen.getByTestId("migration-transfer-failed")).toBeTruthy());
    expect(screen.getByTestId("migration-words-field")).toHaveDisplayValue("");
    expect(screen.queryByTestId("migration-words-done")).toBeNull();
  });

  it("says when the words typed are of a wallet nothing ever paid, to type them again", async () => {
    await migrateFromWelcome();
    await waitFor(() => expect(screen.getByTestId("migration-done-type-words")).toBeTruthy());
    await fireEvent.press(screen.getByTestId("migration-done-type-words"));
    await waitFor(() => expect(screen.getByTestId("migration-words-field")).toBeTruthy());
    jest.mocked(transferTypedWords).mockResolvedValueOnce({ status: "unused" });
    await fireEvent.changeText(screen.getByTestId("migration-words-field"), WORDS);
    await fireEvent.press(screen.getByTestId("migration-words-submit"));
    await waitFor(() =>
      expect(screen.getByText(/match no wallet that ever received money/)).toBeTruthy()
    );
    // Never "empty": nothing said of the v2 wallet's money.
    expect(screen.queryByTestId("migration-transfer-empty")).toBeNull();
    expect(screen.queryByTestId("migration-words-done")).toBeNull();
    expect(screen.getByTestId("migration-words-field")).toHaveDisplayValue("");
  });

  it("asks for the passkey on a second tap on the web, a browser asking it only after a tap", async () => {
    jest.replaceProperty(Platform, "OS", "web");
    const { createPasskeyWallet } =
      jest.requireMock<typeof import("../lib/breez/passkey")>("../lib/breez/passkey");
    const router = await migrateFromWelcome({ confirm: false });
    // "Migrate", on the card read, is the second tap.
    expect(router.getPathname()).toBe("/migration");
    expect(createPasskeyWallet).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId("migration-migrate"));
    await reachDone(router);
    expect(createPasskeyWallet).toHaveBeenCalledTimes(1);
    expect(await savedSettings()).toMatchObject({ signUp: "done", bitcoinPercent: 40 });
  });

  it("never opens the words' screen without an account of its own", async () => {
    const router = await renderRouter(routes, { initialUrl: "/migration/words" });
    await waitFor(() => expect(router.getPathname()).toBe("/"));
  });
});

describe("a device the v2 app never used", () => {
  it("opens on the welcome screen", async () => {
    await renderRouter(routes, { initialUrl: "/" });
    await waitFor(() => expect(screen.getByTestId("create-account")).toBeTruthy());
  });
});
