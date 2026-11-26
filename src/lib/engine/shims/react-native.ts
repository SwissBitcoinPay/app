/*
 * What the engine's bundle takes for `react-native` (scripts/extension-engine.js): the iOS
 * extension's platform, and an app that is never in front (no AppState change comes). Only these:
 * src/__tests__/extension-engine.test.ts checks that the bundle's modules import nothing else.
 */

export const Platform = { OS: "ios" as const };

export const AppState = {
  currentState: "background" as const,
  addEventListener(_type: string, _listener: (state: string) => void): { remove(): void } {
    return { remove() {} };
  }
};
