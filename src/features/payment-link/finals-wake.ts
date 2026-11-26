/*
 * "Wallet" shows a link whose sale received a payment, but which has no final version yet,
 * "Confirming" (linkItem, src/features/activity/model.ts: "Paid" only once its final
 * version proves it). The owner's
 * device publishes that final version (OwnerLinksFinalizer.tsx) for every link of the business
 * (an assistant's, an employee's, one of the owner's devices'), in rounds: at the account's opening,
 * then every 6 hours. An invoice paid while the account stays open (an
 * assistant's invoice paid over Lightning, still "Confirming" long after) would wait for the
 * next one. So the list asks for a round as soon as it shows such a link (askOwnerFinals), each link
 * at most once per OWNER_FINALS_ASK_GAP_MS: a sale its round could not settle yet (an on-chain
 * payment being confirmed) is asked again later, never at each read of the list (every minute).
 * Asking proves nothing: the round settles a link only as it always does (owner-finals.ts).
 */

/** How long a link asked for is not asked for again. */
export const OWNER_FINALS_ASK_GAP_MS = 5 * 60 * 1000;

/** When each link was last asked for (ms), within the gap. */
const lastAsked = new Map<string, number>();
const listeners = new Set<() => void>();

/**
 * Asks the owner's device for a round of final versions, for the links `ids` (their authors, hex)
 * that "Wallet" shows paid without one; unless each was asked for within the gap. Whether
 * it asked.
 */
export function askOwnerFinals(ids: readonly string[], now: number = Date.now()): boolean {
  // Bounded: only the links asked for within the gap are kept.
  for (const [id, at] of lastAsked) if (now - at >= OWNER_FINALS_ASK_GAP_MS) lastAsked.delete(id);
  const due = ids.filter((id) => !lastAsked.has(id));
  if (due.length === 0) return false;
  for (const id of due) lastAsked.set(id, now);
  for (const listener of listeners) listener();
  return true;
}

/** Calls `listener` at each round asked (askOwnerFinals). Returns its removal. */
export function onOwnerFinalsAsked(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Tests only. */
export function resetOwnerFinalsAsks(): void {
  lastAsked.clear();
}
