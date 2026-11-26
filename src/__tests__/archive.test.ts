import { schnorr } from "@noble/curves/secp256k1.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils.js";

import { DEFAULT_RELAYS } from "@/config/relays";
import { closeAccount, getAccountTeamKeys } from "@/features/account/session";
import { closeAccountWallet } from "@/features/account/wallet-access";
import {
  ARCHIVE_REFRESH_SECONDS,
  archiveDeclarations,
  copyArchive
} from "@/features/activity/archive";
import { loadDeclarations, loadOnchainSales } from "@/features/activity/load";
import { ownerActivity, removedKey } from "@/features/activity/model";
import { resetDeviceRelays } from "@/features/relays/device-relays";
import { declarationsCopied } from "@/features/settings/declarations-copy";
import { readRoster } from "@/features/team/roster";
import { encodeWalletSecret } from "@/lib/breez/secret";
import { decodeBolt11 } from "@/lib/lightning/bolt11";
import type { Invoice } from "@/lib/lightning/lnurl";
import { signEvent, type NostrEvent } from "@/lib/nostr/event";
import { nip44Decrypt, nip44Encrypt } from "@/lib/nostr/nip44";
import { publishToRelays } from "@/lib/nostr/pool";
import { createPaymentLink, publishPaymentLink } from "@/lib/payment-link/link";
import { sealLinkKey } from "@/lib/payment-link/sealed-key";
import { linkEvent, publishMemberRecord } from "@/lib/team/member-records";
import { NewerRecordError, sealRecord } from "@/lib/nostr/record";
import {
  MAX_ENTRY_BYTES,
  MAX_PART_BYTES,
  archiveOf,
  archivedMonth,
  fetchArchiveAnswers,
  monthEnd,
  monthOf,
  monthPartEvent,
  monthParts,
  parseArchiveState,
  parseMonthPart,
  partAddress,
  SEALED_LINK_KEY_LENGTH,
  setDigest,
  stateAddress,
  stateEvent,
  type ArchivedSale,
  type MonthPart
} from "@/lib/registry/archive";
import { leaseEvent } from "@/lib/registry/onchain";
import { onchainPaymentEvent } from "@/lib/registry/onchain-payments";
import {
  declarationEvent,
  declarationKey,
  outerKey,
  registryAddress,
  saleRegistry,
  settledDeclarationsOf,
  takerTag
} from "@/lib/registry/registry";
import {
  deriveArchiveKeys,
  deriveBusinessRegistry,
  deriveCatalogKeys,
  deriveLinkOwner,
  deriveMemberKeys,
  deriveRegistryKey,
  deriveRegistryReader,
  deriveRosterKeys,
  deriveTeamKeys,
  integrationSecretKey,
  memberSecret,
  memberTakerKey,
  ownerDevicesSecret,
  ownerTakerKey,
  type TeamKeys
} from "@/lib/team/keys";
import type { Integration, TeamMember } from "@/lib/team/roster";
import { deriveIntegrationKeys } from "@/lib/integrations/keys";
import { witnessEvent } from "@/lib/integrations/onchain-witness";

import { openTestAccount } from "../../jest/account";
import { taprootAddress } from "../../jest/bitcoin";
import type * as BreezFake from "../../jest/breez-sdk";
import type * as FileSystemFake from "../../jest/expo-file-system";
import type * as SecureStoreFake from "../../jest/expo-secure-store";
import { makeInvoice, metadataHash, preimagePair } from "../../jest/lightning";
import type * as RelaysFake from "../../jest/nostr-relays";
import { publishIntegration, publishMember, publishRemoved } from "../../jest/roster";

/** What a witness of these tests says its transaction pays and spends (SPEC.md §31). */
const PAID_49000 = { sats: 49_000n, inputs: [] as string[], replacement: false };

/*
 * The owner's copy of the registry's declarations (src/lib/registry/archive.ts,
 * src/features/activity/archive.ts): once a month of payments is over a year old, its sales are
 * copied under the owner's own author, then signed again each year, and "Wallet" reads the
 * copy. The wallet layer is the real one, over the fake SDK; the relays are the fake ones.
 */

jest.mock("../lib/breez/config", () => ({
  ...jest.requireActual("../lib/breez/config"),
  getWalletConfig: () => ({ network: "mainnet", apiKey: "test-api-key" }),
  // Mainnet: invoices of "bc" (the app config has no network under Jest).
  getBreezNetwork: () => "mainnet"
}));

const relays = jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");
const sdk = jest.requireMock<typeof BreezFake>("@breeztech/breez-sdk-spark-react-native");
const secureStore = jest.requireMock<typeof SecureStoreFake>("expo-secure-store");
const fileSystem = jest.requireMock<typeof FileSystemFake>("expo-file-system");

jest.setTimeout(30_000);

/** BIP-39 test mnemonic (all-zero entropy), never a real wallet's. */
const MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const vectorTeam = deriveTeamKeys(encodeWalletSecret({ mnemonic: MNEMONIC }));

const ADDRESS = "sattleme02c6047f94@breez.tips";
const METADATA = `[["text/plain","Fine Bakery"],["text/identifier","${ADDRESS}"]]`;
/** 3 October 2026, 13:10:30 UTC: the payments' month, October 2026. */
const START = Date.UTC(2026, 9, 3, 13, 10, 30) / 1000;
/** A witness's invoice: that of the order's lease (`expiresAt` START + 3600). */
const OF_LEASE = { expiresAt: START + 3600 };
/** Past 1 November 2027: October 2026 is over a year old. */
const LATER = Date.UTC(2027, 10, 2, 9, 0, 0) / 1000;
const FIAT = { minor: 2450, digits: 2, currency: "CHF" };
const MEMBER = "0123456789abcdef0123456789abcdef";
const INTEGRATION = "00112233445566778899aabbccddeeff";
const alice: TeamMember = { id: MEMBER, name: "Alice", role: "employee", invitedAt: START - 600 };
const shop: Integration = {
  id: INTEGRATION,
  name: "Online shop",
  createdAt: START - 600,
  platform: "node"
};

function invoice(n: number): Invoice {
  const { paymentHash } = preimagePair(n);
  const pr = makeInvoice({
    amountMsat: 49_000_000n,
    paymentHash,
    descriptionHash: metadataHash(METADATA),
    timestamp: START,
    expirySeconds: 600
  });
  return { pr, decoded: decodeBolt11(pr)!, verifyUrl: `https://breez.tips/verify/${paymentHash}` };
}

const hashOf = (n: number) => invoice(n).decoded.paymentHash;

/** The registry of sale `sale` (its key: 32 bytes of `sale`), marked by `takerKey` when given. */
function registryOf(team: TeamKeys, sale: number, takerKey?: Uint8Array) {
  const registry = saleRegistry(deriveBusinessRegistry(team), new Uint8Array(32).fill(sale));
  return takerKey
    ? { ...registry, taker: takerTag(takerKey, registry.saleKeys.nostr.publicKey) }
    : registry;
}

const saleOf = (team: TeamKeys, sale: number) => registryOf(team, sale).saleKeys.nostr.publicKey;

/** Declares payment `n` for sale `sale` on `list` (every relay), as a point of sale does. */
async function declare(
  team: TeamKeys,
  n: number,
  {
    sale = n,
    takerKey,
    list = DEFAULT_RELAYS,
    note = `Table ${n}`
  }: { sale?: number; takerKey?: Uint8Array; list?: readonly string[]; note?: string } = {}
) {
  const registry = registryOf(team, sale, takerKey);
  await publishToRelays(declarationEvent(registry, invoice(n), { fiat: FIAT, note }, START), {
    relays: list,
    channel: "anonymous",
    timeoutMs: 1000,
    authKey: registry.saleKeys.nostr.secretKey
  });
}

const ownerMark = (team: TeamKeys) => ownerTakerKey(ownerDevicesSecret(team));
const aliceMark = (team: TeamKeys) => memberTakerKey(memberSecret(team, MEMBER));
const shopMark = (team: TeamKeys) =>
  deriveIntegrationKeys(integrationSecretKey(team, INTEGRATION)).takerKey;

/** A payment the fake wallet received, shaped as the bindings give it. */
function payment(n: number, at = START + 120): Record<string, unknown> {
  return {
    id: `p${n}`,
    paymentType: sdk.PaymentType.Receive,
    status: sdk.PaymentStatus.Completed,
    amount: BigInt(49_000),
    fees: BigInt(0),
    timestamp: BigInt(at),
    method: sdk.PaymentMethod.Lightning,
    details: {
      tag: sdk.PaymentDetails_Tags.Lightning,
      inner: {
        description: undefined,
        invoice: "lnbc1",
        destinationPubkey: "02ab",
        htlcDetails: { paymentHash: hashOf(n) }
      }
    }
  };
}

/** The wallet received payments `numbers`, the newest first. */
function received(...numbers: number[]) {
  sdk.fakeWallet.payments = [...numbers].reverse().map((n) => payment(n));
}

/** What "Wallet" asks: the payments `numbers`, at their date. */
const asked = (...numbers: number[]) => numbers.map((n) => ({ hash: hashOf(n), at: START + 120 }));

/** Drops every declaration of payments `numbers` from every relay (relays keep nothing for sure). */
function forgetDeclarations(team: TeamKeys, ...numbers: number[]) {
  const key = deriveBusinessRegistry(team).key;
  const addresses = new Set(numbers.map((n) => registryAddress(key, hashOf(n))));
  for (const [relay, events] of relays.stored) {
    relays.stored.set(
      relay,
      events.filter((event) => !addresses.has(event.tags.find(([name]) => name === "d")?.[1] ?? ""))
    );
  }
}

/** The parts of the copies `list` holds (of `team`'s archive author, its state left out). */
function archiveEvents(team: TeamKeys, list: readonly string[] = DEFAULT_RELAYS): NostrEvent[][] {
  const keys = deriveArchiveKeys(team);
  const state = stateAddress(keys);
  return list.map((relay) =>
    (relays.stored.get(relay) ?? []).filter(
      (e) => e.pubkey === keys.nostr.publicKey && !e.tags.some(([, value]) => value === state)
    )
  );
}

/** The account's state each relay of `list` holds: how far its wallet was gone through. */
function statesOn(team: TeamKeys, list: readonly string[] = DEFAULT_RELAYS): (string | null)[] {
  const keys = deriveArchiveKeys(team);
  const state = stateAddress(keys);
  return list.map((relay) => {
    const event = (relays.stored.get(relay) ?? []).find(
      (e) => e.pubkey === keys.nostr.publicKey && e.tags.some(([, value]) => value === state)
    );
    if (!event) return null;
    const value = JSON.parse(nip44Decrypt(event.content, keys.encryptionKey)).v;
    return parseArchiveState(value)?.through ?? null;
  });
}

/** The month as the relays alone tell it (no device's memory). */
async function monthOnRelays(team: TeamKeys, month: string, list = DEFAULT_RELAYS) {
  const keys = deriveArchiveKeys(team);
  const answers = archiveOf(
    keys,
    await fetchArchiveAnswers(keys, {
      relays: list,
      channel: "account",
      timeoutMs: 1000,
      authKey: keys.nostr.secretKey
    })
  );
  return archivedMonth(keys, month, answers.parts, answers.newer);
}

async function ownerAccount(): Promise<TeamKeys> {
  await openTestAccount({ usage: "merchant", signUp: "done" });
  return getAccountTeamKeys()!;
}

/** A payment hash of its own for each `n` (the format's tests need hundreds). */
const fakeHash = (n: number) => bytesToHex(sha256(utf8ToBytes(`payment ${n}`)));

const sale = (
  n: number,
  by: ArchivedSale["by"],
  extra: Partial<ArchivedSale> = {}
): ArchivedSale => ({
  hash: n <= 9 ? hashOf(n) : fakeHash(n),
  sale: "ab".repeat(32),
  fiat: FIAT,
  note: `Table ${n}`,
  by,
  ...extra
});

beforeEach(() => {
  closeAccount();
  fileSystem.resetFileSystem();
  secureStore.resetSecureStore();
  resetDeviceRelays();
  relays.resetRelays();
  sdk.resetFakeWallet();
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(async () => {
  await declarationsCopied();
  await closeAccountWallet();
  jest.restoreAllMocks();
});

describe("the copies' keys and format", () => {
  const keys = deriveArchiveKeys(vectorTeam);

  it("never change: every account's copies derive from them (salt, info strings, addresses)", () => {
    const derive = (info: string) =>
      hkdf(sha256, vectorTeam.root, utf8ToBytes("sattle.me/team"), utf8ToBytes(info), 32);
    expect(keys.nostr.secretKey).toEqual(derive("owner-archive/author/v1"));
    expect(keys.encryptionKey).toEqual(derive("owner-archive/encryption-key/v1"));
    expect(keys.addressKey).toEqual(derive("owner-archive/address-key/v1"));
    expect(keys.nostr.publicKey).toBe(
      bytesToHex(schnorr.getPublicKey(derive("owner-archive/author/v1")))
    );
    // Computed apart, with Python's hmac and hashlib (HKDF of RFC 5869, BIP-340's x-only key),
    // from the same root as roster.test.ts.
    expect(bytesToHex(vectorTeam.root)).toBe(
      "ed7a2364464bf2bc9ed3a7cf99f32af7896b55ba09f0fc1674c6c5ed64df7077"
    );
    expect(bytesToHex(keys.nostr.secretKey)).toBe(
      "3478a6f5b1865a9452fb7fc9b33d215a5c5bbd9933a7db5025f375eaeb22a74e"
    );
    expect(keys.nostr.publicKey).toBe(
      "5425ea5e11bcd73dd3fb2b505874ab5efd9aaa31479af92d357a6479d2ccdbd4"
    );
    expect(bytesToHex(keys.encryptionKey)).toBe(
      "aad87e0823500ff295fc94a3b3ea20f03abad727937ed54ecb903a67ccbc4ff0"
    );
    expect(bytesToHex(keys.addressKey)).toBe(
      "5cf134a5f5913a67b120a55be1325d9d38263470791dc84000013a9d5f2787d2"
    );
    // HMAC-SHA256(address key, "month/<YYYY-MM>/<part>").
    expect(partAddress(keys, "2025-10", 0)).toBe(
      "7037519f959ef1d638ca66a3dd662e2c8f5f619ea8c84517ac93c5a9ca1c75f5"
    );
    expect(partAddress(keys, "2025-10", 1)).toBe(
      "e40e89c47fc3b03d3eaf53aa337fbbe648ed5964eb6fcbae32e607cd84618598"
    );
    // HMAC-SHA256(address key, "state").
    expect(stateAddress(keys)).toBe(
      "cce12a56dbc9a966bded5252d34fed5b17e8eb5be42c1253c20392d81d015078"
    );
    // SHA-256 of the payments' hashes, ascending, in bytes.
    expect(setDigest(["11".repeat(32), "0a".repeat(32)])).toBe(
      "4e47eccf969fbc97bac4543abc47000de2cd3b8bd801c3c53f5feeeda35e86fd"
    );
    expect(setDigest([])).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    // Its own author: a read by author lists the copies alone.
    expect(keys.nostr.publicKey).not.toBe(vectorTeam.publicKey);
    expect(keys.nostr.publicKey).not.toBe(deriveCatalogKeys(vectorTeam).nostr.publicKey);
    expect(keys.nostr.publicKey).not.toBe(deriveRosterKeys(vectorTeam).nostr.publicKey);
  });

  it("holds format 2 as written: its fields in this order, padded to 256 bytes", () => {
    const part: MonthPart = {
      month: "2025-10",
      part: 0,
      parts: 1,
      set: setDigest(["0a".repeat(32)]),
      linkSet: setDigest(["0b".repeat(32)]),
      entries: [
        {
          hash: "0a".repeat(32),
          sale: "ab".repeat(32),
          fiat: FIAT,
          note: "Table 4",
          by: { role: "employee", id: MEMBER, name: "Alice" }
        }
      ],
      links: [
        {
          link: "0b".repeat(32),
          saleKey: "0c".repeat(32),
          // A link's key makes it format 4 (below): format 2 holds none.
          key: null,
          relays: ["wss://nos.lol"]
        }
      ],
      onchainSet: setDigest(["0e".repeat(32)]),
      onchain: [
        {
          txid: "0e".repeat(32),
          sale: "cd".repeat(32),
          fiat: FIAT,
          note: "Order 12",
          by: { role: "integration", id: MEMBER, name: "Shop" }
        }
      ]
    };
    const event = monthPartEvent(keys, part, 1_790_000_000);
    const text = nip44Decrypt(event.content, keys.encryptionKey);
    expect(utf8ToBytes(text).length % 256).toBe(0);
    expect(text.trimEnd()).toBe(
      `{"t":"archive-month","v":{"version":2,"month":"2025-10","part":0,"parts":1,` +
        `"set":"${part.set}","linkSet":"${part.linkSet}","onchainSet":"${part.onchainSet}",` +
        `"entries":[{"hash":"${"0a".repeat(32)}","sale":"${"ab".repeat(32)}",` +
        `"fiat":{"minor":2450,"digits":2,"currency":"CHF"},"note":"Table 4",` +
        `"by":{"role":"employee","id":"${MEMBER}","name":"Alice"}}],` +
        `"links":[{"link":"${"0b".repeat(32)}","saleKey":"${"0c".repeat(32)}",` +
        `"key":null,"relays":["wss://nos.lol"]}],` +
        `"onchain":[{"txid":"${"0e".repeat(32)}","sale":"${"cd".repeat(32)}",` +
        `"fiat":{"minor":2450,"digits":2,"currency":"CHF"},"note":"Order 12",` +
        `"by":{"role":"integration","id":"${MEMBER}","name":"Shop"}}]}}`
    );
    expect(event.tags).toEqual([["d", partAddress(keys, "2025-10", 0)]]);
    expect(event.created_at).toBe(1_790_000_000);
    expect(event.pubkey).toBe(keys.nostr.publicKey);
    expect(parseMonthPart(JSON.parse(text).v)).toEqual(part);
    const state = stateEvent(keys, { through: "2025-09" }, 1_790_000_000);
    expect(nip44Decrypt(state.content, keys.encryptionKey).trimEnd()).toBe(
      `{"t":"archive-state","v":{"version":1,"through":"2025-09"}}`
    );
    expect(state.tags).toEqual([["d", stateAddress(keys)]]);
    expect(parseArchiveState({ version: 1, through: "2025-13" })).toBeNull();
    expect(() => parseArchiveState({ version: 2 })).toThrow(NewerRecordError);
  });

  it("holds format 4 for a link's key, sealed for the link key reader alone (A1)", () => {
    // A link's id is its key's public key: openLinkKey checks it.
    const secret = "0d".repeat(32);
    const id = bytesToHex(schnorr.getPublicKey(hexToBytes(secret)));
    const link = { link: id, saleKey: "0c".repeat(32), relays: ["wss://nos.lol"] };
    const [part] = monthParts("2025-10", [sale(1, { role: "owner" })], [{ ...link, key: secret }]);
    const event = monthPartEvent(keys, part!, 1_790_000_000);
    const value = JSON.parse(nip44Decrypt(event.content, keys.encryptionKey)).v;
    expect(value.version).toBe(4);
    expect(Object.keys(value.links[0])).toEqual(["link", "saleKey", "sealedKey", "relays"]);
    expect(value.links[0].sealedKey).toHaveLength(SEALED_LINK_KEY_LENGTH);
    expect(JSON.stringify(value)).not.toContain(secret);
    // Opened with the link key reader; without it, read as no key.
    expect(parseMonthPart(value, keys.linkKeyReader!)).toEqual(part);
    expect(parseMonthPart(value)?.links[0]?.key).toBeNull();
    // A key in clear in format 4, or a sealed one in format 2: refused.
    const clear = { ...link, key: secret };
    expect(parseMonthPart({ ...value, links: [clear] }, keys.linkKeyReader!)).toBeNull();
    expect(parseMonthPart({ ...value, version: 2 }, keys.linkKeyReader!)).toBeNull();
    // Never written without the link key reader: a link's key is never copied in clear.
    const { linkKeyReader: _, ...withoutReader } = keys;
    expect(() => monthPartEvent(withoutReader, part!, 1)).toThrow("never copied in clear");
  });

  it("refuses format 1, released before the on-chain payments", () => {
    // A part of format 1 as an older app wrote it: no account keeps one.
    const released = JSON.parse(
      `{"version":1,"month":"2025-10","part":0,"parts":1,` +
        `"set":"${setDigest(["0a".repeat(32)])}","linkSet":"${setDigest([])}",` +
        `"entries":[{"hash":"${"0a".repeat(32)}","sale":"${"ab".repeat(32)}",` +
        `"fiat":{"minor":2450,"digits":2,"currency":"CHF"},"note":"Table 4",` +
        `"by":{"role":"owner"}}],"links":[]}`
    );
    expect(parseMonthPart(released)).toBeNull();
    expect(parseMonthPart({ ...released, onchain: [], onchainSet: setDigest([]) })).toBeNull();
    const sealed = sealRecord({
      type: "archive-month",
      value: released,
      signer: keys.nostr.secretKey,
      encryptionKey: keys.encryptionKey,
      address: partAddress(keys, "2025-10", 0),
      createdAt: LATER
    });
    const read = archiveOf(keys, new Map([["wss://a", [sealed]]]));
    // Not a copy of the month: its sales are not told by it.
    expect(archivedMonth(keys, "2025-10", read.parts, read.newer)).toMatchObject({
      copied: false,
      newer: false
    });
  });

  it("reads only what monthParts writes, and refuses to read a newer version", () => {
    const deposit = {
      txid: "0e".repeat(32),
      sale: "cd".repeat(32),
      fiat: FIAT,
      note: "",
      by: { role: "integration" as const, id: MEMBER, name: "Shop" }
    };
    const [part] = monthParts("2025-10", [sale(1, { role: "owner" })], [], [deposit]);
    const value = JSON.parse(
      nip44Decrypt(monthPartEvent(keys, part!, 1).content, keys.encryptionKey)
    ).v;
    expect(parseMonthPart(value)).toEqual(part);
    const entry = value.entries[0];
    const onchain = value.onchain[0];
    for (const broken of [
      { ...value, part: 1 },
      { ...value, parts: 0 },
      { ...value, month: "2025-13" },
      { ...value, month: "2008-12" },
      { ...value, set: "zz" },
      { ...value, entries: [entry, entry] },
      { ...value, entries: [{ ...entry, by: { role: "owner", name: "Me" } }] },
      { ...value, entries: [{ ...entry, by: { role: "employee", id: MEMBER, name: "" } }] },
      { ...value, entries: [{ ...entry, by: { role: "admin" } }] },
      { ...value, entries: [{ ...entry, fiat: { ...FIAT, digits: 9 } }] },
      { ...value, entries: [{ ...entry, hash: "AB".repeat(32) }] },
      { ...value, onchain: [onchain, onchain] },
      { ...value, onchain: [{ ...onchain, txid: "AB".repeat(32) }] },
      { ...value, onchain: [{ ...onchain, by: { role: "integration", id: MEMBER } }] },
      { ...value, onchain: undefined },
      { ...value, onchainSet: "zz" },
      { ...value, version: 0 }
    ]) {
      expect(parseMonthPart(broken)).toBeNull();
    }
    // Format 3 is a part's that names an assistant, format 4 one's that holds a link's key: this
    // one does neither.
    expect(parseMonthPart({ ...value, version: 3 })).toBeNull();
    expect(parseMonthPart({ ...value, version: 4 })).toBeNull();
    expect(() => parseMonthPart({ ...value, version: 5 })).toThrow(NewerRecordError);
  });

  it("writes a part that names an assistant in format 3, the others in format 2", () => {
    const assistant = { role: "assistant" as const, id: MEMBER, name: "Carol's assistant" };
    const [withAssistant] = monthParts("2025-10", [sale(1, assistant), sale(2, { role: "owner" })]);
    const value = JSON.parse(
      nip44Decrypt(monthPartEvent(keys, withAssistant!, 1).content, keys.encryptionKey)
    ).v;
    expect(value.version).toBe(3);
    expect(value.entries.map(({ by }: { by: unknown }) => by)).toContainEqual(assistant);
    expect(parseMonthPart(value)).toEqual(withAssistant);
    // An assistant in a part of format 2 is not one: an app from before would refuse it.
    expect(parseMonthPart({ ...value, version: 2 })).toBeNull();
    const [without] = monthParts("2025-10", [sale(2, { role: "owner" })]);
    const plain = JSON.parse(
      nip44Decrypt(monthPartEvent(keys, without!, 1).content, keys.encryptionKey)
    ).v;
    expect(plain.version).toBe(2);
    // An assistant's on-chain payment as well.
    const [deposits] = monthParts(
      "2025-10",
      [],
      [],
      [{ txid: "0e".repeat(32), sale: "cd".repeat(32), fiat: FIAT, note: "", by: assistant }]
    );
    expect(
      JSON.parse(nip44Decrypt(monthPartEvent(keys, deposits!, 1).content, keys.encryptionKey)).v
        .version
    ).toBe(3);
  });

  it("cuts a busy month in parts under 64 kB, and keeps an empty month as one part", () => {
    const many = Array.from({ length: 600 }, (_, i) =>
      sale(i + 10, { role: "employee", id: MEMBER, name: "Alice" }, { note: "x".repeat(60) })
    );
    const parts = monthParts("2026-10", many);
    expect(parts.length).toBeGreaterThan(2);
    const all = parts.flatMap((part) => part.entries.map(({ hash }) => hash));
    expect(all).toEqual([...all].sort());
    expect(new Set(all).size).toBe(600);
    for (const part of parts) {
      expect(part.parts).toBe(parts.length);
      expect(part.set).toBe(setDigest(all));
      expect(utf8ToBytes(JSON.stringify(monthPartEvent(keys, part, LATER))).length).toBeLessThan(
        65_536
      );
      const text = nip44Decrypt(monthPartEvent(keys, part, LATER).content, keys.encryptionKey);
      expect(utf8ToBytes(text.trimEnd()).length).toBeLessThanOrEqual(MAX_PART_BYTES);
    }
    expect(monthParts("2026-10", [])).toEqual([
      {
        month: "2026-10",
        part: 0,
        parts: 1,
        set: setDigest([]),
        linkSet: setDigest([]),
        entries: [],
        links: [],
        onchainSet: setDigest([]),
        onchain: []
      }
    ]);
    // A note only a modified app writes: left out.
    const huge = sale(1, { role: "owner" }, { note: "x".repeat(MAX_ENTRY_BYTES) });
    expect(monthParts("2026-10", [huge])[0]!.entries).toEqual([]);
  });

  it("takes a month as copied only once every part of one copy is there", () => {
    const entries = Array.from({ length: 600 }, (_, i) =>
      sale(i + 10, { role: "owner" }, { note: "y".repeat(60) })
    );
    const parts = monthParts("2026-10", entries);
    const events = parts.map((part) => monthPartEvent(keys, part, LATER));
    const answers = (list: NostrEvent[]) => archiveOf(keys, new Map([["wss://a", list]]));
    const whole = answers(events);
    expect(archivedMonth(keys, "2026-10", whole.parts, whole.newer)).toMatchObject({
      copied: true,
      set: setDigest(entries.map(({ hash }) => hash)),
      newer: false
    });
    // A part lost: not copied (its payments read from the registry), what the others hold kept.
    const lost = answers(events.slice(1));
    const partial = archivedMonth(keys, "2026-10", lost.parts, lost.newer);
    expect(partial.copied).toBe(false);
    expect(partial.sales.size).toBe(entries.length - parts[0]!.entries.length);
    // Two copies mixed (two devices at once): not copied either.
    const other = monthParts("2026-10", entries.slice(0, 300)).map((part) =>
      monthPartEvent(keys, part, LATER + 1)
    );
    const mixed = answers([...events.slice(1), other[0]!]);
    expect(archivedMonth(keys, "2026-10", mixed.parts, mixed.newer).copied).toBe(false);
    // A part of a newer format: never taken, never written over.
    const newer = sealRecord({
      type: "archive-month",
      value: { version: 5 },
      signer: keys.nostr.secretKey,
      encryptionKey: keys.encryptionKey,
      address: partAddress(keys, "2026-10", 0),
      createdAt: LATER + 5
    });
    const newerRead = answers([...events, newer]);
    expect(archivedMonth(keys, "2026-10", newerRead.parts, newerRead.newer)).toMatchObject({
      copied: false,
      newer: true
    });
    // Another author's events at the same address: never read.
    const stranger = deriveRosterKeys(vectorTeam);
    const forged = sealRecord({
      type: "archive-month",
      value: { version: 1 },
      signer: stranger.nostr.secretKey,
      encryptionKey: keys.encryptionKey,
      address: partAddress(keys, "2026-10", 0),
      createdAt: LATER + 9
    });
    const strangerRead = answers([...events, forged]);
    expect(archivedMonth(keys, "2026-10", strangerRead.parts, strangerRead.newer).copied).toBe(
      true
    );
  });

  it("names months in UTC", () => {
    expect(monthOf(Date.UTC(2026, 9, 31, 23, 59, 59) / 1000)).toBe("2026-10");
    expect(monthOf(Date.UTC(2026, 10, 1) / 1000)).toBe("2026-11");
    expect(monthEnd("2026-12")).toBe(Date.UTC(2027, 0, 1) / 1000);
  });
});

describe("the registry's settled declarations", () => {
  it("tells one sale's declaration, none, a conflict; and nothing without whole answers", async () => {
    const team = await ownerAccount();
    await declare(team, 1, { takerKey: ownerMark(team) });
    await declare(team, 2, { sale: 2 });
    await declare(team, 2, { sale: 9 });
    const owner = { key: deriveRegistryKey(team), reader: deriveRegistryReader(team) };
    const settled = await settledDeclarationsOf(owner, [hashOf(1), hashOf(2), hashOf(3)], "bc");
    expect(settled?.get(hashOf(1))).toMatchObject({
      status: "unique",
      declaration: { author: saleOf(team, 1), note: "Table 1" }
    });
    expect(settled?.get(hashOf(2))).toEqual({ status: "conflict" });
    expect(settled?.get(hashOf(3))).toEqual({ status: "none" });
    // Three of five relays out of reach: no majority, nothing decided.
    for (const relay of DEFAULT_RELAYS.slice(0, 3)) relays.unreachable.add(relay);
    expect(await settledDeclarationsOf(owner, [hashOf(1)], "bc")).toBeNull();
  });

  it("is not hidden by garbage a relay sends under a real declaration's id", async () => {
    const team = await ownerAccount();
    await declare(team, 2, { sale: 2 });
    await declare(team, 2, { sale: 9 });
    // The first relay asked sends sale 9's declaration altered, under its real id.
    const first = DEFAULT_RELAYS[0]!;
    const author = saleOf(team, 9);
    relays.stored.set(
      first,
      (relays.stored.get(first) ?? []).map((event) =>
        event.pubkey === author
          ? { ...event, content: event.content.slice(0, -8) + "AAAAAAAA" }
          : event
      )
    );
    const owner = { key: deriveRegistryKey(team), reader: deriveRegistryReader(team) };
    const settled = await settledDeclarationsOf(owner, [hashOf(2)], "bc");
    expect(settled?.get(hashOf(2))).toEqual({ status: "conflict" });
  });

  it('ignores what names no sale inside, as "Wallet"; leaves a newer format\'s undecided', async () => {
    const team = await ownerAccount();
    const key = deriveRegistryKey(team);
    const claim = async (n: number, content: (author: string, address: string) => string) => {
      const address = registryAddress(key, hashOf(n));
      const signer = new Uint8Array(32).fill(70 + n);
      const author = bytesToHex(schnorr.getPublicKey(signer));
      await publishToRelays(
        signEvent(
          {
            kind: 30078,
            created_at: START,
            tags: [["d", address]],
            content: content(author, address)
          },
          signer
        ),
        { relays: DEFAULT_RELAYS, channel: "account", timeoutMs: 1000, authKey: signer }
      );
    };
    const junk = (author: string, address: string) =>
      nip44Encrypt(
        JSON.stringify({ t: "registry-declaration", v: { sealed: "nothing inside" } }),
        outerKey(key, address, author)
      );
    // Sealed with the registry key outside (whoever holds it can), nothing of a sale inside.
    await claim(4, junk);
    // A content of a NIP-44 version this app does not know, which anybody who saw d(H) may publish
    // under a key of their own: no declaration (it would hold the payment's copy back for good).
    await claim(5, () => "#future");
    // A newer app's declaration: it opens outside with the registry key, its version inside above
    // this app's.
    const newer = registryOf(team, 7);
    const at = registryAddress(key, hashOf(7));
    await publishToRelays(
      sealRecord({
        type: "registry-declaration",
        value: {
          sealed: nip44Encrypt(JSON.stringify({ version: 2 }), declarationKey(newer))
        },
        signer: newer.saleKeys.nostr.secretKey,
        encryptionKey: outerKey(key, at, newer.saleKeys.nostr.publicKey),
        address: at,
        createdAt: START
      }),
      {
        relays: DEFAULT_RELAYS,
        channel: "anonymous",
        timeoutMs: 1000,
        authKey: newer.saleKeys.nostr.secretKey
      }
    );
    // Next to a sale's declaration, the same: it neither takes the sale's "By" away nor makes
    // a conflict ("Wallet" shows the sale).
    await declare(team, 6, { takerKey: ownerMark(team) });
    await claim(6, junk);
    const owner = { key, reader: deriveRegistryReader(team) };
    const settled = await settledDeclarationsOf(
      owner,
      [hashOf(4), hashOf(5), hashOf(6), hashOf(7)],
      "bc"
    );
    expect(settled?.get(hashOf(4))).toEqual({ status: "none" });
    expect(settled?.get(hashOf(5))).toEqual({ status: "none" });
    expect(settled?.get(hashOf(6))).toMatchObject({
      status: "unique",
      declaration: { author: saleOf(team, 6) }
    });
    // Left out, undecided: a newer app's copy decides it.
    expect(settled?.has(hashOf(7))).toBe(false);
  });
});

describe("the owner's copy of the declarations", () => {
  /** An account opened first at START (its sign-up): its state written then. */
  async function newAccount() {
    const team = await ownerAccount();
    await expect(archiveDeclarations(() => START, true)).resolves.toMatchObject({
      through: "2025-09"
    });
    return team;
  }

  async function teamWithSales() {
    const team = await newAccount();
    await publishMember(team, alice);
    await publishIntegration(team, shop);
    await declare(team, 1, { takerKey: ownerMark(team) });
    await declare(team, 2, { takerKey: aliceMark(team) });
    await declare(team, 3, { takerKey: shopMark(team) });
    // Declared without a mark (an older app's): nobody vouches for it past the records' month.
    await declare(team, 4);
    // Two sales declared it: it counts for none.
    await declare(team, 5, { sale: 5, takerKey: ownerMark(team) });
    await declare(team, 5, { sale: 55, takerKey: ownerMark(team) });
    // Payment 6: no declaration at all.
    received(1, 2, 3, 4, 5, 6);
    return team;
  }

  it("copies a month once it is over a year old, never before", async () => {
    const team = await teamWithSales();
    await expect(
      archiveDeclarations(() => monthEnd("2026-10") + 364 * 86_400, true)
    ).resolves.toEqual({ copied: [], left: [], through: "2026-09", refreshed: 0 });
    expect(archiveEvents(team).flat()).toEqual([]);

    await expect(archiveDeclarations(() => LATER, true)).resolves.toEqual({
      copied: ["2026-10"],
      left: [],
      through: "2026-10",
      refreshed: 0
    });
    expect(statesOn(team)).toEqual(DEFAULT_RELAYS.map(() => "2026-10"));
    const month = await monthOnRelays(team, "2026-10");
    expect(month.copied).toBe(true);
    expect([...month.sales.values()]).toEqual(
      [
        sale(1, { role: "owner" }, { sale: saleOf(team, 1) }),
        sale(2, { role: "employee", id: MEMBER, name: "Alice" }, { sale: saleOf(team, 2) }),
        sale(
          3,
          { role: "integration", id: INTEGRATION, name: "Online shop" },
          {
            sale: saleOf(team, 3)
          }
        )
      ].sort((a, b) => (a.hash < b.hash ? -1 : 1))
    );
    // On every relay, signed by the copies' own author, dated then.
    for (const events of archiveEvents(team)) {
      expect(events).toHaveLength(1);
      expect(events[0]!.created_at).toBe(LATER);
    }
  });

  it("never connects the wallet for a new account, then once a month is old enough", async () => {
    const team = await ownerAccount();
    sdk.connect.mockClear();
    // Its first opening: the state starts at the latest month a copy could hold.
    await expect(archiveDeclarations(() => START, true)).resolves.toEqual({
      copied: [],
      left: [],
      through: "2025-09",
      refreshed: 0
    });
    expect(statesOn(team)).toEqual(DEFAULT_RELAYS.map(() => "2025-09"));
    // A later opening of the same month: nothing is due.
    await archiveDeclarations(() => START + 20 * 86_400, true);
    expect(sdk.connect).not.toHaveBeenCalled();
    // October 2025 is a year old: the wallet is read once, then the state goes on.
    await expect(archiveDeclarations(() => START + 40 * 86_400, true)).resolves.toMatchObject({
      through: "2025-10"
    });
    expect(sdk.connect).toHaveBeenCalledTimes(1);
    // Another device opening the account reads the state: nothing due either.
    closeAccount();
    await ownerAccount();
    sdk.connect.mockClear();
    await archiveDeclarations(() => START + 45 * 86_400, true);
    expect(sdk.connect).not.toHaveBeenCalled();
  });

  it('gives "Wallet" the copy, by name, once the registry lost the declarations', async () => {
    const team = await teamWithSales();
    await archiveDeclarations(() => LATER, true);
    forgetDeclarations(team, 1, 2, 3, 4, 5);
    // The relays' answers alone (another device, or this one reopened): the same keys.
    closeAccount();
    const again = await ownerAccount();

    const found = await loadDeclarations(asked(1, 2, 3, 4, 5, 6), LATER);
    expect(found?.get(hashOf(1))).toEqual([
      {
        author: saleOf(again, 1),
        fiat: FIAT,
        note: "Table 1",
        taker: { kind: "you" },
        archivedBy: { kind: "you" }
      }
    ]);
    expect(found?.get(hashOf(2))).toEqual([
      expect.objectContaining({ archivedBy: { kind: "member", id: MEMBER, name: "Alice" } })
    ]);
    expect(found?.get(hashOf(3))).toEqual([
      expect.objectContaining({
        archivedBy: { kind: "integration", id: INTEGRATION, name: "Online shop" }
      })
    ]);
    for (const n of [4, 5, 6]) expect(found?.get(hashOf(n))).toEqual([]);
  });

  it('copies the integrations\' orders paid on-chain, which "Wallet" then reads there', async () => {
    const team = await teamWithSales();
    const keys = deriveIntegrationKeys(integrationSecretKey(team, INTEGRATION));
    const address = taprootAddress(7);
    const registry = registryOf(team, 9, shopMark(team));
    await publishToRelays(
      leaseEvent(
        registry,
        {
          address,
          sats: 49_000n,
          invoice: null,
          createdAt: START,
          expiresAt: START + 3600,
          confirmed: true
        },
        { fiat: FIAT, note: "Order 9" },
        START
      ),
      { relays: DEFAULT_RELAYS, channel: "anonymous", timeoutMs: 1000 }
    );
    const paid = "0e".repeat(32);
    const late = "0f".repeat(32);
    const witnessed = [
      { address, txid: paid, sale: registry.saleKeys.nostr.publicKey, ...PAID_49000, ...OF_LEASE },
      { address, txid: late, sale: null, ...PAID_49000, expiresAt: null }
    ];
    for (const witness of witnessed) {
      await publishToRelays(witnessEvent(keys, witness, START + 60), {
        relays: DEFAULT_RELAYS,
        channel: "account",
        timeoutMs: 1000,
        authKey: keys.seen.nostr.secretKey
      });
    }
    // The wallet's deposits: the order's, one seen after its lease, one no witness names.
    const unnamed = "10".repeat(32);
    sdk.fakeWallet.payments = [
      ...sdk.fakeWallet.payments,
      ...[paid, late, unnamed].map((txId, i) => ({
        id: `d${i}`,
        paymentType: sdk.PaymentType.Receive,
        status: sdk.PaymentStatus.Completed,
        amount: BigInt(49_000),
        fees: BigInt(0),
        timestamp: BigInt(START + 120),
        method: sdk.PaymentMethod.Deposit,
        details: { tag: sdk.PaymentDetails_Tags.Deposit, inner: { txId } }
      }))
    ];

    await expect(archiveDeclarations(() => LATER, true)).resolves.toMatchObject({
      copied: ["2026-10"],
      left: []
    });
    const month = await monthOnRelays(team, "2026-10");
    expect(month.copied).toBe(true);
    expect([...month.deposits.values()]).toEqual([
      {
        txid: paid,
        sale: registry.saleKeys.nostr.publicKey,
        fiat: FIAT,
        note: "Order 9",
        by: { role: "integration", id: INTEGRATION, name: "Online shop" }
      }
    ]);
    expect(month.onchainSet).toBe(setDigest([paid]));

    // The witnesses gone from the relays: the copy tells the deposits alone.
    for (const [relay, events] of relays.stored) {
      relays.stored.set(
        relay,
        events.filter((event) => event.pubkey !== keys.seen.nostr.publicKey)
      );
    }
    closeAccount();
    await ownerAccount();
    const found = await loadOnchainSales(
      [paid, late, unnamed].map((txid) => ({ txid, at: START + 120 })),
      LATER
    );
    expect(found?.retry).toEqual([]);
    expect(found?.sales.get(paid)).toEqual([
      {
        author: registry.saleKeys.nostr.publicKey,
        fiat: FIAT,
        note: "Order 9",
        taker: { kind: "integration", id: INTEGRATION },
        archivedBy: { kind: "integration", id: INTEGRATION, name: "Online shop" }
      }
    ]);
    expect(found?.sales.get(late)).toEqual([]);
    expect(found?.sales.get(unnamed)).toEqual([]);
    // Whatever a server declares afterwards, its lease still there: the copy prevails.
    await publishToRelays(
      witnessEvent(
        keys,
        {
          address,
          txid: unnamed,
          sale: registry.saleKeys.nostr.publicKey,
          ...PAID_49000,
          ...OF_LEASE
        },
        START + 61
      ),
      {
        relays: DEFAULT_RELAYS,
        channel: "account",
        timeoutMs: 1000,
        authKey: keys.seen.nostr.secretKey
      }
    );
    const again = await loadOnchainSales([{ txid: unnamed, at: START + 120 }], LATER);
    expect(again?.sales.get(unnamed)).toEqual([]);
  });

  it("copies the point of sale's sales paid on-chain from their declarations", async () => {
    const team = await teamWithSales();
    const address = taprootAddress(8);
    const [mine, hers, unmarked, twice] = ["11", "12", "13", "14"].map((byte) => byte.repeat(32));
    const declareTx = (registry: ReturnType<typeof registryOf>, txid: string) =>
      publishToRelays(
        onchainPaymentEvent(registry, { txid, address }, { fiat: FIAT, note: "Table 8" }, START),
        { relays: DEFAULT_RELAYS, channel: "anonymous", timeoutMs: 1000 }
      );
    // One of the owner's devices' sale, Alice's, one no mark names (a payer's page holds the
    // registry key, never a mark), and a transaction two sales declared.
    await declareTx(registryOf(team, 21, ownerMark(team)), mine!);
    await declareTx(registryOf(team, 22, aliceMark(team)), hers!);
    await declareTx(registryOf(team, 23), unmarked!);
    await declareTx(registryOf(team, 24, ownerMark(team)), twice!);
    await declareTx(registryOf(team, 25, aliceMark(team)), twice!);
    sdk.fakeWallet.payments = [
      ...sdk.fakeWallet.payments,
      ...[mine, hers, unmarked, twice].map((txId, i) => ({
        id: `p${i}`,
        paymentType: sdk.PaymentType.Receive,
        status: sdk.PaymentStatus.Completed,
        amount: BigInt(2_882),
        fees: BigInt(0),
        timestamp: BigInt(START + 120),
        method: sdk.PaymentMethod.Deposit,
        details: { tag: sdk.PaymentDetails_Tags.Deposit, inner: { txId } }
      }))
    ];

    await archiveDeclarations(() => LATER, true);
    const month = await monthOnRelays(team, "2026-10");
    expect(month.copied).toBe(true);
    expect([...month.deposits.values()]).toEqual([
      { txid: mine, sale: saleOf(team, 21), fiat: FIAT, note: "Table 8", by: { role: "owner" } },
      {
        txid: hers,
        sale: saleOf(team, 22),
        fiat: FIAT,
        note: "Table 8",
        by: { role: "employee", id: MEMBER, name: "Alice" }
      }
    ]);
    // Read by "Wallet" from the copy, whatever the registry says afterwards.
    closeAccount();
    const again = await ownerAccount();
    await declareTx(registryOf(again, 26, aliceMark(again)), unmarked!);
    const found = await loadOnchainSales(
      [mine, hers, unmarked, twice].map((txid) => ({ txid: txid!, at: START + 120 })),
      LATER
    );
    expect(found?.sales.get(mine!)).toEqual([
      expect.objectContaining({ author: saleOf(again, 21), archivedBy: { kind: "you" } })
    ]);
    expect(found?.sales.get(unmarked!)).toEqual([]);
    expect(found?.sales.get(twice!)).toEqual([]);
  });

  it("keeps a removed integration's order paid on-chain before its removal, claimed after", async () => {
    const team = await teamWithSales();
    const keys = deriveIntegrationKeys(integrationSecretKey(team, INTEGRATION));
    const address = taprootAddress(7);
    const registry = registryOf(team, 9, shopMark(team));
    await publishToRelays(
      leaseEvent(
        registry,
        {
          address,
          sats: 49_000n,
          invoice: null,
          createdAt: START,
          expiresAt: START + 3600,
          confirmed: true
        },
        { fiat: FIAT, note: "Order 9" },
        START
      ),
      { relays: DEFAULT_RELAYS, channel: "anonymous", timeoutMs: 1000 }
    );
    const paid = "0e".repeat(32);
    await publishToRelays(
      witnessEvent(
        keys,
        {
          address,
          txid: paid,
          sale: registry.saleKeys.nostr.publicKey,
          ...PAID_49000,
          ...OF_LEASE
        },
        START + 60
      ),
      {
        relays: DEFAULT_RELAYS,
        channel: "account",
        timeoutMs: 1000,
        authKey: keys.seen.nostr.secretKey
      }
    );
    // Removed a minute later; the wallet claims the deposit two days after (once confirmed).
    await publishRemoved(team, shop, START + 120);
    sdk.fakeWallet.payments = [
      ...sdk.fakeWallet.payments,
      {
        id: "d0",
        paymentType: sdk.PaymentType.Receive,
        status: sdk.PaymentStatus.Completed,
        amount: BigInt(49_000),
        fees: BigInt(0),
        timestamp: BigInt(START + 2 * 86_400),
        method: sdk.PaymentMethod.Deposit,
        details: { tag: sdk.PaymentDetails_Tags.Deposit, inner: { txId: paid } }
      }
    ];

    await archiveDeclarations(() => LATER, true);

    const month = await monthOnRelays(team, "2026-10");
    expect(month.copied).toBe(true);
    // Paid while it was an integration of the account: its sale, by its name.
    expect(month.deposits.get(paid)).toEqual({
      txid: paid,
      sale: registry.saleKeys.nostr.publicKey,
      fiat: FIAT,
      note: "Order 9",
      by: { role: "integration", id: INTEGRATION, name: "Online shop" }
    });
  });

  it("prevails over whatever is declared afterwards", async () => {
    const team = await teamWithSales();
    await archiveDeclarations(() => LATER, true);
    // A removed employee, an integrator or a payer still holds the registry key: a conflict for a
    // sale of the copy, a sale for a payment the copy keeps as nobody's.
    await declare(team, 1, { sale: 77, takerKey: aliceMark(team) });
    await declare(team, 6, { sale: 78, takerKey: aliceMark(team), note: "Made up" });

    const found = await loadDeclarations(asked(1, 6), LATER);
    expect(found?.get(hashOf(1))).toEqual([
      expect.objectContaining({ author: saleOf(team, 1), archivedBy: { kind: "you" } })
    ]);
    expect(found?.get(hashOf(6))).toEqual([]);
  });

  // A link's payer holds its sale's key and can declare its invoices
  // again; the copy keeps the sale as the link the team recorded tells it, for good.
  it("keeps a sale the team shared as a link as its link tells it, not as its payer declared", async () => {
    const team = await newAccount();
    await publishMember(team, alice);
    const saleKey = new Uint8Array(32).fill(9);
    const registry = saleRegistry(deriveBusinessRegistry(team), saleKey);
    // Alice's device shares the sale: the link published, recorded for the owner.
    const link = createPaymentLink(
      {
        version: 3,
        businessName: "Fine Bakery",
        lightningAddress: ADDRESS,
        fiat: FIAT,
        note: "Table 9",
        onchainAddress: null,
        endsAt: START + 600,
        registryKey: bytesToHex(deriveRegistryKey(team)),
        registryReader: deriveRegistryReader(team).publicKey,
        owner: deriveLinkOwner(team).publicKey
      },
      "https://web.example",
      START,
      saleKey,
      DEFAULT_RELAYS
    );
    await publishPaymentLink(link);
    const keys = deriveMemberKeys(memberSecret(team, MEMBER));
    await publishMemberRecord(
      keys,
      linkEvent(keys, {
        version: 1,
        link: link.id,
        saleKey: bytesToHex(saleKey),
        createdAt: START,
        onchainTag: null,
        relays: [...DEFAULT_RELAYS],
        sealedKey: sealLinkKey(link.secretKey, deriveRegistryReader(team).publicKey)
      }),
      DEFAULT_RELAYS
    );
    // The payer's page declared its invoice, then the payer declared it again as it liked.
    await publishToRelays(
      declarationEvent(
        { ...registry, taker: takerTag(aliceMark(team), registry.saleKeys.nostr.publicKey) },
        invoice(9),
        { fiat: FIAT, note: "Table 9" },
        START
      ),
      { relays: DEFAULT_RELAYS, channel: "anonymous", timeoutMs: 1000 }
    );
    await publishToRelays(
      declarationEvent(
        registry,
        invoice(9),
        { fiat: { ...FIAT, minor: 1 }, note: "Nothing" },
        START + 3600
      ),
      { relays: DEFAULT_RELAYS, channel: "anonymous", timeoutMs: 1000 }
    );
    received(9);

    await expect(archiveDeclarations(() => LATER, true)).resolves.toMatchObject({
      copied: ["2026-10"]
    });
    const month = await monthOnRelays(team, "2026-10");
    expect(month.sales.get(hashOf(9))).toEqual(
      sale(9, { role: "employee", id: MEMBER, name: "Alice" }, { sale: saleOf(team, 9) })
    );
  });

  it("leaves a month for later while the link of one of its sales cannot be read", async () => {
    const team = await newAccount();
    await publishMember(team, alice);
    const saleKey = new Uint8Array(32).fill(9);
    const elsewhere = [DEFAULT_RELAYS[0]!, "wss://link.example"];
    const link = createPaymentLink(
      {
        version: 3,
        businessName: "Fine Bakery",
        lightningAddress: ADDRESS,
        fiat: FIAT,
        note: "Table 9",
        onchainAddress: null,
        endsAt: START + 600,
        registryKey: bytesToHex(deriveRegistryKey(team)),
        registryReader: deriveRegistryReader(team).publicKey,
        owner: deriveLinkOwner(team).publicKey
      },
      "https://web.example",
      START,
      saleKey,
      elsewhere
    );
    await publishPaymentLink(link);
    const keys = deriveMemberKeys(memberSecret(team, MEMBER));
    await publishMemberRecord(
      keys,
      linkEvent(keys, {
        version: 1,
        link: link.id,
        saleKey: bytesToHex(saleKey),
        createdAt: START,
        onchainTag: null,
        relays: elsewhere,
        sealedKey: sealLinkKey(link.secretKey, deriveRegistryReader(team).publicKey)
      }),
      DEFAULT_RELAYS
    );
    await declare(team, 9, { takerKey: aliceMark(team) });
    received(9);
    // The link's relays do not answer, one of them the account's: its sale may be the payer's.
    for (const relay of elsewhere) relays.unreachable.add(relay);
    await expect(archiveDeclarations(() => LATER, true)).resolves.toMatchObject({
      copied: [],
      left: ["2026-10"]
    });
    for (const relay of elsewhere) relays.unreachable.delete(relay);
    await expect(archiveDeclarations(() => LATER, true)).resolves.toMatchObject({
      copied: ["2026-10"]
    });
  });

  it("keeps a removed employee's sale paid before its removal, by its name, not one after", async () => {
    const team = await newAccount();
    await publishRemoved(team, alice, START + 60);
    await declare(team, 1, { takerKey: aliceMark(team) });
    await declare(team, 2, { takerKey: aliceMark(team) });
    sdk.fakeWallet.payments = [payment(2, START + 60 + 2 * 3600), payment(1, START)];

    await archiveDeclarations(() => LATER, true);

    const month = await monthOnRelays(team, "2026-10");
    expect([...month.sales.keys()]).toEqual([hashOf(1)]);
    expect(month.sales.get(hashOf(1))?.by).toEqual({ role: "employee", id: MEMBER, name: "Alice" });
  });

  it("writes nothing without a majority of the relays, then copies at the next round", async () => {
    const team = await teamWithSales();
    // The roster read first (the account's opening), then three of five relays out of reach.
    await readRoster(team, DEFAULT_RELAYS);
    for (const relay of DEFAULT_RELAYS.slice(0, 3)) relays.unreachable.add(relay);
    await expect(archiveDeclarations(() => LATER, true)).resolves.toBeNull();
    expect(archiveEvents(team).flat()).toEqual([]);
    // "Wallet" waits for the copies before telling a year-old payment.
    await expect(loadDeclarations(asked(1), LATER)).resolves.toBeNull();

    relays.unreachable.clear();
    await expect(archiveDeclarations(() => LATER, true)).resolves.toMatchObject({
      copied: ["2026-10"]
    });
  });

  it("decides nothing from relays that stop answering mid-read, of the copies or of the roster", async () => {
    const team = await teamWithSales();
    const answer = relays.queryEvents;
    /** Three of five relays answer `author`'s first page only. */
    const cut = (author: string) => {
      const pages = new Map<string, number>();
      jest.spyOn(relays, "queryEvents").mockImplementation(async (url, filter, options) => {
        if (filter.authors?.includes(author) && DEFAULT_RELAYS.slice(0, 3).includes(url)) {
          pages.set(url, (pages.get(url) ?? 0) + 1);
          if (pages.get(url)! > 1) throw new Error(`${url}: no answer in time`);
        }
        return answer(url, filter, options);
      });
    };

    cut(deriveRosterKeys(team).nostr.publicKey);
    await expect(archiveDeclarations(() => LATER, true)).resolves.toBeNull();
    expect(archiveEvents(team).flat()).toEqual([]);
    jest.restoreAllMocks();

    cut(deriveArchiveKeys(team).nostr.publicKey);
    await expect(archiveDeclarations(() => LATER, true)).resolves.toBeNull();
    // Opened again (nothing read of the copies since): "Wallet" waits for them before
    // telling a year-old payment.
    closeAccount();
    const again = await ownerAccount();
    await expect(loadDeclarations(asked(1), LATER)).resolves.toBeNull();
    jest.restoreAllMocks();

    await expect(archiveDeclarations(() => LATER, true)).resolves.toMatchObject({
      copied: ["2026-10"]
    });
    expect((await monthOnRelays(again, "2026-10")).copied).toBe(true);
  });

  it("leaves a month undecided while the registry gives no majority's whole answers", async () => {
    const team = await teamWithSales();
    // Anyone who saw d(H) can publish there: a relay's answer past its cap never decides.
    const address = registryAddress(deriveBusinessRegistry(team).key, hashOf(1));
    for (const relay of DEFAULT_RELAYS.slice(0, 3)) {
      for (let i = 0; i < 100; i += 1) {
        const stranger = new Uint8Array(32).fill(i + 1);
        await publishToRelays(
          sealRecord({
            type: "registry-declaration",
            value: { sealed: "spam" },
            signer: stranger,
            encryptionKey: new Uint8Array(32).fill(3),
            address,
            createdAt: START + i
          }),
          { relays: [relay], channel: "account", timeoutMs: 1000, authKey: stranger }
        );
      }
    }
    await expect(archiveDeclarations(() => LATER, true)).resolves.toMatchObject({
      copied: [],
      left: ["2026-10"],
      through: "2026-09"
    });
    expect(archiveEvents(team).flat()).toEqual([]);
    // Gone through up to the month before it only: the next round tries it again.
    expect(statesOn(team)).toEqual(DEFAULT_RELAYS.map(() => "2026-09"));
  });

  it('never writes over a month of a newer format, and "Wallet" reads the registry', async () => {
    const team = await teamWithSales();
    const keys = deriveArchiveKeys(team);
    await publishToRelays(
      sealRecord({
        type: "archive-month",
        value: { version: 5 },
        signer: keys.nostr.secretKey,
        encryptionKey: keys.encryptionKey,
        address: partAddress(keys, "2026-10", 0),
        createdAt: LATER - 10
      }),
      { relays: DEFAULT_RELAYS, channel: "account", timeoutMs: 1000, authKey: keys.nostr.secretKey }
    );
    // A newer app's copy: gone through, never written over.
    await expect(archiveDeclarations(() => LATER, true)).resolves.toMatchObject({
      copied: [],
      left: [],
      through: "2026-10"
    });
    for (const events of archiveEvents(team)) {
      expect(events.map(({ created_at }) => created_at)).toEqual([LATER - 10]);
    }
    const found = await loadDeclarations(asked(1), LATER);
    expect(found?.get(hashOf(1))).toEqual([
      expect.objectContaining({ author: saleOf(team, 1), taker: { kind: "you" } })
    ]);
    expect(found?.get(hashOf(1))?.[0]).not.toHaveProperty("archivedBy");
  });

  it("completes a copy another device left half written, with what that copy held", async () => {
    const team = await teamWithSales();
    const keys = deriveArchiveKeys(team);
    // A copy of two parts whose second never reached the relays, holding a sale the registry no
    // longer has.
    const kept = sale(9, { role: "owner" }, { sale: "cd".repeat(32) });
    const half = monthParts("2026-10", [kept]).map((part) => ({ ...part, parts: 2 }));
    await publishToRelays(monthPartEvent(keys, half[0]!, LATER - 100), {
      relays: DEFAULT_RELAYS,
      channel: "account",
      timeoutMs: 1000,
      authKey: keys.nostr.secretKey
    });
    expect((await monthOnRelays(team, "2026-10")).copied).toBe(false);

    await archiveDeclarations(() => LATER, true);

    const month = await monthOnRelays(team, "2026-10");
    expect(month.copied).toBe(true);
    expect([...month.sales.keys()].sort()).toEqual(
      [hashOf(1), hashOf(2), hashOf(3), hashOf(9)].sort()
    );
  });

  it("signs each part again once a year, the same copy, and repairs a relay that lost it", async () => {
    const team = await teamWithSales();
    await archiveDeclarations(() => LATER, true);
    const keys = deriveArchiveKeys(team);
    const before = archiveEvents(team)[0]![0]!;
    // A relay lost it.
    relays.stored.set(DEFAULT_RELAYS[4]!, []);

    // Not a year yet: given back as it is to the relay that lost it.
    await archiveDeclarations(() => LATER + 30 * 86_400, true);
    expect(archiveEvents(team).map((events) => events.map(({ id }) => id))).toEqual(
      DEFAULT_RELAYS.map(() => [before.id])
    );

    const after = LATER + ARCHIVE_REFRESH_SECONDS + 86_400;
    await expect(archiveDeclarations(() => after, true)).resolves.toMatchObject({ refreshed: 1 });
    for (const events of archiveEvents(team)) {
      expect(events).toHaveLength(1);
      expect(events[0]!.created_at).toBe(after);
      expect(
        parseMonthPart(JSON.parse(nip44Decrypt(events[0]!.content, keys.encryptionKey)).v)
      ).toEqual(parseMonthPart(JSON.parse(nip44Decrypt(before.content, keys.encryptionKey)).v));
    }
  });

  it("goes to the new relays at a change of them, and stops the change without a majority", async () => {
    const team = await teamWithSales();
    await archiveDeclarations(() => LATER, true);
    const next = ["wss://relay-1.bakery.example", "wss://relay-2.bakery.example"];
    await expect(copyArchive(team, DEFAULT_RELAYS, next)).resolves.toBe(true);
    expect(archiveEvents(team, next).map((events) => events.length)).toEqual([1, 1]);
    expect((await monthOnRelays(team, "2026-10", next)).copied).toBe(true);

    relays.unreachable.add(next[1]!);
    const other = ["wss://relay-3.bakery.example", next[1]!];
    await expect(copyArchive(team, DEFAULT_RELAYS, other)).resolves.toBe(false);
    for (const relay of DEFAULT_RELAYS.slice(0, 3)) relays.unreachable.add(relay);
    await expect(copyArchive(team, DEFAULT_RELAYS, next)).resolves.toBe(false);
  });

  it("names the copy's sales in \"Wallet\", a removed employee's included", () => {
    const paid = {
      id: "p2",
      direction: "receive" as const,
      status: "completed" as const,
      amountSats: 49_000n,
      feeSats: 0n,
      timestamp: START + 120,
      network: "lightning" as const,
      paymentHash: hashOf(2)
    };
    const items = ownerActivity({
      payments: [paid],
      declarations: new Map([
        [
          hashOf(2),
          [
            {
              author: "ab".repeat(32),
              fiat: FIAT,
              note: "Table 2",
              taker: { kind: "member" as const, id: MEMBER },
              archivedBy: { kind: "member" as const, id: MEMBER, name: "Alice" }
            }
          ]
        ]
      ]),
      links: [],
      sales: [],
      // Alice was removed long ago: the roster no longer lists her, nor her removal's date.
      now: LATER
    });
    expect(items).toEqual([
      expect.objectContaining({
        id: `sale:${"ab".repeat(32)}`,
        note: "Table 2",
        fiat: FIAT,
        by: { kind: "member", id: MEMBER, name: "Alice" }
      })
    ]);
  });

  // The copy keeps an integration's name, never its platform.
  it("draws a removed integration's logo for the copy's sales, as the roster keeps it", () => {
    const shop = { kind: "integration" as const, id: INTEGRATION, name: "Online shop" };
    const byOf = (removed: Parameters<typeof ownerActivity>[0]["removed"]) =>
      ownerActivity({
        payments: [
          {
            id: "p3",
            direction: "receive",
            status: "completed",
            amountSats: 49_000n,
            feeSats: 0n,
            timestamp: START + 120,
            network: "lightning",
            paymentHash: hashOf(3)
          }
        ],
        declarations: new Map([
          [
            hashOf(3),
            [
              {
                author: "cd".repeat(32),
                fiat: FIAT,
                note: "CMD-3",
                taker: { kind: "integration" as const, id: INTEGRATION },
                archivedBy: shop
              }
            ]
          ]
        ]),
        links: [],
        sales: [],
        removed,
        now: LATER
      }).map(({ by }) => by);
    const pretix = { ...shop, platform: "pretix" };
    expect(
      byOf(
        new Map([[removedKey("integration", INTEGRATION), { removedAt: START + 3600, by: pretix }]])
      )
    ).toEqual([pretix]);
    // The roster without it (read on no majority yet): by the copy's name, its code icon.
    expect(byOf(new Map())).toEqual([shop]);
  });
});
