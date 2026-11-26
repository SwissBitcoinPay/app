import type { AccountNotFoundError } from "./session";

/*
 * The last login whose passkey found no account (AccountNotFoundError), for "No account found"
 * (src/app/no-account.tsx): how many of the device's relays answered. In memory only, and nothing
 * of the passkey: its seed is not kept (usePasskeyAccount), the next login asks for it again.
 */

/** Whether the relays asked answered (without a backup): none of them, some, or all. */
export type AccountNotFound = { answered: "none" | "some" | "all" };

let last: AccountNotFound | null = null;

/** Notes the login that found no account. */
export function noteAccountNotFound(error: AccountNotFoundError): void {
  const answered = error.answered.length;
  last = {
    answered: answered === 0 ? "none" : answered < error.asked.length ? "some" : "all"
  };
}

/** The login that found no account, null when none is noted. */
export function getAccountNotFound(): AccountNotFound | null {
  return last;
}

/** Forgets it: a new login started, or its screen was left. */
export function clearAccountNotFound(): void {
  last = null;
}
