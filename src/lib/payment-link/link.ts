import { schnorr } from "@noble/curves/secp256k1.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, concatBytes, hexToBytes, utf8ToBytes } from "@noble/hashes/utils.js";

import { majority } from "@/config/registry";
import { base64UrlToBytes, bytesToBase64Url } from "@/lib/base64";
import type { NostrEvent } from "@/lib/nostr/event";
import { randomNostrKeys } from "@/lib/nostr/keys";
import {
  eachRelayAnswer,
  publishToQuorum,
  queryRelays,
  watchRelays,
  type RelayLookup
} from "@/lib/nostr/pool";
import { RECORD_KIND, openRecord, sealRecord } from "@/lib/nostr/record";
import { secureRandomBytes } from "@/lib/random";
import { currentRelays } from "@/lib/relays/current";
import { decodeRelayList, encodeRelayList } from "@/lib/relays/list";
import { nowUnix } from "@/lib/rates/snapshot";

import type { FinalPayload } from "./final";
import { saleOwnerPublicKey, saleOwnerSecretKey } from "./owner-key";
import { parsePaymentLinkPayload, type PaymentLinkPayload, type SharedLink } from "./payload";

/*
 * Payment links: a sale of the point of sale shared as `<origin>/pay#<author>.<key>.<relays>`
 * (the relays: the device's list when the link was made, encodeRelayList). Its payload (payload.ts)
 * goes to public Nostr relays as one sealed record (src/lib/nostr/record.ts),
 * encrypted with the sale's own key (Sale.key), which also gives the keys its invoices are
 * declared with (src/lib/registry/). The author and the key travel in the URL fragment, which
 * browsers never send to the server: the web app's host sees neither, and only those who hold the
 * link can read the sale. The relays see a hash of the sale's key (they find the event by it),
 * never the key.
 *
 * The event is signed by a key made for this link, whose public half is in the URL: the payer's
 * page asks the relays for that author's events only (`authors`), so that
 * events others publish at the link's address (whoever holds the link can) never push it out of
 * what a relay sends back (relays cap their answers: strfry, 500 events per filter by default).
 * Holding the link is not enough to publish another sale under it. Its final version (final.ts) is
 * signed by the same key, or by the owner's key of the sale (owner-key.ts), computed from the owner
 * key the link itself names, and asked for by that author too. Its address (`d` tag) is a hash of
 * the sale's key. No link expires: a payer finds the page of a payment
 * years later.
 */

/** NIP-78: arbitrary app data, as the settings backups (the relays keep this kind). */
export const PAYMENT_LINK_KIND = RECORD_KIND;

/** What the record is (record.ts). */
const RECORD_TYPE = "payment-link";

/** Prefix of the hash of the address of a sale's link, from the sale's key. */
const ADDRESS_PREFIX = utf8ToBytes("sattle.me/payment-link/address/v2");
/** Prefix of the hash of the address of the owner's final version of a link, from its author. */
const OWNER_FINAL_PREFIX = utf8ToBytes("sattle.me/payment-link/owner-final/v1");
/** A link's key (the sale's own), in bytes. */
const KEY_LENGTH = 32;

/** Path of the payer's page (src/app/pay.tsx); the link's author and key follow in the fragment. */
export const PAYMENT_LINK_PATH = "/pay";

/**
 * Per relay, connection included. The payer's page shows the first valid copy as soon as one
 * relay sends it; this only bounds the wait for a link no relay has.
 */
export const PAYMENT_LINK_TIMEOUT_MS = 10_000;

const HEX_32 = /^[0-9a-f]{64}$/;

/** The `d` tag of the link of the sale whose key is `saleKey`, and of its final version. */
export function saleLinkAddress(saleKey: Uint8Array): string {
  return bytesToHex(sha256(concatBytes(ADDRESS_PREFIX, saleKey)));
}

/** The `d` tag of the owner's final version of the link signed by `author` (hex). */
export function ownerFinalAddress(author: string): string {
  return bytesToHex(sha256(concatBytes(OWNER_FINAL_PREFIX, hexToBytes(author))));
}

/**
 * A link as its URL names it: its author's public key (hex, x-only) and the sale's key, with the
 * relays it is on (its URL's; unset: the device's).
 */
export type LinkRef = { kind: "sale"; author: string; key: Uint8Array; relays?: readonly string[] };

/**
 * The link of a URL's fragment, `#<author>.<key>.<relays>` (with or without "#"): the author's
 * 32-byte public key and the sale's 32-byte key, in canonical base64url, and its relays
 * (encodeRelayList). Null when malformed (a link cut short, one naming no relay, another
 * fragment). Base64url has no ".": the split is unambiguous.
 */
export function parsePaymentLinkFragment(fragment: string): LinkRef | null {
  const [first, text, relaysText, ...rest] = (
    fragment.startsWith("#") ? fragment.slice(1) : fragment
  ).split(".");
  if (rest.length > 0 || first === undefined || text === undefined) return null;
  const key = base64UrlToBytes(text);
  if (key?.length !== KEY_LENGTH) return null;
  if (relaysText === undefined) return null;
  const relays = decodeRelayList(relaysText);
  if (relays === null) return null;
  const author = base64UrlToBytes(first);
  return author?.length === 32 ? { kind: "sale", author: bytesToHex(author), key, relays } : null;
}

export type PaymentLink = {
  /** Hex: the public key of its author, which names it. */
  id: string;
  /** What the merchant shares: `<origin>/pay#<author>.<key>.<relays>`. */
  url: string;
  /** The relays it goes to, which its URL names: the device's when it was made. */
  relays: readonly string[];
  /** The signed event, published as is to every relay (again after a failure). */
  event: NostrEvent;
  /**
   * The link's own signing key: for the authentication a relay may ask before taking the event
   * (NIP-42), and for the final version. Never shared: with it, the event could be replaced.
   */
  secretKey: Uint8Array;
  /** Its decryption key, also in the URL: the sale's own key. */
  key: Uint8Array;
  payload: PaymentLinkPayload;
};

/**
 * The fragment of the link signed by `author` (hex), on `relays`: `#<author>.<key>.<relays>`, what
 * parsePaymentLinkFragment reads.
 */
export function paymentLinkFragment(
  author: string,
  key: Uint8Array,
  relays: readonly string[]
): `#${string}` {
  return `#${bytesToBase64Url(hexToBytes(author))}.${bytesToBase64Url(key)}.${encodeRelayList(relays)}`;
}

/** The URL of the link signed by `author` (hex) on the web app at `origin`, on `relays`. */
export function paymentLinkUrl(
  origin: string,
  author: string,
  key: Uint8Array,
  relays: readonly string[]
): string {
  return `${origin}${PAYMENT_LINK_PATH}${paymentLinkFragment(author, key, relays)}`;
}

/**
 * A new payment link for `payload`, on the web app at `origin`, sealed with `key` (the sale's own,
 * 32 bytes), on `relays` (the sale's: the device's when it was tapped). Its event does not expire.
 */
export function createPaymentLink(
  payload: PaymentLinkPayload,
  origin: string,
  now: number = nowUnix(),
  key: Uint8Array = secureRandomBytes(KEY_LENGTH),
  relays: readonly string[] = currentRelays()
): PaymentLink {
  if (key.length !== KEY_LENGTH) throw new Error("A payment link's key has 32 bytes");
  const { secretKey, publicKey } = randomNostrKeys();
  const id = publicKey;
  const event = sealRecord({
    type: RECORD_TYPE,
    value: payload,
    signer: secretKey,
    encryptionKey: key,
    address: saleLinkAddress(key),
    createdAt: now
  });
  return {
    id,
    url: paymentLinkUrl(origin, id, key, relays),
    relays: [...relays],
    event,
    secretKey,
    key,
    payload
  };
}

/** The payload of the final version of a link whose payload was `payload`. */
export function finalLinkPayload(
  payload: PaymentLinkPayload,
  final: FinalPayload
): PaymentLinkPayload {
  return { ...payload, onchainAddress: final.onchain?.address ?? null, final };
}

/**
 * The final version of a link, signed by its own author (`secretKey`, whose public key `final.link`
 * must be): at the link's address, dated after the link (`linkCreatedAt`), it replaces it on the
 * relays.
 */
export function finalLinkEvent(
  link: { secretKey: Uint8Array; key: Uint8Array; payload: PaymentLinkPayload },
  linkCreatedAt: number,
  final: FinalPayload,
  now: number = nowUnix()
): NostrEvent {
  return sealRecord({
    type: RECORD_TYPE,
    value: finalLinkPayload(link.payload, final),
    signer: link.secretKey,
    encryptionKey: link.key,
    address: saleLinkAddress(link.key),
    createdAt: Math.max(now, linkCreatedAt + 1)
  });
}

/**
 * The owner's final version of the link signed by `author`: when the
 * device that made the link does not publish one (an employee who left), signed with the owner's
 * key of the sale (owner-key.ts, from the secret of the business's link owner key), at its own
 * address.
 */
export function ownerFinalLinkEvent(
  ownerSecret: Uint8Array,
  author: string,
  saleKey: Uint8Array,
  payload: PaymentLinkPayload,
  final: FinalPayload,
  now: number = nowUnix()
): NostrEvent {
  return sealRecord({
    type: RECORD_TYPE,
    value: finalLinkPayload(payload, final),
    signer: saleOwnerSecretKey(ownerSecret, saleKey),
    encryptionKey: saleKey,
    address: ownerFinalAddress(author),
    createdAt: now
  });
}

/**
 * The very record `event` holds (a link of version 3, or a final version: its own author's, or the
 * owner's), signed again by `signer` (the key of its author: the link's own, sealed-key.ts, or the
 * owner's of its sale, owner-key.ts), dated `createdAt`, after it (strfry
 * refuses events over 3 years old, and a payer opens a link years later). Its value is never
 * changed, only checked: it opens with `saleKey` and the payer's page would take it. Null otherwise
 * (`signer` is not its author, another format, an earlier date).
 */
export function signedAgain(
  event: NostrEvent,
  saleKey: Uint8Array,
  signer: Uint8Array,
  createdAt: number,
  network: string
): NostrEvent | null {
  if (createdAt <= event.created_at) return null;
  let author: string;
  try {
    author = bytesToHex(schnorr.getPublicKey(signer));
  } catch {
    return null;
  }
  if (author !== event.pubkey) return null;
  const opened = openRecord(event, {
    type: RECORD_TYPE,
    encryptionKey: saleKey,
    address: () => true,
    author,
    parse: (payload) => (parsePaymentLinkPayload(payload, network) ? payload : null)
  });
  const address = event.tags.find(([name]) => name === "d")?.[1];
  if (opened?.status !== "ok" || address === undefined) return null;
  return sealRecord({
    type: RECORD_TYPE,
    value: opened.value,
    signer,
    encryptionKey: saleKey,
    address,
    createdAt
  });
}

/**
 * Publishes `event` (a link, or its final version, signed by `authKey`) to every relay, in
 * parallel. Resolves once a majority of them took it (the others go on in the background), rejects
 * as soon as they no longer can: the payer's page and the owner then find it on any majority.
 */
export function publishLinkEvent(
  event: NostrEvent,
  authKey: Uint8Array,
  relays: readonly string[] = currentRelays()
): Promise<void> {
  return publishToQuorum(
    event,
    { channel: "anonymous", relays, timeoutMs: PAYMENT_LINK_TIMEOUT_MS, authKey },
    majority(relays.length)
  );
}

/** Publishes the link's event to its relays: see publishLinkEvent. */
export function publishPaymentLink(
  link: PaymentLink,
  relays: readonly string[] = link.relays
): Promise<void> {
  return publishLinkEvent(link.event, link.secretKey, relays);
}

/** A copy of a link a relay sent, checked. */
export type LinkCopy = {
  link: SharedLink;
  event: NostrEvent;
  /** Whether it was signed by the link's own author or, for a final version, by the owner. */
  author: "link" | "owner";
};

function isFinal(copy: LinkCopy): boolean {
  return copy.link.kind === "sale" && copy.link.sale.final !== null;
}

/**
 * Whether `copy` is the owner's final version of a sale that received something (paid or
 * underpaid): what settles a sale its owner canceled and that was paid all the same (betterCopy).
 */
function isOwnerPaidFinal(copy: LinkCopy): boolean {
  return (
    copy.author === "owner" &&
    copy.link.kind === "sale" &&
    (copy.link.sale.final?.received ?? 0n) > 0n
  );
}

/**
 * Which of two copies of a link counts: a final version before any other; of two final versions,
 * the owner's that received something (isOwnerPaidFinal) before any other, then the first one made
 * (nothing updates a final version); else the newest.
 *
 * The owner's that received something first (a payment received is never hidden): a Lightning
 * invoice kept in a payer's wallet, or the sale's on-chain address, can still be paid once the
 * owner canceled the sale, and the owner's settlement of that sale then replaces the cancellation
 * (src/features/payment-link/finalize.ts, isProvisionalCancel). The owner's only: a link's own key
 * may be held by an employee removed since, whose cancellation it must never undo. The sattle.me
 * apps publish such a version only over a cancellation (existingFinal): elsewhere, the first made
 * counts as before. An app of before keeps the first made: it shows the cancellation until every
 * relay it reads holds the owner's settlement instead (the owner's final versions of a link share
 * one address, where a relay keeps the latest).
 */
export function betterCopy(current: LinkCopy | null, other: LinkCopy): LinkCopy {
  if (!current) return other;
  if (isFinal(current) !== isFinal(other)) return isFinal(other) ? other : current;
  if (isOwnerPaidFinal(current) !== isOwnerPaidFinal(other)) {
    return isOwnerPaidFinal(other) ? other : current;
  }
  const [a, b] = [current.event, other.event];
  if (a.created_at !== b.created_at) {
    const otherFirst = b.created_at < a.created_at;
    return isFinal(current) === otherFirst ? other : current;
  }
  return b.id < a.id ? other : current;
}

/**
 * The owner's key of the sale (owner-key.ts) whose link names `owner`; null for a key that is not
 * one (a link that would name it is refused).
 */
function ownerSigner(owner: string, key: Uint8Array): string | null {
  try {
    return saleOwnerPublicKey(owner, key);
  } catch {
    return null;
  }
}

/**
 * What a relay sent, if it is a copy of the link `ref` names: its payload must open with the
 * sale's key and be valid, signed by its author at the sale's address (the link, or its final
 * version naming its author); or, given `owner` (the owner key the link itself names), the owner's
 * final version, signed by the owner's key of this sale at its own address and naming the link's
 * author. Null otherwise.
 */
export function readLinkCopy(
  value: unknown,
  ref: LinkRef,
  network: string,
  owner: string | null = null
): LinkCopy | null {
  const { key } = ref;
  const address = saleLinkAddress(key);
  const ownerAddress = ownerFinalAddress(ref.author);
  const ownerKey = owner !== null ? ownerSigner(owner, key) : null;
  let author: LinkCopy["author"] = "link";
  const copy = openRecord(value, {
    type: RECORD_TYPE,
    encryptionKey: key,
    address: [address, ownerAddress],
    author: (publicKey) => HEX_32.test(publicKey),
    parse: (payload, event) => {
      const link = parsePaymentLinkPayload(payload, network);
      if (!link) return null;
      const tag = event.tags.find(([name]) => name === "d")?.[1];
      if (link.kind !== "sale") return null;
      const { final } = link.sale;
      if (tag === address) {
        // The link's author; its final version names it.
        if (event.pubkey !== ref.author) return null;
        return final === null || final.link === ref.author ? link : null;
      }
      if (
        final === null ||
        final.link !== ref.author ||
        ownerKey === null ||
        link.sale.owner !== owner ||
        event.pubkey !== ownerKey
      ) {
        return null;
      }
      author = "owner";
      return link;
    }
  });
  return copy?.status === "ok" ? { link: copy.value, event: copy.event, author } : null;
}

export type PaymentLinkLookup = RelayLookup<SharedLink>;

/**
 * Asks every relay for the link `ref` names, in parallel, and resolves with the first valid copy,
 * without waiting for the others. Only its author's events are asked for (`authors`), then, once
 * a copy names the owner key, the owner's final version, of the owner's key of the sale: events
 * others publish at the link's address never count. `network` is the BOLT11 prefix the invoices
 * must have. A better copy that comes afterwards (betterCopy: a final version) goes to `onBetter`.
 * Never rejects: "notFound" when a majority of the relays answered without a valid copy (a wrong
 * link: a link is published to a majority, publishLinkEvent), "unreachable" when fewer did.
 */
export function fetchPaymentLink(
  ref: LinkRef,
  network: string,
  {
    relays = ref.relays ?? currentRelays(),
    timeoutMs = PAYMENT_LINK_TIMEOUT_MS,
    onBetter
  }: {
    relays?: readonly string[];
    timeoutMs?: number;
    onBetter?: (link: SharedLink) => void;
  } = {}
): Promise<PaymentLinkLookup> {
  // Relays that ask for authentication get the connection's own key (relay.ts).
  const call = { channel: "anonymous" as const, relays, timeoutMs };
  return new Promise((resolve) => {
    let best: LinkCopy | null = null;
    let resolved = false;
    let ownerAsked = false;
    const take = (copies: (LinkCopy | null)[]) => {
      const before = best;
      for (const copy of copies) if (copy) best = betterCopy(best, copy);
      if (!best || best === before) return;
      if (!resolved) {
        resolved = true;
        resolve({ status: "found", value: best.link });
      } else {
        onBetter?.(best.link);
      }
    };
    const askOwner = (owner: string) => {
      if (ownerAsked) return;
      const signer = ownerSigner(owner, ref.key);
      if (signer === null) return;
      ownerAsked = true;
      void eachRelayAnswer(
        { kinds: [PAYMENT_LINK_KIND], authors: [signer], "#d": [ownerFinalAddress(ref.author)] },
        call,
        (_, events) => take(events.map((value) => readLinkCopy(value, ref, network, owner))),
        undefined,
        { quorum: "majority" }
      );
    };
    const filter = {
      kinds: [PAYMENT_LINK_KIND],
      authors: [ref.author],
      "#d": [saleLinkAddress(ref.key)]
    };
    void eachRelayAnswer(
      filter,
      call,
      (_, events) => {
        const copies = events.map((value) => readLinkCopy(value, ref, network));
        take(copies);
        // The link names the owner key: a final version may be the owner's (of two, the first made
        // counts, betterCopy).
        for (const copy of copies) {
          if (copy?.link.kind === "sale") askOwner(copy.link.sale.owner);
        }
      },
      undefined,
      // A final version a relay sends later than the majority's grace reaches the page's watch
      // (watchLinkFinal).
      { quorum: "majority" }
    ).then((answered) => {
      if (resolved) return;
      const known = answered >= majority(new Set(relays).size);
      resolve({ status: known ? "notFound" : "unreachable" });
    });
  });
}

/**
 * Keeps a subscription open on the link's relays (watchRelays) to the final versions of the link of
 * version 3 `ref` names: its author's, and the owner's of the owner key `owner` (the key the copy
 * shown names). Each final version better than those seen before (betterCopy: of two, the first
 * made) goes to `onFinal` as soon as a relay sends it, those the relays hold first, then each one
 * published later (a payer's page learns at once that the owner canceled the
 * sale, or that another device settled it). Until the returned function is called.
 */
export function watchLinkFinal(
  ref: Extract<LinkRef, { kind: "sale" }>,
  owner: string,
  network: string,
  onFinal: (link: SharedLink) => void,
  {
    relays = ref.relays ?? currentRelays(),
    timeoutMs = PAYMENT_LINK_TIMEOUT_MS
  }: { relays?: readonly string[]; timeoutMs?: number } = {}
): () => void {
  const signer = ownerSigner(owner, ref.key);
  let best: LinkCopy | null = null;
  return watchRelays(
    {
      kinds: [PAYMENT_LINK_KIND],
      authors: signer === null ? [ref.author] : [ref.author, signer],
      "#d": [saleLinkAddress(ref.key), ownerFinalAddress(ref.author)]
    },
    // Relays that ask for authentication get the connection's own key (relay.ts).
    { channel: "anonymous", relays, timeoutMs },
    (event) => {
      const copy = readLinkCopy(event, ref, network, owner);
      if (!copy || !isFinal(copy)) return;
      const before = best;
      best = betterCopy(best, copy);
      if (best !== before) onFinal(best.link);
    }
  );
}

/** At most this many links per read: relays bound the size of a filter. */
const LINKS_PER_READ = 50;

/** The `pubkey` a relay sent with an event, unchecked. */
function pubkeyOf(value: unknown): string | undefined {
  const pubkey = (value as { pubkey?: unknown } | null)?.pubkey;
  return typeof pubkey === "string" ? pubkey : undefined;
}

/**
 * The copies the relays hold of the links `links` name (each its author and the sale's key), by
 * author: the link, or its final version by its author; for the owner, who learns each link's
 * author from its employee's records (src/lib/team/member-records.ts). Null when a read got no
 * answer.
 */
export async function fetchLinkCopies(
  links: readonly { author: string; key: Uint8Array }[],
  network: string,
  relays: readonly string[] = currentRelays()
): Promise<Map<string, LinkCopy[]> | null> {
  const result = new Map<string, LinkCopy[]>();
  for (let start = 0; start < links.length; start += LINKS_PER_READ) {
    const chunk = links.slice(start, start + LINKS_PER_READ);
    const answers = await queryRelays(
      {
        kinds: [PAYMENT_LINK_KIND],
        authors: chunk.map(({ author }) => author),
        "#d": chunk.map(({ key }) => saleLinkAddress(key))
      },
      {
        channel: "anonymous",
        relays,
        timeoutMs: PAYMENT_LINK_TIMEOUT_MS
      },
      { quorum: "majority" }
    );
    if (answers.size === 0) return null;
    const byAuthor = new Map(chunk.map((link) => [link.author, link]));
    const seen = new Set<string>();
    for (const events of answers.values()) {
      for (const value of events) {
        const link = byAuthor.get(pubkeyOf(value) ?? "");
        if (!link) continue;
        const copy = readLinkCopy(value, { kind: "sale", ...link }, network);
        if (!copy || seen.has(copy.event.id)) continue;
        seen.add(copy.event.id);
        result.set(link.author, [...(result.get(link.author) ?? []), copy]);
      }
    }
  }
  return result;
}

/**
 * The links among `links` (each its author, the sale's key and the owner key it names) whose
 * owner's final version is on a relay that answered, by author. Null when a read got no answer.
 */
export async function fetchOwnerFinals(
  links: readonly { author: string; key: Uint8Array; owner: string }[],
  network: string,
  relays: readonly string[] = currentRelays()
): Promise<Set<string> | null> {
  const finals = await fetchOwnerFinalCopies(links, network, relays);
  return finals === null ? null : new Set(finals.keys());
}

/**
 * The owner's final versions of the links among `links` (each its author, the sale's key and the
 * owner key it names) on the relays that answered, by author: of two, the one that counts
 * (betterCopy). Null when a read got no answer.
 */
export async function fetchOwnerFinalCopies(
  links: readonly { author: string; key: Uint8Array; owner: string }[],
  network: string,
  relays: readonly string[] = currentRelays()
): Promise<Map<string, LinkCopy> | null> {
  const lists = await fetchOwnerFinalLists(links, network, relays);
  if (lists === null) return null;
  const finals = new Map<string, LinkCopy>();
  for (const [author, copies] of lists) {
    finals.set(author, copies.reduce<LinkCopy | null>(betterCopy, null)!);
  }
  return finals;
}

/**
 * Every owner's final version of the links among `links` (each its author, the sale's key and the
 * owner key it names) on the relays that answered, by author (each event once): a relay that missed
 * the latest still sends the one it replaced (the owner's final versions of a link share one
 * address). Null when a read got no answer.
 */
export async function fetchOwnerFinalLists(
  links: readonly { author: string; key: Uint8Array; owner: string }[],
  network: string,
  relays: readonly string[] = currentRelays()
): Promise<Map<string, LinkCopy[]> | null> {
  const finals = new Map<string, LinkCopy[]>();
  for (let start = 0; start < links.length; start += LINKS_PER_READ) {
    const chunk = links.slice(start, start + LINKS_PER_READ);
    const signers = new Map<string, (typeof chunk)[number]>();
    for (const link of chunk) {
      const signer = ownerSigner(link.owner, link.key);
      if (signer !== null) signers.set(signer, link);
    }
    if (signers.size === 0) continue;
    const answers = await queryRelays(
      {
        kinds: [PAYMENT_LINK_KIND],
        authors: [...signers.keys()],
        "#d": chunk.map(({ author }) => ownerFinalAddress(author))
      },
      {
        channel: "anonymous",
        relays,
        timeoutMs: PAYMENT_LINK_TIMEOUT_MS
      },
      { quorum: "majority" }
    );
    if (answers.size === 0) return null;
    // One event goes to every relay: identical copies are checked once (a signature each).
    const seen = new Set<string>();
    for (const events of answers.values()) {
      for (const value of events) {
        const link = signers.get(pubkeyOf(value) ?? "");
        if (!link) continue;
        const raw = JSON.stringify(value) ?? "";
        if (seen.has(raw)) continue;
        seen.add(raw);
        const copy = readLinkCopy(value, { kind: "sale", ...link }, network, link.owner);
        if (copy?.author !== "owner") continue;
        const known = finals.get(link.author) ?? [];
        if (known.some(({ event }) => event.id === copy.event.id)) continue;
        finals.set(link.author, [...known, copy]);
      }
    }
  }
  return finals;
}

/**
 * The final version of the link signed by `author` (of the sale whose key is `saleKey`, naming
 * `owner`) the relays that answered hold, the link's own or the owner's (the one that counts,
 * betterCopy), with the relays that hold one: fewer than a majority, it is to be published again.
 * Null when fewer than a majority of `relays` answered: a final version is published to a majority
 * (publishFinal), so only a majority's answers tell there is none; one relay that answered
 * without it would have a second one published.
 */
export async function fetchFinalVersion(
  author: string,
  saleKey: Uint8Array,
  owner: string,
  network: string,
  relays: readonly string[] = currentRelays()
): Promise<{ final: LinkCopy | null; holders: string[] } | null> {
  const signer = ownerSigner(owner, saleKey);
  const answers = await queryRelays(
    {
      kinds: [PAYMENT_LINK_KIND],
      authors: signer === null ? [author] : [author, signer],
      "#d": [saleLinkAddress(saleKey), ownerFinalAddress(author)]
    },
    {
      channel: "anonymous",
      relays,
      timeoutMs: PAYMENT_LINK_TIMEOUT_MS
    },
    { quorum: "majority" }
  );
  if (answers.size < majority(relays.length)) return null;
  const ref: LinkRef = { kind: "sale", author, key: saleKey };
  let best: LinkCopy | null = null;
  const holders: string[] = [];
  for (const [relay, events] of answers) {
    let holds = false;
    for (const value of events) {
      const copy = readLinkCopy(value, ref, network, owner);
      if (!copy || !isFinal(copy)) continue;
      holds = true;
      best = betterCopy(best, copy);
    }
    if (holds) holders.push(relay);
  }
  return { final: best, holders };
}
