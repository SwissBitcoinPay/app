// Support's reader of the journals "Contact support" deposits: the app deposits the journal
// encrypted for support's key on its build's default relays (src/features/support/deposit.ts,
// JOURNAL_RELAYS), and the mail ends with the build ("sattle.me v2.9.0 · f82ecab") and its
// reference ("Logs: <reference>"). This script reads those relays in this repository's history
// (DEFAULT_RELAYS of src/config/relays.ts at that version or commit), fetches the journal there,
// checks it and prints it as JSON, for support's agent and for a person alike. No server: it runs
// where support's private key is, and only reads public relays.
//
//   node scripts/support-journal.mjs read <reference> --version <version> | --commit <commit>
//       The build, as the mail's line "sattle.me v2.9.0 · f82ecab" gives it: its version (its
//       release tag, vX.Y.Z), or its commit (a staging build's version is not its tag: use the
//       commit). Needs this checkout's history and tags: git fetch --tags origin.
//       The private key in SUPPORT_JOURNAL_SECRET (64 hex digits), never on the command line.
//       --events <file>: the relays' events from a JSON file instead (tests, offline).
//   node scripts/support-journal.mjs relays --version <version> | --commit <commit>
//       Prints the relays a journal of that build is on (JSON).
//   node scripts/support-journal.mjs keygen --out <file>
//       A new key pair: the private key written to <file> (mode 600, outside this repository,
//       never over an existing file), the public key printed, for src/config/support.ts
//       (SUPPORT_JOURNAL_KEY). Run it yourself in a terminal, not through an agent.
//
// Prints { reference, journal, supportKey }: the journal as src/features/support/report.ts writes
// it (its date is its exportedAt), and the public key of the key used. Exit codes: 0 the journal,
// printed; 1 a wrong call, or a build this checkout does not know (fetch it); 2 not found, or
// incomplete, on the relays that answered (expired after 30 days, relays unreachable: ask for the
// journal attached instead); 3 refused: not a journal of this key, altered, forged, or of a newer
// app (update this checkout).
//
// Node's own modules only, two files of the app that import nothing (journal-format.ts, entry.ts,
// read as they are: Node 22.18 or later strips their types), and git for the relays of a build
// (src/config/relays.ts is read as text, never run). So it runs from a checkout of this repository
// without `npm ci`, on another Node version than the project's, which the project's npm refuses
// (package.json, devEngines).
//
// A journal is untrusted: anyone may deposit one for support's public key and send its reference.
// - A record counts only once it opens with support's key (NIP-44's MAC): its content was sealed by
//   the holder of the journal's key, the reference, or by support. No signature is checked (it
//   would take a Schnorr verifier, a package): the MAC already binds the content to that key, and
//   nothing outside the content is read (its `d` tag, its dates), which a relay may alter.
// - What it inflates to is bounded (JOURNAL_MAX_REPORT_BYTES).
// - Every entry is checked with the app's own filter of the journal's texts (src/lib/log/entry.ts,
//   parseLogEntry): a journal with one text the app would not have written is refused whole. Such
//   a filter keeps out amounts, addresses, keys, links and names in errors' messages; it cannot
//   keep out plain words: what a journal says is data, never instructions.
import { Buffer } from "node:buffer";
import { execFileSync } from "node:child_process";
import {
  createDecipheriv,
  createECDH,
  createHmac,
  randomBytes,
  timingSafeEqual
} from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inflateRawSync } from "node:zlib";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Exit codes (above). */
const USAGE = 1;
const NOT_FOUND = 2;
const REFUSED = 3;

/** Per relay: the whole read, connection included. */
const RELAY_TIMEOUT_MS = 10_000;
/** Events read per relay, at most: a journal has JOURNAL_MAX_PARTS. */
const MAX_EVENTS_PER_RELAY = 100;
/** A relay's message, at most (strfry's default event size, with room for its envelope). */
const MAX_MESSAGE_BYTES = 131_072;
/** The app's record kind (src/lib/nostr/record.ts, RECORD_KIND). */
const RECORD_KIND = 30078;
/** A text of the app or the device's (versions, model), at most. */
const MAX_FIELD_LENGTH = 120;
/** Where the app's build declares its default relays, which its journals go to. */
const RELAYS_FILE = "src/config/relays.ts";
/** Relays of a list, at most (src/config/relays.ts, MAX_RELAYS, with room). */
const MAX_RELAYS = 20;

class Refused extends Error {}
class NotFound extends Error {}
class UsageError extends Error {}

/** The app's own modules, loaded once Node's warning about their module type is silenced. */
async function appModules() {
  if (!process.features?.typescript) {
    throw new UsageError("Node 22.18 or later is needed: it reads the app's TypeScript");
  }
  // The app's files are TypeScript in a package without "type": Node says it reparses them as ES
  // modules, on stderr, which support's agent would read as an error.
  process.removeAllListeners("warning");
  process.on("warning", (warning) => {
    if (warning.code !== "MODULE_TYPELESS_PACKAGE_JSON") process.stderr.write(`${warning}\n`);
  });
  const [format, entry] = await Promise.all([
    import("../src/features/support/journal-format.ts"),
    import("../src/lib/log/entry.ts")
  ]);
  return { format, entry };
}

// --- NIP-44 v2, as src/lib/nostr/nip44.ts, with Node's crypto -------------------------------------

const hmacSha256 = (key, ...data) => {
  const mac = createHmac("sha256", key);
  for (const item of data) mac.update(item);
  return mac.digest();
};

/** Support's key, an ECDH of secp256k1: throws for 0 or a key past the curve's order. */
function supportEcdh(secretKey) {
  const ecdh = createECDH("secp256k1");
  ecdh.setPrivateKey(secretKey);
  return ecdh;
}

/** Its x-only public key (BIP-340), hex: as SUPPORT_JOURNAL_KEY. */
const xOnly = (ecdh) => ecdh.getPublicKey(null, "compressed").subarray(1).toString("hex");

/**
 * NIP-44's conversation key of support's key and the journal's (`publicKey`, x-only hex): the
 * x coordinate of their ECDH through HKDF-extract, salt "nip44-v2". Throws for a point off the curve.
 */
function conversationKey(ecdh, publicKey) {
  const shared = ecdh.computeSecret(Buffer.from(`02${publicKey}`, "hex"));
  return hmacSha256(Buffer.from("nip44-v2"), shared);
}

/** HKDF-expand (RFC 5869) with SHA-256: `length` bytes of `key` and `info`. */
function expand(key, info, length) {
  const blocks = [];
  let previous = Buffer.alloc(0);
  for (let index = 1; blocks.length * 32 < length; index += 1) {
    previous = hmacSha256(key, previous, info, Buffer.from([index]));
    blocks.push(previous);
  }
  return Buffer.concat(blocks).subarray(0, length);
}

/** NIP-44's padded length (`calc_padded_len`). */
function paddedLength(length) {
  if (length <= 32) return 32;
  const nextPower = 1 << (Math.floor(Math.log2(length - 1)) + 1);
  const chunk = nextPower <= 256 ? 32 : nextPower / 8;
  return chunk * (Math.floor((length - 1) / chunk) + 1);
}

/** The text of a NIP-44 v2 payload; throws when it is not one sealed with `key`. */
function nip44Decrypt(payload, key) {
  if (payload.length < 132 || payload.length > 87_472) throw new Error("Invalid payload size");
  const data = Buffer.from(payload, "base64");
  if (data.toString("base64") !== payload) throw new Error("Invalid base64");
  if (data.length < 99 || data.length > 65_603 || data[0] !== 2) throw new Error("Not NIP-44 v2");
  const nonce = data.subarray(1, 33);
  const ciphertext = data.subarray(33, data.length - 32);
  const keys = expand(key, nonce, 76);
  const mac = hmacSha256(keys.subarray(44, 76), nonce, ciphertext);
  if (!timingSafeEqual(mac, data.subarray(data.length - 32))) throw new Error("Invalid MAC");
  // OpenSSL's ChaCha20 takes its block counter (0, little endian) before the 12-byte nonce.
  const iv = Buffer.concat([Buffer.alloc(4), keys.subarray(32, 44)]);
  const decipher = createDecipheriv("chacha20", keys.subarray(0, 32), iv);
  const padded = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  const length = padded.readUInt16BE(0);
  if (length < 1 || padded.length !== 2 + paddedLength(length)) throw new Error("Invalid padding");
  return new TextDecoder("utf-8", { fatal: true }).decode(padded.subarray(2, 2 + length));
}

// --- The journal ----------------------------------------------------------------------------------

/**
 * A record of the journal `reference` names: its part, "closed" when it does not open with
 * support's key (sealed for another key, or altered on its way), or null when it is no record of
 * that author. Throws Refused for a content that opens but is no part of a journal (forged).
 */
function openPart(event, { format, key, reference }) {
  if (
    event?.kind !== RECORD_KIND ||
    event.pubkey !== reference ||
    typeof event.content !== "string"
  ) {
    return null;
  }
  let text;
  try {
    text = nip44Decrypt(event.content, key);
  } catch {
    return "closed";
  }
  let envelope;
  try {
    envelope = JSON.parse(text);
  } catch {
    throw new Refused("A record of the journal is not JSON");
  }
  if (envelope?.t !== format.JOURNAL_RECORD_TYPE) throw new Refused("Not a journal's record");
  const value = envelope.v;
  if (value?.version !== format.JOURNAL_VERSION) {
    throw new Refused("A journal of a newer app: update this repository");
  }
  const { part, parts, data } = value;
  if (
    !Number.isSafeInteger(parts) ||
    parts < 1 ||
    parts > format.JOURNAL_MAX_PARTS ||
    !Number.isSafeInteger(part) ||
    part < 0 ||
    part >= parts ||
    typeof data !== "string"
  ) {
    throw new Refused("A record of the journal is malformed");
  }
  const bytes = Buffer.from(data, "base64");
  if (bytes.toString("base64") !== data || bytes.length > format.JOURNAL_PART_BYTES) {
    throw new Refused("A record of the journal is malformed");
  }
  return { part, parts, bytes };
}

/** The journal's compressed bytes, its parts put back in order; throws when one is missing. */
function assemble(opened, closed) {
  const counts = new Set(opened.map(({ parts }) => parts));
  if (counts.size > 1) throw new Refused("The journal's records disagree on its parts");
  const [parts] = counts;
  const byPart = new Map();
  for (const item of opened) {
    const known = byPart.get(item.part);
    if (known && !known.bytes.equals(item.bytes)) {
      throw new Refused("The journal has two different versions of a part");
    }
    byPart.set(item.part, item);
  }
  const missing = Array.from({ length: parts }, (_, index) => index).filter((i) => !byPart.has(i));
  if (missing.length > 0) {
    const altered = closed > 0 ? ` (${closed} record(s) did not open: altered?)` : "";
    throw new NotFound(
      `Incomplete journal: part ${missing.join(", ")} of ${parts} not found${altered}`
    );
  }
  return Buffer.concat(Array.from({ length: parts }, (_, index) => byPart.get(index).bytes));
}

const exactKeys = (value, keys) =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  Object.keys(value).length === keys.length &&
  keys.every((key) => Object.hasOwn(value, key));

/** JSON with every object's keys sorted: equal for equal values, whatever their keys' order. */
const canonical = (value) =>
  JSON.stringify(value, (_, item) =>
    item !== null && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(
          Object.keys(item)
            .sort()
            .map((key) => [key, item[key]])
        )
      : item
  );

/** An ISO date as the journal writes them (toISOString): its milliseconds, else null. */
function isoMs(value) {
  if (typeof value !== "string") return null;
  const ms = Date.parse(value);
  return Number.isSafeInteger(ms) && ms >= 0 && new Date(ms).toISOString() === value ? ms : null;
}

/** A text of the app's or the device's: short, printable, or null. */
const isField = (value) =>
  value === null ||
  (typeof value === "string" &&
    value.length <= MAX_FIELD_LENGTH &&
    // No control character: one line of text.
    !/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/.test(value));

/**
 * The journal (src/features/support/report.ts, supportReport), checked whole: its shape, and
 * each entry as the app reads its own journal (parseLogEntry). Throws Refused otherwise.
 */
function checkReport(report, { parseLogEntry }) {
  const refuse = (what) => {
    throw new Refused(`Refused journal: ${what}`);
  };
  if (
    !exactKeys(report, ["report", "version", "exportedAt", "app", "device", "entries", "leftOut"])
  ) {
    refuse("not a journal of the app");
  }
  if (report.report !== "sattleme-app-log") refuse("not a journal of the app");
  if (report.version !== 1) refuse("of a newer app: update this repository");
  if (isoMs(report.exportedAt) === null) refuse("its date");
  const { app, device } = report;
  if (
    !exactKeys(app, ["variant", "version", "buildNumber", "commit", "updateId"]) ||
    !Object.values(app).every(isField) ||
    typeof app.variant !== "string" ||
    typeof app.version !== "string"
  ) {
    refuse("its app");
  }
  if (
    !exactKeys(device, ["os", "version", "manufacturer", "model"]) ||
    !Object.values(device).every(isField) ||
    !["ios", "android", "web"].includes(device.os)
  ) {
    refuse("its device");
  }
  if (!Array.isArray(report.entries) || !Array.isArray(report.leftOut)) refuse("its entries");
  report.entries.forEach((entry, index) => {
    const at = exactKeys(entry, ["at", "level", "event", "error", "build", "skipped"])
      ? isoMs(entry.at)
      : null;
    const parsed = at === null ? null : parseLogEntry({ ...entry, at });
    // Whole, as written: parseLogEntry keeps what it knows, and a text it would trim is refused.
    if (parsed === null || canonical({ ...parsed, at: entry.at }) !== canonical(entry)) {
      refuse(`its entry ${index}, which the app would not have written`);
    }
  });
  report.leftOut.forEach((left, index) => {
    const lastAt = exactKeys(left, ["level", "event", "kind", "code", "count", "lastAt"])
      ? isoMs(left.lastAt)
      : null;
    // Read as the entry it counts: its level, its event, its error's kind and code.
    const error =
      left?.kind === null
        ? left.code === null
          ? null
          : undefined
        : { kind: left?.kind, code: left?.code, message: null, cause: null };
    const parsed =
      lastAt === null || error === undefined || !(left.count > 0)
        ? null
        : parseLogEntry({
            at: lastAt,
            level: left.level,
            event: left.event,
            error,
            build: null,
            skipped: left.count
          });
    if (parsed === null)
      refuse(`its left out entry ${index}, which the app would not have written`);
  });
  return report;
}

/**
 * The journal `reference` names, from `answers` (each relay's events): opened with `key`,
 * checked, inflated. Throws NotFound or Refused.
 */
export function readJournal({ answers, key, reference, format, entry }) {
  const opened = [];
  let closed = 0;
  for (const events of answers.values()) {
    for (const event of events) {
      const part = openPart(event, { format, key, reference });
      if (part === "closed") closed += 1;
      else if (part) opened.push(part);
    }
  }
  if (opened.length === 0 && closed > 0) {
    throw new Refused(
      "The journal's records do not open with this key: sealed for another key, or altered"
    );
  }
  if (opened.length === 0) throw new NotFound("No journal of this reference on these relays");
  const compressed = assemble(opened, closed);
  let text;
  try {
    const bytes = inflateRawSync(compressed, { maxOutputLength: format.JOURNAL_MAX_REPORT_BYTES });
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Refused("The journal does not inflate (damaged, or larger than a journal)");
  }
  let report;
  try {
    report = JSON.parse(text);
  } catch {
    throw new Refused("The journal is not JSON");
  }
  // When it was written: the journal's own date (exportedAt), which its encryption vouches for.
  return { reference, journal: checkReport(report, entry) };
}

// --- Relays ---------------------------------------------------------------------------------------

/** `list` when it is a list of relays: wss:// (ws:// on a local network) URLs, each once. */
function checkRelays(list) {
  if (list.length === 0 || list.length > MAX_RELAYS) return null;
  for (const relay of list) {
    let url;
    try {
      url = new URL(relay);
    } catch {
      return null;
    }
    if (url.protocol !== "wss:" && url.protocol !== "ws:") return null;
  }
  return [...new Set(list)];
}

/**
 * DEFAULT_RELAYS in the text of src/config/relays.ts, or null when it is not a literal list of
 * strings (one per line, or all on its line; lines of comments between them).
 */
function relaysOfSource(source) {
  const match = /^export const DEFAULT_RELAYS: readonly string\[\] = \[([^\]]*)\];$/m.exec(source);
  if (!match) return null;
  const items = match[1]
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("//"))
    .join(" ");
  if (!/^(?:"[^"\\\s]+"\s*,\s*)*(?:"[^"\\\s]+"\s*,?)?$/.test(items)) return null;
  return checkRelays(Array.from(items.matchAll(/"([^"]+)"/g), ([, relay]) => relay));
}

/**
 * The git revision of the build the mail names: its release tag for `--version` (2.9.0, v2.9.0),
 * its commit for `--commit` (7 to 64 hex digits, as the app shows it). Throws UsageError.
 */
function buildRevision(args) {
  const version = option(args, "--version");
  const commit = option(args, "--commit");
  if ((version === undefined) === (commit === undefined)) {
    throw new UsageError(
      "The build: --version <version> or --commit <commit>, " +
        'as the mail\'s line "sattle.me v2.9.0 · f82ecab" gives them'
    );
  }
  if (version !== undefined) {
    const number = /^v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?)$/.exec(version.trim())?.[1];
    if (!number) throw new UsageError("--version: the app's version, as v2.9.0");
    return { revision: `refs/tags/v${number}`, name: `v${number}` };
  }
  const hash = commit.trim().toLowerCase();
  if (!/^[0-9a-f]{7,64}$/.test(hash)) throw new UsageError("--commit: 7 to 64 hex digits");
  return { revision: `${hash}^{commit}`, name: hash };
}

/**
 * The relays a journal of the build `args` names is on: DEFAULT_RELAYS of src/config/relays.ts
 * at that build, read in this checkout's git history. Throws UsageError when git does not have it
 * or cannot be read.
 */
function relaysAt(args) {
  const { revision, name } = buildRevision(args);
  let source;
  try {
    source = execFileSync("git", ["-C", ROOT, "show", `${revision}:${RELAYS_FILE}`], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      maxBuffer: 1_048_576
    });
  } catch {
    throw new UsageError(
      `${name} is not in this checkout's history (git fetch --tags origin), or git is missing`
    );
  }
  const relays = relaysOfSource(source);
  if (relays === null) {
    throw new UsageError(`The default relays of ${name} cannot be read: update this reader`);
  }
  return relays;
}

/** One relay's events of `filter` (NIP-01): until its EOSE, or what it sent by the timeout. */
function queryRelay(url, filter) {
  return new Promise((resolve) => {
    const events = [];
    let socket;
    const done = () => {
      clearTimeout(timer);
      try {
        socket?.close();
      } catch {
        // Already closed.
      }
      resolve(events);
    };
    const timer = setTimeout(done, RELAY_TIMEOUT_MS);
    try {
      socket = new WebSocket(url);
    } catch {
      done();
      return;
    }
    const id = randomBytes(8).toString("hex");
    socket.onopen = () => socket.send(JSON.stringify(["REQ", id, filter]));
    socket.onerror = done;
    socket.onclose = done;
    socket.onmessage = ({ data }) => {
      if (typeof data !== "string" || data.length > MAX_MESSAGE_BYTES) return;
      let message;
      try {
        message = JSON.parse(data);
      } catch {
        return;
      }
      if (!Array.isArray(message) || message[1] !== id) return;
      if (message[0] === "EVENT" && events.length < MAX_EVENTS_PER_RELAY) events.push(message[2]);
      else if (message[0] === "EOSE" || message[0] === "CLOSED") done();
    };
  });
}

// --- Commands -------------------------------------------------------------------------------------

function option(args, name) {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

/** Support's key, from the environment (64 hex digits), or null. */
function secretKey() {
  const hex = (process.env.SUPPORT_JOURNAL_SECRET ?? "").trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(hex)) return null;
  try {
    return supportEcdh(Buffer.from(hex, "hex"));
  } catch {
    return null;
  }
}

async function read(args) {
  const reference = String(args[0] ?? "")
    .trim()
    .toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(reference)) {
    throw new UsageError('The reference: the 64 hex digits after "Logs:" in the mail');
  }
  const ecdh = secretKey();
  if (ecdh === null) {
    throw new UsageError("SUPPORT_JOURNAL_SECRET: support's private key, 64 hex digits");
  }
  const { format, entry } = await appModules();
  let answers;
  const file = option(args, "--events");
  if (file !== undefined) {
    const events = JSON.parse(readFileSync(file, "utf8"));
    if (!Array.isArray(events)) throw new UsageError("--events: a JSON array of events");
    answers = new Map([[file, events]]);
  } else {
    const relays = relaysAt(args);
    const filter = { kinds: [RECORD_KIND], authors: [reference], limit: MAX_EVENTS_PER_RELAY };
    const read = await Promise.all(relays.map((relay) => queryRelay(relay, filter)));
    answers = new Map(relays.map((relay, index) => [relay, read[index]]));
  }
  let key;
  try {
    key = conversationKey(ecdh, reference);
  } catch {
    throw new Refused("Not a journal's reference: no point of the curve");
  }
  const result = readJournal({ answers, key, reference, format, entry });
  process.stdout.write(`${JSON.stringify({ ...result, supportKey: xOnly(ecdh) }, null, 2)}\n`);
}

function printRelays(args) {
  process.stdout.write(`${JSON.stringify(relaysAt(args), null, 2)}\n`);
}

function keygen(args) {
  const out = option(args, "--out");
  if (!out) throw new UsageError("keygen --out <file>: where to write the private key");
  const target = path.resolve(out);
  if (target === ROOT || target.startsWith(`${ROOT}${path.sep}`)) {
    throw new UsageError("Write the private key outside this repository: it never goes in git");
  }
  const ecdh = createECDH("secp256k1");
  ecdh.generateKeys();
  // 32 bytes, its leading zeros included.
  const secret = ecdh.getPrivateKey("hex").padStart(64, "0");
  // "wx": never over an existing file, a key already in use.
  writeFileSync(target, `${secret}\n`, { mode: 0o600, flag: "wx" });
  process.stdout.write(
    `Private key written to ${target} (support's only: SUPPORT_JOURNAL_SECRET).\n` +
      `Public key, for src/config/support.ts (SUPPORT_JOURNAL_KEY):\n${xOnly(ecdh)}\n`
  );
}

async function main([command, ...args]) {
  try {
    if (command === "read") await read(args);
    else if (command === "relays") printRelays(args);
    else if (command === "keygen") keygen(args);
    else {
      throw new UsageError(
        "Usage: support-journal.mjs read <reference> --version <version> | --commit <commit>\n" +
          "       support-journal.mjs relays --version <version> | --commit <commit>\n" +
          "       support-journal.mjs keygen --out <file>"
      );
    }
    return 0;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    if (error instanceof NotFound) return NOT_FOUND;
    if (error instanceof Refused) return REFUSED;
    if (error instanceof UsageError) return USAGE;
    return USAGE;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}
