import { majority } from "@/config/registry";
import { DELETION_KIND } from "@/lib/nostr/deletion";
import { isValidEvent, type NostrEvent } from "@/lib/nostr/event";
import { queryRelays, type AuthKey } from "@/lib/nostr/pool";
import { RECORD_KIND } from "@/lib/nostr/record";

/*
 * Whether the account of a backup key was deleted ("Delete account",
 * src/features/settings/account-deletion.ts), as the owner's other devices tell it: the relays
 * keep the deletion requests (NIP-09), and only the account's passkey gives the backup key that
 * signs them. A deletion counts when a request of the backup key names one of its records and is
 * as late as the newest record of that key the relays still send (a relay that missed it); a
 * record dated after it (the account created again with the same passkey) means it is not deleted
 * any more. Read on a majority of the relays, as any decision that must not be missed (AGENTS.md).
 */

export type AccountDeletion =
  /** Deleted, and nothing newer since. */
  | "deleted"
  /** No deletion, or the account was created again after it. */
  | "kept"
  /** Fewer than a majority of the relays answered: nothing can be told. */
  | "unknown";

/** What `events` (a relay's answers) tell of the account of `backupKey` (see above). */
export function accountDeletionOf(
  events: readonly unknown[],
  backupKey: string
): Exclude<AccountDeletion, "unknown"> {
  const prefix = `${RECORD_KIND}:${backupKey}:`;
  let deletedAt = -1;
  let latest = -1;
  for (const value of events) {
    const claimed = value as Partial<NostrEvent> | null;
    if (claimed?.pubkey !== backupKey) continue;
    if (claimed.kind === DELETION_KIND) {
      const names =
        Array.isArray(claimed.tags) &&
        claimed.tags.some(
          (tag) =>
            Array.isArray(tag) &&
            tag[0] === "a" &&
            typeof tag[1] === "string" &&
            tag[1].startsWith(prefix)
        );
      // The signature last: the cheap checks first.
      if (names && isValidEvent(value)) deletedAt = Math.max(deletedAt, value.created_at);
    } else if (claimed.kind === RECORD_KIND && isValidEvent(value)) {
      latest = Math.max(latest, value.created_at);
    }
  }
  return deletedAt >= 0 && deletedAt >= latest ? "deleted" : "kept";
}

/**
 * Whether the account of `backupKey` was deleted (see above), read on `relays` until a majority of
 * each of `lists` answered (the lists `relays` joins: the device's and the account's), as the
 * deletion's requests and the account's backups are each on a majority of the account's relays
 * (account-erasure.ts, session.ts). "unknown" when a list got fewer. A relay that asks to
 * authenticate gets `authKey`: the backup key's secret where the account is open (a relay may give
 * an author's events to that author only, NIP-42), else the connection's own key (relay.ts). Never
 * rejects.
 */
export async function fetchAccountDeletion(
  backupKey: string,
  relays: readonly string[],
  timeoutMs: number,
  signal?: AbortSignal,
  authKey?: AuthKey,
  lists: readonly (readonly string[])[] = [relays]
): Promise<AccountDeletion> {
  const answers = await queryRelays(
    { kinds: [DELETION_KIND, RECORD_KIND], authors: [backupKey] },
    { channel: "account", relays, timeoutMs, authKey, signal },
    { quorum: { lists } }
  );
  const read = lists.every(
    (list) => list.filter((relay) => answers.has(relay)).length >= majority(list.length)
  );
  if (!read) return "unknown";
  return accountDeletionOf([...answers.values()].flat(), backupKey);
}
