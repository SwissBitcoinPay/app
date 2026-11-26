import type { BreezNetwork } from "@/lib/breez/config";

import { MEMBER_LOT_KEY, parseStoredMemberLot, type StoredMemberLot } from "./member-lot";

/**
 * Same API as member-lot-store.ts, in the browser's `localStorage` (the web has no secure
 * storage), like the membership. In this browser only, gone with the site data.
 */

export async function loadMemberLot(network: BreezNetwork): Promise<StoredMemberLot | null> {
  const stored = localStorage.getItem(MEMBER_LOT_KEY);
  return stored === null ? null : parseStoredMemberLot(JSON.parse(stored), network);
}

export async function saveMemberLot(lot: StoredMemberLot): Promise<void> {
  localStorage.setItem(MEMBER_LOT_KEY, JSON.stringify(lot));
}

export async function clearMemberLot(): Promise<void> {
  localStorage.removeItem(MEMBER_LOT_KEY);
}
