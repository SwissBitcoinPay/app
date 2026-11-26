// First: what JavaScriptCore lacks, before any other module of the bundle runs.
import "./polyfills";
import "./install";

import { engineHost, engineRuntimeHost } from "./host";
import { runEngineProbe } from "./probe";
import { runEngineRuntimeProbe } from "./runtime-probe";
import { runEngineCardWake, type EngineWakeOutcome } from "./card-wake";
import { runEngineWalletProbe } from "./wallet-probe";

/*
 * The entry of the engine's probe bundle (scripts/extension-engine.js): the extension calls
 * `sattlemeEngineProbe()` (plugins/card-notification-extension/ios/EngineHost.swift), which
 * returns a JSON text or throws; `sattlemeEngineRuntimeProbe(done)` and
 * `sattlemeEngineWalletProbe(invoice, run, maxSats, done)` (EngineRuntime.swift), which call
 * `done` once with a JSON text, or throw at once without a runtime host or out-of-shape arguments.
 */
const scope = globalThis as {
  sattlemeEngineProbe?: () => string;
  sattlemeEngineRuntimeProbe?: (done: (result: string) => void) => void;
  sattlemeEngineCardWake?: (
    packet: unknown,
    receivedAt: unknown,
    language: unknown,
    budgetMs: unknown,
    done: (result: string) => void
  ) => void;
  sattlemeEngineWalletProbe?: (
    invoice: unknown,
    run: unknown,
    maxSats: unknown,
    done: (result: string) => void
  ) => void;
};

scope.sattlemeEngineProbe = () => JSON.stringify(runEngineProbe(engineHost()));

scope.sattlemeEngineRuntimeProbe = (done) => {
  const host = engineRuntimeHost();
  if (typeof done !== "function") throw new TypeError("A callback for the result");
  void runEngineRuntimeProbe(host).then(
    (result) => done(JSON.stringify(result)),
    (error: unknown) => done(JSON.stringify({ error: String(error).slice(0, 200) }))
  );
};

scope.sattlemeEngineWalletProbe = (invoice, run, maxSats, done) => {
  const host = engineRuntimeHost();
  if (typeof done !== "function") throw new TypeError("A callback for the result");
  if (
    typeof invoice !== "string" ||
    typeof run !== "string" ||
    typeof maxSats !== "number" ||
    !Number.isSafeInteger(maxSats) ||
    maxSats <= 0
  ) {
    throw new TypeError("An invoice, a run and a bound");
  }
  void runEngineWalletProbe(host, invoice, run, maxSats).then(
    (result) => done(JSON.stringify(result)),
    (error: unknown) => done(JSON.stringify({ error: String(error).slice(0, 200) }))
  );
};

/** An outcome as JSON, its sats as decimal text (exact). */
function outcomeJson(outcome: EngineWakeOutcome): string {
  return JSON.stringify(outcome, (_, value: unknown) =>
    typeof value === "bigint" ? value.toString() : value
  );
}

/**
 * A card's tap (card-wake.ts): `packet` the relay's `cr` as received (a JSON text), `receivedAt`
 * the push's time (ms), `language` the holder's (BCP 47), `budgetMs` what is left of the
 * extension's time. `done` once, with the outcome's JSON.
 */
scope.sattlemeEngineCardWake = (packet, receivedAt, language, budgetMs, done) => {
  engineRuntimeHost();
  if (typeof done !== "function") throw new TypeError("A callback for the result");
  if (
    typeof packet !== "string" ||
    typeof receivedAt !== "number" ||
    typeof language !== "string" ||
    typeof budgetMs !== "number" ||
    !Number.isFinite(budgetMs)
  ) {
    throw new TypeError("A packet, its time, a language and a budget");
  }
  let raw: unknown;
  try {
    raw = JSON.parse(packet) as unknown;
  } catch {
    raw = null;
  }
  void runEngineCardWake(raw, receivedAt, { language, budgetMs }).then(
    (outcome) => done(outcomeJson(outcome)),
    (error: unknown) => done(JSON.stringify({ error: String(error).slice(0, 200) }))
  );
};
