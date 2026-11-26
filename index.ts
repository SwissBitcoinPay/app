// The app's entry (package.json `main`). On the web, first, the refusal to run in another site's
// frame (src/lib/frame-guard.web.ts). The card socket's task next: on Android, a card's tap
// that comes on the socket starts the app's JavaScript without any screen and runs it, which only
// works if the bundle defines it as it starts (src/features/card/wake-task.android.ts). Then, on
// the web, the hand-off of a v2 web app, taken from the URL before the router reads it
// (src/lib/legacy-v2/handoff-capture.web.ts). Expo Router's entry last, as its docs require of a
// custom entry.
import "./src/lib/frame-guard";
import "./src/features/card/wake-task";
import "./src/lib/legacy-v2/handoff-capture";
import "expo-router/entry";
