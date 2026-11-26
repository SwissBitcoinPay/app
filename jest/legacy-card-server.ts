import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";

import { LEGACY_CARD_IMAGE_HOST } from "@/config/card";
import {
  SecureSession,
  ZERO_KEY,
  crc32nk,
  decryptBlocks,
  encryptBlocks,
  rotateLeft,
  sessionKeys
} from "@/lib/card/ntag424-sm";
import { verifySun } from "@/lib/card/sun";
import { decodeBolt11 } from "@/lib/lightning/bolt11";

import { settleReceivedInvoice } from "./breez-sdk";

/*
 * A fake of the v2 LNURL-withdraw service (`GET /cards?p=&c=` then its
 * callback), for the v2-card migration tests
 * (src/features/card/migration.ts). Registered per host with `addLegacyServer(host)`, behind the
 * `fetch` of the tests (jest.setup.ts), BEFORE the card relays.
 *
 * Its first request answers as the real server answers any tap: 1 sat to the card's balance in
 * whole sats, or 0 to 0 when the card is empty or its 24-hour cap used up (`remaining24hMsat` 0),
 * and the card's visual when the test gives one.
 * Its callback, given an invoice, pays it into the card's own wallet (settleReceivedInvoice) and
 * takes it off the balance when it fits what the card holds (`paysUpToMsat`), and otherwise answers
 * the LNURL error "not enough funds", or, above what the card may still spend within 24 hours
 * (`remaining24hMsat`), the server's "Daily spending limit exceeded …", nothing paid, or, its node
 * finding no route (`noRoute`), "no_route", nothing paid. The visual
 * (`visual`: `front_image`, `card_id`, `is_white`, src/lib/card/legacy-visual.ts) has its image
 * served by the v2 CDN (`serveLegacyImage`, LEGACY_CARD_IMAGE_HOST).
 * `holdCallback(server)` keeps its next callback waiting until released: a transfer in flight.
 *
 * It also answers the v2 server's reset of a card (`POST /v1/card-reset/…`,
 * src/lib/card/legacy-reset.ts) as the real one does, with the v2 keys the TEST gives it
 * (`v2Keys`; null: the server has none, the reset is off): the tap checked with the v2 SDM keys
 * or those an interrupted erase blanked, the card's challenge answered with the master key, its
 * answer checked, GetCardUID and its answer, then the v2 card closed (on a balance under a sat:
 * `balanceMsat`) and the ChangeKey commands of the keys still to blank. Every card is one of its
 * v2 cards but those in `unknown`; `disabled` ones (locked, banned) are refused; `closed` ones are
 * already closed for their migration. `resetDown` makes these routes alone fail (no answer).
 */

/** The v2 server's bound on a tap's `maxWithdrawable` (`WITHDRAW_MAX_SAT`). */
export const PROTOCOL_MAX_MSAT = BigInt(21_000_000_000);

export type FakeLegacyServer = {
  host: string;
  /** The card's balance, in millisatoshis: what a migration's first request announces. */
  balanceMsat: bigint;
  /**
   * What the card may still spend within 24 hours, in millisatoshis (null: no limit reached). 0: its
   * tap answers 0 to 0 whatever it holds; above it, the callback refuses.
   */
  remaining24hMsat: bigint | null;
  /**
   * Whether its tap announces the balance in whole sats, as the real server does (false: to the
   * millisatoshi, which the app must refuse rather than round).
   */
  wholeSats: boolean;
  /**
   * The most the callback pays, in millisatoshis (null: the balance). Lower, the callback refuses
   * "not enough funds", as the real server does when the balance dropped between the two
   * requests.
   */
  paysUpToMsat: bigint | null;
  /** No answer at all (a network failure). */
  unreachable: boolean;
  /**
   * The callback's node finds no route to the invoice and gives up for good: the server's
   * "no_route", nothing paid, the balance kept.
   */
  noRoute: boolean;
  /** The callback accepts the invoice (status OK) but does NOT pay it: the wallet never receives. */
  dropPayment: boolean;
  /** The callback pays the invoice, but its answer never comes back (a network failure). */
  loseCallbackAnswer: boolean;
  /** Fields the first answer adds: the card's visual (null: none). */
  visual: Record<string, unknown> | null;
  /** What the next callback waits for before answering (`holdCallback`). */
  callbackHeld: Promise<void> | null;
  /** Each request, by leg. */
  calls: { leg: 1 | 2; url: string }[];
  /** The invoices handed to the callback. */
  submitted: string[];
  /** The v2 keys the reset uses (null: none, the reset is off), raw. */
  v2Keys: { master: Uint8Array; meta: Uint8Array; file: Uint8Array } | null;
  /** UIDs (uppercase hex) of v2-programmed cards that no v2 account holds. */
  unknown: Set<string>;
  /** UIDs (uppercase hex) of v2 cards locked or banned. */
  disabled: Set<string>;
  /** UIDs (uppercase hex) of v2 cards closed for their migration. */
  closed: Set<string>;
  /** The reset's routes give no answer (a network failure), the LNURL ones still do. */
  resetDown: boolean;
  /**
   * The wipe closes the v2 card, then fails (a top-up it could not cancel, an answer lost): 503
   * `card_reset_unavailable`, the card closed all the same.
   */
  wipeFailsAfterClose: boolean;
  /** A payment of the card still in flight on the server: the wipe refused, the card not closed. */
  paymentInFlight: boolean;
  /** The keys the wipe's ChangeKey commands name, in order (null: those still the v2 ones). */
  wipeKeys: number[] | null;
  /** Each reset request: its step and body. */
  resetCalls: { step: string; body: Record<string, unknown> }[];
};

const servers = new Map<string, FakeLegacyServer>();

export function addLegacyServer(host: string, balanceMsat = BigInt(0)): FakeLegacyServer {
  const server: FakeLegacyServer = {
    host,
    balanceMsat,
    remaining24hMsat: null,
    wholeSats: true,
    paysUpToMsat: null,
    unreachable: false,
    noRoute: false,
    dropPayment: false,
    loseCallbackAnswer: false,
    visual: null,
    callbackHeld: null,
    calls: [],
    submitted: [],
    v2Keys: null,
    unknown: new Set(),
    disabled: new Set(),
    closed: new Set(),
    resetDown: false,
    wipeFailsAfterClose: false,
    paymentInFlight: false,
    wipeKeys: null,
    resetCalls: []
  };
  servers.set(host, server);
  return server;
}

/** Keeps `server`'s next callback waiting until the function returned is called. */
export function holdCallback(server: FakeLegacyServer): () => void {
  let release!: () => void;
  server.callbackHeld = new Promise<void>((resolve) => {
    release = resolve;
  });
  return release;
}

/** What the v2 CDN serves, by URL: an image, or a status of its own. */
const images = new Map<string, { status: number; bytes: Uint8Array }>();

/** The URLs the v2 CDN was asked for, in order. */
export const imageRequests: string[] = [];

/** Has the v2 CDN serve `bytes` at `url` (with `status`, 200 by default). */
export function serveLegacyImage(url: string, bytes: Uint8Array, status = 200): void {
  images.set(url, { status, bytes });
}

export function resetLegacyServers(): void {
  servers.clear();
  resetSessions.clear();
  images.clear();
  imageRequests.length = 0;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

/** Handles a request to a registered v2 server, or null when the host is not one. */
export function tryFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> | null {
  const href = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (url.protocol === "https:" && url.host === LEGACY_CARD_IMAGE_HOST) {
    imageRequests.push(url.href);
    const image = images.get(url.href);
    return Promise.resolve(
      new Response(image ? image.bytes.slice() : null, {
        status: image?.status ?? 404,
        headers: { "Content-Length": String(image?.bytes.length ?? 0) }
      })
    );
  }
  const server = servers.get(url.host);
  if (url.protocol !== "https:" || !server) return null;
  if (url.pathname.startsWith("/v1/card-reset/")) return handleReset(server, url, init);
  return handle(server, url);
}

async function handle(server: FakeLegacyServer, url: URL): Promise<Response> {
  if (server.unreachable) throw new Error("Network disabled in tests");
  const path = url.pathname;

  // Leg 1: the withdraw request (`/cards` or `/card/<uid>`, with the tap in the query).
  if (/^\/cards?(\/[0-9a-fA-F]{14})?$/.test(path) && url.searchParams.has("p")) {
    server.calls.push({ leg: 1, url: url.href });
    const p = url.searchParams.get("p") ?? "";
    const c = url.searchParams.get("c") ?? "";
    const callback = `https://${server.host}/cards/cb/${"ab".repeat(16)}?p=${p}&c=${c}`;
    // As the v2 service answers a tap: the balance in whole sats, nothing to withdraw 0 to 0.
    const wholeMsat = server.wholeSats
      ? (server.balanceMsat / BigInt(1000)) * BigInt(1000)
      : server.balanceMsat;
    const maxMsat =
      server.remaining24hMsat === BigInt(0)
        ? BigInt(0)
        : wholeMsat < PROTOCOL_MAX_MSAT
          ? wholeMsat
          : PROTOCOL_MAX_MSAT;
    return json(200, {
      tag: "withdrawRequest",
      callback,
      k1: "00".repeat(16),
      defaultDescription: "BoltCard",
      minWithdrawable: maxMsat === BigInt(0) ? 0 : maxMsat < BigInt(1000) ? Number(maxMsat) : 1000,
      maxWithdrawable: Number(maxMsat),
      ...server.visual
    });
  }

  // Leg 2: the callback (`/cards/cb/<id>`), given `k1` and the invoice `pr`.
  if (/^\/cards\/cb\//.test(path)) {
    server.calls.push({ leg: 2, url: url.href });
    const held = server.callbackHeld;
    server.callbackHeld = null;
    if (held) await held;
    const pr = url.searchParams.get("pr");
    if (!pr) return json(200, { status: "ERROR", reason: "pr is required" });
    const amountMsat = decodeBolt11(pr)?.amountMsat ?? null;
    const ceiling = server.paysUpToMsat ?? server.balanceMsat;
    if (amountMsat === null || amountMsat < BigInt(1000) || amountMsat > ceiling) {
      return json(200, { status: "ERROR", reason: "not enough funds" });
    }
    if (server.remaining24hMsat !== null && amountMsat > server.remaining24hMsat) {
      return json(200, {
        status: "ERROR",
        reason: "Daily spending limit exceeded (max 1'000 CHF per 24h)"
      });
    }
    if (server.noRoute) return json(200, { status: "ERROR", reason: "no_route" });
    server.submitted.push(pr);
    // The v2 server's node pays the invoice into the card's own wallet (unless the test drops it,
    // to reach the "receipt not confirmed in time" branch), the card's balance debited.
    if (!server.dropPayment) {
      settleReceivedInvoice(pr);
      server.balanceMsat -= amountMsat;
    }
    if (server.loseCallbackAnswer) throw new Error("The answer was lost");
    return json(200, { status: "OK" });
  }

  return json(404, { status: "ERROR", reason: "not found" });
}

// ── The reset of a v2 card ───────────────────────────────────────────────────

type ResetSession = {
  uid: string;
  v2SdmKeys: 0 | 1 | 2;
  step: 0 | 1 | 2;
  rndA?: Uint8Array;
  rndB?: Uint8Array;
  session?: SecureSession;
};

const resetSessions = new Map<string, ResetSession>();

function hexBytes(value: unknown, bytes: number): Uint8Array | null {
  if (typeof value !== "string" || !new RegExp(`^[0-9a-fA-F]{${bytes * 2}}$`).test(value)) {
    return null;
  }
  return hexToBytes(value.toLowerCase());
}

function refuse(status: number, error: string): Response {
  return json(status, { error });
}

async function handleReset(
  server: FakeLegacyServer,
  url: URL,
  init: RequestInit | undefined
): Promise<Response> {
  const step = url.pathname.slice("/v1/card-reset/".length);
  const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
  server.resetCalls.push({ step, body });
  if (server.unreachable || server.resetDown) throw new Error("Network disabled in tests");
  const v2Keys = server.v2Keys;
  if (!v2Keys) return refuse(503, "card_reset_not_configured");

  if (step === "start") {
    const p = hexBytes(body.p, 16);
    const c = hexBytes(body.c, 8);
    if (!p || !c) return refuse(400, "validation");
    const states: [Uint8Array, Uint8Array, 0 | 1 | 2][] = [
      [v2Keys.meta, v2Keys.file, 2],
      [ZERO_KEY, v2Keys.file, 1],
      [ZERO_KEY, ZERO_KEY, 0]
    ];
    let found: { uid: string; v2SdmKeys: 0 | 1 | 2 } | null = null;
    for (const [meta, file, v2SdmKeys] of states) {
      const picc = verifySun(meta, file, p, c);
      if (picc) {
        found = { uid: bytesToHex(picc.uid).toUpperCase(), v2SdmKeys };
        break;
      }
    }
    const expected = typeof body.uid === "string" ? body.uid.toUpperCase() : null;
    if (!found || (expected !== null && expected !== found.uid)) {
      return refuse(403, "card_tap_invalid");
    }
    const known = !server.unknown.has(found.uid);
    if (found.v2SdmKeys < 2 && !(known && server.closed.has(found.uid))) {
      return refuse(403, "card_tap_invalid");
    }
    if (!known) return refuse(404, "card_not_found");
    const token = bytesToHex(globalThis.crypto.getRandomValues(new Uint8Array(32)));
    resetSessions.set(token, { ...found, step: 0 });
    return json(200, { session: token });
  }

  const token = typeof body.session === "string" ? body.session.toLowerCase() : "";
  const session = resetSessions.get(token);

  if (step === "challenge") {
    const challenge = hexBytes(body.challenge, 16);
    if (!challenge) return refuse(400, "validation");
    if (!session || session.step !== 0) return refuse(404, "card_reset_session_not_found");
    const rndB = decryptBlocks(v2Keys.master, challenge);
    const rndA = globalThis.crypto.getRandomValues(new Uint8Array(16));
    const answer = encryptBlocks(v2Keys.master, new Uint8Array([...rndA, ...rotateLeft(rndB)]));
    Object.assign(session, { step: 1, rndA, rndB });
    return json(200, { answer: bytesToHex(answer).toUpperCase() });
  }

  if (step === "open") {
    const cardAnswer = hexBytes(body.card_answer, 32);
    if (!cardAnswer) return refuse(400, "validation");
    if (!session || session.step !== 1 || !session.rndA || !session.rndB) {
      return refuse(404, "card_reset_session_not_found");
    }
    const plain = decryptBlocks(v2Keys.master, cardAnswer);
    const expected = rotateLeft(session.rndA);
    if (!plain.subarray(4, 20).every((b, i) => b === expected[i])) {
      resetSessions.delete(token);
      return refuse(403, "card_not_authenticated");
    }
    const { enc, mac } = sessionKeys(v2Keys.master, session.rndA, session.rndB);
    session.session = new SecureSession(plain.slice(0, 4), enc, mac);
    session.step = 2;
    const getUid = session.session.commandMac(0x51, new Uint8Array(0), new Uint8Array(0));
    return json(200, { command: { ins: 0x51, data: bytesToHex(getUid).toUpperCase() } });
  }

  if (step === "finish") {
    const response = hexBytes(body.response, 24);
    const action = body.action;
    if (!response || (action !== "identify" && action !== "wipe")) {
      return refuse(400, "validation");
    }
    if (!session || session.step !== 2 || !session.session) {
      return refuse(404, "card_reset_session_not_found");
    }
    resetSessions.delete(token);
    const secure = session.session;
    secure.next();
    const encrypted = response.subarray(0, 16);
    const uidBytes = secure.responseMacValid(0x00, encrypted, response.subarray(16))
      ? secure.decryptResponse(encrypted)
      : null;
    const uid = uidBytes && uidBytes.length === 7 ? bytesToHex(uidBytes).toUpperCase() : null;
    if (uid !== session.uid) return refuse(403, "card_response_invalid");
    if (server.disabled.has(uid)) return refuse(403, "card_disabled");
    if (action === "identify") return json(200, { uid, closed: server.closed.has(uid) });
    if (!server.closed.has(uid)) {
      if (server.balanceMsat >= BigInt(1000)) return refuse(409, "card_balance_not_empty");
      if (server.paymentInFlight) return refuse(409, "card_payment_pending");
      server.closed.add(uid);
    }
    if (server.wipeFailsAfterClose) return refuse(503, "card_reset_unavailable");
    const keys =
      server.wipeKeys ??
      (session.v2SdmKeys === 2 ? [1, 2, 0] : session.v2SdmKeys === 1 ? [2, 0] : [0]);
    const old: Record<number, Uint8Array> = { 1: v2Keys.meta, 2: v2Keys.file };
    const commands = keys.map((keyNo) => {
      const keyData =
        keyNo === 0
          ? new Uint8Array([...ZERO_KEY, 0])
          : new Uint8Array([...old[keyNo], 0, ...crc32nk(ZERO_KEY)]);
      const header = Uint8Array.of(keyNo);
      const enc = secure.encryptCommand(keyData);
      const mac = secure.commandMac(0xc4, header, enc);
      secure.next();
      return {
        ins: 0xc4,
        data: bytesToHex(new Uint8Array([...header, ...enc, ...mac])).toUpperCase()
      };
    });
    return json(200, { uid, commands });
  }

  return refuse(404, "not_found");
}
