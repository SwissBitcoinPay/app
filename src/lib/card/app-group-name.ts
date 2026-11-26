import Constants from "expo-constants";

/** The app group the build shares with the extension (app.config.ts, `extra.cardAppGroup`). */
export function cardAppGroup(): string | null {
  const group: unknown = (Constants.expoConfig?.extra as { cardAppGroup?: unknown } | undefined)
    ?.cardAppGroup;
  return typeof group === "string" && /^group\.[A-Za-z0-9.-]+$/.test(group) ? group : null;
}
