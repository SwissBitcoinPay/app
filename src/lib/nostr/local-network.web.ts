import { LOCAL_NETWORK_PROMPT_TIMEOUT_MS } from "@/config/relays";

import {
  recordLocalNetworkPermission,
  type LocalNetworkPermission
} from "./local-network-permission";

/*
 * Local Network Access (Chromium 142 and later, its WebSockets from Chromium 147): a page of the
 * Internet, as the web app, reaches an address of the local network (a private address, Tailscale's
 * 100.64.0.0/10…) only once the user allowed it ("local-network" access, Chromium 145 and
 * later). The relays' sockets are opened from a sandboxed frame (socket.web.ts): Chromium refuses
 * them without asking (`ERR_BLOCKED_BY_LOCAL_NETWORK_ACCESS_CHECKS`), and once the page was allowed,
 * lets them through only when the frame is delegated the permission (`allow="local-network"`,
 * Permissions Policy). All checked with Chrome 154 and Brave 1.96 (Chromium 154): a
 * page made public with `--ip-address-space-overrides`, a WSS server on an address made local, the
 * browser's "Allow" clicked; a grant through the DevTools protocol (`Browser.grantPermissions`)
 * bypasses the delegation, and let the frame's sockets through without it. A request of the page
 * itself makes Chromium ask, and waits for the answer: hence `askLocalNetworkAccess` before
 * "Test the connection", and `prepareLocalNetworkAccess` before any connection to such a relay.
 */

/** Each relay asked for since the page loaded, with its request (the last one). */
const asked = new Map<string, Promise<LocalNetworkPermission | null>>();

/** The page's permission, null in a browser without it (Safari, Firefox, Chromium before 145). */
async function permissionStatus(): Promise<PermissionStatus | null> {
  try {
    return await navigator.permissions.query({ name: "local-network" as PermissionName });
  } catch {
    return null;
  }
}

async function queryPermission(): Promise<LocalNetworkPermission | null> {
  return (await permissionStatus())?.state ?? null;
}

/** The address the request goes to: the relay's own, over HTTPS. */
function httpsUrlOf(relay: string): string {
  return relay.replace(/^wss:\/\//, "https://");
}

/**
 * When the page may still ask (`prompt`), asks the browser for access to the local network by a
 * request of the page to each of `relays` (those it may count as local, mayBeOnLocalNetwork), and
 * waits for the user's answer (the permission's change, or the requests settled), `timeoutMs` at
 * most: a relay that does not answer the request keeps nobody waiting once the user answered. The
 * request carries nothing of the app: a GET in `no-cors` mode has no `Origin` header, and it goes
 * without referrer nor cookies (checked with Chrome 154: neither header reached the relay).
 * Allowed or blocked once, the browser does not ask again. Resolves with the permission then, null
 * in a browser without it. Never rejects.
 */
export function askLocalNetworkAccess(
  relays: readonly string[],
  timeoutMs: number
): Promise<LocalNetworkPermission | null> {
  const asking = ask(relays, timeoutMs);
  for (const relay of relays) asked.set(relay, asking);
  return asking;
}

async function ask(
  relays: readonly string[],
  timeoutMs: number
): Promise<LocalNetworkPermission | null> {
  if (relays.length === 0) return null;
  const status = await permissionStatus();
  if (status === null || status.state !== "prompt") return status?.state ?? null;
  const controller = new AbortController();
  const answered = new Promise<void>((resolve) => {
    status.onchange = () => {
      if (status.state !== "prompt") resolve();
    };
  });
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const requests = Promise.allSettled(
    relays.map((relay) =>
      fetch(httpsUrlOf(relay), {
        mode: "no-cors",
        credentials: "omit",
        referrerPolicy: "no-referrer",
        cache: "no-store",
        signal: controller.signal
      })
    )
  );
  await Promise.race([requests, answered]);
  clearTimeout(timer);
  status.onchange = null;
  // Their answers no longer matter.
  controller.abort();
  return queryPermission();
}

/**
 * Before a connection to `relay` (socket.web.ts), one the browser may count as local
 * (mayBeOnLocalNetwork): asks for access to the local network the first time since the page loaded
 * (as soon as the app is to connect to such a relay, wherever it does), and
 * waits for the answer, LOCAL_NETWORK_PROMPT_TIMEOUT_MS at most; the next connections to it wait
 * for that same request, never ask again ("Test the connection" does). The permission it leaves
 * is recorded for the relays editor's notes. Never rejects.
 */
export async function prepareLocalNetworkAccess(relay: string): Promise<void> {
  const asking =
    asked.get(relay) ?? askLocalNetworkAccess([relay], LOCAL_NETWORK_PROMPT_TIMEOUT_MS);
  const permission = await asking;
  // A later request ("Test the connection") records its own answer.
  if (asked.get(relay) === asking) recordLocalNetworkPermission(permission);
}

/** Tests only: forgets the requests made. */
export function resetLocalNetworkAccess(): void {
  asked.clear();
}
