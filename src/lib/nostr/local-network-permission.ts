/**
 * The browser's permission to reach the local network ("local-network", Local Network Access,
 * Chromium) as the last request for it left it (local-network.web.ts, "Test the connection"):
 * null before any, in the apps and in browsers without it. The relays editor's notes follow it.
 */
export type LocalNetworkPermission = "granted" | "prompt" | "denied";

let permission: LocalNetworkPermission | null = null;
const listeners = new Set<() => void>();

export function localNetworkPermission(): LocalNetworkPermission | null {
  return permission;
}

export function subscribeLocalNetworkPermission(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function recordLocalNetworkPermission(next: LocalNetworkPermission | null): void {
  if (next === permission) return;
  permission = next;
  for (const listener of listeners) listener();
}
