import { useSyncExternalStore } from "react";

import { ownerEpochSettled } from "@/features/team/export-epochs";
import { epochSealFor } from "@/lib/nostr/epochs";
import { majority } from "@/config/registry";
import {
  getAccountSettings,
  getAccountTeamKeys,
  getAccountWalletId,
  subscribeAccount,
  whenAccountSynced
} from "@/features/account/session";
import { inBatches } from "@/lib/batches";
import { logFailure } from "@/lib/log/log";
import type { NostrEvent } from "@/lib/nostr/event";
import { COPIES_AT_ONCE, publishAgain, publishToRelays, type RelayCall } from "@/lib/nostr/pool";
import { EPOCH_PART_BYTES, signedAt } from "@/lib/nostr/record";
import { nowUnix } from "@/lib/rates/snapshot";
import { monthEnd, monthOf, monthStart } from "@/lib/registry/archive";
import { sameRelayList } from "@/lib/relays/list";
import {
  fetchLegacyHistoryPage,
  fetchLegacyRates,
  rateAt,
  RATE_TOLERANCE_SECONDS,
  type LegacyHistoryPage,
  type LegacyHistoryRow
} from "@/lib/legacy-v2/history";
import {
  MAX_PART_BYTES,
  fetchHistoryAnswers,
  historyMonth,
  historyMonths,
  historyOf,
  historyPartAddress,
  historyPartEvent,
  historyParts,
  historyStateAddress,
  historyStateEvent,
  type HistoryPart,
  type HistoryPartEntry,
  type HistoryState
} from "@/lib/legacy-v2/history-records";
import {
  NewerHistoryOwedError,
  historyOwedText,
  parseHistoryOwed
} from "@/lib/legacy-v2/history-owed-format";
import { readHistoryOwedText, writeHistoryOwedText } from "@/lib/legacy-v2/history-owed-store";
import {
  LegacyServerError,
  fetchLegacyAccount,
  logOutLegacy,
  refreshLegacySession,
  type LegacySession
} from "@/lib/legacy-v2/server";
import { deriveLegacyHistoryKeys, type TeamKeys } from "@/lib/team/keys";
import { TEAM_TIMEOUT_MS } from "@/lib/team/shared";

import { takeLegacySession } from "./legacy-session";

/*
 * The copy of the v2 account's history to the account's relays (the sales of the v2 accounting
 * export, the bitcoin payouts and the referral fees; for information only, never in the wallet's
 * balance), in the background:
 *
 * - right after the migration, with the v2 session the migration read the account with
 *   (legacy-session.ts), from "Your account is up to date";
 * - else from "Settings" until the end of the v2 service, its owner's v2 password asked once
 *   (src/app/(app)/settings/legacy-history.tsx), when it was interrupted or the migration went on
 *   without the password.
 *
 * A copy reads the v2 account's name (its point of sale's titles are no notes: history.ts, noteOf)
 * and every page of the history (history.ts), gives the rows asked in bitcoin (a payout, a
 * fee, a sale asked in sats) their amount in the point of sale's currency at the v2 server's own
 * price of the moment (`/v1/rates/history`, to the minor unit), then writes each month whose copy
 * the relays do not hold as it is (history-records.ts): a copy again is the same copy, or one that
 * holds every row the earlier held and more. The state record (`done`) closes it. The v2 session
 * is closed at the end, whatever happened.
 *
 * Its rows show in "Wallet" and its exports (readLegacyHistory, useOwnerActivity), once a month is
 * wholly read: never half a month. What this device knows of them is forgotten as soon as the
 * account closes, as the owner's other copies.
 */

/** Where a copy of the history stands, for the screens that follow it. */
export type HistoryImportStatus =
  | { phase: "idle" }
  /**
   * Reading the v2 server, whose pages tell no total: `rows`, the rows read so far. Then writing
   * them to the relays (`total`: every row read), month by month: `copied`, the rows of the months
   * a majority of the relays took (a month it did not take is not counted: the copy fails at its
   * end).
   */
  | { phase: "running"; step: "reading"; rows: number }
  | { phase: "running"; step: "writing"; copied: number; total: number }
  /** Every month written, the state with them. */
  | { phase: "done"; rows: number }
  /** Stopped: the v2 server, the relays or the account (closed meanwhile). */
  | { phase: "failed" };

let status: HistoryImportStatus = { phase: "idle" };
/** The account whose copy `status` tells; null while idle. */
let statusTeam: TeamKeys | null = null;
const listeners = new Set<() => void>();

function setStatus(next: HistoryImportStatus): void {
  status = next;
  for (const listener of listeners) listener();
}

/** The copy's status (useSyncExternalStore). */
export function getHistoryImportStatus(): HistoryImportStatus {
  return status;
}

export function subscribeHistoryImport(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The copy's status, as a screen follows it. */
export function useHistoryImport(): HistoryImportStatus {
  return useSyncExternalStore(subscribeHistoryImport, getHistoryImportStatus, () => status);
}

/** Pages read at most: a million rows, far beyond a business's; a cursor that loops stops there. */
const MAX_PAGES = 1_000;

/** A call to `relays` as the history's author (a relay takes an author's events from it only). */
function historyCall(team: TeamKeys, relays: readonly string[]): RelayCall {
  return {
    relays,
    timeoutMs: TEAM_TIMEOUT_MS.background,
    channel: "account",
    authKey: () => deriveLegacyHistoryKeys(team).nostr.secretKey
  };
}

/**
 * Every row of the history in scope, page by page, the session renewed once when it expired: the
 * renewed one goes in `held`, which the copy closes at its end (the first one's token expired).
 * The v2 account's name is read first: its point of sale wrote it as every sale's title, which is
 * no note (history.ts, noteOf). `onRows`: how many rows are read, after each page.
 */
async function readAllRows(
  held: { session: LegacySession },
  onRows: (rows: number) => void
): Promise<LegacyHistoryRow[]> {
  let renewed = false;
  // `call` with the session held; the short-lived token expired (an hour): renewed once, asked again.
  const asOwner = async <T>(call: (session: LegacySession) => Promise<T>): Promise<T> => {
    for (;;) {
      try {
        return await call(held.session);
      } catch (error) {
        const { refreshToken } = held.session;
        if (
          renewed ||
          !refreshToken ||
          !(error instanceof LegacyServerError) ||
          error.code !== "refused"
        ) {
          throw error;
        }
        held.session = await refreshLegacySession(refreshToken);
        renewed = true;
      }
    }
  };
  const { name } = await asOwner((session) => fetchLegacyAccount(session));
  const rows = new Map<string, LegacyHistoryRow>();
  let cursor: string | null = null;
  let invalid = 0;
  const seen = new Set<string>();
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const from: string | null = cursor;
    const read: LegacyHistoryPage = await asOwner((session) =>
      fetchLegacyHistoryPage(session, from, name)
    );
    for (const row of read.rows) rows.set(row.ref, row);
    invalid += read.invalid;
    onRows(rows.size);
    if (read.cursor === null) {
      // Left out, never guessed: support sees that some were (the code's text, never their values).
      if (invalid > 0) logFailure("The v2 history had rows out of shape, left out");
      return [...rows.values()];
    }
    // A cursor seen already would read the same pages again, forever.
    if (seen.has(read.cursor)) throw new Error("The v2 history's cursor loops");
    seen.add(read.cursor);
    cursor = read.cursor;
  }
  throw new Error("The v2 history has more pages than a business");
}

/** Appends `row` to `month`'s rows in `byMonth` (never a copy of them per row). */
function addTo(byMonth: Map<string, LegacyHistoryRow[]>, month: string, row: LegacyHistoryRow) {
  const ofMonth = byMonth.get(month);
  if (ofMonth) ofMonth.push(row);
  else byMonth.set(month, [row]);
}

/**
 * Gives every row the price of bitcoin in `currency` the v2 server recorded nearest its date
 * (within RATE_TOLERANCE_SECONDS): what its sats were worth then, which "Wallet" and its exports
 * tell for a row asked in bitcoin, a payout or a fee (to the minor unit, rounded half up). One read
 * of the prices per month. A row without a price near enough keeps none: its sats alone show.
 */
async function withRates(rows: LegacyHistoryRow[], currency: string): Promise<LegacyHistoryRow[]> {
  const byMonth = new Map<string, LegacyHistoryRow[]>();
  for (const row of rows) addTo(byMonth, monthOf(row.at), row);
  const priced = new Map<string, LegacyHistoryRow>();
  for (const [month, ofMonth] of byMonth) {
    const points = await fetchLegacyRates(
      currency,
      monthStart(month) - RATE_TOLERANCE_SECONDS,
      monthEnd(month) - 1 + RATE_TOLERANCE_SECONDS
    );
    for (const row of ofMonth) {
      const price = rateAt(points, row.at);
      if (price !== null) priced.set(row.ref, { ...row, rate: { price, currency } });
    }
  }
  return rows.map((row) => priced.get(row.ref) ?? row);
}

/** What this device knows of the account's copied history, while the account stays open. */
type Known = {
  team: TeamKeys;
  /** Every part read or written, its newest copy, by address. */
  parts: Map<string, HistoryPartEntry>;
  newer: Set<string>;
  state: { state: HistoryState; event: NostrEvent } | null;
  stateNewer: boolean;
  /**
   * The ids of the records a majority of the relays holds (a read's answers, or a write a majority
   * took): a record one relay took, or read on a minority only, is written again, never taken as
   * the copy the relays hold.
   */
  confirmed: Set<string>;
  /** By address, the date of the newest record this device signed there (signedAt). */
  signed: Map<string, number>;
  /** The read running: asked meanwhile, it is that one. */
  reading: Promise<boolean> | null;
};

let known: Known | null = null;

subscribeAccount(() => {
  if (known && getAccountTeamKeys() !== known.team) known = null;
  // An account this device migrated, whose relays may not say yet that its history is to copy.
  const walletId = getAccountWalletId();
  if (walletId !== null) void markIfOwed(walletId);
  // Another account (or none): a copy's status was the account's, never this one's.
  if (statusTeam !== null && getAccountTeamKeys() !== statusTeam) {
    statusTeam = null;
    setStatus({ phase: "idle" });
  }
});

function knownOf(team: TeamKeys): Known {
  if (known?.team !== team) {
    known = {
      team,
      parts: new Map(),
      newer: new Set(),
      state: null,
      stateNewer: false,
      confirmed: new Set(),
      signed: new Map(),
      reading: null
    };
  }
  return known;
}

function learn(state: Known, address: string, entry: HistoryPartEntry): void {
  const before = state.parts.get(address);
  if (!before || entry.event.created_at > before.event.created_at) state.parts.set(address, entry);
}

/** Reads the copies on `relays`, learnt; true once a majority answered to the end. */
function readNow(team: TeamKeys, relays: readonly string[]): Promise<boolean> {
  const state = knownOf(team);
  if (state.reading) return state.reading;
  const reading = (async () => {
    const keys = deriveLegacyHistoryKeys(team);
    const raw = await fetchHistoryAnswers(keys, historyCall(team, relays));
    const answers = historyOf(keys, raw);
    const quorum = majority(relays.length);
    for (const [address, event] of answers.events) {
      let holding = 0;
      for (const ofRelay of answers.held.values()) {
        if ((ofRelay.get(address) ?? -1) >= event.created_at) holding += 1;
      }
      if (holding >= quorum) state.confirmed.add(event.id);
    }
    for (const [address, entry] of answers.parts) learn(state, address, entry);
    for (const address of answers.newer) state.newer.add(address);
    if (answers.newer.has(historyStateAddress(keys))) state.stateNewer = true;
    if (
      answers.state &&
      (!state.state || answers.state.event.created_at > state.state.event.created_at)
    ) {
      state.state = answers.state;
    }
    return raw.size >= majority(relays.length);
  })().finally(() => {
    state.reading = null;
  });
  state.reading = reading;
  return reading;
}

/**
 * Writes `month`'s copy holding `rows` and every row its known copy holds: true once a majority
 * took each part (or the relays hold that copy already).
 */
async function publishMonth(
  team: TeamKeys,
  relays: readonly string[],
  month: string,
  rows: readonly LegacyHistoryRow[],
  now: number
): Promise<boolean> {
  // The account's export epoch first (export-epochs.ts): what a withdrawn grant read never opens it.
  await ownerEpochSettled();
  const keys = deriveLegacyHistoryKeys(team);
  const state = knownOf(team);
  const before = historyMonth(keys, month, state.parts, state.newer);
  // A newer app's copy of the month: never written over.
  if (before.newer) return true;
  const merged = new Map(before.rows.map((row) => [row.ref, row]));
  for (const row of rows) merged.set(row.ref, row);
  // Cut smaller when sealed at an export epoch (record.ts): sealed twice, it stays under 64 kB.
  const parts = historyParts(
    month,
    merged.values(),
    epochSealFor(keys.encryptionKey) ? EPOCH_PART_BYTES : MAX_PART_BYTES
  );
  // A majority of the relays holds that very copy already (the same rows make the same parts):
  // one only a minority took (an earlier write that failed) is written again.
  const held = (part: HistoryPart) => {
    const id = state.parts.get(historyPartAddress(keys, month, part.part))?.event.id;
    return id !== undefined && state.confirmed.has(id);
  };
  if (before.copied && before.set === parts[0]?.set && parts.every(held)) return true;
  const call = historyCall(team, relays);
  const took = await inBatches(parts, COPIES_AT_ONCE, async (part) => {
    const address = historyPartAddress(keys, part.month, part.part);
    const after = state.parts.get(address)?.event.created_at ?? -1;
    const event = historyPartEvent(
      keys,
      part,
      signedAt(state.signed, address, Math.max(now, after + 1))
    );
    const accepted = await publishToRelays(event, call, { quorum: "majority" });
    if (accepted.length > 0) learn(state, address, { part, event });
    const enough = accepted.length >= majority(relays.length);
    if (enough) state.confirmed.add(event.id);
    return enough;
  });
  return took !== null && took.every(Boolean);
}

/**
 * Writes the state `next`: true once a majority took it. `ifNone`: only when the relays hold none
 * (a copy started, never written over one finished); true then without writing. A newer app's
 * state is never written over.
 */
async function publishState(
  team: TeamKeys,
  relays: readonly string[],
  next: HistoryState,
  now: number,
  { ifNone = false }: { ifNone?: boolean } = {}
): Promise<boolean> {
  await ownerEpochSettled();
  const keys = deriveLegacyHistoryKeys(team);
  const state = knownOf(team);
  if (state.stateNewer) return true;
  const call = historyCall(team, relays);
  const quorum = majority(relays.length);
  const known = state.state;
  if (ifNone && known !== null) {
    // The state the relays hold, as it is (never `next` over a copy finished): written again when
    // a minority only holds it (an earlier write that failed).
    if (state.confirmed.has(known.event.id)) return true;
    const enough = (await publishAgain(known.event, call, { quorum: "majority" })).length >= quorum;
    if (enough) state.confirmed.add(known.event.id);
    return enough;
  }
  const after = known?.event.created_at ?? -1;
  const event = historyStateEvent(
    keys,
    next,
    signedAt(state.signed, historyStateAddress(keys), Math.max(now, after + 1))
  );
  const took = await publishToRelays(event, call, { quorum: "majority" });
  if (took.length > 0) state.state = { state: next, event };
  const enough = took.length >= quorum;
  if (enough) state.confirmed.add(event.id);
  return enough;
}

/** The copy running, if one is: asked meanwhile, it is that one. */
let running: Promise<HistoryImportStatus> | null = null;

/**
 * Says, on the account's relays, that its v2 history is to be copied ("Your account is up to
 * date"): "Settings" offers to copy it then, on any of the owner's devices, until it is. Never over
 * a state the relays hold. Never rejects.
 */
export async function markLegacyHistoryPending(): Promise<void> {
  // A copy running says so itself, first.
  if (running) return;
  const team = getAccountTeamKeys();
  const walletId = getAccountWalletId();
  const relays = getAccountSettings()?.relays;
  if (!team || !walletId || !relays) return;
  try {
    if (!(await readNow(team, relays))) {
      logFailure("Marking the v2 history to copy failed: no majority of the relays answered");
      return;
    }
    if (!(await publishState(team, relays, { done: null }, nowUnix(), { ifNone: true }))) {
      logFailure("Marking the v2 history to copy failed: no majority of the relays took it");
      return;
    }
    // The relays say it now (or held a state already): this device owes them nothing more.
    await forgetOwed(walletId);
  } catch (error) {
    logFailure("Marking the v2 history to copy failed", error);
  }
}

/** The owed list's reads and writes, one at a time: two changes never lose one another. */
let owedQueue: Promise<unknown> = Promise.resolve();

function owedStep<T>(step: () => Promise<T>): Promise<T> {
  const next = owedQueue.then(step);
  owedQueue = next.catch(() => undefined);
  return next;
}

/** The wallet ids of history-owed-format.ts; NewerHistoryOwedError for a newer app's list. */
async function readOwed(): Promise<string[]> {
  return parseHistoryOwed(await readHistoryOwedText());
}

/** Keeps `walletId` among the accounts owed the mark. Never rejects (logged). */
function noteOwed(walletId: string): Promise<void> {
  return owedStep(async () => {
    const id = walletId.toLowerCase();
    const owed = await readOwed();
    if (!owed.includes(id)) await writeHistoryOwedText(historyOwedText([...owed, id]));
  }).catch((error: unknown) => {
    // A newer app's list is never written over: the relays' mark alone then.
    logFailure("Keeping the v2 history to mark failed", error);
  });
}

/** Forgets `walletId` among the accounts owed the mark. Never rejects (logged). */
function forgetOwed(walletId: string): Promise<void> {
  return owedStep(async () => {
    const id = walletId.toLowerCase();
    const owed = await readOwed();
    if (owed.includes(id)) {
      await writeHistoryOwedText(historyOwedText(owed.filter((other) => other !== id)));
    }
  }).catch((error: unknown) => {
    if (!(error instanceof NewerHistoryOwedError)) {
      logFailure("Forgetting the v2 history to mark failed", error);
    }
  });
}

/** Whether this device migrated `walletId` and its relays may not say yet its history is to copy. */
function isOwed(walletId: string): Promise<boolean> {
  return owedStep(readOwed).then(
    (owed) => owed.includes(walletId.toLowerCase()),
    (error: unknown) => {
      logFailure("Reading the v2 history to mark failed", error);
      return false;
    }
  );
}

/** The mark written for `walletId`, once its account is in step with its relays, if owed. */
async function markIfOwed(walletId: string): Promise<void> {
  if (!(await isOwed(walletId))) return;
  await whenAccountSynced();
  if (getAccountWalletId() === walletId) await markLegacyHistoryPending();
}

/**
 * Keeps on this device that the history of `walletId`'s migration is owed (history-owed-format.ts),
 * as soon as the account exists: an app closed before "Your account is up to date" still has
 * "Settings" offer the copy. Never rejects.
 */
export function noteLegacyHistoryOwed(walletId: string): Promise<void> {
  return noteOwed(walletId);
}

/**
 * The copy of the history at the migration's end ("Your account is up to date"): this device keeps
 * that it is owed until the relays say so (history-owed-format.ts), then the copy starts with
 * `session` (the one that read the v2 account), else the relays only say it is to copy: "Settings"
 * offers it, the v2 password asked then. Never rejects.
 */
export async function startMigratedHistory(session: LegacySession | null): Promise<void> {
  const walletId = getAccountWalletId();
  if (walletId === null) {
    if (session) void logOutLegacy(session);
    return;
  }
  await noteOwed(walletId);
  if (session) await startLegacyHistoryImport(session);
  else await markLegacyHistoryPending();
}

/**
 * Copies the v2 account's history with `session` (else the one the migration holds), in the
 * background: one copy at a time (asked meanwhile, the running one). Closes the session at the
 * end. Never rejects: a failure goes to the journal and says `failed`.
 */
export function startLegacyHistoryImport(
  session: LegacySession | null = takeLegacySession()
): Promise<HistoryImportStatus> {
  if (running) {
    if (session) void logOutLegacy(session);
    return running;
  }
  if (!session) return Promise.resolve(status);
  running = importNow(session).finally(() => {
    running = null;
  });
  return running;
}

async function importNow(session: LegacySession): Promise<HistoryImportStatus> {
  const held = { session };
  const team = getAccountTeamKeys();
  const walletId = getAccountWalletId();
  const settings = getAccountSettings();
  // The status of this account's copy only: another account opened since sees none.
  const report = (next: HistoryImportStatus): HistoryImportStatus => {
    if (team !== null && getAccountTeamKeys() === team) {
      statusTeam = team;
      setStatus(next);
    }
    return next;
  };
  report({ phase: "running", step: "reading", rows: 0 });
  try {
    if (!team || !settings) throw new Error("No account open");
    const relays = settings.relays;
    // What the relays hold: a month held as it is is not written again. The copy is said started
    // first, so that "Settings" offers to finish it whatever happens next.
    if (!(await readNow(team, relays))) throw new Error("No majority of the relays answered");
    if (!(await publishState(team, relays, { done: null }, nowUnix(), { ifNone: true }))) {
      throw new Error("No majority of the relays took the history's state");
    }
    if (walletId !== null) await forgetOwed(walletId);
    const read = await readAllRows(held, (rows) =>
      report({ phase: "running", step: "reading", rows })
    );
    const rows = await withRates(read, settings.displayCurrency);
    const byMonth = new Map<string, LegacyHistoryRow[]>();
    for (const row of rows) addTo(byMonth, monthOf(row.at), row);
    const now = nowUnix();
    let written = true;
    let copied = 0;
    report({ phase: "running", step: "writing", copied, total: rows.length });
    for (const [month, ofMonth] of [...byMonth].sort(([a], [b]) => (a < b ? -1 : 1))) {
      if (getAccountTeamKeys() !== team) throw new Error("The account closed");
      // The account moved to other relays meanwhile: what is written goes to its relays only.
      if (!sameRelayList(getAccountSettings()?.relays ?? [], relays)) {
        throw new Error("The account's relays changed");
      }
      if (await publishMonth(team, relays, month, ofMonth, now)) {
        copied += ofMonth.length;
        report({ phase: "running", step: "writing", copied, total: rows.length });
      } else {
        written = false;
      }
    }
    if (!written || !(await publishState(team, relays, { done: now }, now))) {
      logFailure("Copying the v2 history to the relays failed");
      return report({ phase: "failed" });
    }
    notifyHistoryChanged();
    return report({ phase: "done", rows: rows.length });
  } catch (error) {
    logFailure("Copying the v2 history failed", error);
    return report({ phase: "failed" });
  } finally {
    // The renewed session when the first one's token expired: closed with a token it takes.
    void logOutLegacy(held.session);
  }
}

/** For the tests: a new run of the app. */
export function resetHistoryImport(): void {
  status = { phase: "idle" };
  statusTeam = null;
  running = null;
  known = null;
}

const changeListeners = new Set<() => void>();

function notifyHistoryChanged(): void {
  for (const listener of changeListeners) listener();
}

/** Calls `listener` once a copy wrote the history: a screen showing it reads it again. */
export function subscribeHistoryChanges(listener: () => void): () => void {
  changeListeners.add(listener);
  return () => {
    changeListeners.delete(listener);
  };
}

/** A part unchanged for this long is signed again, dated then: strfry refuses events over 3 years old. */
export const HISTORY_REFRESH_SECONDS = 365 * 24 * 60 * 60;

/** What the account's relays hold of its copied history. */
export type LegacyHistory = {
  /** Every row of the months wholly read, any order. */
  rows: LegacyHistoryRow[];
  /** The whole history was copied (its state says so). */
  done: boolean;
  /**
   * A copy was started and is not finished, or this device migrated the account and its relays do
   * not say so yet: "Settings" offers to make it.
   */
  pending: boolean;
};

/**
 * The account's copied history on its relays, read again at each call (one read at a time): the
 * rows of every month wholly read (never half a month), and where the copy stands. Signs again the
 * parts due (HISTORY_REFRESH_SECONDS), unless `refresh` is false ("Export" waits for nothing more
 * than its read). Null when no majority of the relays answered, or no account is open. Never
 * rejects.
 */
export async function readLegacyHistory(
  now: number = nowUnix(),
  { refresh = true }: { refresh?: boolean } = {}
): Promise<LegacyHistory | null> {
  const team = getAccountTeamKeys();
  const relays = getAccountSettings()?.relays;
  if (!team || !relays) return null;
  try {
    if (!(await readNow(team, relays))) return null;
    if (refresh) await refreshHistory(team, relays, now);
    const state = knownOf(team);
    const keys = deriveLegacyHistoryKeys(team);
    const rows = historyMonths(state.parts).flatMap(
      (month) => historyMonth(keys, month, state.parts, state.newer).rows
    );
    const done = state.state !== null && state.state.state.done !== null;
    // No state on the relays, for an account this device migrated: its mark is still owed (written
    // again here), the copy to make all the same.
    const walletId = getAccountWalletId();
    const owed = state.state === null && walletId !== null && (await isOwed(walletId));
    if (owed && !running) void markLegacyHistoryPending();
    return { rows, done, pending: (state.state !== null && !done) || owed };
  } catch (error) {
    logFailure("Reading the v2 history failed", error);
    return null;
  }
}

/** Signs again every part, and the state, unchanged for HISTORY_REFRESH_SECONDS. Never rejects. */
async function refreshHistory(team: TeamKeys, relays: readonly string[], now: number) {
  try {
    await ownerEpochSettled();
    const keys = deriveLegacyHistoryKeys(team);
    const state = knownOf(team);
    const due = [...state.parts].filter(
      ([address, { event }]) =>
        now - event.created_at > HISTORY_REFRESH_SECONDS && !state.newer.has(address)
    );
    const call = historyCall(team, relays);
    const quorum = majority(relays.length);
    await inBatches(due, COPIES_AT_ONCE, async ([address, { part, event }]) => {
      const again = historyPartEvent(
        keys,
        part,
        signedAt(state.signed, address, Math.max(now, event.created_at + 1))
      );
      const took = await publishToRelays(again, call, { quorum: "majority" });
      if (took.length > 0) learn(state, address, { part, event: again });
      // Taken by a majority: a copy later in this run need not write it again.
      if (took.length >= quorum) state.confirmed.add(again.id);
      return true;
    });
    const done = state.state;
    if (done && !state.stateNewer && now - done.event.created_at > HISTORY_REFRESH_SECONDS) {
      const again = historyStateEvent(
        keys,
        done.state,
        signedAt(state.signed, historyStateAddress(keys), Math.max(now, done.event.created_at + 1))
      );
      const took = await publishToRelays(again, call, { quorum: "majority" });
      if (took.length > 0) state.state = { state: done.state, event: again };
      if (took.length >= quorum) state.confirmed.add(again.id);
    }
  } catch (error) {
    logFailure("Refreshing the v2 history failed", error);
  }
}

/**
 * Copies every record of the history the relays `before` hold (each address's newest, as it is) to
 * the relays `next`, for a change of the account's relays. True once a majority of `next` holds
 * each one; also when there is none. Never rejects.
 */
export async function copyLegacyHistory(
  team: TeamKeys,
  before: readonly string[],
  next: readonly string[]
): Promise<boolean> {
  try {
    const keys = deriveLegacyHistoryKeys(team);
    const raw = await fetchHistoryAnswers(keys, historyCall(team, before));
    if (raw.size < majority(before.length)) return false;
    const answers = historyOf(keys, raw);
    const events = [...answers.events.values()];
    const held = await inBatches(events, COPIES_AT_ONCE, async (event) => {
      const address = event.tags.find(([name]) => name === "d")?.[1] ?? "";
      const holding = next.filter(
        (relay) => (answers.held.get(relay)?.get(address) ?? -1) >= event.created_at
      );
      const missing = next.filter((relay) => !holding.includes(relay));
      const took =
        missing.length > 0
          ? await publishAgain(event, historyCall(team, missing), {
              quorum: { count: majority(next.length) - holding.length }
            })
          : [];
      return holding.length + took.length >= majority(next.length);
    });
    return held !== null && held.every(Boolean);
  } catch (error) {
    logFailure("Copying the v2 history to the new relays failed", error);
    return false;
  }
}
