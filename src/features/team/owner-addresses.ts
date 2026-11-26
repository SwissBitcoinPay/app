import { INTEGRATION_LOT_PUBLISH_EVERY, isOnchainAvailable } from "@/config/onchain";
import { majority } from "@/config/registry";
import { ASSISTANT_LOT_SIZE, MEMBER_LOT_SIZE } from "@/config/team";
import { withAccountWallet } from "@/features/account/background-wallet";
import {
  getAccountWalletId,
  subscribeAccount,
  whenAccountSynced
} from "@/features/account/session";
import { getBreezNetwork } from "@/lib/breez/config";
import { newDepositAddress } from "@/lib/breez/wallet";
import { logFailure } from "@/lib/log/log";
import { publishToRelays } from "@/lib/nostr/pool";
import { nowUnix } from "@/lib/rates/snapshot";
import { deriveIssueKey, type MemberKeys } from "@/lib/team/keys";
import { fetchDevices, hasLeft } from "@/lib/team/member-records";
import {
  ASSISTANT_LOT_VERSION,
  EMPLOYEE_LOT_VERSION,
  fetchLotStates,
  issueTag,
  lotEvent,
  type LotVersion,
  type MemberLot
} from "@/lib/team/onchain-lot";
import { makesInvoices } from "@/lib/team/roster";

import { assistantKeysOf } from "./assistants";
import { TeamError, inviteEndsOf, keysOf, openTeam, relayCall } from "./owner";
import { readRoster } from "./roster";

/*
 * The owner's side of the employees' (and assistants') lots of on-chain addresses
 * (src/lib/team/onchain-lot.ts): when the owner logs in or unlocks (useTeamChannelsSync),
 * and once an employee is invited (else its lot would be empty until the owner's next
 * login or unlock, its device taking no on-chain payment meanwhile, EmployeesScreen), and once an
 * assistant is created (its MCP server's invoices had no on-chain address until then,
 * NewIntegrationSheet), each lot gets its used addresses dropped and is filled up again as soon as
 * one is missing, with new addresses of the wallet, connected for that in the background once the
 * account is open, then disconnected: an employee's to MEMBER_LOT_SIZE, an assistant's to
 * ASSISTANT_LOT_SIZE, each in its lot's version. The emptiest lot
 * first, published as it fills, every INTEGRATION_LOT_PUBLISH_EVERY new addresses (as an
 * integration's lot: an assistant's MCP server takes on-chain addresses before its lot is full),
 * and once more at the end. A lot of a newer format (a newer app of the owner's) is left as it is.
 * The employees' devices read their lot with their channel. An employee whose invitation ended
 * unused gets none, nor one who left, nor any employee while the point of sale takes Lightning
 * only ("On-chain payments" off); an assistant's lot is filled whatever that setting says
 * (its invoices always offer on-chain).
 *
 * No time limit, as for the integrations' lots (integration-addresses.ts):
 * the wallet is waited for, then gives the addresses missing, one after the other, for as long as
 * it takes, while the account stays open and the connection stays this filling's.
 */

type Plan = {
  memberId: string;
  keys: MemberKeys;
  /** The most addresses the lot holds, and the version it is written in (onchain-lot.ts). */
  size: number;
  version: LotVersion;
  lot: MemberLot | null;
  /** The lot's addresses the employee's device (or the assistant) did not use. */
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
 * Fills the employees' and assistants' lots up again (at the owner's login or unlock), in the
 * background. `again` (an employee just invited, an assistant just created): a filling running
 * read the roster before it, so another follows that one, rather than sharing it. `now`: Unix
 * seconds (the lots' dates). Never rejects.
 */
export function syncEmployeeAddresses({
  again = false,
  now = nowUnix
}: { again?: boolean; now?: () => number } = {}): Promise<void> {
  const current = running;
  if (again && current) {
    following ??= current
      .catch(() => undefined)
      .then(() => {
        following = null;
        return syncEmployeeAddresses({ now });
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
    const { team, settings } = openTeam();
    const at = now();
    const call = relayCall(team);
    const { authKey, relays } = call;
    // The employees and the assistants as the relays and this device know them: none read, none
    // filled.
    const roster = await readRoster(team, relays);
    // Lightning only at the point of sale ("On-chain payments" off): the employees' devices take
    // no address, their lots are left as they are, filled again once it is back on. Never the
    // assistants': that setting is the point of sale's only, their
    // invoices always offer an on-chain address (owner.ts activeChannel).
    const members = settings.onchainPayments
      ? roster.roster.employees.map((member) => ({
          id: member.id,
          member,
          keys: keysOf(team, member)
        }))
      : [];
    // An assistant's lot, as an employee's: its MCP server
    // takes its invoices' on-chain addresses there, for as long as it is in the team. None for one
    // that makes no invoices: it would never use them.
    const assistants = roster.roster.assistants.filter(makesInvoices).map(({ id }) => ({
      id,
      keys: assistantKeysOf(team, id).member,
      size: ASSISTANT_LOT_SIZE,
      version: ASSISTANT_LOT_VERSION
    }));
    if (members.length === 0 && assistants.length === 0) return;
    const devices = await fetchDevices(members, relays);
    if (!devices) return;
    // Each invitation's end as its record says, for those whose device is not known.
    const ends = await inviteEndsOf(
      team,
      members.map(({ member }) => member),
      relays,
      at,
      devices
    );
    // Those that joined, or still may: an invitation ended unused gets no addresses, nor an
    // employee who left ("Leave the business": its device forgot its lot).
    const holders = [
      ...members
        .filter(({ id }) => {
          const device = devices.get(id);
          return device ? !hasLeft(device) : ends.get(id)! > at;
        })
        .map(({ id, keys }) => ({
          id,
          keys,
          size: MEMBER_LOT_SIZE,
          version: EMPLOYEE_LOT_VERSION
        })),
      ...assistants
    ];
    if (holders.length === 0) return;
    const states = await fetchLotStates(team, holders, getBreezNetwork(), authKey, relays);
    if (!states) return;
    const plans: Plan[] = holders.flatMap(({ id, keys, size, version }) => {
      const { lot, used, newer } = states.get(id) ?? { lot: null, used: null, newer: false };
      // A lot, or used addresses, of a newer format: left as it is.
      if (newer) return [];
      // The device holds a newer lot than the relays that answered: this one may hold addresses
      // the newer one dropped as used. Filled at the next login or unlock, from the newer one.
      if (used && used.lotAt > (lot?.updatedAt ?? 0)) return [];
      const usedSet = new Set(used?.used ?? []);
      return [
        {
          memberId: id,
          keys,
          size,
          version,
          lot,
          left: (lot?.addresses ?? []).filter((a) => !usedSet.has(a)),
          fresh: [],
          sent: null,
          publishing: Promise.resolve()
        }
      ];
    });
    // Each address with the owner's tag (onchain-lot.ts): the owner recognizes it later in the
    // employee's sales, without keeping a list.
    const issueKey = deriveIssueKey(team);
    const lastUpdate = (plan: Plan) =>
      Math.max(plan.lot?.updatedAt ?? 0, plan.sent?.updatedAt ?? 0);
    // A copy of the lot as it is now, after those already on their way. One a newer copy replaced
    // while it waited is not published: the newer one carries all its addresses.
    const publish = (plan: Plan, updatedAt: number) => {
      const sent = { addresses: [...plan.left, ...plan.fresh], updatedAt, held: false };
      plan.sent = sent;
      plan.publishing = plan.publishing
        .then(async () => {
          if (plan.sent !== sent) return;
          const tags = sent.addresses.map((address) => issueTag(issueKey, plan.memberId, address));
          const event = lotEvent(team, plan.keys, {
            version: plan.version,
            addresses: sent.addresses,
            tags,
            updatedAt
          });
          const took = await publishToRelays(event, call, { quorum: "majority" });
          sent.held = took.length >= majority(relays.length);
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
          logFailure("Publishing an employee's on-chain addresses failed", error);
        });
    };
    if (plans.some((plan) => plan.left.length < plan.size)) {
      // Every address a lot holds or its employee's device used (a lot left as it is included):
      // one the wallet hands out again is never given twice.
      const given = new Set<string>([
        ...[...states.values()].flatMap(({ lot, used }) => [
          ...(lot?.addresses ?? []),
          ...(used?.used ?? [])
        ]),
        ...(unheld.get(team.publicKey) ?? [])
      ]);
      await withAccountWallet(Number.POSITIVE_INFINITY, async (walletId, own) => {
        // The emptiest first: a new assistant's or employee's lot before a full one's last address.
        const order = [...plans].sort((a, b) => a.left.length - b.left.length);
        for (const plan of order) {
          while (plan.left.length + plan.fresh.length < plan.size) {
            // The account closed, a wallet screen took the connection, or the account's deletion
            // asks for it: what was obtained is given, the rest at the next login, unlock or
            // invitation shown.
            if (getAccountWalletId() !== walletId || !own()) return;
            const address = await newDepositAddress(walletId);
            // An address handed out again: the wallet gives no new one now; a lot holds each
            // address once (onchain-lot.ts). The rest at the next login, unlock or invitation shown.
            if (given.has(address)) return;
            given.add(address);
            plan.fresh.push(address);
            // Its holder takes on-chain addresses before the lot is full: the new addresses, every
            // INTEGRATION_LOT_PUBLISH_EVERY, never twice in one second (each copy dated now,
            // strictly after the one before).
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
        // Offline, no API key, the wallet busy: the lots get what was obtained.
        logFailure("Getting the employees' on-chain addresses failed", error);
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
      logFailure("Filling the employees' on-chain addresses failed", error);
    }
  }
}
