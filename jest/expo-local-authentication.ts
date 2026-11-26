/**
 * Fake of expo-local-authentication for Jest (a native module): the device's lock (`setDeviceLock`:
 * biometrics by default, none for a device without any), and the answer of each prompt
 * (`answerNext`: given by default, or one held until the test lets it go, `holdNextPrompt`). The
 * prompts asked are counted (`prompts`).
 */
export enum SecurityLevel {
  NONE = 0,
  SECRET = 1,
  BIOMETRIC_WEAK = 2,
  BIOMETRIC_STRONG = 3
}

type Result = { success: true } | { success: false; error: string };

let level = SecurityLevel.BIOMETRIC_STRONG;
const answers: Result[] = [];
let held: ((result: Result) => void) | null = null;
let holdNext = false;

export const getEnrolledLevelAsync = jest.fn(async () => level);

export const authenticateAsync = jest.fn(
  async (options?: { promptMessage?: string; cancelLabel?: string }): Promise<Result> => {
    void options;
    if (holdNext) {
      holdNext = false;
      return new Promise<Result>((resolve) => {
        held = resolve;
      });
    }
    if (level === SecurityLevel.NONE) return { success: false, error: "passcode_not_set" };
    return answers.shift() ?? { success: true };
  }
);

/** The device's lock from now on. */
export function setDeviceLock(next: SecurityLevel): void {
  level = next;
}

/** The answer of the next prompt: `user_cancel`, `system_cancel`, … (else given). */
export function answerNext(error: string | null): void {
  answers.push(error === null ? { success: true } : { success: false, error });
}

/** The next prompt waits; the function returned answers it (an error, or given). */
export function holdNextPrompt(): (error?: string) => void {
  holdNext = true;
  return (error) => {
    const resolve = held;
    held = null;
    resolve?.(error === undefined ? { success: true } : { success: false, error });
  };
}

/** How many prompts were asked since the test began. */
export function prompts(): number {
  return authenticateAsync.mock.calls.length;
}

export function resetLocalAuthentication(): void {
  level = SecurityLevel.BIOMETRIC_STRONG;
  answers.length = 0;
  held = null;
  holdNext = false;
  authenticateAsync.mockClear();
  getEnrolledLevelAsync.mockClear();
}
