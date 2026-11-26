import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";

import {
  INTEGRATION_LOT_PUBLISH_EVERY,
  INTEGRATION_LOT_SIZE,
  LEASE_GRACE_SECONDS
} from "@/config/onchain";
import { DEFAULT_RELAYS } from "@/config/relays";
import {
  closeAccount,
  getAccountSettings,
  getAccountTeamKeys,
  updateAccount
} from "@/features/account/session";
import { changeRelays } from "@/features/settings/account-settings";
import { loadOnchainSales } from "@/features/activity/load";
import { leaseOfSale, readOnchainSales } from "@/features/activity/onchain-sales";
import {
  readIntegrationOrders,
  type AddressReads,
  type IntegrationOrder,
  type WalletView
} from "@/features/activity/integration-orders";
import { followUpAmount, ownerActivity } from "@/features/activity/model";
import { syncIntegrationAddresses } from "@/features/team/integration-addresses";
import { findIntegrationPending } from "@/features/team/integration-pending";
import { TeamError, loadIntegrations, removeIntegration } from "@/features/team/owner";
import { WalletError } from "@/lib/breez/errors";
import { encodeWalletSecret } from "@/lib/breez/secret";
import { readLog } from "@/lib/log/log";
import {
  connectWallet,
  disconnectWallet,
  getWalletConnectionId,
  getWalletId,
  newDepositAddress,
  subscribeWallet
} from "@/lib/breez/wallet";
import type { WalletPayment } from "@/lib/breez/types";
import { deriveIntegrationKeys, parseIntegrationKey } from "@/lib/integrations/keys";
import {
  fetchIntegrationLots,
  integrationLotEvent,
  openIntegrationLot
} from "@/lib/integrations/onchain-lot";
import {
  addressTag,
  fetchWitnesses,
  openWitness,
  orderTag,
  witnessAddress,
  witnessEvent
} from "@/lib/integrations/onchain-witness";
import { decodeBolt11 } from "@/lib/lightning/bolt11";
import type { Invoice } from "@/lib/lightning/lnurl";
import type { NostrEvent } from "@/lib/nostr/event";
import { conversationKey, nip44Encrypt } from "@/lib/nostr/nip44";
import { publishToRelays } from "@/lib/nostr/pool";
import { sealRecord } from "@/lib/nostr/record";
import { formatBtcAmount, paymentUri } from "@/lib/onchain/bip21";
import { parseDepositAddress } from "@/lib/onchain/address";
import { MAX_RECORDED_INPUTS, paymentParts } from "@/lib/onchain/replacement";
import {
  leaseEvent,
  onchainRegistryAddress,
  ownerLeasesOf,
  parseLease,
  withdrawalEvent
} from "@/lib/registry/onchain";
import { declarationKey, outerKey, saleRegistry, takerTag } from "@/lib/registry/registry";
import {
  deriveBusinessRegistry,
  deriveRegistryReader,
  deriveTeamKeys,
  integrationSecretKey,
  type TeamKeys
} from "@/lib/team/keys";
import type { Integration } from "@/lib/team/roster";

import lotVector from "./fixtures/checkout-spec/onchain-lot.json";
import { TEST_MNEMONIC, openTestAccount } from "../../jest/account";
import { taprootAddress } from "../../jest/bitcoin";
import { makeInvoice, preimagePair } from "../../jest/lightning";
import { publishIntegration } from "../../jest/roster";
import type * as MempoolFake from "../../jest/mempool";
import type * as RelaysFake from "../../jest/nostr-relays";

import addresses from "./fixtures/checkout-spec/onchain-addresses.json";
import leases from "./fixtures/checkout-spec/onchain-leases.json";
import replacements from "./fixtures/checkout-spec/onchain-replacements.json";
import witnesses from "./fixtures/checkout-spec/onchain-witnesses.json";

/*
 * On-chain payments of the integrations (checkout-spec SPEC.md §31): the app's side. The owner
 * gives each integration a lot of addresses of its wallet
 * (src/lib/integrations/onchain-lot.ts, src/features/team/integration-addresses.ts), whatever
 * "On-chain payments" says; its servers lease them in the registry
 * (src/lib/registry/onchain.ts) and record the transactions they see (witnesses,
 * src/lib/integrations/onchain-witness.ts), where the owner reads which sale a deposit paid
 * (src/features/activity/onchain-sales.ts) and which addresses of a lot were paid. Against the
 * specification's vectors, copied byte for byte in fixtures/checkout-spec/, and the lot the app
 * made for it (fixtures/checkout-spec/onchain-lot.json, its vectors/app/onchain-lot.json).
 */

jest.mock("../lib/breez/config", () => ({
  ...jest.requireActual("../lib/breez/config"),
  getBreezNetwork: () => "mainnet"
}));
jest.mock("../lib/breez/wallet", () => ({
  checkWalletConfig: jest.fn(),
  connectWallet: jest.fn(),
  disconnectWallet: jest.fn(),
  getWalletConnectionId: jest.fn(),
  getWalletId: jest.fn(),
  getWalletLightningAddress: jest.fn(),
  newDepositAddress: jest.fn(),
  subscribeWallet: jest.fn()
}));

const relays = jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");
const mempool = jest.requireMock<typeof MempoolFake>("../lib/onchain/esplora");

/** Each copy, its file in checkout-spec and that file's SHA-256 in checkout-spec's manifest.json. */
const SPEC_FILES = [
  [
    "onchain-addresses.json",
    "vectors/onchain-addresses.json",
    "0e52dd75556dc1c93478f0b58dd855748bf99b3787b8cdd911224ebff99e5122"
  ],
  [
    "onchain-leases.json",
    "vectors/onchain-leases.json",
    "4c7ff709f27630df46a57914ddb522e33c795da8760a9ec60116b0a63adab502"
  ],
  [
    "onchain-witnesses.json",
    "vectors/onchain-witnesses.json",
    "07d42fb220221accd1f907e95d9ff6589601fbaf59f332bcabcbcac095bc8378"
  ],
  [
    "onchain-replacements.json",
    "vectors/onchain-replacements.json",
    "8a7f25e15fde63c6543e48dd39298d10b37ac05a0eec5c0bad230fb36d85c608"
  ]
] as const;
/** src/__tests__/fixtures/checkout-spec/onchain-lot.json is checkout-spec's vectors/app/onchain-lot.json. */
const LOT_VECTOR_SHA256 = "7ebdb288529f7f384766e1394ce71107bbd52ffc6f24f8394441a1f3162d7a41";

// Node's types are not loaded (tsconfig `types` only lists jest): only what this test needs.
declare const __dirname: string;
const fs = jest.requireActual<{ readFileSync(path: string): Uint8Array }>("fs");
const { join } = jest.requireActual<{ join(...segments: string[]): string }>("path");

const WALLET = "02c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5";
const NOW = Math.floor(Date.now() / 1000);
const INTEGRATION_ID = "0123456789abcdef0123456789abcdef";

/** The fake wallet: connected or not, handing out taprootAddress(1), (2), … */
const wallet = { connected: false, next: 0, failAfter: Infinity };

beforeEach(() => {
  jest.clearAllMocks();
  leaseEnds.clear();
  closeAccount();
  relays.resetRelays();
  mempool.resetMempool();
  Object.assign(wallet, { connected: false, next: 0, failAfter: Infinity });
  jest.mocked(connectWallet).mockImplementation(async () => {
    wallet.connected = true;
  });
  jest.mocked(disconnectWallet).mockImplementation(async () => {
    wallet.connected = false;
  });
  jest.mocked(getWalletConnectionId).mockImplementation(() => (wallet.connected ? 1 : null));
  jest.mocked(getWalletId).mockResolvedValue(WALLET);
  jest.mocked(subscribeWallet).mockImplementation((listener) => {
    const timer = setTimeout(listener, 0);
    return () => clearTimeout(timer);
  });
  jest.mocked(newDepositAddress).mockImplementation(async () => {
    if (!wallet.connected) throw new WalletError("notConnected", "No wallet is connected");
    if (wallet.next >= wallet.failAfter) throw new WalletError("requestFailed", "Exhausted");
    wallet.next += 1;
    return taprootAddress(wallet.next);
  });
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

it.each(SPEC_FILES)("%s is checkout-spec's %s", (name, _file, hash) => {
  const bytes = fs.readFileSync(join(__dirname, "fixtures", "checkout-spec", name));
  expect(bytesToHex(sha256(bytes))).toBe(hash);
});

it("src/__tests__/fixtures/checkout-spec/onchain-lot.json is checkout-spec's vectors/app/onchain-lot.json", () => {
  const bytes = fs.readFileSync(join(__dirname, "fixtures", "checkout-spec", "onchain-lot.json"));
  expect(bytesToHex(sha256(bytes))).toBe(LOT_VECTOR_SHA256);
});

describe("deposit addresses (onchain-addresses.json)", () => {
  it.each(addresses.addresses)("$name", ({ address, valid }) => {
    expect(parseDepositAddress(address, "mainnet") === address).toBe(valid);
  });

  it.each(addresses.registry.cases)("registry address of $address", (c) => {
    expect(onchainRegistryAddress(hexToBytes(addresses.registry.registryKey), c.address)).toBe(
      c.registryAddress
    );
  });

  it.each(addresses.uris)("payment URI: $name", (c) => {
    const uri =
      c.address === null
        ? `lightning:${c.bolt11}`
        : paymentUri({ address: c.address, sats: BigInt(c.sats), invoice: c.bolt11 });
    expect(uri).toBe(c.uri);
  });

  it.each(addresses.amounts)("$sats sats as BIP-21's amount", ({ sats, btc }) => {
    expect(formatBtcAmount(BigInt(sats))).toBe(btc);
  });
});

describe("the lot the app made (src/__tests__/fixtures/checkout-spec/onchain-lot.json)", () => {
  const team = deriveTeamKeys(
    encodeWalletSecret({
      mnemonic:
        "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about"
    })
  );

  it("opens with the integration's secret key alone", () => {
    const access = parseIntegrationKey(lotVector.secretKey)!;
    const keys = deriveIntegrationKeys(access.key);
    expect(access.teamPublicKey).toBe(lotVector.team);
    expect(keys.lotAddress).toBe(lotVector.lotAddress);
    expect(bytesToHex(keys.channel.encryptionKey)).toBe(lotVector.channelEncryptionKey);
    const opened = openIntegrationLot(lotVector.lot.event, lotVector.team, keys, "mainnet");
    expect(opened).toEqual({
      status: "ok",
      event: lotVector.lot.event,
      value: lotVector.lot.value.v
    });
    // Made for that integration of the team: its key is the team's own.
    expect(bytesToHex(integrationSecretKey(team, INTEGRATION_ID))).toBe(bytesToHex(access.key));
  });

  it("is refused with one wrong address, or a date that is not the event's", () => {
    const keys = deriveIntegrationKeys(integrationSecretKey(team, INTEGRATION_ID));
    const lot = { ...lotVector.lot.value.v, version: 1 as const };
    const open = (value: Record<string, unknown>) =>
      openIntegrationLot(
        integrationLotEvent(team, keys, value as never),
        team.publicKey,
        keys,
        "mainnet"
      );
    expect(open(lot)?.status).toBe("ok");
    expect(open({ ...lot, addresses: [...lot.addresses, taprootAddress(1, "tb")] })).toBeNull();
    expect(open({ ...lot, addresses: [lot.addresses[0], lot.addresses[0]] })).toBeNull();
    expect(
      open({ ...lot, addresses: Array.from({ length: 101 }, (_, i) => taprootAddress(i + 1)) })
    ).toBeNull();
    expect(open({ ...lot, version: 2 })?.status).toBe("newer");
  });
});

describe("leases (onchain-leases.json)", () => {
  const registryKey = hexToBytes(leases.registryKey);

  it("derive their keys as the specification does", () => {
    expect(bytesToHex(conversationKey(hexToBytes(leases.saleSecret), leases.registryReader))).toBe(
      leases.innerConversationKey
    );
    for (const c of leases.derived) {
      const place = onchainRegistryAddress(registryKey, c.address);
      expect(place).toBe(c.registryAddress);
      expect(bytesToHex(outerKey(registryKey, place, leases.saleAuthor))).toBe(c.outerKey);
    }
  });

  it.each(leases.events.filter(({ inside }) => inside !== null))(
    "opens inside: $name",
    ({ outside, inside, address, ...c }) => {
      const lease = parseLease(
        outside as { kind: "lease"; end: number; sealed: string } & { version: number },
        hexToBytes(leases.innerConversationKey),
        registryKey,
        onchainRegistryAddress(registryKey, address),
        "bc"
      );
      expect(lease).toMatchObject({
        address: inside!.address,
        sats: BigInt(inside!.sats),
        createdAt: inside!.createdAt,
        expiresAt: inside!.expiresAt,
        end: inside!.expiresAt + 120,
        fiat: inside!.sale.fiat,
        note: inside!.sale.note,
        taker: inside!.taker,
        // The order's tolerance (SPEC.md §31, "The merchant's tolerance"): absent, none.
        tolerance: "tolerance" in c ? c.tolerance : 0,
        // An order's lease: `confirmed` true; false or absent, a try (SPEC.md §31).
        confirmed: (inside as { confirmed?: unknown }).confirmed === true
      });
      expect(lease!.invoice?.pr ?? null).toBe(inside!.invoice);
      expect(bytesToHex(lease!.saleKey)).toBe(inside!.sale.key);
    }
  );

  it("are read by the owner: the valid ones, a withdrawal and a newer format", async () => {
    await openTestAccount({ usage: "merchant", signUp: "done" });
    const team = getAccountTeamKeys()!;
    // The vectors' registry is this account's: the same test mnemonic.
    expect(bytesToHex(deriveBusinessRegistry(team).key)).toBe(leases.registryKey);
    for (const relay of DEFAULT_RELAYS) {
      relays.stored.set(
        relay,
        leases.events
          // The same author's newer record at the first address: relays keep one per author.
          .filter(({ name }) => name !== "an invoice of another amount than sats")
          // The leases with a tolerance, newer at the second address: read below.
          .filter(({ name }) => !name.startsWith("a lease with a tolerance"))
          // A lease as first published and its mark, at the second address: read below.
          .filter(({ confirmed }) => confirmed === undefined)
          .map(({ event }) => event as NostrEvent)
      );
    }
    const owner = { key: registryKey, reader: deriveRegistryReader(team) };
    const [first, onchainOnly, third] = leases.derived.map(({ address }) => address);
    const found = await ownerLeasesOf(owner, [first!, onchainOnly!, third!], "bc");
    // The first: its lease. Contents of a newer NIP-44 version written there by other keys are no
    // records (anybody can write at its place: SPEC.md §31, "Opening a lease"), and a withdrawal
    // whose signature does not check out is none.
    expect(found?.get(first!)?.newer).toBe(false);
    expect(found?.get(first!)?.leases.map(({ author, leasedAt }) => [author, leasedAt])).toEqual(
      expect.arrayContaining([[leases.saleAuthor, expect.any(Number)]])
    );
    expect(found?.get(first!)?.leases).toHaveLength(1);
    // The second: withdrawn by its newer record.
    expect(found?.get(onchainOnly!)).toEqual({ leases: [], newer: false });
    // The third: none valid, one of a newer format.
    expect(found?.get(third!)).toEqual({ leases: [], newer: true });

    // A lease with a tolerance (SPEC.md §31, "The merchant's tolerance"): the owner reads it with
    // the order's tolerance, which judges its payment.
    for (const relay of DEFAULT_RELAYS) {
      relays.stored.set(
        relay,
        leases.events
          .filter(({ name }) => name === "a lease with a tolerance of 5 %")
          .map(({ event }) => event as NostrEvent)
      );
    }
    const tolerant = await ownerLeasesOf(owner, [onchainOnly!], "bc");
    expect(tolerant?.get(onchainOnly!)?.leases.map(({ tolerance }) => tolerance)).toEqual([500]);
  });

  it("tell a lease as first published (a try, no order's) from its mark (the order's)", async () => {
    await openTestAccount({ usage: "merchant", signUp: "done" });
    const team = getAccountTeamKeys()!;
    const owner = { key: registryKey, reader: deriveRegistryReader(team) };
    const [tried, marked] = ["not confirmed", "marked confirmed"].map((part) =>
      leases.events.find(({ name }) => name.includes(part))!
    );
    const address = tried!.address;
    const store = (...events: unknown[]) => {
      for (const relay of DEFAULT_RELAYS) relays.stored.set(relay, events as NostrEvent[]);
    };

    store(tried!.event);
    const first = (await ownerLeasesOf(owner, [address], "bc"))?.get(address);
    expect(first?.leases.map(({ confirmed }) => confirmed)).toEqual([false]);
    expect(leaseOfSale(first!.leases, leases.saleAuthor)).toBeNull();

    // Its mark, a second later, replaces it: the order's lease.
    store(tried!.event, marked!.event);
    const then = (await ownerLeasesOf(owner, [address], "bc"))?.get(address);
    expect(then?.leases.map(({ confirmed, leasedAt }) => [confirmed, leasedAt])).toEqual([
      [true, marked!.event.created_at]
    ]);
    expect(leaseOfSale(then!.leases, leases.saleAuthor)?.confirmed).toBe(true);
  });

  it("are null without a majority of the relays", async () => {
    await openTestAccount({ usage: "merchant", signUp: "done" });
    const team = getAccountTeamKeys()!;
    for (const relay of DEFAULT_RELAYS) relays.unreachable.add(relay);
    const owner = { key: registryKey, reader: deriveRegistryReader(team) };
    await expect(ownerLeasesOf(owner, [leases.derived[0]!.address], "bc")).resolves.toBeNull();
  });
});

describe("witnesses (onchain-witnesses.json)", () => {
  const keys = deriveIntegrationKeys(hexToBytes(witnesses.integrationKey));

  it("derive their keys and addresses as the specification does", () => {
    expect({
      seenSecret: bytesToHex(keys.seen.nostr.secretKey),
      seenAuthor: keys.seen.nostr.publicKey,
      seenAddressKey: bytesToHex(keys.seen.addressKey)
    }).toEqual(witnesses.derived);
    expect(bytesToHex(keys.channel.encryptionKey)).toBe(witnesses.channelEncryptionKey);
    for (const c of witnesses.addresses) {
      expect(witnessAddress(keys, c.address, c.txid, c.sale)).toBe(c.witnessAddress);
    }
    for (const c of witnesses.orderTags) {
      expect(orderTag(keys, c.address, c.sale)).toBe(c.orderTag);
    }
    for (const c of witnesses.addressTags) {
      expect(addressTag(keys, c.address)).toBe(c.addressTag);
    }
  });

  it.each(witnesses.events)("opens: $name", ({ event, value }) => {
    const opened = openWitness(event, keys, "bc");
    expect(
      opened === null
        ? null
        : opened.status === "newer"
          ? "newer"
          : { version: 1, ...opened.value, sats: Number(opened.value.sats) }
    ).toEqual(value);
  });

  it("are written as the specification reads them", () => {
    const witness = {
      address: taprootAddress(4),
      txid: "ab".repeat(32),
      sale: "cd".repeat(32),
      sats: 49_000n,
      inputs: [`${"ef".repeat(32)}:1`],
      replacement: true,
      expiresAt: NOW + 900
    };
    // Its invoice's `expiresAt`, its order tag, then its address tag.
    const event = witnessEvent(keys, witness, NOW);
    expect(event.pubkey).toBe(witnesses.derived.seenAuthor);
    expect(event.tags).toEqual([
      ["d", witnessAddress(keys, witness.address, witness.txid, witness.sale)],
      ["o", orderTag(keys, witness.address, witness.sale)],
      ["o", addressTag(keys, witness.address)]
    ]);
    expect(openWitness(event, keys, "bc")).toMatchObject({ status: "ok", value: witness });
    // As @swissbitcoinpay/checkout 1.0.0 wrote it, without `expiresAt` nor the address tag:
    // checkout-spec 0.1.0 refuses it.
    const { expiresAt: _end, ...ofOldServer } = witness;
    const old = sealRecord({
      type: "integration-onchain-seen",
      value: { version: 1, ...ofOldServer, sats: 49_000 },
      signer: keys.seen.nostr.secretKey,
      encryptionKey: keys.channel.encryptionKey,
      address: witnessAddress(keys, witness.address, witness.txid, witness.sale),
      tags: [["o", orderTag(keys, witness.address, witness.sale)]],
      createdAt: NOW
    });
    expect(openWitness(old, keys, "bc")).toBeNull();
    // A transaction of more coins than a witness keeps: its first ones.
    const coins = Array.from({ length: 150 }, (_, i) => `${"ef".repeat(32)}:${i}`);
    const many = witnessEvent(keys, { ...witness, inputs: coins }, NOW);
    expect(openWitness(many, keys, "bc")).toMatchObject({
      value: { inputs: coins.slice(0, MAX_RECORDED_INPUTS) }
    });
  });
});

describe("replacements (onchain-replacements.json)", () => {
  it.each(replacements.cases)("parts: $name", ({ txs, parts }) => {
    const found = paymentParts(
      txs.map((tx) => ({
        txid: tx.txid,
        sats: BigInt(tx.sats),
        inputs: tx.inputs,
        at: tx.order,
        listed: tx.listed
      }))
    );
    expect(
      Object.fromEntries(
        [...found].map(([txid, list]) => [
          txid,
          list.map(({ sats, source }) => ({ sats: sats.toString(), root: source }))
        ])
      )
    ).toEqual(parts);
  });
});

describe("the owner's read of the witnesses (fetchWitnesses)", () => {
  it("keeps the first time each was seen, tells a newer format, and needs a majority", async () => {
    await openTestAccount({ usage: "merchant", signUp: "done" });
    const team = getAccountTeamKeys()!;
    const integration = await integrationOf(team);
    const keys = deriveIntegrationKeys(integrationSecretKey(team, integration.id));
    const holders = [{ id: integration.id, keys }];
    const seen = {
      address: taprootAddress(4),
      txid: "ab".repeat(32),
      sale: null,
      sats: 1_000n,
      inputs: [],
      replacement: false,
      expiresAt: null
    };
    const publish = (event: NostrEvent, list: readonly string[]) =>
      publishToRelays(event, {
        relays: list,
        channel: "account",
        timeoutMs: 1000,
        authKey: keys.seen.nostr.secretKey
      });
    // Published again later (another server) where the first is missing: the first time counts.
    await publish(witnessEvent(keys, seen, NOW - 100), DEFAULT_RELAYS.slice(0, 1));
    await publish(witnessEvent(keys, seen, NOW - 50), DEFAULT_RELAYS.slice(1));
    await publish(
      sealRecord({
        type: "integration-onchain-seen",
        value: { version: 2 },
        signer: keys.seen.nostr.secretKey,
        encryptionKey: keys.channel.encryptionKey,
        address: witnessAddress(keys, taprootAddress(5), "cd".repeat(32), null),
        createdAt: NOW
      }),
      DEFAULT_RELAYS
    );
    const call = { relays: DEFAULT_RELAYS, channel: "account" as const, timeoutMs: 1000 };

    const read = await fetchWitnesses(holders, "bc", NOW - 1000, call);

    expect(read?.witnesses).toEqual([
      expect.objectContaining({ ...seen, integration: integration.id, seenAt: NOW - 100 })
    ]);
    expect(read?.newer).toEqual(new Set([integration.id]));
    // Read since after it: not asked.
    expect((await fetchWitnesses(holders, "bc", NOW - 10, call))?.witnesses).toEqual([]);
    // Fewer than a majority answer: a witness may be on the others.
    for (const relay of DEFAULT_RELAYS.slice(1)) relays.unreachable.add(relay);
    expect(await fetchWitnesses(holders, "bc", NOW - 1000, call)).toBeNull();
  });
});

describe("fields and tags of a later version", () => {
  it("are ignored in a lease, outside and inside, and in a witness", async () => {
    await openTestAccount({ usage: "merchant", signUp: "done" });
    const team = getAccountTeamKeys()!;
    const integration = await integrationOf(team);
    const address = taprootAddress(7);
    const registry = saleOf(team, integration, "ORD-1");
    const place = onchainRegistryAddress(registry.key, address);
    const inside = {
      version: 1,
      address,
      sats: 49_000,
      invoice: null,
      verifyUrl: null,
      createdAt: NOW - 600,
      expiresAt: NOW + 300,
      sale: {
        key: bytesToHex(registry.saleKey),
        fiat: { minor: 49_000, digits: 0, currency: "SAT" },
        note: "Order ORD-1",
        later: "ignored"
      },
      taker: registry.taker,
      confirmed: true,
      later: { anything: [1, 2] }
    };
    await publishToRelays(
      sealRecord({
        type: "registry-onchain",
        value: {
          version: 1,
          end: NOW + 420,
          sealed: nip44Encrypt(JSON.stringify(inside), declarationKey(registry)),
          later: true
        },
        signer: registry.saleKeys.nostr.secretKey,
        encryptionKey: outerKey(registry.key, place, registry.saleKeys.nostr.publicKey),
        address: place,
        tags: [["x", "a later tag"]],
        createdAt: NOW - 599
      }),
      { relays: DEFAULT_RELAYS, channel: "anonymous", timeoutMs: 1000 }
    );
    const keys = deriveIntegrationKeys(integrationSecretKey(team, integration.id));
    const txid = "aa".repeat(32);
    const sale = registry.saleKeys.nostr.publicKey;
    await publishToRelays(
      sealRecord({
        type: "integration-onchain-seen",
        value: {
          version: 1,
          address,
          txid,
          sale,
          sats: 49_000,
          inputs: [],
          replacement: false,
          expiresAt: NOW + 300,
          later: "ignored"
        },
        signer: keys.seen.nostr.secretKey,
        encryptionKey: keys.channel.encryptionKey,
        address: witnessAddress(keys, address, txid, sale),
        tags: [
          ["o", orderTag(keys, address, sale)],
          ["o", addressTag(keys, address)],
          ["x", "a later tag"]
        ],
        createdAt: NOW - 300
      }),
      {
        relays: DEFAULT_RELAYS,
        channel: "account",
        timeoutMs: 1000,
        authKey: keys.seen.nostr.secretKey
      }
    );

    const found = (
      await ownerLeasesOf(
        { key: deriveBusinessRegistry(team).key, reader: deriveRegistryReader(team) },
        [address],
        "bc"
      )
    )?.get(address);
    expect(found?.newer).toBe(false);
    expect(found?.leases).toEqual([
      expect.objectContaining({ address, sats: 49_000n, end: NOW + 420, confirmed: true })
    ]);
    const read = await fetchWitnesses([{ id: integration.id, keys }], "bc", NOW - 1000, {
      relays: DEFAULT_RELAYS,
      channel: "account",
      timeoutMs: 1000
    });
    expect(read?.newer).toEqual(new Set());
    expect(read?.witnesses).toEqual([
      expect.objectContaining({ address, txid, sale, expiresAt: NOW + 300, replacement: false })
    ]);
    // So the deposit is that order's.
    expect((await loadOnchainSales([{ txid, at: NOW }]))?.sales.get(txid)).toEqual([
      expect.objectContaining({ author: sale, note: "Order ORD-1", paidAt: NOW - 300 })
    ]);
  });
});

describe("which lease a witness stands for (leaseOfSale)", () => {
  const lease = (author: string, leasedAt: number, end: number, confirmed = true) =>
    ({ author, leasedAt, end, confirmed }) as Parameters<typeof leaseOfSale>[0][number];

  it("is its sale's own lease of the address, whenever the witness was made", () => {
    const found = [lease("a", 1000, 2000), lease("b", 5000, 6000)];
    expect(leaseOfSale(found, "a")?.author).toBe("a");
    expect(leaseOfSale(found, "b")?.leasedAt).toBe(5000);
    // Another sale's lease of the address never stands for it.
    expect(leaseOfSale(found, "c")).toBeNull();
  });

  it("is never a lease not confirmed: a try its customer never saw", () => {
    expect(leaseOfSale([lease("a", 1000, 2000, false)], "a")).toBeNull();
  });
});

/** An integration of the account, its record on the relays. */
async function integrationOf(team: TeamKeys, id = INTEGRATION_ID): Promise<Integration> {
  const integration: Integration = {
    id,
    name: "Shopify store",
    createdAt: NOW - 3600,
    platform: "shopify"
  };
  await publishIntegration(team, integration);
  return integration;
}

/** The lot the relays hold for `integration`, as its server reads it. */
async function lotOf(
  team: TeamKeys,
  integration: Integration,
  list: readonly string[] = DEFAULT_RELAYS
) {
  const keys = deriveIntegrationKeys(integrationSecretKey(team, integration.id));
  const found = await fetchIntegrationLots(team, [{ id: integration.id, keys }], "mainnet", {
    relays: list,
    channel: "account",
    timeoutMs: 1000,
    authKey: team.secretKey
  });
  return found?.get(integration.id)?.lot ?? null;
}

/** The copies of `integration`'s lot published, one per relay each, in order. */
function lotCopies(team: TeamKeys, integration: Integration) {
  const { lotAddress } = deriveIntegrationKeys(integrationSecretKey(team, integration.id));
  return relays.calls.filter(
    ({ operation, event }) =>
      operation === "publish" &&
      event?.tags.some(([name, value]) => name === "d" && value === lotAddress)
  );
}

/** A promise `open()` resolves. */
function gate() {
  let open: () => void = () => undefined;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { opened, open };
}

/** Resolves once `condition` holds, checked every few milliseconds. */
async function until(condition: () => boolean | Promise<boolean>): Promise<void> {
  for (let tries = 0; !(await condition()); tries += 1) {
    if (tries > 1000) throw new Error("The condition never held");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

/** The sale of the order `ref` of `integration`, with its mark. */
function saleOf(team: TeamKeys, integration: Integration, ref: string) {
  const integrationKey = integrationSecretKey(team, integration.id);
  const saleKey = sha256(new TextEncoder().encode(`${bytesToHex(integrationKey)}:${ref}`));
  const registry = saleRegistry(deriveBusinessRegistry(team), saleKey);
  return {
    ...registry,
    taker: takerTag(
      deriveIntegrationKeys(integrationKey).takerKey,
      registry.saleKeys.nostr.publicKey
    )
  };
}

/**
 * The `expiresAt` of the latest lease (lease) of each sale at each address (`<sale>:<address>`): the
 * invoice a witness of that sale there is of, unless it says another (witness).
 */
const leaseEnds = new Map<string, number>();

/** A lease of `address` by the order `ref`, until `expiresAt` (on-chain only), on the relays. */
async function lease(
  team: TeamKeys,
  integration: Integration,
  ref: string,
  address: string,
  {
    createdAt = NOW - 600,
    expiresAt = NOW + 300,
    sats = 49_000n,
    invoice = null,
    tolerance,
    confirmed = true,
    at = createdAt
  }: {
    createdAt?: number;
    expiresAt?: number;
    sats?: bigint;
    invoice?: Invoice | null;
    /** The order's tolerance of on-chain underpayments, its server's channel's (basis points). */
    tolerance?: number;
    /** False as first published, true in its mark (the order's lease, by default). */
    confirmed?: boolean;
    /** Its event's date: a mark's is a second after the lease. */
    at?: number;
  } = {}
) {
  const registry = saleOf(team, integration, ref);
  await publishToRelays(
    leaseEvent(
      registry,
      { address, sats, invoice, createdAt, expiresAt, tolerance, confirmed },
      { fiat: { minor: 2450, digits: 2, currency: "CHF" }, note: `Order ${ref}` },
      at
    ),
    { relays: DEFAULT_RELAYS, channel: "anonymous", timeoutMs: 1000 }
  );
  leaseEnds.set(`${registry.saleKeys.nostr.publicKey}:${address}`, expiresAt);
  return registry;
}

/** The witness of `txid` paying `address`, for the sale of `registry` (null: none), on the relays. */
async function witness(
  team: TeamKeys,
  integration: Integration,
  address: string,
  txid: string,
  sale: { saleKeys: { nostr: { publicKey: string } } } | null,
  seenAt = NOW - 300,
  {
    sats = 49_000n,
    inputs = [],
    replacement = false,
    expiresAt = sale === null
      ? null
      : (leaseEnds.get(`${sale.saleKeys.nostr.publicKey}:${address}`) ?? NOW + 300)
  }: {
    sats?: bigint;
    inputs?: string[];
    replacement?: boolean;
    /** Its invoice's: by default that of the sale's latest lease there, null for none. */
    expiresAt?: number | null;
  } = {}
) {
  const keys = deriveIntegrationKeys(integrationSecretKey(team, integration.id));
  const named = sale?.saleKeys.nostr.publicKey ?? null;
  await publishToRelays(
    witnessEvent(
      keys,
      {
        address,
        txid,
        sale: named,
        sats,
        inputs,
        replacement,
        expiresAt
      },
      seenAt
    ),
    {
      relays: DEFAULT_RELAYS,
      channel: "anonymous",
      timeoutMs: 1000,
      authKey: keys.seen.nostr.secretKey
    }
  );
}

describe("the owner fills the integrations' lots", () => {
  it('gives each integration INTEGRATION_LOT_SIZE addresses, "On-chain payments" off', async () => {
    await openTestAccount({ usage: "merchant", signUp: "done" });
    // The point of sale's setting: an integration takes on-chain payments all the same.
    await updateAccount({ onchainPayments: false });
    const team = getAccountTeamKeys()!;
    const integration = await integrationOf(team);

    await syncIntegrationAddresses();

    const lot = await lotOf(team, integration);
    expect(lot?.addresses).toEqual(
      Array.from({ length: INTEGRATION_LOT_SIZE }, (_, i) => taprootAddress(i + 1))
    );
    // Connected for that only.
    expect(wallet.connected).toBe(false);
  });

  it("stops once the wallet hands an address out again, rather than asking on forever", async () => {
    await openTestAccount({ usage: "merchant", signUp: "done" });
    const team = getAccountTeamKeys()!;
    const integration = await integrationOf(team);
    // Its fourth address is its third again: the wallet gives no new one now.
    jest.mocked(newDepositAddress).mockImplementation(async () => {
      wallet.next += 1;
      return taprootAddress(Math.min(wallet.next, 3));
    });

    await syncIntegrationAddresses();

    expect((await lotOf(team, integration))?.addresses).toEqual(
      [1, 2, 3].map((n) => taprootAddress(n))
    );
    expect(wallet.next).toBe(4);
    expect(wallet.connected).toBe(false);
  });

  it("never gives two integrations one address the wallet handed out again", async () => {
    await openTestAccount({ usage: "merchant", signUp: "done" });
    const team = getAccountTeamKeys()!;
    const first = await integrationOf(team);
    const second = await integrationOf(team, "fedcba9876543210fedcba9876543210");
    // A full lot, then the last address again and again: the wallet gives no new one now.
    jest.mocked(newDepositAddress).mockImplementation(async () => {
      wallet.next += 1;
      return taprootAddress(Math.min(wallet.next, INTEGRATION_LOT_SIZE));
    });

    await syncIntegrationAddresses();

    const lots = [await lotOf(team, first), await lotOf(team, second)];
    const given = lots.flatMap((lot) => lot?.addresses ?? []);
    expect(given).toHaveLength(INTEGRATION_LOT_SIZE);
    expect(new Set(given).size).toBe(given.length);
    expect(wallet.connected).toBe(false);
  });

  it("leaves a full lot alone, without connecting the wallet", async () => {
    await openTestAccount({ usage: "merchant", signUp: "done" });
    const team = getAccountTeamKeys()!;
    const integration = await integrationOf(team);
    await syncIntegrationAddresses();
    const before = await lotOf(team, integration);
    jest.mocked(connectWallet).mockClear();

    await syncIntegrationAddresses();

    expect(await lotOf(team, integration)).toEqual(before);
    expect(connectWallet).not.toHaveBeenCalled();
  });

  it("takes out the addresses its witnesses name, asking no explorer", async () => {
    await openTestAccount({ usage: "merchant", signUp: "done" });
    const team = getAccountTeamKeys()!;
    const integration = await integrationOf(team);
    await syncIntegrationAddresses();
    const [paidInTime, paidLate, leasedOnly] = [1, 2, 3].map((n) => taprootAddress(n));
    const registry = await lease(team, integration, "ORD-1", paidInTime);
    await lease(team, integration, "ORD-2", leasedOnly);
    await witness(team, integration, paidInTime, "aa".repeat(32), registry);
    await witness(team, integration, paidLate, "bb".repeat(32), null);

    await syncIntegrationAddresses();

    const lot = await lotOf(team, integration);
    expect(lot?.addresses).toHaveLength(INTEGRATION_LOT_SIZE);
    expect(lot?.addresses).not.toContain(paidInTime);
    expect(lot?.addresses).not.toContain(paidLate);
    // Leased, paid over Lightning or not at all: it stays.
    expect(lot?.addresses).toContain(leasedOnly);
    expect(lot?.addresses).toContain(taprootAddress(INTEGRATION_LOT_SIZE + 2));
    expect(mempool.chain.calls).toEqual([]);
  });

  it("never gives back an address its witnesses name, should the wallet hand it out again", async () => {
    await openTestAccount({ usage: "merchant", signUp: "done" });
    const team = getAccountTeamKeys()!;
    const integration = await integrationOf(team);
    await syncIntegrationAddresses();
    const paid = taprootAddress(1);
    await witness(team, integration, paid, "aa".repeat(32), null);
    // The wallet gives no new address now: the paid one again.
    jest.mocked(newDepositAddress).mockImplementation(async () => {
      wallet.next += 1;
      return paid;
    });

    await syncIntegrationAddresses();

    const lot = await lotOf(team, integration);
    expect(lot?.addresses).toEqual(
      Array.from({ length: INTEGRATION_LOT_SIZE - 1 }, (_, i) => taprootAddress(i + 2))
    );
    expect(wallet.connected).toBe(false);
  });

  it("writes nothing when the witnesses give no majority's answer", async () => {
    await openTestAccount({ usage: "merchant", signUp: "done" });
    const team = getAccountTeamKeys()!;
    const integration = await integrationOf(team);
    await syncIntegrationAddresses();
    const before = await lotOf(team, integration);
    await witness(team, integration, taprootAddress(1), "aa".repeat(32), null);
    const keys = deriveIntegrationKeys(integrationSecretKey(team, integration.id));
    // The relays refuse the witnesses' reads, the lot's still answer.
    const query = relays.queryEvents;
    const spy = jest
      .spyOn(relays, "queryEvents")
      .mockImplementation(async (url, filter, options) => {
        if (filter.authors?.includes(keys.seen.nostr.publicKey)) throw new Error("unreachable");
        return query(url, filter, options);
      });
    try {
      await syncIntegrationAddresses();
    } finally {
      spy.mockRestore();
    }

    expect(await lotOf(team, integration)).toEqual(before);
  });

  it("waits for the wallet as long as it takes, and gives what it handed out", async () => {
    await openTestAccount({ usage: "merchant", signUp: "done" });
    const team = getAccountTeamKeys()!;
    const integration = await integrationOf(team);
    // Slow addresses: no deadline cuts the filling short.
    jest.mocked(newDepositAddress).mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      wallet.next += 1;
      return taprootAddress(wallet.next);
    });
    await syncIntegrationAddresses();
    expect((await lotOf(team, integration))?.addresses).toHaveLength(INTEGRATION_LOT_SIZE);

    // A failing wallet: what it gave before failing.
    wallet.failAfter = wallet.next + 3;
    jest.mocked(newDepositAddress).mockImplementation(async () => {
      if (wallet.next >= wallet.failAfter) throw new WalletError("requestFailed", "Exhausted");
      wallet.next += 1;
      return taprootAddress(wallet.next);
    });
    await witness(team, integration, taprootAddress(1), "aa".repeat(32), null);
    await witness(team, integration, taprootAddress(2), "bb".repeat(32), null);
    await witness(team, integration, taprootAddress(3), "cc".repeat(32), null);
    await witness(team, integration, taprootAddress(4), "dd".repeat(32), null);
    await syncIntegrationAddresses();
    expect((await lotOf(team, integration))?.addresses).toHaveLength(INTEGRATION_LOT_SIZE - 1);
  });

  it("publishes the lot as it fills, every INTEGRATION_LOT_PUBLISH_EVERY addresses", async () => {
    await openTestAccount({ usage: "merchant", signUp: "done" });
    const team = getAccountTeamKeys()!;
    const integration = await integrationOf(team);
    // The wallet waits before its 26th address.
    const resume = gate();
    jest.mocked(newDepositAddress).mockImplementation(async () => {
      if (wallet.next === 25) await resume.opened;
      wallet.next += 1;
      return taprootAddress(wallet.next);
    });
    let clock = NOW;

    const filling = syncIntegrationAddresses({ now: () => (clock += 1) });

    // Its servers already have the first 20, before the lot is full.
    await until(async () => (await lotOf(team, integration))?.addresses.length === 20);
    expect((await lotOf(team, integration))?.addresses).toEqual(
      Array.from({ length: 20 }, (_, i) => taprootAddress(i + 1))
    );
    resume.open();
    await filling;
    expect((await lotOf(team, integration))?.addresses).toEqual(
      Array.from({ length: INTEGRATION_LOT_SIZE }, (_, i) => taprootAddress(i + 1))
    );
    // One copy every INTEGRATION_LOT_PUBLISH_EVERY addresses, the full lot's included: none twice.
    expect(lotCopies(team, integration)).toHaveLength(
      (INTEGRATION_LOT_SIZE / INTEGRATION_LOT_PUBLISH_EVERY) * DEFAULT_RELAYS.length
    );
    expect(wallet.connected).toBe(false);
  });

  it("never publishes two copies in one second, nor dates the lot past the next second", async () => {
    await openTestAccount({ usage: "merchant", signUp: "done" });
    const team = getAccountTeamKeys()!;
    const integration = await integrationOf(team);

    // Every address within the same second.
    await syncIntegrationAddresses({ now: () => NOW });

    const lot = await lotOf(team, integration);
    expect(lot?.addresses).toHaveLength(INTEGRATION_LOT_SIZE);
    expect(lot?.updatedAt).toBe(NOW + 1);
    // The first INTEGRATION_LOT_PUBLISH_EVERY at once, the rest once the wallet gave them all.
    expect(lotCopies(team, integration).map(({ event }) => event?.created_at)).toEqual([
      ...DEFAULT_RELAYS.map(() => NOW),
      ...DEFAULT_RELAYS.map(() => NOW + 1)
    ]);
  });

  it("publishes each copy to a majority without waiting for a slow relay, which ends with the full lot", async () => {
    await openTestAccount({ usage: "merchant", signUp: "done" });
    const team = getAccountTeamKeys()!;
    const integration = await integrationOf(team);
    // One relay answers only once the filling ended: it holds no copy back, each one reaching the
    // others as soon as it is made.
    const [slowRelay] = DEFAULT_RELAYS;
    const answer = gate();
    const publish = relays.publishEvent;
    const slow = jest.spyOn(relays, "publishEvent").mockImplementation(async (url, ...args) => {
      if (url === slowRelay) await answer.opened;
      return publish(url, ...args);
    });
    let clock = NOW;
    try {
      await syncIntegrationAddresses({ now: () => (clock += 1) });
      // Every copy, every INTEGRATION_LOT_PUBLISH_EVERY addresses, to every relay that answers; the
      // slow one's still waiting.
      const copies = INTEGRATION_LOT_SIZE / INTEGRATION_LOT_PUBLISH_EVERY;
      expect(lotCopies(team, integration)).toHaveLength(copies * (DEFAULT_RELAYS.length - 1));
      expect((await lotOf(team, integration, DEFAULT_RELAYS.slice(1)))?.addresses).toHaveLength(
        INTEGRATION_LOT_SIZE
      );
      answer.open();
      // The slow relay takes them all in the end, the full lot the one it keeps.
      await until(
        async () =>
          (await lotOf(team, integration, [slowRelay]))?.addresses.length === INTEGRATION_LOT_SIZE
      );
      expect(lotCopies(team, integration)).toHaveLength(copies * DEFAULT_RELAYS.length);
    } finally {
      slow.mockRestore();
      answer.open();
    }

    expect((await lotOf(team, integration))?.addresses).toEqual(
      Array.from({ length: INTEGRATION_LOT_SIZE }, (_, i) => taprootAddress(i + 1))
    );
  });

  it("publishes a copy no majority of the relays took again, at the end", async () => {
    await openTestAccount({ usage: "merchant", signUp: "done" });
    const team = getAccountTeamKeys()!;
    const integration = await integrationOf(team);
    // A majority of the relays refuses the first copy; then the wallet fails.
    for (const relay of DEFAULT_RELAYS.slice(0, 3)) relays.readOnly.add(relay);
    const resume = gate();
    jest.mocked(newDepositAddress).mockImplementation(async () => {
      if (wallet.next === INTEGRATION_LOT_PUBLISH_EVERY) {
        await resume.opened;
        throw new WalletError("requestFailed", "Exhausted");
      }
      wallet.next += 1;
      return taprootAddress(wallet.next);
    });
    let clock = NOW;

    const filling = syncIntegrationAddresses({ now: () => (clock += 1) });
    await until(() => lotCopies(team, integration).length === DEFAULT_RELAYS.length);
    relays.readOnly.clear();
    resume.open();
    await filling;

    expect((await lotOf(team, integration))?.addresses).toEqual(
      Array.from({ length: INTEGRATION_LOT_PUBLISH_EVERY }, (_, i) => taprootAddress(i + 1))
    );
    expect(lotCopies(team, integration)).toHaveLength(2 * DEFAULT_RELAYS.length);
  });

  it("fills the lot of an integration created while a filling runs, once that one ends", async () => {
    await openTestAccount({ usage: "merchant", signUp: "done" });
    const team = getAccountTeamKeys()!;
    const first = await integrationOf(team);
    // The wallet waits before its 6th address.
    const resume = gate();
    jest.mocked(newDepositAddress).mockImplementation(async () => {
      if (wallet.next === 5) await resume.opened;
      wallet.next += 1;
      return taprootAddress(wallet.next);
    });
    const filling = syncIntegrationAddresses();
    await until(() => jest.mocked(newDepositAddress).mock.calls.length === 6);

    // Created meanwhile: the filling running read the roster before it.
    const second = await integrationOf(team, "fedcba9876543210fedcba9876543210");
    const again = syncIntegrationAddresses({ again: true });
    // A login or unlock meanwhile shares the filling running; a second creation, the next one.
    expect(syncIntegrationAddresses()).toBe(filling);
    expect(syncIntegrationAddresses({ again: true })).toBe(again);
    resume.open();
    await again;

    const lots = [await lotOf(team, first), await lotOf(team, second)];
    expect(lots[0]?.addresses).toHaveLength(INTEGRATION_LOT_SIZE);
    expect(lots[1]?.addresses).toHaveLength(INTEGRATION_LOT_SIZE);
    const given = lots.flatMap((lot) => lot?.addresses ?? []);
    expect(new Set(given).size).toBe(2 * INTEGRATION_LOT_SIZE);
    expect(wallet.connected).toBe(false);
  });

  it("fills at once when no filling runs", async () => {
    await openTestAccount({ usage: "merchant", signUp: "done" });
    const team = getAccountTeamKeys()!;
    const integration = await integrationOf(team);

    await syncIntegrationAddresses({ again: true });

    expect((await lotOf(team, integration))?.addresses).toHaveLength(INTEGRATION_LOT_SIZE);
  });
});

/** A deposit the wallet received, of transaction `txId`. */
function deposit(txId: string, amountSats: bigint, timestamp = NOW): WalletPayment {
  return {
    id: `deposit-${txId}`,
    direction: "receive",
    status: "completed",
    amountSats,
    feeSats: 0n,
    timestamp,
    network: "bitcoin",
    txId
  };
}

describe('"Wallet" tells a deposit\'s sale from the witnesses', () => {
  it("names the integration's sale whose witness names the transaction", async () => {
    await openTestAccount({ usage: "merchant", signUp: "done" });
    const team = getAccountTeamKeys()!;
    const integration = await integrationOf(team);
    const address = taprootAddress(7);
    // An older order leased it, paid over Lightning; then this one, paid on-chain.
    await lease(team, integration, "ORD-1", address, {
      createdAt: NOW - 9000,
      expiresAt: NOW - 8000
    });
    const registry = await lease(team, integration, "ORD-2", address);
    const txid = mempool.pay(address, 49_000n);
    await witness(team, integration, address, txid, registry);

    const found = await loadOnchainSales([{ txid, at: NOW }]);

    expect(found?.retry).toEqual([]);
    expect(found?.sales.get(txid)).toEqual([
      {
        author: registry.saleKeys.nostr.publicKey,
        fiat: { minor: 2450, digits: 2, currency: "CHF" },
        note: "Order ORD-2",
        taker: { kind: "integration", id: integration.id },
        // When its server saw it paid, not when the wallet claimed it.
        paidAt: NOW - 300,
        // Its sale's key and its order's invoice: where the owner's acceptance of it is.
        key: registry.saleKey,
        lease: {
          integration: integration.id,
          address,
          expiresAt: NOW + 300,
          sats: 49_000n,
          tolerance: 0
        }
      }
    ]);
    // No explorer: the witness names the address.
    expect(mempool.chain.calls).toEqual([]);
    // In the list: one row of the integration's sale, with the deposit.
    const items = ownerActivity({
      payments: [deposit(txid, 49_000n)],
      declarations: new Map(),
      onchainSales: found!.sales,
      links: [],
      sales: [],
      integrations: new Map([
        [integration.id, { kind: "integration", id: integration.id, name: integration.name }]
      ]),
      now: NOW
    });
    expect(items).toEqual([
      expect.objectContaining({
        source: "integration",
        note: "Order ORD-2",
        fiat: { minor: 2450, digits: 2, currency: "CHF" },
        sats: 49_000n,
        by: { kind: "integration", id: integration.id, name: integration.name }
      })
    ]);
  });

  it("names nobody's sale for a transaction seen late, or no witness names", async () => {
    await openTestAccount({ usage: "merchant", signUp: "done" });
    const team = getAccountTeamKeys()!;
    const integration = await integrationOf(team);
    const address = taprootAddress(7);
    await lease(team, integration, "ORD-1", address);
    const late = "aa".repeat(32);
    await witness(team, integration, address, late, null);

    const found = await loadOnchainSales([
      { txid: late, at: NOW },
      { txid: "bb".repeat(32), at: NOW }
    ]);

    expect(found?.sales.get(late)).toEqual([]);
    expect(found?.sales.get("bb".repeat(32))).toEqual([]);
  });

  it("names the sale of a witness made after its lease's end, paid by that end", async () => {
    await openTestAccount({ usage: "merchant", signUp: "done" });
    const team = getAccountTeamKeys()!;
    const integration = await integrationOf(team);
    const address = taprootAddress(7);
    const registry = await lease(team, integration, "ORD-1", address, {
      createdAt: NOW - 9000,
      expiresAt: NOW - 8000
    });
    const txid = "aa".repeat(32);
    // Seen by no check in time, BlockCypher's time in time: its server witnessed it later.
    await witness(team, integration, address, txid, registry, NOW - 100);

    const found = await loadOnchainSales([{ txid, at: NOW }]);

    expect(found?.sales.get(txid)).toEqual([
      expect.objectContaining({
        author: registry.saleKeys.nostr.publicKey,
        paidAt: NOW - 8000 + LEASE_GRACE_SECONDS
      })
    ]);
  });

  it("names the sale of a replacement (RBF), paid when the payment it replaces was seen", async () => {
    await openTestAccount({ usage: "merchant", signUp: "done" });
    const team = getAccountTeamKeys()!;
    const integration = await integrationOf(team);
    const address = taprootAddress(7);
    const registry = await lease(team, integration, "ORD-1", address);
    const [first, bump, again, stranger] = ["a1", "a2", "a3", "a4"].map((byte) => byte.repeat(32));
    const coin = (n: number) => `${"c".repeat(63)}${n}:0`;
    await witness(team, integration, address, first!, registry, NOW - 300, { inputs: [coin(1)] });
    // A fee bump after the lease's end, then another one through the bump's own coin only.
    await witness(team, integration, address, bump!, registry, NOW + 900, {
      inputs: [coin(1), coin(2)],
      replacement: true
    });
    await witness(team, integration, address, again!, registry, NOW + 1800, {
      inputs: [coin(2)],
      replacement: true
    });
    // Witnessed as a replacement, but of no payment witnessed in time.
    await witness(team, integration, address, stranger!, registry, NOW + 1800, {
      inputs: [coin(9)],
      replacement: true
    });

    const found = await loadOnchainSales([
      { txid: bump!, at: NOW + 4000 },
      { txid: again!, at: NOW + 4000 },
      { txid: stranger!, at: NOW + 4000 }
    ]);

    const sold = [
      expect.objectContaining({ author: registry.saleKeys.nostr.publicKey, paidAt: NOW - 300 })
    ];
    expect(found?.sales.get(bump!)).toEqual(sold);
    expect(found?.sales.get(again!)).toEqual(sold);
    expect(found?.sales.get(stranger!)).toEqual([]);
  });

  it("names nobody's sale for a transaction two orders' witnesses name", async () => {
    await openTestAccount({ usage: "merchant", signUp: "done" });
    const team = getAccountTeamKeys()!;
    const integration = await integrationOf(team);
    const other = "bb".repeat(32);
    const first = await lease(team, integration, "ORD-1", taprootAddress(8));
    const second = await lease(team, integration, "ORD-2", taprootAddress(8));
    await witness(team, integration, taprootAddress(8), other, second);
    await witness(team, integration, taprootAddress(8), other, first);

    const found = await loadOnchainSales([{ txid: other, at: NOW }]);

    expect(found?.sales.get(other)).toEqual([]);
  });

  it("names nobody's sale for a transaction witnesses of two orders name for their invoices", async () => {
    await openTestAccount({ usage: "merchant", signUp: "done" });
    const team = getAccountTeamKeys()!;
    const integration = await integrationOf(team);
    const address = taprootAddress(8);
    const txid = "bb".repeat(32);
    const first = await lease(team, integration, "ORD-1", address, { confirmed: true });
    const second = await lease(team, integration, "ORD-2", address, { confirmed: true });
    await witness(team, integration, address, txid, first, NOW - 300, { expiresAt: NOW + 300 });
    await witness(team, integration, address, txid, second, NOW - 200, { expiresAt: NOW + 300 });

    expect((await loadOnchainSales([{ txid, at: NOW }]))?.sales.get(txid)).toEqual([]);
  });

  it("names the sale whose witness tells an earlier invoice, paid by that invoice's lease's end", async () => {
    await openTestAccount({ usage: "merchant", signUp: "done" });
    const team = getAccountTeamKeys()!;
    const integration = await integrationOf(team);
    const address = taprootAddress(7);
    const txid = "aa".repeat(32);
    // The order's first invoice (its end NOW - 8000); a later invoice of the order leased the
    // address again, its mark replacing that lease. The witness, made after the first lease's end
    // (BlockCypher's time), names the first invoice.
    const registry = await lease(team, integration, "ORD-1", address, {
      createdAt: NOW - 9000,
      expiresAt: NOW - 8000,
      confirmed: true
    });
    await lease(team, integration, "ORD-1", address, {
      createdAt: NOW - 600,
      expiresAt: NOW + 300,
      confirmed: true,
      at: NOW - 599
    });
    await witness(team, integration, address, txid, registry, NOW - 100, {
      expiresAt: NOW - 8000
    });

    const found = await loadOnchainSales([{ txid, at: NOW }]);

    expect(found?.retry).toEqual([]);
    expect(found?.sales.get(txid)).toEqual([
      expect.objectContaining({
        author: registry.saleKeys.nostr.publicKey,
        paidAt: NOW - 8000 + LEASE_GRACE_SECONDS
      })
    ]);
  });

  it("dates a payment by the end of the lease read at the latest, whatever its witness's expiresAt", async () => {
    await openTestAccount({ usage: "merchant", signUp: "done" });
    const team = getAccountTeamKeys()!;
    const integration = await integrationOf(team);
    const address = taprootAddress(7);
    const txid = "aa".repeat(32);
    const registry = await lease(team, integration, "ORD-1", address, {
      createdAt: NOW - 9000,
      expiresAt: NOW - 8000,
      confirmed: true
    });
    // An `expiresAt` of no lease the registry holds, after the one read.
    await witness(team, integration, address, txid, registry, NOW - 100, {
      expiresAt: NOW - 1000
    });

    const found = await loadOnchainSales([{ txid, at: NOW }]);

    expect(found?.sales.get(txid)).toEqual([
      expect.objectContaining({
        author: registry.saleKeys.nostr.publicKey,
        paidAt: NOW - 8000 + LEASE_GRACE_SECONDS
      })
    ]);
  });

  it("asks again while its sale's record at the address is a try never confirmed", async () => {
    await openTestAccount({ usage: "merchant", signUp: "done" });
    const team = getAccountTeamKeys()!;
    const integration = await integrationOf(team);
    const address = taprootAddress(7);
    const txid = "aa".repeat(32);
    const registry = await lease(team, integration, "ORD-1", address, {
      createdAt: NOW - 9000,
      expiresAt: NOW - 8000,
      confirmed: true
    });
    // A later try of the order, never confirmed, replaced the lease the witness stands for.
    await lease(team, integration, "ORD-1", address, {
      createdAt: NOW - 600,
      expiresAt: NOW + 300,
      confirmed: false
    });
    await witness(team, integration, address, txid, registry, NOW - 8500, {
      expiresAt: NOW - 8000
    });

    const found = await loadOnchainSales([{ txid, at: NOW }]);

    expect(found?.retry).toEqual([txid]);
    expect(found?.sales.has(txid)).toBe(false);
  });

  it("asks again without a majority's answer", async () => {
    await openTestAccount({ usage: "merchant", signUp: "done" });
    const team = getAccountTeamKeys()!;
    const txid = "aa".repeat(32);

    await integrationOf(team);
    const seats = {
      employees: [],
      integrations: [{ id: INTEGRATION_ID, name: "Shopify store", createdAt: NOW }],
      assistants: [],
      removed: []
    };
    for (const relay of DEFAULT_RELAYS) relays.unreachable.add(relay);

    const found = await readOnchainSales(team, [{ txid, at: NOW }], {
      seats: seats as never,
      relays: DEFAULT_RELAYS
    });

    expect(found).toEqual({ sales: new Map(), retry: [txid] });
  });

  it("asks again while a witness of a newer format may name it", async () => {
    await openTestAccount({ usage: "merchant", signUp: "done" });
    const team = getAccountTeamKeys()!;
    const integration = await integrationOf(team);
    const keys = deriveIntegrationKeys(integrationSecretKey(team, integration.id));
    await publishToRelays(
      sealRecord({
        type: "integration-onchain-seen",
        value: { version: 2 },
        signer: keys.seen.nostr.secretKey,
        encryptionKey: keys.channel.encryptionKey,
        address: witnessAddress(keys, taprootAddress(7), "aa".repeat(32), null),
        createdAt: NOW - 300
      }),
      {
        relays: DEFAULT_RELAYS,
        channel: "account",
        timeoutMs: 1000,
        authKey: keys.seen.nostr.secretKey
      }
    );

    const found = await loadOnchainSales([{ txid: "aa".repeat(32), at: NOW }]);

    expect(found?.retry).toEqual(["aa".repeat(32)]);
    expect(found?.sales.has("aa".repeat(32))).toBe(false);
  });

  it("asks again while its sale's record at the address is of a newer format", async () => {
    await openTestAccount({ usage: "merchant", signUp: "done" });
    const team = getAccountTeamKeys()!;
    const integration = await integrationOf(team);
    const address = taprootAddress(7);
    const registry = saleOf(team, integration, "ORD-2");
    const place = onchainRegistryAddress(registry.key, address);
    await publishToRelays(
      sealRecord({
        type: "registry-onchain",
        value: { version: 2 },
        signer: registry.saleKeys.nostr.secretKey,
        encryptionKey: outerKey(registry.key, place, registry.saleKeys.nostr.publicKey),
        address: place,
        createdAt: NOW - 600
      }),
      { relays: DEFAULT_RELAYS, channel: "anonymous", timeoutMs: 1000 }
    );
    const txid = "aa".repeat(32);
    await witness(team, integration, address, txid, registry);

    const found = await loadOnchainSales([{ txid, at: NOW }]);

    // Never nobody's for good: the owner's copy would keep that.
    expect(found?.retry).toEqual([txid]);
    expect(found?.sales.has(txid)).toBe(false);
  });

  it("names nobody's sale for a lease carrying another sale's key", async () => {
    await openTestAccount({ usage: "merchant", signUp: "done" });
    const team = getAccountTeamKeys()!;
    const integration = await integrationOf(team);
    const address = taprootAddress(7);
    const registry = saleOf(team, integration, "ORD-2");
    // Signed by ORD-2's sale, naming ORD-1's key inside.
    const forged = { ...registry, saleKey: saleOf(team, integration, "ORD-1").saleKey };
    await publishToRelays(
      leaseEvent(
        forged,
        {
          address,
          sats: 49_000n,
          invoice: null,
          createdAt: NOW - 600,
          expiresAt: NOW + 300,
          confirmed: true
        },
        { fiat: { minor: 2450, digits: 2, currency: "CHF" }, note: "Order ORD-2" },
        NOW - 600
      ),
      { relays: DEFAULT_RELAYS, channel: "anonymous", timeoutMs: 1000 }
    );
    const txid = "aa".repeat(32);
    await witness(team, integration, address, txid, registry);

    const found = await loadOnchainSales([{ txid, at: NOW }]);

    expect(found?.retry).toEqual([]);
    expect(found?.sales.get(txid)).toEqual([]);
  });

  it("reads a removed integration's witnesses too", async () => {
    await openTestAccount({ usage: "merchant", signUp: "done" });
    const team = getAccountTeamKeys()!;
    const integration = await integrationOf(team);
    const address = taprootAddress(7);
    const registry = await lease(team, integration, "ORD-2", address);
    const txid = "aa".repeat(32);
    await witness(team, integration, address, txid, registry);
    const seats = {
      employees: [],
      integrations: [],
      assistants: [],
      removed: [
        { role: "integration" as const, id: integration.id, name: integration.name, removedAt: NOW }
      ]
    };

    const found = await readOnchainSales(team, [{ txid, at: NOW }], {
      seats: seats as never,
      relays: DEFAULT_RELAYS
    });

    expect(found.sales.get(txid)).toEqual([
      expect.objectContaining({ author: registry.saleKeys.nostr.publicKey })
    ]);
  });

  it("leaves a deposit of a month a year old to the owner's copy", async () => {
    await openTestAccount({ usage: "merchant", signUp: "done" });
    const team = getAccountTeamKeys()!;
    const integration = await integrationOf(team);
    const address = taprootAddress(7);
    const registry = await lease(team, integration, "ORD-2", address);
    const txid = "aa".repeat(32);
    await witness(team, integration, address, txid, registry);
    const yearAgo = NOW - 400 * 24 * 3600;

    // No copy of that month: the witnesses and the registry tell it, as for a Lightning payment.
    const found = await loadOnchainSales([{ txid, at: yearAgo }]);

    expect(found?.sales.get(txid)).toEqual([
      expect.objectContaining({ author: registry.saleKeys.nostr.publicKey })
    ]);
  });
});

describe("an integration's payments not final yet (findIntegrationPending)", () => {
  const call = (team: TeamKeys) => ({
    relays: DEFAULT_RELAYS,
    channel: "account" as const,
    timeoutMs: 1000,
    authKey: team.secretKey
  });

  it("has none without an order nor a payment", async () => {
    await openTestAccount({ usage: "merchant", signUp: "done" });
    const team = getAccountTeamKeys()!;
    const integration = await integrationOf(team);

    await expect(findIntegrationPending(team, integration, call(team), NOW)).resolves.toEqual({
      open: 0,
      openUntil: null,
      confirming: 0
    });
  });

  it("counts an order whose address is still leased, an address of its lot", async () => {
    await openTestAccount({ usage: "merchant", signUp: "done" });
    const team = getAccountTeamKeys()!;
    const integration = await integrationOf(team);
    await syncIntegrationAddresses();
    // Open until NOW + 300 (its lease until NOW + 420); an older one, ended.
    await lease(team, integration, "ORD-1", taprootAddress(1));
    await lease(team, integration, "ORD-0", taprootAddress(2), {
      createdAt: NOW - 3000,
      expiresAt: NOW - 2000
    });

    // A try never confirmed (SPEC.md §31) is no order's: nothing to settle.
    await lease(team, integration, "ORD-2", taprootAddress(3), { confirmed: false });
    await expect(findIntegrationPending(team, integration, call(team), NOW)).resolves.toEqual({
      open: 1,
      openUntil: NOW + 300 + 120,
      confirming: 0
    });
    // Its lease's end and the clock tolerance past: final.
    await expect(
      findIntegrationPending(team, integration, call(team), NOW + 420 + 301)
    ).resolves.toMatchObject({ open: 0 });
  });

  it("counts a payment seen in time until its 3 confirmations, not one dropped since", async () => {
    await openTestAccount({ usage: "merchant", signUp: "done" });
    const team = getAccountTeamKeys()!;
    const integration = await integrationOf(team);
    const registry = await lease(team, integration, "ORD-1", taprootAddress(7), {
      createdAt: NOW - 9000,
      expiresAt: NOW - 8000
    });
    const txid = mempool.pay(taprootAddress(7), 49_000n);
    await witness(team, integration, taprootAddress(7), txid, registry);
    // A transaction its server saw, replaced since: no payment.
    await witness(team, integration, taprootAddress(7), "dd".repeat(32), registry);

    await expect(findIntegrationPending(team, integration, call(team), NOW)).resolves.toEqual({
      open: 0,
      openUntil: null,
      confirming: 1
    });
    mempool.mine(2);
    await expect(findIntegrationPending(team, integration, call(team), NOW)).resolves.toMatchObject(
      { confirming: 1 }
    );
    mempool.mine(1);
    await expect(findIntegrationPending(team, integration, call(team), NOW)).resolves.toMatchObject(
      { confirming: 0 }
    );
  });

  it("counts a replacement (RBF) of a payment seen in time, its server's witness made or not", async () => {
    await openTestAccount({ usage: "merchant", signUp: "done" });
    const team = getAccountTeamKeys()!;
    const integration = await integrationOf(team);
    const address = taprootAddress(7);
    const registry = await lease(team, integration, "ORD-1", address, {
      createdAt: NOW - 9000,
      expiresAt: NOW - 8000
    });
    const txid = mempool.pay(address, 49_000n);
    const { inputs } = mempool.chain.txs.find((tx) => tx.txid === txid)!;
    await witness(team, integration, address, txid, registry, NOW - 8500, { inputs });
    // A fee bump its server has not seen yet, and a late payment of no order.
    const bump = mempool.replace(txid, { more: [mempool.freshCoin()] });
    mempool.pay(address, 1_000n);

    await expect(findIntegrationPending(team, integration, call(team), NOW)).resolves.toEqual({
      open: 0,
      openUntil: null,
      confirming: 1
    });
    // Its server witnessed it since: still the one payment.
    await witness(team, integration, address, bump, registry, NOW - 100, {
      inputs: mempool.chain.txs.find((tx) => tx.txid === bump)!.inputs,
      replacement: true
    });
    await expect(findIntegrationPending(team, integration, call(team), NOW)).resolves.toMatchObject(
      { confirming: 1 }
    );
    mempool.mine(3);
    await expect(findIntegrationPending(team, integration, call(team), NOW)).resolves.toMatchObject(
      { confirming: 0 }
    );
  });

  it("cannot tell without the explorer, nor without a majority of the relays", async () => {
    await openTestAccount({ usage: "merchant", signUp: "done" });
    const team = getAccountTeamKeys()!;
    const integration = await integrationOf(team);
    const registry = await lease(team, integration, "ORD-1", taprootAddress(7), {
      createdAt: NOW - 9000,
      expiresAt: NOW - 8000
    });
    await witness(
      team,
      integration,
      taprootAddress(7),
      mempool.pay(taprootAddress(7), 1000n),
      registry
    );
    mempool.chain.down.add("https://mempool.space/api");
    await expect(findIntegrationPending(team, integration, call(team), NOW)).resolves.toBeNull();
    mempool.chain.down.clear();
    for (const relay of DEFAULT_RELAYS) relays.unreachable.add(relay);
    await expect(findIntegrationPending(team, integration, call(team), NOW)).resolves.toBeNull();
  });

  it("keeps the integration while one is pending, and removes it once all are final", async () => {
    await openTestAccount({ usage: "merchant", signUp: "done" });
    const team = getAccountTeamKeys()!;
    const integration = await integrationOf(team);
    await syncIntegrationAddresses();
    const registry = await lease(team, integration, "ORD-1", taprootAddress(1), {
      createdAt: Math.floor(Date.now() / 1000) - 60,
      expiresAt: Math.floor(Date.now() / 1000) + 300
    });

    const refused = await removeIntegration(integration).catch((error: unknown) => error);
    expect(refused).toBeInstanceOf(TeamError);
    expect(refused).toMatchObject({
      code: "integrationPending",
      pending: { open: 1, confirming: 0 }
    });
    expect((await loadIntegrations()).integrations).toEqual([
      expect.objectContaining({ id: integration.id })
    ]);

    // The order withdrew its lease (paid over Lightning): nothing pending any more.
    await publishToRelays(
      withdrawalEvent(registry, taprootAddress(1), Math.floor(Date.now() / 1000)),
      { relays: DEFAULT_RELAYS, channel: "anonymous", timeoutMs: 1000 }
    );
    await removeIntegration(integration);
    expect((await loadIntegrations()).integrations).toEqual([]);
  });

  it("removes it all the same once confirmed again, whatever its own records say", async () => {
    await openTestAccount({ usage: "merchant", signUp: "done" });
    const team = getAccountTeamKeys()!;
    const integration = await integrationOf(team);
    await syncIntegrationAddresses();
    const keys = deriveIntegrationKeys(integrationSecretKey(team, integration.id));
    const now = Math.floor(Date.now() / 1000);
    // Whoever holds its key (a key that leaked) writes them: an order whose lease claims to end in
    // ten years.
    await lease(team, integration, "ORD-1", taprootAddress(1), {
      createdAt: now - 60,
      expiresAt: now + 10 * 365 * 24 * 3600
    });
    await expect(removeIntegration(integration)).rejects.toMatchObject({
      code: "integrationPending",
      pending: { open: 1 }
    });
    // And a witness of a newer format: whether its payments are final cannot be told any more.
    await publishToRelays(
      sealRecord({
        type: "integration-onchain-seen",
        value: { version: 2 },
        signer: keys.seen.nostr.secretKey,
        encryptionKey: keys.channel.encryptionKey,
        address: witnessAddress(keys, taprootAddress(7), "aa".repeat(32), null),
        createdAt: now - 300
      }),
      {
        relays: DEFAULT_RELAYS,
        channel: "account",
        timeoutMs: 1000,
        authKey: keys.seen.nostr.secretKey
      }
    );
    const refused = await removeIntegration(integration).catch((error: unknown) => error);
    expect(refused).toBeInstanceOf(TeamError);
    expect(refused).toMatchObject({ code: "integrationPending", pending: null });
    expect((await loadIntegrations()).integrations).toEqual([
      expect.objectContaining({ id: integration.id })
    ]);

    // Confirmed again: removed, whatever they say.
    await removeIntegration(integration, { force: true });
    expect((await loadIntegrations()).integrations).toEqual([]);
  });
});

describe('"Wallet"\'s integration orders not final yet (readIntegrationOrders)', () => {
  /** What the wallet tells: its claimed deposits, its Lightning payments, complete since 0. */
  const view = (
    claimed: string[] = [],
    lightning: string[] = [],
    completeSince: number | null = 0
  ): WalletView => ({ claimed: new Set(claimed), lightning: new Set(lightning), completeSince });
  const read = (
    team: TeamKeys,
    integration: Integration | Integration[],
    wallet = view(),
    now = NOW
  ) =>
    readIntegrationOrders(team, wallet, {
      seats: { employees: [], integrations: [integration].flat(), assistants: [], removed: [] },
      relays: DEFAULT_RELAYS,
      since: NOW - 31 * 24 * 3600,
      now
    });
  /** An order of ORD-1 whose lease ended (its address taprootAddress(7)). */
  const ended = { createdAt: NOW - 9000, expiresAt: NOW - 8000 };

  it("lists an order underpaid in time, its rest, until it is paid", async () => {
    const team = deriveTeamKeys(encodeWalletSecret({ mnemonic: TEST_MNEMONIC }));
    const integration = await integrationOf(team);
    const address = taprootAddress(7);
    const registry = await lease(team, integration, "ORD-1", address, ended);
    const txid = mempool.pay(address, 20_000n);
    await witness(team, integration, address, txid, registry, NOW - 8500, { sats: 20_000n });

    await expect(read(team, integration)).resolves.toEqual([
      {
        author: registry.saleKeys.nostr.publicKey,
        fiat: { minor: 2450, digits: 2, currency: "CHF" },
        note: "Order ORD-1",
        taker: { kind: "integration", id: integration.id },
        at: NOW - 8500,
        state: "underpaid",
        received: 20_000n,
        confirmed: false,
        due: 49_000n,
        tolerance: 0,
        lease: {
          integration: integration.id,
          address,
          expiresAt: ended.expiresAt,
          sats: 49_000n,
          tolerance: 0
        }
      }
    ]);
    // Mined and claimed by the wallet: still underpaid, the explorer tells what else came; its
    // on-chain part deep enough (a rest paid over Lightning would pay it: ownerActivity).
    mempool.mine(3);
    await expect(read(team, integration, view([txid]))).resolves.toMatchObject([
      { state: "underpaid", received: 20_000n, confirmed: true }
    ]);
  });

  it("judges an order with its lease's tolerance: short by no more, paid once deep enough", async () => {
    const team = deriveTeamKeys(encodeWalletSecret({ mnemonic: TEST_MNEMONIC }));
    const integration = await integrationOf(team);
    const address = taprootAddress(7);
    // 5 % (its server's channel's when the order was made): 46 550 of 49 000 sats pay it.
    const registry = await lease(team, integration, "ORD-1", address, {
      ...ended,
      tolerance: 500
    });
    const txid = mempool.pay(address, 46_550n);
    await witness(team, integration, address, txid, registry, NOW - 8500, { sats: 46_550n });

    await expect(read(team, integration)).resolves.toMatchObject([
      { state: "unconfirmed", received: 46_550n, due: 49_000n, tolerance: 500 }
    ]);
    // 3 deep: paid, left to the wallet's deposit.
    mempool.mine(3);
    await expect(read(team, integration)).resolves.toEqual([]);
  });

  it("asks the whole rest of an order short by more than its lease's tolerance", async () => {
    const team = deriveTeamKeys(encodeWalletSecret({ mnemonic: TEST_MNEMONIC }));
    const integration = await integrationOf(team);
    const address = taprootAddress(7);
    const registry = await lease(team, integration, "ORD-1", address, {
      ...ended,
      tolerance: 500
    });
    const txid = mempool.pay(address, 46_549n);
    await witness(team, integration, address, txid, registry, NOW - 8500, { sats: 46_549n });

    await expect(read(team, integration)).resolves.toMatchObject([
      { state: "underpaid", received: 46_549n, due: 49_000n, tolerance: 500 }
    ]);
    // Deep enough, still underpaid.
    mempool.mine(3);
    await expect(read(team, integration, view([txid]))).resolves.toMatchObject([
      { state: "underpaid", received: 46_549n, confirmed: true }
    ]);
  });

  it('lists an order paid in time "Confirming" until its 3 confirmations', async () => {
    const team = deriveTeamKeys(encodeWalletSecret({ mnemonic: TEST_MNEMONIC }));
    const integration = await integrationOf(team);
    const address = taprootAddress(7);
    const registry = await lease(team, integration, "ORD-1", address, ended);
    const txid = mempool.pay(address, 49_000n);
    await witness(team, integration, address, txid, registry, NOW - 8500);

    await expect(read(team, integration)).resolves.toMatchObject([
      { author: registry.saleKeys.nostr.publicKey, state: "unconfirmed", received: 49_000n }
    ]);
    mempool.mine(2);
    await expect(read(team, integration)).resolves.toMatchObject([{ state: "unconfirmed" }]);
    // 3 deep: paid, left to the wallet's deposit.
    mempool.mine(1);
    await expect(read(team, integration)).resolves.toEqual([]);
  });

  it("asks no explorer for an order its claimed deposits paid in full", async () => {
    const team = deriveTeamKeys(encodeWalletSecret({ mnemonic: TEST_MNEMONIC }));
    const integration = await integrationOf(team);
    const address = taprootAddress(7);
    const registry = await lease(team, integration, "ORD-1", address, ended);
    const txid = mempool.pay(address, 49_000n);
    await witness(team, integration, address, txid, registry, NOW - 8500);
    mempool.mine(3);
    mempool.chain.calls.length = 0;

    await expect(read(team, integration, view([txid]))).resolves.toEqual([]);
    expect(mempool.chain.calls).toEqual([]);
  });

  it("asks the explorer for an order a claimed deposit pays as another invoice's replacement", async () => {
    const team = deriveTeamKeys(encodeWalletSecret({ mnemonic: TEST_MNEMONIC }));
    const integration = await integrationOf(team);
    const address = taprootAddress(7);
    const registry = await lease(team, integration, "ORD-1", address, ended);
    const other = saleOf(team, integration, "ORD-9");
    // Another order's payment in time, replaced by one its server witnessed for this order.
    const theirs = mempool.pay(address, 29_000n);
    await witness(team, integration, address, theirs, other, NOW - 8600, {
      sats: 29_000n,
      inputs: mempool.chain.txs.find((tx) => tx.txid === theirs)!.inputs,
      expiresAt: ended.expiresAt
    });
    const bump = mempool.replace(theirs);
    await witness(team, integration, address, bump, registry, NOW - 8500, {
      sats: 29_000n,
      inputs: mempool.chain.txs.find((tx) => tx.txid === bump)!.inputs
    });
    const own = mempool.pay(address, 20_000n);
    await witness(team, integration, address, own, registry, NOW - 8400, { sats: 20_000n });
    mempool.mine(3);

    // Both claimed, 49 000 sats: the replacement stands for the other order's payment, which
    // counts for nothing here (as the explorer's read tells it).
    await expect(read(team, integration, view([bump, own]))).resolves.toMatchObject([
      { state: "underpaid", received: 20_000n, confirmed: true }
    ]);
  });

  it("counts a payment no witness names while the lease runs, not after it", async () => {
    const team = deriveTeamKeys(encodeWalletSecret({ mnemonic: TEST_MNEMONIC }));
    const integration = await integrationOf(team);
    const address = taprootAddress(7);
    const registry = await lease(team, integration, "ORD-1", address);
    const first = mempool.pay(address, 20_000n);
    await witness(team, integration, address, first, registry, NOW - 500, { sats: 20_000n });
    // Its server has not checked the order since: it pays the address the order holds.
    const second = mempool.pay(address, 9_000n);

    await expect(read(team, integration)).resolves.toMatchObject([
      { state: "underpaid", received: 29_000n }
    ]);
    // Within the clock tolerance of its end (its server's clock may be ahead): its server tells.
    await expect(read(team, integration, view(), NOW + 420 - 299)).resolves.toEqual([]);
    // Past the lease's end, only its server tells whether it came in time: not listed meanwhile.
    const after = NOW + 300 + 121;
    await expect(read(team, integration, view(), after)).resolves.toEqual([]);
    // Seen late, for no order: the payment in time alone counts.
    await witness(team, integration, address, second, null, after - 10, { sats: 9_000n });
    await expect(read(team, integration, view(), after)).resolves.toMatchObject([
      { state: "underpaid", received: 20_000n }
    ]);
  });

  it("lists no order whose lease is a try never confirmed", async () => {
    const team = deriveTeamKeys(encodeWalletSecret({ mnemonic: TEST_MNEMONIC }));
    const integration = await integrationOf(team);
    const address = taprootAddress(7);
    const registry = await lease(team, integration, "ORD-1", address, {
      ...ended,
      confirmed: false
    });
    const txid = mempool.pay(address, 20_000n);
    await witness(team, integration, address, txid, registry, NOW - 8500, { sats: 20_000n });

    await expect(read(team, integration)).resolves.toEqual([]);
  });

  it("counts nothing of a transaction a witness of another invoice names", async () => {
    const team = deriveTeamKeys(encodeWalletSecret({ mnemonic: TEST_MNEMONIC }));
    const integration = await integrationOf(team);
    const address = taprootAddress(7);
    const registry = await lease(team, integration, "ORD-1", address, {
      ...ended,
      confirmed: true
    });
    const other = saleOf(team, integration, "ORD-9");
    const own = mempool.pay(address, 20_000n);
    const contested = mempool.pay(address, 9_000n);
    const earlier = mempool.pay(address, 5_000n);
    const ofInvoice = { expiresAt: ended.expiresAt };
    await witness(team, integration, address, own, registry, NOW - 8500, {
      sats: 20_000n,
      ...ofInvoice
    });
    // Witnessed for this invoice and for another order's: no order's.
    await witness(team, integration, address, contested, registry, NOW - 8400, {
      sats: 9_000n,
      ...ofInvoice
    });
    await witness(team, integration, address, contested, other, NOW - 8400, {
      sats: 9_000n,
      expiresAt: ended.expiresAt
    });
    // Witnessed for an earlier invoice of the order (another expiresAt): not this invoice's.
    await witness(team, integration, address, earlier, registry, NOW - 8300, {
      sats: 5_000n,
      expiresAt: ended.expiresAt - 3600
    });

    await expect(read(team, integration)).resolves.toMatchObject([
      { state: "underpaid", received: 20_000n }
    ]);
  });

  it("dates an order by its payment in time, by its lease's end at the latest", async () => {
    const team = deriveTeamKeys(encodeWalletSecret({ mnemonic: TEST_MNEMONIC }));
    const integration = await integrationOf(team);
    const address = taprootAddress(7);
    const registry = await lease(team, integration, "ORD-1", address, ended);
    const txid = mempool.pay(address, 20_000n);
    // Witnessed after the lease's end (BlockCypher's time told it came in time).
    await witness(team, integration, address, txid, registry, NOW - 7000, { sats: 20_000n });

    await expect(read(team, integration)).resolves.toMatchObject([
      { state: "underpaid", at: ended.expiresAt + 120 }
    ]);
  });

  it("counts a replacement (RBF) for the payment it replaces, never twice", async () => {
    const team = deriveTeamKeys(encodeWalletSecret({ mnemonic: TEST_MNEMONIC }));
    const integration = await integrationOf(team);
    const address = taprootAddress(7);
    const registry = await lease(team, integration, "ORD-1", address, ended);
    const txid = mempool.pay(address, 49_000n);
    const { inputs } = mempool.chain.txs.find((tx) => tx.txid === txid)!;
    await witness(team, integration, address, txid, registry, NOW - 8500, { inputs });
    const bump = mempool.replace(txid, { more: [mempool.freshCoin()] });
    await witness(team, integration, address, bump, registry, NOW - 100, {
      inputs: mempool.chain.txs.find((tx) => tx.txid === bump)!.inputs,
      replacement: true
    });

    await expect(read(team, integration)).resolves.toMatchObject([
      { state: "unconfirmed", received: 49_000n, at: NOW - 8500 }
    ]);
  });

  it("lists no order nothing paid in time, nor one whose payment was dropped", async () => {
    const team = deriveTeamKeys(encodeWalletSecret({ mnemonic: TEST_MNEMONIC }));
    const integration = await integrationOf(team);
    const address = taprootAddress(7);
    const registry = await lease(team, integration, "ORD-1", address, ended);
    await lease(team, integration, "ORD-2", taprootAddress(8));
    const txid = mempool.pay(address, 20_000n);
    await witness(team, integration, address, txid, registry, NOW - 8500, { sats: 20_000n });
    mempool.drop(txid);

    await expect(read(team, integration)).resolves.toEqual([]);
  });

  it("leaves an order with a Lightning invoice to the wallet: paid, or not told yet", async () => {
    const team = deriveTeamKeys(encodeWalletSecret({ mnemonic: TEST_MNEMONIC }));
    const integration = await integrationOf(team);
    const address = taprootAddress(7);
    const { paymentHash } = preimagePair(3);
    const pr = makeInvoice({
      amountMsat: 49_000_000n,
      paymentHash,
      timestamp: ended.createdAt,
      expirySeconds: ended.expiresAt - ended.createdAt
    });
    const invoice = { pr, decoded: decodeBolt11(pr)!, verifyUrl: "https://breez.tips/verify/x" };
    const registry = await lease(team, integration, "ORD-1", address, { ...ended, invoice });
    const txid = mempool.pay(address, 20_000n);
    await witness(team, integration, address, txid, registry, NOW - 8500, { sats: 20_000n });

    await expect(read(team, integration)).resolves.toMatchObject([{ state: "underpaid" }]);
    // Paid over Lightning: the wallet's payment is its row.
    await expect(read(team, integration, view([], [paymentHash]))).resolves.toEqual([]);
    // The wallet not synced yet, or not listing every payment since the order: not told.
    await expect(read(team, integration, view([], [], null))).resolves.toEqual([]);
    await expect(read(team, integration, view([], [], ended.createdAt + 1))).resolves.toEqual([]);
  });

  it("lists no order of another integration's lease, nor tells without the explorer", async () => {
    const team = deriveTeamKeys(encodeWalletSecret({ mnemonic: TEST_MNEMONIC }));
    const integration = await integrationOf(team);
    const other = await integrationOf(team, "fedcba9876543210fedcba9876543210");
    const address = taprootAddress(7);
    // Leased by the other integration's order, witnessed by this one's server.
    const registry = await lease(team, other, "ORD-1", address, ended);
    const txid = mempool.pay(address, 20_000n);
    await witness(team, integration, address, txid, registry, NOW - 8500, { sats: 20_000n });
    await expect(read(team, [integration, other])).resolves.toEqual([]);

    const own = await lease(team, integration, "ORD-3", taprootAddress(9), ended);
    await witness(
      team,
      integration,
      taprootAddress(9),
      mempool.pay(taprootAddress(9), 1_000n),
      own,
      NOW - 8500,
      { sats: 1_000n }
    );
    // The explorer's height not read: nothing told, "Wallet" keeps the orders it read.
    mempool.chain.down.add("https://mempool.space/api");
    await expect(read(team, integration)).resolves.toBeNull();
  });

  it("cannot tell without a majority of the relays", async () => {
    const team = deriveTeamKeys(encodeWalletSecret({ mnemonic: TEST_MNEMONIC }));
    const integration = await integrationOf(team);
    for (const relay of DEFAULT_RELAYS.slice(0, 3)) relays.unreachable.add(relay);
    await expect(read(team, integration)).resolves.toBeNull();
  });

  /** Asks of the explorer for an address's transactions, since the last reset of its calls. */
  const addressCalls = () => mempool.chain.calls.filter(({ path }) => path.startsWith("/address/"));

  it("keeps an order as last read when the explorer refuses its address, asking no other then", async () => {
    const team = deriveTeamKeys(encodeWalletSecret({ mnemonic: TEST_MNEMONIC }));
    const integration = await integrationOf(team);
    // Six orders underpaid in the mempool: more than one batch of the explorer's asks.
    const addresses = [1, 2, 3, 4, 5, 6].map((n) => taprootAddress(n));
    for (const [index, address] of addresses.entries()) {
      const registry = await lease(team, integration, `ORD-${index + 1}`, address, ended);
      const txid = mempool.pay(address, 20_000n);
      await witness(team, integration, address, txid, registry, NOW - 8500, { sats: 20_000n });
    }
    const reads: AddressReads = new Map();
    const readWith = () =>
      readIntegrationOrders(team, view(), {
        seats: { employees: [], integrations: [integration], assistants: [], removed: [] },
        relays: DEFAULT_RELAYS,
        since: NOW - 31 * 24 * 3600,
        now: NOW,
        reads
      });
    const first = await readWith();
    expect(first).toHaveLength(6);
    expect(first!.every(({ state }) => state === "underpaid")).toBe(true);

    // mempool.space refuses this device (HTTP 429): the first batch asked, no other; every order
    // shows as last read.
    for (const address of addresses) mempool.chain.refusedAddresses.add(address);
    mempool.chain.calls.length = 0;
    await expect(readWith()).resolves.toEqual(first);
    expect(addressCalls()).toHaveLength(4);
    const logged = readLog().entries.filter(
      ({ event }) => event === "Reading an order's address on the explorer failed"
    );
    expect(logged.length).toBeGreaterThan(0);
    // The error's kind and code only: never the address its message names.
    expect(JSON.stringify(logged)).not.toContain(addresses[0]);

    // An order the explorer never listed yet: left out until it does.
    const fresh = taprootAddress(7);
    const registry = await lease(team, integration, "ORD-7", fresh, ended);
    const txid = mempool.pay(fresh, 20_000n);
    await witness(team, integration, fresh, txid, registry, NOW - 8500, { sats: 20_000n });
    mempool.chain.refusedAddresses.add(fresh);
    await expect(readWith()).resolves.toHaveLength(6);
    mempool.chain.refusedAddresses.clear();
    await expect(readWith()).resolves.toHaveLength(7);
  });

  it("asks no more for the address of an order that can no longer change", async () => {
    const team = deriveTeamKeys(encodeWalletSecret({ mnemonic: TEST_MNEMONIC }));
    const integration = await integrationOf(team);
    const address = taprootAddress(7);
    const registry = await lease(team, integration, "ORD-1", address, ended);
    const txid = mempool.pay(address, 20_000n);
    await witness(team, integration, address, txid, registry, NOW - 8500, { sats: 20_000n });
    // Paid in full, its lease running: asked again, however deep its payment, until the wallet
    // claims it.
    const running = taprootAddress(9);
    const open = await lease(team, integration, "ORD-2", running, {
      createdAt: NOW - 120,
      expiresAt: NOW + 780
    });
    const paid = mempool.pay(running, 49_000n);
    await witness(team, integration, running, paid, open, NOW - 60);
    const reads: AddressReads = new Map();
    const readWith = (wallet = view()) =>
      readIntegrationOrders(team, wallet, {
        seats: { employees: [], integrations: [integration], assistants: [], removed: [] },
        relays: DEFAULT_RELAYS,
        since: NOW - 31 * 24 * 3600,
        now: NOW,
        reads
      });

    // In the mempool: asked at each read.
    await readWith();
    mempool.chain.calls.length = 0;
    await readWith();
    expect(addressCalls().map(({ path }) => path)).toEqual(
      expect.arrayContaining([`/address/${address}/txs`, `/address/${running}/txs`])
    );

    // 3 deep, its lease ended: read once more, then never again; still underpaid.
    mempool.mine(3);
    await readWith();
    expect(reads.get(address)?.final).toBe(true);
    expect(reads.get(running)?.final).toBe(false);
    mempool.chain.calls.length = 0;
    // A payment after its lease's end counts for nothing: never asked for.
    mempool.pay(address, 29_000n);
    const orders = await readWith();
    expect(addressCalls().map(({ path }) => path)).toEqual([`/address/${running}/txs`]);
    expect(orders).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          author: registry.saleKeys.nostr.publicKey,
          state: "underpaid",
          received: 20_000n,
          confirmed: true
        })
      ])
    );

    // The wallet claimed the payment of the order paid in full: no longer pending, its address
    // forgotten.
    const claimed = await readWith(view([paid]));
    expect(claimed?.map(({ author }) => author)).toEqual([registry.saleKeys.nostr.publicKey]);
    expect([...reads.keys()]).toEqual([address]);
  });
});

describe("\"Wallet\"'s rows of the integrations' orders (ownerActivity)", () => {
  const AUTHOR = "ab".repeat(32);
  const order = (state: IntegrationOrder["state"], received: bigint): IntegrationOrder => ({
    author: AUTHOR,
    fiat: { minor: 2450, digits: 2, currency: "CHF" },
    note: "Order 1042",
    taker: { kind: "integration", id: INTEGRATION_ID },
    at: NOW - 600,
    state,
    received,
    confirmed: false,
    due: 49_000n,
    tolerance: 0,
    lease: {
      integration: INTEGRATION_ID,
      address: taprootAddress(1),
      expiresAt: NOW + 300,
      sats: 49_000n,
      tolerance: 0
    }
  });
  const integrations = new Map([
    [INTEGRATION_ID, { kind: "integration" as const, id: INTEGRATION_ID, name: "Shopify store" }]
  ]);

  it("lists an order of its own while the wallet has none of its deposits", () => {
    const items = ownerActivity({
      payments: [],
      declarations: new Map(),
      links: [],
      sales: [],
      integrations,
      integrationOrders: [order("underpaid", 20_000n)],
      now: NOW
    });
    expect(items).toEqual([
      {
        id: `sale:${AUTHOR}`,
        source: "integration",
        timestamp: NOW - 600,
        note: "Order 1042",
        fiat: { minor: 2450, digits: 2, currency: "CHF" },
        state: "underpaid",
        // 29 000 of 49 000 sats: 1 450 of its 2 450 cents (splitFiat).
        rest: { sats: 29_000n, minor: 1450 },
        sats: 20_000n,
        by: integrations.get(INTEGRATION_ID),
        payments: [],
        link: null,
        // Where the owner's acceptance of its invoice is (acceptance.ts).
        acceptTarget: {
          kind: "order",
          integration: INTEGRATION_ID,
          invoice: { sale: AUTHOR, address: taprootAddress(1), expiresAt: NOW + 300, sats: 49_000n }
        }
      }
    ]);
  });

  it("gives its state to its sale's row once the wallet claimed a deposit of it", () => {
    const txid = "cd".repeat(32);
    const items = ownerActivity({
      payments: [deposit(txid, 20_000n, NOW - 60)],
      declarations: new Map(),
      onchainSales: new Map([
        [
          txid,
          [
            {
              author: AUTHOR,
              fiat: { minor: 2450, digits: 2, currency: "CHF" },
              note: "Order 1042",
              taker: { kind: "integration", id: INTEGRATION_ID },
              paidAt: NOW - 600
            }
          ]
        ]
      ]),
      links: [],
      sales: [],
      integrations,
      integrationOrders: [order("underpaid", 20_000n)],
      now: NOW
    });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: `sale:${AUTHOR}`,
      state: "underpaid",
      rest: { sats: 29_000n, minor: 1450 },
      sats: 20_000n,
      payments: [expect.objectContaining({ txId: txid })]
    });
  });

  it("pays an underpaid order whose rest its server's invoice of the rest received", () => {
    const hash = "ef".repeat(32);
    const restPayment: WalletPayment = {
      id: "rest-1",
      direction: "receive",
      status: "completed",
      amountSats: 29_000n,
      feeSats: 0n,
      timestamp: NOW - 300,
      network: "lightning",
      paymentHash: hash
    };
    const declared = {
      author: AUTHOR,
      fiat: { minor: 2450, digits: 2, currency: "CHF" },
      note: "Order 1042",
      taker: { kind: "integration" as const, id: INTEGRATION_ID }
    };
    const activity = (confirmed: boolean) =>
      ownerActivity({
        payments: [restPayment],
        declarations: new Map([[hash, [declared]]]),
        links: [],
        sales: [],
        integrations,
        integrationOrders: [{ ...order("underpaid", 20_000n), confirmed }],
        now: NOW
      });
    // Its on-chain part not deep enough yet: "Confirming", one row with the payment.
    expect(activity(false)).toMatchObject([
      {
        id: `sale:${AUTHOR}`,
        source: "integration",
        state: "unconfirmed",
        rest: null,
        sats: 49_000n,
        payments: [{ id: "rest-1" }]
      }
    ]);
    // Deep enough: paid (its server's "mixed" payment).
    expect(activity(true)).toMatchObject([{ id: `sale:${AUTHOR}`, state: null, sats: 49_000n }]);
    // A smaller Lightning payment of the sale: still underpaid, by what is left.
    const smaller = ownerActivity({
      payments: [{ ...restPayment, amountSats: 9_000n }],
      declarations: new Map([[hash, [declared]]]),
      links: [],
      sales: [],
      integrations,
      integrationOrders: [order("underpaid", 20_000n)],
      now: NOW
    });
    expect(smaller).toMatchObject([
      { state: "underpaid", rest: { sats: 20_000n, minor: 1000 }, sats: 29_000n }
    ]);
  });

  it("pays an order whose payments its lease's tolerance accepts, something paid on-chain", () => {
    const hash = "ef".repeat(32);
    const declared = {
      author: AUTHOR,
      fiat: { minor: 2450, digits: 2, currency: "CHF" },
      note: "Order 1042",
      taker: { kind: "integration" as const, id: INTEGRATION_ID }
    };
    const activity = (onchain: bigint, lightning: bigint) =>
      ownerActivity({
        payments: [
          {
            id: "rest-1",
            direction: "receive",
            status: "completed",
            amountSats: lightning,
            feeSats: 0n,
            timestamp: NOW - 300,
            network: "lightning",
            paymentHash: hash
          }
        ],
        declarations: new Map([[hash, [declared]]]),
        links: [],
        sales: [],
        integrations,
        // 5 %: 46 550 of its 49 000 sats pay it.
        integrationOrders: [{ ...order("underpaid", onchain), tolerance: 500 }],
        now: NOW
      });
    expect(activity(20_000n, 26_550n)).toMatchObject([
      { state: "unconfirmed", rest: null, sats: 46_550n }
    ]);
    // A sat less: underpaid, its whole rest asked.
    expect(activity(20_000n, 26_549n)).toMatchObject([
      { state: "underpaid", rest: { sats: 2_451n }, sats: 46_549n }
    ]);
    // Over Lightning alone, the tolerance never applies.
    expect(activity(0n, 46_550n)).toMatchObject([
      { state: "underpaid", rest: { sats: 2_450n }, sats: 46_550n }
    ]);
  });

  it("leaves out an order of an integration it does not know", () => {
    expect(
      ownerActivity({
        payments: [],
        declarations: new Map(),
        links: [],
        sales: [],
        integrationOrders: [order("unconfirmed", 49_000n)],
        now: NOW
      })
    ).toEqual([]);
  });

  it('writes an order in sats alone without fiat, its rest in sats for "To follow up"', () => {
    const [item] = ownerActivity({
      payments: [],
      declarations: new Map(),
      links: [],
      sales: [],
      integrations,
      integrationOrders: [
        { ...order("underpaid", 20_000n), fiat: { minor: 49_000, digits: 0, currency: "SAT" } }
      ],
      now: NOW
    });
    expect(item).toMatchObject({ fiat: null, rest: { sats: 29_000n }, sats: 20_000n });
    expect(followUpAmount(item!)).toEqual({ sats: 29_000n });
  });
});

describe("a change of relays while an integration's payment is pending", () => {
  it("is refused, the list kept, until nothing is pending", async () => {
    await openTestAccount({ usage: "merchant", signUp: "done" });
    const team = getAccountTeamKeys()!;
    const integration = await integrationOf(team);
    await syncIntegrationAddresses();
    // An order holds an address of its lot: its lease, with no witness yet, would not be copied.
    const now = Math.floor(Date.now() / 1000);
    const registry = await lease(team, integration, "ORD-1", taprootAddress(1), {
      createdAt: now - 60,
      expiresAt: now + 300
    });
    const own = ["wss://relay.bakery.example"];

    await expect(changeRelays(own)).rejects.toMatchObject({ code: "integrationsPending" });
    expect(getAccountSettings()?.relays).toEqual(DEFAULT_RELAYS);

    await publishToRelays(withdrawalEvent(registry, taprootAddress(1), now), {
      relays: DEFAULT_RELAYS,
      channel: "anonymous",
      timeoutMs: 1000
    });
    // Past that check: the next one, the team's move, wants this device to be the owner's (not
    // set up here; settings-logic.test.ts covers the change itself).
    await expect(changeRelays(own)).rejects.toMatchObject({ code: "noAccount" });
  });
});

describe("withdrawals", () => {
  it("leave the address to nobody: a witness of its sale names no lease", async () => {
    await openTestAccount({ usage: "merchant", signUp: "done" });
    const team = getAccountTeamKeys()!;
    const integration = await integrationOf(team);
    const address = taprootAddress(7);
    const registry = await lease(team, integration, "ORD-2", address);
    await publishToRelays(withdrawalEvent(registry, address, NOW - 599), {
      relays: DEFAULT_RELAYS,
      channel: "anonymous",
      timeoutMs: 1000
    });
    const txid = "aa".repeat(32);
    await witness(team, integration, address, txid, registry);

    const found = await loadOnchainSales([{ txid, at: NOW }]);

    expect(found?.sales.get(txid)).toEqual([]);
  });
});

it("a lease names a Lightning invoice of exactly its amount, dates and end", () => {
  const team = deriveTeamKeys(
    encodeWalletSecret({
      mnemonic:
        "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about"
    })
  );
  const invoice = leases.events[0]!.inside!.invoice!;
  const decoded = decodeBolt11(invoice)!;
  const registry = saleRegistry(
    deriveBusinessRegistry(team),
    hexToBytes(leases.events[0]!.inside!.sale.key)
  );
  const terms = {
    address: taprootAddress(3),
    sats: decoded.amountMsat! / 1000n,
    invoice: { pr: invoice, decoded, verifyUrl: leases.events[0]!.inside!.verifyUrl! },
    createdAt: decoded.timestamp,
    expiresAt: decoded.timestamp + decoded.expirySeconds,
    confirmed: true
  };
  const open = (event: NostrEvent) => {
    const place = onchainRegistryAddress(registry.key, terms.address);
    const outside = JSON.parse(
      jest
        .requireActual<typeof import("../lib/nostr/nip44")>("../lib/nostr/nip44")
        .nip44Decrypt(
          event.content,
          outerKey(registry.key, place, registry.saleKeys.nostr.publicKey)
        )
    ).v;
    return parseLease(
      { kind: "lease", end: outside.end, sealed: outside.sealed },
      conversationKey(registry.saleKeys.nostr.secretKey, registry.reader),
      registry.key,
      place,
      "bc"
    );
  };
  const sale = { fiat: { minor: 21, digits: 0, currency: "SAT" }, note: "Order 1042" };
  expect(open(leaseEvent(registry, terms, sale, NOW))?.sats).toBe(21n);
  expect(open(leaseEvent(registry, { ...terms, sats: 22n }, sale, NOW))).toBeNull();
  expect(
    open(leaseEvent(registry, { ...terms, createdAt: terms.createdAt + 1 }, sale, NOW))
  ).toBeNull();
  expect(
    open(leaseEvent(registry, { ...terms, expiresAt: terms.expiresAt - 1 }, sale, NOW))
  ).toBeNull();
});
