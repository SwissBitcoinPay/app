export const DEFAULT_SCRIPT_TYPE = "p2wpkh" as const;

// 1 BTC = 10^8 sats. On stocke et manipule toutes les valeurs en sats
// (entiers) côté front pour éviter les imprécisions float JS sur les BTC.
// Le backend rend déjà des sats — cette constante ne sert qu'aux bords
// utilisateur :
//   - affichage        → `sats / SATS_PER_BTC`
//   - saisie en BTC    → `Math.round(btc * SATS_PER_BTC)`
export const SATS_PER_BTC = 100_000_000;
