/**
 * Opens an account for the tests that render the sign-up steps directly: the steps save into the
 * open account (src/features/account/session.ts), and leave for the welcome screen without one.
 * Its wallet id is TEST_WALLET_ID: a test that connects the wallet mocks `getWalletId` with it.
 */
import { detectSignUpLocation, type SignUpLocation } from "../src/features/account/detection";
import { openAccount, updateAccount } from "../src/features/account/session";
import { deriveBackupKeys } from "../src/lib/backup/keys";
import { walletSecret } from "../src/lib/breez/seed";
import type { WalletSeed } from "../src/lib/breez/types";
import type { SettingsPatch } from "../src/lib/settings/merchant";

/** BIP-39 test mnemonics (all-zero and all-one entropy), never a real wallet's. */
export const TEST_MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
export const OTHER_TEST_MNEMONIC = "zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo wrong";

/** The wallet id the tests give the test account: the public key of the private key 2. */
export const TEST_WALLET_ID = "02c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5";

/** A native SDK seed (`Seed.Mnemonic`), as the passkey gives it. */
export function testSeed(mnemonic: string = TEST_MNEMONIC): WalletSeed {
  return { tag: "Mnemonic", inner: { mnemonic, passphrase: undefined } } as unknown as WalletSeed;
}

/** The backup key of the account of `seed` (`BackupKeys.publicKey`), as the profile keeps it. */
export function testBackupKey(seed: WalletSeed = testSeed()): string {
  return deriveBackupKeys(walletSecret(seed)).publicKey;
}

/** Creates an account (detection of the device by default), then applies `settings` to it. */
export async function openTestAccount(
  settings?: SettingsPatch,
  detect: () => Promise<SignUpLocation> = () => detectSignUpLocation()
): Promise<void> {
  await openAccount({
    seed: testSeed(),
    walletId: TEST_WALLET_ID,
    created: true,
    detect,
    businessNameWord: "Merchant"
  });
  if (settings) await updateAccount(settings);
}

/**
 * A merchant's account, its sign-up done (at 100 % bitcoin unless `settings` say otherwise): the
 * only one that may connect its own wallet (src/features/account/main-wallet.ts).
 */
export async function openMerchantAccount(
  settings?: SettingsPatch,
  detect?: () => Promise<SignUpLocation>
): Promise<void> {
  await openTestAccount({ signUp: "done", usage: "merchant", ...settings }, detect);
}

/** A card holder's account, its sign-up done: it never has a wallet of its own. */
export async function openCardHolderAccount(
  settings?: SettingsPatch,
  detect?: () => Promise<SignUpLocation>
): Promise<void> {
  await openTestAccount({ signUp: "done", usage: "card", ...settings }, detect);
}
