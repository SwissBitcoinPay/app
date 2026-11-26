import vectors from "./fixtures/legacy-v2-handoff.json";

import { LEGACY_V2_HANDOFF_PATH, LEGACY_V2_WEB_ORIGINS } from "@/config/legacy-v2";
import { bytesToBase64Url } from "@/lib/base64";
import {
  beginMigration,
  migrationEmail,
  readWithLegacySession,
  readLegacyAccount,
  forgetLegacyAccount,
  resetMigration
} from "@/features/migration/flow";
import {
  LEGACY_HANDOFF_PREFIX,
  LEGACY_TILL_KEY,
  legacyHandoffFetchUrl,
  legacyHandoffFragment,
  legacyHandoffPendingText,
  legacyTillText,
  newLegacyHandoffNonce,
  parseLegacyHandoff,
  parseLegacyHandoffPending,
  parseLegacyHandoffRequest,
  parseLegacyTill
} from "@/lib/legacy-v2/handoff";
import type * as WebStore from "@/lib/legacy-v2/store.web";

import { legacyV2 } from "../../jest/legacy-v2-server";

/*
 * The hand-off of the v2 web apps (`app.` and `dashboard.swiss-bitcoin-pay.ch`) to this web app:
 * its three steps and format, its vectors (src/__tests__/fixtures/legacy-v2-handoff.json), what
 * this app takes of it and on what proof, how the browser keeps it, and the migration it starts.
 */

const NONCE = vectors.nonce;
const ID = "0192a3b4-c5d6-7e8f-9a0b-1c2d3e4f5a6b";
const TOKEN = "eyJhbGciOiJFZERTQSJ9.eyJzdWIiOiJ4In0.c2lnbmF0dXJlX29mX3RoZV90b2tlbg";
const TTL = 30 * 60 * 1000;

type Expected = {
  role: string;
  account: Record<string, unknown> | null;
  token: string | null;
};

describe("the hand-off's format", () => {
  it("is the one of the shared vectors, each of its three steps", () => {
    expect(vectors.origins).toEqual(LEGACY_V2_WEB_ORIGINS);
    expect(vectors.fetchPath).toBe(LEGACY_V2_HANDOFF_PATH);
    expect(parseLegacyHandoffRequest(vectors.requests.app)).toBe("app");
    expect(parseLegacyHandoffRequest(vectors.requests.dashboard)).toBe("dashboard");
    expect(legacyHandoffFetchUrl("app", NONCE)).toBe(
      `https://app.swiss-bitcoin-pay.ch/sattleme#n=${NONCE}`
    );
    expect(legacyHandoffFetchUrl("dashboard", NONCE)).toBe(
      `https://dashboard.swiss-bitcoin-pay.ch/sattleme#n=${NONCE}`
    );
    expect(vectors.vectors.length).toBeGreaterThanOrEqual(4);
    for (const vector of vectors.vectors) {
      expect(legacyHandoffFragment(vector.payload)).toBe(vector.fragment);
      const expected = vector.expected as Expected;
      expect(parseLegacyHandoff(vector.fragment, NONCE)).toEqual({
        role: expected.role,
        account: expected.account,
        tokens: expected.token ? { authToken: expected.token, refreshToken: null } : null
      });
    }
  });

  it("asks only the two v2 web apps, by name: never another origin", () => {
    for (const fragment of [
      "#sbp-from=",
      "#sbp-from=card",
      "#sbp-from=https://evil.example",
      "#sbp-from=app&x",
      "#sbp-from=APP",
      "#sbp=app"
    ]) {
      expect(parseLegacyHandoffRequest(fragment)).toBeNull();
    }
  });

  it("draws a new nonce of 16 random bytes for each request", () => {
    const bytes = new Uint8Array([...Array(16).keys()]);
    expect(newLegacyHandoffNonce(() => bytes)).toBe(NONCE);
    expect(newLegacyHandoffNonce((length) => new Uint8Array(length).fill(255))).toHaveLength(22);
  });

  it("is no hand-off without its prefix: another link's fragment is left alone", () => {
    expect(parseLegacyHandoff("", NONCE)).toBeNull();
    expect(parseLegacyHandoff("#0192a3b4.abc", NONCE)).toBeNull();
    expect(parseLegacyHandoff("#sbp", NONCE)).toBeNull();
    expect(parseLegacyHandoff("#sbp-from=app", NONCE)).toBeNull();
  });

  it("is taken only with the nonce its tab waits for", () => {
    const fragment = vectors.vectors[0].fragment;
    expect(parseLegacyHandoff(fragment, NONCE)).toMatchObject({ role: "owner" });
    // A link made elsewhere: no request awaited, or another one's.
    expect(parseLegacyHandoff(fragment, null)).toEqual({ refused: "nonce" });
    expect(parseLegacyHandoff(fragment, "B".repeat(22))).toEqual({ refused: "nonce" });
    expect(
      parseLegacyHandoff(legacyHandoffFragment({ v: 1, role: "owner", token: TOKEN }), NONCE)
    ).toEqual({ refused: "nonce" });
  });

  it("refuses what no v2 web app built", () => {
    const refused = (fragment: string) => parseLegacyHandoff(fragment, NONCE);
    const encoded = (text: string) =>
      LEGACY_HANDOFF_PREFIX + bytesToBase64Url(new TextEncoder().encode(text));
    expect(refused(`${LEGACY_HANDOFF_PREFIX}not base64!`)).toEqual({ refused: "shape" });
    // Padded, or not canonical: one hand-off, one spelling.
    expect(refused(`${legacyHandoffFragment({ v: 1, nonce: NONCE, role: "owner" })}==`)).toEqual({
      refused: "shape"
    });
    expect(refused(encoded("{not json"))).toEqual({ refused: "shape" });
    expect(refused(encoded("[1]"))).toEqual({ refused: "shape" });
    expect(refused(LEGACY_HANDOFF_PREFIX + bytesToBase64Url(new Uint8Array([0xff, 0xfe])))).toEqual(
      { refused: "shape" }
    );
    expect(refused(legacyHandoffFragment({ v: 1, nonce: NONCE, role: "admin" }))).toEqual({
      refused: "shape"
    });
    expect(refused(legacyHandoffFragment({ nonce: NONCE, role: "owner" }))).toEqual({
      refused: "version"
    });
    expect(refused(legacyHandoffFragment({ v: 2, nonce: NONCE, role: "owner" }))).toEqual({
      refused: "version"
    });
    expect(
      refused(
        legacyHandoffFragment({ v: 1, nonce: NONCE, role: "owner", name: "x".repeat(20_000) })
      )
    ).toEqual({ refused: "shape" });
  });

  it("takes a field out of shape as unsaid, and a till's token never", () => {
    const parse = (payload: Record<string, unknown>) =>
      parseLegacyHandoff(legacyHandoffFragment({ v: 1, nonce: NONCE, ...payload }), NONCE);
    // A token that could not go in a header is none.
    expect(parse({ role: "owner", token: `${TOKEN}\r\nX: y` })).toEqual({
      role: "owner",
      account: null,
      tokens: null
    });
    expect(parse({ role: "employee", token: TOKEN })).toEqual({
      role: "employee",
      account: null,
      tokens: null
    });
    expect(parse({ role: "owner", account: { id: "1", name: "Studio" } })).toEqual({
      role: "owner",
      account: null,
      tokens: null
    });
    expect(
      parse({
        role: "owner",
        account: { id: ID.toUpperCase(), name: " ", currency: "chf", mail: "not an e-mail" }
      })
    ).toEqual({
      role: "owner",
      account: { id: ID, name: null, currency: null, onchain: null, email: null },
      tokens: null
    });
  });
});

describe("a request awaiting its hand-off", () => {
  const now = 1_800_000_000_000;

  it("is awaited for half an hour", () => {
    const text = legacyHandoffPendingText({ nonce: NONCE, at: now });
    expect(parseLegacyHandoffPending(text, now)).toEqual({ nonce: NONCE, at: now });
    expect(parseLegacyHandoffPending(text, now + TTL)).toEqual({ nonce: NONCE, at: now });
    expect(parseLegacyHandoffPending(text, now + TTL + 1)).toBeNull();
    // A clock set back: no request of the future.
    expect(parseLegacyHandoffPending(text, now - 1)).toBeNull();
  });

  it("is nothing of another shape", () => {
    expect(parseLegacyHandoffPending(null, now)).toBeNull();
    expect(parseLegacyHandoffPending("{", now)).toBeNull();
    expect(parseLegacyHandoffPending(JSON.stringify({ nonce: "short", at: now }), now)).toBeNull();
    expect(parseLegacyHandoffPending(JSON.stringify({ nonce: NONCE }), now)).toBeNull();
  });
});

describe("a till's hand-off as kept", () => {
  it("reads back what it wrote, its account whole", () => {
    const account = { id: ID, name: "Café", currency: "EUR", onchain: true, email: null };
    expect(parseLegacyTill(legacyTillText(account))).toEqual({ account });
    expect(parseLegacyTill(legacyTillText(null))).toEqual({ account: null });
  });

  it("takes nothing of another shape, and says a newer app's", () => {
    expect(parseLegacyTill(null)).toBeUndefined();
    expect(parseLegacyTill("{")).toBeUndefined();
    expect(parseLegacyTill(JSON.stringify({ version: 1, account: { id: "1" } }))).toBeUndefined();
    expect(parseLegacyTill(JSON.stringify({ version: 0, account: null }))).toBeUndefined();
    expect(() => parseLegacyTill(JSON.stringify({ version: 2 }))).toThrow(
      "A newer app's hand-off of a v2 till"
    );
  });

  it("keeps its name", () => {
    // IRREVERSIBLE: browsers keep it (handoff.ts).
    expect(LEGACY_TILL_KEY).toBe("legacy-v2-till");
  });
});

describe("the hand-off in the browser", () => {
  const entries = new Map<string, string>();
  const session = new Map<string, string>();
  const replaced: string[] = [];
  const left: string[] = [];
  const page = { href: "" };
  let web: typeof WebStore;
  const saved: Record<string, PropertyDescriptor | undefined> = {};

  /** Opens the page at `url`, as a new load of the web app (its modules anew), and captures. */
  function open(url: string) {
    page.href = url;
    jest.isolateModules(() => {
      web = jest.requireActual<typeof WebStore>("@/lib/legacy-v2/store.web");
    });
    web.captureLegacyHandoff();
  }

  /** The three steps, as the v2 web app `app` answers with `payload` (the nonce it was given). */
  function handOff(app: "app" | "dashboard", payload: Record<string, unknown>) {
    open(`https://web.example/${vectors.requests[app]}`);
    const fetchUrl = left.at(-1) ?? "";
    expect(fetchUrl.startsWith(`${LEGACY_V2_WEB_ORIGINS[app]}/sattleme#n=`)).toBe(true);
    const nonce = fetchUrl.slice(fetchUrl.indexOf("#n=") + 3);
    open(`https://web.example/${legacyHandoffFragment({ ...payload, v: 1, nonce })}`);
  }

  const storage = (map: Map<string, string>) => ({
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, String(value)),
    removeItem: (key: string) => void map.delete(key)
  });

  beforeAll(() => {
    for (const name of ["localStorage", "sessionStorage", "location", "history"]) {
      saved[name] = Object.getOwnPropertyDescriptor(globalThis, name);
    }
    const define = (name: string, value: unknown) =>
      Object.defineProperty(globalThis, name, { configurable: true, get: () => value });
    define("localStorage", storage(entries));
    define("sessionStorage", storage(session));
    Object.defineProperty(globalThis, "location", {
      configurable: true,
      get: () => {
        const url = new URL(page.href);
        return {
          hash: url.hash,
          pathname: url.pathname,
          search: url.search,
          replace: (to: string) => void left.push(to)
        };
      }
    });
    define("history", {
      state: { kept: true },
      replaceState: (_state: unknown, _title: string, url: string) => {
        replaced.push(url);
        page.href = new URL(url, page.href).href;
      }
    });
  });

  afterAll(() => {
    for (const [name, descriptor] of Object.entries(saved)) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete (globalThis as Record<string, unknown>)[name];
    }
  });

  beforeEach(() => {
    entries.clear();
    session.clear();
    replaced.length = 0;
    left.length = 0;
  });

  it("answers a request by fetching the hand-off from that v2 web app, with a new nonce", () => {
    open(`https://web.example/?x=1${vectors.requests.dashboard}`);
    expect(page.href).toBe("https://web.example/?x=1");
    expect(left).toHaveLength(1);
    const nonce = left[0].slice(left[0].indexOf("#n=") + 3);
    expect(left[0]).toBe(legacyHandoffFetchUrl("dashboard", nonce));
    expect(nonce).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(nonce).not.toBe(NONCE);
    // Another request, another nonce.
    open(`https://web.example/${vectors.requests.dashboard}`);
    expect(left[1]).not.toBe(left[0]);
  });

  it("takes an owner's, in memory only, and clears the address bar at once", async () => {
    handOff("app", vectors.vectors[0].payload);
    expect(page.href).toBe("https://web.example/");
    expect(entries.size).toBe(0);
    // The nonce served once.
    expect(session.size).toBe(0);
    await expect(web.readLegacyState()).resolves.toEqual({
      role: "owner",
      account: {
        id: ID,
        name: "Lakeside Bakery",
        currency: "CHF",
        onchain: true,
        email: "carol@example.ch"
      },
      tokens: { authToken: TOKEN, refreshToken: null },
      hasWallet: false
    });

    // A reload: nothing of it is left.
    open(page.href);
    await expect(web.readLegacyState()).resolves.toBeNull();
  });

  it("refuses a hand-off nobody asked for: a link made elsewhere, sent to the user", async () => {
    // As a v2 page sending its payer to an address of the merchant's choice would (the nonce is
    // the vectors': no tab asked for it).
    open(`https://web.example/${vectors.vectors[0].fragment}`);
    expect(page.href).toBe("https://web.example/");
    await expect(web.readLegacyState()).resolves.toBeNull();
    open(`https://web.example/${vectors.vectors[2].fragment}`);
    expect(entries.has(LEGACY_TILL_KEY)).toBe(false);
  });

  it("refuses a hand-off of another nonce, and keeps waiting for its own", async () => {
    open(`https://web.example/${vectors.requests.app}`);
    const fetchUrl = left.at(-1) ?? "";
    const nonce = fetchUrl.slice(fetchUrl.indexOf("#n=") + 3);
    // Another link opened in this tab meanwhile: refused, the request still awaited.
    open(`https://web.example/${vectors.vectors[0].fragment}`);
    await expect(web.readLegacyState()).resolves.toBeNull();
    expect(session.size).toBe(1);
    // The real answer is taken, once.
    const answer = legacyHandoffFragment({ ...vectors.vectors[0].payload, nonce });
    open(`https://web.example/${answer}`);
    await expect(web.readLegacyState()).resolves.toMatchObject({ role: "owner" });
    expect(session.size).toBe(0);
    open(`https://web.example/${answer}`);
    await expect(web.readLegacyState()).resolves.toBeNull();
  });

  it("refuses a hand-off past its half hour", async () => {
    session.set(
      "legacy-v2-handoff-request",
      legacyHandoffPendingText({ nonce: NONCE, at: Date.now() - TTL - 1000 })
    );
    open(`https://web.example/${vectors.vectors[0].fragment}`);
    await expect(web.readLegacyState()).resolves.toBeNull();
    session.set(
      "legacy-v2-handoff-request",
      legacyHandoffPendingText({ nonce: NONCE, at: Date.now() - 1000 })
    );
    open(`https://web.example/${vectors.vectors[0].fragment}`);
    await expect(web.readLegacyState()).resolves.toMatchObject({ role: "owner" });
  });

  it("keeps a till's in the browser until it moves on, through reloads", async () => {
    handOff("dashboard", vectors.vectors[2].payload);
    expect(page.href).toBe("https://web.example/");
    const till = {
      role: "employee",
      account: {
        id: ID,
        name: "Café Zürich – Bahnhof",
        currency: "EUR",
        onchain: false,
        email: null
      },
      tokens: null,
      hasWallet: false
    };
    await expect(web.readLegacyState()).resolves.toEqual(till);

    open("https://web.example/");
    await expect(web.readLegacyState()).resolves.toEqual(till);

    await web.forgetLegacySession();
    expect(entries.has(LEGACY_TILL_KEY)).toBe(false);
    await expect(web.readLegacyState()).resolves.toBeNull();
  });

  it("takes the last hand-off: an owner's forgets the till's", async () => {
    handOff("app", vectors.vectors[3].payload);
    await expect(web.readLegacyState()).resolves.toMatchObject({ role: "employee" });

    handOff("dashboard", vectors.vectors[1].payload);
    expect(entries.has(LEGACY_TILL_KEY)).toBe(false);
    await expect(web.readLegacyState()).resolves.toEqual({
      role: "owner",
      account: null,
      tokens: null,
      hasWallet: false
    });
  });

  it("leaves another link's fragment where it is, and the awaited nonce with it", async () => {
    session.set(
      "legacy-v2-handoff-request",
      legacyHandoffPendingText({ nonce: NONCE, at: Date.now() })
    );
    open("https://web.example/pay#0192a3b4.key");
    expect(replaced).toEqual([]);
    expect(left).toEqual([]);
    expect(session.size).toBe(1);
    await expect(web.readLegacyState()).resolves.toBeNull();
  });

  it("never writes over a newer app's till", async () => {
    const newer = JSON.stringify({ version: 2, account: null });
    entries.set(LEGACY_TILL_KEY, newer);
    handOff("app", vectors.vectors[3].payload);
    expect(entries.get(LEGACY_TILL_KEY)).toBe(newer);
    await expect(web.readLegacyState()).resolves.toBeNull();
  });

  it("stays without the tab's storage: no request it could not take the answer of", () => {
    Object.defineProperty(globalThis, "sessionStorage", {
      configurable: true,
      get: () => {
        throw new Error("blocked");
      }
    });
    try {
      open(`https://web.example/${vectors.requests.app}`);
      expect(left).toEqual([]);
      expect(page.href).toBe("https://web.example/");
    } finally {
      Object.defineProperty(globalThis, "sessionStorage", {
        configurable: true,
        get: () => storage(session)
      });
    }
  });
});

describe("the migration of an owner's hand-off", () => {
  beforeEach(() => resetMigration());

  const handedOver = {
    role: "owner" as const,
    account: {
      id: ID,
      name: "Lakeside Bakery",
      currency: "CHF",
      onchain: true,
      email: "carol@example.ch"
    },
    tokens: { authToken: TOKEN, refreshToken: null },
    hasWallet: false
  };

  it("reads the v2 account with the token handed over, without renewing it", async () => {
    legacyV2.authTokens.add(TOKEN);
    legacyV2.account = { id: ID, name: "Lakeside Bakery", mail: "carol@example.ch" };
    beginMigration(handedOver);
    await expect(readWithLegacySession()).resolves.toBe(true);
    expect(readLegacyAccount()).toMatchObject({ id: ID, email: "carol@example.ch" });
    expect(legacyV2.calls.map(({ path }) => path)).not.toContain("/api/auth/v1/refresh");
  });

  it("asks the password once the token expired, the e-mail already there", async () => {
    beginMigration(handedOver);
    await expect(readWithLegacySession()).resolves.toBe(false);
    expect(migrationEmail()).toBe("carol@example.ch");
    // "This is not my account": the e-mail of that account goes with it.
    forgetLegacyAccount();
    expect(migrationEmail()).toBe("");
  });
});
