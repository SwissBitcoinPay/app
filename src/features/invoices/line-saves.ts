import { useSyncExternalStore } from "react";

import type { Article } from "@/lib/catalog/article";

/*
 * What "Save to my items" (SaveToCatalog) knows of the lines' saves while the wizard shows, beyond
 * the lines' step, which the wizard unmounts at each step: the save running (one at a time,
 * whichever step shows), the article of the same name to choose for, the article each line saved,
 * and each save that failed after publishing. One store per wizard (createLineSaves), gone with it.
 * Each change replaces the state: a render reads it from useLineSaves.
 */

/** What a line typed by hand would add to the catalogue: its name and price, read. */
export type LineArticle = { name: string; priceMinor: number };

/**
 * A save that failed after publishing (CatalogError's `attempt`: a minority of the relays may hold
 * the article), with the article it updated (null for a new one). The line's next save of the same
 * name publishes that article again, dated after it (addArticle's, updateArticle's `attempt`), so
 * that it never stays listed beside another.
 */
export type PendingSave = {
  attempt: Article;
  existing: Article | null;
  /** Every version of it this line published: none of them is another's. */
  versions: readonly Article[];
  /** The articles of the line's name it knew of (a duplicate's): none of them is another's. */
  known: readonly string[];
};

/** An article of the same name as a line's (SameNameSheet). */
export type SameName = { key: string; article: Article; typed: LineArticle };

export type LineSaves = {
  /** The key of the line whose save runs, null when none does. */
  running: string | null;
  conflict: SameName | null;
  pending: ReadonlyMap<string, PendingSave>;
  saved: ReadonlyMap<string, Article>;
};

const EMPTY: LineSaves = { running: null, conflict: null, pending: new Map(), saved: new Map() };

function without<T>(map: ReadonlyMap<string, T>, key: string): ReadonlyMap<string, T> {
  const next = new Map(map);
  next.delete(key);
  return next;
}

export type LineSavesStore = ReturnType<typeof createLineSaves>;

/** A wizard's store (InvoiceWizard keeps it while it shows). */
export function createLineSaves() {
  let state = EMPTY;
  const listeners = new Set<() => void>();
  const set = (next: Partial<LineSaves>) => {
    state = { ...state, ...next };
    for (const listener of listeners) listener();
  };
  return {
    /** The state now, for code running outside a render. */
    current: (): LineSaves => state,
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    /** Starts the save of `key`: false while another runs (nothing starts then). */
    start(key: string): boolean {
      if (state.running !== null) return false;
      set({ running: key });
      return true;
    },
    finish() {
      set({ running: null });
    },
    setConflict(conflict: SameName | null) {
      set({ conflict });
    },
    setPending(key: string, save: PendingSave) {
      set({ pending: new Map(state.pending).set(key, save) });
    },
    dropPending(key: string) {
      if (state.pending.has(key)) set({ pending: without(state.pending, key) });
    },
    /** The article `key` saved, its failed save forgotten. */
    setSaved(key: string, article: Article) {
      set({ pending: without(state.pending, key), saved: new Map(state.saved).set(key, article) });
    },
    /** A line removed: nothing of it is kept. */
    forget(key: string) {
      if (!state.pending.has(key) && !state.saved.has(key)) return;
      set({ pending: without(state.pending, key), saved: without(state.saved, key) });
    }
  };
}

/** The store's state, rendered again at each change. */
export function useLineSaves(store: LineSavesStore): LineSaves {
  return useSyncExternalStore(store.subscribe, store.current);
}

/** Whether a line's save runs, rendered again only when that changes (the wizard's frame). */
export function useLineSaving(store: LineSavesStore): boolean {
  return useSyncExternalStore(store.subscribe, () => store.current().running !== null);
}
