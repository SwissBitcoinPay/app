import { setAudioModeAsync, useAudioPlayer } from "expo-audio";
import { useEffect } from "react";

import { logFailure } from "@/lib/log/log";

/**
 * A supermarket till's beep: a sine of 2700 Hz for 120 ms, 4 ms fades, 44.1 kHz mono, made for the
 * app (no third party's sound).
 */
const BEEP = require("../../../assets/sounds/scan-beep.wav");

/**
 * How the app's sounds play (expo-audio 57, as its native code reads). Never when the device is
 * silenced: `playsInSilentMode: false` is the `.ambient` category on iOS (the silent switch mutes
 * it), and on Android no sound unless the ringer is normal (not silent nor vibrate). Over the music
 * playing, never stopping it (`mixWithOthers`).
 */
let audioMode: Promise<void> | null = null;
function setAudioMode(): Promise<void> {
  audioMode ??= setAudioModeAsync({
    playsInSilentMode: false,
    interruptionMode: "mixWithOthers",
    shouldPlayInBackground: false,
    allowsRecording: false
  }).catch((error: unknown) => {
    logFailure("The audio mode could not be set", error);
    // Asked again with the next sound: until then none plays (it could ring while silenced).
    audioMode = null;
    throw error;
  });
  return audioMode;
}

/**
 * The beep of a barcode read (the apps and the web app). Loaded with the screen that
 * scans, so that it sounds at once; a sound that cannot play never stops the scan.
 */
export function useScanBeep(): () => void {
  const player = useAudioPlayer(BEEP);
  useEffect(() => {
    setAudioMode().catch(() => undefined);
  }, []);
  return () => {
    setAudioMode().then(
      async () => {
        try {
          // From its start: the player stays at its end after a beep. Awaited: `seekTo` runs on
          // another queue than `play` (expo-audio 57's native code), and a play issued before the
          // seek is done starts at the end, silent.
          await player.seekTo(0);
          player.play();
        } catch (error) {
          logFailure("The scan's beep could not play", error);
        }
      },
      () => undefined
    );
  };
}
