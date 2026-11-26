import type { TapCheckedWith } from "./tap";

/*
 * A card wake as the journal keeps it (wake-journal.ts): one shape, checked the same way wherever it
 * is read, and the same on the web (wake-journal.web.ts). Times, the payment's phases and codes:
 * never an amount, a merchant, an invoice, a card nor a key. Pure.
 */

export const MAX_WAKES = 50;
/**
 * A payment has fewer phases (payment.ts): past this, the newest step takes the last place, so that
 * how the wake ended is never lost.
 */
export const MAX_WAKE_STEPS = 32;

/** What the journal accepts as a tap's check: every TapCheckedWith, nothing else. */
const TAP_CHECKS: Record<TapCheckedWith, true> = { account: true, cardRoot: true, passkey: true };

export type WakeStep = {
  /** A phase of the payment (payment.ts), or the wake's own: `taken`, `notTaken`, `letGo`. */
  name: string;
  /** Since the wake's task started (ms). */
  atMs: number;
  /** A code: a failure's, an ask's cause, how a payment goes or went; null for none. */
  detail: string | null;
};

/** A wake of the card socket's task (wake-task.android.ts): its packet came on the socket. */
export type CardWakeEntry = {
  /** 16 hex digits, this journal's own. */
  id: string;
  /** When the task started (ms since the epoch, the phone's clock). */
  startedAt: number;
  /** When the card socket received the packet (the phone's clock). */
  receivedAt: number;
  /** How long the app's JavaScript had run when the task started (ms): a few, it started for it. */
  jsAgeMs: number;
  /** React Native's AppState then: "active", "background", "unknown"… */
  appState: string;
  /** Whether the account was open then (the seed in memory). */
  accountOpen: boolean;
  steps: WakeStep[];
  /** What checked the tap, once the task ended; null when nothing did. */
  tapCheck: TapCheckedWith | null;
  /** Since startedAt, when the task ended (ms); null while it runs, or since the system ended it. */
  endedAtMs: number | null;
};

/** A code as the journal keeps it: a word of an enum, never free text. */
export function isWakeCode(value: unknown): value is string {
  return typeof value === "string" && /^[a-zA-Z][a-zA-Z0-9]{0,39}$/.test(value);
}

function isMs(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isTapCheck(value: unknown): value is TapCheckedWith {
  // `=== true`: never a name every object inherits ("toString"…).
  return typeof value === "string" && (TAP_CHECKS as Record<string, unknown>)[value] === true;
}

export function parseWakeStep(value: unknown): WakeStep | null {
  if (value === null || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (!isWakeCode(v.name) || !isMs(v.atMs)) return null;
  if (!(v.detail === null || isWakeCode(v.detail))) return null;
  return { name: v.name, atMs: v.atMs, detail: v.detail };
}

/** A wake as the journal writes it (wake-journal.ts), checked whole; null when out of shape. */
export function parseCardWake(value: unknown): CardWakeEntry | null {
  if (value === null || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (typeof v.id !== "string" || !/^[0-9a-f]{16}$/.test(v.id)) return null;
  if (!isMs(v.startedAt) || !isMs(v.receivedAt)) return null;
  if (!isMs(v.jsAgeMs) || !isWakeCode(v.appState) || typeof v.accountOpen !== "boolean") {
    return null;
  }
  if (!Array.isArray(v.steps) || v.steps.length > MAX_WAKE_STEPS) return null;
  const steps = v.steps.map(parseWakeStep);
  if (steps.some((step) => step === null)) return null;
  if (!(v.tapCheck === null || isTapCheck(v.tapCheck))) return null;
  if (!(v.endedAtMs === null || isMs(v.endedAtMs))) return null;
  return {
    id: v.id,
    startedAt: v.startedAt,
    receivedAt: v.receivedAt,
    jsAgeMs: v.jsAgeMs,
    appState: v.appState,
    accountOpen: v.accountOpen,
    steps: steps as WakeStep[],
    tapCheck: v.tapCheck,
    endedAtMs: v.endedAtMs
  };
}
