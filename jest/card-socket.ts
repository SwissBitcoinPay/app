/**
 * Fake of the app's CardSocket module for Jest (modules/card-socket, Android): its state in memory
 * (on, the default, or turned off; the relays and the notification's texts; each relay's listening
 * token), and its service's connections to the fake card relays (jest/card-relay.ts, `listenWith`):
 * connected when the socket is on and given the relay, again at each `setEnabled` and `configure`
 * (the real service tries again then too). A
 * packet a relay sends runs the app's task (CARD_SOCKET_TASK) through expo-task-manager's fake, as
 * CardSocketTaskConsumer.kt does: `socketRuns()` resolves once those runs end.
 */
import { sha256 } from "@noble/hashes/sha2.js";

import { relayAt, type ListenRefusal } from "./card-relay";

type Texts = { channelName: string; title: string; text: string; stop: string };
type Relay = { host: string; heartbeatSeconds: number };
type Connection = {
  host: string;
  state: "open" | "waiting";
  stateSince: number;
  lastMessageAt: number | null;
  heartbeatSeconds: number;
  opened: number;
  failures: number;
  lastFailure: string | null;
  nextAttemptAt: number | null;
  wakes: number;
  lastWakeAt: number | null;
};

/** IRREVERSIBLE name, as wake-task.android.ts defines it. */
const TASK = "card-socket-wake";

const B64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

function b64url(bytes: Uint8Array): string {
  let text = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    const chars = Math.ceil((Math.min(3, bytes.length - i) * 8) / 6);
    for (let k = 0; k < chars; k++) text += B64URL[(n >> (18 - 6 * k)) & 63];
  }
  return text;
}

const state = {
  /** On by default, as CardSocketStore.kt: false once its holder turned it off. */
  enabled: true,
  texts: null as Texts | null,
  relays: [] as Relay[],
  /** By host: the listening token (32 bytes). */
  tokens: new Map<string, Uint8Array>(),
  /** The task names the app registered. */
  tasks: [] as string[],
  connections: new Map<string, Connection>(),
  /** By host: the hash its relay listens with, to close it. */
  listening: new Map<string, string>(),
  ignoringBatteryOptimizations: false,
  batterySettingsOpened: 0,
  /**
   * Its notification: "none" until the service first runs (Android has no channel yet), then
   * "shown", or "hidden" once a test turns it off (the holder, in Android's settings).
   */
  notification: "none" as "none" | "shown" | "hidden",
  notificationSettingsOpened: 0,
  /**
   * While set, `setEnabled` rejects with it, as the native module does when it cannot write its
   * state (CardSocketStore.kt: a full disk, or a state a newer app wrote).
   */
  refusal: null as string | null,
  /** While set, `listenHash` rejects with it, as when the Keystore fails for now. */
  tokenRefusal: null as string | null,
  /** While set, `status` throws it, as the native module would without its React context. */
  statusRefusal: null as string | null,
  /**
   * The service does not run though it should (Android refused to start it from the background, or
   * ended it): `setEnabled` and `configure` start it again, as CardSocketService.start does.
   */
  serviceDown: false,
  /** How many times the app gave the relays (`configure`). */
  configures: 0,
  runs: [] as Promise<unknown>[]
};

function hashOf(host: string): string {
  let token = state.tokens.get(host);
  if (!token) {
    token = globalThis.crypto.getRandomValues(new Uint8Array(32));
    state.tokens.set(host, token);
  }
  return b64url(sha256(token));
}

/** The service as it stands: a connection to each relay while on, none while off. */
function reconnect(): void {
  // Its channel is made as the service first runs (CardSocketService.goForeground).
  if (running() && state.notification === "none") state.notification = "shown";
  for (const [host, hash] of state.listening) {
    if (!state.enabled || !state.relays.some((relay) => relay.host === host)) {
      relayAt(host)?.stopListening(hash);
      state.listening.delete(host);
      state.connections.delete(host);
    }
  }
  if (!state.enabled) return;
  for (const relay of state.relays) {
    const hash = hashOf(relay.host);
    const known = state.connections.get(relay.host);
    const connection: Connection = known ?? {
      host: relay.host,
      state: "waiting",
      stateSince: Date.now(),
      lastMessageAt: null,
      heartbeatSeconds: relay.heartbeatSeconds,
      opened: 0,
      failures: 0,
      lastFailure: null,
      nextAttemptAt: null,
      wakes: 0,
      lastWakeAt: null
    };
    state.connections.set(relay.host, connection);
    if (connection.state === "open") continue;
    const outcome: "open" | ListenRefusal =
      relayAt(relay.host)?.listenWith(hash, (packet) => {
        const receivedAt = Date.now();
        connection.wakes += 1;
        connection.lastWakeAt = receivedAt;
        connection.lastMessageAt = receivedAt;
        // eslint-disable-next-line @typescript-eslint/no-require-imports -- the app's own mock
        const taskManager = require("expo-task-manager") as typeof import("./expo-task-manager");
        state.runs.push(
          taskManager.runTask(TASK, {
            packet: JSON.stringify(packet),
            receivedAt,
            relay: relay.host
          })
        );
      }) ?? "unreachable";
    if (outcome === "open") {
      state.listening.set(relay.host, hash);
      Object.assign(connection, {
        state: "open",
        stateSince: Date.now(),
        lastMessageAt: Date.now(),
        opened: connection.opened + 1,
        nextAttemptAt: null
      });
    } else {
      Object.assign(connection, {
        state: "waiting",
        stateSince: Date.now(),
        failures: connection.failures + 1,
        lastFailure: outcome === "unknown" ? "http404" : "network"
      });
    }
  }
}

/** Whether its service runs: on, with relays and texts, and not ended (SocketConfig.runnable). */
function running(): boolean {
  return state.enabled && state.relays.length > 0 && state.texts !== null && !state.serviceDown;
}

/** What the native `status` gives (CardSocketModule.kt). */
function statusNow() {
  return {
    enabled: state.enabled,
    relays: state.relays.map((relay) => ({ ...relay })),
    running: running(),
    startedAt: running() ? 1_792_000_000_000 : null,
    startReason: running() ? "app" : null,
    lastStartError: null,
    lastDispatchError: null,
    ignoringBatteryOptimizations: state.ignoringBatteryOptimizations,
    notification: state.notification,
    connections: [...state.connections.values()].map((connection) => ({ ...connection }))
  };
}

export const CardSocket = {
  listenHash: async (host: string): Promise<string> => {
    if (state.tokenRefusal !== null) throw new Error(state.tokenRefusal);
    return hashOf(host);
  },
  setEnabled: async (enabled: boolean): Promise<void> => {
    if (state.refusal !== null) throw new Error(state.refusal);
    state.enabled = enabled;
    state.serviceDown = false;
    reconnect();
  },
  configure: async (relays: Relay[], texts: Texts): Promise<void> => {
    if (!Object.values(texts).every((text) => text.length > 0)) throw new Error("Texts required");
    state.texts = { ...texts };
    state.relays = relays.map(({ host, heartbeatSeconds }) => ({ host, heartbeatSeconds }));
    state.configures += 1;
    state.serviceDown = false;
    reconnect();
  },
  status: () => {
    if (state.statusRefusal !== null) throw new Error(state.statusRefusal);
    return statusNow();
  },
  forget: async (): Promise<void> => {
    // Its state gone: back to the default (on), without relays nor texts.
    state.enabled = true;
    state.relays = [];
    reconnect();
    state.tokens.clear();
    state.texts = null;
  },
  registerTaskAsync: async (taskName: string): Promise<void> => {
    if (!state.tasks.includes(taskName)) state.tasks.push(taskName);
  },
  openBatterySettings: async (): Promise<void> => {
    state.batterySettingsOpened += 1;
  },
  openNotificationSettings: async (): Promise<void> => {
    state.notificationSettingsOpened += 1;
  }
};

/**
 * What the fake holds, for the tests to read (and the battery setting and a refusal, to change).
 * Change the fake through it, never with `jest.spyOn(CardSocket, …)`: jest-expo hands the app a
 * copy of the module (`requireOptionalNativeModule`), which a spy on this object does not reach.
 */
export const cardSocketState = state;

/** Resolves once every task run a packet started has ended. */
export async function socketRuns(): Promise<void> {
  while (state.runs.length > 0) await Promise.all(state.runs.splice(0));
}

export function resetCardSocket(): void {
  state.enabled = true;
  state.texts = null;
  state.relays = [];
  state.tokens.clear();
  state.connections.clear();
  state.listening.clear();
  state.ignoringBatteryOptimizations = false;
  state.batterySettingsOpened = 0;
  state.notification = "none";
  state.notificationSettingsOpened = 0;
  state.refusal = null;
  state.tokenRefusal = null;
  state.statusRefusal = null;
  state.serviceDown = false;
  state.configures = 0;
  state.runs = [];
}

/** Registers the module, as `requireOptionalNativeModule` finds a native one. */
export function installCardSocket(): void {
  globalThis.expo.modules.CardSocket = CardSocket;
}
