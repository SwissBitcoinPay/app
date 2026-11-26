import { schnorr } from "@noble/curves/secp256k1.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

import {
  ASSISTANT_KEY_PREFIX,
  deriveAssistantKeys,
  formatAssistantKey,
  parseAssistantKey
} from "@/lib/assistant/keys";
import { encodeWalletSecret } from "@/lib/breez/secret";
import {
  deriveIntegrationKeys,
  formatIntegrationKey,
  parseIntegrationKey
} from "@/lib/integrations/keys";
import { encodeRelayList } from "@/lib/relays/list";
import {
  assistantSecretKey,
  deriveInvoiceKeys,
  deriveMemberKeys,
  deriveTeamKeys,
  integrationSecretKey,
  invoiceCounterKey,
  memberSecret,
  memberTakerKey,
  ownerDeviceSecret
} from "@/lib/team/keys";

// A BIP-39 test mnemonic (all-zero entropy), never a real wallet's.
const MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const team = deriveTeamKeys(encodeWalletSecret({ mnemonic: MNEMONIC }));
const ASSISTANT = "0123456789abcdef0123456789abcdef";
const key = assistantSecretKey(team, ASSISTANT);
const RELAYS = ["wss://relay.example", "wss://relay.bakery.example"];

const teamHkdf = (info: string) =>
  hkdf(sha256, team.root, utf8ToBytes("sattle.me/team"), utf8ToBytes(info), 32);
const assistantHkdf = (info: string) =>
  hkdf(sha256, key, utf8ToBytes("sattle.me/assistant"), utf8ToBytes(info), 32);

describe("assistant keys", () => {
  it("never change: every assistant's channel, invoices and marks derive from them", () => {
    // Its key, from the team's root, never a member's, a device's nor an integration's of the id.
    expect(key).toEqual(teamHkdf(`assistant/${ASSISTANT}/v1`));
    expect(key).not.toEqual(memberSecret(team, ASSISTANT));
    expect(key).not.toEqual(ownerDeviceSecret(team, ASSISTANT));
    expect(key).not.toEqual(integrationSecretKey(team, ASSISTANT));
    const author = assistantHkdf("invoices/author/v1");
    expect(deriveAssistantKeys(key)).toEqual({
      member: deriveMemberKeys(key),
      takerKey: memberTakerKey(key),
      invoices: {
        nostr: { secretKey: author, publicKey: bytesToHex(schnorr.getPublicKey(author)) },
        encryptionKey: assistantHkdf("invoices/encryption-key/v1"),
        addressKey: assistantHkdf("invoices/address-key/v1")
      },
      exportGrant: {
        encryptionKey: assistantHkdf("export/encryption-key/v1"),
        addressKey: assistantHkdf("export/address-key/v1")
      }
    });
    expect(() => deriveAssistantKeys(new Uint8Array(16))).toThrow();
    expect(() => assistantSecretKey(team, "not an id")).toThrow();
  });

  it("are none of the owner's invoices' keys nor an integration's channel", () => {
    const keys = deriveAssistantKeys(key);
    const owner = deriveInvoiceKeys(team);
    expect(keys.invoices.nostr.publicKey).not.toBe(owner.nostr.publicKey);
    expect(keys.invoices.encryptionKey).not.toEqual(owner.encryptionKey);
    expect(keys.invoices.addressKey).not.toEqual(owner.addressKey);
    expect(keys.member.channel.address).not.toBe(deriveIntegrationKeys(key).channel.address);
  });

  it("include the key of the shared counter only through the team: never from the assistant's", () => {
    expect(invoiceCounterKey(team)).toEqual(teamHkdf("invoices/counter-key/v1"));
    expect(invoiceCounterKey(team)).not.toEqual(deriveInvoiceKeys(team).encryptionKey);
  });
});

describe("an assistant's secret key", () => {
  const access = { teamPublicKey: team.publicKey, key, relays: RELAYS };
  const secretKey = formatAssistantKey(access);

  it("holds the team's public key, the key and the relays, after its own prefix", () => {
    expect(ASSISTANT_KEY_PREFIX).toBe("sattleme_ak_");
    expect(secretKey.startsWith(ASSISTANT_KEY_PREFIX)).toBe(true);
    const parts = secretKey.slice(ASSISTANT_KEY_PREFIX.length).split(".");
    expect(parts).toHaveLength(3);
    expect(parts[2]).toBe(encodeRelayList(RELAYS));
    expect(parseAssistantKey(secretKey)).toEqual(access);
    expect(secretKey).toMatch(/^[A-Za-z0-9_.-]+$/);
  });

  it("is never taken for an integration's key, nor the reverse", () => {
    const integrationKey = formatIntegrationKey(access);
    expect(parseIntegrationKey(secretKey)).toBeNull();
    expect(parseAssistantKey(integrationKey)).toBeNull();
    // The same parts after the other prefix: the same text otherwise.
    expect(secretKey.slice(ASSISTANT_KEY_PREFIX.length)).toBe(
      integrationKey.slice("sattleme_ck_".length)
    );
  });

  it("refuses anything else", () => {
    const body = secretKey.slice(ASSISTANT_KEY_PREFIX.length);
    const [teamPart, keyPart, relaysPart] = body.split(".");
    for (const text of [
      "",
      body,
      `sattleme_ak2_${body}`,
      `${ASSISTANT_KEY_PREFIX}${teamPart}.${keyPart}`,
      `${secretKey}.x`,
      `${ASSISTANT_KEY_PREFIX}${teamPart}.${keyPart.slice(1)}.${relaysPart}`,
      `${ASSISTANT_KEY_PREFIX}${teamPart.slice(0, -1)}B.${keyPart}.${relaysPart}`,
      `${secretKey}=`,
      ` ${secretKey}`
    ]) {
      expect(parseAssistantKey(text)).toBeNull();
    }
    expect(() => formatAssistantKey({ ...access, teamPublicKey: "ab" })).toThrow();
    expect(() => formatAssistantKey({ ...access, key: new Uint8Array(16) })).toThrow();
  });
});
