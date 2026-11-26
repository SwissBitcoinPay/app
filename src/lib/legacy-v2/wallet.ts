import { pbkdf2Async } from "@noble/hashes/pbkdf2.js";
import { sha512 } from "@noble/hashes/sha2.js";
import { HDKey } from "@scure/bip32";
import { NETWORK, Transaction, p2wpkh } from "@scure/btc-signer";

import {
  LEGACY_WALLET_ACCOUNT_PATH,
  LEGACY_WALLET_GAP_LIMIT,
  LEGACY_WALLET_MAX_ADDRESSES,
  LEGACY_WALLET_MAX_INPUTS,
  LEGACY_WALLET_SCAN_CONCURRENCY
} from "@/config/legacy-v2";
import { MAX_DEPOSIT_CLAIM_FEE_SATS } from "@/lib/breez/config";
import type { AddressCoin, AddressCoins } from "@/lib/onchain/address-coins";

/*
 * The wallet the v2 app created for its owner (12 words on the device, data.ts), emptied into the
 * sattle.me account's wallet by the migration (always, whatever the amount, as soon as it covers
 * the fees). A BIP-84 wallet (LEGACY_WALLET_ACCOUNT_PATH): its
 * addresses are found as any wallet finds them, chain by chain until LEGACY_WALLET_GAP_LIMIT unused
 * ones in a row, their coins read from the explorer (address-coins.ts); one transaction spends the
 * confirmed ones to an address of the account's wallet, signed here (@scure/btc-signer, of the
 * author of @noble). Mainnet only, as the v2 app's wallet.
 *
 * The words and the keys stay in memory for the transfer only: the caller wipes the account's key
 * (wipeLegacyKey) once signed. Only the account's public key may be kept (it spends nothing), to
 * look later for what the v2 service still pays the wallet.
 */

/** Receive (0) and change (1), the two chains of a BIP-44 account. */
export type LegacyChain = 0 | 1;

/** A coin of the v2 wallet, with where it is. */
export type LegacyCoin = AddressCoin & { chain: LegacyChain; index: number };

/** Reads an address's coins (fetchAddressCoins, of the explorer the caller chose). */
export type CoinsReader = (address: string) => Promise<AddressCoins>;

/** What a look over the v2 wallet found. */
export type LegacyScan = {
  /** Its coins not spent yet, confirmed or not. */
  coins: LegacyCoin[];
  /** By chain: the index of the first address after the last used one (where the next look starts). */
  next: Record<LegacyChain, number>;
};

/**
 * The BIP-39 seed of the words (PBKDF2-HMAC-SHA512, 2048 rounds, salt "mnemonic", no
 * passphrase: the v2 app's `BIP84.fromMnemonic(words, undefined)`), then its account key.
 */
export async function legacyAccountKey(words: readonly string[]): Promise<HDKey> {
  const encoder = new TextEncoder();
  const password = encoder.encode(words.join(" ").normalize("NFKD"));
  const seed = await pbkdf2Async(sha512, password, encoder.encode("mnemonic"), {
    c: 2048,
    dkLen: 64
  });
  try {
    const root = HDKey.fromMasterSeed(seed);
    try {
      return root.derive(LEGACY_WALLET_ACCOUNT_PATH);
    } finally {
      root.wipePrivateData();
    }
  } finally {
    seed.fill(0);
    password.fill(0);
  }
}

/** The account's public key alone, to keep: it finds the wallet's addresses, spends nothing. */
export function legacyWatchKey(account: HDKey): string {
  return account.publicExtendedKey;
}

/** The key of a kept public key (legacyWatchKey); null when it is no account's public key. */
export function parseLegacyWatchKey(xpub: string): HDKey | null {
  try {
    const key = HDKey.fromExtendedKey(xpub);
    return key.privateKey === null && key.depth === 3 ? key : null;
  } catch {
    return null;
  }
}

/**
 * The BIP-32 versions of a mainnet account's public key: xpub, and SLIP-132's ypub and zpub (the
 * v2 app gave the v2 server its wallet as a zpub: SwissBitcoinPay/app, `generateBtcAddress.ts`).
 */
const PUBLIC_KEY_VERSIONS = [0x0488b21e, 0x049d7cb2, 0x04b24746];

/**
 * The account public key `extended` names (an xpub, ypub or zpub, as the v2 server lists the
 * merchant's wallets), in BIP-32's own versions; null for anything else (a private key included).
 */
export function parseLegacyAccountPublicKey(extended: string): HDKey | null {
  for (const version of PUBLIC_KEY_VERSIONS) {
    let key: HDKey;
    try {
      key = HDKey.fromExtendedKey(extended, { public: version, private: 0 });
    } catch {
      continue;
    }
    if (key.privateKey !== null || key.publicKey === null || key.chainCode === null) return null;
    return new HDKey({
      depth: key.depth,
      index: key.index,
      parentFingerprint: key.parentFingerprint,
      chainCode: key.chainCode,
      publicKey: key.publicKey
    });
  }
  return null;
}

/**
 * Whether `extended` (parseLegacyAccountPublicKey) is the public key of `account`: the same key and
 * chain code at the same depth, whatever its version. False for anything else, never an exception.
 */
export function isLegacyAccountKey(account: HDKey, extended: string): boolean {
  const key = parseLegacyAccountPublicKey(extended);
  const [publicKey, chainCode] = [key?.publicKey ?? null, key?.chainCode ?? null];
  return (
    key !== null &&
    publicKey !== null &&
    chainCode !== null &&
    account.publicKey !== null &&
    account.chainCode !== null &&
    key.depth === account.depth &&
    equalBytes(publicKey, account.publicKey) &&
    equalBytes(chainCode, account.chainCode)
  );
}

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((byte, at) => byte === b[at]);
}

/** Forgets the private keys of `account` (and its children's it derived). */
export function wipeLegacyKey(account: HDKey): void {
  account.wipePrivateData();
}

function childKey(account: HDKey, chain: LegacyChain, index: number): HDKey {
  return account.deriveChild(chain).deriveChild(index);
}

/** The address at `index` of `chain` (P2WPKH, bech32, lowercase). */
export function legacyAddress(account: HDKey, chain: LegacyChain, index: number): string {
  const { publicKey } = childKey(account, chain, index);
  if (!publicKey) throw new Error("No public key");
  const { address } = p2wpkh(publicKey, NETWORK);
  if (!address) throw new Error("No address");
  return address;
}

/**
 * The addresses of `chain` from `from` on, read LEGACY_WALLET_SCAN_CONCURRENCY at a time, until
 * LEGACY_WALLET_GAP_LIMIT unused ones in a row (LEGACY_WALLET_MAX_ADDRESSES at most). Rejects when
 * one cannot be read: a look that missed an address would miss its coins. A batch is waited for
 * whole before it rejects (with the failure of its first address that failed): a look that ended
 * leaves no read of its own running, nor retrying, behind it.
 */
async function scanChain(
  account: HDKey,
  chain: LegacyChain,
  from: number,
  read: CoinsReader
): Promise<{ coins: LegacyCoin[]; next: number }> {
  const coins: LegacyCoin[] = [];
  let next = from;
  let index = from;
  while (index - next < LEGACY_WALLET_GAP_LIMIT) {
    if (index >= LEGACY_WALLET_MAX_ADDRESSES) throw new Error("Too many addresses used");
    const batch = Array.from(
      { length: Math.min(LEGACY_WALLET_SCAN_CONCURRENCY, LEGACY_WALLET_MAX_ADDRESSES - index) },
      (_, offset) => index + offset
    );
    const settled = await Promise.allSettled(
      batch.map(async (at) => ({ at, found: await read(legacyAddress(account, chain, at)) }))
    );
    const read_ = settled.map((result) => {
      if (result.status === "rejected") throw result.reason;
      return result.value;
    });
    for (const { at, found } of read_) {
      if (!found.used) continue;
      next = Math.max(next, at + 1);
      for (const coin of found.coins) coins.push({ ...coin, chain, index: at });
    }
    index += batch.length;
  }
  return { coins, next };
}

/**
 * The v2 wallet's coins, from the indexes of `from` on (a first look: 0 on both chains). Both
 * chains: the v2 server paid to the receive chain, the v2 app's own sends left change on the other.
 */
export async function scanLegacyWallet(
  account: HDKey,
  read: CoinsReader,
  from: Record<LegacyChain, number> = { 0: 0, 1: 0 }
): Promise<LegacyScan> {
  const receive = await scanChain(account, 0, from[0], read);
  const change = await scanChain(account, 1, from[1], read);
  return { coins: [...receive.coins, ...change.coins], next: { 0: receive.next, 1: change.next } };
}

/** The sum of `coins`, exact. */
export function coinsTotal(coins: readonly { sats: bigint }[]): bigint {
  return coins.reduce((sum, { sats }) => sum + sats, 0n);
}

/**
 * The least a transfer leaves the account: a Taproot output's dust limit (330 sats, the account's
 * deposit addresses: src/lib/onchain/address.ts) and the most the account's wallet pays to claim
 * the deposit (MAX_DEPOSIT_CLAIM_FEE_SATS), so that something reaches the balance.
 */
export const MIN_TRANSFER_OUTPUT_SATS = 330n + MAX_DEPOSIT_CLAIM_FEE_SATS;

/** A P2WPKH input's size, in vbytes, rounded up (its signature at most 73 bytes). */
const INPUT_VBYTES = 68n;

/**
 * The confirmed coins of `coins` a transfer at `feeRate` spends: the largest first,
 * LEGACY_WALLET_MAX_INPUTS at most, only those worth more than their own input's fee as
 * buildLegacyTransfer charges it (INPUT_VBYTES and the vbyte it adds per coin: one that costs more
 * than it holds would leave the account less).
 */
function spendable<C extends { sats: bigint; confirmed: boolean }>(
  coins: readonly C[],
  feeRate: bigint
): C[] {
  return coins
    .filter(({ confirmed, sats }) => confirmed && sats > (INPUT_VBYTES + 1n) * feeRate)
    .sort((a, b) => (a.sats === b.sats ? 0 : a.sats > b.sats ? -1 : 1))
    .slice(0, LEGACY_WALLET_MAX_INPUTS);
}

/**
 * What a transfer of `coins` moves before its fees (the confirmed coins it spends at the network's
 * least rate: spendable), when it can leave MIN_TRANSFER_OUTPUT_SATS (coversLeastFees); else 0:
 * the coins worth less than their own input are never told as money to move.
 */
export function transferableSats(coins: readonly { sats: bigint; confirmed: boolean }[]): bigint {
  return coversLeastFees(coins) ? coinsTotal(spendable(coins, 1n)) : 0n;
}

/**
 * Whether `coins` (their confirmed ones) could leave MIN_TRANSFER_OUTPUT_SATS after the fees of
 * their transfer at the network's least rate (1 sat/vB): a P2WPKH input is some 68 vB, a Taproot
 * output 43, the rest 11. Coins that cannot are dust no transfer ever moves: never offered.
 */
export function coversLeastFees(coins: readonly { sats: bigint; confirmed: boolean }[]): boolean {
  // The coins buildLegacyTransfer would spend at that rate: the largest, each worth its input.
  const confirmed = spendable(coins, 1n);
  if (confirmed.length === 0) return false;
  const leastFee = 11n + 43n + INPUT_VBYTES * BigInt(confirmed.length);
  return coinsTotal(confirmed) - leastFee >= MIN_TRANSFER_OUTPUT_SATS;
}

/**
 * Whether a wallet holding `totalSats` in all (a balance the explorer gives, its coins not known)
 * could ever leave MIN_TRANSFER_OUTPUT_SATS after a transfer's least fees: one input at the least
 * rate (coversLeastFees). False: dust, nothing to ask words for.
 */
export function couldCoverLeastFees(totalSats: bigint): boolean {
  return totalSats - (11n + 43n + INPUT_VBYTES) >= MIN_TRANSFER_OUTPUT_SATS;
}

/** A signed transfer, ready to broadcast. */
export type LegacyTransfer = {
  hex: string;
  /** Lowercase hex. */
  txid: string;
  /** What its coins hold. */
  inputSats: bigint;
  /** The network's fee it pays. */
  feeSats: bigint;
  /** What reaches the deposit address. */
  outputSats: bigint;
  /** The coins it spends, in its inputs' order. */
  spent: LegacyCoin[];
};

/** The coins too few to cover the transfer's fees (MIN_TRANSFER_OUTPUT_SATS after them). */
export class TransferTooSmallError extends Error {
  readonly inputSats: bigint;
  readonly feeSats: bigint;

  constructor(inputSats: bigint, feeSats: bigint) {
    super("The coins do not cover the transfer's fees");
    this.name = "TransferTooSmallError";
    this.inputSats = inputSats;
    this.feeSats = feeSats;
  }
}

function signedTransfer(
  account: HDKey,
  coins: readonly LegacyCoin[],
  destination: string,
  outputSats: bigint
): Transaction {
  const tx = new Transaction();
  for (const coin of coins) {
    const { publicKey } = childKey(account, coin.chain, coin.index);
    if (!publicKey) throw new Error("No public key");
    tx.addInput({
      txid: coin.txid,
      index: coin.vout,
      witnessUtxo: { script: p2wpkh(publicKey, NETWORK).script, amount: coin.sats }
    });
  }
  tx.addOutputAddress(destination, outputSats, NETWORK);
  coins.forEach((coin, at) => {
    const key = childKey(account, coin.chain, coin.index);
    if (!key.privateKey) throw new Error("No private key");
    try {
      tx.signIdx(key.privateKey, at);
    } finally {
      key.wipePrivateData();
    }
  });
  tx.finalize();
  return tx;
}

/**
 * The transaction that spends `coins` (their confirmed ones worth more than their input's fee,
 * LEGACY_WALLET_MAX_INPUTS at most, the largest first: spendable) to `destination`, at `feeRate`
 * sat/vB: one output, the coins less the fee, for the transaction's size (signed once to measure
 * it, then again with the fee it gives, a vbyte more per coin: a signature may come out a byte
 * longer the second time). Throws TransferTooSmallError when fewer than MIN_TRANSFER_OUTPUT_SATS
 * would be left. `account` must hold its private key.
 */
export function buildLegacyTransfer(
  account: HDKey,
  coins: readonly LegacyCoin[],
  destination: string,
  feeRate: bigint
): LegacyTransfer {
  if (feeRate < 1n) throw new Error("Invalid fee rate");
  const spent = spendable(coins, feeRate);
  const inputSats = coinsTotal(spent);
  if (spent.length === 0) throw new TransferTooSmallError(0n, 0n);
  // Measured with an output of 1 sat: an amount takes 8 bytes whatever its value, and one above
  // what the coins hold could not be signed.
  const measured = signedTransfer(account, spent, destination, 1n);
  const feeSats = BigInt(measured.vsize + spent.length) * feeRate;
  const outputSats = inputSats - feeSats;
  if (outputSats < MIN_TRANSFER_OUTPUT_SATS) throw new TransferTooSmallError(inputSats, feeSats);
  const tx = signedTransfer(account, spent, destination, outputSats);
  if (tx.fee !== feeSats) throw new Error("Unexpected fee");
  return {
    hex: tx.hex,
    txid: tx.id,
    inputSats,
    feeSats,
    outputSats,
    spent
  };
}
