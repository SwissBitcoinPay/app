import { AppState } from "react-native";

/**
 * Runs `start` (a subscription kept open on the relays, watchRelays of src/lib/nostr/pool.ts) now,
 * and again each time the app comes back to the foreground from the background: its connections
 * may have been cut there, and a watch waits up to WATCH_RETRY_MAX_MS to connect a relay again.
 * Not after "inactive" alone (iOS: the control center, a system prompt), where the connections
 * held. Until the returned function is called, which stops the watch.
 */
export function watchWhileActive(start: () => () => void): () => void {
  let stop = start();
  let wentBackground = false;
  const subscription = AppState.addEventListener("change", (state) => {
    if (state === "background") wentBackground = true;
    if (state !== "active" || !wentBackground) return;
    wentBackground = false;
    stop();
    stop = start();
  });
  return () => {
    subscription.remove();
    stop();
  };
}
