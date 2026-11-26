import { settingsWalletId } from "@/lib/settings/merchant";

import { MOVES_VERSION, isNewerMoves, parseRegistryMoves, type RegistryMoves } from "./moves";

/**
 * Same API as moves-store.ts, in the browser's `localStorage`: one entry per account. In this
 * browser only, gone with the site data. Never rename the prefix.
 */
export const MOVES_DIR_NAME = "registry-moves";

const keyOf = (walletId: string) => `${MOVES_DIR_NAME}/${settingsWalletId(walletId)}`;

export class NewerMovesError extends Error {}

export async function loadRegistryMoves(walletId: string): Promise<RegistryMoves> {
  let value: unknown = null;
  try {
    const stored = localStorage.getItem(keyOf(walletId));
    if (stored !== null) value = JSON.parse(stored);
  } catch {
    value = null;
  }
  if (isNewerMoves(value)) throw new NewerMovesError("A newer app wrote the relays' changes");
  return parseRegistryMoves(value) ?? { version: MOVES_VERSION, moves: [] };
}

export async function saveRegistryMoves(walletId: string, record: RegistryMoves): Promise<void> {
  if (record.moves.length === 0) localStorage.removeItem(keyOf(walletId));
  else localStorage.setItem(keyOf(walletId), JSON.stringify(record));
}
