import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, concatBytes, hexToBytes, utf8ToBytes } from "@noble/hashes/utils.js";

import { deriveKey, nostrKeys, type NostrKeys } from "@/lib/nostr/keys";
import type { BusinessRegistry } from "@/lib/registry/registry";
import { secureRandomBytes } from "@/lib/random";

/*
 * The keys of a team. Everything derives from the owner's wallet secret
 * (walletSecret in src/lib/breez/seed.ts), like the settings backups but under a salt of its own:
 * the owner's passkey gives them all back on any device, and the team's roster (roster.ts) holds no
 * secret. An employee's device only ever holds the secret of its own member, and the team's
 * public key: never the wallet's seed nor its identity key (the wallet id: its Spark address, and
 * so its balance on Spark explorers, derive from it).
 *
 * Never change the salts nor the `info` strings once released: every invitation, channel and sale
 * of every team derives from them.
 */

/** Domain of the owner's team keys. */
const TEAM_SALT = "sattle.me/team";
/** Domain of the keys a member's secret gives. */
const MEMBER_SALT = "sattle.me/team-member";
/** Domain of the keys that mark who took a sale (takerTag of src/lib/registry/registry.ts). */
const TAKER_SALT = "sattle.me/declaration-taker";

/** The owner's team keys: in memory only, while the account is open (like the seed). */
export type TeamKeys = NostrKeys & {
  /** Every member's secret derives from it. */
  root: Uint8Array;
};

/**
 * The team keys of the wallet. The Nostr identity signs each member's channel: its public key is
 * the team's id, which the members' devices check every channel against.
 */
export function deriveTeamKeys(walletSecret: Uint8Array): TeamKeys {
  const root = deriveKey(walletSecret, TEAM_SALT, "team-root/v1");
  // Throws for the 0 or ≥ n keys BIP-340 refuses: an HKDF output has odds below 2^-127.
  return { root, ...nostrKeys(deriveKey(root, TEAM_SALT, "nostr-secret-key/v1")) };
}

/** Keys overwritten by wipeTeamKeys: never used again. */
const wiped = new WeakSet<TeamKeys>();

/**
 * Overwrites the secret keys with zeros, once their account closes (session.ts), like the backup
 * keys (wipeBackupKeys, same limits: best effort).
 */
export function wipeTeamKeys(keys: TeamKeys): void {
  keys.root.fill(0);
  keys.secretKey.fill(0);
  wiped.add(keys);
}

/** `keys`, unless wiped: throws then, so that zeros never sign nor derive anything. */
export function usableTeamKeys(keys: TeamKeys): TeamKeys {
  if (wiped.has(keys)) throw new Error("The team keys were wiped");
  return keys;
}

/**
 * The business's registry key (src/lib/registry/): the address of every declaration of its
 * Lightning payments derives from it. Its devices hold it (the owner's at activation, an
 * employee's from its channel) and every payment link carries it.
 */
export function deriveRegistryKey(team: TeamKeys): Uint8Array {
  return deriveKey(usableTeamKeys(team).root, TEAM_SALT, "registry-key/v1");
}

/**
 * The business's reading key of the registry (src/lib/registry/): every
 * declaration is encrypted for its sale and for this key (a NIP-44 conversation between the two),
 * so that the owner reads the declarations of every sale of the business, its employees' and its
 * payment links' included. Only the owner holds its secret; its public key travels with the
 * registry key (the devices' record, the employees' channels, the payment links).
 */
export function deriveRegistryReader(team: TeamKeys): NostrKeys {
  return nostrKeys(deriveKey(usableTeamKeys(team).root, TEAM_SALT, "registry-reader/v1"));
}

/**
 * The business's link owner key: tweaked by a sale's own key, it signs
 * the final version of that sale's payment link (src/lib/payment-link/owner-key.ts), when the
 * device that made the sale did not. Only the owner holds its secret; its public half travels with
 * the registry.
 */
export function deriveLinkOwner(team: TeamKeys): NostrKeys {
  return nostrKeys(deriveKey(usableTeamKeys(team).root, TEAM_SALT, "link-owner/v1"));
}

/**
 * The business's link key reader: the signing key of each
 * payment link is sealed for it (src/lib/payment-link/sealed-key.ts), in the link's record and in
 * the owner's copy of its month (src/lib/registry/archive.ts), so that the owner signs the link
 * again each year. Only the owner holds its secret: never in a channel, nor in an export grant
 * (src/features/team/export-grants.ts), unlike the registry's reading key, whose secret a grant
 * gives and which sealed the links' keys before (whoever held a grant could then sign as an open
 * link). Its public half travels with the registry (the devices' record, the members' channels).
 * IRREVERSIBLE: the `info` (vector in team.test.ts).
 */
export function deriveLinkKeyReader(team: TeamKeys): NostrKeys {
  return nostrKeys(deriveKey(usableTeamKeys(team).root, TEAM_SALT, "link-key-reader/v1"));
}

/**
 * The key of the tags of the on-chain addresses the owner gives its employees (src/lib/team/
 * onchain-lot.ts): only the owner holds it, so a tag tells the owner, on any
 * of its devices and without keeping a list, that it gave the address itself; an employee cannot
 * make one for an address of its own.
 */
export function deriveIssueKey(team: TeamKeys): Uint8Array {
  return deriveKey(usableTeamKeys(team).root, TEAM_SALT, "onchain-issue/v1");
}

/**
 * The business's registry as its devices and links hold it: the registry key and the public halves
 * of the reading key, of the link owner key and of the link key reader.
 */
export function deriveBusinessRegistry(team: TeamKeys): BusinessRegistry {
  return {
    key: deriveRegistryKey(team),
    reader: deriveRegistryReader(team).publicKey,
    owner: deriveLinkOwner(team).publicKey,
    linkKeyReader: deriveLinkKeyReader(team).publicKey
  };
}

const MEMBER_ID = /^[0-9a-f]{32}$/;

/** A new member's id: 16 random bytes, hex. Its record in the roster names it (roster.ts). */
export function newMemberId(): string {
  return bytesToHex(secureRandomBytes(16));
}

export function isMemberId(value: unknown): value is string {
  return typeof value === "string" && MEMBER_ID.test(value);
}

/** The secret of member `memberId`: all its keys derive from it (`deriveMemberKeys`). */
export function memberSecret(team: TeamKeys, memberId: string): Uint8Array {
  if (!isMemberId(memberId)) throw new Error("Invalid member id");
  return deriveKey(usableTeamKeys(team).root, TEAM_SALT, `member/${memberId}/v1`);
}

/**
 * The secret of the owner's device `deviceId` (`MerchantSettings.devices`):
 * its keys derive from it as a member's do (`deriveMemberKeys`): it signs the device's sales and
 * payment links, which the owner reads from any of its devices. Its own `info`, never a member's.
 */
export function ownerDeviceSecret(team: TeamKeys, deviceId: string): Uint8Array {
  if (!isMemberId(deviceId)) throw new Error("Invalid device id");
  return deriveKey(usableTeamKeys(team).root, TEAM_SALT, `owner-device/${deviceId}/v1`);
}

/** The keys of the business's catalogue of articles (src/lib/catalog/). */
export type CatalogKeys = {
  /** Signs every article: readers ask the relays for this author's events only. */
  nostr: NostrKeys;
  /** NIP-44 key of the articles. */
  encryptionKey: Uint8Array;
  /** Key of the articles' `d` tags (an HMAC of each article's id). */
  addressKey: Uint8Array;
};

/**
 * What reads the catalogue (src/lib/catalog/article.ts): the author's public key, the key of the
 * `d` tags and NIP-44 keys, tried in turn, never the author's secret. The points of sale hold one:
 * an employee's from its channel (channel.ts), the owner's devices once
 * the account opened on them, so that the point of sale reads the articles in till mode too (the
 * account closed). `CatalogKeys` is one, of the catalogue's first key.
 */
export type CatalogReader = {
  nostr: Pick<NostrKeys, "publicKey">;
  /** The NIP-44 key tried first: the catalogue's current one. */
  encryptionKey: Uint8Array;
  /** Other NIP-44 keys tried after it: of other epochs (catalogEpochKey). */
  otherKeys?: readonly Uint8Array[];
  addressKey: Uint8Array;
};

/**
 * The catalogue's keys ("Items"): only the owner writes it (the author's
 * secret derives from the team's root). Its own author, not the team's, so that a read by author
 * lists the articles alone. `encryptionKey` is the catalogue's first NIP-44 key, its epoch 0
 * (catalogEpochKey): the points of sale read it with a CatalogReader, never the author's secret.
 */
export function deriveCatalogKeys(team: TeamKeys): CatalogKeys {
  const root = usableTeamKeys(team).root;
  return {
    nostr: nostrKeys(deriveKey(root, TEAM_SALT, "catalog/author/v1")),
    encryptionKey: deriveKey(root, TEAM_SALT, "catalog/encryption-key/v1"),
    addressKey: deriveKey(root, TEAM_SALT, "catalog/address-key/v1")
  };
}

/** Domain of the catalogue's NIP-44 keys from its epoch 1 (catalogEpochKey). Never change it. */
const CATALOG_SALT = "sattle.me/catalog";

/**
 * The catalogue's NIP-44 key of `epoch` (a removed employee loses the
 * catalogue). The epoch is how many employees the team removed (src/features/catalog/catalog.ts):
 * each removal gives the catalogue a new key, its articles are sealed again with it, and only the
 * employees still in the team get it (their channels). From epoch 1, it derives from the secret the
 * owner's devices share (ownerDevicesSecret), never from what an employee holds: a device of the
 * owner's in till mode derives the keys of the epochs after the one it was told, an employee none.
 * Epoch 0 is the catalogue's first key (deriveCatalogKeys, from the team's root). Never change
 * the salt nor the `info`.
 */
export function catalogEpochKey(ownerDevicesSecret: Uint8Array, epoch: number): Uint8Array {
  if (!Number.isSafeInteger(epoch) || epoch < 1) throw new Error("Invalid catalogue epoch");
  return deriveKey(ownerDevicesSecret, CATALOG_SALT, `encryption-key/epoch/${epoch}/v1`);
}

/** How many epochs after the current one a reader of the owner's tries (catalogReaderAt). */
export const CATALOG_EPOCHS_AHEAD = 10;

/**
 * The NIP-44 keys of the CATALOG_EPOCHS_AHEAD epochs after `epoch`, in order (catalogEpochKey):
 * what one of the owner's devices tries after the key of its epoch, another of its devices having
 * maybe removed an employee since.
 */
export function catalogKeysAhead(ownerDevicesSecret: Uint8Array, epoch: number): Uint8Array[] {
  return Array.from({ length: CATALOG_EPOCHS_AHEAD }, (_, i) =>
    catalogEpochKey(ownerDevicesSecret, epoch + 1 + i)
  );
}

/** The catalogue's NIP-44 key of `epoch`, its first one at 0 (catalogEpochKey). */
export function catalogKeyAt(team: TeamKeys, epoch: number): Uint8Array {
  return epoch === 0
    ? deriveCatalogKeys(team).encryptionKey
    : catalogEpochKey(ownerDevicesSecret(team), epoch);
}

/** What writes the catalogue at `epoch`: its author, `d` tags and the NIP-44 key of that epoch. */
export function deriveCatalogWriter(team: TeamKeys, epoch: number): CatalogKeys {
  return { ...deriveCatalogKeys(team), encryptionKey: catalogKeyAt(team, epoch) };
}

/**
 * What reads every article of the catalogue for the owner, at `epoch`: its key first, then those
 * of the CATALOG_EPOCHS_AHEAD epochs after it (another of the owner's devices may have removed an
 * employee since), then those of every epoch before it (an article not sealed again yet).
 */
export function catalogReaderAt(team: TeamKeys, epoch: number): CatalogReader {
  const keys = deriveCatalogKeys(team);
  const ahead = catalogKeysAhead(ownerDevicesSecret(team), epoch);
  const before = Array.from({ length: epoch }, (_, i) => catalogKeyAt(team, epoch - 1 - i));
  return {
    nostr: { publicKey: keys.nostr.publicKey },
    encryptionKey: catalogKeyAt(team, epoch),
    otherKeys: [...ahead, ...before],
    addressKey: keys.addressKey
  };
}

/**
 * Whether the key of index `keyIndex` of a catalogReaderAt reader (CatalogCopy.keyIndex) is of an
 * epoch before the reader's: its own key first, then those ahead, then those before.
 */
export function isEarlierEpochKey(keyIndex: number): boolean {
  return keyIndex > CATALOG_EPOCHS_AHEAD;
}

/**
 * What a point of sale reads the catalogue with at `epoch` (an employee's channel, the owner's
 * devices for till mode): the key of that epoch and the one before, for the articles not sealed
 * again yet. A removed employee holds neither of the epochs after its removal.
 */
export function deriveCatalogReader(team: TeamKeys, epoch: number): CatalogReader {
  const keys = deriveCatalogKeys(team);
  return {
    nostr: { publicKey: keys.nostr.publicKey },
    encryptionKey: catalogKeyAt(team, epoch),
    otherKeys: epoch > 0 ? [catalogKeyAt(team, epoch - 1)] : [],
    addressKey: keys.addressKey
  };
}

/** The keys of the business's invoices (src/lib/invoice/). */
export type InvoiceKeys = {
  /** Signs every invoice and the counter of their numbers: readers ask for this author only. */
  nostr: NostrKeys;
  /** NIP-44 key of the records. */
  encryptionKey: Uint8Array;
  /** Key of the records' `d` tags (an HMAC of each invoice's id, and of the counter's name). */
  addressKey: Uint8Array;
};

/**
 * The keys of the invoices of "New invoice": their drafts and what
 * was sent, and the counter of their numbers, written and read by the owner's devices only (the
 * author's secret derives from the team's root). Their own author, so that a read by author lists
 * the invoices alone. Never given to an employee nor an integration.
 */
export function deriveInvoiceKeys(team: TeamKeys): InvoiceKeys {
  const root = usableTeamKeys(team).root;
  return {
    nostr: nostrKeys(deriveKey(root, TEAM_SALT, "invoices/author/v1")),
    encryptionKey: deriveKey(root, TEAM_SALT, "invoices/encryption-key/v1"),
    addressKey: deriveKey(root, TEAM_SALT, "invoices/address-key/v1")
  };
}

/**
 * The key of the shared counter of the invoices' numbers (src/lib/invoice/counter.ts: one series
 * for the owner's invoices and its assistants'): every writer of a number
 * (the owner's devices, each assistant) seals its own copy of the
 * counter with keys derived from it, and reads the others'. The owner's devices derive it; each
 * assistant's channel gives it (src/lib/team/channel.ts). It opens and makes counters only: never
 * an invoice. Not revocable: a removed assistant still holds it, its counters dated after its
 * removal no longer count. Never change the `info`.
 */
export function invoiceCounterKey(team: TeamKeys): Uint8Array {
  return deriveKey(usableTeamKeys(team).root, TEAM_SALT, "invoices/counter-key/v1");
}

/** The keys of the recoveries of the account's wallets' funds (src/lib/recovery/record.ts). */
export type FundsRecoveryKeys = {
  /** Signs every wallet's record: readers ask the relays for this author's events only. */
  nostr: NostrKeys;
  /** NIP-44 key of the records. */
  encryptionKey: Uint8Array;
  /** Key of the records' `d` tags (an HMAC of each wallet's name: the account's, a card's). */
  addressKey: Uint8Array;
};

/**
 * The keys of the record of each of the account's wallets whose funds left the balance (the
 * deposit address reserved for their recovery, and the transactions that brought
 * them back), written and read by the owner's devices only (the author's secret derives from the
 * team's root). Its own author, so that a read by author lists these records alone. Never given to
 * an employee nor an integration.
 */
export function deriveFundsRecoveryKeys(team: TeamKeys): FundsRecoveryKeys {
  const root = usableTeamKeys(team).root;
  return {
    nostr: nostrKeys(deriveKey(root, TEAM_SALT, "funds-recovery/author/v1")),
    encryptionKey: deriveKey(root, TEAM_SALT, "funds-recovery/encryption-key/v1"),
    addressKey: deriveKey(root, TEAM_SALT, "funds-recovery/address-key/v1")
  };
}

/** Overwrites the keys of deriveFundsRecoveryKeys with zeros, once their operation is over. */
export function wipeFundsRecoveryKeys(keys: FundsRecoveryKeys): void {
  keys.nostr.secretKey.fill(0);
  keys.encryptionKey.fill(0);
  keys.addressKey.fill(0);
}

/**
 * The `d` tag of a funds recovery record, from its wallet's name (src/lib/recovery/record.ts):
 * 32 bytes, hex. Under the team's salt, as the keys it comes from.
 */
export function fundsRecoveryAddressOf(keys: FundsRecoveryKeys, name: string): string {
  return bytesToHex(deriveKey(keys.addressKey, TEAM_SALT, `funds-recovery/address/v1/${name}`));
}

/** The keys of the team's roster (src/lib/team/roster.ts). */
export type RosterKeys = {
  /** Signs every seat's record: readers ask the relays for this author's events only. */
  nostr: NostrKeys;
  /** NIP-44 key of the records. */
  encryptionKey: Uint8Array;
  /** Key of the records' `d` tags (an HMAC of each seat's role and id). */
  addressKey: Uint8Array;
};

/**
 * The roster's keys ("Employees", "Integrations"): one record per
 * employee and per integration, written and read by the owner's devices only (the author's secret
 * derives from the team's root). Its own author, not the team's nor the catalogue's, so that a read
 * by author lists the seats alone. Never given to an employee nor an integration: their channel
 * (channel.ts) tells them what they need.
 */
export function deriveRosterKeys(team: TeamKeys): RosterKeys {
  const root = usableTeamKeys(team).root;
  return {
    nostr: nostrKeys(deriveKey(root, TEAM_SALT, "roster/author/v1")),
    encryptionKey: deriveKey(root, TEAM_SALT, "roster/encryption-key/v1"),
    addressKey: deriveKey(root, TEAM_SALT, "roster/address-key/v1")
  };
}

/** The keys of the rates of the wallet's payments (src/lib/rates/payment-rates.ts). */
export type PaymentRateKeys = {
  /** Signs every payment's rate: readers ask the relays for this author's events only. */
  nostr: NostrKeys;
  /** NIP-44 key of the records. */
  encryptionKey: Uint8Array;
  /** Key of the records' `d` tags (an HMAC of each payment's id). */
  addressKey: Uint8Array;
};

/**
 * The keys of the price of bitcoin at each payment of the wallet (recorded once, never asked again
 * by "Export"), written and read by the owner's devices only
 * (the author's secret derives from the team's root). Their own author, so that a read by author
 * lists the rates alone. Never given to an employee nor an integration.
 */
export function derivePaymentRateKeys(team: TeamKeys): PaymentRateKeys {
  const root = usableTeamKeys(team).root;
  return {
    nostr: nostrKeys(deriveKey(root, TEAM_SALT, "payment-rates/author/v1")),
    encryptionKey: deriveKey(root, TEAM_SALT, "payment-rates/encryption-key/v1"),
    addressKey: deriveKey(root, TEAM_SALT, "payment-rates/address-key/v1")
  };
}

/**
 * The keys of the record of each payment the account's wallet sent (src/lib/wallet-sends/record.ts;
 * the owner's app publishes each
 * sending and withdrawal as soon as it makes it, for the assistants' export): written by the
 * owner's devices (the author's secret derives from the team's root), read by them and by the
 * assistants the owner allows to (their grant gives the NIP-44 key and the author, never the
 * author's secret). Their own author: a read by author lists the sendings alone.
 */
export type WalletSendKeys = {
  /** Signs every sending's record: readers ask the relays for this author's events only. */
  nostr: NostrKeys;
  /** NIP-44 key of the records. */
  encryptionKey: Uint8Array;
  /** Key of the records' `d` tags (an HMAC of each payment's id). */
  addressKey: Uint8Array;
};

/** IRREVERSIBLE: the `info` strings (vector in wallet-sends.test.ts). */
export function deriveWalletSendKeys(team: TeamKeys): WalletSendKeys {
  const root = usableTeamKeys(team).root;
  return {
    nostr: nostrKeys(deriveKey(root, TEAM_SALT, "wallet-sends/author/v1")),
    encryptionKey: deriveKey(root, TEAM_SALT, "wallet-sends/encryption-key/v1"),
    addressKey: deriveKey(root, TEAM_SALT, "wallet-sends/address-key/v1")
  };
}

/**
 * The keys of the record of each sale to Mt Pelerin (src/lib/mtpelerin/sale-record.ts: a sale
 * keeps its rate, its amount wired, its bank account…): written and
 * read by the owner's devices only (the author's secret derives from the team's root), never given
 * to an employee, an integration nor an assistant (its IBAN). Their own author: a read by author
 * lists the sales alone.
 */
export type MtpSaleKeys = {
  /** Signs every sale's record: readers ask the relays for this author's events only. */
  nostr: NostrKeys;
  /** NIP-44 key of the records. */
  encryptionKey: Uint8Array;
  /** Key of the records' `d` tags (an HMAC of each sale's payment hash). */
  addressKey: Uint8Array;
};

/** IRREVERSIBLE: the `info` strings (vector in mtpelerin-sale-record.test.ts). */
export function deriveMtpSaleKeys(team: TeamKeys): MtpSaleKeys {
  const root = usableTeamKeys(team).root;
  return {
    nostr: nostrKeys(deriveKey(root, TEAM_SALT, "mtpelerin-sales/author/v1")),
    encryptionKey: deriveKey(root, TEAM_SALT, "mtpelerin-sales/encryption-key/v1"),
    addressKey: deriveKey(root, TEAM_SALT, "mtpelerin-sales/address-key/v1")
  };
}

/**
 * The keys of the owner's copy of a month's declarations and payment links
 * (src/lib/registry/archive.ts).
 */
export type ArchiveKeys = {
  /** Signs every month's copy: readers ask the relays for this author's events only. */
  nostr: NostrKeys;
  /** NIP-44 key of the copies. */
  encryptionKey: Uint8Array;
  /** Key of the copies' `d` tags (an HMAC of each month and part). */
  addressKey: Uint8Array;
  /**
   * The owner's copies only: the link key reader (deriveLinkKeyReader), which seals and opens the
   * keys of the copies' links (src/lib/registry/archive.ts, format 4). Never in a grant: an
   * assistant allowed to export reads the copies (encryptionKey), never their links' keys.
   */
  linkKeyReader?: NostrKeys;
};

/**
 * The keys of the owner's copy of the declarations and the payment links ("Wallet"): written and
 * read by the owner's devices only (the author's secret derives from the
 * team's root). Its own author, so that a read by author lists the copies alone. Never given to an
 * employee nor an integration; an assistant's export grant gives the reading keys alone, never the
 * link key reader.
 */
export function deriveArchiveKeys(team: TeamKeys): ArchiveKeys {
  const root = usableTeamKeys(team).root;
  return {
    nostr: nostrKeys(deriveKey(root, TEAM_SALT, "owner-archive/author/v1")),
    encryptionKey: deriveKey(root, TEAM_SALT, "owner-archive/encryption-key/v1"),
    addressKey: deriveKey(root, TEAM_SALT, "owner-archive/address-key/v1"),
    linkKeyReader: deriveLinkKeyReader(team)
  };
}

/**
 * The keys of the history copied from the v2 account (src/lib/legacy-v2/history-records.ts):
 * written and read by the owner's devices only (the author's
 * secret derives from the team's root). Its own author, so that a read by author lists that
 * history alone. Never given to an employee nor an integration.
 */
export function deriveLegacyHistoryKeys(team: TeamKeys): ArchiveKeys {
  const root = usableTeamKeys(team).root;
  return {
    nostr: nostrKeys(deriveKey(root, TEAM_SALT, "legacy-history/author/v1")),
    encryptionKey: deriveKey(root, TEAM_SALT, "legacy-history/encryption-key/v1"),
    addressKey: deriveKey(root, TEAM_SALT, "legacy-history/address-key/v1")
  };
}

/**
 * The keys of the owner's acceptances of integrations' orders made after their invoice's end
 * (src/lib/integrations/late-acceptance.ts): written and read by
 * the owner's devices only (the team signs them, these keys derive from the team's root). Never
 * given to an employee, an integration nor an assistant: no integration's server reads them.
 */
export type LateAcceptanceKeys = {
  /** NIP-44 key of the records. */
  encryptionKey: Uint8Array;
  /** Key of the records' `d` tags (an HMAC of each invoice). */
  addressKey: Uint8Array;
};

/** IRREVERSIBLE: the `info` strings (vector in late-acceptance.test.ts). */
export function deriveLateAcceptanceKeys(team: TeamKeys): LateAcceptanceKeys {
  const root = usableTeamKeys(team).root;
  return {
    encryptionKey: deriveKey(root, TEAM_SALT, "integration-late-acceptance/encryption-key/v1"),
    addressKey: deriveKey(root, TEAM_SALT, "integration-late-acceptance/address-key/v1")
  };
}

/**
 * The key of the account's integration `integrationId` (its record in the roster,
 * docs/integrations.md): its secret key carries it, which the integrator keeps on its server; the
 * owner derives it again from the id to show that key and publish the integration's channel
 * (deriveIntegrationKeys, src/lib/integrations/keys.ts). Its own `info`, never a member's nor a
 * device's.
 */
export function integrationSecretKey(team: TeamKeys, integrationId: string): Uint8Array {
  if (!isMemberId(integrationId)) throw new Error("Invalid integration id");
  return deriveKey(usableTeamKeys(team).root, TEAM_SALT, `integration/${integrationId}/v1`);
}

/**
 * The key of the account's assistant `assistantId`: its secret key carries it
 * (src/lib/assistant/keys.ts), which the MCP server (local
 * or hosted) of its owner keeps; the owner derives it again from the id to publish the assistant's channel and
 * read what it writes (its invoices, its links, its counter). Its own `info`, never a member's, a
 * device's nor an integration's.
 */
export function assistantSecretKey(team: TeamKeys, assistantId: string): Uint8Array {
  if (!isMemberId(assistantId)) throw new Error("Invalid assistant id");
  return deriveKey(usableTeamKeys(team).root, TEAM_SALT, `assistant/${assistantId}/v1`);
}

/**
 * The secret all the owner's devices share, kept by each next to its own
 * (owner-device.ts): what only they read is sealed with keys derived from it, the notice of a move
 * of the account's relays (src/lib/relays/moved.ts). Never sent: each device derives it from the
 * passkey when the account opens on it, the same on every device; employees and payers hold only
 * other derivatives of the root (HKDF is one-way). Not revocable: a device that kept it keeps it.
 */
export function ownerDevicesSecret(team: TeamKeys): Uint8Array {
  return deriveKey(usableTeamKeys(team).root, TEAM_SALT, "owner-devices/v1");
}

/**
 * The key the owner's devices mark their sales' declarations with (takerTag: "You" in "Wallet"
 * for good, not only while the devices' records are read),
 * from the secret they share (ownerDevicesSecret): employees and payers cannot make the mark.
 */
export function ownerTakerKey(ownerDevicesSecret: Uint8Array): Uint8Array {
  return deriveKey(ownerDevicesSecret, TAKER_SALT, "owner-devices/v1");
}

/**
 * The key an employee's device marks its sales' declarations with (takerTag), from its member's
 * secret: the owner computes it for every employee of the roster, a removed one included (its
 * sales paid before its removal stay its own, src/features/activity/model.ts).
 */
export function memberTakerKey(memberSecret: Uint8Array): Uint8Array {
  return deriveKey(memberSecret, TAKER_SALT, "member/v1");
}

/** What a member's secret gives: the owner computes them all, the member's device holds them. */
export type MemberKeys = {
  /** Signs the member's records: its devices and its sales. */
  nostr: NostrKeys;
  /** The member's channel (signed by the team): `d` tag and NIP-44 key. */
  channel: { address: string; encryptionKey: Uint8Array };
  /**
   * The invitation: opened with the key of the link, and signed by a key the link gives too
   * (inviteAuthor), so that a reader asks the relays for its author's events only. `deviceKey`
   * proves which device used it (invite.ts, deviceProof): only a holder of the member's secret
   * has it, never someone who holds the link alone.
   */
  invite: { nostr: NostrKeys; encryptionKey: Uint8Array; deviceKey: Uint8Array };
  /** The member's devices and sales: NIP-44 key, and the key of their `d` tags. */
  records: { encryptionKey: Uint8Array; addressKey: Uint8Array };
  /**
   * Signs the records of the member's payment links (member-records.ts):
   * their own author, so that the owner reads a year of links without the year's sales. Same
   * NIP-44 key and `d` tags as the other records.
   */
  links: NostrKeys;
};

/**
 * The author of an invitation, from the key of its link: whoever holds the link knows who signs it
 * (and can sign as it, as it can open the member's secret), so that a reader asks the relays for
 * that author's events only, where anyone else's at its address could push it out of a relay's
 * answer or pass for a record of a newer format.
 */
export function inviteAuthor(linkKey: Uint8Array): NostrKeys {
  return nostrKeys(deriveKey(linkKey, MEMBER_SALT, "invite/author/v1"));
}

export function deriveMemberKeys(secret: Uint8Array): MemberKeys {
  const derive = (info: string) => deriveKey(secret, MEMBER_SALT, info);
  const inviteKey = derive("invite/encryption-key/v1");
  return {
    nostr: nostrKeys(derive("nostr-secret-key/v1")),
    channel: {
      address: bytesToHex(derive("channel/address/v1")),
      encryptionKey: derive("channel/encryption-key/v1")
    },
    invite: {
      nostr: inviteAuthor(inviteKey),
      encryptionKey: inviteKey,
      deviceKey: derive("invite/device-key/v1")
    },
    records: {
      encryptionKey: derive("records/encryption-key/v1"),
      addressKey: derive("records/address-key/v1")
    },
    links: nostrKeys(derive("links/nostr-secret-key/v1"))
  };
}

/** The opaque `d` tag of one of a member's records: an HMAC of what it is about. */
export function recordAddress(keys: MemberKeys, subject: string): string {
  return bytesToHex(hmac(sha256, keys.records.addressKey, utf8ToBytes(subject)));
}

/** Prefix of the hash that gives an invitation's id. */
const INVITE_ID_PREFIX = utf8ToBytes("sattle.me/team-invite/id/v1");
/** Prefix of the hash that gives an invitation's `d` tag from its id. */
const INVITE_ADDRESS_PREFIX = utf8ToBytes("sattle.me/team-invite/address/v1");

/**
 * The id of an invitation (16 bytes): a hash of its author's key and of the team's. Whoever holds
 * the link can open the invitation, and so sign as its author, but cannot make it name another
 * team: the joining device only takes channels signed by the team the id commits to.
 */
export function inviteId(invitePublicKey: string, teamPublicKey: string): Uint8Array {
  return sha256(
    concatBytes(INVITE_ID_PREFIX, hexToBytes(invitePublicKey), hexToBytes(teamPublicKey))
  ).slice(0, 16);
}

/** The `d` tag of the invitation `id`: the relays never see the id of the link. */
export function inviteAddress(id: Uint8Array): string {
  return bytesToHex(sha256(concatBytes(INVITE_ADDRESS_PREFIX, id)));
}
