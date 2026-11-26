import { LEGACY_CARD_HOST } from "./card";

/*
 * The migration of a v2 merchant (Swiss Bitcoin Pay, SwissBitcoinPay/app 2.7.x, the app this one
 * replaces on the stores) to sattle.me: what
 * the v2 app left on the device, its server, and its wallet.
 */

/**
 * The v2 server, the only host the migration asks: the v2 app's own
 * (`API_ENDPOINT` of its build), which serves the v2 cards too.
 */
export const LEGACY_V2_HOST = LEGACY_CARD_HOST;

/** Per request to the v2 server: the merchant waits on the migration's screen. */
export const LEGACY_V2_TIMEOUT_MS = 15_000;

/**
 * The last day the v2 service takes payments and pays out: its merchant accounts until the first
 * date, its card accounts until the second. ISO dates, shown in the device's locale ("What
 * changes").
 */
export const LEGACY_MERCHANT_SERVICE_END = "2026-12-31";
export const LEGACY_CARD_SERVICE_END = "2027-12-31";

/**
 * The account of the v2 app's own wallet: BIP-84, native SegWit, account 0 of mainnet, without
 * passphrase (SwissBitcoinPay/app, `generateBtcAddress.ts`: `BIP84.fromMnemonic(words, undefined,
 * false).deriveAccount(0)`). Its receive chain (0) is where the v2 server paid it out, a new address
 * each time (the first one without history); its change chain (1) where the v2 app's own sends left
 * their change.
 */
export const LEGACY_WALLET_ACCOUNT_PATH = "m/84'/0'/0'";

/**
 * Unused addresses in a row after which a chain of the v2 wallet is taken to end: BIP-44's gap
 * limit, which the v2 app's wallet read with too (`/v1/transactions/by-address`, 20). The v2 server
 * never leaves a gap: each payout goes to the first address without history.
 */
export const LEGACY_WALLET_GAP_LIMIT = 20;

/**
 * Addresses of the v2 wallet asked at once of the explorer: a wallet paid out daily for a year has
 * some 365 of them to read at its first transfer.
 */
export const LEGACY_WALLET_SCAN_CONCURRENCY = 4;

/**
 * Most addresses read on a chain of the v2 wallet: far above what years of daily payouts made
 * (each payout one address), a bound against an explorer that would say every address is used.
 */
export const LEGACY_WALLET_MAX_ADDRESSES = 5_000;

/**
 * Most coins one transfer spends: a transaction stays far below the network's standard size
 * (100 000 vB; a coin is 68 vB) and the device signs it in a moment. More are moved by the next
 * transfer.
 */
export const LEGACY_WALLET_MAX_INPUTS = 500;

/**
 * Once the v2 wallet was emptied, how often "Wallet" looks again whether the v2 service paid
 * it something since (its last payouts, a till still on the v2 app): at most once in this time.
 */
export const LEGACY_WALLET_WATCH_INTERVAL_MS = 6 * 3600 * 1000;

/**
 * The v2 web apps (SwissBitcoinPay/app on `app.`, the v2 dashboard on `dashboard.`), which
 * send their users to this web app with what the migration needs (handoff.ts). This app sends a
 * browser back to one of them, by its name in the request
 * (`#sbp-from=<name>`), to fetch the hand-off: never to any other origin.
 */
export const LEGACY_V2_WEB_ORIGINS = {
  app: "https://app.swiss-bitcoin-pay.ch",
  dashboard: "https://dashboard.swiss-bitcoin-pay.ch"
} as const;

/** The page of a v2 web app that answers a hand-off's request (handoff.ts). */
export const LEGACY_V2_HANDOFF_PATH = "/sattleme";

/**
 * How long a hand-off's request waits for its answer: the owner may write down the v2 wallet's 12
 * words on the v2 web app meanwhile.
 */
export const LEGACY_V2_HANDOFF_TTL_MS = 30 * 60 * 1000;

/**
 * The comment (LUD-12) of every payout the v2 server makes to a sattle.me Lightning address
 * (its `SATTLEME_PAYOUT_COMMENT`): what the v2
 * account still owed at its migration, and what settled later. Funds of the v2 service, no takings:
 * the split's sale never counts them (src/lib/mtpelerin/split.ts). **Never change** it: the v2
 * server writes it as it is. A payer who wrote it on a payment of their own only keeps that payment
 * out of the split's proposal.
 */
export const LEGACY_PAYOUT_COMMENT = "sbp-v2-migration";
