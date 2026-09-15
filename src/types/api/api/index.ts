// Barrel pour les shapes des réponses des endpoints JS custom (non
// couverts par les Record APIs / JSON Schemas TrailBase). Importés
// côté backend dans les handlers + côté frontend via la copie effectuée
// par scripts/gen-frontend-types.sh.
//
// NB : les wrappers runtime `createCustomApis` (custom_endpoints.ts)
// sont front-end-only — ils importent depuis le package `trailbase`
// (SDK browser) qui n'est pas installé côté backend WASM. Re-exportés
// dans le frontend via api_types/custom_endpoints.ts copié par
// gen-frontend-types.sh.

export type { BankAccountDetails, GetAccountBankResponse } from "./v1_accounts_bank.js";
