/**
 * expo-system-ui (src/features/appearance/surroundings.ts): the root view's colour, in memory.
 * Set back to none before each test (jest.after-env.ts).
 */

let background: string | null = null;

export async function setBackgroundColorAsync(color: string | null): Promise<void> {
  background = color;
}

export async function getBackgroundColorAsync(): Promise<string | null> {
  return background;
}

/** The colour the app last gave the root view; null when none. */
export function rootBackground(): string | null {
  return background;
}

export function resetRootBackground(): void {
  background = null;
}
