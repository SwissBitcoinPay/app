import { useEffect, useState } from "react";
import { networks, type Network as BitcoinJsNetwork } from "bitcoinjs-lib";
import { api, type AppConfig } from "@types";
import {
  buildCurrencyOptions,
  filterEnabledCurrencies,
  type CurrencyOption
} from "./currencyOptions";

let _config: AppConfig | undefined;
let _currencies: CurrencyOption[] | undefined;
let _enabledCurrencies: CurrencyOption[] | undefined;
let _ready: Promise<void> | undefined;

// Singleton bootstrap : fetch la config et les métadonnées de devises une
// seule fois via les wrappers typés. Pré-requis : `initApi()` doit avoir
// résolu (le proxy `api` throw `notReady` sinon). Idempotent.
export const initRuntimeConfig = (): Promise<void> => {
  if (_config && _currencies && _enabledCurrencies) return Promise.resolve();
  if (_ready) return _ready;
  _ready = (async () => {
    const [config, currenciesResponse] = await Promise.all([
      api.config.get(),
      api.currencies.list()
    ]);
    const currencies = buildCurrencyOptions(currenciesResponse.currencies);

    _config = config;
    _currencies = currencies;
    _enabledCurrencies = filterEnabledCurrencies(currencies);
  })();
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

// Hook React opt-in. Déclenche `initRuntimeConfig()` une fois `isApiReady`
// passé à true. Retourne `true` quand la config est résolue.
export const useRuntimeConfigReady = (isApiReady: boolean): boolean => {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!isApiReady) return;
    let cancelled = false;
    initRuntimeConfig().then(
      () => {
        if (!cancelled) setReady(true);
      },
      (err) => {
        console.error("initRuntimeConfig failed", err);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [isApiReady]);
  return ready;
};
