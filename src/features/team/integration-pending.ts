import { LEASE_CLOCK_TOLERANCE_SECONDS, REQUIRED_CONFIRMATIONS } from "@/config/onchain";
import { deviceChainSources, readChain } from "@/features/onchain/explorer";
import { getBreezNetwork } from "@/lib/breez/config";
import { inBatches } from "@/lib/batches";
import { deriveIntegrationKeys } from "@/lib/integrations/keys";
import { fetchIntegrationLots } from "@/lib/integrations/onchain-lot";
import {
  fetchWitnesses,
  witnessedParts,
  type SeenWitness
} from "@/lib/integrations/onchain-witness";
import { logFailure } from "@/lib/log/log";
import type { RelayCall } from "@/lib/nostr/pool";
import { addressHrp } from "@/lib/onchain/address";
import { fetchAddressTxs, fetchTipHeight } from "@/lib/onchain/esplora";
import { confirmationsOf } from "@/lib/onchain/payment";
import { nowUnix } from "@/lib/rates/snapshot";
import { ownerLeasesOf } from "@/lib/registry/onchain";
import {
  deriveRegistryKey,
  deriveRegistryReader,
  integrationSecretKey,
  type TeamKeys
} from "@/lib/team/keys";

/*
 * Whether an integration has a payment not final yet: it is not removed
 * while it has, so that each of its sales is settled while it is still an integration of the
 * account. What the owner can tell (checkout-spec SPEC.md §31):
 * - its orders whose address is leased still (an invoice open, or underpaid, until its lease's
 *   end): the confirmed leases of the addresses of its lot, and of those its witnesses name;
 * - the payments its server saw in time, not REQUIRED_CONFIRMATIONS deep yet, as the explorer
 *   shows the address now (a transaction replaced or dropped since is no payment), and their
 *   replacements (RBF, src/lib/onchain/replacement.ts), witnessed by its server or not yet.
 * Its orders paid over Lightning alone cannot be listed (their declarations are at addresses
 * their payment hashes derive); a Lightning payment is dated when it is made, before the removal
 * (model.ts, markVouches). No wallet, hence no passkey: the leases, the witnesses and the explorer.
 */

/**
 * How far back the witnesses are read: a transaction unconfirmed for longer has left the mempools
 * (Bitcoin Core's default expiry, 336 hours).
 */
export const PENDING_LOOKBACK_SECONDS = 14 * 24 * 3600;

/** Addresses asked of the explorer at once. */
const ADDRESSES_AT_ONCE = 4;

/** What of an integration is not final yet. */
export type IntegrationPending = {
  /** Its orders whose address is still leased: open, or underpaid within their time. */
  open: number;
  /** When the last of those leases ends (Unix seconds), null without one. */
  openUntil: number | null;
  /** Its payments seen in time, not REQUIRED_CONFIRMATIONS deep yet. */
  confirming: number;
};

/**
 * What of `integration` is not final yet, read on `call`'s relays (the owner's: `call.authKey` is
 * the team's) and the explorer. Null when that cannot be told: fewer than a majority of the
 * relays answered, a record of a newer format, the explorer failing.
 */
export async function findIntegrationPending(
  team: TeamKeys,
  integration: { id: string },
  call: RelayCall,
  now: number = nowUnix()
): Promise<IntegrationPending | null> {
  const keys = deriveIntegrationKeys(integrationSecretKey(team, integration.id));
  const holders = [{ id: integration.id, keys }];
  const network = getBreezNetwork();
  const lots = await fetchIntegrationLots(team, holders, network, call);
  const state = lots?.get(integration.id);
  if (!lots || state?.newer) return null;
  const read = await fetchWitnesses(holders, addressHrp(network), now - PENDING_LOOKBACK_SECONDS, {
    relays: call.relays,
    channel: "account",
    timeoutMs: call.timeoutMs
  });
  if (!read || read.newer.size > 0) return null;
  const addresses = [
    ...new Set([...(state?.lot?.addresses ?? []), ...read.witnesses.map(({ address }) => address)])
  ];

  // Its orders still holding an address (a lease ends at most 4 320 s after it is made).
  let open = 0;
  let openUntil: number | null = null;
  if (addresses.length > 0) {
    const leases = await ownerLeasesOf(
      { key: deriveRegistryKey(team), reader: deriveRegistryReader(team) },
      addresses,
      addressHrp(network),
      { relays: call.relays, since: now - 2 * 3600 }
    );
    if (leases === null) return null;
    for (const found of leases.values()) {
      if (found.newer) return null;
      for (const lease of found.leases) {
        // A try never confirmed (SPEC.md §31) is no order's: nothing to settle.
        if (!lease.confirmed) continue;
        // The clock tolerance: its server's clock may be behind the owner's.
        if (lease.end + LEASE_CLOCK_TOLERANCE_SECONDS < now) continue;
        open += 1;
        openUntil = Math.max(openUntil ?? 0, lease.end);
      }
    }
  }

  // Its payments seen in time, by address: how deep each is now.
  const paidTo = new Map<string, SeenWitness[]>();
  for (const witness of read.witnesses) {
    if (witness.sale !== null) {
      paidTo.set(witness.address, [...(paidTo.get(witness.address) ?? []), witness]);
    }
  }
  let confirming = 0;
  if (paidTo.size > 0) {
    try {
      // The height and the addresses from the same explorer (explorer.ts): confirmations count
      // against it.
      const { api, tip } = await readChain(await deviceChainSources(), async (from) => ({
        api: from,
        tip: await fetchTipHeight(from)
      }));
      const counts = await inBatches([...paidTo], ADDRESSES_AT_ONCE, async ([address, seen]) => {
        // Not listed any more: replaced or dropped, no payment.
        const listed = await fetchAddressTxs(api, address);
        const shallow = listed.filter((tx) => confirmationsOf(tx, tip) < REQUIRED_CONFIRMATIONS);
        const pending = new Set<string>();
        for (const sale of new Set(seen.map((witness) => witness.sale))) {
          const ofSale = seen.filter((witness) => witness.sale === sale);
          const inTime = new Set(ofSale.flatMap((w) => (w.replacement ? [] : [w.txid])));
          // As its server counts them (checkout-spec SPEC.md §31): a part of a payment witnessed
          // in time, the transaction's own or one it replaces.
          const parts = witnessedParts(ofSale, listed);
          for (const tx of shallow) {
            const own = parts.get(tx.txid) ?? [];
            if (own.some(({ source }) => inTime.has(source))) pending.add(tx.txid);
          }
        }
        return pending.size;
      });
      if (counts === null) return null;
      confirming = counts.reduce((sum, count) => sum + count, 0);
    } catch (error) {
      logFailure("Reading the integration's payments failed", error);
      return null;
    }
  }
  return { open, openUntil, confirming };
}
