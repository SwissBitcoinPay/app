import { LEASE_GRACE_SECONDS } from "@/config/onchain";
import type { ReceivedDeposit } from "@/features/settings/declarations-copy";
import { invoiceNetwork } from "@/features/terminal/invoice";
import type { WalletPayment } from "@/lib/breez/types";
import { deriveIntegrationKeys, type IntegrationKeys } from "@/lib/integrations/keys";
import { fetchWitnesses, type SeenWitness } from "@/lib/integrations/onchain-witness";
import { paymentParts } from "@/lib/onchain/replacement";
import { ownerLeasesOf, type OwnerLease } from "@/lib/registry/onchain";
import { ownerOnchainPaymentsOf } from "@/lib/registry/onchain-payments";
import {
  deriveRegistryKey,
  deriveRegistryReader,
  integrationSecretKey,
  type TeamKeys
} from "@/lib/team/keys";
import { TEAM_TIMEOUT_MS } from "@/lib/team/shared";

import type { DeclaredSale } from "./model";
import { NO_SEATS, takerResolver, type Seats } from "./takers";

/*
 * Which sale a deposit of the wallet paid, when an integration's order leased its address
 * (checkout-spec SPEC.md §31). A deposit names its transaction, never its address: the
 * integration's witnesses name both, and the sale whose lease held the address when its server saw
 * the transaction (src/lib/integrations/onchain-witness.ts); the registry gives that lease
 * (src/lib/registry/onchain.ts): its price, its note, who took it. As the integration's servers
 * judge it: a transaction no witness of a sale names came late, it is nobody's sale. No explorer is
 * asked.
 *
 * A replacement (RBF, src/lib/onchain/replacement.ts) the server found after the lease's end is
 * witnessed as such: it is the sale's when it stands for a payment of that sale witnessed in time
 * (one of its parts, from the witnesses of the sale at that address), paid when that one was seen.
 *
 * A sale of the point of sale paid on-chain is told by its device's declaration of the transaction
 * in the registry (src/lib/registry/onchain-payments.ts), as a Lightning payment is by its
 * invoice's.
 *
 * A deposit of a month the owner's copy holds (a year old, src/lib/registry/archive.ts) is told by
 * the copy, never here (loadOnchainSales of load.ts).
 */

export type { ReceivedDeposit };

/**
 * The transaction of a deposit the wallet received (failed ones aside), in lowercase; null for any
 * other payment. Anything but a transaction id names no witness.
 */
export function depositTxid(payment: WalletPayment): string | null {
  const txid = payment.txId?.toLowerCase();
  return payment.direction === "receive" &&
    payment.status !== "failed" &&
    payment.network === "bitcoin" &&
    txid !== undefined &&
    /^[0-9a-f]{64}$/.test(txid)
    ? txid
    : null;
}

/** What the lookup of deposits gives: each one's sale (none: []), and those to ask again. */
export type OnchainSales = {
  /** By txid: the sale its transaction paid ([] when none, or none could be told). */
  sales: Map<string, DeclaredSale[]>;
  /** Not decided this time (the relays out of reach, a record of a newer format): asked again. */
  retry: string[];
};

/**
 * How long before a deposit is listed its transaction's witness may have been made: a payment is
 * claimed by the wallet once confirmed, at the merchant's next connection, which may be weeks
 * later.
 */
export const WITNESS_LOOKBACK_SECONDS = 90 * 24 * 3600;

/** The integrations whose witnesses are read: the account's, removed ones included. */
export type WitnessHolder = { id: string; keys: IntegrationKeys };

/** The integrations of `seats` (removed ones included), with their keys. */
export function witnessHolders(team: TeamKeys, seats: Seats): WitnessHolder[] {
  const ids = new Set([
    ...seats.integrations.map(({ id }) => id),
    ...seats.removed.filter(({ role }) => role === "integration").map(({ id }) => id)
  ]);
  return [...ids].map((id) => ({
    id,
    keys: deriveIntegrationKeys(integrationSecretKey(team, id))
  }));
}

/**
 * The lease of `sale` among `leases` (those of one address, each author's newest): the order's,
 * once confirmed (SPEC.md §31: a lease not confirmed is a try its customer never saw).
 * Whenever its witness was made: a server that saw the transaction after the lease's end, told in
 * time by BlockCypher's time, or a replacement, witnesses it later. Null when none.
 */
export function leaseOfSale(leases: readonly OwnerLease[], sale: string): OwnerLease | null {
  return leases.find((lease) => lease.author === sale && lease.confirmed) ?? null;
}

/**
 * Whether the newest record of `sale` among `leases` is a lease not confirmed: a try of a later
 * invoice of the order replaced the lease its witness stands for, whose terms cannot be read.
 */
export function triedBySale(leases: readonly OwnerLease[], sale: string): boolean {
  return leases.some((lease) => lease.author === sale && !lease.confirmed);
}

/**
 * The witness of a sale that `txid` (a deposit) is that sale's by, and when its payment was seen in
 * time: its own, when it came in time; else, a replacement's, the latest of the payments of the
 * sale witnessed in time it stands for (its parts, from the witnesses of the sale at its address).
 * Null when no witness of a sale names it, two of different sales do, or it stands for no payment
 * in time.
 */
export function depositWitness(
  txid: string,
  witnesses: readonly SeenWitness[]
): { witness: SeenWitness; seenAt: number } | null {
  const named = witnesses.filter((witness) => witness.txid === txid && witness.sale !== null);
  // Two orders' witnesses for one transaction (a conflict a server left): nobody's.
  if (new Set(named.map(({ integration, sale }) => `${integration}:${sale}`)).size !== 1) {
    return null;
  }
  const witness = named.find(({ replacement }) => !replacement) ?? named[0]!;
  if (!witness.replacement) return { witness, seenAt: witness.seenAt };
  const ofSale = witnesses.filter(
    (other) =>
      other.integration === witness.integration &&
      other.sale === witness.sale &&
      other.address === witness.address
  );
  const parts = paymentParts(
    ofSale.map((other) => ({
      txid: other.txid,
      sats: other.sats,
      inputs: other.inputs,
      at: other.seenAt,
      listed: other.txid === txid
    }))
  ).get(txid);
  const roots = (parts ?? []).flatMap(({ source }) =>
    ofSale.filter((other) => other.txid === source && other.txid !== txid && !other.replacement)
  );
  if (roots.length === 0) return null;
  return { witness, seenAt: Math.max(...roots.map(({ seenAt }) => seenAt)) };
}

/**
 * The sales of the point of sale that `deposits` paid, as their devices declared them in the
 * registry (onchain-payments.ts), by txid: each declaration whose mark names someone of `seats` or
 * the owner's devices (whether that one vouches for it is told against the payment's date,
 * model.ts): a payer's page holds the registry key but no mark, its declarations neither tell a
 * sale nor make a conflict. Null when the registry gave no majority's answer; `newer`, the
 * transactions a declaration of a newer format may concern.
 */
async function readPosSales(
  team: TeamKeys,
  deposits: readonly ReceivedDeposit[],
  takerOf: ReturnType<typeof takerResolver>,
  relays: readonly string[]
): Promise<{ sales: Map<string, DeclaredSale[]>; newer: Set<string> } | null> {
  const read = await ownerOnchainPaymentsOf(
    { key: deriveRegistryKey(team), reader: deriveRegistryReader(team) },
    deposits.map(({ txid }) => txid),
    invoiceNetwork(),
    { relays }
  );
  if (read === null) return null;
  const sales = new Map<string, DeclaredSale[]>();
  for (const [txid, declarations] of read.declared) {
    sales.set(
      txid,
      declarations.flatMap(({ author, fiat, note, taker, saleKey }) => {
        const by = takerOf(taker, author);
        return by ? [{ author, fiat, note, taker: by, key: saleKey }] : [];
      })
    );
  }
  return { sales, newer: read.newer };
}

/**
 * The sales `deposits` paid, from the witnesses of `holders` and the business's registry (`team`)
 * on `relays`: who took each as its mark tells, among the owner's devices and `seats`. An
 * integration's order is told by its witnesses and its lease; a sale of the point of sale by its
 * declaration (readPosSales). A deposit two sales claim is listed with both (it counts for none);
 * one nothing ties to a sale is nobody's sale ([]).
 */
export async function readOnchainSales(
  team: TeamKeys,
  deposits: readonly ReceivedDeposit[],
  {
    seats = NO_SEATS,
    holders = witnessHolders(team, seats),
    relays
  }: { seats?: Seats; holders?: readonly WitnessHolder[]; relays: readonly string[] }
): Promise<OnchainSales> {
  const sales = new Map<string, DeclaredSale[]>();
  if (deposits.length === 0) return { sales, retry: [] };
  const undecided = { sales, retry: deposits.map(({ txid }) => txid) };
  const network = invoiceNetwork();
  const takerOf = takerResolver(team, seats);
  const pos = await readPosSales(team, deposits, takerOf, relays);
  if (pos === null) return undecided;
  const since = Math.min(...deposits.map(({ at }) => at)) - WITNESS_LOOKBACK_SECONDS;
  const read = await fetchWitnesses(holders, network, since, {
    relays,
    channel: "account",
    timeoutMs: TEAM_TIMEOUT_MS.background
  });
  if (read === null) return undecided;
  const ofTx = new Map<string, SeenWitness[]>();
  for (const witness of read.witnesses) {
    if (witness.sale !== null) ofTx.set(witness.txid, [...(ofTx.get(witness.txid) ?? []), witness]);
  }
  const named = deposits.flatMap(({ txid }) => ofTx.get(txid) ?? []);
  const witnessOf = new Map(
    deposits.map(({ txid }) => [txid, depositWitness(txid, read.witnesses)])
  );
  const leases =
    named.length === 0
      ? new Map()
      : await ownerLeasesOf(
          { key: deriveRegistryKey(team), reader: deriveRegistryReader(team) },
          named.map(({ address }) => address),
          network,
          { relays }
        );
  if (leases === null) return undecided;
  const retry: string[] = [];
  for (const { txid } of deposits) {
    // A sale of the point of sale's declaration of a newer format may claim it: a newer app tells.
    if (pos.newer.has(txid)) {
      retry.push(txid);
      continue;
    }
    const witnesses = ofTx.get(txid) ?? [];
    const told = witnessOf.get(txid) ?? null;
    // An integration's witness of a newer format may name it, or be of the payment it replaced:
    // told by a newer app.
    if (
      (witnesses.length === 0 || (told === null && witnesses.some((w) => w.replacement))) &&
      read.newer.size > 0
    ) {
      retry.push(txid);
      continue;
    }
    const declared = pos.sales.get(txid) ?? [];
    // No witness of a sale, two orders' witnesses, or a replacement of no payment in time.
    if (!told) {
      sales.set(txid, declared);
      continue;
    }
    const { witness, seenAt } = told;
    const found = leases.get(witness.address);
    const lease = found ? leaseOfSale(found.leases, witness.sale!) : null;
    // The sale's lease may be the record of a newer format there (told by a newer app), or have
    // been replaced by a try of the order never confirmed: never decided as nobody's (the owner's
    // copy would keep that for good).
    if (!lease && found && (found.newer || triedBySale(found.leases, witness.sale!))) {
      retry.push(txid);
      continue;
    }
    sales.set(txid, [
      ...declared,
      ...(lease
        ? [
            {
              author: lease.author,
              fiat: lease.fiat,
              note: lease.note,
              taker: takerOf(lease.taker, lease.author),
              key: lease.saleKey,
              // Its order's invoice, for what it was due (model.ts) and its acceptance: of the
              // integration whose witness names it.
              lease: {
                integration: witness.integration,
                address: lease.address,
                expiresAt: lease.expiresAt,
                sats: lease.sats,
                tolerance: lease.tolerance
              },
              // Seen by its server in time: when it was paid, rather than when the wallet claimed
              // it (an integration removed meanwhile keeps its sale, model.ts). By the end of the
              // lease of its invoice at the latest (its witness's `expiresAt` tells which, the
              // lease of a later invoice of the order may have replaced it): a witness made later
              // (BlockCypher's time) stands for a payment broadcast by then. Never past the end of
              // the lease read: a witness's `expiresAt` is its server's word, not the registry's.
              paidAt: Math.min(
                seenAt,
                lease.end,
                (witness.expiresAt ?? lease.expiresAt) + LEASE_GRACE_SECONDS
              )
            }
          ]
        : [])
    ]);
  }
  // One sale once, whatever ties it (its declaration and its lease, were it both).
  for (const [txid, found] of sales) {
    sales.set(txid, [...new Map(found.map((sale) => [sale.author, sale])).values()]);
  }
  return { sales, retry };
}
