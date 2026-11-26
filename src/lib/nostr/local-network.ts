import type { LocalNetworkPermission } from "./local-network-permission";

/*
 * The browser's permission to reach the local network: none in the apps, whose connections it
 * does not concern. Web: local-network.web.ts, same API.
 */

/**
 * Asks for access to the local network before `relays` are tested: nothing to ask in the apps.
 * Resolves with the permission then, null where there is none.
 */
export async function askLocalNetworkAccess(
  _relays: readonly string[],
  _timeoutMs: number
): Promise<LocalNetworkPermission | null> {
  return null;
}

/** Before a connection to `relay`: nothing to ask in the apps. */
export async function prepareLocalNetworkAccess(_relay: string): Promise<void> {}

/** Tests only: forgets the requests made. */
export function resetLocalNetworkAccess(): void {}
