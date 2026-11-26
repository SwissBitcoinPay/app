import { getAccountSettings, getAccountTeamKeys } from "@/features/account/session";
import type { SightingsBook } from "@/features/onchain/useOnchainTimes";
import { linkHolders } from "@/features/payment-link/owner-finals";
import { getTerminalProfile } from "@/features/terminal/profile-cache";
import { invoiceNetwork } from "@/features/terminal/invoice";
import { nowUnix } from "@/lib/rates/snapshot";
import { declareOnchainPayment } from "@/lib/registry/onchain-payments";
import type { DeclaredSale, Registry } from "@/lib/registry/registry";
import type { MemberKeys } from "@/lib/team/keys";
import { fetchSaleTxs, publishSaleTx } from "@/lib/team/member-records";

import { recordSigner } from "./member";
import { readRoster } from "./roster";

/*
 * The transactions the business's devices saw paying their sales' addresses (RBF;
 * member-records.ts, "team-sale-tx"): signed by the device's own keys, an employee's or
 * one of the owner's devices', which a payer's page never holds (the payer
 * publishes nothing). The point of sale and the devices that settle payment links record what they
 * see and read what was recorded: an employee's device its own; the owner's, its account open,
 * every device's of the business (the links of its employees' sales it settles).
 */

/** The keys this device signs with; null without (it records nothing). */
async function deviceKeys(): Promise<MemberKeys | null> {
  const profile = await getTerminalProfile();
  return profile ? ((await recordSigner(profile))?.keys ?? null) : null;
}

/** This device's book of the transactions seen paying its sales' addresses. */
export const DEVICE_SIGHTINGS: SightingsBook = {
  async record(address, txid) {
    const keys = await deviceKeys();
    // Without keys to sign, nothing is recorded.
    if (!keys) return;
    await publishSaleTx(keys, address, txid, nowUnix());
  },
  async read(address, since) {
    const keys = await deviceKeys();
    const holders: MemberKeys[] = keys ? [keys] : [];
    // The account open here: the owner's device (an employee's never opens it). Every device of the
    // business, as the roster a majority of the relays gave, else no answer.
    const team = getAccountTeamKeys();
    const settings = getAccountSettings();
    if (team && settings) {
      const roster = await readRoster(team, settings.relays);
      if (roster.status !== "read") return null;
      const all = linkHolders(
        team,
        roster.roster.employees,
        settings.devices,
        roster.roster.assistants
      );
      for (const holder of all) {
        if (!holders.some(({ nostr }) => nostr.publicKey === holder.keys.nostr.publicKey)) {
          holders.push(holder.keys);
        }
      }
    }
    return fetchSaleTxs(holders, address, invoiceNetwork(), since);
  }
};

/**
 * DEVICE_SIGHTINGS for a sale of the point of sale (useCharge, and its follower once its screen is
 * gone, src/features/terminal/SalesFollower.tsx): each transaction seen paying its address is also
 * declared in the business's registry with its sale's keys (onchain-payments.ts), so that
 * "Wallet" tells its deposit's sale for good, past the month its
 * records are read. Recorded once both are on a majority of the relays, tried again otherwise
 * (useOnchainTimes). Without a registry (a device without the business's registry key), the
 * device's records only.
 */
export function saleSightings(registry: Registry | null, sale: DeclaredSale): SightingsBook {
  if (!registry) return DEVICE_SIGHTINGS;
  return {
    name: "sale",
    async record(address, txid) {
      await Promise.all([
        DEVICE_SIGHTINGS.record(address, txid),
        declareOnchainPayment(registry, { txid, address }, sale)
      ]);
    },
    read: DEVICE_SIGHTINGS.read
  };
}
