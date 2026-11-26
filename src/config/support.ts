/**
 * Where "Contact support" writes.
 */
export const SUPPORT_EMAIL = "support@sattle.me";

/**
 * The public key the journal deposited for support is encrypted for (src/features/support/
 * deposit.ts): hex, x-only (BIP-340), as a Nostr key. Not a secret: in the code, so that every
 * build has the same and a change of it shows in review. Its private key is support's only
 * (scripts/support-journal.mjs, `keygen`), never in git.
 *
 * null means no key: the mail attaches the journal instead. Changing it needs a release, and the
 * former private key kept for as long as an app with the former one may deposit (30 days after its
 * last use: JOURNAL_LIFETIME_S).
 */
export const SUPPORT_JOURNAL_KEY: string | null =
  "ad869a4727506116daca38eb93cb16eb4cb4d3d7a9db01eefc480f9caabd9cbe";
