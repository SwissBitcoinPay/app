import { requireOptionalNativeModule } from "expo";

import { LISTEN_HEARTBEAT_MAX_S, LISTEN_HEARTBEAT_MIN_S, isListenHash } from "./relay-client";
import { isCanonicalRelayHost } from "./relay-host";

/*
 * The card socket's native side (modules/card-socket, Android): a foreground service that keeps
 * this phone's connection to its cards' relays (`GET /v1/listen`), on which their taps wake it
 * ("Persistent connection", docs/card-relay.md). Each relay's listening
 * token is drawn and kept there (the Keystore's key): the app only gets its SHA-256, which it gives
 * its card channels (relay-sync.ts). Absent from iOS, the web, and a binary built before it: then
 * nothing here does anything, and the card socket is not offered (src/features/card/socket.ts).
 */

/** The notification Android shows while the service runs, in the app's language. */
export type CardSocketTexts = { channelName: string; title: string; text: string; stop: string };

/** A relay to listen to, and the heartbeat its `/v1/info` announced. */
export type CardSocketRelay = { host: string; heartbeatSeconds: number };

/** One relay's connection, as the service holds it (CardSocketStatus.kt). Times in ms. */
export type CardSocketConnection = {
  host: string;
  state: "connecting" | "open" | "waiting" | "stopped";
  stateSince: number;
  lastMessageAt: number | null;
  heartbeatSeconds: number;
  opened: number;
  failures: number;
  /** Why the last connection ended: a code (`http404`, `closed1012`, `network`, `stale`…). */
  lastFailure: string | null;
  nextAttemptAt: number | null;
  wakes: number;
  lastWakeAt: number | null;
};

export type CardSocketStatus = {
  enabled: boolean;
  /** The relays it is set to listen to, with their heartbeat. */
  relays: CardSocketRelay[];
  /** Whether its service runs in this process. */
  running: boolean;
  startedAt: number | null;
  /** Why the service last started: `app`, `boot`, `update`, `restart`, `watchdog`. */
  startReason: string | null;
  lastStartError: string | null;
  lastDispatchError: string | null;
  /** Whether the holder exempted the app from battery optimisation (Android's settings). */
  ignoringBatteryOptimizations: boolean;
  /**
   * Its notification as the phone shows it: "none" before the service first ran, "hidden" when its
   * holder turned it off in Android's settings (the service goes on), "shown" otherwise.
   */
  notification: "none" | "shown" | "hidden";
  connections: CardSocketConnection[];
};

type NativeCardSocket = {
  listenHash(host: string): Promise<string>;
  setEnabled(enabled: boolean): Promise<void>;
  configure(relays: CardSocketRelay[], texts: CardSocketTexts): Promise<void>;
  status(): unknown;
  forget(): Promise<void>;
  registerTaskAsync(taskName: string): Promise<void>;
  openBatterySettings(): Promise<void>;
  openNotificationSettings(): Promise<void>;
};

const native = requireOptionalNativeModule<NativeCardSocket>("CardSocket");

/** Whether this binary has the card socket (Android, built with modules/card-socket). */
export function cardSocketLinked(): boolean {
  return native !== null;
}

function linked(): NativeCardSocket {
  if (!native) throw new Error("The card socket is not in this build");
  return native;
}

/** The SHA-256 of this phone's listening token for `host` (drawn the first time), as relays take it. */
export async function cardSocketListenHash(host: string): Promise<string> {
  if (!isCanonicalRelayHost(host)) throw new Error("Relay host not canonical");
  const hash = await linked().listenHash(host);
  if (!isListenHash(hash)) throw new Error("Not a listening token's hash");
  return hash;
}

/**
 * Turns the card socket on (the default: its service starts once it has relays) or off (it stops),
 * as its holder chooses.
 */
export function enableCardSocket(enabled: boolean): Promise<void> {
  return linked().setEnabled(enabled);
}

/**
 * The relays to listen to, and the notification Android shows while the service runs: none stops
 * the service.
 */
export function configureCardSocket(
  relays: readonly CardSocketRelay[],
  texts: CardSocketTexts
): Promise<void> {
  for (const relay of relays) {
    if (!isCanonicalRelayHost(relay.host)) throw new Error("Relay host not canonical");
  }
  if (!Object.values(texts).every((text) => text.length > 0)) throw new Error("Texts required");
  return linked().configure(
    relays.map(({ host, heartbeatSeconds }) => ({ host, heartbeatSeconds })),
    { channelName: texts.channelName, title: texts.title, text: texts.text, stop: texts.stop }
  );
}

/** "Log out": the service stopped, its tokens and its Keystore key gone. */
export async function forgetCardSocket(): Promise<void> {
  if (native) await native.forget();
}

/** The app's task each wake packet of the socket runs (wake-task.android.ts). */
export function registerCardSocketTask(taskName: string): Promise<void> {
  return linked().registerTaskAsync(taskName);
}

/** Android's list of apps exempt from battery optimisation, to add this one. */
export function openCardSocketBatterySettings(): Promise<void> {
  return linked().openBatterySettings();
}

/** The settings of its notification's channel, where its holder may turn the notification off. */
export function openCardSocketNotificationSettings(): Promise<void> {
  return linked().openNotificationSettings();
}

const STATES = ["connecting", "open", "waiting", "stopped"];
const CODE = /^[a-zA-Z][a-zA-Z0-9]{0,39}$/;

function time(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function count(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function code(value: unknown): string | null {
  return typeof value === "string" && CODE.test(value) ? value : null;
}

function relayOf(value: unknown): CardSocketRelay | null {
  if (!value || typeof value !== "object") return null;
  const { host, heartbeatSeconds } = value as Record<string, unknown>;
  if (typeof host !== "string" || !isCanonicalRelayHost(host)) return null;
  if (
    typeof heartbeatSeconds !== "number" ||
    !Number.isSafeInteger(heartbeatSeconds) ||
    heartbeatSeconds < LISTEN_HEARTBEAT_MIN_S ||
    heartbeatSeconds > LISTEN_HEARTBEAT_MAX_S
  ) {
    return null;
  }
  return { host, heartbeatSeconds };
}

function connectionOf(value: unknown): CardSocketConnection | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (typeof v.host !== "string" || !isCanonicalRelayHost(v.host)) return null;
  if (typeof v.state !== "string" || !STATES.includes(v.state)) return null;
  return {
    host: v.host,
    state: v.state as CardSocketConnection["state"],
    stateSince: time(v.stateSince) ?? 0,
    lastMessageAt: time(v.lastMessageAt),
    heartbeatSeconds: count(v.heartbeatSeconds),
    opened: count(v.opened),
    failures: count(v.failures),
    lastFailure: code(v.lastFailure),
    nextAttemptAt: time(v.nextAttemptAt),
    wakes: count(v.wakes),
    lastWakeAt: time(v.lastWakeAt)
  };
}

/** What the card socket does now; null without it. */
export function cardSocketStatus(): CardSocketStatus | null {
  if (!native) return null;
  const value = native.status();
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const relays = Array.isArray(v.relays)
    ? v.relays.map(relayOf).filter((relay) => relay !== null)
    : [];
  const connections = Array.isArray(v.connections)
    ? v.connections.map(connectionOf).filter((connection) => connection !== null)
    : [];
  return {
    enabled: v.enabled === true,
    relays,
    running: v.running === true,
    startedAt: time(v.startedAt),
    startReason: code(v.startReason),
    lastStartError: code(v.lastStartError),
    lastDispatchError: code(v.lastDispatchError),
    ignoringBatteryOptimizations: v.ignoringBatteryOptimizations === true,
    notification:
      v.notification === "shown" || v.notification === "hidden" ? v.notification : "none",
    connections
  };
}
