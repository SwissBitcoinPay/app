import {
  ONCHAIN_CHECK_FRESH_MS,
  ONCHAIN_CHECK_WAIT_MS,
  ONCHAIN_POOL_SIZE,
  isOnchainAvailable
} from "@/config/onchain";
import { MEMBER_LOT_SIZE } from "@/config/team";
import { withAccountWallet } from "@/features/account/background-wallet";
import { getAccountWalletId, whenAccountSynced } from "@/features/account/session";
import { deviceChainSources, readChain } from "@/features/onchain/explorer";
import { readEmptyLot } from "@/features/team/member";
import { lotAddresses, returnToLot, takeFromLot } from "@/features/team/member-addresses";
import { getBreezNetwork } from "@/lib/breez/config";
import { newDepositAddress } from "@/lib/breez/wallet";
import { logFailure } from "@/lib/log/log";
import { fetchAddressTxs } from "@/lib/onchain/esplora";
import {
  ONCHAIN_POOL_VERSION,
  isMemberProfile,
  type AddressPool,
  type OnchainPool,
  type TerminalProfile
} from "@/lib/terminal/model";
import { loadOnchainPool, saveOnchainPool } from "@/lib/terminal/profile";

/**
 * The on-chain addresses this device shows on its invoices. The merchant's wallet hands them out
 * once the account is open (login, unlock,
 * "Start accepting payments"), and again after each address a sale or an invoice takes while it
 * stays open (the pool never runs out over a long session):
 * as soon as one is missing, it is connected in the background and fills the pool up to
 * ONCHAIN_POOL_SIZE, without time limit (as for the employees' lots), then
 * disconnected (syncOnchainPool). An employee's device has none of the wallet's: it takes them
 * from the lot the owner gave it (src/features/team/member-addresses.ts).
 * The point of sale, which has no wallet, takes one per invoice shown:
 * - an address is never shown twice: a payer may pay it any time, even long after;
 * - an address is shown only once the explorer says nothing ever paid it:
 *   one paid already is dropped from the pool and the next one is taken; when the explorer
 *   cannot tell in time, the sale is Lightning only and the address stays;
 * - except the address of an invoice paid over Lightning with nothing on-chain: it goes back to
 *   the pool, behind the others (its payer had no reason to pay it);
 * - and the address of a sale shared as a payment link that nothing paid, once the link's final
 *   version left it out (src/features/payment-link/finalize.ts): the
 *   payer's page shows it no more;
 * - an address goes back only once the explorer shows that nothing ever paid it, and only to the
 *   pool of the wallet that handed it out;
 * - an empty pool leaves the invoice Lightning only, until the wallet connects again.
 * A sale left Lightning only this way says why (takeOnchainAddress): the point of sale tells the
 * merchant (charge.tsx).
 */

export type { AddressPool };

/**
 * Why a sale that should offer an on-chain address shows none:
 * - `explorer`: the explorer could not tell within ONCHAIN_CHECK_WAIT_MS that nothing ever paid the
 *   next address (an error, an HTTP 503, no answer): the address stays for a later sale;
 * - `empty`: no address left, in the pool of the wallet (not filled yet, used up, another wallet's)
 *   or in the employee's lot (none given yet, used up), every address checked having been paid
 *   already included;
 * - `error`: the stored addresses could not be read or written.
 */
export type OnchainUnavailable = "explorer" | "empty" | "error";

/**
 * The address a sale shows, or why it shows none: `unavailable` is null when on-chain payments are
 * not offered at all (a network without an explorer, isOnchainAvailable).
 */
export type OnchainTake =
  | { address: string; unavailable: null }
  | { address: null; unavailable: OnchainUnavailable | null };

const unavailable = (reason: OnchainUnavailable | null): OnchainTake => ({
  address: null,
  unavailable: reason
});

export function walletPool(walletId: string): AddressPool {
  return { kind: "wallet", walletId };
}

/** The pool of the point of sale of `profile`: its wallet's, or an employee's lot. */
export function addressPoolOf(profile: TerminalProfile): AddressPool {
  return isMemberProfile(profile)
    ? { kind: "team", team: profile.team }
    : walletPool(profile.walletId);
}

/** Reads and writes of the pool, one after the other: two sales never take the same address. */
let queue: Promise<unknown> = Promise.resolve();

function serialized<T>(operation: () => Promise<T>): Promise<T> {
  const next = queue.then(operation, operation);
  queue = next.catch(() => undefined);
  return next;
}

/** The pool of `walletId`'s addresses on this device; another wallet's counts as none. */
async function poolOf(walletId: string): Promise<OnchainPool> {
  const stored = await loadOnchainPool(getBreezNetwork());
  return stored && stored.walletId.toLowerCase() === walletId.toLowerCase()
    ? stored
    : { version: ONCHAIN_POOL_VERSION, walletId, addresses: [] };
}

/**
 * The addresses left of `pool`, in the order to take them. An employee's lot with none left is read
 * again for the next sale (readEmptyLot): the owner may have given it since.
 */
async function addressesOf(pool: AddressPool): Promise<string[]> {
  if (pool.kind === "team") {
    const addresses = await lotAddresses(pool.team);
    if (addresses.length === 0) void readEmptyLot(pool.team);
    return addresses;
  }
  return (await serialized(() => poolOf(pool.walletId))).addresses;
}

/** Takes `address` out of `pool` (for a sale, or paid already): false when it is no longer there. */
function removeFrom(pool: AddressPool, address: string): Promise<boolean> {
  if (pool.kind === "team") return takeFromLot(pool.team, address);
  return serialized(async () => {
    const stored = await poolOf(pool.walletId);
    if (!stored.addresses.includes(address)) return false;
    await saveOnchainPool({
      ...stored,
      addresses: stored.addresses.filter((other) => other !== address)
    });
    return true;
  });
}

/** The explorer's answers, by address: when it said nothing paid it, or the request running. */
const checks = new Map<string, { at: number | null; unused: Promise<boolean | null> }>();

/**
 * Whether nothing ever paid `address`, from an answer of the last ONCHAIN_CHECK_FRESH_MS or a
 * request running, else asked now. Null when the explorer cannot tell.
 */
function checkAddress(address: string): Promise<boolean | null> {
  const known = checks.get(address);
  if (known && (known.at === null || Date.now() - known.at < ONCHAIN_CHECK_FRESH_MS)) {
    return known.unused;
  }
  for (const [other, { at }] of checks) {
    if (at !== null && Date.now() - at >= ONCHAIN_CHECK_FRESH_MS) checks.delete(other);
  }
  const entry: { at: number | null; unused: Promise<boolean | null> } = {
    at: null,
    unused: isAddressUnused(address)
  };
  checks.set(address, entry);
  void entry.unused.then((unused) => {
    // Only "nothing paid it" is kept: an address paid already leaves the pool, a failure is asked
    // again.
    if (unused === true) entry.at = Date.now();
    else if (checks.get(address) === entry) checks.delete(address);
  });
  return entry.unused;
}

/**
 * Starts checking the address the next sale would take from `pool` (at "Charge"), so that its
 * invoice need not wait for the explorer (takeOnchainAddress).
 */
export function prepareOnchainAddress(pool: AddressPool): void {
  if (!isOnchainAvailable()) return;
  addressesOf(pool).then(
    ([address]) => {
      if (address !== undefined) void checkAddress(address);
    },
    (error: unknown) => {
      logFailure("Could not read the on-chain addresses", error);
    }
  );
}

/** `promise`'s value, or null past `ms`. */
function within<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), Math.max(0, ms));
  });
  return Promise.race([promise, late]).finally(() => clearTimeout(timer));
}

/**
 * The address for an invoice about to be shown, gone from the pool before it is shown (a crash
 * meanwhile loses an address, never shows one twice), once the explorer said that nothing ever
 * paid it: one paid already leaves the pool, the next one is checked. None, with why
 * (OnchainUnavailable), when the pool is empty or unusable, or when the explorer cannot tell within
 * ONCHAIN_CHECK_WAIT_MS (the address stays). Never asked again for the same sale (useSale.ts): its
 * code, and a link shared of it, would change. Only the explorers the address is watched on are
 * asked (explorer.ts): one that cannot see the address could not see its payment either.
 */
export async function takeOnchainAddress(pool: AddressPool): Promise<OnchainTake> {
  if (!isOnchainAvailable()) return unavailable(null);
  try {
    return await takeFrom(pool);
  } finally {
    // The wallet's pool filled up again, in the background, while the account is open, whatever
    // this take found: an address taken or paid already, or an
    // empty pool that an earlier filling could not fill (offline). Nothing in till mode, nor while
    // the pool is full (fillPool). An employee's lot is the owner's to fill (owner-addresses.ts).
    if (pool.kind === "wallet") void syncOnchainPool(pool.walletId, { again: true });
  }
}

async function takeFrom(pool: AddressPool): Promise<OnchainTake> {
  const deadline = Date.now() + ONCHAIN_CHECK_WAIT_MS;
  try {
    // Each round takes an address out of the pool (or finds it gone): bounded by the pool's size.
    for (let round = 0; round <= 2 * Math.max(ONCHAIN_POOL_SIZE, MEMBER_LOT_SIZE); round += 1) {
      const [address] = await addressesOf(pool);
      if (address === undefined) return unavailable("empty");
      // Outside the queue: another sale, or an address put back, need not wait for the explorer.
      const unused = await within(checkAddress(address), deadline - Date.now());
      if (unused === null) return unavailable("explorer");
      // Paid already: out of the pool all the same (an employee's lot tells the owner so).
      const taken = await removeFrom(pool, address);
      // Another sale took it meanwhile: the next one.
      if (!taken) continue;
      checks.delete(address);
      if (unused) return { address, unavailable: null };
      logFailure("An on-chain address of the pool was paid already: dropped");
    }
    // Every round found its address taken by another sale or paid, while the pool was filled
    // meanwhile: not proven empty.
    return unavailable("error");
  } catch (error) {
    logFailure("Could not take an on-chain address", error);
    return unavailable("error");
  }
}

/**
 * Puts `address` back into `pool`, last: nothing reached it. Never into the pool of another wallet
 * (the device was prepared for another account since), nor into an employee's lot that no longer
 * holds it (the owner's next lot left it out): the address is then dropped.
 */
export function releaseOnchainAddress(pool: AddressPool, address: string): Promise<void> {
  if (pool.kind === "team") {
    return returnToLot(pool.team, address).catch((error: unknown) => {
      logFailure("Could not put an on-chain address back", error);
    });
  }
  const { walletId } = pool;
  return serialized(async () => {
    const stored = await loadOnchainPool(getBreezNetwork());
    if (stored && stored.walletId.toLowerCase() !== walletId.toLowerCase()) return;
    const current = await poolOf(walletId);
    if (current.addresses.includes(address)) return;
    await saveOnchainPool({ ...current, addresses: [...current.addresses, address] });
  }).catch((error: unknown) => {
    logFailure("Could not put an on-chain address back", error);
  });
}

/**
 * Whether the explorer shows that nothing ever paid `address` (its mempool included): a payment
 * sent meanwhile would otherwise show on the next sale. Null when it cannot tell. The device's
 * explorer (src/features/onchain/explorer.ts): the one the sale's address is watched on.
 */
export async function isAddressUnused(address: string): Promise<boolean | null> {
  try {
    const sources = await deviceChainSources();
    return (await readChain(sources, (api) => fetchAddressTxs(api, address))).length === 0;
  } catch (error) {
    logFailure("Could not check an on-chain address before reusing it", error);
    return null;
  }
}

/**
 * Puts back the address of an invoice paid over Lightning, once the explorer confirms that nothing
 * ever paid it. When the explorer cannot tell, the address stays used.
 */
export async function recycleOnchainAddress(pool: AddressPool, address: string): Promise<void> {
  if ((await isAddressUnused(address)) !== true) return;
  await releaseOnchainAddress(pool, address);
}

/**
 * The addresses of the sales shared as payment links in this session: they go back to the pool
 * through the link's final version only (finalize.ts), never twice.
 */
const linkedAddresses = new Set<string>();

/** `address` is its sale's payment link's: only the link's final version puts it back. */
export function keepAddressForLink(address: string): void {
  linkedAddresses.add(address);
}

export function isAddressKeptForLink(address: string): boolean {
  return linkedAddresses.has(address);
}

/** Tests only: no address kept for a link, as after a restart. */
export function resetLinkedAddresses(): void {
  linkedAddresses.clear();
}

/** The top-up running, per wallet: two openings of the account may ask at once. */
const topUps = new Map<string, Promise<number>>();

/**
 * Fills the pool up to `ONCHAIN_POOL_SIZE` with new addresses of the connected wallet
 * (`walletId`), one request at a time, each saved as soon as it comes: the point of sale takes it
 * for its next sale, whatever comes after. Stops at the first failure, once `own()` says the
 * connection is no longer this top-up's (a wallet screen took it), or at an address handed out
 * again (the wallet gives no new one now). Another wallet's pool is replaced. Never throws: an
 * invoice without an on-chain address is still an invoice. Resolves to the number of addresses
 * added.
 */
export function topUpOnchainPool(
  walletId: string,
  own: () => boolean = () => true
): Promise<number> {
  if (!isOnchainAvailable()) return Promise.resolve(0);
  const key = walletId.toLowerCase();
  const running = topUps.get(key);
  if (running) return running;
  let added = 0;
  const topUp = (async () => {
    const missing = ONCHAIN_POOL_SIZE - (await serialized(() => poolOf(walletId))).addresses.length;
    for (let i = 0; i < missing; i++) {
      if (!own()) break;
      let address: string;
      try {
        address = await newDepositAddress(walletId);
      } catch (error) {
        logFailure("Could not get an on-chain address", error);
        break;
      }
      // Read again: sales took addresses meanwhile. One the pool holds already was handed out
      // again: the wallet gives no new one now.
      const saved = await serialized(async () => {
        const pool = await poolOf(walletId);
        if (pool.addresses.includes(address)) return false;
        await saveOnchainPool({ ...pool, addresses: [...pool.addresses, address] });
        return true;
      });
      if (!saved) break;
      added += 1;
    }
    return added;
  })()
    .catch((error: unknown) => {
      logFailure("Could not fill the on-chain addresses", error);
      return added;
    })
    .finally(() => topUps.delete(key));
  topUps.set(key, topUp);
  return topUp;
}

/** The filling running: a second opening of the account meanwhile shares it. */
let syncing: Promise<void> | null = null;

/** The filling that follows the one running (`again`), shared by every call asking for one. */
let following: Promise<void> | null = null;

/**
 * Fills the point of sale's pool of `walletId`, the open account's, in the background once the
 * account is open (useTeamSync.ts) and after each address taken (takeOnchainAddress): as soon as
 * one address is missing, the wallet is connected for it (background-wallet.ts, shared with the
 * account's other background tasks), waited for as long as it is busy, and gives the addresses
 * missing one after the other, for as long as it takes, while the account
 * stays open and the connection stays this filling's. Whatever "On-chain payments" says (that
 * setting is the point of sale's only): the owner's invoices
 * ("New invoice", src/features/invoices/invoices.ts) always take their address here, while
 * the point of sale takes none when it is off (charge.tsx). `again` (an address just taken): a
 * filling running counted what was missing before it, so another follows that one, rather than
 * sharing it; it connects nothing when the pool is full by then. Never rejects.
 */
export function syncOnchainPool(
  walletId: string,
  { again = false }: { again?: boolean } = {}
): Promise<void> {
  const current = syncing;
  if (again && current) {
    following ??= current.then(() => {
      following = null;
      return syncOnchainPool(walletId);
    });
    return following;
  }
  syncing ??= fillPool(walletId).finally(() => {
    syncing = null;
  });
  return syncing;
}

async function fillPool(walletId: string): Promise<void> {
  try {
    if (!isOnchainAvailable()) return;
    await whenAccountSynced();
    if (getAccountWalletId()?.toLowerCase() !== walletId.toLowerCase()) return;
    const { addresses } = await serialized(() => poolOf(walletId));
    // Full: the wallet is not connected.
    if (addresses.length >= ONCHAIN_POOL_SIZE) return;
    await withAccountWallet(Number.POSITIVE_INFINITY, async (connected, own) => {
      if (connected.toLowerCase() !== walletId.toLowerCase()) return;
      await topUpOnchainPool(walletId, own);
    });
  } catch (error) {
    // Offline, no API key, the account closed meanwhile: filled at the next opening.
    logFailure("Filling the on-chain addresses failed", error);
  }
}
