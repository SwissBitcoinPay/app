import { DEFAULT_RELAYS } from "@/config/relays";
import { closeAccount, getAccountSettings, getAccountTeamKeys } from "@/features/account/session";
import {
  copyInvoices,
  copyLateInvoices,
  INVOICES_UPKEEP_INTERVAL_SECONDS,
  keepInvoices,
  loadInvoices,
  removeDraft,
  resetInvoicesUpkeep,
  saveDraft,
  type InvoiceForm
} from "@/features/invoices/invoices";
import { SettingsError, changeRelays } from "@/features/settings/account-settings";
import { walletSecret } from "@/lib/breez/seed";
import {
  counterAddress,
  counterEvent,
  sharedCounterEvent,
  sharedCounterKeys,
  takeInvoiceNumber
} from "@/lib/invoice/counter";
import {
  INVOICE_VERSION,
  fetchInvoices,
  invoiceAddress,
  invoiceEvent,
  newInvoiceId,
  type Invoice
} from "@/lib/invoice/record";
import { INVOICE_REFRESH_SECONDS, REFRESH_BACKDATE_SECONDS } from "@/lib/invoice/upkeep";
import type { NostrEvent } from "@/lib/nostr/event";
import { randomNostrKeys } from "@/lib/nostr/keys";
import { publishToRelays, type RelayCall } from "@/lib/nostr/pool";
import { sealRecord } from "@/lib/nostr/record";
import { RelayRefusal } from "@/lib/nostr/relay-errors";
import { deriveInvoiceKeys, deriveTeamKeys, invoiceCounterKey } from "@/lib/team/keys";

import { openTestAccount, testSeed } from "../../jest/account";
import type * as FileSystemFake from "../../jest/expo-file-system";
import type * as RelaysFake from "../../jest/nostr-relays";

/*
 * The invoices of "New invoice" on the relays (src/lib/invoice/upkeep.ts): every record on a
 * majority of the new list before a change of the account's relays is saved (an invoice never
 * disappears, a number is never given twice), what the list left gets meanwhile after it; at each
 * opening of the account, each record given to the relays that lack it, signed again once a year.
 */

// The wallet layer is the real one, over the fake SDK (the copy of the declarations reads it).
jest.mock("../lib/breez/config", () => ({
  ...jest.requireActual("../lib/breez/config"),
  getWalletConfig: () => ({ network: "mainnet", apiKey: "test-api-key" }),
  // Mainnet: invoices of "bc" (the app config has no network under Jest).
  getBreezNetwork: () => "mainnet"
}));

const nostr = jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");
const fileSystem = jest.requireMock<typeof FileSystemFake>("expo-file-system");

const NEXT = [
  "wss://relay-a.bakery.example",
  "wss://relay-b.bakery.example",
  "wss://relay-c.bakery.example"
];
const team = deriveTeamKeys(walletSecret(testSeed()));
const invoiceKeys = deriveInvoiceKeys(team);
const YEAR = new Date().getFullYear();
const nowUnix = () => Math.floor(Date.now() / 1000);
const YEARS = 365 * 24 * 3600;

function form(): InvoiceForm {
  return {
    recipient: {
      name: "Bastion Coffee LLC",
      street: "12 Gold Cross Street",
      postalCode: "1204",
      city: "Geneva",
      country: "CH",
      reference: ""
    },
    currency: { code: "CHF", digits: 2 },
    lines: [{ name: "Sourdough bread 800 g", quantity: 100, unitMinor: 650, vatRate: 260 }],
    dueDate: null,
    terms: "",
    legal: "",
    redirectUrl: null
  };
}

/** A call as the invoices' author, to `relays`. */
function call(relays: readonly string[]): RelayCall {
  return { relays, channel: "account", timeoutMs: 1000, authKey: invoiceKeys.nostr.secretKey };
}

/** Publishes `event` to the relays the account is on. */
async function publish(event: NostrEvent): Promise<NostrEvent> {
  await publishToRelays(event, call(DEFAULT_RELAYS));
  return event;
}

/** A draft saved `age` seconds ago, untouched since, on the account's relays (no number taken). */
async function oldDraft(age: number): Promise<Invoice> {
  const at = nowUnix() - age;
  const { recipient, currency, lines, terms, legal, redirectUrl } = form();
  const old: Invoice = {
    version: INVOICE_VERSION,
    id: newInvoiceId(),
    number: { year: new Date(at * 1000).getFullYear(), sequence: 7 },
    status: "draft",
    recipient,
    currency,
    lines,
    dueDate: null,
    dueAt: null,
    terms,
    legal,
    redirectUrl,
    createdAt: at,
    updatedAt: at,
    sent: null
  };
  await publish(invoiceEvent(invoiceKeys, old));
  return old;
}

function dTag(event: NostrEvent): string | undefined {
  return event.tags.find(([name]) => name === "d")?.[1];
}

/** What `relay` holds at `address`. */
function heldAt(relay: string, address: string): NostrEvent | undefined {
  return nostr.stored.get(relay)?.find((event) => dTag(event) === address);
}

/** Every relay of `list` refuses an event over 3 years old, as strfry does. */
function refuseOldEvents(list: readonly string[]): void {
  const publishEvent = nostr.publishEvent;
  jest.spyOn(nostr, "publishEvent").mockImplementation(async (url, event, options) => {
    if (list.includes(url) && event.created_at < nowUnix() - 3 * YEARS) {
      throw new RelayRefusal(url, "invalid: created_at too early");
    }
    return publishEvent(url, event, options);
  });
}

/** Until no relay call went out for a while: the copies in the background are over. */
async function settled(): Promise<void> {
  for (let count = -1; count !== nostr.calls.length;) {
    count = nostr.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

beforeEach(async () => {
  nostr.resetRelays();
  fileSystem.resetFileSystem();
  resetInvoicesUpkeep();
  await openTestAccount({ usage: "merchant", signUp: "done" });
});

afterEach(async () => {
  await settled();
  jest.restoreAllMocks();
  closeAccount();
});

describe("a change of the account's relays", () => {
  it("takes every invoice and the counter along before it is saved: shown at once, no number twice", async () => {
    const first = await saveDraft(form(), null, []);
    const second = await saveDraft(form(), null, [first]);
    expect(second.number.sequence).toBe(first.number.sequence + 1);
    await changeRelays(NEXT);
    expect(getAccountSettings()?.relays).toEqual(NEXT);
    // At once: nothing waits for a copy in the background.
    const read = await loadInvoices();
    expect(read.invoices.map(({ id }) => id).sort()).toEqual([first.id, second.id].sort());
    const third = await saveDraft(form(), null, []);
    expect(third.number).toEqual({
      year: second.number.year,
      sequence: second.number.sequence + 1
    });
  });

  it("takes along invoices over 3 years old, signed again: a relay would refuse them as they are", async () => {
    const old = await oldDraft(4 * YEARS);
    refuseOldEvents(NEXT);
    await changeRelays(NEXT);
    const read = await loadInvoices();
    expect(read.invoices.find(({ id }) => id === old.id)).toEqual(old);
  });

  it("is refused when the new relays do not take the invoices, before anything moves", async () => {
    await saveDraft(form(), null, []);
    // Every relay refuses the invoices' author from now on: the new list never gets them.
    nostr.refusedAuthors.add(invoiceKeys.nostr.publicKey);
    nostr.calls.length = 0;
    const refusal = changeRelays(NEXT);
    await expect(refusal).rejects.toBeInstanceOf(SettingsError);
    await expect(refusal).rejects.toMatchObject({ code: "unreachable" });
    expect(getAccountSettings()?.relays).toEqual(DEFAULT_RELAYS);
    // Nothing but the invoices' records was sent there: the team did not move.
    const sent = nostr.calls.filter(
      (call) => call.operation === "publish" && NEXT.includes(call.relay)
    );
    expect(sent.length).toBeGreaterThan(0);
    expect(sent.every(({ event }) => event!.pubkey === invoiceKeys.nostr.publicKey)).toBe(true);
  });
});

describe("the copy of the invoices, before the change", () => {
  it("takes every record as it is: invoices, removals, the counters, a newer app's", async () => {
    const kept = await saveDraft(form(), null, []);
    const removed = await saveDraft(form(), null, [kept]);
    await removeDraft(removed);
    const newer = await publish(
      sealRecord({
        type: "invoice",
        value: { version: INVOICE_VERSION + 1, id: "ab".repeat(16) },
        signer: invoiceKeys.nostr.secretKey,
        encryptionKey: invoiceKeys.encryptionKey,
        address: invoiceAddress(invoiceKeys, "ab".repeat(16)),
        createdAt: nowUnix()
      })
    );
    // A record of a type this app does not know, by the same author.
    const unknown = await publish(
      sealRecord({
        type: "invoice-template",
        value: { version: 1 },
        signer: invoiceKeys.nostr.secretKey,
        encryptionKey: invoiceKeys.encryptionKey,
        address: "cd".repeat(32),
        createdAt: nowUnix()
      })
    );
    const copy = await copyInvoices(team, DEFAULT_RELAYS, NEXT);
    const addresses = [
      invoiceAddress(invoiceKeys, kept.id),
      invoiceAddress(invoiceKeys, removed.id),
      dTag(newer)!,
      dTag(unknown)!,
      counterAddress(invoiceKeys),
      // The owner's copy of the counter it shares with its assistants.
      sharedCounterKeys(invoiceCounterKey(team)).address
    ];
    // The owner's author only: no assistant.
    expect([...copy!.keys()]).toEqual([invoiceKeys.nostr.publicKey]);
    expect(new Set(copy?.get(invoiceKeys.nostr.publicKey)?.copied.keys())).toEqual(
      new Set(addresses)
    );
    for (const relay of NEXT) {
      for (const address of addresses) {
        // As it is: the very event the list left holds.
        expect(heldAt(relay, address)).toEqual(heldAt(DEFAULT_RELAYS[0]!, address));
      }
    }
    const read = await fetchInvoices(invoiceKeys, call(NEXT));
    expect(read).toMatchObject({ invoices: [kept], newerUnreadable: true });
  });

  it("signs again what is unchanged for a year, dated a day ago: its value as it is", async () => {
    const old = await oldDraft(INVOICE_REFRESH_SECONDS + 3600);
    // The counters, of years ago.
    await publish(
      counterEvent(invoiceKeys, { version: 1, year: YEAR - 4, last: 31 }, nowUnix() - 4 * YEARS)
    );
    const shared = sharedCounterKeys(invoiceCounterKey(team));
    await publish(
      sharedCounterEvent(
        shared,
        invoiceKeys.nostr,
        { version: 1, year: YEAR - 4, last: 31 },
        nowUnix() - 4 * YEARS
      )
    );
    refuseOldEvents(NEXT);
    const before = nowUnix();
    await expect(copyInvoices(team, DEFAULT_RELAYS, NEXT)).resolves.not.toBeNull();
    for (const address of [
      invoiceAddress(invoiceKeys, old.id),
      counterAddress(invoiceKeys),
      shared.address
    ]) {
      const copied = heldAt(NEXT[0]!, address)!;
      expect(copied.created_at).toBeGreaterThanOrEqual(before - REFRESH_BACKDATE_SECONDS);
      expect(copied.created_at).toBeLessThanOrEqual(nowUnix() - REFRESH_BACKDATE_SECONDS);
    }
    const read = await fetchInvoices(invoiceKeys, call(NEXT));
    expect(read.invoices.find(({ id }) => id === old.id)).toEqual(old);
    // The numbers go on from the counter copied.
    await expect(takeInvoiceNumber(invoiceKeys, call(NEXT), YEAR - 4, nowUnix())).resolves.toEqual({
      year: YEAR - 4,
      sequence: 32
    });
  });

  it("is refused when fewer than a majority of the relays left answer", async () => {
    await saveDraft(form(), null, []);
    for (const relay of DEFAULT_RELAYS.slice(0, 3)) nostr.unreachable.add(relay);
    await expect(copyInvoices(team, DEFAULT_RELAYS, NEXT)).resolves.toBeNull();
  });

  it("is refused unless a majority of the new relays takes each record", async () => {
    const draft = await saveDraft(form(), null, []);
    nostr.readOnly.add(NEXT[0]!);
    nostr.readOnly.add(NEXT[1]!);
    await expect(copyInvoices(team, DEFAULT_RELAYS, NEXT)).resolves.toBeNull();
    nostr.readOnly.delete(NEXT[1]!);
    await expect(copyInvoices(team, DEFAULT_RELAYS, NEXT)).resolves.not.toBeNull();
    expect(heldAt(NEXT[1]!, invoiceAddress(invoiceKeys, draft.id))).toBeDefined();
  });

  it("never copies another author's events a relay sends", async () => {
    await saveDraft(form(), null, []);
    const stranger = randomNostrKeys();
    const foreign = sealRecord({
      type: "invoice",
      value: {},
      signer: stranger.secretKey,
      encryptionKey: invoiceKeys.encryptionKey,
      address: "ef".repeat(32),
      createdAt: nowUnix()
    });
    const queryEvents = nostr.queryEvents;
    jest.spyOn(nostr, "queryEvents").mockImplementation(async (url, filter, options) => {
      const events = await queryEvents(url, filter, options);
      // In its first page, as a relay would.
      return url === DEFAULT_RELAYS[0] && filter.until === undefined
        ? [foreign, ...events]
        : events;
    });
    // The new relays would refuse it: had it been copied, the change would be refused.
    nostr.refusedAuthors.add(stranger.publicKey);
    await expect(copyInvoices(team, DEFAULT_RELAYS, NEXT)).resolves.not.toBeNull();
    expect(nostr.stored.get(NEXT[0]!)?.some(({ id }) => id === foreign.id)).toBe(false);
  });

  it("is refused once the account closed", async () => {
    await saveDraft(form(), null, []);
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const keys = getAccountTeamKeys()!;
    closeAccount();
    await expect(copyInvoices(keys, DEFAULT_RELAYS, NEXT)).resolves.toBeNull();
  });

  it("is followed by what the list left gets meanwhile, once the change is saved", async () => {
    const first = await saveDraft(form(), null, []);
    const copy = await copyInvoices(team, DEFAULT_RELAYS, NEXT);
    // Another of the owner's devices, on the list left still, saves an invoice (a number taken).
    const late = await saveDraft(form(), null, [first]);
    nostr.calls.length = 0;
    await copyLateInvoices(team, DEFAULT_RELAYS, NEXT, copy!);
    // Only what changed since goes.
    const sent = nostr.calls.filter(({ operation }) => operation === "publish");
    expect(new Set(sent.map(({ event }) => dTag(event!)))).toEqual(
      new Set([
        invoiceAddress(invoiceKeys, late.id),
        counterAddress(invoiceKeys),
        sharedCounterKeys(invoiceCounterKey(team)).address
      ])
    );
    const read = await fetchInvoices(invoiceKeys, call(NEXT));
    expect(read.invoices.map(({ id }) => id).sort()).toEqual([first.id, late.id].sort());
    await expect(takeInvoiceNumber(invoiceKeys, call(NEXT), YEAR, nowUnix())).resolves.toEqual({
      year: YEAR,
      sequence: late.number.sequence + 1
    });
  });
});

describe("the upkeep of the invoices, at each opening of the account", () => {
  it("gives each record to the relays that lost it, as it is", async () => {
    const draft = await saveDraft(form(), null, []);
    const address = invoiceAddress(invoiceKeys, draft.id);
    const original = heldAt(DEFAULT_RELAYS[0]!, address)!;
    for (const relay of DEFAULT_RELAYS.slice(0, 3)) {
      nostr.stored.set(
        relay,
        nostr.stored.get(relay)!.filter((event) => dTag(event) !== address)
      );
    }
    await keepInvoices();
    for (const relay of DEFAULT_RELAYS) expect(heldAt(relay, address)).toEqual(original);
  });

  it("signs again a record unchanged for a year, dated a day ago, on every relay", async () => {
    const old = await oldDraft(INVOICE_REFRESH_SECONDS + 3600);
    const recent = await saveDraft(form(), null, []);
    const recentEvent = heldAt(DEFAULT_RELAYS[0]!, invoiceAddress(invoiceKeys, recent.id))!;
    const now = nowUnix();
    await keepInvoices(now);
    for (const relay of DEFAULT_RELAYS) {
      expect(heldAt(relay, invoiceAddress(invoiceKeys, old.id))!.created_at).toBe(
        now - REFRESH_BACKDATE_SECONDS
      );
      // Not due: as it was.
      expect(heldAt(relay, invoiceAddress(invoiceKeys, recent.id))).toEqual(recentEvent);
    }
    const read = await loadInvoices();
    expect(read.invoices.find(({ id }) => id === old.id)).toEqual(old);
  });

  it("never wins over a change another device makes meanwhile", async () => {
    const old = await oldDraft(2 * YEARS);
    const address = invoiceAddress(invoiceKeys, old.id);
    const release = nostr.holdPublishes();
    const upkeep = keepInvoices();
    // Read, its copy signed again on its way: another device's change reaches the relays first.
    while (!nostr.calls.some(({ operation }) => operation === "publish")) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    const changed: Invoice = { ...old, terms: "Net 10 days", updatedAt: nowUnix() };
    const change = invoiceEvent(invoiceKeys, changed);
    for (const relay of DEFAULT_RELAYS) {
      nostr.stored.set(relay, [
        ...nostr.stored.get(relay)!.filter((event) => dTag(event) !== address),
        change
      ]);
    }
    release();
    await upkeep;
    for (const relay of DEFAULT_RELAYS) expect(heldAt(relay, address)).toEqual(change);
    const read = await loadInvoices();
    expect(read.invoices.find(({ id }) => id === old.id)).toEqual(changed);
  });

  it("signs nothing again when fewer than a majority of the relays answer, but repairs", async () => {
    const old = await oldDraft(INVOICE_REFRESH_SECONDS + 3600);
    const address = invoiceAddress(invoiceKeys, old.id);
    const original = heldAt(DEFAULT_RELAYS[0]!, address)!;
    // Lost by one relay that answers; three do not answer: what they hold is unknown.
    nostr.stored.set(
      DEFAULT_RELAYS[4]!,
      nostr.stored.get(DEFAULT_RELAYS[4]!)!.filter((event) => dTag(event) !== address)
    );
    for (const relay of DEFAULT_RELAYS.slice(0, 3)) nostr.unreachable.add(relay);
    await keepInvoices();
    expect(heldAt(DEFAULT_RELAYS[4]!, address)).toEqual(original);
    expect(heldAt(DEFAULT_RELAYS[3]!, address)).toEqual(original);
  });

  it("goes at most once a day for an account, again sooner when the relays did not answer", async () => {
    const draft = await saveDraft(form(), null, []);
    const address = invoiceAddress(invoiceKeys, draft.id);
    const lose = () =>
      nostr.stored.set(
        DEFAULT_RELAYS[0]!,
        nostr.stored.get(DEFAULT_RELAYS[0]!)!.filter((event) => dTag(event) !== address)
      );
    // Fewer than a majority answer: tried again at the next opening.
    for (const relay of DEFAULT_RELAYS.slice(2)) nostr.unreachable.add(relay);
    const now = nowUnix();
    await keepInvoices(now);
    nostr.unreachable.clear();
    lose();
    await keepInvoices(now + 60);
    expect(heldAt(DEFAULT_RELAYS[0]!, address)).toBeDefined();
    // Done: not again that day.
    lose();
    await keepInvoices(now + 120);
    expect(heldAt(DEFAULT_RELAYS[0]!, address)).toBeUndefined();
    await keepInvoices(now + 60 + INVOICES_UPKEEP_INTERVAL_SECONDS);
    expect(heldAt(DEFAULT_RELAYS[0]!, address)).toBeDefined();
  });

  it("is left alone for a card holder's account: no invoice there", async () => {
    closeAccount();
    await openTestAccount({ usage: "card", signUp: "done" });
    nostr.calls.length = 0;
    await keepInvoices();
    expect(nostr.calls).toEqual([]);
  });
});
