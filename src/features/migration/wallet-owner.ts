import { logFailure } from "@/lib/log/log";
import { forgetLegacyWords, hasLegacyWallet } from "@/lib/legacy-v2/store";
import { forgetLegacyWatch } from "@/lib/legacy-v2/watch-store";
import {
  NewerLegacyWalletOwnerError,
  legacyWalletOwnerText,
  parseLegacyWalletOwner
} from "@/lib/legacy-v2/wallet-owner-format";
import {
  readLegacyWalletOwnerText,
  removeLegacyWalletOwnerText,
  writeLegacyWalletOwnerText
} from "@/lib/legacy-v2/wallet-owner-store";

/*
 * The v2 wallet's words the v2 app left on this device (its keychain, src/lib/legacy-v2/store.ts)
 * go to one account only: the one its owner migrated, or opened, from the v2 app's own session here
 * (useMigrationAccount.ts), never one opened since (otherwise, on a phone given away after
 * "Log out", any account created on it would take that wallet's money). "Log out"
 * forgets that account (device-wipe.ts): words still here then (their transfer not settled) are no
 * account's, and only typing them moves their money ("Type my 12 words").
 *
 * Once their money moved, or its owner chose to keep only the words they wrote down, the words are
 * erased from the device, with what the app kept of that wallet: nothing of the v2 app stays
 * once the migration is over.
 */

/** The record being written (noteLegacyWalletOwner): a read waits for it. */
let noting: Promise<void> = Promise.resolve();

/** Notes the account of `walletId` as the one the v2 wallet's words on this device go to. */
export function noteLegacyWalletOwner(walletId: string): Promise<void> {
  noting = noting.then(() => writeOwner(walletId));
  return noting;
}

async function writeOwner(walletId: string): Promise<void> {
  const text = legacyWalletOwnerText(walletId);
  if (!text) {
    logFailure("Noting the owner of the v2 wallet: no wallet id");
    return;
  }
  try {
    // A newer app's record is never written over (readOwner throws).
    await readOwner();
    await writeLegacyWalletOwnerText(text);
  } catch (error) {
    logFailure("Noting the owner of the v2 wallet failed", error);
  }
}

/**
 * Whether the v2 wallet's words are on this device for the account of `walletId` (see above).
 * False when anything cannot be read: the words are then not offered.
 */
export async function ownsLegacyWallet(walletId: string | null): Promise<boolean> {
  if (!walletId) return false;
  await noting;
  try {
    const owner = await readOwner();
    return owner === walletId.toLowerCase() && (await hasLegacyWallet());
  } catch (error) {
    if (!(error instanceof NewerLegacyWalletOwnerError)) {
      logFailure("Reading the owner of the v2 wallet failed", error);
    }
    return false;
  }
}

/**
 * Erases the v2 wallet's words from this device, then the watch of that wallet and its owner (see
 * above). True once the words are gone. When the keychain kept them, the rest stays too: their
 * owner may try again (a later transfer erases them). Never rejects.
 */
export async function forgetLegacyWallet(): Promise<boolean> {
  if (!(await forgetLegacyWords())) return false;
  await forgetLegacyWatch();
  try {
    await removeLegacyWalletOwnerText();
  } catch (error) {
    // No words left: the record points at nothing, and "Log out" removes it.
    logFailure("Forgetting the owner of the v2 wallet failed", error);
  }
  return true;
}

async function readOwner(): Promise<string | null> {
  return parseLegacyWalletOwner(await readLegacyWalletOwnerText());
}
