import { useSyncExternalStore } from "react";

/**
 * Same API as useUrlFragment.ts: the fragment ("#…") of the page's URL, "" when none, followed when
 * it changes. Another link pasted in the same tab only changes the fragment (`hashchange`): the page
 * does not reload.
 */
export function useUrlFragment(): string {
  return useSyncExternalStore(subscribe, getFragment, getFragment);
}

function getFragment(): string {
  return typeof window === "undefined" ? "" : window.location.hash;
}

function subscribe(listener: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener("hashchange", listener);
  return () => window.removeEventListener("hashchange", listener);
}
