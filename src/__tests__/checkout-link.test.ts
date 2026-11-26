import { schnorr } from "@noble/curves/secp256k1.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";

import { bytesToBase64Url } from "@/lib/base64";
import type { NostrEvent } from "@/lib/nostr/event";
import { publishToRelays } from "@/lib/nostr/pool";
import { sealRecord } from "@/lib/nostr/record";
import {
  checkoutKeys,
  checkoutRestKeys,
  fetchCheckoutLink,
  httpsUrlOrigin,
  isCheckoutOrigin,
  parseCheckoutFragment,
  parseCheckoutValue,
  newerAcceptance,
  readCheckoutAcceptance,
  readCheckoutCopy,
  readCheckoutRest,
  redirectShown,
  watchCheckoutRests,
  type CheckoutRef
} from "@/lib/payment-link/checkout";
import type { Invoice } from "@/lib/lightning/lnurl";
import { encodeRelayList } from "@/lib/relays/list";
import { fetchChannel } from "@/lib/team/channel";

import type * as RelaysFake from "../../jest/nostr-relays";

import appLink from "./fixtures/checkout-spec/app-checkout-link.json";
import appRest from "./fixtures/checkout-spec/app-checkout-rest.json";
import checkoutLinks from "./fixtures/checkout-spec/checkout-links.json";
import httpsUrls from "./fixtures/checkout-spec/https-urls.json";
import onchainRests from "./fixtures/checkout-spec/onchain-rests.json";
import redirectUrls from "./fixtures/checkout-spec/redirect-urls.json";

/*
 * Checkout links as the payer's page reads them (src/lib/payment-link/checkout.ts), against the
 * vectors of the specification (sattleme/checkout-spec 0.1.0, SPEC.md §30, the rest of an
 * underpayment and the acceptance records, §31), copied byte for byte in fixtures/checkout-spec/:
 * the ones written by hand, and the links an implementation of the specification made end to end
 * (its vectors/app/checkout-link.json and vectors/app/checkout-rest.json). Every value comes from
 * those files: a change on either side breaks one of the two suites.
 */

/** Each copy, its file in checkout-spec and that file's SHA-256 in checkout-spec's manifest.json. */
const SPEC_FILES = [
  [
    "https-urls.json",
    "vectors/https-urls.json",
    "1dd2ec6775ec0436bf226b7897a367308221849cdec3874d0ebf62001c69c3b2"
  ],
  [
    "redirect-urls.json",
    "vectors/redirect-urls.json",
    "85772def9b498fbea6a8d737e6e376ac731fbd842206aebf3f54ee8ac025a38e"
  ],
  [
    "checkout-links.json",
    "vectors/checkout-links.json",
    "bd3d90e4ca19502e4c3fd70ce1b31379d663228e8a21f0703c796790e9d61213"
  ],
  [
    "app-checkout-link.json",
    "vectors/app/checkout-link.json",
    "2e3b81356c54e9daff9e008666da76d0e8bef98f03ef50ace45f3eecd7466257"
  ],
  [
    "onchain-rests.json",
    "vectors/onchain-rests.json",
    "a2317d46044de8e943aef4924142bb58e0a34747836e66f4ac4f054ad3807ef6"
  ],
  [
    "app-checkout-rest.json",
    "vectors/app/checkout-rest.json",
    "9aaec5162c4d47cf10af82b4fa8bfe3cb4e1369a0d68735dba44eb3066c29b4a"
  ]
] as const;

// Node's types are not loaded (tsconfig `types` only lists jest): only what this test needs.
declare const __dirname: string;
const fs = jest.requireActual<{ readFileSync(path: string): Uint8Array }>("fs");
const { join } = jest.requireActual<{ join(...segments: string[]): string }>("path");

type HttpsUrls = {
  urls: { url: string; expected: { host: string; port: number } | null }[];
  sameHost: { a: string; b: string; expected: boolean }[];
};
type Redirects = { cases: { url: string; expected: { shown: string } | { error: string } }[] };
type Links = {
  origins: { checkout: unknown; expected: string | null }[];
  derivations: { linkKey: string; address: string; encryptionKey: string }[];
  urls: { origin: string; author: string; linkKey: string; relays: string[]; url: string }[];
  fragments: { name: string; fragment: string; expected: unknown }[];
  records: { name: string; value: unknown; expected: unknown }[];
};
type AppLink = {
  order: { note: string; redirectUrl: string };
  relays: string[];
  businessName: string;
  invoice: string;
  verifyUrl: string;
  paymentHash: string;
  sats: string;
  expiresAt: number;
  linkKey: string;
  author: string;
  address: string;
  encryptionKey: string;
  value: Record<string, unknown>;
  event: NostrEvent;
  url: string;
};

const relays = jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");

beforeEach(() => {
  relays.resetRelays();
});

it.each(SPEC_FILES)("%s is checkout-spec's %s", (name, _file, hash) => {
  const bytes = fs.readFileSync(join(__dirname, "fixtures", "checkout-spec", name));
  expect(bytesToHex(sha256(bytes))).toBe(hash);
});

/*
 * https-urls.json's `lightningAddresses` are left out: the Lightning address a channel names is the
 * wallet's, which Breez gives (src/lib/breez/lightning-address.ts), never one the merchant types.
 */
describe("https URLs (https-urls.json): a checkout record's and a rest record's verify URL", () => {
  it.each(
    // A name of 80 characters at most: two cases are 2048 and 2049 long.
    (httpsUrls as HttpsUrls).urls.map((c) => ({ ...c, name: JSON.stringify(c.url).slice(0, 80) }))
  )("$name", ({ url, expected }) => {
    expect(httpsUrlOrigin(url)).toEqual(expected);
  });

  it.each((httpsUrls as HttpsUrls).sameHost)("$a and $b", ({ a, b, expected }) => {
    const [first, second] = [httpsUrlOrigin(a), httpsUrlOrigin(b)];
    expect(first).not.toBeNull();
    expect(first?.host === second?.host && first?.port === second?.port).toBe(expected);
  });

  it("refuses what is not a string", () => {
    for (const value of [null, undefined, 42, {}, ["https://breez.tips"]]) {
      expect(httpsUrlOrigin(value)).toBeNull();
    }
  });
});

describe("redirect URLs (redirect-urls.json)", () => {
  it.each(
    // A name of 80 characters at most: two cases are 2048 and 2049 long.
    (redirectUrls as Redirects).cases.map((c) => ({ ...c, name: c.url.slice(0, 80) }))
  )("$name", ({ url, expected }) => {
    const shown = redirectShown(url);
    expect(shown === null ? { error: "invalid_order", param: "redirectUrl" } : { shown }).toEqual(
      expected
    );
  });

  it("refuses what is not a string", () => {
    for (const value of [null, undefined, 42, {}, ["https://shop.example"]]) {
      expect(redirectShown(value)).toBeNull();
    }
  });
});

describe("checkout links (checkout-links.json)", () => {
  const links = checkoutLinks as Links;

  it.each(links.origins)("names the web app of $checkout", ({ checkout, expected }) => {
    const origin =
      checkout !== null && typeof checkout === "object" && !Array.isArray(checkout)
        ? (checkout as { origin?: unknown }).origin
        : undefined;
    expect(isCheckoutOrigin(origin) ? origin : null).toBe(expected);
  });

  it.each(links.derivations)("derives the keys of $linkKey", (c) => {
    const keys = checkoutKeys(hexToBytes(c.linkKey));
    expect({ address: keys.address, encryptionKey: bytesToHex(keys.encryptionKey) }).toEqual({
      address: c.address,
      encryptionKey: c.encryptionKey
    });
  });

  it.each(links.urls)("reads $url", ({ author, linkKey, relays: list, url }) => {
    expect(parseCheckoutFragment(url.slice(url.indexOf("#")))).toEqual({
      status: "link",
      ref: { author, key: hexToBytes(linkKey), relays: list }
    });
    // Written as the integrations' servers write it: what the page reads back.
    const fragment = `c.${bytesToBase64Url(hexToBytes(author))}.${bytesToBase64Url(
      hexToBytes(linkKey)
    )}.${encodeRelayList(list)}`;
    expect(url.endsWith(`/pay#${fragment}`)).toBe(true);
  });

  it.each(links.fragments)("fragment: $name", ({ fragment, expected }) => {
    const read = parseCheckoutFragment(fragment);
    expect(
      read.status === "link"
        ? {
            author: read.ref.author,
            linkKey: bytesToHex(read.ref.key),
            relays: read.ref.relays
          }
        : read.status
    ).toEqual(expected);
  });

  it.each(links.records)("record: $name", ({ value, expected }) => {
    let read: unknown;
    try {
      const record = parseCheckoutValue(value, "bc");
      read = record
        ? {
            sats: record.sats.toString(),
            paymentHash: record.invoice?.decoded.paymentHash ?? null,
            onchainAddress: record.onchainAddress,
            expiresAt: record.expiresAt,
            redirect: record.redirectShown,
            rest: record.rest && { author: record.rest.author, key: bytesToHex(record.rest.key) }
          }
        : "invalid";
    } catch (error) {
      if ((error as Error).name !== "NewerRecordError") throw error;
      read = "newer";
    }
    expect(read).toEqual(expected);
  });

  it("refuses the invoices of another network", () => {
    const valid = links.records.find(({ name }) => name === "a link of the real invoice")!;
    expect(parseCheckoutValue(valid.value, "bc")).not.toBeNull();
    expect(parseCheckoutValue(valid.value, "bcrt")).toBeNull();
  });

  // SPEC.md "Text": a text UTF-8 cannot carry is refused (no vector: the app's own test).
  it("refuses a note or a business name with a lone surrogate, never a whole pair", () => {
    const valid = links.records.find(({ name }) => name === "a link of the real invoice")!;
    const value = valid.value as Record<string, unknown>;
    expect(parseCheckoutValue({ ...value, note: "Order 🍞" }, "bc")?.note).toBe("Order 🍞");
    for (const text of ["Order \uD83C", "\uDF5E Order", "Or\uDF5E\uD83Cder"]) {
      expect(parseCheckoutValue({ ...value, note: text }, "bc")).toBeNull();
      expect(parseCheckoutValue({ ...value, businessName: text }, "bc")).toBeNull();
    }
  });

  // The merchant's node for the payers' pages: an optional field of version 2 (no vector yet:
  // the app's own test until checkout-spec names it).
  it("reads the merchant's node a record of version 2 names, leaving any other value aside", () => {
    const v2 = links.records.find(({ name }) => name === "version 2: an invoice and an address")!;
    const v1 = links.records.find(({ name }) => name === "a link of the real invoice")!;
    const value = v2.value as Record<string, unknown>;
    const bitcoinNode = { url: "https://node.example.ch", fallback: "none" };
    expect(parseCheckoutValue(value, "bc")?.bitcoinNode).toBeNull();
    expect(parseCheckoutValue({ ...value, bitcoinNode }, "bc")?.bitcoinNode).toEqual(bitcoinNode);
    for (const other of [
      { url: "http://192.168.1.20:3006", fallback: "none" },
      { url: "https://node.example.ch/", fallback: "none" },
      { url: "https://node.example.ch", fallback: "always" },
      "https://node.example.ch",
      null
    ]) {
      // The order's record still read: mempool.space then.
      const record = parseCheckoutValue({ ...value, bitcoinNode: other }, "bc");
      expect(record).not.toBeNull();
      expect(record?.bitcoinNode).toBeNull();
    }
    // Version 1 has no address: nothing to read on a node.
    const v1Value = { ...(v1.value as Record<string, unknown>), bitcoinNode };
    expect(parseCheckoutValue(v1Value, "bc")?.bitcoinNode).toBeNull();
  });
});

describe("the link an implementation made (app-checkout-link.json)", () => {
  const link = appLink as AppLink;
  const fragment = link.url.slice(link.url.indexOf("#"));

  function refOf(): CheckoutRef {
    const read = parseCheckoutFragment(fragment);
    if (read.status !== "link") throw new Error(`Not a link: ${read.status}`);
    return read.ref;
  }

  it("names its author, key and relays, whose keys open its record", () => {
    const ref = refOf();
    expect({ author: ref.author, key: bytesToHex(ref.key), relays: ref.relays }).toEqual({
      author: link.author,
      key: link.linkKey,
      relays: link.relays
    });
    const keys = checkoutKeys(ref.key);
    expect(keys.address).toBe(link.address);
    expect(bytesToHex(keys.encryptionKey)).toBe(link.encryptionKey);
    const copy = readCheckoutCopy(link.event, ref, "bc");
    expect(copy?.status).toBe("ok");
    if (copy?.status !== "ok") return;
    expect(copy.record).toMatchObject({
      businessName: link.businessName,
      sats: BigInt(link.sats),
      expiresAt: link.expiresAt,
      fiat: { minor: 2, digits: 2, currency: "CHF" },
      note: link.order.note,
      redirectUrl: link.order.redirectUrl,
      redirectShown: "shop.example"
    });
    expect(copy.record.invoice).toMatchObject({ pr: link.invoice, verifyUrl: link.verifyUrl });
    expect(copy.record.invoice?.decoded.paymentHash).toBe(link.paymentHash);
    expect(copy.record.onchainAddress).toBeNull();
  });

  it("is found on its relays, its author's copy only", async () => {
    const ref = refOf();
    // Someone else's record at its address, sealed with its key: never the link.
    const forger = new Uint8Array(32).fill(9);
    const forged = sealRecord({
      type: "checkout",
      value: { ...link.value, redirectUrl: "https://evil.example/" },
      signer: forger,
      encryptionKey: hexToBytes(link.encryptionKey),
      address: link.address,
      createdAt: link.event.created_at + 1
    });
    expect(readCheckoutCopy(forged, ref, "bc")).toBeNull();
    // Published before the link is opened, as the server does (its expiration still ahead).
    jest.useFakeTimers({ now: link.expiresAt * 1000 - 60_000 });
    try {
      const call = {
        relays: link.relays,
        channel: "anonymous" as const,
        timeoutMs: 1000,
        authKey: forger
      };
      await publishToRelays(forged, call);
      await publishToRelays(link.event, { ...call, authKey: new Uint8Array(32).fill(1) });
      const found = await fetchCheckoutLink(ref, "bc", { timeoutMs: 1000 });
      expect(found.status).toBe("found");
      if (found.status === "found") {
        expect(found.record.redirectUrl).toBe(link.order.redirectUrl);
      }
      // The relays were asked for its author's events alone.
      const queries = relays.calls.filter((call) => call.operation === "query");
      expect(queries.length).toBeGreaterThan(0);
      for (const { filter } of queries) {
        expect(filter).toMatchObject({ authors: [link.author], "#d": [link.address] });
      }
    } finally {
      jest.useRealTimers();
    }
  });

  it("is a newer format when only a record of a higher version is there", async () => {
    const ref = refOf();
    const secret = new Uint8Array(32).fill(5);
    const author = bytesToHex(schnorr.getPublicKey(secret));
    const newerRef = { ...ref, author };
    const event = sealRecord({
      type: "checkout",
      value: { ...link.value, version: 3 },
      signer: secret,
      encryptionKey: hexToBytes(link.encryptionKey),
      address: link.address,
      createdAt: Math.floor(Date.now() / 1000)
    });
    expect(readCheckoutCopy(event, newerRef, "bc")).toEqual({ status: "newer" });
    await publishToRelays(event, {
      relays: ref.relays,
      channel: "anonymous",
      timeoutMs: 1000,
      authKey: secret
    });
    await expect(fetchCheckoutLink(newerRef, "bc", { timeoutMs: 1000 })).resolves.toEqual({
      status: "newer"
    });
    // A link nobody published: relays answered without it.
    await expect(
      fetchCheckoutLink({ ...ref, key: new Uint8Array(32).fill(3) }, "bc", { timeoutMs: 1000 })
    ).resolves.toEqual({ status: "notFound" });
    relays.unreachable.add(ref.relays[0]);
    await expect(fetchCheckoutLink(ref, "bc", { timeoutMs: 1000 })).resolves.toEqual({
      status: "unreachable"
    });
  });
});

describe("an integration's channel", () => {
  const teamSecret = new Uint8Array(32).fill(21);
  const team = bytesToHex(schnorr.getPublicKey(teamSecret));
  const holder = {
    channel: { address: "12".repeat(32), encryptionKey: new Uint8Array(32).fill(22) }
  };
  const list = ["wss://relay.example"];

  /** The channel as the owner's app writes it, with `checkout`, read as its server's would be. */
  async function read(checkout: unknown, updatedAt: number, extra: Record<string, unknown> = {}) {
    const value = {
      version: 1,
      status: "active",
      name: "Shop",
      role: "integration",
      profile: {
        businessName: "Fine Bakery",
        lightningAddress: "sattleme02c6047f94@breez.tips",
        currency: "CHF",
        onchain: true,
        logo: null
      },
      registryKey: "ab".repeat(32),
      registryReader: bytesToHex(schnorr.getPublicKey(new Uint8Array(32).fill(23))),
      linkOwner: bytesToHex(schnorr.getPublicKey(new Uint8Array(32).fill(24))),
      relays: list,
      checkout,
      ...extra,
      updatedAt
    };
    const event = sealRecord({
      type: "team-channel",
      value,
      signer: teamSecret,
      encryptionKey: holder.channel.encryptionKey,
      address: holder.channel.address,
      createdAt: updatedAt
    });
    await publishToRelays(event, {
      relays: list,
      channel: "account",
      timeoutMs: 1000,
      authKey: teamSecret
    });
    return fetchChannel(team, holder, 1000, list);
  }

  it("keeps the web app it names, and stays valid with an invalid one", async () => {
    await expect(read({ origin: "https://pay.example" }, 100)).resolves.toMatchObject({
      status: "found",
      channel: { status: "active", checkout: { origin: "https://pay.example" } }
    });
    let updatedAt = 101;
    for (const invalid of [{ origin: "http://pay.example" }, "https://pay.example", null, {}]) {
      const found = await read(invalid, updatedAt++);
      expect(found).toMatchObject({ status: "found", channel: { status: "active" } });
      expect(found.status === "found" && found.channel).not.toHaveProperty("checkout");
    }
  });

  it("carries the merchant's tolerance (SPEC.md §14), an invalid one read as none", async () => {
    const origin = { origin: "https://pay.example" };
    await expect(read(origin, 200, { onchainTolerance: 500 })).resolves.toMatchObject({
      status: "found",
      channel: { status: "active", onchainTolerance: 500 }
    });
    let updatedAt = 201;
    for (const onchainTolerance of [0, -10, 1010, 2.5, "500", null]) {
      const found = await read(origin, updatedAt++, { onchainTolerance });
      expect(found).toMatchObject({ status: "found", channel: { status: "active" } });
      expect(found.status === "found" && found.channel).not.toHaveProperty("onchainTolerance");
    }
  });
});

type Rests = {
  records: {
    restKey: string;
    restAuthor: string;
    link: { sats: string; createdAt: number; expiresAt: number };
    cases: { name: string; event: unknown; expected: unknown }[];
  };
};

describe("the records of the rest of an underpayment (onchain-rests.json)", () => {
  const { records } = onchainRests as Rests;
  const record = {
    rest: { author: records.restAuthor, key: hexToBytes(records.restKey) },
    sats: BigInt(records.link.sats),
    createdAt: records.link.createdAt,
    expiresAt: records.link.expiresAt
  };

  it.each(records.cases)("record: $name", ({ event, expected }) => {
    const invoice = readCheckoutRest(event, record, "bc");
    expect(
      invoice && {
        invoice: invoice.pr,
        paymentHash: invoice.decoded.paymentHash,
        verifyUrl: invoice.verifyUrl,
        sats: (invoice.decoded.amountMsat! / 1000n).toString()
      }
    ).toEqual(
      // A record of a newer format is left aside: the rest stays payable on-chain.
      expected === "newer" ? null : expected
    );
  });

  it("reads none without the rest keys of the link's record", () => {
    const valid = records.cases[0]!;
    expect(readCheckoutRest(valid.event, { ...record, rest: null }, "bc")).toBeNull();
    // Nor an invoice of another network.
    expect(readCheckoutRest(valid.event, record, "bcrt")).toBeNull();
  });
});

type Acceptances = {
  keys: { restKey: string; restSecret: string; restAuthor: string; acceptanceAddress: string }[];
  acceptances: {
    restKey: string;
    restAuthor: string;
    link: { sats: string };
    cases: { name: string; event: NostrEvent; expected: { received: string } | "newer" | null }[];
  };
};

describe("the acceptance records of a payment short of the amount (onchain-rests.json)", () => {
  const { keys, acceptances } = onchainRests as unknown as Acceptances;
  const record = {
    rest: { author: acceptances.restAuthor, key: hexToBytes(acceptances.restKey) },
    sats: BigInt(acceptances.link.sats)
  };
  const accepted = acceptances.cases.find(({ name }) => name === "a payment accepted")!;

  it("are at the address each rest key derives", () => {
    expect(keys.length).toBeGreaterThan(1);
    for (const { restKey, restAuthor, acceptanceAddress } of keys) {
      const derived = checkoutRestKeys({ author: restAuthor, key: hexToBytes(restKey) });
      expect(derived.acceptanceAddress).toBe(acceptanceAddress);
    }
  });

  it.each(acceptances.cases)("acceptance: $name", ({ event, expected }) => {
    const read = readCheckoutAcceptance(event, record);
    expect(read && { received: read.received.toString() }).toEqual(
      // A record of a newer format is left aside: the page counts the whole amount.
      expected === "newer" ? null : expected
    );
    if (read) expect(read).toMatchObject({ createdAt: event.created_at, id: event.id });
  });

  it("reads none without the rest keys of the link's record, nor for a link of less", () => {
    expect(readCheckoutAcceptance(accepted.event, { ...record, rest: null })).toBeNull();
    // What it accepted is the link's whole amount, or more: not an acceptance of that link.
    expect(readCheckoutAcceptance(accepted.event, { ...record, sats: 46_550n })).toBeNull();
    expect(readCheckoutAcceptance(accepted.event, { ...record, sats: 46_551n })).toMatchObject({
      received: 46_550n
    });
  });

  it("keeps the newest: by date, then the lowest id", () => {
    const at = (createdAt: number, id: string) => ({ received: 46_550n, createdAt, id });
    const first = at(100, "bb".repeat(32));
    expect(newerAcceptance(null, first)).toBe(first);
    expect(newerAcceptance(first, at(101, "cc".repeat(32)))).toEqual(at(101, "cc".repeat(32)));
    expect(newerAcceptance(first, at(99, "aa".repeat(32)))).toBe(first);
    expect(newerAcceptance(first, at(100, "aa".repeat(32)))).toEqual(at(100, "aa".repeat(32)));
    expect(newerAcceptance(first, at(100, "cc".repeat(32)))).toBe(first);
  });
});

type AppRest = {
  relays: string[];
  onchainAddress: string;
  sats: string;
  createdAt: number;
  expiresAt: number;
  link: { url: string; author: string; linkKey: string; event: NostrEvent };
  rest: {
    restKey: string;
    restAuthor: string;
    address: string;
    invoice: string;
    paymentHash: string;
    verifyUrl: string;
    sats: string;
    event: NostrEvent;
  };
};

describe("the rest an implementation made (app-checkout-rest.json)", () => {
  const vector = appRest as AppRest;

  function linkOf() {
    const read = parseCheckoutFragment(vector.link.url.slice(vector.link.url.indexOf("#")));
    if (read.status !== "link") throw new Error(`Not a link: ${read.status}`);
    const copy = readCheckoutCopy(vector.link.event, read.ref, "bc");
    if (copy?.status !== "ok") throw new Error("Not its record");
    return { ref: read.ref, record: copy.record };
  }

  it("names the rest author and key in the link's record, which read its rest record", () => {
    const { record } = linkOf();
    expect(record.onchainAddress).toBe(vector.onchainAddress);
    expect(record.sats).toBe(BigInt(vector.sats));
    expect(record.rest).toEqual({
      author: vector.rest.restAuthor,
      key: hexToBytes(vector.rest.restKey)
    });
    const invoice = readCheckoutRest(vector.rest.event, record, "bc");
    expect(invoice).toMatchObject({ pr: vector.rest.invoice, verifyUrl: vector.rest.verifyUrl });
    expect(invoice?.decoded.paymentHash).toBe(vector.rest.paymentHash);
    expect(invoice?.decoded.amountMsat).toBe(BigInt(vector.rest.sats) * 1000n);
  });

  it("tells it read them once a majority of the link's relays answered, asking the others again", async () => {
    const { ref, record } = linkOf();
    // The vector's time before it is published: relays refuse its record once its NIP-40
    // expiration has passed (already on the real clock).
    jest.useFakeTimers({ now: vector.expiresAt * 1000 - 300_000, advanceTimers: true });
    try {
      const call = { relays: vector.relays, channel: "anonymous" as const, timeoutMs: 1000 };
      await publishToRelays(vector.rest.event, { ...call, authKey: new Uint8Array(32).fill(1) });
      // One relay: a majority is that one.
      expect(vector.relays).toHaveLength(1);
      relays.unreachable.add(vector.relays[0]!);
      const heard: Invoice[] = [];
      let read = 0;
      const stop = watchCheckoutRests(ref, record, "bc", (invoice) => heard.push(invoice), {
        onRead: () => (read += 1)
      });
      await jest.advanceTimersByTimeAsync(3500);
      expect([read, heard]).toEqual([0, []]);
      relays.unreachable.clear();
      // Asked again after 1 s, 2 s, 4 s…
      for (let i = 0; i < 100 && read === 0; i += 1) await jest.advanceTimersByTimeAsync(100);
      expect(read).toBe(1);
      expect(heard.map((invoice) => invoice.pr)).toContain(vector.rest.invoice);
      stop();
      await jest.advanceTimersByTimeAsync(60_000);
      expect(read).toBe(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it("is heard on the link's relays as it is published, its rest author's only", async () => {
    const { ref, record } = linkOf();
    jest.useFakeTimers({ now: vector.expiresAt * 1000 - 300_000, advanceTimers: true });
    try {
      const heard: Invoice[] = [];
      const stop = watchCheckoutRests(ref, record, "bc", (invoice) => heard.push(invoice));
      // A forger's copy at the same address, sealed with the same key: never the rest.
      const forger = new Uint8Array(32).fill(9);
      const forged = sealRecord({
        type: "checkout-rest",
        value: { version: 1, invoice: vector.rest.invoice, verifyUrl: "https://evil.example/v" },
        signer: forger,
        encryptionKey: checkoutRestKeys(record.rest!).encryptionKey,
        address: vector.rest.address,
        createdAt: vector.rest.event.created_at
      });
      const call = { relays: vector.relays, channel: "anonymous" as const, timeoutMs: 1000 };
      await publishToRelays(forged, { ...call, authKey: forger });
      await publishToRelays(vector.rest.event, { ...call, authKey: new Uint8Array(32).fill(1) });
      for (let i = 0; i < 50 && heard.length === 0; i += 1) {
        await jest.advanceTimersByTimeAsync(20);
      }
      stop();
      expect(heard.map((invoice) => invoice.pr)).toEqual([vector.rest.invoice]);
      const queries = relays.calls.filter(
        (c) => c.operation === "watch" || c.operation === "query"
      );
      for (const { filter } of queries) {
        expect(filter).toMatchObject({ authors: [vector.rest.restAuthor] });
      }
    } finally {
      jest.useRealTimers();
    }
  });
});
