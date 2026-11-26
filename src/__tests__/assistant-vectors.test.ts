import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";

import { DEFAULT_RELAYS } from "@/config/relays";
import { ASSISTANT_LOT_SIZE, MEMBER_LOT_SIZE } from "@/config/team";
import { closeAccount } from "@/features/account/session";
import { loadInvoices } from "@/features/invoices/invoices";
import { deriveAssistantKeys, parseAssistantKey } from "@/lib/assistant/keys";
import { encodeWalletSecret } from "@/lib/breez/secret";
import { walletSecret } from "@/lib/breez/seed";
import { invoiceTotals } from "@/lib/invoice/amounts";
import { sharedCounterKeys, takeSharedInvoiceNumber } from "@/lib/invoice/counter";
import { invoiceEvent, invoicesOf, type Invoice } from "@/lib/invoice/record";
import type { NostrEvent } from "@/lib/nostr/event";
import { publishToRelays } from "@/lib/nostr/pool";
import { fetchPaymentLink, parsePaymentLinkFragment } from "@/lib/payment-link/link";
import { parsePaymentLinkPayload } from "@/lib/payment-link/payload";
import { openLinkKey } from "@/lib/payment-link/sealed-key";
import { deriveSaleKeys, takerTag } from "@/lib/registry/registry";
import { fetchChannel } from "@/lib/team/channel";
import {
  assistantSecretKey,
  deriveInvoiceKeys,
  deriveRegistryReader,
  deriveTeamKeys,
  invoiceCounterKey
} from "@/lib/team/keys";
import { fetchLinks } from "@/lib/team/member-records";
import { fetchLot, fetchLotStates } from "@/lib/team/onchain-lot";

import vectors from "./fixtures/mcp-server/assistant.json";
import noInvoicing from "./fixtures/mcp-server/assistant-no-invoicing.json";
import { openTestAccount, testSeed } from "../../jest/account";
import { publishAssistant } from "../../jest/roster";
import type * as FileSystemFake from "../../jest/expo-file-system";
import type * as RelaysFake from "../../jest/nostr-relays";

/*
 * The app's half of the assistants' cross-check: the vectors
 * the MCP server (sattleme/mcp-server, local or hosted) is tested against are the app's
 * (src/__tests__/fixtures/mcp-server/assistant.json, its vectors/app/assistant.json). Each value reads here
 * as the app reads it: the key, the keys it gives, the channel and the lot the owner wrote, the
 * owner's copy of the shared counter, an invoice of the assistant's, the payment link of that
 * invoice (as its payer's page reads it) and its record for the owner. A change on either side
 * breaks one of the two test suites; the file is made again only on purpose.
 */

jest.mock("../lib/breez/config", () => ({
  ...jest.requireActual("../lib/breez/config"),
  getWalletConfig: () => ({ network: "mainnet", apiKey: "test-api-key" }),
  getBreezNetwork: () => "mainnet"
}));

const relays = jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");
const fileSystem = jest.requireMock<typeof FileSystemFake>("expo-file-system");

// The BIP-39 test mnemonic (all-zero entropy) the vectors were made with, never a real wallet's.
const MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const team = deriveTeamKeys(encodeWalletSecret({ mnemonic: MNEMONIC }));
const ASSISTANT = "0123456789abcdef0123456789abcdef";
const keys = deriveAssistantKeys(hexToBytes(vectors.parsed.assistantKey));
const RELAYS = vectors.parsed.relays;

/** Publishes the vectors' events to `list`, as their authors did. */
async function publish(events: unknown[], list: readonly string[] = RELAYS): Promise<void> {
  for (const event of events) {
    await publishToRelays(event as NostrEvent, {
      relays: list,
      channel: "account",
      timeoutMs: 1000,
      authKey: [
        team.secretKey,
        keys.member.nostr.secretKey,
        keys.member.links.secretKey,
        keys.invoices.nostr.secretKey,
        deriveInvoiceKeys(team).nostr.secretKey
      ]
    });
  }
}

/** src/__tests__/fixtures/mcp-server/assistant.json is sattleme/mcp-server's vectors/app/assistant.json. */
const VECTOR_SHA256 = "0018eba6c9db493d0c0d1d757e464b37cb08b2c54bd332eab4d61f7c56d2fba0";
/**
 * src/__tests__/fixtures/mcp-server/assistant-no-invoicing.json is sattleme/mcp-server's
 * vectors/app/assistant-no-invoicing.json.
 */
const NO_INVOICING_SHA256 = "6b9b3d06e07305c0323d8348f47d9c1b35755e2c925e73c2dd95031979bd4f1d";

// Node's types are not loaded (tsconfig `types` only lists jest): only what this test needs.
declare const __dirname: string;
const fs = jest.requireActual<{ readFileSync(path: string): Uint8Array }>("fs");
const { join } = jest.requireActual<{ join(...segments: string[]): string }>("path");

beforeEach(() => {
  relays.resetRelays();
  fileSystem.resetFileSystem();
});

it("src/__tests__/fixtures/mcp-server/assistant.json is sattleme/mcp-server's vectors/app/assistant.json", () => {
  const bytes = fs.readFileSync(join(__dirname, "fixtures", "mcp-server", "assistant.json"));
  expect(bytesToHex(sha256(bytes))).toBe(VECTOR_SHA256);
});

it("src/__tests__/fixtures/mcp-server/assistant-no-invoicing.json is sattleme/mcp-server's vectors/app/assistant-no-invoicing.json", () => {
  const bytes = fs.readFileSync(
    join(__dirname, "fixtures", "mcp-server", "assistant-no-invoicing.json")
  );
  expect(bytesToHex(sha256(bytes))).toBe(NO_INVOICING_SHA256);
});

describe("the vectors of an assistant without invoices", () => {
  it("hold the channel the owner wrote: version 2, nothing that numbers or makes invoices", async () => {
    await publish([noInvoicing.channel.event]);
    await expect(fetchChannel(team.publicKey, keys.member, 1000, RELAYS)).resolves.toEqual({
      status: "found",
      channel: noInvoicing.channel.value
    });
    expect(noInvoicing.channel.value).toMatchObject({ version: 2, role: "assistant" });
    expect(noInvoicing.channel.value).not.toHaveProperty("invoicing");
  });
});

describe("the assistants' vectors", () => {
  it("hold the app's secret key and every key it gives", () => {
    expect(assistantSecretKey(team, ASSISTANT)).toEqual(hexToBytes(vectors.parsed.assistantKey));
    expect(parseAssistantKey(vectors.secretKey)).toEqual({
      teamPublicKey: vectors.parsed.team,
      key: hexToBytes(vectors.parsed.assistantKey),
      relays: RELAYS
    });
    expect(team.publicKey).toBe(vectors.parsed.team);
    const derived = vectors.derived;
    expect(keys.member.channel.address).toBe(derived.channelAddress);
    expect(keys.member.channel.encryptionKey).toEqual(hexToBytes(derived.channelEncryptionKey));
    expect(keys.member.nostr.publicKey).toBe(derived.memberPublicKey);
    expect(keys.member.records.encryptionKey).toEqual(hexToBytes(derived.recordsEncryptionKey));
    expect(keys.member.records.addressKey).toEqual(hexToBytes(derived.recordsAddressKey));
    expect(keys.member.links.publicKey).toBe(derived.linksPublicKey);
    expect(keys.takerKey).toEqual(hexToBytes(derived.takerKey));
    expect(keys.invoices.nostr.publicKey).toBe(derived.invoicesAuthor);
    expect(keys.invoices.encryptionKey).toEqual(hexToBytes(derived.invoicesEncryptionKey));
    expect(keys.invoices.addressKey).toEqual(hexToBytes(derived.invoicesAddressKey));
  });

  it("hold the channel the owner wrote, with what its invoices need", async () => {
    await publish([vectors.channel.event]);
    await expect(fetchChannel(team.publicKey, keys.member, 1000, RELAYS)).resolves.toEqual({
      status: "found",
      channel: vectors.channel.value
    });
    expect(vectors.channel.value.invoicing.counterKey).toBe(vectors.counter.counterKey);
  });

  it("hold the lot the owner gave it, and the addresses it used", async () => {
    await publish([vectors.lot.event, vectors.used.event]);
    await expect(fetchLot(team.publicKey, keys.member, "mainnet", RELAYS)).resolves.toEqual(
      vectors.lot.value
    );
    const states = await fetchLotStates(
      team,
      [{ id: ASSISTANT, keys: keys.member }],
      "mainnet",
      team.secretKey,
      RELAYS
    );
    expect(states?.get(ASSISTANT)).toEqual({
      lot: vectors.lot.value,
      used: vectors.used.value,
      newer: false
    });
  });

  it("hold its lot of 100 addresses and the addresses it used, of version 2", async () => {
    // An assistant's lot holds ASSISTANT_LOT_SIZE addresses.
    expect(vectors.lotV2.value.addresses).toHaveLength(ASSISTANT_LOT_SIZE);
    expect(vectors.usedV2.value.used.length).toBeGreaterThan(MEMBER_LOT_SIZE);
    await publish([vectors.lotV2.event, vectors.usedV2.event]);
    const states = await fetchLotStates(
      team,
      [{ id: ASSISTANT, keys: keys.member }],
      "mainnet",
      team.secretKey,
      RELAYS
    );
    expect(states?.get(ASSISTANT)).toEqual({
      lot: vectors.lotV2.value,
      used: vectors.usedV2.value,
      newer: false
    });
    // An employee's device never takes it: its secure store keeps 20 addresses at most.
    await expect(fetchLot(team.publicKey, keys.member, "mainnet", RELAYS)).resolves.toBeNull();
  });

  it("hold the owner's copy of the shared counter: the assistant's next number follows it", async () => {
    const shared = sharedCounterKeys(invoiceCounterKey(team));
    expect(shared).toEqual({
      encryptionKey: hexToBytes(vectors.counter.encryptionKey),
      address: vectors.counter.address
    });
    await publish([vectors.counter.ownerCopy.event]);
    await expect(
      takeSharedInvoiceNumber(
        {
          own: keys.invoices,
          shared,
          writers: vectors.channel.value.invoicing.counterWriters,
          legacy: false
        },
        {
          relays: RELAYS,
          channel: "account",
          timeoutMs: 1000,
          authKey: keys.invoices.nostr.secretKey
        },
        vectors.counter.ownerCopy.value.year,
        vectors.counter.ownerCopy.event.created_at + 1
      )
    ).resolves.toEqual(vectors.counter.next);
  });

  it("hold an invoice of the assistant's, with its totals", () => {
    const read = invoicesOf(keys.invoices, [vectors.invoice.event]);
    expect(read.invoices).toEqual([vectors.invoice.value]);
    const invoice = vectors.invoice.value as Invoice;
    expect(invoiceTotals(invoice.lines)).toEqual(vectors.invoice.totals);
    expect(invoiceEvent(keys.invoices, invoice).tags).toEqual([["d", vectors.invoice.address]]);
    // The link's amount is the invoice's total, its note the invoice's number.
    expect(vectors.link.payload.fiat.minor).toBe(vectors.invoice.totals.totalMinor);
    expect(invoice.sent?.link.url).toBe(vectors.link.url);
  });

  it("hold the invoice's payment link, as its payer's page reads it", async () => {
    const fragment = vectors.link.url.slice(vectors.link.url.indexOf("#"));
    const ref = parsePaymentLinkFragment(fragment)!;
    expect(ref).toEqual({
      kind: "sale",
      author: vectors.link.author,
      key: hexToBytes(vectors.link.saleKey),
      relays: RELAYS
    });
    expect(deriveSaleKeys(ref.key).nostr.publicKey).toBe(vectors.link.saleAuthor);
    expect(takerTag(keys.takerKey, vectors.link.saleAuthor)).toBe(vectors.link.takerTag);
    expect(vectors.link.event.tags).toEqual([["d", vectors.link.address]]);
    await publish([vectors.link.event]);
    const found = await fetchPaymentLink(ref, "bc", { relays: RELAYS, timeoutMs: 1000 });
    expect(found).toEqual({
      status: "found",
      value: parsePaymentLinkPayload(vectors.link.payload, "bc")
    });
  });

  it("hold the link's record for the owner, whose sealed key opens with the reading key only", async () => {
    await publish([vectors.linkRecord.event]);
    await expect(fetchLinks(keys.member, 0, RELAYS)).resolves.toEqual([vectors.linkRecord.value]);
    expect(vectors.linkRecord.event.tags).toEqual([["d", vectors.linkRecord.address]]);
    expect(
      openLinkKey(
        vectors.linkRecord.value.sealedKey,
        deriveRegistryReader(team),
        vectors.link.author
      )
    ).toEqual(hexToBytes(vectors.link.linkSecretKey));
  });
});

describe('the vectors\' invoice in "Wallet"', () => {
  beforeEach(async () => {
    await openTestAccount({ usage: "merchant", signUp: "done" });
  });

  afterEach(() => closeAccount());

  it("is listed among the business's, made by the assistant", async () => {
    // The test account's team: the vectors' invoice signed again with its assistant's keys.
    const accountTeam = deriveTeamKeys(walletSecret(testSeed()));
    const assistant = { id: ASSISTANT, name: "Carol's Claude", createdAt: 1792000000 };
    await publishAssistant(accountTeam, assistant);
    const ownKeys = deriveAssistantKeys(assistantSecretKey(accountTeam, ASSISTANT)).invoices;
    const invoice = vectors.invoice.value as Invoice;
    await publishToRelays(invoiceEvent(ownKeys, invoice), {
      relays: DEFAULT_RELAYS,
      channel: "account",
      timeoutMs: 1000,
      authKey: ownKeys.nostr.secretKey
    });
    const read = await loadInvoices();
    expect(read.invoices).toEqual([invoice]);
    expect(read.authors.get(invoice.id)).toEqual({ id: ASSISTANT, name: "Carol's Claude" });
  });
});
