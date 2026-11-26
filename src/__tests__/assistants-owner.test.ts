import { bytesToHex } from "@noble/hashes/utils.js";

import * as paymentLinks from "@/config/payment-links";
import { DEFAULT_RELAYS } from "@/config/relays";
import { MAX_ASSISTANTS } from "@/config/team";
import { closeAccount, getAccountBackupKey, getAccountSettings } from "@/features/account/session";
import {
  changeBusinessNumber,
  changeOnchainPayments,
  changeRelays,
  changeVatRate
} from "@/features/settings/account-settings";
import {
  createAssistant,
  loadAssistants,
  removeAllSeats,
  removeAssistant,
  syncTeamChannels
} from "@/features/team/owner";
import { loadInvoices } from "@/features/invoices/invoices";
import { resetTerminalProfileCache } from "@/features/terminal/profile-cache";
import { ASSISTANT_KEY_PREFIX, deriveAssistantKeys, parseAssistantKey } from "@/lib/assistant/keys";
import { walletSecret } from "@/lib/breez/seed";
import { invoiceEvent, newInvoiceId, type Invoice } from "@/lib/invoice/record";
import { publishToRelays } from "@/lib/nostr/pool";
import { RelayRefusal } from "@/lib/nostr/relay-errors";
import { channelEvent, fetchChannel, type TeamChannel } from "@/lib/team/channel";
import {
  assistantSecretKey,
  deriveInvoiceKeys,
  deriveTeamKeys,
  invoiceCounterKey,
  type InvoiceKeys
} from "@/lib/team/keys";
import type { Assistant } from "@/lib/team/roster";
import type { SavedTerminalProfile } from "@/lib/terminal/model";
import { saveTerminalProfile } from "@/lib/terminal/profile";

import { TEST_WALLET_ID, openTestAccount, testSeed } from "../../jest/account";
import { rosterOn } from "../../jest/roster";
import type * as FileSystemFake from "../../jest/expo-file-system";
import type * as RelaysFake from "../../jest/nostr-relays";

/*
 * The owner's side of its assistants: created with their secret
 * key, their channel naming what their invoices need (the shared counter's key, the other writers
 * of numbers), kept in step with the settings, moved with the account's relays, removed.
 */

jest.mock("../lib/breez/wallet", () => ({
  checkWalletConfig: jest.fn(),
  connectWallet: jest.fn(),
  disconnectWallet: jest.fn(async () => undefined),
  getWalletId: jest.fn(),
  getWalletLightningAddress: jest.fn()
}));
// Mainnet: invoices of "bc" (the app config has no network under Jest).
jest.mock("../lib/breez/config", () => ({
  ...jest.requireActual("../lib/breez/config"),
  getBreezNetwork: () => "mainnet"
}));
const relays = jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");
const fileSystem = jest.requireMock<typeof FileSystemFake>("expo-file-system");

const ADDRESS = "sattleme02c6047f94@breez.tips";
const ORIGIN = "https://pay.example";
const team = deriveTeamKeys(walletSecret(testSeed()));
const ownerAuthor = deriveInvoiceKeys(team).nostr.publicKey;

jest.setTimeout(20_000);

beforeEach(() => {
  closeAccount();
  relays.resetRelays();
  fileSystem.resetFileSystem();
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
  // This build's web app: the payment links of the invoices open there.
  jest.spyOn(paymentLinks, "getPaymentLinkOrigin").mockReturnValue(ORIGIN);
});

afterEach(() => jest.restoreAllMocks());

/** The owner's device: its account open (done), its point of sale prepared. */
async function ownerDevice(): Promise<void> {
  await openTestAccount({ usage: "merchant", signUp: "done" });
  const profile: SavedTerminalProfile = {
    version: 2,
    walletId: TEST_WALLET_ID,
    backupKey: getAccountBackupKey()!,
    lightningAddress: ADDRESS,
    businessName: getAccountSettings()?.businessName ?? "",
    currency: "CHF"
  };
  await saveTerminalProfile(profile);
  resetTerminalProfileCache();
}

const keysOf = (assistant: Pick<Assistant, "id">) =>
  deriveAssistantKeys(assistantSecretKey(team, assistant.id));

/** The assistant's channel, as its MCP server reads it with its secret key alone. */
async function channelOf(secretKey: string, list?: readonly string[]): Promise<TeamChannel> {
  const access = parseAssistantKey(secretKey)!;
  const keys = deriveAssistantKeys(access.key).member;
  const found = await fetchChannel(access.teamPublicKey, keys, 1000, list ?? access.relays);
  if (found.status !== "found") throw new Error(`No channel: ${found.status}`);
  return found.channel;
}

/** A sent invoice, as an assistant's MCP server makes one. */
function assistantInvoice(patch: Partial<Invoice> = {}): Invoice {
  const at = Math.floor(Date.now() / 1000) - 3600;
  return {
    version: 1,
    id: newInvoiceId(),
    number: { year: 2026, sequence: 3 },
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
    lines: [{ name: "Consulting", quantity: 100, unitMinor: 50000, vatRate: 810 }],
    dueDate: "2026-12-31",
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
        url: `${ORIGIN}/pay#x`
      }
    },
    ...patch
  };
}

/** Publishes `value` signed by `writer` (an assistant's invoices' author). */
async function publishAs(writer: InvoiceKeys, value: Invoice): Promise<void> {
  await publishToRelays(invoiceEvent(writer, value), {
    relays: DEFAULT_RELAYS,
    channel: "account",
    timeoutMs: 1000,
    authKey: writer.nostr.secretKey
  });
}

function refuseAuthor(author: string, on: readonly string[]) {
  const publish = relays.publishEvent;
  return jest.spyOn(relays, "publishEvent").mockImplementation(async (url, event, options) => {
    if (event.pubkey === author && on.includes(url)) {
      throw new RelayRefusal(url, "blocked: not accepting events");
    }
    return publish(url, event, options);
  });
}

describe("creating an assistant", () => {
  it("gives its secret key once, its record and its channel with what its invoices need", async () => {
    await ownerDevice();
    const shown = await createAssistant("  Carol's assistant ");
    expect(shown.assistant.name).toBe("Carol's assistant");
    expect(shown.published).toBe(true);
    expect(shown.secretKey.startsWith(ASSISTANT_KEY_PREFIX)).toBe(true);
    expect(parseAssistantKey(shown.secretKey)).toEqual({
      teamPublicKey: team.publicKey,
      key: assistantSecretKey(team, shown.assistant.id),
      relays: DEFAULT_RELAYS
    });
    const { active } = await rosterOn(team);
    expect(active).toEqual([
      {
        role: "assistant",
        id: shown.assistant.id,
        name: "Carol's assistant",
        since: shown.assistant.createdAt,
        removedAt: null
      }
    ]);
    const settings = getAccountSettings()!;
    const channel = await channelOf(shown.secretKey);
    expect(channel).toMatchObject({
      status: "active",
      role: "assistant",
      name: "Carol's assistant",
      profile: { businessName: settings.businessName, lightningAddress: ADDRESS },
      relays: DEFAULT_RELAYS,
      invoicing: {
        businessAddress: settings.businessAddress,
        companyNumber: settings.companyNumber,
        vatNumber: settings.vatNumber,
        detectedCountry: settings.detectedCountry,
        linkOrigin: ORIGIN,
        counterKey: bytesToHex(invoiceCounterKey(team)),
        // The owner's devices: the only other writer of numbers yet.
        counterWriters: [ownerAuthor]
      }
    });
    // Never an integration's web app field nor the catalogue: an assistant makes invoices only.
    expect(channel).not.toHaveProperty("checkout");
    expect(channel).not.toHaveProperty("catalog");
    await expect(loadAssistants()).resolves.toMatchObject({
      assistants: [shown.assistant],
      roster: "read"
    });
  });

  it("names it in the other assistants' channels before it exists", async () => {
    await ownerDevice();
    const first = await createAssistant("Claude");
    const second = await createAssistant("Mistral");
    const firstAuthor = keysOf(first.assistant).invoices.nostr.publicKey;
    const secondAuthor = keysOf(second.assistant).invoices.nostr.publicKey;
    const firstChannel = await channelOf(first.secretKey);
    const secondChannel = await channelOf(second.secretKey);
    if (firstChannel.status !== "active" || secondChannel.status !== "active") throw new Error();
    expect(firstChannel.invoicing?.counterWriters).toEqual([ownerAuthor, secondAuthor]);
    expect(secondChannel.invoicing?.counterWriters).toEqual([ownerAuthor, firstAuthor]);
  });

  it("creates nothing when the other assistants' channels could not name it", async () => {
    await ownerDevice();
    await createAssistant("Claude");
    // The team signs every channel: refused by a majority, the first one is not told.
    const refused = refuseAuthor(team.publicKey, DEFAULT_RELAYS.slice(0, 3));
    await expect(createAssistant("Mistral")).rejects.toMatchObject({ code: "unreachable" });
    refused.mockRestore();
    const { active } = await rosterOn(team);
    expect(active.map(({ name }) => name)).toEqual(["Claude"]);
  });

  it("refuses a name left empty and more than MAX_ASSISTANTS", async () => {
    await ownerDevice();
    await expect(createAssistant("   ")).rejects.toMatchObject({ code: "invalidName" });
    for (let i = 0; i < MAX_ASSISTANTS; i++) await createAssistant(`Assistant ${i}`);
    await expect(createAssistant("One too many")).rejects.toMatchObject({ code: "tooMany" });
  });

  it("gives its key with no web app too: its channel says so, no invoice is made then", async () => {
    jest.spyOn(paymentLinks, "getPaymentLinkOrigin").mockReturnValue(null);
    await ownerDevice();
    const shown = await createAssistant("Claude");
    expect(await channelOf(shown.secretKey)).toMatchObject({ invoicing: { linkOrigin: null } });
  });
});

describe("an assistant created without invoices", () => {
  // An assistant that only exports the transactions.
  it("has a record and a channel that give nothing that numbers or makes invoices", async () => {
    await ownerDevice();
    const shown = await createAssistant("Accountant", { invoicing: false });
    expect(shown.published).toBe(true);
    expect(shown.assistant).toMatchObject({ name: "Accountant", invoicing: false });
    const { active } = await rosterOn(team);
    expect(active).toEqual([
      {
        role: "assistant",
        id: shown.assistant.id,
        name: "Accountant",
        since: shown.assistant.createdAt,
        removedAt: null,
        invoicing: false
      }
    ]);
    const channel = await channelOf(shown.secretKey);
    expect(channel).toMatchObject({
      version: 2,
      status: "active",
      role: "assistant",
      name: "Accountant",
      profile: { lightningAddress: ADDRESS },
      relays: DEFAULT_RELAYS
    });
    expect(channel).not.toHaveProperty("invoicing");
    await expect(loadAssistants()).resolves.toMatchObject({ assistants: [shown.assistant] });
  });

  it("is never named among the writers of numbers, nor changes the others' channels", async () => {
    await ownerDevice();
    const first = await createAssistant("Claude");
    const before = await channelOf(first.secretKey);
    // The others' channels refused: an assistant without invoices is created all the same.
    const refused = refuseAuthor(team.publicKey, DEFAULT_RELAYS.slice(0, 3));
    await expect(createAssistant("Accountant", { invoicing: false })).resolves.toMatchObject({
      published: false
    });
    refused.mockRestore();
    expect(await channelOf(first.secretKey)).toEqual(before);
    const third = await createAssistant("Mistral");
    const firstAuthor = keysOf(first.assistant).invoices.nostr.publicKey;
    expect(await channelOf(third.secretKey)).toMatchObject({
      invoicing: { counterWriters: [ownerAuthor, firstAuthor] }
    });
    expect(await channelOf(first.secretKey)).toMatchObject({
      invoicing: {
        counterWriters: [ownerAuthor, keysOf(third.assistant).invoices.nostr.publicKey]
      }
    });
  });

  it("keeps a channel without invoices through the syncs and a change of relays", async () => {
    await ownerDevice();
    const shown = await createAssistant("Accountant", { invoicing: false });
    await changeVatRate(810);
    await syncTeamChannels();
    const synced = await channelOf(shown.secretKey);
    expect(synced).toMatchObject({ version: 2 });
    expect(synced).not.toHaveProperty("invoicing");
    const next = ["wss://relay-a.example", "wss://relay-b.example", "wss://relay-c.example"];
    await changeRelays(next);
    const moved = await channelOf(shown.secretKey, next);
    expect(moved).toMatchObject({ version: 2, relays: next });
    expect(moved).not.toHaveProperty("invoicing");
  });

  it("is removed as any assistant, its record still saying it makes no invoices", async () => {
    await ownerDevice();
    const shown = await createAssistant("Accountant", { invoicing: false });
    await removeAssistant(shown.assistant);
    expect(await channelOf(shown.secretKey)).toEqual({
      version: 1,
      status: "removed",
      updatedAt: expect.any(Number)
    });
    const { removed } = await rosterOn(team);
    expect(removed).toMatchObject([{ id: shown.assistant.id, invoicing: false }]);
  });
});

describe("an assistant's channel", () => {
  it("follows the settings its invoices print", async () => {
    await ownerDevice();
    const shown = await createAssistant("Claude");
    await changeBusinessNumber("vatNumber", "CHE-123.456.789 MWST");
    await changeVatRate(810);
    await syncTeamChannels();
    expect(await channelOf(shown.secretKey)).toMatchObject({
      invoicing: { vatNumber: "CHE-123.456.789 MWST", vatRate: 810 }
    });
  });

  // "On-chain payments" is the point of sale's only; its MCP
  // server takes an address from its lot whenever its channel says so (sattleme/mcp-server,
  // make.ts).
  it('always says on-chain payments are taken, whatever "On-chain payments" says', async () => {
    await ownerDevice();
    // The account's settings stay on the device from one test to the next: back on after.
    await changeOnchainPayments(false);
    try {
      const shown = await createAssistant("Claude");
      expect(await channelOf(shown.secretKey)).toMatchObject({ profile: { onchain: true } });
      await syncTeamChannels();
      expect(await channelOf(shown.secretKey)).toMatchObject({ profile: { onchain: true } });

      // A channel written by an owner's app of before, which followed the setting: the next sync
      // of the channels says true again.
      const before = await channelOf(shown.secretKey);
      if (before.status !== "active") throw new Error("Not active");
      await publishToRelays(
        channelEvent(team, keysOf(shown.assistant).member, {
          ...before,
          profile: { ...before.profile, onchain: false },
          updatedAt: before.updatedAt + 1
        }),
        { relays: DEFAULT_RELAYS, channel: "account", timeoutMs: 1000, authKey: team.secretKey }
      );
      expect(await channelOf(shown.secretKey)).toMatchObject({ profile: { onchain: false } });
      await syncTeamChannels();
      expect(await channelOf(shown.secretKey)).toMatchObject({ profile: { onchain: true } });
    } finally {
      await changeOnchainPayments(true);
    }
  });

  it("moves with the account's relays", async () => {
    await ownerDevice();
    const shown = await createAssistant("Claude");
    const next = ["wss://relay-a.example", "wss://relay-b.example", "wss://relay-c.example"];
    await changeRelays(next);
    // Its server still reads the relays its key names: the channel there names the new list.
    expect(await channelOf(shown.secretKey)).toMatchObject({ relays: next });
    expect(await channelOf(shown.secretKey, next)).toMatchObject({ relays: next });
  });
});

describe("removing an assistant", () => {
  it("stops it first, then records its removal; the others stop naming it", async () => {
    await ownerDevice();
    const first = await createAssistant("Claude");
    const second = await createAssistant("Mistral");
    await removeAssistant(first.assistant);
    expect(await channelOf(first.secretKey)).toMatchObject({ status: "removed" });
    const { active, removed } = await rosterOn(team);
    expect(active.map(({ name }) => name)).toEqual(["Mistral"]);
    expect(removed.map(({ name }) => name)).toEqual(["Claude"]);
    // The owner's copy of the shared counter holds its numbers (none here): the other's channel no
    // longer names it, its key's holder can no longer stop their numbers (numbering.ts).
    expect(await channelOf(second.secretKey)).toMatchObject({
      invoicing: { counterWriters: [ownerAuthor] }
    });
    await syncTeamChannels();
    expect(await channelOf(second.secretKey)).toMatchObject({
      invoicing: { counterWriters: [ownerAuthor] }
    });
    await expect(loadAssistants()).resolves.toMatchObject({ assistants: [second.assistant] });
  });

  it("copies its invoices first: once removed, they are the owner's copies", async () => {
    await ownerDevice();
    const shown = await createAssistant("Claude");
    const sent = assistantInvoice();
    await publishAs(keysOf(shown.assistant).invoices, sent);
    await removeAssistant(shown.assistant);
    // Its key, kept by whoever: an invoice dated before the removal is no longer the business's.
    await publishAs(
      keysOf(shown.assistant).invoices,
      assistantInvoice({ number: { year: 2026, sequence: 9000 } })
    );
    const read = await loadInvoices();
    expect(read.invoices).toEqual([sent]);
    expect(read.authors.get(sent.id)).toEqual({ id: shown.assistant.id, name: "Claude" });
  });

  it("is refused, its channel active, when no majority takes the copy of its invoices", async () => {
    await ownerDevice();
    const shown = await createAssistant("Claude");
    await publishAs(keysOf(shown.assistant).invoices, assistantInvoice());
    refuseAuthor(ownerAuthor, DEFAULT_RELAYS.slice(0, 3));
    await expect(removeAssistant(shown.assistant)).rejects.toMatchObject({ code: "unreachable" });
    expect(await channelOf(shown.secretKey)).toMatchObject({ status: "active" });
    await expect(removeAllSeats()).rejects.toMatchObject({ code: "unreachable" });
    expect(await channelOf(shown.secretKey)).toMatchObject({ status: "active" });
  });

  it("is refused when one of its invoices is of a newer format", async () => {
    await ownerDevice();
    const shown = await createAssistant("Claude");
    await publishAs(keysOf(shown.assistant).invoices, {
      ...assistantInvoice(),
      version: 2
    } as unknown as Invoice);
    await expect(removeAssistant(shown.assistant)).rejects.toMatchObject({
      code: "invoicesNewer"
    });
    expect(await channelOf(shown.secretKey)).toMatchObject({ status: "active" });
  });

  it("goes with every seat when the account is deleted", async () => {
    await ownerDevice();
    const shown = await createAssistant("Claude");
    await expect(removeAllSeats()).resolves.toBe(1);
    expect(await channelOf(shown.secretKey)).toMatchObject({ status: "removed" });
  });
});
