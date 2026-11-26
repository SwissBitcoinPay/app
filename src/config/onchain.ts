import { getBreezNetwork } from "@/lib/breez/config";

/**
 * On-chain payments of the point of sale and of payment links (src/lib/onchain/). The invoice's
 * QR also carries a Spark deposit address of the
 * merchant's wallet; the device that shows it watches the address itself, the wallet is not
 * needed there: the Breez SDK only claims the deposit at the merchant's next connection.
 *
 * Mainnet only: the regtest network of Breez has no public explorer.
 */
export function isOnchainAvailable(): boolean {
  try {
    return getBreezNetwork() === "mainnet";
  } catch {
    // A build without a valid network takes no on-chain payment (its wallet cannot connect).
    return false;
  }
}

/**
 * Explorer of the address watch: mempool.space, the SDK's own chain service on mainnet, unless the
 * merchant names their own node (src/features/onchain/explorer.ts; the payers' pages only when the
 * owner passes it on to them). Its REST API (Esplora format) gives the address's transactions and
 * the chain's height; its WebSocket pushes what changes (`track-address`, `want blocks`; message
 * names as its server code has them). Both send `Access-Control-Allow-Origin: *`. It is a third
 * party: each request sends it the device's IP address and the
 * merchant's address.
 */
export const MEMPOOL_API_URL = "https://mempool.space/api";
export const MEMPOOL_WEBSOCKET_URL = "wss://mempool.space/api/v1/ws";

/**
 * mempool.space's page of a transaction (`<url><txid>`): an underpaid sale's
 * chain card links each transaction it received to it, unless the screen
 * reads the merchant's own node: its page there (src/lib/onchain/tx-page.ts). Opened only when
 * tapped, in the browser: mempool.space then gets the IP address of who opened it, as its API does.
 */
export const MEMPOOL_TX_PAGE_URL = "https://mempool.space/tx/";

/**
 * While an address is watched, its state is read again over REST this often, in case the
 * WebSocket went quiet without closing: two small requests a minute.
 */
export const ONCHAIN_RESYNC_INTERVAL_MS = 60_000;

/**
 * One explorer only: mempool.space, or the merchant's own node
 * (src/features/onchain/explorer.ts). A node that did not answer is asked after mempool.space for
 * this long (when the owner allowed mempool.space while it does not answer), so that a node out of
 * reach does not make each read wait for its timeout first.
 */
export const NODE_RETRY_AFTER_MS = 60_000;

/**
 * "Test the connection" of "Bitcoin node": how long each request to the node may take. Longer
 * than a sale's (CHAIN_TIMEOUT_MS): on the web, Chromium asks its user whether the page may reach
 * the local network first, and waits for the answer (src/lib/nostr/local-network.web.ts).
 */
export const NODE_TEST_TIMEOUT_MS = 30_000;

/**
 * The node is up to date when its last block is younger than this: Bitcoin's blocks come every 10
 * minutes on average, and an hour without one happens about once a week; three hours, almost
 * never, while a node still catching up (its first sync, or after days off) is days behind.
 */
export const NODE_STALE_TIP_SECONDS = 3 * 3600;

/**
 * When a transaction was broadcast: BlockCypher's `received`, the time its servers first received
 * it, to the millisecond. An on-chain payment is due at the
 * rate of that hour (src/lib/rates/): the same instant for the point of sale and the payer's page,
 * whenever each of them sees the transaction. The point of sale and payment links ask it only when
 * mempool.space's first sight cannot do (src/lib/onchain/broadcast-time.ts); the integrations'
 * checkout pages as their specification says.
 * Without key: 3 requests a second and 100 an hour (its documentation), one per
 * transaction here. `Access-Control-Allow-Origin: *`. A third party: each
 * request sends it the device's IP address and the transaction.
 */
export const BLOCKCYPHER_API_URL = "https://api.blockcypher.com/v1/btc/main";

/**
 * How close to a change of point (HH:05, src/lib/rates/sources.ts) mempool.space's first sight of a
 * transaction must not be for the sale's hour to be taken from it (between HH:00 and HH:10,
 * BlockCypher tells). mempool.space's servers disagree by a
 * few seconds (src/lib/onchain/mempool-times.ts): within this margin, two devices could price the
 * same payment at two hours.
 */
export const MEMPOOL_TIME_MARGIN_SECONDS = 300;

/**
 * Confirmations after which an on-chain payment is "Paid": the depth at which the SDK claims a
 * deposit at its plain price, when the provider's
 * quote fits MAX_DEPOSIT_CLAIM_FEE_SATS (`maturity_confirmations`, spark-sdk 0.28.4,
 * src/lib/breez/config.ts); the wallet may credit it sooner, when an early claim fits it too.
 * Until then the sale shows "Confirming".
 */
export const REQUIRED_CONFIRMATIONS = 3;

/**
 * Smallest amount asked on-chain: a sale of less is Lightning
 * only and takes no address, and so is the rest of an underpayment below it. For scale, claiming a
 * deposit costs the merchant up to 300 sats (`MAX_DEPOSIT_CLAIM_FEE_SATS`).
 */
export const MIN_ONCHAIN_SATS = 1000n;

/**
 * Most the recovery of funds that left a wallet's balance may add in fees per leaf it takes, in
 * sats (as a deposit's claim, MAX_DEPOSIT_CLAIM_FEE_SATS):
 * what the network's rate adds to the least any recovery of those leaves pays (the fees the
 * operators' transactions already took on-chain, gone whatever is done). Above it, the recovery
 * waits for a lower rate: the funds stay in their on-chain output meanwhile
 * (src/features/wallet/funds-recovery.ts). Their return to the balance then pays a deposit's claim
 * too, within MAX_DEPOSIT_CLAIM_FEE_SATS.
 */
export const MAX_RECOVERY_FEE_SATS_PER_LEAF = 300n;

/**
 * The step of the tolerance of on-chain underpayments "Settings" takes ("Underpayment tolerance",
 * src/lib/onchain/tolerance.ts): a tenth of a percent, in basis points, up to its
 * MAX_ONCHAIN_TOLERANCE.
 */
export const TOLERANCE_STEP = 10;

/** Whether `sats` may be asked on-chain: `MIN_ONCHAIN_SATS` or more. */
export function acceptsOnchain(sats: bigint): boolean {
  return sats >= MIN_ONCHAIN_SATS;
}

/**
 * Deposit addresses kept on the owner's device for its point of sale (as many as an employee's
 * lot, MEMBER_LOT_SIZE): one per invoice shown.
 * Filled up again as soon as one is missing, in the background once the account is open, without
 * time limit (src/features/terminal/onchain-pool.ts, syncOnchainPool). About 70 bytes each in the
 * device's secure store.
 */
export const ONCHAIN_POOL_SIZE = 20;

/**
 * Before a sale shows an address of the pool, the explorer must say that nothing ever paid it:
 * an address put back in the pool may have been paid since by a payer
 * who kept its code. The check starts at "Charge", with the invoice's request; once the
 * invoice is ready, the sale waits for it this much longer at most, then is Lightning only (the
 * address stays in the pool). "New invoice" waits as much before sending a link. As long as one
 * request to the explorer may take (CHAIN_TIMEOUT_MS): 3 s is too short for a slow explorer. Not
 * measured on a device.
 */
export const ONCHAIN_CHECK_WAIT_MS = 10_000;

/** An explorer's "nothing paid it" is good for this long for a sale about to show the address. */
export const ONCHAIN_CHECK_FRESH_MS = 60_000;

/**
 * Addresses of an integration's lot (checkout-spec SPEC.md §31): the owner
 * fills it up to this many once it is created and at each login or unlock
 * (src/features/team/integration-addresses.ts), whatever "On-chain payments" says (that setting
 * is the point of sale's only: the invoices ignore it too). An address is not
 * used up by an order paid over Lightning: it goes back to the lot once its lease ends. An order
 * is paid on-chain from MIN_ONCHAIN_SATS, over Lightning within its Lightning address's bounds.
 */
export const INTEGRATION_LOT_SIZE = 100;

/**
 * While a lot fills, it is published each time the wallet gave this many new addresses, so that
 * its servers take on-chain payments before it is full. Not after each
 * address: every copy carries the whole lot (up to INTEGRATION_LOT_SIZE addresses) to every relay,
 * and public relays may limit how many events an author writes. Never twice in one second either:
 * a copy is dated by the second, strictly after the one before, so a second copy within the same
 * second would be dated ahead of the clock.
 */
export const INTEGRATION_LOT_PUBLISH_EVERY = 10;

/** A lease's end is its invoice's end plus this (SPEC.md §31: the grace period of a payment). */
export const LEASE_GRACE_SECONDS = 120;

/**
 * Clock tolerance of the leases (SPEC.md §31): a witness the integration's server dated up to this
 * long outside its lease's time still goes to its sale in "Wallet", the servers' clocks
 * being off by as much as that.
 */
export const LEASE_CLOCK_TOLERANCE_SECONDS = 300;
