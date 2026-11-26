import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";

import { exportEpochAuthor } from "@/lib/team/export-epoch";
import { majority } from "@/config/registry";
import { linkHolders, removedHolders, type LinkHolder } from "@/features/payment-link/owner-finals";
import { catalogEpochOf, type Roster } from "@/features/team/roster";
import type { BackupKeys } from "@/lib/backup/keys";
import { articlesOf } from "@/lib/catalog/article";
import { imageAuthor, type ImageRef } from "@/lib/media/image";
import { DELETION_KIND, deletionRequests, eventAddress } from "@/lib/nostr/deletion";
import { isValidEvent, type NostrEvent } from "@/lib/nostr/event";
import { nostrKeys, type NostrKeys } from "@/lib/nostr/keys";
import { COPIES_AT_ONCE, publishToRelays, queryRelaysPaged } from "@/lib/nostr/pool";
import { RECORD_KIND } from "@/lib/nostr/record";
import { MTP_ENVIRONMENTS } from "@/lib/mtpelerin/environment";
import { deriveMtpSessionKeys } from "@/lib/mtpelerin/shared-session";
import { saleOwnerSecretKey } from "@/lib/payment-link/owner-key";
import { ownerOnchainPaymentsOf } from "@/lib/registry/onchain-payments";
import { deriveSaleKeys, ownerDeclarationsOf } from "@/lib/registry/registry";
import { unionRelays } from "@/lib/relays/list";
import type { MerchantSettings } from "@/lib/settings/merchant";
import { deriveAssistantKeys } from "@/lib/assistant/keys";
import { deriveIntegrationKeys } from "@/lib/integrations/keys";
import {
  catalogReaderAt,
  deriveArchiveKeys,
  deriveCatalogKeys,
  deriveFundsRecoveryKeys,
  deriveInvoiceKeys,
  deriveLinkOwner,
  derivePaymentRateKeys,
  deriveWalletSendKeys,
  deriveMtpSaleKeys,
  deriveRegistryKey,
  deriveRegistryReader,
  deriveRosterKeys,
  assistantSecretKey,
  integrationSecretKey,
  ownerDevicesSecret,
  type CatalogKeys,
  type CatalogReader,
  type TeamKeys
} from "@/lib/team/keys";
import { memberRecordsOf, profilesOf } from "@/lib/team/member-records";
import { TEAM_TIMEOUT_MS } from "@/lib/team/shared";

/*
 * "Delete account" on the Nostr relays (everything the account can
 * find again): every event the account's keys signed, found by author, is
 * named in a deletion request (NIP-09, src/lib/nostr/deletion.ts) signed by that author, on the
 * relays that sent it. The authors:
 * - the account's own: its backup key (backups, notices of a move of relays), the team's (channels
 *   of the employees and integrations, their lots of on-chain addresses, the owner's acceptances of
 *   their orders, src/lib/integrations/late-acceptance.ts included, the assistants' grants of
 *   the export, src/lib/assistant/export-grant.ts), the roster's (the
 *   records of the employees and integrations, src/lib/team/roster.ts), the catalogue's, the
 *   invoices' ("New invoice": each invoice, its client's details, and the counter of their
 *   numbers, src/lib/invoice/), the Mt Pelerin sessions' (src/lib/mtpelerin/shared-session.ts), and
 *   the cards' (their states, the merchants they pay without asking, their payments: src/lib/card/);
 * - each employee's and assistant's (in the team or removed: the roster's) and each of the owner's
 *   devices' (`settings.devices`): their records, an employee's invitation, an assistant's
 *   invoices and its copy of the counter of their numbers;
 * - each image the account still names: the logo, the articles' photos, the employees' photos,
 *   the images of its cards' looks and their issuers' visuals;
 * - each sale found: its declarations in the registry (the sale's key, which a declaration of a
 *   payment the records or the wallet know gives, as a payment link's record does), and the
 *   owner's final version of a payment link.
 * What no key of the account signs stays: a payment link's own event (signed by a random key, gone
 * from its device once final), an image replaced (its reference is gone), a sale nothing names any
 * more (an unpaid invoice of an integration's server, a sale of a device not listed).
 *
 * Requests deleting the team's events also name every channel's address, read or not: an employee's
 * device that no longer finds its channel reads them as the business deleted (member.ts), and
 * forgets it. They stay on the relays, as NIP-09 asks of every request.
 *
 * Done only once a majority of the account's relays answered every read (anything they hold was
 * read), then proven by a second read: a majority of them must answer it and hold nothing the
 * requests named (ErasureError "notDeleted" otherwise; "unfinished" for the backup key's, sent
 * last, see below). On the other relays (the device's, the lists the account left, the relays of
 * its payment links), as far as they answer.
 */

/** Authors read at once (one filter): each is 64 hex digits of a relay's message. */
export const AUTHORS_PER_READ = 20;

export type ErasureErrorCode =
  /** Fewer than a majority of the account's relays answered a read: something may be missed. */
  | "unreachable"
  /**
   * Fewer than a majority of the account's relays hold nothing of the account after the requests,
   * the backup key's not sent yet: the account stays whole for its other devices.
   */
  | "notDeleted"
  /**
   * Everything but the backup's deletion is confirmed, and its requests may be out: the account's
   * other devices may forget it already. A next attempt finishes it.
   */
  | "unfinished";

export class ErasureError extends Error {
  readonly code: ErasureErrorCode;

  constructor(code: ErasureErrorCode, message: string) {
    super(message);
    this.name = "ErasureError";
    this.code = code;
  }
}

/**
 * The account's keys: from the passkey confirmed for the deletion, not from the open account.
 * `cards`: the authors of the cards' records (card-record.ts, payee-records.ts,
 * history-records.ts, and history-months.ts for the parts of the months' copies), derived from the
 * card root.
 */
export type ErasureKeys = { backup: BackupKeys; team: TeamKeys; cards: readonly NostrKeys[] };

export type ErasureProgress = {
  phase: "reading" | "deleting" | "checking";
  /** Authors done in this phase, out of `total`. */
  done: number;
  total: number;
};

export type ErasureInput = {
  keys: ErasureKeys;
  settings: MerchantSettings;
  /**
   * The roster as a majority of the account's relays gave it (src/features/team/roster.ts): every
   * employee, integration and assistant, those removed included, whose channels and records go too.
   */
  roster: Seats;
  /** Hex: the payment hashes the wallet lists (its whole history), whose declarations go too. */
  paymentHashes: readonly string[];
  /** The images the account's cards name (their looks, their issuers' visuals), which go too. */
  cardImages: readonly ImageRef[];
  /** Relays besides the account's that may hold its events (read; written only where they do). */
  otherRelays: readonly string[];
  /** The network of invoices (invoiceNetwork): declarations of another are not the account's. */
  network: string;
  onProgress?: (progress: ErasureProgress) => void;
  /** Unix seconds: the requests' date. */
  now: number;
};

export type ErasureOutcome = {
  /** How many events the requests named. */
  named: number;
  /**
   * Relays that held some of them, or are the account's, and still do, or did not answer the
   * check: a minority of the account's at most.
   */
  unconfirmed: string[];
};

type Author = {
  keys: NostrKeys;
  /** Addresses named whether read or not (the team: its channels). */
  addresses: string[];
};

type Read = {
  /** By relay, the valid events of the authors read (deletion requests left out). */
  events: Map<string, NostrEvent[]>;
  /** The relays that answered every read. */
  answered: Set<string>;
};

/** Deletes on the relays what the account's keys signed (see above). */
export async function eraseAccountRecords(input: ErasureInput): Promise<ErasureOutcome> {
  const { keys, settings, roster, now } = input;
  const accountRelays = settings.relays;
  const relays = unionRelays(accountRelays, input.otherRelays);
  const progress = input.onProgress ?? (() => {});
  const secrets: Uint8Array[] = [];
  try {
    // 1. The keys the settings name, and what they signed.
    const fixed = fixedAuthors(keys, settings, roster);
    // The account's own keys are the caller's to wipe.
    const own = new Set([
      keys.backup.secretKey,
      keys.team.secretKey,
      ...keys.cards.map((card) => card.secretKey)
    ]);
    for (const { keys: author } of fixed.authors) {
      if (!own.has(author.secretKey)) secrets.push(author.secretKey);
    }
    const first = await readAuthors(fixed.authors, relays, accountRelays, (done) =>
      progress({ phase: "reading", done, total: fixed.authors.length })
    );
    requireMajority(first.answered, accountRelays);

    // 2. What these events name: the sales, the payment links, the images.
    const found = await discover(input, fixed, first, secrets);
    const linkRelays = unionRelays(relays, found.relays);
    const second = await readAuthors(found.authors, linkRelays, accountRelays, (done) =>
      progress({
        phase: "reading",
        done: fixed.authors.length + done,
        total: fixed.authors.length + found.authors.length
      })
    );
    requireMajority(second.answered, accountRelays);
    // The relays only payment links named: the account's keys may have signed there too.
    const extra = linkRelays.filter((relay) => !relays.includes(relay));
    const third =
      extra.length > 0
        ? await readAuthors(fixed.authors, extra, extra, () => {})
        : { events: new Map<string, NostrEvent[]>(), answered: new Set<string>() };

    // 3. The requests, each on the account's relays and on those that sent its author's events
    // (a relay a read stopped before may hold some: every event read on a majority is named), then
    // the check. The team's and the backup key's on a majority of the account's relays at least:
    // its employees' devices, and its other devices, read them there from a majority. The backup key's
    // last: the account's other devices forget it once they read
    // its deletion (src/lib/backup/deletion.ts), so it goes out only once everything else is gone;
    // a failure before leaves the account whole for them.
    const authors = [...fixed.authors, ...found.authors];
    const held = merge(merge(first.events, second.events), third.events);
    const byAuthor = eventsByAuthor(held);
    const holding = relaysHolding(held);
    const isBackup = (author: Author) => author.keys.publicKey === keys.backup.publicKey;
    const todo = (group: readonly Author[]) =>
      group.filter((author) => byAuthor.has(author.keys.publicKey) || author.addresses.length > 0);
    const rest = authors.filter((author) => !isBackup(author));
    const last = authors.filter(isBackup);
    const total = todo(authors).length;
    const counts = { named: 0, deleted: 0, checked: 0 };

    /** The requests of `group`'s authors, then the check of what the relays still hold of them. */
    const deleteAndCheck = async (group: readonly Author[]): Promise<string[]> => {
      const dates = new Map<string, number>();
      let tombstoneRelays = accountRelays.length;
      const pending = todo(group);
      for (let start = 0; start < pending.length; start += COPIES_AT_ONCE) {
        await Promise.all(
          pending.slice(start, start + COPIES_AT_ONCE).map(async (author) => {
            const own = byAuthor.get(author.keys.publicKey);
            const events = [...(own?.events.values() ?? [])];
            const requests = deletionRequests(author.keys.secretKey, events, now, author.addresses);
            counts.named += events.length;
            dates.set(author.keys.publicKey, Math.max(...requests.map((r) => r.created_at)));
            const targets = unionRelays(accountRelays, [...(own?.relays ?? [])]);
            const took = await Promise.all(
              requests.map((request) =>
                publishToRelays(
                  request,
                  {
                    relays: targets,
                    timeoutMs: TEAM_TIMEOUT_MS.background,
                    channel: "account",
                    authKey: author.keys.secretKey
                  },
                  // A majority of the account's relays decides; the others take it in the
                  // background, while the app runs.
                  { quorum: { lists: [accountRelays] } }
                )
              )
            );
            if (author.addresses.length > 0 || isBackup(author)) {
              // The relays that took every request of the team's, or of the backup key's: where
              // the devices find them (src/lib/backup/deletion.ts).
              const all = accountRelays.filter((relay) =>
                took.every((list) => list.includes(relay))
              );
              tombstoneRelays = Math.min(tombstoneRelays, all.length);
            }
          })
        );
        counts.deleted += Math.min(COPIES_AT_ONCE, pending.length - start);
        progress({ phase: "deleting", done: counts.deleted, total });
      }
      if (tombstoneRelays < majority(accountRelays.length)) {
        throw new ErasureError("notDeleted", "No majority of the relays took the requests");
      }
      // The check: what the relays still hold of what was named.
      const checkedBefore = counts.checked;
      const check = await readAuthors(group, linkRelays, accountRelays, (done) => {
        counts.checked = checkedBefore + done;
        progress({ phase: "checking", done: counts.checked, total: authors.length });
      });
      // An author no request named (nothing of it read before) still holds what it signed by `now`.
      const remains = (relay: string) =>
        !check.answered.has(relay) ||
        (check.events.get(relay) ?? []).some(
          (event) => event.created_at <= (dates.get(event.pubkey) ?? now)
        );
      const clean = accountRelays.filter((relay) => !remains(relay));
      if (clean.length < majority(accountRelays.length)) {
        throw new ErasureError("notDeleted", "The relays still hold events of the account");
      }
      // Every relay that held something, or is the account's, and did not prove it holds nothing.
      return linkRelays.filter(
        (relay) => (accountRelays.includes(relay) || holding.has(relay)) && remains(relay)
      );
    };

    const unconfirmed = await deleteAndCheck(rest);
    let lastUnconfirmed: string[];
    try {
      lastUnconfirmed = await deleteAndCheck(last);
    } catch (error) {
      // The backup key's requests may be out already: the account is deleted for its other devices.
      if (error instanceof ErasureError) {
        throw new ErasureError(
          "unfinished",
          `The backup's deletion is not confirmed: ${error.message}`
        );
      }
      throw error;
    }
    return { named: counts.named, unconfirmed: unionRelays(unconfirmed, lastUnconfirmed) };
  } finally {
    // The keys derived here go with the deletion (AGENTS.md: never longer than needed).
    for (const secret of secrets) secret.fill(0);
  }
}

function requireMajority(answered: ReadonlySet<string>, accountRelays: readonly string[]): void {
  const count = accountRelays.filter((relay) => answered.has(relay)).length;
  if (count < majority(accountRelays.length)) {
    throw new ErasureError("unreachable", "Fewer than a majority of the relays answered");
  }
}

type FixedAuthors = {
  authors: Author[];
  /** The employees and the owner's devices: whose records name sales and links. */
  holders: LinkHolder[];
  catalog: CatalogKeys;
  /** Reads the catalogue's articles whatever its epoch (their photos are erased too). */
  catalogReader: CatalogReader;
};

/** The seats of the roster the deletion names: in the team, and removed. */
export type Seats = Pick<Roster, "employees" | "integrations" | "assistants" | "removed">;

/**
 * Whose records name the business's sales and payment links: the roster's employees and
 * assistants, those removed included (with their removal, `until`: removedHolders), and the
 * owner's `devices` (linkHolders).
 */
export function accountHolders(
  team: TeamKeys,
  roster: Pick<Seats, "employees" | "assistants" | "removed">,
  devices: MerchantSettings["devices"]
): LinkHolder[] {
  return [
    ...linkHolders(team, roster.employees, devices, roster.assistants),
    ...removedHolders(team, roster.removed, {
      except: [...roster.employees, ...roster.assistants].map(({ id }) => id)
    })
  ];
}

/** The authors the settings and the roster name (see above). */
function fixedAuthors(
  { backup, team, cards }: ErasureKeys,
  settings: MerchantSettings,
  roster: Seats
): FixedAuthors {
  const integrations = new Set(roster.integrations.map((integration) => integration.id));
  for (const seat of roster.removed) if (seat.role === "integration") integrations.add(seat.id);
  // Every assistant, those removed included: its invoices and its copy of the shared counter.
  const assistants = new Set(roster.assistants.map((assistant) => assistant.id));
  for (const seat of roster.removed) if (seat.role === "assistant") assistants.add(seat.id);
  const holders = accountHolders(team, roster, settings.devices);
  const channels = [
    ...holders.filter(({ employee }) => employee).map(({ keys }) => keys.channel.address),
    ...[...integrations].map(
      (id) => deriveIntegrationKeys(integrationSecretKey(team, id)).channel.address
    )
  ].map((address) => eventAddress(RECORD_KIND, team.publicKey, address));
  const catalog = deriveCatalogKeys(team);
  const authors: Author[] = [
    { keys: { secretKey: backup.secretKey, publicKey: backup.publicKey }, addresses: [] },
    { keys: { secretKey: team.secretKey, publicKey: team.publicKey }, addresses: channels },
    // The roster's records: who was in the team, and when they left.
    { keys: deriveRosterKeys(team).nostr, addresses: [] },
    // The owner's copy of the declarations (src/lib/registry/archive.ts).
    { keys: deriveArchiveKeys(team).nostr, addresses: [] },
    // The account's export epoch (src/lib/team/export-epoch.ts).
    { keys: exportEpochAuthor(ownerDevicesSecret(team)), addresses: [] },
    // The price of bitcoin at each payment of the wallet (src/lib/rates/payment-rates.ts).
    { keys: derivePaymentRateKeys(team).nostr, addresses: [] },
    // Each payment the wallet sent, for the assistants' export (src/lib/wallet-sends/record.ts).
    { keys: deriveWalletSendKeys(team).nostr, addresses: [] },
    // Each sale to Mt Pelerin, as agreed (src/lib/mtpelerin/sale-record.ts).
    { keys: deriveMtpSaleKeys(team).nostr, addresses: [] },
    // The recoveries of the wallets' funds that left their balance (src/lib/recovery/record.ts).
    { keys: deriveFundsRecoveryKeys(team).nostr, addresses: [] },
    // The account's Mt Pelerin sessions, one per Mt Pelerin (src/lib/mtpelerin/shared-session.ts).
    ...MTP_ENVIRONMENTS.map((environment) => ({
      keys: deriveMtpSessionKeys(team, environment).nostr,
      addresses: []
    })),
    { keys: catalog.nostr, addresses: [] },
    // The invoices of "New invoice" and the counter of their numbers (src/lib/invoice/).
    { keys: deriveInvoiceKeys(team).nostr, addresses: [] },
    // The cards' records: their states, the merchants they pay without asking, their payments.
    ...cards.map((card) => ({ keys: card, addresses: [] })),
    ...holders.flatMap(({ keys, employee, assistant }) => [
      { keys: keys.nostr, addresses: [] },
      // The records of its payment links, under their own author.
      { keys: keys.links, addresses: [] },
      // An employee's invitation, open or closed (an assistant has none).
      ...(employee && !assistant ? [{ keys: keys.invite.nostr, addresses: [] }] : [])
    ]),
    ...[...assistants].map((id) => ({
      keys: deriveAssistantKeys(assistantSecretKey(team, id)).invoices.nostr,
      addresses: []
    }))
  ];
  return {
    authors: dedupe(authors),
    holders,
    catalog,
    catalogReader: catalogReaderAt(team, catalogEpochOf(roster))
  };
}

/**
 * The authors the events of `read` name: the sales of the records (and the wallet's payments), the
 * payment links, the images. Their secret keys join `secrets`, wiped once the deletion is over.
 */
async function discover(
  input: ErasureInput,
  fixed: FixedAuthors,
  read: Read,
  secrets: Uint8Array[]
): Promise<{ authors: Author[]; relays: string[] }> {
  const { keys, settings, network } = input;
  // Grouped once: every holder's records, then the catalogue's, are read among them.
  const byAuthor = new Map<string, NostrEvent[]>();
  for (const event of [...read.events.values()].flat()) {
    const list = byAuthor.get(event.pubkey);
    if (list) list.push(event);
    else byAuthor.set(event.pubkey, [event]);
  }
  const of = (publicKey: string) => byAuthor.get(publicKey) ?? [];
  const hashes = new Set(input.paymentHashes.map((hash) => hash.toLowerCase()));
  // The transactions the points of sale saw paying their sales' addresses: their declarations give
  // the keys of the sales that showed an address alone, which declared no invoice (useSale.ts).
  const txids = new Set<string>();
  const saleKeys = new Map<string, Uint8Array>();
  const linkSaleKeys = new Map<string, Uint8Array>();
  let relays: string[] = [];
  for (const holder of fixed.holders) {
    const records = memberRecordsOf(holder.keys, [
      ...of(holder.keys.nostr.publicKey),
      ...of(holder.keys.links.publicKey)
    ]);
    for (const sale of records.sales) {
      if (sale.paymentHash !== null) hashes.add(sale.paymentHash.toLowerCase());
    }
    for (const sighting of records.sightings) txids.add(sighting.txid);
    for (const link of records.links) {
      linkSaleKeys.set(link.saleKey, hexToBytes(link.saleKey));
      relays = unionRelays(relays, link.relays);
    }
  }
  // The sales of the payments: their declarations give each sale's key (the reading key opens
  // them), whichever device or server made them.
  const registry = { key: deriveRegistryKey(keys.team), reader: deriveRegistryReader(keys.team) };
  secrets.push(registry.key, registry.reader.secretKey);
  const declarations = await ownerDeclarationsOf(registry, [...hashes], network, {
    relays: settings.relays
  });
  if (declarations === null) {
    throw new ErasureError("unreachable", "Fewer than a majority of the relays answered");
  }
  for (const found of declarations.values()) {
    for (const declaration of found)
      saleKeys.set(bytesToHex(declaration.saleKey), declaration.saleKey);
  }
  const deposits = await ownerOnchainPaymentsOf(registry, [...txids], network, {
    relays: settings.relays
  });
  if (deposits === null) {
    throw new ErasureError("unreachable", "Fewer than a majority of the relays answered");
  }
  for (const found of deposits.declared.values()) {
    for (const declaration of found) {
      saleKeys.set(bytesToHex(declaration.saleKey), declaration.saleKey);
    }
  }
  for (const [hex, key] of linkSaleKeys) saleKeys.set(hex, key);

  const authors: Author[] = [];
  const linkOwner = deriveLinkOwner(keys.team);
  secrets.push(linkOwner.secretKey);
  for (const [hex, saleKey] of saleKeys) {
    secrets.push(saleKey);
    const invoiceKeys = deriveSaleKeys(saleKey).nostr;
    secrets.push(invoiceKeys.secretKey);
    authors.push({ keys: invoiceKeys, addresses: [] });
    if (linkSaleKeys.has(hex)) {
      // The owner's final version of the link (owner-finals.ts, cancel-links.ts).
      const owner = nostrKeys(saleOwnerSecretKey(linkOwner.secretKey, saleKey));
      secrets.push(owner.secretKey);
      authors.push({ keys: owner, addresses: [] });
    }
  }

  // The images the account names: its logo, its articles' photos, its employees' photos, its
  // cards'.
  const images: ImageRef[] = settings.logo ? [settings.logo] : [];
  images.push(...input.cardImages);
  const catalog = articlesOf(fixed.catalogReader, of(fixed.catalog.nostr.publicKey));
  for (const article of catalog.articles) if (article.image) images.push(article.image);
  // The employees' profiles are among what was read of their authors, on a majority of the relays.
  const profiles = profilesOf(
    fixed.holders.filter(({ employee }) => employee),
    read.events
  );
  for (const profile of profiles.values()) if (profile?.avatar) images.push(profile.avatar);
  for (const image of images) {
    const author = imageAuthor(image);
    secrets.push(author.secretKey);
    authors.push({ keys: author, addresses: [] });
  }
  return { authors: dedupe(authors), relays };
}

/** Each author once (its public key), the addresses of its copies together. */
function dedupe(authors: readonly Author[]): Author[] {
  const byKey = new Map<string, Author>();
  for (const author of authors) {
    const known = byKey.get(author.keys.publicKey);
    byKey.set(
      author.keys.publicKey,
      known
        ? { keys: known.keys, addresses: [...new Set([...known.addresses, ...author.addresses])] }
        : author
    );
  }
  return [...byKey.values()];
}

/**
 * Every event `authors` signed that `relays` hold (deletion requests left out), AUTHORS_PER_READ
 * authors at a time, page by page (queryRelaysPaged: a relay caps what it sends), each read until
 * a majority of `decides` (the account's relays) answered: every event of the account is written to
 * a majority. Each checked (isValidEvent: relays are never trusted). A relay that missed one read is
 * not among `answered`.
 */
async function readAuthors(
  authors: readonly Author[],
  relays: readonly string[],
  decides: readonly string[],
  onBatch: (done: number) => void
): Promise<Read> {
  const events = new Map<string, NostrEvent[]>();
  const answered = new Set(relays);
  for (let start = 0; start < authors.length; start += AUTHORS_PER_READ) {
    const batch = authors.slice(start, start + AUTHORS_PER_READ);
    const wanted = new Set(batch.map((author) => author.keys.publicKey));
    const answers = await queryRelaysPaged(
      { authors: [...wanted] },
      // Authenticated as each author (NIP-42): a relay may give an author's events to that author
      // only, and none would then be erased.
      {
        relays,
        timeoutMs: TEAM_TIMEOUT_MS.background,
        channel: "account",
        authKey: batch.map((author) => author.keys.secretKey)
      },
      { quorum: { lists: [decides] } }
    );
    for (const relay of relays) {
      const values = answers.get(relay);
      if (values === undefined) {
        answered.delete(relay);
        continue;
      }
      const valid = values.filter(
        (value): value is NostrEvent =>
          isValidEvent(value) && wanted.has(value.pubkey) && value.kind !== DELETION_KIND
      );
      const list = events.get(relay);
      // A loop, not push(...valid): a relay may send more events than a call takes arguments.
      if (list) for (const event of valid) list.push(event);
      else events.set(relay, valid);
    }
    onBatch(Math.min(start + AUTHORS_PER_READ, authors.length));
  }
  return { events, answered };
}

function merge(
  a: ReadonlyMap<string, NostrEvent[]>,
  b: ReadonlyMap<string, NostrEvent[]>
): Map<string, NostrEvent[]> {
  const merged = new Map<string, NostrEvent[]>();
  for (const map of [a, b]) {
    for (const [relay, events] of map) merged.set(relay, [...(merged.get(relay) ?? []), ...events]);
  }
  return merged;
}

/** By author: its events (each once, by id) and the relays that sent them. */
function eventsByAuthor(
  held: ReadonlyMap<string, NostrEvent[]>
): Map<string, { events: Map<string, NostrEvent>; relays: Set<string> }> {
  const byAuthor = new Map<string, { events: Map<string, NostrEvent>; relays: Set<string> }>();
  for (const [relay, events] of held) {
    for (const event of events) {
      const entry = byAuthor.get(event.pubkey) ?? { events: new Map(), relays: new Set() };
      entry.events.set(event.id, event);
      entry.relays.add(relay);
      byAuthor.set(event.pubkey, entry);
    }
  }
  return byAuthor;
}

/** The relays that sent some event. */
function relaysHolding(held: ReadonlyMap<string, NostrEvent[]>): Set<string> {
  return new Set([...held].filter(([, events]) => events.length > 0).map(([relay]) => relay));
}
