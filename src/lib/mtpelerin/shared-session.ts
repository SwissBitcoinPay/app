import { bytesToHex } from "@noble/hashes/utils.js";

import { majority } from "@/config/registry";
import type { NostrEvent } from "@/lib/nostr/event";
import { deriveKey, nostrKeys, type NostrKeys } from "@/lib/nostr/keys";
import { publishToQuorum, queryRelays } from "@/lib/nostr/pool";
import { NewerRecordError, RECORD_KIND, openRecord, sealRecord } from "@/lib/nostr/record";
import { usableTeamKeys, type TeamKeys } from "@/lib/team/keys";

import type { MtpEnvironment } from "./environment";
import { readSessionState, type MtpSessionState } from "./session-format";

/*
 * The account's Mt Pelerin session on its relays: one SMS login for
 * all the owner's devices, the web app included, which keeps nothing across visits
 * (session-store.web.ts). One record of the account: the refresh token and its date, the
 * 1-sat invoices paid; never the access token, which each device gets from the refresh token.
 *
 * Sealed (NIP-44, record.ts) with keys derived from the team's root (src/lib/team/keys.ts): the
 * owner's passkey gives them back on each of the owner's devices; never on an employee's, which
 * holds its member's secret only. Its own author, so that a read by author lists this record alone;
 * its `d` tag is opaque. One record per Mt Pelerin (environment.ts), each with keys of its own: a
 * token of one is never sent to the other. Padded to 2 KiB: the size does not tell whether a
 * session is held.
 *
 * Who holds the passkey takes the session without the SMS: the passkey also gives the wallet, which
 * the session is worth less than. Each device merges the copies it reads with its own
 * (session-sync.ts): the latest token wins, by its date; the paid invoices add up. A change is
 * published once a majority of the relays answered the read before it (any two majorities share a
 * relay), dated after every copy seen: relays keep the latest event of an address (NIP-01).
 */

/**
 * HKDF salt of the record's keys. **Never change** it nor the `info` strings below once released:
 * the devices would no longer find the account's session, and a new SMS login would be needed on
 * each.
 */
const SALT = "sattle.me/mtpelerin-session";

const RECORD_TYPE = "mtpelerin-session";

/** Format of the record's value. A change of format needs a new version and a migration. */
export const SHARED_SESSION_VERSION = 1;

/** The record's padding (record.ts): a refresh token (a JWT) and MAX_PAID invoices fit in one. */
const PADDING_BLOCK = 2048;

/** Per relay, connection included: the flow's opening waits for the read ("Reading…"). */
export const SHARED_SESSION_TIMEOUT_MS = 5_000;

/** The keys of the account's Mt Pelerin session on the relays. In memory only, like the team's. */
export type MtpSessionKeys = {
  /** Signs the record: readers ask the relays for this author's events only. */
  nostr: NostrKeys;
  /** NIP-44 key of the record. */
  encryptionKey: Uint8Array;
  /** The record's `d` tag. */
  address: string;
};

/**
 * The keys of `team`'s account at the Mt Pelerin `environment`; throws once its keys are wiped (the
 * account closed).
 */
export function deriveMtpSessionKeys(team: TeamKeys, environment: MtpEnvironment): MtpSessionKeys {
  const root = usableTeamKeys(team).root;
  const derive = (info: string) => deriveKey(root, SALT, `${environment}/${info}`);
  return {
    // Throws for the 0 or ≥ n keys BIP-340 refuses: an HKDF output has odds below 2^-127.
    nostr: nostrKeys(derive("author/v1")),
    encryptionKey: derive("encryption-key/v1"),
    address: bytesToHex(derive("address/v1"))
  };
}

/** The record of `state`, dated `createdAt` (Unix seconds, not before `state.sessionAt`). */
export function sharedSessionEvent(
  keys: MtpSessionKeys,
  state: MtpSessionState,
  createdAt: number
): NostrEvent {
  return sealRecord({
    type: RECORD_TYPE,
    value: {
      version: SHARED_SESSION_VERSION,
      refreshToken: state.refreshToken,
      sessionAt: state.sessionAt,
      paidValidations: state.paidValidations
    },
    signer: keys.nostr.secretKey,
    encryptionKey: keys.encryptionKey,
    address: keys.address,
    createdAt,
    block: PADDING_BLOCK
  });
}

function parseShared(value: unknown, event: NostrEvent): MtpSessionState | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.version === "number" && v.version > SHARED_SESSION_VERSION) {
    throw new NewerRecordError();
  }
  if (v.version !== SHARED_SESSION_VERSION) return null;
  const state = readSessionState(v);
  // A token is never dated after the record that carries it (sharedSessionEvent).
  return state && state.sessionAt <= event.created_at ? state : null;
}

/** What the relays hold of the account's session. */
export type SharedSessions = {
  /** Every readable copy they sent, the same once. */
  copies: MtpSessionState[];
  /** The latest `created_at` among them, readable or not (-1: none): a next record goes after it. */
  latestAt: number;
  /** A copy of a newer format exists: never published over (staging gets OTA rollbacks). */
  newer: boolean;
  /** Whether a majority of the relays answered: only then is a change published. */
  conclusive: boolean;
};

/**
 * The copies of `team`'s session that `relays` hold. A relay that gives an author's events to that
 * author only (NIP-42) gets the record's key. Never rejects but once the account's keys are wiped.
 */
export async function fetchSharedSessions(
  team: TeamKeys,
  environment: MtpEnvironment,
  relays: readonly string[]
): Promise<SharedSessions> {
  const keys = deriveMtpSessionKeys(team, environment);
  const answers = await queryRelays(
    { kinds: [RECORD_KIND], authors: [keys.nostr.publicKey], "#d": [keys.address] },
    {
      channel: "account",
      relays,
      timeoutMs: SHARED_SESSION_TIMEOUT_MS,
      authKey: () => deriveMtpSessionKeys(team, environment).nostr.secretKey
    },
    { quorum: "majority" }
  );
  const copies: MtpSessionState[] = [];
  const opened = new Set<string>();
  let latestAt = -1;
  let newer = false;
  for (const events of answers.values()) {
    for (const value of events) {
      const record = openRecord(value, {
        type: RECORD_TYPE,
        encryptionKey: keys.encryptionKey,
        address: keys.address,
        author: keys.nostr.publicKey,
        parse: parseShared
      });
      if (!record || opened.has(record.event.id)) continue;
      opened.add(record.event.id);
      latestAt = Math.max(latestAt, record.event.created_at);
      if (record.status === "newer") newer = true;
      else copies.push(record.value);
    }
  }
  return { copies, latestAt, newer, conclusive: answers.size >= majority(relays.length) };
}

/**
 * Publishes `state` as `team`'s session, dated `createdAt`. Resolves once a majority of `relays`
 * took it, rejects as soon as they no longer can.
 */
export function publishSharedSession(
  team: TeamKeys,
  environment: MtpEnvironment,
  state: MtpSessionState,
  createdAt: number,
  relays: readonly string[]
): Promise<void> {
  const event = sharedSessionEvent(deriveMtpSessionKeys(team, environment), state, createdAt);
  return publishToQuorum(
    event,
    {
      channel: "account",
      relays,
      timeoutMs: SHARED_SESSION_TIMEOUT_MS,
      // Refused once the account's keys are wiped: the event signed, no relay authenticated.
      authKey: () => deriveMtpSessionKeys(team, environment).nostr.secretKey
    },
    majority(relays.length)
  );
}
