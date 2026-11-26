import { utf8ToBytes } from "@noble/hashes/utils.js";

import { base64ToBytes, bytesToBase64 } from "@/lib/base64";
import { isValidEvent, signEvent } from "@/lib/nostr/event";
import { deriveKey, nostrKeys, randomNostrKeys } from "@/lib/nostr/keys";
import { nip44Decrypt } from "@/lib/nostr/nip44";
import {
  NewerRecordError,
  RECORD_KIND,
  newestRecord,
  openRecord,
  sealRecord,
  signedAt,
  type OpenOptions
} from "@/lib/nostr/record";

const NOW = 1790000000;
const author = randomNostrKeys();
const key = globalThis.crypto.getRandomValues(new Uint8Array(32));
const ADDRESS = "a".repeat(64);

type Note = { version: 1; text: string };

function parseNote(value: unknown): Note | null {
  const note = value as Partial<Note> | null;
  if (typeof note?.version === "number" && note.version > 1) throw new NewerRecordError();
  return note?.version === 1 && typeof note.text === "string" ? (note as Note) : null;
}

const options: OpenOptions<Note> = {
  type: "note",
  encryptionKey: key,
  address: ADDRESS,
  author: author.publicKey,
  parse: parseNote
};

function noteEvent(
  text: string,
  createdAt = NOW,
  extra: Partial<Parameters<typeof sealRecord>[0]> = {}
) {
  return sealRecord({
    type: "note",
    value: { version: 1, text },
    signer: author.secretKey,
    encryptionKey: key,
    address: ADDRESS,
    createdAt,
    ...extra
  });
}

describe("sealRecord", () => {
  it("writes a signed kind 30078 event with an opaque d tag and NIP-44 content", () => {
    const event = noteEvent("Till B");
    expect(isValidEvent(event)).toBe(true);
    expect(event).toMatchObject({
      kind: RECORD_KIND,
      pubkey: author.publicKey,
      created_at: NOW,
      tags: [["d", ADDRESS]]
    });
    expect(event.content).toMatch(/^A[A-Za-z0-9+/]+={0,2}$/);
    // Inside: the type and the value, padded with spaces.
    const text = nip44Decrypt(event.content, key);
    expect(JSON.parse(text)).toEqual({ t: "note", v: { version: 1, text: "Till B" } });
    expect(utf8ToBytes(text).length % 256).toBe(0);
  });

  it("pads to the block, so that sizes only tell a rough length", () => {
    const short = noteEvent("a").content.length;
    expect(noteEvent("a".repeat(150)).content.length).toBe(short);
    expect(noteEvent("a".repeat(300)).content.length).toBeGreaterThan(short);
    expect(noteEvent("a", NOW, { block: 1024 }).content.length).toBe(
      noteEvent("a".repeat(900), NOW, { block: 1024 }).content.length
    );
  });

  it("adds the NIP-40 expiration of a record that ends", () => {
    expect(noteEvent("a", NOW, { expiresAt: NOW + 600 }).tags).toEqual([
      ["d", ADDRESS],
      ["expiration", String(NOW + 600)]
    ]);
  });
});

describe("isValidEvent", () => {
  const template = { created_at: NOW, kind: 1, tags: [["d", ADDRESS]], content: "" };

  it("refuses a lone surrogate in the content or a tag, signed as JavaScript serializes it", () => {
    // checkout-spec SPEC.md §11: its UTF-8, which the id hashes, does not exist.
    for (const lone of ["\ud800", "\udfff", "a\udc00b"]) {
      expect(isValidEvent(signEvent({ ...template, content: lone }, author.secretKey))).toBe(false);
      const tags = [...template.tags, ["x", lone]];
      expect(isValidEvent(signEvent({ ...template, tags }, author.secretKey))).toBe(false);
    }
  });

  it("takes a pair of surrogates (an emoji), in the content as in a tag", () => {
    const emoji = { ...template, tags: [...template.tags, ["x", "🍕"]], content: "🍕" };
    expect(isValidEvent(signEvent(emoji, author.secretKey))).toBe(true);
  });
});

describe("openRecord", () => {
  it("opens a record of its type, author, address and key", () => {
    const event = noteEvent("Till B");
    expect(openRecord(event, options)).toEqual({
      status: "ok",
      event,
      value: { version: 1, text: "Till B" }
    });
    expect(
      openRecord(event, { ...options, author: (publicKey) => publicKey === author.publicKey })
    ).toMatchObject({ status: "ok" });
    expect(openRecord(event, { ...options, address: ["b".repeat(64), ADDRESS] })).toMatchObject({
      status: "ok"
    });
  });

  it("ignores anything else", () => {
    const event = noteEvent("Till B");
    const other = randomNostrKeys();
    expect(openRecord(null, options)).toBeNull();
    expect(openRecord({ ...event, kind: 1 }, options)).toBeNull();
    expect(openRecord(event, { ...options, author: other.publicKey })).toBeNull();
    expect(openRecord(event, { ...options, address: "b".repeat(64) })).toBeNull();
    expect(openRecord(event, { ...options, type: "other" })).toBeNull();
    expect(openRecord(event, { ...options, encryptionKey: new Uint8Array(32) })).toBeNull();
    // Altered after signing.
    expect(openRecord({ ...event, created_at: NOW + 1 }, options)).toBeNull();
    // Re-signed by another author with the same content.
    const resigned = signEvent(
      { kind: event.kind, created_at: event.created_at, tags: event.tags, content: event.content },
      other.secretKey
    );
    expect(openRecord(resigned, { ...options, author: undefined })).toMatchObject({ status: "ok" });
    expect(openRecord(resigned, options)).toBeNull();
    // A value the parser refuses.
    const invalid = sealRecord({
      type: "note",
      value: { version: 1 },
      signer: author.secretKey,
      encryptionKey: key,
      address: ADDRESS,
      createdAt: NOW
    });
    expect(openRecord(invalid, options)).toBeNull();
  });

  it("tells a record of a newer format apart", () => {
    const newerValue = sealRecord({
      type: "note",
      value: { version: 2, text: "?" },
      signer: author.secretKey,
      encryptionKey: key,
      address: ADDRESS,
      createdAt: NOW
    });
    expect(openRecord(newerValue, options)).toMatchObject({ status: "newer" });
    // Another NIP-44 version byte.
    const bytes = base64ToBytes(noteEvent("a").content)!;
    bytes[0] = 3;
    const newerFormat = signEvent(
      { kind: RECORD_KIND, created_at: NOW, tags: [["d", ADDRESS]], content: bytesToBase64(bytes) },
      author.secretKey
    );
    expect(openRecord(newerFormat, options)).toMatchObject({ status: "newer" });
  });

  it("opens a record of one of several types once, telling its type", () => {
    const parse = jest.fn((value: unknown, _event: unknown, type: string) =>
      type === "memo" ? (value as Note) : parseNote(value)
    );
    const several = { ...options, type: ["note", "memo"] as const, parse };
    expect(openRecord(noteEvent("Till B"), several)).toMatchObject({
      status: "ok",
      value: { text: "Till B" }
    });
    expect(parse).toHaveBeenLastCalledWith(
      { version: 1, text: "Till B" },
      expect.objectContaining({ kind: RECORD_KIND }),
      "note"
    );
    const memo = noteEvent("Received", NOW, { type: "memo" });
    expect(openRecord(memo, several)).toMatchObject({ status: "ok", value: { text: "Received" } });
    expect(parse).toHaveBeenLastCalledWith(expect.anything(), expect.anything(), "memo");
    // Another type, and no type at all: none.
    expect(openRecord(noteEvent("Other", NOW, { type: "other" }), several)).toBeNull();
    expect(openRecord(memo, { ...options, type: [] })).toBeNull();
  });
});

describe("newestRecord", () => {
  it("takes the newest readable copy and tells what each relay holds", () => {
    const older = noteEvent("v1", NOW);
    const newer = noteEvent("v2", NOW + 10);
    const answers = new Map<string, unknown[]>([
      ["wss://a", [older]],
      ["wss://b", [older, newer, { junk: true }]],
      ["wss://c", []]
    ]);
    const result = newestRecord(answers, (value) => openRecord(value, options));
    expect(result.newest?.value.text).toBe("v2");
    expect(result.newestUnreadable).toBeNull();
    expect([...result.copies]).toEqual([
      ["wss://a", NOW],
      ["wss://b", NOW + 10],
      ["wss://c", null]
    ]);
  });

  it("reports the newest copy of a newer format apart", () => {
    const readable = noteEvent("v1", NOW);
    const newer = sealRecord({
      type: "note",
      value: { version: 2 },
      signer: author.secretKey,
      encryptionKey: key,
      address: ADDRESS,
      createdAt: NOW + 5
    });
    const result = newestRecord(new Map([["wss://a", [readable, newer]]]), (value) =>
      openRecord(value, options)
    );
    expect(result.newest?.value.text).toBe("v1");
    expect(result.newestUnreadable).toBe(NOW + 5);
    expect(result.copies.get("wss://a")).toBe(NOW);
  });
});

describe("signedAt", () => {
  it("dates each record of an address after the last one this device signed there, never before the date asked", () => {
    const signed = new Map<string, number>();
    expect(signedAt(signed, "a", NOW)).toBe(NOW);
    // Signed again within the same second: after it, so that no relay keeps the first by its id.
    expect(signedAt(signed, "a", NOW)).toBe(NOW + 1);
    expect(signedAt(signed, "a", NOW - 50)).toBe(NOW + 2);
    // A later date asked stands; another address has its own.
    expect(signedAt(signed, "a", NOW + 30)).toBe(NOW + 30);
    expect(signedAt(signed, "b", NOW)).toBe(NOW);
    expect([...signed]).toEqual([
      ["a", NOW + 30],
      ["b", NOW]
    ]);
  });
});

describe("keys", () => {
  it("derives keys with HKDF-SHA256 and gives the x-only public key", () => {
    const secret = utf8ToBytes("secret");
    const a = deriveKey(secret, "salt", "info/v1");
    expect(a).toHaveLength(32);
    expect(deriveKey(secret, "salt", "info/v1")).toEqual(a);
    expect(deriveKey(secret, "salt", "info/v2")).not.toEqual(a);
    expect(deriveKey(secret, "other salt", "info/v1")).not.toEqual(a);
    expect(deriveKey(secret, "salt", "info/v1", 16)).toHaveLength(16);
    expect(nostrKeys(a).publicKey).toMatch(/^[0-9a-f]{64}$/);
    expect(randomNostrKeys().publicKey).not.toBe(randomNostrKeys().publicKey);
  });
});
