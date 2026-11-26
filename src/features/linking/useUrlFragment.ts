import { useLocalSearchParams } from "expo-router";

/**
 * The fragment ("#…") of the link that opened this screen in the app (a payment link, an
 * invitation: universal links / App Links), "" when none. Expo Router hands it over as the "#"
 * parameter of the route, for the link that launched the app as for one received later. Not
 * expo-linking's `getLinkingURL()`: on iOS, it keeps the first link of the session (its native
 * module only records a universal link while none is recorded, as its source shows). Web:
 * useUrlFragment.web.ts, same API.
 */
export function useUrlFragment(): string {
  const fragment = useLocalSearchParams<{ "#"?: string }>()["#"];
  return fragment ? `#${fragment}` : "";
}
