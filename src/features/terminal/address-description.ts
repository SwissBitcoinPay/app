import { withAccountWallet } from "@/features/account/background-wallet";
import {
  getAccountSettings,
  getAccountWalletId,
  updateAccount,
  whenAccountSynced,
  whenBackedUp
} from "@/features/account/session";
import { keepWalletAddressDescription } from "@/lib/breez/wallet";
import { LNURL_TIMEOUT_MS } from "@/lib/lightning/lnurl";
import { fetchAddressMetadata } from "@/lib/lightning/metadata";
import { logFailure } from "@/lib/log/log";
import { MAX_FORMER_ADDRESS_METADATA } from "@/lib/settings/merchant";
import { ownerProfile } from "@/lib/terminal/model";
import { within } from "@/lib/within";

import { getTerminalProfile } from "./profile-cache";

/*
 * The name payers and card holders see is the description the Breez LNURL server holds for the
 * merchant's Lightning address: it is the `text/plain` of the address's metadata, whose SHA-256
 * every invoice carries (src/lib/lightning/metadata.ts), and a card holder's app shows it as the
 * payee. It was registered at the sign-up with a generated name
 * ("Business 9EE5"). It follows the business name: whenever the owner renames the
 * business here, and at each unlock of the account (another device renamed it, or an earlier update
 * failed). The server's own word decides (the address's public payRequest), never the wallet's
 * local copy. Only a description that differs connects the wallet, which signs the update
 * (background-wallet.ts). A failure keeps the name saved in the settings: the update is tried
 * again at the next unlock.
 *
 * The invoices made under the former description carry its hash: before each change, the metadata
 * served until then is kept in the account's settings (`formerAddressMetadata`), backed up on a
 * relay first, so that those invoices stay the merchant's (checkDeclaredInvoice of
 * src/lib/registry/registry.ts, through src/lib/settings/former-metadata.ts). Nothing changes until
 * it is.
 */

export type AddressDescriptionSync = "noAccount" | "noAddress" | "upToDate" | "updated" | "failed";

/** How long the update waits for the wallet, kept by a wallet screen or another task. */
const WALLET_WAIT_MS = 2 * 60 * 1000;
/**
 * Past this, the server's name is taken as not read: a request that never ends (its abort not
 * honoured) must not hold back the next updates, which wait for this one.
 */
const READ_TIMEOUT_MS = LNURL_TIMEOUT_MS + 2000;

/** One update at a time, each with the business name as it is when it starts. */
let last: Promise<unknown> = Promise.resolve();
/** Bumped by resetAddressDescription: an update of an earlier epoch connects and writes nothing. */
let epoch = 0;
/** The unlock's update under way, shared by the calls that come meanwhile. */
let unlockRun: {
  walletId: string | null;
  epoch: number;
  run: Promise<AddressDescriptionSync>;
} | null = null;

/**
 * Brings the description of the open account's Lightning address to its business name. Never
 * rejects: resolves with what was done.
 */
export function syncAddressDescription(): Promise<AddressDescriptionSync> {
  return inTurn(() => sync({ atUnlock: false }));
}

/**
 * At the account's unlock, once its settings are the relays' (another device's rename). Unlocking
 * leaves the wallet disconnected (wallet-access.ts): it connects only when this device's point of
 * sale knows the address and the server serves another name.
 */
export function syncAddressDescriptionAtUnlock(): Promise<AddressDescriptionSync> {
  // One per unlock: another one asked meanwhile (the unlock's screens mounting again) shares it.
  const walletId = getAccountWalletId();
  if (unlockRun && unlockRun.walletId === walletId && unlockRun.epoch === epoch) {
    return unlockRun.run;
  }
  const run = inTurn(() => whenAccountSynced().then(() => sync({ atUnlock: true })));
  const entry = { walletId, epoch, run };
  unlockRun = entry;
  void run.finally(() => {
    if (unlockRun === entry) unlockRun = null;
  });
  return run;
}

/**
 * Forgets the updates under way (the tests, after each: none outlives its test): they connect no
 * wallet and write nothing from then on, and the next update does not wait for them.
 */
export function resetAddressDescription(): void {
  epoch += 1;
  last = Promise.resolve();
  unlockRun = null;
}

/** Settles once the updates started so far ended. */
export function settledAddressDescription(): Promise<void> {
  return last.then(
    () => undefined,
    () => undefined
  );
}

function inTurn(task: () => Promise<AddressDescriptionSync>): Promise<AddressDescriptionSync> {
  const run = last.then(task, task);
  last = run;
  return run;
}

async function sync({ atUnlock }: { atUnlock: boolean }): Promise<AddressDescriptionSync> {
  const started = epoch;
  const ours = () => epoch === started;
  const walletId = getAccountWalletId();
  const name = getAccountSettings()?.businessName;
  if (!walletId || !name) return "noAccount";
  try {
    // This device's point of sale knows the address: read without the wallet. Not read (offline):
    // tried again later, the wallet left alone.
    const profile = ownerProfile(await getTerminalProfile());
    if (profile && profile.walletId.toLowerCase() === walletId.toLowerCase()) {
      const served = await within(fetchAddressMetadata(profile.lightningAddress), READ_TIMEOUT_MS);
      if (!served) return "failed";
      if (served.name === name) return "upToDate";
    } else if (atUnlock) {
      // Another of the owner's devices: its point of sale's catches up, or the next rename here.
      return "noAddress";
    }
    if (!ours()) return "noAccount";
    const outcome = await withAccountWallet(Date.now() + WALLET_WAIT_MS, async (connected, own) => {
      if (connected.toLowerCase() !== walletId.toLowerCase() || !own() || !ours()) return null;
      // The name as it is now: a rename while the wallet connected is the one to register.
      const current = getAccountSettings()?.businessName;
      if (!current || getAccountWalletId() !== walletId) return null;
      return keepWalletAddressDescription(walletId, current, (former) => {
        if (!ours()) return Promise.reject(new Error("An earlier update"));
        return keepFormerMetadata(walletId, former);
      });
    });
    return outcome ?? "noAccount";
  } catch (error) {
    logFailure("Updating the Lightning address's name failed", error);
    return "failed";
  }
}

/**
 * Keeps `metadata` among the account's former metadata of its address, once a majority of the
 * relays took the settings' backup (never on this device alone: another device would not know it);
 * rejects otherwise, and the description is not changed.
 */
async function keepFormerMetadata(walletId: string, metadata: string): Promise<void> {
  if (!getAccountSettings() || getAccountWalletId() !== walletId) {
    throw new Error("The account closed");
  }
  // Kept once, as the latest (an update interrupted after keeping it is tried again).
  const saved = await updateAccount((current) => ({
    formerAddressMetadata: [
      ...current.formerAddressMetadata.filter((kept) => kept !== metadata),
      metadata
    ].slice(-MAX_FORMER_ADDRESS_METADATA)
  }));
  const outcome = await whenBackedUp(saved);
  if (outcome !== "published")
    throw new Error(`The settings' backup was not published: ${outcome}`);
}
