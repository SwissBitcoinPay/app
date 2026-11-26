/* Same API as push-marks.ts. Cards are paired and paid from the app on a phone only. */

export const CARD_PUSH_MARKS_KEY = "card-push-marks";

export type PushMarks = ReadonlyMap<string, string | null>;

export async function loadPushMarks(): Promise<PushMarks> {
  return new Map();
}

export async function markPushToken(_cardId: string, _token: string | null): Promise<void> {}

export async function forgetPushMark(_cardId: string): Promise<void> {}

export function subscribePushMarks(_listener: () => void): () => void {
  return () => undefined;
}
