import { logFailure } from "@/lib/log/log";
import type { NostrEvent } from "@/lib/nostr/event";
import { publishAgain, type RelayCall } from "@/lib/nostr/pool";

/*
 * The team's sync (syncTeamChannels, owner.ts) gives the relays that lack a record of the team (a
 * channel up to date, a seat's record, an export grant) the copy a majority gave, as it is. Such a
 * repair decides nothing: it is published once the team's lock is left. A relay that stays connected
 * without answering, or one slow to write (19 to 42 s seen), would otherwise hold every
 * change of the team (an invitation made just after unlocking the app) up to its timeout.
 *
 * Out of the lock, a repair never undoes a change made meanwhile: its copy keeps its date, and a
 * newer record at its address (a removal) replaces it on a relay, or makes the relay refuse it.
 */

/** A record to give again, as it is, to the relays of `call` that lack it. */
export type Repair = { event: NostrEvent; call: RelayCall };

/**
 * Publishes `repairs`, all at once, each to its relays (until a majority of them took it, the
 * others in the background): a relay that never answers costs the sync one timeout, not one per
 * batch of repairs (every member's channel lacks on it). All at once, as each member's channel was
 * given before: the calls share each relay's connection (relay.ts), none opens one of its own.
 * Never rejects: a relay still lacking one gets it at the next sync.
 */
export async function publishRepairs(repairs: readonly Repair[]): Promise<void> {
  const outcomes = await Promise.allSettled(
    repairs.map(async ({ event, call }) => publishAgain(event, call, { quorum: "majority" }))
  );
  const failed = outcomes.find((outcome) => outcome.status === "rejected");
  // The account closed meanwhile (its team keys wiped): at the next sync. Told once.
  if (failed) logFailure("Repairing the team's records failed", failed.reason);
}
