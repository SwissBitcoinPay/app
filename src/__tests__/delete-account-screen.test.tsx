import "@/i18n";

import { act, fireEvent, renderRouter, screen, waitFor, within } from "expo-router/testing-library";

import AppLayout from "@/app/(app)/_layout";
import AmountScreen from "@/app/(app)/pos/index";
import PosLayout from "@/app/(app)/pos/_layout";
import SettingsLayout from "@/app/(app)/settings/_layout";
import SettingsIndex from "@/app/(app)/settings/index";
import LaunchScreen from "@/app/index";
import { closeAccount, getAccountBackupKey, getAccountSettings } from "@/features/account/session";
import {
  DeletionError,
  checkAccountDeletion,
  deleteAccount,
  type DeletionStep
} from "@/features/settings/account-deletion";
import { forgetDeletedAccount } from "@/features/settings/deleted-elsewhere";
import { signOut } from "@/features/settings/sign-out";
import { resetTerminalProfileCache } from "@/features/terminal/profile-cache";
import { PasskeyError } from "@/lib/breez/errors";
import { signInWithPasskey } from "@/lib/breez/passkey";
import type { OwnerTerminalProfile, SavedTerminalProfile } from "@/lib/terminal/model";
import { saveTerminalProfile } from "@/lib/terminal/profile";
import { lightColors as colors } from "@/theme";

import { OTHER_TEST_MNEMONIC, TEST_WALLET_ID, openTestAccount, testSeed } from "../../jest/account";

/*
 * "Delete account" in "Settings" (DeleteAccount.tsx): its confirmations, the passkey, its
 * progress and its failures. What the deletion does is account-deletion.test.ts's: mocked here.
 */

jest.mock("../features/settings/account-deletion", () => ({
  ...jest.requireActual("../features/settings/account-deletion"),
  checkAccountDeletion: jest.fn(),
  deleteAccount: jest.fn()
}));
jest.mock("../lib/breez/passkey", () => ({
  createPasskeyWallet: jest.fn(),
  preparePasskeys: jest.fn(async () => undefined),
  passkeysReady: jest.fn(() => true),
  signInWithPasskey: jest.fn()
}));
jest.mock("../lib/breez/wallet", () => ({
  checkWalletConfig: jest.fn(),
  connectWallet: jest.fn(),
  disconnectWallet: jest.fn(async () => undefined),
  getWalletId: jest.fn(),
  getWalletLightningAddress: jest.fn(),
  newDepositAddress: jest.fn(),
  isWalletConnected: () => false,
  getWalletConnectionId: () => null,
  subscribeWallet: () => () => undefined
}));
jest.mock("../features/terminal/useRate", () => ({
  useRate: () => ({
    rate: 50000,
    hour: jest
      .requireActual<typeof import("../lib/rates/sources")>("../lib/rates/sources")
      .pointHourOf(Math.floor(Date.now() / 1000)),
    loading: false,
    current: () => 50000
  })
}));
jest.mock("../lib/nostr/local-network", () => ({
  askLocalNetworkAccess: jest.fn(async () => null)
}));
const mockDesktop = jest.fn(() => false);
jest.mock("@/components/layout/useIsDesktop", () => ({
  ...jest.requireActual("@/components/layout/useIsDesktop"),
  useIsDesktop: () => mockDesktop()
}));

const check = jest.mocked(checkAccountDeletion);
const remove = jest.mocked(deleteAccount);
const signIn = jest.mocked(signInWithPasskey);

const routes = {
  index: LaunchScreen,
  "(app)/_layout": AppLayout,
  "(app)/pos/_layout": PosLayout,
  "(app)/pos/index": AmountScreen,
  "(app)/settings/_layout": SettingsLayout,
  "(app)/settings/index": SettingsIndex
};

async function ownerDevice() {
  await openTestAccount({ usage: "merchant", signUp: "done" });
  const profile: SavedTerminalProfile = {
    version: 2,
    walletId: TEST_WALLET_ID,
    backupKey: getAccountBackupKey()!,
    lightningAddress: "sattleme02c6047f94@breez.tips",
    businessName: getAccountSettings()?.businessName ?? "",
    currency: "CHF"
  };
  await saveTerminalProfile(profile);
  resetTerminalProfileCache();
}

async function openSettings() {
  await ownerDevice();
  await renderRouter(routes, { initialUrl: "/settings" });
  // A computer: in the tab "Account"; a phone: at the bottom of "Settings".
  if (mockDesktop()) await fireEvent.press(await screen.findByTestId("settings-tab-account"));
  return screen.findByTestId("delete-account");
}

jest.setTimeout(30_000);

beforeEach(() => {
  closeAccount();
  check.mockReset();
  remove.mockReset();
  signIn.mockReset();
  mockDesktop.mockReturnValue(false);
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

describe("Delete account", () => {
  it("asks for the employees, the integrations, the deletion, then the passkey, and shows its steps", async () => {
    check.mockResolvedValue({ employees: 2, integrations: 1, assistants: 0 });
    signIn.mockResolvedValue({ seed: testSeed() } as Awaited<ReturnType<typeof signInWithPasskey>>);
    let report!: (step: DeletionStep) => void;
    let finish!: () => Promise<void>;
    remove.mockImplementation(
      (_seed, onStep) =>
        new Promise((resolve) => {
          report = onStep!;
          // As deleteAccount ends: this device wiped (sign-out.ts), then resolved.
          finish = async () => {
            await signOut();
            resolve({ named: 12, unconfirmed: [] });
          };
        })
    );
    await fireEvent.press(await openSettings());
    expect(await screen.findByText("You have 2 employees")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("delete-employees-confirm"));
    expect(await screen.findByText("You have 1 integration")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("delete-integrations-confirm"));
    expect(await screen.findByText("Delete the account?")).toBeTruthy();
    expect(signIn).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId("delete-confirm"));
    await waitFor(() => expect(remove).toHaveBeenCalledTimes(1));
    expect(signIn).toHaveBeenCalledTimes(1);
    expect(remove.mock.calls[0]![0]).toEqual(testSeed());

    await act(async () => report({ step: "relays", phase: "deleting", done: 3, total: 9 }));
    expect(await screen.findByText("Erasing on the relays (3/9)")).toBeTruthy();
    expect(screen.getByText("Keep the app open until it is done.")).toBeTruthy();
    expect(screen.queryByText("Your account has been deleted")).toBeNull();
    // Done: the device is wiped, the welcome screen takes the place of this one and says so.
    await act(async () => finish());
    expect(await screen.findByTestId("create-account")).toBeTruthy();
    // Green: the success tone (Notification.tsx).
    expect(await screen.findByText("Your account has been deleted")).toHaveStyle({
      color: colors.success.fg
    });
    expect(screen.queryByText("Account not deleted")).toBeNull();
    expect(getAccountSettings()).toBeNull();
  });

  it("goes straight to the deletion's confirmation without employees nor integrations", async () => {
    check.mockResolvedValue({ employees: 0, integrations: 0, assistants: 0 });
    await fireEvent.press(await openSettings());
    expect(await screen.findByText("Delete the account?")).toBeTruthy();
    expect(screen.queryByTestId("delete-employees-dialog")).toBeNull();
    // "Back": nothing is asked, nothing deleted.
    await fireEvent.press(screen.getByText("Back"));
    await waitFor(() => expect(screen.queryByText("Delete the account?")).toBeNull());
    expect(signIn).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it("asks for the AI assistants after the integrations, and for them alone without the others", async () => {
    check.mockResolvedValue({ employees: 0, integrations: 1, assistants: 2 });
    await fireEvent.press(await openSettings());
    expect(await screen.findByText("You have 1 integration")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("delete-integrations-confirm"));
    expect(await screen.findByText("You have 2 AI assistants")).toBeTruthy();
    expect(
      screen.getByText(
        "They will be removed: they will no longer be able to make invoices for the business."
      )
    ).toBeTruthy();
    await fireEvent.press(screen.getByTestId("delete-assistants-confirm"));
    expect(await screen.findByText("Delete the account?")).toBeTruthy();
    await fireEvent.press(within(screen.getByTestId("delete-confirm-dialog")).getByText("Back"));
    await waitFor(() => expect(screen.queryByText("Delete the account?")).toBeNull());

    check.mockResolvedValue({ employees: 0, integrations: 0, assistants: 1 });
    await fireEvent.press(screen.getByTestId("delete-account"));
    expect(await screen.findByText("You have 1 AI assistant")).toBeTruthy();
    expect(screen.queryByTestId("delete-integrations-dialog")).toBeNull();
    expect(remove).not.toHaveBeenCalled();
  });

  it("stops at the employees' confirmation when it is declined", async () => {
    check.mockResolvedValue({ employees: 1, integrations: 0, assistants: 0 });
    await fireEvent.press(await openSettings());
    expect(await screen.findByText("You have 1 employee")).toBeTruthy();
    await fireEvent.press(screen.getByText("Back"));
    await waitFor(() => expect(screen.queryByText("You have 1 employee")).toBeNull());
    expect(screen.queryByText("Delete the account?")).toBeNull();
    expect(remove).not.toHaveBeenCalled();
  });

  it("says why the account cannot be deleted yet", async () => {
    check.mockRejectedValue(new DeletionError("balance", "The wallet holds sats", 1234n));
    await fireEvent.press(await openSettings());
    expect(await screen.findByText("Account not deleted")).toBeTruthy();
    expect(screen.getByText(/^The wallet still holds 1.?234 sats/)).toBeTruthy();
    expect(screen.queryByText("Delete the account?")).toBeNull();

    check.mockRejectedValue(new DeletionError("salesInProgress", "Open sales"));
    await fireEvent.press(screen.getByTestId("delete-account"));
    expect(
      await screen.findByText(/^Some invoices of the business are not final yet/)
    ).toBeTruthy();
  });

  it("does nothing when the passkey prompt is dismissed, and refuses another account's", async () => {
    check.mockResolvedValue({ employees: 0, integrations: 0, assistants: 0 });
    signIn.mockRejectedValue(new PasskeyError("cancelled", "Dismissed"));
    await fireEvent.press(await openSettings());
    await fireEvent.press(await screen.findByTestId("delete-confirm"));
    await waitFor(() => expect(signIn).toHaveBeenCalledTimes(1));
    expect(remove).not.toHaveBeenCalled();
    expect(screen.queryByText("Account not deleted")).toBeNull();

    signIn.mockResolvedValue({
      seed: testSeed(OTHER_TEST_MNEMONIC)
    } as Awaited<ReturnType<typeof signInWithPasskey>>);
    remove.mockRejectedValue(new DeletionError("otherAccount", "Not the account's passkey"));
    await fireEvent.press(screen.getByTestId("delete-account"));
    await fireEvent.press(await screen.findByTestId("delete-confirm"));
    expect(
      await screen.findByText(/^This passkey opens another account than this device's/)
    ).toBeTruthy();
  });

  it("says what is done already when the relays stop it halfway", async () => {
    check.mockResolvedValue({ employees: 0, integrations: 0, assistants: 0 });
    signIn.mockResolvedValue({ seed: testSeed() } as Awaited<ReturnType<typeof signInWithPasskey>>);
    remove.mockImplementation(async (_seed, onStep) => {
      onStep!({ step: "wallet" });
      onStep!({ step: "team" });
      throw new DeletionError("notDeleted", "The relays did not confirm the deletion");
    });
    await fireEvent.press(await openSettings());
    await fireEvent.press(await screen.findByTestId("delete-confirm"));
    expect(
      await screen.findByText(
        /^The deletion is not finished: the Lightning address and the team are already removed/
      )
    ).toBeTruthy();
    await waitFor(() => expect(screen.queryByTestId("delete-progress")).toBeNull());
    expect(getAccountSettings()).not.toBeNull();
    expect(screen.queryByText("Your account has been deleted")).toBeNull();
  });

  it("does not say the account is deleted when this device could not be wiped", async () => {
    check.mockResolvedValue({ employees: 0, integrations: 0, assistants: 0 });
    signIn.mockResolvedValue({ seed: testSeed() } as Awaited<ReturnType<typeof signInWithPasskey>>);
    remove.mockImplementation(async (_seed, onStep) => {
      onStep!({ step: "device" });
      // As deleteAccount when sign-out.ts rejects: the welcome screen shows all the same.
      await signOut();
      throw new DeletionError("deviceNotWiped", "This device could not be wiped");
    });
    await fireEvent.press(await openSettings());
    await fireEvent.press(await screen.findByTestId("delete-confirm"));
    expect(await screen.findByTestId("create-account")).toBeTruthy();
    expect(screen.queryByText("Your account has been deleted")).toBeNull();
  });

  it('has its own section in the tab "Account" on desktop', async () => {
    mockDesktop.mockReturnValue(true);
    await openSettings();
    expect(screen.getAllByText("Delete account").length).toBeGreaterThanOrEqual(2);
    expect(
      screen.getByText(/^Erases the account from the Nostr relays and from this device/)
    ).toBeTruthy();
  });

  it("says on the welcome screen that the account was deleted from another device", async () => {
    await ownerDevice();
    const profile: OwnerTerminalProfile = {
      version: 2,
      walletId: TEST_WALLET_ID,
      backupKey: getAccountBackupKey()!,
      lightningAddress: "sattleme02c6047f94@breez.tips",
      businessName: "Fine Bakery",
      currency: "CHF"
    };
    closeAccount();
    await forgetDeletedAccount(profile);
    await renderRouter(routes, { initialUrl: "/" });
    expect(
      await screen.findByText(
        "The account of Fine Bakery was deleted from another device: this device forgot it."
      )
    ).toBeTruthy();
  });

  it("says the deletion is begun when a check fails past the Lightning address, or unfinished", async () => {
    check.mockResolvedValue({ employees: 0, integrations: 0, assistants: 0 });
    signIn.mockResolvedValue({ seed: testSeed() } as Awaited<ReturnType<typeof signInWithPasskey>>);
    remove.mockImplementation(async (_seed, onStep) => {
      onStep!({ step: "wallet" });
      onStep!({ step: "team" });
      onStep!({ step: "wallet" });
      throw new DeletionError("salesInProgress", "A sale is open");
    });
    await fireEvent.press(await openSettings());
    await fireEvent.press(await screen.findByTestId("delete-confirm"));
    expect(
      await screen.findByText(
        /^Some invoices of the business are not final yet.*The Lightning address and the team are already removed/
      )
    ).toBeTruthy();

    remove.mockImplementation(async (_seed, onStep) => {
      onStep!({ step: "team" });
      throw new DeletionError("unfinished", "The backup's deletion is not confirmed");
    });
    await fireEvent.press(screen.getByTestId("delete-account"));
    await fireEvent.press(await screen.findByTestId("delete-confirm"));
    expect(await screen.findByText(/^The deletion has begun but is not finished/)).toBeTruthy();
  });
});
