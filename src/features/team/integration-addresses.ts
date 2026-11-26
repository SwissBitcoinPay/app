import {
  INTEGRATION_LOT_PUBLISH_EVERY,
  INTEGRATION_LOT_SIZE,
  isOnchainAvailable
} from "@/config/onchain";
import { majority } from "@/config/registry";
import { withAccountWallet } from "@/features/account/background-wallet";
import {
  getAccountWalletId,
  subscribeAccount,
  whenAccountSynced
} from "@/features/account/session";
import { getBreezNetwork } from "@/lib/breez/config";
import { newDepositAddress } from "@/lib/breez/wallet";
import { deriveIntegrationKeys, type IntegrationKeys } from "@/lib/integrations/keys";
import {
  INTEGRATION_LOT_VERSION,
  fetchIntegrationLots,
  integrationLotEvent,
  type IntegrationLot
} from "@/lib/integrations/onchain-lot";
import { fetchWitnesses } from "@/lib/integrations/onchain-witness";
import { logFailure } from "@/lib/log/log";
import { publishToRelays } from "@/lib/nostr/pool";
import { addressHrp } from "@/lib/onchain/address";
import { nowUnix } from "@/lib/rates/snapshot";
import { integrationSecretKey } from "@/lib/team/keys";
import { TEAM_TIMEOUT_MS } from "@/lib/team/shared";

import { TeamError, openTeam, relayCall } from "./owner";
import { readRoster } from "./roster";

/*
 * The owner's side of the integrations' lots of on-chain addresses
 * (src/lib/integrations/onchain-lot.ts, checkout-spec SPEC.md §31): when the owner logs in or
 * unlocks, as for the employees' lots (owner-addresses.ts), and once an integration is created
 * (its lot is empty until then), each integration's lot loses the addresses
 * its servers saw paid and is filled up again to INTEGRATION_LOT_SIZE with new addresses of the
 * wallet, connected for that in the background, then disconnected. The lot is published as it
 * fills, every INTEGRATION_LOT_PUBLISH_EVERY new addresses, and once more at the end. Whatever
 * "On-chain payments" says: that setting is the point of sale's, an integration takes on-chain
 * payments in any case, as the invoices do.
 *
 * As an employee's device tells the owner the addresses of its lot it used (src/lib/team/
 * onchain-lot.ts), an integration's servers tell it which were paid: each transaction they see
 * paying an address of the lot is a witness (src/lib/integrations/onchain-witness.ts), one record
 * per address and transaction, so that two servers writing at once lose none. The owner never asks
 * an explorer here. An address paid that no witness names yet stays: a server finds it paid when it
 * tries to lease it, skips it and writes its witness, and the next filling takes it out.
 *
 * No time limit: the wallet gives the addresses missing, one after the
 * other, for as long as it takes, while the account stays open.
 */

/**
 * How far before a lot's last update the witnesses of its integration are read: one made while the
 * owner's previous filling ran, or by a server whose clock is behind.
 */
export const WITNESS_LOT_LOOKBACK_SECONDS = 7 * 24 * 3600;

type Plan = {
  keys: IntegrationKeys;
  lot: IntegrationLot | null;
  /** The lot's addresses no witness names, in their order. */
  left: string[];
  fresh: string[];
  /** The last copy this filling published, and whether a majority of the relays took it. */
  sent: { addresses: string[]; updatedAt: number; held: boolean } | null;
  /** Its copies being published, one after the other: each strictly newer than the one before. */
  publishing: Promise<void>;
};

/** The filling running: a second login or unlock meanwhile shares it. */
let running: Promise<void> | null = null;

/** The filling that follows the one running (`again`), shared by every call asking for one. */
let following: Promise<void> | null = null;

/**
 * By team (its public key), the addresses of the lots this launch published that no majority of the
 * relays took: a read of a majority may miss such a copy, and its addresses are never given to
 * another lot all the same (`given`).
 */
const unheld = new Map<string, Set<string>>();

// Another account (or none): its lots are read again from the relays.
subscribeAccount(() => unheld.clear());

/**
 * Fills the integrations' lots up again (at the owner's login or unlock), in the background.
 * `again` (an integration just created): a filling running read the roster before it, so another
 * follows that one, rather than sharing it. `now`: Unix seconds (the lots' dates).
 */
export function syncIntegrationAddresses({
  again = false,
  now = nowUnix
}: { again?: boolean; now?: () => number } = {}): Promise<void> {
  const current = running;
  if (again && current) {
    following ??= current
      .catch(() => undefined)
      .then(() => {
        following = null;
        return syncIntegrationAddresses({ now });
      });
    return following;
  }
  running ??= fillLots(now).finally(() => {
    running = null;
  });
  return running;
}

async function fillLots(now: () => number): Promise<void> {
  try {
    if (!isOnchainAvailable()) return;
    await whenAccountSynced();
    const { team } = openTeam();
    const call = relayCall(team);
    const roster = await readRoster(team, call.relays);
    if (roster.status === "unread") return;
    const integrations = roster.roster.integrations.map(({ id }) => ({
      id,
      keys: deriveIntegrationKeys(integrationSecretKey(team, id))
    }));
    if (integrations.length === 0) return;
    const network = getBreezNetwork();
    const states = await fetchIntegrationLots(team, integrations, network, call);
    if (!states) return;
    // A lot of a newer format (a newer app of the owner's) is left as it is.
    const held = integrations.filter(({ id }) => !states.get(id)?.newer);
    const lots = held.flatMap(({ id }) => states.get(id)?.lot ?? []);
    // The witnesses since the oldest lot's update: every address they name was paid.
    const since = lots.length === 0 ? now() : Math.min(...lots.map(({ updatedAt }) => updatedAt));
    const read = await fetchWitnesses(
      held,
      addressHrp(network),
      since - WITNESS_LOT_LOOKBACK_SECONDS,
      { relays: call.relays, channel: "account", timeoutMs: TEAM_TIMEOUT_MS.background }
    );
    // Without a majority's answer, a witness may be missing: a paid address would stay.
    if (!read) return;
    const paid = new Map<string, Set<string>>();
    for (const { integration, address } of read.witnesses) {
      paid.set(integration, (paid.get(integration) ?? new Set()).add(address));
    }
    const plans: Plan[] = held.map(({ id, keys }) => {
      const lot = states.get(id)?.lot ?? null;
      const used = paid.get(id) ?? new Set<string>();
      return {
        keys,
        lot,
        left: (lot?.addresses ?? []).filter((address) => !used.has(address)),
        fresh: [],
        sent: null,
        publishing: Promise.resolve()
      };
    });
    const lastUpdate = (plan: Plan) =>
      Math.max(plan.lot?.updatedAt ?? 0, plan.sent?.updatedAt ?? 0);
    // A copy of the lot as it is now, after those already on their way. One a newer copy replaced
    // while it waited (a slow relay holds the one before for up to its timeout) is not published:
    // the newer one carries all its addresses, and every copy counts against the relays' limits.
    const publish = (plan: Plan, updatedAt: number) => {
      const sent = { addresses: [...plan.left, ...plan.fresh], updatedAt, held: false };
      plan.sent = sent;
      plan.publishing = plan.publishing
        .then(async () => {
          if (plan.sent !== sent) return;
          const event = integrationLotEvent(team, plan.keys, {
            version: INTEGRATION_LOT_VERSION,
            addresses: sent.addresses,
            updatedAt
          });
          const took = await publishToRelays(event, call, { quorum: "majority" });
          sent.held = took.length >= majority(call.relays.length);
          // Held: its addresses are on a majority now, which any later read meets.
          const set = unheld.get(team.publicKey) ?? new Set<string>();
          for (const address of sent.addresses) {
            if (sent.held) set.delete(address);
            else set.add(address);
          }
          unheld.set(team.publicKey, set);
        })
        .catch((error: unknown) => {
          // The account closed meanwhile (its team keys wiped): nothing more is published.
          logFailure("Publishing an integration's on-chain addresses failed", error);
        });
    };
    if (plans.some((plan) => plan.left.length < INTEGRATION_LOT_SIZE)) {
      // Every address a lot holds (a lot of a newer format's last copy read too) or its servers saw
      // paid: one the wallet hands out again is never given twice.
      const given = new Set<string>([
        ...[...states.values()].flatMap(({ lot }) => lot?.addresses ?? []),
        ...read.witnesses.map(({ address }) => address),
        ...(unheld.get(team.publicKey) ?? [])
      ]);
      await withAccountWallet(Number.POSITIVE_INFINITY, async (walletId, own) => {
        // The emptiest first: a busy shop's lot before a full one's last address.
        const order = [...plans].sort((a, b) => a.left.length - b.left.length);
        for (const plan of order) {
          while (plan.left.length + plan.fresh.length < INTEGRATION_LOT_SIZE) {
            // The account closed, a wallet screen took the connection, or the account's deletion
            // asks for it: what was obtained is given, the rest at the next login or unlock.
            if (getAccountWalletId() !== walletId || !own()) return;
            const address = await newDepositAddress(walletId);
            // An address handed out again (to this lot or another integration's, paid or not): the
            // wallet gives no new one now; asking on would never end (no time limit). The rest at
            // the next login or unlock.
            if (given.has(address)) return;
            given.add(address);
            plan.fresh.push(address);
            // Its servers take on-chain payments before the lot is full:
            // the new addresses, every INTEGRATION_LOT_PUBLISH_EVERY, never twice in one second
            // (each copy dated now, strictly after the one before).
            const sentFresh = plan.sent ? plan.sent.addresses.length - plan.left.length : 0;
            const time = now();
            if (
              plan.fresh.length - sentFresh >= INTEGRATION_LOT_PUBLISH_EVERY &&
              time > lastUpdate(plan)
            ) {
              publish(plan, time);
            }
          }
        }
      }).catch((error: unknown) => {
        // Offline, no API key, the wallet failing: the lots get what was obtained.
        logFailure("Getting the integrations' on-chain addresses failed", error);
      });
    }
    await Promise.all(
      plans.map(async (plan) => {
        await plan.publishing;
        const addresses = [...plan.left, ...plan.fresh];
        // Already on a majority of the relays as it is (a copy published while it filled), or
        // unchanged: a copy published that no majority took is published again.
        const same = plan.sent?.held ? plan.sent.addresses : plan.sent ? null : plan.lot?.addresses;
        if (same && addresses.join() === same.join()) return;
        if (addresses.length === 0 && !plan.lot) return;
        publish(plan, Math.max(now(), lastUpdate(plan) + 1));
        await plan.publishing;
      })
    );
  } catch (error) {
    // No account open (locked meanwhile), or its sign-up not done: nothing to fill.
    if (!(error instanceof TeamError)) {
      logFailure("Filling the integrations' on-chain addresses failed", error);
    }
  }
}
