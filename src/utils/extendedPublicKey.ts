import { getBitcoinNetwork } from "@config";

// Préfixes SLIP-0132 des clés publiques étendues, par type de script.
//   xpub/tpub → BIP44 (legacy)      ypub/upub → BIP49 (segwit)
//   zpub/vpub → BIP84 (native segwit)
// La 1re colonne s'applique à mainnet, la 2e à testnet/signet (signet
// partage les préfixes de testnet).
const EXTENDED_PUBKEY_PREFIXES = {
  mainnet: ["xpub", "ypub", "zpub"],
  testnet: ["tpub", "upub", "vpub"]
} as const;

// Préfixe natif segwit (BIP84) seul, par réseau — la forme exigée par
// `BIP84.fromZPub` (cf. keyStoreZpub / prepare-transaction).
const NATIVE_SEGWIT_PREFIX = {
  mainnet: "zpub",
  testnet: "vpub"
} as const;

// `true` si `value` est une clé publique étendue (n'importe quel type de
// script) valide pour le réseau Bitcoin courant.
export const isExtendedPublicKey = (value: string): boolean => {
  const prefixes = getBitcoinNetwork().isMainnet
    ? EXTENDED_PUBKEY_PREFIXES.mainnet
    : EXTENDED_PUBKEY_PREFIXES.testnet;
  return prefixes.some((prefix) => value.startsWith(prefix));
};

// `true` si `value` est une clé publique étendue native segwit (BIP84)
// pour le réseau courant — zpub en mainnet, vpub sinon.
export const isNativeSegwitExtendedPublicKey = (value: string): boolean =>
  value.startsWith(
    getBitcoinNetwork().isMainnet
      ? NATIVE_SEGWIT_PREFIX.mainnet
      : NATIVE_SEGWIT_PREFIX.testnet
  );
