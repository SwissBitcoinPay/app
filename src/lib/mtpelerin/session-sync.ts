import { logFailure } from "@/lib/log/log";
import type { TeamKeys } from "@/lib/team/keys";

import {
  emptyMtpSession,
  mergePaid,
  type MtpDeviceRecord,
  type MtpSessionOwner,
  type MtpSessionState,
  type PaidValidation
} from "./session-format";
import { changeMtpSession, loadMtpSession } from "./session-store";
import { fetchSharedSessions, publishSharedSession, type SharedSessions } from "./shared-session";

/*
 * The Mt Pelerin session of the open account: this device's copy (session-store.ts) merged with the
 * account's on the relays (shared-session.ts). The latest token wins, by its date (`sessionAt`),
 * this device's on a tie; the paid invoices add up. What this device changes (a login, a rotation,
 * "Log out of Mt Pelerin", an invoice paid) is kept here at once, then shared in the
 * background, after a read of the relays: dated after every copy read, as the latest change this
 * device knows of. Not taken by a majority of the relays, it is shared at the flow's next opening.
 *
 * A token refused is first looked for again on the relays: another device may have rotated it
 * (the old one then permanently consumed) or logged in since. Without a newer one, it is dropped
 * here only, never on the other devices: one of them may hold the next token. "Log out of Mt
 * Pelerin" drops it on all of them.
 */

/** What the store needs of the open account to share its session. */
export type SharedSessionAccess = {
  /** The account's team keys (getAccountTeamKeys): wiped once it closes, which stops the sharing. */
  team: TeamKeys;
  /** The account's relays (currentRelays). */
  relays: () => readonly string[];
};

export type MtpSessionStore = {
  /** The session at the flow's opening, the relays read; what they miss is shared. */
  load(): Promise<MtpSessionState>;
  /** A token this device got (a login, a rotation) or dropped (null: logged out on every device). */
  keep(refreshToken: string | null): Promise<void>;
  /**
   * `refreshToken` was refused: the account's newer token, if a device kept one since, else
   * null (dropped here).
   */
  refused(refreshToken: string): Promise<string | null>;
  /** The 1-sat invoice paid here. */
  recordPaid(paid: PaidValidation): Promise<void>;
  /** Settles once what was asked of the relays is done. Never rejects. */
  settled(): Promise<void>;
};

const stateOf = ({
  refreshToken,
  sessionAt,
  paidValidations
}: MtpSessionState): MtpSessionState => ({
  refreshToken,
  sessionAt,
  paidValidations
});

/** The latest token of `a` and `b` by its date, `a`'s on a tie; the invoices of both. */
export function mergeSessions(a: MtpSessionState, b: MtpSessionState): MtpSessionState {
  const latest = b.sessionAt > a.sessionAt ? b : a;
  return {
    refreshToken: latest.refreshToken,
    sessionAt: latest.sessionAt,
    paidValidations: mergePaid(a.paidValidations, b.paidValidations)
  };
}

const sameState = (a: MtpSessionState, b: MtpSessionState) =>
  JSON.stringify(stateOf(a)) === JSON.stringify(stateOf(b));

/**
 * The session of `owner`'s account at its Mt Pelerin, shared through `shared` (null: this device's
 * only, as when the account's keys are not at hand).
 */
export function mtpSessionStore(
  owner: MtpSessionOwner,
  shared: SharedSessionAccess | null,
  now: () => number = Date.now
): MtpSessionStore {
  const { environment } = owner;
  const nowSeconds = () => Math.floor(now() / 1000);
  /** The last record read or written: what the flow goes on with when the device's storage fails. */
  let last: MtpDeviceRecord = emptyMtpSession(owner);

  /** One relay round at a time: each reads what the previous one wrote. */
  let queue: Promise<unknown> = Promise.resolve();
  const queued = <T>(run: () => Promise<T>): Promise<T> => {
    const next = queue.then(run, run);
    queue = next.catch(() => undefined);
    return next;
  };

  const local = async (): Promise<MtpDeviceRecord> => {
    try {
      last = await loadMtpSession(owner);
    } catch (error) {
      logFailure("Reading the Mt Pelerin session failed", error);
    }
    return last;
  };

  const change = async (
    update: (record: MtpDeviceRecord) => MtpDeviceRecord
  ): Promise<MtpDeviceRecord> => {
    try {
      last = await changeMtpSession(owner, update);
    } catch (error) {
      // Kept in memory meanwhile: lost once the app stops.
      logFailure("Saving the Mt Pelerin session failed", error);
      last = update(last);
    }
    return last;
  };

  const readShared = async (): Promise<SharedSessions | null> => {
    if (!shared) return null;
    try {
      return await fetchSharedSessions(shared.team, environment, shared.relays());
    } catch (error) {
      logFailure("Reading the account's Mt Pelerin session failed", error);
      return null;
    }
  };

  /**
   * Merges the relays' copies into this device's record; then, when it holds a change not shared
   * yet and a majority of the relays answered, publishes it. `latest`: this device's change was
   * just made, dated after every copy read.
   */
  const sync = (latest: boolean): Promise<MtpSessionState> =>
    queued(async () => {
      await local();
      const read = await readShared();
      if (!read) return stateOf(last);
      const record = await change((current) => {
        let mine = current;
        const seen = Math.max(-1, ...read.copies.map((copy) => copy.sessionAt));
        // A copy dated as late or later comes from a clock ahead of this device's.
        if (latest && mine.unshared && seen >= mine.sessionAt) {
          mine = { ...mine, sessionAt: seen + 1 };
        }
        return { ...mine, ...read.copies.reduce(mergeSessions, stateOf(mine)) };
      });
      if (!shared || !record.unshared || !read.conclusive || read.newer) return stateOf(record);
      try {
        const createdAt = Math.max(nowSeconds(), read.latestAt + 1, record.sessionAt);
        await publishSharedSession(
          shared.team,
          environment,
          stateOf(record),
          createdAt,
          shared.relays()
        );
      } catch (error) {
        logFailure("Sharing the Mt Pelerin session failed", error);
        return stateOf(record);
      }
      // Changed meanwhile: shared at its own turn.
      const done = await change((current) =>
        sameState(current, record) ? { ...current, unshared: false } : current
      );
      return stateOf(done);
    });

  return {
    load: () => sync(false),

    async keep(refreshToken) {
      await change((current) => ({
        ...current,
        refreshToken,
        sessionAt: Math.max(nowSeconds(), current.sessionAt + 1),
        unshared: true
      }));
      void sync(true).catch((error: unknown) =>
        logFailure("Sharing the Mt Pelerin session failed", error)
      );
    },

    refused: (refreshToken) =>
      queued(async () => {
        await local();
        const read = await readShared();
        const copies = read?.copies ?? [];
        const merged = copies.reduce(mergeSessions, stateOf(last));
        if (merged.refreshToken !== null && merged.refreshToken !== refreshToken) {
          await change((current) => ({ ...current, ...merged }));
          return merged.refreshToken;
        }
        // The token refused is the latest the account knows, or a device logged out since: dropped
        // here only. What was not shared yet waits for this device's next change.
        await change((current) => ({
          ...current,
          ...merged,
          refreshToken: null,
          unshared: false
        }));
        return null;
      }),

    async recordPaid(paid) {
      await change((current) => ({
        ...current,
        paidValidations: mergePaid(current.paidValidations, [paid]),
        unshared: true
      }));
      void sync(false).catch((error: unknown) =>
        logFailure("Sharing the Mt Pelerin session failed", error)
      );
    },

    settled: () => queued(async () => undefined)
  };
}
