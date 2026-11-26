import { bytesToHex } from "@noble/hashes/utils.js";

import { MEMPOOL_API_URL } from "@/config/onchain";
import { DEFAULT_RELAYS } from "@/config/relays";
import { REMOVED_SEAT_GRACE_SECONDS } from "@/config/team";
import { FINAL_DELAY_SECONDS, type Settlement } from "@/features/terminal/useSale";
import {
  canceledFinal,
  finalizePendingLink,
  isProvisionalCancel
} from "@/features/payment-link/finalize";
import { nextLookWhenNotReady } from "@/features/payment-link/PendingLinksFinalizer";
import {
  OWNER_FINALS_MARGIN_SECONDS,
  findOwnerFinalJobs,
  linkHolders,
  publishOwnerFinal,
  settlingHolders
} from "@/features/payment-link/owner-finals";
import { cancelLink } from "@/features/team/cancel-links";
import { encodeWalletSecret } from "@/lib/breez/secret";
import { decodeBolt11 } from "@/lib/lightning/bolt11";
import type { Invoice } from "@/lib/lightning/lnurl";
import { sealRecord } from "@/lib/nostr/record";
import {
  createPaymentLink,
  fetchFinalVersion,
  fetchPaymentLink,
  finalLinkEvent,
  ownerFinalLinkEvent,
  publishLinkEvent,
  publishPaymentLink,
  saleLinkAddress,
  type PaymentLink
} from "@/lib/payment-link/link";
import { saleOwnerSecretKey } from "@/lib/payment-link/owner-key";
import type { PaymentLinkPayload } from "@/lib/payment-link/payload";
import { loadPendingLinks, pendingOf, savePendingLink } from "@/lib/payment-link/pending";
import { declareInvoice, saleRegistry } from "@/lib/registry/registry";
import { loadOnchainPool, saveOnchainPool } from "@/lib/terminal/profile";
import type { TeamMember } from "@/lib/team/roster";
import {
  deriveBusinessRegistry,
  deriveIssueKey,
  deriveLinkOwner,
  deriveMemberKeys,
  deriveRegistryKey,
  deriveRegistryReader,
  deriveTeamKeys,
  memberSecret
} from "@/lib/team/keys";
import { linkEvent, publishMemberRecord, saleEvent } from "@/lib/team/member-records";
import { issueTag } from "@/lib/team/onchain-lot";

import { taprootAddress } from "../../jest/bitcoin";
import { makeInvoice, metadataHash, preimagePair } from "../../jest/lightning";
import type * as MempoolFake from "../../jest/mempool";
import type * as RelaysFake from "../../jest/nostr-relays";

/** The relays of the links and of the team: the default list, the device's in these tests. */
const PAYMENT_LINK_RELAYS = DEFAULT_RELAYS;
const TEAM_RELAYS = DEFAULT_RELAYS;

// Mainnet: invoices of "bc" (the app config has no network under Jest).
jest.mock("../lib/breez/config", () => ({
  ...jest.requireActual("../lib/breez/config"),
  getBreezNetwork: () => "mainnet"
}));

// The in-memory relays and explorers of jest.setup.ts.
const relays = jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");
const mempool = jest.requireMock<typeof MempoolFake>("../lib/onchain/esplora");

// A BIP-39 test mnemonic (all-zero entropy), never a real wallet's.
const MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const team = deriveTeamKeys(encodeWalletSecret({ mnemonic: MNEMONIC }));
const MEMBER = "0123456789abcdef0123456789abcdef";
const member: TeamMember = {
  id: MEMBER,
  name: "Alice",
  role: "employee",
  invitedAt: 1789990000
};
const memberKeys = deriveMemberKeys(memberSecret(team, MEMBER));
/** Alice, the employee whose links the owner reads. */
const holders = linkHolders(team, [member], []);
const ADDRESS = "sattleme02c6047f94@breez.tips";
const METADATA = `[["text/plain","Fine Bakery"],["text/identifier","${ADDRESS}"]]`;
const ORIGIN = "https://web.example";
/** 13:10:30 UTC: the sale starts, its invoice ends at 13:20:30. */
const START = Date.UTC(2026, 9, 3, 13, 10, 30) / 1000;
const END = START + 600;
/** When the owner may publish: the employee's device had its 3 hours, and an hour more. */
const RIPE = END + FINAL_DELAY_SECONDS + OWNER_FINALS_MARGIN_SECONDS;
const FIAT = { minor: 2450, digits: 2, currency: "CHF" };

const business = deriveBusinessRegistry(team);
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
 * An employee's sale, as its device leaves it: its invoice declared and recorded as the employee's
 * sale, a link shared to the payer, and the link's record for the owner (its author, the sale's
 * key).
 */
async function employeeSale(
  saleByte = 1,
  n = 1,
  content: PaymentLinkPayload = payload,
  onchainTag: string | null = null,
  tolerance?: number
) {
  const saleKey = new Uint8Array(32).fill(saleByte);
  const shown = invoice(n);
  await declareInvoice(saleRegistry(business, saleKey), shown, { fiat: FIAT, note: "Table 4" });
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
      paidAt: null,
      onchainAddress: null,
      onchainTag: null,
      sale: "e1".repeat(32)
    }),
    TEAM_RELAYS
  );
  const link = createPaymentLink(content, ORIGIN, START + 30, saleKey);
  await publishPaymentLink(link);
  await publishMemberRecord(
    memberKeys,
    linkEvent(memberKeys, {
      version: 1,
      link: link.id,
      saleKey: bytesToHex(saleKey),
      createdAt: START + 30,
      onchainTag,
      ...(tolerance === undefined ? {} : { tolerance }),
      relays: [...DEFAULT_RELAYS],
      sealedKey: "A".repeat(200)
    }),
    TEAM_RELAYS
  );
  return { link, shown, saleKey };
}

/** The sale paid with its invoice, at the point of 13:00 (50 000 CHF/BTC). */
function paidSettlement(shown: Invoice, n = 1): Settlement {
  return {
    status: "paid",
    received: 49_000n,
    accepted: false,
    due: 49_000n,
    point: { hour: START - (START % 3600), rate: 50_000 },
    lightning: [{ invoice: shown, preimage: preimagePair(n).preimage }],
    onchain: null,
    finalFrom: END
  };
}

/**
 * The owner's cancellation of `link` ("Cancel the invoice", an employee's removal), dated `at`, as
 * cancel-links.ts publishes it.
 */
async function cancelAt(link: PaymentLink, at: number): Promise<void> {
  const ownerSecret = deriveLinkOwner(team).secretKey;
  await publishLinkEvent(
    ownerFinalLinkEvent(ownerSecret, link.id, link.key, link.payload, canceledFinal(link.id), at),
    saleOwnerSecretKey(ownerSecret, link.key)
  );
}

/** The final version a payer's page shows of `link`, once every relay answered. */
async function shownFinal(link: PaymentLink) {
  const better = jest.fn();
  const lookup = await fetchPaymentLink({ kind: "sale", author: link.id, key: link.key }, "bc", {
    onBetter: better
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  const last = better.mock.calls.at(-1)?.[0] ?? (lookup.status === "found" ? lookup.value : null);
  return last?.kind === "sale" ? last.sale.final : null;
}

/** Nothing received by the sale's end and its 3 hours. */
const EXPIRED: Settlement = {
  status: "expired",
  received: 0n,
  accepted: false,
  due: null,
  point: null,
  lightning: [],
  onchain: null,
  finalFrom: END + FINAL_DELAY_SECONDS
};

beforeEach(() => relays.resetRelays());

describe("the owner's final versions of the employees' links", () => {
  it("find the link an employee made by its record, once its device had its time", async () => {
    const { link, saleKey } = await employeeSale();

    // Its device may still publish: the owner waits.
    expect(await findOwnerFinalJobs(team, holders, ADDRESS, RIPE - 1)).toEqual([]);

    const jobs = await findOwnerFinalJobs(team, holders, ADDRESS, RIPE);
    expect(jobs).toHaveLength(1);
    expect(jobs?.[0]).toMatchObject({
      id: link.id,
      linkEvent: link.event,
      sale: { fiat: FIAT, note: "Table 4", endsAt: END, final: null }
    });
    expect(jobs?.[0].saleKey).toEqual(saleKey);
  });

  it("find the links of an employee removed within the year, made before its removal", async () => {
    const { link } = await employeeSale();
    // Removed a minute after the link: the owner still settles it (its removal no longer waits
    // for it, owner.ts removeEmployee).
    const removedAt = START + 90;
    const roster = {
      employees: [],
      assistants: [],
      removed: [
        { role: "employee" as const, id: MEMBER, name: "Alice", since: 1789990000, removedAt }
      ]
    };
    const [removed] = settlingHolders(team, roster, [], RIPE);
    expect(removed).toMatchObject({ id: MEMBER, until: removedAt + REMOVED_SEAT_GRACE_SECONDS });
    const jobs = await findOwnerFinalJobs(team, [removed!], ADDRESS, RIPE);
    expect(jobs?.map(({ id }) => id)).toEqual([link.id]);
    // A link recorded after its removal (and its grace) is not its own: whoever kept its keys.
    const late = await employeeSale(2, 2);
    const after = settlingHolders(
      team,
      {
        employees: [],
        assistants: [],
        removed: [{ ...roster.removed[0]!, removedAt: START - REMOVED_SEAT_GRACE_SECONDS - 1 }]
      },
      [],
      RIPE
    );
    expect(await findOwnerFinalJobs(team, after, ADDRESS, RIPE)).toEqual([]);
    expect(late.link.id).not.toBe(link.id);
    // Removed more than a year ago: no longer read.
    expect(
      settlingHolders(
        team,
        {
          employees: [],
          assistants: [],
          removed: [{ ...roster.removed[0]!, removedAt: RIPE - 366 * 24 * 3600 }]
        },
        [],
        RIPE
      )
    ).toEqual([]);
  });

  it("settle an employee's link with the tolerance its record names, none without", async () => {
    // Its device kept the sale's tolerance of on-chain underpayments in the link's record.
    const tolerant = await employeeSale(1, 1, payload, null, 500);
    const strict = await employeeSale(2, 2);
    // A record written with anything else than a tolerance: none.
    const odd = await employeeSale(3, 3, payload, null, 1500);
    const jobs = await findOwnerFinalJobs(team, holders, ADDRESS, RIPE);
    const toleranceOf = (id: string) => jobs?.find((job) => job.id === id)?.tolerance;
    expect(toleranceOf(tolerant.link.id)).toBe(500);
    expect(toleranceOf(strict.link.id)).toBe(0);
    expect(toleranceOf(odd.link.id)).toBe(0);
  });

  it("find a link whose sale still lasts, and settle it at once once paid in full", async () => {
    // A sale paid in full is settled at once, whatever its end (an
    // invoice's, months away). SaleSettler finds the unpaid ones pending.
    const { link, shown } = await employeeSale();
    const during = START + 120;
    const jobs = await findOwnerFinalJobs(team, holders, ADDRESS, during);
    expect(jobs?.map(({ id }) => id)).toEqual([link.id]);
    // Before its start (a clock behind the employee's), nothing can have paid it.
    expect(await findOwnerFinalJobs(team, holders, ADDRESS, START - 1)).toEqual([]);
    // Between its end and the 3 hours its device has, the owner still waits.
    expect(await findOwnerFinalJobs(team, holders, ADDRESS, END + 60)).toEqual([]);

    const settlement = { ...paidSettlement(shown), finalFrom: during };
    expect(await publishOwnerFinal(team, jobs![0]!, settlement, during)).toBe("published");
    expect(await findOwnerFinalJobs(team, holders, ADDRESS, during + 60)).toEqual([]);
  });

  it("publish the owner's final version with the link again, which the payer's page takes", async () => {
    const { link, shown } = await employeeSale();
    const [job] = (await findOwnerFinalJobs(team, holders, ADDRESS, RIPE))!;
    // Relays that dropped the link meanwhile get it again: it names the owner key.
    for (const relay of PAYMENT_LINK_RELAYS.slice(0, 4)) {
      relays.stored.set(
        relay,
        (relays.stored.get(relay) ?? []).filter((event) => event.id !== link.event.id)
      );
    }

    expect(await publishOwnerFinal(team, job, paidSettlement(shown), RIPE)).toBe("published");
    for (const relay of PAYMENT_LINK_RELAYS) {
      expect(relays.stored.get(relay)?.some((event) => event.id === link.event.id)).toBe(true);
    }
    const better = jest.fn();
    await fetchPaymentLink({ kind: "sale", author: link.id, key: link.key }, "bc", {
      onBetter: better
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(better.mock.calls[0]?.[0]).toMatchObject({
      kind: "sale",
      sale: { final: { status: "paid", link: link.id } }
    });
    // Done: nothing left to reconcile, and nothing published over it.
    expect(await findOwnerFinalJobs(team, holders, ADDRESS, RIPE)).toEqual([]);
    expect(await publishOwnerFinal(team, job, paidSettlement(shown), RIPE + 60)).toBe(
      "alreadyFinal"
    );
  });

  it("follow a link on the relays its record names, which may differ from the record's", async () => {
    // The link went to the relays its URL names; the employee's record of it to the account's.
    const own = ["wss://old-1.example.ch", "wss://old-2.example.ch", "wss://old-3.example.ch"];
    const saleKey = new Uint8Array(32).fill(7);
    const shown = invoice(7);
    await declareInvoice(saleRegistry(business, saleKey, own), shown, {
      fiat: FIAT,
      note: "Table 4"
    });
    const link = createPaymentLink(payload, ORIGIN, START + 30, saleKey, own);
    await publishPaymentLink(link);
    await publishMemberRecord(
      memberKeys,
      linkEvent(memberKeys, {
        version: 1,
        link: link.id,
        saleKey: bytesToHex(saleKey),
        createdAt: START + 30,
        onchainTag: null,
        relays: own,
        sealedKey: "A".repeat(200)
      }),
      TEAM_RELAYS
    );

    const jobs = await findOwnerFinalJobs(team, holders, ADDRESS, RIPE);
    expect(jobs).toHaveLength(1);
    const [job] = jobs!;
    expect(job).toMatchObject({ id: link.id, relays: own });

    // Its final version goes where the payer's page reads, the link's relays.
    expect(await publishOwnerFinal(team, job, paidSettlement(shown, 7), RIPE)).toBe("published");
    for (const relay of TEAM_RELAYS) {
      expect(relays.stored.get(relay)?.some((event) => event.id === link.event.id) ?? false).toBe(
        false
      );
    }
    const better = jest.fn();
    await fetchPaymentLink({ kind: "sale", author: link.id, key: link.key, relays: own }, "bc", {
      onBetter: better
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(better.mock.calls[0]?.[0]).toMatchObject({
      kind: "sale",
      sale: { final: { status: "paid", link: link.id } }
    });
    expect(await findOwnerFinalJobs(team, holders, ADDRESS, RIPE)).toEqual([]);
  });

  it("finalize the links of the owner's own devices too, never vouching for their addresses", async () => {
    const device = { id: "b".repeat(32), addedAt: START };
    const [, holder] = linkHolders(team, [member], [device]);
    const saleKey = new Uint8Array(32).fill(9);
    const shown = invoice(9);
    await declareInvoice(saleRegistry(business, saleKey), shown, { fiat: FIAT, note: "Table 4" });
    const link = createPaymentLink(payload, ORIGIN, START + 30, saleKey);
    await publishPaymentLink(link);
    await publishMemberRecord(
      holder!.keys,
      linkEvent(holder!.keys, {
        version: 1,
        link: link.id,
        saleKey: bytesToHex(saleKey),
        createdAt: START + 30,
        onchainTag: null,
        relays: [...PAYMENT_LINK_RELAYS],
        sealedKey: "A".repeat(200)
      }),
      TEAM_RELAYS
    );
    const jobs = await findOwnerFinalJobs(team, [holder!], ADDRESS, RIPE);
    expect(jobs).toEqual([
      expect.objectContaining({ id: link.id, onchainVerified: false, relays: PAYMENT_LINK_RELAYS })
    ]);
    expect(await publishOwnerFinal(team, jobs![0]!, paidSettlement(shown, 9), RIPE)).toBe(
      "published"
    );
  });

  it("leave a link the employee's device finalized alone", async () => {
    const { link, shown } = await employeeSale();
    const [job] = (await findOwnerFinalJobs(team, holders, ADDRESS, RIPE))!;
    // The employee's device came back meanwhile.
    const final = finalLinkEvent(link, link.event.created_at, {
      status: "paid",
      received: "49000",
      due: "49000",
      point: { hour: START - (START % 3600), rate: 50_000 },
      lightning: [{ invoice: shown.pr, preimage: preimagePair(1).preimage }],
      onchain: null,
      link: link.id
    });
    await publishLinkEvent(final, link.secretKey);

    expect(await findOwnerFinalJobs(team, holders, ADDRESS, RIPE)).toEqual([]);
    expect(await publishOwnerFinal(team, job, paidSettlement(shown), RIPE)).toBe("alreadyFinal");
  });

  it("never call canceled a link whose final version, its own or the owner's, says it was paid", async () => {
    // "Cancel the invoice" after its device settled it (a paid sale is settled at once).
    const own = await employeeSale(1, 1);
    await publishLinkEvent(
      finalLinkEvent(own.link, own.link.event.created_at, {
        status: "paid",
        received: "49000",
        due: "49000",
        point: { hour: START - (START % 3600), rate: 50_000 },
        lightning: [{ invoice: own.shown.pr, preimage: preimagePair(1).preimage }],
        onchain: null,
        link: own.link.id
      }),
      own.link.secretKey
    );
    const ref = (link: typeof own.link) => ({
      author: link.id,
      key: link.key,
      relays: PAYMENT_LINK_RELAYS
    });
    expect(await cancelLink(team, ref(own.link), RIPE)).toBe("received");

    // Paid, and settled by the owner.
    const settled = await employeeSale(2, 2);
    const [job] = (await findOwnerFinalJobs(team, holders, ADDRESS, RIPE))!;
    expect(await publishOwnerFinal(team, job!, paidSettlement(settled.shown, 2), RIPE)).toBe(
      "published"
    );
    expect(await cancelLink(team, ref(settled.link), RIPE)).toBe("received");
  });

  it("wait for an expired sale's 3 hours, and never publish an outcome the page would refuse", async () => {
    const { shown } = await employeeSale();
    const [job] = (await findOwnerFinalJobs(team, holders, ADDRESS, RIPE))!;
    const expired: Settlement = {
      status: "expired",
      received: 0n,
      accepted: false,
      due: null,
      point: null,
      lightning: [],
      onchain: null,
      finalFrom: RIPE + 60
    };
    expect(await publishOwnerFinal(team, job, expired, RIPE)).toBe("notReady");
    // Paid, said the settlement, with a payment that does not cover what was due.
    const short = { ...paidSettlement(shown), due: 50_000n };
    expect(await publishOwnerFinal(team, job, short, RIPE)).toBe("failed");
    expect(await publishOwnerFinal(team, job, expired, RIPE + 60)).toBe("published");
  });

  it("ask the relays for the links' authors only: others' events at an address never count", async () => {
    const { link, saleKey } = await employeeSale();
    // Whoever holds the link can publish at its address, under keys of its own: not asked for,
    // however many.
    for (const signer of [5, 6, 7]) {
      const forged = sealRecord({
        type: "payment-link",
        value: { ...payload, lightningAddress: "thief@example.com" },
        signer: new Uint8Array(32).fill(signer),
        encryptionKey: saleKey,
        address: saleLinkAddress(saleKey),
        createdAt: START + signer
      });
      await publishLinkEvent(forged, new Uint8Array(32).fill(signer));
    }
    // A link of another business recorded by mistake (another owner key): not the owner's to settle.
    await employeeSale(2, 2, { ...payload, owner: bytesToHex(new Uint8Array(32).fill(2)) });

    const jobs = await findOwnerFinalJobs(team, holders, ADDRESS, RIPE);
    expect(jobs?.map(({ id }) => id)).toEqual([link.id]);
  });

  it("vouch for an on-chain payment only to an address it gave the employee, by its tag", async () => {
    const onchainPaid = (shown: Invoice, address: string): Settlement => ({
      ...paidSettlement(shown, 4),
      lightning: [],
      onchain: {
        address,
        transactions: [{ txid: "11".repeat(32), receivedAt: START + 60, sats: 49_000n }],
        sats: 49_000n
      }
    });
    // An address of the employee's lot: its record of the link names it with the owner's tag.
    const given = taprootAddress(4);
    const tag = issueTag(deriveIssueKey(team), MEMBER, given);
    const { shown } = await employeeSale(4, 4, { ...payload, onchainAddress: given }, tag);
    // An address of its own, with a tag it made up, and another of the owner's tags.
    const own = taprootAddress(5);
    const forged = await employeeSale(5, 5, { ...payload, onchainAddress: own }, tag);
    const untagged = await employeeSale(6, 6, { ...payload, onchainAddress: taprootAddress(6) });

    const jobs = (await findOwnerFinalJobs(team, holders, ADDRESS, RIPE))!;
    const jobOf = (id: string) => jobs.find((job) => job.id === id)!;
    expect(jobs.map(({ onchainVerified }) => onchainVerified).sort()).toEqual([false, false, true]);
    const verified = jobs.find(({ onchainVerified }) => onchainVerified)!;
    expect(await publishOwnerFinal(team, verified, onchainPaid(shown, given), RIPE)).toBe(
      "published"
    );
    expect(
      await publishOwnerFinal(team, jobOf(forged.link.id), onchainPaid(forged.shown, own), RIPE)
    ).toBe("failed");
    expect(
      await publishOwnerFinal(
        team,
        jobOf(untagged.link.id),
        onchainPaid(untagged.shown, taprootAddress(6)),
        RIPE
      )
    ).toBe("failed");
    // Paid over Lightning, its address unpaid: no address to vouch for, the final version leaves it
    // out.
    expect(
      await publishOwnerFinal(
        team,
        jobOf(untagged.link.id),
        paidSettlement(untagged.shown, 6),
        RIPE
      )
    ).toBe("published");
    const better = jest.fn();
    await fetchPaymentLink(
      { kind: "sale", author: untagged.link.id, key: untagged.link.key },
      "bc",
      {
        onBetter: better
      }
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(better.mock.calls[0]?.[0]).toMatchObject({
      sale: { onchainAddress: null, final: { status: "paid", onchain: null } }
    });
  });

  it("find nothing for a sale without a link, and say when the relays cannot be read", async () => {
    const saleKey = new Uint8Array(32).fill(3);
    const shown = invoice(3);
    await declareInvoice(saleRegistry(business, saleKey), shown, { fiat: FIAT, note: "" });
    await publishMemberRecord(
      memberKeys,
      saleEvent(memberKeys, {
        version: 1,
        paymentHash: shown.decoded.paymentHash,
        sats: "49000",
        fiat: FIAT,
        note: "",
        verifyUrl: shown.verifyUrl,
        createdAt: START,
        expiresAt: END,
        paidAt: null,
        onchainAddress: null,
        onchainTag: null,
        sale: "e2".repeat(32)
      }),
      TEAM_RELAYS
    );
    expect(await findOwnerFinalJobs(team, holders, ADDRESS, RIPE)).toEqual([]);

    for (const relay of TEAM_RELAYS) relays.unreachable.add(relay);
    expect(await findOwnerFinalJobs(team, holders, ADDRESS, RIPE)).toBeNull();
  });
});

describe("a sale canceled, then paid all the same", () => {
  it("is settled by the owner over its cancellation, which a payer's page then shows", async () => {
    const { link, shown } = await employeeSale();
    // Canceled while it lasts; the payer had its invoice in its wallet, and pays it.
    await cancelAt(link, START + 60);
    expect(await shownFinal(link)).toMatchObject({ status: "canceled" });

    // An owner's final version does not end the reconciliation: it is a cancellation its sale's
    // settlement may still replace.
    const jobs = (await findOwnerFinalJobs(team, holders, ADDRESS, START + 120))!;
    expect(jobs.map(({ id }) => id)).toEqual([link.id]);
    const settlement = { ...paidSettlement(shown), finalFrom: START + 120 };
    // A relay out of reach keeps the cancellation: the settlement counts all the same.
    relays.unreachable.add(PAYMENT_LINK_RELAYS[0]!);
    expect(await publishOwnerFinal(team, jobs[0]!, settlement, START + 120)).toBe("published");
    relays.unreachable.clear();

    expect(await shownFinal(link)).toMatchObject({ status: "paid", received: 49_000n });
    expect(await findOwnerFinalJobs(team, holders, ADDRESS, START + 180)).toEqual([]);
    expect(await findOwnerFinalJobs(team, holders, ADDRESS, RIPE)).toEqual([]);
    // Nothing published over it, and "Cancel the invoice" says it was paid.
    expect(await publishOwnerFinal(team, jobs[0]!, settlement, START + 180)).toBe("alreadyFinal");
    const ref = { author: link.id, key: link.key, relays: PAYMENT_LINK_RELAYS };
    expect(await cancelLink(team, ref, START + 180)).toBe("received");
  });

  it("stays canceled when nothing came: for good once the sale's time is over", async () => {
    const { link } = await employeeSale();
    await cancelAt(link, START + 60);
    const [job] = (await findOwnerFinalJobs(team, holders, ADDRESS, RIPE))!;
    expect(job?.id).toBe(link.id);
    // A payment may still come until the sale's end and its 3 hours.
    expect(await publishOwnerFinal(team, job!, EXPIRED, END + 60)).toBe("notReady");

    expect(await publishOwnerFinal(team, job!, EXPIRED, RIPE)).toBe("published");
    const found = await fetchFinalVersion(link.id, link.key, payload.owner, "bc");
    expect(found?.final?.link).toMatchObject({ sale: { final: { status: "canceled" } } });
    expect(found?.final?.event.created_at).toBe(RIPE);
    expect(isProvisionalCancel(found!.final!)).toBe(false);
    expect(await shownFinal(link)).toMatchObject({ status: "canceled", received: 0n });
    expect(await findOwnerFinalJobs(team, holders, ADDRESS, RIPE + 60)).toEqual([]);
  });

  it("is done at once when canceled past the sale's time, or by a relay's newer copy", async () => {
    const late = await employeeSale(1, 1);
    await cancelAt(late.link, END + FINAL_DELAY_SECONDS);
    const early = await employeeSale(2, 2);
    await cancelAt(early.link, START + 60);
    // Its settlement for good reached the majority, a relay kept the cancellation it replaced.
    relays.unreachable.add(PAYMENT_LINK_RELAYS[0]!);
    await cancelAt(early.link, RIPE);
    relays.unreachable.clear();
    expect(await findOwnerFinalJobs(team, holders, ADDRESS, RIPE + 60)).toEqual([]);
  });

  it("is never settled by a link's own final version: its key may be a removed employee's", async () => {
    const { link, shown } = await employeeSale();
    await cancelAt(link, START + 60);
    await publishLinkEvent(
      finalLinkEvent(
        link,
        link.event.created_at,
        {
          status: "paid",
          received: "49000",
          due: "49000",
          point: { hour: START - (START % 3600), rate: 50_000 },
          lightning: [{ invoice: shown.pr, preimage: preimagePair(1).preimage }],
          onchain: null,
          link: link.id
        },
        START + 120
      ),
      link.secretKey
    );
    expect(await shownFinal(link)).toMatchObject({ status: "canceled" });
  });
});

describe("the device's final versions", () => {
  it("publish again a final version fewer than a majority took, then forget the link", async () => {
    const { link, shown } = await employeeSale();
    await savePendingLink(link);
    // A publication cut short: 2 relays of 5 took the final version.
    const final = finalLinkEvent(link, link.event.created_at, {
      status: "paid",
      received: "49000",
      due: "49000",
      point: { hour: START - (START % 3600), rate: 50_000 },
      lightning: [{ invoice: shown.pr, preimage: preimagePair(1).preimage }],
      onchain: null,
      link: link.id
    });
    for (const relay of PAYMENT_LINK_RELAYS.slice(2)) relays.unreachable.add(relay);
    await expect(publishLinkEvent(final, link.secretKey)).rejects.toThrow("Fewer than 3 relays");

    // Still out of reach: kept, to be tried again.
    expect(await finalizePendingLink(pendingOf(link), paidSettlement(shown), RIPE)).toBe("failed");
    expect(await loadPendingLinks("bc")).toHaveLength(1);

    relays.unreachable.clear();
    expect(await finalizePendingLink(pendingOf(link), paidSettlement(shown), RIPE)).toBe(
      "alreadyFinal"
    );
    // The same final version on every relay, nothing published over it.
    for (const relay of PAYMENT_LINK_RELAYS) {
      expect(
        relays.stored.get(relay)?.filter((event) => event.pubkey === link.event.pubkey)
      ).toEqual([final]);
    }
    expect(await loadPendingLinks("bc")).toEqual([]);
  });

  describe("the link's on-chain address", () => {
    const WALLET = "02c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5";
    const SHOWN = taprootAddress(1);
    const expired: Settlement = {
      status: "expired",
      received: 0n,
      accepted: false,
      due: null,
      point: null,
      lightning: [],
      onchain: null,
      finalFrom: END + FINAL_DELAY_SECONDS
    };

    /** An owner's sale shared with its address, and the device's pool once it was taken. */
    async function sharedSale() {
      const link = createPaymentLink(
        { ...payload, onchainAddress: SHOWN },
        ORIGIN,
        START + 30,
        new Uint8Array(32).fill(9)
      );
      await publishPaymentLink(link);
      await savePendingLink(link, { kind: "wallet", walletId: WALLET });
      await saveOnchainPool({ version: 1, walletId: WALLET, addresses: [taprootAddress(2)] });
      return link;
    }

    it("goes back to its wallet's pool once the explorer tells nothing paid it, and once only", async () => {
      const link = await sharedSale();
      const pending = (await loadPendingLinks("bc"))[0];
      expect(pending).toMatchObject({ id: link.id, pool: { kind: "wallet", walletId: WALLET } });

      // The explorer out of reach: the final version is published, the link kept.
      mempool.chain.down.add(MEMPOOL_API_URL);
      expect(await finalizePendingLink(pending, expired, RIPE)).toBe("failed");
      expect(await loadPendingLinks("bc")).toHaveLength(1);
      expect((await loadOnchainPool("mainnet"))?.addresses).toEqual([taprootAddress(2)]);

      // Back: the next attempt finds the final version there, and puts the address back, last.
      mempool.chain.down.clear();
      expect(await finalizePendingLink(pending, expired, RIPE)).toBe("alreadyFinal");
      expect(await loadPendingLinks("bc")).toEqual([]);
      expect((await loadOnchainPool("mainnet"))?.addresses).toEqual([taprootAddress(2), SHOWN]);

      // A sale took it again: a late call for the link never puts it back a second time.
      await saveOnchainPool({ version: 1, walletId: WALLET, addresses: [taprootAddress(2)] });
      expect(await finalizePendingLink(pending, expired, RIPE)).toBe("alreadyFinal");
      expect((await loadOnchainPool("mainnet"))?.addresses).toEqual([taprootAddress(2)]);
    });

    it("settles as the owner a payment its sale received after its cancellation", async () => {
      const link = await sharedSale();
      await cancelAt(link, START + 60);
      // The payer had copied the address before the cancellation.
      mempool.pay(SHOWN, 49_000n);
      const paid: Settlement = {
        ...paidSettlement(invoice(1)),
        lightning: [],
        onchain: {
          address: SHOWN,
          transactions: [
            { txid: "22".repeat(32), receivedAt: (START + 900) * 1000, sats: 49_000n }
          ],
          sats: 49_000n
        },
        finalFrom: START + 900
      };
      const [pending] = await loadPendingLinks("bc");
      // The owner's reconciliation never vouches for an address of its own devices': this device,
      // which gave it, settles it, signed as the owner.
      expect(await finalizePendingLink(pending!, paid, START + 900, team)).toBe("published");
      expect(await loadPendingLinks("bc")).toEqual([]);
      expect((await loadOnchainPool("mainnet"))?.addresses).toEqual([taprootAddress(2)]);
      expect(await shownFinal(link)).toMatchObject({
        status: "paid",
        onchain: { address: SHOWN, sats: 49_000n }
      });
    });

    it("looks again at a link waiting for the owner's settlement an hour later, not each round", () => {
      // Its outcome not final yet: once it is.
      expect(nextLookWhenNotReady(RIPE, END)).toBe(RIPE);
      // Final already, the owner's settlement awaited: an hour later.
      expect(nextLookWhenNotReady(END, RIPE)).toBe(RIPE + 3600);
    });

    it("keeps a canceled link and its address until the owner's settlement is there", async () => {
      const link = await sharedSale();
      await cancelAt(link, START + 60);
      const [pending] = await loadPendingLinks("bc");
      // No account open here (an employee's device, or locked): the owner settles it.
      expect(await finalizePendingLink(pending!, EXPIRED, RIPE, null)).toBe("notReady");
      expect(await loadPendingLinks("bc")).toHaveLength(1);
      expect((await loadOnchainPool("mainnet"))?.addresses).toEqual([taprootAddress(2)]);
      // Another account's: neither.
      const other = deriveTeamKeys(
        encodeWalletSecret({
          mnemonic: "legal winner thank year wave sausage worth useful legal winner thank yellow"
        })
      );
      expect(await finalizePendingLink(pending!, EXPIRED, RIPE, other)).toBe("notReady");

      // The owner's: canceled for good, and the address, which nothing paid, back to its pool.
      expect(await finalizePendingLink(pending!, EXPIRED, RIPE, team)).toBe("published");
      expect(await loadPendingLinks("bc")).toEqual([]);
      expect((await loadOnchainPool("mainnet"))?.addresses).toEqual([taprootAddress(2), SHOWN]);
      const found = await fetchFinalVersion(link.id, link.key, payload.owner, "bc");
      expect(found?.final && isProvisionalCancel(found.final)).toBe(false);
      expect(await shownFinal(link)).toMatchObject({ status: "canceled" });
    });

    it("stays used when a payment came since, or when the device holds another wallet's pool", async () => {
      await sharedSale();
      // A payer who kept the code paid it after the sale's final version.
      mempool.pay(SHOWN, 10_000n);
      const [pending] = await loadPendingLinks("bc");
      expect(await finalizePendingLink(pending, expired, RIPE)).toBe("published");
      expect(await loadPendingLinks("bc")).toEqual([]);
      expect((await loadOnchainPool("mainnet"))?.addresses).toEqual([taprootAddress(2)]);

      relays.resetRelays();
      mempool.resetMempool();
      await sharedSale();
      const other = { version: 1 as const, walletId: "03" + "ab".repeat(32), addresses: [] };
      await saveOnchainPool(other);
      const [again] = await loadPendingLinks("bc");
      expect(await finalizePendingLink(again, expired, RIPE)).toBe("published");
      expect(await loadOnchainPool("mainnet")).toEqual(other);
    });
  });
});
