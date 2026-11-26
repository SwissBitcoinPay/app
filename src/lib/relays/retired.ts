import { RETIRED_RELAYS } from "@/config/relays";

import { parseRelayList } from "./list";

/*
 * The relays sattle.me retired (RETIRED_RELAYS): what an account's
 * list becomes once each of them is replaced, and what is left of the list once they are gone.
 */

/**
 * The list `list` with each relay of `retired` replaced by the relay that takes its place, where it
 * stood; dropped when that relay is in the list already. The other relays stay as they are, in
 * their order: one the merchant chose is never touched. Null when the list holds no retired relay,
 * or when what it would become is no valid list (a table whose replacement is not a relay address:
 * nothing is moved rather than a damaged list saved).
 */
export function replaceRetiredRelays(
  list: readonly string[],
  retired: ReadonlyMap<string, string> = RETIRED_RELAYS
): string[] | null {
  if (!list.some((relay) => retired.has(relay))) return null;
  const next: string[] = [];
  for (const relay of list) {
    const kept = retired.get(relay) ?? relay;
    if (!next.includes(kept) && !(retired.has(relay) && list.includes(kept))) next.push(kept);
  }
  return parseRelayList(next);
}

/** The relays of `list` that are not retired, in their order (none when all are). */
export function keptRelays(
  list: readonly string[],
  retired: ReadonlyMap<string, string> = RETIRED_RELAYS
): string[] {
  return list.filter((relay) => !retired.has(relay));
}

/**
 * The relays of `list` to read and write: those not retired (keptRelays), whose majority decides,
 * as the list sattle.me left them; the whole list when every one of them is retired (nothing else
 * could answer).
 */
export function liveRelays(
  list: readonly string[],
  retired: ReadonlyMap<string, string> = RETIRED_RELAYS
): readonly string[] {
  const kept = keptRelays(list, retired);
  return kept.length > 0 ? kept : list;
}
