import { DEFAULT_RELAYS } from "@/config/relays";
import { deriveAssistantKeys } from "@/lib/assistant/keys";
import {
  ASSISTANT_INVOICE_COPY_VERSION,
  assistantInvoiceCopiesOf,
  assistantInvoiceCopyAddress,
  assistantInvoiceCopyEvent,
  openAssistantInvoiceCopy,
  parseAssistantInvoiceCopy,
  type AssistantInvoiceCopy
} from "@/lib/invoice/assistant-copy";
import { invoiceAddress, invoiceEvent, type Invoice } from "@/lib/invoice/record";
import { NewerRecordError, sealRecord } from "@/lib/nostr/record";
import { assistantSecretKey, deriveInvoiceKeys, deriveTeamKeys } from "@/lib/team/keys";

/*
 * The owner's copy of a removed assistant's invoices (src/lib/invoice/assistant-copy.ts): signed by
 * the owner's invoices' author only, at the address of its assistant and invoice.
 */

const team = deriveTeamKeys(new Uint8Array(32).fill(5));
const owner = deriveInvoiceKeys(team);
const ASSISTANT = "ab".repeat(16);
const assistant = deriveAssistantKeys(assistantSecretKey(team, ASSISTANT)).invoices;
const AT = 1_790_000_000;

function invoice(patch: Partial<Invoice> = {}): Invoice {
  return {
    version: 1,
    id: "cd".repeat(16),
    number: { year: 2026, sequence: 7 },
    status: "sent",
    recipient: {
      name: "Smith Ltd",
      street: "4 Lake Street",
      postalCode: "1003",
      city: "Lausanne",
      country: "CH",
      reference: ""
    },
    currency: { code: "CHF", digits: 2 },
    lines: [{ name: "Consulting", quantity: 300, unitMinor: 120000, vatRate: 810 }],
    dueDate: "2026-12-04",
    dueAt: AT + 30 * 24 * 3600,
    terms: "",
    legal: "",
    redirectUrl: null,
    createdAt: AT,
    updatedAt: AT,
    sent: {
      at: AT,
      link: {
        id: "12".repeat(32),
        key: "34".repeat(32),
        relays: [...DEFAULT_RELAYS],
        url: "https://pay.example/pay#x"
      }
    },
    ...patch
  };
}

const copy = (patch: Partial<Invoice> = {}): AssistantInvoiceCopy => ({
  version: ASSISTANT_INVOICE_COPY_VERSION,
  assistant: ASSISTANT,
  invoice: invoice(patch)
});

describe("an assistant's invoice copied by the owner", () => {
  it("has a fixed address, never an invoice's", () => {
    // IRREVERSIBLE: copies already published are found at it.
    expect(assistantInvoiceCopyAddress(owner, ASSISTANT, "cd".repeat(16))).toBe(
      "3e5d0a791ae3e0f1ce9be22c1adf5e27df98da2858154fd6096c41dbca5a8a3f"
    );
    expect(assistantInvoiceCopyAddress(owner, ASSISTANT, "cd".repeat(16))).not.toBe(
      invoiceAddress(owner, "cd".repeat(16))
    );
    // Another assistant's invoice of the same id: another address.
    expect(assistantInvoiceCopyAddress(owner, "ef".repeat(16), "cd".repeat(16))).not.toBe(
      assistantInvoiceCopyAddress(owner, ASSISTANT, "cd".repeat(16))
    );
  });

  it("opens as it was sealed, by the owner's invoices' author", () => {
    const event = assistantInvoiceCopyEvent(owner, copy(), AT + 60);
    expect(event.pubkey).toBe(owner.nostr.publicKey);
    expect(event.created_at).toBe(AT + 60);
    expect(openAssistantInvoiceCopy(owner, event)).toEqual({
      status: "ok",
      event,
      value: copy()
    });
  });

  it("is never one signed by the assistant's key, which it keeps once removed", () => {
    // The assistant's author and keys: not the owner's, never read as a copy.
    expect(openAssistantInvoiceCopy(owner, assistantInvoiceCopyEvent(assistant, copy(), AT))).toBe(
      null
    );
    // Its own invoice is not a copy either.
    expect(openAssistantInvoiceCopy(owner, invoiceEvent(owner, invoice()))).toBeNull();
  });

  it("is refused at another address than its assistant's and invoice's", () => {
    const moved = sealRecord({
      type: "assistant-invoice",
      value: copy(),
      signer: owner.nostr.secretKey,
      encryptionKey: owner.encryptionKey,
      address: assistantInvoiceCopyAddress(owner, ASSISTANT, "ef".repeat(16)),
      createdAt: AT,
      block: 1024
    });
    expect(openAssistantInvoiceCopy(owner, moved)).toBeNull();
  });

  it("holds a sent invoice of a valid assistant id only", () => {
    expect(parseAssistantInvoiceCopy(copy())).toEqual(copy());
    expect(parseAssistantInvoiceCopy({ ...copy(), assistant: "AB".repeat(16) })).toBeNull();
    expect(parseAssistantInvoiceCopy({ ...copy(), assistant: "ab" })).toBeNull();
    expect(
      parseAssistantInvoiceCopy(copy({ status: "draft", sent: null, dueDate: null, dueAt: null }))
    ).toBeNull();
    expect(parseAssistantInvoiceCopy({ ...copy(), invoice: { ...invoice(), lines: "x" } })).toBe(
      null
    );
    expect(parseAssistantInvoiceCopy({ ...copy(), version: 0 })).toBeNull();
    expect(parseAssistantInvoiceCopy(null)).toBeNull();
  });

  it("tells a newer format, its own or its invoice's", () => {
    expect(() => parseAssistantInvoiceCopy({ ...copy(), version: 2 })).toThrow(NewerRecordError);
    expect(() =>
      parseAssistantInvoiceCopy({ ...copy(), invoice: { ...invoice(), version: 2 } })
    ).toThrow(NewerRecordError);
  });
});

describe("the copies among what relays sent", () => {
  it("keep each invoice's newest copy, by assistant", () => {
    const older = assistantInvoiceCopyEvent(owner, copy({ terms: "Old" }), AT);
    const newer = assistantInvoiceCopyEvent(owner, copy(), AT + 10);
    const other = assistantInvoiceCopyEvent(
      owner,
      { ...copy({ id: "ef".repeat(16) }), assistant: "01".repeat(16) },
      AT
    );
    const read = assistantInvoiceCopiesOf(owner, [
      older,
      newer,
      newer,
      other,
      invoiceEvent(owner, invoice())
    ]);
    expect(read.newerUnreadable).toBe(false);
    expect(read.copies.get(ASSISTANT)).toEqual([invoice()]);
    expect(read.copies.get("01".repeat(16))).toEqual([invoice({ id: "ef".repeat(16) })]);
    expect(read.copies.size).toBe(2);
  });

  it("leave out a copy a newer app wrote over, and say so", () => {
    const known = assistantInvoiceCopyEvent(owner, copy(), AT);
    const newer = sealRecord({
      type: "assistant-invoice",
      value: { ...copy(), version: 2 },
      signer: owner.nostr.secretKey,
      encryptionKey: owner.encryptionKey,
      address: assistantInvoiceCopyAddress(owner, ASSISTANT, invoice().id),
      createdAt: AT + 10,
      block: 1024
    });
    const read = assistantInvoiceCopiesOf(owner, [known, newer]);
    expect(read.newerUnreadable).toBe(true);
    expect(read.copies.size).toBe(0);
  });
});
