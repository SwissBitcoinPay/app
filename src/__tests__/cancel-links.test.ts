import { bytesToHex } from "@noble/hashes/utils.js";

import { DEFAULT_RELAYS } from "@/config/relays";
import { linkHolders } from "@/features/payment-link/owner-finals";
import { cancelOpenLinks, type SettleSales } from "@/features/team/cancel-links";
import { findUnsettled } from "@/features/team/unsettled";
import type { Settlement } from "@/features/terminal/useSale";
import { encodeWalletSecret } from "@/lib/breez/secret";
import { decodeBolt11 } from "@/lib/lightning/bolt11";
import type { Invoice } from "@/lib/lightning/lnurl";
import { parseSaleFinal } from "@/lib/payment-link/final";
import {
  createPaymentLink,
  fetchFinalVersion,
  fetchPaymentLink,
  finalLinkEvent,
  publishLinkEvent,
  publishPaymentLink
} from "@/lib/payment-link/link";
import type { PaymentLinkPayload, SharedLink } from "@/lib/payment-link/payload";
import { nowUnix } from "@/lib/rates/snapshot";
import { declareInvoice, saleRegistry } from "@/lib/registry/registry";
import { setOpenAccountFormerMetadata } from "@/lib/settings/former-metadata";
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
import { linkEvent, publishMemberRecord } from "@/lib/team/member-records";
import { issueTag } from "@/lib/team/onchain-lot";

import { taprootAddress } from "../../jest/bitcoin";
import { makeInvoice, metadataHash, preimagePair } from "../../jest/lightning";
import type * as MempoolFake from "../../jest/mempool";
import type * as RelaysFake from "../../jest/nostr-relays";

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
const member: TeamMember = {
  id: "0123456789abcdef0123456789abcdef",
  name: "Alice",
  role: "employee",
  invitedAt: 1789990000
};
const memberKeys = deriveMemberKeys(memberSecret(team, member.id));
const [holder] = linkHolders(team, [member], []);
const ADDRESS = "sattleme02c6047f94@breez.tips";
const METADATA = `[["text/plain","Fine Bakery"],["text/identifier","${ADDRESS}"]]`;
const ORIGIN = "https://web.example";
/** 13:10:30 UTC: the sale starts, its invoice ends at 13:20:30. */
const START = Date.UTC(2026, 9, 3, 13, 10, 30) / 1000;
const END = START + 600;
/** While the sale lasts: the owner removes Alice then. */
const NOW = END - 60;
const FIAT = { minor: 2450, digits: 2, currency: "CHF" };
const ONCHAIN = taprootAddress(9);

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

/** The metadata the LNURL server serves now (the business renamed: another description). */
let served = METADATA;
/** The payment hashes the LNURL server says paid. */
const settled = new Set<string>();
/** The invoices the LNURL server made, by payment hash: its verify answers name them. */
const made = new Map<string, Invoice>();

/** The Breez LNURL server of the business's Lightning address, over a fake fetch. */
function lnurlServer() {
  jest.mocked(globalThis.fetch).mockImplementation(async (input) => {
    const url = new URL(String(input));
    const json = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;
    if (url.pathname === "/.well-known/lnurlp/sattleme02c6047f94") {
      return json({
        tag: "payRequest",
        callback: "https://breez.tips/lnurlp/sattleme02c6047f94/invoice",
        minSendable: 1000,
        maxSendable: 4_000_000_000,
        metadata: served,
        commentAllowed: 255
      });
    }
    if (!url.pathname.startsWith("/verify/")) throw new TypeError("Network failed");
    const hash = url.pathname.slice("/verify/".length);
    const shown = made.get(hash);
    const paid = settled.has(hash) && shown !== undefined;
    return json({
      status: "OK",
      settled: paid,
      preimage: paid ? preimagePair(Number(hashes.get(hash))).preimage : null,
      pr: shown?.pr
    });
  });
}
/** The test number of each invoice made, by payment hash. */
const hashes = new Map<string, number>();

/**
 * Alice's sale shared as a payment link, as her device leaves it: its invoice declared (made by the
 * LNURL server), the link published, and her record of it for the owner.
 */
async function employeeLink(
  saleByte: number,
  content: PaymentLinkPayload = payload,
  onchainTag: string | null = null
) {
  const saleKey = new Uint8Array(32).fill(saleByte);
  const shown = invoice(saleByte);
  made.set(shown.decoded.paymentHash, shown);
  hashes.set(shown.decoded.paymentHash, saleByte);
  await declareInvoice(saleRegistry(business, saleKey), shown, { fiat: FIAT, note: "Table 4" });
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
      relays: [...DEFAULT_RELAYS],
      sealedKey: "A".repeat(200)
    })
  );
  return { link, shown };
}

/** The sale paid with its invoice `shown` (made with preimage pair `n`), at the point of 13:00. */
function paidSettlement(shown: Invoice, n: number): Settlement {
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

/** The copy of a link a payer's page ends up with: its final version once a relay sends it. */
async function payerSees(link: { id: string; key: Uint8Array }): Promise<SharedLink | null> {
  let better: SharedLink | null = null;
  const found = await fetchPaymentLink({ kind: "sale", author: link.id, key: link.key }, "bc", {
    onBetter: (copy) => {
      better = copy;
    }
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  return better ?? (found.status === "found" ? found.value : null);
}

beforeEach(() => {
  relays.resetRelays();
  served = METADATA;
  setOpenAccountFormerMetadata([]);
  settled.clear();
  made.clear();
  hashes.clear();
  lnurlServer();
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

describe('the final version "canceled"', () => {
  const base = { received: "0", due: null, point: null, lightning: [], onchain: null };
  const link = "ab".repeat(32);

  it("is read for a sale that received nothing", () => {
    expect(parseSaleFinal({ status: "canceled", ...base, link }, FIAT, null, "bc")).toEqual({
      status: "canceled",
      received: 0n,
      due: null,
      point: null,
      lightning: [],
      onchain: null,
      link,
      accepted: false
    });
  });

  it("is refused with anything received or due", () => {
    expect(
      parseSaleFinal({ status: "canceled", ...base, received: "10", link }, FIAT, null, "bc")
    ).toBeNull();
    expect(
      parseSaleFinal({ status: "canceled", ...base, due: "49000", link }, FIAT, null, "bc")
    ).toBeNull();
  });
});

describe("canceling an employee's payment links", () => {
  it("cancels a link that received nothing: its payer's page shows it canceled", async () => {
    const { link } = await employeeLink(1);
    await expect(findUnsettled(team, [holder!], { thisDevice: false }, NOW)).resolves.toMatchObject(
      { links: 1 }
    );

    await expect(cancelOpenLinks(team, holder!, { now: NOW })).resolves.toBe("canceled");

    expect(await payerSees(link)).toMatchObject({
      kind: "sale",
      sale: { final: { status: "canceled", received: 0n, link: link.id }, onchainAddress: null }
    });
    // The owner's final version, on a majority of the link's relays: final for the removal.
    const found = await fetchFinalVersion(link.id, link.key, payload.owner, "bc");
    expect(found?.holders.length).toBe(DEFAULT_RELAYS.length);
    await expect(findUnsettled(team, [holder!], { thisDevice: false }, NOW)).resolves.toMatchObject(
      { links: 0 }
    );
  });

  it("cancels nothing when a link was paid under the business's former name", async () => {
    const { shown } = await employeeLink(2);
    settled.add(shown.decoded.paymentHash);
    // Renamed since (address-description.ts): the server serves the new name's metadata.
    served = `[["text/plain","Lakeside Bakery"],["text/identifier","${ADDRESS}"]]`;
    // The owner's settings keep the former metadata: the paid invoice is still the business's.
    setOpenAccountFormerMetadata([METADATA]);
    await expect(cancelOpenLinks(team, holder!, { now: NOW })).resolves.toBe("received");
  });

  it("cancels nothing when one of the links was paid over Lightning", async () => {
    const { link: unpaid } = await employeeLink(1);
    const { link: paid, shown } = await employeeLink(2);
    settled.add(shown.decoded.paymentHash);

    await expect(cancelOpenLinks(team, holder!, { now: NOW })).resolves.toBe("received");

    for (const link of [unpaid, paid]) {
      expect(await payerSees(link)).toMatchObject({ kind: "sale", sale: { final: null } });
    }
  });

  it("finalizes a link paid over Lightning once its sale is settled, then cancels the others", async () => {
    const { link: unpaid } = await employeeLink(1);
    const { link: paid, shown } = await employeeLink(2);
    settled.add(shown.decoded.paymentHash);
    const settle = jest.fn<ReturnType<SettleSales>, Parameters<SettleSales>>(async (jobs) =>
      jobs.map(() => paidSettlement(shown, 2))
    );

    await expect(
      cancelOpenLinks(team, holder!, { now: NOW, settle, lightningAddress: ADDRESS })
    ).resolves.toBe("canceled");

    // Only the link that received a payment is followed.
    expect(settle).toHaveBeenCalledTimes(1);
    expect(settle.mock.calls[0]![0].map(({ id }) => id)).toEqual([paid.id]);
    expect(await payerSees(paid)).toMatchObject({
      kind: "sale",
      sale: { final: { status: "paid", received: 49_000n, link: paid.id } }
    });
    expect(await payerSees(unpaid)).toMatchObject({
      kind: "sale",
      sale: { final: { status: "canceled" } }
    });
    await expect(findUnsettled(team, [holder!], { thisDevice: false }, NOW)).resolves.toMatchObject(
      { links: 0 }
    );
  });

  it("cancels nothing while a paid sale's outcome is not final yet", async () => {
    const { link: unpaid } = await employeeLink(1);
    const { link: paid, shown } = await employeeLink(2);
    settled.add(shown.decoded.paymentHash);
    // Underpaid: final 3 hours after its end only.
    const underpaid: Settlement = {
      ...paidSettlement(shown, 2),
      status: "underpaid",
      due: 60_000n,
      finalFrom: nowUnix() + 3600
    };

    await expect(
      cancelOpenLinks(team, holder!, {
        now: NOW,
        settle: async () => [underpaid],
        lightningAddress: ADDRESS
      })
    ).resolves.toBe("received");
    // Not settled in time either.
    await expect(
      cancelOpenLinks(team, holder!, {
        now: NOW,
        settle: async () => [null],
        lightningAddress: ADDRESS
      })
    ).resolves.toBe("received");

    for (const link of [unpaid, paid]) {
      expect(await payerSees(link)).toMatchObject({ kind: "sale", sale: { final: null } });
    }
  });

  it("never finalizes a paid link of another Lightning address than the business's", async () => {
    const { link: paid, shown } = await employeeLink(2);
    settled.add(shown.decoded.paymentHash);
    const settle: SettleSales = async (jobs) => jobs.map(() => paidSettlement(shown, 2));

    await expect(
      cancelOpenLinks(team, holder!, { now: NOW, settle, lightningAddress: "other@breez.tips" })
    ).resolves.toBe("received");
    // No business address known: the owner vouches for nothing.
    await expect(cancelOpenLinks(team, holder!, { now: NOW, settle })).resolves.toBe("received");
    expect(await payerSees(paid)).toMatchObject({ kind: "sale", sale: { final: null } });
  });

  it("finalizes an on-chain payment only to an address it gave the employee", async () => {
    const tagged = taprootAddress(10);
    const { link: issued } = await employeeLink(
      3,
      { ...payload, onchainAddress: tagged },
      issueTag(deriveIssueKey(team), member.id, tagged)
    );
    const { link: foreign } = await employeeLink(4, { ...payload, onchainAddress: ONCHAIN });
    const onchainPaid = (address: string): Settlement => {
      const txid = mempool.pay(address, 49_000n);
      return {
        ...paidSettlement(invoice(3), 3),
        lightning: [],
        onchain: {
          address,
          transactions: [{ txid, receivedAt: START * 1000 + 60_000, sats: 49_000n }],
          sats: 49_000n
        }
      };
    };
    const settlements = new Map([
      [issued.id, onchainPaid(tagged)],
      [foreign.id, onchainPaid(ONCHAIN)]
    ]);

    // The foreign address: its record names no tag of the owner's, the employee's device publishes
    // that version itself. Nothing is canceled, the issued one is finalized all the same.
    await expect(
      cancelOpenLinks(team, holder!, {
        now: NOW,
        settle: async (jobs) => jobs.map(({ id }) => settlements.get(id) ?? null),
        lightningAddress: ADDRESS
      })
    ).resolves.toBe("received");
    expect(await payerSees(issued)).toMatchObject({
      kind: "sale",
      sale: { final: { status: "paid", onchain: { address: tagged } } }
    });
    expect(await payerSees(foreign)).toMatchObject({ kind: "sale", sale: { final: null } });
  });

  it("cancels nothing when the link's on-chain address was paid", async () => {
    const { link } = await employeeLink(3, { ...payload, onchainAddress: ONCHAIN });
    mempool.pay(ONCHAIN, 20_000n);

    await expect(cancelOpenLinks(team, holder!, { now: NOW })).resolves.toBe("received");
    expect(await payerSees(link)).toMatchObject({ kind: "sale", sale: { final: null } });
  });

  it("cancels a link whose on-chain address nothing paid, leaving the address out", async () => {
    const { link } = await employeeLink(4, { ...payload, onchainAddress: ONCHAIN });

    await expect(cancelOpenLinks(team, holder!, { now: NOW })).resolves.toBe("canceled");
    expect(await payerSees(link)).toMatchObject({
      kind: "sale",
      sale: { final: { status: "canceled", onchain: null }, onchainAddress: null }
    });
  });

  it("cancels nothing while the LNURL server cannot tell whether an invoice was paid", async () => {
    const { link } = await employeeLink(5);
    jest.mocked(globalThis.fetch).mockRejectedValue(new TypeError("Network failed"));

    await expect(cancelOpenLinks(team, holder!, { now: NOW })).resolves.toBe("unreachable");
    expect(await payerSees(link)).toMatchObject({ kind: "sale", sale: { final: null } });
  });

  it("cancels nothing while the relays do not answer", async () => {
    await employeeLink(6);
    for (const relay of DEFAULT_RELAYS) relays.unreachable.add(relay);
    await expect(cancelOpenLinks(team, holder!, { now: NOW })).resolves.toBe("unreachable");
  });

  it("leaves a link its device made final meanwhile as it is", async () => {
    const { link } = await employeeLink(7);
    await publishLinkEvent(
      finalLinkEvent(link, link.event.created_at, {
        status: "expired",
        received: "0",
        due: null,
        point: null,
        lightning: [],
        onchain: null,
        link: link.id
      }),
      link.secretKey
    );

    await expect(cancelOpenLinks(team, holder!, { now: NOW })).resolves.toBe("canceled");
    expect(await payerSees(link)).toMatchObject({
      kind: "sale",
      sale: { final: { status: "expired" } }
    });
  });
});
