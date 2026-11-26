import { bytesToHex } from "@noble/hashes/utils.js";

/*
 * The keys of the export epochs (src/lib/team/export-epoch.ts):
 * once the owner withdraws an assistant's export grant, the records that grant read are sealed
 * with keys of a new epoch, inside an envelope their former key opens (record.ts, sealRecord's
 * `epoch`). The holders of those keys on this device (the open account, the owner's device in till
 * mode, an employee's membership) are registered here: a record's writer asks which epoch and key
 * to seal with (epochSealFor), and openRecord asks the key of the epoch an envelope names
 * (epochKeysOf), so that every reader of these records opens them without knowing of epochs.
 *
 * A record's family is told by its former key (`base`, the NIP-44 key it was sealed with before
 * any epoch): a holder seals only the families it writes, at its epoch, and opens those it can.
 */

/** What seals a record at an epoch: the epoch (≥ 1) and its key for the record's family. */
export type EpochSeal = { epoch: number; key: Uint8Array };

/**
 * The registry's reading key of an epoch (src/lib/registry/registry.ts): what a sale's declarations
 * are sealed for inside, its public half; its secret too for the owner, who reads them.
 */
export type EpochReader = { publicKey: string; secretKey?: Uint8Array };

/** A holder of epoch keys on this device. */
export type EpochHolder = {
  /**
   * The epoch and key this holder seals a record of the family `base` with: null when it writes
   * none of that family, or at epoch 0 (sealed with `base` as before any epoch).
   */
  sealFor(base: Uint8Array): EpochSeal | null;
  /** The key of `epoch` (≥ 1) for the family `base`, null when this holder has none. */
  keyOf(epoch: number, base: Uint8Array): Uint8Array | null;
  /**
   * The epoch a declaration of the registry whose reading key of before epochs is `reader` (its
   * public half, hex) is sealed at by this device, with that epoch's reading key: null at epoch 0
   * or for another business's registry.
   */
  readerFor?(reader: string): { epoch: number; reader: string } | null;
  /** The reading key of `epoch` of the registry of `reader`, null when this holder has none. */
  readerOf?(epoch: number, reader: string): EpochReader | null;
};

const holders: EpochHolder[] = [];

/** Registers `holder`; the function returned removes it (the account closing, a member leaving). */
export function addEpochHolder(holder: EpochHolder): () => void {
  holders.push(holder);
  return () => {
    const index = holders.indexOf(holder);
    if (index >= 0) holders.splice(index, 1);
  };
}

/** What a record of the family `base` is sealed with now: null at epoch 0 (no envelope). */
export function epochSealFor(base: Uint8Array): EpochSeal | null {
  for (const holder of holders) {
    const seal = holder.sealFor(base);
    if (seal) return seal;
  }
  return null;
}

/**
 * The keys of `epoch` for the family `base` the holders give, each tried in turn by openRecord:
 * one holder's (the open account's) may be of another account than the record (a business this
 * device is an employee of), whose holder gives the right one.
 */
export function epochKeysOf(epoch: number, base: Uint8Array): Uint8Array[] {
  const keys: Uint8Array[] = [];
  for (const holder of holders) {
    const key = holder.keyOf(epoch, base);
    if (key) keys.push(key);
  }
  return keys;
}

/**
 * The epoch and its reading key a declaration of the registry of `reader` is sealed at now, null at
 * epoch 0 (sealed for `reader` alone, as before any epoch).
 */
export function epochReaderFor(reader: string): { epoch: number; reader: string } | null {
  for (const holder of holders) {
    const found = holder.readerFor?.(reader);
    if (found) return found;
  }
  return null;
}

/** The reading keys of `epoch` of the registry of `reader` the holders give, each tried in turn. */
export function epochReadersOf(epoch: number, reader: string): EpochReader[] {
  const readers: EpochReader[] = [];
  for (const holder of holders) {
    const found = holder.readerOf?.(epoch, reader);
    if (found) readers.push(found);
  }
  return readers;
}

/** The hex of a family's key, as holders list the families they write. */
export function familyOf(base: Uint8Array): string {
  return bytesToHex(base);
}

/** Tests only: forgets every holder. */
export function resetEpochHolders(): void {
  holders.length = 0;
}
