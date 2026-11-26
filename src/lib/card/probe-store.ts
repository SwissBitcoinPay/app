import { bytesToHex } from "@noble/hashes/utils.js";
import { Directory, File, Paths } from "expo-file-system";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

import { getAppInfo } from "@/lib/app-info";
import { secureRandomBytes } from "@/lib/random";

import { cardAppGroup } from "./app-group";

/*
 * What the app shares with its iOS notification service extension for the extension's test
 * (plugins/card-notification-extension): can a
 * card be paid from a notification, the app closed? The test wallet's seed, in the keychain group
 * both share; the Breez API key (public: it is in the app's bundle) and the runs, in their shared
 * container. The test wallet is the extension's own, never the account's: it holds the few sats a
 * test needs. Staging on an iPhone only: no other build has the extension. Same API on the web,
 * without it: probe-store.web.ts.
 */

/**
 * IRREVERSIBLE while builds with the extension's test are installed: what the extension reads
 * (ios/DarwinProbePlatform.swift: its keychain service, with the ":no-auth" expo-secure-store adds,
 * and its key; ios/CardProbe.swift: its directory, files and record version). Never change one side
 * without the other.
 */
export const PROBE_KEYCHAIN_SERVICE = "card-probe";
export const PROBE_SEED_KEY = "probe-seed";
export const PROBE_DIR_NAME = "probe";
const CONFIG_FILE = "config.json";
const RESULTS_DIR = "results";
const SENT_DIR = "sent";
const CONFIG_VERSION = 1;
export const PROBE_RECORD_VERSION = 1;
const SENT_VERSION = 1;

/** More files than this in a directory: only this many are read (a test makes a few dozen). */
const MAX_RUNS = 200;
const MAX_STEPS = 32;
const MAX_TEXT = 1000;
/** As the extension bounds the invoice of a payment it is asked for (ProbeRequest). */
export const MAX_PROBE_INVOICE_LENGTH = 2048;

export type ProbeMode =
  /** Connect, sync, read the balance. */
  | "sync"
  /** The same, then an invoice that funds the test wallet. */
  | "receive"
  /** The same, then pay the invoice of the notification. */
  | "pay"
  /**
   * No wallet: the app's own code of a card payment in the extension's JavaScript engine
   * (src/lib/engine/probe.ts), each of its steps recorded.
   */
  | "engine"
  /**
   * No wallet: the engine's runtime (src/lib/engine/runtime-probe.ts) on the extension's host: a
   * timer, HTTPS, a Nostr read on the device's relays, the card data the app shares, a URL.
   */
  | "runtime"
  /**
   * The test wallet connected through the engine's wallet (src/lib/engine/wallet-probe.ts), as a
   * card's wallet would be, then the invoice of the notification paid as the card payment core pays.
   */
  | "enginePay";
export const PROBE_MODES: readonly ProbeMode[] = [
  "sync",
  "receive",
  "pay",
  "engine",
  "runtime",
  "enginePay"
];

export type ProbeProfile =
  /** Breez's configuration without background tasks (`defaultServerConfig`). */
  | "light"
  /** Breez's mobile configuration (`defaultConfig`), as the app uses it. */
  | "standard";
export const PROBE_PROFILES: readonly ProbeProfile[] = ["light", "standard"];

export type ProbeStep = {
  name: string;
  /** Since the run started. */
  atMs: number;
  footprintBytes: number;
  availableBytes: number;
};

/** What the extension recorded of a run (CardProbe.swift, ProbeRecord). */
export type ProbeRecord = {
  run: string;
  mode: ProbeMode;
  profile: ProbeProfile;
  /** The model identifier ("iPhone16,1") and the system's version. */
  device: string;
  system: string;
  startedAt: number;
  /** 1 for the first run of the extension's process: a later one starts with what it holds. */
  processRun: number;
  steps: ProbeStep[];
  /** "running" while it runs, or when the system ended it without a word (its memory). */
  outcome: "running" | "ok" | "failed" | "expired";
  failedStep: string | null;
  error: string | null;
  peakFootprintBytes: number;
  /** Null when the system did not say. */
  minAvailableBytes: number | null;
  limitEstimateBytes: number | null;
  totalMs: number | null;
  balanceSats: bigint | null;
  /** The invoice that funds the test wallet (`receive`). */
  invoice: string | null;
  /** The SDK's status of the payment (`pay`). */
  paymentStatus: string | null;
  feeSats: bigint | null;
  /** What each step of the engine's runtime probe said (`runtime`), ok or not. */
  details: string | null;
};

/** A run the app asked for, and what the extension recorded of it. */
export type ProbeRun = {
  run: string;
  mode: ProbeMode;
  profile: ProbeProfile;
  /** When the app sent its notification (ms); null when only the extension's record is left. */
  sentAt: number | null;
  /** Expo Push's ticket of the notification. */
  ticket: string | null;
  /** Null while the extension recorded nothing: not run (yet). */
  record: ProbeRecord | null;
};

/** No test on this build or device (another platform, not staging, no shared container). */
export class ProbeUnavailableError extends Error {}

/** The app group the build shares with the extension (app.config.ts, `extra.cardAppGroup`). */
export function probeAppGroup(): string | null {
  return cardAppGroup();
}

function shared(): { group: string; directory: Directory } | null {
  // The team's measuring tool: the staging app only. A production app shares a group with its
  // extension too (the cards' payments), but never runs a test, which pays from a test wallet.
  if (Platform.OS !== "ios" || getAppInfo().variant !== "staging") return null;
  const group = probeAppGroup();
  if (!group) return null;
  // Expo lists the app groups of the app's entitlements, which the extension's plugin writes.
  const container = Paths.appleSharedContainers[group];
  return container ? { group, directory: new Directory(container, PROBE_DIR_NAME) } : null;
}

/** Whether this build and device run the extension's test. */
export function probeAvailable(): boolean {
  return shared() !== null;
}

function required(): { group: string; directory: Directory } {
  const found = shared();
  if (!found) throw new ProbeUnavailableError("No notification service extension here");
  return found;
}

/**
 * The seed's place: the keychain group the app shares with the extension, readable once the phone
 * was unlocked after its start (the extension runs with the phone locked), never in a backup.
 */
function seedOptions(group: string): SecureStore.SecureStoreOptions {
  return {
    keychainService: PROBE_KEYCHAIN_SERVICE,
    accessGroup: group,
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY
  };
}

function writeJson(directory: Directory, name: string, value: unknown): void {
  directory.create({ intermediates: true, idempotent: true });
  const draft = new File(directory, `${name}.tmp`);
  draft.writeSync(JSON.stringify(value));
  draft.moveSync(new File(directory, name), { overwrite: true });
}

/**
 * Gives the extension what a run needs: the test wallet's seed (made once, never replaced: the
 * wallet may hold sats) and the Breez API key. ProbeUnavailableError; an Error when the seed found
 * is not one this app made.
 */
export async function prepareProbe(apiKey: string): Promise<void> {
  const { group, directory } = required();
  const options = seedOptions(group);
  const seed = await SecureStore.getItemAsync(PROBE_SEED_KEY, options);
  if (seed === null) {
    await SecureStore.setItemAsync(PROBE_SEED_KEY, bytesToHex(secureRandomBytes(32)), options);
  } else if (!/^[0-9a-f]{64}$/.test(seed)) {
    throw new Error("The test wallet's seed is out of shape");
  }
  writeJson(directory, CONFIG_FILE, { version: CONFIG_VERSION, apiKey });
}

/** The most relays the runtime's test reads (src/lib/engine/runtime-probe.ts asks as few). */
const MAX_PROBE_RELAYS = 10;

/**
 * Gives the extension what the runtime's test needs (src/lib/engine/runtime-probe.ts): the
 * device's Nostr relays, wss only. No seed, no API key: it starts no wallet. ProbeUnavailableError.
 */
export function prepareRuntimeProbe(relays: readonly string[]): void {
  const { directory } = required();
  const kept = relays.filter((relay) => relay.startsWith("wss://")).slice(0, MAX_PROBE_RELAYS);
  if (kept.length === 0) throw new Error("No relay to read");
  writeJson(directory, CONFIG_FILE, { version: CONFIG_VERSION, relays: kept });
}

/** Whether the extension has what a run needs (prepareProbe). */
export async function probePrepared(): Promise<boolean> {
  const found = shared();
  if (!found) return false;
  if (!new File(found.directory, CONFIG_FILE).exists) return false;
  return (await SecureStore.getItemAsync(PROBE_SEED_KEY, seedOptions(found.group))) !== null;
}

/**
 * Notes a run the app asks for, before its notification goes: the extension runs only a run noted
 * here (CardProbe.swift, ProbeExpectation).
 */
export function recordSentProbe(run: Omit<ProbeRun, "record">): void {
  const { directory } = required();
  writeJson(new Directory(directory, SENT_DIR), `${run.run}.json`, {
    version: SENT_VERSION,
    run: run.run,
    mode: run.mode,
    profile: run.profile,
    sentAt: run.sentAt,
    ticket: run.ticket
  });
}

/** Forgets a run noted by recordSentProbe whose notification did not go. */
export function forgetSentProbe(run: string): void {
  const found = shared();
  if (!found || !isProbeRunId(run)) return;
  const file = new File(new Directory(found.directory, SENT_DIR), `${run}.json`);
  if (file.exists) file.delete();
}

export function isProbeRunId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)
  );
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isText(value: unknown, max = MAX_TEXT): value is string {
  return typeof value === "string" && value.length <= max;
}

/** A field the extension leaves out when it has no value (Swift's JSONEncoder, an optional). */
function absent(value: unknown): value is null | undefined {
  return value === undefined || value === null;
}

/** Sats as the extension writes them: a JSON number (UInt64) or a decimal string (U128). */
function sats(value: unknown): bigint | null {
  if (isCount(value)) return BigInt(value);
  if (typeof value === "string" && /^\d{1,20}$/.test(value)) return BigInt(value);
  return null;
}

function parseStep(value: unknown): ProbeStep | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (
    !isText(v.name, 64) ||
    !isCount(v.atMs) ||
    !isCount(v.footprintBytes) ||
    !isCount(v.availableBytes)
  ) {
    return null;
  }
  return {
    name: v.name,
    atMs: v.atMs,
    footprintBytes: v.footprintBytes,
    availableBytes: v.availableBytes
  };
}

/** A record of the extension, null when it is not one this app reads (or of a newer format). */
export function parseProbeRecord(value: unknown): ProbeRecord | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (v.version !== PROBE_RECORD_VERSION) return null;
  if (
    !isProbeRunId(v.run) ||
    !PROBE_MODES.includes(v.mode as ProbeMode) ||
    !PROBE_PROFILES.includes(v.profile as ProbeProfile) ||
    !isText(v.device, 64) ||
    !isText(v.system, 32) ||
    !isCount(v.startedAt) ||
    !isCount(v.processRun) ||
    !Array.isArray(v.steps) ||
    v.steps.length > MAX_STEPS ||
    !["running", "ok", "failed", "expired"].includes(v.outcome as string) ||
    !isCount(v.peakFootprintBytes)
  ) {
    return null;
  }
  const steps = v.steps.map(parseStep);
  if (steps.some((step) => step === null)) return null;
  if (
    !(absent(v.failedStep) || isText(v.failedStep, 64)) ||
    !(absent(v.error) || isText(v.error)) ||
    !(absent(v.minAvailableBytes) || isCount(v.minAvailableBytes)) ||
    !(absent(v.limitEstimateBytes) || isCount(v.limitEstimateBytes)) ||
    !(absent(v.totalMs) || isCount(v.totalMs)) ||
    !(absent(v.balanceSats) || sats(v.balanceSats) !== null) ||
    !(absent(v.invoice) || isText(v.invoice, MAX_PROBE_INVOICE_LENGTH)) ||
    !(absent(v.paymentStatus) || isText(v.paymentStatus, 64)) ||
    !(absent(v.feeSats) || sats(v.feeSats) !== null) ||
    !(absent(v.details) || isText(v.details))
  ) {
    return null;
  }
  return {
    run: v.run,
    mode: v.mode as ProbeMode,
    profile: v.profile as ProbeProfile,
    device: v.device,
    system: v.system,
    startedAt: v.startedAt,
    processRun: v.processRun,
    steps: steps as ProbeStep[],
    outcome: v.outcome as ProbeRecord["outcome"],
    failedStep: absent(v.failedStep) ? null : (v.failedStep as string),
    error: absent(v.error) ? null : (v.error as string),
    peakFootprintBytes: v.peakFootprintBytes,
    minAvailableBytes: absent(v.minAvailableBytes) ? null : (v.minAvailableBytes as number),
    limitEstimateBytes: absent(v.limitEstimateBytes) ? null : (v.limitEstimateBytes as number),
    totalMs: absent(v.totalMs) ? null : (v.totalMs as number),
    balanceSats: absent(v.balanceSats) ? null : sats(v.balanceSats),
    invoice: absent(v.invoice) ? null : (v.invoice as string),
    paymentStatus: absent(v.paymentStatus) ? null : (v.paymentStatus as string),
    feeSats: absent(v.feeSats) ? null : sats(v.feeSats),
    details: absent(v.details) ? null : (v.details as string)
  };
}

function parseSent(value: unknown): Omit<ProbeRun, "record"> | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (
    v.version !== SENT_VERSION ||
    !isProbeRunId(v.run) ||
    !PROBE_MODES.includes(v.mode as ProbeMode) ||
    !PROBE_PROFILES.includes(v.profile as ProbeProfile) ||
    !isCount(v.sentAt) ||
    (v.ticket !== null && !isText(v.ticket, 64))
  ) {
    return null;
  }
  return {
    run: v.run,
    mode: v.mode as ProbeMode,
    profile: v.profile as ProbeProfile,
    sentAt: v.sentAt,
    ticket: v.ticket as string | null
  };
}

/** The JSON files of a directory named after a run, by run (unreadable ones left out). */
function readRunFiles<T>(
  directory: Directory,
  parse: (value: unknown) => T | null
): Map<string, T> {
  const found = new Map<string, T>();
  if (!directory.exists) return found;
  for (const entry of directory.list().slice(0, MAX_RUNS)) {
    const run = /^(.+)\.json$/.exec(entry.name)?.[1];
    if (!(entry instanceof File) || !isProbeRunId(run)) continue;
    try {
      const value = parse(JSON.parse(entry.textSync()));
      if (value !== null) found.set(run, value);
    } catch {
      // Being written (the extension writes whole files, then moves them) or damaged: left out.
    }
  }
  return found;
}

/** The runs asked for and what the extension recorded, the latest first. */
export function readProbeRuns(): ProbeRun[] {
  const found = shared();
  if (!found) return [];
  const sent = readRunFiles(new Directory(found.directory, SENT_DIR), parseSent);
  const records = readRunFiles(new Directory(found.directory, RESULTS_DIR), parseProbeRecord);
  const runs: ProbeRun[] = [...sent.values()].map((run) => ({
    ...run,
    record: records.get(run.run) ?? null
  }));
  for (const record of records.values()) {
    if (sent.has(record.run)) continue;
    runs.push({
      run: record.run,
      mode: record.mode,
      profile: record.profile,
      sentAt: null,
      ticket: null,
      record
    });
  }
  const time = (run: ProbeRun) => run.sentAt ?? run.record?.startedAt ?? 0;
  return runs.sort((a, b) => time(b) - time(a));
}

/** Forgets the runs (the test wallet and its seed stay). */
export function clearProbeRuns(): void {
  const found = shared();
  if (!found) return;
  for (const name of [SENT_DIR, RESULTS_DIR]) {
    const directory = new Directory(found.directory, name);
    if (directory.exists) directory.delete();
  }
}

/**
 * Everything of the test on this device: the seed, the test wallet's storage and the runs
 * ("Log out", device-wipe.ts). The few sats the test wallet holds go with it.
 */
export async function forgetProbe(): Promise<void> {
  const found = shared();
  if (!found) return;
  await SecureStore.deleteItemAsync(PROBE_SEED_KEY, seedOptions(found.group));
  if (found.directory.exists) found.directory.delete();
}
