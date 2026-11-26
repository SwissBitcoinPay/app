import { captureLegacyHandoff } from "./store.web";

/*
 * Imported by the app's entry (index.ts) before Expo Router's: the hand-off of a v2 web app
 * (handoff.ts) is taken, and its fragment removed from the URL, before the router reads it.
 */
captureLegacyHandoff();
