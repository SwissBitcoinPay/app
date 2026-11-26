import { bytesToHex } from "@noble/hashes/utils.js";

import {
  keepAccountEpoch,
  noteOwnerEpoch,
  ownerChannelEpoch,
  ownerEpoch,
  ownerEpochSeed,
  ownerEpochSettled,
  ownerGrantEpoch
} from "@/features/team/export-epochs";
import {
  INVITE_VALIDITY_SECONDS,
  MAX_ASSISTANTS,
  MAX_INTEGRATIONS,
  MAX_TEAM_MEMBERS,
  MEMBER_NAME_MAX_LENGTH,
  getInviteOrigin
} from "@/config/team";
import type { IntegrationOptionId } from "@/config/integration-catalog";
import {
  getAccountSettings,
  getAccountTeamKeys,
  getAccountWalletId,
  updateAccount,
  whenAccountSynced
} from "@/features/account/session";
import { getCheckoutOrigin } from "@/config/payment-links";
import { majority } from "@/config/registry";
import { copyArchive } from "@/features/activity/archive";
import { sealCatalogAgain } from "@/features/catalog/catalog";
import { copyAssistantInvoices } from "@/features/invoices/assistant-copies";
import { HOLDERS_AT_ONCE, linkHolders } from "@/features/payment-link/owner-finals";
import { saveCatalogKeys } from "@/features/terminal/catalog-key";
import { getTerminalProfile } from "@/features/terminal/profile-cache";
import { copyFundsRecoveries } from "@/features/wallet/funds-recovery";
import { formatAssistantKey } from "@/lib/assistant/keys";
import { inBatches } from "@/lib/batches";
import { channelCatalogOf, sameChannelCatalog, type ChannelCatalog } from "@/lib/catalog/reader";
import {
  deriveIntegrationKeys,
  formatIntegrationKey,
  type IntegrationKeys
} from "@/lib/integrations/keys";
import { logFailure } from "@/lib/log/log";
import { copyImageTo, type ImageRef } from "@/lib/media/image";
import {
  COPIES_AT_ONCE,
  copyEvents,
  copyEveryEvent,
  publishAgain,
  publishToRelays
} from "@/lib/nostr/pool";
import { sameBitcoinNode, type BitcoinNode } from "@/lib/onchain/node";
import { isCheckoutOrigin } from "@/lib/payment-link/checkout";
import { RECORD_KIND, type NewestRecord } from "@/lib/nostr/record";
import { nowUnix } from "@/lib/rates/snapshot";
import { within } from "@/lib/within";
import { sameRelayList, unionRelays } from "@/lib/relays/list";
import type { MerchantSettings } from "@/lib/settings/merchant";
import {
  channelEvent,
  fetchChannels,
  type ChannelEpoch,
  type TeamChannel
} from "@/lib/team/channel";
import { MAX_COUNTER_WRITERS, type ChannelInvoicing } from "@/lib/team/channel-invoicing";
import { closedInviteEvent, createInvite, fetchInviteEnds, readInvite } from "@/lib/team/invite";
import {
  assistantSecretKey,
  deriveCatalogReader,
  deriveMemberKeys,
  deriveRegistryKey,
  deriveRegistryReader,
  deriveLinkKeyReader,
  deriveLinkOwner,
  integrationSecretKey,
  inviteId,
  memberSecret,
  newMemberId,
  ownerDevicesSecret,
  usableTeamKeys,
  type MemberKeys,
  type TeamKeys
} from "@/lib/team/keys";
import { exportEpochSeed, raiseExportEpoch } from "@/lib/team/export-epoch";
import {
  fetchDevices,
  fetchProfiles,
  hasLeft,
  memberStateAddresses,
  type MemberDevice
} from "@/lib/team/member-records";
import { lotRecordAddress, usedRecordAddress } from "@/lib/team/onchain-lot";
import {
  assistantSeat,
  employeeSeat,
  integrationSeat,
  isRemovedSeat,
  makesInvoices,
  memberOf,
  seatKey,
  type Assistant,
  type Integration,
  type RosterEntry,
  type Seat,
  type TeamMember
} from "@/lib/team/roster";
import { TEAM_TIMEOUT_MS, sameTeamProfile, type TeamProfile } from "@/lib/team/shared";
import { ownerProfile } from "@/lib/terminal/model";

import {
  assistantKeysOf,
  channelInvoicingOf,
  counterWriterIds,
  invoicingBaseOf,
  type InvoicingBase
} from "./assistants";
import { cancelOpenLinks, type CancelOutcome, type SettleSales } from "./cancel-links";
import {
  GrantNewerError,
  GrantUnreachableError,
  exportStatusOf,
  readExportGrant,
  setExportAllowed,
  syncExportGrant,
  type GrantEpochs,
  type ExportStatus
} from "./export-grants";
import {
  catalogEpochOf,
  copiedOf,
  copyRoster,
  isKnownRemoved,
  knownRoster,
  knownSeat,
  publishActiveSeat,
  readRoster,
  readSeat,
  recordRemoval,
  refreshRoster,
  rosterRepairs,
  type Roster,
  type RosterRead,
  type RosterStatus
} from "./roster";
import { findIntegrationPending, type IntegrationPending } from "./integration-pending";
import { publishRepairs, type Repair } from "./repairs";
import { absorbRemovedWriters, absorbedWriters } from "./numbering";
import { findUnsettled, type Unsettled } from "./unsettled";

/*
 * The owner's side of the team: inviting employees, removing them, and
 * keeping their channels in step with the account. Needs the account open (the passkey): the team
 * keys derive from the wallet. Who is in the team is the roster's (one record per seat on the
 * account's relays, src/lib/team/roster.ts), read and written by the owner's
 * devices only, never part of the settings: two of them inviting or removing at once lose nothing.
 * The account's integrations (docs/integrations.md) have a record and a channel too,
 * read by their integrator's server with their secret key: created, removed, and their channels
 * kept in step and moved here as the employees'. So do its assistants (sattleme/mcp-server), read
 * by their MCP server (local or hosted) with theirs.
 */

export type TeamErrorCode =
  /** No account open, or its sign-up is not done. */
  | "noAccount"
  /** This build has no web app for invitation links (no RP ID: local, CI). */
  | "noWebApp"
  /**
   * MAX_TEAM_MEMBERS reached, or MAX_INTEGRATIONS for an integration, or MAX_ASSISTANTS for an
   * assistant (or the writers of numbers its channel would name, MAX_COUNTER_WRITERS).
   */
  | "tooMany"
  | "invalidName"
  /**
   * The relays did not answer: no majority gave the roster or took the new seat's record (nothing
   * was created: trying again is safe), no majority took an invitation shown again, or no majority
   * took a removal, or they could not tell whether an employee's sales are final.
   */
  | "unreachable"
  /**
   * A new employee is created (its record on a majority of the relays), but no majority took its
   * channel or its invitation: showing it again from the list publishes them (inviteEmployee).
   * Inviting it again would make a second employee.
   */
  | "unpublished"
  /**
   * The member's channel says "removed" on a majority of the relays (it stopped), but no majority
   * took its record's removal: it is still listed until a removal again, or the next sync of the
   * channels, records it (removeSeat).
   */
  | "removalUnsaved"
  /**
   * A sale of the employee to remove is not final yet (unsettled.ts): `unsettled` says how many,
   * null when the relays could not tell. Removing it all the same cancels its payment links first
   * (removeEmployee's `cancelOpen`).
   */
  | "salesInProgress"
  /**
   * A payment of the integration to remove is not final yet (integration-pending.ts): `pending`
   * says what, null when the relays or the explorer could not tell. Removing it all the same
   * (removeIntegration's `force`) does not wait for them.
   */
  | "integrationPending"
  /**
   * An assistant's grant of the transactions' export was written by a newer app of the owner's
   * (export-grants.ts): this one never changes it.
   */
  | "exportNewer"
  /**
   * An invoice of the assistant to remove is of a newer format (copyAssistantInvoices): this app
   * cannot copy it, so the assistant is not removed (its invoices would no longer show).
   */
  | "invoicesNewer";

export class TeamError extends Error {
  readonly code: TeamErrorCode;
  /** For "salesInProgress": what is not final yet; null when the relays could not tell. */
  readonly unsettled: Unsettled | null;
  /** For "integrationPending": what of the integration is not final yet. */
  readonly pending: IntegrationPending | null;

  constructor(
    code: TeamErrorCode,
    message: string,
    unsettled: Unsettled | null = null,
    pending: IntegrationPending | null = null
  ) {
    super(message);
    this.name = "TeamError";
    this.code = code;
    this.unsettled = unsettled;
    this.pending = pending;
  }
}

/** Channels unchanged for this long are dated again (relays may prune old events). */
const CHANNEL_REFRESH_SECONDS = 30 * 24 * 60 * 60;

/**
 * Changes of the team and publications of its channels, one at a time: a
 * sync deciding from a roster read before a removal would publish an "active" channel newer than
 * the removal, and the removed employee's device would go on taking payments.
 */
let teamWrites: Promise<unknown> = Promise.resolve();

function withTeamLock<T>(task: () => Promise<T>): Promise<T> {
  const run = teamWrites.then(task);
  teamWrites = run.catch(() => undefined);
  return run;
}

type OpenTeam = { team: TeamKeys; settings: MerchantSettings };

/** The open account's team keys and settings: TeamError "noAccount" without a finished account. */
export function openTeam(): OpenTeam {
  const team = getAccountTeamKeys();
  const settings = getAccountSettings();
  if (!team || !settings || settings.signUp !== "done") {
    throw new TeamError("noAccount", "No finished account is open");
  }
  return { team, settings };
}

/**
 * What a member's channel carries of the business: its profile, the tolerance of on-chain
 * underpayments (src/lib/onchain/tolerance.ts) and the merchant's own Bitcoin node
 * (src/lib/onchain/node.ts), in the channel beside the profile, never in it (the profile is what
 * the point of sale shows).
 */
type ChannelProfile = TeamProfile & {
  onchainTolerance: number;
  bitcoinNode: BitcoinNode | null;
  /** What an assistant's channel copies of the settings (its invoices, invoicingBaseOf). */
  invoicing: InvoicingBase;
};

/**
 * What the employees' devices take payments with: the business's name and currency, whether its
 * point of sale's invoices offer an on-chain address ("On-chain payments"; an assistant's channel
 * says true whatever it is: activeChannel), the Lightning address of this device's point of sale
 * (activateTerminal), which is the wallet's; and the tolerance their sales (and the integrations'
 * orders) are judged with.
 */
async function teamProfile(settings: MerchantSettings): Promise<ChannelProfile | null> {
  // A point of sale's only: a card holder's device has no Lightning address to give.
  const profile = ownerProfile(await getTerminalProfile());
  const walletId = getAccountWalletId();
  if (!profile || !walletId) return null;
  if (profile.walletId.toLowerCase() !== walletId.toLowerCase()) return null;
  return {
    businessName: settings.businessName,
    lightningAddress: profile.lightningAddress,
    currency: settings.displayCurrency,
    onchain: settings.onchainPayments,
    logo: settings.logo,
    onchainTolerance: settings.onchainTolerance,
    bitcoinNode: settings.bitcoinNode,
    invoicing: invoicingBaseOf(settings)
  };
}

export function keysOf(team: TeamKeys, member: TeamMember): MemberKeys {
  return deriveMemberKeys(memberSecret(team, member.id));
}

/**
 * The seats of `roster` in the team: its employees, its integrations and its assistants. An
 * integration's or an assistant's channel syncs, moves and is removed as an employee's; an
 * integration has no invitation, device, profile nor records, and its lot of on-chain addresses is
 * its own (integration-addresses.ts); an assistant has no invitation, device nor profile, its
 * records are its payment links' and its invoices' (assistants.ts).
 */
function activeSeats(roster: Roster): Seat[] {
  return [
    ...roster.employees.map(employeeSeat),
    ...roster.integrations.map(integrationSeat),
    ...roster.assistants.map(assistantSeat)
  ];
}

/**
 * An employee's keys (its invitation's included, closed at its removal), an integration's, or an
 * assistant's employee's keys (deriveAssistantKeys: from its own secret, never an employee's).
 */
type SeatKeys = MemberKeys | IntegrationKeys;

function seatKeys(team: TeamKeys, seat: Pick<Seat, "role" | "id">): SeatKeys {
  if (seat.role === "integration")
    return deriveIntegrationKeys(integrationSecretKey(team, seat.id));
  if (seat.role === "assistant") return assistantKeysOf(team, seat.id).member;
  return deriveMemberKeys(memberSecret(team, seat.id));
}

/**
 * An assistant's channel's invoicing (channelInvoicingOf), from the roster as this device knows it
 * once it read it on a majority of the relays since the account opened (the other writers of
 * numbers it names must all be there); null otherwise: syncChannel keeps the channel's own.
 */
function invoicingOfChannel(
  team: TeamKeys,
  id: string,
  base: InvoicingBase,
  now: number,
  roster: Roster | null
): { invoicing?: ChannelInvoicing } {
  const known = roster ?? (knownRoster(team)?.everRead ? knownRoster(team)!.roster : null);
  if (!known) return {};
  return { invoicing: channelInvoicingOf(team, id, base, known, now, absorbedWriters(team)) };
}

function activeChannel(
  team: TeamKeys,
  member: Pick<Seat, "name" | "role" | "id" | "invoicing">,
  { onchainTolerance, bitcoinNode, invoicing, ...profile }: ChannelProfile,
  relays: readonly string[],
  updatedAt: number,
  /** For an assistant: the roster its writers of numbers come from, else the one known. */
  roster: Roster | null = null
): TeamChannel {
  // An integration's server sends its customers to this build's web app, when it has one.
  const origin = member.role === "integration" ? getCheckoutOrigin() : null;
  // An assistant created without invoices: format 2, without
  // `invoicing` (channel.ts), nothing that numbers invoices nor makes their links.
  const invoices = member.role === "assistant" && member.invoicing !== false;
  return {
    version: member.role === "assistant" && !invoices ? 2 : 1,
    status: "active",
    name: member.name,
    role: member.role,
    // "On-chain payments" is the point of sale's only: an
    // assistant's invoices always offer an on-chain address, as the owner's do (invoices.ts), its
    // MCP server taking one from its lot whenever its channel says so (owner-addresses.ts fills
    // that lot in any case). An integration's server takes on-chain payments whatever it says
    // (checkout-spec SPEC.md §31).
    profile: member.role === "assistant" ? { ...profile, onchain: true } : profile,
    registryKey: bytesToHex(deriveRegistryKey(team)),
    registryReader: deriveRegistryReader(team).publicKey,
    linkOwner: deriveLinkOwner(team).publicKey,
    // What its device seals its payment links' keys for: an employee's point of
    // sale and an assistant make links, an integration's server none.
    ...(member.role !== "integration"
      ? { linkKeyReader: deriveLinkKeyReader(team).publicKey }
      : {}),
    relays: [...relays],
    ...(origin !== null && isCheckoutOrigin(origin) ? { checkout: { origin } } : {}),
    // An employee's point of sale lists the business's articles, with the keys of the
    // catalogue's current epoch; an integration's server has no use for them.
    ...(member.role === "employee" ? catalogOfChannel(team) : {}),
    // Its point of sale seals its records and declarations at the account's export epoch: an
    // integration's server and an assistant's MCP server are not this app, and seal without epochs.
    ...(member.role === "employee" ? exportEpochOfChannel(team, member.id) : {}),
    // Its point of sale's sales, or its server's orders, are judged with it; none: absent, as in
    // older channels.
    ...(onchainTolerance > 0 ? { onchainTolerance } : {}),
    // Its point of sale, or its server, reads the chain there.
    ...(bitcoinNode ? { bitcoinNode } : {}),
    // An assistant's invoices: what they print, their web app and the shared counter.
    ...(invoices ? invoicingOfChannel(team, member.id, invoicing, updatedAt, roster) : {}),
    updatedAt
  };
}

/**
 * The catalogue's reading keys an employee's channel carries: those of the epoch the roster
 * tells (how many employees were removed), once this
 * device read it on a majority of the relays since the account opened; nothing otherwise (the
 * epoch is not known: syncChannel keeps the channel's own).
 */
function catalogOfChannel(team: TeamKeys): { catalog?: ChannelCatalog } {
  const known = knownRoster(team);
  if (!known?.everRead) return {};
  const epoch = catalogEpochOf(known.roster);
  return { catalog: channelCatalogOf(deriveCatalogReader(team, epoch), epoch) };
}

/**
 * The account's export epoch an employee's channel carries (ChannelEpoch of channel.ts): once this
 * device read it on a majority of the relays, at an epoch of 1 or more; nothing otherwise (unknown:
 * syncChannel keeps the channel's own).
 */
function exportEpochOfChannel(team: TeamKeys, id: string): { exportEpoch?: ChannelEpoch } {
  const walletId = getAccountWalletId();
  if (!walletId) return {};
  const base = deriveMemberKeys(memberSecret(team, id)).records.encryptionKey;
  const exportEpoch = ownerChannelEpoch(walletId, base);
  return exportEpoch ? { exportEpoch } : {};
}

/** The relays of the team's records: the account's. */
export function teamRelays(): string[] {
  return openTeam().settings.relays;
}

export const relayCall = (team: TeamKeys) => ({
  relays: teamRelays(),
  timeoutMs: TEAM_TIMEOUT_MS.background,
  // Refused once the account closes (its team keys wiped).
  channel: "account" as const,
  authKey: () => usableTeamKeys(team).secretKey
});

/** An employee's name as saved: trimmed, at most MEMBER_NAME_MAX_LENGTH characters. */
export function normalizeMemberName(name: string): string {
  return name.trim().slice(0, MEMBER_NAME_MAX_LENGTH);
}

/**
 * The roster on the account's relays, for a decision (MAX_TEAM_MEMBERS, MAX_INTEGRATIONS): a
 * majority of them answered, else TeamError "unreachable" (a seat or a removal on the others could
 * be missing).
 */
async function decidingRoster(team: TeamKeys): Promise<RosterRead> {
  const read = await readRoster(team, teamRelays());
  if (read.status !== "read") {
    throw new TeamError("unreachable", "No majority of the relays gave the roster");
  }
  return read;
}

/**
 * The seat `role` / `id` in the team, as this device knows it, else as the relays give it; null
 * when neither has it in the team (removed, or unknown).
 */
async function seatInTeam(team: TeamKeys, role: Seat["role"], id: string): Promise<Seat | null> {
  let seat = knownSeat(team, { role, id });
  if (!seat) {
    await readRoster(team, teamRelays());
    seat = knownSeat(team, { role, id });
  }
  return seat && !isRemovedSeat(seat) ? seat : null;
}

export type ShownInvite = { member: TeamMember; url: string; expiresAt: number };

/**
 * Publishes member `member`'s channel and invitation (ending at `expiresAt`: INVITE_VALIDITY_SECONDS
 * after its date for a new one, its record's own end for one shown again), and gives its link.
 * Without `invitation`, the invitation is not published again (showInvite: closed, or of a newer
 * format). Rejects with "unreachable" when no relay took what it published.
 */
async function publishInvite(
  team: TeamKeys,
  member: TeamMember,
  profile: ChannelProfile,
  relays: readonly string[],
  {
    expiresAt = member.invitedAt + INVITE_VALIDITY_SECONDS,
    invitation = true
  }: { expiresAt?: number; invitation?: boolean } = {}
): Promise<ShownInvite> {
  const origin = getInviteOrigin();
  if (!origin) throw new TeamError("noWebApp", "No web app for invitation links");
  const keys = keysOf(team, member);
  const invite = createInvite({
    team,
    memberId: member.id,
    name: member.name,
    invitedAt: member.invitedAt,
    expiresAt,
    origin,
    relays
  });
  // The channel first: a device that opens the invitation reads it next. Shown again, both are
  // signed again with their first date: a relay that holds them (or a newer channel, or the
  // invitation closed) refuses them, which is no failure (publishAgain).
  // Each to a majority of the relays: the device that opens the invitation reads it from one.
  const call = relayCall(team);
  const [channelRelays, inviteRelays] = await Promise.all([
    publishAgain(
      channelEvent(team, keys, activeChannel(team, member, profile, relays, member.invitedAt)),
      call,
      { quorum: "majority" }
    ),
    invitation
      ? publishAgain(
          invite.event,
          { ...call, authKey: keys.invite.nostr.secretKey },
          { quorum: "majority" }
        )
      : Promise.resolve(null)
  ]);
  const quorum = majority(call.relays.length);
  if (channelRelays.length < quorum || (inviteRelays !== null && inviteRelays.length < quorum)) {
    throw new TeamError("unreachable", "No majority of the relays took the invitation");
  }
  return { member, url: invite.url, expiresAt: invite.expiresAt };
}

/**
 * Invites an employee: counted on the roster a majority of the relays gave (MAX_TEAM_MEMBERS), its
 * record on a majority of them (else TeamError "unreachable" and nothing else is published), then
 * its channel and its invitation (else TeamError "unpublished": the employee is created). Gives the
 * link to show as a QR code, valid 48 hours (INVITE_VALIDITY_SECONDS).
 */
export async function inviteEmployee(name: string): Promise<ShownInvite> {
  openTeam();
  if (!getInviteOrigin()) throw new TeamError("noWebApp", "No web app for invitation links");
  const normalized = normalizeMemberName(name);
  if (normalized === "") throw new TeamError("invalidName", "No name");
  // The account's relays as the sync left them (another of the owner's devices may have changed them).
  await whenAccountSynced();
  return withTeamLock(async () => {
    const { team, settings } = openTeam();
    const read = await decidingRoster(team);
    if (read.roster.employees.length >= MAX_TEAM_MEMBERS) {
      throw new TeamError("tooMany", "Too many employees");
    }
    const profile = await teamProfile(settings);
    if (!profile)
      throw new TeamError("noAccount", "This device does not take this account's payments");
    const member: TeamMember = {
      id: newMemberId(),
      name: normalized,
      role: "employee",
      invitedAt: nowUnix()
    };
    if (
      !(await publishActiveSeat(team, employeeSeat(member), settings.relays, { created: true }))
    ) {
      throw new TeamError("unreachable", "No majority of the relays took the employee's record");
    }
    try {
      return await publishInvite(team, member, profile, settings.relays);
    } catch (error) {
      // Created all the same, whatever failed (no majority took them, the account closed
      // meanwhile): the owner shows it again from the list, never invites it twice.
      if (!(error instanceof TeamError)) logFailure("Publishing a new invitation failed", error);
      throw new TeamError("unpublished", "The new employee's invitation was not published");
    }
  });
}

/**
 * The invitation of a member who has not joined yet, shown again (the same link, from any of the
 * owner's devices), and published again for relays that lost it, with its record. Its end is the
 * one its record has, INVITE_VALIDITY_SECONDS after its date when no relay gives it. A closed
 * invitation is not published again: a relay that missed its closing would give the member's
 * secret again (its device gives it the closed one, member.ts); nor one of a newer format, never
 * written over.
 */
export async function showInvite(memberId: string): Promise<ShownInvite> {
  const { team, settings } = openTeam();
  const seat = await seatInTeam(team, "employee", memberId);
  if (!seat) throw new TeamError("noAccount", "No such member");
  const profile = await teamProfile(settings);
  if (!profile)
    throw new TeamError("noAccount", "This device does not take this account's payments");
  // Dated by its invitation, as always: it never replaces a removal.
  void publishActiveSeat(team, seat, settings.relays);
  const member = memberOf(seat);
  const keys = keysOf(team, member);
  const { lookup, closed } = await readInvite(
    {
      id: inviteId(keys.invite.nostr.publicKey, team.publicKey),
      key: keys.invite.encryptionKey,
      relays: settings.relays
    },
    nowUnix(),
    { member: keys }
  );
  return publishInvite(team, member, profile, settings.relays, {
    expiresAt:
      lookup.status === "open"
        ? lookup.invite.expiresAt
        : (closed?.expiresAt ?? member.invitedAt + INVITE_VALIDITY_SECONDS),
    invitation: lookup.status !== "closed" && lookup.status !== "newer"
  });
}

/**
 * When the invitation of each of `members` ends, by id: as its record on `relays` says, read for
 * those whose invitation may not have ended at `now` (INVITE_VALIDITY_SECONDS) and that have no
 * device known (`devices`); otherwise, and when no relay gives it, INVITE_VALIDITY_SECONDS after
 * its date (its record gone from the relays, its link no longer opens).
 */
export async function inviteEndsOf(
  team: TeamKeys,
  members: readonly TeamMember[],
  relays: readonly string[],
  now: number,
  devices: ReadonlyMap<string, MemberDevice | null> | null = null
): Promise<Map<string, number>> {
  const read = await fetchInviteEnds(
    team,
    members
      .filter(
        (member) => member.invitedAt + INVITE_VALIDITY_SECONDS > now && !devices?.get(member.id)
      )
      .map((member) => ({ id: member.id, keys: keysOf(team, member) })),
    relays
  );
  return new Map(
    members.map((member) => [
      member.id,
      read?.get(member.id) ?? member.invitedAt + INVITE_VALIDITY_SECONDS
    ])
  );
}

/**
 * A new integration and its secret key (formatIntegrationKey, docs/integrations.md), which its
 * integrator keeps on its server. Never the business's Lightning address:
 * the server reads it from the integration's channel.
 */
export type ShownIntegration = {
  integration: Integration;
  secretKey: string;
  /**
   * A majority of the relays took its channel. False: the integration is created all the same (its
   * record on a majority of them), its channel published by the next sync of the channels
   * (syncTeamChannels, at the next unlock); meanwhile its server does not find it.
   */
  published: boolean;
};

/**
 * Creates an integration (docs/integrations.md) for `platform`, the shop or the language picked in
 * "New integration", whose logo its record keeps: counted on the
 * roster a majority of the relays gave (MAX_INTEGRATIONS), its record on a majority of them (else
 * TeamError "unreachable": nothing is created), then its channel, of role `integration`. Gives
 * its secret key, the only time it is ever made (never shown again, not
 * even with the passkey; the app derives the integration's own keys from its id, never its secret
 * key's text again): given even when no majority took the channel (`published`), since the
 * integration exists then and its key could not be shown later. A lost key is replaced by a new
 * integration, then the removal of the old one.
 * Accepted: a record a minority of the relays took, whose withdrawal
 * (publishActiveSeat) none of them took, may later list an integration whose key was never shown;
 * the owner removes it.
 */
export async function createIntegration(
  name: string,
  platform: IntegrationOptionId
): Promise<ShownIntegration> {
  openTeam();
  const normalized = normalizeMemberName(name);
  if (normalized === "") throw new TeamError("invalidName", "No name");
  // The account's relays as the sync left them (another of the owner's devices may have changed them).
  await whenAccountSynced();
  return withTeamLock(async () => {
    const { team, settings } = openTeam();
    const read = await decidingRoster(team);
    if (read.roster.integrations.length >= MAX_INTEGRATIONS) {
      throw new TeamError("tooMany", "Too many integrations");
    }
    const profile = await teamProfile(settings);
    if (!profile)
      throw new TeamError("noAccount", "This device does not take this account's payments");
    const integration: Integration = {
      id: newMemberId(),
      name: normalized,
      createdAt: nowUnix(),
      platform
    };
    const seat = integrationSeat(integration);
    // Made before anything is published: once its record is, the integration exists, and its key
    // must reach the screen.
    const secretKey = formatIntegrationKey({
      teamPublicKey: team.publicKey,
      key: integrationSecretKey(team, integration.id),
      // The relays its channel goes to, the account's: the server follows the channel from there
      // after a change of the account's relays (docs/integrations.md).
      relays: settings.relays
    });
    const channel = channelEvent(
      team,
      seatKeys(team, seat),
      activeChannel(team, seat, profile, settings.relays, integration.createdAt)
    );
    const call = relayCall(team);
    if (!(await publishActiveSeat(team, seat, settings.relays, { created: true }))) {
      throw new TeamError("unreachable", "No majority of the relays took the integration's record");
    }
    const took = await publishToRelays(channel, call, { quorum: "majority" });
    return { integration, secretKey, published: took.length >= majority(call.relays.length) };
  });
}

/**
 * How long a removal of an employee reads its sales (removeEmployee), and tries to cancel its
 * payment links: a few relays' reads; then each paid link's sale followed (SaleSettler, up to a
 * minute, all at once) and the final versions published. Past them, it goes on without: what its
 * records say never holds its removal back.
 */
export const REMOVAL_READ_MS = 30_000;
export const REMOVAL_CANCEL_MS = 120_000;

/**
 * What a removal of an employee left (removeEmployee): "removed", nothing; "linksLeft", payment
 * links of its that were not final and could not be canceled (one received a payment not final
 * yet, or the relays or services could not tell): they stay payable until they end, their payments
 * reach the merchant's wallet, and the owner settles them later (settlingHolders, owner-finals.ts).
 */
export type EmployeeRemoval = "removed" | "linksLeft";

/**
 * Removes an employee (`shown`, as the screen listed it) for good. Never
 * held back by what its own records say: whoever holds its keys (its
 * invitation opened before it) writes them, and could otherwise keep the employee in the team for
 * good, which a removal exists to end. Its sales are read first only to ask the owner to confirm
 * again: TeamError "salesInProgress" while one is not final, or when the relays could not tell
 * (`unsettled` null). Confirmed (`cancelOpen`), its payment links not final
 * yet are canceled as far as possible (cancel-links.ts: those that received a payment followed
 * with `settle` and finalized when their outcome is final), whatever comes of it: the owner settles
 * the others after the removal, as it does for the employees still there (settlingHolders). Then
 * removeSeat: its device forgets the business, the invoices it shows with it (as soon as a relay
 * sends it the removal while an invoice shows, watchMembership; else at its next check; an invoice
 * already in a payer's wallet can still be paid, the payment reaches the merchant's wallet), and an
 * invitation not used yet is closed. It keeps what it already saw, and its device could still ask
 * the Lightning address for invoices: they would pay the merchant. Rejects only as removeSeat does,
 * on the account's relays.
 */
export async function removeEmployee(
  shown: TeamMember,
  { cancelOpen = false, settle }: { cancelOpen?: boolean; settle?: SettleSales } = {}
): Promise<EmployeeRemoval> {
  const { team } = openTeam();
  // The account's relays as the sync left them (another of the owner's devices may have changed them).
  await whenAccountSynced();
  const [holder] = linkHolders(team, [shown], []);
  // Within REMOVAL_READ_MS: thousands of records naming relays that never answer would otherwise
  // hold the removal back for hours, one relay's timeout after the other.
  const unsettled = await within(
    findUnsettled(team, [holder!], { thisDevice: false }),
    REMOVAL_READ_MS
  ).catch((error: unknown) => {
    logFailure("Reading an employee's sales failed", error);
    return null;
  });
  const open = unsettled === null || unsettled.invoices + unsettled.links > 0;
  if (open && !cancelOpen) {
    throw new TeamError("salesInProgress", "A sale of this employee may not be final", unsettled);
  }
  let left = false;
  if (unsettled === null || unsettled.links > 0) {
    // The owner vouches only for payments to the business's Lightning address.
    const profile = await teamProfile(openTeam().settings);
    const outcome = await within(
      cancelOpenLinks(team, holder!, {
        settle,
        lightningAddress: profile?.lightningAddress ?? null
      }),
      REMOVAL_CANCEL_MS
    ).catch((error: unknown): CancelOutcome => {
      logFailure("Canceling an employee's payment links failed", error);
      return "unreachable";
    });
    left = outcome !== "canceled";
  }
  await withTeamLock(() => removeSeat(employeeSeat(shown)));
  // The catalogue's new epoch: the employees still in the team get its key
  // in their channels, then the catalogue is sealed again with it, in the background (a failure is
  // made up at the next sync, at each unlock).
  void syncTeamChannels();
  return left ? "linksLeft" : "removed";
}

/**
 * Removes an integration (`shown`, as the screen listed it) for good, as removeSeat does. First,
 * whether one of its payments is pending (integration-pending.ts), so that
 * each of its sales is settled while it is still an integration of the account: TeamError
 * "integrationPending" with what is not final yet (an order whose address is still leased, a
 * payment being confirmed), `pending` null when that could not be told; nothing is done then.
 * Confirmed again (`force`), it is removed without waiting: what that check reads are the
 * integration's own records (its witnesses, its orders' leases), which whoever holds its key
 * writes, and could otherwise keep it in the team for good, which a removal exists to end (a key
 * that leaked, docs/integrations.md), as removeEmployee is never held back by its own records.
 * Its payments still reach the merchant's wallet; "Wallet" names it
 * for those seen before its removal only (markVouches). Its server then makes no new invoice
 * (docs/integrations.md: it reads the channel before each one, or every 5 minutes at most); an
 * invoice it already gave can still be paid (a Lightning invoice cannot be revoked), the payment
 * reaches the merchant's wallet. It has no records nor links to wait for.
 */
export async function removeIntegration(
  shown: Integration,
  { force = false }: { force?: boolean } = {}
): Promise<void> {
  const { team } = openTeam();
  // The account's relays as the sync left them (another of the owner's devices may have changed them).
  await whenAccountSynced();
  if (!force) {
    const pending = await findIntegrationPending(team, shown, relayCall(team));
    if (pending === null || pending.open + pending.confirming > 0) {
      throw new TeamError(
        "integrationPending",
        pending === null
          ? "Whether its payments are final could not be told"
          : "A payment of this integration is not final yet",
        null,
        pending
      );
    }
  }
  return withTeamLock(() => removeSeat(integrationSeat(shown)));
}

/**
 * A new assistant and its secret key (formatAssistantKey, src/lib/assistant/keys.ts), which
 * its owner gives to its MCP server (local or hosted).
 */
export type ShownAssistant = {
  assistant: Assistant;
  secretKey: string;
  /**
   * A majority of the relays took its channel. False: the assistant is created all the same (its
   * record on a majority of them), its channel published by the next sync of the channels
   * (syncTeamChannels, at the next unlock); meanwhile its server does not find it.
   */
  published: boolean;
};

/**
 * Creates an assistant (sattleme/mcp-server), as createIntegration does an
 * integration: counted on the roster a majority of the relays gave (MAX_ASSISTANTS, and the writers
 * of numbers a channel names, MAX_COUNTER_WRITERS). First the channels of the other assistants that
 * make invoices name it among the writers of numbers, on a majority of the relays each (they read
 * their channel before each number: none of them gives a number it took), else TeamError
 * "unreachable" and nothing is created; then its record on a majority of them (else
 * "unreachable"), then its own channel. Gives its secret key, the only time it is ever made (never
 * shown again, as an integration's).
 *
 * `invoicing` false: it makes no invoices, for good (its record's
 * format 4, its channel's format 2): it takes no number, so no other channel names it, and its
 * channel gives nothing that numbers or makes them. What it may do then is export the
 * transactions, once the owner allows it (setAssistantExport).
 */
export async function createAssistant(
  name: string,
  { invoicing = true }: { invoicing?: boolean } = {}
): Promise<ShownAssistant> {
  openTeam();
  const normalized = normalizeMemberName(name);
  if (normalized === "") throw new TeamError("invalidName", "No name");
  // The account's relays as the sync left them (another of the owner's devices may have changed them).
  await whenAccountSynced();
  return withTeamLock(async () => {
    const { team, settings } = openTeam();
    const read = await decidingRoster(team);
    const createdAt = nowUnix();
    if (
      read.roster.assistants.length >= MAX_ASSISTANTS ||
      // The owner, the others, and itself: what another's channel would name with it.
      (invoicing && counterWriterIds(read.roster, createdAt).length + 2 > MAX_COUNTER_WRITERS)
    ) {
      throw new TeamError("tooMany", "Too many assistants");
    }
    const profile = await teamProfile(settings);
    if (!profile)
      throw new TeamError("noAccount", "This device does not take this account's payments");
    const assistant: Assistant = {
      id: newMemberId(),
      name: normalized,
      createdAt,
      ...(invoicing ? {} : { invoicing: false as const })
    };
    const seat = assistantSeat(assistant);
    const roster: Roster = { ...read.roster, assistants: [...read.roster.assistants, assistant] };
    // Made before anything is published: once its record is, the assistant exists, and its key
    // must reach the screen.
    const secretKey = formatAssistantKey({
      teamPublicKey: team.publicKey,
      key: assistantSecretKey(team, assistant.id),
      relays: settings.relays
    });
    // Those that make invoices, when it makes them too: they name it among the writers of numbers.
    const others = invoicing ? read.roster.assistants.filter(makesInvoices).map(assistantSeat) : [];
    if (!(await publishAssistantChannels(team, others, profile, settings.relays, roster))) {
      throw new TeamError("unreachable", "No majority of the relays took an assistant's channel");
    }
    if (!(await publishActiveSeat(team, seat, settings.relays, { created: true }))) {
      throw new TeamError("unreachable", "No majority of the relays took the assistant's record");
    }
    const call = relayCall(team);
    const took = await publishToRelays(
      channelEvent(
        team,
        seatKeys(team, seat),
        activeChannel(team, seat, profile, settings.relays, createdAt, roster)
      ),
      call,
      { quorum: "majority" }
    );
    return { assistant, secretKey, published: took.length >= majority(call.relays.length) };
  });
}

/**
 * Publishes the channels of the assistants `seats` as `roster` has the team (the writers of numbers
 * they name), each dated after the one a majority of the relays hold: true when each was read and
 * then taken on a majority (a removed one, or one of a newer format, is left as it is). Never
 * rejects.
 */
async function publishAssistantChannels(
  team: TeamKeys,
  seats: readonly Seat[],
  profile: ChannelProfile,
  relays: readonly string[],
  roster: Roster
): Promise<boolean> {
  if (seats.length === 0) return true;
  try {
    const call = relayCall(team);
    const listed = seats.map((seat) => ({ seat, keys: seatKeys(team, seat) }));
    const found = await fetchChannels(
      team,
      listed.map(({ seat, keys }) => ({ id: seatKey(seat), keys })),
      call.relays
    );
    if (!found) return false;
    const now = nowUnix();
    const held = await inBatches(listed, HOLDERS_AT_ONCE, async ({ seat, keys }) => {
      const record = found.get(seatKey(seat));
      if (!record || record.copies.size < majority(call.relays.length)) return false;
      const { newest, newestUnreadable } = record;
      const newer =
        newestUnreadable !== null && newestUnreadable > (newest?.event.created_at ?? -1);
      if (newer || newest?.value.status === "removed") return true;
      const updatedAt = Math.max(now, (newest?.value.updatedAt ?? 0) + 1);
      const event = channelEvent(
        team,
        keys,
        activeChannel(team, seat, profile, relays, updatedAt, roster)
      );
      return (
        (await publishToRelays(event, call, { quorum: "majority" })).length >=
        majority(call.relays.length)
      );
    });
    return held?.every(Boolean) ?? false;
  } catch (error) {
    // The account closed meanwhile (its team keys wiped).
    logFailure("Publishing the assistants' channels failed", error);
    return false;
  }
}

/**
 * Before an assistant that makes invoices is removed, the owner's copy of its invoices on a majority
 * of the team's relays (copyAssistantInvoices): once removed, its
 * key proves nothing (it is never revoked), its invoices are these copies only (loadInvoices).
 * TeamError "unreachable" or "invoicesNewer" when they are not copied: nothing removed then. Any
 * other seat: nothing to copy.
 */
async function copyBeforeRemoval(team: TeamKeys, seat: Seat): Promise<void> {
  if (seat.role !== "assistant" || !makesInvoices(seat)) return;
  const copy = await copyAssistantInvoices(team, seat.id, teamRelays(), TEAM_TIMEOUT_MS.waiting);
  if (copy === "unreachable") {
    throw new TeamError("unreachable", "No majority of the relays gave or took its invoices");
  }
  if (copy === "newer") {
    throw new TeamError("invoicesNewer", "An invoice of the assistant is of a newer format");
  }
}

/**
 * Removes an assistant (`shown`, as the screen listed it) for good, as removeSeat does, once the
 * owner copied its invoices (copyBeforeRemoval): its MCP server reads its channel before each
 * invoice and makes no new one. Its invoices' payment links stay payable until their due date;
 * the owner settles them as an employee's (src/features/payment-link/owner-finals.ts). Then the
 * owner's copy of the shared counter takes its last number (absorbRemovedWriters,
 * src/features/team/numbering.ts), and only then do the other assistants' channels stop naming
 * it: its key's holder can no longer stop their numbers. A failure
 * leaves both to the next sync of the team: meanwhile they keep naming it, never a number given
 * twice.
 */
export async function removeAssistant(shown: Assistant): Promise<void> {
  openTeam();
  // The account's relays as the sync left them (another of the owner's devices may have changed them).
  await whenAccountSynced();
  await withTeamLock(async () => {
    const seat = assistantSeat(shown);
    await copyBeforeRemoval(openTeam().team, seat);
    await removeSeat(seat);
    try {
      const { team, settings } = openTeam();
      const read = await readRoster(team, teamRelays());
      const absorbed =
        read.status === "read" &&
        (await absorbRemovedWriters(
          team,
          read.roster,
          settings.relays,
          TEAM_TIMEOUT_MS.background
        ));
      // Without the point of sale's profile, the channels wait for the next sync, as it does.
      const profile = absorbed ? await teamProfile(settings) : null;
      if (absorbed && profile) {
        const others = read.roster.assistants.filter(makesInvoices).map(assistantSeat);
        if (
          !(await publishAssistantChannels(team, others, profile, settings.relays, read.roster))
        ) {
          logFailure("Publishing the assistants' channels after a removal failed");
        }
      }
    } catch (error) {
      logFailure("Taking a removed assistant out of the others' channels failed", error);
    }
    // Removed, it exports nothing more (export-grants.ts): its grant withdrawn, its keys cleared,
    // the account's export epoch raised. A failure leaves it to the next sync of the team, which
    // withdraws it as well.
    try {
      const { team, settings } = openTeam();
      const read = await readRoster(team, teamRelays());
      await syncExportGrant(
        team,
        { id: shown.id, removedAt: nowUnix() },
        settings.devices,
        read.roster,
        settings.relays,
        TEAM_TIMEOUT_MS.background,
        nowUnix(),
        await grantEpochs(team)
      );
    } catch (error) {
      logFailure("Withdrawing a removed assistant's export grant failed", error);
    }
  });
  // The other grants and the employees' channels at the export epoch it raised.
  void syncTeamChannels();
}

/**
 * The account's export epoch as the grants need it (GrantEpochs of export-grants.ts): read on its
 * relays first (export-epochs.ts), raised on them once a grant ends.
 */
async function grantEpochs(team: TeamKeys): Promise<GrantEpochs> {
  await ownerEpochSettled();
  const walletId = getAccountWalletId();
  return {
    known: () => {
      const known = walletId ? ownerGrantEpoch(walletId) : null;
      return known ? { epoch: known.epoch, latest: known.latest } : null;
    },
    note: (epoch) => {
      if (walletId) noteOwnerEpoch(walletId, epoch);
    },
    seedOf: (epoch) =>
      (walletId ? ownerEpochSeed(walletId, epoch) : null) ??
      bytesToHex(exportEpochSeed(ownerDevicesSecret(team), epoch)),
    raise: async (at) => {
      const raised = await raiseExportEpoch(
        ownerDevicesSecret(team),
        teamRelays(),
        at,
        undefined,
        // Never below what this device knows (relays that lost the record).
        walletId ? (ownerEpoch(walletId)?.epoch ?? 0) : 0
      );
      if (walletId) noteOwnerEpoch(walletId, raised.epoch, raised.at);
    }
  };
}

/**
 * Allows the assistant `shown` to export the transactions, or withdraws it ("Export
 * transactions", src/lib/assistant/export-grant.ts): its grant
 * on a majority of the account's relays, then the reading keys of the team as a majority of them
 * gives the roster (allowed), or their clearing (withdrawn). TeamError "unreachable" when the
 * relays did not answer or take it (the next sync completes a decision taken), "exportNewer" when a
 * newer app wrote it, "unreachable" too for an assistant no longer in the team.
 */
export async function setAssistantExport(shown: Assistant, allowed: boolean): Promise<void> {
  openTeam();
  await whenAccountSynced();
  await withTeamLock(async () => {
    const { team, settings } = openTeam();
    const read = await decidingRoster(team);
    if (!read.roster.assistants.some((assistant) => assistant.id === shown.id)) {
      throw new TeamError("unreachable", "The assistant is no longer in the team");
    }
    try {
      await setExportAllowed(
        team,
        shown.id,
        allowed,
        settings.devices,
        read.roster,
        settings.relays,
        TEAM_TIMEOUT_MS.waiting,
        nowUnix(),
        await grantEpochs(team)
      );
    } catch (error) {
      if (error instanceof GrantNewerError) {
        throw new TeamError("exportNewer", "The export grant is of a newer format");
      }
      if (error instanceof GrantUnreachableError) throw new TeamError("unreachable", error.message);
      throw error;
    }
  });
  // Withdrawn, the export epoch it raised: the other grants and the employees' channels name it.
  if (!allowed) void syncTeamChannels();
}

export type AssistantsView = {
  /** In the order they were created. */
  assistants: Assistant[];
  /** By assistant id: whether it may export the transactions (export-grants.ts). */
  exports: Record<string, ExportStatus>;
  /** As TeamView's `roster`. */
  roster: RosterStatus;
  newer: boolean;
};

/** The account's assistants, as the roster has them. */
export async function loadAssistants(): Promise<AssistantsView> {
  const { team } = openTeam();
  const read = await readRoster(team, teamRelays(), TEAM_TIMEOUT_MS.waiting);
  const relays = teamRelays();
  const statuses = await Promise.all(
    read.roster.assistants.map(async ({ id }) => {
      try {
        return exportStatusOf(await readExportGrant(team, id, relays, TEAM_TIMEOUT_MS.waiting));
      } catch (error) {
        // The account closed meanwhile (its team keys wiped).
        logFailure("Reading an assistant's export grant failed", error);
        return "unread" as const;
      }
    })
  );
  return {
    assistants: read.roster.assistants,
    exports: Object.fromEntries(
      read.roster.assistants.map(({ id }, index) => [id, statuses[index]!])
    ),
    roster: read.status,
    newer: read.newerUnreadable
  };
}

/**
 * Removes every employee and integration at once, for "Delete account" (the owner confirmed it
 * for each kind, after the check that no sale of the business is
 * open, account-deletion.ts), each as removeSeat does: its channel says "removed" on a majority of
 * the team's relays (an employee's device watching its channel forgets the business at once, an
 * integration's server makes no new invoice), then its record. The roster is read from a majority
 * of them first (a seat on the others could be missed). Every seat is tried, whatever another gave:
 * TeamError "unreachable" when one could not be removed or recorded (those removed stay so).
 * Resolves with how many were removed.
 */
export async function removeAllSeats(): Promise<number> {
  openTeam();
  // The account's relays as the sync left them (another of the owner's devices may have changed them).
  await whenAccountSynced();
  return withTeamLock(async () => {
    const { team } = openTeam();
    const relays = teamRelays();
    const read = await decidingRoster(team);
    const seats = activeSeats(read.roster);
    let failed = false;
    // Every batch runs, whatever the previous one gave: each seat removed stays removed.
    await inBatches(seats, COPIES_AT_ONCE, async (seat) => {
      // An assistant's invoices copied first (copyBeforeRemoval): else it stays, the others go.
      try {
        await copyBeforeRemoval(team, seat);
      } catch {
        failed = true;
        return seat;
      }
      const removedAt = await publishRemoval(team, seat, seatKeys(team, seat), nowUnix());
      const held = read.answers.seats.get(seatKey(seat)) ?? null;
      if (removedAt === null || !(await recordRemoval(team, seat, removedAt, held, [relays]))) {
        failed = true;
      }
      return seat;
    });
    if (failed) throw new TeamError("unreachable", "No majority of the relays took a removal");
    return seats.length;
  });
}

/**
 * Removes `shown` (under the team's lock), in this order:
 * 1. its channel says "removed" on a majority of the team's relays: the member stops;
 * 2. its record says `removed`, dated by that channel's removal, on a majority of them;
 * 3. only then is it no longer listed.
 * Its record is read first on a majority of the relays: one of a newer format is never written
 * over (nothing is published), one removed already (another of the owner's devices) is given again
 * as it is. TeamError "unreachable" when step 1 fails (nothing changed), "removalUnsaved" when step
 * 2 does: the member stopped, its removal is recorded by a removal again, or by the next sync of
 * the channels (syncTeamChannels), from its channel's date.
 */
async function removeSeat(shown: Seat): Promise<void> {
  const { team } = openTeam();
  const relays = teamRelays();
  const held = await readSeat(team, shown, relays);
  if (!held) throw new TeamError("unreachable", "No majority of the relays gave its record");
  if (held.newer) throw new Error("Its record is of a newer format: never written over");
  // As its record has it (its name and date), else as the screen listed it.
  const seat: Seat = held.entry ? { ...held.entry.seat, removedAt: null } : shown;
  const removedAt = await publishRemoval(team, seat, seatKeys(team, seat), nowUnix());
  if (removedAt === null) {
    throw new TeamError("unreachable", "No majority of the relays took the removal");
  }
  if (!(await recordRemoval(team, seat, removedAt, held.entry, [relays]))) {
    throw new TeamError("removalUnsaved", "No majority of the relays took its record's removal");
  }
}

/**
 * Publishes the removal of `seat`: its channel says so, dated after the channel the relays hold,
 * and an employee's invitation, when still valid, is closed, on the team's relays as they are now
 * (teamRelays). Resolves with the removal's date when a majority of them took it (the first
 * removal's, when the relays held one already), null otherwise; never rejects.
 */
async function publishRemoval(
  team: TeamKeys,
  seat: Seat,
  keys: SeatKeys,
  now: number
): Promise<number | null> {
  try {
    const call = relayCall(team);
    const found = await fetchChannels(team, [{ id: seat.id, keys }], call.relays);
    const newest = found?.get(seat.id)?.newest?.value;
    const held = newest?.updatedAt ?? 0;
    // Removed already, on another of the owner's devices: the removal dates from then
    // ("Wallet" keeps the seat's sales paid before it, never later ones), whatever date
    // its new copy takes.
    const removedBefore = newest?.status === "removed" ? newest.updatedAt : null;
    // An employee's invitation that may still be valid: closed (an integration has none). Its end
    // the open one's (INVITE_VALIDITY_SECONDS): a relay keeps the closed one as long as the open
    // one.
    const expiresAt = seat.since + INVITE_VALIDITY_SECONDS;
    const member = seat.role === "employee" && "invite" in keys && expiresAt > now ? keys : null;
    const removedAt = Math.max(now, seat.since + 1, held + 1);
    const [channelRelays] = await Promise.all([
      publishToRelays(
        channelEvent(team, keys, { version: 1, status: "removed", updatedAt: removedAt }),
        call,
        { quorum: "majority" }
      ),
      member
        ? publishToRelays(
            closedInviteEvent(member, {
              team: team.publicKey,
              expiresAt,
              openedAt: seat.since,
              closedAt: now,
              device: null
            }),
            { ...call, authKey: member.invite.nostr.secretKey },
            // The others take it in the background: relays stop giving the member's secret.
            { quorum: "majority" }
          )
        : Promise.resolve([])
    ]);
    return channelRelays.length >= majority(call.relays.length)
      ? (removedBefore ?? removedAt)
      : null;
  } catch (error) {
    // The account closed meanwhile (its team keys wiped): nothing is removed.
    logFailure("Publishing a member's removal failed", error);
    return null;
  }
}

/**
 * Moves the team to the account's new relays `next` in the same save as them (the employees
 * follow, nobody is removed). First the roster is read from a majority of
 * the account's relays as they are, and each of its records, removals included, goes to a majority
 * of `next` (where the account reads its team afterwards); else nothing is published nor saved.
 * Then each member's channel, naming `next`, goes to a majority of the account's relays as they are
 * (where its device reads, as does the link of an invitation not used yet: the device that uses it
 * reads the channel there) and to `next`. Every channel is read first from a majority of them (a
 * removal from another of the owner's devices is on one of them: that member's record says so on
 * both lists, its channel is left as it is); one not read, or held in a newer format (a newer app
 * of the owner's, never written over), and nothing is published. Then, when one channel does not
 * reach a majority, every channel is put back on the relays as they are (on both lists: a device
 * may have followed already) and nothing is saved: TeamError "unreachable" in each case. Then, in
 * the background, the records published meanwhile on the relays as they were follow, and what the
 * owner reads of each member there is copied to `next` (copyTeamRecords), with the records of every
 * holder's payment links (copyLinkRecords), and the recoveries of the wallets' funds
 * (copyFundsRecoveries). What is read and written on the account's relays as they are is on
 * `leftOf` of them: all of them, but at a replacement of the relays sattle.me retired, those that
 * are not retired (src/lib/relays/retired.ts). Resolves with the settings saved.
 */
export async function moveTeam(
  next: readonly string[],
  leftOf: (relays: readonly string[]) => readonly string[] = (relays) => relays
): Promise<MerchantSettings> {
  openTeam();
  // The account's relays as the sync left them (another of the owner's devices may have changed them).
  await whenAccountSynced();
  return withTeamLock(async () => {
    const { team, settings } = openTeam();
    const before = [...leftOf(settings.relays)];
    const read = await readRoster(team, before);
    if (read.status !== "read") {
      throw new TeamError("unreachable", "No majority of the relays gave the roster");
    }
    if (!(await copyRoster(team, read, next))) {
      throw new TeamError("unreachable", "No majority of the new relays took the roster");
    }
    // The owner's copy of the declarations (archive.ts): "Wallet" reads it on the new list.
    if (!(await copyArchive(team, before, next))) {
      throw new TeamError("unreachable", "No majority of the relays gave or took the copies");
    }
    let moving: Moving[] = [];
    let profile: ChannelProfile | null = null;
    const seats = activeSeats(read.roster);
    if (seats.length > 0) {
      profile = await teamProfile(settings);
      if (!profile) {
        throw new TeamError("noAccount", "This device does not take this account's payments");
      }
      const moves = await readMoves(team, seats, before);
      if (!moves) throw new TeamError("unreachable", "No majority of the relays gave a channel");
      for (const { seat, removedAt } of moves.removed) {
        const recorded = await recordRemoval(
          team,
          seat,
          removedAt,
          read.answers.seats.get(seatKey(seat)) ?? null,
          [before, next]
        );
        if (!recorded) {
          throw new TeamError("unreachable", "No majority of the relays took a member's removal");
        }
      }
      moving = moves.moving;
      const published = await publishMoves(team, moving, profile, next, before, next);
      if (published.some((held) => !held)) {
        // Every channel back, those under a majority too: a relay may hold any of them.
        const back = moving.map((move) => ({ ...move, updatedAt: move.updatedAt + 1 }));
        await publishMoves(team, back, profile, before, before, next);
        throw new TeamError("unreachable", "No majority of the relays took a member's channel");
      }
    }
    const moved = new Set(moving.map(({ seat }) => seatKey(seat)));
    const saved = await updateAccount({ relays: [...next] });
    void followLate(team, read, moved, profile, before, next);
    void copyTeamRecords(
      team,
      seats.filter((seat) => moved.has(seatKey(seat))),
      before,
      next
    );
    void copyLinkRecords(team, read.roster, settings.devices, before, next);
    // The recoveries of the wallets' funds that left their balance (funds-recovery.ts).
    void copyFundsRecoveries(team, before, next);
    return saved;
  });
}

/**
 * After a move (moveTeam), the records of the payment links of every holder (the roster's
 * employees and assistants, those removed included, and the owner's `devices`), of any date,
 * copied from `before` to a majority of `next` (publishCopies): each device copies its own records
 * from the change
 * only (member.ts, moved-notice.ts), while the owner's copy of a month (src/features/activity/
 * archive.ts) reads that month's links on the account's relays once it is a year old, and keeps
 * only those it finds there. Resolves with whether each holder's records were copied whole
 * (copyEveryEvent). Never rejects.
 */
export async function copyLinkRecords(
  team: TeamKeys,
  roster: Roster,
  devices: MerchantSettings["devices"],
  before: readonly string[],
  next: readonly string[]
): Promise<boolean> {
  if (sameRelayList(before, next)) return true;
  try {
    // Inside the try: their keys derive from the team's, wiped once the account closes.
    const holders = linkHolders(
      team,
      [
        ...roster.employees,
        ...roster.removed.filter(({ role }) => role === "employee").map(memberOf)
      ],
      devices,
      [...roster.assistants, ...roster.removed.filter(({ role }) => role === "assistant")]
    );
    const copied = await inBatches(holders, HOLDERS_AT_ONCE, ({ keys }) =>
      copyEveryEvent(
        { kinds: [RECORD_KIND], authors: [keys.links.publicKey] },
        {
          channel: "account",
          relays: before,
          timeoutMs: TEAM_TIMEOUT_MS.background,
          authKey: keys.links.secretKey
        },
        next
      )
    );
    return copied !== null && copied.every(Boolean);
  } catch (error) {
    logFailure("Copying the payment links' records to the new relays failed", error);
    return false;
  }
}

/**
 * After a move (moveTeam), what another of the owner's devices published meanwhile on the relays
 * `before` (an employee invited, an integration created, a removal): its records copied to `next`,
 * the channels of the new seats moved there. Never rejects.
 */
async function followLate(
  team: TeamKeys,
  first: RosterRead,
  moved: ReadonlySet<string>,
  profile: ChannelProfile | null,
  before: readonly string[],
  next: readonly string[]
): Promise<void> {
  try {
    const again = await readRoster(team, before);
    if (again.status === "unread") return;
    await copyRoster(team, again, next, copiedOf(first));
    const late = activeSeats(again.roster).filter(
      (seat) => !moved.has(seatKey(seat)) && !first.answers.seats.has(seatKey(seat))
    );
    if (late.length === 0) return;
    const lateProfile = profile ?? (await teamProfile(openTeam().settings));
    if (!lateProfile) return;
    const read = await readMoves(team, late, before);
    if (read) await publishMoves(team, read.moving, lateProfile, next, before, next);
  } catch (error) {
    // The account closed meanwhile (its team keys wiped).
    logFailure("Following the team's late changes to the new relays failed", error);
  }
}

/** A member whose channel moves (moveTeam), dated after the one the relays hold. */
type Moving = { seat: Seat; keys: SeatKeys; updatedAt: number };

/**
 * Reads the channels of `seats` on the relays `before` (moveTeam): those to move, and those the
 * relays hold as removed (with the removal's date). Null when one was not read from a majority of
 * them, or is held in a newer format. Never rejects.
 */
async function readMoves(
  team: TeamKeys,
  seats: readonly Seat[],
  before: readonly string[]
): Promise<{ moving: Moving[]; removed: { seat: Seat; removedAt: number }[] } | null> {
  try {
    const listed = seats.map((seat) => ({ seat, keys: seatKeys(team, seat) }));
    const found = await fetchChannels(
      team,
      listed.map(({ seat, keys }) => ({ id: seatKey(seat), keys })),
      before
    );
    if (!found) return null;
    const now = nowUnix();
    const moving: Moving[] = [];
    const removed: { seat: Seat; removedAt: number }[] = [];
    for (const { seat, keys } of listed) {
      const record = found.get(seatKey(seat));
      if (!record || record.copies.size < majority(before.length)) return null;
      const { newest, newestUnreadable } = record;
      if (newestUnreadable !== null && newestUnreadable > (newest?.event.created_at ?? -1)) {
        return null;
      }
      if (newest?.value.status === "removed") {
        removed.push({ seat, removedAt: newest.value.updatedAt });
      } else {
        moving.push({ seat, keys, updatedAt: Math.max(now, (newest?.value.updatedAt ?? 0) + 1) });
      }
    }
    return { moving, removed };
  } catch (error) {
    // The account closed meanwhile (its team keys wiped).
    logFailure("Reading the team's channels failed", error);
    return null;
  }
}

/**
 * Publishes the channels of `moving`, naming `relays`, to the relays `before` and `after`,
 * HOLDERS_AT_ONCE at a time (moveTeam). Resolves with, for each, whether a majority of `before`
 * took it. Never rejects.
 */
async function publishMoves(
  team: TeamKeys,
  moving: readonly Moving[],
  profile: ChannelProfile,
  relays: readonly string[],
  before: readonly string[],
  after: readonly string[]
): Promise<boolean[]> {
  const call = {
    relays: unionRelays(before, after),
    timeoutMs: TEAM_TIMEOUT_MS.background,
    // Refused once the account closes (its team keys wiped).
    channel: "account" as const,
    authKey: () => usableTeamKeys(team).secretKey
  };
  const held = await inBatches(moving, HOLDERS_AT_ONCE, async ({ seat, keys, updatedAt }) => {
    try {
      const event = channelEvent(team, keys, activeChannel(team, seat, profile, relays, updatedAt));
      // A majority of each list: the list left decides (its devices read it there), the new one
      // is where they read it next.
      const took = await publishToRelays(event, call, { quorum: { lists: [before, after] } });
      return took.filter((relay) => before.includes(relay)).length >= majority(before.length);
    } catch (error) {
      logFailure("Publishing a member's channel failed", error);
      return false;
    }
  });
  return held ?? moving.map(() => false);
}

/**
 * Copies to the relays `next` what the owner reads of the employees and assistants among `seats` on
 * the relays `before`, as it is (copyEvents), after a change of relays (moveTeam): their lots of
 * on-chain addresses, their devices (else a member who joined shows as an ended invitation), their
 * profiles and photos, and the addresses their devices (or an assistant's server) used. Their
 * devices publish them again once they follow (member.ts): this is for the owner's screens
 * meanwhile. An integration has none of these. Never rejects.
 */
async function copyTeamRecords(
  team: TeamKeys,
  seats: readonly Seat[],
  before: readonly string[],
  next: readonly string[]
): Promise<void> {
  // An assistant's lot and the addresses it used, as an employee's (it has no device nor profile).
  const holders = seats.filter(({ role }) => role === "employee" || role === "assistant");
  if (holders.length === 0 || sameRelayList(before, next)) return;
  try {
    // Inside the try: their keys derive from the team's, wiped once the account closes.
    const listed = holders.map(({ role, id }) => ({
      id,
      keys:
        role === "assistant"
          ? assistantKeysOf(team, id).member
          : deriveMemberKeys(memberSecret(team, id))
    }));
    const authKey = () => usableTeamKeys(team).secretKey;
    const timeoutMs = TEAM_TIMEOUT_MS.background;
    await copyEvents(
      {
        kinds: [RECORD_KIND],
        authors: [team.publicKey],
        "#d": listed.map(({ keys }) => lotRecordAddress(keys))
      },
      { channel: "account", relays: before, timeoutMs, authKey },
      next
    );
    const profiles = await fetchProfiles(listed, before);
    await inBatches(listed, HOLDERS_AT_ONCE, async ({ id, keys }) => {
      await copyEvents(
        {
          kinds: [RECORD_KIND],
          authors: [keys.nostr.publicKey],
          "#d": [...memberStateAddresses(keys), usedRecordAddress(keys)]
        },
        { channel: "account", relays: before, timeoutMs, authKey: keys.nostr.secretKey },
        next
      );
      const avatar = profiles?.get(id)?.avatar;
      if (avatar) await copyImageTo(avatar, next, before);
      return true;
    });
  } catch (error) {
    // The account closed meanwhile (its team keys wiped): the devices publish them again.
    logFailure("Copying the team's records to the new relays failed", error);
  }
}

export type MemberStatus =
  /** Its invitation is waiting to be used. */
  | "invited"
  /** A device joined. */
  | "joined"
  /**
   * Its device joined, then left the business ("Leave the business", its device record's
   * `leftAt`): still listed, its sales still read, until the owner removes it.
   */
  | "left"
  /** Its invitation ended unused. */
  | "expired";

export type MemberView = {
  member: TeamMember;
  status: MemberStatus;
  /** The device it joined on (and left from, `leftAt`), when known. */
  device: MemberDevice | null;
  /** The photo it picked on its device (its profile, member-records.ts), null for its initials. */
  avatar: ImageRef | null;
  /** End of its invitation. */
  expiresAt: number;
};

export type TeamView = {
  members: MemberView[];
  /**
   * The relays answered: "joined" and "left" are known. Offline, members show by their
   * invitation's date.
   */
  online: boolean;
  /**
   * What the relays gave of the roster: "unread", the members this device knew already (none on a
   * first read): never an empty team; "partial", one may be missing.
   */
  roster: RosterStatus;
  /** A member's record is of a newer format (a newer app of the owner's): not listed. */
  newer: boolean;
};

/** The account's employees, newest first, with what the relays tell of their devices. */
export async function loadTeam(now: number = nowUnix()): Promise<TeamView> {
  const { team } = openTeam();
  const call = relayCall(team);
  const read = await readRoster(team, call.relays, TEAM_TIMEOUT_MS.waiting);
  const employees = read.roster.employees;
  const listed = employees.map((member) => ({ id: member.id, keys: keysOf(team, member) }));
  // Each invitation's end as its record says, read with the devices.
  const [devices, profiles, ends] = await Promise.all([
    fetchDevices(listed, call.relays),
    fetchProfiles(listed, call.relays),
    inviteEndsOf(team, employees, call.relays, now)
  ]);
  const members = [...employees].reverse().map((member): MemberView => {
    const expiresAt = ends.get(member.id)!;
    const device = devices?.get(member.id) ?? null;
    const status: MemberStatus = device
      ? hasLeft(device)
        ? "left"
        : "joined"
      : expiresAt > now
        ? "invited"
        : "expired";
    return { member, status, device, expiresAt, avatar: profiles?.get(member.id)?.avatar ?? null };
  });
  return {
    members,
    // No relay gave the roster: none could tell of a device either.
    online: devices !== null && read.status !== "unread",
    roster: read.status,
    newer: read.newerUnreadable
  };
}

export type IntegrationsView = {
  /** In the order they were created. */
  integrations: Integration[];
  /** As TeamView's `roster`. */
  roster: RosterStatus;
  newer: boolean;
};

/** The account's integrations, as the roster has them ("Integrations"). */
export async function loadIntegrations(): Promise<IntegrationsView> {
  const { team } = openTeam();
  const read = await readRoster(team, teamRelays(), TEAM_TIMEOUT_MS.waiting);
  return {
    integrations: read.roster.integrations,
    roster: read.status,
    newer: read.newerUnreadable
  };
}

/** The channels' syncs, one after the other: the last one queued, while it has not started. */
let channelSyncs: Promise<void> = Promise.resolve();
let queuedChannelSync: Promise<void> | null = null;

/**
 * Brings the channels of the employees and of the integrations in step with the account, in the
 * background once it is open: the business's current details for the members, dated again after a
 * month. A channel that says "removed" (another of the owner's devices removed the member, or a
 * removal here did not reach its record) is final: the member's record says so too, dated by that
 * channel's removal. A channel written by a newer app is left as it is. Then the roster's records
 * unchanged for a year are dated again (refreshRoster), and given to the relays that answered
 * without them (rosterRepairs). Never rejects.
 *
 * One sync at a time, each reading the channels once the one before wrote them: two changes in a
 * row ("On-chain payments" off, then on again) each start one, and a second sync that read the
 * channels before the first one's write would find them as it expects and leave the first one's
 * value there. A sync asked while one waits to start is that one: it reads the roster then.
 */
export function syncTeamChannels(now: () => number = nowUnix): Promise<void> {
  queuedChannelSync ??= channelSyncs.then(() => {
    queuedChannelSync = null;
    return syncTeamChannelsNow(now);
  });
  channelSyncs = queuedChannelSync;
  return queuedChannelSync;
}

/**
 * The date of a channel's removal, when its newest copy says "removed" (and no copy of a newer
 * format is newer); null otherwise.
 */
function channelRemoval(found: NewestRecord<TeamChannel>): number | null {
  const { newest, newestUnreadable } = found;
  if (newestUnreadable !== null && newestUnreadable > (newest?.event.created_at ?? -1)) return null;
  return newest?.value.status === "removed" ? newest.value.updatedAt : null;
}

/** Whether a majority of `asked` gave `found`, and its newest copy is active. */
function activeOnMajority(found: NewestRecord<TeamChannel>, asked: readonly string[]): boolean {
  const { newest, newestUnreadable } = found;
  return (
    found.copies.size >= majority(asked.length) &&
    newest?.value.status === "active" &&
    (newestUnreadable === null || newestUnreadable < newest.event.created_at)
  );
}

async function syncTeamChannelsNow(now: () => number): Promise<void> {
  try {
    await whenAccountSynced();
    // The account's export epoch, which the employees' channels give (exportEpochOfChannel).
    await ownerEpochSettled();
    const { team, settings } = openTeam();
    const relays = teamRelays();
    const read = await readRoster(team, relays);
    if (read.status === "unread") return;
    // The owner's copy of the shared counter over the assistants removed within the year, before
    // the channels: once it holds one, the others' channels stop naming it (numbering.ts).
    if (read.status === "read") {
      await absorbRemovedWriters(team, read.roster, settings.relays, TEAM_TIMEOUT_MS.background);
    }
    const members = activeSeats(read.roster).map((seat) => ({ seat, keys: seatKeys(team, seat) }));
    const profile = await teamProfile(settings);
    const channels = await fetchChannels(
      team,
      members.map(({ seat, keys }) => ({ id: seatKey(seat), keys })),
      relays
    );
    // The copies as they are to the relays that lack them, published once the lock is left
    // (repairs.ts): a relay that never answers holds no change of the team up meanwhile.
    const repairs: Repair[] = [];
    // Decided on the roster as this device knows it now, not as it was before the relays answered:
    // a removal made meanwhile is never published over (withTeamLock).
    await withTeamLock(async () => {
      // The seats whose channel a majority gave as active: their record may be dated again.
      const active = new Set<string>();
      await Promise.all(
        members.map(async ({ seat, keys }) => {
          if (isKnownRemoved(team, seat)) return;
          const found = channels?.get(seatKey(seat));
          if (!found) return;
          const removedAt = channelRemoval(found);
          if (removedAt !== null) {
            await recordRemoval(
              team,
              seat,
              removedAt,
              read.answers.seats.get(seatKey(seat)) ?? null,
              [teamRelays()]
            );
            return;
          }
          if (activeOnMajority(found, relays)) active.add(seatKey(seat));
          if (!profile) return;
          // The list as it is now: a change of relays made meanwhile goes in the channel.
          const { settings: latest } = openTeam();
          await syncChannel(team, seat, keys, profile, latest.relays, relays, found, now, repairs);
        })
      );
      const refreshed = await refreshRoster(team, read, active, now());
      await verifyRefreshed(team, refreshed);
      repairs.push(
        ...rosterRepairs(team, read, new Set(refreshed.map(({ seat }) => seatKey(seat))))
      );
      // The assistants' grants of the export, with the team read whole only (its seats are what
      // they give).
      if (read.status === "read") await syncExportGrants(team, read.roster, now, repairs);
    });
    await publishRepairs(repairs);
    await syncCatalogEpoch(team);
    // The account's export epoch on its relays, signed again or written back (export-epochs.ts).
    await keepAccountEpoch();
  } catch (error) {
    // No account open (locked meanwhile), or its sign-up not done: nothing to sync.
    if (!(error instanceof TeamError)) logFailure("Syncing the team's channels failed", error);
  }
}

/**
 * The export grants of the roster's assistants in step (export-grants.ts), and those removed within
 * EXPORT_WITHDRAWAL_SECONDS withdrawn (removeAssistant withdraws at once; this catches a removal
 * whose withdrawal failed, or made by an app before grants). Each failure logged. Never rejects.
 */
async function syncExportGrants(
  team: TeamKeys,
  roster: Roster,
  now: () => number,
  repairs: Repair[]
): Promise<void> {
  try {
    const { settings } = openTeam();
    const at = now();
    const epochs = await grantEpochs(team);
    const seats = [
      ...roster.assistants.map(({ id }) => ({ id, removedAt: null })),
      ...roster.removed
        .filter(
          (seat) =>
            seat.role === "assistant" &&
            at - seat.removedAt <= EXPORT_WITHDRAWAL_SECONDS &&
            !roster.assistants.some(({ id }) => id === seat.id)
        )
        .map(({ id, removedAt }) => ({ id, removedAt }))
    ];
    await inBatches(seats, HOLDERS_AT_ONCE, async (seat) => {
      try {
        await syncExportGrant(
          team,
          seat,
          settings.devices,
          roster,
          settings.relays,
          TEAM_TIMEOUT_MS.background,
          at,
          epochs,
          repairs
        );
      } catch (error) {
        logFailure("Syncing an assistant's export grant failed", error);
      }
      return true;
    });
  } catch (error) {
    // The account closed meanwhile (its team keys wiped): at the next sync.
    logFailure("Syncing the assistants' export grants failed", error);
  }
}

/** A removed assistant's grant is checked withdrawn this long after its removal (syncExportGrants). */
const EXPORT_WITHDRAWAL_SECONDS = 30 * 24 * 60 * 60;

/**
 * The catalogue in step with its epoch (an employee removed loses the catalogue), after the
 * channels: once this device read the roster on a majority of the relays,
 * the catalogue is sealed again with the key of the epoch it tells (sealCatalogAgain: the
 * employees in the team got it in their channels just before, with the key before it for the
 * articles not sealed again yet), then this device keeps that epoch's keys for its point of sale in
 * till mode. Never rejects.
 */
async function syncCatalogEpoch(team: TeamKeys): Promise<void> {
  try {
    const known = knownRoster(team);
    if (!known?.everRead) return;
    const epoch = catalogEpochOf(known.roster);
    await sealCatalogAgain(team, epoch, teamRelays());
    const walletId = getAccountWalletId();
    if (walletId) {
      await saveCatalogKeys(walletId, channelCatalogOf(deriveCatalogReader(team, epoch), epoch));
    }
  } catch (error) {
    // The account closed meanwhile (its team keys wiped): at the next sync.
    logFailure("Bringing the catalogue to its epoch failed", error);
  }
}

/**
 * After active records were dated again (refreshRoster), their channels read once more: one
 * removed meanwhile, on another of the owner's devices, gets its record's removal again, dated
 * after the refreshed copy, which would otherwise replace it on the relays. Never rejects.
 */
async function verifyRefreshed(team: TeamKeys, refreshed: readonly RosterEntry[]): Promise<void> {
  const active = refreshed.filter(({ seat }) => !isRemovedSeat(seat));
  if (active.length === 0) return;
  try {
    const listed = active.map((entry) => ({ entry, keys: seatKeys(team, entry.seat) }));
    const relays = teamRelays();
    const channels = await fetchChannels(
      team,
      listed.map(({ entry, keys }) => ({ id: seatKey(entry.seat), keys })),
      relays
    );
    for (const { entry } of listed) {
      const found = channels?.get(seatKey(entry.seat));
      const removedAt = found ? channelRemoval(found) : null;
      if (removedAt !== null) await recordRemoval(team, entry.seat, removedAt, entry, [relays]);
    }
  } catch (error) {
    logFailure("Checking the refreshed records' channels failed", error);
  }
}

/**
 * Brings one member's channel in step (syncTeamChannels), unless it is removed (its removal is
 * recorded first) or of a newer format: the business's current details, dated again after a month,
 * only from what a majority of the relays hold. Up to date, it goes into `repairs` for the relays
 * not known to hold it (published once the team's lock is left, repairs.ts).
 */
async function syncChannel(
  team: TeamKeys,
  member: Seat,
  keys: SeatKeys,
  profile: ChannelProfile,
  relays: readonly string[],
  asked: readonly string[],
  found: NewestRecord<TeamChannel>,
  now: () => number,
  repairs: Repair[]
): Promise<void> {
  const { newest, newestUnreadable } = found;
  if (newestUnreadable !== null && newestUnreadable > (newest?.event.created_at ?? -1)) return;
  const current = newest?.value;
  if (current?.status === "removed") return;
  // The epoch an employee's channel names: never sealed nor raised below on this device.
  const walletId = getAccountWalletId();
  if (current?.status === "active" && current.exportEpoch && walletId) {
    noteOwnerEpoch(walletId, current.exportEpoch.epoch);
  }
  const at = now();
  const fresh = activeChannel(team, member, profile, relays, at);
  // The catalogue's epoch not known (no majority read the roster since the account opened): the
  // channel keeps the keys it carries.
  const withCatalog: TeamChannel =
    fresh.status === "active" &&
    member.role === "employee" &&
    !fresh.catalog &&
    current?.status === "active" &&
    current.catalog
      ? { ...fresh, catalog: current.catalog }
      : fresh;
  // The export epoch not known, or lower than the channel's (a device that did not read the
  // latest): the channel keeps the one it carries, an epoch is never lowered.
  const withEpoch: TeamChannel =
    withCatalog.status === "active" &&
    member.role === "employee" &&
    current?.status === "active" &&
    current.exportEpoch &&
    (withCatalog.exportEpoch?.epoch ?? 0) < current.exportEpoch.epoch
      ? { ...withCatalog, exportEpoch: current.exportEpoch }
      : withCatalog;
  // The other writers of numbers not known (no majority read the roster since the account opened):
  // the channel of an assistant that makes invoices keeps the invoicing it carries; without one,
  // none is written. One that makes none never has any (format 2).
  const invoices = member.role === "assistant" && member.invoicing !== false;
  const expected: TeamChannel =
    withEpoch.status === "active" &&
    invoices &&
    !withEpoch.invoicing &&
    current?.status === "active" &&
    current.invoicing
      ? { ...withEpoch, invoicing: current.invoicing }
      : withEpoch;
  if (expected.status === "active" && invoices && !expected.invoicing) return;
  const stale =
    !current || !sameChannel(current, expected) || at - current.updatedAt > CHANNEL_REFRESH_SECONDS;
  // A channel is only written from what a majority of the relays hold: a newer one (a removal
  // from another of the owner's devices) is on at least one of them.
  if (stale && found.copies.size < majority(asked.length)) return;
  if (stale) {
    const updatedAt = Math.max(at, (current?.updatedAt ?? 0) + 1);
    // A majority: written again at the next sync while it is stale on one (the read above).
    await publishToRelays(channelEvent(team, keys, { ...expected, updatedAt }), relayCall(team), {
      quorum: "majority"
    });
    return;
  }
  // Up to date: given to the relays not known to hold it: those that answered without it, those
  // that did not answer (the read stopped at a majority) and those not asked (a list changed since
  // the read). One that holds it, or a newer one, takes it again as nothing.
  const lacking = [
    ...[...found.copies]
      .filter(([, held]) => held === null || held < newest.event.created_at)
      .map(([relay]) => relay),
    ...relayCall(team).relays.filter((relay) => !found.copies.has(relay))
  ];
  if (lacking.length > 0) {
    repairs.push({ event: newest.event, call: { ...relayCall(team), relays: lacking } });
  }
}

function sameChannel(a: TeamChannel, b: TeamChannel): boolean {
  if (a.status === "removed" || b.status === "removed") return a.status === b.status;
  return (
    // An assistant that makes no invoices: format 2.
    a.version === b.version &&
    a.name === b.name &&
    a.role === b.role &&
    a.registryKey === b.registryKey &&
    a.registryReader === b.registryReader &&
    a.linkOwner === b.linkOwner &&
    // An older channel gets the link key reader.
    a.linkKeyReader === b.linkKeyReader &&
    sameRelayList(a.relays, b.relays) &&
    sameTeamProfile(a.profile, b.profile) &&
    // An older integration's channel gets this build's web app (checkout links).
    a.checkout?.origin === b.checkout?.origin &&
    // An older employee's channel gets the catalogue's reading keys, and those of its new epoch
    // after a removal.
    sameChannelCatalog(a.catalog, b.catalog) &&
    // The owner's tolerance of on-chain underpayments, changed.
    (a.onchainTolerance ?? 0) === (b.onchainTolerance ?? 0) &&
    // The merchant's own Bitcoin node, changed.
    sameBitcoinNode(a.bitcoinNode ?? null, b.bitcoinNode ?? null) &&
    // An assistant's invoicing: the settings it copies, the writers of numbers.
    JSON.stringify(a.invoicing ?? null) === JSON.stringify(b.invoicing ?? null) &&
    // An employee's export epoch, raised.
    JSON.stringify(a.exportEpoch ?? null) === JSON.stringify(b.exportEpoch ?? null)
  );
}
