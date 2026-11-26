import { majority } from "@/config/registry";
import { DELETION_KIND, eventAddress, isDeletionOf } from "@/lib/nostr/deletion";
import type { NostrEvent } from "@/lib/nostr/event";
import { queryRelays, watchRelays } from "@/lib/nostr/pool";
import type { RelayChannel } from "@/lib/nostr/relay";
import {
  NewerRecordError,
  RECORD_KIND,
  newestRecord,
  openRecord,
  sealRecord,
  type NewestRecord
} from "@/lib/nostr/record";
import { parseBitcoinNode, type BitcoinNode } from "@/lib/onchain/node";
import { toleranceOf } from "@/lib/onchain/tolerance";
import { isCheckoutOrigin } from "@/lib/payment-link/checkout";
import { currentRelays } from "@/lib/relays/current";
import { parseRelayList } from "@/lib/relays/list";

import type { NostrKeys } from "@/lib/nostr/keys";
import { parseChannelCatalog, type ChannelCatalog } from "@/lib/catalog/reader";

import { parseChannelInvoicing, type ChannelInvoicing } from "./channel-invoicing";
import { isExportEpoch } from "./export-epoch";
import { usableTeamKeys, type MemberKeys, type TeamKeys } from "./keys";
import {
  TEAM_TIMEOUT_MS,
  isName,
  isUnixSeconds,
  parseTeamProfile,
  type TeamProfile
} from "./shared";

/*
 * A member's channel: one record per member, signed by the team, that the
 * member's device reads at launch and whenever it comes back to the foreground. It holds what the
 * device takes payments with (the business's name, Lightning address and currency) and whether the
 * member is still in the team. Only the member and the owner can read it; each member has its own,
 * so that removing one changes nothing for the others.
 */

/** What the record is (src/lib/nostr/record.ts). */
const RECORD_TYPE = "team-channel";

/** Format of the record's value. */
const CHANNEL_VERSION = 1;

/**
 * Format 2: an active channel of an assistant created without the
 * right to make invoices (its seat's format 4, src/lib/team/roster.ts), format 1 without
 * `invoicing`: nothing that numbers invoices nor says where their links open. Only such a channel
 * is written in it, every other in format 1: an app before then leaves it as it is (a channel of a
 * newer format), and an MCP server before then refuses it (sattleme/mcp-server, SPEC.md §5), as
 * neither could tell it from a damaged one.
 */
const NO_INVOICING_CHANNEL_VERSION = 2;

/** The format of an active channel: format 2 for an assistant that makes no invoices. */
export type ChannelVersion = typeof CHANNEL_VERSION | typeof NO_INVOICING_CHANNEL_VERSION;

/**
 * The roles of a team: the owner holds the wallet, employees only take payments, and
 * integrations only take payments through their integrator's server (docs/integrations.md). Each
 * has its own channel: an employee's device never reads an
 * integration's, nor an integration's server an employee's. An app older than integrations takes an
 * integration's channel for a damaged one: only the owner's devices and the integration's server
 * read it, and the owner's settings (format 6) are too new for such an app anyway. Assistants
 * make the business's invoices from a local MCP
 * server: an app from before then never writes their channel (their seat is of a format it does
 * not write over, src/lib/team/roster.ts) and takes it for a damaged one.
 */
export type MemberRole = "employee" | "integration" | "assistant";

/**
 * What reads and writes a channel: its `d` tag and NIP-44 key. A member's keys hold them
 * (deriveMemberKeys), as an integration's (deriveIntegrationKeys of src/lib/integrations/keys.ts).
 */
export type ChannelHolder = Pick<MemberKeys, "channel">;

export type TeamChannel =
  | {
      /** 2 for an assistant that makes no invoices, without `invoicing`; 1 otherwise. */
      version: ChannelVersion;
      status: "active";
      name: string;
      role: MemberRole;
      profile: TeamProfile;
      /** Hex, 32 bytes: the business's registry key (src/lib/registry/). */
      registryKey: string;
      /** Hex: the public half of the business's reading key of the registry. */
      registryReader: string;
      /** Hex: the public half of the business's link owner key (src/lib/payment-link/owner-key.ts). */
      linkOwner: string;
      /**
       * Hex: the public half of the business's link key reader (deriveLinkKeyReader), which the
       * member's device seals its payment links' keys for. An employee's
       * and an assistant's. Absent from the channels of apps before then: the device seals them
       * for `registryReader`, as before. An optional field: apps and servers before then ignore it,
       * no new version.
       */
      linkKeyReader?: string;
      /**
       * The business's relays: the member's device makes them its own,
       * and finds its channel there afterwards.
       */
      relays: string[];
      /**
       * An integration's: the web app its server sends customers to (checkout links,
       * src/lib/payment-link/checkout.ts), named by an owner's app that has
       * one (staging). Absent from the channels of apps before then, of an app without a web app
       * (production) and of employees. An optional field: the integrations' servers of before
       * ignore it (checkout-spec, SPEC.md §14), no new version.
       */
      checkout?: { origin: string };
      /**
       * An employee's: the catalogue's reading keys (CatalogReader of keys.ts), so that its point
       * of sale lists the business's articles: those
       * of the catalogue's current epoch, which a removal changes (catalogEpochKey), never the
       * author's secret. Absent from the channels of apps before then and of integrations: the
       * point of sale has no articles then. An optional field: apps before then ignore it, no new
       * version.
       */
      catalog?: ChannelCatalog;
      /**
       * The owner's tolerance of on-chain underpayments (basis points:
       * src/lib/onchain/tolerance.ts), which the member's point of sale, or the integration's
       * server (checkout-spec SPEC.md §14, `onchainTolerance`), judges each new sale with. Beside
       * the profile, never in it: the point of sale never shows it. Absent when none, and from the
       * channels of apps before then; an absent or invalid one reads as none. An optional field:
       * apps and servers before then ignore it (they ask the whole amount), no new version.
       */
      onchainTolerance?: number;
      /**
       * The merchant's own Bitcoin node (src/lib/onchain/node.ts):
       * where an employee's point of sale reads the chain, and an integration's server too
       * (checkout-spec, its version that names it); absent for mempool.space and from the channels
       * of apps before then. Absent or invalid reads as mempool.space. An optional field: apps and
       * servers before then ignore it and read mempool.space, no new version.
       */
      bitcoinNode?: BitcoinNode;
      /**
       * An assistant's, and only its (src/lib/team/channel-invoicing.ts): what its invoices print,
       * the web app of their payment links and the shared counter of their numbers. Required in an
       * assistant's channel of format 1, never in one of format 2 (it makes no invoice); another
       * role's is never read.
       */
      invoicing?: ChannelInvoicing;
      /**
       * An employee's: the account's export epoch (src/lib/team/export-epoch.ts), once the owner
       * withdrew an export grant: its device seals its own records
       * and its sales' declarations at it (ChannelEpoch). Absent at epoch 0, and from the channels
       * of apps before then. An optional field: apps before then ignore it (they seal as before
       * epochs), no new version; an invalid one reads as none.
       */
      exportEpoch?: ChannelEpoch;
      /** Unix seconds, strictly increasing: the record's `created_at`. */
      updatedAt: number;
    }
  | {
      version: typeof CHANNEL_VERSION;
      /** Removed from the team: the device forgets the business. Nothing else is told. */
      status: "removed";
      updatedAt: number;
    };

/** At most this many epochs in a channel's `exportEpoch`: the latest ones. */
export const MAX_CHANNEL_EPOCHS = 16;

/**
 * What an employee's channel gives of the export epochs: the account's (`epoch`, ≥ 1, the last of
 * `epochs`), and for each of the latest ones the key of the employee's own records at it
 * (exportEpochKey, hex) and the registry's reading key of it (its public half, hex): its device
 * seals at the last, and opens what it sealed at the others.
 */
export type ChannelEpoch = {
  epoch: number;
  epochs: { epoch: number; key: string; reader: string }[];
};

const HEX_32 = /^[0-9a-f]{64}$/;

/** A channel's `exportEpoch`, checked whole; null otherwise (as none). */
export function parseChannelEpoch(value: unknown): ChannelEpoch | null {
  if (value === null || typeof value !== "object") return null;
  const { epoch, epochs } = value as Record<string, unknown>;
  if (!isExportEpoch(epoch) || epoch < 1 || !Array.isArray(epochs)) return null;
  if (epochs.length < 1 || epochs.length > MAX_CHANNEL_EPOCHS) return null;
  const read: ChannelEpoch["epochs"] = [];
  for (const entry of epochs) {
    if (entry === null || typeof entry !== "object") return null;
    const { epoch: at, key, reader } = entry as Record<string, unknown>;
    if (!isExportEpoch(at) || at < 1 || typeof key !== "string" || !HEX_32.test(key)) return null;
    if (typeof reader !== "string" || !HEX_32.test(reader)) return null;
    // Ascending, each epoch once, the account's last.
    if (read.length > 0 && at <= read[read.length - 1]!.epoch) return null;
    read.push({ epoch: at, key, reader });
  }
  return read[read.length - 1]!.epoch === epoch ? { epoch, epochs: read } : null;
}

function isRole(value: unknown): value is MemberRole {
  return value === "employee" || value === "integration" || value === "assistant";
}

function parseChannel(value: unknown, event: NostrEvent): TeamChannel | null {
  if (value === null || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (typeof v.version === "number" && v.version > NO_INVOICING_CHANNEL_VERSION) {
    throw new NewerRecordError();
  }
  const noInvoicing = v.version === NO_INVOICING_CHANNEL_VERSION;
  if ((v.version !== CHANNEL_VERSION && !noInvoicing) || !isUnixSeconds(v.updatedAt)) return null;
  if (v.updatedAt !== event.created_at) return null;
  // Removed: always written in format 1 (an app before format 2 reads it, as every MCP server).
  if (v.status === "removed" && !noInvoicing) {
    return { version: CHANNEL_VERSION, status: "removed", updatedAt: v.updatedAt };
  }
  const profile = parseTeamProfile(v.profile);
  if (v.status !== "active" || !isName(v.name) || !isRole(v.role) || !profile) return null;
  // Format 2 is an assistant's only.
  if (noInvoicing && v.role !== "assistant") return null;
  if (typeof v.registryKey !== "string" || !/^[0-9a-f]{64}$/.test(v.registryKey)) return null;
  if (typeof v.registryReader !== "string" || !/^[0-9a-f]{64}$/.test(v.registryReader)) {
    return null;
  }
  if (typeof v.linkOwner !== "string" || !/^[0-9a-f]{64}$/.test(v.linkOwner)) return null;
  // Absent or invalid: none, and the channel stays valid (the links' keys sealed as before).
  const linkKeyReader =
    typeof v.linkKeyReader === "string" && /^[0-9a-f]{64}$/.test(v.linkKeyReader)
      ? v.linkKeyReader
      : null;
  const relays = parseRelayList(v.relays);
  if (relays === null) return null;
  // Invalid, it names no web app, and the channel stays valid (SPEC.md §14).
  const origin = (v.checkout as { origin?: unknown } | null | undefined)?.origin;
  const checkout = isCheckoutOrigin(origin) ? { origin } : undefined;
  // Invalid, the point of sale has no articles, and the channel stays valid.
  const catalog = v.catalog === undefined ? null : parseChannelCatalog(v.catalog);
  // Absent or invalid: none, and the channel stays valid (SPEC.md §14).
  const onchainTolerance = toleranceOf(v.onchainTolerance);
  // Absent or invalid: mempool.space, and the channel stays valid.
  const bitcoinNode = parseBitcoinNode(v.bitcoinNode);
  // An assistant's channel of format 1 holds it whole, or is not one; one of format 2 never has it
  // (left aside), nor another role's.
  const invoicing =
    v.role === "assistant" && !noInvoicing ? parseChannelInvoicing(v.invoicing) : null;
  if (v.role === "assistant" && !noInvoicing && invoicing === null) return null;
  // An employee's only; absent or invalid: none, and the channel stays valid.
  const exportEpoch = v.role === "employee" ? parseChannelEpoch(v.exportEpoch) : null;
  return {
    version: noInvoicing ? NO_INVOICING_CHANNEL_VERSION : CHANNEL_VERSION,
    status: "active",
    name: v.name,
    role: v.role,
    profile,
    registryKey: v.registryKey,
    registryReader: v.registryReader,
    linkOwner: v.linkOwner,
    ...(linkKeyReader ? { linkKeyReader } : {}),
    relays,
    ...(checkout ? { checkout } : {}),
    ...(catalog ? { catalog } : {}),
    ...(onchainTolerance > 0 ? { onchainTolerance } : {}),
    ...(bitcoinNode ? { bitcoinNode } : {}),
    ...(invoicing ? { invoicing } : {}),
    ...(exportEpoch ? { exportEpoch } : {}),
    updatedAt: v.updatedAt
  };
}

/** The channel's record, signed by the team. */
export function channelEvent(
  team: TeamKeys,
  keys: ChannelHolder,
  channel: TeamChannel
): NostrEvent {
  return sealRecord({
    type: RECORD_TYPE,
    value: channel,
    signer: usableTeamKeys(team).secretKey,
    encryptionKey: keys.channel.encryptionKey,
    address: keys.channel.address,
    createdAt: channel.updatedAt
  });
}

function openChannel(value: unknown, teamPublicKey: string, keys: ChannelHolder) {
  return openRecord(value, {
    type: RECORD_TYPE,
    encryptionKey: keys.channel.encryptionKey,
    address: keys.channel.address,
    author: teamPublicKey,
    parse: parseChannel
  });
}

export type ChannelLookup =
  | { status: "found"; channel: TeamChannel }
  /** Written by a newer version of the app. */
  | { status: "newer" }
  | { status: "notFound" }
  /**
   * The team deleted it: no relay that answered holds it, and one holds the team's deletion request
   * naming it (NIP-09, "Delete account" of the owner, src/features/settings/account-erasure.ts).
   */
  | { status: "deleted" }
  | { status: "unreachable" };

/**
 * The member's channel on the relays: the newest copy signed by the team `teamPublicKey`, unless
 * the team deleted it since ("deleted": a deletion request it signed naming the channel, as late as
 * the newest copy at least, from any relay: its signature proves it). A relay that asks to
 * authenticate gets the member's key, or the connection's own key (relay.ts) for whoever holds no
 * key of its own (an integration's server, as docs/integrations.md reads it). `channel`: "single"
 * until the device joined (member.ts, previewInvite). Never rejects.
 */
export async function fetchChannel(
  teamPublicKey: string,
  keys: ChannelHolder & { nostr?: NostrKeys },
  timeoutMs: number = TEAM_TIMEOUT_MS.background,
  relays: readonly string[] = currentRelays(),
  channel: RelayChannel = "account"
): Promise<ChannelLookup> {
  const call = {
    channel,
    relays,
    timeoutMs,
    authKey: keys.nostr?.secretKey
  };
  const address = eventAddress(RECORD_KIND, teamPublicKey, keys.channel.address);
  const [answers, deletions] = await Promise.all([
    queryRelays(
      { kinds: [RECORD_KIND], authors: [teamPublicKey], "#d": [keys.channel.address] },
      call,
      { quorum: "majority" }
    ),
    // The team's deletion requests naming the channel ("Delete account"): relays keep them.
    queryRelays({ kinds: [DELETION_KIND], authors: [teamPublicKey], "#a": [address] }, call, {
      quorum: "majority"
    })
  ]);
  if (answers.size === 0 && deletions.size === 0) return { status: "unreachable" };
  const { newest, newestUnreadable } = newestRecord(answers, (value) =>
    openChannel(value, teamPublicKey, keys)
  );
  // Deleted at or after the newest copy a relay still sent (one that missed the request).
  const deletedAt = Math.max(
    -1,
    ...[...deletions.values()]
      .flat()
      .filter((value) => isDeletionOf(value, teamPublicKey, address))
      .map((value) => (value as NostrEvent).created_at)
  );
  const latest = Math.max(newest?.event.created_at ?? -1, newestUnreadable ?? -1);
  if (deletedAt >= 0 && deletedAt >= latest) return { status: "deleted" };
  if (answers.size === 0) return { status: "unreachable" };
  // Fewer than a majority: a newer copy may be on the others. Only a removal tells anything then:
  // it is final (owner.ts).
  if (answers.size < majority(relays.length) && newest?.value.status !== "removed") {
    return { status: "unreachable" };
  }
  if (newestUnreadable !== null && newestUnreadable > (newest?.event.created_at ?? -1)) {
    return { status: "newer" };
  }
  return newest ? { status: "found", channel: newest.value } : { status: "notFound" };
}

/**
 * Keeps a subscription open on `relays` to the member's channel (watchRelays): each copy signed by
 * the team `teamPublicKey` that opens goes to `onChannel` as soon as a relay sends it, those the
 * relays hold first, then each one published later (each copy once, whichever relay sends it).
 * Until the returned function is called.
 */
export function watchChannel(
  teamPublicKey: string,
  keys: MemberKeys,
  onChannel: (channel: TeamChannel) => void,
  relays: readonly string[] = currentRelays()
): () => void {
  return watchRelays(
    { kinds: [RECORD_KIND], authors: [teamPublicKey], "#d": [keys.channel.address] },
    {
      channel: "account",
      relays,
      timeoutMs: TEAM_TIMEOUT_MS.background,
      authKey: keys.nostr.secretKey
    },
    (event) => {
      const opened = openChannel(event, teamPublicKey, keys);
      if (opened?.status === "ok") onChannel(opened.value);
    }
  );
}

/**
 * The channels of several members at once, for the owner (one query): per member, the newest copy
 * and what each relay holds. Never rejects: null when no relay answered.
 */
export async function fetchChannels(
  team: TeamKeys,
  members: readonly { id: string; keys: ChannelHolder }[],
  relays: readonly string[] = currentRelays()
): Promise<Map<string, NewestRecord<TeamChannel>> | null> {
  if (members.length === 0) return new Map();
  const answers = await queryRelays(
    {
      kinds: [RECORD_KIND],
      authors: [team.publicKey],
      "#d": members.map(({ keys }) => keys.channel.address)
    },
    {
      channel: "account",
      relays,
      timeoutMs: TEAM_TIMEOUT_MS.background,
      authKey: () => usableTeamKeys(team).secretKey
    },
    { quorum: "majority" }
  );
  if (answers.size === 0) return null;
  return new Map(
    members.map(({ id, keys }) => [
      id,
      newestRecord(answers, (value) => openChannel(value, team.publicKey, keys))
    ])
  );
}
