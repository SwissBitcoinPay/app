import { bytesToHex } from "@noble/hashes/utils.js";

import { deriveAssistantKeys } from "@/lib/assistant/keys";
import { encodeWalletSecret } from "@/lib/breez/secret";
import { publishToRelays } from "@/lib/nostr/pool";
import { channelEvent, fetchChannel, type TeamChannel } from "@/lib/team/channel";
import {
  MAX_COUNTER_WRITERS,
  parseChannelInvoicing,
  type ChannelInvoicing
} from "@/lib/team/channel-invoicing";
import {
  assistantSecretKey,
  deriveInvoiceKeys,
  deriveTeamKeys,
  invoiceCounterKey
} from "@/lib/team/keys";

import type * as RelaysFake from "../../jest/nostr-relays";

// The in-memory relays of jest.setup.ts.
const relays = jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");

// A BIP-39 test mnemonic (all-zero entropy), never a real wallet's.
const MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const team = deriveTeamKeys(encodeWalletSecret({ mnemonic: MNEMONIC }));
const ASSISTANT = "0123456789abcdef0123456789abcdef";
const keys = deriveAssistantKeys(assistantSecretKey(team, ASSISTANT)).member;
const RELAYS = ["wss://relay.example", "wss://relay.bakery.example"];

const invoicing: ChannelInvoicing = {
  businessAddress: { street: "4 Lake Street", postalCode: "1003", city: "Lausanne", country: "CH" },
  companyNumber: "CHE-123.456.789",
  vatNumber: "CHE-123.456.789 TVA",
  detectedCountry: "CH",
  vatRate: 810,
  linkOrigin: "https://pay.example",
  counterKey: bytesToHex(invoiceCounterKey(team)),
  counterWriters: [deriveInvoiceKeys(team).nostr.publicKey]
};

const active: TeamChannel = {
  version: 1,
  status: "active",
  name: "Carol's Claude",
  role: "assistant",
  profile: {
    businessName: "Carol Consulting",
    lightningAddress: "sattleme0123456789@breez.tips",
    currency: "CHF",
    onchain: true,
    logo: null
  },
  registryKey: "ab".repeat(32),
  registryReader: "cd".repeat(32),
  linkOwner: "ef".repeat(32),
  relays: RELAYS,
  invoicing,
  updatedAt: 1790000000
};

async function publish(channel: TeamChannel | Record<string, unknown>) {
  await publishToRelays(channelEvent(team, keys, channel as TeamChannel), {
    relays: RELAYS,
    channel: "account",
    timeoutMs: 1000,
    authKey: team.secretKey
  });
}

beforeEach(() => relays.resetRelays());

describe("an assistant's channel", () => {
  it("is read with the assistant's key alone, with what its invoices need", async () => {
    await publish(active);
    await expect(fetchChannel(team.publicKey, keys, 1000, RELAYS)).resolves.toEqual({
      status: "found",
      channel: active
    });
  });

  it("is not one without its invoicing whole", async () => {
    await publish({ ...active, invoicing: undefined });
    await expect(fetchChannel(team.publicKey, keys, 1000, RELAYS)).resolves.toEqual({
      status: "notFound"
    });
    await publish({
      ...active,
      invoicing: { ...invoicing, counterKey: "00" },
      updatedAt: 1790000001
    });
    await expect(fetchChannel(team.publicKey, keys, 1000, RELAYS)).resolves.toEqual({
      status: "notFound"
    });
  });

  it("leaves another role's invoicing aside", async () => {
    await publish({ ...active, role: "employee" });
    const { invoicing: _, ...employee } = active;
    await expect(fetchChannel(team.publicKey, keys, 1000, RELAYS)).resolves.toEqual({
      status: "found",
      channel: { ...employee, role: "employee" }
    });
  });

  it("says when it was removed, nothing else", async () => {
    await publish({ version: 1, status: "removed", updatedAt: 1790000060 });
    await expect(fetchChannel(team.publicKey, keys, 1000, RELAYS)).resolves.toEqual({
      status: "found",
      channel: { version: 1, status: "removed", updatedAt: 1790000060 }
    });
  });
});

describe("an assistant's channel without invoices (format 2)", () => {
  // An assistant created without the right to make invoices.
  const { invoicing: _, ...withoutInvoicing } = active;
  const noInvoicing: TeamChannel = { ...withoutInvoicing, version: 2 };

  it("is read without anything that numbers invoices", async () => {
    await publish(noInvoicing);
    await expect(fetchChannel(team.publicKey, keys, 1000, RELAYS)).resolves.toEqual({
      status: "found",
      channel: noInvoicing
    });
  });

  it("never gives an invoicing that would be there", async () => {
    await publish({ ...noInvoicing, invoicing });
    await expect(fetchChannel(team.publicKey, keys, 1000, RELAYS)).resolves.toEqual({
      status: "found",
      channel: noInvoicing
    });
  });

  it("is an assistant's only, and never a removal", async () => {
    await publish({ ...noInvoicing, role: "employee" });
    await expect(fetchChannel(team.publicKey, keys, 1000, RELAYS)).resolves.toEqual({
      status: "notFound"
    });
    await publish({ version: 2, status: "removed", updatedAt: 1790000060 });
    await expect(fetchChannel(team.publicKey, keys, 1000, RELAYS)).resolves.toEqual({
      status: "notFound"
    });
  });

  it("is of a newer format past format 2", async () => {
    await publish({ ...noInvoicing, version: 3 });
    await expect(fetchChannel(team.publicKey, keys, 1000, RELAYS)).resolves.toEqual({
      status: "newer"
    });
  });
});

describe("an assistant channel's invoicing", () => {
  it("reads what the owner's settings allow", () => {
    const other = "12".repeat(32);
    expect(parseChannelInvoicing({ ...invoicing, counterWriters: [other] })).toEqual({
      ...invoicing,
      counterWriters: [other]
    });
    expect(
      parseChannelInvoicing({
        ...invoicing,
        businessAddress: null,
        detectedCountry: null,
        linkOrigin: null,
        counterWriters: []
      })
    ).toMatchObject({ businessAddress: null, detectedCountry: null, linkOrigin: null });
  });

  it("refuses anything else", () => {
    const writer = invoicing.counterWriters[0];
    const invalid: unknown[] = [
      null,
      "invoicing",
      { ...invoicing, businessAddress: { street: "Street", postalCode: "1003", city: "Lausanne" } },
      { ...invoicing, companyNumber: " CHE" },
      { ...invoicing, vatNumber: "x".repeat(41) },
      { ...invoicing, detectedCountry: "ch" },
      { ...invoicing, vatRate: -1 },
      { ...invoicing, vatRate: 10_001 },
      { ...invoicing, vatRate: 8.1 },
      { ...invoicing, linkOrigin: "http://pay.example" },
      { ...invoicing, linkOrigin: "https://pay.example/pay" },
      { ...invoicing, counterKey: "AB".repeat(32) },
      { ...invoicing, counterWriters: undefined },
      { ...invoicing, counterWriters: [writer, writer] },
      { ...invoicing, counterWriters: ["ab"] },
      { ...invoicing, counterWriters: [{ author: writer }] },
      { ...invoicing, counterWriters: [writer.toUpperCase()] },
      {
        ...invoicing,
        counterWriters: Array.from({ length: MAX_COUNTER_WRITERS + 1 }, (_, i) =>
          i.toString(16).padStart(64, "0")
        )
      }
    ];
    for (const value of invalid) expect(parseChannelInvoicing(value)).toBeNull();
  });
});
