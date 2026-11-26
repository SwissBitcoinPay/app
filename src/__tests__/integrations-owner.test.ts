import * as paymentLinks from "@/config/payment-links";
import * as teamConfig from "@/config/team";
import { DEFAULT_RELAYS } from "@/config/relays";
import { MAX_INTEGRATIONS } from "@/config/team";
import { closeAccount, getAccountBackupKey, getAccountSettings } from "@/features/account/session";
import {
  changeBusinessName,
  changeBitcoinNode,
  changeOnchainTolerance,
  changeRelays
} from "@/features/settings/account-settings";
import {
  addArticle,
  currentCatalogEpoch,
  loadCatalog,
  refreshCatalogEpoch,
  sealCatalogAgain
} from "@/features/catalog/catalog";
import {
  createIntegration,
  inviteEmployee,
  removeEmployee,
  loadIntegrations,
  removeIntegration,
  syncTeamChannels
} from "@/features/team/owner";
import { resetTerminalProfileCache } from "@/features/terminal/profile-cache";
import { walletSecret } from "@/lib/breez/seed";
import {
  INTEGRATION_KEY_PREFIX,
  deriveIntegrationKeys,
  parseIntegrationKey
} from "@/lib/integrations/keys";
import { publishToRelays } from "@/lib/nostr/pool";
import { RelayRefusal } from "@/lib/nostr/relay-errors";
import { catalogEntriesOf, fetchArticles } from "@/lib/catalog/article";
import { catalogReaderOf, channelCatalogOf, type ChannelCatalog } from "@/lib/catalog/reader";
import { channelEvent, fetchChannel } from "@/lib/team/channel";
import {
  deriveCatalogKeys,
  deriveCatalogReader,
  deriveMemberKeys,
  deriveRosterKeys,
  deriveTeamKeys,
  integrationSecretKey,
  memberSecret
} from "@/lib/team/keys";
import type { Integration } from "@/lib/team/roster";
import type { SavedTerminalProfile } from "@/lib/terminal/model";
import { loadCatalogRecord, saveTerminalProfile } from "@/lib/terminal/profile";

import { TEST_WALLET_ID, openTestAccount, testSeed } from "../../jest/account";
import { publishIntegration, publishRemoved, rosterOn } from "../../jest/roster";
import type * as FileSystemFake from "../../jest/expo-file-system";
import type * as RelaysFake from "../../jest/nostr-relays";

jest.mock("../lib/breez/wallet", () => ({
  checkWalletConfig: jest.fn(),
  connectWallet: jest.fn(),
  disconnectWallet: jest.fn(async () => undefined),
  getWalletId: jest.fn(),
  getWalletLightningAddress: jest.fn()
}));
// Mainnet: invoices of "bc" (the app config has no network under Jest).
jest.mock("../lib/breez/config", () => ({
  ...jest.requireActual("../lib/breez/config"),
  getBreezNetwork: () => "mainnet"
}));
const relays = jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");
const fileSystem = jest.requireMock<typeof FileSystemFake>("expo-file-system");

const OWN = ["wss://relay.bakery.example"];
const ADDRESS = "sattleme02c6047f94@breez.tips";
const team = deriveTeamKeys(walletSecret(testSeed()));

jest.setTimeout(20_000);

afterEach(() => {
  // The web app of this build (getCheckoutOrigin), as some tests set it.
  jest.restoreAllMocks();
});

beforeEach(() => {
  closeAccount();
  relays.resetRelays();
  fileSystem.resetFileSystem();
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

/** The owner's device: its account open (done), its point of sale prepared. */
async function ownerDevice(): Promise<void> {
  await openTestAccount({ usage: "merchant", signUp: "done" });
  const profile: SavedTerminalProfile = {
    version: 2,
    walletId: TEST_WALLET_ID,
    backupKey: getAccountBackupKey()!,
    lightningAddress: ADDRESS,
    businessName: getAccountSettings()?.businessName ?? "",
    currency: "CHF"
  };
  await saveTerminalProfile(profile);
  resetTerminalProfileCache();
}

const keysOf = (integration: Integration) =>
  deriveIntegrationKeys(integrationSecretKey(team, integration.id));

function channelOf(integration: Integration, list: readonly string[]) {
  return fetchChannel(team.publicKey, keysOf(integration), 1000, list);
}

/** The roster's records, as any of the owner's devices reads them on `list`. */
async function integrationsOn(list: readonly string[] = DEFAULT_RELAYS) {
  const { active, removed } = await rosterOn(team, list);
  return {
    active: active.filter(({ role }) => role === "integration"),
    removed: removed.filter(({ role }) => role === "integration")
  };
}

/**
 * Makes the relays of `on` refuse the events of `author` (a relay may refuse any event: a full
 * disk, a write policy), the others' taken as usual.
 */
function refuseAuthor(author: string, on: readonly string[]) {
  const publish = relays.publishEvent;
  return jest.spyOn(relays, "publishEvent").mockImplementation(async (url, event, options) => {
    if (event.pubkey === author && on.includes(url)) {
      throw new RelayRefusal(url, "blocked: not accepting events");
    }
    return publish(url, event, options);
  });
}

/** What a secret key holds. */
function accessOf(secretKey: string) {
  expect(secretKey.startsWith(INTEGRATION_KEY_PREFIX)).toBe(true);
  return parseIntegrationKey(secretKey);
}

describe("integrations", () => {
  it("are created with a name, their channel on the account's relays and their key", async () => {
    await ownerDevice();
    const shown = await createIntegration("  Shopify Store  ", "node");
    const { integration, secretKey } = shown;

    expect(integration).toMatchObject({ name: "Shopify Store", platform: "node" });
    expect(integration.id).toMatch(/^[0-9a-f]{32}$/);
    // Its record in the roster (never in the settings), on the account's relays, with the platform
    // it was created for (its logo).
    expect((await integrationsOn()).active).toEqual([
      {
        role: "integration",
        id: integration.id,
        name: "Shopify Store",
        since: integration.createdAt,
        removedAt: null,
        platform: "node"
      }
    ]);
    expect(getAccountSettings()).not.toHaveProperty("integrations");
    await expect(loadIntegrations()).resolves.toEqual({
      integrations: [integration],
      roster: "read",
      newer: false
    });
    // The key holds the team's public key, the integration's key and the account's relays; never
    // the business's Lightning address, which its server reads from the channel.
    expect(accessOf(secretKey)).toEqual({
      teamPublicKey: team.publicKey,
      key: integrationSecretKey(team, integration.id),
      relays: DEFAULT_RELAYS
    });
    expect(Object.keys(shown).sort()).toEqual(["integration", "published", "secretKey"]);
    expect(shown.published).toBe(true);
    // Its channel: an active one of role "integration", with what its server takes payments with.
    await expect(channelOf(integration, DEFAULT_RELAYS)).resolves.toMatchObject({
      status: "found",
      channel: {
        status: "active",
        role: "integration",
        name: "Shopify Store",
        profile: { lightningAddress: ADDRESS, currency: "CHF" },
        relays: DEFAULT_RELAYS
      }
    });
  });

  it("need a name, and are MAX_INTEGRATIONS at most, counted on a majority of the relays", async () => {
    await ownerDevice();
    await expect(createIntegration("   ", "node")).rejects.toMatchObject({ code: "invalidName" });
    // Created on another of the owner's devices; one removed since no longer counts.
    for (let index = 0; index < MAX_INTEGRATIONS; index += 1) {
      await publishIntegration(team, {
        id: index.toString(16).padStart(32, "0"),
        name: `Integration ${index}`,
        createdAt: 1790000000,
        platform: "node"
      });
    }
    await expect(createIntegration("Shop", "node")).rejects.toMatchObject({ code: "tooMany" });
    // Fewer than a majority answer: the limit cannot be told, nothing is created.
    for (const relay of DEFAULT_RELAYS.slice(0, 3)) relays.unreachable.add(relay);
    await expect(createIntegration("Shop", "node")).rejects.toMatchObject({
      code: "unreachable"
    });
  });

  it("are created only once a majority of the relays took their record", async () => {
    await ownerDevice();
    const roster = deriveRosterKeys(team).nostr.publicKey;
    const refused = refuseAuthor(roster, DEFAULT_RELAYS.slice(0, 3));
    try {
      await expect(createIntegration("Shop", "node")).rejects.toMatchObject({
        code: "unreachable"
      });
    } finally {
      refused.mockRestore();
    }
    // No channel was published: its server could not find it, and nobody shows its key.
    expect(relays.calls.filter(({ event }) => event?.pubkey === team.publicKey)).toEqual([]);
    // Its channel refused by a majority: created all the same, and its key given then, the only
    // time it ever is (it could not be shown later).
    const channels = refuseAuthor(team.publicKey, DEFAULT_RELAYS.slice(0, 3));
    let shown;
    try {
      shown = await createIntegration("Shop", "node");
    } finally {
      channels.mockRestore();
    }
    expect(shown.published).toBe(false);
    expect(accessOf(shown.secretKey)?.key).toEqual(
      integrationSecretKey(team, shown.integration.id)
    );
    const [created] = (await loadIntegrations()).integrations;
    expect(created).toEqual(shown.integration);
    const holding = () =>
      DEFAULT_RELAYS.filter((relay) =>
        (relays.stored.get(relay) ?? []).some(({ pubkey }) => pubkey === team.publicKey)
      );
    expect(holding()).toEqual(DEFAULT_RELAYS.slice(3));
    // The next sync of the channels (at the next unlock) gives it to every relay.
    await syncTeamChannels();
    expect(holding()).toEqual(DEFAULT_RELAYS);
    await expect(channelOf(created!, DEFAULT_RELAYS)).resolves.toMatchObject({
      channel: { status: "active", role: "integration" }
    });
  });

  it("name this build's web app in their channel, for their servers' checkout links", async () => {
    await ownerDevice();
    // A build without a web app (no RP ID: local, CI): no checkout link.
    const origin = jest.spyOn(paymentLinks, "getCheckoutOrigin").mockReturnValue(null);
    const { integration } = await createIntegration("Shopify Store", "node");
    const before = await channelOf(integration, DEFAULT_RELAYS);
    expect(before.status === "found" && before.channel).not.toHaveProperty("checkout");

    // The staging build: the next sync names its web app, which a server reads (SPEC.md §14).
    origin.mockReturnValue("https://web.example");
    await syncTeamChannels();
    await expect(channelOf(integration, DEFAULT_RELAYS)).resolves.toMatchObject({
      status: "found",
      channel: { role: "integration", checkout: { origin: "https://web.example" } }
    });
    // Up to date: not written again.
    const writes = relays.calls.filter((call) => call.operation === "publish").length;
    await syncTeamChannels();
    expect(relays.calls.filter((call) => call.operation === "publish")).toHaveLength(writes);
  });

  it("carry the owner's tolerance of on-chain underpayments in their channel, beside the profile", async () => {
    await ownerDevice();
    const { integration } = await createIntegration("Shopify Store", "node");
    const before = await channelOf(integration, DEFAULT_RELAYS);
    // None: absent, as in the channels of before (SPEC.md §14).
    expect(before.status === "found" && before.channel).not.toHaveProperty("onchainTolerance");

    await changeOnchainTolerance(500);
    await syncTeamChannels();
    const after = await channelOf(integration, DEFAULT_RELAYS);
    expect(after).toMatchObject({
      status: "found",
      channel: { role: "integration", onchainTolerance: 500 }
    });
    // The profile is what the shop's page may show: never there.
    expect(
      after.status === "found" && after.channel.status === "active" && after.channel.profile
    ).not.toHaveProperty("onchainTolerance");
  });

  it("carry the merchant's own Bitcoin node in their channel, which their server reads", async () => {
    await ownerDevice();
    const { integration } = await createIntegration("Shopify Store", "node");
    const before = await channelOf(integration, DEFAULT_RELAYS);
    // mempool.space: absent, as in the channels of before.
    expect(before.status === "found" && before.channel).not.toHaveProperty("bitcoinNode");

    const node = { url: "https://node.shop.ch", fallback: "none", payers: false } as const;
    await changeBitcoinNode(node);
    await syncTeamChannels();
    const after = await channelOf(integration, DEFAULT_RELAYS);
    expect(after).toMatchObject({
      status: "found",
      channel: { role: "integration", bitcoinNode: node }
    });
    // Beside the profile, never in it: the profile is what the shop's page may show.
    expect(
      after.status === "found" && after.channel.status === "active" && after.channel.profile
    ).not.toHaveProperty("bitcoinNode");

    // Back to mempool.space: absent again.
    await changeBitcoinNode(null);
    await syncTeamChannels();
    const back = await channelOf(integration, DEFAULT_RELAYS);
    expect(back.status === "found" && back.channel).not.toHaveProperty("bitcoinNode");
  });

  it("never name a web app in an employee's channel", async () => {
    await ownerDevice();
    jest.spyOn(paymentLinks, "getCheckoutOrigin").mockReturnValue("https://pay.example");
    jest.spyOn(teamConfig, "getInviteOrigin").mockReturnValue("https://pay.example");
    const { member } = await inviteEmployee("Alice");
    const { integration } = await createIntegration("Shopify Store", "node");
    const employee = await fetchChannel(
      team.publicKey,
      deriveMemberKeys(memberSecret(team, member.id)),
      1000,
      DEFAULT_RELAYS
    );
    expect(employee).toMatchObject({ status: "found", channel: { role: "employee" } });
    expect(employee.status === "found" && employee.channel).not.toHaveProperty("checkout");
    await expect(channelOf(integration, DEFAULT_RELAYS)).resolves.toMatchObject({
      channel: { checkout: { origin: "https://pay.example" } }
    });
  });

  it("give an employee's channel the catalogue's reading keys, never an integration's", async () => {
    await ownerDevice();
    jest.spyOn(teamConfig, "getInviteOrigin").mockReturnValue("https://pay.example");
    const { member } = await inviteEmployee("Alice");
    const { integration } = await createIntegration("Shopify Store", "node");
    const memberKeys = deriveMemberKeys(memberSecret(team, member.id));
    const catalog = channelCatalogOf(deriveCatalogReader(team, 0), 0);
    const employee = await fetchChannel(team.publicKey, memberKeys, 1000, DEFAULT_RELAYS);
    expect(employee).toMatchObject({ status: "found", channel: { role: "employee", catalog } });
    const server = await channelOf(integration, DEFAULT_RELAYS);
    expect(server.status === "found" && server.channel).not.toHaveProperty("catalog");

    // An employee's channel written by an owner's app of before (no catalogue): the next sync of
    // the channels gives it the catalogue's keys.
    if (employee.status !== "found" || employee.channel.status !== "active") throw new Error();
    const { catalog: _catalog, ...before } = employee.channel;
    void _catalog;
    await publishToRelays(
      channelEvent(team, memberKeys, { ...before, updatedAt: before.updatedAt + 1 }),
      { relays: DEFAULT_RELAYS, channel: "account", timeoutMs: 1000, authKey: team.secretKey }
    );
    const old = await fetchChannel(team.publicKey, memberKeys, 1000, DEFAULT_RELAYS);
    expect(old.status === "found" && old.channel).not.toHaveProperty("catalog");
    await syncTeamChannels();
    await expect(
      fetchChannel(team.publicKey, memberKeys, 1000, DEFAULT_RELAYS)
    ).resolves.toMatchObject({ status: "found", channel: { catalog } });
  });

  it("give the catalogue a new key at an employee's removal: the others get it, the removed one none", async () => {
    await ownerDevice();
    jest.spyOn(teamConfig, "getInviteOrigin").mockReturnValue("https://pay.example");
    const draft = { description: "", priceMinor: 350, photo: null, barcode: null };
    await addArticle({ ...draft, name: "Mineral water" }, 0, await refreshCatalogEpoch());
    await addArticle({ ...draft, name: "Iced tea" }, 1, await refreshCatalogEpoch());
    const alice = await inviteEmployee("Alice");
    const bob = await inviteEmployee("Bob");
    const channelOfMember = async (id: string) => {
      const found = await fetchChannel(
        team.publicKey,
        deriveMemberKeys(memberSecret(team, id)),
        1000,
        DEFAULT_RELAYS
      );
      return found.status === "found" ? found.channel : null;
    };
    const names = async (catalog: ChannelCatalog) =>
      (
        await fetchArticles(catalogReaderOf(catalog), {
          relays: DEFAULT_RELAYS,
          channel: "account",
          timeoutMs: 1000
        })
      ).articles
        .map(({ name }) => name)
        .sort();
    // What Alice's device holds before her removal: epoch 0, the articles readable.
    const before = await channelOfMember(alice.member.id);
    const aliceCatalog = before?.status === "active" ? before.catalog! : null;
    expect(aliceCatalog?.epoch).toBe(0);
    await expect(names(aliceCatalog!)).resolves.toEqual(["Iced tea", "Mineral water"]);

    await removeEmployee(alice.member);
    // The catalogue's new epoch: Bob's channel, then the articles sealed again (the background
    // sync the removal started, waited for here).
    await syncTeamChannels();
    const after = await channelOfMember(bob.member.id);
    const bobCatalog = after?.status === "active" ? after.catalog! : null;
    expect(bobCatalog?.epoch).toBe(1);
    await expect(names(bobCatalog!)).resolves.toEqual(["Iced tea", "Mineral water"]);
    // Alice's keys open nothing on the relays any more (every copy replaced), nor a new article.
    await expect(names(aliceCatalog!)).resolves.toEqual([]);
    await addArticle({ ...draft, name: "Croissant" }, 2, await refreshCatalogEpoch());
    await expect(names(aliceCatalog!)).resolves.toEqual([]);
    await expect(names(bobCatalog!)).resolves.toEqual(["Croissant", "Iced tea", "Mineral water"]);
    expect(
      [...relays.stored.values()]
        .flat()
        .filter(({ pubkey }) => pubkey === deriveCatalogKeys(team).nostr.publicKey)
        .every((event) => !catalogEntriesOf(catalogReaderOf(aliceCatalog!), [event]).copies.size)
    ).toBe(true);
    // Her channel says she was removed: no new key for her.
    expect((await channelOfMember(alice.member.id))?.status).toBe("removed");
    // The owner still lists every article, and keeps the new epoch's keys for till mode.
    expect((await loadCatalog()).articles.map(({ name }) => name).sort()).toEqual([
      "Croissant",
      "Iced tea",
      "Mineral water"
    ]);
    expect((await loadCatalogRecord())?.reader).toEqual(bobCatalog);
  });

  it("save an article only with the epoch read again: a removal made on another device is known", async () => {
    await ownerDevice();
    jest.spyOn(teamConfig, "getInviteOrigin").mockReturnValue("https://pay.example");
    const { member } = await inviteEmployee("Alice");
    await expect(currentCatalogEpoch(team, DEFAULT_RELAYS)).resolves.toBe(0);
    // Another of the owner's devices removes Alice: this one does not know it yet.
    await publishRemoved(team, member, member.invitedAt + 60);
    await expect(currentCatalogEpoch(team, DEFAULT_RELAYS)).resolves.toBe(0);

    // Read again as the form opens: no majority of the relays, no epoch, nothing saved.
    for (const relay of DEFAULT_RELAYS.slice(2)) relays.unreachable.add(relay);
    await expect(refreshCatalogEpoch()).resolves.toBeNull();
    const draft = { description: "", priceMinor: 350, photo: null, barcode: null };
    await expect(addArticle({ ...draft, name: "Mineral water" }, 0, null)).rejects.toMatchObject({
      code: "unreachable"
    });
    relays.unreachable.clear();
    const read = (reader: ReturnType<typeof deriveCatalogReader>) =>
      catalogEntriesOf(reader, [...relays.stored.values()].flat()).copies.size;
    expect(read(deriveCatalogReader(team, 1))).toBe(0);

    // A majority: the removal is known, and the article saved sealed with epoch 1's key, which
    // Alice never got.
    const epoch = await refreshCatalogEpoch();
    expect(epoch).toBe(1);
    await expect(currentCatalogEpoch(team, DEFAULT_RELAYS)).resolves.toBe(1);
    await addArticle({ ...draft, name: "Mineral water" }, 0, epoch);
    expect(read(deriveCatalogReader(team, 0))).toBe(0);
    expect(read({ ...deriveCatalogReader(team, 1), otherKeys: [] })).toBe(1);
  });

  it("seal the catalogue again only from what a majority of the relays gave", async () => {
    await ownerDevice();
    const draft = { description: "", priceMinor: 350, photo: null, barcode: null };
    await addArticle({ ...draft, name: "Mineral water" }, 0, await refreshCatalogEpoch());
    const keyIndexes = () =>
      [
        ...catalogEntriesOf(
          deriveCatalogReader(team, 1),
          [...relays.stored.values()].flat()
        ).copies.values()
      ].map(({ keyIndex }) => keyIndex);
    // Sealed with the key of epoch 0: the second key of epoch 1's reader.
    expect(keyIndexes()).toEqual([1]);
    // Epoch 0: nothing to seal again, no relay asked.
    const before = relays.calls.length;
    await expect(sealCatalogAgain(team, 0, DEFAULT_RELAYS)).resolves.toBe(true);
    expect(relays.calls.length).toBe(before);
    // Two relays of five answer: a newer copy may be on the others, nothing is dated again.
    for (const relay of DEFAULT_RELAYS.slice(2)) relays.unreachable.add(relay);
    await expect(sealCatalogAgain(team, 1, DEFAULT_RELAYS)).resolves.toBe(false);
    expect(keyIndexes()).toEqual([1]);
    relays.unreachable.clear();
    await expect(sealCatalogAgain(team, 1, DEFAULT_RELAYS)).resolves.toBe(true);
    expect(keyIndexes()).toEqual([0]);
  });

  it("keep their channel in step, and are deleted once another device removed them", async () => {
    await ownerDevice();
    const { integration } = await createIntegration("Shopify Store", "node");
    await changeBusinessName("Fine Bakery");
    await syncTeamChannels();
    await expect(channelOf(integration, DEFAULT_RELAYS)).resolves.toMatchObject({
      channel: { status: "active", profile: { businessName: "Fine Bakery" } }
    });

    // Another of the owner's devices removed it.
    const removedAt = Math.floor(Date.now() / 1000) + 60;
    await publishToRelays(
      channelEvent(team, keysOf(integration), {
        version: 1,
        status: "removed",
        updatedAt: removedAt
      }),
      { relays: DEFAULT_RELAYS, channel: "account", timeoutMs: 1000, authKey: team.secretKey }
    );
    await syncTeamChannels();
    // Its record says so too, dated by its channel's removal ("Wallet" keeps its sales
    // paid before), its name kept.
    expect(await integrationsOn()).toEqual({
      active: [],
      removed: [expect.objectContaining({ id: integration.id, name: "Shopify Store", removedAt })]
    });
    await expect(loadIntegrations()).resolves.toMatchObject({ integrations: [] });
  });

  it("are removed: their channel says so, then their record", async () => {
    await ownerDevice();
    const { integration } = await createIntegration("Shopify Store", "node");
    await removeIntegration(integration);

    await expect(loadIntegrations()).resolves.toMatchObject({ integrations: [] });
    const found = await channelOf(integration, DEFAULT_RELAYS);
    expect(found).toMatchObject({ status: "found", channel: { status: "removed" } });
    // Its record removed, from its channel's date, its name, creation and platform kept.
    const removedAt = found.status === "found" ? found.channel.updatedAt : -1;
    expect((await integrationsOn()).removed).toEqual([
      {
        role: "integration",
        id: integration.id,
        name: "Shopify Store",
        since: integration.createdAt,
        removedAt,
        platform: "node"
      }
    ]);
  });

  it("stay listed while their record's removal is not on a majority, then the sync records it", async () => {
    await ownerDevice();
    const { integration } = await createIntegration("Shopify Store", "node");
    const roster = deriveRosterKeys(team).nostr.publicKey;
    const refused = refuseAuthor(roster, DEFAULT_RELAYS.slice(0, 3));
    try {
      await expect(removeIntegration(integration)).rejects.toMatchObject({
        code: "removalUnsaved"
      });
    } finally {
      refused.mockRestore();
    }
    // Its server stopped: its channel says "removed" on a majority.
    const found = await channelOf(integration, DEFAULT_RELAYS);
    expect(found).toMatchObject({ channel: { status: "removed" } });
    const removedAt = found.status === "found" ? found.channel.updatedAt : -1;
    // A relay that took the record's removal, the others not: a majority still holds it active.
    expect((await integrationsOn(DEFAULT_RELAYS.slice(0, 3))).active).toHaveLength(1);
    await syncTeamChannels();
    for (const relay of DEFAULT_RELAYS) {
      expect((await integrationsOn([relay])).removed).toEqual([
        expect.objectContaining({ id: integration.id, removedAt })
      ]);
    }
  });

  it("keep the date of a removal made first on another device when removed again", async () => {
    await ownerDevice();
    const { integration } = await createIntegration("Shopify Store", "node");
    // Another of the owner's devices removed it, its settings not here yet.
    const removedAt = Math.floor(Date.now() / 1000) + 60;
    await publishToRelays(
      channelEvent(team, keysOf(integration), {
        version: 1,
        status: "removed",
        updatedAt: removedAt
      }),
      { relays: DEFAULT_RELAYS, channel: "account", timeoutMs: 1000, authKey: team.secretKey }
    );
    await removeIntegration(integration);

    // Its sales paid after the first removal never count ("Wallet").
    expect((await integrationsOn()).removed).toEqual([
      expect.objectContaining({ id: integration.id, removedAt })
    ]);
  });

  it("are recorded as removed on both lists when a change of relays finds them removed elsewhere", async () => {
    await ownerDevice();
    const { integration } = await createIntegration("Shopify Store", "node");
    // Another of the owner's devices removed it, its settings not here yet.
    const removedAt = Math.floor(Date.now() / 1000) + 60;
    await publishToRelays(
      channelEvent(team, keysOf(integration), {
        version: 1,
        status: "removed",
        updatedAt: removedAt
      }),
      { relays: DEFAULT_RELAYS, channel: "account", timeoutMs: 1000, authKey: team.secretKey }
    );
    await changeRelays(OWN);
    for (const list of [DEFAULT_RELAYS, OWN]) {
      expect(await integrationsOn(list)).toEqual({
        active: [],
        removed: [expect.objectContaining({ id: integration.id, removedAt })]
      });
    }
  });

  it("follow a change of the account's relays: their channel names the new list on both", async () => {
    await ownerDevice();
    const { integration, secretKey } = await createIntegration("Shopify Store", "node");
    await changeRelays(OWN);

    // Its record on the new list, where the account reads its team from now on.
    expect((await integrationsOn(OWN)).active).toEqual([
      expect.objectContaining({ id: integration.id, name: "Shopify Store" })
    ]);
    await expect(loadIntegrations()).resolves.toMatchObject({ integrations: [integration] });
    // Its server reads the channel where the key says (the list left), and follows it to OWN.
    for (const list of [DEFAULT_RELAYS, OWN]) {
      await expect(channelOf(integration, list)).resolves.toMatchObject({
        channel: { status: "active", role: "integration", relays: OWN }
      });
    }
    // Its key keeps the list it was given with (it is never shown again): the channel left there
    // leads its server to the new one.
    expect(accessOf(secretKey)?.relays).toEqual(DEFAULT_RELAYS);
  });
});
