import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils.js";

import { readDeclarations } from "@/features/activity/load";
import { encodeWalletSecret } from "@/lib/breez/secret";
import {
  deriveIntegrationKeys,
  formatIntegrationKey,
  parseIntegrationKey
} from "@/lib/integrations/keys";
import type { NostrEvent } from "@/lib/nostr/event";
import { conversationKey, nip44Decrypt } from "@/lib/nostr/nip44";
import {
  deriveSaleKeys,
  outerKey,
  ownerDeclarations,
  paymentUniqueness,
  registryAddress,
  saleRegistry,
  takerTag
} from "@/lib/registry/registry";
import { currentRelays } from "@/lib/relays/current";
import { fetchChannel } from "@/lib/team/channel";
import { deriveBusinessRegistry, deriveRegistryReader, deriveTeamKeys } from "@/lib/team/keys";

import packageVector from "./fixtures/checkout-spec/implementation-declaration.json";
import vectors from "./fixtures/checkout-spec/app.json";
import type * as RelaysFake from "../../jest/nostr-relays";

// The integration's sales are "bc" invoices (the app config has no network under Jest).
jest.mock("../lib/breez/config", () => ({
  ...jest.requireActual("../lib/breez/config"),
  getBreezNetwork: () => "mainnet"
}));

/*
 * The app's half of the integrations' cross-check (docs/integrations.md): the vectors an
 * integration's server (the npm package @sattleme/checkout, sattleme/checkout-node)
 * is tested against are the app's (checkout-spec's vectors/app/app.json). Its secret key, its
 * channel and a declaration it makes read here as the app reads them; and a declaration the
 * package made (src/__tests__/fixtures/checkout-spec/implementation-declaration.json, checkout-spec's
 * vectors/app/implementation-declaration.json) reads here as the owner and as another sale read
 * it. A change on either side breaks one of the two test suites.
 */

const relays = jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");

// The BIP-39 test mnemonic (all-zero entropy) the vectors were made with, never a real wallet's.
const MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const team = deriveTeamKeys(encodeWalletSecret({ mnemonic: MNEMONIC }));
const INTEGRATION = "0123456789abcdef0123456789abcdef";
const { declaration } = vectors;

beforeEach(() => relays.resetRelays());

describe("the integrations' vectors", () => {
  it("hold the app's secret key, its keys and its business registry", () => {
    const access = parseIntegrationKey(vectors.secretKey);
    expect(access && { ...access, key: bytesToHex(access.key) }).toEqual({
      teamPublicKey: vectors.parsed.team,
      key: vectors.parsed.integrationKey,
      relays: vectors.parsed.relays
    });
    expect(vectors.parsed.team).toBe(team.publicKey);
    // The text the app writes for them, its prefix included.
    expect(formatIntegrationKey(access!)).toBe(vectors.secretKey);
    const keys = deriveIntegrationKeys(hexToBytes(vectors.parsed.integrationKey));
    expect({
      channelAddress: keys.channel.address,
      channelEncryptionKey: bytesToHex(keys.channel.encryptionKey),
      takerKey: bytesToHex(keys.takerKey)
    }).toEqual(vectors.derived);
    const business = deriveBusinessRegistry(team);
    expect(bytesToHex(business.key)).toBe(vectors.channel.value.v.registryKey);
    expect(business.reader).toBe(vectors.channel.value.v.registryReader);
  });

  it("give the Lightning witnesses' keys of checkout-spec (SPEC.md §32, lightning-witnesses.json)", () => {
    // The `derived` of checkout-spec's vectors/lightning-witnesses.json, for the same integration key.
    const keys = deriveIntegrationKeys(hexToBytes(vectors.parsed.integrationKey));
    expect({
      paidSecret: bytesToHex(keys.paid.nostr.secretKey),
      paidAuthor: keys.paid.nostr.publicKey,
      paidAddressKey: bytesToHex(keys.paid.addressKey)
    }).toEqual({
      paidSecret: "6632b3f3d43aa03da4ed991f0e36eca9a37f301af218b6eb8fba8c0956868e22",
      paidAuthor: "45837444a0f1b6444272862a106fa00b19b53fe8354bea87792b0978b9bb69a0",
      paidAddressKey: "42d69f0747c986134068e3ed12c78d3fe4ea6d716b7c09d3de481ebe1a1beb70"
    });
  });

  it("hold a channel the app made, which the integration's key alone reads", async () => {
    const keys = deriveIntegrationKeys(hexToBytes(vectors.parsed.integrationKey));
    // Its content is exactly the vector's `value` (then spaces): what a server decrypts.
    expect(
      JSON.parse(nip44Decrypt(vectors.channel.event.content, keys.channel.encryptionKey))
    ).toEqual(vectors.channel.value);
    relays.stored.set("wss://relay.example", [vectors.channel.event as NostrEvent]);
    const found = await fetchChannel(team.publicKey, keys, 1000, vectors.parsed.relays);
    expect(found).toEqual({ status: "found", channel: vectors.channel.value.v });
  });

  it("hold a declaration of the order's sale, as its server makes it", () => {
    const key = hexToBytes(vectors.parsed.integrationKey);
    // The order's sale: its key from the integration's and the `ref` (the server's alone).
    const saleKey = hkdf(
      sha256,
      key,
      utf8ToBytes("sattle.me/integration"),
      utf8ToBytes(`sale/${declaration.ref}/v1`),
      32
    );
    expect(bytesToHex(saleKey)).toBe(declaration.saleKey);
    const saleKeys = deriveSaleKeys(saleKey);
    expect(bytesToHex(saleKeys.nostr.secretKey)).toBe(declaration.saleSecret);
    expect(saleKeys.nostr.publicKey).toBe(declaration.saleAuthor);
    expect(takerTag(deriveIntegrationKeys(key).takerKey, declaration.saleAuthor)).toBe(
      declaration.taker
    );
    const business = deriveBusinessRegistry(team);
    expect(registryAddress(business.key, declaration.paymentHash)).toBe(declaration.address);
    expect(bytesToHex(outerKey(business.key, declaration.address, declaration.saleAuthor))).toBe(
      declaration.outerKey
    );
    expect(bytesToHex(conversationKey(saleKeys.nostr.secretKey, business.reader))).toBe(
      declaration.innerConversationKey
    );
  });

  it("hold a declaration the owner reads: the sale, its price, its note, the integration", async () => {
    for (const relay of vectors.parsed.relays) {
      relays.stored.set(relay, [declaration.event as NostrEvent]);
    }
    const owner = { key: deriveBusinessRegistry(team).key, reader: deriveRegistryReader(team) };
    const [opened] =
      (await ownerDeclarations(owner, declaration.paymentHash, "bc", {
        relays: vectors.parsed.relays
      })) ?? [];
    expect(opened).toMatchObject({
      author: declaration.saleAuthor,
      fiat: declaration.fiat,
      note: declaration.note,
      taker: declaration.taker,
      invoice: { pr: declaration.invoice, verifyUrl: declaration.verifyUrl }
    });
    expect(bytesToHex(opened!.saleKey)).toBe(declaration.saleKey);
  });

  it('name the integration in "Wallet" by its mark', async () => {
    // readDeclarations reads the device's relays: the vectors' declaration on each of them.
    for (const relay of currentRelays()) {
      relays.stored.set(relay, [declaration.event as NostrEvent]);
    }
    const integration = {
      id: INTEGRATION,
      name: "Shopify store",
      createdAt: 1790000000,
      platform: "shopify"
    };
    const read = await readDeclarations(team, [declaration.paymentHash], {
      employees: [],
      integrations: [integration],
      assistants: [],
      removed: []
    });
    expect(read?.get(declaration.paymentHash)).toEqual([
      {
        author: declaration.saleAuthor,
        fiat: declaration.fiat,
        note: declaration.note,
        taker: { kind: "integration", id: INTEGRATION },
        // Its sale's own key, as the declaration carries it (the owner's acceptance is found by it).
        key: hexToBytes(declaration.saleKey)
      }
    ]);
  });
});

describe("the declaration the package made", () => {
  const key = hexToBytes(vectors.parsed.integrationKey);
  const saleKeyOf = (ref: string) =>
    hkdf(sha256, key, utf8ToBytes("sattle.me/integration"), utf8ToBytes(`sale/${ref}/v1`), 32);

  it("is the package's sale of its order, with its mark", () => {
    const saleKeys = deriveSaleKeys(saleKeyOf(packageVector.ref));
    expect(saleKeys.nostr.publicKey).toBe(packageVector.saleAuthor);
    expect(packageVector.event.pubkey).toBe(packageVector.saleAuthor);
    expect(takerTag(deriveIntegrationKeys(key).takerKey, packageVector.saleAuthor)).toBe(
      packageVector.taker
    );
  });

  it("reads as the owner reads it: the sale, its price, its note, the integration", async () => {
    for (const relay of vectors.parsed.relays) {
      relays.stored.set(relay, [packageVector.event as NostrEvent]);
    }
    const owner = { key: deriveBusinessRegistry(team).key, reader: deriveRegistryReader(team) };
    const [opened, ...others] =
      (await ownerDeclarations(owner, packageVector.paymentHash, "bc", {
        relays: vectors.parsed.relays
      })) ?? [];
    expect(others).toEqual([]);
    expect(opened).toMatchObject({
      author: packageVector.saleAuthor,
      fiat: packageVector.fiat,
      note: packageVector.note,
      taker: packageVector.taker,
      invoice: { pr: packageVector.invoice, verifyUrl: packageVector.verifyUrl }
    });
    expect(opened!.saleKey).toEqual(saleKeyOf(packageVector.ref));
    expect(opened!.invoice.decoded.amountMsat).toBe(BigInt(packageVector.sats) * 1000n);

    for (const relay of currentRelays()) {
      relays.stored.set(relay, [packageVector.event as NostrEvent]);
    }
    const integration = {
      id: INTEGRATION,
      name: "Shopify store",
      createdAt: 1790000000,
      platform: "shopify"
    };
    const read = await readDeclarations(team, [packageVector.paymentHash], {
      employees: [],
      integrations: [integration],
      assistants: [],
      removed: []
    });
    expect(read?.get(packageVector.paymentHash)).toEqual([
      {
        author: packageVector.saleAuthor,
        fiat: packageVector.fiat,
        note: packageVector.note,
        taker: { kind: "integration", id: INTEGRATION },
        key: saleKeyOf(packageVector.ref)
      }
    ]);
  });

  it("makes its payment count for no other sale", async () => {
    // The package's invoice and the app's declaration of CMD-1042 claim one payment.
    expect(packageVector.paymentHash).toBe(declaration.paymentHash);
    expect(packageVector.event.tags).toEqual([["d", declaration.address]]);
    const business = deriveBusinessRegistry(team);
    const list = { relays: vectors.parsed.relays };
    relays.stored.set(vectors.parsed.relays[0], [packageVector.event as NostrEvent]);
    const ownSale = saleRegistry(business, saleKeyOf(packageVector.ref), vectors.parsed.relays);
    expect(await paymentUniqueness(ownSale, packageVector.paymentHash, list)).toBe("unique");
    const otherSale = saleRegistry(business, saleKeyOf(declaration.ref), vectors.parsed.relays);
    expect(await paymentUniqueness(otherSale, packageVector.paymentHash, list)).toBe("conflict");
  });
});
