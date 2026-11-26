import { DEFAULT_RELAYS } from "@/config/relays";
import { REMOVED_SEAT_GRACE_SECONDS } from "@/config/team";
import { closeAccount } from "@/features/account/session";
import { withoutRemoved, type OwnerRecords } from "@/features/activity/load";
import type { ActivityBy, LinkInfo } from "@/features/activity/model";
import { archivedTaker, takerResolver, type Seats } from "@/features/activity/takers";
import { sentLinks } from "@/features/invoices/activity";
import { copyAssistantInvoices } from "@/features/invoices/assistant-copies";
import {
  copyInvoices,
  keepInvoices,
  loadInvoices,
  resetInvoicesUpkeep
} from "@/features/invoices/invoices";
import { settlingHolders } from "@/features/payment-link/owner-finals";
import { deriveAssistantKeys } from "@/lib/assistant/keys";
import { walletSecret } from "@/lib/breez/seed";
import { assistantInvoiceCopyAddress } from "@/lib/invoice/assistant-copy";
import { INVOICE_REFRESH_SECONDS } from "@/lib/invoice/upkeep";
import { invoiceAddress, invoiceEvent, newInvoiceId, type Invoice } from "@/lib/invoice/record";
import type { NostrEvent } from "@/lib/nostr/event";
import { publishToRelays } from "@/lib/nostr/pool";
import { deriveSaleKeys, takerTag } from "@/lib/registry/registry";
import {
  assistantSecretKey,
  deriveInvoiceKeys,
  deriveTeamKeys,
  type InvoiceKeys
} from "@/lib/team/keys";
import type { Assistant } from "@/lib/team/roster";

import { openTestAccount, testSeed } from "../../jest/account";
import { publishAssistant } from "../../jest/roster";
import type * as FileSystemFake from "../../jest/expo-file-system";
import type * as RelaysFake from "../../jest/nostr-relays";

/*
 * What the owner reads of its assistants: their invoices among
 * its own, kept on the relays and moved with them; their sales named by "By"; their links
 * settled as an employee's.
 */

jest.mock("../lib/breez/config", () => ({
  ...jest.requireActual("../lib/breez/config"),
  getWalletConfig: () => ({ network: "mainnet", apiKey: "test-api-key" }),
  getBreezNetwork: () => "mainnet"
}));

const nostr = jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");
const fileSystem = jest.requireMock<typeof FileSystemFake>("expo-file-system");

const team = deriveTeamKeys(walletSecret(testSeed()));
const nowUnix = () => Math.floor(Date.now() / 1000);
const claude: Assistant = {
  id: "ab".repeat(16),
  name: "Carol's Claude",
  createdAt: nowUnix() - 30 * 24 * 3600
};
const keys = deriveAssistantKeys(assistantSecretKey(team, claude.id));
const NEXT = ["wss://relay-a.example", "wss://relay-b.example", "wss://relay-c.example"];

function invoice(patch: Partial<Invoice> = {}): Invoice {
  const at = nowUnix() - 3600;
  return {
    version: 1,
    id: newInvoiceId(),
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
    dueAt: at + 30 * 24 * 3600,
    terms: "",
    legal: "",
    redirectUrl: null,
    createdAt: at,
    updatedAt: at,
    sent: {
      at,
      link: {
        id: "cd".repeat(32),
        key: "ef".repeat(32),
        relays: [...DEFAULT_RELAYS],
        url: "https://pay.example/pay#x"
      }
    },
    ...patch
  };
}

/** Publishes `value` as the writer of `writer`'s invoices, dated `createdAt`. */
async function publishInvoice(
  writer: InvoiceKeys,
  value: Invoice,
  createdAt = value.updatedAt
): Promise<NostrEvent> {
  const event = invoiceEvent(writer, value, createdAt);
  await publishToRelays(event, {
    relays: DEFAULT_RELAYS,
    channel: "account",
    timeoutMs: 1000,
    authKey: writer.nostr.secretKey
  });
  return event;
}

beforeEach(async () => {
  nostr.resetRelays();
  fileSystem.resetFileSystem();
  resetInvoicesUpkeep();
  await openTestAccount({ usage: "merchant", signUp: "done" });
});

afterEach(() => closeAccount());

describe("the business's invoices", () => {
  it("list the assistants' with the owner's, each named by who made it", async () => {
    await publishAssistant(team, claude);
    const theirs = invoice();
    const own = invoice({ sent: null, status: "draft" });
    await publishInvoice(keys.invoices, theirs);
    await publishInvoice(deriveInvoiceKeys(team), own);
    const read = await loadInvoices();
    expect(read.invoices.map(({ id }) => id).sort()).toEqual([own.id, theirs.id].sort());
    expect([...read.authors]).toEqual([[theirs.id, { id: claude.id, name: claude.name }]]);
    // Their links, read whatever their age: "By" names the assistant.
    expect(sentLinks(read.invoices, read.authors)).toEqual([
      {
        id: theirs.sent!.link.id,
        key: theirs.sent!.link.key,
        createdAt: theirs.sent!.at,
        relays: theirs.sent!.link.relays,
        by: { kind: "member", id: claude.id, name: claude.name, assistant: true }
      }
    ]);
  });

  it("never take for an assistant's a draft, nor an invoice of the owner's id", async () => {
    await publishAssistant(team, claude);
    const own = invoice();
    await publishInvoice(deriveInvoiceKeys(team), own);
    await publishInvoice(
      keys.invoices,
      invoice({ id: own.id, number: { year: 2026, sequence: 8 } })
    );
    await publishInvoice(keys.invoices, invoice({ status: "draft", sent: null }));
    const read = await loadInvoices();
    expect(read.invoices.map(({ id }) => id)).toEqual([own.id]);
    expect(read.authors.size).toBe(0);
  });

  it("list a removed assistant's from the owner's copies, never what its key signs since", async () => {
    // Its key is never revoked (assistant-copy.ts).
    await publishAssistant(team, claude);
    const kept = invoice();
    const draft = invoice({ status: "draft", sent: null, dueDate: null, dueAt: null });
    await publishInvoice(keys.invoices, kept);
    await publishInvoice(keys.invoices, draft);
    await expect(copyAssistantInvoices(team, claude.id, DEFAULT_RELAYS, 1000)).resolves.toBe(
      "copied"
    );
    const removedAt = nowUnix();
    await publishAssistant(team, claude, { removedAt });
    // Whoever kept its key: an invoice dated before the removal, with a number far ahead (the
    // owner's next numbers start above those listed), and the one copied changed.
    const backdated = invoice({
      number: { year: 2026, sequence: Number.MAX_SAFE_INTEGER },
      createdAt: removedAt - 3600,
      updatedAt: removedAt - 3600
    });
    await publishInvoice(keys.invoices, backdated);
    await publishInvoice(
      keys.invoices,
      { ...kept, recipient: { ...kept.recipient, name: "Crook Ltd" }, updatedAt: removedAt + 60 },
      removedAt + 60
    );
    const read = await loadInvoices();
    expect(read.invoices).toEqual([kept]);
    expect([...read.authors]).toEqual([[kept.id, { id: claude.id, name: claude.name }]]);
    expect(read.answered).toBeGreaterThan(0);
  });

  it("keep a removed assistant's copied invoice when its key removes it", async () => {
    await publishAssistant(team, claude);
    const kept = invoice();
    await publishInvoice(keys.invoices, kept);
    await copyAssistantInvoices(team, claude.id, DEFAULT_RELAYS, 1000);
    await publishAssistant(team, claude, { removedAt: nowUnix() });
    // A removal at its address, which relays keep over the invoice (the newest of an address).
    await publishToRelays(
      invoiceEvent(keys.invoices, { version: 1, id: kept.id, removed: true, updatedAt: nowUnix() }),
      {
        relays: DEFAULT_RELAYS,
        channel: "account",
        timeoutMs: 1000,
        authKey: keys.invoices.nostr.secretKey
      }
    );
    await expect(loadInvoices()).resolves.toMatchObject({ invoices: [kept] });
  });

  it("list none of an assistant removed without the owner's copy", async () => {
    await publishAssistant(team, claude, { removedAt: nowUnix() - 3600 });
    await publishInvoice(
      keys.invoices,
      invoice({ createdAt: nowUnix() - 7200, updatedAt: nowUnix() - 7200 })
    );
    const read = await loadInvoices();
    expect(read.invoices).toEqual([]);
    expect(read.authors.size).toBe(0);
  });

  it("never take a newer format of a removed assistant's key for the owner's", async () => {
    await publishAssistant(team, claude, { removedAt: nowUnix() - 3600 });
    await publishInvoice(keys.invoices, { ...invoice(), version: 2 } as unknown as Invoice);
    // Its key is no longer read: nothing it signs tells the owner of a newer app.
    await expect(loadInvoices()).resolves.toMatchObject({ invoices: [], newerUnreadable: false });
  });

  it("are not copied while fewer than a majority answer, nor with one of a newer format", async () => {
    await publishAssistant(team, claude);
    await publishInvoice(keys.invoices, invoice());
    for (const relay of DEFAULT_RELAYS.slice(0, 3)) nostr.unreachable.add(relay);
    await expect(copyAssistantInvoices(team, claude.id, DEFAULT_RELAYS, 1000)).resolves.toBe(
      "unreachable"
    );
    nostr.unreachable.clear();
    await publishInvoice(keys.invoices, { ...invoice(), version: 2 } as unknown as Invoice);
    await expect(copyAssistantInvoices(team, claude.id, DEFAULT_RELAYS, 1000)).resolves.toBe(
      "newer"
    );
  });

  it("keep the owner's copies on the relays and move them with them", async () => {
    await publishAssistant(team, claude);
    const kept = invoice();
    await publishInvoice(keys.invoices, kept);
    const year = nowUnix() - INVOICE_REFRESH_SECONDS - 3600;
    await copyAssistantInvoices(team, claude.id, DEFAULT_RELAYS, 1000, year);
    await publishAssistant(team, claude, { removedAt: nowUnix() });
    const address = assistantInvoiceCopyAddress(deriveInvoiceKeys(team), claude.id, kept.id);
    const held = (relay: string) =>
      nostr.stored
        .get(relay)
        ?.find((event) => event.tags.some(([name, value]) => name === "d" && value === address));
    await keepInvoices();
    // Signed again, as the owner's own records (upkeep.ts).
    expect(held(DEFAULT_RELAYS[0]!)?.created_at).toBeGreaterThan(year);
    expect(held(DEFAULT_RELAYS[0]!)?.pubkey).toBe(deriveInvoiceKeys(team).nostr.publicKey);
    await expect(copyInvoices(team, DEFAULT_RELAYS, NEXT)).resolves.not.toBeNull();
    for (const relay of NEXT) expect(held(relay)).toBeDefined();
  });

  it("never list an invoice of an assistant created without invoices, in the team or removed", async () => {
    // Its key makes none; one signed with it is whoever kept it's.
    await publishAssistant(team, { ...claude, invoicing: false });
    await publishInvoice(keys.invoices, invoice());
    const read = await loadInvoices();
    expect(read.invoices).toEqual([]);
    expect(read.authors.size).toBe(0);
    await publishAssistant(team, { ...claude, invoicing: false }, { removedAt: nowUnix() - 3600 });
    await expect(loadInvoices()).resolves.toMatchObject({ invoices: [] });
  });

  it("are kept on the relays: an assistant's year-old invoice signed again", async () => {
    await publishAssistant(team, claude);
    const old = invoice();
    const at = nowUnix() - INVOICE_REFRESH_SECONDS - 3600;
    await publishInvoice(keys.invoices, old, at);
    await keepInvoices();
    const held = nostr.stored
      .get(DEFAULT_RELAYS[0]!)!
      .find((event) =>
        event.tags.some(
          ([name, value]) => name === "d" && value === invoiceAddress(keys.invoices, old.id)
        )
      )!;
    expect(held.pubkey).toBe(keys.invoices.nostr.publicKey);
    expect(held.created_at).toBeGreaterThan(at);
  });

  it("go with a change of the account's relays, the assistants' included", async () => {
    await publishAssistant(team, claude);
    const theirs = invoice();
    await publishInvoice(keys.invoices, theirs);
    const copy = await copyInvoices(team, DEFAULT_RELAYS, NEXT);
    expect(
      copy?.get(keys.invoices.nostr.publicKey)?.copied.has(invoiceAddress(keys.invoices, theirs.id))
    ).toBe(true);
    for (const relay of NEXT) {
      expect(
        nostr.stored.get(relay)?.some((event) => event.pubkey === keys.invoices.nostr.publicKey)
      ).toBe(true);
    }
  });

  it("refuse a change of relays while the roster is not read: an assistant's would be lost", async () => {
    await publishAssistant(team, claude);
    for (const relay of DEFAULT_RELAYS.slice(0, 3)) nostr.unreachable.add(relay);
    await expect(copyInvoices(team, DEFAULT_RELAYS, NEXT)).resolves.toBeNull();
  });
});

describe("an assistant's sales", () => {
  const seats: Seats = { employees: [], integrations: [], assistants: [claude], removed: [] };
  const saleKey = new Uint8Array(32).fill(7);
  const author = deriveSaleKeys(saleKey).nostr.publicKey;
  const tag = takerTag(keys.takerKey, author);

  it("are told by its mark, as a member's, and kept by the copy as an assistant's", () => {
    expect(takerResolver(team, seats)(tag, author)).toEqual({ kind: "member", id: claude.id });
    expect(archivedTaker({ kind: "member", id: claude.id }, nowUnix(), seats)).toEqual({
      role: "assistant",
      id: claude.id,
      name: claude.name
    });
  });

  it("stay its own once it is removed, when paid before its removal", () => {
    const removedAt = nowUnix() - 3600;
    const removed: Seats = {
      employees: [],
      integrations: [],
      assistants: [],
      removed: [
        { role: "assistant", id: claude.id, name: claude.name, since: claude.createdAt, removedAt }
      ]
    };
    expect(takerResolver(team, removed)(tag, author)).toEqual({ kind: "member", id: claude.id });
    expect(archivedTaker({ kind: "member", id: claude.id }, removedAt - 60, removed)).toEqual({
      role: "assistant",
      id: claude.id,
      name: claude.name
    });
    expect(
      archivedTaker(
        { kind: "member", id: claude.id },
        removedAt + REMOVED_SEAT_GRACE_SECONDS + 1,
        removed
      )
    ).toBeNull();
  });

  it("keep their links when the records leave out an employee removed meanwhile", () => {
    const assistant: ActivityBy = {
      kind: "member",
      id: claude.id,
      name: claude.name,
      assistant: true
    };
    const removed: ActivityBy = { kind: "member", id: "01".repeat(16), name: "Alice" };
    // Only `by` matters to what is left out.
    const link = (by: ActivityBy) => ({ by }) as unknown as LinkInfo;
    const records: OwnerRecords = {
      sales: [],
      links: [link(assistant), link(removed), link({ kind: "you" })],
      unread: 0,
      members: new Map([[removed.id, removed]]),
      roster: null
    };
    expect(withoutRemoved(records, []).links.map(({ by }) => by)).toEqual([
      assistant,
      { kind: "you" }
    ]);
  });

  it("have their links settled by the owner, as an employee's", () => {
    const holders = settlingHolders(team, { employees: [], assistants: [claude], removed: [] }, []);
    expect(holders).toEqual([
      { id: claude.id, keys: keys.member, employee: true, assistant: true }
    ]);
  });
});
