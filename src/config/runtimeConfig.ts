import { useEffect, useState } from "react";
import { networks, type Network as BitcoinJsNetwork } from "bitcoinjs-lib";
import { api, type AppConfig } from "@types";
import { sleep } from "@utils/sleep";
import {
  buildCurrencyOptions,
  filterEnabledCurrencies,
  type CurrencyOption
} from "./currencyOptions";

let _config: AppConfig | undefined;
let _currencies: CurrencyOption[] | undefined;
let _enabledCurrencies: CurrencyOption[] | undefined;
let _ready: Promise<void> | undefined;

// RN requests have no timeout by default (unlimited on Android): without a
// bound, a request that never responds would block the bootstrap.
const BOOTSTRAP_TIMEOUT_MS = 10000;

const withTimeout = async <T>(promise: Promise<T>, ms: number): Promise<T> => {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error(`timed out after ${ms}ms`)),
          ms
        );
      })
    ]);
  } finally {
    clearTimeout(timeout);
  }
};

// Singleton bootstrap : fetch la config et les métadonnées de devises une
// seule fois via les wrappers typés. Pré-requis : `initApi()` doit avoir
// résolu (le proxy `api` throw `notReady` sinon). Idempotent.
export const initRuntimeConfig = (
  timeoutMs = BOOTSTRAP_TIMEOUT_MS
): Promise<void> => {
  if (_config && _currencies && _enabledCurrencies) return Promise.resolve();
  if (_ready) return _ready;
  _ready = (async () => {
    const [config, currenciesResponse] = await withTimeout(
      Promise.all([api.config.get(), api.currencies.list()]),
      timeoutMs
    );
    const currencies = buildCurrencyOptions(currenciesResponse.currencies);

    _config = config;
    _currencies = currencies;
    _enabledCurrencies = filterEnabledCurrencies(currencies);
  })().catch((err: unknown) => {
    // Drop the rejected promise so the next call fetches again (otherwise the
    // failure stays cached until the app restarts).
    _ready = undefined;
    throw err;
  });
  return _ready;
};

const get = (): AppConfig => {
  if (!_config) {
    throw new Error(
      "runtime config accessed before initRuntimeConfig() resolved"
    );
  }
  return _config;
};

const getCurrencies = (): CurrencyOption[] => {
  if (!_currencies) {
    throw new Error(
      "runtime currencies accessed before initRuntimeConfig() resolved"
    );
  }
  return _currencies;
};

export const getRuntimeCurrencies = (): CurrencyOption[] => getCurrencies();

export const getEnabledCurrencies = (): CurrencyOption[] => {
  if (!_enabledCurrencies) {
    throw new Error(
      "enabled currencies accessed before initRuntimeConfig() resolved"
    );
  }
  return _enabledCurrencies;
};

export const getCurrencyDecimals = (currency: string): number | undefined => {
  const code = currency === "sats" ? "sat" : currency;
  return getCurrencies().find(({ value }) => value === code)?.decimals;
};

type BitcoinNetworkInfo = {
  /** Valeur canonique du backend ; comparable au `Network` de
   * `bitcoin-address-validation`, utilisable comme segment d'URL
   * (mempool.space, etc.). */
  name: AppConfig["bitcoin_network"];
  isMainnet: boolean;
  /** Flag BIP84 / BIP44 : signet partage le `coin_type=1` de testnet. */
  isTestnet: boolean;
  /** `bitcoinjs-lib` Network. La lib n'expose pas de constante "signet" —
   * mais signet partage toutes les valeurs crypto-pertinentes de testnet
   * (préfixe bech32 `tb`, magic bytes BIP32, formats d'adresse). On
   * mappe donc signet → `networks.testnet` pour les PSBT, signing,
   * dérivation d'addresses, etc. */
  lib: BitcoinJsNetwork;
};

// Helper unique : encapsule la résolution name/lib/isTestnet en un seul
// appel, et l'équivalence signet↔testnet côté lib pour que les callers
// n'aient pas à raisonner dessus.
export const getBitcoinNetwork = (): BitcoinNetworkInfo => {
  const name = get().bitcoin_network;
  const isMainnet = name === "mainnet";
  return {
    name,
    isMainnet,
    isTestnet: !isMainnet,
    lib: isMainnet ? networks.bitcoin : networks.testnet
  };
};

// URL de base mempool.space pour le réseau Bitcoin courant. mainnet →
// `https://mempool.space` ; testnet/signet → `https://mempool.space/<name>`
// (le `name` canonique du backend sert directement de segment d'URL).
export const getMempoolBaseUrl = (): string => {
  const { isMainnet, name } = getBitcoinNetwork();
  return `https://mempool.space${isMainnet ? "" : `/${name}`}`;
};

export const getEnvironment = () => get().environment;
export const getCdnEndpoint = () => get().cdn_endpoint;
export const getBackendVersion = () => get().version;
export const getMinClientVersion = () => get().min_client_version;

const RETRY_DELAYS_MS = [1000, 2000, 5000, 10000];
// The timeout grows with each attempt (10 s, 20 s, then 30 s) so a slow
// connection eventually gets through instead of always failing at the same
// threshold.
const MAX_TIMEOUT_FACTOR = 3;

// Opt-in React hook. Triggers `initRuntimeConfig()` once `isApiReady` turns
// true, and retries indefinitely (capped backoff) on failure (offline, API
// unreachable) instead of blocking the app forever. `hasFailed` turns true on
// the first failure.
export const useRuntimeConfigReady = (
  isApiReady: boolean
): { isReady: boolean; hasFailed: boolean } => {
  const [isReady, setIsReady] = useState(false);
  const [hasFailed, setHasFailed] = useState(false);
  useEffect(() => {
    if (!isApiReady) return;
    let cancelled = false;
    void (async () => {
      for (let retryCount = 0; !cancelled; retryCount++) {
        try {
          await initRuntimeConfig(
            BOOTSTRAP_TIMEOUT_MS * Math.min(retryCount + 1, MAX_TIMEOUT_FACTOR)
          );
          if (!cancelled) setIsReady(true);
          return;
        } catch (err) {
          console.error("initRuntimeConfig failed", err);
          if (cancelled) return;
          setHasFailed(true);
          await sleep(
            RETRY_DELAYS_MS[Math.min(retryCount, RETRY_DELAYS_MS.length - 1)]
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isApiReady]);
  return { isReady, hasFailed };
};
