import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";

import {
  byRelays,
  linkHolders,
  removedHolders,
  type LinkHolder
} from "@/features/payment-link/owner-finals";
import { logFailure } from "@/lib/log/log";
import { betterCopy, fetchLinkCopies, type LinkCopy } from "@/lib/payment-link/link";
import type { SharedSale } from "@/lib/payment-link/payload";
import { deriveSaleKeys } from "@/lib/registry/registry";
import { currentRelays } from "@/lib/relays/current";
import type { TeamKeys } from "@/lib/team/keys";
import { fetchLinks } from "@/lib/team/member-records";
import type { OwnerDevice } from "@/lib/settings/merchant";

import type { Fiat, Taker } from "./model";
import type { Seats } from "./takers";

/*
 * The payment links the team made, for the declarations of their sales. A payment link's payer
 * holds its sale's key, and so can declare that sale's invoices again (registry.ts: a declaration
 * is signed by its sale, the newest of an author at an address replaces the others), with any
 * amount, note or mark, in place of the declaration its page or the point of sale made. A link one
 * of the team's devices recorded (member-records.ts, signed by that device's key) is the sale as it
 * was made: "Wallet" and the owner's copy (archive.ts) take its amount and note, and who recorded
 * it, never the declaration's (the link's values, without a mention; a difference goes to the
 * journal). A sale no device recorded a link of was never shared: only the device that made it held
 * its key, and its declaration is the sale. The integrations' checkout links carry neither the
 * registry nor the sale's key (src/lib/payment-link/checkout.ts): their declarations are their
 * servers'.
 *
 * A link's final version that lists the payments of a sale paid in full or in part (`paid`,
 * `underpaid`) tells which counted: a payment the link's payer declared for that sale besides them
 * (another payment the business received, which no other sale declared) is not that sale's.
 */

/** A link the team recorded: its author and its sale's key, where it is, and who recorded it. */
export type TeamLink = {
  link: string;
  saleKey: Uint8Array;
  relays: readonly string[];
  taker: Taker;
};

/** The team's links, by their sale's registry identity (the declarations' author). */
export type TeamLinks = ReadonlyMap<string, readonly TeamLink[]>;

/**
 * Whose records name the business's payment links: the roster's employees and assistants, those
 * removed included (with their removal, `until`), and the owner's `devices` (as accountHolders of
 * src/features/settings/account-erasure.ts).
 */
export function teamLinkHolders(
  team: TeamKeys,
  seats: Pick<Seats, "employees" | "assistants" | "removed">,
  devices: readonly OwnerDevice[]
): LinkHolder[] {
  return [
    ...linkHolders(team, seats.employees, devices, seats.assistants),
    ...removedHolders(team, seats.removed, {
      except: [...seats.employees, ...seats.assistants].map(({ id }) => id)
    })
  ];
}

/**
 * Every link `holders` recorded (whatever its age: a link is payable, and declared, for months), by
 * its sale's registry identity. A removed seat's records dated after its removal (`until`) are left
 * out, as the owner's finalization does (owner-finals.ts). Null when the records of one of them
 * could not be read from a majority of `relays`: a link may be missing.
 */
export async function readTeamLinks(
  holders: readonly LinkHolder[],
  relays?: readonly string[]
): Promise<TeamLinks | null> {
  // Every holder at once: the calls share one connection per relay (relay.ts), as readOwnerRecords.
  const read = await Promise.all(
    holders.map(async (holder) => ({
      holder,
      links: await fetchLinks(holder.keys, 0, relays).catch(() => null)
    }))
  );
  if (read.some(({ links }) => links === null)) return null;
  const bySale = new Map<string, TeamLink[]>();
  for (const { holder, links } of read) {
    // An employee's or an assistant's links are its own (takers.ts), the owner's devices' the owner's.
    const taker: Taker = holder.employee ? { kind: "member", id: holder.id } : { kind: "you" };
    for (const record of links!) {
      if (holder.until !== undefined && record.createdAt > holder.until) continue;
      const saleKey = hexToBytes(record.saleKey);
      const author = deriveSaleKeys(saleKey).nostr.publicKey;
      bySale.set(author, [
        ...(bySale.get(author) ?? []),
        { link: record.link, saleKey, relays: record.relays, taker }
      ]);
    }
  }
  return bySale;
}

/** A sale as its link tells it (linkedSalesOf). */
export type LinkedSale = {
  fiat: Fiat;
  note: string;
  taker: Taker;
  /**
   * The payment hashes its final version counted, when it is one of a sale paid in full or in part;
   * null otherwise (no final version yet, expired, canceled).
   */
  counted: ReadonlySet<string> | null;
};

/** What the business's links must name (namesBusiness of load.ts): its owner and registry keys. */
export type LinkBusiness = { owner: string; registryKey: Uint8Array };

/**
 * The sales of `authors` (registry identities) that `links` holds, as their links tell them
 * (`sales`), each read on its own relays (its copies signed by its author: fetchLinkCopies; the best
 * one, betterCopy). `unread`: those of a link whose relays did not answer, as the owner's
 * finalization counts them (openLinks of owner-finals.ts): unless none of its relays is one of
 * `accountRelays` (nobody can open it there either). A link its relays
 * answered without, or one that does not name `business` (an employee's modified app could record
 * one of another business), tells nothing: its declarations are read as they are. Nobody can push a
 * link out of what its relays send: it is read by its author. Never rejects.
 */
export async function linkedSalesOf(
  links: TeamLinks,
  authors: Iterable<string>,
  network: string,
  business: LinkBusiness,
  accountRelays: readonly string[] = currentRelays()
): Promise<{ sales: Map<string, LinkedSale>; unread: Set<string> }> {
  const wanted = [...new Set(authors)].flatMap((author) =>
    (links.get(author) ?? []).map((link) => ({ ...link, author }))
  );
  const copies = new Map<string, LinkCopy[]>();
  const unread = new Set<string>();
  await Promise.all(
    byRelays(wanted).map(async (group) => {
      const { relays } = group[0]!;
      const found = await fetchLinkCopies(
        group.map(({ link, saleKey }) => ({ author: link, key: saleKey })),
        network,
        relays
      ).catch(() => null);
      if (found === null) {
        if (relays.some((relay) => accountRelays.includes(relay))) {
          for (const { author } of group) unread.add(author);
        }
        return;
      }
      for (const [author, list] of found) copies.set(author, list);
    })
  );
  const sales = new Map<string, LinkedSale>();
  const registryKey = bytesToHex(business.registryKey);
  for (const { link, author, taker } of wanted) {
    if (sales.has(author)) continue;
    const best = (copies.get(link) ?? []).reduce<LinkCopy | null>(
      (current, copy) => betterCopy(current, copy),
      null
    );
    if (best?.link.kind !== "sale") continue;
    const sale = best.link.sale;
    if (sale.owner !== business.owner || bytesToHex(sale.registryKey) !== registryKey) continue;
    sales.set(author, { fiat: sale.fiat, note: sale.note, taker, counted: countedOf(sale) });
  }
  // A sale another of its links told is read.
  for (const author of sales.keys()) unread.delete(author);
  return { sales, unread };
}

function countedOf(sale: SharedSale): ReadonlySet<string> | null {
  const { final } = sale;
  if (!final || (final.status !== "paid" && final.status !== "underpaid")) return null;
  return new Set(final.lightning.map(({ decoded }) => decoded.paymentHash));
}

/** A declaration as "Wallet" and the owner's copy read it: who, how much, what, by whom. */
type Declared = { author: string; fiat: Fiat; note: string };

/**
 * The declaration of payment `hash` as its sale's link tells it (`linked`, linkedSalesOf): the
 * link's amount, note and who recorded it in place of the declaration's, the difference written to
 * the journal (never its values); null when the link's final version counted other payments, not
 * this one (it is not that sale's). The declaration as it is without a link.
 */
export function withLinkedSale<T extends Declared>(
  declared: T,
  hash: string,
  linked: ReadonlyMap<string, LinkedSale>
): (T & { taker: Taker }) | T | null {
  const sale = linked.get(declared.author);
  if (!sale) return declared;
  if (sale.counted && !sale.counted.has(hash)) {
    logFailure("A declaration named a payment its link's final version did not count");
    return null;
  }
  if (
    sale.note !== declared.note ||
    sale.fiat.minor !== declared.fiat.minor ||
    sale.fiat.digits !== declared.fiat.digits ||
    sale.fiat.currency !== declared.fiat.currency
  ) {
    logFailure("A declaration differed from its sale's link");
  }
  return { ...declared, fiat: sale.fiat, note: sale.note, taker: sale.taker };
}
