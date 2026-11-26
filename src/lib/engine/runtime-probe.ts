import { File, Paths } from "expo-file-system";

import { DEFAULT_CARD_RELAY_HOST } from "@/config/card";
import { cardAppGroup } from "@/lib/card/app-group";
import { getCardItem } from "@/lib/card/card-keychain";
import { CARD_DEVICE_KEY } from "@/lib/card/device-key";
import { loadCardPayments } from "@/lib/card/payment-log";
import { fetchRelayInfo } from "@/lib/card/relay-client";
import { queryRelays } from "@/lib/nostr/pool";
import { RECORD_KIND } from "@/lib/nostr/record";
import { normalizeRelayUrl } from "@/lib/relays/list";

import type { EngineRuntimeHost } from "./host";

/*
 * The extension's probe of the engine's runtime (iOS extension test, "runtime" mode): each thing a
 * card payment needs of its runtime, done once on the app's own modules, its time and outcome
 * written down. A timer; the card relay's `/v1/info` over HTTPS; a Nostr read (a WebSocket) on the
 * relays the app gave the test (probe/config.json, `relays`); the device key the app shares
 * (present or not: never its value); the app's log of card payments (how many entries); a URL read
 * as the app reads it. No payment, no write of the app's.
 */

export type RuntimeStep = { name: string; ok: boolean; ms: number; detail: string };

/** The test's directory in the app group's container, as probe-store.ts writes it. */
const PROBE_CONFIG = "probe/config.json";

const STEP_TIMEOUT_MS = 5_000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** The relays the app gave the test: wss URLs only, a few. */
function probeRelays(): string[] {
  const group = cardAppGroup();
  const container = group ? Paths.appleSharedContainers[group] : undefined;
  if (!container) throw new Error("No app group's container");
  const value = JSON.parse(new File(container, PROBE_CONFIG).textSync()) as { relays?: unknown };
  if (!Array.isArray(value.relays)) throw new Error("No relays in the test's config");
  const relays = value.relays
    .map((relay) => (typeof relay === "string" ? normalizeRelayUrl(relay) : null))
    .filter((relay): relay is string => relay !== null && relay.startsWith("wss://"));
  if (relays.length === 0 || relays.length > 10) throw new Error("No relays to read");
  return relays;
}

const STEPS: { name: string; run: () => Promise<string> }[] = [
  {
    name: "timer",
    run: async () => {
      const start = performance.now();
      await delay(50);
      const elapsed = performance.now() - start;
      if (elapsed < 45) throw new Error(`A 50 ms timer came after ${elapsed.toFixed(0)} ms`);
      return `${elapsed.toFixed(0)} ms`;
    }
  },
  {
    name: "fetch",
    run: async () => {
      const info = await fetchRelayInfo(DEFAULT_CARD_RELAY_HOST, { timeoutMs: STEP_TIMEOUT_MS });
      return `relay ${info.version}`;
    }
  },
  {
    name: "nostr",
    run: async () => {
      const relays = probeRelays();
      // An author nobody writes as: every relay answers with none, its end of stored events.
      const answers = await queryRelays(
        { kinds: [RECORD_KIND], authors: ["0".repeat(64)], limit: 1 },
        { relays, channel: "anonymous", timeoutMs: STEP_TIMEOUT_MS }
      );
      return `${answers.size} of ${relays.length} relays`;
    }
  },
  {
    name: "keychain",
    run: async () => ((await getCardItem(CARD_DEVICE_KEY)) === null ? "absent" : "present")
  },
  {
    name: "files",
    run: async () => `${(await loadCardPayments()).length} payments`
  },
  {
    name: "url",
    run: async () => {
      const href = new URL("https://Example.COM:443/a/../b?c=d#e").href;
      if (href !== "https://example.com/b?c=d#e") throw new Error(`Read as ${href}`);
      return href;
    }
  }
];

/** Runs each step in turn, whatever the one before gave. */
export async function runEngineRuntimeProbe(
  host: EngineRuntimeHost
): Promise<{ steps: RuntimeStep[] }> {
  const steps: RuntimeStep[] = [];
  for (const step of STEPS) {
    const start = performance.now();
    let ok = true;
    let detail: string;
    try {
      detail = await step.run();
    } catch (error) {
      ok = false;
      detail = error instanceof Error ? error.message.slice(0, 200) : "failed";
    }
    host.step(step.name);
    steps.push({ name: step.name, ok, ms: Math.round(performance.now() - start), detail });
  }
  return { steps };
}
