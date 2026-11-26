/**
 * Fake of expo-audio for Jest (a native module): a player is a plain object whose plays tests read
 * (`plays`), each with where it started from and the audio mode then set. A player stays at its
 * end after a play, as the native ones do: played again without `seekTo(0)`, it starts there. A
 * seek lands after its call returns, as the native one (another queue than `play`): a play issued
 * before it lands starts where the player was, and plays to its end after the seek.
 */
import { useState } from "react";

type AudioMode = {
  playsInSilentMode?: boolean;
  interruptionMode?: "mixWithOthers" | "duckOthers" | "doNotMix";
  shouldPlayInBackground?: boolean;
  allowsRecording?: boolean;
};

export type Play = { source: unknown; from: number; mode: AudioMode | null };

let played: Play[] = [];
let players = 0;
let broken = false;
/**
 * The device's audio session: not reset between tests, as the module that sets it once per
 * process (src/features/catalog/scan-beep.ts) is not either.
 */
let mode: AudioMode | null = null;

/** The sounds played since the test started, in order. */
export function plays(): readonly Play[] {
  return played;
}

/** The players made since the test started (a sound loaded each). */
export function playerCount(): number {
  return players;
}

/** The next plays throw, as a player whose audio session cannot start. */
export function breakAudio(): void {
  broken = true;
}

export function resetAudio(): void {
  played = [];
  players = 0;
  broken = false;
}

export async function setAudioModeAsync(next: AudioMode): Promise<void> {
  mode = { ...next };
}

/** The end of every sound, in seconds: where a player stays after playing. */
const END = 1;

export function createAudioPlayer(source: unknown) {
  players += 1;
  let position = 0;
  /** The seek in flight, if any. */
  let seeking: Promise<void> | null = null;
  return {
    seekTo(seconds: number): Promise<void> {
      const seek = Promise.resolve().then(() => {
        position = seconds;
        if (seeking === seek) seeking = null;
      });
      seeking = seek;
      return seek;
    },
    play() {
      if (broken) throw new Error("The audio session could not start");
      played.push({ source, from: position, mode });
      void (seeking ?? Promise.resolve()).then(() => {
        position = END;
      });
    },
    pause() {},
    remove() {},
    release() {}
  };
}

export function useAudioPlayer(source: unknown) {
  const [player] = useState(() => createAudioPlayer(source));
  return player;
}
