import type { PayoutCurrency } from "./payout-currencies";

/*
 * "Sell" through Mt Pelerin: what the app asks of it and with what. The
 * production app talks to Mt Pelerin, the staging app to its dev/test environment
 * (src/lib/mtpelerin/environment.ts).
 */

/**
 * Mt Pelerin's production environment, the production app's. It receives the device's IP
 * address and what the merchant sends: phone number, e-mail, Lightning address, bank accounts
 * (their IBAN, holder's name and address) and its sales (privacy policy notes).
 */
export const MTPELERIN_URL = "https://api.mtpelerin.com";

/**
 * Mt Pelerin's dev/test sandbox, the staging app's. Shared and
 * unprotected: what is sent there can be read by anyone with access to it, so fictitious data
 * only. It receives the device's IP address and its requests (privacy policy notes).
 */
export const MTPELERIN_TEST_URL = "https://api-dev.smex.tech";

/**
 * The referrer code posted for every new profile, right before `PUT /persons`. A public code, no
 * secret: an empty one would post no referral at all.
 */
export const MTPELERIN_REFERRAL_CODE = "cN9Kr3vP";

/**
 * `wid`: sattle.me's integration token, sent on every order, which tells Mt Pelerin the order
 * comes from this integration (the referral is the code above). Sent to production and to
 * dev/test, which takes it. No secret: the same token
 * as the widget's `_ctkn` parameter, which a widget's page shows; the secret of an integration is
 * its report key, which the app never holds.
 */
export const MTPELERIN_WID = "354c5694-8798-400c-9139-d4d4e9715fde";

/**
 * The network of the merchant's Lightning address (`network_in` of an order), and its asset:
 * `GET /forms/mtp-config` lists asset 080 (sat) on `lightning_mainnet`. Its symbol
 * and decimals (`currency_in`, `amount_in`'s unit) are read from the configuration, never assumed.
 */
export const LIGHTNING_NETWORK_ID = "lightning_mainnet";
export const LIGHTNING_ASSET = "080";

/**
 * The fields of a Lightning account at Mt Pelerin (`bank_code`, `bank_name`, `currency`), as its
 * example writes them.
 */
export const LIGHTNING_ACCOUNT_FIELDS = {
  bank_code: "BTC",
  bank_name: "Lightning",
  currency: "BTC"
} as const;

/** `deviceInfo.platform` of `POST /devices/add`: the app's name. */
export const DEVICE_PLATFORM = "sattle.me";

/**
 * The languages `language` accepts (the language of Mt Pelerin's e-mails). The app's other
 * language, Finnish, gets English.
 */
export const MTPELERIN_LANGUAGES = ["fr", "en", "de", "it", "es", "pt"] as const;

/**
 * The balance from which "Sell" is offered: Mt Pelerin's 1-sat invoice that proves the Lightning
 * address and its fees, then a sale of a few sats.
 */
export const SELL_MIN_BALANCE_SATS = 10n;

/**
 * The currencies a sale is wired in (`currency_out`), a bank account's currency, chosen by the
 * merchant: the 18 of Mt Pelerin's "Sell crypto" page ("withdraw funds in 18 fiat currencies"),
 * its bank-transfer currencies, the app's payout currencies too (`satisfies`: each has its flag
 * and its name).
 * Written here, never read from Mt Pelerin: no call of its API lists them (`GET /currencies/fiats`
 * refuses a user's token), and those that take a currency do not prove Mt Pelerin wires it (on
 * dev/test, `POST /orders/create` took "BRL" and `PUT /accounts` "XYZ").
 */
export const SELL_CURRENCIES = [
  "AUD",
  "CAD",
  "CHF",
  "CZK",
  "DKK",
  "EUR",
  "GBP",
  "HKD",
  "HUF",
  "JPY",
  "MXN",
  "NOK",
  "NZD",
  "PLN",
  "SEK",
  "SGD",
  "USD",
  "ZAR"
] as const satisfies readonly PayoutCurrency[];

export type SellCurrency = (typeof SELL_CURRENCIES)[number];

/**
 * At most 999 CHF of value per single transfer or per month, and 11,988 CHF a year, fees
 * included: the limits of a profile without identity verification, in centimes. "Sell" verifies
 * no identity itself.
 */
export const SELL_LIMITS_CHF_MINOR = { sale: 99_900, month: 99_900, year: 1_198_800 } as const;

/**
 * What a profile whose identity Mt Pelerin approved may sell, in centimes: "Once a user verifies
 * identity, the CHF 999 limit is lifted and transactions can be made up to CHF 100k per
 * transaction", and a sell's "Max. sell: CHF 100,000 (or equivalent in other currencies)", beyond
 * it Mt Pelerin's OTC service (developers.mtpelerin.com, "Identity verification" and "Off-ramp
 * pricing"); Mt Pelerin's widget too (`MAX_AMOUNT: 1e5`).
 * Neither names a monthly or yearly limit for it, nor whether the fees count: none is told. Past
 * the limits without a verification, the widget only warns an identified person that the origin
 * of the funds may be asked.
 */
export const SELL_LIMITS_IDENTIFIED_CHF_MINOR = { sale: 10_000_000 } as const;

/**
 * The least a sale wires, in the minor units of its currency, never 0: one, 0.01 CHF or EUR, 1 JPY.
 * Mt Pelerin sets no minimum of its own: dev/test took an order of 1 sat for 0 CHF.
 */
export const SELL_MIN_WIRED_MINOR = 1;

/**
 * The split's sale (src/lib/mtpelerin/split.ts): how far back its
 * last sale is looked for among Mt Pelerin's orders, a period at a time from now, each four
 * times the one before: seven days first (a sale made since is found in one read), then back to
 * when the split was set.
 */
export const SPLIT_ORDERS_FIRST_SPAN_MS = 7 * 24 * 60 * 60_000;

/**
 * How long after its rate's lock ended an order of the split's sale without funds at Mt Pelerin is
 * still looked for among the wallet's payments when the sales are listed (flow.ts `orders`): a
 * payment sent in its last minute and told late by Mt Pelerin. Past it, the order sold nothing, as
 * limits.ts already counts an order without funds once its rate ended; the wallet is read for a
 * day of payments at most, never for every order the panel made in the year.
 */
export const SPLIT_UNFUNDED_GRACE_SECONDS = 24 * 3600;

/**
 * What the split's sale leaves in the wallet for the payment's Lightning fees when the balance no
 * longer holds the whole share: a hundredth of the balance, 10 sats at least (the fees are only
 * known once the order's invoice is made; "Sell" has no "sell everything" for that reason).
 */
export const SPLIT_FEE_RESERVE = { percent: 1n, minSats: 10n } as const;

/**
 * The balance from which Mt Pelerin wires a bank account's deferred sells, in centimes of CHF: the
 * equivalent of 50 CHF (Mt Pelerin's figure; the API gives it nowhere). Shown to the merchant
 * only: Mt Pelerin decides the transfer.
 */
export const SPLIT_PAYOUT_THRESHOLD_CHF_MINOR = 5_000;

/**
 * Mt Pelerin's fee on a sale wired at once below its threshold (1 CHF, EUR or GBP, or the
 * equivalent of 1 CHF in other currencies, below the equivalent of 50 CHF; free above), in minor
 * units: 1 of the sale's currency where it is one of
 * `currencies` (all three of two decimals), else the equivalent of 1 CHF; none from
 * `belowChfMinor`, the sale's value in centimes of CHF. Mt Pelerin's, told to the merchant before
 * choosing and taken from what it receives (src/lib/mtpelerin/transfer-fee.ts): the app takes
 * nothing.
 */
export const SELL_TRANSFER_FEE = {
  minor: 100,
  currencies: ["CHF", "EUR", "GBP"],
  belowChfMinor: 5_000
} as const;

/**
 * Where a merchant is identified (KYC or KYB, directly with Mt Pelerin): Mt Pelerin's own app,
 * with the phone number of the login (a profile made by SMS is found again by SMS, on its hosted
 * pages too); a company's file is its KYB (the hosted flow at kyb.mtpelerin.com).
 */
export const MTPELERIN_IDENTITY_URL = "https://app.mtpelerin.com";

/**
 * `reference`: the bank transfer's communication, within 35 characters of `A-Z`, `0-9`, space,
 * `-` and `/`; the same for every sale.
 */
export const SELL_REFERENCE = "SATTLEME";

/**
 * How often a screen that waits for Mt Pelerin reads again, while it shows: the 1-sat invoice's
 * sync (every ~11 minutes), a sale's progress. The app's own pace, never shown as
 * Mt Pelerin's delay.
 */
export const MTPELERIN_POLL_MS = 60_000;

/**
 * Mt Pelerin's sync matches the 1-sat invoices paid over the last 5 days of payments. A
 * payment older than that, its account still `pending_validation`, will never prove it: "Sell"
 * asks for a new invoice rather than waiting for good.
 */
export const VALIDATION_SYNC_WINDOW_MS = 5 * 24 * 60 * 60_000;

/** How long after the last key an amount is estimated: one call per pause, not per key. */
export const SELL_ESTIMATE_DELAY_MS = 600;

/**
 * The sats an estimate is asked for to read Mt Pelerin's price of 1 sat in a currency
 * (`exchangeRate.mid`, the same whatever the amount: 10 000 and 5 000 sats gave 0.00054334 on
 * dev/test). An estimate creates nothing.
 */
export const SELL_RATE_PROBE_SATS = 100_000n;

/** How often "Sell"'s sale reads Mt Pelerin's rate again, while it shows. */
export const SELL_RATE_REFRESH_MS = 60_000;
