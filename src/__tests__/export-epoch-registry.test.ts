import { bytesToHex } from "@noble/hashes/utils.js";

import { holdOwnerEpochs, noteOwnerEpoch } from "@/features/team/export-epochs";
import { decodeBolt11 } from "@/lib/lightning/bolt11";
import type { Invoice } from "@/lib/lightning/lnurl";
import { resetEpochHolders } from "@/lib/nostr/epochs";
import { nostrKeys } from "@/lib/nostr/keys";
import { conversationKey, nip44Decrypt } from "@/lib/nostr/nip44";
import { EPOCH_ENVELOPE_VERSION } from "@/lib/nostr/record";
import {
  linkRegistryEpoch,
  parsePaymentLinkPayload,
  payloadOfSale,
  type PaymentLinkPayload
} from "@/lib/payment-link/payload";
import { onchainPaymentEvent, ownerOnchainPaymentsOf } from "@/lib/registry/onchain-payments";
import {
  declarationEvent,
  declareInvoice,
  fetchDeclaredInvoices,
  outerKey,
  ownerDeclarations,
  registryAddress,
  saleRegistry,
  settledDeclarationsOf,
  type DeclaredSale,
  type Registry
} from "@/lib/registry/registry";
import { EpochSeeds, exportEpochReader, exportEpochSeed } from "@/lib/team/export-epoch";
import {
  deriveRegistryKey,
  deriveRegistryReader,
  deriveTeamKeys,
  deriveLinkOwner,
  ownerDevicesSecret
} from "@/lib/team/keys";

import { makeInvoice, metadataHash, preimagePair } from "../../jest/lightning";
import type * as RelaysFake from "../../jest/nostr-relays";

const relays = jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");

const METADATA = `[["text/plain","Fine Bakery"],["text/identifier","sattleme02c6047f94@breez.tips"]]`;
const NOW = Date.UTC(2026, 10, 20, 13, 10, 30) / 1000;
const team = deriveTeamKeys(new Uint8Array(32).fill(3));
const shared = ownerDevicesSecret(team);
const ACCOUNT = "02" + "ef".repeat(32);
const reader0 = deriveRegistryReader(team);
const business = {
  key: deriveRegistryKey(team),
  reader: reader0.publicKey,
  owner: deriveLinkOwner(team).publicKey
};
const owner = { key: business.key, reader: reader0 };
const SALE: DeclaredSale = { fiat: { minor: 500, digits: 2, currency: "CHF" }, note: "Table 12" };

function invoice(n: number): Invoice {
  const { paymentHash } = preimagePair(n);
  const pr = makeInvoice({
    amountMsat: 10_000_000n,
    paymentHash,
    descriptionHash: metadataHash(METADATA),
    timestamp: NOW,
    expirySeconds: 600
  });
  return { pr, decoded: decodeBolt11(pr)!, verifyUrl: `https://breez.tips/verify/${paymentHash}` };
}

/** The owner's device, the account open, at `epoch`. */
function holdAt(epoch: number) {
  holdOwnerEpochs(ACCOUNT, shared, [], reader0.publicKey);
  noteOwnerEpoch(ACCOUNT, epoch);
}

/** What a declaration holds inside, opened with the reading key of before epochs alone. */
function insideWithReader0(event: { pubkey: string; content: string; tags: string[][] }) {
  const address = event.tags.find(([name]) => name === "d")![1]!;
  const outside = JSON.parse(
    nip44Decrypt(event.content, outerKey(business.key, address, event.pubkey)).trim()
  ) as { v: { sealed: string } };
  return JSON.parse(
    nip44Decrypt(outside.v.sealed, conversationKey(reader0.secretKey, event.pubkey))
  ) as Record<string, unknown>;
}

beforeEach(() => relays.resetRelays());

describe("a declaration at an export epoch", () => {
  it("is sealed for the epoch's reading key inside, a copy of a withdrawn grant reading none", () => {
    holdAt(2);
    const sale = saleRegistry(business, new Uint8Array(32).fill(1));
    expect(sale.readerEpoch).toEqual({
      epoch: 2,
      reader: exportEpochReader(exportEpochSeed(shared, 2)).publicKey
    });
    const event = declarationEvent(sale, invoice(1), SALE, NOW);
    const inside = insideWithReader0(event);
    expect(inside).toMatchObject({ version: EPOCH_ENVELOPE_VERSION, epoch: 2 });
    expect(JSON.stringify(inside)).not.toContain("Table 12");
  });

  it("is read by the owner holding the epoch, of a newer format to an owner's app of before", async () => {
    holdAt(1);
    const sale = saleRegistry(business, new Uint8Array(32).fill(1));
    await declareInvoice(sale, invoice(1), SALE);
    const hash = preimagePair(1).paymentHash;
    const found = await ownerDeclarations(owner, hash, "bc");
    expect(found).toHaveLength(1);
    expect(found![0]).toMatchObject({ note: "Table 12", author: sale.saleKeys.nostr.publicKey });
    expect(await settledDeclarationsOf(owner, [hash], "bc")).toEqual(
      new Map([[hash, { status: "unique", declaration: found![0] }]])
    );
    // An app before epochs: none opened, a declaration of a newer format, the payment undecided
    // (never "none", which a copy of the month would keep for good).
    resetEpochHolders();
    expect(await ownerDeclarations(owner, hash, "bc")).toEqual([]);
    expect(await settledDeclarationsOf(owner, [hash], "bc")).toEqual(new Map());
  });

  it("keeps a conflict with a declaration of before epochs", async () => {
    const before = saleRegistry(business, new Uint8Array(32).fill(1));
    await declareInvoice(before, invoice(3), SALE);
    holdAt(1);
    const after = saleRegistry(business, new Uint8Array(32).fill(2));
    await declareInvoice(after, invoice(3), SALE);
    const hash = preimagePair(3).paymentHash;
    expect(await settledDeclarationsOf(owner, [hash], "bc")).toEqual(
      new Map([[hash, { status: "conflict" }]])
    );
  });

  it("is found again by its own sale, whatever epoch this device holds since", async () => {
    holdAt(1);
    const sale = saleRegistry(business, new Uint8Array(32).fill(4));
    await declareInvoice(sale, invoice(4), SALE);
    noteOwnerEpoch(ACCOUNT, 2);
    const again = saleRegistry(business, new Uint8Array(32).fill(4));
    expect(again.readerEpoch?.epoch).toBe(2);
    expect((await fetchDeclaredInvoices(again, "bc"))?.map(({ pr }) => pr)).toEqual([
      invoice(4).pr
    ]);
  });

  it("is sealed at the epoch a payment link names, on a payer's page that holds none", async () => {
    const reader = exportEpochReader(exportEpochSeed(shared, 3)).publicKey;
    const sale: Registry = saleRegistry(
      { ...business, readerEpoch: { epoch: 3, reader } },
      new Uint8Array(32).fill(5)
    );
    await declareInvoice(sale, invoice(5), SALE);
    holdAt(3);
    const found = await ownerDeclarations(owner, preimagePair(5).paymentHash, "bc");
    expect(found?.map(({ note }) => note)).toEqual(["Table 12"]);
  });

  it("opens with no epoch's key but that of its epoch", async () => {
    holdAt(2);
    const sale = saleRegistry(business, new Uint8Array(32).fill(6));
    await declareInvoice(sale, invoice(6), SALE);
    // A grant written at epoch 1: the seeds up to 1 only.
    const grant = new EpochSeeds({ epoch: 1, seed: exportEpochSeed(shared, 1) });
    expect(grant.readerOf(2)).toBeNull();
    expect(bytesToHex(grant.readerOf(1)!.secretKey)).toBe(
      bytesToHex(exportEpochReader(exportEpochSeed(shared, 1)).secretKey)
    );
  });
});

describe("an on-chain payment's declaration at an export epoch", () => {
  it("is read by the owner holding the epoch, of a newer format otherwise", async () => {
    holdAt(1);
    const sale = saleRegistry(business, new Uint8Array(32).fill(7));
    const txid = "ab".repeat(32);
    const address = "bc1p5d7rjq7g6rdk2yhzks9smlaqtedr4dekq08ge8ztwac72sfr9rusxg3297";
    const event = onchainPaymentEvent(sale, { txid, address }, SALE, NOW);
    const list = ["wss://a.example", "wss://b.example", "wss://c.example"];
    for (const relay of list) relays.stored.set(relay, [event]);
    const read = await ownerOnchainPaymentsOf(owner, [txid], "bc", { relays: list });
    expect(read?.declared.get(txid)?.map(({ note }) => note)).toEqual(["Table 12"]);
    resetEpochHolders();
    const before = await ownerOnchainPaymentsOf(owner, [txid], "bc", { relays: list });
    expect(before?.declared.get(txid)).toEqual([]);
    expect(before?.newer.has(txid)).toBe(true);
  });
});

describe("a payment link's export epoch", () => {
  const base = {
    version: 3,
    businessName: "Fine Bakery",
    lightningAddress: "shop@breez.tips",
    fiat: { minor: 500, digits: 2, currency: "CHF" },
    note: "",
    onchainAddress: null,
    endsAt: NOW + 600,
    registryKey: bytesToHex(business.key),
    registryReader: business.reader,
    owner: business.owner
  } satisfies PaymentLinkPayload;

  it("is named by a link made at an epoch, kept by its final version, absent before", () => {
    expect(linkRegistryEpoch(business.reader)).toEqual({});
    holdAt(1);
    const named = { ...base, ...linkRegistryEpoch(business.reader) };
    const epoch = { epoch: 1, reader: exportEpochReader(exportEpochSeed(shared, 1)).publicKey };
    expect(named.registryEpoch).toEqual(epoch);
    const parsed = parsePaymentLinkPayload(named, "bc");
    expect(parsed?.kind === "sale" && parsed.sale.registryEpoch).toEqual(epoch);
    if (parsed?.kind === "sale") expect(payloadOfSale(parsed.sale).registryEpoch).toEqual(epoch);
    // Another business's registry: none.
    expect(linkRegistryEpoch(nostrKeys(new Uint8Array(32).fill(1)).publicKey)).toEqual({});
  });

  it("is left aside when not in its form: sealed as before epochs", () => {
    for (const registryEpoch of [
      { epoch: 0, reader: business.reader },
      { epoch: 1, reader: "xyz" },
      { epoch: 1.5, reader: business.reader },
      "1"
    ]) {
      const parsed = parsePaymentLinkPayload({ ...base, registryEpoch }, "bc");
      expect(parsed?.kind).toBe("sale");
      expect(parsed?.kind === "sale" && "registryEpoch" in parsed.sale).toBe(false);
    }
  });

  it("is never another sale's address nor key", () => {
    holdAt(1);
    const sale = saleRegistry(business, new Uint8Array(32).fill(8));
    const event = declarationEvent(sale, invoice(8), SALE, NOW);
    expect(event.tags).toContainEqual([
      "d",
      registryAddress(business.key, preimagePair(8).paymentHash)
    ]);
  });
});
