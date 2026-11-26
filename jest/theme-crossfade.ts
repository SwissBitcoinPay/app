/**
 * Fake of the app's ThemeCrossfade module for Jest (modules/theme-crossfade, the apps): what it was
 * asked, in order (`crossfadeCalls`), "hold" when a still of the window would be laid over it,
 * "release <ms>" when it would fade out, with what the test read of the screen then
 * (`observeCrossfade`). A still is taken at once unless a test answers otherwise
 * (`answerHolds`: the screen read while it is taken, none taken, a failure, no answer).
 */

/** How the next holds answer; by default, a still taken. */
let answer: () => Promise<boolean> = async () => true;
let calls: string[] = [];
/** The fade each hold was given, that of a still never released. */
let holdFades: number[] = [];
/** What a test reads of the screen at each call (`observeCrossfade`), as `<call>: <what>`. */
let observer: (() => string) | null = null;

function record(call: string): void {
  calls.push(observer ? `${call}: ${observer()}` : call);
}

export const ThemeCrossfade = {
  hold: (fadeMs: number): Promise<boolean> => {
    record("hold");
    holdFades.push(fadeMs);
    return answer();
  },
  release: async (durationMs: number): Promise<void> => {
    record(`release ${durationMs}`);
  }
};

/** What the module was asked since the test started, in order. */
export function crossfadeCalls(): string[] {
  return [...calls];
}

/** The fade given with each hold since the test started (that of a still never released). */
export function crossfadeHoldFades(): number[] {
  return [...holdFades];
}

/** How the holds answer from now on, until the test ends. */
export function answerHolds(next: () => Promise<boolean>): void {
  answer = next;
}

/** Reads the screen at each call from now on, until the test ends (`crossfadeCalls`). */
export function observeCrossfade(read: () => string): void {
  observer = read;
}

export function resetThemeCrossfade(): void {
  calls = [];
  holdFades = [];
  answer = async () => true;
  observer = null;
}

/** Registers the module, as `requireOptionalNativeModule` finds a native one. */
export function installThemeCrossfade(): void {
  globalThis.expo.modules.ThemeCrossfade = ThemeCrossfade;
}
