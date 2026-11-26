import { schnorr } from "@noble/curves/secp256k1.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

import { encodeWalletSecret } from "@/lib/breez/secret";
import {
  INTEGRATION_KEY_PREFIX,
  deriveIntegrationKeys,
  formatIntegrationKey,
  parseIntegrationKey
} from "@/lib/integrations/keys";
import { publishToRelays } from "@/lib/nostr/pool";
import { encodeRelayList } from "@/lib/relays/list";
import { channelEvent, fetchChannel, type TeamChannel } from "@/lib/team/channel";
import {
  deriveMemberKeys,
  deriveTeamKeys,
  integrationSecretKey,
  memberSecret,
  ownerDeviceSecret
} from "@/lib/team/keys";

import type * as RelaysFake from "../../jest/nostr-relays";

// The in-memory relays of jest.setup.ts.
const relays = jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");

// A BIP-39 test mnemonic (all-zero entropy), never a real wallet's.
const MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const team = deriveTeamKeys(encodeWalletSecret({ mnemonic: MNEMONIC }));
const INTEGRATION = "0123456789abcdef0123456789abcdef";
const key = integrationSecretKey(team, INTEGRATION);
const RELAYS = ["wss://relay.example", "wss://relay.bakery.example"];

const integrationHkdf = (info: string) =>
  hkdf(sha256, key, utf8ToBytes("sattle.me/integration"), utf8ToBytes(info), 32);

describe("integration keys", () => {
  it("never change: every integration's channel and marks derive from them (salts, info strings)", () => {
    // Its key, from the team's root, never a member's nor a device's of the same id.
    expect(key).toEqual(
      hkdf(
        sha256,
        team.root,
        utf8ToBytes("sattle.me/team"),
        utf8ToBytes(`integration/${INTEGRATION}/v1`),
        32
      )
    );
    expect(key).not.toEqual(memberSecret(team, INTEGRATION));
    expect(key).not.toEqual(ownerDeviceSecret(team, INTEGRATION));
    expect(deriveIntegrationKeys(key)).toEqual({
      channel: {
        address: bytesToHex(integrationHkdf("channel/address/v1")),
        encryptionKey: integrationHkdf("channel/encryption-key/v1")
      },
      takerKey: integrationHkdf("taker/v1"),
      lotAddress: bytesToHex(integrationHkdf("onchain-lot/address/v1")),
      seen: {
        nostr: {
          secretKey: integrationHkdf("onchain-seen/nostr-secret-key/v1"),
          publicKey: bytesToHex(
            schnorr.getPublicKey(integrationHkdf("onchain-seen/nostr-secret-key/v1"))
          )
        },
        addressKey: integrationHkdf("onchain-seen/address-key/v1")
      },
      paid: {
        nostr: {
          secretKey: integrationHkdf("lightning-paid/nostr-secret-key/v1"),
          publicKey: bytesToHex(
            schnorr.getPublicKey(integrationHkdf("lightning-paid/nostr-secret-key/v1"))
          )
        },
        addressKey: integrationHkdf("lightning-paid/address-key/v1")
      }
    });
  });

  it("gives no member's keys: its channel is not the member's of the same secret", () => {
    const keys = deriveIntegrationKeys(key);
    const member = deriveMemberKeys(key);
    expect(keys.channel.address).not.toBe(member.channel.address);
    expect(keys.channel.encryptionKey).not.toEqual(member.channel.encryptionKey);
    expect(Object.keys(keys).sort()).toEqual(["channel", "lotAddress", "paid", "seen", "takerKey"]);
    expect(() => deriveIntegrationKeys(new Uint8Array(16))).toThrow();
  });
});

describe("an integration's secret key", () => {
  const access = { teamPublicKey: team.publicKey, key, relays: RELAYS };
  const secretKey = formatIntegrationKey(access);

  it("holds the team's public key, the key and the relays, after its prefix: never a URL", () => {
    expect(INTEGRATION_KEY_PREFIX).toBe("sattleme_ck_");
    expect(secretKey.startsWith(INTEGRATION_KEY_PREFIX)).toBe(true);
    const parts = secretKey.slice(INTEGRATION_KEY_PREFIX.length).split(".");
    expect(parts).toHaveLength(3);
    expect(parts[2]).toBe(encodeRelayList(RELAYS));
    expect(parseIntegrationKey(secretKey)).toEqual(access);
    // Nothing a shell or a configuration file would need quoted.
    expect(secretKey).toMatch(/^[A-Za-z0-9_.-]+$/);
  });

  it("refuses anything else", () => {
    const [teamPart, keyPart, relaysPart] = secretKey
      .slice(INTEGRATION_KEY_PREFIX.length)
      .split(".");
    const body = `${teamPart}.${keyPart}.${relaysPart}`;
    for (const text of [
      "",
      body,
      // A link opened in the customers' browsers, not a key.
      `https://pay.example/pay#${body}`,
      // A later format's prefix.
      `sattleme_ck2_${body}`,
      // Supabase's tokens' prefix.
      `sbp_${body}`,
      `${INTEGRATION_KEY_PREFIX}${teamPart}.${keyPart}`,
      `${secretKey}.x`,
      `${INTEGRATION_KEY_PREFIX}${teamPart}.${keyPart.slice(1)}.${relaysPart}`,
      // Unused bits set: not the canonical spelling of a key.
      `${INTEGRATION_KEY_PREFIX}${teamPart.slice(0, -1)}B.${keyPart}.${relaysPart}`,
      `${secretKey}=`,
      `${INTEGRATION_KEY_PREFIX}${teamPart}.${keyPart}.`,
      ` ${secretKey}`
    ]) {
      expect(parseIntegrationKey(text)).toBeNull();
    }
    expect(() => formatIntegrationKey({ ...access, teamPublicKey: "ab" })).toThrow();
    expect(() => formatIntegrationKey({ ...access, key: new Uint8Array(16) })).toThrow();
  });
});

describe("an integration's channel", () => {
  beforeEach(() => relays.resetRelays());

  const keys = deriveIntegrationKeys(key);
  const active: TeamChannel = {
    version: 1,
    status: "active",
    name: "Shopify Store",
    role: "integration",
    profile: {
      businessName: "Fine Bakery",
      lightningAddress: "sattleme0123456789@breez.tips",
      currency: "CHF",
      onchain: true,
      logo: null
    },
    registryKey: "ab".repeat(32),
    registryReader: "cd".repeat(32),
    linkOwner: "ef".repeat(32),
    relays: RELAYS,
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

  it("is read with the integration's key alone, with the role of an integration", async () => {
    await publish(active);
    await expect(fetchChannel(team.publicKey, keys, 1000, RELAYS)).resolves.toEqual({
      status: "found",
      channel: active
    });
  });

  it("takes no other role", async () => {
    await publish({ ...active, role: "manager" });
    await expect(fetchChannel(team.publicKey, keys, 1000, RELAYS)).resolves.toEqual({
      status: "notFound"
    });
  });
});
