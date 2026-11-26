import type { BankDetails } from "@/features/bank/bank-details";
import { logFailure } from "@/lib/log/log";
import type { LegacyState } from "@/lib/legacy-v2/store";
import {
  LegacyServerError,
  fetchLegacyAccount,
  logInLegacy,
  logOutLegacy,
  refreshLegacySession,
  type LegacyAccount,
  type LegacySession
} from "@/lib/legacy-v2/server";

import { closeLegacySession, holdLegacySession } from "./legacy-session";
import { migrationPlan, type MigrationPlan } from "./plan";

/*
 * The migration of a v2 owner, from the account's card (src/app/migration/index.tsx) to its last
 * screen (src/app/migration/done.tsx), in memory: a restart of the app drops it, and the device
 * then opens as any device does (the v2 app's session is forgotten once the account exists:
 * onAccountCreated).
 *
 * 1. The v2 account, read on the v2 server with the v2 app's session as soon as its card shows
 *    (readLegacySessionOnce), else the e-mail and password of the v2 account (readWithPassword),
 *    its password reset when forgotten: never without it (the v2 account is frozen at the end,
 *    which only its owner's session can ask);
 * 2. the card of the account read, then "Migrate": the passkey, which creates the account with
 *    those settings (usePasskeyAccount's `created`);
 * 3. "Your account is up to date": the v2 account's freeze (freeze.ts), the v2 wallet's transfer
 *    (transfer.ts), what is left to do.
 */

type Migration = {
  legacy: LegacyState;
  /** The v2 account as its owner's session read it; null when it could not be. */
  account: LegacyAccount | null;
  /**
   * The id of the account's wallet once the account exists: the last screen follows the setup of
   * that account's point of sale, never another account's.
   */
  createdWalletId: string | null;
  /**
   * The e-mail typed for the password, given again to "Forgot your password" and after a new
   * password: never stored. Not a secret, but not logged either.
   */
  email: string;
  /**
   * "This is not my account": what the v2 app left on this device (its copy of the account, its
   * session) is another account's, never shown nor taken again in this migration.
   */
  notMine: boolean;
  /** The read with the v2 app's session (readLegacySessionOnce), once started; null before. */
  sessionRead: Promise<boolean> | null;
  /** Whether that read ended (it never rejects). */
  sessionDone: boolean;
  /**
   * Whether it ended without an answer of the v2 server on the session (offline, a timeout, an
   * answer out of shape), not refused: the session may still serve, the card offers to try again.
   */
  sessionUnreachable: boolean;
};

let current: Migration | null = null;

/**
 * The password's refusals of this run of the app, whatever screen asked: the v2 server (TrailBase)
 * locks the account at the third in a row, which serves until the end of the v2 service. And
 * whether it asked for a second factor, which this app cannot give. Never reset by a new attempt
 * of the migration: only a restart of the app forgets them.
 */
const password = { refusals: 0, secondFactor: false, changed: false };

/** Refusals after which the password is no longer asked (see `password`). */
export const MAX_PASSWORD_REFUSALS = 2;

/**
 * Starts the migration of the device's v2 app (`legacy`, an owner's). The password's screen starts
 * with the e-mail of the v2 app's copy of the account, when it has one.
 */
export function beginMigration(legacy: LegacyState): void {
  current = {
    legacy,
    account: null,
    createdWalletId: null,
    email: legacy.account?.email ?? "",
    notMine: false,
    sessionRead: null,
    sessionDone: false,
    sessionUnreachable: false
  };
}

/**
 * The migration of `legacy` (what the v2 app left, or a migration without it): the one under way
 * when it is of that very state (the card shown again: back from "Forgot your password", after a
 * new password), else a new one (beginMigration).
 */
export function resumeMigration(legacy: LegacyState): Readonly<Migration> {
  if (current?.legacy !== legacy) beginMigration(legacy);
  return current!;
}

/**
 * The v2 app's copy of the account, as the card shows it before the v2 server answers; null when
 * none, or when its owner said it is not theirs (`notMine`).
 */
export function legacyAccountCopy(): LegacyState["account"] {
  return current && !current.notMine ? current.legacy.account : null;
}

/** The migration under way, if any. */
export function getMigration(): Readonly<Migration> | null {
  return current;
}

/**
 * The account public keys of the v2 app's wallets as the v2 server lists them, for the migration
 * under way: typed words must be one of theirs (transfer.ts). Empty when unknown.
 */
export function legacyWalletKeys(): string[] {
  return (current?.account?.localWallets ?? []).flatMap(({ key }) => (key ? [key] : []));
}

/**
 * Whether the migration under way is of the v2 app that left its wallet's words on this device:
 * its own session, not one its owner said is another account's ("This is not my account"). Only
 * then may those words go to the account it opens (wallet-owner.ts).
 */
export function migrationHoldsDeviceWallet(): boolean {
  return current !== null && current.legacy.hasWallet && !current.notMine;
}

/** The v2 account read for the migration under way, if it was. */
export function readLegacyAccount(): LegacyAccount | null {
  return current?.account ?? null;
}

/** Keeps the e-mail typed for the v2 account (see `email`). */
export function rememberMigrationEmail(email: string): void {
  if (current) current.email = email.trim();
}

/** The e-mail typed for the v2 account in this migration, "" when none. */
export function migrationEmail(): string {
  return current?.email ?? "";
}

/**
 * "This is not my account": forgets the v2 account read, its e-mail with it, and closes its
 * session, so that another one is read (the password's screen). The migration goes on, its account
 * not created.
 */
export function forgetLegacyAccount(): void {
  if (current) {
    current.account = null;
    current.email = "";
    current.notMine = true;
  }
  closeLegacySession();
}

/** Forgets the migration (its last screen left, a login instead). */
export function endMigration(): void {
  current = null;
  // Held still: the history's copy never started with it (a login instead).
  closeLegacySession();
}

/** For the tests: a new run of the app. */
export function resetMigration(): void {
  current = null;
  closeLegacySession();
  password.refusals = 0;
  password.secondFactor = false;
  password.changed = false;
}

/** The new account's settings, from what the migration read. */
export function currentPlan(): MigrationPlan | null {
  return current ? migrationPlan(legacyAccountCopy(), current.account) : null;
}

/**
 * Whether the last screen shows next for the open account (`walletId`): the one the migration
 * created, never another opened since (a sign-up started afresh from the welcome screen).
 */
export function migrationCreated(walletId: string | null): boolean {
  return walletId !== null && current?.createdWalletId === walletId;
}

/**
 * The v2 bank account the bank step's form starts with (plan.ts `bankDraft`), for the account the
 * migration created (`walletId`) only; null otherwise, or once the app restarted (the migration is
 * this run's: the form is then empty, as at any sign-up).
 */
export function migrationBankDraft(walletId: string | null): BankDetails | null {
  return migrationCreated(walletId) ? (currentPlan()?.bankDraft ?? null) : null;
}

/** The account of `walletId` exists, created by the migration. */
export function markMigrationCreated(walletId: string): void {
  if (current) current.createdWalletId = walletId;
}

/**
 * A new password was set ("New password", password.tsx): one more try is given, for it. The
 * refusals before still count: TrailBase's lock counts the account's failures, not which password
 * failed (refused at the fourth try after three: MAX_PASSWORD_REFUSALS + 1 stays below). A second
 * factor still stops.
 */
export function passwordChanged(): void {
  password.changed = true;
}

/** Whether the try of a new password was given already in this run of the app (passwordChanged). */
export function passwordChangeGiven(): boolean {
  return password.changed;
}

/** Why the password is no longer asked in this run of the app, if it is not. */
export function passwordStopped(): "refused" | "secondFactor" | null {
  if (password.secondFactor) return "secondFactor";
  return password.refusals >= MAX_PASSWORD_REFUSALS + (password.changed ? 1 : 0) ? "refused" : null;
}

/**
 * Reads the account with `session`, then holds it for the copy of the account's history
 * (legacy-session.ts), which closes it; closed at once when the read failed.
 */
async function readAndHold(session: LegacySession): Promise<LegacyAccount> {
  try {
    const account = await fetchLegacyAccount(session);
    holdLegacySession(session);
    return account;
  } catch (error) {
    void logOutLegacy(session);
    throw error;
  }
}

/**
 * The v2 account read with the v2 app's own session, renewed first when it can be (its short-lived
 * token expires within the hour). False when that session no longer serves (ended, refused, the
 * server unreachable, an answer out of shape), or is another account's (`notMine`): the e-mail and
 * password are asked then.
 */
export async function readWithLegacySession(): Promise<boolean> {
  const migration = current;
  const tokens = migration && !migration.notMine ? migration.legacy.tokens : null;
  if (!migration || !tokens) return false;
  try {
    const session = tokens.refreshToken
      ? await refreshLegacySession(tokens.refreshToken)
      : { authToken: tokens.authToken, refreshToken: null };
    const account = await readAndHold(session);
    if (current === migration) migration.account = account;
    return current === migration;
  } catch (error) {
    // A session that ended is no failure: the password is asked.
    if (!(error instanceof LegacyServerError && error.code === "refused")) {
      logFailure("Reading the v2 account with its session failed", error, false);
      if (current === migration) migration.sessionUnreachable = true;
    }
    return false;
  }
}

/**
 * readWithLegacySession, once per migration: the card starts it as it shows (a second render, the
 * card shown again, gets the same read), never with a session of its own to renew twice.
 */
export function readLegacySessionOnce(): Promise<boolean> {
  const migration = current;
  if (!migration) return Promise.resolve(false);
  migration.sessionRead ??= readWithLegacySession().finally(() => {
    migration.sessionDone = true;
  });
  return migration.sessionRead;
}

/**
 * Whether the v2 app's session may still read the v2 account in this migration: one was left
 * (on the device, or by a v2 web app's hand-off), it is the owner's, and its read did not end yet.
 */
export function legacySessionPending(): boolean {
  if (!current || current.notMine || !current.legacy.tokens || current.account) return false;
  return !current.sessionDone;
}

/**
 * Whether the read with the v2 app's session ended without the v2 server's answer (offline, a
 * timeout): the session may still serve, never taken for a refused one.
 */
export function legacySessionUnreachable(): boolean {
  if (!current || current.notMine || current.account) return false;
  return current.sessionDone && current.sessionUnreachable;
}

/**
 * The read with the v2 app's session again, after it ended unreachable (legacySessionUnreachable):
 * the next readLegacySessionOnce asks the v2 server anew. Nothing for a refused session.
 */
export function retryLegacySession(): void {
  if (!legacySessionUnreachable() || !current) return;
  current.sessionRead = null;
  current.sessionDone = false;
  current.sessionUnreachable = false;
}

/** Why the e-mail and password did not read the v2 account. */
export type PasswordFailure = "refused" | "secondFactor" | "unreachable";

/**
 * A session of the v2 account opened with the e-mail and password of its owner, the refusals
 * counted for the whole run of the app (`password`): the migration's (readWithPassword) and the
 * copy of the history's from "Settings" (src/app/(app)/settings/legacy-history.tsx). Never keeps
 * nor logs either: the error's text names the route only.
 */
export async function openLegacySession(
  email: string,
  secret: string
): Promise<{ ok: true; session: LegacySession } | { ok: false; failure: PasswordFailure }> {
  if (passwordStopped()) return { ok: false, failure: "unreachable" };
  try {
    return { ok: true, session: await logInLegacy(email.trim(), secret) };
  } catch (error) {
    if (error instanceof LegacyServerError && error.code === "refused") {
      password.refusals += 1;
      return { ok: false, failure: "refused" };
    }
    if (error instanceof LegacyServerError && error.code === "secondFactor") {
      password.secondFactor = true;
      return { ok: false, failure: "secondFactor" };
    }
    logFailure("Logging in to the v2 account failed", error, false);
    return { ok: false, failure: "unreachable" };
  }
}

/**
 * The v2 account read with the e-mail and password of its owner, the session held for the copy of
 * the history (readAndHold). Never
 * keeps nor logs either: the error's text names the route only.
 */
export async function readWithPassword(
  email: string,
  secret: string
): Promise<{ ok: true } | { ok: false; failure: PasswordFailure }> {
  const migration = current;
  if (!migration) return { ok: false, failure: "unreachable" };
  const opened = await openLegacySession(email, secret);
  if (!opened.ok) return opened;
  try {
    const account = await readAndHold(opened.session);
    if (current !== migration) return { ok: false, failure: "unreachable" };
    migration.account = account;
    return { ok: true };
  } catch (error) {
    logFailure("Reading the v2 account with its password failed", error, false);
    return { ok: false, failure: "unreachable" };
  }
}
