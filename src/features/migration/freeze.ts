import { getAccountWalletId } from "@/features/account/session";
import { getTerminalProfile } from "@/features/terminal/profile-cache";
import { logFailure } from "@/lib/log/log";
import {
  NewerFreezeOwedError,
  freezeOwedText,
  parseFreezeOwed
} from "@/lib/legacy-v2/freeze-owed-format";
import { readFreezeOwedText, writeFreezeOwedText } from "@/lib/legacy-v2/freeze-owed-store";
import {
  LegacyServerError,
  migrateLegacyAccount,
  refreshLegacySession,
  type LegacyPayout,
  type LegacySession
} from "@/lib/legacy-v2/server";
import { ownerProfile } from "@/lib/terminal/model";

/*
 * The v2 account's freeze at the end of its migration: as soon as the sattle.me account exists, the
 * v2 server is told (`migrateLegacyAccount`) that the v2 account takes no more payment, and that
 * what it still owes in bitcoin goes over Lightning to the new account's Lightning address in that
 * very call (else at the v2 server's 0:00 UTC run), without any confirmation by e-mail. With the
 * session that read the v2 account, before the copy of its history takes it ("Your account is up to
 * date", done.tsx).
 *
 * The new account's Lightning address is the one its point of sale was prepared with (the device's
 * profile, activate.ts): the migration only ends once it was (useMigrationAccount).
 *
 * The device keeps the freeze owed from the account's creation (noteFreezeOwed) until the v2 server
 * answered it for good (frozen, migrated elsewhere, refused): when the end of the migration could
 * not (offline, the app closed), "Settings" offers it again, the v2 password asked then
 * (LegacyFreezeSetting.tsx).
 */

export type LegacyFreeze =
  /** Asked of the v2 server. */
  | { phase: "running" }
  /** The v2 account is frozen; its money paid out to `lightningAddress`, or to be at 0:00 UTC. */
  | { phase: "done"; lightningAddress: string; payout: LegacyPayout }
  /** The v2 account was migrated before, to another sattle.me account: its money goes there. */
  | { phase: "conflict" }
  /** Refused for good (an account the v2 service suspended, 403): its support settles it. */
  | { phase: "rejected" }
  /** Not done (offline, the server down, no session): may be tried again with `session`. */
  | { phase: "failed"; retry: boolean };

/** The outcome of one attempt, and the session to try again or to hand on (renewed or not). */
export type FreezeAttempt = { freeze: LegacyFreeze; session: LegacySession | null };

/**
 * Freezes the v2 account of `session` for the open account (see above). Renews the session once
 * when its short-lived token expired. Never rejects: a failure goes to the journal.
 */
export async function freezeLegacyAccount(session: LegacySession | null): Promise<FreezeAttempt> {
  if (!session) {
    logFailure("Freezing the v2 account: no v2 session", undefined, false);
    return { freeze: { phase: "failed", retry: false }, session: null };
  }
  const lightningAddress = await accountLightningAddress();
  if (!lightningAddress) {
    logFailure("Freezing the v2 account: no Lightning address of the account", undefined, false);
    return { freeze: { phase: "failed", retry: true }, session };
  }
  const outcome = await freezeWith(session, lightningAddress);
  // Answered for good: nothing more to offer in "Settings".
  if (outcome.freeze.phase !== "failed") {
    const walletId = getAccountWalletId();
    if (walletId) await forgetFreezeOwed(walletId);
  }
  return outcome;
}

async function freezeWith(
  session: LegacySession,
  lightningAddress: string
): Promise<FreezeAttempt> {
  let current = session;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { payout } = await migrateLegacyAccount(current, lightningAddress);
      return { freeze: { phase: "done", lightningAddress, payout }, session: current };
    } catch (error) {
      const code = error instanceof LegacyServerError ? error.code : null;
      if (code === "conflict") return { freeze: { phase: "conflict" }, session: current };
      if (code === "rejected") {
        logFailure("Freezing the v2 account was refused", error, false);
        return { freeze: { phase: "rejected" }, session: current };
      }
      // An expired token: renewed once, as TrailBase's client does.
      if (code === "refused" && attempt === 0 && current.refreshToken) {
        try {
          current = await refreshLegacySession(current.refreshToken);
          continue;
        } catch (renewal) {
          logFailure("Renewing the v2 session to freeze the v2 account failed", renewal, false);
          // Ended (refused): nothing left to close nor to try with. Else (offline) the session
          // still serves: kept for "Try again", then closed by whoever takes it.
          const ended = renewal instanceof LegacyServerError && renewal.code === "refused";
          return ended
            ? { freeze: { phase: "failed", retry: false }, session: null }
            : { freeze: { phase: "failed", retry: true }, session: current };
        }
      }
      logFailure("Freezing the v2 account failed", error, false);
      // Refused again: no retry with this session, but it is still handed on (and closed).
      return { freeze: { phase: "failed", retry: code !== "refused" }, session: current };
    }
  }
  return { freeze: { phase: "failed", retry: false }, session: null };
}

/** The open account's Lightning address, as this device's point of sale was prepared with it. */
async function accountLightningAddress(): Promise<string | null> {
  const walletId = getAccountWalletId();
  const profile = ownerProfile(await getTerminalProfile());
  if (!walletId || !profile || profile.walletId.toLowerCase() !== walletId.toLowerCase()) {
    return null;
  }
  return profile.lightningAddress;
}

/** The owed list's reads and writes, one at a time: two changes never lose one another. */
let owedQueue: Promise<unknown> = Promise.resolve();

function owedStep<T>(step: () => Promise<T>): Promise<T> {
  const next = owedQueue.then(step);
  owedQueue = next.catch(() => undefined);
  return next;
}

async function readOwed(): Promise<string[]> {
  return parseFreezeOwed(await readFreezeOwedText());
}

/** Keeps the v2 account of `walletId`'s migration to freeze. Never rejects (logged). */
export function noteFreezeOwed(walletId: string): Promise<void> {
  return owedStep(async () => {
    const id = walletId.toLowerCase();
    const owed = await readOwed();
    if (!owed.includes(id)) await writeFreezeOwedText(freezeOwedText([...owed, id]));
  }).catch((error: unknown) => {
    // A newer app's list is never written over.
    logFailure("Keeping the v2 account to freeze failed", error);
  });
}

/** Forgets the v2 account of `walletId`'s migration to freeze. Never rejects (logged). */
export function forgetFreezeOwed(walletId: string): Promise<void> {
  return owedStep(async () => {
    const id = walletId.toLowerCase();
    const owed = await readOwed();
    if (owed.includes(id)) {
      await writeFreezeOwedText(freezeOwedText(owed.filter((other) => other !== id)));
    }
  }).catch((error: unknown) => {
    if (!(error instanceof NewerFreezeOwedError)) {
      logFailure("Forgetting the v2 account to freeze failed", error);
    }
  });
}

/** Whether this device migrated `walletId` and its v2 account is not known frozen. */
export function isFreezeOwed(walletId: string): Promise<boolean> {
  return owedStep(readOwed).then(
    (owed) => owed.includes(walletId.toLowerCase()),
    (error: unknown) => {
      logFailure("Reading the v2 accounts to freeze failed", error);
      return false;
    }
  );
}
