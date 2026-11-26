import { bytesToHex } from "@noble/hashes/utils.js";

import { standardVatRate } from "@/config/invoices";
import { getPaymentLinkOrigin } from "@/config/payment-links";
import { REMOVED_WRITER_SECONDS } from "@/config/team";
import { deriveAssistantKeys, type AssistantKeys } from "@/lib/assistant/keys";
import { isCheckoutOrigin } from "@/lib/payment-link/checkout";
import type { MerchantSettings } from "@/lib/settings/merchant";
import type { ChannelInvoicing } from "@/lib/team/channel-invoicing";
import {
  assistantSecretKey,
  deriveInvoiceKeys,
  invoiceCounterKey,
  type TeamKeys
} from "@/lib/team/keys";
import { makesInvoices, type RemovedSeat } from "@/lib/team/roster";

import type { Roster } from "./roster";

/*
 * The owner's side of its assistants (sattleme/mcp-server): the keys of each, which
 * the owner derives from its id (assistantSecretKey) to publish its channel and read what it writes.
 */

/** The keys of the assistant `id`, as its secret key gives them. */
export function assistantKeysOf(team: TeamKeys, id: string): AssistantKeys {
  return deriveAssistantKeys(assistantSecretKey(team, id));
}

/** The assistants of `roster` removed since `since`: each once, its first removal. */
function removedAssistants(roster: Pick<Roster, "removed">, since: number): RemovedSeat[] {
  const first = new Map<string, RemovedSeat>();
  for (const seat of roster.removed) {
    if (seat.role !== "assistant") continue;
    const known = first.get(seat.id);
    if (!known || seat.removedAt < known.removedAt) first.set(seat.id, seat);
  }
  return [...first.values()].filter(({ removedAt }) => removedAt >= since);
}

/**
 * The assistants in the team that take numbers in the shared series (src/lib/invoice/counter.ts).
 * Their ids, the order of the roster's. Never one created without invoices (Assistant.invoicing):
 * it never had the counter's key, it takes no number.
 */
export function activeWriterIds(roster: Pick<Roster, "assistants">): string[] {
  return roster.assistants.filter(makesInvoices).map(({ id }) => id);
}

/**
 * The assistants removed less than REMOVED_WRITER_SECONDS before `now` that took numbers, each
 * once (its first removal), not in the team again: their copies may count until the owner's copy
 * holds them (src/lib/invoice/counter.ts, src/features/team/numbering.ts).
 */
export function removedWriters(
  roster: Pick<Roster, "assistants" | "removed">,
  now: number
): { id: string; removedAt: number }[] {
  const active = activeWriterIds(roster);
  return removedAssistants(roster, now - REMOVED_WRITER_SECONDS)
    .filter(makesInvoices)
    .filter(({ id }) => !active.includes(id))
    .map(({ id, removedAt }) => ({ id, removedAt }));
}

/**
 * Every assistant whose copy of the shared counter may count at `now`: those in the team, and
 * those removed less than REMOVED_WRITER_SECONDS ago (removedWriters), whether the owner's copy
 * holds them yet or not. What a channel may name at most (MAX_COUNTER_WRITERS).
 */
export function counterWriterIds(
  roster: Pick<Roster, "assistants" | "removed">,
  now: number
): string[] {
  return [...activeWriterIds(roster), ...removedWriters(roster, now).map(({ id }) => id)];
}

/** What an assistant's channel copies from the account's settings (ChannelInvoicing). */
export type InvoicingBase = Omit<ChannelInvoicing, "counterKey" | "counterWriters">;

/**
 * What the business's invoices print and their web app, from the account's settings (as the
 * owner's invoices print them: src/features/invoices/), for its assistants' channels. Its default
 * VAT rate as "New invoice" starts a line with: the settings', else the country's.
 */
export function invoicingBaseOf(settings: MerchantSettings): InvoicingBase {
  const origin = getPaymentLinkOrigin();
  return {
    businessAddress: settings.businessAddress,
    companyNumber: settings.companyNumber,
    vatNumber: settings.vatNumber,
    detectedCountry: settings.detectedCountry,
    vatRate: settings.vatRate ?? standardVatRate(settings.detectedCountry),
    linkOrigin: origin !== null && isCheckoutOrigin(origin) ? origin : null
  };
}

/**
 * The invoicing of the channel of the assistant `id`: `base`, the shared counter's key, and the
 * other writers of numbers at `now`: the owner's invoices' author, then the other assistants of
 * `roster` in the team, then those removed within the year whose last number the owner's copy may
 * not hold yet (not in `absorbed`, src/features/team/numbering.ts). One the owner's copy holds is
 * no longer named: its key's holder can no longer stop the others' numbers.
 */
export function channelInvoicingOf(
  team: TeamKeys,
  id: string,
  base: InvoicingBase,
  roster: Pick<Roster, "assistants" | "removed">,
  now: number,
  absorbed: ReadonlySet<string> = new Set()
): ChannelInvoicing {
  const others = [
    ...activeWriterIds(roster),
    ...removedWriters(roster, now)
      .map((writer) => writer.id)
      .filter((writer) => !absorbed.has(writer))
  ].filter((writer) => writer !== id);
  return {
    ...base,
    counterKey: bytesToHex(invoiceCounterKey(team)),
    counterWriters: [
      deriveInvoiceKeys(team).nostr.publicKey,
      ...others.map((writer) => assistantKeysOf(team, writer).invoices.nostr.publicKey)
    ]
  };
}
