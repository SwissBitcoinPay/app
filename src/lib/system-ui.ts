import { Linking, Platform, Share, type ShareContent } from "react-native";

/*
 * What the app opens over itself, then comes back from: the passkey's prompt, the system's
 * biometric one, a photo picked or taken, a permission asked, the share sheet, a mail, the system's
 * settings. On Android they put the app in the background (another activity), which the app's lock
 * (src/features/app-lock/) would take for its holder leaving it: such a trip is not one (the
 * biometrics are asked when the app is opened or brought back by its holder). On
 * iOS they show within the app or make it inactive only, never in the background: there, leaving
 * while one shows is leaving. Only the system's settings leave the app on both (expectSystemUi).
 *
 * A card awaited over NFC is not a trip: Android pauses the app an instant to hand the card over
 * (a new intent, the NFC library's foreground dispatch), which may come at any moment of a long
 * wait (pairing, the point of sale's reading). Only that pause is not a departure (withCardPause).
 * A trip this module was not told of only asks the biometrics once more.
 */

/** What the app leaving the foreground is: a trip, the pause of a card read, or a departure (null). */
export type SystemUiDeparture = "trip" | "pause" | null;

/** How many of them are open now (withSystemUi). */
let open = 0;
/** How many card reads wait now (withCardPause). */
let reading = 0;
/** One opened without a promise of its end (expectSystemUi): until then (ms). */
let expectedUntil = 0;

/** How long the app may take to leave the foreground for what expectSystemUi announced (ms). */
export const SYSTEM_UI_EXPECTED_MS = 10_000;
/**
 * How long the app may be away for a card handed over (ms): an instant, with room for a busy
 * phone; longer, the holder left while a card was awaited.
 */
export const CARD_PAUSE_MS = 5_000;

/**
 * Runs `show`, which opens something of the system's over the app, and waits for its end: a trip
 * meanwhile on Android (see above).
 */
export async function withSystemUi<T>(show: () => Promise<T>): Promise<T> {
  open++;
  try {
    return await show();
  } finally {
    open--;
  }
}

/** Runs `read`, which waits for a card over NFC: its pause on Android is not a departure (see above). */
export async function withCardPause<T>(read: () => Promise<T>): Promise<T> {
  reading++;
  try {
    return await read();
  } finally {
    reading--;
  }
}

/** Something of the system's opens over the app now, its end not told (the system's settings). */
export function expectSystemUi(): void {
  expectedUntil = Date.now() + SYSTEM_UI_EXPECTED_MS;
}

/**
 * What the app leaving the foreground now is: a trip to something of the system's it opened
 * itself, the pause of a card read, or the holder's departure (null). Told once for what
 * expectSystemUi announced: a later departure is the holder's.
 */
export function leavingForSystemUi(): SystemUiDeparture {
  const expected = Date.now() < expectedUntil;
  expectedUntil = 0;
  const android = Platform.OS === "android";
  if (expected || (android && open > 0)) return "trip";
  if (android && reading > 0) return "pause";
  return null;
}

/** The system's settings of the app, which its holder comes back from (an expected trip). */
export function openSystemSettings(): Promise<void> {
  expectSystemUi();
  return Linking.openSettings();
}

/**
 * The system's share sheet (React Native's Share), which its holder comes back from. Android
 * resolves as soon as the sheet is asked for, before the app leaves the foreground: the trip is
 * announced (expectSystemUi); iOS and browsers resolve once it is closed. Called synchronously,
 * within the tap on the web: a browser opens its sheet only right after a gesture.
 */
export function shareWithSystem(content: ShareContent): ReturnType<typeof Share.share> {
  if (Platform.OS === "android") expectSystemUi();
  return withSystemUi(() => Share.share(content));
}

/** Forgets what is open (tests). */
export function resetSystemUi(): void {
  open = 0;
  reading = 0;
  expectedUntil = 0;
}
