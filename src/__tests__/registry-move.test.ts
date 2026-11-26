import { Directory, File, Paths } from "expo-file-system";

import { DEFAULT_RELAYS } from "@/config/relays";
import {
  closeAccount,
  getAccountBackupKey,
  getAccountSettings,
  getAccountTeamKeys
} from "@/features/account/session";
import {
  closeAccountWallet,
  isAccountWalletOpen,
  openAccountWallet
} from "@/features/account/wallet-access";
import { loadOnchainSales, readDeclarations } from "@/features/activity/load";
import { resetDeviceRelays } from "@/features/relays/device-relays";
import { ownerActivity } from "@/features/activity/model";
import { changeRelays } from "@/features/settings/account-settings";
import {
  DECLARATIONS_WALLET_TIMEOUT_MS,
  MOVE_GIVE_UP_SECONDS,
  PAYMENTS_PAGE_SIZE,
  TRANSITION_SECONDS,
  copyAccountDeclarations,
  copyPendingDeclarations,
  copyPendingRecords,
  declarationsCopied
} from "@/features/settings/declarations-copy";
import { leaseEvent } from "@/lib/registry/onchain";
import { onchainPaymentEvent } from "@/lib/registry/onchain-payments";
import { MOVES_DIR_NAME, loadRegistryMoves, saveRegistryMoves } from "@/lib/registry/moves-store";
import * as owner from "@/features/team/owner";
import { TeamError, createIntegration } from "@/features/team/owner";
import { resetTerminalProfileCache } from "@/features/terminal/profile-cache";
import { isWalletConnected } from "@/lib/breez/wallet";
import { deriveIntegrationKeys } from "@/lib/integrations/keys";
import { witnessEvent } from "@/lib/integrations/onchain-witness";
import { decodeBolt11 } from "@/lib/lightning/bolt11";
import type { Invoice } from "@/lib/lightning/lnurl";
import { nostrKeys } from "@/lib/nostr/keys";
import { publishToRelays } from "@/lib/nostr/pool";
import { sealRecord } from "@/lib/nostr/record";
import {
  declarationEvent,
  ownerDeclarationsOf,
  paymentUniqueness,
  registryAddress,
  saleRegistry,
  takerTag
} from "@/lib/registry/registry";
import { currentRelays } from "@/lib/relays/current";
import { saveTerminalProfile } from "@/lib/terminal/profile";
import type { TeamMember } from "@/lib/team/roster";
import {
  deriveBusinessRegistry,
  deriveRegistryKey,
  deriveRegistryReader,
  integrationSecretKey,
  memberSecret,
  memberTakerKey,
  ownerDevicesSecret,
  ownerTakerKey,
  type TeamKeys
} from "@/lib/team/keys";

import { TEST_WALLET_ID, openTestAccount } from "../../jest/account";
import { taprootAddress } from "../../jest/bitcoin";
import type * as BreezFake from "../../jest/breez-sdk";
import type * as FileSystemFake from "../../jest/expo-file-system";
import type * as SecureStoreFake from "../../jest/expo-secure-store";
import { makeInvoice, metadataHash, preimagePair } from "../../jest/lightning";
import type * as RelaysFake from "../../jest/nostr-relays";

/*
 * The registry's declarations at a change of the account's relays (declarations-copy.ts): those of
 * the wallet's payments go from the list left to the new one, where "Wallet" reads them.
 * The wallet layer is the real one, over the fake SDK; the relays are the fake ones.
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

const OWN = ["wss://relay.bakery.example"];
const NEW = ["wss://relay-1.bakery.example", "wss://relay-2.bakery.example"];
const ADDRESS = "sattleme02c6047f94@breez.tips";
const METADATA = `[["text/plain","Fine Bakery"],["text/identifier","${ADDRESS}"]]`;
const START = Date.UTC(2026, 9, 3, 13, 10, 30) / 1000;
const FIAT = { minor: 2450, digits: 2, currency: "CHF" };
const MEMBER = "0123456789abcdef0123456789abcdef";
const INTEGRATION = "00112233445566778899aabbccddeeff";

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

/** Declares payment `n` for sale `sale` on `list` (every relay), as a point of sale does. */
async function declare(
  team: TeamKeys,
  n: number,
  {
    sale = n,
    takerKey,
    list = DEFAULT_RELAYS
  }: { sale?: number; takerKey?: Uint8Array; list?: readonly string[] } = {}
) {
  const registry = registryOf(team, sale, takerKey);
  await publishToRelays(
    declarationEvent(registry, invoice(n), { fiat: FIAT, note: `Table ${n}` }, START),
    {
      relays: list,
      channel: "anonymous",
      timeoutMs: 1000,
      authKey: registry.saleKeys.nostr.secretKey
    }
  );
}

/** A payment of the fake wallet, shaped as the bindings give it. */
function payment(
  id: string,
  paymentHash: string | undefined,
  {
    type = sdk.PaymentType.Receive,
    status = sdk.PaymentStatus.Completed,
    at = START + 120
  }: { type?: BreezFake.PaymentType; status?: BreezFake.PaymentStatus; at?: number } = {}
): Record<string, unknown> {
  return {
    id,
    paymentType: type,
    status,
    amount: BigInt(49_000),
    fees: BigInt(0),
    timestamp: BigInt(at),
    method: paymentHash ? sdk.PaymentMethod.Lightning : sdk.PaymentMethod.Deposit,
    details: paymentHash
      ? {
          tag: sdk.PaymentDetails_Tags.Lightning,
          inner: {
            description: undefined,
            invoice: "lnbc1",
            destinationPubkey: "02ab",
            htlcDetails: { paymentHash }
          }
        }
      : { tag: sdk.PaymentDetails_Tags.Deposit, inner: { txId: "ab".repeat(32) } }
  };
}

/** The wallet received payments 1 to `count`, the newest first. */
function receivedPayments(count: number) {
  sdk.fakeWallet.payments = Array.from({ length: count }, (_, i) =>
    payment(`p${count - i}`, hashOf(count - i))
  );
}

/** Whether `event` is at the address of a declaration of payments 1 to 300 (`team`'s). */
function declarationCheck(team: TeamKeys): (event: { tags: string[][] } | undefined) => boolean {
  const key = deriveBusinessRegistry(team).key;
  const addresses = new Set(
    Array.from({ length: 300 }, (_, i) => registryAddress(key, hashOf(i + 1)))
  );
  return (event) => addresses.has(event?.tags.find(([name]) => name === "d")?.[1] ?? "");
}

/** The declarations `list` holds, by their authors. */
function declarationsOn(list: readonly string[], hash: string, team: TeamKeys): string[][] {
  const address = registryAddress(deriveBusinessRegistry(team).key, hash);
  return list.map((relay) =>
    (relays.stored.get(relay) ?? [])
      .filter((event) => event.tags.some(([name, value]) => name === "d" && value === address))
      .map((event) => event.pubkey)
      .sort()
  );
}

async function ownerAccount(): Promise<TeamKeys> {
  await openTestAccount({ usage: "merchant", signUp: "done" });
  return getAccountTeamKeys()!;
}

/** Lets the background work run: a few turns of the event loop. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

beforeEach(() => {
  // A new device each time: the list a change of relays left in its storage goes too.
  closeAccount();
  fileSystem.resetFileSystem();
  secureStore.resetSecureStore();
  resetDeviceRelays();
  relays.resetRelays();
  sdk.resetFakeWallet();
  sdk.connect.mockClear();
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(async () => {
  await declarationsCopied();
  await closeAccountWallet();
  // Stops a transition's timer (copyPendingDeclarations): Jest would wait for it.
  closeAccount();
  jest.restoreAllMocks();
});

describe("a change of the account's relays", () => {
  it('leaves the declarations behind until they are copied, then "Wallet" finds them all', async () => {
    const team = await ownerAccount();
    expect(currentRelays()).toEqual(DEFAULT_RELAYS);
    await declare(team, 1);
    receivedPayments(1);
    const hash = hashOf(1);
    expect((await readDeclarations(team, [hash]))?.get(hash)).toHaveLength(1);
    // The wallet's first sync held: the copy waits for it.
    const release = sdk.holdFirstSync();

    await changeRelays(OWN);
    await settle();

    // The new list answers, without the declaration: the payment would show without its sale.
    expect(currentRelays()).toEqual(OWN);
    expect((await readDeclarations(team, [hash]))?.get(hash)).toEqual([]);
    release();
    await declarationsCopied();
    expect((await readDeclarations(team, [hash]))?.get(hash)).toEqual([
      expect.objectContaining({ fiat: FIAT, note: "Table 1" })
    ]);
    // The wallet was connected for the copy only.
    expect(isWalletConnected()).toBe(false);
  });

  it("copies the whole history of the wallet's payments received, page after page", async () => {
    const team = await ownerAccount();
    const count = PAYMENTS_PAGE_SIZE + 30;
    for (let n = 1; n <= count + 2; n += 1) await declare(team, n);
    receivedPayments(count);
    // A payment sent, one received without a hash (on-chain), one received that failed: their
    // declarations (here for the sent and failed ones) are not the wallet's payments.
    sdk.fakeWallet.payments.push(
      payment("sent", hashOf(count + 1), { type: sdk.PaymentType.Send }),
      payment("deposit", undefined),
      // A hash out of shape (not 32 bytes): no address in the registry, never read.
      payment("odd", "7f2c04b1"),
      payment("failed", hashOf(count + 2), { status: sdk.PaymentStatus.Failed })
    );

    const copied = await copyAccountDeclarations(team, DEFAULT_RELAYS, OWN);

    // One connection of the wallet, for every page.
    expect(sdk.connect).toHaveBeenCalledTimes(1);
    expect(copied).toEqual({ found: count, held: count, unread: 0 });
    const hashes = Array.from({ length: count + 2 }, (_, i) => hashOf(i + 1));
    const found = await ownerDeclarationsOf(
      { key: deriveRegistryKey(team), reader: deriveRegistryReader(team) },
      hashes,
      "bc",
      { relays: OWN }
    );
    expect(hashes.filter((hash) => found?.get(hash)?.length === 1)).toEqual(hashes.slice(0, count));
    expect(isWalletConnected()).toBe(false);
  });

  it("copies every sale's declaration of a payment: a conflict stays a conflict", async () => {
    const team = await ownerAccount();
    await declare(team, 1, { sale: 1 });
    await declare(team, 1, { sale: 9 });
    receivedPayments(1);
    expect(await paymentUniqueness(registryOf(team, 1), hashOf(1))).toBe("conflict");

    await copyAccountDeclarations(team, DEFAULT_RELAYS, OWN);

    expect(await paymentUniqueness(registryOf(team, 1), hashOf(1), { relays: OWN })).toBe(
      "conflict"
    );
    expect(declarationsOn(OWN, hashOf(1), team)).toEqual([
      [
        registryOf(team, 1).saleKeys.nostr.publicKey,
        registryOf(team, 9).saleKeys.nostr.publicKey
      ].sort()
    ]);
  });

  it("leaves behind what anyone else published at a declaration's address", async () => {
    const team = await ownerAccount();
    await declare(team, 1);
    receivedPayments(1);
    const address = registryAddress(deriveBusinessRegistry(team).key, hashOf(1));
    const stranger = nostrKeys(new Uint8Array(32).fill(7));
    await publishToRelays(
      sealRecord({
        type: "registry-declaration",
        value: { sealed: "nothing" },
        signer: stranger.secretKey,
        encryptionKey: new Uint8Array(32).fill(8),
        address,
        createdAt: START
      }),
      { relays: DEFAULT_RELAYS, channel: "account", timeoutMs: 1000, authKey: stranger.secretKey }
    );

    await expect(copyAccountDeclarations(team, DEFAULT_RELAYS, OWN)).resolves.toMatchObject({
      found: 1
    });

    expect(declarationsOn(OWN, hashOf(1), team)).toEqual([
      [registryOf(team, 1).saleKeys.nostr.publicKey]
    ]);
  });

  it('gives "Wallet" back each payment\'s sale, note and "By"', async () => {
    const team = await ownerAccount();
    const member: TeamMember = { id: MEMBER, name: "Alice", role: "employee", invitedAt: START };
    const integration = {
      id: INTEGRATION,
      name: "Online shop",
      createdAt: START,
      platform: "node"
    };
    await declare(team, 1, { takerKey: ownerTakerKey(ownerDevicesSecret(team)) });
    await declare(team, 2, { takerKey: memberTakerKey(memberSecret(team, MEMBER)) });
    await declare(team, 3, {
      takerKey: deriveIntegrationKeys(integrationSecretKey(team, INTEGRATION)).takerKey
    });
    receivedPayments(3);

    await changeRelays(OWN);
    await declarationsCopied();

    const hashes = [1, 2, 3].map(hashOf);
    const declarations = await readDeclarations(team, hashes, {
      employees: [member],
      integrations: [integration],
      assistants: [],
      removed: []
    });
    const alice = { kind: "member", id: MEMBER, name: "Alice", avatar: null } as const;
    const shop = { kind: "integration", id: INTEGRATION, name: "Online shop" } as const;
    const items = ownerActivity({
      payments: hashes.map((paymentHash, i) => ({
        id: `p${i + 1}`,
        direction: "receive",
        status: "completed",
        amountSats: 49_000n,
        feeSats: 0n,
        timestamp: START + 120,
        network: "lightning",
        paymentHash
      })),
      declarations,
      links: [],
      sales: [],
      members: new Map([[MEMBER, alice]]),
      integrations: new Map([[INTEGRATION, shop]]),
      now: START + 200
    });
    const byNote = new Map(items.map((item) => [item.note, item]));
    expect(byNote.get("Table 1")).toMatchObject({ by: { kind: "you" }, fiat: FIAT });
    expect(byNote.get("Table 2")).toMatchObject({ by: alice, fiat: FIAT });
    expect(byNote.get("Table 3")).toMatchObject({ by: shop, source: "integration" });
  });

  it("copies nothing when the change is cancelled, and copies when the new list stays", async () => {
    const team = await ownerAccount();
    await declare(team, 1);
    receivedPayments(1);
    // No relay takes the backup: the change is cancelled, the team moves back.
    const backupKey = getAccountBackupKey()!;
    const publish = relays.publishEvent;
    const refuseBackups = jest
      .spyOn(relays, "publishEvent")
      .mockImplementation(async (url, event, options) => {
        if (event.pubkey === backupKey) throw new Error(`${url}: no answer in time`);
        return publish(url, event, options);
      });

    await expect(changeRelays(OWN)).rejects.toMatchObject({ code: "unpublished" });
    await declarationsCopied();
    expect(declarationsOn(OWN, hashOf(1), team)).toEqual([[]]);
    expect(sdk.connect).not.toHaveBeenCalled();

    // The team cannot move back (the relays out of reach): the new list stays, and is filled.
    const moveTeam = owner.moveTeam;
    jest
      .spyOn(owner, "moveTeam")
      .mockImplementationOnce((next) => moveTeam(next))
      .mockRejectedValueOnce(new TeamError("unreachable", "No majority of the relays"));
    await expect(changeRelays(OWN)).rejects.toMatchObject({ code: "unreachable" });
    refuseBackups.mockRestore();
    await declarationsCopied();
    expect(declarationsOn(OWN, hashOf(1), team)).toEqual([
      [registryOf(team, 1).saleKeys.nostr.publicKey]
    ]);
  });

  it("copies to the relays of the new list that lack a declaration, those it shares keep theirs", async () => {
    const team = await ownerAccount();
    // Declared on 3 relays of 5 (a majority): the first one, shared with the new list, lacks it.
    await declare(team, 1, { list: DEFAULT_RELAYS.slice(1, 4) });
    await declare(team, 2, { list: DEFAULT_RELAYS });
    receivedPayments(2);
    const next = [DEFAULT_RELAYS[0]!, DEFAULT_RELAYS[1]!, ...NEW];
    const isDeclaration = declarationCheck(team);
    const from = relays.calls.length;

    await expect(copyAccountDeclarations(team, DEFAULT_RELAYS, next)).resolves.toEqual({
      found: 2,
      held: 2,
      unread: 0
    });

    // Payment 2's declaration was on both shared relays: nothing sent to them again.
    const published = relays.calls
      .slice(from)
      .filter(
        ({ operation, relay, event }) =>
          operation === "publish" && DEFAULT_RELAYS.includes(relay) && isDeclaration(event)
      );
    expect(published.map(({ relay }) => relay)).toEqual([DEFAULT_RELAYS[0]]);
    for (const n of [1, 2]) {
      expect(declarationsOn(next, hashOf(n), team).every((held) => held.length === 1)).toBe(true);
    }
  });

  it("authenticates as each sale where a relay takes an author's events from that author only", async () => {
    const team = await ownerAccount();
    await declare(team, 1, { sale: 1 });
    await declare(team, 1, { sale: 9 });
    receivedPayments(1);
    relays.authorOnly.add(OWN[0]!);

    await expect(copyAccountDeclarations(team, DEFAULT_RELAYS, OWN)).resolves.toEqual({
      found: 2,
      held: 2,
      unread: 0
    });
    expect(declarationsOn(OWN, hashOf(1), team)[0]).toHaveLength(2);
  });
});

describe("the integrations' on-chain payments at a change of relays", () => {
  /** The owner's device, its point of sale prepared (a change moves the channels), and an integration. */
  async function ownerWithIntegration(): Promise<{ team: TeamKeys; id: string }> {
    const team = await ownerAccount();
    await saveTerminalProfile({
      version: 2,
      walletId: TEST_WALLET_ID,
      backupKey: getAccountBackupKey()!,
      lightningAddress: ADDRESS,
      businessName: getAccountSettings()?.businessName ?? "",
      currency: "CHF"
    });
    resetTerminalProfileCache();
    const { integration } = await createIntegration("Online shop", "node");
    return { team, id: integration.id };
  }

  /** A lease of `address` by the order of sale 9 of integration `id`, and its witness of `txid`. */
  async function paidOnchain(team: TeamKeys, id: string, address: string, txid: string) {
    const keys = deriveIntegrationKeys(integrationSecretKey(team, id));
    const registry = registryOf(team, 9, keys.takerKey);
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
    await publishToRelays(
      witnessEvent(
        keys,
        {
          address,
          txid,
          sale: registry.saleKeys.nostr.publicKey,
          sats: 49_000n,
          inputs: [],
          replacement: false,
          expiresAt: START + 3600
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
    return { keys, registry };
  }

  /** A deposit of transaction `txId` the wallet received at `at`, as the bindings give it. */
  function deposit(txId: string, at = START + 120): Record<string, unknown> {
    return {
      ...payment(`d-${txId}`, undefined, { at }),
      details: { tag: sdk.PaymentDetails_Tags.Deposit, inner: { txId } }
    };
  }

  it('copies the witnesses and the leases they name: "Wallet" still tells the sale', async () => {
    const { team, id } = await ownerWithIntegration();
    const txid = "0e".repeat(32);
    const address = taprootAddress(7);
    const { keys, registry } = await paidOnchain(team, id, address, txid);
    sdk.fakeWallet.payments = [deposit(txid)];

    await changeRelays(OWN);
    await declarationsCopied();

    const authors = (relays.stored.get(OWN[0]!) ?? []).map(({ pubkey }) => pubkey);
    expect(authors).toContain(keys.seen.nostr.publicKey);
    expect(authors).toContain(registry.saleKeys.nostr.publicKey);
    // The lease, a registry record, goes as its sale on the anonymous channel, never the account's.
    const leaseCopies = relays.calls.filter(
      ({ operation, relay, event }) =>
        operation === "publish" &&
        OWN.includes(relay) &&
        event?.pubkey === registry.saleKeys.nostr.publicKey
    );
    expect(leaseCopies.length).toBeGreaterThan(0);
    expect(new Set(leaseCopies.map(({ channel }) => channel))).toEqual(new Set(["anonymous"]));
    // The old list gone: what the new one holds tells the sale.
    for (const relay of DEFAULT_RELAYS) relays.unreachable.add(relay);
    const found = await loadOnchainSales([{ txid, at: START + 120 }]);
    expect(found?.retry).toEqual([]);
    expect(found?.sales.get(txid)).toEqual([
      {
        author: registry.saleKeys.nostr.publicKey,
        fiat: FIAT,
        note: "Order 9",
        taker: { kind: "integration", id },
        paidAt: START + 60,
        // Its sale's key and its order's invoice: where the owner's acceptance of it is.
        key: registry.saleKey,
        lease: { integration: id, address, expiresAt: START + 3600, sats: 49_000n, tolerance: 0 }
      }
    ]);
    expect((await loadRegistryMoves(TEST_WALLET_ID)).moves).toEqual([
      expect.objectContaining({ copied: expect.any(Number) })
    ]);
    expect(isWalletConnected()).toBe(false);
  });

  it("copies the point of sale's declarations of its on-chain payments", async () => {
    const team = await ownerAccount();
    const txid = "0d".repeat(32);
    const registry = registryOf(team, 21, ownerTakerKey(ownerDevicesSecret(team)));
    await publishToRelays(
      onchainPaymentEvent(
        registry,
        { txid, address: taprootAddress(8) },
        { fiat: FIAT, note: "Table 8" },
        START + 60
      ),
      { relays: DEFAULT_RELAYS, channel: "anonymous", timeoutMs: 1000 }
    );
    sdk.fakeWallet.payments = [deposit(txid)];

    await changeRelays(OWN);
    await declarationsCopied();

    // The old list gone: what the new one holds tells the sale, "You".
    for (const relay of DEFAULT_RELAYS) relays.unreachable.add(relay);
    const found = await loadOnchainSales([{ txid, at: START + 120 }]);
    expect(found?.retry).toEqual([]);
    expect(found?.sales.get(txid)).toEqual([
      {
        author: registry.saleKeys.nostr.publicKey,
        fiat: FIAT,
        note: "Table 8",
        taker: { kind: "you" },
        key: registry.saleKey
      }
    ]);
    expect((await loadRegistryMoves(TEST_WALLET_ID)).moves).toEqual([
      expect.objectContaining({ copied: expect.any(Number) })
    ]);
  });

  it("copies the witness of a payment the wallet has not listed yet", async () => {
    const { team, id } = await ownerWithIntegration();
    const txid = "0e".repeat(32);
    const { keys, registry } = await paidOnchain(team, id, taprootAddress(7), txid);
    // Not confirmed yet: the wallet lists the deposit once it claims it, after the change.
    sdk.fakeWallet.payments = [];

    await changeRelays(OWN);
    await declarationsCopied();

    const authors = (relays.stored.get(OWN[0]!) ?? []).map(({ pubkey }) => pubkey);
    expect(authors).toContain(keys.seen.nostr.publicKey);
    expect(authors).toContain(registry.saleKeys.nostr.publicKey);
  });

  it("keeps the change to copy again while the old list gives no majority's answer", async () => {
    const { team, id } = await ownerWithIntegration();
    const txid = "0e".repeat(32);
    const { keys } = await paidOnchain(team, id, taprootAddress(7), txid);
    sdk.fakeWallet.payments = [deposit(txid)];
    // The copy's read of the witnesses out of reach on the list left: a witness could be missed.
    // (The check of the integrations' pending payments before the change reads the last 14 days
    // only, and must get its answer: without one, the change is refused.)
    const query = relays.queryEvents;
    const copyReadBefore = Math.floor(Date.now() / 1000) - 30 * 24 * 3600;
    const spy = jest
      .spyOn(relays, "queryEvents")
      .mockImplementation(async (url, filter, options) => {
        if (
          filter.authors?.includes(keys.seen.nostr.publicKey) &&
          (filter.since ?? 0) < copyReadBefore
        ) {
          throw new Error("unreachable");
        }
        return query(url, filter, options);
      });
    try {
      await changeRelays(OWN);
      await declarationsCopied();
    } finally {
      spy.mockRestore();
    }
    expect((await loadRegistryMoves(TEST_WALLET_ID)).moves).toEqual([
      expect.objectContaining({ copied: null })
    ]);

    // At the account's next opening: copied.
    await copyPendingDeclarations();
    expect((relays.stored.get(OWN[0]!) ?? []).map(({ pubkey }) => pubkey)).toContain(
      keys.seen.nostr.publicKey
    );
    expect((await loadRegistryMoves(TEST_WALLET_ID)).moves).toEqual([
      expect.objectContaining({ copied: expect.any(Number) })
    ]);
  });
});

describe("the copy's failures", () => {
  it("never rejects: a new relay out of reach, another refusing, the majority missed", async () => {
    const team = await ownerAccount();
    await declare(team, 1);
    receivedPayments(1);
    const next = [DEFAULT_RELAYS[0]!, ...NEW];
    relays.unreachable.add(NEW[0]!);

    // The shared relay holds it, the second new relay takes it: 2 of 3.
    await expect(copyAccountDeclarations(team, DEFAULT_RELAYS, next)).resolves.toEqual({
      found: 1,
      held: 1,
      unread: 0
    });

    // The second new relay refuses it too: 1 of 3, under the majority (it would not count there).
    relays.resetRelays();
    await declare(team, 1);
    relays.unreachable.add(NEW[0]!);
    relays.readOnly.add(NEW[1]!);
    await expect(copyAccountDeclarations(team, DEFAULT_RELAYS, next)).resolves.toEqual({
      found: 1,
      held: 0,
      unread: 0
    });

    // The list left out of reach: nothing found, the payments counted as unread.
    for (const relay of DEFAULT_RELAYS) relays.unreachable.add(relay);
    await expect(copyAccountDeclarations(team, DEFAULT_RELAYS, OWN)).resolves.toEqual({
      found: 0,
      held: 0,
      unread: 1
    });
  });

  it("stops once the account closes: nothing more is written, its keys never sign again", async () => {
    const team = await ownerAccount();
    const count = 120;
    for (let n = 1; n <= count; n += 1) await declare(team, n);
    receivedPayments(count);
    // Its relay takes an author's events from that author only: authenticated with the sale's
    // key, which the owner's keys open.
    relays.authorOnly.add(OWN[0]!);
    const isDeclaration = declarationCheck(team);
    const publish = relays.publishEvent;
    jest.spyOn(relays, "publishEvent").mockImplementation(async (url, event, options) => {
      if (url === OWN[0] && getAccountTeamKeys() !== null) closeAccount();
      return publish(url, event, options);
    });

    await expect(copyAccountDeclarations(team, DEFAULT_RELAYS, OWN)).resolves.toBeNull();

    // The publications under way when it closed, refused (no key to authenticate), and no other.
    const published = relays.calls.filter(
      ({ operation, relay, event }) =>
        operation === "publish" && relay === OWN[0] && isDeclaration(event)
    );
    expect(published.length).toBeGreaterThan(0);
    expect(published.length).toBeLessThanOrEqual(5);
    expect(relays.stored.get(OWN[0]!) ?? []).toEqual([]);
    expect(isWalletConnected()).toBe(false);
  });

  it("waits for a wallet a screen holds, never takes it, and lets it go once done", async () => {
    const team = await ownerAccount();
    await declare(team, 1);
    receivedPayments(1);
    // "Wallet" is open: its connection.
    await openAccountWallet();
    expect(sdk.connect).toHaveBeenCalledTimes(1);

    const copying = copyAccountDeclarations(team, DEFAULT_RELAYS, OWN);
    await settle();
    expect(isAccountWalletOpen()).toBe(true);
    expect(sdk.connect).toHaveBeenCalledTimes(1);
    expect(declarationsOn(OWN, hashOf(1), team)).toEqual([[]]);

    // The screen left: the copy connects, reads, copies and disconnects.
    await closeAccountWallet();
    await expect(copying).resolves.toMatchObject({ found: 1, held: 1 });
    expect(sdk.connect).toHaveBeenCalledTimes(2);
    expect(isWalletConnected()).toBe(false);
  });

  it("gives the wallet up to a screen opened while it reads, and reads again once it is free", async () => {
    const team = await ownerAccount();
    await declare(team, 1);
    receivedPayments(1);
    const release = sdk.holdFirstSync();

    const copying = copyAccountDeclarations(team, DEFAULT_RELAYS, OWN);
    await settle();
    expect(sdk.connect).toHaveBeenCalledTimes(1);
    // "Wallet" opens meanwhile: its connection replaces the copy's.
    await openAccountWallet();
    release();
    await settle();
    expect(isAccountWalletOpen()).toBe(true);
    expect(declarationsOn(OWN, hashOf(1), team)).toEqual([[]]);

    await closeAccountWallet();
    await expect(copying).resolves.toMatchObject({ found: 1, held: 1 });
    expect(isWalletConnected()).toBe(false);
  });
});

describe("the copy's own checks", () => {
  it("copies nothing between the same relays, whatever their order", async () => {
    const team = await ownerAccount();
    await expect(
      copyAccountDeclarations(team, DEFAULT_RELAYS, [...DEFAULT_RELAYS].reverse())
    ).resolves.toBeNull();
    expect(sdk.connect).not.toHaveBeenCalled();
  });
});

describe("the changes kept until copied", () => {
  /** The device's clock moved `seconds` ahead (nowUnix, the record's dates). */
  function later(seconds: number) {
    const now = Date.now.bind(Date);
    const start = now();
    jest.spyOn(Date, "now").mockImplementation(() => start + seconds * 1000 + (now() - start));
  }

  it("copies again, once the transition is over, the payments received since the change", async () => {
    const team = await ownerAccount();
    await declare(team, 1);
    receivedPayments(1);
    await changeRelays(OWN);
    await declarationsCopied();
    const [move] = (await loadRegistryMoves(TEST_WALLET_ID)).moves;
    // Kept for its other records too: copied again at the account's next opening (records).
    expect(move).toEqual({
      left: [...DEFAULT_RELAYS],
      at: getAccountSettings()!.updatedAt,
      copied: expect.any(Number),
      records: false
    });
    expect(declarationsOn(OWN, hashOf(1), team)).toEqual([
      [registryOf(team, 1).saleKeys.nostr.publicKey]
    ]);

    // An integration's server declared there before it followed; its invoice is paid since.
    await declare(team, 2);
    sdk.fakeWallet.payments.unshift(payment("p2", hashOf(2), { at: move!.at + 600 }));
    await copyPendingDeclarations();
    expect(declarationsOn(OWN, hashOf(2), team)).toEqual([[]]);
    expect((await loadRegistryMoves(TEST_WALLET_ID)).moves).toHaveLength(1);

    // Past its end (a change's date, its settings' `updatedAt`, may be a few seconds ahead).
    later(TRANSITION_SECONDS + 60);
    await copyPendingDeclarations();
    expect(declarationsOn(OWN, hashOf(2), team)).toEqual([
      [registryOf(team, 2).saleKeys.nostr.publicKey]
    ]);
    // Copied past its transition, its other records not yet: kept until an opening copies them.
    expect((await loadRegistryMoves(TEST_WALLET_ID)).moves).toEqual([
      expect.objectContaining({ records: false })
    ]);
    await copyPendingRecords();
    await copyPendingDeclarations();
    expect((await loadRegistryMoves(TEST_WALLET_ID)).moves).toEqual([]);
    expect(isWalletConnected()).toBe(false);
  });

  it("resumes an interrupted copy at the account's next opening", async () => {
    const team = await ownerAccount();
    await declare(team, 1);
    receivedPayments(1);
    // The declaration refused by the new relay during the change (a change of relays now needs a
    // majority of the new list to answer): its copy is not done.
    const declarer = registryOf(team, 1).saleKeys.nostr.publicKey;
    relays.refusedAuthors.add(declarer);
    await changeRelays(OWN);
    await declarationsCopied();
    expect((await loadRegistryMoves(TEST_WALLET_ID)).moves).toEqual([
      expect.objectContaining({ left: [...DEFAULT_RELAYS], copied: null })
    ]);

    // The app closed; the relay takes it again; the account opens again (useTeamChannelsSync).
    closeAccount();
    relays.refusedAuthors.delete(declarer);
    await openTestAccount();
    expect(getAccountSettings()?.relays).toEqual(OWN);
    await copyPendingDeclarations();
    // The account's keys of this opening: those of the first were wiped when it closed.
    const reopened = getAccountTeamKeys()!;
    expect(declarationsOn(OWN, hashOf(1), reopened)).toEqual([
      [registryOf(reopened, 1).saleKeys.nostr.publicKey]
    ]);
    expect((await loadRegistryMoves(TEST_WALLET_ID)).moves).toEqual([
      expect.objectContaining({ copied: expect.any(Number) })
    ]);
  });

  it("keeps the change to copy while no sync of the wallet reached the network", async () => {
    const team = await ownerAccount();
    await declare(team, 1);
    receivedPayments(1);
    // The Spark operators unreachable: the SDK's syncs end, having read nothing. What this device
    // holds of the wallet may lack payments: no copy is told complete on it.
    sdk.setSparkReachable(false);
    jest.useFakeTimers({ advanceTimers: true });
    try {
      await changeRelays(OWN);
      await jest.advanceTimersByTimeAsync(DECLARATIONS_WALLET_TIMEOUT_MS);
      await declarationsCopied();
    } finally {
      jest.useRealTimers();
    }
    expect(declarationsOn(OWN, hashOf(1), team)).toEqual([[]]);
    expect((await loadRegistryMoves(TEST_WALLET_ID)).moves).toEqual([
      expect.objectContaining({ left: [...DEFAULT_RELAYS], copied: null })
    ]);

    // Reachable again: the next attempt's sync reaches the network, the copy goes through.
    sdk.setSparkReachable(true);
    await copyPendingDeclarations();
    expect(declarationsOn(OWN, hashOf(1), team)).toEqual([
      [registryOf(team, 1).saleKeys.nostr.publicKey]
    ]);
    expect((await loadRegistryMoves(TEST_WALLET_ID)).moves).toEqual([
      expect.objectContaining({ copied: expect.any(Number) })
    ]);
  });

  it("gives a change up a month after it, never reading the wallet again for it", async () => {
    await ownerAccount();
    const now = Math.floor(Date.now() / 1000);
    // Its other records not copied either (records): given up all the same.
    await saveRegistryMoves(TEST_WALLET_ID, {
      version: 2,
      moves: [{ left: [...OWN], at: now - MOVE_GIVE_UP_SECONDS - 1, copied: null, records: false }]
    });
    await copyPendingDeclarations();
    expect(sdk.connect).not.toHaveBeenCalled();
    expect((await loadRegistryMoves(TEST_WALLET_ID)).moves).toEqual([]);
  });

  it("forgets a change back to the list it left without reading the wallet", async () => {
    await ownerAccount();
    const now = Math.floor(Date.now() / 1000);
    // A change that left the account's list as it is now (one closed before it went out, undone).
    // Its other records are there too (records).
    await saveRegistryMoves(TEST_WALLET_ID, {
      version: 2,
      moves: [
        { left: [...getAccountSettings()!.relays], at: now - 60, copied: null, records: false }
      ]
    });
    await copyPendingDeclarations();
    expect(sdk.connect).not.toHaveBeenCalled();
    expect((await loadRegistryMoves(TEST_WALLET_ID)).moves).toEqual([]);
  });

  it("never writes over a newer app's record, and copies all the same", async () => {
    const team = await ownerAccount();
    await declare(team, 1);
    receivedPayments(1);
    const directory = new Directory(Paths.document, MOVES_DIR_NAME);
    directory.create({ intermediates: true, idempotent: true });
    const file = new File(directory, `${TEST_WALLET_ID}.json`);
    const newer = JSON.stringify({ version: 3, changes: [] });
    file.writeSync(newer);

    await changeRelays(OWN);
    await declarationsCopied();

    expect(await file.text()).toBe(newer);
    expect(declarationsOn(OWN, hashOf(1), team)).toEqual([
      [registryOf(team, 1).saleKeys.nostr.publicKey]
    ]);
  });

  it("keeps nothing it cannot read: a damaged record counts as none", async () => {
    await ownerAccount();
    const directory = new Directory(Paths.document, MOVES_DIR_NAME);
    directory.create({ intermediates: true, idempotent: true });
    new File(directory, `${TEST_WALLET_ID}.json`).writeSync(
      JSON.stringify({ version: 1, moves: [{ left: ["http://not-a-relay"], at: 1, copied: null }] })
    );
    await expect(loadRegistryMoves(TEST_WALLET_ID)).resolves.toEqual({ version: 2, moves: [] });
  });
});
