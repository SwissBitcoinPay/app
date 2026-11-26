import { Directory, File, Paths } from "expo-file-system";

import { logFailure } from "@/lib/log/log";
import { settingsWalletId } from "@/lib/settings/merchant";

import { MOVES_VERSION, isNewerMoves, parseRegistryMoves, type RegistryMoves } from "./moves";

/**
 * The changes of relays whose declarations are still to copy (moves.ts), one JSON file per
 * account in the documents directory, like the merchant settings: no size limit (the secure
 * storage may refuse values of about 2 KB on some iOS releases, expo-secure-store v57), nothing
 * secret, and a restored device resumes the copy. Same API on the web: moves-store.web.ts.
 * Never rename the directory: installed apps keep their records there (device-wipe.ts removes it).
 */
export const MOVES_DIR_NAME = "registry-moves";

const fileName = (walletId: string) => `${settingsWalletId(walletId)}.json`;

function movesFile(walletId: string): File {
  return new File(new Directory(Paths.document, MOVES_DIR_NAME), fileName(walletId));
}

/** Thrown when the stored record is of a newer format: it is never written over. */
export class NewerMovesError extends Error {}

/** The account's record; an empty one when none, or an unreadable one. NewerMovesError otherwise. */
export async function loadRegistryMoves(walletId: string): Promise<RegistryMoves> {
  const file = movesFile(walletId);
  let value: unknown = null;
  try {
    if (file.exists) value = JSON.parse(await file.text());
  } catch (error) {
    logFailure("Unreadable record of the relays' changes", error);
  }
  if (isNewerMoves(value)) throw new NewerMovesError("A newer app wrote the relays' changes");
  return parseRegistryMoves(value) ?? { version: MOVES_VERSION, moves: [] };
}

/** Saves the account's record (removed when it holds no change). */
export async function saveRegistryMoves(walletId: string, record: RegistryMoves): Promise<void> {
  const file = movesFile(walletId);
  if (record.moves.length === 0) {
    if (file.exists) file.delete();
    return;
  }
  const directory = new Directory(Paths.document, MOVES_DIR_NAME);
  directory.create({ intermediates: true, idempotent: true });
  // Written next to the target, then moved over it: never a truncated file.
  const draft = new File(directory, `${fileName(walletId)}.tmp`);
  draft.writeSync(JSON.stringify(record));
  draft.moveSync(file, { overwrite: true });
}
