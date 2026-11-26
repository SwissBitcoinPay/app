import { INTEGRATION_LOT_SIZE } from "@/config/onchain";
import { majority } from "@/config/registry";
import type { BreezNetwork } from "@/lib/breez/config";
import type { NostrEvent } from "@/lib/nostr/event";
import { queryRelays, type RelayCall } from "@/lib/nostr/pool";
import {
  NewerRecordError,
  RECORD_KIND,
  newestRecord,
  openRecord,
  sealRecord
} from "@/lib/nostr/record";
import { parseDepositAddress } from "@/lib/onchain/address";
import { usableTeamKeys, type TeamKeys } from "@/lib/team/keys";
import { isUnixSeconds } from "@/lib/team/shared";

import type { IntegrationKeys } from "./keys";

/*
 * An integration's lot of on-chain addresses (checkout-spec SPEC.md §31):
 * its server has no wallet, so the owner gives it addresses of the wallet, as it gives each
 * employee its own lot (src/lib/team/onchain-lot.ts). One record per integration, signed by the
 * team and sealed with the integration's channel key: its server reads it with its secret key
 * alone, and only the owner writes it. Unlike an employee's, the lot is not used up by its sales:
 * an order of the shop leases an address for the time of its invoice, in the registry
 * (src/lib/registry/onchain.ts), and the address is free again once the lease ended, unless it
 * was paid on-chain. The owner takes those out and fills the lot up again at each login or unlock,
 * and fills it once the integration is created (src/features/team/integration-addresses.ts). Its
 * servers never write it: what they lease is in the registry, where the owner reads it.
 *
 * Never change the record's type, its `d` tag (deriveIntegrationKeys) nor its key: every server
 * reads them (checkout-spec's vectors/app/onchain-lot.json locks them).
 */

const LOT_TYPE = "integration-onchain-lot";

/** Format of the lot's value (SPEC.md §31). */
export const INTEGRATION_LOT_VERSION = 1;

export type IntegrationLot = {
  version: typeof INTEGRATION_LOT_VERSION;
  /** Deposit addresses of the owner's wallet, at most INTEGRATION_LOT_SIZE, none twice. */
  addresses: string[];
  /** Unix seconds, strictly increasing: the record's `created_at`. */
  updatedAt: number;
};

/**
 * Distinct deposit addresses of `network`, as the app writes them (lowercase), at most
 * INTEGRATION_LOT_SIZE: null otherwise. A lot with one wrong address is wrong as a whole, as the
 * servers read it (SPEC.md §31).
 */
function parseAddresses(value: unknown, network: BreezNetwork): string[] | null {
  if (!Array.isArray(value) || value.length > INTEGRATION_LOT_SIZE) return null;
  const addresses: string[] = [];
  for (const item of value) {
    const address = typeof item === "string" ? parseDepositAddress(item, network) : null;
    if (address === null || address !== item || addresses.includes(address)) return null;
    addresses.push(address);
  }
  return addresses;
}

export function parseIntegrationLot(
  value: unknown,
  event: NostrEvent,
  network: BreezNetwork
): IntegrationLot | null {
  if (value === null || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (v.version !== INTEGRATION_LOT_VERSION || !isUnixSeconds(v.updatedAt)) return null;
  if (v.updatedAt !== event.created_at) return null;
  const addresses = parseAddresses(v.addresses, network);
  return addresses ? { version: INTEGRATION_LOT_VERSION, addresses, updatedAt: v.updatedAt } : null;
}

/** The integration's lot, signed by the team: only the owner makes one. */
export function integrationLotEvent(
  team: TeamKeys,
  keys: IntegrationKeys,
  lot: IntegrationLot
): NostrEvent {
  return sealRecord({
    type: LOT_TYPE,
    value: lot,
    signer: usableTeamKeys(team).secretKey,
    encryptionKey: keys.channel.encryptionKey,
    address: keys.lotAddress,
    createdAt: lot.updatedAt
  });
}

export function openIntegrationLot(
  value: unknown,
  teamPublicKey: string,
  keys: IntegrationKeys,
  network: BreezNetwork
) {
  return openRecord(value, {
    type: LOT_TYPE,
    encryptionKey: keys.channel.encryptionKey,
    address: keys.lotAddress,
    author: teamPublicKey,
    parse: (payload, event) => {
      // A version above the one known: of a newer format, never written over.
      const version = (payload as { version?: unknown } | null)?.version;
      if (typeof version === "number" && version > INTEGRATION_LOT_VERSION) {
        throw new NewerRecordError();
      }
      return parseIntegrationLot(payload, event, network);
    }
  });
}

/** What the owner reads of an integration's lot. */
export type IntegrationLotState = {
  /** The newest valid copy, null when none. */
  lot: IntegrationLot | null;
  /** A copy of a newer format is the newest: the lot is left as it is. */
  newer: boolean;
};

/**
 * The lots of several integrations (one query), by id, as the owner reads them (`call.authKey`:
 * the team's key, their author). Null when fewer than a majority of the relays answered: a newer
 * copy may be on the others, and a lot is only written from what a majority holds.
 */
export async function fetchIntegrationLots(
  team: TeamKeys,
  integrations: readonly { id: string; keys: IntegrationKeys }[],
  network: BreezNetwork,
  call: RelayCall
): Promise<Map<string, IntegrationLotState> | null> {
  if (integrations.length === 0) return new Map();
  const answers = await queryRelays(
    {
      kinds: [RECORD_KIND],
      authors: [team.publicKey],
      "#d": integrations.map(({ keys }) => keys.lotAddress)
    },
    call,
    { quorum: "majority" }
  );
  if (answers.size < majority(call.relays.length)) return null;
  return new Map(
    integrations.map(({ id, keys }) => {
      const found = newestRecord(answers, (value) =>
        openIntegrationLot(value, team.publicKey, keys, network)
      );
      const newer =
        found.newestUnreadable !== null &&
        found.newestUnreadable >= (found.newest?.event.created_at ?? -1);
      return [id, { lot: found.newest?.value ?? null, newer }];
    })
  );
}
