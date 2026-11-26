import { LEGACY_WALLET_WATCH_INTERVAL_MS } from "@/config/legacy-v2";
import { getAccountWalletId, updateAccount } from "@/features/account/session";
import { requireMainWallet } from "@/features/account/main-wallet";
import { legacyWalletKeys } from "@/features/migration/flow";
import { isFreezeOwed } from "@/features/migration/freeze";
import { forgetLegacyWallet, ownsLegacyWallet } from "@/features/migration/wallet-owner";
import { accountRecoveryWallet } from "@/lib/breez/wallet";
import { logFailure } from "@/lib/log/log";
import { parseLegacyWords } from "@/lib/legacy-v2/data";
import { readLegacyWords, type LegacyPrompt } from "@/lib/legacy-v2/store";
import {
  TransferTooSmallError,
  buildLegacyTransfer,
  coinsTotal,
  isLegacyAccountKey,
  legacyAccountKey,
  legacyWatchKey,
  parseLegacyWatchKey,
  scanLegacyWallet,
  transferableSats,
  wipeLegacyKey,
  type CoinsReader,
  type LegacyChain,
  type LegacyCoin,
  type LegacyScan
} from "@/lib/legacy-v2/wallet";
import { loadLegacyWatch, saveLegacyWatch } from "@/lib/legacy-v2/watch-store";
import { MAX_LEGACY_TRANSFERS } from "@/lib/settings/merchant";
import { deviceChainSources, readChain } from "@/features/onchain/explorer";
import { fetchAddressCoins } from "@/lib/onchain/address-coins";
import { broadcastTransaction } from "@/lib/onchain/broadcast";

/*
 * The v2 wallet's funds moved to the open account's wallet (always, as soon as they cover the
 * fees): from the last screen of the migration, then from "Wallet" whenever the v2 service paid the
 * v2 wallet again (its last payouts, a till still on the v2 app, an online shop still on the v2
 * service).
 *
 * A transfer asks the device's biometrics (the v2 app put them on its words), finds the wallet's
 * coins (mempool.space, wallet.ts), spends the confirmed ones to a new deposit address of the
 * account's wallet (never one of the point of sale's: the deposit would pay a sale), which the
 * account's wallet claims as any deposit (MAX_DEPOSIT_CLAIM_FEE_SATS), and sends the transaction
 * through mempool.space. "Wallet" shows the deposit as a reception once it arrives. The account's
 * wallet must be connected (newDepositAddress, the network's rate).
 *
 * The transaction is noted in the account's settings before it is sent (`legacyTransfers`): its
 * deposit is no takings, and the split's sale (src/lib/mtpelerin/split.ts) never counts it, on any
 * of the owner's devices.
 *
 * A look without a transfer (checkLegacyWallet) needs no biometrics: the wallet's public key, kept
 * by the first transfer (watch-store.ts), finds the coins.
 *
 * The words the v2 app left on this device go only to the account that migrated from it
 * (wallet-owner.ts), and are erased once their money moved for good: nothing left in the wallet,
 * or dust no transfer ever moves, nothing on its way, and the v2 account frozen (the v2 service
 * pays the wallet no more). Until then they stay, for the next transfer ("Wallet").
 */

/**
 * What a transfer did. Amounts exact, in sats. `erased`: the words the v2 app left on this device
 * were erased after it (transferLegacyWallet).
 */
export type LegacyTransferOutcome =
  /** Sent: `outputSats` on their way to the account's wallet, `feeSats` to the network. */
  | {
      status: "sent";
      txid: string;
      outputSats: bigint;
      feeSats: bigint;
      waitingSats: bigint;
      erased?: boolean;
    }
  /** Nothing in the v2 wallet. */
  | { status: "empty"; erased?: boolean }
  /** Coins not confirmed yet only: a later transfer moves them. */
  | { status: "waiting"; waitingSats: bigint }
  /**
   * Confirmed coins that do not cover the fees (`sats`): they stay, a later transfer tries again;
   * `waitingSats` not confirmed yet.
   */
  | { status: "tooSmall"; sats: bigint; waitingSats: bigint; erased?: boolean }
  /** No v2 wallet on this device for the open account (wallet-owner.ts). */
  | { status: "absent" }
  /** Its words could not be read (the prompt dismissed, the biometrics enrolled since). */
  | { status: "unreadable" }
  /** The explorer, the network or the wallet failed: try again. */
  | { status: "failed" }
  /**
   * Words typed of a wallet nothing ever paid: not the v2 wallet's (two words swapped pass the
   * checksum once in 16). Nothing kept nor moved: never "empty", which would hide its money.
   */
  | { status: "unused" }
  /**
   * Words typed of no wallet the v2 server lists as the v2 app's (legacyWalletKeys): a slip, or
   * another wallet's words (a hardware wallet's). Nothing read, kept nor moved.
   */
  | { status: "mismatch" };

/**
 * The last look's answer and when it was given (Unix ms), in memory as the recovery of funds'
 * schedule (src/features/wallet/funds-recovery-sync.ts): the first look after each start of the
 * app reads the explorer, the next ones within LEGACY_WALLET_WATCH_INTERVAL_MS give the same answer.
 * A transfer forgets it.
 */
let lastCheck: { at: number; result: LegacyWalletCheck } | null = null;

/**
 * Called after each transfer with what it did: a screen left under another (the migration's last
 * screen, "Wallet", under "Type my 12 words") shows it and looks again.
 */
const transferListeners = new Set<(outcome: LegacyTransferOutcome) => void>();

/** Calls `listener` after each transfer; returns the unsubscribe function. */
export function subscribeLegacyTransfers(
  listener: (outcome: LegacyTransferOutcome) => void
): () => void {
  transferListeners.add(listener);
  return () => {
    transferListeners.delete(listener);
  };
}

/** For the tests: the next look reads the explorer. */
export function resetLegacyWalletCheck(): void {
  lastCheck = null;
}

/** Before reading an address again, once, after the explorer failed it (a 429, a dropped line). */
export const ADDRESS_RETRY_MS = 1_500;

/**
 * An address's coins on the device's explorer (src/features/onchain/explorer.ts: mempool.space, or
 * the merchant's own node), read again once after a failure: a look reads hundreds of them, and
 * one lost answer would fail it whole (a look that missed an address would miss its coins:
 * wallet.ts).
 */
function reader(): CoinsReader {
  return async (address) => {
    const sources = await deviceChainSources();
    const read = () => readChain(sources, (api) => fetchAddressCoins(api, address));
    try {
      return await read();
    } catch {
      await new Promise((resolve) => setTimeout(resolve, ADDRESS_RETRY_MS));
      return read();
    }
  };
}

/**
 * Where the next look starts on each chain: the first coin a transfer left (not confirmed yet, or
 * beyond what one transaction spends), else past the last used address.
 */
function nextFrom(scan: LegacyScan, left: readonly LegacyCoin[]): Record<LegacyChain, number> {
  const from = { ...scan.next };
  for (const { chain, index } of left) from[chain] = Math.min(from[chain], index);
  return from;
}

/**
 * Moves the v2 wallet's confirmed coins to the open account's wallet (see above). Never rejects:
 * a failure goes to the journal and says `failed`. The words and the keys are forgotten before it
 * returns.
 */
export async function transferLegacyWallet(prompt: LegacyPrompt): Promise<LegacyTransferOutcome> {
  if (!canReceive()) return { status: "failed" };
  const walletId = getAccountWalletId();
  // Words of another account's v2 app, or left by none that migrated here: never read.
  if (!(await ownsLegacyWallet(walletId))) return { status: "absent" };
  const read = await readLegacyWords(prompt);
  if (read.status !== "read") return { status: read.status };
  return transferWithWords(read.words, { typed: false }, async (outcome, left) =>
    walletId &&
    (outcome.status === "empty" || outcome.status === "sent" || outcome.status === "tooSmall") &&
    (await settled(left, walletId))
      ? { ...outcome, erased: await forgetLegacyWallet() }
      : outcome
  );
}

/**
 * Whether the v2 wallet's money moved for good, `left` the coins the transfer left in it (null when
 * not known): its words then serve no more. Nothing on its way, nothing a later transfer would move
 * even at the network's least rate; dust no transfer ever moves stays behind. And the v2 account
 * frozen: the v2 service pays the wallet no more (not yet: "Settings" freezes it later, the words
 * wait).
 */
async function settled(left: readonly LegacyCoin[] | null, walletId: string): Promise<boolean> {
  if (left === null || left.some((coin) => !coin.confirmed) || transferableSats(left) > 0n) {
    return false;
  }
  return !(await isFreezeOwed(walletId));
}

/**
 * "I have the 12 words, erase without moving" (end of the migration): the words the v2 app left
 * on this device are erased without moving the wallet's money, which its owner moves with the words
 * they wrote down. Only the account they go to may (wallet-owner.ts). True once they are gone.
 * Never rejects.
 */
export async function eraseLegacyWallet(): Promise<boolean> {
  if (!(await ownsLegacyWallet(getAccountWalletId()))) return false;
  lastCheck = null;
  return forgetLegacyWallet();
}

/**
 * The v2 wallet's words as its owner typed them ("Type my 12 words", src/app/migration/words.tsx),
 * in any case and spacing: 12 BIP-39 words, their checksum included; null otherwise.
 */
export function typedLegacyWords(typed: string): string[] | null {
  return parseLegacyWords(typed.toLowerCase());
}

/**
 * The same as transferLegacyWallet, with the words its owner typed (typedLegacyWords): a device
 * without the v2 app's keychain (another phone, the web app, the v2 app logged out), or whose
 * biometrics no longer open it. The words are forgotten (emptied) before it returns.
 */
export async function transferTypedWords(words: string[]): Promise<LegacyTransferOutcome> {
  if (!canReceive()) {
    words.fill("");
    return { status: "failed" };
  }
  return transferWithWords(words, { typed: true });
}

/** Whether the open account has a wallet of its own to receive the v2 wallet's coins. */
function canReceive(): boolean {
  if (!getAccountWalletId()) return false;
  try {
    // A card holder's account has no wallet to receive it: the words are not even asked.
    requireMainWallet();
    return true;
  } catch (error) {
    logFailure("Transferring the v2 wallet failed", error);
    return false;
  }
}

async function transferWithWords(
  words: string[],
  { typed }: { typed: boolean },
  after: (
    outcome: LegacyTransferOutcome,
    left: readonly LegacyCoin[] | null
  ) => Promise<LegacyTransferOutcome> = async (outcome) => outcome
): Promise<LegacyTransferOutcome> {
  const seen: Left = { coins: null };
  const outcome = await after(await moveWithWords(words, typed, seen), seen.coins);
  for (const listener of transferListeners) listener(outcome);
  return outcome;
}

/** The coins a transfer left in the v2 wallet, once known (moveWithWords). */
type Left = { coins: readonly LegacyCoin[] | null };

async function moveWithWords(
  words: string[],
  typed: boolean,
  seen: Left
): Promise<LegacyTransferOutcome> {
  const walletId = getAccountWalletId();
  let account: Awaited<ReturnType<typeof legacyAccountKey>> | null = null;
  try {
    if (!walletId) return { status: "failed" };
    const key = await legacyAccountKey(words);
    account = key;
    // The words go: only the key is used from here.
    words.fill("");
    const xpub = legacyWatchKey(key);
    // Typed words the v2 server can vouch for: one of the wallets it lists as the v2 app's.
    const listed = typed ? legacyWalletKeys() : [];
    if (listed.length > 0 && !listed.some((extended) => isLegacyAccountKey(key, extended))) {
      return { status: "mismatch" };
    }
    // From where the last transfer left the wallet (its coins below were spent), else from the
    // start: a wallet paid out daily for a year has hundreds of addresses to read only once.
    const { watch } = await loadLegacyWatch();
    const known = watch?.xpub === xpub;
    const scan = await scanLegacyWallet(account, reader(), known ? watch.from : undefined);
    // Typed words of another wallet than the one watched, none of whose addresses was ever used:
    // a slip. Kept, they would replace the v2 wallet's watch and say it is empty.
    if (typed && listed.length === 0 && !known && scan.next[0] === 0 && scan.next[1] === 0) {
      return { status: "unused" };
    }
    const keep = (left: readonly LegacyCoin[]) =>
      saveLegacyWatch({ xpub, from: nextFrom(scan, left), checkedAt: Date.now() });
    // Kept before anything is sent: whatever happens next, a later look (without the words)
    // finds these coins. A look's last answer no longer holds.
    lastCheck = null;
    await keep(scan.coins);
    // Until a transaction is sent, all of them stay.
    seen.coins = scan.coins;
    if (scan.coins.length === 0) return { status: "empty" };
    const confirmed = scan.coins.filter((coin) => coin.confirmed);
    const waitingSats = coinsTotal(scan.coins.filter((coin) => !coin.confirmed));
    if (confirmed.length === 0) return { status: "waiting", waitingSats };
    const destination = await accountRecoveryWallet.newDepositAddress(walletId);
    const feeRate = await accountRecoveryWallet.getHourFeeRate();
    let transfer;
    try {
      transfer = buildLegacyTransfer(account, confirmed, destination, feeRate);
    } catch (error) {
      if (!(error instanceof TransferTooSmallError)) throw error;
      return { status: "tooSmall", sats: coinsTotal(confirmed), waitingSats };
    }
    // Before it is sent: once on its way, its deposit must be known as the v2 wallet's coins
    // whatever becomes of this device. A transaction noted and never sent pays nothing.
    await noteLegacyTransfer(transfer.txid);
    const outcome = await readChain(await deviceChainSources(), (api) =>
      broadcastTransaction(transfer.hex, transfer.txid, {}, api)
    );
    if (outcome === "refused") {
      logFailure("The network refused the v2 wallet's transfer");
      return { status: "failed" };
    }
    // The coins the transaction did not spend: the unconfirmed ones, those beyond its inputs.
    const spent = new Set(transfer.spent.map(({ txid, vout }) => `${txid}:${vout}`));
    const left = scan.coins.filter(({ txid, vout }) => !spent.has(`${txid}:${vout}`));
    seen.coins = left;
    await keep(left);
    return {
      status: "sent",
      txid: transfer.txid,
      outputSats: transfer.outputSats,
      feeSats: transfer.feeSats,
      waitingSats
    };
  } catch (error) {
    logFailure("Transferring the v2 wallet failed", error);
    return { status: "failed" };
  } finally {
    words.fill("");
    if (account) wipeLegacyKey(account);
  }
}

/**
 * Notes `txid` among the open account's transfers of the v2 wallet's coins (its settings, backed up
 * as any change), the oldest dropped past MAX_LEGACY_TRANSFERS. Rejects when the settings cannot be
 * saved: the transfer is then not sent, and a later one tries again.
 */
async function noteLegacyTransfer(txid: string): Promise<void> {
  await updateAccount((settings) =>
    settings.legacyTransfers.includes(txid)
      ? {}
      : { legacyTransfers: [...settings.legacyTransfers, txid].slice(-MAX_LEGACY_TRANSFERS) }
  );
}

/** What a look at the v2 wallet found, without its words. */
export type LegacyWalletCheck =
  /** Never looked at with its words on this device (no public key kept): a transfer finds out. */
  | { status: "unchecked" }
  /** Nothing to move. */
  | { status: "none" }
  /**
   * Coins to move (`confirmedSats`, enough for a transfer's fees), or on their way (`waitingSats`).
   * Confirmed coins too few to ever cover the fees are not offered: `confirmedSats` 0 then.
   */
  | { status: "funds"; confirmedSats: bigint; waitingSats: bigint }
  /** The explorer did not answer: nothing is known. */
  | { status: "unknown" };

/**
 * Looks at the v2 wallet with its kept public key, from where the last transfer ended: at most once
 * in LEGACY_WALLET_WATCH_INTERVAL_MS (the same answer until then), unless `force`. Never rejects.
 */
export async function checkLegacyWallet(
  { force = false }: { force?: boolean } = {},
  now: number = Date.now()
): Promise<LegacyWalletCheck> {
  if (!force && lastCheck && now - lastCheck.at < LEGACY_WALLET_WATCH_INTERVAL_MS) {
    return lastCheck.result;
  }
  const result = await look(now);
  // Nothing known: the next opportunity asks again.
  lastCheck = result.status === "unknown" ? null : { at: now, result };
  return result;
}

async function look(now: number): Promise<LegacyWalletCheck> {
  const { watch, newer } = await loadLegacyWatch();
  if (newer) return { status: "unknown" };
  if (!watch) return { status: "unchecked" };
  const key = parseLegacyWatchKey(watch.xpub);
  if (!key) return { status: "unchecked" };
  try {
    const scan = await scanLegacyWallet(key, reader(), watch.from);
    await saveLegacyWatch({ ...watch, checkedAt: now });
    // What the transfer moves: never a coin it leaves (worth less than its own input).
    const confirmedSats = transferableSats(scan.coins);
    const waitingSats = coinsTotal(scan.coins.filter((coin) => !coin.confirmed));
    if (confirmedSats === 0n && waitingSats === 0n) return { status: "none" };
    return { status: "funds", confirmedSats, waitingSats };
  } catch (error) {
    logFailure("Looking at the v2 wallet failed", error);
    return { status: "unknown" };
  }
}
