// AUTO-GENERATED — do not edit. Run `npm run gen:types` to refresh.

/**
 * This interface was referenced by `AccountsUpdate`'s JSON-Schema
 * via the `definition` "iban_list".
 */
export type IbanList = string[];
/**
 * This interface was referenced by `AccountsUpdate`'s JSON-Schema
 * via the `definition` "verified_addresses".
 */
export type VerifiedAddresses = {
  displayAddress: string;
  hash?: string;
  message?: string;
  pr?: string;
  preimage?: string;
  signAddress: string;
  signature?: string;
  verified: boolean;
  walletConfig?: {
    account?: string;
    fingerprint?: string;
    label?: string;
    path?: string;
    type?: string;
    zpub?: string;
  };
}[];

export interface AccountsUpdate {
  bank_currency?: null | string;
  bank_id?: null | string;
  btc_percent?: number;
  created_at?: number;
  currency?: null | string;
  default_vat?: null | number;
  deleted_at?: null | number;
  deposit_address?: null | string;
  deposit_rate?: null | string;
  fee_percent_override?: null | number;
  fees_from_referrals?: null | number;
  iban_list?: IbanList;
  id?: string;
  is_checkout_secure?: boolean;
  is_lightning_available?: boolean;
  is_onchain_available?: boolean;
  is_swiss?: boolean;
  language?: null | string;
  logo_asset_id?: null | string;
  machine_name?: string;
  name?: string;
  referral_code?: null | string;
  referred_by?: null | string;
  timezone?: null | string;
  type?: string;
  underpaid_tolerance_bps?: number;
  updated_at?: number;
  verified_addresses?: VerifiedAddresses;
  wallet_id?: string;
  [k: string]: unknown;
}
