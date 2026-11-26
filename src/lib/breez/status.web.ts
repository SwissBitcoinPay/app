import { getBreezApiKey, getBreezNetwork } from "./config";
import type { BreezStatus } from "./types";
import { isBreezWebLoaded } from "./web-sdk";

/**
 * Same API as status.ts, for the web build of the SDK (WebAssembly), which is loaded on first use
 * (passkey.web.ts): until then it is reported as not loaded yet. Reports whether an API key is
 * set, never the key.
 */
export function getBreezStatus(): BreezStatus {
  if (!isBreezWebLoaded()) {
    return { available: false, reason: "Web build (WebAssembly) not loaded yet" };
  }
  try {
    const network = getBreezNetwork();
    return {
      available: true,
      network: network === "mainnet" ? "Mainnet" : "Regtest",
      apiKeyConfigured: getBreezApiKey() !== null
    };
  } catch (error) {
    return { available: false, reason: error instanceof Error ? error.message : String(error) };
  }
}
