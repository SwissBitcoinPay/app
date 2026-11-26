import { hkdf } from "@noble/hashes/hkdf.js";
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

import { DEFAULT_RELAYS } from "@/config/relays";
import { encodeWalletSecret } from "@/lib/breez/secret";
import { deriveIntegrationKeys } from "@/lib/integrations/keys";
import {
  fetchLateAcceptances,
  lateAcceptanceAddress,
  lateAcceptanceEvent,
  openLateAcceptance,
  parseLateAcceptance,
  publishLateAcceptance
} from "@/lib/integrations/late-acceptance";
import {
  openOrderAcceptance,
  orderAcceptanceAddress,
  type AcceptedInvoice
} from "@/lib/integrations/onchain-acceptance";
import type { NostrEvent } from "@/lib/nostr/event";
import { sealRecord } from "@/lib/nostr/record";
import { deriveLateAcceptanceKeys, deriveTeamKeys, integrationSecretKey } from "@/lib/team/keys";

import type * as RelaysFake from "../../jest/nostr-relays";

/*
 * The owner's acceptance of an integration's order made after its invoice's end
 * (src/lib/integrations/late-acceptance.ts): its keys and address
 * (never changed once released), its format, and that no integration's server reads it.
 */

const relays = jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");

// The BIP-39 test mnemonic (all-zero entropy), never a real wallet's.
const team = deriveTeamKeys(
  encodeWalletSecret({
    mnemonic:
      "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about"
  })
);
const keys = deriveLateAcceptanceKeys(team);
const INTEGRATION = "0123456789abcdef0123456789abcdef";
// Invoice 0 of src/__tests__/fixtures/checkout-spec/merchant-acceptance.json.
const invoice: AcceptedInvoice = {
  sale: "8798af5dd216c084257bf47843c2ffadaf6e70b9e16d824e98c667db6b6aacdf",
  address: "bc1px22v5j99gdwhxqyelg2p6tdcfajjd3njhzn22c2gura2dvxg2xlqw2wte4",
  expiresAt: 1_791_379_180,
  sats: 49_000n
};
const LATE = invoice.expiresAt + 86_400;
const call = {
  relays: DEFAULT_RELAYS,
  channel: "account" as const,
  timeoutMs: 1000,
  authKey: team.secretKey
};

beforeEach(() => relays.resetRelays());

describe("the late acceptance's keys and address", () => {
  it("derive from the team's root under their own info strings: never change them", () => {
    const derive = (info: string) =>
      hkdf(sha256, team.root, utf8ToBytes("sattle.me/team"), utf8ToBytes(info), 32);
    expect(keys.encryptionKey).toEqual(derive("integration-late-acceptance/encryption-key/v1"));
    expect(keys.addressKey).toEqual(derive("integration-late-acceptance/address-key/v1"));
    // Test vectors, made once: the keys and an invoice's address.
    expect(bytesToHex(keys.encryptionKey)).toBe(
      "5cd928250caf7c38e850b333d278b007a978ee85b4dd1ce01eb05f0e15035e54"
    );
    expect(bytesToHex(keys.addressKey)).toBe(
      "c6d911c40fa264ab686af2c1f10ec3f43164a0b9ec5a72695e4b5cf9d5a287fb"
    );
    const address = lateAcceptanceAddress(keys, INTEGRATION, invoice);
    expect(address).toBe("1a9a50531295213dcccdb7464f5714dc4113a27f21ac7c962c70c458d914b0b7");
    expect(address).toBe(
      bytesToHex(
        hmac(
          sha256,
          keys.addressKey,
          utf8ToBytes(
            `integration-late-acceptance/${INTEGRATION}/${invoice.sale}/${invoice.address}/${invoice.expiresAt}`
          )
        )
      )
    );
  });

  it("is one per invoice of an integration, never the address its server reads", () => {
    const address = lateAcceptanceAddress(keys, INTEGRATION, invoice);
    expect(lateAcceptanceAddress(keys, INTEGRATION, { ...invoice, expiresAt: LATE })).not.toBe(
      address
    );
    expect(lateAcceptanceAddress(keys, "fedcba9876543210fedcba9876543210", invoice)).not.toBe(
      address
    );
    expect(address).not.toBe(
      orderAcceptanceAddress(integrationSecretKey(team, INTEGRATION), invoice)
    );
    expect(() => lateAcceptanceAddress(keys, "not an id", invoice)).toThrow();
  });
});

describe("the late acceptance's record", () => {
  it("is made only of something received, below the invoice's amount, signed by the team", () => {
    for (const received of [0n, 49_000n, 50_000n, 2n ** 53n]) {
      expect(() => lateAcceptanceEvent(team, keys, INTEGRATION, invoice, received, LATE)).toThrow(
        "Invalid acceptance"
      );
    }
    const event = lateAcceptanceEvent(team, keys, INTEGRATION, invoice, 48_999n, LATE);
    expect(event.pubkey).toBe(team.publicKey);
    expect(event.created_at).toBe(LATE);
    expect(event.tags).toEqual([["d", lateAcceptanceAddress(keys, INTEGRATION, invoice)]]);
    expect(openLateAcceptance(event, team.publicKey, keys, INTEGRATION, invoice)).toEqual({
      status: "ok",
      event,
      value: { received: 48_999n, at: LATE }
    });
    // Another invoice's, or another author's: not this one's.
    const other = { ...invoice, expiresAt: invoice.expiresAt + 3600 };
    expect(openLateAcceptance(event, team.publicKey, keys, INTEGRATION, other)).toBeNull();
    expect(openLateAcceptance(event, "ab".repeat(32), keys, INTEGRATION, invoice)).toBeNull();
  });

  it("is never read by the integration's server, with its secret key", () => {
    const event = lateAcceptanceEvent(team, keys, INTEGRATION, invoice, 30_000n, LATE);
    const integrationKey = integrationSecretKey(team, INTEGRATION);
    expect(
      openOrderAcceptance(
        event,
        team.publicKey,
        deriveIntegrationKeys(integrationKey),
        integrationKey,
        invoice
      )
    ).toBeNull();
  });

  it("counts whole sats from 1 below the invoice's, whenever it was made", () => {
    const parse = (value: unknown) => parseLateAcceptance(value, LATE, invoice);
    expect(parse({ version: 1, received: "30000" })).toEqual({ received: 30_000n, at: LATE });
    expect(parse({ version: 1, received: "1", more: true })).toEqual({ received: 1n, at: LATE });
    for (const received of ["0", "49000", "01", "1.5", 30_000, null, "-1"]) {
      expect(parse({ version: 1, received })).toBeNull();
    }
    expect(parse({ received: "30000" })).toBeNull();
    expect(parse([1])).toBeNull();
    expect(parse(null)).toBeNull();
    expect(() => parse({ version: 2, received: "30000" })).toThrow();
  });
});

describe("reading the late acceptances", () => {
  const query = [{ integration: INTEGRATION, invoice }];
  const address = lateAcceptanceAddress(keys, INTEGRATION, invoice);

  it("is read on a majority of the relays, as the team, or not told", async () => {
    await expect(fetchLateAcceptances(team, keys, query, call)).resolves.toEqual(
      new Map([[address, { acceptance: null, copy: null, newer: false }]])
    );
    const event = lateAcceptanceEvent(team, keys, INTEGRATION, invoice, 30_000n, LATE);
    await publishLateAcceptance(event, call);
    await expect(fetchLateAcceptances(team, keys, query, call)).resolves.toEqual(
      new Map([
        [
          address,
          {
            acceptance: { received: 30_000n, at: LATE },
            copy: { event, holders: DEFAULT_RELAYS },
            newer: false
          }
        ]
      ])
    );
    const published = relays.calls.filter(({ operation }) => operation === "publish");
    expect(new Set(published.map(({ channel }) => channel))).toEqual(new Set(["account"]));
    for (const relay of DEFAULT_RELAYS.slice(0, 3)) relays.unreachable.add(relay);
    await expect(fetchLateAcceptances(team, keys, query, call)).resolves.toBeNull();
  });

  it("tells a copy of a newer format, which nothing writes over", async () => {
    const newer = sealRecord({
      type: "integration-onchain-accepted-late",
      value: { version: 2, received: "30000" },
      signer: team.secretKey,
      encryptionKey: keys.encryptionKey,
      address,
      createdAt: LATE
    });
    for (const relay of DEFAULT_RELAYS) relays.stored.set(relay, [newer as NostrEvent]);
    const found = await fetchLateAcceptances(team, keys, query, call);
    expect(found?.get(address)).toEqual({ acceptance: null, copy: null, newer: true });
  });
});
