// Réponse de `GET /account` — endpoint dual-auth (api-key OU JWT).
//
// En mode `api-key`, le backend renvoie un sous-ensemble minimal (10
// champs métier + aliases camelCase). En mode JWT, le payload complet
// inclut les champs sensibles (mail, bank, kyc détaillé, verified
// addresses, etc.). Type unique avec champs JWT-only optionnels — le
// caller fait le narrowing par présence (ex: `payload.mail !== undefined`).
//
// Chaque clé "data" est exposée à la fois en snake_case (canonique
// actuelle, alignée sur AccountsSelect / Record API) ET camelCase
// (rétro-compat Node-RED legacy `function 254`). Les versions camelCase
// sont marquées @deprecated mais resteront servies indéfiniment tant que
// des clients legacy les consomment. Les champs `id`, `type`, `name`,
// `currency`, `timezone`, `language`, `mail`, `kyc` sont mono-casse
// (single-word ou objet imbriqué).

export type AccountReadVerifiedAddress = {
  address: string;
  walletConfig?: unknown;
};

export type AccountReadKyc = {
  status: string | null;
  type: string | null;
};

export type AccountReadResponse = {
  // ─── Toujours présent (api-key + JWT) ────────────────────────────────
  id: string;
  name: string;
  currency: string | null;
  language: string | null;
  invoice_key: string;
  is_onchain_available: boolean;
  is_lightning_available: boolean;
  is_atm: boolean;
  has_kyc: boolean;
  logo_asset_id: string | null;

  // camelCase legacy (toujours présents).
  /** @deprecated Use `invoice_key`. */
  apiKey: string;
  /** @deprecated Use `invoice_key`. */
  invoiceKey: string;
  /** @deprecated Use `is_onchain_available`. */
  isOnchainAvailable: boolean;
  /** @deprecated Use `is_lightning_available`. */
  isLightningAvailable: boolean;
  /** @deprecated Use `is_atm`. */
  isAtm: boolean;
  /** @deprecated Use `has_kyc`. */
  hasKyc: boolean;
  /** @deprecated Use `logo_asset_id`. */
  logoAssetId: string | null;

  // ─── Mode JWT uniquement ─────────────────────────────────────────────
  type?: string;
  timezone?: string | null;
  mail?: string | null;
  wallet_id?: string;
  machine_name?: string;
  bank_currency?: string | null;
  bank_id?: string | null;
  btc_percent?: number | null;
  is_checkout_secure?: boolean;
  is_swiss?: boolean;
  deposit_address?: string | null;
  deposit_rate?: string | null;
  default_vat?: number | null;
  verified_addresses?: AccountReadVerifiedAddress[];
  iban_list?: string[];
  referral_code?: string | null;
  referred_by?: string | null;
  fees_from_referrals?: number | null;
  created_at?: number;
  updated_at?: number;
  /**
   * `true` si l'HMAC est configuré pour ce compte, `false` sinon. Le
   * secret en clair n'est jamais exposé via cet endpoint.
   */
  hmac_secret?: boolean;
  // `null` quand l'account n'a aucun row dans la table `kyc` (pas de
  // session iDenfy démarrée). `undefined` en mode api-key (mode partiel).
  kyc?: AccountReadKyc | null;

  // camelCase legacy (JWT uniquement) ──────────────────────────────────
  /** @deprecated Use `wallet_id`. */
  walletId?: string;
  /** @deprecated Use `machine_name`. */
  machineName?: string;
  /** @deprecated Use `bank_currency`. */
  bankCurrency?: string | null;
  /** @deprecated Use `bank_id`. */
  bankId?: string | null;
  /** @deprecated Use `btc_percent`. */
  btcPercent?: number | null;
  /** @deprecated Use `is_checkout_secure`. */
  isCheckoutSecure?: boolean;
  /** @deprecated Use `is_swiss`. */
  isSwiss?: boolean;
  /** @deprecated Use `deposit_address`. */
  depositAddress?: string | null;
  /** @deprecated Use `deposit_rate`. */
  depositRate?: string | null;
  /** @deprecated Use `default_vat`. */
  defaultVat?: number | null;
  /** @deprecated Use `verified_addresses`. */
  verifiedAddresses?: AccountReadVerifiedAddress[];
  /** @deprecated Use `iban_list`. */
  ibanList?: string[];
  /** @deprecated Use `referral_code`. */
  referralCode?: string | null;
  /** @deprecated Use `referred_by`. */
  referredBy?: string | null;
  /** @deprecated Use `fees_from_referrals`. */
  feesFromReferrals?: number | null;
  /** @deprecated Use `created_at`. */
  createdAt?: number;
  /** @deprecated Use `updated_at`. */
  updatedAt?: number;
  /** @deprecated Use `hmac_secret`. */
  hmacSecret?: boolean;

  // Bank details MtPelerin (JWT uniquement, best-effort si MTP est down).
  // Exposé à la fois en snake_case et camelCase.
  iban?: string | null;
  bank_reference?: string | null;
  owner_name?: string | null;
  owner_address?: string | null;
  owner_complement?: string | null;
  owner_city?: string | null;
  owner_country?: string | null;
  owner_zip?: string | null;
  /** @deprecated Use `bank_reference`. */
  bankReference?: string | null;
  /** @deprecated Use `owner_name`. */
  ownerName?: string | null;
  /** @deprecated Use `owner_address`. */
  ownerAddress?: string | null;
  /** @deprecated Use `owner_complement`. */
  ownerComplement?: string | null;
  /** @deprecated Use `owner_city`. */
  ownerCity?: string | null;
  /** @deprecated Use `owner_country`. */
  ownerCountry?: string | null;
  /** @deprecated Use `owner_zip`. */
  ownerZip?: string | null;
  error_bank?: boolean;
  /** @deprecated Use `error_bank`. */
  errorBank?: boolean;
};
