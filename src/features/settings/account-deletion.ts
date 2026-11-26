import { Platform } from "react-native";

import { withAccountWallet } from "@/features/account/background-wallet";
import { hasMainWallet } from "@/features/account/main-wallet";
import {
  isEmptyCardWallet,
  leaseCardWallet,
  readCardWalletContents,
  type CardWalletLease,
  type CardWalletOf
} from "@/features/card/card-wallet";
import { removeChannel } from "@/features/card/manage";
import {
  NoAccountError,
  readAllCardIds,
  withCardAccess,
  withCardAccessOf,
  type CardIdsRead
} from "@/features/card/states";
import { logFailure } from "@/lib/log/log";
import { within } from "@/lib/within";
import {
  getAccountSettings,
  getAccountTeamKeys,
  getAccountWalletId,
  freezeAccountBackups,
  isAccountSeed,
  whenAccountSynced
} from "@/features/account/session";
import { removeAllSeats } from "@/features/team/owner";
import { readRoster, type Roster } from "@/features/team/roster";
import { findUnsettled } from "@/features/team/unsettled";
import { invoiceNetwork } from "@/features/terminal/invoice";
import { holdPaymentRates } from "@/features/wallet/payment-rates";
import { holdWalletSends } from "@/features/wallet/wallet-sends";
import { holdActivity } from "@/lib/activity";
import { deriveBackupKeys, wipeBackupKeys, type BackupKeys } from "@/lib/backup/keys";
import { walletSecret } from "@/lib/breez/seed";
import {
  deriveCardRecordKeys,
  wipeCardRecordKeys,
  type CardRecordKeys
} from "@/lib/card/card-record";
import {
  deriveMonthPartKeys,
  wipeMonthPartKeys,
  type MonthPartKeys
} from "@/lib/card/history-months";
import {
  deriveHistoryRecordKeys,
  wipeHistoryRecordKeys,
  type HistoryRecordKeys
} from "@/lib/card/history-records";
import { cardOwnKeys, cardOwnSecret, wipeCardOwnKeys, type CardOwnKeys } from "@/lib/card/card-own";
import { deriveCardRoot } from "@/lib/card/keys";
import {
  deriveLegacyHistoryKeys,
  wipeLegacyHistoryKeys,
  type LegacyHistoryKeys
} from "@/lib/card/legacy-history-records";
import {
  derivePayeeRecordKeys,
  wipePayeeRecordKeys,
  type PayeeRecordKeys
} from "@/lib/card/payee-records";
import type { WalletSeed } from "@/lib/breez/types";
import {
  accountRecoveryWallet,
  countUnclaimedDeposits,
  deleteWalletLightningAddress,
  getWalletBalance,
  listWalletPaymentsPage,
  waitWalletNetworkSync
} from "@/lib/breez/wallet";
import { nowUnix } from "@/lib/rates/snapshot";
import { loadRegistryMoves } from "@/lib/registry/moves-store";
import { currentRelays } from "@/lib/relays/current";
import { unionRelays } from "@/lib/relays/list";
import type { MerchantSettings } from "@/lib/settings/merchant";
import { deriveTeamKeys, wipeTeamKeys, type TeamKeys } from "@/lib/team/keys";

import {
  accountHolders,
  ErasureError,
  eraseAccountRecords,
  type ErasureOutcome,
  type ErasureProgress
} from "./account-erasure";
import { signOut } from "./sign-out";

/*
 * "Delete account" of the owner, from "Settings": refused while the
 * wallet holds anything (its balance once synced, a payment pending, an on-chain deposit not
 * claimed yet), or the wallet of one of its cards does (each card pays from a wallet of its own,
 * and nothing finds it again once the account's records are gone), or a sale of
 * the business is not final (unsettled.ts: its payments would reach a wallet nobody opens any
 * more). Confirmed in dialogs (the employees, the integrations, then the deletion itself), then
 * with the passkey (DeleteAccount.tsx). Then:
 * 1. the Lightning addresses are given up (Breez's LNURL server makes no invoice for them any
 *    more), the cards' wallets' then the wallet's, once the checks pass again with the wallet
 *    connected;
 * 2. the employees and integrations are removed (their channels, then their records in the roster,
 *    say so, owner.ts removeAllSeats);
 * 3. the checks again: a payment or a sale started between the
 *    first checks and the end of the business's means of payment shows now;
 * 4. what the account's keys signed on the relays is deleted, and the deletion checked
 *    (account-erasure.ts): nothing goes further when it is not;
 * 5. as "Log out": the account closes, the wallet disconnects, and everything the app keeps
 *    on this device goes (sign-out.ts), the Breez SDK's storage included.
 * A step that fails stops there, the device untouched: the steps done stay done (a Lightning
 * address given up, a team removed), the next attempt goes on from them. The wallet itself stays:
 * its passkey opens it again, in this app or another one (the Spark operators keep its state, the
 * SDK has no call to delete it); the passkey stays in the system's password manager, whose own
 * settings delete it.
 */

/**
 * Longest wait for the wallet to be free, then synced (a sync that reached the network,
 * Wallet.waitNetworkSync: never offline): past it, DeletionError "walletFailed". Not measured on a
 * device.
 */
export const DELETION_WALLET_TIMEOUT_MS = 2 * 60 * 1000;

/** Payments read per page of the wallet's history (its local storage). */
const PAYMENTS_PAGE_SIZE = 200;

export type DeletionErrorCode =
  /** No finished account is open (till mode, another account). */
  | "noAccount"
  /** The passkey given is not the account's. */
  | "otherAccount"
  /** The wallet holds sats: `balanceSats`. */
  | "balance"
  /** A payment of the wallet is not final yet. */
  | "pendingPayments"
  /** An on-chain deposit is not claimed yet (its sats not in the balance for good). */
  | "unclaimedDeposits"
  /** A card's wallet holds sats, a payment pending or a deposit not claimed (card-wallet.ts). */
  | "cardWallets"
  /** A newer app recorded a card of the account: this one cannot check its wallet. */
  | "newerApp"
  /** A sale of the business is not final yet (unsettled.ts). */
  | "salesInProgress"
  /** The wallet did not connect, sync or answer (offline, busy, a build without API key). */
  | "walletFailed"
  /** The relays did not answer: no majority read or took something that had to be. */
  | "unreachable"
  /** The relays did not confirm the deletion (account-erasure.ts): the account stays whole. */
  | "notDeleted"
  /**
   * Only the backup's deletion is not confirmed, and its requests may be out (account-erasure.ts):
   * the account's other devices may forget it already. A next attempt finishes the deletion.
   */
  | "unfinished"
  /** Everything was deleted on the relays, but not everything on this device (sign-out.ts). */
  | "deviceNotWiped";

export class DeletionError extends Error {
  readonly code: DeletionErrorCode;
  /** For "balance": the sats the wallet holds. */
  readonly balanceSats: bigint | null;

  constructor(code: DeletionErrorCode, message: string, balanceSats: bigint | null = null) {
    super(message);
    this.name = "DeletionError";
    this.code = code;
    this.balanceSats = balanceSats;
  }
}

/**
 * What the deletion removes besides the account: shown in its confirmations (DeleteAccount.tsx),
 * the assistants included, removed with the others
 * (removeAllSeats).
 */
export type DeletionCheck = { employees: number; integrations: number; assistants: number };

export type DeletionStep =
  | { step: "wallet" }
  | { step: "team" }
  | ({ step: "relays" } & ErasureProgress)
  | { step: "device" };

function openSettings(): MerchantSettings {
  const settings = getAccountSettings();
  if (!settings || settings.signUp !== "done") {
    throw new DeletionError("noAccount", "No finished account is open");
  }
  return settings;
}

/**
 * What the wallet holds, once synced, and the payment hashes of its whole history. `recovering`:
 * its funds out of its balance, on their way back to it (src/features/wallet/funds-recovery.ts).
 */
type WalletState = {
  balanceSats: bigint;
  pending: number;
  deposits: number;
  recovering: bigint;
  hashes: string[];
};

async function readWallet(own: () => boolean, deadline: number): Promise<WalletState> {
  // Once a sync reached the network: before it, the SDK answers from this device's copy, which may
  // miss payments, and the end of its first sync proves no read of the network (Wallet.getBalance).
  // None in time: refused (no deletion on an unproven sync).
  if ((await within(waitWalletNetworkSync(), deadline - Date.now())) === null) {
    throw new DeletionError("walletFailed", "The wallet did not sync with the network");
  }
  const balanceSats = await within(getWalletBalance(false), deadline - Date.now());
  if (balanceSats === null) throw new DeletionError("walletFailed", "The wallet did not answer");
  let pending = 0;
  const hashes = new Set<string>();
  for (let offset = 0; ; offset += PAYMENTS_PAGE_SIZE) {
    if (!own()) throw new DeletionError("walletFailed", "The wallet was taken by another screen");
    // Bounded as the sync: the progress panel cannot be closed while the deletion waits.
    const page = await within(
      listWalletPaymentsPage({ offset, limit: PAYMENTS_PAGE_SIZE }),
      deadline - Date.now()
    );
    if (page === null) throw new DeletionError("walletFailed", "The wallet did not answer");
    for (const payment of page.payments) {
      if (payment.status === "pending") pending += 1;
      const hash = payment.paymentHash?.toLowerCase();
      if (hash !== undefined && /^[0-9a-f]{64}$/.test(hash)) hashes.add(hash);
    }
    if (page.listed < PAYMENTS_PAGE_SIZE) break;
  }
  const deposits = await within(countUnclaimedDeposits(), deadline - Date.now());
  if (deposits === null) throw new DeletionError("walletFailed", "The wallet did not answer");
  // As of the sync above.
  const recovering = await within(
    accountRecoveryWallet.getRecoverableFunds(false),
    deadline - Date.now()
  );
  if (recovering === null) throw new DeletionError("walletFailed", "The wallet did not answer");
  return { balanceSats, pending, deposits, recovering, hashes: [...hashes] };
}

/** DeletionError when `state` holds anything (see above). */
function requireEmpty(state: WalletState): void {
  if (state.balanceSats > 0n) {
    throw new DeletionError("balance", "The wallet holds sats", state.balanceSats);
  }
  if (state.pending > 0) throw new DeletionError("pendingPayments", "A payment is pending");
  if (state.deposits > 0) {
    throw new DeletionError("unclaimedDeposits", "An on-chain deposit is not claimed yet");
  }
  // Coming back to the balance as an on-chain deposit: told as one.
  if (state.recovering > 0n) {
    throw new DeletionError("unclaimedDeposits", "Funds out of the balance are on their way back");
  }
}

/**
 * Runs `run` with the card's wallet `card` connected (card-wallet.ts), by `deadline` (Unix ms):
 * DeletionError "walletFailed" when it does not connect by then.
 */
async function withCardWallet<T>(
  card: CardWalletOf,
  deadline: number,
  run: (lease: CardWalletLease) => Promise<T>
): Promise<T> {
  const leasing = withCardAccess((access) => leaseCardWallet(access, card));
  let lease: CardWalletLease | null;
  try {
    lease = await within(leasing, deadline - Date.now());
  } catch (error) {
    if (error instanceof NoAccountError) {
      throw new DeletionError("noAccount", "No finished account is open");
    }
    logFailure("Connecting a card's wallet for the deletion failed", error);
    throw new DeletionError("walletFailed", "A card's wallet did not connect");
  }
  if (lease === null) {
    // Connected after all, too late: released then.
    void leasing.then(
      (late) => late.release(),
      () => undefined
    );
    throw new DeletionError("walletFailed", "A card's wallet did not connect in time");
  }
  try {
    return await run(lease);
  } finally {
    await lease.release();
  }
}

/** The account's cards, each card's wallet found empty (requireEmptyCardWallets). */
type CheckedCards = Pick<CardIdsRead, "cardIds" | "wallets" | "channels" | "images">;

/**
 * The account's cards as a majority of its relays and this device know them, reset and deleted
 * ones included (read only: the deletion publishes nothing), each card's wallet found empty once
 * synced, in turn (one SDK instance each, never all at once). Resolves with them; DeletionError
 * "cardWallets" while one is not empty, "unreachable" when no majority of the relays told the
 * cards, "newerApp" for a card of a newer app's record, "walletFailed" when a wallet did not answer
 * within DELETION_WALLET_TIMEOUT_MS.
 */
async function requireEmptyCardWallets(): Promise<CheckedCards> {
  let cards: CheckedCards;
  try {
    const read = await withCardAccess(readAllCardIds);
    if (!read.conclusive) {
      throw new DeletionError("unreachable", "No majority of the relays gave the cards");
    }
    if (read.newer) throw new DeletionError("newerApp", "A newer app recorded a card");
    cards = {
      cardIds: read.cardIds,
      wallets: read.wallets,
      channels: read.channels,
      images: read.images
    };
  } catch (error) {
    if (error instanceof DeletionError) throw error;
    if (error instanceof NoAccountError) {
      throw new DeletionError("noAccount", "No finished account is open");
    }
    logFailure("Reading the cards for the deletion failed", error);
    throw new DeletionError("unreachable", "The cards could not be read");
  }
  const deadline = Date.now() + DELETION_WALLET_TIMEOUT_MS;
  for (const wallet of cards.wallets) {
    await withCardWallet(wallet, deadline, async (lease) => {
      const left = deadline - Date.now();
      const contents = await within(readCardWalletContents(lease, left), left).catch(
        (error: unknown) => {
          logFailure("Reading a card's wallet for the deletion failed", error);
          return null;
        }
      );
      if (contents === null) {
        throw new DeletionError("walletFailed", "A card's wallet did not answer");
      }
      if (!isEmptyCardWallet(contents)) {
        throw new DeletionError("cardWallets", "A card's wallet is not empty");
      }
    });
  }
  return cards;
}

/**
 * Gives up the Lightning address of each card's wallet (`wallets`): nobody pays a wallet whose
 * card nothing finds again. DeletionError "walletFailed" when one is not given up.
 */
async function giveUpCardAddresses(wallets: readonly CardWalletOf[]): Promise<void> {
  const deadline = Date.now() + DELETION_WALLET_TIMEOUT_MS;
  for (const wallet of wallets) {
    await withCardWallet(wallet, deadline, async (lease) => {
      const done = await within(
        lease.wallet.deleteLightningAddress(lease.walletId),
        deadline - Date.now()
      ).catch((error: unknown) => {
        logFailure("Giving up a card's Lightning address failed", error);
        return null;
      });
      if (done === null) {
        throw new DeletionError("walletFailed", "A card's Lightning address could not be given up");
      }
    });
  }
}

/**
 * The roster (src/features/team/roster.ts) as a majority of the account's relays give it: every
 * employee and integration, those removed included. DeletionError "unreachable" otherwise (one on
 * the other relays could be missed, and so its sales, or its records left behind).
 */
async function deletionRoster(settings: MerchantSettings): Promise<Roster> {
  const team = getAccountTeamKeys();
  if (!team) throw new DeletionError("noAccount", "No finished account is open");
  const read = await readRoster(team, settings.relays);
  if (read.status !== "read") {
    throw new DeletionError("unreachable", "No majority of the relays gave the roster");
  }
  return read.roster;
}

/**
 * DeletionError "salesInProgress" (or "unreachable") while a sale of the business is open: of its
 * employees, those removed included (the deletion removes them before its last checks), and of the
 * owner's devices, this one's pending links included.
 */
async function requireSettled(settings: MerchantSettings): Promise<void> {
  const team = getAccountTeamKeys();
  if (!team) throw new DeletionError("noAccount", "No finished account is open");
  const roster = await deletionRoster(settings);
  const unsettled = await findUnsettled(team, accountHolders(team, roster, settings.devices), {
    thisDevice: true
  });
  if (unsettled === null) {
    throw new DeletionError("unreachable", "The relays could not tell whether the sales are final");
  }
  if (unsettled.invoices + unsettled.links > 0) {
    throw new DeletionError("salesInProgress", "A sale of the business is not final yet");
  }
}

/** What the checks found: the wallet's state, the account's cards. */
type Checked = { wallet: WalletState; cards: CheckedCards };

/** A card holder's account has no wallet of its own: nothing in it, no payment of its. */
const NO_WALLET: WalletState = {
  balanceSats: 0n,
  pending: 0,
  deposits: 0,
  recovering: 0n,
  hashes: []
};

/**
 * The checks, with the open account's wallet connected for them (withAccountWallet), then `then`
 * with it still connected and every wallet of the account's cards: what they found, unless one
 * fails (DeletionError). A card holder's account has no wallet of
 * its own (main-wallet.ts): never connected, its cards' wallets alone are checked, and `then` gets
 * no wallet id. An older card holder's account may have one, left unseen: it is
 * not checked either (its sats stay with the recovery phrase, or "Create my merchant profile").
 */
async function withCheckedWallet(
  settings: MerchantSettings,
  then: (walletId: string | null, wallets: CardWalletOf[]) => Promise<void> = async () => {}
): Promise<Checked> {
  if (!hasMainWallet()) {
    const cards = await requireEmptyCardWallets();
    await requireSettled(settings);
    await then(null, cards.wallets);
    return { wallet: NO_WALLET, cards };
  }
  let checked: Checked | null;
  // One deadline for both waits: the wallet free, then synced.
  const deadline = Date.now() + DELETION_WALLET_TIMEOUT_MS;
  try {
    // Exclusive: no background task (a lot being filled) publishes while the account is erased.
    checked = await withAccountWallet(
      deadline,
      async (walletId, own) => {
        const wallet = await readWallet(own, deadline);
        requireEmpty(wallet);
        const cards = await requireEmptyCardWallets();
        await requireSettled(settings);
        await then(walletId, cards.wallets);
        return { wallet, cards };
      },
      { exclusive: true }
    );
  } catch (error) {
    if (error instanceof DeletionError) throw error;
    logFailure("Checking the wallet for the deletion failed", error);
    throw new DeletionError("walletFailed", "The wallet could not be checked");
  }
  if (checked === null) throw new DeletionError("noAccount", "The account closed");
  return checked;
}

/**
 * The cards' channels on their relays deleted, once the account's records are (best effort: a
 * channel holds no key nor funds, but its relay would go on waking this device for its card's
 * taps). Not from the web app: the card relay answers no browser (docs/card-relay.md).
 */
async function removeCardChannels(channels: CheckedCards["channels"]): Promise<void> {
  if (Platform.OS === "web" || channels.length === 0) return;
  await withCardAccess((access) =>
    Promise.all(
      channels.map(({ cardId, relayHost }) =>
        removeChannel(access, cardId, relayHost).catch((error: unknown) => {
          logFailure("Deleting a card's channel failed", error);
        })
      )
    )
  ).catch((error: unknown) => {
    logFailure("Deleting the cards' channels failed", error);
  });
}

/**
 * Whether the open account can be deleted now (see above): resolves with what its confirmations
 * name, rejects with DeletionError otherwise. Nothing changes.
 */
export async function checkAccountDeletion(): Promise<DeletionCheck> {
  const release = holdActivity();
  try {
    openSettings();
    await whenAccountSynced();
    const settings = openSettings();
    await withCheckedWallet(settings);
    // As the checks read it (a majority of the relays), with what this device knows since.
    const roster = await deletionRoster(settings);
    return {
      employees: roster.employees.length,
      integrations: roster.integrations.length,
      assistants: roster.assistants.length
    };
  } finally {
    release();
  }
}

/**
 * Deletes the open account (see above), once its owner confirmed it with the passkey that gave
 * `seed`: the steps tell `onStep` how far they are. Resolves with what the relays did once this
 * device is wiped (the app then shows its welcome screen); rejects with DeletionError.
 */
export async function deleteAccount(
  seed: WalletSeed,
  onStep: (step: DeletionStep) => void = () => {}
): Promise<ErasureOutcome> {
  // The user waits on the app meanwhile: the auto-lock would close the account under the deletion.
  const release = holdActivity();
  let backup: BackupKeys | null = null;
  let team: TeamKeys | null = null;
  // The authors of the cards' records (their states, approved merchants, payments and movements,
  // the parts of their months' copies, their v2 histories).
  let cards:
    [CardRecordKeys, PayeeRecordKeys, HistoryRecordKeys, MonthPartKeys, LegacyHistoryKeys] | null =
    null;
  // The authors of each card's wallet's own copies (src/lib/card/card-own.ts).
  const owns: CardOwnKeys[] = [];
  // Published again only when the relays' deletion fails (freezeAccountBackups).
  let thaw: (() => void) | null = null;
  let resume: (() => void) | null = null;
  try {
    const secret = walletSecret(seed);
    try {
      backup = deriveBackupKeys(secret);
      team = deriveTeamKeys(secret);
      const root = deriveCardRoot(secret);
      try {
        cards = [
          deriveCardRecordKeys(root),
          derivePayeeRecordKeys(root),
          deriveHistoryRecordKeys(root),
          deriveMonthPartKeys(root),
          deriveLegacyHistoryKeys(root)
        ];
      } finally {
        root.fill(0);
      }
    } finally {
      secret.fill(0);
    }
    openSettings();
    if (!isAccountSeed(seed)) throw new DeletionError("otherAccount", "Not the account's passkey");
    await whenAccountSynced();
    const walletId = getAccountWalletId();
    if (!walletId) throw new DeletionError("noAccount", "No finished account is open");

    onStep({ step: "wallet" });
    await withCheckedWallet(openSettings(), async (id, wallets) => {
      // The cards' first: a failure there leaves the wallet's address, the deletion not begun.
      await giveUpCardAddresses(wallets);
      // A card holder's account has no Lightning address of its own (no wallet).
      if (id !== null) {
        try {
          await deleteWalletLightningAddress(id);
        } catch (error) {
          logFailure("Giving up the Lightning address failed", error);
          throw new DeletionError("walletFailed", "The Lightning address could not be given up");
        }
      }
      // Given up: from now on, a failure leaves the deletion begun (DeleteAccount.tsx says so).
      onStep({ step: "team" });
    });

    try {
      // Their channels, then their records: never part of the settings (src/lib/team/roster.ts).
      await removeAllSeats();
    } catch (error) {
      logFailure("Removing the team failed", error);
      throw new DeletionError("unreachable", "The team could not be removed");
    }

    // The checks again: nothing takes a payment for the business
    // any more (no Lightning address, no employee), a payment or a sale started between the first
    // checks and now shows. The wallet's history read now holds every payment.
    onStep({ step: "wallet" });
    const checked = await withCheckedWallet(openSettings());

    const settings = openSettings();
    // Every seat ever, those just removed included: their channels and records are deleted too.
    const roster = await deletionRoster(settings);
    let moves: string[] = [];
    try {
      moves = (await loadRegistryMoves(walletId)).moves.flatMap((move) => move.left);
    } catch {
      // A record of a newer app: its lists are read through the account's relays all the same.
    }
    // Every card's wallet's own copies, each card's wallet the checks read (deleted ones' too).
    await withCardAccessOf(seed, walletId, async (access) => {
      for (const wallet of checked.cards.wallets) {
        const own = cardOwnSecret(access.root, wallet);
        owns.push(cardOwnKeys(own));
        own.fill(0);
      }
    });
    // From now on, a backup published (another flow's change) would outlive the requests; so
    // would the price of a payment ("Wallet"'s rounds, src/features/wallet/payment-rates.ts).
    thaw = freezeAccountBackups();
    const resumeRates = await holdPaymentRates();
    // So would a payment sent's record (src/features/wallet/wallet-sends.ts).
    const resumeSends = await holdWalletSends();
    resume = () => {
      resumeRates();
      resumeSends();
    };
    const outcome = await eraseAccountRecords({
      keys: {
        backup,
        team,
        cards: [
          ...cards.map((keys) => keys.nostr),
          ...owns.flatMap((own) => [own.state.nostr, own.payees.nostr])
        ]
      },
      settings,
      roster,
      paymentHashes: checked.wallet.hashes,
      cardImages: checked.cards.images,
      // The device's and those the account left: only read; written only where the account's
      // events are found.
      otherRelays: unionRelays(currentRelays(), moves),
      network: invoiceNetwork(),
      onProgress: (progress) => onStep({ step: "relays", ...progress }),
      now: nowUnix()
    }).catch((error: unknown) => {
      logFailure("Deleting the account's records failed", error);
      const code = error instanceof ErasureError ? error.code : "unreachable";
      // The backup's deletion may be out: a backup published now would bring the account back for
      // the other devices, half deleted. The frozen backups stay so until the account closes.
      if (code === "unfinished") {
        throw new DeletionError("unfinished", "The backup's deletion is not confirmed");
      }
      thaw?.();
      resume?.();
      throw new DeletionError(code, "The relays did not confirm the deletion");
    });
    await removeCardChannels(checked.cards.channels);

    onStep({ step: "device" });
    try {
      await signOut();
    } catch (error) {
      logFailure("Wiping the device failed", error);
      throw new DeletionError("deviceNotWiped", "This device could not be wiped");
    }
    return outcome;
  } finally {
    if (backup) wipeBackupKeys(backup);
    if (team) wipeTeamKeys(team);
    if (cards) {
      wipeCardRecordKeys(cards[0]);
      wipePayeeRecordKeys(cards[1]);
      wipeHistoryRecordKeys(cards[2]);
      wipeMonthPartKeys(cards[3]);
      wipeLegacyHistoryKeys(cards[4]);
    }
    for (const own of owns) wipeCardOwnKeys(own);
    release();
  }
}
