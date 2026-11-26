/**
 * The loader of the Breez SDK's web build (src/lib/breez/web-sdk.ts) in the store screenshots'
 * web build only (./metro.config.js swaps it in): the same API, giving the Jest fake of that build
 * (jest/breez-sdk-web.ts) in place of the WebAssembly SDK and the browser's passkey. Its passkey
 * gives the same PRF output for a salt every time: the account it opens is always the same
 * fictitious one, whose wallet holds what the capture puts in it. Nothing reaches Breez, Spark
 * nor a passkey.
 */
import "./jest-fn";

import * as fake from "../../jest/breez-sdk-web";
import { testNode } from "../../jest/lightning";
import type * as RealLoader from "../../src/lib/breez/web-sdk";
import type { BreezWeb } from "../../src/lib/breez/web-sdk";

/** The name under which the fake is set on `window` (FAKE_MARKER's value). */
export const FAKE_MARKER = "__sattleStoreScreenshotsFakeWallet";

/**
 * A wallet identity that is a public key, as a real wallet's (the fake's own, "02ab", is not: the
 * point of sale would keep no on-chain address for it, src/lib/terminal/model.ts). Always the
 * same: a fixed test key's (jest/lightning.ts).
 */
const identity = testNode(0x5a).nodeId;
fake.setAccountIdentity(identity);

/**
 * Set on `window` once this module runs: the capture checks it is there before taking any
 * screenshot, reads what the wallet registered (its Lightning address's description, which
 * breez.tips serves) and fills the wallet (its balance, its payments, to `identity`).
 */
(globalThis as Record<string, unknown>)[FAKE_MARKER] = { fake, identity };

const web: BreezWeb = {
  sdk: fake as unknown as BreezWeb["sdk"],
  passkeys: fake as unknown as BreezWeb["passkeys"]
};

export const loadBreezWeb: typeof RealLoader.loadBreezWeb = () => Promise.resolve(web);

export const isBreezWebLoaded: typeof RealLoader.isBreezWebLoaded = () => true;
