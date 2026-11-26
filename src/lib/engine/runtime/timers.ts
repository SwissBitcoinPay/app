import type { EngineRuntimeHost } from "../host";

/*
 * setTimeout and clearTimeout, a monotonic performance.now and a console, over the host's timers,
 * clock and journal (EngineRuntimeHost): JavaScriptCore has none of them. A callback that throws
 * is written in the journal: it never stops the host's queue.
 */

export type EngineTimers = {
  setTimeout(handler: (...args: unknown[]) => void, ms?: number, ...args: unknown[]): number;
  clearTimeout(id: unknown): void;
};

export function engineTimers(host: EngineRuntimeHost): EngineTimers {
  return {
    setTimeout(handler, ms = 0, ...args) {
      if (typeof handler !== "function") throw new TypeError("setTimeout takes a function here");
      const delay = typeof ms === "number" && Number.isFinite(ms) && ms > 0 ? ms : 0;
      return host.setTimer(delay, () => {
        try {
          handler(...args);
        } catch (error) {
          host.log("error", `A timer's callback threw: ${String(error)}`);
        }
      });
    },
    clearTimeout(id) {
      if (typeof id === "number") host.clearTimer(id);
    }
  };
}

export function enginePerformance(host: EngineRuntimeHost): { now(): number } {
  return { now: () => host.monotonic() };
}

type Level = "info" | "warn" | "error";

export function engineConsole(
  host: EngineRuntimeHost
): Record<string, (...args: unknown[]) => void> {
  const write =
    (level: Level) =>
    (...args: unknown[]) =>
      host.log(level, args.map((arg) => String(arg)).join(" "));
  return {
    log: write("info"),
    info: write("info"),
    debug: write("info"),
    warn: write("warn"),
    error: write("error")
  };
}
