import { schnorr } from "@noble/curves/secp256k1.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";

import { DEFAULT_RELAYS as PAYMENT_LINK_RELAYS } from "@/config/relays";
import { encodeRelayList } from "@/lib/relays/list";
import { bytesToBase64Url } from "@/lib/base64";
import { isValidEvent } from "@/lib/nostr/event";
import { sealRecord } from "@/lib/nostr/record";
import { MAX_ONCHAIN_TOLERANCE, leastAccepted } from "@/lib/onchain/tolerance";
import { finalPayload, parseSaleFinal, type FinalPayload } from "@/lib/payment-link/final";
import {
  PAYMENT_LINK_KIND,
  betterCopy,
  createPaymentLink,
  fetchFinalVersion,
  fetchLinkCopies,
  fetchOwnerFinals,
  fetchPaymentLink,
  finalLinkEvent,
  ownerFinalAddress,
  ownerFinalLinkEvent,
  parsePaymentLinkFragment,
  publishLinkEvent,
  publishPaymentLink,
  readLinkCopy,
  saleLinkAddress,
  type LinkCopy,
  type LinkRef,
  type PaymentLink
} from "@/lib/payment-link/link";
import { saleOwnerPublicKey, saleOwnerSecretKey } from "@/lib/payment-link/owner-key";
import {
  parsePaymentLinkPayload,
  payloadOfSale,
  type PaymentLinkPayload
} from "@/lib/payment-link/payload";
import {
  PENDING_LINKS_KEY,
  PENDING_LINKS_LIMIT,
  loadPendingLinks,
  parsePendingLink,
  pendingOf,
  removePendingLink,
  savePendingLink
} from "@/lib/payment-link/pending";
import { fiatToSats } from "@/lib/terminal/amount";
import { NOTE_MAX_LENGTH } from "@/app/(app)/pos/index";

import { taprootAddress } from "../../jest/bitcoin";
import { makeInvoice, preimagePair } from "../../jest/lightning";
import type * as RelaysFake from "../../jest/nostr-relays";
import type * as SecureStoreFake from "../../jest/expo-secure-store";

const relays = jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");
const secureStore = jest.requireMock<typeof SecureStoreFake>("expo-secure-store");

const ORIGIN = "https://web.example";
const NOW = 1790000000;
const HOUR = NOW - (NOW % 3600);
const { paymentHash } = preimagePair(7);
const INVOICE = makeInvoice({
  amountMsat: 46_918_000n,
  paymentHash,
  timestamp: NOW,
  expirySeconds: 600
});

const ONCHAIN_ADDRESS = taprootAddress(3);
const REGISTRY_KEY = "ab".repeat(32);
/** The business's link owner key (deriveLinkOwner): its secret signs the owner's final versions. */
const OWNER_SECRET = new Uint8Array(32).fill(11);
const OWNER = bytesToHex(schnorr.getPublicKey(OWNER_SECRET));

const payload: PaymentLinkPayload = {
  version: 3,
  businessName: "Fine Bakery",
  lightningAddress: "sattleme02c6047f94@breez.tips",
  fiat: { minor: 2450, digits: 2, currency: "CHF" },
  note: "Table 4",
  onchainAddress: ONCHAIN_ADDRESS,
  endsAt: NOW + 600,
  registryKey: REGISTRY_KEY,
  registryReader: "52d64e4fbc5670d62bad80c169aac897172117ce88c4978506f0c7dd9675ff18",
  owner: OWNER
};

/** A payload of version 2: the point of sale's invoice. No longer read. */
const second = {
  version: 2,
  invoice: INVOICE,
  verifyUrl: `https://breez.tips/lnurlpay/verify/${paymentHash}`,
  businessName: "Fine Bakery",
  lightningAddress: "sattleme02c6047f94@breez.tips",
  fiat: { minor: 2450, digits: 2, currency: "CHF" },
  note: "Table 4",
  onchainAddress: ONCHAIN_ADDRESS
};

/** What the payer's page reads of `payload`. */
const sale = {
  version: 3 as const,
  businessName: "Fine Bakery",
  lightningAddress: "sattleme02c6047f94@breez.tips",
  fiat: { minor: 2450, digits: 2, currency: "CHF" },
  note: "Table 4",
  onchainAddress: ONCHAIN_ADDRESS,
  // Version 3: 10 minutes from its start.
  startsAt: NOW,
  endsAt: NOW + 600,
  redirectUrl: null,
  registryKey: hexToBytes(REGISTRY_KEY),
  registryReader: "52d64e4fbc5670d62bad80c169aac897172117ce88c4978506f0c7dd9675ff18",
  owner: OWNER,
  taker: null,
  bitcoinNode: null,
  final: null
};

/** The point of the hour, and the amount due at it: 24,50 CHF. */
const RATE = 61_234.5;
const DUE = fiatToSats(2450, 2, RATE);
/** A preimage with letters: its hex has a case. */
const PAID = preimagePair(0xab);
const PAID_INVOICE = makeInvoice({
  amountMsat: DUE * 1000n,
  paymentHash: PAID.paymentHash,
  timestamp: NOW,
  expirySeconds: 600
});

/** The final version of a sale paid over Lightning, through the link signed by `author`. */
function paidFinal(author: string): FinalPayload {
  return {
    status: "paid",
    received: DUE.toString(),
    due: DUE.toString(),
    point: { hour: HOUR, rate: RATE },
    lightning: [{ invoice: PAID_INVOICE, preimage: PAID.preimage }],
    onchain: null,
    link: author
  };
}

function newLink(content: PaymentLinkPayload = payload, key?: Uint8Array): PaymentLink {
  return createPaymentLink(content, ORIGIN, NOW, key);
}

/** What the URL of `link` names. */
function refOf(link: PaymentLink): LinkRef {
  return { kind: "sale", author: link.id, key: link.key };
}

/** Lets the slower relays' answers come. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

/** An event of someone else at the link's address: whoever holds the link can publish one. */
function intruder(link: PaymentLink, n: number, createdAt = NOW + 60) {
  return sealRecord({
    type: "payment-link",
    value: { ...payload, lightningAddress: "thief@example.com" },
    signer: hexToBytes(
      bytesToHex(new Uint8Array(32).fill(1)).slice(0, 56) + n.toString(16).padStart(8, "0")
    ),
    encryptionKey: link.key,
    address: saleLinkAddress(link.key),
    createdAt
  });
}

beforeEach(() => relays.resetRelays());

describe("payment link URL", () => {
  it("names the link's author, the sale's key and its relays, in base64url", () => {
    const link = newLink();
    const [author, key, list] = link.url.split("#")[1].split(".");
    expect(link.url).toBe(`${ORIGIN}/pay#${author}.${key}.${list}`);
    expect(list).toBe(encodeRelayList(PAYMENT_LINK_RELAYS));
    expect(link.relays).toEqual(PAYMENT_LINK_RELAYS);
    expect(author).toBe(bytesToBase64Url(hexToBytes(link.id)));
    expect(key).toBe(bytesToBase64Url(link.key));
    expect(author).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(parsePaymentLinkFragment(link.url.slice(link.url.indexOf("#")))).toEqual({
      ...refOf(link),
      relays: PAYMENT_LINK_RELAYS
    });
    // A link names its relays: one without them is not one.
    expect(parsePaymentLinkFragment(`${author}.${key}`)).toBeNull();
    expect(parsePaymentLinkFragment(`#${author}.${key}`)).toBeNull();
    // Another list: the payer's page reads there.
    const own = ["wss://relay.bakery.example"];
    expect(parsePaymentLinkFragment(`${author}.${key}.${encodeRelayList(own)}`)).toEqual({
      ...refOf(link),
      relays: own
    });
    expect(parsePaymentLinkFragment(`${author}.${key}.AAAA`)).toBeNull();
  });

  it("refuses a fragment cut short or of anything else", () => {
    const author = bytesToBase64Url(new Uint8Array(32).fill(3));
    const text = bytesToBase64Url(new Uint8Array(32).fill(9));
    expect(parsePaymentLinkFragment("")).toBeNull();
    expect(parsePaymentLinkFragment(`#${author}`)).toBeNull();
    expect(parsePaymentLinkFragment(`#${text}`)).toBeNull();
    expect(parsePaymentLinkFragment(`#${author}.${text.slice(0, 42)}`)).toBeNull();
    expect(parsePaymentLinkFragment(`#${author.slice(0, 42)}.${text}`)).toBeNull();
    expect(
      parsePaymentLinkFragment(`#${author}.${bytesToBase64Url(new Uint8Array(33))}`)
    ).toBeNull();
    expect(parsePaymentLinkFragment(`#${bytesToBase64Url(new Uint8Array(31))}.${text}`)).toBeNull();
    expect(parsePaymentLinkFragment(`#${author}.${text}.x`)).toBeNull();
    // A UUID (the id the links of versions 1 and 2 had): no longer read.
    expect(parsePaymentLinkFragment(`#3f2a9c1e-1234-8abc-8def-0123456789ab.${text}`)).toBeNull();
  });
});

describe("createPaymentLink", () => {
  it("gives the link and a signed, encrypted event of its own author, without an end", () => {
    const link = newLink();
    expect(isValidEvent(link.event)).toBe(true);
    expect(link.event.kind).toBe(PAYMENT_LINK_KIND);
    expect(link.event.created_at).toBe(NOW);
    expect(link.event.pubkey).toBe(link.id);
    // The relays see a hash of the sale's key, never the key; no expiration: a payer finds the page
    // years later.
    expect(link.event.tags).toEqual([["d", saleLinkAddress(link.key)]]);
    expect(saleLinkAddress(link.key)).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(link.event)).not.toContain(bytesToBase64Url(link.key));
    expect(JSON.stringify(link.event)).not.toContain(bytesToHex(link.key));
    expect(link.payload).toBe(payload);
    // Nothing readable: a NIP-44 payload, like any Nostr client's private data.
    expect(link.event.content).toMatch(/^A[A-Za-z0-9+/]+={0,2}$/);
    // Padded: the note's length does not show.
    expect(newLink({ ...payload, note: "" }).event.content).toHaveLength(link.event.content.length);
  });

  it("makes another author and key for each link", () => {
    const first = newLink();
    const other = newLink();
    expect(other.id).not.toBe(first.id);
    expect(other.url.split("#")[1]).not.toBe(first.url.split("#")[1]);
  });

  it("seals the link with the sale's own key: the URL carries it, its address derives from it", () => {
    const key = new Uint8Array(32).fill(4);
    const link = newLink(payload, key);
    expect(link.key).toEqual(key);
    expect(parsePaymentLinkFragment(link.url.split("#")[1])?.key).toEqual(key);
    // Its author is still its own; the address is the sale's.
    const again = newLink(payload, key);
    expect(again.id).not.toBe(link.id);
    expect(again.event.tags).toEqual(link.event.tags);
    expect(() => newLink(payload, new Uint8Array(16))).toThrow("32 bytes");
  });
});

describe("publishPaymentLink and fetchPaymentLink", () => {
  it("brings the sale back from the relays with the link's key", async () => {
    const link = newLink();
    await publishPaymentLink(link);
    const lookup = await fetchPaymentLink(refOf(link), "bc");
    expect(lookup).toEqual({ status: "found", value: { kind: "sale", sale } });
  });

  it("resolves once a majority of the relays took the event, and rejects when none can", async () => {
    // A link is published to a majority, where the payer's page and the owner find it.
    const link = newLink();
    for (const relay of PAYMENT_LINK_RELAYS.slice(3)) relays.unreachable.add(relay);
    await expect(publishPaymentLink(link)).resolves.toBeUndefined();
    for (const relay of PAYMENT_LINK_RELAYS.slice(0, 3)) {
      expect(relays.stored.get(relay)).toEqual([link.event]);
    }

    // Two of five: no majority.
    relays.unreachable.add(PAYMENT_LINK_RELAYS[2]);
    await expect(publishPaymentLink(newLink())).rejects.toThrow(
      "Fewer than 3 relays took the event"
    );
  });

  it("tells a link no relay holds from relays that cannot be reached", async () => {
    const link = newLink();
    await expect(fetchPaymentLink(refOf(link), "bc")).resolves.toEqual({ status: "notFound" });
    for (const relay of PAYMENT_LINK_RELAYS) relays.unreachable.add(relay);
    await expect(fetchPaymentLink(refOf(link), "bc")).resolves.toEqual({ status: "unreachable" });
  });

  it("finds a copy on the one relay that holds it", async () => {
    const link = newLink();
    relays.stored.set(PAYMENT_LINK_RELAYS[3], [link.event]);
    relays.unreachable.add(PAYMENT_LINK_RELAYS[0]);
    const lookup = await fetchPaymentLink(refOf(link), "bc");
    expect(lookup.status).toBe("found");
  });

  it("never opens with another key, nor for another network", async () => {
    const link = newLink();
    await publishPaymentLink(link);
    const otherKey = new Uint8Array(32).fill(3);
    expect(readLinkCopy(link.event, { ...refOf(link), key: otherKey }, "bc")).toBeNull();
    // Its on-chain address is not one of that network.
    await expect(fetchPaymentLink(refOf(link), "bcrt")).resolves.toEqual({ status: "notFound" });
  });

  it("asks the relays for its author's events only: others' at its address never count", async () => {
    const link = newLink();
    // Whoever holds the link knows its address and key, not its author's secret key: another sale
    // there, older (a reader keeping the first event would take it), then newer.
    const forged = intruder(link, 1, NOW - 60);
    relays.stored.set(PAYMENT_LINK_RELAYS[0], [forged]);
    await expect(fetchPaymentLink(refOf(link), "bc")).resolves.toEqual({ status: "notFound" });
    expect(readLinkCopy(forged, refOf(link), "bc")).toBeNull();

    await publishPaymentLink(link);
    const lookup = await fetchPaymentLink(refOf(link), "bc");
    expect(
      lookup.status === "found" &&
        lookup.value.kind === "sale" &&
        lookup.value.sale.lightningAddress
    ).toBe("sattleme02c6047f94@breez.tips");
  });

  it("is still found under a flood of others' events at its address, past the relays' cap", async () => {
    const link = newLink();
    await publishPaymentLink(link);
    // More newer events than a relay sends back for a filter (MAX_EVENTS_PER_FILTER), each of its own
    // key: asked by its address alone, the link would no longer come back.
    const flood = Array.from({ length: relays.MAX_EVENTS_PER_FILTER + 20 }, (_, n) =>
      intruder(link, n + 2, NOW + 60 + n)
    );
    for (const relay of PAYMENT_LINK_RELAYS) {
      relays.stored.set(relay, [...(relays.stored.get(relay) ?? []), ...flood]);
    }
    const byAddress = await relays.queryEvents(
      PAYMENT_LINK_RELAYS[0],
      { kinds: [PAYMENT_LINK_KIND], "#d": [saleLinkAddress(link.key)] },
      { channel: "anonymous", timeoutMs: 1000 }
    );
    expect(byAddress.some((event) => event.id === link.event.id)).toBe(false);

    const lookup = await fetchPaymentLink(refOf(link), "bc");
    expect(lookup).toEqual({ status: "found", value: { kind: "sale", sale } });
  });

  it("ignores an altered copy and a payload sealed for another purpose", async () => {
    const link = newLink();
    const { key } = link;
    const altered = { ...link.event, content: `${link.event.content.slice(0, -2)}00` };
    relays.stored.set(PAYMENT_LINK_RELAYS[0], [altered]);
    await expect(fetchPaymentLink(refOf(link), "bc")).resolves.toEqual({ status: "notFound" });

    // Signed by the link's own key, sealed with its key, but a record of another type.
    const settings = sealRecord({
      type: "merchant-settings",
      value: payload,
      signer: link.secretKey,
      encryptionKey: key,
      address: saleLinkAddress(key),
      createdAt: NOW
    });
    relays.stored.set(PAYMENT_LINK_RELAYS[0], [settings]);
    await expect(fetchPaymentLink(refOf(link), "bc")).resolves.toEqual({ status: "notFound" });
  });
});

describe("final versions", () => {
  it("replace the link on the relays, signed by its author: the page reads the outcome", async () => {
    const link = newLink();
    await publishPaymentLink(link);
    const final = finalLinkEvent(link, link.event.created_at, paidFinal(link.id), NOW);
    // Dated after the link, at its address: relays keep it instead.
    expect(final.created_at).toBe(NOW + 1);
    expect(final.tags).toEqual(link.event.tags);
    await publishLinkEvent(final, link.secretKey);
    for (const relay of PAYMENT_LINK_RELAYS) expect(relays.stored.get(relay)).toEqual([final]);

    const lookup = await fetchPaymentLink(refOf(link), "bc");
    const shown = lookup.status === "found" && lookup.value.kind === "sale" && lookup.value.sale;
    expect(shown).toMatchObject({
      // Nothing paid the address: it is left out.
      onchainAddress: null,
      final: {
        status: "paid",
        received: DUE,
        due: DUE,
        point: { hour: HOUR, rate: RATE },
        onchain: null,
        link: link.id
      }
    });
    expect(shown && shown.final?.lightning.map(({ preimage }) => preimage)).toEqual([
      PAID.preimage
    ]);
    await expect(fetchFinalVersion(link.id, link.key, OWNER, "bc")).resolves.toEqual({
      final: expect.objectContaining({ event: final }),
      holders: [...PAYMENT_LINK_RELAYS]
    });
  });

  it("keep the address that was paid, with its transactions", async () => {
    const link = newLink();
    const txid = "cd".repeat(32);
    const final: FinalPayload = {
      status: "paid",
      received: (DUE + 10n).toString(),
      due: DUE.toString(),
      point: { hour: HOUR, rate: RATE },
      lightning: [],
      onchain: {
        address: ONCHAIN_ADDRESS,
        transactions: [{ txid, receivedAt: NOW * 1000 + 250, sats: (DUE + 10n).toString() }],
        sats: (DUE + 10n).toString()
      },
      link: link.id
    };
    await publishLinkEvent(finalLinkEvent(link, NOW, final, NOW + 60), link.secretKey);
    const lookup = await fetchPaymentLink(refOf(link), "bc");
    expect(
      lookup.status === "found" && lookup.value.kind === "sale" && lookup.value.sale
    ).toMatchObject({
      onchainAddress: ONCHAIN_ADDRESS,
      final: {
        received: DUE + 10n,
        onchain: { address: ONCHAIN_ADDRESS, transactions: [{ txid }], sats: DUE + 10n }
      }
    });
  });

  it("may be the owner's, of the owner key the link names: the page takes it over the link", async () => {
    const link = newLink();
    await publishPaymentLink(link);
    const final = ownerFinalLinkEvent(
      OWNER_SECRET,
      link.id,
      link.key,
      payload,
      paidFinal(link.id),
      NOW + 3 * 3600
    );
    // Signed by the owner's key of this sale, at an address of the link's author: neither the owner
    // key nor the link's author shows.
    const signer = saleOwnerPublicKey(OWNER, link.key);
    expect(final.pubkey).not.toBe(OWNER);
    expect(final.pubkey).toBe(signer);
    expect(final.tags).toEqual([["d", ownerFinalAddress(link.id)]]);
    expect(JSON.stringify(final)).not.toContain(link.id);
    await publishLinkEvent(final, saleOwnerSecretKey(OWNER_SECRET, link.key));

    // The link first (it names the owner key), then the owner's final version, asked by its key.
    const better = jest.fn();
    const lookup = await fetchPaymentLink(refOf(link), "bc", { onBetter: better });
    expect(
      lookup.status === "found" && lookup.value.kind === "sale" && lookup.value.sale.final
    ).toBeNull();
    await settle();
    expect(better).toHaveBeenCalledTimes(1);
    expect(better.mock.calls[0][0].sale.final.status).toBe("paid");
    expect(readLinkCopy(final, refOf(link), "bc", OWNER)?.author).toBe("owner");
    // Without the owner key the link names, not trusted.
    expect(readLinkCopy(final, refOf(link), "bc")).toBeNull();
    await expect(fetchFinalVersion(link.id, link.key, OWNER, "bc")).resolves.toEqual({
      final: expect.objectContaining({ event: final }),
      holders: [...PAYMENT_LINK_RELAYS]
    });
    await expect(
      fetchOwnerFinals([{ author: link.id, key: link.key, owner: OWNER }], "bc")
    ).resolves.toEqual(new Set([link.id]));
  });

  it("come to the page from a slower relay after the link it showed", async () => {
    const link = newLink();
    const final = ownerFinalLinkEvent(
      OWNER_SECRET,
      link.id,
      link.key,
      payload,
      paidFinal(link.id),
      NOW + 60
    );
    relays.stored.set(PAYMENT_LINK_RELAYS[0], [link.event]);
    relays.stored.set(PAYMENT_LINK_RELAYS[4], [final]);
    const better = jest.fn();
    const lookup = await fetchPaymentLink(refOf(link), "bc", { onBetter: better });
    expect(
      lookup.status === "found" && lookup.value.kind === "sale" && lookup.value.sale.final
    ).toBeNull();
    await settle();
    expect(better).toHaveBeenCalledTimes(1);
    expect(better.mock.calls[0][0].sale.final.status).toBe("paid");
  });

  it("are refused from anyone else, or naming another author or owner", async () => {
    const link = newLink();
    const ref = refOf(link);
    const forger = new Uint8Array(32).fill(5);
    const forgerKey = bytesToHex(schnorr.getPublicKey(forger));
    // At the owner's address, signed by another key.
    const forged = sealRecord({
      type: "payment-link",
      value: { ...payload, onchainAddress: null, final: paidFinal(link.id) },
      signer: forger,
      encryptionKey: link.key,
      address: ownerFinalAddress(link.id),
      createdAt: NOW
    });
    expect(readLinkCopy(forged, ref, "bc", OWNER)).toBeNull();
    // An "owner" of the forger's own key: not the owner key the link names.
    const otherOwner = ownerFinalLinkEvent(
      forger,
      link.id,
      link.key,
      { ...payload, owner: forgerKey },
      paidFinal(link.id),
      NOW
    );
    expect(readLinkCopy(otherOwner, ref, "bc", OWNER)).toBeNull();
    expect(readLinkCopy(otherOwner, ref, "bc", forgerKey)?.author).toBe("owner");
    // The owner's, naming another author than the link's: not this link's.
    const elsewhere = ownerFinalLinkEvent(
      OWNER_SECRET,
      link.id,
      link.key,
      payload,
      paidFinal(forgerKey),
      NOW
    );
    expect(readLinkCopy(elsewhere, ref, "bc", OWNER)).toBeNull();
    // The owner's, at the link's own address: not where the owner publishes.
    const misplaced = sealRecord({
      type: "payment-link",
      value: { ...payload, onchainAddress: null, final: paidFinal(link.id) },
      signer: saleOwnerSecretKey(OWNER_SECRET, link.key),
      encryptionKey: link.key,
      address: saleLinkAddress(link.key),
      createdAt: NOW
    });
    expect(readLinkCopy(misplaced, ref, "bc", OWNER)).toBeNull();
    // The link's author, naming another author.
    const renamed = finalLinkEvent(link, NOW, paidFinal(forgerKey), NOW + 1);
    expect(readLinkCopy(renamed, ref, "bc")).toBeNull();
    // Of another sale's key: the owner's key is another one.
    const otherSale = newLink(payload, new Uint8Array(32).fill(6));
    const crossed = ownerFinalLinkEvent(
      OWNER_SECRET,
      link.id,
      otherSale.key,
      payload,
      paidFinal(link.id),
      NOW
    );
    expect(readLinkCopy(crossed, ref, "bc", OWNER)).toBeNull();
    await expect(fetchFinalVersion(link.id, link.key, OWNER, "bc")).resolves.toEqual({
      final: null,
      holders: []
    });
  });

  it("are never replaced: the first one made counts, before any later one", () => {
    const link = newLink();
    const ref = refOf(link);
    const paid = readLinkCopy(finalLinkEvent(link, NOW, paidFinal(link.id), NOW + 10), ref, "bc")!;
    const expired: FinalPayload = {
      status: "expired",
      received: "0",
      due: null,
      point: null,
      lightning: [],
      onchain: null,
      link: link.id
    };
    const later = readLinkCopy(
      ownerFinalLinkEvent(OWNER_SECRET, link.id, link.key, payload, expired, NOW + 20),
      ref,
      "bc",
      OWNER
    )!;
    const plain = readLinkCopy(link.event, ref, "bc")!;
    expect(later.link.kind === "sale" && later.link.sale.final?.status).toBe("expired");
    expect(betterCopy(null, plain)).toBe(plain);
    expect(betterCopy(plain, paid)).toBe(paid);
    expect(betterCopy(paid, plain)).toBe(paid);
    expect(betterCopy(paid, later)).toBe(paid);
    expect(betterCopy(later, paid)).toBe(paid);
  });

  it("give way to the owner's settlement of a canceled sale, never to a link's own", () => {
    const link = newLink();
    const ref = refOf(link);
    const nothing = (status: "canceled" | "expired"): FinalPayload => ({
      status,
      received: "0",
      due: null,
      point: null,
      lightning: [],
      onchain: null,
      link: link.id
    });
    const owner = (final: FinalPayload, at: number) =>
      readLinkCopy(
        ownerFinalLinkEvent(OWNER_SECRET, link.id, link.key, payload, final, at),
        ref,
        "bc",
        OWNER
      )!;
    const canceled = owner(nothing("canceled"), NOW + 10);
    // A payment reached the sale after its cancellation: the owner's settlement, made later.
    const settled = owner(paidFinal(link.id), NOW + 30);
    // A link's own final version made after the cancellation: its key may be a removed employee's.
    const ownPaid = readLinkCopy(
      finalLinkEvent(link, NOW, paidFinal(link.id), NOW + 20),
      ref,
      "bc"
    )!;
    const ownExpired = readLinkCopy(
      finalLinkEvent(link, NOW, nothing("expired"), NOW + 5),
      ref,
      "bc"
    )!;
    expect(betterCopy(canceled, settled)).toBe(settled);
    expect(betterCopy(settled, canceled)).toBe(settled);
    expect(betterCopy(canceled, ownPaid)).toBe(canceled);
    expect(betterCopy(ownPaid, canceled)).toBe(canceled);
    // An owner's that received nothing is no settlement: the first made counts, as before.
    expect(betterCopy(ownExpired, canceled)).toBe(ownExpired);
    // One order whatever the order the relays send them in: every reader shows the same.
    const all = [canceled, settled, ownPaid, ownExpired, readLinkCopy(link.event, ref, "bc")!];
    const orders = [all, [...all].reverse(), [all[2]!, all[0]!, all[4]!, all[1]!, all[3]!]];
    for (const order of orders) {
      expect(order.reduce<LinkCopy | null>(betterCopy, null)).toBe(settled);
      expect(
        order.filter((copy) => copy !== settled).reduce<LinkCopy | null>(betterCopy, null)
      ).toBe(ownExpired);
    }
  });

  it("are found by the owner by each link's author", async () => {
    const link = newLink();
    const other = newLink(payload, new Uint8Array(32).fill(6));
    await publishPaymentLink(link);
    await publishPaymentLink(other);
    // Others' events at the first link's address are not asked for.
    for (const relay of PAYMENT_LINK_RELAYS) {
      relays.stored.set(relay, [...(relays.stored.get(relay) ?? []), intruder(link, 9)]);
    }
    const missing = newLink(payload, new Uint8Array(32).fill(7));
    const found = await fetchLinkCopies(
      [link, other, missing].map(({ id, key }) => ({ author: id, key })),
      "bc"
    );
    expect(found?.get(link.id)?.map(({ event }) => event.id)).toEqual([link.event.id]);
    expect(found?.get(other.id)?.[0].link.kind).toBe("sale");
    expect(found?.has(missing.id)).toBe(false);
    await expect(
      fetchOwnerFinals([{ author: link.id, key: link.key, owner: OWNER }], "bc")
    ).resolves.toEqual(new Set());
    for (const relay of PAYMENT_LINK_RELAYS) relays.unreachable.add(relay);
    await expect(fetchLinkCopies([{ author: link.id, key: link.key }], "bc")).resolves.toBeNull();
    await expect(fetchFinalVersion(link.id, link.key, OWNER, "bc")).resolves.toBeNull();
  });
});

describe("a link's final version, with relays that do not answer", () => {
  it("is not said missing from fewer than a majority's answers (F1)", async () => {
    const link = newLink();
    await publishPaymentLink(link);
    // A final version three relays of five took.
    const final = finalLinkEvent(link, link.event.created_at, paidFinal(link.id), NOW);
    for (const relay of PAYMENT_LINK_RELAYS.slice(3)) relays.unreachable.add(relay);
    await publishLinkEvent(final, link.secretKey);
    relays.unreachable.clear();

    // Only the two that lack it answer: nothing is known, no other final version is to be made.
    for (const relay of PAYMENT_LINK_RELAYS.slice(0, 3)) relays.unreachable.add(relay);
    await expect(fetchFinalVersion(link.id, link.key, OWNER, "bc")).resolves.toBeNull();

    // One of its holders answers too: a majority, the final version found.
    relays.unreachable.delete(PAYMENT_LINK_RELAYS[0]);
    await expect(fetchFinalVersion(link.id, link.key, OWNER, "bc")).resolves.toEqual({
      final: expect.objectContaining({ event: final }),
      holders: [PAYMENT_LINK_RELAYS[0]]
    });
  });

  it("is found without waiting for a relay that stays connected without answering", async () => {
    const link = newLink();
    await publishPaymentLink(link);
    await publishLinkEvent(
      finalLinkEvent(link, link.event.created_at, paidFinal(link.id), NOW),
      link.secretKey
    );
    relays.silent.add(PAYMENT_LINK_RELAYS[4]);
    jest.useFakeTimers({ now: Date.now(), doNotFake: ["queueMicrotask", "nextTick"] });
    try {
      let found: unknown = undefined;
      void fetchFinalVersion(link.id, link.key, OWNER, "bc").then((value) => {
        found = value;
      });
      // Its grace after the majority, far from the relays' 10 s.
      await jest.advanceTimersByTimeAsync(1100);
      expect(found).toMatchObject({ holders: PAYMENT_LINK_RELAYS.slice(0, 4) });
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("pending links", () => {
  it("keep what the device needs to publish a link's final version, until it is published", async () => {
    const first = newLink();
    const second = newLink(payload, new Uint8Array(32).fill(6));
    const wallet = { kind: "wallet" as const, walletId: "02" + "c6".repeat(32) };
    await Promise.all([savePendingLink(first, wallet), savePendingLink(second)]);
    const pending = await loadPendingLinks("bc");
    expect(pending).toEqual([pendingOf(first, wallet), pendingOf(second)]);
    expect(pending[0]).toMatchObject({
      id: first.id,
      secret: bytesToHex(first.secretKey),
      key: bytesToHex(first.key),
      createdAt: NOW,
      payload
    });
    // Each entry well below the 2 KB some iOS releases refused in the Keychain.
    for (const value of secureStore.items.values()) expect(value.length).toBeLessThan(1500);

    // One removal only says it removed the entry: what follows it (the link's on-chain address
    // back to the pool) happens once.
    expect(await removePendingLink(first.id)).toBe(true);
    expect(await removePendingLink(first.id)).toBe(false);
    expect(await loadPendingLinks("bc")).toEqual([pendingOf(second)]);
    // The second link's entry, the index and the list of relays the second link still names.
    expect([...secureStore.items.keys()]).toHaveLength(3);
    // The last link of a list takes it away.
    await removePendingLink(second.id);
    expect([...secureStore.items.keys()]).toEqual([PENDING_LINKS_KEY]);
  });

  it("keep the relays of each link, which their final version goes to", async () => {
    const own = ["wss://relay.bakery.example"];
    const first = newLink();
    const second = createPaymentLink(payload, ORIGIN, NOW, new Uint8Array(32).fill(6), own);
    await savePendingLink(first);
    await savePendingLink(second);
    const pending = await loadPendingLinks("bc");
    expect(pending.map(({ relays }) => relays)).toEqual([PAYMENT_LINK_RELAYS, own]);
    // Two lists, one entry each.
    const lists = [...secureStore.items.keys()].filter((name) =>
      name.startsWith("terminal-pending-relays.")
    );
    expect(lists).toHaveLength(2);
    await removePendingLink(first.id);
    expect(
      [...secureStore.items.keys()].filter((name) => name.startsWith("terminal-pending-relays."))
    ).toHaveLength(1);
    // An entry naming no list of relays, of version 1 or not, is not one.
    const [entryName] = [...secureStore.items.keys()].filter((name) =>
      name.startsWith("terminal-pending-link.")
    );
    const { relays: _list, ...stored } = JSON.parse(secureStore.items.get(entryName!)!);
    secureStore.items.set(entryName!, JSON.stringify({ ...stored, version: 1 }));
    expect(await loadPendingLinks("bc")).toEqual([]);
    secureStore.items.set(entryName!, JSON.stringify(stored));
    expect(await loadPendingLinks("bc")).toEqual([]);
  });

  it("keep each entry below the Keychain's 2 KB, a business name and a note of their longest", async () => {
    const longest = {
      ...payload,
      // Characters of 3 bytes in UTF-8, as many as the team's channel and the keypad allow.
      businessName: "漢".repeat(200),
      note: "漢".repeat(NOTE_MAX_LENGTH),
      onchainAddress: taprootAddress(1),
      fiat: { minor: 9_999_999, digits: 2, currency: "CHF" },
      // Who took the sale.
      taker: "ab".repeat(16),
      // An invoice's link ("New invoice"): its start besides its end.
      version: 4 as const,
      startsAt: payload.endsAt - 280 * 24 * 3600
    };
    const link = newLink(longest);
    // With a tolerance of the most digits (10 %).
    await savePendingLink(link, { kind: "wallet", walletId: "02" + "c6".repeat(32) }, 1000);
    for (const [name, value] of secureStore.items) {
      if (name !== PENDING_LINKS_KEY)
        expect(new TextEncoder().encode(value).length).toBeLessThan(1800);
    }
    expect((await loadPendingLinks("bc"))[0]).toMatchObject({
      id: link.id,
      payload: longest,
      tolerance: 1000
    });
    // Another link's entry under this one's name is not loaded.
    const { id: _id, relays: _relays, ...other } = pendingOf(newLink());
    const [name] = [...secureStore.items.keys()].filter((key) =>
      key.startsWith("terminal-pending-link.")
    );
    const list: unknown = JSON.parse(secureStore.items.get(name!)!).relays;
    secureStore.items.set(name!, JSON.stringify({ ...other, relays: list }));
    expect(await loadPendingLinks("bc")).toEqual([]);
  });

  it("keep the sale's tolerance of on-chain underpayments, written only when it has one", async () => {
    const first = newLink();
    const second = newLink(payload, new Uint8Array(32).fill(6));
    await savePendingLink(first, null, 500);
    await savePendingLink(second);
    const pending = await loadPendingLinks("bc");
    expect(pending.map(({ tolerance }) => tolerance)).toEqual([500, 0]);
    expect(pending).toEqual([pendingOf(first, null, 500), pendingOf(second)]);
    const stored = (link: PaymentLink) =>
      JSON.parse(
        secureStore.items.get(`terminal-pending-link.${link.id.replace(/-/g, "").slice(0, 16)}`)!
      );
    expect(stored(first)).toMatchObject({ tolerance: 500 });
    // None: absent, as in the entries of apps before it.
    expect(stored(second)).not.toHaveProperty("tolerance");
  });

  it("read anything but a tolerance of 0 to 10 % as none", () => {
    const link = newLink();
    const entry = { ...pendingOf(link), relays: "0123456789abcdef" };
    const lists = () => PAYMENT_LINK_RELAYS;
    for (const tolerance of [-1, 1001, 2.5, "500", null]) {
      expect(parsePendingLink({ ...entry, tolerance }, "bc", lists)?.tolerance).toBe(0);
    }
    expect(parsePendingLink({ ...entry, tolerance: 1000 }, "bc", lists)?.tolerance).toBe(1000);
  });

  it("keep the newest links within the limit", async () => {
    const links = Array.from({ length: PENDING_LINKS_LIMIT + 2 }, () => newLink());
    for (const link of links) await savePendingLink(link);
    const pending = await loadPendingLinks("bc");
    expect(pending.map(({ id }) => id)).toEqual(links.slice(2).map(({ id }) => id));
    // The entries, the index and their one list of relays.
    expect(secureStore.items.size).toBe(PENDING_LINKS_LIMIT + 2);
    expect(JSON.parse(secureStore.items.get(PENDING_LINKS_KEY)!)).toHaveLength(PENDING_LINKS_LIMIT);
    // The index too stays below the 2 KB of the Keychain.
    expect(secureStore.items.get(PENDING_LINKS_KEY)!.length).toBeLessThan(1500);
  });

  it("never write over an index they cannot read", async () => {
    const first = newLink();
    await savePendingLink(first);
    const index = secureStore.items.get(PENDING_LINKS_KEY)!;
    secureStore.getItemAsync.mockRejectedValueOnce(new Error("Keychain locked"));
    await expect(savePendingLink(newLink())).rejects.toThrow("Keychain locked");
    // The first link is still there (its entry and its list), nothing of the second.
    expect(secureStore.items.get(PENDING_LINKS_KEY)).toBe(index);
    expect(secureStore.items.size).toBe(3);
    expect((await loadPendingLinks("bc")).map(({ id }) => id)).toEqual([first.id]);
    // Unreadable when loading: none, until it can be read again.
    secureStore.getItemAsync.mockRejectedValueOnce(new Error("Keychain locked"));
    expect(await loadPendingLinks("bc")).toEqual([]);
    expect(await loadPendingLinks("bc")).toHaveLength(1);
  });

  it("refuse an entry whose key is not of its id's author, or a final version", () => {
    const link = newLink();
    const full = pendingOf(link);
    // As stored: its list of relays by its id, which the loader reads (here: any id).
    const entry = { ...full, relays: "0123456789abcdef" };
    const lists = (id: string) => (id === "0123456789abcdef" ? PAYMENT_LINK_RELAYS : null);
    expect(parsePendingLink(JSON.parse(JSON.stringify(entry)), "bc", lists)).toEqual(full);
    expect(parsePendingLink(entry, "bc")).toBeNull();
    // Its id is its key's author, whatever the entry says; the loader keeps it only under its name.
    expect(parsePendingLink({ ...entry, id: newLink().id }, "bc", lists)?.id).toBe(link.id);
    expect(parsePendingLink({ ...entry, secret: "00".repeat(32) }, "bc", lists)).toBeNull();
    expect(
      parsePendingLink(
        { ...entry, payload: { ...payload, final: paidFinal(link.id) } },
        "bc",
        lists
      )
    ).toBeNull();
    expect(parsePendingLink({ ...entry, version: 3 }, "bc", lists)).toBeNull();
    expect(parsePendingLink({ ...entry, createdAt: 0 }, "bc", lists)).toBeNull();
    // The wallet of its on-chain address: a wallet id, or none.
    const wallet = { kind: "wallet" as const, walletId: "02" + "c6".repeat(32) };
    const owned = { ...entry, pool: wallet };
    expect(parsePendingLink(JSON.parse(JSON.stringify(owned)), "bc", lists)).toEqual(
      pendingOf(link, wallet)
    );
    expect(
      parsePendingLink({ ...entry, pool: { kind: "wallet", walletId: "02c6" } }, "bc", lists)
    ).toBeNull();
    expect(parsePendingLink({ ...entry, pool: undefined }, "bc", lists)).toBeNull();
    const team = { kind: "team" as const, team: "ab".repeat(32) };
    expect(parsePendingLink({ ...entry, pool: team }, "bc", lists)).toEqual(pendingOf(link, team));
  });
});

describe("parsePaymentLinkPayload", () => {
  const parse = (changes: Record<string, unknown>) => {
    const link = parsePaymentLinkPayload({ ...payload, ...changes }, "bc");
    return link?.kind === "sale" ? link.sale : null;
  };

  it("accepts a sale of this format", () => {
    expect(parse({})).toEqual(sale);
    // Who took it, optional: one not in its form is left aside, the link
    // still read (only the owner checks it).
    const taker = "ab".repeat(16);
    expect(parse({ taker })?.taker).toBe(taker);
    expect(parse({ taker: "AB".repeat(16) })?.taker).toBeNull();
    expect(parse({ taker: "ab".repeat(15) })?.taker).toBeNull();
    expect(parse({ taker: 7 })).toMatchObject({ ...sale, taker: null });
    // Its final version keeps it.
    expect(payloadOfSale({ ...sale, taker })).toMatchObject({ taker });
    expect(payloadOfSale(sale)).not.toHaveProperty("taker");
    // The merchant's node passed on to the payer's page, optional: an HTTPS node in
    // its one spelling, anything else left aside (mempool.space), the link still read.
    const bitcoinNode = { url: "https://node.example.ch", fallback: "none" } as const;
    expect(parse({ bitcoinNode })?.bitcoinNode).toEqual(bitcoinNode);
    expect(
      parse({ bitcoinNode: { url: "http://192.168.1.20:3006", fallback: "none" } })
    ).toMatchObject({ ...sale, bitcoinNode: null });
    expect(parse({ bitcoinNode: { url: "https://node.example.ch/" } })?.bitcoinNode).toBeNull();
    expect(payloadOfSale({ ...sale, bitcoinNode })).toMatchObject({ bitcoinNode });
    expect(payloadOfSale(sale)).not.toHaveProperty("bitcoinNode");
    expect(parse({ note: "" })?.note).toBe("");
    expect(parse({ fiat: { minor: 2450, digits: 0, currency: "JPY" } })?.fiat.digits).toBe(0);
    // Lightning only.
    expect(parse({ onchainAddress: null })?.onchainAddress).toBeNull();
    // As explorers print it.
    expect(parse({ onchainAddress: ONCHAIN_ADDRESS.toUpperCase() })?.onchainAddress).toBe(
      ONCHAIN_ADDRESS
    );
    // An invoice there is not read: the page asks its own.
    expect(parsePaymentLinkPayload({ ...payload, invoice: INVOICE }, "bc")?.kind).toBe("sale");
  });

  it("reads a sale of version 4 with its own start (an invoice, payable for months)", () => {
    const startsAt = NOW - 30 * 24 * 3600;
    const long = { version: 4, startsAt, endsAt: NOW + 200 * 24 * 3600 };
    expect(parse(long)).toEqual({ ...sale, ...long });
    // Its final version holds the same payload: its start with it.
    expect(payloadOfSale({ ...sale, ...long, version: 4 })).toMatchObject({ version: 4, startsAt });
    // Version 3 has none: its start is 10 minutes before its end, and its payload names none.
    expect(payloadOfSale(sale)).not.toHaveProperty("startsAt");
    expect(parse({ startsAt: NOW })).toBeNull();
    // Version 4 needs one, before its end, and a sale no longer than 300 days.
    expect(parse({ ...long, startsAt: undefined })).toBeNull();
    expect(parse({ ...long, startsAt: long.endsAt })).toBeNull();
    expect(parse({ ...long, startsAt: 0 })).toBeNull();
    expect(parse({ ...long, startsAt: 1.5 })).toBeNull();
    expect(parse({ ...long, startsAt: long.endsAt - 300 * 24 * 3600 - 1 })).toBeNull();
    expect(parse({ ...long, startsAt: long.endsAt - 300 * 24 * 3600 })?.startsAt).toBe(
      long.endsAt - 300 * 24 * 3600
    );
    // A version this app does not know: refused, never misread.
    expect(parse({ version: 5 })).toBeNull();
    // Where the page offers to go once paid: an https URL, in version 4 only.
    const redirectUrl = "https://shop.example.ch/thanks";
    expect(parse({ ...long, redirectUrl })?.redirectUrl).toBe(redirectUrl);
    expect(payloadOfSale({ ...sale, ...long, version: 4, redirectUrl })).toMatchObject({
      redirectUrl
    });
    expect(payloadOfSale({ ...sale, ...long, version: 4 })).not.toHaveProperty("redirectUrl");
    expect(parse({ ...long, redirectUrl: "http://shop.example.ch" })).toBeNull();
    expect(parse({ ...long, redirectUrl: `https://a.ch/${"x".repeat(500)}` })).toBeNull();
    expect(parse({ redirectUrl })).toBeNull();
  });

  it("refuses an on-chain address that is not a taproot address of this network", () => {
    expect(parse({ onchainAddress: taprootAddress(3, "bcrt") })).toBeNull();
    // Segwit version 0 (BIP-173): never a deposit address.
    expect(parse({ onchainAddress: "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4" })).toBeNull();
    expect(parse({ onchainAddress: ONCHAIN_ADDRESS.slice(0, -1) })).toBeNull();
    expect(parse({ onchainAddress: undefined })).toBeNull();
    expect(parse({ onchainAddress: 42 })).toBeNull();
  });

  it("refuses anything else malformed", () => {
    expect(parse({ version: 4 })).toBeNull();
    expect(parsePaymentLinkPayload({ ...payload, version: 4 }, "bc")).toBeNull();
    expect(parse({ endsAt: undefined })).toBeNull();
    expect(parse({ endsAt: 0 })).toBeNull();
    expect(parse({ endsAt: NOW + 0.5 })).toBeNull();
    expect(parse({ endsAt: String(NOW + 600) })).toBeNull();
    expect(parse({ registryKey: undefined })).toBeNull();
    expect(parse({ registryKey: REGISTRY_KEY.toUpperCase() })).toBeNull();
    expect(parse({ registryKey: REGISTRY_KEY.slice(2) })).toBeNull();
    expect(parse({ registryKey: 42 })).toBeNull();
    expect(parse({ registryReader: undefined })).toBeNull();
    expect(parse({ registryReader: "1B".repeat(32) })).toBeNull();
    expect(parse({ registryReader: "ab".repeat(31) })).toBeNull();
    expect(parse({ owner: undefined })).toBeNull();
    expect(parse({ owner: OWNER.toUpperCase() })).toBeNull();
    expect(parse({ owner: OWNER.slice(2) })).toBeNull();
    expect(parse({ businessName: "  " })).toBeNull();
    expect(parse({ businessName: "x".repeat(201) })).toBeNull();
    expect(parse({ note: "x".repeat(201) })).toBeNull();
    expect(parse({ note: null })).toBeNull();
    expect(parse({ lightningAddress: "not an address" })).toBeNull();
    expect(parse({ fiat: { minor: 0, digits: 2, currency: "CHF" } })).toBeNull();
    expect(parse({ fiat: { minor: 24.5, digits: 2, currency: "CHF" } })).toBeNull();
    expect(parse({ fiat: { minor: 2450, digits: 5, currency: "CHF" } })).toBeNull();
    expect(parse({ fiat: { minor: 2450, digits: 2, currency: "chf" } })).toBeNull();
    expect(parse({ fiat: null })).toBeNull();
    // The point of sale's invoice of versions 1 and 2: no longer read.
    expect(parsePaymentLinkPayload(second, "bc")).toBeNull();
    expect(parsePaymentLinkPayload({ ...second, version: 1 }, "bc")).toBeNull();
    expect(parsePaymentLinkPayload(null, "bc")).toBeNull();
    expect(parsePaymentLinkPayload("payload", "bc")).toBeNull();
  });
});

describe("parsePaymentLinkPayload, final versions", () => {
  const AUTHOR = bytesToHex(schnorr.getPublicKey(new Uint8Array(32).fill(1)));
  const parseFinal = (final: Record<string, unknown>, changes: Record<string, unknown> = {}) => {
    const link = parsePaymentLinkPayload(
      { ...payload, onchainAddress: null, ...changes, final: { ...paidFinal(AUTHOR), ...final } },
      "bc"
    );
    return link?.kind === "sale" ? link.sale.final : null;
  };

  it("accepts the proofs of a paid sale: preimages, the point of the amount due", () => {
    expect(parseFinal({})).toMatchObject({ status: "paid", received: DUE, due: DUE, link: AUTHOR });
    // More than due (two invoices paid): kept as received.
    const other = preimagePair(9);
    const extra = makeInvoice({
      amountMsat: 1_000_000n,
      paymentHash: other.paymentHash,
      timestamp: NOW,
      expirySeconds: 600
    });
    expect(
      parseFinal({
        received: (DUE + 1000n).toString(),
        lightning: [
          { invoice: PAID_INVOICE, preimage: PAID.preimage },
          { invoice: extra, preimage: other.preimage }
        ]
      })?.received
    ).toBe(DUE + 1000n);
  });

  it("accepts an expired sale, which received nothing", () => {
    const expired = { status: "expired", due: null, point: null, received: "0", lightning: [] };
    expect(parseFinal(expired)?.status).toBe("expired");
    // Something received: underpaid, never expired.
    expect(
      parseFinal({
        ...expired,
        received: DUE.toString(),
        lightning: [{ invoice: PAID_INVOICE, preimage: PAID.preimage }]
      })
    ).toBeNull();
    // An expired sale names no point.
    expect(parseFinal({ ...expired, point: { hour: HOUR, rate: RATE } })).toBeNull();
    expect(parseFinal({ ...expired, due: DUE.toString() })).toBeNull();
  });

  it("accepts an underpaid sale: the point of what was due, which the payments fall short of", () => {
    // 40,011 sats due at the point, 30,000 received on-chain.
    const onchain = {
      address: ONCHAIN_ADDRESS,
      transactions: [
        { txid: "cd".repeat(32), receivedAt: NOW * 1000, sats: "10000" },
        { txid: "ef".repeat(32), receivedAt: NOW * 1000 + 5000, sats: "20000" }
      ],
      sats: "30000"
    };
    const underpaid = { status: "underpaid", received: "30000", lightning: [], onchain };
    const address = { onchainAddress: ONCHAIN_ADDRESS };
    expect(parseFinal(underpaid, address)).toMatchObject({
      status: "underpaid",
      received: 30_000n,
      due: DUE,
      point: { hour: HOUR, rate: RATE },
      onchain: { sats: 30_000n, transactions: [{ sats: 10_000n }, { sats: 20_000n }] }
    });
    // Over Lightning alone: the rest paid, then the on-chain part spent elsewhere.
    const other = preimagePair(9);
    const rest = makeInvoice({
      amountMsat: 1_000_000n,
      paymentHash: other.paymentHash,
      timestamp: NOW,
      expirySeconds: 600
    });
    expect(
      parseFinal(
        {
          ...underpaid,
          received: "1000",
          lightning: [{ invoice: rest, preimage: other.preimage }],
          onchain: null
        },
        { onchainAddress: null }
      )
    ).toMatchObject({ status: "underpaid", received: 1000n, onchain: null });
    // What was due is the point's, and what was received falls short of it, without being nothing.
    expect(parseFinal({ ...underpaid, due: (DUE - 1n).toString() }, address)).toBeNull();
    expect(parseFinal({ ...underpaid, point: null, due: null }, address)).toBeNull();
    const enough = {
      ...onchain,
      transactions: [{ txid: "cd".repeat(32), receivedAt: NOW * 1000, sats: DUE.toString() }],
      sats: DUE.toString()
    };
    expect(
      parseFinal({ ...underpaid, received: DUE.toString(), onchain: enough }, address)
    ).toBeNull();
    expect(
      parseFinal({ ...underpaid, received: "0", onchain: null }, { onchainAddress: null })
    ).toBeNull();
  });

  it("refuses a payment without its proof, or sums that do not add up", () => {
    // Another preimage.
    expect(
      parseFinal({ lightning: [{ invoice: PAID_INVOICE, preimage: preimagePair(9).preimage }] })
    ).toBeNull();
    expect(
      parseFinal({ lightning: [{ invoice: PAID_INVOICE, preimage: PAID.preimage.toUpperCase() }] })
    ).toBeNull();
    // The same payment twice.
    expect(
      parseFinal({
        received: (DUE * 2n).toString(),
        lightning: [
          { invoice: PAID_INVOICE, preimage: PAID.preimage },
          { invoice: PAID_INVOICE, preimage: PAID.preimage }
        ]
      })
    ).toBeNull();
    // An invoice of another network.
    const testnet = makeInvoice({
      amountMsat: DUE * 1000n,
      paymentHash: PAID.paymentHash,
      network: "tb",
      timestamp: NOW
    });
    expect(parseFinal({ lightning: [{ invoice: testnet, preimage: PAID.preimage }] })).toBeNull();
    expect(parseFinal({ received: (DUE + 1n).toString() })).toBeNull();
    expect(parseFinal({ received: "-1" })).toBeNull();
    expect(parseFinal({ received: Number(DUE) })).toBeNull();
  });

  it("refuses an amount due that is not the point's, or not covered", () => {
    expect(parseFinal({ due: (DUE - 1n).toString() })).toBeNull();
    expect(parseFinal({ point: { hour: HOUR, rate: RATE + 1 } })).toBeNull();
    expect(parseFinal({ point: { hour: HOUR + 60, rate: RATE } })).toBeNull();
    expect(parseFinal({ point: { hour: HOUR, rate: -RATE } })).toBeNull();
    expect(parseFinal({ point: null })).toBeNull();
    // Paid with less than due.
    const cheaper = fiatToSats(2450, 2, RATE * 2);
    expect(
      parseFinal({ due: cheaper.toString(), point: { hour: HOUR, rate: RATE * 2 } })?.due
    ).toBe(cheaper);
    expect(
      parseFinal({
        due: DUE.toString(),
        point: { hour: HOUR, rate: RATE },
        received: "0",
        lightning: []
      })
    ).toBeNull();
  });

  it("leaves out an address nothing paid, keeps the one paid", () => {
    // The final version's address is the paid one's, or none.
    expect(parseFinal({}, { onchainAddress: ONCHAIN_ADDRESS })).toBeNull();
    const onchain = {
      address: ONCHAIN_ADDRESS,
      transactions: [{ txid: "cd".repeat(32), receivedAt: NOW * 1000, sats: DUE.toString() }],
      sats: DUE.toString()
    };
    expect(
      parseFinal({ lightning: [], onchain }, { onchainAddress: ONCHAIN_ADDRESS })?.onchain?.sats
    ).toBe(DUE);
    // The address's total is the sum of its transactions, each of a positive amount.
    for (const transactions of [
      [{ txid: "cd".repeat(32), receivedAt: NOW * 1000, sats: (DUE - 1n).toString() }],
      [{ txid: "cd".repeat(32), receivedAt: NOW * 1000 }],
      [
        { txid: "cd".repeat(32), receivedAt: NOW * 1000, sats: DUE.toString() },
        { txid: "ef".repeat(32), receivedAt: NOW * 1000, sats: "0" }
      ]
    ]) {
      expect(
        parseFinal(
          { lightning: [], onchain: { ...onchain, transactions } },
          { onchainAddress: ONCHAIN_ADDRESS }
        )
      ).toBeNull();
    }
    expect(parseFinal({ lightning: [], onchain }, { onchainAddress: null })).toBeNull();
    expect(
      parseFinal(
        { lightning: [], onchain: { ...onchain, address: taprootAddress(4) } },
        { onchainAddress: ONCHAIN_ADDRESS }
      )
    ).toBeNull();
    expect(
      parseFinal(
        { lightning: [], onchain: { ...onchain, transactions: [] } },
        { onchainAddress: ONCHAIN_ADDRESS }
      )
    ).toBeNull();
    expect(
      parseFinal(
        {
          lightning: [],
          onchain: {
            ...onchain,
            transactions: [{ txid: "CD".repeat(32), receivedAt: NOW, sats: DUE.toString() }]
          }
        },
        { onchainAddress: ONCHAIN_ADDRESS }
      )
    ).toBeNull();
  });

  it("accepts a sale paid on-chain short of what was due only when the business accepted it", () => {
    // 5 % short (the business's tolerance, which the final version never names), on-chain.
    const short = DUE - DUE / 20n;
    const onchain = {
      address: ONCHAIN_ADDRESS,
      transactions: [{ txid: "cd".repeat(32), receivedAt: NOW * 1000, sats: short.toString() }],
      sats: short.toString()
    };
    const accepted = {
      received: short.toString(),
      lightning: [],
      onchain,
      accepted: true
    };
    const address = { onchainAddress: ONCHAIN_ADDRESS };
    expect(parseFinal(accepted, address)).toMatchObject({
      status: "paid",
      received: short,
      due: DUE,
      accepted: true,
      onchain: { sats: short }
    });
    // Without it, paid with less than due is refused, as before.
    expect(parseFinal({ ...accepted, accepted: undefined }, address)).toBeNull();
    // `true` only, never false nor anything else.
    for (const value of [false, "true", 1, null]) {
      expect(parseFinal({ ...accepted, accepted: value }, address)).toBeNull();
    }
    // Only a paid sale's, short of what was due, something paid on-chain.
    expect(parseFinal({ accepted: true })).toBeNull();
    expect(parseFinal({ ...accepted, status: "underpaid" }, address)).toBeNull();
    const expired = { status: "expired", due: null, point: null, received: "0", lightning: [] };
    expect(parseFinal({ ...expired, accepted: true })).toBeNull();
    const other = preimagePair(9);
    const lightningOnly = makeInvoice({
      amountMsat: short * 1000n,
      paymentHash: other.paymentHash,
      timestamp: NOW,
      expirySeconds: 600
    });
    expect(
      parseFinal({
        received: short.toString(),
        lightning: [{ invoice: lightningOnly, preimage: other.preimage }],
        accepted: true
      })
    ).toBeNull();
    // A paid sale that received all it was due is not "accepted".
    expect(parseFinal({})?.accepted).toBe(false);
  });

  it("refuses a sale accepted short by more than the highest tolerance there is (10 %)", () => {
    const final = (sats: bigint) => ({
      received: sats.toString(),
      lightning: [],
      onchain: {
        address: ONCHAIN_ADDRESS,
        transactions: [{ txid: "cd".repeat(32), receivedAt: NOW * 1000, sats: sats.toString() }],
        sats: sats.toString()
      },
      accepted: true
    });
    const address = { onchainAddress: ONCHAIN_ADDRESS };
    // 10 % short, the sats missing rounded down: the least any tolerance accepts.
    const least = DUE - DUE / 10n;
    expect(least).toBe(leastAccepted(DUE, MAX_ONCHAIN_TOLERANCE));
    expect(parseFinal(final(least), address)).toMatchObject({ received: least, accepted: true });
    // A sat less, or a token payment: no tolerance accepts it.
    expect(parseFinal(final(least - 1n), address)).toBeNull();
    expect(parseFinal(final(1n), address)).toBeNull();
  });

  it('writes "accepted" only when the business accepted less than due', () => {
    const final = parseSaleFinal(paidFinal(AUTHOR), sale.fiat, null, "bc")!;
    expect(final.accepted).toBe(false);
    expect(finalPayload(final)).toEqual(paidFinal(AUTHOR));
    expect(finalPayload({ ...final, accepted: true })).toEqual({
      ...paidFinal(AUTHOR),
      accepted: true
    });
    // Nothing of the tolerance itself.
    expect(Object.keys(finalPayload({ ...final, accepted: true })).sort()).toEqual(
      [...Object.keys(paidFinal(AUTHOR)), "accepted"].sort()
    );
  });

  it("refuses a final version without its link's author", () => {
    expect(parseFinal({ link: undefined })).toBeNull();
    expect(parseFinal({ link: AUTHOR.toUpperCase() })).toBeNull();
    expect(parseFinal({ status: "settled" })).toBeNull();
  });
});

describe("getPaymentLinkOrigin", () => {
  function load(extra: object | null) {
    // A fresh module graph, so that the config reads this app config.
    jest.resetModules();
    jest.doMock("expo-constants", () => ({
      __esModule: true,
      default: { expoConfig: extra && { extra } }
    }));
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const config = require("../config/payment-links") as typeof import("../config/payment-links");
    return config.getPaymentLinkOrigin();
  }

  it("is the web app the app config names, none without one (production, no RP ID)", () => {
    expect(load({ appVariant: "staging", webAppOrigin: "https://web.example" })).toBe(
      "https://web.example"
    );
    expect(load({ appVariant: "staging" })).toBeNull();
    expect(load({ appVariant: "production" })).toBeNull();
    expect(load(null)).toBeNull();
  });

  it("takes nothing but an https origin", () => {
    for (const webAppOrigin of [
      "http://web.example",
      "https://web.example/",
      "https://web.example/pay",
      "https://web.example:8443",
      "https://Web.example",
      " https://web.example",
      42,
      null
    ]) {
      expect(load({ appVariant: "staging", webAppOrigin })).toBeNull();
    }
  });
});
