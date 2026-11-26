/**
 * Fake of jail-monkey for Jest (src/lib/device-integrity.ts): what it says of the phone
 * (`jailMonkeyState`: rooted, hooked, both false by default), or its failure (`refusal`), and how
 * many times it was asked.
 */

const state: { rooted: boolean; hooked: boolean; refusal: Error | null; reads: number } = {
  rooted: false,
  hooked: false,
  refusal: null,
  reads: 0
};

const JailMonkey = {
  isJailBroken: (): boolean => {
    state.reads += 1;
    if (state.refusal) throw state.refusal;
    return state.rooted;
  },
  hookDetected: (): boolean => {
    if (state.refusal) throw state.refusal;
    return state.hooked;
  }
};

export default JailMonkey;

/** What the fake answers, and how many times it was asked (its `isJailBroken`). */
export const jailMonkeyState = state;

export function resetJailMonkey(): void {
  state.rooted = false;
  state.hooked = false;
  state.refusal = null;
  state.reads = 0;
}
