import { schnorr } from "@noble/curves/secp256k1.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";

import { DEFAULT_RELAYS } from "@/config/relays";
import type { NostrEvent } from "@/lib/nostr/event";
import { deriveKey } from "@/lib/nostr/keys";
import { sealRecord } from "@/lib/nostr/record";
import { saleOwnerPublicKey, saleOwnerSecretKey } from "@/lib/payment-link/owner-key";
import { deriveSaleKeys } from "@/lib/registry/registry";
import {
  openSaleAcceptance,
  parseSaleAcceptance,
  publishSaleAcceptance,
  readSaleAcceptances,
  saleAcceptanceAddress,
  saleAcceptanceEvent
} from "@/lib/registry/sale-acceptance";

import type * as RelaysFake from "../../jest/nostr-relays";

/*
 * The owner's acceptance of a sale paid short (src/lib/registry/sale-acceptance.ts): one record per
 * sale, which whoever holds the sale's key reads and only the owner writes. Its derivations are
 * locked here: changing them loses every acceptance.
 */

const relays = jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");

/** The business's link owner key (its secret: the owner's alone) and a sale's own key. */
const OWNER_SECRET = hexToBytes("11".repeat(32));
const OWNER = bytesToHex(schnorr.getPublicKey(OWNER_SECRET));
const SALE_KEY = hexToBytes("22".repeat(32));
const OTHER_SALE_KEY = hexToBytes("33".repeat(32));
const AT = 1_793_000_000;
const SALE = deriveSaleKeys(SALE_KEY).nostr.publicKey;

beforeEach(() => relays.resetRelays());

describe("the record of a sale's acceptance", () => {
  it("keeps its derivations: its address and key come from the sale's own key", () => {
    // Locked: never change the salt nor the infos once released (sale-acceptance.ts).
    expect(saleAcceptanceAddress(SALE_KEY)).toBe(
      bytesToHex(deriveKey(SALE_KEY, "sattle.me/sale-acceptance", "address/v1"))
    );
    // Its vector, for the sale key 22…22 and the link owner key of the secret 11…11.
    expect(saleAcceptanceAddress(SALE_KEY)).toBe(
      "6c3452d340980b9a1dc17d68aeac5c1d7e00159bc1969dbbfe661ae6b9290172"
    );
    expect(bytesToHex(deriveKey(SALE_KEY, "sattle.me/sale-acceptance", "encryption-key/v1"))).toBe(
      "69b897e7b35d159927aeee4ff786a51f1836d323c6bfe7125818f700d828e7c1"
    );
    expect(saleOwnerPublicKey(OWNER, SALE_KEY)).toBe(
      "891fae644505aa28caf17566e02ba51fe0f5b4e4221299b16c9511068e4ceed6"
    );
    const event = saleAcceptanceEvent(
      OWNER_SECRET,
      SALE_KEY,
      { received: 30_000n, due: 49_000n },
      AT
    );
    // Opened with the key of the same info, the type and value as written.
    const opened = openSaleAcceptance(event, OWNER, SALE_KEY);
    expect(opened).toEqual({
      status: "ok",
      event,
      value: { received: 30_000n, due: 49_000n, at: AT }
    });
    // Signed by the owner's key of that sale (owner-key.ts), at its address, nothing else said.
    expect(event.pubkey).toBe(saleOwnerPublicKey(OWNER, SALE_KEY));
    expect(event.tags).toEqual([["d", saleAcceptanceAddress(SALE_KEY)]]);
    expect(event.created_at).toBe(AT);
    // The value, as relays never see it: sealed with HKDF(sale key, salt, "encryption-key/v1").
    const sealed = sealRecord({
      type: "sale-accepted",
      value: { version: 1, received: "30000", due: "49000" },
      signer: saleOwnerSecretKey(OWNER_SECRET, SALE_KEY),
      encryptionKey: deriveKey(SALE_KEY, "sattle.me/sale-acceptance", "encryption-key/v1"),
      address: saleAcceptanceAddress(SALE_KEY),
      createdAt: AT
    });
    expect(openSaleAcceptance(sealed, OWNER, SALE_KEY)?.status).toBe("ok");
  });

  it("is refused for another sale, another author, a forged key", () => {
    const event = saleAcceptanceEvent(OWNER_SECRET, SALE_KEY, { received: 1n, due: 2n }, AT);
    // Another sale's key: another address, another author.
    expect(openSaleAcceptance(event, OWNER, OTHER_SALE_KEY)).toBeNull();
    // Signed by whoever holds the sale's key (its payer): not the owner's key of the sale.
    const forged = sealRecord({
      type: "sale-accepted",
      value: { version: 1, received: "1", due: "2" },
      signer: deriveSaleKeys(SALE_KEY).nostr.secretKey,
      encryptionKey: deriveKey(SALE_KEY, "sattle.me/sale-acceptance", "encryption-key/v1"),
      address: saleAcceptanceAddress(SALE_KEY),
      createdAt: AT
    });
    expect(openSaleAcceptance(forged, OWNER, SALE_KEY)).toBeNull();
    // Another business's owner key.
    const other = bytesToHex(schnorr.getPublicKey(hexToBytes("44".repeat(32))));
    expect(openSaleAcceptance(event, other, SALE_KEY)).toBeNull();
    // A content altered: its signature fails.
    expect(openSaleAcceptance({ ...event, created_at: AT + 1 }, OWNER, SALE_KEY)).toBeNull();
  });

  it("reads its value strictly, a newer version left aside", () => {
    const at = { created_at: AT };
    const valid = { version: 1, received: "30000", due: "49000" };
    expect(parseSaleAcceptance(valid, at)).toEqual({ received: 30_000n, due: 49_000n, at: AT });
    // More fields: ignored.
    expect(parseSaleAcceptance({ ...valid, note: "x" }, at)).not.toBeNull();
    for (const invalid of [
      null,
      "x",
      { ...valid, version: undefined },
      { ...valid, version: "1" },
      { ...valid, received: 30_000 },
      { ...valid, received: "0" },
      { ...valid, received: "030000" },
      { ...valid, received: "-1" },
      { ...valid, due: "30000" },
      { ...valid, due: "29999" },
      { ...valid, due: "2100000000000001" },
      { ...valid, due: undefined }
    ]) {
      expect(parseSaleAcceptance(invalid, at)).toBeNull();
    }
    expect(() => parseSaleAcceptance({ ...valid, version: 2 }, at)).toThrow("newer format");
  });

  it("is never made of nothing received, of all of it, or of more", () => {
    for (const amounts of [
      { received: 0n, due: 49_000n },
      { received: 49_000n, due: 49_000n },
      { received: 50_000n, due: 49_000n },
      { received: 1n, due: 2_100_000_000_000_001n }
    ]) {
      expect(() => saleAcceptanceEvent(OWNER_SECRET, SALE_KEY, amounts, AT)).toThrow(
        "Invalid acceptance"
      );
    }
  });
});

describe("reading and publishing it", () => {
  const publish = (event: NostrEvent, list: readonly string[] = DEFAULT_RELAYS) =>
    publishSaleAcceptance(event, saleOwnerSecretKey(OWNER_SECRET, SALE_KEY), list);

  it("reads none, then the acceptance published on a majority", async () => {
    const ref = { saleKey: SALE_KEY, relays: DEFAULT_RELAYS };
    await expect(readSaleAcceptances([ref], OWNER)).resolves.toEqual(
      new Map([[SALE, { kind: "none" }]])
    );
    await publish(saleAcceptanceEvent(OWNER_SECRET, SALE_KEY, { received: 20n, due: 30n }, AT));
    const found = await readSaleAcceptances([ref], OWNER);
    expect(found.get(SALE)).toEqual({
      kind: "accepted",
      acceptance: { received: 20n, due: 30n, at: AT },
      // The record and who holds it: every relay of the read.
      event: expect.objectContaining({ created_at: AT }),
      holders: DEFAULT_RELAYS,
      relays: DEFAULT_RELAYS
    });
  });

  it('tells nothing without a majority\'s answer: not read, never "none"', async () => {
    for (const relay of DEFAULT_RELAYS.slice(0, 3)) relays.unreachable.add(relay);
    const found = await readSaleAcceptances([{ saleKey: SALE_KEY, relays: DEFAULT_RELAYS }], OWNER);
    expect(found.has(SALE)).toBe(false);
  });

  it("fails to publish without a majority, so that the owner tries again", async () => {
    for (const relay of DEFAULT_RELAYS.slice(0, 3)) relays.unreachable.add(relay);
    await expect(
      publish(saleAcceptanceEvent(OWNER_SECRET, SALE_KEY, { received: 20n, due: 30n }, AT))
    ).rejects.toThrow();
  });

  it("reads several sales at once, each by its own author and address", async () => {
    await publish(saleAcceptanceEvent(OWNER_SECRET, SALE_KEY, { received: 20n, due: 30n }, AT));
    const other = deriveSaleKeys(OTHER_SALE_KEY).nostr.publicKey;
    const found = await readSaleAcceptances(
      [
        { saleKey: SALE_KEY, relays: DEFAULT_RELAYS },
        { saleKey: OTHER_SALE_KEY, relays: DEFAULT_RELAYS },
        // Twice: read once.
        { saleKey: SALE_KEY, relays: DEFAULT_RELAYS }
      ],
      OWNER
    );
    expect(found.get(SALE)?.kind).toBe("accepted");
    expect(found.get(other)).toEqual({ kind: "none" });
  });

  it("ignores what others publish at its address, and keeps a newer format as newer", async () => {
    // A payer holding the sale's key signs one: not the owner's, ignored.
    const forged = sealRecord({
      type: "sale-accepted",
      value: { version: 1, received: "1", due: "30" },
      signer: deriveSaleKeys(SALE_KEY).nostr.secretKey,
      encryptionKey: deriveKey(SALE_KEY, "sattle.me/sale-acceptance", "encryption-key/v1"),
      address: saleAcceptanceAddress(SALE_KEY),
      createdAt: AT
    });
    for (const relay of DEFAULT_RELAYS) relays.stored.set(relay, [forged]);
    const ref = { saleKey: SALE_KEY, relays: DEFAULT_RELAYS };
    await expect(readSaleAcceptances([ref], OWNER)).resolves.toEqual(
      new Map([[SALE, { kind: "none" }]])
    );
    // The owner's of a newer format: never counted, never written over.
    const newer = sealRecord({
      type: "sale-accepted",
      value: { version: 2, received: "20", due: "30" },
      signer: saleOwnerSecretKey(OWNER_SECRET, SALE_KEY),
      encryptionKey: deriveKey(SALE_KEY, "sattle.me/sale-acceptance", "encryption-key/v1"),
      address: saleAcceptanceAddress(SALE_KEY),
      createdAt: AT
    });
    for (const relay of DEFAULT_RELAYS) relays.stored.set(relay, [newer]);
    await expect(readSaleAcceptances([ref], OWNER)).resolves.toEqual(
      new Map([[SALE, { kind: "newer" }]])
    );
  });

  it("reads it on the anonymous channel, as the sale's own records, never as the account", async () => {
    await readSaleAcceptances([{ saleKey: SALE_KEY, relays: DEFAULT_RELAYS }], OWNER);
    const reads = relays.calls.filter(({ operation }) => operation === "query");
    expect(reads.length).toBeGreaterThan(0);
    expect(new Set(reads.map(({ channel }) => channel))).toEqual(new Set(["anonymous"]));
  });
});
