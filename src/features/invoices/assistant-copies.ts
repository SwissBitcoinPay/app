import { majority } from "@/config/registry";
import { assistantKeysOf } from "@/features/team/assistants";
import { inBatches } from "@/lib/batches";
import { nowUnix } from "@/lib/clock";
import {
  ASSISTANT_INVOICE_COPY_VERSION,
  assistantInvoiceCopyEvent
} from "@/lib/invoice/assistant-copy";
import { invoicesFilter, invoicesOf } from "@/lib/invoice/record";
import { logFailure } from "@/lib/log/log";
import {
  COPIES_AT_ONCE,
  publishToQuorum,
  queryRelaysPaged,
  type RelayCall
} from "@/lib/nostr/pool";
import { deriveInvoiceKeys, type TeamKeys } from "@/lib/team/keys";

/*
 * The owner's copy of an assistant's invoices, made before it is removed
 * (src/lib/invoice/assistant-copy.ts): once removed, its invoices are these copies only
 * (loadInvoices), never what its key signs.
 */

export type AssistantInvoicesCopy =
  /** Each invoice it sent is on a majority of the relays, as the owner's. */
  | "copied"
  /** Fewer than a majority answered, or took a copy: its removal waits (trying again is safe). */
  | "unreachable"
  /** One of its invoices is of a newer format: this app cannot copy it, nor remove it then. */
  | "newer";

/**
 * Copies every invoice the assistant `id` sent, as a majority of `relays` gives them, to a record
 * of the owner's each (assistantInvoiceCopyEvent), on a majority of them. Its drafts are nobody's:
 * not copied. Made before its removal: an invoice its MCP server finishes after this read (the
 * channel still active) is missed, its link still payable and settled by the owner
 * (owner-finals.ts). Never rejects.
 */
export async function copyAssistantInvoices(
  team: TeamKeys,
  id: string,
  relays: readonly string[],
  timeoutMs: number,
  now: number = nowUnix()
): Promise<AssistantInvoicesCopy> {
  try {
    const quorum = majority(relays.length);
    // As the assistant: a relay may give an author's events to that author only (NIP-42). Each
    // key derives again at each authentication: refused once the account closes.
    const keys = assistantKeysOf(team, id).invoices;
    // Whole answers only, as for the owner's copy of the declarations (archive.ts): the copy
    // stands for good, an invoice on a page not read would be lost.
    const answers = await queryRelaysPaged(
      invoicesFilter(keys),
      {
        channel: "account",
        relays,
        timeoutMs,
        authKey: () => assistantKeysOf(team, id).invoices.nostr.secretKey
      },
      { whole: true, quorum: "majority" }
    );
    if (answers.size < quorum) return "unreachable";
    const read = invoicesOf(keys, [...answers.values()].flat());
    // Never removed without it: once removed, an invoice not copied would no longer show.
    if (read.newerUnreadable) return "newer";
    const owner = deriveInvoiceKeys(team);
    const call: RelayCall = {
      channel: "account",
      relays,
      timeoutMs,
      authKey: () => deriveInvoiceKeys(team).nostr.secretKey
    };
    const sent = read.invoices.filter(({ status }) => status === "sent");
    const copied = await inBatches(sent, COPIES_AT_ONCE, async (invoice) => {
      const event = assistantInvoiceCopyEvent(
        owner,
        { version: ASSISTANT_INVOICE_COPY_VERSION, assistant: id, invoice },
        now
      );
      return publishToQuorum(event, call, quorum).then(
        () => true,
        () => null
      );
    });
    return copied === null ? "unreachable" : "copied";
  } catch (error) {
    // The account closed meanwhile (its team keys wiped).
    logFailure("Copying a removed assistant's invoices failed", error);
    return "unreachable";
  }
}
