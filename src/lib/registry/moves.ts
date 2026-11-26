import { parseRelayList } from "@/lib/relays/list";

/*
 * The changes of the account's relays whose registry declarations are still to copy
 * (src/features/settings/declarations-copy.ts): the list each
 * change left and its date, kept on the owner's device until a complete copy, done once the
 * transition is over, holds them on the account's list. And, from version 2 (a change of relays
 * may be made by itself, the auto-lock closing the account during
 * its copies), whether the account's other records it copies once saved all reached that list
 * (copyMovedRecords), copied again at each opening until they did. Nothing secret: relay URLs,
 * dates and a flag.
 */

/** Format of the record. A change of what it holds needs a new version and a migration. */
export const MOVES_VERSION = 2;

/** At most this many changes are kept: the oldest goes first (it is the furthest from the list). */
export const MAX_MOVES = 10;

export type RelaysMove = {
  /** The list the change left: where the declarations are read. */
  left: string[];
  /** When the change was saved (Unix seconds, the settings' `updatedAt`). */
  at: number;
  /**
   * When the last complete copy from `left` started (Unix seconds: the wallet's payments it read
   * were those received by then); null before one.
   */
  copied: number | null;
  /**
   * Whether the records the change copies once saved (the catalogue, the cards', the invoices'…:
   * copyMovedRecords) are known to hold on the account's list: false until a copy of them all
   * completed. True for a change kept by version 1, whose copies ran at the change only.
   */
  records: boolean;
};

export type RegistryMoves = { version: typeof MOVES_VERSION; moves: RelaysMove[] };

function isTime(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function parseMove(value: unknown, version: number): RelaysMove | null {
  if (value === null || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const left = parseRelayList(v.left);
  if (!left || !isTime(v.at) || (v.copied !== null && !isTime(v.copied))) return null;
  // Version 1 kept no such flag: its copies ran once, at the change, as they always did.
  if (version === 1) return { left, at: v.at, copied: v.copied, records: true };
  if (typeof v.records !== "boolean") return null;
  return { left, at: v.at, copied: v.copied, records: v.records };
}

/**
 * The record as stored, in this format (one of version 1 migrated); null when it is not one (a newer
 * app's, or damaged: the changes it named are then left to the next change, never written over by
 * a newer format, isNewerMoves).
 */
export function parseRegistryMoves(value: unknown): RegistryMoves | null {
  if (value === null || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (
    (v.version !== 1 && v.version !== MOVES_VERSION) ||
    !Array.isArray(v.moves) ||
    v.moves.length > MAX_MOVES
  ) {
    return null;
  }
  const moves: RelaysMove[] = [];
  for (const item of v.moves) {
    const move = parseMove(item, v.version === 1 ? 1 : MOVES_VERSION);
    if (!move) return null;
    moves.push(move);
  }
  return { version: MOVES_VERSION, moves };
}

/** Whether a stored value is a record of a newer format: never written over (staging rollbacks). */
export function isNewerMoves(value: unknown): boolean {
  const version = (value as { version?: unknown } | null)?.version;
  return typeof version === "number" && version > MOVES_VERSION;
}
