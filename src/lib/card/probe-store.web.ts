/*
 * Same API as probe-store.ts. The iOS notification service extension's test runs in the iOS
 * staging app only: the web app has no extension, nothing is kept.
 */
import type { ProbeMode, ProbeProfile, ProbeRecord, ProbeRun, ProbeStep } from "./probe-store";

export type { ProbeMode, ProbeProfile, ProbeRecord, ProbeRun, ProbeStep };

export const PROBE_KEYCHAIN_SERVICE = "card-probe";
export const PROBE_SEED_KEY = "probe-seed";
export const PROBE_DIR_NAME = "probe";
export const PROBE_RECORD_VERSION = 1;
export const MAX_PROBE_INVOICE_LENGTH = 2048;
export const PROBE_MODES: readonly ProbeMode[] = ["sync", "receive", "pay"];
export const PROBE_PROFILES: readonly ProbeProfile[] = ["light", "standard"];

export class ProbeUnavailableError extends Error {}

export function probeAppGroup(): string | null {
  return null;
}

export function probeAvailable(): boolean {
  return false;
}

export async function prepareProbe(_apiKey: string): Promise<void> {
  throw new ProbeUnavailableError("No notification service extension on the web");
}

export function prepareRuntimeProbe(_relays: readonly string[]): void {
  throw new ProbeUnavailableError("No notification service extension on the web");
}

export async function probePrepared(): Promise<boolean> {
  return false;
}

export function recordSentProbe(_run: Omit<ProbeRun, "record">): void {
  throw new ProbeUnavailableError("No notification service extension on the web");
}

export function forgetSentProbe(_run: string): void {}

export function isProbeRunId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)
  );
}

export function parseProbeRecord(_value: unknown): ProbeRecord | null {
  return null;
}

export function readProbeRuns(): ProbeRun[] {
  return [];
}

export function clearProbeRuns(): void {}

export async function forgetProbe(): Promise<void> {}
