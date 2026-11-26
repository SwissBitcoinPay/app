import { act, renderHook, waitFor } from "@testing-library/react-native";

import { NoMainWalletError } from "@/features/account/main-wallet";
import {
  OtherAccountError,
  closeAccount,
  getAccountSettings,
  updateAccount
} from "@/features/account/session";
import {
  activateTerminal,
  prepareThisDevice,
  refreshTerminalDetails
} from "@/features/terminal/activate";
import { useDeviceKindSync } from "@/features/terminal/device-kind";
import { getTerminalProfile, resetTerminalProfileCache } from "@/features/terminal/profile-cache";
import { connectWallet, disconnectWallet, getWalletId } from "@/lib/breez/wallet";
import type { CardHolderProfile, SavedTerminalProfile } from "@/lib/terminal/model";
import { loadTerminalProfile } from "@/lib/terminal/profile";

import {
  TEST_WALLET_ID,
  openCardHolderAccount,
  openMerchantAccount,
  testBackupKey
} from "../../jest/account";

/*
 * What this device is for its account: a merchant's point of sale,
 * prepared with the account's wallet, or a card holder's device, prepared without any (a 100 %
 * card account never has a main wallet, src/features/account/main-wallet.ts). The device follows
 * its account: "Create my merchant profile" done on another device (device-kind.ts).
 */

jest.mock("../lib/breez/wallet", () => ({
  checkWalletConfig: jest.fn(),
  connectWallet: jest.fn(async () => undefined),
  getWalletConnectionId: jest.fn(() => null),
  getWalletId: jest.fn(),
  getWalletLightningAddress: jest.fn(async () => "sattleme02c6047f94@breez.tips"),
  disconnectWallet: jest.fn(async () => undefined),
  subscribeWallet: jest.fn(() => () => undefined)
}));

const ADDRESS = "sattleme02c6047f94@breez.tips";
/** Another wallet id: the public key of the private key 3. */
const OTHER_WALLET = "02f9308a019258c31049344f85f89d5229b531c845836f99b08601f113bce036f9";

/** The card holder's profile of the test account, as prepareCardHolder saves it. */
function holderProfile(currency = "CHF"): SavedTerminalProfile {
  return {
    version: 4,
    walletId: TEST_WALLET_ID,
    backupKey: testBackupKey(),
    businessName: getAccountSettings()!.businessName,
    currency
  };
}

/** The point of sale's profile of the test account (version 2), as activateTerminal saves it. */
function pointOfSale(): SavedTerminalProfile {
  return {
    version: 2,
    walletId: TEST_WALLET_ID,
    backupKey: testBackupKey(),
    lightningAddress: ADDRESS,
    businessName: getAccountSettings()!.businessName,
    currency: "CHF"
  };
}

beforeEach(() => {
  closeAccount();
  resetTerminalProfileCache();
  jest.clearAllMocks();
  jest.mocked(getWalletId).mockResolvedValue(TEST_WALLET_ID);
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => closeAccount());

describe("preparing this device", () => {
  it("names a card holder's account on its device, without any wallet", async () => {
    await openCardHolderAccount();

    const profile = await prepareThisDevice(getAccountSettings()!);

    expect(profile).toEqual(holderProfile());
    await expect(loadTerminalProfile()).resolves.toEqual(holderProfile());
    await expect(getTerminalProfile()).resolves.toEqual(holderProfile());
    expect(connectWallet).not.toHaveBeenCalled();
    expect(getWalletId).not.toHaveBeenCalled();
  });

  it("never prepares a point of sale for a card holder's account: its wallet is never connected", async () => {
    await openCardHolderAccount();

    await expect(
      activateTerminal({ businessName: "Merchant 9EE5", displayCurrency: "CHF" })
    ).rejects.toBeInstanceOf(NoMainWalletError);

    expect(connectWallet).not.toHaveBeenCalled();
    await expect(loadTerminalProfile()).resolves.toBeNull();
  });

  it("prepares a merchant's point of sale with its wallet, then disconnects it", async () => {
    await openMerchantAccount();

    await expect(prepareThisDevice(getAccountSettings()!)).resolves.toEqual(pointOfSale());

    expect(connectWallet).toHaveBeenCalledTimes(1);
    expect(jest.mocked(disconnectWallet).mock.invocationCallOrder.at(-1)).toBeGreaterThan(
      jest.mocked(connectWallet).mock.invocationCallOrder[0]!
    );
    await expect(loadTerminalProfile()).resolves.toEqual(pointOfSale());
  });

  it("shows the point of sale only once its wallet is disconnected: nothing it opens loses its own", async () => {
    await openCardHolderAccount();
    await prepareThisDevice(getAccountSettings()!);
    await updateAccount({ usage: "merchant" });
    // The device's profile each time the wallet disconnects.
    const seen: (number | undefined)[] = [];
    jest.mocked(disconnectWallet).mockImplementation(async () => {
      seen.push((await getTerminalProfile())?.version);
    });

    await prepareThisDevice(getAccountSettings()!);

    // Another flow's connection first, then its own: both while the device was a card holder's.
    expect(seen).toEqual([4, 4]);
    await expect(getTerminalProfile()).resolves.toEqual(pointOfSale());
  });

  it("saves nothing when the wallet connected is not the account's, and disconnects it", async () => {
    await openMerchantAccount();
    jest.mocked(getWalletId).mockResolvedValue(OTHER_WALLET);

    await expect(
      activateTerminal({ businessName: "Merchant 9EE5", displayCurrency: "CHF" })
    ).rejects.toBeInstanceOf(OtherAccountError);

    expect(jest.mocked(disconnectWallet).mock.invocationCallOrder.at(-1)).toBeGreaterThan(
      jest.mocked(connectWallet).mock.invocationCallOrder[0]!
    );
    await expect(loadTerminalProfile()).resolves.toBeNull();
  });

  it("makes a card holder's device a point of sale once its account is a merchant's", async () => {
    await openCardHolderAccount();
    await prepareThisDevice(getAccountSettings()!);
    await updateAccount({ usage: "merchant" });

    await expect(prepareThisDevice(getAccountSettings()!)).resolves.toEqual(pointOfSale());

    await expect(getTerminalProfile()).resolves.toEqual(pointOfSale());
  });

  it("follows a card holder's display currency, still without any wallet", async () => {
    await openCardHolderAccount();
    await prepareThisDevice(getAccountSettings()!);

    const settings = getAccountSettings()!;
    await expect(refreshTerminalDetails({ ...settings, displayCurrency: "EUR" })).resolves.toBe(
      true
    );

    await expect(loadTerminalProfile()).resolves.toEqual(holderProfile("EUR"));
    expect(connectWallet).not.toHaveBeenCalled();
  });
});

describe("the device following its account, once the passkey opened it", () => {
  async function follow(profile: CardHolderProfile) {
    await renderHook(() => useDeviceKindSync(profile));
  }

  it("prepares a point of sale on a card holder's device once its account is a merchant's elsewhere", async () => {
    await openCardHolderAccount();
    const holder = (await prepareThisDevice(getAccountSettings()!)) as CardHolderProfile;
    // "Create my merchant profile" done on another device: the relays' settings say so.
    await updateAccount({ usage: "merchant" });

    await follow(holder);

    await waitFor(async () => expect(await loadTerminalProfile()).toEqual(pointOfSale()));
    expect(connectWallet).toHaveBeenCalledTimes(1);
  });

  it("follows a card holder's display currency changed elsewhere", async () => {
    await openCardHolderAccount();
    const holder = (await prepareThisDevice(getAccountSettings()!)) as CardHolderProfile;
    await updateAccount({ displayCurrency: "EUR" });

    await follow(holder);

    await waitFor(async () => expect(await loadTerminalProfile()).toEqual(holderProfile("EUR")));
    expect(connectWallet).not.toHaveBeenCalled();
  });

  it("does nothing while the account is closed, nor for another account's profile", async () => {
    await openCardHolderAccount();
    const holder = (await prepareThisDevice(getAccountSettings()!)) as CardHolderProfile;
    await updateAccount({ usage: "merchant" });

    await follow({ ...holder, walletId: OTHER_WALLET });
    await act(async () => undefined);
    closeAccount();
    await follow(holder);
    await act(async () => undefined);

    await expect(loadTerminalProfile()).resolves.toEqual(holder);
    expect(connectWallet).not.toHaveBeenCalled();
  });
});
