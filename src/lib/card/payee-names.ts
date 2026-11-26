import type { ApprovedPayee } from "./payees";

/*
 * Merchants' names as the card holder sees them: what a merchant declares
 * (`text/plain` of its metadata, payee-proof.ts) is its word only, shown as such; two merchants are
 * told apart by their address (or their node), never by their name. A merchant that is not
 * approved but bears an approved one's name (the holder's own name for a node included) is pointed
 * out. A node's name is the alias it announces (src/lib/lightning/node-alias.ts): its word too.
 */

/**
 * A name as two merchants' names are compared (case, spaces and accents aside): compatibility
 * forms folded, marks, spaces and invisible format characters dropped.
 */
export function payeeNameKey(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\p{M}\p{Cf}\p{Z}\s]/gu, "")
    .toLowerCase();
}

/**
 * Whether a merchant not approved (`id`) bears the name of an approved one: shown as the same name
 * as an approved merchant, but another account.
 */
export function isPayeeHomonym(
  approved: readonly ApprovedPayee[],
  payee: { id: string; name: string | null }
): boolean {
  const key = payeeNameKey(payee.name ?? "");
  if (key === "") return false;
  if (approved.some((entry) => entry.id === payee.id)) return false;
  return approved.some((entry) =>
    [entry.approvedName, entry.lastName, entry.localName].some(
      (name) => name !== null && payeeNameKey(name) === key
    )
  );
}
