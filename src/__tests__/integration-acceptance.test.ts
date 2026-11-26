import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";

import { DEFAULT_RELAYS } from "@/config/relays";
import { encodeWalletSecret } from "@/lib/breez/secret";
import {
  INTEGRATION_SALT,
  deriveIntegrationKeys,
  parseIntegrationKey
} from "@/lib/integrations/keys";
import {
  ACCEPTANCE_REQUEST_MAX_MS,
  fetchOrderAcceptances,
  isAfterLease,
  openOrderAcceptance,
  orderAcceptanceAddress,
  orderAcceptanceEvent,
  parseOrderAcceptance,
  publishOrderAcceptance,
  type AcceptedInvoice
} from "@/lib/integrations/onchain-acceptance";
import type { NostrEvent } from "@/lib/nostr/event";
import { deriveKey } from "@/lib/nostr/keys";
import { sealRecord } from "@/lib/nostr/record";
import { deriveSaleKeys } from "@/lib/registry/registry";
import { deriveTeamKeys, integrationSecretKey } from "@/lib/team/keys";

import vector from "./fixtures/checkout-spec/merchant-acceptance.json";
import type * as RelaysFake from "../../jest/nostr-relays";

/*
 * The merchant's acceptance of an integration's order (src/lib/integrations/onchain-acceptance.ts,
 * checkout-spec SPEC.md §31, "The merchant's acceptance"): the records the app makes are the
 * specification's vectors/app/merchant-acceptance.json (src/__tests__/fixtures/checkout-spec/merchant-acceptance.json,
 * byte for byte), which every server reads as said here.
 */

const relays = jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");

// Node's types are not loaded (tsconfig `types` only lists jest): only what this test needs.
declare const __dirname: string;
const fs = jest.requireActual<{ readFileSync(path: string): Uint8Array }>("fs");
const { join } = jest.requireActual<{ join(...segments: string[]): string }>("path");

/** src/__tests__/fixtures/checkout-spec/merchant-acceptance.json is checkout-spec's vectors/app/merchant-acceptance.json. */
const VECTOR_SHA256 = "b616d3d3e0a46e59d8f851a5bfc535fe999642e25a0c5d5786f637706b804ecd";

// The BIP-39 test mnemonic (all-zero entropy) the vectors were made with, never a real wallet's.
const team = deriveTeamKeys(
  encodeWalletSecret({
    mnemonic:
      "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about"
  })
);
const INTEGRATION_ID = "0123456789abcdef0123456789abcdef";
const integrationKey = integrationSecretKey(team, INTEGRATION_ID);
const keys = deriveIntegrationKeys(integrationKey);

const invoiceOf = (index: number): AcceptedInvoice => {
  const invoice = vector.invoices[index]!;
  return {
    sale: invoice.sale,
    address: invoice.onchainAddress,
    expiresAt: invoice.expiresAt,
    sats: BigInt(invoice.sats)
  };
};

beforeEach(() => relays.resetRelays());

it("src/__tests__/fixtures/checkout-spec/merchant-acceptance.json is checkout-spec's vectors/app/merchant-acceptance.json", () => {
  const bytes = fs.readFileSync(
    join(__dirname, "fixtures", "checkout-spec", "merchant-acceptance.json")
  );
  expect(bytesToHex(sha256(bytes))).toBe(VECTOR_SHA256);
});

describe("the merchant's acceptances the app made (the specification's vector)", () => {
  it("are of the integration of the vectors, the team's", () => {
    const access = parseIntegrationKey(vector.secretKey)!;
    expect(bytesToHex(access.key)).toBe(bytesToHex(integrationKey));
    expect(access.teamPublicKey).toBe(team.publicKey);
    expect(vector.team).toBe(team.publicKey);
    expect(bytesToHex(keys.channel.encryptionKey)).toBe(vector.channelEncryptionKey);
  });

  it.each(vector.invoices.map((invoice, index) => [index, invoice] as const))(
    "derive the address of invoice %i from its order, its address and its end",
    (index, invoice) => {
      // The order's sale, as its server derives it from its reference (SPEC.md §10).
      const saleKey = deriveKey(integrationKey, INTEGRATION_SALT, `sale/${invoice.ref}/v1`);
      expect(bytesToHex(saleKey)).toBe(invoice.saleKey);
      expect(deriveSaleKeys(saleKey).nostr.publicKey).toBe(invoice.sale);
      expect(orderAcceptanceAddress(integrationKey, invoiceOf(index))).toBe(
        invoice.acceptanceAddress
      );
      // Its info, locked (SPEC.md §31): never changed once released.
      expect(invoice.acceptanceAddress).toBe(
        bytesToHex(
          deriveKey(
            integrationKey,
            INTEGRATION_SALT,
            `onchain-accepted/${invoice.sale}/${invoice.onchainAddress}/${invoice.expiresAt}/v1`
          )
        )
      );
    }
  );

  it.each(vector.records)("$name", ({ invoice, event, expected }) => {
    const opened = openOrderAcceptance(
      event,
      team.publicKey,
      keys,
      integrationKey,
      invoiceOf(invoice)
    );
    if (expected === null) expect(opened).toBeNull();
    else if (typeof expected === "string") {
      expect(expected).toBe("newer");
      expect(opened?.status).toBe("newer");
    } else {
      expect(opened).toEqual({
        status: "ok",
        event,
        value: { received: BigInt(expected.received), at: expected.createdAt }
      });
    }
  });
});

describe("the merchant's acceptances the specification made (its vector's `made`)", () => {
  const { made } = vector;
  // A team of the specification's own, with the same integration key: same channel key, same
  // addresses (merchant-acceptance.json's `made.source`).
  const access = parseIntegrationKey(made.secretKey)!;

  it("are of the same integration, another team's", () => {
    expect(bytesToHex(access.key)).toBe(bytesToHex(integrationKey));
    expect(access.teamPublicKey).toBe(made.team);
    expect(made.team).not.toBe(team.publicKey);
  });

  it.each(made.records)("$name", ({ invoice, event, expected }) => {
    const opened = openOrderAcceptance(event, made.team, keys, integrationKey, invoiceOf(invoice));
    // One of a newer format dated after the lease's end is set aside, as fetchOrderAcceptances
    // sets it aside (SPEC.md §31, "Reading it"): null in the vector.
    const read =
      opened?.status === "newer" && isAfterLease(opened.event.created_at, invoiceOf(invoice))
        ? null
        : opened;
    if (expected === null) expect(read).toBeNull();
    else if (typeof expected === "string") {
      expect(expected).toBe("newer");
      expect(read?.status).toBe("newer");
    } else {
      expect(read).toEqual({
        status: "ok",
        event,
        value: { received: BigInt(expected.received), at: expected.createdAt }
      });
    }
  });
});

describe("the merchant's acceptance of an order", () => {
  const invoice = invoiceOf(0);

  it("is made only of something received, below the invoice's amount", () => {
    for (const received of [0n, 49_000n, 50_000n, 2n ** 53n]) {
      expect(() =>
        orderAcceptanceEvent(team, keys, integrationKey, invoice, received, invoice.expiresAt)
      ).toThrow("Invalid acceptance");
    }
    const event = orderAcceptanceEvent(team, keys, integrationKey, invoice, 48_999n, 1_791_378_400);
    expect(event.pubkey).toBe(team.publicKey);
    expect(event.tags).toEqual([["d", vector.invoices[0]!.acceptanceAddress]]);
  });

  it("counts one made at the lease's end, none after", () => {
    const value = { version: 1, received: 30_000 };
    expect(parseOrderAcceptance(value, invoice.expiresAt + 120, invoice)).toEqual({
      received: 30_000n,
      at: invoice.expiresAt + 120
    });
    expect(parseOrderAcceptance(value, invoice.expiresAt + 121, invoice)).toBeNull();
  });

  it("is read on a majority of the relays, as the team, or not told", async () => {
    const call = {
      relays: DEFAULT_RELAYS,
      channel: "account" as const,
      timeoutMs: 1000,
      authKey: team.secretKey
    };
    const query = [{ integrationKey, keys, invoice }];
    const address = vector.invoices[0]!.acceptanceAddress;
    await expect(fetchOrderAcceptances(team, query, call)).resolves.toEqual(
      new Map([[address, { acceptance: null, copy: null, newer: false, settled: true }]])
    );
    const event = orderAcceptanceEvent(team, keys, integrationKey, invoice, 30_000n, 1_791_378_400);
    await publishOrderAcceptance(event, call);
    await expect(fetchOrderAcceptances(team, query, call)).resolves.toEqual(
      new Map([
        [
          address,
          {
            acceptance: { received: 30_000n, at: 1_791_378_400 },
            copy: {
              event,
              value: { received: 30_000n, at: 1_791_378_400 },
              holders: DEFAULT_RELAYS
            },
            newer: false,
            settled: true
          }
        ]
      ])
    );
    // Published as the team, on the account's channel.
    const published = relays.calls.filter(({ operation }) => operation === "publish");
    expect(new Set(published.map(({ channel }) => channel))).toEqual(new Set(["account"]));
    // Fewer than a majority answering: nothing told.
    for (const relay of DEFAULT_RELAYS.slice(0, 3)) relays.unreachable.add(relay);
    await expect(fetchOrderAcceptances(team, query, call)).resolves.toBeNull();
  });

  it("is sent by requests of 60 s at most, as a server's (SPEC.md §13)", async () => {
    const event = orderAcceptanceEvent(team, keys, integrationKey, invoice, 30_000n, 1_791_378_400);
    await publishOrderAcceptance(event, {
      relays: DEFAULT_RELAYS,
      channel: "account",
      timeoutMs: 120_000,
      authKey: team.secretKey
    });
    const published = relays.calls.filter(({ operation }) => operation === "publish");
    expect(published).toHaveLength(DEFAULT_RELAYS.length);
    expect(published.every(({ timeoutMs }) => timeoutMs === ACCEPTANCE_REQUEST_MAX_MS)).toBe(true);
    expect(ACCEPTANCE_REQUEST_MAX_MS).toBe(60_000);
  });

  it("tells a copy of a newer format, which nothing writes over", async () => {
    const newer = sealRecord({
      type: "integration-onchain-accepted",
      value: { version: 2, received: 30_000 },
      signer: team.secretKey,
      encryptionKey: keys.channel.encryptionKey,
      address: vector.invoices[0]!.acceptanceAddress,
      createdAt: 1_791_378_400
    });
    for (const relay of DEFAULT_RELAYS) relays.stored.set(relay, [newer as NostrEvent]);
    const found = await fetchOrderAcceptances(team, [{ integrationKey, keys, invoice }], {
      relays: DEFAULT_RELAYS,
      channel: "account",
      timeoutMs: 1000,
      authKey: team.secretKey
    });
    expect(found?.get(vector.invoices[0]!.acceptanceAddress)).toEqual({
      acceptance: null,
      copy: null,
      newer: true,
      settled: true
    });
  });

  describe("counted only when a majority of the relays sent it (SPEC.md §31, Counting it)", () => {
    const address = vector.invoices[0]!.acceptanceAddress;
    const call = {
      relays: DEFAULT_RELAYS,
      channel: "account" as const,
      timeoutMs: 1000,
      authKey: team.secretKey
    };
    const accepted = (createdAt: number) =>
      orderAcceptanceEvent(team, keys, integrationKey, invoice, 30_000n, createdAt);
    const newerFormat = (createdAt: number) =>
      sealRecord({
        type: "integration-onchain-accepted",
        value: { version: 2, received: 30_000 },
        signer: team.secretKey,
        encryptionKey: keys.channel.encryptionKey,
        address,
        createdAt
      }) as NostrEvent;
    /** Each relay's copies (none for a relay `events` leaves out). */
    const hold = (events: (relay: string) => NostrEvent[]) => {
      for (const relay of DEFAULT_RELAYS) relays.stored.set(relay, events(relay));
    };
    const read = async () =>
      (await fetchOrderAcceptances(team, [{ integrationKey, keys, invoice }], call))?.get(address);
    const two = DEFAULT_RELAYS.slice(0, 2);
    const three = DEFAULT_RELAYS.slice(0, 3);

    it("counts none that two relays of five sent, telling its copy (sent on while it runs)", async () => {
      const event = accepted(invoice.expiresAt - 600);
      hold((relay) => (two.includes(relay) ? [event] : []));
      await expect(read()).resolves.toEqual({
        acceptance: null,
        copy: { event, value: { received: 30_000n, at: event.created_at }, holders: two },
        newer: false,
        settled: true
      });
      // Three of five: a majority.
      hold((relay) => (three.includes(relay) ? [event] : []));
      await expect(read()).resolves.toMatchObject({
        acceptance: { received: 30_000n, at: event.created_at },
        settled: true
      });
    });

    it("counts the very event a majority sent, never another one's copies added up", async () => {
      const first = accepted(invoice.expiresAt - 600);
      const second = accepted(invoice.expiresAt - 599);
      // Two relays hold one, three the other, neither a majority but the second.
      hold((relay) => (two.includes(relay) ? [first] : [second]));
      await expect(read()).resolves.toMatchObject({
        acceptance: { at: second.created_at },
        copy: { event: second, holders: DEFAULT_RELAYS.slice(2) }
      });
      // The newest a majority sent decides, a newer copy fewer sent never.
      hold((relay) => (two.includes(relay) ? [second] : [first]));
      await expect(read()).resolves.toMatchObject({
        acceptance: { at: first.created_at },
        copy: { event: second, holders: two },
        settled: true
      });
    });

    it("tells nothing when the relays that did not answer could make a copy a majority's", async () => {
      const event = accepted(invoice.expiresAt - 600);
      hold((relay) => (two.includes(relay) ? [event] : []));
      // The fifth keeps silent: two of the four that answered, which it could make three.
      relays.silent.add(DEFAULT_RELAYS[4]!);
      await expect(read()).resolves.toMatchObject({ acceptance: null, settled: false });
      // One holder of four that answered: a minority, whatever the fifth holds.
      hold((relay) => (relay === DEFAULT_RELAYS[0] ? [event] : []));
      await expect(read()).resolves.toMatchObject({ acceptance: null, settled: true });
      // Three that answered: a majority, whatever the fifth holds.
      hold((relay) => (three.includes(relay) ? [event] : []));
      await expect(read()).resolves.toMatchObject({
        acceptance: { at: event.created_at },
        settled: true
      });
    });

    it("counts none when the newest a majority sent is of a newer format", async () => {
      const older = accepted(invoice.expiresAt - 600);
      const newer = newerFormat(invoice.expiresAt - 60);
      hold(() => [older, newer]);
      await expect(read()).resolves.toEqual({
        acceptance: null,
        copy: null,
        newer: true,
        settled: true
      });
    });

    it("counts the newest a majority sent, of this format, over an older one of a newer format", async () => {
      const older = newerFormat(invoice.expiresAt - 600);
      const newest = accepted(invoice.expiresAt - 60);
      hold(() => [older, newest]);
      const value = { received: 30_000n, at: invoice.expiresAt - 60 };
      await expect(read()).resolves.toEqual({
        acceptance: value,
        copy: { event: newest, value, holders: DEFAULT_RELAYS },
        newer: true,
        settled: true
      });
    });

    it("sets aside one of a newer format dated after the lease's end, and still tells it", async () => {
      const older = accepted(invoice.expiresAt - 600);
      const late = newerFormat(invoice.expiresAt + 121);
      hold(() => [older, late]);
      const value = { received: 30_000n, at: invoice.expiresAt - 600 };
      await expect(read()).resolves.toEqual({
        acceptance: value,
        copy: { event: older, value, holders: DEFAULT_RELAYS },
        newer: true,
        settled: true
      });
    });

    it("never spreads a copy older than one of a newer format, which a minority sent", async () => {
      const older = accepted(invoice.expiresAt - 600);
      const newer = newerFormat(invoice.expiresAt - 60);
      hold((relay) => (two.includes(relay) ? [older, newer] : [older]));
      // The older counts (a majority sent it, the newer format a minority only), but is not the
      // newest copy: nothing is sent to the others.
      await expect(read()).resolves.toEqual({
        acceptance: { received: 30_000n, at: invoice.expiresAt - 600 },
        copy: null,
        newer: true,
        settled: true
      });
    });
  });

  it("keeps the vector's keys apart from another integration's", () => {
    const other = integrationSecretKey(team, "fedcba9876543210fedcba9876543210");
    expect(orderAcceptanceAddress(other, invoice)).not.toBe(vector.invoices[0]!.acceptanceAddress);
    expect(hexToBytes(vector.invoices[0]!.saleKey)).toHaveLength(32);
  });
});
