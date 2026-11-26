/*
 * Kept apart from relay-client.ts, which imports the app's config: push-seal.ts uses it in the
 * iOS extension's engine too (src/lib/engine/), which has no app config.
 */

/**
 * An Expo push token (expo-notifications' `getExpoPushTokenAsync`): what the relay accepts
 * (sattleme/relay, `src/app.ts`), printable ASCII without brackets inside them.
 * Expo documents no narrower form: a stricter check could refuse a phone's real token.
 */
const PUSH_TOKEN = /^Expo(?:nent)?PushToken\[[\x21-\x5a\x5c\x5e-\x7e]{1,256}\]$/;

export function isExpoPushToken(token: unknown): token is string {
  return typeof token === "string" && PUSH_TOKEN.test(token);
}
