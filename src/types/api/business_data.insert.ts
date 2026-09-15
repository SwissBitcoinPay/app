// AUTO-GENERATED — do not edit. Run `npm run gen:types` to refresh.

/**
 * This interface was referenced by `BusinessDataInsert`'s JSON-Schema
 * via the `definition` "address".
 */
export type Address = {
  city: string;
  countryCode: string;
  postalCode: string;
  street: string;
} & Address1;
export type Address1 = null | {
  city: string;
  countryCode: string;
  postalCode: string;
  street: string;
};

export interface BusinessDataInsert {
  account_id?: string;
  address?: Address;
  company_name?: string;
  country_code: string;
  created_at?: number;
  registration_number?: string;
  updated_at?: number;
  vat_no?: null | string;
  [k: string]: unknown;
}
