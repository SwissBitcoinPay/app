import Constants from "expo-constants";

import type { Network } from "@breeztech/breez-sdk-spark-react-native";

import { PasskeyError, WalletError } from "./errors";

type SdkNetwork = typeof Network;

/**
 * Networks that work with the SDK's `connect()` and default config. Signet is not one of them:
 * in Breez SDK 0.28.4 it needs a custom Spark config (operators, SSP) and chain service.
 */
export const BREEZ_NETWORKS = ["mainnet", "regtest"] as const;
export type BreezNetwork = (typeof BREEZ_NETWORKS)[number];

/** Network of this build, set per variant in app.config.ts (`extra.breezNetwork`). */
export function getBreezNetwork(): BreezNetwork {
  const value: unknown = Constants.expoConfig?.extra?.breezNetwork;
  if (typeof value !== "string" || !(BREEZ_NETWORKS as readonly string[]).includes(value)) {
    throw new WalletError(
      "notConfigured",
      `Invalid extra.breezNetwork "${String(value)}" in the app config. Expected one of: ${BREEZ_NETWORKS.join(", ")}.`
    );
  }
  return value as BreezNetwork;
}

/** The SDK enum value; `Network` is passed in because the SDK module is required lazily. */
export function toSdkNetwork(Network: SdkNetwork, network: BreezNetwork) {
  return network === "mainnet" ? Network.Mainnet : Network.Regtest;
}

/**
 * Most the claim of an on-chain deposit takes from it, in sats: the ceiling the SDK compares the
 * provider's fee with before claiming on its own (`maxDepositClaimFee`: `MaxOnchainFee::Fixed`
 * without the proportional part, which `ceiling_sats` gives as is whatever the deposit's value,
 * spark-sdk 0.28.4). 300 sats: 99 sats, 1 sat/vB on the SDK's 99-vbyte claim transaction, left
 * many deposits waiting. In sats so that the fee told to the merchant ("Wallet") is the very
 * ceiling the SDK enforces, never one worked out from a size the SDK keeps to itself
 * (`CLAIM_TX_SIZE_VBYTES`). Never more, however long a deposit waits: the claim fee is taken from
 * the deposit, so the merchant pays it; above it, a deposit waits until the provider asks less.
 * What the SDK compares with it is the Spark provider's quote (deposit value less its credit), not
 * the network's fee rate: a nearly empty mempool does not guarantee a claim within it. It also
 * caps the provider's spread for crediting a deposit before its third confirmation: such an early
 * claim is made whenever it fits, whatever the number of confirmations,
 * from the first, when the Spark operators report the deposit (the SDK does not watch addresses in
 * the mempool, wallet.ts). Unset would disable claiming, not allow any fee.
 */
export const MAX_DEPOSIT_CLAIM_FEE_SATS = 300n;

/**
 * The SDK's own chain service on mainnet (`resolve_chain_service`), built again by the app to wrap
 * it (wallet.ts): mempool.space's REST API. Since spark-sdk 0.27.2 the SDK's own falls back to
 * blockstream.info when none is given; the app's has no fallback, as with 0.26.1. The SDK checks
 * what the app's serves as it does its own's (`ValidatingChainService`, 0.28.4).
 */
export const MAINNET_CHAIN_SERVICE_URL = "https://mempool.space/api";

/**
 * Breez API key, from the EAS environment of the build or a local
 * `.env.local` (see `.env.example`).
 * `EXPO_PUBLIC_*` variables are inlined into the JS bundle: the key is not a secret.
 */
export function getBreezApiKey(): string | null {
  // Dot notation on purpose: Expo only inlines statically referenced EXPO_PUBLIC_* variables.
  const key = process.env.EXPO_PUBLIC_BREEZ_API_KEY?.trim();
  return key ? key : null;
}

/**
 * Network and API key of this build, as the wallet needs them (wallet.ts, wallet.web.ts). Throws
 * `notConfigured` when the network is invalid or when mainnet has no API key: the Breez docs say
 * the SDK needs an API key to work; only their regtest test network is documented as working
 * without one.
 */
export function getWalletConfig(): { network: BreezNetwork; apiKey: string | null } {
  const network = getBreezNetwork();
  const apiKey = getBreezApiKey();
  if (network === "mainnet" && apiKey === null) {
    throw new WalletError(
      "notConfigured",
      "EXPO_PUBLIC_BREEZ_API_KEY is not set: a Breez API key is required on mainnet"
    );
  }
  return { network, apiKey };
}

/**
 * Relying Party name of the passkeys, shown by some password managers. Only new passkeys take it:
 * those made before the rename to sattle.me keep their former name. The seed derives from the
 * RP ID and WALLET_LABEL, never from this name.
 */
export const PASSKEY_RP_NAME = "sattle.me";

/**
 * Label of the wallet derived from a passkey (one wallet per passkey). The SDK's default label,
 * pinned here so that a change of that default cannot move users to another wallet.
 * DEFINITIVE, like the RP ID.
 */
export const WALLET_LABEL = "Default";

/**
 * Relying Party ID of the passkeys of this build: PASSKEY_RP_ID when the app config was made
 * (app.config.ts), null when it was not set.
 */
export function findPasskeyRpId(): string | null {
  const value: unknown = Constants.expoConfig?.extra?.passkeyRpId;
  return typeof value === "string" && value !== "" ? value : null;
}

/** Relying Party ID of the passkeys of this build. Throws `notConfigured` when it has none. */
export function getPasskeyRpId(): string {
  const rpId = findPasskeyRpId();
  if (rpId === null) {
    throw new PasskeyError(
      "notConfigured",
      "No extra.passkeyRpId in the app config: PASSKEY_RP_ID was not set when it was made"
    );
  }
  return rpId;
}

/**
 * `user.name` of a new passkey: what password managers show to tell passkeys apart. Unique per
 * creation, as Apple Passwords dedupes passkeys by (RP ID, user.name) according to the Breez
 * docs: with a fixed name, the passkey of a second account could replace the first one, and its
 * wallet would be lost. Local date and time of creation, in a language-neutral format, to the
 * second: two accounts created within the same minute must not share it.
 */
export function passkeyUserName(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  return `${PASSKEY_RP_NAME} ${day} ${time}`;
}
