import { Platform } from "react-native";

import { CARD_WAKE_MAX_MS } from "@/config/card";
import { getAppInfo } from "@/lib/app-info";
import type { CardSocketStatus } from "@/lib/card/card-socket";
import type { CardWakeEntry, WakeStep } from "@/lib/card/wake-journal";

/*
 * What "Wake journal" (WakeJournalScreen.tsx) says of the card wakes' journal
 * (src/lib/card/wake-journal.ts), and the report it copies for the team: results of the payments
 * made with the app closed (Android), handed over from the app. Times,
 * phases and codes, the card socket's state, the build and the phone's model: never an amount, a
 * merchant, an invoice, a card, a token nor a key.
 */

/**
 * Whether this build keeps the journal: the staging app only, the team's measuring tool. A
 * production phone keeps none, as it could neither show nor clear it.
 */
export function wakeJournalKept(): boolean {
  return getAppInfo().variant === "staging";
}

/** The journal's screen: where it is kept, on Android (the card socket's task's), as the iOS test. */
export function wakeJournalShown(): boolean {
  return Platform.OS === "android" && wakeJournalKept();
}

/** A task still without its end past this was ended by the system (or its process frozen). */
const RUN_LIMIT_MS = CARD_WAKE_MAX_MS + 60_000;
/** A silence this long between two steps: the process was likely frozen meanwhile. */
export const LONG_SILENCE_MS = 5_000;

const PAYMENT_ENDS = ["sent", "declined", "failed"];

export type WakeOutcome =
  /** Its task runs: `step`, the last step written. */
  | { kind: "running"; step: string }
  /** Its task never wrote its end: the system ended it, or froze its process. */
  | { kind: "stopped"; step: string }
  /** Not a payment of this phone's, already taken (the app shown), or too old. */
  | { kind: "notTaken" }
  /** The payment left and settled (`sent`, completed). */
  | { kind: "paid" }
  /** The payment left, its settlement not seen before the task ended: never "Paid". */
  | { kind: "pending" }
  | { kind: "declined" }
  | { kind: "failed"; reason: string }
  /** CARD_WAKE_MAX_MS passed, the payment still running: let go. */
  | { kind: "letGo"; step: string }
  /** Ended without any of these (the payment closed: replaced by a newer tap…). */
  | { kind: "ended"; step: string };

function lastStep(wake: CardWakeEntry): WakeStep | null {
  return wake.steps.at(-1) ?? null;
}

/** How the wake went, at `now`. */
export function wakeOutcome(wake: CardWakeEntry, now: number): WakeOutcome {
  const step = lastStep(wake)?.name ?? "start";
  if (wake.steps.some(({ name }) => name === "notTaken")) return { kind: "notTaken" };
  if (wake.endedAtMs === null) {
    return now - wake.startedAt > RUN_LIMIT_MS
      ? { kind: "stopped", step }
      : { kind: "running", step };
  }
  const end = [...wake.steps].reverse().find(({ name }) => PAYMENT_ENDS.includes(name));
  if (end?.name === "sent") {
    // Paid only once its settlement was seen. Followed while pending, then failed (payment.ts,
    // `follow`): as a send that failed.
    if (end.detail === "completed") return { kind: "paid" };
    if (end.detail === "failed") return { kind: "failed", reason: "sendFailed" };
    return { kind: "pending" };
  }
  if (end?.name === "declined") return { kind: "declined" };
  if (end?.name === "failed") return { kind: "failed", reason: end.detail ?? "?" };
  if (wake.steps.some(({ name }) => name === "letGo")) return { kind: "letGo", step };
  return { kind: "ended", step };
}

/**
 * From the card socket's receipt of the packet to the task's start (ms, the phone's clock): how
 * long Android took to run the app's JavaScript.
 */
export function deliveryMs(wake: CardWakeEntry): number {
  return wake.startedAt - wake.receivedAt;
}

/**
 * After these steps the payment waits for others, however long they take: the point of sale's
 * invoice, the holder (asked, then the passkey's prompt), a payment sent until it settles (followed
 * every FOLLOW_INTERVAL_MS). A long gap there is no sign of a frozen process.
 */
function waitsAfter({ name, detail }: WakeStep): boolean {
  return (
    name === "waiting" ||
    name === "ready" ||
    name === "confirming" ||
    (name === "sent" && detail === "pending")
  );
}

/**
 * The longest silence between the task's start, its steps and its end (ms), leaving out those after
 * a step where the payment waits for others (waitsAfter): a long one, and the process was likely
 * frozen meanwhile.
 */
export function longestSilenceMs(wake: CardWakeEntry): number {
  let longest = 0;
  let from = 0;
  let waits = false;
  for (const step of wake.steps) {
    if (!waits) longest = Math.max(longest, step.atMs - from);
    from = step.atMs;
    waits = waitsAfter(step);
  }
  if (wake.endedAtMs !== null && !waits) longest = Math.max(longest, wake.endedAtMs - from);
  return longest;
}

/** What Android tells of the phone: its version and its model, never an identifier of its own. */
function phone(): Record<string, string | number | null> {
  const constants = Platform.constants as unknown as Record<string, unknown>;
  const text = (value: unknown) => (typeof value === "string" ? value : null);
  return {
    os: Platform.OS,
    api: typeof Platform.Version === "number" ? Platform.Version : null,
    release: text(constants.Release),
    manufacturer: text(constants.Manufacturer),
    model: text(constants.Model)
  };
}

const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString());

/**
 * The card socket as the report tells it (socket.ts): its state, each relay's connection and what
 * it went through. Hosts are the relays', never a token.
 */
function socketReport(socket: CardSocketStatus | null) {
  if (!socket) return null;
  return {
    ...socket,
    startedAt: iso(socket.startedAt),
    connections: socket.connections.map((connection) => ({
      ...connection,
      stateSince: iso(connection.stateSince),
      lastMessageAt: iso(connection.lastMessageAt),
      nextAttemptAt: iso(connection.nextAttemptAt),
      lastWakeAt: iso(connection.lastWakeAt)
    }))
  };
}

/**
 * The report "Copy the journal" hands over, newest wake first. 3: the card socket's wakes only,
 * without the wake kind asked, the sealed targets, `via`, `sentAt` nor the push's
 * priorities of 2.
 */
export function cardWakesReport(
  wakes: readonly CardWakeEntry[],
  socket: CardSocketStatus | null,
  exportedAt: Date
): string {
  const app = getAppInfo();
  const now = exportedAt.getTime();
  return JSON.stringify(
    {
      report: "sattleme-android-card-wakes",
      version: 3,
      exportedAt: exportedAt.toISOString(),
      app: {
        variant: app.variant,
        version: app.version,
        buildNumber: app.buildNumber,
        commit: app.commit,
        updateId: app.updates?.updateId ?? null
      },
      phone: phone(),
      socket: socketReport(socket),
      wakes: wakes.map((wake) => ({
        ...wake,
        startedAt: new Date(wake.startedAt).toISOString(),
        receivedAt: new Date(wake.receivedAt).toISOString(),
        deliveryMs: deliveryMs(wake),
        longestSilenceMs: longestSilenceMs(wake),
        outcome: wakeOutcome(wake, now)
      }))
    },
    null,
    2
  );
}
