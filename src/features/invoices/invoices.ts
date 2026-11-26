import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";

import { ownerEpochSettled } from "@/features/team/export-epochs";
import {
  INVOICE_LIGHTNING_MARGIN_PERCENT,
  MAX_DUE_MONTHS,
  standardVatRate
} from "@/config/invoices";
import { getPaymentLinkOrigin } from "@/config/payment-links";
import { majority } from "@/config/registry";
import {
  getAccountSettings,
  getAccountTeamKeys,
  getAccountWalletId
} from "@/features/account/session";
import { assistantKeysOf } from "@/features/team/assistants";
import { takeOwnerNumber } from "@/features/team/numbering";
import { recordLink, takerKeyOf } from "@/features/team/member";
import { knownRoster, readRoster, type Roster } from "@/features/team/roster";
import { cancelLink, type CancelOutcome } from "@/features/team/cancel-links";
import { invoiceNetwork, payRequestOf } from "@/features/terminal/invoice";
import {
  addressPoolOf,
  keepAddressForLink,
  releaseOnchainAddress,
  takeOnchainAddress
} from "@/features/terminal/onchain-pool";
import { loadPosOptions } from "@/features/terminal/options";
import { nowUnix } from "@/lib/clock";
import { invoiceTotals, isPayable, type InvoiceLine } from "@/lib/invoice/amounts";
import { sendableSats } from "@/lib/lightning/lnurl";
import { assistantInvoiceCopiesOf } from "@/lib/invoice/assistant-copy";
import { InvoiceCounterError, sharedCounterKeys } from "@/lib/invoice/counter";
import {
  INVOICE_VERSION,
  formatInvoiceNumber,
  invoiceEvent,
  invoicesFilter,
  invoicesOf,
  isCalendarDate,
  newInvoiceId,
  parseInvoice,
  publishInvoice,
  type Invoice,
  type InvoiceNumber,
  type InvoiceRecipient,
  type InvoicesRead
} from "@/lib/invoice/record";
import {
  copyInvoiceRecords,
  copyLateInvoiceRecords,
  keepInvoiceRecords,
  type InvoiceRecordsCopy
} from "@/lib/invoice/upkeep";
import { logFailure } from "@/lib/log/log";
import { queryRelaysPaged, type RelayCall } from "@/lib/nostr/pool";
import { RECORD_KIND } from "@/lib/nostr/record";
import { payerNodeOf, type PayerNode } from "@/lib/onchain/node";
import { createPaymentLink, publishPaymentLink, type PaymentLink } from "@/lib/payment-link/link";
import {
  linkRegistryEpoch,
  LONG_SALE_LINK_VERSION,
  parsePaymentLinkPayload,
  type PaymentLinkPayload
} from "@/lib/payment-link/payload";
import { savePendingLink } from "@/lib/payment-link/pending";
import { secureRandomBytes } from "@/lib/random";
import { requireFreshRate } from "@/lib/rates/snapshot";
import { fetchHourPoint, pointHourOf } from "@/lib/rates/sources";
import { deriveSaleKeys, takerTag } from "@/lib/registry/registry";
import type { MerchantSettings } from "@/lib/settings/merchant";
import {
  deriveBusinessRegistry,
  deriveInvoiceKeys,
  invoiceCounterKey,
  type InvoiceKeys,
  type TeamKeys
} from "@/lib/team/keys";
import { TEAM_TIMEOUT_MS } from "@/lib/team/shared";
import { fiatToSats } from "@/lib/terminal/amount";
import type { AddressPool, OwnerTerminalProfile } from "@/lib/terminal/model";

/*
 * The owner's side of the invoices ("New invoice"): listing them, saving a draft, sending one,
 * canceling one sent.
 * Needs the account open (the passkey): the invoices' keys derive from the team's root
 * (deriveInvoiceKeys), wiped with it when the account closes. They go to the account's relays, stay
 * there (keepInvoices) and follow a change of them (copyInvoices: src/lib/invoice/upkeep.ts).
 *
 * Sending makes the invoice's payment link (src/lib/payment-link/, version 4): its sale starts
 * then and ends with the due date, its amount is the invoice's total, its note its number. As the
 * point of sale's links, it is kept on the device until its final version (pending.ts), its record
 * goes to the owner's devices (recordLink), and its on-chain address comes from the pool of the
 * owner's wallet (when the business accepts on-chain payments). Only then is the invoice saved as
 * sent, naming its link: a failure in between keeps the link made (PreparedInvoice) for the next
 * attempt, never a second link for one invoice.
 */

export type InvoiceErrorCode =
  /** No account open, or its sign-up is not done. */
  | "noAccount"
  /** Something the invoice needs is missing or out of range. */
  | "invalid"
  /** Too few relays answered or took the counter of the numbers: no number given. */
  | "number"
  /** This build has no web app for its payment links (no RP ID: local, CI). */
  | "noWebApp"
  /** No relay took the invoice or its link: nothing was saved. */
  | "unreachable"
  /**
   * Its total, at the present point of its currency, is above what an invoice without an on-chain
   * address may ask (`max`, in sats: INVOICE_LIGHTNING_MARGIN_PERCENT below the most the Lightning
   * address accepts), and its link would have none: no on-chain address was ready. Never sent so.
   */
  | "noAddress"
  /** Without an on-chain address, whether its total is within Lightning's bounds is not known. */
  | "unverified";

export class InvoiceError extends Error {
  readonly code: InvoiceErrorCode;
  /** With `noAddress`: the most an invoice without an address may ask, in sats. */
  readonly max: bigint | null;

  constructor(code: InvoiceErrorCode, message: string, max: bigint | null = null) {
    super(message);
    this.name = "InvoiceError";
    this.code = code;
    this.max = max;
  }
}

type OpenInvoices = { team: TeamKeys; settings: MerchantSettings };

function openInvoices(): OpenInvoices {
  const team = getAccountTeamKeys();
  const settings = getAccountSettings();
  if (!team || !settings || settings.signUp !== "done") {
    throw new InvoiceError("noAccount", "No finished account is open");
  }
  return { team, settings };
}

/**
 * A call to the account's relays as the invoices' author. Its key derives again at each
 * authentication: refused once the account closes (its team keys wiped, usableTeamKeys).
 */
function invoiceCall(team: TeamKeys, relays: readonly string[], timeoutMs: number) {
  return {
    channel: "account" as const,
    relays,
    timeoutMs,
    authKey: () => deriveInvoiceKeys(team).nostr.secretKey
  };
}

/** The assistant that made an invoice, as the roster names it. */
export type InvoiceAuthor = { id: string; name: string };

/** Every invoice of the business: the owner's, and its assistants' (`authors`). */
export type BusinessInvoices = InvoicesRead & {
  /** By invoice id: the assistant that made it; absent for the owner's. */
  authors: ReadonlyMap<string, InvoiceAuthor>;
};

/**
 * The assistants whose invoices the owner lists: in the team, and removed (each once). Never one
 * created without invoices (Assistant.invoicing): it makes none, an invoice of its key is whoever
 * kept it's. A removed one's are the owner's copies (loadInvoices). "Wallet" watches the invoices
 * of those in the team too (live.ts).
 */
export function invoiceAssistants(
  roster: Roster
): (InvoiceAuthor & { removedAt: number | null })[] {
  const seen = new Map<string, InvoiceAuthor & { removedAt: number | null }>();
  const without = new Set(
    [...roster.assistants, ...roster.removed]
      .filter((seat) => seat.invoicing === false)
      .map(({ id }) => id)
  );
  for (const { id, name } of roster.assistants) {
    if (!without.has(id)) seen.set(id, { id, name, removedAt: null });
  }
  for (const seat of roster.removed) {
    if (seat.role !== "assistant" || seen.has(seat.id) || without.has(seat.id)) continue;
    const first = roster.removed
      .filter((other) => other.role === "assistant" && other.id === seat.id)
      .reduce((earliest, other) => Math.min(earliest, other.removedAt), seat.removedAt);
    seen.set(seat.id, { id: seat.id, name: seat.name, removedAt: first });
  }
  return [...seen.values()];
}

/**
 * Every invoice of the business, from the account's relays (fetchInvoices): the owner's, and those
 * of its assistants (their own author and keys), those removed included (their invoices stay the
 * business's). A removed assistant's invoices are the owner's copies of them, made before its
 * removal (assistant-copy.ts), never what its key signs: that key is never revoked, whoever kept it
 * could otherwise add an invoice dated before the removal, change or remove one, or raise the
 * numbers the owner takes after them (takeNumber). An assistant's invoice that takes the id of an
 * invoice of the owner's is left out. Read as the roster this device knows: an assistant it does
 * not know yet is listed at the next read.
 */
export async function loadInvoices(): Promise<BusinessInvoices> {
  const { team, settings } = openInvoices();
  const call = invoiceCall(team, settings.relays, TEAM_TIMEOUT_MS.waiting);
  const owner = deriveInvoiceKeys(team);
  // The owner's invoices, and its copies of its removed assistants', while the roster is read: no
  // longer to wait without an assistant.
  const [roster, ownAnswers] = await Promise.all([
    readRoster(team, settings.relays, TEAM_TIMEOUT_MS.waiting),
    queryRelaysPaged(invoicesFilter(owner), call, { quorum: "majority" })
  ]);
  const ownEvents = [...ownAnswers.values()].flat();
  const own = invoicesOf(owner, ownEvents);
  const copied = assistantInvoiceCopiesOf(owner, ownEvents);
  const assistants = invoiceAssistants(roster.roster);
  const active = assistants.filter(({ removedAt }) => removedAt === null);
  const keysOf = (id: string) => assistantKeysOf(team, id).invoices;
  // One read for every assistant in the team: a relay may give an author's events to that author
  // only (NIP-42).
  const theirAnswers =
    active.length === 0
      ? new Map<string, unknown[]>()
      : await queryRelaysPaged(
          {
            kinds: [RECORD_KIND],
            authors: active.map(({ id }) => keysOf(id).nostr.publicKey)
          },
          {
            ...call,
            authKey: active.map(
              ({ id }) =>
                () =>
                  keysOf(id).nostr.secretKey
            )
          },
          { quorum: "majority" }
        );
  const events = [...theirAnswers.values()].flat();
  const ownIds = new Set(own.invoices.map(({ id }) => id));
  const authors = new Map<string, InvoiceAuthor>();
  const theirs: Invoice[] = [];
  let newerUnreadable = own.newerUnreadable || copied.newerUnreadable;
  for (const { id, name, removedAt } of assistants) {
    let made: readonly Invoice[];
    if (removedAt === null) {
      const read = invoicesOf(keysOf(id), events);
      newerUnreadable ||= read.newerUnreadable;
      made = read.invoices;
    } else {
      made = copied.copies.get(id) ?? [];
    }
    for (const invoice of made) {
      // An assistant sends its invoices: a draft of its key is nobody's.
      if (invoice.status === "draft") continue;
      if (ownIds.has(invoice.id) || authors.has(invoice.id)) continue;
      authors.set(invoice.id, { id, name });
      theirs.push(invoice);
    }
  }
  return {
    invoices: [...own.invoices, ...theirs].sort(
      (a, b) => b.createdAt - a.createdAt || (a.id < b.id ? -1 : 1)
    ),
    // Nothing told unless a majority answered, for the owner's invoices and the assistants' alike
    // (InvoicesState "failed"): every invoice is published to a majority (publishInvoice), and a
    // list read on fewer may lack one, or show a version older than the last.
    answered:
      ownAnswers.size >= majority(settings.relays.length) &&
      (active.length === 0 || theirAnswers.size >= majority(settings.relays.length))
        ? ownAnswers.size
        : 0,
    newerUnreadable,
    authors
  };
}

/**
 * Whose invoices' records the owner keeps on the relays: its own author, and every assistant's of
 * `roster` (in the team or removed: their invoices stay the business's), each with its keys and a
 * call as that author (a relay may take and give an author's events from and to it only).
 */
function invoiceWriters(
  team: TeamKeys,
  roster: Roster,
  relays: readonly string[],
  timeoutMs: number
): { keys: InvoiceKeys; call: RelayCall }[] {
  const ids = [
    ...new Set([
      ...roster.assistants.map(({ id }) => id),
      ...roster.removed.filter(({ role }) => role === "assistant").map(({ id }) => id)
    ])
  ];
  return [
    { keys: deriveInvoiceKeys(team), call: invoiceCall(team, relays, timeoutMs) },
    ...ids.map((id) => ({
      keys: assistantKeysOf(team, id).invoices,
      call: {
        ...invoiceCall(team, relays, timeoutMs),
        authKey: () => assistantKeysOf(team, id).invoices.nostr.secretKey
      }
    }))
  ];
}

/** At most one upkeep of the invoices per this long for an account on a device (keepInvoices). */
export const INVOICES_UPKEEP_INTERVAL_SECONDS = 24 * 60 * 60;

/** The last upkeep a majority of the relays answered, while the app runs. */
let lastUpkeep: { walletId: string; at: number } | null = null;

/**
 * The upkeep of the invoices on the account's relays (keepInvoiceRecords: each given to the relays
 * that lack it, signed again once a year), at an opening of a merchant's account
 * (useTeamChannelsSync), at most once an INVOICES_UPKEEP_INTERVAL_SECONDS: it reads every invoice.
 * Tried again at the next opening when fewer than a majority of the relays answered. Never
 * rejects.
 */
export async function keepInvoices(now: number = nowUnix()): Promise<void> {
  const team = getAccountTeamKeys();
  const settings = getAccountSettings();
  const walletId = getAccountWalletId();
  if (!team || !settings || !walletId) return;
  if (settings.signUp !== "done" || settings.usage !== "merchant") return;
  if (lastUpkeep?.walletId === walletId && now - lastUpkeep.at < INVOICES_UPKEEP_INTERVAL_SECONDS) {
    return;
  }
  // Set first: one upkeep at a time.
  const upkeep = { walletId, at: now };
  lastUpkeep = upkeep;
  try {
    // Signed again at the account's export epoch (export-epochs.ts).
    await ownerEpochSettled();
    // The assistants' too, as the roster has them: none known while it was not read, tried again.
    const roster = await readRoster(team, settings.relays);
    const shared = sharedCounterKeys(invoiceCounterKey(team));
    const writers = invoiceWriters(
      team,
      roster.roster,
      settings.relays,
      TEAM_TIMEOUT_MS.background
    );
    let read = roster.status === "read";
    for (const { keys, call } of writers) {
      const kept = await keepInvoiceRecords(keys, shared, call, now);
      read &&= kept.read;
    }
    if (!read && lastUpkeep === upkeep) lastUpkeep = null;
  } catch (error) {
    // The account closed meanwhile (its team keys wiped): at its next opening.
    if (lastUpkeep === upkeep) lastUpkeep = null;
    logFailure("Keeping the invoices on the relays failed", error);
  }
}

/** Forgets the last upkeep (tests). */
export function resetInvoicesUpkeep(): void {
  lastUpkeep = null;
}

/**
 * What copyInvoices copied, by author (hex): the owner's invoices' and each assistant's. Kept by
 * author: they share the address of the shared counter (each its own event there).
 */
export type InvoicesCopy = ReadonlyMap<string, InvoiceRecordsCopy>;

/**
 * At a change of the account's relays ("Settings", changeRelays), before it is saved: every record
 * of the invoices the relays `before` hold, the owner's and its assistants' (in the team or
 * removed, as the roster read on a majority of `before` has them), the counters of their numbers
 * included, on a majority of `next` (copyInvoiceRecords). Null when they are not there, or when the
 * roster was not read: the change is refused. Never rejects.
 */
export async function copyInvoices(
  team: TeamKeys,
  before: readonly string[],
  next: readonly string[],
  now: number = nowUnix()
): Promise<InvoicesCopy | null> {
  try {
    const roster = await readRoster(team, before);
    // An assistant's invoices missed would no longer show, its numbers would be given again.
    if (roster.status !== "read" || roster.newerUnreadable) return null;
    const shared = sharedCounterKeys(invoiceCounterKey(team));
    const copies = new Map<string, InvoiceRecordsCopy>();
    for (const { keys, call } of invoiceWriters(
      team,
      roster.roster,
      before,
      TEAM_TIMEOUT_MS.background
    )) {
      const copy = await copyInvoiceRecords(keys, shared, call, next, now);
      if (!copy) return null;
      copies.set(keys.nostr.publicKey, copy);
    }
    return copies;
  } catch (error) {
    // The account closed meanwhile (its team keys wiped).
    logFailure("Copying the invoices to the new relays failed", error);
    return null;
  }
}

/**
 * Once the change is saved (changeRelays), what the relays `before` got of the invoices since
 * copyInvoices (`copy`: another of the owner's devices, on that list still, saved an invoice or
 * took a number; an assistant made one), copied to the relays of `next` they do not share
 * (copyLateInvoiceRecords), author by author; every record of the list left, as it is, with an
 * empty `copy`. In the background. Resolves with whether each author's copy was whole. Never
 * rejects.
 */
export async function copyLateInvoices(
  team: TeamKeys,
  before: readonly string[],
  next: readonly string[],
  copy: InvoicesCopy
): Promise<boolean> {
  try {
    let whole = true;
    const known = knownRoster(team)?.roster;
    const writers = known
      ? invoiceWriters(team, known, before, TEAM_TIMEOUT_MS.background)
      : [
          {
            keys: deriveInvoiceKeys(team),
            call: invoiceCall(team, before, TEAM_TIMEOUT_MS.background)
          }
        ];
    for (const { keys, call } of writers) {
      const copied = copy.get(keys.nostr.publicKey);
      // An assistant created since the copy: its records all late.
      if (!(await copyLateInvoiceRecords(keys, call, next, copied ?? { copied: new Map() }))) {
        whole = false;
      }
    }
    return whole;
  } catch (error) {
    // The account closed meanwhile (its team keys wiped).
    logFailure("Copying the late invoices to the new relays failed", error);
    return false;
  }
}

/** A new line's VAT rate: the one of "Settings", else the country's (basis points). */
export function defaultVatRate(settings: MerchantSettings | null = getAccountSettings()): number {
  if (!settings) return 0;
  return settings.vatRate ?? standardVatRate(settings.detectedCountry);
}

/** What the wizard holds of an invoice, before it is saved. */
export type InvoiceForm = {
  recipient: InvoiceRecipient;
  currency: { code: string; digits: number };
  lines: InvoiceLine[];
  dueDate: string | null;
  terms: string;
  legal: string;
  redirectUrl: string | null;
};

/** A calendar date "YYYY-MM-DD" of the device's calendar. */
export function calendarDate(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** The date of `day` ("YYYY-MM-DD") at midnight in the device's calendar. */
export function dateOf(day: string): Date {
  const [year, month, date] = day.split("-").map(Number) as [number, number, number];
  return new Date(year, month - 1, date);
}

/** The first and last due dates offered on `today`: tomorrow, then MAX_DUE_MONTHS. */
export function dueRange(today: Date = new Date()): { first: string; last: string } {
  const first = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  // The same day MAX_DUE_MONTHS later, or the month's last when it has none (31 → 30).
  const target = today.getMonth() + MAX_DUE_MONTHS;
  const lastDay = new Date(today.getFullYear(), target + 1, 0).getDate();
  const last = new Date(today.getFullYear(), target, Math.min(today.getDate(), lastDay));
  return { first: calendarDate(first), last: calendarDate(last) };
}

/** Whether `day` is a due date offered on `today`. */
export function isDueDateOffered(day: string, today: Date = new Date()): boolean {
  const { first, last } = dueRange(today);
  return isCalendarDate(day) && day >= first && day <= last;
}

/**
 * Unix seconds: the end of `day` in the device's calendar (its next midnight), when the payment
 * link's sale ends.
 */
export function endOfDay(day: string): number {
  const date = dateOf(day);
  return Math.floor(
    new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime() / 1000
  );
}

/** The due date offered by default on `today`: 30 days later. */
export function defaultDueDate(today: Date = new Date()): string {
  return calendarDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 30));
}

/** Whether the recipient's name, street, postal code and city are filled (an invoice sent). */
export function isRecipientComplete(recipient: InvoiceRecipient): boolean {
  return [recipient.name, recipient.street, recipient.postalCode, recipient.city].every(
    (field) => field.trim() !== ""
  );
}

/** The form's texts trimmed, as they are saved. */
function trimmed(form: InvoiceForm): InvoiceForm {
  return {
    ...form,
    recipient: {
      name: form.recipient.name.trim(),
      street: form.recipient.street.trim(),
      postalCode: form.recipient.postalCode.trim(),
      city: form.recipient.city.trim(),
      country: form.recipient.country,
      reference: form.recipient.reference.trim()
    },
    lines: form.lines.map((line) => ({ ...line, name: line.name.trim() })),
    terms: form.terms.trim(),
    legal: form.legal.trim(),
    redirectUrl: form.redirectUrl?.trim() || null
  };
}

/**
 * The next number in the series the owner shares with its assistants (takeOwnerNumber), above
 * those of `known` (the invoices listed), in the year of the device's calendar. The roster read on
 * a majority of the relays first: an assistant it would miss could have taken the number, one
 * removed within the year too (src/features/team/numbering.ts).
 * Throws "number".
 */
async function takeNumber(open: OpenInvoices, known: readonly Invoice[]): Promise<InvoiceNumber> {
  const { team, settings } = open;
  const now = nowUnix();
  try {
    const read = await readRoster(team, settings.relays, TEAM_TIMEOUT_MS.waiting);
    // A seat of a newer app's format may be a writer this one does not know.
    if (read.status !== "read" || read.newerUnreadable) {
      throw new InvoiceCounterError("The writers of numbers are not known");
    }
    return await takeOwnerNumber(
      team,
      read.roster,
      settings.relays,
      TEAM_TIMEOUT_MS.waiting,
      new Date().getFullYear(),
      now,
      known.map(({ number }) => number)
    );
  } catch (error) {
    if (error instanceof InvoiceCounterError) {
      throw new InvoiceError("number", "No number could be taken");
    }
    throw error;
  }
}

/** Publishes an invoice's record once a relay took it. Throws "invalid" or "unreachable". */
async function save(open: OpenInvoices, invoice: Invoice): Promise<Invoice> {
  // Never a record its readers would refuse.
  if (!parseInvoice(invoice)) throw new InvoiceError("invalid", "Invalid invoice");
  // The account's export epoch first (export-epochs.ts): what a withdrawn grant read never opens it.
  await ownerEpochSettled();
  try {
    await publishInvoice(
      invoiceEvent(deriveInvoiceKeys(open.team), invoice),
      invoiceCall(open.team, open.settings.relays, TEAM_TIMEOUT_MS.background)
    );
  } catch {
    throw new InvoiceError("unreachable", "No relay took the invoice");
  }
  return invoice;
}

/** When a change of `saved` is dated: now, after its last version (relays keep the newest). */
function changedAt(saved: Invoice | null): number {
  const now = nowUnix();
  return saved ? Math.max(now, saved.updatedAt + 1) : now;
}

/**
 * Saves `form` as a draft ("Save as draft"): a new one takes its number first, then is saved once a
 * relay took it; `saved`, the draft it was opened from, keeps its own, as an invoice a failed
 * attempt to send made a link for (`prepared`) keeps the id and number it took. Rejects with an
 * InvoiceError: nothing is saved then.
 */
export async function saveDraft(
  form: InvoiceForm,
  saved: Invoice | null,
  known: readonly Invoice[],
  prepared: Pick<PreparedInvoice, "id" | "number" | "createdAt"> | null = null
): Promise<Invoice> {
  const open = openInvoices();
  const values = trimmed(form);
  // A failed attempt to send this invoice took its id and number: never a second one.
  const taken = saved ?? prepared;
  const number = taken?.number ?? (await takeNumber(open, known));
  const updatedAt = changedAt(saved);
  return save(open, {
    version: INVOICE_VERSION,
    id: taken?.id ?? newInvoiceId(),
    number,
    status: "draft",
    ...values,
    dueAt: values.dueDate === null ? null : endOfDay(values.dueDate),
    createdAt: Math.min(taken?.createdAt ?? updatedAt, updatedAt),
    updatedAt,
    sent: null
  });
}

/**
 * A sent invoice's payment link, made and not yet saved with its invoice: the next attempt to
 * send that invoice publishes it again rather than making another.
 */
export type PreparedInvoice = {
  /** The invoice it was made for (its id, its number), as the next attempt saves it. */
  id: string;
  number: InvoiceNumber;
  createdAt: number;
  /** What made the link: another amount, due date or redirection makes another link. */
  signature: string;
  link: PaymentLink;
  pool: AddressPool | null;
  /**
   * The tolerance of on-chain underpayments its sale is settled with (basis points, the account's
   * when the link was made: src/lib/onchain/tolerance.ts); never in the link.
   */
  tolerance: number;
};

/** What makes an invoice's link: its amount and currency, its due date, its redirection. */
function linkSignature(form: InvoiceForm): string {
  const { totalMinor } = invoiceTotals(form.lines);
  return JSON.stringify([totalMinor, form.currency, form.dueDate, form.redirectUrl]);
}

/** The note of an invoice's link, which the payer's page shows: its number. */
export type LinkNote = (number: string) => string;

/**
 * What an invoice's link is made with besides its number: the web app's origin, an on-chain address
 * of the owner's wallet when the pool has one (taken out of the pool: put it back when the link is
 * not made), the tolerance of on-chain underpayments its sale holds, and who takes it (takerTag,
 * with the sale's key). An invoice offers an on-chain address whatever "On-chain payments" says
 * (that setting is the point of sale's only, as for the integrations' orders); the pool is filled
 * for it in any case (onchain-pool.ts).
 *
 * Without an address, the link is paid over Lightning only: its total at the present point of its
 * currency must stay INVOICE_LIGHTNING_MARGIN_PERCENT below the most the Lightning address accepts
 * (above that maximum, the payer's page could show nothing to pay:
 * useSale.ts; the margin, for the rate that moves until its due date), or it is not sent
 * (`noAddress`; `unverified` when the bounds or the point cannot be read).
 */
type LinkTerms = {
  origin: string;
  /** Unix seconds: the end of its due date. */
  endsAt: number;
  pool: AddressPool;
  address: string | null;
  tolerance: number;
  saleKey: Uint8Array;
  taker: string | null;
  /** The merchant's node, when the owner passes it on to the payers' pages (payerNodeOf). */
  payerNode: PayerNode | null;
};

async function linkTerms(form: InvoiceForm, profile: OwnerTerminalProfile): Promise<LinkTerms> {
  const origin = getPaymentLinkOrigin();
  if (origin === null) throw new InvoiceError("noWebApp", "No web app for the payment links");
  if (form.dueDate === null) throw new InvoiceError("invalid", "No due date");
  const saleKey = secureRandomBytes(32);
  const takerKey = await takerKeyOf(profile).catch(() => null);
  const taker =
    takerKey === null ? null : takerTag(takerKey, deriveSaleKeys(saleKey).nostr.publicKey);
  // The tolerance and the node of the point of sale's options; never its `onchain` (above).
  const { onchainTolerance, bitcoinNode } = await loadPosOptions(profile);
  const pool = addressPoolOf(profile);
  // Lightning only without one, whatever the reason (OnchainTake).
  const address = (await takeOnchainAddress(pool)).address;
  if (address === null) await requireLightningBounds(form, profile);
  const endsAt = endOfDay(form.dueDate);
  return {
    origin,
    endsAt,
    pool,
    address,
    tolerance: onchainTolerance,
    saleKey,
    taker,
    payerNode: payerNodeOf(bitcoinNode)
  };
}

/**
 * Rejects (InvoiceError) unless the total of `form`, at the present point of its currency (rounded
 * up to the next whole sat, as an amount is fixed), stays INVOICE_LIGHTNING_MARGIN_PERCENT below
 * the most `profile`'s Lightning address accepts (rounded down to the whole sat): a link without an
 * on-chain address is paid over Lightning only, at the rate of each hour until its due date.
 */
async function requireLightningBounds(
  form: InvoiceForm,
  profile: OwnerTerminalProfile
): Promise<void> {
  let max: bigint;
  let sats: bigint;
  try {
    max = sendableSats(await payRequestOf(profile.lightningAddress)).max;
    // The point that prices the present, read without correcting the device's clock (the point
    // of sale's rate store does that: src/lib/rates/snapshot.ts).
    const now = nowUnix();
    const hour = pointHourOf(now);
    const point = await fetchHourPoint(form.currency.code, hour, now);
    const rate = requireFreshRate(
      point === null
        ? undefined
        : { hour, currency: form.currency.code, source: "coingecko", rate: point },
      now
    );
    sats = fiatToSats(invoiceTotals(form.lines).totalMinor, form.currency.digits, rate);
  } catch (error) {
    logFailure("Checking the invoice against Lightning's bounds failed", error);
    throw new InvoiceError("unverified", "Lightning's bounds or the rate could not be read");
  }
  const allowed = (max * (100n - INVOICE_LIGHTNING_MARGIN_PERCENT)) / 100n;
  if (sats > allowed) {
    throw new InvoiceError(
      "noAddress",
      "Above the Lightning address's bounds, less their margin, without an on-chain address",
      allowed
    );
  }
}

/**
 * Makes the payment link of an invoice to send (not published) with its `terms`: a sale of `total`
 * from now to the end of its due date, the business's registry and the link owner key of the open
 * account, who took it (this device, as the point of sale says it), and its on-chain address if
 * any. The address goes back to the pool when the link is not made.
 */
function prepareLink(
  open: OpenInvoices,
  form: InvoiceForm,
  number: InvoiceNumber,
  profile: OwnerTerminalProfile,
  note: LinkNote,
  { origin, endsAt, pool, address, tolerance, saleKey, taker, payerNode }: LinkTerms
): { link: PaymentLink; pool: AddressPool | null; tolerance: number } {
  const { totalMinor } = invoiceTotals(form.lines);
  const business = deriveBusinessRegistry(open.team);
  const startsAt = nowUnix();
  const payload: PaymentLinkPayload = {
    version: LONG_SALE_LINK_VERSION,
    businessName: profile.businessName,
    lightningAddress: profile.lightningAddress,
    fiat: { minor: totalMinor, digits: form.currency.digits, currency: form.currency.code },
    note: note(formatInvoiceNumber(number)),
    onchainAddress: address,
    startsAt,
    endsAt,
    ...(form.redirectUrl !== null ? { redirectUrl: form.redirectUrl } : {}),
    registryKey: bytesToHex(business.key),
    registryReader: business.reader,
    // The account's export epoch (payload.ts): the payer's page seals its declarations at it.
    ...linkRegistryEpoch(business.reader),
    owner: business.owner,
    ...(taker ? { taker } : {}),
    ...(payerNode ? { bitcoinNode: payerNode } : {})
  };
  // The payer's page would refuse it: never made.
  if (!parsePaymentLinkPayload(payload, invoiceNetwork())) {
    if (address !== null) void releaseOnchainAddress(pool, address);
    throw new InvoiceError("invalid", "Invalid payment link");
  }
  const link = createPaymentLink(payload, origin, startsAt, saleKey);
  // Its address goes back to the pool with its final version only (finalize.ts).
  if (address !== null) keepAddressForLink(address);
  return { link, pool: address === null ? null : pool, tolerance };
}

/**
 * Sends `form` ("Send by email"): checks it is whole (its recipient, payable lines, a due date
 * offered), takes its number when it has none, makes its payment link (or takes the one `prepared`
 * for it, unchanged since), publishes it, keeps it on the device until its final version, records
 * it for the owner's devices, then saves the invoice as sent with its link. Rejects with an
 * InvoiceError; `onPrepared` has the link made meanwhile, for the next attempt.
 */
export async function sendInvoice({
  form,
  saved,
  known,
  profile,
  prepared,
  onPrepared,
  note
}: {
  form: InvoiceForm;
  /** The draft it was opened from, null for a new invoice. */
  saved: Invoice | null;
  known: readonly Invoice[];
  profile: OwnerTerminalProfile;
  /** The link a failed attempt made for this invoice, if any. */
  prepared: PreparedInvoice | null;
  onPrepared: (prepared: PreparedInvoice) => void;
  note: LinkNote;
}): Promise<Invoice> {
  const open = openInvoices();
  const values = trimmed(form);
  if (
    !isRecipientComplete(values.recipient) ||
    !isPayable(values.lines, values.currency.digits) ||
    values.dueDate === null ||
    !isDueDateOffered(values.dueDate)
  ) {
    throw new InvoiceError("invalid", "The invoice is not whole");
  }
  // The account's export epoch, which its payment link names (payload.ts) and its record is sealed
  // at (export-epochs.ts).
  await ownerEpochSettled();
  const signature = linkSignature(values);
  const id = saved?.id ?? prepared?.id ?? newInvoiceId();
  let made = prepared?.id === id && prepared.signature === signature ? prepared : null;
  if (!made) {
    // Its terms (its address among them) before its number: an invoice refused takes none.
    const terms = await linkTerms(values, profile);
    let number: InvoiceNumber;
    try {
      number = saved?.number ?? prepared?.number ?? (await takeNumber(open, known));
    } catch (error) {
      if (terms.address !== null) {
        void releaseOnchainAddress(terms.pool, terms.address);
      }
      throw error;
    }
    const { link, pool, tolerance } = prepareLink(open, values, number, profile, note, terms);
    made = {
      id,
      number,
      createdAt: saved?.createdAt ?? prepared?.createdAt ?? nowUnix(),
      signature,
      link,
      pool,
      tolerance
    };
    onPrepared(made);
    // Kept until its final version is published, also after a restart.
    await savePendingLink(link, pool, tolerance).catch((error: unknown) => {
      logFailure("Keeping the invoice's payment link failed", error);
    });
  }
  const { link } = made;
  try {
    await publishPaymentLink(link);
  } catch {
    throw new InvoiceError("unreachable", "No relay took the payment link");
  }
  // The owner can publish its final version from any of its devices, and sees it is not final.
  const business = deriveBusinessRegistry(open.team);
  recordLink(profile, {
    id: link.id,
    key: link.key,
    createdAt: link.event.created_at,
    onchainAddress: link.payload.onchainAddress,
    relays: link.relays,
    secretKey: link.secretKey,
    business,
    tolerance: made.tolerance
  });
  const at = nowUnix();
  const updatedAt = changedAt(saved);
  return save(open, {
    version: INVOICE_VERSION,
    id,
    number: made.number,
    status: "sent",
    ...values,
    dueAt: link.payload.endsAt,
    createdAt: Math.min(made.createdAt, updatedAt),
    updatedAt,
    sent: {
      at: Math.min(at, link.payload.endsAt - 1),
      link: {
        id: link.id,
        key: bytesToHex(link.key),
        relays: [...link.relays],
        url: link.url
      }
    }
  });
}

/**
 * Removes a draft ("Delete the draft"): its removal at its address, dated after its last version. A
 * sent invoice is canceled (cancelInvoice), never removed. Rejects with an InvoiceError.
 */
export async function removeDraft(invoice: Invoice): Promise<void> {
  if (invoice.status !== "draft") throw new InvoiceError("invalid", "Only a draft is removed");
  const open = openInvoices();
  await ownerEpochSettled();
  try {
    await publishInvoice(
      invoiceEvent(deriveInvoiceKeys(open.team), {
        version: INVOICE_VERSION,
        id: invoice.id,
        removed: true,
        updatedAt: changedAt(invoice)
      }),
      invoiceCall(open.team, open.settings.relays, TEAM_TIMEOUT_MS.background)
    );
  } catch {
    throw new InvoiceError("unreachable", "No relay took the removal");
  }
}

/**
 * Cancels a sent invoice ("Cancel the invoice"): its payment link gets the owner's final version
 * "canceled" when nothing paid it (cancelLink). "received": it was paid, at least in part, and
 * stays as it is.
 */
export async function cancelInvoice(invoice: Invoice): Promise<CancelOutcome> {
  const { team } = openInvoices();
  if (!invoice.sent) throw new InvoiceError("invalid", "Only a sent invoice is canceled");
  const { link } = invoice.sent;
  return cancelLink(team, { author: link.id, key: hexToBytes(link.key), relays: link.relays });
}
