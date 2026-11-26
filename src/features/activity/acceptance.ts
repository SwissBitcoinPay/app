import { bytesToHex } from "@noble/hashes/utils.js";

import { majority } from "@/config/registry";
import { nowUnix } from "@/lib/clock";
import { logFailure } from "@/lib/log/log";
import { publishAgain, type RelayCall } from "@/lib/nostr/pool";
import { TEAM_TIMEOUT_MS } from "@/lib/team/shared";
import { deriveIntegrationKeys } from "@/lib/integrations/keys";
import {
  fetchLateAcceptances,
  lateAcceptanceAddress,
  lateAcceptanceEvent,
  publishLateAcceptance
} from "@/lib/integrations/late-acceptance";
import {
  acceptanceCall,
  acceptanceCutoff,
  fetchOrderAcceptances,
  orderAcceptanceAddress,
  orderAcceptanceEvent,
  publishOrderAcceptance,
  type AcceptedInvoice,
  type MerchantAcceptanceRead,
  type OrderAcceptanceRead
} from "@/lib/integrations/onchain-acceptance";
import { saleOwnerSecretKey } from "@/lib/payment-link/owner-key";
import { deriveSaleKeys } from "@/lib/registry/registry";
import {
  SALE_ACCEPTANCE_TIMEOUT_MS,
  publishSaleAcceptance,
  readSaleAcceptances,
  saleAcceptanceEvent,
  type AcceptanceRead
} from "@/lib/registry/sale-acceptance";
import type { NostrEvent } from "@/lib/nostr/event";
import {
  deriveLateAcceptanceKeys,
  deriveLinkOwner,
  integrationSecretKey,
  usableTeamKeys,
  type TeamKeys
} from "@/lib/team/keys";

import { splitFiat } from "@/lib/terminal/amount";

import type { ActivityItem, Fiat } from "./model";

/*
 * The owner's acceptance of a sale paid short, in "Wallet", "My activity" and the owner's statement
 * (the owner alone accepts the sats received as paying a sale "Underpaid", for good; the sale is
 * then "Paid", at what was received, and the statement says the difference). The records are
 * src/lib/registry/sale-acceptance.ts (a sale of the point of sale or of a payment link) and
 * src/lib/integrations/onchain-acceptance.ts (an integration's order, which its server reads, made
 * and sent only until acceptanceCutoff, 5 minutes before its invoice's end, and counted only once a
 * majority of the relays holds it: checkout-spec SPEC.md §31); from that cutoff on, an
 * integration's order's is src/lib/integrations/late-acceptance.ts, which no server reads:
 * its shop keeps the order expired, and the owner is told so (`late`).
 *
 * The rows the model builds (model.ts) say what an acceptance of them is made for (`acceptTarget`);
 * the rows "Underpaid" are read (acceptanceTargets, readAcceptances) and their state follows what
 * was read (applyAcceptances). A row whose acceptance is not read stays as its payments tell it:
 * "Underpaid" is what they prove; never "Paid" on a guess.
 */

/** What an acceptance of a row is made for. */
export type AcceptTarget =
  /**
   * A sale of the point of sale or of a payment link: its own key, and the relays of its link
   * (null: the account's, a point of sale's sale).
   */
  | { kind: "sale"; saleKey: Uint8Array; relays: readonly string[] | null }
  /** An invoice of an integration's order: the integration (its id) and the invoice. */
  | { kind: "order"; integration: string; invoice: AcceptedInvoice };

/** What was read of a row's acceptance (absent from a row: not read). */
export type AcceptanceState =
  /** None: the owner may accept it. */
  | { status: "none" }
  /**
   * Accepted, and what the row received now reaches it: the row is "Paid", at what it received (its
   * `fiat`, its share of the sale's amount). `fiat`: the sale's amount as it was typed.
   */
  | {
      status: "accepted";
      received: bigint;
      due: bigint;
      at: number;
      fiat: Fiat | null;
      /** An integration's order accepted late (from acceptanceCutoff): its shop does not know it. */
      late?: true;
    }
  /**
   * Accepted at more than the row received now (a replacement, RBF, paid less since): "Underpaid"
   * again, never accepted a second time.
   */
  | { status: "unmet"; received: bigint; due: bigint; at: number; late?: true }
  /** One of a newer format: told by a newer app, never written over. */
  | { status: "newer" }
  /**
   * An integration's order whose acceptance its server reads fewer than a majority of the relays
   * hold yet, before acceptanceCutoff: being sent to the others (readAcceptances). Not "Paid"
   * before a majority holds it (its server counts it only then), nor accepted again: "Underpaid",
   * told so.
   */
  | { status: "pending"; received: bigint; due: bigint; at: number }
  /**
   * An integration's order whose acceptance its server reads fewer than a majority of the relays
   * held at acceptanceCutoff (or later): not made. Nothing sends it from then on, its server never
   * counts it, its shop judges the order without it: "Underpaid", the owner may accept it late
   * (acceptanceOf), told why.
   */
  | { status: "lapsed" };

/** The key of `target` in what readAcceptances returns. */
export function acceptanceKey(target: AcceptTarget): string {
  if (target.kind === "sale") return `sale:${bytesToHex(target.saleKey)}`;
  const { sale, address, expiresAt } = target.invoice;
  return `order:${target.integration}:${sale}:${address}:${expiresAt}`;
}

/** The rows whose acceptance is read: those "Underpaid" that say what it would be made for. */
export function acceptanceTargets(items: readonly ActivityItem[]): AcceptTarget[] {
  const targets = new Map<string, AcceptTarget>();
  for (const item of items) {
    if (item.state === "underpaid" && item.acceptTarget) {
      targets.set(acceptanceKey(item.acceptTarget), item.acceptTarget);
    }
  }
  return [...targets.values()];
}

/**
 * `items` with what was read of their acceptances (`reads`, by acceptanceKey): a row "Underpaid"
 * accepted is "Paid" at what it received, "Confirming" while its sats are not all in the balance
 * ("Paid" once they are, withCredit of model.ts), its rest gone. Rows without a read stay as they
 * are.
 */
export function applyAcceptances(
  items: readonly ActivityItem[],
  reads: ReadonlyMap<string, AcceptanceRead | OrderRead>,
  {
    wallet = true
  }: {
    /**
     * The rows hold the wallet's payments (the owner's list): an accepted row is "Paid" once they
     * are all in the balance. False for an employee's list, which has no wallet: "Paid".
     */
    wallet?: boolean;
  } = {}
): readonly ActivityItem[] {
  // The same list when nothing is read for it: its readers keep it by identity (invoices' rows).
  if (reads.size === 0) return items;
  let changed = false;
  const applied = items.map((item) => {
    const next = withAcceptance(item, reads, wallet);
    if (next !== item) changed = true;
    return next;
  });
  return changed ? applied : items;
}

/** `item` with what was read of its acceptance (applyAcceptances); itself when nothing. */
function withAcceptance(
  item: ActivityItem,
  reads: ReadonlyMap<string, AcceptanceRead | OrderRead>,
  wallet: boolean
): ActivityItem {
  if (item.state !== "underpaid" || !item.acceptTarget) return item;
  const read = reads.get(acceptanceKey(item.acceptTarget));
  if (!read) return item;
  if (read.kind === "none") return { ...item, acceptance: { status: "none" } };
  if (read.kind === "newer") return { ...item, acceptance: { status: "newer" } };
  if (read.kind === "pending") {
    return { ...item, acceptance: { status: "pending", ...read.acceptance } };
  }
  if (read.kind === "lapsed") return { ...item, acceptance: { status: "lapsed" } };
  // It counts while what the sale received reaches what it had received when it was accepted.
  const received = item.sats ?? 0n;
  if (received < read.acceptance.received) {
    return { ...item, acceptance: { status: "unmet", ...read.acceptance } };
  }
  const acceptance: AcceptanceState = { status: "accepted", ...read.acceptance, fiat: item.fiat };
  // In the balance: every payment of the row credited (an underpaid row has no credit of its own).
  const credited =
    !wallet ||
    (item.payments.length > 0 &&
      item.payments.every((payment) => payment.status === "completed") &&
      !item.pendingCredit);
  // "Confirming" otherwise, with what the row told of its credit (never more: a deposit in the
  // mempool is not "confirmed").
  return {
    ...item,
    acceptance,
    // What it received, as the point of sale splits the sale's amount (never a rate of today).
    fiat: item.fiat && {
      ...item.fiat,
      minor: splitFiat(item.fiat.minor, read.acceptance.due, received).receivedMinor
    },
    rest: null,
    state: credited ? null : "unconfirmed"
  };
}

/**
 * An integration's order's acceptance, as readAcceptances tells it: "accepted" only when a majority
 * of the relays hold the one its server reads (fetchOrderAcceptances), as its server counts it, or
 * the owner's own (`late`, late-acceptance.ts), which its server never reads; a copy of the first
 * that fewer hold is "pending" before acceptanceCutoff, "lapsed" from then on.
 */
export type OrderRead =
  | { kind: "none" }
  | { kind: "newer" }
  | {
      kind: "accepted";
      acceptance: { received: bigint; due: bigint; at: number; late?: true };
    }
  | { kind: "pending"; acceptance: { received: bigint; due: bigint; at: number } }
  | { kind: "lapsed" };

/** A call of the team's records on `relays` (as owner.ts' relayCall): refused once the account closes. */
function teamCall(team: TeamKeys, relays: readonly string[]) {
  return {
    relays,
    timeoutMs: TEAM_TIMEOUT_MS.background,
    channel: "account" as const,
    authKey: () => usableTeamKeys(team).secretKey
  };
}

/** Who reads the acceptances: the owner (its team keys) or an employee (no order of its own). */
export type AcceptanceReader = {
  /** Hex: the business's link owner key, whose key of each sale signs its acceptance. */
  owner: string;
  /** The owner's team keys: an integration's order's acceptance is read with them. */
  team: TeamKeys | null;
  /** The account's relays: a point of sale's sales, the integrations' channel. */
  relays: readonly string[];
};

/**
 * The acceptances of `targets`, by acceptanceKey: those whose relays gave a majority's answer (the
 * owner's acceptance must not be missed), and of an order, a read that proves what a majority
 * holds; the others are left out (not read). `clock`: the time an order's invoice's end is judged
 * by (nowUnix, src/lib/clock.ts), read once the relays answered.
 */
export async function readAcceptances(
  targets: readonly AcceptTarget[],
  { owner, team, relays }: AcceptanceReader,
  clock: () => number = nowUnix
): Promise<Map<string, AcceptanceRead | OrderRead>> {
  const found = new Map<string, AcceptanceRead | OrderRead>();
  const sales = targets.flatMap((target) => (target.kind === "sale" ? [target] : []));
  // Each order with its integration's key and its records' addresses (the one its server reads,
  // the owner's late one), derived once.
  const lateKeys =
    team && targets.some((target) => target.kind === "order")
      ? deriveLateAcceptanceKeys(team)
      : null;
  const orders =
    team && lateKeys
      ? targets.flatMap((target) => {
          if (target.kind !== "order") return [];
          const integrationKey = integrationSecretKey(team, target.integration);
          return [
            {
              target,
              integrationKey,
              address: orderAcceptanceAddress(integrationKey, target.invoice),
              lateAddress: lateAcceptanceAddress(lateKeys, target.integration, target.invoice)
            }
          ];
        })
      : [];
  const [saleReads, orderReads, lateReads] = await Promise.all([
    readSaleAcceptances(
      sales.map(({ saleKey, relays: own }) => ({ saleKey, relays: own ?? relays })),
      owner
    ),
    orders.length === 0 || !team
      ? Promise.resolve(new Map())
      : fetchOrderAcceptances(
          team,
          orders.map(({ target, integrationKey }) => ({
            integrationKey,
            keys: deriveIntegrationKeys(integrationKey),
            invoice: target.invoice
          })),
          teamCall(team, relays)
        ),
    orders.length === 0 || !team || !lateKeys
      ? Promise.resolve(new Map())
      : fetchLateAcceptances(
          team,
          lateKeys,
          orders.map(({ target }) => ({
            integration: target.integration,
            invoice: target.invoice
          })),
          teamCall(team, relays)
        )
  ]);
  // The owner's own reads: a record fewer than a majority of its relays hold (a publication cut
  // short) goes to the others, as a link's final version does (finalize.ts, existingFinal), so
  // that every reader's majority meets it (its payer's page, its point of sale, its shop's server).
  const ownerSecret = team ? deriveLinkOwner(team).secretKey : null;
  for (const target of sales) {
    const read = saleReads.get(deriveSaleKeys(target.saleKey).nostr.publicKey);
    if (!read) continue;
    found.set(acceptanceKey(target), read);
    if (ownerSecret && read.kind === "accepted") {
      spread(read.event, read.holders, read.relays, {
        channel: "anonymous",
        timeoutMs: SALE_ACCEPTANCE_TIMEOUT_MS,
        authKey: saleOwnerSecretKey(ownerSecret, target.saleKey)
      });
    }
  }
  // An order is read once both its records are (a majority's answer each).
  if (orderReads && lateReads && team) {
    // Judged once the relays answered: a read may take a relay's timeout.
    const now = clock();
    for (const { target, address, lateAddress } of orders) {
      const read = orderReads.get(address);
      const late = lateReads.get(lateAddress);
      if (!read || !late) continue;
      // The record its server reads is sent only while its invoice runs (checkout-spec SPEC.md §31,
      // "Publishing it": nothing at or after its `expiresAt`), until acceptanceCutoff by this app's
      // clock (it may run behind). Its shop's server may judge the order `expired` (final) once its
      // lease ended, with what a majority of the relays held: a copy completed to a majority later
      // would make it paid after that, its status depending on which relays answer.
      const ended = now >= acceptanceCutoff(target.invoice);
      if (read.copy && !ended) {
        // Each request bounded as its first publication's (acceptanceCall).
        spread(read.copy.event, read.copy.holders, relays, acceptanceCall(teamCall(team, relays)));
      }
      // The owner's own, which no server reads: whenever.
      if (late.copy) spread(late.copy.event, late.copy.holders, relays, teamCall(team, relays));
      // What a majority holds not proven (a relay that did not answer may make one): not read.
      if (!read.settled) continue;
      found.set(acceptanceKey(target), orderReadOf(read, late, target.invoice.sats, ended));
    }
  }
  return found;
}

/**
 * What an order's records tell (`inTime`: the one its server reads; `late`: the owner's own, from
 * acceptanceCutoff on), due `due`, `ended` once acceptanceCutoff passed: the one its server reads
 * first, once a majority holds it (two devices may each have made one, neither seeing the other's),
 * then one of a newer format (never written over), then the owner's late one, then a copy of the
 * first that fewer than a majority hold: being sent (pending) before the cutoff, not made (lapsed)
 * from then on.
 */
function orderReadOf(
  inTime: MerchantAcceptanceRead,
  late: OrderAcceptanceRead,
  due: bigint,
  ended: boolean
): OrderRead {
  if (inTime.acceptance) return { kind: "accepted", acceptance: { ...inTime.acceptance, due } };
  if (inTime.newer) return { kind: "newer" };
  if (late.acceptance) {
    return { kind: "accepted", acceptance: { ...late.acceptance, due, late: true } };
  }
  if (late.newer) return { kind: "newer" };
  if (inTime.copy) {
    return ended
      ? { kind: "lapsed" }
      : { kind: "pending", acceptance: { ...inTime.copy.value, due } };
  }
  return { kind: "none" };
}

/**
 * Sends `event` to those of `relays` that do not hold it (`holders`), when fewer than a majority
 * do; in the background, a failure logged (the next read tries again). The acceptance an order's
 * server reads only before acceptanceCutoff (readAcceptances).
 */
function spread(
  event: NostrEvent,
  holders: readonly string[],
  relays: readonly string[],
  call: Omit<RelayCall, "relays">
): void {
  if (holders.length >= majority(relays.length)) return;
  const others = relays.filter((relay) => !holders.includes(relay));
  publishAgain(
    event,
    { ...call, relays: others },
    { quorum: { count: majority(relays.length) - holders.length } }
  ).catch((error: unknown) => logFailure("Publishing an acceptance again failed", error));
}

/** Why the owner cannot accept a row now. */
export type AcceptError =
  /** Already accepted (on another device), or of a newer format: read again. */
  | "already"
  /**
   * An integration's order whose acceptance its server reads could not be sent before
   * acceptanceCutoff: its invoice came to its last minutes while the dialog showed (confirmed
   * without the warning a late acceptance needs: its shop never learns of it), or fewer than a
   * majority of the relays took it by then (not made, SPEC.md §31, "Publishing it", rule 3).
   * Read again: the owner may accept it late.
   */
  | "ended"
  /** Fewer than a majority of the relays took it, or answered: tried again with the same record. */
  | "network";

export class AcceptanceError extends Error {
  constructor(
    readonly code: AcceptError,
    message: string
  ) {
    super(message);
    this.name = "AcceptanceError";
  }
}

/**
 * What the owner accepts of a row: its target, what it received, what it was due; `late`, an
 * integration's order from acceptanceCutoff on: its server will never read it, its shop keeps the
 * order expired (late-acceptance.ts), which the owner is told before accepting.
 */
export type Acceptance = { target: AcceptTarget; received: bigint; due: bigint; late?: boolean };

/**
 * What the owner may accept of `item` at `now`: a row "Underpaid" whose acceptance was read and is
 * none (of an order, or lapsed), whose amount due is known, that received something. An
 * integration's order before acceptanceCutoff (ACCEPTANCE_CLOCK_MARGIN_SECONDS before its invoice's
 * end), as its server reads it; from then on, or once that one lapsed, late (the owner settles it
 * in the app, its shop not told). Null otherwise.
 */
export function acceptanceOf(item: ActivityItem, now: number): Acceptance | null {
  const target = item.acceptTarget;
  if (item.state !== "underpaid" || !target) return null;
  const status = item.acceptance?.status;
  // Lapsed: the record its server reads was not made, the owner's own may be.
  if (status !== "none" && !(status === "lapsed" && target.kind === "order")) return null;
  const received = item.sats ?? 0n;
  if (received < 1n) return null;
  if (target.kind === "order") {
    if (received >= target.invoice.sats) return null;
    // Late from acceptanceCutoff: its server reads only what a majority of the relays held by the
    // lease's end, and this app's clock may run behind (onchain-acceptance.ts).
    const late = status === "lapsed" || now >= acceptanceCutoff(target.invoice);
    return { target, received, due: target.invoice.sats, late };
  }
  if (!item.rest || item.rest.sats < 1n) return null;
  return { target, received, due: received + item.rest.sats };
}

/**
 * Why the owner may not accept a row "Underpaid" now (acceptanceOf null), told in place of the
 * action (AcceptAction) rather than nothing:
 * - `unread`: its acceptance not read yet (being read, or no read gave a majority's answer; read
 *   again every ACCEPTANCES_REFRESH_MS, useAcceptances): it may be accepted already, on another
 *   device;
 * - `unmet`: accepted when it had received `received` (of `due`), more than it received now; it
 *   counts again once it reaches that, never accepted a second time (applyAcceptances);
 * - `newer`: told by a newer app, never written over.
 */
export type AcceptBlock =
  { kind: "unread" } | { kind: "unmet"; received: bigint; due: bigint } | { kind: "newer" };

/**
 * Why `item` may not be accepted at `now` (AcceptBlock). Null when it may be (acceptanceOf), when
 * its details tell it already (an order's acceptance being sent: "pending"), and for any row but
 * one "Underpaid" an acceptance would be made for.
 */
export function acceptBlockOf(item: ActivityItem, now: number): AcceptBlock | null {
  if (item.state !== "underpaid" || !item.acceptTarget) return null;
  if (acceptanceOf(item, now)) return null;
  const acceptance = item.acceptance;
  if (!acceptance) return { kind: "unread" };
  if (acceptance.status === "unmet") {
    return { kind: "unmet", received: acceptance.received, due: acceptance.due };
  }
  if (acceptance.status === "newer") return { kind: "newer" };
  return null;
}

/**
 * The records made for an acceptance, kept for this session: tried again as they are (`late`: the
 * owner's late acceptance of an integration's order, late-acceptance.ts).
 */
const made = new Map<string, { event: NostrEvent; late: boolean }>();

/** Who hears of each acceptance made on this device (useAcceptances reads them again). */
const acceptanceListeners = new Set<() => void>();

/** Calls `listener` after each acceptance this device made; returns its removal. */
export function subscribeAcceptances(listener: () => void): () => void {
  acceptanceListeners.add(listener);
  return () => acceptanceListeners.delete(listener);
}

function acceptanceMade(): void {
  for (const listener of acceptanceListeners) listener();
}

/**
 * Publishes the owner's acceptance of `acceptance` (the owner's team keys `team`, the account's
 * `relays`; `clock`: nowUnix, src/lib/clock.ts): read first on a majority of the relays, so that a
 * sale already accepted (on another device) is never accepted again; a publication of this session
 * that fewer than a majority took is sent again as it was, never made again. An integration's
 * order's is the record its server reads, made and sent only before acceptanceCutoff (checkout-spec
 * SPEC.md §31, "Publishing it"), one fewer than a majority took by then not made ("ended"); the
 * owner's late one from then on, only when the owner confirmed it as such (`acceptance.late`).
 * Rejects with AcceptanceError.
 *
 * The cutoff is judged by nowUnix: this device's clock, corrected by the dates of the invoices it
 * got this launch, else roughly by CoinGecko's (src/lib/clock.ts), not synchronized as a server's
 * (SPEC.md §2): hence its margin (ACCEPTANCE_CLOCK_MARGIN_SECONDS), which a clock up to 5 minutes
 * behind still respects.
 */
export async function acceptRow(
  acceptance: Acceptance,
  team: TeamKeys,
  relays: readonly string[],
  clock: () => number = nowUnix
): Promise<void> {
  const { target, received, due } = acceptance;
  const key = acceptanceKey(target);
  const owner = deriveLinkOwner(team);
  const before = await readAcceptances([target], { owner: owner.publicKey, team, relays }, clock);
  const read = before.get(key);
  if (!read) throw new AcceptanceError("network", "The acceptance could not be read");
  const kept = made.get(key);
  // Accepted already, unless by this very session's record (a publication cut short); one of a
  // newer format, whoever made it, is never written over. Lapsed: the record its server reads was
  // not made, the owner's own may be.
  if (
    read.kind === "newer" ||
    (read.kind !== "none" && read.kind !== "lapsed" && kept === undefined)
  ) {
    throw new AcceptanceError("already", "The sale is accepted already");
  }
  if (target.kind === "order") {
    const late = acceptance.late === true;
    // This session's record, which a majority holds now (sent on by a read): made.
    if (read.kind === "accepted") {
      acceptanceMade();
      return;
    }
    // This session's record its server reads, still being sent: never one of the owner's own too.
    if (read.kind === "pending" && late) {
      throw new AcceptanceError("already", "The order's acceptance is being sent");
    }
    const cutoff = acceptanceCutoff(target.invoice);
    const now = clock();
    // The record its server reads is never made nor sent from acceptanceCutoff on, this session's
    // included (its server may judge the order `expired`, final, without it): one a minority
    // holds stays so. Confirmed without the warning of a late one: read again.
    if (!late && (read.kind === "lapsed" || now >= cutoff)) {
      throw new AcceptanceError("ended", "The order's invoice ends");
    }
    // This session's record of the same kind, else a new one (a late one once the first lapsed).
    const record = kept?.late === late ? kept : orderRecord(acceptance, target, team, now);
    made.set(key, record);
    const publish = record.late ? publishLateAcceptance : publishOrderAcceptance;
    await publish(record.event, teamCall(team, relays)).catch((error: unknown) => {
      // Fewer than a majority took the record its server reads: the owner may try again until
      // acceptanceCutoff; from then on, it is not made (nothing sends it again, its server never
      // counts it), which the owner is told (SPEC.md §31, "Publishing it", rule 3).
      if (!record.late && clock() >= cutoff) {
        throw new AcceptanceError(
          "ended",
          `Not made before the order's invoice ended: ${String(error)}`
        );
      }
      throw new AcceptanceError("network", String(error));
    });
    acceptanceMade();
    return;
  }
  const { event } = kept ?? {
    event: saleAcceptanceEvent(owner.secretKey, target.saleKey, { received, due }, clock()),
    late: false
  };
  made.set(key, { event, late: false });
  await publishSaleAcceptance(
    event,
    saleOwnerSecretKey(owner.secretKey, target.saleKey),
    target.relays ?? relays
  ).catch((error: unknown) => {
    throw new AcceptanceError("network", String(error));
  });
  acceptanceMade();
}

/**
 * The record of the acceptance of an integration's order's invoice at `now`: the one its server
 * reads, else (`acceptance.late`) the owner's own (late-acceptance.ts).
 */
function orderRecord(
  { received, late = false }: Acceptance,
  target: Extract<AcceptTarget, { kind: "order" }>,
  team: TeamKeys,
  now: number
): { event: NostrEvent; late: boolean } {
  if (late) {
    const keys = deriveLateAcceptanceKeys(team);
    return {
      event: lateAcceptanceEvent(team, keys, target.integration, target.invoice, received, now),
      late
    };
  }
  const integrationKey = integrationSecretKey(team, target.integration);
  return {
    event: orderAcceptanceEvent(
      team,
      deriveIntegrationKeys(integrationKey),
      integrationKey,
      target.invoice,
      received,
      now
    ),
    late
  };
}

/** How amounts are written: a sale's currency, else sats (format.ts). */
export type AmountTexts = { fiat: (fiat: Fiat) => string; sats: (sats: bigint) => string };

/**
 * What an acceptance tells, written in the sale's currency when it has one (its share of the sale's
 * amount, as the point of sale splits it: splitFiat, never a rate of today), else in sats: what it
 * had received, and the difference it accepted (what was due less that).
 */
export function acceptanceAmounts(
  texts: AmountTexts,
  fiat: Fiat | null,
  { received, due }: { received: bigint; due: bigint }
): { received: string; difference: string } {
  if (!fiat) return { received: texts.sats(received), difference: texts.sats(due - received) };
  const split = splitFiat(fiat.minor, due, received);
  return {
    received: texts.fiat({ ...fiat, minor: split.receivedMinor }),
    difference: texts.fiat({ ...fiat, minor: split.restMinor })
  };
}
