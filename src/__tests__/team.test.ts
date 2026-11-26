import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils.js";

import { DEFAULT_RELAYS as TEAM_RELAYS } from "@/config/relays";
import { INVITE_VALIDITY_SECONDS } from "@/config/team";
import { bytesToBase64Url } from "@/lib/base64";
import { encodeRelayList } from "@/lib/relays/list";
import { encodeWalletSecret } from "@/lib/breez/secret";
import * as eventModule from "@/lib/nostr/event";
import { isValidEvent, signEvent } from "@/lib/nostr/event";
import { randomNostrKeys } from "@/lib/nostr/keys";
import { publishToRelays } from "@/lib/nostr/pool";
import { openRecord, sealRecord } from "@/lib/nostr/record";
import { catalogReaderOf, channelCatalogOf } from "@/lib/catalog/reader";
import { channelEvent, fetchChannel, fetchChannels, type TeamChannel } from "@/lib/team/channel";
import {
  closedInviteEvent,
  createInvite,
  fetchInvite,
  fetchInviteEnds,
  inviteLinkOf,
  parseInviteFragment
} from "@/lib/team/invite";
import {
  catalogEpochKey,
  catalogKeyAt,
  deriveCatalogKeys,
  deriveCatalogReader,
  deriveMemberKeys,
  deriveRegistryKey,
  deriveRegistryReader,
  deriveLinkKeyReader,
  deriveLinkOwner,
  deriveBusinessRegistry,
  deriveTeamKeys,
  inviteAddress,
  inviteId,
  isMemberId,
  memberSecret,
  ownerDeviceSecret,
  ownerDevicesSecret,
  ownerTakerKey,
  memberTakerKey,
  newMemberId,
  recordAddress,
  usableTeamKeys,
  wipeTeamKeys
} from "@/lib/team/keys";
import {
  deviceEvent,
  fetchDevices,
  fetchLinks,
  fetchMemberRecords,
  fetchProfiles,
  fetchSales,
  linkEvent,
  profileEvent,
  publishMemberRecord,
  saleEvent,
  type MemberSale
} from "@/lib/team/member-records";
import { parseMembership } from "@/lib/team/membership";

import { taprootAddress } from "../../jest/bitcoin";

import type * as RelaysFake from "../../jest/nostr-relays";

// The in-memory relays of jest.setup.ts.
const relays = jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");

// A BIP-39 test mnemonic (all-zero entropy), never a real wallet's.
const MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const team = deriveTeamKeys(encodeWalletSecret({ mnemonic: MNEMONIC }));
const otherTeam = deriveTeamKeys(encodeWalletSecret({ mnemonic: `${MNEMONIC} zoo` }));
const ORIGIN = "https://web.example";
const NOW = 1790000000;
const MEMBER = "0123456789abcdef0123456789abcdef";
/** A device that joins: its id. */
const DEVICE = "d1".repeat(16);
const keys = deriveMemberKeys(memberSecret(team, MEMBER));

const profile = {
  businessName: "Fine Bakery",
  lightningAddress: "sattleme02c6047f94@breez.tips",
  currency: "CHF",
  onchain: true,
  logo: null
};
const active: TeamChannel = {
  version: 1,
  status: "active",
  name: "Alice",
  role: "employee",
  profile,
  registryKey: "ab".repeat(32),
  registryReader: "52d64e4fbc5670d62bad80c169aac897172117ce88c4978506f0c7dd9675ff18",
  linkOwner: "755748c663a1eb5ab3e6810507b1bbd0bcbd2acd02dcd2eb9cf3b5acba99e426",
  relays: [...TEAM_RELAYS],
  updatedAt: NOW
};

function newInvite(invitedAt = NOW) {
  return createInvite({
    team,
    memberId: MEMBER,
    name: "Alice",
    invitedAt,
    origin: ORIGIN,
    relays: TEAM_RELAYS
  });
}

function linkOf(url: string) {
  const link = inviteLinkOf(url);
  if (!link) throw new Error("No invitation in the link");
  return link;
}

const publish = (event: Parameters<typeof publishToRelays>[0], authKey = team.secretKey) =>
  publishToRelays(event, { relays: TEAM_RELAYS, channel: "account", timeoutMs: 1000, authKey });
/** Publishes an invitation's event to one relay only. */
const publishOne = (relay: string, event: Parameters<typeof publishToRelays>[0]) =>
  publishToRelays(event, {
    relays: [relay],
    channel: "account",
    timeoutMs: 1000,
    authKey: keys.invite.nostr.secretKey
  });

beforeEach(() => relays.resetRelays());

describe("team keys", () => {
  it("derive the same keys from the same wallet, other keys from another", () => {
    expect(deriveTeamKeys(encodeWalletSecret({ mnemonic: MNEMONIC }))).toEqual(team);
    expect(otherTeam.publicKey).not.toBe(team.publicKey);
    expect(deriveMemberKeys(memberSecret(team, MEMBER))).toEqual(keys);
    const other = deriveMemberKeys(memberSecret(team, newMemberId()));
    expect(other.nostr.publicKey).not.toBe(keys.nostr.publicKey);
    expect(other.channel.address).not.toBe(keys.channel.address);
    // Apart from the settings backups' keys of the same wallet.
    expect(team.publicKey).not.toBe(
      "d0ddcb62668ad9a39ff78511a4948e464b8f60b5c6bf74ec6e3ef8e17ac7381e"
    );
  });

  it("never change: every team's records derive from them (salts, info strings)", () => {
    expect(team.publicKey).toBe("a8455e8c7b826691785cc9814b0e69ee2658c42b66db45f1cd3d5f9c9f5507ca");
    expect(keys.nostr.publicKey).toBe(
      "8802bc5d6a7643aadb45ee070618a45d09e74ac4ceec30a1405e5b7b1b62458b"
    );
    // The author of its payment links' records, their own (the owner reads a year of links
    // without the sales; `links/nostr-secret-key/v1`, computed apart, in Python).
    expect(keys.links.publicKey).toBe(
      "dddff74034609e22eb89e12ac3780f77dd609b1c5ee730e33dd7f41a2021c63b"
    );
    // The invitation's author, from the key of its link (inviteAuthor; computed apart, in Python).
    expect(keys.invite.nostr.publicKey).toBe(
      "6ed35c1803f26266a738f8c09f11d31e37c37f978e237ec252c77e5c4126ecf2"
    );
    expect(keys.channel.address).toBe(
      "8d398814caa33ceb6cf79c4fc6f9cd6c4c768d71043df2af13bbb5e420df72fd"
    );
    // The key of the proof that a holder of the member's secret closed the invitation for a device
    // (deviceProof): its salt and `info`, spelled out.
    expect(keys.invite.deviceKey).toEqual(
      hkdf(
        sha256,
        memberSecret(team, MEMBER),
        utf8ToBytes("sattle.me/team-member"),
        utf8ToBytes("invite/device-key/v1"),
        32
      )
    );
    // The business's registry key (src/lib/registry/): every declaration's address derives from it.
    expect(bytesToHex(deriveRegistryKey(team))).toBe(
      "efb29c7a1120f3699f1fa155b5209b53153ed12df82804807e9a85f42ee6e0a9"
    );
    // Its reading key: every declaration is encrypted for it (computed apart, in Python).
    expect(deriveRegistryReader(team).publicKey).toBe(
      "52d64e4fbc5670d62bad80c169aac897172117ce88c4978506f0c7dd9675ff18"
    );
    // Its link owner key: the owner's final versions of payment links derive from it (computed
    // apart, in Python).
    expect(deriveLinkOwner(team).publicKey).toBe(
      "755748c663a1eb5ab3e6810507b1bbd0bcbd2acd02dcd2eb9cf3b5acba99e426"
    );
    // Its link key reader: every payment link's key is sealed for it, never for
    // a key an export grant gives (computed apart, in Python).
    expect(deriveLinkKeyReader(team).publicKey).toBe(
      "a6d7ae861c50b55c5b086ff1ac9955bf485f22b406482d4077d7c5540e4fb0b9"
    );
    expect(deriveLinkKeyReader(team).secretKey).toEqual(
      hkdf(sha256, team.root, utf8ToBytes("sattle.me/team"), utf8ToBytes("link-key-reader/v1"), 32)
    );
    expect(deriveBusinessRegistry(team)).toEqual({
      key: deriveRegistryKey(team),
      reader: deriveRegistryReader(team).publicKey,
      owner: deriveLinkOwner(team).publicKey,
      linkKeyReader: deriveLinkKeyReader(team).publicKey
    });
    // The secret of one of the owner's devices: its salt and `info`,
    // spelled out, never a member's of the same id.
    expect(ownerDeviceSecret(team, MEMBER)).toEqual(
      hkdf(
        sha256,
        team.root,
        utf8ToBytes("sattle.me/team"),
        utf8ToBytes(`owner-device/${MEMBER}/v1`),
        32
      )
    );
    expect(ownerDeviceSecret(team, MEMBER)).not.toEqual(memberSecret(team, MEMBER));
    // The catalogue's NIP-44 keys: epoch 0 its first, from the root; from
    // epoch 1, from the secret the owner's devices share, under their own salt (spelled out).
    expect(catalogKeyAt(team, 0)).toEqual(
      hkdf(
        sha256,
        team.root,
        utf8ToBytes("sattle.me/team"),
        utf8ToBytes("catalog/encryption-key/v1"),
        32
      )
    );
    expect(catalogKeyAt(team, 3)).toEqual(
      hkdf(
        sha256,
        ownerDevicesSecret(team),
        utf8ToBytes("sattle.me/catalog"),
        utf8ToBytes("encryption-key/epoch/3/v1"),
        32
      )
    );
    expect(catalogEpochKey(ownerDevicesSecret(team), 3)).toEqual(catalogKeyAt(team, 3));
    expect(() => catalogEpochKey(ownerDevicesSecret(team), 0)).toThrow();
    // The secret all the owner's devices share (the notice of a move of the account's relays).
    expect(ownerDevicesSecret(team)).toEqual(
      hkdf(sha256, team.root, utf8ToBytes("sattle.me/team"), utf8ToBytes("owner-devices/v1"), 32)
    );
    // The keys that mark who took a sale in its declarations: the owner's
    // devices', from their shared secret, and a member's, from its secret.
    expect(ownerTakerKey(ownerDevicesSecret(team))).toEqual(
      hkdf(
        sha256,
        ownerDevicesSecret(team),
        utf8ToBytes("sattle.me/declaration-taker"),
        utf8ToBytes("owner-devices/v1"),
        32
      )
    );
    expect(memberTakerKey(memberSecret(team, MEMBER))).toEqual(
      hkdf(
        sha256,
        memberSecret(team, MEMBER),
        utf8ToBytes("sattle.me/declaration-taker"),
        utf8ToBytes("member/v1"),
        32
      )
    );
  });

  it("are wiped once the account closes: nothing signs nor derives with them any more", () => {
    const team = deriveTeamKeys(encodeWalletSecret({ mnemonic: `${MNEMONIC} wiped` }));
    const member = deriveMemberKeys(memberSecret(team, MEMBER));

    wipeTeamKeys(team);

    expect(team.root.every((byte) => byte === 0)).toBe(true);
    expect(team.secretKey.every((byte) => byte === 0)).toBe(true);
    expect(() => usableTeamKeys(team)).toThrow("The team keys were wiped");
    expect(() => memberSecret(team, MEMBER)).toThrow("The team keys were wiped");
    expect(() => deriveRegistryKey(team)).toThrow("The team keys were wiped");
    expect(() => deriveRegistryReader(team)).toThrow("The team keys were wiped");
    expect(() => deriveLinkOwner(team)).toThrow("The team keys were wiped");
    expect(() => deriveLinkKeyReader(team)).toThrow("The team keys were wiped");
    expect(() =>
      channelEvent(team, member, { version: 1, status: "removed", updatedAt: NOW })
    ).toThrow("The team keys were wiped");
  });

  it("make member ids of 16 random bytes", () => {
    const id = newMemberId();
    expect(isMemberId(id)).toBe(true);
    expect(newMemberId()).not.toBe(id);
    expect(isMemberId("xyz")).toBe(false);
    expect(() => memberSecret(team, "../x")).toThrow("Invalid member id");
  });
});

describe("invitation", () => {
  // The relays judge an invitation's end (NIP-40) on their own clock: at the time of these tests.
  beforeEach(() => jest.spyOn(Date, "now").mockReturnValue(NOW * 1000));
  afterEach(() => jest.restoreAllMocks());

  it("is a link with an id, a key and its relays, and one record that names nothing", () => {
    const invite = newInvite();
    const { id, key, relays } = linkOf(invite.url);
    expect(relays).toEqual(TEAM_RELAYS);
    expect(invite.url).toBe(
      `${ORIGIN}/join#${bytesToBase64Url(id)}.${bytesToBase64Url(key)}.${encodeRelayList(TEAM_RELAYS)}`
    );
    expect(invite.url.split("#")[1]).toMatch(
      /^[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]+$/
    );
    expect(invite.expiresAt).toBe(NOW + INVITE_VALIDITY_SECONDS);
    expect(isValidEvent(invite.event)).toBe(true);
    expect(invite.event).toMatchObject({
      kind: 30078,
      created_at: NOW,
      pubkey: keys.invite.nostr.publicKey,
      tags: [
        ["d", inviteAddress(id)],
        // 48 hours.
        ["expiration", String(NOW + 48 * 60 * 60)]
      ]
    });
    const visible = JSON.stringify(invite.event);
    for (const hidden of ["Alice", team.publicKey, bytesToHex(id), bytesToBase64Url(id), MEMBER]) {
      expect(visible).not.toContain(hidden);
    }
    // The same member gives the same link: the owner can show it again.
    expect(newInvite().url).toBe(invite.url);
  });

  it("reads the id and the key of a link, whatever its origin", () => {
    const { url } = newInvite();
    const fragment = url.slice(url.indexOf("#"));
    expect(parseInviteFragment(fragment)).toEqual(linkOf(url));
    expect(inviteLinkOf(` http://localhost:8081/join${fragment}\n`)).toEqual(linkOf(url));
    expect(inviteLinkOf(`${ORIGIN}/pay${fragment}`)).toBeNull();
    expect(inviteLinkOf(`${ORIGIN}/join`)).toBeNull();
    expect(parseInviteFragment(`${fragment}.x`)).toBeNull();
    expect(parseInviteFragment(fragment.slice(0, -1))).toBeNull();
  });

  it("opens with the link's key and gives the member's secret, once", async () => {
    const invite = newInvite();
    await publish(invite.event, keys.invite.nostr.secretKey);
    const link = linkOf(invite.url);

    const lookup = await fetchInvite(link, NOW + 60);
    expect(lookup).toEqual({
      status: "open",
      invite: {
        team: team.publicKey,
        secret: memberSecret(team, MEMBER),
        name: "Alice",
        expiresAt: NOW + INVITE_VALIDITY_SECONDS,
        openedAt: NOW
      }
    });

    // The joining device closes it: the next one finds it closed, and the secret is gone.
    const closed = closedInviteEvent(keys, {
      team: team.publicKey,
      expiresAt: invite.expiresAt,
      openedAt: NOW,
      closedAt: NOW + 60,
      device: DEVICE
    });
    await publish(closed, keys.invite.nostr.secretKey);
    await expect(fetchInvite(link, NOW + 120)).resolves.toEqual({
      status: "closed",
      device: DEVICE
    });
    for (const relay of TEAM_RELAYS) expect(relays.stored.get(relay)).toEqual([closed]);
    // Re-publishing the open one changes nothing: the relays keep the latest.
    await publish(invite.event, keys.invite.nostr.secretKey);
    await expect(fetchInvite(link, NOW + 120)).resolves.toEqual({
      status: "closed",
      device: DEVICE
    });
  });

  it("is closed after the open record even within the same second", () => {
    const withdrawn = closedInviteEvent(keys, {
      team: team.publicKey,
      expiresAt: NOW + 10,
      openedAt: NOW,
      closedAt: NOW,
      device: null
    });
    expect(withdrawn.created_at).toBe(NOW + 1);
  });

  it("is closed by a device one second after it opened, whenever it joins", async () => {
    const invite = newInvite();
    await publish(invite.event, keys.invite.nostr.secretKey);
    // Two devices use it at once (a phone and a tablet): they write the same date, and every relay
    // keeps the same one of them (the lowest event id), whatever came first.
    const close = (device: string, closedAt: number) =>
      closedInviteEvent(keys, {
        team: team.publicKey,
        expiresAt: invite.expiresAt,
        openedAt: NOW,
        closedAt,
        device
      });
    const [first, second] = [close("01".repeat(16), NOW + 60), close("02".repeat(16), NOW + 900)];
    expect(first.created_at).toBe(NOW + 1);
    expect(second.created_at).toBe(NOW + 1);
    const kept = first.id < second.id ? first : second;
    await publish(second, keys.invite.nostr.secretKey).catch(() => undefined);
    for (const relay of TEAM_RELAYS.slice(0, 3)) {
      await publishOne(relay, first).catch(() => undefined);
    }
    const lookup = await fetchInvite(linkOf(invite.url), NOW + 1000);
    expect(lookup).toEqual({
      status: "closed",
      device: kept === first ? "01".repeat(16) : "02".repeat(16)
    });
  });

  it("only asks for its author's events: anyone's at its address change nothing", async () => {
    const invite = newInvite();
    await publish(invite.event, keys.invite.nostr.secretKey);
    const link = linkOf(invite.url);
    const address = inviteAddress(link.id);
    // A relay, or anyone who saw the address: a record of a "newer format", then a flood past
    // what a relay sends for one filter.
    const stranger = (n: number, content: string) =>
      signEvent(
        { kind: 30078, created_at: NOW + 60 + n, tags: [["d", address]], content },
        new Uint8Array(32).fill(40 + (n % 10))
      );
    const forged = [
      stranger(0, "#newer"),
      ...Array.from({ length: relays.MAX_EVENTS_PER_FILTER + 20 }, (_, n) => stranger(n + 1, ""))
    ];
    for (const relay of TEAM_RELAYS) {
      relays.stored.set(relay, [...(relays.stored.get(relay) ?? []), ...forged]);
    }
    await expect(fetchInvite(link, NOW + 300)).resolves.toMatchObject({ status: "open" });
  });

  it("expires after 48 hours", async () => {
    const invite = newInvite();
    expect(INVITE_VALIDITY_SECONDS).toBe(48 * 60 * 60);
    expect(invite.expiresAt).toBe(NOW + 48 * 60 * 60);
    await publish(invite.event, keys.invite.nostr.secretKey);
    await expect(fetchInvite(linkOf(invite.url), invite.expiresAt - 1)).resolves.toMatchObject({
      status: "open"
    });
    await expect(fetchInvite(linkOf(invite.url), invite.expiresAt)).resolves.toEqual({
      status: "expired"
    });
  });

  it("ends as its record says, never by the constant", async () => {
    // Shown again with the end its record has: the same link, that end kept.
    const invitedAt = NOW - 60 * 60;
    const shown = createInvite({
      team,
      memberId: MEMBER,
      name: "Alice",
      invitedAt,
      expiresAt: invitedAt + 2 * 60 * 60,
      origin: ORIGIN,
      relays: TEAM_RELAYS
    });
    expect(shown.url).toBe(newInvite().url);
    expect(shown.event.tags).toContainEqual(["expiration", String(invitedAt + 2 * 60 * 60)]);
    await publish(shown.event, keys.invite.nostr.secretKey);
    await expect(fetchInvite(linkOf(shown.url), NOW)).resolves.toMatchObject({
      status: "open",
      invite: { expiresAt: invitedAt + 2 * 60 * 60 }
    });
    await expect(fetchInviteEnds(team, [{ id: MEMBER, keys }], TEAM_RELAYS)).resolves.toEqual(
      new Map([[MEMBER, invitedAt + 2 * 60 * 60]])
    );
  });

  it("tells a wrong link from relays that cannot be reached", async () => {
    const invite = newInvite();
    await publish(invite.event, keys.invite.nostr.secretKey);
    const { id } = linkOf(invite.url);
    await expect(fetchInvite({ id, key: new Uint8Array(32).fill(3) }, NOW)).resolves.toEqual({
      status: "notFound"
    });
    for (const relay of TEAM_RELAYS) relays.unreachable.add(relay);
    await expect(fetchInvite(linkOf(invite.url), NOW)).resolves.toEqual({ status: "unreachable" });
  });

  it("cannot be made to name another team by whoever holds the link", async () => {
    const invite = newInvite();
    const link = linkOf(invite.url);
    // The link's holder can open the record and so sign as its author, with a newer record
    // naming another team (and its own Lightning address in that team's channel).
    const forged = sealRecord({
      type: "team-invite",
      value: {
        version: 1,
        state: "open",
        team: otherTeam.publicKey,
        secret: bytesToHex(memberSecret(team, MEMBER)),
        name: "Alice",
        expiresAt: invite.expiresAt
      },
      signer: keys.invite.nostr.secretKey,
      encryptionKey: link.key,
      address: inviteAddress(link.id),
      createdAt: NOW + 30
    });
    await publish(invite.event, keys.invite.nostr.secretKey);
    relays.stored.set(TEAM_RELAYS[0], [forged]);
    const lookup = await fetchInvite(link, NOW + 60);
    expect(lookup.status === "open" && lookup.invite.team).toBe(team.publicKey);
    // Nor give another member's secret: it must be the one whose key signs the record.
    const otherSecret = memberSecret(team, newMemberId());
    const swapped = sealRecord({
      type: "team-invite",
      value: {
        version: 1,
        state: "open",
        team: team.publicKey,
        secret: bytesToHex(otherSecret),
        name: "Alice",
        expiresAt: invite.expiresAt
      },
      signer: keys.invite.nostr.secretKey,
      encryptionKey: link.key,
      address: inviteAddress(link.id),
      createdAt: NOW + 40
    });
    relays.stored.set(TEAM_RELAYS[0], [swapped]);
    const again = await fetchInvite(link, NOW + 60);
    expect(again.status === "open" && again.invite.secret).toEqual(memberSecret(team, MEMBER));
  });

  it("commits its id to the invitation's author and to the team", () => {
    const a = inviteId(keys.invite.nostr.publicKey, team.publicKey);
    expect(a).toHaveLength(16);
    expect(inviteId(keys.invite.nostr.publicKey, otherTeam.publicKey)).not.toEqual(a);
    expect(inviteId(randomNostrKeys().publicKey, team.publicKey)).not.toEqual(a);
    expect(inviteAddress(a)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("channel", () => {
  it("brings the member's profile, signed by the team", async () => {
    await publish(channelEvent(team, keys, active));
    await expect(fetchChannel(team.publicKey, keys)).resolves.toEqual({
      status: "found",
      channel: active
    });
    // Another member's keys do not open it.
    const other = deriveMemberKeys(memberSecret(team, newMemberId()));
    await expect(fetchChannel(team.publicKey, other)).resolves.toEqual({ status: "notFound" });
  });

  it("tells the member it was removed, with nothing else", async () => {
    await publish(channelEvent(team, keys, active));
    const removed: TeamChannel = { version: 1, status: "removed", updatedAt: NOW + 10 };
    const event = channelEvent(team, keys, removed);
    await publish(event);
    await expect(fetchChannel(team.publicKey, keys)).resolves.toEqual({
      status: "found",
      channel: removed
    });
  });

  it("only takes channels of the team", async () => {
    // Another team (a forger who got the member's secret) signs a channel at the same address.
    const forged = channelEvent(otherTeam, keys, {
      ...(active as Extract<TeamChannel, { status: "active" }>),
      profile: { ...profile, lightningAddress: "thief@example.com" },
      updatedAt: NOW + 50
    });
    await publish(forged, otherTeam.secretKey);
    await publish(channelEvent(team, keys, active));
    await expect(fetchChannel(team.publicKey, keys)).resolves.toEqual({
      status: "found",
      channel: active
    });
  });

  it("carries the business's choice of on-chain payments", async () => {
    const lightningOnly = {
      ...active,
      profile: { ...profile, onchain: false },
      updatedAt: NOW + 2
    };
    await publish(channelEvent(team, keys, lightningOnly as TeamChannel));
    await expect(fetchChannel(team.publicKey, keys)).resolves.toEqual({
      status: "found",
      channel: lightningOnly
    });
  });

  it("refuses a channel without the choice of on-chain payments, the logo or the relays", async () => {
    const sealed = (updatedAt: number, value: Record<string, unknown>) =>
      sealRecord({
        type: "team-channel",
        value: { ...value, updatedAt },
        signer: team.secretKey,
        encryptionKey: keys.channel.encryptionKey,
        address: keys.channel.address,
        createdAt: updatedAt
      });
    const { onchain: _onchain, ...noOnchain } = profile;
    const { logo: _logo, ...noLogo } = profile;
    const { relays: _relays, ...noRelays } = active as Extract<TeamChannel, { status: "active" }>;
    const invalid = [
      { ...active, profile: { ...profile, onchain: "no" } },
      { ...active, profile: noOnchain },
      { ...active, profile: noLogo },
      noRelays
    ];
    for (const [n, value] of invalid.entries()) {
      const at = NOW + 10 * (n + 1);
      await publish(channelEvent(team, keys, { ...active, updatedAt: at }));
      await expect(fetchChannel(team.publicKey, keys)).resolves.toMatchObject({ status: "found" });
      // Not a channel: the relays keep it over the previous one, so the member's device finds
      // none and changes nothing.
      await publish(sealed(at + 1, value));
      await expect(fetchChannel(team.publicKey, keys)).resolves.toEqual({ status: "notFound" });
    }
  });

  it("carries the catalogue's reading keys of its epoch, never the author's secret, and leaves out invalid ones", async () => {
    // Epoch 2 (two employees removed): its key, and the one before for articles not sealed again.
    const catalog = channelCatalogOf(deriveCatalogReader(team, 2), 2);
    const withCatalog = { ...active, catalog, updatedAt: NOW + 1 } as TeamChannel;
    await publish(channelEvent(team, keys, withCatalog));
    const found = await fetchChannel(team.publicKey, keys);
    expect(found).toEqual({ status: "found", channel: withCatalog });
    const keysOfCatalog = deriveCatalogKeys(team);
    expect(catalogReaderOf(catalog)).toEqual({
      nostr: { publicKey: keysOfCatalog.nostr.publicKey },
      encryptionKey: catalogKeyAt(team, 2),
      otherKeys: [catalogKeyAt(team, 1)],
      addressKey: keysOfCatalog.addressKey
    });
    // Neither the author's secret, nor the key of any other epoch (a removed employee's).
    const text = JSON.stringify(catalog);
    expect(text).not.toContain(bytesToHex(keysOfCatalog.nostr.secretKey));
    expect(text).not.toContain(bytesToHex(catalogKeyAt(team, 0)));
    expect(text).not.toContain(bytesToHex(catalogKeyAt(team, 3)));
    // An invalid catalogue: the channel stays valid, without one (as an app before it reads it).
    for (const [at, value] of [
      [NOW + 2, { ...catalog, author: "zz" }],
      [NOW + 3, { ...catalog, encryptionKeys: [] }],
      [NOW + 4, { ...catalog, encryptionKeys: [...catalog.encryptionKeys, "ab".repeat(32)] }]
    ] as const) {
      await publish(
        sealRecord({
          type: "team-channel",
          value: { ...active, catalog: value, updatedAt: at },
          signer: team.secretKey,
          encryptionKey: keys.channel.encryptionKey,
          address: keys.channel.address,
          createdAt: at
        })
      );
      await expect(fetchChannel(team.publicKey, keys)).resolves.toEqual({
        status: "found",
        channel: { ...active, updatedAt: at }
      });
    }
  });

  it("flags a channel of a newer format", async () => {
    const newer = sealRecord({
      type: "team-channel",
      value: { ...active, version: 3, updatedAt: NOW + 5 },
      signer: team.secretKey,
      encryptionKey: keys.channel.encryptionKey,
      address: keys.channel.address,
      createdAt: NOW + 5
    });
    await publish(channelEvent(team, keys, active));
    await publish(newer);
    await expect(fetchChannel(team.publicKey, keys)).resolves.toEqual({ status: "newer" });
  });

  it("reads several members' channels at once for the owner", async () => {
    const secondId = newMemberId();
    const second = deriveMemberKeys(memberSecret(team, secondId));
    await publish(channelEvent(team, keys, active));
    const channels = await fetchChannels(team, [
      { id: MEMBER, keys },
      { id: secondId, keys: second }
    ]);
    expect(channels?.get(MEMBER)?.newest?.value).toEqual(active);
    expect(channels?.get(secondId)?.newest).toBeNull();
    for (const relay of TEAM_RELAYS) relays.unreachable.add(relay);
    await expect(fetchChannels(team, [{ id: MEMBER, keys }])).resolves.toBeNull();
  });
});

describe("invitation and channel, from fewer than a majority's answers", () => {
  // The relays judge an invitation's end (NIP-40) on their own clock: at the time of these tests.
  beforeEach(() => jest.spyOn(Date, "now").mockReturnValue(NOW * 1000));
  afterEach(() => jest.restoreAllMocks());

  it("tell nothing of the invitation: a closed copy may be on the others", async () => {
    const invite = newInvite();
    await publish(invite.event, keys.invite.nostr.secretKey);
    const link = linkOf(invite.url);
    for (const relay of TEAM_RELAYS.slice(2)) relays.unreachable.add(relay);
    await expect(fetchInvite(link, NOW + 60)).resolves.toEqual({ status: "unreachable" });
    relays.unreachable.delete(TEAM_RELAYS[2]);
    await expect(fetchInvite(link, NOW + 60)).resolves.toMatchObject({ status: "open" });
  });

  it("tell nothing of an active channel, but a removal, which is final", async () => {
    await publish(channelEvent(team, keys, active));
    for (const relay of TEAM_RELAYS.slice(2)) relays.unreachable.add(relay);
    await expect(fetchChannel(team.publicKey, keys)).resolves.toEqual({ status: "unreachable" });
    // Nothing either from them: not found only from a majority's answers.
    const other = deriveMemberKeys(memberSecret(team, newMemberId()));
    await expect(fetchChannel(team.publicKey, other)).resolves.toEqual({ status: "unreachable" });
    relays.unreachable.clear();
    const removed: TeamChannel = { version: 1, status: "removed", updatedAt: NOW + 10 };
    await publish(channelEvent(team, keys, removed));
    for (const relay of TEAM_RELAYS.slice(2)) relays.unreachable.add(relay);
    await expect(fetchChannel(team.publicKey, keys)).resolves.toEqual({
      status: "found",
      channel: removed
    });
  });
});

describe("member records", () => {
  /** A link's sealed signing key: the owner alone opens it (src/lib/payment-link/sealed-key.ts). */
  const SEALED_KEY = "A".repeat(200);
  const sale: MemberSale = {
    version: 1,
    paymentHash: "ab".repeat(32),
    sats: "46918",
    fiat: { minor: 2450, digits: 2, currency: "CHF" },
    note: "Table 4",
    verifyUrl: `https://breez.tips/lnurlpay/verify/${"ab".repeat(32)}`,
    createdAt: NOW,
    expiresAt: NOW + 600,
    paidAt: null,
    onchainAddress: null,
    onchainTag: null,
    sale: "ef".repeat(32)
  };

  it("tell the owner where and when the member joined", async () => {
    const device = {
      version: 1 as const,
      deviceId: "f".repeat(32),
      platform: "ios" as const,
      joinedAt: NOW
    };
    await publishMemberRecord(keys, deviceEvent(keys, device));
    const secondId = newMemberId();
    const second = deriveMemberKeys(memberSecret(team, secondId));
    await expect(
      fetchDevices([
        { id: MEMBER, keys },
        { id: secondId, keys: second }
      ])
    ).resolves.toEqual(
      new Map<string, unknown>([
        [MEMBER, device],
        [secondId, null]
      ])
    );
  });

  describe("of an hour shown with the address alone", () => {
    const HOUR = NOW - (NOW % 3600);
    const alone: MemberSale = {
      version: 1,
      paymentHash: null,
      verifyUrl: null,
      hour: HOUR,
      sats: "46918",
      fiat: { minor: 2450, digits: 2, currency: "CHF" },
      note: "Table 4",
      createdAt: NOW,
      expiresAt: NOW + 600,
      paidAt: null,
      onchainAddress: taprootAddress(1),
      onchainTag: null,
      sale: "ef".repeat(32)
    };

    it("keep it as a record of its own, apart from the sale's invoices, paid replacing shown", async () => {
      await publishMemberRecord(keys, saleEvent(keys, sale));
      await publishMemberRecord(keys, saleEvent(keys, alone));
      const paid = { ...alone, paidAt: NOW + 30 };
      await publishMemberRecord(keys, saleEvent(keys, paid));
      const next = { ...alone, hour: HOUR + 3600, createdAt: NOW + 100 };
      await publishMemberRecord(keys, saleEvent(keys, next));

      await expect(fetchSales(keys, NOW - 1)).resolves.toEqual([next, paid, sale]);
      // Nothing of it shows on the relays, its address included.
      for (const event of relays.stored.get(TEAM_RELAYS[0]) ?? []) {
        for (const hidden of [alone.onchainAddress, "Table 4", String(HOUR)]) {
          expect(JSON.stringify(event.tags)).not.toContain(hidden);
          expect(event.content).not.toContain(JSON.stringify(hidden));
        }
      }
    });

    it("are of a type an app from before ignores, at an address of their sale and hour", () => {
      const fixed = deriveMemberKeys(new Uint8Array(32).fill(7));
      const event = saleEvent(fixed, alone);
      // Never change it: the records of every device are there.
      expect(event.tags).toContainEqual([
        "d",
        "d287fd08206410dfcd159676c80a4e6866a8f7993b3fdc0073f5008a91e70e50"
      ]);
      expect(HOUR).toBe(1789999200);
      // An invoice's record, at the address of its payment hash, as always.
      expect(saleEvent(fixed, sale).tags).toContainEqual([
        "d",
        "bd793c8391a2740f15cca247c884844a7b5ba2024eb2c50be6f2f558b1b445f3"
      ]);
      // A reader of `team-sale` alone (an app from before) opens nothing of it.
      expect(
        openRecord(event, {
          type: "team-sale",
          encryptionKey: fixed.records.encryptionKey,
          address: () => true,
          author: fixed.nostr.publicKey,
          parse: (value) => value
        })
      ).toBeNull();
      // Its content names no invoice.
      const opened = openRecord(event, {
        type: "team-sale-onchain",
        encryptionKey: fixed.records.encryptionKey,
        address: () => true,
        author: fixed.nostr.publicKey,
        parse: (value) => value as Record<string, unknown>
      });
      expect(opened?.status).toBe("ok");
      const value = opened?.status === "ok" ? opened.value : {};
      expect(value).not.toHaveProperty("paymentHash");
      expect(value).not.toHaveProperty("verifyUrl");
      expect(value).toMatchObject({ version: 1, hour: HOUR, onchainAddress: alone.onchainAddress });
    });

    it("leave out one without a valid address or hour, or at another address", async () => {
      const bad = [
        { ...alone, onchainAddress: "bc1qnotataprootaddress" },
        { ...alone, hour: HOUR + 1 },
        { ...alone, hour: 0 },
        { ...alone, sats: "0" },
        { ...alone, onchainTag: "zz" }
      ];
      for (const [n, record] of bad.entries()) {
        await publishMemberRecord(
          keys,
          saleEvent(keys, { ...record, sale: n.toString(16).padStart(64, "0") } as MemberSale)
        );
      }
      // Sealed at the address of another sale's hour: not this record.
      const elsewhere = sealRecord({
        type: "team-sale-onchain",
        value: { ...alone, paymentHash: undefined, verifyUrl: undefined },
        signer: keys.nostr.secretKey,
        encryptionKey: keys.records.encryptionKey,
        address: recordAddress(keys, `sale-onchain:${alone.sale}:${HOUR + 3600}`),
        createdAt: NOW
      });
      await publishMemberRecord(keys, elsewhere);
      await expect(fetchSales(keys, 0)).resolves.toEqual([]);
    });
  });

  it("keep a sale's underpayment, its sale named", async () => {
    const TXID = "ab".repeat(32);
    const named = sale;
    await publishMemberRecord(keys, saleEvent(keys, named));
    const underpaid = {
      ...named,
      underpaid: { at: NOW + 60, received: "4000", due: null, transactions: [TXID] }
    };
    const event = saleEvent(keys, underpaid);
    // Dated when it was seen underpaid: it replaces the record of the invoice shown.
    expect(event.created_at).toBe(NOW + 60);
    await publishMemberRecord(keys, event);
    await expect(fetchSales(keys, NOW - 1)).resolves.toEqual([underpaid]);
    // Its amount due once known, then the sale paid: each replaces the one before.
    const known = {
      ...named,
      underpaid: { at: NOW + 90, received: "4000", due: "10000", transactions: [TXID] }
    };
    await publishMemberRecord(keys, saleEvent(keys, known));
    await expect(fetchSales(keys, NOW - 1)).resolves.toEqual([known]);
  });

  it("leave out a sale whose underpayment or sale is not valid, or that names no sale", async () => {
    const { sale: _sale, ...unnamed } = sale;
    const bad = [
      unnamed,
      { ...sale, sale: "not hex" },
      { ...sale, underpaid: { at: NOW - 10, received: "1", due: null, transactions: [] } },
      { ...sale, underpaid: { at: NOW, received: "-1", due: null, transactions: [] } },
      { ...sale, underpaid: { at: NOW, received: "1", due: "x", transactions: [] } },
      { ...sale, underpaid: { at: NOW, received: "1", due: null, transactions: ["zz"] } }
    ];
    for (const [n, record] of bad.entries()) {
      const paymentHash = n.toString(16).padStart(64, "0");
      await publishMemberRecord(
        keys,
        saleEvent(keys, { ...record, paymentHash } as unknown as typeof sale)
      );
    }
    await expect(fetchSales(keys, 0)).resolves.toEqual([]);
  });

  it("keep each sale once, paid replacing shown, readable by the member's keys only", async () => {
    await publishMemberRecord(keys, saleEvent(keys, sale));
    const paid = { ...sale, paidAt: NOW + 30 };
    await publishMemberRecord(keys, saleEvent(keys, paid));
    const later = { ...sale, paymentHash: "cd".repeat(32), createdAt: NOW + 100 };
    await publishMemberRecord(keys, saleEvent(keys, later));

    await expect(fetchSales(keys, NOW - 1)).resolves.toEqual([later, paid]);
    await expect(fetchSales(keys, NOW + 50)).resolves.toEqual([later]);
    const other = deriveMemberKeys(memberSecret(team, newMemberId()));
    await expect(fetchSales(other, 0)).resolves.toEqual([]);
    // Nothing of the sale shows on the relays: neither in the tags, nor in the content. Its base64
    // may hold a short text such as "CHF" by chance, never a quote: what was
    // encrypted would show there as a JSON string.
    const stored = relays.stored.get(TEAM_RELAYS[0]) ?? [];
    expect(stored).toHaveLength(2);
    for (const event of stored) {
      expect(event.content).toMatch(/^[A-Za-z0-9+/]+=*$/);
      for (const hidden of ["Table 4", sale.paymentHash, "46918", "CHF"]) {
        expect(JSON.stringify(event.tags)).not.toContain(hidden);
        expect(event.content).not.toContain(JSON.stringify(hidden));
      }
    }
  });

  it("are read as their authors, where relays give an author's events to that author only", async () => {
    const link = {
      version: 1 as const,
      link: "a1".repeat(32),
      saleKey: "b2".repeat(32),
      createdAt: NOW,
      onchainTag: "0f".repeat(8),
      relays: [...TEAM_RELAYS],
      sealedKey: SEALED_KEY
    };
    const device = { version: 1 as const, deviceId: "f".repeat(32), platform: "ios" as const };
    const profile = { version: 1 as const, avatar: null, updatedAt: NOW };
    await publishMemberRecord(keys, linkEvent(keys, link));
    await publishMemberRecord(keys, saleEvent(keys, sale));
    await publishMemberRecord(keys, deviceEvent(keys, { ...device, joinedAt: NOW }));
    await publishMemberRecord(keys, profileEvent(keys, profile));
    const second = deriveMemberKeys(memberSecret(team, newMemberId()));
    for (const relay of TEAM_RELAYS) relays.authorReads.add(relay);

    // The sales and the links, each of its own author; the devices and profiles of two members.
    await expect(fetchMemberRecords(keys, NOW)).resolves.toEqual({
      sales: [sale],
      links: [link],
      sightings: []
    });
    const members = [
      { id: MEMBER, keys },
      { id: "second", keys: second }
    ];
    expect((await fetchDevices(members))?.get(MEMBER)?.deviceId).toBe(device.deviceId);
    expect((await fetchProfiles(members))?.get(MEMBER)).toEqual(profile);
  });

  it("keep the links the member made, readable by the member's keys only", async () => {
    const link = {
      version: 1 as const,
      link: "a1".repeat(32),
      saleKey: "b2".repeat(32),
      createdAt: NOW,
      onchainTag: "0f".repeat(8),
      relays: [...TEAM_RELAYS],
      sealedKey: SEALED_KEY
    };
    await publishMemberRecord(keys, linkEvent(keys, link));
    await publishMemberRecord(keys, saleEvent(keys, sale));

    await expect(fetchLinks(keys, NOW)).resolves.toEqual([link]);
    await expect(fetchLinks(keys, NOW + 1)).resolves.toEqual([]);
    const other = deriveMemberKeys(memberSecret(team, newMemberId()));
    await expect(fetchLinks(other, 0)).resolves.toEqual([]);
    const visible = JSON.stringify(relays.stored.get(TEAM_RELAYS[0]));
    for (const hidden of [link.link, link.saleKey]) expect(visible).not.toContain(hidden);
    // A link's record moved to another link's address is ignored.
    const moved = sealRecord({
      type: "team-link",
      value: { ...link, link: "c3".repeat(32) },
      signer: keys.links.secretKey,
      encryptionKey: keys.records.encryptionKey,
      address: "0".repeat(64),
      createdAt: NOW
    });
    await publishMemberRecord(keys, moved);
    await expect(fetchLinks(keys, 0)).resolves.toEqual([link]);
    // A record naming no relays or no sealed key is not one.
    const { relays: _relays, ...unplaced } = { ...link, link: "d4".repeat(32) };
    const { sealedKey: _sealedKey, ...unsealed } = { ...link, link: "e5".repeat(32) };
    for (const record of [unplaced, unsealed]) {
      await publishMemberRecord(keys, linkEvent(keys, record as unknown as typeof link));
    }
    await expect(fetchLinks(keys, 0)).resolves.toEqual([link]);

    for (const relay of TEAM_RELAYS) relays.unreachable.add(relay);
    await expect(fetchLinks(keys, 0)).resolves.toBeNull();
  });

  it("read the records of a month past what a relay sends for one filter", async () => {
    const link = {
      version: 1 as const,
      link: "a1".repeat(32),
      saleKey: "b2".repeat(32),
      createdAt: NOW,
      onchainTag: "0f".repeat(8),
      relays: [...TEAM_RELAYS],
      sealedKey: SEALED_KEY
    };
    await publishMemberRecord(keys, linkEvent(keys, link));
    // More sales since than a relay sends for one filter, the newest first.
    const count = relays.MAX_EVENTS_PER_FILTER + 50;
    for (let n = 1; n <= count; n += 1) {
      const paymentHash = n.toString(16).padStart(64, "0");
      await publishMemberRecord(
        keys,
        saleEvent(keys, { ...sale, paymentHash, createdAt: NOW + n }),
        TEAM_RELAYS.slice(0, 1)
      );
    }
    await expect(fetchLinks(keys, 0, TEAM_RELAYS.slice(0, 1))).resolves.toEqual([link]);
    await expect(fetchSales(keys, 0, TEAM_RELAYS.slice(0, 1))).resolves.toHaveLength(count);
  });

  it("check the signature of the owner's links only, once per event", async () => {
    const link = {
      version: 1 as const,
      link: "a1".repeat(32),
      saleKey: "b2".repeat(32),
      createdAt: NOW,
      onchainTag: "0f".repeat(8),
      relays: [...TEAM_RELAYS],
      sealedKey: SEALED_KEY
    };
    await publishMemberRecord(keys, linkEvent(keys, link));
    for (let n = 1; n <= 30; n += 1) {
      const paymentHash = n.toString(16).padStart(64, "0");
      await publishMemberRecord(
        keys,
        saleEvent(keys, { ...sale, paymentHash, createdAt: NOW + n })
      );
    }
    // A month of an employee's records, on 7 relays: their signatures cost seconds on a phone.
    const checks = jest.spyOn(eventModule, "isValidEvent");
    await expect(fetchLinks(keys, 0)).resolves.toEqual([link]);
    expect(checks).toHaveBeenCalledTimes(1);
    checks.mockRestore();
  });

  it("ignore a sale moved to another sale's address", async () => {
    const moved = sealRecord({
      type: "team-sale",
      value: sale,
      signer: keys.nostr.secretKey,
      encryptionKey: keys.records.encryptionKey,
      address: "0".repeat(64),
      createdAt: NOW
    });
    await publishMemberRecord(keys, moved);
    await expect(fetchSales(keys, 0)).resolves.toEqual([]);
  });
});

describe("membership", () => {
  it("validates what the device stored", () => {
    const membership = {
      version: 1,
      team: team.publicKey,
      secret: bytesToHex(memberSecret(team, MEMBER)),
      name: "Alice",
      deviceId: "f".repeat(32),
      joinedAt: NOW
    };
    expect(parseMembership(membership)).toEqual(membership);
    expect(parseMembership({ ...membership, version: 2 })).toBeNull();
    expect(parseMembership({ ...membership, secret: "x" })).toBeNull();
    expect(parseMembership({ ...membership, name: "" })).toBeNull();
    expect(hexToBytes(membership.secret)).toHaveLength(32);
  });
});

describe("invitation links' relays", () => {
  it("names the business's relays, and refuses a link naming none", () => {
    const own = ["wss://relay.bakery.example"];
    const invite = createInvite({
      team,
      memberId: MEMBER,
      name: "Alice",
      invitedAt: NOW,
      origin: ORIGIN,
      relays: own
    });
    expect(linkOf(invite.url).relays).toEqual(own);
    // Without a third part, no link.
    const [withoutRelays] = invite.url.split(/\.(?=[^.]*$)/);
    expect(inviteLinkOf(withoutRelays!)).toBeNull();
    expect(parseInviteFragment(withoutRelays!.slice(withoutRelays!.indexOf("#")))).toBeNull();
    // A third part that is not a list makes no link.
    expect(inviteLinkOf(`${withoutRelays}.AAAA`)).toBeNull();
  });
});
