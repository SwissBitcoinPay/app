import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";

import {
  exportKeysParts,
  parseExportKeysPart,
  type ExportKeys
} from "@/lib/assistant/export-grant";
import { decodeBolt11 } from "@/lib/lightning/bolt11";
import type { NostrEvent } from "@/lib/nostr/event";
import { conversationKey, nip44Decrypt } from "@/lib/nostr/nip44";
import { EPOCH_ENVELOPE_VERSION, openRecord, sealRecord } from "@/lib/nostr/record";
import { declarationEvent, openInside, outerKey, saleRegistry } from "@/lib/registry/registry";
import {
  EpochSeeds,
  MAX_EXPORT_EPOCH,
  exportEpochEvent,
  exportEpochKey,
  exportEpochReader,
  exportEpochSeed
} from "@/lib/team/export-epoch";
import { nostrKeys } from "@/lib/nostr/keys";

import { makeInvoice, metadataHash, preimagePair } from "../../jest/lightning";

/*
 * The vectors of the export epochs (src/__tests__/fixtures/mcp-server/export-epochs.json), for sattleme/mcp-server: the
 * derivations from a grant's seed, a record sealed at an epoch and a declaration of the registry
 * sealed at one, as the app makes them, and the part 0 of a grant of format 2. Made again only on
 * purpose (WRITE_EXPORT_EPOCH_VECTORS=1, then `npm run format`); otherwise each value is checked
 * as the app reads it.
 */

const fs = jest.requireActual<{
  readFileSync(path: string, encoding: "utf8"): string;
  writeFileSync(path: string, data: string): void;
}>("fs");
const FILE = `${process.cwd()}/src/__tests__/fixtures/mcp-server/export-epochs.json`;

/** The owner's devices' shared secret of the vectors: 01 02 … 20, never a real account's. */
const SHARED = Uint8Array.from({ length: 32 }, (_, i) => i + 1);
const BASE = new Uint8Array(32).fill(0xab);
const NOW = 1790000000;
const AUTHOR = nostrKeys(new Uint8Array(32).fill(0x21));
const REGISTRY_KEY = new Uint8Array(32).fill(7);
const READER0 = nostrKeys(new Uint8Array(32).fill(9));
const METADATA = `[["text/plain","Fine Bakery"],["text/identifier","sattleme02c6047f94@breez.tips"]]`;

type Vectors = {
  source: string;
  sharedSecret: string;
  maxEpoch: number;
  seeds: { epoch: number; seed: string }[];
  recordKeys: { base: string; epoch: number; key: string }[];
  readers: { epoch: number; secretKey: string; publicKey: string }[];
  envelope: {
    version: number;
    base: string;
    epoch: number;
    type: string;
    value: unknown;
    event: NostrEvent;
  };
  declaration: {
    registryKey: string;
    readerBefore: { secretKey: string; publicKey: string };
    epoch: number;
    inside: unknown;
    event: NostrEvent;
  };
  epochRecord: { epoch: number; updatedAt: number; event: NostrEvent };
  grantPart0: unknown;
};

function made(): Vectors {
  const seeds = [1, 2, 3, MAX_EXPORT_EPOCH].map((epoch) => ({
    epoch,
    seed: bytesToHex(exportEpochSeed(SHARED, epoch))
  }));
  const seed2 = exportEpochSeed(SHARED, 2);
  const value = { version: 1, text: "sealed at epoch 2" };
  const envelope = sealRecord({
    type: "note",
    value,
    signer: AUTHOR.secretKey,
    encryptionKey: BASE,
    address: "a".repeat(64),
    createdAt: NOW,
    epoch: { epoch: 2, key: exportEpochKey(seed2, BASE) }
  });
  const reader1 = exportEpochReader(exportEpochSeed(SHARED, 1));
  const sale = saleRegistry(
    {
      key: REGISTRY_KEY,
      reader: READER0.publicKey,
      owner: READER0.publicKey,
      readerEpoch: { epoch: 1, reader: reader1.publicKey }
    },
    new Uint8Array(32).fill(1)
  );
  const { paymentHash } = preimagePair(1);
  const pr = makeInvoice({
    amountMsat: 10_000_000n,
    paymentHash,
    descriptionHash: metadataHash(METADATA),
    timestamp: NOW,
    expirySeconds: 600
  });
  const declaration = declarationEvent(
    sale,
    { pr, decoded: decodeBolt11(pr)!, verifyUrl: `https://breez.tips/verify/${paymentHash}` },
    { fiat: { minor: 500, digits: 2, currency: "CHF" }, note: "Table 12" },
    NOW
  );
  const hex = (n: number) => n.toString(16).padStart(2, "0").repeat(32);
  const keys: ExportKeys = {
    account: {
      registryReader: bytesToHex(READER0.secretKey),
      invoices: { author: hex(0x22), encryptionKey: hex(0x33), addressKey: hex(0x44) },
      paymentRates: { author: hex(0x22), encryptionKey: hex(0x35), addressKey: hex(0x44) },
      walletSends: { author: hex(0x22), encryptionKey: hex(0x36), addressKey: hex(0x44) },
      archive: { author: hex(0x22), encryptionKey: hex(0x37), addressKey: hex(0x44) },
      legacyHistory: { author: hex(0x22), encryptionKey: hex(0x38), addressKey: hex(0x44) },
      epoch: { epoch: 2, seed: bytesToHex(seed2) }
    },
    format: null,
    seats: [],
    omitted: 0
  };
  return {
    source:
      "Made by the sattle.me app (src/__tests__/export-epoch-vectors.test.ts): the export epochs. `seeds`: from `sharedSecret`, each epoch's from the next one's (a grant gives the seed of its epoch only). `recordKeys`: a record's key at an epoch, from its seed and the record's own key (`base`). `readers`: the registry's reading keys of the epochs. `envelope`: a record sealed at an epoch, opened with `base` then with its epoch's key. `declaration`: a declaration of the registry sealed at an epoch inside, opened as the owner does. `epochRecord`: the account's epoch, sealed with keys of `sharedSecret`. `grantPart0`: the part 0 of a grant's keys of format 2.",
    sharedSecret: bytesToHex(SHARED),
    maxEpoch: MAX_EXPORT_EPOCH,
    seeds,
    recordKeys: [1, 2].map((epoch) => ({
      base: bytesToHex(BASE),
      epoch,
      key: bytesToHex(exportEpochKey(exportEpochSeed(SHARED, epoch), BASE))
    })),
    readers: [1, 2].map((epoch) => {
      const reader = exportEpochReader(exportEpochSeed(SHARED, epoch));
      return { epoch, secretKey: bytesToHex(reader.secretKey), publicKey: reader.publicKey };
    }),
    envelope: {
      version: EPOCH_ENVELOPE_VERSION,
      base: bytesToHex(BASE),
      epoch: 2,
      type: "note",
      value,
      event: envelope
    },
    declaration: {
      registryKey: bytesToHex(REGISTRY_KEY),
      readerBefore: { secretKey: bytesToHex(READER0.secretKey), publicKey: READER0.publicKey },
      epoch: 1,
      inside: {
        version: 1,
        invoice: pr,
        verifyUrl: `https://breez.tips/verify/${paymentHash}`,
        sale: {
          key: bytesToHex(new Uint8Array(32).fill(1)),
          fiat: { minor: 500, digits: 2, currency: "CHF" },
          note: "Table 12"
        }
      },
      event: declaration
    },
    epochRecord: { epoch: 2, updatedAt: NOW, event: exportEpochEvent(SHARED, 2, NOW) },
    grantPart0: JSON.parse(JSON.stringify(exportKeysParts(keys, NOW)[0]))
  };
}

const stable = (vectors: Vectors) => ({
  ...vectors,
  envelope: { ...vectors.envelope, event: null },
  declaration: { ...vectors.declaration, event: null },
  epochRecord: { ...vectors.epochRecord, event: null }
});

describe("the export epochs' vectors (src/__tests__/fixtures/mcp-server/export-epochs.json)", () => {
  if (process.env.WRITE_EXPORT_EPOCH_VECTORS === "1") {
    fs.writeFileSync(FILE, `${JSON.stringify(made(), null, 2)}\n`);
  }
  const vectors = JSON.parse(fs.readFileSync(FILE, "utf8")) as Vectors;

  it("are the app's derivations, its record's and declaration's values and its grant's part", () => {
    // The events are sealed anew each time (random nonces, signatures): checked below.
    expect(stable(vectors)).toEqual(stable(JSON.parse(JSON.stringify(made())) as Vectors));
  });

  it("hold a record sealed at an epoch, which its epoch's key opens, the grant's seed giving it", () => {
    const { envelope } = vectors;
    const grant = new EpochSeeds({ epoch: 2, seed: hexToBytes(vectors.seeds[1]!.seed) });
    const opened = openRecord(envelope.event, {
      type: envelope.type,
      encryptionKey: hexToBytes(envelope.base),
      address: () => true,
      parse: (value) => value,
      epochKey: (epoch) => grant.keyOf(epoch, hexToBytes(envelope.base))
    });
    expect(opened).toMatchObject({ status: "ok", value: envelope.value });
    // With its own key alone: an envelope of a newer format.
    expect(
      openRecord(envelope.event, {
        type: envelope.type,
        encryptionKey: hexToBytes(envelope.base),
        address: () => true,
        parse: (value) => value,
        epochKey: () => null
      })?.status
    ).toBe("newer");
  });

  it("hold a declaration sealed at an epoch inside, which the epoch's reading key opens", () => {
    const { declaration, readers } = vectors;
    const event = declaration.event;
    const address = event.tags.find(([name]) => name === "d")![1]!;
    const outside = JSON.parse(
      nip44Decrypt(
        event.content,
        outerKey(hexToBytes(declaration.registryKey), address, event.pubkey)
      ).trim()
    ) as { v: { sealed: string } };
    const reader = readers.find(({ epoch }) => epoch === declaration.epoch)!;
    const inside = openInside(outside.v.sealed, {
      key: conversationKey(hexToBytes(declaration.readerBefore.secretKey), event.pubkey),
      epochKey: (epoch) =>
        epoch === declaration.epoch
          ? conversationKey(hexToBytes(reader.secretKey), event.pubkey)
          : null
    });
    expect(inside).toEqual(declaration.inside);
  });

  it("hold the account's epoch record and a grant's part of format 2, as the app reads them", () => {
    expect(parseExportKeysPart(vectors.grantPart0, 0)).toMatchObject({
      version: 2,
      account: { epoch: { epoch: 2, seed: vectors.seeds[1]!.seed } }
    });
    expect(vectors.epochRecord.event.created_at).toBe(vectors.epochRecord.updatedAt);
  });
});
