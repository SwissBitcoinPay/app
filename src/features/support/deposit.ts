import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import { deflateSync } from "fflate";

import { majority } from "@/config/registry";
import { DEFAULT_RELAYS } from "@/config/relays";
import { bytesToBase64 } from "@/lib/base64";
import type { NostrEvent } from "@/lib/nostr/event";
import { randomNostrKeys, type NostrKeys } from "@/lib/nostr/keys";
import { conversationKey } from "@/lib/nostr/nip44";
import { publishToQuorum } from "@/lib/nostr/pool";
import { sealRecord } from "@/lib/nostr/record";

import {
  JOURNAL_BLOCK,
  JOURNAL_LIFETIME_S,
  JOURNAL_MAX_PARTS,
  JOURNAL_MAX_REPORT_BYTES,
  JOURNAL_PART_BYTES,
  JOURNAL_RECORD_TYPE,
  JOURNAL_VERSION
} from "./journal-format";

/*
 * The journal deposited for support: rather than a file attached to the mail, "Contact support"
 * deposits the journal's copy (report.ts) on the relays, encrypted for support's key only
 * (SUPPORT_JOURNAL_KEY), and the mail carries its reference. The mail's provider never holds the
 * journal, and the web app needs no file to attach. Support's reader: scripts/support-journal.mjs.
 *
 * - Signed by a key of its own, drawn for this journal and forgotten with it: nothing ties it to
 *   the account, and its public key is the reference.
 * - Compressed (raw DEFLATE, RFC 1951), then cut into parts of JOURNAL_PART_BYTES, one record each
 *   (kind 30078, NIP-44 for support's key, sealRecord), which the relays drop after 30 days
 *   (NIP-40). It cannot be taken back: its key is gone (support reads it within those 30 days).
 * - Written to a majority of the build's default relays (DEFAULT_RELAYS), whatever relays the
 *   device works with: the mail names the build (report.ts, supportSignature) and support's reader
 *   finds those relays from it, so the mail names none. Over connections of its own ("single"): no
 *   authentication of another key's goes with it.
 * When it cannot be deposited, the mail takes the journal as before (SupportSettings.tsx).
 */

/**
 * Where every journal goes: the build's default relays, never the device's (currentRelays).
 * Support's reader reads this list in src/config/relays.ts at the version or commit the mail
 * names (scripts/support-journal.mjs, `relaysAt`).
 */
export const JOURNAL_RELAYS: readonly string[] = DEFAULT_RELAYS;

/** Per relay, connection included. */
export const JOURNAL_TIMEOUT_MS = 10_000;

/** Prefix of the hash that gives a part's `d` tag. Never change it. */
const ADDRESS_PREFIX = "sattle.me/support-journal/part/v1";

/**
 * The `d` tag of part `index` of the journal its single-use key `author` signs: opaque, and unique
 * to that journal (a relay cannot tell two journals' parts from any other app's records). Support's
 * reader finds the parts by their author, not by it.
 */
export function journalPartAddress(author: string, index: number): string {
  return bytesToHex(sha256(utf8ToBytes(`${ADDRESS_PREFIX}\n${author}\n${index}`)));
}

/** The journal is larger than its records may hold (JOURNAL_MAX_PARTS): attached instead. */
export class JournalTooLargeError extends Error {
  constructor() {
    super("The journal is too large to deposit");
    this.name = "JournalTooLargeError";
  }
}

/** A journal sealed for support, ready to publish. */
export type JournalDeposit = {
  /** Its reference, written in the mail: its single-use key's public key (hex). */
  reference: string;
  /** Its records, part 0 first. */
  events: readonly NostrEvent[];
  /** The single-use key, which authenticates its writes (NIP-42); forgotten with the deposit. */
  authKey: Uint8Array;
};

/** One part's value, inside its record. */
export type JournalPart = {
  version: typeof JOURNAL_VERSION;
  part: number;
  parts: number;
  /** Its bytes of the compressed journal, base64. */
  data: string;
};

/**
 * Seals `report` (report.ts, supportReport) for support's key `supportKey` (hex, x-only): its
 * records, dated `now`, and the reference that finds them. Throws JournalTooLargeError past
 * JOURNAL_MAX_PARTS. Synchronous: the web app writes the mail from the tap (SupportSettings.tsx).
 */
export function prepareJournalDeposit(
  report: string,
  { supportKey, now, keys = randomNostrKeys() }: { supportKey: string; now: Date; keys?: NostrKeys }
): JournalDeposit {
  const text = utf8ToBytes(report);
  if (text.length > JOURNAL_MAX_REPORT_BYTES) throw new JournalTooLargeError();
  const compressed = deflateSync(text, { level: 9 });
  const parts = Math.max(1, Math.ceil(compressed.length / JOURNAL_PART_BYTES));
  if (parts > JOURNAL_MAX_PARTS) throw new JournalTooLargeError();
  const encryptionKey = conversationKey(keys.secretKey, supportKey);
  const createdAt = Math.floor(now.getTime() / 1000);
  const events = Array.from({ length: parts }, (_, part) => {
    const value: JournalPart = {
      version: JOURNAL_VERSION,
      part,
      parts,
      data: bytesToBase64(
        compressed.subarray(part * JOURNAL_PART_BYTES, (part + 1) * JOURNAL_PART_BYTES)
      )
    };
    return sealRecord({
      type: JOURNAL_RECORD_TYPE,
      value,
      signer: keys.secretKey,
      encryptionKey,
      address: journalPartAddress(keys.publicKey, part),
      createdAt,
      expiresAt: createdAt + JOURNAL_LIFETIME_S,
      block: JOURNAL_BLOCK
    });
  });
  return { reference: keys.publicKey, events, authKey: keys.secretKey };
}

/**
 * Publishes every record of `deposit` to JOURNAL_RELAYS: resolves once a majority of them took
 * each, rejects as soon as one of them can no longer reach it (the mail then takes the journal).
 */
export async function publishJournalDeposit(
  deposit: JournalDeposit,
  timeoutMs: number = JOURNAL_TIMEOUT_MS
): Promise<void> {
  const call = {
    relays: JOURNAL_RELAYS,
    channel: "single",
    timeoutMs,
    authKey: deposit.authKey
  } as const;
  await Promise.all(
    deposit.events.map((event) => publishToQuorum(event, call, majority(JOURNAL_RELAYS.length)))
  );
}

/**
 * The mail's line that finds the journal, after the build's (report.ts, supportSignature): its
 * reference ("Logs:"), a technical label in English in every language, as the build's lines:
 * support's reader takes it, and the build's version or commit, which give its relays.
 */
export function journalLine(deposit: Pick<JournalDeposit, "reference">): string {
  return `Logs: ${deposit.reference}`;
}
