import { getPaymentLinkOrigin } from "./payment-links";

/**
 * The card relay a BoltCard is paired with unless its holder chooses another ("Advanced
 * settings"): run by sattle.me, open source (sattleme/relay), it holds no key and no funds. The
 * same host for both variants.
 *
 * DEFINITIVE: this host is written into every card paired with it (`lnurlw://<host>/w?p=…&c=…`,
 * src/lib/card/), and a point of sale reads it from the card at each tap. Changing it would leave
 * every such card calling a host that no longer answers, until its holder reprograms it. Never
 * change it.
 */
export const DEFAULT_CARD_RELAY_HOST = "relay.sattle.me";

/**
 * The card relay's source (sattleme/relay): what a holder runs to host a relay of their own, then
 * enters in "Change relay". Linked from "Change relay" in the app (RelayPanel.tsx) and from "Relay
 * and programming" in the web app (RelayWebPanel.tsx).
 */
export const CARD_RELAY_SOURCE_URL = "https://github.com/sattleme/relay";

/** The relay contract the app speaks (`GET /v1/info` must announce it). */
export const CARD_RELAY_PROTOCOL = 2;

/** Per request to a card relay, response body included. */
export const CARD_RELAY_TIMEOUT_MS = 10_000;

/**
 * Tap hashes the phone keeps on the relay ahead of the card's counter (about 1 000), deposited
 * again once fewer than CARD_HASHES_REFILL_BELOW are left: a card works at
 * the point of sale for that many taps without the phone, and a hash is deposited at most twice
 * ahead (the relay's cap is 2 048 waiting, contract v2).
 */
export const CARD_HASHES_AHEAD = 1000;
export const CARD_HASHES_REFILL_BELOW = 500;

/** Contract v2: hashes per `POST /v1/channel/hashes`, and waiting per channel. */
export const CARD_RELAY_MAX_HASHES_PER_POST = 1024;
export const CARD_RELAY_MAX_PENDING = 2048;

/**
 * The highest ceiling of a card payment (1 BTC, as over 24 hours): the most the relay lets a point
 * of sale ask for a tap (its `maxWithdrawable` since sattleme/relay 2.1.0, docs/card-relay.md).
 * An older relay announces 100 000 sats: a point of sale then asks no more, whatever the card's
 * limits.
 */
export const MAX_CARD_PAYMENT_SATS = 100_000_000n;

/**
 * The least a card payment can be: LUD-03's `minWithdrawable` of the relay, 1 000 msat. The relay's
 * bounds, 1 000 msat to 1 BTC, are the protocol's (contract v2): an invoice out of them is refused,
 * whatever the card's limits.
 */
export const MIN_CARD_PAYMENT_SATS = 1n;

/*
 * A card's limits at its pairing (the card pays without confirmation, its limits bound what a
 * dishonest relay could make it pay: cautious defaults). The holder changes them in "Cards",
 * within the highest values below.
 */
export const DEFAULT_CARD_PAYMENT_SATS = 20_000n;
export const DEFAULT_CARD_DAY_SATS = 50_000n;
export const DEFAULT_CARD_PAYMENTS_PER_HOUR = 5;

/**
 * The highest limit of a card's payments over 24 sliding hours (1 BTC), and of its payments per
 * hour.
 */
export const MAX_CARD_DAY_SATS = 100_000_000n;
export const MAX_CARD_PAYMENTS_PER_HOUR = 60;

/**
 * How long a tap's session lives on the relay before the point of sale sends its invoice (contract
 * v2: 60 s after the tap). A wake packet older than this is of no use, and the phone stops waiting
 * for the invoice after it.
 */
export const CARD_SESSION_LIFETIME_MS = 60_000;

/**
 * How long the card relay makes the point of sale wait for the phone's answer, once it sent its
 * invoice (sattleme/relay 2.1.0: a minute for the holder, and time for the answer
 * to come back).
 */
export const CARD_RELAY_WAIT_MS = 65_000;

/**
 * How long the app's own point of sale waits for a card's service (BoltCardReader): the relay's
 * wait, which the relay counts from when the request reaches it, and time for the request and the
 * answer to travel: it never gives up before the relay answered.
 */
export const CARD_POS_WAIT_MS = CARD_RELAY_WAIT_MS + 10_000;

/**
 * How long after the point of sale's invoice the phone answers at the latest (a minute for the
 * holder to confirm, the payee's verify URL included), within what the
 * relay says the point of sale still waits (its `waitMs`, relay 2.1.0), CARD_ANSWER_MARGIN_MS kept
 * off it. Past it, nothing starts leaving: a payment the holder has not confirmed by then is
 * refused, and the wallet has the rest of the relay's wait to send one that is leaving.
 */
export const CARD_ANSWER_MS = 60_000;

/**
 * What the phone keeps off the relay's `waitMs`: the answer must reach the relay before the point
 * of sale stops waiting, else a payment leaving then would be paid while the point of sale shows a
 * failure.
 */
export const CARD_ANSWER_MARGIN_MS = 5_000;

/**
 * The answer's time with a relay that does not say how long the point of sale waits (before 2.1.0:
 * it waited 30 s).
 */
export const CARD_ANSWER_LEGACY_MS = 25_000;

/**
 * How long a card payment waits for each of the account's relays to tell the cards' states and
 * whom they pay without asking, as the web app or another phone may have changed them (a card
 * suspended or disabled, a merchant removed). Without the card's state, or whom it pays without
 * asking, from a majority of them by then, nothing is paid without asking (a pause made on the
 * web app holds at the next tap, the app open or closed): the
 * holder is asked. Taken from the answer's time, beside the payee's check (up to 5 s,
 * payee-proof.ts).
 */
export const CARD_FRESH_READ_MS = 3_000;

/**
 * How much longer the read as a whole is waited for (its answers merged and kept): each relay has
 * CARD_FRESH_READ_MS, so that one that never answers leaves the others' answers time to decide.
 */
export const CARD_FRESH_READ_SLACK_MS = 1_000;

/** A read or a write of the cards' records, per relay, connection included. */
export const CARD_RECORD_TIMEOUT_MS = 10_000;

/**
 * How long a card payment waits for the card's wallet's balance once the SDK's first sync has
 * ended (Wallet.getBalance), to refuse a payment it cannot hold ("card balance too low")
 * rather than fail at the wallet. The wallet connects as the tap is checked: synced by then, most
 * often. Past it, the balance its storage holds decides. Before its holder is asked, as long for a
 * balance read after a sync that reached the network, proving the card short of the invoice
 * (payment.ts, provenShort): past it, the holder is asked, refused still if it comes while asked.
 * Taken from the answer's time. Not measured on a device.
 */
export const CARD_BALANCE_READ_MS = 5_000;

/**
 * How long "Delete the card" waits for the card's wallet to connect and sync, to find it empty
 * before anything changes (manage.ts): past it, the card is not deleted. "Cards" waits as long
 * for the wallet of a deleted card (erased-funds.ts): past it, nothing is said of it. Not measured
 * on a device.
 */
export const CARD_WALLET_CHECK_MS = 60_000;

/**
 * Open-app mode without notifications (contract v2: `GET /v1/channel/pending`): how often the phone
 * reads its cards' pending wake packets while the app shows with the account open.
 */
export const CARD_PENDING_POLL_MS = 5_000;

/**
 * How long the phone waits for its Expo push token (src/features/card/push.ts): past it, a card is
 * paired without notifications, paid in open-app mode until a later app start gets the token.
 * Expo's docs say the token can be slow on iOS (Android asks none: its card socket wakes it). Not
 * measured on a device.
 */
export const CARD_PUSH_TOKEN_TIMEOUT_MS = 15_000;

/**
 * Whether an iPhone's notification service extension pays a card's taps with the app closed
 * (docs/ios-card-payments.md, src/lib/engine/card-wake.ts). Off: no iPhone keeps a card's pass
 * (src/features/card/card-passes.ts), the extension takes no tap, every tap with the app closed
 * waits for the app. On, in a build whose extension shares an app group with the app only.
 */
export const IOS_EXTENSION_PAYS_CARDS: boolean = true;

/**
 * A card wake's task (Android, src/features/card/background-wake.ts) follows its payment this long
 * at most: past it, a payment still running is let go and the task ends. The point of sale waits
 * 65 s at most (CARD_RELAY_WAIT_MS), a payment sent is followed 2 minutes (FOLLOW_FOR_MS): only a
 * send that never comes back lasts longer.
 */
export const CARD_WAKE_MAX_MS = 240_000;

/**
 * Migrating a v2 card (src/features/card/migration.ts): how long the drain of its balance waits for
 * the card's own wallet to receive the Lightning payment, synced with the network, before the card
 * is erased and re-encoded. The card is NEVER erased until its wallet has received the sats: past
 * this, the migration fails without touching the card (its v2 balance is untouched). Not measured
 * on a device.
 */
export const CARD_MIGRATION_RECEIVE_MS = 120_000;

/**
 * The description of the invoice a v2 card's migration makes for its balance to its own wallet
 * (src/features/card/migration.ts): the card's wallet keeps it with the payment it received, which
 * is how "History" tells that top-up from others, and leaves it out with the payment the v2
 * card's history shows for it (src/features/card/history-view.ts: the transfer shows nowhere in
 * the app). IRREVERSIBLE: the migrated cards' wallets hold it; never change it.
 */
export const CARD_MIGRATION_INVOICE_DESCRIPTION = "sattle.me card migration";

/**
 * How far apart the transfer of a v2 card's balance may show in its v2 history and in its new
 * wallet (history-view.ts): the v2 server dates it when its node paid, the wallet when it received,
 * the migration waiting CARD_MIGRATION_RECEIVE_MS at most between both. An hour: far beyond.
 */
export const CARD_MIGRATION_TRANSFER_WINDOW_MS = 60 * 60 * 1000;

/** How often the drain re-syncs the card's wallet while it waits for the payment. */
export const CARD_MIGRATION_RECEIVE_POLL_MS = 2_000;

/**
 * The host of the v2 card service, the only one a v2 card's tap is sent to by the migration
 * (src/lib/card/legacy-card.ts): its LNURL-withdraw (the balance's transfer) and its reset of a v2
 * card (src/lib/card/legacy-reset.ts), whose keys only that server holds.
 */
export const LEGACY_CARD_HOST = "api.swiss-bitcoin-pay.ch";

/**
 * Per request of a v2 card's reset (src/lib/card/legacy-reset.ts): the card is held to the phone
 * meanwhile, through four requests in a row. Not measured on a device.
 */
export const LEGACY_CARD_RESET_TIMEOUT_MS = 10_000;

/**
 * The host of the link printed on the v2 cards (`https://sbpc.ch/<number>`, the card's printed
 * number: src/lib/card/legacy-link.ts): scanned, it opens the app on that card, or on "Add a
 * card". The app claims its links (app.config.ts, which cannot import this file:
 * LEGACY_CARD_LINK_HOST there, the same, app-config.test.ts); the host serves the association
 * files. The app never sends it anything.
 *
 * DEFINITIVE: printed on cards in their holders' hands. Never change it.
 */
export const LEGACY_CARD_LINK_HOST = "sbpc.ch";

/**
 * The only host a v2 card's visual is downloaded from, once, at its migration
 * (src/lib/card/legacy-visual.ts): the CDN of the v2
 * server, `cdn.<BASE_DOMAIN>`.
 */
export const LEGACY_CARD_IMAGE_HOST = "cdn.swiss-bitcoin-pay.ch";

/**
 * How the v2 service's callback begins its refusal of a card payment above what the card may still
 * spend within 24 hours ("Daily spending limit
 * exceeded (max 1'000 CHF per 24h)"), said before anything is paid, its reservation released. A
 * v2 card's migration then stops, the card not erased (src/features/card/migration.ts).
 */
export const LEGACY_DAILY_LIMIT_REASON = "Daily spending limit exceeded";

/**
 * The v2 service's callback's whole answer when its Lightning node gave up on a card payment for
 * good for want of a route ("no_route"): said only
 * after the node's terminal failure, its reservation released, nothing paid. A v2 card's migration
 * then stops on "Balance not transferred", the card not erased (src/features/card/migration.ts).
 * Its sibling "Payment failed" proves nothing: the server also answers it when its link to its
 * node broke mid-payment.
 */
export const LEGACY_NO_ROUTE_REASON = "no_route";

/**
 * How long a Lightning invoice to a card's wallet can be paid ("Top up" by "Lightning invoice"):
 * 24 hours. Asked of the SDK, whose default is 30 days (0.28.4),
 * and read back from the invoice before it shows.
 */
export const CARD_INVOICE_EXPIRY_SECS = 24 * 3600;

/**
 * While an invoice to a card's wallet shows, how often the card's wallet's payments are read for its
 * own (its payment said as soon as it comes). The SDK claims it on
 * its own while connected; only its storage is read.
 */
export const CARD_INVOICE_POLL_MS = 2_000;

/** "Add a card" in the app (src/app/(app)/cards/pair.tsx). */
export const CARD_ADDING_PATH = "/cards/pair";

/** "Cards" in the app (src/app/(app)/cards/index.tsx), where the code of OnPhoneSteps.tsx leads. */
export const CARDS_PATH = "/cards";

/**
 * Where the codes of the web app's card panels lead the phone ("Add a card",
 * AddCardDialog.tsx; "Cards", OnPhoneSteps.tsx): the web app of the build's variant, as
 * invitation and payment links, whose links the apps open themselves. Null in a
 * build without a web app (no RP ID: local, CI).
 */
export function getCardAddingOrigin(): string | null {
  return getPaymentLinkOrigin();
}

/**
 * While "Add a card" shows on a computer, how often the account's cards are read again
 * from its relays: the card added on the phone then shows here on its own.
 */
export const CARD_ADDED_READ_MS = 5_000;
