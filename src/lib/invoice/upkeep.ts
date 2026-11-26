import { majority } from "@/config/registry";
import { inBatches } from "@/lib/batches";
import type { NostrEvent } from "@/lib/nostr/event";
import {
  COPIES_AT_ONCE,
  holdersOf,
  newestEvents,
  publishAgain,
  publishAgainToQuorum,
  publishCopies,
  queryRelaysPaged,
  publishToRelays,
  type RelayCall
} from "@/lib/nostr/pool";
import { RECORD_KIND } from "@/lib/nostr/record";
import type { InvoiceKeys } from "@/lib/team/keys";

import { assistantInvoiceCopyEvent, openAssistantInvoiceCopy } from "./assistant-copy";
import {
  counterEvent,
  openInvoiceCounter,
  openSharedCounter,
  sharedCounterEvent,
  type SharedCounterKeys
} from "./counter";
import { invoiceEvent, invoicesFilter, openInvoiceRecord } from "./record";

/*
 * The invoices' records on the relays over time: every record of their author (the invoices, the
 * drafts' removals, the counter of their numbers, the owner's copies of its removed assistants'
 * invoices, assistant-copy.ts, and a newer app's) stays on the account's relays, and follows a
 * change of them.
 *
 * Relays drop or refuse old events (strfry refuses those over 3 years old; the public relays of
 * src/config/relays.ts keep some for a year only), and nothing else keeps an invoice: a record
 * unchanged for INVOICE_REFRESH_SECONDS is signed again, its value as it is (keepInvoiceRecords, at
 * each opening of the account). A draft can change on another of the owner's devices meanwhile: the
 * copy signed again is dated REFRESH_BACKDATE_SECONDS before now, so that a change made at the same
 * time (dated now, record.ts) always wins over it. It is signed again only from what a majority of
 * the relays gave whole: a version only the others hold could be older than it. A relay that
 * answered without a record's newest copy gets it, as it is: an invoice saved once a relay took it
 * (publishInvoice) reaches the others then.
 *
 * At a change of the account's relays (changeRelays), every record goes to a majority of the new
 * list before the change is saved (copyInvoiceRecords), those due signed again on the way, or the
 * change is refused: read there afterwards, an invoice missing would no longer show, a counter
 * missing would give the numbers given already again. What the list left gets meanwhile (another
 * of the owner's devices, still on it) follows once it is saved (copyLateInvoiceRecords).
 */

/** A record unchanged for this long is signed again: strfry refuses events over 3 years old. */
export const INVOICE_REFRESH_SECONDS = 365 * 24 * 60 * 60;

/**
 * A record signed again is dated this long before now: a change of it made at the same time on
 * another device, dated now, wins over it, whatever the small gap between the devices' clocks.
 */
export const REFRESH_BACKDATE_SECONDS = 24 * 60 * 60;

/** A record of the invoices' author, as the relays hold it. */
export type HeldInvoiceRecord = {
  /** Its `d` tag. */
  address: string;
  /** Its newest copy (of every relay's). */
  event: NostrEvent;
  /** The relays that answered with that very copy. */
  holders: string[];
};

/** What copyInvoiceRecords copied: each address's newest copy read on the list left, its date. */
export type InvoiceRecordsCopy = { copied: ReadonlyMap<string, number> };

function dTag(event: NostrEvent): string | undefined {
  return event.tags.find(([name]) => name === "d")?.[1];
}

/** Whether a relay sent that very event (no signature checked again: `event` was). */
function isCopyOf(value: unknown, event: NostrEvent): boolean {
  const v = value as Partial<NostrEvent> | null;
  return (
    v?.id === event.id &&
    v.sig === event.sig &&
    v.pubkey === event.pubkey &&
    v.created_at === event.created_at &&
    v.content === event.content
  );
}

/**
 * The records of `keys`'s author among what relays sent: each address's newest copy (newestEvents:
 * each checked once), and the relays that sent it.
 */
export function heldInvoiceRecords(
  keys: InvoiceKeys,
  answers: ReadonlyMap<string, readonly unknown[]>
): HeldInvoiceRecord[] {
  const author = keys.nostr.publicKey;
  // By relay, what it sent by id: each record's holders found at once.
  const sent = [...answers].map(([relay, values]) => {
    const byId = new Map<string, unknown>();
    for (const value of values) {
      const id = (value as { id?: unknown } | null)?.id;
      if (typeof id === "string") byId.set(id, value);
    }
    return { relay, byId };
  });
  return newestEvents(answers).flatMap((event): HeldInvoiceRecord[] => {
    const address = dTag(event);
    // Another author's events, which a relay may send: not this author's to copy.
    if (event.kind !== RECORD_KIND || event.pubkey !== author || address === undefined) return [];
    const holders = sent
      .filter(({ byId }) => isCopyOf(byId.get(event.id), event))
      .map(({ relay }) => relay);
    return [{ address, event, holders }];
  });
}

/**
 * `record` signed again, its value as it is, when it is unchanged for INVOICE_REFRESH_SECONDS at
 * `now` and this app reads it (an invoice, a removal, the counter, the author's copy of the shared
 * counter, `shared`, the owner's copy of a removed assistant's invoice: assistant-copy.ts): dated
 * REFRESH_BACKDATE_SECONDS before `now` (and after its copy). Null otherwise: a record of a newer
 * format, or of a type this app does not know, is left as it is (its app signs it again). Only
 * records due are opened.
 */
function signedAgain(
  keys: InvoiceKeys,
  shared: SharedCounterKeys,
  record: HeldInvoiceRecord,
  now: number
): NostrEvent | null {
  const { event } = record;
  if (now - event.created_at <= INVOICE_REFRESH_SECONDS) return null;
  const createdAt = Math.max(now - REFRESH_BACKDATE_SECONDS, event.created_at + 1);
  const invoice = openInvoiceRecord(keys, event);
  if (invoice) return invoice.status === "ok" ? invoiceEvent(keys, invoice.value, createdAt) : null;
  const counter = openInvoiceCounter(keys, event);
  if (counter) return counter.status === "ok" ? counterEvent(keys, counter.value, createdAt) : null;
  const assistantCopy = openAssistantInvoiceCopy(keys, event);
  if (assistantCopy) {
    return assistantCopy.status === "ok"
      ? assistantInvoiceCopyEvent(keys, assistantCopy.value, createdAt)
      : null;
  }
  const copy = openSharedCounter(shared, keys.nostr.publicKey, event);
  return copy?.status === "ok"
    ? sharedCounterEvent(shared, keys.nostr, copy.value, createdAt)
    : null;
}

/**
 * The upkeep of the invoices' records on the relays of `call` (the account's), at `now`: read whole
 * until a majority answered (each record is published to one), each record unchanged for
 * INVOICE_REFRESH_SECONDS is signed again (signedAgain) to every relay, when a majority of them
 * answered (`read`); any other is given, as it is, to the relays not known to hold it (those that
 * answered without it, and those that did not answer: a relay holding it, or a newer one, takes it
 * again as nothing). Resolves with how many records a majority took. Never rejects.
 */
export async function keepInvoiceRecords(
  keys: InvoiceKeys,
  shared: SharedCounterKeys,
  call: RelayCall,
  now: number
): Promise<{ read: boolean; refreshed: number; repaired: number }> {
  const answers = await queryRelaysPaged(invoicesFilter(keys), call, {
    whole: true,
    quorum: "majority"
  });
  const quorum = majority(call.relays.length);
  const read = answers.size >= quorum;
  const outcome = { read, refreshed: 0, repaired: 0 };
  if (answers.size === 0) return outcome;
  await inBatches(heldInvoiceRecords(keys, answers), COPIES_AT_ONCE, async (record) => {
    const again = read ? signedAgain(keys, shared, record, now) : null;
    if (again) {
      const took = await publishToRelays(again, call, { quorum: "majority" });
      if (took.length >= quorum) outcome.refreshed += 1;
      return true;
    }
    const lacking = call.relays.filter((relay) => !record.holders.includes(relay));
    if (lacking.length === 0) return true;
    const took = await publishAgain(
      record.event,
      { ...call, relays: lacking },
      // What a majority lacks; the others take it in the background.
      { quorum: { count: quorum - record.holders.length } }
    );
    if (record.holders.length + took.length >= quorum) outcome.repaired += 1;
    return true;
  });
  return outcome;
}

/**
 * Copies every record of the invoices' author the relays of `from` hold to a majority of the relays
 * `next`, for a change of the account's relays, before it is saved: read whole until a majority of
 * `from` answered (every invoice is published to a majority, publishInvoice), each address's
 * newest copy, signed again when due (signedAgain), else as it is (of a newer format too). Null
 * when fewer than a majority of `from` answered whole, or a record did not reach a majority of
 * `next` (the copies after it are not tried). Never rejects.
 */
export async function copyInvoiceRecords(
  keys: InvoiceKeys,
  shared: SharedCounterKeys,
  from: RelayCall,
  next: readonly string[],
  now: number
): Promise<InvoiceRecordsCopy | null> {
  const answers = await queryRelaysPaged(invoicesFilter(keys), from, {
    whole: true,
    quorum: "majority"
  });
  if (answers.size < majority(from.relays.length)) return null;
  const held = heldInvoiceRecords(keys, answers);
  const call = { ...from, relays: next };
  const quorum = majority(next.length);
  const copied = await inBatches(held, COPIES_AT_ONCE, async (record) => {
    const event = signedAgain(keys, shared, record, now) ?? record.event;
    return (await publishAgainToQuorum(event, call, quorum)) ? true : null;
  });
  if (copied === null) return null;
  return { copied: new Map(held.map(({ address, event }) => [address, event.created_at])) };
}

/**
 * After a change of the account's relays, what the relays of `from` (the list left) hold of the
 * invoices' author that copyInvoiceRecords did not copy (`copy`): a record written there since, by
 * another of the owner's devices still on that list. Its newest copy, as it is, to a majority of
 * the new list `to` (publishCopies, the relays of both lists that sent it counting). Resolves with
 * whether a majority of `from` answered and a majority of `to` holds each one. Never rejects.
 */
export async function copyLateInvoiceRecords(
  keys: InvoiceKeys,
  from: RelayCall,
  to: readonly string[],
  copy: InvoiceRecordsCopy
): Promise<boolean> {
  if (to.length === 0) return true;
  const answers = await queryRelaysPaged(invoicesFilter(keys), from, { quorum: "majority" });
  const late = heldInvoiceRecords(keys, answers)
    .filter(({ address, event }) => event.created_at > (copy.copied.get(address) ?? -1))
    .map(({ event }) => event);
  const held = await publishCopies(late, from, to, holdersOf(answers, late));
  return answers.size >= majority(new Set(from.relays).size) && held === late.length;
}
