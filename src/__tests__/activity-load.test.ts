import { bytesToHex } from "@noble/hashes/utils.js";

import { DEFAULT_RELAYS } from "@/config/relays";
import { REMOVED_SEAT_GRACE_SECONDS } from "@/config/team";
import {
  loadMemberActivity,
  loadOwnerRecords,
  outcomeOf,
  readDeclarations,
  readOwnerRecords
} from "@/features/activity/load";
import { closeAccount } from "@/features/account/session";
import { linkedSalesOf, readTeamLinks, teamLinkHolders } from "@/features/activity/declared-links";
import { NO_SEATS } from "@/features/activity/takers";
import { TEAM_TIMEOUT_MS } from "@/lib/team/shared";
import { memberActivity, ownerActivity, removedKey } from "@/features/activity/model";
import { encodeWalletSecret } from "@/lib/breez/secret";
import type { WalletPayment } from "@/lib/breez/types";
import { deriveIntegrationKeys } from "@/lib/integrations/keys";
import { decodeBolt11 } from "@/lib/lightning/bolt11";
import type { Invoice } from "@/lib/lightning/lnurl";
import { publishToRelays } from "@/lib/nostr/pool";
import { finalPayload } from "@/lib/payment-link/final";
import {
  createPaymentLink,
  finalLinkEvent,
  ownerFinalLinkEvent,
  publishLinkEvent,
  PAYMENT_LINK_TIMEOUT_MS,
  publishPaymentLink
} from "@/lib/payment-link/link";
import { saleOwnerSecretKey } from "@/lib/payment-link/owner-key";
import { sealLinkKey } from "@/lib/payment-link/sealed-key";
import type { PaymentLinkPayload, SharedSale } from "@/lib/payment-link/payload";
import {
  SATS_CURRENCY,
  declarationEvent,
  declareInvoice,
  deriveSaleKeys,
  saleRegistry,
  takerTag
} from "@/lib/registry/registry";
import type { TeamMember } from "@/lib/team/roster";
import {
  deriveBusinessRegistry,
  deriveLinkOwner,
  deriveMemberKeys,
  deriveRegistryKey,
  deriveRegistryReader,
  deriveTeamKeys,
  integrationSecretKey,
  memberSecret,
  memberTakerKey,
  ownerDeviceSecret,
  ownerDevicesSecret,
  ownerTakerKey
} from "@/lib/team/keys";
import { saveMembership } from "@/lib/team/membership-store";
import { employeeSeat, integrationSeat } from "@/lib/team/roster";
import { linkEvent, profileEvent, publishMemberRecord, saleEvent } from "@/lib/team/member-records";

import { openTestAccount } from "../../jest/account";
import { makeInvoice, metadataHash, preimagePair } from "../../jest/lightning";
import { publishMember, publishRemoved } from "../../jest/roster";
import type * as RelaysFake from "../../jest/nostr-relays";

// Mainnet: invoices of "bc" (the app config has no network under Jest).
jest.mock("../lib/breez/config", () => ({
  ...jest.requireActual("../lib/breez/config"),
  getBreezNetwork: () => "mainnet"
}));

const relays = jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");

// A BIP-39 test mnemonic (all-zero entropy), never a real wallet's.
const MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const team = deriveTeamKeys(encodeWalletSecret({ mnemonic: MNEMONIC }));
/** Another BIP-39 test mnemonic (the "legal winner" vector), never a real wallet's. */
const OTHER_MNEMONIC =
  "legal winner thank year wave sausage worth useful legal winner thank yellow";
const MEMBER = "0123456789abcdef0123456789abcdef";
const INTEGRATION = "00112233445566778899aabbccddeeff";
const member: TeamMember = {
  id: MEMBER,
  name: "Alice",
  role: "employee",
  invitedAt: 1789990000
};
const memberKeys = deriveMemberKeys(memberSecret(team, MEMBER));
const ADDRESS = "sattleme02c6047f94@breez.tips";
const METADATA = `[["text/plain","Fine Bakery"],["text/identifier","${ADDRESS}"]]`;
const ORIGIN = "https://web.example";
/** 13:10:30 UTC: the sale starts, its invoice ends at 13:20:30. */
const START = Date.UTC(2026, 9, 3, 13, 10, 30) / 1000;
const END = START + 600;
const FIAT = { minor: 2450, digits: 2, currency: "CHF" };
const ALICE = { kind: "member", id: MEMBER, name: "Alice" } as const;

const payload: PaymentLinkPayload = {
  version: 3,
  businessName: "Fine Bakery",
  lightningAddress: ADDRESS,
  fiat: FIAT,
  note: "Table 4",
  onchainAddress: null,
  endsAt: END,
  registryKey: bytesToHex(deriveRegistryKey(team)),
  registryReader: deriveRegistryReader(team).publicKey,
  owner: deriveLinkOwner(team).publicKey
};

function invoice(n: number): Invoice {
  const { paymentHash } = preimagePair(n);
  const pr = makeInvoice({
    amountMsat: 49_000_000n,
    paymentHash,
    descriptionHash: metadataHash(METADATA),
    timestamp: START,
    expirySeconds: 600
  });
  return { pr, decoded: decodeBolt11(pr)!, verifyUrl: `https://breez.tips/verify/${paymentHash}` };
}

/**
 * An employee's sale shared as a link, as its device leaves it: the invoice declared, the sale
 * recorded (paid at `paidAt`), the link published (on `linkRelays`, its URL's) and recorded for the
 * owner.
 */
async function employeeSale(
  paidAt: number | null,
  linkPayload: PaymentLinkPayload = payload,
  linkRelays: readonly string[] = DEFAULT_RELAYS
) {
  const saleKey = new Uint8Array(32).fill(1);
  const shown = invoice(1);
  await declareInvoice(saleRegistry(deriveBusinessRegistry(team), saleKey), shown, {
    fiat: FIAT,
    note: "Table 4"
  });
  await publishMemberRecord(
    memberKeys,
    saleEvent(memberKeys, {
      version: 1,
      paymentHash: shown.decoded.paymentHash,
      sats: "49000",
      fiat: FIAT,
      note: "Table 4",
      verifyUrl: shown.verifyUrl,
      createdAt: START,
      expiresAt: END,
      paidAt,
      onchainAddress: null,
      onchainTag: null,
      sale: deriveSaleKeys(saleKey).nostr.publicKey
    }),
    DEFAULT_RELAYS
  );
  const link = createPaymentLink(linkPayload, ORIGIN, START + 30, saleKey, linkRelays);
  await publishPaymentLink(link);
  await publishMemberRecord(
    memberKeys,
    linkEvent(memberKeys, {
      version: 1,
      link: link.id,
      saleKey: bytesToHex(saleKey),
      createdAt: START + 30,
      onchainTag: null,
      relays: [...linkRelays],
      sealedKey: sealLinkKey(link.secretKey, deriveRegistryReader(team).publicKey)
    }),
    DEFAULT_RELAYS
  );
  return { link, shown, saleKey };
}

function walletPayment(shown: Invoice): WalletPayment {
  return {
    id: "p1",
    direction: "receive",
    status: "completed",
    amountSats: 49_000n,
    feeSats: 0n,
    timestamp: START + 120,
    network: "lightning",
    paymentHash: shown.decoded.paymentHash
  };
}

beforeEach(() => relays.resetRelays());

describe("the owner's activity, from the relays", () => {
  it("reads an employee's sale and link, and the registry ties the wallet's payment to them", async () => {
    const { link, shown, saleKey } = await employeeSale(START + 120);

    const records = await readOwnerRecords(team, [member], START + 200);
    expect(records.unread).toBe(0);
    expect(records.sales).toEqual([
      expect.objectContaining({
        paymentHash: shown.decoded.paymentHash,
        sats: 49_000n,
        // No profile published: her initials.
        by: { ...ALICE, avatar: null }
      })
    ]);
    const saleAuthor = deriveSaleKeys(saleKey).nostr.publicKey;
    expect(records.links).toEqual([
      expect.objectContaining({ id: link.id, saleAuthor, fiat: FIAT, endsAt: END, final: null })
    ]);

    const declarations = await readDeclarations(team, [shown.decoded.paymentHash]);
    expect(declarations?.get(shown.decoded.paymentHash)).toEqual([
      // Its point of sale's key marked nothing (an older app).
      { author: saleAuthor, fiat: FIAT, note: "Table 4", taker: null, key: saleKey }
    ]);

    // One row: the link, paid by the wallet's payment, taken by Alice.
    expect(
      ownerActivity({
        payments: [walletPayment(shown)],
        declarations,
        links: records.links,
        sales: records.sales,
        now: START + 200
      })
    ).toMatchObject([{ id: `link:${link.id}`, state: null, sats: 49_000n, by: ALICE }]);
  });

  it("reads the records as their authors on the account's connections, the registry and links on the anonymous ones", async () => {
    const { shown } = await employeeSale(START + 120);
    relays.calls.length = 0;

    await readOwnerRecords(team, [member], START + 200);
    await readDeclarations(team, [shown.decoded.paymentHash]);

    const channels = (
      named: (filter: NonNullable<(typeof relays.calls)[number]["filter"]>) => boolean
    ) =>
      new Set(
        relays.calls.filter(({ filter }) => filter && named(filter)).map(({ channel }) => channel)
      );
    // Alice's records and photo, read as her keys.
    expect(
      channels(({ authors }) => authors?.includes(memberKeys.nostr.publicKey) === true)
    ).toEqual(new Set(["account"]));
    // The registry's declarations (by address alone) and the link (by its address and author).
    expect(channels(({ authors, kinds }) => !authors && kinds?.includes(30078) === true)).toEqual(
      new Set(["anonymous"])
    );
    expect(relays.calls.some(({ channel }) => channel === "anonymous")).toBe(true);
    expect(relays.calls.every(({ channel }) => channel !== "single")).toBe(true);
  });

  it("names who took a sale from its declaration's mark, past the records' month", async () => {
    // Four sales, declared without any record (older than the records read): marked by one of
    // the owner's devices, by Alice, by an employee removed since, and with Alice's mark copied
    // onto another sale (its own key marks only the sale it was made for).
    const marks = [
      { n: 1, key: ownerTakerKey(ownerDevicesSecret(team)) },
      { n: 2, key: memberTakerKey(memberSecret(team, MEMBER)) },
      { n: 3, key: memberTakerKey(memberSecret(team, "fedcba9876543210fedcba9876543210")) }
    ];
    const hashes: string[] = [];
    for (const { n, key } of marks) {
      const sale = saleRegistry(deriveBusinessRegistry(team), new Uint8Array(32).fill(n));
      const shown = invoice(n);
      await declareInvoice(
        { ...sale, taker: takerTag(key, sale.saleKeys.nostr.publicKey) },
        shown,
        {
          fiat: FIAT,
          note: `Table ${n}`
        }
      );
      hashes.push(shown.decoded.paymentHash);
    }
    const aliceSale = saleRegistry(deriveBusinessRegistry(team), new Uint8Array(32).fill(2));
    const copied = saleRegistry(deriveBusinessRegistry(team), new Uint8Array(32).fill(4));
    await declareInvoice(
      {
        ...copied,
        taker: takerTag(marks[1]!.key, aliceSale.saleKeys.nostr.publicKey)
      },
      invoice(4),
      { fiat: FIAT, note: "Table 4" }
    );
    hashes.push(invoice(4).decoded.paymentHash);

    const declarations = await readDeclarations(team, hashes, {
      employees: [member],
      integrations: [],
      assistants: [],
      removed: []
    });
    expect(hashes.map((hash) => declarations?.get(hash)?.[0]?.taker ?? null)).toEqual([
      { kind: "you" },
      { kind: "member", id: MEMBER },
      null,
      null
    ]);
    // In "Wallet": "You", Alice with her name and photo. The two others nobody here
    // vouches for: a seat the roster does not hold, a mark copied from
    // another sale. They show as the wallet has them, without the amount and note their
    // declarations claim.
    const items = ownerActivity({
      payments: hashes.map((paymentHash, i) => ({
        ...walletPayment(invoice(i + 1)),
        id: `p${i + 1}`,
        paymentHash
      })),
      declarations,
      links: [],
      sales: [],
      members: new Map([[MEMBER, { ...ALICE, avatar: null }]]),
      now: START + 200
    });
    const byNote = new Map(items.map((item) => [item.note, item.by]));
    expect(byNote.get("Table 1")).toEqual({ kind: "you" });
    expect(byNote.get("Table 2")).toEqual({ ...ALICE, avatar: null });
    expect(byNote.has("Table 3")).toBe(false);
    expect(byNote.has("Table 4")).toBe(false);
    expect(
      items
        .filter((item) => item.id === "payment:p3" || item.id === "payment:p4")
        .map(({ source, fiat, note, by }) => ({ source, fiat, note, by }))
    ).toEqual([
      { source: "receive", fiat: null, note: "", by: null },
      { source: "receive", fiat: null, note: "", by: null }
    ]);

    // Once Alice is removed, her mark still names her (her record keeps her removal and her
    // name): her sale paid before her removal stays hers, one paid after it does
    // not.
    const removedAt = START + 120 + 60;
    const without = await readDeclarations(team, hashes, {
      employees: [],
      integrations: [],
      assistants: [],
      removed: [{ ...employeeSeat(member), removedAt }]
    });
    expect(without?.get(hashes[1]!)?.[0]?.taker).toEqual({ kind: "member", id: MEMBER });
    const alice = { kind: "member", id: MEMBER, name: "Alice" } as const;
    const aliceRow = (paidAt: number) =>
      ownerActivity({
        payments: [{ ...walletPayment(invoice(2)), timestamp: paidAt }],
        declarations: without,
        links: [],
        sales: [],
        removed: new Map([[removedKey("member", MEMBER), { removedAt, by: alice }]]),
        now: START + 200
      })[0];
    expect(aliceRow(START + 120)).toMatchObject({ note: "Table 2", fiat: FIAT, by: alice });
    // An invoice she showed before, paid just after (REMOVED_SEAT_GRACE_SECONDS): still hers.
    expect(aliceRow(removedAt + REMOVED_SEAT_GRACE_SECONDS)).toMatchObject({ note: "Table 2" });
    expect(aliceRow(removedAt + REMOVED_SEAT_GRACE_SECONDS + 1)).toMatchObject({
      source: "receive",
      note: "",
      fiat: null
    });
  });

  it("shows an integration's sale as its own, by its name", async () => {
    // Two sales of an integration's server (docs/integrations.md), marked with its secret key: one
    // in sats alone, its order's reference as its note; one with the price the integrator gave.
    const integration = {
      id: INTEGRATION,
      name: "Online shop",
      createdAt: START - 86_400,
      platform: "node"
    };
    const { takerKey } = deriveIntegrationKeys(integrationSecretKey(team, INTEGRATION));
    const declared = [
      { n: 1, fiat: { minor: 49_000, digits: 0, currency: SATS_CURRENCY }, note: "CMD-1042" },
      { n: 2, fiat: FIAT, note: "CMD-1043" }
    ];
    const hashes: string[] = [];
    for (const { n, fiat, note } of declared) {
      const sale = saleRegistry(deriveBusinessRegistry(team), new Uint8Array(32).fill(n));
      const shown = invoice(n);
      await declareInvoice(
        { ...sale, taker: takerTag(takerKey, sale.saleKeys.nostr.publicKey) },
        shown,
        {
          fiat,
          note
        }
      );
      hashes.push(shown.decoded.paymentHash);
    }

    const declarations = await readDeclarations(team, hashes, {
      employees: [member],
      integrations: [integration],
      assistants: [],
      removed: []
    });
    expect(hashes.map((hash) => declarations?.get(hash)?.[0]?.taker)).toEqual([
      { kind: "integration", id: INTEGRATION },
      { kind: "integration", id: INTEGRATION }
    ]);
    const by = { kind: "integration", id: INTEGRATION, name: "Online shop" } as const;
    const items = ownerActivity({
      payments: hashes.map((paymentHash, i) => ({
        ...walletPayment(invoice(i + 1)),
        id: `p${i + 1}`,
        paymentHash
      })),
      declarations,
      links: [],
      sales: [],
      members: new Map([[MEMBER, { ...ALICE, avatar: null }]]),
      integrations: new Map([[INTEGRATION, by]]),
      now: START + 200
    });
    const byNote = new Map(items.map((item) => [item.note, item]));
    // "Integration", by its name; in sats alone, its sats (shown at the current rate), never an
    // amount of a currency "SAT".
    expect(byNote.get("CMD-1042")).toMatchObject({
      source: "integration",
      by,
      fiat: null,
      sats: 49_000n,
      state: null
    });
    expect(byNote.get("CMD-1043")).toMatchObject({ source: "integration", by, fiat: FIAT });
    // Removed, its record keeping its removal and its name: its sales paid
    // before it stay its own ("Integration", by its name); one paid after it is the wallet's
    // payment alone, whatever its server, which still holds the registry key, declared.
    const removedAt = START + 3600;
    const removed = [{ ...integrationSeat(integration), removedAt }];
    const kept = await readDeclarations(team, hashes, {
      employees: [member],
      integrations: [],
      assistants: [],
      removed
    });
    expect(kept?.get(hashes[0]!)?.[0]?.taker).toEqual({ kind: "integration", id: INTEGRATION });
    const row = (paidAt: number, declarations: typeof kept) =>
      ownerActivity({
        payments: [{ ...walletPayment(invoice(2)), paymentHash: hashes[1]!, timestamp: paidAt }],
        declarations,
        links: [],
        sales: [],
        removed: new Map([[removedKey("integration", INTEGRATION), { removedAt, by }]]),
        now: START + 200
      })[0];
    expect(row(START + 120, kept)).toMatchObject({
      source: "integration",
      by,
      fiat: FIAT,
      note: "CMD-1043"
    });
    expect(row(removedAt + REMOVED_SEAT_GRACE_SECONDS + 1, kept)).toMatchObject({
      source: "receive",
      fiat: null,
      note: ""
    });
    // A seat the roster does not hold: its mark names nobody, nothing vouches for its sales.
    const forgotten = await readDeclarations(team, hashes, {
      employees: [member],
      integrations: [],
      assistants: [],
      removed: []
    });
    expect(forgotten?.get(hashes[0]!)?.[0]?.taker).toBeNull();
    expect(row(START + 120, forgotten)).toMatchObject({ source: "receive", fiat: null, note: "" });
  });

  it("dates each transaction of a final version in seconds, as the wallet's payments", () => {
    const TX = "ab".repeat(32);
    const final = {
      status: "paid",
      received: 49_000n,
      due: 49_000n,
      lightning: [],
      onchain: {
        address: "bc1p",
        transactions: [{ txid: TX, receivedAt: START * 1000 + 60_999, sats: 49_000n }],
        sats: 49_000n
      }
    };
    expect(outcomeOf({ final } as unknown as SharedSale)).toEqual({
      status: "paid",
      received: 49_000n,
      due: 49_000n,
      lightning: [],
      transactions: [TX],
      transactionsAt: new Map([[TX, START + 60]])
    });
    expect(outcomeOf({ final: null } as unknown as SharedSale)).toBeNull();
  });

  it("takes the link's final version, its own or the owner's", async () => {
    const { link, shown, saleKey } = await employeeSale(null);
    // The employee's device publishes the paid sale's final version.
    const final = finalPayload({
      status: "paid",
      received: 49_000n,
      due: 49_000n,
      point: { hour: START - (START % 3600), rate: 50_000 },
      lightning: [{ invoice: shown.pr, preimage: preimagePair(1).preimage }],
      onchain: null,
      link: link.id
    });
    await publishLinkEvent(finalLinkEvent(link, START + 30, final, START + 200), link.secretKey);
    const paid = await readOwnerRecords(team, [member], END + 10);
    expect(paid.links[0]?.final).toEqual({
      status: "paid",
      received: 49_000n,
      due: 49_000n,
      lightning: [shown.decoded.paymentHash],
      transactions: [],
      // Paid over Lightning: no transaction, no date of one.
      transactionsAt: new Map()
    });

    // Another sale's link, expired: only the owner's final version settles it.
    relays.resetRelays();
    const other = await employeeSale(null);
    const expired = finalPayload({
      status: "expired",
      received: 0n,
      due: null,
      point: null,
      lightning: [],
      onchain: null,
      link: other.link.id
    });
    const ownerSecret = deriveLinkOwner(team).secretKey;
    await publishToRelays(
      ownerFinalLinkEvent(ownerSecret, other.link.id, saleKey, payload, expired, END + 20_000),
      {
        relays: DEFAULT_RELAYS,
        channel: "account",
        timeoutMs: 1000,
        authKey: saleOwnerSecretKey(ownerSecret, saleKey)
      }
    );
    const settled = await readOwnerRecords(team, [member], END + 30_000);
    expect(settled.links.map((known) => [known.id, known.final?.status])).toEqual([
      [other.link.id, "expired"]
    ]);
  });

  it("takes the owner's final version of a link still payable: canceled before its end", async () => {
    const { link, saleKey } = await employeeSale(null);
    const canceled = finalPayload({
      status: "canceled",
      received: 0n,
      due: null,
      point: null,
      lightning: [],
      onchain: null,
      link: link.id
    });
    const ownerSecret = deriveLinkOwner(team).secretKey;
    await publishToRelays(
      ownerFinalLinkEvent(ownerSecret, link.id, saleKey, payload, canceled, START + 100),
      {
        relays: DEFAULT_RELAYS,
        channel: "account",
        timeoutMs: 1000,
        authKey: saleOwnerSecretKey(ownerSecret, saleKey)
      }
    );
    // Before its end (END): the owner's cancellation counts already, never "Open".
    const read = await readOwnerRecords(team, [member], START + 200);
    expect(read.links.map((known) => [known.id, known.final?.status])).toEqual([
      [link.id, "canceled"]
    ]);
    const rows = ownerActivity({
      payments: [],
      declarations: new Map(),
      links: read.links,
      sales: [],
      now: START + 200
    });
    expect(rows.find((item) => item.id === `link:${link.id}`)?.state).toBe("canceled");
  });

  it("keeps the link's own final version over the owner's, made however late", async () => {
    const { link, shown, saleKey } = await employeeSale(null);
    // A race: the employee's device settles the paid sale while the owner cancels it.
    const paid = finalPayload({
      status: "paid",
      received: 49_000n,
      due: 49_000n,
      point: { hour: START - (START % 3600), rate: 50_000 },
      lightning: [{ invoice: shown.pr, preimage: preimagePair(1).preimage }],
      onchain: null,
      link: link.id
    });
    await publishLinkEvent(finalLinkEvent(link, START + 30, paid, START + 150), link.secretKey);
    const canceled = finalPayload({
      status: "canceled",
      received: 0n,
      due: null,
      point: null,
      lightning: [],
      onchain: null,
      link: link.id
    });
    const ownerSecret = deriveLinkOwner(team).secretKey;
    await publishToRelays(
      ownerFinalLinkEvent(ownerSecret, link.id, saleKey, payload, canceled, START + 100),
      {
        relays: DEFAULT_RELAYS,
        channel: "account",
        timeoutMs: 1000,
        authKey: saleOwnerSecretKey(ownerSecret, saleKey)
      }
    );
    // Its owner's "canceled" is older: the payment its own final version proves still counts.
    const read = await readOwnerRecords(team, [member], START + 200);
    expect(read.links.map((known) => [known.id, known.final?.status])).toEqual([[link.id, "paid"]]);
  });

  it("reads a cancellation as provisional until its sale's time, then the owner's settlement over it", async () => {
    const { link, shown, saleKey } = await employeeSale(null);
    const ownerSecret = deriveLinkOwner(team).secretKey;
    const publishOwner = (final: Parameters<typeof finalPayload>[0], at: number) =>
      publishToRelays(
        ownerFinalLinkEvent(ownerSecret, link.id, saleKey, payload, finalPayload(final), at),
        {
          relays: DEFAULT_RELAYS,
          channel: "account",
          timeoutMs: 1000,
          authKey: saleOwnerSecretKey(ownerSecret, saleKey)
        }
      );
    await publishOwner(
      {
        status: "canceled",
        received: 0n,
        due: null,
        point: null,
        lightning: [],
        onchain: null,
        link: link.id
      },
      START + 100
    );
    let read = await readOwnerRecords(team, [member], START + 200);
    expect(read.links.map((known) => known.final)).toEqual([
      expect.objectContaining({ status: "canceled", provisional: true })
    ]);
    // The payer paid the invoice it kept: the owner's settlement replaces the cancellation.
    await publishOwner(
      {
        status: "paid",
        received: 49_000n,
        due: 49_000n,
        point: { hour: START - (START % 3600), rate: 50_000 },
        lightning: [{ invoice: shown.pr, preimage: preimagePair(1).preimage }],
        onchain: null,
        link: link.id
      },
      START + 300
    );
    read = await readOwnerRecords(team, [member], START + 400);
    expect(read.links.map((known) => known.final?.status)).toEqual(["paid"]);
    expect(read.links[0]?.final?.provisional).toBeUndefined();
  });

  it("reads each link on its own relays, those its record names", async () => {
    // A link made on a list of the business's own ("Settings"): none of the device's relays hold
    // it.
    const own = ["wss://relay.bakery.example"];
    const { link } = await employeeSale(START + 120, payload, own);
    for (const relay of DEFAULT_RELAYS) {
      expect(relays.stored.get(relay)?.some((event) => event.id === link.event.id) ?? false).toBe(
        false
      );
    }
    const read = await readOwnerRecords(team, [member], START + 200, ADDRESS);
    expect(read.links.map((known) => known.id)).toEqual([link.id]);
  });

  it("ties an open invoice to the sale its record names: a shared sale shows once", async () => {
    // The invoice still shown at the point of sale, its sale shared as a link meanwhile.
    const { link, shown, saleKey } = await employeeSale(null);
    const read = await readOwnerRecords(team, [member], START + 200);
    const saleAuthor = deriveSaleKeys(saleKey).nostr.publicKey;
    expect(read.sales).toEqual([
      expect.objectContaining({ paymentHash: shown.decoded.paymentHash, sale: saleAuthor })
    ]);
    expect(
      ownerActivity({
        payments: [],
        declarations: new Map(),
        links: read.links,
        sales: read.sales,
        now: START + 200
      }).map((item) => [item.id, item.state])
    ).toEqual([[`link:${link.id}`, "open"]]);
  });

  it("reads the owner's devices' sales too, and the employees' photos", async () => {
    const device = { id: "ffeeddccbbaa99887766554433221100", addedAt: START - 3600 };
    const deviceKeys = deriveMemberKeys(ownerDeviceSecret(team, device.id));
    const shown = invoice(2);
    // An invoice shown at one of the owner's devices, not paid yet.
    await publishMemberRecord(
      deviceKeys,
      saleEvent(deviceKeys, {
        version: 1,
        paymentHash: shown.decoded.paymentHash,
        sats: "12000",
        fiat: { minor: 600, digits: 2, currency: "CHF" },
        note: "",
        verifyUrl: shown.verifyUrl,
        createdAt: START + 60,
        expiresAt: START + 660,
        paidAt: null,
        onchainAddress: null,
        onchainTag: null,
        sale: deriveSaleKeys(new Uint8Array(32).fill(2)).nostr.publicKey
      }),
      DEFAULT_RELAYS
    );
    const photo = { key: "ab".repeat(32), hash: "cd".repeat(32) };
    await publishMemberRecord(
      memberKeys,
      profileEvent(memberKeys, { version: 1, avatar: photo, updatedAt: START }),
      DEFAULT_RELAYS
    );
    await employeeSale(START + 120);

    const read = await readOwnerRecords(team, [member], START + 200, null, [device]);
    expect(read.unread).toBe(0);
    expect(read.sales.map((sale) => [sale.paymentHash, sale.by])).toEqual(
      expect.arrayContaining([
        [shown.decoded.paymentHash, { kind: "you" }],
        [invoice(1).decoded.paymentHash, { ...ALICE, avatar: photo }]
      ])
    );
    // The team's employees as "By" shows them: a declaration's mark names one by id.
    expect([...read.members]).toEqual([[MEMBER, { ...ALICE, avatar: photo }]]);
    // The owner's open invoice: "Open", by "You".
    expect(
      ownerActivity({
        payments: [],
        declarations: new Map(),
        links: [],
        sales: read.sales,
        now: START + 200
      })
    ).toMatchObject([
      { id: `sale:${shown.decoded.paymentHash}`, state: "open", by: { kind: "you" } }
    ]);
  });

  it("leaves out an employee's link that names another business", async () => {
    // A modified app's link: another Lightning address, or another owner key (whose "owner's"
    // final versions anyone holding its secret could sign).
    await employeeSale(START + 120, { ...payload, lightningAddress: "thief@breez.tips" });
    expect((await readOwnerRecords(team, [member], START + 200, ADDRESS)).links).toEqual([]);
    relays.resetRelays();
    await employeeSale(START + 120, {
      ...payload,
      owner: deriveLinkOwner(deriveTeamKeys(encodeWalletSecret({ mnemonic: OTHER_MNEMONIC })))
        .publicKey
    });
    expect((await readOwnerRecords(team, [member], START + 200, ADDRESS)).links).toEqual([]);
  });
});

describe("the owner's records, a relay never answering", () => {
  /** The relay of the list that never answers: each call on it waits for its whole timeout. */
  const SILENT = DEFAULT_RELAYS[DEFAULT_RELAYS.length - 1]!;
  const devices = Array.from({ length: 20 }, (_, i) => ({
    id: i.toString(16).padStart(32, "0"),
    addedAt: START - 3600
  }));

  /** The invoice a point of sale shows, not paid yet, recorded as the app does. */
  async function openInvoice(keys: ReturnType<typeof deriveMemberKeys>, n: number) {
    const shown = invoice(n);
    await publishMemberRecord(
      keys,
      saleEvent(keys, {
        version: 1,
        paymentHash: shown.decoded.paymentHash,
        sats: "49000",
        fiat: FIAT,
        note: "",
        verifyUrl: shown.verifyUrl,
        createdAt: START + 60,
        expiresAt: START + 660,
        paidAt: null,
        onchainAddress: null,
        onchainTag: null,
        sale: deriveSaleKeys(new Uint8Array(32).fill(n)).nostr.publicKey
      }),
      DEFAULT_RELAYS
    );
    return shown.decoded.paymentHash;
  }

  const deviceKeysOf = (i: number) => deriveMemberKeys(ownerDeviceSecret(team, devices[i]!.id));

  /** From now on, SILENT never answers (its calls end at their timeout); fake timers. */
  function silence() {
    jest.useFakeTimers({ now: START * 1000 });
    const query = relays.queryEvents;
    const publish = relays.publishEvent;
    const hang = (options: { timeoutMs: number }) =>
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("no answer in time")), options.timeoutMs)
      );
    jest
      .spyOn(relays, "queryEvents")
      .mockImplementation((url, filter, options) =>
        url === SILENT ? hang(options) : query(url, filter, options)
      );
    jest
      .spyOn(relays, "publishEvent")
      .mockImplementation((url, event, options) =>
        url === SILENT ? hang(options) : publish(url, event, options)
      );
  }

  /** Whether `promise` settled within `ms` of fake time. */
  async function settlesWithin<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
    let value: T | undefined;
    let settled = false;
    void promise.then((result) => {
      value = result;
      settled = true;
    });
    await jest.advanceTimersByTimeAsync(ms);
    expect(settled).toBe(true);
    return value;
  }

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
    closeAccount();
  });

  it("reads every holder at once: one timeout, however many devices", async () => {
    const hash = await openInvoice(deviceKeysOf(17), 3);
    silence();
    const read = await settlesWithin(
      readOwnerRecords(team, [member], START + 200, null, devices),
      TEAM_TIMEOUT_MS.background + 1000
    );
    expect(read?.unread).toBe(0);
    expect(read?.sales.map((sale) => [sale.paymentHash, sale.by])).toEqual([
      [hash, { kind: "you" }]
    ]);
  });

  it("reads the records while the roster is read, then follows the roster read", async () => {
    await openTestAccount({ usage: "merchant", signUp: "done", devices });
    const erin: TeamMember = {
      id: "fedcba9876543210fedcba9876543210",
      name: "Erin",
      role: "employee",
      invitedAt: START - 7200
    };
    await publishMember(team, member);
    // A first read: this device knows the roster from then on.
    expect((await loadOwnerRecords(START + 200)).roster?.employees).toEqual([member]);
    const hash = await openInvoice(deviceKeysOf(5), 3);
    const alices = await openInvoice(memberKeys, 1);
    silence();
    // The roster and the records each wait for SILENT: read together, one timeout.
    const read = await settlesWithin(
      loadOwnerRecords(START + 200),
      TEAM_TIMEOUT_MS.background + 1000
    );
    expect(read?.sales.map((sale) => sale.paymentHash).sort()).toEqual([hash, alices].sort());

    // Alice removed, Erin added since: Alice's records are left out, Erin's read with the roster's.
    jest.useRealTimers();
    jest.restoreAllMocks();
    await publishRemoved(team, member, START + 150);
    await publishMember(team, erin);
    const erins = await openInvoice(deriveMemberKeys(memberSecret(team, erin.id)), 4);
    const after = await loadOwnerRecords(START + 200);
    expect(after.roster?.employees).toEqual([erin]);
    expect(after.sales.map((sale) => [sale.paymentHash, sale.by?.kind]).sort()).toEqual(
      [
        [hash, "you"],
        [erins, "member"]
      ].sort()
    );
    expect([...after.members.keys()]).toEqual([erin.id]);
  });

  it("leaves out an employee removed since the roster this device knew", async () => {
    await openTestAccount({ usage: "merchant", signUp: "done" });
    await publishMember(team, member);
    await loadOwnerRecords(START + 200);
    await openInvoice(memberKeys, 1);
    await publishRemoved(team, member, START + 150);
    const read = await loadOwnerRecords(START + 200);
    expect(read.roster?.employees).toEqual([]);
    expect(read.sales).toEqual([]);
    expect(read.links).toEqual([]);
    expect([...read.members]).toEqual([]);
  });

  it("asks the owner's final versions with the links: one timeout, not one more", async () => {
    // A link still payable: its owner's final version is asked too (a cancellation).
    const { link } = await employeeSale(null);
    silence();
    const read = await settlesWithin(
      readOwnerRecords(team, [member], START + 200),
      TEAM_TIMEOUT_MS.background + PAYMENT_LINK_TIMEOUT_MS + 1000
    );
    expect(read?.links.map((known) => [known.id, known.final])).toEqual([[link.id, null]]);
  });
});

describe("an employee's activity, from its own records", () => {
  it("reads its sales and links back, a sale paid through its link once", async () => {
    await saveMembership({
      version: 1,
      team: team.publicKey,
      secret: bytesToHex(memberSecret(team, MEMBER)),
      name: "Alice",
      deviceId: "00112233445566778899aabbccddeeff",
      joinedAt: START - 3600
    });
    const { link } = await employeeSale(START + 120);

    const data = await loadMemberActivity(START + 200);
    expect(data?.sales).toHaveLength(1);
    expect(data?.links.map((known) => known.id)).toEqual([link.id]);
    // Without its final version yet, the sale seen paid is the link's row: its record names the
    // link's sale.
    expect(data?.sales[0]?.sale).toBe(data?.links[0]?.saleAuthor);
    expect(memberActivity({ ...data!, now: START + 200 }).map((item) => item.source)).toEqual([
      "link"
    ]);
  });

  it("reads nothing on a device that is not an employee's", async () => {
    expect(await loadMemberActivity(START)).toBeNull();
  });
});

// A payment link's payer holds its sale's key, and can declare the
// sale's invoices again with another amount, note or mark. A link the team recorded tells the sale.
describe("the declarations of a sale the team shared as a link", () => {
  const seats = { ...NO_SEATS, employees: [member] };
  const holders = () => teamLinkHolders(team, seats, []);
  const business = { owner: deriveLinkOwner(team).publicKey, registryKey: deriveRegistryKey(team) };

  /** The payer declares `shown` again for the sale of `saleKey`, newer, as it likes. */
  async function payerDeclares(saleKey: Uint8Array, shown: Invoice) {
    const registry = saleRegistry(deriveBusinessRegistry(team), saleKey);
    await publishToRelays(
      declarationEvent(
        registry,
        shown,
        { fiat: { minor: 1, digits: 2, currency: "CHF" }, note: "Nothing" },
        Math.floor(Date.now() / 1000) + 60
      ),
      {
        relays: DEFAULT_RELAYS,
        channel: "anonymous",
        timeoutMs: 1000,
        authKey: registry.saleKeys.nostr.secretKey
      }
    );
  }

  it("tells the sale by its link, whatever its payer declared since", async () => {
    const { shown, saleKey } = await employeeSale(START + 120);
    await payerDeclares(saleKey, shown);
    const hash = shown.decoded.paymentHash;
    const author = deriveSaleKeys(saleKey).nostr.publicKey;

    // As declared, without the team's links: the payer's amount and note, nobody's.
    expect((await readDeclarations(team, [hash], seats))?.get(hash)).toEqual([
      expect.objectContaining({ author, fiat: { ...FIAT, minor: 1 }, note: "Nothing", taker: null })
    ]);
    // With them: the link's, by the employee who recorded it.
    expect((await readDeclarations(team, [hash], seats, holders()))?.get(hash)).toEqual([
      expect.objectContaining({
        author,
        fiat: FIAT,
        note: "Table 4",
        taker: { kind: "member", id: MEMBER }
      })
    ]);
  });

  it("leaves out a payment its link's final version did not count", async () => {
    const { link, shown, saleKey } = await employeeSale(START + 120);
    const final = finalPayload({
      status: "paid",
      received: 49_000n,
      due: 49_000n,
      point: { hour: START - (START % 3600), rate: 50_000 },
      lightning: [{ invoice: shown.pr, preimage: preimagePair(1).preimage }],
      onchain: null,
      link: link.id
    });
    await publishLinkEvent(finalLinkEvent(link, START + 30, final, START + 200), link.secretKey);
    // The payer declares another payment the business received for the same sale.
    const other = invoice(2);
    await payerDeclares(saleKey, other);
    const hashes = [shown.decoded.paymentHash, other.decoded.paymentHash];

    const found = await readDeclarations(team, hashes, seats, holders());
    expect(found?.get(shown.decoded.paymentHash)).toEqual([
      expect.objectContaining({ fiat: FIAT, note: "Table 4" })
    ]);
    expect(found?.get(other.decoded.paymentHash)).toEqual([]);
  });

  it("tells a sale never shared as it was declared", async () => {
    await employeeSale(START + 120);
    // A sale of the point of sale with no link: only its device held its key.
    const saleKey = new Uint8Array(32).fill(3);
    const shown = invoice(3);
    await declareInvoice(saleRegistry(deriveBusinessRegistry(team), saleKey), shown, {
      fiat: { ...FIAT, minor: 990 },
      note: "Counter"
    });
    const hash = shown.decoded.paymentHash;
    expect((await readDeclarations(team, [hash], seats, holders()))?.get(hash)).toEqual([
      expect.objectContaining({ fiat: { ...FIAT, minor: 990 }, note: "Counter", taker: null })
    ]);
  });

  it("reads the team's links from a majority of the relays, or tells nothing", async () => {
    await employeeSale(START + 120);
    const links = await readTeamLinks(holders());
    expect([...(links?.values() ?? [])].flat()).toEqual([
      expect.objectContaining({ taker: { kind: "member", id: MEMBER } })
    ]);
    for (const relay of DEFAULT_RELAYS.slice(0, 3)) relays.unreachable.add(relay);
    await expect(readTeamLinks(holders())).resolves.toBeNull();
  });

  it("is unread while a link's relays do not answer, unless none of them is the account's", async () => {
    const elsewhere = ["wss://link-a.example", "wss://link-b.example"];
    const { saleKey } = await employeeSale(START + 120, payload, elsewhere);
    const author = deriveSaleKeys(saleKey).nostr.publicKey;
    const links = (await readTeamLinks(holders()))!;

    expect((await linkedSalesOf(links, [author], "bc", business)).sales.get(author)).toEqual(
      expect.objectContaining({ fiat: FIAT, note: "Table 4" })
    );
    for (const relay of elsewhere) relays.unreachable.add(relay);
    // Nobody can open it: its declarations are read as they are.
    expect(await linkedSalesOf(links, [author], "bc", business)).toEqual({
      sales: new Map(),
      unread: new Set()
    });
    // On one of the account's relays: unread, asked again.
    expect(
      await linkedSalesOf(links, [author], "bc", business, [...DEFAULT_RELAYS, elsewhere[0]!])
    ).toEqual({ sales: new Map(), unread: new Set([author]) });
  });

  it("tells nothing from a link that names another business", async () => {
    const { saleKey } = await employeeSale(START + 120, {
      ...payload,
      owner: deriveLinkOwner(deriveTeamKeys(encodeWalletSecret({ mnemonic: OTHER_MNEMONIC })))
        .publicKey
    });
    const author = deriveSaleKeys(saleKey).nostr.publicKey;
    const links = (await readTeamLinks(holders()))!;
    expect(await linkedSalesOf(links, [author], "bc", business)).toEqual({
      sales: new Map(),
      unread: new Set()
    });
  });
});
