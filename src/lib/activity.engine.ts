/*
 * Same API as activity.ts, in the iOS extension's engine (src/lib/engine/): no one uses the app
 * there, and nothing locks it. Read no clock as the module loads: the engine's probe runs without
 * the runtime that gives one (EngineHost.swift).
 */

export function reportActivity(): void {}

export function holdActivity(): () => void {
  return () => undefined;
}

export function idleMs(): number {
  return 0;
}

export function subscribeActivity(_listener: () => void): () => void {
  return () => undefined;
}
