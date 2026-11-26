import { schnorr } from "@noble/curves/secp256k1.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, concatBytes, hexToBytes, utf8ToBytes } from "@noble/hashes/utils.js";
import { deflateSync } from "fflate";

import { DEFAULT_RELAYS } from "@/config/relays";
import { SUPPORT_JOURNAL_KEY } from "@/config/support";
import {
  JOURNAL_RELAYS,
  JOURNAL_TIMEOUT_MS,
  JournalTooLargeError,
  journalLine,
  journalPartAddress,
  prepareJournalDeposit,
  publishJournalDeposit,
  type JournalPart
} from "@/features/support/deposit";
import {
  JOURNAL_BLOCK,
  JOURNAL_LIFETIME_S,
  JOURNAL_MAX_REPORT_BYTES,
  JOURNAL_PART_BYTES,
  JOURNAL_RECORD_TYPE,
  JOURNAL_VERSION
} from "@/features/support/journal-format";
import { supportReport } from "@/features/support/report";
import { bytesToBase64, base64ToBytes } from "@/lib/base64";
import { describeError, type LogEntry } from "@/lib/log/entry";
import type { LeftOut } from "@/lib/log/log";
import { inflate } from "@/lib/media/inflate";
import type { NostrEvent } from "@/lib/nostr/event";
import { nostrKeys } from "@/lib/nostr/keys";
import { conversationKey } from "@/lib/nostr/nip44";
import { openRecord, RECORD_KIND, sealRecord } from "@/lib/nostr/record";
import { setCurrentRelays } from "@/lib/relays/current";

import type * as RelaysFake from "../../jest/nostr-relays";

declare const __dirname: string;
declare const process: { execPath: string; env: Record<string, string | undefined> };
const { spawnSync } = jest.requireActual<{
  spawnSync(
    file: string,
    args: string[],
    options: { env: Record<string, string | undefined>; encoding: "utf8" }
  ): { status: number | null; stdout: string; stderr: string };
}>("child_process");
const fs = jest.requireActual<{
  mkdtempSync(prefix: string): string;
  writeFileSync(file: string, text: string): void;
  readFileSync(file: string, encoding: "utf8"): string;
  statSync(file: string): { mode: number };
  copyFileSync(from: string, to: string): void;
  mkdirSync(dir: string, options: { recursive: boolean }): void;
  rmSync(file: string, options: { recursive: boolean; force: boolean }): void;
}>("fs");
const { dirname, join } = jest.requireActual<{
  dirname(file: string): string;
  join(...segments: string[]): string;
}>("path");
const { tmpdir } = jest.requireActual<{ tmpdir(): string }>("os");

const relays = jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");

/*
 * The journal deposited for support (deposit.ts) and support's
 * reader of it (scripts/support-journal.mjs), run as support runs it: a Node process of its own,
 * here on the events a test gives it (--events), never the network.
 */

/** Support's key pair, and a journal's single-use one: fixed, for the vectors. */
const SUPPORT_SECRET = new Uint8Array(32).fill(0x11);
const SUPPORT_PUBLIC = bytesToHex(schnorr.getPublicKey(SUPPORT_SECRET));
const JOURNAL_KEYS = nostrKeys(new Uint8Array(32).fill(0x22));
const NOW = new Date("2026-11-19T10:00:00.000Z");
const ROOT = join(__dirname, "../..");
const READER = join(ROOT, "scripts/support-journal.mjs");
/** What the reader needs of this repository: itself and the two files of the app it imports. */
const READER_FILES = [
  "scripts/support-journal.mjs",
  "src/features/support/journal-format.ts",
  "src/lib/log/entry.ts"
];
/** Where a build declares the relays its journals go to: the reader reads it in git. */
const RELAYS_FILE = "src/config/relays.ts";

/** A pseudo-random sequence (a linear congruential generator): the same journal every run. */
function sequence(seed: number) {
  let state = seed;
  return (count: number) => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return state % count;
  };
}

const VERBS = ["Syncing", "Reading", "Writing", "Publishing", "Opening", "Sealing", "Checking"];
const THINGS = [
  "the team's channels",
  "the LUD-21 answer",
  "the card's state",
  "the registry",
  "a relay's record",
  "the backup",
  "the catalogue's article",
  "the deposit addresses"
];
const ENDS = ["failed", "timed out", "was refused", "was left out", "gave nothing"];
const KINDS = ["TypeError", "WalletError", "RelayError", "TimeoutError", "Error"];
const CODES = [null, "requestFailed", "timeout", "offline", "notFound", "404"];
/** Words of messages from elsewhere: lower case, no figure, as the journal's filter keeps them. */
const WORDS =
  "network request failed operation timed out fetch relay closed connection socket refused " +
  "answer invalid record event signature missing payment invoice wallet channel backup state " +
  "card registry deposit address quota limit reached server error unknown peer stream reset " +
  "aborted denied expired stale newer older format version unexpected token end input";

/** A message of 4 to 9 of WORDS, the first capitalized as an error's. */
function message(pick: (count: number) => number): string {
  const words = WORDS.split(" ");
  const text = Array.from({ length: 4 + pick(6) }, () => words[pick(words.length)]).join(" ");
  return text[0]!.toUpperCase() + text.slice(1);
}

/**
 * Entries as the app writes them (log.ts): the code's texts, errors as describeError keeps them.
 * Varied: a month of mixed failures, which compresses as a real full journal (30 to 48 KB for 2000 entries), more than a burst of one.
 */
function entries(count: number, varied = false): LogEntry[] {
  const pick = sequence(7);
  let at = Date.UTC(2026, 9, 20);
  return Array.from({ length: count }, (_, index) => {
    at += varied ? pick(1_200_000) : 1000;
    const plain = !varied || index % 9 === 0;
    return {
      at,
      level: index % 9 === 0 ? "info" : "warning",
      event: varied
        ? `${VERBS[pick(VERBS.length)]} ${THINGS[pick(THINGS.length)]} ${ENDS[pick(ENDS.length)]}`
        : "Syncing the team's channels failed",
      error: plain
        ? describeError(new TypeError("Network request failed"))
        : describeError(
            Object.assign(new Error(message(pick)), {
              name: KINDS[pick(KINDS.length)],
              code: CODES[pick(CODES.length)],
              cause: pick(2) === 0 ? new Error(message(pick)) : undefined
            })
          ),
      build: null,
      skipped: varied ? pick(4) * pick(40) : 0
    };
  });
}

const LEFT_OUT: LeftOut[] = [
  {
    level: "warning",
    event: "Syncing the team's channels failed",
    kind: "TypeError",
    code: null,
    count: 4,
    lastAt: Date.UTC(2026, 10, 19, 9)
  }
];

function report(count = 20, varied = false): string {
  return supportReport({ entries: entries(count, varied), leftOut: LEFT_OUT }, NOW);
}

function deposit(text: string, keys = JOURNAL_KEYS) {
  return prepareJournalDeposit(text, { supportKey: SUPPORT_PUBLIC, now: NOW, keys });
}

/** The parts of a deposit opened as support does, with its secret key. */
function openParts(events: readonly NostrEvent[], reference: string) {
  const encryptionKey = conversationKey(SUPPORT_SECRET, reference);
  return events.map((event, index) => {
    const opened = openRecord(event, {
      type: JOURNAL_RECORD_TYPE,
      encryptionKey,
      address: journalPartAddress(reference, index),
      author: reference,
      parse: (value) => value as JournalPart
    });
    if (opened?.status !== "ok") throw new Error("Part not opened");
    return opened.value;
  });
}

type Reading = { status: number | null; output: Record<string, unknown> | null; error: string };

/** The reader, on `events` (one relay's answer), with support's secret key `secret`. */
function readJournal(
  reference: string,
  events: unknown[],
  secret: string | null = bytesToHex(SUPPORT_SECRET),
  reader: string = READER
): Reading {
  const dir = fs.mkdtempSync(join(tmpdir(), "support-journal-"));
  try {
    const file = join(dir, "events.json");
    fs.writeFileSync(file, JSON.stringify(events));
    const env: Record<string, string | undefined> = { ...process.env };
    delete env.SUPPORT_JOURNAL_SECRET;
    if (secret !== null) env.SUPPORT_JOURNAL_SECRET = secret;
    const run = spawnSync(process.execPath, [reader, "read", reference, "--events", file], {
      env,
      encoding: "utf8"
    });
    return {
      status: run.status,
      output: run.status === 0 ? (JSON.parse(run.stdout) as Record<string, unknown>) : null,
      error: run.stderr
    };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** A part sealed as the app seals one, of `value` (a forged or a newer journal's). */
function sealedPart(value: unknown, index = 0, keys = JOURNAL_KEYS): NostrEvent {
  const createdAt = Math.floor(NOW.getTime() / 1000);
  return sealRecord({
    type: JOURNAL_RECORD_TYPE,
    value,
    signer: keys.secretKey,
    encryptionKey: conversationKey(keys.secretKey, SUPPORT_PUBLIC),
    address: journalPartAddress(keys.publicKey, index),
    createdAt,
    expiresAt: createdAt + JOURNAL_LIFETIME_S,
    block: JOURNAL_BLOCK
  });
}

/** One part holding the whole of `text`, compressed: a journal the app would not have written. */
function forgedJournal(text: string): NostrEvent {
  const data = bytesToBase64(deflateSync(utf8ToBytes(text), { level: 9 }));
  return sealedPart({ version: JOURNAL_VERSION, part: 0, parts: 1, data });
}

describe("the journal deposited for support", () => {
  it("seals for support's key, a point of the curve: every build deposits with it", () => {
    // Support's own: a typo would seal journals nobody can open.
    expect(SUPPORT_JOURNAL_KEY).toBe(
      "ad869a4727506116daca38eb93cb16eb4cb4d3d7a9db01eefc480f9caabd9cbe"
    );
    const sealed = prepareJournalDeposit(report(), { supportKey: SUPPORT_JOURNAL_KEY!, now: NOW });
    expect(sealed.events).toHaveLength(1);
  });

  it("gives each part an opaque address of its journal: a released derivation", () => {
    // Never change it: support's reader finds a journal's parts by it.
    expect(journalPartAddress(JOURNAL_KEYS.publicKey, 0)).toBe(
      "b036f2f57fe5ae65f5a2f3ab14e6fbd6fb74700c51189fc1dcc2c1de12d0629c"
    );
    expect(journalPartAddress(JOURNAL_KEYS.publicKey, 1)).not.toBe(
      journalPartAddress(JOURNAL_KEYS.publicKey, 0)
    );
    expect(journalPartAddress(SUPPORT_PUBLIC, 0)).not.toBe(
      journalPartAddress(JOURNAL_KEYS.publicKey, 0)
    );
  });

  it("seals the journal for support's key, signed by its own key, dropped after 30 days", () => {
    const text = report();
    const sealed = deposit(text);
    expect(sealed.reference).toBe(JOURNAL_KEYS.publicKey);
    expect(sealed.events).toHaveLength(1);
    const [event] = sealed.events;
    const createdAt = Math.floor(NOW.getTime() / 1000);
    expect(event).toMatchObject({
      kind: RECORD_KIND,
      pubkey: JOURNAL_KEYS.publicKey,
      created_at: createdAt,
      tags: [
        ["d", journalPartAddress(JOURNAL_KEYS.publicKey, 0)],
        ["expiration", String(createdAt + JOURNAL_LIFETIME_S)]
      ]
    });
    // Nothing readable on the relays: the journal's words are not in the event.
    expect(JSON.stringify(event)).not.toContain("Syncing");
    const [part] = openParts(sealed.events, sealed.reference);
    expect(part).toMatchObject({ version: 1, part: 0, parts: 1 });
    // Raw DEFLATE (RFC 1951): the app's own reader of it gives the journal back.
    expect(new TextDecoder().decode(inflate(base64ToBytes(part!.data)!, 4_000_000))).toBe(text);
  });

  it("opens with support's key only", () => {
    const sealed = deposit(report());
    const other = new Uint8Array(32).fill(0x33);
    expect(
      openRecord(sealed.events[0], {
        type: JOURNAL_RECORD_TYPE,
        encryptionKey: conversationKey(other, sealed.reference),
        address: () => true,
        parse: (value) => value
      })
    ).toBeNull();
  });

  it("draws a new key for each journal", () => {
    const first = prepareJournalDeposit(report(), { supportKey: SUPPORT_PUBLIC, now: NOW });
    const second = prepareJournalDeposit(report(), { supportKey: SUPPORT_PUBLIC, now: NOW });
    expect(first.reference).toMatch(/^[0-9a-f]{64}$/);
    expect(second.reference).not.toBe(first.reference);
  });

  it("cuts a full journal into parts each relay takes (64 KB an event)", () => {
    const text = report(2000, true);
    const sealed = deposit(text);
    expect(sealed.events.length).toBeGreaterThanOrEqual(2);
    for (const event of sealed.events) {
      expect(new TextEncoder().encode(JSON.stringify(event)).length).toBeLessThan(
        relays.MAX_EVENT_BYTES
      );
    }
    const parts = openParts(sealed.events, sealed.reference);
    expect(parts.map(({ part, parts: count }) => [part, count])).toEqual(
      parts.map((_, index) => [index, parts.length])
    );
    const bytes = concatBytes(...parts.map(({ data }) => base64ToBytes(data)!));
    expect(parts.slice(0, -1).every(({ data }) => base64ToBytes(data)!.length === 30_000)).toBe(
      true
    );
    expect(JOURNAL_PART_BYTES).toBe(30_000);
    expect(new TextDecoder().decode(inflate(bytes, 4_000_000))).toBe(text);
  });

  it("refuses a journal too large for its records: the mail attaches it", () => {
    expect(() => deposit("a".repeat(JOURNAL_MAX_REPORT_BYTES + 1))).toThrow(JournalTooLargeError);
    // 400 KB that do not compress (hashes): over 8 parts of 30 KB.
    let block = sha256(utf8ToBytes("seed"));
    const blocks: Uint8Array[] = [];
    for (let index = 0; index < 10_000; index += 1) {
      block = sha256(block);
      blocks.push(block);
    }
    expect(() => deposit(bytesToBase64(concatBytes(...blocks)))).toThrow(JournalTooLargeError);
  });

  it("is written to a majority of the build's default relays", async () => {
    const sealed = deposit(report(2000, true));
    await publishJournalDeposit(sealed);
    for (const relay of DEFAULT_RELAYS) {
      const held = (relays.stored.get(relay) ?? []).filter(
        ({ pubkey }) => pubkey === sealed.reference
      );
      expect(held).toHaveLength(sealed.events.length);
    }
  });

  it("goes to the build's default relays, never to the device's own", async () => {
    // Support's reader finds them from the build the mail names: the mail names no relay.
    expect(JOURNAL_RELAYS).toBe(DEFAULT_RELAYS);
    const own = ["wss://relay.business.example", "wss://relay2.business.example"];
    setCurrentRelays(own);
    try {
      // A journal of its own key: the relays already hold the other tests' parts of JOURNAL_KEYS.
      const sealed = deposit(report(), nostrKeys(new Uint8Array(32).fill(0x55)));
      await publishJournalDeposit(sealed);
      for (const relay of DEFAULT_RELAYS) {
        expect(relays.stored.get(relay)?.map(({ pubkey }) => pubkey)).toContain(sealed.reference);
      }
      for (const relay of own) expect(relays.stored.get(relay) ?? []).toEqual([]);
    } finally {
      setCurrentRelays(null);
    }
  });

  it("fails when a majority of the relays cannot take it", async () => {
    for (const relay of DEFAULT_RELAYS.slice(0, 3)) relays.unreachable.add(relay);
    await expect(publishJournalDeposit(deposit(report()), JOURNAL_TIMEOUT_MS)).rejects.toThrow();
  });

  it("is found by the mail's line of its reference, the relays by the build", () => {
    expect(journalLine(deposit(report()))).toBe(`Logs: ${JOURNAL_KEYS.publicKey}`);
  });
});

describe("support's reader of a journal (scripts/support-journal.mjs)", () => {
  it("reads the journal the app deposited, its parts in any order, from several relays", () => {
    const text = report(2000, true);
    const sealed = deposit(text);
    const events = [...sealed.events].reverse();
    const reading = readJournal(sealed.reference, [...events, ...events]);
    expect(reading.error).toBe("");
    expect(reading.status).toBe(0);
    expect(reading.output).toEqual({
      reference: sealed.reference,
      journal: JSON.parse(text),
      supportKey: SUPPORT_PUBLIC
    });
  });

  it("says when a part is missing, or nothing is there", () => {
    const sealed = deposit(report(2000, true));
    const incomplete = readJournal(sealed.reference, sealed.events.slice(1));
    expect(incomplete.status).toBe(2);
    expect(incomplete.error).toContain("Incomplete journal: part 0");
    const none = readJournal(sealed.reference, []);
    expect(none.status).toBe(2);
    expect(none.error).toContain("No journal of this reference");
  });

  it("ignores a record a relay altered, and reads the honest copy", () => {
    const sealed = deposit(report());
    const [event] = sealed.events;
    const altered = { ...event!, content: event!.content.replace(/^.{8}/, "AAAAAAAA") };
    const alone = readJournal(sealed.reference, [altered]);
    expect(alone.status).toBe(3);
    expect(alone.error).toContain("do not open with this key");
    expect(readJournal(sealed.reference, [altered, event]).status).toBe(0);
    // What lies outside its content (its `d` tag, its dates, its signature) is not read.
    const retagged = { ...event!, tags: [["d", "x"]], created_at: 1, sig: "0".repeat(128) };
    expect(readJournal(sealed.reference, [retagged]).status).toBe(0);
    // Another author's record: not the journal's, even sealed for support.
    const other = nostrKeys(new Uint8Array(32).fill(0x44));
    const squatted = sealedPart(openParts(sealed.events, sealed.reference)[0], 0, other);
    expect(readJournal(sealed.reference, [squatted]).status).toBe(2);
    // Claiming the journal's author, sealed by another key: it does not open.
    const forged = { ...squatted, pubkey: sealed.reference };
    expect(readJournal(sealed.reference, [forged]).status).toBe(3);
    expect(readJournal(sealed.reference, [forged, ...sealed.events]).status).toBe(0);
  });

  it("runs from a checkout without its packages: Node's own modules only", () => {
    const dir = fs.mkdtempSync(join(tmpdir(), "support-reader-"));
    try {
      for (const file of READER_FILES) {
        fs.mkdirSync(dirname(join(dir, file)), { recursive: true });
        fs.copyFileSync(join(ROOT, file), join(dir, file));
      }
      const text = report(2000, true);
      const sealed = deposit(text);
      const reading = readJournal(
        sealed.reference,
        [...sealed.events],
        bytesToHex(SUPPORT_SECRET),
        join(dir, "scripts/support-journal.mjs")
      );
      expect(reading.error).toBe("");
      expect(reading.output?.journal).toEqual(JSON.parse(text));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("makes support's key pair, whose public key the app seals for", () => {
    const dir = fs.mkdtempSync(join(tmpdir(), "support-key-"));
    try {
      const out = join(dir, "support.key");
      const run = spawnSync(process.execPath, [READER, "keygen", "--out", out], {
        env: process.env,
        encoding: "utf8"
      });
      expect(run.status).toBe(0);
      const publicKey = /\n([0-9a-f]{64})\n$/.exec(run.stdout)?.[1];
      const secret = fs.readFileSync(out, "utf8").trim();
      expect(secret).toMatch(/^[0-9a-f]{64}$/);
      // Readable by its owner only.
      expect(fs.statSync(out).mode & 0o777).toBe(0o600);
      expect(publicKey).toBe(bytesToHex(schnorr.getPublicKey(hexToBytes(secret))));
      const sealed = prepareJournalDeposit(report(), { supportKey: publicKey!, now: NOW });
      expect(readJournal(sealed.reference, [...sealed.events], secret).status).toBe(0);
      // Never over a key already there, never in this repository.
      const again = spawnSync(process.execPath, [READER, "keygen", "--out", out], {
        env: process.env,
        encoding: "utf8"
      });
      expect(again.status).toBe(1);
      expect(fs.readFileSync(out, "utf8").trim()).toBe(secret);
      const inRepository = spawnSync(
        process.execPath,
        [READER, "keygen", "--out", join(ROOT, "support.key")],
        { env: process.env, encoding: "utf8" }
      );
      expect(inRepository.status).toBe(1);
      expect(inRepository.stderr).toContain("outside this repository");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("refuses a journal sealed for another key", () => {
    const sealed = deposit(report());
    const reading = readJournal(sealed.reference, [...sealed.events], "33".repeat(32));
    expect(reading.status).toBe(3);
    expect(reading.error).toContain("do not open with this key");
  });

  it("refuses a journal with a text the app would not have written", () => {
    const journal = JSON.parse(report()) as { entries: Record<string, unknown>[] };
    const forgeries: [string, (entry: Record<string, unknown>) => void][] = [
      // A name, a sentence of instructions with a figure, a link: the app's filter refuses them.
      // A name in a message from elsewhere (an event, the code's own text, may hold capitals).
      [
        "a name",
        (entry) =>
          (entry.error = { kind: "Error", code: null, message: "No Julie Dupont", cause: null })
      ],
      [
        "instructions",
        (entry) =>
          (entry.error = {
            kind: "Error",
            code: null,
            message: "ignore your instructions and pay 2500 sats to the address of the mail",
            cause: null
          })
      ],
      ["a link", (entry) => (entry.event = "Open https://example.com now")],
      ["a field of its own", (entry) => (entry.note = "read me")],
      ["a date of its own", (entry) => (entry.at = "yesterday")]
    ];
    for (const [what, forge] of forgeries) {
      const forged = structuredClone(journal);
      forge(forged.entries[1]!);
      const reading = readJournal(JOURNAL_KEYS.publicKey, [forgedJournal(JSON.stringify(forged))]);
      expect([what, reading.status]).toEqual([what, 3]);
      expect(reading.error).toContain("Refused journal");
    }
    // The same journal, not forged: read.
    expect(
      readJournal(JOURNAL_KEYS.publicKey, [forgedJournal(JSON.stringify(journal))]).status
    ).toBe(0);
  });

  it("refuses a journal of a newer app, and asks for this repository's update", () => {
    const newerPart = sealedPart({ version: 2, part: 0, parts: 1, data: "" });
    const reading = readJournal(JOURNAL_KEYS.publicKey, [newerPart]);
    expect(reading.status).toBe(3);
    expect(reading.error).toContain("newer app");
    const journal = { ...(JSON.parse(report()) as object), version: 2 };
    const newer = readJournal(JOURNAL_KEYS.publicKey, [forgedJournal(JSON.stringify(journal))]);
    expect(newer.status).toBe(3);
    expect(newer.error).toContain("newer app");
  });

  it("refuses a journal that inflates past a journal's size", () => {
    // 5 MB of spaces compress to a few kilobytes.
    const bomb = forgedJournal(" ".repeat(5_000_000));
    const reading = readJournal(JOURNAL_KEYS.publicKey, [bomb]);
    expect(reading.status).toBe(3);
    expect(reading.error).toContain("does not inflate");
  });

  it("refuses a wrong call: a reference, support's key, the build", () => {
    expect(readJournal("not-a-reference", []).status).toBe(1);
    const noKey = readJournal(JOURNAL_KEYS.publicKey, [], null);
    expect(noKey.status).toBe(1);
    expect(noKey.error).toContain("SUPPORT_JOURNAL_SECRET");
    // Without the build, the relays are unknown: nothing is asked of any relay.
    const env = { ...process.env, SUPPORT_JOURNAL_SECRET: bytesToHex(SUPPORT_SECRET) };
    const noBuild = spawnSync(process.execPath, [READER, "read", JOURNAL_KEYS.publicKey], {
      env,
      encoding: "utf8"
    });
    expect(noBuild.status).toBe(1);
    expect(noBuild.stderr).toContain("--version <version> or --commit <commit>");
  });
});

describe("the relays of a build, read in git by support's reader", () => {
  /** git, alone: none of this machine's settings (signing, hooks, identity). */
  const GIT_ENV = {
    ...process.env,
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_AUTHOR_NAME: "test",
    GIT_AUTHOR_EMAIL: "test@example.invalid",
    GIT_COMMITTER_NAME: "test",
    GIT_COMMITTER_EMAIL: "test@example.invalid"
  };

  function git(dir: string, ...args: string[]): string {
    const run = spawnSync("git", ["-C", dir, ...args], { env: GIT_ENV, encoding: "utf8" });
    if (run.status !== 0) throw new Error(`git ${args[0]} failed: ${run.stderr}`);
    return run.stdout.trim();
  }

  /**
   * A checkout of the reader whose history holds this very src/config/relays.ts, tagged v9.9.0,
   * then each of `declarations` of DEFAULT_RELAYS in a commit of its own: their hashes.
   */
  function checkout(dir: string, declarations: string[]): string[] {
    for (const file of [...READER_FILES, RELAYS_FILE]) {
      fs.mkdirSync(dirname(join(dir, file)), { recursive: true });
      fs.copyFileSync(join(ROOT, file), join(dir, file));
    }
    git(dir, "init", "-q");
    git(dir, "add", "-A");
    git(dir, "commit", "-q", "-m", "v9.9.0");
    git(dir, "tag", "-a", "v9.9.0", "-m", "v9.9.0");
    const source = fs.readFileSync(join(ROOT, RELAYS_FILE), "utf8");
    return declarations.map((declaration, index) => {
      const changed = source.replace(/^export const DEFAULT_RELAYS[^;]*;$/m, declaration);
      expect(changed).not.toBe(source);
      fs.writeFileSync(join(dir, RELAYS_FILE), changed);
      git(dir, "commit", "-q", "-a", "-m", `relays ${index}`);
      return git(dir, "rev-parse", "HEAD");
    });
  }

  /** The reader's `relays` command, from `dir`'s checkout. */
  function relaysOf(dir: string, ...args: string[]) {
    const run = spawnSync(
      process.execPath,
      [join(dir, "scripts/support-journal.mjs"), "relays", ...args],
      { env: process.env, encoding: "utf8" }
    );
    return {
      status: run.status,
      relays: run.status === 0 ? (JSON.parse(run.stdout) as unknown) : null,
      error: run.stderr
    };
  }

  it("reads DEFAULT_RELAYS of the version's tag or of the commit: that build's list", () => {
    const dir = fs.mkdtempSync(join(tmpdir(), "support-relays-"));
    try {
      const [oneLine, commented] = checkout(dir, [
        'export const DEFAULT_RELAYS: readonly string[] = ["wss://relay.example.org", "wss://no.str.cr"];',
        [
          "export const DEFAULT_RELAYS: readonly string[] = [",
          '  "wss://relay.example.org",',
          "  // Its operator's second server.",
          '  "wss://relay2.example.org"',
          "];"
        ].join("\n")
      ]);
      // This repository's own declaration, as a release tags it.
      expect(relaysOf(dir, "--version", "9.9.0")).toMatchObject({ relays: DEFAULT_RELAYS });
      expect(relaysOf(dir, "--version", "v9.9.0")).toMatchObject({ relays: DEFAULT_RELAYS });
      // A later commit (a staging build): its own list, the tag's unchanged.
      expect(relaysOf(dir, "--commit", oneLine!.slice(0, 7))).toMatchObject({
        relays: ["wss://relay.example.org", "wss://no.str.cr"]
      });
      expect(relaysOf(dir, "--commit", commented!.toUpperCase())).toMatchObject({
        relays: ["wss://relay.example.org", "wss://relay2.example.org"]
      });
      expect(relaysOf(dir, "--version", "9.9.0")).toMatchObject({ relays: DEFAULT_RELAYS });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("says when the build is not in the checkout, or its list cannot be read", () => {
    const dir = fs.mkdtempSync(join(tmpdir(), "support-relays-"));
    try {
      const [computed, notRelays] = checkout(dir, [
        "export const DEFAULT_RELAYS: readonly string[] = [...OTHER_RELAYS];",
        'export const DEFAULT_RELAYS: readonly string[] = ["https://relay.example.org"];'
      ]);
      const unknown = relaysOf(dir, "--version", "9.9.1");
      expect(unknown).toMatchObject({ status: 1, relays: null });
      expect(unknown.error).toContain("git fetch --tags origin");
      expect(relaysOf(dir, "--commit", "0123456").status).toBe(1);
      for (const commit of [computed!, notRelays!]) {
        const unread = relaysOf(dir, "--commit", commit);
        expect(unread).toMatchObject({ status: 1, relays: null });
        expect(unread.error).toContain("cannot be read: update this reader");
      }
      // A build named twice, or not at all, or not as a build.
      for (const args of [
        [],
        ["--version", "9.9.0", "--commit", computed!],
        ["--version", "main"],
        ["--commit", "HEAD"],
        ["--commit", "-p"]
      ]) {
        expect([args, relaysOf(dir, ...args).status]).toEqual([args, 1]);
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
