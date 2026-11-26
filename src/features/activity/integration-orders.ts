import { LEASE_CLOCK_TOLERANCE_SECONDS, REQUIRED_CONFIRMATIONS } from "@/config/onchain";
import { deviceChainSources, readChain } from "@/features/onchain/explorer";
import { invoiceNetwork } from "@/features/terminal/invoice";
import { inBatches } from "@/lib/batches";
import {
  fetchWitnesses,
  witnessedParts,
  type SeenWitness
} from "@/lib/integrations/onchain-witness";
import { logFailure } from "@/lib/log/log";
import { fetchAddressTxs, fetchTipHeight, type ChainTx } from "@/lib/onchain/esplora";
import { confirmationsOf } from "@/lib/onchain/payment";
import { coversWith } from "@/lib/onchain/tolerance";
import { paymentParts } from "@/lib/onchain/replacement";
import { ownerLeasesOf, type OwnerLease } from "@/lib/registry/onchain";
import { deriveRegistryKey, deriveRegistryReader, type TeamKeys } from "@/lib/team/keys";
import { TEAM_TIMEOUT_MS } from "@/lib/team/shared";

import type { Fiat, SaleLease, Taker } from "./model";
import { leaseOfSale, witnessHolders } from "./onchain-sales";
import { NO_SEATS, takerResolver, type Seats } from "./takers";

/*
 * The integrations' orders paid on-chain that are not final yet, for "Wallet": "Confirming" (paid
 * in time, not REQUIRED_CONFIRMATIONS deep yet) and "Underpaid" (less than the amount in time). The
 * wallet knows nothing of them before it claims a deposit, at REQUIRED_CONFIRMATIONS (wallet.ts,
 * withoutAddressWatch), and nothing at all of an order underpaid whose deposits it never claimed:
 * as for "Remove the integration" (src/features/team/integration-pending.ts), the owner tells them
 * from the integrations' witnesses (which sale each transaction paid, as their servers judged it,
 * src/lib/integrations/onchain-witness.ts), the registry's leases (the order's price, note and who
 * took it, src/lib/registry/onchain.ts) and the explorer (what the address holds now, how deep; a
 * transaction replaced or dropped since pays nothing). Replacements (RBF) count as their servers
 * count them (paymentParts, checkout-spec SPEC.md §31).
 *
 * Nothing is shown that is not proven: an order of an integration other than the one whose witness
 * names it, a transaction no witness tells after the lease's end (its server has not judged it
 * yet), an address the explorer never listed yet, a lease whose Lightning invoice the wallet
 * cannot tell paid or not: left out until they can be told. An address the explorer fails shows
 * as it last listed it (readIntegrationOrders). An order paid in full and deep enough is left to
 * the wallet's deposit (onchain-sales.ts), as one paid over Lightning; an order nothing paid in
 * time is not listed (open, or expired: not asked for).
 */

/** An integration's order not final yet, as "Wallet" lists it (model.ts). */
export type IntegrationOrder = {
  /** Hex: its sale's registry identity (its lease's author), as its deposits' sale names it. */
  author: string;
  fiat: Fiat;
  note: string;
  /** The integration whose witnesses name the order, its lease's mark naming it too. */
  taker: Extract<Taker, { kind: "integration" }>;
  /** Unix seconds: when its latest payment that counts was seen (else its lease was made). */
  at: number;
  state: "unconfirmed" | "underpaid";
  /** Sats paid in time, as its server counts them. */
  received: bigint;
  /**
   * Whether what was paid on-chain in time is REQUIRED_CONFIRMATIONS deep: an underpaid order whose
   * rest was paid over Lightning (an invoice of the rest its server declared for its sale, SPEC.md
   * §31) is then paid (model.ts).
   */
  confirmed: boolean;
  /** Sats its lease asks. */
  due: bigint;
  /**
   * Its tolerance of on-chain underpayments, its lease's (basis points,
   * src/lib/onchain/tolerance.ts): paid in time short of `due` by no more than it, the order is
   * paid, as its server judges it.
   */
  tolerance: number;
  /** Its invoice, as its lease tells it: where the owner's acceptance of it is (acceptance.ts). */
  lease: SaleLease;
};

/** What the wallet tells of the orders ("Wallet"'s read of it). */
export type WalletView = {
  /** The deposits it claimed (lowercase txids): mined, REQUIRED_CONFIRMATIONS deep. */
  claimed: ReadonlySet<string>;
  /** The payment hashes of the Lightning payments it received. */
  lightning: ReadonlySet<string>;
  /**
   * Unix seconds from which it lists every payment received (its read after the first sync); null
   * when it cannot tell (not synced yet).
   */
  completeSince: number | null;
};

/** Addresses asked of the explorer at once (as integration-pending.ts). */
const ADDRESSES_AT_ONCE = 4;

/**
 * What the explorer last listed at each address of an order (readIntegrationOrders), kept by the
 * caller from one read to the next and updated in place. `final`: nothing it lists can change any
 * more for an order (finalRead): the address is not asked again.
 */
export type AddressReads = Map<string, { txs: ChainTx[]; final: boolean }>;

/**
 * Whether `txs`, listed at the address of the orders of `leases` at `now` with the chain at `tip`,
 * is all an order there will ever count: every lease ended, its server's clock ahead of the
 * owner's by LEASE_CLOCK_TOLERANCE_SECONDS at most (a transaction broadcast later is late, for no
 * order), and every transaction listed REQUIRED_CONFIRMATIONS deep (none can be replaced or
 * dropped any more). An address listing nothing is never final: what a later payment is, only a
 * later read and its server's witness tell.
 */
export function finalRead(
  leases: readonly Pick<OwnerLease, "end">[],
  txs: readonly ChainTx[],
  tip: number,
  now: number
): boolean {
  return (
    txs.length > 0 &&
    leases.every(({ end }) => now > end + LEASE_CLOCK_TOLERANCE_SECONDS) &&
    txs.every((tx) => confirmationsOf(tx, tip) >= REQUIRED_CONFIRMATIONS)
  );
}

/** What an order's payments tell, its address read on the explorer (or its deposits claimed). */
export type OrderOutcome =
  | {
      kind: "listed";
      state: IntegrationOrder["state"];
      received: bigint;
      at: number;
      confirmed: boolean;
    }
  /** Paid in full and deep enough, or nothing paid in time: not listed here. */
  | { kind: "none" }
  /** Cannot be told now (a transaction its server has not judged): not listed. */
  | { kind: "undecided" };

/**
 * The outcome of the order of `lease` from the witnesses of its invoice at its address (`ofSale`:
 * of its sale with its `expiresAt`, or none), those of other invoices there
 * (`others`: of other sales, or of other invoices of its sale: a transaction they name, or that
 * stands for one they name, counts for nothing here, checkout-spec SPEC.md §31), the transactions
 * its server witnessed there for no sale (`late`: after the lease's end), and what the explorer
 * lists there (`listed`, its tip at `tip`), at `now`. A transaction listed that no witness names
 * came in time while the lease runs (it pays the address now, which the order holds), its
 * server's clock ahead of the owner's by LEASE_CLOCK_TOLERANCE_SECONDS at most; after that, only
 * its server can tell (undecided). Dated by its latest payment in time, by the lease's end at the
 * latest (a witness made later, BlockCypher's time, stands for a payment broadcast by then), as its
 * deposits' sale is (onchain-sales.ts).
 */
export function orderOutcome(
  lease: Pick<OwnerLease, "sats" | "end" | "createdAt" | "tolerance">,
  ofSale: readonly SeenWitness[],
  late: ReadonlySet<string>,
  listed: readonly ChainTx[],
  tip: number,
  now: number,
  others: readonly SeenWitness[] = []
): OrderOutcome {
  const witnessed = new Set(ofSale.map(({ txid }) => txid));
  const ofOthers = new Set(others.map(({ txid }) => txid));
  // The payments its server saw in time, and when.
  const inTime = new Map(
    ofSale.flatMap((witness) => (witness.replacement ? [] : [[witness.txid, witness.seenAt]]))
  );
  // Its server's clock may be ahead of the owner's: past its end there, a payment is late.
  const running = now + LEASE_CLOCK_TOLERANCE_SECONDS <= lease.end;
  // A replacement of another invoice's payment stands for it.
  const parts = witnessedParts([...ofSale, ...others], listed);
  let received = 0n;
  let at: number | null = null;
  const counted: ChainTx[] = [];
  for (const tx of listed) {
    const own = parts.get(tx.txid) ?? [];
    // Another invoice's: a transaction counts for one invoice at most.
    if (ofOthers.has(tx.txid) || own.some(({ source }) => ofOthers.has(source))) continue;
    let counts = false;
    for (const { source, sats } of own) {
      const seenAt = inTime.get(source);
      if (seenAt !== undefined) {
        at = Math.max(at ?? 0, seenAt);
      } else if (witnessed.has(source) || late.has(source)) {
        // What a replacement pays beyond the payments it replaces, or a payment seen late: after
        // the lease's end, for no order.
        continue;
      } else if (!running) {
        // Past the lease's end, a transaction its server has not judged yet.
        return { kind: "undecided" };
      }
      received += sats;
      counts = true;
    }
    if (counts) counted.push(tx);
  }
  if (received === 0n) return { kind: "none" };
  const when = at === null ? lease.createdAt : Math.min(at, lease.end);
  const shallowest = Math.min(...counted.map((tx) => confirmationsOf(tx, tip)));
  const confirmed = shallowest >= REQUIRED_CONFIRMATIONS;
  // Its server's judgment: the amount, or less within the order's tolerance (all of it on-chain).
  if (!coversWith(received, received, lease.sats, lease.tolerance)) {
    return { kind: "listed", state: "underpaid", received, at: when, confirmed };
  }
  return confirmed
    ? { kind: "none" }
    : { kind: "listed", state: "unconfirmed", received, at: when, confirmed };
}

/**
 * Whether the deposits the wallet claimed alone pay `lease` in full: every transaction its server
 * witnessed for its invoice is claimed (mined, deep enough, none replaced), none is another
 * invoice's too (`others`), and what came in time (paymentParts) reaches its price. Then no
 * explorer is asked.
 */
function paidByClaims(
  lease: Pick<OwnerLease, "sats" | "tolerance">,
  ofSale: readonly SeenWitness[],
  claimed: ReadonlySet<string>,
  others: readonly SeenWitness[]
): boolean {
  if (!ofSale.every(({ txid }) => claimed.has(txid))) return false;
  const ofOthers = new Set(others.map(({ txid }) => txid));
  if (ofSale.some(({ txid }) => ofOthers.has(txid))) return false;
  const inTime = new Set(ofSale.flatMap((w) => (w.replacement ? [] : [w.txid])));
  const parts = paymentParts([
    ...ofSale.map(({ txid, sats, inputs, seenAt }) => ({
      txid,
      sats,
      inputs,
      at: seenAt,
      listed: true
    })),
    // Other invoices' payments take no part, but one of theirs a claimed deposit stands for
    // (a replacement) is told, as orderOutcome tells it.
    ...others.map(({ txid, sats, inputs, seenAt }) => ({
      txid,
      sats,
      inputs,
      at: seenAt,
      listed: false
    }))
  ]);
  let received = 0n;
  for (const list of parts.values()) {
    for (const part of list) {
      // It stands for another invoice's payment: the explorer's read tells (orderOutcome).
      if (ofOthers.has(part.source)) return false;
      if (inTime.has(part.source)) received += part.sats;
    }
  }
  return coversWith(received, received, lease.sats, lease.tolerance);
}

/**
 * The orders of the integrations of `seats` (removed ones included) whose witnesses were made since
 * `since`, not final yet, on `relays` and the explorer, as `wallet` leaves them to tell. Null when
 * the relays or the explorer's height cannot be read (fewer than a majority answered, the
 * explorer failing): "Wallet" asks again, and keeps the orders it read.
 *
 * The explorer is asked for an address only while what it lists may still change for an order
 * (`reads`, finalRead): every order of the last month is read again at each read, and mempool.space
 * refuses a device that asks too often (HTTP 429). Once an address fails, the others are not asked
 * this time; an order whose address was not read shows as `reads` last listed it, and one never
 * read is left out until it is.
 */
export async function readIntegrationOrders(
  team: TeamKeys,
  wallet: WalletView,
  {
    seats = NO_SEATS,
    relays,
    since,
    now,
    reads = new Map()
  }: {
    seats?: Seats;
    relays: readonly string[];
    since: number;
    now: number;
    reads?: AddressReads;
  }
): Promise<IntegrationOrder[] | null> {
  const holders = witnessHolders(team, seats);
  if (holders.length === 0) return [];
  const network = invoiceNetwork();
  const read = await fetchWitnesses(holders, network, since, {
    relays,
    channel: "account",
    timeoutMs: TEAM_TIMEOUT_MS.background
  });
  if (read === null) return null;
  // The witnesses of each order: its integration's, at its address, for its sale. An integration
  // with a witness of a newer format is left out: what it says cannot be read.
  const groups = new Map<string, SeenWitness[]>();
  // Every witness of a sale of each integration at each address: those of other invoices.
  const atAddress = new Map<string, SeenWitness[]>();
  // The transactions each integration's server saw late at each address, for no order.
  const late = new Map<string, Set<string>>();
  for (const witness of read.witnesses) {
    if (read.newer.has(witness.integration)) continue;
    if (witness.sale === null) {
      const at = `${witness.integration}|${witness.address}`;
      const seen = late.get(at);
      if (seen) seen.add(witness.txid);
      else late.set(at, new Set([witness.txid]));
      continue;
    }
    const key = `${witness.integration}|${witness.address}|${witness.sale}`;
    const group = groups.get(key);
    if (group) group.push(witness);
    else groups.set(key, [witness]);
    const spot = `${witness.integration}|${witness.address}`;
    const ofSpot = atAddress.get(spot);
    if (ofSpot) ofSpot.push(witness);
    else atAddress.set(spot, [witness]);
  }
  if (groups.size === 0) return [];
  const leases = await ownerLeasesOf(
    { key: deriveRegistryKey(team), reader: deriveRegistryReader(team) },
    [...groups.values()].map(([first]) => first!.address),
    network,
    { relays }
  );
  if (leases === null) return null;
  const takerOf = takerResolver(team, seats);

  type Pending = {
    lease: OwnerLease;
    ofSale: SeenWitness[];
    others: SeenWitness[];
    integration: string;
  };
  const pending: Pending[] = [];
  for (const group of groups.values()) {
    const { integration, address, sale } = group[0]!;
    // Its confirmed lease (a try never confirmed is no order's).
    const lease = leaseOfSale(leases.get(address)?.leases ?? [], sale!);
    if (!lease) continue;
    // Of its invoice: its `expiresAt`.
    const ofInvoice = (witness: SeenWitness) =>
      witness.sale === sale && witness.expiresAt === lease.expiresAt;
    const ofSale = group.filter(ofInvoice);
    if (ofSale.length === 0) continue;
    const others = (atAddress.get(`${integration}|${address}`) ?? []).filter(
      (witness) => !ofInvoice(witness)
    );
    // Its lease's mark names the integration whose server witnessed it: no other one's order.
    const taker = takerOf(lease.taker, lease.author);
    if (taker?.kind !== "integration" || taker.id !== integration) continue;
    if (lease.invoice) {
      // Paid over Lightning: the wallet's payment is its row. Not told before the wallet lists
      // every payment since the order.
      if (wallet.lightning.has(lease.invoice.decoded.paymentHash)) continue;
      if (wallet.completeSince === null || lease.createdAt < wallet.completeSince) continue;
    }
    if (paidByClaims(lease, ofSale, wallet.claimed, others)) continue;
    pending.push({ lease, ofSale, others, integration });
  }
  if (pending.length === 0) return [];

  const addresses = [...new Set(pending.map(({ lease }) => lease.address))];
  // The addresses of no order pending any more are forgotten.
  for (const address of reads.keys()) {
    if (!addresses.includes(address)) reads.delete(address);
  }
  const unread = addresses.filter((address) => reads.get(address)?.final !== true);
  let tip: number;
  const listed = new Map<string, ChainTx[]>();
  let refused: unknown = null;
  try {
    // The height and the addresses from the same explorer (explorer.ts): confirmations count
    // against it. An address it fails stops the asking, not the whole read.
    tip = await readChain(await deviceChainSources(), async (api) => {
      const height = await fetchTipHeight(api);
      listed.clear();
      refused = null;
      await inBatches(unread, ADDRESSES_AT_ONCE, async (address) => {
        try {
          listed.set(address, await fetchAddressTxs(api, address));
          return true;
        } catch (error) {
          refused ??= error;
          return null;
        }
      });
      return height;
    });
  } catch (error) {
    logFailure("Reading the explorer's tip failed", error);
    return null;
  }
  if (refused !== null) {
    // Its message names the address: the error's kind and code only.
    logFailure("Reading an order's address on the explorer failed", refused, false);
  }
  for (const [address, txs] of listed) {
    const ofAddress = pending.filter(({ lease }) => lease.address === address);
    reads.set(address, {
      txs,
      final: finalRead(
        ofAddress.map(({ lease }) => lease),
        txs,
        tip,
        now
      )
    });
  }
  const orders: IntegrationOrder[] = [];
  for (const { lease, ofSale, others, integration } of pending) {
    const txs = reads.get(lease.address)?.txs;
    if (!txs) continue;
    const outcome = orderOutcome(
      lease,
      ofSale,
      late.get(`${integration}|${lease.address}`) ?? new Set(),
      txs,
      tip,
      now,
      others
    );
    if (outcome.kind !== "listed") continue;
    orders.push({
      author: lease.author,
      fiat: lease.fiat,
      note: lease.note,
      taker: { kind: "integration", id: integration },
      at: outcome.at,
      state: outcome.state,
      received: outcome.received,
      confirmed: outcome.confirmed,
      due: lease.sats,
      tolerance: lease.tolerance,
      lease: {
        integration,
        address: lease.address,
        expiresAt: lease.expiresAt,
        sats: lease.sats,
        tolerance: lease.tolerance
      }
    });
  }
  return orders;
}
