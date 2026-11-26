import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

import type { NostrEvent } from "@/lib/nostr/event";
import { NewerRecordError, openRecord, sealRecord, type OpenedRecord } from "@/lib/nostr/record";
import { isMemberId, type InvoiceKeys } from "@/lib/team/keys";

import { parseInvoice, type Invoice } from "./record";

/*
 * The owner's copy of a removed assistant's invoices: before an assistant is removed, the owner's
 * device copies
 * each invoice it sent, as the relays hold it then, into a record of its own, signed by the owner's
 * invoices' author (deriveInvoiceKeys), which only the owner's devices hold. Once the assistant is
 * removed, these copies are its invoices: whatever its key signs afterwards (an invoice dated
 * before its removal, a change or a removal of one of its invoices) is no longer read. Its key is
 * never revoked (no rotation), so a record it signs proves nothing once it is removed.
 *
 * A copy is never removed: an invoice sent stays the business's. One record per invoice, as the
 * owner's own invoices: on the relays with them, kept and moved with them (upkeep.ts).
 */

/** The copy's type: never changed (records already published name it). */
const RECORD_TYPE = "assistant-invoice";

/** Format of a copy's value. */
export const ASSISTANT_INVOICE_COPY_VERSION = 1;

/** Plaintexts are padded to multiples of this, as an invoice's (record.ts). */
const BLOCK = 1024;

export type AssistantInvoiceCopy = {
  version: typeof ASSISTANT_INVOICE_COPY_VERSION;
  /** The assistant's id (its seat in the roster). */
  assistant: string;
  /** Its invoice as the relays held it before its removal: sent (a draft is nobody's). */
  invoice: Invoice;
};

/**
 * The opaque `d` tag of the copy of the assistant `assistant`'s invoice `invoiceId`, under the
 * owner's invoices' address key. IRREVERSIBLE: the text hashed (vector in
 * assistant-invoice-copy.test.ts). Never one of an invoice's (`invoice/…`) nor of the counter's.
 */
export function assistantInvoiceCopyAddress(
  keys: InvoiceKeys,
  assistant: string,
  invoiceId: string
): string {
  return bytesToHex(
    hmac(sha256, keys.addressKey, utf8ToBytes(`assistant-invoice/${assistant}/${invoiceId}`))
  );
}

/** A copy's value; null when invalid. Throws for a newer version, its own or its invoice's. */
export function parseAssistantInvoiceCopy(value: unknown): AssistantInvoiceCopy | null {
  if (value === null || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (typeof v.version === "number" && v.version > ASSISTANT_INVOICE_COPY_VERSION) {
    throw new NewerRecordError();
  }
  if (v.version !== ASSISTANT_INVOICE_COPY_VERSION || !isMemberId(v.assistant)) return null;
  const invoice = parseInvoice(v.invoice);
  if (!invoice || invoice.status !== "sent") return null;
  return { version: ASSISTANT_INVOICE_COPY_VERSION, assistant: v.assistant, invoice };
}

/** The signed record of `copy`, by the owner's invoices' author, dated `createdAt`. */
export function assistantInvoiceCopyEvent(
  keys: InvoiceKeys,
  copy: AssistantInvoiceCopy,
  createdAt: number
): NostrEvent {
  return sealRecord({
    type: RECORD_TYPE,
    value: copy,
    signer: keys.nostr.secretKey,
    encryptionKey: keys.encryptionKey,
    address: assistantInvoiceCopyAddress(keys, copy.assistant, copy.invoice.id),
    createdAt,
    block: BLOCK
  });
}

/**
 * What a relay sent, if it is a copy of the owner's (`keys`: its invoices' author; openRecord:
 * author, decryption, type, signature), at the address of the assistant and invoice it holds; null
 * otherwise.
 */
export function openAssistantInvoiceCopy(
  keys: InvoiceKeys,
  value: unknown
): OpenedRecord<AssistantInvoiceCopy> | null {
  return openRecord(value, {
    type: RECORD_TYPE,
    encryptionKey: keys.encryptionKey,
    address: () => true,
    author: keys.nostr.publicKey,
    parse: (payload, event) => {
      const copy = parseAssistantInvoiceCopy(payload);
      const address = event.tags.find(([name]) => name === "d")?.[1];
      return copy && address === assistantInvoiceCopyAddress(keys, copy.assistant, copy.invoice.id)
        ? copy
        : null;
    }
  });
}

export type AssistantInvoiceCopies = {
  /** By assistant id: its invoices the owner copied, each once (its newest copy). */
  copies: ReadonlyMap<string, Invoice[]>;
  /** Some copy was of a newer format: a newer app of the owner's wrote it. */
  newerUnreadable: boolean;
};

/**
 * The copies among the events relays sent (the owner's invoices' author's: fetched with its
 * invoices), each checked (openAssistantInvoiceCopy); of a copy on several relays, the newest. A
 * copy a newer app wrote since is left out, as an invoice (invoicesOf).
 */
export function assistantInvoiceCopiesOf(
  keys: InvoiceKeys,
  events: readonly unknown[]
): AssistantInvoiceCopies {
  const newest = new Map<string, { event: NostrEvent; copy: AssistantInvoiceCopy }>();
  const newer = new Map<string, number>();
  const checked = new Set<string>();
  for (const value of events) {
    const id = (value as { id?: unknown } | null)?.id;
    if (typeof id === "string" && checked.has(id)) continue;
    const opened = openAssistantInvoiceCopy(keys, value);
    if (!opened) continue;
    checked.add(opened.event.id);
    const address = opened.event.tags.find(([name]) => name === "d")?.[1] ?? "";
    if (opened.status === "newer") {
      newer.set(address, Math.max(newer.get(address) ?? 0, opened.event.created_at));
      continue;
    }
    const known = newest.get(address);
    if (
      !known ||
      opened.event.created_at > known.event.created_at ||
      (opened.event.created_at === known.event.created_at && opened.event.id < known.event.id)
    ) {
      newest.set(address, { event: opened.event, copy: opened.value });
    }
  }
  const copies = new Map<string, Invoice[]>();
  for (const [address, { event, copy }] of newest) {
    const newerAt = newer.get(address);
    if (newerAt !== undefined && newerAt >= event.created_at) continue;
    copies.set(copy.assistant, [...(copies.get(copy.assistant) ?? []), copy.invoice]);
  }
  return { copies, newerUnreadable: newer.size > 0 };
}
