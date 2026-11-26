import { engineRuntimeHost } from "../host";

/*
 * What the engine's bundle takes for `expo-constants` (scripts/extension-engine.js): the build's
 * settings the extension was given (its Info.plist, from app.config.ts `extra`: the host's
 * `config`), as `Constants.expoConfig.extra`. Only this: src/__tests__/extension-engine.test.ts.
 */

function extra(): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(engineRuntimeHost().config());
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

const Constants = {
  get expoConfig(): { extra: Record<string, unknown> } {
    return { extra: extra() };
  }
};

export default Constants;
