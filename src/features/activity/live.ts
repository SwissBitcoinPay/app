import { invoiceAssistants } from "@/features/invoices/invoices";
import { assistantKeysOf } from "@/features/team/assistants";
import { openTeam } from "@/features/team/owner";
import { knownRoster, type Roster } from "@/features/team/roster";
import { deriveIntegrationKeys } from "@/lib/integrations/keys";
import { nowUnix } from "@/lib/clock";
import { logFailure } from "@/lib/log/log";
import { watchRelays } from "@/lib/nostr/pool";
import { RECORD_KIND } from "@/lib/nostr/record";
import type { AuthKey } from "@/lib/nostr/relay";
import { currentRelays } from "@/lib/relays/current";
import type { OwnerDevice } from "@/lib/settings/merchant";
import {
  deriveInvoiceKeys,
  deriveMemberKeys,
  integrationSecretKey,
  memberSecret,
  ownerDeviceSecret,
  type TeamKeys
} from "@/lib/team/keys";
import { TEAM_TIMEOUT_MS } from "@/lib/team/shared";

import { witnessHolders } from "./onchain-sales";

/*
 * "Wallet" live: while it shows, a subscription stays open on the account's relays to the authors
 * of what its list is read from, so that a new sale, link, invoice or integration's order shows
 * within seconds rather than at the next read (ACTIVITY_REFRESH_MS, which stays: a relay that drops
 * the subscription, or a device whose clock is behind, is caught up there). An event is never read
 * here: it only says which read to make again (records, invoices, orders), and that read checks
 * what it reads as it always does. A relay can only nudge a read with an event signed by one of
 * these authors (watchRelays checks it).
 */

/** Which read a live event asks again (useOwnerActivity). */
export type LiveSource = "records" | "invoices" | "orders";

/** An author the list is read from: its public key, its key for NIP-42, and which read it feeds. */
export type LiveAuthor = { publicKey: string; authKey: AuthKey; source: LiveSource };

/**
 * The authors "Wallet" reads, for `roster` (the device's last read of it; null: none yet) and the
 * owner's `devices`:
 * - the records (sales, links) of the employees and of the owner's devices (readOwnerRecords);
 * - the invoices of the owner and of its assistants in the team that make some (loadInvoices: a
 *   removed one's are the owner's copies);
 * - the witnesses of the integrations' servers, removed ones included (readIntegrationOrders).
 * Only public keys are kept: each secret derives again when a relay asks for it, and is refused
 * once the account closes (its team keys wiped, usableTeamKeys).
 */
export function liveAuthors(
  team: TeamKeys,
  roster: Roster | null,
  devices: readonly OwnerDevice[]
): LiveAuthor[] {
  const authors: LiveAuthor[] = [];
  const records = (secret: () => Uint8Array) => {
    const keys = deriveMemberKeys(secret());
    authors.push(
      {
        publicKey: keys.nostr.publicKey,
        authKey: () => deriveMemberKeys(secret()).nostr.secretKey,
        source: "records"
      },
      {
        publicKey: keys.links.publicKey,
        authKey: () => deriveMemberKeys(secret()).links.secretKey,
        source: "records"
      }
    );
  };
  for (const { id } of roster?.employees ?? []) records(() => memberSecret(team, id));
  for (const { id } of devices) records(() => ownerDeviceSecret(team, id));
  authors.push({
    publicKey: deriveInvoiceKeys(team).nostr.publicKey,
    authKey: () => deriveInvoiceKeys(team).nostr.secretKey,
    source: "invoices"
  });
  if (roster) {
    for (const { id, removedAt } of invoiceAssistants(roster)) {
      // A removed assistant's invoices are the owner's copies (loadInvoices): its key, never
      // revoked, is no longer read.
      if (removedAt !== null) continue;
      authors.push({
        publicKey: assistantKeysOf(team, id).invoices.nostr.publicKey,
        authKey: () => assistantKeysOf(team, id).invoices.nostr.secretKey,
        source: "invoices"
      });
    }
    for (const { id, keys } of witnessHolders(team, roster)) {
      authors.push({
        publicKey: keys.seen.nostr.publicKey,
        authKey: () => deriveIntegrationKeys(integrationSecretKey(team, id)).seen.nostr.secretKey,
        source: "orders"
      });
    }
  }
  return authors;
}

/**
 * What "Wallet" watches for the open account: its authors (liveAuthors, with the roster this device
 * last read), on the device's relays and the account's. Null without an account.
 */
export function ownerLiveWatch(): { authors: LiveAuthor[]; relays: string[] } | null {
  try {
    const { team, settings } = openTeam();
    return {
      authors: liveAuthors(team, knownRoster(team)?.roster ?? null, settings.devices),
      relays: [...new Set([...currentRelays(), ...settings.relays])]
    };
  } catch (error) {
    logFailure("Watching the activity failed", error);
    return null;
  }
}

/**
 * How long before the watch starts it asks for: a record dated by a device whose clock is a little
 * behind still comes live. What the relays hold of that span comes at once, and asks its read once.
 */
export const LIVE_SINCE_MARGIN_SECONDS = 120;

/**
 * Keeps a subscription open on `relays` to the records of `authors` made from now on
 * (LIVE_SINCE_MARGIN_SECONDS before), and calls `onChange` with the read each one asks again, as
 * soon as a relay sends it (each event once, whichever relay sends it). Until the returned
 * function is called.
 */
export function watchOwnerActivity(
  authors: readonly LiveAuthor[],
  relays: readonly string[],
  onChange: (source: LiveSource) => void,
  now: number = nowUnix()
): () => void {
  if (authors.length === 0 || relays.length === 0) return () => {};
  const sources = new Map(authors.map(({ publicKey, source }) => [publicKey, source]));
  return watchRelays(
    {
      kinds: [RECORD_KIND],
      authors: [...sources.keys()],
      since: now - LIVE_SINCE_MARGIN_SECONDS
    },
    {
      channel: "account",
      relays,
      timeoutMs: TEAM_TIMEOUT_MS.background,
      // A relay may give an author's events to that author only (NIP-42).
      authKey: authors.map(({ authKey }) => authKey)
    },
    (event) => {
      const source = sources.get(event.pubkey);
      if (source) onChange(source);
    }
  );
}

/**
 * How long a live event waits before its read: the others of the same moment (a sale's record and
 * its device's sighting, an invoice and its link) join it, one read for them all.
 */
export const LIVE_SETTLE_MS = 400;

/**
 * `run`, called once LIVE_SETTLE_MS after the first `request` since its last call, however many
 * came meanwhile. `cancel` drops the one waiting.
 */
export function settled(run: () => void, delayMs: number = LIVE_SETTLE_MS) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return {
    request: () => {
      if (timer !== null) return;
      timer = setTimeout(() => {
        timer = null;
        run();
      }, delayMs);
    },
    cancel: () => {
      if (timer !== null) clearTimeout(timer);
      timer = null;
    }
  };
}
