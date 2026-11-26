import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { Platform } from "react-native";

import { majority } from "@/config/registry";
import { MOVE_RECORDS_MARGIN_SECONDS } from "@/config/relays";
import { saveDeviceRelays } from "@/features/relays/device-relays";
import { loadBrandingOf, saveBranding } from "@/features/terminal/branding";
import { savePosOptions } from "@/features/terminal/options";
import { invoiceNetwork } from "@/features/terminal/invoice";
import { getTerminalProfile, publishTerminalProfile } from "@/features/terminal/profile-cache";
import {
  loadBusinessRegistry,
  registryOfChannel,
  saveBusinessRegistry
} from "@/features/terminal/registry-key";
import { saveCatalogKeys } from "@/features/terminal/catalog-key";
import { forgetAccountSales } from "@/features/terminal/sale-follow";
import { logFailure } from "@/lib/log/log";
import { copyImageTo, createImage, publishImageToMajority, type ImageRef } from "@/lib/media/image";
import type { NostrEvent } from "@/lib/nostr/event";
import { publishToRelays } from "@/lib/nostr/pool";
import { closeRelayConnections } from "@/lib/nostr/relay";
import { secureRandomBytes } from "@/lib/random";
import { nowUnix } from "@/lib/rates/snapshot";
import type { BusinessRegistry } from "@/lib/registry/registry";
import { currentRelays } from "@/lib/relays/current";
import { liveRelays } from "@/lib/relays/retired";
import { sameRelayList, unionRelays } from "@/lib/relays/list";
import { fetchChannel, watchChannel, type TeamChannel } from "@/lib/team/channel";
import {
  closedInviteEvent,
  fetchInvite,
  readInvite,
  type InviteLink,
  type OpenInvite
} from "@/lib/team/invite";
import {
  deriveMemberKeys,
  inviteId,
  memberTakerKey,
  ownerTakerKey,
  type MemberKeys
} from "@/lib/team/keys";
import { sealLinkKeyFor } from "@/lib/payment-link/sealed-key";
import {
  copyMemberDeclarations,
  copyMemberRecords,
  deviceEvent,
  publishMemberRecord,
  publishMemberRecordAgain,
  publishMemberRecordToMajority,
  publishSaleRecord,
  linkEvent,
  profileEvent,
  saleEvent,
  type MemberDevice,
  type SaleRecordValue
} from "@/lib/team/member-records";
import { MEMBERSHIP_VERSION, type Membership } from "@/lib/team/membership";
import { clearMembership, loadMembership, saveMembership } from "@/lib/team/membership-store";
import { TEAM_TIMEOUT_MS, sameTeamProfile } from "@/lib/team/shared";
import {
  MEMBER_PROFILE_VERSION,
  isMemberProfile,
  type AccountProfile,
  type MemberTerminalProfile,
  type TerminalProfile
} from "@/lib/terminal/model";
import { clearTerminalProfile, saveTerminalProfile } from "@/lib/terminal/profile";

import { forgetMemberLot, lotTag, syncMemberLot } from "./member-addresses";
import { deviceEpochSettled, holdMemberEpochs, releaseMemberEpochs } from "./export-epochs";
import { ownerDeviceKeys, ownerDevicesShared } from "./owner-device";

/*
 * The employee's side of the team: joining with an invitation, following
 * the team's channel and its lot of on-chain addresses, and publishing the sales taken. The device never holds the wallet: it takes
 * payments with the business's Lightning address, like the owner's devices in till mode.
 */

export type JoinFailure =
  /** Not an invitation link. */
  | "invalid"
  /** No relay holds it: a wrong link, or one expired long ago. */
  | "notFound"
  /** Already used, or withdrawn by the owner. */
  | "closed"
  | "expired"
  /** Written by a newer version of the app: this one must be updated. */
  | "newer"
  /** No relay answered. */
  | "unreachable"
  /** The owner removed this employee before it joined. */
  | "removed"
  /** This device already takes payments for an account or a team. */
  | "alreadySetUp";

export class JoinError extends Error {
  readonly code: JoinFailure;

  constructor(code: JoinFailure, message: string) {
    super(message);
    this.name = "JoinError";
    this.code = code;
  }
}

/** An invitation read and checked, before the device joins. */
export type InvitePreview = {
  link: InviteLink;
  invite: OpenInvite;
  channel: Extract<TeamChannel, { status: "active" }>;
};

/**
 * Until the device joined, its calls as the invitation's and the member's keys go over connections
 * of their own (relay.ts, "single"): a join that fails, then another business's invitation, would
 * otherwise authenticate the keys of both on one connection, and a relay could tie the device to
 * both businesses.
 */
const JOINING = "single";

/**
 * This device's last use of an invitation that failed once published (joinTeam: no majority of the
 * relays took its closed invitation, or none could tell which device they keep), in memory only:
 * the relays that took it hold it, and tell the next reader the invitation was used. Tried again
 * (the link opened again), the device uses it again with the same closed invitation, the same
 * event: a new one would get another id, and relays that hold one of them could keep another
 * device's. Forgotten when the app stops: the owner then invites the employee again.
 */
type FailedJoin = { linkId: string; invite: OpenInvite; deviceId: string; event: NostrEvent };
let failedJoin: FailedJoin | null = null;

/** The failed use of `link` this device can try again (failedJoin), if any. */
function failedJoinOf(link: InviteLink): FailedJoin | null {
  return failedJoin?.linkId === bytesToHex(link.id) ? failedJoin : null;
}

/**
 * Reads the invitation of `link` and the channel it leads to, without using it: the screen shows
 * the business and the name before the employee confirms. An invitation this device used but
 * could not finish joining with (failedJoin) shows again. Rejects with a JoinError.
 */
export async function previewInvite(link: InviteLink): Promise<InvitePreview> {
  if (await getTerminalProfile()) {
    throw new JoinError("alreadySetUp", "This device already takes payments");
  }
  const lookup = await fetchInvite(link, nowUnix(), { channel: JOINING });
  const failed = failedJoinOf(link);
  let invite: OpenInvite;
  if (lookup.status === "open") invite = lookup.invite;
  else if (lookup.status === "closed" && failed && lookup.device === failed.deviceId) {
    invite = failed.invite;
  } else throw new JoinError(lookup.status, `Invitation ${lookup.status}`);
  const keys = deriveMemberKeys(invite.secret);
  const found = await fetchChannel(
    invite.team,
    keys,
    TEAM_TIMEOUT_MS.waiting,
    link.relays ?? currentRelays(),
    JOINING
  );
  switch (found.status) {
    case "found":
      if (found.channel.status === "removed") {
        throw new JoinError("removed", "Removed from the team");
      }
      return { link, invite, channel: found.channel };
    case "deleted":
      throw new JoinError("removed", "The business deleted its account");
    case "newer":
    case "notFound":
    case "unreachable":
      throw new JoinError(found.status, `Channel ${found.status}`);
  }
}

/**
 * Two devices that read one invitation open within the same seconds both close it in their name,
 * and each joins once the relays it reads back hold its own (the other's not there yet); the relays
 * then keep one of them, the same everywhere (invite.ts). A device reads it once more this long
 * after joining, past the time the other takes to publish its own (TEAM_TIMEOUT_MS.waiting), rather
 * than only at the next launch or return to the foreground: the one the relays did not keep leaves
 * (syncMembership).
 */
export const JOIN_RECHECK_MS = 20_000;
let joinRecheck: ReturnType<typeof setTimeout> | null = null;

/**
 * Joins the team of `preview`: the invitation is read again and closed in this device's name (no
 * other device can use it once a relay took the closed one), read again to check that this device
 * is the one the relays keep (two devices using it at once write the same date, every relay keeps
 * the same one of them), then the membership, the business's registry key and the point of sale's
 * profile are saved, and the device tells the owner it joined; it checks again JOIN_RECHECK_MS
 * later. Only once a majority of the invitation's relays took the closed invitation: a relay that
 * missed it still gives the member's secret to whoever holds the link,
 * and tells another device the invitation is open; the device's syncs give it to those that missed
 * it (syncChannel). Rejects with a JoinError: "closed" when another device used it first,
 * "unreachable" when no majority of the relays took the closed invitation or none could tell which
 * device the relays keep. Nothing is saved then; tried again, the device uses its closed
 * invitation again (failedJoin).
 */
export async function joinTeam({
  link,
  invite,
  channel
}: InvitePreview): Promise<MemberTerminalProfile> {
  if (await getTerminalProfile()) {
    throw new JoinError("alreadySetUp", "This device already takes payments");
  }
  // Read again: another device may have used it since the preview, or it may have ended; or this
  // device used it already, without a majority of the relays taking it (failedJoin).
  const before = await fetchInvite(link, nowUnix(), { channel: JOINING });
  const keys = deriveMemberKeys(invite.secret);
  const failed = failedJoinOf(link);
  let attempt: FailedJoin;
  if (
    failed &&
    ((before.status === "closed" && before.device === failed.deviceId) ||
      (before.status === "open" && failed.event.created_at === before.invite.openedAt + 1))
  ) {
    attempt = failed;
  } else if (before.status !== "open") {
    throw new JoinError(before.status, `Invitation ${before.status}`);
  } else {
    const deviceId = bytesToHex(secureRandomBytes(16));
    attempt = {
      linkId: bytesToHex(link.id),
      invite,
      deviceId,
      event: closedInviteEvent(keys, {
        team: invite.team,
        expiresAt: invite.expiresAt,
        openedAt: before.invite.openedAt,
        closedAt: nowUnix(),
        device: deviceId
      })
    };
  }
  const { deviceId, event: closed } = attempt;
  const joinedAt = nowUnix();
  // The invitation's relays: the business's when it was made, where its open record is; and those
  // its channel names, where the device reads it from now on (a change of relays since).
  const inviteRelays = link.relays ?? currentRelays();
  const took = await publishToRelays(
    closed,
    {
      relays: unionRelays(inviteRelays, channel.relays),
      timeoutMs: TEAM_TIMEOUT_MS.waiting,
      channel: JOINING,
      authKey: keys.invite.nostr.secretKey
    },
    // A majority of the invitation's relays decides; its channel's relays take it in the background.
    { quorum: { lists: [inviteRelays] } }
  );
  // The device the relays keep is the member: refused (another device's closed invitation, older
  // or of a lower id), or not taken at all, this one is not. Only a device that holds the member's
  // secret can be named (deviceProof).
  const after = await fetchInvite(link, nowUnix(), { member: keys, channel: JOINING });
  if (after.status === "closed" && after.device !== deviceId) {
    failedJoin = null;
    throw new JoinError("closed", "Another device used the invitation");
  }
  if (
    after.status !== "closed" ||
    took.filter((relay) => inviteRelays.includes(relay)).length < majority(inviteRelays.length)
  ) {
    failedJoin = attempt;
    throw new JoinError("unreachable", "No majority of the relays took the closed invitation");
  }
  failedJoin = null;

  const membership: Membership = {
    version: MEMBERSHIP_VERSION,
    team: invite.team,
    secret: bytesToHex(invite.secret),
    name: channel.name,
    deviceId,
    joinedAt
  };
  const { onchain, logo, ...details } = channel.profile;
  const profile: MemberTerminalProfile = {
    version: MEMBER_PROFILE_VERSION,
    team: invite.team,
    memberName: channel.name,
    ...details
  };
  // The business's relays become the device's: its channel, its sales, its links go there.
  await saveDeviceRelays(channel.relays);
  await saveMembership(membership);
  // What the business's sales are declared with (src/lib/registry/), whether they offer an
  // on-chain address and with which tolerance: before the profile, which makes the device take
  // payments.
  await saveBusinessRegistry(invite.team, registryOfChannel(channel));
  // The account's export epoch (export-epochs.ts): its records and declarations sealed at it.
  holdMemberEpochs(keys.records.encryptionKey, channel.registryReader, channel.exportEpoch ?? null);
  // The catalogue's reading keys: its articles at the point of sale from the start.
  await saveCatalogKeys(invite.team, channel.catalog ?? null);
  await savePosOptions(invite.team, {
    onchain,
    onchainTolerance: channel.onchainTolerance ?? 0,
    bitcoinNode: channel.bitcoinNode ?? null
  });
  await saveBranding(invite.team, { logo, avatar: null });
  await saveTerminalProfile(profile);
  current = Promise.resolve(membership);
  removalNotice = null;
  publishDevice(membership, keys);
  // The lot the owner may already have given this member: on-chain addresses from the first sale.
  void syncMemberLot(invite.team, keys);
  publishTerminalProfile(profile);
  if (joinRecheck !== null) clearTimeout(joinRecheck);
  joinRecheck = setTimeout(() => {
    joinRecheck = null;
    void syncMembership();
  }, JOIN_RECHECK_MS);
  return profile;
}

/** This device's membership, read once, then from memory. */
let current: Promise<Membership | null> | null = null;

function getMembership(): Promise<Membership | null> {
  current ??= loadMembership();
  return current;
}

/**
 * This employee's record keys (its sales and payment links, member-records.ts), for reading them
 * back; null on a device that is not an employee's.
 */
export async function getMemberKeys(): Promise<MemberKeys | null> {
  const membership = await getMembership();
  return membership ? deriveMemberKeys(hexToBytes(membership.secret)) : null;
}

/** Tests only: forgets what was read. */
export function resetMembershipCache(): void {
  if (joinRecheck !== null) clearTimeout(joinRecheck);
  joinRecheck = null;
  current = null;
  failedJoin = null;
  devicePublished = false;
  profileAt = 0;
  deviceRecordAt = 0;
  removalNotice = null;
  lastSync = Promise.resolve();
  emptyLotReadAt = null;
}

/** The `updatedAt` of the profile published last by this launch: the next one is later. */
let profileAt = 0;

/**
 * What this member shows of the business and of itself, written one change at a time: the
 * branding (the business's logo and its photo) and its profile. A channel's sync and a photo picked
 * meanwhile each read it, then write it: run together, the later write put back what the other
 * replaced (an Android device syncs when the photo library hands the app back). A photo being saved
 * waits for a sync's write: its screen shows the loader meanwhile.
 */
let brandingWrites: Promise<unknown> = Promise.resolve();

function withOwnBranding<T>(task: () => Promise<T>): Promise<T> {
  const run = brandingWrites.then(task);
  brandingWrites = run.catch(() => undefined);
  return run;
}

/** This member's photo on this device (src/features/terminal/branding.ts), null for none. */
async function loadOwnAvatar(team: string): Promise<ImageRef | null> {
  return (await loadBrandingOf(team))?.avatar ?? null;
}

/** Publishes the member's profile (its photo) to `relays`. Resolves with those that took it. */
function publishProfile(
  keys: MemberKeys,
  avatar: ImageRef | null,
  relays: readonly string[] = currentRelays()
): Promise<string[]> {
  return publishMemberRecord(keys, nextProfile(keys, avatar), relays);
}

/** The member's profile naming `avatar`, dated after the one this launch published last. */
function nextProfile(keys: MemberKeys, avatar: ImageRef | null): NostrEvent {
  profileAt = Math.max(nowUnix(), profileAt + 1);
  return profileEvent(keys, { version: 1, avatar, updatedAt: profileAt });
}

/**
 * Gives `relays` this member's photo and profile, the photo read there or on `from` (the device's
 * relays before a change of list). Never rejects.
 */
async function copyOwnAvatar(
  team: string,
  relays: readonly string[],
  from: readonly string[] = []
): Promise<void> {
  try {
    const membership = await getMembership();
    if (!membership || membership.team !== team) return;
    // The photo of now, published after any change of it (withOwnBranding).
    await withOwnBranding(async () => {
      const avatar = await loadOwnAvatar(team);
      if (avatar) await copyImageTo(avatar, relays, from);
      const took = await publishProfile(
        deriveMemberKeys(hexToBytes(membership.secret)),
        avatar,
        relays
      );
      // Fewer than a majority: given again at the next sync, with the device (devicePublished).
      if (took.length < majority(relays.length)) devicePublished = false;
    });
  } catch (error) {
    logFailure("Publishing the member's profile failed", error);
  }
}

export type AvatarErrorCode =
  /** Not an employee's device. */
  | "notMember"
  /** No relay took the photo: the owner could not see it. */
  | "unreachable"
  /** No relay took the profile naming it: the change is cancelled, the photo before kept. */
  | "unpublished";

export class AvatarError extends Error {
  readonly code: AvatarErrorCode;

  constructor(code: AvatarErrorCode, message: string) {
    super(message);
    this.name = "AvatarError";
    this.code = code;
  }
}

/**
 * Sets this employee's photo (a JPEG of MAX_AVATAR_BYTES at most, src/features/media/pick-image.ts),
 * or removes it (null): the image goes to the relays (one at least must take it, else
 * AvatarError "unreachable" and nothing changes), then the device keeps its reference and the
 * member's profile names it, for the owner ("Employees"). Resolves once a relay took the profile
 * (the others go on in the background: "Settings" says the photo is saved then); when none did,
 * the photo before is back on the device (AvatarError
 * "unpublished"), and its profile goes out again at the next launch (syncMembership), dated after
 * one a relay may have taken late.
 */
export async function setOwnAvatar(bytes: Uint8Array | null): Promise<ImageRef | null> {
  const membership = await getMembership();
  if (!membership) throw new AvatarError("notMember", "Not an employee's device");
  const keys = deriveMemberKeys(hexToBytes(membership.secret));
  let avatar: ImageRef | null = null;
  if (bytes) {
    const image = createImage(bytes, nowUnix());
    try {
      await publishImageToMajority(image.event, image.ref, currentRelays());
    } catch {
      throw new AvatarError("unreachable", "No majority of the relays took the photo");
    }
    avatar = image.ref;
  }
  // After a sync's write of the branding (withOwnBranding), with the logo it saved.
  const published = await withOwnBranding(async () => {
    const saved = await loadBrandingOf(membership.team);
    const logo = saved?.logo ?? null;
    await saveBranding(membership.team, { logo, avatar });
    try {
      await publishMemberRecordToMajority(keys, nextProfile(keys, avatar));
      return true;
    } catch (error) {
      logFailure("No majority of the relays took the member's profile", error);
      // Within the lock, nothing else wrote the branding meanwhile.
      await saveBranding(membership.team, { logo, avatar: saved?.avatar ?? null });
      return false;
    }
  });
  if (!published) {
    throw new AvatarError("unpublished", "No relay took the profile: the photo is cancelled");
  }
  return avatar;
}

/** The device record, published again once per launch: relays that lost it get it back. */
let devicePublished = false;

function devicePlatform(): MemberDevice["platform"] {
  return Platform.OS === "ios" || Platform.OS === "android" ? Platform.OS : "web";
}

function publishDevice(membership: Membership, keys: MemberKeys): void {
  devicePublished = true;
  const event = deviceEvent(keys, {
    version: 1,
    deviceId: membership.deviceId,
    platform: devicePlatform(),
    joinedAt: membership.joinedAt
  });
  const relays = currentRelays();
  // Again: the relays hold it from an earlier launch, or a newer one (an arrival after a departure
  // taken back, publishDeparture).
  publishMemberRecordAgain(keys, event, relays)
    .then((took) => {
      // Fewer than a majority: the owner's read may miss it. Published again at the next sync.
      if (took.length < majority(relays.length)) devicePublished = false;
    })
    .catch((error: unknown) => {
      devicePublished = false;
      logFailure("Publishing the device failed", error);
    });
}

export type LeaveErrorCode =
  /** No majority of the relays took the departure: the owner might not know. */
  "unreachable";

export class LeaveError extends Error {
  readonly code: LeaveErrorCode;

  constructor(code: LeaveErrorCode, message: string) {
    super(message);
    this.name = "LeaveError";
    this.code = code;
  }
}

/**
 * Tells the owner that this employee leaves the business ("Leave the business"), before the
 * device forgets it (leaveTeam): its device record again, with the date it
 * leaves (`leftAt`, dated so: relays keep it instead of the one of its arrival), on the business's
 * relays, a majority of them as a removal (the owner's read, from the relays
 * that answer it, then meets it). "Employees" then lists the employee as gone, and the owner fills
 * its lot of on-chain addresses no more. Rejects with LeaveError "unreachable" when no majority
 * took it: the device stays in the team, the employee tries again. Nothing on a device without a
 * membership.
 */
async function publishDeparture(): Promise<void> {
  const membership = await getMembership();
  if (!membership) return;
  const keys = deriveMemberKeys(hexToBytes(membership.secret));
  const device = {
    version: 1,
    deviceId: membership.deviceId,
    platform: devicePlatform(),
    joinedAt: membership.joinedAt
  } as const;
  // After the arrival, and after a departure taken back by this launch (below).
  const leftAt = Math.max(nowUnix(), membership.joinedAt + 1, deviceRecordAt + 1);
  deviceRecordAt = leftAt;
  const relays = currentRelays();
  const took = await publishMemberRecord(keys, deviceEvent(keys, { ...device, leftAt }), relays);
  if (took.length < majority(relays.length)) {
    // The relays that took it would show the employee as gone, and the owner would fill its lot no
    // more, while the device stays: its arrival again, dated after the departure, replaces it there.
    // To every relay: the call returned once no majority could take the departure, before a slower
    // relay may take it still (in the background); the arrival, dated later, changes nothing where
    // the departure never went.
    deviceRecordAt = leftAt + 1;
    await publishMemberRecord(keys, deviceEvent(keys, device, deviceRecordAt), relays).catch(
      (error: unknown) => {
        logFailure("Taking the departure back failed", error);
      }
    );
    throw new LeaveError("unreachable", "No majority of the relays took the departure");
  }
}

/** The date of the device record this launch published last by publishDeparture. */
let deviceRecordAt = 0;

/**
 * A departure under way (departTeam): a sync of the channel would write the business's registry,
 * options, branding and lot again, past leaveTeam, while the departure waits for the relays.
 */
let departure: Promise<void> | null = null;

/**
 * The channel's syncs under way (syncMembership), and the lot's reads (readEmptyLot): a departure
 * waits for them first.
 */
const syncs = new Set<Promise<unknown>>();
/** The last of them, which the next one waits for (inSyncQueue). */
let lastSync: Promise<unknown> = Promise.resolve();

/**
 * Runs `task` after the channel's syncs under way, as one of them: the next one waits for it, a
 * departure too. `task` must never reject: the queue would stop on it.
 */
function inSyncQueue<T>(task: () => Promise<T>): Promise<T> {
  const run = lastSync.then(task);
  lastSync = run;
  syncs.add(run);
  void run.finally(() => syncs.delete(run));
  return run;
}

/**
 * "Leave the business": publishDeparture, then leaveTeam, once the channel's syncs under way
 * ended and with no new one (syncMembership) meanwhile. Rejects as they do. A second call while one
 * runs shares it.
 */
export function departTeam(): Promise<void> {
  departure ??= (async () => {
    try {
      // A sync past its checks would write the business again (its profile too) past leaveTeam.
      await Promise.all(syncs);
      await publishDeparture();
      await leaveTeam();
    } finally {
      departure = null;
    }
  })();
  return departure;
}

/**
 * The business a removal took this device away from, for the welcome screen to say so (until the
 * app restarts or the device joins again). Null when none.
 */
let removalNotice: string | null = null;

export function getRemovalNotice(): string | null {
  return removalNotice;
}

export type MembershipSync =
  /** The channel was read: the profile follows it. */
  | "active"
  /** The owner removed this employee: the device forgot the business. */
  | "removed"
  /** No relay answered, or none holds the channel: nothing changes. */
  | "unchanged"
  /** Not an employee's device. */
  | "none";

/**
 * Reads this employee's channel (at launch, when the app comes back to the foreground and every
 * MEMBERSHIP_CHECK_INTERVAL_MS, useTeamSync.ts): a new name, currency or address of the business
 * goes to the point of sale's profile, its choice of on-chain payments to the point of sale's
 * options (src/features/terminal/options.ts), its logo to the point of sale's branding, its relays
 * to the device's list; a removal makes the device forget the business (back to the welcome
 * screen). Only the channel's "removed" does, or the team's deletion of the channel (the owner
 * deleted the account: fetchChannel's "deleted"): a channel no relay holds changes nothing. A photo
 * saved meanwhile waits for its write of the branding (withOwnBranding). Never rejects.
 */
export function syncMembership(): Promise<MembershipSync> {
  if (departure) return Promise.resolve("unchanged");
  // One after the other: a sync that read the channel still active, then wrote the business, would
  // write it again past the leaveTeam of a later one that read the removal (watchMembership starts
  // one at any time). syncChannel never rejects.
  return inSyncQueue(syncChannel);
}

/**
 * How often, at most, an employee's device reads its lot of on-chain addresses again while its
 * sales find none left (readEmptyLot).
 */
export const EMPTY_LOT_READ_MS = 30_000;

/** When the lot was last read again this way (Date.now() ms), null for never. */
let emptyLotReadAt: number | null = null;

/**
 * A sale found no on-chain address left in the lot of `team` (onchain-pool.ts): the lot is read
 * again in the background, at most once every EMPTY_LOT_READ_MS, for the next sale, rather than at
 * the next read of the channel only (MEMBERSHIP_CHECK_INTERVAL_MS, useTeamSync.ts). The owner fills
 * a new employee's lot once it is invited (owner-addresses.ts), which may end after the device
 * joined. After the channel's syncs under way, as one of them: never past a
 * departure. Nothing on a device that is not the employee's of `team`. Resolves once read (at
 * once when it is not read again); never rejects.
 */
export function readEmptyLot(team: string): Promise<void> {
  if (departure) return Promise.resolve();
  const now = Date.now();
  // A clock set back meanwhile (the device's settings) does not hold the next read back for as long.
  const since = emptyLotReadAt === null ? null : now - emptyLotReadAt;
  if (since !== null && since >= 0 && since < EMPTY_LOT_READ_MS) return Promise.resolve();
  emptyLotReadAt = now;
  // Never rejects, as syncChannel: the next sync waits for it (syncMembership).
  return inSyncQueue(async () => {
    try {
      const membership = await getMembership();
      if (departure || !membership || membership.team !== team) return;
      await syncMemberLot(team, deriveMemberKeys(hexToBytes(membership.secret)));
    } catch (error) {
      logFailure("Reading the lot of on-chain addresses failed", error);
    }
  });
}

/**
 * Keeps a subscription open to this employee's channel (watchChannel: while
 * an invoice shows, useMembershipWatch): a removal published by the owner reaches the device as
 * soon as a relay takes it, and syncMembership then makes the device forget the business (its
 * invoice no longer shows), instead of at its next read (MEMBERSHIP_CHECK_INTERVAL_MS). Only a
 * removal does: the other changes of the channel wait for that read. Until the returned function
 * is called; nothing on a device that is not an employee's.
 */
export function watchMembership(): () => void {
  let stopped = false;
  let stop: (() => void) | null = null;
  let syncing = false;
  void (async () => {
    const [membership, profile] = await Promise.all([getMembership(), getTerminalProfile()]);
    if (stopped || !membership || !profile || !isMemberProfile(profile)) return;
    if (profile.team !== membership.team) return;
    const keys = deriveMemberKeys(hexToBytes(membership.secret));
    stop = watchChannel(membership.team, keys, (channel) => {
      if (channel.status !== "removed" || syncing) return;
      syncing = true;
      void syncMembership().finally(() => {
        syncing = false;
      });
    });
  })().catch((error: unknown) => {
    logFailure("Watching the team membership failed", error);
  });
  return () => {
    stopped = true;
    stop?.();
  };
}

async function syncChannel(): Promise<MembershipSync> {
  try {
    const [membership, profile] = await Promise.all([getMembership(), getTerminalProfile()]);
    if (!membership || !profile || !isMemberProfile(profile) || profile.team !== membership.team) {
      return "none";
    }
    const keys = deriveMemberKeys(hexToBytes(membership.secret));
    if (!devicePublished) {
      publishDevice(membership, keys);
      // Its photo and profile once per launch too: relays that lost them get them back.
      void copyOwnAvatar(membership.team, currentRelays());
    }
    const [found, { lookup: invitation, closed }] = await Promise.all([
      // On the device's relays but those sattle.me retired (retired.ts): the owner moves the
      // business away from them reading and writing on the others only.
      fetchChannel(membership.team, keys, TEAM_TIMEOUT_MS.background, liveRelays(currentRelays())),
      // While the relays keep it (until it ends): which device used it, as a holder of the
      // member's secret proved it (deviceProof). Whoever holds the link alone names no device.
      readInvite(
        {
          id: inviteId(keys.invite.nostr.publicKey, membership.team),
          key: keys.invite.encryptionKey
        },
        nowUnix(),
        { member: keys }
      )
    ]);
    // Leaving meanwhile (departTeam): nothing of the business written again past leaveTeam.
    if (departure) return "unchanged";
    // Another device used the invitation at the same time, and the relays kept its closed one: that
    // device is the member, this one leaves (it would share its lot of on-chain addresses).
    const otherDevice =
      invitation.status === "closed" &&
      invitation.device !== null &&
      invitation.device !== membership.deviceId;
    // The business deleted its account ("Delete account"): as a removal.
    if (
      (found.status === "found" && found.channel.status === "removed") ||
      found.status === "deleted" ||
      otherDevice
    ) {
      removalNotice = profile.businessName;
      await leaveTeam();
      return "removed";
    }
    // This device's closed invitation, as signed, to the relays that answered without it (a
    // majority took it when the device joined, joinTeam): until it ends, they would give the
    // member's secret to whoever holds the link. On the business's relays, where the device reads
    // it (those of the link, when the business changed its relays since, are not known here).
    if (
      invitation.status === "closed" &&
      invitation.device === membership.deviceId &&
      closed &&
      closed.behind.length > 0 &&
      closed.expiresAt > nowUnix()
    ) {
      await publishToRelays(
        closed.event,
        {
          relays: closed.behind,
          channel: "account",
          timeoutMs: TEAM_TIMEOUT_MS.background,
          authKey: keys.invite.nostr.secretKey
        },
        { quorum: "majority" }
      );
    }
    if (found.status !== "found" || found.channel.status === "removed") return "unchanged";
    const { channel } = found;
    // The account's export epoch (export-epochs.ts), first: every record this device writes from
    // now on (its device's below) and its sales' declarations are sealed at it.
    holdMemberEpochs(
      keys.records.encryptionKey,
      channel.registryReader,
      channel.exportEpoch ?? null
    );
    // The business changed its relays: the device's list follows, and what
    // the owner reads of it goes there too: its device, its photo and profile, the addresses it
    // used (syncMemberLot below), and its sales and links since the change, with the declarations
    // of its sales in the registry.
    const next = channel.relays;
    const moved = !sameRelayList(next, currentRelays());
    if (moved) {
      const before = [...liveRelays(currentRelays())];
      await saveDeviceRelays(next);
      publishDevice(membership, keys);
      await copyOwnAvatar(membership.team, next, before);
      const since = channel.updatedAt - MOVE_RECORDS_MARGIN_SECONDS;
      void copyMemberRecords(keys, since, before, next);
      // And the declarations of its sales there, which "Wallet" reads on the new list.
      void copyMemberDeclarations(
        keys,
        registryOfChannel(channel).key,
        invoiceNetwork(),
        since,
        before,
        next
      );
    }
    // The business's registry key: what its sales are declared with.
    await saveBusinessRegistry(membership.team, registryOfChannel(channel));
    // The catalogue's reading keys: its articles at the point of sale (none from an older owner's
    // app).
    await saveCatalogKeys(membership.team, channel.catalog ?? null);
    // Whether its invoices offer an on-chain address ("On-chain payments" of the owner), the
    // tolerance of on-chain underpayments its new sales hold, and the
    // merchant's own Bitcoin node.
    const { onchain, logo, ...details } = channel.profile;
    await savePosOptions(membership.team, {
      onchain,
      onchainTolerance: channel.onchainTolerance ?? 0,
      bitcoinNode: channel.bitcoinNode ?? null
    });
    // The business's logo, with the photo of now (a photo being saved waits: withOwnBranding).
    await withOwnBranding(async () =>
      saveBranding(membership.team, { logo, avatar: await loadOwnAvatar(membership.team) })
    );
    // Its lot of on-chain addresses, given by the owner (member-addresses.ts).
    await syncMemberLot(membership.team, keys, { publish: moved });
    if (
      !sameTeamProfile({ ...profile, onchain, logo }, channel.profile) ||
      profile.memberName !== channel.name
    ) {
      const next: MemberTerminalProfile = {
        ...profile,
        memberName: channel.name,
        ...details
      };
      await saveTerminalProfile(next);
      publishTerminalProfile(next);
    }
    return "active";
  } catch (error) {
    logFailure("Syncing the team membership failed", error);
    return "unchanged";
  }
}

/**
 * Forgets the team on this device: the catalogue's keys, membership, lot of on-chain addresses and
 * point of sale.
 */
export async function leaveTeam(): Promise<void> {
  // The catalogue's reading keys go first: the device keeps nothing of the
  // business's articles.
  const membership = await getMembership();
  if (membership) await saveCatalogKeys(membership.team, null);
  // Nor its keys of the account's export epochs.
  releaseMemberEpochs();
  // Its sales kept for their verdict: nothing signs them any more on this device.
  if (membership) await forgetAccountSales(membership.team.toLowerCase());
  await clearMembership();
  await forgetMemberLot();
  await clearTerminalProfile();
  current = Promise.resolve(null);
  publishTerminalProfile(null);
  // Authenticated as the member's keys: no later call of this device goes over them.
  closeRelayConnections();
}

/**
 * How long the point of sale waits for the account's export epoch before a sale's declarations, on
 * one of the owner's devices (takerKeyOf): what it knew is used past it, the read going on.
 */
const FIRST_EPOCH_READ_MS = 3_000;

/**
 * Holds the export epochs of `profile`'s account on one of the owner's devices (export-epochs.ts):
 * this device's own records' families `writes`, and the registry it declares in (its reading key
 * as saved here). Resolves once the epoch was read, or could not be within `timeoutMs`. Never
 * rejects.
 */
async function settleDeviceEpoch(
  profile: AccountProfile,
  writes: readonly Uint8Array[],
  timeoutMs?: number
): Promise<void> {
  try {
    const shared = await ownerDevicesShared(profile.walletId);
    if (!shared) return;
    const registry = await loadBusinessRegistry(profile).catch(() => null);
    await deviceEpochSettled(profile.walletId, shared, writes, registry?.reader ?? null, timeoutMs);
  } catch (error) {
    logFailure("Reading the account's export epoch failed", error);
  }
}

/**
 * The keys this device signs its sales and links with, for `profile`'s account: an employee's (its
 * membership), with the team whose lot gave its addresses; one of the owner's devices' once the
 * account opened on it (owner-device.ts), whose addresses come from the wallet itself. Null for
 * none.
 */
export async function recordSigner(
  profile: TerminalProfile
): Promise<{ keys: MemberKeys; team: string | null } | null> {
  if (!isMemberProfile(profile)) {
    const keys = await ownerDeviceKeys(profile.walletId);
    if (!keys) return null;
    // Sealed at the account's export epoch (export-epochs.ts), read from its relays first.
    await settleDeviceEpoch(profile, [keys.records.encryptionKey]);
    return { keys, team: null };
  }
  const membership = await getMembership();
  if (!membership || membership.team !== profile.team) return null;
  return { keys: deriveMemberKeys(hexToBytes(membership.secret)), team: membership.team };
}

/**
 * The key this device marks its sales' declarations with (takerTag of src/lib/registry/), for
 * `profile`'s account: an employee's (its membership), or the one the owner's
 * devices share once the account opened on this one (owner-device.ts). Null for none: the
 * declarations then do not say who took the sale.
 */
export async function takerKeyOf(profile: TerminalProfile): Promise<Uint8Array | null> {
  if (!isMemberProfile(profile)) {
    const shared = await ownerDevicesShared(profile.walletId);
    if (!shared) return null;
    // The sale's declarations are sealed at the account's export epoch (registry.ts, sealInside):
    // read first, briefly when it was never read here (the point of sale waits for it).
    await settleDeviceEpoch(profile, [], FIRST_EPOCH_READ_MS);
    return ownerTakerKey(shared);
  }
  const membership = await getMembership();
  if (!membership || membership.team !== profile.team) return null;
  return memberTakerKey(hexToBytes(membership.secret));
}

/** The owner's tag of an employee's on-chain address (member-addresses.ts); null otherwise. */
async function tagOf(team: string | null, address: string | null): Promise<string | null> {
  return team === null || address === null ? null : lotTag(team, address);
}

/**
 * Publishes a sale of this device's (an invoice shown, then seen paid), in the background: an
 * employee's, with the owner's tag of its on-chain address, or one of the owner's devices' (the
 * owner sees from any of its devices whether a sale is not final yet). Does
 * nothing without the keys to sign it (recordSigner).
 */
export function recordSale(profile: TerminalProfile, sale: SaleRecordValue): void {
  void recordSigner(profile)
    .then(async (signer) => {
      if (!signer) return;
      const { keys, team } = signer;
      const onchainTag = await tagOf(team, sale.onchainAddress);
      await publishUntilHeld(profile, keys, saleEvent(keys, { version: 1, ...sale, onchainTag }));
    })
    .catch((error: unknown) => {
      logFailure("Publishing the sale failed", error);
    });
}

/**
 * Waits before each new try of a record of this device's that fewer than a majority took
 * (publishUntilHeld): the owner reads them from a majority (unsettled.ts, owner-finals.ts).
 */
const RECORD_RETRY_MS = [30_000, 2 * 60_000, 10 * 60_000] as const;

/**
 * Publishes `event`, a record of this device's for `profile`'s account, until a majority of the
 * device's relays took it: tried again after each of RECORD_RETRY_MS, while this device still
 * signs that account's records with the same keys (recordSigner); then logged, the next record
 * of this device's sales or links being published as well. Never rejects.
 */
async function publishUntilHeld(
  profile: TerminalProfile,
  keys: MemberKeys,
  event: NostrEvent
): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    const relays = currentRelays();
    // A relay that holds it (an earlier try), or its verdict since (a newer record), has it.
    const took = await publishMemberRecordAgain(keys, event, relays).catch(() => []);
    if (took.length >= majority(relays.length)) return;
    if (attempt >= RECORD_RETRY_MS.length) {
      logFailure("No majority of the relays took a record of this device's sales");
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, RECORD_RETRY_MS[attempt]));
    const signer = await recordSigner(profile);
    // Left its team, or another account's device now: nothing of the former is published again.
    if (signer?.keys.nostr.publicKey !== keys.nostr.publicKey) return;
  }
}

/**
 * Publishes the verdict of a sale of this device's (its record once paid, or underpaid past its
 * end: src/features/terminal/sale-follow.ts), as recordSale, but to a majority of the relays:
 * "published" once a majority took it, "unsigned" when this device has no keys to sign it (nothing
 * of its sales is recorded). Rejects otherwise: tried again.
 */
export async function recordSaleVerdict(
  profile: TerminalProfile,
  sale: SaleRecordValue
): Promise<"published" | "unsigned"> {
  const signer = await recordSigner(profile);
  if (!signer) return "unsigned";
  const { keys, team } = signer;
  const onchainTag = await tagOf(team, sale.onchainAddress);
  await publishSaleRecord(keys, { version: 1, ...sale, onchainTag });
  return "published";
}

/**
 * Publishes a payment link this device made (its author, the sale's key and its relays), in the
 * background, for the owner (src/features/payment-link/owner-finals.ts, unsettled.ts), as
 * recordSale; with its signing key sealed for the owner alone (sealed-key.ts), who signs its final
 * version again each year.
 */
export function recordLink(
  profile: TerminalProfile,
  link: {
    id: string;
    key: Uint8Array;
    createdAt: number;
    onchainAddress: string | null;
    /** The relays its URL names: where the owner finds it. */
    relays: readonly string[];
    /** Its own signing key, and the business's registry whose link key reader it is sealed for. */
    secretKey: Uint8Array;
    business: Pick<BusinessRegistry, "reader" | "linkKeyReader">;
    /** Its sale's tolerance of on-chain underpayments (basis points, 0: none). */
    tolerance: number;
  }
): void {
  void recordSigner(profile)
    .then(async (signer) => {
      if (!signer) return;
      const { keys, team } = signer;
      // The owner's tag of its address: the owner vouches for an on-chain payment with it only.
      const onchainTag = await tagOf(team, link.onchainAddress);
      await publishUntilHeld(
        profile,
        keys,
        linkEvent(keys, {
          version: 1,
          link: link.id,
          saleKey: bytesToHex(link.key),
          createdAt: link.createdAt,
          onchainTag,
          relays: [...link.relays],
          ...sealLinkKeyFor(link.secretKey, link.business),
          ...(link.tolerance > 0 ? { tolerance: link.tolerance } : {})
        })
      );
    })
    .catch((error: unknown) => {
      logFailure("Publishing the payment link's record failed", error);
    });
}
