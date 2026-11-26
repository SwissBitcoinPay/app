import * as SecureStore from "expo-secure-store";

import { logFailure } from "@/lib/log/log";

import { isExpoPushToken } from "./push-token";

/*
 * Which push token each card's channel holds, sealed with its hashes (push-seal.ts): the token this
 * phone last sealed for the card, or null for hashes left without one (Android, notifications
 * off). The relay cannot say it (it keeps the token sealed): when the phone's token changes (a new
 * token from Expo, notifications turned on or off), the next sync seals the new one into every hash
 * still waiting (`PATCH /v1/channel/hashes`, relay-sync.ts). A card's mark also tells that this
 * phone made its channel (sync.ts deletes the channels of cards no longer in service). On this
 * phone only, out of its backups; gone with "Log out" (wipeDevice). Same API on the web,
 * without cards: push-marks.web.ts.
 */

/** IRREVERSIBLE: the secure store's key. Never rename it. */
export const CARD_PUSH_MARKS_KEY = "card-push-marks";

const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY
};

/**
 * 3: the bare token per card (Android no longer woken by a push). 2 (`{to, wake}`, the
 * wake kind) and 1 are no longer read: no card's token known, each sealed again at its next sync.
 */
const FORMAT_VERSION = 3;

/** By card id: the token sealed in its channel's hashes, null for none. */
export type PushMarks = ReadonlyMap<string, string | null>;

/** A stored token (or null), undefined when out of shape. */
function tokenOf(value: unknown): string | null | undefined {
  if (value === null) return null;
  return isExpoPushToken(value) ? value : undefined;
}

/** The stored marks; `newer` when a newer app wrote them (never written over, staging rollbacks). */
function parse(text: string | null): { marks: Map<string, string | null>; newer: boolean } {
  const marks = new Map<string, string | null>();
  if (text === null) return { marks, newer: false };
  try {
    const value = JSON.parse(text) as { version?: unknown; cards?: unknown };
    if (typeof value.version === "number" && value.version > FORMAT_VERSION) {
      return { marks, newer: true };
    }
    if (value.version !== FORMAT_VERSION || !value.cards || typeof value.cards !== "object") {
      return { marks, newer: false };
    }
    for (const [cardId, stored] of Object.entries(value.cards as Record<string, unknown>)) {
      if (!/^[0-9a-f]{32}$/.test(cardId)) continue;
      const token = tokenOf(stored);
      if (token !== undefined) marks.set(cardId, token);
    }
  } catch {
    // Unreadable: no card's token is known, each is sealed again at its next sync.
  }
  return { marks, newer: false };
}

/**
 * What is known of the cards' sealed tokens. A card missing: unknown, sealed again. Unreadable
 * (or a newer app's): none known.
 */
export async function loadPushMarks(): Promise<PushMarks> {
  try {
    return parse(await SecureStore.getItemAsync(CARD_PUSH_MARKS_KEY, OPTIONS)).marks;
  } catch (error) {
    logFailure("Reading the cards' push marks failed", error);
    return new Map();
  }
}

/** One write at a time: two cards' syncs never lose each other's mark. */
let writing: Promise<unknown> = Promise.resolve();

const listeners = new Set<() => void>();

/**
 * Called after each change written (useCardWakes.ts: the app reads the pending packets while a
 * card's taps carry no token). A listener never throws: it runs in the writes' queue, which never
 * rejects.
 */
export function subscribePushMarks(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Changes the marks. Never rejects: a mark is a cache, one not written only makes the next sync
 * seal the card's token again (the secure store may refuse a large value, Expo SDK 57 docs).
 */
function update(change: (marks: Map<string, string | null>) => void): Promise<void> {
  const run = writing.then(async () => {
    try {
      const { marks, newer } = parse(await SecureStore.getItemAsync(CARD_PUSH_MARKS_KEY, OPTIONS));
      if (newer) return;
      change(marks);
      const cards = Object.fromEntries(marks);
      await SecureStore.setItemAsync(
        CARD_PUSH_MARKS_KEY,
        JSON.stringify({ version: FORMAT_VERSION, cards }),
        OPTIONS
      );
    } catch (error) {
      logFailure("Writing the cards' push marks failed", error);
      return;
    }
    for (const listener of listeners) listener();
  });
  writing = run;
  return run;
}

/** Notes the token sealed in every hash of the card's channel (null: none). */
export function markPushToken(cardId: string, token: string | null): Promise<void> {
  return update((marks) => marks.set(cardId, token));
}

/** Forgets a card's mark: its channel was deleted. */
export function forgetPushMark(cardId: string): Promise<void> {
  return update((marks) => marks.delete(cardId));
}
