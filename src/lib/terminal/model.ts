import type { BreezNetwork } from "@/lib/breez/config";
import { parseChannelCatalog, type ChannelCatalog } from "@/lib/catalog/reader";
import { lightningAddressUrl } from "@/lib/lightning/lnurl";
import { parseOptionalImageRef, type ImageRef } from "@/lib/media/image";
import { parseDepositAddress } from "@/lib/onchain/address";
import { parseBitcoinNode, type BitcoinNode } from "@/lib/onchain/node";
import { toleranceOf } from "@/lib/onchain/tolerance";

/**
 * What this device needs to take payments without opening the wallet: the merchant's Lightning
 * address, which receives for the wallet's public key, plus
 * the business name and currency shown at the point of sale. Saved on the device once the sign-up
 * is done (or at login into a done account), read at launch to open the point of sale directly.
 * No secret: never the seed nor any key that can spend.
 *
 * Three kinds: the owner's devices (version 2), the devices of the team's employees (version 3,
 * src/lib/team/), which never know the wallet: neither its seed nor its
 * id, and a card holder's devices (version 4, CardHolderProfile: no point of sale, no wallet). An
 * app from before teams reads no version 3 profile (the device then shows the welcome screen, as
 * without one).
 */
export type TerminalProfile = OwnerTerminalProfile | MemberTerminalProfile | CardHolderProfile;

/** A device of the account's owner: its passkey opens the rest of the app (till mode). */
export type OwnerTerminalProfile = {
  /** Format of this record. A change of format needs a new version and a migration. */
  version: 2;
  /** Identity public key of the wallet (getWalletId): which account this device takes payments for. */
  walletId: string;
  /**
   * Public key of the account's settings backups (`BackupKeys.publicKey`, x-only hex): public,
   * the author of its events on the relays. Unlocking checks the passkey against it, without
   * connecting the wallet (lock.ts).
   */
  backupKey: string;
  /** LUD-16 address on the Breez LNURL server, e.g. "sattleme02ab12cd34@breez.tips". */
  lightningAddress: string;
  businessName: string;
  /** ISO 4217: the currency the keypad counts in (the merchant's display currency). */
  currency: string;
};

/** A device of one of the team's employees: it only takes payments, from its team's channel. */
export type MemberTerminalProfile = {
  version: 3;
  /** The team's public key (hex): which team this device takes payments for. */
  team: string;
  /** The employee's name, as the owner typed it. */
  memberName: string;
  lightningAddress: string;
  businessName: string;
  currency: string;
};

/**
 * A card holder's device (version 4): the account was opened to
 * manage cards only, and has no main wallet, nor point of sale: neither a Lightning address nor
 * on-chain addresses. Its passkey opens "Cards" and "Settings" (till mode as an owner's
 * device); its cards pay from their own wallets. An app from before it reads no version 4 profile
 * (the device then shows the welcome screen, as without one).
 */
export type CardHolderProfile = {
  version: 4;
  /** The account's id: the id its wallet would have (walletIdOf), a wallet never connected. */
  walletId: string;
  /** As an owner's (`OwnerTerminalProfile.backupKey`): unlocking checks the passkey against it. */
  backupKey: string;
  /** The account's name (generated at sign-up): never shown as a business's. */
  businessName: string;
  /** ISO 4217: the currency the cards' amounts are shown in ("Reference currency"). */
  currency: string;
};

/** A device of the account's owner: a point of sale's, or a card holder's. */
export type AccountProfile = OwnerTerminalProfile | CardHolderProfile;

/** A profile as saved: the same as read (an alias kept for the tests that name it). */
export type SavedTerminalProfile = TerminalProfile;

export const TERMINAL_PROFILE_VERSION = 2;
export const MEMBER_PROFILE_VERSION = 3;
export const CARD_HOLDER_PROFILE_VERSION = 4;

export function isMemberProfile(profile: TerminalProfile): profile is MemberTerminalProfile {
  return profile.version === MEMBER_PROFILE_VERSION;
}

export function isCardHolderProfile(profile: TerminalProfile): profile is CardHolderProfile {
  return profile.version === CARD_HOLDER_PROFILE_VERSION;
}

/** `profile` when it is the point of sale of an owner's device, else null. */
export function ownerProfile(profile: TerminalProfile | null): OwnerTerminalProfile | null {
  return profile && !isMemberProfile(profile) && !isCardHolderProfile(profile) ? profile : null;
}

/** `profile` when it is a device of the account's owner (a point of sale's, a card holder's). */
export function accountProfile(profile: TerminalProfile | null): AccountProfile | null {
  return profile && !isMemberProfile(profile) ? profile : null;
}

/** What tells this device's account apart: the wallet id, or the team's key for an employee. */
export function profileAccount(profile: TerminalProfile): string {
  return isMemberProfile(profile) ? profile.team : profile.walletId;
}

/**
 * Validates a stored profile: an owner's of this version, an employee's or a card holder's.
 * Anything else counts as none (the point of sale then needs a login), an owner's of version 1
 * (without its backup key) included: no device keeps one.
 */
export function parseTerminalProfile(value: unknown): TerminalProfile | null {
  if (value === null || typeof value !== "object") return null;
  const p = value as Record<string, unknown>;
  if (p.version === CARD_HOLDER_PROFILE_VERSION) return parseCardHolderProfile(p);
  if (
    typeof p.lightningAddress !== "string" ||
    lightningAddressUrl(p.lightningAddress) === null ||
    typeof p.businessName !== "string" ||
    p.businessName.trim() === "" ||
    typeof p.currency !== "string" ||
    !/^[A-Z]{3}$/.test(p.currency)
  ) {
    return null;
  }
  const details = {
    lightningAddress: p.lightningAddress,
    businessName: p.businessName,
    currency: p.currency
  };
  if (p.version === MEMBER_PROFILE_VERSION) {
    if (
      typeof p.team !== "string" ||
      !/^[0-9a-f]{64}$/.test(p.team) ||
      typeof p.memberName !== "string" ||
      p.memberName.trim() === ""
    ) {
      return null;
    }
    return { version: MEMBER_PROFILE_VERSION, team: p.team, memberName: p.memberName, ...details };
  }
  if (
    p.version !== TERMINAL_PROFILE_VERSION ||
    typeof p.backupKey !== "string" ||
    !/^[0-9a-f]{64}$/.test(p.backupKey) ||
    typeof p.walletId !== "string" ||
    !/^[0-9a-f]{66}$/i.test(p.walletId)
  ) {
    return null;
  }
  return {
    version: TERMINAL_PROFILE_VERSION,
    walletId: p.walletId,
    backupKey: p.backupKey,
    ...details
  };
}

/** A card holder's profile (version 4): never a Lightning address, its fields exactly. */
function parseCardHolderProfile(p: Record<string, unknown>): CardHolderProfile | null {
  if (
    typeof p.walletId !== "string" ||
    !/^[0-9a-f]{66}$/i.test(p.walletId) ||
    typeof p.backupKey !== "string" ||
    !/^[0-9a-f]{64}$/.test(p.backupKey) ||
    typeof p.businessName !== "string" ||
    p.businessName.trim() === "" ||
    typeof p.currency !== "string" ||
    !/^[A-Z]{3}$/.test(p.currency) ||
    "lightningAddress" in p
  ) {
    return null;
  }
  return {
    version: CARD_HOLDER_PROFILE_VERSION,
    walletId: p.walletId,
    backupKey: p.backupKey,
    businessName: p.businessName,
    currency: p.currency
  };
}

/**
 * The on-chain deposit addresses this device has left to show
 * (src/features/terminal/onchain-pool.ts): fetched while the merchant's wallet is
 * connected, one taken by each invoice shown, never shown twice. Kept apart from the profile, which
 * it would rewrite at each sale. No secret: addresses of the wallet, which anyone may pay.
 */
export type OnchainPool = {
  /** Format of this record. A change of format needs a new version and a migration. */
  version: 1;
  /** The wallet the addresses belong to (getWalletId). */
  walletId: string;
  /** Lowercase taproot addresses, next one first. */
  addresses: string[];
};

export const ONCHAIN_POOL_VERSION = 1;

/**
 * Validates a stored pool, of addresses of `network` (the build's); anything else counts as none
 * (the next activation fills a new one).
 */
export function parseOnchainPool(value: unknown, network: BreezNetwork): OnchainPool | null {
  if (value === null || typeof value !== "object") return null;
  const p = value as Record<string, unknown>;
  if (
    p.version !== ONCHAIN_POOL_VERSION ||
    typeof p.walletId !== "string" ||
    !/^[0-9a-f]{66}$/i.test(p.walletId) ||
    !Array.isArray(p.addresses)
  ) {
    return null;
  }
  const addresses: string[] = [];
  for (const item of p.addresses) {
    const address = typeof item === "string" ? parseDepositAddress(item, network) : null;
    if (address === null) return null;
    if (!addresses.includes(address)) addresses.push(address);
  }
  return { version: ONCHAIN_POOL_VERSION, walletId: p.walletId, addresses };
}

/**
 * The business's registry key on this device (src/lib/registry/), for the account of the profile
 * it was saved with: the owner's device saves it once the account is open, an employee's from its
 * channel (src/lib/team/channel.ts). A key of another account is ignored.
 */
export type RegistryRecord = {
  /** Format of this record. A change of format needs a new version and a migration. */
  version: 1;
  /** profileAccount of the profile it belongs to: the wallet id, or the team's key. */
  account: string;
  /** Hex, 32 bytes. */
  key: string;
  /** Hex: the public half of the business's reading key (src/lib/registry/). */
  reader: string;
  /** Hex: the public half of the business's link owner key (src/lib/payment-link/owner-key.ts). */
  owner: string;
  /**
   * Hex: the public half of the business's link key reader (BusinessRegistry.linkKeyReader). An
   * optional field, the format unchanged: absent from the records of older apps (an
   * app of before drops it when it saves the record again; it comes back at the next sync).
   */
  linkKeyReader?: string;
};

export const REGISTRY_RECORD_VERSION = 1;

export function parseRegistryRecord(value: unknown): RegistryRecord | null {
  if (value === null || typeof value !== "object") return null;
  const r = value as Record<string, unknown>;
  if (
    r.version !== REGISTRY_RECORD_VERSION ||
    typeof r.account !== "string" ||
    !/^(?:[0-9a-f]{64}|[0-9a-f]{66})$/i.test(r.account) ||
    typeof r.key !== "string" ||
    !/^[0-9a-f]{64}$/.test(r.key) ||
    typeof r.reader !== "string" ||
    !/^[0-9a-f]{64}$/.test(r.reader) ||
    typeof r.owner !== "string" ||
    !/^[0-9a-f]{64}$/.test(r.owner)
  ) {
    return null;
  }
  return {
    version: REGISTRY_RECORD_VERSION,
    account: r.account,
    key: r.key,
    reader: r.reader,
    owner: r.owner,
    // Invalid: none, and the record stays valid (the links' keys are sealed for `reader` then).
    ...(typeof r.linkKeyReader === "string" && /^[0-9a-f]{64}$/.test(r.linkKeyReader)
      ? { linkKeyReader: r.linkKeyReader }
      : {})
  };
}

/**
 * The business's choices that change what the point of sale offers ("Settings"), for the
 * account of the profile it was saved with: the owner's device saves them once the account is
 * open, an employee's from its channel (src/lib/team/channel.ts). Kept apart from the profile, as
 * the registry record: the profile's format does not change. None, or another account's, means the
 * defaults (on-chain payments accepted, without tolerance).
 */
export type TerminalOptions = {
  /** Format of this record. A change of format needs a new version and a migration. */
  version: 1;
  /** profileAccount of the profile it belongs to: the wallet id, or the team's key. */
  account: string;
  /**
   * Whether the point of sale's invoices also offer an on-chain address (`onchainPayments` of the
   * settings); never read for the invoices of "New invoice" (invoices.ts).
   */
  onchain: boolean;
  /**
   * The tolerance of on-chain underpayments (`onchainTolerance` of the settings, basis points:
   * src/lib/onchain/tolerance.ts), which each new sale holds. Optional, the format unchanged:
   * absent from the records of apps before it, read as none; an app
   * before it ignores it and asks the whole amount, never less.
   */
  onchainTolerance?: number;
  /**
   * The merchant's own Bitcoin node (`bitcoinNode` of the settings, src/lib/onchain/node.ts),
   * where this device reads the chain; absent for mempool.space. Optional, the format unchanged:
   * absent from the records of apps before it, read as
   * mempool.space; an app before it ignores it and reads mempool.space.
   */
  bitcoinNode?: BitcoinNode;
};

export const TERMINAL_OPTIONS_VERSION = 1;

export function parseTerminalOptions(value: unknown): TerminalOptions | null {
  if (value === null || typeof value !== "object") return null;
  const o = value as Record<string, unknown>;
  if (
    o.version !== TERMINAL_OPTIONS_VERSION ||
    typeof o.account !== "string" ||
    !/^(?:[0-9a-f]{64}|[0-9a-f]{66})$/i.test(o.account) ||
    typeof o.onchain !== "boolean"
  ) {
    return null;
  }
  // Absent, or not a tolerance: none.
  const onchainTolerance = toleranceOf(o.onchainTolerance);
  // Absent, or not a node in its one spelling: mempool.space.
  const bitcoinNode = parseBitcoinNode(o.bitcoinNode);
  return {
    version: TERMINAL_OPTIONS_VERSION,
    account: o.account,
    onchain: o.onchain,
    ...(onchainTolerance > 0 ? { onchainTolerance } : {}),
    ...(bitcoinNode ? { bitcoinNode } : {})
  };
}

/**
 * What this device shows of the business and of its user, for the account
 * of the profile it was saved with: the business's logo (the owner's device saves it from the
 * account's settings, an employee's from its channel) and, on an employee's device, the
 * employee's own photo. References only (src/lib/media/image.ts): the images are on the relays.
 */
export type BrandingRecord = {
  /** Format of this record. A change of format needs a new version and a migration. */
  version: 1;
  /** profileAccount of the profile it belongs to: the wallet id, or the team's key. */
  account: string;
  logo: ImageRef | null;
  /** The employee's photo; null on an owner's device. */
  avatar: ImageRef | null;
};

export const BRANDING_RECORD_VERSION = 1;

export function parseBrandingRecord(value: unknown): BrandingRecord | null {
  if (value === null || typeof value !== "object") return null;
  const b = value as Record<string, unknown>;
  const logo = parseOptionalImageRef(b.logo);
  const avatar = parseOptionalImageRef(b.avatar);
  if (
    b.version !== BRANDING_RECORD_VERSION ||
    typeof b.account !== "string" ||
    !/^(?:[0-9a-f]{64}|[0-9a-f]{66})$/i.test(b.account) ||
    logo === undefined ||
    avatar === undefined
  ) {
    return null;
  }
  return { version: BRANDING_RECORD_VERSION, account: b.account, logo, avatar };
}

/**
 * The business's catalogue's reading keys on this device (ChannelCatalog of
 * src/lib/catalog/reader.ts), for the account of the profile
 * it was saved with: the owner's device saves them once the account is open, an employee's from
 * its channel. The point of sale lists the articles with them, in till mode too. Null: the channel
 * carries none (an older owner's app), or the employee left. A record of another
 * account is ignored.
 */
export type CatalogRecord = {
  /** Format of this record. A change of format needs a new version and a migration. */
  version: 1;
  /** profileAccount of the profile it belongs to: the wallet id, or the team's key. */
  account: string;
  reader: ChannelCatalog | null;
};

export const CATALOG_RECORD_VERSION = 1;

export function parseCatalogRecord(value: unknown): CatalogRecord | null {
  if (value === null || typeof value !== "object") return null;
  const c = value as Record<string, unknown>;
  if (
    c.version !== CATALOG_RECORD_VERSION ||
    typeof c.account !== "string" ||
    !/^(?:[0-9a-f]{64}|[0-9a-f]{66})$/i.test(c.account)
  ) {
    return null;
  }
  if (c.reader === null)
    return { version: CATALOG_RECORD_VERSION, account: c.account, reader: null };
  const reader = parseChannelCatalog(c.reader);
  return reader ? { version: CATALOG_RECORD_VERSION, account: c.account, reader } : null;
}

/**
 * Which passkey opens this device's account: its WebAuthn credential id,
 * saved each time the account opens with it (session.ts), so that unlocking and a card payment
 * while the app is locked ask for that passkey only (`allowCredentials`), not every passkey of the
 * app. Only that passkey can open the account: a PRF output, from which the wallet's seed derives,
 * is a passkey's own. Kept apart from the profile, as the registry record: the profile's format
 * does not change. No secret: the id names the passkey, it cannot use it (WebAuthn sends it in each
 * assertion). None, invalid, or of another account than the one asked: no pin, every passkey of the
 * app is offered, as before.
 */
export type PasskeyRecord = {
  /** Format of this record. A change of format needs a new version and a migration. */
  version: 1;
  /** The id of the account the passkey opens (its wallet id, getWalletId / walletIdOf). */
  account: string;
  /** The passkey's credential id, lowercase hex (WebAuthn: 1 to 1023 bytes). */
  credentialId: string;
};

export const PASSKEY_RECORD_VERSION = 1;

export function parsePasskeyRecord(value: unknown): PasskeyRecord | null {
  if (value === null || typeof value !== "object") return null;
  const r = value as Record<string, unknown>;
  if (
    r.version !== PASSKEY_RECORD_VERSION ||
    typeof r.account !== "string" ||
    !/^[0-9a-f]{66}$/i.test(r.account) ||
    typeof r.credentialId !== "string" ||
    !/^(?:[0-9a-f]{2}){1,1023}$/.test(r.credentialId)
  ) {
    return null;
  }
  return { version: PASSKEY_RECORD_VERSION, account: r.account, credentialId: r.credentialId };
}

/** Storage keys, on the device only. Never rename them: installed apps keep their data there. */
export const TERMINAL_PROFILE_KEY = "terminal-profile";
/**
 * Where a device's on-chain addresses come from (src/features/terminal/onchain-pool.ts): the pool
 * of the owner's wallet on this device, or the lot the owner gave an employee's device (its team's
 * key, src/features/team/member-addresses.ts).
 */
export type AddressPool = { kind: "wallet"; walletId: string } | { kind: "team"; team: string };

/** Validates an AddressPool read from storage; anything else counts as none. */
export function parseAddressPool(value: unknown): AddressPool | null {
  if (value === null || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (v.kind === "wallet" && typeof v.walletId === "string" && /^[0-9a-f]{66}$/i.test(v.walletId)) {
    return { kind: "wallet", walletId: v.walletId };
  }
  if (v.kind === "team" && typeof v.team === "string" && /^[0-9a-f]{64}$/.test(v.team)) {
    return { kind: "team", team: v.team };
  }
  return null;
}

export const ONCHAIN_POOL_KEY = "terminal-onchain-addresses";
export const REGISTRY_RECORD_KEY = "terminal-registry";
export const TERMINAL_OPTIONS_KEY = "terminal-options";
export const BRANDING_RECORD_KEY = "terminal-branding";
export const CATALOG_RECORD_KEY = "terminal-catalog";
export const PASSKEY_RECORD_KEY = "terminal-passkey";
