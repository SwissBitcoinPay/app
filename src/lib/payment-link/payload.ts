import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";

import { epochReaderFor } from "@/lib/nostr/epochs";
import type { ReaderEpoch } from "@/lib/registry/registry";
import { MAX_EXPORT_EPOCH } from "@/lib/team/export-epoch";
import { isHttpsUrl, lightningAddressUrl, type Invoice } from "@/lib/lightning/lnurl";
import { parseTaprootAddress } from "@/lib/onchain/address";
import { parsePayerNode, type PayerNode } from "@/lib/onchain/node";

import { parseSaleFinal, type FinalPayload, type SaleFinal } from "./final";

/**
 * Format of the payload. A change of what it holds needs a new version. Version 3
 * holds the sale and no invoice: the payer's page asks its own, hour by hour, and declares them
 * (src/lib/registry/), so that a link works while the point of sale is offline; and, once the sale
 * is settled, its final version (final.ts). An optional field that readers without it
 * may ignore needs none: `taker`, which an older page leaves aside, and `bitcoinNode`,
 * for which an older page reads mempool.space.
 *
 * The point of sale's links stay of version 3: a sale of 10 minutes from its start, which its end
 * gives (V3_SALE_SECONDS). Version 4 (an invoice of "New invoice", payable until
 * its due date, months later) says when its sale starts (`startsAt`): a reader of version 3 would
 * take its start for 10 minutes before its end, and count none of its payments made before then.
 * Such a reader refuses version 4 (it skips the link) rather than misreading it.
 */
export const PAYMENT_LINK_VERSION = 3;

/** Version of the links of a sale that says when it starts (an invoice, `startsAt`). */
export const LONG_SALE_LINK_VERSION = 4;

/** The versions of a sale's link (no invoice in it): the point of sale's, an invoice's. */
export type SaleLinkVersion = typeof PAYMENT_LINK_VERSION | typeof LONG_SALE_LINK_VERSION;

/**
 * How long a sale of a link of version 3 lasts: the point of sale's (INVOICE_EXPIRY_SECONDS of
 * src/features/terminal/invoice.ts, 10 minutes, when version 3 was made). Never change it: the start
 * of every link of version 3 derives from its end with it.
 */
export const V3_SALE_SECONDS = 600;

/**
 * The longest sale of a link of version 4: the longest due date "New invoice" offers (9
 * months, MAX_DUE_MONTHS of src/config/invoices.ts) and a margin. A longer one is refused.
 */
export const MAX_SALE_SECONDS = 300 * 24 * 3600;

/** Longest business name or note accepted in a payload (the point of sale's note: 100). */
const MAX_TEXT_LENGTH = 200;

/** Longest redirection URL of a payload (REDIRECT_URL_MAX_LENGTH of src/config/invoices.ts). */
const MAX_REDIRECT_LENGTH = 500;

/** The fiat amount of a sale, in minor units, with the digits of its currency. */
export type LinkFiat = { minor: number; digits: number; currency: string };

/**
 * What a payment link carries, encrypted (link.ts): the sale, as the payer's page needs it to ask
 * and declare its own invoices. Its key is the link's own (link.ts), which gives the sale's keys
 * (deriveSaleKeys). No secret of the merchant's wallet: the business's registry key only
 * places the declarations of its payments (src/lib/registry/).
 */
export type PaymentLinkPayload = {
  version: SaleLinkVersion;
  businessName: string;
  lightningAddress: string;
  /**
   * The fiat amount asked at the keypad, in minor units, with the digits of its currency as the
   * point of sale counted them: the payer's device may know another number of digits.
   */
  fiat: LinkFiat;
  /** The sale's note, "" when none. */
  note: string;
  /** The sale's on-chain address, null for a Lightning only sale. */
  onchainAddress: string | null;
  /** Unix seconds: the end of the sale, after which no invoice of it is asked any more. */
  endsAt: number;
  /**
   * Unix seconds: the start of the sale, in version 4 only (an invoice declared for it is dated from
   * then on). Version 3: V3_SALE_SECONDS before its end.
   */
  startsAt?: number;
  /**
   * Version 4 only, optional: where the payer's page offers to go once the sale is paid (the
   * redirect URL of "New invoice"), an https URL.
   */
  redirectUrl?: string;
  /** Hex, 32 bytes: the business's registry key. */
  registryKey: string;
  /** Hex: the public half of the business's reading key of the registry. */
  registryReader: string;
  /**
   * The export epoch the page's declarations are sealed at inside, and that epoch's reading key
   * (src/lib/registry/registry.ts, sealInside), when the link was
   * made at one. Optional, the version unchanged: absent, or from a page of before, sealed for
   * `registryReader` alone, as before any epoch (which a copy of a withdrawn export grant opens).
   */
  registryEpoch?: ReaderEpoch;
  /**
   * Hex: the public half of the business's link owner key (src/lib/team/keys.ts): the link's id
   * commits to it (link.ts), and the owner signs a final version with it (owner-key.ts).
   */
  owner: string;
  /**
   * Who took the sale (takerTag of src/lib/registry/registry.ts): the page's
   * declarations carry it, for the owner. Optional in version 3: absent, they do not say.
   */
  taker?: string;
  /**
   * The merchant's own Bitcoin node, when the owner passes it on to the payers' pages
   * (src/lib/onchain/node.ts): the page reads the chain there, with the
   * same fallback. An HTTPS node only. Optional, the version unchanged: absent, or from a page of
   * before, mempool.space.
   */
  bitcoinNode?: PayerNode;
  /**
   * The sale's outcome, in the final version of the link only (final.ts): nothing follows the sale
   * any more. Its `onchainAddress` is then null when nothing paid it.
   */
  final?: FinalPayload;
};

/** A link of version 3 or 4, checked: the sale, whose invoices the payer's page asks itself. */
export type SharedSale = {
  /** Kept for its final version, which holds the same payload (payloadOfSale). */
  version: SaleLinkVersion;
  businessName: string;
  lightningAddress: string;
  fiat: LinkFiat;
  note: string;
  /** Lowercase, a taproot address of the build's network; null for a Lightning only sale. */
  onchainAddress: string | null;
  /** Unix seconds: the sale's start (version 3: V3_SALE_SECONDS before its end). */
  startsAt: number;
  endsAt: number;
  /** Where the payer's page offers to go once paid (version 4); null when nowhere. */
  redirectUrl: string | null;
  registryKey: Uint8Array;
  registryReader: string;
  /** The export epoch its declarations are sealed at (registryEpoch), absent when none. */
  registryEpoch?: ReaderEpoch;
  owner: string;
  /** Who took the sale (takerTag), null when the link does not say. */
  taker: string | null;
  /** The node the payer's page reads the chain on (bitcoinNode); null for mempool.space. */
  bitcoinNode: PayerNode | null;
  /** The sale's outcome, in a final version (final.ts); null otherwise. */
  final: SaleFinal | null;
};

/** What the payer's page shows of a sale around its invoices: its names, amounts and end. */
export type SharedView = {
  businessName: string;
  lightningAddress: string;
  fiat: LinkFiat;
  note: string;
  /** Lowercase, a taproot address of the build's network; null for a Lightning only sale. */
  onchainAddress: string | null;
  /** Unix seconds: the end of the sale. */
  endsAt: number;
  /**
   * Unix seconds: the start of a sale that says it (a link of version 4, an invoice payable until
   * its due date); absent for the point of sale's sales, of 10 minutes.
   */
  startsAt?: number;
  /**
   * An invoice's page once paid (a link of version 4 that has one): where "Continue" sends the
   * payer, https only (the link's parser checked it).
   */
  redirectUrl?: string;
  /**
   * The merchant's node the page reads the chain on, where its transactions' links lead (the
   * sale's `bitcoinNode`); null for mempool.space.
   */
  bitcoinNode: PayerNode | null;
  /** Whole sats: the amount due or received; null when there is none to show. */
  sats: bigint | null;
};

/** The invoice a payer's page shows: one the page asked itself. */
export type SharedInvoice = Omit<SharedView, "sats"> & {
  /**
   * Null above the most the merchant's Lightning address accepts: the sale is then payable
   * on-chain only, to `onchainAddress` (never null so: useSale.ts).
   */
  invoice: Invoice | null;
  /** Whole sats: the invoice's amount (on-chain only: the amount due at the hour's point). */
  sats: bigint;
  /**
   * Unix seconds after which the invoice can no longer be paid; on-chain only, until when its
   * amount holds (the end of its point's period, or of the sale).
   */
  expiresAt: number;
  /** The hour of the point the invoice was asked at. */
  rateHour: number;
};

/** What a link holds, checked. */
export type SharedLink = { kind: "sale"; sale: SharedSale };

function isText(value: unknown, required: boolean): value is string {
  return (
    typeof value === "string" &&
    value.length <= MAX_TEXT_LENGTH &&
    (!required || value.trim() !== "")
  );
}

/**
 * The on-chain address of a payload: none in version 1; from version 2, null or a taproot address
 * of `network` (the merchant's deposit addresses are). Undefined when invalid.
 */
function onchainAddressOf(p: Record<string, unknown>, network: string): string | null | undefined {
  if (p.onchainAddress === null) return null;
  if (typeof p.onchainAddress !== "string") return undefined;
  return parseTaprootAddress(p.onchainAddress, network) ?? undefined;
}

function fiatOf(value: unknown): LinkFiat | null {
  if (value === null || typeof value !== "object") return null;
  const fiat = value as Record<string, unknown>;
  if (
    !Number.isSafeInteger(fiat.minor) ||
    (fiat.minor as number) <= 0 ||
    !Number.isInteger(fiat.digits) ||
    (fiat.digits as number) < 0 ||
    (fiat.digits as number) > 4 ||
    typeof fiat.currency !== "string" ||
    !/^[A-Z]{3}$/.test(fiat.currency)
  ) {
    return null;
  }
  return { minor: fiat.minor as number, digits: fiat.digits as number, currency: fiat.currency };
}

/**
 * Validates a decrypted payload; anything else is null. Version 3: the sale, its end and the
 * registry key. Versions 1 and 2: the invoice must decode, be of `network` (BOLT11 prefix: "bc"
 * on mainnet) and ask for a whole, positive number of sats: the page shows that amount, never one
 * from the payload alone. The on-chain address, if any, must be of the same network (its segwit
 * prefix is the BOLT11 one).
 */
export function parsePaymentLinkPayload(value: unknown, network: string): SharedLink | null {
  if (value === null || typeof value !== "object") return null;
  const p = value as Record<string, unknown>;
  if (p.version !== PAYMENT_LINK_VERSION && p.version !== LONG_SALE_LINK_VERSION) return null;
  const fiat = fiatOf(p.fiat);
  const onchainAddress = onchainAddressOf(p, network);
  if (
    !fiat ||
    onchainAddress === undefined ||
    !isText(p.businessName, true) ||
    typeof p.lightningAddress !== "string" ||
    lightningAddressUrl(p.lightningAddress) === null ||
    !isText(p.note, false)
  ) {
    return null;
  }
  const common = {
    businessName: p.businessName,
    lightningAddress: p.lightningAddress,
    fiat,
    note: p.note,
    onchainAddress
  };
  if (!Number.isSafeInteger(p.endsAt) || (p.endsAt as number) <= 0) return null;
  const endsAt = p.endsAt as number;
  let startsAt = endsAt - V3_SALE_SECONDS;
  if (p.version === LONG_SALE_LINK_VERSION) {
    if (
      !Number.isSafeInteger(p.startsAt) ||
      (p.startsAt as number) <= 0 ||
      (p.startsAt as number) >= endsAt ||
      endsAt - (p.startsAt as number) > MAX_SALE_SECONDS
    ) {
      return null;
    }
    startsAt = p.startsAt as number;
  } else if (p.startsAt !== undefined || p.redirectUrl !== undefined) {
    // A start or a redirection in version 3, which has none: not a link this app made.
    return null;
  }
  let redirectUrl: string | null = null;
  if (p.redirectUrl !== undefined) {
    if (
      typeof p.redirectUrl !== "string" ||
      p.redirectUrl.length > MAX_REDIRECT_LENGTH ||
      !isHttpsUrl(p.redirectUrl)
    ) {
      return null;
    }
    redirectUrl = p.redirectUrl;
  }
  if (typeof p.registryKey !== "string" || !/^[0-9a-f]{64}$/.test(p.registryKey)) return null;
  if (typeof p.registryReader !== "string" || !/^[0-9a-f]{64}$/.test(p.registryReader)) {
    return null;
  }
  if (typeof p.owner !== "string" || !/^[0-9a-f]{64}$/.test(p.owner)) return null;
  let final: SaleFinal | null = null;
  if (p.final !== undefined) {
    final = parseSaleFinal(p.final, fiat, onchainAddress, network);
    if (final === null) return null;
  }
  return {
    kind: "sale",
    sale: {
      version: p.version,
      ...common,
      startsAt,
      endsAt,
      redirectUrl,
      registryKey: hexToBytes(p.registryKey),
      registryReader: p.registryReader,
      // One not in its form is left aside: sealed for `registryReader` alone, as before epochs.
      ...registryEpochOf(p.registryEpoch),
      owner: p.owner,
      // Only the owner checks it (registry.ts): one not in its form is left aside.
      taker: typeof p.taker === "string" && /^[0-9a-f]{32}$/.test(p.taker) ? p.taker : null,
      // One not in its form (an HTTP node, another spelling) is left aside: mempool.space.
      bitcoinNode: parsePayerNode(p.bitcoinNode),
      final
    }
  };
}

/** A link's export epoch (registryEpoch), checked whole; null otherwise. */
export function parseReaderEpoch(value: unknown): ReaderEpoch | null {
  if (value === null || typeof value !== "object") return null;
  const { epoch, reader } = value as Record<string, unknown>;
  if (
    !Number.isSafeInteger(epoch) ||
    (epoch as number) < 1 ||
    (epoch as number) > MAX_EXPORT_EPOCH
  ) {
    return null;
  }
  return typeof reader === "string" && /^[0-9a-f]{64}$/.test(reader)
    ? { epoch: epoch as number, reader }
    : null;
}

/** A link's export epoch as a sale holds it: absent when none, or not in its form. */
function registryEpochOf(value: unknown): { registryEpoch?: ReaderEpoch } {
  const registryEpoch = parseReaderEpoch(value);
  return registryEpoch ? { registryEpoch } : {};
}

/**
 * The export epoch a link of the registry whose reading key is `reader` names: the one this device
 * seals its declarations at (epochReaderFor), none at epoch 0.
 */
export function linkRegistryEpoch(reader: string): { registryEpoch?: ReaderEpoch } {
  const found = epochReaderFor(reader);
  return found ? { registryEpoch: found } : {};
}

/**
 * Whether `view` is of a sale that lasts longer than the point of sale's (an invoice, payable until
 * its due date): its page shows that date, not a countdown.
 */
export function isLongSale(view: Pick<SharedView, "startsAt" | "endsAt">): boolean {
  return view.startsAt !== undefined && view.endsAt - view.startsAt > V3_SALE_SECONDS;
}

/** The payload of a sale read from a link (its final part left out): what its final version holds. */
export function payloadOfSale(sale: SharedSale): PaymentLinkPayload {
  return {
    version: sale.version,
    businessName: sale.businessName,
    lightningAddress: sale.lightningAddress,
    fiat: sale.fiat,
    note: sale.note,
    onchainAddress: sale.onchainAddress,
    endsAt: sale.endsAt,
    ...(sale.version === LONG_SALE_LINK_VERSION ? { startsAt: sale.startsAt } : {}),
    ...(sale.redirectUrl !== null ? { redirectUrl: sale.redirectUrl } : {}),
    registryKey: bytesToHex(sale.registryKey),
    registryReader: sale.registryReader,
    ...(sale.registryEpoch ? { registryEpoch: sale.registryEpoch } : {}),
    owner: sale.owner,
    ...(sale.taker ? { taker: sale.taker } : {}),
    ...(sale.bitcoinNode ? { bitcoinNode: sale.bitcoinNode } : {})
  };
}
