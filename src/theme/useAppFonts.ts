import { useFonts } from "expo-font";

import { fontAssets } from "./fonts";

/**
 * Loads the design system fonts before the first render. iOS and Android load all of them: they
 * are files of the app, not downloads. The web loads fewer (`useAppFonts.web.ts`).
 */
export function useAppFonts(): [boolean, Error | null] {
  return useFonts(fontAssets);
}
