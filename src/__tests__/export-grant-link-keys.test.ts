import { schnorr } from "@noble/curves/secp256k1.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";

import { exportKeysOf } from "@/features/team/export-grants";
import { registryOfChannel } from "@/features/terminal/registry-key";
import type { NostrKeys } from "@/lib/nostr/keys";
import { nip44Decrypt } from "@/lib/nostr/nip44";
import { createPaymentLink } from "@/lib/payment-link/link";
import {
  openLinkKey,
  openRecordLinkKey,
  sealLinkKey,
  sealLinkKeyFor
} from "@/lib/payment-link/sealed-key";
import {
  archiveOf,
  archivedMonth,
  monthPartEvent,
  monthParts,
  SEALED_LINK_KEY_LENGTH
} from "@/lib/registry/archive";
import {
  deriveArchiveKeys,
  deriveBusinessRegistry,
  deriveLinkKeyReader,
  deriveMemberKeys,
  deriveRegistryReader,
  deriveTeamKeys,
  memberSecret
} from "@/lib/team/keys";
import { linkEvent, memberRecordsOf } from "@/lib/team/member-records";
import type { Roster } from "@/features/team/roster";

import { taprootAddress } from "../../jest/bitcoin";

/*
 * An assistant's export grant (exportKeysOf) never gives the secret of the registry's reading key,
 * which every payment link's key is sealed for (in the link's record and in the owner's copy of its
 * month): whoever held a grant could open a link's key and publish a newer version of the open link
 * paying elsewhere, which the payer's page would take. From the grant alone, neither a link's
 * record nor the owner's copy opens a link's key.
 */

const team = deriveTeamKeys(new Uint8Array(32).fill(5));
const NOW = 1_790_000_000;
const MEMBER = "0123456789abcdef0123456789abcdef";
const ROSTER = {
  employees: [],
  integrations: [],
  assistants: [],
  removed: []
} as unknown as Roster;

/** Every 32-byte hex value of the grant (its secrets and its public keys), as keys to try. */
function grantKeys(): NostrKeys[] {
  const grant = exportKeysOf(team, [], ROSTER);
  const found = new Set<string>();
  const walk = (value: unknown) => {
    if (typeof value === "string" && /^[0-9a-f]{64}$/.test(value)) found.add(value);
    else if (value !== null && typeof value === "object") Object.values(value).forEach(walk);
  };
  walk(grant);
  return [...found].flatMap((hex) => {
    try {
      const secretKey = hexToBytes(hex);
      return [{ secretKey, publicKey: bytesToHex(schnorr.getPublicKey(secretKey)) }];
    } catch {
      // Not a valid secret key (0 or ≥ n): nothing it opens.
      return [];
    }
  });
}

function makeLink() {
  const business = deriveBusinessRegistry(team);
  const payload = {
    version: 3,
    businessName: "Fine Bakery",
    lightningAddress: "merchant@breez.tips",
    fiat: { minor: 2450, digits: 2, currency: "CHF" },
    note: "Table 4",
    onchainAddress: taprootAddress(3),
    endsAt: NOW + 600,
    registryKey: bytesToHex(business.key),
    registryReader: business.reader,
    owner: business.owner
  } as never;
  return createPaymentLink(payload, "https://web.example", NOW, undefined, ["wss://r.example"]);
}

describe("an export grant never opens a payment link's key", () => {
  it("gives the registry's reading key, never the link key reader", () => {
    const grant = exportKeysOf(team, [], ROSTER);
    // Still given: the assistants' servers read the declarations with it (sattleme/mcp-server).
    expect(grant.account.registryReader).toBe(bytesToHex(deriveRegistryReader(team).secretKey));
    const reader = bytesToHex(deriveLinkKeyReader(team).secretKey);
    expect(JSON.stringify(grant)).not.toContain(reader);
    // Nor what an owner's archive keys hold besides the copies' reading keys.
    expect(Object.keys(grant.account.archive).sort()).toEqual([
      "addressKey",
      "author",
      "encryptionKey"
    ]);
  });

  it("never lets a grant's holder sign as the open link from a link's record", () => {
    const link = makeLink();
    // What the device publishes in its link record (member.ts, recordLink), its registry from an
    // owner's app that names the link key reader.
    const seal = sealLinkKeyFor(link.secretKey, deriveBusinessRegistry(team));
    expect(seal.sealedFor).toBe("link-key-reader");

    // Attacker: only what the export grant contains. Its records' keys read the link's record…
    const member = deriveMemberKeys(memberSecret(team, MEMBER));
    const record = linkEvent(member, {
      version: 1,
      link: link.id,
      saleKey: bytesToHex(link.key),
      createdAt: NOW,
      onchainTag: null,
      relays: ["wss://r.example"],
      ...seal
    });
    const [read] = memberRecordsOf(member, [record]).links;
    expect(read).toMatchObject({ link: link.id, sealedFor: "link-key-reader" });
    // …and none of its keys opens the link's: neither its registry reader nor any other.
    const grant = exportKeysOf(team, [], ROSTER);
    const readerSecret = hexToBytes(grant.account.registryReader);
    const reader = {
      secretKey: readerSecret,
      publicKey: bytesToHex(schnorr.getPublicKey(readerSecret))
    };
    expect(openLinkKey(read!.sealedKey, reader, link.id)).toBeNull();
    for (const key of grantKeys()) {
      expect(openLinkKey(read!.sealedKey, key, link.id)).toBeNull();
      expect(
        openRecordLinkKey(read!, { linkKeyReader: key, registryReader: key }, link.id)
      ).toBeNull();
    }

    // The owner opens it, with its link key reader.
    const readers = {
      linkKeyReader: deriveLinkKeyReader(team),
      registryReader: deriveRegistryReader(team)
    };
    expect(openRecordLinkKey(read!, readers, link.id)).toEqual(link.secretKey);
  });

  it("still opens a record of before (sealed for the registry's reading key)", () => {
    const link = makeLink();
    const { linkKeyReader: _, ...before } = deriveBusinessRegistry(team);
    const seal = sealLinkKeyFor(link.secretKey, before);
    expect(seal).toEqual({ sealedKey: expect.any(String) });
    const readers = {
      linkKeyReader: deriveLinkKeyReader(team),
      registryReader: deriveRegistryReader(team)
    };
    expect(openRecordLinkKey(seal, readers, link.id)).toEqual(link.secretKey);
    // Marked for the link key reader, it is never tried with the registry's reading key.
    expect(
      openRecordLinkKey({ ...seal, sealedFor: "link-key-reader" }, readers, link.id)
    ).toBeNull();
  });

  it("never gives a link's key to a grant's holder from the owner's copy of a month", () => {
    const link = makeLink();
    const owner = deriveArchiveKeys(team);
    const archived = {
      link: link.id,
      saleKey: bytesToHex(link.key),
      key: bytesToHex(link.secretKey),
      relays: ["wss://r.example"]
    };
    const [part] = monthParts("2026-10", [], [archived]);
    const event = monthPartEvent(owner, part!, NOW);

    // Attacker: the grant's keys of the copies open the part…
    const grant = exportKeysOf(team, [], ROSTER).account.archive;
    expect(grant.author).toBe(owner.nostr.publicKey);
    const text = nip44Decrypt(event.content, hexToBytes(grant.encryptionKey));
    const value = JSON.parse(text).v;
    expect(value.version).toBe(4);
    // …which holds the link's key sealed, never in clear.
    expect(text).not.toContain(bytesToHex(link.secretKey));
    expect(value.links[0].key).toBeUndefined();
    expect(value.links[0].sealedKey).toHaveLength(SEALED_LINK_KEY_LENGTH);
    for (const key of grantKeys()) {
      expect(openLinkKey(value.links[0].sealedKey, key, link.id)).toBeNull();
    }
    // Read with the grant's keys alone (no link key reader): the link, without its key.
    const asGrant = {
      nostr: { publicKey: grant.author, secretKey: new Uint8Array(32) },
      encryptionKey: hexToBytes(grant.encryptionKey),
      addressKey: hexToBytes(grant.addressKey)
    };
    const stolen = archiveOf(asGrant, new Map([["wss://a", [event]]]));
    const month = archivedMonth(asGrant, "2026-10", stolen.parts, stolen.newer);
    expect(month.copied).toBe(true);
    expect(month.links.get(link.id)).toEqual({ ...archived, key: null });

    // The owner reads its key back, and signs the link again with it.
    const read = archiveOf(owner, new Map([["wss://a", [event]]]));
    expect(archivedMonth(owner, "2026-10", read.parts, read.newer).links.get(link.id)).toEqual(
      archived
    );
  });

  it("is never copied in clear without the link key reader", () => {
    const link = makeLink();
    const { linkKeyReader: _, ...withoutReader } = deriveArchiveKeys(team);
    const [part] = monthParts(
      "2026-10",
      [],
      [
        {
          link: link.id,
          saleKey: bytesToHex(link.key),
          key: bytesToHex(link.secretKey),
          relays: []
        }
      ]
    );
    expect(() => monthPartEvent(withoutReader, part!, NOW)).toThrow(
      "A link's key is never copied in clear"
    );
    expect(sealLinkKey(link.secretKey, deriveLinkKeyReader(team).publicKey)).toHaveLength(
      SEALED_LINK_KEY_LENGTH
    );
  });

  it("tells an employee's device the link key reader in its channel", () => {
    const business = deriveBusinessRegistry(team);
    const channel = {
      version: 1,
      status: "active",
      registryKey: bytesToHex(business.key),
      registryReader: business.reader,
      linkOwner: business.owner,
      linkKeyReader: business.linkKeyReader
    } as never;
    expect(registryOfChannel(channel)).toEqual(business);
    // A channel of an owner's app of before: the registry without it, sealed as before.
    const { linkKeyReader: _, ...before } = business;
    expect(
      registryOfChannel({ ...(channel as object), linkKeyReader: undefined } as never)
    ).toEqual(before);
  });
});
