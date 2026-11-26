import { majority } from "@/config/registry";
import { epochSealFor } from "@/lib/nostr/epochs";
import { logFailure } from "@/lib/log/log";
import { parseOptionalImageRef, type ImageRef } from "@/lib/media/image";
import type { NostrEvent } from "@/lib/nostr/event";
import {
  copyEvents,
  publishAgain,
  publishToQuorum,
  publishToRelays,
  queryRelays,
  queryRelaysPaged,
  type RelayCall
} from "@/lib/nostr/pool";
import {
  NewerRecordError,
  RECORD_KIND,
  newestRecord,
  openRecord,
  sealRecord
} from "@/lib/nostr/record";

import { parseTaprootAddress } from "@/lib/onchain/address";
import { HOUR_SECONDS } from "@/lib/rates/sources";
import { toleranceOf } from "@/lib/onchain/tolerance";
import { currentRelays } from "@/lib/relays/current";
import { ONCHAIN_PAYMENT_DECLARATIONS } from "@/lib/registry/onchain-payments";
import { copyDeclarations, sumCopies, type DeclarationsCopy } from "@/lib/registry/registry";
import { parseRelayList } from "@/lib/relays/list";

import { recordAddress, type MemberKeys } from "./keys";
import { isIssueTag } from "./onchain-lot";
import { TEAM_TIMEOUT_MS, isUnixSeconds } from "./shared";

/*
 * What a member's device publishes, signed by the member's key and readable by the member and the
 * owner only: the device it joined on, its sales, the payment links it
 * made (the owner finds each by its author, src/features/payment-link/owner-finals.ts)
 * and its profile, its photo (the owner shows it in "Employees").
 * The `d` tags are HMACs of what each record is about: a relay cannot tell a sale from a device.
 *
 * The links' records have an author of their own (MemberKeys.links): the
 * owner finalizes the links of a whole year (owner-finals.ts), and reads them by that author alone,
 * without a year of sales (one record per invoice).
 *
 * The transactions a device saw paying its sales' on-chain addresses (RBF):
 * the explorers forget a transaction once replaced, BlockCypher keeps it by its txid, which only
 * those who saw it know. So that a replacement seen later, by this device or by the owner who
 * settles the sale, keeps the time of the payment it replaces (src/features/onchain/
 * useOnchainTimes.ts). Written by the business's devices only, never by a payer's page, and naming
 * a txid only: what it paid and when is BlockCypher's.
 */

const DEVICE_TYPE = "team-device";
const SALE_TYPE = "team-sale";
const ONCHAIN_SALE_TYPE = "team-sale-onchain";
const LINK_TYPE = "team-link";
const PROFILE_TYPE = "team-profile";
const SALE_TX_TYPE = "team-sale-tx";

const RECORD_VERSION = 1;

/**
 * The device the member joined on: the owner sees that the invitation was used, where and when,
 * and when the employee left with "Leave the business".
 */
export type MemberDevice = {
  version: typeof RECORD_VERSION;
  /** Random, made when the device joins: tells two devices of the same member apart. */
  deviceId: string;
  platform: "ios" | "android" | "web";
  joinedAt: number;
  /**
   * Unix seconds: when the employee left the business from this device, after `joinedAt`; the
   * record is then dated so, and replaces the one of its arrival. Absent while it stays. Optional,
   * the format unchanged: an older app ignores it (the employee shows as active).
   */
  leftAt?: number;
};

/** Whether the employee left the business from this device ("Leave the business"). */
export function hasLeft(device: MemberDevice): boolean {
  return device.leftAt !== undefined;
}

/**
 * A sale of the member's: the invoice its device showed, and what the wallet cannot know about it
 * (the fiat amount, the note). The owner's wallet tells whether it was paid; `paidAt` is what this
 * device saw (LUD-21).
 *
 * Above the most its Lightning address accepts, an hour of a sale shows its on-chain address alone
 * (src/features/terminal/useSale.ts): its record is then one of
 * another type (`team-sale-onchain`, at an address of its sale and hour), without an invoice
 * (`paymentHash` and `verifyUrl` null), with `hour`. An app from before ignores it (another type).
 */
export type MemberSale = SaleRecordFields &
  (
    | {
        /** Hex: the invoice's, as the owner's wallet lists its payments. */
        paymentHash: string;
        /** LUD-21 verify URL of the invoice. */
        verifyUrl: string;
        /**
         * The sale's on-chain address, from the employee's lot (onchain-lot.ts): the owner's
         * wallet lists its deposits by transaction, this ties them to the sale. Null for a
         * Lightning only sale.
         */
        onchainAddress: string | null;
      }
    | {
        paymentHash: null;
        verifyUrl: null;
        /** The address shown alone, never null so. */
        onchainAddress: string;
        /** Unix seconds (HH:00:00 UTC): the hour of the point its amount was fixed at. */
        hour: number;
      }
  );

/** What a device records of a sale (MemberSale), before its version and its address's tag. */
export type SaleRecordValue = MemberSale extends infer S
  ? S extends MemberSale
    ? Omit<S, "version" | "onchainTag">
    : never
  : never;

/** What every record of a sale says, besides the invoice it is of (MemberSale). */
type SaleRecordFields = {
  version: typeof RECORD_VERSION;
  /** Whole sats, as a decimal string (JSON has no bigint). */
  sats: string;
  /** The amount typed at the keypad, in minor units, with the digits of its currency. */
  fiat: { minor: number; digits: number; currency: string };
  note: string;
  /** Unix seconds: when the invoice (the address alone) was shown, and its end. */
  createdAt: number;
  expiresAt: number;
  /** When this device saw it paid; null otherwise. */
  paidAt: number | null;
  /**
   * The owner's tag of that address, from the employee's lot (onchain-lot.ts): the owner computes
   * it again to tell that it gave the address itself. Null without an address, or when the lot no
   * longer held it.
   */
  onchainTag: string | null;
  /**
   * Hex: the sale's registry identity (deriveSaleKeys of the sale's key: the author of its
   * declarations, its link's sale): ties the invoices of one sale together ("Wallet").
   */
  sale: string;
  /**
   * The sale seen underpaid by the device showing it ("Wallet" says "Underpaid" before any final
   * version), on the record of the invoice shown last: when it was
   * seen so (the record is dated then), the sats received, the sats due (null while the point of
   * the hour is not read: `received` + the rest asked, then, past the sale's end, the amount the
   * payments fell short of) and the transactions that paid the address. A record of the sale paid
   * afterwards prevails. Optional, the format unchanged: absent from older apps' records.
   */
  underpaid?: SaleUnderpaid;
  /**
   * Hex: the sale's own key, whose `sale` is its registry
   * identity: the owner's acceptance of the sale, paid short, is found by it
   * (src/lib/registry/sale-acceptance.ts), by the owner and by the employee's own list. Only the
   * device and the owner read the record, who hold it already. Optional, the format unchanged:
   * absent from older apps' records (such a sale cannot be accepted).
   */
  saleKey?: string;
  /**
   * The Lightning invoices that paid the sale, each with the preimage its payment revealed: their
   * proof, on its paid record, so
   * that an assistant allowed to export the transactions checks the sale without asking the
   * Lightning address. Optional, the format unchanged: absent from older apps' records, from a sale
   * not paid and from one paid on-chain alone.
   */
  lightning?: SaleProof[];
};

/** A Lightning invoice that paid a sale, and the preimage its payment revealed. */
export type SaleProof = { invoice: string; preimage: string };

/** Most Lightning payments a paid record names (as a payment link's final version). */
export const MAX_SALE_PROOFS = 50;

/** Longest invoice a proof names: a BOLT11 invoice of the Lightning address is far shorter. */
const MAX_PROOF_INVOICE_LENGTH = 4096;

/**
 * A paid record's proofs, checked as written (an array of at most MAX_SALE_PROOFS invoices, each
 * once, with a preimage of 64 hex digits); undefined when absent, null when invalid. Whether each
 * preimage is its invoice's, whoever reads the proof checks (the assistant's export): the owner's
 * wallet tells the owner.
 */
function parseProofs(value: unknown, paidAt: unknown): SaleProof[] | null | undefined {
  if (value === undefined) return undefined;
  if (paidAt === null || !Array.isArray(value) || value.length > MAX_SALE_PROOFS) return null;
  const proofs: SaleProof[] = [];
  for (const entry of value as unknown[]) {
    if (entry === null || typeof entry !== "object") return null;
    const { invoice, preimage } = entry as Record<string, unknown>;
    if (
      typeof invoice !== "string" ||
      invoice.length === 0 ||
      invoice.length > MAX_PROOF_INVOICE_LENGTH ||
      typeof preimage !== "string" ||
      !HEX_32.test(preimage) ||
      proofs.some((known) => known.invoice === invoice)
    ) {
      return null;
    }
    proofs.push({ invoice, preimage });
  }
  return proofs;
}

/**
 * Most transactions an underpayment names (MemberSale.underpaid): a record naming more is refused.
 * Its writers name the first ones only; those left out are still told by the device's records of
 * what it saw (`team-sale-tx`): "Wallet" shows the sale being confirmed rather than guess.
 */
export const MAX_UNDERPAID_TRANSACTIONS = 20;

/** What a device saw of an underpaid sale (MemberSale.underpaid): sats as decimal strings. */
export type SaleUnderpaid = {
  at: number;
  received: string;
  due: string | null;
  transactions: string[];
};

/**
 * A payment link the member made: its author (the key its URL names) and the sale's key, so that
 * the owner can publish its final version when the member's device does not (an employee who
 * left).
 */
export type MemberLink = {
  version: typeof RECORD_VERSION;
  /** Hex: the public key of the link's author. */
  link: string;
  /** Hex: the sale's key, the link's. */
  saleKey: string;
  /** Unix seconds: when the link was made. */
  createdAt: number;
  /**
   * The owner's tag of the sale's on-chain address (onchain-lot.ts): the owner vouches for an
   * on-chain payment of the link only with it. Null without an address.
   */
  onchainTag: string | null;
  /**
   * The relays of the link (its URL's: PaymentLink.relays), where the owner follows its sale and
   * publishes its final version.
   */
  relays: string[];
  /**
   * The link's own signing key, sealed for the owner alone (sealLinkKeyFor,
   * src/lib/payment-link/sealed-key.ts): the owner signs its final version
   * again each year.
   */
  sealedKey: string;
  /**
   * What `sealedKey` is sealed for: "link-key-reader", the business's link key
   * reader (deriveLinkKeyReader), which no export grant gives. Absent: the registry's reading key,
   * as the records of before (and of a device whose channel does not name the link key reader yet).
   * An optional field, the format unchanged: the owner's apps of before read the record (they no
   * longer open its key, which only a yearly signature of the link needs), and the assistants'
   * servers, which refuse a record of a newer version, still export its link.
   */
  sealedFor?: "link-key-reader";
  /**
   * The sale's tolerance of on-chain underpayments (basis points, src/lib/onchain/tolerance.ts):
   * the owner settles the sale with it, as the device that made it. Only
   * the device and the owner read it; never in the link, which its payer reads. Optional, the
   * format unchanged: absent when none, and from older apps' records, read as none.
   */
  tolerance?: number;
};

/** What the member shows of itself: its photo, which it picks on its device ("Settings"). */
export type MemberProfile = {
  version: typeof RECORD_VERSION;
  /** Its photo (src/lib/media/image.ts), null for its initials. */
  avatar: ImageRef | null;
  /** Unix seconds, strictly increasing: the record's `created_at`. */
  updatedAt: number;
};

function versionOf(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (typeof v.version === "number" && v.version > RECORD_VERSION) throw new NewerRecordError();
  return v.version === RECORD_VERSION ? v : null;
}

function parseDevice(value: unknown, event: NostrEvent): MemberDevice | null {
  const v = versionOf(value);
  if (
    !v ||
    typeof v.deviceId !== "string" ||
    !/^[0-9a-f]{32}$/.test(v.deviceId) ||
    (v.platform !== "ios" && v.platform !== "android" && v.platform !== "web") ||
    !isUnixSeconds(v.joinedAt)
  ) {
    return null;
  }
  // A departure is dated when it happened (deviceEvent), after the arrival.
  if (
    v.leftAt !== undefined &&
    (!isUnixSeconds(v.leftAt) || v.leftAt <= v.joinedAt || v.leftAt !== event.created_at)
  ) {
    return null;
  }
  return {
    version: RECORD_VERSION,
    deviceId: v.deviceId,
    platform: v.platform,
    joinedAt: v.joinedAt,
    ...(v.leftAt !== undefined ? { leftAt: v.leftAt } : {})
  };
}

const SATS = /^(0|[1-9][0-9]{0,15})$/;
/** The networks a sale's on-chain address may be of: mainnet, and regtest (parseSale). */
const SALE_NETWORKS = ["bc", "bcrt"] as const;
const HEX_32 = /^[0-9a-f]{64}$/;

/**
 * MemberSale.underpaid, of a record of an invoice shown at `createdAt`: undefined when absent, null
 * when invalid.
 */
export function parseUnderpaid(
  value: unknown,
  createdAt: number
): SaleUnderpaid | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (
    !isUnixSeconds(v.at) ||
    v.at < createdAt ||
    typeof v.received !== "string" ||
    !SATS.test(v.received) ||
    !(v.due === null || (typeof v.due === "string" && SATS.test(v.due))) ||
    !Array.isArray(v.transactions) ||
    v.transactions.length > MAX_UNDERPAID_TRANSACTIONS ||
    !v.transactions.every((txid) => typeof txid === "string" && HEX_32.test(txid))
  ) {
    return null;
  }
  return {
    at: v.at,
    received: v.received,
    due: v.due as string | null,
    transactions: [...(v.transactions as string[])]
  };
}

/** Whether `address` is a taproot address of a network a sale's may be of (SALE_NETWORKS). */
function isSaleAddress(address: unknown): address is string {
  return (
    typeof address === "string" &&
    SALE_NETWORKS.some((network) => parseTaprootAddress(address, network) === address)
  );
}

/**
 * What every record of a sale says (SaleRecordFields), checked; null when any of it is invalid.
 * `onchainAddress` and `onchainTag` are each type's own.
 */
function parseSaleFields(
  v: Record<string, unknown>
): Omit<SaleRecordFields, "version" | "onchainTag"> | null {
  const fiat = v.fiat as Record<string, unknown> | null | undefined;
  const underpaid = isUnixSeconds(v.createdAt) ? parseUnderpaid(v.underpaid, v.createdAt) : null;
  const lightning = parseProofs(v.lightning, v.paidAt);
  if (
    underpaid === null ||
    lightning === null ||
    typeof v.sale !== "string" ||
    !HEX_32.test(v.sale) ||
    typeof v.sats !== "string" ||
    !/^[1-9][0-9]{0,15}$/.test(v.sats) ||
    !fiat ||
    typeof fiat !== "object" ||
    !Number.isSafeInteger(fiat.minor) ||
    (fiat.minor as number) <= 0 ||
    !Number.isInteger(fiat.digits) ||
    (fiat.digits as number) < 0 ||
    (fiat.digits as number) > 4 ||
    typeof fiat.currency !== "string" ||
    !/^[A-Z]{3}$/.test(fiat.currency) ||
    typeof v.note !== "string" ||
    v.note.length > 200 ||
    !isUnixSeconds(v.createdAt) ||
    !isUnixSeconds(v.expiresAt) ||
    !(v.paidAt === null || isUnixSeconds(v.paidAt)) ||
    !(v.saleKey === undefined || (typeof v.saleKey === "string" && HEX_32.test(v.saleKey)))
  ) {
    return null;
  }
  return {
    sats: v.sats,
    fiat: {
      minor: fiat.minor as number,
      digits: fiat.digits as number,
      currency: fiat.currency
    },
    note: v.note,
    createdAt: v.createdAt,
    expiresAt: v.expiresAt,
    paidAt: v.paidAt as number | null,
    sale: v.sale,
    ...(underpaid !== undefined ? { underpaid } : {}),
    ...(typeof v.saleKey === "string" ? { saleKey: v.saleKey } : {}),
    ...(lightning !== undefined ? { lightning } : {})
  };
}

/** A record of an invoice of a sale (`team-sale`). */
function parseSale(value: unknown): MemberSale | null {
  const v = versionOf(value);
  const fields = v ? parseSaleFields(v) : null;
  if (
    !v ||
    !fields ||
    typeof v.paymentHash !== "string" ||
    !/^[0-9a-f]{64}$/.test(v.paymentHash) ||
    typeof v.verifyUrl !== "string" ||
    !v.verifyUrl.startsWith("https://") ||
    !(v.onchainAddress === null || isSaleAddress(v.onchainAddress)) ||
    !(v.onchainTag === null || (v.onchainAddress !== null && isIssueTag(v.onchainTag)))
  ) {
    return null;
  }
  return {
    version: RECORD_VERSION,
    ...fields,
    paymentHash: v.paymentHash,
    verifyUrl: v.verifyUrl,
    onchainAddress: v.onchainAddress,
    onchainTag: v.onchainTag as string | null
  };
}

/** A record of an hour of a sale that showed its address alone (`team-sale-onchain`). */
function parseOnchainSale(value: unknown): MemberSale | null {
  const v = versionOf(value);
  const fields = v ? parseSaleFields(v) : null;
  if (
    !v ||
    !fields ||
    !Number.isSafeInteger(v.hour) ||
    (v.hour as number) <= 0 ||
    (v.hour as number) % HOUR_SECONDS !== 0 ||
    !isSaleAddress(v.onchainAddress) ||
    !(v.onchainTag === null || isIssueTag(v.onchainTag))
  ) {
    return null;
  }
  return {
    version: RECORD_VERSION,
    ...fields,
    paymentHash: null,
    verifyUrl: null,
    onchainAddress: v.onchainAddress,
    hour: v.hour as number,
    onchainTag: v.onchainTag as string | null
  };
}

/**
 * What tells a sale's records apart among a member's (each has its own address): an invoice's
 * payment hash, or an hour of a sale shown with its address alone.
 */
export function saleRecordKey(sale: MemberSale): string {
  return sale.paymentHash ?? `onchain:${sale.sale}:${sale.hour}`;
}

function parseLink(value: unknown): MemberLink | null {
  const v = versionOf(value);
  const relays = parseRelayList(v?.relays);
  if (
    !v ||
    relays === null ||
    typeof v.link !== "string" ||
    !/^[0-9a-f]{64}$/.test(v.link) ||
    typeof v.saleKey !== "string" ||
    !/^[0-9a-f]{64}$/.test(v.saleKey) ||
    !isUnixSeconds(v.createdAt) ||
    !(v.onchainTag === null || isIssueTag(v.onchainTag)) ||
    // A NIP-44 payload of a 64-character text, as base64: opened by the owner only.
    typeof v.sealedKey !== "string" ||
    v.sealedKey.length > 400
  ) {
    return null;
  }
  return {
    version: RECORD_VERSION,
    link: v.link,
    saleKey: v.saleKey,
    createdAt: v.createdAt,
    onchainTag: v.onchainTag as string | null,
    relays,
    sealedKey: v.sealedKey,
    // Anything else: the registry's reading key, as before (the owner tries it, nothing more).
    ...(v.sealedFor === "link-key-reader" ? { sealedFor: "link-key-reader" as const } : {}),
    // Absent, or not a tolerance: none.
    ...(toleranceOf(v.tolerance) > 0 ? { tolerance: toleranceOf(v.tolerance) } : {})
  };
}

function parseProfile(value: unknown, event: NostrEvent): MemberProfile | null {
  const v = versionOf(value);
  const avatar = parseOptionalImageRef(v?.avatar);
  if (!v || avatar === undefined || !isUnixSeconds(v.updatedAt)) return null;
  if (v.updatedAt !== event.created_at) return null;
  return { version: RECORD_VERSION, avatar, updatedAt: v.updatedAt };
}

/** The `d` tag of the member's profile: one per member, the latest wins. */
function profileAddress(keys: MemberKeys): string {
  return recordAddress(keys, "profile");
}

export function profileEvent(keys: MemberKeys, profile: MemberProfile): NostrEvent {
  return sealRecord({
    type: PROFILE_TYPE,
    value: profile,
    signer: keys.nostr.secretKey,
    encryptionKey: keys.records.encryptionKey,
    address: profileAddress(keys),
    createdAt: profile.updatedAt,
    epoch: epochSealFor(keys.records.encryptionKey)
  });
}

/**
 * The profiles of several members (one query, authenticated as each of them, until a majority
 * answered), by member id: null for a member without one. Null when no relay answered (a photo
 * shown, nothing decided on it).
 */
export async function fetchProfiles(
  members: readonly { id: string; keys: MemberKeys }[],
  relays: readonly string[] = currentRelays()
): Promise<Map<string, MemberProfile | null> | null> {
  if (members.length === 0) return new Map();
  const answers = await queryRelays(
    {
      kinds: [RECORD_KIND],
      authors: members.map(({ keys }) => keys.nostr.publicKey),
      "#d": members.map(({ keys }) => profileAddress(keys))
    },
    membersCall(members, relays),
    { quorum: "majority" }
  );
  if (answers.size === 0) return null;
  return profilesOf(members, answers);
}

/**
 * The profiles of several members among what relays sent (fetchProfiles, or a read of their
 * authors made for something else: "Delete account"), by member id: null for a member
 * without one. Every copy is checked (openRecord).
 */
export function profilesOf(
  members: readonly { id: string; keys: MemberKeys }[],
  answers: Map<string, unknown[]>
): Map<string, MemberProfile | null> {
  return new Map(
    members.map(({ id, keys }) => {
      const { newest } = newestRecord(answers, (value) =>
        openRecord(value, {
          type: PROFILE_TYPE,
          encryptionKey: keys.records.encryptionKey,
          address: profileAddress(keys),
          author: keys.nostr.publicKey,
          parse: parseProfile
        })
      );
      return [id, newest?.value ?? null];
    })
  );
}

/** The `d` tag of the member's device record: one per member, the latest device wins. */
function deviceAddress(keys: MemberKeys): string {
  return recordAddress(keys, "device");
}

/**
 * The `d` tag of a sale's record: its invoice's, or, shown with its address alone, its sale's
 * (registry identity) and hour's. Never change them: the records of every device are there.
 */
function saleAddress(keys: MemberKeys, sale: MemberSale): string {
  return sale.paymentHash === null
    ? recordAddress(keys, `sale-onchain:${sale.sale}:${sale.hour}`)
    : recordAddress(keys, `sale:${sale.paymentHash}`);
}

function linkAddress(keys: MemberKeys, link: string): string {
  return recordAddress(keys, `link:${link}`);
}

/** A payment link's record, dated when the link was made, signed by the links' own author. */
export function linkEvent(keys: MemberKeys, link: MemberLink): NostrEvent {
  return sealRecord({
    type: LINK_TYPE,
    value: link,
    signer: keys.links.secretKey,
    encryptionKey: keys.records.encryptionKey,
    address: linkAddress(keys, link.link),
    createdAt: link.createdAt,
    epoch: epochSealFor(keys.records.encryptionKey)
  });
}

/**
 * A device's record: dated when it joined, or when the employee left (`leftAt`), so that the
 * departure replaces the arrival. An arrival can be dated later (`arrivalAt`), to replace a
 * departure that no majority of the relays took.
 */
export function deviceEvent(
  keys: MemberKeys,
  device: MemberDevice,
  arrivalAt: number = device.joinedAt
): NostrEvent {
  return sealRecord({
    type: DEVICE_TYPE,
    value: device,
    signer: keys.nostr.secretKey,
    encryptionKey: keys.records.encryptionKey,
    address: deviceAddress(keys),
    createdAt: device.leftAt ?? arrivalAt,
    epoch: epochSealFor(keys.records.encryptionKey)
  });
}

/**
 * The date of a sale's record: when it was paid, else when seen underpaid, else when shown, so that
 * each replaces the one before (its writer dates each later than the one before: a relay keeps the
 * latest version, and of two as old the lowest id).
 */
export function saleRecordDate(
  sale: Pick<MemberSale, "paidAt" | "underpaid" | "createdAt">
): number {
  return Math.max(sale.paidAt ?? sale.createdAt, sale.underpaid?.at ?? 0, sale.createdAt);
}

/**
 * A sale's record, dated by saleRecordDate: of its invoice (`team-sale`), or of an hour that showed
 * its address alone (`team-sale-onchain`, without the invoice's fields).
 */
export function saleEvent(keys: MemberKeys, sale: MemberSale): NostrEvent {
  let value: unknown = sale;
  if (sale.paymentHash === null) {
    const { paymentHash: _hash, verifyUrl: _url, ...onchain } = sale;
    value = onchain;
  }
  return sealRecord({
    type: sale.paymentHash === null ? ONCHAIN_SALE_TYPE : SALE_TYPE,
    value,
    signer: keys.nostr.secretKey,
    encryptionKey: keys.records.encryptionKey,
    address: saleAddress(keys, sale),
    createdAt: saleRecordDate(sale),
    epoch: epochSealFor(keys.records.encryptionKey)
  });
}

/**
 * Publishes a sale's record to every relay of `relays`: resolves once a majority took it (a later
 * reader of a majority meets it), rejects otherwise. For what must not be lost: the sale's verdict
 * (src/features/terminal/sale-follow.ts).
 */
export function publishSaleRecord(
  keys: MemberKeys,
  sale: MemberSale,
  relays: readonly string[] = currentRelays()
): Promise<void> {
  const event = saleEvent(keys, sale);
  return publishToQuorum(event, memberRecordCall(keys, event, relays), majority(relays.length));
}

/**
 * The `d` tags of what tells the owner of a member's device: its device record and its profile
 * (copied to the account's new relays at a change of them, owner.ts).
 */
export function memberStateAddresses(keys: MemberKeys): string[] {
  return [deviceAddress(keys), profileAddress(keys)];
}

/**
 * Copies member `keys`'s records since `since` (Unix seconds) from the relays `from` to `to`, as
 * they are (copyEvents): at a change of the business's relays, what its device recorded on the list
 * left (its sales, its links) goes where the owner now reads. Resolves with how many were copied,
 * null when no relay of `from` answered. Never rejects.
 */
export async function copyMemberRecords(
  keys: MemberKeys,
  since: number,
  from: readonly string[],
  to: readonly string[]
): Promise<number | null> {
  // Each author on its own: a relay may only take an author's events from that author (NIP-42).
  const copied = await Promise.all(
    [keys.nostr, keys.links].map(({ publicKey, secretKey }) =>
      copyEvents(
        { kinds: [RECORD_KIND], authors: [publicKey], since },
        {
          channel: "account",
          relays: from,
          timeoutMs: TEAM_TIMEOUT_MS.background,
          authKey: secretKey
        },
        to
      )
    )
  );
  return copied.every((count) => count === null)
    ? null
    : copied.reduce<number>((total, count) => total + (count ?? 0), 0);
}

/**
 * Copies the registry's declarations of member `keys`'s sales since `since` (Unix seconds), as they
 * are (copyDeclarations), from the relays `from` to `to`: at a change of the business's relays,
 * the device's sales declared on the list left before it followed (src/lib/registry/) go where
 * the owner reads them, with its records (copyMemberRecords), and the declarations of the
 * transactions its point of sale saw paying them (its `team-sale-tx` records, onchain-payments.ts).
 * `registryKey` is the business's, as
 * the device holds it; without the owner's reading key, every declaration at their addresses that
 * opens with it goes, its conflicts included. Its links' payments, declared by their payers' pages
 * on the links' own relays, are the owner's to copy (declarations-copy.ts). Resolves with what it
 * copied, null when no relay of `from` gave its records. Never rejects.
 */
export async function copyMemberDeclarations(
  keys: MemberKeys,
  registryKey: Uint8Array,
  network: string,
  since: number,
  from: readonly string[],
  to: readonly string[]
): Promise<DeclarationsCopy | null> {
  try {
    const records = await fetchMemberRecords(keys, since, from, { sales: true, links: false });
    if (!records) return null;
    const payments = await copyDeclarations(
      () => ({ key: registryKey }),
      // Only invoices are declared by their hash: the address alone, by its transactions below.
      records.sales.flatMap(({ paymentHash }) => (paymentHash === null ? [] : [paymentHash])),
      network,
      from,
      to
    );
    // The on-chain payments its point of sale declared: the transactions it saw paying them.
    const deposits = await copyDeclarations(
      () => ({ key: registryKey }),
      records.sightings.map(({ txid }) => txid),
      network,
      from,
      to,
      undefined,
      ONCHAIN_PAYMENT_DECLARATIONS
    );
    return sumCopies(payments, deposits);
  } catch (error) {
    logFailure("Copying the device's declarations failed", error);
    return null;
  }
}

/** Where the record of `txid` seen paying `address` is, among a member's records. */
export function saleTxAddress(keys: MemberKeys, address: string, txid: string): string {
  return recordAddress(keys, `sale-tx:${address}:${txid}`);
}

/** The record that this device saw `txid` paying `address`, a sale's, dated `now`. */
export function saleTxEvent(
  keys: MemberKeys,
  address: string,
  txid: string,
  now: number
): NostrEvent {
  return sealRecord({
    type: SALE_TX_TYPE,
    value: { version: RECORD_VERSION, address, txid },
    signer: keys.nostr.secretKey,
    encryptionKey: keys.records.encryptionKey,
    address: saleTxAddress(keys, address, txid),
    createdAt: now,
    epoch: epochSealFor(keys.records.encryptionKey)
  });
}

/**
 * Records that `txid` paid `address`, signed by `keys`: resolves once a majority of `relays` took
 * it (a later reader of a majority meets it), rejects otherwise.
 */
export function publishSaleTx(
  keys: MemberKeys,
  address: string,
  txid: string,
  now: number,
  relays: readonly string[] = currentRelays()
): Promise<void> {
  const event = saleTxEvent(keys, address, txid, now);
  return publishToQuorum(event, memberRecordCall(keys, event, relays), majority(relays.length));
}

/**
 * The transactions the devices of `holders` recorded paying `address` since `since` (Unix
 * seconds), the earliest recorded first. Null when fewer than a majority of `relays` answered: each
 * was recorded on a majority.
 */
export async function fetchSaleTxs(
  holders: readonly MemberKeys[],
  address: string,
  network: string,
  since: number,
  relays: readonly string[] = currentRelays()
): Promise<string[] | null> {
  if (holders.length === 0) return [];
  const answers = await queryRelaysPaged(
    { kinds: [RECORD_KIND], authors: holders.map(({ nostr }) => nostr.publicKey), since },
    membersCall(
      holders.map((keys) => ({ keys })),
      relays
    ),
    { quorum: "majority" }
  );
  if (answers.size < majority(relays.length)) return null;
  const byAuthor = new Map(holders.map((keys) => [keys.nostr.publicKey, keys]));
  const found = new Map<string, number>();
  const opened = new Set<string>();
  for (const value of [...answers.values()].flat()) {
    const copy = JSON.stringify(value) ?? "";
    const author = (value as Partial<NostrEvent> | null)?.pubkey;
    const keys = typeof author === "string" ? byAuthor.get(author) : undefined;
    if (!keys || opened.has(copy)) continue;
    opened.add(copy);
    // Its sales and links come too: they do not open as such a record.
    const record = openSaleTx(keys, value, [network]);
    if (record === null || record.address !== address) continue;
    const at = found.get(record.txid);
    if (at === undefined || record.at < at) found.set(record.txid, record.at);
  }
  return [...found].sort(([a, at], [b, bt]) => at - bt || (a < b ? -1 : 1)).map(([txid]) => txid);
}

/**
 * A transaction a member's device recorded paying one of its sales' addresses (`team-sale-tx`):
 * when it recorded it (the record's date, the latest when it recorded it again).
 */
export type SaleSighting = { address: string; txid: string; at: number };

/**
 * `value` opened as a record of `keys`' that a transaction paid an address of one of `networks`
 * (checked: its author, its `d` tag); null for anything else.
 */
function openSaleTx(
  keys: MemberKeys,
  value: unknown,
  networks: readonly string[]
): SaleSighting | null {
  const record = openRecord(value, {
    type: SALE_TX_TYPE,
    encryptionKey: keys.records.encryptionKey,
    address: () => true,
    author: keys.nostr.publicKey,
    parse: (payload, event) => {
      const v = payload as Record<string, unknown> | null;
      if (v === null || typeof v !== "object" || v.version !== RECORD_VERSION) return null;
      const address = v.address;
      if (typeof address !== "string" || typeof v.txid !== "string") return null;
      if (
        !networks.some((network) => parseTaprootAddress(address, network) === address) ||
        !HEX_32.test(v.txid)
      ) {
        return null;
      }
      const d = event.tags.find(([name]) => name === "d")?.[1];
      return d === saleTxAddress(keys, address, v.txid) ? { address, txid: v.txid } : null;
    }
  });
  return record?.status === "ok" ? { ...record.value, at: record.event.created_at } : null;
}

/**
 * Publishes a member's record to every relay. Resolves with those that took it once a majority did,
 * or could not (the others go on in the background): a record fewer took is published again by its
 * caller (member.ts), as a read of the owner's stops at a majority.
 */
export function publishMemberRecord(
  keys: MemberKeys,
  event: NostrEvent,
  relays: readonly string[] = currentRelays()
): Promise<string[]> {
  return publishToRelays(event, memberRecordCall(keys, event, relays), { quorum: "majority" });
}

/**
 * Publishes a member's record again, as publishMemberRecord, the relays that hold it or a newer one
 * at its address counting among those that took it (publishAgain): signed again with its first date
 * (the device's arrival), it gets another id, which a relay holding the first refuses half of the
 * time; a sale's record is replaced by its verdict (recordSaleVerdict), which is the one read.
 */
export function publishMemberRecordAgain(
  keys: MemberKeys,
  event: NostrEvent,
  relays: readonly string[] = currentRelays()
): Promise<string[]> {
  return publishAgain(event, memberRecordCall(keys, event, relays), { quorum: "majority" });
}

/**
 * Publishes a member's record to every relay. Resolves once a majority of them took it (the others
 * go on in the background), rejects as soon as they no longer can.
 */
export function publishMemberRecordToMajority(
  keys: MemberKeys,
  event: NostrEvent,
  relays: readonly string[] = currentRelays()
): Promise<void> {
  return publishToQuorum(event, memberRecordCall(keys, event, relays), majority(relays.length));
}

/**
 * A read of `members`' records: authenticated as each of them (NIP-42), a relay may give an
 * author's records to that author only.
 */
function membersCall(
  members: readonly { keys: MemberKeys }[],
  relays: readonly string[]
): RelayCall {
  return {
    relays,
    timeoutMs: TEAM_TIMEOUT_MS.background,
    channel: "account",
    authKey: members.map(({ keys }) => keys.nostr.secretKey)
  };
}

/** A call publishing `event`: its author's key answers a relay's authentication (NIP-42). */
function memberRecordCall(keys: MemberKeys, event: NostrEvent, relays: readonly string[]) {
  const authKey =
    event.pubkey === keys.links.publicKey ? keys.links.secretKey : keys.nostr.secretKey;
  return { channel: "account" as const, relays, timeoutMs: TEAM_TIMEOUT_MS.background, authKey };
}

/**
 * The device records of several members (one query, authenticated as each of them, until a
 * majority answered: each is published to one, member.ts), by member id: null for a member without
 * one. Null when fewer than a majority answered: a member's arrival or departure may be missing.
 */
export async function fetchDevices(
  members: readonly { id: string; keys: MemberKeys }[],
  relays: readonly string[] = currentRelays()
): Promise<Map<string, MemberDevice | null> | null> {
  if (members.length === 0) return new Map();
  const answers = await queryRelays(
    {
      kinds: [RECORD_KIND],
      authors: members.map(({ keys }) => keys.nostr.publicKey),
      "#d": members.map(({ keys }) => deviceAddress(keys))
    },
    membersCall(members, relays),
    { quorum: "majority" }
  );
  if (answers.size < majority(relays.length)) return null;
  return new Map(
    members.map(({ id, keys }) => {
      const { newest } = newestRecord(answers, (value) =>
        openRecord(value, {
          type: DEVICE_TYPE,
          encryptionKey: keys.records.encryptionKey,
          address: deviceAddress(keys),
          author: keys.nostr.publicKey,
          parse: parseDevice
        })
      );
      return [id, newest?.value ?? null];
    })
  );
}

/**
 * A member's sales and payment links, as its records give them (fetchMemberRecords), and the
 * transactions its device recorded paying its sales' addresses (one per address and transaction).
 */
export type MemberRecords = { sales: MemberSale[]; links: MemberLink[]; sightings: SaleSighting[] };

/**
 * The sales and the payment links of a member since `since` (Unix seconds), from one read: the
 * newest record of each invoice, newest first, and each link once. Only the authors of the types
 * `wanted` are read (the owner's links alone skip a year of sales), authenticated as each of them
 * (a relay may give an author's records to that author only). Read until a majority answered:
 * each record is published to one (member.ts). Null when fewer did: a sale not final yet, or a
 * link, may be missing (unsettled.ts decides with them whether the account may be deleted).
 */
export async function fetchMemberRecords(
  keys: MemberKeys,
  since: number,
  relays: readonly string[] = currentRelays(),
  wanted: { sales: boolean; links: boolean } = { sales: true, links: true }
): Promise<MemberRecords | null> {
  const authors = [...(wanted.sales ? [keys.nostr] : []), ...(wanted.links ? [keys.links] : [])];
  // Every record of the member since then: more than a relay sends for one filter, page after page.
  const answers = await queryRelaysPaged(
    { kinds: [RECORD_KIND], authors: authors.map(({ publicKey }) => publicKey), since },
    {
      relays,
      timeoutMs: TEAM_TIMEOUT_MS.background,
      channel: "account",
      authKey: authors.map(({ secretKey }) => secretKey)
    },
    { quorum: "majority" }
  );
  if (answers.size < majority(relays.length)) return null;
  return memberRecordsOf(keys, [...answers.values()].flat(), wanted);
}

/**
 * The sales and the payment links among what relays sent of a member (fetchMemberRecords, or a
 * read of its authors made for something else: "Delete account"): the newest record of each
 * invoice, newest first, and each link once, every copy checked (openRecord: a sale signed by the
 * member's key, a link by the links' author).
 */
export function memberRecordsOf(
  keys: MemberKeys,
  events: readonly unknown[],
  wanted: { sales: boolean; links: boolean } = { sales: true, links: true }
): MemberRecords {
  // By saleRecordKey: an invoice's, or an hour's shown with the address alone.
  const sales = new Map<string, { sale: MemberSale; createdAt: number }>();
  const links = new Map<string, MemberLink>();
  const sightings = new Map<string, SaleSighting>();
  // One event goes to every relay: identical copies are opened once.
  const seen = new Set<string>();
  for (const value of events) {
    const key = JSON.stringify(value) ?? "";
    if (seen.has(key)) continue;
    seen.add(key);
    const sale = !wanted.sales
      ? null
      : openRecord(value, {
          type: [SALE_TYPE, ONCHAIN_SALE_TYPE],
          encryptionKey: keys.records.encryptionKey,
          // The record of a sale is at the address of its own payment hash (saleAddress).
          address: () => true,
          author: keys.nostr.publicKey,
          parse: (payload, event, type) => {
            const parsed = type === SALE_TYPE ? parseSale(payload) : parseOnchainSale(payload);
            const address = event.tags.find(([name]) => name === "d")?.[1];
            return parsed && address === saleAddress(keys, parsed) ? parsed : null;
          }
        });
    if (sale?.status === "ok") {
      const key = saleRecordKey(sale.value);
      const known = sales.get(key);
      if (!known || sale.event.created_at > known.createdAt) {
        sales.set(key, { sale: sale.value, createdAt: sale.event.created_at });
      }
      continue;
    }
    // The transactions its device saw paying its sales' addresses, of either network a sale's
    // address may be of (parseSale); of two versions of one, the latest.
    const sighting = wanted.sales ? openSaleTx(keys, value, SALE_NETWORKS) : null;
    if (sighting) {
      const at = `${sighting.address}:${sighting.txid}`;
      if ((sightings.get(at)?.at ?? -1) < sighting.at) sightings.set(at, sighting);
      continue;
    }
    if (!wanted.links) continue;
    const link = openRecord(value, {
      type: LINK_TYPE,
      encryptionKey: keys.records.encryptionKey,
      // The record of a link is at the address of its own author.
      address: () => true,
      author: keys.links.publicKey,
      parse: (payload, event) => {
        const parsed = parseLink(payload);
        const address = event.tags.find(([name]) => name === "d")?.[1];
        return parsed && address === linkAddress(keys, parsed.link) ? parsed : null;
      }
    });
    if (link?.status === "ok") links.set(link.value.link, link.value);
  }
  return {
    sales: [...sales.values()].map(({ sale }) => sale).sort((a, b) => b.createdAt - a.createdAt),
    links: [...links.values()],
    sightings: [...sightings.values()]
  };
}

/**
 * The sales of a member since `since` (Unix seconds), newest record of each invoice, newest
 * first. Null when fewer than a majority answered.
 */
export async function fetchSales(
  keys: MemberKeys,
  since: number,
  relays: readonly string[] = currentRelays()
): Promise<MemberSale[] | null> {
  return (
    (await fetchMemberRecords(keys, since, relays, { sales: true, links: false }))?.sales ?? null
  );
}

/**
 * The payment links a member made from `since` to `until` (Unix seconds, both included), read on
 * `relays` by the links' author (the owner's copy of a month, src/features/activity/archive.ts),
 * with how many relays answered, whole answers only (queryRelaysPaged): a decision needs a majority
 * of them. Never rejects.
 */
export async function fetchLinkRecords(
  keys: MemberKeys,
  since: number,
  until: number,
  relays: readonly string[]
): Promise<{ links: MemberLink[]; answered: number }> {
  const answers = await queryRelaysPaged(
    { kinds: [RECORD_KIND], authors: [keys.links.publicKey], since, until },
    {
      channel: "account",
      relays,
      timeoutMs: TEAM_TIMEOUT_MS.background,
      authKey: keys.links.secretKey
    },
    { whole: true, quorum: "majority" }
  );
  const { links } = memberRecordsOf(keys, [...answers.values()].flat(), {
    sales: false,
    links: true
  });
  return { links, answered: answers.size };
}

/**
 * The payment links a member made since `since` (Unix seconds). Null when fewer than a majority
 * answered.
 */
export async function fetchLinks(
  keys: MemberKeys,
  since: number,
  relays: readonly string[] = currentRelays()
): Promise<MemberLink[] | null> {
  return (
    (await fetchMemberRecords(keys, since, relays, { sales: false, links: true }))?.links ?? null
  );
}
