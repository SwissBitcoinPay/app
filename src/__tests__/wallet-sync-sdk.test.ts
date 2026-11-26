/**
 * @jest-environment node
 */
import { concatBytes, utf8ToBytes } from "@noble/hashes/utils.js";

import { bytesToBase64 } from "@/lib/base64";
import { MAX_DEPOSIT_CLAIM_FEE_SATS } from "@/lib/breez/config";

/*
 * What ends the wait of `getInfo({ ensureSynced: true })` (Wallet.getBalance), checked with the
 * Breez SDK itself: its WebAssembly build for Node (@breeztech/breez-sdk-spark 0.28.4, the Rust
 * core of the native build too), connected as the app connects it (mainnet, the app's config),
 * offline: every request fails as with no network, nothing is ever read from it. The wait ends all
 * the same, once a Full sync ends: each part of a sync only logs its failure (sync.rs), and any
 * Full sync that ends well sends the first-sync signal (runtime/client.rs). `Synced`, which the SDK
 * first tells once a sync's wallet part succeeded (events.rs), does not come then; it does come,
 * with nothing read, when another instance on the same storage synced less than a sync interval
 * before ("Synced recently, skipping", sync.rs): two tabs of the web app. The SDK's timers are
 * Jest's, run by hand.
 */

type Sdk = typeof import("@breeztech/breez-sdk-spark/nodejs");
type SdkWallet = import("@breeztech/breez-sdk-spark/nodejs").BreezSdk;

declare const __dirname: string;
const { join } = jest.requireActual<{ join(...segments: string[]): string }>("path");
const { mkdtempSync, rmSync } = jest.requireActual<{
  mkdtempSync(prefix: string): string;
  rmSync(path: string, options: { recursive: boolean; force: boolean }): void;
}>("fs");
const { tmpdir } = jest.requireActual<{ tmpdir(): string }>("os");
const { setImmediate } = jest.requireActual<{ setImmediate(callback: () => void): unknown }>(
  "timers"
);

/** The SDK's Node build (package.json of @breeztech/breez-sdk-spark 0.28.4, `nodejs`). */
const NODE_BUILD = join(
  __dirname,
  "..",
  "..",
  "node_modules",
  "@breeztech",
  "breez-sdk-spark",
  "nodejs"
);

/**
 * The SDK's bindings, with the storage its Node entry sets up for `withDefaultStorage` (SQLite, the
 * package's better-sqlite3), without the PostgreSQL and MySQL ones it also tries (index.js).
 */
function loadSdk(): Sdk {
  const globals = globalThis as Record<string, unknown>;
  globals.createDefaultStorage = jest.requireActual<{ createDefaultStorage: unknown }>(
    join(NODE_BUILD, "storage", "index.cjs")
  ).createDefaultStorage;
  globals.createDefaultTreeStore = jest.requireActual<{ createDefaultTreeStore: unknown }>(
    join(NODE_BUILD, "tree-store", "index.cjs")
  ).createDefaultTreeStore;
  return jest.requireActual(join(NODE_BUILD, "breez_sdk_spark_wasm.js"));
}

/** DER: `tag`, the length of `parts`, then `parts`. */
function der(tag: number, ...parts: Uint8Array[]): Uint8Array {
  const content = concatBytes(...parts);
  const n = content.length;
  const length = n < 0x80 ? [n] : n < 0x100 ? [0x81, n] : [0x82, n >> 8, n & 0xff];
  return concatBytes(Uint8Array.of(tag, ...length), content);
}

/**
 * A certificate in the shape of a Breez API key: on mainnet, the SDK only parses it and checks
 * that its issuer's name starts with "Breez" (validate_breez_api_key, sdk/helpers.rs). Made
 * here, signed by no one, its key zeros: no Breez server would take it, and none is reached.
 */
function testApiKey(): string {
  const name = der(
    0x30,
    der(
      0x31,
      der(
        0x30,
        der(0x06, Uint8Array.of(0x55, 0x04, 0x03)), // commonName
        der(0x0c, utf8ToBytes("Breez test issuer, not an API key"))
      )
    )
  );
  // ecdsa-with-SHA256, then a P-256 public key.
  const algorithm = der(0x30, der(0x06, Uint8Array.of(0x2a, 0x86, 0x48, 0xce, 0x3d, 4, 3, 2)));
  const publicKey = der(
    0x30,
    der(
      0x30,
      der(0x06, Uint8Array.of(0x2a, 0x86, 0x48, 0xce, 0x3d, 2, 1)),
      der(0x06, Uint8Array.of(0x2a, 0x86, 0x48, 0xce, 0x3d, 3, 1, 7))
    ),
    der(0x03, Uint8Array.of(0, 4), new Uint8Array(64))
  );
  const certificate = der(
    0x30,
    der(
      0x30,
      der(0xa0, der(0x02, Uint8Array.of(2))), // v3
      der(0x02, Uint8Array.of(1)),
      algorithm,
      name,
      der(0x30, der(0x17, utf8ToBytes("260101000000Z")), der(0x17, utf8ToBytes("360101000000Z"))),
      name,
      publicKey
    ),
    algorithm,
    der(0x03, Uint8Array.of(0), der(0x30, der(0x02, Uint8Array.of(1)), der(0x02, Uint8Array.of(1))))
  );
  return bytesToBase64(certificate);
}

/** The SDK's log lines (`initLogging`): its own account of each sync. */
const logs: string[] = [];
let sdk: Sdk;
let storageDir: string;
let requests: number;
const appFetch = globalThis.fetch;

beforeAll(async () => {
  sdk = loadSdk();
  await sdk.initLogging({ log: ({ line }) => void logs.push(line) });
});

beforeEach(() => {
  logs.splice(0);
  // No network: every request fails as fetch fails offline.
  requests = 0;
  globalThis.fetch = jest.fn(async () => {
    requests += 1;
    throw new TypeError("fetch failed");
  });
  storageDir = mkdtempSync(join(tmpdir(), "wallet-sync-sdk-"));
  // The SDK's timers (its sync loop, its retries) are Jest's, run by `settle` alone: cleared after
  // each test, none outlives it (some it leaves after `disconnect`, 0.28.4). Promises, their
  // callbacks and the storage's files go as usual.
  jest.useFakeTimers({ doNotFake: ["nextTick", "queueMicrotask", "setImmediate"] });
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
  globalThis.fetch = appFetch;
  rmSync(storageDir, { recursive: true, force: true });
});

/**
 * Runs the SDK's timers until `promise` settles, at most `limitMs` of their time, letting what is
 * not a timer (a file of its storage) go between their steps.
 */
async function settle<T>(promise: Promise<T>, limitMs = 5_000): Promise<T> {
  let done = false;
  const watched = promise.finally(() => {
    done = true;
  });
  for (let elapsed = 0; !done && elapsed < limitMs; elapsed += 100) {
    await new Promise((resolve) => setImmediate(() => resolve(undefined)));
    if (!done) await jest.advanceTimersByTimeAsync(100);
  }
  if (!done) throw new Error(`Still waiting after ${limitMs} ms of the SDK's time`);
  return watched;
}

/**
 * A wallet connected as the app connects it (wallet.web.ts createConfig), on the test's storage.
 * Its timers do not run meanwhile: none is needed, and its sync loop starts at the test's time.
 */
async function connect(): Promise<{ wallet: SdkWallet; events: string[] }> {
  const config = {
    ...sdk.defaultConfig("mainnet"),
    apiKey: testApiKey(),
    maxDepositClaimFee: {
      onchain: { type: "fixed" as const, amount: Number(MAX_DEPOSIT_CLAIM_FEE_SATS) },
      proportionalPpm: undefined
    },
    watchtowerFeeLadderEnabled: true
  };
  // The app's: the SDK's default.
  expect(config.syncIntervalSecs).toBe(60);
  const builder = await sdk.SdkBuilder.new(config, {
    type: "mnemonic",
    // The BIP-39 test mnemonic: never a real wallet's, and offline here.
    mnemonic:
      "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about"
  }).withDefaultStorage(storageDir);
  const wallet = await builder.build();
  const events: string[] = [];
  await wallet.addEventListener({ onEvent: (event) => void events.push(event.type) });
  return { wallet, events };
}

/** `getInfo({ ensureSynced: true })`, and whether it has ended. */
function waitFirstSync(wallet: SdkWallet) {
  const wait = { ended: false, info: wallet.getInfo({ ensureSynced: true }) };
  wait.info = wait.info.finally(() => {
    wait.ended = true;
  });
  return wait;
}

/** The SDK's account of its Full syncs whose every part failed. */
function syncsThatReadNothing(): string[] {
  return logs.filter((line) =>
    /Wallet sync completed in .*InternalSyncedEvent \{ wallet: false, wallet_state: false, deposits: false, lnurl_metadata: false,/.test(
      line
    )
  );
}

describe("the end of the Breez SDK's first sync (0.28.4), offline", () => {
  it("comes with a syncWallet whose every part failed, without Synced", async () => {
    const { wallet, events } = await connect();
    try {
      const wait = waitFirstSync(wallet);
      // Its own first sync waits for the operators' stream offline (60 s, below).
      await jest.advanceTimersByTimeAsync(1_000);
      expect(wait.ended).toBe(false);

      await settle(wallet.syncWallet({}));
      await expect(settle(wait.info)).resolves.toMatchObject({ balanceSats: 0 });
      expect(requests).toBeGreaterThan(0);
      expect(syncsThatReadNothing()).toHaveLength(1);
      expect(events).not.toContain("synced");
    } finally {
      await settle(wallet.disconnect());
    }
  });

  it("comes by itself once its sync interval has passed, every part of the sync failed", async () => {
    const { wallet, events } = await connect();
    try {
      const wait = waitFirstSync(wallet);
      await jest.advanceTimersByTimeAsync(55_000);
      expect(wait.ended).toBe(false);

      // Its loop sleeps until 60 s have passed since its last sync (runtime/client.rs, 0.28.4;
      // 0.27.2 looked every 10 s).
      await expect(settle(wait.info, 10_000)).resolves.toMatchObject({ balanceSats: 0 });
      expect(syncsThatReadNothing()).toHaveLength(1);
      expect(logs.some((line) => line.includes("Synced recently, skipping"))).toBe(false);
      expect(events).not.toContain("synced");
    } finally {
      await settle(wallet.disconnect());
    }
  });

  it("comes after a sync of its own when an earlier connection of its storage synced", async () => {
    const earlier = await connect();
    await settle(earlier.wallet.syncWallet({}));
    await settle(earlier.wallet.disconnect());
    logs.splice(0);

    // A full interval passes before its own sync: the earlier one's time is older by then.
    const { wallet, events } = await connect();
    try {
      await expect(settle(waitFirstSync(wallet).info, 70_000)).resolves.toMatchObject({
        balanceSats: 0
      });
      expect(syncsThatReadNothing()).toHaveLength(1);
      expect(logs.some((line) => line.includes("Synced recently, skipping"))).toBe(false);
      expect(events).not.toContain("synced");
    } finally {
      await settle(wallet.disconnect());
    }
  });

  it("comes with Synced and no sync when another instance of its storage synced just before", async () => {
    const other = await connect();
    const { wallet, events } = await connect();
    try {
      const wait = waitFirstSync(wallet);
      await jest.advanceTimersByTimeAsync(55_000);
      // The other tab syncs, offline: it only writes the time of its sync.
      await settle(other.wallet.syncWallet({}));
      expect(wait.ended).toBe(false);
      logs.splice(0);

      await expect(settle(wait.info, 10_000)).resolves.toMatchObject({ balanceSats: 0 });
      expect(logs.some((line) => line.includes("Synced recently, skipping"))).toBe(true);
      expect(events).toContain("synced");
      // No sync of its own ran, and every request of the other's failed: nothing was read.
      expect(syncsThatReadNothing()).toHaveLength(0);
    } finally {
      await settle(wallet.disconnect());
      await settle(other.wallet.disconnect());
    }
  });
});
