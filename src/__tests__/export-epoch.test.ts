import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";

import { addEpochHolder, epochKeysOf, epochSealFor, familyOf } from "@/lib/nostr/epochs";
import { randomNostrKeys } from "@/lib/nostr/keys";
import { nip44Decrypt } from "@/lib/nostr/nip44";
import {
  EPOCH_ENVELOPE_VERSION,
  NewerRecordError,
  openRecord,
  sealRecord,
  type OpenOptions
} from "@/lib/nostr/record";
import {
  EpochSeeds,
  ExportEpochError,
  MAX_EXPORT_EPOCH,
  exportEpochEvent,
  exportEpochKey,
  exportEpochReader,
  exportEpochSeed,
  previousSeed,
  EPOCH_REFRESH_SECONDS,
  keepExportEpoch,
  raiseExportEpoch,
  readExportEpoch,
  seedDownTo
} from "@/lib/team/export-epoch";

import { readOnly, resetRelays, stored, unreachable } from "../../jest/nostr-relays";

const SHARED = Uint8Array.from({ length: 32 }, (_, i) => i + 1);
const BASE = new Uint8Array(32).fill(0xab);
const NOW = 1790000000;
const RELAYS = ["wss://a.example", "wss://b.example", "wss://c.example"];

beforeEach(() => resetRelays());

describe("the export epochs' keys (IRREVERSIBLE: vectors made apart, in Python)", () => {
  it("derives the seeds down from the top one, a hash per epoch", () => {
    expect(bytesToHex(exportEpochSeed(SHARED, MAX_EXPORT_EPOCH))).toBe(
      "e66cba73e3b70e31c491f6f0c28a2d451651fc5777807d2081619b9762960b30"
    );
    expect(bytesToHex(exportEpochSeed(SHARED, 3))).toBe(
      "31e7180fc3105fcbb769cfd22e94012c41ae98896fa8b3110973e03136530011"
    );
    expect(bytesToHex(exportEpochSeed(SHARED, 2))).toBe(
      "4262d81d43c0c9b9e9fdcc0dbe5f10a509a7f685e2af1ce768e575096b1639a4"
    );
    expect(bytesToHex(exportEpochSeed(SHARED, 1))).toBe(
      "8fa244ab4a5516b55bc2a07ec864d42671d8db8746ea84bbd3d7add596f06264"
    );
    expect(MAX_EXPORT_EPOCH).toBe(10_000);
  });

  it("derives a record's key and the registry's reading key of an epoch", () => {
    const seed1 = exportEpochSeed(SHARED, 1);
    expect(bytesToHex(exportEpochKey(seed1, BASE))).toBe(
      "246c789fc771975af1eb26115dfb265ac7e5ad61c33d8db2aef9383cd4d28472"
    );
    expect(bytesToHex(exportEpochKey(exportEpochSeed(SHARED, 2), BASE))).toBe(
      "104c0c095b2d639fa4f5b2786483174591fc6bc1e4ff2d3baf276759b2205a0c"
    );
    expect(bytesToHex(exportEpochReader(seed1).secretKey)).toBe(
      "55084af1bf6cac04fbde25823f55fbd58c1815d2de494c27567120a6a0d5961e"
    );
  });

  it("gives the seeds before an epoch from its seed, never one after", () => {
    const seed3 = exportEpochSeed(SHARED, 3);
    expect(previousSeed(seed3)).toEqual(exportEpochSeed(SHARED, 2));
    expect(seedDownTo(seed3, 3, 1)).toEqual(exportEpochSeed(SHARED, 1));
    const grant = new EpochSeeds({ epoch: 3, seed: seed3 });
    expect(grant.seedOf(2)).toEqual(exportEpochSeed(SHARED, 2));
    expect(grant.seedOf(3)).toEqual(seed3);
    expect(grant.seedOf(4)).toBeNull();
    expect(grant.seedOf(0)).toBeNull();
    expect(() => seedDownTo(seed3, 3, 4)).toThrow();
    expect(() => exportEpochSeed(SHARED, 0)).toThrow();
    expect(() => exportEpochSeed(SHARED, MAX_EXPORT_EPOCH + 1)).toThrow();
  });

  it("computes the same seeds from the shared secret in any order", () => {
    const seeds = new EpochSeeds({ shared: SHARED });
    expect(seeds.seedOf(5)).toEqual(exportEpochSeed(SHARED, 5));
    expect(seeds.seedOf(2)).toEqual(exportEpochSeed(SHARED, 2));
    expect(seeds.seedOf(4)).toEqual(exportEpochSeed(SHARED, 4));
    expect(seeds.seedOf(7)).toEqual(exportEpochSeed(SHARED, 7));
    expect(seeds.keyOf(2, BASE)).toEqual(exportEpochKey(exportEpochSeed(SHARED, 2), BASE));
    expect(seeds.readerOf(1)?.publicKey).toBe(
      exportEpochReader(exportEpochSeed(SHARED, 1)).publicKey
    );
  });
});

type Note = { version: 1; text: string };

function parseNote(value: unknown): Note | null {
  const note = value as Partial<Note> | null;
  if (typeof note?.version === "number" && note.version > 1) throw new NewerRecordError();
  return note?.version === 1 && typeof note.text === "string" ? (note as Note) : null;
}

const author = randomNostrKeys();
const ADDRESS = "a".repeat(64);
const options: OpenOptions<Note> = {
  type: "note",
  encryptionKey: BASE,
  address: ADDRESS,
  author: author.publicKey,
  parse: parseNote
};

function note(text: string, epoch: number | null, key?: Uint8Array) {
  return sealRecord({
    type: "note",
    value: { version: 1, text },
    signer: author.secretKey,
    encryptionKey: BASE,
    address: ADDRESS,
    createdAt: NOW,
    epoch:
      epoch === null
        ? null
        : { epoch, key: key ?? exportEpochKey(exportEpochSeed(SHARED, epoch), BASE) }
  });
}

describe("a record sealed at an epoch", () => {
  it("opens with the key of its epoch", () => {
    const opened = openRecord(note("hello", 2), {
      ...options,
      epochKey: (epoch) => (epoch === 2 ? exportEpochKey(exportEpochSeed(SHARED, 2), BASE) : null)
    });
    expect(opened).toMatchObject({ status: "ok", value: { text: "hello" } });
  });

  it("shows its former key's holder an envelope only, of a version above every record's", () => {
    const event = note("secret", 1);
    const outside = JSON.parse(nip44Decrypt(event.content, BASE).trim()) as {
      t: string;
      v: { version: number; epoch: number; sealed: string };
    };
    expect(outside.t).toBe("note");
    expect(outside.v.version).toBe(EPOCH_ENVELOPE_VERSION);
    expect(outside.v.epoch).toBe(1);
    expect(event.content).not.toContain("secret");
    expect(JSON.stringify(outside)).not.toContain("secret");
    // An app from before epochs: a record of a newer format, never written over.
    expect(openRecord(event, { ...options, epochKey: undefined, parse: parseNote })).toMatchObject({
      status: "newer"
    });
  });

  it("is of a newer format to a reader without the key of its epoch", () => {
    expect(openRecord(note("x", 4), { ...options, epochKey: () => null })).toMatchObject({
      status: "newer"
    });
  });

  it("is never read with another epoch's key (of a newer format then), nor as another type", () => {
    const event = note("x", 2);
    expect(
      openRecord(event, {
        ...options,
        epochKey: () => exportEpochKey(exportEpochSeed(SHARED, 1), BASE)
      })?.status
    ).toBe("newer");
    expect(openRecord(event, { ...options, type: "other" })).toBeNull();
  });

  it("refuses an envelope that seals another type, or another envelope", () => {
    const key = exportEpochKey(exportEpochSeed(SHARED, 1), BASE);
    const inner = sealRecord({
      type: "other",
      value: { version: 1, text: "x" },
      signer: author.secretKey,
      encryptionKey: BASE,
      address: ADDRESS,
      createdAt: NOW,
      epoch: { epoch: 1, key }
    });
    expect(openRecord(inner, { ...options, type: "other", epochKey: () => key })).toMatchObject({
      status: "ok"
    });
    // A note whose envelope seals an "other": refused.
    const forged = sealRecord({
      type: "note",
      value: {
        version: EPOCH_ENVELOPE_VERSION,
        epoch: 1,
        sealed: (JSON.parse(nip44Decrypt(inner.content, BASE).trim()) as { v: { sealed: string } })
          .v.sealed
      },
      signer: author.secretKey,
      encryptionKey: BASE,
      address: ADDRESS,
      createdAt: NOW
    });
    expect(openRecord(forged, { ...options, epochKey: () => key })).toBeNull();
    for (const epoch of [0, -1, 1.5, "1", null]) {
      const malformed = sealRecord({
        type: "note",
        value: { version: EPOCH_ENVELOPE_VERSION, epoch, sealed: "x" },
        signer: author.secretKey,
        encryptionKey: BASE,
        address: ADDRESS,
        createdAt: NOW
      });
      expect(openRecord(malformed, { ...options, epochKey: () => key })).toBeNull();
    }
  });

  it("refuses an epoch below 1 when sealing", () => {
    expect(() => note("x", 0, BASE)).toThrow();
  });

  it("is sealed and opened with the keys of the holders registered", () => {
    const seeds = new EpochSeeds({ shared: SHARED });
    // Another account's holder first: its key does not open, the next one's does.
    addEpochHolder({ sealFor: () => null, keyOf: () => new Uint8Array(32).fill(7) });
    const remove = addEpochHolder({
      sealFor: (base) =>
        familyOf(base) === familyOf(BASE) ? { epoch: 3, key: seeds.keyOf(3, base)! } : null,
      keyOf: (epoch, base) => seeds.keyOf(epoch, base)
    });
    expect(epochSealFor(new Uint8Array(32))).toBeNull();
    const seal = epochSealFor(BASE)!;
    expect(seal.epoch).toBe(3);
    expect(epochKeysOf(3, BASE)).toHaveLength(2);
    const event = sealRecord({
      type: "note",
      value: { version: 1, text: "held" },
      signer: author.secretKey,
      encryptionKey: BASE,
      address: ADDRESS,
      createdAt: NOW,
      epoch: seal
    });
    expect(openRecord(event, options)).toMatchObject({ status: "ok", value: { text: "held" } });
    remove();
    expect(epochSealFor(BASE)).toBeNull();
  });
});

describe("the account's epoch on the relays", () => {
  it("starts at 0, is raised by one on a majority, and reads the highest copy", async () => {
    expect(await readExportEpoch(SHARED, RELAYS)).toEqual({
      status: "read",
      epoch: 0,
      raisedAt: -1,
      latest: -1
    });
    expect(await raiseExportEpoch(SHARED, RELAYS, NOW)).toEqual({ epoch: 1, at: NOW });
    expect(await raiseExportEpoch(SHARED, RELAYS, NOW)).toEqual({ epoch: 2, at: NOW + 1 });
    expect(await readExportEpoch(SHARED, RELAYS)).toEqual({
      status: "read",
      epoch: 2,
      raisedAt: NOW + 1,
      latest: NOW + 1
    });
    // A relay that missed the last raise: the highest copy counts.
    stored.set(RELAYS[0]!, [exportEpochEvent(SHARED, 1, NOW)]);
    expect((await readExportEpoch(SHARED, RELAYS)).epoch).toBe(2);
  });

  it("is never read nor raised from fewer than a majority", async () => {
    unreachable.add(RELAYS[0]!);
    unreachable.add(RELAYS[1]!);
    expect((await readExportEpoch(SHARED, RELAYS)).status).toBe("unread");
    await expect(raiseExportEpoch(SHARED, RELAYS, NOW)).rejects.toThrow(ExportEpochError);
    unreachable.clear();
    readOnly.add(RELAYS[0]!);
    readOnly.add(RELAYS[1]!);
    await expect(raiseExportEpoch(SHARED, RELAYS, NOW)).rejects.toMatchObject({
      reason: "unreachable"
    });
  });

  it("is never raised over a copy of a newer format", async () => {
    const newer = sealRecord({
      type: "export-epoch",
      value: { version: 2, epoch: 9, updatedAt: NOW },
      signer: hexToBytes("a50e35366f02db5448810a4226063bb26744a00534e1fdc286ce2b2aea82a1c7"),
      encryptionKey: hexToBytes("d4fccec6d76955efc57e48a5a17e1d4be2c8786cdf96ea72c0ac44d75fb2b1d5"),
      address: "bdc83e0f1360f7d51901bd3e3b6e1bc1bdbebaff82d21540f83a529c7054f1bd",
      createdAt: NOW
    });
    for (const relay of RELAYS) stored.set(relay, [newer]);
    expect((await readExportEpoch(SHARED, RELAYS)).status).toBe("newer");
    await expect(raiseExportEpoch(SHARED, RELAYS, NOW)).rejects.toMatchObject({
      reason: "newer"
    });
  });

  it("is signed again once a month, its raise's date kept, and written back where it was lost", async () => {
    await raiseExportEpoch(SHARED, RELAYS, NOW);
    // Fresh: nothing written.
    expect(await keepExportEpoch(SHARED, RELAYS, NOW + 60, 1)).toBe(true);
    expect(await readExportEpoch(SHARED, RELAYS)).toMatchObject({ latest: NOW });
    const later = NOW + EPOCH_REFRESH_SECONDS + 1;
    expect(await keepExportEpoch(SHARED, RELAYS, later, 1)).toBe(true);
    expect(await readExportEpoch(SHARED, RELAYS)).toEqual({
      status: "read",
      epoch: 1,
      raisedAt: NOW,
      latest: later
    });
    // The relays lost it: written back at the epoch this device knows, never lower.
    resetRelays();
    expect(await keepExportEpoch(SHARED, RELAYS, later, 3)).toBe(true);
    expect((await readExportEpoch(SHARED, RELAYS)).epoch).toBe(3);
    // A raise from there never serves an epoch's keys twice.
    expect((await raiseExportEpoch(SHARED, RELAYS, later)).epoch).toBe(4);
    // Nothing known, nothing written.
    resetRelays();
    expect(await keepExportEpoch(SHARED, RELAYS, later, 0)).toBe(true);
    expect(stored.size === 0 || [...stored.values()].every((events) => events.length === 0)).toBe(
      true
    );
  });

  it("is raised above a floor this device knows", async () => {
    expect((await raiseExportEpoch(SHARED, RELAYS, NOW, undefined, 5)).epoch).toBe(6);
  });

  it("is the record's address, author and keys of the vectors", () => {
    const event = exportEpochEvent(SHARED, 1, NOW);
    expect(event.tags).toContainEqual([
      "d",
      "bdc83e0f1360f7d51901bd3e3b6e1bc1bdbebaff82d21540f83a529c7054f1bd"
    ]);
    const text = nip44Decrypt(
      event.content,
      hexToBytes("d4fccec6d76955efc57e48a5a17e1d4be2c8786cdf96ea72c0ac44d75fb2b1d5")
    );
    expect(JSON.parse(text.trim())).toEqual({
      t: "export-epoch",
      v: { version: 1, epoch: 1, raisedAt: NOW, updatedAt: NOW }
    });
  });
});
