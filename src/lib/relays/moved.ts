import { bytesToHex } from "@noble/hashes/utils.js";

import { majority } from "@/config/registry";
import { logFailure } from "@/lib/log/log";
import type { NostrEvent } from "@/lib/nostr/event";
import { deriveKey } from "@/lib/nostr/keys";
import { publishToRelays, queryRelays } from "@/lib/nostr/pool";
import {
  NewerRecordError,
  RECORD_KIND,
  newestRecord,
  openRecord,
  sealRecord
} from "@/lib/nostr/record";

import { parseRelayList } from "./list";

/*
 * The notice of a move of the account's relays (no transition period): when
 * the owner changes the account's list, the backup goes once to the list left (session.ts), and
 * so does this notice, on the new list too. The owner's other devices read it on their own list,
 * also in till mode, without the passkey (src/features/relays/moved-notice.ts), and move to the new
 * list at once. Signed by the account's backup key, which the point of sale's profile names
 * (`backupKey`): only the owner can write it. Sealed with a key derived from the secret the owner's
 * devices share (`ownerDevicesSecret`, src/lib/team/keys.ts: derived from the passkey, never sent),
 * as is its `d` tag: only they read the new list (not with the wallet id, a public key). Padded to
 * 1 KiB blocks: the size does not tell the list's length.
 * The notice on the new list replaces an older one there, which a move back would have left
 * pointing away.
 */

const SALT = "sattle.me/relays-moved";
const RECORD_TYPE = "relays-moved";
const VERSION = 1;

/** Per relay, connection included. */
export const MOVED_TIMEOUT_MS = 10_000;

/** The padding of the sealed notice (record.ts): one block holds a list of MAX_RELAYS relays. */
const PADDING_BLOCK = 1024;

/** The account's relays, as of `at` (Unix seconds, the event's `created_at`). */
export type RelaysMoved = { version: typeof VERSION; relays: string[]; at: number };

/**
 * The notice's keys, from the secret the owner's devices share. **Never change** the salt nor the
 * `info` strings: the devices would no longer find the notice.
 */
function movedKeys(shared: Uint8Array): { encryptionKey: Uint8Array; address: string } {
  return {
    encryptionKey: deriveKey(shared, SALT, "encryption-key/v1"),
    address: bytesToHex(deriveKey(shared, SALT, "address/v1"))
  };
}

function parseMoved(value: unknown, event: NostrEvent): RelaysMoved | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.version === "number" && v.version > VERSION) throw new NewerRecordError();
  const relays = parseRelayList(v.relays);
  if (v.version !== VERSION || !relays || v.at !== event.created_at) return null;
  return { version: VERSION, relays, at: v.at };
}

/**
 * The notice that the account's relays are `relays` from `at`, signed by its backup key
 * `backupSecret`, sealed for its owner's devices (`shared`, ownerDevicesSecret).
 */
export function movedEvent(
  backupSecret: Uint8Array,
  shared: Uint8Array,
  relays: readonly string[],
  at: number
): NostrEvent {
  const { encryptionKey, address } = movedKeys(shared);
  return sealRecord({
    type: RECORD_TYPE,
    value: { version: VERSION, relays: [...relays], at } satisfies RelaysMoved,
    signer: backupSecret,
    encryptionKey,
    address,
    createdAt: at,
    block: PADDING_BLOCK
  });
}

/**
 * Publishes the notice to `relays` (the new list and those left). Resolves with those that took it
 * once a majority of them did, or could not (the others go on in the background). Advisory: a
 * device follows it to the account's backup, which decides (session.ts).
 */
export function publishMoved(
  event: NostrEvent,
  relays: readonly string[],
  authKey: () => Uint8Array
): Promise<string[]> {
  return publishToRelays(
    event,
    { channel: "account", relays, timeoutMs: MOVED_TIMEOUT_MS, authKey },
    { quorum: "majority" }
  );
}

export type MovedLookup =
  { status: "found"; moved: RelaysMoved } | { status: "notFound" } | { status: "unreachable" };

/**
 * The newest notice of the account's relays that the relays `relays` hold, signed by its backup key
 * `backupKey` (hex, the point of sale's profile's), opened with the secret its owner's devices share
 * (`shared`). Never rejects.
 */
export async function fetchMoved(
  backupKey: string,
  shared: Uint8Array,
  relays: readonly string[]
): Promise<MovedLookup> {
  try {
    const { encryptionKey, address } = movedKeys(shared);
    const answers = await queryRelays(
      { kinds: [RECORD_KIND], authors: [backupKey], "#d": [address] },
      // A relay that asks to authenticate: the connection's own key (relay.ts).
      { channel: "account", relays, timeoutMs: MOVED_TIMEOUT_MS },
      { quorum: "majority" }
    );
    if (answers.size === 0) return { status: "unreachable" };
    const { newest } = newestRecord(answers, (value) =>
      openRecord(value, {
        type: RECORD_TYPE,
        encryptionKey,
        address,
        author: backupKey,
        parse: parseMoved
      })
    );
    if (newest) return { status: "found", moved: newest.value };
    // None from fewer than a majority: one may be on the others.
    return { status: answers.size >= majority(relays.length) ? "notFound" : "unreachable" };
  } catch (error) {
    logFailure("Reading the notice of the account's relays failed", error);
    return { status: "unreachable" };
  }
}
