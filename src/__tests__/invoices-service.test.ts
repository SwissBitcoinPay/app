import { waitFor } from "@testing-library/react-native";

import { DEFAULT_RELAYS } from "@/config/relays";
import { closeAccount } from "@/features/account/session";
import { loadOwnerRecords } from "@/features/activity/load";
import { ownerActivity } from "@/features/activity/model";
import { sentLinks } from "@/features/invoices/activity";
import {
  InvoiceError,
  cancelInvoice,
  defaultDueDate,
  dueRange,
  endOfDay,
  isDueDateOffered,
  loadInvoices,
  removeDraft,
  saveDraft,
  sendInvoice,
  type InvoiceForm,
  type PreparedInvoice
} from "@/features/invoices/invoices";
import { resetPayRequests } from "@/features/terminal/invoice";
import { savePosOptions } from "@/features/terminal/options";
import { fetchPaymentLink, parsePaymentLinkFragment } from "@/lib/payment-link/link";
import { loadPendingLinks } from "@/lib/payment-link/pending";
import { nowUnix } from "@/lib/rates/snapshot";
import type { OwnerTerminalProfile } from "@/lib/terminal/model";
import { loadOnchainPool, saveOnchainPool } from "@/lib/terminal/profile";

import { TEST_WALLET_ID, openTestAccount } from "../../jest/account";
import { taprootAddress } from "../../jest/bitcoin";
import { depositAddresses, lightningAddresses } from "../../jest/breez-sdk";
import { breezTips, breezTipsFetch, resetBreezTips } from "../../jest/breez-tips";
import { setCoingeckoPrice } from "../../jest/coingecko";
import type * as MempoolFake from "../../jest/mempool";
import type * as RelaysFake from "../../jest/nostr-relays";

/*
 * The owner's invoices ("New invoice"): a draft takes its number when
 * first saved; sending makes its payment link (version 4, payable until its due date), keeps it on
 * the device, then saves the invoice sent with its link; a failure in between keeps the link for
 * the next attempt.
 */

jest.mock("../lib/breez/config", () => ({
  ...jest.requireActual("../lib/breez/config"),
  getWalletConfig: () => ({ network: "mainnet", apiKey: "test-api-key" }),
  getBreezNetwork: () => "mainnet"
}));
const mockLinkOrigin = jest.fn<string | null, []>(() => "https://web.example");
jest.mock("../config/payment-links", () => ({
  ...jest.requireActual("../config/payment-links"),
  getPaymentLinkOrigin: () => mockLinkOrigin()
}));

const relays = jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");
const mempool = jest.requireMock<typeof MempoolFake>("../lib/onchain/esplora");

/** 9 October 2026, 14:00 in Zurich (the tests' time zone may be any: dates are the device's). */
const NOW = new Date(2026, 9, 9, 14, 0, 0);

const profile: OwnerTerminalProfile = {
  version: 2,
  walletId: TEST_WALLET_ID,
  backupKey: "5f".repeat(32),
  lightningAddress: "sattleme02c6047f94@breez.tips",
  businessName: "Fine Bakery",
  currency: "CHF"
};

function form(patch: Partial<InvoiceForm> = {}): InvoiceForm {
  return {
    recipient: {
      name: " Bastion Coffee LLC ",
      street: "12 Gold Cross Street",
      postalCode: "1204",
      city: "Geneva",
      country: "CH",
      reference: ""
    },
    currency: { code: "CHF", digits: 2 },
    lines: [
      { name: "Sourdough bread 800 g", quantity: 2400, unitMinor: 650, vatRate: 260 },
      { name: "Butter croissants", quantity: 6000, unitMinor: 180, vatRate: 260 },
      { name: "Delivery fee", quantity: 100, unitMinor: 4500, vatRate: 810 }
    ],
    dueDate: "2026-11-08",
    terms: "Payment within 30 days net, no discount.",
    legal: "",
    redirectUrl: null,
    ...patch
  };
}

const note = (number: string) => `Invoice ${number}`;

/** The tests' fetch as jest.setup.ts gives it (CoinGecko's fake among others). */
const DEFAULT_FETCH = jest.mocked(globalThis.fetch).getMockImplementation()!;

beforeEach(async () => {
  jest.useFakeTimers({ advanceTimers: true });
  jest.setSystemTime(NOW);
  relays.resetRelays();
  // The Lightning address's bounds (breez.tips: 1 BTC at most), and 50,000 CHF per bitcoin around
  // now: an invoice without an on-chain address is checked against them.
  resetPayRequests();
  resetBreezTips();
  lightningAddresses.set("sattleme02c6047f94", "Fine Bakery");
  jest
    .mocked(globalThis.fetch)
    .mockImplementation((input, init) =>
      new URL(String(input)).host === "breez.tips"
        ? breezTipsFetch(input)
        : DEFAULT_FETCH(input, init)
    );
  const hour = Math.floor(NOW.getTime() / 1000 / 3600) * 3600;
  for (let at = hour - 3 * 3600; at <= hour + 3 * 3600; at += 3600) {
    setCoingeckoPrice("CHF", at, 50_000);
  }
  mockLinkOrigin.mockReturnValue("https://web.example");
  await openTestAccount({ signUp: "done", usage: "merchant" });
});

afterEach(() => {
  closeAccount();
  jest.useRealTimers();
  lightningAddresses.delete("sattleme02c6047f94");
  jest.mocked(globalThis.fetch).mockImplementation(DEFAULT_FETCH);
});

describe("due dates", () => {
  it("are offered from tomorrow to 9 months later, 30 days later by default", () => {
    expect(dueRange(NOW)).toEqual({ first: "2026-10-10", last: "2027-07-09" });
    expect(defaultDueDate(NOW)).toBe("2026-11-08");
    expect(isDueDateOffered("2026-10-09", NOW)).toBe(false);
    expect(isDueDateOffered("2026-10-10", NOW)).toBe(true);
    expect(isDueDateOffered("2027-07-09", NOW)).toBe(true);
    expect(isDueDateOffered("2027-07-10", NOW)).toBe(false);
    // The month's last day when the same day does not exist 9 months later.
    expect(dueRange(new Date(2026, 4, 31)).last).toBe("2027-02-28");
  });

  it("end at the next midnight of the device's calendar", () => {
    expect(endOfDay("2026-11-08")).toBe(new Date(2026, 10, 9).getTime() / 1000);
  });
});

describe("drafts", () => {
  it("take a number when first saved, keep it, and are listed", async () => {
    const draft = await saveDraft(form({ lines: [], dueDate: null }), null, []);
    expect(draft).toMatchObject({
      status: "draft",
      number: { year: 2026, sequence: 1 },
      recipient: { name: "Bastion Coffee LLC" },
      dueAt: null,
      sent: null
    });
    const changed = await saveDraft(form(), draft, [draft]);
    expect(changed).toMatchObject({
      id: draft.id,
      number: draft.number,
      createdAt: draft.createdAt
    });
    expect(changed.updatedAt).toBeGreaterThan(draft.updatedAt);
    expect(changed.dueAt).toBe(endOfDay("2026-11-08"));
    const other = await saveDraft(form(), null, [changed]);
    expect(other.number).toEqual({ year: 2026, sequence: 2 });
    expect((await loadInvoices()).invoices.map(({ id }) => id)).toEqual(
      expect.arrayContaining([draft.id, other.id])
    );

    await removeDraft(other);
    expect((await loadInvoices()).invoices.map(({ id }) => id)).toEqual([draft.id]);
  });

  it("are not saved, nor numbered, when too few relays answer", async () => {
    for (const relay of DEFAULT_RELAYS.slice(0, 3)) relays.unreachable.add(relay);
    await expect(saveDraft(form(), null, [])).rejects.toMatchObject({ code: "number" });
  });
});

describe("sending", () => {
  it("makes the payment link of the invoice, payable until its due date, then saves it sent", async () => {
    const sent = await sendInvoice({
      form: form({ redirectUrl: "https://fine-bakery.example/thanks" }),
      saved: null,
      known: [],
      profile,
      prepared: null,
      onPrepared: () => undefined,
      note
    });
    expect(sent).toMatchObject({
      status: "sent",
      number: { year: 2026, sequence: 1 },
      dueAt: endOfDay("2026-11-08"),
      sent: { at: Math.floor(NOW.getTime() / 1000) }
    });
    const ref = parsePaymentLinkFragment(new URL(sent.sent!.link.url).hash);
    expect(ref).not.toBeNull();
    const lookup = await fetchPaymentLink(ref!, "bc");
    expect(lookup).toMatchObject({
      status: "found",
      value: {
        kind: "sale",
        sale: {
          version: 4,
          // The total, VAT included (319.51 CHF): what the payer's page asks, hour by hour.
          fiat: { minor: 31_951, digits: 2, currency: "CHF" },
          note: "Invoice 2026-0001",
          startsAt: Math.floor(NOW.getTime() / 1000),
          endsAt: endOfDay("2026-11-08"),
          redirectUrl: "https://fine-bakery.example/thanks",
          final: null
        }
      }
    });
    // Kept until its final version, as the point of sale's links.
    expect((await loadPendingLinks("bc")).map(({ id }) => id)).toEqual([sent.sent!.link.id]);
    expect((await loadInvoices()).invoices).toEqual([sent]);
  });

  it("keeps the business's tolerance with the invoice's link, which never names it", async () => {
    // "Underpayment tolerance" of 2.5 %, as the account's settings gave this device.
    await savePosOptions(TEST_WALLET_ID, {
      onchain: true,
      onchainTolerance: 250,
      bitcoinNode: null
    });
    let prepared: PreparedInvoice | null = null;
    const sent = await sendInvoice({
      form: form(),
      saved: null,
      known: [],
      profile,
      prepared: null,
      onPrepared: (made) => (prepared = made),
      note
    });
    expect(prepared!.tolerance).toBe(250);
    // This device settles the invoice's sale with it.
    expect(await loadPendingLinks("bc")).toMatchObject([
      { id: sent.sent!.link.id, tolerance: 250 }
    ]);
    expect(JSON.stringify(prepared!.link.payload)).not.toMatch(/toleran/i);
  });

  it("names the merchant's node in the invoice's link only when the owner passes it on", async () => {
    const node = { url: "https://node.example.ch", fallback: "none" } as const;
    const sendWith = async (payers: boolean) => {
      await savePosOptions(TEST_WALLET_ID, {
        onchain: true,
        onchainTolerance: 0,
        bitcoinNode: { ...node, payers }
      });
      const sent = await sendInvoice({
        form: form(),
        saved: null,
        known: [],
        profile,
        prepared: null,
        onPrepared: () => undefined,
        note
      });
      const ref = parsePaymentLinkFragment(new URL(sent.sent!.link.url).hash);
      return fetchPaymentLink(ref!, "bc");
    };
    // Off (the default): the payer's page reads mempool.space.
    expect(await sendWith(false)).toMatchObject({
      status: "found",
      value: { kind: "sale", sale: { bitcoinNode: null } }
    });
    expect(await sendWith(true)).toMatchObject({
      status: "found",
      value: { kind: "sale", sale: { bitcoinNode: node } }
    });
  });

  it("sends a draft under its own number", async () => {
    const draft = await saveDraft(form(), null, []);
    const sent = await sendInvoice({
      form: form(),
      saved: draft,
      known: [draft],
      profile,
      prepared: null,
      onPrepared: () => undefined,
      note
    });
    expect(sent).toMatchObject({ id: draft.id, number: draft.number, createdAt: draft.createdAt });
    expect((await loadInvoices()).invoices).toEqual([sent]);
  });

  it("refuses an invoice that is not whole: nothing numbered nor made", async () => {
    const attempts = [
      form({ recipient: { ...form().recipient, city: " " } }),
      form({ lines: [] }),
      form({ dueDate: null }),
      form({ dueDate: "2027-07-10" }),
      form({ dueDate: "2026-10-09" })
    ];
    // What opening the account published (its backup) aside.
    relays.calls.length = 0;
    for (const attempt of attempts) {
      const made = jest.fn();
      await expect(
        sendInvoice({
          form: attempt,
          saved: null,
          known: [],
          profile,
          prepared: null,
          onPrepared: made,
          note
        })
      ).rejects.toMatchObject({ code: "invalid" });
      expect(made).not.toHaveBeenCalled();
    }
    expect(relays.calls.filter(({ operation }) => operation === "publish")).toEqual([]);
  });

  describe("above the most the Lightning address accepts", () => {
    // 60,000.00 CHF: 1.2 BTC at 50,000 CHF per bitcoin, above breez.tips' 1 BTC.
    const large = () =>
      form({ lines: [{ name: "Cargo bike", quantity: 100, unitMinor: 6_000_000, vatRate: 0 }] });
    const send = (patch: Partial<Parameters<typeof sendInvoice>[0]> = {}) =>
      sendInvoice({
        form: large(),
        saved: null,
        known: [],
        profile,
        prepared: null,
        onPrepared: () => undefined,
        note,
        ...patch
      });

    /** Nothing was numbered: the next invoice takes the first number. */
    async function expectNothingTaken() {
      expect((await saveDraft(form(), null, [])).number).toEqual({ year: 2026, sequence: 1 });
      expect(await loadPendingLinks("bc")).toEqual([]);
    }

    it("refuses it while no on-chain address is ready, nothing numbered", async () => {
      // "On-chain payments" off: never the reason, the invoices ignore it; the pool is empty.
      await savePosOptions(TEST_WALLET_ID, {
        onchain: false,
        onchainTolerance: 0,
        bitcoinNode: null
      });
      // 20 % below breez.tips' 1 BTC (INVOICE_LIGHTNING_MARGIN_PERCENT).
      await expect(send()).rejects.toMatchObject({ code: "noAddress", max: 80_000_000n });
      await expectNothingTaken();
    });

    it("keeps a margin of 20 % below the bounds for an invoice without an address", async () => {
      // The explorer out of reach: no address of the pool is proven unpaid, none is taken.
      mempool.chain.down.add("https://mempool.space/api");
      await saveOnchainPool({
        version: 1,
        walletId: TEST_WALLET_ID,
        addresses: [taprootAddress(1), taprootAddress(2)]
      });
      depositAddresses.handedOut = 2;
      const priced = (unitMinor: number) =>
        form({ lines: [{ name: "Cargo bike", quantity: 100, unitMinor, vatRate: 0 }] });
      // 40 000,01 CHF: 80 000 020 sats, above 80 % of 1 BTC, though payable over Lightning today.
      await expect(send({ form: priced(4_000_001) })).rejects.toMatchObject({
        code: "noAddress",
        max: 80_000_000n
      });
      // 40 000,00 CHF: 80 000 000 sats exactly, sent.
      await expect(send({ form: priced(4_000_000) })).resolves.toMatchObject({ status: "sent" });
    });

    it("sends it with an on-chain address: its payer's page shows that address alone", async () => {
      // "On-chain payments" off: the point of sale's only, an invoice offers on-chain whatever it
      // says.
      await savePosOptions(TEST_WALLET_ID, {
        onchain: false,
        onchainTolerance: 0,
        bitcoinNode: null
      });
      await saveOnchainPool({
        version: 1,
        walletId: TEST_WALLET_ID,
        addresses: [taprootAddress(1), taprootAddress(2)]
      });
      // The fake wallet's next new addresses: taprootAddress(3), (4), …
      depositAddresses.handedOut = 2;
      const sent = await send();
      const ref = parsePaymentLinkFragment(new URL(sent.sent!.link.url).hash);
      expect(await fetchPaymentLink(ref!, "bc")).toMatchObject({
        status: "found",
        value: { kind: "sale", sale: { onchainAddress: taprootAddress(1) } }
      });
      // Its bounds were not needed: never read.
      expect(breezTips.requests).toEqual([]);
      // The address taken, filled again in the background by the wallet while the account is
      // open (onchain-pool.ts): the pool is full again, without it.
      await waitFor(async () =>
        expect((await loadOnchainPool("mainnet"))?.addresses).toEqual(
          Array.from({ length: 20 }, (_, i) => taprootAddress(i + 2))
        )
      );
    });

    it("sends one within the bounds without an address, and refuses one it cannot check", async () => {
      // The explorer out of reach: no address of the pool is proven unpaid, none is taken.
      mempool.chain.down.add("https://mempool.space/api");
      // 319.51 CHF: well within 1 BTC.
      await expect(send({ form: form() })).resolves.toMatchObject({ status: "sent" });

      // The Lightning address out of reach: whether it could be paid is not known.
      resetPayRequests();
      breezTips.unreachable = true;
      await expect(send({ form: form() })).rejects.toMatchObject({ code: "unverified" });
      // No point for the present (CoinGecko's outage) either.
      breezTips.unreachable = false;
      await expect(
        send({ form: form({ currency: { code: "EUR", digits: 2 } }) })
      ).rejects.toMatchObject({ code: "unverified" });
    });
  });

  it("makes no link in a build without a web app for its links", async () => {
    mockLinkOrigin.mockReturnValue(null);
    await expect(
      sendInvoice({
        form: form(),
        saved: null,
        known: [],
        profile,
        prepared: null,
        onPrepared: () => undefined,
        note
      })
    ).rejects.toEqual(expect.any(InvoiceError));
  });

  it("publishes the same link again after a failure, never a second one", async () => {
    // A draft: its number is taken already.
    const draft = await saveDraft(form(), null, []);
    let prepared: PreparedInvoice | null = null;
    const attempt = (patch: Partial<InvoiceForm> = {}) =>
      sendInvoice({
        form: form(patch),
        saved: draft,
        known: [draft],
        profile,
        prepared,
        onPrepared: (made) => {
          prepared = made;
        },
        note
      });
    // No relay takes the link: nothing is sent, the link made is kept for the next attempt.
    for (const relay of DEFAULT_RELAYS) relays.readOnly.add(relay);
    await expect(attempt()).rejects.toMatchObject({ code: "unreachable" });
    expect(prepared).not.toBeNull();
    const first = prepared!.link.id;
    await expect(attempt()).rejects.toMatchObject({ code: "unreachable" });
    expect(prepared!.link.id).toBe(first);
    // Another amount since: another link.
    const changed = {
      lines: [{ name: "Braided loaf", quantity: 100, unitMinor: 580, vatRate: 260 }]
    };
    await expect(attempt(changed)).rejects.toMatchObject({ code: "unreachable" });
    const second = prepared!.link.id;
    expect(second).not.toBe(first);
    relays.readOnly.clear();
    expect((await loadInvoices()).invoices).toEqual([draft]);

    const sent = await attempt(changed);
    expect(sent.sent!.link.id).toBe(second);
    expect(sent.number).toEqual(draft.number);
  });

  it("saves as a draft under the number a failed attempt to send took", async () => {
    let prepared: PreparedInvoice | null = null;
    await expect(
      sendInvoice({
        form: form(),
        saved: null,
        known: [],
        profile,
        prepared: null,
        onPrepared: (made) => {
          prepared = made;
          // Numbered, its link made: no relay takes the link.
          for (const relay of DEFAULT_RELAYS) relays.readOnly.add(relay);
        },
        note
      })
    ).rejects.toMatchObject({ code: "unreachable" });
    relays.readOnly.clear();
    const made = prepared as PreparedInvoice | null;
    expect(made).not.toBeNull();

    const draft = await saveDraft(form(), null, [], made);
    expect(draft).toMatchObject({ id: made!.id, number: made!.number, status: "draft" });
    expect((await loadInvoices()).invoices).toEqual([draft]);
  });

  it("cancels a sent invoice nothing paid: its link's final version says so", async () => {
    const sent = await sendInvoice({
      form: form(),
      saved: null,
      known: [],
      profile,
      prepared: null,
      onPrepared: () => undefined,
      note
    });
    await expect(cancelInvoice(sent)).resolves.toBe("canceled");
    const ref = parsePaymentLinkFragment(new URL(sent.sent!.link.url).hash);
    // The payer's page takes the owner's final version over the link (onBetter).
    let better: unknown = null;
    await fetchPaymentLink(ref!, "bc", {
      onBetter: (copy) => {
        better = copy;
      }
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(better).toMatchObject({ kind: "sale", sale: { final: { status: "canceled" } } });
  });

  it('reads a sent invoice canceled again before its due date, as "Wallet" does', async () => {
    const sent = await sendInvoice({
      form: form(),
      saved: null,
      known: [],
      profile,
      prepared: null,
      onPrepared: () => undefined,
      note
    });
    const id = sent.sent!.link.id;
    const rowOf = async () => {
      const now = nowUnix();
      // Its link still payable (its due date is a month away): only the owner's final version
      // tells it was canceled.
      expect(now).toBeLessThan(sent.dueAt!);
      const read = await loadOwnerRecords(now, profile.lightningAddress, sentLinks([sent]));
      const rows = ownerActivity({
        payments: [],
        declarations: new Map(),
        links: read.links,
        sales: read.sales,
        now
      });
      return rows.find((item) => item.id === `link:${id}`);
    };
    expect(await rowOf()).toMatchObject({ state: "open" });

    await expect(cancelInvoice(sent)).resolves.toBe("canceled");
    // Read again (the screen opened anew): "Canceled", never "Open" to cancel once more.
    expect(await rowOf()).toMatchObject({ state: "canceled" });
  });
});

describe("the invoices, with relays that stay connected without answering", () => {
  // An invoice is saved once a majority took it, and read from a majority; no relay is waited for
  // past that.
  it("are numbered, saved and listed without waiting for two quiet relays", async () => {
    relays.silent.add(DEFAULT_RELAYS[1]);
    relays.latency.set(DEFAULT_RELAYS[4], Infinity);
    const startedAt = Date.now();
    const draft = await saveDraft(form(), null, []);
    const changed = await saveDraft(form({ terms: "Payable on receipt." }), draft, [draft]);
    const listed = await loadInvoices();
    // Each read waits its grace after the majority, never a relay's 8 or 15 s.
    expect(Date.now() - startedAt).toBeLessThan(8000);
    expect(listed.invoices).toEqual([changed]);
    expect(listed.answered).toBeGreaterThanOrEqual(3);
  });

  it("are saved on a majority only, and listed from a majority's answers only", async () => {
    const draft = await saveDraft(form(), null, []);
    // Two of five relays: neither saved nor told.
    for (const relay of DEFAULT_RELAYS.slice(2)) relays.unreachable.add(relay);
    await expect(saveDraft(form({ terms: "Other." }), draft, [draft])).rejects.toMatchObject({
      code: "unreachable"
    });
    expect((await loadInvoices()).answered).toBe(0);
    relays.unreachable.delete(DEFAULT_RELAYS[2]);
    // A majority answers: the draft is there. The change refused reached two relays: it may show
    // (the newest copy read), as a change taken late by a relay always could; saved again, it holds.
    const listed = await loadInvoices();
    expect(listed.invoices.map(({ id }) => id)).toEqual([draft.id]);
    const again = await saveDraft(form({ terms: "Other." }), listed.invoices[0], listed.invoices);
    expect((await loadInvoices()).invoices).toEqual([again]);
  });
});
