import { bytesToHex } from "@noble/hashes/utils.js";

import { DEFAULT_RELAYS as REGISTRY_RELAYS } from "@/config/relays";
import { signEvent } from "@/lib/nostr/event";
import { nostrKeys } from "@/lib/nostr/keys";
import { nip44Encrypt } from "@/lib/nostr/nip44";
import { sealRecord } from "@/lib/nostr/record";
import {
  ONCHAIN_PAYMENT_DECLARATIONS,
  declareOnchainPayment,
  onchainPaymentAddress,
  onchainPaymentEvent,
  ownerOnchainPaymentsOf
} from "@/lib/registry/onchain-payments";
import {
  copyDeclarations,
  declarationKey,
  fetchDeclaredInvoices,
  outerKey,
  registryAddress,
  saleRegistry,
  takerTag,
  type DeclaredSale,
  type Registry
} from "@/lib/registry/registry";

import { taprootAddress } from "../../jest/bitcoin";
import type * as RelaysFake from "../../jest/nostr-relays";

/*
 * The registry's declarations of the point of sale's on-chain payments (onchain-payments.ts): a
 * deposit's transaction tells its sale for good, as a payment hash does.
 */

const relays = jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");

const registryKey = new Uint8Array(32).fill(7);
/** The business's reading key: the owner's (deriveRegistryReader). */
const READER = nostrKeys(new Uint8Array(32).fill(9));
const OWNER = nostrKeys(new Uint8Array(32).fill(11)).publicKey;
const registry = (saleByte: number, taker?: string): Registry =>
  saleRegistry(
    { key: registryKey, reader: READER.publicKey, owner: OWNER },
    new Uint8Array(32).fill(saleByte),
    undefined,
    taker
  );
const SALE: DeclaredSale = { fiat: { minor: 200, digits: 2, currency: "CHF" }, note: "Table 4" };
const TX = (n: number) => n.toString(16).padStart(64, "0");
const ADDRESS = taprootAddress(1);
const owner = { key: registryKey, reader: READER };
const NOW = 1_790_000_000;

beforeEach(() => relays.resetRelays());

describe("the declarations of on-chain payments", () => {
  it("are at an address only the transaction and the registry key give, which never changes", () => {
    // HMAC-SHA256(registry key, "onchain-payment/v1/<txid>"), computed independently with Python's
    // hmac and hashlib.
    expect(onchainPaymentAddress(registryKey, TX(1))).toBe(
      "157c443dd26e0a1d0c64521815a96b49092847c61ca5cb83a3659a1dd953f41b"
    );
    expect(onchainPaymentAddress(new Uint8Array(32).fill(0xcd), "ab".repeat(32))).toBe(
      "ed348fdd851609c894adf0e1f5724c86faff882c9825c41b601dbc4b1b4536e8"
    );
    expect(onchainPaymentAddress(registryKey, TX(2))).not.toBe(
      onchainPaymentAddress(registryKey, TX(1))
    );
    // Never a Lightning payment's d(H), whatever the hex.
    expect(onchainPaymentAddress(registryKey, TX(1))).not.toBe(registryAddress(registryKey, TX(1)));
  });

  it("are signed by the sale, sealed, without end: the relays see neither transaction nor address", () => {
    const sale = registry(1);
    const event = onchainPaymentEvent(sale, { txid: TX(1), address: ADDRESS }, SALE, NOW);
    expect(event.kind).toBe(30078);
    expect(event.pubkey).toBe(sale.saleKeys.nostr.publicKey);
    expect(event.tags).toContainEqual(["d", onchainPaymentAddress(registryKey, TX(1))]);
    expect(event.tags.some(([name]) => name === "expiration")).toBe(false);
    expect(JSON.stringify(event)).not.toContain(TX(1));
    expect(JSON.stringify(event)).not.toContain(ADDRESS);
    expect(() => onchainPaymentEvent(sale, { txid: "nope", address: ADDRESS }, SALE)).toThrow();
  });

  it("are declared once a majority of the relays took them, and only then", async () => {
    await expect(
      declareOnchainPayment(registry(1), { txid: TX(1), address: ADDRESS }, SALE)
    ).resolves.toBeUndefined();
    for (const relay of REGISTRY_RELAYS.slice(0, 3)) relays.readOnly.add(relay);
    await expect(
      declareOnchainPayment(registry(1), { txid: TX(2), address: ADDRESS }, SALE)
    ).rejects.toBeDefined();
  });

  it("leave the sale's own reads of its invoices as they were", async () => {
    const sale = registry(1);
    await declareOnchainPayment(sale, { txid: TX(1), address: ADDRESS }, SALE);
    await expect(fetchDeclaredInvoices(sale, "bc")).resolves.toEqual([]);
  });
});

describe("ownerOnchainPaymentsOf", () => {
  it("gives the owner each sale that declared a transaction, with its key, amount, note and mark", async () => {
    const tag = takerTag(new Uint8Array(32).fill(21), registry(1).saleKeys.nostr.publicKey);
    await declareOnchainPayment(registry(1, tag), { txid: TX(1), address: ADDRESS }, SALE);
    // Another sale declaring the same transaction: both are given (it counts for none).
    await declareOnchainPayment(
      registry(2),
      { txid: TX(1), address: taprootAddress(2) },
      { ...SALE, note: "" }
    );
    const read = await ownerOnchainPaymentsOf(owner, [TX(1), TX(3)], "bc");
    expect(read?.newer).toEqual(new Set());
    const found = read!.declared.get(TX(1))!;
    expect(found).toHaveLength(2);
    const first = found.find(({ author }) => author === registry(1).saleKeys.nostr.publicKey)!;
    expect(first).toMatchObject({
      txid: TX(1),
      address: ADDRESS,
      fiat: SALE.fiat,
      note: "Table 4",
      taker: tag
    });
    expect(bytesToHex(first.saleKey)).toBe("01".repeat(32));
    expect(found.find(({ author }) => author !== first.author)?.taker).toBeNull();
    // Nothing declared there.
    expect(read!.declared.get(TX(3))).toEqual([]);
  });

  it("is no declaration of the business unless the registry key, the sale and the transaction say so", async () => {
    const sale = registry(1);
    const d = onchainPaymentAddress(registryKey, TX(1));
    const inside = (txid: string, address = ADDRESS, key = "01".repeat(32)) =>
      JSON.stringify({ version: 1, txid, address, sale: { key, ...SALE } });
    const forged = (
      content: string,
      outer = outerKey(registryKey, d, sale.saleKeys.nostr.publicKey)
    ) =>
      sealRecord({
        type: "registry-onchain-payment",
        value: { sealed: nip44Encrypt(content, declarationKey(sale)) },
        signer: sale.saleKeys.nostr.secretKey,
        encryptionKey: outer,
        address: d,
        createdAt: NOW
      });
    const cases = [
      // Sealed outside without the registry key.
      forged(inside(TX(1)), outerKey(new Uint8Array(32).fill(8), d, sale.saleKeys.nostr.publicKey)),
      // Another transaction's declaration, filed at this one's address.
      forged(inside(TX(2))),
      // An address of another network.
      forged(inside(TX(1), taprootAddress(1, "tb"))),
      // Naming another sale than the one that signed it.
      forged(inside(TX(1), ADDRESS, "02".repeat(32)))
    ];
    for (const event of cases) {
      relays.resetRelays();
      for (const relay of REGISTRY_RELAYS) relays.stored.set(relay, [event]);
      expect((await ownerOnchainPaymentsOf(owner, [TX(1)], "bc"))?.declared.get(TX(1))).toEqual([]);
    }
    // Another business's reading key opens nothing.
    relays.resetRelays();
    await declareOnchainPayment(sale, { txid: TX(1), address: ADDRESS }, SALE);
    const other = { key: registryKey, reader: nostrKeys(new Uint8Array(32).fill(10)) };
    expect((await ownerOnchainPaymentsOf(other, [TX(1)], "bc"))?.declared.get(TX(1))).toEqual([]);
  });

  it("leaves a transaction a newer format may claim to a newer app", async () => {
    const sale = registry(2);
    const d = onchainPaymentAddress(registryKey, TX(1));
    const newer = sealRecord({
      type: "registry-onchain-payment",
      value: {
        sealed: nip44Encrypt(JSON.stringify({ version: 2, txid: TX(1) }), declarationKey(sale))
      },
      signer: sale.saleKeys.nostr.secretKey,
      encryptionKey: outerKey(registryKey, d, sale.saleKeys.nostr.publicKey),
      address: d,
      createdAt: NOW
    });
    for (const relay of REGISTRY_RELAYS) relays.stored.set(relay, [newer]);
    await declareOnchainPayment(registry(1), { txid: TX(1), address: ADDRESS }, SALE);
    const read = await ownerOnchainPaymentsOf(owner, [TX(1)], "bc");
    expect(read?.newer).toEqual(new Set([TX(1)]));
    expect(read?.declared.get(TX(1))?.map(({ author }) => author)).toEqual([
      registry(1).saleKeys.nostr.publicKey
    ]);
  });

  it("takes for no declaration a content of a newer NIP-44 version anybody publishes at d(T)", async () => {
    // Anybody who saw d(T) on a relay, under a key of their own: it would have the deposit read
    // again for good.
    const d = onchainPaymentAddress(registryKey, TX(1));
    const stranger = new Uint8Array(32).fill(42);
    const forged = signEvent(
      { kind: 30078, created_at: NOW, tags: [["d", d]], content: "#future" },
      stranger
    );
    for (const relay of REGISTRY_RELAYS) relays.stored.set(relay, [forged]);
    await declareOnchainPayment(registry(1), { txid: TX(1), address: ADDRESS }, SALE);
    const read = await ownerOnchainPaymentsOf(owner, [TX(1)], "bc");
    expect(read?.newer).toEqual(new Set());
    expect(read?.declared.get(TX(1))?.map(({ author }) => author)).toEqual([
      registry(1).saleKeys.nostr.publicKey
    ]);
  });

  it("is null without a majority of answers", async () => {
    await declareOnchainPayment(registry(1), { txid: TX(1), address: ADDRESS }, SALE);
    for (const relay of REGISTRY_RELAYS.slice(0, 3)) relays.unreachable.add(relay);
    await expect(ownerOnchainPaymentsOf(owner, [TX(1)], "bc")).resolves.toBeNull();
  });

  it("are copied to a new list of relays as they are, with the declarations of payments", async () => {
    const OLD = REGISTRY_RELAYS.slice(0, 3);
    const NEW = ["wss://relay.example.org", "wss://relay.example.net", REGISTRY_RELAYS[0]!];
    await declareOnchainPayment(registry(1), { txid: TX(1), address: ADDRESS }, SALE, {
      relays: OLD
    });
    const copy = await copyDeclarations(
      () => owner,
      [TX(1)],
      "bc",
      OLD,
      NEW,
      undefined,
      ONCHAIN_PAYMENT_DECLARATIONS
    );
    expect(copy).toEqual({ found: 1, held: 1, unread: 0 });
    const read = await ownerOnchainPaymentsOf(owner, [TX(1)], "bc", { relays: NEW });
    expect(read?.declared.get(TX(1))?.map(({ address }) => address)).toEqual([ADDRESS]);
  });
});
