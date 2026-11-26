/**
 * Fake of expo-screen-capture for Jest (a native module): the keys that block screen capture now
 * (`blockedBy`), and the blur of iOS's app switcher protection, null when it is off
 * (`appSwitcherBlur`). `failNextPrevention()` makes the next prevention reject, as iOS does without
 * a key window.
 */
const blocking = new Set<string>();
let blur: number | null = null;
let failing = false;

export async function preventScreenCaptureAsync(key = "default"): Promise<void> {
  if (failing) {
    failing = false;
    throw new Error("No key window to protect");
  }
  blocking.add(key);
}

export async function allowScreenCaptureAsync(key = "default"): Promise<void> {
  blocking.delete(key);
}

export async function enableAppSwitcherProtectionAsync(blurIntensity = 0.5): Promise<void> {
  blur = blurIntensity;
}

export async function disableAppSwitcherProtectionAsync(): Promise<void> {
  blur = null;
}

/** The keys that block screen capture now. */
export function blockedBy(): readonly string[] {
  return [...blocking];
}

export function appSwitcherBlur(): number | null {
  return blur;
}

export function failNextPrevention(): void {
  failing = true;
}

export function resetScreenCapture(): void {
  blocking.clear();
  blur = null;
  failing = false;
}
