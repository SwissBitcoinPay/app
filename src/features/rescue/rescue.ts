import { CARD_WALLET_CHECK_MS } from "@/config/card";
import {
  AccountNotFoundError,
  closeAccount,
  isAccountOpenedByWords,
  openAccount
} from "@/features/account/session";
import { openAccountWallet } from "@/features/account/wallet-access";
import { cardSendSource, leaseCardWallet, type CardWalletLease } from "@/features/card/card-wallet";
import { refreshCardStates, resetCardStates, withCardAccess } from "@/features/card/states";
import { cardWithdrawalSource } from "@/features/card/withdrawal-source";
import { recoverCardFunds } from "@/features/wallet/funds-recovery-sync";
import type { SendSource } from "@/features/wallet/send/useSend";
import { BIP39_ENGLISH } from "@/lib/breez/bip39-english";
import { WalletError } from "@/lib/breez/errors";
import { isBip39Phrase } from "@/lib/breez/recovery-phrase";
import { mnemonicSeed } from "@/lib/breez/seed";
import type { WalletSeed } from "@/lib/breez/types";
import {
  checkWalletConfig,
  connectWallet,
  disconnectCardWallets,
  disconnectWallet,
  getWalletBalance,
  getWalletId,
  getWalletPayment,
  isWalletConnected,
  listPendingDeposits,
  parseSendInput,
  prepareSend,
  prepareWalletDrain,
  sendPrepared,
  walletIdOf
} from "@/lib/breez/wallet";
import { erasedThrough, type CardState } from "@/lib/card/card-record";
import { FIRST_CARD_WALLET_GENERATION, type CardWalletOf } from "@/lib/card/keys";
import { forgetCardPayees } from "@/lib/card/payees";
import { logFailure } from "@/lib/log/log";
import type { MerchantSettings } from "@/lib/settings/merchant";
import { within } from "@/lib/within";

import { RescueClosedError } from "./closed-error";
import { noteTracesBeforeRescue, removeRescueTraces } from "./traces";

/*
 * "Open with my 12 words": when the passkey no longer opens the account (its domain gone, the
 * passkey
 * lost), its owner types the recovery phrase "Recovery phrase" shows, and sends the funds
 * of the account's wallet and of each of its cards' wallets away, and exports the history. Nothing
 * else: the words never unlock the app (lock.ts), nor are they kept anywhere but in memory, with the
 * account they open (session.ts), until the screen closes (closeRescue), it is left alone
 * RESCUE_IDLE_CLOSE_MS (RescueScreen.tsx) or the app stops.
 *
 * The words give the very seed the passkey gives (recovery-phrase.ts: the passkey's wallet is
 * `Seed.Mnemonic` of those words, without passphrase), so the same account, the same card keys and
 * wallets. An account no relay of the device holds (its relays gone, or changed on another device)
 * still gives its own wallet (`walletOnly`): its cards' wallets need their records to be found.
 */

/**
 * Without any activity this long, once a word is typed, the rescue closes and its words are
 * forgotten (5 minutes, as the till's auto-lock, the time in the
 * background included; RescueScreen.tsx). Its payments are confirmed by the words alone.
 */
export const RESCUE_IDLE_CLOSE_MS = 5 * 60 * 1000;

/** Words of the app's recovery phrase: always 12 (16 bytes of the passkey's PRF output). */
export const RECOVERY_WORD_COUNT = 12;

/**
 * The words typed or pasted: lowercase, each word once, whatever the spacing and line breaks. A
 * number before a word ("1. legal", as written down from "Recovery phrase") is left out.
 */
export function readRecoveryWords(text: string): string[] {
  return text
    .toLowerCase()
    .split(/\s+/)
    .map((word) => word.replace(/^\d+[.):-]?/, ""))
    .filter((word) => word !== "");
}

const KNOWN = new Set(BIP39_ENGLISH);

/** What is wrong with words typed, the first thing to fix only. */
export type WordsProblem =
  /** Fewer or more than 12. */
  | { code: "count"; count: number }
  /** A word not of the list (`position`: from 1). */
  | { code: "unknown"; position: number }
  /** 12 words of the list whose checksum fails: one is wrong, or two are swapped. */
  | { code: "checksum" };

/** Null when `words` are a recovery phrase of the app (12 English BIP-39 words, checksum held). */
export function wordsProblem(words: readonly string[]): WordsProblem | null {
  if (words.length !== RECOVERY_WORD_COUNT) return { code: "count", count: words.length };
  const unknown = words.findIndex((word) => !KNOWN.has(word));
  if (unknown >= 0) return { code: "unknown", position: unknown + 1 };
  return isBip39Phrase(words) ? null : { code: "checksum" };
}

/** What the words opened. */
export type RescueOpening =
  /** The account, from its backup: its own wallet (a merchant's) and its cards' wallets. */
  | { kind: "account"; walletId: string; settings: MerchantSettings }
  /** No relay of the device holds its backup: the wallet of the words alone. */
  | { kind: "walletOnly"; walletId: string };

export { RescueClosedError } from "./closed-error";

/**
 * The seed of a rescue without account (`walletOnly`): kept here, in memory only, until
 * closeRescue. With an account, the session holds it (session.ts).
 */
let walletOnlySeed: WalletSeed | null = null;
/** Bumped at each opening and closing: a step that outlived its rescue does nothing more. */
let generation = 0;

/** The seed of the open rescue without account, null otherwise (rescue-wallet.ts connects it). */
export function walletOnlyRescueSeed(): WalletSeed | null {
  return walletOnlySeed;
}

/** Whether a rescue is open: an account opened with its words, or a wallet without account. */
export function isRescueOpen(): boolean {
  return isAccountOpenedByWords() || walletOnlySeed !== null;
}

/**
 * Opens what `words` give (wordsProblem must be null): the account from its backup on the device's
 * relays, else its wallet alone. Whatever was open before closes first (another account, wallets).
 * Rejects with the account's errors (settingsTooNew) or the wallet's (notConfigured), nothing left
 * open then.
 */
export async function openRescue(
  words: readonly string[],
  businessNameWord: string
): Promise<RescueOpening> {
  if (wordsProblem(words) !== null) throw new Error("Not a recovery phrase of the app");
  // Before anything: a build that cannot open a wallet must not read the account.
  checkWalletConfig();
  await closeRescue();
  // What the device holds before: taken back once the rescue closes (traces.ts).
  await noteTracesBeforeRescue();
  const opening = generation;
  const seed = mnemonicSeed(words.join(" "));
  const walletId = await walletIdOf(seed);
  if (opening !== generation) throw new RescueClosedError();
  try {
    const settings = await openAccount({
      seed,
      openedBy: "words",
      walletId,
      created: false,
      // Never asked: a words' opening starts no sign-up (session.ts).
      detect: () => Promise.reject(new Error("No sign-up from the recovery phrase")),
      businessNameWord
    });
    if (opening !== generation) {
      closeAccount();
      throw new RescueClosedError();
    }
    return { kind: "account", walletId, settings };
  } catch (error) {
    if (!(error instanceof AccountNotFoundError) || opening !== generation) throw error;
    walletOnlySeed = seed;
    return { kind: "walletOnly", walletId };
  }
}

/**
 * Closes the rescue: the account it opened (its keys wiped, its seed dropped) and every wallet
 * connected with its words, then what it left on the device (traces.ts: a borrowed phone keeps
 * nothing of the business) and what the session read of its cards.
 * Another account (a passkey's) is left alone. Never rejects.
 */
export async function closeRescue(): Promise<void> {
  const open = isRescueOpen();
  generation++;
  walletOnlySeed = null;
  if (isAccountOpenedByWords()) closeAccount();
  await Promise.all([
    disconnectWallet().catch((error: unknown) => logFailure("Closing the rescue failed", error)),
    disconnectCardWallets().catch((error: unknown) =>
      logFailure("Closing the rescue's cards failed", error)
    )
  ]);
  if (open) {
    resetCardStates();
    forgetCardPayees();
  }
  // Once its wallets are disconnected: their storage may go.
  await removeRescueTraces();
}

/**
 * Before a payment leaves: the words were typed for this rescue, which must still be open (the
 * passkey is never asked: it is what no longer works).
 */
async function confirmRescue(): Promise<void> {
  if (!isRescueOpen()) throw new RescueClosedError();
  return Promise.resolve();
}

/** The connection of the wallet of the words alone in progress, shared by the calls meanwhile. */
let connectingWalletOnly: Promise<void> | null = null;

/**
 * Connects the wallet of the words, `walletId`, unless it is: the account's own (openAccountWallet,
 * a merchant's: "Export" shares it, and disconnects it once its sheet closes), or, without
 * account, the wallet of the words alone, checked to be `walletId` once connected. Rejects with
 * RescueClosedError once the rescue closed.
 */
export async function connectRescueWallet(walletId: string): Promise<void> {
  if (isAccountOpenedByWords()) return openAccountWallet();
  const seed = walletOnlySeed;
  if (!seed) throw new RescueClosedError();
  connectingWalletOnly ??= (async () => {
    const opening = generation;
    if (isWalletConnected() && (await getWalletId()).toLowerCase() === walletId.toLowerCase()) {
      return;
    }
    await disconnectWallet();
    if (opening !== generation) throw new RescueClosedError();
    await connectWallet(seed);
    // Closed meanwhile, or another wallet: nothing of it stays connected.
    if (opening !== generation) {
      await disconnectWallet();
      throw new RescueClosedError();
    }
    if ((await getWalletId()).toLowerCase() !== walletId.toLowerCase()) {
      await disconnectWallet();
      throw new WalletError("notConnected", "Another wallet than the words' connected");
    }
  })().finally(() => {
    connectingWalletOnly = null;
  });
  return connectingWalletOnly;
}

/** What the wallet of the words, `walletId`, holds once synced (connectRescueWallet first). */
export async function readRescueWalletFunds(walletId: string): Promise<RescueFunds> {
  await connectRescueWallet(walletId);
  const sats = await getWalletBalance(true);
  const pending = await listPendingDeposits();
  return { sats, arrivingSats: pending.reduce((sum, deposit) => sum + deposit.amountSats, 0n) };
}

/**
 * How the rescue sends the whole balance of the wallet of the words, `walletId`, away: connected
 * again first when "Export" closed it meanwhile; the words, not the passkey, confirm it.
 */
export function rescueWalletSource(walletId: string): SendSource {
  const connected = async <T>(run: () => Promise<T>): Promise<T> => {
    await connectRescueWallet(walletId);
    return run();
  };
  return {
    parseSendInput: (text) => connected(() => parseSendInput(text)),
    prepareSend: (destination, amountSats) => connected(() => prepareSend(destination, amountSats)),
    prepareDrain: (destination, totalSats) =>
      connected(() => prepareWalletDrain(destination, totalSats)),
    sendPrepared: (quote, options) => connected(() => sendPrepared(quote, options)),
    getPayment: (id) => connected(() => getWalletPayment(id)),
    confirm: confirmRescue
  };
}

/** A wallet of a card the rescue found. */
export type RescueCardWallet = {
  wallet: CardWalletOf;
  /** The card's name, as "Cards" shows it. */
  name: string;
  /**
   * The wallet the card pays from now (or would, once added again: a programming stopped), whose
   * withdrawals "History" tells; else one no card shows any more (erased-funds.ts).
   */
  current: boolean;
};

/** Each card's wallets, the current one first, then its earlier ones (erasedThrough). */
export function rescueCardWallets(states: readonly CardState[]): RescueCardWallet[] {
  return states.flatMap((state) => {
    const erased = erasedThrough(state);
    const wallets: RescueCardWallet[] = [];
    for (
      let walletGeneration = state.walletGeneration;
      walletGeneration >= FIRST_CARD_WALLET_GENERATION;
      walletGeneration--
    ) {
      wallets.push({
        wallet: { cardId: state.cardId, walletGeneration },
        name: state.name,
        current: walletGeneration - FIRST_CARD_WALLET_GENERATION >= erased
      });
    }
    return wallets;
  });
}

/** The cards the relays hold. `conclusive`: a majority answered, none is missing. */
export type RescueCards = { wallets: RescueCardWallet[]; conclusive: boolean };

/** The open account's cards' wallets, from a majority of its relays (refreshCardStates). */
export function readRescueCards(): Promise<RescueCards> {
  return withCardAccess(async (access) => {
    const read = await refreshCardStates(access);
    return { wallets: rescueCardWallets(read.states), conclusive: read.conclusive };
  });
}

/** What a wallet holds once synced: its balance, and its on-chain deposits not credited yet. */
export type RescueFunds = { sats: bigint; arrivingSats: bigint };

/**
 * What the card's wallet `card` holds once synced; null when it could not be read within
 * CARD_WALLET_CHECK_MS (never told empty then). Funds out of its balance are brought back to it in
 * the background, as "Cards" does (erased-funds.ts). Never rejects.
 */
export async function readRescueCardFunds(card: CardWalletOf): Promise<RescueFunds | null> {
  try {
    return await within(
      withCardAccess(async (access) => {
        const lease = await leaseCardWallet(access, card);
        try {
          const sats = await lease.wallet.getBalance(true);
          const pending = await lease.wallet.listPendingDeposits();
          if ((await lease.wallet.getRecoverableFunds(false)) > 0n) {
            void recoverCardFunds(access.walletId, card, { connect: true });
          }
          return {
            sats,
            arrivingSats: pending.reduce((sum, deposit) => sum + deposit.amountSats, 0n)
          };
        } finally {
          await lease.release();
        }
      }),
      CARD_WALLET_CHECK_MS
    );
  } catch (error) {
    logFailure("Reading a card's wallet in the rescue failed", error);
    return null;
  }
}

/** The card's wallet `card`, connected while its panel shows: `release()` once it closes. */
export function leaseRescueCardWallet(card: CardWalletOf): Promise<CardWalletLease> {
  return withCardAccess((access) => leaseCardWallet(access, card));
}

/**
 * How the rescue sends a card's wallet's balance away: the card's own, noted first as its
 * withdrawal (withdrawal-source.ts) so that "History" tells it; one no card shows any more, as
 * "Cards" empties it (ErasedDrainSheet: no note). The words, not the passkey, confirm it.
 */
export function rescueCardSource(lease: CardWalletLease, current: boolean): SendSource {
  const source = current ? cardWithdrawalSource(lease) : cardSendSource(lease);
  return { ...source, confirm: confirmRescue };
}
