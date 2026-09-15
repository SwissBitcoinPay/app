// AUTO-GENERATED — do not edit. Run `npm run gen:types` to refresh.

/**
 * This interface was referenced by `ApipaymentsSelect`'s JSON-Schema
 * via the `definition` "device".
 */
export type Device = {
  appVersion?: string;
  deviceName?: string;
  name: string;
  type: string;
} & Device1;
export type Device1 = null | {
  appVersion?: string;
  deviceName?: string;
  name: string;
  type: string;
};
/**
 * This interface was referenced by `ApipaymentsSelect`'s JSON-Schema
 * via the `definition` "extra".
 */
export type Extra = null | {
  [k: string]: unknown;
};
/**
 * This interface was referenced by `ApipaymentsSelect`'s JSON-Schema
 * via the `definition` "input".
 */
export type Input = {
  amount: number;
  unit: string;
} & Input1;
export type Input1 = null | {
  amount: number;
  unit: string;
};
/**
 * This interface was referenced by `ApipaymentsSelect`'s JSON-Schema
 * via the `definition` "output".
 */
export type Output = {
  address?: string;
  feesAmount: string | number;
  feesPercent: string | number;
  gross: string | number;
  hash?: string;
  net: string | number;
  orderId?: string;
  partner?: string;
  percent: number;
  pr?: string;
  preimage?: string;
  satsSent?: number;
  unit:
    | "sat"
    | "AED"
    | "AFN"
    | "ALL"
    | "AMD"
    | "ANG"
    | "AOA"
    | "ARS"
    | "AUD"
    | "AWG"
    | "AZN"
    | "BAM"
    | "BBD"
    | "BDT"
    | "BGN"
    | "BHD"
    | "BIF"
    | "BMD"
    | "BND"
    | "BOB"
    | "BRL"
    | "BSD"
    | "BTN"
    | "BWP"
    | "BYN"
    | "BZD"
    | "CAD"
    | "CDF"
    | "CHF"
    | "CLF"
    | "CLP"
    | "CNY"
    | "COP"
    | "CRC"
    | "CUC"
    | "CUP"
    | "CVE"
    | "CZK"
    | "DJF"
    | "DKK"
    | "DOP"
    | "DZD"
    | "EGP"
    | "ERN"
    | "ETB"
    | "EUR"
    | "FJD"
    | "FKP"
    | "GBP"
    | "GEL"
    | "GHS"
    | "GIP"
    | "GMD"
    | "GNF"
    | "GTQ"
    | "GYD"
    | "HKD"
    | "HNL"
    | "HRK"
    | "HTG"
    | "HUF"
    | "IDR"
    | "ILS"
    | "INR"
    | "IQD"
    | "IRR"
    | "ISK"
    | "JMD"
    | "JOD"
    | "JPY"
    | "KES"
    | "KGS"
    | "KHR"
    | "KMF"
    | "KPW"
    | "KRW"
    | "KWD"
    | "KYD"
    | "KZT"
    | "LAK"
    | "LBP"
    | "LKR"
    | "LRD"
    | "LSL"
    | "LYD"
    | "MAD"
    | "MDL"
    | "MGA"
    | "MKD"
    | "MMK"
    | "MNT"
    | "MOP"
    | "MUR"
    | "MVR"
    | "MWK"
    | "MXN"
    | "MYR"
    | "MZN"
    | "NAD"
    | "NGN"
    | "NIO"
    | "NOK"
    | "NPR"
    | "NZD"
    | "OMR"
    | "PAB"
    | "PEN"
    | "PGK"
    | "PHP"
    | "PKR"
    | "PLN"
    | "PYG"
    | "QAR"
    | "RON"
    | "RSD"
    | "RUB"
    | "RWF"
    | "SAR"
    | "SBD"
    | "SCR"
    | "SDG"
    | "SEK"
    | "SGD"
    | "SLL"
    | "SOS"
    | "SRD"
    | "SVC"
    | "SYP"
    | "SZL"
    | "THB"
    | "TJS"
    | "TMT"
    | "TND"
    | "TOP"
    | "TRY"
    | "TTD"
    | "TWD"
    | "TZS"
    | "UAH"
    | "UGX"
    | "USD"
    | "UYU"
    | "UZS"
    | "VND"
    | "VUV"
    | "WST"
    | "XAF"
    | "XAU"
    | "XCD"
    | "XDR"
    | "XOF"
    | "XPF"
    | "YER"
    | "ZAR"
    | "ZMW"
    | "ZWL";
}[];
/**
 * This interface was referenced by `ApipaymentsSelect`'s JSON-Schema
 * via the `definition` "payment_details".
 */
export type PaymentDetails =
  | null
  | {
      address?: string;
      amount?: number;
      confirmations?: number;
      hash?: string;
      minConfirmations?: number;
      network: "lightning" | "onchain";
      paidAt?: number;
      paymentRequest?: string;
      preimage?: string;
      txId?: string;
      vout_index?: number;
    }[];
/**
 * @minItems 1
 * @maxItems 1
 *
 * This interface was referenced by `ApipaymentsSelect`'s JSON-Schema
 * via the `definition` "payout".
 */
export type Payout =
  | null
  | [
      {
        address?: string;
        bankId?: string;
        feesAmount?: string | number;
        feesPercent?: string | number;
        gross: string | number;
        iban?: string;
        net: string | number;
        network?: "onchain" | "lightning" | "SEPA" | "SIC" | "SWIFT";
        partner?: string;
        pr?: string;
        preimage?: string;
        txId?: string;
        unit:
          | "sat"
          | "AED"
          | "AFN"
          | "ALL"
          | "AMD"
          | "ANG"
          | "AOA"
          | "ARS"
          | "AUD"
          | "AWG"
          | "AZN"
          | "BAM"
          | "BBD"
          | "BDT"
          | "BGN"
          | "BHD"
          | "BIF"
          | "BMD"
          | "BND"
          | "BOB"
          | "BRL"
          | "BSD"
          | "BTN"
          | "BWP"
          | "BYN"
          | "BZD"
          | "CAD"
          | "CDF"
          | "CHF"
          | "CLF"
          | "CLP"
          | "CNY"
          | "COP"
          | "CRC"
          | "CUC"
          | "CUP"
          | "CVE"
          | "CZK"
          | "DJF"
          | "DKK"
          | "DOP"
          | "DZD"
          | "EGP"
          | "ERN"
          | "ETB"
          | "EUR"
          | "FJD"
          | "FKP"
          | "GBP"
          | "GEL"
          | "GHS"
          | "GIP"
          | "GMD"
          | "GNF"
          | "GTQ"
          | "GYD"
          | "HKD"
          | "HNL"
          | "HRK"
          | "HTG"
          | "HUF"
          | "IDR"
          | "ILS"
          | "INR"
          | "IQD"
          | "IRR"
          | "ISK"
          | "JMD"
          | "JOD"
          | "JPY"
          | "KES"
          | "KGS"
          | "KHR"
          | "KMF"
          | "KPW"
          | "KRW"
          | "KWD"
          | "KYD"
          | "KZT"
          | "LAK"
          | "LBP"
          | "LKR"
          | "LRD"
          | "LSL"
          | "LYD"
          | "MAD"
          | "MDL"
          | "MGA"
          | "MKD"
          | "MMK"
          | "MNT"
          | "MOP"
          | "MUR"
          | "MVR"
          | "MWK"
          | "MXN"
          | "MYR"
          | "MZN"
          | "NAD"
          | "NGN"
          | "NIO"
          | "NOK"
          | "NPR"
          | "NZD"
          | "OMR"
          | "PAB"
          | "PEN"
          | "PGK"
          | "PHP"
          | "PKR"
          | "PLN"
          | "PYG"
          | "QAR"
          | "RON"
          | "RSD"
          | "RUB"
          | "RWF"
          | "SAR"
          | "SBD"
          | "SCR"
          | "SDG"
          | "SEK"
          | "SGD"
          | "SLL"
          | "SOS"
          | "SRD"
          | "SVC"
          | "SYP"
          | "SZL"
          | "THB"
          | "TJS"
          | "TMT"
          | "TND"
          | "TOP"
          | "TRY"
          | "TTD"
          | "TWD"
          | "TZS"
          | "UAH"
          | "UGX"
          | "USD"
          | "UYU"
          | "UZS"
          | "VND"
          | "VUV"
          | "WST"
          | "XAF"
          | "XAU"
          | "XCD"
          | "XDR"
          | "XOF"
          | "XPF"
          | "YER"
          | "ZAR"
          | "ZMW"
          | "ZWL";
        vout_index?: number;
      }
    ];
/**
 * This interface was referenced by `ApipaymentsSelect`'s JSON-Schema
 * via the `definition` "webhook".
 */
export type Webhook = {
  body?:
    | string
    | {
        [k: string]: unknown;
      }
    | unknown[]
    | number
    | boolean
    | null;
  headers?: {
    [k: string]: string;
  };
  url: string;
} & Webhook1;
export type Webhook1 = null | {
  body?:
    | string
    | {
        [k: string]: unknown;
      }
    | unknown[]
    | number
    | boolean
    | null;
  headers?: {
    [k: string]: string;
  };
  url: string;
};

export interface ApipaymentsSelect {
  aml_info_status?: null | string;
  amount_sat: number;
  created_at: number;
  description?: null | string;
  device?: Device;
  expires_at?: null | number;
  extra?: Extra;
  fee_msat: number;
  id: string;
  input?: Input;
  next_rate_refresh_at?: null | number;
  output: Output;
  paid_at?: null | number;
  payment_details?: PaymentDetails;
  payout?: Payout;
  redirect_url?: null | string;
  status: string;
  tag?: null | string;
  title?: null | string;
  updated_at: number;
  wallet_id: string;
  webhook?: Webhook;
  [k: string]: unknown;
}
