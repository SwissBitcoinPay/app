import { getBreezApiKey, getBreezNetwork, toSdkNetwork } from "./config";
import type { BreezStatus } from "./types";

type BreezSdk = typeof import("@breeztech/breez-sdk-spark-react-native");

/**
 * Smoke check that the Breez SDK native library is linked and callable, for the network of this
 * build. `defaultConfig` is a synchronous Rust call that needs no API key and no network access;
 * it does not create or load any wallet. Reports whether an API key is set, never the key.
 *
 * The package is required lazily: its entry point installs the native module
 * and verifies the uniffi checksums at import time, so a missing or mismatched
 * native library throws there. A static import would crash the screen instead
 * of reporting the SDK as unavailable.
 */
export function getBreezStatus(): BreezStatus {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy on purpose, see above
    const sdk = require("@breeztech/breez-sdk-spark-react-native") as BreezSdk;
    const { defaultConfig, Network } = sdk;
    const config = defaultConfig(toSdkNetwork(Network, getBreezNetwork()));
    return {
      available: true,
      network: Network[config.network],
      apiKeyConfigured: getBreezApiKey() !== null
    };
  } catch (error) {
    return {
      available: false,
      reason: error instanceof Error ? error.message : String(error)
    };
  }
}
