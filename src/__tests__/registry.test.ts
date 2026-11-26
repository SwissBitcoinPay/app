import { bytesToHex } from "@noble/hashes/utils.js";

import { DEFAULT_RELAYS as REGISTRY_RELAYS } from "@/config/relays";
import { REGISTRY_TIMEOUT_MS, majority } from "@/config/registry";
import type { Invoice, PayRequest } from "@/lib/lightning/lnurl";
import { decodeBolt11 } from "@/lib/lightning/bolt11";
import { nostrKeys } from "@/lib/nostr/keys";
import { signEvent } from "@/lib/nostr/event";
import { PAGE_FLOOR } from "@/lib/nostr/pool";
import { conversationKey, nip44Encrypt } from "@/lib/nostr/nip44";
import {
  checkDeclaredInvoice,
  datedForSale,
  declarationEvent,
  declareInvoice,
  deriveSaleKeys,
  fetchDeclaredInvoices,
  paymentUniqueness,
  ownerDeclarations,
  outerKey,
  registryAddress,
  saleRegistry,
  takerTag,
  UNIQUENESS_READ_LIMIT,
  OWNER_READ_LIMIT,
  type DeclaredSale,
  type Registry
} from "@/lib/registry/registry";

import { makeInvoice, metadataHash, preimagePair } from "../../jest/lightning";
import type * as RelaysFake from "../../jest/nostr-relays";

// The in-memory relays of jest.setup.ts.
const relays = jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");

const METADATA = `[["text/plain","Fine Bakery"],["text/identifier","sattleme02c6047f94@breez.tips"]]`;
const PAY: PayRequest = {
  callback: new URL("https://breez.tips/lnurlp/sattleme02c6047f94/invoice"),
  minSendableMsat: 1000n,
  maxSendableMsat: 4_000_000_000n,
  metadata: METADATA,
  commentAllowed: 255
};
/** 13:10:30 UTC, priced by the point of 13:00 (from 13:05 to 14:05). */
const NOW = Date.UTC(2026, 9, 3, 13, 10, 30) / 1000;
const PERIOD_END = Date.UTC(2026, 9, 3, 14, 5) / 1000;
/** Midnight UTC between the 3rd and the 4th. */
const MIDNIGHT = Date.UTC(2026, 9, 4) / 1000;

const registryKey = new Uint8Array(32).fill(7);
/** The business's reading key: the owner's (deriveRegistryReader). */
const READER = nostrKeys(new Uint8Array(32).fill(9));
/** The business's link owner key (deriveLinkOwner), its public half. */
const OWNER = nostrKeys(new Uint8Array(32).fill(11)).publicKey;
const registry = (saleByte: number): Registry =>
  saleRegistry(
    { key: registryKey, reader: READER.publicKey, owner: OWNER },
    new Uint8Array(32).fill(saleByte)
  );
/** What the sales of these tests are: 5,00 CHF for table 12. */
const SALE: DeclaredSale = { fiat: { minor: 500, digits: 2, currency: "CHF" }, note: "Table 12" };

function invoice(n: number, fields: Partial<Parameters<typeof makeInvoice>[0]> = {}): Invoice {
  const { paymentHash } = preimagePair(n);
  const pr = makeInvoice({
    amountMsat: 10_000_000n,
    paymentHash,
    descriptionHash: metadataHash(METADATA),
    timestamp: NOW,
    expirySeconds: PERIOD_END - NOW,
    ...fields
  });
  return { pr, decoded: decodeBolt11(pr)!, verifyUrl: `https://breez.tips/verify/${paymentHash}` };
}

beforeEach(() => relays.resetRelays());

describe("registry addresses and keys", () => {
  it("gives one address per payment hash and registry key, nothing readable", () => {
    const { paymentHash } = preimagePair(1);
    const address = registryAddress(registryKey, paymentHash);
    expect(address).toMatch(/^[0-9a-f]{64}$/);
    expect(registryAddress(registryKey, paymentHash)).toBe(address);
    expect(address).not.toContain(paymentHash);
    expect(registryAddress(new Uint8Array(32).fill(8), paymentHash)).not.toBe(address);
    expect(registryAddress(registryKey, preimagePair(2).paymentHash)).not.toBe(address);
  });

  it("never change: every declaration's address and keys derive from them (salt, info strings)", () => {
    // The public key of HKDF-SHA256(sale key, "sattle.me/sale", "nostr-secret-key/v1"),
    // the HKDF computed independently with Python's hmac and hashlib.
    const keys = deriveSaleKeys(new Uint8Array(32).fill(1));
    expect(keys.nostr.publicKey).toBe(
      "82db8e4b549cad6e6a8c6923e427433370ba77645a54cb8e042d249b41d43fb4"
    );
    // HMAC-SHA256(registry key, payment hash).
    expect(registryAddress(registryKey, `${"00".repeat(31)}01`)).toBe(
      "22427295261e7acc8bea9e3b0e1c964b363ccd3d8aa63b145390c59455280905"
    );
    // HKDF-SHA256(registry key, "sattle.me/registry-declaration", "outer/v1/<d>/<author>"),
    // computed independently with Python's hmac and hashlib.
    expect(
      bytesToHex(
        outerKey(
          registryKey,
          "22427295261e7acc8bea9e3b0e1c964b363ccd3d8aa63b145390c59455280905",
          "82db8e4b549cad6e6a8c6923e427433370ba77645a54cb8e042d249b41d43fb4"
        )
      )
    ).toBe("ef4f2ef69f857c8f5fd6c0a16a62c839b2558eefb00b896653878cf8976e4d18");
  });

  it("derives the keys of a sale from its own key, the same everywhere", () => {
    const a = deriveSaleKeys(new Uint8Array(32).fill(1));
    expect(deriveSaleKeys(new Uint8Array(32).fill(1))).toEqual(a);
    expect(deriveSaleKeys(new Uint8Array(32).fill(2)).nostr.publicKey).not.toBe(a.nostr.publicKey);
  });

  it("is a majority of the relays", () => {
    expect(REGISTRY_RELAYS).toHaveLength(5);
    expect(majority(5)).toBe(3);
    expect(majority(7)).toBe(4);
    expect(majority(1)).toBe(1);
    expect(majority(2)).toBe(2);
  });
});

describe("declarations", () => {
  it("seals the invoice for the sale at its d(H), opaque to the relays", () => {
    const sale = registry(1);
    const lightning = invoice(1);
    const event = declarationEvent(sale, lightning, SALE, NOW);
    expect(event.kind).toBe(30078);
    expect(event.pubkey).toBe(sale.saleKeys.nostr.publicKey);
    expect(event.tags).toContainEqual([
      "d",
      registryAddress(registryKey, lightning.decoded.paymentHash)
    ]);
    // No end: the payment stays claimed by its sale.
    expect(event.tags.some(([name]) => name === "expiration")).toBe(false);
    expect(JSON.stringify(event)).not.toContain(lightning.pr);
    expect(JSON.stringify(event)).not.toContain(lightning.decoded.paymentHash);
  });

  it("resolves once a majority of the relays took it, rejects when they cannot", async () => {
    const sale = registry(1);
    for (const relay of REGISTRY_RELAYS.slice(0, 2)) relays.unreachable.add(relay);
    await expect(declareInvoice(sale, invoice(1), SALE)).resolves.toBeUndefined();

    relays.unreachable.add(REGISTRY_RELAYS[2]);
    await expect(declareInvoice(sale, invoice(2), SALE)).rejects.toThrow("Fewer than 3 relays");
  });

  it("finds the invoices of a sale, whatever device declared them, and only those", async () => {
    const sale = registry(1);
    await declareInvoice(sale, invoice(1), SALE);
    await declareInvoice(sale, invoice(2), SALE);
    // Another sale's.
    await declareInvoice(registry(2), invoice(3), SALE);

    const found = await fetchDeclaredInvoices(sale, "bc");
    expect(found?.map((entry) => entry.decoded.paymentHash).sort()).toEqual(
      [preimagePair(1).paymentHash, preimagePair(2).paymentHash].sort()
    );
    // Of another network: not this build's.
    expect(await fetchDeclaredInvoices(sale, "bcrt")).toEqual([]);
  });

  it("ignores a declaration filed at another payment's address", async () => {
    const sale = registry(1);
    const event = declarationEvent(sale, invoice(1), SALE, NOW);
    // The same content, re-signed at the address of another hash: refused by its own check.
    const { sealRecord } =
      jest.requireActual<typeof import("@/lib/nostr/record")>("@/lib/nostr/record");
    const address = registryAddress(registryKey, preimagePair(9).paymentHash);
    const inner = {
      version: 1,
      invoice: invoice(1).pr,
      verifyUrl: invoice(1).verifyUrl,
      sale: { key: "01".repeat(32), ...SALE }
    };
    const misplaced = sealRecord({
      type: "registry-declaration",
      value: {
        sealed: nip44Encrypt(
          JSON.stringify(inner),
          conversationKey(sale.saleKeys.nostr.secretKey, READER.publicKey)
        )
      },
      signer: sale.saleKeys.nostr.secretKey,
      encryptionKey: outerKey(registryKey, address, sale.saleKeys.nostr.publicKey),
      address,
      createdAt: NOW
    });
    relays.stored.set(REGISTRY_RELAYS[0], [misplaced]);
    expect(await fetchDeclaredInvoices(sale, "bc")).toEqual([]);
    relays.stored.set(REGISTRY_RELAYS[0], [event]);
    expect(await fetchDeclaredInvoices(sale, "bc")).toHaveLength(1);
  });

  it("is null without a majority of answers: a declaration could be missing", async () => {
    const sale = registry(1);
    await declareInvoice(sale, invoice(1), SALE);
    for (const relay of REGISTRY_RELAYS.slice(0, 3)) relays.unreachable.add(relay);
    expect(await fetchDeclaredInvoices(sale, "bc")).toBeNull();
    relays.unreachable.delete(REGISTRY_RELAYS[0]);
    expect(await fetchDeclaredInvoices(sale, "bc")).toHaveLength(1);
  });
});

describe("paymentUniqueness", () => {
  it("is unique when only the sale declared the payment", async () => {
    const sale = registry(1);
    await declareInvoice(sale, invoice(1), SALE);
    expect(await paymentUniqueness(sale, preimagePair(1).paymentHash)).toBe("unique");
  });

  it("is a conflict when another sale declared the same payment", async () => {
    const sale = registry(1);
    await declareInvoice(sale, invoice(1), SALE);
    await declareInvoice(registry(2), invoice(1), SALE);
    expect(await paymentUniqueness(sale, preimagePair(1).paymentHash)).toBe("conflict");
    expect(await paymentUniqueness(registry(2), preimagePair(1).paymentHash)).toBe("conflict");
  });

  it("meets an earlier declaration on any majority of the relays", async () => {
    const sale = registry(1);
    // Declared on relays 0–2 only.
    for (const relay of REGISTRY_RELAYS.slice(3)) relays.unreachable.add(relay);
    await declareInvoice(sale, invoice(1), SALE);
    relays.unreachable.clear();
    // The other sale reads relays 2–4: relay 2 holds the first declaration.
    for (const relay of REGISTRY_RELAYS.slice(0, 2)) relays.unreachable.add(relay);
    await declareInvoice(registry(2), invoice(1), SALE);
    expect(await paymentUniqueness(registry(2), preimagePair(1).paymentHash)).toBe("conflict");
  });

  it("never takes for a declaration what anyone who saw d(H) could publish there", async () => {
    const sale = registry(1);
    const lightning = invoice(1);
    await declareInvoice(sale, lightning, SALE);
    const address = registryAddress(registryKey, lightning.decoded.paymentHash);
    const stranger = new Uint8Array(32).fill(42);
    const strangerKey = nostrKeys(stranger).publicKey;
    const { sealRecord } =
      jest.requireActual<typeof import("@/lib/nostr/record")>("@/lib/nostr/record");
    const forged = [
      // Anything at the address, signed by a throwaway key: a relay, or anyone watching them.
      signEvent({ kind: 30078, created_at: NOW, tags: [["d", address]], content: "" }, stranger),
      // Content of a newer NIP-44 version: nothing to open.
      signEvent({ kind: 30078, created_at: NOW, tags: [["d", address]], content: "#x" }, stranger),
      // The sale's own declaration, its content copied under the throwaway key.
      signEvent(
        {
          kind: 30078,
          created_at: NOW,
          tags: [["d", address]],
          content: declarationEvent(sale, lightning, SALE, NOW).content
        },
        stranger
      ),
      // Sealed with a key of its own, for the throwaway author.
      sealRecord({
        type: "registry-declaration",
        value: { sealed: "x" },
        signer: stranger,
        encryptionKey: outerKey(new Uint8Array(32).fill(8), address, strangerKey),
        address,
        createdAt: NOW
      })
    ];
    for (const relay of REGISTRY_RELAYS) {
      relays.stored.set(relay, [...(relays.stored.get(relay) ?? []), ...forged]);
    }
    expect(await paymentUniqueness(sale, lightning.decoded.paymentHash)).toBe("unique");

    // Whoever holds the registry key can declare it for another sale: the payment counts for none.
    const other = sealRecord({
      type: "registry-declaration",
      value: { sealed: "x" },
      signer: stranger,
      encryptionKey: outerKey(registryKey, address, strangerKey),
      address,
      createdAt: NOW
    });
    relays.stored.set(REGISTRY_RELAYS[0], [
      ...(relays.stored.get(REGISTRY_RELAYS[0]) ?? []),
      other
    ]);
    expect(await paymentUniqueness(sale, lightning.decoded.paymentHash)).toBe("conflict");
  });

  /** `count` events at d(H) of `paymentHash`, each of its own throwaway author, on every relay. */
  function floodAt(paymentHash: string, count: number, createdAt: (i: number) => number) {
    const address = registryAddress(registryKey, paymentHash);
    const flood = Array.from({ length: count }, (_, i) =>
      signEvent(
        { kind: 30078, created_at: createdAt(i), tags: [["d", address]], content: "" },
        new Uint8Array(32).fill(100 + (i % 150)).map((byte, at) => (at === 0 ? i >> 8 : byte))
      )
    );
    for (const relay of REGISTRY_RELAYS) {
      relays.stored.set(relay, [...(relays.stored.get(relay) ?? []), ...flood]);
    }
  }

  // More than UNIQUENESS_READ_LIMIT events at d(H), which anyone who saw it can publish, would
  // hold the point of sale on "checking" for good.
  it("reads past what anyone published at d(H), page after page", async () => {
    const sale = registry(1);
    const lightning = invoice(1);
    await declareInvoice(sale, lightning, SALE);
    const now = Math.floor(Date.now() / 1000);
    // More than a relay sends at once, each second its own.
    floodAt(lightning.decoded.paymentHash, relays.MAX_EVENTS_PER_FILTER * 3, (i) => now + 60 + i);
    expect(await paymentUniqueness(sale, lightning.decoded.paymentHash)).toBe("unique");
  });

  it("never lets what anyone published at d(H) push a declaration out", async () => {
    const lightning = invoice(1);
    // Declared for two sales: it counts for neither.
    await declareInvoice(registry(1), lightning, SALE);
    await declareInvoice(registry(2), lightning, SALE);
    const now = Math.floor(Date.now() / 1000);
    floodAt(lightning.decoded.paymentHash, relays.MAX_EVENTS_PER_FILTER * 3, (i) => now + 60 + i);
    expect(await paymentUniqueness(registry(1), lightning.decoded.paymentHash)).toBe("conflict");
  });

  it("never says unique when a second at d(H) holds more than a relay sends at once", async () => {
    const lightning = invoice(1);
    await declareInvoice(registry(1), lightning, SALE);
    await declareInvoice(registry(2), lightning, SALE);
    // All of one second: a relay cannot page through them, the other declaration may be out.
    const second = Math.floor(Date.now() / 1000) + 60;
    floodAt(lightning.decoded.paymentHash, relays.MAX_EVENTS_PER_FILTER + 1, () => second);
    expect(await paymentUniqueness(registry(1), lightning.decoded.paymentHash)).toBe("unknown");
  });

  it("is unknown without a majority of answers", async () => {
    const sale = registry(1);
    await declareInvoice(sale, invoice(1), SALE);
    for (const relay of REGISTRY_RELAYS.slice(0, 3)) relays.unreachable.add(relay);
    expect(await paymentUniqueness(sale, preimagePair(1).paymentHash)).toBe("unknown");
  });
});

describe("ownerDeclarations", () => {
  const owner = { key: registryKey, reader: READER };

  it("gives the owner every sale that declared a payment, with its key, amount and note", async () => {
    await declareInvoice(registry(1), invoice(1), SALE);
    await declareInvoice(registry(2), invoice(1), { ...SALE, note: "" });

    const found = await ownerDeclarations(owner, preimagePair(1).paymentHash, "bc");
    expect(found).toHaveLength(2);
    const first = found!.find(({ author }) => author === registry(1).saleKeys.nostr.publicKey);
    expect(first?.invoice.decoded.paymentHash).toBe(preimagePair(1).paymentHash);
    expect(bytesToHex(first!.saleKey)).toBe("01".repeat(32));
    expect(first?.fiat).toEqual(SALE.fiat);
    expect(first?.note).toBe("Table 12");
    const second = found!.find(({ author }) => author === registry(2).saleKeys.nostr.publicKey);
    expect(bytesToHex(second!.saleKey)).toBe("02".repeat(32));
    expect(second?.note).toBe("");
    // Nothing declared there.
    expect(await ownerDeclarations(owner, preimagePair(2).paymentHash, "bc")).toEqual([]);
  });

  it("leaves out a declaration naming another sale than the one that signed it", async () => {
    // Signed by sale 2, saying it is sale 1's: whoever holds sale 2's link cannot speak for sale 1.
    const forged = declarationEvent(
      { ...registry(2), saleKey: registry(1).saleKey },
      invoice(1),
      SALE
    );
    for (const relay of REGISTRY_RELAYS) relays.stored.set(relay, [forged]);
    expect(await ownerDeclarations(owner, preimagePair(1).paymentHash, "bc")).toEqual([]);

    await declareInvoice(registry(1), invoice(1), SALE);
    const found = await ownerDeclarations(owner, preimagePair(1).paymentHash, "bc");
    expect(found?.map(({ author }) => author)).toEqual([registry(1).saleKeys.nostr.publicKey]);
  });

  it("opens with the business's reading key only: neither another key nor another sale", async () => {
    await declareInvoice(registry(1), invoice(1), SALE);
    // Another business's reading key, at the same address.
    const other = { key: registryKey, reader: nostrKeys(new Uint8Array(32).fill(10)) };
    expect(await ownerDeclarations(other, preimagePair(1).paymentHash, "bc")).toEqual([]);
    // Another sale's holder (a payment link) reads only its own sale's declarations.
    const event = relays.stored.get(REGISTRY_RELAYS[0])![0];
    const { openRecord } =
      jest.requireActual<typeof import("@/lib/nostr/record")>("@/lib/nostr/record");
    const otherSale = registry(2);
    expect(
      openRecord(event, {
        type: "registry-declaration",
        encryptionKey: conversationKey(otherSale.saleKeys.nostr.secretKey, READER.publicKey),
        address: () => true,
        parse: (value) => value
      })
    ).toBeNull();
  });

  it("is null without a majority of answers", async () => {
    await declareInvoice(registry(1), invoice(1), SALE);
    for (const relay of REGISTRY_RELAYS.slice(0, 3)) relays.unreachable.add(relay);
    expect(await ownerDeclarations(owner, preimagePair(1).paymentHash, "bc")).toBeNull();
  });

  // Anyone who saw d(H) can publish there, newer than the declaration, more than a relay sends at
  // once: "Wallet" would lose the payment's sale.
  it("reads past what anyone published at d(H), page after page", async () => {
    await declareInvoice(registry(1), invoice(1), SALE);
    const address = registryAddress(registryKey, preimagePair(1).paymentHash);
    const now = Math.floor(Date.now() / 1000);
    const flood = Array.from({ length: relays.MAX_EVENTS_PER_FILTER * 3 }, (_, i) =>
      signEvent(
        { kind: 30078, created_at: now + 60 + i, tags: [["d", address]], content: "" },
        new Uint8Array(32).fill(100 + (i % 150)).map((byte, at) => (at === 0 ? i >> 8 : byte))
      )
    );
    for (const relay of REGISTRY_RELAYS) {
      relays.stored.set(relay, [...(relays.stored.get(relay) ?? []), ...flood]);
    }
    const found = await ownerDeclarations(owner, preimagePair(1).paymentHash, "bc");
    expect(found?.map(({ author }) => author)).toEqual([registry(1).saleKeys.nostr.publicKey]);
  });

  it("asks a first page no longer than any relay sends at once", () => {
    expect(OWNER_READ_LIMIT).toBeLessThanOrEqual(PAGE_FLOOR);
  });
  it("tells who took the sale when its declaration says it, in a form only its taker makes", async () => {
    const takerKey = new Uint8Array(32).fill(21);
    const sale = registry(1);
    const tag = takerTag(takerKey, sale.saleKeys.nostr.publicKey);
    // An HMAC of the sale's identity: another sale, another key, another mark.
    expect(tag).toMatch(/^[0-9a-f]{32}$/);
    expect(takerTag(takerKey, registry(2).saleKeys.nostr.publicKey)).not.toBe(tag);
    expect(takerTag(new Uint8Array(32).fill(22), sale.saleKeys.nostr.publicKey)).not.toBe(tag);
    await declareInvoice(saleRegistry(sale, sale.saleKey, undefined, tag), invoice(1), SALE);
    // Unmarked, as an older app declares.
    await declareInvoice(registry(2), invoice(2), SALE);

    const [marked] = (await ownerDeclarations(owner, preimagePair(1).paymentHash, "bc"))!;
    expect(marked?.taker).toBe(tag);
    const [unmarked] = (await ownerDeclarations(owner, preimagePair(2).paymentHash, "bc"))!;
    expect(unmarked?.taker).toBeNull();
    // The relays never see it.
    const event = relays.stored.get(REGISTRY_RELAYS[0])![0]!;
    expect(JSON.stringify(event)).not.toContain(tag);
    // The sale's own reads (the point of sale, the payer's page) take the declaration as before.
    const found = await fetchDeclaredInvoices(sale, "bc");
    expect(found?.map(({ decoded }) => decoded.paymentHash)).toEqual([preimagePair(1).paymentHash]);
  });

  it("leaves a mark not in its form aside, the declaration still read", async () => {
    const sale = { ...registry(1), taker: "not a mark" };
    await declareInvoice(sale, invoice(1), SALE);
    const [found] = (await ownerDeclarations(owner, preimagePair(1).paymentHash, "bc"))!;
    expect(found?.note).toBe("Table 12");
    expect(found?.taker).toBeNull();
  });
});

describe("checkDeclaredInvoice", () => {
  it("accepts an invoice of the merchant's address, ending within its point's period", () => {
    expect(checkDeclaredInvoice(invoice(1), PAY, "bc")).toBe(true);
    // Ending exactly at the end of its point's period (14:05), judged on its own date: no clock.
    expect(checkDeclaredInvoice(invoice(1, { expirySeconds: PERIOD_END - NOW }), PAY, "bc")).toBe(
      true
    );
  });

  it("refuses anything else", () => {
    // Another merchant's description.
    expect(checkDeclaredInvoice(invoice(1, { descriptionHash: "00".repeat(32) }), PAY, "bc")).toBe(
      false
    );
    // Verified by another server, which could say anything.
    expect(
      checkDeclaredInvoice({ ...invoice(1), verifyUrl: "https://evil.example/verify/x" }, PAY, "bc")
    ).toBe(false);
    // Another network.
    expect(checkDeclaredInvoice(invoice(1, { network: "tb" }), PAY, "bc")).toBe(false);
    // A second past its point's period (14:05): a rate held longer than its period, no tolerance.
    expect(
      checkDeclaredInvoice(invoice(1, { expirySeconds: PERIOD_END - NOW + 1 }), PAY, "bc")
    ).toBe(false);
    // A fraction of a sat.
    expect(checkDeclaredInvoice(invoice(1, { amountMsat: 10_000_500n }), PAY, "bc")).toBe(false);
  });
});

describe("datedForSale", () => {
  it("takes an invoice within the sale, a minute either side between the clocks", () => {
    // Ten minutes, dated now.
    const tenMinutes = invoice(1, { expirySeconds: 600 });
    // From the sale's start: an older invoice, paid for another sale, never counts for this one.
    expect(datedForSale(tenMinutes, NOW - 30, NOW + 600)).toBe(true);
    expect(datedForSale(tenMinutes, NOW + 60, NOW + 600)).toBe(true);
    expect(datedForSale(tenMinutes, NOW + 61, NOW + 600)).toBe(false);
    // Ending by the sale's end, as every invoice of the sale does (a sale's time never changes): a
    // later one would keep it waiting.
    expect(datedForSale(tenMinutes, NOW - 60, NOW + 540)).toBe(true);
    expect(datedForSale(tenMinutes, NOW - 60, NOW + 539)).toBe(false);
    // An invoice until the end of its point's period, past a sale of ten minutes.
    expect(datedForSale(invoice(1), NOW - 30, NOW + 570)).toBe(false);
    // Instants, whatever the day: a sale started at 23:59:50 takes an invoice dated 00:00:10 the
    // next day (23:00's point, until 00:05:00).
    expect(
      datedForSale(
        invoice(1, { timestamp: MIDNIGHT + 10, expirySeconds: 290 }),
        MIDNIGHT - 10,
        MIDNIGHT + 590
      )
    ).toBe(true);
  });
});

describe("with relays that stay connected without answering", () => {
  // No read waits for every relay.
  const pairs = REGISTRY_RELAYS.flatMap((a, i) =>
    REGISTRY_RELAYS.slice(i + 1).map((b): [string, string] => [a, b])
  );

  /** Runs `promise` on fake timers: its value, and how long (fake ms) it took to settle. */
  async function timed<T>(promise: Promise<T>): Promise<{ value: T; ms: number }> {
    const startedAt = Date.now();
    let settled: { value: T } | null = null;
    void promise.then((value) => {
      settled = { value };
    });
    while (settled === null) {
      if (Date.now() - startedAt > 10 * REGISTRY_TIMEOUT_MS) throw new Error("Never settled");
      await jest.advanceTimersByTimeAsync(10);
    }
    return { value: (settled as { value: T }).value, ms: Date.now() - startedAt };
  }

  beforeEach(() => {
    jest.useFakeTimers({ now: Date.now(), doNotFake: ["queueMicrotask", "nextTick"] });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("find a payment unique, and its sale's invoices, without waiting for a silent relay", async () => {
    const sale = registry(1);
    await timed(declareInvoice(sale, invoice(1), SALE));
    relays.silent.add(REGISTRY_RELAYS[2]);

    const unique = await timed(paymentUniqueness(sale, preimagePair(1).paymentHash));
    expect(unique.value).toBe("unique");
    expect(unique.ms).toBeLessThan(REGISTRY_TIMEOUT_MS);

    const declared = await timed(fetchDeclaredInvoices(sale, "bc"));
    expect(declared.value).toHaveLength(1);
    expect(declared.ms).toBeLessThan(REGISTRY_TIMEOUT_MS);
  });

  it("find another sale's declaration a majority took, whichever two relays stay quiet", async () => {
    const sale = registry(1);
    await timed(declareInvoice(sale, invoice(1), SALE));
    // The other sale's declaration reaches three relays of five.
    for (const relay of REGISTRY_RELAYS.slice(3)) relays.unreachable.add(relay);
    await timed(declareInvoice(registry(2), invoice(1), SALE));
    relays.unreachable.clear();
    for (const [silent, mute] of pairs) {
      relays.silent.clear();
      relays.latency.clear();
      relays.silent.add(silent);
      relays.latency.set(mute, Infinity);
      const { value, ms } = await timed(paymentUniqueness(sale, preimagePair(1).paymentHash));
      expect(value).toBe("conflict");
      expect(ms).toBeLessThan(REGISTRY_TIMEOUT_MS);
    }
  });

  it("is unknown, never unique, without a majority's answers", async () => {
    const sale = registry(1);
    await timed(declareInvoice(sale, invoice(1), SALE));
    for (const relay of REGISTRY_RELAYS.slice(2)) relays.silent.add(relay);
    const { value, ms } = await timed(paymentUniqueness(sale, preimagePair(1).paymentHash));
    expect(value).toBe("unknown");
    expect(ms).toBeGreaterThanOrEqual(REGISTRY_TIMEOUT_MS);
    expect((await timed(fetchDeclaredInvoices(sale, "bc"))).value).toBeNull();
  });

  it("read the relays cut at the limit only until a majority of whole answers", async () => {
    const sale = registry(1);
    await timed(declareInvoice(sale, invoice(1), SALE));
    const address = registryAddress(registryKey, preimagePair(1).paymentHash);
    // Two relays hold more events at d(H) than a first read asks for: anyone may publish there.
    const flood = Array.from({ length: UNIQUENESS_READ_LIMIT + 5 }, (_, n) =>
      signEvent(
        { kind: 30078, created_at: NOW + n, tags: [["d", address]], content: "" },
        new Uint8Array(32).fill(40 + n)
      )
    );
    for (const relay of REGISTRY_RELAYS.slice(0, 2)) {
      relays.stored.set(relay, [...(relays.stored.get(relay) ?? []), ...flood]);
    }
    // One relay whole, two cut, two silent: the cut ones are paged until one more is whole.
    for (const relay of REGISTRY_RELAYS.slice(3)) relays.silent.add(relay);
    const { value, ms } = await timed(paymentUniqueness(sale, preimagePair(1).paymentHash));
    // Whole answers: 1 + 2 paged = 3 of 5, without waiting for the silent ones.
    expect(value).toBe("unique");
    expect(ms).toBeLessThan(REGISTRY_TIMEOUT_MS);
    const paged = relays.calls.filter(
      ({ operation, filter }) => operation === "query" && filter?.limit === undefined
    );
    expect(new Set(paged.map(({ relay }) => relay))).toEqual(new Set(REGISTRY_RELAYS.slice(0, 2)));

    // One of the two cut relays silent at its pages too: no majority of whole answers.
    relays.calls.length = 0;
    relays.silentAuthors.clear();
    const real = relays.queryEvents;
    jest
      .spyOn(relays, "queryEvents")
      .mockImplementation((url, filter, options) =>
        url === REGISTRY_RELAYS[1] && filter.limit === undefined
          ? new Promise((_, reject) =>
              setTimeout(() => reject(new Error("timeout")), options.timeoutMs)
            )
          : real(url, filter, options)
      );
    const unknown = await timed(paymentUniqueness(sale, preimagePair(1).paymentHash));
    expect(unknown.value).toBe("unknown");
  });
});
