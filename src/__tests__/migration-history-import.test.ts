import {
  closeAccount,
  getAccountSettings,
  getAccountTeamKeys,
  updateAccount,
  whenBackedUp
} from "@/features/account/session";
import {
  copyLegacyHistory,
  getHistoryImportStatus,
  markLegacyHistoryPending,
  readLegacyHistory,
  resetHistoryImport,
  startLegacyHistoryImport,
  subscribeHistoryImport,
  type HistoryImportStatus
} from "@/features/migration/history-import";
import { holdLegacySession } from "@/features/migration/legacy-session";
import { legacyRowRef } from "@/lib/legacy-v2/history";
import * as log from "@/lib/log/log";
import { historyOf } from "@/lib/legacy-v2/history-records";
import { deriveLegacyHistoryKeys } from "@/lib/team/keys";

import { openMerchantAccount, openTestAccount } from "../../jest/account";
import { acceptSession, legacyV2 } from "../../jest/legacy-v2-server";
import type * as RelaysFake from "../../jest/nostr-relays";

/*
 * The copy of the v2 account's history to the account's relays (history-import.ts): every page
 * read, each row its price of then, each month written once whole, the state closing it, the v2
 * session closed whatever happens; read back for "Wallet". Over the fake v2 server and the fake
 * relays.
 */

const relays = jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");

/** 3 October 2026, 13:10:30 UTC, and a payment of September. */
const OCTOBER = 1_791_033_030;
const SEPTEMBER = OCTOBER - 30 * 86_400;
const REFRESH = "refresh-of-the-owner-0001";
const AUTH = "auth-of-the-owner-00000001";

/** The v2 account, as `GET /account` answers it: its name is each sale's title (history.ts). */
const NAME = "Lakeside Bakery";
const ACCOUNT = {
  id: "0192a3b4-c5d6-7e8f-9a0b-0000000000aa",
  name: NAME,
  mail: "carol@example.ch"
};

/** A sale of the v2 point of sale: the account's name as its title, its note as its description. */
function sale(id: string, at: number, fields: Record<string, unknown> = {}) {
  return {
    id,
    status: "settled",
    tag: "invoice-tpos",
    amount_sat: 25_000,
    created_at: at - 60,
    paid_at: at,
    title: NAME,
    description: `Sale ${id}`,
    input: { unit: "CHF", amount: 12.5 },
    ...fields
  };
}

function session() {
  acceptSession(REFRESH, AUTH);
  return { authToken: AUTH, refreshToken: REFRESH };
}

/** The history's records the relays hold (each relay's), opened. */
function held() {
  const team = getAccountTeamKeys()!;
  const keys = deriveLegacyHistoryKeys(team);
  const answers = new Map(
    [...relays.stored].map(([relay, events]) => [
      relay,
      events.filter((event) => event.pubkey === keys.nostr.publicKey)
    ])
  );
  return historyOf(keys, answers);
}

beforeEach(async () => {
  relays.resetRelays();
  resetHistoryImport();
  await openMerchantAccount({ displayCurrency: "CHF" });
  legacyV2.account = ACCOUNT;
  legacyV2.rates.set("CHF", [
    { time: SEPTEMBER, price: 55_000 },
    { time: OCTOBER - 300, price: 60_000.25 }
  ]);
});

afterEach(() => closeAccount());

describe("startLegacyHistoryImport", () => {
  it("copies every month of the history, each row its price, then says it is done", async () => {
    legacyV2.payments = [
      sale("id-0001", SEPTEMBER),
      sale("id-0002", OCTOBER),
      sale("id-0003", OCTOBER, { tag: "withdraw", amount_sat: -40_000, input: null, title: null }),
      sale("id-0004", OCTOBER, { status: "expired", paid_at: null })
    ];

    const outcome = await startLegacyHistoryImport(session());

    expect(outcome).toEqual({ phase: "done", rows: 3 });
    expect(getHistoryImportStatus()).toEqual({ phase: "done", rows: 3 });
    const read = held();
    expect(read.state?.state.done).toBeGreaterThan(0);
    const history = await readLegacyHistory();
    expect(history?.done).toBe(true);
    const rows = [...(history?.rows ?? [])].sort((a, b) => a.at - b.at);
    // The settled rows of the scope only: the expired invoice is not copied.
    expect(rows.map(({ ref }) => ref).sort()).toEqual(
      [legacyRowRef("id-0001"), legacyRowRef("id-0002"), legacyRowRef("id-0003")].sort()
    );
    expect(rows.find(({ ref }) => ref === legacyRowRef("id-0001"))).toMatchObject({
      kind: "sale",
      fiat: { minor: 1250, currency: "CHF" },
      rate: { price: 55_000, currency: "CHF" }
    });
    expect(rows.find(({ ref }) => ref === legacyRowRef("id-0003"))).toMatchObject({
      kind: "withdraw",
      sats: 40_000n,
      fiat: null,
      rate: { price: 60_000.25, currency: "CHF" }
    });
    // Every relay of the account holds both months and the state.
    const settings = getAccountSettings()!;
    for (const relay of settings.relays) {
      const ofRelay = read.held.get(relay);
      expect(ofRelay?.size).toBe(3);
    }
    // The session closed once done.
    expect(legacyV2.loggedOut).toEqual([REFRESH]);
  });

  it("tells how far it is: the rows read, then the rows written of every row read", async () => {
    legacyV2.payments = [
      sale("id-0001", SEPTEMBER),
      sale("id-0002", OCTOBER),
      sale("id-0003", OCTOBER)
    ];
    const seen: HistoryImportStatus[] = [];
    const stop = subscribeHistoryImport(() => seen.push(getHistoryImportStatus()));

    await startLegacyHistoryImport(session());
    stop();

    // Read on one page, then the oldest month (one row) written before October (two rows).
    expect(seen).toEqual([
      { phase: "running", step: "reading", rows: 0 },
      { phase: "running", step: "reading", rows: 3 },
      // The last page, empty: nothing more read.
      { phase: "running", step: "reading", rows: 3 },
      { phase: "running", step: "writing", copied: 0, total: 3 },
      { phase: "running", step: "writing", copied: 1, total: 3 },
      { phase: "running", step: "writing", copied: 3, total: 3 },
      { phase: "done", rows: 3 }
    ]);
  });

  it("counts no month the relays did not take", async () => {
    legacyV2.payments = [sale("id-0001", SEPTEMBER)];
    const seen: HistoryImportStatus[] = [];
    // The state is taken, then every relay refuses what comes before the month is written.
    const stop = subscribeHistoryImport(() => {
      const now = getHistoryImportStatus();
      seen.push(now);
      if (now.phase === "running" && now.step === "writing") {
        for (const relay of getAccountSettings()!.relays) relays.readOnly.add(relay);
      }
    });

    await expect(startLegacyHistoryImport(session())).resolves.toEqual({ phase: "failed" });
    stop();
    relays.readOnly.clear();

    expect(seen).toContainEqual({ phase: "running", step: "writing", copied: 0, total: 1 });
    expect(seen).not.toContainEqual({ phase: "running", step: "writing", copied: 1, total: 1 });
  });

  it("writes nothing again for a history copied already, and adds what came since", async () => {
    legacyV2.payments = [sale("id-0001", SEPTEMBER)];
    await startLegacyHistoryImport(session());
    const before = relays.stored.get(getAccountSettings()!.relays[0]!)!.length;

    resetHistoryImport();
    await startLegacyHistoryImport(session());
    expect(relays.stored.get(getAccountSettings()!.relays[0]!)!.length).toBe(before);

    legacyV2.payments.push(sale("id-0002", SEPTEMBER + 60));
    resetHistoryImport();
    await startLegacyHistoryImport(session());
    const history = await readLegacyHistory();
    expect(history?.rows.map(({ ref }) => ref).sort()).toEqual(
      [legacyRowRef("id-0001"), legacyRowRef("id-0002")].sort()
    );
  });

  it("writes again a month a minority of the relays holds, never taking it for copied", async () => {
    legacyV2.payments = [sale("id-0001", SEPTEMBER)];
    await startLegacyHistoryImport(session());
    // The month's part lost by every relay but the first (an earlier write a minority took).
    const [first, ...others] = getAccountSettings()!.relays;
    const part = [...held().parts.keys()][0]!;
    const atPart = (event: { tags: string[][] }) =>
      event.tags.some(([name, value]) => name === "d" && value === part);
    for (const relay of others) {
      relays.stored.set(
        relay,
        (relays.stored.get(relay) ?? []).filter((e) => !atPart(e))
      );
    }
    expect(relays.stored.get(first!)!.some(atPart)).toBe(true);

    resetHistoryImport();
    await expect(startLegacyHistoryImport(session())).resolves.toEqual({ phase: "done", rows: 1 });
    for (const relay of others) expect(relays.stored.get(relay)!.some(atPart)).toBe(true);
  });

  it("keeps each row's note as the v2 apps showed it, the account's name read first", async () => {
    legacyV2.payments = [
      sale("id-0001", SEPTEMBER),
      sale("id-0002", SEPTEMBER, { description: null }),
      sale("id-0003", SEPTEMBER, { tag: "invoice-web", title: "Invoice 42", description: null }),
      sale("id-0004", SEPTEMBER, { tag: "invoice-web", description: "Workshop" })
    ];
    await expect(startLegacyHistoryImport(session())).resolves.toEqual({
      phase: "done",
      rows: 4
    });
    const notes = new Map(
      ((await readLegacyHistory())?.rows ?? []).map(({ ref, note }) => [ref, note])
    );
    expect(notes).toEqual(
      new Map([
        // The point of sale's note; its title, the account's name, never.
        [legacyRowRef("id-0001"), "Sale id-0001"],
        [legacyRowRef("id-0002"), ""],
        // An invoice's own title; the account's name, the v2 server's default title, never.
        [legacyRowRef("id-0003"), "Invoice 42"],
        [legacyRowRef("id-0004"), "Workshop"]
      ])
    );
    const asked = legacyV2.calls.map(({ method, path }) => `${method} ${path}`);
    expect(asked.indexOf("GET /account")).toBeGreaterThanOrEqual(0);
    expect(asked.indexOf("GET /account")).toBeLessThan(
      asked.indexOf("GET /api/records/v1/apipayments")
    );
  });

  it("copies nothing when the v2 account cannot be read, the session closed", async () => {
    legacyV2.payments = [sale("id-0001", SEPTEMBER)];
    legacyV2.account = null;
    await expect(startLegacyHistoryImport(session())).resolves.toEqual({ phase: "failed" });
    expect(legacyV2.calls.some(({ path }) => path.startsWith("/api/records/"))).toBe(false);
    // Started, to finish from "Settings".
    await expect(readLegacyHistory()).resolves.toMatchObject({ done: false, pending: true });
    expect(legacyV2.loggedOut).toEqual([REFRESH]);
  });

  it("renews the session once when its token expired during the read", async () => {
    legacyV2.payments = [sale("id-0001", SEPTEMBER)];
    // Its short-lived token is no longer taken: renewed with its refresh token.
    legacyV2.refreshTokens.add(REFRESH);
    const outcome = await startLegacyHistoryImport({
      authToken: "expired-token-0000000001",
      refreshToken: REFRESH
    });
    expect(outcome.phase).toBe("done");
    const asked = legacyV2.calls.map(({ method, path }) => `${method} ${path}`);
    expect(asked.filter((call) => call === "POST /api/auth/v1/refresh")).toHaveLength(1);
    // Renewed at its first call, the account's read, then used for every page.
    const pages = legacyV2.calls.filter(({ path }) => path === "/api/records/v1/apipayments");
    expect(pages.length).toBeGreaterThan(0);
    expect(
      pages.every(({ authorization }) => authorization !== "Bearer expired-token-0000000001")
    ).toBe(true);
    // Closed with the renewed token: the first one is no longer taken.
    const logout = legacyV2.calls.find(({ path }) => path === "/api/auth/v1/logout");
    expect(logout?.authorization).toMatch(/^Bearer /);
    expect(logout?.authorization).not.toBe("Bearer expired-token-0000000001");
    expect(legacyV2.loggedOut).toEqual([REFRESH]);
  });

  it('says the copy started before reading the v2 server, so that "Settings" can finish it', async () => {
    legacyV2.payments = [sale("id-0001", SEPTEMBER)];
    legacyV2.ratesDown = true;
    await expect(startLegacyHistoryImport(session())).resolves.toEqual({ phase: "failed" });
    expect(held().state?.state).toEqual({ done: null });
    await expect(readLegacyHistory()).resolves.toMatchObject({ done: false, pending: true });
    // Finished later: done, no longer pending.
    legacyV2.ratesDown = false;
    resetHistoryImport();
    await startLegacyHistoryImport(session());
    await expect(readLegacyHistory()).resolves.toMatchObject({ done: true, pending: false });
  });

  it("starts nothing without a majority of the relays read, the session closed", async () => {
    legacyV2.payments = [sale("id-0001", SEPTEMBER)];
    for (const relay of getAccountSettings()!.relays.slice(0, 3)) relays.unreachable.add(relay);
    await expect(startLegacyHistoryImport(session())).resolves.toEqual({ phase: "failed" });
    expect(legacyV2.calls.some(({ path }) => path.startsWith("/api/records/"))).toBe(false);
    expect(legacyV2.loggedOut).toEqual([REFRESH]);
  });

  it("stops when the account's relays change during the copy, writing nothing more", async () => {
    legacyV2.payments = [sale("id-0001", SEPTEMBER), sale("id-0002", OCTOBER)];
    const copy = startLegacyHistoryImport(session());
    // While the copy runs: the account moves to other relays.
    const moved = await updateAccount({
      relays: ["wss://moved-1.example", "wss://moved-2.example", "wss://moved-3.example"]
    });
    await expect(copy).resolves.toEqual({ phase: "failed" });
    // The settings' backup to the new relays, done within the test.
    await whenBackedUp(moved);
    // The state of a copy started only: no month, nothing said done.
    expect(held().parts.size).toBe(0);
    expect(held().state?.state).toEqual({ done: null });
  });

  it("tells another account opened since nothing of the copy", async () => {
    legacyV2.payments = [sale("id-0001", SEPTEMBER)];
    await startLegacyHistoryImport(session());
    expect(getHistoryImportStatus().phase).toBe("done");
    closeAccount();
    await openTestAccount();
    expect(getHistoryImportStatus()).toEqual({ phase: "idle" });
  });

  it("fails without a word of done when the relays do not take it, the session closed", async () => {
    legacyV2.payments = [sale("id-0001", SEPTEMBER)];
    for (const relay of getAccountSettings()!.relays) relays.readOnly.add(relay);
    await expect(startLegacyHistoryImport(session())).resolves.toEqual({ phase: "failed" });
    expect(legacyV2.loggedOut).toEqual([REFRESH]);
    relays.readOnly.clear();
    expect((await readLegacyHistory())?.done).toBe(false);
  });

  it("says in the journal that rows out of shape were left out, the others copied", async () => {
    const failures = jest.spyOn(log, "logFailure");
    legacyV2.payments = [sale("id-0001", SEPTEMBER), sale("id-0002", SEPTEMBER, { paid_at: 5 })];
    await expect(startLegacyHistoryImport(session())).resolves.toEqual({ phase: "done", rows: 1 });
    expect(failures).toHaveBeenCalledWith("The v2 history had rows out of shape, left out");
    failures.mockRestore();
  });

  it("fails when the v2 server does not answer, nothing written", async () => {
    legacyV2.payments = [sale("id-0001", SEPTEMBER)];
    legacyV2.ratesDown = true;
    await expect(startLegacyHistoryImport(session())).resolves.toEqual({ phase: "failed" });
    expect(held().parts.size).toBe(0);
    expect(legacyV2.loggedOut).toEqual([REFRESH]);
  });

  it("starts with the session the migration holds, and once at a time", async () => {
    legacyV2.payments = [sale("id-0001", SEPTEMBER)];
    holdLegacySession(session());
    const first = startLegacyHistoryImport();
    // Asked again meanwhile: the running copy (the second session closed at once).
    const second = startLegacyHistoryImport({ authToken: AUTH, refreshToken: "other-refresh-001" });
    expect(await first).toEqual(await second);
    expect(legacyV2.loggedOut.sort()).toEqual([REFRESH, "other-refresh-001"].sort());
    // Nothing held: nothing to start.
    resetHistoryImport();
    await expect(startLegacyHistoryImport()).resolves.toEqual({ phase: "idle" });
  });
});

describe("readLegacyHistory", () => {
  it("signs again, dated then, every record unchanged for a year", async () => {
    legacyV2.payments = [sale("id-0001", SEPTEMBER)];
    await startLegacyHistoryImport(session());
    const dates = () => [...held().events.values()].map(({ created_at }) => created_at);
    const first = dates();
    const later = Math.max(...first) + 366 * 86_400;
    const history = await readLegacyHistory(later);
    expect(history?.rows).toHaveLength(1);
    expect(dates()).toEqual(first.map(() => later));
    // Not again within the year.
    await readLegacyHistory(later + 86_400);
    expect(dates()).toEqual(first.map(() => later));
  });

  it("reads nothing without a majority of the relays", async () => {
    for (const relay of getAccountSettings()!.relays.slice(0, 3)) relays.unreachable.add(relay);
    await expect(readLegacyHistory()).resolves.toBeNull();
    relays.unreachable.clear();
    await expect(readLegacyHistory()).resolves.toEqual({ rows: [], done: false, pending: false });
  });

  it("says a copy is to be made once the migration marked it, never over one finished", async () => {
    await markLegacyHistoryPending();
    await expect(readLegacyHistory()).resolves.toEqual({ rows: [], done: false, pending: true });

    legacyV2.payments = [sale("id-0001", SEPTEMBER)];
    await startLegacyHistoryImport(session());
    resetHistoryImport();
    await markLegacyHistoryPending();
    await expect(readLegacyHistory()).resolves.toMatchObject({ done: true, pending: false });
  });

  it("writes the mark again when a minority only took it, never forgetting it is owed", async () => {
    const [first, ...others] = getAccountSettings()!.relays;
    for (const relay of others) relays.readOnly.add(relay);
    await markLegacyHistoryPending();
    expect(held().held.get(first!)?.size).toBe(1);
    relays.readOnly.clear();

    // The same run of the app, which learnt the state its write left on one relay.
    await markLegacyHistoryPending();
    for (const relay of others) expect(held().held.get(relay)?.size).toBe(1);
    expect(held().state?.state).toEqual({ done: null });
  });

  it("gives the export its read without signing anything again", async () => {
    legacyV2.payments = [sale("id-0001", SEPTEMBER)];
    await startLegacyHistoryImport(session());
    const dates = () => [...held().events.values()].map(({ created_at }) => created_at);
    const first = dates();
    const later = Math.max(...first) + 366 * 86_400;
    await expect(readLegacyHistory(later, { refresh: false })).resolves.toMatchObject({
      done: true
    });
    expect(dates()).toEqual(first);
  });

  it("reads the relays again at each call: what another device wrote shows", async () => {
    await expect(readLegacyHistory()).resolves.toMatchObject({ rows: [] });
    legacyV2.payments = [sale("id-0001", SEPTEMBER)];
    await startLegacyHistoryImport(session());
    // Another run of the app knows nothing: it reads what the first wrote.
    resetHistoryImport();
    await expect(readLegacyHistory()).resolves.toMatchObject({ rows: [{ kind: "sale" }] });
  });
});

describe("copyLegacyHistory", () => {
  it("copies the history to the account's new relays", async () => {
    legacyV2.payments = [sale("id-0001", SEPTEMBER)];
    await startLegacyHistoryImport(session());
    const before = getAccountSettings()!.relays;
    const next = ["wss://new-1.example", "wss://new-2.example", "wss://new-3.example"];
    await expect(copyLegacyHistory(getAccountTeamKeys()!, before, next)).resolves.toBe(true);
    for (const relay of next) expect(relays.stored.get(relay)?.length).toBe(2);
  });
});
