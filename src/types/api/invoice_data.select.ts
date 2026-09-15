// AUTO-GENERATED — do not edit. Run `npm run gen:types` to refresh.

/**
 * This interface was referenced by `InvoiceDataSelect`'s JSON-Schema
 * via the `definition` "issuer_address".
 */
export type IssuerAddress = {
  city: string;
  countryCode: string;
  postalCode: string;
  street: string;
} & IssuerAddress1;
export type IssuerAddress1 = null | {
  city: string;
  countryCode: string;
  postalCode: string;
  street: string;
};
/**
 * @minItems 1
 *
 * This interface was referenced by `InvoiceDataSelect`'s JSON-Schema
 * via the `definition` "items".
 */
export type Items =
  | null
  | [
      {
        description: string;
        price: number;
        quantity: number;
        vat?: number;
      },
      ...{
        description: string;
        price: number;
        quantity: number;
        vat?: number;
      }[]
    ];
/**
 * This interface was referenced by `InvoiceDataSelect`'s JSON-Schema
 * via the `definition` "receiver_address".
 */
export type ReceiverAddress = {
  city: string;
  countryCode: string;
  postalCode: string;
  street: string;
} & ReceiverAddress1;
export type ReceiverAddress1 = null | {
  city: string;
  countryCode: string;
  postalCode: string;
  street: string;
};

export interface InvoiceDataSelect {
  account_id: string;
  account_invoice_number: number;
  conditions?: null | string;
  created_at: number;
  description?: null | string;
  external_reference?: null | string;
  issuer_address?: IssuerAddress;
  issuer_email: string;
  issuer_name?: null | string;
  issuer_registration_number?: null | string;
  issuer_vat_number?: null | string;
  items?: Items;
  legal_mentions?: null | string;
  payment_id: string;
  receiver_address?: ReceiverAddress;
  receiver_email?: null | string;
  receiver_email_language?: null | string;
  receiver_name?: null | string;
  receiver_vat_number?: null | string;
  [k: string]: unknown;
}
