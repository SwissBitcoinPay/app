import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";

import { DEFAULT_RELAYS } from "@/config/relays";
import { acceptanceTexts } from "@/features/activity/AcceptAction";
import {
  AcceptanceError,
  acceptBlockOf,
  acceptRow,
  acceptanceAmounts,
  acceptanceKey,
  acceptanceOf,
  acceptanceTargets,
  applyAcceptances,
  readAcceptances,
  subscribeAcceptances,
  type AcceptTarget
} from "@/features/activity/acceptance";
import { paidSign } from "@/features/activity/format";
import { ownerActivity, type ActivityItem, type DeclaredSale } from "@/features/activity/model";
import { encodeWalletSecret } from "@/lib/breez/secret";
import { formatInteger } from "@/lib/locale/format";
import type { WalletPayment } from "@/lib/breez/types";
import { deriveIntegrationKeys } from "@/lib/integrations/keys";
import * as lateAcceptance from "@/lib/integrations/late-acceptance";
import {
  lateAcceptanceAddress,
  lateAcceptanceEvent,
  publishLateAcceptance
} from "@/lib/integrations/late-acceptance";
import {
  ACCEPTANCE_CLOCK_MARGIN_SECONDS,
  ACCEPTANCE_REQUEST_MAX_MS,
  openOrderAcceptance,
  orderAcceptanceEvent,
  publishOrderAcceptance,
  type AcceptedInvoice
} from "@/lib/integrations/onchain-acceptance";
import { saleOwnerSecretKey } from "@/lib/payment-link/owner-key";
import { deriveSaleKeys } from "@/lib/registry/registry";
import { publishSaleAcceptance, saleAcceptanceEvent } from "@/lib/registry/sale-acceptance";
import {
  deriveLateAcceptanceKeys,
  deriveLinkOwner,
  deriveMemberKeys,
  deriveTeamKeys,
  integrationSecretKey,
  memberSecret
} from "@/lib/team/keys";
import { memberRecordsOf, saleEvent } from "@/lib/team/member-records";

import { waitFor } from "@testing-library/react-native";

import { TEST_MNEMONIC } from "../../jest/account";
import { taprootAddress } from "../../jest/bitcoin";
import type * as RelaysFake from "../../jest/nostr-relays";

/*
 * The owner's acceptance of a sale paid short in "Wallet" (src/features/activity/acceptance.ts):
 * which rows are read, what an acceptance makes of them, what the owner may accept, and its
 * publication, read back as every reader reads it.
 */

const relays = jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");

const team = deriveTeamKeys(encodeWalletSecret({ mnemonic: TEST_MNEMONIC }));
const owner = deriveLinkOwner(team);
const NOW = 1_793_000_000;
const CHF = (minor: number) => ({ minor, digits: 2, currency: "CHF" });
const INTEGRATION = "0123456789abcdef0123456789abcdef";

/** A sale's own key, and its registry identity. */
const saleKeyOf = (fill: number) => new Uint8Array(32).fill(fill);
const authorOf = (key: Uint8Array) => deriveSaleKeys(key).nostr.publicKey;

function deposit(txid: string, sats: bigint, status: WalletPayment["status"] = "completed") {
  return {
    id: `d-${txid}`,
    direction: "receive",
    status,
    amountSats: sats,
    feeSats: 0n,
    timestamp: NOW - 600,
    network: "bitcoin",
    txId: txid
  } satisfies WalletPayment;
}

/** A row of a sale of the point of sale "Underpaid": 30 000 of 49 000 sats, 5,00 CHF. */
function underpaidRow(target: AcceptTarget, payments: WalletPayment[] = []): ActivityItem {
  return {
    id: "sale:x",
    source: "pos",
    timestamp: NOW - 600,
    note: "Table 4",
    fiat: CHF(500),
    sats: 30_000n,
    state: "underpaid",
    rest: { sats: 19_000n, minor: 194 },
    by: { kind: "you" },
    payments,
    link: null,
    acceptTarget: target
  };
}

const saleTarget = (fill: number): AcceptTarget => ({
  kind: "sale",
  saleKey: saleKeyOf(fill),
  relays: null
});

beforeEach(() => relays.resetRelays());

describe("applyAcceptances", () => {
  const target = saleTarget(1);
  const key = acceptanceKey(target);
  const accepted = { received: 30_000n, due: 49_000n, at: NOW - 60 };

  it("leaves the rows as they are while nothing is read: the same list", () => {
    const items = [underpaidRow(target)];
    expect(applyAcceptances(items, new Map())).toBe(items);
    expect(applyAcceptances(items, new Map([["sale:other", { kind: "none" as const }]]))).toBe(
      items
    );
  });

  it("tells a row read without acceptance, which the owner may accept", () => {
    const [row] = applyAcceptances([underpaidRow(target)], new Map([[key, { kind: "none" }]]));
    expect(row).toMatchObject({ state: "underpaid", acceptance: { status: "none" } });
  });

  it("pays a row accepted at what it received, its amount its share of the sale's", () => {
    const [row] = applyAcceptances(
      [underpaidRow(target, [deposit("aa".repeat(32), 30_000n)])],
      new Map([[key, { kind: "accepted", acceptance: accepted }]])
    );
    expect(row).toMatchObject({
      state: null,
      rest: null,
      sats: 30_000n,
      // 30 000 of 49 000 sats of 5,00 CHF: 3,06 CHF (splitFiat, never a rate of today).
      fiat: CHF(306),
      acceptance: { status: "accepted", ...accepted, fiat: CHF(500) }
    });
  });

  it('keeps it "Confirming" while its sats are not all in the balance', () => {
    const [pending] = applyAcceptances(
      [underpaidRow(target, [deposit("aa".repeat(32), 30_000n, "pending")])],
      new Map([[key, { kind: "accepted", acceptance: accepted }]])
    );
    expect(pending?.state).toBe("unconfirmed");
    // Nothing of the wallet's yet (a deposit not listed): never "Paid" on the owner's word.
    const [unlisted] = applyAcceptances(
      [underpaidRow(target)],
      new Map([[key, { kind: "accepted", acceptance: accepted }]])
    );
    expect(unlisted?.state).toBe("unconfirmed");
    // And never says more of its credit than the row said.
    expect(unlisted?.pendingCredit).toBeUndefined();
  });

  it("pays it in an employee's list, which has no wallet to wait for", () => {
    const [row] = applyAcceptances(
      [underpaidRow(target)],
      new Map([[key, { kind: "accepted", acceptance: accepted }]]),
      { wallet: false }
    );
    expect(row).toMatchObject({ state: null, rest: null, fiat: CHF(306) });
  });

  it("keeps a row underpaid when what it received fell below what was accepted (RBF)", () => {
    const [row] = applyAcceptances(
      [{ ...underpaidRow(target), sats: 29_999n }],
      new Map([[key, { kind: "accepted", acceptance: accepted }]])
    );
    expect(row).toMatchObject({
      state: "underpaid",
      acceptance: { status: "unmet", received: 30_000n }
    });
    // Accepted already: never offered again.
    expect(acceptanceOf(row!, NOW)).toBeNull();
  });

  it("leaves one of a newer format to a newer app, and rows that are not underpaid alone", () => {
    const [newer] = applyAcceptances([underpaidRow(target)], new Map([[key, { kind: "newer" }]]));
    expect(newer?.acceptance).toEqual({ status: "newer" });
    expect(acceptanceOf(newer!, NOW)).toBeNull();
    const paid = { ...underpaidRow(target), state: null, rest: null };
    const reads = new Map([[key, { kind: "accepted" as const, acceptance: accepted }]]);
    expect(applyAcceptances([paid], reads)[0]).toBe(paid);
    expect(acceptanceTargets([paid])).toEqual([]);
  });
});

describe('the sign of a row "Paid" (paidSign)', () => {
  it("is the warning's triangle once the owner accepted it paid short, none otherwise", () => {
    // Something out of the ordinary happened.
    const at = { received: 30_000n, due: 49_000n, at: NOW, fiat: CHF(500) };
    expect(paidSign({ acceptance: { status: "accepted", ...at } })).toBe("warning");
    expect(paidSign({ acceptance: { status: "accepted", ...at, late: true } })).toBe("warning");
    // Paid in full, not read, nothing accepted, accepted at more than it holds now, newer.
    expect(paidSign({})).toBeUndefined();
    expect(paidSign(null)).toBeUndefined();
    expect(paidSign({ acceptance: { status: "none" } })).toBeUndefined();
    expect(
      paidSign({ acceptance: { status: "unmet", received: 30_000n, due: 49_000n, at: NOW } })
    ).toBeUndefined();
    expect(paidSign({ acceptance: { status: "newer" } })).toBeUndefined();
  });
});

describe("what the owner may accept", () => {
  const read = (item: ActivityItem): ActivityItem => ({ ...item, acceptance: { status: "none" } });

  it('a sale "Underpaid" whose acceptance was read, at what it received, due its rest more', () => {
    const row = read(underpaidRow(saleTarget(1)));
    expect(acceptanceOf(row, NOW)).toEqual({
      target: saleTarget(1),
      received: 30_000n,
      due: 49_000n
    });
    // Not read: never, a second acceptance would be possible.
    expect(acceptanceOf(underpaidRow(saleTarget(1)), NOW)).toBeNull();
    // Its amount due unknown (the hour's point not read): nothing to tell the difference with.
    expect(acceptanceOf({ ...row, rest: null }, NOW)).toBeNull();
    // Nothing received.
    expect(acceptanceOf({ ...row, sats: null }, NOW)).toBeNull();
  });

  it("an integration's order, late from 5 minutes before its invoice's end, which its shop judges by", () => {
    const invoice = {
      sale: "ab".repeat(32),
      address: taprootAddress(1),
      expiresAt: NOW,
      sats: 49_000n
    };
    const row = read(underpaidRow({ kind: "order", integration: INTEGRATION, invoice }));
    // ACCEPTANCE_CLOCK_MARGIN_SECONDS: this app's clock may run behind (SPEC.md §31, rule 1).
    expect(acceptanceOf(row, NOW - 301)).toMatchObject({
      received: 30_000n,
      due: 49_000n,
      late: false
    });
    // Still, its shop not told (late-acceptance.ts).
    expect(acceptanceOf(row, NOW - 300)).toMatchObject({ late: true });
    expect(acceptanceOf(row, NOW)).toMatchObject({ received: 30_000n, due: 49_000n, late: true });
    expect(acceptanceOf(row, NOW + 86_400 * 30)?.late).toBe(true);
    // Paid in full meanwhile: nothing to accept.
    expect(acceptanceOf({ ...row, sats: 49_000n }, NOW)).toBeNull();
    // The acceptance its server reads lapsed (not made): the owner's own, whatever the clock says.
    const lapsed: ActivityItem = { ...row, acceptance: { status: "lapsed" } };
    expect(acceptanceOf(lapsed, NOW - 3600)).toMatchObject({ received: 30_000n, late: true });
    // Being sent: neither again nor late.
    const pending: ActivityItem = {
      ...row,
      acceptance: { status: "pending", received: 30_000n, due: 49_000n, at: NOW - 600 }
    };
    expect(acceptanceOf(pending, NOW - 3600)).toBeNull();
    expect(acceptanceOf(pending, NOW)).toBeNull();
    // A sale's acceptance never lapses: nothing to accept on such a read.
    expect(
      acceptanceOf({ ...read(underpaidRow(saleTarget(1))), acceptance: { status: "lapsed" } }, NOW)
    ).toBeNull();
  });

  it("tells the difference in the sale's currency, as the point of sale splits it", () => {
    const texts = { fiat: (f: { minor: number }) => `${f.minor}`, sats: (s: bigint) => `${s}s` };
    expect(acceptanceAmounts(texts, CHF(500), { received: 30_000n, due: 49_000n })).toEqual({
      received: "306",
      difference: "194"
    });
    expect(acceptanceAmounts(texts, null, { received: 30_000n, due: 49_000n })).toEqual({
      received: "30000s",
      difference: "19000s"
    });
  });
  it("writes sats in a sentence as prose does, never as a bitcoin figure", () => {
    // The dialog's "The difference of … sats": "1 000 sats", grouped in the device locale, not
    // "0.00 001 000 sats".
    const texts = acceptanceTexts((f) => `${f.minor} ${f.currency}`, "fr-CH");
    expect(acceptanceAmounts(texts, null, { received: 2_000n, due: 3_000n })).toEqual({
      received: `${formatInteger(2_000, "fr-CH")} sats`,
      difference: `${formatInteger(1_000, "fr-CH")} sats`
    });
    expect(texts.sats(1_000n)).not.toContain("0.00");
    expect(acceptanceTexts(texts.fiat, "en-US").sats(1_234_567n)).toBe("1,234,567 sats");
  });
});

describe("why the owner may not accept (acceptBlockOf)", () => {
  const order: AcceptTarget = {
    kind: "order",
    integration: INTEGRATION,
    invoice: { sale: "ab".repeat(32), address: taprootAddress(1), expiresAt: NOW, sats: 49_000n }
  };

  it("tells a row whose acceptance is not read yet, of a sale and of an order, ended or not", () => {
    expect(acceptBlockOf(underpaidRow(saleTarget(1)), NOW)).toEqual({ kind: "unread" });
    expect(acceptBlockOf(underpaidRow(order), NOW - 3600)).toEqual({ kind: "unread" });
    expect(acceptBlockOf(underpaidRow(order), NOW + 86_400 * 3)).toEqual({ kind: "unread" });
  });

  it("tells one accepted at more than it received now, with what it had received then", () => {
    const row: ActivityItem = {
      ...underpaidRow(order),
      sats: 29_000n,
      acceptance: { status: "unmet", received: 30_000n, due: 49_000n, at: NOW - 600 }
    };
    expect(acceptBlockOf(row, NOW)).toEqual({ kind: "unmet", received: 30_000n, due: 49_000n });
  });

  it("tells one accepted by a newer app", () => {
    const row: ActivityItem = { ...underpaidRow(order), acceptance: { status: "newer" } };
    expect(acceptBlockOf(row, NOW)).toEqual({ kind: "newer" });
  });

  it("tells nothing when it may be accepted, or when its details tell it already", () => {
    const none: ActivityItem = { ...underpaidRow(order), acceptance: { status: "none" } };
    expect(acceptanceOf(none, NOW)).not.toBeNull();
    expect(acceptBlockOf(none, NOW)).toBeNull();
    // Lapsed: accepted late.
    expect(acceptBlockOf({ ...none, acceptance: { status: "lapsed" } }, NOW)).toBeNull();
    // Being sent: the sheet says so (activity-acceptance-pending).
    const pending: ActivityItem = {
      ...none,
      acceptance: { status: "pending", received: 30_000n, due: 49_000n, at: NOW - 600 }
    };
    expect(acceptBlockOf(pending, NOW - 3600)).toBeNull();
    // Not "Underpaid", or nothing an acceptance would be made for.
    expect(acceptBlockOf({ ...underpaidRow(order), state: null, rest: null }, NOW)).toBeNull();
    const { acceptTarget: _, ...untargeted } = underpaidRow(order);
    expect(acceptBlockOf(untargeted, NOW)).toBeNull();
  });
});

describe("accepting, read back", () => {
  const reader = { owner: owner.publicKey, team, relays: DEFAULT_RELAYS };

  it('publishes a sale\'s acceptance, which the row then reads: "Paid"', async () => {
    const target = saleTarget(2);
    const heard = jest.fn();
    const unsubscribe = subscribeAcceptances(heard);
    await acceptRow({ target, received: 30_000n, due: 49_000n }, team, DEFAULT_RELAYS, () => NOW);
    unsubscribe();
    expect(heard).toHaveBeenCalledTimes(1);
    const reads = await readAcceptances([target], reader);
    expect(reads.get(acceptanceKey(target))).toMatchObject({
      kind: "accepted",
      acceptance: { received: 30_000n, due: 49_000n, at: NOW }
    });
    expect(applyAcceptances([underpaidRow(target)], reads)[0]?.acceptance?.status).toBe("accepted");
  });

  it("sends a record a minority holds to the other relays, when the owner reads it", async () => {
    const target = saleTarget(11);
    const event = saleAcceptanceEvent(
      owner.secretKey,
      saleKeyOf(11),
      { received: 25_000n, due: 49_000n },
      NOW - 100
    );
    // A publication cut short: two relays of five took it.
    for (const relay of DEFAULT_RELAYS.slice(0, 2)) relays.stored.set(relay, [event]);
    // An employee's read (no team keys): read, never sent again.
    const asEmployee = await readAcceptances([target], { ...reader, team: null });
    expect(asEmployee.get(acceptanceKey(target))?.kind).toBe("accepted");
    expect(relays.calls.filter(({ operation }) => operation === "publish")).toEqual([]);
    // The owner's: sent to the three others, as it is.
    await readAcceptances([target], reader);
    await waitFor(() =>
      expect(DEFAULT_RELAYS.every((relay) => relays.stored.get(relay)?.[0]?.id === event.id)).toBe(
        true
      )
    );
  });

  it("never accepts a sale accepted already on another device", async () => {
    const target = saleTarget(3);
    const event = saleAcceptanceEvent(
      owner.secretKey,
      saleKeyOf(3),
      { received: 25_000n, due: 49_000n },
      NOW - 100
    );
    await publishSaleAcceptance(
      event,
      saleOwnerSecretKey(owner.secretKey, saleKeyOf(3)),
      DEFAULT_RELAYS
    );
    await expect(
      acceptRow({ target, received: 30_000n, due: 49_000n }, team, DEFAULT_RELAYS, () => NOW)
    ).rejects.toMatchObject({ code: "already" });
  });

  it("fails when the relays cannot be read, having published nothing", async () => {
    const target = saleTarget(10);
    for (const relay of DEFAULT_RELAYS.slice(0, 3)) relays.unreachable.add(relay);
    const failed = acceptRow(
      { target, received: 30_000n, due: 49_000n },
      team,
      DEFAULT_RELAYS,
      () => NOW
    );
    await expect(failed).rejects.toBeInstanceOf(AcceptanceError);
    await expect(failed).rejects.toMatchObject({ code: "network" });
    expect(relays.calls.filter(({ operation }) => operation === "publish")).toEqual([]);
  });

  it("fails when too few relays take it, then sends the very same record again", async () => {
    const target = saleTarget(4);
    // Read by all, written by two of five: the record exists on a minority.
    for (const relay of DEFAULT_RELAYS.slice(0, 3)) relays.readOnly.add(relay);
    const acceptance = { target, received: 30_000n, due: 49_000n };
    await expect(acceptRow(acceptance, team, DEFAULT_RELAYS, () => NOW)).rejects.toMatchObject({
      code: "network"
    });
    relays.readOnly.clear();
    // Later, with more received meanwhile: the record made first, never another one.
    await acceptRow({ ...acceptance, received: 31_000n }, team, DEFAULT_RELAYS, () => NOW + 60);
    const published = relays.calls.filter(({ operation }) => operation === "publish");
    expect(new Set(published.map(({ event }) => event?.id)).size).toBe(1);
    const reads = await readAcceptances([target], reader);
    expect(reads.get(acceptanceKey(target))).toMatchObject({
      acceptance: { received: 30_000n, at: NOW }
    });
  });

  it("publishes an order's acceptance its server reads, until 5 minutes before its invoice's end", async () => {
    const invoice = {
      sale: authorOf(saleKeyOf(5)),
      address: taprootAddress(1),
      expiresAt: NOW + 600,
      sats: 49_000n
    };
    const target: AcceptTarget = { kind: "order", integration: INTEGRATION, invoice };
    // Confirmed as before its end, its last 5 minutes come meanwhile: never published without the
    // warning of an acceptance its shop never learns of.
    await expect(
      acceptRow(
        { target, received: 30_000n, due: 49_000n, late: false },
        team,
        DEFAULT_RELAYS,
        () => NOW + 300
      )
    ).rejects.toMatchObject({ code: "ended" });
    expect(relays.calls.filter(({ operation }) => operation === "publish")).toEqual([]);
    await acceptRow(
      { target, received: 30_000n, due: 49_000n, late: false },
      team,
      DEFAULT_RELAYS,
      () => NOW
    );
    // As its server opens it, with the integration's secret key alone.
    const integrationKey = integrationSecretKey(team, INTEGRATION);
    const [event] = relays.stored.get(DEFAULT_RELAYS[0]!) ?? [];
    expect(
      openOrderAcceptance(
        event,
        team.publicKey,
        deriveIntegrationKeys(integrationKey),
        integrationKey,
        invoice
      )
    ).toMatchObject({ status: "ok", value: { received: 30_000n, at: NOW } });
    const reads = await readAcceptances([target], reader);
    expect(reads.get(acceptanceKey(target))).toEqual({
      kind: "accepted",
      acceptance: { received: 30_000n, due: 49_000n, at: NOW }
    });
  });

  it("publishes an order's late acceptance, which its server never reads", async () => {
    const invoice = {
      sale: authorOf(saleKeyOf(12)),
      address: taprootAddress(3),
      expiresAt: NOW - 86_400,
      sats: 49_000n
    };
    const target: AcceptTarget = { kind: "order", integration: INTEGRATION, invoice };
    const heard = jest.fn();
    const unsubscribe = subscribeAcceptances(heard);
    await acceptRow(
      { target, received: 30_000n, due: 49_000n, late: true },
      team,
      DEFAULT_RELAYS,
      () => NOW
    );
    unsubscribe();
    expect(heard).toHaveBeenCalledTimes(1);
    // The owner's own record, on a majority of the relays, signed by the team.
    const lateKeys = deriveLateAcceptanceKeys(team);
    const lateAddress = lateAcceptanceAddress(lateKeys, INTEGRATION, invoice);
    const [event] = relays.stored.get(DEFAULT_RELAYS[0]!) ?? [];
    expect(event?.tags).toEqual([["d", lateAddress]]);
    expect(event?.pubkey).toBe(team.publicKey);
    // Its server opens nothing: its shop keeps the order expired.
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
    const reads = await readAcceptances([target], reader);
    expect(reads.get(acceptanceKey(target))).toEqual({
      kind: "accepted",
      acceptance: { received: 30_000n, due: 49_000n, at: NOW, late: true }
    });
    // "Paid" at what it received (Confirming while its deposit is not credited), late.
    const [row] = applyAcceptances([underpaidRow(target)], reads);
    expect(row?.acceptance).toMatchObject({ status: "accepted", late: true });
    // Confirmed again in this session (a publication thought cut short): the very same record.
    await acceptRow(
      { target, received: 31_000n, due: 49_000n, late: true },
      team,
      DEFAULT_RELAYS,
      () => NOW + 60
    );
    const published = relays.calls.filter(({ operation }) => operation === "publish");
    expect(new Set(published.map(({ event }) => event?.id)).size).toBe(1);
  });

  it("reads first the acceptance an order's server reads, then a newer one, then a late one", async () => {
    const invoice = {
      sale: authorOf(saleKeyOf(13)),
      address: taprootAddress(4),
      expiresAt: NOW - 600,
      sats: 49_000n
    };
    const target: AcceptTarget = { kind: "order", integration: INTEGRATION, invoice };
    const integrationKey = integrationSecretKey(team, INTEGRATION);
    const lateKeys = deriveLateAcceptanceKeys(team);
    const call = { relays: DEFAULT_RELAYS, channel: "account" as const, timeoutMs: 1000 };
    // Two devices, neither seeing the other's: one in time, one after the end.
    await publishLateAcceptance(
      lateAcceptanceEvent(team, lateKeys, INTEGRATION, invoice, 31_000n, NOW),
      { ...call, authKey: team.secretKey }
    );
    expect((await readAcceptances([target], reader)).get(acceptanceKey(target))).toMatchObject({
      acceptance: { received: 31_000n, late: true }
    });
    await publishOrderAcceptance(
      orderAcceptanceEvent(
        team,
        deriveIntegrationKeys(integrationKey),
        integrationKey,
        invoice,
        30_000n,
        NOW - 700
      ),
      { ...call, authKey: team.secretKey }
    );
    expect((await readAcceptances([target], reader)).get(acceptanceKey(target))).toEqual({
      kind: "accepted",
      acceptance: { received: 30_000n, due: 49_000n, at: NOW - 700 }
    });
    // Accepted on other devices: never accepted again here.
    await expect(
      acceptRow(
        { target, received: 32_000n, due: 49_000n, late: true },
        team,
        DEFAULT_RELAYS,
        () => NOW
      )
    ).rejects.toMatchObject({ code: "already" });
  });

  it("never reads an order whose late acceptance a majority did not answer for", async () => {
    const invoice = {
      sale: authorOf(saleKeyOf(14)),
      address: taprootAddress(5),
      expiresAt: NOW - 600,
      sats: 49_000n
    };
    const target: AcceptTarget = { kind: "order", integration: INTEGRATION, invoice };
    // Its server's record read, the owner's late one not: not read, never "none" (offered).
    const fetchLate = jest
      .spyOn(lateAcceptance, "fetchLateAcceptances")
      .mockResolvedValueOnce(null);
    expect((await readAcceptances([target], reader)).has(acceptanceKey(target))).toBe(false);
    fetchLate.mockRestore();
    expect((await readAcceptances([target], reader)).get(acceptanceKey(target))).toEqual({
      kind: "none"
    });
  });

  it("reads an order's acceptance only with the team's keys (an employee has none)", async () => {
    const invoice = { sale: "ab".repeat(32), address: taprootAddress(1), expiresAt: NOW, sats: 2n };
    const target: AcceptTarget = { kind: "order", integration: INTEGRATION, invoice };
    const reads = await readAcceptances([target], { ...reader, team: null });
    expect(reads.size).toBe(0);
  });
});

describe("an order's acceptance and its invoice's end: the majority of the relays holds the truth", () => {
  // Checkout-spec SPEC.md §31 ("The merchant's acceptance"): its server counts a merchant's
  // acceptance only when a majority of the merchant's relays sent it, and may judge the order
  // `expired`, for good, once its lease ended. The app sends nothing at or after the invoice's end,
  // from ACCEPTANCE_CLOCK_MARGIN_SECONDS before it by its clock; the owner's own late acceptance
  // (late-acceptance.ts) from then on.
  const reader = { owner: owner.publicKey, team, relays: DEFAULT_RELAYS };
  const END = NOW + 600;
  /** ACCEPTANCE_CLOCK_MARGIN_SECONDS before the end: nothing made nor sent from then on. */
  const CUTOFF = END - ACCEPTANCE_CLOCK_MARGIN_SECONDS;
  const integrationKey = integrationSecretKey(team, INTEGRATION);
  const lateKeys = deriveLateAcceptanceKeys(team);

  function orderOf(fill: number): { invoice: AcceptedInvoice; target: AcceptTarget } {
    const invoice = {
      sale: authorOf(saleKeyOf(fill)),
      address: taprootAddress(fill),
      expiresAt: END,
      sats: 49_000n
    };
    return { invoice, target: { kind: "order", integration: INTEGRATION, invoice } };
  }

  /** The team's acceptance of `invoice` its server reads, made before its end, held by `holders`. */
  function heldBy(invoice: AcceptedInvoice, holders: readonly string[]) {
    const event = orderAcceptanceEvent(
      team,
      deriveIntegrationKeys(integrationKey),
      integrationKey,
      invoice,
      30_000n,
      CUTOFF - 100
    );
    for (const relay of holders) relays.stored.set(relay, [event]);
    return event;
  }

  const published = () => relays.calls.filter(({ operation }) => operation === "publish");
  /** Lets what readAcceptances sends in the background reach the relays. */
  const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

  it("never sends a copy a minority holds once the invoice ends, nor tells it accepted", async () => {
    const { invoice, target } = orderOf(21);
    heldBy(invoice, DEFAULT_RELAYS.slice(0, 2));
    const reads = await readAcceptances([target], reader, () => CUTOFF);
    await settle();
    expect(published()).toEqual([]);
    expect(DEFAULT_RELAYS.slice(2).every((relay) => !relays.stored.has(relay))).toBe(true);
    // Its server never counts it: not made, "Underpaid" as its payments tell it.
    expect(reads.get(acceptanceKey(target))).toEqual({ kind: "lapsed" });
    const [row] = applyAcceptances([underpaidRow(target)], reads);
    expect(row).toMatchObject({ state: "underpaid", acceptance: { status: "lapsed" } });
    // The owner may still settle it in the app, its shop not told (late-acceptance.ts).
    expect(acceptanceOf(row!, CUTOFF)).toMatchObject({ received: 30_000n, late: true });
  });

  it("completes a copy a minority holds while the invoice runs, accepted once a majority holds it", async () => {
    const { invoice, target } = orderOf(22);
    const event = heldBy(invoice, DEFAULT_RELAYS.slice(0, 2));
    const reads = await readAcceptances([target], reader, () => CUTOFF - 1);
    // Not "Paid" yet, nor offered again: being sent to the others.
    expect(reads.get(acceptanceKey(target))).toEqual({
      kind: "pending",
      acceptance: { received: 30_000n, due: 49_000n, at: CUTOFF - 100 }
    });
    const [row] = applyAcceptances([underpaidRow(target)], reads);
    expect(row).toMatchObject({ state: "underpaid", acceptance: { status: "pending" } });
    expect(acceptanceOf(row!, CUTOFF - 1)).toBeNull();
    await waitFor(() =>
      expect(DEFAULT_RELAYS.every((relay) => relays.stored.get(relay)?.[0]?.id === event.id)).toBe(
        true
      )
    );
    // Each request bounded as a server's (SPEC.md §13).
    expect(published().every(({ timeoutMs }) => timeoutMs! <= ACCEPTANCE_REQUEST_MAX_MS)).toBe(
      true
    );
    // A majority holds it now: accepted, after the end too.
    const after = await readAcceptances([target], reader, () => END + 60);
    expect(after.get(acceptanceKey(target))).toEqual({
      kind: "accepted",
      acceptance: { received: 30_000n, due: 49_000n, at: CUTOFF - 100 }
    });
  });

  it("tells accepted only what a majority sent, never one relay's copy", async () => {
    const { invoice, target } = orderOf(23);
    heldBy(invoice, DEFAULT_RELAYS.slice(0, 1));
    const reads = await readAcceptances([target], reader, () => END);
    expect(reads.get(acceptanceKey(target))?.kind).toBe("lapsed");
    // Three of five: a majority.
    const { invoice: other, target: held } = orderOf(24);
    heldBy(other, DEFAULT_RELAYS.slice(0, 3));
    const majorityRead = await readAcceptances([held], reader, () => END);
    expect(majorityRead.get(acceptanceKey(held))?.kind).toBe("accepted");
  });

  it("tells nothing of a copy the relays that did not answer could make a majority's", async () => {
    const { invoice, target } = orderOf(30);
    heldBy(invoice, DEFAULT_RELAYS.slice(0, 2));
    // The fifth keeps silent: two of four, which it could make three.
    relays.silent.add(DEFAULT_RELAYS[4]!);
    const ended = await readAcceptances([target], reader, () => CUTOFF);
    await settle();
    // Not read (never "lapsed" nor "none"): nothing offered, nothing sent.
    expect(ended.has(acceptanceKey(target))).toBe(false);
    expect(published()).toEqual([]);
    // While the invoice runs, sent to the others all the same, not read either.
    const running = await readAcceptances([target], reader, () => CUTOFF - 1);
    expect(running.has(acceptanceKey(target))).toBe(false);
    await waitFor(() => expect(relays.stored.get(DEFAULT_RELAYS[2]!)).toHaveLength(1));
  });

  it("never sends this session's record again once the invoice ends: the owner's own instead", async () => {
    const { invoice, target } = orderOf(25);
    const acceptance = { target, received: 30_000n, due: 49_000n, late: false };
    // Taken by two relays of five before the end: not made yet, the owner may try again.
    for (const relay of DEFAULT_RELAYS.slice(0, 3)) relays.readOnly.add(relay);
    await expect(
      acceptRow(acceptance, team, DEFAULT_RELAYS, () => CUTOFF - 60)
    ).rejects.toMatchObject({ code: "network" });
    relays.readOnly.clear();
    const before = published().length;
    const [first] = published();
    // Tried again 5 minutes before the end: nothing sent, neither by the retry nor by its read.
    await expect(acceptRow(acceptance, team, DEFAULT_RELAYS, () => CUTOFF)).rejects.toMatchObject({
      code: "ended"
    });
    await settle();
    expect(published()).toHaveLength(before);
    // Still on the two that took it only.
    expect(DEFAULT_RELAYS.slice(0, 3).every((relay) => !relays.stored.has(relay))).toBe(true);
    // Lapsed: the owner accepts it late, a record of its own, never the first sent again.
    const reads = await readAcceptances([target], reader, () => CUTOFF);
    expect(reads.get(acceptanceKey(target))).toEqual({ kind: "lapsed" });
    await acceptRow({ ...acceptance, late: true }, team, DEFAULT_RELAYS, () => CUTOFF + 10);
    const late = published().slice(before);
    expect(late.every(({ event }) => event?.id !== first?.event?.id)).toBe(true);
    expect(new Set(late.map(({ event }) => event?.tags[0]?.[1]))).toEqual(
      new Set([lateAcceptanceAddress(lateKeys, INTEGRATION, invoice)])
    );
    expect((await readAcceptances([target], reader, () => END)).get(acceptanceKey(target))).toEqual(
      {
        kind: "accepted",
        acceptance: { received: 30_000n, due: 49_000n, at: CUTOFF + 10, late: true }
      }
    );
  });

  it("tells the owner it was not made when too few relays took it before the end", async () => {
    const { target } = orderOf(26);
    for (const relay of DEFAULT_RELAYS.slice(0, 3)) relays.readOnly.add(relay);
    let time = CUTOFF - 1;
    const release = relays.holdPublishes();
    const accepting = acceptRow(
      { target, received: 30_000n, due: 49_000n, late: false },
      team,
      DEFAULT_RELAYS,
      () => time
    );
    // Sent before the cutoff; the relays answer after it.
    await waitFor(() => expect(published()).toHaveLength(DEFAULT_RELAYS.length));
    time = CUTOFF;
    release();
    await expect(accepting).rejects.toBeInstanceOf(AcceptanceError);
    await expect(accepting).rejects.toMatchObject({ code: "ended" });
    // Read after the end: not accepted, never sent again.
    relays.readOnly.clear();
    const reads = await readAcceptances([target], reader, () => time);
    await settle();
    expect(reads.get(acceptanceKey(target))).toEqual({ kind: "lapsed" });
    expect(published()).toHaveLength(DEFAULT_RELAYS.length);
  });

  it("is made when a majority took it, the relays answering after the end", async () => {
    const { target } = orderOf(27);
    let time = CUTOFF - 1;
    const release = relays.holdPublishes();
    const accepting = acceptRow(
      { target, received: 30_000n, due: 49_000n, late: false },
      team,
      DEFAULT_RELAYS,
      () => time
    );
    await waitFor(() => expect(published()).toHaveLength(DEFAULT_RELAYS.length));
    time = END + 5;
    release();
    await accepting;
    const reads = await readAcceptances([target], reader, () => time);
    expect(reads.get(acceptanceKey(target))).toMatchObject({
      kind: "accepted",
      acceptance: { at: CUTOFF - 1 }
    });
  });

  it("makes and sends one at E − 301 by its clock, none at E − 300", async () => {
    const { target } = orderOf(28);
    const acceptance = { target, received: 30_000n, due: 49_000n, late: false };
    await expect(
      acceptRow(acceptance, team, DEFAULT_RELAYS, () => END - 300)
    ).rejects.toMatchObject({ code: "ended" });
    expect(published()).toEqual([]);
    await acceptRow(acceptance, team, DEFAULT_RELAYS, () => END - 301);
    expect(published()).toHaveLength(DEFAULT_RELAYS.length);
    const reads = await readAcceptances([target], reader, () => END);
    expect(reads.get(acceptanceKey(target))).toMatchObject({
      kind: "accepted",
      acceptance: { at: END - 301 }
    });
  });

  it("sends a copy a minority holds at E − 301, not at E − 300", async () => {
    const { invoice, target } = orderOf(29);
    heldBy(invoice, DEFAULT_RELAYS.slice(0, 2));
    const late = await readAcceptances([target], reader, () => END - 300);
    await settle();
    expect(late.get(acceptanceKey(target))).toEqual({ kind: "lapsed" });
    expect(published()).toEqual([]);
    const early = await readAcceptances([target], reader, () => END - 301);
    expect(early.get(acceptanceKey(target))?.kind).toBe("pending");
    await waitFor(() => expect(published()).toHaveLength(3));
  });

  it("never makes the owner's own while the one its server reads is being sent", async () => {
    const { invoice, target } = orderOf(31);
    heldBy(invoice, DEFAULT_RELAYS.slice(0, 2));
    // Another device's copy, a minority's: already accepted there, being sent on.
    await expect(
      acceptRow(
        { target, received: 30_000n, due: 49_000n, late: true },
        team,
        DEFAULT_RELAYS,
        () => CUTOFF - 1
      )
    ).rejects.toMatchObject({ code: "already" });
    await settle();
    expect(
      published().every(
        ({ event }) => event?.tags[0]?.[1] !== lateAcceptanceAddress(lateKeys, INTEGRATION, invoice)
      )
    ).toBe(true);

    // This session's own, taken by two relays of five: being sent while the invoice runs, never
    // doubled by a late one (a clock set back after the dialog opened late).
    const { invoice: other, target: own } = orderOf(32);
    for (const relay of DEFAULT_RELAYS.slice(0, 3)) relays.readOnly.add(relay);
    await expect(
      acceptRow(
        { target: own, received: 30_000n, due: 49_000n, late: false },
        team,
        DEFAULT_RELAYS,
        () => CUTOFF - 60
      )
    ).rejects.toMatchObject({ code: "network" });
    relays.readOnly.clear();
    await expect(
      acceptRow(
        { target: own, received: 30_000n, due: 49_000n, late: true },
        team,
        DEFAULT_RELAYS,
        () => CUTOFF - 30
      )
    ).rejects.toMatchObject({ code: "already" });
    await settle();
    expect(
      published().every(
        ({ event }) => event?.tags[0]?.[1] !== lateAcceptanceAddress(lateKeys, INTEGRATION, other)
      )
    ).toBe(true);
  });
});

describe("the rows that say what an acceptance of them is for (ownerActivity)", () => {
  const txid = "cd".repeat(32);

  it("an integration's sale paid short, past its order's follow: \"Underpaid\", its invoice", () => {
    const saleKey = saleKeyOf(6);
    const author = authorOf(saleKey);
    const lease = {
      integration: INTEGRATION,
      address: taprootAddress(2),
      expiresAt: NOW - 3000,
      sats: 49_000n,
      tolerance: 0
    };
    const sale: DeclaredSale = {
      author,
      fiat: CHF(2450),
      note: "Order 7",
      taker: { kind: "integration", id: INTEGRATION },
      paidAt: NOW - 3100,
      key: saleKey,
      lease
    };
    const items = ownerActivity({
      payments: [deposit(txid, 30_000n)],
      declarations: new Map(),
      onchainSales: new Map([[txid, [sale]]]),
      links: [],
      sales: [],
      integrations: new Map([
        [INTEGRATION, { kind: "integration", id: INTEGRATION, name: "Shop" }]
      ]),
      now: NOW
    });
    expect(items).toMatchObject([
      {
        id: `sale:${author}`,
        state: "underpaid",
        sats: 30_000n,
        // 19 000 of 49 000 sats of 24,50 CHF: 9,50 CHF.
        rest: { sats: 19_000n, minor: 950 },
        acceptTarget: {
          kind: "order",
          integration: INTEGRATION,
          invoice: {
            sale: author,
            address: lease.address,
            expiresAt: lease.expiresAt,
            sats: 49_000n
          }
        }
      }
    ]);
    // Within its tolerance (5 %: 46 550 sats), paid as its server judged it.
    const tolerated = ownerActivity({
      payments: [deposit(txid, 46_550n)],
      declarations: new Map(),
      onchainSales: new Map([[txid, [{ ...sale, lease: { ...lease, tolerance: 500 } }]]]),
      links: [],
      sales: [],
      integrations: new Map([
        [INTEGRATION, { kind: "integration", id: INTEGRATION, name: "Shop" }]
      ]),
      now: NOW
    });
    expect(tolerated[0]).toMatchObject({ state: null, sats: 46_550n });
  });

  it("a sale of the point of sale: its key, only when it is that sale's", () => {
    const saleKey = saleKeyOf(7);
    const author = authorOf(saleKey);
    const declared = (key: Uint8Array): DeclaredSale => ({
      author,
      fiat: CHF(500),
      note: "Table 4",
      taker: { kind: "you" },
      key
    });
    const rowOf = (key: Uint8Array) =>
      ownerActivity({
        payments: [deposit(txid, 49_000n)],
        declarations: new Map(),
        onchainSales: new Map([[txid, [declared(key)]]]),
        links: [],
        sales: [],
        now: NOW
      })[0];
    expect(rowOf(saleKey)?.acceptTarget).toEqual({ kind: "sale", saleKey, relays: null });
    // Another sale's key in its declaration (whoever declared it chose it): never trusted.
    expect(rowOf(saleKeyOf(8))?.acceptTarget).toBeUndefined();
  });
});

describe("a point of sale's record of a sale (member-records.ts)", () => {
  const keys = deriveMemberKeys(memberSecret(team, "0123456789abcdef0123456789abcdef"));
  const record = {
    version: 1 as const,
    sats: "49000",
    fiat: CHF(500),
    note: "Table 4",
    createdAt: NOW - 600,
    expiresAt: NOW,
    paidAt: null,
    onchainTag: null,
    sale: authorOf(saleKeyOf(9)),
    paymentHash: "ef".repeat(32),
    verifyUrl: "https://example.com/verify",
    onchainAddress: null
  };
  const read = (value: Record<string, unknown>) =>
    memberRecordsOf(keys, [saleEvent(keys, value as never)]).sales;

  it("carries the sale's key, read when it is one; an older record has none", () => {
    expect(read({ ...record, saleKey: bytesToHex(saleKeyOf(9)) })[0]?.saleKey).toBe(
      bytesToHex(saleKeyOf(9))
    );
    expect(read(record)[0]?.saleKey).toBeUndefined();
    // Not a key: the record is refused, as any of its fields that is not what it says.
    expect(read({ ...record, saleKey: "nope" })).toEqual([]);
    expect(hexToBytes(bytesToHex(saleKeyOf(9)))).toHaveLength(32);
  });
});
