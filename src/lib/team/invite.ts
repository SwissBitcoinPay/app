import { equalBytes } from "@noble/ciphers/utils.js";
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";

import { majority } from "@/config/registry";
import { INVITE_PATH, INVITE_VALIDITY_SECONDS } from "@/config/team";
import { base64UrlToBytes, bytesToBase64Url } from "@/lib/base64";
import type { NostrEvent } from "@/lib/nostr/event";
import { queryRelays } from "@/lib/nostr/pool";
import type { RelayChannel } from "@/lib/nostr/relay";
import {
  NewerRecordError,
  RECORD_KIND,
  newestRecord,
  openRecord,
  sealRecord
} from "@/lib/nostr/record";
import { currentRelays } from "@/lib/relays/current";
import { decodeRelayList, encodeRelayList } from "@/lib/relays/list";

import {
  deriveMemberKeys,
  inviteAddress,
  inviteAuthor,
  inviteId,
  memberSecret,
  type MemberKeys,
  type TeamKeys
} from "./keys";
import { TEAM_TIMEOUT_MS, isName, isPublicKey } from "./shared";

/*
 * Invitations: `<origin>/join#<id>.<key>.<relays>`, shown as a QR code by
 * the owner (the relays: the account's, where the invitation and the channel are, encodeRelayList).
 * The link opens one record on the relays, which gives the new member its secret. Valid for 48
 * hours (INVITE_VALIDITY_SECONDS; each record carries its own end, `expiresAt`, which is what
 * counts), and once: the device that joins replaces the record with a closed one, which no longer
 * holds the secret (relays keep only the latest event of an address); a majority of the relays
 * must take it before the device joins (member.ts), and the device's syncs give it to those that
 * missed it. Until then, the link is a bearer secret: whoever
 * opens it first gets the member's secret, read without using it. Like payment
 * links, the id and the key are in the URL fragment, which no web server receives; the relays only
 * see a hash of the id.
 */

/** What the record is (src/lib/nostr/record.ts). */
const RECORD_TYPE = "team-invite";

/** Format of the record's value. */
const INVITE_VERSION = 1;

export type InviteValue =
  | {
      version: typeof INVITE_VERSION;
      state: "open";
      /** The team's public key: the channel must be signed by it. */
      team: string;
      /** The member's secret, hex. */
      secret: string;
      /** The member's name, as the owner typed it. */
      name: string;
      /** Unix seconds: the end of the invitation. */
      expiresAt: number;
    }
  | {
      version: typeof INVITE_VERSION;
      /** Used by a device, or withdrawn by the owner. */
      state: "closed";
      team: string;
      expiresAt: number;
      /**
       * The device that used it (its id, hex), null when the owner withdrew it: of two devices
       * that used it at once, the one the relays keep (dated alike, the lowest event id, as every
       * relay keeps the same) is the member, the other one leaves.
       */
      device: string | null;
      /**
       * With `device`: its proof (deviceProof), which only a holder of the member's secret makes.
       * Whoever holds the link alone signs as the invitation's author (inviteAuthor), and could
       * otherwise name a device of its own and make the member's leave.
       */
      proof: string | null;
    };

/**
 * The proof that a holder of the member's secret closed the invitation for device `device` (hex):
 * an HMAC-SHA256 of the device's id with the member's invite.deviceKey, hex.
 */
export function deviceProof(keys: MemberKeys, device: string): string {
  return bytesToHex(hmac(sha256, keys.invite.deviceKey, hexToBytes(device)));
}

function parseInviteValue(value: unknown): InviteValue | null {
  if (value === null || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (typeof v.version === "number" && v.version > INVITE_VERSION) throw new NewerRecordError();
  if (
    v.version !== INVITE_VERSION ||
    !isPublicKey(v.team) ||
    typeof v.expiresAt !== "number" ||
    !Number.isSafeInteger(v.expiresAt)
  ) {
    return null;
  }
  if (v.state === "closed") {
    const device = v.device ?? null;
    if (device !== null && (typeof device !== "string" || !/^[0-9a-f]{32}$/.test(device))) {
      return null;
    }
    // A device comes with its proof (deviceProof).
    let proof: string | null = null;
    if (device !== null) {
      if (typeof v.proof !== "string" || !/^[0-9a-f]{64}$/.test(v.proof)) return null;
      proof = v.proof;
    }
    return {
      version: INVITE_VERSION,
      state: "closed",
      team: v.team,
      expiresAt: v.expiresAt,
      device,
      proof
    };
  }
  if (v.state !== "open" || typeof v.secret !== "string" || !/^[0-9a-f]{64}$/.test(v.secret)) {
    return null;
  }
  if (!isName(v.name)) return null;
  return {
    version: INVITE_VERSION,
    state: "open",
    team: v.team,
    secret: v.secret,
    name: v.name,
    expiresAt: v.expiresAt
  };
}

/**
 * The id and the key of an invitation's link, with the relays it names (unset: the device's, for
 * the device's own invitation).
 */
export type InviteLink = { id: Uint8Array; key: Uint8Array; relays?: readonly string[] };

const ID_LENGTH = 16;
const KEY_LENGTH = 32;

/**
 * The id, the key and the relays of an invitation link's fragment, `#<id>.<key>.<relays>` (with or
 * without "#"), the id and the key in canonical base64url, the relays as encodeRelayList writes
 * them. Null when malformed (a link cut short, one naming no relay, another fragment).
 */
export function parseInviteFragment(fragment: string): InviteLink | null {
  const [idText, keyText, relaysText, ...rest] = (
    fragment.startsWith("#") ? fragment.slice(1) : fragment
  ).split(".");
  if (
    rest.length > 0 ||
    idText === undefined ||
    keyText === undefined ||
    relaysText === undefined
  ) {
    return null;
  }
  const id = base64UrlToBytes(idText);
  const key = base64UrlToBytes(keyText);
  const relays = decodeRelayList(relaysText);
  return id?.length === ID_LENGTH && key?.length === KEY_LENGTH && relays !== null
    ? { id, key, relays }
    : null;
}

/** The invitation link of a fragment found anywhere in `text` (a scanned or pasted link). */
export function inviteLinkOf(text: string): InviteLink | null {
  const trimmed = text.trim();
  const hash = trimmed.indexOf("#");
  if (hash < 0) return null;
  const path = trimmed.slice(0, hash);
  // A link of this app's invitation page, whatever its origin (staging, a local build).
  if (!path.endsWith(INVITE_PATH)) return null;
  return parseInviteFragment(trimmed.slice(hash));
}

export type CreatedInvite = {
  url: string;
  /** The open invitation, published to every relay (again after a failure). */
  event: NostrEvent;
  expiresAt: number;
};

/**
 * The invitation of member `memberId`, on the web app at `origin`, on `relays` (the account's).
 * Everything derives from the team keys: the same member gives the same record (dated
 * `invitedAt`) and, on the same relays, the same link, so that the owner can show it again, from
 * any device, until it expires.
 */
export function createInvite({
  team,
  memberId,
  name,
  invitedAt,
  expiresAt = invitedAt + INVITE_VALIDITY_SECONDS,
  origin,
  relays
}: {
  team: TeamKeys;
  memberId: string;
  name: string;
  invitedAt: number;
  /**
   * Its end: INVITE_VALIDITY_SECONDS after `invitedAt` for a new invitation; for one shown again,
   * the end its record already has.
   */
  expiresAt?: number;
  origin: string;
  relays: readonly string[];
}): CreatedInvite {
  const secret = memberSecret(team, memberId);
  const keys = deriveMemberKeys(secret);
  const id = inviteId(keys.invite.nostr.publicKey, team.publicKey);
  const value: InviteValue = {
    version: INVITE_VERSION,
    state: "open",
    team: team.publicKey,
    secret: bytesToHex(secret),
    name,
    expiresAt
  };
  return {
    url: `${origin}${INVITE_PATH}#${bytesToBase64Url(id)}.${bytesToBase64Url(keys.invite.encryptionKey)}.${encodeRelayList(relays)}`,
    event: sealRecord({
      type: RECORD_TYPE,
      value,
      signer: keys.invite.nostr.secretKey,
      encryptionKey: keys.invite.encryptionKey,
      address: inviteAddress(id),
      createdAt: invitedAt,
      expiresAt
    }),
    expiresAt
  };
}

/**
 * The closed invitation that replaces the open one, dated after it (`openedAt`), so that relays
 * keep it instead:
 * - used by the device `device`: dated one second after the open one, whenever it joins, so that
 *   two devices using it at once write the same date and every relay keeps the same one of them
 *   (the lowest event id, NIP-01, as strfry does): that device is the member;
 * - withdrawn by the owner (`device` null): dated `closedAt`.
 */
export function closedInviteEvent(
  keys: MemberKeys,
  {
    team,
    expiresAt,
    openedAt,
    closedAt,
    device
  }: {
    team: string;
    expiresAt: number;
    openedAt: number;
    closedAt: number;
    device: string | null;
  }
): NostrEvent {
  const value: InviteValue = {
    version: INVITE_VERSION,
    state: "closed",
    team,
    expiresAt,
    device,
    proof: device === null ? null : deviceProof(keys, device)
  };
  return sealRecord({
    type: RECORD_TYPE,
    value,
    signer: keys.invite.nostr.secretKey,
    encryptionKey: keys.invite.encryptionKey,
    address: inviteAddress(inviteId(keys.invite.nostr.publicKey, team)),
    createdAt: device === null ? Math.max(closedAt, openedAt + 1) : openedAt + 1,
    expiresAt
  });
}

/** An invitation that can be used now. */
export type OpenInvite = {
  team: string;
  secret: Uint8Array;
  name: string;
  expiresAt: number;
  /** `created_at` of the open record: the closed one must be later. */
  openedAt: number;
};

export type InviteLookup =
  | { status: "open"; invite: OpenInvite }
  /** Used by a device (`device`, its id), or withdrawn (null). */
  | { status: "closed"; device: string | null }
  | { status: "expired" }
  /** Written by a newer version of the app. */
  | { status: "newer" }
  /** Relays answered, none with this invitation (a wrong link, or one expired long ago). */
  | { status: "notFound" }
  /** No relay answered in time. */
  | { status: "unreachable" };

/**
 * A check of the copies of the invitation whose id is `id` (openRecord's `parse`): its author and
 * its team give the id (whoever holds the link cannot make it name another
 * team); with the member's keys (`member`), a closed copy naming a device counts only with that
 * device's proof (deviceProof: whoever holds the link alone cannot name one); an open copy's secret
 * must be the one whose key signed it.
 */
function inviteParser(id: Uint8Array, member?: MemberKeys) {
  return (payload: unknown, event: NostrEvent): InviteValue | null => {
    const invite = parseInviteValue(payload);
    if (!invite || !equalBytes(inviteId(event.pubkey, invite.team), id)) return null;
    if (
      member &&
      invite.state === "closed" &&
      invite.device !== null &&
      invite.proof !== deviceProof(member, invite.device)
    ) {
      return null;
    }
    if (
      invite.state === "open" &&
      deriveMemberKeys(hexToBytes(invite.secret)).invite.nostr.publicKey !== event.pubkey
    ) {
      return null;
    }
    return invite;
  };
}

/** What readInvite found: the lookup, and the copy it comes from. */
export type InviteRead = {
  lookup: InviteLookup;
  /**
   * The closed invitation the lookup comes from, as signed, with its end and the relays that
   * answered without it (none, or the open one: they still give the member's secret to whoever
   * holds the link). Null for any other lookup.
   */
  closed: { event: NostrEvent; expiresAt: number; behind: string[] } | null;
};

/**
 * Reads the invitation of `link` on every relay: the newest valid copy wins (of two as old, the
 * lowest event id, as relays keep), so that a closed invitation stays closed. Only its author's
 * events are asked for (inviteAuthor): anyone's at its address could push it out of a relay's
 * answer, or pass for a record of a newer format. A copy is valid as inviteParser checks it.
 * `channel`: "single" until the device joined (member.ts, joinTeam). Never rejects.
 */
export async function readInvite(
  link: InviteLink,
  now: number,
  {
    relays = link.relays ?? currentRelays(),
    member,
    channel = "account"
  }: { relays?: readonly string[]; member?: MemberKeys; channel?: RelayChannel } = {}
): Promise<InviteRead> {
  const address = inviteAddress(link.id);
  const { publicKey: author, secretKey } = inviteAuthor(link.key);
  const answers = await queryRelays(
    { kinds: [RECORD_KIND], authors: [author], "#d": [address] },
    // As its author, whom the link gives: a relay may give an author's events to that author only
    // (NIP-42).
    { channel, relays, timeoutMs: TEAM_TIMEOUT_MS.waiting, authKey: secretKey },
    { quorum: "majority" }
  );
  // Fewer than a majority: a closed copy, or the one that names the device the relays keep, may be
  // on the others (a device leaves its team on it, member.ts). Nothing is told.
  if (answers.size < majority(relays.length)) {
    return { lookup: { status: "unreachable" }, closed: null };
  }
  const { newest, newestUnreadable, copies } = newestRecord(answers, (value) =>
    openRecord(value, {
      type: RECORD_TYPE,
      encryptionKey: link.key,
      address,
      author,
      parse: inviteParser(link.id, member)
    })
  );
  const lookup = inviteLookup(newest, newestUnreadable, now);
  if (lookup.status !== "closed" || !newest) return { lookup, closed: null };
  const behind = [...copies]
    .filter(([, held]) => held === null || held < newest.event.created_at)
    .map(([relay]) => relay);
  return {
    lookup,
    closed: { event: newest.event, expiresAt: newest.value.expiresAt, behind }
  };
}

/** The invitation of `link`, as readInvite reads it. Never rejects. */
export async function fetchInvite(
  link: InviteLink,
  now: number,
  options: { relays?: readonly string[]; member?: MemberKeys; channel?: RelayChannel } = {}
): Promise<InviteLookup> {
  return (await readInvite(link, now, options)).lookup;
}

function inviteLookup(
  newest: { event: NostrEvent; value: InviteValue } | null,
  newestUnreadable: number | null,
  now: number
): InviteLookup {
  if (newestUnreadable !== null && newestUnreadable > (newest?.event.created_at ?? -1)) {
    return { status: "newer" };
  }
  if (!newest) return { status: "notFound" };
  const invite = newest.value;
  if (invite.state === "closed") return { status: "closed", device: invite.device };
  if (invite.expiresAt <= now) return { status: "expired" };
  return {
    status: "open",
    invite: {
      team: invite.team,
      secret: hexToBytes(invite.secret),
      name: invite.name,
      expiresAt: invite.expiresAt,
      openedAt: newest.event.created_at
    }
  };
}

/**
 * The end of the invitation of each of `members` (the owner's: it holds their keys), as its record
 * on `relays` says, open or closed (INVITE_VALIDITY_SECONDS after it was made), read at once,
 * authenticated as each invitation's author. A member no relay gave a valid record of is left out;
 * a record of a newer format too. Null when no relay answered. Never rejects.
 */
export async function fetchInviteEnds(
  team: TeamKeys,
  members: readonly { id: string; keys: MemberKeys }[],
  relays: readonly string[],
  timeoutMs: number = TEAM_TIMEOUT_MS.background
): Promise<Map<string, number> | null> {
  if (members.length === 0) return new Map();
  const invites = members.map(({ id, keys }) => {
    const inviteIdOf = inviteId(keys.invite.nostr.publicKey, team.publicKey);
    return { id, keys, inviteIdOf, address: inviteAddress(inviteIdOf) };
  });
  const answers = await queryRelays(
    {
      kinds: [RECORD_KIND],
      authors: invites.map(({ keys }) => keys.invite.nostr.publicKey),
      "#d": invites.map(({ address }) => address)
    },
    {
      channel: "account",
      relays,
      timeoutMs,
      authKey: invites.map(({ keys }) => keys.invite.nostr.secretKey)
    },
    { quorum: "majority" }
  );
  if (answers.size === 0) return null;
  const ends = new Map<string, number>();
  for (const { id, keys, inviteIdOf, address } of invites) {
    const { newest, newestUnreadable } = newestRecord(answers, (value) =>
      openRecord(value, {
        type: RECORD_TYPE,
        encryptionKey: keys.invite.encryptionKey,
        address,
        author: keys.invite.nostr.publicKey,
        parse: inviteParser(inviteIdOf, keys)
      })
    );
    if (!newest || (newestUnreadable !== null && newestUnreadable > newest.event.created_at)) {
      continue;
    }
    ends.set(id, newest.value.expiresAt);
  }
  return ends;
}
